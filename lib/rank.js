'use strict';
// =====================================================================
//  등위 계산 — ISSF 규정 6.15.1 (개인 10m/25m/50m)
//  원본 시트에 등위 컬럼이 없어 계산으로 생성한다.
//
//  6.15.1 동점처리 순서:
//    a) 이너텐(inner ten) 많은 순
//    b) 마지막 10발 시리즈 점수 높은 순 → 뒤에서부터 시리즈 카운트백
//    c) 발별 이너텐 비교        ← 원본에 발별 데이터 없음(구현 불가)
//    d) 발별 소수점 비교          ← 구현 불가
//    e) 그래도 같으면 공동순위
//
//  적용 규정: ISSF Rule Book 2026 (Second Print 07/2026, 2026-07-01 발효)
//    - 6.15.1 표제가 "10m, 25m, 50m and 300m Events" 를 모두 포함하고
//      (a) 이너텐 개수를 1순위로 규정.
//    - 25m 표적에도 이너텐이 정의·채점됨:
//        6.3.4.4 25m 속사권총 표적  Inner Ten 50mm
//        6.3.4.5 25m 정밀/50m 표적  Inner ten 25mm
//    → 전 종목(10m/25m/50m) 이너텐 우선 적용.
// =====================================================================

// 종목별 이너텐 우선 적용 여부. (규정 변경 대비해 플래그 유지)
const INNER_TEN_FIRST = {
  '10m': true,
  '25m': true,   // ISSF 6.15.1 + 6.3.4.4/6.3.4.5: 25m도 이너텐 우선
  '50m': true,
};

// 마지막 시리즈부터 거슬러 비교. a>b면 +1, a<b면 -1, 같으면 0
function countback(seriesA, seriesB) {
  const a = (seriesA || []).filter(v => v !== null && v !== undefined);
  const b = (seriesB || []).filter(v => v !== null && v !== undefined);
  const len = Math.max(a.length, b.length);
  for (let i = 1; i <= len; i++) {
    const va = a[a.length - i], vb = b[b.length - i];
    if (va === undefined || vb === undefined) break;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

// 두 성적 비교(내림차순 정렬용). r = {total, innerTens, series}
function compareResults(x, y, distance) {
  // 1) 총점
  if ((y.total ?? -Infinity) !== (x.total ?? -Infinity)) {
    return (y.total ?? -Infinity) - (x.total ?? -Infinity);
  }
  const innerFirst = INNER_TEN_FIRST[distance] ?? true;
  if (innerFirst) {
    // a) 이너텐
    const xi = x.innerTens ?? -1, yi = y.innerTens ?? -1;
    if (yi !== xi) return yi - xi;
    // b) 카운트백
    const cb = countback(x.series, y.series);
    if (cb !== 0) return -cb;
  } else {
    // 25m: 카운트백 먼저
    const cb = countback(x.series, y.series);
    if (cb !== 0) return -cb;
    const xi = x.innerTens ?? -1, yi = y.innerTens ?? -1;
    if (yi !== xi) return yi - xi;
  }
  return 0; // 공동순위
}

// 결과 배열에 qual_rank 부여. 경기참가(총점 有, 非DNF)만 순위, 나머지 null.
// 동점(비교 0)은 공동순위.
function assignQualRank(results, distance) {
  const ranked = results.filter(r => !r.is_dnf && r.total !== null && r.total !== undefined);
  ranked.sort((a, b) => compareResults(a, b, distance));
  let rank = 0, prev = null, seen = 0;
  for (const r of ranked) {
    seen++;
    if (prev && compareResults(prev, r, distance) === 0) {
      r.qual_rank = prev.qual_rank; // 공동순위
    } else {
      r.qual_rank = seen;
    }
    prev = r;
  }
  results.forEach(r => {
    if (r.is_dnf || r.total === null || r.total === undefined) r.qual_rank = null;
  });
  return results;
}

// 결선 순위: final_score 내림차순 (결선은 총점 하나뿐, 시리즈 없음)
function assignFinalRank(results) {
  const fin = results.filter(r => r.final_score !== null && r.final_score !== undefined);
  fin.sort((a, b) => b.final_score - a.final_score);
  let rank = 0, prev = null, seen = 0;
  for (const r of fin) {
    seen++;
    if (prev && prev.final_score === r.final_score) r.final_rank = prev.final_rank;
    else r.final_rank = seen;
    prev = r;
  }
  return results;
}

// 종합 등위(placement) — 여러 근거를 우선순위로 통합해 산정:
//   1) 메달(HC) — 연맹이 부여한 확정 사실. 금=1,은=2,동=3 (최우선)
//   2) 결선 순위(final_rank) — 결선 점수가 기록된 경우
//   3) 본선 순위(qual_rank)
//   결선 점수가 시트에 누락돼도 메달이 top3를 고정하므로 등위가 뒤집히지 않는다.
//   결선 없는 종목(50m·단체)도 동일 로직: 메달 → qual_rank.
const MEDAL_ORDER = { gold: 1, silver: 2, bronze: 3 };
function assignPlacement(results /*, hasFinal 미사용 */) {
  const ranked = results.filter(r =>
    !r.is_dnf && (r.qual_rank || r.final_rank || r.medal));
  const key = r => [
    MEDAL_ORDER[r.medal] || 9,
    r.final_rank || Infinity,
    r.qual_rank || Infinity,
  ];
  const cmp = (a, b) => {
    const ka = key(a), kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  };
  ranked.sort(cmp);
  let prev = null, seen = 0;
  for (const r of ranked) {
    seen++;
    r.placement = (prev && cmp(prev, r) === 0) ? prev.placement : seen;
    prev = r;
  }
  results.forEach(r => { if (r.is_dnf || (!r.qual_rank && !r.final_rank && !r.medal)) r.placement = null; });
  return results;
}

module.exports = {
  INNER_TEN_FIRST, countback, compareResults,
  assignQualRank, assignFinalRank, assignPlacement,
};
