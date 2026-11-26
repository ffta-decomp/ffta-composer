// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import {check} from './binary.mjs';
import {PROFILE} from './profile.mjs';
import {CHARACTER_TABLE_FORMAT,normalizeCharacterTable} from './character-table.mjs';
import {US_CN_V11_LABELS} from './character-tables/us-cn-v1.1.mjs';

const chinese=normalizeCharacterTable({format:CHARACTER_TABLE_FORMAT,name:'US Chinese v1.1',
  entries:US_CN_V11_LABELS.map((text,index)=>({width:'full',index,text}))});
const signature=JSON.stringify(chinese.entries),identities=new WeakMap([[chinese,'us-cn-v1.1']]);
export const CHARACTER_TABLE_PRESETS=Object.freeze([
  Object.freeze({id:'us-retail',name:'Original US'}),
  Object.freeze({id:'us-cn-v1.1',name:'US Chinese v1.1'}),
]);
export function presetCharacterTable(id) {
  check(CHARACTER_TABLE_PRESETS.some(p=>p.id===id),'Unknown character-table preset');
  return id==='us-cn-v1.1'?chinese:null;
}
export const defaultCharacterTable=rom=>rom.profile===PROFILE.chineseId?chinese:null;
export function characterTablePresetId(value) {
  if(!value)return 'us-retail';
  const table=normalizeCharacterTable(value);
  if(!identities.has(table))identities.set(table,JSON.stringify(table.entries)===signature?'us-cn-v1.1':'custom');
  return identities.get(table);
}
