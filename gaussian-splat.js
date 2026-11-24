// Real-time 3D Gaussian Splatting (3DGS) City Renderer + Binary .splat Loader
// - High-density anisotropic 3D Gaussian ellipsoids stretched along architectural edges,
//   brick courses, road lanes, and volumetric tree canopies (true 3DGS feathered falloff)
// - Supports drag-and-drop loading of any real antimatter15 `.splat` capture (Luma / Polycam / Nerfstudio)
import * as T from './vendor/three.module.js';

const S = 1 / 1.5;

export function createGaussianSplatCity(scene, Geo, focusMapPos = null) {
 const root = new T.Group();
 root.name = 'gaussian-splat-city';
 root.visible = false;
 scene.add(root);

 const uniforms = {
  uTime: { value: 0 },
  uNight: { value: 0 },
  uOpacity: { value: 1.0 },
  uSplatScale: { value: 1.0 },
  uFogColor: { value: new T.Color('#b6bec1') },
  uFogNear: { value: 130 },
  uFogFar: { value: 680 },
 };

 // Feathered anisotropic 3DGS shader:
 // Pure Gaussian density exp(-3.6 * r^2) with soft alpha blending (no harsh oval cutout rims!)
 const splatMat = new T.ShaderMaterial({
  uniforms,
  transparent: true,
  depthWrite: false,
  depthTest: true,
  side: T.DoubleSide,
  vertexShader: `
   attribute vec3 aCenter;
   attribute vec3 aAxisU;
   attribute vec3 aAxisV;
   attribute vec4 aColor;    // rgb = color, a >= 1.5 means night-lit window glow
   varying vec2 vQuad;
   varying vec3 vColor;
   varying float vAlpha;
   varying float vWindow;
   varying float vDepth;
   varying float vSeed;
   uniform float uTime;
   uniform float uSplatScale;

   void main() {
    vQuad = position.xy * 2.0; // -1..1
    vColor = aColor.rgb;
    vWindow = step(1.5, aColor.a);
    vAlpha = vWindow > 0.5 ? fract(aColor.a) : aColor.a;
    vSeed = fract(sin(dot(aCenter.xz + aCenter.y, vec2(12.9898, 78.233))) * 43758.5453);

    float isBillboard = step(aAxisV.y, -0.5);
    vec4 mvPos;
    if (isBillboard > 0.5) {
     vec4 mvCenter = modelViewMatrix * vec4(aCenter, 1.0);
     float sway = 1.0 + 0.05 * sin(uTime * 1.6 + vSeed * 6.2831);
     mvPos = mvCenter;
     mvPos.xy += position.xy * aAxisU.xy * 2.0 * uSplatScale * sway;
    } else {
     vec3 worldPos = aCenter + (aAxisU * position.x + aAxisV * position.y) * 2.0 * uSplatScale;
     mvPos = modelViewMatrix * vec4(worldPos, 1.0);
    }
    vDepth = -mvPos.z;
    gl_Position = projectionMatrix * mvPos;
   }
  `,
  fragmentShader: `
   varying vec2 vQuad;
   varying vec3 vColor;
   varying float vAlpha;
   varying float vWindow;
   varying float vDepth;
   varying float vSeed;
   uniform float uNight;
   uniform float uOpacity;
   uniform vec3 uFogColor;
   uniform float uFogNear;
   uniform float uFogFar;

   void main() {
    float r2 = dot(vQuad, vQuad);
    if (r2 > 1.0) discard;
    // Silky true Gaussian kernel (feathers cleanly to 0 at edges — zero hard disc rings!)
    float g = exp(-3.8 * r2);
    if (g < 0.025) discard;

    vec3 col = vColor;
    col *= mix(1.0, 0.28, uNight);

    // Warm golden & crisp cyan-white night window bokeh splats (HDR > 1.0 for real bloom)
    if (vWindow > 0.5 && uNight > 0.04) {
     vec3 warm = mix(vec3(1.55, 0.96, 0.45), vec3(0.75, 1.25, 1.65), step(0.76, vAlpha));
     col = mix(col, warm, uNight * 0.96);
    }

    float fogT = smoothstep(uFogNear, uFogFar, vDepth);
    col = mix(col, uFogColor, fogT);

    float alpha = clamp(g * (vWindow > 0.5 ? 0.92 : vAlpha) * uOpacity, 0.0, 0.94);
    gl_FragColor = vec4(col, alpha);
   }
  `,
 });

 let seed = 42071;
 const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
 };

 const centers = [];
 const axesU = [];
 const axesV = [];
 const colors = [];

 const pushOriented = (cx, cy, cz, ux, uy, uz, vx, vy, vz, r, g, b, a = 0.72) => {
  centers.push(cx, cy, cz);
  axesU.push(ux, uy, uz);
  axesV.push(vx, vy, vz);
  colors.push(r, g, b, a);
 };

 const pushGround = (cx, cy, cz, rx, rz, angle, r, g, b, a = 0.68) => {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  pushOriented(cx, cy, cz, ca * rx, 0, sa * rx, -sa * rz, 0, ca * rz, r, g, b, a);
 };

 const pushBillboard = (cx, cy, cz, rx, ry, r, g, b, a = 0.72) => {
  pushOriented(cx, cy, cz, rx, ry, 0, 0, -1, 0, r, g, b, a);
 };

 const fx = (focusMapPos?.x ?? Geo.W * 0.5) * S;
 const fz = (focusMapPos?.y ?? Geo.H * 0.5) * S;
 const tmpCol = new T.Color();

 // 1. Elongated anisotropic road-lane & sidewalk Gaussian wisps (sleek 3DGS streaks along the road!)
 for (let ri = 0; ri < Geo.roads.length; ri++) {
  const r = Geo.roads[ri];
  if (!r.drive) continue;
  const rcx = ((r.box.x + r.box.r) * 0.5) * S;
  const rcz = ((r.box.y + r.box.b) * 0.5) * S;
  const dRoad = Math.hypot(rcx - fx, rcz - fz);
  if (dRoad > 560) continue;

  const spacing = dRoad < 240 ? 1.8 : 3.8;
  const halfW = Math.max(2.6, r.width * S * 0.5);
  for (let i = 1; i < r.p.length; i++) {
   const ax = r.p[i - 1][0] * S, az = r.p[i - 1][1] * S;
   const bx = r.p[i][0] * S, bz = r.p[i][1] * S;
   const dx = bx - ax, dz = bz - az;
   const len = Math.hypot(dx, dz);
   if (len < 1.0) continue;
   const dirX = dx / len, dirZ = dz / len;
   const nx = -dirZ, nz = dirX;
   const ang = Math.atan2(dirZ, dirX);
   const steps = Math.max(1, Math.min(44, Math.round(len / spacing)));

   for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const px = ax + dx * t;
    const pz = az + dz * t;
    // Sleek elongated asphalt streaks (3.5:1 aspect ratio)
    for (let s = 0; s < 3; s++) {
     const ln = (rand() - 0.5) * 1.85;
     const g = 0.16 + rand() * 0.12;
     pushGround(
      px + nx * halfW * ln + (rand() - 0.5) * 0.8,
      0.085 + rand() * 0.012,
      pz + nz * halfW * ln + (rand() - 0.5) * 0.8,
      spacing * (1.2 + rand() * 0.8), 0.55 + rand() * 0.45, ang + (rand() - 0.5) * 0.12,
      g, g + 0.015, g + 0.032, 0.58,
     );
    }
    // Crisp curb & lane edge neural highlights (subtle cool blue-silver 3DGS edge splats!)
    if (dRoad < 280) {
     for (const side of [-1, 1]) {
      pushGround(
       px + nx * (halfW + 0.25) * side,
       0.105,
       pz + nz * (halfW + 0.25) * side,
       spacing * 1.35, 0.26, ang,
       0.48, 0.62, 0.74, 0.45,
      );
     }
    }
   }
  }
 }

 // 2. Buildings -> fine organic elongated anisotropic brick/stone/window Gaussian clouds along facades
 const brickPalette = ['#944734', '#a85942', '#7a3c2d', '#b46f55', '#8c5340'];
 const stonePalette = ['#a6a193', '#bcb5a4', '#8e8c84', '#cbc4b2'];
 const sidingPalette = ['#d0cbbd', '#a2b0a9', '#c2b4a0', '#96a8b5', '#dad4c2'];

 for (let bi = 0; bi < Geo.buildings.length; bi++) {
  const src = Geo.buildings[bi];
  if (src.type === 'ship' || src.box.r < 0 || src.box.b < 0 || src.box.x > Geo.W || src.box.y > Geo.H) continue;
  const cx = ((src.box.x + src.box.r) * 0.5) * S;
  const cz = ((src.box.y + src.box.b) * 0.5) * S;
  const distToFocus = Math.hypot(cx - fx, cz - fz);
  if (distToFocus > 580) continue;

  const nearCore = distToFocus < 240;
  const area = (src.box.r - src.box.x) * (src.box.b - src.box.y) * S * S;
  const academy = src.name === 'Academy Building';
  const hall = src.name === 'Fall River City Hall';
  const borden = src.name === 'Lizzie Borden House';
  const justice = src.name === 'Fall River Justice Center';
  const mill = src.name.includes('Mill') || src.name.includes('Narrows') || src.type === 'industrial';

  let floors = src.hasLevels ? Math.max(1, parseFloat(src.height) || 2) : mill ? 4 : area > 250 ? 3 : 2;
  let h = parseFloat(src.heightMeters) || floors * 3.25;
  if (academy) { h = 17.4; floors = 4; }
  if (borden) { h = 6.6; floors = 2; }
  if (justice) { h = 21; floors = 5; }
  if (hall) { h = 22; floors = 4; }
  h = Math.min(60, Math.max(3.2, h));

  const isHouse = (!nearCore && area < 240 && !mill) || borden;
  const baseHex = borden ? '#7c915a'
   : academy ? '#a8513c'
   : hall || justice ? stonePalette[bi % stonePalette.length]
   : isHouse ? sidingPalette[bi % sidingPalette.length]
   : brickPalette[bi % brickPalette.length];
  tmpCol.set(baseHex);

  const pts = src.p;
  let signedA = 0;
  for (let i = 0; i < pts.length; i++) {
   const a = pts[i], b = pts[(i + 1) % pts.length];
   signedA += a[0] * b[1] - b[0] * a[1];
  }
  const nSign = signedA > 0 ? 1 : -1;

  const stepX = nearCore ? 1.05 : 2.6;
  const stepY = nearCore ? 1.10 : 2.6;

  for (let i = 0; i < pts.length - 1; i++) {
   const ax = pts[i][0] * S, az = pts[i][1] * S;
   const bx = pts[i + 1][0] * S, bz = pts[i + 1][1] * S;
   const dx = bx - ax, dz = bz - az;
   const len = Math.hypot(dx, dz);
   if (len < 0.8) continue;
   const tx = dx / len, tz = dz / len;
   const nx = tz * nSign, nz = -tx * nSign;

   const nxCount = Math.max(1, Math.min(34, Math.round(len / stepX)));
   const nyCount = Math.max(1, Math.min(18, Math.round(h / stepY)));

   for (let ix = 0; ix < nxCount; ix++) {
    const u = (ix + 0.15 + rand() * 0.7) / nxCount;
    const bxPos = ax + dx * u;
    const bzPos = az + dz * u;
    for (let iy = 0; iy < nyCount; iy++) {
     const v = (iy + 0.15 + rand() * 0.7) / nyCount;
     const py = v * h;
     const jit = (rand() - 0.5) * 0.22;

     // Anisotropic elongated splats (horizontal masonry strokes OR vertical pilasters — authentic 3DGS look!)
     const horiz = rand() > 0.32;
     const rx = stepX * (horiz ? (1.4 + rand() * 0.9) : (0.48 + rand() * 0.3));
     const ry = stepY * (horiz ? (0.48 + rand() * 0.35) : (1.35 + rand() * 0.8));
     const shade = 0.76 + v * 0.32 + jit;
     const offN = 0.14 + rand() * 0.12;

     pushOriented(
      bxPos + nx * offN,
      py,
      bzPos + nz * offN,
      tx * rx, 0, tz * rx,
      0, ry, 0,
      Math.min(1, tmpCol.r * shade),
      Math.min(1, tmpCol.g * shade),
      Math.min(1, tmpCol.b * shade),
      0.66,
     );

     // Crisp vertical glowing window Gaussian wisps on downtown facades
     if (nearCore && (ix % 3 === 1) && (iy % 3 === 1)) {
      const litSeed = rand();
      const isLit = litSeed > 0.50;
      pushOriented(
       bxPos + nx * 0.22,
       py,
       bzPos + nz * 0.22,
       tx * (stepX * 0.52), 0, tz * (stepX * 0.52),
       0, stepY * 1.15, 0,
       0.14, 0.28, 0.42,
       isLit ? 1.5 + litSeed * 0.45 : 0.78,
      );
     }

     // Subtle glowing neural cornice line along roof tops
     if (iy === nyCount - 1 && nearCore) {
      pushOriented(
       bxPos + nx * 0.22, h + 0.08, bzPos + nz * 0.22,
       tx * (stepX * 1.5), 0, tz * (stepX * 1.5),
       0, 0.34, 0,
       0.78, 0.84, 0.92, 0.55,
      );
     }
    }
   }
  }
 }

 // 3. Volumetric Gaussian Foliage Clouds (trees & parks — organic 3DGS signature!)
 for (const area of Geo.areas) {
  const cx = ((area.box.x + area.box.r) * 0.5) * S;
  const cz = ((area.box.y + area.box.b) * 0.5) * S;
  if (Math.hypot(cx - fx, cz - fz) > 580) continue;
  const w = (area.box.r - area.box.x) * S;
  const d = (area.box.b - area.box.y) * S;
  const count = Math.min(220, Math.max(10, Math.floor((w * d) / 48)));
  for (let i = 0; i < count; i++) {
   const px = area.box.x * S + rand() * w;
   const pz = area.box.y * S + rand() * d;
   if (rand() < 0.35) {
    const th = 2.5 + rand() * 2.5;
    for (let lobe = 0; lobe < 6; lobe++) {
     pushBillboard(
      px + (rand() - 0.5) * 2.4,
      th + (rand() - 0.5) * 1.4,
      pz + (rand() - 0.5) * 2.4,
      0.85 + rand() * 0.75, 0.65 + rand() * 0.55,
      0.16 + rand() * 0.16, 0.42 + rand() * 0.24, 0.18 + rand() * 0.12, 0.68,
     );
    }
   }
  }
 }

 // 4. Subtle floating ambient neural-capture dust/bokeh splats in the upper skyline (gives unmistakable 3DGS depth!)
 for (let i = 0; i < 600; i++) {
  const a = rand() * Math.PI * 2;
  const rad = 35 + rand() * 340;
  const px = fx + Math.cos(a) * rad;
  const pz = fz + Math.sin(a) * rad;
  const py = 12 + rand() * 28;
  pushBillboard(px, py, pz, 0.45 + rand() * 0.65, 0.28 + rand() * 0.35, 0.42, 0.74, 0.98, 0.24);
 }

 function buildMesh(cArr, uArr, vArr, colArr) {
  const count = cArr.length / 3;
  const baseGeo = new T.PlaneGeometry(1, 1);
  const instGeo = new T.InstancedBufferGeometry();
  instGeo.index = baseGeo.index;
  instGeo.attributes.position = baseGeo.attributes.position;
  instGeo.instanceCount = count;
  instGeo.setAttribute('aCenter', new T.InstancedBufferAttribute(new Float32Array(cArr), 3));
  instGeo.setAttribute('aAxisU', new T.InstancedBufferAttribute(new Float32Array(uArr), 3));
  instGeo.setAttribute('aAxisV', new T.InstancedBufferAttribute(new Float32Array(vArr), 3));
  instGeo.setAttribute('aColor', new T.InstancedBufferAttribute(new Float32Array(colArr), 4));
  const mesh = new T.Mesh(instGeo, splatMat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return { mesh, count };
 }

 for (let i = 0; i < centers.length; i += 3) centers[i + 1] += (Geo.groundY ? Geo.groundY(centers[i], centers[i + 2]) : 0);
 const { mesh: citySplatMesh, count: splatCount } = buildMesh(centers, axesU, axesV, colors);
 root.add(citySplatMesh);

 // External `.splat` (standard antimatter15 32-byte/splat format) loader
 let externalMesh = null;
 function loadSplatBuffer(buffer, anchorWorldPos = new T.Vector3(fx, 0, fz)) {
  const rowBytes = 32;
  const count = Math.floor(buffer.byteLength / rowBytes);
  if (!count) throw new Error('Empty or invalid .splat file');
  const f32 = new Float32Array(buffer);
  const u8 = new Uint8Array(buffer);
  const cArr = new Float32Array(count * 3);
  const uArr = new Float32Array(count * 3);
  const vArr = new Float32Array(count * 3);
  const colArr = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
   const fIdx = i * 8;
   const uIdx = i * 32;
   cArr[i * 3] = f32[fIdx] + anchorWorldPos.x;
   cArr[i * 3 + 1] = -f32[fIdx + 1] + anchorWorldPos.y + 1.5;
   cArr[i * 3 + 2] = f32[fIdx + 2] + anchorWorldPos.z;
   uArr[i * 3] = Math.min(2.2, Math.max(0.03, f32[fIdx + 3]));
   uArr[i * 3 + 1] = Math.min(2.2, Math.max(0.03, f32[fIdx + 4]));
   uArr[i * 3 + 2] = 0;
   vArr[i * 3] = 0; vArr[i * 3 + 1] = -1; vArr[i * 3 + 2] = 0;
   colArr[i * 4] = u8[uIdx + 24] / 255;
   colArr[i * 4 + 1] = u8[uIdx + 25] / 255;
   colArr[i * 4 + 2] = u8[uIdx + 26] / 255;
   colArr[i * 4 + 3] = u8[uIdx + 27] / 255;
  }
  if (externalMesh) {
   root.remove(externalMesh);
   externalMesh.geometry.dispose();
  }
  const built = buildMesh(cArr, uArr, vArr, colArr);
  externalMesh = built.mesh;
  root.add(externalMesh);
  root.visible = true;
  return built.count;
 }

 let mode = 'off'; // 'off' | 'splat' (Neural 3DGS City) | 'hybrid' (Pure Splat Cloud)

 function setMode(nextMode, cityGroup = null) {
  mode = nextMode;
  if (mode === 'splat') {
   // Neural 3DGS Reality View: dense anisotropic Gaussian splat field fused seamlessly over base depth geometry
   root.visible = true;
   uniforms.uOpacity.value = 0.92;
   uniforms.uSplatScale.value = 1.0;
   if (cityGroup) cityGroup.visible = true;
  } else if (mode === 'hybrid') {
   // Pure Floating 3D Gaussian Splat Cloud (zero base meshes — pure translucent radiance field!)
   root.visible = true;
   uniforms.uOpacity.value = 1.0;
   uniforms.uSplatScale.value = 1.25;
   if (cityGroup) cityGroup.visible = false;
  } else {
   root.visible = false;
   if (cityGroup) cityGroup.visible = true;
  }
  return mode;
 }

 function update(time, nightAmount = 0, fogColor = null) {
  if (!root.visible) return;
  uniforms.uTime.value = time;
  uniforms.uNight.value = nightAmount;
  if (fogColor) uniforms.uFogColor.value.copy(fogColor);
 }

 return {
  root,
  splatCount,
  get mode() { return mode; },
  setMode,
  update,
  loadSplatBuffer,
 };
}
