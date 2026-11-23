// Tesla FSD v15 Reality View 3D overlays (zero-allocation per-frame buffers):
// - Luminous HDR sky-blue FSD trajectory ribbon (pre-allocated Float32Array VBO)
// - Clean single perspective-grounded floating AR turn chevron in the sky (no overlapping scribble)
// - Feathered soft radial ground glow under the Model Y (never shown around pedestrians)
// - Interactive Tap-to-Go ground raycast destination pin
import * as T from './vendor/three.module.js';

const S = 1 / 1.5;
const MAX_RIBBON_SEGS = 140;

function makeTurnChevronTexture(dir = 0) {
 const c = document.createElement('canvas');
 c.width = 256; c.height = 256;
 const ctx = c.getContext('2d');
 ctx.clearRect(0, 0, 256, 256);

 const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 118);
 g.addColorStop(0, 'rgba(64, 184, 255, 0.36)');
 g.addColorStop(0.55, 'rgba(24, 134, 255, 0.10)');
 g.addColorStop(1, 'rgba(24, 134, 255, 0)');
 ctx.fillStyle = g;
 ctx.fillRect(0, 0, 256, 256);

 ctx.save();
 ctx.translate(128, 128);
 if (dir < 0) ctx.rotate(-Math.PI / 2);
 else if (dir > 0) ctx.rotate(Math.PI / 2);

 // Crisp double AR chevron (clean silhouette, never cluttered)
 for (let i = 0; i < 2; i++) {
  const y = (i - 0.5) * 44;
  const a = i === 0 ? 0.96 : 0.52;
  ctx.beginPath();
  ctx.moveTo(-54, y + 24);
  ctx.lineTo(0, y - 26);
  ctx.lineTo(54, y + 24);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = '#38b6ff';
  ctx.shadowBlur = 22;
  ctx.strokeStyle = `rgba(36, 152, 255, ${a})`;
  ctx.lineWidth = 20;
  ctx.stroke();
  ctx.strokeStyle = `rgba(236, 249, 255, ${a})`;
  ctx.lineWidth = 8;
  ctx.stroke();
 }
 ctx.restore();

 const tex = new T.CanvasTexture(c);
 tex.colorSpace = T.SRGBColorSpace;
 return tex;
}

function makeSoftGlowTexture() {
 const c = document.createElement('canvas');
 c.width = 256; c.height = 256;
 const ctx = c.getContext('2d');
 const g = ctx.createRadialGradient(128, 128, 18, 128, 128, 124);
 g.addColorStop(0, 'rgba(52, 168, 255, 0.0)');
 g.addColorStop(0.42, 'rgba(52, 168, 255, 0.24)');
 g.addColorStop(0.68, 'rgba(90, 200, 255, 0.34)');
 g.addColorStop(0.84, 'rgba(32, 140, 255, 0.12)');
 g.addColorStop(1, 'rgba(32, 140, 255, 0.0)');
 ctx.fillStyle = g;
 ctx.fillRect(0, 0, 256, 256);
 const tex = new T.CanvasTexture(c);
 tex.colorSpace = T.SRGBColorSpace;
 return tex;
}

function makePinTexture() {
 const c = document.createElement('canvas');
 c.width = 256; c.height = 256;
 const ctx = c.getContext('2d');
 const g = ctx.createRadialGradient(128, 128, 12, 128, 128, 112);
 g.addColorStop(0, 'rgba(92, 198, 255, 0.58)');
 g.addColorStop(0.45, 'rgba(24, 135, 255, 0.20)');
 g.addColorStop(1, 'rgba(24, 135, 255, 0)');
 ctx.fillStyle = g;
 ctx.fillRect(0, 0, 256, 256);

 ctx.save();
 ctx.beginPath();
 ctx.moveTo(128, 194);
 ctx.lineTo(86, 126);
 ctx.lineTo(128, 58);
 ctx.lineTo(170, 126);
 ctx.closePath();
 ctx.fillStyle = 'rgba(28, 146, 255, 0.9)';
 ctx.shadowColor = '#4dc3ff';
 ctx.shadowBlur = 22;
 ctx.fill();
 ctx.lineWidth = 6;
 ctx.strokeStyle = '#eaf8ff';
 ctx.stroke();

 ctx.beginPath();
 ctx.arc(128, 126, 14, 0, Math.PI * 2);
 ctx.fillStyle = '#ffffff';
 ctx.fill();
 ctx.restore();

 const tex = new T.CanvasTexture(c);
 tex.colorSpace = T.SRGBColorSpace;
 return tex;
}

export function createRealityView(scene, Geo) {
 const root = new T.Group();
 root.name = 'tesla-reality-view';
 scene.add(root);

 // 1. Zero-allocation pre-sized ribbon geometry (6 vertices per segment)
 const maxVerts = MAX_RIBBON_SEGS * 6;
 const posArray = new Float32Array(maxVerts * 3);
 const uvArray = new Float32Array(maxVerts * 2);
 const posAttr = new T.BufferAttribute(posArray, 3);
 const uvAttr = new T.BufferAttribute(uvArray, 2);
 posAttr.setUsage(T.DynamicDrawUsage);
 uvAttr.setUsage(T.DynamicDrawUsage);

 const ribbonGeo = new T.BufferGeometry();
 ribbonGeo.setAttribute('position', posAttr);
 ribbonGeo.setAttribute('uv', uvAttr);
 ribbonGeo.setDrawRange(0, 0);

 const ribbonUniforms = {
  uTime: { value: 0 },
  uEngage: { value: 0 },
 };

 const ribbonMat = new T.ShaderMaterial({
  uniforms: ribbonUniforms,
  transparent: true,
  depthWrite: false,
  side: T.DoubleSide,
  vertexShader: `
   varying vec2 vUv;
   void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
   }
  `,
  fragmentShader: `
   varying vec2 vUv;
   uniform float uTime;
   uniform float uEngage;
   void main() {
    float edge = abs(vUv.x - 0.5) * 2.0;
    float core = smoothstep(0.62, 0.14, edge);
    float halo = smoothstep(1.0, 0.22, edge);
    float fadeStart = smoothstep(0.0, 0.08, vUv.y);
    float fadeEnd = smoothstep(1.0, 0.78, vUv.y);
    float flowPos = fract(vUv.y * 9.0 - uTime * (1.2 + uEngage * 1.15) - edge * 0.42);
    float pulse = smoothstep(0.0, 0.22, flowPos) * smoothstep(0.54, 0.22, flowPos);
    // HDR values (>1.0) so HalfFloat bloom gives a genuine Tesla sky-blue aura
    vec3 deepBlue = vec3(0.10, 0.54, 1.18);
    vec3 skyBlue  = vec3(0.36, 0.88, 1.45);
    vec3 hotCore  = vec3(0.95, 1.28, 1.55);
    vec3 col = mix(deepBlue, skyBlue, core);
    col = mix(col, hotCore, pulse * core * (0.45 + 0.40 * uEngage));
    float baseAlpha = mix(0.24, 0.74, uEngage);
    float alpha = (halo * 0.34 + core * 0.66) * baseAlpha * fadeStart * fadeEnd;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.90));
   }
  `,
 });

 const ribbonMesh = new T.Mesh(ribbonGeo, ribbonMat);
 ribbonMesh.frustumCulled = false;
 ribbonMesh.renderOrder = 3;
 root.add(ribbonMesh);

 // 2. Clean single AR Sky Chevron for the next turn + optional far straight chevron (depthTest ON so it sits naturally in the sky!)
 const texForward = makeTurnChevronTexture(0);
 const texLeft = makeTurnChevronTexture(-1);
 const texRight = makeTurnChevronTexture(1);
 const texPin = makePinTexture();

 const turnChevron = new T.Sprite(new T.SpriteMaterial({
  map: texForward,
  transparent: true,
  depthTest: true,
  depthWrite: false,
  opacity: 0.92,
 }));
 turnChevron.renderOrder = 9;
 turnChevron.visible = false;
 root.add(turnChevron);

 // 3. Destination Tap-to-Go Beacon
 const destGroup = new T.Group();
 destGroup.visible = false;
 root.add(destGroup);

 const ringOuterMat = new T.MeshBasicMaterial({
  color: '#38b6ff',
  transparent: true,
  opacity: 0.65,
  side: T.DoubleSide,
  depthWrite: false,
 });
 const ringOuter = new T.Mesh(new T.RingGeometry(1.3, 1.7, 44), ringOuterMat);
 ringOuter.rotation.x = -Math.PI / 2;
 ringOuter.position.y = 0.14;
 destGroup.add(ringOuter);

 const beam = new T.Mesh(
  new T.CylinderGeometry(0.14, 0.95, 9.0, 20, 1, true),
  new T.MeshBasicMaterial({ color: '#2b9aff', transparent: true, opacity: 0.16, side: T.DoubleSide, depthWrite: false }),
 );
 beam.position.y = 4.6;
 destGroup.add(beam);

 const destPin = new T.Sprite(new T.SpriteMaterial({ map: texPin, transparent: true, depthTest: false, depthWrite: false }));
 destPin.scale.set(3.8, 3.8, 1);
 destPin.position.y = 8.2;
 destPin.renderOrder = 11;
 destGroup.add(destPin);

 // 4. Subtle feathered radial glow under the Model Y ONLY when actively driving with FSD
 const egoGlowMat = new T.MeshBasicMaterial({
  map: makeSoftGlowTexture(),
  transparent: true,
  opacity: 0.0,
  depthWrite: false,
  side: T.DoubleSide,
 });
 const egoHalo = new T.Mesh(new T.PlaneGeometry(5.6, 5.6), egoGlowMat);
 egoHalo.rotation.x = -Math.PI / 2;
 egoHalo.position.y = 0.11;
 egoHalo.renderOrder = 2;
 egoHalo.visible = false;
 root.add(egoHalo);

 // Reusable scratch arrays to avoid per-frame GC allocations
 const scratchPts = Array.from({ length: MAX_RIBBON_SEGS + 1 }, () => ({ x: 0, z: 0 }));
 const scratchDists = new Float32Array(MAX_RIBBON_SEGS + 1);
 const leftX = new Float32Array(MAX_RIBBON_SEGS + 1);
 const leftZ = new Float32Array(MAX_RIBBON_SEGS + 1);
 const rightX = new Float32Array(MAX_RIBBON_SEGS + 1);
 const rightZ = new Float32Array(MAX_RIBBON_SEGS + 1);

 function buildRibbon(count, halfWidth) {
  if (count < 2) {
   ribbonMesh.visible = false;
   ribbonGeo.setDrawRange(0, 0);
   return;
  }
  const n = Math.min(count, MAX_RIBBON_SEGS + 1);
  let total = 0;
  scratchDists[0] = 0;
  for (let i = 1; i < n; i++) {
   total += Math.hypot(scratchPts[i].x - scratchPts[i - 1].x, scratchPts[i].z - scratchPts[i - 1].z);
   scratchDists[i] = total;
  }
  if (total < 0.5) {
   ribbonMesh.visible = false;
   ribbonGeo.setDrawRange(0, 0);
   return;
  }
  for (let i = 0; i < n; i++) {
   const prev = scratchPts[i > 0 ? i - 1 : 0];
   const next = scratchPts[i < n - 1 ? i + 1 : n - 1];
   const dx = next.x - prev.x;
   const dz = next.z - prev.z;
   const len = Math.hypot(dx, dz) || 1;
   const nx = -dz / len;
   const nz = dx / len;
   const t = scratchDists[i] / total;
   const w = halfWidth * (1.0 - t * 0.22);
   leftX[i] = scratchPts[i].x + nx * w;
   leftZ[i] = scratchPts[i].z + nz * w;
   rightX[i] = scratchPts[i].x - nx * w;
   rightZ[i] = scratchPts[i].z - nz * w;
  }

  let pi = 0, ui = 0;
  const y = 0.165;
  for (let i = 1; i < n; i++) {
   const v0 = scratchDists[i - 1] / total;
   const v1 = scratchDists[i] / total;
   const ax = leftX[i - 1], az = leftZ[i - 1];
   const bx = rightX[i - 1], bz = rightZ[i - 1];
   const cx = leftX[i], cz = leftZ[i];
   const dx = rightX[i], dz = rightZ[i];
   // tri 1: a, b, c
   posArray[pi++] = ax; posArray[pi++] = y; posArray[pi++] = az;
   posArray[pi++] = bx; posArray[pi++] = y; posArray[pi++] = bz;
   posArray[pi++] = cx; posArray[pi++] = y; posArray[pi++] = cz;
   // tri 2: b, d, c
   posArray[pi++] = bx; posArray[pi++] = y; posArray[pi++] = bz;
   posArray[pi++] = dx; posArray[pi++] = y; posArray[pi++] = dz;
   posArray[pi++] = cx; posArray[pi++] = y; posArray[pi++] = cz;

   uvArray[ui++] = 0; uvArray[ui++] = v0;
   uvArray[ui++] = 1; uvArray[ui++] = v0;
   uvArray[ui++] = 0; uvArray[ui++] = v1;
   uvArray[ui++] = 1; uvArray[ui++] = v0;
   uvArray[ui++] = 1; uvArray[ui++] = v1;
   uvArray[ui++] = 0; uvArray[ui++] = v1;
  }
  posAttr.needsUpdate = true;
  uvAttr.needsUpdate = true;
  ribbonGeo.setDrawRange(0, (n - 1) * 6);
  ribbonMesh.visible = true;
 }

 function findNextManeuver(player, route) {
  if (!route?.points?.length) return null;
  const start = Math.max(0, route.index || 0);
  const pts = route.points;
  let accum = 0;
  let px = player.x, py = player.y;
  for (let i = start; i < pts.length - 1; i++) {
   const curr = pts[i];
   accum += Math.hypot(curr.x - px, curr.y - py) * S;
   px = curr.x; py = curr.y;
   if (accum > 240) break;
   if (i > start && i < pts.length - 1) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const ax = b.x - a.x, ay = b.y - a.y;
    const bx = c.x - b.x, by = c.y - b.y;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la > 1.5 && lb > 1.5) {
     const cross = (ax * by - ay * bx) / (la * lb);
     const dot = (ax * bx + ay * by) / (la * lb);
     const angle = Math.atan2(cross, dot);
     if (Math.abs(angle) > 0.48 && accum > 12) {
      return {
       dir: angle > 0 ? 1 : -1,
       label: angle > 0 ? 'Turn right' : 'Turn left',
       distanceM: accum,
       point: b,
       angle,
      };
     }
    }
   }
  }
  const dest = pts[pts.length - 1];
  const d = Math.hypot(dest.x - player.x, dest.y - player.y) * S;
  return { dir: 0, label: 'Continue straight', distanceM: d, point: dest, angle: 0 };
 }

 const raycaster = new T.Raycaster();
 const groundPlane = new T.Plane(new T.Vector3(0, 1, 0), 0);
 const hitPoint = new T.Vector3();
 const ndc = new T.Vector2();

 function pickRoadAtScreen(clientX, clientY, camera) {
  ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return null;
  const mx = hitPoint.x / S;
  const my = hitPoint.z / S;
  if (mx < 0 || my < 0 || mx > Geo.W || my > Geo.H) return null;
  const near = Geo.nearestRoad(mx, my, true);
  if (!near || near.distance > 180) return null;
  const safe = Geo.safePoint(near.x, near.y);
  const named = Geo.nearestRoad(safe.x, safe.y, true, true);
  return {
   x: safe.x,
   y: safe.y,
   name: named?.r?.name || near.r?.name || 'Pinned destination',
  };
 }

 function update(time, { player, vehicle, route, assist, enabled = true, firstPerson = false, started = false } = {}) {
  root.visible = !!enabled && !!player && !!started;
  if (!root.visible) return null;

  ribbonUniforms.uTime.value = time;
  const hasRoute = !!(route?.points?.length > 1);
  const engaged = !!(assist || hasRoute);
  ribbonUniforms.uEngage.value += ((engaged ? 1 : 0) - ribbonUniforms.uEngage.value) * 0.12;

  const px = player.x * S;
  const pz = player.y * S;

  // Soft feathered radial glow under the Model Y only when driving with FSD
  egoHalo.visible = !!vehicle && !firstPerson && engaged;
  if (egoHalo.visible) {
   egoHalo.position.set(px, 0.11, pz);
   egoGlowMat.opacity = 0.55 + 0.12 * Math.sin(time * 2.4);
  }

  // Build trajectory ribbon without allocations
  if (hasRoute) {
   const idx = Math.max(0, route.index || 0);
   let count = 0;
   scratchPts[count].x = px; scratchPts[count].z = pz; count++;
   let accum = 0, lx = px, lz = pz;
   for (let i = idx; i < route.points.length && count <= MAX_RIBBON_SEGS; i++) {
    const wx = route.points[i].x * S;
    const wz = route.points[i].y * S;
    const step = Math.hypot(wx - lx, wz - lz);
    if (step < 0.6 && i < route.points.length - 1) continue;
    scratchPts[count].x = wx; scratchPts[count].z = wz; count++;
    accum += step;
    lx = wx; lz = wz;
    if (accum > 125) break;
   }
   buildRibbon(count, assist ? 1.05 : 0.85);
  } else if (vehicle) {
   const heading = vehicle.heading;
   const steer = vehicle.steer || 0;
   const speed = Math.abs(vehicle.velocity || 0);
   const reach = 14 + Math.min(24, speed * 1.3);
   const steps = 16;
   let x = px, z = pz, h = heading;
   const ds = reach / steps;
   const curv = -steer * 0.055;
   let count = 0;
   for (let i = 0; i <= steps; i++) {
    if (i > 0) {
     h += curv * ds;
     x += Math.sin(h) * ds;
     z += Math.cos(h) * ds;
     scratchPts[count].x = x; scratchPts[count].z = z; count++;
    }
   }
   buildRibbon(count, 0.72);
  } else {
   ribbonMesh.visible = false;
  }

  // Single crisp floating AR sky chevron anchored cleanly above the upcoming turn or ~45m ahead
  if (hasRoute) {
   const dest = route.points[route.points.length - 1];
   destGroup.visible = true;
   destGroup.position.set(dest.x * S, 0, dest.y * S);
   const pulse = 1 + 0.16 * Math.sin(time * 3.0);
   ringOuter.scale.setScalar(pulse);
   ringOuterMat.opacity = 0.42 + 0.30 * (0.5 + 0.5 * Math.sin(time * 3.0));
   destPin.position.y = 8.2 + Math.sin(time * 2.4) * 0.55;

   const maneuver = findNextManeuver(player, route);
   if (maneuver && maneuver.distanceM > 14 && maneuver.distanceM < 190) {
    // Clamp chevron distance so it sits cleanly in mid-sky above the turn without shrinking to a dot or colliding
    const anchor = maneuver.dir !== 0 ? maneuver.point : route.points[Math.min(route.points.length - 1, (route.index || 0) + 12)];
    turnChevron.material.map = maneuver.dir > 0 ? texRight : maneuver.dir < 0 ? texLeft : texForward;
    const h = maneuver.dir !== 0 ? 9.2 : 7.8;
    turnChevron.position.set(anchor.x * S, h + Math.sin(time * 2.8) * 0.4, anchor.y * S);
    const dWorld = Math.hypot(anchor.x * S - px, anchor.y * S - pz);
    const sc = Math.max(4.4, Math.min(8.5, 3.6 + dWorld * 0.045));
    turnChevron.scale.set(sc, sc, 1);
    turnChevron.material.opacity = 0.88 + 0.10 * Math.sin(time * 3.4);
    turnChevron.visible = true;
   } else {
    turnChevron.visible = false;
   }
   return maneuver ? { ...maneuver, name: route.name || 'Destination' } : null;
  }

  destGroup.visible = false;
  turnChevron.visible = false;
  return null;
 }

 return { update, pickRoadAtScreen };
}
