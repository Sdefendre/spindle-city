import * as T from './vendor/three.module.js';
const S=1/1.5;

export function addStreetDetail(scene,Geo=window.Geo){
 const gy=(x,z)=>Geo.groundY?Geo.groundY(x,z):0;
 const batches=new Map(),colliders=[];
 function addBox(w,h,d,color,x,y,z,angle=0,extra={}){
  const key=color+(extra.emissive||'')+(extra.flat?'|f':'');
  if(!batches.has(key)){
   batches.set(key,{
    geometry:new T.BoxGeometry(1,1,1),
    material:new T.MeshStandardMaterial({
     color,
     roughness:extra.roughness??(color==='#9e9f98'?.92:.82),
     metalness:extra.metalness??(color==='#404b4a'||color==='#687075'?.58:0),
     emissive:extra.emissive||'#000000',
     emissiveIntensity:extra.emissiveIntensity||0,
    }),
    flat:!!extra.flat,
    items:[],
   });
  }
  batches.get(key).items.push({x,y:y+gy(x,z),z,angle,w,h,d});
 }

 // Animated traffic signal lenses (red / amber / green) share one unlit instanced mesh.
 const heads=[];
 const hash=(a,b)=>{let h=(a*374761393+b*668265263)>>>0;h=((h^(h>>>13))*1274126177)>>>0;return (h^(h>>>16))>>>0};

 // Wooden utility poles + crossarms + pole transformers + sagging overhead power lines
 // (classic New England Street View silhouette, draped onto real USGS 3DEP terrain).
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
   // Trim curb ends back from every segment endpoint so curbs never cut across intersecting streets.
   const trim=Math.min(2.4,len*0.28);
   const usable=len-trim*2;
   if(usable<1.2)continue;
   let angle=Math.atan2(dx,dz),ux=dx/len,uz=dz/len,nx=-uz,nz=ux;
   for(let side of [-1,1]){
    let off=r.width*S/2+.14;
    // Weathered granite curbs laid in <=8 m pieces so they hug Fall River hills cleanly.
    const pieces=Math.max(1,Math.ceil(usable/8)),pl=usable/pieces;
    for(let k=0;k<pieces;k++){
     const along=-len/2+trim+pl*(k+.5);
     const px=(a[0]+b[0])*S/2+ux*along+nx*off*side,pz=(a[1]+b[1])*S/2+uz*along+nz*off*side;
     const p1x=px-ux*pl*.46,p1z=pz-uz*pl*.46,p2x=px+ux*pl*.46,p2z=pz+uz*pl*.46;
     let blocked=false;
     for(const [tx,tz] of [[px,pz],[p1x,p1z],[p2x,p2z]]){
      let near=Geo.nearestRoad(tx/S,tz/S,true);
      if(near.r.id!==r.id&&near.distance<near.r.width/2+1.2){blocked=true;break;}
     }
     if(blocked)continue;
     addBox(.23,.16,pl,'#9e9f98',px,.095,pz,angle,{flat:true});
    }
   }
  }

  // Wooden utility poles & sagging catenary wires on arterials/collectors and alternating local streets.
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
      const yaw=Math.PI/2-p.angle,baseY=gy(x,z);
      poleItems.push({x,y:baseY,z,yaw});
      crossarmItems.push({x,y:baseY,z,yaw,nx,nz});
      if(poleItems.length%4===0)transformerItems.push({x:x-nx*side*.24,y:baseY,z:z-nz*side*.24,yaw});
      colliders.push({x,z,radius:.18,kind:'utility pole'});
      roadPoles.push({x,y:baseY,z,nx,nz});
     }
     dist+=spacing;
    }
    for(let k=1;k<roadPoles.length;k++){
     const p0=roadPoles[k-1],p1=roadPoles[k];
     if(Math.hypot(p1.x-p0.x,p1.z-p0.z)>55)continue;
     for(const armOff of [-.72,0,.72]){
      addWire(
       {x:p0.x+p0.nx*armOff,y:p0.y+8.55,z:p0.z+p0.nz*armOff},
       {x:p1.x+p1.nx*armOff,y:p1.y+8.55,z:p1.z+p1.nz*armOff},
       .52
      );
     }
     // Lower neutral/telecom cable.
     addWire({x:p0.x,y:p0.y+6.95,z:p0.z},{x:p1.x,y:p1.y+6.95,z:p1.z},.42);
    }
   }
  }

  if(index%3)continue;
  let p=Geo.routePoint(r,18),angle=Math.PI/2-p.angle,nx=-Math.sin(p.angle),nz=Math.cos(p.angle),offset=r.width*S/2+1.05,x=p.x*S+nx*offset,z=p.y*S+nz*offset;
  if(Geo.blocked(x/S,z/S))continue;
  if(index%9===0){const long=1.65;for(let j=0;j<5;j++)addBox(long,.045,.075,'#725e48',x,.52,z+(j-2)*.09,angle);for(let side of [-1,1]){addBox(.05,.52,.46,'#404b4a',x+Math.cos(angle)*side*.64,.26,z-Math.sin(angle)*side*.64,angle)}colliders.push({x,z,radius:.8});}
  else if(index%6===0){addBox(.42,.8,.42,'#404b4a',x,.43,z,angle);addBox(.47,.08,.47,'#4f5a55',x,.87,z,angle);colliders.push({x,z,radius:.35})}
  else{addBox(.20,.58,.2,'#9c3c2f',x,.35,z);addBox(.32,.13,.18,'#b59862',x,.47,z);addBox(.23,.08,.23,'#b59862',x,.68,z);colliders.push({x,z,radius:.22})}
  const gx=p.x*S-nx*(r.width*S/2-.35),gz=p.y*S-nz*(r.width*S/2-.35);
  addBox(.48,.012,.70,'#404b4a',gx,.083,gz,angle,{flat:true});
  for(let b=0;b<6;b++)addBox(.34,.012,.025,'#202628',gx,.091,gz+(b-2.5)*.09,angle,{flat:true});
 }

 // Crosswalks, stop bars, animated traffic signals, and red octagonal STOP signs at junctions.
 let crossCount=0,signalCount=0;
 const stopSigns=[];
 for(const [k,rs] of junctions){
  if(rs.length<3||crossCount>170)continue;
  let [x,y]=k.split(',').map(Number);
  let names=new Set(rs.map(r=>r.name));
  if(names.size<2)continue;
  crossCount++;
  const phase0=hash(x|0,y|0)%24;
  let seen=[];
  for(let r of rs){
   let atStart=Math.hypot(r.p[0][0]-x,r.p[0][1]-y)<3,other=atStart?r.p[1]:r.p.at(-2),dx=other[0]-x,dz=other[1]-y,len=Math.hypot(dx,dz);
   if(!len)continue;
   dx/=len;dz/=len;
   let angle=Math.atan2(dx,dz);
   if(seen.some(a=>Math.abs(Math.sin(a-angle))<.1))continue;
   seen.push(angle);
   let roadHalf=r.width*S/2,forward=roadHalf+3.2;
   for(let b=-roadHalf+.55;b<roadHalf-.2;b+=1.1){
    let xx=x*S+dx*forward+dz*b,zz=y*S+dz*forward-dx*b;
    addBox(.48,.008,2.3,'#ccc9bc',xx,.086,zz,angle,{flat:true});
   }
   const stopFwd=forward+2.4;
   addBox(roadHalf*0.92,.008,.36,'#d8d5c9',x*S+dx*stopFwd+dz*(roadHalf*0.45),0.086,y*S+dz*stopFwd-dx*(roadHalf*0.45),angle,{flat:true});

   if(signalCount<75&&seen.length<=2){
    signalCount++;
    const poleOff=roadHalf+1.1;
    const px=x*S+dx*(roadHalf+1.4)+dz*poleOff;
    const pz=y*S+dz*(roadHalf+1.4)-dx*poleOff;
    addBox(.20,6.2,.20,'#2c3338',px,3.1,pz,angle,{metalness:.65,roughness:.45});
    const armLen=Math.min(5.2,roadHalf+1.4);
    const ax=px-dz*(armLen*0.5),az=pz+dx*(armLen*0.5);
    addBox(armLen,.16,.16,'#2c3338',ax,5.9,az,angle,{metalness:.65,roughness:.45});
    const hx=px-dz*(armLen*0.78),hz=pz+dx*(armLen*0.78);
    addBox(.36,1.02,.32,'#191d22',hx,5.32,hz,angle,{roughness:.5});
    heads.push({x:hx,z:hz,y:gy(hx,hz),angle,phase:(phase0+(seen.length%2)*12)%24,state:-1});
    colliders.push({x:px,z:pz,radius:.22});
   }else if(stopSigns.length<120){
    const sx=x*S+dx*(roadHalf+4.2)+dz*(roadHalf+.85),sz=y*S+dz*(roadHalf+4.2)-dx*(roadHalf+.85);
    if(!Geo.blocked(sx/S,sz/S))stopSigns.push({x:sx,y:gy(sx,sz),z:sz,angle});
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

 // Instanced wooden utility poles, crossarms, pole transformers, and overhead lines.
 if(poleItems.length){
  const wood=new T.MeshStandardMaterial({color:'#4c4036',roughness:.95});
  const poleMesh=new T.InstancedMesh(new T.CylinderGeometry(.11,.16,9.2,7),wood,poleItems.length);
  for(let i=0;i<poleItems.length;i++){o.position.set(poleItems[i].x,poleItems[i].y+4.6,poleItems[i].z);o.rotation.set(0,poleItems[i].yaw,0);o.scale.set(1,1,1);o.updateMatrix();poleMesh.setMatrixAt(i,o.matrix)}
  poleMesh.castShadow=true;poleMesh.receiveShadow=true;scene.add(poleMesh);
  const armMesh=new T.InstancedMesh(new T.BoxGeometry(1.85,.12,.12),wood,crossarmItems.length);
  for(let i=0;i<crossarmItems.length;i++){o.position.set(crossarmItems[i].x,crossarmItems[i].y+8.48,crossarmItems[i].z);o.rotation.set(0,crossarmItems[i].yaw,0);o.scale.set(1,1,1);o.updateMatrix();armMesh.setMatrixAt(i,o.matrix)}
  armMesh.castShadow=true;scene.add(armMesh);
 }
 if(transformerItems.length){
  const trMesh=new T.InstancedMesh(new T.CylinderGeometry(.22,.22,.78,8),new T.MeshStandardMaterial({color:'#6e7478',roughness:.62,metalness:.35}),transformerItems.length);
  for(let i=0;i<transformerItems.length;i++){o.position.set(transformerItems[i].x,transformerItems[i].y+7.45,transformerItems[i].z);o.rotation.set(0,transformerItems[i].yaw,0);o.scale.set(1,1,1);o.updateMatrix();trMesh.setMatrixAt(i,o.matrix)}
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
  for(let i=0;i<stopSigns.length;i++){o.position.set(stopSigns[i].x,stopSigns[i].y+1.28,stopSigns[i].z);o.rotation.set(0,0,0);o.scale.set(1,1,1);o.updateMatrix();postMesh.setMatrixAt(i,o.matrix)}
  postMesh.castShadow=true;scene.add(postMesh);
  const sc=document.createElement('canvas');sc.width=sc.height=128;const sx=sc.getContext('2d');
  sx.fillStyle='#a82024';sx.fillRect(0,0,128,128);sx.strokeStyle='#e8e6df';sx.lineWidth=7;sx.strokeRect(10,10,108,108);
  sx.fillStyle='#f0eee8';sx.font='700 32px sans-serif';sx.textAlign='center';sx.textBaseline='middle';sx.fillText('STOP',64,66);
  const sTex=new T.CanvasTexture(sc);sTex.colorSpace=T.SRGBColorSpace;
  const oct=new T.CircleGeometry(.34,8);oct.rotateZ(Math.PI/8);
  const signMat=new T.MeshStandardMaterial({map:sTex,roughness:.45,side:T.DoubleSide});
  const signMesh=new T.InstancedMesh(oct,signMat,stopSigns.length);
  for(let i=0;i<stopSigns.length;i++){o.position.set(stopSigns[i].x,stopSigns[i].y+2.35,stopSigns[i].z);o.rotation.set(0,stopSigns[i].angle,0);o.scale.set(1,1,1);o.updateMatrix();signMesh.setMatrixAt(i,o.matrix)}
  signMesh.castShadow=true;scene.add(signMesh);
 }

 // Signal lenses: three per head (red top, amber middle, green bottom).
 let lensMesh=null;
 const OFF=new T.Color(.05,.055,.06),RED=new T.Color(3.4,.22,.16),AMBER=new T.Color(3.4,2.1,.18),GREEN=new T.Color(.2,3.0,1.1);
 if(heads.length){
  lensMesh=new T.InstancedMesh(new T.BoxGeometry(.2,.2,.36),new T.MeshBasicMaterial({color:'#ffffff',toneMapped:false}),heads.length*3);
  heads.forEach((h,i)=>{for(let l=0;l<3;l++){o.position.set(h.x,h.y+5.62-l*.30,h.z);o.rotation.set(0,h.angle,0);o.scale.set(1,1,1);o.updateMatrix();lensMesh.setMatrixAt(i*3+l,o.matrix);lensMesh.setColorAt(i*3+l,OFF)}});
  lensMesh.frustumCulled=false;scene.add(lensMesh);
 }
 // 24 s cycle per head: green 0-9.5, amber 9.5-12, red 12-24 (cross street runs 12 s out of phase).
 function update(time){
  if(!lensMesh)return;
  let dirty=false;
  for(let i=0;i<heads.length;i++){
   const h=heads[i],t=(time+h.phase)%24,state=t<9.5?2:t<12?1:0; // 0 red, 1 amber, 2 green
   if(state===h.state)continue;
   h.state=state;dirty=true;
   lensMesh.setColorAt(i*3,state===0?RED:OFF);
   lensMesh.setColorAt(i*3+1,state===1?AMBER:OFF);
   lensMesh.setColorAt(i*3+2,state===2?GREEN:OFF);
  }
  if(dirty&&lensMesh.instanceColor)lensMesh.instanceColor.needsUpdate=true;
 }
 return{colliders,update};
}
