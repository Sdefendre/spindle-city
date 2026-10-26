import {makeCharacter} from './character.js';

// Kept intentionally lightweight: detailed NPCs can later replace individual
// `person.c` entries through replaceCharacter() without changing routing.
const WORLD_SCALE=1/1.5;
const ACTIVE_RADIUS=470;
const CLOSE_VIEW_RADIUS=180;
const RECYCLE_RADIUS=660;
const LOCAL_CROWD=8;
const RECYCLE_INTERVAL=3.5;
const MAX_PEDESTRIANS=24;

const CIVILIANS=[
 {jacket:'#263d58',shirt:'#e3ded1',pants:'#27313a',shoes:'#d8d9d4',sole:'#9ba3a5',skin:'#75452d',hair:'#161514',beard:'#2a1a14',hairStyle:'short',scale:.90},
 {jacket:'#8b4037',shirt:'#eee2cf',pants:'#202c38',shoes:'#eff0ea',sole:'#abb1ae',skin:'#b87955',hair:'#40251c',beard:'#40251c',hairStyle:'cap',scale:.94},
 {jacket:'#3d6045',shirt:'#d9d7c8',pants:'#39332f',shoes:'#25282a',sole:'#6e7574',skin:'#5c3627',hair:'#171411',beard:'#171411',hairStyle:'mohawk',headWidth:1.05,scale:.98},
 {jacket:'#b08a5e',shirt:'#fbf6e8',pants:'#4b5865',shoes:'#e2ded7',sole:'#979da0',skin:'#d5a17c',hair:'#7a4a30',beard:'#7a4a30',hairStyle:'ponytail',beardStyle:'none',headHeight:1.04,scale:.89},
 {jacket:'#5b485f',shirt:'#ded6d1',pants:'#20242a',shoes:'#d0d0ca',sole:'#83898a',skin:'#8a5538',hair:'#211712',beard:'#211712',hairStyle:'short',headWidth:.94,scale:.86},
 {jacket:'#354a62',shirt:'#d2e0e8',pants:'#50624b',shoes:'#292a29',sole:'#6f7370',skin:'#c58b67',hair:'#c59b62',beard:'#c59b62',hairStyle:'short',beardStyle:'none',scale:.96},
 {jacket:'#6a332d',shirt:'#eadbc5',pants:'#2d3634',shoes:'#eee9e0',sole:'#a1a7a5',skin:'#43291f',hair:'#121110',beard:'#121110',hairStyle:'bald',headWidth:1.08,scale:1.00},
 {jacket:'#58605c',shirt:'#ece6d7',pants:'#56657a',shoes:'#d3d7d6',sole:'#929999',skin:'#e0ad85',hair:'#6d5847',beard:'#6d5847',hairStyle:'cap',beardStyle:'none',headHeight:.96,scale:.91},
 {jacket:'#294d52',shirt:'#d8dfdb',pants:'#33333a',shoes:'#222326',sole:'#6d7172',skin:'#a96f50',hair:'#34221a',beard:'#34221a',hairStyle:'ponytail',beardStyle:'none',scale:.93},
 {jacket:'#8a6b3d',shirt:'#f4eadc',pants:'#4a4540',shoes:'#e9e5dc',sole:'#a0a09a',skin:'#6d422d',hair:'#2c1c17',beard:'#2c1c17',hairStyle:'short',scale:.97},
];

const routeLength=route=>route.p.slice(1).reduce((sum,point,index)=>sum+Math.hypot(point[0]-route.p[index][0],point[1]-route.p[index][1]),0);

function eligibleRoutes(Geo){
 // Pedestrians keep away from motorways, trunk corridors, tunnels, and bridges;
 // Geo.blocked() supplies the final building/water rejection for each sidewalk point.
 return Geo.driving.filter(route=>route.name&&route.type!=='service'&&!route.type.includes('trunk')&&route.bridge==='no'&&route.tunnel==='no'&&route.p.length>1&&routeLength(route)>48);
}

function selectRoutes(Geo,random,candidates){
 const buckets=new Map();
 for(const route of candidates){
  const x=(route.box.x+route.box.r)/2,y=(route.box.y+route.box.b)/2;
  const key=`${Math.min(3,Math.floor(x/Geo.W*4))}:${Math.min(3,Math.floor(y/Geo.H*4))}`;
  const bucket=buckets.get(key)||[];bucket.push(route);buckets.set(key,bucket);
 }
 const routes=[];
 for(const bucket of buckets.values()){if(routes.length>=MAX_PEDESTRIANS)break;routes.push(bucket[Math.floor(random()*bucket.length)])}
 const target=Math.min(MAX_PEDESTRIANS,candidates.length);
 while(routes.length<target){const route=candidates[Math.floor(random()*candidates.length)];if(!routes.includes(route))routes.push(route)}
 return routes;
}

function boxDistanceSquared(box,x,y){const dx=x<box.x?box.x-x:x>box.r?x-box.r:0,dy=y<box.y?box.y-y:y>box.b?y-box.b:0;return dx*dx+dy*dy}

function defaultFactory(scene,person){return makeCharacter(scene,{detail:false,variant:person.variant})}

/**
 * Creates a low-cost, route-following civilian population.
 * Returned people retain their route/state, so a detailed model factory can
 * replace only the nearest few later via replaceCharacter(person, factory).
 */
export function createPedestrians(scene,Geo,random=Math.random){
 const rand=typeof random==='function'?random:Math.random;
 const allEligibleRoutes=eligibleRoutes(Geo),routes=selectRoutes(Geo,rand,allEligibleRoutes);
 const pedestrians=[];
 for(const [index,route] of routes.entries()){
  const routeDistance=routeLength(route);let pos=rand()*routeDistance,side=rand()<.5?-1:1;
  let point=Geo.routePoint(route,pos),offset=route.width/2+2.2;
  if(Geo.blocked(point.x-Math.sin(point.angle)*offset*side,point.y+Math.cos(point.angle)*offset*side))side*=-1;
  const variant=CIVILIANS[index%CIVILIANS.length],person={
   id:index,route,pos,side,direction:rand()<.5?-1:1,speed:.82+rand()*.68,
   variant,gaitOffset:rand()*9,pauseOffset:rand()*12,pauseCycle:8+rand()*11,pauseDuration:.45+rand()*1.35,
   scale:variant.scale*(.96+rand()*.08),x:point.x,y:point.y,c:null,
  };
  person.c=defaultFactory(scene,person);person.c.root.scale.setScalar(person.scale);person.c.root.visible=false;pedestrians.push(person);
 }

 function place(person,point=Geo.routePoint(person.route,person.pos)){
  const offset=person.route.width/2+2.2;
  for(const side of [person.side,-person.side]){
   const x=point.x-Math.sin(point.angle)*offset*side,y=point.y+Math.cos(point.angle)*offset*side;
   if(!Geo.blocked(x,y)){person.side=side;person.x=x;person.y=y;return point}
  }
  return null;
 }

 function suitablePlacement(player,minDistance,maxDistance,initial=false,forward=false){
  const limitSquared=maxDistance*maxDistance,nearbyRoutes=allEligibleRoutes.filter(route=>boxDistanceSquared(route.box,player.x,player.y)<=limitSquared);
  if(!nearbyRoutes.length)return null;
  for(let attempt=0;attempt<96;attempt++){
   const route=nearbyRoutes[Math.floor(rand()*nearbyRoutes.length)],pos=rand()*routeLength(route),point=Geo.routePoint(route,pos),offset=route.width/2+2.2;
   for(const side of rand()<.5?[-1,1]:[1,-1]){
    const x=point.x-Math.sin(point.angle)*offset*side,y=point.y+Math.cos(point.angle)*offset*side,distance=Math.hypot(x-player.x,y-player.y);
    if(distance<minDistance||distance>maxDistance||Geo.blocked(x,y))continue;
    // Prefer a side or rear approach when a heading is available, so recycled
    // walkers do not visibly materialize in the player’s immediate view.
    if(Number.isFinite(player.heading)){const forwardX=Math.sin(player.heading),forwardY=Math.cos(player.heading),dot=((x-player.x)*forwardX+(y-player.y)*forwardY)/distance;if(forward&&dot<.25)continue;if(!initial&&distance<CLOSE_VIEW_RADIUS*2.4&&dot>.45)continue}
    return{route,pos,side,x,y};
   }
  }
  return null;
 }

 function relocate(person,placement){
  person.route=placement.route;person.pos=placement.pos;person.side=placement.side;person.direction=rand()<.5?-1:1;person.x=placement.x;person.y=placement.y;person.c.root.visible=false;
 }

 let initialized=false,recycleTimer=0;
 function seedLocalCrowd(player){
  for(const [index,person] of pedestrians.slice(0,LOCAL_CROWD).entries()){
   const placement=(index<3&&suitablePlacement(player,35,130,true,true))||suitablePlacement(player,50,210,true);
   if(placement)relocate(person,placement);
  }
 }

 function update(phase,dt,player){
  if(!initialized){seedLocalCrowd(player);initialized=true}
  recycleTimer+=dt;
  if(recycleTimer>=RECYCLE_INTERVAL){
   recycleTimer=0;
   // One hidden, far-away walker is recycled per interval to keep exploration
   // populated without a burst of models appearing around the player.
   const distant=pedestrians.filter(person=>Math.hypot(person.x-player.x,person.y-player.y)>RECYCLE_RADIUS&&!person.c.root.visible).sort((a,b)=>Math.hypot(b.x-player.x,b.y-player.y)-Math.hypot(a.x-player.x,a.y-player.y))[0];
   const placement=distant&&suitablePlacement(player,CLOSE_VIEW_RADIUS*1.35,ACTIVE_RADIUS*.96);
   if(placement)relocate(distant,placement);
  }
  for(const person of pedestrians){
   const pause=(phase+person.pauseOffset)%person.pauseCycle<person.pauseDuration;
   if(!pause)person.pos+=person.direction*person.speed*dt*1.5;
   const roadPoint=Geo.routePoint(person.route,person.pos),roadDistance=Math.hypot(roadPoint.x-player.x,roadPoint.y-player.y);
   // Most walkers are offscreen. Avoid the more expensive building/water path
   // test until their road segment is close enough to matter.
   if(roadDistance>ACTIVE_RADIUS+person.route.width/2+3){person.c.root.visible=false;continue}
   const point=place(person,roadPoint),near=point&&Math.hypot(person.x-player.x,person.y-player.y)<ACTIVE_RADIUS;
   person.c.root.visible=!!near;
   if(!near)continue;
   person.c.root.position.set(person.x*WORLD_SCALE,.08,person.y*WORLD_SCALE);
   person.c.root.rotation.y=(person.direction>0?Math.PI/2:-Math.PI/2)-point.angle;
   person.c.update(phase+person.gaitOffset,!pause,false);
  }
 }

 function nearest(player,count=6){return pedestrians.slice().sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y)).slice(0,count)}

 function replaceCharacter(person,factory=defaultFactory){
  const next=factory(scene,person);
  if(!next?.root||typeof next.update!=='function')throw new TypeError('NPC factory must return { root, update }.');
  person.c.root.removeFromParent();person.c=next;person.c.root.scale.setScalar(person.scale);
  return person;
 }

 return{pedestrians,update,nearest,replaceCharacter};
}
