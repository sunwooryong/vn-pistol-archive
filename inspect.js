'use strict';
const path = require('path'), B = path.join(__dirname, 'build');
const c = require(path.join(B, 'competitions.json'));
const e = require(path.join(B, 'events.json'));
const r = require(path.join(B, 'results.json'));
const a = require(path.join(B, 'athletes.json'));
const aff = require(path.join(B, 'affiliations.json'));

const ev2c = {}; e.forEach(x => ev2c[x.id] = x.competition_id);
const cnt = {}; r.forEach(x => { const cid = ev2c[x.event_id]; cnt[cid] = (cnt[cid] || 0) + 1; });
console.log('=== 대회별 성적 수 ===');
c.sort((x, y) => x.year - y.year || x.name.localeCompare(y.name))
  .forEach(x => console.log(String(cnt[x.id] || 0).padStart(4), x.year, x.scope.slice(0, 4), '|', x.date_start, '|', x.name));
console.log('총', c.length, '대회\n');

// 이적/겸직 선수
const byAth = {}; aff.forEach(x => (byAth[x.athlete_id] ||= new Set()).add(x.unit_code));
const id2ath = {}; a.forEach(x => id2ath[x.id] = x);
const movers = Object.entries(byAth).filter(([, s]) => s.size > 1);
console.log('=== 소속 2개+ 선수:', movers.length, '===');
movers.slice(0, 25).forEach(([aid, s]) => {
  const at = id2ath[aid];
  console.log('  ', at.full_name, at.birth_year || '?', at.is_foreign ? '(외국)' : '', '→', [...s].join(','));
});
