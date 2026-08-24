'use strict';
// =====================================================================
//  검색 UI — 탭: 선수 / 대회별 / 입상실적 / 랭킹
// =====================================================================
const DISC = { air: t('10m 공기권총'), rapid_fire: t('25m 속사권총'), sport: t('25m 스포츠권총'),
  standard: t('25m 표준권총'), centre_fire: t('25m 센터파이어'), pistol_50: t('50m 권총') };
const AGE = { senior: '', junior: t('주니어'), youth: t('유소년'), u16: 'U16', u18: 'U18' };
// 대회 유형 배지: 전체연령(개방) vs 연령부
const ageChip = e => {
  const open = !e || !e.age_category || e.age_category === 'senior';
  return `<span class="age-chip ${open ? 'open' : 'grp'}">${open ? t('전체연령') : t('연령부')}</span>`;
};
const MEDAL = { gold: t('금'), silver: t('은'), bronze: t('동') };
const SCOPE = { domestic: t('국내'), international: t('국제') };
const GENDER = { M: t('남'), W: t('여') };
const NOW_YEAR = new Date().getFullYear();

const $ = (s, r = document) => r.querySelector(s);
const el = (t, cls, html) => { const e = document.createElement(t); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const medalBadge = m => m ? `<span class="medal ${m}">${MEDAL[m]}</span>` : '';
const num = v => (v == null || v === '') ? '–' : v;
const ageText = by => by ? `${by}${t('년생')} (${NOW_YEAR - by}${t('세')})` : t('생년 미상');

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
  if (r.is_dnf || r.placement == null) return `<span class="dnf">${t('기록없음')}</span>`;
  return `${medalBadge(r.medal)}<b>${r.placement}</b><span class="wi">${t('위')}</span>`;
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
  const coach = !!(window.APP_ROLE && window.APP_ROLE.role === 'coach');
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
    `<div id="home-news"></div>` +
    (coach ? `<div id="home-myath" class="block"></div>` : '') +
    `<div id="home-sched"><div class="muted">${t('불러오는 중…')}</div></div>`;
  showFreshness();
  renderNews($('#home-news'));
  await buildSchedule($('#home-sched'), year);
  if (coach) renderMyAthletesComps($('#home-myath'), year);
}
// 베트남 사격연맹 공지/뉴스
async function renderNews(box) {
  if (!box) return;
  let items = [];
  try { items = await DB.news(); } catch (e) { }
  if (!items || !items.length) { box.innerHTML = ''; return; }
  const src = window.APP_CONFIG && window.APP_CONFIG.newsUrl;
  const top = items.slice(0, 5);
  box.innerHTML =
    `<div class="news-card">
       <div class="news-head"><span class="news-t">📢 ${t('연맹 공지')}</span>
         ${src ? `<a class="news-more" href="${esc(src)}" target="_blank" rel="noopener noreferrer">${t('전체보기')} ›</a>` : ''}</div>
       ${top.map(n => `<a class="news-item" href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">
         <span class="news-date">${esc(n.date || '')}</span>
         <span class="news-title">${esc(n.title)}</span></a>`).join('')}
     </div>`;
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
    const src = window.APP_CONFIG && window.APP_CONFIG.sourceUrl;
    box.innerHTML = `<span class="bc-fresh-chip"><span class="bc-dot"></span>${t('자동 갱신')} · ${t('기준')} ${when}</span>` +
      (src ? `<a class="bc-sheet" href="${esc(src)}" target="_blank" rel="noopener noreferrer">🔗 ${t('연맹 원본 페이지')}</a>` : '');
  } catch (e) { box.remove(); }
}
async function renderMyAthletesComps(box, year) {
  box.innerHTML = `<h3>${t('관리 선수 일정·기록')}</h3><div class="muted">${t('불러오는 중…')}</div>`;
  const favs = Fav.list();
  if (!favs.length) {
    box.innerHTML = `<h3>${t('관리 선수 일정·기록')}
        <button class="report-btn" id="coach-report-btn">🖨️ ${t('지도 실적 증명')}</button></h3>
      <div class="muted">${t('관리 선수를 즐겨찾기(☆)로 등록하세요.')}</div>`;
    const rb0 = $('#coach-report-btn'); if (rb0) rb0.onclick = () => openCoachReport(year);
    return;
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const p2 = n => String(n).padStart(2, '0');
  const iso = `${today.getFullYear()}-${p2(today.getMonth() + 1)}-${p2(today.getDate())}`;
  const daysTo = d => Math.round((new Date(d + 'T00:00:00') - today) / 86400000);
  const cards = [];
  for (const it of favs) {
    const a = await DB.athleteByKey(it.key); if (!a) continue;
    const rows = (await DB.athleteCareer(a.id));
    const scored = r => !r.is_dnf && r.qual_total != null;
    // 다가오는·진행 중: 점수 미입력 & 대회 종료일이 오늘 이후 (또는 오늘 진행)
    const upcoming = rows.filter(r => !scored(r) && ((r.competition.date_end || r.competition.date_start || '') >= iso))
      .sort((x, y) => (x.match_date || x.competition.date_start || '').localeCompare(y.match_date || y.competition.date_start || ''));
    // 최근 기록: 올해 점수 있는 결과(개인+단체), 최신순
    const recent = rows.filter(r => scored(r) && r.competition.year === year)
      .sort((x, y) => (y.match_date || y.competition.date_start || '').localeCompare(x.match_date || x.competition.date_start || ''))
      .slice(0, 5);
    // 시즌 메달 집계 (개인 medal + 단체 team_medal)
    const M = { ig: 0, is: 0, ib: 0, tg: 0, ts: 0, tb: 0 };
    rows.filter(r => r.competition.year === year).forEach(r => {
      if (r.medal === 'gold') M.ig++; else if (r.medal === 'silver') M.is++; else if (r.medal === 'bronze') M.ib++;
      if (r.team_medal === 'gold') M.tg++; else if (r.team_medal === 'silver') M.ts++; else if (r.team_medal === 'bronze') M.tb++;
    });
    cards.push({ a, key: it.key, group: it.group, upcoming, recent, medals: M });
  }
  // 다가오는 경기가 있는 선수를 위로
  cards.sort((x, y) => (y.upcoming.length ? 1 : 0) - (x.upcoming.length ? 1 : 0));
  const dateS = d => (d || '').slice(5).replace('-', '.');
  const upItem = r => {
    const d = r.match_date || r.competition.date_start;
    const nd = d ? daysTo(d) : null;
    const dd = (d && d >= iso && nd >= 0) ? (nd === 0 ? 'D-0' : `D-${nd}`) : '';
    const status = (r.competition.date_start && r.competition.date_start <= iso) ? t('결과 대기') : t('출전 예정');
    const meta = slotMeta(r);
    const time = r.match_time ? ` <span class="ma-time">${esc(r.match_time)}</span>` : '';
    const loc = r.competition.location ? `<span class="ma-loc">📍 ${esc(r.competition.location)}</span>` : '';
    return `<div class="ma-ev up"><span class="ma-when">${dateS(d)}${time}${dd ? ` <b>${dd}</b>` : ''}</span>
      <span class="ma-evn">${esc(eventLabel(r.event))}</span>
      <span class="ma-cmp">${esc(r.competition.name)}${loc ? ` · ${loc}` : ''}${meta ? ` <span class="ma-slot">${meta}</span>` : ''}</span>
      <span class="ma-st">${status}</span></div>`;
  };
  const recItem = r => {
    const ind = r.medal ? medalBadge(r.medal) : '';
    const team = r.team_medal ? `${medalBadge(r.team_medal)}<span class="ma-tm">${t('단체')}</span>` : '';
    const pl = r.placement ? `${r.placement}${t('위')}` : '';
    return `<div class="ma-ev rec"><span class="ma-when">${dateS(r.match_date || r.competition.date_start)}</span>
      <span class="ma-evn">${esc(eventLabel(r.event))}</span>
      <span class="ma-sc">${ind}${team}<b>${num(r.qual_total)}</b>${r.final_score != null ? ` · ${t('결선')} ${r.final_score}` : ''} ${pl}</span></div>`;
  };
  // 시즌 메달 집계 칩 (개인 · 단체)
  const tallyChips = M => {
    const grp = (g, s, b) => [['gold', g], ['silver', s], ['bronze', b]]
      .filter(([, n]) => n > 0).map(([m, n]) => `${medalBadge(m)}${n}`).join(' ');
    const ind = grp(M.ig, M.is, M.ib), team = grp(M.tg, M.ts, M.tb);
    if (!ind && !team) return '';
    return `<span class="ma-medals">` +
      (ind ? `<span class="ma-mg"><i>${t('개인')}</i>${ind}</span>` : '') +
      (team ? `<span class="ma-mg team"><i>${t('단체')}</i>${team}</span>` : '') +
      `</span>`;
  };
  box.innerHTML = `<h3>${t('관리 선수 일정·기록')} <span class="sub2">${cards.length}</span>
      <button class="report-btn ghost" id="team-ov-btn">📊 ${t('팀 종합')}</button>
      <button class="report-btn" id="coach-report-btn">🖨️ ${t('지도 실적 증명')}</button></h3>
    <div id="team-overview" class="team-ov" hidden></div>` +
    cards.map(c => `
      <div class="ma-card">
        <div class="ma-top">
          <button class="lnk ma-name" data-akey="${esc(c.key || '')}">${esc(c.a.full_name)}</button>
          ${c.a.gender ? `<span class="g g-${c.a.gender}">${GENDER[c.a.gender]}</span>` : ''}
          ${c.group ? `<span class="ma-grp">${esc(t(c.group))}</span>` : ''}
        </div>
        ${tallyChips(c.medals)}
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
  const rb = $('#coach-report-btn'); if (rb) rb.onclick = () => openCoachReport(year);
  const tb = $('#team-ov-btn'); const tov = $('#team-overview');
  if (tb && tov) tb.onclick = async () => {
    if (!tov.hidden) { tov.hidden = true; tb.classList.remove('on'); return; }
    tov.hidden = false; tb.classList.add('on');
    if (!tov.dataset.done) { tov.dataset.done = '1'; await renderTeamOverview(tov, year); }
  };
}

// 팀 종합 대시보드 (코치): 관리 선수 전원 한눈 — 주 종목·최고·전국순위·폼·메달
async function renderTeamOverview(box, year) {
  box.innerHTML = `<div class="muted">${t('계산 중…')}</div>`;
  const favs = (window.Fav && Fav.list()) || [];
  if (!favs.length) { box.innerHTML = `<div class="muted">${t('관리 선수를 즐겨찾기(☆)로 등록하세요.')}</div>`; return; }
  const dt = r => r.match_date || r.competition.date_start || '';
  const scored = r => !r.is_dnf && r.qual_total != null;
  const data = [];
  for (const it of favs) {
    const a = await DB.athleteByKey(it.key); if (!a) continue;
    const car = await DB.athleteCareer(a.id);
    const cnt = new Map();
    car.forEach(r => { if (r.event.team_type === 'individual' && scored(r)) cnt.set(r.event.discipline, (cnt.get(r.event.discipline) || 0) + 1); });
    let mainDisc = null, mx = 0; for (const [d, c] of cnt) if (c > mx) { mx = c; mainDisc = d; }
    let best = null, form = '▬', formCls = 'flat';
    if (mainDisc) {
      const ml = car.filter(r => r.event.discipline === mainDisc && r.event.team_type === 'individual' && scored(r)).sort((x, y) => (dt(x)).localeCompare(dt(y)));
      best = Math.max(...ml.map(r => r.qual_total));
      if (ml.length >= 4) { const vals = ml.map(r => r.qual_total), n = vals.length, xm = (n - 1) / 2, ym = vals.reduce((s, v) => s + v, 0) / n; let num = 0, den = 0; vals.forEach((y, x) => { num += (x - xm) * (y - ym); den += (x - xm) ** 2; }); const sl = den ? num / den : 0; if (sl > 0.15) { form = '▲'; formCls = 'up'; } else if (sl < -0.15) { form = '▼'; formCls = 'dn'; } }
    }
    let nat = null; try { const R = await DB.regionalAnalysis(a.id, year); if (R) { const dz = R.disciplines.find(d => d.disc === mainDisc) || R.disciplines[0]; if (dz) nat = `${dz.natRank}/${dz.natN}`; } } catch (e) { }
    const m = { g: 0, s: 0, b: 0 }, tmv = { g: 0, s: 0, b: 0 };
    car.filter(r => r.competition.year === year).forEach(r => { if (r.medal === 'gold') m.g++; else if (r.medal === 'silver') m.s++; else if (r.medal === 'bronze') m.b++; if (r.team_medal === 'gold') tmv.g++; else if (r.team_medal === 'silver') tmv.s++; else if (r.team_medal === 'bronze') tmv.b++; });
    data.push({ name: a.full_name, gender: a.gender, group: it.group, key: it.key, mainDisc, best, nat, form, formCls, m, tmv });
  }
  data.sort((x, y) => (y.best || 0) - (x.best || 0));
  const medStr = (g, s, b) => [g && `${medalBadge('gold')}${g}`, s && `${medalBadge('silver')}${s}`, b && `${medalBadge('bronze')}${b}`].filter(Boolean).join(' ') || '–';
  box.innerHTML = `<div class="table-wrap"><table class="team-tab">
    <thead><tr><th>${t('선수')}</th><th>${t('주 종목')}</th><th>${t('최고')}</th><th>${t('전국')}</th><th>${t('폼')}</th><th>${t('메달')}</th></tr></thead><tbody>` +
    data.map(x => `<tr><td class="tt-nm"><button class="lnk" data-akey="${esc(x.key || '')}">${esc(x.name)}</button>${x.gender ? ` <span class="g g-${x.gender}">${GENDER[x.gender]}</span>` : ''}${x.group ? `<i>${esc(t(x.group))}</i>` : ''}</td>
      <td>${x.mainDisc ? esc(DISC[x.mainDisc] || x.mainDisc) : '–'}</td>
      <td class="c"><b>${x.best != null ? x.best : '–'}</b></td>
      <td class="c">${x.nat || '–'}</td>
      <td class="c form-${x.formCls}">${x.form}</td>
      <td class="tt-md">${medStr(x.m.g, x.m.s, x.m.b)}${(x.tmv.g || x.tmv.s || x.tmv.b) ? ` <span class="tt-t">${medStr(x.tmv.g, x.tmv.s, x.tmv.b)}</span>` : ''}</td></tr>`).join('') +
    `</tbody></table></div>`;
  box.querySelectorAll('.lnk[data-akey]').forEach(btn => btn.onclick = async () => {
    const a = await DB.athleteByKey(btn.dataset.akey); if (!a) return;
    show('athlete'); renderCareer({ id: a.id, ...a }, $('#ath-detail'), $('#ath-list'));
  });
}

// 2026 지도 실적 증명서 (인쇄 가능) — 개인전 기본, 단체전 포함은 선택
async function openCoachReport(year) {
  const favs = (window.Fav && Fav.list()) || [];
  const coach = (window.CURRENT && (CURRENT.profile?.display_name || CURRENT.user?.email)) || '지도자';
  let view = document.getElementById('report-view');
  if (view) view.remove();
  view = el('div', 'report-view'); view.id = 'report-view';
  view.innerHTML = `<div class="rv-bar no-print">
      <div class="rv-mode"><button class="rv-m on" data-mode="ind">${t('개인전만')}</button><button class="rv-m" data-mode="all">${t('개인+단체')}</button></div>
      <button class="rv-print" id="rv-print">🖨️ ${t('인쇄')}</button>
      <button class="rv-close" id="rv-close">${t('닫기')}</button></div>
    <div class="rv-doc" id="rv-doc"><div class="muted" style="padding:40px;text-align:center">${t('불러오는 중…')}</div></div>`;
  document.body.appendChild(view);
  document.getElementById('rv-close').onclick = () => view.remove();
  document.getElementById('rv-print').onclick = () => window.print();

  // 선수별 집계 (종목별로 나눔)
  const DORDER = ['air', 'rapid_fire', 'sport', 'standard', 'centre_fire', 'pistol_50'];
  const comps = new Set();
  const athletes = [];
  for (const it of favs) {
    const a = await DB.athleteByKey(it.key); if (!a) continue;
    const car = (await DB.athleteCareer(a.id)).filter(r => r.competition.year === year);
    const ind = new Map();    // disc → {best,g,s,b,comps:Set,fin}
    const teamMed = new Map();// disc → {tg,ts,tb,comps:Set}
    const medalRows = [];     // 대회별 메달 수집
    car.forEach(r => {
      comps.add(r.competition.name);
      const d = r.event.discipline;
      if (r.event.team_type === 'individual' && !r.is_dnf && r.qual_total != null) {
        const o = ind.get(d) || { best: 0, g: 0, s: 0, b: 0, comps: new Set(), fin: 0 };
        o.best = Math.max(o.best, r.qual_total); o.comps.add(r.competition.name);
        if (r.medal === 'gold') o.g++; else if (r.medal === 'silver') o.s++; else if (r.medal === 'bronze') o.b++;
        if (r.final_score != null) o.fin++;
        ind.set(d, o);
      }
      if (r.team_medal) {
        const o = teamMed.get(d) || { tg: 0, ts: 0, tb: 0, comps: new Set() };
        if (r.team_medal === 'gold') o.tg++; else if (r.team_medal === 'silver') o.ts++; else o.tb++;
        o.comps.add(r.competition.name); teamMed.set(d, o);
      }
      if (r.medal || r.team_medal) medalRows.push({ comp: r.competition.name, date: r.competition.date_start || '', scope: r.competition.scope, ev: eventLabel(r.event), medal: r.medal, team_medal: r.team_medal });
    });
    const rankMap = {};
    try { const R = await DB.regionalAnalysis(a.id, year); if (R) R.disciplines.forEach(dz => rankMap[dz.disc] = { nat: dz.natRank, natN: dz.natN, reg: dz.regRank, regN: dz.regN }); } catch (e) { }
    const im = { g: 0, s: 0, b: 0 }, tmv = { g: 0, s: 0, b: 0 };
    ind.forEach(o => { im.g += o.g; im.s += o.s; im.b += o.b; });
    teamMed.forEach(o => { tmv.g += o.tg; tmv.s += o.ts; tmv.b += o.tb; });
    athletes.push({ name: a.full_name, gender: a.gender, group: it.group || t('기타'), ind, teamMed, rankMap, im, tmv, medals: medalRows, has: ind.size > 0 || teamMed.size > 0 });
  }
  const now = new Date();
  const dstr = `${now.getFullYear()}. ${now.getMonth() + 1}. ${now.getDate()}`;
  const medStr = (g, s, b) => [g && `${medalBadge('gold')}${g}`, s && `${medalBadge('silver')}${s}`, b && `${medalBadge('bronze')}${b}`].filter(Boolean).join(' ') || '–';
  const gbadge = x => x.gender ? ` <span class="g g-${x.gender}">${GENDER[x.gender]}</span>` : '';
  const nmCell = x => `${esc(x.name)}${gbadge(x)}${x.group ? `<i>${esc(t(x.group))}</i>` : ''}`;

  // 그룹 선택 필터 (기본 전체 선택) — 관심 선수 포함/제외를 코치가 직접 선택
  const allGroups = [...new Set(athletes.map(x => x.group))];
  const activeGroups = new Set(allGroups);
  let curMode = 'ind';
  if (allGroups.length) {
    const gc = el('div', 'rv-groups no-print');
    gc.innerHTML = `<span class="rv-glab">${t('그룹')}:</span>` + allGroups.map(g => `<button class="rv-g on" data-g="${esc(g)}">${esc(t(g))}</button>`).join('');
    view.querySelector('.rv-bar').insertBefore(gc, view.querySelector('.rv-print'));
    gc.querySelectorAll('.rv-g').forEach(b => b.onclick = () => {
      const g = b.dataset.g;
      if (activeGroups.has(g)) { activeGroups.delete(g); b.classList.remove('on'); } else { activeGroups.add(g); b.classList.add('on'); }
      renderDoc(curMode);
    });
  }

  function renderDoc(mode) {
    curMode = mode;
    const team = mode === 'all';
    const list = athletes.filter(x => activeGroups.has(x.group));
    const compSet = new Set();
    list.forEach(x => { x.ind.forEach(o => o.comps.forEach(c => compSet.add(c))); x.teamMed.forEach(o => o.comps.forEach(c => compSet.add(c))); });
    // 합계
    const tot = { g: 0, s: 0, b: 0, tg: 0, ts: 0, tb: 0, fin: 0 };
    list.forEach(x => { x.ind.forEach(o => { tot.g += o.g; tot.s += o.s; tot.b += o.b; tot.fin += o.fin; }); x.teamMed.forEach(o => { tot.tg += o.tg; tot.ts += o.ts; tot.tb += o.tb; }); });
    // 관리 선수 명단 (모든 선수 반드시 표시 — 그룹별)
    let roster = '';
    const byG = new Map(); list.forEach(x => { (byG.get(x.group) || byG.set(x.group, []).get(x.group)).push(x); });
    for (const g of allGroups) {
      const arr = byG.get(g); if (!arr) continue;
      const rows = arr.map(x => `<tr><td class="rc-nm">${esc(x.name)}${gbadge(x)}</td><td class="rc-md">${medStr(x.im.g, x.im.s, x.im.b)}</td>${team ? `<td class="rc-md">${medStr(x.tmv.g, x.tmv.s, x.tmv.b)}</td>` : ''}<td>${x.has ? '✓' : `<span class="rc-nod">${t('기록 없음')}</span>`}</td></tr>`).join('');
      roster += `<div class="rc-disc"><div class="rc-disc-h">${esc(t(g))} <span class="rc-gn">(${arr.length})</span></div>
        <table class="rc-tab"><thead><tr><th>${t('선수')}</th><th>${t('개인 메달')}</th>${team ? `<th>${t('단체 메달')}</th>` : ''}<th>${t('2026 기록')}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    // 개인전 — 종목별 섹션
    let indSecs = '';
    DORDER.forEach(d => {
      const rows = list.filter(x => x.ind.has(d)).map(x => { const o = x.ind.get(d), rk = x.rankMap[d];
        return `<tr><td class="rc-nm">${nmCell(x)}</td><td><b>${o.best}</b></td><td>${rk ? `${rk.nat}/${rk.natN}` : '–'}</td><td class="rc-md">${medStr(o.g, o.s, o.b)}</td><td>${o.comps.size}</td></tr>`;
      }).join('');
      if (rows) indSecs += `<div class="rc-disc"><div class="rc-disc-h">🎯 ${esc(DISC[d] || d)}</div>
        <table class="rc-tab"><thead><tr><th>${t('선수')}</th><th>${t('최고점')}</th><th>${t('전국')}</th><th>${t('개인 메달')}</th><th>${t('참가 대회')}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    });
    // 단체전 — 종목별 섹션 (선택)
    let teamSecs = '';
    if (team) {
      const td = new Set(); list.forEach(x => x.teamMed.forEach((_, d) => td.add(d)));
      DORDER.filter(d => td.has(d)).forEach(d => {
        const rows = list.filter(x => x.teamMed.has(d)).map(x => { const o = x.teamMed.get(d);
          return `<tr><td class="rc-nm">${nmCell(x)}</td><td class="rc-md">${medStr(o.tg, o.ts, o.tb)}</td><td>${o.comps.size}</td></tr>`;
        }).join('');
        if (rows) teamSecs += `<div class="rc-disc"><div class="rc-disc-h">👥 ${esc(DISC[d] || d)} ${t('단체')}</div>
          <table class="rc-tab"><thead><tr><th>${t('선수')}</th><th>${t('단체 메달')}</th><th>${t('참가 대회')}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      });
      if (teamSecs) teamSecs = `<div class="rc-sech">👥 ${t('단체전')}</div>` + teamSecs;
    }
    // 대회별 획득 메달
    const compMap = new Map();
    list.forEach(x => x.medals.forEach(m => {
      const hasInd = !!m.medal, hasTeam = team && !!m.team_medal;
      if (!hasInd && !hasTeam) return;
      const o = compMap.get(m.comp) || { date: m.date, scope: m.scope, items: [], g: 0, s: 0, b: 0 };
      o.items.push({ name: x.name, gender: x.gender, ev: m.ev, medal: m.medal, team_medal: hasTeam ? m.team_medal : null });
      const bump = c => { if (c === 'gold') o.g++; else if (c === 'silver') o.s++; else if (c === 'bronze') o.b++; };
      if (hasInd) bump(m.medal); if (hasTeam) bump(m.team_medal);
      compMap.set(m.comp, o);
    }));
    let compMed = '';
    const compList = [...compMap.entries()].sort((a, b) => (b[1].date || '').localeCompare(a[1].date || ''));
    if (compList.length) {
      compMed = `<div class="rc-sech">🏅 ${t('대회별 획득 메달')}</div>`;
      compList.forEach(([name, o]) => {
        const rows = o.items.map(it => `<tr><td class="rc-nm">${esc(it.name)}${it.gender ? ` <span class="g g-${it.gender}">${GENDER[it.gender]}</span>` : ''}</td><td>${esc(it.ev)}</td><td class="rc-md">${it.medal ? medalBadge(it.medal) : ''}${it.team_medal ? ` ${medalBadge(it.team_medal)}<span class="tmlbl">${t('단체')}</span>` : ''}</td></tr>`).join('');
        compMed += `<div class="rc-disc"><div class="rc-disc-h">${(o.date || '').replace(/-/g, '.')} ${esc(name)} <span class="rc-gn">${medStr(o.g, o.s, o.b)}</span></div>
          <table class="rc-tab"><thead><tr><th>${t('선수')}</th><th>${t('종목')}</th><th>${t('메달')}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      });
    }
    const empty = !list.length;
    document.getElementById('rv-doc').innerHTML = `
      <div class="rc-head">
        <div class="rc-rings">${window.ringsSVG || ''}</div>
        <div class="rc-kick">${t('권총 · 베트남 사격연맹')}</div>
        <h1 class="rc-title">${year} ${t('지도 실적 증명서')}</h1>
        <div class="rc-coach">${t('지도자')}: <b>${esc(coach)}</b> · <span class="rc-scope">${team ? t('개인+단체') : t('개인전만')}</span></div>
      </div>
      <div class="rc-sum">
        <div><i>${t('지도 선수')}</i><b>${list.length}${t('명')}</b></div>
        <div><i>${t('참가 대회')}</i><b>${compSet.size}</b></div>
        <div class="hl"><i>${t('개인 메달')}</i><b>${tot.g + tot.s + tot.b}</b><span>${medStr(tot.g, tot.s, tot.b)}</span></div>
        ${team ? `<div><i>${t('단체 메달')}</i><b>${tot.tg + tot.ts + tot.tb}</b><span>${medStr(tot.tg, tot.ts, tot.tb)}</span></div>` : ''}
        <div><i>${t('결선 진출')}</i><b>${tot.fin}${t('회')}</b></div>
      </div>
      ${empty ? `<div class="muted" style="padding:24px;text-align:center">${t('관리 선수를 즐겨찾기(☆)로 등록하세요.')}</div>`
        : `<div class="rc-sech">📋 ${t('관리 선수 명단')}</div>${roster}${compMed}${indSecs ? `<div class="rc-sech">🎯 ${t('개인전')}</div>${indSecs}` : ''}${teamSecs}`}
      <div class="rc-foot">
        <div class="rc-note">${t('본 증명서는 베트남 사격연맹 공개 기록을 기준으로 자동 집계되었습니다.')} · ${t('발급일')} ${dstr}</div>
        <div class="rc-sign"><span class="rc-signname">RYONG</span><span class="rc-signlab">${t('작성')}</span></div>
      </div>`;
  }
  view.querySelectorAll('.rv-m').forEach(btn => btn.onclick = () => {
    view.querySelectorAll('.rv-m').forEach(b => b.classList.toggle('on', b === btn));
    renderDoc(btn.dataset.mode);
  });
  renderDoc('ind');   // 기본: 개인전 위주
}
window.openCoachReport = openCoachReport;
const MON = { ko: m => `${m}월`, vi: m => `Th.${m}` };
async function buildSchedule(out, year) {
  let cs = []; try { cs = await DB.competitions(String(year)); } catch (e) { }
  if (!cs.length) { out.innerHTML = `<div class="muted">${t('일정 정보가 없습니다.')}</div>`; return; }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const p2 = n => String(n).padStart(2, '0');
  const iso = `${today.getFullYear()}-${p2(today.getMonth() + 1)}-${p2(today.getDate())}`;
  const monLabel = MON[window.I18N.lang] || MON.ko;
  const dchip = d => { const [Y, M, D] = d.split('-'); return `<span class="dc-m">${monLabel(+M)}</span><span class="dc-d">${+D}</span>`; };
  const daysTo = d => Math.round((new Date(d + 'T00:00:00') - today) / 86400000);
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
  const i4 = new Date(today.getTime() + 28 * 86400000);
  const in4w = `${i4.getFullYear()}-${p2(i4.getMonth() + 1)}-${p2(i4.getDate())}`;   // 4주 이내
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
  if (!key) { box.innerHTML = `<div class="muted">${t('연결된 선수 정보가 없습니다.')}</div>`; return; }
  box.innerHTML = `<div class="muted">${t('불러오는 중…')}</div>`;
  const a = await DB.athleteByKey(key);
  if (!a) { box.innerHTML = `<div class="muted">${t('본인 기록을 찾지 못했습니다. 코치에게 문의하세요.')}</div>`; return; }
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
      list.innerHTML = `<div class="muted">${t('검색 중…')}</div>`;
      const rows = await DB.searchAthletes(q);
      cnt.textContent = `${rows.length}${t('명')}`;
      if (!rows.length) { list.innerHTML = `<div class="muted">${t('일치하는 선수가 없습니다.')}</div>`; return; }
      list.innerHTML = '';
      rows.forEach(a => {
        const wrap = el('div', 'ath-item-wrap');
        const item = el('button', 'ath-item');
        item.innerHTML = `<span class="nm">${esc(a.full_name)}${a.gender ? ` <span class="g g-${a.gender}">${GENDER[a.gender]}</span>` : ''}</span>
          <span class="sub">${ageText(a.birth_year)} · ${esc(a.units || (a.is_foreign ? a.nationality : '-'))}</span>
          <span class="cnt">${a.n_results}${t('전')} ${a.n_medals ? '· ' + t('메달') + ' ' + a.n_medals : ''}</span>`;
        item.onclick = () => { renderCareer(a, detail, list); cnt.textContent = ''; };
        wrap.appendChild(item);
        wrap.appendChild(Fav.starButton(a));
        list.appendChild(wrap);
      });
    }, 180);
  });
};

// 선수 요약 대시보드 (상단): 오늘의 훈련 포인트 · 개인 최고기록(PB) · 다음 대회
async function renderAthleteDashboard(a, rows, box) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const p2 = n => String(n).padStart(2, '0');
  const iso = `${today.getFullYear()}-${p2(today.getMonth() + 1)}-${p2(today.getDate())}`;
  const curY = today.getFullYear();
  const daysTo = d => Math.round((new Date(d + 'T00:00:00') - today) / 86400000);
  const scored = r => !r.is_dnf && r.qual_total != null;
  const dt = r => r.match_date || r.competition.date_start || '';

  // 개인 최고기록(PB) — 종목별
  const pbMap = new Map();
  rows.forEach(r => { if (r.event.team_type !== 'individual' || !scored(r)) return; const d = r.event.discipline; const o = pbMap.get(d); if (!o || r.qual_total > o.best) pbMap.set(d, { best: r.qual_total, date: dt(r), year: r.competition.year }); });
  const pbs = [...pbMap.entries()].sort((x, y) => y[1].best - x[1].best);

  // 다음 대회 (점수 미입력 & 대회 종료일 이후) — 중복 제거
  const seen = new Set();
  const upcoming = rows.filter(r => !scored(r) && ((r.competition.date_end || r.competition.date_start || '') >= iso))
    .sort((x, y) => (dt(x)).localeCompare(dt(y)))
    .filter(r => { const k = r.competition.name + '|' + eventLabel(r.event); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);

  // 오늘의 훈련 포인트 (약점 Top3)
  const tips = [];
  let stageData = []; try { stageData = await DB.stageAnalysis(a.id); } catch (e) { }
  stageData.forEach(dz => {
    if (dz.stages.length < 2) return;
    const worst = dz.stages.reduce((m, s) => s.avg < m.avg ? s : m), best = dz.stages.reduce((m, s) => s.avg > m.avg ? s : m);
    tips.push({ sev: (best.avg - worst.avg) * 3, ico: '🎯', txt: `${DISC[dz.disc] || dz.disc} · <b>${t(worst.key)}</b> ${t('보강')} (${worst.avg.toFixed(1)} · ${t('전국')} ${worst.natRank}${t('위')})` });
  });
  const byDisc = new Map();
  rows.forEach(r => { if (r.event.team_type !== 'individual' || !scored(r)) return; (byDisc.get(r.event.discipline) || byDisc.set(r.event.discipline, []).get(r.event.discipline)).push(r); });
  byDisc.forEach((list, disc) => {
    const sSum = new Array(6).fill(0), sCnt = new Array(6).fill(0);
    list.forEach(r => (r.series || []).forEach(s => { if (s.series_no >= 1 && s.series_no <= 6) { sSum[s.series_no - 1] += s.score; sCnt[s.series_no - 1]++; } }));
    const sAvg = sSum.map((v, i) => sCnt[i] ? v / sCnt[i] : null);
    if (['air', 'pistol_50'].includes(disc) && sAvg.every(v => v != null)) {
      const mean = sAvg.reduce((s, v) => s + v, 0) / 6, wi = sAvg.indexOf(Math.min(...sAvg)), gap = mean - sAvg[wi];
      if (gap > 0.5) tips.push({ sev: gap * 2, ico: '📉', txt: `${DISC[disc] || disc} · ${wi + 1}${t('번째 시리즈 집중')} (${sAvg[wi].toFixed(1)})` });
    }
    const sorted = list.slice().sort((x, y) => (dt(x)).localeCompare(dt(y)));
    if (sorted.length >= 4) {
      const vals = sorted.map(r => r.qual_total), n = vals.length, xm = (n - 1) / 2, ym = vals.reduce((s, v) => s + v, 0) / n;
      let num = 0, den = 0; vals.forEach((y, x) => { num += (x - xm) * (y - ym); den += (x - xm) ** 2; }); const slope = den ? num / den : 0;
      if (slope < -0.2) tips.push({ sev: -slope * 4, ico: '⚠️', txt: `${DISC[disc] || disc} · ${t('요즘 폼 하락 — 기본기 점검')}` });
    }
  });
  tips.sort((x, y) => y.sev - x.sev);
  const top = tips.slice(0, 3);

  let h = `<h3>${t('선수 요약')} <span class="sub2">${t('한눈에 보기')}</span></h3>`;
  if (top.length) h += `<div class="dash-card focus"><div class="dash-h">🎯 ${t('오늘의 훈련 포인트')}</div>` +
    top.map((tp, i) => `<div class="focus-item"><span class="focus-n">${i + 1}</span><span class="focus-ico">${tp.ico}</span><span class="focus-tx">${tp.txt}</span></div>`).join('') + `</div>`;
  if (pbs.length) h += `<div class="dash-card"><div class="dash-h">🏆 ${t('개인 최고기록')}</div><div class="pb2-grid">` +
    pbs.map(([d, o]) => `<div class="pb2${o.year === curY ? ' recent' : ''}"><div class="pb2-d">${esc(DISC[d] || d)}</div><div class="pb2-v"><b>${o.best}</b>${o.year === curY ? ` <span class="pb2-new">${t('올해')}</span>` : ''}</div><div class="pb2-y">${(o.date || '').slice(0, 4)}</div></div>`).join('') + `</div></div>`;
  if (upcoming.length) h += `<div class="dash-card"><div class="dash-h">📅 ${t('다가오는 경기')}</div>` +
    upcoming.map(r => { const d = dt(r), dd = d >= iso ? `D-${Math.max(0, daysTo(d))}` : ''; const meta = slotMeta(r);
      return `<div class="dash-up"><span class="du-d">${(d || '').slice(5).replace('-', '.')}${r.match_time ? ` <b>${esc(r.match_time)}</b>` : ''}${dd ? ` <span class="du-dd">${dd}</span>` : ''}</span>
        <span class="du-e">${esc(eventLabel(r.event))}</span>
        <span class="du-c">${esc(r.competition.name)}${r.competition.location ? ` · 📍${esc(r.competition.location)}` : ''}${meta ? ` <span class="ma-slot">${meta}</span>` : ''}</span></div>`; }).join('') + `</div>`;
  if (!top.length && !pbs.length && !upcoming.length) { box.innerHTML = ''; return; }
  box.innerHTML = h;
}

async function renderCareer(a, detail, list) {
  if (list) list.innerHTML = '';
  detail.innerHTML = `<div class="muted">${t('불러오는 중…')}</div>`;
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
    <div class="meta">${a.birth_date ? esc(a.birth_date) + ' · ' : ''}${by ? `${t('만')} ${NOW_YEAR - by}${t('세')} · ` : ''}${foreign ? esc(nat) : t('베트남')} · ${t('총')} ${rows.length}${t('경기')}</div>
    <div class="tally">
      <span class="tl">${t('개인')}</span><span class="medal gold">${t('금')}</span>${im.gold} <span class="medal silver">${t('은')}</span>${im.silver} <span class="medal bronze">${t('동')}</span>${im.bronze}
      <span class="tl">${t('단체')}</span><span class="medal gold">${t('금')}</span>${tm.gold} <span class="medal silver">${t('은')}</span>${tm.silver} <span class="medal bronze">${t('동')}</span>${tm.bronze}
      <span class="tl">${t('결선진출')}</span><b>${finalsTotal}</b>${t('회')}
    </div>`;
  // 즐겨찾기 별 (식별키가 있을 때)
  const starSrc = a.identity_key ? a : (a0.identity_key ? { ...a0 } : null);
  if (starSrc && window.Fav) { const st = Fav.starButton(starSrc); st.classList.add('head-star'); head.appendChild(st); }
  detail.appendChild(head);

  // 선수 요약 대시보드: PB · 다음 대회 · 오늘의 훈련 포인트
  const dashBox = el('div', 'block');
  detail.appendChild(dashBox);
  renderAthleteDashboard(a, rows, dashBox);

  // 해당 연도 랭킹 (비동기로 채움)
  const rankBox = el('div', 'block', `<h3>${RANK_YEAR} ${t('랭킹')} <span class="sub2">${t('국내 대회 · 종목별')}</span></h3><div class="muted">${t('계산 중…')}</div>`);
  detail.appendChild(rankBox);
  renderRankings(a, rows, rankBox);

  // 지역(소속) 분석: 지역 내/전국 등위 · 라이벌 · 지역 강도 · 백분위
  const regionBox = el('div', 'block');
  detail.appendChild(regionBox);
  renderRegional(a, regionBox);

  // 심화 분석 (추이·일관성·시리즈피로·결선전환·국제백분위)
  if (window.Analytics) Analytics.render(a, rows, detail);

  // 25m 단계 분석 (완사/속사·시간단계)
  const stageBox = el('div', 'block');
  detail.appendChild(stageBox);
  render25mStages(a, stageBox);

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
  const box = el('div', 'block', `<h3>${t('연도별 성적')} <span class="sub2">${t('국내·국제 전체 · 종목별')}</span></h3>`);
  const byYear = new Map();
  rows.forEach(r => (byYear.get(r.competition.year) || byYear.set(r.competition.year, []).get(r.competition.year)).push(r));
  [...byYear.keys()].sort((a, b) => b - a).forEach(year => {
    const yr = byYear.get(year), ysec = el('div', 'ysec');
    const im = { gold: 0, silver: 0, bronze: 0 }, tm = { gold: 0, silver: 0, bronze: 0 }; let fin = 0;
    yr.forEach(r => { if (r.medal) im[r.medal]++; if (r.team_medal) tm[r.team_medal]++; if (r.final_score != null) fin++; });
    ysec.appendChild(el('div', 'ysec-h',
      `<span class="yy">${year}</span> ${t('개인메달')} ${im.gold}·${im.silver}·${im.bronze} · ${t('단체메달')} ${tm.gold}·${tm.silver}·${tm.bronze} · ${t('결선')} ${fin}${t('회')}`));
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
        perShot = ` · ${t('한발당')} ${(ps.reduce((s, v) => s + v, 0) / ps.length).toFixed(2)}`;
      }
      // 경기별 세부 기록 (최신순)
      const games = list.slice().sort((x, y) => ((y.match_date || y.competition.date_start || '') + '').localeCompare((x.match_date || x.competition.date_start || '') + ''));
      const gameLine = r => {
        const d = (r.match_date || r.competition.date_start || '').slice(5).replace('-', '.');
        const med = r.medal ? medalBadge(r.medal) : '';
        const plc = r.placement ? `<span class="eg-plc">${r.placement}${t('위')}</span>` : '';
        const x = r.inner_tens != null ? ` <span class="eg-x">X${r.inner_tens}</span>` : '';
        const fin = r.final_score != null ? ` · ${t('결선')} <b>${r.final_score}</b>` : '';
        const ser = (r.series && r.series.length) ? `<div class="eg-ser">${r.series.map(s => s.score).join(' · ')}</div>` : '';
        return `<div class="es-game"><span class="eg-d">${d}</span>
          <span class="eg-c">${esc(r.competition.name)}</span>
          <span class="eg-sc">${med}${t('본선')} <b>${num(r.qual_total)}</b>${x}${fin} ${plc}</span>${ser}</div>`;
      };
      const row = el('div', 'ev-stat');
      row.innerHTML = `<div class="es-h">${esc(eventLabel(e))} ${ageChip(e)} <span class="es-n">${list.length}${t('경기')}</span></div>
        <div class="es-line">${t('평균')} <b>${avg.toFixed(1)}</b> · ${t('최고')} ${best} · ${t('최저')} ${worst}${finN ? ` · ${t('결선')} ${finN}${t('회')}${perShot}` : ''}</div>
        <div class="es-series">${t('시리즈 평균')} ${sAvg.join(' / ')}</div>
        <div class="es-games">${games.map(gameLine).join('')}</div>`;
      ysec.appendChild(row);
    });
    box.appendChild(ysec);
  });
  return box;
}

// 해당 연도 랭킹(전체·연령별 × 평균·최고) — 국내 종목별
// 소속코드 → 지역 표기
const REGION = { HAP: '하이퐁', HCM: '호치민', HAN: '하노이', DAN: '다낭', QUD: '군', CAD: '경찰', CAN: '경찰', QNI: '꽝닌', DON: '동나이', DAL: '닥락', THH: '타인호아', PHU: '푸토', BAC: '박닌', VPH: '빈푹' };
const regionShort = u => (REGION[u] ? t(REGION[u]) : u);
const regionLabel = u => (REGION[u] ? `${t(REGION[u])} (${esc(u)})` : esc(u));

// 지역(소속) 분석 렌더 — 초등학생도 한눈에 이해되게 쉬운 말·그림으로
async function renderRegional(a, box) {
  box.innerHTML = `<h3>${t('지역 분석')} <span class="sub2">${t('소속 기준 · 전국 대비')}</span></h3><div class="muted">${t('계산 중…')}</div>`;
  let R = null;
  try { R = await DB.regionalAnalysis(a.id, RANK_YEAR); } catch (e) { }
  if (!R || !R.disciplines.length) { box.innerHTML = ''; return; }
  // 등수 → 쉬운 말/이모지
  const grade = (rank, n) => { const p = rank / n; return p <= 0.1 ? [t('아주 잘해요'), '🔥', 'top'] : p <= 0.25 ? [t('잘하는 편'), '👍', 'good'] : p <= 0.5 ? [t('보통'), '🙂', 'mid'] : [t('더 힘내요'), '🌱', 'low']; };
  // 1등~꼴찌 눈금에 내 위치 표시
  const rankLine = (rank, n) => {
    const pos = n > 1 ? Math.round((rank - 1) / (n - 1) * 100) : 0;
    return `<div class="rankline">
      <span class="rl-end">🥇1${t('등')}<i>${t('제일 잘함')}</i></span>
      <div class="rl-track"><span class="rl-me" style="left:${pos}%">${t('나')} ${rank}${t('등')}</span></div>
      <span class="rl-end">${n}${t('등')}<i>${t('마지막')}</i></span></div>`;
  };
  const region = regionShort(R.region);
  let h = '';

  // 1) 종목별 순위 (지역 & 전국)
  h += `<div class="rgn-card newf"><div class="rgn-h">🏆 ${t('종목별 순위')} · <b>${regionLabel(R.region)}</b></div>
    <div class="rgn-help">${t('같은 지역 선수 중 몇 등, 전국에서 몇 등인지 쉽게 보여줘요.')}</div>`;
  R.disciplines.forEach(dz => {
    const [word, emoji, cls] = grade(dz.natRank, dz.natN);
    const topPct = Math.max(1, Math.round(dz.natRank / dz.natN * 100));
    h += `<div class="rk2">
      <div class="rk2-h"><span class="rk2-disc">${DISC[dz.disc] || dz.disc}${GENDER[dz.gender] ? ` <span class="gsm">${GENDER[dz.gender]}</span>` : ''}</span>
        <span class="rk2-best">${t('최고점')} <b>${dz.my}</b>${t('점')}</span></div>
      <div class="rk2-cards">
        <div class="rk2-stat reg"><span class="rk2-ic">🏅</span><span class="rk2-lab">${region}</span><span class="rk2-big"><b>${dz.regRank}</b>${t('등')}</span><span class="rk2-of">${dz.regN}${t('명 중')}</span></div>
        <div class="rk2-stat nat"><span class="rk2-ic">🇻🇳</span><span class="rk2-lab">${t('전국')}</span><span class="rk2-big"><b>${dz.natRank}</b>${t('등')}</span><span class="rk2-of">${dz.natN}${t('명 중')}</span></div>
      </div>
      ${rankLine(dz.regRank, dz.regN)}
      <div class="rk2-tag ${cls}">${emoji} ${word} · ${t('전국')} ${t('상위')} ${topPct}% <span class="rk2-plain">(${t('100명이면')} ${topPct}${t('등')})</span></div>
    </div>`;
  });
  h += `</div>`;

  // 2) 지역 라이벌 (주 종목)
  const main = R.disciplines[0];
  if (main.rivals.length > 1) {
    h += `<div class="rgn-card newf"><div class="rgn-h">🤝 ${t('우리 지역 잘하는 친구들')} <span class="sub2">${region} · ${DISC[main.disc] || main.disc}</span></div>
      <div class="rgn-help">${t('같은 지역·같은 종목 선수를 점수 순으로 줄 세웠어요.')}</div>`;
    main.rivals.forEach(rv => {
      const badge = rv.rank <= 3 ? ['🥇', '🥈', '🥉'][rv.rank - 1] : rv.rank;
      h += `<div class="rival${rv.isMe ? ' me' : ''}"><span class="pos">${badge}</span><span>${esc(rv.name)}${rv.isMe ? `<span class="tagme">${t('바로 나')}</span>` : ''}</span><span class="q">${rv.q}${t('점')}</span></div>`;
    });
    h += `</div>`;
  }

  // 3) 우리 지역은 얼마나 셀까 (지역 강도)
  if (R.strength && R.strength.regions.length > 1) {
    const rs = R.strength.regions;
    const myRank = rs.findIndex(x => x.isMine) + 1;
    h += `<div class="rgn-card newf"><div class="rgn-h">🏙️ ${t('우리 지역은 얼마나 셀까?')}</div>
      <div class="rgn-help">${t('지역마다 제일 잘하는 선수의 점수를 비교했어요.')} · ${DISC[R.strength.disc] || R.strength.disc}${myRank ? ` · <b class="hl">${region} ${t('전국')} ${myRank}${t('등')}</b>` : ''}</div>`;
    rs.forEach((x, i) => {
      const badge = i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}`;
      h += `<div class="str2${x.isMine ? ' me' : ''}"><span class="str2-rk">${badge}</span><span class="str2-nm">${regionShort(x.unit)}${x.isMine ? ` <span class="str2-me">${t('우리 지역')}</span>` : ''}</span><span class="str2-v">${x.best}${t('점')}</span></div>`;
    });
    h += `</div>`;
  }
  box.innerHTML = h;
}

// 25m 단계 분석 (완사·속사 / 150″·20″·10″ / 8″·6″·4″)
async function render25mStages(a, box) {
  box.innerHTML = `<h3>${t('25m 단계 분석')} <span class="sub2">${t('완사·속사·시간단계')} · ${t('전체 기간')}</span></h3><div class="muted">${t('계산 중…')}</div>`;
  let data = [];
  try { data = await DB.stageAnalysis(a.id); } catch (e) { }
  if (!data.length) { box.innerHTML = ''; return; }
  const spark = vals => {
    if (vals.length < 2) return '';
    const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1, W = 88, H = 22;
    const pts = vals.map((v, i) => `${(i * W / (vals.length - 1)).toFixed(1)},${(2 + (1 - (v - mn) / rng) * (H - 4)).toFixed(1)}`).join(' ');
    return `<svg class="stg-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${pts}"/><circle cx="${W}" cy="${(2 + (1 - (vals[vals.length - 1] - mn) / rng) * (H - 4)).toFixed(1)}" r="2"/></svg>`;
  };
  let h = '';
  data.forEach(dz => {
    const avgs = dz.stages.map(s => s.avg), worst = Math.min(...avgs), best = Math.max(...avgs), gap = best - worst;
    const lo = Math.min(...avgs) - 2, hi = Math.max(...avgs) + 2, span = (hi - lo) || 1;
    h += `<div class="stg-card"><div class="rgn-h">🎯 ${esc(DISC[dz.disc] || dz.disc)} <span class="sub2">${dz.games}${t('경기')}</span></div>`;
    dz.stages.forEach(s => {
      const weak = s.avg === worst && dz.stages.length > 1;
      const w = 30 + ((s.avg - lo) / span) * 70;
      h += `<div class="stg-row${weak ? ' weak' : ''}">
        <span class="stg-k">${t(s.key)}${weak ? ` <span class="stg-tag">${t('약함')}</span>` : ''}</span>
        <span class="stg-bar"><i style="width:${w.toFixed(0)}%"></i></span>
        <span class="stg-v">${s.avg.toFixed(1)}</span>
        <span class="stg-spk">${spark(s.vals)}</span>
        <span class="stg-nat">${t('전국')} ${s.natRank}/${s.natN}</span></div>`;
    });
    if (dz.stages.length > 1) {
      const ws = dz.stages.find(s => s.avg === worst);
      h += `<div class="stg-gap">${t('단계 격차')} <b>${gap.toFixed(1)}${t('점')}</b> · <span class="hl">${t(ws.key)} ${t('보강 필요')}</span></div>`;
    }
    h += `</div>`;
  });
  box.innerHTML = `<h3>${t('25m 단계 분석')} <span class="sub2">${t('완사·속사·시간단계')} · ${t('전체 기간')}</span></h3><div class="rgn-help">${t('한 종목 안에서 시간·방식이 다른 단계로 나눠 강약을 봐요. (10발 평균)')}</div>` + h;
}

async function renderRankings(a, rows, box) {
  const evs = new Map();
  rows.forEach(r => { if (r.competition.year !== RANK_YEAR || r.event.team_type !== 'individual' || r.is_dnf || r.qual_total == null) return; if (r.competition.scope !== 'domestic') return; evs.set(evKey(r.event), r.event); });
  if (!evs.size) { const m = box.querySelector('.muted'); if (m) m.textContent = `${RANK_YEAR}${t('년 국내 개인전 기록이 없습니다.')}`; return; }
  const rankOf = (arr, key) => { const s = [...arr].sort((x, y) => y[key] - x[key]); const i = s.findIndex(o => o.athlete_id === a.id); return i < 0 ? null : `${i + 1}/${s.length}`; };
  const parts = [];
  for (const [, e] of evs) {
    const [ageAgg, openAgg] = await Promise.all([
      DB.eventAvg({ year: RANK_YEAR, discipline: e.discipline, gender: e.gender, age_category: e.age_category }),
      DB.eventAvg({ year: RANK_YEAR, discipline: e.discipline, gender: e.gender }),
    ]);
    parts.push(`<div class="rk-ev"><div class="rk-evn">${esc(eventLabel(e))}</div>
      <table class="rk-tab"><tr><th></th><th>${t('평균순위')}</th><th>${t('최고순위')}</th></tr>
      <tr><td>${t('전체')}</td><td>${rankOf(openAgg, 'avg_qual') || '-'}</td><td>${rankOf(openAgg, 'best_qual') || '-'}</td></tr>
      <tr><td>${t('연령부')}</td><td>${rankOf(ageAgg, 'avg_qual') || '-'}</td><td>${rankOf(ageAgg, 'best_qual') || '-'}</td></tr></table></div>`);
  }
  box.innerHTML = `<h3>${RANK_YEAR} ${t('랭킹')} <span class="sub2">${t('국내 · 종목별 (순위/인원)')}</span></h3><div class="rk-grid">${parts.join('')}</div>`;
}

function resultRow(r) {
  const row = el('div', 'res');
  const md = mdText(r);
  const ser = r.series && r.series.length
    ? `<div class="series">${r.series.map(s => `<span>${s.score}</span>`).join('')}${r.inner_tens != null ? `<span class="x">X${r.inner_tens}</span>` : ''}</div>` : '';
  const tm = r.team_medal ? ` <span class="medal ${r.team_medal}" title="${t('단체')}">${MEDAL[r.team_medal]}</span><span class="tmlbl">${t('단체')}</span>` : '';
  row.innerHTML = `
    <div class="res-top">
      <div class="res-ev">${esc(eventLabel(r.event))} ${ageChip(r.event)}${md ? `<span class="md">${md}</span>` : ''}</div>
      <div class="res-place">${placementCell(r)}</div>
    </div>
    <div class="res-scores">
      <span>${t('본선')} <b>${num(r.qual_total)}</b></span>
      ${r.final_score != null ? `<span>${t('결선')} <b>${r.final_score}</b></span>` : ''}
      <span class="unit">${esc(r.unit_code || '')}</span>
      ${r.qual_rank ? `<span class="rk">${t('본선')} ${r.qual_rank}${t('위')}</span>` : ''}
      ${r.final_rank ? `<span class="rk">${t('결선')} ${r.final_rank}${t('위')}</span>` : ''}${tm}
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
    list.innerHTML = `<div class="muted">${t('불러오는 중…')}</div>`;
    const cs = await DB.competitions(yearSel.value, scopeSel.value);
    cnt.textContent = `${t('대회')} ${cs.length}${t('개')}`;
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
    panel.innerHTML = `<div class="muted">${t('불러오는 중…')}</div>`;
    const evs = await DB.eventsOf(c.id);
    panel.innerHTML = '';
    const bar = el('div', 'ev-tabs'), body = el('div', 'ev-panel');
    evs.forEach((e, i) => {
      const dstr = e.match_date ? e.match_date.slice(5).replace('-', '.') + ((e.match_dates && e.match_dates.length > 1) ? '+' : '') : '';
      const tabBtn = el('button', 'ev-tab');
      tabBtn.innerHTML = `<span class="et-name">${esc(eventLabel(e))}</span>${dstr ? `<span class="et-date">${dstr}</span>` : ''}`;
      tabBtn.onclick = async () => {
        bar.querySelectorAll('.ev-tab').forEach(x => x.classList.remove('on')); tabBtn.classList.add('on');
        body.innerHTML = `<div class="muted">${t('불러오는 중…')}</div>`;
        const rk = await DB.eventRanking(e.id);
        body.innerHTML = ''; body.appendChild(rankingBlock(rk, e));
      };
      bar.appendChild(tabBtn);
      if (i === 0) setTimeout(() => tabBtn.click(), 0);
    });
    panel.appendChild(bar); panel.appendChild(body);
  }
  yearSel.onchange = load; scopeSel.onchange = load;
  load();
};

// 연맹 원본 이벤트 페이지 딥링크 (event-all.html?name=..&date=..&competition=..)
function sourceEventUrl(rows, e) {
  const base = window.APP_CONFIG && window.APP_CONFIG.sourceEventBase;
  const r0 = rows && rows[0]; if (!base || !r0) return null;
  const rawName = r0.raw_event_name, comp = r0.competition && r0.competition.name;
  if (!rawName || !comp) return null;
  const d = r0.match_date || (e && e.match_date) || '';
  const date = d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : '';
  const year = (r0.competition && r0.competition.year) || (d ? d.slice(0, 4) : '');
  const isTeam = e && e.team_type && e.team_type !== 'individual';
  // 공백을 %20으로 인코딩(연맹 사이트 파서 호환) — URLSearchParams의 '+' 대신 encodeURIComponent 사용
  const params = {
    name: rawName, date, time: r0.match_time || '', year: String(year || ''),
    competition: comp, hasFinal: (e && e.has_final) ? '1' : '0', pdfFinal: '',
    openTab: isTeam ? 'Đồng đội' : 'Cá nhân',
  };
  const qs = Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
  return `${base}?${qs}`;
}

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
  // 연맹 원본 이벤트 페이지 딥링크
  const srcUrl = sourceEventUrl(rows, e);
  if (srcUrl) {
    const a = el('a', 'ev-src');
    a.href = srcUrl; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.innerHTML = `🔗 ${t('연맹 원본에서 보기')}`;
    wrap.appendChild(a);
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
      tb.appendChild(el('div', 'finals-h', t('단체 순위')));
      teams.forEach((mem, i) => {
        const names = mem.map(m => `<button class="lnk" data-aid="${m.athlete_id}">${esc(m.athlete.full_name)}</button>`).join(', ');
        const fr = el('div', 'team-row');
        fr.innerHTML = `<span class="fp">${medalBadge(mem[0].team_medal)}${i + 1}${t('위')}</span>
          <span class="tn"><b class="tu">${esc(mem[0].unit_code || '')}</b> ${names}</span>
          <span class="fs">${t('합계')} <b>${sum(mem).toFixed(1)}</b></span>`;
        tb.appendChild(fr);
      });
      wrap.appendChild(tb);
      wrap.appendChild(el('div', 'note', t('※ 원본 시트에는 메달 수상 팀만 기재되어 4위 이하 단체 순위는 제공되지 않습니다.')));
    }
    wrap.appendChild(el('div', 'sub-h', t('개인 기록 (구성원별)')));
    wrap.appendChild(rankingTable(rows));
    return wrap;
  }

  // 개인 종목: 상위 8위(종합등위 기준) + 본선 순위
  // 결선 점수가 일부만 기재된 종목도 등위 1~8위는 항상 표시된다.
  const top8 = rows.filter(r => r.placement && r.placement <= 8).sort((a, b) => a.placement - b.placement);
  const hasFinalData = rows.some(r => r.final_score != null);
  if (top8.length) {
    const fb = el('div', 'finals');
    fb.appendChild(el('div', 'finals-h', hasFinalData ? t('결선 결과 (상위 8위)') : t('상위 8위')));
    top8.forEach(r => {
      const fr = el('div', 'final-row');
      const score = r.final_score != null ? `${t('결선')} <b>${r.final_score}</b>` : `${t('본선')} ${num(r.qual_total)}`;
      fr.innerHTML = `<span class="fp">${medalBadge(r.medal)}${r.placement}${t('위')}</span>
        <span class="fn"><button class="lnk" data-aid="${r.athlete_id}">${esc(r.athlete.full_name)}</button></span>
        <span class="fu">${esc(r.unit_code || '')}</span>
        <span class="fs">${score}</span>`;
      fb.appendChild(fr);
    });
    wrap.appendChild(fb);
  }
  wrap.appendChild(el('div', 'sub-h', t('본선 순위')));
  wrap.appendChild(rankingTable(rows));
  return wrap;
}

// 경기구분 코드 해석: C=개인전, C1~=단체전, K=번외
function partInfo(code) {
  if (!code) return null;
  if (code === 'C') return { label: t('개인전'), cls: 'c' };
  if (/^C[1-9]/.test(code)) return { label: t('단체전'), cls: 'c1' };
  if (code === 'K') return { label: t('번외'), cls: 'k' };
  return { label: code, cls: 'x' };
}
// 조·사대·경기구분 칩
function slotMeta(r, opts = {}) {
  const out = [];
  if (r.relay) out.push(`<span class="slot-chip">${t('조')} ${esc(String(r.relay))}</span>`);
  if (!opts.skipFiring && r.firing_point) out.push(`<span class="slot-chip">${t('사대')} ${esc(String(r.firing_point))}</span>`);
  const pi = partInfo(r.part_code);
  if (pi) out.push(`<span class="part-badge ${pi.cls}">${pi.label}</span>`);
  return out.join('');
}

// 출전 명단(결과 대기 중) — 아직 점수가 입력되지 않은 종목
function startList(rows) {
  const box = el('div', 'startlist');
  box.appendChild(el('div', 'finals-h', `📋 ${t('출전 명단')} · ${t('결과 대기 중')} <span class="sl-n">${rows.length}${t('명 출전')}</span>`));
  box.appendChild(el('div', 'sl-head', `<span>${t('사대')}</span><span>${t('선수')}</span><span>${t('소속')}</span>`));
  // 사대번호(있으면) 순, 없으면 이름순
  const sorted = rows.slice().sort((a, b) => {
    const fa = +(a.firing_point || a.bib || 0), fb = +(b.firing_point || b.bib || 0);
    if (fa && fb && fa !== fb) return fa - fb;
    return (a.athlete.full_name || '').localeCompare(b.athlete.full_name || '');
  });
  sorted.forEach(r => {
    const pos = r.firing_point || r.bib || '';
    const meta = slotMeta(r, { skipFiring: true });
    const row = el('div', 'sl-row');
    row.innerHTML =
      `<span class="sl-pos">${pos ? esc(String(pos)) : '–'}</span>
       <span class="sl-nm"><span class="sl-nmline"><button class="lnk" data-aid="${r.athlete_id}">${esc(r.athlete.full_name)}</button>${r.athlete.gender ? ` <span class="g g-${r.athlete.gender}">${GENDER[r.athlete.gender]}</span>` : ''}</span>${meta ? `<span class="sl-meta">${meta}</span>` : ''}</span>
       <span class="sl-unit">${esc(r.unit_code || '')}</span>`;
    if (window.Fav && r.athlete && r.athlete.identity_key) row.querySelector('.sl-nmline').appendChild(Fav.starButton(r.athlete, { inline: true }));
    box.appendChild(row);
  });
  return box;
}

function rankingTable(rows) {
  const tbl = el('table', 'rank');
  tbl.innerHTML = `<thead><tr><th>${t('등위')}</th><th>${t('선수')}</th><th>${t('소속')}</th><th>${t('본선')}</th><th>X</th><th>${t('결선')}</th></tr></thead>`;
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
  tbl.appendChild(tb);
  const w = el('div', 'table-wrap'); w.appendChild(tbl); return w;
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
    out.innerHTML = `<div class="muted">${t('불러오는 중…')}</div>`;
    const rows = await DB.medals({ year: yearSel.value, discipline: discSel.value, scope: scopeSel.value });
    if (!rows.length) { out.innerHTML = `<div class="muted">${t('해당 조건의 입상 기록이 없습니다.')}</div>`; cnt.textContent = ''; return; }
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
            <span class="sc">${t('본선')} ${num(r.qual_total)}${r.final_score != null ? ' · ' + t('결선') + ' ' + r.final_score : ''}</span>
            <span class="rk">${r.qual_rank ? t('본선') + ' ' + r.qual_rank + t('위') : ''}${r.final_rank ? ' · ' + t('결선') + ' ' + r.final_rank + t('위') : ''}</span>`;
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
          <span class="sc">${t('팀 합계')} ${total ? total.toFixed(1) : '–'}</span>
          <span class="rk">${t('단체')}</span>`;
        sec.appendChild(row);
      });
      out.appendChild(sec);
    });
    cnt.textContent = `${t('개인')} ${indivN} · ${t('단체')} ${teamN}${t('건')}`;
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
    out.innerHTML = `<div class="muted">${t('불러오는 중…')}</div>`;
    const rows = await DB.eventAvg({ discipline: discSel.value, gender: gSel.value, age_category: ageSel.value });
    cnt.textContent = `${rows.length}${t('명')} · ${t('국내 대회 평균 본선점수 순')}`;
    if (!rows.length) { out.innerHTML = `<div class="muted">${t('해당 조건의 기록이 없습니다.')}</div>`; return; }
    const tbl = el('table', 'rank rank-avg');
    tbl.innerHTML = `<thead><tr><th>${t('순위')}</th><th>${t('선수')}</th><th>${t('소속')}</th><th>${t('나이')}</th><th>${t('경기')}</th><th>${t('평균')}</th><th>${t('최고')}</th></tr></thead>`;
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
    tbl.appendChild(tb);
    out.innerHTML = ''; const w = el('div', 'table-wrap'); w.appendChild(tbl); out.appendChild(w);
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
  body.innerHTML = `<div class="muted">${t('불러오는 중…')}</div>`;
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
    <div class="ip-row"><b>${t('데이터 기준')}</b> ${esc(meta.generated_at || '-')} · ${DB_MODE === 'local' ? t('로컬 미리보기') : 'Supabase'}</div>
    <div class="ip-row"><b>${t('자동 갱신')}</b> ${t('공개 시트를 주기적으로 자동 반영합니다(약 30분~1시간).')}</div>
    <div class="ip-row"><b>${t('출처')}</b> ${t('베트남 사격연맹 공개 기록시트')}</div>
    ${(window.APP_CONFIG && window.APP_CONFIG.sourceUrl) ? `<a class="ip-sheet" href="${esc(window.APP_CONFIG.sourceUrl)}" target="_blank" rel="noopener noreferrer">🔗 ${t('연맹 원본 페이지 열기')}</a>` : ''}
    ${c.results ? `<div class="ip-row"><b>${t('수록')}</b> ${t('대회')} ${c.competitions} · ${t('선수')} ${c.athletes} · ${t('성적')} ${c.results}</div>` : ''}
    <div class="ip-row"><b>${t('등위')}</b> ${t('원본에 등위 컬럼이 없어 국제 규정 6.15.1로 계산한 값입니다(이너텐→마지막 시리즈 카운트백). 메달은 연맹 확정.')}</div>
    <div class="ip-row"><b>${t('완전성')}</b> ${t('결선 점수·시리즈는 시트에 기재된 경우만 표시됩니다. 온전한 데이터는 2025년~.')}</div>`;
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
