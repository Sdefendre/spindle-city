import {createCollisionWorld,stepDriving} from './driving.js';
// Bridges driving.js (metres) to the game's map units for the player's car. The
// collision world is built once per city load from the same footprints, street
// props and Geo.blocked rules that walking uses.
const S=1/1.5,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function segmentDistance(x,y,p){let best=Infinity;for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i],dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1),0,1);best=Math.min(best,Math.hypot(a[0]+dx*t-x,a[1]+dy*t-y))}return best}
export function createPlayerDriving(Geo,city){
 // Same rule as Geo.blocked: any road whose tunnel tag is not "no" (tunnel, culvert,
 // building_passage) may pass under a footprint. Bridges are already handled by
 // Geo.blocked, which only blocks water away from roads tagged as bridges.
 const tunnels=Geo.roads.filter(r=>r.tunnel!=='no');
 const allowsTunnel=(x,z)=>{const mx=x/S,my=z/S;return tunnels.some(r=>{const pad=r.width/2;return mx>r.box.x-pad&&mx<r.box.r+pad&&my>r.box.y-pad&&my<r.box.b+pad&&segmentDistance(mx,my,r.p)<pad})};
 const world=createCollisionWorld({buildings:Geo.buildings.map(b=>b.p.map(([x,y])=>({x:x*S,z:y*S}))),props:city.propColliders||[],blocked:(x,z)=>Geo.blocked(x/S,z/S),allowsTunnel});
 // Escape hatch: a car that starts a frame already overlapping something (entered
 // while touching a prop, teleported, or clipped by traffic) only checks its centre
 // point, so it can always drive or reverse back out instead of sticking.
 const centre={hits:(x,z)=>Geo.blocked(x/S,z/S)?'boundary':null};
 const state={x:0,z:0,heading:0,speed:0,steer:0};
 function step(v,input,dt,cars){
  Object.assign(state,{x:v.x*S,z:v.y*S,heading:v.heading,speed:v.velocity||0,steer:v.steer||0});
  const near=[];for(const c of cars){if(c===v)continue;const dx=c.x-v.x,dy=c.y-v.y;if(dx*dx+dy*dy<400)near.push({x:c.x*S,z:c.y*S,heading:c.heading})}
  const overlapping=world.hits(state.x,state.z,state.heading,near),active=!overlapping?world:centre.hits(state.x,state.z)?null:centre;
  const result=stepDriving(state,input,dt,active,overlapping?[]:near);
  v.x=state.x/S;v.y=state.z/S;v.heading=state.heading;v.velocity=state.speed;v.steer=state.steer;
  return {...result,overlapping:!!overlapping};
 }
 return {world,step};
}
