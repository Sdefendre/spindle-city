// Logic tests for dist/driving.js and the map-unit wrapper in dist/player-car.js.
// Pure maths only: no WebGL, no browser and no real map data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCollisionWorld,stepDriving} from '../dist/driving.js';
import {createPlayerDriving} from '../dist/player-car.js';

const DT=1/60;
function run(state,input,seconds,world=null,cars=[]){let last=null,impact=0,collision=null;for(let t=0;t<seconds;t+=DT){last=stepDriving(state,input,DT,world,cars);if(last.impact>impact)impact=last.impact;if(last.collision)collision=last.collision}return {last,impact,collision}}
const car=(o={})=>({x:0,z:0,heading:0,speed:0,steer:0,...o});
// Square footprint in metres (x -10..10, z 10..20), directly ahead of a car at the origin facing +z.
const wall=[{x:-10,z:10},{x:10,z:10},{x:10,z:20},{x:-10,z:20}];

test('full throttle accelerates toward, and never past, the max speed',()=>{
 const s=car();let prev=0;
 for(let t=0;t<3;t+=DT){stepDriving(s,{throttle:1,maxSpeed:18},DT,null);assert.ok(s.speed>=prev);prev=s.speed}
 assert.ok(s.speed>5,'picks up speed within 3 s');
 run(s,{throttle:1,maxSpeed:18},30);
 assert.ok(s.speed>17.5&&s.speed<=18,`settles at the cap, got ${s.speed}`);
 const fast=car();run(fast,{throttle:1,maxSpeed:27},40);assert.ok(fast.speed>26&&fast.speed<=27);
});

test('hard braking stops the car without rolling backwards',()=>{
 const s=car({speed:15});const {last}=run(s,{brake:1},3);
 assert.equal(s.speed,0);assert.ok(last.acceleration<=0);
 const coast=car({speed:6});run(coast,{},10);assert.equal(coast.speed,0,'coasting also comes to rest');
});

test('reverse throttle brakes first, then reverses up to the 6 m/s cap',()=>{
 const s=car({speed:10});stepDriving(s,{throttle:-1},DT,null);assert.ok(s.speed<10&&s.speed>0,'still rolling forward while braking');
 run(s,{throttle:-1},15);assert.ok(s.speed<-5.5&&s.speed>=-6,`reverse cap, got ${s.speed}`);
});

test('steering changes heading; positive steer input (D / stick right) turns right',()=>{
 const s=car({speed:10});run(s,{throttle:.4,steer:1,maxSpeed:18},1);
 assert.ok(s.heading<-.2,`heading ${s.heading}`);assert.ok(s.x<0,'moves toward the car\'s right (-x when facing +z)');
 const still=car();run(still,{steer:1},1);assert.equal(still.heading,0,'no yaw while stationary');
});

test('driving into a building polygon stops the car short of it and reports impact',()=>{
 const world=createCollisionWorld({buildings:[wall]}),s=car({speed:15});
 const {impact,collision}=run(s,{throttle:1,maxSpeed:18},2,world);
 assert.equal(collision,'building');assert.ok(impact>10,`impact ${impact}`);assert.equal(s.speed,0);
 assert.ok(s.z+2.38<=10.01&&s.z+2.38>9,`front bumper ends at the wall, z=${s.z}`);
 const z=s.z;run(s,{throttle:-1},1,world);assert.ok(s.z<z-.5,'can reverse away after the hit');
});

test('allowsTunnel, other cars and props are honoured',()=>{
 const tunnel=createCollisionWorld({buildings:[wall],allowsTunnel:()=>true}),s=car({speed:15});
 assert.equal(run(s,{throttle:1},2,tunnel).collision,null);assert.ok(s.z>20);
 const world=createCollisionWorld({props:[{x:0,z:8,radius:.3,kind:'hydrant'}]}),p=car({speed:8});
 assert.equal(run(p,{throttle:.5},2,world).collision,'hydrant');
 const v=car({speed:8});assert.equal(run(v,{throttle:.5},2,createCollisionWorld({}),[{x:0,z:9,heading:Math.PI/2}]).collision,'vehicle');
});

// Minimal Geo stand-in in map units (1 m = 1.5 units): one footprint across the road.
function fakeGeo({tunnel='no'}={}){
 const sq=[[-15,15],[15,15],[15,30],[-15,30]];
 return {buildings:[{p:sq}],roads:[{tunnel,width:12,p:[[0,-60],[0,60]],box:{x:0,y:-60,r:0,b:60}}],blocked:()=>false};
}
const mapCar=(o={})=>({x:0,y:0,heading:0,velocity:0,steer:0,...o});

test('player-car wrapper: map units in, building blocks unless a tunnel road passes under it',()=>{
 const pd=createPlayerDriving(fakeGeo(),{propColliders:[]}),v=mapCar({velocity:12});let hit=null;
 for(let i=0;i<120;i++){const r=pd.step(v,{throttle:1,maxSpeed:18},DT,[]);hit=hit||r.collision}
 assert.equal(hit,'building');assert.equal(v.velocity,0);assert.ok(v.y<15,'stopped before the footprint (map y 15)');
 const tunnel=createPlayerDriving(fakeGeo({tunnel:'building_passage'}),{propColliders:[]}),t=mapCar({velocity:12});
 for(let i=0;i<120;i++)tunnel.step(t,{throttle:1,maxSpeed:18},DT,[]);
 assert.ok(t.y>30,`drove through the passage, y=${t.y}`);
});

test('player-car wrapper: a car that starts overlapping something can still drive out',()=>{
 const pd=createPlayerDriving(fakeGeo(),{propColliders:[]}),v=mapCar({y:12});// front bumper already inside the footprint
 for(let i=0;i<60;i++)pd.step(v,{throttle:-1},DT,[]);
 assert.ok(v.y<10,`reversed out, y=${v.y}`);
 const other={x:0,y:0,heading:0},w=mapCar({x:1});// parked on top of another car
 for(let i=0;i<60;i++)pd.step(w,{throttle:1,maxSpeed:18},DT,[other,w]);
 assert.ok(w.y>3,'drives away from an overlapping car');
});

// A distinct user-visible contract: boost improves forward acceleration without
// weakening brakes or increasing the reverse-speed cap.
test('acceleration boost is stronger forward while braking and reverse stay bounded',()=>{
 const normal=car(),boost=car();run(normal,{throttle:1,maxSpeed:24},2);run(boost,{throttle:1,maxSpeed:24,boost:true},2);
 assert.ok(boost.speed>normal.speed+2);
 const reverse=car();run(reverse,{throttle:-1,boost:true},10);assert.ok(reverse.speed>=-6);
 run(boost,{throttle:1,boost:true,brake:1},4);assert.ok(boost.speed<.1,'brake overrides forward boost');
});
