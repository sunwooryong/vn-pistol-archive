'use strict';
// =====================================================================
//  파싱 유틸: CSV, 숫자(쉼표 소수점), 날짜, 종목명 정규화, ID 분해
// =====================================================================

// --- CSV (따옴표/이스케이프 처리) ---------------------------------
function parseCSV(s) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      if (q && s[i + 1] === '"') { cur += '"'; i++; } else q = !q;
    } else if (c === ',' && !q) { row.push(cur); cur = ''; }
    else if (c === '\n' && !q) { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c === '\r' && !q) { /* skip */ }
    else cur += c;
  }
  row.push(cur); rows.push(row);
  return rows.map(r => r.map(v => (v || '').trim()));
}

// --- 문자열 정규화(성조/đ 제거, 소문자) ----------------------------
function norm(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// --- 숫자: "86,0" → 86.0, 빈값 → null ------------------------------
function num(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  if (t === '') return null;
  const n = parseFloat(t.replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

// --- 날짜범위 "29.06 - 08.07.2026" → {start,end} (ISO) -------------
function parseDateRange(raw, fallbackYear) {
  const t = String(raw || '').trim();
  // 끝 연도
  const yEnd = (t.match(/(\d{4})\s*$/) || [])[1] || fallbackYear;
  const nums = [...t.matchAll(/(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?/g)];
  const toISO = (d, m, y) =>
    `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  let start = null, end = null;
  if (nums.length >= 1) {
    const a = nums[0];
    start = toISO(a[1], a[2], a[3] || yEnd);
  }
  if (nums.length >= 2) {
    const b = nums[1];
    end = toISO(b[1], b[2], b[3] || yEnd);
  } else if (nums.length === 1) {
    end = start;
  }
  return { start, end };
}

// --- 경기 일시 "09:30 07.07.2026" → {date:'2026-07-07', time:'09:30'} ---
function parseMatchDateTime(raw) {
  const t = String(raw || '').trim();
  const dm = t.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  const tm = t.match(/(\d{1,2})[:h](\d{2})/);
  const date = dm ? `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}` : null;
  const time = tm ? `${tm[1].padStart(2, '0')}:${tm[2]}` : null;
  return { date, time };
}

// --- ID 분해: [UNIT][gender][YYYYMMDD][NN] -------------------------
//   예: HAP11976072701 → {unit:'HAP', gender:'M', dob:'1976-07-27'}
//   국제행은 ID가 짧거나(예 CHN21088) 없음 → 부분만 반환
function parseId(id) {
  const t = String(id || '').trim();
  const full = t.match(/^([A-Z]{2,4})([12])(\d{4})(\d{2})(\d{2})(\d{2})$/);
  if (full) {
    const [, unit, g, yyyy, mm, dd] = full;
    const yr = +yyyy;
    const plausibleYear = yr >= 1940 && yr <= 2016;
    const validDate = plausibleYear && +mm >= 1 && +mm <= 12 && +dd >= 1 && +dd <= 31;
    return {
      unit,
      gender: g === '1' ? 'M' : 'W',
      birthYear: plausibleYear ? yr : null,
      birthDate: validDate ? `${yyyy}-${mm}-${dd}` : null,
    };
  }
  return null;
}

// =====================================================================
//  종목명 정규화 — 가장 중요한 부분
//  반환: { ok, code, distance, discipline, gender, age, team, isFinal, isPartial }
//    ok=false      → 권총 아님(호출측에서 걸러짐)
//    isFinal=true  → "- C.kết" 스케줄 행 (선수 없음, 적재 제외)
//    isPartial=true→ 1/2·2/2·Chậm/Nhanh·relay분할 등 중복/부분 (적재 제외)
// =====================================================================
function parseEvent(rawEvent) {
  const raw = String(rawEvent || '').trim();
  let e = norm(raw);
  if (!e.includes('sung ngan')) return { ok: false };

  const result = {
    ok: true, raw,
    distance: null, discipline: null, gender: null,
    age: 'senior', team: 'individual',
    isFinal: false, isPartial: false, code: null, nSeries: null,
  };

  // 결선 스케줄 행
  if (/\bc[\.\/]?\s?ket\b/.test(e) || /chung ket/.test(e)) result.isFinal = true;

  // 부분/중복 행: 절반(1/2,2/2), 정밀/속사 분할(chậm/nhanh), 릴레이 분할(- 1,- 2 / 뒤 단독숫자 2,3)
  if (/\b[12]\/2\b/.test(e)) result.isPartial = true;
  if (/\bcham\b/.test(e) || /\bnhanh\b/.test(e)) {
    // "bắn nhanh"(속사권총 정식명)의 nhanh 은 제외해야 함
    if (!/ban nhanh/.test(e)) result.isPartial = true;
  }

  // --- 거리 ---
  const dm = e.match(/\b(10|25|50)m\b/);
  result.distance = dm ? dm[1] + 'm' : null;

  // --- 혼성/성별 ---
  if (/hon hop/.test(e)) result.gender = 'X';
  else if (/\bnu\b/.test(e)) result.gender = 'W';
  else if (/\bnam\b/.test(e)) result.gender = 'M';

  // --- 단체 ---
  if (/dong doi/.test(e)) result.team = result.gender === 'X' ? 'mixed_team' : 'team';
  else if (/hon hop/.test(e)) result.team = 'mixed_team';

  // --- 연령부 ---
  if (/thieu nien/.test(e)) result.age = 'youth';
  else if (/\btre\b/.test(e)) result.age = 'junior';
  else if (/(^|[^0-9])18([^0-9]|$)/.test(e)) result.age = 'u18';
  else if (/(^|[^0-9])16([^0-9]|$)/.test(e)) result.age = 'u16';

  // --- 세부종목(discipline) ---
  if (result.distance === '10m') {
    if (/hoi/.test(e)) result.discipline = 'air';
  } else if (result.distance === '25m') {
    if (/ban nhanh/.test(e)) result.discipline = 'rapid_fire';
    else if (/the thao/.test(e)) result.discipline = 'sport';
    else if (/tie?u chuan/.test(e)) result.discipline = 'standard';   // tiêu/tiểu 오타 흡수
    else if (/o quay/.test(e)) result.discipline = 'centre_fire';
  } else if (result.distance === '50m') {
    result.discipline = 'pistol_50';
  }

  // 시리즈 기대 개수
  if (result.team === 'mixed_team' || result.team === 'team') result.nSeries = 3; // 30발
  else result.nSeries = 6; // 60발

  // 종목코드
  const distCode = { '10m': 'AP10M', '25m': null, '50m': 'FP50M' };
  const disc25 = {
    rapid_fire: 'RFP25M', sport: 'SP25M', standard: 'STP25M', centre_fire: 'CFP25M',
  };
  let base = result.distance === '10m' ? 'AP10M'
    : result.distance === '50m' ? 'FP50M'
    : disc25[result.discipline] || null;
  if (base) {
    const parts = [base, result.gender || '?', result.age.toUpperCase()];
    if (result.team !== 'individual') parts.push(result.team === 'mixed_team' ? 'MIX' : 'TEAM');
    result.code = parts.join('-');
  }

  // 분류 완전성: 거리+세부종목+성별이 다 있어야 유효
  result.classified = !!(result.distance && result.discipline && result.gender && result.code);
  return result;
}

// 종목 규정상 결선 존재 여부 (50m 권총은 결선 없음: ISSF 6.11.9.8)
function eventHasFinal(parsed) {
  if (parsed.distance === '50m') return false;
  if (parsed.team !== 'individual') return false; // 단체전은 결선 없음(본선 합산)
  return true;
}

module.exports = {
  parseCSV, norm, num, parseDateRange, parseMatchDateTime, parseId, parseEvent, eventHasFinal,
};
