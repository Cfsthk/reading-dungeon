(function(){
'use strict';
const $=id=>document.getElementById(id),Run=DungeonEngine.Run;
const read=(key,fallback)=>{try{const raw=localStorage.getItem(key);return raw===null?fallback:JSON.parse(raw);}catch{return fallback;}};
const readerId=value=>typeof value==='string'&&value.trim()&&value!=='+'?value.slice(0,24):'traveller-1';
// Reuse the last active reader's saved journey, reading progress and audio settings.
const profile=readerId(read('dungeon-active-reader-v1',read('mist-reading-profile-v2','traveller-1')));
const prefix='dungeon-v1:'+profile+':';
const learning=read(prefix+'learning',null);
let run=Run.restore(read(prefix+'run',null),{learning})||new Run({learning});
let art=null,ready=false,paused=false,lastFrame=performance.now(),sinceSave=0,elapsedVisual=0,transition=null,deferFinish=false,endShown=false,soundOn=read(prefix+'sound',true)!==false,impactEffect=null,lastImpactSerial=run.impactSerial,shotGeometry=null,savedShot=read(prefix+'shot',null);
let missedShots=[];
const gainUntil={timer:0,coin:0};
let entranceWalk=null,lastMiss=null;
const music=$('dungeon-music');
const sfx=DungeonSfx.create(window);
const dungeonTrack=music.getAttribute('src'),bossTrack=music.getAttribute('data-boss-track');
let musicOn=read(prefix+'music',true)!==false,musicRequested=false,pageSuspended=false;
let dungeonMusicPosition=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),ctx=$('room').getContext('2d');
const visual={x:480,y:600,hover:null,selected:null,moving:false,fade:1,hurt:false,damage:false,reward:false,reduced:reduced.matches};
function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
function persist(){if(!write(prefix+'run',run.serialize())||!write(prefix+'learning',run.learning.export())||
 !write(prefix+'shot',shotGeometry?.record||savedShot)||!write(prefix+'shot-misses',missedShots.map(shot=>shot.record)))$('announcement').textContent='未能儲存本次進度，請保留此頁。';sinceSave=0;}
function time(seconds){const n=Math.max(0,Math.ceil(seconds));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function icon(canvas,key){if(!art)return;const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);art.sprite(c,key,0,0,canvas.width,canvas.height);}
function makeIcon(key,size=32){const c=document.createElement('canvas');c.width=c.height=size;c.setAttribute('aria-hidden','true');icon(c,key);return c;}
const obstacleFeedback={
 fed:'守門獸在食盤旁吃魚，門前的路空出來了。',bell:'鈴鐺響了。守門獸仍然守着門口。',sniff:'守門獸嗅了嗅，仍然伏在門前。',
 drain:'水退了，石路露出來了。',surge:'水湧了上來，石路仍然淹在水裏。',trickle:'只有少量水流走，水位仍然很高。',
 roll:'礦車開始沿路軌前進。',clank:'拉桿咔噠一響，礦車仍擋在路上。',brake:'礦車仍停在路中央。'
};
const controlLabels={
 door:'選擇通道',person:'選擇人物',item:'選擇物件',bridge:'選擇橋樑',ladder:'選擇梯子',sluice:'選擇水閘',signal:'選擇訊號鼓',
 feeding:'選擇放魚的食盤',floodgate:'選擇排水拉桿',cart:'選擇礦車拉桿',console:'按下機器上的按鈕',dispatch:'選擇要派出的礦車'
};
const machineTimings={correct:.80,wrong:.40,reduced:.16};
const obstacleTimings={correct:1.10,wrong:.78,reduced:.35};
function unlockSounds(){if(soundOn)sfx.unlock();}
function play(kind){if(soundOn)sfx.play(kind);}
function shouldPlayMusic(){
 // Check the dialogs directly so a Resume click can play during the user gesture.
 return musicOn&&musicRequested&&ready&&!pageSuspended&&!document.hidden&&
  !$('pause-dialog').open&&run.phase!=='ended'&&
  (run.phase!=='entrance'||entranceWalk!==null);
}
function syncMusic(){
 const track=run.boss?bossTrack:dungeonTrack;
 if(music.getAttribute('src')!==track){
  music.pause();
  if(run.boss)dungeonMusicPosition=music.currentTime;
  // Reuse the activated media element. Setting the source cancels its old load.
  music.src=track;
  music.currentTime=run.boss?0:dungeonMusicPosition;
 }
 if(!shouldPlayMusic()){
  if(!music.paused)music.pause();
  return;
 }
 if(!music.paused)return;
 // A later gameplay gesture can retry if the browser blocks this attempt.
 music.play()?.then(()=>{if(!shouldPlayMusic())music.pause();},()=>{});
}
function requestMusic(){musicRequested=true;syncMusic();}
function animateClass(node,name){node.classList.remove(name);void node.offsetWidth;node.classList.add(name);}
function setPaused(value){paused=value;if(value)sfx.stop();lastFrame=performance.now();syncMusic();persist();}
function resetVisual(){
 const anchor=run.scene.questStep===2?DungeonArt.questAnchor(run.scene):DungeonArt.PLAYER;
 Object.assign(visual,{entryProgress:0,exitProgress:0,exitId:null,operation:null,interaction:null,x:anchor.x,y:anchor.y,hover:null,selected:null,moving:false,fade:1,hurt:false,damage:false,hidden:false,collectedId:null,openChestId:null,reaction:null,projectileImpact:0,impactContact:null,walkOffset:0,collapsedId:null,collapsedIds:[],fall:0,fallDistance:0,returning:false});
 $('chamber').classList.remove('hit','leaving');
}
function shotSchedule(){
 const boss=run.boss;if(!boss)return null;
 const cycle=boss.impactsResolved+1,launchAt=boss.projectileStartedAt+(cycle-1)*(boss.pacing.flightSeconds+boss.pacing.cooldownSeconds);
 return{cycle,launchAt,impactAt:launchAt+boss.pacing.flightSeconds};
}
function shotMatches(record,cycle){return !!(record&&run.boss)&&record.seed===run.seed&&record.area===run.area&&record.encounter===run.boss.encounter&&record.cycle===cycle&&record.startedAt===run.boss.projectileStartedAt;}
function savedAimMatches(record,cycle,launchAt){
 const p=record?.launch;
 return shotMatches(record,cycle)&&record.launchAt===launchAt&&launchAt<=run.elapsed&&p&&Number.isFinite(p.x)&&p.x>=0&&p.x<=960&&Number.isFinite(p.y)&&p.y>=0&&p.y<=640&&Number.isFinite(p.walkOffset)&&Math.abs(p.walkOffset)<=3&&typeof p.returning==='boolean'&&typeof p.hurt==='boolean';
}
function captureLaunch(cue=false){
 const schedule=shotSchedule();if(!schedule||!art||run.phase==='ended'||run.elapsed<schedule.launchAt)return;
 if(shotMatches(shotGeometry?.record,schedule.cycle))return;
 const valid=savedAimMatches(savedShot,schedule.cycle,schedule.launchAt);
 // A saved shot keeps its launch angle. The cue only marks a new launch.
 const launch=valid?{...savedShot.launch}:{x:visual.x,y:visual.y,walkOffset:visual.walkOffset||0,returning:!!visual.returning,hurt:!!visual.hurt};
 const record={seed:run.seed,area:run.area,encounter:run.boss.encounter,cycle:schedule.cycle,startedAt:run.boss.projectileStartedAt,launchAt:schedule.launchAt,launch};
 shotGeometry={record,geometry:art.projectileGeometry(launch,run.area)};savedShot=record;write(prefix+'shot',record);
 if(cue&&!valid)play('bossShot');
}
function updateMissedShots(){
 const boss=run.boss;
 const visible=[];
 missedShots=(!boss||run.phase==='ended')?[]:missedShots.filter(({record,geometry})=>{
  const {flightSeconds}=boss.pacing;
  const progress=(run.elapsed-record.launchAt)/flightSeconds;
  if(!art.projectileInFrame(geometry,progress,flightSeconds))return false;
  visible.push({geometry,progress,flightSeconds});
  return true;
 });
 visual.projectileMisses=visible;
}
function restoreMissedShots(){
 missedShots=[];
 if(!run.boss||run.phase==='ended')return;
 const saved=read(prefix+'shot-misses',[]);
 const records=Array.isArray(saved)?saved.slice(-16):[];
 records.push(savedShot);
 const {flightSeconds,cooldownSeconds}=run.boss.pacing;
 for(const hit of run.getBossImpacts()){
  if(!hit.dodged||hit.encounter!==run.boss.encounter)continue;
  const launchAt=run.boss.projectileStartedAt+(hit.cycle-1)*(flightSeconds+cooldownSeconds);
  const record=records.find(aim=>savedAimMatches(aim,hit.cycle,launchAt));
  if(record)missedShots.push({record,geometry:art.projectileGeometry(record.launch,run.area)});
 }
 updateMissedShots();
}
function showGain(kind,value){
 const node=$(kind+'-gain');if(kind==='coin'){$('coin-gain-value').textContent='+'+value;icon($('coin-gain-icon'),'coin');}else node.textContent='+'+value+'s';
 gainUntil[kind]=elapsedVisual+1.1;node.hidden=false;animateClass(node,'show');
}
function updateGains(){for(const kind of ['timer','coin'])if(elapsedVisual>=gainUntil[kind])$(kind+'-gain').hidden=true;}
function nextShotBoundary(){
 const schedule=shotSchedule();if(!schedule||run.phase==='ended')return Infinity;
 return(schedule.launchAt>run.elapsed?schedule.launchAt:schedule.impactAt)-run.elapsed;
}
function updateClock(){
 const active=!!run.boss,entering=active&&run.elapsed<run.boss.entranceEndsAt,due=!active&&run.nextBossIn===0,shot=run.bossProjectile;
 const seconds=active?shot.remaining:run.nextBossIn;
 $('time').textContent=time(seconds);
 $('clock').setAttribute('aria-label',active?(shot.phase==='flight'?'投射物撞擊倒數 ':shot.phase==='cooldown'?'守衛蓄力倒數 ':'守衛甦醒倒數 ')+time(seconds):due?'穿過下一道門後，守衛出現':'守衛出現倒數 '+time(seconds));
 $('clock').title=active?'依照三步刻文離開競技場':due?'穿過下一道門後，守衛出現':'下一位守衛';
 $('clock').classList.toggle('boss-active',active);$('clock').classList.toggle('urgent',active&&shot.phase==='flight'&&seconds<=2);
 visual.bossEntrance=entering?Math.max(0,(run.elapsed-run.boss.enteredAt)/1.1):1;
 visual.projectile=run.phase==='ended'?null:shot;
 captureLaunch();visual.projectileGeometry=active?shotGeometry?.geometry:null;
 visual.attackUrgent=active&&!entering&&shot.phase==='flight'&&seconds<=2;
 if(!transition)for(const b of $('routes').children)b.disabled=!ready||run.phase!=='playing'||entering||visual.collapsedIds?.includes(b.dataset.id);
}
function updateVitals(){
 $('coins').textContent=run.coins;updateClock();
 $('hearts').replaceChildren(...Array.from({length:3},(_,i)=>{const c=makeIcon('heart');if(i>=run.hp)c.className='empty';return c;}));$('hearts').setAttribute('aria-label',run.hp+' 顆心');
}
function renderHint(){
 const scene=run.scene,visible=run.hintShown&&run.phase!=='ended'&&!!scene.hint;
 const hint=$('hint');hint.hidden=!visible;hint.textContent=visible?scene.hint:'';
 if(!visible||!scene.lesson)return;
 const attempt=lastMiss?.sceneId===scene.id?lastMiss:run.attempts===1?run.records.at(-1):null;
 if(attempt?.sceneId!==scene.id)return;
 const option=scene.options.find(o=>o.id===attempt.optionId);
 if(option?.targetEvidence!=='neutral')return;
 const detail=scene.lesson.conditions[option.matches.indexOf(false)];
 if(detail)hint.textContent='再看看這項線索：「'+detail+'」。';
}
function renderRoom(announce=false){
 const s=run.scene,atEntrance=run.phase==='entrance';
 $('game').classList.toggle('at-entrance',atEntrance);
 $('entrance-gate').hidden=!atEntrance;$('entrance-gate').disabled=!atEntrance||entranceWalk!==null;
 $('clock').hidden=atEntrance;$('finish').hidden=atEntrance;
 $('area-name').textContent=s.locationName||DungeonContent.AREAS[s.area].name;
 $('chapter').textContent=atEntrance?'門前石碑':s.title;
 const step=$('quest-step');
 step.hidden=!s.chain;
 if(s.chain){
  const verb=s.questStep===2?'行動':s.chain.sourceType==='person'?'打聽':'查閱';
  step.textContent=verb+'　'+s.questStep+' / '+s.questTotal;
 }
 $('prompt').classList.remove('clue-revealed');
 $('prompt').textContent=atEntrance?'穿過大門，守衛的三分鐘倒數便會開始。':s.prompt;
 renderHint();
 $('game').classList.toggle('arena',s.targetType==='arena');$('boss-plan').hidden=!s.escapeSteps;$('boss-plan').replaceChildren();$('boss-step').hidden=!s.escapeSteps;
 if(s.escapeSteps){for(const step of s.escapeSteps){const li=document.createElement('li');li.textContent=step.text;li.className=step.step===s.currentStep?'current':step.step<s.currentStep?'complete':'';if(step.step===s.currentStep)li.setAttribute('aria-current','step');$('boss-plan').append(li);}$('boss-step').textContent=s.currentStep+' / 3';}

 $('game').classList.toggle('fatal',run.lockedPenalty==='fatal');$('game').classList.toggle('pursuit',['pursuit','overrun'].includes(run.lockedTier));visual.pursuit=['pursuit','overrun'].includes(run.lockedTier);
 const progress=s.progress;
 $('story-progress').hidden=!progress;
 $('story-progress').replaceChildren(...Array.from({length:progress?.total||0},(_,i)=>{
  const bar=document.createElement('i');bar.className=i+1<progress.current?'passed':i+1===progress.current?'current':'';return bar;
 }));
 if(progress)$('story-progress').setAttribute('aria-label','區域探索 '+progress.current+' / '+progress.total);
 $('guardian').hidden=!s.guardian;if(s.guardian){$('guardian-name').textContent=s.guardian.name;$('seals').replaceChildren(...Array.from({length:3},(_,i)=>{const p=document.createElement('i');if(i<s.guardian.round-1)p.className='broken';return p;}));$('seals').setAttribute('aria-label','第 '+s.guardian.round+' 重封印，共 3 重');}
 const seal=$('reading-mark'),hasSeal=!!s.areaGate||(s.encounterType==='gate'&&!!s.chain);
 seal.classList.toggle('checkpoint-seal',!!s.checkpoint||hasSeal);
 seal.classList.toggle('earned',hasSeal);
 seal.textContent=s.checkpoint?'◇':'◆';
 const controls=s.chestRoom?'選擇寶箱':s.targetType==='cart'&&!s.obstacle?'選擇礦車':controlLabels[s.targetType];
 $('routes').setAttribute('aria-label',controls||'選擇目標');
 $('routes').replaceChildren();const positions=DungeonArt.layout(s),nearby=!!s.obstacle||s.questStep===1||s.targetType==='console'||s.targetType==='dispatch';
 for(const p of positions){
  const option=s.options.find(o=>o.id===p.id),button=document.createElement('button');
  button.type='button';button.className=nearby?'route nearby-control':'route';button.dataset.id=p.id;
  const x=nearby?p.x:p.x-p.w/2,y=nearby?p.top+p.h/2:p.top;
  button.style.left=x/960*100+'%';button.style.top=y/640*100+'%';
  button.style.width=p.w/960*100+'%';button.style.height=p.h/640*100+'%';
  button.setAttribute('aria-label',option.label);
  button.disabled=!ready||run.phase!=='playing'||!!(run.boss&&run.elapsed<run.boss.entranceEndsAt);
  button.addEventListener('pointerenter',()=>visual.hover=p.id);button.addEventListener('pointerleave',()=>visual.hover=null);
  button.addEventListener('focus',()=>visual.hover=p.id);button.addEventListener('blur',()=>visual.hover=null);
  button.addEventListener('click',event=>{
   if(run.scene===s)choose(p.id,event.detail===0);
  });$('routes').append(button);
 }
 updateVitals();if(announce)$('announcement').textContent=$('prompt').textContent;
}
// Path interpolation is distance based, so corners never cut through a target.
function followPath(points,progress){
 const lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y)),total=lengths.reduce((a,b)=>a+b,0);
 let distance=Math.max(0,Math.min(1,progress))*total;
 for(let i=0;i<lengths.length;i++){if(distance<=lengths[i]&&lengths[i]){const q=distance/lengths[i];return{x:points[i].x+(points[i+1].x-points[i].x)*q,y:points[i].y+(points[i+1].y-points[i].y)*q};}distance-=lengths[i];}
 return points[points.length-1];
}
function walkPath(points,progress){Object.assign(visual,followPath(points,progress));visual.moving=progress<1;}
function openExit(tr,progress,start,end){
 visual.exitId=tr.type==='door'?tr.result.optionId:null;
 visual.exitProgress=Math.max(0,Math.min(1,(progress-start)/(end-start)));
 if(visual.exitProgress>0&&!tr.doorOpened){
  tr.doorOpened=true;
  play('doorOpen');
 }
 if(run.scene.checkpoint&&visual.exitProgress>0&&!tr.sealShown){
  tr.sealShown=true;
  const seal=$('reading-mark');seal.textContent='◆';seal.classList.add('earned');
  $('announcement').textContent='取得關印。';
 }
}
function choose(id,keyboard=false){
 if(!ready||paused||document.hidden||transition||run.phase!=='playing'||visual.collapsedIds?.includes(id))return;
 const from={x:visual.x,y:visual.y},path=DungeonArt.navigation(run.scene,id,from);
 const result=run.choose(id);if(!result)return;const target=DungeonArt.layout(run.scene).find(p=>p.id===id),option=run.scene.options.find(o=>o.id===id),type=option.targetType||run.scene.targetType;
 unlockSounds();
 requestMusic();
 lastMiss=result.correct?null:{sceneId:run.scene.id,optionId:id};
 const obstacle=!!run.scene.obstacle,operation=obstacle||['sluice','cart','signal','console','dispatch'].includes(type);
 const hazard=!result.correct&&!operation&&type!=='door'?(type==='item'&&option.traits.type==='box'?'mimic':type):null;
 transition={result,target,type,hazard,operation,obstacle,keyboard,response:option.response,isTreasure:option.reward==='chest',path,from,approach:[from,...path.approach],elapsed:0,hit:false};visual.selected=id;visual.hover=null;visual.moving=true;visual.returning=false;
 for(const b of $('routes').children)b.disabled=true;
 persist();
}
function finishTransition(){
 // Resolve the current instant's collision before committing an exit.
 if(deferFinish){transition.readyToFinish=true;return;}
 const {result,keyboard}=transition;
 const previousTier=run.lockedTier,previousArea=run.area,previousBoss=run.boss,previousScene=run.scene.id,previousDelay=run.bossDelaySeconds,correct=result.correct,collapsedIds=visual.collapsedIds.slice();transition=null;
 if(run.phase==='ended'){showEnd();return;}
 run.finishTransition();resetVisual();if(!run.boss){impactEffect=null;missedShots=[];}if(run.scene.id===previousScene)visual.collapsedIds=collapsedIds;renderRoom(true);persist();
 if(Boolean(run.boss)!==Boolean(previousBoss))syncMusic();
 if(result.continuesQuest){
  animateClass($('prompt'),'clue-revealed');
  if(keyboard)$('routes').children[0]?.focus?.({preventScroll:true});
 }
 if(run.bossDelaySeconds>previousDelay)showGain('timer',run.bossDelaySeconds-previousDelay);
 if(correct&&(run.area!==previousArea||run.lockedTier!==previousTier)){
  $('chapter-flash').textContent=run.boss&&!previousBoss?'守衛現身':previousBoss&&!run.boss?'逃出競技場':run.area!==previousArea?DungeonContent.AREAS[run.area].name:['pursuit','overrun'].includes(run.lockedTier)?'影獸追來了':run.lockedPenalty==='fatal'?'致命深處':'深入地牢';animateClass($('chapter-flash'),'show');
 }
}
function resolveFeedback(tr){
 if(tr.hit)return;tr.hit=true;visual.hurt=tr.result.damage>0;visual.damage=tr.result.damage>0;
 if(tr.obstacle){
  $('announcement').textContent=obstacleFeedback[tr.response];
  play(tr.response==='fed'?'monsterEat':tr.response);
  return;
 }
 if(tr.type==='console'||tr.type==='dispatch'){
  const consolePress=tr.type==='console';
  $('announcement').textContent=tr.result.correct
   ?(consolePress?'按鈕亮起，門鎖鬆開了。':'礦車正沿路軌開出。')
   :(consolePress?'按鈕彈回來了，門仍然關着。':'這輛礦車留在原處，門仍然關着。');
  if(!tr.result.correct)play('clank');
  return;
 }
 if(tr.result.correct&&!tr.result.continuesQuest&&tr.type==='item'){if(tr.isTreasure)visual.openChestId=tr.result.optionId;else visual.collectedId=tr.result.optionId;}
 updateVitals();if(tr.result.damage){animateClass($('chamber'),'hit');play(({person:'personHit',mimic:'mimicHit'})[tr.hazard]||'hurt');$('announcement').textContent=tr.result.fatal?'橋面崩塌，你墜入了深淵。':({person:'你被襲擊了',mimic:'寶箱怪咬了你一口',ladder:'梯子斷了，你摔下來了',item:'封印反擊了'}[tr.hazard]||'你受傷了')+'，失去一顆心。';}else if(!tr.result.correct){$('announcement').textContent=tr.type==='door'?'門沒有打開。你原路折返。':'這個選擇不符合線索。';play('step');}
 if(tr.result.coinsEarned){showGain('coin',tr.result.coinsEarned);play('chest');}
}
function stepTransition(delta){
 const tr=transition;if(!tr)return;tr.elapsed+=delta;
 const crossing=['bridge','ladder'].includes(tr.type),correct=tr.result.correct,boss=tr.result.boss,stop=tr.path.stop;
 // ponytail: fixed short beats keep reading choices brisk, with no extra action menu.
 const approach=reduced.matches?.05:.38,pause=tr.type==='door'?0:boss?.08:.18,exit=reduced.matches?.06:.44,back=reduced.matches?.06:boss||tr.type==='door'?.24:.32;
 visual.hurt=false;visual.damage=false;visual.returning=false;visual.fall=0;visual.reaction=null;
 if(tr.type==='door'&&correct){
  const q=Math.min(1,tr.elapsed/(reduced.matches?.11:.70));
  openExit(tr,q,.43,.77);
  walkPath([...tr.approach,...tr.path.exit],q);
  if(q>=.72)resolveFeedback(tr);
  visual.fade=q>.84?(1-q)/.16:1;
  if(q>.84&&!tr.fading){tr.fading=true;animateClass($('chamber'),'leaving');}
  if(q>=1)finishTransition();
  return;
 }
 if(tr.elapsed<approach){walkPath(tr.approach,tr.elapsed/approach);return;}
 Object.assign(visual,stop);visual.moving=false;
 if(tr.result.continuesQuest){
  const progress=Math.min(1,(tr.elapsed-approach)/(reduced.matches?.10:.28));
  visual.interaction={id:tr.result.optionId,progress,from:stop};
  if(progress>=1){
   play('step');
   finishTransition();
  }
  return;
 }
 if(crossing){
  const traverse=reduced.matches?.06:.28,middle=tr.path.crossingMidpoint,onBridge=tr.elapsed-approach;
  if(onBridge<traverse){walkPath([stop,middle],onBridge/traverse);return;}
  Object.assign(visual,middle);
  if(!correct&&!tr.hit){visual.collapsedId=tr.result.optionId;if(!visual.collapsedIds.includes(tr.result.optionId))visual.collapsedIds.push(tr.result.optionId);}
  resolveFeedback(tr);
  const after=onBridge-traverse;
  if(correct){
   const q=Math.min(1,after/(exit+.16));walkPath([middle,...tr.path.exit],q);visual.fade=q>.8?(1-q)*5:1;
   openExit(tr,q,.42,.77);
   if(q>=1)finishTransition();
  }else{
   const collapse=reduced.matches?.16:.46,q=Math.min(1,after/collapse);
   visual.reaction={type:tr.type,id:tr.result.optionId,progress:q};
   if(after<collapse){visual.fall=q;visual.fallDistance=stop.y-middle.y;visual.hurt=q<.42;visual.damage=visual.hurt;visual.fade=1;}
   else if(run.phase==='ended'){visual.fall=1;visual.fade=0;finishTransition();}
   else{const retreat=Math.min(1,(after-collapse)/back);visual.returning=true;visual.fade=1;walkPath(tr.approach.slice().reverse(),retreat);if(retreat>=1)finishTransition();}
  }
  return;
 }
 if(tr.operation){
  // The mechanism responds at contact; the player can see its new state while leaving.
  const timing=tr.obstacle ? obstacleTimings : machineTimings;
  const duration=reduced.matches ? timing.reduced : timing[correct?'correct':'wrong'];
  const progress=Math.min(1,(tr.elapsed-approach)/duration);
  visual.operation={id:tr.result.optionId,correct,progress};
  const openingStart=.82;
  const feedbackAt=tr.type==='feeding'&&correct?.76:.28;
  if(!tr.hit&&(!tr.obstacle||progress>=feedbackAt)){
   resolveFeedback(tr);
   if(correct&&!tr.obstacle)play(tr.type);
  }
  if(correct)openExit(tr,progress,openingStart,1);
  if(progress<1)return;
  const exitDuration=tr.obstacle&&!reduced.matches ? .70 : exit;
  const travel=correct ? exitDuration : back;
  const q=Math.min(1,(tr.elapsed-approach-duration)/travel);
  visual.returning=!correct;
  walkPath(correct?[stop,...tr.path.exit]:tr.approach.slice().reverse(),q);
  if(correct)visual.fade=q>.8?(1-q)*5:1;
  if(q>=1)finishTransition();
  return;
 }
 // A failed interaction has its own contact frame: the target attacks before the HUD flashes.
 if(correct&&run.scene.taskAction&&tr.type==='person'){
  const duration=reduced.matches?.12:.30;
  visual.interaction={id:tr.result.optionId,progress:Math.min(1,(tr.elapsed-approach)/duration),from:stop};
 }
 const reactionTime=tr.hazard?(reduced.matches?.21:.42):visual.interaction?(reduced.matches?.12:.30):pause;
 if(tr.hazard){
  const q=Math.min(1,(tr.elapsed-approach)/reactionTime);
  if(q<1)visual.reaction={type:tr.hazard,id:tr.result.optionId,progress:q};
  if(q>=.48)resolveFeedback(tr);
  visual.hurt=q>=.48&&q<.82;visual.damage=visual.hurt;
 }
 if(tr.elapsed<approach+reactionTime)return;
 resolveFeedback(tr);
 const after=tr.elapsed-approach-reactionTime;
 if(!correct){
  visual.hurt=false;visual.damage=false;
  if(run.phase==='ended'){visual.fade=1-Math.min(1,after/back);if(after>=back)finishTransition();}
  else{visual.returning=true;walkPath(tr.approach.slice().reverse(),Math.min(1,after/back));if(after>=back)finishTransition();}
 }else if(boss&&tr.type!=='door'){
  visual.returning=true;walkPath(tr.approach.slice().reverse(),Math.min(1,after/back));
  if(after>=back)finishTransition();
 }else{
  const q=Math.min(1,after/exit);walkPath([stop,...tr.path.exit],q);visual.fade=q>.78?(1-q)/.22:1;
  openExit(tr,q,0,.42);
  if(q>.78&&!tr.fading){tr.fading=true;animateClass($('chamber'),'leaving');}
  if(q>=1)finishTransition();
 }
}
function receiveImpacts(){
 const impacts=run.getBossImpacts(lastImpactSerial);if(!impacts.length)return false;
 let injured=false;
 for(const hit of impacts){
  lastImpactSerial=hit.serial;
  if(!shotMatches(shotGeometry?.record,hit.cycle))continue;
  if(hit.dodged){
   missedShots.push(shotGeometry);
  }else if(hit.damage){
   injured=true;
   impactEffect={remaining:.42,hit,contact:shotGeometry.geometry.contact};
   animateClass($('chamber'),'hit');
   play('hurt');
   $('announcement').textContent='投射物命中，失去 '+hit.damage+' 顆心。';
  }
 }
 updateVitals();persist();return injured;
}
function showEnd(){
 if(endShown)return;endShown=true;transition=null;missedShots=[];persist();if($('pause-dialog').open)$('pause-dialog').close();paused=false;visual.moving=false;
 syncMusic();
 for(const b of $('routes').children)b.disabled=true;
 $('end-title').textContent=run.reason==='quit'?'暫別地牢':'燈火熄滅';
 $('end-eyebrow').textContent='本次探索結束';
 const bridgeFall=run.reason==='fatal'&&run.scene.targetType==='bridge';
 $('story-ending').hidden=!bridgeFall;
 $('story-ending').textContent=bridgeFall?'橋面在你腳下斷開了。':'';
 $('end-rooms').textContent=run.completed;$('end-time').textContent=Math.max(0,run.encounters-(run.boss?1:0));$('end-coins').textContent=run.coins;icon($('end-icon'),run.reason==='quit'?'back':'skull');
 $('end-dialog').showModal();
}
function restart(){
 $('end-dialog').close();
 run=run.restart();
 lastMiss=null;
 entranceWalk=null;
 transition=null;
 impactEffect=null;
 shotGeometry=null;
 savedShot=null;
 missedShots=[];
 endShown=false;
 paused=false;
 gainUntil.timer=gainUntil.coin=0;
 lastImpactSerial=run.impactSerial;
 lastFrame=performance.now();
 updateGains();
 resetVisual();
 renderRoom(true);
 syncMusic();
 persist();
 $('entrance-gate').focus?.({preventScroll:true});
}
function stepEntrance(delta){
 elapsedVisual+=delta;
 if(entranceWalk===null)return;
 entranceWalk+=delta;
 const progress=Math.min(1,entranceWalk/(reduced.matches?.12:.55));
 if(!visual.entryProgress&&progress>0)play('doorOpen');
 visual.entryProgress=progress;
 visual.y=600-270*progress;
 visual.moving=progress<1;
 visual.walkOffset=reduced.matches?0:Math.sin(entranceWalk*18)*2;
 visual.fade=Math.min(1,(1-progress)/.18);
 if(progress<1)return;
 entranceWalk=null;
 if(run.enterDungeon()){
  resetVisual();renderRoom(true);persist();
  $('prompt').focus?.({preventScroll:true});
 }
}
$('entrance-gate').addEventListener('click',()=>{
 if(!ready||paused||document.hidden||run.phase!=='entrance'||entranceWalk!==null)return;
 entranceWalk=0;$('entrance-gate').disabled=true;unlockSounds();requestMusic();
});
function frame(now){
 const raw=Math.max(0,(now-lastFrame)/1000);lastFrame=now;
 if(ready&&!paused&&!document.hidden&&run.phase==='entrance'){
  stepEntrance(raw);
 }else if(ready&&!paused&&!document.hidden){
  let remaining=raw;
  do{
   // Sample movement before collision, including frames that span the end of a walk.
   captureLaunch(true);
   const boundary=nextShotBoundary(),delta=Math.min(remaining,transition?1/120:Infinity,boundary>0?boundary:Infinity);
   elapsedVisual+=delta;sinceSave+=delta;
   deferFinish=true;if(transition)stepTransition(delta);deferFinish=false;
   visual.walkOffset=visual.moving&&!reduced.matches?Math.sin(elapsedVisual*1000/55)*3:0;
   run.tick(delta,hit=>shotMatches(shotGeometry?.record,hit.cycle)&&art.projectileHits(shotGeometry.geometry,visual,run.scene.area));
   const newImpact=receiveImpacts();
   captureLaunch(true);
   if(run.phase==='ended'&&newImpact){transition=null;visual.moving=false;visual.fade=impactEffect.remaining/.42;}
   else if(transition?.readyToFinish)finishTransition();
   else if(run.phase==='ended'&&!transition&&!impactEffect)showEnd();
   updateClock();
   if(impactEffect){visual.impactContact=impactEffect.contact;if(!newImpact)impactEffect.remaining=Math.max(0,impactEffect.remaining-delta);visual.projectileImpact=impactEffect.remaining/.42;visual.hurt=impactEffect.hit.damage>0;visual.damage=impactEffect.hit.damage>0;if(!impactEffect.remaining){impactEffect=null;visual.hurt=false;visual.damage=false;visual.projectileImpact=0;visual.impactContact=null;if(run.phase==='ended'&&!transition)showEnd();}}
   else visual.projectileImpact=0;
   updateGains();
   remaining=Math.max(0,remaining-delta);
  }while(remaining>1e-9);
  if(sinceSave>=1)persist();
 }
 if(art){updateMissedShots();visual.reduced=reduced.matches;art.room(ctx,run.scene,visual,elapsedVisual*1000);}
 requestAnimationFrame(frame);
}
$('pause').addEventListener('click',()=>{if(run.phase==='ended'||!ready)return;$('pause-dialog').showModal();setPaused(true);});
$('resume').addEventListener('click',()=>{$('pause-dialog').close();unlockSounds();requestMusic();});
$('pause-dialog').addEventListener('close',()=>setPaused(false));
function renderMusic(){
 $('music').textContent='音樂　'+(musicOn?'開':'關');$('music').setAttribute('aria-pressed',String(musicOn));
}
renderMusic();
$('music').addEventListener('click',()=>{musicOn=!musicOn;write(prefix+'music',musicOn);renderMusic();syncMusic();});
function renderSound(){
 $('sound').textContent='音效　'+(soundOn?'開':'關');$('sound').setAttribute('aria-pressed',String(soundOn));
}
renderSound();
$('sound').addEventListener('click',()=>{soundOn=!soundOn;write(prefix+'sound',soundOn);renderSound();if(soundOn)unlockSounds();else sfx.stop();});
$('finish').addEventListener('click',()=>{run.end();showEnd();});$('restart').addEventListener('click',restart);
$('end-dialog').addEventListener('cancel',e=>e.preventDefault());
document.addEventListener('visibilitychange',()=>{if(document.hidden)sfx.stop();lastFrame=performance.now();syncMusic();persist();});
window.addEventListener('pagehide',()=>{pageSuspended=true;sfx.stop();syncMusic();persist();});
window.addEventListener('pageshow',()=>{pageSuspended=false;syncMusic();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('pause-dialog').open&&!$('end-dialog').open&&ready){e.preventDefault();$('pause-dialog').showModal();setPaused(true);}});
const load=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});
const atlasFiles={rooms:'rooms',sprites:'sprites',guardians:'guardians',roomsA:'rooms-a',roomsB:'rooms-b',
 encounters:'encounters',gaps:'gaps',ledges:'ledges',crossings:'crossings',arena:'arena',projectiles:'projectiles',
 people:'people',items:'items',ribbons:'ribbons',entrance:'entrance',newRooms:'rooms-new',newRoomsA:'rooms-new-alt',
 newGaps:'gaps-new',newLedges:'ledges-new',newCast:'annex-cast',newItems:'annex-items',newGuardians:'annex-guardians',
 lessonBases:'lesson-bases',lessonMounts:'lesson-mounts',lessonPatterns:'lesson-patterns',mechanisms:'mechanisms',
 obstacleProps:'obstacle-props',obstacleTerrain:'obstacle-terrain',railGates:'rail-gates'};
Promise.all(Object.entries(atlasFiles).map(async ([key,file])=>{
 const revision=file==='rail-gates'?14:file.startsWith('obstacle-')?13:12;
 return [key,await load('assets/dungeon/'+file+'.png?v='+revision)];
})).then(entries=>{
 const {rooms,sprites,guardians,...extras}=Object.fromEntries(entries);
 art=DungeonArt.create(rooms,sprites,guardians,extras);ready=true;$('loading').hidden=true;document.querySelectorAll('[data-sprite]').forEach(c=>icon(c,Number(c.dataset.sprite)));resetVisual();restoreMissedShots();renderRoom();lastFrame=performance.now();syncMusic();persist();if(run.phase==='ended')showEnd();
}).catch(()=>{$('loading').textContent='圖像未能載入，請重新整理。';});
// Read-only inspection surface for teacher diagnostics; no QA-only controls in the game.
window.DungeonAdventure={get run(){return run;},get ready(){return ready;},get paused(){return paused;}};
requestAnimationFrame(frame);
})();
