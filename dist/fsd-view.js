// FSD v15 Reality View inspired canvas visualizations (in-dash cockpit + split/full navigation map).
const S=1/1.5;

export function drawDrivingDisplay(c,w,h,{player,cars=[],people=[],Geo,route=null,speed=0,assist=false,road='',compact=false}={}){
 c.clearRect(0,0,w,h);
 // Sleek Reality View twilight-slate sky-to-horizon backdrop
 const bg=c.createLinearGradient(0,0,0,h);
 bg.addColorStop(0,'#0e1522');
 bg.addColorStop(0.36,'#182436');
 bg.addColorStop(0.55,'#1d2734');
 bg.addColorStop(1,'#10151d');
 c.fillStyle=bg;c.fillRect(0,0,w,h);
 if(!player||!Geo)return;

 const sin=Math.sin(player.heading),cos=Math.cos(player.heading),cx=w*.5,base=h*.82;
 const ego=p=>{const dx=(p.x-player.x)*S,dz=((p.y??p.z)-player.y)*S;return{right:-dx*cos+dz*sin,forward:dx*sin+dz*cos}};
 const project=(p,height=0)=>{const scale=w*.058/(1+Math.max(-8,p.forward)*.031);return{x:cx+p.right*scale,y:base-p.forward*scale*.56-height*scale,scale}};
 const line=(points,color,width,dash=[])=>{if(points.length<2)return;c.beginPath();for(let i=0;i<points.length;i++){const p=project(points[i]);i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y)}c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.setLineDash(dash);c.stroke();c.setLineDash([])};

 // Subtle atmospheric horizon glow
 const hg=c.createRadialGradient(cx,h*.36,10,cx,h*.36,w*.55);
 hg.addColorStop(0,'rgba(44,148,255,0.16)');
 hg.addColorStop(1,'rgba(44,148,255,0)');
 c.fillStyle=hg;c.fillRect(0,0,w,h);

 // Nearby extruded buildings for neural-city silhouette depth
 const blds=Geo.buildings.filter(b=>player.x>b.box.x-150&&player.x<b.box.r+150&&player.y>b.box.y-150&&player.y<b.box.b+150).slice(0,45);
 for(const b of blds){
  const center=ego({x:(b.box.x+b.box.r)/2,y:(b.box.y+b.box.b)/2});
  if(center.forward<4||center.forward>110||Math.abs(center.right)>65)continue;
  const q=project(center,0),qt=project(center,Math.min(18,(b.height||9)*0.8));
  const bw=Math.max(8,((b.box.r-b.box.x)*S)*q.scale*0.45);
  c.fillStyle='rgba(36, 48, 66, 0.55)';
  c.strokeStyle='rgba(110, 150, 200, 0.16)';
  c.lineWidth=1;
  c.fillRect(q.x-bw/2,qt.y,bw,q.y-qt.y);
  c.strokeRect(q.x-bw/2,qt.y,bw,q.y-qt.y);
 }

 const nearby=Geo.roads.filter(r=>r.drive&&player.x>r.box.x-190&&player.x<r.box.r+190&&player.y>r.box.y-190&&player.y<r.box.b+190);
 for(const r of nearby)for(let i=1;i<r.p.length;i++){
  const a=ego({x:r.p[i-1][0],y:r.p[i-1][1]}),b=ego({x:r.p[i][0],y:r.p[i][1]});if(Math.max(a.forward,b.forward)<-12||Math.min(a.forward,b.forward)>125)continue;
  const dx=b.right-a.right,dz=b.forward-a.forward,len=Math.hypot(dx,dz)||1,half=r.width*S/2,nx=-dz/len*half,nz=dx/len*half;
  const corners=[{right:a.right+nx,forward:a.forward+nz},{right:b.right+nx,forward:b.forward+nz},{right:b.right-nx,forward:b.forward-nz},{right:a.right-nx,forward:a.forward-nz}];
  c.beginPath();corners.forEach((p,j)=>{const q=project(p);j?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y)});c.closePath();c.fillStyle='#242c37';c.fill();
  line([corners[0],corners[1]],'rgba(148,175,205,0.28)',1.2);line([corners[3],corners[2]],'rgba(148,175,205,0.28)',1.2);line([a,b],'rgba(230,240,255,0.45)',compact?1:1.6,[w*.016,w*.016]);
 }

 // Glowing FSD v15 sky-blue trajectory ribbon
 const ribbonPts=route?.points?.length
  ? route.points.slice(Math.max(0,(route.index||0)-1)).map(ego).filter(p=>p.forward>-8&&p.forward<120)
  : [{right:0,forward:0},{right:0,forward:45}];
 c.save();
 c.shadowColor='#32a4ff';c.shadowBlur=18;
 line(ribbonPts,assist?'rgba(42,162,255,0.42)':'rgba(54,158,255,0.26)',w*.052);
 line(ribbonPts,assist?'#38b6ff':'#68b8ff',w*.012);
 c.restore();

 // AR Sky Chevrons floating above the road in the display
 if(route?.points?.length){
  for(const distF of [22,46]){
   const pt=ribbonPts.find(p=>p.forward>=distF);
   if(!pt)continue;
   const q=project(pt,5.8);
   const s=Math.max(8,q.scale*1.9);
   c.save();c.translate(q.x,q.y);c.strokeStyle='#7cd2ff';c.shadowColor='#1e90ff';c.shadowBlur=14;c.lineWidth=Math.max(2,s*.18);c.lineCap='round';c.lineJoin='round';
   c.beginPath();c.moveTo(-s*.6,s*.3);c.lineTo(0,-s*.35);c.lineTo(s*.6,s*.3);c.stroke();c.restore();
  }
 }

 const drawCar=(p,heading,own=false)=>{
  const q=project(p),angle=heading-player.heading,halfW=.94,halfL=2.36;
  const corners=[[-halfW,-halfL],[halfW,-halfL],[halfW,halfL],[-halfW,halfL]].map(([x,z])=>({right:p.right-x*Math.cos(angle)+z*Math.sin(angle),forward:p.forward+x*Math.sin(angle)+z*Math.cos(angle)}));
  const bottom=corners.map(v=>project(v,.12)),top=corners.map(v=>project(v,1.3));
  // Soft contact shadow
  c.beginPath();bottom.forEach((v,i)=>i?c.lineTo(v.x,v.y+2):c.moveTo(v.x,v.y+2));c.closePath();c.fillStyle='rgba(0,0,0,0.42)';c.fill();
  c.fillStyle=own?'#bcc8d6':'#515d6d';for(let i=0;i<4;i++){c.beginPath();for(const v of [bottom[i],bottom[(i+1)%4],top[(i+1)%4],top[i]])c.lineTo(v.x,v.y);c.closePath();c.fill();}
  c.beginPath();top.forEach((v,i)=>i?c.lineTo(v.x,v.y):c.moveTo(v.x,v.y));c.closePath();c.fillStyle=own?'#f5f8fc':'#788799';c.fill();c.strokeStyle=own?'#8cc8ff':'#94a4b8';c.lineWidth=own?1.4:0.9;c.stroke();
  c.save();c.translate(q.x,q.y-1.15*q.scale);c.rotate(-angle*.5);c.fillStyle=own?'#131c28':'#2c3847';c.fillRect(-q.scale*.62,-q.scale*.68,q.scale*1.24,q.scale*1.45);c.restore();
 };

 const actors=cars.filter(car=>!car.ego).map(car=>({car,p:ego(car)})).filter(a=>a.p.forward>-9&&a.p.forward<100&&Math.abs(a.p.right)<45).sort((a,b)=>b.p.forward-a.p.forward);
 for(const {car,p} of actors)drawCar(p,car.heading);
 for(const person of people){const p=ego(person);if(p.forward<0||p.forward>65||Math.abs(p.right)>25)continue;const q=project(p);c.fillStyle='#9db4cc';c.beginPath();c.arc(q.x,q.y-q.scale*1.55,q.scale*.15,0,7);c.fill();c.fillRect(q.x-q.scale*.13,q.y-q.scale*1.4,q.scale*.26,q.scale*.8);}
 drawCar({right:0,forward:0},player.heading,true);

 // Crisp FSD v15 top-left cluster
 c.fillStyle='#f6f9fc';c.font=`500 ${Math.round(h*(compact?.17:.135))}px -apple-system,BlinkMacSystemFont,Arial`;c.fillText(String(Math.round(Math.abs(speed)*2.237)),w*.045,h*.17);
 c.fillStyle='#8b9cb2';c.font=`500 ${Math.max(10,h*.026)}px -apple-system,Arial`;c.fillText('MPH',w*.05,h*.215);
 const gear=Math.abs(speed)<.05?'P':speed<0?'R':'D';
 ['P','R','N','D'].forEach((g,idx)=>{
  c.fillStyle=g===gear?'#ffffff':'rgba(145,162,184,0.45)';
  c.font=`600 ${Math.max(11,h*.028)}px -apple-system,Arial`;
  c.fillText(g,w*.048+idx*w*.028,h*.28);
 });
 // Top-right FSD v15 badge
 c.fillStyle=assist?'#38b6ff':'#8fa4be';c.font=`600 ${Math.max(10,h*.024)}px -apple-system,Arial`;c.textAlign='right';c.fillText(assist?'FSD v15 · REALITY VIEW':'REALITY VIEW · MANUAL',w*.955,h*.075);c.textAlign='left';
 c.fillStyle='rgba(220,234,250,0.78)';c.font=`500 ${Math.max(10,h*.024)}px -apple-system,Arial`;c.textAlign='center';c.fillText(road||'Spindle City',w*.5,h*.95);c.textAlign='left';
}

export function drawNavigation(c,w,h,{player,Geo,places=[],found=new Set(),route=null,full=false,dark=true}={}){
 c.fillStyle=dark?'#141922':'#e8ebed';c.fillRect(0,0,w,h);if(!Geo||!player)return;
 const range=full?Math.max(Geo.W,Geo.H*w/h):520,scale=w/range,ox=full?(w-Geo.W*scale)/2:w/2-player.x*scale,oy=full?(h-Geo.H*scale)/2:h/2-player.y*scale;
 const poly=(points,fill,stroke=null,width=1)=>{c.beginPath();points.forEach((p,i)=>i?c.lineTo(ox+p[0]*scale,oy+p[1]*scale):c.moveTo(ox+p[0]*scale,oy+p[1]*scale));if(fill){c.closePath();c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke()}};
 for(const water of Geo.waterAll)poly(water.p,dark?'#102438':'#c0d8eb');
 for(const park of Geo.areas)poly(park.p,dark?'#172924':'#d4e2d0');
 for(const r of Geo.roads){if(ox+r.box.r*scale<0||ox+r.box.x*scale>w||oy+r.box.b*scale<0||oy+r.box.y*scale>h)continue;poly(r.p,null,dark?'#1c232f':'#ccd1d5',Math.max(1,r.width*scale+2));poly(r.p,null,dark?'#2c3647':'#fff',Math.max(.8,r.width*scale));}
 for(const b of Geo.buildings){if(ox+b.box.r*scale<0||ox+b.box.x*scale>w||oy+b.box.b*scale<0||oy+b.box.y*scale>h)continue;poly(b.p,dark?'#1d2430':'#d5d8dc');}
 if(route?.points?.length){
  c.save();c.shadowColor='#2b9aff';c.shadowBlur=10;
  poly(route.points.map(p=>[p.x,p.y]),null,'#38b6ff',Math.max(2.6,w*.008));
  c.restore();
 }
 const placedLabels=[];
 for(const p of places){
  const x=ox+p.x*scale,y=oy+p.y*scale;
  c.fillStyle=found.has(p.name)?'#4cd98b':'#8ea7c4';
  c.beginPath();c.arc(x,y,full?4.2:2.6,0,7);c.fill();
  if(full){
   const lx=Math.max(6,Math.min(w-150,x+7)),ly=y-6;
   if(!placedLabels.some(q=>Math.abs(q.x-lx)<115&&Math.abs(q.y-ly)<14)){
    placedLabels.push({x:lx,y:ly});
    c.fillStyle=dark?'rgba(232,240,250,0.88)':'#171a20';
    c.font='500 10px -apple-system,Arial';
    c.fillText(p.name,lx,ly);
   }
  }
 }
 const x=ox+player.x*scale,y=oy+player.y*scale;
 c.save();c.translate(x,y);c.rotate(-player.heading);
 c.shadowColor='#38b6ff';c.shadowBlur=10;
 c.beginPath();c.moveTo(0,9);c.lineTo(-5.5,-6.5);c.lineTo(5.5,-6.5);c.closePath();
 c.fillStyle='#299bff';c.fill();c.strokeStyle='#ffffff';c.lineWidth=1.8;c.stroke();c.restore();
 return {ox,oy,scale};
}
