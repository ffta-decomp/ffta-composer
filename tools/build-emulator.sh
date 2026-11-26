#!/bin/sh
# Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
# FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
set -eu
: "${EMSDK:?Set EMSDK to an installed Emscripten SDK}"
: "${FFTA_MGBA_SOURCE:?Set FFTA_MGBA_SOURCE to the mGBA 0.10.5 source tree}"
FFTA_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
FFTA_BUILD=${FFTA_WASM_BUILD:-/tmp/ffta-composer-wasm/build}
export EM_CONFIG="$EMSDK/.emscripten"
export PATH="$EMSDK/upstream/emscripten:$EMSDK/upstream/bin:$PATH"
emcmake cmake -S "$FFTA_MGBA_SOURCE" -B "$FFTA_BUILD" \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_STATIC=ON -DBUILD_SHARED=OFF \
  -DBUILD_QT=OFF -DBUILD_SDL=OFF -DBUILD_GL=OFF -DBUILD_GLES2=OFF -DBUILD_GLES3=OFF \
  -DBUILD_TEST=OFF -DBUILD_SUITE=OFF -DBUILD_EXAMPLE=OFF -DBUILD_LIBRETRO=OFF \
  -DM_CORE_GBA=ON -DM_CORE_GB=OFF -DDISABLE_DEPS=ON -DENABLE_SCRIPTING=OFF \
  -DUSE_PTHREADS=OFF -DUSE_DEBUGGERS=OFF -DUSE_ELF=OFF -DUSE_LUA=OFF \
  -DCMAKE_C_FLAGS='-O3 -flto -DDISABLE_THREADING -D_GNU_SOURCE' -DCMAKE_INTERPROCEDURAL_OPTIMIZATION=ON
cmake --build "$FFTA_BUILD" -j 4
mkdir -p "$FFTA_ROOT/src/emulator"
emcc "$FFTA_ROOT/runtime/mgba-host.c" "$FFTA_BUILD/libmgba.a" \
  -I"$FFTA_MGBA_SOURCE/include" -I"$FFTA_BUILD/include" \
  -O3 -flto -DDISABLE_THREADING -D_GNU_SOURCE \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createComposerCore \
  -sENVIRONMENT=web,node -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=134217728 \
  -sMAXIMUM_MEMORY=536870912 -sSTACK_SIZE=1048576 -sFILESYSTEM=0 \
  -sEXPORTED_RUNTIME_METHODS='["HEAPU8"]' \
  -sEXPORTED_FUNCTIONS='["_malloc","_free","_emu_create","_emu_destroy","_emu_frame","_emu_pixels","_emu_audio","_emu_audio_frames","_emu_frame_count","_emu_read8","_emu_read16","_emu_read32","_emu_write8","_emu_write16","_emu_state_size","_emu_save_state","_emu_load_state","_emu_battery_size","_emu_battery_data"]' \
  -o "$FFTA_ROOT/src/emulator/mgba-core.mjs"
node --input-type=module - "$FFTA_ROOT" <<'JS'
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=process.argv[2],binary=await readFile(`${root}/src/emulator/mgba-core.wasm`);
const hash=createHash('sha256').update(binary).digest('hex');
await writeFile(`${root}/src/emulator/core-bytes.mjs`,
  '// Generated mGBA 0.10.5 WASM. See third-party/mgba for MPL-2.0 source/license.\n'+
  `export const coreHash=${JSON.stringify(hash)};\nexport const coreBase64=${JSON.stringify(binary.toString('base64'))};\n`);
console.log(JSON.stringify({wasmBytes:binary.length,sha256:hash}));
JS
