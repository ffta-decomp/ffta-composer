// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
// Independent analysis of the pinned US retail VM, not recovered game implementation.
export const VM_INSTRUCTION_DATA = [
  {
    "opcode": 0,
    "name": "startSceneScript",
    "length": 4,
    "handler": "0x08122b15",
    "fields": [
      {
        "key": "kind",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "delta",
        "offset": 2,
        "type": "i16"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Start a parallel child script with an explicit kind and the same script base. Its entry is relative to the next instruction; register its task handle."
  },
  {
    "opcode": 1,
    "name": "startAnonymousSceneScript",
    "length": 3,
    "handler": "0x08122b51",
    "fields": [
      {
        "key": "delta",
        "offset": 1,
        "type": "i16"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Start a parallel child script as in 00, with kind 128. This is not a stack-based call/return."
  },
  {
    "opcode": 2,
    "name": "finishSceneTask",
    "length": 1,
    "handler": "0x08122b8d",
    "fields": null,
    "returns": [
      "11e"
    ],
    "description": "Remove the current task from the registered handles, clear its owner at context +8, and terminate this script task."
  },
  {
    "opcode": 3,
    "name": "waitForSceneScript",
    "length": 2,
    "handler": "0x08122ba5",
    "fields": null,
    "returns": [
      "110",
      "113"
    ],
    "description": "Set the child-script filter at +7 and wait while a matching registered task exists. Kind 255 matches any task; this does not select an actor."
  },
  {
    "opcode": 4,
    "name": "waitForAllSceneScripts",
    "length": 1,
    "handler": "0x08122bc9",
    "fields": null,
    "returns": [
      "110",
      "113"
    ],
    "description": "Wait until all registered child-script tasks have finished by using filter 255."
  },
  {
    "opcode": 5,
    "name": "cancelSceneScripts",
    "length": 1,
    "handler": "0x08122bed",
    "fields": [],
    "returns": [
      "110"
    ],
    "description": "Release tasks in the 16 registered handle slots and clear the slots. This does not remove map actors."
  },
  {
    "opcode": 6,
    "name": "fadeSceneBrightness",
    "length": 4,
    "handler": "0x08122bfd",
    "fields": null,
    "returns": [
      "110",
      "115"
    ],
    "description": "Skip when the global scene-state halfword is 3; otherwise start a brightness task. Its factory uses high(b1)-low(b1), b2, and b3."
  },
  {
    "opcode": 7,
    "name": "restoreSceneBrightness",
    "length": 1,
    "handler": "0x08122c29",
    "fields": [],
    "returns": [
      "115"
    ],
    "description": "Start the mode-1 branch of the brightness factory with a null command pointer. Its exact restore/default result depends on the downstream callback."
  },
  {
    "opcode": 8,
    "name": "initializeSceneBlend",
    "length": 1,
    "handler": "0x08122c3d",
    "fields": [],
    "returns": [
      "100"
    ],
    "description": "Write 00, 03, 10, 00 to display-shadow offsets +4a through +4d, configuring blending, then yield until the next scheduling pass."
  },
  {
    "opcode": 9,
    "name": "clearSceneBlend",
    "length": 1,
    "handler": "0x08122c6d",
    "fields": [],
    "returns": [
      "100"
    ],
    "description": "Clear the BLDCNT and BLDALPHA display-shadow fields, then yield until the next scheduling pass."
  },
  {
    "opcode": 10,
    "name": "sceneOp0A",
    "length": 3,
    "handler": "0x08122ca9",
    "fields": [
      {
        "key": "actor",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "value",
        "offset": 2,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Resolve an actor and invoke the same callback on its child objects at +54 and +58 with value. The final visual meaning remains unresolved."
  },
  {
    "opcode": 11,
    "name": "fadeSceneAlpha",
    "length": 4,
    "handler": "0x08122d05",
    "fields": [
      {
        "key": "first",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "second",
        "offset": 2,
        "type": "u8"
      },
      {
        "key": "duration",
        "offset": 3,
        "type": "u8"
      }
    ],
    "returns": [
      "115"
    ],
    "description": "Create a two-channel alpha-blending interpolation task. Callback 081269e4 updates both BLDALPHA bytes and notifies the owner when complete."
  },
  {
    "opcode": 12,
    "name": "loadSceneMap",
    "length": 2,
    "handler": "0x08122d21",
    "fields": null,
    "returns": [
      "112"
    ],
    "description": "Use the current 40-byte content record's map when b1 is zero, otherwise use b1. Write save byte 7, set global scene state to 10, and wait for state 14."
  },
  {
    "opcode": 13,
    "name": "setSceneRuntimeState12",
    "length": 1,
    "handler": "0x08122d65",
    "fields": null,
    "returns": [
      "112"
    ],
    "description": "Set the global scene-state byte to 12 and wait for the outer controller to reach 14."
  },
  {
    "opcode": 14,
    "name": "setBackgroundLayers",
    "length": 2,
    "handler": "0x08122d75",
    "fields": [
      {
        "key": "enabled",
        "offset": 1,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Set display-shadow bits 0x0300 when enabled is nonzero, or clear them otherwise; background-layer visibility control."
  },
  {
    "opcode": 15,
    "name": "showDialogue",
    "length": 4,
    "handler": "0x08122dad",
    "fields": null,
    "returns": [
      "115"
    ],
    "description": "Create a 180-byte native dialogue event task. The native callback consumes its text selector, speaker, and presentation flags."
  },
  {
    "opcode": 16,
    "name": "setSceneContentWord",
    "length": 3,
    "handler": "0x08122dbd",
    "fields": [
      {
        "key": "value",
        "offset": 1,
        "type": "u16"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Write a halfword at content-state address 020020d0+a4. Its specific mission role is not assigned a general name."
  },
  {
    "opcode": 17,
    "name": "showSceneMessage",
    "length": 2,
    "handler": "0x08122dd5",
    "fields": [
      {
        "key": "selector",
        "offset": 1,
        "type": "u8"
      }
    ],
    "returns": [
      "115"
    ],
    "description": "Start the 180-byte message/prompt event whose callback is 08125de8. The final text-selection contract remains unresolved."
  },
  {
    "opcode": 18,
    "name": "showScenePrompt",
    "length": 2,
    "handler": "0x08122de9",
    "fields": null,
    "returns": [
      "115"
    ],
    "description": "If b1 has its high bit set, use mode 1 and b1-128; otherwise use mode 2 and b1. Start the 08125fa8 prompt/dialogue task, not a generic scene-mode bit write."
  },
  {
    "opcode": 19,
    "name": "startSceneContextEvent",
    "length": 1,
    "handler": "0x08122e1d",
    "fields": [],
    "returns": [
      "115"
    ],
    "description": "Start the 180-byte context event with callback 08126118 and clear the owner's completion flag. Its final interaction contract remains unresolved."
  },
  {
    "opcode": 20,
    "name": "waitForSceneCompletion",
    "length": 2,
    "handler": "0x08122e2d",
    "fields": [
      {
        "key": "b1",
        "offset": 1,
        "type": "u8"
      }
    ],
    "returns": [
      "115"
    ],
    "description": "Return asynchronous-completion wait status without starting an action. Unused in retail scripts; it can hang without a completion producer."
  },
  {
    "opcode": 21,
    "name": "waitFrames8",
    "length": 2,
    "handler": "0x08122e35",
    "fields": [
      {
        "key": "frames",
        "offset": 1,
        "type": "u8",
        "projectKey": "value"
      }
    ],
    "returns": [
      "114"
    ],
    "description": "Set the context +4 frame countdown from an unsigned byte and wait. Zero resumes after the next state polling pass."
  },
  {
    "opcode": 22,
    "name": "waitFrames16",
    "length": 3,
    "handler": "0x08122e41",
    "fields": [
      {
        "key": "frames",
        "offset": 1,
        "type": "u16"
      }
    ],
    "returns": [
      "114"
    ],
    "description": "Set the context +4 frame countdown from an unsigned halfword and wait, as in 15."
  },
  {
    "opcode": 23,
    "name": "setSceneRuntimeMode",
    "length": 2,
    "handler": "0x08122e51",
    "fields": null,
    "returns": [
      "11d"
    ],
    "description": "Write the scene-control byte in the global root. Modes 4 and 8 invoke additional transitions; then terminate the current script."
  },
  {
    "opcode": 24,
    "name": "transitionSceneState",
    "length": 2,
    "handler": "0x081224b9",
    "fields": [
      {
        "key": "transition",
        "offset": 1,
        "type": "u8"
      }
    ],
    "returns": [
      "110",
      "115",
      "11c"
    ],
    "description": "Write the transition state at +6. Remap 3 to 1, 6 to 3, and 7 to 5; modes 9/10/11/14 have dedicated workflows. Other paths enter the transition state machine."
  },
  {
    "opcode": 25,
    "name": "adjustScriptOffset",
    "length": 3,
    "handler": "0x08122e7d",
    "fields": null,
    "returns": [
      "110"
    ],
    "description": "Add a 16-bit displacement to PC; the dispatcher then adds the instruction length of 3. The resulting branch is relative to the next instruction."
  },
  {
    "opcode": 26,
    "name": "setStoryFlag",
    "length": 4,
    "handler": "0x08122e91",
    "fields": null,
    "returns": [
      "110"
    ],
    "description": "Set or clear a native bit flag through 080c9574. The actual bitfield covers IDs 0-1535; the handler does not allocate safe custom flags."
  },
  {
    "opcode": 27,
    "name": "writeNativeSaveByte",
    "length": 4,
    "handler": "0x08122ea9",
    "fields": [
      {
        "key": "index",
        "offset": 1,
        "type": "u16"
      },
      {
        "key": "value",
        "offset": 3,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Write the save byte at RAM 02002030+index through 080c95c0. This is separate from the bit flags used by 1a; unused in retail scripts."
  },
  {
    "opcode": 28,
    "name": "queueScene",
    "length": 3,
    "handler": "0x08122ec1",
    "fields": null,
    "returns": [
      "110"
    ],
    "description": "Append a halfword scene ID to the queue at 02002194 and increment its count at 0200219c. The handler does not check queue capacity."
  },
  {
    "opcode": 29,
    "name": "setSceneStatePair",
    "length": 2,
    "handler": "0x08122ef9",
    "fields": [
      {
        "key": "value",
        "offset": 1,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Write the same byte to 02002190 and 02002191. These belong to outer scene state and are not general custom variables."
  },
  {
    "opcode": 30,
    "name": "applySceneSelector",
    "length": 2,
    "handler": "0x08122f25",
    "fields": [
      {
        "key": "selector",
        "offset": 1,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Resolve b1 through 08036330, write 02001f69, clear 02003c2b, and apply through 08036584. The selector's final domain remains unresolved."
  },
  {
    "opcode": 31,
    "name": "placeScenePackedActor",
    "length": 6,
    "handler": "0x08122f59",
    "fields": [
      {
        "key": "type",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "packedXY",
        "offset": 2,
        "type": "u8"
      },
      {
        "key": "arg",
        "offset": 3,
        "type": "u8"
      },
      {
        "key": "packedXY2",
        "offset": 4,
        "type": "u8"
      },
      {
        "key": "arg2",
        "offset": 5,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Split two packed coordinate pairs and forward them with the other parameters to scene-placement factory 081242a0. Template identity and lifecycle depend on that factory."
  },
  {
    "opcode": 32,
    "name": "placeSceneActor",
    "length": 5,
    "handler": "0x08122f8d",
    "fields": null,
    "returns": [
      "110"
    ],
    "description": "Forward the low/high coordinate nibbles, facing, and the low flags nibble to actor-configuration helper 08124480. The opening uses a verified placement subset."
  },
  {
    "opcode": 33,
    "name": "sceneOp21",
    "length": 3,
    "handler": "0x08122fb9",
    "fields": [
      {
        "key": "selector",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "value",
        "offset": 2,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Apply a selector/value pair through 08124560. The final field and mode meanings remain unresolved."
  },
  {
    "opcode": 34,
    "name": "selectSceneTarget",
    "length": 2,
    "handler": "0x08122fcd",
    "fields": [
      {
        "key": "selector",
        "offset": 1,
        "type": "u8"
      }
    ],
    "returns": [
      "114"
    ],
    "description": "Call 08124648 for selector zero, otherwise 08125624, then enter countdown wait. The existing +4 value may matter; the final selection contract remains unresolved."
  },
  {
    "opcode": 35,
    "name": "clearActorFlag0",
    "length": 2,
    "handler": "0x08122fe9",
    "fields": [
      {
        "key": "actor",
        "offset": 1,
        "type": "u8"
      }
    ],
    "returns": [
      "100"
    ],
    "description": "Clear bit 0 of the resolved actor object's flags through 08125760 and preserve other bits; yield until the next scheduling pass."
  },
  {
    "opcode": 36,
    "name": "setActorFlag0",
    "length": 2,
    "handler": "0x08122ffd",
    "fields": [
      {
        "key": "actor",
        "offset": 1,
        "type": "u8"
      }
    ],
    "returns": [
      "100"
    ],
    "description": "Set bit 0 of the resolved actor object's flags through 08125760 and preserve other bits; yield until the next scheduling pass."
  },
  {
    "opcode": 37,
    "name": "turnActorAction",
    "length": 4,
    "handler": "0x08123011",
    "fields": [
      {
        "key": "actor",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "direction",
        "offset": 2,
        "type": "u8"
      },
      {
        "key": "mode",
        "offset": 3,
        "type": "u8"
      }
    ],
    "returns": [
      "115"
    ],
    "description": "Create a native asynchronous facing action through 08126dfc and callback 08126bfc, notifying the owner on completion. This differs from direct field write 29."
  },
  {
    "opcode": 38,
    "name": "createActionFromHandles",
    "length": 3,
    "handler": "0x0812302d",
    "fields": null,
    "returns": [
      "115"
    ],
    "description": "Create a two-actor action through 08126e34 with owner, first, second, first. Its exact action/following modes remain unresolved."
  },
  {
    "opcode": 39,
    "name": "playActorAction",
    "length": 5,
    "handler": "0x08123045",
    "fields": null,
    "returns": [
      "115"
    ],
    "description": "Create a unit action task through 08126ea4 and callback 08126d34. An action argument is not automatically a graphics-animation resource ID."
  },
  {
    "opcode": 40,
    "name": "refreshActorFacing",
    "length": 2,
    "handler": "0x08123065",
    "fields": null,
    "returns": [
      "110"
    ],
    "description": "Read the resolved actor's unit byte +f8 and reapply kind-1 state through 08124710. The opening uses this to refresh facing."
  },
  {
    "opcode": 41,
    "name": "setActorFacing",
    "length": 3,
    "handler": "0x08123081",
    "fields": null,
    "returns": [
      "110"
    ],
    "description": "Write actor byte +1f directly. It does not independently refresh or wait; the opening pairs it with 28."
  },
  {
    "opcode": 42,
    "name": "restoreSceneUnit",
    "length": 2,
    "handler": "0x08123099",
    "fields": [
      {
        "key": "actor",
        "offset": 1,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Restore current HP and MP from their maximum values, clear several status ranges, reset actor flags, and refresh through 08124d58. This is not arbitrary HP assignment."
  },
  {
    "opcode": 43,
    "name": "actorPaletteOverride",
    "length": 5,
    "handler": "0x081230a9",
    "fields": [
      {
        "key": "actor",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "first",
        "offset": 2,
        "type": "u8"
      },
      {
        "key": "condition",
        "offset": 3,
        "type": "u8"
      },
      {
        "key": "delay",
        "offset": 4,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Start actor palette-override callback 0812682c. The script continues immediately; conditions including 100 have original-palette restoration paths."
  },
  {
    "opcode": 44,
    "name": "sceneOp2C",
    "length": 4,
    "handler": "0x081230c5",
    "fields": [
      {
        "key": "selector",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "operand",
        "offset": 2,
        "type": "u8"
      },
      {
        "key": "value",
        "offset": 3,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Start the 72-byte task whose callback is 08126910 without waiting in the main script. Its final presentation semantics remain unresolved."
  },
  {
    "opcode": 45,
    "name": "setSceneUnitState",
    "length": 4,
    "handler": "0x081230dd",
    "fields": [
      {
        "key": "actor",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "stateIndex",
        "offset": 2,
        "type": "u8"
      },
      {
        "key": "value",
        "offset": 3,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Apply a unit-state write through 080cd884. When stateIndex is zero, additionally clear current HP at +18 and current MP at +1c."
  },
  {
    "opcode": 46,
    "name": "addActorPosition",
    "length": 8,
    "handler": "0x0812310d",
    "fields": [
      {
        "key": "actor",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "dx",
        "offset": 2,
        "type": "u16"
      },
      {
        "key": "dy",
        "offset": 4,
        "type": "u16"
      },
      {
        "key": "dz",
        "offset": 6,
        "type": "u16"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Add three 16-bit values to actor fields +08, +0c, and +0a with 16-bit wraparound. This is not a direct grid-tile assignment."
  },
  {
    "opcode": 47,
    "name": "setActorTile",
    "length": 4,
    "handler": "0x08122599",
    "fields": null,
    "returns": [
      "110"
    ],
    "description": "Update unit grid coordinates and actor position. Coordinate 255 preserves the corresponding current world axis shifted right by 5; update unit f6/f7 and f9/fa."
  },
  {
    "opcode": 48,
    "name": "setActorStateMasks",
    "length": 4,
    "handler": "0x0812314d",
    "fields": [
      {
        "key": "actor",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "mode",
        "offset": 2,
        "type": "u8"
      },
      {
        "key": "value",
        "offset": 3,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Mode 0 controls actor-flags bit 2. Mode 1 updates bits 0x1000/0x4000 according to value and invokes a refresh helper; their final meanings remain unresolved."
  },
  {
    "opcode": 49,
    "name": "replaceActorAction",
    "length": 5,
    "handler": "0x081231b1",
    "fields": [
      {
        "key": "actor",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "argument",
        "offset": 2,
        "type": "u16"
      },
      {
        "key": "presentation",
        "offset": 4,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Clear actor attachments, multiply the argument by 4 and truncate to u16 for action update, refresh presentation, and set actor-flags bit 0x100."
  },
  {
    "opcode": 50,
    "name": "refreshActorPaletteSlot",
    "length": 2,
    "handler": "0x081231fd",
    "fields": [
      {
        "key": "actor",
        "offset": 1,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Read the unit's native palette/slot value and update actor byte +1e. This does not create a unit."
  },
  {
    "opcode": 51,
    "name": "spawnSceneActor",
    "length": 9,
    "handler": "0x08123225",
    "fields": [
      {
        "key": "type",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "reference",
        "offset": 2,
        "type": "u8"
      },
      {
        "key": "x1",
        "offset": 3,
        "type": "u8"
      },
      {
        "key": "y1",
        "offset": 4,
        "type": "u8"
      },
      {
        "key": "x2",
        "offset": 5,
        "type": "u8"
      },
      {
        "key": "y2",
        "offset": 6,
        "type": "u8"
      },
      {
        "key": "x3",
        "offset": 7,
        "type": "u8"
      },
      {
        "key": "y3",
        "offset": 8,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Instantiate a scene actor from a type, reference unit, and three candidate tiles. Helper 08125444 chooses the first vacant tile and computes facing; this does not prove combat-turn registration."
  },
  {
    "opcode": 52,
    "name": "selectSceneUnit",
    "length": 3,
    "handler": "0x0812260d",
    "fields": [
      {
        "key": "unit",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "selection",
        "offset": 2,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "For selectors 254/255, scan eligible primary units and set flags 0x400. Otherwise select from the 12 encounter slots and write saved selection slot 0, 1, or 2."
  },
  {
    "opcode": 53,
    "name": "bindSavedSceneUnit",
    "length": 3,
    "handler": "0x08123235",
    "fields": [
      {
        "key": "savedSelection",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "binding",
        "offset": 2,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Bind a native unit handle from saved selection slot 0/1/2 using a one-based index. An empty selection can underflow; this is not an unchecked general binding API."
  },
  {
    "opcode": 54,
    "name": "beginSceneReward",
    "length": 2,
    "handler": "0x08123295",
    "fields": [
      {
        "key": "selector",
        "offset": 1,
        "type": "u8"
      }
    ],
    "returns": [
      "11c"
    ],
    "description": "Set transition state +6 to 7 and +4 to selector, then enter the mission reward/unit-result workflow. This is not an ordinary conditional branch."
  },
  {
    "opcode": 55,
    "name": "setSceneUnitFlag100",
    "length": 2,
    "handler": "0x081232a5",
    "fields": [
      {
        "key": "unit",
        "offset": 1,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Resolve a native unit and set bit 0x100 in its +28 flags halfword when present."
  },
  {
    "opcode": 56,
    "name": "sceneOp38",
    "length": 7,
    "handler": "0x081232c9",
    "fields": [
      {
        "key": "selector",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "value",
        "offset": 2,
        "type": "u16"
      },
      {
        "key": "mode",
        "offset": 4,
        "type": "u8"
      },
      {
        "key": "amount",
        "offset": 5,
        "type": "u16"
      }
    ],
    "returns": [
      "115"
    ],
    "description": "Pack selector, signed 16-bit value, mode, and amount for 08127c54. The final height/action meaning remains unresolved."
  },
  {
    "opcode": 57,
    "name": "moveActorByDelta",
    "length": 9,
    "handler": "0x08123321",
    "fields": [
      {
        "key": "actor",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "dx",
        "offset": 2,
        "type": "u16"
      },
      {
        "key": "dy",
        "offset": 4,
        "type": "u16"
      },
      {
        "key": "mode",
        "offset": 6,
        "type": "u8"
      },
      {
        "key": "argument",
        "offset": 7,
        "type": "u16"
      }
    ],
    "returns": [
      "115"
    ],
    "description": "Pack two words containing actor, signed deltas, mode, and argument for 08127b80. Opcode 3a uses the same path after computing deltas from target tiles."
  },
  {
    "opcode": 58,
    "name": "moveActorToTile",
    "length": 7,
    "handler": "0x08123399",
    "fields": [
      {
        "key": "actor",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "x",
        "offset": 2,
        "type": "i8"
      },
      {
        "key": "y",
        "offset": 3,
        "type": "i8"
      },
      {
        "key": "mode",
        "offset": 4,
        "type": "u8"
      },
      {
        "key": "argument",
        "offset": 5,
        "type": "u16"
      }
    ],
    "returns": [
      "115"
    ],
    "description": "Compute target-tile-center deltas through 08124e74; a negative coordinate produces zero delta for that axis. Create the action through 08127b80."
  },
  {
    "opcode": 59,
    "name": "sceneNoop3B",
    "length": 8,
    "handler": "0x081233f9",
    "fields": [
      {
        "key": "b1",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "b2",
        "offset": 2,
        "type": "u8"
      },
      {
        "key": "b3",
        "offset": 3,
        "type": "u8"
      },
      {
        "key": "b4",
        "offset": 4,
        "type": "u8"
      },
      {
        "key": "b5",
        "offset": 5,
        "type": "u8"
      },
      {
        "key": "b6",
        "offset": 6,
        "type": "u8"
      },
      {
        "key": "b7",
        "offset": 7,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "The retail handler only returns 110. This eight-byte instruction is a no-op and is unused by retail programs."
  },
  {
    "opcode": 60,
    "name": "sceneNoop3C",
    "length": 6,
    "handler": "0x08123401",
    "fields": [
      {
        "key": "b1",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "b2",
        "offset": 2,
        "type": "u8"
      },
      {
        "key": "b3",
        "offset": 3,
        "type": "u8"
      },
      {
        "key": "b4",
        "offset": 4,
        "type": "u8"
      },
      {
        "key": "b5",
        "offset": 5,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "The retail handler only returns 110. This six-byte instruction is a no-op and is unused by retail programs."
  },
  {
    "opcode": 61,
    "name": "moveActorByDeltaMode",
    "length": 10,
    "handler": "0x08122771",
    "fields": [
      {
        "key": "actor",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "dx",
        "offset": 2,
        "type": "u16"
      },
      {
        "key": "dy",
        "offset": 4,
        "type": "u16"
      },
      {
        "key": "mode",
        "offset": 6,
        "type": "u8"
      },
      {
        "key": "dispatch",
        "offset": 7,
        "type": "u8"
      },
      {
        "key": "argument",
        "offset": 8,
        "type": "u16"
      }
    ],
    "returns": [
      "115"
    ],
    "description": "Use signed deltas directly with the movement factories shared by 3e. Dispatch 1 calls 08127c10; other values call 08127bc4."
  },
  {
    "opcode": 62,
    "name": "moveActorOnGrid",
    "length": 8,
    "handler": "0x08123409",
    "fields": null,
    "returns": [
      "115"
    ],
    "description": "Compute target-tile deltas, write mode to payload byte 1 and argument to payload +6, then select 08127c10/08127bc4. Retail assembly confirms +6; one partial C recovery incorrectly writes +2."
  },
  {
    "opcode": 63,
    "name": "applySceneLine",
    "length": 4,
    "handler": "0x08123475",
    "fields": [
      {
        "key": "packedStart",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "packedEnd",
        "offset": 2,
        "type": "u8"
      },
      {
        "key": "value",
        "offset": 3,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "For distinct packed coordinates sharing an x or y coordinate, unpack both nibble pairs and invoke straight-line helper 08124974."
  },
  {
    "opcode": 64,
    "name": "applyActorSceneLine",
    "length": 4,
    "handler": "0x081234b5",
    "fields": [
      {
        "key": "actor",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "packedEnd",
        "offset": 2,
        "type": "u8"
      },
      {
        "key": "value",
        "offset": 3,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Read the start tile from the actor's unit f6/f7 and invoke 08124974 only when the target shares its row or column."
  },
  {
    "opcode": 65,
    "name": "runActorPath",
    "length": 4,
    "handler": "0x081234fd",
    "fields": [
      {
        "key": "actor",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "packedPath",
        "offset": 2,
        "type": "u8"
      },
      {
        "key": "delay",
        "offset": 3,
        "type": "u8"
      }
    ],
    "returns": [
      "115"
    ],
    "description": "Use low(b2) as a path slot and bits 4-6 as the repetition parameter for 08127af8. Bit 7 does not enter that parameter."
  },
  {
    "opcode": 66,
    "name": "runActorPathRange",
    "length": 4,
    "handler": "0x0812352d",
    "fields": [
      {
        "key": "actor",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "packedRange",
        "offset": 2,
        "type": "u8"
      },
      {
        "key": "delay",
        "offset": 3,
        "type": "u8"
      }
    ],
    "returns": [
      "115"
    ],
    "description": "Create a path request through 08127af8 with repetitions high-low+1, narrowed to a byte. A reversed range is not checked for safety."
  },
  {
    "opcode": 67,
    "name": "mergeScenePaths",
    "length": 3,
    "handler": "0x08123565",
    "fields": [
      {
        "key": "packedSources",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "destination",
        "offset": 2,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Merge two cached paths by removing the last point of the first and appending the whole second. Source slots are the low/high nibbles; the destination cache holds only 32 points."
  },
  {
    "opcode": 68,
    "name": "runActorCoordinatePath",
    "length": 5,
    "handler": "0x08123581",
    "fields": [
      {
        "key": "actor",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "path",
        "offset": 2,
        "type": "u8"
      },
      {
        "key": "b3",
        "offset": 3,
        "type": "u8"
      },
      {
        "key": "packed",
        "offset": 4,
        "type": "u8"
      }
    ],
    "returns": [
      "115"
    ],
    "description": "Create coordinate-path task 08127b40 with delay from the low nibble and tail from the high nibble of b4. Byte b3 is unused."
  },
  {
    "opcode": 69,
    "name": "loadScenePath",
    "length": 4,
    "handler": "0x081235a9",
    "fields": [
      {
        "key": "pathId",
        "offset": 1,
        "type": "u16"
      },
      {
        "key": "slot",
        "offset": 3,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Load a coordinate path from the relative directory at A19D18 into a cache slot, adding terrain height and clearing entry flags. This does not append new path assets."
  },
  {
    "opcode": 70,
    "name": "moveCameraToActor",
    "length": 4,
    "handler": "0x081227f9",
    "fields": [
      {
        "key": "actor",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "mode",
        "offset": 2,
        "type": "u8"
      },
      {
        "key": "amount",
        "offset": 3,
        "type": "u8"
      }
    ],
    "returns": [
      "110",
      "114",
      "115"
    ],
    "description": "Project an actor's tile position and terrain height into a camera target. Modes 1/2/0 use interpolation; mode 0 indexes a speed table and mode 3 starts 08128898."
  },
  {
    "opcode": 71,
    "name": "moveSceneCamera",
    "length": 7,
    "handler": "0x081228d5",
    "fields": null,
    "returns": [
      "110",
      "114",
      "115"
    ],
    "description": "Move the camera to signed coordinates. Mode 1 with amount zero sets immediately; modes 1/2 compute countdowns, mode 0 indexes a table, and mode 3 creates a task."
  },
  {
    "opcode": 72,
    "name": "prepareMapView",
    "length": 2,
    "handler": "0x081235c1",
    "fields": null,
    "returns": [
      "110",
      "119"
    ],
    "description": "Execute scene selector 08123e00. If native save byte 13 equals 1, return wait status 119. This reads a byte, not story bit flag 13."
  },
  {
    "opcode": 73,
    "name": "restoreSceneContext",
    "length": 2,
    "handler": "0x081235e5",
    "fields": [
      {
        "key": "restore",
        "offset": 1,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "For nonzero restore, release/restore scene resources and compact the roster when pending bit 8 is set. Zero ensures a restore actor exists; this is not a generic scene end."
  },
  {
    "opcode": 74,
    "name": "applyCurrentSceneSelection",
    "length": 1,
    "handler": "0x08123671",
    "fields": [],
    "returns": [
      "110"
    ],
    "description": "Apply the current content index to its context through 08096e18; related to mission/deployment selection."
  },
  {
    "opcode": 75,
    "name": "selectScenePresentation",
    "length": 2,
    "handler": "0x08123695",
    "fields": null,
    "returns": [
      "100"
    ],
    "description": "Select an audio/presentation preset. Value 255 reads current content-record byte +26, with a special global-state path using save byte 20. Apply the selector and yield."
  },
  {
    "opcode": 76,
    "name": "playSceneAudioDefinition",
    "length": 4,
    "handler": "0x08123771",
    "fields": [
      {
        "key": "definition",
        "offset": 1,
        "type": "u16"
      },
      {
        "key": "mode",
        "offset": 3,
        "type": "u8"
      }
    ],
    "returns": [
      "114"
    ],
    "description": "Apply native audio-definition service 08141570. Modes 255/2/4 prepare selected volume bytes at 100 and map to service channels 1/2; clear the countdown and wait one scheduling pass."
  },
  {
    "opcode": 77,
    "name": "fadeSceneAudio",
    "length": 5,
    "handler": "0x08123715",
    "fields": null,
    "returns": [
      "115"
    ],
    "description": "Replicate level into selected byte channels and start volume interpolation through 0812800c. Downstream calls reach floating-point volume setters; mask bit 3 is not a verified fourth audio track."
  },
  {
    "opcode": 78,
    "name": "loadEncounterUnits",
    "length": 1,
    "handler": "0x081237d1",
    "fields": null,
    "returns": [
      "110",
      "11a"
    ],
    "description": "Populate units from explicit unit/placement banks when available, otherwise from current content. Native save byte 13 equal to 1 selects wait state 11a."
  },
  {
    "opcode": 79,
    "name": "updateSceneActorTransition",
    "length": 3,
    "handler": "0x08123815",
    "fields": [
      {
        "key": "selector",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "update",
        "offset": 2,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "For nonzero update, refresh selected unit actions; otherwise filter actors for transition. This does not register a newly spawned combatant."
  },
  {
    "opcode": 80,
    "name": "sceneOp50",
    "length": 2,
    "handler": "0x08123835",
    "fields": [
      {
        "key": "value",
        "offset": 1,
        "type": "u8"
      }
    ],
    "returns": [
      "115"
    ],
    "description": "Start a context action through 081286dc. Its exact control/input-feedback semantics remain unresolved."
  },
  {
    "opcode": 81,
    "name": "resetSceneActionContext",
    "length": 1,
    "handler": "0x08123849",
    "fields": [],
    "returns": [
      "110"
    ],
    "description": "Call 0809a260(context, 0) and then 080a9548. This is not established as a generic mission-completion instruction."
  },
  {
    "opcode": 82,
    "name": "clearSceneStoryUnits",
    "length": 1,
    "handler": "0x08123861",
    "fields": [],
    "returns": [
      "110"
    ],
    "description": "Clear story-unit state, commit unit-property and occupancy flags, and refresh values for the 24 primary units."
  },
  {
    "opcode": 83,
    "name": "selectSceneEncounter",
    "length": 3,
    "handler": "0x08123899",
    "fields": null,
    "returns": [
      "110"
    ],
    "description": "Search the 12-byte records at 563a70 in descending order for identifier, write selected record 3c2a, and select its content. Identifier is not a direct unit-bank address."
  },
  {
    "opcode": 84,
    "name": "applySceneSystemValue",
    "length": 2,
    "handler": "0x08123901",
    "fields": [
      {
        "key": "value",
        "offset": 1,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Apply value through 080bd11c and write native save byte 53. The final system-property domain remains unresolved."
  },
  {
    "opcode": 85,
    "name": "sceneOp55",
    "length": 5,
    "handler": "0x0812391d",
    "fields": [
      {
        "key": "b1",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "b2",
        "offset": 2,
        "type": "u8"
      },
      {
        "key": "b3",
        "offset": 3,
        "type": "u8"
      },
      {
        "key": "b4",
        "offset": 4,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Pass four bytes to graphics/map helper 0801ddb4. Its final visual effect remains unresolved."
  },
  {
    "opcode": 86,
    "name": "sceneOp56",
    "length": 1,
    "handler": "0x08123939",
    "fields": [],
    "returns": [
      "110"
    ],
    "description": "Call 0801de20 with constant 3. The final effect remains unresolved."
  },
  {
    "opcode": 87,
    "name": "initializeSceneTaskContext",
    "length": 1,
    "handler": "0x08123949",
    "fields": null,
    "returns": [
      "116"
    ],
    "description": "Start task-context initialization through 080d376c and wait for 080d37f8."
  },
  {
    "opcode": 88,
    "name": "clearSceneTaskContext",
    "length": 1,
    "handler": "0x08123959",
    "fields": null,
    "returns": [
      "117"
    ],
    "description": "Start task-state clearing through 080d37ac and wait for 080d37c4."
  },
  {
    "opcode": 89,
    "name": "selectCurrentSceneEntity",
    "length": 2,
    "handler": "0x08123969",
    "fields": null,
    "returns": [
      "110"
    ],
    "description": "Resolve an actor and store it in the current-entity global slot. This does not create a unit binding."
  },
  {
    "opcode": 90,
    "name": "selectSceneTaskIndex",
    "length": 2,
    "handler": "0x0812397d",
    "fields": [
      {
        "key": "oneBasedIndex",
        "offset": 1,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Pass b1-1, narrowed to u16, to 08124fd0. Input zero becomes 65535; this is not a safe unchecked general index."
  },
  {
    "opcode": 91,
    "name": "waitForSceneTask",
    "length": 1,
    "handler": "0x08123995",
    "fields": null,
    "returns": [
      "110",
      "118"
    ],
    "description": "If 080d3878 reports completion, release and clear the task context. Otherwise enter polling/cleanup wait state 118."
  },
  {
    "opcode": 92,
    "name": "sceneOp5C",
    "length": 3,
    "handler": "0x081239c5",
    "fields": [
      {
        "key": "value",
        "offset": 1,
        "type": "u16"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Queue dedicated action B0 with a halfword through 0812b7d0. Its final mission/UI contract remains unresolved."
  },
  {
    "opcode": 93,
    "name": "setSceneContentBytes",
    "length": 3,
    "handler": "0x081239dd",
    "fields": [
      {
        "key": "first",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "second",
        "offset": 2,
        "type": "u8"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Write content-state bytes 020020d0+a6/a7. These are not custom variables."
  },
  {
    "opcode": 94,
    "name": "sceneOp5E",
    "length": 1,
    "handler": "0x081239f9",
    "fields": [],
    "returns": [
      "115"
    ],
    "description": "Queue dedicated action 44 through 0812bd2c. Its final UI workflow remains unresolved."
  },
  {
    "opcode": 95,
    "name": "sceneOp5F",
    "length": 2,
    "handler": "0x08123a09",
    "fields": [
      {
        "key": "value",
        "offset": 1,
        "type": "u8"
      }
    ],
    "returns": [
      "115"
    ],
    "description": "Queue dedicated action 44 with a byte through 0812bce4. Its final UI workflow remains unresolved."
  },
  {
    "opcode": 96,
    "name": "sceneOp60",
    "length": 1,
    "handler": "0x08123a1d",
    "fields": [],
    "returns": [
      "115"
    ],
    "description": "Queue dedicated action 08 through 0812bd0c. This is not a general key-reading instruction."
  },
  {
    "opcode": 97,
    "name": "consumeSceneSaveFlag",
    "length": 1,
    "handler": "0x08123a2d",
    "fields": [],
    "returns": [
      "110",
      "11b"
    ],
    "description": "When native save byte 13 is 1, clear it, set a 16-frame countdown and content flag 40, then wait and invoke 08004c40. Otherwise continue immediately."
  },
  {
    "opcode": 98,
    "name": "sceneOp62",
    "length": 9,
    "handler": "0x08123a61",
    "fields": [
      {
        "key": "payload",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "b2",
        "offset": 2,
        "type": "u8"
      },
      {
        "key": "b3",
        "offset": 3,
        "type": "u8"
      },
      {
        "key": "b4",
        "offset": 4,
        "type": "u8"
      },
      {
        "key": "b5",
        "offset": 5,
        "type": "u8"
      },
      {
        "key": "b6",
        "offset": 6,
        "type": "u8"
      },
      {
        "key": "b7",
        "offset": 7,
        "type": "u8"
      },
      {
        "key": "wait",
        "offset": 8,
        "type": "u8"
      }
    ],
    "returns": [
      "110",
      "115"
    ],
    "description": "Create dedicated action 108 through 0812c4e4. A nonzero wait byte waits for completion; zero lets the script continue. The remaining payload contract is unresolved."
  },
  {
    "opcode": 99,
    "name": "resetSceneView",
    "length": 1,
    "handler": "0x08123a7d",
    "fields": [],
    "returns": [
      "114"
    ],
    "description": "Reset scene-view state through 08125938, then wait according to the current +4 countdown. The exact visual reset scope remains unresolved."
  },
  {
    "opcode": 100,
    "name": "branchIfUnitUsable",
    "length": 4,
    "handler": "0x08123a8d",
    "fields": [
      {
        "key": "unit",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "delta",
        "offset": 2,
        "type": "i16"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Branch when the selected unit exists and predicates 080c8260 and 080c8240 both return zero."
  },
  {
    "opcode": 101,
    "name": "branchIfStoryFlag",
    "length": 5,
    "handler": "0x08123acd",
    "fields": [
      {
        "key": "flag",
        "offset": 1,
        "type": "u16"
      },
      {
        "key": "delta",
        "offset": 3,
        "type": "i16"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Branch when the indexed native story bit flag is nonzero. High-level when uses this instruction."
  },
  {
    "opcode": 102,
    "name": "addOffsetWhenTargetFlagSet",
    "length": 5,
    "handler": "0x08123afd",
    "fields": null,
    "returns": [
      "110"
    ],
    "description": "Branch when a unit exists and the requested bit of its +28 flags halfword is set. The safe bit range is 0-15."
  },
  {
    "opcode": 103,
    "name": "branchIfSceneCounterAbove",
    "length": 4,
    "handler": "0x08123b35",
    "fields": [
      {
        "key": "threshold",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "delta",
        "offset": 2,
        "type": "i16"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Branch when RAM byte 020021b4 is strictly greater than threshold, not less than threshold."
  },
  {
    "opcode": 104,
    "name": "branchIfSceneSelector",
    "length": 4,
    "handler": "0x08123b69",
    "fields": [
      {
        "key": "selector",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "delta",
        "offset": 2,
        "type": "i16"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Resolve the current saved selector through 08036350. Nonzero b1 requires equality; b1 zero accepts resolved slots 1-6."
  },
  {
    "opcode": 105,
    "name": "branchIfDefinitionFlag1",
    "length": 3,
    "handler": "0x08123bc9",
    "fields": [
      {
        "key": "delta",
        "offset": 1,
        "type": "i16"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Branch when bit 0 is set in the current 563a70 definition record's flags at +8."
  },
  {
    "opcode": 106,
    "name": "branchIfDefinitionFlag2Clear",
    "length": 3,
    "handler": "0x08123c0d",
    "fields": [
      {
        "key": "delta",
        "offset": 1,
        "type": "i16"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Branch when bit 1 is clear in the current definition record's flags; its polarity differs from 69."
  },
  {
    "opcode": 107,
    "name": "sceneNoop6B",
    "length": 1,
    "handler": "0x08123c51",
    "fields": [],
    "returns": [
      "110"
    ],
    "description": "Return 110 with no side effects. This no-op is unused in retail programs."
  },
  {
    "opcode": 108,
    "name": "branchIfUnitAvailable",
    "length": 4,
    "handler": "0x08123c59",
    "fields": [
      {
        "key": "unit",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "delta",
        "offset": 2,
        "type": "i16"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Branch when a unit exists and exclusion predicates 080c8348, 080cd92c, 080cd95c, 080cd9a4, and 080cd9bc all return zero."
  },
  {
    "opcode": 109,
    "name": "branchIfContentByteClear",
    "length": 3,
    "handler": "0x08123cc1",
    "fields": [
      {
        "key": "delta",
        "offset": 1,
        "type": "i16"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Branch when byte +22 of the current 40-byte content record is zero."
  },
  {
    "opcode": 110,
    "name": "branchIfNativeSaveFlag",
    "length": 3,
    "handler": "0x08123cfd",
    "fields": [
      {
        "key": "delta",
        "offset": 1,
        "type": "i16"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Branch when native save byte 13 equals exactly 1, not when story bit flag 13 is set."
  },
  {
    "opcode": 111,
    "name": "branchIfHpAbove",
    "length": 5,
    "handler": "0x08122985",
    "fields": [
      {
        "key": "unit",
        "offset": 1,
        "type": "u8"
      },
      {
        "key": "threshold",
        "offset": 2,
        "type": "u8"
      },
      {
        "key": "delta",
        "offset": 3,
        "type": "i16"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "For an active unit passing two exclusion checks, branch when current HP exceeds threshold. Thresholds 0-9 are absolute; larger values compare against floor(maxHP*threshold/100), strictly greater."
  },
  {
    "opcode": 112,
    "name": "branchIfNoEligibleUnit",
    "length": 3,
    "handler": "0x08122a01",
    "fields": [
      {
        "key": "delta",
        "offset": 1,
        "type": "i16"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Scan current scene units, excluding specified states and property-1 values 94/10/9/4/12. Branch only when no eligible unit remains; this is not simply all enemy HP equal to zero."
  },
  {
    "opcode": 113,
    "name": "branchOnFirstChoice",
    "length": 3,
    "handler": "0x08123d29",
    "fields": [
      {
        "key": "delta",
        "offset": 1,
        "type": "i16"
      }
    ],
    "returns": [
      "110"
    ],
    "description": "Read native menu result SaveByte19. Branch for low byte zero; the second choice and B cancellation (255) continue sequentially. Native menu branching already exists."
  }
];
