'use strict';
// =====================================================================
//  다국어 (한국어/베트남어) — t(한국어문자열) → 현재 언어 문자열
//  언어는 localStorage 'vpa_lang' 에 저장, 변경 시 새로고침으로 전 화면 반영.
// =====================================================================
(function () {
  const VI = {
    // 공통 / 헤더
    '권총기록 아카이브': 'Kho dữ liệu súng ngắn',
    'ISSF 권총 · 베트남 사격연맹': 'Súng ngắn ISSF · LĐ Bắn súng Việt Nam',
    '로그아웃': 'Đăng xuất',
    '만든이': 'Tác giả',
    // 탭
    '내 정보': 'Hồ sơ của tôi', '선수': 'VĐV', '대회별': 'Theo giải',
    '입상실적': 'Huy chương', '랭킹': 'Xếp hạng', '관리': 'Quản lý',
    // 로그인/가입
    '로그인하고 이용하세요': 'Đăng nhập để sử dụng',
    '대회 일정': 'Lịch thi đấu', '진행중': 'Đang diễn ra', '예정': 'Sắp tới', '종료': 'Đã kết thúc',
    '일정 정보가 없습니다.': 'Chưa có lịch thi đấu.',
    '로그인': 'Đăng nhập', '회원가입': 'Đăng ký', '가입하기': 'Đăng ký',
    '계정이 없으신가요?': 'Chưa có tài khoản?', '이미 계정이 있으신가요?': 'Đã có tài khoản?',
    '선수/코치 계정을 만듭니다': 'Tạo tài khoản VĐV/HLV',
    '표시 이름(예: 홍길동)': 'Tên hiển thị', '이메일': 'Email',
    '비밀번호': 'Mật khẩu', '비밀번호(6자 이상)': 'Mật khẩu (từ 6 ký tự)',
    '로그인 중…': 'Đang đăng nhập…', '가입 중…': 'Đang đăng ký…',
    '이메일과 비밀번호를 입력하세요.': 'Vui lòng nhập email và mật khẩu.',
    '이메일과 6자 이상 비밀번호를 입력하세요.': 'Nhập email và mật khẩu từ 6 ký tự.',
    '이메일 또는 비밀번호가 올바르지 않습니다.': 'Email hoặc mật khẩu không đúng.',
    '이미 가입된 이메일입니다. 로그인하세요.': 'Email đã đăng ký. Vui lòng đăng nhập.',
    '이메일 인증이 필요합니다. 메일을 확인하세요.': 'Cần xác nhận email. Kiểm tra hộp thư.',
    '가입 완료! 이메일 인증이 필요하면 메일을 확인한 뒤 로그인하세요.': 'Đăng ký xong! Nếu cần, hãy xác nhận email rồi đăng nhập.',
    // 선수 본인연결
    '본인 선수 선택': 'Chọn VĐV của bạn',
    '기록에서 본인을 찾아 신청하세요. 코치 승인 후 내 정보가 열립니다.': 'Tìm chính bạn trong dữ liệu và gửi yêu cầu. Sau khi HLV duyệt, hồ sơ của bạn sẽ mở.',
    '이름 검색 (예: 홍길동)': 'Tìm theo tên',
    '일치하는 선수가 없습니다.': 'Không tìm thấy VĐV.',
    '승인 대기 중': 'Đang chờ duyệt',
    '코치가 본인 확인을 승인하면 내 기록을 볼 수 있습니다.': 'Sau khi HLV duyệt, bạn sẽ xem được hồ sơ của mình.',
    '신청한 선수: ': 'VĐV đã đăng ký: ', '새로고침': 'Làm mới',
    // 검색/공통 UI
    '선수명 검색 (예: Phạm Quang Huy)': 'Tìm tên VĐV (vd: Phạm Quang Huy)',
    '검색 중…': 'Đang tìm…', '불러오는 중…': 'Đang tải…', '계산 중…': 'Đang tính…',
    '전체 연도': 'Tất cả năm', '전체 종목': 'Tất cả nội dung', '전체 연령': 'Tất cả lứa tuổi',
    '국내+국제': 'Trong nước + Quốc tế', '국내': 'Trong nước', '국제': 'Quốc tế',
    '남/여': 'Nam/Nữ', '남자부': 'Nam', '여자부': 'Nữ', '남': 'Nam', '여': 'Nữ',
    // 종목
    '10m 공기권총': '10m súng ngắn hơi', '25m 속사권총': '25m bắn nhanh',
    '25m 스포츠권총': '25m thể thao', '25m 표준권총': '25m tiêu chuẩn',
    '25m 센터파이어': '25m ổ quay', '50m 권총': '50m súng ngắn',
    '주니어': 'trẻ', '유소년': 'thiếu niên', '일반': 'chung',
    '혼성단체부': 'đồng đội hỗn hợp', '단체': 'đồng đội',
    '금': 'V', '은': 'B', '동': 'Đ',
    // 상세/표
    '종목별 최고 본선점수': 'Điểm loại cao nhất theo nội dung',
    '연도별 성적': 'Thành tích theo năm', '심화 분석': 'Phân tích chuyên sâu',
    '결선 결과': 'Kết quả chung kết', '결선 결과 (상위 8위)': 'Kết quả CK (Top 8)',
    '상위 8위': 'Top 8', '본선 순위': 'Xếp hạng vòng loại',
    '단체 순위': 'Xếp hạng đồng đội', '개인 기록 (구성원별)': 'Thành tích cá nhân (từng thành viên)',
    '개인': 'Cá nhân', '결선진출': 'Vào CK', '총': 'Tổng', '경기': 'trận',
    '등위': 'Hạng', '소속': 'Đơn vị', '나이': 'Tuổi', '평균': 'TB', '최고': 'Cao nhất',
    '본선': 'Loại', '결선': 'CK', '위': '', '회': ' lần',
    '국내 대회 평균 본선점수 순': 'Theo điểm loại TB (giải trong nước)',
    '개인메달': 'HC cá nhân', '단체메달': 'HC đồng đội',
    '해당 조건의 입상 기록이 없습니다.': 'Không có huy chương phù hợp.',
    '해당 조건의 기록이 없습니다.': 'Không có dữ liệu phù hợp.',
    '팀 합계': 'Tổng đội',
    '※ 원본 시트에는 메달 수상 팀만 기재되어 4위 이하 단체 순위는 제공되지 않습니다.': '※ Nguồn chỉ ghi đội đoạt HC, không có hạng đồng đội từ thứ 4 trở đi.',
    '이 종목의 결선 점수는 원본 시트에 기재돼 있지 않습니다.': 'Điểm chung kết của nội dung này không có trong nguồn.',
    // 심화분석
    '추이': 'Xu hướng', '일관성': 'Ổn định', '시리즈': 'Loạt', '결선 전환력': 'Sức bật CK',
    '국제대비': 'So quốc tế', '한발당': 'mỗi phát',
    // 즐겨찾기
    '비교 모드': 'So sánh', '저장됨': 'đã lưu', '열기': 'Mở',
    '국가대표': 'ĐTQG', '청소년 국가대표': 'ĐTQG trẻ', '후보 선수': 'VĐV dự bị', '관심 선수': 'VĐV quan tâm', '기타': 'Khác',
    // 관리
    '승인 대기': 'Chờ duyệt', '연결된 선수': 'VĐV đã liên kết', '승인': 'Duyệt', '거절': 'Từ chối', '해제': 'Hủy',
    '대기 중인 신청이 없습니다.': 'Không có yêu cầu chờ duyệt.',
  };

  const lang = localStorage.getItem('vpa_lang') || 'ko';
  window.I18N = {
    lang,
    t(s) { return (lang === 'vi' && VI[s] != null) ? VI[s] : s; },
    set(l) { localStorage.setItem('vpa_lang', l); location.reload(); },
  };
  window.t = s => window.I18N.t(s);

  // 언어 선택 버튼 (컨테이너에 KO/VI 토글 삽입)
  window.langSelector = function () {
    const wrap = document.createElement('div');
    wrap.className = 'lang-sel';
    ['ko', 'vi'].forEach(l => {
      const b = document.createElement('button');
      b.textContent = l === 'ko' ? '한국어' : 'Tiếng Việt';
      b.className = 'lang-btn' + (lang === l ? ' on' : '');
      b.onclick = () => { if (l !== lang) window.I18N.set(l); };
      wrap.appendChild(b);
    });
    return wrap;
  };

  // 만든이 크레딧 (좌→우 글로우)
  window.creditEl = function () {
    const d = document.createElement('div');
    d.className = 'credit';
    d.innerHTML = `<span class="credit-label">${window.t('만든이')}</span><span class="credit-name">RYONG</span>`;
    return d;
  };
})();
