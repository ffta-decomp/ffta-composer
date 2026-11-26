// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import {createNativeGame,enterFirstAct,GBA_KEYS,NATIVE_CORE} from '../native-game.mjs';
import {build} from '../project.mjs';
import {t} from '../i18n.mjs';
import {button,el,download} from './controls.mjs';

export function createNativeGamePanel({getRom,getProject}) {
  let game=null,identity=null,battery=null,frame=0,playing=false,generation=0,removeListeners=()=>{},audio=null,gain=null;
  let queuedAudio=0,keys=0,held=new Set(),sources=new Set();
  const keyMap={ArrowRight:'Right',ArrowLeft:'Left',ArrowUp:'Up',ArrowDown:'Down',KeyX:'A',KeyA:'A',KeyZ:'B',KeyB:'B',Enter:'Start',ShiftLeft:'Select',ShiftRight:'Select',KeyL:'L',KeyR:'R'};
  function silence(){for(const source of sources){try{source.stop();}catch{}}sources.clear();queuedAudio=0;}
  function stop(){playing=false;cancelAnimationFrame(frame);frame=0;keys=0;held.clear();silence();}
  function dispose(){stop();generation++;removeListeners();removeListeners=()=>{};}
  async function ensureAudio(){
    if(!globalThis.AudioContext)return;
    if(!audio){audio=new AudioContext({sampleRate:48000});gain=audio.createGain();gain.gain.value=.5;gain.connect(audio.destination);}
    if(audio.state==='suspended')await audio.resume();
  }
  function playAudio(samples){
    if(!audio||audio.state!=='running'||!samples.length)return;
    if(queuedAudio>audio.currentTime+.25)return;
    const count=samples.length/2,buffer=audio.createBuffer(2,count,48000);
    for(let channel=0;channel<2;channel++){const data=buffer.getChannelData(channel);for(let i=0;i<count;i++)data[i]=samples[i*2+channel]/32768;}
    const source=audio.createBufferSource();source.buffer=buffer;source.connect(gain);
    const when=Math.max(audio.currentTime+.025,queuedAudio);source.start(when);queuedAudio=when+count/48000;
    sources.add(source);source.onended=()=>sources.delete(source);
  }
  function render(body){
    dispose();const token=generation,rom=getRom(),project=getProject(),nextIdentity=rom.sha256+JSON.stringify(project);
    if(identity!==nextIdentity){if(game){game.destroy();game=null;}battery=null;}
    identity=nextIdentity;
    const toolbar=el('div',undefined,'simulation-toolbar'),status=el('span',t('尚未启动原版游戏'));status.setAttribute('role','status');
    const stage=el('div',undefined,'native-game-stage');stage.tabIndex=0;stage.setAttribute('aria-label',t('原版游戏画面'));
    const canvas=el('canvas');canvas.width=240;canvas.height=160;canvas.setAttribute('aria-label',t('GBA 游戏画面'));
    const context=canvas.getContext('2d'),image=new ImageData(240,160);stage.append(canvas);
    const start=button(t(game?'继续试玩':'启动原版游戏'),async()=>{
      try{
        busy=true;refresh();status.textContent=t('正在启动 WASM 游戏核心');
        await ensureAudio();
        if(token!==generation)return;
        if(gain)gain.gain.value=mute.checked?0:.5;
        if(!game){
          const candidate=build(rom,getProject()).bytes;
          const engine=await createNativeGame(candidate,{save:battery});
          if(token!==generation){engine.destroy();return;}
          game=engine;
        }
        if(token!==generation)return;
        playing=true;last=0;accumulator=0;stage.focus();refresh();schedule();
      }catch(error){if(token===generation)status.textContent=error.message;}
      finally{if(token===generation){busy=false;updateButtons();}}
    },'accent');
    const pause=button(t('暂停'),()=>{stop();refresh();});
    const firstAct=button(t('新游戏：雪球战'),async()=>{
      stop();busy=true;refresh();status.textContent=t('正在进入第一幕');
      try{
        await ensureAudio();if(token!==generation)return;if(gain)gain.gain.value=mute.checked?0:.5;
        battery=null;
        if(game){game.destroy();game=null;}
        const engine=await createNativeGame(build(rom,getProject()).bytes);
        if(token!==generation){engine.destroy();return;}game=engine;
        await enterFirstAct(engine,{yieldControl:()=>new Promise(resolve=>requestAnimationFrame(()=>{draw();resolve();})),cancelled:()=>token!==generation});
        if(token!==generation)return;
        playing=true;last=0;accumulator=0;stage.focus();refresh();schedule();
      }catch(error){if(token===generation){refresh();status.textContent=error.message;}}
      finally{if(token===generation){busy=false;updateButtons();}}
    });
    const next=button(t('单帧'),()=>{stop();if(game){game.frame(0);draw();refresh();}});
    const reset=button(t('重新开始'),()=>{stop();if(game){battery=game.battery();game.destroy();game=null;}refresh();});
    const speed=el('select');speed.setAttribute('aria-label',t('游戏速度'));
    for(const rate of[1,2,4]){const option=el('option',`${rate}×`);option.value=rate;speed.append(option);}
    speed.onchange=()=>silence();
    const mute=el('input');mute.type='checkbox';mute.checked=false;mute.setAttribute('aria-label',t('静音'));
    mute.onchange=()=>{if(gain)gain.gain.value=mute.checked?0:.5;};
    const muteLabel=el('label',t('静音'));muteLabel.prepend(mute);
    const saveButton=button(t('导出游戏存档'),()=>{if(game){
      const bytes=game.battery();if(bytes.length)download('ffta-composer.sav',bytes,'application/octet-stream');
      else status.textContent=t('游戏尚未生成存档');
    }});
    const saveFile=el('input');saveFile.type='file';saveFile.accept='.sav,application/octet-stream';saveFile.hidden=true;
    const importSave=button(t('载入游戏存档'),()=>saveFile.click());
    saveFile.onchange=async()=>{
      const file=saveFile.files?.[0];if(!file)return;
      const bytes=new Uint8Array(await file.arrayBuffer());
      if(token!==generation)return;
      if(![65536,131072].includes(bytes.length)){status.textContent=t('请选择 64 或 128 KiB 的 GBA 存档');return;}
      stop();battery=bytes;if(game){game.destroy();game=null;}refresh();status.textContent=t('存档已载入，启动游戏后读取');
    };
    toolbar.append(start,firstAct,pause,next,reset,speed,muteLabel,status);
    const controls=el('div',undefined,'native-game-controls');
    const updateKeys=()=>{keys=0;for(const value of held)keys|=GBA_KEYS[value]??0;};
    const release=()=>{stop();refresh();};
    for(const name of['Up','Left','Down','Right','A','B','L','R','Select','Start']){
      const control=button(({Up:'↑',Left:'←',Down:'↓',Right:'→'})[name]??name,()=>{});
      control.setAttribute('aria-label',`GBA ${name}`);control.dataset.gba=name;
      control.onpointerdown=event=>{event.preventDefault();control.setPointerCapture?.(event.pointerId);held.add(name);updateKeys();};
      for(const event of['pointerup','pointercancel','lostpointercapture'])control.addEventListener(event,()=>{held.delete(name);updateKeys();});
      controls.append(control);
    }
    const onDown=event=>{
      if(event.target.matches('input,select,textarea'))return;
      const name=keyMap[event.code];if(!name)return;event.preventDefault();held.add(name);updateKeys();
    };
    const onUp=event=>{const name=keyMap[event.code];if(name){event.preventDefault();held.delete(name);updateKeys();}};
    stage.addEventListener('keydown',onDown);stage.addEventListener('keyup',onUp);
    window.addEventListener('blur',release);
    const visibility=()=>{if(document.hidden){stop();refresh();}};document.addEventListener('visibilitychange',visibility);
    removeListeners=()=>{window.removeEventListener('blur',release);document.removeEventListener('visibilitychange',visibility);};
    const assets=el('div',undefined,'buttons');assets.append(importSave,saveButton,saveFile);
    const help=el('p',t('原版游戏由 WASM 执行，包含完整战斗。方向键移动；X/A 确认，Z/B 取消，Enter 开始，Shift 选择。'),'simulation-note');
    const local=el('p',t('ROM 和存档只在本机处理；可导出本次游戏的 SAV。'),'simulation-note');
    const credit=el('small',`${NATIVE_CORE.name} ${NATIVE_CORE.version} · WASM`,'native-game-credit');
    body.append(toolbar,stage,controls,assets,help,local,credit);
    let last=0,accumulator=0,busy=false;
    function draw(){if(game){image.data.set(game.pixels());context.putImageData(image,0,0);}}
    function updateButtons(){
      start.disabled=playing||busy;start.textContent=t(game?'继续试玩':'启动原版游戏');pause.disabled=!playing;
      firstAct.disabled=busy;next.disabled=!game||busy;reset.disabled=!game||busy;saveButton.disabled=!game||busy;importSave.disabled=busy;
    }
    function refresh(){
      updateButtons();
      status.textContent=t(playing?'原版游戏运行中':game?'原版游戏已暂停':'尚未启动原版游戏');draw();
    }
    function schedule(){if(playing&&!frame)frame=requestAnimationFrame(tick);}
    function tick(time){
      frame=0;if(!playing||!game||token!==generation)return;
      accumulator+=last?Math.min(250,time-last)*Number(speed.value):1000/NATIVE_CORE.fps;last=time;
      let count=0;
      try{
        while(accumulator>=1000/NATIVE_CORE.fps&&count++<8){
          game.frame(keys);if(Number(speed.value)===1)playAudio(game.audio());accumulator-=1000/NATIVE_CORE.fps;
        }
        draw();schedule();
      }catch(error){stop();refresh();status.textContent=error.message;}
    }
    refresh();
  }
  return {id:'simulation',label:'原版试玩',render,dispose,getSnapshot:()=>game?.snapshot()??null};
}
