'use strict';
// =====================================================================
//  선수 심화 분석: 성적추이 · 일관성 · 시리즈 피로 프로파일 · 결선 전환력 · 국제 백분위
//  순수 SVG. app.js 의 전역(DISC, eventLabel, esc, el, airShots)을 사용.
// =====================================================================
window.Analytics = (function () {
  const mean = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
  const std = arr => { if (arr.length < 2) return 0; const m = mean(arr); return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length); };
  const fmt = (v, d = 1) => (v == null ? '–' : v.toFixed(d));

  // 선형회귀 기울기(경기당 변화)
  function slope(vals) {
    const n = vals.length; if (n < 2) return 0;
    const xm = (n - 1) / 2, ym = mean(vals);
    let num = 0, den = 0;
    vals.forEach((y, x) => { num += (x - xm) * (y - ym); den += (x - xm) ** 2; });
    return den ? num / den : 0;
  }

  // 추이 스파크라인 (값 시계열 + 추세선)
  function spark(vals, W = 240, H = 48, pad = 6) {
    if (vals.length < 2) return '';
    const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
    const x = i => pad + i * (W - 2 * pad) / (vals.length - 1);
    const y = v => pad + (1 - (v - mn) / rng) * (H - 2 * pad);
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const s = slope(vals), y0 = mean(vals) - s * (vals.length - 1) / 2, y1 = mean(vals) + s * (vals.length - 1) / 2;
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <line class="trend" x1="${x(0)}" y1="${y(y0)}" x2="${x(vals.length - 1)}" y2="${y(y1)}"/>
      <polyline class="line" points="${pts}"/>
      <circle class="dot" cx="${x(vals.length - 1)}" cy="${y(vals[vals.length - 1])}" r="2.6"/>
    </svg>`;
  }

  // 시리즈 피로 프로파일 바 (평균 대비 약세 강조)
  function seriesBars(avgs, W = 240, H = 56) {
    const m = mean(avgs), mn = Math.min(...avgs), mx = Math.max(...avgs), rng = (mx - mn) || 1;
    const bw = W / avgs.length;
    return `<svg class="bars" viewBox="0 0 ${W} ${H}">` + avgs.map((v, i) => {
      const h = 8 + (v - mn) / rng * (H - 20);
      const weak = v < m - 0.3;
      return `<rect class="${weak ? 'bar weak' : 'bar'}" x="${(i * bw + 3).toFixed(1)}" y="${(H - h - 12).toFixed(1)}" width="${(bw - 6).toFixed(1)}" height="${h.toFixed(1)}" rx="2"/>
        <text class="bl" x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 2}">${i + 1}</text>
        <text class="bv" x="${(i * bw + bw / 2).toFixed(1)}" y="${(H - h - 15).toFixed(1)}">${v.toFixed(0)}</text>`;
    }).join('') + `</svg>`;
  }

  // 국제 백분위 위치 막대
  function scaleBar(myVal, pool, W = 240, H = 30) {
    const vals = pool.map(p => p.best_qual);
    const mn = Math.min(...vals, myVal), mx = Math.max(...vals, myVal), rng = (mx - mn) || 1;
    const fx = v => 4 + (v - mn) / rng * (W - 8);
    const foreign = pool.filter(p => p.is_foreign).map(p => p.best_qual).sort((a, b) => a - b);
    const fMark = foreign.length ? foreign[Math.floor(foreign.length * 0.9)] : null; // 국제 상위10% 라인
    return `<svg class="scale" viewBox="0 0 ${W} ${H}">
      <line class="track" x1="4" y1="${H / 2}" x2="${W - 4}" y2="${H / 2}"/>
      ${fMark != null ? `<line class="ref" x1="${fx(fMark).toFixed(1)}" y1="4" x2="${fx(fMark).toFixed(1)}" y2="${H - 4}"/><text class="rt" x="${fx(fMark).toFixed(1)}" y="${H - 1}">국제상위</text>` : ''}
      <circle class="me" cx="${fx(myVal).toFixed(1)}" cy="${H / 2}" r="4.5"/>
      <text class="mt" x="${fx(myVal).toFixed(1)}" y="9">${myVal}</text>
    </svg>`;
  }

  async function render(a, rows, container) {
    const box = el('div', 'block', '<h3>심화 분석 <span class="sub2">종목별 · 폼/일관성/결선/국제대비</span></h3><div class="muted">분석 중…</div>');
    container.appendChild(box);

    // 개인 종목별 그룹
    const byDisc = new Map();
    rows.forEach(r => { if (r.event.team_type !== 'individual' || r.is_dnf || r.qual_total == null) return; (byDisc.get(r.event.discipline) || byDisc.set(r.event.discipline, []).get(r.event.discipline)).push(r); });
    if (!byDisc.size) { box.querySelector('.muted').textContent = '개인 종목 기록이 없습니다.'; return; }

    const cards = [];
    for (const [disc, list] of byDisc) {
      list.sort((x, y) => ((x.competition.date_start || '') + (x.match_date || '')).localeCompare((y.competition.date_start || '') + (y.match_date || '')));
      const vals = list.map(r => r.qual_total);
      const gender = list[0].event.gender;

      // 추이
      const s = slope(vals), recent = vals.length >= 4 ? mean(vals.slice(-3)) - mean(vals.slice(0, 3)) : 0;
      const arrow = s > 0.15 ? '▲' : s < -0.15 ? '▼' : '▬';
      // 일관성
      const sd = std(vals);
      // 시리즈 프로파일 (6시리즈 종목만)
      const nS = 6, sSum = new Array(nS).fill(0), sCnt = new Array(nS).fill(0);
      list.forEach(r => (r.series || []).forEach(sr => { if (sr.series_no >= 1 && sr.series_no <= nS) { sSum[sr.series_no - 1] += sr.score; sCnt[sr.series_no - 1]++; } }));
      const sAvg = sSum.map((v, i) => sCnt[i] ? v / sCnt[i] : null);
      const hasSeries = sAvg.every(v => v != null);
      let weakTxt = '';
      if (hasSeries) { const m = mean(sAvg); const weak = sAvg.map((v, i) => v < m - 0.3 ? i + 1 : null).filter(Boolean); weakTxt = weak.length ? `${weak.join('·')}시리즈 약세` : '시리즈 편차 작음(안정)'; }
      const is25 = ['sport', 'standard', 'centre_fire'].includes(disc);

      // 결선 전환력 (10m)
      let clutch = '';
      if (disc === 'air') {
        const fin = list.filter(r => r.final_score != null && r.final_rank);
        if (fin.length) {
          const qps = mean(fin.map(r => r.qual_total / 60));
          const fps = mean(fin.map(r => r.final_score / airShots(r.final_rank)));
          const dl = fps - qps;
          clutch = `<div class="an-line"><span class="al">결선 전환력</span> 본선 <b>${fmt(qps, 2)}</b>/발 → 결선 <b>${fmt(fps, 2)}</b>/발
            <span class="delta ${dl >= 0 ? 'up' : 'dn'}">${dl >= 0 ? '▲' : '▼'}${fmt(Math.abs(dl), 2)}</span>
            <span class="al2">${dl >= 0.1 ? '결선 강함' : dl <= -0.1 ? '결선 약세' : '유지'} · ${fin.length}회</span></div>`;
        }
      }

      // 국제 백분위
      const pool = await DB.eventScores({ discipline: disc, gender });
      const myBest = Math.max(...vals);
      const below = pool.filter(p => p.best_qual < myBest).length;
      const pct = pool.length ? Math.round((pool.length - below) / pool.length * 100) : null; // 상위 %
      const foreign = pool.filter(p => p.is_foreign).map(p => p.best_qual);
      const intlBelow = foreign.length ? Math.round(foreign.filter(v => v < myBest).length / foreign.length * 100) : null;

      cards.push(`<div class="an-card">
        <div class="an-h">${esc(DISC[disc] || disc)} <span class="an-n">${list.length}경기</span></div>
        <div class="an-line"><span class="al">추이</span> ${spark(vals)} <span class="al2">${arrow} 기울기 ${fmt(s, 2)}/경기${vals.length >= 4 ? ` · 최근3 vs 초반3 ${recent >= 0 ? '+' : ''}${fmt(recent, 1)}` : ''}</span></div>
        <div class="an-line"><span class="al">일관성</span> σ <b>${fmt(sd, 1)}</b> <span class="al2">(평균 ${fmt(mean(vals), 1)}, 낮을수록 안정)</span></div>
        ${hasSeries ? `<div class="an-line"><span class="al">시리즈</span> ${seriesBars(sAvg)} <span class="al2">${weakTxt}${is25 ? ' · 1~3정밀/4~6속사' : ''}</span></div>` : ''}
        ${clutch}
        <div class="an-line"><span class="al">국제대비</span> ${scaleBar(myBest, pool)} <span class="al2">최고 ${myBest} · 상위 ${pct != null ? pct + '%' : '–'}${intlBelow != null ? ` · 국제 상위 ${100 - intlBelow}%권` : ''}</span></div>
      </div>`);
    }
    box.innerHTML = '<h3>심화 분석 <span class="sub2">종목별 · 폼/일관성/결선/국제대비</span></h3>' + cards.join('');
  }

  return { render };
})();
