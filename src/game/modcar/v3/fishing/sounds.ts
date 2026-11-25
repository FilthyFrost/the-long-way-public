/**
 * The fishing module's sounds, made on the spot with Web Audio (no files): the cast's swish, the float's plop, a
 * nibble's tick, the bite's thump, the reel's clicks while one winds, the line's whine rising with its tension, the
 * run's squeal, the snap, the splash of a fish in the air, and a chime on landing that grows longer and brighter
 * with the fish's rarity. Played on the game's own sound (GameContext.audio): its context, into the node all its sounds
 * go into, so the game's volume and its mute are theirs too; silent until the page is first clicked.
 */
export type FishSound = 'cast' | 'plop' | 'nibble' | 'bite' | 'strike' | 'tell' | 'snap' | 'splash' | 'jump' | 'coin' | 'click' | 'miss' | 'zap' | 'junk' | 'sky' | 'thrash' | 'slap' | 'catch';

export class FishAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private whine: OscillatorNode | null = null;
  private whineGain: GainNode | null = null;
  private reelGain: GainNode | null = null;
  private reelT = 0;
  private dragT = 0;
  volume = 0.8;

  /** on the game's sound, once it is there (every frame until it is: GameContext.audio) */
  attach(ctx: AudioContext | null, out: AudioNode | null): void {
    if (this.ctx || !ctx || !out) return;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(out);
    // a second of white noise for the swishes and splashes
    const n = ctx.sampleRate;
    const buf = ctx.createBuffer(1, n, n);
    const d = buf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < n; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (s / 0x7fffffff) * 2 - 1;
    }
    this.noise = buf;
    // the line's whine: one oscillator always on, its gain following the tension
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 400;
    const g = ctx.createGain();
    g.gain.value = 0;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 6;
    bp.frequency.value = 900;
    o.connect(bp).connect(g).connect(this.master);
    o.start();
    this.whine = o;
    this.whineGain = g;
    this.reelGain = ctx.createGain();
    this.reelGain.gain.value = 0;
    this.reelGain.connect(this.master);
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private noiseBurst(t: number, dur: number, f0: number, f1: number, gain: number, q = 1, type: BiquadFilterType = 'bandpass'): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.master) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private tone(t: number, dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'sine'): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name: FishSound, k = 1): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    switch (name) {
      case 'cast':
        this.noiseBurst(t, 0.45, 2400, 700, 0.18 * k, 1.2);
        this.tone(t, 0.12, 900, 500, 0.03);
        break;
      case 'plop':
        this.tone(t, 0.16, 520, 160, 0.22 * k);
        this.noiseBurst(t, 0.18, 1800, 500, 0.08 * k, 0.8);
        break;
      case 'nibble':
        this.tone(t, 0.05, 1500, 1100, 0.06);
        this.noiseBurst(t, 0.06, 2500, 1500, 0.03, 2);
        break;
      case 'bite':
        this.tone(t, 0.28, 140, 60, 0.45);
        this.noiseBurst(t, 0.25, 900, 250, 0.16, 0.7);
        break;
      case 'strike':
        this.noiseBurst(t, 0.22, 3500, 900, 0.16, 1.5);
        this.tone(t, 0.1, 700, 1200, 0.05, 'triangle');
        break;
      case 'tell':
        this.tone(t, 0.18, 900, 1900, 0.06, 'sawtooth');
        this.noiseBurst(t, 0.2, 1500, 800, 0.08, 1);
        break;
      case 'snap':
        this.noiseBurst(t, 0.12, 6000, 2500, 0.4, 0.8, 'highpass');
        this.tone(t, 0.08, 2600, 600, 0.12, 'square');
        break;
      case 'splash':
        this.noiseBurst(t, 0.35 * k, 1600, 300, 0.2 * k, 0.6);
        break;
      case 'jump':
        this.noiseBurst(t, 0.55, 2000, 250, 0.28, 0.5);
        this.noiseBurst(t + 0.6, 0.5, 1400, 200, 0.24, 0.5);
        break;
      case 'zap':
        this.tone(t, 0.6, 120, 90, 0.08, 'sawtooth');
        this.noiseBurst(t, 0.6, 5000, 3000, 0.06, 3);
        break;
      case 'coin':
        this.tone(t, 0.12, 1568, 1568, 0.08, 'triangle');
        this.tone(t + 0.07, 0.25, 2093, 2093, 0.08, 'triangle');
        break;
      case 'click':
        this.tone(t, 0.04, 1200, 900, 0.04, 'triangle');
        break;
      case 'miss':
        this.tone(t, 0.25, 420, 240, 0.06, 'triangle');
        break;
      case 'junk':
        this.tone(t, 0.3, 300, 200, 0.08, 'square');
        break;
      case 'thrash':
        // (a fish turning hard at the surface: a slap of water and a thump)
        this.noiseBurst(t, 0.3, 1300, 260, 0.22 * k, 0.6);
        this.tone(t, 0.12, 190, 90, 0.08 * k);
        break;
      case 'catch':
        // (the catch come up out of the water into the hand: a heavy wet thud, the spray falling off it)
        this.tone(t, 0.2, 150, 65, 0.24 * k);
        this.noiseBurst(t, 0.12, 2400, 800, 0.22 * k, 0.9);
        this.noiseBurst(t + 0.05, 0.45, 1500, 300, 0.12 * k, 0.6);
        break;
      case 'slap':
        // (a fish's body slapping in the hands or on the boards: a wet smack)
        this.noiseBurst(t, 0.09, 2600, 700, 0.2 * k, 0.9);
        this.tone(t, 0.07, 240, 120, 0.1 * k, 'triangle');
        break;
      case 'sky': {
        const notes = [523, 659, 784, 1047, 1319, 1568];
        notes.forEach((f, i) => this.tone(t + i * 0.12, 1.4, f, f, 0.05, 'sine'));
        break;
      }
    }
  }

  /** the landing chime: more notes, higher and longer the rarer the fish (0 common … 5 celestial) */
  landed(tier: number, first: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    this.noiseBurst(t, 0.4, 1400, 300, 0.18, 0.6);
    const scale = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760, 2093];
    const n = 2 + tier * 2 + (first ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const f = scale[Math.min(scale.length - 1, i + (tier >= 3 ? 2 : 0))];
      this.tone(t + 0.12 + i * (0.09 - tier * 0.008), 0.5 + tier * 0.15, f, f, 0.06 + 0.012 * tier, tier >= 4 ? 'triangle' : 'sine');
    }
    if (tier >= 4) this.tone(t + 0.1, 2.2, 130.8, 130.8, 0.09, 'sine');
  }

  /**
   * Every frame: the line's whine with the tension (0 … 1+, nothing below a third), the reel's clicks while
   * winding (`reeling`: 0 … 1 how fast), the drag's ratchet singing as a fish takes line (`drag`: 0 … 1)
   */
  update(dt: number, tension: number, reeling: number, drag = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.whine || !this.whineGain) return;
    const t = ctx.currentTime;
    const on = Math.max(0, tension - 0.35);
    this.whine.frequency.setTargetAtTime(320 + 900 * Math.min(1.4, tension), t, 0.05);
    this.whineGain.gain.setTargetAtTime(Math.min(0.12, on * on * 0.22), t, 0.05);
    if (drag > 0.05) {
      this.dragT += dt * (24 + 50 * drag);
      while (this.dragT >= 1) {
        this.dragT -= 1;
        this.noiseBurst(t, 0.018, 4200, 3000, 0.03 + 0.05 * drag, 3);
      }
    }
    if (reeling > 0.02) {
      this.reelT += dt * (8 + 18 * reeling);
      while (this.reelT >= 1) {
        this.reelT -= 1;
        this.tone(t, 0.025, 2600, 2200, 0.02 + 0.015 * reeling, 'square');
      }
    }
  }
}
