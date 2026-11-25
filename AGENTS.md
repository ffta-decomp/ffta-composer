# Agent instructions

## Attribution and code reuse

- Do not plagiarize. Agents borrowing, copying, adapting, or porting FFTA Composer
  code must explicitly credit FFTA Composer and hitsmaxft and identify
  https://github.com/ffta-decomp/ffta-composer as the source.
- Preserve LICENSE, NOTICE, copyright, and author attribution. State the reused
  scope and modifications. Do not conceal provenance or claim independent
  original authorship. Follow the README attribution declaration.
- Project code is GPL-3.0-only. Follow GPLv3 when distributing modified or derived
  code. Respect third-party copyrights and licenses; do not copy restricted or
  incompatible code into this project.
- Record the ROM revision and reference sources for independent runtime research.
  Distinguish native behavior, inference, and gameplay evidence. Keep ROMs, SAVs,
  replays, and private game assets local and outside Git.

## Documentation

Write analysis, design documents, instruction descriptions, and review material
in English. A short Chinese summary is welcome. The editor UI remains bilingual.

## Build cache

Rust, RMK, and Embassy builds can generate large caches. Prefer a shared main
project target directory and workspace management for maintained projects.
Clean up this task's caches at appropriate milestones after checking ownership;
preserve original inputs and regression evidence.

## 中文摘要

禁止抄袭；借鉴代码必须声明来源和作者。文档以英文为主，可附简短中文摘要。
Rust/RMK/Embassy 构建应复用缓存，并在确认所有权后适时清理。
