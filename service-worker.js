// SPEEDIX League — Service Worker
// Stratégie : network-first pour index.html (pour ne pas servir une version figée),
// cache-first pour les assets statiques (icônes, logos, CDN).
// ▸ Bump CACHE_VERSION à chaque release significative pour invalider l'ancien cache.
// ▸ 2026-08-08 : format renommé speedix-vNNN -> speedix-V2-N (demande explicite
//   user), N repart à 1 depuis le 1er push de cette session post-bascule Tour V2
//   (v974 = V2-1, v975 = V2-2, v976 = V2-3, v977 = V2-4, celle-ci = V2-5).
// ▸ Le client (index.html) détecte l'installation d'un nouveau SW, lui envoie
//   SKIP_WAITING, et recharge automatiquement dès que le nouveau prend le
//   contrôle — les utilisateurs ont ainsi la nouvelle version sans refresh manuel.

const CACHE_VERSION = 'speedix-V2-373';
// Cache d'ASSETS (images, icônes, polices, scripts CDN) SÉPARÉ et NON versionné (2026-10-07, audit
// vitesse) : avant, tout vivait dans le cache versionné et chaque release (bump de CACHE_VERSION)
// le supprimait → tous les téléphones retéléchargeaient toutes les images (jusqu'à 14 Mo en 1re
// vue, ~65 Mo de PNG au total). Désormais seul le cache HTML ci-dessus est vidé à chaque release ;
// les assets sont servis depuis ASSET_CACHE et revalidés en arrière-plan au plus 1x/24 h.
// Si un fichier est remplacé EN PLACE (même nom) il se met à jour sous 24 h ; pour forcer, changer
// son nom (convention du projet : suffixe -vN) ou incrémenter ASSET_CACHE.
const ASSET_CACHE = 'speedix-assets-v1';
const ASSET_MAX_AGE_MS = 24 * 3600 * 1000;
const HTML_ASSETS = ['/', '/index.html', '/manifest.json'];
const STATIC_ASSETS = [
  '/icon-192.png',
  '/icon-512.png',
  '/icon-180.png',
  '/logo-speedix.png',
  '/logo-speedix-hd.png',
  '/logo-speedix-sm.png',
  '/hero-cover-new.webp'
];

// ── Install : pré-cache les assets essentiels ────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_VERSION).then(cache => cache.addAll(HTML_ASSETS).catch(err => {
        console.warn('[SW] pre-cache HTML partial fail', err);
      })),
      caches.open(ASSET_CACHE).then(cache => cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] pre-cache assets partial fail', err);
      }))
    ])
  );
  // On ne skipWaiting QUE sur demande du client (message SKIP_WAITING), pour
  // éviter d'interrompre l'utilisateur au milieu d'une action. Le client envoie
  // ce message uniquement quand il a détecté qu'il y a bien un nouveau SW prêt.
});

// ── Message : SKIP_WAITING demandé par le client → on prend la main ──────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  // Le panel admin demande la version réellement active → on répond sur le port fourni
  if (event.data && event.data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage(CACHE_VERSION);
  }
});

// ── Activate : nettoie les vieux caches d'une version précédente ─────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => {
      return Promise.all(
        names.filter(n => n !== CACHE_VERSION && n !== ASSET_CACHE).map(n => caches.delete(n))
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch : stratégie hybride ────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ne rien faire sur les requêtes non-GET (POST Supabase, PATCH, etc.)
  if (request.method !== 'GET') return;

  // Ne jamais intercepter les appels Supabase / Strava / autres API :
  // ces réponses sont dynamiques et doivent toujours aller au réseau.
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('strava.com') ||
    url.hostname.includes('dicebear.com')
  ) {
    return; // laisse passer au réseau sans toucher
  }

  // Network-first pour le HTML (pour voir les mises à jour immédiatement)
  if (request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then(c => c.put(request, copy));
          return resp;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // Requêtes partielles (vidéo/audio) : jamais interceptées (le cache ne gère pas les Range).
  if (request.headers.has('range')) return;

  // Assets statiques (images, icônes, logos, CDN) : cache-first dans ASSET_CACHE (non versionné),
  // revalidé en arrière-plan seulement si l'entrée a plus de 24 h.
  event.respondWith(
    caches.open(ASSET_CACHE).then(cache => cache.match(request).then(cached => {
      const refresh = () => fetch(request).then(resp => {
        if (resp && resp.ok) cache.put(request, resp.clone());
        return resp;
      });
      if (cached) {
        const d = Date.parse(cached.headers.get('date') || '') || 0;
        if (!d || (Date.now() - d) > ASSET_MAX_AGE_MS) event.waitUntil(refresh().catch(() => {}));
        return cached;
      }
      return refresh().catch(() => cached);
    }))
  );
});

// ── Push : réception d'une notif envoyée par l'Edge Function SPEEDIX ──────
// Le payload attendu (JSON) : { title, body, url?, tag?, icon? }
self.addEventListener('push', event => {
  let payload = { title: 'SPEEDIX', body: 'Tu as une notification' };
  try {
    if (event.data) payload = event.data.json();
  } catch (e) {
    try { payload.body = event.data.text(); } catch (_) {}
  }
  const opts = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: '/icon-180.png',
    tag: payload.tag || 'speedix-default',
    data: { url: payload.url || '/' },
    vibrate: [120, 60, 120]
  };
  event.waitUntil(
    self.registration.showNotification(payload.title || 'SPEEDIX', opts)
  );
});

// ── Click sur notif : ouvre/focus l'app sur l'URL fournie ────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) {
          c.focus();
          if ('navigate' in c) c.navigate(target).catch(() => {});
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
