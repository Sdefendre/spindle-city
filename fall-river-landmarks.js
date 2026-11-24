import * as T from './vendor/three.module.js';

// Deliberately an interpretive landmark, not an engineering model.  It is
// anchored to the locally bundled OSM bridge/motorway geometry so it moves if
// the map extract changes, while leaving the playable roadway unobstructed.
const MAP_TO_WORLD = 1 / 1.5;
const UP = new T.Vector3(0, 1, 0);

function distanceToSegment(point, a, b) {
  const abx = b[0] - a[0], abz = b[1] - a[1];
  const apx = point[0] - a[0], apz = point[1] - a[1];
  const denominator = abx * abx + abz * abz || 1;
  const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / denominator));
  return Math.hypot(apx - abx * t, apz - abz * t);
}

function nearestRoadDistance(point, road) {
  let nearest = Infinity;
  for (let i = 1; i < road.p.length; i++) nearest = Math.min(nearest, distanceToSegment(point, road.p[i - 1], road.p[i]));
  return nearest;
}

function roadLength(road) {
  let length = 0;
  for (let i = 1; i < road.p.length; i++) length += Math.hypot(road.p[i][0] - road.p[i - 1][0], road.p[i][1] - road.p[i - 1][1]);
  return length;
}

function addBeam(beams, a, b, thickness) {
  if (a.distanceToSquared(b) > 0.0001) beams.push({ a, b, thickness });
}

function addInstancedBeams(group, beams, material) {
  if (!beams.length) return;
  const geometry = new T.CylinderGeometry(1, 1, 1, 6, 1, false);
  const mesh = new T.InstancedMesh(geometry, material, beams.length);
  const transform = new T.Object3D();
  const direction = new T.Vector3();
  beams.forEach(({ a, b, thickness }, index) => {
    direction.subVectors(b, a);
    transform.position.copy(a).add(b).multiplyScalar(0.5);
    transform.scale.set(thickness, direction.length(), thickness);
    transform.quaternion.setFromUnitVectors(UP, direction.normalize());
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function worldPoint(point, y = 0) {
  return new T.Vector3(point[0] * MAP_TO_WORLD, y, point[1] * MAP_TO_WORLD);
}

function offsetFor(a, b, distance) {
  const tangent = new T.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
  return new T.Vector3(-tangent.z * distance, 0, tangent.x * distance);
}

/**
 * Adds a low-draw-call, original blue cantilever/Warren-through-truss-inspired
 * landmark at the mapped Braga Bridge motorway. The road deck remains the
 * map's existing mesh: this module supplies only shoulder-side truss work.
 */
export function addFallRiverLandmarks(scene, Geo) {
  const poi = (Geo?.data?.pois || []).find((entry) => /braga/i.test(entry.name || ''));
  const candidates = (Geo?.roads || []).filter((road) => road.bridge !== 'no' && road.p?.length > 1 && road.type === 'motorway');
  if (!poi || !candidates.length) return { group: null, objects: [], wallMeshes: [] };

  // Prefer the mapped motorway bridge nearest the named OSM landmark, then a
  // longer segment when parallel carriageways are otherwise equally close.
  const bridgeRoad = candidates.slice().sort((a, b) => {
    const scoreA = nearestRoadDistance(poi.p, a) - roadLength(a) * 0.08;
    const scoreB = nearestRoadDistance(poi.p, b) - roadLength(b) * 0.08;
    return scoreA - scoreB;
  })[0];
  if (roadLength(bridgeRoad) < 120) return { group: null, objects: [], wallMeshes: [] };

  const route = bridgeRoad.p.map((point) => worldPoint(point, 0.38));
  const group = new T.Group();
  group.name = 'Braga Bridge inspired blue Warren through-truss (OSM-aligned)';
  const darkBeams = [];
  const brightBeams = [];
  const steel = new T.MeshStandardMaterial({ color: 0x1d5784, metalness: 0.72, roughness: 0.33 });
  const highlight = new T.MeshStandardMaterial({ color: 0x5799ba, metalness: 0.63, roughness: 0.3 });

  // Side structures sit beyond the motorway margins.  No new solid deck or
  // collider is placed over the lanes, preserving both view and drive-through
  // clearance in the existing game physics.
  const clearance = Math.max(8.5, ((bridgeRoad.width || 28) * MAP_TO_WORLD) / 2 + 1.6);
  const deckY = 0.85, topY = 11.8;
  const sampleCount = Math.min(8, route.length);
  const samples = [];
  for (let i = 0; i < sampleCount; i++) {
    const index = Math.round((route.length - 1) * (i / (sampleCount - 1)));
    if (!samples.length || !samples[samples.length - 1].equals(route[index])) samples.push(route[index]);
  }
  if (samples.length < 2) return { group: null, objects: [], wallMeshes: [] };

  const sides = [-1, 1];
  for (const side of sides) {
    const lower = [], upper = [];
    for (let i = 0; i < samples.length; i++) {
      const before = samples[Math.max(0, i - 1)], after = samples[Math.min(samples.length - 1, i + 1)];
      const offset = offsetFor(before, after, clearance * side);
      const basePt = samples[i].clone().add(offset);
      const gy = Geo.groundY ? Geo.groundY(basePt.x, basePt.z) : 0;
      lower.push(basePt.clone().setY(deckY + gy));
      upper.push(basePt.clone().setY(topY + gy));
    }
    for (let i = 1; i < lower.length; i++) {
      addBeam(darkBeams, lower[i - 1], lower[i], 0.26);
      addBeam(darkBeams, upper[i - 1], upper[i], 0.3);
    }
    // Alternating diagonals create a Warren lattice rather than the X-bracing
    // or suspended-cable silhouette that the earlier concept used.
    for (let i = 0; i < lower.length - 1; i++) {
      const from = i % 2 === 0 ? lower[i] : upper[i];
      const to = i % 2 === 0 ? upper[i + 1] : lower[i + 1];
      addBeam(brightBeams, from, to, 0.2);
    }
    addBeam(brightBeams, lower[0], upper[0], 0.25);
    addBeam(brightBeams, lower[lower.length - 1], upper[upper.length - 1], 0.25);
  }

  addInstancedBeams(group, darkBeams, steel);
  addInstancedBeams(group, brightBeams, highlight);
  scene.add(group);
  return { group, objects: [group], wallMeshes: [] };
}
