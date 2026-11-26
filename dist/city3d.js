import * as T from './vendor/three.module.js';
import {addArchitecture} from './architecture.js';
import {HDRLoader} from './vendor/HDRLoader.js';
import {addStreetDetail} from './street-detail.js';
export {T};
export {makeCharacter} from './character.js';
const S=1/1.5;
function material(color,extra={}){return new T.MeshStandardMaterial({color,roughness:.86,...extra})}
export function buildCity(canvas,geo=window.Geo){
 const Geo=geo,mobile=matchMedia('(pointer:coarse)').matches;
 const renderer=new T.WebGLRenderer({canvas,antialias:!mobile,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.25:2));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 const scene=new T.Scene();scene.background=new T.Color('#b6cce0');scene.fog=new T.Fog('#c9d8e7',170,740);
 const camera=new T.PerspectiveCamera(68,innerWidth/innerHeight,.08,900);
 scene.add(new T.HemisphereLight('#bfd8f4','#5c5953',.76));const sun=new T.DirectionalLight('#fff8eb',3.65);sun.position.set(820,90,2120);sun.castShadow=true;sun.shadow.mapSize.set(mobile?1024:4096,mobile?1024:4096);sun.shadow.camera.left=-56;sun.shadow.camera.right=56;sun.shadow.camera.top=56;sun.shadow.camera.bottom=-56;sun.shadow.camera.near=1;sun.shadow.camera.far=240;sun.shadow.bias=-.00018;sun.shadow.normalBias=.08;scene.add(sun,sun.target);
 const ground=new T.Mesh(new T.PlaneGeometry(Geo.W*S+1000,Geo.H*S+1000),material('#7f8672',{roughness:.96}));ground.rotation.x=-Math.PI/2;ground.position.set(Geo.W*S/2,-.08,Geo.H*S/2);ground.receiveShadow=true;scene.add(ground);
 const {wallMeshes,buildingCount,special,materials}=addArchitecture(scene,renderer,Geo);
 const texLoader=new T.TextureLoader();function surfaceTexture(name,color=true){let t=texLoader.load('assets/materials/'+name);if(color)t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t}const asphaltTexture=surfaceTexture('asphalt-color.jpg'),cementTexture=surfaceTexture('sidewalk-color.jpg'),asphaltNormal=mobile?null:surfaceTexture('asphalt-normal.jpg',false),asphaltRough=mobile?null:surfaceTexture('asphalt-rough.jpg',false),sidewalkNormal=mobile?null:surfaceTexture('sidewalk-normal.jpg',false),sidewalkRough=mobile?null:surfaceTexture('sidewalk-rough.jpg',false);
 // A restrained ripple texture for the river and harbor; pavement is never used for water.
 const waterCanvas=document.createElement('canvas');waterCanvas.width=waterCanvas.height=256;const waterContext=waterCanvas.getContext('2d');waterContext.fillStyle='#d3e2e1';waterContext.fillRect(0,0,256,256);let waterSeed=901;for(let i=0;i<420;i++){waterSeed=(waterSeed*1664525+1013904223)>>>0;const x=waterSeed%256;waterSeed=(waterSeed*1664525+1013904223)>>>0;const y=waterSeed%256;waterContext.fillStyle=i%3?'rgba(89,129,137,.08)':'rgba(255,255,255,.18)';waterContext.fillRect(x,y,5+(waterSeed%20),1)}const waterTexture=new T.CanvasTexture(waterCanvas);waterTexture.colorSpace=T.SRGBColorSpace;waterTexture.wrapS=waterTexture.wrapT=T.RepeatWrapping;waterTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 const skyCanvas=document.createElement('canvas');skyCanvas.width=2048;skyCanvas.height=1024;let sky=skyCanvas.getContext('2d'),gradient=sky.createLinearGradient(0,0,0,1024);gradient.addColorStop(0,'#4573a8');gradient.addColorStop(.34,'#93b6d4');gradient.addColorStop(.49,'#d4e1ec');gradient.addColorStop(.54,'#c5cfd4');gradient.addColorStop(1,'#737874');sky.fillStyle=gradient;sky.fillRect(0,0,2048,1024);let skyTexture=new T.CanvasTexture(skyCanvas);skyTexture.mapping=T.EquirectangularReflectionMapping;skyTexture.colorSpace=T.SRGBColorSpace;scene.background=skyTexture;scene.fog=new T.Fog('#c9d8e7',170,740);
 scene.environmentIntensity=.84;scene.backgroundIntensity=.94;
 const pmrem=new T.PMREMGenerator(renderer);new HDRLoader().load('assets/materials/daylight.hdr',hdr=>{hdr.mapping=T.EquirectangularReflectionMapping;scene.environment=pmrem.fromEquirectangular(hdr).texture;scene.background=hdr;scene.backgroundBlurriness=.006;skyTexture.dispose();pmrem.dispose()});
 function tri(b,a,c,d,col,uv=[[0,0],[1,0],[0,1]]){b.p.push(...a,...c,...d);for(let i=0;i<3;i++){b.col.push(col.r,col.g,col.b);b.uv.push(...uv[i])}}
 function quad(b,a,c,d,e,col,u=1,v=1){tri(b,a,c,d,col,[[0,0],[u,0],[u,v]]);tri(b,a,d,e,col,[[0,0],[u,v],[0,v]])}
 // Road, sidewalk and park surfaces retain the source map coordinates.
 const surfaceBatches=new Map();function surface(color){return batchSurface(color)}function batchSurface(color){if(!surfaceBatches.has(color))surfaceBatches.set(color,{p:[],col:[],uv:[],color});return surfaceBatches.get(color)}
 function poly(p,y,color){if(p.length<3)return;let ps=p.map(v=>new T.Vector2(v[0]*S,v[1]*S));if(ps[0].distanceTo(ps.at(-1))<.01)ps.pop();let b=surface(color),col=new T.Color(color);for(const f of T.ShapeUtils.triangulateShape(ps,[]))tri(b,...f.map(i=>[ps[i].x,y,ps[i].y]),col)}
 for(const a of Geo.areas)poly(a.p,.005,a.type==='pitch'?'#6d8e64':'#6f8b5b');
 for(const w of Geo.waterAll)poly(w.p,.015,'#4a8795');
 function strip(p,width,y,color){let b=surface(color),col=new T.Color(color);for(let i=1;i<p.length;i++){let a=p[i-1],e=p[i],dx=e[0]-a[0],dz=e[1]-a[1],len=Math.hypot(dx,dz);if(!len)continue;let nx=-dz/len*width*S/2,nz=dx/len*width*S/2;quad(b,[a[0]*S+nx,y,a[1]*S+nz],[e[0]*S+nx,y,e[1]*S+nz],[e[0]*S-nx,y,e[1]*S-nz],[a[0]*S-nx,y,a[1]*S-nz],col)}}
 for(const r of Geo.roads){strip(r.p,r.width+(r.drive?6:2),.045,'#c3c0ad')}
 for(const r of Geo.roads){strip(r.p,r.width,r.drive?.07:.052,r.drive?'#555e61':'#cfc8b1');if(r.drive&&r.width>15){const twoWay=r.oneway!=='yes';for(let i=1;i<r.p.length;i++){let a=r.p[i-1],e=r.p[i],dx=e[0]-a[0],dz=e[1]-a[1],len=Math.hypot(dx,dz);if(!len)continue;if(twoWay&&r.width>=16){let nx=-dz/len*.2,nz=dx/len*.2;for(const side of [-1,1])strip([[a[0]+nx*side,a[1]+nz*side],[e[0]+nx*side,e[1]+nz*side]],.16,.08,'#d4b457')}else{for(let j=3;j<len;j+=18){let t=j/len,t2=Math.min(j+7,len)/len;strip([[a[0]+dx*t,a[1]+dz*t],[a[0]+dx*t2,a[1]+dz*t2]],.22,.08,'#dad5c4')}}}}}
 for(const s of Geo.streams)if(s.tunnel==='no')strip(s.p,s.type==='river'?11:4,.03,'#4a8795');
 const waterSurfaces=[];for(const b of surfaceBatches.values()){let isRoad=b.color==='#555e61',isCement=b.color==='#c3c0ad',isWater=b.color==='#4a8795',isMark=b.color==='#d4b457'||b.color==='#dad5c4';let geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(b.p,3));let uv=[],scale=isWater?18:isRoad?3.8:2.8;for(let i=0;i<b.p.length;i+=3)uv.push(b.p[i]/scale,b.p[i+2]/scale);geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.computeVertexNormals();let m=material(isRoad?'#707373':isCement?'#c6c4bc':b.color,{map:isRoad?asphaltTexture:isCement?cementTexture:isWater?waterTexture:null,normalMap:isRoad?asphaltNormal:isCement?sidewalkNormal:null,normalScale:new T.Vector2(isRoad?.72:.38,isRoad?.72:.38),roughnessMap:isRoad?asphaltRough:isCement?sidewalkRough:null,side:T.DoubleSide,roughness:isWater?.14:isRoad?.86:.94,metalness:isWater?.38:0});
  if(isRoad||isCement||isMark){
   m.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader
     .replace('#include <common>','#include <common>\nvarying vec3 vRoadPos;')
     .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvRoadPos=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader=shader.fragmentShader
     .replace('#include <common>',`#include <common>
varying vec3 vRoadPos;
float rHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float rNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(rHash(i),rHash(i+vec2(1,0)),f.x),mix(rHash(i+vec2(0,1)),rHash(i+vec2(1,1)),f.x),f.y);}`)
     .replace('#include <map_fragment>',isRoad?`#ifdef USE_MAP
 // Blend rotated dual-scale asphalt to eliminate visible tiling + add real road wear patches.
 vec2 rotUv=mat2(0.8,-0.6,0.6,0.8)*vMapUv*0.33+vec2(0.41,0.17);
 vec3 aNear=texture2D(map,vMapUv).rgb;
 vec3 aFar=texture2D(map,rotUv).rgb;
 float patchMask=rNoise(vRoadPos.xz*0.085);
 float wear=rNoise(vRoadPos.xz*0.28+3.2)*0.6+rNoise(vRoadPos.xz*0.95)*0.4;
 vec3 asphalt=mix(aNear,aFar,0.42);
 // Sun-bleached aggregate vs darker repaired asphalt patches.
 asphalt*=mix(0.84,1.14,patchMask)*mix(0.92,1.06,wear);
 diffuseColor.rgb*=asphalt;
#endif`:isCement?`#ifdef USE_MAP
 vec2 sFar=vMapUv*0.28+vec2(0.23,0.61);
 vec3 cTex=mix(texture2D(map,vMapUv).rgb,texture2D(map,sFar).rgb,0.35);
 // Realistic 1.5m concrete sidewalk expansion joints + mottled weathering.
 vec2 j=abs(fract(vRoadPos.xz/1.55)-0.5);
 float seam=1.0-0.22*(1.0-smoothstep(0.47,0.498,max(j.x,j.y)));
 float mottle=0.90+0.18*rNoise(vRoadPos.xz*0.24);
 diffuseColor.rgb*=cTex*seam*mottle;
#endif`:`#include <map_fragment>
 // Sun-faded, slightly chipped road paint rather than crisp digital stripes.
 float wear=rNoise(vRoadPos.xz*1.6)*0.6+rNoise(vRoadPos.xz*4.5)*0.4;
 diffuseColor.rgb*=mix(0.76,1.02,smoothstep(0.18,0.82,wear));`)
     .replace('#include <roughnessmap_fragment>',isRoad?`#include <roughnessmap_fragment>
 float rPatch=rNoise(vRoadPos.xz*0.11+1.7);
 float rMicro=rNoise(vRoadPos.xz*3.8);
 roughnessFactor=clamp(roughnessFactor*mix(0.76,1.08,rPatch)+(rMicro-0.5)*0.12,0.52,0.98);`:`#include <roughnessmap_fragment>`);
   };
  }
  if(isWater){m.onBeforeCompile=shader=>{shader.uniforms.waterTime={value:0};shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float waterTime;').replace('#include <color_fragment>','#include <color_fragment>\n diffuseColor.rgb *= 0.95 + 0.05*sin(vMapUv.x*5.0+waterTime)*sin(vMapUv.y*3.0-waterTime*0.6);');waterSurfaces.push(shader.uniforms.waterTime)}}let mesh=new T.Mesh(geo,m);mesh.receiveShadow=true;scene.add(mesh)}

 // Small repeated details are instanced rather than individual draw calls.
 let seed=913;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};const check=document.createElement('canvas').getContext('2d');const treePts=[];
 for(const area of Geo.areas){let box=area.box,attempts=Math.min(130,Math.floor((box.r-box.x)*(box.b-box.y)/1800));for(let i=0;i<attempts;i++){let x=box.x+rand()*(box.r-box.x),z=box.y+rand()*(box.b-box.y);if(x<0||z<0||x>Geo.W||z>Geo.H||!check.isPointInPath(area.path,x,z)||Geo.blocked(x,z))continue;let near=Geo.nearestRoad(x,z);if(near.distance<near.r.width/2+6)continue;treePts.push({x:x*S,z:z*S,s:.7+rand()*.8})}}
 // Plant occasional street trees only on clear sidewalks and away from junctions.
 for(let i=0;i<Geo.roads.length;i++){const r=Geo.roads[i];if(i%5||!r.drive||!r.name||r.type==='service'||r.type.includes('motorway'))continue;const a=r.p[0],b=r.p.at(-1);if(Math.hypot(b[0]-a[0],b[1]-a[1])<34)continue;const p=Geo.routePoint(r,18+rand()*12),side=rand()<.5?-1:1,offset=r.width/2+3.1,x=p.x-Math.sin(p.angle)*offset*side,z=p.y+Math.cos(p.angle)*offset*side;if(x<50||z<50||x>Geo.W-50||z>Geo.H-50||Geo.blocked(x,z))continue;const near=Geo.nearestRoad(x,z,true);if(near.r.id!==r.id||near.distance<near.r.width/2+2)continue;treePts.push({x:x*S,z:z*S,s:.65+rand()*.32})}
 function instance(geometry,mat,points,compose){let mesh=new T.InstancedMesh(geometry,mat,points.length),o=new T.Object3D();for(let i=0;i<points.length;i++){compose(o,points[i]);o.updateMatrix();mesh.setMatrixAt(i,o.matrix)}mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);return mesh}
 // Procedural leafy foliage texture so tree crowns read as textured New England canopy, not smooth blobs.
 const leafCanvas=document.createElement('canvas');leafCanvas.width=leafCanvas.height=256;const lc=leafCanvas.getContext('2d');
 lc.fillStyle='#3d4e34';lc.fillRect(0,0,256,256);let ls=419;const lrand=()=>{ls=(ls*1664525+1013904223)>>>0;return ls/4294967296};
 for(let i=0;i<900;i++){const x=lrand()*256,y=lrand()*256,rx=4+lrand()*8,ry=2+lrand()*5,a=lrand()*Math.PI;lc.fillStyle=['#314228','#485c3a','#596d46','#687c51','#263520'][i%5];lc.beginPath();lc.ellipse(x,y,rx,ry,a,0,Math.PI*2);lc.fill()}
 const leafTex=new T.CanvasTexture(leafCanvas);leafTex.colorSpace=T.SRGBColorSpace;leafTex.wrapS=leafTex.wrapT=T.RepeatWrapping;leafTex.repeat.set(2,2);
 const leafMat=col=>material(col,{map:leafTex,bumpMap:leafTex,bumpScale:.08,roughness:.92});
 instance(new T.CylinderGeometry(.12,.19,2.5,7),material('#54473b',{roughness:.95}),treePts,(o,p)=>{o.position.set(p.x,1.25*p.s,p.z);o.scale.setScalar(p.s)});
 const crown=new T.DodecahedronGeometry(1.45,1);
 instance(crown,leafMat('#8f9c82'),treePts,(o,p)=>{o.position.set(p.x,3.45*p.s,p.z);o.scale.set(p.s*1.12,p.s*1.2,p.s*1.12)});
 instance(crown,leafMat('#a2ad92'),treePts,(o,p)=>{o.position.set(p.x+.75*p.s,3.75*p.s,p.z+.28*p.s);o.scale.set(p.s*.8,p.s*.9,p.s*.82)});
 instance(crown,leafMat('#aeb69d'),treePts,(o,p)=>{o.position.set(p.x-.68*p.s,4.0*p.s,p.z-.32*p.s);o.scale.set(p.s*.74,p.s*.82,p.s*.76)});
 const poles=[];for(let i=0;i<Geo.roads.length;i++){let r=Geo.roads[i];if(!r.drive||!r.name||i%3)continue;let p=Geo.routePoint(r,15);if(p.x<0||p.y<0||p.x>Geo.W||p.y>Geo.H)continue;let off=(r.width/2+2)*S;poles.push({x:p.x*S-Math.sin(p.angle)*off,z:p.y*S+Math.cos(p.angle)*off})}
 instance(new T.CylinderGeometry(.045,.07,5.8,5),material('#5f6b66'),poles,(o,p)=>{o.position.set(p.x,2.9,p.z);o.scale.set(1,1,1)});instance(new T.BoxGeometry(.45,.16,.7),material('#e5e3c6',{emissive:'#b4a66c',emissiveIntensity:.2}),poles,(o,p)=>{o.position.set(p.x,5.85,p.z);o.scale.set(1,1,1)});
 function sign(text,x,y,z,width=4){let ca=document.createElement('canvas');ca.width=512;ca.height=96;let co=ca.getContext('2d');co.fillStyle='#203c35';co.fillRect(0,0,512,96);co.strokeStyle='#e0e7cc';co.lineWidth=5;co.strokeRect(5,5,502,86);co.fillStyle='#f0f2dc';co.font='600 30px sans-serif';co.textAlign='center';co.fillText(text,256,59,480);let tex=new T.CanvasTexture(ca);tex.colorSpace=T.SRGBColorSpace;let sprite=new T.Sprite(new T.SpriteMaterial({map:tex,depthTest:true}));sprite.scale.set(width,width*96/512,1);sprite.position.set(x,y,z);scene.add(sprite);return sprite}
 const named=new Set();for(const r of Geo.roads){if(!r.name||named.has(r.name)||r.type==='service'||!r.drive)continue;let p=Geo.routePoint(r,8);if(p.x<100||p.y<100||p.x>Geo.W-100||p.y>Geo.H-100)continue;named.add(r.name);let off=(r.width/2+1)*S;sign(r.name,p.x*S-Math.sin(p.angle)*off,2.9,p.y*S+Math.cos(p.angle)*off,3)}
 const landmarkObjects=[];function landmark(name,x,z){let ring=new T.Mesh(new T.TorusGeometry(1,.06,6,40),material('#c4f678',{emissive:'#99cc55',emissiveIntensity:.3}));ring.rotation.x=Math.PI/2;ring.position.set(x,.15,z);scene.add(ring);let marker=new T.Mesh(new T.OctahedronGeometry(.28),material('#d7ec9e',{emissive:'#99bb55',emissiveIntensity:.4}));marker.position.set(x,2.7,z);scene.add(marker);let label=sign(name,x,3.5,z,2.5);label.visible=false;landmarkObjects.push({ring,marker,label});return marker}
 function box(w,h,d,col,x=0,y=0,z=0,parent=scene){const m=new T.Mesh(new T.BoxGeometry(w,h,d),material(col));m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;parent.add(m);return m}
 // A restrained museum-ship silhouette at Battleship Cove, beside the mapped waterfront.
 const cove=Geo.data.pois.find(p=>p.name==='Battleship Cove'&&p.tags.tourism);if(cove){let x=cove.p[0]*S-18,z=cove.p[1]*S;let ship=new T.Group();ship.position.set(x,.3,z);ship.rotation.y=-.17;scene.add(ship);box(15,3.5,125,'#7d8b8b',0,1.5,0,ship);box(10,2.2,105,'#9aa5a1',0,4.2,0,ship);box(7,7,21,'#8a9997',0,8,0,ship);box(3,11,6,'#687c7c',0,13,0,ship);for(let t of [-40,39]){box(6,2,8,'#a1aaa5',0,6,t,ship);for(let k=-1;k<=1;k++)box(.32,.32,13,'#7d8d89',k*1.2,6.5,t-8,ship)}}
 const streetDetails=addStreetDetail(scene,Geo);
 function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}addEventListener('resize',resize);
 return{renderer,scene,camera,sun,wallMeshes,landmark,landmarkObjects,box,material,buildingCount,special,waterSurfaces,propColliders:[...streetDetails.colliders,...treePts.map(p=>({x:p.x,z:p.z,radius:.18*p.s,kind:'tree'})),...poles.map(p=>({x:p.x,z:p.z,radius:.08,kind:'lamp post'}))]};
}
// Shared traffic geometry keeps the richer silhouettes inexpensive across the city.
const trafficParts=(()=>{
 function shell(sections){const vertices=[];function face(a,b,c,d){vertices.push(...a,...b,...c,...a,...c,...d)}for(let i=1;i<sections.length;i++){let [z,w,b,t]=sections[i-1],[z2,w2,b2,t2]=sections[i];face([-w,b,z],[-w2,b2,z2],[-w2,t2,z2],[-w,t,z]);face([w,b,z],[w,t,z],[w2,t2,z2],[w2,b2,z2]);face([-w,t,z],[-w2,t2,z2],[w2,t2,z2],[w,t,z])}let first=sections[0],last=sections.at(-1);for(const [z,w,b,t] of [first,last])face([-w,b,z],[-w,t,z],[w,t,z],[w,b,z]);const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.computeVertexNormals();return g}
 return {body:shell([[-2.1,.77,.43,.83],[-1.72,.89,.43,1.02],[1.34,.9,.43,1.03],[2.08,.78,.46,.81]]),cabin:shell([[-1.42,.75,1.01,1.03],[-.91,.68,1.03,1.55],[.62,.67,1.03,1.55],[1.25,.76,1.03,1.04]]),tire:new T.CylinderGeometry(.34,.34,.2,20),hub:new T.CylinderGeometry(.22,.22,.215,16),light:new T.BoxGeometry(.42,.09,.035),bumper:new T.BoxGeometry(1.55,.09,.07),roof:new T.BoxGeometry(1.31,.055,1.5)};
})();
const trafficMaterials={glass:new T.MeshPhysicalMaterial({color:'#182329',metalness:.1,roughness:.06,clearcoat:1,envMapIntensity:1.7,side:T.DoubleSide}),rubber:new T.MeshStandardMaterial({color:'#1a1d1f',roughness:.92}),hub:new T.MeshStandardMaterial({color:'#a4abae',metalness:.82,roughness:.24}),trim:new T.MeshStandardMaterial({color:'#23272a',roughness:.65}),head:new T.MeshStandardMaterial({color:'#fff6e5',emissive:'#c2b79c',emissiveIntensity:.3}),tail:new T.MeshStandardMaterial({color:'#98221c',emissive:'#5c100a',emissiveIntensity:.28})};
const contactShadowTex=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),r=g.createRadialGradient(64,64,12,64,64,62);r.addColorStop(0,'rgba(8,10,14,0.72)');r.addColorStop(.55,'rgba(8,10,14,0.42)');r.addColorStop(1,'rgba(8,10,14,0)');g.fillStyle=r;g.fillRect(0,0,128,128);return new T.CanvasTexture(c)})();
const contactShadowMat=new T.MeshBasicMaterial({map:contactShadowTex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
export function makeCar(city,color='#bbad79'){
 const root=new T.Group();city.scene.add(root);const paint=new T.MeshPhysicalMaterial({color,metalness:.26,roughness:.28,clearcoat:.85,clearcoatRoughness:.09,envMapIntensity:1.25,side:T.DoubleSide}),tail=trafficMaterials.tail.clone(),body=new T.Group();root.add(body);
 const shadow=new T.Mesh(new T.PlaneGeometry(2.35,4.9),contactShadowMat);shadow.rotation.x=-Math.PI/2;shadow.position.y=.025;root.add(shadow);
 function add(geometry,mat,x=0,y=0,z=0,parent=body){const m=new T.Mesh(geometry,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
 add(trafficParts.body,paint);add(trafficParts.cabin,trafficMaterials.glass);add(trafficParts.roof,paint,0,1.56,-.15);
 for(const side of [-1,1]){for(const z of [-1.3,1.3]){const tire=add(trafficParts.tire,trafficMaterials.rubber,side*.88,.36,z,root);tire.rotation.z=Math.PI/2;const hub=add(trafficParts.hub,trafficMaterials.hub,side*.89,.36,z,root);hub.rotation.z=Math.PI/2}add(trafficParts.light,trafficMaterials.head,side*.52,.83,2.09);add(trafficParts.light,tail,side*.52,.83,-2.11)}
 add(trafficParts.bumper,trafficMaterials.trim,0,.52,2.1);add(trafficParts.bumper,trafficMaterials.trim,0,.52,-2.12);
 // Per-car tail material so one car's brake lights do not light the whole fleet; body group tilts, wheels stay put.
 const pivot=new T.Vector3(0,.45,0),tmp=new T.Vector3(),base=tail.emissiveIntensity;
 root.userData.setBrake=a=>{tail.emissiveIntensity=base+a*2.4};
 root.userData.setTilt=(pitch,roll)=>{body.rotation.set(pitch,0,roll);body.position.copy(pivot).sub(tmp.copy(pivot).applyEuler(body.rotation))};
 return root;
}
