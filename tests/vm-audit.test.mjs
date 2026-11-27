// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — https://github.com/ffta-decomp/ffta-composer ; see LICENSE and NOTICE.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { auditSceneVm } from '../tools/audit-vm.mjs';
import { OPERATIONS, PROFILE } from '../src/profile.mjs';
import { build, openRom, plan } from '../src/project.mjs';

const reference = new URL('../docs/scene-vm-catalog.json', import.meta.url);

test('the reference documents every native descriptor with an exhaustive usage census', async () => {
  const catalog = JSON.parse(await readFile(reference));
  assert.equal(catalog.baseSha256, PROFILE.sha256);
  assert.equal(catalog.opcodes.length, 114);
  assert.deepEqual(catalog.opcodes.map(row => row.opcode), Array.from({length:114}, (_, i) => i));
  assert.equal(catalog.instructionCount, 34395);
  assert.equal(catalog.programCount, 228);
  assert.equal(catalog.nonemptyProgramCount, 207);
  assert.equal(catalog.opcodes.reduce((n, row) => n + row.uses, 0), 34395);
  assert.deepEqual(catalog.opcodes.filter(row => !row.uses).map(row => row.opcode), [0x14, 0x1b, 0x3b, 0x3c, 0x6b]);
  assert.equal(catalog.opcodes.filter(row => row.operation !== 'native').length, 32);
  for (const row of catalog.opcodes) {
    assert.ok(row.length >= 1 && row.length <= 64);
    assert.ok(Number.parseInt(row.handler.slice(2), 16) & 1);
    if (OPERATIONS[row.opcode]) {
      assert.equal(row.operation, OPERATIONS[row.opcode][0]);
      assert.equal(row.length, 1 + OPERATIONS[row.opcode][2].reduce((n, arg) => n + arg.size, 0));
    }
  }
  const text = await readFile(new URL('../docs/scene-vm.md', import.meta.url), 'utf8');
  const rows = [...text.matchAll(/^\| `([\da-f]{2})` \| (\d+) \| `(0x[\da-f]+)` \| (\d+) \|/gm)];
  assert.equal(rows.length, 114);
  for (let i = 0; i < rows.length; i++) {
    assert.equal(Number.parseInt(rows[i][1], 16), i);
    assert.equal(Number(rows[i][2]), catalog.opcodes[i].length);
    assert.equal(rows[i][3], catalog.opcodes[i].handler);
    assert.equal(Number(rows[i][4]), catalog.opcodes[i].uses);
  }
});

const source = process.env.FFTA_US_ROM;
test('a fresh retail scan reproduces every documented descriptor and program/scene reference', {skip: !source}, async () => {
  assert.deepEqual(await auditSceneVm(await readFile(source)), JSON.parse(await readFile(reference)));
  const mod = Uint8Array.from(await readFile(source));
  mod[0x400000] ^= 1;
  await assert.rejects(auditSceneVm(mod), /pinned US retail/);
});

test('all 34395 original instructions re-encode without changing any of the 207 nonempty programs', {skip: !source}, async () => {
  const {rom, project} = await openRom(await readFile(source));
  let commands = 0;
  for (const [key, program] of rom.programs) {
    if (!program.commands.length) continue;
    project.programs[key] = {instructions: program.commands.map(({offset, ...instruction}) => instruction)};
    commands += program.commands.length;
  }
  assert.equal(commands, 34395);
  assert.equal(Object.keys(project.programs).length, 207);
  const result = plan(rom, project);
  assert.equal(result.programs.size, 0);
  assert.deepEqual(result.diffs, []);
  assert.deepEqual(build(rom, project).bytes, rom.bytes);
});
