import { check, concat, integer, put16 } from './binary.mjs';
import { PROFILE } from './profile.mjs';
import { lineKey, programKey } from './rom.mjs';

const SAY = 0x0f;
const JUMP = 0x19;
const JUMP_IF_GAME_FLAG = 0x65;

function entries(record, label) {
  check(record && typeof record === 'object' && !Array.isArray(record), `Invalid ${label}`);
  return Object.entries(record);
}

function fields(record, required, optional, label) {
  const keys = entries(record, label).map(([key]) => key);
  check(required.every(key => Object.hasOwn(record, key)) &&
    keys.every(key => required.includes(key) || optional.includes(key)), `Invalid fields in ${label}`);
}

function symbol(name, subject) {
  check(/^[a-z][a-z0-9-]{0,63}$/.test(name), `Invalid ${subject}: ${name}`);
}

function sourceDialogue(commands, selector, occurrence) {
  return commands.filter(command => command.operation === 'say' &&
    command.operands.textSelector === selector)[occurrence - 1];
}

function compileBeats(recipe, addLine, anchor, commands) {
  const bindings = recipe.flags === undefined ? {} : recipe.flags;
  for (const [name, id] of entries(bindings, 'flag bindings')) {
    symbol(name, 'flag name');
    // The original game bit field is 0xC0 bytes. Authoring only reads it.
    integer(id, 0, 1535, 'Native story flag');
  }

  const speakers = new Map();
  const cast = recipe.speakers === undefined ? {} : recipe.speakers;
  for (const [name, binding] of entries(cast, 'speaker bindings')) {
    symbol(name, 'speaker name');
    fields(binding, ['dialogue'], ['occurrence'], 'speaker binding');
    const line = integer(binding.dialogue, 0, 239, 'Speaker dialogue selector');
    const occurrence = integer(binding.occurrence ?? 1, 1, 240, 'Speaker dialogue occurrence');
    const command = sourceDialogue(commands, line, occurrence);
    check(command, `Speaker ${name} is missing from the native scene`);
    speakers.set(name, command.operands);
  }

  let count = 0;
  function compile(nodes, depth) {
    check(Array.isArray(nodes) && depth <= 8, 'Expected a list of story steps with at most eight nested branches');
    const parts = [];
    for (const node of nodes) {
      check(++count <= 128, 'The story fragment exceeds 128 steps');
      if (node?.type === 'say') {
        fields(node, ['type', 'text'], ['speaker'], 'dialogue step');
        check(typeof node.text === 'string' && node.text.trim() && node.text.length <= 160,
          'Story dialogue must contain 1–160 characters');
        const speaker = node.speaker === undefined ? anchor : speakers.get(node.speaker);
        check(speaker, `Undeclared story speaker: ${node.speaker}`);
        parts.push(Uint8Array.of(SAY, addLine(node.text), speaker.speakerHandle, speaker.presentationFlags));
        continue;
      }
      fields(node, ['type', 'flag', 'then'], ['else'], 'conditional step');
      check(node.type === 'if' && typeof node.flag === 'string' && Object.hasOwn(bindings, node.flag),
        'A condition must reference a declared native story flag');
      const on = compile(node.then, depth + 1);
      const off = compile(node.else === undefined ? [] : node.else, depth + 1);
      check(on.length || off.length, 'A conditional step needs at least one nonempty branch');
      // In the native VM jump deltas are relative to the next instruction.
      const branch = Uint8Array.of(JUMP_IF_GAME_FLAG, 0, 0, 0, 0);
      put16(branch, 1, bindings[node.flag]);
      put16(branch, 3, off.length + 3);
      const skip = Uint8Array.of(JUMP, 0, 0);
      put16(skip, 1, on.length);
      parts.push(branch, off, skip, on);
    }
    return concat(parts);
  }
  const bytes = compile(recipe.steps, 0);
  check(bytes.length, 'A story fragment needs at least one step');
  return bytes;
}

// Bind to a proven native dialogue point and continue it under the same scene context.
// A clone makes the fragment local even if several retail scenes share that script or page.
export function lowerStoryEdits(rom, project) {
  const recipes = project.storyEdits === undefined ? {} : project.storyEdits;
  const ordered = entries(recipes, 'story edits').sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const blocks = new Map();
  const changes = [];
  if (!ordered.length) return { project, blocks, changes };
  const effective = structuredClone(project);
  for (const [name, recipe] of ordered) {
    symbol(name, 'story edit');
    fields(recipe, ['title', 'trigger', 'steps', 'resume'], ['flags', 'speakers'], 'story edit');
    check(typeof recipe.title === 'string' && recipe.title.trim() && recipe.title.length <= 80, 'Invalid story title');
    check(recipe.resume === 'original', 'A story fragment must resume the native scene');
    fields(recipe.trigger, ['scene', 'beforeDialogue'], ['occurrence'], 'story trigger');
    const id = integer(recipe.trigger.scene, 1, PROFILE.index.count - 1, 'Native scene ID');
    const selector = integer(recipe.trigger.beforeDialogue, 0, 239, 'Native dialogue selector');
    const occurrence = integer(recipe.trigger.occurrence ?? 1, 1, 240, 'Dialogue occurrence');
    check(!Object.hasOwn(effective.scenes, id), `Scene ${id} already has an authored or direct edit`);
    const scene = rom.scenes[id];
    const source = programKey(scene.script.group, scene.script.program);
    const original = rom.programs.get(source);
    check(original?.commands.length && !Object.hasOwn(effective.programs, source),
      `Story entry requires an unchanged native script for scene ${id}`);
    const anchor = sourceDialogue(original.commands, selector, occurrence);
    check(anchor, `Dialogue ${selector}, occurrence ${occurrence} is missing from scene ${id}`);
    const sourcePage = String(scene.dialoguePage);
    const records = rom.pages.get(sourcePage)?.records;
    check(records?.[selector] && !Object.keys(project.dialogue).some(key => key.split(':')[0] === sourcePage),
      `Story entry requires an unchanged, nonvariant dialogue page for scene ${id}`);
    const page = integer(PROFILE.dialogue.pages + Object.keys(effective.pages).length, PROFILE.dialogue.pages, 255, 'New dialogue page');
    const group = scene.script.group;
    let program = rom.directories[group].slotCount;
    while (Object.hasOwn(effective.programs, programKey(group, program))) program++;
    integer(program, 0, 255, 'New program slot');
    const key = programKey(group, program);
    check(!Object.keys(effective.dialogue).some(line => line.split(':')[0] === String(page)) &&
      !Object.values(effective.scenes).some(reference => reference.dialoguePage === page ||
        (reference.script && programKey(reference.script.group, reference.script.program) === key)),
    'Generated story resources cannot be referenced by direct edits');
    effective.pages[page] = { cloneFrom: sourcePage };
    effective.programs[key] = { cloneFrom: source };
    effective.scenes[id] = { script: { group, program }, dialoguePage: page };
    let line = records.length;
    const bytes = compileBeats(recipe, text => {
      const newLine = integer(line++, 0, 239, 'New story dialogue selector');
      effective.dialogue[lineKey(page, newLine)] = { text, flags: records[selector].flags };
      return newLine;
    }, anchor.operands, original.commands);
    blocks.set(key, new Map([[anchor.offset, bytes]]));
    changes.push({ kind: 'story', target: name, action: 'add', before: null, after: recipe });
  }
  return { project: effective, blocks, changes };
}
