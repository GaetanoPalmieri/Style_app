const CACHE='style-wishlist-v4';
const CORE=['./','./index.html','./app.css','./app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-512-maskable.png','./apple-touch-icon.png','./icon-32.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('message',e=>{
  if(e.data==='skip-waiting')self.skipWaiting();
});

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return; // lascia al browser richieste esterne (foto da web ecc.)

  if(req.mode==='navigate'){
    // network-first per l'HTML, cosi' un deploy nuovo si vede appena c'e' rete
    e.respondWith(
      fetch(req).then(res=>{
        const copy=res.clone();
        caches.open(CACHE).then(c=>c.put('./index.html',copy));
        return res;
      }).catch(()=>caches.match('./index.html'))
    );
    return;
  }

  // stale-while-revalidate per gli altri asset stessa origine
  e.respondWith(
    caches.match(req).then(cached=>{
      const network=fetch(req).then(res=>{
        if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));}
        return res;
      }).catch(()=>cached);
      return cached||network;
    })
  );
});
