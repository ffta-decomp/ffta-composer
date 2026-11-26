// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
// Independent adapter; FFTA2 WordTable/charset and FFTA editor core informed
// the alias, width, longest-match, and unchanged-byte contracts. See docs/character-tables.md.
import { check, integer } from './binary.mjs';

export const CHARACTER_TABLE_FORMAT = 'ffta.character-table/v1';
const normalized = new WeakSet(), codecs = new WeakMap();
const own = (value, key) => Object.hasOwn(value, key);
const hexCode = value => {
  check(typeof value === 'string' && /^(?:0x)?[0-9a-f]{2,4}$/i.test(value.trim()), 'Invalid character-table hex code');
  return parseInt(value.trim().replace(/^0x/i, ''), 16);
};
function entry(row) {
  check(row && typeof row === 'object' && !Array.isArray(row), 'Invalid character-table entry');
  let index = row.index, width = row.width ?? 'full';
  check(index===undefined || (typeof index==='number' || (typeof index==='string' && /^\d+$/.test(index))),
    'Invalid character-table index');
  const code = row.code ?? row.token;
  if (code !== undefined) {
    const number = typeof code === 'number' ? integer(code, 0, 65535, 'Character code') : hexCode(code);
    const inferred = number >= 0x8000 ? 'full' : 'half';
    const id = number >= 0x8000 ? number - 0x8000 : number;
    check(index === undefined || Number(index) === id, 'Character-table index/token mismatch');
    check(row.width === undefined || row.width === inferred, 'Character-table width/token mismatch');
    index = id; width = inferred;
  }
  check(width === 'full' || width === 'half', 'Invalid character-table width');
  index = integer(Number(index), 0, width === 'full' ? 3174 : 255, 'Glyph index');
  const text = own(row, 'text') ? row.text : row.unicode;
  check(text === null || (typeof text === 'string' && text.length > 0 && text.length <= 64 &&
    !/[\u0000-\u001f\u007f\p{Surrogate}]/u.test(text)), 'Invalid character-table label');
  check(row.preferred === undefined || typeof row.preferred === 'boolean', 'Invalid preferred glyph flag');
  return {width, index, text, ...(row.preferred === true ? {preferred:true} : {})};
}

/** Normalize a project mapping. Never changes ROM bytes or installs a font. */
export function normalizeCharacterTable(value) {
  if (value === undefined || value === null) return null;
  if (normalized.has(value)) return value;
  check(value && typeof value === 'object' && value.format === CHARACTER_TABLE_FORMAT &&
    Object.keys(value).every(key => ['format','name','entries'].includes(key)), 'Invalid character-table document');
  check(typeof value.name === 'string' && value.name.trim() && value.name.length <= 160, 'Invalid character-table name');
  check(Array.isArray(value.entries) && value.entries.length > 0 && value.entries.length <= 7000, 'Invalid character-table entry count');
  const byCode = new Map();
  for (const raw of value.entries) {
    check(Object.keys(raw ?? {}).every(key => ['width','index','text','preferred'].includes(key)), 'Invalid normalized character-table fields');
    check(typeof raw?.index==='number' && typeof raw?.width==='string','Invalid normalized glyph index/width');
    const item = entry(raw), key = `${item.width}:${item.index}`;
    check(!byCode.has(key) || JSON.stringify(byCode.get(key)) === JSON.stringify(item), 'Conflicting character-table code');
    byCode.set(key,item);
  }
  check([...byCode.values()].some(row=>row.text !== null), 'Character table has no labelled glyphs');
  const result = Object.freeze({format:CHARACTER_TABLE_FORMAT, name:value.name.trim(),
    entries:Object.freeze([...byCode.values()].map(Object.freeze))});
  normalized.add(result);
  characterTableCodec(result); // Validate alias preferences before accepting the document.
  return result;
}

export function characterTableCodec(value) {
  const table = normalized.has(value) ? value : normalizeCharacterTable(value);
  if (!table) return null;
  if (codecs.has(table)) return codecs.get(table);
  const maps = {full:new Map(),half:new Map()}, aliases = {full:new Map(),half:new Map()};
  const preferred = new Set();
  for (const item of table.entries) {
    maps[item.width].set(item.index,item.text);
    if (item.text === null) continue;
    const group = aliases[item.width];
    if (!group.has(item.text)) group.set(item.text,[]);
    group.get(item.text).push(item);
    if (item.preferred) {
      const key = `${item.width}:${item.text}`;
      check(!preferred.has(key), 'Multiple preferred glyphs for one label'); preferred.add(key);
    }
  }
  const first = {full:new Map(),half:new Map()};
  for (const width of ['full','half']) {
    for (const [label, rows] of aliases[width]) first[width].set(label,rows.find(row=>row.preferred) ?? rows[0]);
  }
  const lengths = Object.fromEntries(['full','half'].map(width=>[width,
    [...new Set([...first[width].keys()].map(label=>label.length))].sort((a,b)=>b-a)]));
  const result = Object.freeze({
    hasWidth:width=>maps[width].size>0,
    label:(width,index)=>maps[width].get(index),
    match(text,at,width) {
      for (const length of lengths[width]) {
        const label=text.slice(at,at+length),row=first[width].get(label);
        if(row)return {kind:'glyph',code:row.index,width,length:label.length};
      }
      return null;
    },
    summary:()=>({name:table.name,entries:table.entries.length,
      labelled:table.entries.filter(row=>row.text!==null).length,
      aliases:[...aliases.full.values(),...aliases.half.values()].filter(rows=>rows.length>1).length}),
  });
  codecs.set(table,result);return result;
}

function delimited(source,separator) {
  const rows=[];let row=[],field='',quoted=false;
  for(let at=0;at<=source.length;at++) {
    const c=at===source.length?'\n':source[at];
    if(c==='"') {
      if(quoted&&source[at+1]==='"'){field+='"';at++;}
      else if(quoted||field==='')quoted=!quoted;
      else field+=c;
    } else if(!quoted&&(c===separator||c==='\n'||c==='\r')) {
      row.push(field);field='';
      if(c!==separator){if(c==='\r'&&source[at+1]==='\n')at++;rows.push(row);row=[];}
    } else field+=c;
  }
  check(!quoted,'Unterminated quoted character-table field');return rows;
}

/** External JSON, CSV, TSV or CODE=label tables; imported labels stay local. */
export function parseCharacterTable(input,name='Custom character table') {
  if(typeof input !== 'string')input=JSON.stringify(input);
  check(input.length<=4*1024*1024 && new TextEncoder().encode(input).length<=4*1024*1024,'Character table exceeds 4 MiB');
  const source=input.replace(/^\uFEFF/,'');let rows=[];
  if(/^\s*[\[{]/.test(source)) {
    const doc=JSON.parse(source);
    if(doc.format===CHARACTER_TABLE_FORMAT)return normalizeCharacterTable(doc);
    if(typeof doc.name==='string')name=doc.name;
    const list=doc.glyphs ?? doc.entries ?? doc;
    if(Array.isArray(list))rows=list.map(entry);
    else {
      check(list&&typeof list==='object','Invalid character-table JSON');
      const pairs=Object.entries(list);
      if(pairs.every(([,v])=>Array.isArray(v))) {
        rows=pairs.flatMap(([text,codes])=>codes.map(code=>entry({code,text})));
      } else if(pairs.every(([key])=>/^\d+$/.test(key)&&Number(key)<=3174)) {
        rows=pairs.map(([index,text])=>entry({index:Number(index),text}));
      } else rows=pairs.map(([code,text])=>entry({code,text}));
    }
  } else {
    const lines=source.split(/\r?\n/).filter(line=>line.trim()&&!/^\s*(#|\/\/)/.test(line));
    const clean=lines.join('\n'),separator=lines[0]?.includes('\t')?'\t':lines[0]?.includes(',')?',':null;
    if(separator) {
      const cells=delimited(clean,separator).filter(row=>row.some(cell=>cell!==''));
      const header=cells[0]?.map(cell=>cell.trim().toLowerCase());
      const labelled=header?.some(key=>['text','unicode','character'].includes(key));
      const columns=labelled?header:['code','text'];
      rows=cells.slice(labelled?1:0).map(cells=>{
        const obj=Object.fromEntries(columns.map((key,index)=>[key,cells[index]]));
        let text=obj.text??obj.unicode??obj.character;
        check(obj.preferred===undefined || ['','true','false'].includes(obj.preferred),'Invalid preferred glyph flag');
        if(!labelled&&text?.startsWith('"'))text=JSON.parse(text);
        if(text==='')text=null;
        return entry({...obj,text,index:obj.index===undefined?undefined:Number(obj.index),
          preferred:obj.preferred===undefined?undefined:obj.preferred==='true'});
      });
    } else rows=lines.map(line=>{
      const split=line.indexOf('=');check(split>0,'Expected CODE=label character-table row');
      const raw=line.slice(split+1);return entry({code:line.slice(0,split).trim(),text:raw.startsWith('"')?JSON.parse(raw):raw||null});
    });
  }
  return normalizeCharacterTable({format:CHARACTER_TABLE_FORMAT,name,entries:rows});
}
