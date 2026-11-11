// Logic tests for dist/traffic.js on a straight fake route. No browser needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {placeTrafficCar,updateTraffic} from '../dist/traffic.js';

// Straight road along +y in map units; routePoint matches geography.js's shape.
const Geo={routePoint:(route,t)=>({x:0,y:t,angle:Math.PI/2})};
const DT=1/60,route={};
function makeCar(pos,speed=12){const c={root:{userData:{}},route,pos,speed,parked:false};placeTrafficCar(Geo,c);return c}
const laneX=c=>c.x;
function tick(cars,player,seconds,vehicle=null){for(let t=0;t<seconds;t+=DT)updateTraffic(Geo,cars,player,vehicle,DT)}

test('eases up to cruise speed on a clear road',()=>{
 const c=makeCar(0,12),far={x:500,y:-500};c.v=0;c.cruise=12;c.waiting=0;
 tick([c],far,1);assert.ok(c.v>1&&c.v<4,`eases, got ${c.v}`);tick([c],far,10);assert.equal(c.v,12);
});

test('stops for the player standing in its lane ahead, and resumes once clear',()=>{
 const c=makeCar(0),player={x:laneX(c),y:40};
 tick([c],player,8);assert.equal(c.v,0);assert.ok(c.y<player.y-3*1.5,'stopped short of the player');assert.ok(c.waiting>2);
 player.x+=30;tick([c],player,4);assert.ok(c.v>3,'moves again');
});

test('ignores the player behind it or beside it on the pavement',()=>{
 const a=makeCar(60);tick([a],{x:laneX(a),y:50},2);assert.equal(a.v,12);
 const b=makeCar(0);tick([b],{x:laneX(b)+6,y:20},2);assert.equal(b.v,12);
});

test('queues behind a stopped car instead of driving through it',()=>{
 const lead=makeCar(40),follow=makeCar(0),player={x:laneX(lead),y:60};
 tick([lead,follow],player,10);
 assert.equal(lead.v,0);assert.equal(follow.v,0);assert.ok((lead.y-follow.y)/1.5>5,'keeps a gap of about one car');
});

test('lane offset keeps oncoming traffic on the same road from blocking itself',()=>{
 const up=makeCar(0),down=makeCar(30);down.route={};// separate route object, opposite direction
 const GeoDown={routePoint:(r,t)=>r===down.route?{x:0,y:60-t,angle:-Math.PI/2}:Geo.routePoint(r,t)};
 placeTrafficCar(GeoDown,down);
 for(let t=0;t<2;t+=DT)updateTraffic(GeoDown,[up,down],{x:500,y:-500},null,DT);
 assert.equal(up.v,12);assert.equal(down.v,12);
});
