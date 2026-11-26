// Controller input core for the W3C "standard" Gamepad mapping. DOM-free so the
// same state machine drives play3d.js and the node --test mapping tests.
const DEADZONE=0.16,TRIGGER_DEADZONE=0.08,STOP_SPEED=0.35;
const BUTTON={confirm:0,back:1,view:2,map:3,lb:4,rb:5,lt:6,rt:7,select:8,pause:9,sprint:10,r3:11,up:12,down:13,left:14,right:15};
const EDGE_NAMES=['confirm','back','view','map','lb','rb','select','pause','sprint','r3','up','down','left','right'];

const unit=v=>Number.isFinite(v)?Math.max(-1,Math.min(1,v)):0;
const isPressed=b=>!!b&&(b.pressed===true||(Number.isFinite(b.value)&&b.value>.5));

/** Radial deadzone: drift inside the circle is zero, the rest is rescaled to 0..1 and clamped. */
function radialDeadzone(x,y,deadzone=DEADZONE){
 x=unit(x);y=unit(y);const m=Math.hypot(x,y);if(m<=deadzone)return{x:0,y:0};
 const scaled=Math.min(1,(m-deadzone)/(1-deadzone));return{x:x/m*scaled,y:y/m*scaled};
}
function triggerValue(b,deadzone=TRIGGER_DEADZONE){
 let v=Math.max(0,unit(b?.value));if(b?.pressed===true&&v===0)v=1;
 return v<=deadzone?0:Math.min(1,(v-deadzone)/(1-deadzone));
}
/** Merge analog sources by keeping the strongest deflection (never sums past ±1). */
export function mergeAxis(...values){let best=0;for(const v of values){const n=unit(v);if(Math.abs(n)>Math.abs(best))best=n}return best}

/** Safe snapshot of navigator.getGamepads(): absent or throwing APIs give []. */
export function getPads(){
 try{const nav=globalThis.navigator,list=typeof nav?.getGamepads==='function'?nav.getGamepads():null;return list?Array.from(list):[]}catch{return[]}
}
export function createPadState(){return{index:null,id:'',prev:{},needsNeutral:true,reverse:false,sprint:false,status:'none'}}
/** Block all output until every stick, trigger and button is released. */
export function requireNeutral(state){state.needsNeutral=true;state.reverse=false;state.sprint=false}

function emptyFrame(){const pressed={};for(const n of EDGE_NAMES)pressed[n]=false;return{status:'none',id:'',isPlayStation:false,connected:false,disconnected:false,gated:false,move:{x:0,y:0},look:{x:0,y:0},throttle:0,brake:0,reverse:0,boost:false,sprint:false,pressed,driveInput:false}}

/**
 * Read one frame. `pads` is a fresh getPads() result; `speed` is the signed
 * forward vehicle speed, used so LT brakes to a stop and then latches reverse.
 */
export function readPad(state,pads,{speed=0}={}){
 const out=emptyFrame(),live=(pads||[]).filter(p=>p&&p.connected!==false);
 let pad=null;
 if(state.index!==null){
  pad=live.find(p=>p.index===state.index&&p.id===state.id)||null;
  if(!pad){state.index=null;state.id='';state.prev={};requireNeutral(state);out.disconnected=true}
 }
 if(!pad){
  pad=live.find(p=>p.mapping==='standard')||null;
  if(pad){state.index=pad.index;state.id=pad.id;state.prev={};requireNeutral(state);out.connected=true}
 }
 if(!pad){const odd=live.find(p=>p.mapping!=='standard');out.status=state.status=odd?'unsupported':'none';out.id=odd?.id||'';return out}
 if(pad.mapping!=='standard'){out.disconnected=state.status!=='unsupported';out.status='unsupported';out.id=pad.id;state.status='unsupported';requireNeutral(state);return out}
 out.status=state.status='active';out.id=pad.id;
 out.isPlayStation=/dualsense|dualshock|playstation|sony|054c/i.test(pad.id||'');
 const b=pad.buttons||[],a=pad.axes||[],held={};for(const n of EDGE_NAMES)held[n]=isPressed(b[BUTTON[n]]);
 const move=radialDeadzone(a[0],a[1]),look=radialDeadzone(a[2],a[3]),rt=triggerValue(b[BUTTON.rt]),lt=triggerValue(b[BUTTON.lt]);
 if(state.needsNeutral){
  const buttonsUp=!b.some((x,i)=>i!==BUTTON.lt&&i!==BUTTON.rt&&isPressed(x));
  state.prev=held;
  if(!(buttonsUp&&!move.x&&!move.y&&!look.x&&!look.y&&!rt&&!lt)){out.gated=true;return out}
  state.needsNeutral=false;return out;
 }
 for(const n of EDGE_NAMES)out.pressed[n]=held[n]&&!state.prev[n];state.prev=held;
 out.move=move;out.look=look;out.throttle=rt;out.boost=!!held.rb;
 // Brake while rolling forward; once stopped, LT latches into reverse until released.
 if(!lt)state.reverse=false;else if(!state.reverse&&speed<=STOP_SPEED)state.reverse=true;
 if(state.reverse)out.reverse=lt;else out.brake=lt;
 if(out.pressed.sprint)state.sprint=true;else if(!move.x&&!move.y)state.sprint=false;
 out.sprint=state.sprint;out.driveInput=!!(move.x||move.y||rt||lt||out.boost);
 return out;
}

/** Optional DualSense / Xbox haptic rumble via Gamepad Haptics API (no-op if unsupported). */
export function rumblePad(state,strong=0.45,weak=0.25,duration=140){
 if(state.index===null)return;
 try{
  const pad=getPads().find(p=>p&&p.index===state.index&&p.connected!==false);
  const act=pad?.vibrationActuator;
  if(act?.playEffect)act.playEffect('dual-rumble',{startDelay:0,duration,weakMagnitude:Math.max(0,Math.min(1,weak)),strongMagnitude:Math.max(0,Math.min(1,strong))}).catch(()=>{});
 }catch{}
}
