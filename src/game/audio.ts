/**
 * Procedural sound with the Web Audio API: no samples, a handful of oscillators and filtered
 * noise. It starts on the first user gesture (browser policy) and follows core/audio/mix.
 */
import { AudioMix, computeMix, type AudioInputs } from '../core/audio/mix';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private readonly mix = new AudioMix();
  private nodes: {
    master: GainNode;
    outside: BiquadFilterNode;
    saw: OscillatorNode;
    saw2: OscillatorNode;
    sub: OscillatorNode;
    engFilter: BiquadFilterNode;
    engGain: GainNode;
    subGain: GainNode;
    windFilter: BiquadFilterNode;
    windGain: GainNode;
    roadFilter: BiquadFilterNode;
    roadGain: GainNode;
    skidGain: GainNode;
    rainGain: GainNode;
    roofGain: GainNode;
    hailGain: GainNode;
    thunderGain: GainNode;
    analyser: AnalyserNode;
    starterGain: GainNode;
    starterLfo: OscillatorNode;
    starterWhine: OscillatorNode;
    thumpGain: GainNode;
    rattleGain: GainNode;
    flatGain: GainNode;
    flatLfo: OscillatorNode;
    hornGain: GainNode;
    horn1: OscillatorNode;
    horn2: OscillatorNode;
    noise: AudioBuffer;
  } | null = null;
  private thunderAt = -1;
  enabled = true;

  /** Call from a user gesture. Safe to call repeatedly. */
  start(): boolean {
    if (this.ctx) {
      void this.ctx.resume();
      return true;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    const ctx = new AC();
    this.ctx = ctx;
    // two seconds of white noise, looped, feeds every noise voice
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let s = 22222;
    for (let i = 0; i < data.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) | 0;
      data[i] = (s >>> 8) / 8388608 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;

    const master = ctx.createGain();
    master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    master.connect(comp).connect(analyser).connect(ctx.destination);
    // everything that comes from outside the cabin passes through one low-pass
    const outside = ctx.createBiquadFilter();
    outside.type = 'lowpass';
    outside.frequency.value = 18000;
    outside.connect(master);

    const filt = (type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode => {
      const n = ctx.createBiquadFilter();
      n.type = type;
      n.frequency.value = f;
      n.Q.value = q;
      return n;
    };
    const gain = (g = 0): GainNode => {
      const n = ctx.createGain();
      n.gain.value = g;
      return n;
    };

    // engine: two slightly detuned saws through a low-pass, plus a sine an octave down
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    const saw2 = ctx.createOscillator();
    saw2.type = 'sawtooth';
    saw2.detune.value = 9;
    const sub = ctx.createOscillator();
    sub.type = 'triangle';
    const engFilter = filt('lowpass', 400, 1.2);
    const engGain = gain();
    const subGain = gain();
    saw.connect(engFilter);
    saw2.connect(engFilter);
    engFilter.connect(engGain).connect(master);
    sub.connect(subGain).connect(master);

    const windFilter = filt('bandpass', 600, 0.5);
    const windGain = gain();
    noise.connect(windFilter).connect(windGain).connect(outside);
    const roadFilter = filt('lowpass', 500, 0.8);
    const roadGain = gain();
    noise.connect(roadFilter).connect(roadGain).connect(master);
    const skidGain = gain();
    noise.connect(filt('bandpass', 950, 4)).connect(skidGain).connect(outside);
    const rainGain = gain();
    noise.connect(filt('highpass', 1800, 0.6)).connect(rainGain).connect(outside);
    const roofGain = gain();
    noise.connect(filt('bandpass', 520, 1.1)).connect(roofGain).connect(master);
    const hailGain = gain();
    noise.connect(filt('bandpass', 2600, 2.2)).connect(hailGain).connect(master);
    const thunderGain = gain();
    noise.connect(filt('lowpass', 110, 0.9)).connect(thunderGain).connect(master);

    // starter motor: a whine whose loudness pulses with the compression strokes
    const starterWhine = ctx.createOscillator();
    starterWhine.type = 'square';
    starterWhine.frequency.value = 160;
    const starterGain = gain();
    const starterPulse = gain(0.5);
    const starterLfo = ctx.createOscillator();
    starterLfo.frequency.value = 9;
    const lfoDepth = gain(0.5);
    starterLfo.connect(lfoDepth).connect(starterPulse.gain);
    starterWhine.connect(filt('lowpass', 700, 1.5)).connect(starterPulse).connect(starterGain).connect(master);
    noise.connect(filt('bandpass', 380, 1.2)).connect(starterPulse);
    // suspension: a thud, the busy rattle of rough ground, the flap of a flat tyre
    const thumpGain = gain();
    noise.connect(filt('lowpass', 95, 1.4)).connect(thumpGain).connect(master);
    const rattleGain = gain();
    noise.connect(filt('bandpass', 1700, 3)).connect(rattleGain).connect(master);
    const flatGain = gain();
    const flatMod = gain(0.5);
    const flatLfo = ctx.createOscillator();
    flatLfo.type = 'square';
    flatLfo.frequency.value = 1;
    flatLfo.connect(gain(0.5)).connect(flatMod.gain);
    noise.connect(filt('lowpass', 260, 1)).connect(flatMod).connect(flatGain).connect(outside);
    // horn: two tones a third apart
    const horn1 = ctx.createOscillator();
    horn1.type = 'square';
    const horn2 = ctx.createOscillator();
    horn2.type = 'square';
    const hornGain = gain();
    const hornF = filt('lowpass', 1600, 0.8);
    horn1.connect(hornF);
    horn2.connect(hornF);
    hornF.connect(hornGain).connect(outside);

    saw.start();
    saw2.start();
    sub.start();
    noise.start();
    starterWhine.start();
    starterLfo.start();
    flatLfo.start();
    horn1.start();
    horn2.start();
    this.nodes = { master, outside, saw, saw2, sub, engFilter, engGain, subGain, windFilter, windGain, roadFilter, roadGain, skidGain, rainGain, roofGain, hailGain, thunderGain, analyser, starterGain, starterLfo, starterWhine, thumpGain, rattleGain, flatGain, flatLfo, hornGain, horn1, horn2, noise: buf };
    return true;
  }

  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** seconds of sound made so far (the audio clock: it starts late and runs slow on a machine busy drawing) */
  get clock(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  update(inp: AudioInputs, flash: number): void {
    const ctx = this.ctx;
    const n = this.nodes;
    if (!ctx || !n) return;
    const m = computeMix(inp, this.mix);
    const t = ctx.currentTime;
    const set = (p: AudioParam, v: number, tc = 0.06): void => {
      p.setTargetAtTime(v, t, tc);
    };
    const on = this.enabled ? 1 : 0;
    set(n.saw.frequency, m.engineHz);
    set(n.saw2.frequency, m.engineHz);
    set(n.sub.frequency, m.engineHz / 2);
    set(n.engFilter.frequency, m.engineCutoff);
    set(n.engGain.gain, m.engineGain * on);
    set(n.subGain.gain, m.subGain * on);
    set(n.windFilter.frequency, m.windCutoff, 0.2);
    set(n.windGain.gain, m.windGain * on, 0.2);
    set(n.roadFilter.frequency, m.roadCutoff, 0.15);
    set(n.roadGain.gain, m.roadGain * on, 0.1);
    set(n.skidGain.gain, m.skidGain * on, 0.04);
    set(n.rainGain.gain, m.rainGain * on, 0.4);
    set(n.roofGain.gain, m.roofGain * on, 0.4);
    set(n.hailGain.gain, m.hailGain * on, 0.2);
    set(n.outside.frequency, m.outsideCutoff, 0.3);
    set(n.starterGain.gain, m.starterGain * on, 0.03);
    set(n.starterLfo.frequency, m.starterHz, 0.05);
    set(n.starterWhine.frequency, 120 + 6 * m.starterHz, 0.05);
    set(n.thumpGain.gain, m.thumpGain * on, 0.015);
    set(n.rattleGain.gain, m.rattleGain * on, 0.1);
    set(n.flatGain.gain, m.flatGain * on, 0.1);
    set(n.flatLfo.frequency, Math.max(0.5, m.flatHz), 0.1);
    set(n.hornGain.gain, m.hornGain * on, 0.015);
    set(n.horn1.frequency, m.hornHz, 0.01);
    set(n.horn2.frequency, m.hornHz * 1.26, 0.01);
    // thunder: a low rumble that arrives a moment after the flash, then rolls away
    if (flash > 0.9 && this.thunderAt < t) {
      const delay = 0.6 + 2.6 * Math.abs(Math.sin(t * 12.9898));
      this.thunderAt = t + delay + 4;
      n.thunderGain.gain.cancelScheduledValues(t);
      n.thunderGain.gain.setValueAtTime(0.0001, t + delay);
      n.thunderGain.gain.exponentialRampToValueAtTime(0.9 * on + 0.0001, t + delay + 0.08);
      n.thunderGain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 3.5);
    }
  }

  /**
   * Short mechanical sounds: the gear lever into a notch, the gearbox grinding (refused), the handbrake
   * ratchet, the ignition key, a gear change in the box.
   */
  oneShot(kind: 'lever' | 'grind' | 'ratchet' | 'key' | 'shift'): void {
    const ctx = this.ctx;
    const n = this.nodes;
    if (!ctx || !n || !this.enabled) return;
    const t = ctx.currentTime;
    const spec = { lever: [900, 2, 0.05, 0.25], grind: [2400, 6, 0.35, 0.3], ratchet: [3200, 4, 0.025, 0.2], key: [1800, 3, 0.04, 0.2], shift: [500, 1.5, 0.08, 0.18] }[kind];
    const reps = kind === 'ratchet' ? 4 : 1;
    for (let r = 0; r < reps; r++) {
      const src = ctx.createBufferSource();
      src.buffer = n.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = spec[0];
      f.Q.value = spec[1];
      const g = ctx.createGain();
      const t0 = t + r * 0.045;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(spec[3], t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + spec[2]);
      src.connect(f).connect(g).connect(n.master);
      src.start(t0, (r * 0.37) % 1.5);
      src.stop(t0 + spec[2] + 0.02);
    }
  }

  /** what the mixer was last asked for and where the graph stands (for the test harness) */
  debug(): Record<string, unknown> {
    const n = this.nodes;
    return {
      state: this.ctx?.state ?? 'none',
      time: this.ctx?.currentTime ?? 0,
      enabled: this.enabled,
      mix: { ...this.mix },
      gains: n ? { master: n.master.gain.value, engine: n.engGain.gain.value, wind: n.windGain.gain.value, road: n.roadGain.gain.value, outsideHz: n.outside.frequency.value, engineHz: n.engFilter.frequency.value } : null,
    };
  }

  /** RMS of the output right now (for the test harness) */
  rms(): number {
    const n = this.nodes;
    if (!n) return 0;
    const buf = new Float32Array(n.analyser.fftSize);
    n.analyser.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  }
}
