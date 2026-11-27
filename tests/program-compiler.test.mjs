// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import assert from 'node:assert/strict';
import test from 'node:test';
import {compileInstructions} from '../src/program-compiler.mjs';

// Synthetic bytecode only: no ROM or game assets are needed for this boundary test.
test('expanding a borrowed setup cannot retain a stale jump into its interior', () => {
  const jump = delta => ({operation:'adjustScriptOffset',operands:{delta}});
  const finish = {operation:'setSceneRuntimeMode',operands:{mode:1}};
  const specs = new Map([
    [0x19,{opcode:0x19,operation:'adjustScriptOffset',size:3,operands:[{key:'delta',size:2,signed:true}]}],
    [0x17,{opcode:0x17,operation:'setSceneRuntimeMode',size:2,operands:[{key:'mode',size:1}]}],
  ]);
  const creation = {offset:0,operation:'native',opcode:0x1f,operands:[2,17,0,32,0]};
  const source = {offset:0,end:15,commands:[creation,
    {offset:6,operation:'native',opcode:0x2e,operands:[2,3,0,5,0,7,0]},
    {offset:14,operation:'finishSceneTask',operands:{}},
  ]};
  const rom = {bytes:Uint8Array.of(0x1f,2,17,0,32,0,0x2e,2,3,0,5,0,7,0,0x02),
    scenes:{53:{script:{group:0,program:0}}},programs:new Map([['0/0',source]])};
  const original = {offset:0,end:11,commands:[{offset:0,...jump(6)},
    {...creation,offset:3},{offset:9,...finish}]};
  const reference = {operation:'borrowSceneActor',operands:{scene:53,actor:2,setup:'initial'}};
  assert.throws(() => compileInstructions([jump(6),reference,finish],specs,original,rom), /instruction boundary/);
  const valid = compileInstructions([jump(14),reference,finish],specs,original,rom);
  assert.deepEqual(valid.slice(3,17),rom.bytes.slice(0,14));
  assert.deepEqual([...valid.slice(17)],[0x17,1]);
  // When only creation is borrowed, the original six-byte jump is still valid.
  const creationOnly = {...reference,operands:{scene:53,actor:2}};
  assert.equal(compileInstructions([jump(6),creationOnly,finish],specs,original,rom).length,11);
});
