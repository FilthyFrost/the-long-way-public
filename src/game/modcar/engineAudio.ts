/**
 * ModCar engine sound. Each engine has a bank recorded with Engine Simulator (tools/enginesim):
 * steady loops every ~13 % of rpm from idle to past the redline, at full load and on the overrun,
 * plus the starter turning it over, the catch, the switch-off, a stall and the rev limiter.
 * EngineVoice plays the two loops nearest the current rpm, pitched to it exactly and started in
 * step with each other (the banks carry every loop's engine-cycle phase), crossfaded so their
 * summed power holds; blends full load against overrun by throttle and load; and adds what the
 * recording cannot know about: the starter motor, induction roar, a fan or gear whine, the turbo,
 * pops on lifting off, misfires and knock, the exhaust fitted and whether you sit in a closed cabin.
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
  /** closed = throttle shut, spark on; fuelcut = air open, no fuel (diesel overrun); light = a
   * machine that never coasts (the generator): its off loops are light-load runs */
  offMode: 'closed' | 'fuelcut' | 'light';
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
  /** a governor holds the top speed (no rev-limiter stutter): mowers and diesels */
  governed?: boolean;
  /**
   * no electric starter: a recoil rope turns it over (the rope's own sound is the foley cord_pull).
   * While cranking: no starter-motor whine, no solenoid clicks, the battery does not matter, and the
   * cranking loop follows the rpm the rope gives (rpm / the bank's crank rpm).
   */
  pullStart?: boolean;
  /** lift above 700 Hz (dB): the simulator is darker than a real exhaust in the 1-4 kHz bark */
  presenceDb: number;
  /** lift below 120 Hz (dB): the rumble a big engine has and the simulator under-plays */
  bodyDb?: number;
}

/** the starter motor against the bank's loudest loop (it sits a little under the idle) */
const STARTER_DB = -27;

const TONES: Record<string, EngineTone> = {
  eng_mower: { loudnessDb: -6, compression: 0.3, tiltDb: 3, intake: 0.05, pops: 0.05, starter: { hz: 190, drag: 0.55, gainDb: STARTER_DB }, governed: true, presenceDb: 3 },
  eng_single: { loudnessDb: -5, compression: 0.32, tiltDb: 6, intake: 0.12, pops: 0.35, starter: { hz: 230, drag: 0.6, gainDb: STARTER_DB }, presenceDb: 5 },
  eng_2t: { loudnessDb: -3, compression: 0.32, tiltDb: 8, intake: 0.1, pops: 0.15, starter: { hz: 240, drag: 0.45, gainDb: STARTER_DB }, presenceDb: 1 },
  eng_i4: { loudnessDb: -7, compression: 0.3, tiltDb: 2, intake: 0.1, pops: 0.15, starter: { hz: 160, drag: 0.3, gainDb: STARTER_DB }, presenceDb: 4 },
  eng_i4d: { loudnessDb: -4, compression: 0.3, tiltDb: 2, intake: 0.08, pops: 0.0, whine: { ratio: 21, gainDb: -34, q: 18 }, starter: { hz: 130, drag: 0.4, gainDb: STARTER_DB }, governed: true, presenceDb: 5, bodyDb: 3 },
  eng_flat6: { loudnessDb: -4, compression: 0.3, tiltDb: 3, intake: 0.16, pops: 0.45, whine: { ratio: 11 * 1.8, gainDb: -27, q: 7 }, starter: { hz: 170, drag: 0.3, gainDb: STARTER_DB }, presenceDb: 7, bodyDb: 2 },
  eng_v8: { loudnessDb: 0, compression: 0.3, tiltDb: 0, intake: 0.16, pops: 0.6, starter: { hz: 140, drag: 0.35, gainDb: STARTER_DB }, presenceDb: 9, bodyDb: 5 },
  eng_d6: { loudnessDb: -2, compression: 0.3, tiltDb: 2, intake: 0.08, pops: 0.0, whine: { ratio: 17, gainDb: -32, q: 14 }, starter: { hz: 110, drag: 0.45, gainDb: STARTER_DB }, governed: true, presenceDb: 5, bodyDb: 5 },
  // the workshop's generator: a 418 cc air-cooled single diesel governed to 3000 rpm, pulled on its
  // rope; the fan on the flywheel whines at its blade rate (18 blades: 900 Hz at 3000 rpm)
  gen_d1: { loudnessDb: -6, compression: 0.3, tiltDb: 0, intake: 0.05, pops: 0.0, whine: { ratio: 18, gainDb: -31, q: 9 }, starter: { hz: 150, drag: 0.4, gainDb: STARTER_DB }, governed: true, pullStart: true, presenceDb: 4, bodyDb: 1 },
  // (docs/MODCAR.md §25: each within about 2 dB of the nearest of the eight; the tractor single under the big six everywhere)
  eng_i3: { loudnessDb: -8, compression: 0.3, tiltDb: 3, intake: 0.1, pops: 0.1, starter: { hz: 180, drag: 0.35, gainDb: STARTER_DB }, presenceDb: 5 },
  // (the air-cooled boxer's fan whines off the crank pulley, as the flat-six's does)
  eng_boxer4: { loudnessDb: -5, compression: 0.3, tiltDb: 2, intake: 0.12, pops: 0.3, whine: { ratio: 1.8 * 14, gainDb: -27, q: 6 }, starter: { hz: 160, drag: 0.4, gainDb: STARTER_DB }, presenceDb: 6, bodyDb: 1 },
  eng_i4tc: { loudnessDb: -5, compression: 0.3, tiltDb: 3, intake: 0.18, pops: 0.4, starter: { hz: 160, drag: 0.3, gainDb: STARTER_DB }, presenceDb: 6 },
  eng_i6: { loudnessDb: -4, compression: 0.3, tiltDb: 2, intake: 0.12, pops: 0.2, starter: { hz: 150, drag: 0.3, gainDb: STARTER_DB }, presenceDb: 4, bodyDb: 2 },
  eng_v6: { loudnessDb: -3, compression: 0.3, tiltDb: 2, intake: 0.14, pops: 0.45, starter: { hz: 150, drag: 0.35, gainDb: STARTER_DB }, presenceDb: 7, bodyDb: 3 },
  eng_v12: { loudnessDb: -3, compression: 0.3, tiltDb: 6, intake: 0.18, pops: 0.5, starter: { hz: 130, drag: 0.3, gainDb: STARTER_DB }, presenceDb: 7, bodyDb: 3 },
  eng_d1: { loudnessDb: -6, compression: 0.3, tiltDb: 2, intake: 0.04, pops: 0, starter: { hz: 120, drag: 0.6, gainDb: STARTER_DB }, governed: true, presenceDb: 3, bodyDb: 2 },
  eng_i6d: { loudnessDb: -3, compression: 0.3, tiltDb: 2, intake: 0.06, pops: 0, whine: { ratio: 19, gainDb: -33, q: 14 }, starter: { hz: 115, drag: 0.45, gainDb: STARTER_DB }, governed: true, presenceDb: 5, bodyDb: 4 },
  eng_moto4: { loudnessDb: -4, compression: 0.3, tiltDb: 6, intake: 0.2, pops: 0.3, starter: { hz: 260, drag: 0.4, gainDb: STARTER_DB }, presenceDb: 6 },
  eng_vtwin: { loudnessDb: -4, compression: 0.3, tiltDb: 3, intake: 0.1, pops: 0.5, starter: { hz: 150, drag: 0.5, gainDb: STARTER_DB }, presenceDb: 4, bodyDb: 2 },
};

const DEFAULT_TONE: EngineTone = { loudnessDb: -4, compression: 0.3, tiltDb: 2, intake: 0.1, pops: 0.2, starter: { hz: 150, drag: 0.35, gainDb: STARTER_DB }, presenceDb: 5 };

interface ExhaustTone {
  gainDb: number;
  /** low shelf at 120 Hz (body) and a broad lift around 1.3 kHz (the bark), dB */
  bodyDb: number;
  biteDb: number;
  lowpass: number;
  /** pulse-synchronous flow noise layered at run time, 0..1 */
  rasp: number;
  /** multiplies the engine's pop tendency */
  pops: number;
}

export const EXHAUSTS: Record<string, ExhaustTone> = {
  exh_stock: { gainDb: 0, bodyDb: 0, biteDb: -1, lowpass: 7500, rasp: 0.15, pops: 0.35 },
  exh_sport: { gainDb: 4, bodyDb: 2.5, biteDb: 4, lowpass: 9000, rasp: 0.35, pops: 1.0 },
  exh_side: { gainDb: 8, bodyDb: 3, biteDb: 7, lowpass: 11000, rasp: 0.6, pops: 1.6 },
  /** nothing fitted: open manifold */
  none: { gainDb: 11, bodyDb: -2, biteDb: 8, lowpass: 13000, rasp: 0.85, pops: 2.0 },
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
export function rpmWeights(loops: readonly LoopRec[], rpm: number, weightRpm = rpm): Array<{ rec: LoopRec; w: number; rate: number }> {
  if (loops.length === 0) return [];
  const r = Math.max(1, rpm);
  // (the weights may follow a slightly different rpm than the pitch: see EngineVoice's wander)
  const q = Math.max(1, weightRpm);
  if (q <= loops[0].rpm) return [{ rec: loops[0], w: 1, rate: r / loops[0].rpm }];
  const last = loops[loops.length - 1];
  if (q >= last.rpm) return [{ rec: last, w: 1, rate: r / last.rpm }];
  let i = 0;
  while (loops[i + 1].rpm < q) i++;
  const a = loops[i];
  const b = loops[i + 1];
  const x = Math.log(q / a.rpm) / Math.log(b.rpm / a.rpm);
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

/** below this natural level (dB against the bank's loudest loop) the range is squeezed harder */
const LEVEL_KNEE_DB = -24;

/**
 * The play-back level (linear) of one loop for this engine: the recorded level, compressed (and
 * compressed harder below the knee so idle and light overrun stay present), plus the engine's
 * loudness and rpm tilt.
 */
export function loopGain(tone: EngineTone, rec: LoopRec, idleRpm: number, redlineRpm: number): number {
  const span = Math.max(1, redlineRpm - idleRpm);
  const x = Math.min(1.1, Math.max(0, (rec.rpm - idleRpm) / span));
  const c = tone.compression;
  const nat = rec.db >= LEVEL_KNEE_DB ? c * rec.db : c * LEVEL_KNEE_DB + 0.6 * c * (rec.db - LEVEL_KNEE_DB);
  const db = tone.loudnessDb + nat + tone.tiltDb * (x - 1);
  return Math.pow(10, db / 20);
}

export function engineTone(id: string): EngineTone {
  return TONES[id] ?? DEFAULT_TONE;
}

// ------------------------------------------------------------------ the voice

export interface EngineAudioState {
  /** engine part fitted (null: none, nothing to hear) */
  engineId: string | null;
  /** exhaust part fitted: exh_stock / exh_sport / exh_side; null = none fitted (open manifold); left out = stock */
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
  /** chance a firing misses, 0..1: a worn engine (condition), or the wrong fuel spluttering before it dies */
  misfire?: number;
  /** rod knock, 0..1: a big end going (low condition); heard more under load */
  knock?: number;
  /** steam from the cooling system, 0..1 (boiling over in the red) */
  steam?: number;
  /** listener outside: the speed the car approaches at (m/s, negative = going away), for the Doppler shift */
  approach?: number;
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
  /** the context time pos refers to (a slot starts slightly in the future) */
  clock: number;
}

/** how far ahead new loops are scheduled on a live context, so the start lands where we think */
const START_AHEAD = 0.012;

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
  /** every source that runs for the voice's whole life (stopped by dispose) */
  private readonly running: AudioScheduledSourceNode[] = [];
  /** banks that would not load (not asked for again) */
  private readonly failed = new Set<string>();
  /** a live context (starts are scheduled a little ahead); offline renders run exact */
  private readonly live: boolean;

  // graph
  private readonly engBus: GainNode;
  private readonly exIn: GainNode;
  private readonly body: BiquadFilterNode;
  private readonly bite: BiquadFilterNode;
  private readonly presence: BiquadFilterNode;
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
  private readonly misVca: GainNode;
  private readonly airLp: BiquadFilterNode;
  private readonly steamGain: GainNode;
  private readonly knockBufs: AudioBuffer[] = [];
  private readonly clickBuf: AudioBuffer;
  /** next firing slot / crank turn / solenoid click already scheduled (context time) */
  private misNext = 0;
  private knockNext = 0;
  private clickNext = 0;

  // state
  private lastT = -1;
  private wasRunning = false;
  private wasCranking = false;
  private catchUntil = 0;
  private quietUntil = 0;
  private boost = 0;
  /** recent throttle peak, falling at 4 /s: a lift is a drop from it, however many frames it takes */
  private thrPeak = 0;
  private throttleHi = 0;
  private popBudget = 0;
  private crackle = false;
  private nextPopAt = 0;
  private bovReadyAt = 0;
  private lastRpm = 0;
  private lastLoad = 0;
  /** slow random drift, -1..1: where between two loops the crossfade sits, and the idle's lope */
  private wander = 0;
  private wanderTo = 0;
  private wanderAt = 0;
  private lope = 0;
  private lopeTo = 0;
  private readonly popBufs: AudioBuffer[] = [];
  /** how many pops / blow-offs have fired (debug and the render harness) */
  popsFired = 0;
  bovFired = 0;
  private readonly bovBufs: AudioBuffer[] = [];

  constructor(ctx: BaseAudioContext, output: AudioNode) {
    this.ctx = ctx;
    this.live = typeof OfflineAudioContext === 'undefined' || !(ctx instanceof OfflineAudioContext);
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
    // misfires dip this for one firing at a time
    this.misVca = g(1);
    this.exIn = g(1);
    this.body = f('lowshelf', 120, 0.707, 0);
    this.bite = f('peaking', 1300, 0.8, 0);
    this.presence = f('highshelf', 700, 0.6, 0);
    this.exLp = f('lowpass', 7500, 0.6);
    this.exGain = g(1);
    this.pre = g(1);
    this.engBus.connect(this.misVca).connect(this.exIn);
    this.exIn.connect(this.body).connect(this.bite).connect(this.presence).connect(this.exLp).connect(this.exGain).connect(this.pre);
    this.extGain = g(1);
    // air takes the top off with distance
    this.airLp = f('lowpass', 18000, 0.5);
    this.cabinLp = f('lowpass', 900, 0.5);
    // the cabin drones where the firing frequency passes about 105 Hz (a V8 at 1600, a four at 3200)
    this.cabinBoom = f('peaking', 105, 1.4, 6);
    const cabinLow = f('lowshelf', 220, 0.707, 2);
    this.intGain = g(0);
    this.pre.connect(this.extGain).connect(this.airLp).connect(this.out);
    this.pre.connect(this.cabinBoom).connect(cabinLow).connect(this.cabinLp).connect(this.intGain).connect(this.out);

    // two seconds of white noise for every noise layer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    nb.copyToChannel(noise(nb.length, new Rng(0xabcdef)) as Float32Array<ArrayBuffer>, 0);
    const noiseSrc = (): AudioBufferSourceNode => {
      const s = ctx.createBufferSource();
      s.buffer = nb;
      s.loop = true;
      s.start(0, this.rng.range(0, 1.9));
      this.running.push(s);
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
    this.misVca.connect(rect).connect(envLp).connect(this.raspDepth).connect(this.raspVca.gain);
    noiseSrc().connect(f('highpass', 1000, 0.6)).connect(f('lowpass', 4500, 0.6)).connect(this.raspVca).connect(this.exIn);

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
    this.running.push(this.whineOsc);

    // turbo: shaft whistle + hiss
    this.turboOsc = ctx.createOscillator();
    this.turboOsc.type = 'sine';
    this.turboOsc.frequency.value = 3000;
    this.turboGain = g(0);
    this.turboOsc.connect(this.turboGain).connect(this.pre);
    this.turboOsc.start();
    this.running.push(this.turboOsc);
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
    this.running.push(this.starterOsc, this.starterLfo);

    // steam hissing out of the cooling system
    this.steamGain = g(0);
    noiseSrc().connect(f('highpass', 2200, 0.7)).connect(f('peaking', 5200, 0.9, 5)).connect(this.steamGain).connect(this.pre);

    // pops and the blow-off valve are pre-rendered one-shots
    for (let k = 0; k < 6; k++) this.popBufs.push(this.makeBuffer(popSample(ctx.sampleRate, 101 + k, k % 3 === 2)));
    for (let k = 0; k < 2; k++) this.bovBufs.push(this.makeBuffer(blowOffSample(ctx.sampleRate, 211 + k)));
    for (let k = 0; k < 3; k++) this.knockBufs.push(this.makeBuffer(rodKnockSample(ctx.sampleRate, 307 + k)));
    this.clickBuf = this.makeBuffer(solenoidSample(ctx.sampleRate, 401));
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
    const at = t + (this.live ? START_AHEAD : 0);
    const offset = this.alignedOffset(rec, at - t);
    src.start(at, offset);
    s = { rec, src, gain, idleSince: -1, pos: offset, rate, target: rate, level: 0, clock: at };
    this.slots.set(rec.file, s);
    return s;
  }

  /**
   * Where to start a loop so its engine cycle lines up with the loudest loop already playing (the
   * bank's phases are chained, so aligned loops sum without comb filtering); anywhere if alone.
   */
  private alignedOffset(rec: LoopRec, ahead: number): number {
    const len = rec.loopEnd - rec.loopStart;
    let ref: Slot | null = null;
    for (const s of this.slots.values()) {
      if (s.rec.phase === undefined || s.idleSince >= 0) continue;
      if (!ref || s.level > ref.level) ref = s;
    }
    const cycles = Math.max(1, Math.round((len * rec.rpm) / 120));
    if (!ref || rec.phase === undefined) return rec.loopStart + this.rng.next() * len;
    const refCycle = 120 / ref.rec.rpm;
    // where the reference will be when the new loop starts
    const refPos = ref.pos + ref.target * ahead;
    const ph = (((refPos - ref.rec.loopStart - ref.rec.phase!) / refCycle) % 1 + 1) % 1;
    const cycle = 120 / rec.rpm;
    // the same phase in a random one of this loop's cycles
    let o = rec.phase + (ph + Math.floor(this.rng.next() * cycles)) * cycle;
    o = ((o % len) + len) % len;
    return rec.loopStart + o;
  }

  /** move every play head on to `now`, following the exponential glide of its playback rate */
  private advance(now: number): void {
    for (const s of this.slots.values()) {
      const dt = now - s.clock;
      if (dt <= 0) continue;
      s.clock = now;
      const k = Math.exp(-dt / TAU_RATE);
      const r0 = s.rate;
      const R = s.target;
      s.pos += R * dt + (r0 - R) * TAU_RATE * (1 - k);
      s.rate = R + (r0 - R) * k;
      const len = s.rec.loopEnd - s.rec.loopStart;
      if (s.pos >= s.rec.loopEnd) s.pos = s.rec.loopStart + ((s.pos - s.rec.loopStart) % len);
    }
  }

  private shot(file: string, t: number, gainDb: number, rate = 1): { src: AudioBufferSourceNode; gain: GainNode } | null {
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
    return { src, gain };
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
      } else if (!this.failed.has(st.engineId)) {
        const id = st.engineId;
        this.load(id).catch((e: unknown) => {
          // no bank, no engine sound: say so once and carry on
          console.warn(`ModCar engine sound: ${id}: ${e instanceof Error ? e.message : String(e)}`);
          this.failed.add(id);
          if (this.loading === id) this.loading = null;
        });
      }
    }
    this.advance(t);
    const bank = this.bank;
    const m = bank?.manifest;
    const tone = this.tone;
    // left out = the stock pipe; null = nothing fitted (open manifold)
    const ex = EXHAUSTS[st.exhaustId === undefined ? 'exh_stock' : st.exhaustId === null ? 'none' : st.exhaustId] ?? EXHAUSTS.exh_stock;

    // ---- cabin: closed cabin = muffled and boomy; open doors let the outside back in
    const open = Math.min(1, Math.max(0, st.doorsOpen));
    const dist = Math.max(1, st.distance ?? 3);
    if (st.inside) {
      set(this.extGain.gain, 0.05 + 0.55 * open, 0.08);
      set(this.intGain.gain, 0.45 * (1 - 0.55 * open), 0.08);
      set(this.cabinLp.frequency, 850 + 1500 * open, 0.08);
    } else {
      set(this.extGain.gain, Math.min(1.4, 3 / dist), 0.08);
      set(this.intGain.gain, 0, 0.08);
    }
    set(this.airLp.frequency, st.inside ? 18000 : 18000 / (1 + dist / 30), 0.1);
    // a passing car: everything it makes shifts together
    const doppler = st.inside ? 1 : Math.min(1.25, Math.max(0.8, 343 / (343 - Math.min(80, Math.max(-80, st.approach ?? 0)))));
    // ---- exhaust fitted
    set(this.exGain.gain, Math.pow(10, ex.gainDb / 20), 0.05);
    set(this.body.gain, ex.bodyDb + (tone.bodyDb ?? 0), 0.05);
    set(this.bite.gain, ex.biteDb, 0.05);
    set(this.presence.gain, tone.presenceDb, 0.05);
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
        const sh = this.shot('catch', t, tone.loudnessDb + tone.compression * c.db + 2);
        this.catchUntil = t + Math.min(1.1, c.duration * 0.55);
        // its tail is the idle the loops are now playing: hand over instead of doubling it
        sh?.gain.gain.setTargetAtTime(0, this.catchUntil - 0.15, 0.18);
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
    // at a steady speed the crossfade drifts a little either side (about +-2.5 % rpm, the weights
    // only) so a held rpm never leaves one short loop repeating on its own; near idle the pitch
    // lopes a little as a real idle does
    if (t >= this.wanderAt) {
      this.wanderTo = this.rng.range(-1, 1);
      this.lopeTo = this.rng.range(-1, 1);
      this.wanderAt = t + this.rng.range(1.5, 3.5);
    }
    this.wander += (this.wanderTo - this.wander) * (1 - Math.exp(-dt / 0.9));
    this.lope += (this.lopeTo - this.lope) * (1 - Math.exp(-dt / 0.35));
    const idleish = m ? smoothstep(m.idleRpm * 1.5, m.idleRpm * 1.05, rpm) * (1 - thr) : 0;
    const pitchRpm = rpm * (1 + 0.006 * idleish * this.lope);
    const weightRpm = pitchRpm * Math.exp(0.025 * this.wander);
    const want = new Map<string, { rec: LoopRec; gain: number; rate: number }>();
    if (bank && running) {
      // fade the loops in under the catch
      const inCatch = t < this.catchUntil ? Math.max(0.15, 1 - (this.catchUntil - t) / 0.6) : 1;
      const mix = loadMix(thr, load);
      // full load against overrun at this rpm: aligned too, so the same crossfade law
      const offNear = rpmWeights(bank.off, pitchRpm, weightRpm)[0]?.rec;
      const [wOff, wOn] = blendWeights(mix, offNear?.cohLoad ?? DEFAULT_COHERENCE * 0.5);
      // the rev limiter: crossfade into its own recording near the cut
      const lim = m!.oneshots['limiter'];
      // (the physics may cut at the redline or at the recorded limiter, whichever comes first)
      const cut = Math.min(m!.limiterRpm, m!.redlineRpm * 1.015);
      const limW = lim && !tone.governed ? smoothstep(cut - 160, cut - 10, rpm) * smoothstep(0.35, 0.8, thr) : 0;
      for (const [set2, w0] of [[bank.on, wOn], [bank.off, wOff]] as const) {
        if (w0 < 1e-3) continue;
        for (const { rec, w, rate } of rpmWeights(set2, pitchRpm, weightRpm)) {
          const gain = w * w0 * (1 - limW) * inCatch * loopGain(tone, rec, m!.idleRpm, m!.redlineRpm);
          if (gain > 1e-4) want.set(rec.file, { rec, gain, rate });
        }
      }
      if (lim && limW > 1e-3 && lim.loopStart !== undefined && lim.loopEnd !== undefined) {
        const rec: LoopRec = { file: lim.file, load: 1, rpm: lim.rpm ?? m!.limiterRpm, db: lim.db, loopStart: lim.loopStart, loopEnd: lim.loopEnd, duration: lim.duration };
        // pitched to the rpm the physics reports, so a cut below the recorded limiter does not jump
        const rate = Math.min(1.08, Math.max(0.92, rpm / rec.rpm));
        want.set(rec.file, { rec, gain: limW * inCatch * loopGain(tone, { ...rec, rpm: m!.redlineRpm }, m!.idleRpm, m!.redlineRpm), rate });
      }
    }
    // the starter turning the engine over (no firing yet); a rope needs no battery and turns it at
    // whatever speed the pull gives
    const battery = st.starterRate ?? 1;
    if (bank && st.cranking && !running && (tone.pullStart || battery >= 0.15)) {
      const c = m!.oneshots['crank'];
      if (c && c.loopStart !== undefined && c.loopEnd !== undefined) {
        const rate = tone.pullStart
          ? rpm > 30 && c.rpm ? Math.min(1.3, Math.max(0.6, rpm / c.rpm)) : 1
          : 0.55 + 0.45 * Math.min(1, Math.max(0.2, st.starterRate ?? 1));
        const rec: LoopRec = { file: c.file, load: 0, rpm: c.rpm ?? 200, db: c.db, loopStart: c.loopStart, loopEnd: c.loopEnd, duration: c.duration };
        want.set(c.file, { rec, gain: Math.pow(10, (tone.loudnessDb + tone.compression * c.db + 6) / 20), rate });
      }
    }
    // start the loudest new loops first, so the quieter ones align to them
    for (const wv of [...want.values()].sort((a, b) => b.gain - a.gain)) {
      wv.rate *= doppler;
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
      const hz = ((tone.whine.ratio * rpm) / 60) * doppler;
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
    // the whine a small turbo makes in the bay: about 1.5 kHz spooling up to 5-6 kHz on full boost
    const shaft = 1500 + 3800 * b + 0.12 * rpm;
    set(this.turboOsc.frequency, shaft, 0.03);
    set(this.turboBp.frequency, shaft * 1.02, 0.03);
    const lvl = Math.pow(10, tone.loudnessDb / 20);
    set(this.turboGain.gain, 0.011 * lvl * Math.pow(b, 1.6) * (0.5 + 0.5 * thr), 0.04);
    set(this.turboHiss.gain, 0.025 * lvl * b * (0.3 + 0.7 * thr), 0.05);
    // a lift: the pedal has come up a long way within the last ~0.15 s
    this.thrPeak = Math.max(thr, this.thrPeak - dt * 4);
    const lift = this.thrPeak - thr > 0.45;
    // blow-off on a sharp lift with boost up
    if (st.turbo && running && lift && this.boost > 0.35 && t > this.bovReadyAt) {
      this.oneShotBuffer(this.bovBufs[Math.floor(this.rng.next() * this.bovBufs.length)], t, 0.35 * this.boost * Math.pow(10, tone.loudnessDb / 20), this.pre);
      this.bovFired++;
      this.boost *= 0.4;
      this.bovReadyAt = t + 0.8;
    }
    // pops and crackle on lifting off from high revs
    if (running && m) {
      if (thr > 0.6) this.throttleHi = Math.min(1, this.throttleHi + dt * 1.5);
      if (lift && thr < 0.2 && rev > 0.45 && this.throttleHi > 0.3) {
        // a few big pops, or (loud pipes) a run of quick small crackles
        this.crackle = this.rng.next() < 0.3 * Math.min(1.5, ex.pops);
        this.popBudget = Math.round((this.crackle ? 5 + 9 * this.rng.next() : 2 + 7 * this.rng.next()) * tone.pops * ex.pops);
        this.nextPopAt = t + 0.04 + 0.08 * this.rng.next();
        this.throttleHi = 0;
        this.thrPeak = thr;
      }
      if (thr > 0.25) this.popBudget = 0;
      if (this.popBudget > 0 && t >= this.nextPopAt && rev > 0.2) {
        const big = !this.crackle && this.rng.next() < 0.18 * ex.pops;
        const buf = this.popBufs[Math.floor(this.rng.next() * this.popBufs.length)];
        const g = (big ? 0.55 : this.crackle ? 0.11 : 0.22) * (0.5 + 0.5 * this.rng.next()) * Math.pow(10, tone.loudnessDb / 20);
        this.oneShotBuffer(buf, t, g, this.exIn, (this.crackle ? 1.3 : 0.8) + 0.5 * this.rng.next());
        this.popsFired++;
        this.popBudget--;
        this.nextPopAt = t + (this.crackle ? 0.015 + 0.04 * this.rng.next() : 0.05 + 0.22 * this.rng.next());
      }
    } else {
      this.popBudget = 0;
    }
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
    // (a rope: no motor to hear)
    const turning = st.cranking && battery >= 0.15 && !tone.pullStart;
    set(this.starterGain.gain, turning ? Math.pow(10, (tone.starter.gainDb + tone.loudnessDb) / 20) * (0.5 + 0.5 * sr) : 0, turning ? 0.02 : 0.06);
    // a flat battery: the solenoid clicks and nothing turns
    if (st.cranking && battery < 0.15 && !running && !tone.pullStart) {
      if (this.clickNext < t) this.clickNext = t;
      while (this.clickNext < t + 0.1) {
        this.oneShotBuffer(this.clickBuf, this.clickNext, 0.3, this.pre, 0.95 + 0.1 * this.rng.next());
        this.clickNext += 0.33 + 0.12 * this.rng.next();
      }
    }

    // a worn engine: firings that miss (a dip of one firing interval), now and then a pop after one
    const mis = running && m ? Math.min(1, Math.max(0, st.misfire ?? 0)) : 0;
    if (mis > 0) {
      const slotDur = 120 / (Math.max(150, rpm) * cyl);
      if (this.misNext < t) this.misNext = t + 0.005;
      while (this.misNext < t + 0.08) {
        if (this.rng.next() < mis) {
          const at = this.misNext;
          this.misVca.gain.setTargetAtTime(0.22, at, slotDur * 0.12);
          this.misVca.gain.setTargetAtTime(1, at + slotDur * 0.85, slotDur * 0.25);
          if (this.rng.next() < 0.12 * mis) this.oneShotBuffer(this.popBufs[0], at + slotDur * 1.2, 0.09 * Math.pow(10, tone.loudnessDb / 20), this.exIn, 1.4);
        }
        this.misNext += slotDur;
      }
    }
    // rod knock: a deep knock every turn of the crank, louder under load
    const kn = running && m ? Math.min(1, Math.max(0, st.knock ?? 0)) : 0;
    if (kn > 0) {
      const turn = 60 / Math.max(150, rpm);
      if (this.knockNext < t) this.knockNext = t + 0.005;
      while (this.knockNext < t + 0.08) {
        const kg = 0.16 * kn * (0.45 + 0.55 * load) * (0.8 + 0.4 * this.rng.next()) * Math.pow(10, tone.loudnessDb / 20);
        this.oneShotBuffer(this.knockBufs[Math.floor(this.rng.next() * this.knockBufs.length)], this.knockNext, kg, this.pre, 0.9 + 0.2 * this.rng.next());
        this.knockNext += turn;
      }
    }
    // steam, wavering as it boils
    const steam = Math.min(1, Math.max(0, st.steam ?? 0));
    set(this.steamGain.gain, steam > 0 ? 0.016 * steam * (0.7 + 0.6 * this.rng.next()) * Math.pow(10, tone.loudnessDb / 20) : 0, 0.12);
  }

  /** stop everything and release the nodes */
  dispose(): void {
    this.stopAll();
    for (const n of this.running) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
      n.disconnect();
    }
    this.running.length = 0;
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
      popsFired: this.popsFired,
      bovFired: this.bovFired,
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

/** rod knock: a deep, dull metallic knock from inside the block */
export function rodKnockSample(sr: number, seed: number): Float32Array {
  const rng = new Rng(seed);
  const x = new Float32Array(Math.floor(0.06 * sr));
  burst(x, sr, 0, 0.004, 0.6, rng, { attack: 0.0003, decay: 0.0012, filter: [['bandpass', 1400, 1.2]] });
  for (const [f, g, d] of [[520, 1, 0.012], [890, 0.7, 0.009], [1460, 0.45, 0.006]] as const) {
    const fj = f * (1 + 0.04 * rng.gauss());
    for (let i = 0; i < x.length; i++) x[i] += g * Math.sin((2 * Math.PI * fj * i) / sr) * Math.exp(-i / (d * sr));
  }
  return normalize(edges(x, sr, 0.2, 6), 0.9);
}

/** the starter solenoid on a flat battery: a hard click and nothing else */
export function solenoidSample(sr: number, seed: number): Float32Array {
  const rng = new Rng(seed);
  const x = new Float32Array(Math.floor(0.08 * sr));
  burst(x, sr, 0, 0.003, 1, rng, { attack: 0.0001, decay: 0.0007, filter: [['highpass', 1200]] });
  for (const [f, g, d] of [[1750, 1, 0.01], [3100, 0.6, 0.006], [640, 0.5, 0.015]] as const) {
    for (let i = 0; i < x.length; i++) x[i] += 0.4 * g * Math.sin((2 * Math.PI * f * i) / sr) * Math.exp(-i / (d * sr));
  }
  return normalize(edges(x, sr, 0.1, 6), 0.9);
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
