import * as T from './vendor/three.module.js';
import {drawDrivingDisplay,drawNavigation} from './fsd-view.js';
export function makeCockpit(scene,camera){
 const root=new T.Group();root.visible=false;camera.add(root);scene.add(camera);
 const dark=new T.MeshStandardMaterial({color:'#15181d',roughness:.72}),trim=new T.MeshStandardMaterial({color:'#4c4742',roughness:.7}),light=new T.MeshStandardMaterial({color:'#bebcb7',roughness:.7});
 function box(w,h,d,mat,x,y,z,parent=root){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);parent.add(m);return m;}
 box(2.3,.23,.33,dark,0,-.50,-.82);box(2.3,.035,.035,light,0,-.365,-.71);box(2.3,.045,.06,trim,0,-.40,-.68);
 const wheel=new T.Group();wheel.position.set(-.22,-.32,-.64);root.add(wheel);
 wheel.add(new T.Mesh(new T.TorusGeometry(.18,.024,10,48),dark));box(.27,.026,.026,dark,0,-.015,0,wheel);box(.045,.15,.03,dark,0,-.09,0,wheel);box(.13,.085,.055,dark,0,-.025,.012,wheel);
 const badge=document.createElement('canvas');badge.width=128;badge.height=64;const b=badge.getContext('2d');b.fillStyle='#c7c9cc';b.font='500 18px sans-serif';b.textAlign='center';b.fillText('TESLA',64,40);const badgeTex=new T.CanvasTexture(badge);badgeTex.colorSpace=T.SRGBColorSpace;const emblem=new T.Mesh(new T.PlaneGeometry(.105,.052),new T.MeshBasicMaterial({map:badgeTex,transparent:true}));emblem.position.set(0,-.026,.043);wheel.add(emblem);
 box(.665,.397,.028,dark,.265,-.17,-.85);const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=600;const c=canvas.getContext('2d');const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
 const screen=new T.Mesh(new T.PlaneGeometry(.645,.378),new T.MeshBasicMaterial({map:tex,toneMapped:false}));screen.position.set(.265,-.17,-.832);root.add(screen);
 const vis=document.createElement('canvas');vis.width=670;vis.height=552;const nav=document.createElement('canvas');nav.width=354;nav.height=552;let previous=0;
 function update(state={}){root.visible=!!state.visible;if(!root.visible)return;root.scale.x=camera.aspect<1?.64:1;root.position.y=camera.aspect<1?-.065:0;wheel.rotation.z=T.MathUtils.clamp(-state.steer*2,-.85,.85);const now=performance.now();if(now-previous<100)return;previous=now;
  drawDrivingDisplay(vis.getContext('2d'),670,552,{...state,compact:true});drawNavigation(nav.getContext('2d'),354,552,{...state,dark:true});c.drawImage(vis,0,0);c.drawImage(nav,670,0);c.fillStyle='#0d1118';c.fillRect(0,552,1024,48);c.fillStyle='#d8e3f0';c.font='500 18px -apple-system,sans-serif';c.fillText('▰     68°       MODEL Y',28,582);c.fillStyle=state.assist?'#38b6ff':'#8da1b8';c.textAlign='right';c.fillText(state.assist?'FSD v15 · REALITY VIEW':'REALITY VIEW · MANUAL',995,582);c.textAlign='left';tex.needsUpdate=true;
 }
 return{update};
}
