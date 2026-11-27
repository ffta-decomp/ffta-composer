// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import {newProject} from './project.mjs';

/** An original continuation, with actor setup borrowed from the user's retail ROM. */
export function tavernDemo(rom){
  const project=newProject(rom),slot=rom.directories[0].slotCount;
  const op=(operation,operands={})=>({operation,operands});
  const wait=frames=>op('waitFrames16',{frames});
  const place=(actor,x,y,facing,visibility=1)=>op('placeSceneActor',{actor,tile:x|(y<<4),facing,visibility});
  const move=(actor,x,y,facing,speed=1)=>[
    op('setContextValue',{value:16}),op('moveActorOnGrid',{actor,x,y,facing,mode:0,speed}),
    op('waitForActors'),op('setActorTile',{actor,x,y}),
  ];
  const fade=(mode,frames,level)=>op('fadeSceneBrightness',{mode,frames,level});
  // Match the original speaking handles/presentation, without copying its text.
  const source=rom.programs.get('47/0');
  const speaker=selector=>source.commands.find(c=>c.operation==='say'&&c.operands.textSelector===selector).operands;
  const say=(textSelector,selector)=>op('say',{...speaker(selector),textSelector});
  project.pages[63]={};
  for(const [i,text]of[
    'Ritz? Is that you?',
    "It's me, Marche. Don't you remember?",
    'Sorry. You must have mistaken me for someone else.',
    'Ritz...',
  ].entries())project.dialogue[`63:${i}`]={text,flags:16};
  project.scenes[239]={script:{group:0,program:slot},dialoguePage:63};
  project.programs[`0/${slot}`]={instructions:[
    fade(0x31,20,0),op('loadSceneMap',{map:63}),op('prepareMapView',{mode:0}),
    op('borrowSceneActor',{scene:53,actor:2}),op('borrowSceneActor',{scene:134,actor:4}),
    place(2,12,3,1),place(4,2,7,3,0),
    op('moveSceneCamera',{x:203,y:270,mode:0,duration:1}),
    op('playActorAction',{actor:2,action:53,mode:0}),
    fade(0x13,20,100),wait(180),
    op('moveSceneCamera',{x:153,y:253,mode:1,duration:45}),
    place(4,2,7,3),...move(4,5,7,3),wait(40),
    op('playActorAction',{actor:2,action:54,mode:0}),
    ...move(2,12,4,0,2),...move(2,12,7,0,2),...move(2,6,7,1,2),
    op('createActionFromHandles',{firstHandle:2,secondHandle:4}),
    op('createActionFromHandles',{firstHandle:4,secondHandle:2}),
    say(0,16),say(1,16),say(2,0),
    ...move(4,2,7,1),place(4,2,7,1,0),say(3,16),wait(45),
    fade(0x31,30,0),op('setSceneRuntimeMode',{mode:1}),
  ]};
  project.storyEdits={'tavern-continuation':{
    title:'A stranger at the pub',trigger:{scene:53,beforeDialogue:20},resume:'queuedScene',
    steps:[{type:'queueScene',scene:239}],
  }};
  return project;
}
