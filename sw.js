// 繧ｪ繝輔Λ繧､繝ｳ縺ｧ繧る幕縺代ｋ繧医≧縺ｫ縲√い繝励Μ譛ｬ菴薙ｒ繧ｭ繝｣繝・す繝･縺吶ｋ
// 繝輔ぃ繧､繝ｫ繧呈峩譁ｰ縺励◆繧・VERSION 繧剃ｸ翫￡繧九→縲∝茜逕ｨ閠・・遶ｯ譛ｫ縺ｫ譁ｰ縺励＞迚医′螻翫￥
const VERSION = 'v26';
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
  './js/platform.js',
  './js/pro.js',
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
  if (new URL(req.url).origin !== self.location.origin) return; // 螟夜Κ縺ｸ縺ｮ騾壻ｿ｡縺ｯ縺昴・縺ｾ縺ｾ

  // 縲碁壻ｿ｡蜆ｪ蜈医・螟ｱ謨励＠縺溘ｉ繧ｭ繝｣繝・す繝･縲阪〒縲√が繝ｳ繝ｩ繧､繝ｳ譎ゅ・蟶ｸ縺ｫ譛譁ｰ繧剃ｽｿ縺・
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html')))
  );
});
