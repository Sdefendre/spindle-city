// Small directed road graph built from the mapped street geometry.
// Distances use the same map coordinates as Geo and preserve OSM one-way tags.
const graphs=new WeakMap(),pointKey=p=>`${Math.round(p[0]*10)},${Math.round(p[1]*10)}`;
function roadDirections(r){return r.oneway==='-1'?[false,true]:r.oneway==='yes'||r.oneway==='1'||r.oneway==='true'?[true,false]:[true,true]}
function roadGraph(Geo){if(graphs.has(Geo))return graphs.get(Geo);const graph=new Map();
 const vertex=p=>{const key=pointKey(p);if(!graph.has(key))graph.set(key,{key,x:p[0],y:p[1],edges:[]});return graph.get(key)};
 for(const road of Geo.roads){if(!road.drive||road.p.length<2)continue;const [forward,back]=roadDirections(road);for(let i=1;i<road.p.length;i++){const a=vertex(road.p[i-1]),b=vertex(road.p[i]),distance=Math.hypot(a.x-b.x,a.y-b.y);if(!distance)continue;if(forward)a.edges.push({to:b,cost:distance});if(back)b.edges.push({to:a,cost:distance})}}graphs.set(Geo,graph);return graph}
export function planRoadRoute(Geo,start,end){
 const graph=roadGraph(Geo);
 function locate(p){const near=Geo.nearestRoad(p.x,p.y,true);if(!near.r||!Number.isFinite(near.distance))return null;const road=near.r;let best=null;for(let i=1;i<road.p.length;i++){const a=road.p[i-1],b=road.p[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(!length)continue;const t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/(length*length))),x=a[0]+dx*t,y=a[1]+dy*t,distance=Math.hypot(p.x-x,p.y-y);if(!best||distance<best.distance)best={road,a:graph.get(pointKey(a)),b:graph.get(pointKey(b)),x,y,t,length,distance}}return best}
 const source=locate(start),dest=locate(end);if(!source||!dest||source.distance>source.road.width/2+12||dest.distance>100)return null;
 const [sf,sb]=roadDirections(source.road),[df,db]=roadDirections(dest.road),starts=[];if(sf)starts.push([source.b,(1-source.t)*source.length]);if(sb)starts.push([source.a,source.t*source.length]);const ends=new Map();if(df)ends.set(dest.a.key,dest.t*dest.length);if(db)ends.set(dest.b.key,(1-dest.t)*dest.length);
 const costs=new Map(),previous=new Map(),queue=[];function push(item){queue.push(item);let i=queue.length-1;while(i){let p=(i-1)>>1;if(queue[p].cost<=item.cost)break;queue[i]=queue[p];i=p}queue[i]=item}function pop(){let top=queue[0],last=queue.pop();if(queue.length){let i=0;while(true){let l=2*i+1,r=l+1;if(l>=queue.length)break;let c=r<queue.length&&queue[r].cost<queue[l].cost?r:l;if(queue[c].cost>=last.cost)break;queue[i]=queue[c];i=c}queue[i]=last}return top}
 for(const [node,cost] of starts){if(cost<(costs.get(node.key)??Infinity)){costs.set(node.key,cost);push({node,cost})}}
 let winner=null,winnerCost=Infinity;
 while(queue.length){const item=pop();if(item.cost!==costs.get(item.node.key)||item.cost>=winnerCost)continue;const tail=ends.get(item.node.key);if(tail!==undefined&&item.cost+tail<winnerCost){winner=item.node;winnerCost=item.cost+tail}for(const edge of item.node.edges){const cost=item.cost+edge.cost;if(cost<(costs.get(edge.to.key)??Infinity)&&cost<winnerCost){costs.set(edge.to.key,cost);previous.set(edge.to.key,item.node.key);push({node:edge.to,cost})}}}
 // Both anchors can lie on the same directed road segment.
 const same=source.road===dest.road&&source.a===dest.a&&source.b===dest.b;const direct=same&&((sf&&dest.t>=source.t)||(sb&&dest.t<=source.t))?Math.abs(dest.t-source.t)*source.length:Infinity;
 if(direct<winnerCost)return{points:[{x:source.x,y:source.y},{x:dest.x,y:dest.y}],distance:direct};
 if(!winner)return null;const path=[];for(let key=winner.key;key;key=previous.get(key)){const n=graph.get(key);path.push({x:n.x,y:n.y})}path.reverse();const points=[{x:source.x,y:source.y},...path,{x:dest.x,y:dest.y}].filter((p,i,a)=>!i||Math.hypot(p.x-a[i-1].x,p.y-a[i-1].y)>.1);return{points,distance:winnerCost};
}
