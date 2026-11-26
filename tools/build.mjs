// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — https://github.com/ffta-decomp/ffta-composer ; see LICENSE and NOTICE.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {execFileSync} from 'node:child_process';

const root = new URL('../', import.meta.url);
const sourceRoot = new URL('src/', root);
const read = url => readFile(url, 'utf8');
const map = {};

async function include(url) {
  if (!url.href.startsWith(sourceRoot.href)) throw new Error('Offline bundle imports must stay under src/');
  const name = 'ffta/' + url.href.slice(sourceRoot.href.length);
  if (Object.hasOwn(map, name)) return name;

  map[name] = '';
  const source = await read(url);
  const imports = /\bfrom\s+(['"])(\.{1,2}\/[^'"]+\.mjs)\1/g;
  const dependencies = new Map();
  for (const [, , specifier] of source.matchAll(imports)) {
    if (!dependencies.has(specifier)) dependencies.set(specifier, await include(new URL(specifier, url)));
  }
  const bundled = source.replace(imports, (_, quote, specifier) => `from ${quote}${dependencies.get(specifier)}${quote}`);
  map[name] = 'data:text/javascript;base64,' + Buffer.from(bundled).toString('base64');
  return name;
}

const entry = await include(new URL('app.mjs', sourceRoot));
let revision=process.env.GITHUB_SHA;
if(!revision){try{revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{revision='dev';}}
revision=/^[0-9a-f]{7,40}$/i.test(revision)?revision.slice(0,7):'dev';
const thirdParty=await Promise.all(['SOURCE.md','MPL-2.0.txt','LGPL-2.1.txt','inih-BSD.txt','emscripten-LICENSE.txt'].map(name=>read(new URL(`third-party/mgba/${name}`,root))));
const html = (await read(new URL('index.html', root)))
  .replace('<small id="build-version">dev</small>',`<small id="build-version">${revision}</small>`)
  .replace('<!-- COMPOSER_LICENSE -->', `<!--\n${await read(new URL('NOTICE', root))}\n${await read(new URL('LICENSE', root))}\n${thirdParty.join('\n')}\n-->`)
  .replace('<link rel="stylesheet" href="./style.css">', `<style>\n${await read(new URL('style.css', root))}\n</style>`)
  .replace('<script type="module" src="./src/app.mjs"></script>',
    `<script type="importmap">${JSON.stringify({ imports: map })}</script>\n<script type="module">import "${entry}";</script>`);
const output = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('dist/ffta-composer.html', root));
await mkdir(dirname(output), { recursive: true });
await writeFile(output, html);
console.log(output);
