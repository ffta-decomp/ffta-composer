// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import {createScenePreview,readScenePreviewContext,SCENE_PREVIEW_ENTRIES} from '../scene-preview.mjs';
import {NATIVE_CORE,GBA_KEYS} from '../native-game.mjs';
import {button,el,field} from './controls.mjs';
import {t} from '../i18n.mjs';

export function createScenePreviewPanel({getRom,getProject,onSelectScene,onLoadDemo,onProjectChange}){
  let context=null,contextName='',session=null,identity=null,playing=false,frame=0,generation=0,cleanup=()=>{};
  let keys=0,pulse=0,audio=null,gain=null,audioEnd=0;const sounds=new Set();
  function silence(){for(const s of sounds){try{s.stop();}catch{}}sounds.clear();audioEnd=0;}
  function pause(){playing=false;cancelAnimationFrame(frame);frame=0;keys=0;pulse=0;silence();}
  function dispose(){pause();generation++;cleanup();cleanup=()=>{};}
  function close(){pause();session?.destroy();session=null;}
  async function loadContext(text,name='Preview context'){
    const parsed=await readScenePreviewContext(text);close();context=parsed;contextName=name;
    return {name,frame:parsed.manifest.frame,baseSha256:parsed.manifest.baseSha256};
  }
  async function sound(){
    if(!globalThis.AudioContext)return;
    if(!audio){audio=new AudioContext({sampleRate:48000});gain=audio.createGain();gain.gain.value=.5;gain.connect(audio.destination);}
    if(audio.state==='suspended')await audio.resume();
  }
  function enqueue(samples){
    if(!audio||audio.state!=='running'||!samples.length||audioEnd>audio.currentTime+.25)return;
    const n=samples.length/2,b=audio.createBuffer(2,n,48000);
    for(let c=0;c<2;c++){const d=b.getChannelData(c);for(let i=0;i<n;i++)d[i]=samples[i*2+c]/32768;}
    const s=audio.createBufferSource();s.buffer=b;s.connect(gain);const when=Math.max(audio.currentTime+.025,audioEnd);
    s.start(when);audioEnd=when+n/48000;sounds.add(s);s.onended=()=>sounds.delete(s);
  }
  function render(body,scene){
    dispose();const token=generation,rom=getRom(),project=getProject(),next=rom.sha256+JSON.stringify(project)+scene.id;
    if(next!==identity)close();identity=next;
    const entries=[...SCENE_PREVIEW_ENTRIES,...(project.scenes[239]?[{id:239,label:'酒馆增补一幕'}]:[])];
    const supported=entries.some(s=>s.id===scene.id),toolbar=el('div',undefined,'simulation-toolbar');
    const status=el('span');status.setAttribute('role','status');status.dataset.previewStatus='';
    const stage=el('div',undefined,'native-game-stage scene-preview-stage');stage.tabIndex=0;
    stage.setAttribute('aria-label',t('场景演示画面'));
    const canvas=el('canvas');canvas.width=240;canvas.height=160;canvas.setAttribute('aria-label',t('原版场景画面'));
    const ctx=canvas.getContext('2d'),image=new ImageData(240,160);stage.append(canvas);
    let busy=false,last=0,accumulator=0;
    const play=button(t('播放场景'),()=>start(false),'accent');play.dataset.previewPlay='';
    const stop=button(t('暂停'),()=>{pause();refresh();});
    const restart=button(t('重播当前场景'),()=>start(true));restart.dataset.previewRestart='';
    const step=button(t('单帧'),()=>{pause();if(session)session.step(0);refresh();});
    const advance=button(t('继续对白'),()=>input(GBA_KEYS.A));advance.dataset.previewContinue='';
    const left=button(t('左选项'),()=>input(GBA_KEYS.Left)),right=button(t('右选项'),()=>input(GBA_KEYS.Right));
    const cancel=button(t('取消'),()=>input(GBA_KEYS.B));
    const rate=el('select');rate.setAttribute('aria-label',t('播放速度'));
    for(const n of[1,2,4]){const o=el('option',`${n}×`);o.value=n;rate.append(o);}rate.onchange=silence;
    const muted=el('input');muted.type='checkbox';muted.setAttribute('aria-label',t('静音'));
    muted.onchange=()=>{if(gain)gain.gain.value=muted.checked?0:.5;};
    const auto=el('input');auto.type='checkbox';auto.checked=true;auto.dataset.previewAuto='';
    toolbar.append(play,stop,restart,step,rate,field(t('自动继续对白'),auto),field(t('静音'),muted),status);
    const controls=el('div',undefined,'buttons');controls.append(advance,left,right,cancel);
    const setup=el('div',undefined,'scene-preview-setup');
    const file=el('input');file.type='file';file.accept='.json,application/json';file.hidden=true;file.dataset.previewContext='';
    const importContext=button(t('载入预览配置'),()=>file.click());
    const contextLabel=el('span',context?contextName:t('尚未载入预览配置'));
    file.onchange=async()=>{const f=file.files?.[0];if(!f)return;try{busy=true;refresh();
      await loadContext(await f.text(),f.name);if(token!==generation)return;contextLabel.textContent=contextName;refresh();
    }catch(e){status.textContent=e.message;}finally{if(token===generation){busy=false;buttons();}}};
    const chooser=el('select');chooser.setAttribute('aria-label',t('演示场景'));
    const option=el('option',t('选择已验证场景'));option.value='';chooser.append(option);
    for(const item of entries){const o=el('option',`${item.id} · ${t(item.label)}`);o.value=item.id;chooser.append(o);}
    chooser.value=supported?String(scene.id):'';chooser.onchange=()=>{if(chooser.value)onSelectScene(Number(chooser.value));};
    const demo=button(t('载入酒馆改编示例'),onLoadDemo);demo.dataset.previewDemo='';
    setup.append(importContext,contextLabel,file,field(t('演示场景'),chooser),demo);
    const help=el('p',t('直接演示当前场景。改动剧情后点击重播；不会经过标题、读档或新游戏菜单。'),'simulation-note');
    const flow=el('p',undefined,'scene-preview-flow');flow.dataset.previewFlow='';
    body.append(setup,toolbar,stage,controls,flow,help);
    if(Object.keys(project.programs).length||Object.keys(project.storyEdits??{}).length){
      const details=el('details'),summary=el('summary',t('编辑演示剧情'));
      const editor=el('textarea');editor.className='scene-preview-script';editor.value=JSON.stringify(project,null,2);
      editor.setAttribute('aria-label',t('剧情脚本 JSON'));editor.dataset.previewScript='';
      const apply=button(t('应用剧情修改'),()=>{try{onProjectChange(JSON.parse(editor.value));}catch(e){status.textContent=e.message;}});
      apply.dataset.previewApply='';details.append(summary,editor,apply);body.append(details);
    }
    async function start(replay){
      if(busy)return;busy=true;pause();buttons();status.textContent=t('正在准备场景');
      try{
        await sound();if(token!==generation)return;if(gain)gain.gain.value=muted.checked?0:.5;
        if(replay||session?.snapshot().phase==='done')close();
        if(!session){
          const created=await createScenePreview(rom,getProject(),scene.id,context);
          if(token!==generation){created.destroy();return;}session=created;
        }
        if(token!==generation)return;playing=true;last=0;accumulator=0;stage.focus();refresh();schedule();
      }catch(e){if(token===generation){close();refresh();status.textContent=e.message;}}
      finally{if(token===generation){busy=false;buttons();}}
    }
    function input(value){
      if(!session||busy)return;keys=value;pulse=2;
      if(!playing){playing=true;last=0;accumulator=0;schedule();}refresh();stage.focus();
    }
    const keymap={KeyX:1,KeyA:1,KeyZ:2,KeyB:2,ArrowLeft:32,ArrowRight:16,ArrowUp:64,ArrowDown:128};
    const down=e=>{if(keymap[e.code]){e.preventDefault();keys=keymap[e.code];pulse=0;}};
    const up=e=>{if(keymap[e.code]){e.preventDefault();keys=0;}};
    stage.addEventListener('keydown',down);stage.addEventListener('keyup',up);
    const blur=()=>{pause();refresh();},visibility=()=>{if(document.hidden)blur();};
    window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);
    cleanup=()=>{window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);};
    function buttons(){
      const ready=Boolean(context&&supported&&rom.sha256===context.manifest.baseSha256);
      play.disabled=busy||playing||!ready;restart.disabled=busy||!ready;stop.disabled=!playing;
      step.disabled=busy||!session;for(const b of[advance,left,right,cancel])b.disabled=busy||!session;
      importContext.disabled=busy;chooser.disabled=busy;demo.disabled=busy;
    }
    function refresh(){
      buttons();const s=session?.snapshot();
      if(s){image.data.set(session.pixels());ctx.putImageData(image,0,0);}
      status.textContent=!supported?t('当前场景尚无已验证的演示入口'):!context?t('请载入预览配置'):
        rom.sha256!==context.manifest.baseSha256?t('预览配置与 ROM 不匹配'):s?.phase==='done'?t('场景演示结束'):playing?t('正在演示'):t('准备播放');
      flow.textContent=s?`${t('场景')} ${s.scene} · ${t('地图')} ${s.map} · ${t('角色')} ${s.actors.filter(a=>!a.hidden).length} · ${t('帧')} ${s.frame}`:'';
    }
    function schedule(){if(playing&&!frame)frame=requestAnimationFrame(tick);}
    function tick(time){
      frame=0;if(!playing||!session||token!==generation)return;
      accumulator+=last?Math.min(250,time-last)*Number(rate.value):1000/NATIVE_CORE.fps;last=time;
      try{
        for(let n=0;n<12&&accumulator>=1000/NATIVE_CORE.fps;n++){
          const s=session.snapshot();
          const automatic=auto.checked&&s.frame%180<2?GBA_KEYS.A:0;
          session.step(keys||automatic);if(pulse&&!--pulse)keys=0;
          if(Number(rate.value)===1)enqueue(session.audio());accumulator-=1000/NATIVE_CORE.fps;
          if(session.snapshot().phase==='done'){pause();break;}
        }refresh();schedule();
      }catch(e){pause();refresh();status.textContent=e.message;}
    }
    refresh();
  }
  return {id:'scene-preview',label:'场景演示',render,dispose,loadContext,
    getSnapshot:()=>session?.snapshot()??null,getContextInfo:()=>context?{name:contextName,frame:context.manifest.frame}:null};
}
