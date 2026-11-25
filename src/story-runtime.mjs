// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — https://github.com/ffta-decomp/ffta-composer ; see LICENSE and NOTICE.
import { put16, put32 } from './binary.mjs';
import { PROFILE } from './profile.mjs';

export const STORY_VM_TABLE = { pointer: 0x122b10, start: PROFILE.scripts.descriptors };
export const READ_MENU_CHOICE = 0x72;
export const SET_ENCOUNTER_HP = 0x73;

// Position-independent ARM7TDMI Thumb from runtime/story_choices.s.
const machineCode = '164a1278002a05d0012a05d00288093a028009e0013100e003310a784b781b02' +
  '1a430388d2180280882040007047c0464b780b2b0ed821225343db00084a9b18' +
  '1a79002a06d08a78c97809020a4301d01a835a83882040007047000043200002' +
  'c42f0002';
export const storyRuntimeCode = Uint8Array.from(machineCode.match(/../g), value => Number.parseInt(value, 16));

export function storyVmDescriptors(rom, codeAddress) {
  const table = new Uint8Array((SET_ENCOUNTER_HP + 1) * 6);
  table.set(rom.bytes.subarray(STORY_VM_TABLE.start, STORY_VM_TABLE.start + READ_MENU_CHOICE * 6));
  put16(table, READ_MENU_CHOICE * 6, 5);
  put32(table, READ_MENU_CHOICE * 6 + 2, codeAddress + 1);
  put16(table, SET_ENCOUNTER_HP * 6, 4);
  put32(table, SET_ENCOUNTER_HP * 6 + 2, codeAddress + 0x30 + 1);
  return table;
}
