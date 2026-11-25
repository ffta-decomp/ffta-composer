// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import { check, integer, put16 } from './binary.mjs';
import { OPERATIONS } from './profile.mjs';
import { VM_INSTRUCTION_DATA } from './vm-instruction-data.mjs';

const ranges = {u8: [0, 255], i8: [-128, 127], u16: [0, 65535], i16: [-32768, 32767]};
export const VM_INSTRUCTIONS = Object.freeze(VM_INSTRUCTION_DATA.map(data => {
  const operation = OPERATIONS[data.opcode];
  let offset = 1;
  const fields = data.fields ?? operation[2].map(arg => {
    const field = {key: arg.key, offset, type: `${arg.signed ? 'i' : 'u'}${arg.size * 8}`};
    offset += arg.size;
    if (arg.key === 'bit') field.maximum = 15;
    return field;
  });
  return Object.freeze({...data, fields: Object.freeze(fields.map(field => Object.freeze({...field}))),
    operation: operation?.[0] ?? 'native',
    editing: operation ? 'named' : 'preserve-native-layout',
  });
}));
const byName = new Map(VM_INSTRUCTIONS.map(row => [row.name, row]));
export function vmInstruction(name) { return byName.get(name); }

export function vmOperandRange(field) {
  const [minimum, maximum] = ranges[field.type];
  return {minimum, maximum: field.maximum ?? maximum};
}

/** Lower a semantic expression to the existing v1 instruction model.
 * Opaque instructions still pass through the original source/layout checks.
 */
export function lowerVmInstruction(command) {
  const descriptor = byName.get(command?.operation);
  if (!descriptor) return command;
  check(Object.keys(command).every(key => ['operation', 'operands'].includes(key)), 'Invalid semantic VM instruction fields');
  const operands = command.operands;
  check(operands && typeof operands === 'object' && !Array.isArray(operands), 'VM operands must be an object');
  check(Object.keys(operands).length === descriptor.fields.length &&
    descriptor.fields.every(field => Object.hasOwn(operands, field.key)), `Invalid operands for ${descriptor.name}`);
  const bytes = new Uint8Array(descriptor.length - 1);
  const named = {};
  for (const field of descriptor.fields) {
    const {minimum, maximum} = vmOperandRange(field);
    const value = integer(operands[field.key], minimum, maximum, `${descriptor.name}.${field.key}`);
    if (field.type.endsWith('8')) bytes[field.offset - 1] = value;
    else put16(bytes, field.offset - 1, value);
    named[field.projectKey ?? field.key] = value;
  }
  return descriptor.operation === 'native'
    ? {operation: 'native', opcode: descriptor.opcode, operands: [...bytes]}
    : {operation: descriptor.operation, operands: named};
}

/** Convert catalog instructions to typed JSON/Lua expressions, retaining every operand bit. */
export function toVmExpression(command) {
  const {offset, ...data} = command;
  const lowered = lowerVmInstruction(data);
  const descriptor = lowered.operation === 'native' ? VM_INSTRUCTIONS[lowered.opcode]
    : VM_INSTRUCTIONS.find(row => row.operation === lowered.operation);
  check(descriptor, 'Unknown VM instruction');
  const operands = {};
  if (lowered.operation === 'native') {
    check(Array.isArray(lowered.operands) && lowered.operands.length === descriptor.length - 1,
      'Wrong native operand count');
    for (const value of lowered.operands) integer(value, 0, 255, 'Native operand');
    for (const field of descriptor.fields) {
      let value = lowered.operands[field.offset - 1];
      const width = field.type.endsWith('8') ? 8 : 16;
      if (width === 16) value |= lowered.operands[field.offset] << 8;
      if (field.type.startsWith('i') && value >= 2 ** (width - 1)) value -= 2 ** width;
      operands[field.key] = value;
    }
  } else {
    for (const field of descriptor.fields) operands[field.key] = lowered.operands[field.projectKey ?? field.key];
  }
  const result = {operation: descriptor.name, operands};
  lowerVmInstruction(result);
  return result;
}
