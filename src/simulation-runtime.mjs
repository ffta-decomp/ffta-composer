// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import {check,u16,u32} from './binary.mjs';
import {VM_INSTRUCTIONS} from './vm-instructions.mjs';

// These sets are deliberately explicit. Recognition is not native equivalence.
const core=new Set([0,1,2,3,4,5,6,11,12,13,15,21,22,23,25,26,28,31,32,40,41,47,58,62,70,71,72,75,77,78,83,101,107,113,59,60]);
const modeled=new Set([7,8,9,14,16,18,24,27,29,35,36,37,38,39,42,43,45,46,48,49,50,51,55,56,57,61,63,64,65,66,67,68,69,73,74,76,79,81,82,84,87,88,89,90,91,93,97,99,100,102,103,104,105,106,108,109,110,111,112]);
export const SIMULATION_INSTRUCTIONS=Object.freeze(VM_INSTRUCTIONS.map(d=>Object.freeze({
  opcode:d.opcode,operation:d.name,handling:core.has(d.opcode)?'core':modeled.has(d.opcode)?'model':'external',
  description:d.description,
})));
const signed=n=>n>=32768?n-65536:n;

export function readScenePath(rom,id) {
  const b=rom.bytes,root=0xa19d18,site=root+id*4;
  check(site>=root&&site+4<=b.length,'Invalid scene path index');
  const at=root+u32(b,site);check(at>=root&&at+2<=b.length,'Invalid scene path pointer');
  const count=u16(b,at);check(count>0&&count<=32&&at+2+count*2<=b.length,'Invalid scene path length');
  return Array.from({length:count},(_,i)=>({x:b[at+2+i*2],y:b[at+3+i*2]}));
}

export function selectSimulationEncounter(rom,r,identifier) {
  const b=rom.bytes;
  for(let index=255;index>0;index--){const at=0x563a70+index*12;
    if(b[at+1]!==identifier)continue;
    const content=u16(b,at+2);
    check(0x54cd54+(content+1)*40<=0x55128c,'Invalid encounter content index');
    r.encounter=identifier;r.definitionIndex=index;r.definitionFlags=u16(b,at+8);r.contentIndex=content;
    return true;
  }
  return false;
}

export function populateSimulationUnits(rom,r,actor) {
  if(r.contentIndex===undefined||r.unitBank)return false;
  const b=rom.bytes,row=0x54cd54+r.contentIndex*40;
  check(row>=0x54cd54&&row+40<=0x55128c,'Invalid unit content record');
  const count=u16(b,row),start=u32(b,row+4)-0x08000000;
  check(count<=12&&start>=0&&start+count*48<=b.length,'Invalid encounter unit bank');
  let binding=128;
  for(let i=0;i<count;i++){
    const at=start+i*48,type=b[at],handle=type>=2?type:binding;
    const flags=u16(b,at+42),u={type,flags,states:{},source:at};
    r.units[handle]=u;
    if(flags&0x8000)r.units[binding++]=u;
    Object.assign(actor(handle),{x:b[at+5],y:b[at+6],facing:b[at+7]&3,visible:true});
  }
  r.unitsKnown=true;r.population={content:r.contentIndex,count,start};return true;
}

/** Additional JS semantic handlers; no game code, memory writes, or host I/O. */
export function simulateRuntimeInstruction({rom,state,actor,move,branch,external,delay},opcode,p) {
  const r=state.runtime,unit=id=>r.units[id];
  const event=(kind,data)=>{r.events.push({kind,...structuredClone(data)});if(r.events.length>100)r.events.shift();};
  const test=(fields,condition)=>{
    if(fields.some(v=>v===undefined)){external('condition',p);return;}
    if(condition())branch(p.delta);
  };
  const contentByte=index=>r.contentIndex===undefined?undefined:rom.bytes[0x54cd54+r.contentIndex*40+index];
  const a=p.actor===undefined?null:()=>actor(p.actor);
  switch(opcode) {
    case 7:r.display.brightness=null;event('brightness-restore',{});break;
    case 8:r.display.blend=[0,3,16,0];break;
    case 9:r.display.blend=[0,0,0,0];break;
    case 14:r.display.backgrounds=Boolean(p.enabled);break;
    case 16:r.contentWord=p.value;break;
    case 24:r.transition=({3:1,6:3,7:5})[p.transition]??p.transition;
      if(p.transition===10){state.input={kind:'name',nameKind:1,value:r.names?.[1]??'Marche',actor:15};state.phase='input';}
      else external('workflow',p);break;
    case 27:r.saveBytes[p.index]=p.value;break;
    case 29:r.statePair=[p.value,p.value];break;
    case 35:a().flags=(a().flags??0)&~1;a().visible=true;break;
    case 36:a().flags=(a().flags??0)|1;a().visible=false;break;
    case 37:a().facing=p.direction&3;a().action={kind:'turn',mode:p.mode};delay(1000/60);break;
    case 38:{const source=state.actors.find(a=>a.id===p.firstHandle),target=state.actors.find(a=>a.id===p.secondHandle);
      if(!source||!target){external('actor-context',p);break;}
      const dx=target.x-source.x,dy=target.y-source.y;
      source.facing=dx===0?(dy>0?0:2):dy===0?(dx>0?3:1):Math.abs(dy)>Math.abs(dx)?(dy>0?0:2):(dx>0?3:1);
      source.action={kind:'face-actor',target:p.secondHandle};delay(6*1000/60);break;}
    case 39:a().action={kind:'action',id:p.action,mode:p.mode};event('actor-action',p);break;
    case 42:{const u=unit(p.actor);if(!u||u.maxHp===undefined||u.maxMp===undefined){external('unit-context',p);break;}
      Object.assign(u,{hp:u.maxHp,mp:u.maxMp,statuses:{}});a().flags=0;break;}
    case 43:a().paletteOverride={first:p.first,condition:p.condition,delay:p.delay};event('palette-override',p);break;
    case 45:{const u=unit(p.actor);if(!u){external('unit-context',p);break;}
      (u.states??={})[p.stateIndex]=p.value;if(p.stateIndex===0){u.hp=0;u.mp=0;}break;}
    case 46:{const item=a(),axis=(value,delta)=>(signed((Math.round(value*32+16)+delta)&65535)-16)/32;
      item.x=axis(item.x,p.dx);item.y=axis(item.y,p.dz);
      item.height=signed(((item.height??0)+p.dy)&65535);break;}
    case 48:{const item=a();let flags=item.flags??0;
      if(p.mode===0)flags=p.value?flags|4:flags&~4;
      else if(p.mode===1){flags=p.value?flags|0x1000:flags&~0x1000;flags=p.value===2?flags|0x4000:flags&~0x4000;}
      else {external('unresolved',p);break;}item.flags=flags;break;}
    case 49:a().action={kind:'replacement',id:(p.argument*4)&65535,presentation:p.presentation};a().flags=(a().flags??0)|256;break;
    case 50:a().paletteRefresh=(a().paletteRefresh??0)+1;break;
    case 51:{const candidates=[[p.x1,p.y1],[p.x2,p.y2],[p.x3,p.y3]];
      const tile=candidates.find(([x,y])=>!state.actors.some(a=>a.visible&&a.x===x&&a.y===y));
      if(!tile){external('placement-context',p);break;}
      event('spawn-request',{...p,tile});external('unit-binding',p);break;}
    case 55:{const u=unit(p.unit);if(u)u.flags=(u.flags??0)|256;break;}
    case 56:{const item=actor(p.selector),from=item.height??0,change=signed(p.value);
      check(p.mode===0||p.mode===1,'Invalid height transition mode');
      check(p.mode!==0||p.amount>0,'Invalid height transition speed');
      const frames=p.mode===0?Math.floor(Math.abs(change)/p.amount):p.amount;
      state.heightMotion={actor:p.selector,from,to:signed((from+change)&65535),elapsed:0,duration:Math.max(1,frames)*1000/60};
      state.phase='height';break;}
    case 57:case 61:{const item=a();
      const x=item.x+signed(p.dx)/32,y=item.y+signed(p.dy)/32;
      move(p.actor,x,y,item.facing);a().action={kind:'movement',mode:p.mode,argument:p.argument,dispatch:p.dispatch??null};break;}
    case 63:case 64:{const first=opcode===63?{x:p.packedStart&15,y:p.packedStart>>>4}:a(),x=p.packedEnd&15,y=p.packedEnd>>>4;
      if((first.x===x||first.y===y)&&(first.x!==x||first.y!==y)){
        const count=Math.abs(x-first.x)+Math.abs(y-first.y)+1;check(count<=32,'Scene line exceeds path capacity');
        const dx=Math.sign(x-first.x),dy=Math.sign(y-first.y);
        r.paths[p.value]=Array.from({length:count},(_,i)=>({x:first.x+dx*i,y:first.y+dy*i}));
        event('scene-line',{from:{x:first.x,y:first.y},to:{x,y},value:p.value});
      }break;}
    case 65:case 66:case 68:{
      // 44 reads a ROM path ID into native scratch slot 15; 41/42 use caches.
      if(opcode===68)r.paths[15]=readScenePath(rom,p.path);
      const first=opcode===65?p.packedPath&15:opcode===66?p.packedRange&15:15;
      const segments=opcode===65?(p.packedPath>>>4)&7:opcode===66?(p.packedRange>>>4)-first+1:1;
      const last=first+segments-1;
      check(last>=first&&last-first<16,'Invalid scene path range');
      const points=[];
      for(let slot=first;slot<=last;slot++){
        if(!r.paths[slot]){external('path-context',p);return true;}
        points.push(...(slot===last?r.paths[slot]:r.paths[slot].slice(0,-1)));
      }
      if(opcode===68&&p.packed>>>4)points.reverse();
      check(points.length>0&&points.length<=256,'Scene path exceeds preview limits');
      const firstPoint=points.shift();move(p.actor,firstPoint.x,firstPoint.y,a().facing);
      state.motion.waypoints=structuredClone(points);a().action={kind:'path',slot:first,delay:p.delay??(p.packed&15),tail:p.packed===undefined?null:p.packed>>>4};break;
    }
    case 67:{const first=r.paths[p.packedSources&15],second=r.paths[p.packedSources>>>4];
      if(!first||!second){external('path-context',p);break;}
      const path=[...first.slice(0,-1),...second];check(path.length<=32,'Merged path exceeds 32 points');r.paths[p.destination]=path;break;}
    case 69:r.paths[p.slot]=readScenePath(rom,p.pathId);break;
    case 73:r.restoring=Boolean(p.restore);event('restore-context',p);break;
    case 74:event('apply-content',{index:r.contentIndex??null});if(r.contentIndex===undefined)external('content-context',p);break;
    case 76:r.audio.definition=p.definition;r.audio.mode=p.mode;delay(1000/60);break;
    case 79:event('actor-transition',p);external('unit-context',p);break;
    case 81:r.actionContext={};break;
    case 82:for(const u of Object.values(r.units)){u.storyState=0;}event('clear-story-units',{});break;
    case 84:r.saveBytes[53]=p.value;r.systemValue=p.value;break;
    case 87:r.taskContext={initialized:true,index:null};break;
    case 88:r.taskContext={initialized:false,index:null};break;
    case 89:r.currentEntity=p.handle;break;
    case 90:r.taskContext.index=(p.oneBasedIndex-1)&65535;break;
    case 91:if(r.taskContext.complete===true)r.taskContext={initialized:false,index:null};else external('task-completion',p);break;
    case 93:r.contentBytes=[p.first,p.second];break;
    case 97:if(r.saveBytes[13]===undefined){external('save-context',p);break;}
      if(r.saveBytes[13]===1){r.saveBytes[13]=0;r.contentFlags|=64;delay(16*1000/60);}break;
    case 99:r.viewReset=(r.viewReset??0)+1;event('view-reset',{});break;
    case 100:{const u=unit(p.unit);if(r.unitsKnown===true&&!u)break;test([r.unitsKnown,u?.usable],()=>Boolean(u?.usable));break;}
    case 102:{const u=unit(p.handle);check(p.bit<=15,'Unit flag bit exceeds 15');if(r.unitsKnown===true&&!u)break;test([r.unitsKnown,u?.flags],()=>Boolean(u.flags&(1<<p.bit)));break;}
    case 103:test([r.counter],()=>r.counter>p.threshold);break;
    case 104:test([r.resolvedSelector],()=>p.selector?r.resolvedSelector===p.selector:r.resolvedSelector>=1&&r.resolvedSelector<=6);break;
    case 105:test([r.definitionFlags],()=>Boolean(r.definitionFlags&1));break;
    case 106:test([r.definitionFlags],()=>!(r.definitionFlags&2));break;
    case 108:{const u=unit(p.unit);if(r.unitsKnown===true&&!u)break;test([r.unitsKnown,u?.available],()=>Boolean(u?.available));break;}
    case 109:{const value=contentByte(22);test([value],()=>value===0);break;}
    case 110:test([r.saveBytes[13]],()=>r.saveBytes[13]===1);break;
    case 111:{const u=unit(p.unit);if(r.unitsKnown===true&&!u)break;test([r.unitsKnown,u?.usable,u?.hp,u?.maxHp],()=>u.usable&&u.hp>(p.threshold<=9?p.threshold:Math.floor(u.maxHp*p.threshold/100)));break;}
    case 112:test([r.unitsKnown,...Object.values(r.units).map(u=>u.eligible)],()=>!Object.values(r.units).some(u=>u.eligible));break;
    default:return false;
  }
  return true;
}

export function newSimulationRuntime(context={}) {
  return {saveBytes:{},units:{},unitsKnown:undefined,paths:{},events:[],display:{backgrounds:true,blend:null,brightness:null},audio:{},
    taskContext:{initialized:false,index:null},contentFlags:0,...structuredClone(context)};
}
