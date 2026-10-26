import * as T from './vendor/three.module.js';

// Camera-mounted cabin cues for the Model Y's first-person driving view.
export function makeCockpit(scene,camera){
 const root=new T.Group();root.visible=false;camera.add(root);scene.add(camera);
 const dark=new T.MeshStandardMaterial({color:'#181d20',roughness:.72}),trim=new T.MeshStandardMaterial({color:'#383e3d',roughness:.65}),light=new T.MeshStandardMaterial({color:'#a6aaa1',roughness:.72}),screenFrame=new T.MeshStandardMaterial({color:'#101416',roughness:.4});
 function box(w,h,d,mat,x,y,z,angle=0,parent=root){let m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.rotation.x=angle;parent.add(m);return m}
 // Dashboard spans the bottom of the windshield, with light horizontal trim.
 box(1.9,.30,.30,dark,0,-.43,-.83,-.12);box(1.9,.035,.035,light,0,-.295,-.72);box(.9,.15,.32,trim,.47,-.55,-.65,-.15);
 const wheel=new T.Group();wheel.position.set(-.25,-.30,-.64);root.add(wheel);
 let rim=new T.Mesh(new T.TorusGeometry(.195,.022,10,48),dark);wheel.add(rim);
 box(.30,.028,.025,dark,0,-.02,0,0,wheel);box(.045,.19,.025,dark,0,-.09,0,0,wheel);box(.12,.105,.05,trim,0,-.025,.012,0,wheel);
 let badge=new T.Mesh(new T.PlaneGeometry(.055,.055),new T.MeshBasicMaterial({color:'#c9ceca'}));badge.position.set(0,-.027,.04);wheel.add(badge);
 // Center touchscreen is part of the cabin and stays readable at street level.
 box(.39,.25,.035,screenFrame,.255,-.13,-.86);const canvas=document.createElement('canvas');canvas.width=512;canvas.height=320;const ctx=canvas.getContext('2d');const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;const screen=new T.Mesh(new T.PlaneGeometry(.37,.23),new T.MeshBasicMaterial({map:texture}));screen.position.set(.255,-.13,-.837);root.add(screen);
 let last='';function update({visible=false,speed=0,steer=0,assist=false}={}){root.visible=visible;if(!visible)return;wheel.rotation.z=T.MathUtils.clamp(-steer*1.5,-.72,.72);const value=Math.round(Math.abs(speed)*2.237),key=value+'|'+assist;if(key===last)return;last=key;ctx.fillStyle='#e9efed';ctx.fillRect(0,0,512,320);ctx.fillStyle='#182c30';ctx.font='bold 79px sans-serif';ctx.fillText(String(value),26,104);ctx.font='22px sans-serif';ctx.fillText('MPH',30,137);ctx.fillStyle=assist?'#3175d9':'#738887';ctx.font='bold 22px sans-serif';ctx.fillText(assist?'ASSIST ACTIVE':'DRIVE',26,188);ctx.fillStyle='#ccd9d5';ctx.fillRect(219,0,293,320);ctx.strokeStyle='#f6f8f5';ctx.lineWidth=14;ctx.beginPath();ctx.moveTo(232,260);ctx.lineTo(340,118);ctx.lineTo(490,40);ctx.stroke();ctx.strokeStyle='#91a9a2';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(280,0);ctx.lineTo(290,320);ctx.moveTo(410,0);ctx.lineTo(425,320);ctx.stroke();ctx.fillStyle='#263f46';ctx.beginPath();ctx.arc(337,152,12,0,7);ctx.fill();texture.needsUpdate=true}
 return{update};
}
