// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — https://github.com/ffta-decomp/ffta-composer ; see LICENSE and NOTICE.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { u16, u32 } from '../src/binary.mjs';
import { PROFILE } from '../src/profile.mjs';
import { build, importProject, openRom, plan } from '../src/project.mjs';
import { formatProjectText, parseProjectText } from '../src/project-text.mjs';
import { programKey } from '../src/rom.mjs';
import { READ_MENU_CHOICE, SET_ENCOUNTER_HP, STORY_VM_TABLE, storyRuntimeCode } from '../src/story-runtime.mjs';
import { readLine } from '../src/text.mjs';

const readExample = async format => parseProjectText(await readFile(
  new URL(`../examples/herb-ward.${format}`, import.meta.url), 'utf8'));
const source = process.env.FFTA_US_ROM;

test('nested choice fixtures preserve the complete JSON and Lua model', async () => {
  const json = await readExample('json');
  assert.deepEqual(await readExample('lua'), json);
  assert.deepEqual(parseProjectText(formatProjectText(json, 'lua')), json);
  const schema = JSON.parse(await readFile(new URL('../schemas/project.schema.json', import.meta.url)));
  assert.equal(schema.$defs.storyEdit.properties.enemies.additionalProperties.properties.slot.maximum, 3);
});

test('four compiled menu routes set HP and return to the original dialogue', { skip: !source }, async () => {
  const { rom, project: empty } = await openRom(await readFile(source));
  const project = importProject(rom, empty, await readExample('json'));
  const change = plan(rom, project);
  const scene = change.scenes.get(14);
  const bytes = change.programs.get(programKey(scene.script.group, scene.script.program)).bytes;
  const original = rom.programs.get('2/1');
  const anchor = original.commands.find(command => command.operation === 'say' && command.operands.textSelector === 5);
  const compiledPage = change.dialogue.get(String(scene.dialoguePage));
  const line = selector => readLine(compiledPage, u16(compiledPage, selector * 2), compiledPage.length);
  const signed = at => u16(bytes, at) << 16 >> 16;

  // Walk emitted control flow, not the authoring tree. This checks branch deltas,
  // dialogue resources and return addresses; it does not execute the Thumb code.
  for (const [choices, expected] of [ [[0, 0], 12], [[0, 1], 28], [[1, 0], 52], [[1, 1], 72] ]) {
    let pc = anchor.offset;
    let menus = 0;
    const writes = [];
    const spoken = [];
    for (let budget = 0; budget < 40 && pc !== anchor.offset + 4; budget++) {
      switch (bytes[pc]) {
        case 0x19: pc += 3 + signed(pc + 1); break;
        case 0x0f: {
          const record = line(bytes[pc + 1]);
          spoken.push(record.preview);
          const control = record.tokens.find(token => token.kind === 'control' && token.code === 0x32);
          if (control) {
            assert.deepEqual(control.args, [0x10]);
            assert.equal(record.tokens.filter(token => token.kind === 'separator').length, 2);
            assert.equal(bytes[pc + 4], READ_MENU_CHOICE);
          }
          pc += 4;
          break;
        }
        case READ_MENU_CHOICE:
          assert.ok(menus < choices.length);
          pc += 5 + signed(pc + (choices[menus++] === 0 ? 1 : 3));
          break;
        case SET_ENCOUNTER_HP:
          writes.push([bytes[pc + 1], u16(bytes, pc + 2)]);
          pc += 4;
          break;
        default: assert.fail(`Unexpected opcode ${bytes[pc]} at ${pc}`);
      }
    }
    assert.equal(pc, anchor.offset + 4, 'Every route must resume immediately after the original say');
    assert.equal(menus, 2);
    assert.deepEqual(writes, [[0, expected]]);
    assert.ok(spoken.some(text => text.includes(`${expected} HP`)));
    assert.equal(spoken.at(-1), rom.pages.get('3').records[5].preview);
  }

  const jsonBuild = build(rom, project);
  const luaProject = importProject(rom, empty, await readExample('lua'));
  assert.deepEqual(build(rom, luaProject).bytes, jsonBuild.bytes);
  const runtime = jsonBuild.allocations.find(item => item.kind === 'storyRuntime');
  const table = jsonBuild.allocations.find(item => item.kind === 'sceneVmDescriptors');
  assert.deepEqual(jsonBuild.bytes.slice(runtime.offset, runtime.offset + runtime.length), storyRuntimeCode);
  assert.equal(u32(jsonBuild.bytes, STORY_VM_TABLE.pointer), PROFILE.bus + table.offset);
  assert.deepEqual(jsonBuild.bytes.slice(table.offset, table.offset + READ_MENU_CHOICE * 6),
    rom.bytes.slice(STORY_VM_TABLE.start, STORY_VM_TABLE.start + READ_MENU_CHOICE * 6));
  for (const [opcode, size, entry] of [[READ_MENU_CHOICE, 5, 0], [SET_ENCOUNTER_HP, 4, 0x30]]) {
    assert.equal(u16(jsonBuild.bytes, table.offset + opcode * 6), size);
    assert.equal(u32(jsonBuild.bytes, table.offset + opcode * 6 + 2), PROFILE.bus + runtime.offset + entry + 1);
  }
  const restoredPrefix = jsonBuild.bytes.slice(0, PROFILE.size);
  for (const pointer of jsonBuild.pointers) restoredPrefix.set(rom.bytes.subarray(pointer.offset, pointer.offset + 4), pointer.offset);
  assert.deepEqual(restoredPrefix, rom.bytes);
  assert.ok(jsonBuild.allocations.every(item => item.offset >= PROFILE.size));
  const reopened = await openRom(jsonBuild.bytes);
  assert.deepEqual(reopened.project, project);
  assert.deepEqual(reopened.rom.bytes, rom.bytes);
  assert.deepEqual(build(reopened.rom, reopened.project).bytes, jsonBuild.bytes);
  const damaged = jsonBuild.bytes.slice();
  damaged[runtime.offset] ^= 1;
  await assert.rejects(openRom(damaged), /embedded project/);
});

test('interactive stories require opt-in and a verified encounter with valid bounds', { skip: !source }, async () => {
  const { rom, project: empty } = await openRom(await readFile(source));
  const example = await readExample('json');
  const rejects = (mutate, pattern) => {
    const data = structuredClone(example);
    mutate(data, data.storyEdits['herb-ward']);
    assert.throws(() => importProject(rom, empty, data), pattern);
    assert.deepEqual(empty.storyEdits, undefined, 'A failed import cannot mutate the current project');
  };
  rejects(data => delete data.patches, /Enable the Story Choices patch/);
  rejects(data => { data.patches.storyChoices = false; }, /Enable the Story Choices patch/);
  rejects(data => { data.patches.storyChoices = 1; }, /must be a boolean/);
  rejects((data, story) => { story.enemies.captain.slot = 4; }, /not verified/);
  rejects((data, story) => { story.steps = [{type: 'enemyHp', enemy: 'captain', hp: 0}]; }, /Encounter HP/);
  rejects((data, story) => { story.steps = [{type: 'enemyHp', enemy: 'captain', hp: 1000}]; }, /Encounter HP/);
  rejects((data, story) => { story.steps = [{type: 'enemyHp', enemy: 'absent', hp: 12}]; }, /Undeclared story enemy/);
  rejects((data, story) => { story.steps[2].first.label = 'Too long a label'; }, /short line/);
  rejects((data, story) => { story.steps[2].prompt = 'one\ntwo\nthree'; }, /fit above/);
  rejects((data, story) => { story.steps[2].first.steps = []; }, /at least one step/);
  rejects((data, story) => { delete story.enemies; story.trigger.scene = 15; story.trigger.beforeDialogue = 7; delete story.speakers; story.steps = [story.steps[2]]; }, /verified retail encounter/);

  const unused = structuredClone(empty);
  unused.patches = {storyChoices: true};
  assert.deepEqual(build(rom, unused).bytes, rom.bytes);
  const arrival = parseProjectText(await readFile(new URL('../examples/herb-arrival.json', import.meta.url), 'utf8'));
  const native = importProject(rom, empty, arrival);
  const withOption = structuredClone(native);
  withOption.patches = {storyChoices: true};
  for (const output of [build(rom, native), build(rom, withOption)]) {
    assert.equal(u32(output.bytes, STORY_VM_TABLE.pointer), PROFILE.bus + STORY_VM_TABLE.start);
    assert.ok(!output.allocations.some(item => ['storyRuntime', 'sceneVmDescriptors'].includes(item.kind)));
  }
  assert.equal(plan(rom, native).storyRuntime, false);

  const mod = rom.bytes.slice();
  mod[0x400000] ^= 1;
  const {rom: layout, project: base} = await openRom(mod);
  const forMod = {...example, profile: layout.profile, baseSha256: layout.sha256};
  assert.throws(() => importProject(layout, base, forMod), /not verified/);
  assert.deepEqual(build(layout, {...base, patches: {storyChoices: true}}).bytes, mod);
});
