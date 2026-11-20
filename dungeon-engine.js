/* Deterministic, DOM-free rules for an endless reading dungeon. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./dungeon-content.js'), require('./dungeon-learning.js'));
  } else {
    root.DungeonEngine = factory(root.DungeonContent, root.DungeonLearning);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Content, Learning) {
  'use strict';

  const VERSION = 17;
  const INTENSITY_SECONDS = 480;
  const MAX_ELAPSED = Number.MAX_SAFE_INTEGER;
  const MAX_ENCOUNTERS = Math.floor(MAX_ELAPSED / 180);
  const BOSS_INTERVAL = 180;
  const SCENE_BOSS_DELAY_SECONDS = 3;
  const BOSS_ROUNDS = 3;
  const BOSS_ENTRANCE_SECONDS = 1.1;
  const BOSS_READING_SECONDS = 8;
  const BOSS_FLIGHT_SECONDS = 2;
  const BOSS_COOLDOWN_SECONDS = 5;
  const MAX_CHEST_COINS = 5;
  const MAX_RECORDS = 128;
  const MAX_COINS = Number.MAX_SAFE_INTEGER;
  const REASONS = ['timeout', 'fatal', 'hearts', 'quit'];
  const ROOM_KEYS = ['scene', 'sceneEnteredAt', 'lockedPenalty', 'lockedTier', 'attempts', 'hintShown'];

  function penaltyForTarget(type) {
    return ['door', 'sluice', 'cart', 'signal', 'feeding', 'floodgate', 'dispatch', 'console'].includes(type) ? 0 : type === 'bridge' ? 'fatal' : 1;
  }

  function tierAt(elapsed, index) {
    if ((index === undefined ? 2 : index) < 2) return 'safe';
    if (elapsed < 180) return 'danger';
    if (elapsed < 270) return 'deep';
    if (elapsed < 390) return 'fatal';
    if (elapsed >= INTENSITY_SECONDS) return 'overrun';
    return 'pursuit';
  }

  function integer(value, min, max) {
    return Number.isSafeInteger(value) && value >= min && value <= max;
  }

  function number(value, min, max) {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  }

  function validSeed(seed) {
    return (typeof seed === 'string' && seed.length > 0 && seed.length <= 128) ||
      (typeof seed === 'number' && Number.isSafeInteger(seed));
  }

  function newSeed() {
    return Date.now().toString(36) + '-' + Math.floor(Math.random() * 0x100000000).toString(36);
  }

  function hash(seed) {
    let result = 2166136261;
    for (const character of String(seed)) {
      result ^= character.charCodeAt(0);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  function areaIds() {
    if (!Content || typeof Content.createScene !== 'function' || !Content.AREAS) {
      throw new Error('DungeonContent must be loaded before DungeonEngine.');
    }
    const ids = Array.isArray(Content.AREAS) ? Content.AREAS.map(area => area.id) : Object.keys(Content.AREAS);
    if (!ids.length || ids.some(id => typeof id !== 'string')) throw new Error('DungeonContent has no valid areas.');
    return ids;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function safeObject(value, depth) {
    if (depth > 8) return false;
    if (value === null || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string') return value.length <= 4096;
    if (Array.isArray(value)) return value.length <= 128 && value.every(item => safeObject(item, depth + 1));
    if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
    const keys = Object.keys(value);
    return keys.length <= 128 && keys.every(key =>
      !['__proto__', 'prototype', 'constructor'].includes(key) && key.length <= 128 && safeObject(value[key], depth + 1));
  }

  function pacingAt(elapsed) {
    const overrun = elapsed >= INTENSITY_SECONDS;
    return Object.freeze({ overrun, readingSeconds: overrun ? 6 : BOSS_READING_SECONDS,
      flightSeconds: BOSS_FLIGHT_SECONDS, cooldownSeconds: BOSS_COOLDOWN_SECONDS });
  }

  function validScene(scene) {
    return scene && typeof scene.id === 'string' && Array.isArray(scene.options) &&
      scene.options.length >= 2 && scene.options.length <= 9 &&
      new Set(scene.options.map(option => option.id)).size === scene.options.length &&
      scene.options.every(option => typeof option.id === 'string' && typeof option.correct === 'boolean') &&
      scene.options.some(option => option.correct);
  }

  function deadline(from, delay) { return Math.min(MAX_ELAPSED, from + BOSS_INTERVAL + delay); }
  function onSchedule(value, from, delay) {
    if (!number(value, deadline(from, 0), deadline(from, delay))) return false;
    if (value === MAX_ELAPSED) return true;
    const credits = (value - deadline(from, 0)) / SCENE_BOSS_DELAY_SECONDS;
    return Math.abs(Math.round(credits) - credits) < 1e-8;
  }
  function bossTier(encounter) { return encounter === 1 ? 'boss' : 'final-boss'; }

  function validArena(scene, round) {
    if (!validScene(scene) || scene.boss !== true || scene.targetType !== 'arena' || scene.options.length !== 9 ||
        scene.currentStep !== round || !Array.isArray(scene.escapeSteps) || scene.escapeSteps.length !== 3 ||
        !Array.isArray(scene.completedOptionIds)) return false;
    const targetTypes = ['person', 'item', 'door'];
    return scene.escapeSteps.every((step, index) => {
      const targets = scene.options.filter(option => option.step === index + 1);
      return step.step === index + 1 && step.targetType === targetTypes[index] && typeof step.text === 'string' &&
        targets.length === 3 && targets.every(option => option.targetType === step.targetType &&
          option.correct === (index + 1 === round && option.id === step.targetId)) && targets.some(option => option.id === step.targetId);
    }) && JSON.stringify(scene.completedOptionIds) === JSON.stringify(scene.escapeSteps.slice(0, round - 1).map(step => step.targetId));
  }

  class Run {
    constructor(options) {
      options = options || {};
      const ids = areaIds();
      this.seed = validSeed(options.seed) ? options.seed : newSeed();
      this.coins = 0;
      this.hp = 3;
      this.elapsed = 0;
      this.index = 0;
      this.completed = 0;
      this.area = ids.includes(options.area) ? options.area : ids[hash(this.seed) % ids.length];
      this.phase = 'entrance';
      this.legacyLayout = false;
      this.curriculum = true;
      this.obstacles = true;
      this.mixed = true;
      this.chained = true;
      this.questStep = 1;
      this.questSourceId = null;
      this.lesson = null;
      this.learning = new Learning.Profile(Content.LESSON_TARGETS, options.learning, options.initialBand);
      this.reason = null;
      this.records = [];
      this.storyState = { areaSteps: { [this.area]: 0 } };
      this.lastResult = null;
      this._pending = null;
      this.encounters = 0;
      this.bossCountdownFrom = 0;
      this.nextBossAt = BOSS_INTERVAL;
      this.bossDelaySeconds = 0;
      this.bossDueAt = null;
      this.boss = null;
      this._suspended = null;
      this.impactSerial = 0;
      this.lastImpact = null;
      this._impacts = [];
      this.sceneEnteredAt = 0;
      this.lockedPenalty = 0;
      this.lockedTier = 'safe';
      this.attempts = 0;
      this.hintShown = false;
      this.scene = { id: 'entrance', kind: 'entrance', targetType: 'entrance', area: this.area,
        title: '地牢入口', locationName: '地牢入口', options: [] };
    }

    setStartingBand(band) {
      return this.phase === 'entrance' && this.learning.setStartingBand(band);
    }

    enterDungeon() {
      if (this.phase !== 'entrance') return false;
      this.phase = 'playing';
      this._enterScene();
      return true;
    }

    get nextBossIn() {
      return this.bossDueAt === null ? Math.max(0, Math.min(MAX_ELAPSED - this.elapsed,
        BOSS_INTERVAL + this.bossDelaySeconds - (this.elapsed - this.bossCountdownFrom))) : 0;
    }

    get pacing() { return pacingAt(this.elapsed); }

    get bossProjectile() {
      if (!this.boss) return null;
      if (this.elapsed < this.boss.readingEndsAt) return { phase: 'reading', progress: 0,
        remaining: this.boss.readingEndsAt - this.elapsed, cycle: 0 };
      const elapsed = this.elapsed - this.boss.projectileStartedAt;
      const { flightSeconds, cooldownSeconds } = this.boss.pacing;
      const duration = flightSeconds + cooldownSeconds;
      const cycle = Math.floor(elapsed / duration) + 1;
      const within = elapsed - (cycle - 1) * duration;
      if (within < flightSeconds) return { phase: 'flight', progress: within / flightSeconds, remaining: flightSeconds - within, cycle };
      return { phase: 'cooldown', progress: (within - flightSeconds) / cooldownSeconds,
        remaining: duration - within, cycle };
    }

    getBossImpacts(afterSerial) {
      const after = afterSerial === undefined ? 0 : afterSerial;
      if (!integer(after, 0, Number.MAX_SAFE_INTEGER)) return [];
      return clone(this._impacts.filter(impact => impact.serial > after));
    }

    _roomConfig() {
      return { seed: this.seed, index: this.index, elapsed: this.sceneEnteredAt, area: this.area,
        storyState: clone(this.storyState), difficulty: this.lockedTier, legacy: this.legacyLayout,
        curriculum: this.curriculum, obstacles: this.obstacles, mixed: this.mixed, chained: this.chained,
        questStep: this.questStep, initialBand: this.learning.initialBand };
    }

    _advanceRoomSet(route) {
      // Finish an old fork's promised treasure room before switching its itinerary.
      this.legacyLayout = this.legacyLayout && route === 'vault';
      this.curriculum = !this.legacyLayout && (this.curriculum || route !== 'vault');
      this.obstacles = this.curriculum && (this.obstacles || route !== 'vault');
    }

    _selectLesson() {
      if (this.boss || !this.curriculum || this.legacyLayout || !Content.lessonTargetsFor) return null;
      const candidates = Content.lessonTargetsFor({ ...this._roomConfig(), familiarTargets: this.learning.familiarTargets });
      let state = hash([this.seed, this.area, this.index, this.learning.sequence].join(':'));
      const random = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
      };
      return this.learning.choose(candidates, random);
    }

    _buildScene(legacyControls = false) {
      const scene = this.boss ? Content.createBossScene({
        seed: this.seed,
        area: this.area,
        encounter: this.boss.encounter,
        round: this.boss.round,
        difficulty: this.lockedTier, legacy: this.legacyLayout, readingBand: this.boss.readingBand
      }) : Content.createScene({ ...this._roomConfig(), ...(legacyControls ? { legacyControls: true } : {}), lesson: this.lesson });
      if (!validScene(scene) || (this.boss ? !validArena(scene, this.boss.round) : scene.options.length > 4)) {
        throw new Error('DungeonContent returned an invalid scene.');
      }
      if (scene.chain) {
        const source = this.questStep === 1 ? scene.options.filter(option => option.correct) : null;
        if (!this.chained || this.boss || scene.chain.step !== this.questStep || scene.questTotal !== 2 ||
            typeof scene.chain.sourceId !== 'string' || (source && (source.length !== 1 || source[0].id !== scene.chain.sourceId)) ||
            (this.questStep === 2 && scene.chain.sourceId !== this.questSourceId)) {
          throw new Error('Invalid linked quest stage.');
        }
      } else if (this.questStep !== 1) {
        throw new Error('This room has no second stage.');
      }
      if (this.lesson && scene.chain?.step !== 1 && (scene.lesson?.target !== this.lesson.target || scene.lesson.level !== this.lesson.level ||
          typeof scene.lesson.situation !== 'string' || !scene.lesson.situation.length || scene.lesson.situation.length > 128 ||
          scene.options.filter(option => option.correct).length !== 1 || !scene.options.every(option =>
            option.correct ? option.targetEvidence === 'correct' : ['miss', 'neutral'].includes(option.targetEvidence)))) {
        throw new Error('The reading room does not match its pinned learning target.');
      }
      if (this.boss && this.boss.plan && JSON.stringify(this.boss.plan) !== JSON.stringify(scene.escapeSteps)) {
        throw new Error('DungeonContent changed an active escape plan.');
      }
      this.scene = scene;
      this.lockedPenalty = penaltyForTarget(scene.targetType);
    }

    _enterScene() {
      // An older saved visit keeps its promised rooms through its boundary.
      // A due boss can delay arrival, so activate the new plan on actual entry.
      if (!this.boss && this.obstacles && this.storyState.areaSteps[this.area] === 0) this.mixed = true;
      if (!this.boss) this.chained = this.mixed;
      this.questStep = 1;
      this.questSourceId = null;
      this.sceneEnteredAt = this.elapsed;
      this.lockedTier = this.boss ? bossTier(this.boss.encounter) : tierAt(this.elapsed, this.index);
      this.attempts = 0;
      this.hintShown = false;
      this.lesson = this._selectLesson();
      this._buildScene();
    }

    _latchDueBoss() {
      if (!this.boss && this.bossDueAt === null && this.elapsed >= this.nextBossAt) this.bossDueAt = this.nextBossAt;
    }

    _creditSceneClear() {
      this._latchDueBoss();
      this.bossDelaySeconds += SCENE_BOSS_DELAY_SECONDS;
      this.nextBossAt = deadline(this.bossCountdownFrom, this.bossDelaySeconds);
    }

    _startDueBoss() {
      this._latchDueBoss();
      if (this.phase !== 'playing' || this.boss || this.bossDueAt === null) return false;
      // Called only after a correct ordinary transition. That room is already
      // complete; the following ordinary room is entered after boss victory.
      this._suspended = null;
      const scheduledAt = this.bossDueAt;
      this.bossDueAt = null;
      this.encounters += 1;
      this.boss = {
        encounter: this.encounters, round: 1, total: BOSS_ROUNDS, scheduledAt,
        enteredAt: this.elapsed, entranceEndsAt: this.elapsed + BOSS_ENTRANCE_SECONDS, resume: 'next',
        pacing: pacingAt(this.elapsed), readingBand: this.learning.initialBand,
        readingEndsAt: this.elapsed + BOSS_ENTRANCE_SECONDS + this.pacing.readingSeconds,
        projectileStartedAt: this.elapsed + BOSS_ENTRANCE_SECONDS + this.pacing.readingSeconds,
        impactsResolved: 0, completedSteps: [], exitUnlocked: false
      };
      this._enterScene();
      this.boss.plan = clone(this.scene.escapeSteps);
      return true;
    }

    _finishBossRound() {
      if (this.boss.round < BOSS_ROUNDS) {
        this.boss.completedSteps.push(this.boss.round);
        if (this.boss.round === 2) this.boss.exitUnlocked = true;
        this.boss.round += 1;
        this._enterScene();
        return;
      }
      const suspended = this._suspended;
      // Arena time never runs down the next pursuit. Start a fresh 03:00 on escape.
      this.bossCountdownFrom = this.elapsed;
      this.bossDelaySeconds = 0;
      this.bossDueAt = null;
      this.nextBossAt = deadline(this.bossCountdownFrom, 0);
      this.boss = null;
      this._suspended = null;
      if (suspended) {
        // Older saves can contain an unfinished room interrupted by v2.
        for (const key of ROOM_KEYS) this[key] = suspended[key];
      } else {
        this._advanceRoomSet(this.storyState.lastRoute);
        this._enterScene();
      }
    }

    _end(reason) {
      this.phase = 'ended';
      this.reason = reason;
      this._pending = null;
    }

    tick(delta, impactTest) {
      if (this.phase === 'entrance' || this.phase === 'ended' || !number(delta, 0, Number.MAX_VALUE)) return this.elapsed;
      this.elapsed = Math.min(MAX_ELAPSED, this.elapsed + delta);
      this._latchDueBoss();
      this._resolveBossImpacts(impactTest);
      return this.elapsed;
    }

    _resolveBossImpacts(impactTest) {
      if (!this.boss || this.phase === 'ended') return;
      const { flightSeconds, cooldownSeconds } = this.boss.pacing;
      const duration = flightSeconds + cooldownSeconds;
      let due = this.boss.projectileStartedAt + flightSeconds + this.boss.impactsResolved * duration;
      while (this.phase !== 'ended' && due <= this.elapsed) {
        const dodged = typeof impactTest === 'function' && impactTest({ elapsed: due,
          encounter: this.boss.encounter, cycle: this.boss.impactsResolved + 1 }) === false;
        const impact = { serial: ++this.impactSerial, sceneId: this.scene.id, encounter: this.boss.encounter,
          round: this.boss.round, cycle: this.boss.impactsResolved + 1, elapsed: due,
          damage: 0, wardBlocked: false, stepWardBlocked: false, dodged, fatal: false, hpAfter: this.hp };
        this.boss.impactsResolved += 1;
        if (!dodged) this._applyDamage(impact, 1);
        impact.hpAfter = this.hp;
        this.lastImpact = impact;
        this._impacts.push(impact);
        if (this._impacts.length > MAX_RECORDS) this._impacts.splice(0, this._impacts.length - MAX_RECORDS);
        if (this.hp === 0) this._end(impact.fatal ? 'fatal' : 'hearts');
        due += duration;
      }
    }

    _applyDamage(result, penalty) {
      if (penalty === 'fatal') {
        result.damage = this.hp;
        result.fatal = true;
        this.hp = 0;
      } else if (penalty > 0) {
        result.damage = Math.min(this.hp, penalty);
        this.hp -= result.damage;
      }
    }

    end(reason) {
      if (this.phase === 'entrance' || this.phase === 'ended' || (reason !== undefined && reason !== 'quit')) return false;
      this._end('quit');
      return true;
    }

    choose(optionId) {
      if (this.phase !== 'playing') return null;
      if (this.boss && this.elapsed < this.boss.entranceEndsAt) return null;
      const option = this.scene.options.find(candidate => candidate.id === optionId);
      if (!option) return null;
      const outOfOrder = this.boss && (option.step !== this.boss.round || (option.step === 3 && !this.boss.exitUnlocked));
      return this._resolveAnswer(outOfOrder ? { ...option, correct: false } : option, false);
    }

    _resolveAnswer(option, timedOut) {
      const firstAttempt = this.attempts === 0;
      const penalty = penaltyForTarget(option.targetType || this.scene.targetType);
      this.attempts += 1;
      const result = {
        sceneId: this.scene.id,
        optionId: option.id,
        correct: option.correct,
        boss: !!this.boss,
        encounter: this.boss ? this.boss.encounter : null,
        round: this.boss ? this.boss.round : null,
        automatic: timedOut,
        timedOut,
        firstAttempt,
        penalty,
        damage: 0,
        wardBlocked: false,
        fatal: false,
        coinsEarned: 0
      };
      if (firstAttempt) {
        if (this.curriculum && !this.boss && this.scene.chain?.step !== 1 && !this.hintShown && !timedOut &&
            this.scene.kind !== 'choice' && this.scene.options.filter(choice => choice.correct).length === 1) {
          this.learning.firstChoice(this.lesson ? this.scene.lesson : null, option.targetEvidence);
        }
        this.records.push({
          sceneId: this.scene.id,
          index: this.index,
          area: this.area,
          kind: this.scene.kind,
          concept: this.scene.concept,
          optionId: option.id,
          correct: option.correct,
          elapsed: this.elapsed,
          penalty,
          tier: this.lockedTier,
          hinted: this.hintShown,
          firstAttempt: true,
          boss: !!this.boss,
          ...(this.scene.chain ? { questStep: this.questStep } : {}),
          round: this.boss ? this.boss.round : null,
          timedOut
        });
        if (this.records.length > MAX_RECORDS) this.records.splice(0, this.records.length - MAX_RECORDS);
      }
      if (option.correct) {
        if (this.scene.chain?.step === 1) result.continuesQuest = true;
        // The selected chest is paid here exactly once, before any animation or save.
        if (!this.boss && !result.continuesQuest && option.reward === 'chest' && option.traits?.type === 'box' &&
            (option.targetType || this.scene.targetType) === 'item') {
          const reward = Math.min(MAX_CHEST_COINS, 1 + Math.floor(this.completed / 10));
          result.coinsEarned = Math.min(reward, MAX_COINS - this.coins);
          this.coins += result.coinsEarned;
        }
      } else {
        this.hintShown = true;
        this._applyDamage(result, penalty);
      }
      this.lastResult = result;
      this._pending = { optionId: option.id, correct: option.correct, timedOut };
      this.phase = 'resolving';
      if (this.hp === 0) this._end(result.fatal ? 'fatal' : 'hearts');
      return result;
    }

    finishTransition() {
      if (this.phase !== 'resolving' || !this._pending) return false;
      const pending = this._pending;
      const option = this.scene.options.find(candidate => candidate.id === pending.optionId);
      this._pending = null;
      this.phase = 'playing';
      if (pending.correct) {
        if (this.boss) {
          this.lastResult = null;
          this._finishBossRound();
          return true;
        }
        if (this.scene.chain?.step === 1) {
          this.questStep = 2;
          this.questSourceId = option.id;
          this.attempts = 0;
          this.hintShown = false;
          this.lastResult = null;
          this._buildScene();
          return true;
        }
        const oldArea = this.area;
        const flags = this.scene.storyFlags;
        if (flags && safeObject(flags, 0) && !Array.isArray(flags)) {
          // areaSteps is engine-owned; authored flags cannot reset room progression.
          for (const key of Object.keys(flags)) {
            if (key !== 'areaSteps') this.storyState[key] = clone(flags[key]);
          }
        }
        this.storyState.areaSteps[oldArea] = (this.storyState.areaSteps[oldArea] || 0) + 1;
        this.storyState.lastRoute = typeof option.route === 'string' ? option.route : null;
        this.storyState.route = this.storyState.lastRoute;
        this._advanceRoomSet(option.route);
        this.completed += 1;
        this.index += 1;
        this._creditSceneClear();
        if (option.nextArea && areaIds().includes(option.nextArea) && option.nextArea !== oldArea) {
          this.area = option.nextArea;
          this.storyState.areaSteps[this.area] = 0;
          this.storyState.previousArea = oldArea;
        }
        if (!this._startDueBoss()) this._enterScene();
      }
      this.lastResult = null;
      return true;
    }

    restart(seed) {
      return new Run({ seed: validSeed(seed) ? seed : newSeed(), learning: this.learning.export() });
    }

    serialize() {
      return JSON.stringify({
        version: VERSION,
        legacyLayout: this.legacyLayout,
        curriculum: this.curriculum,
        obstacles: this.obstacles,
        mixed: this.mixed,
        chained: this.chained,
        questStep: this.questStep,
        questSourceId: this.questSourceId,
        lesson: this.lesson,
        learning: this.learning.export(),
        seed: this.seed,
        coins: this.coins,
        hp: this.hp,
        elapsed: this.elapsed,
        index: this.index,
        completed: this.completed,
        area: this.area,
        phase: this.phase,
        reason: this.reason,
        records: this.records,
        storyState: this.storyState,
        sceneId: this.scene.id,
        sceneEnteredAt: this.sceneEnteredAt,
        lockedPenalty: this.lockedPenalty,
        lockedTier: this.lockedTier,
        attempts: this.attempts,
        hintShown: this.hintShown,
        lastResult: this.lastResult,
        pending: this._pending,
        encounters: this.encounters,
        bossCountdownFrom: this.bossCountdownFrom,
        nextBossAt: this.nextBossAt,
        bossDelaySeconds: this.bossDelaySeconds,
        bossDueAt: this.bossDueAt,
        boss: this.boss,
        suspended: this._suspended,
        impactSerial: this.impactSerial,
        lastImpact: this.lastImpact,
        impacts: this._impacts
      });
    }

    static restore(serialized, options = {}) {
      try {
        if (typeof serialized === 'string' && serialized.length > 200000) return null;
        const data = typeof serialized === 'string' ? JSON.parse(serialized) : clone(serialized);
        const ids = areaIds();
        if (!data || ![1, 2, 3, 4, 5, 6, 7, 9, 10, 12, 13, 14, 15, 16, VERSION].includes(data.version) || !validSeed(data.seed) ||
            !integer(data.coins, 0, MAX_COINS) || !integer(data.hp, 0, 3) ||
            !number(data.elapsed, 0, MAX_ELAPSED) || !integer(data.index, 0, 10000000) ||
            data.completed !== data.index || !ids.includes(data.area) ||
            !['entrance', 'playing', 'resolving', 'ended'].includes(data.phase) ||
            (data.reason !== null && !REASONS.includes(data.reason)) ||
            typeof data.hintShown !== 'boolean' || !integer(data.attempts, 0, 10000000) ||
            !number(data.sceneEnteredAt, 0, data.elapsed) ||
            typeof data.sceneId !== 'string' ||
            !data.storyState || !safeObject(data.storyState, 0) ||
            !data.storyState.areaSteps || Array.isArray(data.storyState.areaSteps) ||
            typeof data.storyState.areaSteps !== 'object' ||
            !Object.entries(data.storyState.areaSteps).every(([area, step]) => ids.includes(area) && integer(step, 0, 10000000)) ||
            !integer(data.storyState.areaSteps[data.area], 0, 10000000) ||
            !Array.isArray(data.records) || data.records.length > MAX_RECORDS || !safeObject(data.records, 0) ||
            !data.records.every(record => record && record.firstAttempt === true && typeof record.correct === 'boolean' &&
              integer(record.index, 0, data.index) && typeof record.sceneId === 'string') ||
            (data.lastResult !== null && !safeObject(data.lastResult, 0))) return null;

        if (data.version < 17) {
          if (!integer(data.startingCoins, 0, data.coins) ||
              (data.phase === 'entrance' && data.startingCoins !== data.coins)) return null;
          // The old total includes prior runs and any chest paid before a pending exit.
          data.coins -= data.startingCoins;
        } else if (Object.hasOwn(data, 'startingCoins')) return null;

        if (data.version >= 10 && typeof data.legacyLayout !== 'boolean') return null;
        const hasCourse = data.version >= 12;
        if (data.version >= 13 && (typeof data.obstacles !== 'boolean' || (data.obstacles && !data.curriculum))) return null;
        if (data.version >= 14 && (typeof data.mixed !== 'boolean' || (data.mixed && !data.obstacles))) return null;
        if (data.version >= 15 && (typeof data.chained !== 'boolean' || (data.chained && !data.mixed) ||
            !integer(data.questStep, 1, 2) || (data.questStep === 1 ? data.questSourceId !== null :
              (!data.chained || data.boss || typeof data.questSourceId !== 'string' || data.questSourceId.length > 128)))) return null;
        if (hasCourse && (typeof data.curriculum !== 'boolean' || (data.curriculum && data.legacyLayout) ||
            !data.learning || !safeObject(data.learning, 0) || data.learning.version !== 1 ||
            !Learning.isBand(data.learning.initialBand) || (data.lesson !== null &&
            (!data.curriculum || data.boss || !data.lesson || !(Content.LESSON_TARGETS || []).includes(data.lesson.target) ||
            !Learning.isBand(data.lesson.level))))) return null;
        const learning = new Learning.Profile(Content.LESSON_TARGETS, hasCourse ? data.learning : options.learning, options.initialBand);
        if (data.phase === 'entrance') {
          if (data.version < 10) return null;
          const entrance = new Run({ seed: data.seed, area: data.area, learning: learning.export() });
          const expected = JSON.parse(entrance.serialize());
          expected.version = data.version;
          if (data.version < 15) {
            delete expected.chained; delete expected.questStep; delete expected.questSourceId;
          }
          if (data.version < 14) delete expected.mixed;
          if (data.version < 13) delete expected.obstacles;
          if (!hasCourse) {
            delete expected.curriculum; delete expected.lesson; delete expected.learning;
          }
          return Object.keys(expected).every(key => JSON.stringify(data[key]) === JSON.stringify(expected[key])) ? entrance : null;
        }

        // V6 already has scene credits and the two/five projectile clock.
        const legacy = data.version < 6;
        // Early v5 arenas granted a shield at step one. Remove it and rebuild
        // that plan's wording without restarting the fight or rewriting hits.
        const oldArenaProtection = legacy && !!data.boss &&
          (Object.hasOwn(data.boss, 'stepWard') || Object.hasOwn(data.boss, 'stepWardGranted'));
        const resumedTimeout = legacy && data.phase === 'ended' && data.reason === 'timeout' && data.hp > 0;
        if (resumedTimeout) {
          data.reason = null;
          if (data.lastResult && typeof data.lastResult.correct === 'boolean' && data.attempts > 0) {
            // The old cap canceled movement after rewards/damage were applied.
            // Restore that movement once rather than offering the same reward again.
            data.phase = 'resolving';
            data.pending = { optionId: data.lastResult.optionId, correct: data.lastResult.correct, timedOut: data.lastResult.timedOut === true };
          } else {
            data.phase = 'playing';
            data.pending = null;
            data.lastResult = null;
          }
        }
        if (data.version < 4) {
          data.impactSerial = 0;
          data.lastImpact = null;
          data.impacts = [];
        }
        if (data.version < 7) {
          const historical = [...(Array.isArray(data.impacts) ? data.impacts : []), data.lastImpact];
          for (const impact of historical) if (impact && typeof impact === 'object' && impact.dodged === undefined) impact.dodged = false;
        }
        if (!integer(data.impactSerial, 0, 10000000) || !Array.isArray(data.impacts) ||
            data.impacts.length > MAX_RECORDS || !safeObject(data.impacts, 0) ||
            !data.impacts.every((impact, index) => impact && integer(impact.serial, 1, data.impactSerial) &&
              (!index || impact.serial > data.impacts[index - 1].serial) && integer(impact.encounter, 1, MAX_ENCOUNTERS) &&
              integer(impact.round, 1, 3) && integer(impact.cycle, 1, 10000000) &&
              number(impact.elapsed, 0, data.elapsed) && integer(impact.damage, 0, 3) && integer(impact.hpAfter, 0, 3) &&
              typeof impact.wardBlocked === 'boolean' && typeof impact.stepWardBlocked === 'boolean' && typeof impact.fatal === 'boolean' &&
              typeof impact.dodged === 'boolean' && (!impact.dodged || (impact.damage === 0 && !impact.fatal))) ||
            (data.impactSerial === 0 ? data.impacts.length !== 0 || data.lastImpact !== null :
              !data.impacts.length || data.impacts[data.impacts.length - 1].serial !== data.impactSerial ||
              JSON.stringify(data.lastImpact) !== JSON.stringify(data.impacts[data.impacts.length - 1]))) return null;
        if (data.version === 1) {
          data.encounters = 0;
          data.nextBossAt = BOSS_INTERVAL;
          data.boss = null;
          data.suspended = null;
        }
        if (legacy) {
          data.bossDelaySeconds = 0;
          data.nextBossAt = deadline(data.encounters * BOSS_INTERVAL, 0);
          data.bossDueAt = data.elapsed >= data.nextBossAt ? data.nextBossAt : null;
        }
        if (!integer(data.encounters, 0, MAX_ENCOUNTERS) || data.encounters * BOSS_INTERVAL > data.elapsed) return null;
        if (data.version < 9) {
          // The old schedule was absolute run time. Preserve a running ordinary
          // countdown until the next escape, when the new interval takes over.
          const oldBase = data.encounters * BOSS_INTERVAL;
          if (data.nextBossAt !== deadline(oldBase, data.bossDelaySeconds) ||
              (data.bossDueAt !== null && !onSchedule(data.bossDueAt, oldBase, data.bossDelaySeconds))) return null;
          data.bossCountdownFrom = oldBase - (data.boss ? BOSS_INTERVAL : 0);
          data.nextBossAt = deadline(data.bossCountdownFrom, data.bossDelaySeconds);
          if (data.boss) data.bossDueAt = null;
        }
        if (!number(data.bossCountdownFrom, 0, data.elapsed) || (!data.encounters && data.bossCountdownFrom !== 0) ||
            !integer(data.bossDelaySeconds, 0, (data.completed + data.encounters - (data.boss ? 1 : 0)) * SCENE_BOSS_DELAY_SECONDS) ||
            data.bossDelaySeconds % SCENE_BOSS_DELAY_SECONDS !== 0 ||
            data.nextBossAt !== deadline(data.bossCountdownFrom, data.bossDelaySeconds) ||
            (data.bossDueAt !== null && (data.boss || !onSchedule(data.bossDueAt, data.bossCountdownFrom, data.bossDelaySeconds) ||
              data.bossDueAt > data.elapsed)) ||
            (!data.boss && data.bossDueAt === null && data.elapsed >= data.nextBossAt && data.phase !== 'ended')) return null;
        if (data.boss !== null) {
          const boss = data.boss;
          const suspended = data.suspended;
          if (suspended) delete suspended.manualHintUsed;
          if (!boss || !safeObject(boss, 0) || (boss.readingBand !== undefined && !Learning.isBand(boss.readingBand)) ||
              !integer(boss.encounter, 1, MAX_ENCOUNTERS) || boss.encounter !== data.encounters ||
              !integer(boss.round, 1, BOSS_ROUNDS) || boss.total !== BOSS_ROUNDS ||
              !onSchedule(boss.scheduledAt, data.bossCountdownFrom, data.bossDelaySeconds) ||
              boss.scheduledAt > data.sceneEnteredAt) return null;
          if (data.version === 2) boss.resume = 'suspended';
          if (!['suspended', 'next'].includes(boss.resume)) return null;
          if (legacy && suspended && suspended.sceneEnteredAt >= INTENSITY_SECONDS && data.index >= 2) suspended.lockedTier = 'overrun';
          if (boss.resume === 'suspended' && (!suspended || !safeObject(suspended, 0) || !validScene(suspended.scene) || suspended.scene.boss === true ||
              !number(suspended.sceneEnteredAt, 0, data.sceneEnteredAt) ||
              (data.version >= 9 && suspended.lockedPenalty !== penaltyForTarget(suspended.scene.targetType)) ||
              suspended.lockedTier !== tierAt(suspended.sceneEnteredAt, data.index) ||
              !integer(suspended.attempts, 0, 10000000) || typeof suspended.hintShown !== 'boolean')) return null;
          if (boss.resume === 'next' && suspended !== null) return null;
          if (data.version < 4) {
            // Older fights become the matching escape step, retaining health
            // and progress while introducing the continuous projectile cycle.
            boss.enteredAt = data.elapsed;
            boss.entranceEndsAt = boss.enteredAt + BOSS_ENTRANCE_SECONDS;
            boss.pacing = pacingAt(boss.enteredAt);
            boss.readingEndsAt = boss.entranceEndsAt + boss.pacing.readingSeconds;
            boss.impactsResolved = 0;
            boss.completedSteps = Array.from({ length: boss.round - 1 }, (_, index) => index + 1);
            boss.exitUnlocked = boss.round === 3;
            delete boss.attackReadyAt;
            delete boss.attackAt;
            delete boss.plan;
            data.sceneEnteredAt = boss.enteredAt;
          }
          if (resumedTimeout) {
            boss.enteredAt = data.elapsed;
            boss.entranceEndsAt = boss.enteredAt + BOSS_ENTRANCE_SECONDS;
            boss.pacing = pacingAt(boss.enteredAt);
            boss.readingEndsAt = boss.entranceEndsAt + boss.pacing.readingSeconds;
            boss.impactsResolved = 0;
            data.sceneEnteredAt = data.elapsed;
          }
          if (legacy) {
            // Keep the current pre-v6 projectile phase and fraction. Its cycle
            // retains its identity, so prior impacts cannot be applied again.
            let offset = 0;
            if (data.version >= 4 && !resumedTimeout && data.phase !== 'ended' && data.elapsed >= boss.readingEndsAt) {
              const oldOverrun = boss.enteredAt >= INTENSITY_SECONDS;
              const oldPacing = { overrun: oldOverrun, readingSeconds: oldOverrun ? 6 : 8,
                flightSeconds: 5, cooldownSeconds: oldOverrun ? 1.5 : 2 };
              if (data.version === 5 && (!boss.pacing || Object.keys(oldPacing).some(key => boss.pacing[key] !== oldPacing[key]))) return null;
              const oldDuration = oldPacing.flightSeconds + oldPacing.cooldownSeconds;
              const oldElapsed = data.elapsed - boss.readingEndsAt;
              const cycle = Math.floor(oldElapsed / oldDuration);
              const within = oldElapsed - cycle * oldDuration;
              const nextWithin = within < oldPacing.flightSeconds ? within / oldPacing.flightSeconds * BOSS_FLIGHT_SECONDS :
                BOSS_FLIGHT_SECONDS + (within - oldPacing.flightSeconds) / oldPacing.cooldownSeconds * BOSS_COOLDOWN_SECONDS;
              offset = oldElapsed - (cycle * (BOSS_FLIGHT_SECONDS + BOSS_COOLDOWN_SECONDS) + nextWithin);
            }
            boss.pacing = pacingAt(boss.enteredAt);
            boss.projectileStartedAt = boss.readingEndsAt + offset;
            data.lockedPenalty = 1;
          }
          delete boss.stepWard;
          delete boss.stepWardGranted;
          if (legacy || oldArenaProtection) delete boss.plan;
          const expectedPacing = pacingAt(boss.enteredAt);
          if (!boss.pacing || Object.keys(expectedPacing).some(key => boss.pacing[key] !== expectedPacing[key])) return null;
          boss.pacing = Object.freeze({ ...expectedPacing });
          if (!number(boss.enteredAt, boss.scheduledAt, data.sceneEnteredAt) ||
              boss.entranceEndsAt !== boss.enteredAt + BOSS_ENTRANCE_SECONDS ||
              boss.readingEndsAt !== boss.entranceEndsAt + boss.pacing.readingSeconds ||
              !number(boss.projectileStartedAt, boss.enteredAt, Math.max(boss.readingEndsAt, data.elapsed)) ||
              !integer(boss.impactsResolved, 0, Math.max(0, Math.floor((data.elapsed - boss.projectileStartedAt - boss.pacing.flightSeconds) /
                (boss.pacing.flightSeconds + boss.pacing.cooldownSeconds) + 1e-9) + 1)) ||
              !Array.isArray(boss.completedSteps) || boss.completedSteps.length !== boss.round - 1 ||
              !boss.completedSteps.every((step, index) => step === index + 1) ||
              boss.exitUnlocked !== (boss.round === 3) ||
              (!legacy && !oldArenaProtection && (!Array.isArray(boss.plan) || boss.plan.length !== 3))) return null;
        } else if (data.suspended !== null) return null;
        const expectedTier = data.boss ? bossTier(data.boss.encounter) : tierAt(data.sceneEnteredAt, data.index);
        if (legacy && !data.boss && data.sceneEnteredAt >= INTENSITY_SECONDS && data.index >= 2) data.lockedTier = expectedTier;
        if (data.lockedTier !== expectedTier) return null;

        const run = Object.create(Run.prototype);
        for (const key of ['seed', 'coins', 'hp', 'elapsed', 'index', 'completed', 'area', 'phase', 'reason',
          'records', 'storyState', 'sceneEnteredAt', 'lockedPenalty', 'lockedTier',
          'attempts', 'hintShown', 'lastResult', 'encounters', 'bossCountdownFrom', 'nextBossAt', 'bossDelaySeconds', 'bossDueAt', 'boss', 'impactSerial', 'lastImpact']) run[key] = data[key];
        run.legacyLayout = data.version < 10 || data.legacyLayout;
        run.curriculum = hasCourse && data.curriculum;
        run.obstacles = data.version >= 13 && data.obstacles;
        run.mixed = data.version >= 14 && data.mixed;
        run.chained = data.version >= 15 && data.chained;
        run.questStep = data.version >= 15 ? data.questStep : 1;
        run.questSourceId = data.version >= 15 ? data.questSourceId : null;
        run.lesson = hasCourse ? data.lesson : null;
        run.learning = learning;
        run._impacts = data.impacts;
        run._suspended = data.suspended;
        run._pending = null;
        if (data.version < 16 && run._suspended) {
          // Very old guardians could interrupt the room before its exit. Rebuild that
          // waiting room too, so escaping the arena cannot bring back a retired fork.
          const held = run._suspended;
          held.scene = Content.createScene({ ...run._roomConfig(), elapsed: held.sceneEnteredAt, difficulty: held.lockedTier });
          if (!validScene(held.scene)) return null;
        }
        if (run._suspended) run._suspended.lockedPenalty = penaltyForTarget(run._suspended.scene.targetType);
        // Decode the precise choice the pupil saw. A committed vault selection
        // still earns its chest even though that path is no longer offered.
        const oldControls = data.version < 16 && !run.boss;
        run._buildScene(oldControls);
        const decoded = run.scene;
        if (data.version >= 9 && run.lockedPenalty !== data.lockedPenalty) return null;
        if ((legacy || oldArenaProtection) && run.boss) run.boss.plan = clone(run.scene.escapeSteps);
        // Older authored content used different target IDs and scene hashes.
        if (!legacy && run.scene.id !== data.sceneId) return null;
        if (run.phase === 'ended') {
          if (!REASONS.includes(run.reason) || run.reason === 'timeout' ||
              (run.reason !== 'quit' && run.hp !== 0)) return null;
          if (oldControls) run._buildScene();
          return run;
        }
        if (run.hp === 0 || run.reason !== null) return null;
        // A saved clock alone cannot prove a collision while the app was not
        // observing movement. Consume any overdue unknown shots as misses.
        run._resolveBossImpacts(() => false);
        if (run.phase === 'ended') return run;
        if (run.phase === 'resolving') {
          if (!data.pending || typeof data.pending.correct !== 'boolean' || !run.lastResult || run.attempts < 1) return null;
          if (run.lastResult.optionId !== data.pending.optionId || run.lastResult.correct !== data.pending.correct ||
              run.lastResult.sceneId !== data.sceneId) return null;
          if (data.pending.timedOut === true) {
            if (!legacy || !run.boss || data.pending.optionId !== null || data.pending.correct !== false ||
                run.lastResult.timedOut !== true || run.lastResult.automatic !== true) return null;
            run._pending = { optionId: null, correct: false, timedOut: true };
          } else {
            let option = run.scene.options.find(candidate => candidate.id === data.pending.optionId && candidate.correct === data.pending.correct);
            // An already applied old result settles movement only, never rewards.
            if (!option && legacy) option = run.scene.options.find(candidate => candidate.correct === data.pending.correct);
            if (!option || (!legacy && (run.lastResult.timedOut !== false || run.lastResult.automatic !== false))) return null;
            if (data.version < 9 && !run.boss && option.route === 'vault' && run.lastResult.coinsEarned > 0) {
              // The old risk door already paid its chest; don't enter the new paid vault as well.
              option.route = 'risk';
            }
            run._pending = { optionId: option.id, correct: option.correct, timedOut: false };
          }
          // Rewards already exist in coins. Only settle movement or retry.
          run.finishTransition();
        } else if (data.pending !== null || run.lastResult !== null) return null;
        if (oldControls && run.scene === decoded) run._buildScene();
        return run;
      } catch (_error) {
        return null;
      }
    }
  }

  return Object.freeze({ Run, penaltyForTarget, tierAt, pacingAt, INTENSITY_SECONDS, BOSS_INTERVAL, BOSS_ROUNDS, BOSS_ENTRANCE_SECONDS,
    BOSS_READING_SECONDS, BOSS_FLIGHT_SECONDS, BOSS_COOLDOWN_SECONDS, SCENE_BOSS_DELAY_SECONDS, VERSION });
}));
