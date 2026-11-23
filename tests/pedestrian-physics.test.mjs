import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three.module.js';
import {createPedestrianPhysics} from '../dist/pedestrian-physics.js';

test('a struck pedestrian becomes articulated, falls under gravity and settles without non-finite transforms',()=>{
 const scene=new T.Scene(),physics=createPedestrianPhysics(scene,{buildings:[]},{mobile:true});
 const person={id:1,x:0,y:0,scale:1,variant:{},c:{root:new T.Group()}};scene.add(person.c.root);
 physics.knock(person,0,1,6);
 assert.equal(person.knocked,true);assert.equal(person.c.root.visible,false);
 const meshes=scene.children.filter(n=>n.isMesh);assert.ok(meshes.length>=8,'a person has independently moving body segments');
 const initialHeight=meshes.reduce((sum,m)=>sum+m.position.y,0);
 for(let i=0;i<240;i++)physics.update(1/60,null,[person],{x:0,y:0});
 for(const mesh of meshes){assert.ok(mesh.position.toArray().every(Number.isFinite));assert.ok(mesh.position.y>-.4&&mesh.position.y<1.5,'body segment remains near the ground');}
 assert.ok(meshes.reduce((sum,m)=>sum+m.position.y,0)/meshes.length<.8,'fallen body settles below standing height');
 assert.ok(Number.isFinite(person.x)&&Number.isFinite(person.y));
});
