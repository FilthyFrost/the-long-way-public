/**
 * The radio on the dash (docs/DESIGN_V2.md 5.7, 8.9): on / off, a tuning knob whose positions hold
 * three stations with static between them, a volume knob. Everything heard is made here with Web
 * Audio — a carrier of static and three small generative tunes — no recordings of any kind.
 * Outside a browser (tests) it keeps its state and makes no sound.
 *
 * It also makes the cab's little sounds: the chime for a door left open with the key on, the
 * stop cord's ding, a door's rattle.
 */

/** tuning positions on the dial, and where the stations are */
export const TUNE_STEPS = 9;
export const STATIONS = [2, 5, 7];
export const VOLUME_STEPS = 4;

/** three tunes: notes as semitones above A3, a step length (s) and a voice */
const TUNES: { notes: (number | null)[]; step: number; wave: OscillatorType; gain: number; bass?: number[] }[] = [
  // a slow pentatonic pluck, like a guitar on a porch
  { notes: [0, 3, 7, 10, 7, 3, 5, null, 0, 3, 5, 7, 10, 12, 10, null], step: 0.32, wave: 'triangle', gain: 0.22, bass: [-12, -12, -5, -7] },
  // a soft organ waltz
  { notes: [7, null, 4, 5, null, 2, 4, null, 0, 2, null, -1, 0, null, null, null], step: 0.26, wave: 'sine', gain: 0.26, bass: [-12, -17, -15, -20] },
  // a bright little chip tune
  { notes: [12, 15, 19, 15, 12, 10, 7, 10, 12, 15, 17, 19, 22, 19, 17, 15], step: 0.14, wave: 'square', gain: 0.07, bass: [-12, -12, -9, -7] },
];

export class Radio {
  on = false;
  tune = STATIONS[0];
  volume = 2;
  /** which station the dial sits on (index), or −1 between them */
  get station(): number {
    return STATIONS.indexOf(this.tune);
  }
  /** how much static is heard (0 on a station, 1 far from one) */
  get hiss(): number {
    const d = Math.min(...STATIONS.map((s) => Math.abs(s - this.tune)));
    return Math.min(1, d / 1.5);
  }

  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private music: GainNode | null = null;
  private noise: GainNode | null = null;
  private nextNote = 0;
  private step = 0;
  private chimeT = 0;

  nextTune(): number {
    this.tune = (this.tune + 1) % TUNE_STEPS;
    return this.tune;
  }

  nextVolume(): number {
    this.volume = (this.volume % VOLUME_STEPS) + 1;
    return this.volume;
  }

  /** a bump made it jump a station (the radio_skip quirk) */
  skip(): void {
    this.tune = Math.min(TUNE_STEPS - 1, this.tune + 1);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(ctx.destination);
    this.music = ctx.createGain();
    this.music.connect(this.out);
    // static: noise through a band that sounds like a small speaker
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1800;
    band.Q.value = 0.6;
    this.noise = ctx.createGain();
    this.noise.gain.value = 0;
    src.connect(band).connect(this.noise).connect(this.out);
    src.start();
    return ctx;
  }

  private tone(freq: number, at: number, len: number, wave: OscillatorType, gain: number, dest: AudioNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = wave;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, at + len);
    o.connect(g).connect(dest);
    o.start(at);
    o.stop(at + len + 0.05);
  }

  /** the chime of a door left open, the stop cord's ding */
  ding(times = 1): void {
    const ctx = this.ensure();
    if (!ctx) return;
    void ctx.resume();
    for (let i = 0; i < times; i++) this.tone(1318, ctx.currentTime + i * 0.28, 0.6, 'sine', 0.18, ctx.destination);
  }

  /** a door rattling in its frame */
  rattle(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (let i = 0; i < 3; i++) this.tone(140 + i * 37, ctx.currentTime + i * 0.035, 0.05, 'square', 0.05, ctx.destination);
  }

  /** every frame: schedule the next notes, set the static; `doorOpen` = a door stands open with the key on */
  update(dt: number, doorOpen: boolean): void {
    if (doorOpen) {
      this.chimeT -= dt;
      if (this.chimeT <= 0) {
        this.ding(1);
        this.chimeT = 1.2;
      }
    } else this.chimeT = 0;
    if (!this.on) {
      if (this.out && this.ctx) this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      return;
    }
    const ctx = this.ensure();
    if (!ctx || !this.out || !this.music || !this.noise) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime;
    const vol = 0.12 * this.volume;
    this.out.gain.setTargetAtTime(vol, t, 0.05);
    const hiss = this.hiss;
    this.noise.gain.setTargetAtTime(0.05 + 0.6 * hiss, t, 0.05);
    this.music.gain.setTargetAtTime(1 - hiss, t, 0.05);
    const st = this.station;
    if (st < 0) return;
    const tune = TUNES[st];
    if (this.nextNote < t) this.nextNote = t + 0.05;
    while (this.nextNote < t + 0.25) {
      const n = tune.notes[this.step % tune.notes.length];
      if (n !== null) this.tone(220 * Math.pow(2, n / 12), this.nextNote, tune.step * 1.8, tune.wave, tune.gain, this.music);
      if (tune.bass && this.step % 4 === 0) {
        const b = tune.bass[Math.floor(this.step / 4) % tune.bass.length];
        this.tone(220 * Math.pow(2, b / 12), this.nextNote, tune.step * 3.6, 'sine', 0.2, this.music);
      }
      this.nextNote += tune.step;
      this.step++;
    }
  }
}
