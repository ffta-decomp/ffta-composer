// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {build,openRom,plan} from '../src/project.mjs';
import {decodeInstructions} from '../src/rom.mjs';
import {tavernDemo} from '../src/tavern-demo.mjs';
import {formatProjectText,parseProjectText} from '../src/project-text.mjs';
import {createScenePreview,readScenePreviewContext} from '../src/scene-preview.mjs';

const source=process.env.FFTA_US_ROM,contextPath=process.env.FFTA_PREVIEW_CONTEXT;
test('pub continuation retains original dialogue/actions and changes only the final native exit mode',{skip:!source},async()=>{
  const{rom}=await openRom(await readFile(source)),project=tavernDemo(rom),changes=plan(rom,project);
  assert.deepEqual(parseProjectText(formatProjectText(project,'lua')),project);
  const original=rom.programs.get('17/0'),scene=changes.scenes.get(53);
  const bytes=changes.programs.get(`${scene.script.group}/${scene.script.program}`).bytes;
  // Only the last dialogue's trampoline and final exit mode differ in the native body.
  for(let i=0;i<original.end-original.offset;i++){
    if(i>=546&&i<550||i===640)continue;
    assert.equal(bytes[i],rom.bytes[original.offset+i],`Native byte ${i}`);
  }
  assert.equal(bytes[640],2,'Use the original chained-scene lifecycle, rather than return to the world map');
  const next=project.programs[Object.keys(project.programs)[0]],compiled=changes.programs.get(Object.keys(project.programs)[0]).bytes;
  const decoded=decodeInstructions(compiled,rom.specs);
  assert.deepEqual(decoded.filter(c=>c.operation==='native'&&c.opcode===0x1f).map(c=>c.operands[0]),[2,4]);
  assert.equal(decoded.filter(c=>c.operation==='say').length,4);
  assert.equal(decoded.filter(c=>c.operation==='waitFrames16').length,3);
  const legacy=structuredClone(project);
  legacy.programs[Object.keys(project.programs)[0]].instructions=next.instructions.map(c=>c.operation==='waitFrames16'
    ?{operation:'native',opcode:0x16,operands:[c.operands.frames&255,c.operands.frames>>>8]}:c);
  const key=Object.keys(project.programs)[0];
  assert.deepEqual(plan(rom,legacy).programs.get(key).bytes,compiled,'Existing raw 0x16 projects encode identically');
  const reference=next.instructions.find(c=>c.operation==='borrowSceneActor');
  reference.operands.actor=254;assert.throws(()=>plan(rom,project),/requires one unchanged/);
  reference.operands.actor=2;reference.operands.extra=1;assert.throws(()=>plan(rom,project),/Unknown actor reference field/);
  assert.ok(build(rom,tavernDemo(rom)).bytes.length>rom.bytes.length);
});

test('native53 fades out, native239 fades in alone, runs the two actors and ends black',{skip:!source||!contextPath},async()=>{
  const{rom}=await openRom(await readFile(source)),context=await readScenePreviewContext(await readFile(contextPath,'utf8'));
  const project=tavernDemo(rom),g=await createScenePreview(rom,project,53,context);
  let originalSeen=false,transitionBlack=false,alone=false,moving=false,ritzLeft=false;
  const cameras=new Set(),spoken=new Set();
  try{
    for(let i=0;i<12000;i++){
      const s=g.snapshot(),lit=g.pixels().some((v,k)=>k%4!==3&&v>0);
      if(s.scene===53&&s.phase==='dialogue')originalSeen=true;
      if(originalSeen&&s.frame>6000&&!lit)transitionBlack=true;
      if(s.scene===239){
        const visible=s.actors.filter(a=>!a.hidden);assert.ok(s.actors.every(a=>[2,4].includes(a.id)));
        const marche=s.actors.find(a=>a.id===2),ritz=s.actors.find(a=>a.id===4);
        if(lit&&visible.length===1&&marche?.x===12&&marche.y===3)alone=true;
        if(marche&&marche.worldX!==marche.x*32+16)moving=true;
        if(s.phase==='dialogue'){spoken.add(s.pc);if(ritz?.hidden)ritzLeft=true;}
        if(lit)cameras.add(`${s.camera.x},${s.camera.y}`);
      }
      if(s.phase==='done')break;g.step(i%180<2?1:0);
    }
    assert.equal(g.snapshot().phase,'done');assert.equal(g.snapshot().scene,239);
    assert.ok(originalSeen&&transitionBlack&&alone&&moving&&ritzLeft);
    assert.equal(spoken.size,4);assert.ok(cameras.size>5,'Native camera interpolates');
    assert.ok(g.pixels().every((v,i)=>i%4===3||v===0));
  }finally{g.destroy();}
  // Recompile changed text from the same checkpoint; the actual native dialog pixels must change.
  const dialogueEnd=(()=>{const key=Object.keys(project.programs)[0],bytes=plan(rom,project).programs.get(key).bytes;
    const commands=decodeInstructions(bytes,rom.specs),i=commands.findIndex(c=>c.operation==='say'&&c.operands.textSelector===2);
    return commands[i+1].offset;})();
  const capture=async p=>{const session=await createScenePreview(rom,p,239,context);try{
    for(let i=0;i<4000;i++){const s=session.snapshot();if(s.phase==='dialogue'&&s.pc===dialogueEnd){
      for(let n=0;n<100;n++)session.step(0);return Uint8Array.from(session.pixels());}
      session.step(i%180<2?1:0);
    }throw new Error('Ritz dialogue was not reached');
  }finally{session.destroy();}};
  const baseline=await capture(project);project.dialogue['63:2'].text='I remember you, Marche.';
  assert.notDeepEqual(await capture(project),baseline);
});
