// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — https://github.com/ffta-decomp/ffta-composer ; see LICENSE and NOTICE.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { u32 } from '../src/binary.mjs';
import { build, importProject, openRom, plan, previewBuild } from '../src/project.mjs';
import { decodeInstructions, programKey } from '../src/rom.mjs';
import { describeStory } from '../src/story.mjs';

const source = process.env.FFTA_US_ROM;
const example = new URL('../examples/herb-field-report.json', import.meta.url);

test('the declared Herb Picking story compiles both branches and resumes its original anchor', { skip: !source }, async () => {
  const { rom, project: empty } = await openRom(new Uint8Array(await readFile(source)));
  const configured = JSON.parse(await readFile(example, 'utf8'));
  const project = importProject(rom, empty, configured);
  const changes = plan(rom, project);
  const originalScene = rom.scenes[15];
  const originalScript = rom.programs.get(programKey(originalScene.script.group, originalScene.script.program));
  const originalSay = originalScript.commands.find(step => step.operation === 'say' && step.operands.textSelector === 7);
  const changedScene = changes.scenes.get(15);
  const key = programKey(changedScene.script.group, changedScene.script.program);
  const bytes = changes.programs.get(key).bytes;
  const commands = new Map(decodeInstructions(bytes, rom.specs).map(step => [step.offset, step]));
  const script = describeStory(rom, changes, 15);
  const first = script.steps.findIndex(step => step.kind === 'authored');
  assert.equal(script.steps[first + 1].textSelector, 7);
  assert.equal(script.steps[first].recipe.title, 'Herb Picking Field Report');
  assert.notEqual(changedScene.dialoguePage, originalScene.dialoguePage);
  assert.deepEqual([...changes.scenes.keys()], [15]);
  assert.equal(changes.programs.size, 1);

  const variant = enabled => {
    const spoken = [];
    let offset = originalSay.offset;
    for (let steps = 0; steps < 16; steps++) {
      if (offset === originalSay.offset + 4) return spoken;
      const op = commands.get(offset);
      if (op.operation === 'adjustScriptOffset') offset += 3 + op.operands.delta;
      else if (op.operation === 'native' && op.opcode === 0x65) {
        const [flag, flagHigh, delta, deltaHigh] = op.operands;
        assert.equal(flag | flagHigh << 8, 589);
        offset += 5 + (enabled ? delta | deltaHigh << 8 : 0);
      } else if (op.operation === 'say') {
        assert.equal(op.operands.speakerHandle, originalSay.operands.speakerHandle);
        spoken.push(op.operands.textSelector);
        offset += 4;
      } else assert.fail(`Unexpected instruction at ${offset}`);
    }
    assert.fail('The fragment never returned to the original scene');
  };
  const appended = rom.pages.get(String(originalScene.dialoguePage)).records.length;
  assert.deepEqual(variant(true), [appended, appended + 1, appended + 3, 7]);
  assert.deepEqual(variant(false), [appended, appended + 2, appended + 3, 7]);
  const output = build(rom, project);
  const changedHeader = new Set(output.pointers.flatMap(pointer =>
    Array.from({ length: 4 }, (_, i) => pointer.offset + i)));
  for (const pointer of output.pointers) assert.equal(u32(output.bytes, pointer.offset), pointer.after);
  assert.ok(rom.bytes.every((byte, i) => changedHeader.has(i) || output.bytes[i] === byte));
  assert.deepEqual((await openRom(output.bytes)).project, project);

  const arrival = JSON.parse(await readFile(new URL('../examples/herb-arrival.json', import.meta.url), 'utf8'));
  const combined = plan(rom, importProject(rom, project, arrival));
  assert.deepEqual([...combined.scenes.keys()], [14, 15]);
  assert.notEqual(combined.scenes.get(14).dialoguePage, combined.scenes.get(15).dialoguePage);
  const arrivalScene = combined.scenes.get(14);
  const arrivalCommands = decodeInstructions(combined.programs.get(programKey(
    arrivalScene.script.group, arrivalScene.script.program)).bytes, rom.specs);
  const montblanc = arrivalCommands.find(command => command.operation === 'say' &&
    command.operands.textSelector === appended + 3);
  assert.deepEqual(montblanc.operands, { textSelector: appended + 3, speakerHandle: 8, presentationFlags: 144 });

  const invalid = structuredClone(configured);
  invalid.storyEdits['herb-field-report'].trigger.beforeDialogue = 239;
  assert.throws(() => importProject(rom, empty, invalid), /missing from scene 15/);
  invalid.storyEdits['herb-field-report'].trigger.beforeDialogue = 7;
  invalid.storyEdits['herb-field-report'].steps[1].flag = 'missing';
  assert.throws(() => importProject(rom, empty, invalid), /declared native story flag/);
  assert.equal(previewBuild(rom, empty).changes.length, 0);
});
