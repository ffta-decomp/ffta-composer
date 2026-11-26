/* Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
 * FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
 * Original host adapter using the public mGBA 0.10.5 mCore API.
 * mGBA remains MPL-2.0 code by Jeffrey Pfau and contributors. */
#include <mgba/core/core.h>
#include <mgba/core/config.h>
#include <mgba/core/log.h>
#include <mgba/core/blip_buf.h>
#include <mgba/gba/core.h>
#include <mgba-util/vfs.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

static struct mCore *game;
static color_t pixels[240 * 160];
static int16_t samples[8192];
static unsigned sample_count;
static void *save_copy;
static size_t save_size;
_Static_assert(sizeof(color_t) == 4, "The browser host needs 32-bit colors");
static void quiet(struct mLogger *logger, int category, enum mLogLevel level,
                  const char *format, va_list arguments) {
    (void)logger; (void)category; (void)level; (void)format; (void)arguments;
}
static struct mLogger logger = {.log = quiet};

void emu_destroy(void) {
    free(save_copy); save_copy = NULL; save_size = 0;
    if (game) {mCoreConfigDeinit(&game->config); game->deinit(game); game = NULL;}
    sample_count = 0;
}
int emu_create(const uint8_t *rom, unsigned length, const uint8_t *save, unsigned save_length) {
    emu_destroy();
    if (!rom || length < 0x100 || length > 0x2000000) return 0;
    mLogSetDefaultLogger(&logger);
    game = GBACoreCreate();
    if (!game || !game->init(game)) {game = NULL; return 0;}
    mCoreInitConfig(game, "ffta-composer");
    mCoreConfigSetDefaultIntValue(&game->config, "skipBios", 1);
    mCoreConfigSetDefaultIntValue(&game->config, "useBios", 0);
    mCoreConfigSetDefaultIntValue(&game->config, "volume", 256);
    mCoreConfigSetDefaultValue(&game->config, "idleOptimization", "remove");
    mCoreConfigMap(&game->config, &game->opts);
    game->loadConfig(game, &game->config);
    struct VFile *file = VFileMemChunk(rom, length);
    if (!file || !game->loadROM(game, file)) {if (file) file->close(file); emu_destroy(); return 0;}
    if (save_length) {
        struct VFile *battery = VFileMemChunk(save, save_length);
        if (!battery || !game->loadSave(game, battery)) {if (battery) battery->close(battery); emu_destroy(); return 0;}
    }
    game->setVideoBuffer(game, pixels, 240);
    game->setAudioBufferSize(game, 4096);
    blip_set_rates(game->getAudioChannel(game, 0), game->frequency(game), 48000);
    blip_set_rates(game->getAudioChannel(game, 1), game->frequency(game), 48000);
    game->reset(game);
    memset(pixels, 0, sizeof(pixels));
    return 1;
}
void emu_frame(unsigned keys) {
    if (!game) return;
    game->setKeys(game, keys & 0x3ff);
    game->runFrame(game);
    for (unsigned i = 0; i < 240 * 160; i++) pixels[i] |= 0xff000000;
    int count = blip_samples_avail(game->getAudioChannel(game, 0));
    int right = blip_samples_avail(game->getAudioChannel(game, 1));
    if (count > right) count = right;
    if (count > 4096) count = 4096;
    sample_count = count;
    blip_read_samples(game->getAudioChannel(game, 0), samples, count, 1);
    blip_read_samples(game->getAudioChannel(game, 1), samples + 1, count, 1);
}
uintptr_t emu_pixels(void) {return (uintptr_t)pixels;}
uintptr_t emu_audio(void) {return (uintptr_t)samples;}
unsigned emu_audio_frames(void) {return sample_count;}
unsigned emu_frame_count(void) {return game ? game->frameCounter(game) : 0;}
unsigned emu_read8(unsigned address) {return game ? game->busRead8(game, address) : 0;}
unsigned emu_read16(unsigned address) {return game ? game->busRead16(game, address) : 0;}
unsigned emu_read32(unsigned address) {return game ? game->busRead32(game, address) : 0;}
void emu_write8(unsigned address, unsigned value) {if (game) game->busWrite8(game, address, value);}
void emu_write16(unsigned address, unsigned value) {if (game) game->busWrite16(game, address, value);}
unsigned emu_state_size(void) {return game ? game->stateSize(game) : 0;}
int emu_save_state(uint8_t *data, unsigned length) {return game && length == game->stateSize(game) && game->saveState(game, data);}
int emu_load_state(const uint8_t *data, unsigned length) {return game && length == game->stateSize(game) && game->loadState(game, data);}
unsigned emu_battery_size(void) {
    free(save_copy); save_copy = NULL; save_size = 0;
    if (game) save_size = game->savedataClone(game, &save_copy);
    return save_size;
}
uintptr_t emu_battery_data(void) {return (uintptr_t)save_copy;}
