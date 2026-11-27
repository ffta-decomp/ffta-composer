// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
// A bounded scene-2 experiment, not a general scene launcher or editor feature.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {deflateSync} from 'node:zlib';
import {createNativeGame,NATIVE_CORE} from '../src/native-game.mjs';
import {openRom,build,plan} from '../src/project.mjs';
import {decodeInstructions} from '../src/rom.mjs';
import {PROFILE} from '../src/profile.mjs';

const [mode,romPath,fixturePath,output]=process.argv.slice(2);
assert.ok(['prepare','verify'].includes(mode)&&romPath&&fixturePath&&output,
  'Usage: node tools/probe-scene-entry.mjs prepare ROM INPUT.json OUT | verify ROM CHECKPOINT_DIR OUT');
const repository=await realpath(fileURLToPath(new URL('../',import.meta.url)));
const out=resolve(output);await mkdir(out,{recursive:true});
const distance=relative(repository,await realpath(out));
assert.ok(distance&&((distance.startsWith('..'+(process.platform==='win32'?'\\':'/')))||isAbsolute(distance)),
  'Game evidence must stay outside the repository');
const bytes=await readFile(romPath),hash=data=>createHash('sha256').update(data).digest('hex');
assert.equal(hash(bytes),PROFILE.sha256,'This minimal prototype only supports the pinned US retail input');
const saveJSON=(name,value)=>writeFile(`${out}/${name}.json`,JSON.stringify(value,null,2)+'\n');
function entry(game){return {scene:game.read16(0x02002192),root:game.read32(0x020159cc),
  active:game.read8(0x0200f391),pending:game.read8(0x0200219c),next:game.read16(0x02002194)};}
function assertEntry(game){assert.deepEqual(entry(game),{scene:2,root:0,active:0,pending:1,next:2},
  'Not the verified pre-load boundary: a running scene/state cannot be reused');}

// Local framebuffer encoding; no game pixels are part of this source file.
function crc32(data){let n=-1;for(const b of data){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^-1)>>>0;}
function chunk(name,data){const tag=Buffer.from(name),head=Buffer.alloc(4),tail=Buffer.alloc(4);
  head.writeUInt32BE(data.length);tail.writeUInt32BE(crc32(Buffer.concat([tag,data])));return Buffer.concat([head,tag,data,tail]);}
function png(pixels){const head=Buffer.alloc(13);head.writeUInt32BE(240);head.writeUInt32BE(160,4);head[8]=8;head[9]=6;
  const rows=Buffer.alloc(160*961);for(let y=0;y<160;y++)rows.set(pixels.subarray(y*960,y*960+960),y*961+1);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);}

if(mode==='prepare'){
  const inputs=JSON.parse(await readFile(fixturePath,'utf8'));
  assert.ok(Array.isArray(inputs));let total=0;
  for(const row of inputs){assert.ok(Number.isInteger(row.frames)&&row.frames>=0&&row.frames<=100000);
    assert.ok(Number.isInteger(row.keys)&&row.keys>=0&&row.keys<=1023);total+=row.frames;}
  assert.ok(total<=100000,'Preparation is bounded to 100,000 native frames');
  const game=await createNativeGame(bytes),started=performance.now();let found=false;
  try{
    outer:for(const row of inputs)for(let n=0;n<row.frames;n++){
      const previous=entry(game);game.frame(row.keys);const current=entry(game);
      if(previous.scene!==2&&current.scene===2){assertEntry(game);found=true;break outer;}
    }
    assert.ok(found,'The supplied native keys did not reach the scene-2 pre-load boundary');
    const state=game.saveState(),save=game.battery();
    await writeFile(`${out}/checkpoint.state`,state);await writeFile(`${out}/checkpoint.sav`,save);
    const manifest={format:'ffta.scene-entry-probe/v1',scope:'scene-2-after-snowball',baseSha256:hash(bytes),
      coreSha256:NATIVE_CORE.sha256,stateSha256:hash(state),saveSha256:hash(save),inputsSha256:hash(await readFile(fixturePath)),
      frame:game.snapshot().frame,entry:entry(game),preparationMs:performance.now()-started};
    await saveJSON('manifest',manifest);console.log(JSON.stringify(manifest));
  }finally{game.destroy();}
}else{
  const manifest=JSON.parse(await readFile(resolve(fixturePath,'manifest.json'),'utf8'));
  assert.equal(manifest.format,'ffta.scene-entry-probe/v1');assert.equal(manifest.scope,'scene-2-after-snowball');
  assert.equal(manifest.baseSha256,hash(bytes));assert.equal(manifest.coreSha256,NATIVE_CORE.sha256);
  const state=await readFile(resolve(fixturePath,'checkpoint.state')),save=await readFile(resolve(fixturePath,'checkpoint.sav'));
  assert.equal(hash(state),manifest.stateSha256);assert.equal(hash(save),manifest.saveSha256);
  const {rom}=await openRom(bytes),results=[];let baselineState,baselinePixels;
  for(const [name,text]of[['baseline',null],['edit-a','SCENE TWO EDIT A'],['edit-b','SCENE TWO EDIT B\nSECOND REVISION']]){
    const {project}=await openRom(bytes);
    if(text)project.storyEdits={'entry-probe':{title:'Scene entry probe',trigger:{scene:2,beforeDialogue:15},
      ...(name==='edit-b'?{flags:{'cleared-at-entry':2}}:{}),
      steps:name==='edit-b'?[{type:'if',flag:'cleared-at-entry',
        then:[{type:'say',text:'UNEXPECTED BRANCH'}],else:[{type:'say',text}]}]:[{type:'say',text}],resume:'original'}};
    const changes=plan(rom,project),candidate=build(rom,project),scene=changes.scenes.get(2)??rom.scenes[2];
    const key=`${scene.script.group}/${scene.script.program}`,allocation=candidate.allocations.find(a=>a.kind==='program'&&a.target===key);
    const program=changes.programs.get(key),scriptBase=PROFILE.bus+(allocation?.offset??rom.programs.get(key).offset);
    const commands=program?decodeInstructions(program.bytes,rom.specs):rom.programs.get(key).commands;
    // Scene 2 clears native flag 2 before the insertion point. Revision B adds
    // a real native conditional; its else line is allocated after the then line.
    const markerSelector=rom.pages.get('1').records.length+(name==='edit-b'?1:0);
    const marker=commands.find(c=>c.operation==='say'&&c.operands.textSelector===markerSelector);
    if(text){assert.ok(marker);assert.ok(scriptBase>=0x09000000,'The script must actually be relocated');}
    const started=performance.now(),game=await createNativeGame(candidate.bytes,{save});let context,firstMarkerFrame=null,rootTask;
    try{
      game.loadState(state);assertEntry(game);const initialFrame=game.snapshot().frame;
      const trace=[];
      for(let frame=1;frame<=480;frame++){
        game.frame(0);rootTask=game.read32(game.read32(0x020159cc)+8);
        if(context===undefined){for(let p=0x0200000c;p<0x02040000;p+=4){
          if(game.read32(p)===scriptBase&&game.read32(p-4)===rootTask){context=p-12;break;}
        }}
        if(context!==undefined){
          assert.equal(game.read32(context+12),scriptBase);assert.equal(game.read32(context+8),rootTask);
          const pc=game.read16(context);if(trace.at(-1)?.pc!==pc)trace.push({frame,pc});
          if(marker&&pc===marker.offset+4&&firstMarkerFrame===null)firstMarkerFrame=frame;
        }
      }
      assert.ok(context!==undefined,'The native task must own the compiled script context');
      if(text)assert.ok(firstMarkerFrame!==null,'The native VM must reach the added say instruction');
      const pixels=Uint8Array.from(game.pixels());
      if(!text){baselineState=game.saveState();baselinePixels=hash(pixels);}
      else assert.notEqual(hash(pixels),baselinePixels);
      await writeFile(`${out}/${name}.png`,png(pixels));
      await writeFile(`${out}/${name}.state`,game.saveState());await writeFile(`${out}/${name}.sav`,game.battery());
      if(text){await writeFile(`${out}/${name}.gba`,candidate.bytes);await saveJSON(`${name}.project`,project);}
      results.push({name,text,romSha256:hash(candidate.bytes),scriptBase,context,rootTask,
        firstMarkerFrame,advancedFrames:game.snapshot().frame-initialFrame,elapsedMs:performance.now()-started,
        framebufferSha256:hash(pixels),trace});
    }finally{game.destroy();}
  }
  assert.notEqual(results[1].romSha256,results[2].romSha256);
  assert.notEqual(results[1].framebufferSha256,results[2].framebufferSha256);
  // Negative control: a running original scene is rejected, even though mGBA
  // accepts its state under an edited ROM. It retains the original script base.
  const editedBytes=await readFile(`${out}/edit-b.gba`),unsafe=await createNativeGame(editedBytes,{save});
  let negative;
  try{
    unsafe.loadState(baselineState);assert.throws(()=>assertEntry(unsafe),/pre-load boundary/);
    const context=results[0].context,retainedBase=unsafe.read32(context+12);
    assert.equal(retainedBase,results[0].scriptBase);assert.notEqual(retainedBase,results[2].scriptBase);
    negative={rejected:true,retainedBase,expectedEditedBase:results[2].scriptBase};
  }finally{unsafe.destroy();}
  const report={passed:true,scope:manifest.scope,baseSha256:hash(bytes),core:NATIVE_CORE,checkpoint:manifest,
    results,negative,manualGameMemoryWrites:0,fullGameReplayDuringVerification:false,
    limitations:['One verified scene/context on pinned US retail','No editor integration','No browser pixel/audio acceptance','No generic scene-ID launcher']};
  await saveJSON('report',report);console.log(JSON.stringify(report));
}
