// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — https://github.com/ffta-decomp/ffta-composer ; see LICENSE and NOTICE.
import { PROFILE } from './profile.mjs';
import { STORY_VM_TABLE } from './story-runtime.mjs';
import { compileInstructions } from './program-compiler.mjs';
import { align, check, concat, digest, eq, integer, put16, put32, u16, u32 } from './binary.mjs';
import { decodeInstructions, lineKey, openUSRom, pageKey, programKey, withCharacterTable } from './rom.mjs';
import { normalizeCharacterTable } from './character-table.mjs';
import { defaultCharacterTable } from './character-table-presets.mjs';
import { encodeLine, makePage, plainTokens, preview } from './text.mjs';
import { lowerOpening, OPENING_BANNER, OPENING_ID, OPENING_OUTCOME, OPENING_ROSTER } from './opening.mjs';
import { appendBeforeDialogue, insertDialogue } from './insertion.mjs';
import { lowerStoryEdits } from './authoring.mjs';
import { BATTLE_EVENT_CAPABILITIES, validateBattleEvent } from './battle.mjs';

export const FORMAT = 'ffta.scene-project/v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const footer = encoder.encode('FFTASCENE-V1');

export function newProject(rom = { profile: PROFILE.id, sha256: PROFILE.sha256 }) {
  const characterTable=defaultCharacterTable(rom);
  return { format: FORMAT, profile: rom.profile, baseSha256: rom.sha256, scenes: {}, programs: {}, dialogue: {}, pages: {}, battleEvents: {}, openings: {},
    ...(characterTable?{characterTable}:{}) };
}

function fields(object, keys, label) {
  check(object && typeof object === 'object' && !Array.isArray(object), `${label} must be an object`);
  for (const key of Object.keys(object)) check(keys.includes(key), `Unknown ${label} field: ${key}`);
}

function collection(value, label) {
  check(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return Object.entries(value);
}

function compareKeys(a, b) {
  return a.localeCompare(b, 'en', { numeric: true });
}


export function plan(rom, project) {
  fields(project, ['format', 'profile', 'baseSha256', 'scenes', 'programs', 'dialogue', 'pages', 'battleEvents', 'openings', 'storyEdits', 'patches', 'characterTable'], 'project');
  rom=withCharacterTable(rom,project.characterTable);
  check(project.format === FORMAT && project.profile === rom.profile && project.baseSha256 === rom.sha256, 'Project base ROM/profile mismatch');
  if (rom.profile !== PROFILE.id) {
    check(!collection(project.openings ?? {}, 'openings').length &&
      !collection(project.battleEvents ?? {}, 'battleEvents').length,
    'Opening replacement and battle diagnostics require the verified retail profile');
  }
  if (project.patches !== undefined) {
    fields(project.patches, ['storyChoices'], 'patch options');
    check(!Object.hasOwn(project.patches, 'storyChoices') || typeof project.patches.storyChoices === 'boolean',
      'The Story Choices patch option must be a boolean');
    check(project.patches.storyChoices !== true, 'Custom runtime instructions are reserved and currently disabled');
  }
  const authored = lowerOpening(rom, project);
  const authoredStories = lowerStoryEdits(rom, authored.project);
  project = authoredStories.project;
  const scenes = new Map();
  const programs = new Map();
  const pages = new Map();
  const dialogue = new Map();
  const diffs = [...authoredStories.changes];
  if (authored.opening) diffs.push({ kind: 'opening', target: OPENING_ID, action: 'replace', before: null, after: authored.opening });
  const battles = new Map();
  for (const [id, event] of collection(project.battleEvents ?? {}, 'battleEvents')) {
    const after = validateBattleEvent(id, event);
    battles.set(id, after);
    diffs.push({ kind: 'battle', target: id, action: 'add', before: null, after });
  }

  for (const [key, data] of collection(project.programs, 'programs').sort(([a], [b]) => compareKeys(a, b))) {
    check(/^\d+\/\d+$/.test(key), 'Programs use group/program keys');
    const [group, program] = key.split('/').map(Number);
    check(programKey(group, program) === key, 'Program key is not canonical');
    integer(group, 0, rom.directories.length - 1, 'Script group');
    integer(program, 0, 255, 'Script program');
    fields(data, ['cloneFrom', 'instructions', 'insertDialogue'], 'program');
    const existing = rom.programs.get(key);
    const source = data.cloneFrom === undefined ? existing : rom.programs.get(data.cloneFrom);
    check(data.cloneFrom === undefined || source?.commands.length > 0, 'Clone source must be an executable retail program');
    const baseBytes = data.instructions === undefined && source
      ? rom.bytes.subarray(source.offset, source.end)
      : compileInstructions(data.instructions, rom.specs, source, rom);
    check(baseBytes.length > 0, 'Program cannot be empty');
    const commands = decodeInstructions(baseBytes, rom.specs);
    const blocks = authoredStories.blocks.get(key);
    const { bytes, insertions } = blocks
      ? { bytes: appendBeforeDialogue(baseBytes, commands, blocks), insertions: [] }
      : insertDialogue(baseBytes, commands, data.insertDialogue ?? []);
    if (existing && eq(bytes, rom.bytes.subarray(existing.offset, existing.end))) continue;
    programs.set(key, { group, program, bytes, commands, insertions });
    diffs.push({ kind: 'program', target: key, action: existing ? 'replace' : 'add',
      before: existing ? { bytes: existing.end - existing.offset, offset: existing.offset,
        instructions: data.instructions ? existing.commands : undefined } : null,
      after: { bytes: bytes.length, cloneFrom: data.cloneFrom ?? null, instructions: data.instructions ?? null, insertDialogue: insertions } });
  }

  const existingPageCount = PROFILE.dialogue.pages;
  let nextPage = existingPageCount;
  for (const [key, data] of collection(project.pages, 'pages').sort(([a], [b]) => compareKeys(a, b))) {
    const page = integer(Number(key), existingPageCount, 255, 'New dialogue page');
    check(String(page) === key && page === nextPage++, 'New dialogue pages must be contiguous, starting at 63');
    fields(data, ['cloneFrom'], 'dialogue page');
    const source = data.cloneFrom === undefined ? null : rom.pages.get(data.cloneFrom);
    check(data.cloneFrom === undefined || source, 'Dialogue page clone source does not exist');
    pages.set(key, { key, page, variant: null, records: source?.records ?? [] });
    diffs.push({ kind: 'page', target: key, action: 'add', before: null, after: { cloneFrom: data.cloneFrom ?? null } });
  }
  for (const [key, data] of collection(project.dialogue, 'dialogue').sort(([a], [b]) => compareKeys(a, b))) {
    check(/^\d+(?:\/\d+)?:\d+$/.test(key), 'Dialogue entries use page:line or page/variant:line keys');
    const [target, rawLine] = key.split(':');
    const page = pages.get(target) ?? rom.pages.get(target);
    check(page, `Dialogue page ${target} does not exist`);
    const line = integer(Number(rawLine), 0, 4094, 'Dialogue line index');
    check(lineKey(target, line) === key, 'Dialogue line key is not canonical');
    fields(data, ['text', 'tokens', 'encoding', 'flags'], 'dialogue');
    check((data.text === undefined) !== (data.tokens === undefined), 'Provide exactly one of text or tokens');
    const existing = page.records[line];
    check(!existing?.opaque, 'Unparsed source dialogue is read-only; preserve its original bytes');
    const encoding = data.encoding ?? (data.text !== undefined ? 'standard' : existing?.encoding ?? 'standard');
    const tokens = data.tokens ?? (existing && existing.encoding===encoding && data.text===existing.preview
      ? existing.tokens : plainTokens(data.text, encoding, rom.characterTable));
    const flags = integer(data.flags ?? existing?.flags ?? 0x10,0,65535,'Dialogue flags');
    if (existing && existing.encoding === encoding && JSON.stringify(existing.tokens) === JSON.stringify(tokens) && ((flags ^ existing.flags) & ~3) === 0) continue;
    const bytes = encodeLine(tokens, encoding, flags);
    if (!dialogue.has(target)) dialogue.set(target, new Map());
    dialogue.get(target).set(line, bytes);
    diffs.push({ kind: 'dialogue', target: key, action: existing ? 'replace' : 'add',
      before: existing ? { text: existing.preview, encoding: existing.encoding, flags: existing.flags, tokens: existing.tokens } : null,
      after: { text: preview(tokens,false,rom.characterTable), encoding, flags: u16(bytes, 0), tokens } });
  }
  for (const [key, page] of [...rom.pages, ...pages]) {
    const changed = dialogue.get(key);
    if (!changed && !pages.has(key)) continue;
    const records = page.records.map(record => rom.bytes.subarray(record.start, record.end));
    for (const [line, record] of changed ?? []) {
      check(line <= records.length, `Dialogue ${key}:${line} leaves a hole in the page`);
      records[line] = record;
    }
    dialogue.set(key, makePage(records));
  }

  for (const [key, data] of collection(project.scenes, 'scenes').sort(([a], [b]) => compareKeys(a, b))) {
    const id = integer(Number(key), 1, PROFILE.index.expandableThrough, 'Scene ID');
    check(String(id) === key, 'Scene ID is not canonical');
    fields(data, ['script', 'dialoguePage'], 'scene');
    const before = rom.scenes[id];
    const script = data.script ?? before?.script;
    fields(script, ['group', 'program'], 'script link');
    const target = programKey(integer(script.group, 0, 61, 'Script group'), integer(script.program, 0, 255, 'Script program'));
    check(programs.has(target) || rom.programs.get(target)?.commands.length > 0, `Scene ${id} must reference an executable script`);
    const dialoguePage = integer(data.dialoguePage ?? before?.dialoguePage, 0, nextPage - 1, 'Scene dialogue page');
    if (before?.script.group === script.group && before.script.program === script.program && before.dialoguePage === dialoguePage) continue;
    const after = { id, script, dialoguePage, reserved: before?.reserved ?? 0 };
    scenes.set(id, after);
    diffs.push({ kind: 'scene', target: String(id), action: before ? 'replace' : 'add', before: before ?? null, after });
  }
  for (const scene of [...rom.scenes.filter(scene => !scenes.has(scene.id)), ...scenes.values()]) {
    const linked = programs.get(programKey(scene.script.group, scene.script.program));
    if (!linked?.insertions.length) continue;
    const keys = scene.dialoguePage === PROFILE.dialogue.nested
      ? Array.from({ length: 10 }, (_, variant) => pageKey(scene.dialoguePage, variant)) : [pageKey(scene.dialoguePage)];
    for (const key of keys) {
      const compiled = dialogue.get(key);
      const count = compiled ? u16(compiled, 0) / 2 - 1 : rom.pages.get(key)?.records.length;
      check(linked.insertions.every(event => event.textSelector < count), `Inserted dialogue in scene ${scene.id} references an absent line in page ${key}`);
    }
  }
  return { scenes, programs, dialogue, pages, battles, diffs, storyEdits: authoredStories.changes, storyRuntime: authoredStories.usesRuntime, openingRoster: authored.roster, openingOutcome: authored.outcome };
}

function capacity(required) {
  let size = PROFILE.size;
  // Between 16 and 32 MiB the GBA cartridge uses the 32 MiB address window.
  if (required > size) size = PROFILE.maximumSize;
  check(required <= size, 'Project exceeds the GBA 32 MiB ROM limit');
  return size;
}

export function build(rom, project) {
  return buildRom(rom, project, true);
}

function buildRom(rom, project, updateOpeningBanner) {
  const change = plan(rom, project);
  check(!change.battles.size, 'The battle event is a draft. Unit spawn, battle dialogue, and victory routing still need a native binding.');
  if (!change.diffs.length) return { bytes: rom.bytes.slice(), changes: [], pointers: [], allocations: [] };
  let cursor = PROFILE.size;
  const allocations = [];
  const pointers = [];
  function allocate(kind, target, bytes) {
    const offset = align(cursor);
    cursor = offset + bytes.length;
    allocations.push({ kind, target, offset, bytes });
    return offset;
  }
  function redirect(table, offset, kind) {
    pointers.push({ kind, offset: table.pointer, before: PROFILE.bus + table.start, after: PROFILE.bus + offset });
  }
  if (change.openingRoster) {
    redirect(OPENING_ROSTER, allocate('encounterRoster', OPENING_ID, change.openingRoster), 'encounterRoster');
    if (updateOpeningBanner) {
      const banner = rom.bytes.slice(OPENING_BANNER.start, OPENING_BANNER.end);
      banner[OPENING_BANNER.categoryOffset] = OPENING_BANNER.defeatAllEnemies;
      redirect(OPENING_BANNER, allocate('battleBanner', OPENING_ID, banner), 'battleBanner');
    }
  }
  if (change.openingOutcome) {
    redirect(OPENING_OUTCOME, allocate('battleOutcome', OPENING_ID, change.openingOutcome), 'battleOutcome');
  }
  if (change.scenes.size) {
    // Keep the native read-through values at the end of the original range.
    const rows = rom.bytes.slice(PROFILE.index.start, PROFILE.index.start + (PROFILE.index.expandableThrough + 1) * 4);
    for (const scene of change.scenes.values()) {
      rows.set([scene.script.group + 1, scene.script.program, scene.dialoguePage, scene.reserved], scene.id * 4);
    }
    redirect(PROFILE.index, allocate('sceneIndex', 'scene-index', rows), 'sceneIndex');
  }
  if (change.programs.size) {
    const groups = rom.directories.map(group => group.start);
    for (const directory of rom.directories) {
      const replacements = [...change.programs.values()].filter(item => item.group === directory.group);
      if (!replacements.length) continue;
      const count = Math.max(directory.slotCount, ...replacements.map(item => item.program + 1));
      const rows = new Uint8Array(count * 4);
      const base = allocate('programDirectory', String(directory.group), rows);
      const offsets = Array.from({ length: count }, (_, i) => i < directory.slotCount
        ? directory.start + u32(rom.bytes, directory.start + i * 4) : directory.end);
      for (const replacement of replacements) {
        offsets[replacement.program] = allocate('program', programKey(replacement.group, replacement.program), replacement.bytes);
      }
      offsets.forEach((offset, i) => put32(rows, i * 4, offset - base));
      groups[directory.group] = base;
    }
    const book = new Uint8Array(groups.length * 4);
    const base = allocate('programIndex', 'scripts', book);
    groups.forEach((offset, i) => put32(book, i * 4, offset - base));
    redirect(PROFILE.scripts, base, 'programIndex');
  }
  if (change.dialogue.size) {
    const outer = [...rom.outer];
    const children = [...rom.children];
    for (const [key, bytes] of change.dialogue) {
      const [page, variant] = key.split('/').map(Number);
      const offset = allocate('dialoguePage', key, bytes);
      if (variant === undefined) outer[page] = offset;
      else children[variant] = offset;
    }
    const variants = new Uint8Array(children.length * 4);
    const book = new Uint8Array(outer.length * 4);
    outer[PROFILE.dialogue.nested] = allocate('dialogueVariants', String(PROFILE.dialogue.nested), variants);
    const base = allocate('dialogueIndex', 'dialogue', book);
    outer.forEach((offset, i) => put32(book, i * 4, offset - base));
    children.forEach((offset, i) => put32(variants, i * 4, offset - base));
    redirect(PROFILE.dialogue, base, 'dialogueIndex');
  }
  const metadata = encoder.encode(JSON.stringify(project));
  const manifestOffset = align(cursor);
  const bytes = new Uint8Array(capacity(manifestOffset + metadata.length + footer.length + 8));
  bytes.fill(255);
  bytes.set(rom.bytes);
  for (const allocation of allocations) bytes.set(allocation.bytes, allocation.offset);
  for (const pointer of pointers) put32(bytes, pointer.offset, pointer.after);
  bytes.set(metadata, manifestOffset);
  const trailer = bytes.length - footer.length - 8;
  put32(bytes, trailer, manifestOffset);
  put32(bytes, trailer + 4, metadata.length);
  bytes.set(footer, trailer + 8);
  return { bytes, pointers, changes: change.diffs, allocations: allocations.map(({ bytes, ...item }) => ({ ...item, length: bytes.length })) };
}

export async function openRom(bytes) {
  if (bytes.length === PROFILE.size) {
    const rom = await openUSRom(bytes);
    const project=newProject(rom);
    return { rom:withCharacterTable(rom,project.characterTable), project };
  }
  check(bytes.length === PROFILE.maximumSize && eq(bytes.subarray(-footer.length), footer), 'This expanded ROM was not exported by this editor');
  const trailer = bytes.length - footer.length - 8;
  const start = u32(bytes, trailer);
  const size = u32(bytes, trailer + 4);
  check(start >= PROFILE.size && size > 0 && start + size <= trailer, 'Invalid project metadata range');
  const project = JSON.parse(decoder.decode(bytes.subarray(start, start + size)));
  const base = Uint8Array.from(bytes.subarray(0, PROFILE.size));
  for (const table of [PROFILE.index, PROFILE.scripts, PROFILE.dialogue, STORY_VM_TABLE]) put32(base, table.pointer, PROFILE.bus + table.start);
  const updatedOpeningBanner = u32(base, OPENING_BANNER.pointer) !== PROFILE.bus + OPENING_BANNER.start;
  if (project.openings?.[OPENING_ID]) {
    for (const table of [OPENING_ROSTER, OPENING_OUTCOME, OPENING_BANNER]) put32(base, table.pointer, PROFILE.bus + table.start);
  }
  const rom = await openUSRom(base);
  // Earlier exports still reproduce with the original banner pointer.
  check(eq(buildRom(rom, project, updatedOpeningBanner).bytes, bytes), 'Expanded ROM differs from its embedded project');
  return { rom:withCharacterTable(rom,project.characterTable), project };
}

/** Identify a user-supplied cartridge without allocating or writing a patch. */
export async function inspectRom(bytes) {
  check(bytes instanceof Uint8Array && bytes.length <= PROFILE.maximumSize, 'Invalid GBA input size');
  const identification = {
    gameCode: bytes.length >= 0xb0 ? String.fromCharCode(...bytes.subarray(0xac, 0xb0)) : null,
    size: bytes.length,
    sha256: await digest(bytes),
  };
  try {
    const { rom } = await openRom(bytes);
    return { ...identification, baseSha256: rom.sha256, profile: rom.profile, editable: true };
  } catch (error) {
    return { ...identification, editable: false, reason: error.message };
  }
}

export function previewBuild(rom, project) {
  const change = plan(rom, project);
  if (change.battles.size) {
    return { buildable: false, changes: change.diffs, pointers: [], allocations: [], battleCapabilities: BATTLE_EVENT_CAPABILITIES };
  }
  const { changes, pointers, allocations } = build(rom, project);
  return { buildable: true, changes, pointers, allocations };
}

/** Merge explicit fields by resource key; validate the entire candidate before committing. */
export function importProject(rom, current, incoming, mode = 'merge') {
  check(mode === 'merge' || mode === 'replace', 'Unknown import mode');
  fields(incoming, ['format', 'profile', 'baseSha256', 'scenes', 'programs', 'dialogue', 'pages', 'battleEvents', 'openings', 'storyEdits', 'patches', 'characterTable'], 'import');
  check(incoming.format === FORMAT && incoming.profile === rom.profile && incoming.baseSha256 === rom.sha256, 'Import base ROM/profile mismatch');
  const result = newProject(rom);
  delete result.characterTable;
  const mapping=Object.hasOwn(incoming,'characterTable')?incoming.characterTable:mode==='merge'?current.characterTable:defaultCharacterTable(rom)??undefined;
  if(mapping!==undefined)result.characterTable=normalizeCharacterTable(mapping);
  for (const key of ['scenes', 'programs', 'dialogue', 'pages', 'battleEvents', 'openings']) {
    const entries = Object.fromEntries(collection(incoming[key] ?? {}, key));
    result[key] = mode === 'merge' ? { ...current[key], ...entries } : entries;
  }
  if (incoming.storyEdits !== undefined || (mode === 'merge' && current.storyEdits !== undefined)) {
    const edits = Object.fromEntries(collection(incoming.storyEdits ?? {}, 'storyEdits'));
    result.storyEdits = mode === 'merge' ? { ...current.storyEdits, ...edits } : edits;
  }
  if (incoming.patches !== undefined || (mode === 'merge' && current.patches !== undefined)) {
    const patches = Object.fromEntries(collection(incoming.patches ?? {}, 'patches'));
    result.patches = mode === 'merge' ? { ...current.patches, ...patches } : patches;
  }
  plan(rom, result);
  return result;
}
