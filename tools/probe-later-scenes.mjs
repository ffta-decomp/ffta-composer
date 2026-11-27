// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
// Local feasibility matrix. It does not add a launcher to the editor.
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

const [mode,romPath,...args]=process.argv.slice(2);
assert.ok(['prepare','verify'].includes(mode),'Modes: prepare ROM SAV KEYS OUT | verify ROM CHECKPOINT OUT');
assert.equal(args.length,mode==='prepare'?3:2);
const out=resolve(args.at(-1));await mkdir(out,{recursive:true});
const repository=await realpath(fileURLToPath(new URL('../',import.meta.url)));
const distance=relative(repository,await realpath(out));
assert.ok(distance&&(isAbsolute(distance)||distance.startsWith('../')||distance.startsWith('..\\')),
  'All game evidence must remain outside the repository');
const bytes=await readFile(romPath),hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(hash(bytes),PROFILE.sha256,'Only pinned US retail is covered by this experiment');
const json=(name,value)=>writeFile(`${out}/${name}.json`,JSON.stringify(value,null,2)+'\n');
function entry(g){return {scene:g.read16(0x02002192),root:g.read32(0x020159cc),active:g.read8(0x0200f391),
  system:g.read8(0x0200f390),count:g.read8(0x0200219c),next:g.read16(0x02002194),content:g.read16(0x02002170)};}
function assertEntry(g){assert.deepEqual(entry(g),{scene:14,root:0,active:0,system:9,count:1,next:14,content:32},
  'Not the naturally reached mission-entry boundary');}
function cpu(g){const s=g.saveState(),v=new DataView(s.buffer,s.byteOffset,s.byteLength);
  return {pc:v.getUint32(0x5c,true),cpsr:v.getUint32(0x60,true)};}
function cpuFault(c){return(c.cpsr&31)===27||![[0,0x4000],[0x02000000,0x02040000],
  [0x03000000,0x03008000],[0x08000000,0x0e000000]].some(([a,b])=>c.pc>=a&&c.pc<b);}
function actors(g){const valid=p=>p>=0x02000000&&p<0x02040000;
  const registry=g.read32(0x0200f4b0);assert.ok(valid(registry),'Missing native actor registry');
  const list=g.read32(registry+16);assert.ok(valid(list));let node=g.read32(list+4);const seen=new Set(),rows=[];
  while(node){assert.ok(valid(node)&&!seen.has(node)&&seen.size<64,'Invalid native actor list');seen.add(node);
    const object=g.read32(node),unit=g.read32(object);assert.ok(valid(object)&&valid(unit));
    rows.push({id:g.read8(unit+4),x:g.read8(unit+246),y:g.read8(unit+247),facing:g.read8(unit+248),
      hidden:Boolean(g.read32(object+48)&1)});node=g.read32(node+8);
  }return rows;
}
function crc32(data){let n=-1;for(const b of data){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^-1)>>>0;}
function chunk(name,data){const tag=Buffer.from(name),a=Buffer.alloc(4),z=Buffer.alloc(4);a.writeUInt32BE(data.length);
  z.writeUInt32BE(crc32(Buffer.concat([tag,data])));return Buffer.concat([a,tag,data,z]);}
function png(p){const h=Buffer.alloc(13);h.writeUInt32BE(240);h.writeUInt32BE(160,4);h[8]=8;h[9]=6;
  const rows=Buffer.alloc(160*961);for(let y=0;y<160;y++)rows.set(p.subarray(y*960,y*960+960),y*961+1);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);}

if(mode==='prepare'){
  const save=await readFile(args[0]),raw=await readFile(args[1],'utf8');
  const inputs=raw.trimStart().startsWith('[')?JSON.parse(raw):raw.trim().split(/\r?\n/).map(line=>{
    const[f,k]=line.trim().split(/\s+/);return{frames:Number(f),keys:parseInt(k,16)};
  });let total=0;
  for(const r of inputs){assert.ok(Number.isInteger(r.frames)&&r.frames>=0&&r.frames<=100000);
    assert.ok(Number.isInteger(r.keys)&&r.keys>=0&&r.keys<=1023);total+=r.frames;}
  assert.ok(total<=100000);const g=await createNativeGame(bytes,{save}),started=performance.now();let found=false;
  try{
    outer:for(const row of inputs)for(let n=0;n<row.frames;n++){
      const previous=entry(g);g.frame(row.keys);
      if(previous.scene!==14&&entry(g).scene===14&&entry(g).root===0){assertEntry(g);found=true;break outer;}
    }
    assert.ok(found,'Native input did not reach the mission-entry boundary');
    const state=g.saveState(),battery=g.battery();
    await writeFile(`${out}/checkpoint.state`,state);await writeFile(`${out}/checkpoint.sav`,battery);
    const manifest={format:'ffta.later-scene-probe/v1',scope:'native-mission-entry',baseSha256:hash(bytes),
      coreSha256:NATIVE_CORE.sha256,stateSha256:hash(state),saveSha256:hash(battery),
      inputSaveSha256:hash(save),keysSha256:hash(Buffer.from(raw)),entry:entry(g),frame:g.snapshot().frame,
      manualMemoryWrites:0,elapsedMs:performance.now()-started};
    await json('manifest',manifest);console.log(JSON.stringify(manifest));
  }finally{g.destroy();}
}else{
  const cp=resolve(args[0]),manifest=JSON.parse(await readFile(`${cp}/manifest.json`,'utf8'));
  const state=await readFile(`${cp}/checkpoint.state`),save=await readFile(`${cp}/checkpoint.sav`);
  assert.equal(manifest.format,'ffta.later-scene-probe/v1');assert.equal(manifest.scope,'native-mission-entry');
  assert.equal(manifest.baseSha256,hash(bytes));assert.equal(manifest.coreSha256,NATIVE_CORE.sha256);
  assert.equal(manifest.stateSha256,hash(state));assert.equal(manifest.saveSha256,hash(save));
  const {rom}=await openRom(bytes),cases=[
    {id:53,label:'After three crystals',map:63,roles:[2,10,77]},
    {id:93,label:'Late palace arrival',map:37,roles:[2,9,22],dispatch:true},
    {id:98,label:'Final confrontation',map:38,roles:[2,14,22]},
    {id:101,label:'Ending transition',map:101,roles:[4,12]},
  ];
  async function run(spec,version,negative=false){
    const {id}=spec,name=`scene-${id}-${negative?'wrong-context':version}`;
    const {project}=await openRom(bytes),original=rom.scenes[id],source=rom.programs.get(`${original.script.group}/${original.script.program}`);
    const anchor=source.commands.find(c=>c.operation==='say');assert.ok(anchor);
    // Scene 93's original script uses map 0 and expects encounter content to
    // have been selected by its caller. Execute the existing native selector,
    // queue, and termination instructions in a test-only bootstrap for scene 14.
    if(spec.dispatch&&!negative){
      assert.equal(rom.programs.get('0/2').commands.length,0);
      project.programs['0/2']={instructions:[{operation:'selectSceneEncounter',operands:{encounter:id}},
        {operation:'queueScene',operands:{scene:id}},{operation:'setSceneRuntimeMode',operands:{mode:1}}]};
      project.scenes[14]={script:{group:0,program:2},dialoguePage:1};
    }
    const prefix=`SCENE ${id} EDIT ${version.toUpperCase()}`;
    if(version!=='baseline')project.storyEdits={'entry-probe':{title:`Scene ${id} entry probe`,
      trigger:{scene:id,beforeDialogue:anchor.operands.textSelector},resume:'original',flags:{'entry-flag':2},
      steps:version==='a'?[{type:'say',text:prefix}]:[{type:'if',flag:'entry-flag',
        then:[{type:'say',text:prefix+'\nFLAG ON'}],else:[{type:'say',text:prefix+'\nFLAG OFF'}]}]}};
    const changes=plan(rom,project),candidate=build(rom,project),scene=changes.scenes.get(id)??original;
    const key=`${scene.script.group}/${scene.script.program}`,allocation=candidate.allocations.find(a=>a.kind==='program'&&a.target===key);
    const program=changes.programs.get(key),base=PROFILE.bus+(allocation?.offset??source.offset);
    const commands=program?decodeInstructions(program.bytes,rom.specs):source.commands;
    const firstNew=rom.pages.get(String(original.dialoguePage)).records.length;
    const markers=version==='baseline'?[{pc:anchor.offset+4}]:[0,...(version==='b'?[1]:[])].map(i=>{
      const c=commands.find(c=>c.operation==='say'&&c.operands.textSelector===firstNew+i);assert.ok(c);
      return{pc:c.offset+4,...(version==='b'?{flag:i===0}:{})};
    });
    if(version!=='baseline')assert.ok(base>=0x09000000);
    const started=performance.now(),g=await createNativeGame(candidate.bytes,{save});let context,task,firstFrame=null,fault=null,branch;
    const writes=[],trace=[];
    try{
      g.loadState(state);assertEntry(g);
      if(!spec.dispatch||negative){for(const address of[0x02002192,0x02002194]){
        writes.push({address,before:g.read16(address),after:id,width:16});g.write16(address,id);
      }}
      const initial=g.snapshot().frame;let elapsed=0;
      for(let frame=1;frame<=2400;frame++){
        g.frame(0);elapsed=frame;
        if(frame%8===0){const c=cpu(g);if(cpuFault(c)){fault={...c,frame};break;}}
        const root=g.read32(0x020159cc);task=root?g.read32(root+8):0;
        if(g.read16(0x02002192)===id&&task&&context===undefined){
          for(let at=0x0200000c;at<0x02040000;at+=4)if(g.read32(at)===base&&g.read32(at-4)===task){context=at-12;break;}
        }
        if(context!==undefined){
          assert.equal(g.read32(context+12),base);assert.equal(g.read32(context+8),task);
          const pc=g.read16(context);if(trace.at(-1)?.pc!==pc)trace.push({frame,pc});
          const marker=markers.find(m=>m.pc===pc);
          if(marker&&firstFrame===null){firstFrame=frame;
            if(marker.flag!==undefined){branch=Boolean(g.read8(0x02001f70)&4);assert.equal(branch,marker.flag);}
          }
        }
        if(firstFrame!==null&&frame>=firstFrame+120)break;
      }
      const map=g.read8(0x02002037),roles=fault?[]:actors(g),pixels=Uint8Array.from(g.pixels());
      const row={name,scene:id,version,base,context,firstFrame,elapsedFrames:elapsed,elapsedMs:performance.now()-started,
        map,expectedMap:spec.map,content:g.read16(0x02002170),roles,branch,fault,trace,
        writesBeforeEntry:writes,memoryWritesDuringScene:0,romSha256:hash(candidate.bytes),
        scriptSha256:hash(program?.bytes??bytes.subarray(source.offset,source.end)),framebufferSha256:hash(pixels),
        camera:{x:g.read16(0x02007f64),y:g.read16(0x02007f66)}};
      await writeFile(`${out}/${name}.png`,png(pixels));await writeFile(`${out}/${name}.state`,g.saveState());
      await writeFile(`${out}/${name}.sav`,g.battery());
      if(version!=='baseline'){await writeFile(`${out}/${name}.gba`,candidate.bytes);await json(`${name}.project`,project);}
      await json(name,row);assert.equal(g.snapshot().frame-initial,elapsed);
      if(negative){assert.ok(firstFrame!==null&&!fault&&map!==spec.map,'The wrong-map control must expose a false positive');}
      else{assert.equal(fault,null);assert.ok(firstFrame!==null,'Native dialogue instruction was not reached');assert.equal(map,spec.map);
        assert.ok(roles.filter(r=>!r.hidden).length>=2);for(const id of spec.roles)assert.ok(roles.some(r=>r.id===id),`Missing native actor ${id}`);}
      return row;
    }finally{g.destroy();}
  }
  const results=[];
  for(const spec of cases){
    const group=[];for(const version of['baseline','a','b'])group.push(await run(spec,version));
    for(const edited of group.slice(1)){assert.deepEqual(edited.roles,group[0].roles);assert.deepEqual(edited.camera,group[0].camera);
      assert.notEqual(edited.framebufferSha256,group[0].framebufferSha256);}
    assert.notEqual(group[1].scriptSha256,group[2].scriptSha256);assert.notEqual(group[1].framebufferSha256,group[2].framebufferSha256);
    results.push({spec,runs:group});
  }
  const wrongMap=await run(cases[1],'a',true);
  const report={passed:true,format:'ffta.later-scene-verification/v1',
    probeSha256:hash(await readFile(fileURLToPath(import.meta.url))),core:NATIVE_CORE,checkpoint:manifest,results,
    rejectedControls:[{reason:'wrong encounter context despite executing the new dialogue',run:wrongMap}],
    scope:'Native script entry, initial camera/cast/map, first edited dialogue and one conditional; not complete scene/battle outcomes',
    syntheticEntry:true,editorIntegration:false,browserPixelAcceptance:false};
  await json('report',report);console.log(JSON.stringify({passed:true,scenes:results.map(r=>({id:r.spec.id,
    map:r.spec.map,frames:r.runs.map(x=>x.firstFrame)})),wrongMap:wrongMap.map}));
}
