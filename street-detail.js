import * as T from './vendor/three.module.js';
const S=1/1.5;

export function addStreetDetail(scene,Geo=window.Geo){
 const batches=new Map(),colliders=[];
 function addBox(w,h,d,color,x,y,z,angle=0,extra={}){
  const key=color+(extra.emissive||'')+(extra.flat?'|f':'');
  if(!batches.has(key)){
   batches.set(key,{
    geometry:new T.BoxGeometry(1,1,1),
    material:new T.MeshStandardMaterial({
     color,
     roughness:extra.roughness??.82,
     metalness:extra.metalness??(color==='#404b4a'?.65:0),
     emissive:extra.emissive||'#000000',
     emissiveIntensity:extra.emissiveIntensity||0,
    }),
    flat:!!extra.flat,
    items:[],
   });
  }
  batches.get(key).items.push({x,y,z,angle,w,h,d});
 }

 const junctions=new Map();
 for(let r of Geo.roads){
  if(!r.drive||r.type.includes('motorway'))continue;
  for(let p of [r.p[0],r.p.at(-1)]){
   let k=Math.round(p[0])+','+Math.round(p[1]);
   if(!junctions.has(k))junctions.set(k,[]);
   junctions.get(k).push(r);
  }
 }

 let index=0;
 for(const r of Geo.roads){
  if(!r.drive||!r.name||r.type==='service')continue;
  index++;
  for(let j=1;j<r.p.length;j++){
   let a=r.p[j-1],b=r.p[j],dx=(b[0]-a[0])*S,dz=(b[1]-a[1])*S,len=Math.hypot(dx,dz);
   if(len<5.2)continue;
   // Trim curb ends back by 2.4m from every segment endpoint so curbs NEVER cut across intersecting streets!
   const trim=Math.min(2.4,len*0.28);
   const usable=len-trim*2;
   if(usable<1.2)continue;
   let angle=Math.atan2(dx,dz),ux=dx/len,uz=dz/len,nx=-uz,nz=ux;
   let mx=(a[0]+b[0])*S/2,mz=(a[1]+b[1])*S/2;
   for(let side of [-1,1]){
    let off=r.width*S/2+.14;
    let px=mx+nx*off*side,pz=mz+nz*off*side;
    // Check midpoint AND both endpoints against crossing roads
    let p1x=px-ux*(usable*0.46),p1z=pz-uz*(usable*0.46);
    let p2x=px+ux*(usable*0.46),p2z=pz+uz*(usable*0.46);
    let blocked=false;
    for(const [tx,tz] of [[px,pz],[p1x,p1z],[p2x,p2z]]){
     let near=Geo.nearestRoad(tx/S,tz/S,true);
     if(near.r.id!==r.id&&near.distance<near.r.width/2+1.2){blocked=true;break;}
    }
    if(blocked)continue;
    addBox(.22,.15,usable,'#b6b7ac',px,.09,pz,angle,{flat:true});
   }
  }
  if(index%3)continue;
  let p=Geo.routePoint(r,18),angle=Math.PI/2-p.angle,nx=-Math.sin(p.angle),nz=Math.cos(p.angle),offset=r.width*S/2+1.05,x=p.x*S+nx*offset,z=p.y*S+nz*offset;
  if(Geo.blocked(x/S,z/S))continue;
  if(index%9===0){const long=1.65;for(let j=0;j<5;j++)addBox(long,.045,.075,'#84694c',x,.52,z+(j-2)*.09,angle);for(let side of [-1,1]){addBox(.05,.52,.46,'#404b4a',x+Math.cos(angle)*side*.64,.26,z-Math.sin(angle)*side*.64,angle)}colliders.push({x,z,radius:.8});}
  else if(index%6===0){addBox(.42,.8,.42,'#404b4a',x,.43,z,angle);addBox(.47,.08,.47,'#55645b',x,.87,z,angle);colliders.push({x,z,radius:.35})}
  else{addBox(.20,.58,.2,'#a74b38',x,.35,z);addBox(.32,.13,.18,'#c8a05a',x,.47,z);addBox(.23,.08,.23,'#c8a05a',x,.68,z);colliders.push({x,z,radius:.22})}
  const gx=p.x*S-nx*(r.width*S/2-.35),gz=p.y*S-nz*(r.width*S/2-.35);
  addBox(.48,.012,.70,'#404b4a',gx,.083,gz,angle,{flat:true});
  for(let b=0;b<6;b++)addBox(.34,.012,.025,'#202d2d',gx,.091,gz+(b-2.5)*.09,angle,{flat:true});
 }

 // Crosswalk markings, stop bars, and realistic Traffic Signal Mast Arms at major multi-way junctions!
 let crossCount=0,signalCount=0;
 for(const [k,rs] of junctions){
  if(rs.length<3||crossCount>170)continue;
  let [x,y]=k.split(',').map(Number);
  let names=new Set(rs.map(r=>r.name));
  if(names.size<2)continue;
  crossCount++;
  let seen=[];
  for(let r of rs){
   let atStart=Math.hypot(r.p[0][0]-x,r.p[0][1]-y)<3,other=atStart?r.p[1]:r.p.at(-2),dx=other[0]-x,dz=other[1]-y,len=Math.hypot(dx,dz);
   if(!len)continue;
   dx/=len;dz/=len;
   let angle=Math.atan2(dx,dz);
   if(seen.some(a=>Math.abs(Math.sin(a-angle))<.1))continue;
   seen.push(angle);
   let roadHalf=r.width*S/2,forward=roadHalf+3.2;
   // Zebra crosswalk stripes
   for(let b=-roadHalf+.55;b<roadHalf-.2;b+=1.1){
    let xx=x*S+dx*forward+dz*b,zz=y*S+dz*forward-dx*b;
    addBox(.48,.008,2.3,'#dbd9c8',xx,.086,zz,angle,{flat:true});
   }
   // Crisp white stop bar behind crosswalk
   const stopFwd=forward+2.4;
   addBox(roadHalf*0.92,.008,.36,'#e4e2d5',x*S+dx*stopFwd+dz*(roadHalf*0.45),0.086,y*S+dz*stopFwd-dx*(roadHalf*0.45),angle,{flat:true});

   // Traffic Signal Mast Arm on the right corner of major intersections (first 2 approaches)
   if(signalCount<75&&seen.length<=2){
    signalCount++;
    const poleOff=roadHalf+1.1;
    const px=x*S+dx*(roadHalf+1.4)+dz*poleOff;
    const pz=y*S+dz*(roadHalf+1.4)-dx*poleOff;
    // Vertical steel pole
    addBox(.20,6.2,.20,'#2c3338',px,3.1,pz,angle,{metalness:.65,roughness:.45});
    // Horizontal cantilevered mast arm overhanging lane
    const armLen=Math.min(5.2,roadHalf+1.4);
    const ax=px-dz*(armLen*0.5),az=pz+dx*(armLen*0.5);
    addBox(armLen,.16,.16,'#2c3338',ax,5.9,az,angle,{metalness:.65,roughness:.45});
    // Signal housing box + glowing LED green/red lens!
    const hx=px-dz*(armLen*0.78),hz=pz+dx*(armLen*0.78);
    addBox(.36,1.02,.32,'#191d22',hx,5.32,hz,angle,{roughness:.5});
    const isGreen=(seen.length%2===1);
    addBox(.20,.20,.36,isGreen?'#2ef58b':'#ff3b30',hx,isGreen?5.02:5.62,hz,angle,{
     emissive:isGreen?'#22ee7a':'#ff2d20',
     emissiveIntensity:2.6,
     roughness:.2,
    });
    colliders.push({x:px,z:pz,radius:.22});
   }
  }
 }

 const o=new T.Object3D();
 for(const b of batches.values()){
  let mesh=new T.InstancedMesh(b.geometry,b.material,b.items.length);
  for(let i=0;i<b.items.length;i++){
   let p=b.items[i];
   o.position.set(p.x,p.y,p.z);
   o.rotation.set(0,p.angle,0);
   o.scale.set(p.w,p.h,p.d);
   o.updateMatrix();
   mesh.setMatrixAt(i,o.matrix);
  }
  mesh.castShadow=!b.flat;
  mesh.receiveShadow=true;
  scene.add(mesh);
 }
 return{colliders};
}
