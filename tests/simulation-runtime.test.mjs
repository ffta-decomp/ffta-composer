// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openRom} from '../src/project.mjs';
import {decodeInstructions} from '../src/rom.mjs';
import {createSceneSimulation,SIMULATION_INSTRUCTIONS} from '../src/scene-simulator.mjs';
import {newSimulationRuntime,simulateRuntimeInstruction} from '../src/simulation-runtime.mjs';

test('the JS simulation explicitly classifies every native opcode',()=>{
  assert.equal(SIMULATION_INSTRUCTIONS.length,114);
  assert.deepEqual(SIMULATION_INSTRUCTIONS.map(d=>d.opcode),Array.from({length:114},(_,i)=>i));
  for(const d of SIMULATION_INSTRUCTIONS)assert.ok(['core','model','external'].includes(d.handling));
});

function harness(runtime={}){
  const state={actors:[],runtime:newSimulationRuntime(runtime)},branches=[],requests=[];
  const actor=id=>{let a=state.actors.find(a=>a.id===id);if(!a){a={id,x:0,y:0};state.actors.push(a);}return a;};
  const api={rom:{bytes:new Uint8Array(0)},state,actor,branch:d=>branches.push(d),external:(kind,p)=>requests.push({kind,p}),delay:()=>{},move:()=>{}};
  return {state,branches,requests,run:(op,p)=>simulateRuntimeInstruction(api,op,p)};
}
test('save bytes, unit status, content state and bit flags occupy separate model domains',()=>{
  const h=harness({units:{15:{maxHp:50,maxMp:20,hp:1,mp:0}}});
  h.run(0x1b,{index:13,value:1});h.run(0x61,{});
  assert.equal(h.state.runtime.saveBytes[13],0);assert.equal(h.state.runtime.contentFlags,64);
  h.run(0x2a,{actor:15});assert.equal(h.state.runtime.units[15].hp,50);
  h.run(0x2d,{actor:15,stateIndex:0,value:7});assert.equal(h.state.runtime.units[15].hp,0);
  assert.equal(h.state.runtime.units[15].states[0],7);
  h.run(0x5d,{first:2,second:3});assert.deepEqual(h.state.runtime.contentBytes,[2,3]);
  h.run(0x24,{actor:15});h.run(0x30,{actor:15,mode:0,value:1});h.run(0x23,{actor:15});
  assert.equal(h.state.actors[0].flags,4);
});
test('native predicates retain strict comparisons, flag polarity and explicit missing-context requests',()=>{
  const h=harness({counter:5,definitionFlags:1,saveBytes:{13:2},unitsKnown:true,units:{15:{usable:true,hp:50,maxHp:100}}});
  h.run(0x67,{threshold:5,delta:1});assert.deepEqual(h.branches,[]);
  h.run(0x67,{threshold:4,delta:2});h.run(0x69,{delta:3});h.run(0x6a,{delta:4});
  h.run(0x6e,{delta:5});h.run(0x6f,{unit:15,threshold:50,delta:6});
  h.run(0x6f,{unit:15,threshold:49,delta:7});assert.deepEqual(h.branches,[2,3,4,7]);
  const unknown=harness();unknown.run(0x67,{threshold:1,delta:2});
  assert.equal(unknown.requests[0].kind,'condition');assert.deepEqual(unknown.branches,[]);
});
test('cached paths merge without overflowing the native 32-point capacity',()=>{
  const h=harness({paths:{0:[{x:1,y:1},{x:2,y:2}],1:[{x:2,y:2},{x:3,y:3}]}});
  h.run(0x43,{packedSources:0x10,destination:2});
  assert.deepEqual(h.state.runtime.paths[2],[{x:1,y:1},{x:2,y:2},{x:3,y:3}]);
  h.state.runtime.paths[0]=Array(32).fill({x:1,y:1});assert.throws(()=>h.run(0x43,{packedSources:0x10,destination:2}),/32/);
});

const source=process.env.FFTA_US_ROM;
test('unresolved workflows and missing predicates suspend until explicitly resolved',{skip:!source},async()=>{
  const {rom,project}=await openRom(await readFile(source));
  rom.programs=new Map(rom.programs);
  // Unresolved action 50, counter branch +4 skips save write, end.
  rom.programs.set('0/12',{...rom.programs.get('0/12'),commands:decodeInstructions(
    Uint8Array.of(0x50,1,0x67,2,4,0,0x1b,13,0,1,2),rom.specs)});
  project.scenes[234]={script:{group:0,program:12},dialoguePage:1};
  for(const take of[true,false]){
    const sim=createSceneSimulation(rom,project,234,{mapId:0});
    let s=sim.step();assert.equal(s.phase,'external');assert.equal(s.external.operation,'sceneOp50');
    assert.deepEqual(sim.step(),s);assert.throws(()=>sim.resolveExternal(),/Explicit/);
    sim.resolveExternal({complete:true});s=sim.step();assert.equal(s.external.kind,'condition');
    assert.throws(()=>sim.resolveExternal({complete:true}),/boolean/);
    sim.resolveExternal({branch:take});sim.step();
    assert.equal(sim.snapshot().runtime.saveBytes[13],take?undefined:1);
  }
});

test('targeted fixtures execute the nine opcodes not reached in the retail sweep',{skip:!source},async()=>{
  const {rom,project}=await openRom(await readFile(source));
  const unused=[0x14,0x1b,0x37,0x3b,0x3c,0x40,0x6a,0x6b,0x6f];
  rom.programs=new Map(rom.programs);
  rom.programs.set('0/12',{...rom.programs.get('0/12'),commands:decodeInstructions(Uint8Array.of(
    0x20,15,0x03,0,1,0x14,0,0x1b,13,0,1,0x37,15,
    0x3b,0,0,0,0,0,0,0,0x3c,0,0,0,0,0,0x40,15,0x33,1,
    0x6a,0,0,0x6b,0x6f,15,50,0,0,2),rom.specs)});
  project.scenes[234]={script:{group:0,program:12},dialoguePage:1};
  const sim=createSceneSimulation(rom,project,234,{mapId:0,runtime:{definitionFlags:0,unitsKnown:true,units:{15:{flags:0,usable:true,hp:51,maxHp:100}}}});
  for(let i=0;i<30&&sim.snapshot().phase!=='done';i++){
    if(sim.snapshot().phase==='external')sim.resolveExternal({complete:true});else sim.step();
  }
  const s=sim.snapshot();assert.equal(s.phase,'done');
  for(const opcode of unused)assert.equal(s.coverage[opcode],1);
  assert.equal(s.runtime.units[15].flags,256);assert.equal(s.runtime.saveBytes[13],1);
  assert.equal(s.runtime.events[0].kind,'scene-line');
});

test('a menu branch without a menu result requests input instead of guessing choice zero',{skip:!source},async()=>{
  const {rom,project}=await openRom(await readFile(source));
  rom.programs=new Map(rom.programs);
  rom.programs.set('0/12',{...rom.programs.get('0/12'),commands:decodeInstructions(Uint8Array.of(0x71,4,0,0x1b,13,0,1,2),rom.specs)});
  project.scenes[234]={script:{group:0,program:12},dialoguePage:1};
  const unknown=createSceneSimulation(rom,project,234,{mapId:0});
  assert.equal(unknown.step().external.kind,'condition');
  unknown.resolveExternal({branch:false});unknown.step();assert.equal(unknown.snapshot().runtime.saveBytes[13],1);
  const known=createSceneSimulation(rom,project,234,{mapId:0,runtime:{saveBytes:{19:0}}});
  assert.equal(known.step().phase,'ready');known.step();known.step();assert.equal(known.snapshot().phase,'done');
  assert.equal(known.snapshot().runtime.saveBytes[13],undefined);
});
