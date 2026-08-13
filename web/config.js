// 검색 UI 설정
window.APP_CONFIG = {
  supabaseUrl: 'https://qkrzrdwcchszkqrywnil.supabase.co',
  // publishable(anon) 키 — 읽기 전용. RLS public_read 정책으로 SELECT 만 가능.
  supabaseKey: 'sb_publishable_axYZFE3cRu6k12ntG8TItA_X7Nc5VTv',

  // 데이터 소스: 'auto' | 'local' | 'supabase'
  //   auto  → localhost 는 로컬 JSON(build/), 그 외(배포)는 Supabase
  //   local → 항상 build/*.json (DB 적재 전 미리보기용)
  //   supabase → 항상 Supabase REST
  mode: 'auto',

  // 원본 페이지 — 베트남 사격연맹 공개 기록 웹페이지(대회 목록)
  sourceUrl: 'https://mellifluous-raindrop-50eec8.netlify.app/cac-giai-dau/all-competition',
};
