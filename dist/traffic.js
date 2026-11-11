// Ambient traffic that eases to a cruise speed and stops for whatever is in its
// lane ahead: the player (on foot or driving) or another car. Deterministic, no
// randomness per frame. Cars still follow road centrelines, offset into the
// right-hand lane so oncoming cars on the same road pass beside each other.
const S=1/1.5,LANE=1.6,ACCEL=2.2,DECEL=7,EMERGENCY=18,COMFORT=3.5;
export function placeTrafficCar(Geo,c){const p=Geo.routePoint(c.route,c.pos),h=Math.PI/2-p.angle;c.heading=h;c.x=p.x-Math.cos(h)*LANE/S;c.y=p.y+Math.sin(h)*LANE/S}
export function updateTraffic(Geo,cars,player,vehicle,dt){
 const moving=[];for(let i=0;i<cars.length;i++){const c=cars[i];if(c===vehicle||c.parked||!c.route)continue;if(c.v===undefined){c.cruise=c.speed;c.v=c.speed;c.waiting=0;c.braking=false}c.index=i;moving.push(c)}
 for(const c of moving){
  const s=Math.sin(c.heading),k=Math.cos(c.heading),look=9+c.v*1.5,range=look/S;let clear=Infinity,blocker=null;
  // Forward distance (metres) past the stop gap for an obstacle inside this car's lane ahead.
  const test=(ox,oy,half,gap,who)=>{const dx=ox-c.x,dy=oy-c.y;if(dx>range||dx< -range||dy>range||dy< -range)return;const f=(dx*s+dy*k)*S;if(f<=0||f>look)return;const side=(dx*k-dy*s)*S;if(side>half||side< -half)return;if(f-gap<clear){clear=f-gap;blocker=who}};
  test(player.x,player.y,vehicle?1.9:1.3,vehicle?6:4,'player');
  for(const o of cars)if(o!==c&&o!==vehicle)test(o.x,o.y,1.85,6,o);
  c.blocker=blocker;c.clear=clear;
 }
 // Two cars that each see the other ahead (a tight crossing): the earlier one goes first.
 for(const c of moving){const b=c.blocker;if(b&&b!=='player'&&b.blocker===c&&c.index<b.index){c.blocker=null;c.clear=Infinity}}
 for(const c of moving){
  const room=Math.max(0,c.clear),target=c.blocker?(room<.25?0:Math.min(c.cruise,Math.sqrt(2*COMFORT*room))):c.cruise;
  if(target>c.v)c.v=Math.min(target,c.v+ACCEL*dt);else c.v=Math.max(target,c.v-(room<2&&c.blocker?EMERGENCY:DECEL)*dt);
  c.waiting=c.v<.1&&c.blocker?c.waiting+dt:0; // hook for a future horn: seconds spent stopped behind something
  const braking=!!c.blocker&&(c.v>target+.2||c.v<.1);if(braking!==c.braking){c.braking=braking;c.root.userData.setBrake?.(braking?1:0)}
  c.speed=c.v;c.pos+=c.v*dt*1.5;placeTrafficCar(Geo,c);
 }
}
