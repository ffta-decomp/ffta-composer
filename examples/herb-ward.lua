return {
  format = "ffta.scene-project/v1",
  profile = "ffta-us-retail",
  baseSha256 = "43fc8204c6dceee58828aebc7af0c72eb807e99f35ad641c8bb0a4fa8b6edc19",
  storyEdits = {
    ["herb-ward"] = {
      title = "The Captain's Ward",
      trigger = {scene = 14, beforeDialogue = 5},
      speakers = {montblanc = {dialogue = 6}},
      steps = {
        sayAs("montblanc", "See that ward, kupo?\nIt guards their captain."),
        say("We can scatter the shards,\nkeep them, flank, or duel.\nWhich route do we take?"),
        choose(
          "What about the ward?",
          option(
            "Break",
            {
              say("The ward has cracked.\nWe can use the shards."),
              choose(
                "How do we use them?",
                option(
                  "Scatter",
                  {sayAs("montblanc", "Scatter the shards, kupo!\nWe will take this route.")}
                ),
                option("Keep", {sayAs("montblanc", "Keep the shards, kupo!\nWe will take this route.")})
              )
            }
          ),
          option(
            "Leave",
            {
              say("Keep the ward intact.\nHow do we approach?"),
              choose(
                "Pick our approach.",
                option("Flank", {sayAs("montblanc", "Flank the captain, kupo!\nWe will take this route.")}),
                option("Duel", {sayAs("montblanc", "Duel the captain, kupo!\nWe will take this route.")})
              )
            }
          )
        ),
        say("Watch the captain.\nLet's finish this.")
      },
      resume = "original"
    }
  }
}
