// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import { check, integer } from './binary.mjs';
import { PROFILE } from './profile.mjs';
import { DIRECTIONS, OPENING_CAST } from './opening.mjs';
import { plan } from './project.mjs';
import { decodeInstructions, pageKey, programKey } from './rom.mjs';
import { toVmExpression } from './vm-instructions.mjs';
import { preview as previewText } from './text.mjs';

const ACTOR_NAMES = {2: 'Marche', 8: 'Montblanc', 15: 'Marche', 16: 'Mewt', 17: 'Ritz',
  23: 'Teacher', 76: 'Student', 128: 'Red Cap', 129: 'Goblin 1', 130: 'Goblin 2', 131: 'Goblin 3'};
const displayActor = id => ACTOR_NAMES[id] ?? `Actor ${id}`;
// Native scene/save map values are one-based; the map directory is zero-based.
const nativeMap = (rom, record) => rom.bytes[0x54cd54 + record * 40 + 2] - 1;
const nodes = (list, prefix) => list.map((node, i) => ({...structuredClone(node), path: `${prefix}.${i}`}));

/** Deterministic semantic preview. It never writes ROM bytes, SAVs, or the project. */
export function createSceneSimulation(rom, project, sceneId, options = {}) {
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
    location: null, message: null, skippedBattleSteps: 0};
  let sequence = [], position = 0, counter = 0, menuResult = 0;
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
    if (!item) { item = {id, name: displayActor(id), x, y, facing: 0, visible: true}; state.actors.push(item); }
    return item;
  };
  function setMap(id, context) {
    integer(id, 0, 161, 'Map ID');
    state.mapId = id; state.mapContext = context;
  }
  const openingRecord = 30;
  if (state.mapId === null) {
    if (opening || sceneId === 1) setMap(nativeMap(rom, openingRecord), 'opening');
    // Fixture-specific context, checked in a pinned-retail Herb Picking replay.
    else if (sceneId === 14 && rom.profile === PROFILE.id) setMap(nativeMap(rom, 32), 'herb-picking');
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
        Object.assign(item, {x: p.tile & 15, y: p.tile >>> 4, facing: p.facing, visible: p.visibility !== 3});
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
      {type: 'say', text: original?.preview ?? '', speakerName: displayActor(anchor.operands.speakerHandle), path: 'native.anchor'},
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

  function speak(text, name, path) {
    state.dialogue = {text, speaker: name ?? '', path}; state.choice = null; state.phase = 'dialogue';
  }
  function block(operation) { state.phase = 'unsupported'; state.message = operation; }
  function move(id, x, y, facing, duration = 600) {
    const item = actor(id);
    state.motion = {actor: id, fromX: item.x, fromY: item.y, x, y, facing, elapsed: 0, duration};
    state.phase = 'motion';
  }
  function advanceAuthoring() {
    const node = sequence[position++];
    if (!node) {state.phase = 'done'; return;}
    trace(node.type, node.text ?? node.prompt ?? node.actor ?? null, node.path);
    if (node.type === 'say') {
      let name = node.speakerName;
      if (!name && opening) name = displayActor(OPENING_CAST[node.actor]);
      if (!name && recipe) {
        const binding = node.speaker ? recipe.speakers[node.speaker] : null;
        const command = binding ? source.commands.filter(c => c.operation === 'say' && c.operands.textSelector === binding.dialogue)[(binding.occurrence ?? 1) - 1] : anchor;
        name = displayActor(command.operands.speakerHandle);
      }
      speak(node.text, name, node.path);
    } else if (node.type === 'walk') move(OPENING_CAST[node.actor], node.x, node.y, DIRECTIONS.indexOf(node.facing));
    else if (node.type === 'face') actor(OPENING_CAST[node.actor]).facing = DIRECTIONS.indexOf(node.facing);
    else if (node.type === 'if') {
      const enabled = Boolean(state.flags[recipe.flags[node.flag]]);
      sequence.splice(position, 0, ...nodes(enabled ? node.then : node.else ?? [], `${node.path}.${enabled ? 'then' : 'else'}`));
    } else if (node.type === 'choose') {
      state.choice = {prompt: node.prompt, labels: [node.first.label, node.second.label], path: node.path, native: false};
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
    const branch = delta => {const target = active.pc + delta; check(locations.has(target), 'Invalid simulation branch target'); active.pc = target;};
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
    else if (name === 'branchOnFirstChoice') {if (menuResult === 0) branch(p.delta);}
    else if (name === 'showDialogue') {
      const line = lines.get(p.textSelector);
      if (!line) {block('missing-dialogue'); return;}
      const menuAt = line.tokens?.findIndex(token => token.kind === 'control' && token.code === 0x32) ?? -1;
      if (menuAt >= 0) {
        const groups = [[]];
        for (const token of line.tokens.slice(menuAt + 1)) {
          if (token.kind === 'separator') groups.push([]);
          else groups.at(-1).push(token);
        }
        state.choice = {prompt:previewText(line.tokens.slice(0,menuAt)).trimEnd(),
          labels:[previewText(groups[0]),previewText(groups[1] ?? [])], path:`native.${offset}`, native:true};
        state.phase = 'choice'; state.dialogue = null;
      } else speak(line.text, displayActor(p.speakerHandle), `native.${offset}`);
    } else if (name === 'placeSceneActor') Object.assign(actor(p.actor), {x:p.tile & 15, y:p.tile >>> 4, facing:p.facing, visible:p.visibility !== 3});
    else if (name === 'placeScenePackedActor') Object.assign(actor(p.type), {x:p.packedXY & 15, y:p.packedXY >>> 4, facing:p.arg, visible:true});
    else if (name === 'setActorFacing') actor(p.actor).facing = p.facing;
    else if (name === 'setActorTile') {
      const item = actor(p.actor); if (p.x !== 255) item.x = p.x; if (p.y !== 255) item.y = p.y;
    } else if (['moveActorOnGrid','moveActorToTile'].includes(name)) {
      move(p.actor, p.x < 0 || p.x >= 128 ? actor(p.actor).x : p.x, p.y < 0 || p.y >= 128 ? actor(p.actor).y : p.y, p.facing ?? p.mode);
    } else if (name === 'loadSceneMap') {
      if (p.map > 0) setMap(p.map - 1, 'script');
      else if (state.mapId === null) block('map-context-required');
    } else if (name === 'queueScene') state.trace.at(-1).detail = `scene ${p.scene}`;
    else if (name === 'setSceneRuntimeMode') {
      state.phase = [4,8].includes(p.mode) ? 'battle' : 'done';
    } else if (name === 'patchEnemyHp') {state.skippedBattleSteps++; state.trace.at(-1).detail = 'battle-step-skipped';}
    else if (['fadeSceneBrightness','fadeSceneAlpha'].includes(name)) {
      state.wait = Math.max(0, p.frames ?? p.duration) * 1000 / 60;
      if (state.wait > 0) state.phase = 'waiting';
    } else if (['refreshActorFacing','selectScenePresentation','fadeSceneAudio','prepareMapView',
      'setSceneRuntimeState12','loadEncounterUnits','selectSceneEncounter','sceneNoop3B','sceneNoop3C','sceneNoop6B'].includes(name)) {
      // Explicit abstract transitions, not a claim to reproduce graphics/audio/unit initialization.
      state.trace.at(-1).detail = 'semantic-only';
    } else block(name);
  }
  function snapshot() {return structuredClone(state);}
  function step() {
    if (['battle','done','unsupported','choice','dialogue'].includes(state.phase)) return snapshot();
    if (state.phase === 'motion') {tick(state.motion.duration); return snapshot();}
    if (state.phase === 'waiting') {tick(state.wait); return snapshot();}
    if (++state.stepCount > maxSteps) {block('execution-limit'); return snapshot();}
    try { if (state.mode === 'native') advanceNative(); else advanceAuthoring(); }
    catch (error) {block(error.message);}
    return snapshot();
  }
  function tick(ms) {
    check(Number.isFinite(ms) && ms >= 0 && ms <= 600000, 'Invalid simulation time');
    if (state.phase === 'motion') {
      const m = state.motion, item = actor(m.actor);
      m.elapsed = Math.min(m.duration, m.elapsed + ms);
      const ratio = m.duration ? m.elapsed / m.duration : 1;
      item.x = m.fromX + (m.x - m.fromX) * ratio; item.y = m.fromY + (m.y - m.fromY) * ratio;
      if (ratio === 1) {item.facing = m.facing; state.motion = null; state.phase = 'ready';}
    } else if (state.phase === 'waiting') {
      state.wait = Math.max(0, state.wait - ms); if (!state.wait) state.phase = 'ready';
    }
    for (const task of tasks) task.delay = Math.max(0, task.delay - ms);
    return snapshot();
  }
  function confirm() {if (state.phase === 'dialogue') {state.dialogue = null; state.phase = 'ready';} return snapshot();}
  function choose(index) {
    check(state.phase === 'choice', 'There is no active choice'); integer(index, 0, 1, 'Choice');
    if (state.choice.native) menuResult = index;
    else {
      const route = index === 0 ? pendingChoice.first : pendingChoice.second;
      sequence.splice(position, 0, ...nodes(route.steps, `${pendingChoice.path}.${index}`));
    }
    trace('choice', state.choice.labels[index], state.choice.path);
    state.choice = null; state.phase = 'ready'; return snapshot();
  }
  function cancel() {
    if (state.phase !== 'choice') return snapshot();
    if (state.choice.native) {menuResult = 255; state.choice = null; state.phase = 'ready';}
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
  return Object.freeze({snapshot, step, tick, confirm, choose, cancel, skip,
    setFlag(id, enabled) {integer(id,0,1535,'Flag');state.flags[id] = Boolean(enabled);return snapshot();},
    setMap(id) {setMap(id,'explicit');if(state.phase === 'unsupported' && state.message === 'map-context-required') {state.phase='ready';state.message=null;}return snapshot();},
  });
}
