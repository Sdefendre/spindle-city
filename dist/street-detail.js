import * as T from './vendor/three.module.js';
const S=1/1.5;
export function addStreetDetail(scene,Geo=window.Geo){
 const batches=new Map(),colliders=[];
 function addBox(w,h,d,color,x,y,z,angle=0){
  if(!batches.has(color))batches.set(color,{geometry:new T.BoxGeometry(1,1,1),material:new T.MeshStandardMaterial({color,roughness:color==='#9e9f98'?.92:.84,metalness:color==='#404b4a'||color==='#687075'?.55:0}),items:[]});
  batches.get(color).items.push({x,y,z,angle,w,h,d});
 }
 const junctions=new Map();
 for(const r of Geo.roads){if(!r.drive||r.type.includes('motorway'))continue;for(const p of [r.p[0],r.p.at(-1)]){const k=Math.round(p[0])+','+Math.round(p[1]);if(!junctions.has(k))junctions.set(k,[]);junctions.get(k).push(r)}}

 // Wooden utility poles + crossarms + overhead sagging catenary power lines along streets
 // (an unmistakable visual signature of real New England Google Street View footage).
 const poleItems=[],crossarmItems=[],transformerItems=[],wirePositions=[];
 function addWire(a,b,sag=.55){
  const steps=5;
  for(let s=0;s<steps;s++){
   const t0=s/steps,t1=(s+1)/steps;
   const y0=a.y+(b.y-a.y)*t0-4*sag*t0*(1-t0);
   const y1=a.y+(b.y-a.y)*t1-4*sag*t1*(1-t1);
   wirePositions.push(a.x+(b.x-a.x)*t0,y0,a.z+(b.z-a.z)*t0,a.x+(b.x-a.x)*t1,y1,a.z+(b.z-a.z)*t1);
  }
 }

 let index=0;
 for(const r of Geo.roads){
  if(!r.drive||!r.name||r.type==='service')continue;
  index++;
  // Weathered granite curbs along road edges.
  for(let j=1;j<r.p.length;j++){
   const a=r.p[j-1],b=r.p[j],dx=(b[0]-a[0])*S,dz=(b[1]-a[1])*S,len=Math.hypot(dx,dz);
   if(len<3)continue;
   const angle=Math.atan2(dx,dz),nx=-dz/len,nz=dx/len,mx=(a[0]+b[0])*S/2,mz=(a[1]+b[1])*S/2;
   for(const side of [-1,1]){
    const off=r.width*S/2+.13,px=mx+nx*off*side,pz=mz+nz*off*side,near=Geo.nearestRoad(px/S,pz/S,true);
    if(near.r.id!==r.id&&near.distance<near.r.width/2)continue;
    addBox(.23,.17,Math.max(.1,len-.15),'#9e9f98',px,.10,pz,angle);
   }
  }
  // Utility poles & overhead wires on arterials/collectors and every other local street.
  const isMain=r.type==='primary'||r.type==='secondary'||r.type==='tertiary';
  if(!r.type.includes('motorway')&&!r.type.includes('trunk')&&(isMain||index%2===0)){
   let roadLen=0;
   for(let j=1;j<r.p.length;j++)roadLen+=Math.hypot(r.p[j][0]-r.p[j-1][0],r.p[j][1]-r.p[j-1][1]);
   if(roadLen>36){
    const spacing=38,roadPoles=[],side=index%2===0?1:-1;
    let dist=12;
    while(dist<roadLen-8&&poleItems.length<850){
     const p=Geo.routePoint(r,dist),nx=-Math.sin(p.angle),nz=Math.cos(p.angle);
     const off=r.width*S/2+1.2,x=p.x*S+nx*off*side,z=p.y*S+nz*off*side;
     if(!Geo.blocked(x/S,z/S)){
      const yaw=Math.PI/2-p.angle;
      poleItems.push({x,z,yaw});
      crossarmItems.push({x,z,yaw,nx,nz});
      if(poleItems.length%4===0)transformerItems.push({x:x-nx*side*.24,z:z-nz*side*.24,yaw});
      colliders.push({x,z,radius:.18,kind:'utility pole'});
      roadPoles.push({x,z,nx,nz});
     }
     dist+=spacing;
    }
    for(let k=1;k<roadPoles.length;k++){
     const p0=roadPoles[k-1],p1=roadPoles[k];
     if(Math.hypot(p1.x-p0.x,p1.z-p0.z)>55)continue;
     for(const armOff of [-.72,0,.72]){
      addWire(
       {x:p0.x+p0.nx*armOff,y:8.55,z:p0.z+p0.nz*armOff},
       {x:p1.x+p1.nx*armOff,y:8.55,z:p1.z+p1.nz*armOff},
       .52
      );
     }
     // Lower neutral/telecom line.
     addWire({x:p0.x,y:6.95,z:p0.z},{x:p1.x,y:6.95,z:p1.z},.42);
    }
   }
  }
  if(index%3)continue;
  const p=Geo.routePoint(r,18),angle=Math.PI/2-p.angle,nx=-Math.sin(p.angle),nz=Math.cos(p.angle),offset=r.width*S/2+1.05,x=p.x*S+nx*offset,z=p.y*S+nz*offset;
  if(Geo.blocked(x/S,z/S))continue;
  if(index%9===0){
   const long=1.65;
   for(let j=0;j<5;j++)addBox(long,.045,.075,'#725e48',x,.52,z+(j-2)*.09,angle);
   for(const side of [-1,1])addBox(.05,.52,.46,'#404b4a',x+Math.cos(angle)*side*.64,.26,z-Math.sin(angle)*side*.64,angle);
   colliders.push({x,z,radius:.8});
  }else if(index%6===0){
   addBox(.42,.8,.42,'#404b4a',x,.43,z,angle);addBox(.47,.08,.47,'#4f5a55',x,.87,z,angle);colliders.push({x,z,radius:.35});
  }else{
   addBox(.20,.58,.2,'#9c3c2f',x,.35,z);addBox(.32,.13,.18,'#b59862',x,.47,z);addBox(.23,.08,.23,'#b59862',x,.68,z);colliders.push({x,z,radius:.22});
  }
  const gx=p.x*S-nx*(r.width*S/2-.35),gz=p.y*S-nz*(r.width*S/2-.35);
  addBox(.48,.012,.70,'#404b4a',gx,.083,gz,angle);
  for(let b=0;b<6;b++)addBox(.34,.012,.025,'#202628',gx,.091,gz+(b-2.5)*.09,angle);
 }

 // Crosswalks & red octagonal STOP signs at mapped multi-way intersections.
 let crossCount=0;const stopSigns=[];
 for(const [k,rs] of junctions){
  if(rs.length<3||crossCount>150)continue;
  const [x,y]=k.split(',').map(Number);const names=new Set(rs.map(r=>r.name));if(names.size<2)continue;
  crossCount++;const seen=[];
  for(const r of rs){
   const atStart=Math.hypot(r.p[0][0]-x,r.p[0][1]-y)<3,other=atStart?r.p[1]:r.p.at(-2);
   let dx=other[0]-x,dz=other[1]-y,len=Math.hypot(dx,dz);if(!len)continue;
   dx/=len;dz/=len;const angle=Math.atan2(dx,dz);
   if(seen.some(a=>Math.abs(Math.sin(a-angle))<.1))continue;
   seen.push(angle);
   const roadHalf=r.width*S/2,forward=roadHalf+3;
   for(let b=-roadHalf+.5;b<roadHalf;b+=1.1){
    const xx=x*S+dx*forward+dz*b,zz=y*S+dz*forward-dx*b;
    addBox(.48,.008,2.4,'#ccc9bc',xx,.088,zz,angle);
   }
   if(stopSigns.length<120){
    const sx=x*S+dx*(roadHalf+4.2)+dz*(roadHalf+.85),sz=y*S+dz*(roadHalf+4.2)-dx*(roadHalf+.85);
    if(!Geo.blocked(sx/S,sz/S))stopSigns.push({x:sx,z:sz,angle});
   }
  }
 }

 const o=new T.Object3D();
 for(const b of batches.values()){
  const mesh=new T.InstancedMesh(b.geometry,b.material,b.items.length);
  for(let i=0;i<b.items.length;i++){const p=b.items[i];o.position.set(p.x,p.y,p.z);o.rotation.set(0,p.angle,0);o.scale.set(p.w,p.h,p.d);o.updateMatrix();mesh.setMatrixAt(i,o.matrix)}
  mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
 }
 // Instanced wooden utility poles, crossarms, pole transformers, and overhead lines.
 if(poleItems.length){
  const wood=new T.MeshStandardMaterial({color:'#4c4036',roughness:.95});
  const poleMesh=new T.InstancedMesh(new T.CylinderGeometry(.11,.16,9.2,7),wood,poleItems.length);
  for(let i=0;i<poleItems.length;i++){o.position.set(poleItems[i].x,4.6,poleItems[i].z);o.rotation.set(0,poleItems[i].yaw,0);o.scale.set(1,1,1);o.updateMatrix();poleMesh.setMatrixAt(i,o.matrix)}
  poleMesh.castShadow=true;poleMesh.receiveShadow=true;scene.add(poleMesh);
  const armMesh=new T.InstancedMesh(new T.BoxGeometry(1.85,.12,.12),wood,crossarmItems.length);
  for(let i=0;i<crossarmItems.length;i++){o.position.set(crossarmItems[i].x,8.48,crossarmItems[i].z);o.rotation.set(0,crossarmItems[i].yaw,0);o.scale.set(1,1,1);o.updateMatrix();armMesh.setMatrixAt(i,o.matrix)}
  armMesh.castShadow=true;scene.add(armMesh);
 }
 if(transformerItems.length){
  const trMesh=new T.InstancedMesh(new T.CylinderGeometry(.22,.22,.78,8),new T.MeshStandardMaterial({color:'#6e7478',roughness:.62,metalness:.35}),transformerItems.length);
  for(let i=0;i<transformerItems.length;i++){o.position.set(transformerItems[i].x,7.45,transformerItems[i].z);o.rotation.set(0,transformerItems[i].yaw,0);o.scale.set(1,1,1);o.updateMatrix();trMesh.setMatrixAt(i,o.matrix)}
  trMesh.castShadow=true;scene.add(trMesh);
 }
 if(wirePositions.length){
  const wireGeo=new T.BufferGeometry();
  wireGeo.setAttribute('position',new T.Float32BufferAttribute(wirePositions,3));
  const wires=new T.LineSegments(wireGeo,new T.LineBasicMaterial({color:'#1d2023',transparent:true,opacity:.78}));
  scene.add(wires);
 }
 // Instanced STOP signs (galvanized post + red octagon face).
 if(stopSigns.length){
  const postMat=new T.MeshStandardMaterial({color:'#7d858a',metalness:.65,roughness:.42});
  const postMesh=new T.InstancedMesh(new T.CylinderGeometry(.032,.032,2.55,6),postMat,stopSigns.length);
  for(let i=0;i<stopSigns.length;i++){o.position.set(stopSigns[i].x,1.28,stopSigns[i].z);o.rotation.set(0,0,0);o.scale.set(1,1,1);o.updateMatrix();postMesh.setMatrixAt(i,o.matrix)}
  postMesh.castShadow=true;scene.add(postMesh);
  const sc=document.createElement('canvas');sc.width=sc.height=128;const sx=sc.getContext('2d');
  sx.fillStyle='#a82024';sx.fillRect(0,0,128,128);sx.strokeStyle='#e8e6df';sx.lineWidth=7;sx.strokeRect(10,10,108,108);
  sx.fillStyle='#f0eee8';sx.font='700 32px sans-serif';sx.textAlign='center';sx.textBaseline='middle';sx.fillText('STOP',64,66);
  const sTex=new T.CanvasTexture(sc);sTex.colorSpace=T.SRGBColorSpace;
  const oct=new T.CircleGeometry(.34,8);oct.rotateZ(Math.PI/8);
  const signMat=new T.MeshStandardMaterial({map:sTex,roughness:.45,side:T.DoubleSide});
  const signMesh=new T.InstancedMesh(oct,signMat,stopSigns.length);
  for(let i=0;i<stopSigns.length;i++){o.position.set(stopSigns[i].x,2.35,stopSigns[i].z);o.rotation.set(0,stopSigns[i].angle,0);o.scale.set(1,1,1);o.updateMatrix();signMesh.setMatrixAt(i,o.matrix)}
  signMesh.castShadow=true;scene.add(signMesh);
 }
 return{colliders};
}
