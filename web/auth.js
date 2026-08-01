'use strict';
// =====================================================================
//  계정/로그인 (Supabase Auth) — 게이트, 역할, 선수 본인연결, 코치 승인
//  supabase-js(UMD, window.supabase)와 app.js 전역(el,esc,DB,startApp,Fav)을 사용.
// =====================================================================
(function () {
  const cfg = window.APP_CONFIG;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  window.SB = sb;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let profile = null;
  window.CURRENT = { user: null, profile: null, role: null };

  // ---------- 게이트 UI ----------
  function gate() { return $('#auth-gate'); }
  function showGate(html) { const g = gate(); g.innerHTML = html; g.hidden = false; $('#app-root').hidden = true; }
  function hideGate() { gate().hidden = true; $('#app-root').hidden = false; }

  function loginForm(msg) {
    showGate(`
      <div class="auth-card">
        <h1>권총기록 아카이브</h1>
        <p class="auth-sub">로그인하고 이용하세요</p>
        ${msg ? `<div class="auth-msg">${esc(msg)}</div>` : ''}
        <input id="au-email" type="email" placeholder="이메일" autocomplete="username">
        <input id="au-pw" type="password" placeholder="비밀번호" autocomplete="current-password">
        <button id="au-login" class="au-primary">로그인</button>
        <div class="auth-alt">계정이 없으신가요? <button id="au-goSignup" class="au-link">회원가입</button></div>
      </div>`);
    $('#au-login').onclick = doLogin;
    $('#au-pw').onkeydown = e => { if (e.key === 'Enter') doLogin(); };
    $('#au-goSignup').onclick = signupForm;
  }

  function signupForm(msg) {
    showGate(`
      <div class="auth-card">
        <h1>회원가입</h1>
        <p class="auth-sub">선수/코치 계정을 만듭니다</p>
        ${msg ? `<div class="auth-msg">${esc(msg)}</div>` : ''}
        <input id="au-name" type="text" placeholder="표시 이름(예: 홍길동)">
        <input id="au-email" type="email" placeholder="이메일" autocomplete="username">
        <input id="au-pw" type="password" placeholder="비밀번호(6자 이상)" autocomplete="new-password">
        <button id="au-signup" class="au-primary">가입하기</button>
        <div class="auth-alt">이미 계정이 있으신가요? <button id="au-goLogin" class="au-link">로그인</button></div>
      </div>`);
    $('#au-signup').onclick = doSignup;
    $('#au-goLogin').onclick = () => loginForm();
  }

  async function doLogin() {
    const email = $('#au-email').value.trim(), pw = $('#au-pw').value;
    if (!email || !pw) return loginForm('이메일과 비밀번호를 입력하세요.');
    $('#au-login').textContent = '로그인 중…'; $('#au-login').disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email, password: pw });
    if (error) return loginForm(errMsg(error));
    boot();
  }

  async function doSignup() {
    const name = $('#au-name').value.trim(), email = $('#au-email').value.trim(), pw = $('#au-pw').value;
    if (!email || pw.length < 6) return signupForm('이메일과 6자 이상 비밀번호를 입력하세요.');
    $('#au-signup').textContent = '가입 중…'; $('#au-signup').disabled = true;
    const { data, error } = await sb.auth.signUp({ email, password: pw, options: { data: { display_name: name } } });
    if (error) return signupForm(errMsg(error));
    // 이메일 확인이 꺼져 있으면 즉시 세션 발급됨
    if (data.session) { if (name) await sb.from('profiles').update({ display_name: name }).eq('id', data.user.id); boot(); }
    else loginForm('가입 완료! 이메일 인증이 필요하면 메일을 확인한 뒤 로그인하세요.');
  }

  function errMsg(e) {
    const m = e.message || '';
    if (/Invalid login/i.test(m)) return '이메일 또는 비밀번호가 올바르지 않습니다.';
    if (/already registered/i.test(m)) return '이미 가입된 이메일입니다. 로그인하세요.';
    if (/Email not confirmed/i.test(m)) return '이메일 인증이 필요합니다. 메일을 확인하세요.';
    return m;
  }

  async function logout() { await sb.auth.signOut(); location.reload(); }
  window.authLogout = logout;

  // ---------- 프로필 로드 & 분기 ----------
  async function boot() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return loginForm();
    window.CURRENT.user = session.user;
    // 프로필 조회(트리거로 생성됨). 없으면 잠깐 후 재시도.
    profile = await loadProfile(session.user.id);
    if (!profile) { await new Promise(r => setTimeout(r, 800)); profile = await loadProfile(session.user.id); }
    if (!profile) { // 그래도 없으면 직접 생성
      await sb.from('profiles').insert({ id: session.user.id, email: session.user.email }).select();
      profile = await loadProfile(session.user.id);
    }
    window.CURRENT.profile = profile; window.CURRENT.role = profile ? profile.role : 'athlete';

    if (profile && profile.role === 'coach') return startCoach();
    return startAthlete();
  }

  async function loadProfile(id) {
    const { data } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
    return data || null;
  }

  // ---------- 코치 ----------
  async function startCoach() {
    hideGate();
    await loadFavorites();        // 즐겨찾기를 Supabase에서 로드
    window.startApp({ role: 'coach' });
  }

  // ---------- 선수 ----------
  async function startAthlete() {
    if (profile && profile.approved && profile.athlete_key) {
      hideGate();
      window.startApp({ role: 'athlete', athleteKey: profile.athlete_key });
      return;
    }
    // 미연결 또는 승인대기
    if (profile && profile.requested_key && !profile.approved) return athletePending();
    return athleteClaim();
  }

  function athletePending() {
    showGate(`
      <div class="auth-card">
        <h1>승인 대기 중</h1>
        <p class="auth-sub">코치가 본인 확인을 승인하면 내 기록을 볼 수 있습니다.</p>
        <div class="auth-msg">신청한 선수: ${esc((profile.requested_key || '').split('|')[0] || '')}</div>
        <button id="au-refresh" class="au-primary">새로고침</button>
        <div class="auth-alt"><button id="au-logout" class="au-link">로그아웃</button></div>
      </div>`);
    $('#au-refresh').onclick = boot;
    $('#au-logout').onclick = logout;
  }

  async function athleteClaim() {
    showGate(`
      <div class="auth-card">
        <h1>본인 선수 선택</h1>
        <p class="auth-sub">기록에서 본인을 찾아 신청하세요. 코치 승인 후 내 정보가 열립니다.</p>
        <input id="au-search" type="search" placeholder="이름 검색 (예: 홍길동)">
        <div id="au-results" class="au-results"></div>
        <div class="auth-alt"><button id="au-logout" class="au-link">로그아웃</button></div>
      </div>`);
    $('#au-logout').onclick = logout;
    const box = $('#au-search'), out = $('#au-results');
    let t;
    box.oninput = () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const q = box.value.trim(); if (!q) { out.innerHTML = ''; return; }
        const rows = await DB.searchAthletes(q);
        out.innerHTML = rows.length ? '' : '<div class="muted">일치하는 선수가 없습니다.</div>';
        rows.slice(0, 20).forEach(a => {
          const b = document.createElement('button'); b.className = 'au-result';
          b.innerHTML = `<b>${esc(a.full_name)}</b> <span>${a.birth_year || '?'}년생 · ${esc(a.units || (a.is_foreign ? a.nationality : '-'))}</span>`;
          b.onclick = () => requestLink(a);
          out.appendChild(b);
        });
      }, 200);
    };
  }

  async function requestLink(a) {
    const key = a.identity_key;
    if (!key) return;
    await sb.from('profiles').update({ requested_key: key, display_name: window.CURRENT.profile?.display_name || a.full_name }).eq('id', window.CURRENT.user.id);
    profile.requested_key = key;
    athletePending();
  }

  // ---------- 즐겨찾기 (Supabase 백엔드로 교체) ----------
  async function loadFavorites() {
    if (!window.Fav || !window.Fav.setCloud) return;
    const uid = window.CURRENT.user.id;
    const { data } = await sb.from('favorites').select('data').eq('user_id', uid).maybeSingle();
    window.Fav.setCloud(
      data && data.data ? data.data : null,
      async (payload) => { await sb.from('favorites').upsert({ user_id: uid, data: payload, updated_at: new Date().toISOString() }); }
    );
  }

  // ---------- 코치 승인 화면 (app.js에서 호출) ----------
  window.coachApprovals = async function (container) {
    container.innerHTML = '<div class="muted">불러오는 중…</div>';
    const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) { container.innerHTML = '<div class="muted">권한 오류: ' + esc(error.message) + '</div>'; return; }
    const pending = data.filter(p => p.requested_key && !p.approved);
    const linked = data.filter(p => p.approved && p.athlete_key);
    let h = `<h3>승인 대기 <span class="sub2">${pending.length}건</span></h3>`;
    if (!pending.length) h += '<div class="muted">대기 중인 신청이 없습니다.</div>';
    pending.forEach(p => {
      h += `<div class="appr-row"><div><b>${esc(p.display_name || p.email)}</b>
        <span class="appr-sub">${esc(p.email)} · 신청: ${esc((p.requested_key || '').split('|')[0])} (${esc((p.requested_key || '').split('|')[1] || '')})</span></div>
        <div><button class="appr-ok" data-id="${p.id}" data-key="${esc(p.requested_key)}">승인</button>
        <button class="appr-no" data-id="${p.id}">거절</button></div></div>`;
    });
    h += `<h3 style="margin-top:16px">연결된 선수 <span class="sub2">${linked.length}명</span></h3>`;
    linked.forEach(p => { h += `<div class="appr-row"><div><b>${esc(p.display_name || p.email)}</b> <span class="appr-sub">${esc((p.athlete_key || '').split('|')[0])}</span></div><button class="appr-unlink" data-id="${p.id}">해제</button></div>`; });
    container.innerHTML = h;
    container.querySelectorAll('.appr-ok').forEach(b => b.onclick = async () => { await sb.from('profiles').update({ approved: true, athlete_key: b.dataset.key }).eq('id', b.dataset.id); window.coachApprovals(container); });
    container.querySelectorAll('.appr-no').forEach(b => b.onclick = async () => { await sb.from('profiles').update({ requested_key: null }).eq('id', b.dataset.id); window.coachApprovals(container); });
    container.querySelectorAll('.appr-unlink').forEach(b => b.onclick = async () => { await sb.from('profiles').update({ approved: false, athlete_key: null }).eq('id', b.dataset.id); window.coachApprovals(container); });
  };

  // ---------- 시작 ----------
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();
})();
