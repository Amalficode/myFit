const CACHE='myfit-v20';
const ASSETS=["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png","./lat-pulldown.jpg","./myfit-upgrade.js","./myfit-nutrition.js","./myfit-focus.js","./myfit-images.js","./myfit-report.js","./images/lat-pulldown.svg","./images/seated-row.svg","./images/glute-bridge.svg","./images/leg-press.svg","./images/biceps-curl.svg","./images/bird-dog.svg","./images/goblet-squat.svg","./images/romanian-deadlift.svg","./images/chest-press.svg","./images/shoulder-press.svg","./images/triceps-pushdown.svg","./images/dead-bug.svg","./images/step-up.svg","./images/leg-curl.svg","./images/lateral-raise.svg","./images/reverse-fly.svg","./images/side-plank.svg","./images/hip-abduction.svg","./images/plank.svg"];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('myfit-') && key !== CACHE)
      .map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request=event.request;
  if(request.method!=='GET' || new URL(request.url).origin!==location.origin) return;
  event.respondWith((async () => {
    try {
      const response=await fetch(request);
      if(response.ok && request.destination!=='video'){
        const cache=await caches.open(CACHE);
        await cache.put(request,response.clone());
      }
      return response;
    } catch(error) {
      return (await caches.match(request)) || Response.error();
    }
  })());
});
