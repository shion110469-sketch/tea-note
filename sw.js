// オフラインでも開けるように、アプリ本体をキャッシュする
// ファイルを更新したら VERSION を上げると、利用者の端末に新しい版が届く
const VERSION = 'v1';
const CACHE = `tea-note-${VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './js/icons.js',
  './js/data.js',
  './js/store.js',
  './js/recommend.js',
  './js/timer.js',
  './js/scanner.js',
  './js/app.js',
];
// 外部から読み込むバーコード読み取りライブラリも、一度使えばオフラインで使えるようにする
const CDN_CACHEABLE = ['https://unpkg.com/html5-qrcode@'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('tea-note-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CDN_CACHEABLE.some(p => req.url.startsWith(p))) return; // 商品検索などはそのまま通信

  // 自サイトは「通信優先・失敗したらキャッシュ」で常に最新を使う。CDN はバージョン固定なのでキャッシュ優先
  if (sameOrigin) {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html')))
    );
  } else {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }))
    );
  }
});
