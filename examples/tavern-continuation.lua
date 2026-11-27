return {
  format = "ffta.scene-project/v1",
  profile = "ffta-us-retail",
  baseSha256 = "43fc8204c6dceee58828aebc7af0c72eb807e99f35ad641c8bb0a4fa8b6edc19",
  scenes = {["239"] = {script = {group = 0, program = 8}, dialoguePage = 63}},
  programs = {
    ["0/8"] = {
      instructions = {
        op("fadeSceneBrightness", {mode = 49, frames = 20, level = 0}),
        op("loadSceneMap", {map = 63}),
        op("prepareMapView", {mode = 0}),
        op("borrowSceneActor", {scene = 53, actor = 2}),
        op("borrowSceneActor", {scene = 134, actor = 4}),
        op("placeSceneActor", {actor = 2, tile = 60, facing = 1, visibility = 1}),
        op("placeSceneActor", {actor = 4, tile = 114, facing = 3, visibility = 0}),
        op("moveSceneCamera", {x = 203, y = 270, mode = 0, duration = 1}),
        op("playActorAction", {actor = 2, action = 53, mode = 0}),
        op("fadeSceneBrightness", {mode = 19, frames = 20, level = 100}),
        op("waitFrames16", {frames = 180}),
        op("moveSceneCamera", {x = 153, y = 253, mode = 1, duration = 45}),
        op("placeSceneActor", {actor = 4, tile = 114, facing = 3, visibility = 1}),
        op("setContextValue", {value = 16}),
        op("moveActorOnGrid", {actor = 4, x = 5, y = 7, facing = 3, mode = 0, speed = 1}),
        op("waitForActors", {}),
        op("setActorTile", {actor = 4, x = 5, y = 7}),
        op("waitFrames16", {frames = 40}),
        op("playActorAction", {actor = 2, action = 54, mode = 0}),
        op("setContextValue", {value = 16}),
        op("moveActorOnGrid", {actor = 2, x = 12, y = 4, facing = 0, mode = 0, speed = 2}),
        op("waitForActors", {}),
        op("setActorTile", {actor = 2, x = 12, y = 4}),
        op("setContextValue", {value = 16}),
        op("moveActorOnGrid", {actor = 2, x = 12, y = 7, facing = 0, mode = 0, speed = 2}),
        op("waitForActors", {}),
        op("setActorTile", {actor = 2, x = 12, y = 7}),
        op("setContextValue", {value = 16}),
        op("moveActorOnGrid", {actor = 2, x = 6, y = 7, facing = 1, mode = 0, speed = 2}),
        op("waitForActors", {}),
        op("setActorTile", {actor = 2, x = 6, y = 7}),
        op("createActionFromHandles", {firstHandle = 2, secondHandle = 4}),
        op("createActionFromHandles", {firstHandle = 4, secondHandle = 2}),
        op("say", {textSelector = 0, speakerHandle = 2, presentationFlags = 144}),
        op("say", {textSelector = 1, speakerHandle = 2, presentationFlags = 144}),
        op("say", {textSelector = 2, speakerHandle = 4, presentationFlags = 130}),
        op("setContextValue", {value = 16}),
        op("moveActorOnGrid", {actor = 4, x = 2, y = 7, facing = 1, mode = 0, speed = 1}),
        op("waitForActors", {}),
        op("setActorTile", {actor = 4, x = 2, y = 7}),
        op("placeSceneActor", {actor = 4, tile = 114, facing = 1, visibility = 0}),
        op("say", {textSelector = 3, speakerHandle = 2, presentationFlags = 144}),
        op("waitFrames16", {frames = 45}),
        op("fadeSceneBrightness", {mode = 49, frames = 30, level = 0}),
        op("setSceneRuntimeMode", {mode = 1})
      }
    }
  },
  dialogue = {
    ["63:0"] = {text = "Ritz? Is that you?", flags = 16},
    ["63:1"] = {text = "It's me, Marche. Don't you remember?", flags = 16},
    ["63:2"] = {text = "Sorry. You must have mistaken me for someone else.", flags = 16},
    ["63:3"] = {text = "Ritz...", flags = 16}
  },
  pages = {["63"] = {}},
  battleEvents = {},
  openings = {},
  storyEdits = {
    ["tavern-continuation"] = {
      title = "A stranger at the pub",
      trigger = {scene = 53, beforeDialogue = 20},
      resume = "queuedScene",
      steps = {queueAfter(239)}
    }
  }
}
