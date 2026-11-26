// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
// Local-only bounded preview sweep. Explicit resolutions are synthetic fixtures,
// never evidence of native gameplay, save-dependent predicates, or UI outcomes.
import {readFile,writeFile} from 'node:fs/promises';
import {openRom} from '../src/project.mjs';
import {createSceneSimulation,SIMULATION_INSTRUCTIONS} from '../src/scene-simulator.mjs';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw new Error('Usage: node tools/audit-simulation.mjs ROM OUTPUT.json');
const {rom,project}=await openRom(await readFile(input));
const report={sha256:rom.sha256,limit:500,fixtures:[],instructions:SIMULATION_INSTRUCTIONS,
  evidence:'Synthetic JS sweeps, both unknown-condition outcomes. Not native-engine acceptance.'};
for(const [key,program] of rom.programs){
  if(!program.commands.length)continue;
  const scene=rom.scenes.find(s=>s.id>0&&`${s.script?.group}/${s.script?.program}`===key);
  if(!scene)continue;
  for(const condition of[false,true]) {
    const sim=createSceneSimulation(rom,project,scene.id,{mapId:0,maxSteps:500});
    let external=0,dialogue=0,iterations=0;
    for(;iterations<750;iterations++){
      const s=sim.snapshot();if(['done','battle','unsupported'].includes(s.phase))break;
      if(s.phase==='external'){external++;sim.resolveExternal(s.external.kind==='condition'?{branch:condition}:{complete:true});}
      else if(s.phase==='dialogue'){dialogue++;sim.confirm();}
      else if(s.phase==='input')sim.confirmName(s.input.value);
      else if(s.phase==='choice')sim.choose(condition?0:1);
      else sim.step();
    }
    const s=sim.snapshot();report.fixtures.push({program:key,scene:scene.id,condition,iterations,phase:s.phase,
      reason:s.message,external,dialogue,coverage:s.coverage});
  }
}
await writeFile(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({fixtures:report.fixtures.length,phases:report.fixtures.reduce((a,s)=>(a[s.phase]=(a[s.phase]??0)+1,a),{}),
  instructionsExecuted:new Set(report.fixtures.flatMap(s=>Object.keys(s.coverage))).size}));
