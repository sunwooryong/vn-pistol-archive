/* 훈련기록(PRACTICE 시트) 파서 — 열 위치를 '헤더 이름'으로 해석해 시트 구조 변경(열 추가/이동)에 내성.
   브라우저(window.TCParse)와 Node(module.exports) 양쪽에서 사용. 자동 테스트 대상(test/parse.test.js). */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.TCParse = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const pad = n => String(n).padStart(2, "0");
  const num = v => { const n = parseFloat(String(v == null ? "" : v).replace(/[^\d.\-]/g, "")); return isNaN(n) ? null : n; };
  const LBL = /Thời tiết|Nhiệt độ|Độ ẩm|Vĩ độ|Kinh độ|Buổi tập|Loại bia|Địa điểm|Ngày tập luyện|Trạng thái phân tích|Mã buổi tập|Số điểm|Chuỗi 10|Tổng số viên/;
  const clean = v => { v = String(v || "").trim(); return (!v || LBL.test(v)) ? "" : v; };
  const cnum = v => { const c = clean(v); return c ? num(c) : null; };
  function tDate(s) { const m = String(s || "").match(/(\d{4})[-.\s]+(\d{1,2})[-.\s]+(\d{1,2})/); return m ? `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` : null; }
  // 저장된 시각으로 오전/오후 구분(오전/오후 또는 H:MM). 시간 없으면 null.
  function tHalf(s) { s = String(s || ""); if (/오전|SA\b|\bAM\b/i.test(s)) return "am"; if (/오후|CH\b|\bPM\b/i.test(s)) return "pm"; const m = s.match(/\b(\d{1,2}):(\d{2})/); if (m) { const h = +m[1]; return h < 12 ? "am" : "pm"; } return null; }
  function tDisc(s) {
    s = (s || "").toLowerCase();
    if (/50m|50 m/.test(s)) return "pistol_50";
    if (/속사|급사|rapid/.test(s)) return "rapid";
    if (/스포츠|sport/.test(s)) return "sport";
    if (/스탠다드|standard|표준/.test(s)) return "standard";
    if (/10m|공기|air/.test(s)) return "air";
    return "";
  }

  // 헤더 행 → 의미 있는 열 인덱스. 못 찾으면 -1.
  function resolveCols(header) {
    const H = (header || []).map(h => String(h || "").replace(/\s+/g, " ").trim());
    const find = re => H.findIndex(h => re.test(h));
    const cols = {
      date: find(/날짜|Ngày/),
      name: find(/이름|Tên VN/),
      disc: find(/종목|Nội dung/),
      total: find(/총점|Tổng điểm/),
    };
    // 시리즈 S1..S10 (헤더가 정확히 'S<번호>')
    cols.series = [];
    for (let s = 1; s <= 10; s++) { const i = H.findIndex(h => h === "S" + s); if (i >= 0) cols.series.push(i); }
    // 점수분포 10점~0점 개수 (11칸, 10→0 순서)
    cols.dist = [];
    for (let p = 10; p >= 0; p--) {
      const re = new RegExp("(^|[^0-9])" + p + "점 개수");
      const reVi = new RegExp("Số điểm " + p + "(?![0-9])");
      cols.dist.push(H.findIndex(h => re.test(h) || reVi.test(h)));
    }
    cols.long10 = find(/10점 최고 ?연속|Chuỗi 10/);
    return cols;
  }

  function rowToSession(row, cols) {
    const date = tDate(row[cols.date]);
    const name = String(row[cols.name] != null ? row[cols.name] : "").trim();
    const total = num(row[cols.total]);
    if (!date || !name || total == null) return null;
    const disc = String(row[cols.disc] != null ? row[cols.disc] : "").trim();
    const series = cols.series.map(i => num(row[i])).filter(v => v != null);
    const distRaw = cols.dist.map(i => (i >= 0 ? cnum(row[i]) : null));
    const hasDist = distRaw.some(v => v != null);
    return {
      date, half: tHalf(row[cols.date]), name, disc, dk: tDisc(disc), total, series,
      dist: hasDist ? distRaw.map(v => v || 0) : null,
      long10: cols.long10 >= 0 ? cnum(row[cols.long10]) : null,
    };
  }

  // rows = parseCSV 결과(배열의 배열). 헤더는 headerRowIndex(기본 3), 데이터는 dataStart(기본 4)부터.
  function buildSessions(rows, headerRowIndex, dataStart) {
    headerRowIndex = headerRowIndex == null ? 3 : headerRowIndex;
    dataStart = dataStart == null ? 4 : dataStart;
    const cols = resolveCols(rows[headerRowIndex] || []);
    const need = Math.max(cols.date, cols.name, cols.disc, cols.total) + 1;
    const out = [];
    for (const row of rows.slice(dataStart)) {
      if (!row || row.length < need) continue;
      const s = rowToSession(row, cols);
      if (s) out.push(s);
    }
    return out;
  }

  return { num, cnum, tDate, tHalf, tDisc, resolveCols, rowToSession, buildSessions };
});
