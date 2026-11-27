// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import {readFile,writeFile,realpath} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {check} from '../src/binary.mjs';
import {readScenePreviewContext} from '../src/scene-preview.mjs';
const [input,output,...extra]=process.argv.slice(2);
check(input&&output&&!extra.length,'Usage: node tools/package-scene-context.mjs CHECKPOINT_DIRECTORY OUTPUT.json');
const destination=resolve(output),repository=await realpath(fileURLToPath(new URL('../',import.meta.url)));
const distance=relative(repository,await realpath(dirname(destination)));
check(distance&&(isAbsolute(distance)||distance.startsWith('../')||distance.startsWith('..\\')),
  'Private game context must remain outside the repository');
const [manifest,state,save]=await Promise.all([
  readFile(resolve(input,'manifest.json'),'utf8'),readFile(resolve(input,'checkpoint.state')),readFile(resolve(input,'checkpoint.sav')),
]);
const text=JSON.stringify({format:'ffta.scene-preview-context/v1',manifest:JSON.parse(manifest),
  state:state.toString('base64'),save:save.toString('base64')});
await readScenePreviewContext(text);
await writeFile(destination,text,{flag:'wx'});
console.log(destination);
