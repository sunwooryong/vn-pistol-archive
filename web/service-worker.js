'use strict';
// PWA 서비스워커 — 네트워크 우선 + 오프라인 캐시 폴백
//  온라인: 항상 최신(시트 갱신분 반영). 오프라인/약신호: 마지막으로 받은 데이터로 열람.
const CACHE = 'vpa-cache-v2';   // 버전 올림 → 옛 캐시 강제 폐기

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // 외부(구글시트 등)는 그대로 통과
  // training-check(TV 대시보드)와 HTML 문서는 항상 네트워크 최신(캐시 서빙 안 함) → 옛 화면 고착 방지
  const isDoc = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  const isTV = url.pathname.indexOf('/training-check/') >= 0;
  if (isTV) { return; }   // TV 대시보드는 SW가 전혀 개입하지 않음(항상 직접 네트워크)
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req, isDoc ? { cache: 'reload' } : undefined);   // 문서는 HTTP 캐시도 무시하고 새로
      if (res && res.status === 200 && !isDoc) cache.put(req, res.clone());    // 문서는 캐시에 저장 안 함
      return res;
    } catch (err) {
      const cached = await cache.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') { const idx = await cache.match('./index.html') || await cache.match('./'); if (idx) return idx; }
      throw err;
    }
  })());
});
