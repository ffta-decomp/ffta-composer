// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {parseCharacterTable,characterTableCodec,normalizeCharacterTable} from '../src/character-table.mjs';
import {plainTokens,preview,encodeLine,readLine,dialogueTextRuns,editDialogueRuns} from '../src/text.mjs';
import {openRom,importProject,build,plan} from '../src/project.mjs';
import {withCharacterTable,catalog} from '../src/rom.mjs';
import {u16,u32} from '../src/binary.mjs';
import {formatProjectText,parseProjectText} from '../src/project-text.mjs';
import {PROFILE} from '../src/profile.mjs';
import {CHARACTER_TABLE_PRESETS,presetCharacterTable,defaultCharacterTable,characterTablePresetId} from '../src/character-table-presets.mjs';

const mapping=()=>parseCharacterTable({name:'Synthetic',entries:[
  {code:'8000',text:'你'},{code:'8001',text:'好'},{code:'8002',text:null},
  {code:'8003',text:'你'},{code:'8004',text:'你好'},{code:'8005',text:' '},
  {code:'8006',text:'A'},{code:'8007',text:'1'},
]});

test('reviewed US Chinese table ships as a selectable preset with ROM-specific defaults',()=>{
  assert.deepEqual(CHARACTER_TABLE_PRESETS.map(p=>p.id),['us-retail','us-cn-v1.1']);
  const table=presetCharacterTable('us-cn-v1.1');
  assert.deepEqual(characterTableCodec(table).summary(),{name:'US Chinese v1.1',entries:3175,labelled:2731,aliases:43});
  assert.equal(defaultCharacterTable({profile:PROFILE.chineseId}),table);
  assert.equal(defaultCharacterTable({profile:PROFILE.id}),null);
  assert.equal(presetCharacterTable('us-retail'),null);
  assert.equal(characterTablePresetId(structuredClone(table)),'us-cn-v1.1');
  assert.equal(characterTablePresetId(mapping()),'custom');
  assert.throws(()=>presetCharacterTable('unrecognized'),/Unknown/);
});

test('external table formats preserve quoted fields, spaces, nulls, aliases and longest matches',()=>{
  const table=mapping(),codec=characterTableCodec(table);
  assert.equal(codec.summary().aliases,1);
  assert.deepEqual(plainTokens('你好 A1','standard',table).slice(0,-2).map(t=>t.code),[4,5,6,7]);
  assert.equal(preview([{kind:'glyph',width:'full',code:3}],false,table),'你');
  assert.equal(preview([{kind:'glyph',width:'full',code:2}],false,table),'⟨0x0002⟩');
  assert.equal(preview([{kind:'glyph',width:'half',code:0}],false,table),'ぁ');
  assert.equal(preview(plainTokens('A','alternate',table),false,table),'A');
  assert.throws(()=>plainTokens('你','alternate',table),/Glyph unavailable/);
  assert.throws(()=>plainTokens('B','standard',table),/Glyph unavailable in character table/);
  for(const source of ['8000=你\n8001=" "','8000\t你\n8001\t" "','code,text\n8000,你\n8001," "',
    '{"8000":"你","8001":" "}','{"你":["8000"]," ":["8001"]}',
    '{"0":"你","1":" "}']) {
    const parsed=parseCharacterTable(source);
    assert.deepEqual(plainTokens('你 ','standard',parsed).slice(0,-2).map(t=>t.code),[0,1]);
  }
  const comma=parseCharacterTable('token,unicode\n8000,"你,好"');
  assert.equal(plainTokens('你,好','standard',comma)[0].code,0);
  const preferred=parseCharacterTable({entries:[{code:'8000',text:'你'},{code:'8001',text:'你',preferred:true}]});
  assert.equal(plainTokens('你','standard',preferred)[0].code,1);
});

test('character tables reject conflicting codes, bad widths, control labels and ambiguous preferences',()=>{
  for(const doc of [
    {entries:[{code:'8000',text:'你'},{code:'8000',text:'好'}]},
    {entries:[{code:'9000',text:'你'}]},
    {entries:[{index:3175,unicode:'你'}]},
    {entries:[{code:'8000',index:1,text:'你'}]},
    {entries:[{code:'8000',text:'\n'}]},
    {entries:[{code:'8000',text:'你',preferred:true},{code:'8001',text:'你',preferred:true}]},
  ])assert.throws(()=>parseCharacterTable(doc));
  assert.throws(()=>parseCharacterTable('8000,"unterminated'));
  assert.throws(()=>parseCharacterTable('code,text,preferred\n8000,你,yes'),/preferred/);
  assert.throws(()=>normalizeCharacterTable({...mapping(),extra:true}));
});

test('safe edits preserve noncanonical aliases, opaque glyphs and controls',()=>{
  const table=mapping(),tokens=[{kind:'glyph',width:'full',code:3},...plainTokens('好','standard',table)];
  const bytes=encodeLine(tokens,'standard',16),line=readLine(bytes,0,bytes.length,table);
  assert.equal(line.preview,'你好');assert.deepEqual(line.tokens,tokens);
  const runs=dialogueTextRuns(tokens,'standard',table);
  assert.deepEqual(editDialogueRuns(runs,runs.map(r=>r.text),'standard',table),tokens);
  const unknown=[{kind:'glyph',width:'full',code:2}];
  assert.equal(dialogueTextRuns(unknown,'standard',table)[0].editable,false);
  assert.deepEqual(encodeLine(readLine(bytes,0,bytes.length,table).tokens,'standard',16),bytes);
});

const cnRom=process.env.FFTA_CN_ROM,cnTable=process.env.FFTA_CHARACTER_TABLE;
const real=async()=>{
  const input=new Uint8Array(await readFile(cnRom));
  const table=parseCharacterTable(await readFile(cnTable,'utf8'),'US Chinese v1.1');
  const {rom,project}=await openRom(input);return{input,table,rom,project};
};

test('owner-supplied US Chinese table keeps every labelled code, blank and duplicate alias', {skip:!cnTable},async()=>{
  const text=await readFile(cnTable,'utf8'),table=parseCharacterTable(text),codec=characterTableCodec(table);
  assert.deepEqual(table.entries,presetCharacterTable('us-cn-v1.1').entries);
  assert.equal(table.entries.length,3175);assert.equal(codec.summary().labelled,2731);assert.equal(codec.summary().aliases,43);
  for(const entry of table.entries) {
    const tokens=[{kind:'glyph',width:'full',code:entry.index}],bytes=encodeLine(tokens,'standard',16);
    const line=readLine(bytes,0,bytes.length,table);assert.deepEqual(line.tokens,tokens);
    if(entry.text!==null){assert.equal(line.preview,entry.text);assert.equal(preview(plainTokens(entry.text,'standard',table),false,table),entry.text);}
  }
});

test('real CN archive supports mapped previews, no-op bytes, partial edits and exact exported-ROM reopening', {skip:!cnRom||!cnTable},async()=>{
  const {input,table,rom,project}=await real();
  assert.equal(rom.profile,PROFILE.chineseId);assert.equal(rom.pages.size,88);
  assert.equal(characterTablePresetId(project.characterTable),'us-cn-v1.1');
  const mapped=withCharacterTable(rom,table);
  assert.match(mapped.pages.get('1').records[0].preview,/哇/);
  assert.notEqual(mapped.pages.get('1').records[0].preview,withCharacterTable(rom,null).pages.get('1').records[0].preview);
  const original=importProject(rom,project,{...project,characterTable:null});
  assert.equal(original.characterTable,null);
  assert.deepEqual(parseProjectText(formatProjectText(original,'lua')).characterTable,null);
  assert.deepEqual(build(rom,original).bytes,input);
  const config=importProject(rom,project,{...project,characterTable:table});
  assert.deepEqual(build(rom,config).bytes,input);
  assert.deepEqual(parseProjectText(formatProjectText(config,'lua')),config);
  const unchanged=structuredClone(config);
  for(const [key,page]of mapped.pages)for(const record of page.records)if(!record.opaque){
    unchanged.dialogue[`${key}:${record.index}`]={text:record.preview,flags:record.flags,encoding:record.encoding};
  }
  assert.equal(plan(rom,unchanged).diffs.length,0,'Unchanged text does not canonicalize aliases or controls');
  assert.deepEqual(build(rom,unchanged).bytes,input);
  const phrase='你好，世界！\n马修 123 ABC';
  const edited=importProject(rom,config,{...project,dialogue:{'1:0':{text:phrase}}});
  const before=input.slice(),output=build(rom,edited);
  const page=output.allocations.find(a=>a.kind==='dialoguePage'&&a.target==='1');
  const changedPage=output.bytes.slice(page.offset,page.offset+page.length);
  const record=readLine(changedPage,u16(changedPage,0),u16(changedPage,2),table);
  assert.equal(record.preview,phrase);
  assert.ok(record.tokens.filter(token=>token.kind==='glyph').every(token=>token.width==='full'));
  assert.ok(plainTokens('A 1','standard',table).slice(0,-2).every(token=>token.kind==='glyph'&&token.width==='full'));
  const lua=importProject(rom,project,parseProjectText(formatProjectText(edited,'lua')));
  assert.deepEqual(build(rom,lua).bytes,output.bytes);
  for(let i=1;i<mapped.pages.get('1').records.length;i++){
    const old=mapped.pages.get('1').records[i],start=u16(changedPage,i*2),end=i+1<mapped.pages.get('1').records.length?u16(changedPage,(i+1)*2):changedPage.length;
    assert.deepEqual(changedPage.slice(start,end),input.slice(old.start,old.end));
  }
  const prefix=output.bytes.slice(0,input.length);
  for(const p of output.pointers)prefix.set(input.slice(p.offset,p.offset+4),p.offset);
  assert.deepEqual(prefix,input);assert.deepEqual(input,before);
  assert.equal(u32(output.bytes,0x122b10),0x083a7ee4);
  const reopened=await openRom(output.bytes);
  assert.deepEqual(reopened.project,edited);assert.deepEqual(reopened.rom.bytes,input);
  assert.deepEqual(build(reopened.rom,reopened.project).bytes,output.bytes);
});

test('CN placeholders remain read-only and a custom table cannot authorize unknown engines', {skip:!cnRom||!cnTable},async()=>{
  const {input,table,rom,project}=await real();
  const opaque=[...rom.pages.values()].flatMap(p=>p.records).filter(r=>r.opaque);assert.equal(opaque.length,19);
  const mapped=withCharacterTable(rom,table);
  assert.ok(catalog(mapped,{includeDialogue:true}).pages.some(p=>p.lines.some(r=>r.opaque)));
  assert.throws(()=>importProject(rom,project,{...project,characterTable:table,dialogue:{'4:54':{text:'你好'}}}),/read-only/);
  const damaged=input.slice();damaged[0x100]^=1;
  await assert.rejects(openRom(damaged),/changes the US engine/);
  const dataMod=input.slice();dataMod[0x400000]^=1;
  const opened=await openRom(dataMod);assert.equal(opened.rom.profile,PROFILE.chineseId);
  assert.deepEqual(build(opened.rom,{...opened.project,characterTable:table}).bytes,dataMod);
});
