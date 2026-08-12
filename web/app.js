'use strict';
// =====================================================================
//  검색 UI — 탭: 선수 / 대회별 / 입상실적 / 랭킹
// =====================================================================
const DISC = { air: t('10m 공기권총'), rapid_fire: t('25m 속사권총'), sport: t('25m 스포츠권총'),
  standard: t('25m 표준권총'), centre_fire: t('25m 센터파이어'), pistol_50: t('50m 권총') };
const AGE = { senior: '', junior: t('주니어'), youth: t('유소년'), u16: 'U16', u18: 'U18' };
const MEDAL = { gold: t('금'), silver: t('은'), bronze: t('동') };
const SCOPE = { domestic: t('국내'), international: t('국제') };
const GENDER = { M: t('남'), W: t('여') };
const NOW_YEAR = new Date().getFullYear();

const $ = (s, r = document) => r.querySelector(s);
const el = (t, cls, html) => { const e = document.createElement(t); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const medalBadge = m => m ? `<span class="medal ${m}">${MEDAL[m]}</span>` : '';
const num = v => (v == null || v === '') ? '–' : v;
const ageText = by => by ? `${by}년생 (${NOW_YEAR - by}세)` : '생년 미상';

// 세부 종목 라벨: 거리·종목 + 남자부/여자부/혼성단체부 + 단체 + 연령부
function eventLabel(e) {
  const base = DISC[e.discipline] || e.raw_name || '';
  const p = [];
  if (e.team_type === 'mixed_team') p.push(t('혼성단체부'));
  else {
    if (e.gender === 'M') p.push(t('남자부'));
    else if (e.gender === 'W') p.push(t('여자부'));
    if (e.team_type === 'team') p.push(t('단체'));
  }
  if (e.age_category && e.age_category !== 'senior') p.push(AGE[e.age_category] || e.age_category);
  return base + (p.length ? ' ' + p.join(' ') : '');
}
const placementCell = r => {
  if (r.is_dnf || r.placement == null) return '<span class="dnf">기록없음</span>';
  return `${medalBadge(r.medal)}<b>${r.placement}</b><span class="wi">위</span>`;
};
function periodText(c) {
  const f = d => d ? d.slice(2).replace(/-/g, '.') : '';
  if (c.date_start && c.date_end && c.date_start !== c.date_end)
    return `${f(c.date_start)}–${c.date_end.slice(5).replace('-', '.')}`;
  return f(c.date_start || c.date_end);
}
const mdText = r => r.match_date ? r.match_date.slice(5).replace('-', '.') + (r.match_time ? ' ' + r.match_time : '') : '';

// ---------- 탭 전환 ----------
const views = {};
function show(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
  document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== 'view-' + tab);
  if (tab === 'fav') { Fav.renderTab($('#view-fav')); return; }   // 매번 새로 그림
  if (tab === 'admin') { window.coachApprovals($('#view-admin')); return; }
  if (tab === 'me') { renderMe(); return; }
  if (!views[tab]) { views[tab] = true; init[tab](); }
}
const init = {};

// 홈: 올해 대회 일정
init.home = () => renderHome();
async function renderHome() {
  const box = $('#view-home'), year = new Date().getFullYear();
  const coach = window.APP_ROLE && window.APP_ROLE.role === 'coach' && window.Fav && Fav.count();
  const now = new Date();
  const wd = (window.I18N.lang === 'vi')
    ? ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][now.getDay()]
    : ['일', '월', '화', '수', '목', '금', '토'][now.getDay()];
  const dateStr = window.I18N.lang === 'vi'
    ? `${now.getDate()}/${now.getMonth() + 1}/${year} · ${wd}`
    : `${year}. ${now.getMonth() + 1}. ${now.getDate()} · ${wd}`;
  box.innerHTML =
    `<div class="bc-hero">
       <div class="bc-hero-rings">${window.ringsSVG || ''}</div>
       <div class="bc-hero-txt">
         <div class="bc-kicker">${t('권총 · 베트남 사격연맹')}</div>
         <h2 class="bc-hero-title"><span class="bc-live"></span>${year} ${t('대회 일정')}</h2>
         <div class="bc-hero-date">${dateStr}</div>
         <div class="bc-fresh" id="bc-fresh"></div>
       </div>
     </div>` +
    (coach ? `<div id="home-myath" class="block"></div>` : '') +
    `<div id="home-sched"><div class="muted">${t('불러오는 중…')}</div></div>`;
  showFreshness();
  await buildSchedule($('#home-sched'), year);
  if (coach) renderMyAthletesComps($('#home-myath'), year);
}
// 데이터 신선도(자동 갱신 기준 시각) — 베트남 시간(UTC+7)로 표시
async function showFreshness() {
  const box = $('#bc-fresh'); if (!box) return;
  try {
    const meta = await DB.meta();
    const iso = meta.generated_at_full || (meta.generated_at ? meta.generated_at + 'T00:00:00Z' : null);
    let when = meta.generated_at || '';
    if (iso) {
      const d = new Date(iso); const vn = new Date(d.getTime() + 7 * 3600000);
      const p = n => String(n).padStart(2, '0');
      when = `${vn.getUTCFullYear()}.${p(vn.getUTCMonth() + 1)}.${p(vn.getUTCDate())} ${p(vn.getUTCHours())}:${p(vn.getUTCMinutes())}`;
    }
    const sheet = window.APP_CONFIG && window.APP_CONFIG.sheetUrl;
    box.innerHTML = `<span class="bc-fresh-chip"><span class="bc-dot"></span>${t('자동 갱신')} · ${t('기준')} ${when}</span>` +
      (sheet ? `<a class="bc-sheet" href="${esc(sheet)}" target="_blank" rel="noopener noreferrer">📄 ${t('원본 시트')}</a>` : '');
  } catch (e) { box.remove(); }
}
async function renderMyAthletesComps(box, year) {
  box.innerHTML = `<h3>${t('관리 선수 일정·기록')}</h3><div class="muted">${t('불러오는 중…')}</div>`;
  const favs = Fav.list();
  if (!favs.length) { box.innerHTML = `<h3>${t('관리 선수 일정·기록')}</h3><div class="muted">${t('관리 선수를 즐겨찾기(☆)로 등록하세요.')}</div>`; return; }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const iso = today.toISOString().slice(0, 10);
  const daysTo = d => Math.round((new Date(d + 'T00:00') - today) / 86400000);
  const cards = [];
  for (const it of favs) {
    const a = await DB.athleteByKey(it.key); if (!a) continue;
    const rows = (await DB.athleteCareer(a.id));
    const scored = r => !r.is_dnf && r.qual_total != null;
    // 다가오는·진행 중: 점수 미입력 & 대회 종료일이 오늘 이후 (또는 오늘 진행)
    const upcoming = rows.filter(r => !scored(r) && ((r.competition.date_end || r.competition.date_start || '') >= iso))
      .sort((x, y) => (x.match_date || x.competition.date_start || '').localeCompare(y.match_date || y.competition.date_start || ''));
    // 최근 기록: 올해 점수 있는 결과, 최신순
    const recent = rows.filter(r => scored(r) && r.competition.year === year)
      .sort((x, y) => (y.match_date || y.competition.date_start || '').localeCompare(x.match_date || x.competition.date_start || ''))
      .slice(0, 4);
    cards.push({ a, key: it.key, group: it.group, upcoming, recent });
  }
  // 다가오는 경기가 있는 선수를 위로
  cards.sort((x, y) => (y.upcoming.length ? 1 : 0) - (x.upcoming.length ? 1 : 0));
  const dateS = d => (d || '').slice(5).replace('-', '.');
  const upItem = r => {
    const d = r.match_date || r.competition.date_start;
    const dd = d && d >= iso ? (daysTo(d) === 0 ? 'D-0' : `D-${daysTo(d)}`) : '';
    const status = (r.competition.date_start && r.competition.date_start <= iso) ? t('결과 대기') : t('출전 예정');
    return `<div class="ma-ev up"><span class="ma-when">${dateS(d)}${dd ? ` <b>${dd}</b>` : ''}</span>
      <span class="ma-evn">${esc(eventLabel(r.event))}</span>
      <span class="ma-cmp">${esc(r.competition.name)}</span>
      <span class="ma-st">${status}</span></div>`;
  };
  const recItem = r => {
    const md = r.medal ? medalBadge(r.medal) : '';
    const pl = r.placement ? `${r.placement}${t('위')}` : '';
    return `<div class="ma-ev rec"><span class="ma-when">${dateS(r.match_date || r.competition.date_start)}</span>
      <span class="ma-evn">${esc(eventLabel(r.event))}</span>
      <span class="ma-sc">${md}<b>${num(r.qual_total)}</b>${r.final_score != null ? ` · ${t('결선')} ${r.final_score}` : ''} ${pl}</span></div>`;
  };
  box.innerHTML = `<h3>${t('관리 선수 일정·기록')} <span class="sub2">${cards.length}</span></h3>` +
    cards.map(c => `
      <div class="ma-card">
        <div class="ma-top">
          <button class="lnk ma-name" data-akey="${esc(c.key || '')}">${esc(c.a.full_name)}</button>
          ${c.a.gender ? `<span class="g g-${c.a.gender}">${GENDER[c.a.gender]}</span>` : ''}
          ${c.group ? `<span class="ma-grp">${esc(t(c.group))}</span>` : ''}
        </div>
        <div class="ma-sec-l">📅 ${t('다가오는 경기')}</div>
        ${c.upcoming.length ? c.upcoming.map(upItem).join('') : `<div class="ma-none">${t('예정된 경기 없음')}</div>`}
        <div class="ma-sec-l">🎯 ${t('최근 기록')}</div>
        ${c.recent.length ? c.recent.map(recItem).join('') : `<div class="ma-none">${t('올해 기록 없음')}</div>`}
      </div>`).join('');
  // 선수명 클릭 → 선수 상세로 이동
  box.querySelectorAll('.ma-name[data-akey]').forEach(btn => {
    btn.onclick = async () => {
      const a = await DB.athleteByKey(btn.dataset.akey); if (!a) return;
      show('athlete');
      const detail = $('#ath-detail'), list = $('#ath-list');
      renderCareer({ id: a.id, ...a }, detail, list);
    };
  });
}
const MON = { ko: m => `${m}월`, vi: m => `Th.${m}` };
async function buildSchedule(out, year) {
  let cs = []; try { cs = await DB.competitions(String(year)); } catch (e) { }
  if (!cs.length) { out.innerHTML = `<div class="muted">${t('일정 정보가 없습니다.')}</div>`; return; }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const iso = today.toISOString().slice(0, 10);
  const monLabel = MON[window.I18N.lang] || MON.ko;
  const dchip = d => { const [Y, M, D] = d.split('-'); return `<span class="dc-m">${monLabel(+M)}</span><span class="dc-d">${+D}</span>`; };
  const daysTo = d => Math.round((new Date(d + 'T00:00') - today) / 86400000);
  const clickable = !!window.APP_ROLE;   // 앱(로그인) 상태에서만 상세 이동
  const card = (c, emph) => {
    const s = c.date_start, e = c.date_end || c.date_start;
    const status = (e && e < iso) ? 'past' : (s && s <= iso ? 'now' : 'up');
    const st = status === 'now' ? t('진행중') : status === 'up' ? t('예정') : t('종료');
    const range = s && e && s !== e ? `${s.slice(5).replace('-', '.')}–${e.slice(5).replace('-', '.')}` : (s || '').slice(5).replace('-', '.');
    const dd = status === 'up' && s ? `<span class="dday">D-${daysTo(s)}</span>` : '';
    return `<div class="sched-item ${status}${emph ? ' emph' : ''}${clickable ? ' clickable' : ''}" data-cid="${c.id}">
      <div class="sched-cal ${status}">${dchip(s || e)}</div>
      <div class="sched-body">
        <div class="sched-top"><span class="sd-badge ${status}">${st}</span>${dd}<span class="sd-range">${range}</span></div>
        <div class="sched-name">${esc(c.name)}</div>
        <div class="sched-meta">${esc(c.location || '')} <span class="scope ${c.scope}">${SCOPE[c.scope] || ''}</span>${clickable ? '<span class="sched-go">›</span>' : ''}</div>
      </div></div>`;
  };
  const in4w = new Date(today.getTime() + 28 * 86400000).toISOString().slice(0, 10);   // 4주 이내
  const up = cs.filter(c => (c.date_end || c.date_start || '') >= iso && (c.date_start || c.date_end || '') <= in4w)
    .sort((a, b) => (a.date_start || '').localeCompare(b.date_start || ''));
  const past = cs.filter(c => (c.date_end || c.date_start || '') < iso).sort((a, b) => (b.date_start || '').localeCompare(a.date_start || ''));
  let h = '';
  h += `<div class="sched-sec">${t('다가오는 대회')} <span class="sched-n">${up.length}</span><span class="sched-hint">${t('4주 이내')}</span></div>`;
  h += up.length ? `<div class="sched-grid up">${up.map(c => card(c, true)).join('')}</div>` : `<div class="muted" style="text-align:left">${t('4주 이내 예정 대회가 없습니다.')}</div>`;
  if (past.length) h += `<div class="sched-sec past">${t('지난 대회')} <span class="sched-n">${past.length}</span></div><div class="sched-grid">${past.map(c => card(c, false)).join('')}</div>`;
  out.innerHTML = h;
  if (clickable) out.onclick = ev => { const it = ev.target.closest('.sched-item[data-cid]'); if (it && window.openCompetition) window.openCompetition(+it.dataset.cid); };
}
window.buildSchedule = buildSchedule;

// 홈 일정 카드 클릭 → 대회별 탭에서 해당 대회 펼치기
window.openCompetition = function (cid) {
  show('comp');
  const tryOpen = (n = 0) => {
    const it = document.querySelector(`#comp-list .comp-item[data-cid="${cid}"]`);
    if (it) { if (!it.classList.contains('on')) it.click(); it.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    else if (n < 25) setTimeout(() => tryOpen(n + 1), 140);
  };
  tryOpen();
};

// 로그인한 선수 본인 대시보드
async function renderMe() {
  const box = $('#view-me');
  const key = window.APP_ROLE && window.APP_ROLE.athleteKey;
  if (!key) { box.innerHTML = '<div class="muted">연결된 선수 정보가 없습니다.</div>'; return; }
  box.innerHTML = '<div class="muted">내 기록 불러오는 중…</div>';
  const a = await DB.athleteByKey(key);
  if (!a) { box.innerHTML = '<div class="muted">현재 데이터에서 본인 기록을 찾지 못했습니다. 코치에게 문의하세요.</div>'; return; }
  const rows = await DB.athleteCareer(a.id);
  buildCareer({ id: a.id, ...a }, rows, box);
}

// =====================================================================
//  선수 검색
// =====================================================================
init.athlete = () => {
  const box = $('#ath-q'), list = $('#ath-list'), detail = $('#ath-detail'), cnt = $('#ath-count');
  let timer;
  box.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = box.value.trim();
      detail.innerHTML = ''; cnt.textContent = '';
      if (q.length < 1) { list.innerHTML = ''; return; }
      list.innerHTML = '<div class="muted">검색 중…</div>';
      const rows = await DB.searchAthletes(q);
      cnt.textContent = `${rows.length}명`;
      if (!rows.length) { list.innerHTML = '<div class="muted">일치하는 선수가 없습니다.</div>'; return; }
      list.innerHTML = '';
      rows.forEach(a => {
        const wrap = el('div', 'ath-item-wrap');
        const item = el('button', 'ath-item');
        item.innerHTML = `<span class="nm">${esc(a.full_name)}${a.gender ? ` <span class="g g-${a.gender}">${GENDER[a.gender]}</span>` : ''}</span>
          <span class="sub">${ageText(a.birth_year)} · ${esc(a.units || (a.is_foreign ? a.nationality : '-'))}</span>
          <span class="cnt">${a.n_results}전 ${a.n_medals ? '· 메달 ' + a.n_medals : ''}</span>`;
        item.onclick = () => { renderCareer(a, detail, list); cnt.textContent = ''; };
        wrap.appendChild(item);
        wrap.appendChild(Fav.starButton(a));
        list.appendChild(wrap);
      });
    }, 180);
  });
};

async function renderCareer(a, detail, list) {
  if (list) list.innerHTML = '';
  detail.innerHTML = '<div class="muted">불러오는 중…</div>';
  const rows = await DB.athleteCareer(a.id);
  buildCareer(a, rows, detail);
}

const RANK_YEAR = 2026;          // 랭킹 표시 연도
// 10m 공기권총 결선은 탈락식 — 최종 순위별 발수 (ISSF): 1·2위 24발 … 8위 12발
const AIR_FINAL_SHOTS = { 1: 24, 2: 24, 3: 22, 4: 20, 5: 18, 6: 16, 7: 14, 8: 12 };
const airShots = rk => AIR_FINAL_SHOTS[rk] || 24;
const evKey = e => e.discipline + '|' + e.gender + '|' + e.age_category;

async function buildCareer(a, rows, detail) {
  detail.innerHTML = '';
  const a0 = rows[0] ? rows[0].athlete : {};
  const g = a.gender || a0.gender, by = a.birth_year || a0.birth_year;
  const foreign = a.is_foreign != null ? a.is_foreign : a0.is_foreign, nat = a.nationality || a0.nationality;

  // 커리어 합계
  const im = { gold: 0, silver: 0, bronze: 0 }, tm = { gold: 0, silver: 0, bronze: 0 };
  let finalsTotal = 0;
  rows.forEach(r => { if (r.medal) im[r.medal]++; if (r.team_medal) tm[r.team_medal]++; if (r.final_score != null) finalsTotal++; });

  const head = el('div', 'ath-head');
  head.innerHTML = `<h2>${esc(a.full_name)}${g ? ` <span class="g g-${g}">${GENDER[g]}</span>` : ''}</h2>
    <div class="meta">${a.birth_date ? esc(a.birth_date) + ' · ' : ''}${by ? `만 ${NOW_YEAR - by}세 · ` : ''}${foreign ? esc(nat) : '베트남'} · 총 ${rows.length}경기</div>
    <div class="tally">
      <span class="tl">${t('개인')}</span><span class="medal gold">${t('금')}</span>${im.gold} <span class="medal silver">${t('은')}</span>${im.silver} <span class="medal bronze">${t('동')}</span>${im.bronze}
      <span class="tl">${t('단체')}</span><span class="medal gold">${t('금')}</span>${tm.gold} <span class="medal silver">${t('은')}</span>${tm.silver} <span class="medal bronze">${t('동')}</span>${tm.bronze}
      <span class="tl">${t('결선진출')}</span><b>${finalsTotal}</b>${t('회')}
    </div>`;
  // 즐겨찾기 별 (식별키가 있을 때)
  const starSrc = a.identity_key ? a : (a0.identity_key ? { ...a0 } : null);
  if (starSrc && window.Fav) { const st = Fav.starButton(starSrc); st.classList.add('head-star'); head.appendChild(st); }
  detail.appendChild(head);

  // 해당 연도 랭킹 (비동기로 채움)
  const rankBox = el('div', 'block', `<h3>${RANK_YEAR} 랭킹 <span class="sub2">국내 대회 · 종목별</span></h3><div class="muted">계산 중…</div>`);
  detail.appendChild(rankBox);
  renderRankings(a, rows, rankBox);

  // 심화 분석 (추이·일관성·시리즈피로·결선전환·국제백분위)
  if (window.Analytics) Analytics.render(a, rows, detail);

  // 연도별 성적
  detail.appendChild(yearlyStats(rows));

  // 대회별 상세 기록
  const byComp = new Map();
  rows.forEach(r => { const key = r.competition.name + '|' + r.competition.year; (byComp.get(key) || byComp.set(key, []).get(key)).push(r); });
  [...byComp.values()].reverse().forEach(group => {
    const c = group[0].competition;
    const sec = el('div', 'comp-sec');
    sec.appendChild(el('div', 'comp-h',
      `<span class="cy">${c.year}</span> ${esc(c.name)} <span class="scope ${c.scope}">${SCOPE[c.scope] || ''}</span>
       <div class="comp-sub">${periodText(c)}${c.location ? ' · ' + esc(c.location) : ''}</div>`));
    group.forEach(r => sec.appendChild(resultRow(r)));
    detail.appendChild(sec);
  });
}

// 연도별·종목별 성적 (평균/최고/최저/시리즈평균/결선/한발당)
function yearlyStats(rows) {
  const box = el('div', 'block', '<h3>연도별 성적 <span class="sub2">국내·국제 전체 · 종목별</span></h3>');
  const byYear = new Map();
  rows.forEach(r => (byYear.get(r.competition.year) || byYear.set(r.competition.year, []).get(r.competition.year)).push(r));
  [...byYear.keys()].sort((a, b) => b - a).forEach(year => {
    const yr = byYear.get(year), ysec = el('div', 'ysec');
    const im = { gold: 0, silver: 0, bronze: 0 }, tm = { gold: 0, silver: 0, bronze: 0 }; let fin = 0;
    yr.forEach(r => { if (r.medal) im[r.medal]++; if (r.team_medal) tm[r.team_medal]++; if (r.final_score != null) fin++; });
    ysec.appendChild(el('div', 'ysec-h',
      `<span class="yy">${year}</span> 개인메달 ${im.gold}·${im.silver}·${im.bronze} · 단체메달 ${tm.gold}·${tm.silver}·${tm.bronze} · 결선 ${fin}회`));
    const byEv = new Map();
    yr.forEach(r => { if (r.event.team_type !== 'individual' || r.is_dnf || r.qual_total == null) return; (byEv.get(evKey(r.event)) || byEv.set(evKey(r.event), []).get(evKey(r.event))).push(r); });
    [...byEv.values()].forEach(list => {
      const e = list[0].event, totals = list.map(r => r.qual_total);
      const avg = totals.reduce((s, v) => s + v, 0) / totals.length;
      const best = Math.max(...totals), worst = Math.min(...totals);
      const nS = 6, sSum = new Array(nS).fill(0), sCnt = new Array(nS).fill(0);
      list.forEach(r => (r.series || []).forEach(s => { if (s.series_no >= 1 && s.series_no <= nS) { sSum[s.series_no - 1] += s.score; sCnt[s.series_no - 1]++; } }));
      const sAvg = sSum.map((v, i) => sCnt[i] ? (v / sCnt[i]).toFixed(1) : null).filter(x => x != null);
      const finRows = list.filter(r => r.final_score != null), finN = finRows.length;
      let perShot = '';
      if (e.discipline === 'air' && finN) {
        const ps = finRows.map(r => r.final_score / airShots(r.final_rank));
        perShot = ` · 한발당 ${(ps.reduce((s, v) => s + v, 0) / ps.length).toFixed(2)}`;
      }
      const row = el('div', 'ev-stat');
      row.innerHTML = `<div class="es-h">${esc(eventLabel(e))} <span class="es-n">${list.length}경기</span></div>
        <div class="es-line">평균 <b>${avg.toFixed(1)}</b> · 최고 ${best} · 최저 ${worst}${finN ? ` · 결선 ${finN}회${perShot}` : ''}</div>
        <div class="es-series">시리즈 평균 ${sAvg.join(' / ')}</div>`;
      ysec.appendChild(row);
    });
    box.appendChild(ysec);
  });
  return box;
}

// 해당 연도 랭킹(전체·연령별 × 평균·최고) — 국내 종목별
async function renderRankings(a, rows, box) {
  const evs = new Map();
  rows.forEach(r => { if (r.competition.year !== RANK_YEAR || r.event.team_type !== 'individual' || r.is_dnf || r.qual_total == null) return; if (r.competition.scope !== 'domestic') return; evs.set(evKey(r.event), r.event); });
  if (!evs.size) { const m = box.querySelector('.muted'); if (m) m.textContent = `${RANK_YEAR}년 국내 개인전 기록이 없습니다.`; return; }
  const rankOf = (arr, key) => { const s = [...arr].sort((x, y) => y[key] - x[key]); const i = s.findIndex(o => o.athlete_id === a.id); return i < 0 ? null : `${i + 1}/${s.length}`; };
  const parts = [];
  for (const [, e] of evs) {
    const [ageAgg, openAgg] = await Promise.all([
      DB.eventAvg({ year: RANK_YEAR, discipline: e.discipline, gender: e.gender, age_category: e.age_category }),
      DB.eventAvg({ year: RANK_YEAR, discipline: e.discipline, gender: e.gender }),
    ]);
    parts.push(`<div class="rk-ev"><div class="rk-evn">${esc(eventLabel(e))}</div>
      <table class="rk-tab"><tr><th></th><th>평균순위</th><th>최고순위</th></tr>
      <tr><td>전체</td><td>${rankOf(openAgg, 'avg_qual') || '-'}</td><td>${rankOf(openAgg, 'best_qual') || '-'}</td></tr>
      <tr><td>연령부</td><td>${rankOf(ageAgg, 'avg_qual') || '-'}</td><td>${rankOf(ageAgg, 'best_qual') || '-'}</td></tr></table></div>`);
  }
  box.innerHTML = `<h3>${RANK_YEAR} 랭킹 <span class="sub2">국내 · 종목별 (순위/인원)</span></h3><div class="rk-grid">${parts.join('')}</div>`;
}

function resultRow(r) {
  const row = el('div', 'res');
  const md = mdText(r);
  const ser = r.series && r.series.length
    ? `<div class="series">${r.series.map(s => `<span>${s.score}</span>`).join('')}${r.inner_tens != null ? `<span class="x">X${r.inner_tens}</span>` : ''}</div>` : '';
  const tm = r.team_medal ? ` <span class="medal ${r.team_medal}" title="단체">${MEDAL[r.team_medal]}</span><span class="tmlbl">단체</span>` : '';
  row.innerHTML = `
    <div class="res-top">
      <div class="res-ev">${esc(eventLabel(r.event))}${md ? `<span class="md">${md}</span>` : ''}</div>
      <div class="res-place">${placementCell(r)}</div>
    </div>
    <div class="res-scores">
      <span>본선 <b>${num(r.qual_total)}</b></span>
      ${r.final_score != null ? `<span>결선 <b>${r.final_score}</b></span>` : ''}
      <span class="unit">${esc(r.unit_code || '')}</span>
      ${r.qual_rank ? `<span class="rk">본선 ${r.qual_rank}위</span>` : ''}
      ${r.final_rank ? `<span class="rk">결선 ${r.final_rank}위</span>` : ''}${tm}
    </div>${ser}`;
  return row;
}

// =====================================================================
//  대회별 (인라인 아코디언)
// =====================================================================
init.comp = async () => {
  const yearSel = $('#comp-year'), scopeSel = $('#comp-scope'), list = $('#comp-list'), cnt = $('#comp-count');
  const years = await DB.years();
  yearSel.innerHTML = `<option value="">${t('전체 연도')}</option>` + years.map(y => `<option>${y}</option>`).join('');
  scopeSel.innerHTML = `<option value="">${t('국내+국제')}</option><option value="domestic">${t('국내')}</option><option value="international">${t('국제')}</option>`;
  async function load() {
    list.innerHTML = '<div class="muted">불러오는 중…</div>';
    const cs = await DB.competitions(yearSel.value, scopeSel.value);
    cnt.textContent = `대회 ${cs.length}개`;
    list.innerHTML = '';
    cs.forEach(c => {
      const wrap = el('div', 'comp-wrap');
      const b = el('button', 'comp-item');
      b.dataset.cid = c.id;
      b.innerHTML = `<span class="nm">${esc(c.name)}</span>
        <span class="sub">${periodText(c)} · ${esc(c.location || '')} <span class="scope ${c.scope}">${SCOPE[c.scope]}</span></span>`;
      const panel = el('div', 'comp-panel'); panel.hidden = true;
      let loaded = false;
      b.onclick = async () => {
        const open = panel.hidden;
        list.querySelectorAll('.comp-item').forEach(x => x.classList.remove('on'));
        list.querySelectorAll('.comp-panel').forEach(p => { if (p !== panel) p.hidden = true; });
        panel.hidden = !open;
        b.classList.toggle('on', open);
        if (open && !loaded) { loaded = true; await loadEvents(c, panel); }
      };
      wrap.appendChild(b); wrap.appendChild(panel); list.appendChild(wrap);
    });
  }
  async function loadEvents(c, panel) {
    panel.innerHTML = '<div class="muted">불러오는 중…</div>';
    const evs = await DB.eventsOf(c.id);
    panel.innerHTML = '';
    const bar = el('div', 'ev-tabs'), body = el('div', 'ev-panel');
    evs.forEach((e, i) => {
      const dstr = e.match_date ? e.match_date.slice(5).replace('-', '.') + ((e.match_dates && e.match_dates.length > 1) ? '+' : '') : '';
      const t = el('button', 'ev-tab');
      t.innerHTML = `<span class="et-name">${esc(eventLabel(e))}</span>${dstr ? `<span class="et-date">${dstr}</span>` : ''}`;
      t.onclick = async () => {
        bar.querySelectorAll('.ev-tab').forEach(x => x.classList.remove('on')); t.classList.add('on');
        body.innerHTML = '<div class="muted">불러오는 중…</div>';
        const rk = await DB.eventRanking(e.id);
        body.innerHTML = ''; body.appendChild(rankingBlock(rk, e));
      };
      bar.appendChild(t);
      if (i === 0) setTimeout(() => t.click(), 0);
    });
    panel.appendChild(bar); panel.appendChild(body);
  }
  yearSel.onchange = load; scopeSel.onchange = load;
  load();
};

// 종목 유형에 따라 결선(개인) 또는 단체 순위 + 개인 기록 표시
function rankingBlock(rows, e) {
  const wrap = el('div');
  // 종목 경기일시
  const dts = [...new Set(rows.filter(r => r.match_date).map(r => r.match_date))].sort();
  if (dts.length) {
    const f = rows.find(r => r.match_date === dts[0]);
    const label = dts.length > 1
      ? `${dts[0].replace(/-/g, '.')} ~ ${dts[dts.length - 1].replace(/-/g, '.')}`
      : dts[0].replace(/-/g, '.') + (f && f.match_time ? ' ' + f.match_time : '');
    wrap.appendChild(el('div', 'ev-when', `📅 ${t('경기일')} ${label}`));
  }
  // 결과 미입력(진행 예정/진행 중) 종목 → 순위표 대신 '출전 명단(결과 대기 중)'
  const scored = rows.filter(r => !r.is_dnf && r.qual_total != null);
  if (rows.length && scored.length === 0) {
    wrap.appendChild(startList(rows));
    return wrap;
  }

  const isTeam = e && e.team_type && e.team_type !== 'individual';

  if (isTeam) {
    // 단체 순위 — 원본은 메달 수상 팀(금·은·동)만 기록됨.
    // (소속+메달색)으로 모은 뒤 팀원 번호순으로 팀 크기(혼성2·단체3)만큼 나눠 팀을 만든다.
    const teamSize = e.team_type === 'mixed_team' ? 2 : 3;
    const groups = new Map();
    rows.forEach(r => { if (!r.team_medal) return; const k = (r.unit_code || '') + '|' + r.team_medal; (groups.get(k) || groups.set(k, []).get(k)).push(r); });
    const teams = [];
    for (const mem of groups.values()) {
      mem.sort((a, b) => (a.team_medal_no || 0) - (b.team_medal_no || 0));
      for (let i = 0; i < mem.length; i += teamSize) teams.push(mem.slice(i, i + teamSize));
    }
    if (teams.length) {
      const order = { gold: 1, silver: 2, bronze: 3 };
      const sum = t => t.reduce((s, m) => s + (m.qual_total || 0), 0);
      teams.sort((a, b) => order[a[0].team_medal] - order[b[0].team_medal] || sum(b) - sum(a));
      const tb = el('div', 'finals');
      tb.appendChild(el('div', 'finals-h', '단체 순위'));
      teams.forEach((mem, i) => {
        const names = mem.map(m => `<button class="lnk" data-aid="${m.athlete_id}">${esc(m.athlete.full_name)}</button>`).join(', ');
        const fr = el('div', 'team-row');
        fr.innerHTML = `<span class="fp">${medalBadge(mem[0].team_medal)}${i + 1}위</span>
          <span class="tn"><b class="tu">${esc(mem[0].unit_code || '')}</b> ${names}</span>
          <span class="fs">합계 <b>${sum(mem).toFixed(1)}</b></span>`;
        tb.appendChild(fr);
      });
      wrap.appendChild(tb);
      wrap.appendChild(el('div', 'note', '※ 원본 시트에는 메달 수상 팀만 기재되어 4위 이하 단체 순위는 제공되지 않습니다.'));
    }
    wrap.appendChild(el('div', 'sub-h', '개인 기록 (구성원별)'));
    wrap.appendChild(rankingTable(rows));
    return wrap;
  }

  // 개인 종목: 상위 8위(종합등위 기준) + 본선 순위
  // 결선 점수가 일부만 기재된 종목도 등위 1~8위는 항상 표시된다.
  const top8 = rows.filter(r => r.placement && r.placement <= 8).sort((a, b) => a.placement - b.placement);
  const hasFinalData = rows.some(r => r.final_score != null);
  if (top8.length) {
    const fb = el('div', 'finals');
    fb.appendChild(el('div', 'finals-h', hasFinalData ? '결선 결과 (상위 8위)' : '상위 8위'));
    top8.forEach(r => {
      const fr = el('div', 'final-row');
      const score = r.final_score != null ? `결선 <b>${r.final_score}</b>` : `본선 ${num(r.qual_total)}`;
      fr.innerHTML = `<span class="fp">${medalBadge(r.medal)}${r.placement}위</span>
        <span class="fn"><button class="lnk" data-aid="${r.athlete_id}">${esc(r.athlete.full_name)}</button></span>
        <span class="fu">${esc(r.unit_code || '')}</span>
        <span class="fs">${score}</span>`;
      fb.appendChild(fr);
    });
    wrap.appendChild(fb);
  }
  wrap.appendChild(el('div', 'sub-h', '본선 순위'));
  wrap.appendChild(rankingTable(rows));
  return wrap;
}

// 출전 명단(결과 대기 중) — 아직 점수가 입력되지 않은 종목
function startList(rows) {
  const box = el('div', 'startlist');
  box.appendChild(el('div', 'finals-h', `📋 ${t('출전 명단')} · ${t('결과 대기 중')} <span class="sl-n">${rows.length}${t('명 출전')}</span>`));
  // 사수번호(있으면) 순, 없으면 이름순
  const sorted = rows.slice().sort((a, b) => {
    const fa = +(a.firing_point || a.bib || 0), fb = +(b.firing_point || b.bib || 0);
    if (fa && fb && fa !== fb) return fa - fb;
    return (a.athlete.full_name || '').localeCompare(b.athlete.full_name || '');
  });
  sorted.forEach(r => {
    const pos = r.firing_point || r.bib || '';
    const row = el('div', 'sl-row');
    row.innerHTML =
      `<span class="sl-pos">${pos ? esc(String(pos)) : '–'}</span>
       <span class="sl-nm"><button class="lnk" data-aid="${r.athlete_id}">${esc(r.athlete.full_name)}</button>${r.athlete.gender ? ` <span class="g g-${r.athlete.gender}">${GENDER[r.athlete.gender]}</span>` : ''}</span>
       <span class="sl-unit">${esc(r.unit_code || '')}</span>`;
    if (window.Fav && r.athlete && r.athlete.identity_key) row.querySelector('.sl-nm').appendChild(Fav.starButton(r.athlete, { inline: true }));
    box.appendChild(row);
  });
  return box;
}

function rankingTable(rows) {
  const t = el('table', 'rank');
  t.innerHTML = `<thead><tr><th>등위</th><th>선수</th><th>소속</th><th>본선</th><th>X</th><th>결선</th></tr></thead>`;
  const tb = el('tbody');
  rows.forEach(r => {
    const tr = el('tr');
    if (r.medal) tr.classList.add('m-' + r.medal);
    tr.innerHTML = `<td class="c">${placementCell(r)}</td>
      <td><button class="lnk" data-aid="${r.athlete_id}">${esc(r.athlete.full_name)}</button><span class="by">${r.athlete.birth_year || ''}</span></td>
      <td class="unit">${esc(r.unit_code || '')}</td>
      <td class="c"><b>${num(r.qual_total)}</b></td>
      <td class="c">${num(r.inner_tens)}</td>
      <td class="c">${r.final_score != null ? r.final_score : '–'}</td>`;
    if (window.Fav && r.athlete && r.athlete.identity_key) tr.children[1].appendChild(Fav.starButton(r.athlete, { inline: true }));
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  const w = el('div', 'table-wrap'); w.appendChild(t); return w;
}

// =====================================================================
//  입상실적 (개인 + 단체 메달)
// =====================================================================
init.medals = async () => {
  const yearSel = $('#med-year'), discSel = $('#med-disc'), scopeSel = $('#med-scope'), out = $('#med-out'), cnt = $('#med-count');
  const years = await DB.years();
  yearSel.innerHTML = `<option value="">${t('전체 연도')}</option>` + years.map(y => `<option>${y}</option>`).join('');
  discSel.innerHTML = `<option value="">${t('전체 종목')}</option>` + Object.entries(DISC).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  scopeSel.innerHTML = `<option value="">${t('국내+국제')}</option><option value="domestic">${t('국내')}</option><option value="international">${t('국제')}</option>`;
  async function run() {
    out.innerHTML = '<div class="muted">불러오는 중…</div>';
    const rows = await DB.medals({ year: yearSel.value, discipline: discSel.value, scope: scopeSel.value });
    if (!rows.length) { out.innerHTML = '<div class="muted">해당 조건의 입상 기록이 없습니다.</div>'; cnt.textContent = ''; return; }
    out.innerHTML = '';
    const byComp = new Map();
    rows.forEach(r => { const k = r.competition.year + '|' + r.competition.name; (byComp.get(k) || byComp.set(k, []).get(k)).push(r); });
    let indivN = 0, teamN = 0;
    [...byComp.entries()].forEach(([, group]) => {
      const c = group[0].competition;
      const sec = el('div', 'comp-sec');
      sec.appendChild(el('div', 'comp-h', `<span class="cy">${c.year}</span> ${esc(c.name)} <span class="scope ${c.scope}">${SCOPE[c.scope]}</span>`));

      // 개인 메달
      group.filter(r => r.medal).sort((a, b) => a.event.event_code?.localeCompare(b.event.event_code) || (a.placement || 9) - (b.placement || 9))
        .forEach(r => {
          indivN++;
          const row = el('div', 'med-row');
          row.innerHTML = `${medalBadge(r.medal)}
            <span class="ev">${esc(eventLabel(r.event))}</span>
            <span class="who"><button class="lnk" data-aid="${r.athlete_id}">${esc(r.athlete.full_name)}</button>${r.athlete.is_foreign ? ' <i>' + esc(r.athlete.nationality) + '</i>' : ''}</span>
            <span class="sc">본선 ${num(r.qual_total)}${r.final_score != null ? ' · 결선 ' + r.final_score : ''}</span>
            <span class="rk">${r.qual_rank ? '본선 ' + r.qual_rank + '위' : ''}${r.final_rank ? ' · 결선 ' + r.final_rank + '위' : ''}</span>`;
          if (window.Fav && r.athlete && r.athlete.identity_key) row.querySelector('.who').appendChild(Fav.starButton(r.athlete, { inline: true }));
          sec.appendChild(row);
        });

      // 단체 메달 — (종목·소속·메달색)으로 팀 묶기
      const teams = new Map();
      group.filter(r => r.team_medal).forEach(r => {
        const k = r.event.raw_name + '|' + (r.unit_code || '') + '|' + r.team_medal;
        (teams.get(k) || teams.set(k, []).get(k)).push(r);
      });
      [...teams.values()].sort((a, b) => a[0].event.event_code?.localeCompare(b[0].event.event_code)).forEach(members => {
        teamN++;
        const r0 = members[0];
        const total = members.reduce((s, m) => s + (m.qual_total || 0), 0);
        const names = members.map(m => `<button class="lnk" data-aid="${m.athlete_id}">${esc(m.athlete.full_name)}</button>`).join(', ');
        const row = el('div', 'med-row team');
        row.innerHTML = `${medalBadge(r0.team_medal)}
          <span class="ev">${esc(eventLabel(r0.event))}</span>
          <span class="who"><b class="tu">${esc(r0.unit_code || '')}</b> ${names}</span>
          <span class="sc">팀 합계 ${total ? total.toFixed(1) : '–'}</span>
          <span class="rk">단체</span>`;
        sec.appendChild(row);
      });
      out.appendChild(sec);
    });
    cnt.textContent = `개인 ${indivN} · 단체 ${teamN}건`;
  }
  [yearSel, discSel, scopeSel].forEach(s => s.onchange = run);
  run();
};

// =====================================================================
//  랭킹 (종목·연령부 종합, 평균 본선점수)
// =====================================================================
init.rank = async () => {
  const discSel = $('#rk-disc'), gSel = $('#rk-gender'), ageSel = $('#rk-age'), out = $('#rk-out'), cnt = $('#rk-count');
  discSel.innerHTML = Object.entries(DISC).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  gSel.innerHTML = `<option value="">${t('남/여')}</option><option value="M">${t('남자부')}</option><option value="W">${t('여자부')}</option>`;
  ageSel.innerHTML = `<option value="">${t('전체 연령')}</option>` +
    [['senior', t('일반')], ['junior', t('주니어')], ['youth', t('유소년')], ['u18', 'U18'], ['u16', 'U16']].map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  async function run() {
    out.innerHTML = '<div class="muted">불러오는 중…</div>';
    const rows = await DB.eventAvg({ discipline: discSel.value, gender: gSel.value, age_category: ageSel.value });
    cnt.textContent = `${rows.length}명 · 국내 대회 평균 본선점수 순`;
    if (!rows.length) { out.innerHTML = '<div class="muted">해당 조건의 기록이 없습니다.</div>'; return; }
    const t = el('table', 'rank rank-avg');
    t.innerHTML = `<thead><tr><th>순위</th><th>선수</th><th>소속</th><th>나이</th><th>경기</th><th>평균</th><th>최고</th></tr></thead>`;
    const tb = el('tbody');
    rows.forEach((r, i) => {
      const tr = el('tr');
      tr.innerHTML = `<td class="c">${i + 1}</td>
        <td><button class="lnk" data-aid="${r.athlete_id}">${esc(r.full_name)}</button>${r.is_foreign ? ` <i>${esc(r.nationality)}</i>` : ''}</td>
        <td class="unit">${esc(r.unit || '')}</td>
        <td class="agec">${r.birth_year ? `${r.birth_year}<span class="ag">(${NOW_YEAR - r.birth_year})</span>` : '–'}</td>
        <td class="c">${r.n_games}</td>
        <td class="c"><b>${r.avg_qual}</b></td>
        <td class="c">${r.best_qual}</td>`;
      if (window.Fav && r.identity_key) tr.children[1].appendChild(Fav.starButton(r, { inline: true }));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    out.innerHTML = ''; const w = el('div', 'table-wrap'); w.appendChild(t); out.appendChild(w);
  }
  [discSel, gSel, ageSel].forEach(s => s.onchange = run);
  run();
};

// =====================================================================
//  선수 상세 모달
// =====================================================================
async function openAthleteModal(id) {
  const modal = $('#modal'), body = $('#modal-body');
  modal.hidden = false; document.body.style.overflow = 'hidden';
  body.innerHTML = '<div class="muted">불러오는 중…</div>';
  const rows = await DB.athleteCareer(id);
  const a = rows[0] ? { id, ...rows[0].athlete } : { id, full_name: '' };
  buildCareer(a, rows, body);
}
function closeModal() { $('#modal').hidden = true; document.body.style.overflow = ''; }
document.addEventListener('click', e => {
  const lnk = e.target.closest('.lnk[data-aid]');
  if (lnk) { openAthleteModal(isNaN(+lnk.dataset.aid) ? lnk.dataset.aid : +lnk.dataset.aid); return; }
  if (e.target.id === 'modal' || e.target.closest('#modal-close')) closeModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// =====================================================================
//  데이터 정보(정확도) — 우측 상단
// =====================================================================
async function initInfo() {
  const meta = await DB.meta();
  $('#info-date').textContent = meta.generated_at || '';
  const c = meta.counts || {};
  const pop = $('#info-pop');
  pop.innerHTML = `
    <div class="ip-row"><b>데이터 기준</b> ${esc(meta.generated_at || '-')} · ${DB_MODE === 'local' ? '로컬 미리보기' : 'Supabase'}</div>
    <div class="ip-row"><b>자동 갱신</b> 공개 시트를 주기적으로 자동 반영합니다(약 30분~1시간).</div>
    <div class="ip-row"><b>출처</b> 베트남 사격연맹 공개 기록시트</div>
    ${(window.APP_CONFIG && window.APP_CONFIG.sheetUrl) ? `<a class="ip-sheet" href="${esc(window.APP_CONFIG.sheetUrl)}" target="_blank" rel="noopener noreferrer">📄 ${t('원본 시트 열기')}</a>` : ''}
    ${c.results ? `<div class="ip-row"><b>수록</b> 대회 ${c.competitions} · 선수 ${c.athletes} · 성적 ${c.results}</div>` : ''}
    <div class="ip-row"><b>등위</b> 원본에 등위 컬럼이 없어 국제 규정 6.15.1로 <em>계산</em>한 값입니다(이너텐→마지막 시리즈 카운트백). 메달은 연맹 확정.</div>
    <div class="ip-row"><b>완전성</b> 결선 점수·시리즈는 시트에 기재된 경우만 표시됩니다. 온전한 데이터는 2025년~.</div>`;
  $('#info-btn').onclick = () => { pop.hidden = !pop.hidden; };
  document.addEventListener('click', e => { if (!e.target.closest('#info-btn') && !e.target.closest('#info-pop')) pop.hidden = true; });
}

// ---------- 앱 시작 (auth.js 가 로그인 후 호출) ----------
window.startApp = function (opts) {
  window.APP_ROLE = opts || { role: 'coach' };
  const role = window.APP_ROLE.role;
  // 다국어: 헤더·탭 라벨
  const TABS = { home: '홈', me: '내 정보', athlete: '선수', comp: '대회별', medals: '입상실적', rank: '랭킹', admin: '관리' };
  document.querySelectorAll('.tab').forEach(tab => {
    const k = TABS[tab.dataset.tab]; if (k) tab.textContent = t(k);
    tab.onclick = () => show(tab.dataset.tab);
  });
  const h1 = document.querySelector('header h1'); if (h1) h1.innerHTML = `<span class="brand-rings">${window.ringsSVG || ''}</span><span class="brand-title">${t('권총기록 아카이브')}</span>`;
  const tag = document.querySelector('.tag'); if (tag) tag.textContent = t('권총 · 베트남 사격연맹');
  document.querySelector('#ath-q')?.setAttribute('placeholder', t('선수명 검색 (예: Phạm Quang Huy)'));
  // 역할별 탭 노출
  const showTab = (name, on) => { const el2 = document.querySelector(`.tab[data-tab="${name}"]`); if (el2) el2.hidden = !on; };
  showTab('fav', role === 'coach');
  showTab('admin', role === 'coach');
  showTab('me', role === 'athlete');
  // 헤더 우측: 언어전환 + 로그아웃 + 크레딧
  const hb = document.querySelector('.hbtns');
  if (hb && !hb.querySelector('.lang-sel')) hb.insertBefore(window.langSelector(), hb.firstChild);
  const lo = $('#logout-btn'); if (lo) { lo.textContent = t('로그아웃'); lo.onclick = () => window.authLogout(); }
  const hwrap = document.querySelector('.hwrap');
  if (hwrap && !hwrap.querySelector('.credit')) hwrap.appendChild(window.creditEl());
  initInfo();
  show('home');
};

// PWA 서비스워커 등록 (오프라인·홈화면 설치)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
}
