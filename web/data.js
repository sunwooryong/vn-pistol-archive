// =====================================================================
//  데이터 계층 — local(build JSON) / supabase(REST) 공통 인터페이스
//  모든 함수는 동일한 형태를 반환하므로 UI 는 소스에 무관.
// =====================================================================
(function () {
  const cfg = window.APP_CONFIG;
  // 배포(C안): 개발·운영 모두 미리 빌드된 build/*.json 을 읽는다(GitHub Pages 정적).
  //   mode 'auto'|'local' → JSON, 'supabase' → REST(선택).
  const MODE = cfg.mode === 'supabase' ? 'supabase' : 'local';
  // 데이터 경로: 개발은 /web/index.html(→ ../build/), 배포는 사이트 루트(→ ./build/).
  const DATA_BASE = cfg.dataBase || (location.pathname.includes('/web/') ? '../build/' : './build/');

  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();

  // ---------- LOCAL ----------
  const Local = (() => {
    let db = null, metaCache = null;
    async function ensure() {
      if (db) return db;
      const base = DATA_BASE;
      const [competitions, events, athletes, affiliations, results, series, meta] = await Promise.all(
        ['competitions', 'events', 'athletes', 'affiliations', 'results', 'series', 'meta']
          .map(f => fetch(base + f + '.json', { cache: 'no-store' }).then(r => r.json())));
      metaCache = meta;
      const compById = new Map(competitions.map(c => [c.id, c]));
      const evById = new Map(events.map(e => [e.id, e]));
      const athById = new Map(athletes.map(a => [a.id, a]));
      const athByKey = new Map(athletes.map(a => [a.identity_key, a]));
      const resByAth = new Map(), resByEv = new Map(), serByRes = new Map(), affByAth = new Map();
      results.forEach(r => {
        (resByAth.get(r.athlete_id) || resByAth.set(r.athlete_id, []).get(r.athlete_id)).push(r);
        (resByEv.get(r.event_id) || resByEv.set(r.event_id, []).get(r.event_id)).push(r);
      });
      series.forEach(s => (serByRes.get(s.result_id) || serByRes.set(s.result_id, []).get(s.result_id)).push(s));
      affiliations.forEach(a => (affByAth.get(a.athlete_id) || affByAth.set(a.athlete_id, []).get(a.athlete_id)).push(a));
      athletes.forEach(a => a._n = norm(a.full_name));
      db = { competitions, events, athletes, affiliations, results, series,
        compById, evById, athById, athByKey, resByAth, resByEv, serByRes, affByAth };
      return db;
    }
    const enrich = (r, d) => {
      const e = d.evById.get(r.event_id), c = d.compById.get(e.competition_id), a = d.athById.get(r.athlete_id);
      return { ...r, event: e, competition: c, athlete: a,
        series: (d.serByRes.get(r.id) || []).slice().sort((x, y) => x.series_no - y.series_no) };
    };
    return {
      async years() { const d = await ensure(); return [...new Set(d.competitions.map(c => c.year))].sort((a, b) => b - a); },
      async searchAthletes(q) {
        const d = await ensure(); const nq = norm(q); if (!nq) return [];
        return d.athletes.filter(a => a._n.includes(nq)).slice(0, 40).map(a => ({
          ...a, units: [...new Set((d.affByAth.get(a.id) || []).map(x => x.unit_code))].join(', '),
          n_results: (d.resByAth.get(a.id) || []).length,
          n_medals: (d.resByAth.get(a.id) || []).filter(r => r.medal).length,
        })).sort((x, y) => y.n_results - x.n_results);
      },
      async athleteCareer(id) {
        const d = await ensure();
        return (d.resByAth.get(id) || []).map(r => enrich(r, d))
          .sort((x, y) => (x.competition.date_start || '').localeCompare(y.competition.date_start || ''));
      },
      async meta() { await ensure(); return metaCache; },
      async news() { return fetch(DATA_BASE + 'news.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []); },
      async athleteByKey(key) { const d = await ensure(); return d.athByKey.get(key) || null; },
      // 종목·성별 선수별 최고점 (국제 백분위 벤치마크). 국내+국제 전체.
      async eventScores({ discipline, gender } = {}) {
        const d = await ensure();
        const best = new Map();
        d.results.forEach(r => {
          const e = d.evById.get(r.event_id);
          if (e.team_type !== 'individual' || e.discipline !== discipline) return;
          if (gender && e.gender !== gender) return;
          if (r.is_dnf || r.qual_total == null) return;
          const a = d.athById.get(r.athlete_id), o = best.get(r.athlete_id);
          if (!o || r.qual_total > o.best_qual) best.set(r.athlete_id, { athlete_id: r.athlete_id, is_foreign: a.is_foreign, best_qual: r.qual_total });
        });
        return [...best.values()];
      },
      async competitions(year, scope) {
        const d = await ensure();
        let cs = d.competitions.slice();
        if (year) cs = cs.filter(c => c.year === +year);
        if (scope) cs = cs.filter(c => c.scope === scope);
        return cs.sort((a, b) => (b.date_start || '').localeCompare(a.date_start || ''))
          .map(c => ({ ...c, n_events: d.events.filter(e => e.competition_id === c.id).length }));
      },
      async eventsOf(compId) {
        const d = await ensure();
        return d.events.filter(e => e.competition_id === +compId)
          .map(e => {
            const rs = d.resByEv.get(e.id) || [];
            const dates = [...new Set(rs.filter(r => r.match_date).map(r => r.match_date))].sort();
            const first = rs.find(r => r.match_date === dates[0]);
            return { ...e, n: rs.length, match_date: dates[0] || null, match_time: first ? first.match_time : null, match_dates: dates };
          })
          .sort((a, b) => (a.match_date || '').localeCompare(b.match_date || '') || a.event_code.localeCompare(b.event_code));
      },
      async eventRanking(eventId) {
        const d = await ensure();
        return (d.resByEv.get(+eventId) || []).map(r => enrich(r, d))
          .sort((a, b) => (a.placement || 999) - (b.placement || 999));
      },
      async medals({ year, discipline, scope } = {}) {
        const d = await ensure();
        return d.results.filter(r => r.medal || r.team_medal).map(r => enrich(r, d)).filter(r =>
          (!year || r.competition.year === +year) &&
          (!discipline || r.event.discipline === discipline) &&
          (!scope || r.competition.scope === scope))
          .sort((a, b) => (b.competition.date_start || '').localeCompare(a.competition.date_start || '')
            || (a.event.event_code.localeCompare(b.event.event_code))
            || ((a.placement || 9) - (b.placement || 9)));
      },
      // 종목·연령부 종합 랭킹 (개인 종목, 평균 본선점수). year 주면 그 해만.
      async eventAvg({ year, discipline, gender, age_category } = {}) {
        const d = await ensure();
        const agg = new Map();
        d.results.forEach(r => {
          const e = d.evById.get(r.event_id);
          if (e.team_type !== 'individual') return;
          const c = d.compById.get(e.competition_id);
          if (!c || c.scope !== 'domestic') return;   // 국내 대회만 집계
          if (year && c.year !== +year) return;
          if (discipline && e.discipline !== discipline) return;
          if (gender && e.gender !== gender) return;
          if (age_category && e.age_category !== age_category) return;
          if (r.is_dnf || r.qual_total == null) return;
          const a = d.athById.get(r.athlete_id);
          let o = agg.get(r.athlete_id);
          if (!o) { o = { athlete_id: r.athlete_id, identity_key: a.identity_key, full_name: a.full_name, birth_year: a.birth_year, gender: a.gender, nationality: a.nationality, is_foreign: a.is_foreign, unit: r.unit_code, _ud: '', sum: 0, n_games: 0, best_qual: 0, best_final: null, n_medals: 0 }; agg.set(r.athlete_id, o); }
          o.sum += r.qual_total; o.n_games++;
          if (r.qual_total > o.best_qual) o.best_qual = r.qual_total;
          if (r.final_score != null && (o.best_final == null || r.final_score > o.best_final)) o.best_final = r.final_score;
          if (r.medal) o.n_medals++;
          // 현재 소속 = 가장 최근 국내 대회의 소속
          const ud = (c.date_start || '') + (r.match_date || '');
          if (r.unit_code && ud >= o._ud) { o.unit = r.unit_code; o._ud = ud; }
        });
        return [...agg.values()].map(o => ({ ...o, avg_qual: Math.round(o.sum / o.n_games * 10) / 10 }))
          .sort((a, b) => b.avg_qual - a.avg_qual);
      },
    };
  })();

  // ---------- SUPABASE (PostgREST) ----------
  const Supa = (() => {
    const base = cfg.supabaseUrl + '/rest/v1/';
    const H = { apikey: cfg.supabaseKey, Authorization: 'Bearer ' + cfg.supabaseKey };
    const get = (p) => fetch(base + p, { headers: H }).then(r => { if (!r.ok) throw new Error(r.status + ' ' + p); return r.json(); });
    const enc = encodeURIComponent;
    return {
      async years() {
        const r = await get('competitions?select=year');
        return [...new Set(r.map(x => x.year))].sort((a, b) => b - a);
      },
      async searchAthletes(q) {
        return get(`v_athlete_directory?full_name=ilike.*${enc(q)}*&order=n_results.desc&limit=40`);
      },
      async athleteCareer(id) {
        const rows = await get(`v_athlete_results?athlete_id=eq.${id}&order=date_start.asc&limit=500`);
        const ids = rows.map(r => r.result_id);
        let ser = [];
        if (ids.length) ser = await get(`series?result_id=in.(${ids.join(',')})&order=series_no.asc&limit=5000`);
        const byRes = new Map(); ser.forEach(s => (byRes.get(s.result_id) || byRes.set(s.result_id, []).get(s.result_id)).push(s));
        return rows.map(r => ({
          ...r, id: r.result_id,
          competition: { year: r.year, name: r.competition, date_start: r.date_start, date_end: r.date_end, location: r.location, scope: r.scope },
          event: { raw_name: r.event, distance: r.distance, discipline: r.discipline, gender: r.event_gender, age_category: r.age_category, team_type: r.team_type },
          athlete: { identity_key: r.identity_key, full_name: r.full_name, birth_year: r.birth_year, gender: r.gender, nationality: r.nationality, is_foreign: r.is_foreign },
          series: byRes.get(r.result_id) || [],
        }));
      },
      async meta() {
        const r = await get('ingest_runs?order=started_at.desc&limit=1').catch(() => []);
        const m = r[0] || {};
        return { generated_at: (m.started_at || '').slice(0, 10), source: m.source_url, loaded_results: m.loaded_rows, counts: {} };
      },
      async news() { return fetch(DATA_BASE + 'news.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []); },
      async eventScores({ discipline, gender } = {}) {
        const f = [`discipline=eq.${discipline}`];
        if (gender) f.push(`event_gender=eq.${gender}`);
        return get('v_event_best?' + f.join('&') + '&limit=5000');
      },
      async athleteByKey(key) {
        const r = await get(`athletes?identity_key=eq.${enc(key)}&limit=1`).catch(() => []);
        return r[0] || null;
      },
      async competitions(year, scope) {
        const f = [];
        if (year) f.push(`year=eq.${year}`);
        if (scope) f.push(`scope=eq.${scope}`);
        const qs = (f.length ? f.join('&') + '&' : '') + 'order=date_start.desc&limit=500';
        return get('competitions?' + qs).then(cs => cs.map(c => ({ ...c, n_events: null })));
      },
      async eventAvg({ year, discipline, gender, age_category } = {}) {
        const view = year ? 'v_event_avg_year' : 'v_event_avg';
        const f = [];
        if (year) f.push(`year=eq.${year}`);
        if (discipline) f.push(`discipline=eq.${discipline}`);
        if (gender) f.push(`event_gender=eq.${gender}`);
        if (age_category) f.push(`age_category=eq.${age_category}`);
        const rows = await get(view + '?' + (f.length ? f.join('&') + '&' : '') + 'limit=5000');
        // 뷰는 연령부별로 그룹돼 있어, 연령 필터가 없으면 선수별로 합쳐(전체) 준다
        const m = new Map();
        rows.forEach(r => {
          let o = m.get(r.athlete_id);
          if (!o) { o = { ...r, _sum: r.avg_qual * r.n_games, _games: r.n_games }; m.set(r.athlete_id, o); }
          else { o._sum += r.avg_qual * r.n_games; o._games += r.n_games; o.best_qual = Math.max(o.best_qual, r.best_qual); o.n_medals = (o.n_medals || 0) + (r.n_medals || 0); }
        });
        return [...m.values()].map(o => ({ ...o, unit: o.current_unit, n_games: o._games, avg_qual: Math.round(o._sum / o._games * 10) / 10 }))
          .sort((a, b) => b.avg_qual - a.avg_qual);
      },
      async eventsOf(compId) {
        return get(`events?competition_id=eq.${compId}&order=event_code.asc&limit=200`).then(es => es.map(e => ({ ...e, n: null })));
      },
      async eventRanking(eventId) {
        const rows = await get(`v_event_ranking?event_id=eq.${eventId}&order=placement.asc&limit=300`);
        return rows.map(r => ({
          ...r, id: r.result_id,
          competition: { year: r.year, name: r.competition, scope: r.scope },
          event: { raw_name: r.event, distance: r.distance, discipline: r.discipline, event_code: r.event_code, age_category: r.age_category, team_type: r.team_type },
          athlete: { full_name: r.full_name, birth_year: r.birth_year },
          series: [],
        }));
      },
      async medals({ year, discipline, scope } = {}) {
        const f = [];
        if (year) f.push(`year=eq.${year}`);
        if (discipline) f.push(`discipline=eq.${discipline}`);
        if (scope) f.push(`scope=eq.${scope}`);
        const qs = (f.length ? f.join('&') + '&' : '') + 'order=date_start.desc,placement.asc&limit=1000';
        const rows = await get('v_medals?' + qs);
        return rows.map(r => ({
          ...r, competition: { year: r.year, name: r.competition, date_start: r.date_start, scope: r.scope },
          event: { raw_name: r.event, discipline: r.discipline, gender: r.event_gender, age_category: r.age_category, team_type: r.team_type, event_code: r.discipline },
          athlete: { full_name: r.full_name, birth_year: r.birth_year, gender: r.gender, nationality: r.nationality, is_foreign: r.is_foreign },
        }));
      },
    };
  })();

  window.DB = MODE === 'local' ? Local : Supa;
  window.DB_MODE = MODE;
})();
