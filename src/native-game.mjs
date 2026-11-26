// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import createComposerCore from './emulator/mgba-core.mjs';
import {coreBase64,coreHash} from './emulator/core-bytes.mjs';
import {check} from './binary.mjs';

export const GBA_KEYS=Object.freeze({A:1,B:2,Select:4,Start:8,Right:16,Left:32,Up:64,Down:128,R:256,L:512});
export const NATIVE_CORE=Object.freeze({name:'mGBA',version:'0.10.5',sha256:coreHash,fps:16777216/280896});

/** Navigate a fresh cartridge to the first act using only native key input. */
export async function enterFirstAct(game,{yieldControl=async()=>{},cancelled=()=>false}={}) {
  const advance=async(frames,keys)=>{
    for(let n=0;n<frames;n++){
      check(!cancelled(),'Game start was cancelled');game.frame(keys);
      if(n%60===59)await yieldControl();
    }
  };
  for(const [frames,keys]of[[900,0],[2,GBA_KEYS.Start],[180,0],[2,GBA_KEYS.Start],[120,0],[2,GBA_KEYS.A],[240,0]])await advance(frames,keys);
  for(let attempt=0;game.snapshot().scene!==1&&attempt<10;attempt++){
    await advance(2,GBA_KEYS.Start);await advance(60,0);await advance(2,GBA_KEYS.A);await advance(120,0);
  }
  check(game.snapshot().scene===1,'The game did not reach the first act; use the native controls to continue');
  return game.snapshot();
}

/** Real GBA execution. The user-selected ROM and save stay in memory. */
export async function createNativeGame(rom,{save=null}={}) {
  check(rom instanceof Uint8Array&&rom.length>0,'Select a ROM');
  const raw=atob(coreBase64),wasmBinary=Uint8Array.from(raw,c=>c.charCodeAt(0));
  // The offline import map loads this factory from a data URL. Supplying a
  // locator avoids resolving a relative .wasm URL against that data URL; the
  // bytes below are embedded, so no network request is made.
  const core=await createComposerCore({wasmBinary,locateFile:()=> 'embedded:mgba-core.wasm',print:()=>{},printErr:()=>{}});
  let destroyed=false;
  const alive=()=>check(!destroyed,'The game has been closed');
  const copyIn=data=>{const at=core._malloc(data.length||1);check(at,'Native memory allocation failed');core.HEAPU8.set(data,at);return at;};
  const rp=copyIn(rom),sp=save?copyIn(save):0;
  let loaded;
  try {loaded=core._emu_create(rp,rom.length,sp,save?.length??0);}
  finally {core._free(rp);if(sp)core._free(sp);}
  if(!loaded){core._emu_destroy();throw new Error('The native GBA core could not load this ROM');}
  function stateBytes() {
    alive();const size=core._emu_state_size(),at=core._malloc(size);
    try {check(core._emu_save_state(at,size),'Could not capture game state');return core.HEAPU8.slice(at,at+size);}
    finally {core._free(at);}
  }
  return Object.freeze({
    frame(keys=0){alive();core._emu_frame(keys);},
    pixels(){alive();return new Uint8ClampedArray(core.HEAPU8.buffer,core._emu_pixels(),240*160*4);},
    audio(){alive();const n=core._emu_audio_frames();return new Int16Array(core.HEAPU8.buffer,core._emu_audio(),n*2);},
    snapshot(){alive();return {backend:'mgba-wasm',core:NATIVE_CORE,frame:core._emu_frame_count(),scene:core._emu_read16(0x02002192),mode:core._emu_read8(0x02002190),keys:(~core._emu_read16(0x04000130))&1023};},
    saveState:stateBytes,
    loadState(data){alive();check(data instanceof Uint8Array&&data.length===core._emu_state_size(),'Incompatible game-state size');
      const at=copyIn(data);try{check(core._emu_load_state(at,data.length),'Incompatible game state');}finally{core._free(at);}},
    battery(){alive();const size=core._emu_battery_size(),at=core._emu_battery_data();return core.HEAPU8.slice(at,at+size);},
    read8(address){alive();return core._emu_read8(address>>>0);},
    read16(address){alive();return core._emu_read16(address>>>0);},
    read32(address){alive();return core._emu_read32(address>>>0)>>>0;},
    // Memory writes are an explicit research interface, never part of playback.
    write8(address,value){alive();core._emu_write8(address>>>0,value);},
    write16(address,value){alive();core._emu_write16(address>>>0,value);},
    destroy(){if(!destroyed){core._emu_destroy();destroyed=true;}},
  });
}
