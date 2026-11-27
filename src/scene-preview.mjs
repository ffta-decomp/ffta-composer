// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import {check,digest} from './binary.mjs';
import {build,plan} from './project.mjs';
import {decodeInstructions} from './rom.mjs';
import {createNativeGame,NATIVE_CORE} from './native-game.mjs';
import {PROFILE} from './profile.mjs';

export const SCENE_PREVIEW_ENTRIES=Object.freeze([
  {id:53,label:'三颗水晶之后',map:63},
  {id:93,label:'宫殿到达',map:37,encounter:93},
  {id:98,label:'终盘对话',map:38},
  {id:101,label:'结局过渡',map:101},
  {id:134,label:'酒馆相遇',map:63},
]);
const boundary=g=>({scene:g.read16(0x02002192),root:g.read32(0x020159cc),active:g.read8(0x0200f391),
  system:g.read8(0x0200f390),count:g.read8(0x0200219c),next:g.read16(0x02002194),content:g.read16(0x02002170)});
const expected={scene:14,root:0,active:0,system:9,count:1,next:14,content:32};
const assertBoundary=g=>check(JSON.stringify(boundary(g))===JSON.stringify(expected),'Preview context is not at the verified scene-loading boundary');
const from64=text=>{check(typeof text==='string'&&text.length<800000&&/^[A-Za-z0-9+/]*={0,2}$/.test(text),'Invalid preview context bytes');return Uint8Array.from(atob(text),c=>c.charCodeAt(0));};
export async function readScenePreviewContext(text){
  check(typeof text==='string'&&text.length<1100000,'Preview context file is too large');
  const data=JSON.parse(text),m=data.manifest;
  check(data.format==='ffta.scene-preview-context/v1'&&m?.format==='ffta.later-scene-probe/v1'&&m.scope==='native-mission-entry','Unsupported preview context');
  check(m.baseSha256===PROFILE.sha256&&m.coreSha256===NATIVE_CORE.sha256,'Preview context ROM/core revision mismatch');
  const state=from64(data.state),save=from64(data.save);
  check(state.length===0x61000&&[65536,131072].includes(save.length),'Invalid preview context size');
  check(await digest(state)===m.stateSha256&&await digest(save)===m.saveSha256,'Preview context checksum mismatch');
  return {manifest:structuredClone(m),state,save};
}
export function inspectSceneActors(g){
  const valid=p=>p>=0x02000000&&p<0x02040000;
  const registry=g.read32(0x0200f4b0);if(!valid(registry))return[];
  const list=g.read32(registry+16);if(!valid(list))return[];
  let node=g.read32(list+4);const seen=new Set(),rows=[];
  while(node){check(valid(node)&&!seen.has(node)&&seen.size<64,'Invalid native actor list');seen.add(node);
    const object=g.read32(node);check(valid(object),'Invalid native actor');const unit=g.read32(object);check(valid(unit),'Invalid native unit');
    const signed=n=>n>=32768?n-65536:n;
    rows.push({id:g.read8(unit+4),x:g.read8(unit+246),y:g.read8(unit+247),facing:g.read8(unit+248),
      worldX:signed(g.read16(object+8)),worldY:signed(g.read16(object+12)),hidden:Boolean(g.read32(object+48)&1)});
    node=g.read32(node+8);
  }return rows;
}

/** Scene-scoped native execution. Boot/save menus are never shown to the user. */
export async function createScenePreview(rom,project,sceneId,context){
  check(rom.sha256===context.manifest.baseSha256,'This preview context does not match the loaded ROM');
  const spec=SCENE_PREVIEW_ENTRIES.find(e=>e.id===sceneId)??(sceneId===239&&project.scenes[239]?{id:239,map:63}:null);check(spec,'No verified preview entry for this scene');
  const preview=structuredClone(project);
  if(spec.encounter){
    check(!Object.values(preview.storyEdits??{}).some(e=>e.trigger.scene===14),'Scene 14 is used by this preview entry and must remain unchanged');
    let slot=rom.directories[0].slotCount;while(preview.programs[`0/${slot}`])slot++;
    preview.programs[`0/${slot}`]={cloneFrom:'0/2',instructions:[
      {operation:'selectSceneEncounter',operands:{encounter:spec.encounter}},
      {operation:'queueScene',operands:{scene:sceneId}},
      {operation:'setSceneRuntimeMode',operands:{mode:1}},
    ]};
    preview.scenes[14]={script:{group:0,program:slot},dialoguePage:1};
  }
  const changes=plan(rom,preview),candidate=build(rom,preview),contracts=new Map();
  function contract(id){
    const scene=changes.scenes.get(id)??rom.scenes[id];
    check(scene?.script,'Queued scene has no script');
    const key=`${scene.script.group}/${scene.script.program}`,allocation=candidate.allocations.find(a=>a.kind==='program'&&a.target===key);
    const original=rom.programs.get(key),data=changes.programs.get(key);
    const bytes=data?.bytes??rom.bytes.subarray(original.offset,original.end);
    const commands=decodeInstructions(bytes,rom.specs),base=PROFILE.bus+(allocation?.offset??original.offset);
    const mapCommand=commands.find(c=>c.operation==='loadSceneMap');
    const linked=commands.filter(c=>c.operation==='queueScene'&&project.scenes[c.operands.scene]).map(c=>c.operands.scene);
    return {id,bytes,commands,base,mapCommand,expectedMap:mapCommand?.operands.map||spec.map,linked};
  }
  const pending=[sceneId];while(pending.length){const id=pending.shift();if(contracts.has(id))continue;
    check(contracts.size<8,'Preview chain exceeds eight scenes');const c=contract(id);contracts.set(id,c);pending.push(...c.linked);}
  let currentContract=contracts.get(sceneId),currentScene=sceneId;
  const game=await createNativeGame(candidate.bytes,{save:context.save});
  let contextAt=null,seen=false,ended=false,frames=0,lastOperation=null,closed=false,checkingMap=false;
  try{
    game.loadState(context.state);assertBoundary(game);
    if(!spec.encounter){game.write16(0x02002192,sceneId);game.write16(0x02002194,sceneId);}
  }catch(error){game.destroy();throw error;}
  function step(keys=0){
    check(!closed,'Preview is closed');if(ended)return;
    check(frames<36000,'Scene preview exceeded its ten-minute frame limit');
    game.frame(keys);frames++;
    if(frames%8===0){const state=game.saveState(),v=new DataView(state.buffer,state.byteOffset,state.byteLength);
      const pc=v.getUint32(0x5c,true),cpsr=v.getUint32(0x60,true);
      check((cpsr&31)!==27&&[[0,0x4000],[0x02000000,0x02040000],[0x03000000,0x03008000],[0x08000000,0x0e000000]].some(([a,b])=>pc>=a&&pc<b),'Native scene execution fault');
    }
    const current=game.read16(0x02002192),root=game.read32(0x020159cc);
    if(current!==currentScene){
      if(currentContract.linked.includes(current)){
        currentScene=current;currentContract=contracts.get(current);contextAt=null;seen=false;checkingMap=false;lastOperation=null;
      }else if(seen&&!currentContract.linked.length){ended=true;return;}
      else return;
    }
    if(!root){if(seen&&!currentContract.linked.length)ended=true;return;}
    const {base,commands,bytes,mapCommand,expectedMap}=currentContract;
    if(game.read8(root+12)!==0&&!seen)return;
    const task=game.read32(root+8);
    if(!contextAt&&task){
      const at=task+24;
      if(game.read32(at+12)===base&&game.read32(at+8)===task)contextAt=at;
      else for(let p=0x0200000c;p<0x02040000;p+=4)if(game.read32(p)===base&&game.read32(p-4)===task){contextAt=p-12;break;}
    }
    if(!contextAt)return;seen=true;
    if(game.read8(root+12)!==0){if(!currentContract.linked.length)ended=true;return;}
    check(game.read32(contextAt+12)===base&&game.read32(contextAt+8)===task,'Preview task context changed');
    const pc=game.read16(contextAt);
    for(let i=0;i<commands.length;i++)if((commands[i+1]?.offset??bytes.length)===pc){lastOperation=commands[i];break;}
    if(mapCommand&&pc>=mapCommand.offset+2)checkingMap=true;
    if(checkingMap)check(game.read8(0x02002037)===expectedMap,'The scene loaded a map from an incompatible preview context');
  }
  function snapshot(){const pc=contextAt?game.read16(contextAt):null;
    return {backend:'mgba-wasm',scene:currentScene,frame:frames,map:game.read8(0x02002037),expectedMap:currentContract.expectedMap,
      phase:ended?'done':!seen?'loading':lastOperation?.operation==='say'?'dialogue':'running',
      pc,camera:{x:game.read16(0x02007f64),y:game.read16(0x02007f66)},scriptBase:currentContract.base,operation:lastOperation?.operation??null,actors:seen?inspectSceneActors(game):[]};
  }
  return Object.freeze({step,snapshot,pixels:()=>game.pixels(),audio:()=>game.audio(),
    destroy(){if(!closed){game.destroy();closed=true;}}});
}
