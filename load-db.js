'use strict';
// =====================================================================
//  build/*.json → Supabase Postgres 직접 적재 (연결 문자열 사용)
//
//  publishable(anon) 키로는 RLS 때문에 대량 적재가 불가하므로,
//  Postgres 연결 문자열로 직결해서 스키마 적용 + 전량 적재를 한 번에 한다.
//
//  준비:
//    npm install
//    DATABASE_URL 환경변수에 연결 문자열(비밀번호 포함) 설정:
//      postgresql://postgres:<비밀번호>@db.qkrzrdwcchszkqrywnil.supabase.co:5432/postgres
//
//  실행:
//    node load-db.js            # schema.sql 적용 후 build/*.json 적재 (전량 재적재)
//    node load-db.js --data-only  # 스키마는 건드리지 않고 데이터만 재적재
// =====================================================================
const fs = require('fs'), path = require('path');
let Client;
try { ({ Client } = require('pg')); }
catch { console.error('먼저 `npm install` 을 실행하세요 (pg 필요).'); process.exit(1); }

const URL = process.env.DATABASE_URL;
if (!URL) {
  console.error('환경변수 DATABASE_URL 을 설정하세요 (비밀번호 포함 연결 문자열).');
  process.exit(1);
}
const B = path.join(__dirname, 'build');
const load = f => JSON.parse(fs.readFileSync(path.join(B, f), 'utf8'));
const dataOnly = process.argv.includes('--data-only');

// 테이블별 컬럼 순서 (JSON 키와 일치)
const COLS = {
  competitions: ['id', 'year', 'name', 'date_start', 'date_end', 'location', 'scope', 'raw_date_range'],
  events: ['id', 'competition_id', 'raw_name', 'distance', 'discipline', 'gender', 'age_category', 'team_type', 'event_code', 'has_final', 'n_series'],
  athletes: ['id', 'full_name', 'family_name', 'given_name', 'birth_year', 'birth_date', 'gender', 'nationality', 'is_foreign', 'identity_key'],
  affiliations: ['id', 'athlete_id', 'unit_code', 'year'],
  results: ['id', 'event_id', 'athlete_id', 'unit_code', 'relay', 'firing_point', 'bib', 'match_date', 'match_time', 'qual_total', 'inner_tens', 'final_score', 'medal', 'team_medal', 'team_medal_no', 'qual_rank', 'final_rank', 'placement', 'is_dnf', 'raw_event_name'],
  series: ['id', 'result_id', 'series_no', 'score'],
};
const FILES = {
  competitions: 'competitions.json', events: 'events.json', athletes: 'athletes.json',
  affiliations: 'affiliations.json', results: 'results.json', series: 'series.json',
};

async function insertTable(client, table, rows) {
  const cols = COLS[table];
  const CHUNK = 800;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const params = [];
    const tuples = slice.map((r, ri) => {
      const ph = cols.map((c, ci) => {
        params.push(r[c] === undefined ? null : r[c]);
        return '$' + (ri * cols.length + ci + 1);
      });
      return '(' + ph.join(',') + ')';
    });
    const sql = `insert into ${table} (${cols.join(',')}) values ${tuples.join(',')}`;
    await client.query(sql, params);
    process.stdout.write(`\r  ${table}: ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }
  process.stdout.write('\n');
}

async function main() {
  const meta = load('meta.json');
  const client = new Client({ connectionString: URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('연결 성공. 소스:', meta.source);

  try {
    if (!dataOnly) {
      console.log('스키마 적용 중 (schema.sql)...');
      await client.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    } else {
      console.log('데이터만 재적재 (자식→부모 순 삭제)...');
      for (const t of ['series', 'results', 'affiliations', 'athletes', 'events', 'competitions']) {
        await client.query(`delete from ${t}`);
      }
    }

    console.log('적재 중...');
    await client.query('begin');
    for (const t of ['competitions', 'events', 'athletes', 'affiliations', 'results', 'series']) {
      await insertTable(client, t, load(FILES[t]));
    }
    await client.query(
      `insert into ingest_runs (source_url, source_rows, loaded_rows, dropped_rows, note)
       values ($1,$2,$3,$4,$5)`,
      [meta.source, meta.generated_from_rows, meta.loaded_results, meta.dropped_vie, `min_year=${meta.min_year}`]);
    await client.query('commit');

    // 검증 카운트
    const { rows } = await client.query(`
      select
        (select count(*) from competitions) c,
        (select count(*) from events) e,
        (select count(*) from athletes) a,
        (select count(*) from results) r,
        (select count(*) from series) s,
        (select count(*) from results where medal is not null) m`);
    const v = rows[0];
    console.log(`\n적재 완료 — 대회 ${v.c} · 종목 ${v.e} · 선수 ${v.a} · 성적 ${v.r} · 시리즈 ${v.s} · 메달 ${v.m}`);
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error('\n[오류]', e.message); process.exit(1); });
