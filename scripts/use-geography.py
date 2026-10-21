from pathlib import Path
p=Path('dist/game.js');s=p.read_text()
a=s.index('const W=');b=s.index('let saved=')
s=s[:a]+'''const W=Geo.W,H=Geo.H,buildings=Geo.buildings,npcs=[],cars=[];
const landmarkSpecs=[['Battleship Cove','A fleet at the real Fall River waterfront.'],['Bicentennial Park','The riverfront park along Davol Street.'],['Fall River City Hall','Government Center, right over Interstate 195.'],['Lizzie Borden House','The historic house on Second Street.'],['Fall River Heritage State Park','Green space beside the waterfront.'],['Quequechan Rail Trail','Follow the river through the city.'],['Kennedy Park','The South End’s large historic park.']];
const places=landmarkSpecs.map(([name,desc])=>{let options=Geo.data.pois.filter(p=>p.name===name&&p.p[0]>100&&p.p[0]<W&&p.p[1]>0&&p.p[1]<H);let p=name==='Battleship Cove'?options.find(p=>p.tags.tourism)||options[0]:options[0];if(!p)throw new Error('Missing mapped landmark: '+name);let safe=Geo.safePoint(...p.p);return{name,desc,x:safe.x,y:safe.y,sourcePosition:p.p}});
''' +s[b:]
s=s.replace("'spindle-city-v1'","'spindle-city-real-map-v2'")
s=s.replace("player={x:790,y:1150", "player={...Geo.safePoint(1390,3200)")
s=s.replace("camera={x:790,y:1150}","camera={x:1390,y:3200}")
a=s.index('const world=');b=s.index('function resize()')
s=s[:a]+'''for(let i=0;i<65;i++){let route=Geo.driving[Math.floor(rand()*Geo.driving.length)],c={route,pos:rand()*300,speed:32+rand()*35,color:pick(['#b8c9ae','#b06c47','#d4b665','#466f73','#a65d57','#e2d9b8'])};Object.assign(c,Geo.routePoint(route,c.pos));cars.push(c)}
// A conveniently parked car at the starting road, plus traffic on mapped road segments.
let starter=Geo.nearestRoad(1390,3200,true);cars.push({x:starter.x,y:starter.y,angle:starter.angle,parked:true,color:'#d4b665'});
function carPos(c){return{x:c.x,y:c.y}}
for(let i=0;i<65;i++){let route=Geo.driving[Math.floor(rand()*Geo.driving.length)],pos=rand()*300,p=Geo.routePoint(route,pos);npcs.push({route,pos,...p,speed:12+rand()*10,color:pick(['#b79760','#d2bba0','#657c80','#c18a72','#58654c'])})}
''' +s[b:]
s=s.replace("zoom=innerWidth<700?.85:1.12", "zoom=innerWidth<700?1.25:1.6")
a=s.index('function blocked(');b=s.index('function move(')
s=s[:a]+'''function blocked(x,y){return Geo.blocked(x,y)}
'''+s[b:]
s=s.replace("let best=null,d=95", "let best=null,d=65")
s=s.replace("let options=[[70,0],[-70,0],[0,70],[0,-70]]", "let options=[[24,0],[-24,0],[0,24],[0,-24],[45,0],[-45,0]]")
s=s.replace("d<155", "d<95").replace("<240", "<160")
a=s.index('if(vehicle){let v=vehicle;');b=s.index('closest=null;',a)
s=s[:a]+'''if(vehicle){let dx=ax*dt*220,dy=ay*dt*220;move(dx,dy);vehicle.x=player.x;vehicle.y=player.y;if(player.moving)vehicle.angle=Math.atan2(ay,ax)}
else if(player.moving){const n=Math.max(1,Math.hypot(ax,ay)),speed=player.run?180:90;move(ax/n*speed*dt,ay/n*speed*dt)}
for(const c of cars){if(c===vehicle||c.parked)continue;if(Math.hypot(c.x-player.x,c.y-player.y)<65&&!vehicle)continue;c.pos+=c.speed*dt;Object.assign(c,Geo.routePoint(c.route,c.pos))}
for(const n of npcs){n.pos+=n.speed*dt;let p=Geo.routePoint(n.route,n.pos);let x=p.x+Math.cos(p.angle+Math.PI/2)*16,y=p.y+Math.sin(p.angle+Math.PI/2)*16;if(!blocked(x,y)){n.x=x;n.y=y}}
''' + s[b:]
a=s.index("$('district').textContent=");b=s.index('const mins=',a)
s=s[:a]+"let near=Geo.nearestRoad(player.x,player.y);$('district').textContent=near.r.name||'FALL RIVER';"+s[b:]
s=s.replace("ctx.rotate(c.vertical?(c.dir>0?Math.PI/2:-Math.PI/2):c.dir>0?0:Math.PI)","ctx.rotate(c.angle||0);ctx.scale(.58,.58)")
s=s.replace("player.y+1,19,7", "player.y+1,11,4")
s=s.replace("-42,-79,84,84", "-25,-47,50,50").replace("player.y-86", "player.y-53").replace("player.y-80", "player.y-48")
a=s.index('function drawMap(');b=s.index('function render()',a)
s=s[:a]+'''function drawMap(c,w,h,big=false){c.clearRect(0,0,w,h);c.fillStyle='#244b43';c.fillRect(0,0,w,h);let scale=Math.min(w/W,h/H),ox=(w-W*scale)/2,oy=(h-H*scale)/2;c.drawImage(Geo.map,ox,oy,W*scale,H*scale);for(const p of places){let x=ox+p.x*scale,y=oy+p.y*scale;c.fillStyle=found.has(p.name)?'#c4f678':'#e5be6b';c.beginPath();c.arc(x,y,big?5:2.4,0,7);c.fill();if(big){c.font='bold 11px sans-serif';c.fillStyle='#fff8da';c.fillText(p.name,Math.min(x+9,w-160),y-8)}}c.fillStyle='#fff';c.strokeStyle='#14221f';c.lineWidth=2;c.beginPath();c.arc(ox+player.x*scale,oy+player.y*scale,big?6:4,0,7);c.fill();c.stroke()}
''' +s[b:]
s=s.replace("started?player.x:1350", "started?player.x:1600").replace("started?player.y:1100", "started?player.y:3300")
s=s.replace("ctx.drawImage(world,0,0)", "Geo.draw(ctx,{x:camX-width/zoom/2-40,y:camY-height/zoom/2-40,r:camX+width/zoom/2+40,b:camY+height/zoom/2+40})")
s=s.replace("ctx.translate(n.x,n.y)","ctx.translate(n.x,n.y)")
# NPCs have smaller proportions matching mapped street scale.
s=s.replace("for(const n of npcs){ctx.fillStyle", "for(const n of npcs){ctx.save();ctx.translate(n.x,n.y);ctx.scale(.6,.6);ctx.translate(-n.x,-n.y);ctx.fillStyle")
s=s.replace("n.x,n.y-39,6,0,7);ctx.fill()}", "n.x,n.y-39,6,0,7);ctx.fill();ctx.restore()}")
s=s.replace("let known=found.has(p.name);ctx.save()", "let known=found.has(p.name);ctx.save()")
p.write_text(s)
p=Path('dist/index.html');s=p.read_text().replace('<script src="game.js">','<script src="assets/city-map.js"></script><script src="geography.js"></script><script src="game.js">').replace('Inspired by Fall River · Stylized map, not street-accurate','Real street layout · Downtown, waterfront & South End').replace('Touch controls available on mobile','Touch controls available on mobile').replace('</body>','<a class="attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">Map data © OpenStreetMap contributors · ODbL</a></body>');p.write_text(s)
p=Path('dist/style.css');s=p.read_text()+'''\n.attribution{position:fixed;bottom:3px;right:8px;font-size:8px;color:#e4ecd6;background:#14221fbf;padding:2px 5px;text-decoration:none;z-index:6}.mapPanel canvas{height:auto}''';p.write_text(s)
