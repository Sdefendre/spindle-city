import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {makeCharacter} from './character.js';

// Progressive replacement: gameplay begins with the existing procedural player,
// then a locally hosted rigged GLB replaces its visible meshes once it is decoded.
const loader=new GLTFLoader();
const clipNames={idle:/\b(idle|stand|breath)\b/i,walk:/\b(walk|walking)\b/i,run:/\b(run|jog|sprint)\b/i};
function findClip(clips,kind){return clips.find(clip=>clipNames[kind].test(clip.name))||null}
function prepareModel(model,{height=1.8,facingOffset=0}={}){
 const box=new T.Box3().setFromObject(model),size=box.getSize(new T.Vector3());
 if(size.y>0)model.scale.multiplyScalar(height/size.y);
 const fitted=new T.Box3().setFromObject(model);model.position.y-=fitted.min.y;model.rotation.y=facingOffset;
 model.traverse(node=>{if(!node.isMesh)return;node.castShadow=true;node.receiveShadow=true;node.frustumCulled=true;for(const mat of Array.isArray(node.material)?node.material:[node.material]){if(mat?.map)mat.map.colorSpace=T.SRGBColorSpace;if(mat?.name==='Outfit'&&mat.map){mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat fabricLight = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));\ndiffuseColor.rgb = vec3(0.62, 0.36, 0.17) * (0.12 + 1.65 * sqrt(fabricLight));')};mat.needsUpdate=true}}});
}

/** A drop-in replacement for makeCharacter with `root` and `update` preserved. */
export function makeDetailedCharacter(scene,{src='assets/models/fall-river-player.glb',detail=true,height=1.8,facingOffset=0,onLoad,onError}={}){
 const fallback=makeCharacter(scene,{detail}),root=fallback.root,fallbackChildren=[...fallback.root.children];
 let mixer=null,active=null,lastTime=null,loaded=false;const actions={};
 const setAction=(name,fade=.18)=>{const next=actions[name]||actions.idle||actions.walk||actions.run;if(!next||next===active)return;next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();if(active)active.crossFadeTo(next,fade,false);active=next};
 const ready=new Promise(resolve=>loader.load(src,gltf=>{
  const model=gltf.scene||gltf.scenes?.[0];if(!model){resolve(false);return}
  prepareModel(model,{height,facingOffset});root.add(model);for(const node of fallbackChildren)node.visible=false;
  mixer=new T.AnimationMixer(model);for(const name of ['idle','walk','run']){const clip=findClip(gltf.animations||[],name);if(clip)actions[name]=mixer.clipAction(clip)}
  setAction('idle',0);loaded=true;onLoad?.({model,animations:gltf.animations||[]});resolve(true);
 },undefined,error=>{onError?.(error);resolve(false)}));
 return {root,ready,get isDetailed(){return loaded},update(time,moving,running){fallback.update(time,moving,running);if(!mixer)return;const dt=lastTime===null?0:Math.min(.05,Math.max(0,time-lastTime));lastTime=time;setAction(running&&moving?'run':moving?'walk':'idle');mixer.update(dt)}};
}
