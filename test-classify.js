'use strict';
// 파서 검증: 권총 종목 전 변형을 분류하고 미분류/부분/결선을 리포트
const fs = require('fs'), path = require('path');
const { parseCSV, norm, parseEvent } = require('./lib/parse');

const CSV = process.argv[2] || path.join(__dirname, 'data', 'shooting.csv');

const rows = parseCSV(fs.readFileSync(CSV, 'utf8'));
const data = rows.slice(2).filter(r => r[0]);
const C = { year: 0, event: 5, ho: 11, ten: 12 };

const evCount = {};
data.forEach(r => {
  if (+r[C.year] < 2024) return;
  if (!norm(r[C.event]).includes('sung ngan')) return;
  evCount[r[C.event]] = (evCount[r[C.event]] || 0) + 1;
});

const cats = { classified: [], final: [], partial: [], unclassified: [] };
let rowsClassified = 0, rowsFinal = 0, rowsPartial = 0, rowsUnclassified = 0;

Object.entries(evCount).sort((a, b) => b[1] - a[1]).forEach(([raw, n]) => {
  const p = parseEvent(raw);
  if (p.isFinal) { cats.final.push([raw, n, p.code]); rowsFinal += n; }
  else if (p.isPartial) { cats.partial.push([raw, n, p.code]); rowsPartial += n; }
  else if (p.classified) { cats.classified.push([raw, n, p.code]); rowsClassified += n; }
  else { cats.unclassified.push([raw, n, JSON.stringify(p)]); rowsUnclassified += n; }
});

const out = [];
const log = (...a) => { out.push(a.join(' ')); };

log('=== 권총 종목 분류 결과 (2024+) ===');
log(`고유 종목명: ${Object.keys(evCount).length}`);
log(`  분류 성공: ${cats.classified.length}종 / ${rowsClassified}행`);
log(`  결선 스케줄(제외): ${cats.final.length}종 / ${rowsFinal}행`);
log(`  부분·중복(제외): ${cats.partial.length}종 / ${rowsPartial}행`);
log(`  ★미분류: ${cats.unclassified.length}종 / ${rowsUnclassified}행`);

log('\n--- 표준코드별 집계 ---');
const byCode = {};
cats.classified.forEach(([raw, n, code]) => { byCode[code] = (byCode[code] || 0) + n; });
Object.entries(byCode).sort((a, b) => b[1] - a[1])
  .forEach(([code, n]) => log(`  ${String(n).padStart(5)}  ${code}`));

if (cats.unclassified.length) {
  log('\n--- ★미분류 상세 (반드시 0이어야 함) ---');
  cats.unclassified.forEach(([raw, n, j]) => log(`  ${n}  "${raw}"  ${j}`));
}

log('\n--- 부분·중복으로 제외된 종목명 ---');
cats.partial.forEach(([raw, n, code]) => log(`  ${n}  "${raw}" → ${code}`));

log('\n--- 결선 스케줄로 제외된 종목명 (앞 10) ---');
cats.final.slice(0, 10).forEach(([raw, n]) => log(`  ${n}  "${raw}"`));

const rep = out.join('\n');
fs.writeFileSync(path.join(__dirname, 'classify-report.txt'), rep, 'utf8');
console.log(rep);
