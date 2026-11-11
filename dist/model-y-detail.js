import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';

// Detailed exterior: "Tesla Model Y 2021" by 763468712 (CC BY 4.0), optimized
// locally. The GLB is pre-normalized (+Z forward, Y up, grounded, 4.75 m), so it
// is used as-is; only materials are tuned and wheel pivots are animated.
export const MODEL_Y_SRC='assets/models/tesla-model-y/model-y.glb';
export const MODEL_Y_CREDIT='“Tesla Model Y 2021” by 763468712, CC BY 4.0, modified (optimized)';
const WHEELS=['FL','FR','RL','RR'];
let warned=false;
function warnOnce(error){if(warned)return;warned=true;console.warn('Detailed Model Y unavailable; keeping the procedural car.',error)}

function tuneMaterials(model){
 const cache=new Map(),physical=(src,props)=>Object.assign(new T.MeshPhysicalMaterial({name:src.name}),props);
 const remap=src=>{
  const name=(src.name||'').toLowerCase().replace(/\.\d+$/,''),set=props=>{const m=src.clone();Object.assign(m,props);return m};
  switch(name){
   // 2021 Pearl White Multi-Coat: warm white base under a glossy clearcoat.
   case 'body':return physical(src,{color:new T.Color('#f1f0eb'),metalness:.04,roughness:.32,clearcoat:1,clearcoatRoughness:.05,envMapIntensity:1.15});
   case 'glass_body':return physical(src,{color:new T.Color('#0b1115'),metalness:0,roughness:.04,clearcoat:1,transparent:true,opacity:.78,depthWrite:false,envMapIntensity:1.6});
   case 'glass_lights':case 'glass_front_lights':return physical(src,{color:new T.Color('#e9eef1'),metalness:0,roughness:.02,transparent:true,opacity:.28,depthWrite:false,envMapIntensity:1.4});
   case 'chrome_rear_lights':return set({color:new T.Color('#7d0610'),roughness:.22,metalness:.1,emissive:new T.Color('#4c0207'),emissiveIntensity:.5});
   case 'chrome':case 'chrome_rear_2':return set({metalness:1,roughness:.12});
   case 'chrome_dark':return set({metalness:.85,roughness:.28});
   case 'black':case 'black2':return set({metalness:0,roughness:.55});
   case 'interior':return set({metalness:0,roughness:.78});
   case 'tires':return set({metalness:0,roughness:.92});
   case 'wheels':return set({metalness:.55,roughness:.36});
   case 'alum':return set({metalness:.9,roughness:.3});
   case 'metal':return set({metalness:.85,roughness:.4});
   case 'brakedsk':return set({metalness:.8,roughness:.45});
   case 'calipers':case 'calipers2':return set({metalness:.1,roughness:.4});
   default:return src;
  }
 };
 model.traverse(node=>{
  if(!node.isMesh)return;node.castShadow=true;node.receiveShadow=true;
  const swap=m=>{if(!m)return m;if(!cache.has(m))cache.set(m,remap(m));return cache.get(m)};
  node.material=Array.isArray(node.material)?node.material.map(swap):swap(node.material);
  if([].concat(node.material).some(m=>m?.transparent))node.castShadow=false;
 });
}

function rigWheels(model,meta){
 const wheels=[];model.updateMatrixWorld(true);
 const inv=new T.Matrix4().copy(model.matrixWorld).invert(),q=new T.Quaternion(),tmp=new T.Matrix4();
 for(const key of WHEELS){
  const steer=model.getObjectByName('Steer_'+key),spin=model.getObjectByName('Wheel_'+key);if(!steer||!spin)continue;
  // Spin about the wheel's local X; flip sign if that axis points to root -X.
  tmp.multiplyMatrices(inv,spin.matrixWorld);tmp.decompose(new T.Vector3(),q,new T.Vector3());
  const sign=Math.sign(new T.Vector3(1,0,0).applyQuaternion(q).x)||1;
  const radius=meta?.wheels?.[key]?.radius||new T.Box3().setFromObject(spin).getSize(new T.Vector3()).y/2||.369;
  wheels.push({steer,spin,front:key[0]==='F',sign,radius,steerBase:steer.quaternion.clone(),spinBase:spin.quaternion.clone(),angle:0});
 }
 return wheels.length===4?wheels:null;
}

/**
 * Load the detailed body into `root`, hiding `fallback` meshes on success.
 * Always resolves (true = detailed model active), warning once on failure.
 */
export function loadDetailedModelY(root,fallback,onWheels,{src=MODEL_Y_SRC}={}){
 return new Promise(resolve=>{
  const start=()=>{
   const meta=fetch(src.replace(/[^/]+$/,'asset.json')).then(r=>r.ok?r.json():null).catch(()=>null);
   new GLTFLoader().load(src,async gltf=>{
    try{
     const model=gltf.scene||gltf.scenes?.[0];if(!model)throw new Error('GLB has no scene');
     const wheels=rigWheels(model,await meta);tuneMaterials(model);model.name='Tesla Model Y 2021 (detailed)';
     root.add(model);for(const node of fallback)node.visible=false;
     if(wheels){const axis=new T.Vector3(1,0,0),up=new T.Vector3(0,1,0),q=new T.Quaternion();onWheels((speed,steer,dt)=>{for(const w of wheels){w.angle+=w.sign*speed*dt/w.radius;w.spin.quaternion.copy(w.spinBase).multiply(q.setFromAxisAngle(axis,w.angle));w.steer.quaternion.copy(w.steerBase).multiply(q.setFromAxisAngle(up,w.front?steer:0))}})}
     resolve(true);
    }catch(error){warnOnce(error);resolve(false)}
   },undefined,error=>{warnOnce(error);resolve(false)});
  };
  // Never block the first frame: start decoding once the browser is idle.
  if(typeof requestIdleCallback==='function')requestIdleCallback(start,{timeout:1500});else setTimeout(start,200);
 });
}
