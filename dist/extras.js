// Day-night cycle, GPS route line, and courier jobs with cash.
// Self-contained: play3d.js passes in a context object and this module hooks
// the presentation render call, so it needs no other changes to the game loop.
// Map coordinates are 1.5 units per metre; world = map * S.
import {planRoadRoute} from './route-planner.js';

export function initExtras(g){
 const {Geo,scene,sun,T,toast,S,places}=g,$=id=>document.getElementById(id);
 const KEY='spindle-extras-v2:'+g.config.id;let st={cash:0,hour:17.25,jobs:0};
 try{Object.assign(st,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch{}
 const gy=(x,z)=>Geo.groundY?Geo.groundY(x,z):0;
 const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(st))}catch{}};
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

 // ---- HUD chip
 const chip=document.createElement('div');chip.id='extrasHud';
 chip.style.cssText='position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 62px);z-index:6;padding:7px 14px;border-radius:999px;background:#14221fd9;border:1px solid #ffffff26;color:#f1f4e9;font:600 12px/1.2 system-ui,sans-serif;letter-spacing:.4px;pointer-events:none;white-space:nowrap';
 document.body.append(chip);

 // ---- day and night: one game day every 20 minutes
 const lights=scene.children.filter(o=>o.isHemisphereLight||o.isAmbientLight).map(o=>({o,base:o.intensity}));
 const base={sun:sun.intensity,sunColor:sun.color.clone(),env:scene.environmentIntensity??1,bg:scene.backgroundIntensity??1,fog:scene.fog?scene.fog.color.clone():null};
 const dusk=new T.Color('#ff9a5c'),nightFog=new T.Color('#0b1220');
 const lamp=new T.SpotLight('#fff1d6',0,70,.55,.6,1.2);lamp.castShadow=false;scene.add(lamp,lamp.target);
 function applySky(){
  const elev=Math.sin((st.hour-6)/12*Math.PI),d=clamp((elev+.1)/.35,0,1),day=d*d*(3-2*d),low=1-clamp(Math.abs(elev)/.4,0,1);
  const wet=g.wetUniform?g.wetUniform.value:0;
  if(g.nightUniform)g.nightUniform.value=1-day;
  if(g.lampPoolMat)g.lampPoolMat.opacity=(1-day)*0.82*(1+0.55*wet);
  if(g.lampBulbMat)g.lampBulbMat.emissiveIntensity=0.25+(1-day)*3.2;
  sun.intensity=base.sun*day*(1-0.52*wet);sun.color.copy(base.sunColor).lerp(dusk,low*.78);
  for(const l of lights)l.o.intensity=l.base*(.18+.82*day)*(1-0.18*wet);
  scene.environmentIntensity=base.env*(.12+.88*day)*(1+1.15*wet);scene.backgroundIntensity=base.bg*(.06+.94*day)*(1-0.30*wet);
  if(base.fog){scene.fog.color.copy(base.fog).lerp(dusk,low*0.28*day).lerp(nightFog,1-day);if(wet>0.01)scene.fog.color.lerp(new T.Color(day<.2?'#0c1424':'#7e8b96'),wet*0.42);}
  const v=g.vehicle;lamp.intensity=v&&day<.45?900*(1-day):0;
  if(v&&lamp.intensity){const fx=Math.sin(v.heading),fz=Math.cos(v.heading),gh=gy(v.x*S,v.y*S);lamp.position.set(v.x*S+fx*1.9,.9+gh,v.y*S+fz*1.9);lamp.target.position.set(v.x*S+fx*30,gh,v.y*S+fz*30)}
  const h=Math.floor(st.hour),m=Math.floor((st.hour-h)*60);
  $('time').textContent=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
  $('clockCity').textContent=g.config.name.toUpperCase()+' · '+(wet>0.35?'RAIN · ':'')+(day<.15?'NIGHT':low>.45?(st.hour<12?'SUNRISE':'GOLDEN HOUR'):'DAYLIGHT');
 }

 // ---- GPS: a route line on the road to the current target
 let target=null,route=null,routeTimer=0,gpsIndex=-1;
 const ribbon=new T.Mesh(new T.BufferGeometry(),new T.MeshBasicMaterial({color:'#38b6ff',transparent:true,opacity:.55,depthWrite:false,side:T.DoubleSide}));
 ribbon.frustumCulled=false;ribbon.renderOrder=2;scene.add(ribbon);
 function drawRoute(){
  const pts=route?route.points:[],pos=[];
  for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,nx=-dy/len*.7,ny=dx/len*.7;
   const q=[[a.x+nx,a.y+ny],[a.x-nx,a.y-ny],[b.x+nx,b.y+ny],[b.x-nx,b.y-ny]].map(p=>[p[0]*S,.17+gy(p[0]*S,p[1]*S),p[1]*S]);
   pos.push(...q[0],...q[1],...q[2],...q[1],...q[3],...q[2])}
  ribbon.geometry.setAttribute('position',new T.Float32BufferAttribute(pos,3));ribbon.visible=pos.length>0;
 }
 function setTarget(point,label){target=point?{x:point.x,y:point.y,label}:null;route=null;routeTimer=0;if(!target)drawRoute()}
 function updateRoute(dt){
  if(!target)return;routeTimer-=dt;if(routeTimer>0)return;routeTimer=2;
  route=planRoadRoute(Geo,g.player,target);drawRoute();
 }

 // ---- courier jobs: drive into the orange beacon, then to the drop-off
 const beacon=color=>{const m=new T.Mesh(new T.CylinderGeometry(3.2,3.2,34,24,1,true),new T.MeshBasicMaterial({color,transparent:true,opacity:.3,depthWrite:false,side:T.DoubleSide}));m.visible=false;scene.add(m);return m};
 const pickupMesh=beacon('#ff9d3c'),dropMesh=beacon('#c4f678');let offer=null,job=null;
 const place=(mesh,p)=>{mesh.position.set(p.x*S,17+gy(p.x*S,p.y*S),p.y*S);mesh.visible=true};
 function roadPoint(from,min,max){
  for(let i=0;i<60;i++){const r=Geo.driving[Math.floor(Math.random()*Geo.driving.length)],p=Geo.routePoint(r,Math.random()*400),d=dist(p,from);
   if(d>min&&d<max&&!Geo.blocked(p.x,p.y))return{x:p.x,y:p.y}}
  return null;
 }
 function newOffer(){offer=roadPoint(g.player,180,620);if(offer)place(pickupMesh,offer);else pickupMesh.visible=false}
 function startJob(){
  for(let i=0;i<12;i++){const drop=roadPoint(offer,500,1500),plan=drop&&planRoadRoute(Geo,offer,drop);
   if(plan){job={drop,length:plan.distance,left:plan.distance/15+28};offer=null;pickupMesh.visible=false;place(dropMesh,drop);setTarget(drop,'Drop-off');toast('Courier job · deliver the parcel before the timer runs out');return}}
  toast('No delivery route from here. Try the next beacon.');newOffer();
 }
 function endJob(done){
  if(done){const pay=Math.round(40+job.length*.06+Math.min(job.left,60)*1.5);st.cash+=pay;st.jobs++;save();toast(`Parcel delivered · +$${pay}`)}
  else toast('Out of time · the parcel went back to the depot');
  job=null;dropMesh.visible=false;setTarget(null);newOffer();
 }
 function updateJobs(dt){
  const p=g.player;
  if(job){job.left-=dt;if(dist(p,job.drop)<16)endJob(true);else if(job.left<=0)endJob(false);return}
  if(!offer||dist(p,offer)>1500)newOffer();
  if(offer&&g.vehicle&&dist(p,offer)<14)startJob();
 }

 addEventListener('keydown',e=>{
  if(e.repeat||!g.started||e.target instanceof Element&&e.target.closest('input,select,textarea'))return;
  const k=e.key.toLowerCase();
  if(k==='g'&&!job){gpsIndex=gpsIndex+1>=places.length?-1:gpsIndex+1;const p=places[gpsIndex];setTarget(p||null,p?.name);toast(p?'GPS · '+p.name:'GPS off')}
  if(k==='n'){st.hour=(st.hour+3)%24;toast('Time skipped three hours')}
 });

 let saveTimer=0;
 function tick(dt){
  st.hour=(st.hour+dt/50)%24;applySky();updateJobs(dt);updateRoute(dt);
  if(target&&!job&&dist(g.player,target)<26){toast('Arrived · '+target.label);gpsIndex=-1;setTarget(null)}
  const s=Math.sin(performance.now()/400)*.5+.5;pickupMesh.material.opacity=.2+.16*s;dropMesh.material.opacity=.2+.16*s;
  const bits=['$'+st.cash];
  if(job)bits.push('PARCEL '+Math.floor(job.left/60)+':'+String(Math.floor(job.left%60)).padStart(2,'0'));
  else if(offer)bits.push('JOB '+Math.round(dist(g.player,offer)/1.5)+' m');
  if(target)bits.push('GPS '+target.label.toUpperCase()+' '+((route?route.distance:dist(g.player,target))/1.5/1609).toFixed(1)+' mi');
  chip.textContent=bits.join('  ·  ');chip.style.display=document.body.classList.contains('cinematic')?'none':'';
  saveTimer+=dt;if(saveTimer>10){saveTimer=0;save()}
 }
 // Run just before each rendered frame, after the game has positioned the sun and camera.
 const render=g.presentation.render.bind(g.presentation);let last=performance.now();
 g.presentation.render=time=>{const now=performance.now(),dt=Math.min(.1,(now-last)/1000);last=now;try{if(g.started&&!g.paused&&!g.mapOpen)tick(dt);else applySky()}catch(e){console.error('extras',e)}render(time)};
 applySky();
 return{state:st,setTarget,tick};
}
