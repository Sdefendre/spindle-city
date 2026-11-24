// Procedural leaf-card trees (alpha-tested crossed quads on tapered trunks with branches).
// Normals on leaf cards point away from the crown centre so a single card shades like a
// volume instead of a flat sprite. Two instanced draw calls for the whole city.
import * as T from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

function leafTexture(renderer) {
 const c = document.createElement('canvas'); c.width = c.height = 256;
 const g = c.getContext('2d');
 let seed = 4242; const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
 g.clearRect(0, 0, 256, 256);
 // Dense cluster of overlapping leaves (varied greens, subtle midrib) on transparent ground.
 for (let i = 0; i < 520; i++) {
  const x = 18 + r() * 220, y = 18 + r() * 220;
  const dx = (x - 128) / 118, dy = (y - 128) / 118;
  if (dx * dx + dy * dy > 1.0) continue;
  const a = r() * Math.PI * 2, len = 11 + r() * 9, wid = 4.4 + r() * 3.2;
  const tone = 38 + Math.floor(r() * 62), warm = Math.floor(r() * 24);
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = `rgb(${48 + warm},${tone + 56},${28 + warm * .6})`;
  g.beginPath(); g.ellipse(0, 0, len, wid, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = `rgba(20,44,18,${.25 + r() * .25})`; g.lineWidth = 1;
  g.beginPath(); g.moveTo(-len * .8, 0); g.lineTo(len * .8, 0); g.stroke();
  g.restore();
 }
 const t = new T.CanvasTexture(c);
 t.colorSpace = T.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
 t.generateMipmaps = true; t.minFilter = T.LinearMipmapLinearFilter;
 return t;
}

export function createTreeKit(renderer) {
 let seed = 77; const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

 // Trunk: tapered cylinder + 4 angled branches (merged -> single draw call).
 const parts = [];
 const trunk = new T.CylinderGeometry(.09, .19, 3.7, 7, 1); trunk.translate(0, 1.85, 0); parts.push(trunk);
 for (let i = 0; i < 4; i++) {
  const br = new T.CylinderGeometry(.035, .075, 1.9, 5, 1);
  br.translate(0, .95, 0);
  br.rotateZ(.62 + r() * .3); br.rotateY(i * 1.57 + r() * .5);
  br.translate(0, 2.9 + r() * .7, 0);
  parts.push(br);
 }
 const trunkGeo = mergeGeometries(parts.map(p => p.toNonIndexed ? p.toNonIndexed() : p));

 // Crown: 11 clusters of 3 crossed leaf cards.
 const crownCenter = new T.Vector3(0, 5.0, 0);
 const cards = [];
 for (let k = 0; k < 11; k++) {
  const a = r() * Math.PI * 2, rad = 0.5 + r() * 1.5, h = 4.0 + r() * 2.1 - Math.abs(Math.cos(a)) * .0;
  const cx = Math.cos(a) * rad * (k < 3 ? .3 : 1), cz = Math.sin(a) * rad * (k < 3 ? .3 : 1), cy = h + (k < 3 ? 0.7 : 0);
  const size = 2.1 + r() * 1.1;
  for (let c = 0; c < 3; c++) {
   const q = new T.PlaneGeometry(size, size).toNonIndexed();
   q.rotateY(c * Math.PI / 3 + r() * .6); q.rotateX((r() - .5) * .7);
   q.translate(cx, cy, cz);
   cards.push(q);
  }
 }
 const leafGeo = mergeGeometries(cards);
 const pos = leafGeo.attributes.position, nrm = new Float32Array(pos.count * 3), v = new T.Vector3();
 for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).sub(crownCenter).normalize(); nrm[i * 3] = v.x; nrm[i * 3 + 1] = v.y * .8 + .2; nrm[i * 3 + 2] = v.z; }
 leafGeo.setAttribute('normal', new T.BufferAttribute(nrm, 3));

 const leafMat = new T.MeshStandardMaterial({ map: leafTexture(renderer), alphaTest: .5, side: T.DoubleSide, roughness: .86, metalness: 0, color: '#ffffff' });
 const trunkMat = new T.MeshStandardMaterial({ color: '#5a4636', roughness: .95 });
 return { trunkGeo, leafGeo, leafMat, trunkMat };
}
