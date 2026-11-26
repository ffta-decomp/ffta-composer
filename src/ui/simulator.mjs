// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import { t, tr } from '../i18n.mjs';
import { decodeMapPreview, MAP_DIRECTORY } from '../map-preview.mjs';
import { createSceneSimulation,projectActorPosition } from '../scene-simulator.mjs';
import {decodeActorPreview} from '../actor-preview.mjs';
import { button, el, field } from './controls.mjs';
import {speakerLabel} from './speaker.mjs';

const readable = name => name.replace(/([a-z])([A-Z])/g, '$1 $2');
const phaseLabels = {ready: '准备', dialogue: '对白', choice: '选择', motion: '移动',height:'角色动作',input:'输入姓名',camera:'镜头移动',waiting: '等待',
  unsupported: '需要确认', external:'等待游戏上下文',battle: '战斗入口', done: '播放结束'};
const traceLabels = {say:'对白', walk:'移动', face:'转身', if:'分支', choose:'选择', choice:'选择',
  sceneOp38:'角色高度移动',loadEncounterUnits:'载入登场角色',selectSceneEncounter:'选择场景配置',
  runActorPath:'沿路径移动',runActorCoordinatePath:'沿坐标路径移动',transitionSceneState:'场景流程',
  'name-entry':'角色命名',
  enemyHp:'跳过战斗步骤', battle:'战斗入口', resume:'继续原流程', cancel:'原生取消', 'skip-unsupported':'手动跳过'};

export function createSimulatorPanel({getRom, getProject}) {
  let session = null, frame = 0, playing = false, model = null;
  const mapChoices = new Map();
  function stop() {playing = false; cancelAnimationFrame(frame); frame = 0;}
  function dispose() {stop(); session = null; model = null;}
  function render(body, scene) {
    dispose();
    const rom = getRom(), project = getProject();
    const settings = {mapId: mapChoices.get(`${rom.sha256}:${scene.id}`)};
    model = createSceneSimulation(rom, project, scene.id, settings);
    const toolbar = el('div', undefined, 'simulation-toolbar');
    const status = el('span', undefined, 'simulation-status'); status.setAttribute('role','status');
    const play = button(t('播放'), () => {
      if (playing) {stop(); refresh();} else {playing=true; held=0; last=0; schedule(); refresh();}
    }, 'accent');
    const next = button(t('下一步'), () => {
      stop(); const s=model.snapshot();
      if(s.phase==='dialogue') model.confirm(); else model.step();
      refresh();
    });
    const restart = button(t('重新开始'), () => {
      stop(); model=createSceneSimulation(rom,project,scene.id,{mapId: model.snapshot().mapId, flags: initialFlags});
      held=0; refresh();
    });
    const speed = el('select'); speed.setAttribute('aria-label',t('播放速度'));
    for(const rate of [0.5,1,2,4]) {const option=el('option',`${rate}×`);option.value=rate;speed.append(option);}
    speed.value='1';
    toolbar.append(play,next,restart,field(t('速度'),speed),status);
    const mapSelect=el('select');mapSelect.setAttribute('aria-label',t('预览地图'));
    const empty=el('option',t('选择地图上下文'));empty.value='';mapSelect.append(empty);
    for(let id=0;id<MAP_DIRECTORY.count;id++) {const option=el('option',tr`地图 ${id}`);option.value=id;mapSelect.append(option);}
    mapSelect.value=model.snapshot().mapId===null?'':String(model.snapshot().mapId);
    mapSelect.onchange=()=>{
      if(mapSelect.value==='')return;
      model.setMap(Number(mapSelect.value));mapChoices.set(`${rom.sha256}:${scene.id}`,Number(mapSelect.value));refresh();
    };
    const context=el('div',undefined,'simulation-context');context.append(field(t('地图'),mapSelect));
    let viewCenter=null,zoom=1;
    const overview=button(t('全图'),()=>{viewCenter={x:256,y:256};zoom=1;refresh();});
    const scripted=button(t('跟随脚本镜头'),()=>{viewCenter=null;zoom=2;refresh();});
    const focusSpeaker=button(t('定位说话者'),()=>{
      const s=model.snapshot(),handle=(s.dialogue?.speakerInfo??s.choice?.speakerInfo)?.handle;
      const item=s.actors.find(a=>a.id===handle);
      if(item){viewCenter=projectActorPosition(item);zoom=2;refresh();}
    });
    const zoomSelect=el('select');zoomSelect.setAttribute('aria-label',t('缩放'));
    for(const value of[1,2,3,4]){const option=el('option',`${value}×`);option.value=value;zoomSelect.append(option);}
    zoomSelect.onchange=()=>{zoom=Number(zoomSelect.value);refresh();};
    context.append(overview,scripted,focusSpeaker,field(t('缩放'),zoomSelect));
    const initialFlags={};
    const bindings = Object.values(project.storyEdits??{}).find(r=>r.trigger.scene===scene.id)?.flags ?? {};
    for(const [name,id] of Object.entries(bindings)) {
      const input=el('input');input.type='checkbox';input.checked=false;
      input.onchange=()=>{initialFlags[id]=input.checked;model.setFlag(id,input.checked);refresh();};
      context.append(field(name,input));
    }
    const layout=el('div',undefined,'simulation-layout');
    const stage=el('div',undefined,'simulation-stage');stage.tabIndex=0;stage.setAttribute('aria-label',t('场景模拟画面'));
    const canvas=el('canvas');canvas.width=canvas.height=512;canvas.setAttribute('aria-label',t('本地 ROM 地图'));canvas.setAttribute('role','img');
    const sceneNote=el('p',t('地图与静态角色来自本地 ROM；未绑定角色显示编号标记。拖动画面移动镜头。'),'simulation-note');
    const message=el('p',undefined,'simulation-message');message.setAttribute('role','status');
    const box=el('div',undefined,'simulation-dialogue');
    const portrait=el('canvas');portrait.width=portrait.height=64;portrait.className='simulation-speaker-pose';portrait.setAttribute('role','img');
    const speaker=el('strong'),speech=el('p');speech.setAttribute('aria-live','polite');box.append(portrait,speaker,speech);
    const choices=el('div',undefined,'simulation-choices');
    const nameForm=el('div',undefined,'simulation-name-entry');
    const nameInput=el('input');nameInput.type='text';nameInput.maxLength=8;nameInput.setAttribute('aria-label',t('角色姓名'));
    const nameError=el('span',undefined,'simulation-name-error');nameError.setAttribute('role','alert');
    const submitName=()=>{
      try{model.confirmName(nameInput.value);nameError.textContent='';held=0;refresh();schedule();}
      catch(error){nameError.textContent=error.message;}
    };
    nameInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();submitName();}});
    nameForm.append(el('label',t('输入角色姓名')),nameInput,button(t('确认姓名'),submitName),nameError);nameForm.hidden=true;
    const cancel=button(t('原生取消'),()=>{model.cancel();held=0;refresh();schedule();});
    const skip=button(t('跳过未模拟指令'),()=>{model.skip();held=0;refresh();});
    stage.append(canvas,box,choices,nameForm,message);
    const side=el('aside',undefined,'simulation-flow');
    side.append(el('h2',t('执行流程')));
    const traceList=el('ol');traceList.setAttribute('aria-label',t('执行流程'));
    const upcoming=el('ol',undefined,'simulation-upcoming');
    const cast=el('div',undefined,'simulation-cast');
    side.append(traceList,el('h3',t('接下来')),upcoming,el('h3',t('登场角色')),cast);
    layout.append(stage,side);body.append(toolbar,context,layout,sceneNote,skip,cancel);
    let bitmap=null,mapError=null,loadedMap=undefined,last=0,held=0,lastAction=0,choiceKey='';
    const ctx=canvas.getContext('2d'),spriteCache=new Map();
    function sprite(id,facing=0) {
      const key=`${id}:${facing&3}`;
      if(!spriteCache.has(key)) {
        try {
          const pose=decodeActorPreview(rom,id,{facing:facing&3}),image=document.createElement('canvas');
          image.width=pose.width;image.height=pose.height;
          image.getContext('2d').putImageData(new ImageData(pose.pixels,pose.width,pose.height),0,0);
          spriteCache.set(key,{...pose,canvas:image});
        }catch{spriteCache.set(key,null);}
      }
      return spriteCache.get(key);
    }
    function drawPose(context,pose,x,y,scale=1) {
      context.save();context.translate(x,y);context.scale(pose.mirror?-scale:scale,scale);
      context.drawImage(pose.canvas,pose.left,pose.top);context.restore();
    }
    function draw(snapshot) {
      if(loadedMap!==snapshot.mapId){
        loadedMap=snapshot.mapId;bitmap=null;mapError=null;
        if(loadedMap!==null){
          try {
            bitmap=decodeMapPreview(rom,loadedMap);
            const image=document.createElement('canvas');image.width=image.height=512;
            image.getContext('2d').putImageData(new ImageData(bitmap.pixels,512,512),0,0);bitmap.canvas=image;
          }catch(error){mapError=error.message;}
        }
      }
      ctx.clearRect(0,0,512,512);
      if(!bitmap)return;
      const center=viewCenter??snapshot.camera;
      ctx.save();ctx.translate(256,256);ctx.scale(zoom,zoom);ctx.translate(-center.x,-center.y);
      ctx.imageSmoothingEnabled=false;
      if(snapshot.runtime.display.backgrounds)ctx.drawImage(bitmap.canvas,0,0);
      for(const actor of [...snapshot.actors].filter(a=>a.visible).sort((a,b)=>a.x+a.y-b.x-b.y)){
        const {x,y}=projectActorPosition(actor),pose=sprite(actor.id,actor.facing);
        const speaking=actor.id===(snapshot.dialogue?.speakerInfo??snapshot.choice?.speakerInfo)?.handle;
        ctx.fillStyle=actor.id>=128?'#a34237':'#1a655b';ctx.strokeStyle=speaking?'#ffd65c':'#fff5d8';ctx.lineWidth=speaking?4:2;
        if(pose){
          if(speaking){ctx.beginPath();ctx.ellipse(x,y,12,6,0,0,Math.PI*2);ctx.stroke();}
          drawPose(ctx,pose,x,y);
        }else{
          ctx.beginPath();ctx.moveTo(x,y-10);ctx.lineTo(x+7,y-3);ctx.lineTo(x,y+4);ctx.lineTo(x-7,y-3);ctx.closePath();ctx.fill();ctx.stroke();
        }
        const direction=[[-9,4],[-9,-4],[9,-4],[9,4]][actor.facing&3];
        ctx.beginPath();ctx.moveTo(x,y-3);ctx.lineTo(x+direction[0],y-3+direction[1]);ctx.stroke();
        const labelY=y+(pose?.top??-12)-5;
        ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#102e29';ctx.strokeText(actor.name,x,labelY);ctx.fillStyle='#fff6d9';ctx.fillText(actor.name,x,labelY);
      }
      ctx.restore();
    }
    function refresh() {
      const s=model.snapshot();draw(s);
      zoomSelect.value=String(zoom);
      play.textContent=t(playing?'暂停':'播放');
      play.disabled=['done','battle','unsupported','external','input'].includes(s.phase);
      next.disabled=['choice','done','battle','unsupported','external','input'].includes(s.phase);
      status.textContent=t(phaseLabels[s.phase]);
      message.hidden=false;
      if(s.phase==='external')message.textContent=`${t(s.external.kind==='condition'?'请指定条件结果':'此外部步骤尚未复现，请确认预览继续')} · ${readable(s.external.operation)}`;
      else if(mapError)message.textContent=`${t('地图读取失败')} · ${mapError}`;
      else if(s.mapId===null)message.textContent=t('此场景需要选择地图上下文。');
      else if(s.phase==='battle')message.textContent=t('已到战斗入口，模拟在此暂停。');
      else if(s.phase==='unsupported')message.textContent=`${t('尚未模拟')} · ${readable(s.message)}`;
      else if(s.phase==='done')message.textContent=t(s.message==='external-handoff'?'已到外部流程入口，预览在此结束。':s.message==='resume-original'?'已接回原对白；后续原生流程未执行。':'场景播放结束。');
      else message.hidden=true;
      box.hidden=!s.dialogue&&!s.choice;
      if(s.phase==='input'&&nameForm.hidden){nameInput.value=s.input.value;nameError.textContent='';nameForm.hidden=false;nameInput.focus();}
      else if(s.phase!=='input')nameForm.hidden=true;
      speaker.textContent=speakerLabel(s.dialogue?.speakerInfo??s.choice?.speakerInfo);
      const info=s.dialogue?.speakerInfo??s.choice?.speakerInfo,pose=info?sprite(info.handle):null;
      portrait.hidden=!pose;
      if(pose){
        const pc=portrait.getContext('2d');pc.clearRect(0,0,64,64);pc.imageSmoothingEnabled=false;
        drawPose(pc,pose,32-(pose.left+pose.width/2)*2,60-(pose.top+pose.height)*2,2);
        portrait.setAttribute('aria-label',speakerLabel(info));
      }
      focusSpeaker.disabled=!s.actors.some(a=>a.id===info?.handle);
      speech.textContent=s.dialogue?.text??s.choice?.prompt??'';
      const key=JSON.stringify([s.choice,s.external]);
      if(key!==choiceKey){
        choiceKey=key;choices.replaceChildren();
        if(s.choice)s.choice.labels.forEach((label,index)=>{
          choices.append(button(label,()=>{model.choose(index);held=0;refresh();schedule();},'choice-option'));
        });
        if(s.external){
          const resolve=result=>{model.resolveExternal(result);held=0;refresh();};
          if(s.external.kind==='condition')choices.append(
            button(t('条件成立'),()=>resolve({branch:true})),button(t('条件不成立'),()=>resolve({branch:false})));
          else choices.append(button(t('确认继续预览'),()=>resolve({complete:true})));
        }
      }
      cancel.hidden=s.phase!=='choice';
      cancel.textContent=t('原生取消');
      skip.hidden=s.phase!=='unsupported'||['execution-limit','child-script-deadlock','invalid-instruction-target'].includes(s.message);
      traceList.replaceChildren(...s.trace.slice(-10).map((entry,i,list)=>{
        const row=el('li');row.textContent=t(traceLabels[entry.operation]??readable(entry.operation));
        if(entry.detail==='battle-step-skipped')row.textContent=t('跳过战斗步骤');
        if(i===list.length-1){row.className='current';row.setAttribute('aria-current','step');}
        row.dataset.path=entry.path??'';return row;
      }));
      upcoming.replaceChildren(...s.queue.slice(0,5).map(entry=>el('li',t(traceLabels[entry.type]??entry.type))));
      cast.replaceChildren(...s.actors.filter(a=>a.visible).map(a=>{
        const row=el('span',`${speakerLabel(a.identity)} · ${Math.round(a.x)}, ${Math.round(a.y)}`);
        if(a.id===(s.dialogue?.speakerInfo??s.choice?.speakerInfo)?.handle){row.classList.add('speaking');row.setAttribute('aria-current','true');}
        return row;
      }));
      canvas.setAttribute('aria-label',s.mapId===null?t('尚未选择地图'):tr`地图 ${s.mapId}`);
    }
    function schedule(){if(playing&&!frame)frame=requestAnimationFrame(onFrame);}
    function onFrame(time){
      frame=0;if(!playing||!model)return;
      const dt=last?Math.min(time-last,100):0;last=time;
      const s=model.snapshot(),rate=Number(speed.value);held+=dt*rate;lastAction+=dt*rate;
      if(['motion','height','camera','waiting'].includes(s.phase))model.tick(dt*rate);
      else if(s.phase==='dialogue'){
        if(held>Math.min(6000,Math.max(1800,(s.dialogue?.text.length??0)*35))){model.confirm();held=0;}
      }else if(s.phase==='ready'){
        if(s.mode==='native'){
          // Immediate setup/control opcodes do not each consume an artificial
          // 450 ms pause. Yield on visible actions/input and cap work per frame.
          for(let budget=0;budget<32&&model.snapshot().phase==='ready';budget++)model.step();
          lastAction=0;held=0;
        }else if(lastAction>=450){model.step();lastAction=0;held=0;}
      }
      if(['done','battle','unsupported','external'].includes(model.snapshot().phase))stop();
      refresh();
      if(!['choice','input'].includes(model.snapshot().phase))schedule();
      else last=0;
    }
    stage.addEventListener('keydown',event=>{
      if(['BUTTON','SELECT','INPUT'].includes(event.target.tagName))return;
      if(event.key==='Escape'||event.key.toLowerCase()==='b'){event.preventDefault();model.cancel();held=0;refresh();schedule();}
      else if([' ','Enter'].includes(event.key)||event.key.toLowerCase()==='a'){
        event.preventDefault();const s=model.snapshot();
        if(s.phase==='dialogue')model.confirm();else if(s.phase!=='choice')model.step();
        held=0;refresh();schedule();
      }
    });
    let drag=null;
    canvas.addEventListener('pointerdown',event=>{
      const center=viewCenter??model.snapshot().camera;
      drag={id:event.pointerId,x:event.clientX,y:event.clientY,center:{x:center.x,y:center.y}};
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove',event=>{
      if(!drag||drag.id!==event.pointerId)return;
      const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
      viewCenter={x:drag.center.x-(event.clientX-drag.x)*512/rect.width/zoom,y:drag.center.y-(event.clientY-drag.y)*512/rect.height/zoom};refresh();
    });
    for(const name of['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{drag=null;});
    session={snapshot:()=>model.snapshot()};refresh();
  }
  return {id:'simulation',label:'实时模拟',render,dispose,getSnapshot:()=>session?.snapshot()??null};
}
