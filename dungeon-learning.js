/* Per-pupil reading evidence. Only an independent choice can move a word's level. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DungeonLearning = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const isBand = value => Number.isInteger(value) && value >= 1 && value <= 3;
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const statuses = ['developing', 'practice', 'review'];
  const validSample = sample => sample && typeof sample.correct === 'boolean' &&
    typeof sample.situation === 'string' && sample.situation.length > 0 && sample.situation.length <= 128;

  class Profile {
    constructor(keys = [], saved = null, initialBand = 1) {
      this.keys = new Set(keys);
      const data = saved?.version === 1 ? saved : {};
      this.initialBand = isBand(data.initialBand) ? data.initialBand : isBand(initialBand) ? initialBand : 1;
      this.sequence = count(data.sequence);
      this.recent = Array.isArray(data.recent) ? data.recent.filter(key => this.keys.has(key)).slice(-2) : [];
      this.targets = Object.create(null);
      for (const key of this.keys) {
        const row = data.targets?.[key];
        if (!row || !isBand(row.level) || !statuses.includes(row.status)) continue;
        this.targets[key] = { level: row.level, status: row.status, masteredLevel: isBand(row.masteredLevel) ? row.masteredLevel : 0, attempts: count(row.attempts),
          successes: Math.min(count(row.attempts), count(row.successes)), due: count(row.due),
          recent: Array.isArray(row.recent) ? row.recent.filter(validSample).slice(-6)
            .map(({ correct, situation }) => ({ correct, situation })) : [] };
      }
    }

    setStartingBand(value) {
      if (!isBand(value)) return false;
      this.initialBand = value;
      return true;
    }

    get familiarTargets() {
      return Object.keys(this.targets).filter(key => this.targets[key].successes > 0);
    }

    choose(candidates, random) {
      let eligible = [...new Set(candidates)].filter(key => this.keys.has(key) &&
        (this.targets[key]?.due || 0) <= this.sequence);
      if (this.recent.length === 2 && this.recent[0] === this.recent[1] &&
          eligible.some(key => key !== this.recent[1])) eligible = eligible.filter(key => key !== this.recent[1]);
      if (!eligible.length) return null;
      // Reassign an unavailable category's share proportionally to the other two.
      const pools = [
        { weight: 50, keys: eligible.filter(key => this.targets[key] && this.targets[key].status !== 'review') },
        { weight: 30, keys: eligible.filter(key => this.targets[key]?.status === 'review') },
        { weight: 20, keys: eligible.filter(key => !this.targets[key]) }
      ].filter(pool => pool.keys.length);
      let roll = random() * pools.reduce((total, pool) => total + pool.weight, 0);
      const pool = pools.find(pool => (roll -= pool.weight) < 0) || pools[pools.length - 1];
      const weight = key => this.targets[key]?.status === 'practice' ? 3 : 1;
      let ticket = random() * pool.keys.reduce((total, key) => total + weight(key), 0);
      const target = pool.keys.find(key => (ticket -= weight(key)) < 0) || pool.keys[pool.keys.length - 1];
      return { target, level: this.targets[target]?.level || this.initialBand };
    }

    firstChoice(lesson, evidence) {
      // Count a completed independent reading opportunity even when its
      // distractor only diagnoses a secondary detail. This spaces later reviews.
      this.sequence++;
      if (!lesson || !this.keys.has(lesson.target) || !isBand(lesson.level) ||
          typeof lesson.situation !== 'string' || !lesson.situation.length || lesson.situation.length > 128) return;
      const { target, level, situation } = lesson;
      this.recent.push(target);
      this.recent = this.recent.slice(-2);
      if (!['correct', 'miss'].includes(evidence)) return;
      const row = this.targets[target] ||= { level, status: 'developing', masteredLevel: 0, attempts: 0, successes: 0, due: 0, recent: [] };
      const correct = evidence === 'correct';
      row.attempts++;
      if (correct) row.successes++;
      if (row.status === 'review' && level === 3 && row.masteredLevel === 3 && correct) {
        row.due = this.sequence + 8;
        return;
      }
      row.recent.push({ correct, situation });
      row.recent = row.recent.slice(-6);
      const successes = row.recent.filter(sample => sample.correct);
      if (!correct && row.recent.slice(-3).filter(sample => !sample.correct).length >= 2) {
        row.level = Math.max(1, level - 1);
        row.masteredLevel = Math.min(row.masteredLevel, row.level - 1);
        row.status = 'practice';
        row.due = 0;
        row.recent = [];
      } else if (correct && row.recent.length === 6 && successes.length >= 5 &&
          new Set(successes.map(sample => sample.situation)).size >= 3) {
        row.level = Math.min(3, level + 1);
        row.masteredLevel = level;
        row.status = 'review';
        row.due = this.sequence + 8;
        row.recent = [];
      } else if (row.status === 'review') {
        row.status = correct ? 'developing' : 'practice';
        row.due = 0;
      }
    }

    export() {
      return JSON.parse(JSON.stringify({ version: 1, initialBand: this.initialBand, sequence: this.sequence,
        recent: this.recent, targets: this.targets }));
    }
  }

  return Object.freeze({ Profile, isBand });
}));
