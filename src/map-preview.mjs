// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import { check, integer, u16, u32 } from './binary.mjs';
import { inflate } from './text.mjs';

export const MAP_DIRECTORY = Object.freeze({offset: 0x569104, count: 162, stride: 0x58});
const SIDE = 512;
const MAX_DECODED = 0x10000;
function range(bytes, offset, count) {
  check(Number.isInteger(offset) && offset >= 0 && count >= 0 && offset + count <= bytes.length, 'Truncated map resource');
}

/** Standard GBA BIOS LZ77, independently implemented for read-only map previews. */
export function decodeBiosLz(bytes, offset) {
  range(bytes, offset, 4);
  check(bytes[offset] === 0x10, 'Unsupported map compression');
  const size = u32(bytes, offset) >>> 8;
  check(size > 0 && size <= MAX_DECODED, 'Map resource exceeds preview limits');
  const result = new Uint8Array(size);
  let at = offset + 4, out = 0;
  while (out < size) {
    range(bytes, at, 1);
    const flags = bytes[at++];
    for (let bit = 7; bit >= 0 && out < size; bit--) {
      if (flags & (1 << bit)) {
        range(bytes, at, 2);
        const length = (bytes[at] >>> 4) + 3;
        const distance = ((bytes[at] & 15) << 8 | bytes[at + 1]) + 1;
        at += 2;
        check(distance <= out && out + length <= size, 'Invalid map compression reference');
        for (let n = 0; n < length; n++, out++) result[out] = result[out - distance];
      } else {
        range(bytes, at, 1);
        result[out++] = bytes[at++];
      }
    }
  }
  return result;
}

function resourcePointer(bytes, id, field) {
  const row = MAP_DIRECTORY.offset + id * MAP_DIRECTORY.stride;
  range(bytes, row, MAP_DIRECTORY.stride);
  const pointer = MAP_DIRECTORY.offset + u32(bytes, row + field);
  range(bytes, pointer, 4);
  return pointer;
}
function rawEnd(bytes, start) {
  let end = bytes.length;
  for (let id = 0; id < MAP_DIRECTORY.count; id++) {
    for (const field of [0, 4, 8, 12, 16, 20, 24, 32, 36, 40, 48, 52, 56]) {
      const offset = u32(bytes, MAP_DIRECTORY.offset + id * MAP_DIRECTORY.stride + field);
      const pointer = MAP_DIRECTORY.offset + offset;
      if (offset && pointer > start && pointer < end) end = pointer;
    }
  }
  return end;
}
function applyArrangement(bytes, id, entries, chain = []) {
  check(!chain.includes(id) && chain.length < MAP_DIRECTORY.count, 'Map arrangement redirect cycle');
  const at = resourcePointer(bytes, id, 4), kind = bytes[at], parent = u32(bytes, at) >>> 8;
  if (kind === 0x10) {
    const data = decodeBiosLz(bytes, at);
    check(data.length === entries.byteLength, 'Unsupported direct map arrangement size');
    for (let i = 0; i < entries.length; i++) entries[i] = u16(data, i * 2);
    return;
  }
  check(kind === 1 || kind === 0x11, 'Unsupported map arrangement wrapper');
  if (parent !== 0xffffff) {
    integer(parent, 0, MAP_DIRECTORY.count - 1, 'Map redirect');
    applyArrangement(bytes, parent, entries, [...chain, id]);
  }
  const data = kind === 0x11 ? decodeBiosLz(bytes, at + 4) : bytes.subarray(at + 4, rawEnd(bytes, at));
  range(data, 0, 4);
  const header = u32(data, 0), dictionary = header & 0x0fffffff;
  const lookup = Boolean(header & 0x80000000), wide = Boolean(header & 0x40000000);
  let cursor = 4;
  for (let runs = 0; runs < 8192; runs++) {
    range(data, cursor, 2);
    const destination = u16(data, cursor);
    cursor += 2;
    if (!destination) return;
    check(destination % 4 === 0, 'Unaligned map arrangement destination');
    if (!lookup) {
      range(data, cursor, 2);
      const length = u16(data, cursor); cursor += 2;
      check(length % 4 === 0 && destination + length <= entries.byteLength, 'Map arrangement write out of range');
      range(data, cursor, length);
      for (let n = 0; n < length; n += 2) entries[(destination + n) / 2] = u16(data, cursor + n);
      cursor += length;
      continue;
    }
    range(data, cursor, 1);
    const count = data[cursor++];
    check(destination + count * 4 <= entries.byteLength, 'Map arrangement write out of range');
    for (let n = 0; n < count; n++) {
      range(data, cursor, wide ? 2 : 1);
      const index = wide ? u16(data, cursor) : data[cursor]; cursor += wide ? 2 : 1;
      range(data, dictionary + index * 2, 2);
      const first = u16(data, dictionary + index * 2);
      let left, right;
      if (first & 0x8000) {
        range(data, dictionary + index * 2 + 2, 2);
        left = first & 0x7fff;
        right = u16(data, dictionary + index * 2 + 2) & 0x7fff;
      } else { left = first; right = (first + 1) & 0xffff; }
      entries[destination / 2 + n * 2] = left;
      entries[destination / 2 + n * 2 + 1] = right;
    }
  }
  throw new Error('Map arrangement exceeds preview limits');
}

export function decodeMapPreview(rom, id) {
  integer(id, 0, MAP_DIRECTORY.count - 1, 'Map ID');
  const bytes = rom.bytes;
  range(bytes, MAP_DIRECTORY.offset, MAP_DIRECTORY.count * MAP_DIRECTORY.stride);
  const graphicsAt = resourcePointer(bytes, id, 0);
  check([0x20, 0x22].includes(bytes[graphicsAt]), 'Unsupported map graphics wrapper');
  const stream = graphicsAt + (bytes[graphicsAt] === 0x22 ? 8 : 4);
  range(bytes, stream, 4);
  const size = new DataView(bytes.buffer, bytes.byteOffset + stream, 4).getUint32(0, false);
  const decoded = inflate(bytes, stream + 4, size, bytes.length);
  // Wrapper 0x22 relocates the decoded bank within character memory. Its
  // first header carries the byte destination; the nested header carries size.
  const tileOffset = bytes[graphicsAt] === 0x22 ? u32(bytes, graphicsAt) >>> 8 : 0;
  check(decoded.length % 32 === 0 && tileOffset % 32 === 0 && tileOffset + decoded.length <= 0x8000, 'Invalid map tile bank');
  const tiles = new Uint8Array(tileOffset + decoded.length);
  tiles.set(decoded, tileOffset);
  const paletteAt = resourcePointer(bytes, id, 12);
  let palette;
  if (bytes[paletteAt] === 0x10) palette = decodeBiosLz(bytes, paletteAt);
  else {
    check(bytes[paletteAt] === 0, 'Unsupported map palette wrapper');
    const length = u32(bytes, paletteAt) >>> 8;
    check(length > 0 && length <= 512, 'Invalid map palette size');
    range(bytes, paletteAt + 4, length);
    palette = bytes.subarray(paletteAt + 4, paletteAt + 4 + length);
  }
  check(palette.length % 32 === 0 && palette.length <= 512, 'Invalid map palette banks');
  const entries = new Uint16Array(8192).fill(1023);
  applyArrangement(bytes, id, entries);
  const pixels = new Uint8ClampedArray(SIDE * SIDE * 4);
  let minX = SIDE, minY = SIDE, maxX = 0, maxY = 0, missingTiles = 0;
  for (const layer of [1, 0]) {
    for (let slot = 0; slot < 4096; slot++) {
      const entry = entries[layer * 4096 + slot], tile = entry & 1023;
      if (tile === 1023) continue;
      if (tile * 32 >= tiles.length) { missingTiles++; continue; }
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const px = entry & 1024 ? 7 - x : x, py = entry & 2048 ? 7 - y : y;
        const value = tiles[tile * 32 + py * 4 + (px >>> 1)];
        const color = value >>> ((px & 1) * 4) & 15;
        if (!color) continue;
        const index = ((entry >>> 12) * 16 + color) * 2;
        range(palette, index, 2);
        const rgb = u16(palette, index), dx = slot % 64 * 8 + x, dy = Math.floor(slot / 64) * 8 + y;
        const at = (dy * SIDE + dx) * 4;
        pixels[at] = Math.round((rgb & 31) * 255 / 31);
        pixels[at + 1] = Math.round((rgb >>> 5 & 31) * 255 / 31);
        pixels[at + 2] = Math.round((rgb >>> 10 & 31) * 255 / 31);
        pixels[at + 3] = 255;
        minX = Math.min(minX, dx); minY = Math.min(minY, dy);
        maxX = Math.max(maxX, dx + 1); maxY = Math.max(maxY, dy + 1);
      }
    }
  }
  return {id, width: SIDE, height: SIDE, pixels, missingTiles,
    bounds: minX < maxX ? {x: minX, y: minY, width: maxX - minX, height: maxY - minY} : {x: 0, y: 0, width: SIDE, height: SIDE}};
}
