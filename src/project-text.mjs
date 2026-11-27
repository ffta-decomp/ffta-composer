// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — https://github.com/ffta-decomp/ffta-composer ; see LICENSE and NOTICE.
import { check } from './binary.mjs';
import { VM_INSTRUCTIONS, vmInstruction } from './vm-instructions.mjs';

const maxDepth = 128;
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const keywords = new Set('and break do else elseif end false for function goto if in local nil not or repeat return then true until while'.split(' '));

const constructors = {
  queueAfter: { fixed: { type: 'queueScene' }, fields: ['scene'], required: 1 },
  say: { fixed: { type: 'say' }, fields: ['text', 'speaker'], required: 1 },
  sayAs: { fixed: { type: 'say' }, fields: ['speaker', 'text'], required: 2 },
  when: { fixed: { type: 'if' }, fields: ['flag', 'then', 'else'], required: 2 },
  choose: { fixed: { type: 'choose' }, fields: ['prompt', 'first', 'second'], required: 3 },
  option: { fixed: {}, fields: ['label', 'steps'], required: 2 },
  enemyHp: { fixed: { type: 'enemyHp' }, fields: ['enemy', 'hp'], required: 2 },
  op: { fixed: {}, fields: ['operation', 'operands'], required: 2 },
  native: { fixed: { operation: 'native' }, fields: ['opcode', 'operands'], required: 2 },
  glyph: { fixed: { kind: 'glyph' }, fields: ['code', 'width'], required: 2 },
  control: { fixed: { kind: 'control' }, fields: ['code', 'args', 'side'], required: 2 },
  separator: { fixed: { kind: 'separator' }, fields: [], required: 0 },
};

const simpleEscapes = {
  a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\', '"': '"', "'": "'",
};

const vmConstructors = new Map(VM_INSTRUCTIONS.map(row => [row.name, row]));

function isName(value) {
  return identifier.test(value) && !keywords.has(value);
}

function readLuaString(raw, fail) {
  return raw.slice(1, -1).replace(/\\(?:x[\da-fA-F]{2}|u\{[\da-fA-F]+\}|\d{1,3}|[^\r\n])/g, escape => {
    const key = escape.slice(1);
    if (Object.hasOwn(simpleEscapes, key)) return simpleEscapes[key];
    if (/^u\{[\da-fA-F]+\}$/.test(key)) {
      const code = Number.parseInt(key.slice(2, -1), 16);
      if (code <= 0x10ffff) return String.fromCodePoint(code);
    } else if (/^x[\da-fA-F]{2}$|^\d{1,3}$/.test(key)) {
      const code = key[0] === 'x' ? Number.parseInt(key.slice(1), 16) : Number(key);
      if (code <= 127) return String.fromCharCode(code);
    }
    fail(`Unsupported string escape ${escape}`);
  });
}

function parseLua(source) {
  const whitespace = /[ \t\r\n\v\f]*/y;
  const longOpening = /\[(=*)\[/y;
  const lex = /([A-Za-z_][A-Za-z0-9_]*)|(-?(?:0[xX][\da-fA-F]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?))|("(?:[^"\\\r\n]|\\[^\r\n])*"|'(?:[^'\\\r\n]|\\[^\r\n])*')|([{}\[\](),;=])/y;
  let cursor = 0;
  let token;

  function fail(message) {
    const lines = source.slice(0, token?.at ?? cursor).split('\n');
    throw new SyntaxError(`Lua ${lines.length}:${lines.at(-1).length + 1}: ${message}`);
  }

  function readLongBlock() {
    longOpening.lastIndex = cursor;
    const match = longOpening.exec(source);
    if (!match) return undefined;
    const closer = `]${match[1]}]`;
    const start = longOpening.lastIndex;
    const end = source.indexOf(closer, start);
    if (end < 0) {
      token = undefined;
      fail('Unterminated long string or comment');
    }
    cursor = end + closer.length;
    return source.slice(start, end).replace(/\r\n|\n\r|\r/g, '\n').replace(/^\n/, '');
  }

  function advance() {
    while (true) {
      whitespace.lastIndex = cursor;
      whitespace.exec(source);
      cursor = whitespace.lastIndex;
      if (!source.startsWith('--', cursor)) break;
      cursor += 2;
      if (readLongBlock() === undefined) {
        while (cursor < source.length && source[cursor] !== '\n' && source[cursor] !== '\r') cursor++;
      }
    }
    if (cursor === source.length) {
      token = { kind: 'eof', raw: '', at: cursor };
      return;
    }
    const at = cursor;
    const long = readLongBlock();
    if (long !== undefined) {
      token = { kind: 'longString', raw: long, at };
      return;
    }
    lex.lastIndex = cursor;
    const match = lex.exec(source);
    if (!match) {
      token = undefined;
      fail('Unexpected character');
    }
    cursor = lex.lastIndex;
    const [, word, number, string, punctuation] = match;
    token = { kind: word ? 'word' : number ? 'number' : string ? 'string' : 'punctuation',
      raw: word ?? number ?? string ?? punctuation, at };
  }

  function take(raw) {
    if (token.raw !== raw || (token.kind !== 'word' && token.kind !== 'punctuation')) return false;
    advance();
    return true;
  }

  function expect(raw) {
    if (!take(raw)) fail(`Expected "${raw}"`);
  }

  function literal() {
    if (token.kind === 'longString') {
      const value = token.raw;
      advance();
      return value;
    }
    if (token.kind === 'string') {
      const value = readLuaString(token.raw, fail);
      advance();
      return value;
    }
    const literal = token.raw;
    const value = /^-0x/i.test(literal) ? -Number(literal.slice(1)) : Number(literal);
    if (!Number.isFinite(value)) fail('Expected a finite number');
    advance();
    return value;
  }

  function call(name, depth) {
    const descriptor = Object.hasOwn(constructors, name) ? constructors[name] : null;
    const vm = vmConstructors.get(name);
    if (!descriptor && !vm && name !== 'list') fail(`Unknown value or constructor "${name}"`);
    expect('(');
    const args = [];
    const limit = descriptor?.fields.length ?? vm?.fields.length ?? 0;
    if (!take(')')) {
      do {
        if (args.length === limit) fail(`Too many arguments to "${name}"`);
        args.push(value(depth + 1));
      } while (take(','));
      expect(')');
    }
    if (name === 'list') return [];
    if (vm) {
      if (args.length !== vm.fields.length) fail(`Missing arguments to "${name}"`);
      return {operation: vm.name, operands: Object.fromEntries(vm.fields.map((field, i) => [field.key, args[i]]))};
    }
    if (args.length < descriptor.required) fail(`Missing arguments to "${name}"`);
    return { ...descriptor.fixed, ...Object.fromEntries(args.map((arg, i) => [descriptor.fields[i], arg])) };
  }

  function readWord(word, depth) {
    if (word === 'true') return true;
    if (word === 'false') return false;
    if (word === 'null') return null;
    return call(word, depth);
  }

  function table(depth) {
    const keys = new Map();
    const values = [];
    while (!take('}')) {
      let key;
      let entry;
      if (take('[')) {
        if (token.kind !== 'string' && token.kind !== 'longString' && token.kind !== 'number') fail('Expected a quoted key or numeric ID');
        key = String(literal());
        expect(']');
        expect('=');
        entry = value(depth);
      } else if (token.kind === 'word') {
        const name = token.raw;
        advance();
        if (take('=')) {
          if (!isName(name)) fail(`Quote the reserved key "${name}"`);
          key = name;
          entry = value(depth);
        } else entry = readWord(name, depth);
      } else entry = value(depth);
      if (key === undefined) {
        if (keys.size) fail('A table cannot mix an array and named fields');
        values.push(entry);
      } else {
        if (values.length) fail('A table cannot mix an array and named fields');
        if (keys.has(key)) fail(`Duplicate table key "${key}"`);
        keys.set(key, entry);
      }
      if (!take(',') && !take(';')) {
        expect('}');
        break;
      }
    }
    return values.length ? values : Object.fromEntries(keys);
  }

  function value(depth) {
    if (depth > maxDepth) fail('The project is nested too deeply');
    if (take('{')) return table(depth + 1);
    if (token.kind === 'number' || token.kind === 'string' || token.kind === 'longString') return literal();
    if (token.kind !== 'word') fail('Expected a Lua data value');
    const word = token.raw;
    advance();
    return readWord(word, depth);
  }

  advance();
  expect('return');
  if (token.kind !== 'punctuation' || token.raw !== '{') fail('Expected a project table');
  const project = value(0);
  take(';');
  if (token.kind !== 'eof') fail('Unexpected text after the project');
  return project;
}

function quoteLua(value) {
  return '"' + value.replace(/["\\\u0000-\u001f\p{Surrogate}]/gu, character => {
    const escape = Object.keys(simpleEscapes).find(key => simpleEscapes[key] === character && key !== "'");
    if (escape) return '\\' + escape;
    return `\\u{${character.codePointAt(0).toString(16)}}`;
  }) + '"';
}

function packed(open, close, parts, depth) {
  const plain = parts.join(', ');
  if (!plain.includes('\n') && plain.length + open.length + close.length + depth * 2 <= 108) {
    return open + plain + close;
  }
  const pad = '  '.repeat(depth + 1);
  return `${open}\n${parts.map(part => pad + part).join(',\n')}\n${'  '.repeat(depth)}${close}`;
}

function formatLua(value, depth = 0) {
  check(depth <= maxDepth, 'The project is nested too deeply');
  if (typeof value === 'string') return quoteLua(value);
  if (value === null || typeof value !== 'object') return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return 'list()';
    return packed('{', '}', value.map(item => formatLua(item, depth + 1)), depth);
  }
  const keys = Object.keys(value);
  const vm = vmInstruction(value.operation);
  if (vm && vm.name !== vm.operation && keys.length === 2 && keys.includes('operands') && value.operands &&
      !Array.isArray(value.operands) && Object.keys(value.operands).length === vm.fields.length &&
      vm.fields.every(field => Object.hasOwn(value.operands, field.key))) {
    return packed(`${vm.name}(`, ')', vm.fields.map(field => formatLua(value.operands[field.key], depth + 1)), depth);
  }
  for (const [name, { fixed, fields, required }] of Object.entries(constructors)) {
    const prefix = Object.keys(fixed);
    const count = keys.length - prefix.length;
    if (count < required || count > fields.length ||
      !prefix.every(key => value[key] === fixed[key])) continue;
    const order = [...prefix, ...fields.slice(0, count)];
    if (!keys.every((key, i) => key === order[i])) continue;
    return packed(`${name}(`, ')', fields.slice(0, count).map(key => formatLua(value[key], depth + 1)), depth);
  }
  return packed('{', '}', Object.entries(value).map(([key, item]) =>
    `${isName(key) ? key : '[' + quoteLua(key) + ']'} = ${formatLua(item, depth + 1)}`), depth);
}

/** JSON and the Lua data subset produce the same project document. */
export function parseProjectText(text) {
  const source = text.replace(/^\uFEFF/, '');
  return /^[\s]*[\[{]/.test(source) ? JSON.parse(source) : parseLua(source);
}

export function formatProjectText(project, format = 'json') {
  check(format === 'json' || format === 'lua', 'Project format must be json or lua');
  const json = JSON.stringify(project, null, 2);
  if (format === 'json') return json + '\n';
  // Follow JSON's treatment of optional fields before representing them in Lua.
  return 'return ' + formatLua(JSON.parse(json)) + '\n';
}
