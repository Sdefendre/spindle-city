// Metres, metres/second and radians. Collision is a swept, oriented vehicle
// footprint, rather than the player's old small circle sliding along each axis.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const angleDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
function inside(p,polygon){let hit=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
 const a=polygon[i],b=polygon[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)hit=!hit;
}return hit;}
function intersects(a,b,c,d){const x=cross(a,b,c),y=cross(a,b,d),u=cross(c,d,a),v=cross(c,d,b);return x*y<=0&&u*v<=0&&Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))+1e-8&&Math.max(Math.min(a.z,b.z),Math.min(c.z,d.z))<=Math.min(Math.max(a.z,b.z),Math.max(c.z,d.z))+1e-8;}
export function carCorners(x,z,heading,halfWidth=.96,halfLength=2.38){
 const s=Math.sin(heading),c=Math.cos(heading);
 return [[-halfWidth,-halfLength],[halfWidth,-halfLength],[halfWidth,halfLength],[-halfWidth,halfLength]].map(([a,b])=>({x:x+a*c+b*s,z:z-a*s+b*c}));
}
function polygonsTouch(a,b){
 if(a.some(p=>inside(p,b))||b.some(p=>inside(p,a)))return true;
 for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++)if(intersects(a[i],a[(i+1)%a.length],b[j],b[(j+1)%b.length]))return true;
 return false;
}
function circleTouch(x,z,heading,p){const dx=p.x-x,dz=p.z-z,c=Math.cos(heading),s=Math.sin(heading),a=dx*c-dz*s,b=dx*s+dz*c;return Math.hypot(a-clamp(a,-.96,.96),b-clamp(b,-2.38,2.38))<p.radius;}

export function createCollisionWorld({buildings=[],props=[],blocked=null,allowsTunnel=null}={}){
 const buckets=new Map(),cell=32;
 for(const polygon of buildings){if(polygon.length<3)continue;const xs=polygon.map(p=>p.x),zs=polygon.map(p=>p.z);for(let x=Math.floor(Math.min(...xs)/cell);x<=Math.floor(Math.max(...xs)/cell);x++)for(let z=Math.floor(Math.min(...zs)/cell);z<=Math.floor(Math.max(...zs)/cell);z++){const key=x+','+z;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(polygon);}}
 return {hits(x,z,heading,cars=[],ignore=null){
  const corners=carCorners(x,z,heading),samples=[{x,z},...corners,...corners.map((p,i)=>({x:(p.x+corners[(i+1)%4].x)/2,z:(p.z+corners[(i+1)%4].z)/2}))];
  if(blocked&&samples.some(p=>blocked(p.x,p.z)))return 'boundary';
  if(!allowsTunnel?.(x,z)){
   const nearby=new Set();for(const p of samples)for(const b of buckets.get(Math.floor(p.x/cell)+','+Math.floor(p.z/cell))||[])nearby.add(b);
   for(const polygon of nearby)if(polygonsTouch(corners,polygon))return 'building';
  }
  for(const p of props)if(Math.hypot(p.x-x,p.z-z)<p.radius+3&&circleTouch(x,z,heading,p))return p.kind||'street object';
  for(const car of cars){if(car===ignore||Math.hypot(car.x-x,car.z-z)>6)continue;if(polygonsTouch(corners,carCorners(car.x,car.z,car.heading)))return 'vehicle';}
  return null;
 }};
}

/** Fixed-small-step bicycle model. Returns motion and impact data for visuals/audio. */
export function stepDriving(state,input,dt,world,cars=[],ignore=null){
 const duration=clamp(Number.isFinite(dt)?dt:0,0,.1),steps=Math.max(1,Math.ceil(duration/.008)),h=duration/steps;
 const throttle=clamp(input.throttle||0,-1,1),brake=clamp(input.brake||0,0,1),maxSpeed=input.maxSpeed||27;
 const startSpeed=state.speed||0;let impact=0,collision=null,travel=0;
 for(let i=0;i<steps;i++){
  const speed=state.speed||0,abs=Math.abs(speed),sign=Math.sign(speed);
  let acceleration=throttle>0?5.0*throttle*(1-.55*clamp(abs/maxSpeed,0,1)):throttle<0?3.1*throttle:0;
  if(input.boost&&throttle>0&&speed>=0&&!brake)acceleration*=1.65;
  if(throttle*speed<-.08)acceleration=-sign*7*Math.abs(throttle);
  acceleration-=sign*(.13+.0028*speed*speed+(Math.abs(throttle)<.02?1.15:0)+brake*8.5);
  let next=clamp(speed+acceleration*h,-6,maxSpeed);
  if(speed*next<0&&(brake>0||Math.abs(throttle)<.02||throttle*speed<0))next=0;
  if(Math.abs(next)<.035&&Math.abs(throttle)<.02)next=0;
  const target=-(input.steer||0)*.55/(1+abs*.065),oldSteer=state.steer||0;
  state.steer=oldSteer+(target-oldSteer)*(1-Math.exp(-7*h));
  const heading=state.heading+next/2.89*Math.tan(state.steer)*h;
  const distance=next*h,x=state.x+Math.sin(heading)*distance,z=state.z+Math.cos(heading)*distance;
  const hit=world?.hits(x,z,heading,cars,ignore);
  if(hit){
   let lo=0,hi=1;for(let n=0;n<7;n++){const t=(lo+hi)/2;if(world.hits(state.x+(x-state.x)*t,state.z+(z-state.z)*t,state.heading+angleDelta(state.heading,heading)*t,cars,ignore))hi=t;else lo=t;}
   state.x+=(x-state.x)*lo;state.z+=(z-state.z)*lo;state.heading+=angleDelta(state.heading,heading)*lo;
   impact=Math.max(impact,abs);collision=hit;state.speed=0;break;
  }
  state.x=x;state.z=z;state.heading=heading;state.speed=next;travel+=Math.abs(distance);
 }
 state.acceleration=duration?(state.speed-startSpeed)/duration:0;
 state.lateral=(state.speed||0)**2/2.89*Math.tan(state.steer||0);
 return {impact,collision,travel,acceleration:state.acceleration,lateral:state.lateral};
}
