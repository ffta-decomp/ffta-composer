// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { decodeBiosLz, decodeMapPreview } from '../src/map-preview.mjs';
import { createSceneSimulation } from '../src/scene-simulator.mjs';
import { openRom, importProject, build } from '../src/project.mjs';
import { openingExample } from '../src/opening.mjs';
import { decodeInstructions } from '../src/rom.mjs';
import { plainTokens, preview } from '../src/text.mjs';

const source = process.env.FFTA_US_ROM;
const open = async () => openRom(await readFile(source));
const example = name => readFile(new URL(`../examples/${name}.json`, import.meta.url), 'utf8').then(JSON.parse);

test('map LZ77 handles literals, overlapping copies and rejects invalid/truncated references', () => {
  assert.deepEqual([...decodeBiosLz(Uint8Array.of(16,6,0,0,0x10,65,66,67,0,2),0)], [65,66,67,65,66,67]);
  assert.deepEqual([...decodeBiosLz(Uint8Array.of(16,5,0,0,0x40,65,0x10,0),0)], [65,65,65,65,65]);
  assert.throws(()=>decodeBiosLz(Uint8Array.of(16,3,0,0,0x80,0,1),0), /reference/);
  assert.throws(()=>decodeBiosLz(Uint8Array.of(16,3,0,0,0),0), /Truncated/);
  assert.throws(()=>decodeBiosLz(Uint8Array.of(16,0,0,2),0), /limits/);
});

test('all 162 native maps decode from the local input, without modifying the ROM', {skip:!source}, async()=>{
  const {rom}=await open();
  const before=rom.bytes.slice();
  for(let id=0;id<162;id++){
    const map=decodeMapPreview(rom,id);
    assert.equal(map.pixels.length,512*512*4);
    assert.ok(map.pixels.some((value,index)=>index%4===3&&value===255),`Map ${id} is empty`);
    assert.ok(map.bounds.x>=0&&map.bounds.y>=0&&map.bounds.width>0&&map.bounds.height>0);
    assert.ok(map.bounds.x+map.bounds.width<=512&&map.bounds.y+map.bounds.height<=512);
  }
  assert.deepEqual(rom.bytes,before);
  // Visually reviewed compositions; map 70 also has an exact native VRAM bank
  // match at 0x820. These guard the previously missed 0x22 relocation.
  for (const [id, expected] of [[0,'f7cd1c673f1d4defe73a9306c1c82510bd3557b696badcebe5a98de7a15be593'],
    [70,'c5d5f541ab9b5d12e40d0b9941327bcd4780e1fa82f02f1a335f21418b8e0c97']]) {
    assert.equal(createHash('sha256').update(decodeMapPreview(rom,id).pixels).digest('hex'),expected);
  }
  const malformed={bytes:rom.bytes.slice()};
  const pointer=0x569104+new DataView(malformed.bytes.buffer).getUint32(0x569104+4,true);
  malformed.bytes[pointer+1]=0;malformed.bytes[pointer+2]=0;malformed.bytes[pointer+3]=0;
  assert.throws(()=>decodeMapPreview(malformed,0),/cycle/);
});

test('native child scripts finish across frame waits before their parent resumes', {skip:!source}, async()=>{
  const {rom,project}=await open();
  // Parent: start kind 7 at +7, wait kind 7, finish.
  // Child: wait 6 frames, finish. No authoring compiler is involved.
  const commands=decodeInstructions(Uint8Array.of(0,7,3,0,3,7,2,0x15,6,2),rom.specs);
  rom.programs=new Map(rom.programs);
  rom.programs.set('0/12',{...rom.programs.get('0/12'),commands});
  project.scenes[234]={script:{group:0,program:12},dialoguePage:1};
  const simulation=createSceneSimulation(rom,project,234,{mapId:0});
  simulation.step();simulation.step();simulation.step();
  assert.equal(simulation.step().phase,'waiting');
  assert.equal(simulation.tick(50).phase,'waiting');
  assert.equal(simulation.tick(50).phase,'ready');
  simulation.step();simulation.step();
  assert.equal(simulation.step().phase,'done');
  assert.deepEqual(simulation.snapshot().trace.map(t=>t.operation),
    ['startSceneScript','waitForSceneScript','waitFrames8','finishSceneTask','finishSceneTask']);
});

test('native menu tokens preserve labels and choice zero alone takes the branch', {skip:!source}, async()=>{
  const {rom,project}=await open();
  const text=s=>plainTokens(s).slice(0,-2);
  const tokens=[...text('Which route?\n'),{kind:'control',code:0x32,args:[16]},
    ...text('A / B'),{kind:'separator'},...text('Second'),{kind:'separator'}];
  rom.pages=new Map(rom.pages);
  rom.pages.set('1',{...rom.pages.get('1'),records:[
    {index:0,tokens,preview:preview(tokens)},
    {index:1,tokens:text('Fallthrough'),preview:'Fallthrough'},
  ]});
  rom.programs=new Map(rom.programs);
  rom.programs.set('0/12',{...rom.programs.get('0/12'),
    commands:decodeInstructions(Uint8Array.of(15,0,15,0,113,4,0,15,1,15,0,2),rom.specs)});
  project.scenes[234]={script:{group:0,program:12},dialoguePage:1};
  for(const result of[0,1,255]){
    const simulation=createSceneSimulation(rom,project,234,{mapId:0});
    const s=simulation.step();assert.equal(s.phase,'choice');
    assert.equal(s.choice.speakerInfo.handle,15);assert.equal(s.choice.speakerInfo.name,'Marche');
    assert.equal(s.choice.prompt,'Which route?');assert.deepEqual(s.choice.labels,['A / B','Second']);
    if(result===255)simulation.cancel();else simulation.choose(result);
    simulation.step();const next=simulation.step();
    assert.equal(next.phase,result===0?'ready':'dialogue');
    if(result!==0)assert.equal(next.dialogue.text,'Fallthrough');
  }
});

test('native flag writes and zero/nonzero branches preserve unrelated flags', {skip:!source}, async()=>{
  const {rom,project}=await open();
  const commands=decodeInstructions(Uint8Array.of(
    0x1a,0x4d,2,0, 0x65,0x4d,2,4,0, 0x1a,0x4e,2,1,
    0x1a,0x4d,2,1, 0x65,0x4d,2,4,0, 0x1a,0x4f,2,1,
    0x1a,0x4d,2,0, 2),rom.specs);
  rom.programs=new Map(rom.programs);
  rom.programs.set('0/12',{...rom.programs.get('0/12'),commands});
  project.scenes[234]={script:{group:0,program:12},dialoguePage:1};
  const simulation=createSceneSimulation(rom,project,234,{mapId:0,flags:{588:true,589:true}});
  for(let i=0;i<15&&simulation.snapshot().phase!=='done';i++)simulation.step();
  assert.equal(simulation.snapshot().phase,'done');
  assert.deepEqual(simulation.snapshot().flags,{588:true,589:false,590:true});
});

test('wide frame waits retain the high byte and delay subsequent state changes', {skip:!source}, async()=>{
  const {rom,project}=await open();
  rom.programs=new Map(rom.programs);
  rom.programs.set('0/12',{...rom.programs.get('0/12'),
    commands:decodeInstructions(Uint8Array.of(0x16,44,1,0x1a,0x4d,2,1,2),rom.specs)});
  project.scenes[234]={script:{group:0,program:12},dialoguePage:1};
  const simulation=createSceneSimulation(rom,project,234,{mapId:0});
  simulation.step();assert.equal(simulation.step().wait,5000);
  simulation.tick(4999);assert.equal(simulation.snapshot().phase,'waiting');
  assert.equal(simulation.snapshot().flags[589],undefined);
  simulation.tick(1);simulation.step();assert.equal(simulation.snapshot().flags[589],true);
});

test('cancelling child scripts lets the parent continue without delayed child writes', {skip:!source}, async()=>{
  const {rom,project}=await open();
  rom.programs=new Map(rom.programs);
  rom.programs.set('0/12',{...rom.programs.get('0/12'),commands:decodeInstructions(
    Uint8Array.of(0,7,6,0,5,0x1a,0x4d,2,1,2,0x16,208,7,0x1a,0x4e,2,1,2),rom.specs)});
  project.scenes[234]={script:{group:0,program:12},dialoguePage:1};
  const simulation=createSceneSimulation(rom,project,234,{mapId:0});
  for(let i=0;i<10&&simulation.snapshot().phase!=='done';i++)simulation.step();
  simulation.tick(60000);
  assert.equal(simulation.snapshot().phase,'done');
  assert.equal(simulation.snapshot().flags[589],true);
  assert.equal(simulation.snapshot().flags[590],undefined);
});

test('the authored opening moves and turns actors, then stops before combat', {skip:!source}, async()=>{
  const {rom,project}=await open();
  project.openings['first-act']=openingExample();
  const before=JSON.stringify(project);
  const simulation=createSceneSimulation(rom,project,1);
  assert.equal(simulation.snapshot().mapId,0);
  assert.equal(simulation.step().phase,'dialogue');
  simulation.confirm();
  assert.equal(simulation.step().phase,'motion');
  let actor=simulation.tick(300).actors.find(a=>a.id===15);
  assert.equal(actor.x,3.5);assert.equal(actor.y,4.5);
  actor=simulation.tick(300).actors.find(a=>a.id===15);
  assert.deepEqual([actor.x,actor.y],[4,4]);
  assert.equal(simulation.step().actors.find(a=>a.id===15).facing,3);
  assert.match(simulation.step().dialogue.text,/Goblin patrol/);
  simulation.confirm();
  const boundary=simulation.step();assert.equal(boundary.phase,'battle');
  assert.deepEqual(simulation.step(),boundary);
  assert.equal(JSON.stringify(project),before);
});

test('nested dialogue choices replay all four routes, cancellation and the original anchor without combat', {skip:!source}, async()=>{
  const {rom,project:empty}=await open();
  const project=importProject(rom,empty,await example('herb-ward'));
  const before=build(rom,project).bytes;
  for(const [route,label] of [[[0,0],"Scatter"],[[0,1],"Keep"],[[1,0],"Flank"],[[1,1],"Duel"],[[255,255],"Duel"]]){
    const simulation=createSceneSimulation(rom,project,14);let choice=0;const speech=[];
    assert.equal(simulation.snapshot().mapId,70);
    for(let n=0;n<60&&simulation.snapshot().phase!=='done';n++){
      const s=simulation.snapshot();
      if(s.phase==='dialogue'){speech.push(s.dialogue.text);simulation.confirm();}
      else if(s.phase==='choice'){
        const result=route[choice++];
        if(result===255)simulation.cancel();else simulation.choose(result);
      }else simulation.step();
    }
    assert.equal(choice,2);assert.equal(simulation.snapshot().phase,'done');
    assert.ok(speech.some(line=>line.startsWith(`${label} `)));
    assert.equal(simulation.snapshot().skippedBattleSteps,0);
    assert.equal(simulation.snapshot().message,'resume-original');
  }
  assert.deepEqual(build(rom,project).bytes,before);
});

test('flag inputs select different fragment branches and snapshots cannot mutate the session', {skip:!source}, async()=>{
  const {rom,project:empty}=await open();
  const project=importProject(rom,empty,await example('herb-arrival'));
  const paths=[];
  for(const enabled of [false,true]){
    const simulation=createSceneSimulation(rom,project,14,{flags:{589:enabled}});const spoken=[];
    const snapshot=simulation.snapshot();snapshot.flags[589]=!enabled;
    assert.equal(simulation.snapshot().flags[589],enabled);
    for(let i=0;i<40&&simulation.snapshot().phase!=='done';i++){
      const s=simulation.snapshot();if(s.phase==='dialogue'){spoken.push(s.dialogue.text);simulation.confirm();}else simulation.step();
    }
    assert.equal(simulation.snapshot().phase,'done');paths.push(spoken);
  }
  assert.notDeepEqual(paths[0],paths[1]);
  assert.equal(paths[0].at(-1),paths[1].at(-1));
});

test('native playback pauses on unsupported behavior and bounds loops', {skip:!source}, async()=>{
  const {rom,project}=await open();
  project.scenes[234]={script:{group:0,program:12},dialoguePage:1};
  project.programs['0/12']={instructions:[
    {operation:'selectCurrentSceneEntity',operands:{handle:15}},
    {operation:'finishSceneTask',operands:{}},
  ]};
  let simulation=createSceneSimulation(rom,project,234,{mapId:0});
  assert.equal(simulation.step().phase,'unsupported');
  simulation.skip();simulation.step();assert.equal(simulation.step().phase,'done');
  project.programs['0/12']={instructions:[{operation:'adjustScriptOffset',operands:{delta:-3}}]};
  simulation=createSceneSimulation(rom,project,234,{mapId:0,maxSteps:4});
  for(let i=0;i<5;i++)simulation.step();
  assert.equal(simulation.snapshot().message,'execution-limit');
  assert.throws(()=>simulation.skip(),/Restart/);
});
