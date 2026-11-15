/**
 * The old radio (the car's radio part, the garage's set): five made-up songs from the stations out
 * here, synthesized once each — a picked guitar, a bass, brushes, a whistled or harmonica tune — and
 * heard the way an old AM set hears them: a narrow band, a little crackle, a hiss when it is turned on
 * and the dial finds the station. Nothing recorded. Loops of 8 bars.
 */
import { Rng, biquad, normalize, saturate } from './synth';

export interface Song {
  name: string;
  bpm: number;
  /** beats in a bar */
  beats: 3 | 4;
  /** MIDI note of the key's root */
  key: number;
  /** each bar's chord: semitones of its root above the key, and minor or not */
  bars: [number, boolean][];
  /** how the guitar plays: picked eighths, a waltz, a bouncing two-step, slow and spread */
  style: 'pick' | 'waltz' | 'bounce' | 'slow';
  /** the tune's voice: a whistle or a harmonica */
  lead: 'whistle' | 'harp';
  seed: number;
}

/** the garage set's stations (garageMachines.ts names them the same) */
export const SONGS: Song[] = [
  { name: '晚风吹过加油站', bpm: 92, beats: 4, key: 55, bars: [[0, false], [9, true], [5, false], [7, false], [0, false], [9, true], [2, true], [7, false]], style: 'pick', lead: 'whistle', seed: 11 },
  { name: '老路上的月亮', bpm: 72, beats: 4, key: 57, bars: [[0, true], [5, true], [7, false], [0, true], [8, false], [5, true], [7, false], [0, true]], style: 'slow', lead: 'harp', seed: 23 },
  { name: '拖拉机进城', bpm: 126, beats: 4, key: 52, bars: [[0, false], [0, false], [5, false], [0, false], [7, false], [5, false], [0, false], [7, false]], style: 'bounce', lead: 'harp', seed: 37 },
  { name: '明天还要往西开', bpm: 100, beats: 4, key: 50, bars: [[0, false], [7, false], [9, true], [5, false], [0, false], [7, false], [5, false], [7, false]], style: 'pick', lead: 'whistle', seed: 41 },
  { name: '雨刷器华尔兹', bpm: 138, beats: 3, key: 53, bars: [[0, false], [0, false], [7, false], [7, false], [5, false], [0, false], [7, false], [0, false]], style: 'waltz', lead: 'whistle', seed: 53 },
];

const hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** a plucked string (Karplus–Strong), added into `out` from sample `at` */
function pluck(out: Float32Array, sr: number, at: number, f: number, amp: number, rng: Rng, decay = 0.996, len = 1.6): void {
  const period = Math.max(2, Math.round(sr / f));
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = rng.range(-1, 1);
  const n = Math.min(out.length - at, Math.floor(len * sr));
  let p = 0;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const cur = ring[p];
    const nxt = ring[(p + 1) % period];
    // the averaging filter dulls it as it rings; decay < 1 lets it die
    ring[p] = decay * 0.5 * (cur + nxt);
    // a soft attack so the pick does not click
    const env = Math.min(1, i / (0.004 * sr));
    out[at + i] += (0.7 * cur + 0.3 * prev) * amp * env;
    prev = cur;
    p = (p + 1) % period;
  }
}

/** a tone with a shape (bass, lead), added into `out` */
function tone(out: Float32Array, sr: number, at: number, f: number, amp: number, dur: number, kind: 'bass' | 'whistle' | 'harp'): void {
  const n = Math.min(out.length - at, Math.floor(dur * sr));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    // a slow vibrato on the tune, none on the bass
    const vib = kind === 'bass' ? 1 : 1 + 0.006 * Math.sin(2 * Math.PI * 5.2 * t) * Math.min(1, t / 0.25);
    ph += (2 * Math.PI * f * vib) / sr;
    let s: number;
    if (kind === 'bass') s = Math.sin(ph) + 0.25 * Math.sin(2 * ph);
    else if (kind === 'whistle') s = Math.sin(ph) + 0.04 * Math.sin(2 * ph);
    else s = Math.sin(ph) + 0.45 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph) + 0.12 * Math.sin(5 * ph);
    const a = kind === 'bass' ? Math.exp(-t * 3.2) : Math.min(1, t / 0.03) * Math.min(1, (dur - t) / 0.06);
    out[at + i] += s * a * amp;
  }
}

/** a brush on the snare, a soft kick */
function hit(out: Float32Array, sr: number, at: number, kind: 'brush' | 'kick', amp: number, rng: Rng): void {
  const n = Math.min(out.length - at, Math.floor((kind === 'brush' ? 0.16 : 0.22) * sr));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if (kind === 'brush') out[at + i] += rng.range(-1, 1) * Math.exp(-t * 22) * amp;
    else {
      ph += (2 * Math.PI * (55 + 70 * Math.exp(-t * 30))) / sr;
      out[at + i] += Math.sin(ph) * Math.exp(-t * 14) * amp;
    }
  }
}

/** the song, as an old radio receives it (mono, normalised) */
export function renderSong(song: Song, sr: number): Float32Array {
  const beat = 60 / song.bpm;
  const bar = beat * song.beats;
  const len = Math.floor(bar * song.bars.length * sr);
  const out = new Float32Array(len);
  const brush = new Float32Array(len);
  const rng = new Rng(song.seed);
  const scale = [0, 2, 4, 7, 9];
  let last = 2;
  song.bars.forEach(([root, minor], b) => {
    const t0 = b * bar;
    const r = song.key + root;
    const chord = [r, r + (minor ? 3 : 4), r + 7];
    const S = (t: number): number => Math.floor(t * sr);
    // the bass: root on the first beat, the fifth on the middle one
    tone(out, sr, S(t0), hz(r - 12), 0.32, beat * 1.6, 'bass');
    if (song.beats === 4) tone(out, sr, S(t0 + 2 * beat), hz(r - 5), 0.26, beat * 1.4, 'bass');
    // the guitar
    const g = [chord[0], chord[1], chord[2], chord[0] + 12, chord[1] + 12];
    if (song.style === 'pick') {
      for (let k = 0; k < song.beats * 2; k++) pluck(out, sr, S(t0 + (k * beat) / 2), hz(g[[0, 2, 3, 2, 1, 2, 4, 2][k % 8]]), 0.22, rng);
    } else if (song.style === 'slow') {
      for (let k = 0; k < 4; k++) pluck(out, sr, S(t0 + k * beat + 0.02 * k), hz(g[k % g.length]), 0.24, rng, 0.998, 2.4);
    } else if (song.style === 'bounce') {
      for (let k = 0; k < 4; k++) if (k % 2 === 1) for (let j = 0; j < 3; j++) pluck(out, sr, S(t0 + k * beat + 0.012 * j), hz(g[j + 1]), 0.16, rng, 0.99, 0.35);
    } else {
      // waltz: the bass on one, the chord on two and three
      for (let k = 1; k < 3; k++) for (let j = 0; j < 3; j++) pluck(out, sr, S(t0 + k * beat + 0.01 * j), hz(g[j + 1]), 0.15, rng, 0.992, 0.5);
    }
    // the drums (soft)
    for (let k = 0; k < song.beats; k++) {
      if (k === 0) hit(out, sr, S(t0), 'kick', 0.25, rng);
      if ((song.beats === 4 && k % 2 === 1) || (song.beats === 3 && k > 0)) hit(brush, sr, S(t0 + k * beat), 'brush', 0.12, rng);
    }
    // the tune: a walk on the scale, landing on the chord at the start of the bar; a rest now and then
    const notes = song.style === 'slow' ? 2 : song.beats;
    for (let k = 0; k < notes; k++) {
      if (rng.next() < 0.18 && k > 0) continue;
      if (k === 0) {
        // the chord tone nearest the last note
        const tones = chord.map((c) => (((c - song.key) % 12) + 12) % 12);
        let best = last;
        let bd = Infinity;
        scale.forEach((d, i) => {
          if (tones.includes(d) && Math.abs(i - last) < bd) {
            bd = Math.abs(i - last);
            best = i;
          }
        });
        last = best;
      } else last = Math.max(0, Math.min(scale.length - 1, last + (rng.next() < 0.5 ? -1 : 1)));
      const dur = (bar / notes) * (rng.next() < 0.3 ? 0.5 : 0.92);
      tone(out, sr, S(t0 + (k * bar) / notes), hz(song.key + 12 + scale[last]), song.lead === 'harp' ? 0.12 : 0.15, dur, song.lead);
    }
  });
  biquad(brush, sr, 'highpass', 2500);
  for (let i = 0; i < len; i++) out[i] += brush[i];
  // the AM set: no lows, no highs, a little grit
  biquad(out, sr, 'highpass', 260, 0.7);
  biquad(out, sr, 'lowpass', 3300, 0.7);
  biquad(out, sr, 'peaking', 1400, 1.0, 3);
  saturate(normalize(out, 0.8), 1.6);
  // loop seam: fade the last few milliseconds into the first
  const fade = Math.floor(0.01 * sr);
  for (let i = 0; i < fade; i++) out[len - fade + i] *= 1 - i / fade;
  return out;
}

export interface RadioState {
  on: boolean;
  /** which station (SONGS) */
  song: number;
  /** how loud it reaches the listener, 0…1 (inside the car, standing beside the garage set, farther off) */
  level: number;
}

/** one radio set: a station's song and the hiss between stations */
export class Radio {
  private readonly out: GainNode;
  private readonly music: GainNode;
  private readonly hiss: GainNode;
  private src: AudioBufferSourceNode | null = null;
  private songNow = -1;
  private wasOn = false;
  private static readonly cache = new Map<string, AudioBuffer>();

  constructor(
    private readonly ctx: BaseAudioContext,
    output: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(output);
    this.music = ctx.createGain();
    this.music.connect(this.out);
    this.hiss = ctx.createGain();
    this.hiss.gain.value = 0;
    // static: noise in the band the set hears
    const n = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
    const d = n.getChannelData(0);
    const rng = new Rng(7);
    for (let i = 0; i < d.length; i++) d[i] = rng.range(-1, 1) * (rng.next() < 0.002 ? 3 : 1);
    const ns = ctx.createBufferSource();
    ns.buffer = n;
    ns.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.6;
    ns.connect(bp).connect(this.hiss).connect(this.out);
    ns.start();
  }

  private buffer(i: number): AudioBuffer {
    const key = `${i}@${this.ctx.sampleRate}`;
    let b = Radio.cache.get(key);
    if (!b) {
      const x = renderSong(SONGS[i], this.ctx.sampleRate);
      b = this.ctx.createBuffer(1, x.length, this.ctx.sampleRate);
      b.getChannelData(0).set(x);
      Radio.cache.set(key, b);
    }
    return b;
  }

  update(st: RadioState): void {
    const t = this.ctx.currentTime;
    const song = ((st.song % SONGS.length) + SONGS.length) % SONGS.length;
    if (st.on && (song !== this.songNow || !this.src)) {
      this.src?.stop();
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffer(song);
      src.loop = true;
      src.connect(this.music);
      src.start(t + 0.35);
      this.src = src;
      this.songNow = song;
      // the dial finds the station: a burst of hiss under it
      this.hiss.gain.cancelScheduledValues(t);
      this.hiss.gain.setValueAtTime(0.22, t);
      this.hiss.gain.linearRampToValueAtTime(0.025, t + 0.7);
    }
    if (!st.on && this.src) {
      this.src.stop(t + 0.05);
      this.src = null;
      this.songNow = -1;
    }
    if (st.on !== this.wasOn) {
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setTargetAtTime(st.on ? st.level : 0, t, 0.05);
      this.wasOn = st.on;
    } else if (st.on) this.out.gain.setTargetAtTime(st.level, t, 0.2);
  }

  dispose(): void {
    this.src?.stop();
    this.out.disconnect();
  }
}
