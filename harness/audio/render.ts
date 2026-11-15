/**
 * Offline render harness page for the ModCar sounds (loaded by harness/audio/modcar_render.mjs in
 * headless Chrome). Everything renders through OfflineAudioContext: nothing reaches a speaker.
 * The engine voice is stepped at 100 Hz with suspend/resume, exactly as a game frame loop would
 * call update().
 */
import { EngineVoice, bankConfig, loadBank, type EngineAudioState, type BankManifest } from '../../src/game/modcar/engineAudio';
import { Foley, type FoleyLoop, type FoleyOpts, type FoleyShot } from '../../src/game/modcar/foley';

type Key = [number, Partial<EngineAudioState>];

// the page lives under /harness/audio/: point at the banks from the site root
bankConfig.baseUrl = '/audio/modcar/engines/';

export interface EngineRenderSpec {
  engineId: string;
  exhaustId?: string | null;
  turbo?: boolean;
  inside?: boolean;
  doorsOpen?: number;
  sequence: 'tour' | 'idle' | 'sweep';
  sampleRate?: number;
}

/** keyframes for a sequence, from the bank's idle and redline */
function sequence(name: EngineRenderSpec['sequence'], m: BankManifest): { keys: Key[]; seconds: number } {
  const I = m.idleRpm;
  const R = m.redlineRpm;
  const crank = m.oneshots['crank']?.rpm ?? 200;
  const run = { running: true, cranking: false };
  if (name === 'idle') {
    return { seconds: 6, keys: [[0, { ...run, rpm: I, throttle: 0, load: 0 }], [6, { rpm: I }]] };
  }
  if (name === 'sweep') {
    // a slow full-load sweep idle -> redline, then a slow overrun back
    return {
      seconds: 16,
      keys: [
        [0, { ...run, rpm: I, throttle: 1, load: 1 }],
        [8, { rpm: R, throttle: 1, load: 1 }],
        [8.05, { throttle: 0, load: 0 }],
        [16, { rpm: I, throttle: 0, load: 0 }],
      ],
    };
  }
  // the tour: crank, catch, idle, a blip, pull through first, a shift, second, lift off, switch off
  return {
    seconds: 22,
    keys: [
      [0, { running: false, cranking: true, rpm: crank, throttle: 0, load: 0 }],
      [1.3, { running: true, cranking: false, rpm: I * 1.05 }],
      [1.6, { rpm: I * 1.35 }],
      [2.4, { rpm: I }],
      [4.0, { rpm: I, throttle: 0, load: 0 }],
      [4.05, { throttle: 1, load: 0.15 }],
      [4.4, { rpm: I + (0.7 * R - I) * 0.6 }],
      [4.9, { rpm: 0.7 * R, throttle: 1 }],
      [4.95, { throttle: 0, load: 0 }],
      [5.5, { rpm: I + (0.7 * R - I) * 0.35 }],
      [6.2, { rpm: I }],
      [7.0, { rpm: I, throttle: 0, load: 0 }],
      [7.1, { rpm: 1.25 * I, throttle: 1, load: 1 }],
      [9.0, { rpm: 1.25 * I + (R - 1.25 * I) * 0.55 }],
      [10.6, { rpm: R }],
      [10.75, { rpm: R + 25 }],
      [10.9, { rpm: R - 60 }],
      [11.1, { rpm: R + 25, throttle: 1, load: 1 }],
      [11.15, { throttle: 0, load: 0.1 }],
      [11.45, { rpm: 0.62 * R, throttle: 0 }],
      [11.5, { throttle: 1, load: 1 }],
      [14.4, { rpm: 0.92 * R, throttle: 1, load: 1 }],
      [14.45, { throttle: 0, load: 0 }],
      [16.0, { rpm: 0.6 * R }],
      [18.9, { rpm: 1.1 * I }],
      [19.5, { rpm: I }],
      [20.0, { rpm: I, running: true }],
      [20.02, { running: false, rpm: I * 0.6 }],
      [21.0, { rpm: 0 }],
      [22, { rpm: 0 }],
    ],
  };
}

function stateAt(keys: Key[], t: number, base: EngineAudioState): EngineAudioState {
  const s: EngineAudioState = { ...base };
  // booleans and other steps: the last key at or before t
  for (const [kt, v] of keys) {
    if (kt > t) break;
    Object.assign(s, Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x !== 'number')));
  }
  // numbers: linear between the keys that carry them
  for (const field of ['rpm', 'throttle', 'load'] as const) {
    let prev: [number, number] | null = null;
    let next: [number, number] | null = null;
    for (const [kt, v] of keys) {
      const x = v[field];
      if (typeof x !== 'number') continue;
      if (kt <= t) prev = [kt, x];
      else if (!next) next = [kt, x];
    }
    if (prev && next) s[field] = prev[1] + ((next[1] - prev[1]) * (t - prev[0])) / (next[0] - prev[0]);
    else if (prev) s[field] = prev[1];
    else if (next) s[field] = next[1];
  }
  return s;
}

async function renderEngine(spec: EngineRenderSpec): Promise<{ pcm: string; sampleRate: number; debug: unknown[] }> {
  const sr = spec.sampleRate ?? 48000;
  // the bank first, on a throwaway context, to get idle / redline for the keyframes
  const probe = new OfflineAudioContext(1, 128, sr);
  const m = (await loadBank(probe, spec.engineId)).manifest;
  const { keys, seconds } = sequence(spec.sequence, m);
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sr), sr);
  const voice = new EngineVoice(ctx, ctx.destination);
  await voice.load(spec.engineId);
  const base: EngineAudioState = {
    engineId: spec.engineId,
    exhaustId: spec.exhaustId === undefined ? 'exh_stock' : spec.exhaustId,
    turbo: spec.turbo ?? false,
    rpm: 0,
    load: 0,
    throttle: 0,
    running: false,
    cranking: false,
    inside: spec.inside ?? false,
    doorsOpen: spec.doorsOpen ?? 0,
  };
  const debug: unknown[] = [];
  const step = 0.01;
  for (let t = 0; t < seconds - 1e-6; t += step) {
    const tt = Math.round(t * 1000) / 1000;
    void ctx.suspend(tt).then(() => {
      voice.update(stateAt(keys, tt, base));
      if (Math.round(tt * 100) % 50 === 0) debug.push({ t: tt, ...voice.debug() });
      void ctx.resume();
    });
  }
  const out = await ctx.startRendering();
  return { pcm: toBase64(out.getChannelData(0)), sampleRate: sr, debug };
}

export interface FoleyRenderSpec {
  kind: FoleyShot | FoleyLoop;
  opts?: FoleyOpts;
  /** loops: seconds to hold */
  hold?: number;
}

async function renderFoley(spec: FoleyRenderSpec, sampleRate = 48000): Promise<{ pcm: string; sampleRate: number }> {
  const isLoop = ['ratchet', 'spray', 'sponge', 'pour', 'horn_beep', 'horn_air'].includes(spec.kind);
  const seconds = isLoop ? (spec.hold ?? 2.5) + 0.6 : spec.kind === 'horn_trumpet' ? 2.2 : 1.2;
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
  const f = new Foley(ctx, ctx.destination);
  if (isLoop) {
    void ctx.suspend(0.05).then(() => {
      f.start(spec.kind as FoleyLoop, spec.opts);
      void ctx.resume();
    });
    void ctx.suspend(Math.round(((spec.hold ?? 2.5) + 0.05) * 1000) / 1000).then(() => {
      f.stop(spec.kind as FoleyLoop);
      void ctx.resume();
    });
  } else {
    void ctx.suspend(0.05).then(() => {
      f.play(spec.kind as FoleyShot, spec.opts);
      void ctx.resume();
    });
  }
  const out = await ctx.startRendering();
  return { pcm: toBase64(out.getChannelData(0)), sampleRate };
}

/**
 * Every loop of a bank, decoded by this browser at sampleRate, healed, then played looping for a
 * few turns: the largest jump in the second difference within 3 samples of each wrap, against the
 * 99.9th percentile of the same quantity everywhere else (a click shows up as a ratio well above 1).
 */
async function checkLoops(engineId: string, sampleRate = 48000): Promise<Array<{ file: string; ratio: number; turns: number; seconds: number }>> {
  const ctx0 = new OfflineAudioContext(1, 128, sampleRate);
  const bank = await loadBank(ctx0, engineId);
  const recs = [...bank.manifest.loops, ...Object.values(bank.manifest.oneshots).filter((s) => s.loopStart !== undefined)];
  const out: Array<{ file: string; ratio: number; turns: number; seconds: number }> = [];
  for (const r of recs) {
    const buf = bank.buffers.get(r.file)!;
    const L = (r.loopEnd! - r.loopStart!) * sampleRate;
    const turns = 3;
    const n = Math.ceil(L * turns + 64);
    const ctx = new OfflineAudioContext(1, n, sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = r.loopStart!;
    src.loopEnd = r.loopEnd!;
    src.connect(ctx.destination);
    src.start(0, r.loopStart!);
    const y = (await ctx.startRendering()).getChannelData(0);
    const d2 = new Float32Array(y.length);
    for (let i = 2; i < y.length; i++) d2[i] = Math.abs(y[i] - 2 * y[i - 1] + y[i - 2]);
    const sorted = Float32Array.from(d2.subarray(8)).sort();
    const p999 = sorted[Math.floor(sorted.length * 0.999)] || 1e-9;
    let worst = 0;
    for (let k = 1; k < turns; k++) {
      const w = Math.round(L * k);
      for (let i = Math.max(2, w - 3); i <= Math.min(y.length - 1, w + 3); i++) worst = Math.max(worst, d2[i]);
    }
    out.push({ file: r.file, ratio: worst / p999, turns, seconds: L / sampleRate });
  }
  return out;
}

function toBase64(x: Float32Array): string {
  // 16-bit little-endian PCM, clipped
  const b = new Uint8Array(x.length * 2);
  for (let i = 0; i < x.length; i++) {
    const v = Math.max(-1, Math.min(1, x[i]));
    const s = Math.round(v * 32767);
    b[2 * i] = s & 255;
    b[2 * i + 1] = (s >> 8) & 255;
  }
  let str = '';
  const chunk = 0x8000;
  for (let i = 0; i < b.length; i += chunk) str += String.fromCharCode(...b.subarray(i, i + chunk));
  return btoa(str);
}

declare global {
  interface Window {
    __modcarAudio?: {
      ready: boolean;
      renderEngine: typeof renderEngine;
      renderFoley: typeof renderFoley;
      checkLoops: typeof checkLoops;
    };
  }
}

window.__modcarAudio = { ready: true, renderEngine, renderFoley, checkLoops };
