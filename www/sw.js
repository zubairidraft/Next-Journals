// Offline cache for the app shell (browser version only).
// Only app code is cached here — your diary data lives encrypted in IndexedDB.
const CACHE = 'nj-v1.0.2';
const ASSETS = [
  './', 'index.html', 'privacy.html', 'terms.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/ui.js', 'js/db.js', 'js/crypto.js', 'js/store.js', 'js/backup.js', 'js/drive.js',
  'js/notify.js', 'js/native.js', 'js/config.js', 'js/components.js', 'js/csp.js',
  'js/views/lock.js', 'js/views/journal.js', 'js/views/calendar.js', 'js/views/tasks.js', 'js/views/vault.js',
  'js/views/lists.js', 'js/views/browse.js', 'js/views/settings.js',
  'icons/icon-192.png', 'icons/icon-512.png',
  'fonts/literata-latin-400-normal.woff2', 'fonts/literata-latin-400-italic.woff2', 'fonts/literata-latin-600-normal.woff2', 'fonts/literata-latin-700-normal.woff2',
  'fonts/manrope-latin-400-normal.woff2', 'fonts/manrope-latin-500-normal.woff2', 'fonts/manrope-latin-600-normal.woff2', 'fonts/manrope-latin-700-normal.woff2', 'fonts/manrope-latin-800-normal.woff2'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // never touch Google API traffic
  // Network first for code (so updates arrive), cache fallback for offline
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
