// Service worker de la app de Jacinta M. Pastelería.
// Guarda la app para que abra sin internet. Su alcance es SU carpeta (se registra
// como ./sw.js), así que no toca nada fuera de ella.
// Los DATOS no pasan por aquí: viven en el teléfono (localStorage), así que una
// versión vieja guardada nunca puede mostrar plata equivocada.
// Primero va a la red (así toma las versiones nuevas solo) y si no hay señal usa
// lo guardado. Si cambias la lista ARCHIVOS, sube el número de CACHE.
const CACHE = 'jacinta-v1';
const ARCHIVOS = [
  './',
  './index.html',
  './manifest.json',
  './carta.json',
  './img/jacinta-logo.png',
  './img/jacinta-logo-192.png',
  './img/jacinta-icono-192.png',
  './img/jacinta-icono-512.png',
];
// Fuera de la propia carpeta, lo único que se guarda es la letra (Josefin Sans).
const FUENTES = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('jacinta-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;                 // nada de guardar escrituras
  const u = new URL(e.request.url);
  const propia = u.origin === self.location.origin;
  if (!propia && !FUENTES.includes(u.hostname)) return;   // lo ajeno no se toca
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r && (r.ok || r.type === 'opaque')) {
          const copia = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copia));
        }
        return r;
      })
      .catch(() => caches.match(e.request).then(r => r ||
        (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
