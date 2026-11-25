import { check, concat, integer, put16 } from './binary.mjs';

const SAY = 0x0f;
const JUMP = 0x19;
const END = 0x02;

function jump(from, to) {
  const bytes = Uint8Array.of(JUMP, 0, 0);
  put16(bytes, 1, integer(to - from - bytes.length, -32768, 32767, 'Dialogue jump distance'));
  return bytes;
}

export function appendBeforeDialogue(bytes, commands, blocks) {
  if (!blocks.size) return bytes;
  const final = commands.at(-1);
  check(final?.operation === 'finishSceneTask' || final?.operation === 'adjustScriptOffset' ||
    (final?.operation === 'setSceneRuntimeMode' && [1, 2, 4, 5, 8, 12].includes(final.operands.mode)),
  'Dialogue insertion requires a known native program ending');
  const result = bytes.slice();
  const tail = [Uint8Array.of(END)];
  let tailEnd = result.length + 1;
  for (const [offset, block] of blocks) {
    check(commands.some(command => command.offset === offset && command.operation === 'say'),
      'Dialogue insertion must be anchored to a native dialogue instruction');
    result.set(jump(offset, tailEnd), offset);
    result[offset + 3] = END;
    tail.push(block, bytes.subarray(offset, offset + 4));
    tailEnd += block.length + 4;
    tail.push(jump(tailEnd, offset + 4));
    tailEnd += 3;
  }
  check(tailEnd <= 32767, 'Inserted dialogue exceeds the signed script range');
  return concat([result, ...tail]);
}

export function insertDialogue(bytes, commands, insertions) {
  check(Array.isArray(insertions), 'Dialogue insertions must be an array');
  if (!insertions.length) return { bytes, insertions: [] };
  const buckets = new Map();
  const resolved = [];
  for (const item of insertions) {
    check(item && typeof item === 'object' && !Array.isArray(item) &&
      Object.keys(item).every(key => ['anchorOffset', 'textSelector', 'speakerHandle', 'presentationFlags'].includes(key)),
    'Invalid dialogue insertion fields');
    const command = commands.find(step => step.offset === item.anchorOffset);
    check(command?.operation === 'say', 'Dialogue insertion must be anchored to a native dialogue instruction');
    const event = {
      anchorOffset: command.offset,
      textSelector: integer(item.textSelector, 0, 239, 'Dialogue selector'),
      speakerHandle: integer(item.speakerHandle ?? command.operands.speakerHandle, 0, 255, 'Speaker handle'),
      presentationFlags: integer(item.presentationFlags ?? command.operands.presentationFlags, 0, 255, 'Presentation flags'),
    };
    resolved.push(event);
    if (!buckets.has(command.offset)) buckets.set(command.offset, []);
    buckets.get(command.offset).push(event);
  }
  const blocks = new Map([...buckets].map(([offset, events]) => [
    offset, concat(events.map(event => Uint8Array.of(SAY, event.textSelector, event.speakerHandle, event.presentationFlags))),
  ]));
  return { bytes: appendBeforeDialogue(bytes, commands, blocks), insertions: resolved };
}
