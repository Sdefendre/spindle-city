import * as T from './vendor/three.module.js';
const S=1/1.5;

function makeRoofTexture(renderer){
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');
 ctx.fillStyle='#4a4e52';ctx.fillRect(0,0,256,256);
 let seed=701;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
 // Tar-and-gravel aggregate + roof membrane seams
 for(let y=0;y<256;y+=32){ctx.fillStyle='rgba(20,24,28,0.28)';ctx.fillRect(0,y,256,2);ctx.fillStyle='rgba(255,255,255,0.06)';ctx.fillRect(0,y+2,256,1);}
 for(let i=0;i<4200;i++){
  const x=rnd()*256,y=rnd()*256,v=52+Math.floor(rnd()*46);
  ctx.fillStyle=`rgba(${v},${v+2},${v+4},0.35)`;ctx.fillRect(x,y,2,2);
 }
 const tex=new T.CanvasTexture(c);
 tex.colorSpace=T.SRGBColorSpace;tex.wrapS=tex.wrapT=T.RepeatWrapping;
 tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 return tex;
}

export function addArchitecture(scene,renderer,geo=window.Geo){
 const Geo=geo;
 const loader=new T.TextureLoader();
 function tex(file,color=true){
  let t=loader.load('assets/materials/'+file);
  t.wrapS=t.wrapT=T.RepeatWrapping;
  t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  if(color)t.colorSpace=T.SRGBColorSpace;
  return t;
 }
 const brick=tex('brick-color.jpg'),normal=tex('brick-normal.jpg',false),concrete=tex('concrete-color.jpg');
 const roofTex=makeRoofTexture(renderer);

 const mat={
  brick:new T.MeshStandardMaterial({map:brick,normalMap:normal,normalScale:new T.Vector2(.42,.42),color:'#ffffff',vertexColors:true,roughness:.90,side:T.DoubleSide}),
  stone:new T.MeshStandardMaterial({map:concrete,color:'#ffffff',vertexColors:true,roughness:.88,side:T.DoubleSide}),
  trim:new T.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:.82,side:T.DoubleSide}),
  glass:new T.MeshPhysicalMaterial({color:'#344858',metalness:.14,roughness:.12,envMapIntensity:1.55,vertexColors:true,side:T.DoubleSide,clearcoat:1,clearcoatRoughness:.06}),
  roof:new T.MeshStandardMaterial({map:roofTex,bumpMap:roofTex,bumpScale:.06,color:'#ffffff',vertexColors:true,roughness:.92,side:T.DoubleSide}),
 };

 // Ground-contact AO + subtle vertical rain-streak weathering on masonry & stone
 function addWallWeathering(m,strength=0.22){
  m.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader
    .replace('#include <common>','#include <common>\nattribute float aLocalY;\nvarying vec3 vWallWorld;\nvarying float vLocalY;')
    .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWallWorld=(modelMatrix*vec4(transformed,1.0)).xyz;\nvLocalY=aLocalY;');
   shader.fragmentShader=shader.fragmentShader
    .replace('#include <common>','#include <common>\nvarying vec3 vWallWorld;\nvarying float vLocalY;\nfloat wNoise(vec2 p){return fract(sin(dot(floor(p),vec2(127.1,311.7)))*43758.5453);}')
    .replace('#include <map_fragment>',`#include <map_fragment>
     // Soft sidewalk contact ambient occlusion (bottom 2.4m) + subtle macro grime variation
     float groundAO = mix(${(1-strength).toFixed(2)}, 1.0, smoothstep(0.0, 2.4, vLocalY));
     float macro = 0.90 + 0.16 * sin(vWallWorld.x * 0.17 + vWallWorld.z * 0.13) * cos(vWallWorld.y * 0.22);
     diffuseColor.rgb *= groundAO * macro;
    `);
  };
 }
 addWallWeathering(mat.brick, 0.24);
 mat.stone.bumpMap=concrete;mat.stone.bumpScale=.03;
 mat.stone.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader
   .replace('#include <common>','#include <common>\nattribute float aLocalY;\nvarying vec3 vWallWorld;\nvarying float vLocalY;')
   .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWallWorld=(modelMatrix*vec4(transformed,1.0)).xyz;\nvLocalY=aLocalY;');
  shader.fragmentShader=shader.fragmentShader
   .replace('#include <common>','#include <common>\nvarying vec3 vWallWorld;\nvarying float vLocalY;')
   .replace('#include <map_fragment>',`#ifdef USE_MAP
    vec4 surface = texture2D(map,vMapUv);
    diffuseColor *= mix(vec4(0.88,0.87,0.83,1.0),surface,0.24);
   #endif
   float groundAO = mix(0.78, 1.0, smoothstep(0.0, 2.4, vLocalY));
   diffuseColor.rgb *= groundAO;`);
 };

 // Interior-Mapping Parallax Window Shader (Spider-Man / GTA style fake 3D rooms + blinds + Fresnel sky reflection + warm night glow!)
 const nightUniform={value:0};
 mat.glass.onBeforeCompile=shader=>{
  shader.uniforms.uNight=nightUniform;
  shader.vertexShader=shader.vertexShader
   .replace('#include <common>','#include <common>\nattribute float aLocalY;\nvarying vec3 vWinWorld;\nvarying vec3 vWinNorm;\nvarying float vWinLocalY;')
   .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWinWorld=(modelMatrix*vec4(transformed,1.0)).xyz;\nvWinNorm=normalize(mat3(modelMatrix)*objectNormal);\nvWinLocalY=aLocalY;');
  shader.fragmentShader=shader.fragmentShader
   .replace('#include <common>',`#include <common>
    uniform float uNight;
    varying vec3 vWinWorld;
    varying vec3 vWinNorm;
    varying float vWinLocalY;
    float winHash(vec3 p){return fract(sin(dot(floor(p),vec3(127.1,311.7,74.7)))*43758.5453);}
   `)
   .replace('#include <color_fragment>',`#include <color_fragment>
    // Per-room seed + local room coordinates with view-dependent parallax depth
    vec3 roomCell = vec3(vWinWorld.x * 0.34, vWinLocalY * 0.31, vWinWorld.z * 0.34);
    float seed = winHash(roomCell);
    float isShop = 1.0 - smoothstep(2.6, 3.6, vWinLocalY);
    vec3 viewDir = normalize(cameraPosition - vWinWorld);
    vec3 nrm = normalize(vWinNorm);
    if (dot(nrm, viewDir) < 0.0) nrm = -nrm;

    // Parallax offset into room interior
    vec3 roomUV = fract(roomCell) - 0.5;
    float depthShift = clamp(dot(viewDir, vec3(0.0, 1.0, 0.0)), -0.6, 0.6);
    float roomY = clamp(fract(vWinLocalY * 0.31) - depthShift * 0.25, 0.0, 1.0);
    float horiz = fract((vWinWorld.x + vWinWorld.z) * 0.34);

    // Venetian blinds / curtains on upper 35% of residential/office windows
    float blindDrop = mix(0.18, 0.58, fract(seed * 9.7)) * (1.0 - isShop * 0.8);
    float isBlind = step(1.0 - blindDrop, roomY);
    float slat = 0.85 + 0.15 * sin(vWinLocalY * 55.0);

    // Recessed room back wall + ceiling gradient (proper linear-space dark glass interior!)
    vec3 roomWall = mix(vec3(0.018, 0.024, 0.032), vec3(0.068, 0.056, 0.044), smoothstep(0.15, 0.85, roomY));
    roomWall = mix(roomWall, vec3(0.13, 0.12, 0.10) * slat, isBlind * 0.55);
    // Warm retail depth for ground-floor storefronts
    vec3 shopInterior = mix(vec3(0.035, 0.028, 0.022), vec3(0.11, 0.082, 0.054), smoothstep(0.1, 0.9, roomY));
    vec3 interior = mix(roomWall, shopInterior, isShop);

    // Subtle interior furniture/shelf silhouettes
    float shelf = smoothstep(0.40, 0.48, abs(horiz - 0.5)) * 0.35;
    interior *= (1.0 - shelf);

    // Grazing Fresnel reflection of sky/horizon on exterior glass pane (linear-space values)
    float fresnel = pow(1.0 - clamp(dot(nrm, viewDir), 0.0, 1.0), 3.0);
    vec3 skyRefl = mix(vec3(0.11, 0.17, 0.26), vec3(0.016, 0.024, 0.045), uNight);
    diffuseColor.rgb = mix(interior, skyRefl, clamp(0.14 + fresnel * 0.62, 0.0, 0.80));
   `)
   .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
    vec3 eCell = vec3(vWinWorld.x * 0.34, vWinLocalY * 0.31, vWinWorld.z * 0.34);
    float wh = winHash(eCell);
    float shopFloor = 1.0 - smoothstep(2.6, 3.6, vWinLocalY);
    float ry = fract(vWinLocalY * 0.31);
    float blindMask = 1.0 - step(1.0 - mix(0.15, 0.52, fract(wh * 9.7)) * (1.0 - shopFloor * 0.8), ry) * 0.58;
    float litProb = mix(0.58, 0.35, shopFloor);
    float lit = step(litProb, wh) * (uNight * 0.95 + shopFloor * 0.18);
    vec3 warmTone = mix(vec3(1.25, 0.84, 0.42), vec3(0.86, 0.98, 1.24), step(0.84, wh));
    float ceilGlow = 0.65 + 0.55 * smoothstep(0.15, 0.92, ry);
    totalEmissiveRadiance += warmTone * lit * blindMask * ceilGlow * (0.75 + 0.55 * fract(wh * 17.3));
   `);
 };
 mat.glass.userData.nightUniform=nightUniform;

 // Procedural clapboard siding scaled in metres
 const cc=document.createElement('canvas');cc.width=cc.height=256;let cx=cc.getContext('2d');
 cx.fillStyle='#e0dfd5';cx.fillRect(0,0,256,256);
 for(let y=0;y<256;y+=24){cx.fillStyle='#6e6e63';cx.fillRect(0,y,256,2);cx.fillStyle='#ffffff99';cx.fillRect(0,y+3,256,3);}
 let siding=new T.CanvasTexture(cc);siding.colorSpace=T.SRGBColorSpace;siding.wrapS=siding.wrapT=T.RepeatWrapping;
 mat.siding=new T.MeshStandardMaterial({map:siding,vertexColors:true,color:'#ffffff',roughness:.85,side:T.DoubleSide});
 addWallWeathering(mat.siding, 0.18);

 const batches=new Map(),wallMeshes=[],special=[];let count=0,curGy=0;
 // Collect rooftop prop transforms for 3 batched InstancedMeshes across the whole city (HVAC, skylights, penthouses)
 const roofHvac=[],roofSkylight=[],roofPenthouse=[];
 let propSeed=9109;const pRnd=()=>{propSeed=(propSeed*1664525+1013904223)>>>0;return propSeed/4294967296};

 function b(key,type){let k=key+'|'+type;if(!batches.has(k))batches.set(k,{p:[],uv:[],c:[],ly:[],type});return batches.get(k)}
 function tri(out,a,b,c,color,uv=[[0,0],[1,0],[0,1]]){out.p.push(...a,...b,...c);out.ly.push(a[1],b[1],c[1]);for(let i=0;i<3;i++){out.c.push(color.r,color.g,color.b);out.uv.push(...uv[i])}}
 function quad(out,a,b,c,d,color,u=1,v=1){tri(out,a,b,c,color,[[0,0],[u,0],[u,v]]);tri(out,a,c,d,color,[[0,0],[u,v],[0,v]])}
 const C=x=>new T.Color(x),stone=C('#d2c7ad'),roofColor=C('#6d7276');
 function edges(p){let area=0;for(let i=0;i<p.length;i++){let a=p[i],e=p[(i+1)%p.length];area+=a[0]*e[1]-e[0]*a[1]}const sign=area>0?1:-1;return p.map((a,i)=>{let e=p[(i+1)%p.length],dx=e[0]-a[0],dz=e[1]-a[1],len=Math.hypot(dx,dz);return{a,e,dx:dx/len,dz:dz/len,nx:dz/len*sign,nz:-dx/len*sign,len}}).filter(e=>e.len>.05)}
 function pt(e,t,y,off=0){return[e.a[0]+e.dx*t+e.nx*off,y,e.a[1]+e.dz*t+e.nz*off]}
 function wall(out,e,bottom,top,col,off=0){let a=pt(e,0,bottom,off),at=pt(e,0,top,off),bt=pt(e,e.len,top,off),b=pt(e,e.len,bottom,off),u=e.len/2,v=(top-bottom)/2;tri(out,a,at,bt,col,[[0,0],[0,v],[u,v]]);tri(out,a,bt,b,col,[[0,0],[u,v],[u,0]])}
 function band(out,e,y,height,col,depth=.16){wall(out,e,y,y+height,col,depth);quad(out,pt(e,0,y+height,0),pt(e,e.len,y+height,0),pt(e,e.len,y+height,depth),pt(e,0,y+height,depth),col)}

 function planeWindow(outs,e,t,y,w,h,col,arched=false,shutters=false){
  let l=t-w/2,r=t+w/2,off=.06,frame=.12;let points=[];
  if(arched){let base=h-w/2;points=[[l,y],[r,y],[r,y+base]];for(let a=0;a<=Math.PI+.001;a+=Math.PI/10)points.push([t+Math.cos(a)*w/2,y+base+Math.sin(a)*w/2]);points.push([l,y])}
  else points=[[l,y],[r,y],[r,y+h],[l,y+h]];
  if(!arched&&w>.25&&h>.25){let reveal=C('#373d40');quad(outs.trim,pt(e,l-.09,y-.08,.04),pt(e,r+.09,y-.08,.04),pt(e,r+.09,y+h+.08,.04),pt(e,l-.09,y+h+.08,.04),reveal)}
  let ps=points.map(v=>new T.Vector2(v[0],v[1]));for(let f of T.ShapeUtils.triangulateShape(ps,[]))tri(outs.glass,...f.map(i=>pt(e,ps[i].x,ps[i].y,off)),col);
  for(let i=0;i<points.length-1;i++){let a=points[i],z=points[i+1],dx=z[0]-a[0],dy=z[1]-a[1],len=Math.hypot(dx,dy)||1,nx=-dy/len*frame,ny=dx/len*frame;quad(outs.trim,pt(e,a[0],a[1],.12),pt(e,z[0],z[1],.12),pt(e,z[0]+nx,z[1]+ny,.12),pt(e,a[0]+nx,a[1]+ny,.12),stone)}
  quad(outs.trim,pt(e,l-.12,y-.12,.14),pt(e,r+.12,y-.12,.14),pt(e,r+.12,y,.14),pt(e,l-.12,y,.14),stone);
  quad(outs.trim,pt(e,l-.12,y,.05),pt(e,r+.12,y,.05),pt(e,r+.12,y,.22),pt(e,l-.12,y,.22),stone);
  quad(outs.trim,pt(e,t-.032,y,.135),pt(e,t+.032,y,.135),pt(e,t+.032,y+h-(arched?.25:0),.135),pt(e,t-.032,y+h-(arched?.25:0),.135),stone);
  quad(outs.trim,pt(e,l,y+h*.48,.135),pt(e,r,y+h*.48,.135),pt(e,r,y+h*.48+.032,.135),pt(e,l,y+h*.48+.032,.135),stone);
  if(shutters)for(let side of [-1,1]){let s=t+side*(w/2+.24);quad(outs.trim,pt(e,s-.17,y,.11),pt(e,s+.17,y,.11),pt(e,s+.17,y+h,.11),pt(e,s-.17,y+h,.11),C('#253829'))}
 }

 function cap(out,p,y,color){
  let ps=p.map(v=>new T.Vector2(...v));
  for(let f of T.ShapeUtils.triangulateShape(ps,[])){
   const pts=f.map(i=>[ps[i].x,y,ps[i].y]);
   const uv=f.map(i=>[ps[i].x/6,ps[i].y/6]);
   tri(out,pts[0],pts[1],pts[2],color,uv);
  }
 }

 function textSign(text,x,y,z,angle,w=7){let ca=document.createElement('canvas');ca.width=1024;ca.height=128;let c=ca.getContext('2d');c.fillStyle='#223931';c.fillRect(0,0,1024,128);c.fillStyle='#e5dfc5';c.font='600 58px Georgia';c.textAlign='center';c.fillText(text,512,83,980);let tex=new T.CanvasTexture(ca);tex.colorSpace=T.SRGBColorSpace;let m=new T.Mesh(new T.PlaneGeometry(w,w/8),new T.MeshStandardMaterial({map:tex,roughness:.7,side:T.DoubleSide}));m.position.set(x,y+curGy,z);m.rotation.y=angle;scene.add(m);return m}
 function landmarkBox(w,h,d,color,x,y,z,yaw=0){let m=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color,roughness:.72,metalness:color==='#30413f'?.32:0}));m.position.set(x,y+curGy,z);m.rotation.y=yaw;m.castShadow=m.receiveShadow=true;scene.add(m);return m}
 function landmarkRoof(r,h,color,x,y,z,yaw=0){let m=new T.Mesh(new T.ConeGeometry(r,h,4),new T.MeshStandardMaterial({color,roughness:.82}));m.position.set(x,y+curGy,z);m.rotation.y=yaw+Math.PI/4;m.castShadow=m.receiveShadow=true;scene.add(m);return m}
 function landmarkColumn(radius,height,color,x,y,z){let m=new T.Mesh(new T.CylinderGeometry(radius*.82,radius,height,12),new T.MeshStandardMaterial({color,roughness:.8}));m.position.set(x,y+curGy,z);m.castShadow=m.receiveShadow=true;scene.add(m);return m}
 const edgeYaw=e=>Math.atan2(-e.dz,e.dx);

 for(let index=0;index<Geo.buildings.length;index++){
  const src=Geo.buildings[index];if(src.type==='ship'||src.box.r<0||src.box.b<0||src.box.x>Geo.W||src.box.y>Geo.H)continue;
  let p=src.p.map(v=>v.map(a=>a*S));if(p.length>2&&Math.hypot(p[0][0]-p.at(-1)[0],p[0][1]-p.at(-1)[1])<.01)p.pop();if(p.length<3)continue;
  const es=edges(p),center=[(src.box.x+src.box.r)*S/2,(src.box.y+src.box.b)*S/2],key=Math.floor(center[0]/180)+','+Math.floor(center[1]/180),area=(src.box.r-src.box.x)*(src.box.b-src.box.y)*S*S;
  const isNewBedford=window.activeCity?.id==='new-bedford',academy=src.name==='Academy Building',hall=src.name==='Fall River City Hall',borden=src.name==='Lizzie Borden House',justice=src.name==='Fall River Justice Center',customHouse=src.name==='U.S. Custom House',mill=src.name.includes('Mill')||src.name.includes('Narrows')||src.type==='industrial',downtown=isNewBedford?src.box.x>1400&&src.box.x<3000&&src.box.y>1200&&src.box.y<2800:src.box.x>1650&&src.box.x<2400&&src.box.y>3350&&src.box.y<4500;
  let floors=src.hasLevels?Math.max(1,parseFloat(src.height)||2):mill?4:downtown&&area>250?3:area>1200?3:2;
  let h=parseFloat(src.heightMeters)||floors*3.25;if(academy){h=17.4;floors=4}if(borden){h=6.6;floors=2}if(justice){h=21;floors=5}if(hall){h=22;floors=4}if(customHouse){h=8.2;floors=2}h=Math.min(75,Math.max(3,h));
  let isHouse=!downtown&&area<260&&!mill||borden,type=isHouse?'siding':justice||hall||customHouse?'stone':'brick';
  if(mill&&src.name.includes('Tecumseh'))type='stone';
  let color=C(borden?'#8c9b65':academy?'#bd8a74':customHouse?'#c9c4b4':mill?'#b8b5a6':isHouse?['#ddd7c3','#b2b9ac','#b5b6bd','#ccc1ab','#a1afa4'][index%5]:['#bbaba1','#c9b6a5','#b7a494','#d0c5af'][index%4]);
  if(src.colour&&CSS.supports('color',src.colour))color=C(src.colour);if(!academy&&!borden&&!hall&&!justice&&!customHouse&&/concrete|stone|plaster/.test(src.material||''))type='stone';
  const outs={wall:b(key,type),trim:b(key,'trim'),glass:b(key,'glass'),roof:b(key,'roof')};
  let gyMin=Infinity,gyMax=-Infinity;
  for(const v of p){const gy=Geo.groundY?Geo.groundY(v[0],v[1]):0;if(gy<gyMin)gyMin=gy;if(gy>gyMax)gyMax=gy;}
  if(!Number.isFinite(gyMin)){gyMin=0;gyMax=0;}
  const gyB=(gyMin+gyMax)*0.5,skirt=Math.max(2.5,(gyMax-gyMin)+2.5);curGy=gyB;
  const marks=[outs.wall.p.length,outs.trim.p.length,outs.glass.p.length,outs.roof.p.length];
  const detail=academy||borden||hall||justice||customHouse||mill||(isNewBedford?Math.hypot(center[0]-1450,center[1]-1300)<540:Math.hypot(center[0]-1310,center[1]-2750)<720);
  const facade=detail||(downtown&&area>70&&index%2===0);

  if(hall){
   const cx=center[0],cz=center[1],inner=p.map(v=>[cx+(v[0]-cx)*.82,cz+(v[1]-cz)*.82]);
   for(let e of es){wall(outs.wall,e,-skirt,4.8,C('#8d8b80'));wall(outs.wall,e,4.8,8,C('#c7c4b3'));band(outs.trim,e,7.6,.5,C('#d9d5c1'),.4);wall(outs.glass,e,15.5,21.3,C('#a4b8bb'));band(outs.trim,e,14.8,.8,C('#d5d1bd'),.35);band(outs.trim,e,21.3,.8,C('#d5d1bd'),.35);for(let t=.6;t<e.len;t+=2.8){let a=t-.2,z=t+.2;quad(outs.trim,pt(e,a,15.4,.5),pt(e,z,15.4,.5),pt(e,z,21.5,.5),pt(e,a,21.5,.5),C('#c3c1b3'));quad(outs.trim,pt(e,a,15.4,0),pt(e,a,15.4,.5),pt(e,a,21.5,.5),pt(e,a,21.5,0),C('#aaa99d'))}}
   for(let e of edges(inner)){wall(outs.glass,e,8,14.8,C('#7c9ba5'));for(let t=0;t<e.len;t+=2){quad(outs.trim,pt(e,t,8,.12),pt(e,t+.08,8,.12),pt(e,t+.08,14.8,.12),pt(e,t,14.8,.12),C('#354c52'))}}
   cap(outs.roof,p,22,roofColor);special.push({name:src.name,center,kind:'Brutalist concrete, recessed glass and projecting sun fins'});
  }else{
   for(let e of es){
    wall(outs.wall,e,-skirt,h,color);band(outs.trim,e,-skirt,skirt+.7,isHouse?C('#797d71'):C('#8b8e83'),.06);
    if(facade){
     band(outs.trim,e,h-.35,.35,stone,.22);if(!isHouse)band(outs.trim,e,3.6,.22,stone,.14);
     if(academy){band(outs.trim,e,7,.15,stone,.1);band(outs.trim,e,10.5,.15,stone,.1);band(outs.trim,e,14,.15,stone,.1);band(outs.trim,e,h-.7,.18,stone,.3)}
     let gap=academy?3.5:mill?3.4:isHouse?3.3:4.3,num=Math.floor(e.len/gap);if(e.len<2)continue;
     for(let floor=0;floor<floors;floor++){
      let floorH=h/floors,y=floor*floorH+.9,ww=academy?1.45:isHouse?1.0:mill?1.8:1.5,wh=academy?2.4:isHouse?1.75:mill?2.15:2.0;if(y+wh>h-.5)wh=h-y-.6;
      for(let j=0;j<num;j++){
       let t=(j+.5)*e.len/num,windowTone=C('#d8e2ea');
       if(!isHouse&&floor===0&&!mill){
        let width=Math.min(3.3,e.len/num-.35);planeWindow(outs,e,t,.7,width,2.5,windowTone);
        if(academy){let green=C('#335d48');quad(outs.trim,pt(e,t-width/2,3.5,.05),pt(e,t+width/2,3.5,.05),pt(e,t+width/2,2.95,1.3),pt(e,t-width/2,2.95,1.3),green);wall(outs.trim,{...e,a:[e.a[0]+e.dx*(t-width/2),e.a[1]+e.dz*(t-width/2)],len:width},2.78,2.96,green,1.3)}
       }else planeWindow(outs,e,t,y,ww,wh,windowTone,academy&&floor>0,borden);
      }
     }
     if(!isHouse&&e.len>5){for(let t=0;t<e.len;t+=5){let pil=.16;quad(outs.trim,pt(e,t-pil,.7,.15),pt(e,t+pil,.7,.15),pt(e,t+pil,h-.5,.15),pt(e,t-pil,h-.5,.15),academy?stone:C('#a89985'))}}
    }
   }
   if(borden){let front=es.reduce((best,e)=>{let a=Geo.nearestRoad((e.a[0]+e.e[0])*.75,(e.a[1]+e.e[1])*.75,true);return !best||a.distance<best.dist?{e,dist:a.distance}:best},null).e;let t=front.len/2;quad(outs.trim,pt(front,t-.52,.15,.15),pt(front,t+.52,.15,.15),pt(front,t+.52,2.5,.15),pt(front,t-.52,2.5,.15),C('#353b2d'));for(let side of [-1,1])quad(outs.trim,pt(front,t+side*.62-.07,.1,.20),pt(front,t+side*.62+.07,.1,.20),pt(front,t+side*.62+.07,2.7,.20),pt(front,t+side*.62-.07,2.7,.20),stone);quad(outs.trim,pt(front,t-.7,2.55,.23),pt(front,t+.7,2.55,.23),pt(front,t+.7,2.76,.23),pt(front,t-.7,2.76,.23),stone);for(let step=0;step<3;step++)quad(outs.trim,pt(front,t-.8,.06+step*.07,.18+step*.23),pt(front,t+.8,.06+step*.07,.18+step*.23),pt(front,t+.8,.06+step*.07,.42+step*.23),pt(front,t-.8,.06+step*.07,.42+step*.23),C('#9e9f93'));const yaw=edgeYaw(front),porch=pt(front,t,2.62,.73);landmarkBox(2.75,.12,1.34,'#d4d0bf',porch[0],porch[1],porch[2],yaw);landmarkRoof(1.28,.82,'#48504d',porch[0],3.08,porch[2],yaw);for(let side of [-1,1]){for(let depth of [.30,1.0]){let q=pt(front,t+side*.98,.95,depth);landmarkBox(.11,1.65,.11,'#e1ded0',q[0],q[1],q[2],yaw)}let bracket=pt(front,t+side*1.08,2.2,.58);landmarkBox(.15,.22,.15,'#3a503f',bracket[0],bracket[1],bracket[2],yaw)}for(let step=0;step<3;step++){let q=pt(front,t,.08+step*.075,1.23+step*.16);landmarkBox(2.05+step*.22,.12,.42,'#99998e',q[0],q[1],q[2],yaw)}let chimney=pt(front,t-front.len*.27,h+1.15,-.18);landmarkBox(.42,2.15,.44,'#934f43',chimney[0],chimney[1],chimney[2],yaw)}
   if(academy){const front=es.reduce((best,e)=>{let near=Geo.nearestRoad((e.a[0]+e.e[0])*.75,(e.a[1]+e.e[1])*.75,true);return !best||near.distance<best.dist?{e,dist:near.distance}:best},null).e,t=front.len/2,yaw=edgeYaw(front);const entry=pt(front,t,2.05,.52);landmarkBox(3.15,.14,1.05,'#314c40',entry[0],entry[1],entry[2],yaw);for(let side of [-1,1]){let door=pt(front,t+side*.53,1.42,.14);landmarkBox(1.0,2.18,.075,'#182326',door[0],door[1],door[2],yaw);let pull=pt(front,t+side*.16,1.36,.20);landmarkBox(.035,.42,.028,'#b6a672',pull[0],pull[1],pull[2],yaw);let pier=pt(front,t+side*1.34,1.15,.48);landmarkBox(.18,2.0,.23,'#bcb49f',pier[0],pier[1],pier[2],yaw)}let transom=pt(front,t,2.58,.15);landmarkBox(2.12,.24,.08,'#354951',transom[0],transom[1],transom[2],yaw);let mullion=pt(front,t,1.48,.205);landmarkBox(.055,2.05,.032,'#81775d',mullion[0],mullion[1],mullion[2],yaw);let keystone=pt(front,t,3.18,.17);landmarkBox(.44,.32,.13,'#d8cfb8',keystone[0],keystone[1],keystone[2],yaw);for(let side of [-1,1]){let q=pt(front,t+side*2.08,8.7,.12);landmarkBox(.18,14.2,.14,'#c9bea5',q[0],q[1],q[2],yaw)}}
   if(customHouse){const front=es.reduce((best,e)=>{let near=Geo.nearestRoad((e.a[0]+e.e[0])*.75,(e.a[1]+e.e[1])*.75,true);return !best||near.distance<best.dist?{e,dist:near.distance}:best},null).e,t=front.len/2,yaw=edgeYaw(front);for(let i=-1.5;i<=1.5;i++){let q=pt(front,t+i*.72,1.72,.7);landmarkColumn(.18,3.1,'#d8d2c1',q[0],q[1],q[2])}let ent=pt(front,t,3.32,.7);landmarkBox(3.25,.26,.75,'#d3cdbd',ent[0],ent[1],ent[2],yaw);let pediment=pt(front,t,3.9,.7);landmarkRoof(1.32,.72,'#d8d2c1',pediment[0],pediment[1],pediment[2],yaw);special.push({name:src.name,center,kind:'Granite Greek Revival portico with four Doric columns'});}
   const rcTint=src.roofColour&&CSS.supports('color',src.roofColour)?C(src.roofColour):C(['#7c8085','#6d7176','#85817a','#676e73'][index%4]);
   cap(outs.roof,p,h,rcTint);
   // Parapet walls on commercial/mill flat roofs for realistic roofline depth
   if(facade&&!isHouse&&!hall)for(const e of es)band(outs.trim,e,h,.55,mill?C('#74716b'):C('#84827d'),.24);
   // Gable roofs for houses
   if((isHouse||borden)&&p.length===4){let lengths=es.map(e=>e.len),short=lengths.indexOf(Math.min(...lengths)),a=es[short],op=es[(short+2)%4],r1=[(a.a[0]+a.e[0])/2,h+2.6,(a.a[1]+a.e[1])/2],r2=[(op.a[0]+op.e[0])/2,h+2.6,(op.a[1]+op.e[1])/2],rc=C('#595f5d');let corners=p.map(v=>[v[0],h,v[1]]);tri(outs.roof,corners[short],corners[(short+1)%4],r1,color);tri(outs.roof,corners[(short+2)%4],corners[(short+3)%4],r2,color);quad(outs.roof,corners[(short+1)%4],corners[(short+2)%4],r2,r1,rc,es[(short+1)%4].len/2,2);quad(outs.roof,corners[(short+3)%4],corners[short],r1,r2,rc,es[(short+3)%4].len/2,2)}
   // Populate realistic rooftop mechanical equipment inset safely inside the polygon edges (works on L-shaped roofs too!)
   if(!isHouse&&!borden&&area>120&&detail&&es.length>=3){
    const longest=es.reduce((best,e)=>e.len>best.len?e:best,es[0]);
    const ang=edgeYaw(longest);
    const inset=Math.min(3.5,Math.max(1.8,longest.len*0.18));
    // Place HVAC + penthouse along longest edge inset inward (-normal)
    const mid=pt(longest,longest.len*0.5,h,-inset);
    if(area>360){
     const ph=2.1+pRnd()*1.2;
     roofPenthouse.push({x:mid[0],y:h+gyB+ph*0.5,z:mid[2],w:Math.min(4.8,longest.len*0.22),h:ph,d:3.2,a:ang});
    }
    for(let k=0;k<2;k++){
     const t=(0.24+k*0.52)*longest.len;
     const hp=pt(longest,t,h,-inset);
     roofHvac.push({x:hp[0],y:h+gyB+0.62,z:hp[2],w:1.7+pRnd()*0.9,h:1.15+pRnd()*0.35,d:1.4+pRnd()*0.7,a:ang});
    }
    if(pRnd()<0.65){
     const sp=pt(longest,longest.len*0.36,h,-inset*1.3);
     roofSkylight.push({x:sp[0],y:h+gyB+0.3,z:sp[2],w:2.6+pRnd()*1.4,h:0.48,d:1.8+pRnd()*0.9,a:ang});
    }
   }
   if(academy||borden||justice||mill)special.push({name:src.name,center,kind:borden?'Green clapboard, dark shutters and gabled roof':academy?'Four-story red brick, arched windows and green awnings':justice?'Modern courthouse glazing and stone':'Mill windows and masonry'});
  }
  if(detail){let e=es.reduce((a,z)=>z.len>a.len?z:a,es[0]);if(e&&src.name&&e.len>5){let q=pt(e,e.len/2,borden?2.6:4.1,.28);textSign(src.name.toUpperCase(),...q,Math.atan2(e.nx,e.nz),Math.min(academy?8:10,e.len*(academy?.43:.58)))}}
  for(const [out,m0] of [[outs.wall,marks[0]],[outs.trim,marks[1]],[outs.glass,marks[2]],[outs.roof,marks[3]]])for(let i=m0+1;i<out.p.length;i+=3)out.p[i]+=gyB;
  count++;
 }

 for(let out of batches.values()){
  if(!out.p.length)continue;
  let g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(out.p,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(out.uv,2));
  g.setAttribute('color',new T.Float32BufferAttribute(out.c,3));
  g.setAttribute('aLocalY',new T.Float32BufferAttribute(out.ly,1));
  g.computeVertexNormals();g.computeBoundingSphere();
  let m=new T.Mesh(g,mat[out.type]);
  m.castShadow=['brick','stone','siding','roof'].includes(out.type);
  m.receiveShadow=true;
  scene.add(m);
  if(out.type!=='glass')wallMeshes.push(m);
 }

 // Instanced rooftop mechanicals (only 3 draw calls for hundreds of rooftops!)
 const addInst=(items,m)=>{
  if(!items.length)return;
  const mesh=new T.InstancedMesh(new T.BoxGeometry(1,1,1),m,items.length);
  const o=new T.Object3D();
  for(let i=0;i<items.length;i++){const q=items[i];o.position.set(q.x,q.y,q.z);o.rotation.set(0,q.a,0);o.scale.set(q.w,q.h,q.d);o.updateMatrix();mesh.setMatrixAt(i,o.matrix)}
  mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
 };
 addInst(roofHvac,new T.MeshStandardMaterial({color:'#9ba2a8',roughness:.58,metalness:.45}));
 addInst(roofPenthouse,new T.MeshStandardMaterial({color:'#7d807e',roughness:.88}));
 addInst(roofSkylight,new T.MeshPhysicalMaterial({color:'#4c6578',roughness:.18,metalness:.3,clearcoat:1}));

 return{wallMeshes,buildingCount:count,special,materials:mat};
}
