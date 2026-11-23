// Original canvas visualization inspired by Tesla's driving display. It uses
// this game's mapped roads and live actors, not Tesla software or map tiles.
const S=1/1.5;
export function drawDrivingDisplay(c,w,h,{player,cars=[],people=[],Geo,route=null,speed=0,assist=false,road='',compact=false}={}){
 c.clearRect(0,0,w,h);const bg=c.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#f7f8f9');bg.addColorStop(1,'#dce0e4');c.fillStyle=bg;c.fillRect(0,0,w,h);
 if(!player||!Geo)return;
 const sin=Math.sin(player.heading),cos=Math.cos(player.heading),cx=w*.5,base=h*.79;
 const ego=p=>{const dx=(p.x-player.x)*S,dz=((p.y??p.z)-player.y)*S;return{right:-dx*cos+dz*sin,forward:dx*sin+dz*cos}};
 const project=(p,height=0)=>{const scale=w*.055/(1+Math.max(-8,p.forward)*.032);return{x:cx+p.right*scale,y:base-p.forward*scale*.58-height*scale,scale}};
 const line=(points,color,width,dash=[])=>{if(points.length<2)return;c.beginPath();for(let i=0;i<points.length;i++){const p=project(points[i]);i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y)}c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash);c.stroke();c.setLineDash([])};
 const nearby=Geo.roads.filter(r=>r.drive&&player.x>r.box.x-190&&player.x<r.box.r+190&&player.y>r.box.y-190&&player.y<r.box.b+190);
 for(const r of nearby)for(let i=1;i<r.p.length;i++){
  const a=ego({x:r.p[i-1][0],y:r.p[i-1][1]}),b=ego({x:r.p[i][0],y:r.p[i][1]});if(Math.max(a.forward,b.forward)<-12||Math.min(a.forward,b.forward)>125)continue;
  const dx=b.right-a.right,dz=b.forward-a.forward,len=Math.hypot(dx,dz)||1,half=r.width*S/2,nx=-dz/len*half,nz=dx/len*half;
  const corners=[{right:a.right+nx,forward:a.forward+nz},{right:b.right+nx,forward:b.forward+nz},{right:b.right-nx,forward:b.forward-nz},{right:a.right-nx,forward:a.forward-nz}];
  c.beginPath();corners.forEach((p,j)=>{const q=project(p);j?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y)});c.closePath();c.fillStyle='#c9cdd1';c.fill();
  line([corners[0],corners[1]],'#b6bbc1',1.4);line([corners[3],corners[2]],'#b6bbc1',1.4);line([a,b],'#fafbfc',compact?1:2,[w*.018,w*.018]);
 }
 if(route?.points?.length){const pts=route.points.slice(Math.max(0,(route.index||0)-1)).map(ego).filter(p=>p.forward>-8&&p.forward<120);line(pts,assist?'#3e9bff66':'#a8b5c366',w*.055);line(pts,assist?'#147bf3':'#8e9aa7',w*.009);}
 else {line([{right:0,forward:0},{right:0,forward:42}],assist?'#3e9bff55':'#b7bdc344',w*.055);}
 const drawCar=(p,heading,own=false)=>{
  const q=project(p),angle=heading-player.heading,halfW=.94,halfL=2.36;
  const corners=[[-halfW,-halfL],[halfW,-halfL],[halfW,halfL],[-halfW,halfL]].map(([x,z])=>({right:p.right-x*Math.cos(angle)+z*Math.sin(angle),forward:p.forward+x*Math.sin(angle)+z*Math.cos(angle)}));
  const bottom=corners.map(v=>project(v,.12)),top=corners.map(v=>project(v,1.3));
  c.fillStyle=own?'#9a9fa5':'#a6adb5';for(let i=0;i<4;i++){c.beginPath();for(const v of [bottom[i],bottom[(i+1)%4],top[(i+1)%4],top[i]])c.lineTo(v.x,v.y);c.closePath();c.fill();}
  c.beginPath();top.forEach((v,i)=>i?c.lineTo(v.x,v.y):c.moveTo(v.x,v.y));c.closePath();c.fillStyle=own?'#f8f9fb':'#b9c0c8';c.fill();c.strokeStyle=own?'#7a8189':'#9ca5af';c.lineWidth=1;c.stroke();
  c.save();c.translate(q.x,q.y-1.15*q.scale);c.rotate(-angle*.5);c.fillStyle=own?'#26313e':'#7a8795';c.fillRect(-q.scale*.65,-q.scale*.7,q.scale*1.3,q.scale*1.5);c.restore();
 };
 const actors=cars.filter(car=>!car.ego).map(car=>({car,p:ego(car)})).filter(a=>a.p.forward>-9&&a.p.forward<100&&Math.abs(a.p.right)<45).sort((a,b)=>b.p.forward-a.p.forward);
 for(const {car,p} of actors)drawCar(p,car.heading);
 for(const person of people){const p=ego(person);if(p.forward<0||p.forward>65||Math.abs(p.right)>25)continue;const q=project(p);c.fillStyle='#5f6873';c.beginPath();c.arc(q.x,q.y-q.scale*1.55,q.scale*.15,0,7);c.fill();c.fillRect(q.x-q.scale*.13,q.y-q.scale*1.4,q.scale*.26,q.scale*.8);}
 drawCar({right:0,forward:0},player.heading,true);
 c.fillStyle='#171a20';c.font=`500 ${Math.round(h*(compact?.18:.14))}px -apple-system,Arial`;c.fillText(String(Math.round(Math.abs(speed)*2.237)),w*.045,h*.17);
 c.fillStyle='#676d75';c.font=`500 ${Math.max(10,h*.029)}px -apple-system,Arial`;c.fillText('MPH',w*.05,h*.215);
 c.fillStyle='#636a74';c.font=`600 ${Math.max(11,h*.031)}px -apple-system,Arial`;c.fillText(Math.abs(speed)<.05?'P':speed<0?'R':'D',w*.05,h*.285);
 c.fillStyle=assist?'#147bf3':'#737a83';c.font=`600 ${Math.max(10,h*.025)}px -apple-system,Arial`;c.textAlign='right';c.fillText(assist?'AUTO DRIVE':'MANUAL',w*.95,h*.075);c.textAlign='left';
 c.fillStyle='#575f68';c.font=`500 ${Math.max(10,h*.025)}px -apple-system,Arial`;c.textAlign='center';c.fillText(road||'City Drive',w*.5,h*.95);c.textAlign='left';
}

export function drawNavigation(c,w,h,{player,Geo,places=[],found=new Set(),route=null,full=false}={}){
 c.fillStyle='#e8ebed';c.fillRect(0,0,w,h);if(!Geo||!player)return;
 const range=full?Math.max(Geo.W,Geo.H*w/h):520,scale=w/range,ox=full?(w-Geo.W*scale)/2:w/2-player.x*scale,oy=full?(h-Geo.H*scale)/2:h/2-player.y*scale;
 const poly=(points,fill,stroke=null,width=1)=>{c.beginPath();points.forEach((p,i)=>i?c.lineTo(ox+p[0]*scale,oy+p[1]*scale):c.moveTo(ox+p[0]*scale,oy+p[1]*scale));if(fill){c.closePath();c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke()}};
 for(const water of Geo.waterAll)poly(water.p,'#c0d8eb');for(const park of Geo.areas)poly(park.p,'#d4e2d0');
 for(const r of Geo.roads){poly(r.p,null,'#ccd1d5',Math.max(1,r.width*scale+2));poly(r.p,null,'#fff',Math.max(.7,r.width*scale));}
 for(const b of Geo.buildings){if(ox+b.box.r*scale<0||ox+b.box.x*scale>w||oy+b.box.b*scale<0||oy+b.box.y*scale>h)continue;poly(b.p,'#d5d8dc');}
 if(route?.points?.length)poly(route.points.map(p=>[p.x,p.y]),null,'#1878ec',Math.max(2,w*.007));
 for(const p of places){const x=ox+p.x*scale,y=oy+p.y*scale;c.fillStyle=found.has(p.name)?'#71867a':'#303841';c.beginPath();c.arc(x,y,full?4:2.5,0,7);c.fill();if(full){c.font='500 10px -apple-system,Arial';c.fillText(p.name,Math.max(4,Math.min(w-160,x+7)),y-7);}}
 const x=ox+player.x*scale,y=oy+player.y*scale;c.save();c.translate(x,y);c.rotate(-player.heading);c.beginPath();c.moveTo(0,8);c.lineTo(-5,-6);c.lineTo(5,-6);c.closePath();c.fillStyle='#147bf3';c.fill();c.strokeStyle='#fff';c.lineWidth=2;c.stroke();c.restore();
}
