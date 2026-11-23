// Installable Home Screen shell; rendering and input remain standard web APIs.
// Backgrounding: tell the game to halt. The game never auto-resumes; the player resumes manually.
const pausing=()=>document.dispatchEvent(new Event('app-pausing'));
addEventListener('pagehide',pausing);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pausing()});
document.addEventListener('freeze',pausing);

if('serviceWorker' in navigator){
 const sw=navigator.serviceWorker;let wanted=false,reloading=false,lastCheck=Date.now();
 const reload=()=>{if(reloading)return;reloading=true;location.reload()};
 // Reload only after the new worker has actually taken control, and only when the player asked for it
 // (the first install also fires controllerchange via clients.claim and must not reload).
 sw.addEventListener('controllerchange',()=>{if(wanted)reload()});
 const offer=reg=>{
  if(!reg.waiting||!sw.controller||document.querySelector('.app-update'))return;
  const note=document.createElement('div');note.className='app-update';note.setAttribute('role','status');note.textContent='A game update is ready. ';
  const button=document.createElement('button');button.type='button';button.textContent='Reload';
  button.onclick=()=>{button.disabled=true;button.textContent='Updating…';pausing();wanted=true;
   const waiting=reg.waiting;if(!waiting){reload();return} // already activated elsewhere
   waiting.postMessage({type:'ACTIVATE_UPDATE'});setTimeout(reload,4000)}; // fallback if activation stalls
  note.append(button);document.body.append(note)};
 const track=(reg,worker)=>{if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='installed')offer(reg)})};
 addEventListener('load',()=>sw.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(reg=>{
  offer(reg);track(reg,reg.installing);reg.addEventListener('updatefound',()=>track(reg,reg.installing));
  // Home Screen apps can stay alive for days without navigating, so check on return (at most hourly).
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastCheck>36e5){lastCheck=Date.now();reg.update().catch(()=>{})}});
 }).catch(()=>{}));
}
