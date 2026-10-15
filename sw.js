// オフラインでも開けるように、アプリ本体をキャッシュする
// ファイルを更新したら VERSION を上げると、利用者の端末に新しい版が届く
const VERSION = 'v19';
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
  './js/photos.js',
  './js/recommend.js',
  './js/timer.js',
  './js/app.js',
  './js/intro.js',
  './js/update.js',
];

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
  if (new URL(req.url).origin !== self.location.origin) return; // 外部への通信はそのまま

  // 「通信優先・失敗したらキャッシュ」で、オンライン時は常に最新を使う
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html')))
  );
});
