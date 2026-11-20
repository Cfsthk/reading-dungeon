'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Content = require('./dungeon-content.js');
const { AREAS, createBossScene } = Content;
const currentScene = Content.createScene;
// The original catalog remains playable only when finishing an old saved room.
const createLegacyScene = (config = {}) => currentScene({ ...config, legacy: true, legacyControls:true });
const areas = ['crypt', 'tide', 'fungus', 'forge'];
const colors = { 紅色: 'red', 藍色: 'blue', 金色: 'gold', 綠色: 'green' };
const materials = { 石: 'stone', 鐵: 'iron', 木: 'wood', 陶瓷: 'ceramic', 銅: 'copper' };
const itemNames = { box: '箱子', jug: '壺', bottle: '瓶子', key: '鑰匙', book: '書本', gem: '寶石' };
const targets = ['door', 'person', 'door', 'item', 'door', 'person', 'bridge', 'ladder', 'person', 'door'];
const countNames = { 一: 1, 兩: 2 };
const colorName = value => Object.keys(colors).find(key => colors[key] === value);
const materialName = value => Object.keys(materials).find(key => materials[key] === value);

// Interpret the actual displayed Chinese independently of content predicates.
function readConditions(text) {
  const passage = text.match(/刻文寫着：「([^」]+)。」/u);
  assert.ok(passage, 'The complete clue is visible in the instruction.');
  return passage[1].split('，而且').map(clause => {
    let m;
    if ((m = clause.match(/^門身是(石|鐵|木)造的$/u))) return t => t.material === materials[m[1]];
    if ((m = clause.match(/^門上刻着(紅色|藍色|金色|綠色)符文$/u))) return t => t.rune === colors[m[1]];
    if ((m = clause.match(/^門旁共有(一|兩)支火把$/u))) return t => t.torches === countNames[m[1]];
    if (clause === '門旁沒有火把') return t => t.torches === 0;
    if ((m = clause.match(/^其中只有(一|兩)支火把燃亮$/u))) return t => t.lit === countNames[m[1]];
    if (clause === '沒有火把燃亮') return t => t.lit === 0;
    if ((m = clause.match(/^那人戴着(紅色|藍色|金色|綠色)兜帽$/u))) return t => t.hood === colors[m[1]];
    if ((m = clause.match(/^那人的兜帽不是(紅色|藍色|金色|綠色)的$/u))) return t => t.hood !== colors[m[1]];
    if (clause === '那人面朝着你') return t => t.facing === 'front';
    if (clause === '那人背朝着你') return t => t.facing === 'back';
    if (clause === '那人手持提燈') return t => t.carrying === 'lantern';
    if (clause === '那人手持卷軸') return t => t.carrying === 'scroll';
    if ((m = clause.match(/^(?:物品|箱子)是(木|鐵|陶瓷|銅)製的$/u))) return t => t.material === materials[m[1]];
    if ((m = clause.match(/^(?:物品|箱子)繫着(紅色|藍色|綠色)緞帶$/u))) return t => t.decoration === colors[m[1]];
    if ((m = clause.match(/^(?:物品|箱子)沒有(紅色|藍色|綠色)緞帶$/u))) return t => t.decoration !== colors[m[1]];
    if (/^(?:物品|箱子)沒有緞帶$/u.test(clause)) return t => t.decoration === 'none';
    if ((m = clause.match(/^(橋|梯)身是(木|鐵)造的$/u))) return t => t.material === materials[m[2]];
    if ((m = clause.match(/^(橋|梯)上繫着(紅色|藍色|金色|綠色)緞帶$/u))) return t => t.trim === colors[m[2]];
    if ((m = clause.match(/^(門|那人|物品|箱子|橋|梯子)(位於左側|位於右側|不在最左邊|不在最右邊|不在中間|不在左上方|不在左下方|不在最上方|不在最下方)$/u))) {
      const predicates = {
        位於左側: p => p.endsWith('left'), 位於右側: p => p.endsWith('right'),
        不在最左邊: p => !['left', 'far-left'].includes(p), 不在最右邊: p => !['right', 'far-right'].includes(p), 不在中間: p => !['middle', 'middle-left', 'middle-right'].includes(p),
        不在左上方: p => p !== 'upper-left', 不在左下方: p => p !== 'lower-left',
        不在最上方: p => !['upper-left', 'upper-right'].includes(p), 不在最下方: p => !['lower-left', 'lower-right'].includes(p)
      };
      const fn = (_, position) => predicates[m[2]](position);
      fn.spatial = true;
      return fn;
    }
    assert.fail('No visible interpretation for: ' + clause);
  });
}

function assertTraits(option, type) {
  const t = option.traits;
  const positionNames = { left: '左側', middle: '中間', right: '右側', 'far-left': '最左側', 'inner-left': '左側內側', 'inner-right': '右側內側', 'far-right': '最右側', 'upper-left': '左上方', 'middle-left': '左側中間', 'lower-left': '左下方', 'upper-right': '右上方', 'middle-right': '右側中間', 'lower-right': '右下方' };
  const [label, location] = option.label.split('；位置：');
  assert.equal(location, positionNames[option.position], 'Accessible labels expose the same actual position used by the clue.');
  assert.equal(typeof option.position, 'string');
  assert.equal(typeof option.correct, 'boolean');
  assert.doesNotMatch(option.label, /正確|答案|安全|危險|腳印|水痕/u);
  assert.equal(option.boon, undefined);
  if (type === 'door') {
    assert.deepEqual(Object.keys(t).sort(), ['cracked', 'lit', 'material', 'rune', 'torches']);
    assert.ok(['stone', 'iron', 'wood'].includes(t.material));
    assert.ok([0, 1, 2].includes(t.torches) && [0, 1, 2].includes(t.lit) && t.lit <= t.torches);
    assert.ok(t.rune === null || Object.values(colors).includes(t.rune));
    assert.equal(typeof t.cracked, 'boolean');
    if (t.cracked) assert.equal(t.material, 'stone');
    assert.ok(option.label.startsWith(materialName(t.material) + '門'));
  } else if (type === 'person') {
    assert.deepEqual(Object.keys(t).sort(), ['carrying', 'facing', 'hood']);
    assert.ok(Object.values(colors).includes(t.hood));
    assert.ok(['front', 'back'].includes(t.facing));
    assert.ok(['lantern', 'scroll'].includes(t.carrying));
    assert.equal(label, colorName(t.hood) + '兜帽；' + (t.facing === 'front' ? '面朝你' : '背朝你') + '；手持' + (t.carrying === 'lantern' ? '提燈' : '卷軸'));
  } else if (type === 'item') {
    assert.deepEqual(Object.keys(t).sort(), ['decoration', 'material', 'type']);
    assert.ok(['wood', 'iron', 'ceramic', 'copper'].includes(t.material));
    assert.equal(t.type, ['wood', 'iron'].includes(t.material) ? 'box' : 'jug');
    assert.ok(['none', 'red', 'blue', 'green'].includes(t.decoration));
    assert.equal(label, materialName(t.material) + '製' + itemNames[t.type] + '；' + (t.decoration === 'none' ? '沒有緞帶' : '繫着' + colorName(t.decoration) + '緞帶'));
  } else {
    assert.ok(type === 'bridge' || type === 'ladder');
    assert.deepEqual(Object.keys(t).sort(), ['damaged', 'material', 'trim']);
    assert.ok(['wood', 'iron'].includes(t.material));
    assert.ok(Object.values(colors).includes(t.trim));
    assert.equal(t.damaged, false, 'Every crossing starts intact.');
    assert.equal(label, materialName(t.material) + (type === 'bridge' ? '橋' : '梯') + '；' + colorName(t.trim) + '緞帶；結構完整');
  }
  if (!option.correct) assert.equal(option.reward, undefined);
}

function expectedPositions(type, count, arena = false) {
  if (arena && type !== 'door') return type === 'person' ? ['upper-left', 'middle-left', 'lower-left'] : ['upper-right', 'middle-right', 'lower-right'];
  if (count === 2) return ['left', 'right'];
  if (type === 'person' || type === 'item') return count === 3 ? ['upper-left', 'lower-left', 'right'] : ['upper-left', 'lower-left', 'upper-right', 'lower-right'];
  return count === 3 ? ['left', 'middle', 'right'] : ['far-left', 'inner-left', 'inner-right', 'far-right'];
}

function assertGroup(options, type, arena = false) {
  assert.deepEqual(options.map(o => o.position).sort(), expectedPositions(type, options.length, arena).sort());
  assert.equal(new Set(options.map(o => o.id)).size, options.length);
  assert.equal(new Set(options.map(o => JSON.stringify([o.position, o.traits]))).size, options.length);
  options.forEach(option => assertTraits(option, type));
}

function assertClues(text, options, correctId, active = true) {
  const rules = readConditions(text);
  assert.ok(rules.length >= 2 && rules.length <= 4);
  assert.equal(options.filter(o => rules.every(rule => rule(o.traits, o.position))).length, 1);
  for (const o of options) {
    const matched = rules.filter(rule => rule(o.traits, o.position)).length;
    assert.equal(matched === rules.length, o.id === correctId);
    assert.equal(o.correct, active && o.id === correctId);
    if (o.id !== correctId) assert.equal(matched, rules.length - 1, 'Each wrong target misses exactly one written condition.');
  }
  for (const rule of rules.filter(rule => rule.spatial)) {
    const matchingSlots = options.filter(o => rule(o.traits, o.position)).length;
    assert.ok(matchingSlots >= 2 && matchingSlots < options.length,
      'A location clause leaves multiple candidates while excluding at least one slot.');
  }
  // Reordering the data cannot move a target or change a location-dependent answer.
  assert.equal([...options].reverse().find(o => rules.every(rule => rule(o.traits, o.position))).id, correctId);
  return rules;
}

test('browser and CommonJS exports contain eight areas and no ordinary blessing specs', () => {
  const browser = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'dungeon-content.js'), 'utf8'), browser);
  assert.equal(typeof browser.DungeonContent.createBossScene, 'function');
  assert.deepEqual(Object.keys(AREAS), [...areas, 'archive', 'glacier', 'amber', 'astral']);
  assert.deepEqual(Object.keys(browser.DungeonContent.AREAS), Object.keys(AREAS));
  assert.equal(Content.BOONS, undefined);
  assert.equal(browser.DungeonContent.BOONS, undefined);
});

test('24000 legacy ordinary scenes use renderable traits, real positions, one correct answer and partial distractors', () => {
  let scenes = 0;
  const seenClauses = new Set();
  for (let seed = 0; seed < 100; seed += 1) for (const area of areas) for (const difficulty of ['safe', 'danger', 'deep', 'fatal', 'pursuit', 'overrun']) for (let index = 0; index < 10; index += 1) {
    const scene = createLegacyScene({ seed, area, difficulty, index });
    assert.equal(scene.targetType, targets[index]);
    assert.ok([0, 1, 2].includes(scene.backgroundVariant));
    assert.ok(scene.options.length >= 2 && scene.options.length <= 4);
    assertGroup(scene.options, scene.targetType);
    assert.doesNotMatch(scene.prompt, /祝福|提示|腳印|水痕|倒數|限時/u);
    assert.equal(scene.guardian, undefined);
    if (scene.kind === 'choice') assert.ok(scene.options.every(option => option.correct));
    else {
      assert.ok(scene.hint.length > 10, 'A missed reading encounter retains a nonempty automatic hint.');
      assert.match(scene.hint, /核對/u);
      const rules = assertClues(scene.prompt, scene.options, scene.options.find(o => o.correct).id);
      assert.equal(scene.spatialRules.length, rules.filter(rule => rule.spatial).length);
      scene.prompt.match(/刻文寫着：「([^」]+)。」/u)[1].split('，而且').forEach(clause => seenClauses.add(clause));
    }
    scenes += 1;
  }
  assert.equal(scenes, 24000);
  for (const pattern of [/兜帽不是/u, /物品沒有紅色緞帶/u, /左側/u, /不在左上方/u, /上繫着紅色緞帶/u, /陶瓷製/u, /火把燃亮/u]) {
    assert.ok([...seenClauses].some(clause => pattern.test(clause)), 'Varied clue family: ' + pattern);
  }
});

test('legacy stage4 is a story-linked reading event and doors never pay coins', () => {
  for (const area of areas) {
    const scenes = Array.from({ length: 10 }, (_, index) => createLegacyScene({ seed: 'story', area, index }));
    assert.equal(new Set(scenes.map(s => s.title)).size, 10);
    assert.equal(scenes[4].kind, 'reading');
    assert.equal(scenes[4].targetType, 'door');
    assert.match(scenes[4].prompt, /火把/u);
    assert.ok(scenes.every(s => s.options.every(o => !o.boon && o.route !== 'boon')));
    assert.deepEqual(scenes.filter(s => s.kind === 'choice').map(s => s.storyFlags[area + 'Stage']), [2, 9]);
    assert.equal(scenes[0].storyFlags[area + 'Entered'], true);
    assert.equal(scenes[5].storyFlags[area + 'Revealed'], true);
    assert.deepEqual(scenes.slice(6, 9).map(s => s.storyFlags[area + 'Seals']), [1, 2, 3]);
    assert.equal(scenes[9].ending, true);
    assert.equal(scenes[9].storyFlags[area + 'Complete'], true);
    for (const scene of scenes) for (const option of scene.options) {
      assert.equal(option.reward, undefined, 'Doors and ordinary props are not treasure chests.');
      if (scene.kind === 'choice' && option.traits.rune === 'gold') assert.equal(option.route, 'vault');
    }
  }
});

test('taking a treasure route leads to a legible chest decision and only the correctly opened box pays', () => {
  for (let seed = 0; seed < 50; seed += 1) for (const area of areas) for (const fork of [2, 9]) {
    const route = createLegacyScene({ seed, area, index: fork }).options.find(option => option.route === 'vault');
    assert.ok(route.correct && !route.reward);
    const nextArea = route.nextArea || area, stage = fork === 2 ? 3 : 0;
    const config = { seed, area: nextArea, index: fork + 1, storyState: { lastRoute: route.route, areaSteps: { [nextArea]: stage } } };
    const room = createLegacyScene(config);
    assert.ok(room.chestRoom); assert.equal(room.targetType, 'item'); assertGroup(room.options, 'item');
    assert.ok(room.options.every(option => option.traits.type === 'box' && ['wood', 'iron'].includes(option.traits.material)));
    assert.match(room.prompt, /箱子全都緊閉着/u); assert.match(room.prompt, /張口咬人/u);
    const answer = room.options.find(option => option.correct);
    assertClues(room.prompt, room.options, answer.id); assert.equal(answer.reward, 'chest');
    assert.equal(room.options.filter(option => option.reward).length, 1);
    assert.equal(room.collectItem, undefined); assert.equal(room.storyFlags[nextArea + 'RecoveredMap'], true);
    assert.deepEqual(room, createLegacyScene(config), 'Retries cannot expose a mimic in the generated option labels or traits.');
    const paidLegacy = createLegacyScene({ ...config, storyState: { ...config.storyState, lastRoute: 'risk' } });
    assert.ok(!paidLegacy.chestRoom && paidLegacy.options.every(option => !option.reward));
    assert.notEqual(paidLegacy.id, room.id);
  }
});

test('risk and overrun increase visible reading complexity without inventing traits', () => {
  for (const area of areas) for (const index of [0, 1, 4, 5, 8]) {
    const ordinary = createLegacyScene({ seed: 9, area, index, difficulty: 'safe' });
    const overrun = createLegacyScene({ seed: 9, area, index, difficulty: 'overrun' });
    assert.equal(overrun.options.length, 4);
    assert.equal(readConditions(overrun.prompt).length, 4);
    assert.ok(readConditions(ordinary.prompt).length < 4);
    assertClues(overrun.prompt, overrun.options, overrun.options.find(o => o.correct).id);
  }
  for (const index of [0, 1, 3, 6, 7]) {
    const risk = createLegacyScene({ index, storyState: { lastRoute: 'risk' } });
    assert.equal(risk.options.length, 4);
    assert.match(risk.prompt, /密道的石版/u);
    assertClues(risk.prompt, risk.options, risk.options.find(o => o.correct).id);
  }
});

test('every bridge and ladder is intact and clues combine material, ribbon and actual location', () => {
  for (let seed = 0; seed < 100; seed += 1) for (const area of areas) for (const index of [6, 7]) for (const difficulty of ['safe', 'overrun']) {
    const scene = createLegacyScene({ seed, area, index, difficulty });
    assert.equal(scene.terrain, index === 6 ? 'gap' : 'ledge');
    assert.equal(scene.spatialRules.length, 1);
    assert.ok(scene.options.every(option => option.traits.damaged === false));
    const clue = scene.prompt.match(/刻文寫着：「([^」]+)。」/u)[1];
    assert.doesNotMatch(clue, /缺口|斷裂|完整|破損|符文/u);
    assert.match(clue, /緞帶/u);
    assert.match(scene.hint, /緞帶顏色/u);
    assert.doesNotMatch([scene.prompt, scene.hint, ...scene.options.map(option => option.label)].join(' '), /布帶/u);
    assertClues(scene.prompt, scene.options, scene.options.find(o => o.correct).id);
  }
});

// Enumerate independently renderable traits and solve the small assignment
// problem to measure the coverage these particular positions actually permit.
function possibleTraits(type) {
  const variants = [];
  if (type === 'door') {
    for (const material of ['stone', 'wood', 'iron']) for (const rune of [null, 'red', 'blue', 'gold', 'green']) for (const torches of [0, 1, 2]) {
      for (let lit = 0; lit <= torches; lit += 1) for (const cracked of material === 'stone' ? [false, true] : [false]) variants.push({ material, rune, torches, lit, cracked });
    }
  } else if (type === 'person') {
    for (const hood of ['red', 'blue', 'green', 'gold']) for (const facing of ['front', 'back']) for (const carrying of ['lantern', 'scroll']) variants.push({ hood, facing, carrying });
  } else if (type === 'item') {
    for (const material of ['wood', 'iron', 'ceramic', 'copper']) for (const decoration of ['none', 'red', 'blue', 'green']) variants.push({ type: ['wood', 'iron'].includes(material) ? 'box' : 'jug', material, decoration });
  } else {
    for (const material of ['wood', 'iron']) for (const trim of ['red', 'blue', 'gold', 'green']) variants.push({ material, trim, damaged: false });
  }
  return variants;
}

function maximumCoverage(domains, index = 0, covered = new Set()) {
  if (index === domains.length) return covered.size;
  return Math.max(...domains[index].map(ruleIndex => maximumCoverage(domains, index + 1, new Set([...covered, ruleIndex]))));
}

test('distractors contrast as many independent written conditions as their actual slots permit', () => {
  const catalogs = Object.fromEntries(['door', 'person', 'item', 'bridge', 'ladder'].map(type => [type, possibleTraits(type)]));
  for (let seed = 0; seed < 30; seed += 1) for (const area of areas) for (const index of [0, 1, 3, 4, 5, 6, 7, 8]) for (const difficulty of ['safe', 'pursuit', 'overrun']) {
    const scene = createLegacyScene({ seed, area, index, difficulty });
    const rules = readConditions(scene.prompt);
    const wrong = scene.options.filter(option => !option.correct);
    const failures = traits => position => rules.map((rule, i) => rule(traits, position) ? -1 : i).filter(i => i >= 0);
    const domains = wrong.map(option => [...new Set(catalogs[scene.targetType].flatMap(traits => {
      const missed = failures(traits)(option.position);
      return missed.length === 1 ? missed : [];
    }))]);
    const observed = wrong.flatMap(option => failures(option.traits)(option.position));
    assert.equal(new Set(observed).size, maximumCoverage(domains), 'Maximum feasible clause coverage: ' + JSON.stringify({ seed, area, index, difficulty }));
    assert.ok(new Set(wrong.map(option => JSON.stringify(option.traits))).size > 1, 'Wrong targets also differ in visible traits.');
    if (['bridge', 'ladder'].includes(scene.targetType) && scene.options.length === 4) {
      assert.deepEqual([...observed].sort(), [0, 1, 2], 'Material, ribbon, and location each have one counterexample.');
      assert.equal(new Set(scene.options.map(option => option.traits.material)).size, 2);
      assert.ok(new Set(scene.options.map(option => option.traits.trim)).size > 1);
    }
  }
  const regression = createLegacyScene({ seed: 42, area: 'crypt', index: 6, difficulty: 'pursuit' });
  assert.ok(new Set(regression.options.map(option => option.traits.trim)).size > 1, 'Seed42 crossing cannot make the ribbon clause redundant.');
});

test('all sixteen new people, sixteen material/decorated items and eight intact crossings are reachable', () => {
  const people = new Set(), items = new Set(), bridges = new Set(), ladders = new Set(), backgrounds = new Set();
  for (let seed = 0; seed < 150; seed += 1) for (const index of [0, 1, 3, 5, 6, 7, 8]) {
    const scene = createLegacyScene({ seed, index });
    backgrounds.add(scene.backgroundVariant);
    const set = { person: people, item: items, bridge: bridges, ladder: ladders }[scene.targetType];
    if (set) scene.options.forEach(option => set.add(JSON.stringify(option.traits)));
  }
  assert.equal(people.size, 16); assert.equal(items.size, 16); assert.equal(bridges.size, 8); assert.equal(ladders.size, 8);
  assert.deepEqual([...backgrounds].sort(), [0, 1, 2]);
});

test('item pickup stays a story prop and prior legacy item names remain valid narrative inputs', () => {
  for (const area of areas) {
    const state = { areaSteps: { [area]: 3 } };
    const before = JSON.stringify(state);
    const scene = createLegacyScene({ seed: 'prop', area, storyState: state });
    const answer = scene.options.find(o => o.correct);
    assert.equal(JSON.stringify(state), before);
    assert.deepEqual(scene.collectItem, { ...answer.traits, label: answer.label });
    assert.equal(scene.storyFlags.collectedItemType, answer.traits.type);
    assert.equal(scene.storyFlags[area + 'CollectedItemType'], answer.traits.type);
    assert.ok(scene.options.every(o => !o.reward));
    assert.match(scene.successText, /你拿起/u);
    assert.doesNotMatch(createLegacyScene({ area, index: 5 }).prompt, /你帶來的/u);
    for (const type of Object.keys(itemNames)) {
      const later = createLegacyScene({ area, index: 5, storyState: { [area + 'CollectedItemType']: type } });
      assert.ok(later.prompt.includes('你帶來的' + itemNames[type]));
    }
    assert.doesNotMatch(createLegacyScene({ area, index: 5, storyState: { [area + 'CollectedItemType']: '__proto__' } }).prompt, /你帶來的/u);
  }
});

test('6000 arena states keep nine stable targets and a complete three-step plan for unlimited encounters', () => {
  let states = 0;
  for (let seed = 0; seed < 100; seed += 1) for (const area of areas) for (const encounter of [1, 2, 3, 7, 25]) {
    const entry = createBossScene({ seed, area, encounter, round: 1 });
    const stableOptions = scene => scene.options.map(({ correct, ...option }) => option);
    assert.equal(entry.escapeSteps.length, 3);
    for (let round = 1; round <= 3; round += 1) {
      const scene = createBossScene({ seed, area, encounter, round });
      assert.equal(scene.id, entry.id);
      assert.equal(scene.targetType, 'arena'); assert.equal(scene.backgroundRole, 'arena');
      assert.equal(scene.locationName, '燭影競技場');
      assert.equal(scene.currentStep, round); assert.equal(scene.guardian.round, round);
      assert.equal(scene.objective, ['identify', 'unlock', 'escape'][round - 1]);
      assert.doesNotMatch([scene.prompt, scene.hint, scene.successText, ...scene.escapeSteps.map(step => step.text)].join(' '), /護盾|擋下|擋一|抵擋|祝福/u);
      assert.match(scene.escapeSteps[0].text, /解鎖密語/u);
      assert.match(scene.escapeSteps[1].text, /依密語/u);
      if (encounter === 1) {
        assert.ok(scene.escapeSteps[0].text.startsWith('先請指定的同伴說出解鎖密語。'));
        assert.ok(scene.escapeSteps[1].text.startsWith('然後依密語拿起指定封印物，解除出口的鎖。'));
      } else {
        assert.match(scene.escapeSteps[0].text, /密語之前/u);
        assert.match(scene.escapeSteps[1].text, /密語之後、走向門之前/u);
      }
      assert.deepEqual(scene.escapeSteps, entry.escapeSteps);
      assert.deepEqual(stableOptions(scene), stableOptions(entry));
      assert.equal(scene.prompt, '競技場的出口已封鎖。守衛正在甦醒；依次完成刻文中的三步，才能逃離。');
      assert.equal(scene.options.length, 9); assert.equal(scene.options.filter(o => o.correct).length, 1);
      assert.deepEqual(scene.completedOptionIds, scene.escapeSteps.slice(0, round - 1).map(step => step.targetId));
      for (const step of scene.escapeSteps) {
        assert.equal(step.targetType, ['person', 'item', 'door'][step.step - 1]);
        assert.match(step.text, [/^先/u, /^然後/u, /^最後/u][step.step - 1]);
        const group = scene.options.filter(o => o.step === step.step);
        assert.equal(group.length, 3); assertGroup(group, step.targetType, true);
        assert.equal(step.targetId, 'boss-' + step.targetType + '-1');
        assert.equal(assertClues(step.text, group, step.targetId, step.step === round).length, 3);
      }
      assert.ok(scene.options.every(o => !o.reward && !o.boon));
      assert.equal(scene.collectItem, undefined);
      assert.deepEqual(scene.storyFlags, {});
      states += 1;
    }
  }
  assert.equal(states, 6000);
});

test('endless arena IDs/plans stay distinct beyond encounter two and validate invalid counters', () => {
  const ids = new Set(), plans = new Set();
  for (let encounter = 1; encounter <= 100; encounter += 1) {
    const scene = createBossScene({ seed: 'endless', encounter });
    assert.ok(scene.id.startsWith('arena-' + encounter + '-'));
    ids.add(scene.id); plans.add(JSON.stringify(scene.escapeSteps));
    assert.deepEqual(scene, createBossScene({ seed: 'endless', encounter, elapsed: 99999 }));
  }
  assert.equal(ids.size, 100); assert.ok(plans.size > 90);
  for (const encounter of [0, -2, Infinity, NaN, 2.5]) assert.ok(createBossScene({ encounter }).id.startsWith('arena-1-'));
  assert.equal(createBossScene({ round: 999 }).currentStep, 3);
  assert.equal(createBossScene({ round: -1 }).currentStep, 1);
});

test('random destinations stay deterministic and exclude the current area', () => {
  for (const area of areas) {
    const seen = new Set();
    for (let seed = 0; seed < 60; seed += 1) {
      const scene = createLegacyScene({ seed, area, index: 9 });
      const destination = scene.options[0].nextArea;
      assert.ok(destination !== area && areas.includes(destination));
      assert.ok(scene.options.every(option => option.nextArea === destination));
      assert.ok(scene.prompt.includes(AREAS[destination].name));
      assert.deepEqual(scene, createLegacyScene({ seed, area, index: 9 }));
      seen.add(destination);
    }
    assert.deepEqual([...seen].sort(), areas.filter(key => key !== area).sort());
  }
});

test('scene creation is pure, copied, time-independent, and respects explicit local story progress', () => {
  const storyState = { areaSteps: { crypt: 7 }, cryptEntered: true };
  const before = JSON.stringify(storyState);
  const config = { seed: 'pure', index: 47, storyState, area: 'crypt', difficulty: 'overrun' };
  const scene = createLegacyScene(config), pristine = createLegacyScene(config);
  assert.equal(scene.targetType, 'ladder');
  assert.equal(scene.storyFlags.cryptStage, 7);
  assert.deepEqual(scene, createLegacyScene({ ...config, elapsed: 9999 }));
  scene.options[0].traits.trim = 'invalid'; scene.spatialRules[0].value = 'invalid';
  assert.deepEqual(createLegacyScene(config), pristine);
  assert.equal(JSON.stringify(storyState), before);
  const boss = createBossScene({ seed: 'pure', round: 2 });
  const fresh = createBossScene({ seed: 'pure', round: 2 });
  boss.escapeSteps[0].text = 'invalid'; boss.options[0].position = 'invalid';
  assert.deepEqual(createBossScene({ seed: 'pure', round: 2 }), fresh);
});

test('legacy invalid areas use the introduction and repeat visits retain their original story order', () => {
  for (const input of [undefined, {}, { area: '__proto__' }, { area: 'unknown', index: -3 }, { index: Infinity }]) {
    const scene = createLegacyScene(input); assert.equal(scene.area, 'crypt'); assert.equal(scene.storyFlags.cryptStage, 0);
  }
  for (const area of areas) {
    const first = createLegacyScene({ seed: 'repeat', area, index: 0 });
    const later = createLegacyScene({ seed: 'repeat', area, index: 40, storyState: { areaSteps: { [area]: 0 }, [area + 'Complete']: true } });
    assert.notEqual(first.id, later.id); assert.notDeepEqual(first.options, later.options);
    assert.equal(first.title, later.title); assert.match(later.prompt, /更深的一層/u);
  }
});

function visit(seed, area, start = 0, difficulty = 'safe', preferredRoute = 'safe') {
  let step = 0, route = start === 0 ? 'safe' : preferredRoute;
  const result = [];
  do {
    const room = currentScene({ legacyControls:true, seed, area, index: start + step, difficulty, storyState: { lastRoute: route, areaSteps: { [area]: step } } });
    assert.deepEqual(room.progress, { current: ++step, total: result[0]?.progress.total ?? room.progress.total });
    result.push(room);
    if (room.ending) return result;
    route = room.encounterType === 'fork' ? preferredRoute : 'safe';
  } while (step <= 9);
  assert.fail('Every area ends at its gate.');
}

// Read the student-facing short sentences and convert each visible phrase
// into its equivalent condition in the independently tested reference parser.
function translatedClue(scene) {
  const passage = scene.prompt.split('\n')[1];
  assert.ok(passage);
  const kind = scene.encounterType;
  const noun = { door: '門', person: '那人', item: '物品', chest: '箱子', ladder: '梯子', bridge: '橋' }[kind];
  const phrases = passage.replace(/先按這項特徵縮小範圍：|再核對：|下方又補了一句：|記錄列明：|那道門|那人|那件器物|那個錢箱|那架梯子|那座橋|[「」]/gu, '').split(/[。，；]/u).filter(Boolean);
  const rules = phrases.map(phrase => {
    let m;
    if ((m = phrase.match(/^(?:以(石|鐵|木|陶瓷|銅)製成|用的是(石材|鐵|木材|陶瓷|銅))$/u))) {
      const material = (m[1] || m[2]).replace('材', '');
      return kind === 'chest' || kind === 'item' ? noun + '是' + material + '製的' : (kind === 'ladder' ? '梯' : noun) + '身是' + material + '造的';
    }
    if ((m = phrase.match(/^(?:刻着(.色)符文|門上的符文呈(.色))$/u))) return '門上刻着' + (m[1] || m[2]) + '符文';
    if ((m = phrase.match(/^旁邊共掛了(一|兩)支火把$/u))) return '門旁共有' + m[1] + '支火把';
    if (phrase === '旁邊連一支火把也沒有') return '門旁沒有火把';
    if (phrase === '旁邊只有一支火把亮着') return '其中只有一支火把燃亮';
    if (phrase === '旁邊沒有任何火把亮着') return '沒有火把燃亮';
    if ((m = phrase.match(/^(?:兜帽呈(.色)|戴着(.色)兜帽)$/u))) return '那人戴着' + (m[1] || m[2]) + '兜帽';
    if ((m = phrase.match(/^兜帽並非(.色)$/u))) return '那人的兜帽不是' + m[1] + '的';
    if (phrase === '面向你') return '那人面朝着你';
    if (phrase === '背對着你') return '那人背朝着你';
    if ((m = phrase.match(/^手裏拿着(提燈|卷軸)$/u))) return '那人手持' + m[1];
    if (phrase === '沒有繫上任何緞帶') return noun + '沒有緞帶';
    if ((m = phrase.match(/^(繫着|沒有繫上)(.色)緞帶$/u))) {
      return (kind === 'ladder' ? '梯上' : kind === 'bridge' ? '橋上' : noun) + (m[1] === '繫着' ? '繫着' : '沒有') + m[2] + '緞帶';
    }
    if (/^(?:位於|不在)/u.test(phrase)) return noun + phrase;
    assert.fail('Unrecognised visible clue: ' + phrase);
  });
  return '刻文寫着：「' + rules.join('，而且') + '。」';
}

test('historical eight-area saves shuffle independent rooms, length, case, and seven possible onward areas', () => {
  const allAreas = Object.keys(AREAS);
  for (const area of allAreas) {
    const decks = new Set(), lengths = new Set(), cards = new Set(), destinations = new Set(), vaultSides = new Set();
    for (let seed = 0; seed < 100; seed++) {
      const start = seed % 2 === 0 ? 0 : 17;
      const ordinary = visit(seed, area, start, seed % 3 === 0 ? 'overrun' : 'safe');
      const vaults = visit(seed, area, start, 'safe', 'vault');
      assert.ok(ordinary.length >= 6 && ordinary.length <= 9);
      assert.equal(ordinary.filter(room => room.chestRoom).length, 1);
      if (start === 0) assert.equal(ordinary[0].encounterType, 'door');
      const fork = ordinary.findIndex(room => room.encounterType === 'fork');
      assert.ok(fork >= 0 && fork < ordinary.length - 2);
      assert.equal(vaults[fork + 1].encounterType, 'chest');
      assert.ok(vaults.filter(room => room.chestRoom).length >= 2);
      assert.equal(vaults[vaults.length - 1].ending, true);
      for (let i = 1; i < ordinary.length; i++) {
        assert.notEqual(ordinary[i].targetType, ordinary[i - 1].targetType, 'Ordinary room geometry changes at each step.');
        assert.ok(!(vaults[i].chestRoom && vaults[i - 1].chestRoom));
      }
      assert.equal(new Set(ordinary.map(room => room.cardId)).size, ordinary.length);
      lengths.add(ordinary.length);
      decks.add(ordinary.map(room => room.encounterType).join('/'));
      const gate = ordinary.at(-1), destination = gate.options[0].nextArea;
      assert.ok(destination !== area && allAreas.includes(destination));
      assert.ok(gate.options.every(option => option.nextArea === destination));
      assert.ok(gate.prompt.includes(AREAS[destination].name));
      destinations.add(destination);
      for (const scene of ordinary) {
        cards.add(scene.cardId);
        assertGroup(scene.options, scene.targetType);
        assert.ok(!scene.prompt.includes('undefined'));
        if (scene.kind === 'choice') {
          vaultSides.add(scene.options.find(o => o.route === 'vault').position);
          assert.ok(scene.options.every(o => o.correct && !o.reward));
          continue;
        }
        const answer = scene.options.find(option => option.correct);
        assertClues(translatedClue(scene), scene.options, answer.id);
        if (scene.chestRoom) {
          assert.equal(scene.targetType, 'item');
          assert.ok(scene.options.every(option => option.traits.type === 'box'));
          assert.equal(answer.reward, 'chest');
          assert.equal(scene.collectItem, undefined);
        } else {
          assert.ok(scene.options.every(option => !option.reward));
          if (scene.targetType === 'item') assert.deepEqual(scene.collectItem, { ...answer.traits, label: answer.label });
        }
      }
    }
    assert.equal(destinations.size, 7);
    assert.equal(lengths.size, 4);
    assert.ok(decks.size > 55);
    assert.equal(cards.size, 36);
    assert.equal(vaultSides.size, 2);
  }
});

test('new scene answers, gates and arena plans can be reconstructed across saves', () => {
  for (const area of Object.keys(AREAS)) {
    const before = visit('persist', area, 23);
    assert.deepEqual(before, visit('persist', area, 23));
    const revisit = visit('persist', area, 42);
    assert.ok(before.every(room => !revisit.some(other => other.id === room.id)));
    const overstep = currentScene({ seed: 'old-save', area, index: 100, storyState: { areaSteps: { [area]: 10 } } });
    assert.equal(overstep.ending, true);
    const first = createBossScene({ seed: 'preserve-plan', area, encounter: 2 });
    for (let round = 2; round <= 3; round++) {
      const later = createBossScene({ seed: 'preserve-plan', area, encounter: 2, round, legacy: true });
      assert.deepEqual(first.escapeSteps, later.escapeSteps);
      for (const step of later.escapeSteps) assertClues(step.text, later.options.filter(option => option.step === step.step), step.targetId, round === step.step);
    }
  }
});

test('adaptive visits offer all 31 terms in every area and every band with independent observable alternatives', () => {
  const allTerms=Content.LESSON_TARGETS;
  assert.equal(new Set(allTerms).size,31);
  const ratios=new Map();
  const expectedQuantity={至少:(n,v)=>n>=v,至多:(n,v)=>n<=v,恰好:(n,v)=>n===v,不足:(n,v)=>n<v,超過:(n,v)=>n>v};
  const amounts={零:0,一:1,兩:2};
  const contextByTerm=new Map(), signatureTitles=new Set();
  for(const area of Object.keys(Content.AREAS)){
    const seen=new Set();
    for(let seed=0;seed<16;seed++) for(let index=0;index<9;index++){
      const config={curriculum:true,seed,index,area,familiarTargets:allTerms};
      for(const target of Content.lessonTargetsFor(config)) for(const level of [1,2,3]){
        const lesson={target,level},room=Content.createScene({...config,lesson});
        seen.add(target+level);signatureTitles.add(room.title);
        if(!contextByTerm.has(target))contextByTerm.set(target,new Set());
        contextByTerm.get(target).add(room.lesson.situation);
        assert.equal(room.lesson.target,target);assert.equal(room.lesson.level,level);
        assert.ok(!/undefined|null/.test(room.prompt));
        for(const segment of target.split('……'))assert.ok(room.prompt.includes(segment),target+' / '+room.prompt);
        assert.ok(room.options.every(o=>o.label.includes('位置：')));
        const hits=room.options.filter(o=>o.correct);
        assert.equal(hits.length,1);assert.equal(hits[0].targetEvidence,'correct');
        for(const [i] of room.lesson.conditions.entries())assert.ok(room.options.some(o=>!o.correct&&o.matches.every((x,j)=>x===(j!==i))),room.prompt);
        if(expectedQuantity[target]){
          const main=room.lesson.conditions[0],amount=amounts[main.match(/[零一兩]/u)[0]];
          for(const o of room.options){
            const n=o.traits.lit??o.traits.count, matches=expectedQuantity[target](n,amount);
            assert.equal(o.matches[0],matches);
            assert.equal(o.targetEvidence,o.correct?'correct':matches?'neutral':'miss');
            if(target==='至多'&&amount===1&&o.correct)ratios.set(n,true);
          }
        }
        if(target==='只有其中一項'){
          const first=room.prompt.match(/(紅色|藍色|綠色|金色)(?:符文|緞帶)/u)[1];
          const matches=room.options.map(o=>{
            const t=o.traits;
            return [(t.rune??t.trim)===colors[first],t.banded??(t.material==='wood')];
          });
          assert.ok(matches.some(([a,b])=>!a&&!b)&&matches.some(([a,b])=>a&&b));
          room.options.forEach((o,i)=>assert.equal(o.correct,matches[i][0]!==matches[i][1]));
        }
      }
    }
    assert.equal(seen.size,allTerms.length*3,area);
  }
  assert.deepEqual([...ratios.keys()].sort(),[0,1]);
  for(const [target,contexts] of contextByTerm)assert.ok(contexts.size>=3,target+' needs three genuine transfer situations');
  for(const title of ['夜班交更','巡燈封廊','潮表代領','退潮渡口','新菇目擊者','避光育苗','模具返修','鑄造控制台','代還孤本','書庫索引機','搜索接力','冰隙繩橋','蜂房換班','蜂房路標機','彗星目擊者','校準星盤'])assert.ok(signatureTitles.has(title),title);
});

test('saved pre-mixed visits include a usable station in its second slot, even after a vault gate; route choices, chests and unpinned tasks are ungraded',()=>{
  const types=new Set();
  for(const area of Object.keys(Content.AREAS))for(let seed=0;seed<100;seed++)for(const start of [0,20]){
    let viaVault=start>0;
    for(let step=0;step<9;step++){
      const cfg={legacyControls:true,curriculum:true,area,seed,index:start+step,initialBand:1,storyState:{areaSteps:{[area]:step},lastRoute:viaVault?'vault':null}};
      const room=Content.createScene(cfg);
      assert.equal(room.lesson,undefined);
      if(step===1){assert.ok(['sluice','cart','signal'].includes(room.targetType));types.add(room.targetType);}
      if(room.encounterType==='bridge')assert.deepEqual(Content.lessonTargetsFor(cfg),[]);
      if(room.kind==='choice'||room.chestRoom)assert.deepEqual(Content.lessonTargetsFor(cfg),[]);
      if(room.chestRoom){
        assert.ok(room.options.every(o=>o.traits.type==='box'&&o.targetEvidence==='neutral'));
        assert.equal(room.options.filter(o=>o.correct&&o.reward==='chest').length,1);
        assert.equal(room.options.length,2);
      }else assert.ok(room.options.every(o=>!o.reward));
      if(room.ending){assert.ok(step>=5&&step<=8);break;}
      viaVault=room.encounterType==='fork';
    }
  }
  assert.equal(types.size,3);
});

test('saved revision 13 routes protect an early activity in every area, including after a vault; each fork can still lead to a second chest', () => {
  for (const area of Object.keys(AREAS)) {
    const seen = new Set(), lengths = new Set(), places = new Set();
    let sawTwo = false;
    for (let seed = 0; seed < 80; seed++) {
      let vault = seed % 2 === 0, mandatoryChest = false, forkVault = false, previous = '';
      const obstacles = [];
      for (let step = 0; step < 9; step++) {
        const cfg = { legacyControls:true, curriculum: true, obstacles: true, area, seed, index: 30 + step, initialBand: 1,
          storyState: { areaSteps: { [area]: step }, lastRoute: vault ? 'vault' : 'safe' } };
        const scene = Content.createScene(cfg);
        assert.deepEqual(Content.createScene(cfg), scene);
        if (previous === 'fork') { assert.ok(scene.chestRoom); forkVault = true; }
        if (!vault && scene.chestRoom) mandatoryChest = true;
        if (scene.obstacle) {
          seen.add(scene.targetType); places.add(step); obstacles.push(step);
          assert.equal(scene.obstacle.kind, scene.targetType);
          assert.equal(scene.options.length, 2);
          assert.equal(scene.lesson, undefined);
          assert.deepEqual(Content.lessonTargetsFor(cfg), []);
          assert.ok(scene.prompt.length <= 35, scene.prompt);
        }
        if (scene.ending) { lengths.add(step + 1); break; }
        previous = scene.encounterType; vault = previous === 'fork';
      }
      assert.ok([1, 2].includes(obstacles[0]), 'an early obstacle survives either route');
      if (obstacles.length === 2) { sawTwo = true; assert.ok(obstacles[1] - obstacles[0] >= 2); }
      assert.ok(mandatoryChest && forkVault);
    }
    assert.equal(sawTwo, true, area);
    assert.deepEqual([...seen].sort(), ['feeding', 'floodgate']);
    assert.equal(places.has(1) && places.has(2), true);
    assert.deepEqual([...lengths].sort(), [6, 7, 8, 9]);
  }
});

test('blocked room actions match the visible tray, bell, lever and receiving pool, with short and inference rooms for older pupils', () => {
  const types = ['feeding', 'floodgate'];
  const counts = Object.fromEntries(types.map(t => [t, { simple: new Set(), story: new Set(), scored: new Set() }]));
  const answerSlots = new Map();
  for (let seed = 0; seed < 160; seed++) for (const index of [1, 2]) for (const initialBand of [1, 2, 3]) {
    const config = { seed, index, initialBand, curriculum: true, obstacles: true, area: 'amber', familiarTargets: Content.LESSON_TARGETS };
    const ordinary = Content.createScene(config);
    if (!ordinary.obstacle) continue;
    const type = ordinary.targetType, feeding = type === 'feeding', terms = Content.lessonTargetsFor(config);
    for (const target of [null, ...terms]) for (const level of target ? [1, 2, 3] : [initialBand]) {
      const lesson = target ? { target, level } : null, scene = Content.createScene({ ...config, lesson });
      const answer = scene.options.filter(o => o.correct);
      assert.equal(answer.length, 1);
      const choice = answer[0], options = scene.options;
      const key = type + '-' + options.length;
      if (!answerSlots.has(key)) answerSlots.set(key, new Set());
      answerSlots.get(key).add(choice.position);
      assert.equal(scene.obstacle.band, level);
      if (feeding) assert.equal(scene.obstacle.food, 'fish');
      if (target) {
        assert.equal(scene.lesson.target, target);assert.ok(scene.prompt.includes(target));
        counts[type].scored.add(target + level);
        for (let i = 0; i < scene.lesson.conditions.length; i++)
          assert.ok(options.some(o => o.matches.every((m, j) => m === (i !== j))));
      } else {
        assert.equal(scene.lesson, undefined);
        counts[type][options.length === 2 ? 'simple' : 'story'].add(initialBand);
      }
      assert.ok(options.every(o => o.label.includes('位置：') && !o.reward));
      assert.ok(choice.traits.colour === 'red' || choice.traits.colour === 'blue');
      assert.equal(feeding ? choice.traits.bell : choice.traits.basin, feeding ? false : 'empty');
      for (const o of options) {
        const colourMatches = o.traits.colour === choice.traits.colour;
        const detailMatches = feeding ? !o.traits.bell : o.traits.basin === 'empty';
        assert.equal(o.correct, colourMatches && detailMatches);
        const meaning = detailMatches ? (feeding ? 'sniff' : 'trickle') : (feeding ? 'bell' : 'surge');
        assert.equal(o.response, o.correct ? (feeding ? 'fed' : 'drain') : meaning);
        assert.equal(o.targetEvidence, target ?
          o.correct ? 'correct' : colourMatches && target !== '同時符合' ? 'neutral' : 'miss' : 'neutral');
      }
    }
  }
  for (const type of types) {
    assert.equal(counts[type].scored.size, 12);
    assert.deepEqual([...counts[type].simple].sort(), [1, 2, 3]);
    assert.deepEqual([...counts[type].story].sort(), [2, 3]);
    assert.equal(answerSlots.get(type + '-2').size, 2);
    assert.equal(answerSlots.get(type + '-3').size, 3);
  }
});

test('saved revision 14 visits rotate all twelve drawn activities, honour optional vaults and require the seal and the final reading choice', () => {
  const pool=['door','person','item','bridge','ladder','sluice','signal','cart','feeding','floodgate','chest','fork'].sort();
  const openings=new Set(),secondRooms=new Set(),checkpointTypes=new Set(),cards=new Map(),lengths=new Set();
  let checkedGates=0,bonusBeforeCheckpoint=0,visitsWithoutChest=0,visitsWithoutFork=0;
  for(let seed=0;seed<60;seed++){
    let area=Object.keys(AREAS)[seed%8],index=0,bag=[],lastDraw=null;
    const state={areaSteps:{[area]:0}};
    for(let visit=0;visit<8;visit++){
      let previous,entered=false,gotChest=false,gotFork=false,bonuses=0;
      for(let j=0;j<16;j++){
        const config={legacyControls:true,curriculum:true,obstacles:true,mixed:true,area,seed,index,initialBand:1+seed%3,storyState:state};
        const available=Content.lessonTargetsFor({...config,familiarTargets:Content.LESSON_TARGETS});
        const lesson=available.length?{target:available[seed%available.length],level:1+seed%3}:null;
        const s=Content.createScene({...config,lesson});
        assert.ok(s.lockedExit);assert.deepEqual(Content.createScene({...config,lesson}),s);
        if(!j&&!visit)openings.add(s.encounterType);
        if(j===1)secondRooms.add(s.encounterType);
        if(state.lastRoute==='vault'){assert.equal(s.chestRoom,true);bonuses++;}
        const cursor=state.nextQuestDraw||0;
        if(s.storyFlags.nextQuestDraw===cursor+1){
          assert.ok(!bag.includes(s.encounterType));
          assert.notEqual(s.encounterType,lastDraw);
          if(lastDraw==='fork')assert.notEqual(s.encounterType,'chest');
          lastDraw=s.encounterType;
          bag.push(s.encounterType);
          if(bag.length===12){assert.deepEqual(bag.slice().sort(),pool);bag=[];}
        }else assert.equal(s.storyFlags.nextQuestDraw,cursor);
        if(s.checkpoint){if(previous?.chestRoom&&previous.storyFlags.lastQuest==='fork')bonusBeforeCheckpoint++;checkpointTypes.add(s.targetType);assert.equal(s.options.filter(o=>o.correct).length,1);assert.ok(s.storyFlags.gateSealFor);}
        if(s.encounterType==='chest'&&state.lastRoute!=='vault')gotChest=true;
        if(s.encounterType==='fork')gotFork=true;
        const good=s.options.filter(o=>o.correct);
        let choice=good[0];
        if(s.encounterType==='fork')choice=good.find(o=>o.route===(seed%2?'vault':'safe'));
        if(s.areaGate){
          checkedGates++;
          assert.ok(previous.checkpoint&&s.ending&&s.kind==='reading');
          if(!gotChest)visitsWithoutChest++;if(!gotFork)visitsWithoutFork++;
          assert.equal(good.length,1);assert.ok(choice.nextArea&&choice.nextArea!==area);
          assert.ok(s.options.filter(o=>!o.correct).every(o=>!o.nextArea));
          assert.equal(s.gateConditions.length,seed%3===2?3:2);
          assert.equal(s.options.length,s.gateConditions.length+1);
          const stripped=Content.createScene({...config,storyState:{...state,gateSealFor:''}});
          assert.ok(stripped.checkpoint&&!stripped.ending&&stripped.options.every(o=>!o.nextArea));
          for(const [k] of s.gateConditions.entries())assert.ok(s.options.some(o=>o.matches.every((yes,i)=>yes===(i!==k))));
          assert.equal(s.progress.current,s.progress.total);
          lengths.add(j+1-bonuses);entered=true;
        }
        if(!s.checkpoint&&s.cardId===s.encounterType+'-'+s.cardId.split('-').at(-1)){
          if(!cards.has(s.encounterType))cards.set(s.encounterType,new Set());
          cards.get(s.encounterType).add(s.title);
        }
        Object.assign(state,s.storyFlags);state.lastRoute=choice.route;state.route=choice.route;state.areaSteps[area]++;index++;
        previous=s;
        if(choice.nextArea){area=choice.nextArea;state.areaSteps[area]=0;break;}
      }
      assert.ok(entered);
    }
  }
  assert.ok(bonusBeforeCheckpoint>0&&visitsWithoutChest>0&&visitsWithoutFork>0);
  assert.equal(checkedGates,480);assert.deepEqual([...lengths].sort((a,b)=>a-b),[8,9,10,11]);
  assert.ok(openings.size>=5&&secondRooms.size>=10);assert.equal(openings.has('bridge'),false);
  assert.deepEqual([...checkpointTypes].sort(),['item','person','signal','sluice']);
  for(const name of ['認領失物','口信交給誰','找嚮導','交換暗號','那位目擊者'])assert.ok(cards.get('person').has(name));
  for(const name of ['借還登記','寄存憑據','展品歸位'])assert.ok(cards.get('item').has(name));
  for(const name of ['承重試驗','巡橋筆記'])assert.ok(cards.get('bridge').has(name));
});

test('the one roadblocking minecart takes nearby colour and direction levers, with direct and compound instructions at different bands',()=>{
  const answers=new Set(),responses=new Set(),termBands=new Set(),modes=new Set();
  for(const initialBand of [1,2,3])for(let seed=0;seed<300;seed++){
    const config={curriculum:true,obstacles:true,mixed:true,initialBand,area:'crypt',seed,index:0,familiarTargets:Content.LESSON_TARGETS};
    const first=Content.createScene(config);
    if(first.targetType!=='cart')continue;
    for(const target of [null,...Content.lessonTargetsFor(config)]){
      const s=Content.createScene({...config,lesson:target?{target,level:initialBand}:null});
      assert.equal(s.obstacle.kind,'cart');assert.ok(s.prompt.includes('礦車')&&s.prompt.includes('拉桿'));
      assert.ok(!s.prompt.includes('派出'));
      const correct=s.options.find(o=>o.correct);
      answers.add(correct.position);modes.add([initialBand,s.options.length].join('/'));
      if(target){termBands.add(target+initialBand);assert.ok(s.prompt.includes(target));}
      for(const o of s.options){
        assert.ok(o.label.includes('拉桿')&&o.label.includes('箭頭')&&o.label.includes('位置：'));
        assert.ok(['left','right'].includes(o.traits.direction));
        const colour=o.traits.colour===correct.traits.colour,dir=o.traits.direction===s.obstacle.direction;
        assert.equal(o.correct,colour&&dir);responses.add(o.response);
        assert.equal(o.response,o.correct?'roll':colour?'brake':'clank');
      }
    }
  }
  assert.deepEqual([...responses].sort(),['brake','clank','roll']);assert.equal(answers.size,3);assert.equal(termBands.size,12);
  assert.ok(['1/2','2/2','2/3','3/2','3/3'].every(x=>modes.has(x)));
});

test('same-room clue sources, action targets and depth mix are consistent across complete journeys', () => {
  const observed = new Map(), location = new Set(), gateAreas = new Set();
  const total = [0,0,0], paired = [0,0,0], cartAnswers = new Set();
  const mined = new Map();
  const clueMatches = (prompt,t) => {
    const hood = prompt.match(/戴(紅色|藍色|金色|綠色)兜帽/u);
    if (hood) return t.hood === colors[hood[1]];
    if (prompt.includes('手持提燈')) return t.carrying === 'lantern';
    if (prompt.includes('手持卷軸')) return t.carrying === 'scroll';
    if (prompt.includes('面向你')) return t.facing === 'front';
    if (prompt.includes('背向你')) return t.facing === 'back';
    const material = prompt.match(/(木|鐵)製的記錄箱/u);
    if (material) return t.material === materials[material[1]];
    const ribbon = prompt.match(/繫着(紅色|藍色|綠色)緞帶/u);
    if (ribbon) return t.decoration === colors[ribbon[1]];
    assert.ok(prompt.includes('沒有緞帶'));
    return t.decoration === 'none';
  };
  for (let seed=0; seed<64; seed++) {
    let area = Object.keys(AREAS)[seed%8];
    const state = {areaSteps:{[area]:0}}, bag = [];
    for (let index=0; index<52; index++) {
      const config = {seed, index, area, initialBand:1+seed%3, storyState:state, chained:true, mixed:true,
        obstacles:true, curriculum:true, familiarTargets:Content.LESSON_TARGETS};
      const vocabulary = Content.lessonTargetsFor(config);
      config.lesson = vocabulary.length ? {target:vocabulary[(index+seed)%vocabulary.length],level:config.initialBand} : null;
      let s = Content.createScene(config);
      const bracket = index < 8 ? 0 : index < 18 ? 1 : 2;
      total[bracket]++;
      if (index < 2) assert.ok(!s.chain && ['sluice','signal','cart','feeding','floodgate'].includes(s.targetType));
      if (['door','dispatch','gate'].includes(s.encounterType)) assert.ok(s.chain);
      if (state.lastRoute === 'vault') assert.ok(s.chestRoom && !s.chain);
      if (s.chain) {
        paired[bracket]++;
        const first = s;
        assert.equal(s.questStep,1); assert.equal(s.questTotal,2);
        assert.deepEqual(s.storyFlags,{}); assert.equal(s.lesson,undefined); assert.equal(s.ending,undefined);
        assert.equal(s.collectItem,undefined); assert.equal(s.chestRoom,undefined);
        assert.equal(s.chain.sourceType,s.targetType); assert.equal(s.options.length,2);
        const answer = s.options.filter(o => clueMatches(s.prompt,o.traits));
        assert.equal(answer.length,1); assert.equal(answer[0].id,s.chain.sourceId); assert.ok(answer[0].correct);
        location.add(answer[0].position);
        if (!observed.has(s.encounterType)) observed.set(s.encounterType,new Set());
        observed.get(s.encounterType).add(s.targetType);
        s = Content.createScene({...config, questStep:2});
        assert.deepEqual(s,Content.createScene({...config,questStep:2}));
        assert.equal(s.id,first.id); assert.equal(s.backgroundVariant,first.backgroundVariant); assert.equal(s.terrain,first.terrain);
        assert.equal(s.questStep,2); assert.equal(s.questTotal,2); assert.equal(s.chain.sourceId,answer[0].id);
        assert.equal(s.targetType,first.chain.actionType); assert.ok(s.prompt.includes(s.chain.sourceName));
        assert.deepEqual(s.options,first.chain.actionOptions);
        assert.equal(s.options.some(o => first.options.some(f => f.id === o.id)),false);
        assert.equal(s.options.filter(o=>o.correct).length,1);
        if (config.lesson) assert.deepEqual([s.lesson.target,s.lesson.level],[config.lesson.target,config.lesson.level]);
        if (s.areaGate) gateAreas.add(s.area);
        if (s.encounterType === 'cart') {
          const lever = s.options.find(o=>o.correct).traits;
          assert.equal(first.chain.sourceName,'礦工'); assert.ok(s.prompt.includes('拉桿'));
          assert.equal(s.obstacle.direction,lever.direction);
          assert.equal(first.obstacle,undefined); assert.deepEqual(first.chain.actionObstacle,s.obstacle);
          const mark = lever.colour+'-'+lever.direction;
          cartAnswers.add(mark);
          if (!mined.has(first.prompt)) mined.set(first.prompt,new Set());
          mined.get(first.prompt).add(mark);
        }
      }
      if (s.storyFlags.nextQuestDraw === (state.nextQuestDraw || 0) + 1) {
        bag.push(s.encounterType);
        if (bag.length === 12) { assert.equal(new Set(bag).size,12); bag.length=0; }
      }
      const correct = s.options.filter(o=>o.correct);
      assert.equal(correct.length,1);
      assert.ok(s.options.every(o=>o.route==='safe'),s.prompt);
      const choice=correct[0];
      Object.assign(state,s.storyFlags); state.lastRoute=choice.route; state.areaSteps[area]++;
      if (choice.nextArea) { area=choice.nextArea; state.areaSteps[area]=0; }
    }
  }
  assert.equal(gateAreas.size,8); assert.equal(location.size,2); assert.equal(cartAnswers.size,4);
  assert.ok([...mined.values()].some(answers=>answers.size>=3),'the same first clue can lead to different lever instructions');
  assert.deepEqual([...observed.keys()].sort(),['cart','chest','dispatch','door','feeding','floodgate','gate','signal','sluice']);
  for (const type of ['door','dispatch','feeding','floodgate','sluice','signal']) assert.equal(observed.get(type).size,2);
  const rates = paired.map((n,i)=>n/total[i]);
  assert.ok(rates[0]<.36 && rates[1]>rates[0]+.12 && rates[2]>rates[1]+.08 && rates[2]<.8, String(rates));
});

test('all active itineraries replace free path preferences with dispatch and preserve earned clue sources and onward areas',()=>{
  for(const settings of [{legacy:true},{},{curriculum:true},{curriculum:true,obstacles:true},
      {curriculum:true,obstacles:true,mixed:true},{curriculum:true,obstacles:true,mixed:true,chained:true}]){
    let replaced=0;
    const locales=settings.legacy?areas:Object.keys(AREAS);
    for(const area of locales)for(let seed=0;seed<16;seed++)for(let index=0;index<10;index++){
      const cfg={...settings,seed,area,index,initialBand:1+seed%3,questStep:2};
      const old=Content.createScene({...cfg,legacyControls:true});
      const scene=Content.createScene(cfg);
      assert.equal(scene.options.filter(o=>o.correct).length,1,scene.prompt);
      assert.ok(scene.options.every(o=>o.route==='safe'),scene.prompt);
      assert.doesNotMatch(scene.prompt,/想走哪條路|打算走哪條路|兩條路各通往/u);
      if(old.kind!=='choice')continue;
      replaced++;
      assert.equal(scene.id,old.id);
      assert.equal(scene.targetType,'dispatch');
      assert.equal(scene.kind,'reading');
      assert.equal(scene.lockedExit,true);
      assert.match(scene.prompt,/派出.*礦車/u);
      assert.match(scene.prompt,/出口便會打開/u);
      assert.deepEqual(scene.options.filter(o=>o.correct).map(o=>o.nextArea),[old.options[0].nextArea]);
      assert.ok(!scene.obstacle);
      for(const o of scene.options){
        assert.ok(Object.values(colors).includes(o.traits.rune));
        assert.ok(Number.isInteger(o.traits.count));
        assert.equal(typeof o.traits.banded,'boolean');
        assert.equal(o.reward,undefined);
      }
      if(old.chain){
        assert.equal(scene.chain.sourceId,old.chain.sourceId);
        assert.equal(scene.chain.sourceType,old.chain.sourceType);
        assert.deepEqual(scene.chain.sourceOptions,old.chain.sourceOptions);
        assert.ok(['調車員','派車單'].includes(scene.chain.sourceName));
      }
    }
    assert.ok(replaced>0);
  }
});

test('mounted signs use a button in every area while matching the visible craft clues from older saves',()=>{
  const words=['鑲嵌','纏繞','交錯','深淺相間','對稱','相同','相異'];
  for(const area of Object.keys(AREAS)){
    let cfg;
    for(let seed=0;seed<100&&!cfg;seed++) for(let index=0;index<7&&!cfg;index++){
      const candidate={curriculum:true,seed,area,index};
      if(Content.lessonTargetsFor(candidate).includes('纏繞'))cfg=candidate;
    }
    assert.ok(cfg,area);
    for(const target of words)for(const level of [1,2,3]){
      const input={...cfg,lesson:{target,level}};
      const old=Content.createScene({...input,legacyControls:true}),current=Content.createScene(input);
      assert.equal(old.targetType,'item');assert.ok(old.collectItem);
      assert.equal(current.id,old.id);assert.equal(current.targetType,'console');
      assert.equal(current.collectItem,undefined);assert.ok(current.lockedExit);
      assert.match(current.prompt,/按下機上的按鈕開門/u);
      assert.doesNotMatch(current.prompt,/取出|取走|配件|帶走|拿取/u);
      assert.deepEqual(current.options.map(o=>[o.id,o.position,o.traits,o.correct]),
        old.options.map(o=>[o.id,o.position,o.traits,o.correct]));
      if(target==='深淺相間'){
        const match=current.options.find(o=>o.correct);
        assert.equal(match.traits.pattern,'alternating');
        assert.ok(current.options.some(o=>o.traits.pattern==='grouped'&&!o.correct));
      }
    }
    const loose=Content.createScene(cfg);
    assert.equal(loose.targetType,'item');assert.ok(loose.collectItem);
  }
});
