/**
 * ModCar engine sound. Each engine has a bank recorded with Engine Simulator (tools/enginesim):
 * steady loops every ~13 % of rpm from idle to past the redline, at full load and on the overrun,
 * plus the starter turning it over, the catch, the switch-off, a stall and the rev limiter.
 * EngineVoice plays the two loops nearest the current rpm (pitched to it exactly, equal-power
 * crossfade), blends full load against overrun by throttle and load, and adds what the recording
 * cannot know about: the starter motor, induction roar, a fan or gear whine, the turbo, pops on
 * lifting off, the exhaust fitted and whether you sit in a closed cabin.
 *
 * It shares the game's AudioContext (AudioEngine.context / .output) and works the same in an
 * OfflineAudioContext (the render harness steps it with suspend/resume).
 */
import { Rng, biquad, burst, edges, noise, normalize } from './synth';

// ------------------------------------------------------------------ bank manifest

export interface LoopRec {
  file: string;
  /** 1 = full load, 0 = overrun (the idle loop is the overrun at idle rpm) */
  load: number;
  rpm: number;
  /** natural level against the bank's loudest full-load loop (dB) */
  db: number;
  loopStart: number;
  loopEnd: number;
  duration: number;
  idle?: boolean;
  /** seconds from loopStart to the start of an engine cycle, chained across the bank so loops
   * started at the same cycle phase line up (phase-locked crossfades) */
  phase?: number;
  /** how alike this loop and the next loop down at the same load are, once aligned (0..1) */
  coh?: number;
  /** overrun loops: how alike this loop and the full-load loop at its rpm are, once aligned */
  cohLoad?: number;
}

export interface ShotRec {
  file: string;
  db: number;
  duration: number;
  loopStart?: number;
  loopEnd?: number;
  rpm?: number;
}

export interface BankManifest {
  id: string;
  version: number;
  sampleRate: number;
  formats: string[];
  cylinders: number;
  strokes: number;
  idleRpm: number;
  redlineRpm: number;
  limiterRpm: number;
  offMode: 'closed' | 'fuelcut';
  loops: LoopRec[];
  oneshots: Record<string, ShotRec>;
}

export interface Bank {
  manifest: BankManifest;
  buffers: Map<string, AudioBuffer>;
  /** loops sorted by rpm, per load */
  on: LoopRec[];
  off: LoopRec[];
}

// ------------------------------------------------------------------ per-engine and per-exhaust tone

interface EngineTone {
  /** level at full throttle at the redline, against the V8 (dB) */
  loudnessDb: number;
  /** how much of the recorded dynamic range is kept (dB scale factor) */
  compression: number;
  /** extra rise from idle to redline (dB), for engines the simulator plays too flat */
  tiltDb: number;
  /** induction roar under throttle */
  intake: number;
  /** pops on lifting off (with a stock exhaust) */
  pops: number;
  /** tonal mechanical whine: frequency = ratio * rpm / 60 */
  whine?: { ratio: number; gainDb: number; q: number };
  /** starter motor: pitch and how hard each compression stroke drags on it */
  starter: { hz: number; drag: number; gainDb: number };
}

/** the starter motor against the bank's loudest loop (it sits a little under the idle) */
const STARTER_DB = -27;

const TONES: Record<string, EngineTone> = {
  eng_mower: { loudnessDb: -6, compression: 0.3, tiltDb: 3, intake: 0.05, pops: 0.05, starter: { hz: 190, drag: 0.55, gainDb: STARTER_DB } },
  eng_single: { loudnessDb: -5, compression: 0.32, tiltDb: 6, intake: 0.12, pops: 0.35, starter: { hz: 230, drag: 0.6, gainDb: STARTER_DB } },
  eng_2t: { loudnessDb: -3, compression: 0.32, tiltDb: 8, intake: 0.1, pops: 0.15, starter: { hz: 240, drag: 0.45, gainDb: STARTER_DB } },
  eng_i4: { loudnessDb: -7, compression: 0.3, tiltDb: 2, intake: 0.1, pops: 0.15, starter: { hz: 160, drag: 0.3, gainDb: STARTER_DB } },
  eng_i4d: { loudnessDb: -4, compression: 0.3, tiltDb: 2, intake: 0.08, pops: 0.0, whine: { ratio: 21, gainDb: -34, q: 18 }, starter: { hz: 130, drag: 0.4, gainDb: STARTER_DB } },
  eng_flat6: { loudnessDb: -4, compression: 0.3, tiltDb: 3, intake: 0.16, pops: 0.45, whine: { ratio: 11 * 1.8, gainDb: -27, q: 7 }, starter: { hz: 170, drag: 0.3, gainDb: STARTER_DB } },
  eng_v8: { loudnessDb: 0, compression: 0.3, tiltDb: 0, intake: 0.16, pops: 0.6, starter: { hz: 140, drag: 0.35, gainDb: STARTER_DB } },
  eng_d6: { loudnessDb: -2, compression: 0.3, tiltDb: 2, intake: 0.08, pops: 0.0, whine: { ratio: 17, gainDb: -32, q: 14 }, starter: { hz: 110, drag: 0.45, gainDb: STARTER_DB } },
};

const DEFAULT_TONE: EngineTone = { loudnessDb: -4, compression: 0.3, tiltDb: 2, intake: 0.1, pops: 0.2, starter: { hz: 150, drag: 0.35, gainDb: STARTER_DB } };

interface ExhaustTone {
  gainDb: number;
  /** low shelf at 120 Hz (body) and high shelf at 1.8 kHz (bite), dB */
  bodyDb: number;
  biteDb: number;
  lowpass: number;
  /** pulse-synchronous flow noise layered at run time, 0..1 */
  rasp: number;
  /** multiplies the engine's pop tendency */
  pops: number;
}

export const EXHAUSTS: Record<string, ExhaustTone> = {
  exh_stock: { gainDb: 0, bodyDb: 0, biteDb: -1, lowpass: 7500, rasp: 0.0, pops: 0.35 },
  exh_sport: { gainDb: 4, bodyDb: 2.5, biteDb: 3, lowpass: 11000, rasp: 0.35, pops: 1.0 },
  exh_side: { gainDb: 8, bodyDb: 3, biteDb: 6, lowpass: 15000, rasp: 0.7, pops: 1.6 },
  /** nothing fitted: open manifold */
  none: { gainDb: 11, bodyDb: -2, biteDb: 8, lowpass: 16000, rasp: 1.0, pops: 2.0 },
};

// ------------------------------------------------------------------ loading

/** where the banks live (served from public/); override before the first load if needed */
export const bankConfig = { baseUrl: 'audio/modcar/engines/' };

const bankCache = new WeakMap<BaseAudioContext, Map<string, Promise<Bank>>>();

function pickFormat(formats: string[]): string {
  if (typeof document !== 'undefined') {
    const a = document.createElement('audio');
    if (formats.includes('ogg') && a.canPlayType('audio/ogg; codecs=opus') !== '') return 'ogg';
    if (formats.includes('m4a') && a.canPlayType('audio/mp4; codecs=mp4a.40.2') !== '') return 'm4a';
  }
  return formats[0];
}

/**
 * Seam healing: the files carry a cyclic copy of the loop head after loopEnd. Blending that copy
 * into the head makes the wrap from loopEnd back to loopStart land on the decoder's own continuous
 * samples, so the lossy codec cannot leave a step at the seam.
 */
export function healLoop(data: Float32Array, sr: number, loopStart: number, loopEnd: number, fadeMs = 6): void {
  const s = loopStart * sr;
  const len = (loopEnd - loopStart) * sr;
  const F = Math.max(8, Math.round((fadeMs / 1000) * sr));
  const s0 = Math.ceil(s);
  for (let j = 0; j < F; j++) {
    const i = s0 + j;
    const p = i + len; // fractional position of the same point one loop later
    const p0 = Math.floor(p);
    if (p0 + 1 >= data.length) break;
    const later = data[p0] + (data[p0 + 1] - data[p0]) * (p - p0);
    const w = (j + 0.5) / F;
    data[i] = data[i] * w + later * (1 - w);
  }
}

async function fetchBank(ctx: BaseAudioContext, id: string): Promise<Bank> {
  const base = bankConfig.baseUrl.endsWith('/') ? bankConfig.baseUrl : bankConfig.baseUrl + '/';
  const res = await fetch(`${base}${id}/manifest.json`);
  if (!res.ok) throw new Error(`engine bank ${id}: ${res.status}`);
  const manifest = (await res.json()) as BankManifest;
  const ext = pickFormat(manifest.formats);
  const files = [...manifest.loops.map((l) => l.file), ...Object.values(manifest.oneshots).map((s) => s.file)];
  const buffers = new Map<string, AudioBuffer>();
  const decode = async (file: string, fmt: string): Promise<AudioBuffer> => {
    const r = await fetch(`${base}${id}/${file}.${fmt}`);
    if (!r.ok) throw new Error(`${id}/${file}.${fmt}: ${r.status}`);
    return ctx.decodeAudioData(await r.arrayBuffer());
  };
  await Promise.all(
    files.map(async (file) => {
      let buf: AudioBuffer;
      try {
        buf = await decode(file, ext);
      } catch (e) {
        // a browser that claims Opus but cannot decode it: fall back to the other format
        const other = manifest.formats.find((f) => f !== ext);
        if (!other) throw e;
        buf = await decode(file, other);
      }
      buffers.set(file, buf);
    }),
  );
  for (const l of manifest.loops) healLoop(buffers.get(l.file)!.getChannelData(0), buffers.get(l.file)!.sampleRate, l.loopStart, l.loopEnd);
  for (const s of Object.values(manifest.oneshots)) {
    if (s.loopStart !== undefined && s.loopEnd !== undefined) healLoop(buffers.get(s.file)!.getChannelData(0), buffers.get(s.file)!.sampleRate, s.loopStart, s.loopEnd);
  }
  const byRpm = (a: LoopRec, b: LoopRec): number => a.rpm - b.rpm;
  return { manifest, buffers, on: manifest.loops.filter((l) => l.load === 1).sort(byRpm), off: manifest.loops.filter((l) => l.load === 0).sort(byRpm) };
}

/** load (once per context) and cache a bank */
export function loadBank(ctx: BaseAudioContext, id: string): Promise<Bank> {
  let m = bankCache.get(ctx);
  if (!m) {
    m = new Map();
    bankCache.set(ctx, m);
  }
  let p = m.get(id);
  if (!p) {
    p = fetchBank(ctx, id);
    m.set(id, p);
    p.catch(() => m!.delete(id));
  }
  return p;
}

// ------------------------------------------------------------------ pure mixing maths (testable)

/**
 * Crossfade weights for two signals that are partly alike (correlation rho once phase-aligned):
 * (1-x) and x, scaled so the summed power stays 1. rho = 0 is equal power, rho = 1 a linear fade.
 */
export function blendWeights(x: number, rho: number): [number, number] {
  const r = Math.min(0.9, Math.max(0, rho));
  const g = 1 / Math.sqrt((1 - x) * (1 - x) + x * x + 2 * r * x * (1 - x));
  return [(1 - x) * g, x * g];
}

/** how alike neighbouring loops are when the bank does not say */
const DEFAULT_COHERENCE = 0.5;

/**
 * The two loops either side of rpm with power-preserving weights for phase-aligned loops, and the
 * playback rate each needs. Below the first / above the last loop the end one plays alone, pitched.
 */
export function rpmWeights(loops: readonly LoopRec[], rpm: number): Array<{ rec: LoopRec; w: number; rate: number }> {
  if (loops.length === 0) return [];
  const r = Math.max(1, rpm);
  if (r <= loops[0].rpm) return [{ rec: loops[0], w: 1, rate: r / loops[0].rpm }];
  const last = loops[loops.length - 1];
  if (r >= last.rpm) return [{ rec: last, w: 1, rate: r / last.rpm }];
  let i = 0;
  while (loops[i + 1].rpm < r) i++;
  const a = loops[i];
  const b = loops[i + 1];
  const x = Math.log(r / a.rpm) / Math.log(b.rpm / a.rpm);
  const [wa, wb] = blendWeights(x, b.coh ?? DEFAULT_COHERENCE);
  return [
    { rec: a, w: wa, rate: r / a.rpm },
    { rec: b, w: wb, rate: r / b.rpm },
  ];
}

/** how much of the full-load recording to hear: throttle mostly, load a little (0..1) */
export function loadMix(throttle: number, load: number): number {
  const t = Math.min(1, Math.max(0, throttle));
  const l = Math.min(1, Math.max(0, load));
  return Math.min(1, Math.max(0, Math.pow(t, 0.75) * (0.75 + 0.25 * l) + 0.12 * l * (1 - t)));
}

/** the play-back level (linear) of one loop for this engine */
export function loopGain(tone: EngineTone, rec: LoopRec, idleRpm: number, redlineRpm: number): number {
  const span = Math.max(1, redlineRpm - idleRpm);
  const x = Math.min(1.1, Math.max(0, (rec.rpm - idleRpm) / span));
  const db = tone.loudnessDb + tone.compression * rec.db + tone.tiltDb * (x - 1);
  return Math.pow(10, db / 20);
}

export function engineTone(id: string): EngineTone {
  return TONES[id] ?? DEFAULT_TONE;
}

// ------------------------------------------------------------------ the voice

export interface EngineAudioState {
  /** engine part fitted (null: none, nothing to hear) */
  engineId: string | null;
  /** exhaust part fitted: exh_stock / exh_sport / exh_side; null = none (open manifold) */
  exhaustId?: string | null;
  /** turbo_small fitted */
  turbo?: boolean;
  rpm: number;
  /** torque asked of the engine, 0..1 */
  load: number;
  /** pedal, 0..1 */
  throttle: number;
  /** turning by itself */
  running: boolean;
  /** starter engaged */
  cranking: boolean;
  /** listener sits in the cabin */
  inside: boolean;
  /** how open the cabin is to the outside: open or missing doors, no roof (0 = sealed, 1 = open air) */
  doorsOpen: number;
  /** battery strength while cranking, 0..1 (a weak battery cranks slowly) */
  starterRate?: number;
  /** boost from the physics, 0..1; without it the voice spools its own */
  boost?: number;
  /** listener distance when outside (m), default 3 */
  distance?: number;
  /** the stop was a stall (under load) rather than switching off; default: guessed from rpm and load */
  stalled?: boolean;
}

interface Slot {
  rec: LoopRec;
  src: AudioBufferSourceNode;
  gain: GainNode;
  /** time the slot went silent (target 0), -1 while audible */
  idleSince: number;
  /** where the play head is (buffer seconds), tracked from the rates we asked for */
  pos: number;
  /** our model of the source's actual playback rate (it glides with TAU_RATE) and its target */
  rate: number;
  target: number;
  /** last gain asked for */
  level: number;
}

const TAU_GAIN = 0.035;
const TAU_RATE = 0.012;

export class EngineVoice {
  readonly ctx: BaseAudioContext;
  /** everything ends here (connect it to the game's master bus) */
  readonly out: GainNode;
  private bank: Bank | null = null;
  private bankId: string | null = null;
  private loading: string | null = null;
  private tone: EngineTone = DEFAULT_TONE;
  private readonly slots = new Map<string, Slot>();
  private readonly rng = new Rng(0x5eed);

  // graph
  private readonly engBus: GainNode;
  private readonly exIn: GainNode;
  private readonly body: BiquadFilterNode;
  private readonly bite: BiquadFilterNode;
  private readonly exLp: BiquadFilterNode;
  private readonly exGain: GainNode;
  private readonly pre: GainNode;
  private readonly extGain: GainNode;
  private readonly cabinLp: BiquadFilterNode;
  private readonly cabinBoom: BiquadFilterNode;
  private readonly intGain: GainNode;
  private readonly raspVca: GainNode;
  private readonly raspDepth: GainNode;
  private readonly intakeGain: GainNode;
  private readonly intakeBp: BiquadFilterNode;
  private readonly whineOsc: OscillatorNode;
  private readonly whineGain: GainNode;
  private readonly whineBp: BiquadFilterNode;
  private readonly turboOsc: OscillatorNode;
  private readonly turboGain: GainNode;
  private readonly turboHiss: GainNode;
  private readonly turboBp: BiquadFilterNode;
  private readonly starterOsc: OscillatorNode;
  private readonly starterGain: GainNode;
  private readonly starterLfo: OscillatorNode;
  private readonly starterLfoDepth: GainNode;
  private readonly starterBp: BiquadFilterNode;
  private readonly starterSag: GainNode;
  private readonly noiseBuf: AudioBuffer;

  // state
  private lastT = -1;
  private wasRunning = false;
  private wasCranking = false;
  private catchUntil = 0;
  private quietUntil = 0;
  private boost = 0;
  private lastThrottle = 0;
  private throttleHi = 0;
  private popBudget = 0;
  private nextPopAt = 0;
  private bovReadyAt = 0;
  private lastRpm = 0;
  private lastLoad = 0;
  private readonly popBufs: AudioBuffer[] = [];
  private readonly bovBufs: AudioBuffer[] = [];

  constructor(ctx: BaseAudioContext, output: AudioNode) {
    this.ctx = ctx;
    const g = (v = 0): GainNode => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    const f = (type: BiquadFilterType, freq: number, q = 0.707, gain = 0): BiquadFilterNode => {
      const n = ctx.createBiquadFilter();
      n.type = type;
      n.frequency.value = freq;
      n.Q.value = q;
      n.gain.value = gain;
      return n;
    };
    this.out = g(1);
    this.out.connect(output);

    // engine loops -> exhaust colouring -> cabin split
    this.engBus = g(1);
    this.exIn = g(1);
    this.body = f('lowshelf', 120, 0.707, 0);
    this.bite = f('highshelf', 1800, 0.707, 0);
    this.exLp = f('lowpass', 7500, 0.6);
    this.exGain = g(1);
    this.pre = g(1);
    this.engBus.connect(this.exIn);
    this.exIn.connect(this.body).connect(this.bite).connect(this.exLp).connect(this.exGain).connect(this.pre);
    this.extGain = g(1);
    this.cabinLp = f('lowpass', 900, 0.5);
    this.cabinBoom = f('lowshelf', 160, 0.707, 4);
    this.intGain = g(0);
    this.pre.connect(this.extGain).connect(this.out);
    this.pre.connect(this.cabinBoom).connect(this.cabinLp).connect(this.intGain).connect(this.out);

    // two seconds of white noise for every noise layer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    nb.copyToChannel(noise(nb.length, new Rng(0xabcdef)) as Float32Array<ArrayBuffer>, 0);
    this.noiseBuf = nb;
    const noiseSrc = (): AudioBufferSourceNode => {
      const s = ctx.createBufferSource();
      s.buffer = nb;
      s.loop = true;
      s.start(0, this.rng.range(0, 1.9));
      return s;
    };

    // rasp: noise swelling with each exhaust pulse (the loop's own envelope drives the VCA)
    this.raspVca = g(0);
    this.raspDepth = g(0);
    const rect = ctx.createWaveShaper();
    const curve = new Float32Array(1025);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.abs((i / 512) - 1);
    rect.curve = curve;
    const envLp = f('lowpass', 240, 0.5);
    this.engBus.connect(rect).connect(envLp).connect(this.raspDepth).connect(this.raspVca.gain);
    noiseSrc().connect(f('highpass', 1800, 0.6)).connect(f('lowpass', 7000, 0.6)).connect(this.raspVca).connect(this.exIn);

    // induction roar
    this.intakeBp = f('bandpass', 400, 0.9);
    this.intakeGain = g(0);
    noiseSrc().connect(this.intakeBp).connect(this.intakeGain).connect(this.pre);

    // mechanical whine (fan blades, timing gears)
    this.whineOsc = ctx.createOscillator();
    this.whineOsc.type = 'triangle';
    this.whineBp = f('bandpass', 1000, 8);
    this.whineGain = g(0);
    this.whineOsc.connect(this.whineBp).connect(this.whineGain).connect(this.pre);
    this.whineOsc.start();

    // turbo: shaft whistle + hiss
    this.turboOsc = ctx.createOscillator();
    this.turboOsc.type = 'sine';
    this.turboOsc.frequency.value = 3000;
    this.turboGain = g(0);
    this.turboOsc.connect(this.turboGain).connect(this.pre);
    this.turboOsc.start();
    this.turboBp = f('bandpass', 3000, 6);
    this.turboHiss = g(0);
    noiseSrc().connect(this.turboBp).connect(this.turboHiss).connect(this.pre);

    // starter motor: a geared whine that drags on every compression stroke
    this.starterOsc = ctx.createOscillator();
    this.starterOsc.type = 'sawtooth';
    this.starterBp = f('bandpass', 700, 1.2);
    this.starterGain = g(0);
    const starterVca = g(0.6);
    this.starterLfo = ctx.createOscillator();
    this.starterLfo.type = 'sine';
    this.starterLfoDepth = g(0.35);
    this.starterLfo.connect(this.starterLfoDepth).connect(starterVca.gain);
    // the motor slows a little against every compression stroke
    this.starterSag = g(0);
    this.starterLfo.connect(this.starterSag).connect(this.starterOsc.frequency);
    this.starterOsc.connect(this.starterBp).connect(starterVca).connect(this.starterGain).connect(this.pre);
    noiseSrc().connect(f('bandpass', 2600, 2)).connect(g(0.25)).connect(starterVca);
    this.starterOsc.start();
    this.starterLfo.start();

    // pops and the blow-off valve are pre-rendered one-shots
    for (let k = 0; k < 6; k++) this.popBufs.push(this.makeBuffer(popSample(ctx.sampleRate, 101 + k, k % 3 === 2)));
    for (let k = 0; k < 2; k++) this.bovBufs.push(this.makeBuffer(blowOffSample(ctx.sampleRate, 211 + k)));
  }

  private makeBuffer(x: Float32Array): AudioBuffer {
    const b = this.ctx.createBuffer(1, x.length, this.ctx.sampleRate);
    b.copyToChannel(x as Float32Array<ArrayBuffer>, 0);
    return b;
  }

  /** the bank in use is ready (or there is no engine) */
  get ready(): boolean {
    return this.bank !== null || this.bankId === null;
  }

  /** load an engine's bank; update() calls this by itself when engineId changes */
  async load(id: string): Promise<void> {
    this.loading = id;
    const bank = await loadBank(this.ctx, id);
    if (this.loading !== id) return;
    this.loading = null;
    this.stopAll();
    this.bank = bank;
    this.bankId = id;
    this.tone = engineTone(id);
  }

  private stopAll(): void {
    for (const s of this.slots.values()) this.stopSlot(s);
    this.slots.clear();
  }

  private stopSlot(s: Slot): void {
    try {
      s.src.stop();
    } catch {
      /* never started */
    }
    s.src.disconnect();
    s.gain.disconnect();
  }

  private slot(rec: LoopRec, t: number, rate: number): Slot {
    let s = this.slots.get(rec.file);
    if (s) return s;
    const buf = this.bank!.buffers.get(rec.file)!;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = rec.loopStart;
    src.loopEnd = rec.loopEnd;
    src.playbackRate.value = rate;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(this.engBus);
    const offset = this.alignedOffset(rec);
    src.start(t, offset);
    s = { rec, src, gain, idleSince: -1, pos: offset, rate, target: rate, level: 0 };
    this.slots.set(rec.file, s);
    return s;
  }

  /**
   * Where to start a loop so its engine cycle lines up with the loudest loop already playing (the
   * bank's phases are chained, so aligned loops sum without comb filtering); anywhere if alone.
   */
  private alignedOffset(rec: LoopRec): number {
    const len = rec.loopEnd - rec.loopStart;
    let ref: Slot | null = null;
    for (const s of this.slots.values()) {
      if (s.rec.phase === undefined || s.idleSince >= 0) continue;
      if (!ref || s.level > ref.level) ref = s;
    }
    const cycles = Math.max(1, Math.round((len * rec.rpm) / 120));
    if (!ref || rec.phase === undefined) return rec.loopStart + this.rng.next() * len;
    const refCycle = 120 / ref.rec.rpm;
    const ph = (((ref.pos - ref.rec.loopStart - ref.rec.phase!) / refCycle) % 1 + 1) % 1;
    const cycle = 120 / rec.rpm;
    // the same phase in a random one of this loop's cycles
    let o = rec.phase + (ph + Math.floor(this.rng.next() * cycles)) * cycle;
    o = ((o % len) + len) % len;
    return rec.loopStart + o;
  }

  /** move every play head on by dt, following the exponential glide of its playback rate */
  private advance(dt: number): void {
    if (dt <= 0) return;
    const k = Math.exp(-dt / TAU_RATE);
    for (const s of this.slots.values()) {
      const r0 = s.rate;
      const R = s.target;
      s.pos += R * dt + (r0 - R) * TAU_RATE * (1 - k);
      s.rate = R + (r0 - R) * k;
      const len = s.rec.loopEnd - s.rec.loopStart;
      if (s.pos >= s.rec.loopEnd) s.pos = s.rec.loopStart + ((s.pos - s.rec.loopStart) % len);
    }
  }

  private shot(file: string, t: number, gainDb: number, rate = 1): AudioBufferSourceNode | null {
    const buf = this.bank?.buffers.get(file);
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const gain = this.ctx.createGain();
    gain.gain.value = Math.pow(10, gainDb / 20);
    src.connect(gain).connect(this.engBus);
    src.start(t);
    src.onended = () => {
      src.disconnect();
      gain.disconnect();
    };
    return src;
  }

  private oneShotBuffer(buf: AudioBuffer, t: number, gain: number, dest: AudioNode, rate = 1): void {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(dest);
    src.start(t);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
  }

  /** call every frame */
  update(st: EngineAudioState): void {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dt = this.lastT < 0 ? 0 : Math.min(0.25, Math.max(0, t - this.lastT));
    this.lastT = t;
    const set = (p: AudioParam, v: number, tc: number): void => {
      p.setTargetAtTime(v, t, tc);
    };

    if (st.engineId !== this.bankId && st.engineId !== this.loading) {
      if (st.engineId === null) {
        this.stopAll();
        this.bank = null;
        this.bankId = null;
      } else {
        void this.load(st.engineId);
      }
    }
    this.advance(dt);
    const bank = this.bank;
    const m = bank?.manifest;
    const tone = this.tone;
    const ex = EXHAUSTS[st.exhaustId ?? 'none'] ?? EXHAUSTS.exh_stock;

    // ---- cabin: closed cabin = muffled and boomy; open doors let the outside back in
    const open = Math.min(1, Math.max(0, st.doorsOpen));
    const dist = Math.max(1, st.distance ?? 3);
    if (st.inside) {
      set(this.extGain.gain, 0.05 + 0.55 * open, 0.08);
      set(this.intGain.gain, 0.45 * (1 - 0.55 * open), 0.08);
      set(this.cabinLp.frequency, 700 + 1600 * open, 0.08);
    } else {
      set(this.extGain.gain, Math.min(1.4, 3 / dist), 0.08);
      set(this.intGain.gain, 0, 0.08);
    }
    // ---- exhaust fitted
    set(this.exGain.gain, Math.pow(10, ex.gainDb / 20), 0.05);
    set(this.body.gain, ex.bodyDb, 0.05);
    set(this.bite.gain, ex.biteDb, 0.05);
    set(this.exLp.frequency, ex.lowpass, 0.05);

    const rpm = Math.max(0, st.rpm);
    const thr = Math.min(1, Math.max(0, st.throttle));
    const load = Math.min(1, Math.max(0, st.load));

    // ---- starting, stopping
    const running = st.running && !!bank;
    if (running && !this.wasRunning && bank) {
      // the catch: first firing, flare, settle; the loops come in under its tail
      const c = m!.oneshots['catch'];
      if (c && (this.wasCranking || st.cranking)) {
        this.shot('catch', t, tone.loudnessDb + tone.compression * c.db + 2);
        this.catchUntil = t + Math.min(1.1, c.duration * 0.55);
      }
    }
    if (!running && this.wasRunning && bank) {
      const stalled = st.stalled ?? (this.lastLoad > 0.35 || this.lastRpm < m!.idleRpm * 0.8);
      const s = m!.oneshots[stalled ? 'stall' : 'shutdown'];
      if (s) this.shot(s.file, t, tone.loudnessDb + tone.compression * s.db + 2, Math.min(1.25, Math.max(0.8, this.lastRpm / m!.idleRpm || 1)));
      this.quietUntil = t + 0.12;
    }
    this.wasRunning = running;
    this.wasCranking = st.cranking;
    this.lastRpm = rpm;
    this.lastLoad = load;

    // ---- loops
    const want = new Map<string, { rec: LoopRec; gain: number; rate: number }>();
    if (bank && running) {
      // fade the loops in under the catch
      const inCatch = t < this.catchUntil ? Math.max(0.15, 1 - (this.catchUntil - t) / 0.6) : 1;
      const mix = loadMix(thr, load);
      // full load against overrun at this rpm: aligned too, so the same crossfade law
      const offNear = rpmWeights(bank.off, rpm)[0]?.rec;
      const [wOff, wOn] = blendWeights(mix, offNear?.cohLoad ?? DEFAULT_COHERENCE * 0.5);
      // the rev limiter: crossfade into its own recording near the cut
      const lim = m!.oneshots['limiter'];
      // (the physics may cut at the redline or at the recorded limiter, whichever comes first)
      const cut = Math.min(m!.limiterRpm, m!.redlineRpm * 1.015);
      const limW = lim ? smoothstep(cut - 160, cut - 10, rpm) * smoothstep(0.35, 0.8, thr) : 0;
      for (const [set2, w0] of [[bank.on, wOn], [bank.off, wOff]] as const) {
        if (w0 < 1e-3) continue;
        for (const { rec, w, rate } of rpmWeights(set2, rpm)) {
          const gain = w * w0 * (1 - limW) * inCatch * loopGain(tone, rec, m!.idleRpm, m!.redlineRpm);
          if (gain > 1e-4) want.set(rec.file, { rec, gain, rate });
        }
      }
      if (lim && limW > 1e-3 && lim.loopStart !== undefined && lim.loopEnd !== undefined) {
        const rec: LoopRec = { file: lim.file, load: 1, rpm: lim.rpm ?? m!.limiterRpm, db: lim.db, loopStart: lim.loopStart, loopEnd: lim.loopEnd, duration: lim.duration };
        want.set(rec.file, { rec, gain: limW * inCatch * loopGain(tone, { ...rec, rpm: m!.redlineRpm }, m!.idleRpm, m!.redlineRpm), rate: 1 });
      }
    }
    // the starter turning the engine over (no firing yet)
    if (bank && st.cranking && !running) {
      const c = m!.oneshots['crank'];
      if (c && c.loopStart !== undefined && c.loopEnd !== undefined) {
        const rate = 0.55 + 0.45 * Math.min(1, Math.max(0.2, st.starterRate ?? 1));
        const rec: LoopRec = { file: c.file, load: 0, rpm: c.rpm ?? 200, db: c.db, loopStart: c.loopStart, loopEnd: c.loopEnd, duration: c.duration };
        want.set(c.file, { rec, gain: Math.pow(10, (tone.loudnessDb + tone.compression * c.db + 6) / 20), rate });
      }
    }
    // start the loudest new loops first, so the quieter ones align to them
    for (const wv of [...want.values()].sort((a, b) => b.gain - a.gain)) {
      const s = this.slot(wv.rec, t, wv.rate);
      s.level = t < this.quietUntil ? 0 : wv.gain;
      set(s.gain.gain, s.level, TAU_GAIN);
      set(s.src.playbackRate, wv.rate, TAU_RATE);
      s.target = wv.rate;
      s.idleSince = -1;
    }
    for (const [file, s] of this.slots) {
      if (want.has(file)) continue;
      if (s.idleSince < 0) {
        s.idleSince = t;
        s.level = 0;
        set(s.gain.gain, 0, running ? TAU_GAIN : 0.05);
      } else if (t - s.idleSince > 0.4) {
        this.stopSlot(s);
        this.slots.delete(file);
      }
    }

    // ---- run-time layers
    const rev = m ? Math.min(1.2, Math.max(0, (rpm - m.idleRpm) / Math.max(1, m.redlineRpm - m.idleRpm))) : 0;
    const on = running ? 1 : 0;
    // rasp follows the loudness of the loops themselves
    // (about -17 dB under the engine with side pipes at full throttle, -23 dB with a sport can)
    set(this.raspDepth.gain, on * ex.rasp * (0.3 + 0.7 * thr) * 0.9, 0.05);
    // induction roar opens with throttle and revs
    set(this.intakeBp.frequency, 220 + 0.18 * rpm, 0.05);
    set(this.intakeGain.gain, 0.55 * on * tone.intake * Math.pow(thr, 1.5) * (0.25 + 0.75 * rev) * Math.pow(10, tone.loudnessDb / 20), 0.05);
    // mechanical whine
    if (tone.whine) {
      const hz = (tone.whine.ratio * rpm) / 60;
      set(this.whineOsc.frequency, Math.max(20, hz), TAU_RATE);
      set(this.whineBp.frequency, Math.max(40, hz), TAU_RATE);
      this.whineBp.Q.value = tone.whine.q;
      set(this.whineGain.gain, on * Math.pow(10, (tone.whine.gainDb + tone.loudnessDb) / 20) * (0.35 + 0.65 * rev), 0.05);
    } else {
      set(this.whineGain.gain, 0, 0.05);
    }
    // turbo: spools with lag above 2800 rpm under throttle, whistles with shaft speed
    const target = st.turbo ? (st.boost ?? smoothstep(2400, 4200, rpm) * Math.pow(thr, 0.8)) : 0;
    const tauUp = 0.9;
    const tauDown = 0.35;
    this.boost += (target - this.boost) * (1 - Math.exp(-dt / (target > this.boost ? tauUp : tauDown)));
    const b = st.turbo && running ? this.boost : 0;
    const shaft = 1800 + 7200 * b + 0.25 * rpm;
    set(this.turboOsc.frequency, shaft, 0.03);
    set(this.turboBp.frequency, shaft * 1.02, 0.03);
    const lvl = Math.pow(10, tone.loudnessDb / 20);
    set(this.turboGain.gain, 0.011 * lvl * Math.pow(b, 1.6) * (0.5 + 0.5 * thr), 0.04);
    set(this.turboHiss.gain, 0.025 * lvl * b * (0.3 + 0.7 * thr), 0.05);
    // blow-off on a sharp lift with boost up
    if (st.turbo && running && this.lastThrottle - thr > 0.35 && this.boost > 0.35 && t > this.bovReadyAt) {
      this.oneShotBuffer(this.bovBufs[Math.floor(this.rng.next() * this.bovBufs.length)], t, 0.35 * this.boost, this.pre);
      this.boost *= 0.4;
      this.bovReadyAt = t + 0.8;
    }
    // pops and crackle on lifting off from high revs
    if (running && m) {
      if (thr > 0.6) this.throttleHi = Math.min(1, this.throttleHi + dt * 1.5);
      if (this.lastThrottle - thr > 0.4 && rev > 0.45 && this.throttleHi > 0.3) {
        this.popBudget = Math.round((2 + 7 * this.rng.next()) * tone.pops * ex.pops);
        this.nextPopAt = t + 0.04 + 0.08 * this.rng.next();
        this.throttleHi = 0;
      }
      if (thr > 0.25) this.popBudget = 0;
      if (this.popBudget > 0 && t >= this.nextPopAt && rev > 0.2) {
        const big = this.rng.next() < 0.18 * ex.pops;
        const buf = this.popBufs[Math.floor(this.rng.next() * this.popBufs.length)];
        const g = (big ? 0.55 : 0.22) * (0.5 + 0.5 * this.rng.next()) * Math.pow(10, tone.loudnessDb / 20);
        this.oneShotBuffer(buf, t, g, this.exIn, 0.8 + 0.5 * this.rng.next());
        this.popBudget--;
        this.nextPopAt = t + 0.05 + 0.22 * this.rng.next();
      }
    } else {
      this.popBudget = 0;
    }
    this.lastThrottle = thr;
    // starter motor
    const sr = Math.min(1, Math.max(0.15, st.starterRate ?? 1));
    const crankHz = tone.starter.hz * (0.55 + 0.45 * sr);
    set(this.starterOsc.frequency, crankHz, 0.04);
    set(this.starterBp.frequency, crankHz * 3.2, 0.04);
    // compression strokes per second while cranking at ~starter speed
    const cyl = m ? m.cylinders * (m.strokes === 2 ? 2 : 1) : 4;
    set(this.starterLfo.frequency, ((m?.oneshots['crank']?.rpm ?? 220) / 60) * (cyl / 2) * (0.55 + 0.45 * sr), 0.05);
    this.starterLfoDepth.gain.value = 0.6 * tone.starter.drag;
    this.starterSag.gain.value = -crankHz * 0.12 * tone.starter.drag;
    set(this.starterGain.gain, st.cranking ? Math.pow(10, (tone.starter.gainDb + tone.loudnessDb) / 20) * (0.5 + 0.5 * sr) : 0, st.cranking ? 0.02 : 0.06);
  }

  /** stop everything and release the nodes */
  dispose(): void {
    this.stopAll();
    for (const n of [this.whineOsc, this.turboOsc, this.starterOsc, this.starterLfo]) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    this.out.disconnect();
  }

  /** what the voice is doing (for the harness and the debug overlay) */
  debug(): Record<string, unknown> {
    return {
      bank: this.bankId,
      loading: this.loading,
      slots: [...this.slots.values()].map((s) => ({ file: s.rec.file, gain: s.gain.gain.value, rate: s.src.playbackRate.value })),
      boost: this.boost,
      pops: this.popBudget,
    };
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ------------------------------------------------------------------ pre-rendered layers

/** one exhaust pop: a sharp crack and a short low boom from the pipe (big = a backfire) */
export function popSample(sr: number, seed: number, big = false): Float32Array {
  const rng = new Rng(seed);
  const len = big ? 0.32 : 0.12;
  const x = new Float32Array(Math.floor(len * sr));
  // crack
  burst(x, sr, 0, big ? 0.012 : 0.006, 1.0, rng, { attack: 0.0002, decay: big ? 0.004 : 0.0018, filter: [['highpass', 900], ['lowpass', 9000]] });
  // boom from the pipe resonance
  burst(x, sr, Math.floor(0.0015 * sr), big ? 0.25 : 0.08, big ? 1.2 : 0.7, rng, { attack: 0.0008, decay: big ? 0.05 : 0.018, filter: [['lowpass', big ? 380 : 650], ['lowpass', big ? 500 : 900]] });
  // a second, smaller report now and then
  if (rng.next() < 0.4) burst(x, sr, Math.floor(rng.range(0.012, 0.03) * sr), 0.03, 0.5, rng, { attack: 0.0003, decay: 0.006, filter: [['bandpass', 1400, 0.8]] });
  return normalize(edges(x, sr, 0.1, 10), 0.95);
}

/** blow-off valve: a fast pneumatic "pssh" with a little flutter */
export function blowOffSample(sr: number, seed: number): Float32Array {
  const rng = new Rng(seed);
  const len = 0.55;
  const n = Math.floor(len * sr);
  const x = noise(n, rng);
  biquad(x, sr, 'highpass', 900, 0.7);
  biquad(x, sr, 'peaking', 3200, 1.2, 6);
  biquad(x, sr, 'lowpass', 9000, 0.7);
  const flutter = rng.range(14, 22);
  for (let i = 0; i < n; i++) {
    const tt = i / sr;
    const env = (tt < 0.012 ? tt / 0.012 : Math.exp(-(tt - 0.012) / 0.13)) * (0.82 + 0.18 * Math.sin(2 * Math.PI * flutter * tt));
    x[i] *= env;
  }
  return normalize(edges(x, sr, 0.5, 30), 0.9);
}
