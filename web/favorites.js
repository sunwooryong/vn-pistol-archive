'use strict';
// =====================================================================
//  선수 즐겨찾기 — localStorage 저장(식별키 기준, ETL 재적재해도 유지)
//  그룹 분류 + 빠른 이동 + 선수 비교. app.js 전역(el,esc,GENDER,DISC,openAthleteModal,DB) 사용.
// =====================================================================
window.Fav = (function () {
  const LS = 'vpa_fav_v1';
  const DEFAULT_GROUPS = ['국가대표', '청소년 국가대표', '후보 선수', '관심 선수', '기타'];
  let state = load();
  const listeners = [];

  function load() {
    try { const s = JSON.parse(localStorage.getItem(LS)); if (s && s.groups && s.items) return s; } catch (e) { }
    return { groups: DEFAULT_GROUPS.slice(), items: {} };
  }
  function save() { localStorage.setItem(LS, JSON.stringify(state)); listeners.forEach(f => f()); }
  function onChange(f) { listeners.push(f); }

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
      wrap.innerHTML = `<button class="star-btn ${on ? 'on' : ''}" title="즐겨찾기">${on ? '★' : '☆'}</button>`;
    };
    render();
    wrap.addEventListener('click', e => {
      e.stopPropagation();
      const menu = el('div', 'star-menu');
      const cur = get(s.key);
      menu.innerHTML =
        `<div class="sm-h">${esc(s.name)}</div>` +
        groups().map(g => `<button class="sm-g ${cur && cur.group === g ? 'sel' : ''}" data-g="${esc(g)}">${cur && cur.group === g ? '● ' : ''}${esc(g)}</button>`).join('') +
        (has(s.key) ? `<button class="sm-rm">✕ 즐겨찾기 해제</button>` : '');
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
    const bar = el('div', 'fav-bar');
    bar.innerHTML = `<button id="fav-cmp" class="${compareMode ? 'on' : ''}">비교 모드</button>
      <button id="fav-addg">+ 그룹</button>
      <span class="count">${count()}명 저장됨</span>`;
    container.appendChild(bar);
    bar.querySelector('#fav-cmp').onclick = () => { compareMode = !compareMode; compareSel.clear(); renderTab(container); };
    bar.querySelector('#fav-addg').onclick = () => { const n = prompt('새 그룹 이름'); if (n) { addGroup(n); renderTab(container); } };

    const cmpOut = el('div', 'cmp-out'); container.appendChild(cmpOut);

    if (!count()) { container.appendChild(el('div', 'muted', '아직 저장한 선수가 없습니다. 선수 검색 → ☆ 를 눌러 그룹에 저장하세요.')); return; }

    for (const [g, items] of byGroup()) {
      if (!items.length && !DEFAULT_GROUPS.includes(g)) continue;
      const sec = el('div', 'fav-sec');
      const delBtn = DEFAULT_GROUPS.includes(g) ? '' : `<button class="fav-delg" title="그룹 삭제">✕</button>`;
      sec.appendChild(el('div', 'fav-h', `${esc(g)} <span class="fc">${items.length}</span>${delBtn}`));
      if (delBtn) sec.querySelector('.fav-delg').onclick = () => { if (confirm(`'${g}' 그룹 삭제? (선수는 기타로 이동)`)) { deleteGroup(g); renderTab(container); } };
      items.sort((a, b) => a.name.localeCompare(b.name)).forEach(it => {
        const row = el('div', 'fav-row');
        const chk = compareMode ? `<input type="checkbox" class="fav-chk" ${compareSel.has(it.key) ? 'checked' : ''}>` : '';
        row.innerHTML = `${chk}
          <span class="fn"><b>${esc(it.name)}</b>${it.gender ? ` <span class="g g-${it.gender}">${GENDER[it.gender]}</span>` : ''}
            <span class="fsub">${it.birth_year ? it.birth_year + '년생' : ''}${it.is_foreign ? ' · ' + esc(it.nationality || '') : ''}</span></span>
          <select class="fav-mv">${groups().map(x => `<option ${x === it.group ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
          <button class="fav-open">열기</button>
          <button class="fav-rm">✕</button>`;
        if (compareMode) row.querySelector('.fav-chk').onchange = e => { if (e.target.checked) compareSel.add(it.key); else compareSel.delete(it.key); runCompare(cmpOut); };
        row.querySelector('.fav-mv').onchange = e => setGroup(it.key, e.target.value);
        row.querySelector('.fav-open').onclick = async () => { const a = await DB.athleteByKey(it.key); if (a) openAthleteModal(a.id); else alert('현재 데이터에서 이 선수를 찾을 수 없습니다.'); };
        row.querySelector('.fav-rm').onclick = () => { remove(it.key); renderTab(container); };
        sec.appendChild(row);
      });
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
    if (keys.length < 2) { out.innerHTML = compareMode ? '<div class="muted">비교할 선수를 2명 이상 선택하세요.</div>' : ''; return; }
    out.innerHTML = '<div class="muted">비교 계산 중…</div>';
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
    rowsHtml.push(`<tr><td>소속</td>${cols.map(c => `<td>${esc(c.sum.unit || '-')}</td>`).join('')}</tr>`);
    rowsHtml.push(`<tr><td>개인메달(금·은·동)</td>${cols.map(c => `<td>${c.sum.im.gold}·${c.sum.im.silver}·${c.sum.im.bronze}</td>`).join('')}</tr>`);
    rowsHtml.push(`<tr><td>결선진출</td>${cols.map(c => `<td>${c.sum.fin}회</td>`).join('')}</tr>`);
    discs.forEach(d => {
      rowsHtml.push(`<tr class="drow"><td>${esc(DISC[d] || d)} 최고/평균</td>${cols.map(c => { const p = c.sum.perDisc[d]; return `<td>${p ? `<b>${p.best}</b> / ${p.avg}` : '–'}</td>`; }).join('')}</tr>`);
    });
    out.innerHTML = `<div class="cmp-h">선수 비교</div><div class="table-wrap"><table class="cmp"><thead><tr><th>항목</th>${th}</tr></thead><tbody>${rowsHtml.join('')}</tbody></table></div>`;
  }

  return { starButton, renderTab, has, count, onChange };
})();
