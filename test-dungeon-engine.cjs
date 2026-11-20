'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');

const enginePath = path.join(__dirname, 'dungeon-engine.js');
const source = fs.readFileSync(enginePath, 'utf8');
const fixture = {
  AREAS: { crypt: {}, tide: {}, fungus: {}, forge: {} },
  BOONS: { ward: {}, treasure: {}, lantern: {} },
  createBossScene({ seed, area, encounter, round, difficulty }) {
    const targetTypes = ['person', 'item', 'door'];
    const escapeSteps = targetTypes.map((targetType, index) => ({ step: index + 1, text: `Step ${index + 1}`, targetType, targetId: `step-${index + 1}-go` }));
    return {
      id: `${seed}:boss:${area}:${encounter}:${difficulty}`,
      area, boss: true, kind: 'guardian', concept: 'multiple conditions', targetType: 'arena', currentStep: round,
      escapeSteps, completedOptionIds: escapeSteps.slice(0, round - 1).map(step => step.targetId),
      guardian: { name: 'Test boss', round, total: 3 },
      storyFlags: { bossMustNotChangeStory: true },
      options: targetTypes.flatMap((targetType, index) => ['go', 'miss', 'alt'].map((suffix, slot) => ({
        id: `step-${index + 1}-${suffix}`, step: index + 1, targetType, correct: round === index + 1 && slot === 0
      })))
    };
  },
  createScene({ seed, index, elapsed, area, storyState, difficulty }) {
    const step = storyState.areaSteps[area];
    const nextArea = step === 9 ? Object.keys(this.AREAS)[(Object.keys(this.AREAS).indexOf(area) + 1) % 4] : undefined;
    return {
      id: `${seed}:${index}:${area}:${step}:${elapsed}:${difficulty}`,
      area, title: 'Test room', chapter: 'Test chapter', prompt: 'Choose the matching door.', targetType: index<2?'door':'person',
      hint: 'Look at its symbol.', concept: 'conjunction', kind: step >= 6 && step <= 8 ? 'guardian' : 'reading',
      storyFlags: { chapterVisited: true },
      options: [
        { id: 'go', label: 'Correct', correct: true, route: 'safe', nextArea },
        { id: 'miss', label: 'Wrong', correct: false, route: 'safe' },
        { id: 'box', targetType: 'item', traits: { type: 'box' }, label: 'Chest', correct: true, route: 'risk', reward: 'chest', nextArea },
        { id: 'ward', label: 'Ward', correct: true, route: 'boon', boon: 'ward', nextArea }
      ]
    };
  }
};
function engineFor(testContent) {
  const isolated = new Module(enginePath, module);
  isolated.filename = enginePath;
  isolated.paths = module.paths;
  isolated.require = id => {
    if (id === './dungeon-learning.js') return require(id);
    assert.equal(id, './dungeon-content.js');
    return testContent;
  };
  isolated._compile(source, enginePath);
  return isolated;
}
const isolated = engineFor(fixture);
const { Run, penaltyForTarget, tierAt, INTENSITY_SECONDS } = isolated.exports;
let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`✓ ${name}\n`);
}

function playing(options, EngineRun = Run) {
  const run = new EngineRun(options);
  assert.equal(run.enterDungeon(), true);
  return run;
}

function advance(run, count = 1, option = 'go') {
  for (let i = 0; i < count; i += 1) {
    readyBoss(run);
    assert.equal(run.choose(run.boss && option === 'go' ? run.scene.escapeSteps[run.boss.round - 1].targetId : option).correct, true);
    assert.equal(run.finishTransition(), true);
  }
  return run;
}

function readyBoss(run) {
  if (run.boss && run.elapsed < run.boss.entranceEndsAt) run.tick(run.boss.entranceEndsAt - run.elapsed);
  return run;
}

function enterBoss(run) {
  run.tick(Math.max(0, run.nextBossAt - run.elapsed));
  advance(run);
  assert.ok(run.boss);
  return run;
}

function defeatBosses(run) {
  while (run.boss) advance(run);
  return run;
}

function priorSave(run, version, bankedCoins = 0) {
  const save = JSON.parse(run.serialize());
  return { ...save, version, coins: save.coins + bankedCoins, startingCoins: bankedCoins };
}

test('waiting, reloading or clicking at the entrance never starts the run or earns a clear', () => {
  let run = new Run({ seed: 'threshold', coins: 40 });
  assert.equal(run.phase, 'entrance');
  assert.equal(run.scene.kind, 'entrance');
  assert.deepEqual(run.scene.options, []);
  assert.equal(run.tick(7200), 0);
  assert.equal(run.choose('box'), null);
  assert.equal(run.finishTransition(), false);
  assert.equal(run.end(), false);
  const before = run.serialize();
  run = Run.restore(before);
  assert.equal(run.serialize(), before);
  assert.equal(run.enterDungeon(), true);
  assert.equal(run.enterDungeon(), false);
  assert.equal(run.phase, 'playing');
  assert.equal(run.completed, 0);
  assert.equal(run.nextBossIn, 180);
  assert.equal(run.coins, 0);
  run.tick(2.25);
  assert.equal(run.nextBossIn, 177.75);
  const resumed = Run.restore(run.serialize());
  assert.equal(resumed.scene.id, run.scene.id);
  assert.equal(resumed.elapsed, 2.25);
  assert.equal(resumed.enterDungeon(), false);
});

test('the entrance cannot restore with paid rewards, damage or running clocks', () => {
  const entrance = JSON.parse(new Run({ seed: 'ready' }).serialize());
  for (const changed of [{ version: 9 }, { startingCoins: 1 }, { hp: 2 }, { elapsed: 1 }, { bossDelaySeconds: 3 },
    { legacyLayout: true }, { attempts: 1 }]) {
    assert.equal(Run.restore({ ...entrance, ...changed }), null);
  }
});

test('penalty and intensity boundaries include 269/270/390/480 seconds', () => {
  assert.equal(INTENSITY_SECONDS, 480);
  assert.equal(isolated.exports.MAX_SECONDS, undefined);
  for (const seconds of [0, 179, 180, 269, 270, 389, 390, 479, 480]) {
    for (const type of ['door', 'feeding', 'floodgate', 'dispatch', 'console']) assert.equal(penaltyForTarget(type), 0);
    for(const type of ['person','ladder','item']) assert.equal(penaltyForTarget(type), 1);
    assert.equal(penaltyForTarget('bridge'), 'fatal');
    assert.equal(tierAt(seconds, 0), 'safe');
  }
  assert.equal(tierAt(179, 2), 'danger');
  assert.equal(tierAt(180, 2), 'deep');
  assert.equal(tierAt(269, 2), 'deep');
  assert.equal(tierAt(270, 2), 'fatal');
  assert.equal(tierAt(389, 2), 'fatal');
  assert.equal(tierAt(390, 2), 'pursuit');
  assert.equal(tierAt(480, 2), 'overrun');
  assert.equal(tierAt(900, 2), 'overrun');
});

test('all ordinary mistakes use the chosen hazard from first room through overrun', () => {
  for (const [elapsed,index] of [[0,0],[100,3],[470,4],[620,8]]) {
    for (const [type,penalty] of [['door',0],['person',1],['item',1],['ladder',1],['bridge','fatal']]) {
      const run=advance(playing({seed:'hazard-'+type}),index);
      run.tick(elapsed);
      run.scene.targetType=type;
      const result=run.choose('miss');
      assert.equal(result.penalty,penalty);
      assert.equal(result.damage,penalty==='fatal'?3:penalty);
      assert.equal(result.fatal,penalty==='fatal');
      assert.equal(run.hp,3-result.damage);
      assert.equal(run.records.at(-1).penalty,penalty);
      assert.equal(run.choose('miss'),null,'Resolving or ended choices cannot be repeated');
      if (type==='bridge') { assert.equal(run.phase,'ended');assert.equal(run.reason,'fatal'); }
    }
  }
});

test('every ordinary target adds three seconds only after a successful exit', () => {
  for (const type of ['door', 'person', 'item', 'bridge', 'ladder']) {
    const run = playing({ seed: 'clear-' + type });
    run.scene.targetType = type;
    run.tick(20);
    if(type!=='bridge'){run.choose('miss'); run.finishTransition();}
    assert.equal(run.bossDelaySeconds, 0);
    assert.equal(run.nextBossAt, 180);
    run.choose('go');
    assert.equal(run.bossDelaySeconds, 0, 'Choosing is not a completed scene');
    assert.equal(run.nextBossIn, 160);
    run.finishTransition();
    assert.equal(run.bossDelaySeconds, 3);
    assert.equal(run.nextBossAt, 183);
    assert.equal(run.nextBossIn, 163);
    assert.equal(run.finishTransition(), false);
    assert.equal(run.bossDelaySeconds, 3);
    assert.ok(Run.restore(run.serialize()));
  }
});

test('a countdown expired at 180 remains latched across retries and exit credit for every ordinary target', () => {
  for (const type of ['door', 'person', 'item', 'bridge', 'ladder']) {
    const run = playing({ seed: 'due-' + type });
    run.scene.targetType = type;
    run.tick(179.9);
    assert.equal(run.bossDueAt, null);
    run.tick(0.1);
    assert.equal(run.bossDueAt, 180);
    assert.equal(run.nextBossIn, 0);
    const ordinary = run.scene.id;
    if(type!=='bridge'){run.choose('miss'); run.finishTransition();}
    assert.equal(run.scene.id, ordinary);
    assert.equal(run.boss, null);
    run.choose('go'); run.tick(0.5);
    assert.equal(run.boss, null);
    run.finishTransition();
    assert.equal(run.boss.encounter, 1);
    assert.equal(run.boss.scheduledAt, 180);
    assert.equal(run.boss.enteredAt, 180.5);
    assert.equal(run.bossDelaySeconds, 3);
    assert.equal(run.nextBossAt, 183);
    assert.equal(run.bossDueAt, null);
  }
});

test('an early clear delays arrival, while expiry during successful movement is not rescued by its bonus', () => {
  const early = playing({ seed: 'early-clear' });
  early.tick(179.9); advance(early);
  assert.equal(early.nextBossAt, 183);
  early.tick(0.1);
  assert.equal(early.bossDueAt, null);
  assert.equal(early.nextBossIn, 3);
  early.tick(3);
  assert.equal(early.bossDueAt, 183);
  const during = playing({ seed: 'movement-expiry' });
  during.tick(179.9); during.choose('box'); during.tick(0.1);
  assert.equal(during.bossDueAt, 180);
  const restored = Run.restore(during.serialize());
  assert.ok(restored);
  assert.equal(restored.boss.scheduledAt, 180);
  assert.equal(restored.coins, 1);
  assert.equal(restored.bossDelaySeconds, 3);
  assert.equal(restored.nextBossAt, 183);
  const again = Run.restore(restored.serialize());
  assert.equal(again.bossDelaySeconds, 3);
  assert.equal(again.coins, 1);
});

test('one persistent arena retains all nine targets and only full escape restarts the three-minute clock', () => {
  const run = readyBoss(enterBoss(playing({ seed: 'persistent-arena' })));
  const arena = run.scene.id, plan = JSON.stringify(run.scene.escapeSteps);
  const targets = run.scene.options.map(option => ({ id: option.id, step: option.step, targetType: option.targetType }));
  const readingEnd = run.boss.readingEndsAt;
  assert.equal(run.bossDelaySeconds, 3);
  for (let step = 1; step <= 3; step += 1) {
    assert.equal(run.boss.round, step);
    assert.equal(run.scene.currentStep, step);
    assert.equal(run.scene.id, arena);
    assert.equal(JSON.stringify(run.scene.escapeSteps), plan);
    assert.deepEqual(run.scene.options.map(option => ({ id: option.id, step: option.step, targetType: option.targetType })), targets);
    assert.equal(run.scene.options.filter(option => option.correct).length, 1);
    assert.equal(run.boss.readingEndsAt, readingEnd);
    assert.equal(run.bossDelaySeconds, 3);
    run.choose('step-' + step + '-go');
    assert.equal(run.bossDelaySeconds, 3);
    run.finishTransition();
  }
  assert.equal(run.boss, null);
  assert.equal(run.bossProjectile, null);
  assert.equal(run.bossDelaySeconds, 0);
  assert.equal(run.nextBossAt, run.elapsed+180);
  assert.equal(run.finishTransition(), false);
  const again = Run.restore(run.serialize());
  assert.equal(again.bossDelaySeconds, 0);
  assert.equal(again.index, 1);
  assert.equal(again.completed, 1);
  assert.equal(again.hp, 3);
  assert.deepEqual(run.records.filter(record => record.boss).map(record => record.round), [1, 2, 3]);
});

test('entrance and reading grace lead into exactly two seconds of flight and five seconds of cooldown', () => {
  const run = enterBoss(playing({ seed: 'projectile-clock' }));
  assert.equal(run.boss.enteredAt, 180);
  assert.equal(run.boss.entranceEndsAt, 181.1);
  assert.equal(run.boss.readingEndsAt, 189.1);
  assert.equal(run.choose('step-1-go'), null);
  readyBoss(run);
  assert.equal(run.bossProjectile.remaining, 8);
  run.tick(8);
  assert.deepEqual(run.bossProjectile, { phase: 'flight', progress: 0, remaining: 2, cycle: 1 });
  run.tick(1.999);
  assert.equal(run.hp, 3);
  run.tick(0.001);
  assert.equal(run.hp, 2);
  assert.equal(run.phase, 'playing');
  assert.equal(run.lastImpact.damage, 1);
  assert.equal(run.lastImpact.fatal, false);
  assert.equal(run.lastImpact.elapsed, 191.1);
  assert.deepEqual(run.bossProjectile, { phase: 'cooldown', progress: 0, remaining: 5, cycle: 1 });
  run.tick(4.999);
  assert.equal(run.bossProjectile.phase, 'cooldown');
  run.tick(0.001);
  assert.deepEqual(run.bossProjectile, { phase: 'flight', progress: 0, remaining: 2, cycle: 2 });
});

test('wrong boss doors are safe, wrong people and items cost one without advancing or granting time', () => {
  const ids = readyBoss(enterBoss(playing({ seed: 'wrong-options' }))).scene.options.filter(option => !option.correct).map(option => option.id);
  for (const id of ids) {
    const run = readyBoss(enterBoss(playing({ seed: 'wrong-' + id })));
    run.tick(8.25);
    const readingEnd = run.boss.readingEndsAt;
    const result = run.choose(id);
    assert.equal(result.correct, false);
    const damage=id.startsWith('step-3-')?0:1;
    assert.equal(result.damage, damage);assert.equal(result.penalty, damage);
    assert.equal(run.hp, 3-damage);
    run.tick(0.25);
    assert.equal(run.lastResult, result);
    assert.equal(run.bossProjectile.progress, 0.25);
    run.finishTransition();
    assert.equal(run.boss.round, 1);
    assert.equal(run.boss.readingEndsAt, readingEnd);
    assert.equal(run.boss.exitUnlocked, false);
    assert.equal(run.bossDelaySeconds, 3);
    assert.equal(run.nextBossAt, 183);
    assert.equal(run.hp, 3-damage);
  }
  const prior = readyBoss(enterBoss(playing({ seed: 'completed-target' })));
  assert.equal(prior.choose('step-1-go').damage, 0);
  assert.equal(prior.hp, 3);
  prior.finishTransition();
  assert.equal(prior.choose('step-1-go').damage, 1);
  prior.finishTransition();
  assert.equal(prior.boss.round, 2);
  assert.equal(prior.hp, 2);
  prior.scene.options.find(option => option.id === 'step-3-go').correct = true;
  const guarded = prior.choose('step-3-go');
  assert.equal(guarded.correct, false, 'A locked exit cannot bypass order even if an option is marked correct');
  assert.equal(guarded.damage, 0);
  assert.equal(prior.hp, 2);
});

test('a third wrong boss choice ends the run without healing, advancing, or granting escape credit', () => {
  const run = readyBoss(enterBoss(playing({ seed: 'wrong-exhaustion' })));
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = run.choose('step-2-go');
    assert.equal(result.damage, 1);
    assert.equal(result.correct, false);
    assert.equal(run.hp, 3 - attempt);
    assert.equal(run.choose('step-2-go'), null, 'Double-clicks cannot repeat the injury');
    if (attempt < 3) run.finishTransition();
  }
  assert.equal(run.reason, 'hearts');
  assert.equal(run.phase, 'ended');
  assert.equal(run.boss.round, 1);
  assert.equal(run.finishTransition(), false);
  assert.equal(run.bossDelaySeconds, 3);
  assert.equal(run.coins, 0);
  assert.equal(Run.restore(run.serialize()).hp, 0);
});

test('a correct ally choice grants no protection and a hit during movement takes exactly one heart', () => {
  const run = readyBoss(enterBoss(playing({ seed: 'no-ally-buff' })));
  run.tick(9.5);
  const result = run.choose('step-1-go');
  assert.equal(run.boss.stepWard, undefined);
  assert.equal(run.boss.stepWardGranted, undefined);
  run.tick(0.5);
  assert.equal(run.lastImpact.damage, 1);
  assert.equal(run.lastImpact.stepWardBlocked, false);
  assert.equal(run.hp, 2);
  assert.equal(run.lastResult, result);
  assert.equal(run.phase, 'resolving');
  run.finishTransition();
  assert.equal(run.boss.round, 2);
  assert.equal(run.bossDelaySeconds, 3);
  assert.equal(run.choose('step-1-go').correct, false);
  run.finishTransition(); advance(run);
  assert.equal(run.boss.exitUnlocked, true);
  assert.deepEqual(run.boss.completedSteps, [1, 2]);
});

test('the app collision callback consumes a missed shot during movement without injury, then a hit costs one heart', () => {
  const run = readyBoss(enterBoss(playing({ seed: 'collision-result' })));
  const firstImpactAt = run.boss.projectileStartedAt + 2;
  run.tick(firstImpactAt - run.elapsed - 0.1);
  const choice = run.choose('step-1-go');
  const tested = [];
  run.tick(0.1, shot => { tested.push(shot); return false; });
  assert.deepEqual(tested, [{ elapsed: firstImpactAt, encounter: 1, cycle: 1 }]);
  assert.equal(run.lastImpact.dodged, true);
  assert.equal(run.lastImpact.damage, 0);
  assert.equal(run.lastImpact.hpAfter, 3);
  assert.equal(run.lastResult, choice);
  assert.equal(run.phase, 'resolving');
  assert.equal(run.hp, 3);
  assert.equal(run.boss.impactsResolved, 1);
  assert.equal(run.bossProjectile.phase, 'cooldown');
  run.finishTransition();
  run.tick(7, shot => { tested.push(shot); return true; });
  assert.equal(run.lastImpact.dodged, false);
  assert.equal(run.lastImpact.damage, 1);
  assert.equal(run.hp, 2);
  assert.equal(run.impactSerial, 2);
  assert.deepEqual(tested[1], { elapsed: firstImpactAt + 7, encounter: 1, cycle: 2 });
});

test('large ticks evaluate every crossed shot independently and retain misses alongside actual hits', () => {
  const run = readyBoss(enterBoss(playing({ seed: 'mixed-collisions' })));
  const result = run.choose('step-1-go');
  const calls = [];
  run.tick(30, shot => { calls.push(shot.cycle); return shot.cycle % 2 === 0; });
  assert.deepEqual(calls, [1, 2, 3]);
  assert.deepEqual(run.getBossImpacts().map(hit => hit.dodged), [true, false, true]);
  assert.deepEqual(run.getBossImpacts().map(hit => hit.damage), [0, 1, 0]);
  assert.equal(run.hp, 2);
  assert.equal(run.lastResult, result);
  assert.equal(run.boss.round, 1);
  assert.equal(run.bossDelaySeconds, 3);
  assert.equal(run.records.filter(record => record.boss).length, 1, 'Shots do not become reading answers');
  run.finishTransition();
  assert.equal(run.boss.round, 2);
});

test('dodged impacts and phase progress survive reload without replaying or damaging the player', () => {
  const run = readyBoss(enterBoss(playing({ seed: 'miss-reload' })));
  run.tick(run.boss.projectileStartedAt + 2.5 - run.elapsed, () => false);
  const projectile = run.bossProjectile;
  const impact = run.lastImpact;
  let restored = Run.restore(run.serialize());
  for (let reload = 0; reload < 3; reload += 1) {
    assert.ok(restored);
    assert.equal(restored.hp, 3);
    assert.equal(restored.impactSerial, 1);
    assert.deepEqual(restored.lastImpact, impact);
    assert.deepEqual(restored.bossProjectile, projectile);
    restored = Run.restore(restored.serialize());
  }
  restored.tick(4.5, () => { throw new Error('Cooldown must not retest the resolved miss'); });
  assert.equal(restored.bossProjectile.phase, 'flight');
  restored.tick(2, () => false);
  assert.equal(restored.impactSerial, 2);
  assert.equal(restored.hp, 3);
});

test('restoring an unobserved overdue shot consumes it as a miss rather than inventing a collision', () => {
  const run = readyBoss(enterBoss(playing({ seed: 'unknown-collision' })));
  const saved = JSON.parse(run.serialize());
  saved.elapsed = saved.boss.projectileStartedAt + 9;
  const restored = Run.restore(saved);
  assert.ok(restored);
  assert.equal(restored.hp, 3);
  assert.equal(restored.impactSerial, 2);
  assert.deepEqual(restored.getBossImpacts().map(hit => hit.dodged), [true, true]);
  assert.deepEqual(restored.getBossImpacts().map(hit => hit.damage), [0, 0]);
  const again = Run.restore(restored.serialize());
  assert.equal(again.impactSerial, 2);
  assert.equal(again.hp, 3);
});

test('v7 impact saves reject missing dodge evidence or a dodged shot that also claims injury', () => {
  const run = readyBoss(enterBoss(playing({ seed: 'dodge-validation' })));
  run.tick(run.boss.projectileStartedAt + 2 - run.elapsed, () => false);
  for (const mutation of ['missing', 'injury', 'fatal']) {
    const saved = JSON.parse(run.serialize());
    for (const impact of [saved.lastImpact, ...saved.impacts]) {
      if (mutation === 'missing') delete impact.dodged;
      if (mutation === 'injury') impact.damage = 1;
      if (mutation === 'fatal') impact.fatal = true;
    }
    assert.equal(Run.restore(saved), null);
  }
});

test('long sequences of dodges retain a bounded event queue and never repeat old cycles', () => {
  const run = readyBoss(enterBoss(playing({ seed: 'many-dodges' })));
  run.tick(run.boss.projectileStartedAt + 2 + 199 * 7 - run.elapsed, () => false);
  assert.equal(run.hp, 3);
  assert.equal(run.impactSerial, 200);
  assert.equal(run.boss.impactsResolved, 200);
  assert.equal(run.getBossImpacts().length, 128);
  assert.equal(run.getBossImpacts()[0].cycle, 73);
  const restored = Run.restore(run.serialize());
  assert.ok(restored);
  assert.equal(restored.impactSerial, 200);
  assert.equal(restored.hp, 3);
});

test('every encounter including overrun takes one heart per impact and ends only on the third hit', () => {
  for (const encounter of [1, 2, 3, 5]) {
    const run = playing({ seed: 'one-heart-' + encounter });
    for (let i = 1; i <= encounter; i += 1) { enterBoss(run); if (i < encounter) defeatBosses(run); }
    readyBoss(run);
    assert.equal(run.lockedPenalty, 1);
    assert.deepEqual(run.boss.pacing, { overrun: encounter >= 3, readingSeconds: encounter >= 3 ? 6 : 8, flightSeconds: 2, cooldownSeconds: 5 });
    advance(run);
    run.tick(run.boss.projectileStartedAt + 2 - run.elapsed);
    assert.equal(run.hp, 2);
    assert.equal(run.lastImpact.fatal, false);
    run.tick(7);
    assert.equal(run.hp, 1);
    assert.equal(run.phase, 'playing');
    run.tick(7);
    assert.equal(run.hp, 0);
    assert.equal(run.reason, 'hearts');
    assert.deepEqual(run.getBossImpacts().map(impact => impact.damage), [1, 1, 1]);
    assert.ok(run.getBossImpacts().every(impact => !impact.wardBlocked && !impact.stepWardBlocked && !impact.fatal));
    assert.equal(Run.restore(run.serialize()).reason, 'hearts');
  }
});

test('large ticks retain all three impacts and death cancels pending progress without granting time', () => {
  const run = readyBoss(enterBoss(playing({ seed: 'large-tick' })));
  const result = run.choose('step-1-go');
  run.tick(100);
  assert.equal(run.phase, 'ended');
  assert.equal(run.lastResult, result);
  assert.equal(run.hp, 0);
  assert.equal(run.impactSerial, 3);
  assert.deepEqual(run.getBossImpacts().map(impact => impact.cycle), [1, 2, 3]);
  assert.deepEqual(run.getBossImpacts().map(impact => impact.damage), [1, 1, 1]);
  assert.equal(run.getBossImpacts(1).length, 2);
  const detached = run.getBossImpacts(); detached[0].damage = 99;
  assert.equal(run.getBossImpacts()[0].damage, 1);
  assert.equal(run.finishTransition(), false);
  assert.equal(run.boss.round, 1);
  assert.equal(run.bossDelaySeconds, 3);
});

test('a lethal impact during final escape prevents both escape and the new boss interval', () => {
  const run = readyBoss(enterBoss(playing({ seed: 'escape-hit' })));
  advance(run, 2);
  run.tick(run.boss.projectileStartedAt + 9 - run.elapsed);
  assert.equal(run.hp, 1);
  run.tick(6.9);
  assert.equal(run.choose('step-3-go').correct, true);
  run.tick(0.1);
  assert.equal(run.phase, 'ended');
  assert.equal(run.reason, 'hearts');
  assert.equal(run.boss.round, 3);
  assert.equal(run.finishTransition(), false);
  assert.equal(run.bossDelaySeconds, 3);
  assert.equal(run.completed, 1);
});

test('all three steps can finish within initial reading grace and escape cancels future projectiles', () => {
  const run = readyBoss(enterBoss(playing({ seed: 'grace-escape' })));
  const readingEnd = run.boss.readingEndsAt;
  for (let step = 1; step <= 3; step += 1) {
    run.choose('step-' + step + '-go'); run.tick(step === 3 ? 1 : 0.68); run.finishTransition();
  }
  assert.ok(run.elapsed < readingEnd);
  assert.equal(run.boss, null);
  run.tick(30);
  assert.equal(run.impactSerial, 0);
  assert.equal(run.hp, 3);
  assert.equal(run.bossDelaySeconds, 0);
});

test('long reading and a long fight never queue a second boss before the new three-minute interval', () => {
  let run = playing({seed:'long-fight'});
  run.tick(400.25); advance(run); readyBoss(run);
  assert.equal(run.boss.scheduledAt,180);
  run.tick(201.625,()=>false);
  assert.equal(run.bossDueAt,null);
  run=Run.restore(run.serialize()); assert.ok(run);
  defeatBosses(run);
  const escape=run.elapsed;
  assert.equal(run.bossDelaySeconds,0); assert.equal(run.bossDueAt,null);
  assert.equal(run.nextBossAt,escape+180); assert.equal(run.nextBossIn,180);
  run=Run.restore(run.serialize()); assert.ok(run);
  advance(run); assert.equal(run.boss,null); assert.equal(run.nextBossIn,183);
  run.tick(182.9); assert.equal(run.bossDueAt,null);
  run.tick(.11); advance(run); assert.equal(run.boss.scheduledAt,escape+183);
});

test('pending arena escape restores exactly once with a fresh three-minute interval and no duplicate coin or heart change', () => {
  const run = readyBoss(enterBoss(playing({ seed: 'escape-reload' })));
  advance(run, 2); run.choose('step-3-go');
  assert.equal(run.bossDelaySeconds, 3);
  const restored = Run.restore(run.serialize());
  assert.ok(restored);
  assert.equal(restored.boss, null);
  assert.equal(restored.bossDelaySeconds, 0);
  assert.equal(restored.nextBossAt, restored.elapsed+180);
  assert.equal(restored.hp, 3);
  assert.equal(restored.coins, 0);
  const again = Run.restore(restored.serialize());
  assert.equal(again.bossDelaySeconds, 0);
  assert.equal(again.finishTransition(), false);
});

test('reload preserves active projectile fraction and historical impacts without reapplying damage', () => {
  let run = readyBoss(enterBoss(playing({ seed: 'reload-flight' })));
  advance(run);
  run.tick(run.boss.projectileStartedAt + 7.5 - run.elapsed);
  assert.equal(run.hp, 2);
  const saved = { projectile: run.bossProjectile, impacts: run.getBossImpacts(), due: run.boss.projectileStartedAt };
  run = Run.restore(run.serialize());
  assert.ok(run);
  assert.deepEqual(run.bossProjectile, saved.projectile);
  assert.deepEqual(run.getBossImpacts(), saved.impacts);
  assert.equal(run.boss.projectileStartedAt, saved.due);
  assert.equal(run.hp, 2);
  run.tick(1.5);
  assert.equal(run.hp, 1);
  assert.equal(run.impactSerial, 2);
});

test('480 raises reading intensity without ending the run or changing the universal two/five projectile pace', () => {
  const run = advance(playing({ seed: 'overrun' }), 2);
  run.tick(471); advance(run); readyBoss(run); advance(run);
  const pacing = run.boss.pacing;
  assert.deepEqual(pacing, { overrun: false, readingSeconds: 8, flightSeconds: 2, cooldownSeconds: 5 });
  run.tick(480 - run.elapsed);
  assert.equal(run.phase, 'playing');
  assert.equal(run.pacing.overrun, true);
  assert.equal(run.pacing.readingSeconds, 6);
  assert.equal(run.pacing.flightSeconds, 2);
  assert.equal(run.pacing.cooldownSeconds, 5);
  assert.equal(run.boss.pacing, pacing);
  const restored = Run.restore(run.serialize());
  assert.ok(restored); defeatBosses(restored);
  assert.equal(restored.lockedTier, 'overrun');
  assert.equal(restored.lockedPenalty,1);
  const ordinary = playing({ seed: 'no-cap' }); ordinary.tick(600);
  assert.equal(ordinary.phase, 'playing'); assert.equal(ordinary.reason, null);
});

test('unlimited bosses each start a new interval and never bank the last interval’s credits', () => {
  let run = playing({ seed: 'many-bosses' });
  for (let encounter = 1; encounter <= 6; encounter += 1) {
    const due = run.nextBossAt;
    enterBoss(run);
    assert.equal(run.boss.encounter, encounter);
    assert.equal(run.boss.scheduledAt, due);
    assert.equal(run.bossDelaySeconds, 3);
    assert.equal(run.nextBossAt, due+3);
    run = Run.restore(run.serialize()); assert.ok(run); defeatBosses(run);
    assert.equal(run.bossDelaySeconds, 0); assert.equal(run.nextBossIn,180);
  }
  assert.equal(run.index, 6);
  assert.ok(run.elapsed > 1080);
  assert.equal(run.hp, 3);
});

function oldBossSave({ version = 5, phase = 'flight', fraction = 0.5, overrun = false, pending = false } = {}) {
  const run = playing({ seed: 'pre-v6-' + version + phase + overrun });
  if (overrun) run.tick(540);
  enterBoss(run); readyBoss(run);
  if (pending) run.choose('step-1-go'); else advance(run);
  const old = priorSave(run, version, 27);
  delete old.bossDelaySeconds; delete old.bossDueAt;
  old.nextBossAt = (old.encounters + 1) * 180;
  old.lockedPenalty = 2;
  old.boss.scheduledAt = 180;
  old.boss.pacing = { overrun, readingSeconds: overrun ? 6 : 8, flightSeconds: 5, cooldownSeconds: overrun ? 1.5 : 2 };
  delete old.boss.projectileStartedAt;
  old.boss.stepWardGranted = true; old.boss.stepWard = true;
  old.boss.plan[0].text = 'Old ally protection';
  old.elapsed = phase === 'reading' ? old.boss.readingEndsAt - 2 : old.boss.readingEndsAt +
    (phase === 'flight' ? fraction * 5 : 5 + fraction * old.boss.pacing.cooldownSeconds);
  if (phase === 'cooldown') {
    old.boss.impactsResolved = 1; old.impactSerial = 1;
    old.lastImpact = { serial: 1, sceneId: old.sceneId, encounter: 1, round: old.boss.round, cycle: 1,
      elapsed: old.boss.readingEndsAt + 5, damage: 0, wardBlocked: false, stepWardBlocked: true, fatal: false, hpAfter: 3 };
    old.impacts = [{ ...old.lastImpact }];
    old.boss.stepWard = false;
  }
  if (version === 4) delete old.boss.pacing;
  return old;
}

test('v6 active saves preserve bonus deadlines, due latches, plans and projectile clocks exactly', () => {
  const run = advance(playing({ seed: 'v6-clock' }), 2);
  enterBoss(run); readyBoss(run); advance(run);
  run.tick(run.boss.projectileStartedAt + 7.5 - run.elapsed);
  const old = priorSave(run, 6, 31);old.nextBossAt=(old.encounters+1)*180+old.bossDelaySeconds;
  delete old.lastImpact.dodged;
  old.impacts.forEach(hit => delete hit.dodged);
  const restored = Run.restore(old);
  assert.ok(restored);
  assert.equal(restored.hp, 2);
  assert.equal(restored.coins, 0);
  assert.equal(restored.bossDelaySeconds, 9);
  assert.equal(restored.nextBossAt, run.nextBossAt);
  assert.equal(restored.bossDueAt, run.bossDueAt);
  assert.equal(restored.boss.projectileStartedAt, run.boss.projectileStartedAt);
  assert.equal(restored.boss.readingEndsAt, run.boss.readingEndsAt);
  assert.deepEqual(restored.bossProjectile, run.bossProjectile);
  assert.deepEqual(restored.boss.pacing, run.boss.pacing);
  assert.deepEqual(restored.boss.plan, run.boss.plan);
  assert.equal(restored.lastImpact.dodged, false);
  assert.equal(restored.impactSerial, 1);
  const again = Run.restore(restored.serialize());
  assert.equal(again.hp, 2);
  assert.equal(again.bossDelaySeconds, 9);
  assert.equal(JSON.parse(again.serialize()).version, isolated.exports.VERSION);
  const queued = playing({ seed: 'v6-due' }); queued.tick(180);
  const oldQueued = priorSave(queued, 6);
  const pending = Run.restore(oldQueued);
  assert.equal(pending.bossDueAt, 180);
  assert.equal(pending.nextBossIn, 0);
  advance(pending);
  assert.equal(pending.boss.scheduledAt, 180);
  assert.equal(pending.bossDelaySeconds, 3);
});

test('a v6 wrong choice already committed without injury settles once without retroactive damage', () => {
  const run = readyBoss(enterBoss(playing({ seed: 'v6-wrong' })));
  run.choose('step-2-go');
  const old = priorSave(run, 6);old.nextBossAt=(old.encounters+1)*180+old.bossDelaySeconds;
  old.hp = 3; old.lastResult.damage = 0;
  const restored = Run.restore(old);
  assert.ok(restored);
  assert.equal(restored.phase, 'playing');
  assert.equal(restored.hp, 3);
  assert.equal(restored.boss.round, 1);
  assert.equal(restored.bossDelaySeconds, 3);
  assert.equal(restored.choose('step-2-go').damage, 1);
  assert.equal(restored.hp, 2);
});

test('v7 ordinary deadlines, queued doors and older active fights migrate without importing a queued second boss', () => {
  const run=playing({seed:'r7'});run.tick(190.25);
  const ordinary=priorSave(run,7,18);delete ordinary.bossCountdownFrom;
  const next=Run.restore(ordinary);assert.ok(next);assert.equal(next.bossDueAt,180);advance(next);
  const inside=priorSave(next,7,18);delete inside.bossCountdownFrom;
  inside.elapsed=555;inside.nextBossAt=363;inside.bossDueAt=363;
  const oldArena=Run.restore(inside);assert.ok(oldArena);assert.equal(oldArena.bossDueAt,null);
  assert.equal(oldArena.hp,3);defeatBosses(oldArena);assert.equal(oldArena.nextBossIn,180);
  assert.equal(oldArena.bossCountdownFrom,555);assert.equal(oldArena.coins,0);
});

test('v4 and v5 flight migrations preserve phase fraction without an immediate impact or clock restart', () => {
  for (const version of [4, 5]) for (const fraction of [0, 0.25, 0.9]) {
    const old = oldBossSave({ version, fraction });
    const restored = Run.restore(old);
    assert.ok(restored);
    assert.equal(restored.elapsed, old.elapsed);
    assert.equal(restored.hp, 3);
    assert.equal(restored.coins, 0);
    assert.equal(restored.boss.round, 2);
    assert.equal(restored.bossDelaySeconds, 0);
    assert.equal(restored.nextBossAt, 180);
    assert.equal(restored.bossProjectile.phase, 'flight');
    assert.ok(Math.abs(restored.bossProjectile.progress - fraction) < 1e-9);
    assert.ok(Math.abs(restored.bossProjectile.remaining - (1 - fraction) * 2) < 1e-9);
    assert.equal(restored.impactSerial, 0);
    assert.equal(restored.boss.stepWard, undefined);
    restored.tick(restored.bossProjectile.remaining);
    assert.equal(restored.hp, 2);
    assert.equal(restored.lastImpact.damage, 1);
    assert.equal(restored.lastImpact.stepWardBlocked, false);
    const again = Run.restore(restored.serialize());
    assert.ok(again);
    assert.equal(again.impactSerial, 1);
    assert.equal(again.hp, 2);
  }
});

test('legacy cooldowns retain historical blocked hits and scale their remaining fraction to five seconds', () => {
  for (const version of [4, 5]) for (const overrun of [false, true]) for (const fraction of [0, 0.4, 0.99]) {
    const old = oldBossSave({ version, phase: 'cooldown', fraction, overrun });
    const restored = Run.restore(old);
    assert.ok(restored);
    assert.equal(restored.bossProjectile.phase, 'cooldown');
    assert.ok(Math.abs(restored.bossProjectile.progress - fraction) < 1e-9);
    assert.ok(Math.abs(restored.bossProjectile.remaining - (1 - fraction) * 5) < 1e-9);
    assert.equal(restored.hp, 3);
    assert.equal(restored.lastImpact.stepWardBlocked, true);
    assert.deepEqual(restored.getBossImpacts(), old.impacts.map(hit => ({ ...hit, dodged: false })));
    restored.tick(restored.bossProjectile.remaining);
    assert.equal(restored.bossProjectile.phase, 'flight');
    assert.equal(restored.bossProjectile.cycle, 2);
    restored.tick(2);
    assert.equal(restored.hp, 2);
    assert.equal(restored.lastImpact.stepWardBlocked, false);
    assert.equal(restored.lastImpact.damage, 1);
  }
});

test('a pre-v6 second flight keeps its old two-heart injury and resolves only the next one-heart impact', () => {
  const old = oldBossSave({ fraction: 0.5, overrun: true });
  old.elapsed += 6.5;
  old.hp = 1; old.boss.stepWard = false; old.boss.impactsResolved = 1; old.impactSerial = 1;
  old.lastImpact = { serial: 1, sceneId: old.sceneId, encounter: 1, round: old.boss.round, cycle: 1,
    elapsed: old.boss.readingEndsAt + 5, damage: 2, wardBlocked: false, stepWardBlocked: false, fatal: false, hpAfter: 1 };
  old.impacts = [{ ...old.lastImpact }];
  const restored = Run.restore(old);
  assert.ok(restored);
  assert.equal(restored.hp, 1);
  assert.equal(restored.impactSerial, 1);
  assert.deepEqual(restored.bossProjectile, { phase: 'flight', progress: 0.5, remaining: 1, cycle: 2 });
  assert.equal(restored.getBossImpacts()[0].damage, 2, 'Past damage is preserved as historical evidence');
  const again = Run.restore(restored.serialize());
  assert.equal(again.hp, 1);
  again.tick(0.999);
  assert.equal(again.hp, 1);
  again.tick(0.001);
  assert.equal(again.hp, 0);
  assert.equal(again.reason, 'hearts');
  assert.equal(again.lastImpact.damage, 1);
  assert.equal(again.impactSerial, 2);
});

test('legacy reading grace and pending step progress survive migration without creating credits or protection', () => {
  const old = oldBossSave({ phase: 'reading', pending: true });
  const restored = Run.restore(old);
  assert.ok(restored);
  assert.equal(restored.boss.round, 2);
  assert.equal(restored.bossProjectile.phase, 'reading');
  assert.equal(restored.bossProjectile.remaining, 2);
  assert.equal(restored.boss.readingEndsAt, old.boss.readingEndsAt);
  assert.equal(restored.bossDelaySeconds, 0);
  assert.equal(restored.boss.stepWard, undefined);
  assert.equal(restored.boss.stepWardGranted, undefined);
  assert.deepEqual(restored.boss.plan, restored.scene.escapeSteps);
  const again = Run.restore(restored.serialize());
  assert.equal(again.boss.round, 2);
  assert.equal(again.bossDelaySeconds, 0);
  assert.equal(again.coins, 0);
});

test('v1 through v5 pending ordinary saves keep funds and receive exactly one new clear credit', () => {
  for (const version of [1, 2, 3, 4, 5]) {
    const run = playing({ seed: 'ordinary-migrate-' + version });
    run.tick(180); run.choose('box');
    const old = priorSave(run, version, 40);
    old.coins = 45;
    old.lastResult.coinsEarned = 5;
    delete old.bossDelaySeconds; delete old.bossDueAt;
    old.boons = ['ward', 'treasure']; old.wardUsed = false; old.manualHintUsed = true;
    const restored = Run.restore(old);
    assert.ok(restored);
    assert.equal(restored.coins, 5);
    assert.equal(restored.hp, 3);
    assert.equal(restored.index, 1);
    assert.equal(restored.boss.scheduledAt, 180);
    assert.equal(restored.bossDelaySeconds, 3);
    assert.equal(restored.nextBossAt, 183);
    const again = Run.restore(restored.serialize());
    assert.equal(again.bossDelaySeconds, 3);
    assert.equal(again.coins, 5);
    assert.equal(again.boons, undefined);
  }
});

test('v2 suspended and v3 active fights keep round health and funds while starting one new reading grace', () => {
  const normal = advance(playing({ seed: 'legacy-two' }), 2);
  normal.choose('miss'); normal.finishTransition();
  const ordinary = JSON.parse(normal.serialize());
  const old = priorSave(readyBoss(enterBoss(normal)), 2, 42);
  old.index = ordinary.index; old.completed = ordinary.completed; old.storyState = ordinary.storyState;
  old.boss = { encounter: 1, round: 2, total: 3, scheduledAt: 180 }; old.sceneId = 'old-boss'; old.lockedPenalty = 2;
  old.suspended = { scene: fixture.createScene({ seed: ordinary.seed, index: ordinary.index, elapsed: ordinary.sceneEnteredAt,
    area: ordinary.area, storyState: ordinary.storyState, difficulty: ordinary.lockedTier }), sceneEnteredAt: ordinary.sceneEnteredAt,
    lockedPenalty: ordinary.lockedPenalty, lockedTier: ordinary.lockedTier, attempts: ordinary.attempts,
    hintShown: ordinary.hintShown };
  const restored = Run.restore(old);
  assert.ok(restored);
  assert.equal(restored.hp, 2); assert.equal(restored.coins, 0); assert.equal(restored.boss.round, 2);
  assert.ok(Math.abs(restored.bossProjectile.remaining - 9.1) < 1e-9);
  defeatBosses(restored);
  assert.equal(restored.index, 2); assert.equal(restored.scene.id, ordinary.sceneId); assert.equal(restored.attempts, 1);
  assert.equal(restored.bossDelaySeconds, 0);
  const three = oldBossSave(); three.version = 3; three.hp = 2; three.elapsed = 250; three.sceneEnteredAt = 245;
  three.boss = { encounter: 1, round: 3, total: 3, scheduledAt: 180, enteredAt: 180, entranceEndsAt: 181.1,
    resume: 'next', attackReadyAt: 245, attackAt: 263 }; three.sceneId = 'v3-round3';
  const migrated = Run.restore(three);
  assert.ok(migrated);
  assert.equal(migrated.boss.round, 3); assert.equal(migrated.hp, 2); assert.equal(migrated.boss.exitUnlocked, true);
  assert.equal(migrated.boss.readingEndsAt, 259.1);
});

test('legacy timeout movement resumes past 480 once with a clear bonus and no duplicate chest reward', () => {
  const run = playing({ seed: 'legacy-timeout' });
  run.tick(479.5); run.choose('box');
  const old = priorSave(run, 4, 40); old.elapsed = 480;
  old.coins = 45;
  old.lastResult.coinsEarned = 5;
  old.phase = 'ended'; old.reason = 'timeout'; old.pending = null;
  const restored = Run.restore(old);
  assert.ok(restored);
  assert.equal(restored.reason, null); assert.equal(restored.elapsed, 480); assert.equal(restored.coins, 5);
  assert.equal(restored.boss.encounter, 1); assert.equal(restored.boss.pacing.overrun, true);
  assert.equal(restored.bossDelaySeconds, 3); assert.equal(restored.nextBossAt, 183);
  const again = Run.restore(restored.serialize());
  assert.equal(again.bossDelaySeconds, 3); assert.equal(again.coins, 5);
});

test('malformed delay totals, due latches, arena order, projectile history and plans are rejected', () => {
  const initial = JSON.parse(playing({ seed: 'schedule-validation' }).serialize());
  for (const change of [
    { bossDelaySeconds: -3 }, { bossDelaySeconds: 2 }, { bossDelaySeconds: 3, nextBossAt: 183 },
    { nextBossAt: 183 }, { bossDueAt: 180 }, { elapsed: 180 }, { bossDueAt: 179, elapsed: 180 }
  ]) assert.equal(Run.restore({ ...initial, ...change }), null);
  const run = enterBoss(playing({ seed: 'arena-validation' }));
  const saved = JSON.parse(run.serialize());
  for (const change of [
    { encounters: 0 }, { nextBossAt: 180 }, { bossDelaySeconds: 6, nextBossAt: 366 },
    { boss: { ...saved.boss, round: 4 } },
    { boss: { ...saved.boss, completedSteps: [2] } }, { boss: { ...saved.boss, exitUnlocked: true } },
    { boss: { ...saved.boss, readingEndsAt: 181.1 } }, { boss: { ...saved.boss, scheduledAt: 184 } },
    { boss: { ...saved.boss, projectileStartedAt: 0 } }, { boss: { ...saved.boss, impactsResolved: 1 } },
    { boss: { ...saved.boss, pacing: { ...saved.boss.pacing, flightSeconds: 5 } } },
    { boss: { ...saved.boss, plan: [] } }, { impactSerial: 1 }, { lastImpact: {} }
  ]) assert.equal(Run.restore({ ...saved, ...change }), null);
});

test('the first two encounters stay free even when entered late; retries preserve first evidence', () => {
  const run = playing({ seed: 'safe' });
  run.tick(350);
  defeatBosses(run);
  const firstRoom = run.scene.id;
  assert.equal(run.choose('miss').damage, 0);
  assert.equal(run.hp, 3);
  assert.equal(run.hintShown, true);
  assert.equal(run.choose('miss'), null);
  assert.equal(run.finishTransition(), true);
  assert.equal(run.scene.id, firstRoom);
  assert.equal(run.index, 0);
  assert.equal(run.choose('miss').firstAttempt, false);
  run.finishTransition();
  advance(run);
  defeatBosses(run);
  assert.equal(run.index, 1);
  assert.equal(run.lockedPenalty, 0);
  assert.equal(run.choose('miss').damage, 0);
  run.finishTransition();
  advance(run);
  assert.equal(run.index, 2);
  assert.equal(run.lockedPenalty, 1);
  assert.equal(run.records.filter(record => !record.boss).length, 2);
  assert.deepEqual(run.records.filter(record => !record.boss).map(record => record.correct), [false, false]);
});

test('a room locks both penalty and intensity until the player advances', () => {
  const run = advance(playing({ seed: 'locked' }), 2);
  assert.equal(run.lockedPenalty, 1);
  assert.equal(run.lockedTier, 'danger');
  run.tick(390);
  defeatBosses(run);
  assert.equal(run.choose('miss').damage, 1);
  assert.equal(run.hp, 2);
  run.finishTransition();
  assert.equal(run.lockedPenalty, 1);
  assert.equal(run.lockedTier, 'danger');
  advance(run);
  defeatBosses(run);
  assert.equal(run.lockedPenalty, 1);
  assert.equal(run.lockedTier, 'pursuit');
});

test('ordinary authored boon flags grant no immunity, rewards, or manual hint powers', () => {
  const run = advance(playing({ seed: 'removed-buffs' }), 2, 'ward');
  assert.equal(run.boons, undefined);
  assert.equal(run.wardUsed, undefined);
  assert.equal(run.useLantern, undefined);
  assert.equal(run.choose('miss').damage, 1);
  assert.equal(run.hp, 2);
  run.finishTransition();
  assert.equal(run.choose('miss').damage, 1);
  assert.equal(run.hp, 1);
  const fatal = advance(playing({ seed: 'ordinary-fatal' }), 2, 'ward');
  fatal.tick(270); advance(fatal); defeatBosses(fatal);
  fatal.scene.targetType='bridge';
  assert.equal(fatal.choose('miss').fatal, true);
  assert.equal(fatal.hp, 0);
  assert.equal(fatal.reason, 'fatal');
});

test('ordinary health exhaustion ends a run and a gate does not heal', () => {
  const run = advance(playing({ seed: 'health', area: 'crypt' }), 2);
  run.choose('miss'); run.finishTransition();
  advance(run, 8);
  assert.equal(run.area, 'tide');
  assert.equal(run.hp, 2);
  assert.equal(run.storyState.areaSteps.tide, 0);
  run.choose('miss'); run.finishTransition();
  assert.equal(run.choose('miss').damage, 1);
  assert.equal(run.phase, 'ended');
  assert.equal(run.reason, 'hearts');
  assert.equal(Run.restore(run.serialize()).reason, 'hearts');
});

test('only a chest pays coins and double-clicks cannot replay rewards', () => {
  const run = playing({ seed: 'coins' });
  assert.equal(run.choose('bad-id'), null);
  assert.equal(run.attempts, 0);
  assert.equal(run.records.length, 0);
  advance(run);
  assert.equal(run.coins, 0);
  assert.equal(run.choose('box').coinsEarned, 1);
  assert.equal(run.choose('box'), null);
  assert.equal(run.coins, 1);
  run.finishTransition();
  assert.equal(run.choose('box').coinsEarned, 1);
  assert.equal(run.coins, 2);
  run.finishTransition();
  assert.equal(run.storyState.lastRoute, 'risk');
  assert.equal(run.storyState.chapterVisited, true);
  run.scene.options.find(option => option.id === 'box').traits.type = 'vase';
  assert.equal(run.choose('box').coinsEarned, 0);
});

test('treasure increases after ten completed rooms and tops out at five coins per chest', () => {
  const run = playing({ seed: 'coin-tiers' });
  const expectedByDecade = [1, 2, 3, 4, 5, 5];
  let total = 0;
  for (const expected of expectedByDecade) for (let room = 0; room < 10; room += 1) {
    const completed = run.completed;
    const pick = run.choose('box');
    assert.equal(pick.coinsEarned, expected);
    total += expected;
    assert.equal(run.coins, total);
    assert.equal(run.completed, completed);
    assert.equal(run.finishTransition(), true);
    assert.equal(run.completed, completed + 1);
  }
});

test('time continues past 480 during a paid transition and stays finite on very large ticks', () => {
  const run = playing({ seed: 'endless-transition' });
  run.tick(179.75); run.choose('box'); run.tick(300.25);
  assert.equal(run.elapsed, 480);
  assert.equal(run.phase, 'resolving');
  assert.equal(run.reason, null);
  assert.equal(run.coins, 1);
  assert.equal(run.hp, 3);
  assert.equal(run.finishTransition(), true);
  assert.equal(run.boss.encounter, 1);
  assert.equal(run.boss.pacing.overrun, true);
  assert.equal(run.index, 1);
  assert.equal(Run.restore(run.serialize()).coins, 1);
  const unlimited = playing({ seed: 'finite-clock' });
  for (const invalid of [-1, NaN, Infinity, '3', null]) unlimited.tick(invalid);
  assert.equal(unlimited.elapsed, 0);
  unlimited.tick(1000000);
  assert.equal(unlimited.elapsed, 1000000);
  unlimited.tick(Number.MAX_VALUE);
  assert.equal(unlimited.elapsed, Number.MAX_SAFE_INTEGER);
  assert.equal(unlimited.phase, 'playing');
  assert.equal(Number.isFinite(JSON.parse(unlimited.serialize()).elapsed), true);
  assert.ok(Run.restore(unlimited.serialize()));
});

test('hints only reveal after a wrong attempt and no manual hint or buff state is serialized', () => {
  const run = playing({ seed: 'no-manual-hint' });
  assert.equal(run.useLantern, undefined);
  assert.equal(run.manualHintUsed, undefined);
  assert.equal(run.hintShown, false);
  run.choose('miss'); run.finishTransition();
  assert.equal(run.hintShown, true);
  assert.equal(run.records[0].hinted, false);
  advance(run);
  assert.equal(run.hintShown, false);
  const saved = JSON.parse(run.serialize());
  for (const key of ['boons', 'wardUsed', 'manualHintUsed']) assert.equal(Object.hasOwn(saved, key), false);
});

test('reload preserves elapsed time, room identity, locked danger, health and first-attempt evidence', () => {
  const run = advance(playing({ seed: 'reload' }), 2);
  run.tick(269);
  defeatBosses(run);
  run.choose('miss');
  const restored = Run.restore(run.serialize());
  assert.ok(restored);
  assert.equal(restored.phase, 'playing');
  assert.equal(restored.elapsed, 269);
  assert.equal(restored.scene.id, run.scene.id);
  assert.equal(restored.lockedPenalty, 1);
  assert.equal(restored.lockedTier, 'danger');
  assert.equal(restored.hp, 2);
  assert.equal(restored.hintShown, true);
  assert.equal(restored.attempts, 1);
  assert.deepEqual(restored.records, run.records);
  restored.tick(121);
  defeatBosses(restored);
  assert.equal(restored.choose('miss').damage, 1);
  assert.equal(restored.records.filter(record => !record.boss).length, run.records.filter(record => !record.boss).length);
});

test('reload settles a successful transition exactly once without paying its chest twice', () => {
  const run = playing({ seed: 'paid-once' });
  run.tick(20);
  run.choose('box');
  const restored = Run.restore(run.serialize());
  assert.equal(restored.coins, 1);
  assert.equal(Object.hasOwn(JSON.parse(restored.serialize()), 'startingCoins'), false);
  assert.equal(restored.index, 1);
  assert.equal(restored.phase, 'playing');
  assert.equal(restored.elapsed, 20);
  run.finishTransition();
  assert.deepEqual(restored.scene, run.scene);
  const twice = Run.restore(restored.serialize());
  assert.equal(twice.coins, 1);
  assert.equal(twice.index, 1);
  assert.equal(twice.finishTransition(), false);
});

test('restart resets coins and every transient run feature', () => {
  const run = advance(playing({ seed: 'old' }), 2, 'ward');
  run.tick(120);
  run.choose('miss'); run.finishTransition();
  run.choose('box'); run.finishTransition();
  const fresh = run.restart('new');
  assert.equal(run.coins, 1);
  assert.equal(fresh.coins, 0);
  assert.equal(fresh.seed, 'new');
  assert.equal(fresh.hp, 3);
  assert.equal(fresh.elapsed, 0);
  assert.equal(fresh.index, 0);
  assert.equal(fresh.completed, 0);
  assert.equal(fresh.phase, 'entrance');
  assert.equal(fresh.reason, null);
  assert.equal(fresh.boons, undefined);
  assert.deepEqual(fresh.records, []);
  assert.equal(fresh.wardUsed, undefined);
  assert.equal(fresh.hintShown, false);
});

test('manual quit keeps the final score through reload and the next run starts at zero', () => {
  const run = playing({ seed: 'quit-old' });
  run.tick(60);
  run.choose('box');
  assert.equal(run.end('quit'), true);
  assert.equal(run.phase, 'ended');
  assert.equal(run.reason, 'quit');
  assert.equal(run.hp, 3);
  assert.equal(run.coins, 1);
  assert.equal(run.finishTransition(), false);
  assert.equal(run.end(), false);
  const restored = Run.restore(run.serialize());
  assert.equal(restored.reason, 'quit');
  assert.equal(restored.elapsed, 60);
  assert.equal(restored.index, 0);
  assert.equal(restored.coins, 1);
  const fresh = restored.restart('quit-new');
  assert.equal(fresh.coins, 0);
  assert.equal(fresh.hp, 3);
  assert.equal(fresh.elapsed, 0);
  assert.equal(fresh.index, 0);
  assert.equal(fresh.reason, null);
  assert.equal(fresh.phase, 'entrance');
  assert.deepEqual(fresh.records, []);
  assert.equal(fresh.boons, undefined);
  assert.equal(fresh.end(), false);
  fresh.enterDungeon();
  assert.equal(fresh.end(), true);
  assert.equal(fresh.reason, 'quit');
});

test('malformed saves are rejected while valid elapsed times past 480 restore', () => {
  const base = JSON.parse(playing({ seed: 'validation' }).serialize());
  for (const value of [null, '', '{', {}, [], 7]) assert.equal(Run.restore(value), null);
  for (const change of [
    { hp: 4 }, { coins: -1 }, { startingCoins: -1 }, { startingCoins: 1 }, { elapsed: -1 }, { completed: 1 },
    { phase: 'playing', hp: 0 }, { lockedPenalty: 'fatal' },
    { lockedTier: 'pursuit' }, { sceneId: 'different' }, { area: 'missing' },
    { storyState: { areaSteps: { crypt: -1 } } }, { phase: 'resolving', pending: { optionId: 'go', correct: true } }
  ]) assert.equal(Run.restore({ ...base, ...change }), null);
  const expired = Run.restore({ ...base, elapsed: 500, bossDueAt: 180 });
  assert.ok(expired);
  assert.equal(expired.elapsed, 500);
  assert.equal(expired.phase, 'playing');
  assert.equal(expired.reason, null);
});

test('records are bounded and seeded runs reproduce the same rooms after reload', () => {
  const first = playing({ seed: 'repeat' });
  const second = playing({ seed: 'repeat' });
  for (let i = 0; i < 140; i += 1) {
    assert.deepEqual(first.scene, second.scene);
    advance(first); advance(second);
  }
  assert.equal(first.records.length, 128);
  assert.equal(first.records[0].index, 12);
  assert.equal(first.completed, 140);
  assert.deepEqual(Run.restore(first.serialize()).scene, first.scene);
});

test('browser UMD exposes the same public API without Node', () => {
  const browser = { DungeonContent: fixture, DungeonLearning: require('./dungeon-learning.js') };
  vm.runInNewContext(source, browser, { filename: enginePath });
  assert.equal(typeof browser.DungeonEngine.Run, 'function');
  assert.equal(browser.DungeonEngine.penaltyForTarget('bridge'), 'fatal');
  assert.equal(new browser.DungeonEngine.Run({ seed: 'browser' }).hp, 3);
});

const content = require('./dungeon-content.js');
const { Run: LiveRun } = require('./dungeon-engine.js');

// Settle a linked room's clue at the source, leaving the actual task to the test.
function readSource(run) {
  if (run.scene.chain?.step !== 1) return run;
  const { id } = run.scene;
  const { completed, bossDelaySeconds } = run;
  const result = run.choose(run.scene.chain.sourceId);
  assert.equal(result.continuesQuest, true);
  assert.equal(result.coinsEarned, 0);
  run = LiveRun.restore(run.serialize());
  assert.equal(run.scene.id, id);
  assert.equal(run.scene.chain.step, 2);
  assert.equal(run.completed, completed);
  assert.equal(run.bossDelaySeconds, bossDelaySeconds);
  return run;
}

function versionNineRoom(index, lastRoute = 'safe') {
  const run = new LiveRun({ seed: 'legacy-vault', area: 'crypt' });
  const saved = priorSave(run, 9, 30);
  Object.assign(saved, { phase: 'playing', index, completed: index, elapsed: 8, sceneEnteredAt: 8,
    bossDelaySeconds: 3 * index, nextBossAt: 180 + 3 * index, lockedTier: tierAt(8, index) });
  delete saved.legacyLayout;
  saved.storyState = { areaSteps: { crypt: index }, lastRoute, route: lastRoute };
  const scene = content.createScene({ ...saved, elapsed: saved.sceneEnteredAt, difficulty: saved.lockedTier, legacy: true, legacyControls: true });
  saved.sceneId = scene.id;
  saved.lockedPenalty = penaltyForTarget(scene.targetType);
  return { saved, scene };
}

test('v9 in-progress rooms resume with their original targets until the current action settles', () => {
  const { saved, scene } = versionNineRoom(1);
  saved.hp = 2;
  let run = LiveRun.restore(saved);
  assert.deepEqual(run.scene, scene);
  assert.equal(run.hp, 2);
  assert.equal(run.phase, 'playing');
  assert.equal(run.enterDungeon(), false);
  const wrong = run.scene.options.find(option => !option.correct);
  assert.equal(run.choose(wrong.id).damage, 1);
  run = LiveRun.restore(run.serialize());
  assert.deepEqual(run.scene, scene);
  assert.equal(run.coins, 0);
  assert.equal(run.hp, 1);
  run.choose(run.scene.options.find(option => option.correct).id);
  run = LiveRun.restore(run.serialize());
  assert.equal(run.legacyLayout, false);
  assert.ok(run.scene.cardId);
  assert.deepEqual(LiveRun.restore(run.serialize()).scene, run.scene);
});

test('old paid risk doors settle once; an unpaid v9 treasure fork still delivers its promised real chest', () => {
  const { saved, scene } = versionNineRoom(2);
  const door = scene.options.find(option => option.route === 'vault');
  const pending = { ...saved, phase:'resolving', attempts:1, pending:{optionId:door.id,correct:true,timedOut:false},
    lastResult:{sceneId:scene.id,optionId:door.id,correct:true,coinsEarned:0,timedOut:false,automatic:false} };
  let run = LiveRun.restore(saved);
  assert.equal(run.scene.options.filter(o => o.correct).length, 1);
  assert.equal(run.scene.targetType,'dispatch');
  const paid = { ...pending, version: 7, coins: 35, lastResult: { ...pending.lastResult, coinsEarned: 5 } };
  const oldPaid = LiveRun.restore(paid);
  assert.equal(oldPaid.coins, 5);
  assert.equal(oldPaid.storyState.lastRoute, 'risk');
  assert.equal(oldPaid.legacyLayout, false);
  assert.equal(LiveRun.restore(oldPaid.serialize()).coins, 5);
  run = LiveRun.restore(pending);
  assert.equal(run.coins, 0);
  assert.equal(run.scene.chestRoom, true);
  assert.equal(run.choose(run.scene.options.find(option => option.correct).id).coinsEarned, 1);
  const paidChest = priorSave(run, 9, 30);
  paidChest.coins = 35;
  paidChest.lastResult.coinsEarned = 5;
  run = LiveRun.restore(paidChest);
  assert.equal(run.coins, 5);
  assert.equal(run.legacyLayout, false);
  assert.equal(run.index, 4);
  assert.deepEqual(LiveRun.restore(run.serialize()).scene, run.scene);
});

test('authored rooms, chests, area gates and timed bosses survive repeated reloads in all eight areas', () => {
  const areas = Object.keys(content.AREAS);
  assert.equal(areas.length, 8);
  const encounterTypes = new Set();
  const starts = new Set();
  for (let i = 0; i < 128; i++) starts.add(new LiveRun({ seed: 'entrance-' + i }).area);
  assert.deepEqual([...starts].sort(), areas.slice().sort());
  for (const area of areas) {
    let run = playing({ seed: 'integration-' + area, area }, LiveRun);
    const seenRoomIds = new Set();
    let coins = 0;
    let gates = 0;
    for (let i = 0; i < 32; i += 1) {
      run = readSource(run);
      const scene = run.scene;
      assert.equal(seenRoomIds.has(scene.id), false, 'Cleared rooms cannot reuse scene IDs');
      seenRoomIds.add(scene.id);
      assert.ok(scene.options.length >= 2 && scene.options.length <= 4);
      assert.ok(scene.cardId);
      assert.ok(scene.progress.current >= 1 && scene.progress.current <= scene.progress.total);
      encounterTypes.add(scene.encounterType);
      const option = scene.options.find(o => o.correct && o.route === 'vault') || scene.options.find(o => o.correct);
      const previousArea = run.area;
      run.tick(1.25);
      const answer = run.choose(option.id);
      assert.equal(answer.correct, true);
      if (scene.chestRoom) {
        assert.equal(option.traits.type, 'box');
        const expected = 1 + Math.floor(i / 10);
        coins += expected;
        assert.equal(answer.coinsEarned, expected);
      } else assert.equal(answer.coinsEarned, 0);
      run = LiveRun.restore(run.serialize());
      assert.ok(run);
      assert.equal(run.coins, coins);
      if (option.nextArea) {
        gates += 1;
        assert.equal(run.area, option.nextArea);
        assert.notEqual(run.area, previousArea);
      } else assert.equal(run.area, previousArea);
    }
    assert.ok(gates > 0);
    assert.equal(run.hp, 3);
    run.tick(run.nextBossIn);
    assert.equal(run.boss, null);
    run = readSource(run);
    run.choose(run.scene.options.find(option => option.correct).id);
    run.finishTransition();
    const completedBeforeArena = run.completed;
    const story = JSON.stringify(run.storyState);
    assert.equal(run.boss.readingBand, run.learning.initialBand);
    for (let round = 1; round <= 3; round += 1) {
      readyBoss(run);
      assert.equal(run.boss.round, round);
      assert.equal(run.scene.options.length, 9);
      run.choose(run.scene.options.find(option => option.correct).id);
      run = LiveRun.restore(run.serialize());
      assert.ok(run);
    }
    assert.equal(run.boss, null);
    assert.equal(run.nextBossIn, 180);
    assert.equal(run.completed, completedBeforeArena);
    assert.equal(JSON.stringify(run.storyState), story);
  }
  assert.ok(encounterTypes.has('dispatch'));
  assert.equal(encounterTypes.has('fork'), false);
  for(const type of ['bridge','cart','chest','door','feeding','floodgate','gate','item','ladder','person','signal','sluice'])assert.ok(encounterTypes.has(type),type);
});

const { Profile } = require('./dungeon-learning.js');

test('the reading scheduler isolates each word, lowers on two misses and spaces a level promotion by eight other rooms', () => {
  const keys = ['至少', '至多', '正好'];
  const pupil = new Profile(keys, null, 2);
  const record = (target, level, situation, outcome) => pupil.firstChoice({ target, level, situation }, outcome);
  record('至多', 2, '配給', 'neutral');
  assert.equal(pupil.targets['至多'], undefined, 'A wrong secondary detail supplies no target evidence');
  record('至多', 2, '燈房', 'miss');
  record('至多', 2, '爐溫', 'correct');
  record('至多', 2, '訊號', 'miss');
  assert.equal(pupil.targets['至多'].level, 1);
  assert.equal(pupil.targets['至多'].status, 'practice');
  assert.equal(pupil.choose(['至少'], () => 0).level, 2);
  for (let i = 0; i < 6; i++) record('至多', 1, i % 2 ? '運貨' : '照明', 'correct');
  assert.equal(pupil.targets['至多'].level, 1, 'Two different situations are insufficient despite six correct answers');
  record('至多', 1, '校準', 'correct');
  assert.equal(pupil.targets['至多'].level, 2);
  assert.deepEqual(pupil.targets['至多'].recent, []);
  assert.equal(pupil.choose(['至多'], () => 0), null);
  for (let i = 0; i < 7; i++) pupil.firstChoice(null);
  assert.equal(pupil.choose(['至多'], () => 0), null);
  pupil.firstChoice(null);
  assert.deepEqual(pupil.choose(['至多'], () => 0), { target: '至多', level: 2 });
  const resumed = new Profile(keys, pupil.export(), 1);
  assert.deepEqual(resumed.export(), pupil.export());
  resumed.setStartingBand(3);
  assert.equal(resumed.choose(['正好'], () => 0).level, 3);
  assert.equal(resumed.choose(['至多'], () => 0).level, 2);
  const expert = new Profile(keys, null, 3);
  for (let i = 0; i < 6; i++) expert.firstChoice({ target: '至少', level: 3, situation: ['工時', '入場', '照明'][i % 3] }, 'correct');
  assert.equal(expert.targets['至少'].masteredLevel, 3);
  for (let i = 0; i < 8; i++) expert.firstChoice(null);
  expert.firstChoice({ target: '至少', level: 3, situation: '重溫' }, 'correct');
  assert.equal(expert.choose(['至少'], () => 0), null, 'A successful review of a fully mastered word schedules the next spaced review');
});

test('the eligible practice, due-review and new draws are 50/30/20 and avoid a third immediate repeat', () => {
  const observed = (level, status) => ({ level, status, attempts: 8, successes: 5, due: 0, recent: [] });
  const keys = ['木料', '緊鄰', '原主', '其餘'];
  const pupil = new Profile(keys, { version: 1, initialBand: 1, targets: {
    '木料': observed(1, 'practice'), '緊鄰': observed(2, 'review')
  } });
  for (const [roll, expected] of [[.49, '木料'], [.50, '緊鄰'], [.79, '緊鄰'], [.80, '原主']]) {
    const stream = [roll, 0]; assert.equal(pupil.choose(keys, () => stream.shift()).target, expected);
  }
  pupil.recent = ['木料', '木料'];
  assert.notEqual(pupil.choose(keys, () => 0).target, '木料');
  assert.deepEqual(pupil.choose(['木料'], () => 0), { target: '木料', level: 1 });
  assert.deepEqual(pupil.familiarTargets, ['木料', '緊鄰']);
  assert.equal(pupil.choose([], () => 0), null);
});

test('lessons pin across retries, active restores, and band changes; deaths, free choices and bosses contribute no extra evidence', () => {
  const authored = { ...fixture, LESSON_TARGETS: ['至多'],
    lessonTargetsFor(config) { return config.index % 3 === 2 ? [] : this.LESSON_TARGETS; },
    createScene(config) {
      if (!config.lesson) return { ...fixture.createScene.call(this, config), kind: 'choice' };
      const { target, level } = config.lesson;
      return { id: config.index + ':' + target + ':' + level, options: [
        { id: 'go', correct: true, targetEvidence: 'correct' },
        { id: 'slip', correct: false, targetEvidence: 'miss' },
        { id: 'colour', correct: false, targetEvidence: 'neutral' }],
        targetType: 'sluice', lesson: { target, level, situation: ['排水','灌溉','防洪'][config.index % 3] },
        kind: 'reading', area: config.area };
    }
  };
  const { Run: TestRun } = engineFor(authored).exports;
  let run = new TestRun({ seed: 4, initialBand: 2 });
  assert.equal(run.setStartingBand(3), true);
  run.enterDungeon();
  assert.equal(run.setStartingBand(1), false);
  assert.equal(run.scene.lesson.level, 3);
  const start = run.scene;
  assert.equal(run.choose('slip').damage, 0);
  const saved = run.serialize();
  run = TestRun.restore(saved);
  assert.deepEqual(run.scene, start);
  assert.equal(run.learning.targets['至多'].attempts, 1);
  assert.ok(run.hintShown);
  run.choose('slip'); run.finishTransition();
  run.choose('go'); run.finishTransition();
  assert.equal(run.learning.targets['至多'].attempts, 1);
  const reroll = TestRun.restore(saved);
  assert.deepEqual(reroll.scene, start);
  assert.deepEqual(reroll.learning.export(), run.learning.export());
  run.choose('slip'); run.finishTransition();
  assert.equal(run.learning.targets['至多'].level, 2);
  assert.equal(run.scene.lesson.level, 3, 'The displayed room cannot change during a retry');
  run.choose('go'); run.finishTransition();
  const previous = run.learning.export();
  run.tick(run.nextBossIn);
  advance(run); defeatBosses(run);
  assert.deepEqual(run.learning.export(), previous);
  assert.equal(run.scene.lesson.level, 2);
  const next = run.restart('new-expedition');
  assert.deepEqual(next.learning.export(), previous);
  assert.equal(next.phase, 'entrance');
  assert.equal(TestRun.restore(next.serialize()).learning.initialBand, 3);
  const independent = new TestRun({ seed: 4, initialBand: 1 });
  assert.deepEqual(Object.keys(independent.learning.targets), []);
});

test('pre-course v10 entrance and room snapshots preserve the visible save and opt into the pupil course on the following room', () => {
  const old = new LiveRun({ seed: 'old-amber', area: 'amber' });
  const entrance = priorSave(old, 10, 20);
  delete entrance.curriculum; delete entrance.lesson; delete entrance.learning;
  const resumeAtGate = LiveRun.restore(entrance, { initialBand: 3 });
  assert.equal(resumeAtGate.learning.initialBand, 3);
  assert.equal(resumeAtGate.curriculum, true);
  const oldFirst = content.createScene({ seed: old.seed, area: old.area, index: 0,
    storyState: entrance.storyState, elapsed: 0, difficulty: 'safe' });
  const saved = { ...entrance, phase: 'playing', sceneId: oldFirst.id, lockedPenalty: penaltyForTarget(oldFirst.targetType) };
  const resumed = LiveRun.restore(saved, { initialBand: 2 });
  assert.deepEqual(resumed.scene, oldFirst);
  assert.equal(resumed.curriculum, false);
  const wrong = resumed.scene.options.find(o => !o.correct);
  resumed.choose(wrong.id); resumed.finishTransition();
  assert.deepEqual(LiveRun.restore(resumed.serialize()).scene, oldFirst);
  resumed.choose(oldFirst.options.find(o => o.correct).id); resumed.finishTransition();
  assert.equal(resumed.curriculum, true);
  assert.equal(resumed.coins, 0);
  assert.equal(resumed.learning.initialBand, 2);
});

test('a saved v12 room and its pupil evidence survive retries and join the obstacle itinerary on exit', () => {
  const old = new LiveRun({ seed: 'before-obstacles', area: 'archive', initialBand: 2 });
  const asPrevious = run => {
    const data = priorSave(run, 12, 40);
    delete data.obstacles;
    delete data.mixed;
    return data;
  };
  assert.equal(LiveRun.restore(asPrevious(old)).obstacles, true, 'Pupils at camp start on the new route');
  old.obstacles = false;
  old.mixed = false;
  old.enterDungeon();
  const shown = old.scene;
  const wrong = shown.options.find(o => !o.correct);
  old.choose(wrong.id);
  let resumed = LiveRun.restore(asPrevious(old));
  assert.equal(resumed.hintShown, true);
  assert.equal(resumed.obstacles, false);
  assert.deepEqual(resumed.scene, shown);
  assert.deepEqual(resumed.learning.export(), old.learning.export());
  resumed = LiveRun.restore(resumed.serialize());
  assert.deepEqual(resumed.scene, shown);
  resumed.choose(shown.options.find(o => o.correct).id);
  resumed.finishTransition();
  assert.equal(resumed.obstacles, true);
  assert.equal(resumed.completed, 1);
  assert.equal(resumed.coins, 0);
  assert.equal(resumed.learning.initialBand, 2);
  assert.deepEqual(LiveRun.restore(resumed.serialize()).scene, resumed.scene);

  class PreviousItinerary extends LiveRun {
    _roomConfig() { return { ...super._roomConfig(), obstacles: false, mixed: false, legacyControls: true }; }
  }
  const original = playing({ seed: 'previous-vault', initialBand: 2 }, PreviousItinerary);
  for (let step = 0; step < 9 && !original.scene.options.some(o => o.route === 'vault'); step++) {
    original.choose(original.scene.options.find(o => o.correct).id);
    original.finishTransition();
  }
  const previous = LiveRun.restore(asPrevious(original));
  assert.equal(previous.scene.options.filter(o => o.correct).length, 1);
  const vault = original.scene.options.find(o => o.route === 'vault');
  assert.ok(vault);
  original.choose(vault.id);
  const chest = LiveRun.restore(asPrevious(original));
  assert.equal(chest.obstacles, false);
  assert.equal(chest.scene.chestRoom, true);
  const wallet = chest.coins;
  assert.equal(chest.choose(chest.scene.options.find(o => o.correct).id).coinsEarned, 1);
  const paid = LiveRun.restore(chest.serialize());
  assert.equal(paid.obstacles, true);
  assert.equal(paid.coins, wallet + 1);
  assert.equal(LiveRun.restore(paid.serialize()).coins, wallet + 1);
});

test('blocked rooms permit safe retries, award a single exit delay and yield to a due guardian after the exit', () => {
  const tested = new Set();
  for (let i = 0; i < 96 && tested.size < 2; i++) {
    let run = playing({ seed:'clear-obstacle-'+i }, LiveRun);
    for (let n = 0; n < 10; n++) {
      run = readSource(run);
      const type = run.scene.targetType;
      const correct = run.scene.options.find(o => o.correct);
      if (!['feeding','floodgate'].includes(type) || tested.has(type)) {
        run.choose(correct.id);
        run.finishTransition();
        continue;
      }
      tested.add(type);
      const scene = run.scene, { hp, coins, completed, bossDelaySeconds } = run;
      run.tick(run.nextBossIn);
      const wrong = scene.options.find(o => !o.correct);
      const error = run.choose(wrong.id);
      assert.equal(error.damage, 0);
      assert.equal(error.coinsEarned, 0);
      assert.equal(run.hp, hp);
      assert.equal(run.bossDelaySeconds, bossDelaySeconds);
      run = LiveRun.restore(run.serialize());
      assert.deepEqual(run.scene, scene);
      assert.equal(run.hintShown, true);
      assert.equal(run.boss, null);
      const evidence = run.learning.export();
      run.choose(wrong.id);
      run.finishTransition();
      run.choose(correct.id);
      assert.equal(run.completed, completed);
      assert.equal(run.boss, null);
      assert.equal(run.bossDelaySeconds, bossDelaySeconds);
      run = LiveRun.restore(run.serialize());
      assert.equal(run.completed, completed + 1);
      assert.equal(run.coins, coins);
      assert.equal(run.hp, hp);
      assert.equal(run.boss.round, 1);
      assert.equal(run.bossDelaySeconds, bossDelaySeconds + 3);
      assert.deepEqual(run.learning.export(), evidence);
      assert.equal(LiveRun.restore(run.serialize()).bossDelaySeconds, bossDelaySeconds + 3);
      break;
    }
  }
  assert.deepEqual([...tested].sort(), ['feeding', 'floodgate']);
});

test('a v13 run retains its visit and reaches a different area without encountering a free path preference', () => {
  class PreviousVisit extends LiveRun {
    _roomConfig() { return { ...super._roomConfig(), mixed: false, legacyControls: true }; }
  }
  const old=playing({seed:'last-old-route-0',area:'crypt',initialBand:2},PreviousVisit);
  const previous=priorSave(old,13,20);
  delete previous.mixed;
  let run=LiveRun.restore(previous);
  let checkedWrong=false,dispatch=0;
  for(let n=0;n<15&&run.area==='crypt';n++){
    assert.equal(run.mixed,false);
    const scene=run.scene;
    const right=scene.options.filter(o=>o.correct);
    assert.equal(right.length,1);
    if(scene.targetType==='dispatch')dispatch++;
    const wrong=scene.options.find(o=>!o.correct);
    if(!checkedWrong&&wrong&&run.lockedPenalty===0){
      checkedWrong=true;
      run.choose(wrong.id);run=LiveRun.restore(run.serialize());
      assert.deepEqual(run.scene,scene);assert.equal(run.hp,3);
    }
    const before=run.index;
    run.choose(right[0].id);run=LiveRun.restore(run.serialize());
    assert.equal(run.index,before+1);
  }
  assert.ok(checkedWrong&&dispatch);assert.notEqual(run.area,'crypt');assert.equal(run.mixed,true);
  assert.deepEqual(LiveRun.restore(run.serialize()).scene,run.scene);
});

test('the area seal, gatekeeper and matching exit stay in order through a retry, vault, reload or guardian', () => {
  for(const band of [1,2,3]){
    let run=playing({seed:'area-key-'+band,area:'tide',initialBand:band},LiveRun);
    for(let i=0;i<15&&!run.scene.checkpoint;i++){
      run=readSource(run);
      const chosen=run.scene.options.find(o=>o.correct&&o.route==='vault')||run.scene.options.find(o=>o.correct);
      assert.equal(chosen.nextArea,undefined);
      run.choose(chosen.id);run=LiveRun.restore(run.serialize());
    }
    const checkpoint=run.scene,seal=checkpoint.storyFlags.gateSealFor;
    assert.ok(checkpoint.checkpoint&&seal);
    assert.equal(checkpoint.options.filter(o=>o.correct).length,1);
    const checkpointMiss=checkpoint.options.find(o=>!o.correct);
    run.choose(checkpointMiss.id);run=LiveRun.restore(run.serialize());
    assert.notEqual(run.storyState.gateSealFor,seal);
    assert.deepEqual(run.scene,checkpoint);
    run.tick(run.nextBossIn); // A due guardian intervenes between the two reads.
    run.choose(checkpoint.options.find(o=>o.correct).id);run=LiveRun.restore(run.serialize());
    assert.ok(run.boss);assert.equal(run.area,'tide');assert.equal(run.storyState.gateSealFor,seal);
    defeatBosses(run);run=LiveRun.restore(run.serialize());
    assert.equal(run.scene.chain.step,1);
    assert.equal(run.scene.encounterType,'gate');
    run=readSource(run);
    const gate=run.scene;
    assert.equal(gate.areaGate,true);assert.equal(gate.ending,true);
    assert.equal(gate.encounterType,'gate');assert.equal(gate.targetType,'door');
    assert.ok(gate.gateConditions.length>=2);
    const matches=gate.options.filter(o=>o.correct);
    assert.equal(matches.length,1);assert.notEqual(matches[0].nextArea,run.area);
    assert.ok(content.AREAS[matches[0].nextArea]);
    const hp=run.hp,index=run.index;
    for(const wrong of gate.options.filter(o=>!o.correct)){
      assert.equal(wrong.nextArea,undefined);
      assert.equal(run.choose(wrong.id).damage,0);
      run=LiveRun.restore(run.serialize());
      assert.deepEqual(run.scene,gate);assert.equal(run.area,'tide');
      assert.equal(run.hp,hp);assert.equal(run.index,index);
    }
    run.choose(matches[0].id);assert.equal(run.area,'tide');
    run=LiveRun.restore(run.serialize());
    assert.equal(run.area,matches[0].nextArea);assert.equal(run.index,index+1);
    assert.equal(run.scene.progress.current,1);
    assert.equal(LiveRun.restore(run.serialize()).index,index+1);
  }
});

test('all twelve activities are drawn exactly once per bag across area and bonus-room boundaries', () => {
  const expected=['bridge','cart','chest','dispatch','door','feeding','floodgate','item','ladder','person','signal','sluice'];
  for(const route of ['vault','safe']){
    let run=playing({seed:'one-bag-'+route},LiveRun),cards=[],cycles=0;
    for(let room=0;room<100&&cycles<4;room++){
      run=readSource(run);
      const scene=run.scene,cursor=run.storyState.nextQuestDraw||0;
      if(scene.storyFlags.nextQuestDraw>cursor){
        assert.equal(scene.storyFlags.nextQuestDraw,cursor+1);
        cards.push(scene.encounterType);
        if(cards.length===expected.length){
          assert.deepEqual(cards.slice().sort(),expected);
          cards=[];cycles++;
        }
      }
      const choice=scene.options.find(o=>o.correct&&o.route===route)||scene.options.find(o=>o.correct);
      run.choose(choice.id);run=LiveRun.restore(run.serialize());
    }
    assert.equal(cycles,4);
  }
});

test('a historically committed vault exit can queue both a guardian and its chest without skipping the two gate checks', () => {
  class PreviousControls extends LiveRun {
    _roomConfig() { return { ...super._roomConfig(), legacyControls:true }; }
  }
  let beforeExit,area,cursor,coins;
  for(let seed=0;seed<100&&!beforeExit;seed++){
    const historical=playing({seed:'last-fork-'+seed},PreviousControls);
    for(let room=0;room<10&&!historical.scene.checkpoint;room++){
      if(historical.scene.chain?.step===1){
        historical.choose(historical.scene.chain.sourceId);
        historical.finishTransition();
      }
      const s=historical.scene;
      const vault=s.options.find(o=>o.route==='vault');
      const choose=vault||s.options.find(o=>o.correct);
      historical.choose(choose.id);
      const saved=priorSave(historical,15);
      historical.finishTransition();
      if(vault&&historical.scene.chestRoom){
        // A committed fork finishes against the previous build, which recorded
        // its chosen route when the player entered the door.
        const probe=LiveRun.restore(saved);
        const claimed=probe.scene.options.find(o=>o.correct);
        probe.choose(claimed.id);probe.finishTransition();
        if(!probe.scene.checkpoint)continue;
        Object.assign(saved,{ elapsed:saved.nextBossAt, bossDueAt:saved.nextBossAt });
        beforeExit=saved;area=s.area;cursor=s.storyFlags.nextQuestDraw;coins=saved.coins;
        break;
      }
    }
  }
  assert.ok(beforeExit);
  let run=LiveRun.restore(beforeExit);
  assert.ok(run.boss);assert.equal(run.storyState.nextQuestDraw,cursor);
  defeatBosses(run);run=LiveRun.restore(run.serialize());
  assert.equal(run.scene.chestRoom,true);assert.equal(run.scene.storyFlags.nextQuestDraw,cursor);
  assert.equal(run.choose(run.scene.options.find(o=>o.correct).id).coinsEarned,1);
  run=LiveRun.restore(run.serialize());
  assert.ok(run.scene.checkpoint);assert.equal(run.coins,coins+1);
  assert.equal(run.storyState.nextQuestDraw,cursor);
  run.choose(run.scene.options.find(o=>o.correct).id);run=LiveRun.restore(run.serialize());
  run=readSource(run);
  assert.ok(run.scene.areaGate);assert.equal(run.area,area);
  run.choose(run.scene.options.find(o=>o.correct).id);run=LiveRun.restore(run.serialize());
  assert.notEqual(run.area,area);
  assert.equal(run.storyState.nextQuestDraw,cursor);
});

const linkedContent = {
  ...fixture, LESSON_TARGETS: ['原主'],
  lessonTargetsFor() { return ['原主']; },
  createScene(config) {
    const { questStep: step, lesson } = config;
    const base = fixture.createScene.call(this, config);
    const sourceId = 'miner-with-lantern';
    const source = [{ id: sourceId, correct: true }, { id: 'miner-with-helmet', correct: false }];
    const chests = [{ id: 'gold-lock', correct: true, traits: { type: 'box' }, reward: 'chest', targetEvidence: 'correct' },
      { id: 'iron-lock', correct: false, targetEvidence: 'miss' }];
    return { ...base, kind: 'reading', questStep: step, questTotal: 2, chain: { step, sourceId },
      prompt: step === 1 ? '向提燈的礦工查問。' : '礦工說：「原主把金幣放在金鎖的箱子裏。」',
      targetType: step === 1 ? 'person' : 'item',
      options: step === 1 ? source : chests, lesson: step === 1 ? null : { ...lesson, situation: '金庫' } };
  }
};
const { Run: LinkedRun } = engineFor(linkedContent).exports;

test('a linked clue survives wrong targets and reloads; only its final action settles the room and pays the chest', () => {
  let run = playing({ seed: 'clue-to-chest', initialBand: 2 }, LinkedRun);
  const { id, prompt } = run.scene;
  const story = JSON.stringify(run.storyState);
  const originalEvidence = run.learning.export();
  run.tick(180);
  assert.equal(run.choose('gold-lock'), null);
  assert.equal(run.choose('miner-with-helmet').damage, 1);
  run = LinkedRun.restore(run.serialize());
  assert.equal(run.hp, 2);
  assert.equal(run.scene.prompt, prompt);
  assert.equal(run.hintShown, true);
  assert.equal(run.choose('miner-with-lantern').continuesQuest, true);
  assert.equal(run.choose('miner-with-lantern'), null);
  const afterContact = run.serialize();
  run = LinkedRun.restore(afterContact);
  assert.deepEqual(LinkedRun.restore(afterContact).scene, run.scene);
  assert.equal(run.scene.id, id);
  assert.notEqual(run.scene.prompt, prompt);
  assert.equal(run.scene.chain.step, 2);
  assert.equal(run.questSourceId, 'miner-with-lantern');
  assert.equal(run.hintShown, false);
  assert.equal(run.attempts, 0);
  assert.deepEqual(run.learning.export(), originalEvidence);
  assert.equal(run.boss, null);
  assert.equal(run.nextBossIn, 0);
  assert.equal(run.bossDelaySeconds, 0);
  assert.equal(run.completed, 0);
  assert.equal(run.index, 0);
  assert.equal(JSON.stringify(run.storyState), story);
  assert.equal(run.coins, 0);
  assert.equal(run.choose('miner-with-lantern'), null);
  assert.equal(run.choose('iron-lock').damage, 1);
  const withHint = LinkedRun.restore(run.serialize());
  assert.deepEqual(withHint.scene, run.scene);
  assert.equal(withHint.hintShown, true);
  assert.equal(withHint.attempts, 1);
  assert.equal(withHint.hp, 1);
  assert.equal(withHint.learning.targets['原主'].attempts, 1);
  assert.equal(withHint.learning.targets['原主'].successes, 0);
  assert.deepEqual(withHint.records.map(row => row.questStep), [1, 2]);
  assert.equal(withHint.choose('gold-lock').coinsEarned, 1);
  assert.equal(withHint.choose('gold-lock'), null);
  run = LinkedRun.restore(withHint.serialize());
  assert.equal(run.boss.round, 1);
  assert.equal(run.questSourceId, null);
  assert.equal(run.coins, 1);
  assert.equal(run.index, 1);
  assert.equal(run.completed, 1);
  assert.equal(run.bossDelaySeconds, 3);
  assert.equal(run.storyState.chapterVisited, true);
  assert.equal(LinkedRun.restore(run.serialize()).coins, 1);
});

test('an invalid clue source or stage cannot restore a nonmatching action', () => {
  const run = playing({ seed: 'lost-source' }, LinkedRun);
  const base = JSON.parse(run.serialize());
  for (const change of [{ questStep: 3 }, { questSourceId: 'miner-with-lantern' },
    { questStep: 2, questSourceId: null }, { questStep: 2, questSourceId: 'miner-with-helmet' }]) {
    assert.equal(LinkedRun.restore({ ...base, ...change }), null);
  }
  run.choose('miner-with-lantern'); run.finishTransition();
  const ready = JSON.parse(run.serialize());
  assert.equal(LinkedRun.restore({ ...ready, chained: false }), null);
  assert.deepEqual(LinkedRun.restore(ready).scene, run.scene);
});

test('v14 existing rooms keep the precise clue on a retry and opt into linked quests at the following room', () => {
  class PreviousRoom extends LiveRun {
    _roomConfig() { return { ...super._roomConfig(), chained: false }; }
  }
  function asV14(run) {
    const data = priorSave(run, 14, 25);
    delete data.chained; delete data.questStep; delete data.questSourceId;
    return data;
  }
  const previous = new PreviousRoom({ seed: 'v14-room' });
  assert.equal(LiveRun.restore(asV14(previous)).chained, true);
  previous.enterDungeon();
  const oldScene = previous.scene;
  let run = LiveRun.restore(asV14(previous));
  assert.deepEqual(run.scene, oldScene);
  assert.equal(run.chained, false);
  const wrong = run.scene.options.find(option => !option.correct);
  run.choose(wrong.id);
  run = LiveRun.restore(run.serialize());
  assert.deepEqual(run.scene, oldScene);
  run.choose(oldScene.options.find(option => option.correct).id);
  run = LiveRun.restore(run.serialize());
  assert.equal(run.mixed, true);
  assert.equal(run.chained, true);
  assert.equal(run.completed, 1);
  assert.equal(run.coins, 0);
  assert.deepEqual(LiveRun.restore(run.serialize()).scene, run.scene);
});

test('a saved v15 fork converts after consulting its source, and a sign converts to a reusable console', () => {
  class PreviousControls extends LiveRun {
    _roomConfig() { return {...super._roomConfig(),legacyControls:true}; }
  }
  const wanted=new Set(['source','dispatch','console']);
  for(let seed=0;seed<20&&wanted.size;seed++){
    const old=playing({seed:'machine-migration-'+seed,area:'astral',initialBand:2},PreviousControls);
    while(old.completed<36&&wanted.size){
      const oldRoom=old.scene;
      const kind=oldRoom.encounterType==='fork'?(oldRoom.questStep===1?'source':'dispatch'):
        oldRoom.targetType==='item'&&oldRoom.options.every(o=>o.traits.type==='specimen')?'console':null;
      if(wanted.has(kind)){
        wanted.delete(kind);
        const save=priorSave(old,15,30);
        let r=LiveRun.restore(save);
        assert.ok(r);
        assert.equal(r.scene.id,oldRoom.id);
        assert.equal(r.questSourceId,old.questSourceId);
        assert.equal(r.scene.options.filter(o=>o.correct).length,1);
        assert.equal(r.coins,old.coins);
        assert.equal(r.completed,old.completed);
        if(kind==='source'){
          assert.equal(r.scene.chain.sourceId,oldRoom.chain.sourceId);
          r=readSource(r);
        }
        assert.equal(r.scene.targetType,kind==='console'?'console':'dispatch');
        const miss=r.scene.options.find(o=>!o.correct),right=r.scene.options.find(o=>o.correct);
        assert.equal(r.choose(miss.id).damage,0);
        r=LiveRun.restore(r.serialize());
        assert.equal(r.completed,old.completed);assert.equal(r.hp,old.hp);
        assert.equal(r.choose(right.id).coinsEarned,0);
        r=LiveRun.restore(r.serialize());
        assert.equal(r.completed,old.completed+1);assert.equal(r.coins,old.coins);
        assert.equal(r.bossDelaySeconds,old.bossDelaySeconds+3);
      }
      old.choose(oldRoom.options.find(o=>o.correct).id);old.finishTransition();
    }
  }
  assert.equal(wanted.size,0);
});

process.stdout.write(`\n${passed} dungeon engine checks passed.\n`);
