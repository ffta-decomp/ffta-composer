return {
  format = "ffta.scene-project/v1",
  profile = "ffta-us-retail",
  baseSha256 = "43fc8204c6dceee58828aebc7af0c72eb807e99f35ad641c8bb0a4fa8b6edc19",
  storyEdits = {
    ["herb-arrival"] = {
      title = "Herb Picking Arrival",
      trigger = {scene = 14, beforeDialogue = 5},
      speakers = {montblanc = {dialogue = 6}},
      flags = {["route-marker"] = 589},
      steps = {
        say("Take a look over here."),
        when("route-marker", {say("The upper trail is clear.")}, {say("The lower trail is clear.")}),
        sayAs("montblanc", "I'll mark the trail, kupo.")
      },
      resume = "original"
    }
  }
}
