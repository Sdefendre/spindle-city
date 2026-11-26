import * as T from './vendor/three.module.js';
const S=1/1.5;
export function addArchitecture(scene,renderer,geo=window.Geo){
 const Geo=geo;
 const loader=new T.TextureLoader(),ready=[];function tex(file,color=true){let t=loader.load('assets/materials/'+file);t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());if(color)t.colorSpace=T.SRGBColorSpace;return t}
 const brick=tex('brick-color.jpg'),normal=tex('brick-normal.jpg',false),concrete=tex('concrete-color.jpg'),sidewalkNorm=tex('sidewalk-normal.jpg',false);
 // World-space architectural weathering: kills brick/siding repetition, adds real sidewalk-level
 // splash/grime darkening and subtle masonry roughness variation like real Street View photos.
 function addWeathering(m,grimeStrength=.24,macroStrength=.16,isStone=false){
  m.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader
    .replace('#include <common>','#include <common>\nvarying vec3 vArchPos;\nvarying vec3 vArchNrm;')
    .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvArchPos=(modelMatrix*vec4(transformed,1.0)).xyz;\nvArchNrm=normalize(mat3(modelMatrix)*objectNormal);');
   shader.fragmentShader=shader.fragmentShader
    .replace('#include <common>',`#include <common>
varying vec3 vArchPos;
varying vec3 vArchNrm;
float archHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float archNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(archHash(i),archHash(i+vec2(1,0)),f.x),mix(archHash(i+vec2(0,1)),archHash(i+vec2(1,1)),f.x),f.y);}`)
    .replace('#include <map_fragment>',`${isStone?`#ifdef USE_MAP
 vec4 surface=texture2D(map,vMapUv);
 vec4 surfaceFar=texture2D(map,vMapUv*0.23+vec2(0.37,0.19));
 diffuseColor*=mix(vec4(0.86,0.85,0.82,1.0),surface*0.68+surfaceFar*0.32,0.34);
#endif`:`#include <map_fragment>`}
 vec2 w2=vec2(vArchPos.x+vArchPos.z,vArchPos.y);
 float macro=archNoise(w2*0.16)*0.65+archNoise(w2*0.52+4.1)*0.35;
 float stain=archNoise(vec2((vArchPos.x+vArchPos.z)*0.45,vArchPos.y*0.14+2.3));
 float grime=1.0-${grimeStrength.toFixed(3)}*(1.0-smoothstep(0.0,1.45,vArchPos.y))*(0.55+0.45*stain);
 float tone=mix(1.0-${macroStrength.toFixed(3)},1.0+${(macroStrength*0.85).toFixed(3)},macro);
 // Subtle vertical rain-streak shading under cornices and bands.
 float streak=0.95+0.05*archNoise(vec2((vArchPos.x+vArchPos.z)*1.8,vArchPos.y*0.18));
 diffuseColor.rgb*=grime*tone*streak;`)
    .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
 float rVar=archNoise(vec2(vArchPos.x+vArchPos.z,vArchPos.y)*0.35);
 roughnessFactor=clamp(roughnessFactor+(rVar-0.5)*0.16+(1.0-smoothstep(0.0,1.2,vArchPos.y))*0.06,0.45,0.99);`);
  };
  return m;
 }
 // Realistic Street View architectural glass: dark interior depth with subtle blinds/curtains,
 // per-window lighting variation, and crisp Fresnel sky/cloud reflection at grazing angles.
 function makeGlassMaterial(){
  const g=new T.MeshPhysicalMaterial({color:'#162028',metalness:.10,roughness:.04,envMapIntensity:2.3,vertexColors:true,side:T.DoubleSide,clearcoat:1,clearcoatRoughness:.03});
  g.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader
    .replace('#include <common>','#include <common>\nvarying vec3 vGlassWorld;\nvarying vec3 vGlassNrm;')
    .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvGlassWorld=(modelMatrix*vec4(transformed,1.0)).xyz;\nvGlassNrm=normalize(mat3(modelMatrix)*objectNormal);');
   shader.fragmentShader=shader.fragmentShader
    .replace('#include <common>',`#include <common>
varying vec3 vGlassWorld;
varying vec3 vGlassNrm;
float gHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float gNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(gHash(i),gHash(i+vec2(1,0)),f.x),mix(gHash(i+vec2(0,1)),gHash(i+vec2(1,1)),f.x),f.y);}`)
    .replace('#include <color_fragment>',`#include <color_fragment>
 vec3 viewDir=normalize(cameraPosition-vGlassWorld);
 vec3 wn=normalize(vGlassNrm);
 if(!gl_FrontFacing)wn=-wn;
 float ndv=clamp(abs(dot(wn,viewDir)),0.0,1.0);
 float fresnel=pow(1.0-ndv,3.4);
 float horiz=abs(wn.x)>abs(wn.z)?vGlassWorld.z:vGlassWorld.x;
 vec2 cellId=floor(vec2(horiz/2.6,vGlassWorld.y/3.1));
 vec2 local=fract(vec2(horiz/2.6,vGlassWorld.y/3.1));
 float rnd=gHash(cellId);
 float rnd2=gHash(cellId+17.3);
 vec2 para=local+vec2(dot(viewDir,vec3(-wn.z,0.0,wn.x)),viewDir.y)*0.18;
 float groundFloor=1.0-smoothstep(3.2,3.9,vGlassWorld.y);
 // Deep dark interior room depth with realistic blinds, curtains & dim storefront interiors.
 vec3 roomDark=mix(vec3(0.014,0.018,0.022),vec3(0.048,0.050,0.046),smoothstep(0.18,0.95,para.y));
 float hasBlinds=step(0.46,rnd)*(1.0-groundFloor);
 float blindDrop=mix(0.28,0.78,rnd2);
 float inBlinds=hasBlinds*step(1.0-blindDrop,local.y);
 float slat=0.62+0.38*sin(vGlassWorld.y*72.0);
 vec3 blindCol=mix(vec3(0.16,0.17,0.16),vec3(0.32,0.30,0.26),rnd2)*slat;
 float hasCurtain=step(0.76,rnd2)*(1.0-hasBlinds)*(1.0-groundFloor);
 float curtainMask=hasCurtain*smoothstep(0.20,0.38,abs(local.x-0.5));
 vec3 curtainCol=mix(vec3(0.22,0.20,0.18),vec3(0.14,0.16,0.17),rnd);
 // Ground-floor retail interior: dark shadowy depth with subtle backlit wall/shelf tone.
 float shopGlow=smoothstep(0.42,0.92,para.y)*(0.25+0.75*rnd);
 vec3 shopHint=mix(vec3(0.015,0.018,0.022),vec3(0.095,0.085,0.068),shopGlow);
 vec3 interior=mix(roomDark,blindCol,inBlinds*0.72);
 interior=mix(interior,curtainCol,curtainMask*0.6);
 interior=mix(interior,shopHint,groundFloor*0.85);
 // Crisp high-contrast sky + opposite-street reflection only strong at oblique Fresnel angles.
 vec3 reflDir=reflect(-viewDir,wn);
 float skyT=clamp(reflDir.y*1.3+0.15,0.0,1.0);
 float clouds=gNoise(reflDir.xz/(abs(reflDir.y)+0.35)*1.5+vec2(2.1,0.7));
 vec3 reflSky=mix(vec3(0.38,0.48,0.58),vec3(0.18,0.34,0.58),skyT);
 reflSky=mix(reflSky,vec3(0.76,0.78,0.80),smoothstep(0.52,0.84,clouds)*0.55);
 vec3 reflStreet=vec3(0.06,0.065,0.07)*(0.65+0.35*gNoise(vec2(horiz*0.6,reflDir.y*6.0)));
 vec3 envRefl=mix(reflStreet,reflSky,smoothstep(-0.14,0.14,reflDir.y));
 float paneTint=0.90+0.14*rnd;
 diffuseColor.rgb=mix(interior,envRefl*vec3(0.88,0.95,1.0),clamp(fresnel*0.58+0.06,0.0,0.68))*paneTint;`);
  };
  return g;
 }
 const mat={
  brick:addWeathering(new T.MeshStandardMaterial({map:brick,normalMap:normal,normalScale:new T.Vector2(.65,.65),color:'#dfd7cf',vertexColors:true,roughness:.92,side:T.DoubleSide}),.26,.18,false),
  stone:addWeathering(new T.MeshStandardMaterial({map:concrete,normalMap:sidewalkNorm,normalScale:new T.Vector2(.28,.28),color:'#ebe8e1',vertexColors:true,roughness:.91,side:T.DoubleSide}),.22,.15,true),
  trim:addWeathering(new T.MeshStandardMaterial({map:concrete,bumpMap:concrete,bumpScale:.032,color:'#eceae3',vertexColors:true,roughness:.87,side:T.DoubleSide}),.16,.11,true),
  glass:makeGlassMaterial(),
  roof:addWeathering(new T.MeshStandardMaterial({map:concrete,color:'#d8d8d4',vertexColors:true,roughness:.93,side:T.DoubleSide}),.08,.18,true),
 };
 // Realistic clapboard siding with subtle wood grain and shadow lap lines.
 const cc=document.createElement('canvas');cc.width=cc.height=256;let cx=cc.getContext('2d');cx.fillStyle='#dad8cf';cx.fillRect(0,0,256,256);for(let y=0;y<256;y+=22){const g=cx.createLinearGradient(0,y,0,y+22);g.addColorStop(0,'#8c8b83');g.addColorStop(.14,'#d8d6ce');g.addColorStop(.92,'#e4e2da');g.addColorStop(1,'#62625b');cx.fillStyle=g;cx.fillRect(0,y,256,22)}let siding=new T.CanvasTexture(cc);siding.colorSpace=T.SRGBColorSpace;siding.wrapS=siding.wrapT=T.RepeatWrapping;mat.siding=addWeathering(new T.MeshStandardMaterial({map:siding,bumpMap:siding,bumpScale:.035,vertexColors:true,color:'#ecebe6',roughness:.84,side:T.DoubleSide}),.20,.14,false);
 const batches=new Map(),wallMeshes=[],special=[];let count=0;
 function b(key,type){let k=key+'|'+type;if(!batches.has(k))batches.set(k,{p:[],uv:[],c:[],type});return batches.get(k)}
 function tri(out,a,b,c,color,uv=[[0,0],[1,0],[0,1]]){out.p.push(...a,...b,...c);for(let i=0;i<3;i++){out.c.push(color.r,color.g,color.b);out.uv.push(...uv[i])}}
 function quad(out,a,b,c,d,color,u=1,v=1){tri(out,a,b,c,color,[[0,0],[u,0],[u,v]]);tri(out,a,c,d,color,[[0,0],[u,v],[0,v]])}
 const C=x=>new T.Color(x),stone=C('#cfc9bc'),dark=C('#2d3336'),roofColor=C('#464a4c');
 function edges(p){let area=0;for(let i=0;i<p.length;i++){let a=p[i],e=p[(i+1)%p.length];area+=a[0]*e[1]-e[0]*a[1]}const sign=area>0?1:-1;return p.map((a,i)=>{let e=p[(i+1)%p.length],dx=e[0]-a[0],dz=e[1]-a[1],len=Math.hypot(dx,dz);return{a,e,dx:dx/len,dz:dz/len,nx:dz/len*sign,nz:-dx/len*sign,len}}).filter(e=>e.len>.05)}
 function pt(e,t,y,off=0){return[e.a[0]+e.dx*t+e.nx*off,y,e.a[1]+e.dz*t+e.nz*off]}
 function wall(out,e,bottom,top,col,off=0){let a=pt(e,0,bottom,off),at=pt(e,0,top,off),bt=pt(e,e.len,top,off),b=pt(e,e.len,bottom,off),u=e.len/2,v=(top-bottom)/2;tri(out,a,at,bt,col,[[0,0],[0,v],[u,v]]);tri(out,a,bt,b,col,[[0,0],[u,v],[u,0]])}

 function band(out,e,y,height,col,depth=.16){wall(out,e,y,y+height,col,depth);quad(out,pt(e,0,y+height,0),pt(e,e.len,y+height,0),pt(e,e.len,y+height,depth),pt(e,0,y+height,depth),col)}
 function planeWindow(outs,e,t,y,w,h,col,arched=false,shutters=false){let l=t-w/2,r=t+w/2,off=.075,frame=.12;let points=[];if(arched){let base=h-w/2;points=[[l,y],[r,y],[r,y+base]];for(let a=0;a<=Math.PI+.001;a+=Math.PI/10)points.push([t+Math.cos(a)*w/2,y+base+Math.sin(a)*w/2]);points.push([l,y])}else points=[[l,y],[r,y],[r,y+h],[l,y+h]];
 if(!arched&&w>.25&&h>.25){let reveal=C('#42494a');quad(outs.trim,pt(e,l-.085,y-.07,.052),pt(e,r+.085,y-.07,.052),pt(e,r+.085,y+h+.07,.052),pt(e,l-.085,y+h+.07,.052),reveal)}
 let ps=points.map(v=>new T.Vector2(v[0],v[1]));for(let f of T.ShapeUtils.triangulateShape(ps,[]))tri(outs.glass,...f.map(i=>pt(e,ps[i].x,ps[i].y,off)),col);
 for(let i=0;i<points.length-1;i++){let a=points[i],z=points[i+1],dx=z[0]-a[0],dy=z[1]-a[1],len=Math.hypot(dx,dy)||1,nx=-dy/len*frame,ny=dx/len*frame;quad(outs.trim,pt(e,a[0],a[1],.12),pt(e,z[0],z[1],.12),pt(e,z[0]+nx,z[1]+ny,.12),pt(e,a[0]+nx,a[1]+ny,.12),stone)}
 quad(outs.trim,pt(e,l-.12,y-.12,.14),pt(e,r+.12,y-.12,.14),pt(e,r+.12,y,.14),pt(e,l-.12,y,.14),stone);quad(outs.trim,pt(e,l-.12,y,.05),pt(e,r+.12,y,.05),pt(e,r+.12,y,.22),pt(e,l-.12,y,.22),stone);quad(outs.trim,pt(e,t-.035,y,.14),pt(e,t+.035,y,.14),pt(e,t+.035,y+h-(arched?.25:0),.14),pt(e,t-.035,y+h-(arched?.25:0),.14),stone);quad(outs.trim,pt(e,l,y+h*.48,.14),pt(e,r,y+h*.48,.14),pt(e,r,y+h*.48+.035,.14),pt(e,l,y+h*.48+.035,.14),stone);
 if(shutters)for(let side of [-1,1]){let s=t+side*(w/2+.24);quad(outs.trim,pt(e,s-.17,y,.11),pt(e,s+.17,y,.11),pt(e,s+.17,y+h,.11),pt(e,s-.17,y+h,.11),C('#253829'))}}
 function cap(out,p,y,color){let ps=p.map(v=>new T.Vector2(...v));for(let f of T.ShapeUtils.triangulateShape(ps,[]))tri(out,...f.map(i=>[ps[i].x,y,ps[i].y]),color)}
 function textSign(text,x,y,z,angle,w=7){let ca=document.createElement('canvas');ca.width=1024;ca.height=128;let c=ca.getContext('2d');c.fillStyle='#223931';c.fillRect(0,0,1024,128);c.fillStyle='#e5dfc5';c.font='600 58px Georgia';c.textAlign='center';c.fillText(text,512,83,980);let tex=new T.CanvasTexture(ca);tex.colorSpace=T.SRGBColorSpace;let m=new T.Mesh(new T.PlaneGeometry(w,w/8),new T.MeshStandardMaterial({map:tex,roughness:.7,side:T.DoubleSide}));m.position.set(x,y,z);m.rotation.y=angle;scene.add(m);return m}
 // Landmark-only solids add silhouettes that read at street level without placing a
 // high-detail mesh on every mapped building.
 function landmarkBox(w,h,d,color,x,y,z,yaw=0){let m=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color,roughness:.72,metalness:color==='#30413f'?.32:0}));m.position.set(x,y,z);m.rotation.y=yaw;m.castShadow=m.receiveShadow=true;scene.add(m);return m}
 function landmarkRoof(r,h,color,x,y,z,yaw=0){let m=new T.Mesh(new T.ConeGeometry(r,h,4),new T.MeshStandardMaterial({color,roughness:.82}));m.position.set(x,y,z);m.rotation.y=yaw+Math.PI/4;m.castShadow=m.receiveShadow=true;scene.add(m);return m}
 function landmarkColumn(radius,height,color,x,y,z){let m=new T.Mesh(new T.CylinderGeometry(radius*.82,radius,height,12),new T.MeshStandardMaterial({color,roughness:.8}));m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;scene.add(m);return m}
 const edgeYaw=e=>Math.atan2(-e.dz,e.dx);
 for(let index=0;index<Geo.buildings.length;index++){
 const src=Geo.buildings[index];if(src.type==='ship'||src.box.r<0||src.box.b<0||src.box.x>Geo.W||src.box.y>Geo.H)continue;
 let p=src.p.map(v=>v.map(a=>a*S));if(p.length>2&&Math.hypot(p[0][0]-p.at(-1)[0],p[0][1]-p.at(-1)[1])<.01)p.pop();if(p.length<3)continue;const es=edges(p),center=[(src.box.x+src.box.r)*S/2,(src.box.y+src.box.b)*S/2],key=Math.floor(center[0]/180)+','+Math.floor(center[1]/180),area=(src.box.r-src.box.x)*(src.box.b-src.box.y)*S*S;
 const isNewBedford=window.activeCity?.id==='new-bedford',academy=src.name==='Academy Building',hall=src.name==='Fall River City Hall',borden=src.name==='Lizzie Borden House',justice=src.name==='Fall River Justice Center',customHouse=src.name==='U.S. Custom House',mill=src.name.includes('Mill')||src.name.includes('Narrows')||src.type==='industrial',downtown=isNewBedford?src.box.x>1400&&src.box.x<3000&&src.box.y>1200&&src.box.y<2800:src.box.x>1650&&src.box.x<2400&&src.box.y>3350&&src.box.y<4500;
 let floors=src.hasLevels?Math.max(1,parseFloat(src.height)||2):mill?4:downtown&&area>250?3:area>1200?3:2;
 let h=parseFloat(src.heightMeters)||floors*3.25;if(academy){h=17.4;floors=4}if(borden){h=6.6;floors=2}if(justice){h=21;floors=5}if(hall){h=22;floors=4}if(customHouse){h=8.2;floors=2}h=Math.min(75,Math.max(3,h));
 let isHouse=!downtown&&area<260&&!mill||borden,type=isHouse?'siding':justice||hall||customHouse?'stone':'brick';
 if(mill&&src.name.includes('Tecumseh'))type='stone';
 let color=C(borden?'#87926b':academy?'#a97c6d':customHouse?'#c8c4b8':mill?'#aea99d':isHouse?['#d5d1c6','#aeb5ac','#b6b9be','#c6beb0','#a1aba4'][index%5]:['#a99a91','#b4a396','#9f9188','#bcb4a6'][index%4]);
 if(src.colour&&CSS.supports('color',src.colour))color=C(src.colour);if(!academy&&!borden&&!hall&&!justice&&!customHouse&&/concrete|stone|plaster/.test(src.material||''))type='stone';
 const outs={wall:b(key,type),trim:b(key,'trim'),glass:b(key,'glass'),roof:b(key,'roof')};
 // Landmark models retain their dedicated treatment.  A rotating subset of downtown
 // footprints receives the full window-and-trim pass so long walking corridors do
 // not read as uninterrupted texture blocks, without multiplying geometry citywide.
 const detail=academy||borden||hall||justice||customHouse||mill||(isNewBedford?Math.hypot(center[0]-1450,center[1]-1300)<500:Math.hypot(center[0]-1310,center[1]-2750)<650);
 const facade=detail||(downtown&&area>70&&index%3===0);
 if(hall){const cx=center[0],cz=center[1],inner=p.map(v=>[cx+(v[0]-cx)*.82,cz+(v[1]-cz)*.82]);for(let e of es){wall(outs.wall,e,4.8,8,C('#c7c4b3'));band(outs.trim,e,7.6,.5,C('#d9d5c1'),.4);wall(outs.glass,e,15.5,21.3,C('#a4b8bb'));band(outs.trim,e,14.8,.8,C('#d5d1bd'),.35);band(outs.trim,e,21.3,.8,C('#d5d1bd'),.35);for(let t=.6;t<e.len;t+=2.8){let a=t-.2,z=t+.2;quad(outs.trim,pt(e,a,15.4,.5),pt(e,z,15.4,.5),pt(e,z,21.5,.5),pt(e,a,21.5,.5),C('#c3c1b3'));quad(outs.trim,pt(e,a,15.4,0),pt(e,a,15.4,.5),pt(e,a,21.5,.5),pt(e,a,21.5,0),C('#aaa99d'))}}for(let e of edges(inner)){wall(outs.glass,e,8,14.8,C('#7c9ba5'));for(let t=0;t<e.len;t+=2){quad(outs.trim,pt(e,t,8,.12),pt(e,t+.08,8,.12),pt(e,t+.08,14.8,.12),pt(e,t,14.8,.12),C('#354c52'))}}cap(outs.roof,p,22,roofColor);special.push({name:src.name,center,kind:'Brutalist concrete, recessed glass and projecting sun fins'});}
 else{
 for(let e of es){wall(outs.wall,e,0,h,color);band(outs.trim,e,0,.7,isHouse?C('#797d71'):C('#8b8e83'),.06);if(facade){band(outs.trim,e,h-.35,.35,stone,.22);if(!isHouse)band(outs.trim,e,3.6,.22,stone,.14);if(academy){band(outs.trim,e,7,.15,stone,.1);band(outs.trim,e,10.5,.15,stone,.1);band(outs.trim,e,14,.15,stone,.1);band(outs.trim,e,h-.7,.18,stone,.3)}
 let gap=academy?3.5:mill?3.4:isHouse?3.3:4.3,num=Math.floor(e.len/gap);if(e.len<2)continue;for(let floor=0;floor<floors;floor++){let floorH=h/floors,y=floor*floorH+.9,ww=academy?1.45:isHouse?1.0:mill?1.8:1.5,wh=academy?2.4:isHouse?1.75:mill?2.15:2.0;if(y+wh>h-.5)wh=h-y-.6;for(let j=0;j<num;j++){let t=(j+.5)*e.len/num,windowTone=(index*19+floor*7+j*3)%13===0?C('#c8ad78'):(index+floor+j)%5===0?C('#6f98aa'):C('#8eabb8');if(!isHouse&&floor===0&&!mill){let width=Math.min(3.3,e.len/num-.35);planeWindow(outs,e,t,.7,width,2.5,windowTone);if(academy){let green=C('#335d48');quad(outs.trim,pt(e,t-width/2,3.5,.05),pt(e,t+width/2,3.5,.05),pt(e,t+width/2,2.95,1.3),pt(e,t-width/2,2.95,1.3),green);wall(outs.trim,{...e,a:[e.a[0]+e.dx*(t-width/2),e.a[1]+e.dz*(t-width/2)],len:width},2.78,2.96,green,1.3)}}else planeWindow(outs,e,t,y,ww,wh,windowTone,academy&&floor>0,borden)}}
 if(!isHouse&&e.len>5){for(let t=0;t<e.len;t+=5){let pil=.16;quad(outs.trim,pt(e,t-pil,.7,.15),pt(e,t+pil,.7,.15),pt(e,t+pil,h-.5,.15),pt(e,t-pil,h-.5,.15),academy?stone:C('#a89985'))}}
 }}
 if(borden){let front=es.reduce((best,e)=>{let a=Geo.nearestRoad((e.a[0]+e.e[0])*.75,(e.a[1]+e.e[1])*.75,true);return !best||a.distance<best.dist?{e,dist:a.distance}:best},null).e;let t=front.len/2;quad(outs.trim,pt(front,t-.52,.15,.15),pt(front,t+.52,.15,.15),pt(front,t+.52,2.5,.15),pt(front,t-.52,2.5,.15),C('#353b2d'));for(let side of [-1,1])quad(outs.trim,pt(front,t+side*.62-.07,.1,.20),pt(front,t+side*.62+.07,.1,.20),pt(front,t+side*.62+.07,2.7,.20),pt(front,t+side*.62-.07,2.7,.20),stone);quad(outs.trim,pt(front,t-.7,2.55,.23),pt(front,t+.7,2.55,.23),pt(front,t+.7,2.76,.23),pt(front,t-.7,2.76,.23),stone);for(let step=0;step<3;step++)quad(outs.trim,pt(front,t-.8,.06+step*.07,.18+step*.23),pt(front,t+.8,.06+step*.07,.18+step*.23),pt(front,t+.8,.06+step*.07,.42+step*.23),pt(front,t-.8,.06+step*.07,.42+step*.23),C('#9e9f93'))
 // Reference-informed Victorian porch: posts, steps, turned-looking brackets and a small roof.
 const yaw=edgeYaw(front),porch=pt(front,t,2.62,.73);landmarkBox(2.75,.12,1.34,'#d4d0bf',porch[0],porch[1],porch[2],yaw);landmarkRoof(1.28,.82,'#48504d',porch[0],3.08,porch[2],yaw);for(let side of [-1,1]){for(let depth of [.30,1.0]){let q=pt(front,t+side*.98,.95,depth);landmarkBox(.11,1.65,.11,'#e1ded0',q[0],q[1],q[2],yaw)}let bracket=pt(front,t+side*1.08,2.2,.58);landmarkBox(.15,.22,.15,'#3a503f',bracket[0],bracket[1],bracket[2],yaw)}for(let step=0;step<3;step++){let q=pt(front,t,.08+step*.075,1.23+step*.16);landmarkBox(2.05+step*.22,.12,.42,'#99998e',q[0],q[1],q[2],yaw)}let chimney=pt(front,t-front.len*.27,h+1.15,-.18);landmarkBox(.42,2.15,.44,'#934f43',chimney[0],chimney[1],chimney[2],yaw)}
 if(academy){const front=es.reduce((best,e)=>{let near=Geo.nearestRoad((e.a[0]+e.e[0])*.75,(e.a[1]+e.e[1])*.75,true);return !best||near.distance<best.dist?{e,dist:near.distance}:best},null).e,t=front.len/2,yaw=edgeYaw(front);const entry=pt(front,t,2.05,.52);landmarkBox(3.15,.14,1.05,'#314c40',entry[0],entry[1],entry[2],yaw);
 // A recessed, dark double entry anchors the canopy to the actual facade rather
 // than leaving its stone supports floating in front of a shop window.
 for(let side of [-1,1]){let door=pt(front,t+side*.53,1.42,.14);landmarkBox(1.0,2.18,.075,'#182326',door[0],door[1],door[2],yaw);let pull=pt(front,t+side*.16,1.36,.20);landmarkBox(.035,.42,.028,'#b6a672',pull[0],pull[1],pull[2],yaw);let pier=pt(front,t+side*1.34,1.15,.48);landmarkBox(.18,2.0,.23,'#bcb49f',pier[0],pier[1],pier[2],yaw)}let transom=pt(front,t,2.58,.15);landmarkBox(2.12,.24,.08,'#354951',transom[0],transom[1],transom[2],yaw);let mullion=pt(front,t,1.48,.205);landmarkBox(.055,2.05,.032,'#81775d',mullion[0],mullion[1],mullion[2],yaw);let keystone=pt(front,t,3.18,.17);landmarkBox(.44,.32,.13,'#d8cfb8',keystone[0],keystone[1],keystone[2],yaw);for(let side of [-1,1]){let q=pt(front,t+side*2.08,8.7,.12);landmarkBox(.18,14.2,.14,'#c9bea5',q[0],q[1],q[2],yaw)}}
 if(customHouse){const front=es.reduce((best,e)=>{let near=Geo.nearestRoad((e.a[0]+e.e[0])*.75,(e.a[1]+e.e[1])*.75,true);return !best||near.distance<best.dist?{e,dist:near.distance}:best},null).e,t=front.len/2,yaw=edgeYaw(front);for(let i=-1.5;i<=1.5;i++){let q=pt(front,t+i*.72,1.72,.7);landmarkColumn(.18,3.1,'#d8d2c1',q[0],q[1],q[2])}let ent=pt(front,t,3.32,.7);landmarkBox(3.25,.26,.75,'#d3cdbd',ent[0],ent[1],ent[2],yaw);let pediment=pt(front,t,3.9,.7);landmarkRoof(1.32,.72,'#d8d2c1',pediment[0],pediment[1],pediment[2],yaw);special.push({name:src.name,center,kind:'Granite Greek Revival portico with four Doric columns'});}
 cap(outs.roof,p,h,src.roofColour&&CSS.supports('color',src.roofColour)?C(src.roofColour):roofColor);
 // Low parapets and a roof edge catch the sun and give flat-roofed masonry depth.
 if(facade&&!isHouse&&!hall)for(const e of es)band(outs.trim,e,h-.16,.16,mill?C('#74716b'):C('#6f706d'),.12);
 if((isHouse||borden)&&p.length===4){let lengths=es.map(e=>e.len),short=lengths.indexOf(Math.min(...lengths)),a=es[short],op=es[(short+2)%4],r1=[(a.a[0]+a.e[0])/2,h+2.6,(a.a[1]+a.e[1])/2],r2=[(op.a[0]+op.e[0])/2,h+2.6,(op.a[1]+op.e[1])/2],rc=C('#4d5350');let corners=p.map(v=>[v[0],h,v[1]]);tri(outs.roof,corners[short],corners[(short+1)%4],r1,color);tri(outs.roof,corners[(short+2)%4],corners[(short+3)%4],r2,color);quad(outs.roof,corners[(short+1)%4],corners[(short+2)%4],r2,r1,rc,es[(short+1)%4].len/2,2);quad(outs.roof,corners[(short+3)%4],corners[short],r1,r2,rc,es[(short+3)%4].len/2,2)}
 if(academy||borden||justice||mill)special.push({name:src.name,center,kind:borden?'Green clapboard, dark shutters and gabled roof':academy?'Four-story red brick, arched windows and green awnings':justice?'Modern courthouse glazing and stone': 'Mill windows and masonry'});
 }
 if(detail){let e=es.reduce((a,z)=>z.len>a.len?z:a,es[0]);if(e&&src.name&&e.len>5){let q=pt(e,e.len/2,borden?2.6:4.1,.28);textSign(src.name.toUpperCase(),...q,Math.atan2(e.nx,e.nz),Math.min(academy?8:10,e.len*(academy?.43:.58)))}}
 count++;
 }
 for(let out of batches.values()){if(!out.p.length)continue;let g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(out.p,3));g.setAttribute('uv',new T.Float32BufferAttribute(out.uv,2));g.setAttribute('color',new T.Float32BufferAttribute(out.c,3));g.computeVertexNormals();g.computeBoundingSphere();let m=new T.Mesh(g,mat[out.type]);m.castShadow=['brick','stone','siding','roof'].includes(out.type);m.receiveShadow=true;scene.add(m);if(out.type!=='glass')wallMeshes.push(m)}
 return{wallMeshes,buildingCount:count,special,materials:mat};
}
