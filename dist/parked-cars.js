// Parked cars along downtown curbs: three instanced draw calls for the whole fleet
// (body, glass, tyres), tilted to the terrain slope, with circle colliders so they are solid.
import * as T from './vendor/three.module.js';
const S = 1 / 1.5;

function shell(sections) {
 const v = [];
 const face = (a, b, c, d) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
 for (let i = 1; i < sections.length; i++) {
  const [z, w, b, t] = sections[i - 1], [z2, w2, b2, t2] = sections[i];
  face([-w, b, z], [-w2, b2, z2], [-w2, t2, z2], [-w, t, z]);
  face([w, b, z], [w, t, z], [w2, t2, z2], [w2, b2, z2]);
  face([-w, t, z], [-w2, t2, z2], [w2, t2, z2], [w, t, z]);
 }
 for (const [z, w, b, t] of [sections[0], sections.at(-1)]) face([-w, b, z], [-w, t, z], [w, t, z], [w, b, z]);
 const g = new T.BufferGeometry();
 g.setAttribute('position', new T.Float32BufferAttribute(v, 3));
 g.computeVertexNormals();
 return g;
}

export function createParkedCars(scene, Geo, focus, colliders, maxCars = 170, radius = 640) {
 const body = shell([[-2.1, .77, .43, .83], [-1.72, .89, .43, 1.02], [1.34, .9, .43, 1.03], [2.08, .78, .46, .81]]);
 const cabin = shell([[-1.42, .75, 1.01, 1.03], [-.91, .68, 1.03, 1.55], [.62, .67, 1.03, 1.55], [1.25, .76, 1.03, 1.04]]);
 // Merge body + cabin into one "paint" geometry; roof stays paint-coloured.
 const paintPos = [...body.attributes.position.array, ...cabin.attributes.position.array];
 const paintGeo = new T.BufferGeometry();
 paintGeo.setAttribute('position', new T.Float32BufferAttribute(paintPos, 3));
 paintGeo.computeVertexNormals();
 // Windows: slightly inset dark panels along the cabin sides.
 const glassGeo = (() => {
  const g = shell([[-1.30, .765, 1.07, 1.50], [-.88, .695, 1.07, 1.50], [.60, .685, 1.07, 1.50], [1.12, .765, 1.07, 1.50]]);
  return g;
 })();
 const tireGeo = new T.CylinderGeometry(.34, .34, .22, 14); tireGeo.rotateZ(Math.PI / 2);

 const paint = new T.MeshStandardMaterial({ color: '#ffffff', roughness: .36, metalness: .32, side: T.DoubleSide });
 const glass = new T.MeshStandardMaterial({ color: '#1b2830', roughness: .12, metalness: .55, side: T.DoubleSide });
 const tire = new T.MeshStandardMaterial({ color: '#16191a', roughness: .92 });
 const palette = ['#a9b2b9', '#e9e9e4', '#2f3338', '#7d2a2a', '#2a4663', '#c9c5b3', '#5b6b5a', '#8f949a', '#1f2224', '#b19147'].map(c => new T.Color(c));

 let seed = 5151; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
 const slots = [];
 const skip = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'service']);
 for (const r of Geo.roads) {
  if (!r.drive || !r.name || skip.has(r.type)) continue;
  const half = r.width * S / 2;
  if (half < 4.2) continue;
  for (let i = 1; i < r.p.length; i++) {
   const a = r.p[i - 1], b = r.p[i];
   const dx = (b[0] - a[0]) * S, dz = (b[1] - a[1]) * S, len = Math.hypot(dx, dz);
   if (len < 24) continue;
   const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
   for (let d = 11; d < len - 11; d += 6.4) {
    if (rand() > .46) continue;
    const side = rand() < .5 ? -1 : 1;
    const off = half - 1.35;
    const wx = a[0] * S + ux * d + nx * off * side, wz = a[1] * S + uz * d + nz * off * side;
    if (Math.hypot(wx - focus.x * S, wz - focus.y * S) > radius) continue;
    if (Math.hypot(wx - focus.x * S, wz - focus.y * S) < 16) continue; // keep the spawn clear
    const mx = wx / S, my = wz / S;
    if (Geo.blocked(mx, my)) continue;
    const near = Geo.nearestRoad(mx, my, true);
    if (near.r.id !== r.id || near.distance > r.width / 2 + 1) continue;
    // Drive on the right: cars on the +normal side face along the segment, the other side against it.
    const heading = Math.atan2(ux, uz) + (side > 0 ? 0 : Math.PI);
    slots.push({ x: wx, z: wz, heading });
    if (slots.length >= maxCars * 2) break;
   }
  }
 }
 // Thin out evenly to the cap.
 while (slots.length > maxCars) slots.splice(Math.floor(rand() * slots.length), 1);

 const n = slots.length;
 if (!n) return { count: 0 };
 const paintMesh = new T.InstancedMesh(paintGeo, paint, n);
 const glassMesh = new T.InstancedMesh(glassGeo, glass, n);
 const tireMesh = new T.InstancedMesh(tireGeo, tire, n * 4);
 const o = new T.Object3D(), w = new T.Object3D(); o.rotation.order = 'YXZ';
 const m4 = new T.Matrix4();
 slots.forEach((s, i) => {
  const gy = (x, z) => Geo.groundY ? Geo.groundY(x, z) : 0;
  const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
  const hf = gy(s.x + fx * 2, s.z + fz * 2), hb = gy(s.x - fx * 2, s.z - fz * 2);
  o.position.set(s.x, gy(s.x, s.z) + .09, s.z);
  o.rotation.set(-Math.atan2(hf - hb, 4), s.heading, 0);
  o.updateMatrix();
  paintMesh.setMatrixAt(i, o.matrix); glassMesh.setMatrixAt(i, o.matrix);
  paintMesh.setColorAt(i, palette[Math.floor(rand() * palette.length)]);
  let k = i * 4;
  for (const sx of [-.88, .88]) for (const sz of [-1.3, 1.3]) {
   w.position.set(sx, .34, sz); w.rotation.set(0, 0, 0); w.updateMatrix();
   m4.multiplyMatrices(o.matrix, w.matrix);
   tireMesh.setMatrixAt(k++, m4);
  }
  colliders.push({ x: s.x + fx * 1.15, z: s.z + fz * 1.15, radius: 1.05, kind: 'parked car' }, { x: s.x - fx * 1.15, z: s.z - fz * 1.15, radius: 1.05, kind: 'parked car' });
 });
 for (const m of [paintMesh, glassMesh, tireMesh]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
 return { count: n };
}
