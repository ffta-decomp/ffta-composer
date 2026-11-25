// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — https://github.com/ffta-decomp/ffta-composer ; see LICENSE and NOTICE.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DEMO_ID, snowballDemo } from '../src/battle.mjs';
import { openingExample, OPENING_ID } from '../src/opening.mjs';
import { formatProjectText, parseProjectText } from '../src/project-text.mjs';
import { build, importProject, newProject, openRom, previewBuild } from '../src/project.mjs';
import { plainTokens } from '../src/text.mjs';

const example = format => new URL(`../examples/herb-arrival.${format}`, import.meta.url);
const read = async format => parseProjectText(await readFile(example(format), 'utf8'));

test('Lua and JSON represent every project collection without losing map or list types', async () => {
  const project = { ...newProject(), ...await read('json') };
  project.openings[OPENING_ID] = openingExample();
  project.battleEvents[DEMO_ID] = snowballDemo();
  project.pages[63] = { cloneFrom: '61/0' };
  project.scenes[234] = { script: { group: 0, program: 12 }, dialoguePage: 63 };
  project.programs['0/12'] = {
    cloneFrom: '0/0',
    instructions: [
      { operation: 'native', opcode: 0x65, operands: [0x40, 0, 2, 0] },
      { operation: 'native', opcode: 0x51, operands: [] },
      { operation: 'adjustScriptOffset', operands: { delta: -5 } },
      { operation: 'finishSceneTask', operands: {} },
    ],
    insertDialogue: [{ anchorOffset: 44, textSelector: 12, speakerHandle: 128, presentationFlags: 164 }],
  };
  project.dialogue['63:1'] = { encoding: 'standard', flags: 16, tokens: plainTokens('One line.\nTwo lines.') };
  project.dialogue['63:2'] = { tokens: [
    { kind: 'control', code: 69, args: [5], side: 'left' }, { kind: 'separator' },
    { kind: 'glyph', code: 100, width: 'half' },
  ] };
  const lua = formatProjectText(project, 'lua');
  assert.match(lua, /native\(81, list\(\)\)/);
  assert.match(lua, /op\("finishSceneTask", \{\}\)/);
  assert.match(lua, /control\(69, \{5\}, "left"\)/);
  assert.match(lua, /separator\(\)/);
  assert.match(lua, /glyph\(100, "half"\)/);
  const fromLua = parseProjectText(lua);
  assert.deepEqual(fromLua, project);
  assert.equal(formatProjectText(fromLua), formatProjectText(project));
  assert.equal(formatProjectText(fromLua, 'lua'), lua);
  assert.deepEqual(await read('lua'), await read('json'));
});

test('Lua literals preserve data exactly and executable statements are rejected', () => {
  const data = {
    ['__proto__']: 'a field', end: '引号"、换行\n、反斜杠\\、制表符\t、空字节\x00',
    Unicode: '⌘🗺\ud800', values: [null, false, true, -123, 1e22, 0.25, [], {}],
  };
  assert.deepEqual(parseProjectText(formatProjectText(data, 'lua')), data);
  assert.equal(Object.getPrototypeOf(parseProjectText(formatProjectText(data, 'lua'))), Object.prototype);
  assert.deepEqual(parseProjectText('\ufeff-- Lua project\nreturn { [1] = -0x65; [2] = \'text\\u{e9}\'; empty = list() }'),
    { 1: -101, 2: 'texté', empty: [] });
  assert.deepEqual(parseProjectText('--[=[Project notes]=]\nreturn { line = [=[\nFirst line.\r\nSecond [[line]].]=] }'),
    { line: 'First line.\nSecond [[line]].' });
  for (const [source, error] of [
    ['return { entry = 1, ["entry"] = 2 }', /Duplicate table key/],
    ['return { entry = { 1, key = "x" } }', /cannot mix/],
    ['return { entry = unknown() }', /Unknown value or constructor/],
    ['return { entry = say() }', /Missing arguments/],
    ['return { entry = say("a", "b", "c") }', /Too many arguments/],
    ['return { entry = function() end }', /Unknown value or constructor/],
    ['return { entry = nil }', /Unknown value or constructor/],
    ['return { entry = "bad\\q" }', /Unsupported string escape/],
    ['return { entry = 1e999 }', /Expected a finite number/],
    ['return {}; doFile("external")', /Unexpected text/],
    [`return ${'{'.repeat(200)}true${'}'.repeat(200)}`, /nested too deeply/],
  ]) assert.throws(() => parseProjectText(source), error);
});

const romPath = process.env.FFTA_US_ROM;
test('both formats validate the same project and build identical native assets and manifest', { skip: !romPath }, async () => {
  const { rom, project: empty } = await openRom(await readFile(romPath));
  const json = await read('json');
  const lua = await read('lua');
  const configured = importProject(rom, empty, json);
  assert.deepEqual(previewBuild(rom, configured), previewBuild(rom, importProject(rom, empty, lua)));
  const first = build(rom, configured);
  assert.deepEqual(build(rom, importProject(rom, empty, lua)).bytes, first.bytes);
  assert.deepEqual((await openRom(first.bytes)).project, configured);

  const mixed = structuredClone(configured);
  mixed.openings[OPENING_ID] = openingExample();
  mixed.pages[63] = { cloneFrom: '61/0' };
  mixed.dialogue['63:0'] = { encoding: 'standard', flags: 16, tokens: plainTokens('Test branch.') };
  mixed.scenes[234] = { script: { group: 0, program: 12 }, dialoguePage: 63 };
  mixed.programs['0/12'] = { cloneFrom: '1/0', instructions: rom.programs.get('1/0').commands
    .map(({ offset, ...operation }) => operation) };
  const roundTrip = parseProjectText(formatProjectText(mixed, 'lua'));
  assert.deepEqual(build(rom, roundTrip).bytes, build(rom, mixed).bytes);

  const bad = structuredClone(configured);
  bad.storyEdits['herb-arrival'].steps[1].flag = 'undeclared';
  for (const format of ['json', 'lua']) {
    const parsed = parseProjectText(formatProjectText(bad, format));
    assert.throws(() => importProject(rom, empty, parsed), /declared native story flag/);
  }
  bad.storyEdits['herb-arrival'].steps[1].flag = 'route-marker';
  bad.storyEdits['herb-arrival'].steps[0].text = '无法编码';
  const parsed = parseProjectText(formatProjectText(bad, 'lua'));
  assert.throws(() => importProject(rom, empty, parsed), /Glyph unavailable/);

  mixed.battleEvents[DEMO_ID] = snowballDemo();
  const draft = parseProjectText(formatProjectText(mixed, 'lua'));
  assert.deepEqual(previewBuild(rom, draft), previewBuild(rom, mixed));
  assert.equal(previewBuild(rom, draft).buildable, false);
});
