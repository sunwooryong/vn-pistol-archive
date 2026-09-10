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
  const T = s => window.t ? window.t(s) : s;
  // 게이트 하단에 언어전환 + 만든이 크레딧
  function mountGateExtras() {
    const g = gate(); if (!g) return;
    let box = g.querySelector('.gate-extras');
    if (!box) { box = document.createElement('div'); box.className = 'gate-extras'; g.appendChild(box); }
    if (box.childElementCount) return;
    if (window.langSelector) box.appendChild(window.langSelector());
    if (window.creditEl) box.appendChild(window.creditEl());
  }

  // 올해 대회 일정 (로그인 없이 공개 데이터에서) — app.js 의 달력형 렌더 재사용
  async function renderSchedule(year) {
    const out = document.querySelector('#sched-list'); if (!out) return;
    if (window.buildSchedule) return window.buildSchedule(out, year);
    out.innerHTML = `<div class="muted">${T('불러오는 중…')}</div>`;
  }

  let profile = null;
  window.CURRENT = { user: null, profile: null, role: null };

  // ---------- 게이트 UI ----------
  function gate() { return $('#auth-gate'); }
  function showGate(html) { const g = gate(); g.innerHTML = html; g.hidden = false; $('#app-root').hidden = true; }
  function hideGate() { gate().hidden = true; $('#app-root').hidden = false; }

  function loginForm(msg) {
    const year = new Date().getFullYear();
    showGate(`
      <div class="landing">
        <div class="landing-hero">
          <div class="brand-rings hero-rings">${window.ringsSVG || ''}</div>
          <h1 class="brand-title">${T('사격기록 아카이브')}</h1>
          <p class="auth-sub">${T('사격 · 베트남 사격연맹')}</p>
        </div>
        <div class="landing-main">
          <div class="auth-card">
            <p class="auth-sub">${T('로그인하고 이용하세요')}</p>
            ${msg ? `<div class="auth-msg">${esc(msg)}</div>` : ''}
            <input id="au-email" type="email" placeholder="${T('이메일')}" autocomplete="username">
            <input id="au-pw" type="password" placeholder="${T('비밀번호')}" autocomplete="current-password">
            <button id="au-login" class="au-primary">${T('로그인')}</button>
            <div class="auth-alt">${T('계정이 없으신가요?')} <button id="au-goSignup" class="au-link">${T('회원가입')}</button></div>
          </div>
          <div class="sched-panel">
            <h2>${year} ${T('대회 일정')}</h2>
            <div id="sched-list"><div class="muted">${T('불러오는 중…')}</div></div>
          </div>
        </div>
        <div class="gate-extras"></div>
      </div>`);
    $('#au-login').onclick = doLogin;
    $('#au-pw').onkeydown = e => { if (e.key === 'Enter') doLogin(); };
    $('#au-goSignup').onclick = () => signupForm();
    mountGateExtras();
    renderSchedule(year);
  }

  // 상세 회원가입 폼 — 3개 국어(KO/VN/EN) 국기 전환
  const SU_FLAG = {
    ko: '<img src="flag-kr.png" alt="한국어">',
    vi: '<svg viewBox="0 0 36 24"><rect width="36" height="24" rx="3" fill="#da251d"/><path fill="#ff0" d="M18 6l1.76 5.42h5.7l-4.61 3.35 1.76 5.42L18 16.84l-4.61 3.35 1.76-5.42-4.61-3.35h5.7z"/></svg>',
    en: '<svg viewBox="0 0 36 24"><rect width="36" height="24" fill="#fff"/><g fill="#b22234"><rect width="36" height="1.85"/><rect y="3.7" width="36" height="1.85"/><rect y="7.4" width="36" height="1.85"/><rect y="11.1" width="36" height="1.85"/><rect y="14.8" width="36" height="1.85"/><rect y="18.5" width="36" height="1.85"/><rect y="22.2" width="36" height="1.8"/></g><rect width="15" height="12.9" fill="#3c3b6e"/></svg>',
  };
  const SUL = {
    ko: { title:'회원가입', sub:'베트남 사격연맹 기록 아카이브', r_ath:'선수', r_coach:'지도자', s_acc:'계정', email:'이메일', pw:'비밀번호 (6자 이상)', s_basic:'기본 정보', name:'이름 (베트남어 표기)', name_hint:'대회·훈련 기록 연결에 사용됩니다.', gender:'성별', sel:'선택', male:'남', female:'여', dob:'생년월일', phone:'연락처', nat:'국적', vn:'베트남', kr:'대한민국', etc:'기타', unit:'소속 (클럽/시도)', region:'지역 (성/시)', s_ath:'선수 정보', events:'주 종목 (복수 선택)', hand:'주손', right:'오른손', left:'왼손', level:'구분', lv_norm:'일반', lv_nt:'국가대표', lv_ynt:'청소년 국가대표', lv_res:'후보', start:'입문 연도', ath_hint:'가입 후 코치가 본인 기록(이름+생년월일)과 연결·승인하면 본인 대회·훈련 기록이 표시됩니다.', s_coach:'지도자 정보', pos:'직위', p_head:'감독', p_coach:'코치', p_tr:'트레이너', exp:'지도 경력 (년)', team:'담당 팀/소속', c_events:'지도 종목 (복수 선택)', w_pistol:'권총', w_rifle:'소총', w_rt:'이동표적', coach_hint:'지도자 계정은 관리자 승인 후 전체 선수 기록·관리 기능을 사용할 수 있습니다.', submit:'가입 신청', haveAcc:'이미 계정이 있으신가요?', login:'로그인' },
    vi: { title:'Đăng ký', sub:'Lưu trữ hồ sơ bắn súng Việt Nam', r_ath:'Vận động viên', r_coach:'Huấn luyện viên', s_acc:'Tài khoản', email:'Email', pw:'Mật khẩu (≥6 ký tự)', s_basic:'Thông tin cơ bản', name:'Họ tên (tiếng Việt)', name_hint:'Dùng để liên kết hồ sơ thi đấu & tập luyện.', gender:'Giới tính', sel:'Chọn', male:'Nam', female:'Nữ', dob:'Ngày sinh', phone:'Điện thoại', nat:'Quốc tịch', vn:'Việt Nam', kr:'Hàn Quốc', etc:'Khác', unit:'Đơn vị (CLB/Tỉnh)', region:'Tỉnh/Thành', s_ath:'Thông tin VĐV', events:'Nội dung chính (chọn nhiều)', hand:'Tay thuận', right:'Tay phải', left:'Tay trái', level:'Cấp độ', lv_norm:'Thường', lv_nt:'ĐTQG', lv_ynt:'ĐT trẻ QG', lv_res:'Dự bị', start:'Năm bắt đầu', ath_hint:'Sau khi đăng ký, HLV liên kết hồ sơ (tên + ngày sinh) và duyệt thì hồ sơ của bạn sẽ hiển thị.', s_coach:'Thông tin HLV', pos:'Chức danh', p_head:'Trưởng đoàn', p_coach:'HLV', p_tr:'Trợ lý', exp:'Số năm kinh nghiệm', team:'Đội phụ trách', c_events:'Nội dung phụ trách (chọn nhiều)', w_pistol:'Súng ngắn', w_rifle:'Súng trường', w_rt:'Bia di động', coach_hint:'Tài khoản HLV cần quản trị viên phê duyệt.', submit:'Đăng ký', haveAcc:'Đã có tài khoản?', login:'Đăng nhập' },
    en: { title:'Sign Up', sub:'Vietnam Shooting Records Archive', r_ath:'Athlete', r_coach:'Coach', s_acc:'Account', email:'Email', pw:'Password (≥6 chars)', s_basic:'Basic Info', name:'Full name (Vietnamese)', name_hint:'Used to link competition & training records.', gender:'Gender', sel:'Select', male:'Male', female:'Female', dob:'Date of birth', phone:'Phone', nat:'Nationality', vn:'Vietnam', kr:'South Korea', etc:'Other', unit:'Club/Unit', region:'Province/City', s_ath:'Athlete Info', events:'Main events (multiple)', hand:'Handedness', right:'Right', left:'Left', level:'Level', lv_norm:'General', lv_nt:'National team', lv_ynt:'Youth national team', lv_res:'Reserve', start:'Started year', ath_hint:'After sign-up, once the coach links your record (name + birth date) and approves, your records appear.', s_coach:'Coach Info', pos:'Position', p_head:'Head coach', p_coach:'Coach', p_tr:'Trainer', exp:'Experience (yrs)', team:'Team in charge', c_events:'Events coached (multiple)', w_pistol:'Pistol', w_rifle:'Rifle', w_rt:'Running target', coach_hint:'Coach accounts need admin approval.', submit:'Register', haveAcc:'Already have an account?', login:'Log in' },
  };
  let suLang = (window.I18N && ['ko','vi','en'].includes(window.I18N.lang)) ? window.I18N.lang : 'ko';

  function signupForm(msg) {
    const EV = [['AP10','10m AP'],['RFP25','25m RFP'],['SP25','25m SP'],['FP50','50m FP'],['AR10','10m AR'],['R3P','50m 3P'],['RPR','50m Prone'],['RT','10m RT']];
    showGate(`
      <div class="auth-card su-form r-athlete">
        <div class="su-top">
          <h1 style="margin:0" data-t="title"></h1>
          <div class="su-langs">
            <button class="su-lang" data-lang="ko" title="한국어">${SU_FLAG.ko}</button>
            <button class="su-lang" data-lang="vi" title="Tiếng Việt">${SU_FLAG.vi}</button>
            <button class="su-lang" data-lang="en" title="English">${SU_FLAG.en}</button>
          </div>
        </div>
        <p class="auth-sub" data-t="sub"></p>
        ${msg ? `<div class="auth-msg">${esc(msg)}</div>` : ''}
        <div class="su-roles">
          <div class="su-role" data-role="athlete"><b>🎯 <span data-t="r_ath"></span></b></div>
          <div class="su-role" data-role="coach"><b>📋 <span data-t="r_coach"></span></b></div>
        </div>
        <div class="su-sec" data-t="s_acc"></div>
        <div class="su-field"><label class="su-lab"><span data-t="email"></span><span class="req">*</span></label><input id="su-email" type="email" placeholder="you@example.com" autocomplete="username"></div>
        <div class="su-field"><label class="su-lab"><span data-t="pw"></span><span class="req">*</span></label><input id="su-pw" type="password" placeholder="••••••" autocomplete="new-password"></div>
        <div class="su-sec" data-t="s_basic"></div>
        <div class="su-field"><label class="su-lab"><span data-t="name"></span><span class="req">*</span></label><input id="su-name" type="text" placeholder="Nguyễn Văn A"><div class="su-hint" data-t="name_hint"></div></div>
        <div class="su-row">
          <div class="su-field"><label class="su-lab"><span data-t="gender"></span><span class="req">*</span></label><select id="su-gender"><option value="" data-t="sel"></option><option value="M" data-t="male"></option><option value="W" data-t="female"></option></select></div>
          <div class="su-field"><label class="su-lab"><span data-t="dob"></span><span class="req">*</span></label><input id="su-dob" type="date"></div>
        </div>
        <div class="su-row">
          <div class="su-field"><label class="su-lab" data-t="phone"></label><input id="su-phone" type="tel" placeholder="09xx xxx xxx"></div>
          <div class="su-field"><label class="su-lab" data-t="nat"></label><select id="su-nat"><option value="VN" data-t="vn"></option><option value="KR" data-t="kr"></option><option value="ETC" data-t="etc"></option></select></div>
        </div>
        <div class="su-row">
          <div class="su-field"><label class="su-lab" data-t="unit"></label><input id="su-unit" type="text" placeholder="Hà Nội…"></div>
          <div class="su-field"><label class="su-lab" data-t="region"></label><input id="su-region" type="text" placeholder="Hà Nội"></div>
        </div>
        <div class="only-athlete">
          <div class="su-sec" data-t="s_ath"></div>
          <div class="su-field"><label class="su-lab" data-t="events"></label><div class="su-chips">${EV.map(([v,l]) => `<span class="su-chip" data-ev="${v}">${l}</span>`).join('')}</div></div>
          <div class="su-row">
            <div class="su-field"><label class="su-lab" data-t="hand"></label><select id="su-hand"><option value="R" data-t="right"></option><option value="L" data-t="left"></option></select></div>
            <div class="su-field"><label class="su-lab" data-t="level"></label><select id="su-level"><option value="norm" data-t="lv_norm"></option><option value="nt" data-t="lv_nt"></option><option value="ynt" data-t="lv_ynt"></option><option value="res" data-t="lv_res"></option></select></div>
          </div>
          <div class="su-field"><label class="su-lab" data-t="start"></label><input id="su-start" type="number" placeholder="2022" min="1990" max="2026"></div>
          <div class="su-hint" data-t="ath_hint"></div>
        </div>
        <div class="only-coach">
          <div class="su-sec" data-t="s_coach"></div>
          <div class="su-row">
            <div class="su-field"><label class="su-lab" data-t="pos"></label><select id="su-pos"><option value="head" data-t="p_head"></option><option value="coach" data-t="p_coach"></option><option value="tr" data-t="p_tr"></option></select></div>
            <div class="su-field"><label class="su-lab" data-t="exp"></label><input id="su-exp" type="number" placeholder="10" min="0" max="60"></div>
          </div>
          <div class="su-field"><label class="su-lab" data-t="team"></label><input id="su-team" type="text" placeholder="ĐT trẻ quốc gia…"></div>
          <div class="su-field"><label class="su-lab" data-t="c_events"></label><div class="su-chips"><span class="su-chip" data-cev="pistol" data-t="w_pistol"></span><span class="su-chip" data-cev="rifle" data-t="w_rifle"></span><span class="su-chip" data-cev="rt" data-t="w_rt"></span></div></div>
          <div class="su-hint" data-t="coach_hint"></div>
        </div>
        <button id="au-signup" class="au-primary" data-t="submit"></button>
        <div class="auth-alt"><span data-t="haveAcc"></span> <button id="au-goLogin" class="au-link" data-t="login"></button></div>
      </div>`);
    const form = $('.su-form');
    const applySul = lang => { suLang = lang; const d = SUL[lang]; form.querySelectorAll('[data-t]').forEach(el => { const v = d[el.dataset.t]; if (v != null) el.textContent = v; }); form.querySelectorAll('.su-lang').forEach(x => x.classList.toggle('on', x.dataset.lang === lang)); };
    form.querySelectorAll('.su-lang').forEach(b => b.onclick = () => applySul(b.dataset.lang));
    const setRole = r => { form.classList.remove('r-athlete', 'r-coach'); form.classList.add('r-' + r); form.querySelectorAll('.su-role').forEach(x => x.classList.toggle('on', x.dataset.role === r)); };
    form.querySelectorAll('.su-role').forEach(r => r.onclick = () => setRole(r.dataset.role));
    form.querySelectorAll('.su-chip').forEach(c => c.onclick = () => c.classList.toggle('on'));
    applySul(suLang); setRole('athlete');
    $('#au-signup').onclick = doSignup;
    $('#au-goLogin').onclick = () => loginForm();
    mountGateExtras();
  }
  const suErr = { ko:{req:'필수 항목을 모두 입력하세요.', pw:'비밀번호는 6자 이상이어야 합니다.'}, vi:{req:'Vui lòng nhập đủ các mục bắt buộc.', pw:'Mật khẩu ≥6 ký tự.'}, en:{req:'Please fill all required fields.', pw:'Password must be ≥6 chars.'} };

  async function doLogin() {
    const email = $('#au-email').value.trim(), pw = $('#au-pw').value;
    if (!email || !pw) return loginForm(T('이메일과 비밀번호를 입력하세요.'));
    $('#au-login').textContent = T('로그인 중…'); $('#au-login').disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email, password: pw });
    if (error) return loginForm(errMsg(error));
    boot();
  }

  async function doSignup() {
    const v = id => (document.getElementById(id)?.value || '').trim();
    const role = $('.su-form')?.classList.contains('r-coach') ? 'coach' : 'athlete';
    const email = v('su-email'), pw = document.getElementById('su-pw')?.value || '';
    const name = v('su-name'), gender = v('su-gender'), dob = v('su-dob');
    const E = suErr[suLang] || suErr.ko;
    if (!email || !name || !gender || !dob) return signupForm(E.req);
    if (pw.length < 6) return signupForm(E.pw);
    const birthYear = dob ? +dob.slice(0, 4) : null;
    const events = [...document.querySelectorAll('.su-chip.on[data-ev]')].map(c => c.dataset.ev);
    const coachEvents = [...document.querySelectorAll('.su-chip.on[data-cev]')].map(c => c.dataset.cev);
    const details = {
      requested_role: role, name_vn: name, gender, birth_date: dob, birth_year: birthYear,
      phone: v('su-phone'), nationality: v('su-nat'), unit: v('su-unit'), region: v('su-region'), lang: suLang,
    };
    if (role === 'athlete') Object.assign(details, { events, handed: v('su-hand'), level: v('su-level'), start_year: v('su-start') });
    else Object.assign(details, { position: v('su-pos'), exp_years: v('su-exp'), team: v('su-team'), coach_events: coachEvents });

    const btn = $('#au-signup'); btn.textContent = '…'; btn.disabled = true;
    const { data, error } = await sb.auth.signUp({ email, password: pw, options: { data: { display_name: name } } });
    if (error) return signupForm(errMsg(error));
    if (data.session) {
      // 프로필 상세 저장 (details 컬럼 없으면 기본 항목만 저장 — 컬럼 추가 전에도 가입 가능)
      const upd = { display_name: name, details };
      if (role === 'athlete' && birthYear) upd.requested_key = `${name}|${birthYear}|${gender}`;
      let { error: uerr } = await sb.from('profiles').update(upd).eq('id', data.user.id);
      if (uerr) { delete upd.details; await sb.from('profiles').update(upd).eq('id', data.user.id); }
      boot();
    } else loginForm(T('가입 완료! 이메일 인증이 필요하면 메일을 확인한 뒤 로그인하세요.'));
  }

  function errMsg(e) {
    const m = e.message || '';
    if (/Invalid login/i.test(m)) return T('이메일 또는 비밀번호가 올바르지 않습니다.');
    if (/already registered/i.test(m)) return T('이미 가입된 이메일입니다. 로그인하세요.');
    if (/Email not confirmed/i.test(m)) return T('이메일 인증이 필요합니다. 메일을 확인하세요.');
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
        <h1>${T('승인 대기 중')}</h1>
        <p class="auth-sub">${T('코치가 본인 확인을 승인하면 내 기록을 볼 수 있습니다.')}</p>
        <div class="auth-msg">${T('신청한 선수: ')}${esc((profile.requested_key || '').split('|')[0] || '')}</div>
        <button id="au-refresh" class="au-primary">${T('새로고침')}</button>
        <div class="auth-alt"><button id="au-logout" class="au-link">${T('로그아웃')}</button></div>
      </div>`);
    $('#au-refresh').onclick = boot;
    $('#au-logout').onclick = logout;
    mountGateExtras();
  }

  async function athleteClaim() {
    showGate(`
      <div class="auth-card">
        <h1>${T('본인 선수 선택')}</h1>
        <p class="auth-sub">${T('기록에서 본인을 찾아 신청하세요. 코치 승인 후 내 정보가 열립니다.')}</p>
        <input id="au-search" type="search" placeholder="${T('이름 검색 (예: 홍길동)')}">
        <div id="au-results" class="au-results"></div>
        <div class="auth-alt"><button id="au-logout" class="au-link">${T('로그아웃')}</button></div>
      </div>`);
    $('#au-logout').onclick = logout;
    mountGateExtras();
    const box = $('#au-search'), out = $('#au-results');
    let t;
    box.oninput = () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const q = box.value.trim(); if (!q) { out.innerHTML = ''; return; }
        const rows = await DB.searchAthletes(q);
        out.innerHTML = rows.length ? '' : `<div class="muted">${T('일치하는 선수가 없습니다.')}</div>`;
        rows.slice(0, 20).forEach(a => {
          const b = document.createElement('button'); b.className = 'au-result';
          b.innerHTML = `<b>${esc(a.full_name)}</b> <span>${a.birth_year || '?'}${T('년생')} · ${esc(a.units || (a.is_foreign ? a.nationality : '-'))}</span>`;
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
    container.innerHTML = `<div class="muted">${T('불러오는 중…')}</div>`;
    const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) { container.innerHTML = `<div class="muted">${T('권한 오류')}: ` + esc(error.message) + '</div>'; return; }
    const reqRole = p => (p.details && p.details.requested_role) || 'athlete';
    const pending = data.filter(p => !p.approved && (p.requested_key || (p.details && p.details.requested_role)));
    const linked = data.filter(p => p.approved && (p.athlete_key || p.role === 'coach'));
    const GEN = { M: T('남'), W: T('여') };
    const dsum = p => {
      const d = p.details || {}; const parts = [];
      if (d.gender) parts.push(GEN[d.gender] || d.gender);
      if (d.birth_date) parts.push(d.birth_date);
      if (d.unit) parts.push(esc(d.unit)); if (d.region) parts.push(esc(d.region));
      if (d.phone) parts.push(esc(d.phone));
      const evs = (d.events && d.events.join(', ')) || (d.coach_events && d.coach_events.join(', '));
      if (evs) parts.push(esc(evs));
      return parts.join(' · ');
    };
    let h = `<h3>${T('승인 대기')} <span class="sub2">${pending.length}${T('건')}</span></h3>`;
    if (!pending.length) h += `<div class="muted">${T('대기 중인 신청이 없습니다.')}</div>`;
    pending.forEach(p => {
      const rr = reqRole(p); const nm = (p.details && p.details.name_vn) || (p.requested_key || '').split('|')[0] || p.display_name || p.email;
      const okBtn = rr === 'coach'
        ? `<button class="appr-ok coach" data-id="${p.id}" data-role="coach">${T('코치 승인')}</button>`
        : `<button class="appr-ok" data-id="${p.id}" data-key="${esc(p.requested_key || '')}" data-role="athlete">${T('승인')}</button>`;
      h += `<div class="appr-row"><div><b>${esc(nm)}</b><span class="appr-role ${rr}">${rr === 'coach' ? T('지도자') : T('선수')}</span>
        <span class="appr-sub">${esc(p.email)}</span>${dsum(p) ? `<div class="appr-detail">${dsum(p)}</div>` : ''}</div>
        <div>${okBtn} <button class="appr-no" data-id="${p.id}">${T('거절')}</button></div></div>`;
    });
    h += `<h3 style="margin-top:16px">${T('연결된 선수')} <span class="sub2">${linked.length}${T('명')}</span></h3>`;
    linked.forEach(p => { h += `<div class="appr-row"><div><b>${esc((p.details && p.details.name_vn) || p.display_name || p.email)}</b>${p.role === 'coach' ? `<span class="appr-role coach">${T('지도자')}</span>` : ''} <span class="appr-sub">${esc((p.athlete_key || '').split('|')[0])}</span></div><button class="appr-unlink" data-id="${p.id}">${T('해제')}</button></div>`; });
    container.innerHTML = h;
    container.querySelectorAll('.appr-ok').forEach(b => b.onclick = async () => {
      const upd = b.dataset.role === 'coach' ? { approved: true, role: 'coach' } : { approved: true, athlete_key: b.dataset.key };
      await sb.from('profiles').update(upd).eq('id', b.dataset.id); window.coachApprovals(container);
    });
    container.querySelectorAll('.appr-no').forEach(b => b.onclick = async () => { await sb.from('profiles').update({ requested_key: null }).eq('id', b.dataset.id); window.coachApprovals(container); });
    container.querySelectorAll('.appr-unlink').forEach(b => b.onclick = async () => { await sb.from('profiles').update({ approved: false, athlete_key: null, role: 'athlete' }).eq('id', b.dataset.id); window.coachApprovals(container); });
  };

  // ---------- 시작 ----------
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();
})();
