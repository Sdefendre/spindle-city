import * as T from './vendor/three.module.js';
import * as C from './vendor/cannon-es.js';
const S=1/1.5;
export function createPedestrianPhysics(scene,Geo,{mobile=false}={}){
 const world=new C.World({gravity:new C.Vec3(0,-9.81,0),allowSleep:true});world.broadphase=new C.SAPBroadphase(world);world.solver.iterations=mobile?5:8;
 world.defaultContactMaterial.friction=.7;world.defaultContactMaterial.restitution=.04;
 const ground=new C.Body({mass:0,shape:new C.Plane()});ground.quaternion.setFromEuler(-Math.PI/2,0,0);ground.position.y=.09;world.addBody(ground);
 const vehicle=new C.Body({mass:0,type:C.Body.KINEMATIC,shape:new C.Box(new C.Vec3(.96,.63,2.38))});vehicle.position.set(0,-100,0);world.addBody(vehicle);
 const fallen=[],walls=[];let lastImpact=0;
 function clear(record){for(const j of record.joints)world.removeConstraint(j);for(const part of record.parts){world.removeBody(part.body);scene.remove(part.mesh);part.mesh.geometry.dispose();part.mesh.material.dispose();}record.person.knocked=false;}
 function addWalls(x,z){if(walls.length)return;for(const b of Geo.buildings){if(x<b.box.x*S-35||x>b.box.r*S+35||z<b.box.y*S-35||z>b.box.b*S+35)continue;for(let i=1;i<b.p.length;i++){const a=b.p[i-1],q=b.p[i],dx=(q[0]-a[0])*S,dz=(q[1]-a[1])*S,len=Math.hypot(dx,dz);if(len<.1)continue;const wall=new C.Body({mass:0,shape:new C.Box(new C.Vec3(.1,2,len/2))});wall.position.set((a[0]+q[0])*S/2,2,(a[1]+q[1])*S/2);wall.quaternion.setFromEuler(0,Math.atan2(dx,dz),0);world.addBody(wall);walls.push(wall);}}}
 function knock(person,dx,dz,speed){
  if(person.knocked)return;const cap=mobile?3:6;if(fallen.length>=cap){const old=fallen.shift();clear(old);}
  person.knocked=true;person.c.root.visible=false;const scale=person.scale||1,x=person.x*S,z=person.y*S,parts=[],joints=[],byName={};addWalls(x,z);
  const variant=person.variant||{},material=color=>new T.MeshStandardMaterial({color,roughness:.8});
  const heading=person.c.root.rotation.y,s=Math.sin(heading),c=Math.cos(heading);
  const point=(px,py,pz=0)=>new C.Vec3(x+(px*c+pz*s)*scale,.11+py*scale,z+(-px*s+pz*c)*scale);
  function part(name,mass,px,py,rx,ry,rz,color,sphere=false){const body=new C.Body({mass,linearDamping:.12,angularDamping:.4,sleepTimeLimit:1.5,sleepSpeedLimit:.16});body.addShape(sphere?new C.Sphere(rx*scale):new C.Box(new C.Vec3(rx*scale,ry*scale,rz*scale)));body.position.copy(point(px,py));body.quaternion.setFromEuler(0,heading,0);body.velocity.set(dx*Math.min(10,speed)*.72,Math.min(2,speed*.08),dz*Math.min(10,speed)*.72);world.addBody(body);const geometry=sphere?new T.SphereGeometry(rx*scale,12,8):new T.CapsuleGeometry(Math.min(rx,rz)*scale,Math.max(0,(ry*2-Math.min(rx,rz)*2))*scale,3,8);const mesh=new T.Mesh(geometry,material(color));if(!sphere)mesh.scale.x=rx/Math.min(rx,rz);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);const entry={body,mesh};parts.push(entry);byName[name]=entry;return body;}
  const coat=variant.jacket||'#5d6876',pants=variant.pants||'#303640',skin=variant.skin||'#b88765';
  part('pelvis',12,0,.88,.18,.12,.13,pants);part('torso',23,0,1.21,.24,.23,.14,coat);part('head',4,0,1.65,.14,.17,.14,skin,true);
  function joint(a,b,px,py,angle=.8){const anchor=point(px,py),A=byName[a].body,B=byName[b].body;const j=new C.ConeTwistConstraint(A,B,{pivotA:A.pointToLocalFrame(anchor),pivotB:B.pointToLocalFrame(anchor),axisA:new C.Vec3(0,1,0),axisB:new C.Vec3(0,1,0),angle,twistAngle:.45,maxForce:1e5,collideConnected:false});world.addConstraint(j);joints.push(j);}
  joint('pelvis','torso',0,1.0,.35);joint('torso','head',0,1.48,.4);
  for(const side of [-1,1]){const key=side<0?'L':'R';part('arm'+key,2.5,side*.32,1.27,.07,.16,.07,coat);part('forearm'+key,1.5,side*.35,.95,.06,.15,.06,coat);part('thigh'+key,7,side*.13,.65,.095,.22,.095,pants);part('shin'+key,4,side*.13,.25,.075,.20,.075,pants);joint('torso','arm'+key,side*.27,1.40,1.15);joint('arm'+key,'forearm'+key,side*.34,1.10,.85);joint('pelvis','thigh'+key,side*.13,.85,.9);joint('thigh'+key,'shin'+key,side*.13,.44,.8);}
  byName.torso.body.angularVelocity.set(dz*3,0,-dx*3);fallen.push({person,parts,joints,age:0,pelvis:byName.pelvis.body});
 }
 function update(dt,car,people,player){
  if(car){const x=car.x*S,z=car.y*S,speed=car.velocity||0;vehicle.position.set(x,.75,z);vehicle.quaternion.setFromEuler(0,car.heading,0);vehicle.velocity.set(Math.sin(car.heading)*speed,0,Math.cos(car.heading)*speed);
   if(Math.abs(speed)>1)for(const p of people){if(p.knocked||!p.c.root.visible)continue;const dx=p.x*S-x,dz=p.y*S-z,c=Math.cos(car.heading),s=Math.sin(car.heading);if(Math.abs(dx*c-dz*s)<1.2&&Math.abs(dx*s+dz*c)<2.75){knock(p,Math.sin(car.heading)*Math.sign(speed),Math.cos(car.heading)*Math.sign(speed),Math.abs(speed));lastImpact=Math.abs(speed);car.velocity*=.75;}}
  }else vehicle.position.set(0,-100,0);
  if(!fallen.length)return 0;world.step(1/60,Math.min(dt,.05),mobile?2:3);
  for(let i=fallen.length-1;i>=0;i--){const f=fallen[i];f.age+=dt;f.person.x=f.pelvis.position.x/S;f.person.y=f.pelvis.position.z/S;for(const p of f.parts){p.mesh.position.copy(p.body.position);p.mesh.quaternion.copy(p.body.quaternion);}if(f.age>16&&Math.hypot(f.person.x-player.x,f.person.y-player.y)>90){clear(f);fallen.splice(i,1);}}
  if(!fallen.length){for(const wall of walls)world.removeBody(wall);walls.length=0;}
  const hit=lastImpact;lastImpact=0;return hit;
 }
 return {update,knock,get activeCount(){return fallen.length}};
}
