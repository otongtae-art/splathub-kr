/* eslint-disable */
/**
 * SplatHub Service Worker — round 52.
 *
 * 전략:
 *   - /_next/static/*       : cache-first (immutable, hash-versioned URL)
 *   - /icon.svg, /favicon.ico, /og-image.png, /apple-icon : cache-first
 *   - /manifest.webmanifest : cache-first (manifest 변경 적음)
 *   - HTML pages (/, /capture, /capture/train 등) : network-first + cache
 *   - 그 외 (/api/*, 타사 도메인) : 항상 network (캐시 안 함)
 *
 * 영향:
 *   - 반복 방문 시 static asset 즉시 로딩 (cache hit)
 *   - 네트워크 끊겨도 last-loaded HTML 표시 가능 (graceful)
 *   - VGGT API 호출은 네트워크 필수 (캐시 안 함, 의도)
 *
 * Cache 버전: 수동 갱신 — 배포 시 stale 가능. 하지만 HTML 은
 * network-first 라 새 빌드 도착하면 자동 갱신됨.
 */

const CACHE_VERSION = 'splathub-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const HTML_CACHE = `${CACHE_VERSION}-html`;

// 설치 시 미리 캐시할 critical asset (없어도 동작, 있으면 즉시 로딩)
const PRECACHE_URLS = [
  '/manifest.webmanifest',
  '/icon.svg',
  '/favicon.ico',
];

self.addEventListener('install', (event) => {
  // 설치 완료 즉시 활성화 (skipWaiting)
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch(() => {
            /* 일부 asset 없어도 SW 자체는 설치 */
          }),
        ),
      );
    }).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  // 옛 버전 캐시 삭제
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // GET 만 처리 (POST 등 mutation 캐시 X)
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 다른 origin 은 그냥 통과 (HF Space, Vercel API, etc.)
  if (url.origin !== self.location.origin) return;

  // /api/* 는 캐시 안 함 (server-rendered, dynamic)
  if (url.pathname.startsWith('/api/')) return;

  // /_next/static/* : cache-first (immutable hash URL)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // critical static assets
  if (
    /\.(svg|ico|png|jpg|jpeg|webp|woff2?|ttf)$/i.test(url.pathname) ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // HTML pages : network-first, fallback to cache
  if (
    req.headers.get('accept')?.includes('text/html') ||
    url.pathname === '/' ||
    !/\.[a-z0-9]{2,5}$/i.test(url.pathname) // path 에 확장자 없으면 HTML 가능성
  ) {
    event.respondWith(networkFirst(req, HTML_CACHE));
    return;
  }
  // 나머지: 그냥 fetch (서비스 워커 안 거치는 효과)
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) {
    // 백그라운드 갱신 (stale-while-revalidate)
    fetch(req)
      .then((res) => res.ok && cache.put(req, res.clone()))
      .catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    // 네트워크 실패 + 캐시 없음 → 그냥 fail (브라우저 기본 에러)
    return Response.error();
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    // 네트워크 실패 → 캐시 fallback
    const cached = await cache.match(req);
    if (cached) return cached;
    return Response.error();
  }
}
