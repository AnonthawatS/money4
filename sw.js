// Service worker: เปิดแอปได้แม้ไม่มีเน็ต (ข้อมูลจริงยังดึงจาก Google Sheet)
const CACHE = 'money-life-v5-1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// ไฟล์ของแอป: ใช้จากแคชก่อน แล้วอัปเดตเบื้องหลัง / คำขอไป Google ไม่แตะ
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request);
      const fresh = fetch(e.request).then(res => { if (res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => cached);
      return cached || fresh;
    })
  );
});
