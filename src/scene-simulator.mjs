// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import { check, integer,u16,u32 } from './binary.mjs';
import { PROFILE } from './profile.mjs';
import { DIRECTIONS, OPENING_CAST } from './opening.mjs';
import { plan } from './project.mjs';
import { decodeInstructions, pageKey, programKey, withCharacterTable } from './rom.mjs';
import { toVmExpression } from './vm-instructions.mjs';
import { preview as previewText,readLine } from './text.mjs';
import {describeSceneActor} from './scene-actors.mjs';
import {newSimulationRuntime,simulateRuntimeInstruction,SIMULATION_INSTRUCTIONS,selectSimulationEncounter,populateSimulationUnits} from './simulation-runtime.mjs';
export {SIMULATION_INSTRUCTIONS} from './simulation-runtime.mjs';

// Native scene/save map values are one-based; the map directory is zero-based.
const nativeMap = (rom, record) => rom.bytes[0x54cd54 + record * 40 + 2] - 1;
const nodes = (list, prefix) => list.map((node, i) => ({...structuredClone(node), path: `${prefix}.${i}`}));
export const projectActorPosition = actor => ({x:256+(actor.x-actor.y)*16,y:256+(actor.x+actor.y+1)*8-(actor.height??0)/2});

/** Deterministic semantic preview. It never writes ROM bytes, SAVs, or the project. */
export function createSceneSimulation(rom, project, sceneId, options = {}) {
  const actorInfo = id => {
    const info=describeSceneActor(id,sceneId,Boolean(opening));
    const name=[2,15].includes(id)?state.runtime.names?.[1]:null;
    return name?{...info,name,label:name,identitySource:'preview-name'}:info;
  };
  const displayActor = id => actorInfo(id).label;
  rom=withCharacterTable(rom,project.characterTable);
  integer(sceneId, 1, 239, 'Scene ID');
  const changes = plan(rom, project);
  const scene = changes.scenes.get(sceneId) ?? rom.scenes[sceneId];
  check(scene, 'Unknown simulation scene');
  const nativeScene = rom.scenes[sceneId] ?? scene;
  const source = rom.programs.get(programKey(nativeScene.script.group, nativeScene.script.program));
  const opening = sceneId === 1 ? project.openings?.['first-act'] : null;
  const recipe = Object.values(project.storyEdits ?? {}).find(item => item.trigger.scene === sceneId);
  const state = {format: 'ffta.scene-simulation/v1', scene: sceneId, mode: opening ? 'opening' : recipe ? 'fragment' : 'native',
    phase: 'ready', mapId: options.mapId ?? null, mapContext: 'explicit', actors: [], dialogue: null,
    choice: null, motion: null, wait: 0, flags: {...options.flags}, trace: [], queue: [], stepCount: 0,
    location: null, message: null, skippedBattleSteps: 0,
    camera:{x:256,y:256,targetActor:null},cameraMotion:null,
    runtime:newSimulationRuntime(options.runtime),external:null,coverage:{},input:null,heightMotion:null};
  let sequence = [], position = 0, counter = 0, menuResult = null;
  let tasks = [], taskSerial = 0, pending = null;
  const maxSteps = options.maxSteps ?? 10000;
  integer(maxSteps, 1, 100000, 'Simulation step limit');

  const trace = (operation, detail = null, path = null) => {
    state.location = path;
    state.trace.push({index: ++counter, operation, detail, path});
    if (state.trace.length > 300) state.trace.shift();
  };
  const actor = (id, x = 0, y = 0) => {
    let item = state.actors.find(a => a.id === id);
    if (!item) { item = {id, name: displayActor(id), identity:actorInfo(id), x, y, facing: 0, visible: true}; state.actors.push(item); }
    return item;
  };
  function setMap(id, context) {
    integer(id, 0, 161, 'Map ID');
    state.mapId = id; state.mapContext = context;
  }
  const openingRecord = 30;
  if (state.mapId === null) {
    if (opening || sceneId === 1 || sceneId === 6) setMap(nativeMap(rom, openingRecord), 'opening');
    // Fixture-specific context, checked in a pinned-retail Herb Picking replay.
    else if (sceneId === 14 && [PROFILE.id,PROFILE.chineseId].includes(rom.profile)) setMap(nativeMap(rom, 32), 'herb-picking');
    else {
      const first = source?.commands.find(c => c.operation === 'loadSceneMap');
      if (first?.operands.map > 0) setMap(first.operands.map - 1, 'script');
      else state.mapContext = 'required';
    }
  }
  function seedCast() {
    for (const command of source?.commands ?? []) {
      if (anchor && command.offset > anchor.offset) break;
      if (command.operation === 'placeSceneActor') {
        const p = command.operands, item = actor(p.actor, p.tile & 15, p.tile >>> 4);
        Object.assign(item, {x: p.tile & 15, y: p.tile >>> 4, facing: p.facing, visible: Boolean(p.visibility&15)});
      }
    }
  }
  let page = pageKey(scene.dialoguePage, scene.dialoguePage === 61 ? (options.variant ?? 0) : null);
  const lines = new Map((changes.pages.get(page)?.records ?? rom.pages.get(page)?.records ?? []).map(record =>
    [record.index, {text: record.preview, tokens: record.tokens}]));
  for (const diff of changes.diffs) {
    if (diff.kind !== 'dialogue') continue;
    const [key, line] = diff.target.split(':');
    if (key === page) lines.set(Number(line), {text: diff.after.text, tokens: diff.after.tokens});
  }
  let anchor;
  // Scene 6 inherits the school cast from the opening. Use its last explicit
  // placements as context, not invented actors at (0,0) when dialogue starts.
  if(sceneId===6) {
    for(const c of rom.programs.get('0/0')?.commands ?? []) {
      const p=c.operands;
      if(c.operation==='placeSceneActor')Object.assign(actor(p.actor),{x:p.tile&15,y:p.tile>>>4,facing:p.facing,visible:Boolean(p.visibility&15)});
      if(c.operation==='setActorTile'&&state.actors.some(a=>a.id===p.actor)) {
        const item=actor(p.actor);if(p.x!==255)item.x=p.x;if(p.y!==255)item.y=p.y;
      }
    }
  }
  if (opening) {
    for (const member of opening.cast) {
      Object.assign(actor(OPENING_CAST[member.actor]), member, {id: OPENING_CAST[member.actor],
        name: displayActor(OPENING_CAST[member.actor]), facing: DIRECTIONS.indexOf(member.facing)});
    }
    sequence = [...nodes(opening.steps, 'opening'), {type: 'battle', path: 'opening.battle'}];
  } else if (recipe) {
    const candidates = source.commands.filter(c => c.operation === 'say' && c.operands.textSelector === recipe.trigger.beforeDialogue);
    anchor = candidates[(recipe.trigger.occurrence ?? 1) - 1];
    check(anchor, 'Story anchor is missing');
    seedCast();
    const original = rom.pages.get(String(nativeScene.dialoguePage))?.records[anchor.operands.textSelector];
    sequence = [...nodes(recipe.steps, 'fragment'),
      {type: 'say', text: original?.preview ?? '', speakerHandle:anchor.operands.speakerHandle, path: 'native.anchor'},
      {type: 'resume', path: 'native.resume'}];
  } else {
    const key = programKey(scene.script.group, scene.script.program);
    const changed = changes.programs.get(key);
    const specs = new Map(rom.specs);
    specs.set(0x72, {opcode: 0x72, size: 5, operation: 'native', operands: null});
    specs.set(0x73, {opcode: 0x73, size: 4, operation: 'native', operands: null});
    const commands = changed ? decodeInstructions(changed.bytes, specs) : rom.programs.get(key)?.commands ?? [];
    const locations = new Map(commands.map((c, i) => [c.offset, i]));
    const task = (pc, kind) => ({id: taskSerial++, pc, kind, delay: 0, waiting: null, done: false});
    tasks = [task(commands[0]?.offset ?? 0, null)];
    pending = {commands, locations, task, cursor: 0};
    if (!commands.length) state.phase = 'done';
  }
  state.queue = sequence.slice(0, 8).map(({type, text, path}) => ({type, text, path}));

  function speak(text, handle, path) {
    const info=handle===null?{kind:'system',name:'Prompt',handle:null}:actorInfo(handle);
    state.dialogue = {text, speaker:info.label, speakerInfo:info,
      actorId:state.actors.some(a=>a.id===handle) ? handle : null,path};
    state.choice = null; state.phase = 'dialogue';
  }
  function presentLine(line,handle,path) {
    const menuAt=line.tokens?.findIndex(token=>token.kind==='control'&&token.code===0x32)??-1;
    if(menuAt<0){speak(runtimeText(line),handle,path);return;}
    const groups=[[]];
    for(const token of line.tokens.slice(menuAt+1)){
      if(token.kind==='separator')groups.push([]);else groups.at(-1).push(token);
    }
    state.choice={prompt:previewText(line.tokens.slice(0,menuAt),false,rom.characterTable).trimEnd(),
      labels:[previewText(groups[0],false,rom.characterTable),previewText(groups[1]??[],false,rom.characterTable)],
      speakerInfo:handle===null?{kind:'system',name:'Prompt',handle:null}:actorInfo(handle),path,native:true};
    state.dialogue=null;state.phase='choice';
  }
  function managedPrompt(value,path) {
    const mode=value&128?1:2,index=value&127,b=rom.bytes,bank=u32(b,0x36d678+mode*4)-0x08000000;
    check(bank>=0&&bank+2<=b.length,'Invalid prompt bank');
    const directory=u16(b,bank);check(directory>=4&&directory%2===0&&directory<8192&&index<directory/2,'Invalid prompt index');
    const relative=u16(b,bank+index*2);check(relative>=directory&&relative!==65535,'Invalid prompt record');
    const next=u16(b,bank+(index+1)*2),end=next>relative&&next!==65535?bank+next:Math.min(b.length,bank+65535);
    check(bank+relative<end&&end<=b.length,'Invalid prompt bounds');
    presentLine(readLine(b,bank+relative,end,rom.characterTable),null,path);
  }
  function runtimeText(line) {
    if(!line.tokens?.length)return line.text??line.preview??'';
    // Opening text 04/0 is the entered primary name; 51 uses named text slots.
    // Preserve other controls/variables rather than assigning invented values.
    return line.tokens.map(token=>{
      if(sceneId===1&&token.kind==='control'){
        if(token.code===4&&token.args[0]===0)return state.runtime.names?.[1]??displayActor(15);
        if(token.code===0x51){
          const value=token.args[0];
          const name=({2:state.runtime.names?.[1]??displayActor(15),3:displayActor(16),4:displayActor(17)})[value];
          if(name)return name;
        }
      }
      return previewText([token],false,rom.characterTable);
    }).join('');
  }
  function block(operation) { state.phase = 'unsupported'; state.message = operation; }
  function move(id, x, y, facing, duration = 600) {
    const item = actor(id);
    state.motion = {actor: id, fromX: item.x, fromY: item.y, x, y, facing, elapsed: 0, duration};
    state.phase = 'motion';
  }
  function moveCamera(x,y,mode,amount,targetActor=null) {
    if(mode===3){block('camera-task-mode-3');return;}
    check([0,1,2].includes(mode),'Unknown camera mode');
    let frames=amount;
    if(mode!==1) {
      check(amount>0,'Invalid camera speed');
      const speed=mode===0 ? rom.bytes[0x3a8190+amount-1] : amount;
      check(speed>0,'Invalid camera speed');
      frames=Math.ceil(Math.hypot(x-state.camera.x,y-state.camera.y)/speed);
    }
    check(Number.isFinite(frames)&&frames<=36000,'Camera move exceeds preview time limit');
    state.camera.targetActor=targetActor;
    if(!frames){Object.assign(state.camera,{x,y});return;}
    state.cameraMotion={fromX:state.camera.x,fromY:state.camera.y,x,y,elapsed:0,duration:frames*1000/60};
    state.phase='camera';
  }
  function advanceAuthoring() {
    const node = sequence[position++];
    if (!node) {state.phase = 'done'; return;}
    trace(node.type, node.text ?? node.prompt ?? node.actor ?? null, node.path);
    if (node.type === 'say') {
      let handle = node.speakerHandle;
      if (handle === undefined && opening) handle = OPENING_CAST[node.actor];
      if (handle === undefined && recipe) {
        const binding = node.speaker ? recipe.speakers[node.speaker] : null;
        const command = binding ? source.commands.filter(c => c.operation === 'say' && c.operands.textSelector === binding.dialogue)[(binding.occurrence ?? 1) - 1] : anchor;
        handle = command.operands.speakerHandle;
      }
      speak(node.text, handle, node.path);
    } else if (node.type === 'walk') move(OPENING_CAST[node.actor], node.x, node.y, DIRECTIONS.indexOf(node.facing));
    else if (node.type === 'face') actor(OPENING_CAST[node.actor]).facing = DIRECTIONS.indexOf(node.facing);
    else if (node.type === 'if') {
      const enabled = Boolean(state.flags[recipe.flags[node.flag]]);
      sequence.splice(position, 0, ...nodes(enabled ? node.then : node.else ?? [], `${node.path}.${enabled ? 'then' : 'else'}`));
    } else if (node.type === 'choose') {
      state.choice = {prompt: node.prompt, labels: [node.first.label, node.second.label],
        speakerInfo:anchor?describeSceneActor(anchor.operands.speakerHandle,sceneId):null,path: node.path, native: false};
      state.dialogue = null; state.phase = 'choice'; pendingChoice = node;
    } else if (node.type === 'enemyHp') {
      state.skippedBattleSteps++;
      state.trace.at(-1).detail = 'battle-step-skipped';
    } else if (node.type === 'battle') { state.phase = 'battle'; state.dialogue = null; }
    else if (node.type === 'resume') { state.phase = 'done'; state.message = 'resume-original'; }
    else block(node.type);
    state.queue = sequence.slice(position, position + 8).map(({type, text, path}) => ({type, text, path}));
  }
  let pendingChoice = null;
  function advanceNative() {
    const {commands, locations} = pending;
    let active;
    for (let n = 0; n < tasks.length; n++) {
      const index = (pending.cursor + n) % tasks.length, candidate = tasks[index];
      if (candidate.done || candidate.delay > 0) continue;
      if (candidate.waiting !== null && tasks.some(t => !t.done && t.id !== candidate.id &&
          t.kind !== null && (candidate.waiting === 255 || t.kind === candidate.waiting))) continue;
      candidate.waiting = null; active = candidate; pending.cursor = (index + 1) % tasks.length; break;
    }
    if (!active) {
      if (tasks.every(t => t.done)) {state.phase = 'done'; return;}
      const delays = tasks.filter(t => !t.done && t.delay > 0).map(t => t.delay);
      if (!delays.length) {block('child-script-deadlock');return;}
      state.wait = Math.min(...delays); state.phase = 'waiting'; return;
    }
    const command = commands[locations.get(active.pc)];
    if (!command) {block('invalid-instruction-target'); return;}
    const offset = command.offset;
    const spec = rom.specs.get(command.opcode);
    const opcode = command.opcode ?? [...rom.specs.values()].find(s => s.operation === command.operation)?.opcode;
    let value;
    if (opcode === 0x72) value = {operation:'patchChoice', operands:{bytes:command.operands}};
    else if (opcode === 0x73) value = {operation:'patchEnemyHp', operands:{bytes:command.operands}};
    else value = toVmExpression(command);
    const name = value.operation, p = value.operands;
    const length = opcode === 0x72 ? 5 : opcode === 0x73 ? 4 : (spec?.size ?? rom.specs.get(opcode).size);
    active.pc += length;
    trace(name, null, `native.${offset}`);
    state.coverage[opcode]=(state.coverage[opcode]??0)+1;
    state.trace.at(-1).handling=SIMULATION_INSTRUCTIONS[opcode]?.handling??'reserved';
    const branch = delta => {const target = active.pc + delta; check(locations.has(target), 'Invalid simulation branch target'); active.pc = target;};
    const external=(kind,operands)=>{
      state.external={opcode,operation:name,kind,operands:structuredClone(operands),
        description:SIMULATION_INSTRUCTIONS[opcode]?.description??'Reserved instruction',path:`native.${offset}`};
      state.phase='external';
      pending.externalTask=active;
    };
    const delay=ms=>{active.delay=ms;};
    if (['startSceneScript','startAnonymousSceneScript'].includes(name)) {
      check(tasks.filter(t => !t.done).length < 17, 'Simulation child-script limit reached');
      const pc = active.pc + p.delta; check(locations.has(pc), 'Invalid child-script target');
      tasks.push(pending.task(pc, name === 'startSceneScript' ? p.kind : 128));
    } else if (name === 'finishSceneTask') active.done = true;
    else if (name === 'cancelSceneScripts') tasks.filter(t => t.kind !== null).forEach(t => {t.done = true;});
    else if (name === 'waitForSceneScript') active.waiting = p.handle;
    else if (name === 'waitForAllSceneScripts') active.waiting = 255;
    else if (['waitFrames8','waitFrames16'].includes(name)) active.delay = p.frames * 1000 / 60;
    else if (name === 'adjustScriptOffset') branch(p.delta);
    else if (name === 'setStoryFlag') state.flags[p.flag] = Boolean(p.value);
    else if (name === 'branchIfStoryFlag') {if (state.flags[p.flag]) branch(p.delta);}
    else if (name === 'branchOnFirstChoice') {
      const result=state.runtime.saveBytes[19]??menuResult;
      if(result===null)external('condition',p);else if(result===0)branch(p.delta);
    }
    else if (name === 'showDialogue') {
      const line = lines.get(p.textSelector);
      if (!line) {block('missing-dialogue'); return;}
      presentLine(line,p.speakerHandle,`native.${offset}`);
    } else if(name==='showScenePrompt')managedPrompt(p.mode,`native.${offset}`);
    else if (name === 'placeSceneActor') Object.assign(actor(p.actor), {x:p.tile & 15, y:p.tile >>> 4, facing:p.facing, visible:Boolean(p.visibility&15)});
    else if (name === 'placeScenePackedActor') Object.assign(actor(p.type), {x:p.packedXY & 15, y:p.packedXY >>> 4, facing:p.arg, visible:true});
    else if (name === 'setActorFacing') actor(p.actor).facing = p.facing;
    else if (name === 'setActorTile') {
      const item = actor(p.actor); if (p.x !== 255) item.x = p.x; if (p.y !== 255) item.y = p.y;
    } else if (['moveActorOnGrid','moveActorToTile'].includes(name)) {
      move(p.actor, p.x < 0 || p.x >= 128 ? actor(p.actor).x : p.x, p.y < 0 || p.y >= 128 ? actor(p.actor).y : p.y, p.facing ?? p.mode);
    } else if (name === 'loadSceneMap') {
      if (p.map > 0) setMap(p.map - 1, 'script');
      else if (state.mapId === null) block('map-context-required');
    } else if (name === 'moveSceneCamera') {
      if(p.mode===3){external('camera-task',p);return;}
      const signed=value=>value>=0x8000?value-0x10000:value;
      moveCamera(signed(p.x)+120,signed(p.y)+80,p.mode,p.duration);
    } else if (name === 'moveCameraToActor') {
      if(p.mode===3){external('camera-task',p);return;}
      const item=state.actors.find(a=>a.id===p.actor);
      if(!item){external('camera-actor-context',p);return;}
      const point=projectActorPosition(item);
      moveCamera(point.x,point.y-20,p.mode,p.amount,p.actor);
    } else if (name === 'queueScene') {
      check((state.runtime.sceneQueue??=[]).length<4,'Scene queue exceeds four entries');
      state.runtime.sceneQueue.push(p.scene);state.trace.at(-1).detail = `scene ${p.scene}`;
    }
    else if (name === 'setSceneRuntimeMode') {
      state.phase = [4,8].includes(p.mode) ? 'battle' : 'done';
    } else if (name === 'patchEnemyHp') {state.skippedBattleSteps++; state.trace.at(-1).detail = 'battle-step-skipped';}
    else if (['fadeSceneBrightness','fadeSceneAlpha'].includes(name)) {
      state.runtime.display[name==='fadeSceneBrightness'?'brightness':'alpha']={...p};
      state.wait = Math.max(0, p.frames ?? p.duration) * 1000 / 60;
      if (state.wait > 0) state.phase = 'waiting';
    } else if(name==='refreshActorFacing') actor(p.actor).facingRefresh=(actor(p.actor).facingRefresh??0)+1;
    else if(name==='selectScenePresentation')state.runtime.presentation=p.preset;
    else if(name==='fadeSceneAudio'){state.runtime.audio.fade={...p};state.trace.at(-1).detail='audio-not-rendered';}
    else if(['sceneNoop3B','sceneNoop3C','sceneNoop6B'].includes(name))state.trace.at(-1).detail='native-noop';
    else if(name==='setSceneRuntimeState12')state.runtime.sceneState=12;
    else if(name==='prepareMapView'){state.runtime.mapView=p.mode;if(state.runtime.saveBytes[13]===1)external('map-context',p);}
    else if(name==='loadEncounterUnits'){
      if(!populateSimulationUnits(rom,state.runtime,actor))external('encounter-units',p);
    }
    else if(name==='selectSceneEncounter'){
      if(!selectSimulationEncounter(rom,state.runtime,p.encounter))external('encounter-context',p);
    }
    else if(!simulateRuntimeInstruction({rom,state,actor,move,branch,external,delay},opcode,p))external('unresolved',p);
  }
  function snapshot() {return structuredClone(state);}
  function step() {
    if (['battle','done','unsupported','external','input','choice','dialogue'].includes(state.phase)) return snapshot();
    if(state.phase==='height'){tick(state.heightMotion.duration);return snapshot();}
    if (state.phase === 'motion') {tick(state.motion.duration); return snapshot();}
    if (state.phase === 'camera') {tick(state.cameraMotion.duration);return snapshot();}
    if (state.phase === 'waiting') {tick(state.wait); return snapshot();}
    if (++state.stepCount > maxSteps) {block('execution-limit'); return snapshot();}
    try { if (state.mode === 'native') advanceNative(); else advanceAuthoring(); }
    catch (error) {block(error.message);}
    return snapshot();
  }
  function tick(ms) {
    check(Number.isFinite(ms) && ms >= 0 && ms <= 600000, 'Invalid simulation time');
    if(state.phase==='height'){
      const m=state.heightMotion;m.elapsed=Math.min(m.duration,m.elapsed+ms);
      const ratio=m.elapsed/m.duration;actor(m.actor).height=m.from+(m.to-m.from)*ratio;
      if(ratio===1){state.heightMotion=null;state.phase='ready';}
    }else if (state.phase === 'motion') {
      const m = state.motion, item = actor(m.actor);
      m.elapsed = Math.min(m.duration, m.elapsed + ms);
      const ratio = m.duration ? m.elapsed / m.duration : 1;
      item.x = m.fromX + (m.x - m.fromX) * ratio; item.y = m.fromY + (m.y - m.fromY) * ratio;
      if (ratio === 1) {
        item.facing = m.facing;
        if(m.waypoints?.length){const next=m.waypoints.shift(),remaining=m.waypoints;move(m.actor,next.x,next.y,m.facing);state.motion.waypoints=remaining;}
        else {state.motion = null; state.phase = 'ready';}
      }
    } else if(state.phase==='camera') {
      const m=state.cameraMotion;m.elapsed=Math.min(m.duration,m.elapsed+ms);
      const ratio=m.duration?m.elapsed/m.duration:1;
      state.camera.x=m.fromX+(m.x-m.fromX)*ratio;state.camera.y=m.fromY+(m.y-m.fromY)*ratio;
      if(ratio===1){state.cameraMotion=null;state.phase='ready';}
    } else if (state.phase === 'waiting') {
      state.wait = Math.max(0, state.wait - ms); if (!state.wait) state.phase = 'ready';
    }
    for (const task of tasks) task.delay = Math.max(0, task.delay - ms);
    return snapshot();
  }
  function confirm() {if (state.phase === 'dialogue') {state.dialogue = null; state.phase = 'ready';} return snapshot();}
  function confirmName(value) {
    check(state.phase==='input'&&state.input?.kind==='name','There is no active name entry');
    check(typeof value==='string'&&value.trim().length>0&&[...value.trim()].length<=8&&!/[\u0000-\u001f\u007f]/.test(value),'Use a name of 1–8 characters');
    const name=value.trim();(state.runtime.names??={})[state.input.nameKind]=name;
    for(const item of state.actors.filter(a=>[2,15].includes(a.id))){item.name=name;item.identity=actorInfo(item.id);}
    trace('name-entry',name,state.location);state.input=null;state.phase='ready';return snapshot();
  }
  function choose(index) {
    check(state.phase === 'choice', 'There is no active choice'); integer(index, 0, 1, 'Choice');
    if (state.choice.native) {menuResult = index;state.runtime.saveBytes[19]=index;}
    else {
      const route = index === 0 ? pendingChoice.first : pendingChoice.second;
      sequence.splice(position, 0, ...nodes(route.steps, `${pendingChoice.path}.${index}`));
    }
    trace('choice', state.choice.labels[index], state.choice.path);
    state.choice = null; state.phase = 'ready'; return snapshot();
  }
  function cancel() {
    if (state.phase !== 'choice') return snapshot();
    if (state.choice.native) {menuResult = 255;state.runtime.saveBytes[19]=255;state.choice = null; state.phase = 'ready';}
    else {
      trace('cancel', 'native-second-route', state.choice.path);
      return choose(1);
    }
    return snapshot();
  }
  function skip() {
    check(state.phase === 'unsupported', 'No unsupported instruction is pending');
    check(!['execution-limit','child-script-deadlock','invalid-instruction-target'].includes(state.message), 'Restart is required');
    trace('skip-unsupported', state.message, state.location); state.message = null; state.phase = 'ready'; return snapshot();
  }
  function resolveExternal(result={}) {
    check(state.phase==='external','No external request is pending');
    if(state.external.kind==='condition'){
      check(typeof result.branch==='boolean','Supply a boolean branch result');
      if(result.branch){const t=pending.externalTask,target=t.pc+state.external.operands.delta;
        check(pending.locations.has(target),'Invalid simulation branch target');t.pc=target;}
    }
    check(state.external.kind==='condition'||result.complete===true,'Explicit completion is required');
    trace('external-resolution',{operation:state.external.operation,...result},state.external.path);
    const handoff=state.external.opcode===0x18&&!pending.locations.has(pending.externalTask.pc);
    state.external=null;state.phase=handoff?'done':'ready';
    if(handoff)state.message='external-handoff';
    return snapshot();
  }
  return Object.freeze({snapshot, step, tick, confirm, confirmName,choose, cancel, skip,resolveExternal,
    setFlag(id, enabled) {integer(id,0,1535,'Flag');state.flags[id] = Boolean(enabled);return snapshot();},
    setMap(id) {setMap(id,'explicit');if(state.phase === 'unsupported' && state.message === 'map-context-required') {state.phase='ready';state.message=null;}return snapshot();},
  });
}
