// Real-world terrain for Spindle City.
// - loadTerrain(): loads USGS 3DEP elevation (dist/assets/elevation.json), lightly smooths it,
//   and installs Geo.groundY(worldX, worldZ) (metres, bilinear) + Geo.inWaterWorld().
// - buildTerrain(): chunked, analytically-lit terrain mesh that sits under roads/buildings.
// World units are metres: world = map / 1.5.
const S = 1 / 1.5;

export async function loadTerrain(Geo, cityId) {
 let grid = null;
 try {
  const res = await fetch('assets/elevation.json', { cache: 'force-cache' });
  if (res.ok) grid = (await res.json())[cityId] || null;
 } catch {}

 // Water test in map units (coast/lake polygons) for sinking terrain below the water plane.
 const probe = document.createElement('canvas').getContext('2d');
 const inWaterMap = (mx, my) => {
  for (const w of Geo.waterAll) {
   if (mx < w.box.x || mx > w.box.r || my < w.box.y || my > w.box.b) continue;
   if (probe.isPointInPath(w.path, mx, my)) return true;
  }
  return false;
 };
 Geo.inWaterWorld = (wx, wz) => inWaterMap(wx / S, wz / S);

 if (!grid) {
  Geo.groundY = () => 0;
  Geo.hasTerrain = false;
  return false;
 }

 const { cols, rows } = grid;
 let v = Float32Array.from(grid.values);
 // Two gentle 3x3 blur passes remove DEM speckle so roads don't ripple.
 for (let pass = 0; pass < 2; pass++) {
  const o = new Float32Array(v.length);
  for (let r = 0; r < rows; r++) {
   for (let c = 0; c < cols; c++) {
    let sum = 0, wsum = 0;
    for (let dr = -1; dr <= 1; dr++) {
     for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
      const w = (dr === 0 && dc === 0) ? 4 : (dr === 0 || dc === 0) ? 2 : 1;
      sum += v[rr * cols + cc] * w; wsum += w;
     }
    }
    o[r * cols + c] = sum / wsum;
   }
  }
  v = o;
 }

 const MW = Geo.W, MH = Geo.H;
 const exaggeration = 1.0;
 Geo.groundY = (wx, wz) => {
  let fx = (wx / S) / MW * (cols - 1), fy = (wz / S) / MH * (rows - 1);
  fx = fx < 0 ? 0 : fx > cols - 1 ? cols - 1 : fx;
  fy = fy < 0 ? 0 : fy > rows - 1 ? rows - 1 : fy;
  const c0 = Math.min(cols - 2, Math.floor(fx)), r0 = Math.min(rows - 2, Math.floor(fy));
  const tx = fx - c0, ty = fy - r0;
  const a = v[r0 * cols + c0], b = v[r0 * cols + c0 + 1], c = v[(r0 + 1) * cols + c0], d = v[(r0 + 1) * cols + c0 + 1];
  return ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty) * exaggeration;
 };
 Geo.hasTerrain = true;
 Geo.terrainInfo = { min: grid.min, max: grid.max, source: grid.source, cols, rows };
 return true;
}

// Chunked terrain mesh: 16 m grid, analytic normals (no seams), frustum-cullable chunks.
export function buildTerrain(T, Geo, material, parent) {
 const MARGIN = 320, CELL = 16, CHUNK = 20; // CHUNK cells per side
 const x0 = -MARGIN, z0 = -MARGIN;
 const spanX = Geo.W * S + MARGIN * 2, spanZ = Geo.H * S + MARGIN * 2;
 const nx = Math.ceil(spanX / CELL), nz = Math.ceil(spanZ / CELL);
 const baseY = -0.26;
 const outsideFade = (x, z) => {
  const dx = Math.max(0, -x, x - Geo.W * S), dz = Math.max(0, -z, z - Geo.H * S);
  const d = Math.hypot(dx, dz);
  const t = Math.min(1, d / MARGIN);
  return 1 - t * t * (3 - 2 * t);
 };
 const heightAt = (x, z) => {
  const fade = outsideFade(x, z);
  if (fade <= 0) return baseY;
  let h = Geo.groundY(x, z);
  // Sink terrain beneath open water so the flat water plane reads as a real shoreline.
  if (x >= 0 && z >= 0 && x <= Geo.W * S && z <= Geo.H * S && Geo.inWaterWorld(x, z)) h = -1.4;
  return baseY + h * fade;
 };
 // Cache vertex heights once (shared by neighbouring chunks).
 const stride = nx + 1;
 const H = new Float32Array((nx + 1) * (nz + 1));
 for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) H[j * stride + i] = heightAt(x0 + i * CELL, z0 + j * CELL);
 const hv = (i, j) => H[Math.max(0, Math.min(nz, j)) * stride + Math.max(0, Math.min(nx, i))];

 const meshes = [];
 const tile = 18.5;
 for (let cj = 0; cj < nz; cj += CHUNK) {
  for (let ci = 0; ci < nx; ci += CHUNK) {
   const w = Math.min(CHUNK, nx - ci), d = Math.min(CHUNK, nz - cj);
   const pos = new Float32Array((w + 1) * (d + 1) * 3), nor = new Float32Array((w + 1) * (d + 1) * 3), uv = new Float32Array((w + 1) * (d + 1) * 2);
   let p = 0, u = 0;
   for (let j = 0; j <= d; j++) {
    for (let i = 0; i <= w; i++) {
     const gi = ci + i, gj = cj + j, x = x0 + gi * CELL, z = z0 + gj * CELL;
     pos[p] = x; pos[p + 1] = hv(gi, gj); pos[p + 2] = z;
     const dhx = (hv(gi + 1, gj) - hv(gi - 1, gj)) / (2 * CELL), dhz = (hv(gi, gj + 1) - hv(gi, gj - 1)) / (2 * CELL);
     const l = Math.hypot(dhx, 1, dhz);
     nor[p] = -dhx / l; nor[p + 1] = 1 / l; nor[p + 2] = -dhz / l;
     uv[u] = x / tile; uv[u + 1] = z / tile;
     p += 3; u += 2;
    }
   }
   const idx = new Uint32Array(w * d * 6);
   let k = 0;
   for (let j = 0; j < d; j++) {
    for (let i = 0; i < w; i++) {
     const a = j * (w + 1) + i, b = a + 1, c = a + (w + 1), e = c + 1;
     idx[k++] = a; idx[k++] = c; idx[k++] = b;
     idx[k++] = b; idx[k++] = c; idx[k++] = e;
    }
   }
   const g = new T.BufferGeometry();
   g.setAttribute('position', new T.BufferAttribute(pos, 3));
   g.setAttribute('normal', new T.BufferAttribute(nor, 3));
   g.setAttribute('uv', new T.BufferAttribute(uv, 2));
   g.setIndex(new T.BufferAttribute(idx, 1));
   g.computeBoundingSphere();
   const m = new T.Mesh(g, material);
   m.receiveShadow = true;
   parent.add(m);
   meshes.push(m);
  }
 }
 return meshes;
}
