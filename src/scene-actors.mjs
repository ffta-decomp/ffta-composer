// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.

// Fixed indexed-unit identities used by the reviewed opening and Herb scenes.
// Battle handles depend on encounter state; they are not global character IDs.
const names = {2:'Marche',8:'Montblanc',15:'Marche',16:'Mewt',17:'Ritz',23:'Teacher',76:'Student'};
const herb = {128:'Red Cap',129:'Goblin 1',130:'Goblin 2',131:'Goblin 3'};
export function describeSceneActor(handle, scene, authoredOpening=false) {
  const name = names[handle] ?? (scene === 14 || authoredOpening ? herb[handle] : undefined);
  return {handle, name:name ?? null, label:name ?? `Actor ${handle}`,
    identitySource:name ? 'reviewed-scene' : 'unresolved-handle'};
}
