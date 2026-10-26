import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {makeCharacter} from './character.js';

// Ara 3D Gen / MakeHuman CC0 assets.  See assets/models/npcs/LICENSE.txt.
// Keep this modest: each animated GLB is 3.6–5.0 MiB, so callers should use
// at most this many simultaneously visible rigged pedestrians and let the
// built-in procedural character cover the remainder.
export const MAX_CONCURRENT_RIGGED_NPCS = 3;

export const NPC_VARIANTS = Object.freeze({
  womanCasual: Object.freeze({
    label: 'Woman in casual clothes',
    src: new URL('./assets/models/npcs/npc_woman_casual.glb', import.meta.url).href,
    height: 1.68,
  }),
  manWorkwear: Object.freeze({
    label: 'Man in workwear',
    src: new URL('./assets/models/npcs/npc_man_workwear.glb', import.meta.url).href,
    height: 1.80,
  }),
  manJacket: Object.freeze({
    label: 'Man in a jacket',
    src: new URL('./assets/models/npcs/npc_man_jacket.glb', import.meta.url).href,
    height: 1.74,
  }),
});

const loader = new GLTFLoader();
const sourceLoads = new Map();
let reservedRigSlots = 0;

function findClip(clips, kind) {
  const names = kind === 'idle' ? /\b(idle|stand|breath)\b/i : /\b(walk|walking)\b/i;
  return clips.find((clip) => names.test(clip.name)) || null;
}

/** Clone skinned meshes with independent bones, equivalent to SkeletonUtils.clone(). */
function cloneRig(source) {
  const sourceForClone = new Map();
  const cloneForSource = new Map();
  const clone = source.clone(true);
  const walkBoth = (a, b) => {
    sourceForClone.set(b, a);
    cloneForSource.set(a, b);
    for (let i = 0; i < a.children.length; i += 1) walkBoth(a.children[i], b.children[i]);
  };
  walkBoth(source, clone);
  clone.traverse((node) => {
    if (!node.isSkinnedMesh) return;
    const sourceMesh = sourceForClone.get(node);
    if (!sourceMesh?.skeleton) return;
    const skeleton = sourceMesh.skeleton.clone();
    skeleton.bones = sourceMesh.skeleton.bones.map((bone) => cloneForSource.get(bone));
    node.bind(skeleton, sourceMesh.bindMatrix);
  });
  return clone;
}

function prepareModel(model, height) {
  const box = new T.Box3().setFromObject(model);
  const size = box.getSize(new T.Vector3());
  if (size.y > 0) model.scale.multiplyScalar(height / size.y);
  model.position.y -= new T.Box3().setFromObject(model).min.y;
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    node.frustumCulled = true;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (material?.map) material.map.colorSpace = T.SRGBColorSpace;
    }
  });
}

function loadSource(variant) {
  if (!sourceLoads.has(variant)) {
    const config = NPC_VARIANTS[variant];
    if (!config) return Promise.reject(new Error(`Unknown NPC variant: ${variant}`));
    sourceLoads.set(variant, loader.loadAsync(config.src));
  }
  return sourceLoads.get(variant);
}

/**
 * Create an NPC immediately. It begins as a procedural fallback, then swaps
 * to a locally hosted rigged model when one of the shared source loads resolves.
 *
 * Call `npc.update(timeSeconds, isWalking)` once each frame. Call `dispose()`
 * when removing the NPC so its reserved rig slot is returned.
 */
export function createNPC(scene, {
  variant = 'womanCasual',
  fallbackVariant = null,
  detail = false,
  preferRigged = true,
  maxRigged = MAX_CONCURRENT_RIGGED_NPCS,
  onLoad,
  onError,
} = {}) {
  const fallback = makeCharacter(scene, {detail,variant:fallbackVariant});
  const root = fallback.root;
  const fallbackChildren = [...root.children];
  const config = NPC_VARIANTS[variant];
  const canReserve = preferRigged && !!config && reservedRigSlots < Math.max(0, maxRigged);
  if (canReserve) reservedRigSlots += 1;
  let slotHeld = canReserve;

  let model = null;
  let mixer = null;
  let active = null;
  let lastTime = null;
  let disposed = false;
  let rigged = false;
  const actions = {};
  const chooseAction = (walking, fade = 0.18) => {
    const next = (walking ? actions.walk : actions.idle) || actions.idle || actions.walk;
    if (!next || next === active) return;
    next.reset().setEffectiveWeight(1).play();
    if (active) active.crossFadeTo(next, fade, false);
    active = next;
  };
  const releaseSlot = () => {
    if (!slotHeld) return;
    slotHeld = false;
    reservedRigSlots = Math.max(0, reservedRigSlots - 1);
  };

  const ready = !canReserve ? Promise.resolve(false) : loadSource(variant).then((gltf) => {
    if (disposed) {
      releaseSlot();
      return false;
    }
    const source = gltf.scene || gltf.scenes?.[0];
    if (!source) throw new Error(`NPC model has no scene: ${variant}`);
    model = cloneRig(source);
    prepareModel(model, config.height);
    root.add(model);
    for (const child of fallbackChildren) child.visible = false;
    mixer = new T.AnimationMixer(model);
    for (const name of ['idle', 'walk']) {
      const clip = findClip(gltf.animations || [], name);
      if (clip) actions[name] = mixer.clipAction(clip);
    }
    chooseAction(false, 0);
    rigged = true;
    onLoad?.({model, animations: gltf.animations || [], variant});
    return true;
  }).catch((error) => {
    releaseSlot();
    onError?.(error);
    return false;
  });

  return {
    root,
    ready,
    variant,
    get isRigged() { return rigged; },
    update(time, walking = false, running = false) {
      fallback.update(time, walking, running);
      if (!mixer) return;
      const delta = lastTime === null ? 0 : Math.min(0.05, Math.max(0, time - lastTime));
      lastTime = time;
      chooseAction(walking);
      mixer.update(delta);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (mixer) mixer.stopAllAction();
      releaseSlot();
      root.removeFromParent();
    },
  };
}

export function getNPCModelStats() {
  return {reservedRigSlots, cachedVariants: [...sourceLoads.keys()]};
}
