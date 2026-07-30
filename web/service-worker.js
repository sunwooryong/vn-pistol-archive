'use strict';
// PWA 서비스워커 — 네트워크 우선 + 오프라인 캐시 폴백
//  온라인: 항상 최신(시트 갱신분 반영). 오프라인/약신호: 마지막으로 받은 데이터로 열람.
const CACHE = 'vpa-cache-v1';

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
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res && res.status === 200) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const cached = await cache.match(req);
      if (cached) return cached;
      // 셸 폴백
      if (req.mode === 'navigate') { const idx = await cache.match('./index.html') || await cache.match('./'); if (idx) return idx; }
      throw err;
    }
  })());
});
