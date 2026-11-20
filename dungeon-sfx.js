/* Short synthesized game cues, mixed separately from the music. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DungeonSfx = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TAU = Math.PI * 2;
  const PEAK = .031;
  const tone = (start, duration, from, to, level, shape = 'pulse') =>
    ({start, duration, from, to, level, shape});
  const crunch = (start, duration, clock, cutoff, level) =>
    ({start, duration, clock, cutoff, level, shape: 'noise'});

  // Timings are seconds and pitches are hertz.
  const cues = {
    bossShot: [tone(0, .173, 910, 235, .030), tone(.014, .157, 278, 63, .012, 'triangle')],
    monsterEat: [
      crunch(0, .069, 5100, 1650, .023),
      tone(0, .043, 183, 74, .014, 'triangle'),
      crunch(.087, .079, 3990, 1180, .020),
      tone(.089, .055, 155, 62, .012, 'triangle')
    ],
    doorOpen: [
      crunch(0, .052, 4600, 1360, .020),
      tone(.008, .075, 185, 117, .018, 'triangle'),
      tone(.056, .070, 392, 392, .023, 'triangle'),
      tone(.103, .092, 523, 523, .019, 'triangle')
    ],
    personHit: [
      tone(0, .061, 196, 87, .036),
      tone(.051, .116, 139, 75, .026, 'triangle')
    ],
    mimicHit: [
      crunch(0, .078, 6300, 2150, .026),
      tone(.009, .073, 277, 93, .023),
      tone(.072, .103, 124, 68, .020, 'triangle')
    ]
  };

  const legacyNotes = {
    step:[220,330], hurt:[120,80], chest:[392,523,659], signal:[196,294,392], sluice:[146,220], cart:[165,247],
    console:[392,587], dispatch:[165,220,294],
    fed:[175,220,262], bell:[988,1480], sniff:[147,131], drain:[392,294,196,147], surge:[165,220,294], trickle:[440,330],
    roll:[147,165,196], clank:[132,110], brake:[196,130]
  };

  const waveforms = {
    pulse: phase => (Math.sin(phase) + .30 * Math.sin(3 * phase) + .14 * Math.sin(5 * phase)) / 1.16,
    triangle: phase => (Math.sin(phase) - .11 * Math.sin(3 * phase) + .04 * Math.sin(5 * phase)) / 1.15,
    sine: Math.sin
  };

  function chipTone(part, rate) {
    const waveform = waveforms[part.shape];
    const glide = Math.pow(part.to / part.from, 1 / (part.duration * rate));
    let phase = 0;
    let increment = TAU * part.from / rate;
    return () => {
      const sample = waveform(phase);
      phase = (phase + increment) % TAU;
      increment *= glide;
      return sample;
    };
  }

  function chipNoise(part, rate) {
    const interval = rate / part.clock;
    const lowPass = 1 - Math.exp(-TAU * part.cutoff / rate);
    const highPass = 1 - Math.exp(-TAU * 180 / rate);
    let random = 0x36714ea1;
    let remaining = 0;
    let held = 0;
    let filtered = 0;
    let baseline = 0;
    return () => {
      if (remaining <= 0) {
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        held = random / 2147483648 - 1;
        remaining += interval;
      }
      remaining -= 1;
      filtered += lowPass * (held - filtered);
      baseline += highPass * (filtered - baseline);
      return filtered - baseline;
    };
  }

  function render(context, cue) {
    const notes = Object.hasOwn(legacyNotes, cue) ? legacyNotes[cue] : legacyNotes.step;
    const parts = Object.hasOwn(cues, cue) ? cues[cue] :
      notes.map((frequency, index) =>
        tone(index * .065, .112, frequency, frequency, .022, cue === 'bell' ? 'sine' : 'triangle'));
    const rate = context.sampleRate;
    const duration = Math.max(...parts.map(part => part.start + part.duration));
    const buffer = context.createBuffer(1, Math.ceil(duration * rate) + 1, rate);
    const samples = buffer.getChannelData(0);
    for (const part of parts) {
      const start = Math.round(part.start * rate);
      const nextSample = part.shape === 'noise' ? chipNoise(part, rate) : chipTone(part, rate);
      const attack = .004;
      const release = Math.min(.026, part.duration * .36);
      for (let i = 0; i < Math.round(part.duration * rate); i += 1) {
        const time = i / rate;
        const envelope = Math.min(1, time / attack, (part.duration - time) / release) *
          Math.exp(-1.75 * time / part.duration);
        samples[start + i] += nextSample() * part.level * envelope;
      }
    }
    let peak = 0;
    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    if (peak > PEAK) {
      const scale = PEAK / peak;
      for (let i = 0; i < samples.length; i += 1) samples[i] *= scale;
    }
    return buffer;
  }

  function create(scope = globalThis) {
    const buffers = new Map();
    const voices = new Set();
    let context;

    function unlock() {
      const Context = scope.AudioContext || scope.webkitAudioContext;
      if (!Context) return false;
      try {
        context ||= new Context();
        if (context.state !== 'running') context.resume()?.catch(() => {});
        return true;
      } catch {
        return false;
      }
    }

    function play(cue) {
      // Drop a cue while audio is locked so it cannot fire late when resumed.
      if (context?.state !== 'running') return false;
      const name = Object.hasOwn(cues, cue) || Object.hasOwn(legacyNotes, cue) ? cue : 'step';
      let voice;
      try {
        if (!buffers.has(name)) buffers.set(name, render(context, name));
        voice = context.createBufferSource();
        voice.buffer = buffers.get(name);
        voice.connect(context.destination);
        voice.onended = () => {
          voices.delete(voice);
          voice.disconnect();
        };
        voice.start();
        voices.add(voice);
        return true;
      } catch {
        voice?.disconnect();
        return false;
      }
    }

    function stop() {
      for (const voice of voices) {
        voice.stop();
        voice.disconnect();
      }
      voices.clear();
    }

    return {unlock, play, stop};
  }

  return {create};
}));
