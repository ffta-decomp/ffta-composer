// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import { readFile, writeFile } from 'node:fs/promises';
import { OPERATIONS, PROFILE } from '../src/profile.mjs';
import { VM_INSTRUCTIONS, vmOperandRange } from '../src/vm-instructions.mjs';

const root = new URL('../', import.meta.url);
const save = (path, data) => writeFile(new URL(path, root), JSON.stringify(data, null, 2) + '\n');
const namedSchema = (name, fields) => ({
  type: 'object', additionalProperties: false, required: ['operation', 'operands'],
  properties: {
    operation: {const: name},
    operands: {type: 'object', additionalProperties: false, required: fields.map(field => field.key),
      properties: Object.fromEntries(fields.map(field => [field.key, {type: 'integer', ...vmOperandRange(field)}]))},
  },
});
const alternatives = VM_INSTRUCTIONS.map(row => namedSchema(row.name, row.fields));
for (const [opcode, [name, , fields]] of Object.entries(OPERATIONS)) {
  if (VM_INSTRUCTIONS[Number(opcode)].name === name) continue;
  alternatives.push(namedSchema(name, fields.map(field => ({key: field.key,
    type: `${field.signed ? 'i' : 'u'}${field.size * 8}`, ...(field.key === 'bit' ? {maximum: 15} : {})}))));
}
for (const row of VM_INSTRUCTIONS.filter(row => row.operation === 'native')) {
  alternatives.push({type: 'object', additionalProperties: false, required: ['operation', 'opcode', 'operands'],
    properties: {operation: {const: 'native'}, opcode: {const: row.opcode},
      operands: {type: 'array', minItems: row.length - 1, maxItems: row.length - 1,
        items: {type: 'integer', minimum: 0, maximum: 255}}},
  });
}
const instruction = {oneOf: alternatives};
await save('schemas/scene-vm.schema.json', {
  $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'urn:ffta:scene-vm-instruction:v1',
  title: 'FFTA US native scene instruction',
  description: 'Encoding validation only. Unmodeled native instructions still require an unchanged source layout and bytes.',
  ...instruction,
});
const projectUrl = new URL('schemas/project.schema.json', root);
const project = JSON.parse(await readFile(projectUrl));
project.$defs.instruction = instruction;
project.$defs.program.properties.instructions.items = {$ref: '#/$defs/instruction'};
await save('schemas/project.schema.json', project);
await save('docs/scene-vm-instructions.json', {
  format: 'ffta.scene-vm-instructions/v1', profile: PROFILE.id, baseSha256: PROFILE.sha256,
  license: 'GPL-3.0-only', author: 'hitsmaxft', source: 'https://github.com/ffta-decomp/ffta-composer',
  instructions: VM_INSTRUCTIONS.map(row => ({...row,
    fields: row.fields.map(field => ({...field, ...vmOperandRange(field)})),
    jsonExample: {operation: row.name, operands: Object.fromEntries(row.fields.map(field => [field.key, 0]))},
    luaSyntax: `${row.name}(${row.fields.map(field => field.key).join(', ')})`,
  })),
});
const lua = [
  '-- Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only',
  '-- FFTA Composer — see LICENSE and NOTICE for reuse and attribution.',
  '-- Reference expressions, not a playable project or a script to execute in a standalone Lua VM.',
  '-- All zero operands are encoding examples only; do not execute them blindly in a game.',
  'return {',
  ...VM_INSTRUCTIONS.map(row => `  -- 0x${row.opcode.toString(16).padStart(2, '0')} ${row.editing}\n  ${row.name}(${row.fields.map(() => '0').join(', ')}),`),
  '}', '',
].join('\n');
await writeFile(new URL('docs/scene-vm-examples.lua', root), lua);
console.log('Generated 114 instruction descriptions, Lua expressions, and strict JSON schemas.');
