// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createNativeGame,NATIVE_CORE} from '../src/native-game.mjs';
const [romPath,inputsPath,output,statePath]=process.argv.slice(2);
if(!romPath||!inputsPath||!output)throw new Error('Usage: node tools/replay-native.mjs ROM INPUT.json OUTPUT_DIR [START.state]');
const out=resolve(output),root=fileURLToPath(new URL('../',import.meta.url));
if(out.startsWith(root))throw new Error('Game evidence must stay outside the repository');
await mkdir(out,{recursive:true});
const bytes=await readFile(romPath);
let save=null;
if(statePath){try{save=await readFile(statePath.replace(/\.state$/,'.sav'));}catch(error){if(error.code!=='ENOENT')throw error;}}
const game=await createNativeGame(bytes,{save});
if(statePath)game.loadState(await readFile(statePath));
const inputs=JSON.parse(await readFile(inputsPath,'utf8')),records=[];
function crc32(data){let n=-1;for(const value of data){n^=value;for(let b=0;b<8;b++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^-1)>>>0;}
function chunk(name,data){const tag=Buffer.from(name),header=Buffer.alloc(4),tail=Buffer.alloc(4);header.writeUInt32BE(data.length);tail.writeUInt32BE(crc32(Buffer.concat([tag,data])));return Buffer.concat([header,tag,data,tail]);}
function png(pixels){const head=Buffer.alloc(13);head.writeUInt32BE(240);head.writeUInt32BE(160,4);head[8]=8;head[9]=6;
  const rows=Buffer.alloc(160*(240*4+1));for(let y=0;y<160;y++)rows.set(pixels.subarray(y*960,(y+1)*960),y*961+1);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);}
function units(){const rows=[];for(const [pool,base,count]of[['primary',0x02000080,24],['scene',0x02002fc4,12]])for(let slot=0;slot<count;slot++){
  const at=base+slot*264,id=game.read8(at+4);if(!id)continue;
  rows.push({pool,slot,id,hp:game.read16(at+24),maxHp:game.read16(at+26),flags:game.read16(at+40),x:game.read8(at+246),y:game.read8(at+247),facing:game.read8(at+248)});
}return rows;}
for(const input of inputs){
  if(!Number.isInteger(input.frames)||input.frames<0||input.frames>100000||!Number.isInteger(input.keys)||input.keys<0||input.keys>1023)throw new Error('Invalid input record');
  for(let n=0;n<input.frames;n++)game.frame(input.keys);
  if(input.capture){
    if(!/^[a-zA-Z0-9_-]+$/.test(input.capture))throw new Error('Invalid capture name');
    const row={capture:input.capture,...game.snapshot(),units:units()};records.push(row);
    await writeFile(`${out}/${input.capture}.png`,png(game.pixels()));
    await writeFile(`${out}/${input.capture}.state`,game.saveState());
    const battery=game.battery();if(battery.length)await writeFile(`${out}/${input.capture}.sav`,battery);
    console.log(JSON.stringify(row));
  }
}
await writeFile(`${out}/report.json`,JSON.stringify({romSha256:createHash('sha256').update(bytes).digest('hex'),core:NATIVE_CORE,inputs,records},null,2));
game.destroy();
