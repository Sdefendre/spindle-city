import * as T from './vendor/three.module.js';
// Presentation-only driving feedback: speed-linked chase camera and FOV, body
// roll/pitch, brake lights and impact shake. Nothing here touches collision.
// prefers-reduced-motion disables the FOV change and the shake.
const clamp=T.MathUtils.clamp,damp=T.MathUtils.damp;
export const TOP_SPEED=27,HARD_HIT=8,SHAKE_HIT=1.5;
export function createDriveFeel(camera){
 const query=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');let reduce=!!query?.matches;query?.addEventListener?.('change',e=>{reduce=e.matches});
 const baseFov=camera.fov,offset=new T.Vector3();let speedFrac=0,shake=0,clock=0;
 return {
  get reducedMotion(){return reduce},
  // Body attitude and lights for the car the player is in. v.drive comes from play3d.
  updateCar(v,dt){const d=v.drive||{},u=v.root.userData;
   v.pitch=damp(v.pitch||0,clamp(-(d.acceleration||0)*.005,-.028,.028),6,dt);
   v.roll=damp(v.roll||0,clamp((d.lateral||0)*.003,-.045,.045),6,dt);
   u.setTilt?.(v.pitch,v.roll);u.setBrake?.(d.braking||d.reversing?1:0)},
  resetCar(v){if(!v)return;v.drive=null;v.pitch=v.roll=0;v.root.userData.setTilt?.(0,0);v.root.userData.setBrake?.(0)},
  impact(speed){if(reduce||speed<SHAKE_HIT)return;shake=Math.max(shake,Math.min(.4,(speed-SHAKE_HIT)*.028+.05))},
  // Call before positioning the camera: removes last frame's shake so smoothing stays clean.
  begin(){camera.position.sub(offset);offset.set(0,0,0)},
  // Returns extra chase distance (metres) for the third-person driving camera.
  chase(dt,{driving,thirdPerson,speed,snap}){
   const target=driving&&thirdPerson?clamp(Math.abs(speed)/TOP_SPEED,0,1):0;
   speedFrac=!driving||snap?target:damp(speedFrac,target,2.5,dt);if(speedFrac<.002)speedFrac=0;
   const fov=reduce?baseFov:baseFov+10*speedFrac;
   if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix()}
   return speedFrac*2.2},
  // Call after positioning the camera.
  end(dt){clock+=dt;if(shake<.003){shake=0;return}if(reduce){shake=0;return}
   offset.set(Math.sin(clock*47)*shake,Math.sin(clock*61+1.3)*shake*.6,Math.sin(clock*53+2.1)*shake);camera.position.add(offset);shake*=Math.exp(-7*dt)}
 };
}
