/**
 * Placeholder fishing sounds, synthesised (no samples), on their own small Web Audio graph so the
 * vehicle's mix is left alone: the cast's swish, the plop of the float, the tap of a nibble, the
 * deep "dunk" of the real bite, the splash of a run or a landing, the snap of a line, and the creak
 * of the line under load (a held tone that rises with the tension).
 */
import type { FishEvent } from '../../core/fishing/angling';

export class FishSound {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private creak: { osc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  enabled = true;

  /** start on a user gesture (browser policy); safe to call again */
  start(): void {
    if (this.ctx || typeof window === 'undefined') return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let s = 1234567;
    for (let i = 0; i < d.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) | 0;
      d[i] = (s >>> 8) / 8388608 - 1;
    }
    this.noise = buf;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 6;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start();
    this.creak = { osc, gain, filter };
  }

  private tone(f0: number, f1: number, dur: number, vol: number, type: OscillatorType = 'sine'): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(dur: number, vol: number, cutoff: number, type: BiquadFilterType = 'lowpass'): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  play(e: FishEvent): void {
    if (!this.enabled || !this.ctx) return;
    switch (e) {
      case 'cast':
        this.hiss(0.35, 0.12, 2500, 'bandpass');
        break;
      case 'plop':
        this.tone(700, 180, 0.12, 0.25);
        this.hiss(0.18, 0.08, 1200);
        break;
      case 'nibble':
        this.tone(1300, 900, 0.035, 0.12, 'triangle');
        break;
      case 'dip':
        this.tone(160, 70, 0.3, 0.45);
        break;
      case 'strike':
      case 'run':
        this.hiss(0.25, 0.12, 900);
        break;
      case 'jump':
      case 'land':
        this.hiss(0.5, 0.22, 1400);
        this.tone(300, 90, 0.2, 0.15);
        break;
      case 'snap':
        this.tone(2400, 600, 0.05, 0.3, 'square');
        break;
      default:
        break;
    }
  }

  /** the line under load, 0…1 (0 = silent) */
  load(tension: number): void {
    const c = this.creak;
    if (!c || !this.ctx) return;
    const t = this.ctx.currentTime;
    const k = tension > 0.55 ? (tension - 0.55) / 0.45 : 0;
    c.gain.gain.setTargetAtTime(this.enabled ? k * 0.06 : 0, t, 0.05);
    c.osc.frequency.setTargetAtTime(70 + 150 * k, t, 0.05);
    c.filter.frequency.setTargetAtTime(300 + 900 * k, t, 0.05);
  }
}
