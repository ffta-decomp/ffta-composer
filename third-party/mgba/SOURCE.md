# mGBA WASM source and attribution

FFTA Composer uses mGBA 0.10.5 by Jeffrey Pfau and mGBA contributors, under
MPL-2.0. Upstream source is unmodified. Release tag `0.10.5` resolves to
`26b7884bc25a5933960f3cdcd98bac1ae14d42e2`:

- Source: https://github.com/mgba-emu/mgba/tree/0.10.5
- Source archive: https://github.com/mgba-emu/mgba/archive/refs/tags/0.10.5.tar.gz
- mGBA license: [MPL-2.0.txt](MPL-2.0.txt)
- Included blip_buf audio resampler, Copyright (C) 2003–2009 Shay Green:
  [LGPL-2.1.txt](LGPL-2.1.txt), version 2.1 or later.
- Included inih parser, Copyright (c) 2009 Ben Hoyt:
  [inih-BSD.txt](inih-BSD.txt).
- Emscripten 4.0.10 runtime/toolchain notices:
  [emscripten-LICENSE.txt](emscripten-LICENSE.txt).

The GPL-3.0-only host adapter `runtime/mgba-host.c` and browser integration are
independent FFTA Composer code by hitsmaxft. Preserve these notices and identify
the reused scope when distributing modified builds. No game ROM, BIOS image,
save, or extracted game asset is included in the WASM core.

To rebuild, obtain the release source and an Emscripten 4.0.10 SDK, then run:

```sh
EMSDK=/path/to/emsdk FFTA_MGBA_SOURCE=/path/to/mgba-0.10.5 \
  sh tools/build-emulator.sh
```

The build produces the ESM factory, WASM binary, and embedded byte module under
`src/emulator/`. The main offline bundle embeds the same byte module and therefore
does not download a ROM or emulator binary from another service at runtime.
