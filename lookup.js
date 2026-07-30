'use strict';
// 데모: 선수명(부분일치)으로 전 기록 조회 — build/*.json 기반
const path = require('path'), B = path.join(__dirname, 'build');
const norm = s => (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
const comps = require(path.join(B,'competitions.json'));
const events = require(path.join(B,'events.json'));
const aths = require(path.join(B,'athletes.json'));
const results = require(path.join(B,'results.json'));
const series = require(path.join(B,'series.json'));

const q = norm(process.argv[2] || 'Phạm Quang Huy');
const cById = Object.fromEntries(comps.map(c=>[c.id,c]));
const eById = Object.fromEntries(events.map(e=>[e.id,e]));
const serByR = {}; series.forEach(s=>(serByR[s.result_id] ||= []).push(s));

const matches = aths.filter(a => norm(a.full_name).includes(q));
console.log(`"${process.argv[2]||'Phạm Quang Huy'}" 검색 → 선수 ${matches.length}명\n`);

matches.slice(0,3).forEach(a => {
  console.log(`■ ${a.full_name}  (${a.birth_year||'?'}년생, ${a.gender||'?'}, ${a.nationality}${a.is_foreign?' 외국':''})`);
  const rs = results.filter(r=>r.athlete_id===a.id)
    .map(r=>({r, e:eById[r.event_id], c:cById[eById[r.event_id].competition_id]}))
    .sort((x,y)=> (x.c.date_start||'').localeCompare(y.c.date_start||''));
  rs.forEach(({r,e,c}) => {
    const ss = (serByR[r.id]||[]).sort((a,b)=>a.series_no-b.series_no).map(s=>s.score).join(' ');
    const place = r.placement ? `${r.placement}위` : (r.is_dnf?'기록없음':'-');
    const medal = r.medal ? ({gold:'金',silver:'銀',bronze:'銅'})[r.medal] : '  ';
    console.log(`   ${c.year} ${(c.name).slice(0,34).padEnd(34)} ${e.raw_name.padEnd(30)}`);
    console.log(`        ${medal} ${place.padStart(5)} | 소속 ${r.unit_code||'-'} | 본선 ${r.qual_total??'-'} (X${r.inner_tens??'-'})${r.final_score!=null?' | 결선 '+r.final_score:''}`);
    if (ss) console.log(`        시리즈: ${ss}`);
  });
  console.log('');
});
