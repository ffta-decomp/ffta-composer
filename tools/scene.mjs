// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — https://github.com/ffta-decomp/ffta-composer ; see LICENSE and NOTICE.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { check } from '../src/binary.mjs';
import { catalog, withCharacterTable } from '../src/rom.mjs';
import { parseCharacterTable } from '../src/character-table.mjs';
import { describeStory } from '../src/story.mjs';
import { buildBattleListenerProbe, buildBattleVictoryProbe } from '../src/battle-probes.mjs';
import { formatProjectText, parseProjectText } from '../src/project-text.mjs';
import { FORMAT, build, importProject, inspectRom, openRom, plan, previewBuild } from '../src/project.mjs';

process.stdout.on('error', error => {
  if (error.code === 'EPIPE') process.exit(0);
  throw error;
});

const [, , command, input, ...args] = process.argv;
const json = document => JSON.stringify(document, null, 2) + '\n';
const readProject = async path => parseProjectText(await readFile(path, 'utf8'));

async function main() {
  const tableAt=args.indexOf('--character-table');
  let characterTable;
  if(tableAt>=0) {
    check(['catalog','story','project','diff','build'].includes(command),'Character tables apply to catalog, story, project, diff or build');
    check(args[tableAt+1] && args.lastIndexOf('--character-table')===tableAt,'Expected one --character-table FILE option');
    characterTable=parseCharacterTable(await readFile(args[tableAt+1],'utf8'),args[tableAt+1].split('/').at(-1));
    args.splice(tableAt,2);
  }
  check(input && ['inspect', 'catalog', 'story', 'project', 'diff', 'build', 'battle-probe', 'convert'].includes(command),
    'Usage: scene inspect ROM | catalog ROM [--programs] [--dialogue] | story ROM SCENE [PROJECT] [VARIANT] | project ROM [--lua] | diff ROM PROJECT | build ROM PROJECT OUTPUT | battle-probe ROM OUTPUT [--victory] | convert PROJECT json|lua');
  if (command === 'convert') {
    check(args.length === 1, 'Expected json or lua as the output format');
    const document = await readProject(input);
    check(document?.format === FORMAT, 'Expected an FFTA Composer project');
    process.stdout.write(formatProjectText(document, args[0]));
    return;
  }
  const romInput = new Uint8Array(await readFile(input));
  if (command === 'inspect') {
    check(!args.length, 'Expected only a ROM path');
    process.stdout.write(json(await inspectRom(romInput)));
    return;
  }
  let { rom, project } = await openRom(romInput);
  if(characterTable){project=importProject(rom,project,{...project,characterTable});rom=withCharacterTable(rom,characterTable);}
  if (command === 'battle-probe') {
    check(args.length === 1 || (args.length === 2 && args[1] === '--victory'), 'Expected an output ROM path and optional --victory');
    const compiler = args[1] ? buildBattleVictoryProbe : buildBattleListenerProbe;
    const { bytes, report } = compiler(rom);
    await writeFile(resolve(args[0]), bytes, { flag: 'wx' });
    process.stdout.write(json(report));
    return;
  }
  if (command === 'catalog') {
    check(args.every(arg => arg === '--programs' || arg === '--dialogue'), 'Unknown catalog option');
    process.stdout.write(json(catalog(rom, { includePrograms: args.includes('--programs'), includeDialogue: args.includes('--dialogue') })));
    return;
  }
  if (command === 'story') {
    check(args.length >= 1 && args.length <= 3, 'Expected scene ID, optional project and variant');
    const candidate = args[1] ? importProject(rom, project, await readProject(args[1])) : project;
    process.stdout.write(json(describeStory(rom, plan(rom, candidate), Number(args[0]), args[2] === undefined ? 0 : Number(args[2]))));
    return;
  }
  if (command === 'project') {
    check(!args.length || (args.length === 1 && args[0] === '--lua'), 'Expected optional --lua');
    process.stdout.write(formatProjectText(project, args.length ? 'lua' : 'json'));
    return;
  }
  check(args.length === (command === 'build' ? 2 : 1), 'Expected project and output paths');
  const candidate = importProject(rom, project, await readProject(args[0]));
  const report = command === 'build' ? build(rom, candidate) : previewBuild(rom, candidate);
  const { bytes, ...details } = report;
  if (command === 'build') {
    const output = resolve(args[1]);
    check(output !== resolve(input), 'Choose a different path for the generated ROM');
    await writeFile(output, bytes, { flag: 'wx' });
  }
  process.stdout.write(json({ format: 'ffta.scene-diff/v1', baseSha256: rom.sha256, ...details }));
}

main().catch(error => {
  process.stderr.write(error.message + '\n');
  process.exitCode = 1;
});
