// EV, road, wind and impact synthesis mixed with locally hosted, licensed
// recordings. One AudioContext, bounded voices, no audio network dependency.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function createDrivingAudio(){
 let ctx=null,master=null,muted=false,active=false,unlocked=false,nodes=null,lastStep=0,lastImpact=-1,buffers={};
 const files={open:'door-open.m4a',close:'door-close.m4a',skid:'tire-skid.m4a',traffic:'traffic-pass.m4a',reverseRecording:'tesla-reverse.m4a'};
 const gain=(param,value,tau=.08)=>param.setTargetAtTime(value,ctx.currentTime,tau);
 function noiseBuffer(){const b=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate),a=b.getChannelData(0);let v=0;for(let i=0;i<a.length;i++){v=(v+(Math.random()*2-1)*.035)/1.035;a[i]=v*5}return b;}
 function bed(buffer,type,hz){const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),g=ctx.createGain();source.buffer=buffer;source.loop=true;filter.type=type;filter.frequency.value=hz;g.gain.value=0;source.connect(filter).connect(g).connect(master);source.start();return {source,filter,g};}
 function oscillator(type,hz){const source=ctx.createOscillator(),g=ctx.createGain();source.type=type;source.frequency.value=hz;g.gain.value=0;source.connect(g).connect(master);source.start();return{source,g};}
 async function unlock(){
  if(!ctx){
   const AC=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AC)return false;ctx=new AC({latencyHint:'interactive'});
   master=ctx.createGain();master.gain.value=0;const limit=ctx.createDynamicsCompressor();limit.threshold.value=-16;limit.knee.value=16;limit.ratio.value=5;master.connect(limit).connect(ctx.destination);
   const noise=noiseBuffer();nodes={road:bed(noise,'lowpass',900),wind:bed(noise,'highpass',700),motor:oscillator('sine',150),motor2:oscillator('sine',310),reverse:oscillator('sine',620)};
   for(const [key,file] of Object.entries(files))fetch('assets/audio/'+file).then(r=>{if(!r.ok)throw new Error(file);return r.arrayBuffer()}).then(b=>ctx.decodeAudioData(b)).then(buffer=>{buffers[key]=buffer;if(key==='skid'||key==='traffic'||key==='reverseRecording')nodes[key]=bed(buffer,'lowpass',key==='skid'?2400:1500)}).catch(()=>{});
  }
  try{await ctx.resume();unlocked=ctx.state==='running';gain(master.gain,active&&!muted?.65:0);return unlocked}catch{return false}
 }
 function setActive(value){if(active===value)return;active=value;if(!ctx)return;gain(master.gain,active&&!muted?.65:0);}
 function setMuted(value){muted=value;if(ctx)gain(master.gain,active&&!muted?.65:0);}
 function thump(strength=.3,foot=false){if(!ctx||!active||muted||!unlocked)return;const now=ctx.currentTime;
  const oscillator=ctx.createOscillator(),g=ctx.createGain();oscillator.type='triangle';oscillator.frequency.setValueAtTime(foot?100:95,now);oscillator.frequency.exponentialRampToValueAtTime(foot?55:30,now+.18);g.gain.setValueAtTime(clamp(strength,0,.65),now);g.gain.exponentialRampToValueAtTime(.001,now+(foot?.1:.35));oscillator.connect(g).connect(master);oscillator.start();oscillator.stop(now+.4);
 }
 function event(name,strength=1){if(!ctx||!active||muted||!unlocked)return;if(name==='impact'){if(ctx.currentTime-lastImpact<.3)return;lastImpact=ctx.currentTime;thump(clamp(strength/16,.08,.6));return;}const buffer=buffers[name];if(!buffer){thump(.09);return;}const source=ctx.createBufferSource(),g=ctx.createGain();source.buffer=buffer;g.gain.value=.28;source.connect(g).connect(master);source.start();}
 function update({speed=0,throttle=0,lateral=0,driving=false,walking=false,running=false,nearTraffic=0,inside=false,dt=.016}={}){
  if(!ctx||!nodes||!unlocked)return;const v=Math.abs(speed),road=clamp(v/27,0,1),cabin=inside?.64:1;
  gain(nodes.road.g.gain,driving?road*.36*cabin:0);gain(nodes.road.filter.frequency,500+v*55);
  gain(nodes.wind.g.gain,driving?Math.max(0,v-6)/24*.12*cabin:.009);
  gain(nodes.motor.g.gain,driving&&v>.1?(.012+Math.abs(throttle)*.035+road*.015)*cabin:0);gain(nodes.motor.source.frequency,140+v*18+Math.abs(throttle)*35,.12);
  gain(nodes.motor2.g.gain,driving&&v>.1?.008+Math.abs(throttle)*.012:0);gain(nodes.motor2.source.frequency,290+v*35,.12);
  gain(nodes.reverse.g.gain,driving&&speed<-.2&&!nodes.reverseRecording?.025:0);if(nodes.reverseRecording){gain(nodes.reverseRecording.g.gain,driving&&speed<-.1?.22*(inside?.5:1):0);gain(nodes.reverseRecording.source.playbackRate,.98+Math.min(v,6)*.012,.2);}
  if(nodes.skid)gain(nodes.skid.g.gain,driving&&v>5?clamp((Math.abs(lateral)-3)/9,0,.3):0);
  if(nodes.traffic)gain(nodes.traffic.g.gain,clamp(nearTraffic,0,1)*.075*cabin);
  lastStep+=dt;if(walking&&lastStep>(running?.28:.48)){lastStep=0;thump(running?.065:.04,true);}
 }
 return{unlock,setActive,setMuted,update,event,get ready(){return unlocked},get muted(){return muted}};
}
