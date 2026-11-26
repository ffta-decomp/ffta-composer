// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import {check,integer,u16,u32} from './binary.mjs';

const BASE=0x08000000, TABLE=0x390e44, PIXELS=0x69b89c, OAM=0x852e7c;
const shapes=[[[8,8],[16,16],[32,32],[64,64]],[[16,8],[32,8],[32,16],[64,32]],[[8,16],[8,32],[16,32],[32,64]]];
const range=(b,at,n)=>check(Number.isInteger(at)&&at>=0&&at+n<=b.length,'Truncated actor resource');

/** Read a static indexed-unit pose. Runtime battle handles require a unit binding. */
export function decodeActorPreview(rom,unitId,{facing=0,paletteMode=0}={}) {
  integer(unitId,2,94,'Indexed unit');integer(facing,0,3,'Facing');integer(paletteMode,0,2,'Palette mode');
  const b=rom.bytes,row=0x5273d8+unitId*14;range(b,row,14);
  const resource=u16(b,row+4);integer(resource,0,247,'Actor sprite resource');
  const group=u32(b,TABLE+resource*4)-BASE;range(b,group,24);
  // Two base views; the opposite horizontal directions use mirrored poses.
  const slot=[0,3,3,0][facing],descriptor=u32(b,group+slot*4)-BASE;
  range(b,descriptor,4);check(descriptor>=0x8540fc,'Unsupported actor descriptor');
  const frames=u32(b,descriptor);integer(frames,1,64,'Actor frame count');range(b,descriptor+4,frames*20);
  let pixelsAt,objectsAt,frameIndex;
  for(let i=0;i<frames;i++) {
    const at=descriptor+4+i*20,p=u32(b,at),o=u32(b,at+4);
    if(p===0xffff||p===0xffffffff||o===0xffffffff)continue;
    pixelsAt=PIXELS+p;objectsAt=OAM+o;frameIndex=i;break;
  }
  check(pixelsAt!==undefined&&pixelsAt>=PIXELS&&pixelsAt<OAM,'No drawable actor pose');
  check(objectsAt>=OAM&&objectsAt<0x8540fc,'Invalid actor OAM pointer');range(b,objectsAt,2);
  const count=u16(b,objectsAt);integer(count,1,9,'Actor object count');range(b,objectsAt+2,count*6);
  const objects=[];
  for(let i=0;i<count;i++) {
    const at=objectsAt+2+i*6,a=u16(b,at),c=u16(b,at+2),d=u16(b,at+4),shape=a>>>14;
    check(shape<3&&!(a&0x3f00)&&!(c&0x3e00)&&!(d&0xfc00),'Unsupported actor OAM mode');
    const [w,h]=shapes[shape][c>>>14],x=(c&511)>=256?(c&511)-512:c&511,y=(a&255)>=128?(a&255)-256:a&255;
    const source=pixelsAt+(d&1023)*32;range(b,source,w*h/2);check(source+w*h/2<=OAM,'Actor pixels leave bank');
    objects.push({x,y,w,h,source});
  }
  const left=Math.min(...objects.map(o=>o.x)),top=Math.min(...objects.map(o=>o.y));
  const width=Math.max(...objects.map(o=>o.x+o.w))-left,height=Math.max(...objects.map(o=>o.y+o.h))-top;
  check(width>0&&height>0&&width<=64&&height<=64,'Actor pose exceeds preview bounds');
  const sourceId=(b[row+8]>>>4)|((b[row+9]&15)<<4),paletteSlot=b[row+8]&15;
  integer(sourceId,0,9,'Actor palette source');
  const palette=sourceId ? [0x41a560,0x41bb40,0x41b060][paletteMode]+(sourceId-1)*32
    : [0x419d60,0x41b340,0x41a860][paletteMode]+paletteSlot*32;
  range(b,palette,32);
  const rgba=new Uint8ClampedArray(width*height*4);
  for(const o of objects.reverse())for(let y=0;y<o.h;y++)for(let x=0;x<o.w;x++) {
    const tile=(y>>>3)*(o.w>>>3)+(x>>>3),packed=b[o.source+tile*32+(y&7)*4+((x&7)>>>1)],index=(packed>>>((x&1)*4))&15;
    if(!index)continue;
    const rgb=u16(b,palette+index*2),dx=o.x-left+x,dy=o.y-top+y,at=(dy*width+dx)*4;
    rgba[at]=Math.round((rgb&31)*255/31);rgba[at+1]=Math.round(((rgb>>>5)&31)*255/31);rgba[at+2]=Math.round(((rgb>>>10)&31)*255/31);rgba[at+3]=255;
  }
  return {unitId,resource,width,height,left,top,pixels:rgba,mirror:facing>=2,descriptor,frameIndex,palette,
    presentation:'static-pose'};
}
