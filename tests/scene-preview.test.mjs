// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {build,newProject,openRom,plan} from '../src/project.mjs';
import {decodeInstructions} from '../src/rom.mjs';
import {tavernDemo} from '../src/tavern-demo.mjs';
import {formatProjectText,parseProjectText} from '../src/project-text.mjs';
import {createScenePreview,readScenePreviewContext} from '../src/scene-preview.mjs';

const source=process.env.FFTA_US_ROM,contextPath=process.env.FFTA_PREVIEW_CONTEXT;
test('pub continuation retains original dialogue/actions and changes only the final native exit mode',{skip:!source},async()=>{
  const{rom}=await openRom(await readFile(source)),project=tavernDemo(rom),changes=plan(rom,project);
  assert.deepEqual(parseProjectText(formatProjectText(project,'lua')),project);
  for(const format of ['json','lua']){
    const text=await readFile(new URL(`../examples/tavern-continuation.${format}`,import.meta.url),'utf8');
    assert.deepEqual(parseProjectText(text),project,'Published examples match the editor demo');
  }
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
  assert.deepEqual(decoded.filter(c=>c.operation==='native'&&c.opcode===0x1f).map(c=>c.operands[0]),[2,77,79,128,129,130,53,4]);
  const seated=decoded.find(c=>c.operation==='native'&&c.opcode===0x1f&&c.operands[0]===2);
  assert.deepEqual(compiled.slice(seated.offset,seated.offset+23),rom.bytes.slice(original.offset+4,original.offset+27),
    'Read-only actor setup retains the original offset, pose and state, and stops before the next actor');
  assert.equal(decoded.filter(c=>c.operation==='say').length,4);
  assert.equal(decoded.filter(c=>c.operation==='waitFrames16').length,3);
  const legacy=structuredClone(project);
  legacy.programs[Object.keys(project.programs)[0]].instructions=next.instructions.map(c=>c.operation==='waitFrames16'
    ?{operation:'native',opcode:0x16,operands:[c.operands.frames&255,c.operands.frames>>>8]}:c);
  const key=Object.keys(project.programs)[0];
  assert.deepEqual(plan(rom,legacy).programs.get(key).bytes,compiled,'Existing raw 0x16 projects encode identically');
  const reference=next.instructions.find(c=>c.operation==='borrowSceneActor');
  reference.operands.actor=254;assert.throws(()=>plan(rom,project),/requires one unchanged/);
  reference.operands.actor=2;reference.operands.setup='arbitrary';assert.throws(()=>plan(rom,project),/setup must be initial/);
  reference.operands.setup='initial';reference.operands.extra=1;assert.throws(()=>plan(rom,project),/Unknown actor reference field/);
  assert.ok(build(rom,tavernDemo(rom)).bytes.length>rom.bytes.length);
});

test('native53 fades out, native239 preserves residents while the story pair performs and ends black',{skip:!source||!contextPath},async()=>{
  const{rom}=await openRom(await readFile(source)),context=await readScenePreviewContext(await readFile(contextPath,'utf8'));
  const project=tavernDemo(rom),g=await createScenePreview(rom,project,53,context);
  let originalSeen=false,transitionBlack=false,marcheSeatedWithResidents=false,moving=false,ritzLeft=false;
  const cameras=new Set(),spoken=new Set();
  try{
    for(let i=0;i<12000;i++){
      const s=g.snapshot(),lit=g.pixels().some((v,k)=>k%4!==3&&v>0);
      if(s.scene===53&&s.phase==='dialogue')originalSeen=true;
      if(originalSeen&&s.frame>6000&&!lit)transitionBlack=true;
      if(s.scene===239){
        const visible=s.actors.filter(a=>!a.hidden&&[2,4].includes(a.id));assert.ok(s.actors.every(a=>[1,2,4,53,77,79].includes(a.id)));
        if(s.actors.some(a=>a.id===4)){
          const residents=s.actors.filter(a=>a.id===1);
          assert.equal(residents.length,3,'All three ambient patrons remain throughout the added act');
          assert.ok(residents.every(a=>!a.hidden));
          const bartender=s.actors.find(a=>a.id===53);
          assert.ok(bartender&&!bartender.hidden&&bartender.x===2&&bartender.y===3&&bartender.facing===0,
            'The distinct permanent bartender remains behind the counter');
        }
        assert.ok(s.actors.filter(a=>a.kind==='prop').every(a=>[77,79].includes(a.id)));
        const marche=s.actors.find(a=>a.id===2),ritz=s.actors.find(a=>a.id===4);
        if(lit&&visible.length===1&&marche?.x===12&&marche.y===3)marcheSeatedWithResidents=true;
        if(marche&&marche.worldX!==marche.x*32+16)moving=true;
        if(s.phase==='dialogue'){spoken.add(s.pc);if(ritz?.hidden)ritzLeft=true;}
        if(lit)cameras.add(`${s.camera.x},${s.camera.y}`);
      }
      if(s.phase==='done')break;g.step(i%180<2?1:0);
    }
    assert.equal(g.snapshot().phase,'done');assert.equal(g.snapshot().scene,239);
    assert.ok(originalSeen&&transitionBlack&&marcheSeatedWithResidents&&moving&&ritzLeft);
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


test('pub residents, chair objects and seated corner reproduce the original native initialization',{skip:!source||!contextPath},async()=>{
  const{rom}=await openRom(await readFile(source)),context=await readScenePreviewContext(await readFile(contextPath,'utf8'));
  const original=newProject(rom);
  original.programs['17/0']={instructions:rom.programs.get('17/0').commands.map(({offset,...c})=>{
    if(c.operation==='moveSceneCamera')return {...c,operands:{...c.operands,x:203,y:270}};
    // Hold the original opening before its first dialogue; keep the original initialization.
    if(offset===141)return {...c,operands:{value:250}};
    return c;
  })};
  const capture=async(project,id,frames)=>{const g=await createScenePreview(rom,project,id,context);try{
    for(let i=0;i<frames;i++)g.step(0);
    const pixels=g.pixels(),corner=new Uint8Array(55*76*4);
    for(let y=35;y<111;y++)corner.set(pixels.subarray((y*240+170)*4,(y*240+225)*4),(y-35)*55*4);
    return {corner,actors:g.snapshot().actors.filter(a=>[1,2,77,79].includes(a.id)),
      staff:g.snapshot().actors.filter(a=>a.id===53)};
  }finally{g.destroy();}};
  const baseline=await capture(original,53,200),current=await capture(tavernDemo(rom),239,320);
  assert.deepEqual(current.actors,baseline.actors,'Residents, furniture, facing and seated world coordinates match retail');
  assert.deepEqual(current.corner,baseline.corner,'Chair backs and seated Marche match the retail corner pixel for pixel');
  const sharedPub=await capture(newProject(rom),134,200);
  assert.deepEqual(current.staff,sharedPub.staff,'Permanent bartender retains the shared pub position and native offsets');
  assert.equal(current.staff.length,1);
});
