// Rebuild the locally hosted, CC BY 4.0 Model Y from the original FetchCFD glTF.
// Install tooling outside the game: npm install --prefix /tmp/spindle-gltf-tools @gltf-transform/cli
// node scripts/prepare-model-y.mjs <source scene.gltf> <toolchain directory>
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const source=path.resolve(process.argv[2]||'outputs/claude-improvement/original-model-y/scene.gltf');
const toolchain=path.resolve(process.argv[3]||'/private/tmp/spindle-gltf-tools');
const load=relative=>import(pathToFileURL(path.join(toolchain,'node_modules',relative)).href);
const {NodeIO}=await load('@gltf-transform/core/dist/index.js');
const {flatten,weld,simplifyPrimitive,dedup,prune,getBounds,transformMesh,joinPrimitives}=await load('@gltf-transform/functions/dist/index.js');
const {MeshoptSimplifier}=await load('meshoptimizer/index.js');
await MeshoptSimplifier.ready;
const io=new NodeIO(),doc=await io.read(source);
// This source has material factors only; unused UV seams otherwise prevent
// meshoptimizer from collapsing many visually identical vertices.
if(doc.getRoot().listTextures().length===0)for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
 for(const semantic of p.listSemantics())if(semantic.startsWith('TEXCOORD_'))p.setAttribute(semantic,null);
}
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
await doc.transform(flatten());
const scene=doc.getRoot().listScenes()[0],nodes=scene.listChildren().filter(n=>n.getMesh());
for(const n of nodes){transformMesh(n.getMesh(),n.getWorldMatrix());n.setMatrix(identity);}
const bounds=getBounds(scene),scale=4.75/(bounds.max[2]-bounds.min[2]);
const cx=(bounds.min[0]+bounds.max[0])/2,cz=(bounds.min[2]+bounds.max[2])/2;
const normalize=[scale,0,0,0,0,scale,0,0,0,0,scale,0,-cx*scale,-bounds.min[1]*scale,-cz*scale,1];
for(const n of nodes)transformMesh(n.getMesh(),normalize);

// The source headlights are at +Z; its native forward axis already matches the game.
// Keep the wheel/tire centres before simplification to avoid pivot wobble.
const wheelBounds=new Map();
for(const n of nodes){
 if(!n.getName().includes('tires'))continue;
 const b=getBounds(n),x=(b.min[0]+b.max[0])/2,z=(b.min[2]+b.max[2])/2;
 const key=(z>0?'F':'R')+(x<0?'L':'R');
 if(!wheelBounds.has(key))wheelBounds.set(key,{min:[...b.min],max:[...b.max]});
 else {const out=wheelBounds.get(key);for(let i=0;i<3;i++){out.min[i]=Math.min(out.min[i],b.min[i]);out.max[i]=Math.max(out.max[i],b.max[i]);}}
}
const wheels=Object.fromEntries([...wheelBounds].map(([key,b])=>[key,{center:b.min.map((v,i)=>(v+b.max[i])/2),radius:(b.max[1]-b.min[1])/2}]));
await doc.transform(weld());
// Glossy curved panels need much denser geometry than small hidden hardware.
// A uniform reduction causes visible creases in reflected light on the doors.
const quality={body:[.35,.00025],glass_body:[.35,.0005],fenders:[.15,.001],
 chrome:[.08,.002],black:[.08,.002],wheels:[.06,.001],tires:[.012,.008],
 calipers:[.03,.005],calipers2:[.03,.005]};
for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
 const [ratio,error]=quality[p.getMaterial()?.getName()]||[.05,.003];
 simplifyPrimitive(p,{simplifier:MeshoptSimplifier,ratio,error});
}
const groups=new Map([['Body',[]]]),wheelMaterials=new Set(['metal','alum','calipers','calipers2','brakedsk','wheels','tires']);
const inventory=[];
for(const n of nodes){
 const mesh=n.getMesh(),b=getBounds(n),center=b.min.map((v,i)=>(v+b.max[i])/2);
 const materials=mesh.listPrimitives().map(p=>p.getMaterial()?.getName());
 let key='Body',pivot=[0,0,0];
 if(materials.every(m=>wheelMaterials.has(m))){
  const nearest=Object.entries(wheels).sort((a,b)=>Math.hypot(...a[1].center.map((v,i)=>v-center[i]))-Math.hypot(...b[1].center.map((v,i)=>v-center[i])))[0];
  if(nearest&&Math.hypot(...nearest[1].center.map((v,i)=>v-center[i]))<.48){
   const caliper=materials.some(m=>m?.startsWith('calipers'));
   key=(caliper?'Caliper_':'Wheel_')+nearest[0];pivot=nearest[1].center;
  }
 }
 if(!groups.has(key))groups.set(key,[]);
 if(key!=='Body')transformMesh(mesh,[1,0,0,0,0,1,0,0,0,0,1,0,...pivot.map(v=>-v),1]);
 groups.get(key).push(...mesh.listPrimitives());
 inventory.push({sourceNode:n.getName(),group:key,materials});
}

// Batch static panels by material, but preserve four independently animated wheels.
const root=doc.createNode('Tesla_Model_Y_2021'),steerNodes={};scene.addChild(root);
for(const [key,w] of Object.entries(wheels)){
 const steer=doc.createNode('Steer_'+key).setTranslation(w.center);root.addChild(steer);steerNodes[key]=steer;
}
for(const [name,prims] of groups){
 const byMaterial=new Map();for(const p of prims){const mat=p.getMaterial();if(!byMaterial.has(mat))byMaterial.set(mat,[]);byMaterial.get(mat).push(p);}
 const mesh=doc.createMesh(name);for(const ps of byMaterial.values())mesh.addPrimitive(joinPrimitives(ps));
 const node=doc.createNode(name).setMesh(mesh);
 if(name==='Body')root.addChild(node);else steerNodes[name.slice(-2)].addChild(node);
}
for(const n of nodes){const mesh=n.getMesh();n.dispose();mesh.dispose();}
await doc.transform(weld(),dedup(),prune());
const target='dist/assets/models/tesla-model-y';await fs.mkdir(target,{recursive:true});
const output=path.join(target,'model-y.glb');await io.write(output,doc);
let triangles=0,primitives=0;for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives()){triangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;primitives++;}
const bytes=await fs.readFile(output);
const metadata={title:'Tesla Model Y 2021',author:'763468712',source:'https://sketchfab.com/3d-models/tesla-model-y-2021-c0a86cac582d4b33aba0fb1b1912d970',download:'https://s3-eu-west-1.amazonaws.com/fetchcfd/original/file-1683824914671.zip',license:'CC-BY-4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',changes:'Geometry simplified with meshoptimizer; original transforms baked; normalized to 4.75 metres long, Y up, +Z forward; panels batched by material; wheel and caliper pivots separated. Original paint/material names retained for runtime PBR adjustments.',bounds:getBounds(scene),triangles,primitives,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),wheels,inventory};
await fs.writeFile(path.join(target,'asset.json'),JSON.stringify(metadata,null,2)+'\n');
await fs.copyFile(path.join(path.dirname(source),'license.txt'),path.join(target,'LICENSE.txt'));
console.log(JSON.stringify({triangles,primitives,bytes:bytes.length,bounds:metadata.bounds,wheels},null,2));
