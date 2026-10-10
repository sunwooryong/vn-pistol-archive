// predict.js — 선수 미래 성적 예측 엔진 (코치 전용)
// 입력: 훈련 세션(psa·wx 포함) + 대회 성적(등위·결선) → 다음달/다음대회/내년12개월/환경/PB/ETA/슬럼프
// 모든 추정은 표본 5회 미만이면 정보부족(null + low:true). 순수 계산, 외부 의존 없음.
(function () {
  'use strict';
  const MIN = 5;                       // 정보부족 임계
  const STD_SHOTS = { air: 60, air_rifle: 60, air_rifle_std: 60, sport: 60, standard: 60, centre_fire: 60, pistol_50: 60, rapid_fire: 60, rt: 60, rt_mix: 40, rt_std: 60 };

  const day = s => { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null; };
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const sd = a => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length); };
  function linreg(pts) { // pts: [[x,y]]
    const n = pts.length; if (n < 2) return null;
    const xm = mean(pts.map(p => p[0])), ym = mean(pts.map(p => p[1]));
    let num = 0, den = 0; for (const [x, y] of pts) { num += (x - xm) * (y - ym); den += (x - xm) * (x - xm); }
    if (den === 0) return { slope: 0, intercept: ym, xm, ym };
    const slope = num / den; return { slope, intercept: ym - slope * xm, xm, ym };
  }
  // 표준정규 CDF (PB 경신 확률 등)
  function ncdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp(-z * z / 2); let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }

  function mainDisc(tr) { // 가장 세션 많은 종목(dk)
    const c = {}; tr.forEach(s => { if (s.dk) c[s.dk] = (c[s.dk] || 0) + 1; });
    let best = null, bn = 0; for (const k in c) if (c[k] > bn) { bn = c[k]; best = k; }
    return best;
  }

  function forecast(dk, tr, career, opts) {
    opts = opts || {};
    const rows = tr.filter(s => s.dk === dk && s.psa != null && s.date).sort((a, b) => a.date.localeCompare(b.date));
    const stdShots = STD_SHOTS[dk] || 60;
    const toQual = psa => psa == null ? null : Math.round(psa * stdShots * 10) / 10;  // 본선 환산
    const R = { dk, stdShots, nSessions: rows.length, enough: rows.length >= MIN };
    if (rows.length < MIN) { R.low = true; return R; }

    const pts = rows.map(s => [day(s.date), s.psa]).filter(p => p[0] != null);
    const reg = linreg(pts);
    const last = pts[pts.length - 1][0];
    const recent = rows.slice(-20).map(s => s.psa);
    const mRecent = mean(recent), sRecent = sd(recent) || 0.5;
    const slopeDay = reg ? reg.slope : 0;
    const at = d => reg ? reg.intercept + reg.slope * d : mRecent;
    const lvlNow = Math.max(at(last), mRecent - 0);     // 현재 수준(회귀 끝점)
    R.cur = { psa: Math.round(mRecent * 100) / 100, qual: toQual(mRecent), sd: Math.round(sRecent * 100) / 100 };
    R.recent = recent.map(v => Math.round(v * 100) / 100);         // 차트용 최근 psa 시퀀스
    R.recentDates = rows.slice(-20).map(s => s.date);

    // ---- 보수적(냉정한) 예측: 감쇠 추세(damped trend) + 현실적 연간 상한 ----
    // 선형 외삽은 과대추정 → 실력 향상은 체감(플래토)한다고 보고 월별 감쇠·연간 이득 상한을 둔다.
    const slopeMonth = slopeDay * 30;
    const DAMP = 0.80, SHRINK = 0.65, ANNUAL_CAP = 0.13; // ANNUAL_CAP: 연 최대 +0.13psa(≈+8점/60발)까지만 상승 인정
    const projGain = months => {
      months = Math.max(0, months);
      let f = 0, p = 1; for (let k = 1; k <= Math.ceil(months); k++) { p *= DAMP; f += p; } // Σ φ^k (감쇠 누적)
      let g = slopeMonth * SHRINK * f;
      if (g >= 0) g = Math.min(g, ANNUAL_CAP * Math.min(1.2, months / 12)); // 상승은 현실 상한
      else g = Math.max(g, -0.9 * (months / 12) - 0.05);                     // 하락은 냉정히 덜 제한
      return g;
    };
    const projPsa = months => mRecent + projGain(months);

    // 다음 달 / 다음 대회(≈2주 뒤)
    const pNextComp = projPsa(0.5), pNextMonth = projPsa(1);
    R.nextMonth = { psa: Math.round(pNextMonth * 100) / 100, qual: toQual(pNextMonth), delta: Math.round((pNextMonth - mRecent) * 100) / 100 };
    R.nextComp = { qual: toQual(pNextComp), lo: toQual(pNextComp - sRecent), hi: toQual(pNextComp + sRecent) };

    // 내년 12개월 (감쇠 추세 + 계절효과, 표본<3이면 추세만)
    const monthRes = {};  // month(1-12) -> residuals
    rows.forEach(s => { const d = day(s.date), mo = +s.date.slice(5, 7); if (reg) (monthRes[mo] = monthRes[mo] || []).push(s.psa - at(d)); });
    const yr = (opts.year || (new Date().getFullYear() + 1));
    R.year = yr;
    R.monthly = [];
    for (let mo = 1; mo <= 12; mo++) {
      const mid = Date.UTC(yr, mo - 1, 15) / 86400000;
      let p = projPsa((mid - last) / 30.44);
      const res = monthRes[mo] || []; let seas = 0, sLow = res.length < 3;
      if (res.length >= 3) { seas = Math.max(-0.4, Math.min(0.4, mean(res))); p += seas; }
      R.monthly.push({ mo, qual: toQual(p), low: sLow });
    }
    const yq = R.monthly.map(m => m.qual);
    R.nextSeason = { qualMid: Math.round(mean(yq)), lo: Math.min(...yq), hi: Math.max(...yq) };

    // 개인최고(PB) & 경신 확률
    const pb = Math.max(...rows.map(s => s.psa));
    R.pb = { psa: Math.round(pb * 100) / 100, qual: toQual(pb) };
    const z = sRecent ? (pb - pNextComp) / sRecent : 9;
    R.pbProb = Math.round((1 - ncdf(z)) * 100);  // 다음대회 psa>pb 확률

    // 목표 ETA (현실적 연 상승률 기준)
    const goalQ = opts.goalQual || (Math.ceil((toQual(mRecent) + 5) / 5) * 5);
    const goalPsa = goalQ / stdShots;
    const annualGain = projPsa(12) - mRecent; // 현실적 연 상승폭(감쇠·상한 적용)
    if (annualGain > 0.01 && goalPsa > mRecent) {
      const months = (goalPsa - mRecent) / (annualGain / 12);
      R.eta = { goalQual: goalQ, days: Math.round(months * 30.44), months: Math.round(months * 10) / 10 };
    } else R.eta = { goalQual: goalQ, days: null, months: null, note: annualGain <= 0.01 ? '추세 정체(현 기록 유지 전망)' : '이미 도달' };

    // 슬럼프 조기경보: 최근5 평균이 직전10 대비 하락 또는 변동성 급증
    if (rows.length >= 15) {
      const r5 = mean(rows.slice(-5).map(s => s.psa)), p10 = mean(rows.slice(-15, -5).map(s => s.psa));
      const s5 = sd(rows.slice(-5).map(s => s.psa)) || 0, sAll = sd(rows.map(s => s.psa)) || 1;
      const drop = p10 - r5;
      R.slump = { drop: Math.round(drop * 100) / 100, warn: (drop > sRecent * 0.6) || (s5 > sAll * 1.6), volUp: s5 > sAll * 1.6 };
    }

    // 시리즈 위치별 약점 (S1..Smax)
    const pos = {};
    rows.slice(-20).forEach(s => (s.series || []).forEach((v, i) => { if (v != null) (pos[i] = pos[i] || []).push(v); }));
    const serArr = Object.keys(pos).map(i => ({ s: +i + 1, avg: mean(pos[i]), n: pos[i].length })).filter(x => x.n >= 3);
    if (serArr.length) { R.series = serArr; R.weakSeries = serArr.reduce((a, b) => b.avg < a.avg ? b : a); }

    // 환경 적응지수 (온도대/날씨/시간대) — psa 기준, n≥MIN만 유효
    const wxRows = rows.filter(s => s.wx);
    const grp = (keyFn) => { const g = {}; wxRows.forEach(s => { const k = keyFn(s); if (k == null) return; (g[k] = g[k] || []).push(s.psa); }); return Object.entries(g).map(([k, v]) => ({ k, psa: Math.round(mean(v) * 100) / 100, n: v.length, low: v.length < MIN })).sort((a, b) => b.psa - a.psa); };
    const tempBand = s => s.wx.temp == null ? null : (s.wx.temp <= 30 ? '≤30℃' : s.wx.temp <= 33 ? '31–33℃' : '≥34℃');
    const weaKo = s => s.wx.weather ? s.wx.weather.split('/')[0].trim() : null;
    R.env = {
      n: wxRows.length,
      temp: grp(tempBand), weather: grp(weaKo), daypart: grp(s => s.wx.daypart === 'AM' ? '오전' : s.wx.daypart === 'PM' ? '오후' : null),
      coord: (() => { const la = wxRows.map(s => s.wx.lat).filter(v => v != null), lo = wxRows.map(s => s.wx.lon).filter(v => v != null); return la.length ? { lat: Math.round(mean(la) * 1e4) / 1e4, lon: Math.round(mean(lo) * 1e4) / 1e4, n: la.length } : null; })(),
    };

    // 대회 등위·결선 예측
    if (career && career.length) {
      const cdisc = r => (r.event && r.event.discipline) || r.discipline || r.dk || r.disc;
      const cr = career.filter(r => cdisc(r) === dk && r.placement).map(r => ({ d: r.match_date || (r.competition && r.competition.date_start) || r.date || '', p: +r.placement, f: (r.final_score != null ? +r.final_score : null) })).filter(r => r.d).sort((a, b) => a.d.localeCompare(b.d));
      if (cr.length >= 3) {
        const recentP = cr.slice(-5).map(r => r.p), allP = cr.map(r => r.p);
        const pr = linreg(cr.map((r, i) => [i, r.p]));
        const nextIdx = cr.length;
        const predP = pr ? Math.max(1, Math.round(pr.intercept + pr.slope * nextIdx)) : Math.round(mean(recentP));
        R.placement = { recentAvg: Math.round(mean(recentP) * 10) / 10, allAvg: Math.round(mean(allP) * 10) / 10, expLo: Math.max(1, predP - 2), expHi: predP + 2, improving: pr && pr.slope < -0.1, n: cr.length, low: cr.length < MIN, seq: cr.map(r => r.p), finIdx: cr.map((r, i) => r.f != null ? i : -1).filter(i => i >= 0) };
        const fins = cr.filter(r => r.f != null);
        const finCount = fins.length;
        R.finals = { rate: Math.round(finCount / cr.length * 100), prob: Math.min(90, Math.round((mean(recentP) <= 8 ? 55 : 25) + (R.placement.improving ? 15 : 0))), expScore: finCount ? Math.round(mean(fins.map(r => r.f)) * 10) / 10 : null, n: finCount, low: finCount < 3 };
      } else R.placement = { low: true, n: cr.length };
    }
    return R;
  }

  window.Predict = { forecast, mainDisc, MIN, toYearQualUnit: STD_SHOTS };
})();
