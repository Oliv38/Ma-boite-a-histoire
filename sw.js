const SHELL="mbh-shell-v1", MEDIA="mbh-media-v1";
self.addEventListener("install",e=>{e.waitUntil(caches.open(SHELL).then(c=>c.addAll(["./","index.html","manifest.webmanifest","favicon.svg","apple-touch-icon.png"])).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("mbh-shell-")&&k!==SHELL).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
 const r=e.request;if(r.method!=="GET")return;
 const u=new URL(r.url);if(u.origin!==location.origin)return;
 const media=/\/(audio|illus)\//.test(u.pathname);
 if(media){
  // MP3 : le lecteur demande des plages (Range) ; on sert depuis le cache si présent, sinon réseau + mise en cache
  e.respondWith((async()=>{
   const c=await caches.open(MEDIA);
   let hit=await c.match(u.pathname.replace(/^.*\/(audio|illus)\//,"$1/")) || await c.match(u.href);
   if(!hit){
    try{const net=await fetch(u.href);if(net.ok&&net.status===200){c.put(u.href,net.clone())}hit=net;
     if(r.headers.get("range"))return net}catch(err){return Response.error()}
   }
   const range=r.headers.get("range");
   if(range&&hit.status===200){
    const buf=await hit.clone().arrayBuffer();const m=/bytes=(\d+)-(\d*)/.exec(range);
    const s=+m[1], t=m[2]?+m[2]:buf.byteLength-1;
    return new Response(buf.slice(s,t+1),{status:206,headers:{"Content-Type":hit.headers.get("Content-Type")||"audio/mpeg","Content-Range":`bytes ${s}-${t}/${buf.byteLength}`,"Content-Length":t-s+1,"Accept-Ranges":"bytes"}});
   }
   return hit;
  })());
  return;
 }
 e.respondWith(fetch(r).then(n=>{const cp=n.clone();caches.open(SHELL).then(c=>c.put(r,cp));return n}).catch(()=>caches.match(r,{ignoreSearch:true}).then(h=>h||caches.match("index.html"))));
});
