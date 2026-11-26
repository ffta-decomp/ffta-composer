// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import {u32} from './binary.mjs';

// Native battle-word bank consumed by the shop. Rebuilds may move this bank
// and prepend entries, so follow its pointer and find the adjacent menu pair.
const SHOP_BANK_SITE=0x9028,MAX_WORDS=0x2ff,BASE=0x08000000;
const signatures={
  'us-cn':[[0x84,0x40,0x87,0xd4,0],[0x87,0xd5,0x81,0x3f,0]], // 购买 / 卖出
  us:[[1,0xb2,0xdf,0xe3,0],[1,0xc3,0xcf,0xd6,0xd6,0]], // Buy / Sell
};
export function detectTextEncoding(bytes) {
  const hits=[];
  if(bytes.length<SHOP_BANK_SITE+4)return {kind:'unknown',source:'shop-menu',matches:[]};
  const bank=u32(bytes,SHOP_BANK_SITE)-BASE;
  if(bank<0||bank+MAX_WORDS*4>bytes.length)return {kind:'unknown',source:'shop-menu',matches:[]};
  const matches=(index,pattern)=>{
    const at=u32(bytes,bank+index*4)-BASE;
    return at>=0&&at+pattern.length<=bytes.length&&pattern.every((value,i)=>bytes[at+i]===value);
  };
  for(const [encoding,[buy,sell]]of Object.entries(signatures)) {
    for(let index=0;index<MAX_WORDS-1;index++)if(matches(index,buy)&&matches(index+1,sell))
      hits.push({encoding,buy:index,sell:index+1});
  }
  const kinds=[...new Set(hits.map(hit=>hit.encoding))];
  return {kind:kinds.length===1?kinds[0]:kinds.length?'conflict':'unknown',source:'shop-menu',
    pointerSite:SHOP_BANK_SITE,bank,matches:hits};
}
