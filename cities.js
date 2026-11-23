'use strict';
// The two play spaces are distinct destinations.  A selector deliberately
// reloads the destination rather than implying there is a drivable road between
// Fall River and New Bedford in this compact game world.
window.CITY_CONFIGS={
 fallRiver:{
  id:'fall-river',short:'FR',name:'Fall River',state:'MASSACHUSETTS',brand:'SPINDLE CITY',mapKey:'CITY_DATA',
  mapAsset:'assets/city-map.js',fallbackSpawn:[1966,4130],highwayRoadId:'9099615',highway:/I[- ]?195|Interstate 195/i,highwayLabel:'I-195 access',
  intro:'Real Fall River streets. A whole new perspective.',welcome:'WELCOME TO FALL RIVER',
  places:[
   ['Battleship Cove','Museum ships beside the waterfront.'],['Bicentennial Park','The riverfront park along Davol Street.'],['Fall River City Hall','Government Center, above Interstate 195.'],['Lizzie Borden House','The historic house on Second Street.'],['Fall River Heritage State Park','Green space beside the waterfront.'],['Quequechan Rail Trail','Follow the river through the city.'],['Kennedy Park','The South End’s historic park.']],
  tours:['Academy Building','Fall River City Hall','Lizzie Borden House','Fall River Justice Center','Narrows Center for the Arts','Tecumseh Mill No.1']
 },
 newBedford:{
  id:'new-bedford',short:'NB',name:'New Bedford',state:'MASSACHUSETTS',brand:'HARBOR CITY',mapKey:'NEW_BEDFORD_DATA',
  mapAsset:'assets/new-bedford-map.js',fallbackSpawn:[2280,1340],spawnPlace:'New Bedford City Hall',highway:/John F\. Kennedy Highway|Route 18/i,highwayLabel:'Route 18 access',
  intro:'Real New Bedford streets, the historic district and working waterfront.',welcome:'WELCOME TO NEW BEDFORD',
  places:[
   ['New Bedford Whaling Museum','The historic whaling district beside Johnny Cake Hill.'],["Seamen's Bethel",'The sailors’ chapel above the waterfront.'],['U.S. Custom House','Greek Revival landmark on North Second Street.'],['New Bedford City Hall','The civic center in the downtown street grid.'],['New Bedford Fishing Heritage Center','Working-waterfront history on the harbor.'],['State Pier','A real mapped harbor landmark and port access.'],['Custom House Square Park','A green pause in the historic district.']],
  tours:['New Bedford Whaling Museum',"Seamen's Bethel",'U.S. Custom House','New Bedford City Hall','New Bedford Fishing Heritage Center','State Pier']
 }
};
window.CITY_SELECTION_KEY='spindle-city-selected-city-v1';
window.activeCityId=(()=>{try{return localStorage.getItem(window.CITY_SELECTION_KEY)||'fall-river'}catch{return'fall-river'}})();
window.activeCity=Object.values(window.CITY_CONFIGS).find(city=>city.id===window.activeCityId)||window.CITY_CONFIGS.fallRiver;
