@ Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
@ FFTA Composer — see LICENSE and NOTICE for attribution.
.syntax unified
.arch armv4t
.thumb
.text
.global ComposerReadMenuChoice
.type ComposerReadMenuChoice,%function
.thumb_func
ComposerReadMenuChoice:
    ldr  r2, =0x02002043       @ Native text choice result, save byte 19.
    ldrb r2, [r2]
    cmp  r2, #0
    beq  1f
    cmp  r2, #1
    beq  2f
    ldrh r2, [r0]             @ B is cancellation. Replay the preceding say.
    subs r2, #9
    strh r2, [r0]
    b    4f
1:
    adds r1, #1
    b    3f
2:
    adds r1, #3
3:
    ldrb r2, [r1]
    ldrb r3, [r1, #1]
    lsls r3, r3, #8
    orrs r2, r3
    ldrh r3, [r0]
    adds r2, r2, r3
    strh r2, [r0]
4:
    movs r0, #0x88
    lsls r0, r0, #1
    bx   lr
.size ComposerReadMenuChoice, .-ComposerReadMenuChoice

.align 2
.global ComposerSetEncounterHp
.type ComposerSetEncounterHp,%function
.thumb_func
ComposerSetEncounterHp:
    ldrb r3, [r1, #1]
    cmp  r3, #11
    bhi  1f
    movs r2, #33
    muls r3, r2
    lsls r3, r3, #3             @ Native encounter unit records are 264 bytes.
    ldr  r2, =0x02002FC4
    adds r3, r3, r2
    ldrb r2, [r3, #4]           @ A vacant record has no active unit ID.
    cmp  r2, #0
    beq  1f
    ldrb r2, [r1, #2]
    ldrb r1, [r1, #3]
    lsls r1, r1, #8
    orrs r2, r1
    beq  1f
    strh r2, [r3, #24]          @ Current HP.
    strh r2, [r3, #26]          @ Maximum HP.
1:
    movs r0, #0x88
    lsls r0, r0, #1
    bx   lr
.size ComposerSetEncounterHp, .-ComposerSetEncounterHp
.ltorg
