// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openRom,build} from '../src/project.mjs';
import {createSceneSimulation} from '../src/scene-simulator.mjs';
import {decodeInstructions} from '../src/rom.mjs';

const inputs=[process.env.FFTA_US_ROM,process.env.FFTA_CN_ROM,...(process.env.FFTA_CN_UPDATED_ROMS?.split('|')??[])].filter(Boolean);
test('the unmodified first act reaches combat with all dialogue and real name entry, without external acknowledgements',
  {skip:!inputs.length},async()=>{
    for(const input of inputs){
      const bytes=await readFile(input),{rom,project}=await openRom(bytes),before=JSON.stringify(project);
      const sim=createSceneSimulation(rom,project,1),dialogue=[],stages=new Set();let names=0;
      for(let i=0;i<1500;i++){
        const s=sim.snapshot();stages.add(s.phase);
        assert.ok(!['external','unsupported'].includes(s.phase),`${input}: ${JSON.stringify(s.external??s.message)}`);
        if(s.phase==='battle')break;
        if(s.phase==='dialogue'){dialogue.push(s.dialogue);sim.confirm();}
        else if(s.phase==='input'){
          assert.equal(s.input.kind,'name');assert.throws(()=>sim.confirmName(''),/name/);
          assert.throws(()=>sim.confirmName('123456789'),/name/);sim.confirmName('Luso');names++;
        }else sim.step();
      }
      const s=sim.snapshot();assert.equal(s.phase,'battle');assert.equal(names,1);assert.equal(dialogue.length,16);
      assert.equal(s.runtime.contentIndex,30);assert.equal(s.runtime.population.count,9);
      assert.equal(s.runtime.units[16].states[45],1);
      assert.ok(stages.has('height'));assert.ok(stages.has('motion'));assert.ok(stages.has('camera'));
      assert.ok(dialogue.some(d=>d.text.includes('Luso')));
      assert.equal(s.actors.find(a=>a.id===15).name,'Luso');
      assert.equal(s.actors.find(a=>a.id===23).visible,true);
      assert.deepEqual(Object.keys(s.runtime.paths).sort(),['0','1','15','2']);
      assert.equal(s.trace.filter(t=>t.operation==='external-resolution').length,0);
      assert.equal(JSON.stringify(project),before);assert.deepEqual(build(rom,project).bytes,Uint8Array.from(bytes));
    }
  });

test('actor height actions interpolate signed deltas and finish at their starting height',{skip:!process.env.FFTA_US_ROM},async()=>{
  const {rom,project}=await openRom(await readFile(process.env.FFTA_US_ROM));
  rom.programs=new Map(rom.programs);
  rom.programs.set('0/12',{...rom.programs.get('0/12'),commands:decodeInstructions(
    Uint8Array.of(0x38,26,4,0,1,2,0,0x38,26,252,255,1,4,0,2),rom.specs)});
  project.scenes[234]={script:{group:0,program:12},dialoguePage:1};
  const sim=createSceneSimulation(rom,project,234,{mapId:0});
  assert.equal(sim.step().phase,'height');sim.tick(1000/60);
  assert.equal(sim.snapshot().actors[0].height,2);sim.tick(1000/60);
  assert.equal(sim.snapshot().actors[0].height,4);sim.step();sim.step();
  assert.equal(sim.snapshot().actors[0].height,0);
});
