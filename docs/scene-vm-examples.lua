-- Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
-- FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
-- Reference expressions, not a playable project or a script to execute in a standalone Lua VM.
-- All zero operands are encoding examples only; do not execute them blindly in a game.
return {
  -- 0x00 preserve-native-layout
  startSceneScript(0, 0),
  -- 0x01 preserve-native-layout
  startAnonymousSceneScript(0),
  -- 0x02 named
  finishSceneTask(),
  -- 0x03 named
  waitForSceneScript(0),
  -- 0x04 named
  waitForAllSceneScripts(),
  -- 0x05 preserve-native-layout
  cancelSceneScripts(),
  -- 0x06 named
  fadeSceneBrightness(0, 0, 0),
  -- 0x07 preserve-native-layout
  restoreSceneBrightness(),
  -- 0x08 preserve-native-layout
  initializeSceneBlend(),
  -- 0x09 preserve-native-layout
  clearSceneBlend(),
  -- 0x0a preserve-native-layout
  sceneOp0A(0, 0),
  -- 0x0b preserve-native-layout
  fadeSceneAlpha(0, 0, 0),
  -- 0x0c named
  loadSceneMap(0),
  -- 0x0d named
  setSceneRuntimeState12(),
  -- 0x0e preserve-native-layout
  setBackgroundLayers(0),
  -- 0x0f named
  showDialogue(0, 0, 0),
  -- 0x10 preserve-native-layout
  setSceneContentWord(0),
  -- 0x11 preserve-native-layout
  showSceneMessage(0),
  -- 0x12 named
  showScenePrompt(0),
  -- 0x13 preserve-native-layout
  startSceneContextEvent(),
  -- 0x14 preserve-native-layout
  waitForSceneCompletion(0),
  -- 0x15 named
  waitFrames8(0),
  -- 0x16 preserve-native-layout
  waitFrames16(0),
  -- 0x17 named
  setSceneRuntimeMode(0),
  -- 0x18 preserve-native-layout
  transitionSceneState(0),
  -- 0x19 named
  adjustScriptOffset(0),
  -- 0x1a named
  setStoryFlag(0, 0),
  -- 0x1b preserve-native-layout
  writeNativeSaveByte(0, 0),
  -- 0x1c named
  queueScene(0),
  -- 0x1d preserve-native-layout
  setSceneStatePair(0),
  -- 0x1e preserve-native-layout
  applySceneSelector(0),
  -- 0x1f preserve-native-layout
  placeScenePackedActor(0, 0, 0, 0, 0),
  -- 0x20 named
  placeSceneActor(0, 0, 0, 0),
  -- 0x21 preserve-native-layout
  sceneOp21(0, 0),
  -- 0x22 preserve-native-layout
  selectSceneTarget(0),
  -- 0x23 preserve-native-layout
  clearActorFlag0(0),
  -- 0x24 preserve-native-layout
  setActorFlag0(0),
  -- 0x25 preserve-native-layout
  turnActorAction(0, 0, 0),
  -- 0x26 named
  createActionFromHandles(0, 0),
  -- 0x27 named
  playActorAction(0, 0, 0),
  -- 0x28 named
  refreshActorFacing(0),
  -- 0x29 named
  setActorFacing(0, 0),
  -- 0x2a preserve-native-layout
  restoreSceneUnit(0),
  -- 0x2b preserve-native-layout
  actorPaletteOverride(0, 0, 0, 0),
  -- 0x2c preserve-native-layout
  sceneOp2C(0, 0, 0),
  -- 0x2d preserve-native-layout
  setSceneUnitState(0, 0, 0),
  -- 0x2e preserve-native-layout
  addActorPosition(0, 0, 0, 0),
  -- 0x2f named
  setActorTile(0, 0, 0),
  -- 0x30 preserve-native-layout
  setActorStateMasks(0, 0, 0),
  -- 0x31 preserve-native-layout
  replaceActorAction(0, 0, 0),
  -- 0x32 preserve-native-layout
  refreshActorPaletteSlot(0),
  -- 0x33 preserve-native-layout
  spawnSceneActor(0, 0, 0, 0, 0, 0, 0, 0),
  -- 0x34 preserve-native-layout
  selectSceneUnit(0, 0),
  -- 0x35 preserve-native-layout
  bindSavedSceneUnit(0, 0),
  -- 0x36 preserve-native-layout
  beginSceneReward(0),
  -- 0x37 preserve-native-layout
  setSceneUnitFlag100(0),
  -- 0x38 preserve-native-layout
  sceneOp38(0, 0, 0, 0),
  -- 0x39 preserve-native-layout
  moveActorByDelta(0, 0, 0, 0, 0),
  -- 0x3a preserve-native-layout
  moveActorToTile(0, 0, 0, 0, 0),
  -- 0x3b preserve-native-layout
  sceneNoop3B(0, 0, 0, 0, 0, 0, 0),
  -- 0x3c preserve-native-layout
  sceneNoop3C(0, 0, 0, 0, 0),
  -- 0x3d preserve-native-layout
  moveActorByDeltaMode(0, 0, 0, 0, 0, 0),
  -- 0x3e named
  moveActorOnGrid(0, 0, 0, 0, 0, 0),
  -- 0x3f preserve-native-layout
  applySceneLine(0, 0, 0),
  -- 0x40 preserve-native-layout
  applyActorSceneLine(0, 0, 0),
  -- 0x41 preserve-native-layout
  runActorPath(0, 0, 0),
  -- 0x42 preserve-native-layout
  runActorPathRange(0, 0, 0),
  -- 0x43 preserve-native-layout
  mergeScenePaths(0, 0),
  -- 0x44 preserve-native-layout
  runActorCoordinatePath(0, 0, 0, 0),
  -- 0x45 preserve-native-layout
  loadScenePath(0, 0),
  -- 0x46 preserve-native-layout
  moveCameraToActor(0, 0, 0),
  -- 0x47 named
  moveSceneCamera(0, 0, 0, 0),
  -- 0x48 named
  prepareMapView(0),
  -- 0x49 preserve-native-layout
  restoreSceneContext(0),
  -- 0x4a preserve-native-layout
  applyCurrentSceneSelection(),
  -- 0x4b named
  selectScenePresentation(0),
  -- 0x4c preserve-native-layout
  playSceneAudioDefinition(0, 0),
  -- 0x4d named
  fadeSceneAudio(0, 0, 0),
  -- 0x4e named
  loadEncounterUnits(),
  -- 0x4f preserve-native-layout
  updateSceneActorTransition(0, 0),
  -- 0x50 preserve-native-layout
  sceneOp50(0),
  -- 0x51 preserve-native-layout
  resetSceneActionContext(),
  -- 0x52 preserve-native-layout
  clearSceneStoryUnits(),
  -- 0x53 named
  selectSceneEncounter(0),
  -- 0x54 preserve-native-layout
  applySceneSystemValue(0),
  -- 0x55 preserve-native-layout
  sceneOp55(0, 0, 0, 0),
  -- 0x56 preserve-native-layout
  sceneOp56(),
  -- 0x57 named
  initializeSceneTaskContext(),
  -- 0x58 named
  clearSceneTaskContext(),
  -- 0x59 named
  selectCurrentSceneEntity(0),
  -- 0x5a preserve-native-layout
  selectSceneTaskIndex(0),
  -- 0x5b named
  waitForSceneTask(),
  -- 0x5c preserve-native-layout
  sceneOp5C(0),
  -- 0x5d preserve-native-layout
  setSceneContentBytes(0, 0),
  -- 0x5e preserve-native-layout
  sceneOp5E(),
  -- 0x5f preserve-native-layout
  sceneOp5F(0),
  -- 0x60 preserve-native-layout
  sceneOp60(),
  -- 0x61 preserve-native-layout
  consumeSceneSaveFlag(),
  -- 0x62 preserve-native-layout
  sceneOp62(0, 0, 0, 0, 0, 0, 0, 0),
  -- 0x63 preserve-native-layout
  resetSceneView(),
  -- 0x64 preserve-native-layout
  branchIfUnitUsable(0, 0),
  -- 0x65 preserve-native-layout
  branchIfStoryFlag(0, 0),
  -- 0x66 named
  addOffsetWhenTargetFlagSet(0, 0, 0),
  -- 0x67 preserve-native-layout
  branchIfSceneCounterAbove(0, 0),
  -- 0x68 preserve-native-layout
  branchIfSceneSelector(0, 0),
  -- 0x69 preserve-native-layout
  branchIfDefinitionFlag1(0),
  -- 0x6a preserve-native-layout
  branchIfDefinitionFlag2Clear(0),
  -- 0x6b preserve-native-layout
  sceneNoop6B(),
  -- 0x6c preserve-native-layout
  branchIfUnitAvailable(0, 0),
  -- 0x6d preserve-native-layout
  branchIfContentByteClear(0),
  -- 0x6e preserve-native-layout
  branchIfNativeSaveFlag(0),
  -- 0x6f preserve-native-layout
  branchIfHpAbove(0, 0, 0),
  -- 0x70 preserve-native-layout
  branchIfNoEligibleUnit(0),
  -- 0x71 preserve-native-layout
  branchOnFirstChoice(0),
}
