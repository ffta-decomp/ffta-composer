// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createNativeGame,enterFirstAct,NATIVE_CORE} from '../src/native-game.mjs';
import {coreBase64} from '../src/emulator/core-bytes.mjs';

test('the distributable WASM payload is valid and matches its recorded hash',async()=>{
  const bytes=Buffer.from(coreBase64,'base64');assert.ok(WebAssembly.validate(bytes));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),NATIVE_CORE.sha256);
  assert.deepEqual(bytes,await readFile(new URL('../src/emulator/mgba-core.wasm',import.meta.url)));
});
test('offline data-URL modules instantiate WASM without a relative URL or network request',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'composer-offline-test-')),html=join(directory,'index.html');
  try{
    execFileSync(process.execPath,['tools/build.mjs',html],{cwd:new URL('../',import.meta.url)});
    // Use the actual bundled modules in a browser-like environment. Node's
    // process global is hidden only inside this isolated child process.
    execFileSync(process.execPath,['--input-type=module','-e',`
      import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
      const html=await readFile(process.argv[1],'utf8');
      const map=JSON.parse(html.match(/<script type="importmap">([\\s\\S]*?)<\\/script>/)[1]).imports;
      const urls=new Map();function bundled(name){if(urls.has(name))return urls.get(name);
        const source=Buffer.from(map[name].split(',')[1],'base64').toString();
        const fixed=source.replace(/from (['"])(ffta\\/[^'"]+)\\1/g,(_,q,child)=>'from '+q+bundled(child)+q);
        const url='data:text/javascript;base64,'+Buffer.from(fixed).toString('base64');urls.set(name,url);return url;
      }
      const url=bundled('ffta/native-game.mjs');globalThis.window={};globalThis.process=undefined;
      globalThis.fetch=()=>{throw new Error('Unexpected network request');};
      const {createNativeGame}=await import(url);
      await assert.rejects(createNativeGame(new Uint8Array(1)),/could not load this ROM/);
    `,html],{maxBuffer:1024*1024});
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('invalid short cartridges fail before game execution',async()=>{
  await assert.rejects(createNativeGame(new Uint8Array(1)),/could not load/);
});
const us=process.env.FFTA_US_ROM;
test('WASM executes original GBA frames and sound; state restore is deterministic',{skip:!us},async()=>{
  const bytes=await readFile(us),before=createHash('sha256').update(bytes).digest('hex'),game=await createNativeGame(bytes);
  try{
    for(let i=0;i<900;i++)game.frame(0);
    assert.equal(game.snapshot().frame,900);assert.equal(game.snapshot().backend,'mgba-wasm');
    const pixels=Uint8Array.from(game.pixels());assert.ok(pixels.some((n,i)=>i%4!==3&&n>0));
    assert.ok(game.audio().some(n=>n!==0));
    const state=game.saveState();for(let i=0;i<60;i++)game.frame(0);
    const expected=Uint8Array.from(game.pixels());game.loadState(state);
    for(let i=0;i<60;i++)game.frame(0);assert.deepEqual(Uint8Array.from(game.pixels()),expected);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),before);
    assert.ok([65536,131072].includes(game.battery().length));
  }finally{game.destroy();}
  assert.throws(()=>game.frame(0),/closed/);
});
test('SAV import/export survives a fresh core instance',{skip:!us},async()=>{
  const rom=await readFile(us),game=await createNativeGame(rom);
  let save;
  try{for(let i=0;i<900;i++)game.frame(0);save=game.battery();}finally{game.destroy();}
  const fresh=await createNativeGame(rom,{save});
  try{assert.deepEqual(fresh.battery(),save);fresh.frame(0);assert.ok(fresh.pixels().length);}
  finally{fresh.destroy();}
  const padded=new Uint8Array(131072).fill(255);padded.set(save);
  const imported=await createNativeGame(rom,{save:padded});
  try{assert.deepEqual(imported.battery(),save);assert.ok(padded.subarray(save.length).every(n=>n===255));}
  finally{imported.destroy();}
});
test('native key input enters the first act on retail and Chinese cartridges without memory patches',
  {skip:!us},async()=>{
    const inputs=[us,process.env.FFTA_CN_ROM,...(process.env.FFTA_CN_UPDATED_ROMS?.split('|')??[])].filter(Boolean);
    for(const path of inputs){
      const game=await createNativeGame(await readFile(path));
      try{
        await enterFirstAct(game);assert.equal(game.snapshot().scene,1);
        assert.equal(game.read8(0x02002fc4+4),24);
        assert.equal(game.read8(0x02002fc4+4*264+4),15);
        assert.ok(game.read16(0x02002fc4+24)>0);
      }finally{game.destroy();}
    }
  });

// The original input recording is private game evidence and deliberately stays
// outside Git. This optional acceptance test replays keys from a cold cartridge;
// no savestate, RAM writes, or skipped VM operations are involved.
const recording=process.env.FFTA_SNOWBALL_REPLAY;
test('cold native Snowball replay reaches the original postbattle scene',
  {skip:!us||!recording},async()=>{
    const game=await createNativeGame(await readFile(us)),captures=new Map();let frames=0;
    const unit=(slot,offset)=>game.read16(0x02002fc4+slot*264+offset);
    try{
      for(const input of JSON.parse(await readFile(recording,'utf8'))){
        assert.ok(Number.isInteger(input.frames)&&input.frames>=0&&input.frames<=100000);
        assert.ok(Number.isInteger(input.keys)&&input.keys>=0&&input.keys<=1023);
        for(let n=0;n<input.frames;n++)game.frame(input.keys);
        frames+=input.frames;
        if(input.capture)captures.set(input.capture,{scene:game.snapshot().scene,
          lyle:unit(0,24),colin:unit(1,24),mewt:unit(5,24),ritzY:game.read8(0x02002fc4+6*264+247)});
      }
      assert.equal(game.snapshot().frame,frames);
      assert.equal(captures.get('cold-first-act').scene,1);
      assert.equal(captures.get('native-movement-and-hit').lyle,31);
      assert.equal(captures.get('native-movement-and-hit').ritzY,5);
      assert.equal(captures.get('native-enemy-action').colin,16);
      assert.equal(captures.get('native-enemy-action').mewt,7);
      assert.equal(captures.get('native-snowball-ended').scene,2);
      assert.equal(captures.get('native-snowball-ended').mewt,5);
      assert.equal(game.read8(game.read32(0x020159cc)+12),0);
    }finally{game.destroy();}
  });
