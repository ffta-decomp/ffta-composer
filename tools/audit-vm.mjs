// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — https://github.com/ffta-decomp/ffta-composer ; see LICENSE and NOTICE.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { check } from '../src/binary.mjs';
import { OPERATIONS, PROFILE } from '../src/profile.mjs';
import { openUSRom, programKey } from '../src/rom.mjs';

// Emits metadata only: no ROM bytes, text, raw operands, or private input paths.
export async function auditSceneVm(bytes) {
  const rom = await openUSRom(bytes);
  check(rom.sha256 === PROFILE.sha256, 'VM audit requires the pinned US retail ROM');
  const names = new Map(Object.entries(OPERATIONS).map(([opcode, [name]]) => [name, Number(opcode)]));
  const opcodes = [...rom.specs.values()].map(spec => ({
    opcode: spec.opcode, hex: `0x${spec.opcode.toString(16).padStart(2, '0')}`,
    length: spec.size, handler: `0x${spec.handler.toString(16).padStart(8, '0')}`,
    operation: spec.operation, uses: 0, programs: [], scenes: [],
  }));
  for (const [key, program] of rom.programs) {
    const seen = new Set();
    for (const command of program.commands) {
      const opcode = command.operation === 'native' ? command.opcode : names.get(command.operation);
      const row = opcodes[opcode];
      check(row?.opcode === opcode, 'Noncontiguous opcode table');
      row.uses++;
      seen.add(opcode);
    }
    for (const opcode of seen) {
      opcodes[opcode].programs.push(key);
      opcodes[opcode].scenes.push(...rom.scenes.filter(scene => scene.status === 'resolved' &&
        programKey(scene.script.group, scene.script.program) === key).map(scene => scene.id));
    }
  }
  for (const row of opcodes) row.scenes.sort((a, b) => a - b);
  return {
    format: 'ffta.scene-vm-audit/v1', baseSha256: rom.sha256,
    descriptorOffset: PROFILE.scripts.descriptors, descriptorStride: 6,
    programCount: rom.programs.size,
    nonemptyProgramCount: [...rom.programs.values()].filter(p => p.commands.length).length,
    instructionCount: opcodes.reduce((sum, row) => sum + row.uses, 0), opcodes,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = process.argv[2] ?? process.env.FFTA_US_ROM;
  check(source, 'Usage: node tools/audit-vm.mjs /path/to/retail.gba [metadata.json]');
  const json = JSON.stringify(await auditSceneVm(await readFile(source)), null, 2) + '\n';
  if (process.argv[3]) await writeFile(process.argv[3], json);
  else process.stdout.write(json);
}
