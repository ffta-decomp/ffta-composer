// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { formatProjectText, parseProjectText } from '../src/project-text.mjs';
import { catalog } from '../src/rom.mjs';
import { build, importProject, openRom, plan } from '../src/project.mjs';
import { lowerVmInstruction, toVmExpression, VM_INSTRUCTIONS, vmOperandRange } from '../src/vm-instructions.mjs';

const reference = path => new URL(`../${path}`, import.meta.url);

test('all 114 JSON descriptions and Lua functions share one encoding model', async () => {
  const descriptors = JSON.parse(await readFile(reference('docs/scene-vm-instructions.json'))).instructions;
  const schema = JSON.parse(await readFile(reference('schemas/scene-vm.schema.json')));
  const projectSchema = JSON.parse(await readFile(reference('schemas/project.schema.json')));
  assert.deepEqual(projectSchema.$defs.instruction.oneOf, schema.oneOf);
  assert.equal(projectSchema.$defs.program.properties.instructions.items.$ref, '#/$defs/instruction');
  const expressions = parseProjectText(await readFile(reference('docs/scene-vm-examples.lua'), 'utf8'));
  assert.equal(expressions.length, 114);
  assert.equal(descriptors.length, 114);
  assert.equal(new Set(VM_INSTRUCTIONS.map(row => row.name)).size, 114);
  for (const row of VM_INSTRUCTIONS) {
    const description = descriptors[row.opcode];
    const json = description.jsonExample;
    assert.deepEqual(expressions[row.opcode], json);
    assert.deepEqual(parseProjectText(formatProjectText({instruction: json}, 'lua')).instruction, json);
    assert.deepEqual(toVmExpression(lowerVmInstruction(json)), json);
    const one = schema.oneOf.filter(item => item.properties.operation.const === row.name);
    assert.equal(one.length, 1);
    const positions = row.fields.flatMap(field => Array.from({length: field.type.endsWith('8') ? 1 : 2}, (_, i) => field.offset + i));
    assert.deepEqual(positions.toSorted((a, b) => a - b), Array.from({length:row.length - 1}, (_, i) => i + 1));
    for (const field of row.fields) {
      const {minimum, maximum} = vmOperandRange(field);
      assert.deepEqual(one[0].properties.operands.properties[field.key], {type:'integer', minimum, maximum});
      for (const value of [minimum, maximum]) {
        const edge = structuredClone(json);
        edge.operands[field.key] = value;
        assert.deepEqual(toVmExpression(lowerVmInstruction(edge)), edge);
      }
      for (const value of [minimum - 1, maximum + 1, 0.5, '0', null]) {
        const invalid = structuredClone(json);
        invalid.operands[field.key] = value;
        assert.throws(() => lowerVmInstruction(invalid));
      }
      const missing = structuredClone(json);
      delete missing.operands[field.key];
      assert.throws(() => lowerVmInstruction(missing), /Invalid operands/);
    }
    assert.throws(() => lowerVmInstruction({...json, opcode: row.opcode}), /fields/);
    assert.throws(() => lowerVmInstruction({...json, operands: {...json.operands, unexpected: 0}}), /Invalid operands/);
    assert.throws(() => parseProjectText(`return {${row.name}(${row.fields.map(() => '0').concat('0').join(', ')})}`), /Too many arguments/);
    if (row.fields.length) assert.throws(() => parseProjectText(`return {${row.name}()}`), /Missing arguments/);
  }
  assert.equal(descriptors.filter(row => row.editing === 'named').length, 31);
  assert.equal(descriptors.filter(row => row.editing === 'preserve-native-layout').length, 83);
});

const source = process.env.FFTA_US_ROM;
test('all 34395 native instructions survive typed JSON, compact Lua and compilation unchanged', {skip: !source}, async () => {
  const {rom, project} = await openRom(await readFile(source));
  assert.equal(catalog(rom).vmInstructions.length, 114);
  let total = 0;
  for (const [key, program] of rom.programs) {
    if (!program.commands.length) continue;
    project.programs[key] = {instructions: program.commands.map(toVmExpression)};
    total += program.commands.length;
  }
  assert.equal(total, 34395);
  const fromLua = parseProjectText(formatProjectText(project, 'lua'));
  assert.deepEqual(fromLua, project);
  const configured = importProject(rom, (await openRom(rom.bytes)).project, fromLua);
  assert.equal(plan(rom, configured).programs.size, 0);
  assert.deepEqual(build(rom, configured).bytes, rom.bytes);
});

test('semantic aliases compile known instructions and cannot bypass opaque native protections', {skip: !source}, async () => {
  const {rom, project} = await openRom(await readFile(source));
  project.programs['0/12'] = {instructions: parseProjectText('return {waitFrames8(30), finishSceneTask()}')};
  const compiled = plan(rom, project).programs.get('0/12').bytes;
  assert.deepEqual([...compiled], [0x15,30,0x02]);
  project.programs['0/12'].instructions = parseProjectText('return {branchOnFirstChoice(0), finishSceneTask()}');
  assert.throws(() => plan(rom, project), /Opaque instructions require a native source/);
  delete project.programs['0/12'];
  const [key, original] = [...rom.programs].find(([, p]) => p.commands.some(c => c.opcode === 0x71));
  const instructions = original.commands.map(toVmExpression);
  const choice = instructions.find(c => c.operation === 'branchOnFirstChoice');
  choice.operands.delta = choice.operands.delta === 0 ? 1 : 0;
  project.programs[key] = {instructions};
  assert.throws(() => plan(rom, project), /Unresolved instruction operands are preserved/);
});
