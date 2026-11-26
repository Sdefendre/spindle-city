// Optional Google Photorealistic 3D Tiles (OGC 3D Tiles 1.1) runtime streamer.
// Uses a user-provided Google Maps API key (stored locally in localStorage, never bundled).
// Streams real photogrammetric Fall River / New Bedford glTF tiles aligned to the local
// Spindle City coordinate frame while keeping OSM driving physics, Model Y, traffic,
// and Tesla Reality View overlays active.
import * as T from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

const S = 1 / 1.5;
const STORAGE_KEY = 'spindle-gmaps-3dtiles-key';
const WGS84_A = 6378137.0;
const WGS84_E2 = 0.00669437999014;

const CITY_BOUNDS = {
 'fall-river': { west: -71.172, south: 41.685, east: -71.135, north: 41.725 },
 'new-bedford': { west: -70.943, south: 41.616, east: -70.912, north: 41.647 },
};

function llaToEcef(latDeg, lonDeg, h = 0) {
 const lat = latDeg * Math.PI / 180;
 const lon = lonDeg * Math.PI / 180;
 const sinLat = Math.sin(lat), cosLat = Math.cos(lat);
 const sinLon = Math.sin(lon), cosLon = Math.cos(lon);
 const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
 return new T.Vector3(
  (N + h) * cosLat * cosLon,
  (N + h) * cosLat * sinLon,
  (N * (1 - WGS84_E2) + h) * sinLat,
 );
}

// Compute the rigid transform from WGS84 ECEF into Spindle City local world metres
// (+X east, +Y up, +Z south, centred on the city extract).
function buildEcefToLocalMatrix(cityId, Geo) {
 const b = CITY_BOUNDS[cityId] || CITY_BOUNDS['fall-river'];
 const lat0 = (b.south + b.north) * 0.5;
 const lon0 = (b.west + b.east) * 0.5;
 const cx = Geo.W * S * 0.5;
 const cz = Geo.H * S * 0.5;
 const originEcef = llaToEcef(lat0, lon0, 0);

 const lat = lat0 * Math.PI / 180;
 const lon = lon0 * Math.PI / 180;
 const east = new T.Vector3(-Math.sin(lon), Math.cos(lon), 0).normalize();
 const north = new T.Vector3(
  -Math.sin(lat) * Math.cos(lon),
  -Math.sin(lat) * Math.sin(lon),
  Math.cos(lat),
 ).normalize();
 const up = new T.Vector3(
  Math.cos(lat) * Math.cos(lon),
  Math.cos(lat) * Math.sin(lon),
  Math.sin(lat),
 ).normalize();
 const south = north.clone().negate();

 // Rotation R maps ECEF delta -> local (east, up, south)
 const rot = new T.Matrix4().set(
  east.x, east.y, east.z, 0,
  up.x, up.y, up.z, 0,
  south.x, south.y, south.z, 0,
  0, 0, 0, 1,
 );
 const toOrigin = new T.Matrix4().makeTranslation(-originEcef.x, -originEcef.y, -originEcef.z);
 const toCenter = new T.Matrix4().makeTranslation(cx, 0, cz);
 return new T.Matrix4().multiplyMatrices(toCenter, rot).multiply(toOrigin);
}

function boundingVolumeCenterRadius(bv) {
 if (!bv) return null;
 if (bv.sphere) {
  const [x, y, z, r] = bv.sphere;
  return { center: new T.Vector3(x, y, z), radius: r };
 }
 if (bv.box) {
  const a = bv.box;
  const center = new T.Vector3(a[0], a[1], a[2]);
  const r = Math.hypot(a[3], a[4], a[5]) + Math.hypot(a[6], a[7], a[8]) + Math.hypot(a[9], a[10], a[11]);
  return { center, radius: r };
 }
 return null;
}

export function createPhotorealTiles(scene, Geo, cityId) {
 const root = new T.Group();
 root.name = 'google-photorealistic-3d-tiles';
 root.visible = false;
 const ecefToLocal = buildEcefToLocalMatrix(cityId, Geo);
 const localToEcef = ecefToLocal.clone().invert();
 root.matrixAutoUpdate = false;
 root.matrix.copy(ecefToLocal);
 root.matrixWorldNeedsUpdate = true;
 scene.add(root);

 const loader = new GLTFLoader();
 const yUpToZUp = new T.Matrix4().makeRotationX(Math.PI / 2);

 let apiKey = '';
 try { apiKey = localStorage.getItem(STORAGE_KEY) || ''; } catch {}

 let enabled = false;
 let sessionParam = '';
 let rootTileset = null;
 let statusText = apiKey ? 'Ready · toggle to stream Google 3D Tiles' : 'Paste a Google Maps Map Tiles API key';
 let statusCb = null;
 let cityGroupRef = null;
 let lastEval = 0;
 let loadedCount = 0;
 let inflight = 0;
 const MAX_INFLIGHT = 6;
 const MAX_CACHED_TILES = 96;

 const tileObjects = new Map(); // uri -> { group, lastUsed }
 const jsonCache = new Map();   // uri -> tileset json or 'loading' | 'error'
 const glbLoading = new Set();

 function setStatus(text) {
  statusText = text;
  statusCb?.(text);
 }

 function resolveUrl(baseUrl, uri) {
  const u = new URL(uri, baseUrl);
  if (!u.searchParams.has('key') && apiKey) u.searchParams.set('key', apiKey);
  if (sessionParam && !u.searchParams.has('session')) u.searchParams.set('session', sessionParam);
  return u.toString();
 }

 function captureSession(urlStr) {
  try {
   const s = new URL(urlStr).searchParams.get('session');
   if (s) sessionParam = s;
  } catch {}
 }

 async function fetchTileset(url) {
  if (jsonCache.has(url)) return jsonCache.get(url);
  jsonCache.set(url, 'loading');
  try {
   const res = await fetch(url);
   if (!res.ok) throw new Error(`HTTP ${res.status}`);
   const json = await res.json();
   jsonCache.set(url, json);
   return json;
  } catch (err) {
   jsonCache.set(url, 'error');
   throw err;
  }
 }

 function loadGlbTile(url, parentTransform) {
  if (tileObjects.has(url) || glbLoading.has(url) || inflight >= MAX_INFLIGHT) return;
  glbLoading.add(url);
  inflight++;
  loader.load(
   url,
   (gltf) => {
    inflight--;
    glbLoading.delete(url);
    if (!enabled) return;
    const holder = new T.Group();
    const m = new T.Matrix4().copy(parentTransform).multiply(yUpToZUp);
    holder.matrixAutoUpdate = false;
    holder.matrix.copy(m);
    holder.matrixWorldNeedsUpdate = true;
    gltf.scene.traverse((obj) => {
     if (obj.isMesh) {
      obj.receiveShadow = true;
      obj.castShadow = false;
     }
    });
    holder.add(gltf.scene);
    root.add(holder);
    tileObjects.set(url, { group: holder, lastUsed: performance.now() });
    loadedCount = tileObjects.size;
    if (cityGroupRef && loadedCount >= 1) cityGroupRef.visible = false;
    setStatus(`Streaming ${loadedCount} photorealistic 3D tiles`);
    pruneCache();
   },
   undefined,
   () => {
    inflight--;
    glbLoading.delete(url);
   },
  );
 }

 function pruneCache() {
  if (tileObjects.size <= MAX_CACHED_TILES) return;
  const entries = [...tileObjects.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  while (entries.length > MAX_CACHED_TILES) {
   const [uri, entry] = entries.shift();
   root.remove(entry.group);
   entry.group.traverse((o) => {
    if (o.isMesh) {
     o.geometry?.dispose?.();
     if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
     else o.material?.dispose?.();
    }
   });
   tileObjects.delete(uri);
  }
  loadedCount = tileObjects.size;
 }

 const tmpVec = new T.Vector3();
 const tmpMat = new T.Matrix4();

 function traverseNode(node, baseUrl, parentTransform, focusEcef, now) {
  if (!node) return;
  const worldMat = node.transform
   ? tmpMat.clone().copy(parentTransform).multiply(new T.Matrix4().fromArray(node.transform))
   : parentTransform;

  const bv = boundingVolumeCenterRadius(node.boundingVolume);
  let dist = 0;
  if (bv) {
   tmpVec.copy(bv.center).applyMatrix4(worldMat);
   dist = Math.max(0, tmpVec.distanceTo(focusEcef) - bv.radius);
   if (dist > 780) return; // outside streaming radius
  }

  const err = node.geometricError ?? 0;
  const desiredErr = Math.max(1.8, dist * 0.045);
  const contentUri = node.content?.uri || node.content?.url;

  if (contentUri) {
   const fullUrl = resolveUrl(baseUrl, contentUri);
   captureSession(fullUrl);
   if (/\.json(\?|$)/i.test(contentUri)) {
    const cached = jsonCache.get(fullUrl);
    if (!cached) {
     fetchTileset(fullUrl).catch(() => {});
    } else if (cached !== 'loading' && cached !== 'error' && cached.root) {
     traverseNode(cached.root, fullUrl, worldMat, focusEcef, now);
    }
    return;
   }
   const existing = tileObjects.get(fullUrl);
   if (existing) existing.lastUsed = now;
   const shouldRefine = Array.isArray(node.children) && node.children.length > 0 && err > desiredErr;
   if (!shouldRefine) {
    loadGlbTile(fullUrl, worldMat);
    if (existing) existing.group.visible = true;
    return;
   }
   // While children load, keep parent visible if already loaded.
   if (existing) existing.group.visible = true;
  }

  if (Array.isArray(node.children)) {
   for (const child of node.children) {
    traverseNode(child, baseUrl, worldMat, focusEcef, now);
   }
  }
 }

 async function enable(key, cityGroup) {
  const cleanKey = (key || '').trim();
  if (!cleanKey) {
   setStatus('Enter a Google Maps API key first');
   return false;
  }
  apiKey = cleanKey;
  try { localStorage.setItem(STORAGE_KEY, apiKey); } catch {}
  cityGroupRef = cityGroup;
  enabled = true;
  root.visible = true;
  setStatus('Connecting to Google Photorealistic 3D Tiles…');
  const rootUrl = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(apiKey)}`;
  try {
   jsonCache.clear();
   rootTileset = await fetchTileset(rootUrl);
   if (!rootTileset?.root) throw new Error('Invalid tileset root');
   setStatus('Connected · streaming photogrammetric tiles…');
   lastEval = 0;
   return true;
  } catch (err) {
   enabled = false;
   root.visible = false;
   if (cityGroupRef) cityGroupRef.visible = true;
   setStatus(`Could not load 3D Tiles (${err.message}). Verify Map Tiles API & billing.`);
   return false;
  }
 }

 function disable(cityGroup) {
  enabled = false;
  root.visible = false;
  if (cityGroup || cityGroupRef) (cityGroup || cityGroupRef).visible = true;
  setStatus(apiKey ? 'Off · local OSM + elevation meshes active' : 'Paste a Google Maps Map Tiles API key');
 }

 const focusEcef = new T.Vector3();
 const identity = new T.Matrix4();

 function update(wx, wy, wz) {
  if (!enabled || !rootTileset?.root) return;
  const now = performance.now();
  if (now - lastEval < 350) return;
  lastEval = now;
  focusEcef.set(wx, wy, wz).applyMatrix4(localToEcef);
  const rootUrl = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(apiKey)}`;
  traverseNode(rootTileset.root, rootUrl, identity, focusEcef, now);
 }

 return {
  root,
  get enabled() { return enabled; },
  get apiKey() { return apiKey; },
  get status() { return statusText; },
  onStatus(fn) { statusCb = fn; fn?.(statusText); },
  enable,
  disable,
  update,
 };
}
