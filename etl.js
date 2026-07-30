'use strict';
// =====================================================================
//  ETL: 베트남 사격연맹 구글시트(CSV) → 정규화된 레코드셋 + QA 리포트
//
//  사용:
//    node etl.js                 # 기본 CSV(스크래치패드) 사용, dry-run
//    node etl.js <csv경로>       # 로컬 CSV 지정
//    node etl.js --fetch         # 원본 구글시트에서 직접 다운로드
//
//  출력(build/):
//    competitions.json, events.json, athletes.json,
//    affiliations.json, results.json, series.json, qa-report.txt
//
//  DB 적재는 push-supabase.js 가 build/*.json 을 읽어 수행.
// =====================================================================
const fs = require('fs'), path = require('path'), os = require('os'), https = require('https');
const P = require('./lib/parse');
const R = require('./lib/rank');

const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1MATLspvOeL4MFObWUIiYqjKkw-PkEEQ7IqXCw-kRheQ/export?format=csv&gid=1558133737';
const DEFAULT_CSV = path.join(__dirname, 'data', 'shooting.csv');
const BUILD = path.join(__dirname, 'build');
// 시트에 있는 실데이터는 2024(전국선수권)·2025·2026 + 2015/2016 잔여분.
// 하한을 낮춰 존재하는 모든 실기록을 담는다(빈/무명 행은 뒤에서 자동 제외).
const MIN_YEAR = 2000;

// CSV 컬럼 인덱스
const C = {
  year: 0, dates: 1, loc: 2, comp: 3, time: 4, event: 5, dot: 6, be: 7, so: 8,
  id: 10, ho: 11, ten: 12, sinh: 13, dvi: 14, tt: 16,
  s: [17, 18, 19, 20, 21, 22], x: 23, diemK: 25, hcCN: 29, hcDD: 30, cong: 32,
};
const MEDAL = { V: 'gold', B: 'silver', D: 'bronze' };

function fetchCSV(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchCSV(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      let d = ''; res.setEncoding('utf8');
      res.on('data', c => d += c); res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const doFetch = args.includes('--fetch');
  const csvArg = args.find(a => !a.startsWith('--'));

  let raw;
  let sourceLabel;
  if (doFetch) {
    console.log('구글시트에서 다운로드 중...');
    raw = await fetchCSV(SHEET_URL);
    sourceLabel = SHEET_URL;
  } else {
    const csvPath = csvArg || DEFAULT_CSV;
    raw = fs.readFileSync(csvPath, 'utf8');
    sourceLabel = csvPath;
  }

  const rows = P.parseCSV(raw);
  const dataRows = rows.slice(2).filter(r => r[C.year]);
  const qa = [];
  const log = (...a) => { qa.push(a.join(' ')); };

  log('=== ETL QA 리포트 ===');
  log('소스:', sourceLabel);
  log('원본 데이터행:', dataRows.length);

  // ---------- 1차 통과: 권총 결과행 추출 + 종목 파싱 ----------
  const stats = { nonPistol: 0, beforeYear: 0, final: 0, partial: 0, unclassified: 0, noName: 0, kept: 0 };
  const recs = [];       // 정제된 결과 원자료
  const domesticUnits = new Set();  // 국내 대회에 등장한 소속 = VN 클럽

  // 대회 scope 판정: 대회명에 국가코드 접미사/국제 키워드
  const isIntlComp = comp => {
    const n = P.norm(comp);
    return /- [a-z]{3}$/.test(n) || /olympic|the gioi|chau a|dong nam a/.test(n) || /- [A-Z]{3}$/.test(comp);
  };

  for (const r of dataRows) {
    const year = +r[C.year];
    if (year < MIN_YEAR) { stats.beforeYear++; continue; }
    const pe = P.parseEvent(r[C.event]);
    if (!pe.ok) { stats.nonPistol++; continue; }
    if (pe.isFinal) { stats.final++; continue; }
    if (pe.isPartial) { stats.partial++; continue; }
    if (!pe.classified) { stats.unclassified++; log('  ★미분류:', r[C.event]); continue; }
    const name = (r[C.ho] + ' ' + r[C.ten]).trim();
    if (!name) { stats.noName++; continue; }

    const series = C.s.map(c => P.num(r[c])).filter(v => v !== null);
    const total = P.num(r[C.cong]);
    const mdt = P.parseMatchDateTime(r[C.time]);
    const idInfo = P.parseId(r[C.id]);
    const unit = (r[C.dvi] || '').trim();
    const comp = r[C.comp].trim();
    const intl = isIntlComp(comp);
    if (!intl && unit) domesticUnits.add(unit);

    recs.push({
      year, comp, intl,
      loc: r[C.loc].trim(), dates: r[C.dates].trim(),
      rawEvent: r[C.event].trim(), pe,
      name, ho: r[C.ho].trim(), ten: r[C.ten].trim(),
      unit,
      sinh: P.num(r[C.sinh]),
      idInfo,
      relay: r[C.dot].trim(), firingPoint: r[C.be].trim(), bib: r[C.so].trim(),
      matchDate: mdt.date, matchTime: mdt.time,
      series, total,
      innerTens: P.num(r[C.x]),
      finalScore: P.num(r[C.diemK]),
      medal: MEDAL[(r[C.hcCN] || '').trim().toUpperCase()] || null,
      // 단체 메달: col30 "HC đồng đội" = 색(V/B/D) + 팀원번호. 색과 번호 분리.
      teamMedal: MEDAL[((r[C.hcDD] || '').trim().toUpperCase()[0]) || ''] || null,
      teamMedalNo: ((r[C.hcDD] || '').match(/\d+/) || [null])[0] != null ? +(r[C.hcDD].match(/\d+/)[0]) : null,
      isDnf: total === null || total === 0,
    });
    stats.kept++;
  }

  log('\n--- 1차 필터 ---');
  Object.entries(stats).forEach(([k, v]) => log(`  ${k}: ${v}`));
  log('  국내 소속코드 수집:', domesticUnits.size);

  // ---------- VIE 중복 제거 ----------
  // 같은 (대회|종목코드|성적서명) 클러스터에서 unit=='VIE' 행이,
  // 같은 클러스터에 VN클럽(비VIE) 행이 있으면 그 VIE 행을 제거.
  // (국제대회에서 VN선수가 VIE + 클럽으로 이중등재되는 현상)
  const sig = x => x.series.join('/') + '|X=' + x.innerTens + '|C=' + x.total;
  const clusters = new Map();
  recs.forEach((x, i) => {
    if (x.total === null || x.total === 0) return; // 0점/기권은 대상 아님
    const k = x.year + '|' + x.comp + '|' + x.pe.code + '|' + sig(x);
    if (!clusters.has(k)) clusters.set(k, []);
    clusters.get(k).push(i);
  });
  const drop = new Set();
  let vieDropped = 0;
  for (const idxs of clusters.values()) {
    if (idxs.length < 2) continue;
    const units = idxs.map(i => recs[i].unit);
    const hasVie = units.includes('VIE');
    const hasClub = idxs.some(i => recs[i].unit !== 'VIE' &&
      (domesticUnits.has(recs[i].unit) || !recs[i].intl));
    if (hasVie && hasClub) {
      idxs.forEach(i => { if (recs[i].unit === 'VIE') { drop.add(i); vieDropped++; } });
    }
  }
  const clean = recs.filter((_, i) => !drop.has(i));
  log('\n--- VIE 중복 제거 ---');
  log('  제거된 VIE 이중등재 행:', vieDropped);
  log('  잔여 결과행:', clean.length);

  // ---------- 이름→출생연도 룩업(ID 기반)으로 결측 보정 ----------
  const nameYear = new Map(); // norm(name)|gender → birthYear
  clean.forEach(x => {
    const g = x.idInfo?.gender;
    const by = x.idInfo?.birthYear;
    if (g && by) nameYear.set(P.norm(x.name) + '|' + g, by);
  });

  // ---------- 국가/소속 판정 & 선수 식별 ----------
  const VN = 'VN';
  const isVNUnit = u => u === 'VIE' || domesticUnits.has(u);
  const athletes = new Map();     // identity_key → athlete
  const affiliations = new Map(); // dedupKey → {akey, unit, year}  (식별키에 '|'가 있어  사용)
  const SEP = '';

  function resolveAthlete(x) {
    // 성별
    let gender = x.idInfo?.gender
      || (x.pe.gender === 'M' ? 'M' : x.pe.gender === 'W' ? 'W' : null);
    // 국적/외국인
    let foreign, nationality;
    if (x.intl && x.unit && !isVNUnit(x.unit)) { foreign = true; nationality = x.unit; }
    else { foreign = false; nationality = VN; }
    // 출생연도 (타당범위 1940~2016 밖은 오염값으로 보고 무시)
    const plausibleBY = y => (y && y >= 1940 && y <= 2016) ? y : null;
    let birthYear = plausibleBY(x.idInfo?.birthYear) || plausibleBY(x.sinh) || null;
    if (!foreign && !birthYear && gender) {
      birthYear = nameYear.get(P.norm(x.name) + '|' + gender) || null;
    }
    const birthDate = x.idInfo?.birthDate || null;

    // 식별키
    const key = foreign
      ? `${P.norm(x.name)}|${nationality}|${gender || '?'}`
      : `${P.norm(x.name)}|${birthYear || '?'}|${gender || '?'}`;

    if (!athletes.has(key)) {
      athletes.set(key, {
        identity_key: key, full_name: x.name, family_name: x.ho, given_name: x.ten,
        birth_year: birthYear, birth_date: birthDate, gender,
        nationality, is_foreign: foreign,
      });
    } else {
      // 정보 보강(빈 값 채우기)
      const a = athletes.get(key);
      if (!a.birth_year && birthYear) a.birth_year = birthYear;
      if (!a.birth_date && birthDate) a.birth_date = birthDate;
      if (!a.gender && gender) a.gender = gender;
    }
    // 소속 이력
    if (x.unit) {
      const dk = key + '@@' + x.unit + '@@' + x.year;
      if (!affiliations.has(dk)) affiliations.set(dk, { akey: key, unit: x.unit, year: x.year });
    }
    return key;
  }

  clean.forEach(x => { x.athleteKey = resolveAthlete(x); });

  // ---------- 선수 통합(동일인 병합) ----------
  // 같은 (이름+국적) 안에서, 출생연도·성별이 서로 "호환"(같거나 한쪽이 결측)이면
  // 동일인으로 보고 병합. 생년이 다른 동명이인은 각각 유지.
  // 정보가 많은 레코드부터 버킷을 만들어 그리디 배정(성별 교차병합 방지).
  function consolidate() {
    const groups = new Map(); // norm(name)|nationality → [athlete]
    for (const a of athletes.values()) {
      const g = P.norm(a.full_name) + '|' + a.nationality;
      (groups.get(g) || groups.set(g, []).get(g)).push(a);
    }
    const remap = new Map(); // oldKey → canonicalKey
    const info = a => (a.birth_year ? 1 : 0) + (a.gender ? 1 : 0);
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      list.sort((x, y) => info(y) - info(x));
      const buckets = [];
      for (const a of list) {
        let b = buckets.find(b =>
          (!b.by || !a.birth_year || b.by === a.birth_year) &&
          (!b.g || !a.gender || b.g === a.gender));
        if (!b) { b = { by: a.birth_year || null, g: a.gender || null, members: [] }; buckets.push(b); }
        else { b.by = b.by || a.birth_year || null; b.g = b.g || a.gender || null; }
        b.members.push(a);
      }
      for (const b of buckets) {
        const canon = b.members[0];
        canon.birth_year = canon.birth_year || b.by;
        canon.gender = canon.gender || b.g;
        for (const m of b.members) {
          if (m === canon) continue;
          canon.birth_date = canon.birth_date || m.birth_date;
          remap.set(m.identity_key, canon.identity_key);
          athletes.delete(m.identity_key);
        }
      }
    }
    if (remap.size) {
      // 결과행·소속이력의 참조 갱신
      clean.forEach(x => { if (remap.has(x.athleteKey)) x.athleteKey = remap.get(x.athleteKey); });
      for (const [dk, o] of [...affiliations]) {
        if (remap.has(o.akey)) {
          affiliations.delete(dk);
          const nk = remap.get(o.akey) + '@@' + o.unit + '@@' + o.year;
          if (!affiliations.has(nk)) affiliations.set(nk, { akey: remap.get(o.akey), unit: o.unit, year: o.year });
        }
      }
    }
    return remap.size;
  }
  const mergedCount = consolidate();
  log('\n--- 선수 통합 ---');
  log('  병합된 중복 식별:', mergedCount);

  // ---------- 대회/종목 구성 ----------
  const competitions = new Map();  // year|name → comp
  const events = new Map();        // year|name|code → event
  clean.forEach(x => {
    const ckey = x.year + '|' + x.comp;
    if (!competitions.has(ckey)) {
      const dr = P.parseDateRange(x.dates, x.year);
      competitions.set(ckey, {
        key: ckey, year: x.year, name: x.comp,
        date_start: dr.start, date_end: dr.end, location: x.loc,
        scope: x.intl ? 'international' : 'domestic', raw_date_range: x.dates,
      });
    }
    const ekey = ckey + '|' + x.pe.code;
    if (!events.has(ekey)) {
      events.set(ekey, {
        key: ekey, comp_key: ckey, raw_name: x.rawEvent,
        distance: x.pe.distance, discipline: x.pe.discipline, gender: x.pe.gender,
        age_category: x.pe.age, team_type: x.pe.team, event_code: x.pe.code,
        has_final: P.eventHasFinal(x.pe), n_series: x.pe.nSeries,
        _rows: [],
      });
    }
    events.get(ekey)._rows.push(x);
  });

  // ---------- 등위 계산(종목 그룹별) ----------
  let medalMismatch = 0; const mismatchEx = [];
  let seriesSumBad = 0;
  for (const ev of events.values()) {
    const rs = ev._rows.map(x => ({
      _x: x, total: x.total, innerTens: x.innerTens, series: x.series,
      final_score: x.finalScore, is_dnf: x.isDnf, medal: x.medal,
      qual_rank: null, final_rank: null, placement: null,
    }));
    R.assignQualRank(rs, ev.distance);
    if (ev.has_final) R.assignFinalRank(rs);
    R.assignPlacement(rs);
    rs.forEach(o => {
      o._x.qual_rank = o.qual_rank;
      o._x.final_rank = o.final_rank;
      o._x.placement = o.placement;
    });
    // QA: 금메달 = placement 1 인지
    const golds = rs.filter(o => o._x.medal === 'gold');
    golds.forEach(g => {
      if (g.placement && g.placement !== 1) {
        medalMismatch++;
        if (mismatchEx.length < 12) mismatchEx.push(
          `${ev.event_code} @ ${ev.comp_key.split('|')[1]}: 금메달 ${g._x.name} placement=${g.placement}`);
      }
    });
    // QA: 본선 시리즈합 = 총점
    ev._rows.forEach(x => {
      if (x.series.length && x.total && !x.isDnf) {
        const s = x.series.reduce((a, b) => a + b, 0);
        if (Math.abs(s - x.total) > 0.05) seriesSumBad++;
      }
    });
  }

  // ---------- 레코드셋 직렬화(안정 id 부여) ----------
  const compArr = [...competitions.values()];
  compArr.forEach((c, i) => c.id = i + 1);
  const compId = new Map(compArr.map(c => [c.key, c.id]));

  const evArr = [...events.values()];
  evArr.forEach((e, i) => { e.id = i + 1; e.competition_id = compId.get(e.comp_key); });
  const evId = new Map(evArr.map(e => [e.key, e.id]));

  const athArr = [...athletes.values()];
  athArr.forEach((a, i) => a.id = i + 1);
  const athId = new Map(athArr.map(a => [a.identity_key, a.id]));

  const affArr = [...affiliations.values()].map((o, i) => {
    return { id: i + 1, athlete_id: athId.get(o.akey), unit_code: o.unit, year: +o.year };
  });

  const resultsArr = []; const seriesArr = [];
  let sid = 0;
  clean.forEach((x, i) => {
    const rid = i + 1;
    resultsArr.push({
      id: rid,
      event_id: evId.get(x.year + '|' + x.comp + '|' + x.pe.code),
      athlete_id: athId.get(x.athleteKey),
      unit_code: x.unit || null,
      relay: x.relay || null, firing_point: x.firingPoint || null, bib: x.bib || null,
      match_date: x.matchDate, match_time: x.matchTime,
      qual_total: x.total, inner_tens: x.innerTens, final_score: x.finalScore,
      medal: x.medal, team_medal: x.teamMedal, team_medal_no: x.teamMedalNo, qual_rank: x.qual_rank, final_rank: x.final_rank,
      placement: x.placement, is_dnf: x.isDnf, raw_event_name: x.rawEvent,
    });
    x.series.forEach((sc, k) => seriesArr.push({
      id: ++sid, result_id: rid, series_no: k + 1, score: sc,
    }));
  });

  // ---------- QA 요약 ----------
  log('\n--- 구성 결과 ---');
  log('  대회:', compArr.length,
    `(국내 ${compArr.filter(c => c.scope === 'domestic').length} / 국제 ${compArr.filter(c => c.scope === 'international').length})`);
  log('  종목:', evArr.length);
  log('  선수:', athArr.length,
    `(VN ${athArr.filter(a => !a.is_foreign).length} / 외국 ${athArr.filter(a => a.is_foreign).length})`);
  log('  소속이력:', affArr.length);
  log('  성적:', resultsArr.length);
  log('  시리즈:', seriesArr.length);
  log('  메달수여 성적:', resultsArr.filter(r => r.medal).length);
  log('  본선등위 부여:', resultsArr.filter(r => r.qual_rank).length);
  log('  결선점수 보유:', resultsArr.filter(r => r.final_score !== null).length);

  log('\n--- 데이터 품질 ---');
  log('  시리즈합≠총점 (본선):', seriesSumBad);
  log('  금메달인데 placement≠1:', medalMismatch);
  mismatchEx.forEach(e => log('     ', e));

  // 출생연도 결측 (선수 식별 신뢰도)
  const noBY = athArr.filter(a => !a.birth_year);
  log('  출생연도 결측 선수:', noBY.length,
    `(VN ${noBY.filter(a => !a.is_foreign).length} / 외국 ${noBY.filter(a => a.is_foreign).length})`);

  // 소속 2개 이상(이적/겸직)
  const affByAth = {};
  affArr.forEach(a => { (affByAth[a.athlete_id] ||= new Set()).add(a.unit_code); });
  const movers = Object.values(affByAth).filter(s => s.size > 1).length;
  log('  소속 2개 이상 선수(이적·겸직):', movers);

  // 25m half-only 누락 점검: 어떤 (대회,종목코드)에 base행이 0인지
  log('\n--- 25m base 누락 점검(부분행만 있고 base 없는 종목) ---');
  const baseSeen = new Set(evArr.map(e => e.comp_key + '|' + e.event_code));
  const partialOnly = new Map();
  for (const r of dataRows) {
    const year = +r[C.year]; if (year < MIN_YEAR) continue;
    const pe = P.parseEvent(r[C.event]);
    if (!pe.ok || !pe.isPartial || !pe.classified) continue;
    // 이름·점수 있는 실제 결과 부분행만 대상(2024 일정표 껍데기 제외)
    const named = !!(r[C.ho] || r[C.ten]);
    const scored = P.num(r[C.cong]);
    if (!named || !scored) continue;
    const k = year + '|' + r[C.comp].trim() + '|' + pe.code;
    if (!baseSeen.has(k)) partialOnly.set(k, (partialOnly.get(k) || 0) + 1);
  }
  if (partialOnly.size === 0) log('  없음 (실데이터 부분행은 모두 대응 base 존재) OK');
  else [...partialOnly].forEach(([k, n]) => log('  ★누락위험:', k, `(실데이터 부분 ${n}행)`));

  // ---------- 파일 출력 ----------
  fs.mkdirSync(BUILD, { recursive: true });
  const clean_ = arr => arr.map(o => { const c = { ...o }; delete c.key; delete c.comp_key; delete c._rows; return c; });
  fs.writeFileSync(path.join(BUILD, 'competitions.json'), JSON.stringify(clean_(compArr), null, 0));
  fs.writeFileSync(path.join(BUILD, 'events.json'), JSON.stringify(clean_(evArr), null, 0));
  fs.writeFileSync(path.join(BUILD, 'athletes.json'), JSON.stringify(athArr, null, 0));
  fs.writeFileSync(path.join(BUILD, 'affiliations.json'), JSON.stringify(affArr, null, 0));
  fs.writeFileSync(path.join(BUILD, 'results.json'), JSON.stringify(resultsArr, null, 0));
  fs.writeFileSync(path.join(BUILD, 'series.json'), JSON.stringify(seriesArr, null, 0));
  fs.writeFileSync(path.join(BUILD, 'meta.json'), JSON.stringify({
    source: sourceLabel, generated_from_rows: dataRows.length,
    loaded_results: resultsArr.length, dropped_vie: vieDropped,
    min_year: MIN_YEAR,
    generated_at: new Date().toISOString().slice(0, 10),
    counts: { competitions: compArr.length, events: evArr.length, athletes: athArr.length,
      results: resultsArr.length, series: seriesArr.length },
  }, null, 2));

  const rep = qa.join('\n');
  fs.writeFileSync(path.join(BUILD, 'qa-report.txt'), rep, 'utf8');
  console.log(rep);
  console.log('\n[build/ 에 레코드셋 + qa-report.txt 저장 완료]');
}

main().catch(e => { console.error(e); process.exit(1); });
