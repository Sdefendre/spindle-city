// Mapping-logic tests for dist/gamepad.js using plain Gamepad-shaped objects.
// They do not validate physical controller hardware or browser quirks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPadState,readPad,requireNeutral,getPads,mergeAxis} from '../dist/gamepad.js';

// W3C standard mapping, supplied independently of the implementation under test.
const BUTTON={confirm:0,back:1,view:2,map:3,lt:6,rt:7,pause:9,sprint:10,up:12,down:13,left:14,right:15};

function pad({index=0,id='Test Pad',mapping='standard',axes=[0,0,0,0],held={},triggers={}}={}){
 const buttons=Array.from({length:17},(_,i)=>({pressed:false,value:0}));
 for(const [name,on] of Object.entries(held))if(on)buttons[BUTTON[name]]={pressed:true,value:1};
 for(const [name,value] of Object.entries(triggers))buttons[BUTTON[name]]={pressed:value>.5,value};
 return {index,id,mapping,connected:true,axes,buttons};
}
// A connected pad must first be seen at rest before it produces input.
function primed(p=pad()){const s=createPadState();readPad(s,[p]);return s}

test('stick drift stays zero; deflection is radially rescaled and clamped',()=>{
 const s=primed();
 const drift=readPad(s,[pad({axes:[.1,-.11,.12,.09]})]);
 assert.deepEqual([drift.move,drift.look,drift.driveInput],[{x:0,y:0},{x:0,y:0},false]);
 const half=readPad(s,[pad({axes:[.58,0,0,0]})]).move;
 assert.ok(Math.abs(half.x-.5)<1e-9&&half.y===0);
 const full=readPad(s,[pad({axes:[1,1,Number.NaN,5]})]);
 assert.ok(Math.abs(Math.hypot(full.move.x,full.move.y)-1)<1e-9,'diagonal magnitude clamps to 1');
 assert.equal(full.look.x,0);assert.ok(full.look.y<=1);
 assert.equal(mergeAxis(.4,-.9,2),1);assert.equal(mergeAxis(0,-.3),-.3);
 assert.deepEqual(readPad(s,[pad({axes:[.16,0,0,0]})]).move,{x:0,y:0});
});

test('buttons fire once per press while held',()=>{
 const s=primed();
 assert.equal(readPad(s,[pad({held:{confirm:true,pause:true}})]).pressed.confirm,true);
 const held=readPad(s,[pad({held:{confirm:true,pause:true}})]);
 assert.equal(held.pressed.confirm,false);assert.equal(held.pressed.pause,false);
 readPad(s,[pad()]);
 assert.equal(readPad(s,[pad({held:{confirm:true}})]).pressed.confirm,true);
});

test('active pad is stable, other pads ignored, non-standard mapping rejected',()=>{
 const s=primed(pad({index:1,id:'First'}));
 const other=pad({index:0,id:'Second',axes:[1,0,0,0],held:{pause:true}});
 const f=readPad(s,[other,pad({index:1,id:'First'})]);
 assert.equal(f.id,'First');assert.equal(f.pressed.pause,false);assert.equal(f.move.x,0);
 const s2=createPadState(),odd=readPad(s2,[pad({mapping:'',axes:[1,0,0,0],held:{confirm:true}})]);
 assert.equal(odd.status,'unsupported');assert.equal(odd.pressed.confirm,false);assert.equal(odd.move.x,0);
 const changed=readPad(s,[pad({index:1,id:'First',mapping:'',axes:[1,0,0,0]})]);
 assert.equal(changed.status,'unsupported','a known device must still have a standard mapping');
 assert.equal(changed.move.x,0);
});

test('browser polling handles unavailable, denied and sparse platform gamepad lists',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 try{
  for(const nav of [{getGamepads(){throw new Error('denied')}},{}]){
   Object.defineProperty(globalThis,'navigator',{value:nav,configurable:true});
   assert.deepEqual(getPads(),[]);
  }
  Object.defineProperty(globalThis,'navigator',{value:{getGamepads:()=>[null,pad()]},configurable:true});
  assert.equal(getPads().length,2);
 }finally{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;}
});

test('neutral gate blocks held input after connect, reconnect and menu transitions',()=>{
 const s=createPadState(),held=pad({axes:[0,-1,0,0],held:{confirm:true}});
 const first=readPad(s,[held]);
 assert.equal(first.connected,true);assert.equal(first.gated,true);assert.equal(first.move.y,0);
 assert.equal(readPad(s,[held]).gated,true,'still held: no output');
 readPad(s,[pad()]);
 assert.equal(readPad(s,[held]).pressed.confirm,true,'fresh press after release works');
 // Pause/overlay transition while the stick is still pushed.
 requireNeutral(s);
 assert.equal(readPad(s,[held]).move.y,0);
 // Disconnect, then reconnect with input already held.
 const gone=readPad(s,[]);assert.equal(gone.disconnected,true);
 const back=readPad(s,[held]);assert.equal(back.connected,true);assert.equal(back.gated,true);assert.equal(back.pressed.confirm,false);
});

test('LT brakes while rolling, then latches reverse without bouncing until released',()=>{
 const s=primed(),lt=pad({triggers:{lt:1}});
 let f=readPad(s,[lt],{speed:10});assert.ok(f.brake>.9);assert.equal(f.reverse,0);
 f=readPad(s,[lt],{speed:.1});assert.equal(f.brake,0);assert.ok(f.reverse>.9);
 for(const speed of [-2,.5,3]){f=readPad(s,[lt],{speed});assert.equal(f.brake,0,'held LT stays in reverse at speed '+speed);assert.ok(f.reverse>.9)}
 readPad(s,[pad()],{speed:3});
 f=readPad(s,[lt],{speed:3});assert.ok(f.brake>.9,'re-press while moving brakes again');
 const rt=readPad(s,[pad({triggers:{rt:.04}})]);assert.equal(rt.throttle,0,'trigger rest noise ignored');
});
