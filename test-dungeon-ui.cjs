'use strict';

// Native VM integration: actual app handlers and animation loop, a minimal DOM,
// real content/engine/art, and deterministic active/hidden time. No browser API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const DungeonContent = require('./dungeon-content.js');
const DungeonEngine = require('./dungeon-engine.js');
const DungeonArt = require('./dungeon-art.js');
const source = fs.readFileSync(path.join(__dirname, 'dungeon-app.js'), 'utf8');
const artSource = fs.readFileSync(path.join(__dirname, 'dungeon-art.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// Clock tests start with a safe single action. Door tests advance to an actual door.
function findOpeningSeed(){
  for(let i=0;i<200;i++){
    const seed='ui-entry-'+i,run=new DungeonEngine.Run({seed});
    run.enterDungeon();
    if(run.scene.chain||!['sluice','signal'].includes(run.scene.targetType)||!run.scene.lesson)continue;
    run.choose(run.scene.options.find(option=>option.correct).id);run.finishTransition();
    if(!run.scene.chain)return seed;
  }
  throw Error('No consecutive single-action opening found');
}
const openingSeed=findOpeningSeed();

function snapshotsFor(types,accept=()=>true){
  const found=new Map();
  for(let i=0;i<100&&found.size<types.length;i++){
    const r=new DungeonEngine.Run({seed:'room-ui-'+i,initialBand:3});
    r.enterDungeon();
    for(let j=0;j<28;j++){
      const s=r.scene;
      if(types.includes(s.targetType)&&!found.has(s.targetType)&&accept(s))found.set(s.targetType,r.serialize());
      const o=s.options.find(o=>o.correct&&o.route!=='vault')||s.options.find(o=>o.correct);
      r.choose(o.id);r.finishTransition();
    }
  }
  assert.equal(found.size,types.length,'All requested encounters must be reachable in normal runs');
  return found;
}
const savedRoom=snapshot=>new Map([['dungeon-v1:traveller-1:run',JSON.stringify(snapshot)]]);

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.style = {};
    this.dataset = {};
    this._textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.open = false;
    this.width = 300;
    this.height = 150;
    this.offsetWidth = 100;
    this.className = '';
    this.classEvents = [];
    this.classList = {
      add: (...names) => { this.classEvents.push({ action: 'add', names }); this.className = [...new Set([...this.className.split(' ').filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.classEvents.push({ action: 'remove', names }); this.className = this.className.split(' ').filter(name => !names.includes(name)).join(' '); },
      contains: name => this.className.split(' ').includes(name),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this.classList.contains(name) : force;
        this.classList[enabled ? 'add' : 'remove'](name);
        return enabled;
      }
    };
  }
  get textContent() { return this._textContent; }
  set textContent(value) { this._textContent = String(value); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) {
    this.attributes.set(key, String(value));
    if (key === 'id') this.id = value;
    if (key.startsWith('data-')) this.dataset[key.slice(5)] = String(value);
  }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(callback);
  }
  dispatch(name, properties = {}) {
    const event = { target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...properties };
    for (const callback of this.listeners.get(name) || []) callback(event);
    return event;
  }
  focus() { this.focused=true;this.dispatch('focus'); }
  showModal() { this.open = true; }
  close() {
    if (!this.open) return;
    this.open = false;
    this.dispatch('close');
  }
  getContext() {
    if (!this.context) {
      const calls = [];
      const imageData = (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) });
      this.context = new Proxy({ calls, canvas: this, globalAlpha: 1,
        createImageData(width, height) { calls.push({ key: 'createImageData', args: [width, height] }); return imageData(width, height); },
        getImageData(x, y, width, height) {
          calls.push({ key: 'getImageData', args: [x, y, width, height] });
          // A deliberately transparent border lets the production alpha-outline path run.
          // Pixel accuracy belongs to the native-Canvas art tests, not this DOM fixture.
          const pixels = imageData(width, height);
          for (let row = 1; row < height - 1; row += 1) for (let col = 1; col < width - 1; col += 1) pixels.data[(row * width + col) * 4 + 3] = 255;
          return pixels;
        }
      }, {
        get(target, key) {
          if (key in target) return target[key];
          return (...args) => { calls.push({ key, args }); };
        }
      });
    }
    return this.context;
  }
}

class AudioElement extends Element {
  constructor(){
    super('audio');
    this.paused=true;
    this.playCalls=0;
    this.currentTime=0;
    this.tracks=[];
  }
  get src(){return this.getAttribute('src');}
  set src(value){this.setAttribute('src',value);this.currentTime=0;}
  play(){
    this.playCalls++;
    this.tracks.push(this.src);
    if(this.rejectNext){
      this.rejectNext=false;
      return Promise.reject(new Error('User activation required'));
    }
    this.paused=false;
    return this.pendingPlay||Promise.resolve();
  }
  pause(){this.paused=true;}
}

async function boot(storageInput = new Map(), { enter = true, seed = openingSeed, reducedMotion = false } = {}) {
  const storage = new Map(storageInput);
  const elements = new Map();
  const allElements = [];
  for (const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
    const node = match[1]==='audio'?new AudioElement():new Element(match[1]);
    for (const attribute of match[2].matchAll(/([a-z][a-z0-9-]*)="([^"]*)"/gi)) node.setAttribute(attribute[1], attribute[2]);
    if (node.id) elements.set(node.id, node);
    if (node.attributes.has('width')) node.width = Number(node.attributes.get('width'));
    if (node.attributes.has('height')) node.height = Number(node.attributes.get('height'));
    if (/(?:^|\s)hidden(?:\s|$)/.test(match[2])) node.hidden = true;
    allElements.push(node);
  }
  const document = new Element('document');
  document.hidden = false;
  document.getElementById = id => {
    assert.ok(elements.has(id), `Unknown DOM id: ${id}`);
    return elements.get(id);
  };
  document.createElement = tag => new Element(tag);
  document.querySelectorAll = selector => {
    assert.equal(selector, '[data-sprite]');
    return allElements.filter(node => node.dataset.sprite !== undefined);
  };
  const windowEvents = new Element('window');
  const frames = [];
  const visualFrames = [];
  const playedSounds = [];
  let renderer = null;
  let now = 1000;
  class Image {
    set src(value) {
      this._src = value;
      [this.width, this.height] = value.includes('rooms') ? [1536, 1024] : [1374, 1145];
      queueMicrotask(() => this.onload());
    }
    get src() { return this._src; }
  }
  const sandbox = {
    document, DungeonContent, Image,
    DungeonSfx: { create() {
      let unlocked = false;
      return {
        unlock() { unlocked = true; },
        play(cue) { if (unlocked) playedSounds.push(cue); },
        stop() {}
      };
    } },
    DungeonEngine: { ...DungeonEngine, Run: class extends DungeonEngine.Run {
      constructor(options) { super({ seed, ...options }); }
    } },
    performance: { now: () => now },
    matchMedia: () => ({ matches: reducedMotion }),
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    requestAnimationFrame: callback => frames.push(callback),
    addEventListener: (name, callback) => windowEvents.addEventListener(name, callback)
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(artSource, context, { filename: 'dungeon-art.js' });
  const productionArt = sandbox.DungeonArt;
  sandbox.DungeonArt = { ...productionArt, create(...args) {
    const art = productionArt.create(...args);
    renderer = art;
    return { ...art, room(context, scene, visual, time) {
      visualFrames.push({ sceneId: scene.id, scene, time, visual: JSON.parse(JSON.stringify(visual)) });
      return art.room(context, scene, visual, time);
    } };
  } };
  vm.runInContext(source, context, { filename: 'dungeon-app.js' });
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
  assert.equal(sandbox.DungeonAdventure.ready, true, 'All atlases should unlock the app');
  const harness = {
    storage, sandbox, elements, document, visualFrames, playedSounds,
    get art() { return renderer; },
    get visual() { return visualFrames.at(-1)?.visual; },
    get run() { return sandbox.DungeonAdventure.run; },
    element(id) { return elements.get(id); },
    click(id) { elements.get(id).dispatch('click'); },
    choose(option) {
      const id = typeof option === 'string' ? option : option.id;
      const button = elements.get('routes').children.find(candidate => candidate.dataset.id === id);
      assert.ok(button, `No rendered route for ${id}`);
      button.dispatch('click');
    },
    frame(seconds) {
      now += seconds * 1000;
      assert.equal(frames.length, 1, 'The application should maintain one animation loop');
      frames.shift()(now);
    },
    jump(seconds) { now += seconds * 1000; },
    visibility(hidden) {
      document.hidden = hidden;
      document.dispatch('visibilitychange');
    },
    pagehide() { windowEvents.dispatch('pagehide'); },
    pageshow() { windowEvents.dispatch('pageshow'); }
  };
  if (enter && harness.run.phase === 'entrance') enterFromGate(harness);
  return harness;
}

function enterFromGate(h) {
  h.click('entrance-gate');
  h.frame(0.6);
  assert.equal(h.run.phase, 'playing');
  assert.equal(h.run.elapsed, 0);
  assert.equal(h.run.completed, 0);
  assert.equal(h.run.nextBossIn, 180);
}

function correct(harness, preferChest = false) {
  return (preferChest && harness.run.scene.options.find(option => option.correct && option.reward === 'chest')) ||
    harness.run.scene.options.find(option => option.correct && option.route !== 'risk' && option.route !== 'vault') ||
    harness.run.scene.options.find(option => option.correct);
}

function settle(harness) {
  for (let frame = 0; harness.run.phase === 'resolving' && frame < 100; frame += 1) harness.frame(0.05);
  assert.equal(harness.run.phase, 'playing', 'A completed action must return control within five seconds');
}

function seekRoom(h, type) {
  for (let index = 0; index < 180; index += 1) {
    const s=h.run.scene;
    if(s.encounterType===type&&s.questStep!==1&&(type!=='item'||s.targetType==='item'))return h.run.index;
    clear(h);
  }
  assert.fail('Did not reach the action stage of ' + type);
}

function clear(harness, count = 1) {
  for (let i = 0; i < count; i += 1) {
    harness.choose(correct(harness));
    assert.equal(harness.run.phase, 'resolving');
    settle(harness);
  }
}

function expectedChestReward(run) {
  return Math.min(5, 1 + Math.floor(run.completed / 10));
}

function finishEntrance(harness) {
  assert.ok(harness.run.boss);
  harness.frame(Math.max(0, harness.run.boss.entranceEndsAt - harness.run.elapsed) + 0.001);
}

function enterBoss(harness, due = harness.run.nextBossAt) {
  harness.frame(Math.max(0, due - harness.run.elapsed));
  assert.equal(harness.run.boss, null, 'A due boss must wait for the current normal scene');
  if(harness.run.scene.questStep===1)clear(harness);
  clear(harness);
  assert.ok(harness.run.boss, 'A due boss must arrive after this task and its door-exit movement');
  finishEntrance(harness);
}

function assertNoVisibleRunCap(harness) {
  const forbidden = /08:00|(?:八|8)\s*分鐘(?:後)?(?:結束|上限)|eight[ -]+minutes? (?:limit|cap)/i;
  assert.equal(forbidden.test(html.replace(/<[^>]*>/g, ' ')), false, 'HTML must not advertise a timed ending');
  for (const [id, element] of harness.elements) {
    const copy = [element.textContent, element.title || '', ...element.attributes.values()].join(' ');
    assert.equal(forbidden.test(copy), false, `${id} must not advertise a timed ending`);
  }
}

function sampleFrames(harness, seconds, step = 0.01) {
  const count = Math.ceil(seconds / step);
  for (let i = 0; i < count; i += 1) harness.frame(seconds / count);
}

function shownCount(harness, id) {
  return harness.element(id).classEvents.filter(event => event.action === 'add' && event.names.includes('show')).length;
}

function storedShot(harness) {
  const entry = [...harness.storage].find(([key]) => key.endsWith(':shot'));
  assert.ok(entry, 'A launched shot must be saved independently of the current animation');
  return JSON.parse(entry[1]);
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function assertSafeFrames(harness, start, sceneId, allowedExit = null) {
  const frames = harness.visualFrames.slice(start).filter(frame => frame.sceneId === sceneId);
  assert.ok(frames.length > 10, 'Collision assertions must sample actual animation frames');
  for (const { scene, visual } of frames) {
    if (visual.hidden || visual.fade === 0) continue;
    const bob = visual.moving ? 3 : 0;
    const body = { x: visual.x - DungeonArt.PLAYER.width / 2, y: visual.y - DungeonArt.PLAYER.height - bob,
      w: DungeonArt.PLAYER.width, h: DungeonArt.PLAYER.height + 2 * bob };
    for (const target of DungeonArt.layout(scene)) {
      if (target.id === visual.collectedId) continue;
      if (target.id === allowedExit && target.type === 'door' && visual.y < 400) continue;
      assert.equal(overlaps(body, target.bounds), false,
        `Hero at ${visual.x.toFixed(2)},${visual.y.toFixed(2)} overlaps ${target.id} in ${sceneId}`);
    }
    if (scene.targetType === 'arena') assert.equal(overlaps(body, { x: 390, y: 223, w: 180, h: 184 }), false,
      `Hero at ${visual.x.toFixed(2)},${visual.y.toFixed(2)} overlaps the guardian`);
  }
}

function lastCrossingDraw(harness, target) {
  return harness.element('room').getContext('2d').calls.findLast(call => call.key === 'drawImage' &&
    /\/crossings\.png(?:\?|$)/.test(call.args[0].src || '') && call.args[5] === target.x - target.w / 2 && call.args[6] === target.top);
}

function assertCrossingArt(harness, target, option, collapsed) {
  const draw = lastCrossingDraw(harness, target);
  assert.ok(draw, 'The real renderer must draw this crossing');
  const index = DungeonArt.crossingIndex(target.type, option.traits, collapsed);
  assert.equal(Math.floor(draw.args[1] / (draw.args[0].width / 4)), index % 4);
  assert.equal(Math.floor(draw.args[2] / (draw.args[0].height / 2)), Math.floor(index / 4));
}

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  process.stdout.write(`✓ ${name}\n`);
}

(async () => {
  await test('background music loops after a gameplay click, observes visibility and dialogs, and remembers its independent setting',async()=>{
    const h=await boot(new Map(),{enter:false});
    const music=h.element('dungeon-music');
    const toggle=h.element('music');
    assert.match(html,/<audio[^>]+lantern-hop\.wav[^>]+preload="none" loop hidden>/);
    assert.equal(toggle.getAttribute('aria-pressed'),'true');
    assert.equal(h.element('sound').getAttribute('aria-pressed'),'true');
    assert.equal(music.playCalls,0);
    enterFromGate(h);
    assert.equal(music.paused,false);assert.equal(music.playCalls,1);
    assert.deepEqual(h.playedSounds,['doorOpen']);
    h.choose(correct(h));settle(h);
    assert.equal(music.playCalls,1,'Room changes leave the running track alone');
    h.visibility(true);assert.equal(music.paused,true);
    h.visibility(false);assert.equal(music.paused,false);
    h.pagehide();assert.equal(music.paused,true);
    h.pageshow();assert.equal(music.paused,false);
    h.click('pause');assert.equal(music.paused,true);
    h.click('music');assert.equal(toggle.getAttribute('aria-pressed'),'false');
    assert.equal(h.storage.get('dungeon-v1:traveller-1:music'),'false');
    assert.equal(h.storage.has('dungeon-v1:traveller-1:sound'),false);
    h.click('resume');assert.equal(music.paused,true);
    const restored=await boot(h.storage);
    const restoredMusic=restored.element('dungeon-music');
    assert.equal(restored.element('music').getAttribute('aria-pressed'),'false');
    restored.click('pause');restored.click('music');
    assert.equal(restoredMusic.paused,true);
    restored.click('resume');assert.equal(restoredMusic.paused,false);
    restored.click('pause');restored.click('finish');
    assert.equal(restoredMusic.paused,true);
    restored.click('restart');assert.equal(restoredMusic.paused,true);
    enterFromGate(restored);assert.equal(restoredMusic.paused,false);
  });

  await test('sound effects can be muted separately and stay muted on a saved profile',async()=>{
    const h=await boot();
    h.click('pause');h.click('sound');h.click('resume');
    assert.equal(h.element('dungeon-music').paused,false);
    assert.equal(h.element('sound').getAttribute('aria-pressed'),'false');
    const restored=await boot(h.storage);
    clear(restored);
    assert.equal(restored.element('dungeon-music').paused,false);
    assert.deepEqual(restored.playedSounds,[]);
    restored.click('pause');restored.click('sound');restored.click('resume');
    clear(restored);
    assert.equal(restored.playedSounds.filter(cue=>cue==='doorOpen').length,1);
  });

  await test('a saved run waits for interaction and late or rejected playback respects the latest game state',async()=>{
    const playing=await boot();
    const h=await boot(playing.storage);
    const music=h.element('dungeon-music');
    assert.equal(h.run.phase,'playing');assert.equal(music.playCalls,0);
    music.rejectNext=true;
    h.choose(correct(h));settle(h);
    await Promise.resolve();
    assert.equal(music.playCalls,1);assert.equal(music.paused,true);
    let resolveMusic;
    music.pendingPlay=new Promise(resolve=>{resolveMusic=resolve;});
    h.choose(correct(h));assert.equal(music.playCalls,2);
    h.click('pause');assert.equal(music.paused,true);
    music.paused=false;
    resolveMusic();await Promise.resolve();
    assert.equal(music.paused,true);
    h.click('resume');assert.equal(music.paused,false);
  });

  await test('the soundtrack changes at arena entry and escape, preserving the exploration track on the same audio element',async()=>{
    const h=await boot(),music=h.element('dungeon-music'),lantern=music.src,boss=music.getAttribute('data-boss-track');
    assert.match(boss,/\/guardian-chase\.wav\?/);
    music.currentTime=12.5;
    h.frame(h.run.nextBossIn);
    assert.equal(h.run.nextBossIn,0);
    assert.equal(music.src,lantern,'The old room still plays its music after the timer runs out');
    h.choose(correct(h));h.frame(.1);
    assert.equal(music.src,lantern,'The old room still plays its music during its exit');
    settle(h);
    assert.ok(h.run.boss);
    assert.deepEqual(music.tracks,[lantern,boss]);
    assert.equal(music.currentTime,0);
    finishEntrance(h);
    h.click('pause');assert.equal(music.paused,true);
    h.click('resume');assert.equal(music.src,boss);assert.equal(music.paused,false);
    const restored=await boot(h.storage),restoredMusic=restored.element('dungeon-music');
    assert.ok(restored.run.boss);
    assert.equal(restoredMusic.src,boss);assert.equal(restoredMusic.playCalls,0);
    restored.click('pause');restored.click('resume');
    assert.deepEqual(restoredMusic.tracks,[boss],'A restored arena starts its own music on the next gesture');
    const playCalls=music.playCalls;
    clear(h,2);
    assert.equal(music.playCalls,playCalls,'Intermediate arena rounds keep the music running');
    music.currentTime=6;
    h.choose(correct(h));h.frame(.1);assert.equal(music.src,boss);
    settle(h);
    assert.equal(h.run.boss,null);
    assert.equal(music.src,lantern);assert.equal(music.paused,false);assert.equal(music.currentTime,12.5);
    enterBoss(h);
    assert.equal(music.src,boss);assert.equal(music.currentTime,0);
    h.click('pause');h.click('finish');assert.equal(music.paused,true);
    h.click('restart');assert.equal(music.src,lantern);assert.equal(music.paused,true);
  });

  await test('the simplified interface retains the last active traveller’s learning and audio settings', async () => {
    const active = new DungeonEngine.Run({seed:openingSeed, initialBand:3});
    const prefix = 'dungeon-v1:traveller-2:';
    const storage = new Map([
      ['dungeon-active-reader-v1', JSON.stringify('traveller-2')],
      [prefix+'run', JSON.stringify(active.serialize())],
      [prefix+'music', 'false'],
      [prefix+'sound', 'false']
    ]);
    const h=await boot(storage,{enter:false});
    for(const removed of ['reader-open','pause-reader','reader-dialog']){
      assert.equal(h.elements.has(removed),false);
    }
    assert.doesNotMatch(html,/class="pause-rule"/);
    assert.equal(h.run.learning.initialBand,3);
    assert.equal(h.element('music').getAttribute('aria-pressed'),'false');
    assert.equal(h.element('sound').getAttribute('aria-pressed'),'false');
    enterFromGate(h);
    for(let i=0;i<14&&!h.run.scene.lesson;i++)clear(h);
    const term=h.run.scene.lesson.target;
    clear(h);
    const room=h.run.scene.id,elapsed=h.run.elapsed;
    const evidence=h.run.learning.export();
    assert.equal(evidence.targets[term].successes,1);
    h.click('pause');
    h.frame(12);
    assert.equal(h.run.elapsed,elapsed);
    const resumed=await boot(h.storage);
    assert.deepEqual(resumed.run.learning.export(),evidence);
    assert.equal(resumed.run.scene.id,room);
    assert.equal(resumed.run.elapsed,elapsed);
    assert.equal(resumed.element('music').getAttribute('aria-pressed'),'false');
    assert.equal(resumed.element('sound').getAttribute('aria-pressed'),'false');
    assert.equal(resumed.storage.has('dungeon-v1:traveller-1:run'),false);
  });

  await test('missing only a supporting detail gives a specific hint and no failed word score, including after reload', async () => {
    const entrance = new DungeonEngine.Run({seed:openingSeed, initialBand:3});
    const h=await boot(savedRoom(entrance.serialize()),{enter:false});
    enterFromGate(h);
    for(let i=0;i<12&&!h.run.scene.options.some(o=>o.targetEvidence==='neutral'&&h.run.scene.lesson&&o.matches);i++)clear(h);
    const scene=h.run.scene,option=scene.options.find(o=>o.targetEvidence==='neutral'&&o.matches);
    assert.ok(scene.lesson&&option);
    const word=scene.lesson.target,detail=scene.lesson.conditions[option.matches.indexOf(false)];
    const before=h.run.learning.export().targets[word];
    h.choose(option);settle(h);
    assert.deepEqual(h.run.learning.export().targets[word],before);
    assert.ok(detail&&h.element('hint').textContent.includes(detail));
    const resumed=await boot(h.storage);
    assert.equal(resumed.element('hint').textContent,h.element('hint').textContent);
  });

  await test('the sluice and signal drum animate on contact, retry safely, and pay no coins', async () => {
    const samples=snapshotsFor(['sluice','signal'],s=>!!s.lesson);
    for(const [type,snapshot] of samples){
      const h=await boot(savedRoom(snapshot));
      assert.equal(h.run.scene.targetType,type);
      const id=h.run.scene.id,term=h.run.scene.lesson.target;
      const before=h.run.learning.export(),hp=h.run.hp,coins=h.run.coins;
      const wrong=h.run.scene.options.find(o=>o.targetEvidence==='miss');
      assert.ok(wrong);
      h.choose(wrong);h.frame(.20);
      assert.equal(h.visual.operation,null,'The mechanism waits for contact');
      h.frame(.32);
      assert.equal(h.visual.operation.id,wrong.id);
      assert.equal(h.visual.operation.correct,false);
      assert.ok(h.visual.operation.progress>0&&h.visual.operation.progress<1);
      settle(h);
      assert.equal(h.run.hp,hp);assert.equal(h.run.coins,coins);
      assert.equal(h.run.scene.id,id);assert.equal(h.element('hint').hidden,false);
      const learned=h.run.learning.export();
      assert.equal(learned.targets[term].attempts,(before.targets[term]?.attempts||0)+1);
      const right=correct(h);
      h.choose(right);h.frame(.64);
      assert.equal(h.visual.operation.id,right.id);assert.equal(h.visual.operation.correct,true);
      const progress=h.visual.operation.progress;
      h.click('pause');h.frame(8);assert.equal(h.visual.operation.progress,progress);h.click('resume');
      h.frame(.27);assert.ok(h.visual.operation.progress>progress);
      settle(h);
      assert.notEqual(h.run.scene.id,id);
      assert.equal(h.visual.operation,null);
      assert.equal(h.run.coins,coins);
      assert.deepEqual(h.run.learning.export(),learned,'A corrected retry cannot produce another learning sample');
    }
  });

  await test('station buttons and cart dispatches animate the selected machine and unlock the door only after a correct action', async () => {
    const samples=snapshotsFor(['console','dispatch']);
    for(const [type,snapshot] of samples){
      const h=await boot(savedRoom(snapshot)),s=h.run.scene;
      const {completed,hp,coins,bossDelaySeconds}=h.run;
      const right=correct(h),wrong=s.options.find(o=>!o.correct);
      assert.equal(s.collectItem,undefined);
      h.frame(0);
      assert.equal(h.visual.exitProgress,0);
      assert.equal(h.element('routes').getAttribute('aria-label'),type==='console'?'按下機器上的按鈕':'選擇要派出的礦車');
      for(const choice of [wrong,right]){
        h.choose(choice);h.frame(.25);
        assert.equal(h.visual.exitProgress,0);assert.equal(h.visual.operation,null);
        h.frame(.25);
        assert.equal(h.visual.operation.id,choice.id);assert.equal(h.visual.operation.correct,choice.correct);
        assert.equal(h.visual.exitProgress,0);assert.equal(h.visual.collectedId,null);
        assert.equal(h.run.hp,hp);assert.equal(h.run.coins,coins);
        if(choice.correct){
          assert.match(h.element('announcement').textContent,type==='console'?/按鈕亮起/:/沿路軌開出/);
          sampleFrames(h,1.7);
          assert.ok(h.visualFrames.some(f=>f.sceneId===s.id&&f.visual.operation?.id===right.id&&f.visual.exitProgress===1));
          assert.equal(h.run.completed,completed+1);assert.equal(h.run.bossDelaySeconds,bossDelaySeconds+3);
        }else{
          assert.match(h.element('announcement').textContent,/門仍然關着/);
          settle(h);
          assert.ok(h.visualFrames.every(f=>!f.visual.exitProgress&&!f.visual.collectedId));
          assert.equal(h.run.scene.id,s.id);assert.equal(h.run.completed,completed);assert.equal(h.run.bossDelaySeconds,bossDelaySeconds);
        }
      }
    }
  });

  await test('the three blocked-path rooms require the correct nearby control before the exit opens', async () => {
    const samples=snapshotsFor(['feeding','floodgate','cart'],s=>!s.chain&&s.obstacle&&s.options.length>=3&&
      (s.targetType!=='feeding'||s.options.some(o=>o.correct&&o.position==='middle')));
    function feedingFrame(h,seconds){
      const {calls}=h.element('room').getContext('2d');
      const offset=calls.length;
      h.frame(seconds);
      const sprites=calls.slice(offset).filter(c=>c.key==='drawImage'&&c.args[0]._src?.includes('/obstacle-props.png')).map(({args})=>{
        const [atlas,column,row,,,left,top,width,height]=args;
        const cell=Math.round(column*4/atlas.width)+4*Math.round(row*4/atlas.height);
        return {cell,x:Math.round(left+width/2),y:Math.round(top+height)};
      });
      return {beast:sprites.find(s=>s.cell<3),bowls:sprites.filter(s=>s.cell===5||s.cell===6)};
    }
    for(const [type,snapshot] of samples){
      const h=await boot(new Map([['dungeon-v1:traveller-1:run',JSON.stringify(snapshot)]]));
      const s=h.run.scene,{completed,hp,coins,bossDelaySeconds}=h.run;
      const targets=h.element('routes').children;
      h.frame(0);assert.equal(h.visual.exitProgress,0);
      const feeding=type==='feeding',guarding=feeding&&feedingFrame(h,0);
      assert.equal(targets.length,s.options.length,'Only the close controls are clickable');
      for(const p of DungeonArt.layout(s)){
        const button=targets.find(node=>node.dataset.id===p.id);
        assert.match(button.className,/nearby-control/);
        assert.equal(parseFloat(button.style.left),p.x/960*100);
        assert.equal(parseFloat(button.style.top),(p.top+p.h/2)/640*100);
      }
      const wrong=s.options.filter(o=>!o.correct);
      assert.equal(new Set(wrong.map(o=>o.response)).size,2);
      for(const option of wrong){
        h.choose(option);h.choose(option);h.frame(.20);
        assert.equal(h.visual.operation,null);
        if(feeding)assert.deepEqual(feedingFrame(h,.57),guarding,'The monster and bowls stay in place on a rejected offer');
        else h.frame(.57);
        assert.equal(h.visual.operation.id,option.id);
        assert.equal(h.visual.operation.correct,false);
        assert.equal(h.visual.exitProgress,0);
        const label=h.element('announcement').textContent;
        assert.ok(label.includes(({bell:'鈴鐺',sniff:'嗅',surge:'水湧',trickle:'少量水',clank:'拉桿',brake:'停在'})[option.response]));
        settle(h);
        assert.equal(h.run.scene.id,s.id);assert.equal(h.run.hp,hp);assert.equal(h.run.coins,coins);
        assert.equal(h.run.completed,completed);assert.equal(h.run.bossDelaySeconds,bossDelaySeconds);
        assert.equal(h.visual.x,480);assert.equal(h.visual.y,600);
      }
      if(type==='floodgate')h.frame(h.run.nextBossIn+.01);
      assert.equal(h.playedSounds.some(cue=>cue==='monsterEat'||cue==='doorOpen'),false,'Rejected controls never feed the monster or open the gate');
      const answer=correct(h),stop=DungeonArt.navigation(s,answer.id).stop;
      h.choose(answer);h.frame(.78);
      assert.equal(h.visual.x,stop.x);assert.equal(h.visual.y,stop.y);
      const started=h.visual.operation.progress;
      h.click('pause');h.frame(6);assert.equal(h.visual.operation.progress,started);h.click('resume');
      if(feeding){
        assert.equal(h.visual.exitProgress,0,'The door waits for the monster to reach its bowl');
        const trace=h.visualFrames.length;
        sampleFrames(h,.90,.03);
        const eating=feedingFrame(h,0);
        const bowl=DungeonArt.layout(s).find(p=>p.id===answer.id);
        assert.deepEqual(eating.bowls,guarding.bowls,'The selected bowl stays on the floor as the monster comes to it');
        assert.notDeepEqual(eating.beast,guarding.beast,'The monster leaves the door for the selected bowl');
        assert.ok(Math.hypot(eating.beast.x-bowl.x,eating.beast.y-bowl.y)<105);
        const departing=h.visualFrames.slice(trace).filter(({visual})=>visual.moving);
        assert.ok(departing.length);
        for(const {visual} of departing){
          assert.equal(visual.exitProgress,1,'The player only advances once the path is clear');
          if(visual.y>=bowl.top){
            assert.ok(Math.abs(visual.x-bowl.x)>bowl.w/2,'The player heads to the door beside the feeding area');
          }
        }
        assert.deepEqual(feedingFrame(h,.08).beast,eating.beast,'The monster stays by the bowl while the player leaves');
        assert.deepEqual(h.playedSounds.filter(cue=>cue==='monsterEat'||cue==='doorOpen'),['monsterEat','doorOpen']);
      }else h.frame(.90);
      assert.equal(h.run.scene.id,s.id,'The visible opening precedes the room change');
      assert.equal(h.visual.operation.progress,1);assert.equal(h.visual.exitProgress,1);assert.equal(h.run.completed,completed);
      const restored=await boot(h.storage);
      assert.equal(restored.run.completed,completed+1,'Reloading during the operation settles it exactly once');
      settle(h);
      assert.equal(h.run.completed,completed+1);assert.equal(h.run.hp,hp);assert.equal(h.run.coins,coins);
      assert.equal(h.run.bossDelaySeconds,bossDelaySeconds+3);
      assert.equal(h.run.scene.id,restored.run.scene.id);
      if(type==='floodgate')assert.ok(h.run.boss,'The pending boss waits until the stone path is crossed');
      const reduced=await boot(new Map([['dungeon-v1:traveller-1:run',JSON.stringify(snapshot)]]),{reducedMotion:true});
      reduced.choose(correct(reduced));reduced.frame(.28);
      assert.ok(reduced.visual.reduced&&reduced.visual.operation.correct);
      assert.equal(reduced.run.scene.id,s.id,'The open state remains visible with reduced motion');
      reduced.frame(.3);
      assert.equal(reduced.run.completed,completed+1);
    }
  });

  await test('asking the miner reveals the lever clue in place, preserves it on a retry, and only a cleared crossing admits a due guardian',async()=>{
    const seedRoom=snapshotsFor(['person'],s=>s.questStep===1&&s.encounterType==='cart').get('person');
    const h=await boot(savedRoom(seedRoom)),first=h.run.scene,entry=h.run.completed;
    const source=correct(h),initialPrompt=h.element('prompt').textContent;
    const sourceButtons=h.element('routes').children.slice();
    const activeIds=()=>h.element('routes').children.map(button=>button.dataset.id);
    assert.deepEqual(activeIds(),first.chain.sourceOptions.map(o=>o.id));
    assert.match(h.element('quest-step').textContent,/1 \/ 2/);
    assert.equal(h.run.choose(first.chain.actionOptions[0].id),null);
    h.frame(h.run.nextBossIn+.05);
    const wrongSource=first.options.find(o=>!o.correct),hp=h.run.hp;
    h.choose(wrongSource);settle(h);
    assert.equal(h.run.hp,hp-1);assert.equal(h.element('prompt').textContent,initialPrompt);
    h.choose(source);h.frame(.42);
    assert.equal(h.visual.interaction.id,source.id);
    assert.equal(h.visual.exitProgress,0);assert.equal(h.visual.fade,1);
    const duringTalk=await boot(h.storage);
    assert.equal(duringTalk.run.scene.questStep,2);
    settle(h);
    const second=h.run.scene,anchor=DungeonArt.questAnchor(second);
    assert.equal(second.id,first.id);
    assert.equal(h.run.completed,entry);assert.equal(h.run.boss,null);
    assert.deepEqual({x:h.visual.x,y:h.visual.y},anchor);
    assert.equal(h.visual.exitProgress,0);assert.equal(h.visual.fade,1);
    assert.equal(h.element('chamber').classList.contains('leaving'),false);
    assert.equal(shownCount(h,'timer-gain'),0);
    assert.deepEqual(activeIds(),second.chain.actionOptions.map(o=>o.id));
    assert.notEqual(h.element('prompt').textContent,initialPrompt);
    assert.equal(h.element('prompt').textContent,duringTalk.element('prompt').textContent);
    assert.match(h.element('quest-step').textContent,/2 \/ 2/);
    sourceButtons[0].dispatch('click');assert.equal(h.run.phase,'playing');
    const wrongLever=second.options.find(o=>!o.correct);
    h.choose(wrongLever);settle(h);
    assert.equal(h.run.scene.questStep,2);assert.equal(h.visual.exitProgress,0);
    assert.equal(h.element('prompt').textContent,second.prompt);
    assert.deepEqual({x:h.visual.x,y:h.visual.y},anchor);
    assert.equal(h.run.completed,entry);assert.equal(h.run.boss,null);
    h.pagehide();const resumed=await boot(h.storage);resumed.frame(0);
    assert.deepEqual({x:resumed.visual.x,y:resumed.visual.y},anchor);
    h.choose(correct(h));h.frame(.78);
    assert.ok(h.visual.operation.correct);assert.equal(h.visual.exitProgress,0);
    settle(h);
    assert.equal(h.run.completed,entry+1);
    assert.ok(h.run.boss);assert.equal(shownCount(h,'timer-gain'),1);
  });

  await test('retrieving a record reveals its directions and activates only the matching in-room controls',async()=>{
    const snap=snapshotsFor(['item'],s=>s.questStep===1&&s.chain.sourceType==='item'&&s.encounterType==='feeding').get('item');
    const h=await boot(savedRoom(snap),{reducedMotion:true}),id=h.run.scene.id;
    const record=h.run.scene.chain.sourceName;
    const source=h.element('routes').children.find(button=>button.dataset.id===correct(h).id);
    source.dispatch('click',{detail:0});settle(h);
    assert.equal(h.run.scene.id,id);assert.equal(h.run.scene.targetType,'feeding');
    assert.ok(h.element('prompt').textContent.includes(record));
    assert.equal(h.visual.collectedId,null);assert.equal(h.visual.exitProgress,0);
    assert.ok(h.element('routes').children[0].focused);
    assert.ok(h.element('routes').children.every(button=>button.className.includes('nearby-control')));
    h.choose(correct(h));settle(h);
    assert.notEqual(h.run.scene.id,id);assert.equal(shownCount(h,'timer-gain'),1);
  });

  await test('returning a ledger, passing a message and meeting regional contacts each resolve at the selected person', async () => {
    const found=new Map(),actions=['return','deliver','guide','password','witness'];
    for(let i=0;i<250&&found.size<actions.length;i++){
      const run=new DungeonEngine.Run({seed:'regional-'+i});
      run.enterDungeon();
      for(let j=0;j<45;j++){
        const scene=run.scene;
        if(scene.taskAction&&!found.has(scene.taskAction))found.set(scene.taskAction,run.serialize());
        const option=scene.options.find(o=>o.correct&&o.route!=='vault')||scene.options.find(o=>o.correct);
        run.choose(option.id);run.finishTransition();
      }
    }
    for(const action of actions){
      assert.ok(found.has(action),action);
      const h=await boot(savedRoom(found.get(action))),right=correct(h);
      h.choose(right);h.frame(.51);
      assert.equal(h.visual.interaction.id,right.id);assert.equal(h.visual.exitProgress,0);
      assert.ok(h.visual.interaction.progress>0&&h.visual.interaction.progress<1);
      h.frame(.34);assert.equal(h.visual.interaction.progress,1);assert.ok(h.visual.exitProgress>0);
      settle(h);assert.equal(h.visual.interaction,null);
    }
  });

  await test('the entrance is saved and ungated by time, then its arch starts a run without awarding anything', async () => {
    const h = await boot(new Map([['mist-reading-coins-v1', '18']]), { enter: false });
    assert.equal(h.run.phase, 'entrance');
    assert.equal(h.element('routes').children.length, 0);
    const gate = h.element('entrance-gate');
    assert.equal(gate.hidden, false);
    assert.equal(gate.tagName, 'BUTTON');
    assert.equal(gate.getAttribute('aria-label'), '進入地牢');
    assert.match(html, /<button[^>]+id="entrance-gate"[^>]*><\/button>/, 'Only the illustrated gate is visible');
    for (const removed of ['floor', 'clock-label', 'penalty', 'penalty-icon', 'penalty-detail']) {
      assert.equal(h.elements.has(removed), false, removed + ' is removed from the interface');
    }
    assert.equal(h.element('clock').getAttribute('role'), 'timer');
    assert.equal(h.element('clock').hidden, true);
    h.frame(600); h.pagehide();
    assert.equal(h.run.elapsed, 0);
    const ready = await boot(h.storage, { enter: false });
    assert.equal(ready.run.phase, 'entrance');
    enterFromGate(ready);
    assert.equal(ready.run.coins, 0);
    assert.equal(ready.element('coins').textContent, '0');
    assert.equal(ready.element('entrance-gate').hidden, true);
    assert.equal(ready.element('clock').hidden, false);
    assert.equal(shownCount(ready, 'timer-gain'), 0);
    assert.equal(shownCount(ready, 'coin-gain'), 0);
    assert.ok(ready.element('routes').children.length > 1);
    ready.frame(2); ready.pagehide();
    const restored = await boot(ready.storage, { enter: false });
    assert.equal(restored.run.phase, 'playing');
    assert.equal(restored.run.scene.id, ready.run.scene.id);
    assert.equal(restored.run.nextBossIn, 178);
  });

  await test('exit doors stay shut on approach and error, then open during the successful action before departure',async()=>{
    const samples=snapshotsFor(['door','person','item','bridge','ladder','sluice','signal'],s=>s.questStep!==1&&!s.ending&&s.kind!=='choice');
    for(const [type,snapshot] of samples){
      const h=await boot(savedRoom(snapshot)),id=h.run.scene.id;
      h.frame(0);assert.equal(h.visual.exitProgress,0,type);
      h.choose(correct(h));sampleFrames(h,.2);
      assert.equal(h.visual.exitProgress,0,type+' must wait for the action');
      sampleFrames(h,2.2);
      const frames=h.visualFrames.filter(f=>f.sceneId===id).map(f=>f.visual);
      assert.ok(frames.some(v=>v.exitProgress>0&&v.exitProgress<1),type+' visibly opens');
      assert.ok(frames.some(v=>v.exitProgress===1),type+' reaches an open exit');
      const wrong=await boot(savedRoom(snapshot)),option=wrong.run.scene.options.find(o=>!o.correct);
      wrong.choose(option);sampleFrames(wrong,2.5);
      assert.ok(wrong.visualFrames.every(f=>!f.visual.exitProgress),type+' failure never opens the exit');
    }
    const arena=await boot();enterBoss(arena);
    for(let step=1;step<=3;step++){
      const start=arena.visualFrames.length,answer=correct(arena);
      arena.choose(answer);sampleFrames(arena,1.3);
      const frames=arena.visualFrames.slice(start).filter(f=>f.scene.currentStep===step);
      assert.equal(frames.some(f=>f.visual.exitProgress>0),step===3);
      if(step===3)assert.ok(frames.some(f=>f.visual.exitId===answer.id&&f.visual.exitProgress===1));
    }
  });

  await test('the draw gives each task a correct action and a wrong checkpoint or gate never changes area', async () => {
    const orders=new Set();
    for(let i=0;i<5;i++){
      const h=await boot(new Map(),{seed:'deck-ui-'+i});
      const firstArea=h.run.area,order=[];
      while(!h.run.scene.checkpoint&&order.length<24){
        const s=h.run.scene;order.push(s.encounterType);
        assert.equal(s.options.filter(o=>o.correct).length,1);
        assert.ok(s.options.every(o=>o.route!=='vault'));
        clear(h);
      }
      assert.ok(h.run.scene.checkpoint);
      let s=h.run.scene;
      // Correct journeys arrive with full health, so one normal checkpoint mistake is survivable.
      const wrong=s.options.find(o=>!o.correct);
      h.choose(wrong);settle(h);assert.equal(h.run.scene.id,s.id);
      assert.equal(h.element('reading-mark').textContent,'◇');
      clear(h);s=h.run.scene;
      assert.equal(s.encounterType,'gate');assert.equal(s.questStep,1);
      assert.ok(h.element('reading-mark').classList.contains('earned'));
      clear(h);s=h.run.scene;assert.ok(s.areaGate);
      assert.equal(h.element('reading-mark').textContent,'◆');
      assert.equal(s.options.filter(o=>o.correct).length,1);
      h.frame(0);assert.equal(h.visual.exitProgress,0);
      const before=h.run.hp,miss=s.options.find(o=>!o.correct);
      h.choose(miss);h.frame(.5);
      assert.equal(h.visual.exitProgress,0);settle(h);
      assert.equal(h.run.hp,before);assert.equal(h.run.scene.id,s.id);assert.equal(h.run.area,firstArea);
      const right=correct(h);h.choose(right);h.frame(.46);
      assert.ok(h.visual.exitProgress>0&&h.visual.exitProgress<1);
      assert.equal(h.visual.exitId,right.id);settle(h);
      assert.equal(h.run.area,right.nextArea);assert.notEqual(h.run.area,firstArea);
      assert.equal(h.visual.exitProgress,0);
      orders.add(order.join('/'));
    }
    assert.ok(orders.size>1);
  });

  await test('atlas load enables accessible targets and a simple action advances automatically', async () => {
    const h = await boot();
    assert.equal(h.element('loading').hidden, true);
    assert.equal(h.element('routes').children.length, h.run.scene.options.length);
    for (const button of h.element('routes').children) {
      assert.equal(button.disabled, false);
      assert.equal(button.getAttribute('aria-label'),h.run.scene.options.find(o=>o.id===button.dataset.id).label);
    }
    const initialScene = h.run.scene.id;
    const option = correct(h);
    h.choose(option);
    assert.equal(h.run.phase, 'resolving');
    assert.equal(h.run.attempts, 1);
    assert.ok(h.element('routes').children.every(button => button.disabled));
    h.choose(option);
    assert.equal(h.run.attempts, 1);
    assert.equal(h.run.records.length, 1);
    settle(h);
    assert.equal(h.run.index, 1);
    assert.equal(h.run.phase, 'playing');
    assert.notEqual(h.run.scene.id, initialScene);
    assert.equal(h.element('pause-dialog').open, false);
    assert.equal(h.element('end-dialog').open, false);
    assert.ok(h.run.scene.cardId);
    assert.ok(h.element('routes').children.every(button => h.run.scene.options.some(option => option.label === button.getAttribute('aria-label'))));
    assert.ok(h.element('room').getContext('2d').calls.some(call => call.key === 'drawImage'));
  });

  await test('a wrong choice damages once, returns to the same mixed-target puzzle, and retains its hint', async () => {
    const h = await boot();
    const index = seekRoom(h, 'person');
    const room = h.run.scene.id;
    const wrong = h.run.scene.options.find(option => !option.correct);
    assert.ok(wrong);
    h.choose(wrong);
    assert.equal(h.run.hp, 2);
    h.choose(wrong);
    h.frame(1.3);
    assert.equal(h.run.hp, 2);
    assert.equal(h.run.phase, 'playing');
    assert.equal(h.run.scene.id, room);
    assert.equal(h.run.index, index);
    assert.equal(h.element('hint').hidden, false);
    assert.equal(h.element('hint').textContent, h.run.scene.hint);
    h.frame(5);
    assert.equal(h.run.hp, 2);
    assert.equal(h.run.records.filter(record => record.sceneId === room).length, 1);
  });

  await test('a wrong door is harmless, but even the first wrong person strikes once', async () => {
    const h = await boot();
    const attempted = [];
    for (let i = 0; i < 2; i += 1) {
      seekRoom(h,i===0?'door':'person');
      attempted.push(h.run.scene.id);
      const wrong = h.run.scene.options.find(option => !option.correct);
      h.choose(wrong);
      h.frame(1.3);
      assert.equal(h.run.hp, i===0?3:2);
      assert.equal(h.element('hint').hidden, false);
      clear(h);
    }
    assert.deepEqual(h.run.records.filter(record => attempted.includes(record.sceneId)&&record.questStep!==1).map(record => record.correct), [false, false]);
  });

  await test('pause and tab hiding freeze arrival and boss-attack countdowns without catch-up', async () => {
    const h = await boot();
    h.frame(12);
    assert.equal(h.element('time').textContent, '02:48');
    h.click('pause');
    assert.equal(h.sandbox.DungeonAdventure.paused, true);
    assert.equal(h.element('pause-dialog').open, true);
    h.frame(100);
    assert.equal(h.run.elapsed, 12);
    assert.equal(h.element('time').textContent, '02:48');
    h.click('resume'); h.frame(1);
    h.visibility(true); h.frame(120); h.jump(300);
    assert.equal(h.run.elapsed, 13);
    h.visibility(false); h.frame(0.25);
    assert.equal(h.run.elapsed, 13.25);
    enterBoss(h);
    const before = { elapsed: h.run.elapsed, attack: h.run.bossProjectile.remaining, time: h.element('time').textContent };
    h.click('pause'); h.frame(1000); h.click('resume');
    assert.equal(h.run.elapsed, before.elapsed);
    assert.equal(h.run.bossProjectile.remaining, before.attack);
    assert.equal(h.element('time').textContent, before.time);
    h.visibility(true); h.frame(40); h.visibility(false); h.frame(0.25);
    assert.equal(h.run.elapsed, before.elapsed + 0.25);
    assert.ok(Math.abs(h.run.bossProjectile.remaining - (before.attack - 0.25)) < 1e-8);
    assert.equal(h.run.hp, 3);
  });

  await test('active time continues beyond 480 with no forced ending and restart still resets a voluntarily ended run', async () => {
    const h = await boot(new Map([['mist-reading-coins-v1', '27']]));
    h.frame(479.75);
    assert.equal(h.run.phase, 'playing');
    h.frame(0.25);
    assert.equal(h.run.elapsed, 480);
    assert.equal(h.run.phase, 'playing');
    assert.equal(h.run.reason, null);
    assert.equal(h.element('end-dialog').open, false);
    assert.equal(h.run.pacing.overrun, true);
    h.frame(120);
    assert.equal(h.run.elapsed, 600);
    assert.equal(h.run.hp, 3);
    assert.equal(h.element('end-dialog').open, false);
    assertNoVisibleRunCap(h);
    h.click('pause'); h.click('finish');
    assert.equal(h.run.reason, 'quit');
    assert.equal(h.element('end-dialog').open, true);
    h.click('restart');
    assert.equal(h.run.elapsed, 0);
    assert.equal(h.run.hp, 3);
    assert.equal(h.run.index, 0);
    assert.equal(h.run.phase, 'entrance');
    assert.equal(h.run.coins, 0);
    assert.equal(h.element('end-dialog').open, false);
    assert.equal(h.element('clock').hidden, true);
    enterFromGate(h);
    assert.equal(h.element('time').textContent, '03:00');
  });

  await test('a mimic and a wrong person reveal themselves only on arrival, then deliver one visible hit at contact', async () => {
    for (const hazard of ['person','mimic']) {
      const h=await boot();
      if(hazard==='person')enterBoss(h);else seekRoom(h,'chest');
      const wrong=h.run.scene.options.find(o=>!o.correct&&(hazard==='mimic'||o.targetType==='person'));
      const hitCount=()=>h.element('chamber').classEvents.filter(e=>e.action==='add'&&e.names.includes('hit')).length;
      const hitSound=hazard==='person'?'personHit':'mimicHit';
      const soundStart=h.playedSounds.length;
      h.choose(wrong);h.frame(.28);
      assert.equal(h.visual.reaction,null);
      assert.ok(!h.playedSounds.slice(soundStart).includes(hitSound));
      h.frame(.20);
      assert.equal(h.visual.reaction.type,hazard);
      assert.equal(h.visual.reaction.id,wrong.id);
      assert.ok(h.visual.reaction.progress<.48);
      assert.equal(hitCount(),0);
      assert.equal(h.element('hearts').getAttribute('aria-label'),'3 顆心');
      h.frame(.15);
      assert.equal(h.element('hearts').getAttribute('aria-label'),'2 顆心');
      assert.equal(hitCount(),1);
      assert.equal(h.visual.damage,true);
      assert.equal(h.visual.openChestId,null);
      settle(h);
      assert.equal(hitCount(),1);
      assert.deepEqual(h.playedSounds.slice(soundStart),[hitSound],'Only the matching hit sound plays at contact');
      assert.equal(h.run.coins,0);
      if(hazard==='mimic'){
        const reward=expectedChestReward(h.run);
        const chest=correct(h,true);h.choose(chest);h.frame(.58);
        assert.equal(h.visual.openChestId,chest.id);
        assert.equal(h.visual.reaction,null);
        assert.equal(h.visual.collectedId,null);
        assert.equal(shownCount(h,'coin-gain'),1);
        settle(h);assert.equal(h.run.coins,reward);
        assert.equal(hitCount(),1);
      }
    }
  });

  await test('a due boss waits for the current task and its automatic door exit before replacing the next room', async () => {
    for (const type of ['person','item','bridge','ladder']) {
      const h = await boot();
      seekRoom(h, type);
      assert.ok(['person', 'item', 'bridge', 'ladder'].includes(h.run.scene.targetType));
      const original = h.run.scene.id;
      h.frame(h.run.nextBossIn);
      assert.equal(h.run.boss, null);
      assert.equal(h.run.scene.id, original, 'Reading the current clue is never interrupted');
      assert.equal(h.element('time').textContent, '00:00');
      if(h.run.scene.targetType!=='bridge'){h.choose(h.run.scene.options.find(option => !option.correct));settle(h);}
      assert.equal(h.run.boss, null, 'A wrong attempt does not exit the current room');
      assert.equal(h.run.scene.id, original);
      const before = h.run.completed;
      h.choose(correct(h));
      assert.equal(h.run.boss, null, 'Committing the right answer does not skip its movement');
      assert.equal(h.run.phase, 'resolving');
      h.frame(0.2);
      assert.equal(h.run.boss, null, 'The hero must finish walking to the automatic exit');
      assert.equal(h.run.scene.id, original);
      settle(h);
      assert.equal(h.run.boss.encounter, 1);
      assert.equal(h.run.completed, before + 1);
      assert.equal(h.run.scene.targetType, 'arena', 'The boss replaces the immediate next ordinary scene');
      assert.equal(h.element('guardian').hidden, false);
    }
  });

  await test('an ordinary exit before the deadline earns its bonus before a long frame can queue the boss', async () => {
    const base = await boot();
    seekRoom(base,'door');
    const {nextBossAt,bossDelaySeconds,index,completed}=base.run;
    base.frame(base.run.nextBossIn-1);
    base.pagehide();
    const coarse = await boot(base.storage);
    const fine = await boot(base.storage);
    assert.equal(coarse.run.scene.targetType, 'door');
    coarse.choose(correct(coarse));
    fine.choose(correct(fine));
    coarse.frame(2);
    sampleFrames(fine, 2, 1 / 120);
    for (const h of [coarse, fine]) {
      assert.equal(h.run.boss, null, 'The door completes before 180 seconds, so its bonus must prevent a premature boss');
      assert.equal(h.run.bossDueAt, null);
      assert.equal(h.run.nextBossAt, nextBossAt+3);
      assert.equal(h.run.bossDelaySeconds, bossDelaySeconds+3);
      assert.equal(h.run.index, index+1);
      assert.equal(h.run.completed, completed+1);
      assert.equal(h.run.phase, 'playing');
      assert.ok(Math.abs(h.run.elapsed - (nextBossAt+1)) < 1e-8);
      assert.ok(Math.abs(h.run.nextBossIn - 2) < 1e-8);
    }
    assert.equal(coarse.run.scene.id, fine.run.scene.id, 'Frame size must not change which room the player reaches');
    assert.equal(coarse.run.encounters, fine.run.encounters);
  });

  await test('each ordinary scene completion visibly adds three seconds once, including a saved in-progress exit', async () => {
    const h = await boot();
    const clockText = seconds => { const n = Math.ceil(seconds); return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); };
    assert.equal(h.run.nextBossAt, 180);
    assert.equal(h.run.bossDelaySeconds, 0);
    h.choose(h.run.scene.options.find(option => !option.correct)); settle(h);
    assert.equal(h.run.nextBossAt, 180, 'Wrong attempts cannot postpone a boss');
    assert.equal(h.run.bossDelaySeconds, 0);
    h.choose(correct(h));
    assert.equal(h.run.nextBossAt, 180, 'The bonus is earned on completion, not on clicking');
    h.frame(0.2);
    assert.equal(h.run.bossDelaySeconds, 0);
    settle(h);
    assert.equal(h.run.nextBossAt, 183);
    assert.equal(h.run.bossDelaySeconds, 3);
    assert.equal(h.element('time').textContent, clockText(183 - h.run.elapsed));
    assert.notEqual(h.element('time').textContent, clockText(180 - h.run.elapsed), 'The visible countdown must include the extra three seconds');
    const reloaded = await boot(h.storage);
    assert.equal(reloaded.run.nextBossAt, 183);
    assert.equal(reloaded.run.bossDelaySeconds, 3);
    reloaded.choose(correct(reloaded));
    assert.equal(reloaded.run.bossDelaySeconds, 3);
    const settled = await boot(reloaded.storage);
    assert.equal(settled.run.phase, 'playing');
    assert.equal(settled.run.index, 2);
    assert.equal(settled.run.nextBossAt, 186);
    assert.equal(settled.run.bossDelaySeconds, 6, 'Restoring an unfinished successful exit credits its completion once');
    const again = await boot(settled.storage);
    assert.equal(again.run.nextBossAt, 186);
    assert.equal(again.run.bossDelaySeconds, 6);
    assert.equal(again.element('time').textContent, clockText(186 - again.run.elapsed));
  });

  await test('timer and chest gains appear once at completion, freeze while paused, and do not replay after reload', async () => {
    const h = await boot();
    assert.equal(h.element('timer-gain').hidden, true);
    assert.equal(h.element('coin-gain').hidden, true);
    h.choose(h.run.scene.options.find(option => !option.correct));
    settle(h);
    assert.equal(shownCount(h, 'timer-gain'), 0);
    h.choose(correct(h));
    h.frame(0.2);
    assert.equal(shownCount(h, 'timer-gain'), 0, 'Selecting a path does not award time before its exit');
    settle(h);
    assert.equal(h.element('timer-gain').hidden, false);
    assert.equal(h.element('timer-gain').textContent, '+3s');
    assert.equal(shownCount(h, 'timer-gain'), 1);
    h.click('pause');
    h.frame(30);
    assert.equal(h.element('timer-gain').hidden, false, 'Popup lifetime uses active play time');
    h.click('resume');
    h.frame(1.11);
    assert.equal(h.element('timer-gain').hidden, true);
    assert.equal(shownCount(h, 'timer-gain'), 1);
    seekRoom(h, 'chest');
    const clearsBeforeChest = shownCount(h, 'timer-gain');
    const coins = h.run.coins;
    const reward = expectedChestReward(h.run);
    h.choose(correct(h, true));
    settle(h);
    assert.equal(h.run.coins, coins + reward);
    assert.equal(h.element('coin-gain').hidden, false);
    assert.equal(h.element('coin-gain-value').textContent, '+' + reward);
    assert.ok(h.element('coin-gain-icon').getContext('2d').calls.some(call => call.key === 'drawImage'), 'The chest popup preserves its drawn coin icon');
    assert.equal(shownCount(h, 'coin-gain'), 1);
    assert.equal(shownCount(h, 'timer-gain'), clearsBeforeChest + 1);
    h.frame(0.1);
    assert.equal(shownCount(h, 'coin-gain'), 1);
    h.pagehide();
    const restored = await boot(h.storage);
    assert.equal(restored.run.coins, coins + reward);
    assert.equal(restored.element('coin-gain').hidden, true);
    assert.equal(restored.element('timer-gain').hidden, true);
    assert.equal(shownCount(restored, 'coin-gain'), 0);
    assert.equal(shownCount(restored, 'timer-gain'), 0);
  });

  await test('chest popups and the run score rise at ten-room boundaries and cap at five', async () => {
    const rewards = new Map([[9,1],[10,2],[19,2],[20,3],[29,3],[30,4],[39,4],[40,5],[50,5]]);
    const snapshots = new Map();
    for (let seed=0;seed<120&&snapshots.size<rewards.size;seed+=1) {
      const run = new DungeonEngine.Run({seed:'chest-ui-'+seed});
      run.enterDungeon();
      while (run.completed <= 50) {
        const option = run.scene.options.find(candidate => candidate.correct);
        if (option.reward === 'chest' && rewards.has(run.completed) && !snapshots.has(run.completed)) {
          snapshots.set(run.completed, run.serialize());
        }
        const before = run.completed;
        run.choose(option.id);
        run.finishTransition();
        assert.ok(run.completed > before || run.scene.questStep === 2);
      }
    }
    assert.equal(snapshots.size, rewards.size, 'Every payout boundary has a naturally generated chest room');
    for (const [completed,reward] of rewards) {
      const h = await boot(savedRoom(snapshots.get(completed)));
      const before = h.run.coins;
      assert.equal(h.run.completed, completed);
      assert.equal(h.element('coins').textContent, String(before));
      h.choose(correct(h, true));
      settle(h);
      assert.equal(h.run.completed, completed + 1);
      assert.equal(h.element('coins').textContent, String(before + reward));
      assert.equal(h.element('coin-gain-value').textContent, '+' + reward);
      assert.equal(shownCount(h, 'coin-gain'), 1);
    }
  });

  await test('expiry stays latched until entry, then escape starts a fresh three minutes with no +3 popup', async () => {
    const h = await boot();
    h.frame(180);
    assert.equal(h.run.bossDueAt, 180);
    assert.equal(h.run.nextBossIn, 0);
    assert.equal(h.element('time').textContent, '00:00');
    h.choose(correct(h));
    assert.equal(h.run.bossDelaySeconds, 0);
    assert.equal(h.run.bossDueAt, 180);
    settle(h);
    assert.equal(h.run.boss.encounter, 1, 'The newly earned bonus must not cancel an already due boss');
    assert.equal(h.run.boss.scheduledAt, 180);
    assert.equal(h.run.bossDelaySeconds, 3);
    assert.equal(h.run.nextBossAt, 183, 'Combat keeps the schedule that triggered this encounter until escape');
    assert.equal(shownCount(h, 'timer-gain'), 1);
    finishEntrance(h);
    for (let step = 1; step <= 2; step += 1) {
      clear(h);
      assert.equal(h.run.boss.round, step + 1);
      assert.equal(h.run.bossDelaySeconds, 3, 'Intermediate arena actions are parts of one scene');
      assert.equal(h.run.nextBossAt, 183);
      assert.equal(shownCount(h, 'timer-gain'), 1, 'Intermediate arena actions do not repeat the completion popup');
    }
    const wrongExit = h.run.scene.options.find(option => !option.correct);
    h.choose(wrongExit); settle(h);
    assert.equal(h.run.bossDelaySeconds, 3);
    clear(h);
    assert.equal(h.run.boss, null);
    assert.equal(h.run.bossDelaySeconds, 0);
    assert.equal(h.run.nextBossAt, h.run.bossCountdownFrom+180);
    assert.equal(h.element('time').textContent,'03:00');
    assert.equal(h.run.bossDueAt, null);
    assert.equal(shownCount(h, 'timer-gain'), 1);
    const restored = await boot(h.storage);
    assert.equal(restored.run.bossDelaySeconds, 0);
    assert.equal(restored.run.nextBossAt, h.run.nextBossAt);
    assert.equal(restored.element('time').textContent, h.element('time').textContent);
  });

  await test('the boss entrance reveals one complete three-step plan and all nine arena targets', async () => {
    const h = await boot();
    assert.equal(h.element('time').textContent, '03:00');
    assert.match(h.element('clock').getAttribute('aria-label'), /守衛.*03:00/);
    h.frame(180);
    const original = h.run.scene.id;
    h.choose(h.run.scene.options.find(option => !option.correct)); settle(h);
    assert.equal(h.run.scene.id, original);
    assert.equal(h.run.boss, null);
    clear(h);
    assert.equal(h.run.scene.targetType, 'arena');
    assert.equal(h.element('guardian').hidden, false);
    assert.equal(h.element('guardian-name').textContent, h.run.scene.guardian.name);
    assert.equal(h.element('boss-plan').children.length, 3);
    assert.deepEqual(h.element('boss-plan').children.map(node => node.textContent), h.run.scene.escapeSteps.map(step => step.text));
    assert.equal(h.element('routes').children.length, 9);
    for (const kind of ['person', 'item', 'door']) assert.equal(h.run.scene.options.filter(option => option.targetType === kind).length, 3);
    assert.ok(h.element('routes').children.every(button => button.disabled));
    const attempts = h.run.attempts;
    h.choose(correct(h));
    assert.equal(h.run.attempts, attempts);
    finishEntrance(h);
    assert.ok(h.element('routes').children.every(button => !button.disabled));
    assert.match(h.element('clock').getAttribute('aria-label'), /守衛甦醒倒數 00:08/);
    assert.equal(h.element('time').textContent, '00:08');
    assert.equal(h.run.bossProjectile.phase, 'reading');
    assertNoVisibleRunCap(h);
  });

  await test('an out-of-order arena choice costs one heart once and returns to the middle without restarting the shot cycle', async () => {
    const h = await boot();
    enterBoss(h);
    const plan = h.run.scene.escapeSteps.map(step => step.text);
    const readingEndsAt = h.run.boss.readingEndsAt;
    h.frame(readingEndsAt - h.run.elapsed + 0.2);
    const first = h.run.bossProjectile;
    assert.equal(first.phase, 'flight');
    assert.equal(first.cycle, 1);
    const itemForLater = h.run.scene.escapeSteps[1].targetId;
    h.choose(itemForLater);
    assert.equal(h.run.hp, 2);
    assert.equal(h.run.lastResult.correct, false);
    assert.equal(h.run.lastResult.damage, 1);
    h.choose(itemForLater);
    assert.equal(h.run.attempts, 1);
    settle(h);
    assert.equal(h.run.boss.round, 1);
    assert.equal(h.run.boss.readingEndsAt, readingEndsAt);
    assert.equal(h.run.bossProjectile.cycle, first.cycle);
    assert.ok(h.run.bossProjectile.progress > first.progress, 'Flight continues while a choice animates');
    assert.equal(h.run.hp, 2);
    assert.deepEqual({ x: h.visual.x, y: h.visual.y }, { x: 480, y: 600 });
    assert.equal(h.element('chamber').classEvents.filter(event => event.action === 'add' && event.names.includes('hit')).length, 1);
    assert.deepEqual(h.element('boss-plan').children.map(node => node.textContent), plan);
    assert.equal(h.element('hint').hidden, false);
  });

  await test('repeating an already completed boss step costs one heart per attempt and can end the run', async () => {
    const h = await boot();
    enterBoss(h);
    const ally = correct(h).id;
    clear(h);
    assert.equal(h.run.boss.round, 2);
    const deadline = h.run.boss.readingEndsAt;
    for (const hp of [2, 1]) {
      h.choose(ally);
      assert.equal(h.run.lastResult.correct, false);
      assert.equal(h.run.lastResult.damage, 1);
      assert.equal(h.run.hp, hp);
      h.choose(ally);
      assert.equal(h.run.hp, hp, 'Double-clicks during a pending action do not charge another heart');
      settle(h);
      assert.equal(h.run.boss.round, 2);
      assert.deepEqual({ x: h.visual.x, y: h.visual.y }, { x: 480, y: 600 });
      assert.equal(h.run.boss.readingEndsAt, deadline);
    }
    h.choose(ally);
    assert.equal(h.run.hp, 0);
    assert.equal(h.run.reason, 'hearts');
    h.frame(1.3);
    assert.equal(h.element('end-dialog').open, true);
    assert.equal(h.run.impactSerial, 0, 'The three losses came from wrong choices, not projectiles');
    assert.equal(h.element('chamber').classEvents.filter(event => event.action === 'add' && event.names.includes('hit')).length, 3);
  });

  await test('224-pixel shots aim at the hood, hit a stationary player for one heart, and keep the two/five cycle', async () => {
    const h = await boot();
    enterBoss(h);
    const start = h.run.boss.readingEndsAt;
    const launchCues=()=>h.playedSounds.filter(cue=>cue==='bossShot').length;
    assert.equal(launchCues(),0);
    h.frame(start - h.run.elapsed + 0.01);
    assert.equal(launchCues(),1);
    assert.equal(h.run.bossProjectile.phase, 'flight');
    assert.match(h.element('clock').getAttribute('aria-label'), /投射物撞擊倒數 00:02/);
    assert.equal(h.element('time').textContent, '00:02');
    const geometry = h.visual.projectileGeometry;
    assert.ok(geometry);
    assert.equal(geometry.size, 224);
    assert.ok(geometry.contact.y <= h.visual.y - DungeonArt.PLAYER.height + 4, 'Launch aims at the top opaque hood row, not the body center');
    const flightDraw = h.element('room').getContext('2d').calls.findLast(call => call.key === 'drawImage' && /\/projectiles\.png(?:\?|$)/.test(call.args[0].src || '') && call.args[2] === 0);
    assert.ok(flightDraw);
    assert.deepEqual(flightDraw.args.slice(7), [224, 224]);
    h.frame(start + 2.01 - h.run.elapsed);
    assert.equal(h.run.hp, 2);
    assert.equal(h.run.lastImpact.damage, 1);
    assert.equal(h.run.lastImpact.dodged, false);
    assert.equal(h.run.lastImpact.fatal, false);
    assert.equal(h.run.impactSerial, 1);
    assert.equal(h.run.bossProjectile.phase, 'cooldown');
    assert.match(h.element('clock').getAttribute('aria-label'), /守衛蓄力倒數 00:05/);
    assert.equal(h.element('time').textContent, '00:05');
    assert.equal(h.element('hearts').getAttribute('aria-label'), '2 顆心');
    assert.equal(h.visual.damage, true);
    assert.deepEqual(h.visual.projectileMisses,[]);
    assert.deepEqual(h.visual.impactContact, geometry.contact);
    const impactDraw = h.element('room').getContext('2d').calls.findLast(call => call.key === 'drawImage' && /\/projectiles\.png(?:\?|$)/.test(call.args[0].src || '') && call.args[2] > 0);
    assert.ok(impactDraw);
    assert.equal(impactDraw.args[5] + impactDraw.args[7] / 2, geometry.contact.x);
    assert.equal(impactDraw.args[6] + impactDraw.args[8] / 2, geometry.contact.y);
    h.frame(start + 6.99 - h.run.elapsed);
    assert.equal(h.run.bossProjectile.phase, 'cooldown');
    h.frame(0.02);
    assert.equal(h.run.bossProjectile.phase, 'flight');
    assert.equal(h.run.bossProjectile.cycle, 2);
    assert.equal(launchCues(),2);
    assert.equal(h.run.hp, 2);
    h.frame(start + 9.01 - h.run.elapsed);
    assert.equal(h.run.hp, 1);
    assert.equal(h.run.impactSerial, 2);
    assert.equal(h.element('end-dialog').open, false);
    h.frame(start + 16.01 - h.run.elapsed);
    assert.equal(h.run.hp, 0);
    assert.equal(h.run.impactSerial, 3);
    assert.equal(h.run.reason, 'hearts');
    h.frame(1);
    assert.equal(h.element('end-dialog').open, true);
    assert.equal(h.element('chamber').classEvents.filter(event => event.action === 'add' && event.names.includes('hit')).length, 3);
    assertNoVisibleRunCap(h);
  });

  await test('a fatal wrong choice during an older projectile effect still updates zero hearts and plays its own feedback', async () => {
    const h = await boot();
    enterBoss(h);
    const start = h.run.boss.readingEndsAt;
    h.frame(start + 2.01 - h.run.elapsed);
    h.frame(start + 9.01 - h.run.elapsed);
    assert.equal(h.run.hp, 1);
    assert.equal(h.run.impactSerial, 2);
    assert.ok(h.visual.projectileImpact > 0 && h.visual.projectileImpact <= 1);
    assert.equal(h.element('hearts').getAttribute('aria-label'), '1 顆心');
    const hitCount = () => h.element('chamber').classEvents.filter(event => event.action === 'add' && event.names.includes('hit')).length;
    assert.equal(hitCount(), 2);
    const wrong = h.run.scene.options.find(option => option.targetType === 'person' && !option.correct);
    assert.ok(wrong);
    h.choose(wrong);
    assert.equal(h.run.hp, 0);
    assert.equal(h.run.lastResult.optionId, wrong.id);
    assert.equal(h.run.lastResult.damage, 1);
    h.frame(0.2);
    assert.equal(h.element('end-dialog').open, false, 'The older projectile effect must not cancel the new choice animation');
    assert.equal(h.visual.moving, true);
    h.frame(0.4);
    assert.equal(h.element('hearts').getAttribute('aria-label'), '0 顆心');
    assert.ok(h.element('hearts').children.every(heart => heart.className === 'empty'));
    assert.equal(hitCount(), 3, 'The fatal choice must receive exactly one additional damage feedback');
    h.frame(0.7);
    assert.equal(h.run.reason, 'hearts');
    assert.equal(h.element('end-dialog').open, true);
    assert.equal(h.run.impactSerial, 2);
    h.frame(1);
    assert.equal(hitCount(), 3);
    assert.equal(h.element('hearts').getAttribute('aria-label'), '0 顆心');
  });

  await test('a dodged shot flies offscreen on the saved launch line without retargeting or dealing damage', async () => {
    const h = await boot();
    enterBoss(h);
    const start = h.run.boss.readingEndsAt;
    h.frame(start - h.run.elapsed + 0.01);
    const geometry = h.visual.projectileGeometry;
    assert.ok(geometry);
    h.frame(start + 1.6 - h.run.elapsed);
    const option = correct(h);
    h.choose(option);
    h.frame(0.2);
    assert.notEqual(h.visual.x, 480, 'The choice must actually move the character away from the shot');
    assert.deepEqual(h.visual.projectileGeometry, geometry, 'Movement must not make a launched shot home toward the character');
    assert.equal(h.run.lastResult.optionId, option.id);
    h.frame(0.21);
    assert.equal(h.run.impactSerial, 1);
    assert.equal(h.run.lastImpact.dodged, true);
    assert.equal(h.run.lastImpact.damage, 0);
    assert.equal(h.run.hp, 3);
    assert.equal(h.visual.damage, false);
    assert.equal(h.visual.projectileImpact, 0);
    assert.equal(h.visual.impactContact, null);
    assert.equal(h.visual.projectileMisses.length,1);
    assert.deepEqual(h.visual.projectileMisses[0].geometry,geometry);
    assert.ok(h.visual.projectileMisses[0].progress>1,'A miss continues beyond the original contact point');
    assert.equal(h.run.lastResult.optionId, option.id, 'A missed shot must not overwrite the action in progress');
    settle(h);
    assert.equal(h.run.boss.round, 2);
    assert.deepEqual({ x: h.visual.x, y: h.visual.y }, { x: 480, y: 600 });
    assert.equal(h.element('chamber').classEvents.filter(event => event.action === 'add' && event.names.includes('hit')).length, 0);
    h.pagehide();
    const restored = await boot(h.storage);
    assert.equal(restored.run.hp, 3);
    assert.equal(restored.run.impactSerial, 1);
    assert.equal(restored.run.lastImpact.dodged, true);
    restored.frame(0);
    const tail=restored.visual.projectileMisses[0];
    assert.deepEqual(tail.geometry,geometry);
    const drawStart=restored.element('room').getContext('2d').calls.length;
    restored.frame(0.2);
    const continued=restored.visual.projectileMisses[0];
    assert.deepEqual(continued.geometry,tail.geometry);
    assert.ok(continued.progress>tail.progress);
    const frames=restored.element('room').getContext('2d').calls.slice(drawStart);
    assert.ok(frames.some(call=>call.key==='drawImage'&&/\/projectiles\.png(?:\?|$)/.test(call.args[0].src||'')));
    assert.deepEqual(restored.playedSounds,[],'A restored miss makes no second launch sound');
    restored.click('pause');restored.frame(.3);assert.deepEqual(restored.visual.projectileMisses[0],continued);
    restored.click('resume');
    let previous=continued;
    while(restored.visual.projectileMisses.length&&restored.run.elapsed<start+6.9){
      previous=restored.visual.projectileMisses[0];
      restored.frame(.05);
    }
    assert.equal(restored.visual.projectileMisses.length,0);
    const {flightSeconds}=restored.run.boss.pacing;
    assert.equal(restored.art.projectileInFrame(previous.geometry,previous.progress,flightSeconds),true);
    assert.equal(restored.art.projectileInFrame(previous.geometry,(restored.run.elapsed-start)/flightSeconds,flightSeconds),false);
    assert.equal(restored.run.impactSerial, 1, 'Reload must not replay a dodged projectile');
    assert.equal(restored.run.hp,3);
  });

  await test('a launch aims at the current side position, stays frozen through return and reload, and re-aims next cycle', async () => {
    const h = await boot();
    enterBoss(h);
    const start = h.run.boss.readingEndsAt;
    h.frame(start - 0.4 - h.run.elapsed);
    h.choose(correct(h));
    h.frame(0.39);
    assert.equal(h.visual.moving, false);
    const side = { x: h.visual.x, y: h.visual.y };
    assert.notEqual(side.x, 480);
    h.frame(0.02);
    assert.equal(h.run.bossProjectile.phase, 'flight');
    const shot = storedShot(h);
    assert.equal(shot.cycle, 1);
    assert.equal(shot.launch.x, side.x);
    assert.equal(shot.launch.y, side.y);
    const geometry = h.visual.projectileGeometry;
    assert.ok(Math.abs(geometry.contact.x - side.x) < DungeonArt.PLAYER.width / 2);
    assert.deepEqual(geometry, JSON.parse(JSON.stringify(h.art.projectileGeometry(shot.launch, h.run.scene.area))));
    h.frame(0.5);
    assert.equal(h.run.boss.round, 2);
    assert.deepEqual({ x: h.visual.x, y: h.visual.y }, { x: 480, y: 600 });
    assert.deepEqual(h.visual.projectileGeometry, geometry, 'Returning home must not retarget an existing projectile');
    const elapsed = h.run.elapsed;
    const projectile = h.run.bossProjectile;
    h.click('pause'); h.frame(20);
    assert.equal(h.run.elapsed, elapsed);
    assert.deepEqual(h.run.bossProjectile, projectile);
    assert.deepEqual(h.visual.projectileGeometry, geometry);
    h.click('resume'); h.pagehide();
    const restored = await boot(h.storage);
    restored.frame(0);
    assert.deepEqual(storedShot(restored), shot);
    assert.deepEqual(restored.visual.projectileGeometry, geometry, 'Reload must use the saved launch position instead of the restored hero position');
    const expectedHit = restored.art.projectileHits(geometry, restored.visual, restored.run.scene.area);
    restored.frame(start + 2.01 - restored.run.elapsed);
    assert.equal(restored.run.lastImpact.dodged, !expectedHit);
    assert.equal(restored.run.hp, expectedHit ? 2 : 3);
    assert.deepEqual(restored.visual.projectileGeometry, geometry, 'Impact resolution must retain the saved trajectory');
    restored.frame(start + 7.01 - restored.run.elapsed);
    const next = storedShot(restored);
    assert.equal(next.cycle, 2);
    assert.equal(next.launch.x, 480);
    assert.equal(next.launch.y, 600);
    assert.notDeepEqual(restored.visual.projectileGeometry.contact, geometry.contact, 'Each new shot must capture the new location');
  });

  await test('crossing a launch in one large frame captures the same moving hood as many small frames', async () => {
    const base = await boot();
    enterBoss(base);
    base.frame(base.run.boss.readingEndsAt - 0.19 - base.run.elapsed);
    base.pagehide();
    const coarse = await boot(base.storage);
    const fine = await boot(base.storage);
    coarse.choose(correct(coarse));
    fine.choose(correct(fine));
    coarse.frame(0.75);
    sampleFrames(fine, 0.75, 1 / 120);
    const a = storedShot(coarse), b = storedShot(fine);
    assert.equal(a.cycle, 1);
    assert.equal(a.launchAt, b.launchAt);
    assert.ok(Math.hypot(a.launch.x - 480, a.launch.y - 600) > 10, 'Launch must capture movement before the action returns home');
    assert.ok(Math.hypot(a.launch.x - b.launch.x, a.launch.y - b.launch.y) < 1e-6);
    assert.ok(Math.abs(a.launch.walkOffset - b.launch.walkOffset) < 1e-6);
    for (const h of [coarse, fine]) {
      assert.equal(h.run.boss.round, 2);
      assert.deepEqual({ x: h.visual.x, y: h.visual.y }, { x: 480, y: 600 });
    }
    assert.ok(Math.hypot(coarse.visual.projectileGeometry.contact.x - fine.visual.projectileGeometry.contact.x,
      coarse.visual.projectileGeometry.contact.y - fine.visual.projectileGeometry.contact.y) < 1e-6);
  });

  await test('identifying the ally grants no protection, and the ordered unlock and escape preserve the plan and attack timeline', async () => {
    const h = await boot();
    enterBoss(h);
    const scene = h.run.scene.id;
    const plan = h.run.scene.escapeSteps.map(step => step.text);
    const optionIds = h.run.scene.options.map(option => option.id);
    const before = { index: h.run.index, completed: h.run.completed, story: JSON.stringify(h.run.storyState) };
    const start = h.run.boss.readingEndsAt;
    clear(h);
    assert.equal(h.run.boss.round, 2);
    assert.equal(h.run.boss.stepWard, undefined);
    assert.equal(h.run.boss.stepWardGranted, undefined);
    assert.equal(Boolean(h.visual.shield), false);
    const savedBoss = JSON.parse(h.run.serialize()).boss;
    assert.equal(Object.hasOwn(savedBoss, 'stepWard'), false);
    assert.equal(Object.hasOwn(savedBoss, 'stepWardGranted'), false);
    assert.equal(/護盾|祝福/.test(plan.join('')), false, 'The plan must not promise a removed protective buff');
    assert.equal(h.run.scene.id, scene);
    assert.deepEqual(h.run.scene.options.map(option => option.id), optionIds);
    assert.deepEqual(h.element('boss-plan').children.map(node => node.textContent), plan);
    assert.equal(h.element('boss-plan').children[0].classList.contains('complete'), true);
    h.frame(start + 2.01 - h.run.elapsed);
    assert.equal(h.run.lastImpact.stepWardBlocked, false);
    assert.equal(h.run.lastImpact.wardBlocked, false);
    assert.equal(h.run.lastImpact.damage, 1);
    assert.equal(h.run.hp, 2, 'Completing the ally step must not block projectile damage');
    assert.equal(h.run.bossProjectile.phase, 'cooldown');
    const exit = h.run.scene.escapeSteps[2].targetId;
    h.choose(exit); settle(h);
    assert.equal(h.run.boss.round, 2, 'An early exit must not skip unlocking');
    assert.equal(h.run.boss.exitUnlocked, false);
    assert.equal(h.run.hp, 2);
    clear(h);
    assert.equal(h.run.boss.round, 3);
    assert.equal(h.run.boss.exitUnlocked, true);
    assert.equal(h.run.boss.readingEndsAt, start);
    assert.deepEqual(h.element('boss-plan').children.map(node => node.textContent), plan);
    assert.deepEqual(h.run.scene.options.map(option => option.id), optionIds);
    clear(h);
    assert.equal(h.run.boss, null);
    assert.ok(h.run.elapsed < start + 9, 'Successful escape finishes before the second projectile impact');
    assert.equal(h.run.impactSerial, 1);
    assert.equal(h.run.index, before.index);
    assert.equal(h.run.completed, before.completed);
    assert.equal(JSON.stringify(h.run.storyState), before.story);
    assert.equal(h.element('guardian').hidden, true);
    assert.equal(h.element('boss-plan').hidden, true);
    assert.equal(h.element('clock').classList.contains('boss-active'), false);
    assert.equal(h.run.hp, 2);
    assert.equal(h.element('chamber').classEvents.filter(event => event.action === 'add' && event.names.includes('hit')).length, 1);
  });

  await test('the final door keeps moving through a dodged shot and credits the escape once without an impact pause', async () => {
    const h = await boot();
    enterBoss(h);
    clear(h, 2);
    assert.equal(h.run.boss.round, 3);
    assert.equal(h.run.boss.exitUnlocked, true);
    const sceneId = h.run.scene.id;
    const before = { hp: h.run.hp, delay: h.run.bossDelaySeconds, nextBossAt: h.run.nextBossAt };
    const impactAt = h.run.boss.readingEndsAt + h.run.boss.pacing.flightSeconds;
    h.frame(impactAt - 0.6 - h.run.elapsed);
    h.choose(correct(h));
    h.frame(0.59);
    assert.equal(h.run.phase, 'resolving');
    assert.equal(h.run.impactSerial, 0);
    assert.equal(h.visual.moving, true);
    h.frame(0.02);
    assert.ok(h.run.boss);
    assert.equal(h.run.scene.id, sceneId);
    assert.equal(h.run.lastImpact.dodged, true);
    assert.equal(h.run.hp, before.hp);
    assert.equal(h.run.impactSerial, 1);
    assert.equal(h.visual.moving, true, 'A dodged shot must not add a pause to the door path');
    assert.equal(h.visual.projectileImpact, 0);
    assert.equal(h.run.bossDelaySeconds, before.delay);
    h.frame(0.12);
    assert.equal(h.run.boss, null);
    assert.equal(h.run.phase, 'playing');
    assert.notEqual(h.run.scene.id, sceneId);
    assert.equal(h.element('guardian').hidden, true);
    assert.equal(h.visual.impactContact, null);
    assert.equal(h.run.hp, before.hp);
    assert.equal(h.run.bossDelaySeconds, 0);
    assert.equal(h.run.nextBossAt, h.run.bossCountdownFrom + 180);
    h.frame(0.5);
    h.pagehide();
    const reloaded = await boot(h.storage);
    assert.equal(reloaded.run.boss, null);
    assert.equal(reloaded.run.impactSerial, 1);
    assert.equal(reloaded.run.hp, before.hp);
    assert.equal(reloaded.run.bossDelaySeconds, 0);
    assert.equal(reloaded.run.nextBossAt, h.run.bossCountdownFrom + 180);
  });

  await test('reload preserves the waiting boss, full plan, one-time grace and consumed impact without replay', async () => {
    const h = await boot();
    const ordinary = h.run.scene.id;
    h.frame(180); h.pagehide();
    const waiting = await boot(h.storage);
    assert.equal(waiting.run.scene.id, ordinary);
    assert.equal(waiting.run.boss, null);
    clear(waiting); finishEntrance(waiting);
    waiting.frame(waiting.run.boss.readingEndsAt - waiting.run.elapsed + 0.6);
    waiting.pagehide();
    const active = await boot(waiting.storage);
    assert.equal(active.run.boss.readingEndsAt, waiting.run.boss.readingEndsAt);
    assert.deepEqual(active.run.bossProjectile, waiting.run.bossProjectile);
    assert.deepEqual(active.element('boss-plan').children.map(node => node.textContent), waiting.element('boss-plan').children.map(node => node.textContent));
    active.frame(1.41); active.pagehide();
    assert.equal(active.run.hp, 2);
    const afterHit = await boot(active.storage);
    assert.equal(afterHit.run.hp, 2);
    assert.equal(afterHit.run.impactSerial, 1);
    assert.equal(afterHit.run.bossProjectile.phase, 'cooldown');
    afterHit.frame(0.2);
    assert.equal(afterHit.run.hp, 2);
    assert.equal(afterHit.run.impactSerial, 1);
    assert.equal(afterHit.element('chamber').classEvents.filter(event => event.action === 'add' && event.names.includes('hit')).length, 0);
  });

  await test('later bosses keep the same two/five cycle and one-heart impact instead of fatal hits', async () => {
    const h = await boot();
    enterBoss(h); clear(h, 3);
    enterBoss(h);
    assert.equal(h.run.boss.encounter, 2);
    const start = h.run.boss.readingEndsAt;
    assert.equal(h.run.boss.pacing.flightSeconds, 2);
    assert.equal(h.run.boss.pacing.cooldownSeconds, 5);
    h.choose(h.run.scene.options.find(option => option.targetType==='person'&&!option.correct)); settle(h);
    assert.equal(h.run.hp, 2);
    assert.equal(h.run.phase, 'playing');
    assert.equal(h.run.boss.round, 1);
    h.frame(start + 2.01 - h.run.elapsed);
    assert.equal(h.run.hp, 1);
    assert.equal(h.run.reason, null);
    assert.equal(h.run.lastImpact.damage, 1);
    assert.equal(h.run.lastImpact.fatal, false);
    assert.equal(h.element('end-dialog').open, false);
    assert.equal(h.element('hearts').getAttribute('aria-label'), '1 顆心');
    clear(h, 3);
    assert.equal(h.run.boss, null);
    assert.equal(h.run.hp, 1);
    assertNoVisibleRunCap(h);
  });

  await test('boss victories survive reload and the third arena honors its extended deadline and stronger reading pace', async () => {
    const h = await boot();
    enterBoss(h); clear(h, 3);
    enterBoss(h); clear(h, 3);
    h.pagehide();
    const restored = await boot(h.storage);
    assert.equal(restored.run.elapsed, h.run.elapsed);
    assert.equal(restored.run.encounters, 2);
    restored.frame(480 - restored.run.elapsed);
    assert.equal(restored.run.reason, null);
    assert.equal(restored.run.phase, 'playing');
    assert.equal(restored.element('end-dialog').open, false);
    enterBoss(restored);
    assert.equal(restored.run.boss.encounter, 3);
    assert.deepEqual(restored.run.boss.pacing, { overrun: true, readingSeconds: 6, flightSeconds: 2, cooldownSeconds: 5 });
    assert.equal(restored.element('time').textContent, '00:06');
    clear(restored, 3);
    assert.equal(restored.run.boss, null);
    assert.equal(restored.run.encounters, 3);
    restored.click('pause'); restored.click('finish');
    assert.equal(restored.element('end-time').textContent, '3');
    assertNoVisibleRunCap(restored);
  });

  await test('a correct floor item disappears after the beside-target pause and advances without an inventory or carried icon', async () => {
    const h = await boot();
    const index = seekRoom(h, 'item');
    assert.equal(h.run.scene.targetType, 'item');
    const option = correct(h);
    const target = DungeonArt.layout(h.run.scene).find(position => position.id === option.id);
    const previousScene = h.run.scene.id;
    const context = h.element('room').getContext('2d');
    h.choose(option);
    h.frame(0.4);
    assert.equal(h.run.phase, 'resolving');
    assert.equal(h.visual.collectedId, null, 'Reaching an item does not skip the interaction pause');
    assert.equal(h.visual.moving, false);
    const beside = { x: h.visual.x, y: h.visual.y };
    h.frame(0.14);
    assert.equal(h.visual.collectedId, null);
    assert.deepEqual({ x: h.visual.x, y: h.visual.y }, beside);
    const start = context.calls.length;
    h.frame(0.03);
    assert.equal(h.visual.collectedId, option.id);
    assert.equal(h.visual.carried, undefined, 'Items are collected without adding a tiny carried sprite');
    const atlas = DungeonArt.AREAS[h.run.area] >= 4 ? 'annex-items' : 'items';
    const itemDraws = context.calls.slice(start).filter(call => call.key === 'drawImage' && call.args[0].src?.includes('/'+atlas+'.png'));
    assert.equal(itemDraws.length, h.run.scene.options.length - 1);
    assert.equal(itemDraws.some(call => Math.abs(call.args[5]-target.bounds.x)<1 && Math.abs(call.args[6]-target.bounds.y)<1), false);
    h.frame(0.2);
    assert.equal(h.visual.moving, true, 'Collection automatically starts the exit movement');
    settle(h);
    assert.equal(h.run.index, index + 1);
    assert.notEqual(h.run.scene.id, previousScene);
    assert.equal(h.visual.collectedId, null);
    assert.equal(h.visual.carried, undefined);
    assert.equal(h.element('pause-dialog').open, false);
    assert.equal(h.element('end-dialog').open, false);
    assert.equal(h.elements.has('inventory'), false);
    assert.equal(/行囊|背包|物品欄|id="inventory"/.test(html), false);
  });

  await test('normal people and items use clear beside-target paths, pause there, and return or leave without sprite overlap', async () => {
    for (const type of ['person','item']) {
      const base = await boot();
      const index = seekRoom(base, type);
      base.pagehide();
      for (const option of base.run.scene.options) {
        const h = await boot(base.storage);
        const scene = h.run.scene.id;
        const start = h.visualFrames.length;
        h.choose(option);
        sampleFrames(h, 0.4);
        assert.equal(h.visual.moving, false);
        assert.equal(h.visual.collectedId, null);
        const stop = { x: h.visual.x, y: h.visual.y };
        const before = h.run.elapsed;
        h.click('pause'); h.frame(20);
        assert.equal(h.run.elapsed, before);
        assert.deepEqual({ x: h.visual.x, y: h.visual.y }, stop);
        h.click('resume'); sampleFrames(h, 0.14);
        assert.deepEqual({ x: h.visual.x, y: h.visual.y }, stop, 'The interaction pause resumes where it stopped');
        sampleFrames(h, 0.6);
        assert.equal(h.run.phase, 'playing');
        assertSafeFrames(h, start, scene);
        if (option.correct) assert.equal(h.run.index, index + 1);
        else {
          assert.equal(h.run.scene.id, scene);
          assert.equal(h.run.index, index);
          assert.deepEqual({ x: h.visual.x, y: h.visual.y }, { x: 480, y: 600 });
          assert.equal(h.element('hint').hidden, false);
        }
      }
    }
  });

  await test('ordinary and arena doors move continuously without a person-or-item interaction pause', async () => {
    for (const arena of [false, true]) for (const right of [false, true]) {
      const h = await boot();
      if (arena) {
        enterBoss(h);
        if (right) clear(h, 2);
      }else seekRoom(h,'door');
      const option = h.run.scene.options.find(candidate => (candidate.targetType || h.run.scene.targetType) === 'door' && candidate.correct === right);
      assert.ok(option);
      h.choose(option);
      h.frame(0.39);
      assert.equal(h.visual.moving, true, 'Door movement must continue as soon as the approach finishes');
      const afterApproach = { x: h.visual.x, y: h.visual.y };
      h.frame(0.1);
      assert.equal(h.visual.moving, true);
      assert.notDeepEqual({ x: h.visual.x, y: h.visual.y }, afterApproach, 'A door cannot inherit the interaction dwell used for people and items');
      h.frame(0.35);
      assert.equal(h.run.phase, 'playing');
      if (arena && right) assert.equal(h.run.boss, null);
      else if (arena) {
        assert.equal(h.run.boss.round, 1);
        assert.equal(h.run.hp, 3);
        assert.deepEqual({ x: h.visual.x, y: h.visual.y }, { x: 480, y: 600 });
      }
    }
  });

  await test('correct ordinary and arena doors keep a uniform travel speed and finish within 0.70 seconds', async () => {
    for (const arena of [false, true]) {
      const h = await boot();
      if (arena) { enterBoss(h); clear(h, 2); }else seekRoom(h,'door');
      const sceneId = h.run.scene.id;
      const startFrame = h.visualFrames.length;
      h.choose(correct(h));
      sampleFrames(h, 0.65, 0.005);
      assert.equal(h.run.phase, 'resolving');
      const frames = h.visualFrames.slice(startFrame).filter(frame => frame.sceneId === sceneId);
      assert.ok(frames.every(frame => frame.visual.moving), 'Correct doors never dwell along the route');
      const travelled = (from, to) => frames.slice(from + 1, to + 1).reduce((sum, frame, offset) => {
        const previous = frames[from + offset];
        return sum + Math.hypot(frame.visual.x - previous.visual.x, frame.visual.y - previous.visual.y);
      }, 0);
      const early = travelled(20, 40), late = travelled(80, 100);
      assert.ok(early > 0 && late > 0);
      assert.ok(Math.abs(early - late) / Math.max(early, late) < 0.05, 'The approach-to-exit boundary must not change character speed');
      h.frame(0.051);
      assert.equal(h.run.phase, 'playing');
      assert.notEqual(h.run.scene.id, sceneId);
      if (arena) assert.equal(h.run.boss, null);
    }
  });

  await test('boss people and items pause briefly at contact then immediately return to the middle', async () => {
    for (const step of [1, 2]) for (const right of [false, true]) {
      const h = await boot();
      enterBoss(h);
      if (step === 2) clear(h);
      const type = step === 1 ? 'person' : 'item';
      const option = h.run.scene.options.find(candidate => candidate.targetType === type && candidate.correct === right);
      assert.ok(option);
      h.choose(option);
      h.frame(0.39);
      const beside = { x: h.visual.x, y: h.visual.y };
      assert.equal(h.visual.moving, false);
      assert.notDeepEqual(beside, { x: 480, y: 600 });
      h.frame(0.06);
      assert.equal(h.visual.moving, false);
      assert.deepEqual({ x: h.visual.x, y: h.visual.y }, beside);
      h.frame(right ? 0.02 : 0.37);
      assert.equal(h.visual.moving, true);
      assert.equal(h.visual.returning, true);
      assert.notDeepEqual({ x: h.visual.x, y: h.visual.y }, beside, 'The boss interaction must not retain the longer ordinary-room pause');
      h.frame(0.231);
      assert.equal(h.run.phase, 'playing');
      assert.deepEqual({ x: h.visual.x, y: h.visual.y }, { x: 480, y: 600 });
      assert.equal(h.run.boss.round, right ? step + 1 : step);
      assert.equal(h.run.hp, right ? 3 : 2);
    }
  });

  await test('all nine arena targets have safe approach and return paths and the ordered escape avoids every other target', async () => {
    const base = await boot();
    enterBoss(base); base.pagehide();
    for (const option of base.run.scene.options) {
      const h = await boot(base.storage);
      const scene = h.run.scene.id;
      const start = h.visualFrames.length;
      h.choose(option);
      sampleFrames(h, 1.05);
      assert.equal(h.run.phase, 'playing');
      assertSafeFrames(h, start, scene);
      assert.equal(h.run.boss.round, option.correct ? 2 : 1);
      assert.equal(h.run.hp, option.correct || option.targetType==='door' ? 3 : 2);
      assert.deepEqual({ x: h.visual.x, y: h.visual.y }, { x: 480, y: 600 }, 'Every completed non-exit arena action returns to the middle');
    }
    const h = await boot(base.storage);
    const scene = h.run.scene.id;
    const exit = h.run.scene.escapeSteps[2].targetId;
    const start = h.visualFrames.length;
    for (let step = 1; step <= 3; step += 1) {
      h.choose(correct(h));
      sampleFrames(h, 1.05);
      if (step < 3) {
        assert.equal(h.run.boss.round, step + 1);
        assert.deepEqual({ x: h.visual.x, y: h.visual.y }, { x: 480, y: 600 });
      }
    }
    assert.equal(h.run.boss, null);
    assertSafeFrames(h, start, scene, exit);
  });

  await test('broken bridges end the run from full health; ladders cost one and stay broken for the retry', async () => {
    for (const type of ['bridge','ladder']) {
      const h = await boot(); seekRoom(h, type);
      const scene = h.run.scene.id;
      const wrong = h.run.scene.options.find(option => !option.correct);
      const target = DungeonArt.layout(h.run.scene).find(position => position.id === wrong.id);
      const path = DungeonArt.navigation(h.run.scene, wrong.id);
      for (const position of DungeonArt.layout(h.run.scene)) {
        assertCrossingArt(h, position, h.run.scene.options.find(option => option.id === position.id), false);
      }
      h.choose(wrong);
      sampleFrames(h, 0.64);
      assert.equal(h.visual.collapsedId, null);
      assert.equal(h.visual.collapsedIds.includes(wrong.id), false);
      assertCrossingArt(h, target, wrong, false);
      assert.equal(h.visual.x, target.x);
      assert.ok(h.visual.y > path.crossingMidpoint.y && h.visual.y < path.stop.y, 'The hero traverses the intact crossing before it falls');
      sampleFrames(h, 0.04);
      assert.equal(h.visual.collapsedId, wrong.id);
      assert.equal(h.visual.x, target.x);
      assert.equal(h.visual.y, path.crossingMidpoint.y);
      assert.ok(h.visual.fall > 0);
      assertCrossingArt(h, target, wrong, true);
      assert.equal(h.element('chamber').classEvents.filter(event => event.action === 'add' && event.names.includes('hit')).length, 1);
      assert.equal(h.visual.reaction.type,h.run.scene.targetType);
      if(type==='bridge'){
        assert.equal(h.run.hp,0,'Falling from a bridge is fatal from full health');
        assert.equal(h.element('end-dialog').open,false);
        sampleFrames(h,.46);
        assert.equal(h.element('end-dialog').open,true);
        assert.equal(h.run.reason,'fatal');
        const coins = h.run.coins;
        h.click('restart'); h.frame(3);
        assert.equal(h.run.phase,'entrance');
        assert.equal(h.run.elapsed,0);
        assert.equal(h.run.hp,3);
        assert.equal(h.run.coins,coins);
        enterFromGate(h);
        continue;
      }
      sampleFrames(h, 0.47);
      assert.equal(h.visual.returning, true);
      sampleFrames(h, 0.32);
      assert.equal(h.run.scene.id, scene);
      assert.equal(h.run.phase, 'playing');
      assert.equal(h.run.hp, 2);
      assert.deepEqual({ x: h.visual.x, y: h.visual.y }, { x: 480, y: 600 });
      assert.equal(h.visual.collapsedIds.includes(wrong.id), true);
      assertCrossingArt(h, target, wrong, true);
      const route = h.element('routes').children.find(button => button.dataset.id === wrong.id);
      assert.equal(route.disabled, true, 'The failed crossing remains unusable in this room');
      const attempts = h.run.attempts;
      h.choose(wrong);
      assert.equal(h.run.attempts, attempts, 'A collapsed route cannot cost a second heart');
      clear(h);
      assert.deepEqual(h.visual.collapsedIds, []);
      assert.equal(h.visual.collapsedId, null);
    }
  });

  await test('a lethal crossing mistake still shows intact traversal and collapse before opening the ending', async () => {
    for (const type of ['bridge','ladder']) {
      const base = await boot(); const index = seekRoom(base, type);
      base.run.hp = 1; base.pagehide();
      const h = await boot(base.storage);
      const wrong = h.run.scene.options.find(option => !option.correct);
      const target = DungeonArt.layout(h.run.scene).find(position => position.id === wrong.id);
      const path = DungeonArt.navigation(h.run.scene, wrong.id);
      h.choose(wrong);
      assert.equal(h.run.hp, 0);
      assert.equal(h.element('end-dialog').open, false);
      sampleFrames(h, 0.64);
      assert.equal(h.element('end-dialog').open, false);
      assert.equal(h.visual.collapsedId, null);
      assertCrossingArt(h, target, wrong, false);
      sampleFrames(h, 0.04);
      assert.equal(h.visual.collapsedId, wrong.id);
      assert.equal(h.visual.y, path.crossingMidpoint.y);
      assertCrossingArt(h, target, wrong, true);
      assert.equal(h.element('end-dialog').open, false);
      sampleFrames(h, 0.48);
      assert.equal(h.element('end-dialog').open, true);
      assert.equal(h.visual.returning, false);
      assert.equal(h.run.index, index);
    }
  });

  await test('bridge and ladder choices traverse their obstacles directly, with hover and keyboard focus following the target', async () => {
    const h = await boot();
    for (const type of ['bridge', 'ladder']) {
      seekRoom(h, type);
      assert.equal(h.run.scene.targetType, type);
      const before = h.run.index;
      const option = correct(h);
      const route = h.element('routes').children.find(button => button.dataset.id === option.id);
      route.dispatch('pointerenter'); h.frame(0.01);
      assert.equal(h.visual.hover, option.id);
      route.dispatch('pointerleave'); h.frame(0.01);
      assert.equal(h.visual.hover, null);
      route.dispatch('focus'); h.frame(0.01);
      assert.equal(h.visual.hover, option.id);
      route.dispatch('blur'); h.frame(0.01);
      assert.equal(h.visual.hover, null);
      h.choose(option);
      assert.ok(h.element('routes').children.every(button => button.disabled));
      h.frame(0.38);
      const path = DungeonArt.navigation(h.run.scene, option.id);
      assert.equal(h.visual.y, path.stop.y, 'The hero approaches the foot of the selected crossing first');
      h.frame(0.32);
      const crossing = DungeonArt.layout(h.run.scene).find(position => position.id === option.id);
      assert.equal(h.visual.x, crossing.x, 'Cross at the selected bridge or ladder instead of walking diagonally through the obstacle');
      assert.ok(h.visual.y < path.crossingMidpoint.y && h.visual.y > path.exit[0].y);
      settle(h);
      assert.equal(h.run.index, before + 1);
      assert.equal(h.element('pause-dialog').open, false);
      assert.equal(h.element('end-dialog').open, false);
    }
  });

  await test('an older in-progress run keeps its earnings and drops its old wallet balance', async () => {
    const h = await boot();
    const index = seekRoom(h, 'chest');
    h.choose(correct(h, true));
    const old = JSON.parse(h.run.serialize());
    Object.assign(old, {version:16, startingCoins:98, coins:113});
    old.lastResult.coinsEarned = 5;
    const storage = savedRoom(JSON.stringify(old));
    storage.set('dungeon-v1:traveller-1:coins', '113');
    const resumed = await boot(storage);
    assert.equal(resumed.run.coins, 15);
    assert.equal(resumed.element('coins').textContent, '15');
    assert.equal(resumed.run.index, index + 1, 'The committed chest is settled on reload');
    assert.equal(resumed.element('coin-gain').hidden, true);
    assert.equal(resumed.run.elapsed, h.run.elapsed);
    resumed.click('pause');
    resumed.click('finish');
    assert.equal(resumed.run.reason, 'quit');
    assert.equal(resumed.element('end-dialog').open, true);
    assert.equal(resumed.element('end-coins').textContent, '15');
    resumed.click('restart');
    assert.equal(resumed.run.coins, 0);
    assert.equal(resumed.element('coins').textContent, '0');
  });

  await test('ordinary play has no buff controls, grants, manual hint action, or inventory', async () => {
    const h = await boot();
    assert.equal(h.elements.has('powers'), false);
    assert.equal(h.elements.has('inventory'), false);
    assert.equal(h.run.boons, undefined);
    assert.equal(h.run.wardUsed, undefined);
    assert.equal(h.run.useLantern, undefined);
    assert.equal(/祝福|金紋祝福|護心祝福|微光祝福|id="powers"|id="inventory"/.test(html), false);
    seekRoom(h, 'person');
    assert.equal(h.run.scene.kind, 'reading');
    assert.equal(h.run.scene.options.some(option => option.boon), false);
    const coins = h.run.coins;
    clear(h);
    assert.equal(h.run.coins, coins);
    assert.equal(h.run.boons, undefined);
    const saved = JSON.parse(JSON.parse(h.storage.get('dungeon-v1:traveller-1:run')));
    for (const key of ['boons', 'wardUsed', 'manualHintUsed']) assert.equal(Object.hasOwn(saved, key), false);
  });

  await test('a legacy timeout-ended journey resumes its paid movement once and strips its old buffs', async () => {
    const h = await boot(new Map([['mist-reading-coins-v1', '40']]));
    const old = JSON.parse(h.run.serialize());
    Object.assign(old, { area: 'crypt', index: 2, completed: 2, storyState: { areaSteps: { crypt: 2 } }, attempts: 1 });
    const scene = DungeonContent.createScene({ ...old, legacy: true, legacyControls: true, difficulty: 'danger' });
    const door = scene.options.find(o => o.route === 'vault');
    old.sceneId = scene.id; old.lockedTier = 'danger';
    old.startingCoins = 40;
    old.coins = 45;
    old.lastResult = { correct: true, sceneId: scene.id, optionId: door.id, coinsEarned: 5 };
    old.version = 4; old.elapsed = 480; old.phase = 'ended'; old.reason = 'timeout'; old.pending = null;
    old.boons = ['ward', 'treasure', 'lantern']; old.wardUsed = false; old.manualHintUsed = true;
    const storage = new Map(h.storage);
    storage.set('dungeon-v1:traveller-1:run', JSON.stringify(JSON.stringify(old)));
    const resumed = await boot(storage);
    assert.equal(resumed.run.reason, null);
    assert.equal(resumed.run.phase, 'playing');
    assert.equal(resumed.run.elapsed, 480);
    assert.equal(resumed.run.coins, 5);
    assert.equal(resumed.run.index, 3);
    assert.equal(resumed.run.boss.encounter, 1);
    assert.equal(resumed.run.boss.pacing.overrun, true);
    assert.equal(resumed.element('end-dialog').open, false);
    assert.equal(resumed.elements.has('powers'), false);
    finishEntrance(resumed);
    assert.equal(resumed.element('time').textContent, '00:06');
    clear(resumed, 3);
    assert.equal(resumed.run.coins, 5);
    assert.equal(resumed.run.boons, undefined);
    const again = await boot(resumed.storage);
    assert.equal(again.run.coins, 5);
    assert.equal(again.run.index, 3);
    assert.equal(again.element('end-dialog').open, false);
  });

  await test('reload during chest movement settles once without replaying reward or resetting the clock', async () => {
    const h = await boot();
    const index = seekRoom(h, 'chest');
    const score = h.run.coins + expectedChestReward(h.run);
    h.frame(20);
    h.choose(correct(h, true));
    assert.equal(h.run.phase, 'resolving');
    assert.equal(h.run.coins, score);
    const resumed = await boot(h.storage);
    assert.equal(resumed.run.phase, 'playing');
    assert.equal(resumed.run.index, index + 1);
    assert.equal(resumed.run.coins, score);
    assert.equal(resumed.element('coins').textContent, String(score));
    assert.equal(resumed.run.elapsed, h.run.elapsed);
    assert.equal(resumed.element('coin-gain').textContent, '');
    resumed.frame(0.1);
    assert.equal(resumed.run.coins, score);
    resumed.pagehide();
    const again = await boot(resumed.storage);
    assert.equal(again.run.coins, score);
    assert.equal(again.run.index, index + 1);
    again.click('pause'); again.click('finish'); again.click('restart');
    assert.equal(again.run.coins, 0);
    assert.equal(again.element('coins').textContent, '0');
    assert.equal(again.run.index, 0);
    assert.equal(again.run.elapsed, 0);
    assert.equal(again.run.boons, undefined);
    assert.deepEqual(again.run.records, []);
  });

  process.stdout.write(`\n${passed} dungeon UI integration checks passed.\n`);
})().catch(error => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
