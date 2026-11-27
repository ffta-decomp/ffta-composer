// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {openRom,build,plan} from '../src/project.mjs';
import {createSceneSimulation} from '../src/scene-simulator.mjs';
import {describeStory} from '../src/story.mjs';
import {describeSceneActor,sceneActorKind} from '../src/scene-actors.mjs';
import {decodeActorPreview} from '../src/actor-preview.mjs';
import {detectTextEncoding} from '../src/text-encoding.mjs';
import {put32} from '../src/binary.mjs';
import {decodeInstructions} from '../src/rom.mjs';

const source=process.env.FFTA_US_ROM;
test('shop menu encoding follows relocated banks and prepended entries; ambiguous data is explicit',()=>{
  const b=new Uint8Array(0x10000),bank=0xa000;
  put32(b,0x9028,0x08000000+bank);
  const pair=(index,buy,sell)=>{
    const at=0xc000+index*16;
    put32(b,bank+index*4,0x08000000+at);b.set(buy,at);
    put32(b,bank+(index+1)*4,0x08000000+at+8);b.set(sell,at+8);
  };
  pair(56,[0x84,0x40,0x87,0xd4,0],[0x87,0xd5,0x81,0x3f,0]);
  assert.equal(detectTextEncoding(b).kind,'us-cn');
  assert.equal(detectTextEncoding(b).matches[0].buy,56);
  pair(100,[1,0xb2,0xdf,0xe3,0],[1,0xc3,0xcf,0xd6,0xd6,0]);
  assert.equal(detectTextEncoding(b).kind,'conflict');
  put32(b,bank+56*4,0xffffffff);assert.equal(detectTextEncoding(b).kind,'us');
  put32(b,bank+100*4,0xffffffff);assert.equal(detectTextEncoding(b).kind,'unknown');
  assert.equal(detectTextEncoding(new Uint8Array(2)).kind,'unknown');
  put32(b,0x9028,0xffffffff);assert.equal(detectTextEncoding(b).kind,'unknown');
});

test('unresolved speaker handles remain identifiable without inventing names',()=>{
  assert.equal(describeSceneActor(15,1).name,'Marche');
  assert.equal(describeSceneActor(24,1).name,null);
  assert.equal(describeSceneActor(128,234).name,null);
  assert.equal(describeSceneActor(128,14).name,'Red Cap');
  assert.equal(sceneActorKind(77,63),'prop');
  assert.equal(sceneActorKind(79,63),'prop');
  assert.equal(sceneActorKind(53,63),'character');
  assert.equal(sceneActorKind(77,0),'character');
});

test('story lines, inserted lines, native menus and playback retain their speaker association',{skip:!source},async()=>{
  const {rom,project}=await openRom(await readFile(source));
  const story=describeStory(rom,plan(rom,project),1);
  assert.equal(story.steps.find(s=>s.kind==='dialogue').speaker.handle,24);
  project.scenes[234]={script:{group:0,program:12},dialoguePage:1};
  project.programs['0/12']={instructions:[
    {operation:'placeSceneActor',operands:{actor:15,tile:0x53,facing:0,visibility:1}},
    {operation:'say',operands:{textSelector:12,speakerHandle:15,presentationFlags:128}},
    {operation:'finishSceneTask',operands:{}},
  ],insertDialogue:[{anchorOffset:5,textSelector:2,speakerHandle:16,presentationFlags:128}]};
  const inserted=describeStory(rom,plan(rom,project),234).steps.filter(s=>s.kind==='dialogue');
  assert.deepEqual(inserted.map(s=>s.speaker.handle),[16,15]);
  // The playback compiler includes inserted instructions as real commands.
  const sim=createSceneSimulation(rom,project,234,{mapId:0});sim.step();
  let s;for(let i=0;i<10;i++){s=sim.step();if(s.phase==='dialogue')break;}
  assert.equal(s.dialogue.speakerInfo.handle,16);assert.equal(s.dialogue.actorId,null);
  sim.confirm();s=sim.step();assert.equal(s.dialogue.speakerInfo.name,'Marche');assert.equal(s.dialogue.actorId,15);
});

test('camera jumps, signed targets, timed pans and actor targets change view state',{skip:!source},async()=>{
  const {rom,project}=await openRom(await readFile(source));
  project.scenes[234]={script:{group:0,program:12},dialoguePage:1};
  // 46 remains opaque for authoring. Supply a native command fixture without
  // weakening the compiler's original-layout protections.
  rom.programs=new Map(rom.programs);
  rom.programs.set('0/12',{...rom.programs.get('0/12'),commands:decodeInstructions(Uint8Array.of(
    0x47,0xe9,0xff,100,0,1,0,0x47,77,0,200,0,1,60,
    0x20,15,0x53,0,1,0x46,15,0,2,0x47,0,0,0,0,3,1,2),rom.specs)});
  const before=JSON.stringify(project),sim=createSceneSimulation(rom,project,234,{mapId:0});
  assert.deepEqual(sim.step().camera,{x:97,y:180,targetActor:null});
  assert.equal(sim.step().phase,'camera');
  assert.equal(sim.tick(500).camera.x,147);assert.equal(sim.snapshot().camera.y,230);
  assert.equal(sim.tick(500).phase,'ready');sim.step();assert.equal(sim.step().phase,'camera');
  let s=sim.step();assert.deepEqual(s.camera,{x:224,y:308,targetActor:15});
  s=sim.step();assert.equal(s.phase,'external');assert.equal(s.external.kind,'camera-task');
  assert.equal(JSON.stringify(project),before);
});

test('indexed character poses decode bounded OAM and palette data without modifying the ROM',{skip:!source},async()=>{
  const bytes=await readFile(source),rom={bytes},before=createHash('sha256').update(bytes).digest('hex');
  for(const id of[2,8,15,16,17,23,24,25,26,56,76,28,77])for(let facing=0;facing<4;facing++) {
    const pose=decodeActorPreview(rom,id,{facing});
    assert.equal(pose.pixels.length,pose.width*pose.height*4);
    assert.ok(pose.pixels.some((n,i)=>i%4===3&&n===255));
    assert.equal(pose.mirror,facing>=2);
  }
  assert.equal(createHash('sha256').update(bytes).digest('hex'),before);
  assert.throws(()=>decodeActorPreview(rom,128),/Indexed unit/);
  const bad={bytes:Uint8Array.from(bytes)};put32(bad.bytes,0x390e44+44*4,0xffffffff);
  assert.throws(()=>decodeActorPreview(bad,15),/Truncated/);
});

test('updated Chinese inputs load through shop encoding and preserve no-op and edited reopen bytes',
  {skip:!process.env.FFTA_CN_UPDATED_ROMS},async()=>{
    for(const path of process.env.FFTA_CN_UPDATED_ROMS.split('|')) {
      const bytes=await readFile(path),{rom,project}=await openRom(bytes);
      assert.equal(rom.encodingEvidence.kind,'us-cn');assert.equal(project.characterTable.entries.length,3175);
      assert.deepEqual(build(rom,project).bytes,Uint8Array.from(bytes));
      project.dialogue['1:0']={text:'你好',flags:16};
      const candidate=build(rom,project).bytes,reopened=await openRom(candidate);
      assert.deepEqual(build(reopened.rom,reopened.project).bytes,candidate);
    }
  });
