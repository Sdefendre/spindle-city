import {loadTerrain} from './terrain.js';
const city=window.activeCity;
async function loadCity(){
 if(!window[city.mapKey])await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=city.mapAsset;script.onload=resolve;script.onerror=()=>reject(new Error('Could not load '+city.name+' map data.'));document.head.append(script)});
 window.CITY_DATA=window[city.mapKey];window.Geo=window.createGeography(window.CITY_DATA);
 await loadTerrain(window.Geo,city.id);
 document.title=`Tesla City Drive | ${city.name}`;
 document.querySelector('.brand h1').firstChild.nodeValue='TESLA';
 document.querySelector('meta[name="description"]').content=`Walk ${city.name} at street level in 3D. Explore real mapped streets, landmarks and waterfront.`;
 document.getElementById('game').setAttribute('aria-label',`3D ${city.name} street-level exploration game`);
 document.querySelectorAll('[data-city-name]').forEach(el=>el.textContent=city.name);
 document.querySelectorAll('[data-city-state]').forEach(el=>el.textContent=city.state);
 document.querySelectorAll('[data-city-short]').forEach(el=>el.textContent=city.short);
}
loadCity().then(()=>import('./play3d.js')).catch(error=>{console.error(error);document.getElementById('play').disabled=true;document.getElementById('play').textContent='Unable to start 3D';document.getElementById('loadStatus').textContent='3D could not start in this browser. Try Chrome or Safari with WebGL enabled, then reload.';});
