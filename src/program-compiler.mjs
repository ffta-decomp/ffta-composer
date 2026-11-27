// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import {check, concat, eq, integer, put16} from './binary.mjs';
import {PROFILE} from './profile.mjs';
import {programKey} from './rom.mjs';
import {lowerVmInstruction} from './vm-instructions.mjs';

function fields(object, keys, label) {
  check(object && typeof object === 'object' && !Array.isArray(object), `${label} must be an object`);
  for (const key of Object.keys(object)) check(keys.includes(key), `Unknown ${label} field: ${key}`);
}

const actorSetupOpcodes = new Set([0x2e, 0x30]);
function isActorSetup(command, actor) {
  return command.operation === 'native'
    ? actorSetupOpcodes.has(command.opcode) && command.operands[0] === actor
    : command.operation === 'playActorAction' && command.operands.actor === actor;
}

/** Resolve a read-only ROM reference, stopping before unrelated actors or control flow. */
function resolveActorReference(command, rom) {
  check(command.opcode === undefined, 'Actor references do not accept opcode overrides');
  const {operands} = command;
  fields(operands, ['scene', 'actor', 'setup'], 'actor reference');
  check(operands.setup === undefined || operands.setup === 'initial', 'Actor setup must be initial');
  const scene = rom.scenes[integer(operands.scene, 1, PROFILE.index.count - 1, 'Source scene')];
  const actor = integer(operands.actor, 2, 254, 'Source actor');
  check(scene?.script, 'Actor source scene is unavailable');
  const source = rom.programs.get(programKey(scene.script.group, scene.script.program));
  check(source?.commands?.length, 'Actor source program is unavailable');
  const matches = source.commands.filter(c => c.operation === 'native' && c.opcode === 0x1f && c.operands[0] === actor);
  check(matches.length === 1, 'Actor reference requires one unchanged native creation instruction');
  let end = source.commands.indexOf(matches[0]) + 1;
  if (operands.setup === 'initial') {
    while (end < source.commands.length && isActorSetup(source.commands[end], actor)) end++;
  }
  const endOffset = source.commands[end]?.offset ?? source.end - source.offset;
  return rom.bytes.slice(source.offset + matches[0].offset, source.offset + endOffset);
}

export function compileInstructions(commands, specs, original, rom) {
  check(Array.isArray(commands) && commands.length > 0 && commands.length <= 32767, 'Invalid instruction list');
  commands = commands.map(command=>{
    // Projects written before 0x16 had a named definition retain their raw form.
    if(command?.operation==='native'&&command.opcode===0x16){
      fields(command,['operation','opcode','operands'],'legacy frame wait');
      check(Array.isArray(command.operands)&&command.operands.length===2,'Wrong native operand count');
      const [low,high]=command.operands.map(value=>integer(value,0,255,'Native operand'));
      return {operation:'waitFrames16',operands:{frames:low|(high<<8)}};
    }
    return lowerVmInstruction(command);
  });
  const byName = new Map([...specs.values()].filter(spec => spec.operands).map(spec => [spec.operation, spec]));
  const offsets = new Set();
  const branches = [];
  let offset = 0;
  let opaque = false;
  const parts = commands.map((command, index) => {
    fields(command, ['operation', 'opcode', 'operands'], 'instruction');
    const { operation, operands } = command;
    if (operation === 'borrowSceneActor') {
      const bytes = resolveActorReference(command, rom);
      offsets.add(offset);
      offset += bytes.length;
      return bytes;
    }
    const spec = operation === 'native' ? specs.get(command.opcode) : byName.get(operation);
    check(spec && (operation !== 'native' || !spec.operands), `Invalid instruction at row ${index + 1}`);
    const bytes = new Uint8Array(spec.size);
    bytes[0] = spec.opcode;
    offsets.add(offset);
    if (operation === 'native') {
      opaque = true;
      check(Array.isArray(operands) && operands.length === spec.size - 1, 'Wrong native operand count');
      operands.forEach((value, i) => { bytes[i + 1] = integer(value, 0, 255, 'Native operand'); });
    } else {
      check(command.opcode === undefined, 'Named instructions do not accept an opcode override');
      fields(operands, spec.operands.map(arg => arg.key), 'operands');
      let at = 1;
      for (const arg of spec.operands) {
        const max = arg.key === 'bit' ? 15 : arg.size === 1 ? 255 : arg.signed ? 32767 : 65535;
        const value = integer(operands[arg.key], arg.signed ? -32768 : 0, max, arg.key);
        if (arg.size === 1) bytes[at] = value;
        else put16(bytes, at, value);
        at += arg.size;
      }
      if (operation === 'adjustScriptOffset' || operation === 'addOffsetWhenTargetFlagSet') {
        branches.push({ index, offset, target: offset + bytes.length + operands.delta });
      }
    }
    offset += bytes.length;
    return bytes;
  });
  check(offset <= 32767, 'Program exceeds the 16-bit signed instruction range');
  const final = commands.at(-1);
  check(original || ['finishSceneTask', 'adjustScriptOffset', 'setSceneRuntimeMode'].includes(final.operation), 'New program needs a terminal instruction');
  if (opaque) {
    check(original?.commands.length === commands.length && original.end - original.offset === offset, 'Opaque instructions require a native source program with identical layout');
    commands.forEach((command, index) => {
      const old = original.commands[index];
      check(parts[index][0] === (old.operation === 'native' ? old.opcode : byName.get(old.operation).opcode), 'Changing opcode in an opaque script would invalidate native control flow');
      if (command.operation === 'native') {
        check(eq(command.operands, old.operands), 'Unresolved instruction operands are preserved as observed');
      }
    });
  }
  const sameLayout = original?.commands.length === commands.length &&
    original.end - original.offset === offset && original.commands.every(command => offsets.has(command.offset));
  for (const branch of branches) {
    const observed = original?.commands[branch.index];
    if (sameLayout && observed.offset === branch.offset && observed.operands.delta === commands[branch.index].operands.delta) continue;
    check(offsets.has(branch.target), `Branch on instruction ${branch.index + 1} must land on an instruction boundary`);
  }
  return concat(parts);
}
