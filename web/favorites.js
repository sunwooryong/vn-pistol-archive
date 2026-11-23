'use strict';
// =====================================================================
//  선수 즐겨찾기 — localStorage 저장(식별키 기준, ETL 재적재해도 유지)
//  그룹 분류 + 빠른 이동 + 선수 비교. app.js 전역(el,esc,GENDER,DISC,openAthleteModal,DB) 사용.
// =====================================================================
window.Fav = (function () {
  const LS = 'vpa_fav_v1';
  const t = k => (window.t ? window.t(k) : k);
  const COACH_GROUP = '내 지도';
  const DEFAULT_GROUPS = [COACH_GROUP, '국가대표', '청소년 국가대표', '후보 선수', '관심 선수', '기타'];
  let state = load();
  const listeners = [];
  const discCache = new Map();   // key → 주력 종목 코드 (종목순 정렬용, 1회 로드 후 캐시)
  const FAV_SORTS = { name: '이름순', age_young: '나이 어린순', age_old: '나이 많은순', gender: '성별순', disc: '종목순' };

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(LS));
      if (s && s.groups && s.items) {
        if (!s.groups.includes(COACH_GROUP)) s.groups.unshift(COACH_GROUP); // 마이그레이션: '내 지도' 보강
        return s;
      }
    } catch (e) { }
    return { groups: DEFAULT_GROUPS.slice(), items: {} };
  }
  let cloudSave = null;
  function save() {
    if (cloudSave) cloudSave(JSON.parse(JSON.stringify(state)));
    else localStorage.setItem(LS, JSON.stringify(state));
    listeners.forEach(f => f());
  }
  function onChange(f) { listeners.push(f); }
  // 로그인 사용자: Supabase 를 백엔드로 사용
  function setCloud(data, saveFn) {
    cloudSave = saveFn;
    if (data && data.items) {
      state = { groups: data.groups || DEFAULT_GROUPS.slice(), items: data.items };
      if (!state.groups.includes(COACH_GROUP)) state.groups.unshift(COACH_GROUP); // 마이그레이션: 클라우드에도 '내 지도' 보강
    }
    else { save(); }  // 클라우드에 없으면 현재(로컬) 즐겨찾기를 올림
    listeners.forEach(f => f());
  }

  const snap = o => ({
    key: o.identity_key, name: o.full_name, birth_year: o.birth_year || null,
    gender: o.gender || null, nationality: o.nationality || null, is_foreign: !!o.is_foreign,
  });

  const has = key => !!state.items[key];
  const get = key => state.items[key];
  function add(athObj, group) {
    const s = snap(athObj); if (!s.key) return;
    state.items[s.key] = { ...s, group: group || state.groups[0], added: Object.keys(state.items).length };
    save();
  }
  function remove(key) { delete state.items[key]; save(); }
  function setGroup(key, group) { if (state.items[key]) { state.items[key].group = group; save(); } }
  function groups() { return state.groups.slice(); }
  function addGroup(name) { name = (name || '').trim(); if (name && !state.groups.includes(name)) { state.groups.push(name); save(); } }
  function deleteGroup(name) {
    if (!state.groups.includes(name)) return;
    const fallback = state.groups.find(g => g !== name) || '기타';
    Object.values(state.items).forEach(it => { if (it.group === name) it.group = fallback; });
    state.groups = state.groups.filter(g => g !== name); save();
  }
  function byGroup() {
    const m = new Map(state.groups.map(g => [g, []]));
    Object.values(state.items).forEach(it => { if (!m.has(it.group)) m.set(it.group, []); m.get(it.group).push(it); });
    return m;
  }
  const count = () => Object.keys(state.items).length;

  // 별 버튼(추가/그룹변경/삭제 팝오버)
  function starButton(athObj, opts) {
    const s = snap(athObj);
    const wrap = el('span', 'fav-star' + (opts && opts.inline ? ' inline' : ''));
    const render = () => {
      const on = has(s.key);
      wrap.innerHTML = `<button class="star-btn ${on ? 'on' : ''}" title="${t('즐겨찾기')}">${on ? '★' : '☆'}</button>`;
    };
    render();
    wrap.addEventListener('click', e => {
      e.stopPropagation();
      const menu = el('div', 'star-menu');
      const cur = get(s.key);
      menu.innerHTML =
        `<div class="sm-h">${esc(s.name)}</div>` +
        groups().map(g => `<button class="sm-g ${cur && cur.group === g ? 'sel' : ''}" data-g="${esc(g)}">${cur && cur.group === g ? '● ' : ''}${esc(t(g))}</button>`).join('') +
        (has(s.key) ? `<button class="sm-rm">✕ ${t('즐겨찾기 해제')}</button>` : '');
      document.body.appendChild(menu);
      const r = wrap.getBoundingClientRect();
      menu.style.top = (r.bottom + window.scrollY + 4) + 'px';
      menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 200)) + 'px';
      const close = () => { menu.remove(); document.removeEventListener('click', close); };
      menu.querySelectorAll('.sm-g').forEach(b => b.onclick = ev => { ev.stopPropagation(); if (has(s.key)) setGroup(s.key, b.dataset.g); else add(athObj, b.dataset.g); render(); close(); });
      const rm = menu.querySelector('.sm-rm'); if (rm) rm.onclick = ev => { ev.stopPropagation(); remove(s.key); render(); close(); };
      setTimeout(() => document.addEventListener('click', close), 0);
    });
    onChange(render);
    return wrap;
  }

  // ---------- 즐겨찾기 탭 ----------
  let compareMode = false; const compareSel = new Set();
  async function renderTab(container) {
    container.innerHTML = '';
    let sortMode = localStorage.getItem('vpa_fav_sort'); if (!FAV_SORTS[sortMode]) sortMode = 'name';
    const bar = el('div', 'fav-bar');
    bar.innerHTML = `<button id="fav-cmp" class="${compareMode ? 'on' : ''}">${t('비교 모드')}</button>
      <button id="fav-addg">+ ${t('그룹')}</button>
      <select id="fav-sort" class="fav-sortsel" title="${t('정렬')}">${Object.entries(FAV_SORTS).map(([k, lab]) => `<option value="${k}"${k === sortMode ? ' selected' : ''}>${t(lab)}</option>`).join('')}</select>
      <span class="count">${count()}${t('명')} ${t('저장됨')}</span>`;
    container.appendChild(bar);
    bar.querySelector('#fav-cmp').onclick = () => { compareMode = !compareMode; compareSel.clear(); renderTab(container); };
    bar.querySelector('#fav-addg').onclick = () => { const n = prompt(t('새 그룹 이름')); if (n) { addGroup(n); renderTab(container); } };
    bar.querySelector('#fav-sort').onchange = e => { localStorage.setItem('vpa_fav_sort', e.target.value); renderTab(container); };
    // 종목순 선택 시 주력 종목 미리 로드(1회 캐시)
    if (sortMode === 'disc') {
      const need = list().filter(it => !discCache.has(it.key));
      if (need.length) { bar.querySelector('.count').textContent = t('정렬 중…'); await Promise.all(need.map(async it => { try { const a = await DB.athleteByKey(it.key); if (a) { const s = summarize(await DB.athleteCareer(a.id)); const md = Object.entries(s.perDisc).sort((x, y) => y[1].n - x[1].n)[0]; discCache.set(it.key, md ? md[0] : 'zzz'); } else discCache.set(it.key, 'zzz'); } catch (e) { discCache.set(it.key, 'zzz'); } })); bar.querySelector('.count').textContent = `${count()}${t('명')} ${t('저장됨')}`; }
    }
    const favNm = it => (it.name || it.full_name || it.key || '');
    const favBirth = it => { const p = (it.key || '').split('|'); return it.birth_year || (+p[1] || null); };
    const favGen = it => { const p = (it.key || '').split('|'); return it.gender || p[2] || ''; };
    const sortItems = arr => {
      const c = arr.slice();
      if (sortMode === 'age_young') c.sort((a, b) => (favBirth(b) || 0) - (favBirth(a) || 0) || favNm(a).localeCompare(favNm(b)));
      else if (sortMode === 'age_old') c.sort((a, b) => (favBirth(a) || 9999) - (favBirth(b) || 9999) || favNm(a).localeCompare(favNm(b)));
      else if (sortMode === 'gender') c.sort((a, b) => String(favGen(a)).localeCompare(String(favGen(b))) || (favBirth(a) || 9999) - (favBirth(b) || 9999) || favNm(a).localeCompare(favNm(b)));
      else if (sortMode === 'disc') c.sort((a, b) => String(discCache.get(a.key) || 'zzz').localeCompare(String(discCache.get(b.key) || 'zzz')) || favNm(a).localeCompare(favNm(b)));
      else c.sort((a, b) => favNm(a).localeCompare(favNm(b)));
      return c;
    };

    const cmpOut = el('div', 'cmp-out'); container.appendChild(cmpOut);

    if (!count()) { container.appendChild(el('div', 'muted', t('아직 저장한 선수가 없습니다. 선수 검색 → ☆ 를 눌러 그룹에 저장하세요.'))); return; }

    for (const [g, items] of byGroup()) {
      if (!items.length && !DEFAULT_GROUPS.includes(g)) continue;
      const sec = el('div', 'fav-sec');
      const delBtn = DEFAULT_GROUPS.includes(g) ? '' : `<button class="fav-delg" title="${t('그룹 삭제')}">✕</button>`;
      sec.appendChild(el('div', 'fav-h', `${esc(t(g))} <span class="fc">${items.length}</span>${delBtn}`));
      if (delBtn) sec.querySelector('.fav-delg').onclick = () => { if (confirm(`'${t(g)}' ` + t('그룹 삭제? (선수는 기타로 이동)'))) { deleteGroup(g); renderTab(container); } };
      const grid = el('div', 'fav-grid');
      const NOW = new Date().getFullYear();
      sortItems(items).forEach(it => {
        const card = el('div', 'fav-card');
        const chk = compareMode ? `<input type="checkbox" class="fav-chk" ${compareSel.has(it.key) ? 'checked' : ''}>` : '';
        const age = it.birth_year ? ` (${NOW - it.birth_year})` : '';
        card.innerHTML = `
          <div class="fc-top">${chk}
            <div class="fc-id"><b class="fc-name">${esc(it.name)}</b>${it.gender ? ` <span class="g g-${it.gender}">${GENDER[it.gender]}</span>` : ''}
              <span class="fsub">${it.birth_year ? it.birth_year + age : ''}${it.is_foreign ? ' · ' + esc(it.nationality || '') : ''}<span class="fc-region"></span></span></div>
            <button class="fav-rm" title="✕">✕</button></div>
          <div class="fc-stats muted">…</div>
          <div class="fc-actions">
            <select class="fav-mv">${groups().map(x => `<option value="${esc(x)}" ${x === it.group ? 'selected' : ''}>${esc(t(x))}</option>`).join('')}</select>
            <button class="fav-open">${window.t ? window.t('열기') : '열기'}</button></div>`;
        if (compareMode) card.querySelector('.fav-chk').onchange = e => { if (e.target.checked) compareSel.add(it.key); else compareSel.delete(it.key); runCompare(cmpOut); };
        card.querySelector('.fav-mv').onchange = e => setGroup(it.key, e.target.value);
        card.querySelector('.fav-open').onclick = async () => { const a = await DB.athleteByKey(it.key); if (a) openAthleteModal(a.id); };
        card.querySelector('.fav-rm').onclick = () => { remove(it.key); renderTab(container); };
        grid.appendChild(card);
        (async () => {
          const a = await DB.athleteByKey(it.key);
          const box = card.querySelector('.fc-stats');
          if (!a) { box.textContent = '—'; return; }
          const s = summarize(await DB.athleteCareer(a.id));
          const T2 = k => window.t ? window.t(k) : k;
          const rg = card.querySelector('.fc-region');   // 이름 밑 소속지역
          if (rg) rg.innerHTML = s.unit ? ' · 📍' + esc(window.regionLabel ? window.regionLabel(s.unit) : (window.regionShort ? window.regionShort(s.unit) : s.unit)) : '';
          const best = Object.entries(s.perDisc).sort((x, y) => y[1].best - x[1].best).slice(0, 2)
            .map(([d, v]) => `<span class="fc-pb">${(DISC[d] || d)} <b>${v.best}</b></span>`).join('');
          box.classList.remove('muted');
          box.innerHTML = `<div class="fc-medals"><span class="medal gold">${T2('금')}</span>${s.im.gold}
              <span class="medal silver">${T2('은')}</span>${s.im.silver}
              <span class="medal bronze">${T2('동')}</span>${s.im.bronze}
              <span class="fc-unit">${s.unit ? (window.regionShort ? esc(window.regionShort(s.unit)) : esc(s.unit)) : ''}</span></div>
            <div class="fc-pbs">${best || ''}</div>`;
        })();
      });
      sec.appendChild(grid);
      container.appendChild(sec);
    }
    if (compareMode) runCompare(cmpOut);
  }

  // ---------- 비교 ----------
  function summarize(rows) {
    const im = { gold: 0, silver: 0, bronze: 0 }; let fin = 0; const disc = {}; let unit = '', ud = '';
    rows.forEach(r => {
      if (r.medal) im[r.medal]++;
      if (r.final_score != null) fin++;
      if (r.event.team_type === 'individual' && !r.is_dnf && r.qual_total != null) {
        (disc[r.event.discipline] || (disc[r.event.discipline] = [])).push(r.qual_total);
      }
      // 현재 소속 = 가장 최근 '국내' 대회의 소속(클럽)
      if (r.competition.scope === 'domestic' && r.unit_code) {
        const k = (r.competition.date_start || '') + (r.match_date || '');
        if (k >= ud) { unit = r.unit_code; ud = k; }
      }
    });
    const perDisc = {};
    for (const d in disc) { const v = disc[d]; perDisc[d] = { best: Math.max(...v), avg: Math.round(v.reduce((s, x) => s + x, 0) / v.length * 10) / 10, n: v.length }; }
    return { im, fin, perDisc, unit, games: rows.length };
  }
  async function runCompare(out) {
    const keys = [...compareSel];
    if (keys.length < 2) { out.innerHTML = compareMode ? `<div class="muted">${t('비교할 선수를 2명 이상 선택하세요.')}</div>` : ''; return; }
    out.innerHTML = `<div class="muted">${t('비교 계산 중…')}</div>`;
    const cols = [];
    for (const key of keys.slice(0, 4)) {
      const it = get(key), a = await DB.athleteByKey(key);
      if (!a) continue;
      const rows = await DB.athleteCareer(a.id);
      cols.push({ it, sum: summarize(rows) });
    }
    const discs = [...new Set(cols.flatMap(c => Object.keys(c.sum.perDisc)))];
    const th = cols.map(c => `<th>${esc(c.it.name)}<span class="cby">${c.it.birth_year || ''}</span></th>`).join('');
    const rowsHtml = [];
    rowsHtml.push(`<tr><td>${t('소속')}</td>${cols.map(c => `<td>${esc(c.sum.unit || '-')}</td>`).join('')}</tr>`);
    rowsHtml.push(`<tr><td>${t('개인메달')}(${t('금')}·${t('은')}·${t('동')})</td>${cols.map(c => `<td>${c.sum.im.gold}·${c.sum.im.silver}·${c.sum.im.bronze}</td>`).join('')}</tr>`);
    rowsHtml.push(`<tr><td>${t('결선진출')}</td>${cols.map(c => `<td>${c.sum.fin}${t('회')}</td>`).join('')}</tr>`);
    discs.forEach(d => {
      rowsHtml.push(`<tr class="drow"><td>${esc(DISC[d] || d)} ${t('최고')}/${t('평균')}</td>${cols.map(c => { const p = c.sum.perDisc[d]; return `<td>${p ? `<b>${p.best}</b> / ${p.avg}` : '–'}</td>`; }).join('')}</tr>`);
    });
    out.innerHTML = `<div class="cmp-h">${t('선수 비교')}</div><div class="table-wrap"><table class="cmp"><thead><tr><th>${t('항목')}</th>${th}</tr></thead><tbody>${rowsHtml.join('')}</tbody></table></div>`;
  }

  function list() { return Object.values(state.items); }
  return { starButton, renderTab, has, count, onChange, setCloud, list, groups, byGroup, setGroup, addGroup, add, remove, COACH_GROUP };
})();
