// Tesla City Drive service worker. Bump VERSION on every release so clients see an update.
// Only Cache Storage entries with this app's prefix are touched; localStorage saves are never affected.
const PREFIX='tesla-city-drive-',VERSION='20261111-3';
const SHELL_CACHE=PREFIX+'shell-'+VERSION,ASSET_CACHE=PREFIX+'assets-'+VERSION;
const SCOPE=self.registration.scope,INDEX=new URL('./index.html',SCOPE).href;
// Small core shell only. Models, maps and audio are fetched lazily, so the game is not fully offline.
const SHELL=['./index.html','./style.css','./app.js','./manifest.webmanifest','./assets/icons/apple-touch-icon.png','./assets/icons/icon-192.png','./assets/icons/icon-512.png'];
const CODE=/\.(?:m?js|css|html|webmanifest)$/i,ASSET=/\.(?:png|jpe?g|webp|gif|svg|ico|glb|gltf|bin|ktx2|json|m4a|mp3|ogg|wav|woff2?)$/i;
const MAX_ASSETS=48,MAX_BYTES=4*1024*1024;
// Never store errors, partial (206), opaque or redirected responses (e.g. a hosting sign-in redirect).
const storable=response=>response&&response.status===200&&response.type==='basic'&&!response.redirected;

self.addEventListener('install',event=>event.waitUntil(caches.open(SHELL_CACHE).then(cache=>Promise.all(SHELL.map(async url=>{const response=await fetch(new Request(url,{cache:'reload'}));if(!storable(response))throw new Error('shell '+url);await cache.put(new URL(url,SCOPE).href,response)})))));
// No skipWaiting on install: a new version waits until the page asks, so a running game is never swapped mid-session.
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==SHELL_CACHE&&key!==ASSET_CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')event.waitUntil(self.skipWaiting())});

async function putShell(key,response){try{const cache=await caches.open(SHELL_CACHE);await cache.put(key,response)}catch{}}
async function putAsset(request,response){try{
 const declared=Number(response.headers.get('content-length'));if(declared>MAX_BYTES)return;
 if(!declared){const blob=await response.clone().blob();if(blob.size>MAX_BYTES)return}
 const cache=await caches.open(ASSET_CACHE);await cache.put(request,response);
 const keys=await cache.keys();for(let i=0;i<keys.length-MAX_ASSETS;i++)await cache.delete(keys[i]);
}catch{}}
// Page and code: network first so releases show up immediately; cache is only the offline fallback.
async function networkFirst(event,request,key){try{const response=await fetch(request);if(storable(response))event.waitUntil(putShell(key,response.clone()));return response}catch(error){const cached=await caches.match(key,{ignoreSearch:true});if(cached)return cached;throw error}}
// Static assets: answer from cache when present and refresh in the background.
async function staleWhileRevalidate(event,request){const cache=await caches.open(ASSET_CACHE),cached=await cache.match(request);
 const fresh=fetch(request).then(response=>{if(storable(response))event.waitUntil(putAsset(request,response.clone()));return response});
 if(cached){event.waitUntil(fresh.catch(()=>{}));return cached}return fresh}

self.addEventListener('fetch',event=>{const request=event.request;
 // Leave alone: non-GET, media range requests (Safari needs real 206s), other origins, anything outside this app's scope.
 if(request.method!=='GET'||request.headers.has('range'))return;
 const url=new URL(request.url);if(url.origin!==location.origin||!url.href.startsWith(SCOPE))return;
 if(request.mode==='navigate'){const page=url.origin+url.pathname;if(page===SCOPE||page===INDEX)event.respondWith(networkFirst(event,request,INDEX));return}
 if(CODE.test(url.pathname))event.respondWith(networkFirst(event,request,request.url));
 else if(ASSET.test(url.pathname))event.respondWith(staleWhileRevalidate(event,request));
});
