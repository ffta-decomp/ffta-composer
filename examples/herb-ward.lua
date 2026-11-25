return {
  format = "ffta.scene-project/v1",
  profile = "ffta-us-retail",
  baseSha256 = "43fc8204c6dceee58828aebc7af0c72eb807e99f35ad641c8bb0a4fa8b6edc19",
  patches = {storyChoices = true},
  storyEdits = {
    ["herb-ward"] = {
      title = "The Captain's Ward",
      trigger = {scene = 14, beforeDialogue = 5},
      speakers = {montblanc = {dialogue = 6}},
      enemies = {captain = {slot = 0}},
      steps = {
        sayAs("montblanc", "See that ward, kupo?\nIt guards their captain."),
        say("Break it and he weakens.\nLeave it and he fights\nat full strength."),
        choose("What about the ward?",
          option("Break", {
            say("The ward has cracked.\nWe can use the shards."),
            choose("How do we use them?",
              option("Scatter", {
                sayAs("montblanc", "His guard is gone.\nOnly 12 HP, kupo!"),
                enemyHp("captain", 12)
              }),
              option("Keep", {
                sayAs("montblanc", "He kept some power.\n28 HP, kupo!"),
                enemyHp("captain", 28)
              }))
          }),
          option("Leave", {
            say("Keep the ward intact.\nHow do we approach?"),
            choose("Pick our approach.",
              option("Flank", {
                sayAs("montblanc", "His ward slipped.\n52 HP, kupo!"),
                enemyHp("captain", 52)
              }),
              option("Duel", {
                sayAs("montblanc", "His ward holds.\n72 HP, kupo!"),
                enemyHp("captain", 72)
              }))
          })
        ),
        say("Watch the captain.\nLet's finish this.")
      },
      resume = "original"
    }
  }
}
