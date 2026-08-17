'use strict';
// =====================================================================
//  다국어 (한국어/베트남어) — t(한국어문자열) → 현재 언어 문자열
//  언어는 localStorage 'vpa_lang' 에 저장, 변경 시 새로고침으로 전 화면 반영.
// =====================================================================
(function () {
  const VI = {
    // 공통 / 헤더
    '권총기록 아카이브': 'Kho dữ liệu súng ngắn',
    '권총 · 베트남 사격연맹': 'Súng ngắn · LĐ Bắn súng Việt Nam',
    '4주 이내': 'Trong 4 tuần', '4주 이내 예정 대회가 없습니다.': 'Không có giải trong 4 tuần tới.',
    '자동 갱신': 'Tự động cập nhật', '기준': 'Cập nhật', '30분마다 자동 갱신': 'Tự động cập nhật mỗi 30 phút',
    '연맹 원본 페이지': 'Trang LĐ Bắn súng', '연맹 원본 페이지 열기': 'Mở trang LĐ Bắn súng',
    '연맹 원본에서 보기': 'Xem trên trang LĐ',
    '연맹 공지': 'Tin tức Liên đoàn', '전체보기': 'Xem tất cả',
    '출전 명단': 'Danh sách thi đấu', '결과 대기 중': 'Đang chờ kết quả', '사수': 'Vị trí', '명 출전': ' VĐV', '결과 입력 전입니다': 'Chưa nhập kết quả',
    '개인전': 'Cá nhân', '단체전': 'Đồng đội', '번외': 'Ngoại lệ', '조': 'Đợt', '사대': 'Bệ',
    // 지역 분석
    '지역 분석': 'Phân tích theo đơn vị', '소속 기준 · 전국 대비': 'Theo đơn vị · so toàn quốc',
    '지역 내 등위': 'Xếp hạng trong đơn vị', '본선 최고': 'Điểm loại cao nhất', '지역 최고': 'Cao nhất đơn vị',
    '전국': 'Toàn quốc', '지역 라이벌': 'Đối thủ cùng đơn vị', '지역 강도 비교': 'So sánh sức mạnh đơn vị',
    '지역별 최고': 'Điểm cao nhất theo đơn vị', '전국 백분위': 'Bách phân vị toàn quốc', '국내 선수 대비': 'So với VĐV trong nước',
    '상위': 'Top', '본인': 'Bạn', '명': 'VĐV',
    // 지역 분석 — 쉬운 말
    '종목별 순위': 'Xếp hạng theo nội dung', '같은 지역 선수 중 몇 등, 전국에서 몇 등인지 쉽게 보여줘요.': 'Hạng trong đơn vị và toàn quốc, dễ xem.',
    '최고점': 'Điểm cao nhất', '점': ' điểm', '명 중': ' VĐV', '제일 잘함': 'Giỏi nhất', '마지막': 'Cuối', '나': 'Tôi', '100명이면': 'Nếu 100 người thì',
    '우리 지역 잘하는 친구들': 'Bạn giỏi cùng đơn vị', '같은 지역·같은 종목 선수를 점수 순으로 줄 세웠어요.': 'Xếp theo điểm, cùng đơn vị & nội dung.', '바로 나': 'Chính tôi',
    '우리 지역은 얼마나 셀까?': 'Đơn vị mình mạnh cỡ nào?', '지역마다 제일 잘하는 선수의 점수를 비교했어요.': 'So điểm VĐV giỏi nhất mỗi đơn vị.', '우리 지역': 'Đơn vị mình',
    '아주 잘해요': 'Rất giỏi', '잘하는 편': 'Khá giỏi', '보통': 'Trung bình', '더 힘내요': 'Cố lên nhé',
    // 심화분석 — 쉬운 말
    '최저': 'Thấp nhất', '안정도': 'Ổn định', '요즘 폼': 'Phong độ gần đây', '최근이 처음보다': 'Gần đây so với đầu',
    '해마다 실력': 'Tiến bộ theo năm', '실력이 늘고 있어요': 'Đang tiến bộ', '조금 떨어졌어요': 'Giảm một chút', '비슷하게 유지': 'Giữ ổn định',
    '올라가는 중': 'Đang lên', '내려가는 중': 'Đang xuống',
    '점수 안정': 'Độ ổn định', '작을수록 늘 비슷하게 잘 쏴요': 'Số nhỏ = luôn bắn đều',
    '세계 비교': 'So thế giới', '종목별 강점 한눈에': 'Điểm mạnh các nội dung', '별이 바깥으로 클수록 그 종목을 잘하는 거예요.': 'Càng ra ngoài = càng giỏi nội dung đó.',
    '제일 잘하는 종목': 'Nội dung giỏi nhất', '심화 분석': 'Phân tích chuyên sâu', '종목별 폼 · 성장 · 결선 · 세계 비교': 'Phong độ · Tiến bộ · Chung kết · So thế giới',
    '결선(마지막판)': 'Chung kết', '번 올라감': ' lần vào', '결선에서는': 'Ở chung kết', '더 잘 쏴요': 'Bắn tốt hơn', '조금 약해져요': 'Hơi yếu đi', '비슷해요': 'Tương đương', '한 발당': 'mỗi phát',
    '하이퐁': 'Hải Phòng', '호치민': 'TP.HCM', '하노이': 'Hà Nội', '다낭': 'Đà Nẵng', '군': 'Quân đội',
    '경찰': 'Công an', '꽝닌': 'Quảng Ninh', '동나이': 'Đồng Nai', '닥락': 'Đắk Lắk', '타인호아': 'Thanh Hóa',
    '푸토': 'Phú Thọ', '박닌': 'Bắc Ninh', '빈푹': 'Vĩnh Phúc',
    '로그아웃': 'Đăng xuất',
    '만든이': 'Tác giả',
    // 탭
    '내 정보': 'Hồ sơ của tôi', '선수': 'VĐV', '대회별': 'Theo giải',
    '입상실적': 'Huy chương', '랭킹': 'Xếp hạng', '관리': 'Quản lý',
    // 로그인/가입
    '로그인하고 이용하세요': 'Đăng nhập để sử dụng',
    '대회 일정': 'Lịch thi đấu', '진행중': 'Đang diễn ra', '예정': 'Sắp tới', '종료': 'Đã kết thúc',
    '일정 정보가 없습니다.': 'Chưa có lịch thi đấu.',
    '다가오는 대회': 'Sắp diễn ra', '지난 대회': 'Đã qua', '홈': 'Trang chủ',
    '내 선수 참가 대회': 'Giải VĐV của tôi tham gia', '올해 참가 기록이 없습니다.': 'Chưa có tham gia năm nay.',
    '관리 선수 일정·기록': 'Lịch·Kết quả VĐV của tôi', '다가오는 경기': 'Sắp thi đấu', '최근 기록': 'Kết quả gần đây',
    // 지도 실적 증명서
    '지도 실적 증명': 'Chứng nhận HLV', '지도 실적 증명서': 'Chứng nhận thành tích huấn luyện', '인쇄': 'In', '닫기': 'Đóng',
    '지도자': 'HLV', '지도 선수': 'VĐV phụ trách', '참가 대회': 'Giải tham gia', '개인 메달': 'HC cá nhân', '단체 메달': 'HC đồng đội', '결선 진출': 'Vào chung kết',
    '대표 성적': 'Thành tích tiêu biểu', '본 증명서는 베트남 사격연맹 공개 기록을 기준으로 자동 집계되었습니다.': 'Chứng nhận tổng hợp tự động từ dữ liệu công khai của LĐ Bắn súng Việt Nam.', '발급일': 'Ngày cấp', '작성': 'Lập bởi',
    '개인전만': 'Chỉ cá nhân', '개인+단체': 'Cá nhân + đồng đội',
    '관리 선수 명단': 'Danh sách VĐV phụ trách', '2026 기록': 'KQ 2026', '기록 없음': 'Chưa có KQ',
    // 전수 번역 보강
    '년생': ' sinh', '세': ' tuổi', '생년 미상': 'Không rõ năm sinh', '기록없음': 'Không có KQ', '만': '', '베트남': 'Việt Nam',
    '총': 'Tổng', '전': ' trận', '메달': 'HC', '랭킹': 'Xếp hạng', '국내 대회 · 종목별': 'Giải trong nước · theo nội dung',
    '국내·국제 전체 · 종목별': 'Trong+ngoài nước · theo nội dung', '년 국내 개인전 기록이 없습니다.': ' chưa có KQ cá nhân trong nước.',
    '평균순위': 'Hạng TB', '최고순위': 'Hạng cao nhất', '전체': 'Tất cả', '연령부': 'Lứa tuổi',
    '국내 · 종목별 (순위/인원)': 'Trong nước · theo nội dung (hạng/số VĐV)', '합계': 'Tổng', '건': '', '대회': 'Giải', '개': '',
    '수록': 'Dữ liệu', '성적': 'Thành tích', '데이터 기준': 'Cập nhật', '로컬 미리보기': 'Xem thử cục bộ',
    '공개 시트를 주기적으로 자동 반영합니다(약 30분~1시간).': 'Tự động cập nhật từ bảng công khai (khoảng 30 phút~1 giờ).',
    '출처': 'Nguồn', '베트남 사격연맹 공개 기록시트': 'Bảng ghi công khai LĐ Bắn súng VN',
    '원본에 등위 컬럼이 없어 국제 규정 6.15.1로 계산한 값입니다(이너텐→마지막 시리즈 카운트백). 메달은 연맹 확정.': 'Nguồn không có cột hạng nên tính theo luật 6.15.1 (inner-ten → loạt cuối). HC do LĐ xác nhận.',
    '완전성': 'Đầy đủ', '결선 점수·시리즈는 시트에 기재된 경우만 표시됩니다. 온전한 데이터는 2025년~.': 'Điểm CK·loạt chỉ hiện khi có trong bảng. Dữ liệu đầy đủ từ 2025.',
    '연결된 선수 정보가 없습니다.': 'Chưa liên kết VĐV.', '본인 기록을 찾지 못했습니다. 코치에게 문의하세요.': 'Không tìm thấy hồ sơ của bạn. Liên hệ HLV.',
    '순위': 'Hạng', '등': '',
    '국제상위': 'Top QT', '시리즈 약세': ' loạt yếu', '시리즈 편차 작음(안정)': 'Loạt đều (ổn định)', '1~3정밀/4~6속사': '1~3 chậm/4~6 nhanh',
    '개인 종목 기록이 없습니다.': 'Chưa có KQ cá nhân.', '분석 중…': 'Đang phân tích…',
    '10m공기': '10m hơi', '25m속사': '25m nhanh', '25m스포츠': '25m TT', '25m표준': '25m TC', '25m센터': '25m ổ quay', '50m': '50m',
    '시리즈 평균': 'Loạt TB',
    // 즐겨찾기 화면
    '즐겨찾기': 'Yêu thích', '즐겨찾기 해제': 'Bỏ yêu thích', '그룹': 'Nhóm', '새 그룹 이름': 'Tên nhóm mới',
    '아직 저장한 선수가 없습니다. 선수 검색 → ☆ 를 눌러 그룹에 저장하세요.': 'Chưa lưu VĐV nào. Tìm VĐV → bấm ☆ để lưu.',
    '그룹 삭제': 'Xóa nhóm', '그룹 삭제? (선수는 기타로 이동)': 'Xóa nhóm? (VĐV chuyển sang Khác)',
    '비교할 선수를 2명 이상 선택하세요.': 'Chọn từ 2 VĐV để so sánh.', '비교 계산 중…': 'Đang so sánh…',
    '선수 비교': 'So sánh VĐV', '항목': 'Mục', '권한 오류': 'Lỗi quyền', '신청': 'Đăng ký',
    '출전 예정': 'Sẽ thi đấu', '결과 대기': 'Chờ kết quả', '관리 선수를 즐겨찾기(☆)로 등록하세요.': 'Hãy thêm VĐV vào yêu thích (☆).',
    '예정된 경기 없음': 'Không có lịch sắp tới', '올해 기록 없음': 'Chưa có kết quả năm nay',
    '경기일': 'Ngày thi đấu',
    '즐겨찾기 선수': 'VĐV yêu thích', '선수를 검색해 ☆로 저장하면 여기 모입니다.': 'Tìm VĐV và bấm ☆ để lưu vào đây.',
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

  // 국기 SVG (윈도우에서 이모지 국기가 안 나오므로 SVG 사용)
  const FLAG = {
    ko: `<svg viewBox="0 0 36 24" class="flag"><rect width="36" height="24" rx="3" fill="#fff"/>
      <clipPath id="kc"><circle cx="18" cy="12" r="6"/></clipPath>
      <g clip-path="url(#kc)"><rect x="12" y="6" width="12" height="12" fill="#cd2e3a"/>
      <path d="M18 6a3 3 0 0 1 0 6 3 3 0 0 0 0 6 6 6 0 0 1 0-12z" fill="#0047a0"/></g>
      <g stroke="#222" stroke-width="1"><path d="M6 6.5l3 1.7M6 8l3 1.7M6 9.5l3 1.7"/><path d="M30 14.6l-3 1.7M30 16.1l-3 1.7M30 17.6l-3 1.7"/></g></svg>`,
    vi: `<svg viewBox="0 0 36 24" class="flag"><rect width="36" height="24" rx="3" fill="#da251d"/>
      <path fill="#ff0" d="M18 6l1.76 5.42h5.7l-4.61 3.35 1.76 5.42L18 16.84l-4.61 3.35 1.76-5.42-4.61-3.35h5.7z"/></svg>`,
  };
  // 언어 선택 — 국기 클릭으로 전환
  window.langSelector = function () {
    const wrap = document.createElement('div');
    wrap.className = 'lang-sel';
    ['ko', 'vi'].forEach(l => {
      const b = document.createElement('button');
      b.className = 'flag-btn' + (lang === l ? ' on' : '');
      b.title = l === 'ko' ? '한국어' : 'Tiếng Việt';
      b.setAttribute('aria-label', b.title);
      b.innerHTML = FLAG[l];
      b.onclick = () => { if (l !== lang) window.I18N.set(l); };
      wrap.appendChild(b);
    });
    return wrap;
  };

  // 오륜기(올림픽 링) 마크 SVG
  window.ringsSVG = `<svg viewBox="0 0 100 46" class="rings" aria-hidden="true">
    <g fill="none" stroke-width="4">
      <circle cx="22" cy="18" r="13" stroke="#0081c8"/><circle cx="50" cy="18" r="13" stroke="#000"/><circle cx="78" cy="18" r="13" stroke="#ee334e"/>
      <circle cx="36" cy="30" r="13" stroke="#fcb131"/><circle cx="64" cy="30" r="13" stroke="#00a651"/>
    </g></svg>`;
  window.ringsEl = function () { const d = document.createElement('span'); d.className = 'rings-wrap'; d.innerHTML = window.ringsSVG; return d; };

  // 만든이 크레딧 (좌→우 글로우)
  window.creditEl = function () {
    const d = document.createElement('div');
    d.className = 'credit';
    d.innerHTML = `<span class="credit-label">${window.t('만든이')}</span><span class="credit-name">RYONG</span>`;
    return d;
  };
})();
