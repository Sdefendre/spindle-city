import {buildCity,makeCharacter,makeCar,T} from './city3d.js';
import {makeModelY} from './vehicles.js';
import {makePresentation} from './presentation.js';
import {makeDetailedCharacter} from './character-model.js';
import {makeCockpit} from './cockpit.js';
import {createPedestrians} from './pedestrians.js';
import {createNPC} from './npc-model.js';
import {planRoadRoute} from './route-planner.js';
import {addFallRiverLandmarks} from './fall-river-landmarks.js';
import {createPadState,readPad,getPads,requireNeutral,mergeAxis,rumblePad} from './gamepad.js';
import {createPlayerDriving} from './player-car.js';
import {createDriveFeel,SHAKE_HIT,HARD_HIT} from './drive-feel.js';
import {placeTrafficCar,updateTraffic} from './traffic.js';
import {createDrivingAudio} from './audio.js';
import {drawDrivingDisplay,drawNavigation} from './fsd-view.js';
import {createPedestrianPhysics} from './pedestrian-physics.js';
import {createRealityView} from './reality-view.js';
import {createGaussianSplatCity} from './gaussian-splat.js';
import {createParkedCars} from './parked-cars.js';
import {createPhotorealTiles} from './photoreal-tiles.js';

const isMobile=matchMedia('(pointer:coarse)').matches;
const $=id=>document.getElementById(id),canvas=$('game'),config=window.activeCity,Geo=window.Geo;let city;
const gy=(x,z)=>Geo.groundY?Geo.groundY(x,z):0;
try{city=buildCity(canvas,Geo)}catch(e){$('play').disabled=true;$('play').textContent='3D graphics unavailable';$('loadStatus').textContent='This view needs WebGL 2. Open the game in a current browser with hardware acceleration enabled.';throw e}
city.updateSignals?.(0);

const {renderer,scene,cityGroup,camera,sun}=city,character=makeDetailedCharacter(scene),mini=$('mini').getContext('2d'),S=1/1.5,KEY=config.id==='fall-river'?'spindle-city-real-map-v2':'spindle-city-real-map-v3:'+config.id;
const presentation=makePresentation(renderer,scene,camera),cockpit=makeCockpit(scene,camera),playerDriving=createPlayerDriving(Geo,city),driveFeel=createDriveFeel(camera);let lastHardHit=-9;
const realityView=createRealityView(scene,Geo);
const audioEngine=createDrivingAudio();let soundOn=true,mapStreet=false,mapPreview=null,touchThrottle=0,touchBrake=0,touchReverse=false,touchBoost=0,mapDrawTime=0;
try{soundOn=localStorage.getItem('tesla-city-sound')!=='off'}catch{}audioEngine.setMuted(!soundOn);
let graphicsMode='auto';try{graphicsMode=localStorage.getItem('tesla-city-graphics')||'auto'}catch{}
presentation.setQuality(graphicsMode==='auto'?(isMobile?'mobile':'high'):graphicsMode);$('graphicsPreset').value=graphicsMode;

// Reality View FSD v15 modes:
// cameraMode: 'reality' (elevated GTA/drone third-person) | 'overhead' (bird's-eye) | 'cockpit' (first-person Model Y)
let cameraMode='reality',splitOpen=false,quietMode=false,splitTransform=null;
const PROFILES=[{name:'Chill',speed:9.0},{name:'Standard',speed:13.2},{name:'Hurry',speed:17.8}];
let profileIdx=1;

if(config.id==='fall-river')addFallRiverLandmarks(cityGroup,Geo);
const specs=config.places;
function sourceFor(name){let options=Geo.data.pois.filter(p=>p.name===name&&p.p[0]>0&&p.p[0]<Geo.W&&p.p[1]>0&&p.p[1]<Geo.H),p=options.find(p=>p.tags.tourism)||options[0];if(p)return p;let b=Geo.buildings.find(b=>b.name===name);if(b)return{p:[(b.box.x+b.box.r)/2,(b.box.y+b.box.b)/2],tags:{building:b.type}};let road=Geo.roads.find(r=>r.name===name);return road?{p:road.p[Math.floor(road.p.length/2)],tags:{highway:road.type}}:null}
const places=specs.map(([name,desc])=>{let p=sourceFor(name);if(!p)return null;let safe=Geo.safePoint(...p.p);return{name,desc,x:safe.x,y:safe.y,marker:city.landmark(name,safe.x*S,safe.y*S)}}).filter(Boolean);
const tourNames=config.tours;
const tour=document.getElementById('architectureTour');
for(const name of tourNames){const src=Geo.buildings.find(b=>b.name===name);if(!src)continue;let cx=(src.box.x+src.box.r)/2,cy=(src.box.y+src.box.b)/2,road=Geo.nearestRoad(cx,cy,true,true);let spot=name==='Fall River City Hall'?Geo.safePoint(2070,3970):Geo.safePoint(road.x,road.y);const btn=document.createElement('button');btn.textContent=name;btn.onclick=()=>{if(autoRoute)cancelAuto();if(vehicle){driveFeel.resetCar(vehicle);vehicle.parked=true;vehicle.root.visible=true;vehicle=null}player.x=spot.x;player.y=spot.y;player.heading=Math.atan2(cx-player.x,cy-player.y);yaw=player.heading-Math.PI;pitch=-.12;cameraSnap=true;character.root.visible=!firstPerson;mapOpen=false;$('mapOverlay').classList.add('hidden');$('mode').textContent=firstPerson?'FIRST PERSON':'ON FOOT';toast(name+' · reference-based exterior')};tour.append(btn)}
let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')}catch{}let found=new Set((saved.found||[]).filter(n=>places.some(p=>p.name===n)));
const highway=Geo.roads.find(r=>r.drive&&(r.id===config.highwayRoadId||config.highway.test(r.name)));const highwayPoint=highway?Geo.routePoint(highway,Math.min(80,highway.p.length*16)):null,downtown=places.find(p=>p.name===config.spawnPlace),downtownRoad=downtown&&Geo.nearestRoad(downtown.x,downtown.y,true),spawnHeading=downtownRoad?Math.PI/2-downtownRoad.angle:2.4;let spawn=Geo.safePoint(...(downtownRoad?[downtownRoad.x,downtownRoad.y]:config.fallbackSpawn)),player={x:spawn.x,y:spawn.y,heading:spawnHeading},yaw=spawnHeading-Math.PI,pitch=0,distance=8.4,firstPerson=false,started=false,paused=false,mapOpen=false,keys={},joy={x:0,y:0},touchRun=false,elapsed=0,phase=0,last=0,nearest=null,vehicle=null,toastTimer,uiTimer=0,cameraSnap=true;
let autoRoute=null,currentRoadType='';
const padState=createPadState();let padFrame=readPad(padState,[]),padLookHold=0,padMenu=null,padStatusKey='',padWarned='',inputFocused=document.hasFocus();
let seed=213;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};const cars=[];
for(let i=0;i<(isMobile?22:45);i++){let route=Geo.driving[Math.floor(rand()*Geo.driving.length)];rand();const root=makeCar(city,['#bdb99e','#536c75','#a56b4f','#b29761','#7d8a72'][i%5]),c={root,route,pos:rand()*300,speed:8+rand()*9,parked:false};placeTrafficCar(Geo,c);cars.push(c)}
let carStart=Geo.nearestRoad(spawn.x+12,spawn.y+5,true),parkedRoot=makeModelY(city),carHeading=Math.PI/2-carStart.angle,curb=Math.max(0,Math.min(3.6,(carStart.r?.width||0)*S/2-1.1))/S,carX=carStart.x-Math.cos(carHeading)*curb,carY=carStart.y+Math.sin(carHeading)*curb;if(Geo.blocked(carX,carY)){carX=carStart.x;carY=carStart.y}cars.push({root:parkedRoot,x:carX,y:carY,heading:carHeading,parked:true,speed:0,velocity:0,model:'White Tesla Model Y'});
const crowd=createPedestrians(scene,Geo,rand);crowd.update(0,0,player);
const civilianModels=['womanCasual','manWorkwear','manJacket'];
crowd.nearest(player,isMobile?1:3).forEach((person,i)=>crowd.replaceCharacter(person,(world,p)=>createNPC(world,{variant:civilianModels[i],fallbackVariant:p.variant})));
crowd.update(0,0,player);
const pedestrianPhysics=createPedestrianPhysics(scene,Geo,{mobile:isMobile});
const parkedCars=createParkedCars(cityGroup,Geo,spawn,city.propColliders,isMobile?95:170);
const splatCity=createGaussianSplatCity(scene,Geo,spawn);
const photorealTiles=createPhotorealTiles(scene,Geo,config.id);
const ray=new T.Raycaster(),target=new T.Vector3(),desired=new T.Vector3(),direction=new T.Vector3();

// Lightweight falling rain streaks around the camera (single LineSegments draw call, zero per-frame allocations)
let rainOn=false;
const RAIN_COUNT=isMobile?420:900;
const rainPos=new Float32Array(RAIN_COUNT*6);
const rainDrops=Array.from({length:RAIN_COUNT},(_,i)=>({x:((i*73.13)%44)-22,y:((i*19.73)%22),z:((i*41.37)%44)-22,s:16+(i%7)*1.8}));
const rainGeo=new T.BufferGeometry();rainGeo.setAttribute('position',new T.BufferAttribute(rainPos,3));
const rainMat=new T.LineBasicMaterial({color:'#c6dcf0',transparent:true,opacity:0,depthWrite:false});
const rainLines=new T.LineSegments(rainGeo,rainMat);rainLines.frustumCulled=false;rainLines.visible=false;scene.add(rainLines);
function updateRain(dt,cx,cy,cz){
 const targetWet=rainOn?1:0;
 city.wetUniform.value+=(targetWet-city.wetUniform.value)*Math.min(1,dt*2.4);
 const w=city.wetUniform.value;
 rainLines.visible=w>0.03;
 if(!rainLines.visible)return;
 rainMat.opacity=w*0.36;
 let pi=0;
 for(let i=0;i<RAIN_COUNT;i++){
  const d=rainDrops[i];
  d.y-=d.s*dt;
  if(d.y<0)d.y+=22;
  const rx=cx+d.x,ry=cy+d.y,rz=cz+d.z;
  rainPos[pi++]=rx;rainPos[pi++]=ry;rainPos[pi++]=rz;
  rainPos[pi++]=rx+0.12;rainPos[pi++]=ry-0.85;rainPos[pi++]=rz+0.06;
 }
 rainGeo.attributes.position.needsUpdate=true;
}
function toggleRain(){
 rainOn=!rainOn;
 $('rvRainBtn')?.classList.toggle('active',rainOn);
 toast(rainOn?'Rain & wet-asphalt puddle reflections on (R)':'Skies clearing · road drying');
}
function placeCarOnTerrain(c){
 const cx=c.x*S,cz=c.y*S,cg=gy(cx,cz);
 c.root.position.set(cx,.08+cg,cz);
 c.root.rotation.order='YXZ';
 const fx=Math.sin(c.heading),fz=Math.cos(c.heading);
 const hf=gy(cx+fx*1.8,cz+fz*1.8),hb=gy(cx-fx*1.8,cz-fz*1.8);
 const hr=gy(cx+fz*0.9,cz-fx*0.9),hl=gy(cx-fz*0.9,cz+fx*0.9);
 c.root.rotation.set(-Math.atan2(hf-hb,3.6),c.heading,Math.atan2(hr-hl,1.8)*0.65);
}
for(const c of cars)placeCarOnTerrain(c);

function save(){try{localStorage.setItem(KEY,JSON.stringify({found:[...found]}))}catch{}}
function refresh(){const n=found.size,total=places.length;$('count').textContent=n+' / '+total;$('progressBar').style.width=n/Math.max(1,total)*100+'%';$('placeList').replaceChildren(...places.map(p=>{let s=document.createElement('span');s.className='place'+(found.has(p.name)?' found':'');s.textContent=(found.has(p.name)?'✓ ':'◇ ')+p.name;return s}))}refresh();
function toast(t){$('toast').textContent=t;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3600)}
function openCities(){keys={};joy={x:0,y:0};$('cityOverlay').classList.remove('hidden');$('cityChoices').querySelector('button:not([aria-current="true"])')?.focus()}
function closeCities(){$('cityOverlay').classList.add('hidden')}
function changeCity(id){if(id===config.id){closeCities();return}try{localStorage.setItem(window.CITY_SELECTION_KEY,id)}catch{}location.reload()}
for(const choice of Object.values(window.CITY_CONFIGS)){let button=document.createElement('button');button.className='city-choice';button.setAttribute('aria-current',String(choice.id===config.id));button.innerHTML=`<b>${choice.name}</b><span>${choice.id===config.id?'Current destination · ':''}${choice.id==='new-bedford'?'Historic district and working waterfront':'Waterfront, downtown and South End'}</span>`;button.onclick=()=>changeCity(choice.id);$('cityChoices').append(button)}
$('cityButton').onclick=openCities;$('startCityButton').onclick=openCities;$('mapCityButton').onclick=()=>{mapOpen=false;$('mapOverlay').classList.add('hidden');openCities()};$('closeCities').onclick=closeCities;
$('welcome').textContent=config.welcome;$('introCopy').innerHTML=config.intro+'<br>Follow glowing sky-blue FSD paths, AR sky chevrons, and tap any road to go.';$('mapTitle').textContent=config.name.toUpperCase()+' · FSD v15';$('rvSplitCity').textContent=config.name.toUpperCase();$('clockCity').textContent=config.name.toUpperCase()+' · DAYLIGHT';

function isBlocked(x,y,radius=.35){let r=radius*1.5;if([[0,0],[r,0],[-r,0],[0,r],[0,-r]].some(([dx,dy])=>Geo.blocked(x+dx,y+dy)))return true;for(let p of city.propColliders){if(Math.hypot(x*S-p.x,y*S-p.z)<p.radius+radius)return true}if(!vehicle)for(const person of crowd.pedestrians){if(Math.hypot((x-person.x)*S,(y-person.y)*S)<radius+(person.knocked?.55:.27))return true;}for(let c of cars){if(c===vehicle)continue;let dx=(x-c.x)*S,dz=(y-c.y)*S,side=dx*Math.cos(c.heading)-dz*Math.sin(c.heading),forward=dx*Math.sin(c.heading)+dz*Math.cos(c.heading);if(Math.abs(side)<.94+radius*.6&&Math.abs(forward)<2.32+radius*.6)return true}return false}
function move(dx,dy,radius=.35){const sx=player.x,sy=player.y,steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/.5));for(let i=0;i<steps;i++){if(!isBlocked(player.x+dx/steps,player.y,radius))player.x+=dx/steps;if(!isBlocked(player.x,player.y+dy/steps,radius))player.y+=dy/steps}return Math.hypot(player.x-sx,player.y-sy)>.0001}
function nearestCar(){let best=null,dist=7*1.5;for(let c of cars){let d=Math.hypot(player.x-c.x,player.y-c.y);if(d<dist){dist=d;best=c}}return best}

function syncCameraUI(){
 firstPerson=cameraMode==='cockpit';
 $('viewLabel').textContent=cameraMode==='cockpit'?'Cockpit':'Reality';
 $('view').classList.toggle('active',cameraMode==='reality'||cameraMode==='cockpit');
 $('rvOverheadBtn').classList.toggle('active',cameraMode==='overhead');
 $('mode').textContent=!vehicle?(firstPerson?'FIRST PERSON':'ON FOOT'):cameraMode==='reality'?'REALITY VIEW':cameraMode==='overhead'?'BIRD\'S-EYE':'COCKPIT';
 character.root.visible=!firstPerson&&!vehicle;
}
function setCameraMode(mode,quiet=false){
 cameraMode=mode;
 syncCameraUI();
 cameraSnap=false;
 if(!quiet){
  const labels={reality:'Reality View · FSD v15 drone perspective',overhead:'Overhead Bird\'s-Eye view · tap any road to go',cockpit:'First-person Model Y cockpit'};
  toast(labels[mode]||mode);
 }
}
function setView(){
 const order=['reality','overhead','cockpit'];
 setCameraMode(order[(order.indexOf(cameraMode)+1)%order.length]);
}
function toggleOverhead(){
 setCameraMode(cameraMode==='overhead'?'reality':'overhead');
}
function setSplitView(open){
 splitOpen=!!open;
 $('rvSplitPanel').classList.toggle('hidden',!splitOpen);
 document.body.classList.toggle('split-view',splitOpen);
 $('rvSplitBtn').classList.toggle('active',splitOpen);
 if(splitOpen)drawSplitMap();
}
function toggleSplit(){if(!started)return;setSplitView(!splitOpen)}
function toggleQuiet(){
 quietMode=!quietMode;
 document.body.classList.toggle('quiet-mode',quietMode);
 $('rvQuietBtn').classList.toggle('active',quietMode);
 if(quietMode&&splitOpen)setSplitView(false);
 toast(quietMode?'Quiet Mode on · press Q or moon icon to restore':'Quiet Mode off');
}
function cycleSplatMode(){
 const order=['off','hybrid','splat'];
 const next=order[(order.indexOf(splatCity.mode)+1)%order.length];
 splatCity.setMode(next,cityGroup);
 $('rvSplatBtn')?.classList.toggle('active',next!=='off');
 if($('rvSplatLabel'))$('rvSplatLabel').textContent=next==='hybrid'?'3DGS Cloud':next==='splat'?'3DGS Mix':'3DGS';
 const k=Math.round(splatCity.splatCount/1000);
 toast(next==='hybrid'?`3D Gaussian Splat City · ${k}k live splats`:next==='splat'?`Hybrid Neural Splat + Mesh · ${k}k splats`:'Standard Reality View meshes');
}
// Drag-and-drop any real `.splat` capture (Luma / Polycam / Nerfstudio) directly onto the city
addEventListener('dragover',e=>e.preventDefault());
addEventListener('drop',async e=>{
 e.preventDefault();
 const file=e.dataTransfer?.files?.[0];
 if(!file||!file.name.toLowerCase().endsWith('.splat'))return;
 try{
  const buf=await file.arrayBuffer();
  const n=splatCity.loadSplatBuffer(buf,new T.Vector3(player.x*S,0,player.y*S));
  $('rvSplatBtn')?.classList.add('active');
  toast(`Loaded ${file.name} · ${(n/1000).toFixed(1)}k 3D Gaussian splats`);
 }catch(err){toast('Could not parse .splat file: '+err.message)}
});

function navigateToPoint(destPoint,label='Pinned street'){
 if(!started)return false;
 if(!vehicle){
  const model=cars.find(c=>c.model==='White Tesla Model Y')||nearestCar();
  if(model){
   vehicle=model;model.parked=true;model.velocity=0;
   player.x=model.x;player.y=model.y;player.heading=model.heading;yaw=model.heading-Math.PI;
   character.root.visible=false;syncCameraUI();
  }
 }
 const route=planRoadRoute(Geo,{x:player.x,y:player.y},destPoint);
 if(!route||route.points.length<2){toast('No mapped driving route found to '+label);return false}
 autoRoute={...route,index:0,name:label};
 if(vehicle)vehicle.velocity=Math.max(vehicle.velocity||0,2);
 syncFsdUI();
 toast(`FSD v15 · Routing to ${label}`);
 if(splitOpen)drawSplitMap();
 return true;
}

function syncFsdUI(){
 const engaged=!!autoRoute;
 $('rvFsdPill').classList.toggle('engaged',engaged);
 $('rvFsdLabel').textContent=engaged?'FSD v15 · ENGAGED':'REALITY VIEW · FSD v15';
 $('autoButton').classList.toggle('active',engaged);
 $('autoLabel').textContent=engaged?'FSD On':'FSD v15';
 if(!engaged)$('rvManeuver').classList.add('hidden');
}

function interact(){if(!started||paused||mapOpen)return;if(vehicle){audioEngine.event('open');if(autoRoute)cancelAuto();let exit=null;for(let side of [1,-1]){let dx=Math.cos(vehicle.heading)*side*2.1*1.5,dy=-Math.sin(vehicle.heading)*side*2.1*1.5;if(!isBlocked(player.x+dx,player.y+dy)){exit={x:player.x+dx,y:player.y+dy};break}}if(!exit){toast('Find a clear space to step out.');return}driveFeel.resetCar(vehicle);vehicle.parked=true;vehicle.velocity=0;vehicle.root.visible=true;vehicle=null;Object.assign(player,exit);character.root.visible=!firstPerson;syncCameraUI();cameraSnap=true;return}let c=nearestCar();if(c){audioEngine.event('close');vehicle=c;c.parked=true;c.velocity=0;player.x=c.x;player.y=c.y;player.heading=c.heading;yaw=c.heading-Math.PI;character.root.visible=false;syncCameraUI();toast((c.model||'Model Y')+' · Click any road for FSD Tap-to-Go');cameraSnap=true;return}if(nearest)toast(nearest.name+' — '+nearest.desc);else toast('Tap any street in Reality View or press E near your Model Y.')}
function toggleMap(){if(!started)return;mapOpen=!mapOpen;$('mapOverlay').classList.toggle('hidden',!mapOpen);keys={};joy={x:0,y:0};if(mapOpen){if(vehicle)vehicle.velocity=0;mapPreview=vehicle?planRoadRoute(Geo,player,places[Number($('autoDestination').value)]):null;drawMap($('bigmap').getContext('2d'),800,650,true)}}
function setPaused(value){paused=value;$('pauseOverlay').classList.toggle('hidden',!paused);keys={};joy={x:0,y:0};requireNeutral(padState)}
function pause(){if(!started||mapOpen)return;setPaused(!paused)}
function haltForSafety(){audioEngine.setActive(false);touchThrottle=touchBrake=touchBoost=0;keys={};joy={x:0,y:0};touchRun=false;drag=null;padLookHold=0;requireNeutral(padState);if(autoRoute)cancelAuto();if(vehicle){vehicle.velocity=0;vehicle.steer=0}if(started&&!paused){if(mapOpen)toggleMap();setPaused(true)}}
function activeOverlay(){for(const id of ['cityOverlay','mapOverlay','pauseOverlay','start']){const el=$(id);if(!el.classList.contains('hidden'))return el}return null}
function cancelAuto(message){autoRoute=null;syncFsdUI();if(message)toast(message)}

for(const [i,p] of places.entries()){
 const option=document.createElement('option');option.value=String(i);option.textContent=p.name;$('autoDestination').append(option);
 const opt2=document.createElement('option');opt2.value=String(i);opt2.textContent=p.name;$('rvQuickDest').append(opt2);
}
function engageOrToggleFsd(){
 if(!started)return;
 if(autoRoute){cancelAuto('FSD v15 disengaged · manual control');return}
 // Engage FSD immediately to the next undiscovered landmark (or first landmark)
 const pick=places.find(p=>!found.has(p.name))||places[0];
 if(pick)navigateToPoint(pick,pick.name);
}
$('autoButton').onclick=engageOrToggleFsd;
$('rvFsdPill').onclick=engageOrToggleFsd;
$('rvCancelNav').onclick=()=>cancelAuto('Route cancelled');
$('rvProfile').onclick=()=>{profileIdx=(profileIdx+1)%PROFILES.length;$('rvProfile').textContent=PROFILES[profileIdx].name;toast(`FSD profile · ${PROFILES[profileIdx].name}`)};
$('rvOverheadBtn').onclick=toggleOverhead;
$('rvSplitBtn').onclick=toggleSplit;
$('rvCloseSplit').onclick=()=>setSplitView(false);
$('rvFullMapBtn').onclick=()=>{setSplitView(false);toggleMap()};
$('rvQuietBtn').onclick=toggleQuiet;
if($('rvSplatBtn'))$('rvSplatBtn').onclick=cycleSplatMode;
if($('rvRainBtn'))$('rvRainBtn').onclick=toggleRain;
$('rvTimeBtn').onclick=()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'n',bubbles:true}));
if($('gmapsKeyInput')){
 $('gmapsKeyInput').value=photorealTiles.apiKey;
 photorealTiles.onStatus(msg=>{if($('gmapsTilesStatus'))$('gmapsTilesStatus').textContent=msg});
 $('gmapsTilesToggle').onclick=async()=>{
  if(photorealTiles.enabled){
   photorealTiles.disable(cityGroup);
   $('gmapsTilesToggle').classList.remove('active');
   $('gmapsTilesToggle').textContent='Enable 3D Tiles';
   toast('Switched back to local OSM + elevation meshes');
  }else{
   $('gmapsTilesToggle').disabled=true;
   const ok=await photorealTiles.enable($('gmapsKeyInput').value,cityGroup);
   $('gmapsTilesToggle').disabled=false;
   $('gmapsTilesToggle').classList.toggle('active',ok);
   $('gmapsTilesToggle').textContent=ok?'Disable 3D Tiles':'Enable 3D Tiles';
   if(ok)toast('Google Photorealistic 3D Tiles streaming');
  }
 };
}
$('rvQuickGo').onclick=()=>{const p=places[Number($('rvQuickDest').value)];if(p)navigateToPoint(p,p.name)};
$('startAuto').onclick=()=>{$('autoStatus').textContent='';const p=places[Number($('autoDestination').value)];if(!p){$('autoStatus').textContent='Choose a destination.';return}mapOpen=false;$('mapOverlay').classList.add('hidden');keys={};joy={x:0,y:0};navigateToPoint(p,p.name)};

// Click on Split Map Canvas -> Tap-to-Go!
$('splitMapCanvas').addEventListener('click',e=>{
 if(!splitTransform)return;
 const rect=$('splitMapCanvas').getBoundingClientRect();
 const cx=(e.clientX-rect.left)*(460/rect.width),cy=(e.clientY-rect.top)*(520/rect.height);
 const mx=(cx-splitTransform.ox)/splitTransform.scale,my=(cy-splitTransform.oy)/splitTransform.scale;
 const near=Geo.nearestRoad(mx,my,true);
 if(!near)return;
 const safe=Geo.safePoint(near.x,near.y);
 const named=Geo.nearestRoad(safe.x,safe.y,true,true);
 navigateToPoint(safe,named?.r?.name||near.r?.name||'Map pin');
});
$('mini').addEventListener('click',toggleSplit);

addEventListener('keydown',e=>{const el=e.target instanceof Element?e.target:null;if(el?.closest('input,select,textarea,[contenteditable]:not([contenteditable="false"])'))return;if(el?.closest('button,a[href]')&&e.key!=='Escape')return;const menu=activeOverlay(),free=!menu;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();keys[e.key.toLowerCase()]=true;if(e.repeat)return;const k=e.key.toLowerCase();if(free&&k==='e')interact();if((free||menu===$('mapOverlay'))&&k==='m'){if(menu===$('mapOverlay'))toggleMap();else toggleSplit()}if(free&&k==='v')setView();if(free&&k==='b')toggleOverhead();if(free&&k==='q')toggleQuiet();if(free&&k==='x')cycleSplatMode();if(free&&k==='r')toggleRain();if(free&&k==='c'){document.body.classList.toggle('cinematic');toast('C · Show or hide the HUD')}if(free&&k==='f')engageOrToggleFsd();if(e.key==='Escape'){if(!$('cityOverlay').classList.contains('hidden'))closeCities();else if(mapOpen)toggleMap();else if(splitOpen)setSplitView(false);else pause()}});
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
addEventListener('blur',()=>{inputFocused=false;haltForSafety()});
addEventListener('focus',()=>{inputFocused=true;requireNeutral(padState)});
document.addEventListener('visibilitychange',()=>{if(document.hidden)haltForSafety()});document.addEventListener('app-pausing',haltForSafety);
addEventListener('gamepadconnected',()=>{requireNeutral(padState)});
addEventListener('gamepaddisconnected',e=>{if(e.gamepad?.index===padState.index){document.body.classList.remove('pad-active');haltForSafety();toast('Controller disconnected · touch controls restored')}});
document.addEventListener('click',e=>{const b=e.target instanceof Element&&e.target.closest('button');if(b&&e.detail>0&&!b.closest('.overlay'))b.blur()});
addEventListener('pointerdown',()=>document.body.classList.remove('pad-nav'));

// Drag to orbit OR short Tap/Click on 3D Reality View road for Tap-to-Go!
let drag=null;
canvas.addEventListener('pointerdown',e=>{if(!started||paused||mapOpen)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,moved:0};canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved+=Math.hypot(dx,dy);yaw-=dx*.006;pitch=Math.max(-.65,Math.min(.7,pitch+dy*.004));drag.x=e.clientX;drag.y=e.clientY});
const release=e=>{
 if(drag&&e&&drag.moved<7&&cameraMode!=='cockpit'&&started&&!paused&&!mapOpen){
  const pick=realityView.pickRoadAtScreen(e.clientX,e.clientY,camera);
  if(pick)navigateToPoint(pick,pick.name);
 }
 drag=null;
};
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('wheel',e=>{distance=Math.max(4.8,Math.min(18,distance+e.deltaY*.008))},{passive:true});

$('graphicsPreset').onchange=e=>{graphicsMode=e.target.value;presentation.setQuality(graphicsMode==='auto'?(isMobile?'mobile':'high'):graphicsMode);try{localStorage.setItem('tesla-city-graphics',graphicsMode)}catch{}};
$('play').onclick=()=>{
 started=true;inputFocused=true;document.body.classList.add('playing');$('start').classList.add('hidden');cameraSnap=true;
 const model=cars.find(c=>c.model==='White Tesla Model Y');
 if(model){player.x=model.x;player.y=model.y;interact();}
 setCameraMode('reality',true);
 // Start with a suggested active route ready if desired, or let user tap road / press F
 if(soundOn)audioEngine.unlock().then(refreshSound);
 toast('Tesla Reality View · FSD v15 active — click any street to navigate');
};
$('view').onclick=setView;$('mapButton').onclick=toggleSplit;$('closeMap').onclick=toggleMap;$('pause').onclick=pause;$('resume').onclick=pause;$('reset').onclick=()=>{found.clear();save();refresh();drawMap($('bigmap').getContext('2d'),800,650,true)};
function teleport(point,heading,label){if(!point)return;if(autoRoute)cancelAuto();if(vehicle){driveFeel.resetCar(vehicle);vehicle.parked=true;vehicle.root.visible=true;vehicle=null}Object.assign(player,{x:point.x,y:point.y,heading});yaw=heading-Math.PI;cameraSnap=true;character.root.visible=!firstPerson;syncCameraUI();toast(label)}
$('home').onclick=()=>teleport(spawn,spawnHeading,'Back downtown');
$('highwayButton').onclick=()=>{if(!highwayPoint){toast('A mapped highway access point is not available in this extract.');return}if(autoRoute)cancelAuto();const point=Geo.safePoint(highwayPoint.x,highwayPoint.y),heading=Math.PI/2-highwayPoint.angle;vehicle=vehicle||cars.find(c=>c.model==='White Tesla Model Y');vehicle.parked=true;vehicle.velocity=0;vehicle.x=point.x;vehicle.y=point.y;vehicle.heading=heading;Object.assign(player,{x:point.x,y:point.y,heading});yaw=heading-Math.PI;cameraSnap=true;character.root.visible=false;syncCameraUI();toast(config.highwayLabel+' · Reality View')};
$('highwayButton').textContent=config.highwayLabel.replace(' access','');$('highwayButton').title='Jump to '+config.highwayLabel;
$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen?.().catch(()=>toast('Open the game in your browser for full screen.'))};
function refreshSound(){$('sound').textContent=!soundOn?'Muted':audioEngine.ready?'Sound':'Audio';$('sound').classList.toggle('active',soundOn&&audioEngine.ready);$('sound').setAttribute('aria-pressed',String(soundOn&&audioEngine.ready))}
$('sound').onclick=async()=>{if(soundOn&&!audioEngine.ready){await audioEngine.unlock()}else soundOn=!soundOn;audioEngine.setMuted(!soundOn);if(soundOn)await audioEngine.unlock();try{localStorage.setItem('tesla-city-sound',soundOn?'on':'off')}catch{}refreshSound()};refreshSound();
for(const event of ['pointerdown','keydown'])document.addEventListener(event,()=>{if(started&&soundOn&&!audioEngine.ready)audioEngine.unlock().then(refreshSound)},{passive:true});
$('mapViewToggle').onclick=()=>{mapStreet=!mapStreet;$('mapViewToggle').textContent=mapStreet?'Reality Visualization':'Street map';drawMap($('bigmap').getContext('2d'),800,650,true)};
$('autoDestination').onchange=()=>{mapPreview=vehicle?planRoadRoute(Geo,player,places[Number($('autoDestination').value)]):null;drawMap($('bigmap').getContext('2d'),800,650,true)};
function bindPedal(id,set){const el=$(id);el.onpointerdown=e=>{if(activeOverlay())return;el.setPointerCapture(e.pointerId);set(1);if(soundOn)audioEngine.unlock().then(refreshSound)};el.onpointerup=el.onpointercancel=el.onlostpointercapture=()=>set(0)}
bindPedal('boostTouch',v=>touchBoost=v);bindPedal('accelerateTouch',v=>touchThrottle=v);bindPedal('brakeTouch',v=>touchBrake=v);$('gearTouch').onclick=()=>{if(!vehicle)return;if(Math.abs(vehicle.velocity||0)>.3){toast('Stop before changing direction');return}touchReverse=!touchReverse;$('gearTouch').textContent=touchReverse?'R':'D'};
let stickPointer=null;const stick=$('joystick');function stickMove(e){if(stickPointer!==e.pointerId)return;let r=stick.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2,d=Math.hypot(x,y);if(d>36){x=x/d*36;y=y/d*36}joy={x:x/36,y:y/36};stick.firstChild.style.transform=`translate(${x}px,${y}px)`}stick.onpointerdown=e=>{stickPointer=e.pointerId;stick.setPointerCapture(stickPointer);stickMove(e)};stick.onpointermove=stickMove;stick.onpointerup=stick.onpointercancel=()=>{stickPointer=null;joy={x:0,y:0};stick.firstChild.style.transform=''};$('runTouch').onpointerdown=e=>{e.currentTarget.setPointerCapture(e.pointerId);touchRun=true};$('runTouch').onpointerup=$('runTouch').onpointercancel=()=>touchRun=false;$('interactTouch').onclick=interact;

function displayState(){return{player,cars:cars.filter(c=>c!==vehicle),people:crowd.pedestrians.filter(p=>!p.knocked&&p.c.root.visible),Geo,places,found,route:autoRoute||mapPreview,speed:vehicle?.velocity||0,assist:!!autoRoute,road:$('district').textContent}}
function drawMap(c,w,h,big=false){const state=displayState();if(big&&!mapStreet)drawDrivingDisplay(c,w,h,state);else drawNavigation(c,w,h,{...state,full:big,dark:true})}
function drawSplitMap(){if(!splitOpen)return;splitTransform=drawNavigation($('splitMapCanvas').getContext('2d'),460,520,{...displayState(),full:true,dark:true})}

function update(dt){
 phase+=dt;elapsed+=dt;for(let u of city.waterSurfaces||[])u.value=elapsed;
 city.updateSignals?.(elapsed);
 let forward=(keys.w||keys.arrowup?1:0)-(keys.s||keys.arrowdown?1:0)-joy.y,side=(keys.d?1:0)-(keys.a?1:0)+joy.x;
 if(vehicle)forward=mergeAxis(forward,touchThrottle*(touchReverse?-1:1));
 const pf=padFrame;padLookHold=Math.max(0,padLookHold-dt);
 if(pf.driveInput){side=mergeAxis(side,pf.move.x);forward=mergeAxis(forward,vehicle?pf.throttle-pf.reverse:-pf.move.y)}
 const padBrake=vehicle?Math.max(pf.brake,touchBrake):0;
 const boostRequested=!!vehicle&&(pf.boost||pf.move.y<-.78||keys.shift||touchBoost>0)&&padBrake<.05&&forward>=0&&(vehicle.velocity||0)>-.1;
 let boosting=false;
 if(vehicle){vehicle.boostCharge??=1;if(!boostRequested)vehicle.boostLock=false;if(boostRequested&&!vehicle.boostLock&&vehicle.boostCharge>0){boosting=true;vehicle.boostCharge=Math.max(0,vehicle.boostCharge-dt/2.8);if(!vehicle.boostCharge)vehicle.boostLock=true;forward=1}else vehicle.boostCharge=Math.min(1,vehicle.boostCharge+dt/9);}
 const turn=(keys.arrowleft?1:0)-(keys.arrowright?1:0);yaw+=turn*dt*1.6;let moving=false,running=!!keys.shift||touchRun||pf.sprint;

 if(vehicle){
  let v=vehicle;const before=v.velocity||0;
  if(autoRoute&&(Math.abs(forward)>.05||Math.abs(side)>.05||keys[' ']||pf.driveInput))cancelAuto('FSD v15 disengaged · manual control');
  if(autoRoute){
   while(autoRoute.index<autoRoute.points.length&&Math.hypot(autoRoute.points[autoRoute.index].x-player.x,autoRoute.points[autoRoute.index].y-player.y)<.45)autoRoute.index++;
   if(autoRoute.index>=autoRoute.points.length){v.velocity=0;const destName=autoRoute.name;cancelAuto(`Arrived · ${destName}`);}
   else{
    const next=autoRoute.points[autoRoute.index],dx=next.x-player.x,dy=next.y-player.y,dist=Math.hypot(dx,dy);
    const targetHeading=Math.atan2(dx,dy);
    const dh=Math.atan2(Math.sin(targetHeading-v.heading),Math.cos(targetHeading-v.heading));
    // Look ahead along route for upcoming sharp turns and slow smoothly
    let turnFactor=Math.abs(dh);
    const ahead=autoRoute.points[Math.min(autoRoute.points.length-1,autoRoute.index+3)];
    if(ahead&&ahead!==next){
     const h2=Math.atan2(ahead.x-next.x,ahead.y-next.y);
     turnFactor=Math.max(turnFactor,Math.abs(Math.atan2(Math.sin(h2-targetHeading),Math.cos(h2-targetHeading)))*0.85);
    }
    const baseCruise=PROFILES[profileIdx].speed;
    const cornerSpeed=baseCruise*Math.max(0.38,1.0-turnFactor*0.52);
    const desiredVel=Math.min(baseCruise,cornerSpeed);
    const prevVel=v.velocity||0;
    const smoothVel=prevVel+(desiredVel-prevVel)*Math.min(1,dt*3.5);
    const step=Math.min(dist,smoothVel*1.5*dt);
    v.heading+=dh*Math.min(1,dt*7.5);
    v.steer=Math.max(-.45,Math.min(.45,-dh));
    moving=move(dx/dist*step,dy/dist*step,.85);
    v.velocity=moving?step/(1.5*dt):0;
    if(!moving&&step>.01)cancelAuto('FSD v15 paused · road ahead blocked');
   }
   v.drive={speed:v.velocity||0,acceleration:dt?((v.velocity||0)-before)/dt:0,lateral:0,impact:0,collision:null,braking:((v.velocity||0)-before)<-0.2,reversing:false,auto:true};
  }else{
   const roadMax=(currentRoadType==='motorway'||currentRoadType==='motorway_link'||currentRoadType==='trunk')?27:18,cap=Math.max(roadMax+(boosting?6:0),Math.abs(v.velocity||0)-3*dt);
   const brake=keys[' ']?1:padBrake>.02?padBrake:0,throttle=brake?0:forward,r=playerDriving.step(v,{throttle,steer:side,brake,maxSpeed:cap,boost:boosting},dt,cars);
   player.x=v.x;player.y=v.y;moving=r.travel>.0001;
   v.drive={speed:v.velocity,acceleration:r.acceleration,lateral:r.lateral,impact:r.impact,collision:r.collision,braking:brake>0||throttle<0&&v.velocity>.05||throttle>0&&v.velocity<-.05,reversing:v.velocity<-.05,auto:false};
   if(r.impact>SHAKE_HIT){driveFeel.impact(r.impact);audioEngine.event('impact',r.impact);const mag=Math.min(1,r.impact/14);rumblePad(padState,mag,mag*0.7,r.impact>=HARD_HIT?240:110)}
   if(r.impact>=HARD_HIT&&elapsed-lastHardHit>1.5){lastHardHit=elapsed;toast('Hard hit · '+(r.collision==='boundary'?'blocked':r.collision||'obstacle')+' · '+Math.round(r.impact*2.237)+' MPH')}
  }
  v.x=player.x;v.y=player.y;player.heading=v.heading;v.root.userData.updateWheels?.(v.velocity||0,v.steer||0,dt);driveFeel.updateCar(v,dt);
  if(!drag&&padLookHold<=0)yaw+=Math.atan2(Math.sin(v.heading-Math.PI-yaw),Math.cos(v.heading-Math.PI-yaw))*(1-Math.exp(-4.2*dt));
  const mph=Math.round(Math.abs(v.velocity)*2.237);
  $('speed').textContent=mph+' MPH';
  $('rvSpeed').textContent=String(mph);
  const activeGear=Math.abs(v.velocity)<.08?'P':v.velocity<0?'R':'D';
  for(const sp of $('rvGear').children)sp.classList.toggle('active',sp.dataset.g===activeGear);
 }else{
  let len=Math.max(1,Math.hypot(forward,side)),dx=(-Math.sin(yaw)*forward+Math.cos(yaw)*side)/len,dz=(-Math.cos(yaw)*forward-Math.sin(yaw)*side)/len;
  if(Math.hypot(dx,dz)>.1){let speed=(running?5.8:2.0)*dt*1.5;moving=move(dx*speed,dz*speed);player.heading=Math.atan2(dx,dz)}
  $('speed').textContent=running&&moving?'RUNNING':moving?'WALKING':'EXPLORING';
  $('rvSpeed').textContent=moving?(running?'13':'4'):'0';
  for(const sp of $('rvGear').children)sp.classList.toggle('active',sp.dataset.g==='P');
 }

 character.root.position.set(player.x*S,.08+gy(player.x*S,player.y*S),player.y*S);character.root.rotation.y=player.heading;character.update(phase,moving,running);
 updateTraffic(Geo,cars,player,vehicle,dt);for(let c of cars)placeCarOnTerrain(c);
 updateRain(dt,player.x*S,gy(player.x*S,player.y*S),player.y*S);
 photorealTiles.update(player.x*S,gy(player.x*S,player.y*S),player.y*S);
 crowd.update(phase,dt,player);const humanImpact=pedestrianPhysics.update(dt,vehicle,crowd.pedestrians,player);if(humanImpact){driveFeel.impact(humanImpact*.4);audioEngine.event('impact',humanImpact*.5)}
 const trafficNear=cars.filter(c=>c!==vehicle&&!c.parked).reduce((best,c)=>Math.min(best,Math.hypot((c.x-player.x)*S,(c.y-player.y)*S)),100);
 audioEngine.update({speed:vehicle?.velocity||0,throttle:forward,lateral:vehicle?.drive?.lateral||0,driving:!!vehicle,walking:!vehicle&&moving,running,nearTraffic:Math.max(0,1-trafficNear/35),inside:firstPerson&&!!vehicle,dt});
 nearest=null;for(const p of places){let d=Math.hypot(player.x-p.x,player.y-p.y);p.marker.rotation.y=phase;p.marker.position.y=(p.marker.userData.gy||0)+2.7+Math.sin(phase*2)*.15;if(d<28){nearest=p;if(!found.has(p.name)){found.add(p.name);save();refresh();toast(found.size===places.length?'Every landmark discovered. Keep exploring!':p.name+' discovered · '+found.size+' / '+places.length)}}}

 // Update Tesla Reality View 3D ribbons + floating AR sky chevrons + 3D Gaussian Splat shader!
 splatCity.update(elapsed,city.nightUniform?.value||0,scene.fog?.color||null);
 const navInfo=realityView.update(elapsed,{player,vehicle,route:autoRoute,assist:!!autoRoute,enabled:true,firstPerson,started});
 if(autoRoute&&navInfo){
  $('rvManeuver').classList.remove('hidden');
  $('rvTurnIcon').textContent=navInfo.dir>0?'↱':navInfo.dir<0?'↰':'↑';
  const feet=Math.round(navInfo.distanceM*3.28084);
  $('rvManeuverDist').textContent=feet>900?`${(feet/5280).toFixed(1)} mi · ${navInfo.label}`:`${Math.max(20,Math.round(feet/10)*10)} ft · ${navInfo.label}`;
  $('rvManeuverDest').textContent=navInfo.name;
 }else{
  $('rvManeuver').classList.add('hidden');
 }

 uiTimer+=dt;if(uiTimer>.22){
  uiTimer=0;
  document.body.classList.toggle('driving',!!vehicle);
  document.body.classList.toggle('first-person',!!vehicle&&firstPerson);
  $('boostStatus').textContent=boosting?'BOOST ACTIVE':(vehicle?.boostCharge??1)>.95?'BOOST READY':'BOOST RECHARGING';
  $('boostCharge').value=vehicle?.boostCharge??1;
  $('interactTouch').textContent=vehicle?'EXIT':'DRIVE';
  let nearbyRoad=Geo.nearestRoad(player.x,player.y,true),near=Geo.nearestRoad(player.x,player.y,true,true);
  currentRoadType=nearbyRoad.r?.type||'';
  $('rvLimitVal').textContent=(currentRoadType==='motorway'||currentRoadType==='motorway_link'||currentRoadType==='trunk')?'60':'35';
  $('district').textContent=near.r?.name||config.name.toUpperCase();
  const c=nearestCar();
  const showPrompt=(!vehicle&&(c||nearest));
  $('prompt').style.display=showPrompt?'block':'none';
  $('prompt').textContent=c?'E · '+(c.model?'Enter Model Y Reality View':'Get in car'):nearest?'E · '+nearest.name:'';
  if(!splitOpen)drawMap(mini,176,148);
  else drawSplitMap();
  $('time').textContent=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
 }
}

function positionCamera(dt){
 driveFeel.begin();
 // Center the Model Y in the left pane when Split View is open (works on Desktop & unfolded iPhone Duo)
 if(splitOpen&&window.innerWidth>=580){
  const panelW=window.innerWidth<=860?Math.min(340,window.innerWidth*0.42):Math.min(420,window.innerWidth*0.36);
  camera.setViewOffset(window.innerWidth,window.innerHeight,panelW*0.48,0,window.innerWidth,window.innerHeight);
 }else{
  camera.clearViewOffset();
 }

 const chaseExtra=driveFeel.chase(dt,{driving:!!vehicle,thirdPerson:!firstPerson&&cameraMode!=='overhead',speed:vehicle?.velocity||0,snap:cameraSnap});
 cockpit.update({...displayState(),visible:!!vehicle&&firstPerson&&vehicle.model==='White Tesla Model Y',speed:vehicle?.velocity||0,steer:vehicle?.steer||0,assist:!!autoRoute});
 if(vehicle)vehicle.root.visible=!firstPerson;

 const px=player.x*S,pz=player.y*S,pg=gy(px,pz);
 const lookAhead=vehicle&&cameraMode==='reality'?4.5:0;
 const fx=Math.sin(player.heading)*lookAhead,fz=Math.cos(player.heading)*lookAhead;
 target.set(px+fx,pg+(vehicle?1.2:1.45),pz+fz);

 if(firstPerson){
  character.root.visible=false;
  const offset=vehicle?-.32:0;
  camera.position.set(px+Math.cos(vehicle?.heading||0)*offset,pg+(vehicle?1.25:1.75),pz-Math.sin(vehicle?.heading||0)*offset);
  camera.lookAt(camera.position.x-Math.sin(yaw)*10,camera.position.y-Math.sin(pitch)*8,camera.position.z-Math.cos(yaw)*10);
 }else if(cameraMode==='overhead'){
  // Reality View elevated bird's-eye virtual camera
  const hDist=14+chaseExtra*0.6;
  desired.set(px+Math.sin(yaw)*hDist,pg+28+pitch*6,pz+Math.cos(yaw)*hDist);
  if(cameraSnap){camera.position.copy(desired);cameraSnap=false}
  else camera.position.lerp(desired,1-Math.exp(-6.5*dt));
  camera.lookAt(px+fx*1.4,pg+0.6,pz+fz*1.4);
 }else{
  // Signature FSD v15 Reality View elevated virtual third-person / drone camera ("GTA IRL")
  let dist=vehicle?Math.max(8.2,distance)+chaseExtra*.65:Math.min(6.2,distance),shoulder=vehicle?0:.4;
  let camY=pg+(vehicle?(4.35+pitch*2.8):(2.25+pitch*2));
  desired.set(px+Math.sin(yaw)*dist+Math.cos(yaw)*shoulder,camY,pz+Math.cos(yaw)*dist-Math.sin(yaw)*shoulder);
  desired.y=Math.max(desired.y,gy(desired.x,desired.z)+1.5);
  direction.copy(desired).sub(target);let len=direction.length();direction.normalize();
  ray.set(target,direction);ray.far=len;
  let hits=ray.intersectObjects(city.wallMeshes,false);
  if(hits.length&&hits[0].distance<len)desired.copy(target).addScaledVector(direction,Math.max(2.2,hits[0].distance-.4));
  if(cameraSnap){camera.position.copy(desired);cameraSnap=false}
  else camera.position.lerp(desired,1-Math.exp(-9.5*dt));
  camera.lookAt(target.x,target.y-pitch*7,target.z);
 }
 sun.position.set(px-65,pg+90,pz-45);sun.target.position.set(px,pg,pz);
 driveFeel.end(dt);
}

function menuFocusables(menu){return [...menu.querySelectorAll('button,select,input,a[href]')].filter(el=>!el.disabled&&el.getClientRects().length)}
function focusMenu(el){if(!el)return;document.body.classList.add('pad-nav');el.focus({preventScroll:false,focusVisible:true});el.scrollIntoView?.({block:'nearest'})}
function navigateMenu(menu,p){const items=menuFocusables(menu),cur=items.indexOf(document.activeElement);
 if(p.back){if(menu.id==='cityOverlay')closeCities();else if(menu.id==='mapOverlay')toggleMap();else if(menu.id==='pauseOverlay')pause();return}
 if(p.map&&menu.id==='mapOverlay'){toggleMap();return}
 if(p.pause&&menu.id==='pauseOverlay'){pause();return}
 const el=items[cur];if(el?.tagName==='SELECT'&&(p.left||p.right)){const n=el.options.length;if(n){el.selectedIndex=(el.selectedIndex+(p.right?1:n-1))%n;el.dispatchEvent(new Event('change',{bubbles:true}))}return}
 if(p.up||p.down||p.left||p.right){focusMenu(cur<0?items[0]:items[(cur+(p.down||p.right?1:items.length-1))%items.length]);return}
 if(p.confirm){if(cur<0){if(menu.id==='start'&&!$('play').disabled)$('play').click();else focusMenu(items[0])}else if(el.tagName==='SELECT')focusMenu(items[(cur+1)%items.length]);else el.click()}}
function updatePadStatus(){const key=padFrame.status+'|'+padFrame.id;if(key===padStatusKey)return;padStatusKey=key;const name=padFrame.id.split('(')[0].trim().slice(0,40)||'Controller';
 const text=padFrame.status==='active'?name+' connected · standard mapping':padFrame.status==='unsupported'?name+' uses a non-standard mapping and is not supported. Try another browser or controller mode.':'No controller detected · connect one and press a button';
 $('padStatus').textContent=text;$('padHint').textContent=padFrame.status==='none'?'Controller: connect and press a button · A start · D-pad menus':text;$('padHint').classList.toggle('pad-warn',padFrame.status==='unsupported');$('padStatus').classList.toggle('pad-warn',padFrame.status==='unsupported');
 if(padFrame.status==='unsupported'&&padWarned!==padFrame.id){padWarned=padFrame.id;toast('Controller not supported: non-standard mapping')}}
function pollPad(dt){const menu=activeOverlay();if(menu!==padMenu){padMenu=menu;requireNeutral(padState)}
 padFrame=readPad(padState,getPads(),{speed:vehicle?.velocity||0});
 document.body.classList.toggle('pad-active',padFrame.status==='active');
 if(padFrame.disconnected){haltForSafety();toast('Controller disconnected · touch controls restored')}
 else if(padFrame.connected){
  const ps=padFrame.isPlayStation;
  toast(ps?'PS5 DualSense connected · R2 gas · L2 brake/rev · L1 FSD · R1 boost · ✕ interact':'Controller connected · RT gas · LT brake/rev · LB FSD · RB boost · A interact');
  rumblePad(padState,0.22,0.35,120);
 }
 updatePadStatus();if(document.hidden||!inputFocused||padFrame.status!=='active')return;
 const p=padFrame.pressed;if(menu){navigateMenu(menu,p);padFrame=readPad(createPadState(),[]);return}
 if(p.pause){pause();return}
 if(p.map){toggleSplit();return}
 if(p.view)setView();
 if(p.confirm)interact();
 if(p.lb)engageOrToggleFsd();
 if(p.up)toggleRain();
 if(p.right)window.dispatchEvent(new KeyboardEvent('keydown',{key:'n',bubbles:true}));
 if(p.down)toggleOverhead();
 if(p.left)toggleQuiet();
 if(p.select)cycleSplatMode();
 if(p.r3){yaw=player.heading-Math.PI;pitch=0;padLookHold=0;}
 const l=padFrame.look;if(l.x||l.y){yaw-=l.x*2.6*dt;pitch=Math.max(-.65,Math.min(.7,pitch+l.y*1.5*dt));padLookHold=1.5}}

let ready=false;
function frame(t){
 let dt=Math.min((t-last)/1000||.016,.05);last=t;pollPad(dt);
 audioEngine.setActive(started&&!paused&&!mapOpen&&inputFocused&&!document.hidden&&$('cityOverlay').classList.contains('hidden'));
 if(mapOpen&&t-mapDrawTime>150){mapDrawTime=t;drawMap($('bigmap').getContext('2d'),800,650,true)}
 if(started&&!paused&&!mapOpen&&$('cityOverlay').classList.contains('hidden'))update(dt);
 else if(!started){character.root.position.set(player.x*S,.08+gy(player.x*S,player.y*S),player.y*S);character.root.rotation.y=player.heading;character.update(t/1000,false,false);realityView.update(t/1000,{player,vehicle:null,route:null,assist:false,enabled:false,firstPerson:false,started:false})}
 if(!paused){positionCamera(dt);presentation.render(t/1000)}
 if(!ready){ready=true;$('play').disabled=false;$('play').innerHTML='Enter Reality View <span>↗</span>';$('loadStatus').textContent='Tap any street for FSD v15 Tap-to-Go · WASD manual drive';if(activeOverlay()===$('start')&&document.body.classList.contains('pad-nav'))focusMenu($('play'));$('game').dataset.ready='true'}
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Day-night, GPS line and courier jobs live in extras.js; this context line is its only hook.
import('./extras.js').then(m=>m.initExtras({Geo,scene,sun,T,toast,S,places,config,presentation,player,nightUniform:city.nightUniform,lampPoolMat:city.lampPoolMat,lampBulbMat:city.lampBulbMat,wetUniform:city.wetUniform,get vehicle(){return vehicle},get started(){return started},get paused(){return paused},get mapOpen(){return mapOpen}})).catch(e=>console.error('extras failed to load',e));
