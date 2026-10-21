// 훈련기록 파서 회귀 테스트 (node --test). 시트 열 구조 변경/오입력 재발 방지.
const test = require("node:test");
const assert = require("node:assert");
const TCParse = require("../web/training-check/parse.js");

// ── 실제 시트 구조를 본뜬 픽스처 빌더 ──────────────────────────────
function header() {
  const h = new Array(50).fill("");
  h[0] = "날짜 / Ngày";
  h[1] = "이름(VN) / Tên VN";
  h[2] = "순번 / Seq";
  h[4] = "종목 / Nội dung";
  h[6] = "발수 / Số phát";
  h[7] = "총점 / Tổng điểm";
  for (let i = 1; i <= 6; i++) h[7 + i] = "S" + i;        // S1..S6 → 8..13
  h[14] = "시간 / giờ";
  h[15] = "1발 평균 시간(초) / 1 lần bắn";                 // ← 디코이(120 등) : 시리즈 아님
  h[16] = "결과 / Hạng/Nhóm";
  h[17] = "환산";
  for (let i = 7; i <= 10; i++) h[26 + i] = "S" + i;       // S7..S10 → 33..36
  const labels = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
  labels.forEach((p, k) => (h[37 + k] = `${p}점 개수 / Số điểm ${p}`)); // 37..47
  h[48] = "10점 최고 연속 / Chuỗi 10 dài nhất";
  return h;
}
function row10(opts) {
  opts = opts || {};
  const r = new Array(50).fill("");
  r[0] = opts.date || "2026-10-21 10:19:01";
  r[1] = opts.name || "Phạm Hoàng Gia Hưng";
  r[4] = opts.disc || "10m AP";
  r[7] = opts.total != null ? String(opts.total) : "952";
  const s = opts.series || [91, 92, 97, 94, 96, 94, 96, 99, 96, 97];
  for (let i = 0; i < 6; i++) if (s[i] != null) r[8 + i] = String(s[i]);     // S1..S6
  r[15] = opts.avgTime != null ? String(opts.avgTime) : "120.0";            // 디코이
  for (let i = 6; i < 10; i++) if (s[i] != null) r[33 + (i - 6)] = String(s[i]); // S7..S10
  const d = opts.dist || [8, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let k = 0; k < 11; k++) r[37 + k] = String(d[k]);
  r[48] = opts.long10 != null ? String(opts.long10) : "5";
  return r;
}
const meta = () => [["x"], ["x"], ["x"]]; // 상단 3행(메타)

test("10 시리즈 전부 읽고 평균시간(120) 디코이는 제외", () => {
  const rows = [...meta(), header(), row10()];
  const out = TCParse.buildSessions(rows);
  assert.strictEqual(out.length, 1);
  assert.deepStrictEqual(out[0].series, [91, 92, 97, 94, 96, 94, 96, 99, 96, 97]);
  assert.ok(!out[0].series.includes(120), "평균시간 120이 시리즈에 섞이면 안 됨");
  assert.strictEqual(out[0].total, 952);
  assert.strictEqual(out[0].name, "Phạm Hoàng Gia Hưng");
  assert.strictEqual(out[0].dk, "air");
  assert.strictEqual(out[0].long10, 5);
  assert.strictEqual(out[0].dist.length, 11);
  assert.strictEqual(out[0].dist[0], 8); // 10점 개수
});

test("6발 세션은 시리즈 6개만", () => {
  const rows = [...meta(), header(), row10({ total: 561, series: [93, 95, 92, 94, 95, 96] })];
  const out = TCParse.buildSessions(rows);
  assert.strictEqual(out[0].series.length, 6);
});

test("열 삽입 내성: S7~S10 앞에 열을 끼워 넣어도 헤더명으로 올바로 해석", () => {
  // 20번 위치에 새 열 삽입 → 이후 모든 열이 +1 이동
  const h = header(); h.splice(20, 0, "신규열 / New");
  const r = row10(); r.splice(20, 0, "???");
  const out = TCParse.buildSessions([...meta(), h, r]);
  assert.strictEqual(out.length, 1);
  assert.deepStrictEqual(out[0].series, [91, 92, 97, 94, 96, 94, 96, 99, 96, 97]);
  assert.ok(!out[0].series.includes(120));
});

test("resolveCols: 핵심 열을 모두 찾는다", () => {
  const c = TCParse.resolveCols(header());
  assert.strictEqual(c.date, 0);
  assert.strictEqual(c.name, 1);
  assert.strictEqual(c.disc, 4);
  assert.strictEqual(c.total, 7);
  assert.deepStrictEqual(c.series, [8, 9, 10, 11, 12, 13, 33, 34, 35, 36]);
  assert.strictEqual(c.dist.length, 11);
  assert.strictEqual(c.dist[0], 37);  // 10점 개수
  assert.strictEqual(c.dist[10], 47); // 0점 개수
  assert.notStrictEqual(c.dist[10], c.dist[0]);
  assert.strictEqual(c.long10, 48);
});

test("날짜/이름/총점 누락 행은 건너뜀", () => {
  const bad = new Array(50).fill(""); bad[1] = "No Date"; // 날짜/총점 없음
  const out = TCParse.buildSessions([...meta(), header(), bad, row10()]);
  assert.strictEqual(out.length, 1);
});

test("50m 종목 매핑", () => {
  const out = TCParse.buildSessions([...meta(), header(), row10({ disc: "50m", series: [88, 88, 89, 89, 89] })]);
  assert.strictEqual(out[0].dk, "pistol_50");
  assert.strictEqual(out[0].series.length, 5);
});
