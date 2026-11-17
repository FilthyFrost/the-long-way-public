/**
 * Offline render harness page for the ModCar sounds (loaded by harness/audio/modcar_render.mjs in
 * headless Chrome). Everything renders through OfflineAudioContext: nothing reaches a speaker.
 * The engine voice is stepped at 100 Hz with suspend/resume, exactly as a game frame loop would
 * call update(); a scrub is driven at 60 frames a second the same way (renderScrub).
 */
import { EngineVoice, bankConfig, engineTone, loadBank, type EngineAudioState, type BankManifest } from '../../src/game/modcar/engineAudio';
import { FOLEY_LOOPS, Foley, loopPlaybackRate, recipe, type FoleyLoop, type FoleyOpts, type FoleyShot, type ScrapeSurface } from '../../src/game/modcar/foley';
import { Rng } from '../../src/game/modcar/synth';

type Key = [number, Partial<EngineAudioState>];

// the page lives under /harness/audio/: point at the banks from the site root
bankConfig.baseUrl = '/audio/modcar/engines/';

export interface EngineRenderSpec {
  engineId: string;
  exhaustId?: string | null;
  turbo?: boolean;
  inside?: boolean;
  doorsOpen?: number;
  sequence: 'tour' | 'idle' | 'sweep' | 'passby' | 'flat' | 'genset' | 'dry';
  sampleRate?: number;
  /** held for the whole render (misfire, knock, steam, starterRate ...) */
  extra?: Partial<EngineAudioState>;
  /** tone fields to override for this render only (an A/B check, e.g. { pullStart: false }) */
  tone?: Record<string, unknown>;
}

/** the generator's governor hunting round its set speed: a slow wobble and a little scatter */
function hunt(t: number, base: number, amp = 70): number {
  return base + amp * Math.sin((2 * Math.PI * t) / 1.45) + 0.35 * amp * Math.sin((2 * Math.PI * t) / 0.53 + 1.3);
}

/** keyframes for a sequence, from the bank's idle and redline */
function sequence(name: EngineRenderSpec['sequence'], m: BankManifest): { keys: Key[]; seconds: number } {
  const I = m.idleRpm;
  const R = m.redlineRpm;
  const crank = m.oneshots['crank']?.rpm ?? 200;
  const run = { running: true, cranking: false };
  if (name === 'genset' || name === 'dry') {
    // the generator, as the game drives it (outside, a few metres off): a pull that fails, a pull that
    // catches, running light with the governor hunting, the recycler's load (the speed droops and
    // recovers), light again, switched off; 'dry': it runs out of fuel and dies spluttering
    const keys: Key[] = [
      [0, { running: false, cranking: false, rpm: 0, throttle: 0.15, load: 0.15, inside: false, doorsOpen: 1, distance: 4 }],
      // (each pull at the bank's own crank speed: the crank loop plays at its own pitch)
      [0.29, { rpm: 0 }], [0.3, { cranking: true, rpm: crank }], [0.9, { rpm: crank }],
      [0.92, { cranking: false }], [1.25, { rpm: 0 }],
      [1.89, { rpm: 0 }], [1.9, { cranking: true, rpm: crank }], [2.5, { rpm: crank }],
      [2.52, { running: true, cranking: false }], [2.62, { rpm: 900 }], [3.2, { rpm: 3150 }], [4.0, { rpm: I }],
    ];
    if (name === 'dry') {
      for (let t = 4.1; t < 7.0; t += 0.1) keys.push([t, { rpm: hunt(t, I) }]);
      // the last half second of fuel: misses, the speed sags, then it dies (the foley gen_cough goes with it)
      keys.push([7.0, { rpm: I, misfire: 0, throttle: 0.15, load: 0.15 }], [7.8, { rpm: I - 260, misfire: 0.75 }], [7.82, { running: false, stalled: false }], [9.8, { rpm: 0, misfire: 0 }]);
      return { seconds: 10.5, keys };
    }
    for (let t = 4.1; t < 8.0; t += 0.1) keys.push([t, { rpm: hunt(t, I) }]);
    // (load and throttle are steps: hold them up to the change)
    keys.push([7.99, { load: 0.15, throttle: 0.15 }], [8.0, { rpm: I, load: 0.6, throttle: 0.6 }], [8.25, { rpm: I - 140 }], [8.9, { rpm: I - 40 }]);
    for (let t = 9.0; t < 12.0; t += 0.1) keys.push([t, { rpm: hunt(t, I - 40, 95) }]);
    keys.push([11.99, { load: 0.6, throttle: 0.6 }], [12.0, { rpm: I - 40, load: 0.15, throttle: 0.15 }], [12.2, { rpm: I + 90 }], [12.8, { rpm: I }]);
    for (let t = 12.9; t < 15.0; t += 0.1) keys.push([t, { rpm: hunt(t, I) }]);
    keys.push([15.0, { rpm: I, running: true }], [15.02, { running: false, stalled: false }], [17.3, { rpm: 0 }], [18, { rpm: 0 }]);
    return { seconds: 18, keys };
  }
  if (name === 'idle') {
    return { seconds: 6, keys: [[0, { ...run, rpm: I, throttle: 0, load: 0 }], [6, { rpm: I }]] };
  }
  if (name === 'flat') {
    // the key held on a flat battery: clicks, then a good battery cranks and catches
    return { seconds: 5, keys: [[0, { running: false, cranking: true, rpm: 0, throttle: 0, load: 0, starterRate: 0.05 }], [2.5, { starterRate: 1, rpm: crank }], [3.6, { running: true, cranking: false, rpm: I * 1.3 }], [4.4, { rpm: I }], [5, { rpm: I }]] };
  }
  if (name === 'passby') {
    // 20 m/s along a line 3 m from the listener, at a steady 55 % of the redline and half throttle
    const keys: Key[] = [];
    for (let t = 0; t <= 8.0001; t += 0.05) {
      const x = -80 + 20 * t;
      const d = Math.hypot(x, 3);
      keys.push([t, { ...run, rpm: I + 0.55 * (R - I), throttle: 0.5, load: 0.5, inside: false, distance: d, approach: (-20 * x) / d }]);
    }
    return { seconds: 8, keys };
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
  for (const field of ['rpm', 'throttle', 'load', 'distance', 'approach', 'starterRate', 'misfire'] as const) {
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

async function renderEngine(spec: EngineRenderSpec): Promise<{ pcm: string; sampleRate: number; debug: unknown[]; idleRpm: number; redlineRpm: number }> {
  const sr = spec.sampleRate ?? 48000;
  // the bank first, on a throwaway context, to get idle / redline for the keyframes
  const probe = new OfflineAudioContext(1, 128, sr);
  const m = (await loadBank(probe, spec.engineId)).manifest;
  const { keys, seconds } = sequence(spec.sequence, m);
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sr), sr);
  const voice = new EngineVoice(ctx, ctx.destination);
  await voice.load(spec.engineId);
  // an A/B check: some tone fields changed for this render only
  const tone = engineTone(spec.engineId) as unknown as Record<string, unknown>;
  const saved = Object.fromEntries(Object.keys(spec.tone ?? {}).map((k) => [k, tone[k]]));
  Object.assign(tone, spec.tone ?? {});
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
    ...spec.extra,
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
  const out = await ctx.startRendering().finally(() => Object.assign(tone, saved));
  return { pcm: toBase64(out.getChannelData(0)), sampleRate: sr, debug, idleRpm: m.idleRpm, redlineRpm: m.redlineRpm };
}

export interface FoleyRenderSpec {
  kind: FoleyShot | FoleyLoop;
  opts?: FoleyOpts;
  /** loops: seconds to hold */
  hold?: number;
}

async function renderFoley(spec: FoleyRenderSpec, sampleRate = 48000): Promise<{ pcm: string; sampleRate: number }> {
  const isLoop = (FOLEY_LOOPS as readonly string[]).includes(spec.kind);
  // (a shot gets at least 1.2 s, more if it is longer than that)
  const natural = isLoop ? 0 : recipe(spec.kind, spec.opts)(sampleRate, new Rng(1)).length / sampleRate;
  const seconds = isLoop ? (spec.hold ?? 2.5) + 0.6 : Math.max(spec.kind === 'horn_trumpet' ? 2.2 : 1.2, natural + 0.3);
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
/** one thing the workshop scene does at a time (seconds): a foley shot, a loop started / stopped / re-levelled */
interface SceneEvent {
  t: number;
  play?: FoleyShot;
  start?: FoleyLoop;
  stop?: FoleyLoop;
  opts?: FoleyOpts;
}

/**
 * The workshop as the game will play it, generator and foley together (the mix check): two pulls on
 * the rope (the second catches), the power and the lamps on, the recycler running, three things fed
 * in (the generator taking the load), the tally counting, a craft (tools out, three blows, the ding),
 * a door slammed for reference, then the generator running dry and the power going off, a dead
 * switch. The generator stands outside (6 m); the player is at the machines.
 */
async function renderWorkshop(sampleRate = 48000): Promise<{ pcm: string; sampleRate: number; marks: Record<string, [number, number]> }> {
  const seconds = 21.5;
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
  const voice = new EngineVoice(ctx, ctx.destination);
  const foley = new Foley(ctx, ctx.destination);
  const m = (await loadBank(ctx, 'gen_d1')).manifest;
  await voice.load('gen_d1');
  const I = m.idleRpm;
  const crank = m.oneshots['crank']?.rpm ?? 500;
  const keys: Key[] = [
    [0, { running: false, cranking: false, rpm: 0, throttle: 0.15, load: 0.15 }],
    [0.19, { rpm: 0 }], [0.2, { cranking: true, rpm: crank }], [0.8, { rpm: crank }], [0.82, { cranking: false }], [1.1, { rpm: 0 }],
    [1.79, { rpm: 0 }], [1.8, { cranking: true, rpm: crank }], [2.4, { rpm: crank }],
    [2.42, { running: true, cranking: false }], [2.52, { rpm: 900 }], [3.1, { rpm: 3150 }], [3.9, { rpm: I }],
  ];
  const load = (a: number, b: number): void => {
    keys.push([a - 0.01, { load: 0.15, throttle: 0.15 }], [a, { load: 0.6, throttle: 0.6 }], [a + 0.25, { rpm: I - 140 }], [a + 0.9, { rpm: I - 40 }]);
    for (let t = a + 1.0; t < b; t += 0.1) keys.push([t, { rpm: hunt(t, I - 40, 95) }]);
    keys.push([b - 0.01, { load: 0.6, throttle: 0.6 }], [b, { load: 0.15, throttle: 0.15, rpm: I - 40 }], [b + 0.2, { rpm: I + 90 }], [b + 0.8, { rpm: I }]);
  };
  for (let t = 4.0; t < 7.0; t += 0.1) keys.push([t, { rpm: hunt(t, I) }]);
  load(7.0, 11.0);
  for (let t = 11.9; t < 17.0; t += 0.1) keys.push([t, { rpm: hunt(t, I) }]);
  // running dry: the last half second misses, then it dies (and runs down for about 2.7 s)
  keys.push([17.0, { rpm: I, misfire: 0 }], [17.5, { rpm: I - 220, misfire: 0.7 }], [17.52, { running: false, stalled: false }], [19.6, { rpm: 0, misfire: 0 }], [21.5, { rpm: 0 }]);
  const ev: SceneEvent[] = [
    { t: 0.2, play: 'cord_pull' }, { t: 1.8, play: 'cord_pull' },
    { t: 4.2, play: 'gen_switch' }, { t: 4.25, play: 'power_on' }, { t: 5.2, start: 'lamp_buzz' }, { t: 5.3, start: 'recycler_run' },
    { t: 7.0, play: 'shred', opts: { grind: 'metal' } }, { t: 7.0, start: 'recycler_grind', opts: { gain: 1 } },
    { t: 8.3, play: 'shred', opts: { grind: 'plastic' } }, { t: 9.5, play: 'shred', opts: { grind: 'wood' } },
    { t: 10.6, start: 'recycler_grind', opts: { gain: 0.5 } }, { t: 11.0, stop: 'recycler_grind' },
    { t: 11.2, play: 'tally' }, { t: 11.45, play: 'tally' }, { t: 11.7, play: 'tally' }, { t: 11.95, play: 'tally' },
    { t: 12.6, play: 'craft_start' }, { t: 13.4, play: 'hammer_swing' }, { t: 13.62, play: 'hammer_hit', opts: { grind: 'metal' } },
    { t: 14.2, play: 'hammer_swing' }, { t: 14.42, play: 'hammer_hit', opts: { grind: 'metal' } },
    { t: 15.0, play: 'hammer_swing' }, { t: 15.22, play: 'hammer_hit', opts: { grind: 'metal' } }, { t: 15.75, play: 'craft_done' },
    { t: 16.65, play: 'door_close', opts: { material: 'metal' } },
    { t: 17.15, play: 'gen_cough' }, { t: 18.0, play: 'power_off' }, { t: 18.0, stop: 'recycler_run' }, { t: 18.0, stop: 'lamp_buzz' },
    { t: 21.0, play: 'no_power' },
  ];
  // render the foley ahead (as warm() does in the game)
  foley.warm(['cord_pull', 'gen_switch', 'power_on', 'power_off', 'tally', 'craft_start', 'hammer_swing', 'craft_done', 'gen_cough', 'no_power', 'lamp_buzz', 'recycler_run', 'recycler_grind']);
  const base: EngineAudioState = { engineId: 'gen_d1', rpm: 0, load: 0.15, throttle: 0.15, running: false, cranking: false, inside: false, doorsOpen: 1, distance: 6 };
  let next = 0;
  const step = 0.01;
  for (let t = 0; t < seconds - 1e-6; t += step) {
    const tt = Math.round(t * 1000) / 1000;
    void ctx.suspend(tt).then(() => {
      voice.update(stateAt(keys, tt, base));
      // everything due before the next step: shots at their exact time, loops now
      while (next < ev.length && ev[next].t < tt + step) {
        const e = ev[next++];
        if (e.play) foley.play(e.play, e.opts, e.t);
        if (e.start) foley.start(e.start, e.opts);
        if (e.stop) foley.stop(e.stop);
      }
      void ctx.resume();
    });
  }
  const out = await ctx.startRendering();
  voice.dispose();
  const marks: Record<string, [number, number]> = {
    pulls: [0.2, 2.4], power_on: [4.2, 5.4], lamps_and_run: [5.6, 6.9], grinding: [7.0, 11.0], tally: [11.15, 12.2],
    craft_start: [12.6, 13.3], hammer: [13.4, 15.7], ding: [15.75, 16.6], door: [16.65, 17.1], running_dry: [17.15, 18.0], power_off: [18.0, 19.0], rundown: [17.6, 20.2], quiet: [20.45, 20.95], dead_switch: [21.0, 21.2],
  };
  return { pcm: toBase64(out.getChannelData(0)), sampleRate, marks };
}

/** how a scrub is driven in renderScrub: frame by frame, 60 a second, as the game does it */
export interface ScrubRenderSpec {
  /** the scrubbing loops, a session each, one after another */
  kinds: FoleyLoop[];
  /** seconds of each session (the tool on the surface) */
  seconds?: number;
  /**
   * 'stroke': a hand going back and forth, now and then holding the tool still (gain 0), the gain and
   * the rate following its speed; 'steady': gain 1, rate 1; 'step': gain 1, rate 0.7 for the first
   * half and 1.6 for the second; 'jitter': gain 1, a new rate anywhere in 0.7..1.6 every frame (the
   * worst a twitchy mouse can do)
   */
  motion?: 'stroke' | 'steady' | 'step' | 'jitter';
  /** 'steady': the rate held (default 1) */
  rate?: number;
  /** the one-shots too: the blade catching as each stroke begins, flakes falling, the chime as the part comes clean, the ping and the fanfare at the end */
  shots?: boolean;
}

/** the blade's catch for each scrub, and the chime when its part is done */
const SCRUB_CATCH: Partial<Record<FoleyLoop, ScrapeSurface>> = { scrape_glass: 'glass', scrape_metal: 'metal', scrape_rust: 'rust', scrape_mud: 'mud', brush_wire: 'rust' };
const SCRUB_DONE: Record<string, FoleyShot> = { scrape_glass: 'clean_ding', scrape_metal: 'clean_ding', scrape_rust: 'clean_rust_done', scrape_mud: 'clean_ding', brush_wire: 'clean_rust_done', sponge_scrub: 'clean_ding' };

/**
 * Scrubbing as the game will play it: each loop started on contact and driven every frame with a
 * gain and a rate from the tool's speed (start() called each frame, as ModGame does with a gain),
 * stopped on release; with shots, the catch as each stroke begins, flakes falling off rust and mud,
 * the part's chime, then the dirt highlighted and the whole vehicle done. Marks: each session, the
 * quiet after it, and for 'step' the slow and fast halves.
 */
async function renderScrub(spec: ScrubRenderSpec, sampleRate = 48000): Promise<{ pcm: string; sampleRate: number; marks: Record<string, [number, number]>; strokes: number; rates: Record<string, [number, number]>; loopSeconds: Record<string, number> }> {
  const seconds = spec.seconds ?? 3;
  const motion = spec.motion ?? 'stroke';
  const after = spec.shots ? 1.6 : 0.8;
  const total = 0.2 + spec.kinds.length * (seconds + after) + (spec.shots ? 3.4 : 0.2);
  const ctx = new OfflineAudioContext(1, Math.ceil(total * sampleRate), sampleRate);
  const f = new Foley(ctx, ctx.destination);
  // rendered ahead, as the game should when a cleaning tool is taken up
  f.warm(spec.kinds);
  for (const surface of ['glass', 'metal', 'rust', 'mud'] as const) f.warm(['scrape_start'], { surface });
  f.warm(['flake_drop', 'clean_ding', 'clean_rust_done', 'clean_car_done', 'highlight_ping', 'tool_worn']);
  const rng = new Rng(0x5c7b);
  const marks: Record<string, [number, number]> = {};
  // the playback rates a slow (0.7) and a fast (1.6) stroke give each loop
  const rates = Object.fromEntries(spec.kinds.map((k) => [k, [loopPlaybackRate(k, 0.7), loopPlaybackRate(k, 1.6)]])) as Record<string, [number, number]>;
  // and how long a turn of each is (to measure the same sound at two rates: one whole turn at each)
  const loopSeconds = Object.fromEntries(spec.kinds.map((k) => [k, recipe(k)(sampleRate, new Rng(1)).length / sampleRate]));
  // what to do each frame, worked out ahead: [time, action]
  const plan: Array<[number, () => void]> = [];
  let strokes = 0;
  let t0 = 0.2;
  for (const kind of spec.kinds) {
    const end = t0 + seconds;
    marks[kind] = [t0, end];
    if (motion === 'step') {
      marks[`${kind}_slow`] = [t0 + 0.1 * seconds, t0 + 0.45 * seconds];
      marks[`${kind}_fast`] = [t0 + 0.55 * seconds, t0 + 0.9 * seconds];
    }
    // (quiet once the loop is let go, and its chime has rung out)
    marks[`${kind}_after`] = [end + (spec.shots ? 1.25 : 0.5), end + after - 0.05];
    // the hand: strokes of 0.35-0.6 s, the tool sometimes held still between them
    const moves: Array<[number, number]> = [];
    for (let t = t0; t < end; ) {
      const d = rng.range(0.35, 0.6);
      moves.push([t, Math.min(end, t + d)]);
      t += d + (rng.next() < 0.3 ? rng.range(0.15, 0.4) : 0);
    }
    const speed = (t: number): number => {
      for (const [a, b] of moves) if (t >= a && t < b) return Math.pow(Math.sin((Math.PI * (t - a)) / (b - a)), 0.8);
      return 0;
    };
    let wasStill = true;
    let flakeAt = t0 + rng.range(0.2, 0.5);
    for (let k = 0; t0 + k / 60 < end; k++) {
      const t = t0 + k / 60;
      const v = motion === 'stroke' ? speed(t) : 1;
      const rate = motion === 'stroke' ? 0.7 + 0.9 * v : motion === 'step' ? (t < t0 + seconds / 2 ? 0.7 : 1.6) : motion === 'jitter' ? rng.range(0.7, 1.6) : (spec.rate ?? 1);
      const catchNow = spec.shots && SCRUB_CATCH[kind] !== undefined && wasStill && v > 0.05;
      if (v > 0.05 && wasStill) strokes++;
      wasStill = v <= 0.05;
      const flake = spec.shots && (kind === 'scrape_rust' || kind === 'scrape_mud') && v > 0.3 && t >= flakeAt;
      if (flake) flakeAt = t + rng.range(0.25, 0.6);
      plan.push([t, () => {
        f.start(kind, { gain: v, rate });
        if (catchNow) f.play('scrape_start', { surface: SCRUB_CATCH[kind] }, t);
        if (flake) f.play('flake_drop', {}, t);
      }]);
    }
    plan.push([end, () => f.stop(kind)]);
    if (spec.shots) plan.push([end + 0.12, () => f.play(SCRUB_DONE[kind], {}, end + 0.12)]);
    t0 = end + after;
  }
  if (spec.shots) {
    marks.ping = [t0 + 0.2, t0 + 0.85];
    marks.fanfare = [t0 + 1.0, t0 + 3.2];
    plan.push([t0 + 0.2, () => f.play('highlight_ping', {}, t0 + 0.2)]);
    plan.push([t0 + 1.0, () => f.play('clean_car_done', {}, t0 + 1.0)]);
  }
  // one suspend per render quantum that has something to do
  const q = 128 / sampleRate;
  const due = new Map<number, Array<() => void>>();
  for (const [t, fn] of plan) {
    const k = Math.floor(t / q);
    const list = due.get(k) ?? [];
    list.push(fn);
    due.set(k, list);
  }
  for (const [k, list] of due) {
    // (a quarter into the quantum: however the browser rounds a suspend time, two never land in one quantum)
    void ctx.suspend((k + 0.25) * q).then(() => {
      for (const fn of list) fn();
      void ctx.resume();
    });
  }
  const out = await ctx.startRendering();
  return { pcm: toBase64(out.getChannelData(0)), sampleRate, marks, strokes, rates, loopSeconds };
}

/**
 * Spray painting as the game will play it: the can shaken before its first use, the button pressed
 * (the valve's pssht, the hiss started) and held, let go, pressed again with the can a little emptier
 * (rate 0.93), the part reaching its colour, the can running dry (the hiss stopped, the sputter).
 * Marks: each part of it, and the quiet at the end.
 */
async function renderSpray(sampleRate = 48000): Promise<{ pcm: string; sampleRate: number; marks: Record<string, [number, number]> }> {
  const seconds = 7.6;
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
  const f = new Foley(ctx, ctx.destination);
  // rendered ahead, as the game should when a can is taken up
  f.warm(['spray_rattle', 'spray_start', 'spray_hiss', 'spray_sputter', 'paint_done']);
  const ev: SceneEvent[] = [
    { t: 0.2, play: 'spray_rattle' },
    { t: 1.3, play: 'spray_start' }, { t: 1.3, start: 'spray_hiss' },
    { t: 3.8, stop: 'spray_hiss' },
    { t: 4.4, play: 'spray_start' }, { t: 4.4, start: 'spray_hiss', opts: { rate: 0.93 } },
    { t: 5.1, play: 'paint_done' },
    { t: 5.9, stop: 'spray_hiss' }, { t: 5.9, play: 'spray_sputter' },
  ];
  // one suspend per render quantum with something to do (a quarter into it, however the browser rounds)
  const q = 128 / sampleRate;
  const due = new Map<number, SceneEvent[]>();
  for (const e of ev) {
    const k = Math.floor(e.t / q);
    due.set(k, [...(due.get(k) ?? []), e]);
  }
  for (const [k, list] of due) {
    void ctx.suspend((k + 0.25) * q).then(() => {
      for (const e of list) {
        if (e.play) f.play(e.play, e.opts, e.t);
        if (e.start) f.start(e.start, e.opts);
        if (e.stop) f.stop(e.stop);
      }
      void ctx.resume();
    });
  }
  const out = await ctx.startRendering();
  const marks: Record<string, [number, number]> = {
    shake: [0.2, 1.1], press: [1.3, 1.6], held: [1.7, 3.7], released: [4.0, 4.35], press2: [4.4, 4.7], coat: [5.1, 5.75], dry: [5.9, 6.65], quiet: [6.9, 7.5],
  };
  return { pcm: toBase64(out.getChannelData(0)), sampleRate, marks };
}

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
      renderWorkshop: typeof renderWorkshop;
      renderScrub: typeof renderScrub;
      renderSpray: typeof renderSpray;
      checkLoops: typeof checkLoops;
    };
  }
}

window.__modcarAudio = { ready: true, renderEngine, renderFoley, renderWorkshop, renderScrub, renderSpray, checkLoops };
