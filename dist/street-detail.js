import * as T from './vendor/three.module.js';
const S=1/1.5;
export function addStreetDetail(scene,Geo=window.Geo){
const batches=new Map(),colliders=[];let seed=31;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
function addBox(w,h,d,color,x,y,z,angle=0){let key=color;if(!batches.has(key))batches.set(key,{geometry:new T.BoxGeometry(1,1,1),material:new T.MeshStandardMaterial({color,roughness:.83,metalness:color==='#404b4a'?.65:0}),items:[]});batches.get(key).items.push({x,y,z,angle,w,h,d})}
const junctions=new Map();for(let r of Geo.roads){if(!r.drive||r.type.includes('motorway'))continue;for(let p of [r.p[0],r.p.at(-1)]){let k=Math.round(p[0])+','+Math.round(p[1]);if(!junctions.has(k))junctions.set(k,[]);junctions.get(k).push(r)}}
let index=0;for(const r of Geo.roads){if(!r.drive||!r.name||r.type==='service')continue;index++;
for(let j=1;j<r.p.length;j++){let a=r.p[j-1],b=r.p[j],dx=(b[0]-a[0])*S,dz=(b[1]-a[1])*S,len=Math.hypot(dx,dz);if(len<3)continue;let angle=Math.atan2(dx,dz),nx=-dz/len,nz=dx/len,mx=(a[0]+b[0])*S/2,mz=(a[1]+b[1])*S/2;for(let side of [-1,1]){let off=r.width*S/2+.13;let px=mx+nx*off*side,pz=mz+nz*off*side,near=Geo.nearestRoad(px/S,pz/S,true);if(near.r.id!==r.id&&near.distance<near.r.width/2)continue;addBox(.23,.17,Math.max(.1,len-.15),'#b5b6aa',px,.10,pz,angle)}}
if(index%3)continue;let p=Geo.routePoint(r,18),angle=Math.PI/2-p.angle,nx=-Math.sin(p.angle),nz=Math.cos(p.angle),offset=r.width*S/2+1.05,x=p.x*S+nx*offset,z=p.y*S+nz*offset;
if(Geo.blocked(x/S,z/S))continue;
// A bench, litter bin and fire hydrant at selected clear sidewalk locations.
if(index%9===0){const long=1.65;for(let j=0;j<5;j++)addBox(long,.045,.075,'#84694c',x,.52,z+(j-2)*.09,angle);for(let side of [-1,1]){addBox(.05,.52,.46,'#404b4a',x+Math.cos(angle)*side*.64,.26,z-Math.sin(angle)*side*.64,angle)}colliders.push({x,z,radius:.8});}
else if(index%6===0){addBox(.42,.8,.42,'#404b4a',x,.43,z,angle);addBox(.47,.08,.47,'#55645b',x,.87,z,angle);colliders.push({x,z,radius:.35})}
else{addBox(.20,.58,.2,'#a75b3e',x,.35,z);addBox(.32,.13,.18,'#b89151',x,.47,z);addBox(.23,.08,.23,'#b89151',x,.68,z);colliders.push({x,z,radius:.22})}
const gx=p.x*S-nx*(r.width*S/2-.35),gz=p.y*S-nz*(r.width*S/2-.35);addBox(.48,.012,.70,'#404b4a',gx,.083,gz,angle);for(let b=0;b<6;b++)addBox(.34,.012,.025,'#202d2d',gx,.091,gz+(b-2.5)*.09,angle);
}
// Crosswalk markings at mapped multi-way junctions, positioned on each road approach.
let crossCount=0;for(const [k,rs] of junctions){if(rs.length<3||crossCount>150)continue;let [x,y]=k.split(',').map(Number);let names=new Set(rs.map(r=>r.name));if(names.size<2)continue;crossCount++;let seen=[];for(let r of rs){let atStart=Math.hypot(r.p[0][0]-x,r.p[0][1]-y)<3,other=atStart?r.p[1]:r.p.at(-2),dx=other[0]-x,dz=other[1]-y,len=Math.hypot(dx,dz);if(!len)continue;dx/=len;dz/=len;let angle=Math.atan2(dx,dz);if(seen.some(a=>Math.abs(Math.sin(a-angle))<.1))continue;seen.push(angle);let roadHalf=r.width*S/2,forward=roadHalf+3;for(let b=-roadHalf+.5;b<roadHalf;b+=1.1){let xx=x*S+dx*forward+dz*b,zz=y*S+dz*forward-dx*b;addBox(.48,.008,2.4,'#d7d5c1',xx,.088,zz,angle)}}}
const o=new T.Object3D();for(const b of batches.values()){let mesh=new T.InstancedMesh(b.geometry,b.material,b.items.length);for(let i=0;i<b.items.length;i++){let p=b.items[i];o.position.set(p.x,p.y,p.z);o.rotation.set(0,p.angle,0);o.scale.set(p.w,p.h,p.d);o.updateMatrix();mesh.setMatrixAt(i,o.matrix)}mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh)}
return{colliders};
}
