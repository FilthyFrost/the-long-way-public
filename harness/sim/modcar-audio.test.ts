/**
 * ModCar sound checks (Node, no browser): the engine banks are complete and consistent (every
 * manifest entry has its files in both formats, the containers decode to the lengths the loop
 * points assume, rpm steps cover idle to redline within the pitch budget, seams measured clean when
 * the bank was built), the mixing maths behaves, and every foley recipe renders sane audio (the
 * scrubbing sounds also: seamless, textured, at their levels, following a stroke's rate; the spray
 * paint's: the can shaken, the valve's pssht into a steady hiss, running dry, the coat's chime). The
 * workshop generator (gen_d1) is a bank of its own kind: a few loops round its governed speed, no
 * rev limiter, started on a rope (pullStart). The decoded, played-back seam check and the voice's
 * pull start (no starter whine, no solenoid clicks) are in harness/audio/modcar_render.mjs (Chrome).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blendWeights, healLoop, loadMix, loopGain, engineTone, rpmWeights, popSample, blowOffSample, rodKnockSample, solenoidSample, type BankManifest, type LoopRec } from '../../src/game/modcar/engineAudio';
import { Foley, recipe, foleyLevel, loopPlaybackRate, FOLEY_LOOPS, FOLEY_SHOTS, type FoleyLoop, type FoleyOpts, type FoleyShot, type GrindMaterial, type ScrapeSurface } from '../../src/game/modcar/foley';
import { Rng, biquad, fft, measure } from '../../src/game/modcar/synth';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BANKS = path.join(ROOT, 'public', 'audio', 'modcar', 'engines');
const VEHICLE_ENGINES = ['eng_mower', 'eng_single', 'eng_2t', 'eng_i4', 'eng_i4d', 'eng_flat6', 'eng_v8', 'eng_d6'];
/** machines that are not driven: the workshop's generator (a few loops round its governed speed, no limiter) */
const MACHINES = ['gen_d1'];
const ENGINES = [...VEHICLE_ENGINES, ...MACHINES];
// MODCAR.md 2.3: the redline of every engine (the generator: the top of its governor's band)
const REDLINE: Record<string, number> = { eng_mower: 3600, eng_single: 9000, eng_2t: 9500, eng_i4: 6200, eng_i4d: 4400, eng_flat6: 7200, eng_v8: 6000, eng_d6: 2800, gen_d1: 3300 };

function manifest(id: string): BankManifest {
  return JSON.parse(fs.readFileSync(path.join(BANKS, id, 'manifest.json'), 'utf8')) as BankManifest;
}

/** decoded length (s) of an Ogg Opus file: last granule position minus the pre-skip, at 48 kHz */
function oggSeconds(file: string): number {
  const b = fs.readFileSync(file);
  let preSkip = 0;
  const head = b.indexOf('OpusHead');
  if (head >= 0) preSkip = b.readUInt16LE(head + 10);
  let granule = -1;
  for (let i = b.length - 27; i >= 0; i--) {
    if (b[i] === 0x4f && b[i + 1] === 0x67 && b[i + 2] === 0x67 && b[i + 3] === 0x53) {
      granule = Number(b.readBigInt64LE(i + 6));
      break;
    }
  }
  return (granule - preSkip) / 48000;
}

/** presented length (s) of an MP4/M4A: the edit list if there is one, else the media duration */
function mp4Seconds(file: string): number {
  const b = fs.readFileSync(file);
  let timescale = 0;
  let mediaDur = 0;
  let movieScale = 0;
  let editDur = -1;
  const walk = (start: number, end: number): void => {
    let i = start;
    while (i + 8 <= end) {
      let size = b.readUInt32BE(i);
      const type = b.toString('latin1', i + 4, i + 8);
      let hdr = 8;
      if (size === 1) {
        size = Number(b.readBigUInt64BE(i + 8));
        hdr = 16;
      }
      if (size < 8) break;
      if (['moov', 'trak', 'mdia', 'edts'].includes(type)) walk(i + hdr, i + size);
      else if (type === 'mvhd') {
        const v = b[i + hdr];
        movieScale = v === 1 ? b.readUInt32BE(i + hdr + 20) : b.readUInt32BE(i + hdr + 12);
      } else if (type === 'mdhd') {
        const v = b[i + hdr];
        timescale = v === 1 ? b.readUInt32BE(i + hdr + 20) : b.readUInt32BE(i + hdr + 12);
        mediaDur = v === 1 ? Number(b.readBigUInt64BE(i + hdr + 24)) : b.readUInt32BE(i + hdr + 16);
      } else if (type === 'elst') {
        const v = b[i + hdr];
        editDur = v === 1 ? Number(b.readBigUInt64BE(i + hdr + 8)) : b.readUInt32BE(i + hdr + 8);
      }
      i += size;
    }
  };
  walk(0, b.length);
  if (editDur >= 0 && movieScale > 0) return editDur / movieScale;
  return mediaDur / timescale;
}

function dirSize(dir: string): number {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    n += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return n;
}

describe('ModCar engine banks', () => {
  it('has a bank for every engine and stays under the size budget', () => {
    for (const id of ENGINES) expect(fs.existsSync(path.join(BANKS, id, 'manifest.json')), id).toBe(true);
    expect(dirSize(path.join(ROOT, 'public', 'audio', 'modcar')) / 1e6).toBeLessThan(25);
  });

  for (const id of ENGINES) {
    describe(id, () => {
      const m = manifest(id);
      const entries: Array<{ file: string; duration: number; loopStart?: number; loopEnd?: number }> = [...m.loops, ...Object.values(m.oneshots)];

      it('lists every file in every format, and the containers decode to the listed lengths', () => {
        expect(m.formats).toEqual(['ogg', 'm4a']);
        for (const e of entries) {
          for (const ext of m.formats) {
            const f = path.join(BANKS, id, `${e.file}.${ext}`);
            expect(fs.existsSync(f), `${id}/${e.file}.${ext}`).toBe(true);
            const s = ext === 'ogg' ? oggSeconds(f) : mp4Seconds(f);
            // Opus is exact; AAC rounds up to whole frames (21 ms) when the edit list is missing
            expect(Math.abs(s - e.duration), `${id}/${e.file}.${ext}: ${s} vs ${e.duration}`).toBeLessThan(ext === 'ogg' ? 0.001 : 0.05);
          }
        }
      });

      it('keeps every loop inside its cyclic padding', () => {
        for (const e of entries) {
          if (e.loopStart === undefined || e.loopEnd === undefined) continue;
          expect(e.loopStart).toBeGreaterThanOrEqual(0.05);
          expect(e.loopEnd - e.loopStart).toBeGreaterThan(0.25);
          expect(e.duration - e.loopEnd).toBeGreaterThanOrEqual(0.02);
        }
      });

      const machine = MACHINES.includes(id);

      it('covers idle to past the redline at both loads, within the pitch budget', () => {
        expect(m.redlineRpm).toBe(REDLINE[id]);
        for (const load of [0, 1]) {
          const ls = m.loops.filter((l) => l.load === load).sort((a, b) => a.rpm - b.rpm);
          // (a governed machine is only ever heard round its working speed)
          expect(ls.length).toBeGreaterThanOrEqual(machine ? 3 : 7);
          expect(ls[0].rpm).toBeLessThanOrEqual(m.idleRpm * 1.01);
          expect(ls[ls.length - 1].rpm).toBeGreaterThanOrEqual(m.redlineRpm);
          for (let i = 1; i < ls.length; i++) {
            // half a step either way: at most ~6.5 % of playback-rate correction
            expect(ls[i].rpm / ls[i - 1].rpm, `${id} ${ls[i - 1].file} -> ${ls[i].file}`).toBeLessThan(1.14);
            // and recorded no more than 750 rpm apart
            expect(ls[i].rpm - ls[i - 1].rpm, `${id} ${ls[i - 1].file} -> ${ls[i].file}`).toBeLessThanOrEqual(752);
          }
        }
        expect(m.loops.filter((l) => l.load === 0).map((l) => (l as LoopRec & { nominal: number }).nominal)).toEqual(m.loops.filter((l) => l.load === 1).map((l) => (l as LoopRec & { nominal: number }).nominal));
        for (const shot of ['crank', 'catch', 'shutdown', 'stall', ...(machine ? [] : ['limiter'])]) expect(m.oneshots[shot], `${id} ${shot}`).toBeDefined();
        // a governed machine has no rev limiter to bounce off
        if (machine) expect(m.oneshots.limiter, `${id} limiter`).toBeUndefined();
      });

      it('measured clean seams when the bank was built', () => {
        for (const e of [...m.loops, m.oneshots.crank, m.oneshots.limiter].filter(Boolean) as unknown as Array<Record<string, number>>) {
          // the curvature across the seam is no sharper than the loop's own sharpest moments
          expect(e.click, `${id} ${e.file}`).toBeLessThan(1.5);
          // the cyclic copies after decoding differ only by codec noise (misaligned would be ~+3 dB)
          expect(e.seam_ogg, `${id} ${e.file}`).toBeLessThan(-6);
          expect(e.seam_m4a, `${id} ${e.file}`).toBeLessThan(-6);
        }
      });

      it('is loudest at full load near the redline and quietest at idle', () => {
        const tone = engineTone(id);
        const on = m.loops.filter((l) => l.load === 1);
        const idle = m.loops.find((l) => l.idle)!;
        const top = on.reduce((a, b) => (b.rpm > a.rpm ? b : a));
        // (a generator running light is only a little quieter than loaded: about 2 dB)
        expect(loopGain(tone, top, m.idleRpm, m.redlineRpm)).toBeGreaterThan(loopGain(tone, idle, m.idleRpm, m.redlineRpm) * (machine ? 1.2 : 2.5));
        for (const r of on) {
          const off = m.loops.find((l) => l.load === 0 && l.rpm === r.rpm && !l.idle);
          if (off) expect(loopGain(tone, off, m.idleRpm, m.redlineRpm), `${id} ${r.file}`).toBeLessThan(loopGain(tone, r, m.idleRpm, m.redlineRpm) * 1.05);
        }
      });
    });
  }
});

describe('ModCar workshop generator gen_d1', () => {
  const m = manifest('gen_d1');
  const tone = engineTone('gen_d1');

  it('is governed and pulled on a rope: no electric starter, and no vehicle engine is', () => {
    expect(tone.governed).toBe(true);
    expect(tone.pullStart).toBe(true);
    for (const id of VEHICLE_ENGINES) expect(engineTone(id).pullStart, id).toBeFalsy();
    // a governed engine never plays the limiter stutter
    expect(m.oneshots.limiter).toBeUndefined();
  });

  it('runs round 3000 rpm, loaded and light, never coasting', () => {
    expect(m.offMode).toBe('light');
    expect(m.cylinders).toBe(1);
    expect(m.idleRpm).toBe(3000);
    for (const load of [0, 1]) expect(m.loops.filter((l) => l.load === load).map((l) => (l as LoopRec & { nominal: number }).nominal)).toEqual([2700, 3000, 3300]);
    // the idle is the governed speed with nothing drawn: a light-load run, played under the loaded loop
    const idle = m.loops.find((l) => l.idle)!;
    expect(idle.load).toBe(0);
    expect(idle.rpm).toBeCloseTo(3000, 0);
    for (const off of m.loops.filter((l) => l.load === 0)) {
      const on = m.loops.find((l) => l.load === 1 && Math.abs(l.rpm - off.rpm) < 1)!;
      const lift = loopGain(tone, on, m.idleRpm, m.redlineRpm) / loopGain(tone, off, m.idleRpm, m.redlineRpm);
      expect(20 * Math.log10(lift), off.file).toBeGreaterThan(1.5);
      expect(20 * Math.log10(lift), off.file).toBeLessThan(4);
    }
  });

  it('cranks on the rope at about a hand pull, catches, runs down and stalls', () => {
    const c = m.oneshots.crank;
    expect(c.rpm!).toBeGreaterThan(400);
    expect(c.rpm!).toBeLessThan(560);
    expect(c.loopEnd! - c.loopStart!).toBeGreaterThan(0.7);
    for (const s of ['catch', 'shutdown', 'stall']) expect(m.oneshots[s].duration, s).toBeGreaterThan(1);
    // a run-down from 3000 rpm on its flywheel takes a while, a stall less
    expect(m.oneshots.shutdown.duration).toBeGreaterThan(2);
    expect(m.oneshots.stall.duration).toBeLessThan(m.oneshots.shutdown.duration);
  });
});

describe('ModCar engine mixing maths', () => {
  const loops = [1000, 1130, 1280, 1450].map((rpm, i) => ({ file: `l${i}`, load: 1, rpm, db: 0, loopStart: 0.064, loopEnd: 1, duration: 1.05 }));

  it('crossfades the two nearest loops keeping their (partly coherent) power and tracks rpm exactly', () => {
    for (const rpm of [800, 1000, 1050, 1129, 1200, 1449, 1600]) {
      const w = rpmWeights(loops, rpm);
      expect(w.length).toBeGreaterThanOrEqual(1);
      // aligned neighbours are about half alike (the default coherence when the bank does not say)
      const rho = 0.5;
      const p = w.reduce((a, b) => a + b.w * b.w, 0) + (w.length === 2 ? 2 * rho * w[0].w * w[1].w : 0);
      expect(p).toBeCloseTo(1, 6);
      for (const x of w) expect(x.rate * x.rec.rpm).toBeCloseTo(rpm, 6);
      if (rpm > 1000 && rpm < 1450) for (const x of w) expect(Math.abs(Math.log(x.rate))).toBeLessThan(Math.log(1.14));
    }
    // at a loop's own rpm it plays alone at its own pitch
    const at = rpmWeights(loops, 1280).filter((x) => x.w > 1e-6);
    expect(at.length).toBe(1);
    expect(at[0].rate).toBeCloseTo(1, 9);
  });

  it('fades between unlike signals at equal power and between identical ones linearly', () => {
    for (const x of [0, 0.2, 0.5, 0.9, 1]) {
      const [a, b] = blendWeights(x, 0);
      expect(a * a + b * b).toBeCloseTo(1, 9);
      const [c, d] = blendWeights(x, 0.9);
      expect(c * c + d * d + 2 * 0.9 * c * d).toBeCloseTo(1, 9);
    }
  });

  it('blends towards full load with throttle, a little with load', () => {
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const v = loadMix(t, 0.5);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(loadMix(0, 0)).toBe(0);
    expect(loadMix(1, 1)).toBe(1);
    expect(loadMix(1, 0)).toBeGreaterThan(0.7);
  });

  it('heals a loop seam so the wrap lands on continuous samples', () => {
    const sr = 48000;
    const L = 4800;
    const pre = 3072;
    const x = new Float32Array(pre + L + 1536);
    for (let i = 0; i < x.length; i++) x[i] = Math.sin((2 * Math.PI * 5 * (i - pre)) / L);
    // a codec-like error in the post-roll copy only
    for (let i = pre + L; i < x.length; i++) x[i] += 0.05;
    const before = Math.abs(x[pre] - x[pre + L]);
    healLoop(x, sr, pre / sr, (pre + L) / sr);
    // after healing, sample loopStart equals the continuation of loopEnd - 1
    expect(Math.abs(x[pre] - x[pre + L])).toBeLessThan(before * 0.2);
    expect(Math.abs(x[pre + 1] - x[pre])).toBeLessThan(0.01);
  });

  it('renders pops and the blow-off valve', () => {
    for (let k = 0; k < 4; k++) {
      const p = popSample(48000, k, k === 3);
      const s = measure(p, 48000);
      expect(Number.isFinite(s.rms) && s.rms > 0.01).toBe(true);
      expect(s.peak).toBeLessThanOrEqual(1);
    }
    expect(measure(blowOffSample(48000, 1), 48000).centroid).toBeGreaterThan(1500);
    // the rod knock is a low, dull knock; the solenoid a bright click
    expect(measure(rodKnockSample(48000, 1), 48000).centroid).toBeLessThan(measure(solenoidSample(48000, 1), 48000).centroid);
  });
});

const GRINDS: readonly GrindMaterial[] = ['metal', 'plastic', 'organic', 'cloth', 'wood'];

describe('ModCar foley recipes', () => {
  const sr = 48000;
  const render = (kind: FoleyShot | FoleyLoop, o = {}): Float32Array => recipe(kind, o)(sr, new Rng(1234));

  it('renders every sound: finite, audible, no clipping', () => {
    const variants: Array<[FoleyShot | FoleyLoop, object]> = [
      ...FOLEY_SHOTS.map((k) => [k, {}] as [FoleyShot, object]),
      ...FOLEY_LOOPS.map((k) => [k, {}] as [FoleyLoop, object]),
      ...(['metal', 'rusty', 'armor', 'cage', 'fridge'] as const).flatMap((material) => [['door_open', { material }], ['door_close', { material }]] as Array<[FoleyShot, object]>),
      ...(['fuel', 'water', 'oil'] as const).map((liquid) => ['pour', { liquid }] as [FoleyLoop, object]),
      ...GRINDS.flatMap((grind) => [['shred', { grind }], ['hammer_hit', { grind }]] as Array<[FoleyShot, object]>),
    ];
    for (const [kind, o] of variants) {
      const x = render(kind, o);
      let bad = 0;
      for (const v of x) if (!Number.isFinite(v)) bad++;
      expect(bad, kind).toBe(0);
      const s = measure(x, sr);
      expect(s.peak, `${kind} ${JSON.stringify(o)}`).toBeLessThanOrEqual(1.0001);
      expect(s.rms, `${kind} ${JSON.stringify(o)}`).toBeGreaterThan(0.003);
      expect(x.length / sr).toBeLessThan(4);
    }
  });

  it('loops wrap without a click', () => {
    for (const kind of FOLEY_LOOPS) {
      const x = render(kind);
      const steps = new Float32Array(x.length - 1);
      for (let i = 1; i < x.length; i++) steps[i - 1] = Math.abs(x[i] - x[i - 1]);
      steps.sort();
      const p999 = steps[Math.floor(steps.length * 0.999)];
      const wrap = Math.abs(x[0] - x[x.length - 1]);
      expect(wrap, kind).toBeLessThan(Math.max(1.05 * p999, 0.002));
    }
  });

  it('sets parts down brighter when small, deeper when heavy', () => {
    const c = [0.3, 4, 25, 235].map((mass) => measure(render('part_setdown', { mass }), sr).centroid);
    for (let i = 1; i < c.length; i++) expect(c[i], `${c}`).toBeLessThan(c[i - 1]);
  });

  it('gives each door material its own colour', () => {
    const c = Object.fromEntries((['metal', 'armor', 'cage', 'fridge'] as const).map((material) => [material, measure(render('door_close', { material }), sr).centroid]));
    expect(c.armor).toBeLessThan(c.metal);
    expect(c.cage).toBeGreaterThan(c.metal);
    expect(c.fridge).not.toBeCloseTo(c.metal, -2);
  });
});

describe('ModCar workshop foley', () => {
  const sr = 48000;
  const render = (kind: FoleyShot | FoleyLoop, o: FoleyOpts = {}, seed = 1234): Float32Array => recipe(kind, o)(sr, new Rng(seed));
  const SHOTS: FoleyShot[] = ['cord_pull', 'gen_switch', 'gen_cough', 'shred', 'tally', 'craft_start', 'hammer_swing', 'hammer_hit', 'craft_done', 'power_on', 'power_off', 'no_power'];
  const LOOPS: FoleyLoop[] = ['recycler_run', 'recycler_grind', 'lamp_buzz'];
  const variants: Array<[FoleyShot, FoleyOpts]> = SHOTS.flatMap((k) => (k === 'shred' || k === 'hammer_hit' ? GRINDS.map((grind) => [k, { grind }] as [FoleyShot, FoleyOpts]) : [[k, {}] as [FoleyShot, FoleyOpts]]));
  /** energy (rms) of x over [a, b) seconds */
  const rmsOf = (x: Float32Array, a: number, b: number): number => {
    let e = 0;
    const i0 = Math.floor(a * sr);
    const i1 = Math.min(x.length, Math.floor(b * sr));
    for (let i = i0; i < i1; i++) e += x[i] * x[i];
    return Math.sqrt(e / Math.max(1, i1 - i0));
  };

  it('has every new sound in the catalogue, with a level', () => {
    for (const k of [...SHOTS, ...LOOPS]) {
      expect([...FOLEY_SHOTS, ...FOLEY_LOOPS] as string[], k).toContain(k);
      expect(foleyLevel(k), k).toBeGreaterThan(0);
      expect(foleyLevel(k), k).toBeLessThanOrEqual(1);
    }
    // the lamps are the quietest thing in the workshop, the recycler grinding over its running
    expect(foleyLevel('lamp_buzz')).toBeLessThan(Math.min(...FOLEY_LOOPS.filter((k) => k !== 'lamp_buzz').map(foleyLevel)));
  });

  it('renders every new shot non-silent and unclipped at its level, from silence to silence, for any seed', () => {
    for (const [kind, o] of variants) {
      for (const seed of [1, 1234, 777]) {
        const x = render(kind, o, seed);
        const tag = `${kind} ${o.grind ?? ''} seed ${seed}`;
        let bad = 0;
        let dc = 0;
        for (const v of x) {
          if (!Number.isFinite(v)) bad++;
          dc += v;
        }
        expect(bad, tag).toBe(0);
        const s = measure(x, sr);
        // (the player varies the level by up to 8 % per play)
        expect(s.peak * foleyLevel(kind) * 1.08, tag).toBeLessThan(1);
        expect(s.rms, tag).toBeGreaterThan(0.003);
        // no click at either end, no offset left standing
        expect(Math.abs(x[0]), tag).toBeLessThan(1e-3);
        expect(Math.abs(x[x.length - 1]), tag).toBeLessThan(1e-3);
        expect(Math.abs(dc / x.length), tag).toBeLessThan(0.01 * s.peak);
        expect(x.length / sr, tag).toBeLessThan(2);
      }
    }
  });

  it('lasts as long as the brief says', () => {
    const len = (k: FoleyShot): number => render(k).length / sr;
    expect(len('cord_pull')).toBeGreaterThan(0.75);
    expect(len('cord_pull')).toBeLessThan(1.0);
    expect(len('craft_done')).toBeGreaterThan(0.7);
    expect(len('craft_done')).toBeLessThan(1.0);
    expect(len('power_on')).toBeGreaterThan(1.0);
    expect(len('power_on')).toBeLessThan(1.4);
    expect(len('tally')).toBeLessThan(0.1);
    expect(len('no_power')).toBeLessThan(0.2);
    expect(len('gen_switch')).toBeLessThan(0.4);
    expect(len('hammer_swing')).toBeGreaterThan(0.2);
    expect(len('hammer_swing')).toBeLessThan(0.4);
    // the rope: out with its knocks for about 0.45 s, back in over about 0.3 s, both heard
    const pull = render('cord_pull');
    expect(rmsOf(pull, 0.05, 0.42)).toBeGreaterThan(rmsOf(pull, 0.5, 0.75) * 1.5);
    expect(rmsOf(pull, 0.5, 0.75)).toBeGreaterThan(0.005);
  });

  it('loops seamlessly: no step, no kink, no level jump at the wrap, no DC', () => {
    for (const kind of LOOPS) {
      for (const seed of [1234, 99]) {
        const x = render(kind, {}, seed);
        const n = x.length;
        // the curvature across the wrap is no sharper than the loop's own
        const d2 = (i: number): number => Math.abs(x[(i + 1) % n] - 2 * x[i % n] + x[(i - 1 + n) % n]);
        const all = new Float32Array(n);
        for (let i = 0; i < n; i++) all[i] = d2(i);
        all.sort();
        const p999 = all[Math.floor(n * 0.999)];
        let wrap = 0;
        for (let i = n - 3; i <= n + 3; i++) wrap = Math.max(wrap, d2(i));
        expect(wrap, `${kind} seed ${seed}`).toBeLessThan(p999 * 1.5);
        // the low band carries straight on across the wrap (a loop cut short jumps in the phase of its hum,
        // which its crunching would hide from the curvature above): filtered as the loop it is, three turns
        const low = new Float32Array(3 * n);
        for (let k = 0; k < 3; k++) low.set(x, k * n);
        biquad(low, sr, 'lowpass', 400, 0.7);
        biquad(low, sr, 'lowpass', 400, 0.7);
        const steps = new Float32Array(n);
        for (let i = 0; i < n; i++) steps[i] = Math.abs(low[n + i] - low[n + i - 1]);
        const across = steps[0];
        steps.sort();
        expect(across, `${kind} seed ${seed} (low band)`).toBeLessThan(steps[Math.floor(n * 0.999)] * 1.5);
        // a window across the wrap is as loud as the loop's own windows are: no dip (10 ms, a fade at
        // either end), no bump (50 ms)
        const win = (c: number, w: number): number => {
          let e = 0;
          for (let i = c - (w >> 1); i < c + (w >> 1); i++) e += x[((i % n) + n) % n] ** 2;
          return Math.sqrt(e / w);
        };
        const short = Math.floor(0.01 * sr);
        const quietest = Math.min(...Array.from({ length: 128 }, (_, k) => win(Math.floor(((k + 0.5) * n) / 128), short)));
        expect(win(0, short) / quietest, `${kind} seed ${seed} (dip)`).toBeGreaterThan(0.7);
        const w = Math.floor(0.05 * sr);
        const levels = Array.from({ length: 64 }, (_, k) => win(Math.floor(((k + 0.5) * n) / 64), w)).sort((p, q) => p - q);
        expect(win(0, w) / levels[32], `${kind} seed ${seed} (bump)`).toBeLessThan(Math.max(2, levels[60] / levels[32]));
        let dc = 0;
        for (const v of x) dc += v;
        expect(Math.abs(dc / n), `${kind} seed ${seed}`).toBeLessThan(1e-4);
        // whole seconds or so: the recycler's loops are long enough not to be heard repeating
        expect(n / sr).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('shreds each material in its own colour, and every thing differently', () => {
    const c = Object.fromEntries(GRINDS.map((grind) => [grind, measure(render('shred', { grind }), sr).centroid]));
    // metal and plastic bright, the wet and the soft dark
    expect(c.plastic).toBeGreaterThan(c.organic);
    expect(c.metal).toBeGreaterThan(c.organic);
    expect(c.wood).toBeGreaterThan(c.organic);
    expect(c.metal).toBeGreaterThan(c.cloth);
    for (const grind of GRINDS) {
      const a = render('shred', { grind }, 1);
      const b = render('shred', { grind }, 2);
      let d = 0;
      for (let i = 0; i < Math.min(a.length, b.length); i++) d += (a[i] - b[i]) ** 2;
      expect(Math.sqrt(d / a.length), grind).toBeGreaterThan(0.01);
    }
  });

  it('rings an anvil, knocks plastic, thocks wood; no two blows the same', () => {
    const metal = render('hammer_hit', { grind: 'metal' });
    const plastic = render('hammer_hit', { grind: 'plastic' });
    const wood = render('hammer_hit', { grind: 'wood' });
    // the anvil rings on long after the knocks have died
    const ringOn = (x: Float32Array): number => rmsOf(x, 0.25, 0.4) / rmsOf(x, 0, 0.05);
    expect(ringOn(metal)).toBeGreaterThan(5 * ringOn(plastic));
    expect(ringOn(metal)).toBeGreaterThan(5 * ringOn(wood));
    expect(measure(metal, sr).centroid).toBeGreaterThan(measure(wood, sr).centroid);
    // each hit slightly different: another rendering is never the same signal
    const a = render('hammer_hit', { grind: 'metal' }, 5);
    const b = render('hammer_hit', { grind: 'metal' }, 6);
    expect(Math.abs(measure(a, sr).centroid - measure(b, sr).centroid)).toBeGreaterThan(5);
  });

  it('dings with two bell partials, bright and short', () => {
    const x = render('craft_done');
    // the spectrum of the first 0.17 s: its two strongest peaks are the partials (E6 and the fifth above)
    const N = 8192;
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    const mag = (k: number): number => Math.hypot(re[k], im[k]);
    const peaks: number[] = [];
    for (let k = 2; k < N / 2 - 2; k++) if (mag(k) > mag(k - 1) && mag(k) >= mag(k + 1) && mag(k) > mag(k - 2) && mag(k) >= mag(k + 2)) peaks.push(k);
    peaks.sort((a, b) => mag(b) - mag(a));
    const top = peaks.slice(0, 2).map((k) => (k * sr) / N).sort((a, b) => a - b);
    expect(top[0]).toBeGreaterThan(1290);
    expect(top[0]).toBeLessThan(1350);
    expect(top[1] / top[0]).toBeCloseTo(1.5, 1);
    // it has died away by the end
    expect(rmsOf(x, 0.75, 0.85)).toBeLessThan(rmsOf(x, 0, 0.1) * 0.05);
  });

  it('hums the mains: the power coming on rises, going off dies away, the lamps buzz at 100 Hz', () => {
    const on = render('power_on');
    const off = render('power_off');
    const low = (x: Float32Array, a: number, b: number): number => {
      // the 100 Hz band only
      const y = x.slice(Math.floor(a * sr), Math.floor(b * sr));
      let e = 0;
      let ph = 0;
      let c = 0;
      let s = 0;
      for (let i = 0; i < y.length; i++) {
        ph = (2 * Math.PI * 100 * i) / sr;
        c += y[i] * Math.cos(ph);
        s += y[i] * Math.sin(ph);
      }
      e = Math.hypot(c, s) / y.length;
      return e;
    };
    expect(low(on, 0.6, 0.9)).toBeGreaterThan(2 * low(on, 0.03, 0.13));
    expect(low(off, 0.02, 0.12)).toBeGreaterThan(4 * low(off, 0.6, 0.8));
    const lamp = render('lamp_buzz');
    expect(low(lamp, 0, 1)).toBeGreaterThan(0.05 * measure(lamp, sr).peak);
  });

  it('plays the workshop sounds through the player: grinds kept apart, never the same rendering twice running', () => {
    // a minimal stand-in for an AudioContext: enough for Foley to make buffers and sources
    const started: Array<{ buffer: unknown }> = [];
    const node = (): Record<string, unknown> => ({ connect: (n: unknown) => n, disconnect: () => undefined, gain: { value: 1, setTargetAtTime: () => undefined, setValueAtTime: () => undefined, cancelScheduledValues: () => undefined } });
    const ctx = {
      sampleRate: sr,
      currentTime: 0,
      destination: { channelCount: 1 },
      createGain: () => node(),
      createBuffer: (_c: number, n: number) => ({ length: n, duration: n / sr, copyToChannel: () => undefined }),
      createBufferSource: () => {
        const s = { ...node(), buffer: null as unknown, loop: false, playbackRate: { value: 1 }, onended: null, start: () => started.push(s), stop: () => undefined };
        return s;
      },
    };
    const f = new Foley(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode);
    for (let k = 0; k < 40; k++) f.play('hammer_hit', { grind: 'metal' });
    for (let k = 1; k < started.length; k++) expect(started[k].buffer, `blow ${k}`).not.toBe(started[k - 1].buffer);
    // five renderings of a blow, and the wood is not the metal
    expect(new Set(started.map((s) => s.buffer)).size).toBe(5);
    const metalBufs = new Set(started.map((s) => s.buffer));
    started.length = 0;
    f.play('hammer_hit', { grind: 'wood' });
    f.play('shred', { grind: 'cloth' });
    for (const s of started) expect(metalBufs.has(s.buffer)).toBe(false);
    expect(started[0].buffer).not.toBe(started[1].buffer);
  });
});

// ------------------------------------------------------------------ scrubbing (Batch 5)

const SCRUB_LOOPS: readonly FoleyLoop[] = ['scrape_glass', 'scrape_metal', 'scrape_rust', 'scrape_mud', 'brush_wire', 'sponge_scrub'];
/** the blade's and the brush's loops (the sponge is meant to sit a little under them) */
const SCRAPES: readonly FoleyLoop[] = ['scrape_glass', 'scrape_metal', 'scrape_rust', 'scrape_mud', 'brush_wire'];
const SCRUB_SHOTS: readonly FoleyShot[] = ['scrape_start', 'flake_drop', 'clean_ding', 'clean_rust_done', 'clean_car_done', 'tool_worn', 'highlight_ping'];
const CHIMES: readonly FoleyShot[] = ['clean_ding', 'clean_rust_done', 'clean_car_done', 'highlight_ping'];
const SURFACES: readonly ScrapeSurface[] = ['glass', 'metal', 'rust', 'mud'];

/** an AudioParam that keeps its automation: [what, value, time, time constant] */
type KeptParam = { value: number; events: Array<[string, number, number, number?]>; setValueAtTime: (v: number, t: number) => KeptParam; setTargetAtTime: (v: number, t: number, c: number) => KeptParam; cancelScheduledValues: (t: number) => KeptParam };
function keptParam(value = 1): KeptParam {
  const p: KeptParam = {
    value,
    events: [],
    setValueAtTime: (v, t) => {
      p.events.push(['set', v, t]);
      p.value = v;
      return p;
    },
    setTargetAtTime: (v, t, c) => {
      p.events.push(['target', v, t, c]);
      return p;
    },
    cancelScheduledValues: (t) => {
      p.events.push(['cancel', 0, t]);
      return p;
    },
  };
  return p;
}
type KeptSource = { buffer: unknown; loop: boolean; playbackRate: KeptParam; out: { gain: KeptParam } | null; started: number };

/** a stand-in AudioContext that keeps what the player does: every rendering it makes (the samples), every source it starts (its buffer, rate and gain with their automation) */
function keptContext(sr: number): { ctx: { sampleRate: number; currentTime: number; destination: { channelCount: number } } & Record<string, unknown>; made: Float32Array[]; sources: KeptSource[] } {
  const made: Float32Array[] = [];
  const sources: KeptSource[] = [];
  const gainNode = (): Record<string, unknown> => ({ gain: keptParam(1), connect: (n: unknown) => n, disconnect: () => undefined });
  const ctx = {
    sampleRate: sr,
    currentTime: 0,
    destination: { channelCount: 1 },
    createGain: gainNode,
    createBuffer: (_c: number, n: number) => ({ length: n, duration: n / sr, copyToChannel: (x: Float32Array) => made.push(Float32Array.from(x)) }),
    createBufferSource: () => {
      const s: KeptSource & Record<string, unknown> = {
        buffer: null,
        loop: false,
        playbackRate: keptParam(1),
        out: null,
        started: 0,
        onended: null,
        connect: (n: { gain: KeptParam }) => {
          s.out = n;
          return n;
        },
        disconnect: () => undefined,
        start: () => {
          s.started++;
          sources.push(s);
        },
        stop: () => undefined,
      };
      return s;
    },
  };
  return { ctx, made, sources };
}

/** K-weighted loudness (BS.1770's shelf and low cut): integrated over a loop (a second turn of it), the 400 ms momentary maximum of a shot */
function kLoudness(x: Float32Array, sr: number, loop: boolean): number {
  const y = new Float32Array(loop ? 2 * x.length : x.length);
  y.set(x);
  if (loop) y.set(x, x.length);
  biquad(y, sr, 'highshelf', 1500, 0.707, 4);
  biquad(y, sr, 'highpass', 38, 0.5);
  if (loop) {
    let s = 0;
    for (let i = x.length; i < y.length; i++) s += y[i] * y[i];
    return 10 * Math.log10(s / x.length) - 0.691;
  }
  const w = Math.floor(0.4 * sr);
  let s = 0;
  let best = 0;
  for (let i = 0; i < y.length + w; i++) {
    if (i < y.length) s += y[i] * y[i];
    if (i >= w) s -= y[i - w] * y[i - w];
    best = Math.max(best, s / w);
  }
  return 10 * Math.log10(best) - 0.691;
}

/**
 * A splice at a loop's wrap, by linear prediction (as clicks are found in old recordings): an
 * order-32 predictor fitted to the loop played round, its error just after the wrap against the
 * 99.9th percentile of its error everywhere else. A seamless loop is as predictable across its wrap
 * as anywhere (well under 1); one cut short jumps there wherever its sound is smooth enough for the
 * jump to be heard (in dense crackle a cut is itself a crackle, and as inaudible).
 */
function spliceAt(x: Float32Array, p = 32): number {
  const n = x.length;
  const r = new Float64Array(p + 1);
  for (let k = 0; k <= p; k++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += x[i] * x[(i + k) % n];
    r[k] = s;
  }
  r[0] *= 1 + 1e-9;
  const a = new Float64Array(p + 1);
  a[0] = 1;
  let e = r[0];
  for (let i = 1; i <= p; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / e;
    const prev = Float64Array.from(a);
    for (let j = 1; j < i; j++) a[j] = prev[j] + k * prev[i - j];
    a[i] = k;
    e *= 1 - k * k;
  }
  const err = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = x[i];
    for (let j = 1; j <= p; j++) s += a[j] * x[(i - j + n) % n];
    err[i] = Math.abs(s);
  }
  let at = 0;
  for (let i = 0; i < 8; i++) at = Math.max(at, err[i]);
  err.sort();
  return at / err[Math.floor(n * 0.999)];
}

/** the power spectrum of x over [a, b) samples (Hann 4096, half-overlapped, summed) */
function powerOf(x: Float32Array, a = 0, b = x.length): Float64Array {
  const N = 4096;
  const P = new Float64Array(N / 2);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let o = a; o + N <= b; o += N / 2) {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < N; i++) re[i] = x[o + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    for (let k = 0; k < N / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k];
  }
  return P;
}
const binHz = (k: number, sr: number): number => (k * sr) / 4096;
/** the share of the power between lo and hi Hz */
function shareOf(P: Float64Array, sr: number, lo: number, hi: number): number {
  let s = 0;
  let t = 0;
  for (let k = 1; k < P.length; k++) {
    t += P[k];
    if (binHz(k, sr) >= lo && binHz(k, sr) < hi) s += P[k];
  }
  return s / t;
}
function centroidOf(P: Float64Array, sr: number): number {
  let a = 0;
  let b = 0;
  for (let k = 1; k < P.length; k++) {
    a += P[k] * binHz(k, sr);
    b += P[k];
  }
  return a / b;
}
/** spectral flatness between lo and hi Hz: near 1 for noise, small where a tone stands out */
function flatnessOf(P: Float64Array, sr: number, lo: number, hi: number): number {
  let g = 0;
  let m = 0;
  let c = 0;
  for (let k = 1; k < P.length; k++) {
    if (binHz(k, sr) < lo || binHz(k, sr) >= hi) continue;
    g += Math.log(P[k] + 1e-30);
    m += P[k];
    c++;
  }
  return Math.exp(g / c) / (m / c);
}
/** the strongest bins between lo and hi Hz, as frequencies (local maxima, strongest first) */
function peaksOf(P: Float64Array, sr: number, lo: number, hi: number, count: number): number[] {
  const idx: number[] = [];
  for (let k = 3; k < P.length - 3; k++) {
    const f = binHz(k, sr);
    if (f < lo || f >= hi) continue;
    if (P[k] > P[k - 1] && P[k] >= P[k + 1] && P[k] > P[k - 2] && P[k] >= P[k + 2]) idx.push(k);
  }
  idx.sort((p, q) => P[q] - P[p]);
  return idx.slice(0, count).map((k) => binHz(k, sr));
}
/** texture: kurtosis (3 for a hiss, far more for crackle) and how much the level moves from one 5 ms / 50 ms window to the next (sd / mean of their rms) */
function textureOf(x: Float32Array, sr: number): { kurtosis: number; cv5: number; cv50: number } {
  let m2 = 0;
  let m4 = 0;
  for (const v of x) {
    m2 += v * v;
    m4 += v * v * v * v;
  }
  m2 /= x.length;
  m4 /= x.length;
  const cv = (w: number): number => {
    const lv: number[] = [];
    for (let o = 0; o + w <= x.length; o += w) {
      let e = 0;
      for (let i = 0; i < w; i++) e += x[o + i] * x[o + i];
      lv.push(Math.sqrt(e / w));
    }
    const mean = lv.reduce((p, q) => p + q, 0) / lv.length;
    return Math.sqrt(lv.reduce((p, q) => p + (q - mean) ** 2, 0) / lv.length) / mean;
  };
  return { kurtosis: m4 / (m2 * m2), cv5: cv(Math.floor(0.005 * sr)), cv50: cv(Math.floor(0.05 * sr)) };
}
/** a loop read round at a playback rate, the way a buffer source does it (linear interpolation) */
function atRate(x: Float32Array, rate: number, seconds: number, sr: number): Float32Array {
  const y = new Float32Array(Math.floor(seconds * sr));
  for (let i = 0, p = 0; i < y.length; i++, p += rate) {
    const k = Math.floor(p);
    const f = p - k;
    y[i] = x[k % x.length] * (1 - f) + x[(k + 1) % x.length] * f;
  }
  return y;
}

/**
 * A loop that wraps without a seam, 2.5 s or more (long enough not to be heard repeating at a fast
 * stroke, rate 1.6) and under 4: the step and the curvature across the wrap ordinary ones, the low
 * band carrying straight on, no splice (spliceAt), no dip or bump in the level across it, no DC.
 */
function expectSeamless(x: Float32Array, sr: number, tag: string): void {
  const n = x.length;
  expect(n / sr, tag).toBeGreaterThanOrEqual(2.5);
  expect(n / sr, tag).toBeLessThan(4);
  // the end runs on into the start: the step across the wrap is an ordinary step ...
  const steps = new Float32Array(n);
  for (let i = 0; i < n; i++) steps[i] = Math.abs(x[(i + 1) % n] - x[i]);
  const across = steps[n - 1];
  steps.sort();
  expect(across, `${tag} (step)`).toBeLessThan(steps[Math.floor(n * 0.999)]);
  // ... and so is the curvature
  const d2 = (i: number): number => Math.abs(x[(i + 1) % n] - 2 * x[i % n] + x[(i - 1 + n) % n]);
  const all = new Float32Array(n);
  for (let i = 0; i < n; i++) all[i] = d2(i);
  all.sort();
  let wrap = 0;
  for (let i = n - 3; i <= n + 3; i++) wrap = Math.max(wrap, d2(i));
  expect(wrap, `${tag} (kink)`).toBeLessThan(all[Math.floor(n * 0.999)] * 1.5);
  // the low band carries straight on (three turns of it filtered)
  const low = new Float32Array(3 * n);
  for (let k = 0; k < 3; k++) low.set(x, k * n);
  biquad(low, sr, 'lowpass', 400, 0.7);
  biquad(low, sr, 'lowpass', 400, 0.7);
  const lsteps = new Float32Array(n);
  for (let i = 0; i < n; i++) lsteps[i] = Math.abs(low[n + i] - low[n + i - 1]);
  const lacross = lsteps[0];
  lsteps.sort();
  expect(lacross, `${tag} (low band)`).toBeLessThan(lsteps[Math.floor(n * 0.999)] * 1.5);
  // no splice: as predictable across the wrap as anywhere
  expect(spliceAt(x), `${tag} (splice)`).toBeLessThan(1);
  // no dip (10 ms) and no bump (50 ms) in the level across the wrap
  const win = (c: number, w: number): number => {
    let e = 0;
    for (let i = c - (w >> 1); i < c + (w >> 1); i++) e += x[((i % n) + n) % n] ** 2;
    return Math.sqrt(e / w);
  };
  const short = Math.floor(0.01 * sr);
  const quietest = Math.min(...Array.from({ length: 128 }, (_, k) => win(Math.floor(((k + 0.5) * n) / 128), short)));
  expect(win(0, short) / quietest, `${tag} (dip)`).toBeGreaterThan(0.7);
  const w = Math.floor(0.05 * sr);
  const levels = Array.from({ length: 64 }, (_, k) => win(Math.floor(((k + 0.5) * n) / 64), w)).sort((p, q) => p - q);
  expect(win(0, w) / levels[32], `${tag} (bump)`).toBeLessThan(Math.max(2, levels[60] / levels[32]));
  let dc = 0;
  for (const v of x) dc += v;
  expect(Math.abs(dc / n), tag).toBeLessThan(1e-4);
}

describe('ModCar scrubbing foley', () => {
  const sr = 48000;
  const render = (kind: FoleyShot | FoleyLoop, o: FoleyOpts = {}, seed = 1234): Float32Array => recipe(kind, o)(sr, new Rng(seed));
  const variants: Array<[FoleyShot, FoleyOpts]> = SCRUB_SHOTS.flatMap((k) => (k === 'scrape_start' ? SURFACES.map((surface) => [k, { surface }] as [FoleyShot, FoleyOpts]) : [[k, {}] as [FoleyShot, FoleyOpts]]));
  const rmsOf = (x: Float32Array, a: number, b: number): number => {
    let e = 0;
    const i0 = Math.floor(a * sr);
    const i1 = Math.min(x.length, Math.floor(b * sr));
    for (let i = i0; i < i1; i++) e += x[i] * x[i];
    return Math.sqrt(e / Math.max(1, i1 - i0));
  };

  it('has every scrubbing sound in the catalogue, with a level', () => {
    for (const k of [...SCRUB_SHOTS, ...SCRUB_LOOPS]) {
      expect([...FOLEY_SHOTS, ...FOLEY_LOOPS] as string[], k).toContain(k);
      expect(foleyLevel(k), k).toBeGreaterThan(0);
      expect(foleyLevel(k), k).toBeLessThanOrEqual(1);
    }
  });

  it('renders every scrubbing shot non-silent and unclipped at its level, from silence to silence, for any seed', () => {
    for (const [kind, o] of variants) {
      for (const seed of [1, 1234, 777]) {
        const x = render(kind, o, seed);
        const tag = `${kind} ${o.surface ?? ''} seed ${seed}`;
        let bad = 0;
        let dc = 0;
        for (const v of x) {
          if (!Number.isFinite(v)) bad++;
          dc += v;
        }
        expect(bad, tag).toBe(0);
        const s = measure(x, sr);
        // (the player varies most shots' level by up to 8 % per play)
        expect(s.peak * foleyLevel(kind) * 1.08, tag).toBeLessThan(1);
        expect(s.rms, tag).toBeGreaterThan(0.003);
        expect(Math.abs(x[0]), tag).toBeLessThan(1e-3);
        expect(Math.abs(x[x.length - 1]), tag).toBeLessThan(1e-3);
        expect(Math.abs(dc / x.length), tag).toBeLessThan(0.01 * s.peak);
      }
    }
  });

  it('lasts as long as the brief says', () => {
    const len = (k: FoleyShot, o: FoleyOpts = {}): number => render(k, o).length / sr;
    for (const surface of SURFACES) {
      expect(len('scrape_start', { surface }), surface).toBeGreaterThan(0.06);
      expect(len('scrape_start', { surface }), surface).toBeLessThan(0.12);
    }
    expect(len('flake_drop')).toBeGreaterThan(0.25);
    expect(len('flake_drop')).toBeLessThan(0.45);
    expect(len('clean_ding')).toBeGreaterThanOrEqual(0.6);
    expect(len('clean_ding')).toBeLessThanOrEqual(0.9);
    expect(len('clean_rust_done')).toBeGreaterThan(0.6);
    expect(len('clean_rust_done')).toBeLessThan(1.1);
    expect(len('clean_car_done')).toBeGreaterThanOrEqual(1.5);
    expect(len('clean_car_done')).toBeLessThanOrEqual(2.5);
    expect(len('tool_worn')).toBeGreaterThan(0.2);
    expect(len('tool_worn')).toBeLessThan(0.45);
    expect(len('highlight_ping')).toBeGreaterThan(0.4);
    expect(len('highlight_ping')).toBeLessThan(0.7);
    // the flakes land over about 0.3 s: the last tick late in most renderings, never past the end
    const last = (x: Float32Array): number => {
      const pk = measure(x, sr).peak;
      let i = x.length - 1;
      while (i > 0 && Math.abs(x[i]) < 0.05 * pk) i--;
      return i / sr;
    };
    const lastTicks = Array.from({ length: 8 }, (_, s) => last(render('flake_drop', {}, 100 + s))).sort((p, q) => p - q);
    expect(lastTicks[4]).toBeGreaterThan(0.12);
    expect(lastTicks[7]).toBeLessThan(0.37);
    // the chimes have died away by their ends
    for (const k of CHIMES) {
      const x = render(k);
      expect(rmsOf(x, x.length / sr - 0.05, x.length / sr), k).toBeLessThan(0.05 * rmsOf(x, 0, 0.1));
    }
  });

  it(
    'loops seamlessly for 2.5 s or more: no step, no kink, no splice, no level jump at the wrap, no DC',
    () => {
      for (const kind of SCRUB_LOOPS) {
        for (const seed of [1234, 99]) expectSeamless(render(kind, {}, seed), sr, `${kind} seed ${seed}`);
        // the splice check does see a loop cut short (3 or 7 ms)
        const x = render(kind);
        expect(
          [3, 7].some((ms) => spliceAt(x.slice(0, x.length - Math.round((ms * sr) / 1000))) > 1),
          `${kind} cut short`,
        ).toBe(true);
      }
    },
    30_000,
  );

  it(
    'carries its own texture at every rate: crackles, catches and grains at varying density, never a steady hiss',
    () => {
      for (const kind of SCRUB_LOOPS) {
        for (const seed of [1234, 99]) {
          const x = render(kind, {}, seed);
          const t = textureOf(x, sr);
          const tag = `${kind} seed ${seed}`;
          expect(t.kurtosis, tag).toBeGreaterThan(5);
          expect(t.cv5, tag).toBeGreaterThan(0.4);
          expect(t.cv50, tag).toBeGreaterThan(0.18);
          // a slow stroke and a fast one keep it
          for (const rate of [0.7, 1.6]) {
            const y = textureOf(atRate(x, rate, 3, sr), sr);
            expect(y.kurtosis, `${tag} at ${rate}`).toBeGreaterThan(4.5);
            expect(y.cv5, `${tag} at ${rate}`).toBeGreaterThan(0.35);
          }
        }
      }
      // (the measure tells: the spray is a steady hiss, and fails it)
      const spray = textureOf(render('spray'), sr);
      expect(spray.kurtosis).toBeLessThan(3.5);
      expect(spray.cv5).toBeLessThan(0.25);
    },
    30_000,
  );

  it(
    'sounds like what is being scrubbed',
    () => {
      for (const seed of [1234, 99]) {
        const P = Object.fromEntries(SCRUB_LOOPS.map((k) => [k, powerOf(render(k, {}, seed))])) as Record<FoleyLoop, Float64Array>;
        const tag = `seed ${seed}`;
        // glass: the blade's squeal stands out of its crunch, round 2 kHz (a tone, where the painted metal is all noise)
        expect(flatnessOf(P.scrape_glass, sr, 1500, 4000), tag).toBeLessThan(0.65);
        expect(flatnessOf(P.scrape_metal, sr, 1500, 4000), tag).toBeGreaterThan(flatnessOf(P.scrape_glass, sr, 1500, 4000) + 0.15);
        const squeal = peaksOf(P.scrape_glass, sr, 1500, 4000, 1)[0];
        expect(squeal, tag).toBeGreaterThan(1600);
        expect(squeal, tag).toBeLessThan(2800);
        // painted metal: a rasp focused in 2-6 kHz, over the panel's lowest mode ringing faintly
        expect(shareOf(P.scrape_metal, sr, 2000, 6000), tag).toBeGreaterThan(0.7);
        expect(shareOf(P.scrape_metal, sr, 0, 1000), tag).toBeLessThan(0.06);
        const mode = peaksOf(P.scrape_metal, sr, 100, 900, 1)[0];
        expect(Math.min(...[176, 262, 409, 597, 868].map((f) => Math.abs(mode / (f / 1.15) - 1))), `${tag} panel mode ${mode}`).toBeLessThan(0.04);
        // rust: rougher than the paint, over a low scrape the paint has not got
        expect(shareOf(P.scrape_rust, sr, 0, 1500), tag).toBeGreaterThan(Math.max(0.1, 3 * shareOf(P.scrape_metal, sr, 0, 1500)));
        expect(textureOf(render('scrape_rust', {}, seed), sr).cv5, tag).toBeGreaterThan(textureOf(render('scrape_metal', {}, seed), sr).cv5 + 0.1);
        // mud: muffled, mostly under 1.5 kHz, even at a fast stroke
        expect(shareOf(P.scrape_mud, sr, 0, 1500), tag).toBeGreaterThan(0.9);
        expect(shareOf(powerOf(atRate(render('scrape_mud', {}, seed), 1.6, 3, sr)), sr, 0, 1500), tag).toBeGreaterThan(0.85);
        // the wire brush: high, most of it over 4 kHz, the brightest of them all
        expect(shareOf(P.brush_wire, sr, 4000, 24000), tag).toBeGreaterThan(0.6);
        for (const k of SCRUB_LOOPS) if (k !== 'brush_wire') expect(centroidOf(P.brush_wire, sr), `${tag} ${k}`).toBeGreaterThan(centroidOf(P[k], sr));
        // the sponge: soft and dark, under every blade but the mud's
        expect(centroidOf(P.sponge_scrub, sr), tag).toBeLessThan(2500);
        for (const k of ['scrape_glass', 'scrape_metal', 'scrape_rust'] as const) expect(centroidOf(P.sponge_scrub, sr), `${tag} ${k}`).toBeLessThan(centroidOf(P[k], sr));
      }
    },
    30_000,
  );

  it('sits in the mix at full gain: the scrapes as loud as the ratchet, the sponge softer, the chimes over them, the flakes far under', () => {
    // the renderings the player itself makes (its own seeds), at their levels
    const { ctx, made } = keptContext(sr);
    const f = new Foley(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode);
    const loud = (kind: FoleyShot | FoleyLoop, o: FoleyOpts = {}): number[] => {
      const a = made.length;
      f.warm([kind], o);
      const loop = (FOLEY_LOOPS as readonly string[]).includes(kind);
      return made.slice(a).map((x) => kLoudness(x.map((v) => v * foleyLevel(kind)), sr, loop));
    };
    const ratchet = loud('ratchet')[0];
    const door = Math.max(...loud('door_close', { material: 'metal' }));
    const scrapes = SCRAPES.map((k) => loud(k)[0]);
    scrapes.forEach((l, i) => expect(Math.abs(l - ratchet), SCRAPES[i]).toBeLessThan(2));
    const sponge = loud('sponge_scrub')[0];
    expect(sponge).toBeLessThan(Math.min(...scrapes) - 1.5);
    expect(sponge).toBeGreaterThan(ratchet - 5);
    // the blade's catch: an accent about as loud as the scrape it starts, whatever the surface
    const catches = SURFACES.map((surface) => {
      const l = loud('scrape_start', { surface });
      return l.reduce((p, q) => p + q, 0) / l.length;
    });
    const mean = scrapes.reduce((p, q) => p + q, 0) / scrapes.length;
    catches.forEach((l, i) => expect(Math.abs(l - mean), SURFACES[i]).toBeLessThan(2.5));
    expect(Math.max(...catches) - Math.min(...catches)).toBeLessThan(3);
    // the chimes: clearly over a scrub at full speed, never louder than a door slammed; the fanfare the loudest
    const ding = loud('clean_ding');
    const rust = loud('clean_rust_done')[0];
    const car = loud('clean_car_done')[0];
    for (const l of [...ding, rust, car]) {
      expect(l).toBeGreaterThan(Math.max(...scrapes) + 5);
      expect(l).toBeLessThan(door);
    }
    expect(car).toBeGreaterThanOrEqual(Math.max(...ding));
    // the ding is the same reward every time: its renderings as loud as one another
    expect(Math.max(...ding) - Math.min(...ding)).toBeLessThan(0.5);
    // the flakes: very quiet, under everything else of theirs
    const flakes = Math.max(...loud('flake_drop'));
    expect(flakes).toBeLessThan(ratchet - 7);
    for (const k of ['tool_worn', 'highlight_ping'] as const) expect(flakes, k).toBeLessThan(Math.max(...loud(k)) - 5);
    expect(flakes).toBeLessThan(Math.min(...catches) - 5);
  });

  it('dings a bright bell; chimes warmer, in two notes, for the rust; rises in a chord for the whole vehicle', () => {
    for (const seed of [1234, 99]) {
      const ding = render('clean_ding', {}, seed);
      // its two strongest partials in its first 0.17 s: D6 and its octave
      const top = peaksOf(powerOf(ding, 0, 8192), sr, 300, 8000, 2).sort((p, q) => p - q);
      expect(top[0]).toBeGreaterThan(1150);
      expect(top[0]).toBeLessThan(1200);
      expect(top[1] / top[0]).toBeCloseTo(2, 1);
      // the glint: light over 4 kHz as it is struck, gone by the time it fades
      expect(shareOf(powerOf(ding, 0, 8192), sr, 4000, 24000)).toBeGreaterThan(10 * shareOf(powerOf(ding, Math.floor(0.4 * sr), Math.floor(0.6 * sr)), sr, 4000, 24000) + 1e-4);
      // the rust's: G5, then D6, rounder than the ding
      const rust = render('clean_rust_done', {}, seed);
      const first = peaksOf(powerOf(rust, 0, Math.floor(0.12 * sr)), sr, 300, 8000, 1)[0];
      const second = peaksOf(powerOf(rust, Math.floor(0.16 * sr), Math.floor(0.5 * sr)), sr, 300, 8000, 1)[0];
      expect(first).toBeGreaterThan(760);
      expect(first).toBeLessThan(810);
      expect(second).toBeGreaterThan(1150);
      expect(second).toBeLessThan(1200);
      expect(centroidOf(powerOf(rust), sr)).toBeLessThan(centroidOf(powerOf(ding), sr));
      // the vehicle's: G, B, D, G rising, one a tenth of a second
      const car = render('clean_car_done', {}, seed);
      const run = [0, 0.1, 0.2, 0.3].map((t) => peaksOf(powerOf(car, Math.floor((t + 0.005) * sr), Math.floor((t + 0.18) * sr)), sr, 300, 8000, 1)[0]);
      [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => expect(Math.abs(run[i] / f - 1), `note ${i}: ${run[i]}`).toBeLessThan(0.03));
    }
  });

  it('follows a stroke through the player: its rate set at the start and glided on every call, the loop never restarted nor rendered again', () => {
    const { ctx, made, sources } = keptContext(sr);
    const f = new Foley(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode);
    f.start('scrape_metal', { gain: 0.3, rate: 0.7 });
    expect(sources.length).toBe(1);
    const s = sources[0];
    expect(s.loop).toBe(true);
    expect(s.playbackRate.events[0]).toEqual(['set', 0.7, 0]);
    const rendered = made.length;
    expect(rendered).toBe(1);
    // a stroke: a new gain and rate every frame
    const speed = (k: number): number => Math.abs(Math.sin(k / 9));
    for (let k = 1; k <= 60; k++) {
      ctx.currentTime = k / 60;
      f.start('scrape_metal', { gain: speed(k), rate: 0.7 + 0.9 * speed(k) });
    }
    expect(sources.length).toBe(1);
    expect(made.length).toBe(rendered);
    const glides = s.playbackRate.events.filter((e) => e[0] === 'target');
    expect(glides.length).toBe(60);
    for (const [, , t, c] of glides) {
      expect(c).toBeGreaterThanOrEqual(0.02);
      expect(c).toBeLessThanOrEqual(0.05);
      expect(t).toBeGreaterThan(0);
    }
    expect(glides[59][1]).toBeCloseTo(0.7 + 0.9 * speed(60), 9);
    // the gain glides the same way, at the loop's own level
    const gains = s.out!.gain.events.filter((e) => e[0] === 'target');
    expect(gains[gains.length - 1][1]).toBeCloseTo(foleyLevel('scrape_metal') * speed(60), 9);
    // kept to what the loops are made for; not given, back to 1 (as the gain is)
    const lastRate = (): number => s.playbackRate.events[s.playbackRate.events.length - 1][1];
    f.start('scrape_metal', { rate: 5 });
    expect(lastRate()).toBe(2);
    f.start('scrape_metal', { rate: 0.1 });
    expect(lastRate()).toBe(0.5);
    f.start('scrape_metal', { rate: Number.NaN });
    expect(lastRate()).toBe(1);
    f.start('scrape_metal', { rate: 1.3 });
    f.start('scrape_metal', {});
    expect(lastRate()).toBe(1);
    expect(sources.length).toBe(1);
    // let go and begun again: a new source on the same rendering, at its new rate from the start
    f.stop('scrape_metal');
    f.start('scrape_metal', { gain: 1, rate: 1.6 });
    expect(sources.length).toBe(2);
    expect(sources[1].buffer).toBe(s.buffer);
    expect(made.length).toBe(rendered);
    expect(sources[1].playbackRate.events[0]).toEqual(['set', 1.6, ctx.currentTime]);
    // a loop that is not a scrub keeps playing at its own pitch
    f.start('ratchet');
    f.start('ratchet', { gain: 0.5 });
    expect(sources[2].playbackRate.events.map((e) => e[1])).toEqual([1, 1]);
    // the glass scrape's squeal follows the rate half way (a tone swept an octave every stroke is a slide whistle); the rest all the way
    f.start('scrape_glass', { gain: 1, rate: 1.6 });
    f.start('scrape_glass', { gain: 1, rate: 0.7 });
    expect(sources[3].playbackRate.events.map((e) => e[1])).toEqual([loopPlaybackRate('scrape_glass', 1.6), loopPlaybackRate('scrape_glass', 0.7)]);
    expect(loopPlaybackRate('scrape_glass', 1.6)).toBeCloseTo(1.3, 9);
    expect(loopPlaybackRate('scrape_glass', 0.7)).toBeCloseTo(0.85, 9);
    for (const k of SCRUB_LOOPS) if (k !== 'scrape_glass') expect([loopPlaybackRate(k, 0.7), loopPlaybackRate(k, 1.6)], k).toEqual([0.7, 1.6]);
  });

  it('keys the blade catch by its surface, and nothing else by it', () => {
    const { ctx, sources } = keptContext(sr);
    const f = new Foley(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode);
    const played = (kind: FoleyShot, o: FoleyOpts, n = 24): Set<unknown> => {
      const a = sources.length;
      for (let k = 0; k < n; k++) f.play(kind, o);
      return new Set(sources.slice(a).map((s) => s.buffer));
    };
    const by = SURFACES.map((surface) => played('scrape_start', { surface }));
    by.forEach((b, i) => expect(b.size, SURFACES[i]).toBe(4));
    // no surface given: the metal's recipe, under a key of its own
    const plain = played('scrape_start', {});
    const sets = [...by, plain];
    for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) for (const b of sets[i]) expect(sets[j].has(b), `${i} ${j}`).toBe(false);
    // the same surface again (a gain given): the same renderings
    for (const b of played('scrape_start', { surface: 'rust', gain: 0.4 })) expect(by[2].has(b)).toBe(true);
    // a surface given to anything else changes nothing: a loop keeps its rendering (and is not restarted), a shot its renderings
    f.start('scrape_glass');
    const live = sources.length;
    f.start('scrape_glass', { surface: 'mud', gain: 0.5, rate: 1.2 });
    expect(sources.length).toBe(live);
    const loopBuf = sources[live - 1].buffer;
    f.stop('scrape_glass');
    f.start('scrape_glass', { surface: 'rust' });
    expect(sources[sources.length - 1].buffer).toBe(loopBuf);
    const ding = played('clean_ding', {}, 12);
    for (const b of played('clean_ding', { surface: 'glass' }, 12)) expect(ding.has(b)).toBe(true);
  });

  it('plays the chimes in tune and at their own level; the other shots keep their variation', () => {
    const { ctx, sources } = keptContext(sr);
    const f = new Foley(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode);
    for (const kind of CHIMES) {
      for (let k = 0; k < 6; k++) f.play(kind, { gain: 0.5 });
      for (const s of sources.splice(0)) {
        expect(s.playbackRate.value, kind).toBe(1);
        expect(s.out!.gain.value, kind).toBeCloseTo(foleyLevel(kind) * 0.5, 12);
      }
    }
    for (let k = 0; k < 12; k++) f.play('flake_drop');
    expect(new Set(sources.map((s) => s.playbackRate.value)).size).toBeGreaterThan(6);
    expect(new Set(sources.map((s) => s.out!.gain.value)).size).toBeGreaterThan(6);
    // eight renderings of the flakes, never the same twice running; three of the ding, one of each tune
    for (let k = 1; k < sources.length; k++) expect(sources[k].buffer).not.toBe(sources[k - 1].buffer);
    sources.length = 0;
    for (let k = 0; k < 64; k++) f.play('flake_drop');
    expect(new Set(sources.map((s) => s.buffer)).size).toBe(8);
    const count = (kind: FoleyShot): number => {
      sources.length = 0;
      for (let k = 0; k < 24; k++) f.play(kind);
      return new Set(sources.map((s) => s.buffer)).size;
    };
    expect(count('clean_ding')).toBe(3);
    expect(count('clean_rust_done')).toBe(1);
    expect(count('clean_car_done')).toBe(1);
    expect(count('highlight_ping')).toBe(1);
    expect(count('tool_worn')).toBe(3);
  });
});

// ------------------------------------------------------------------ spray paint (Batch 6)

const SPRAY_SHOTS: readonly FoleyShot[] = ['spray_rattle', 'spray_start', 'spray_sputter', 'paint_done'];

describe('ModCar spray-paint foley', () => {
  const sr = 48000;
  const render = (kind: FoleyShot | FoleyLoop, seed = 1234): Float32Array => recipe(kind)(sr, new Rng(seed));
  /** seeds spread over the whole range (a small one's first draw is small, and a recipe's first choice with it) */
  const mixed = (s: number): number => Math.imul(s, 2654435761) | 0;
  const rmsOf = (x: Float32Array, a: number, b: number): number => {
    let e = 0;
    const i0 = Math.floor(a * sr);
    const i1 = Math.min(x.length, Math.floor(b * sr));
    for (let i = i0; i < i1; i++) e += x[i] * x[i];
    return Math.sqrt(e / Math.max(1, i1 - i0));
  };
  /** a player on a stand-in context: the renderings it makes itself (its own seeds), and what it plays */
  const player = (): { f: Foley; sources: KeptSource[]; made: (kind: FoleyShot | FoleyLoop) => Float32Array[] } => {
    const { ctx, made, sources } = keptContext(sr);
    const f = new Foley(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode);
    return {
      f,
      sources,
      made: (kind) => {
        const a = made.length;
        f.warm([kind]);
        return made.slice(a);
      },
    };
  };
  /** dips in the first 80 ms: a 2 ms window under 55 % of the mean of those 4 ms either side of it */
  const dips = (x: Float32Array): number => {
    const w = 0.002;
    const lv: number[] = [];
    for (let t = 0.008; t + w <= 0.08; t += w) lv.push(rmsOf(x, t, t + w));
    let count = 0;
    for (let k = 2; k < lv.length - 2; k++) if (lv[k] < 0.55 * 0.5 * (lv[k - 2] + lv[k + 2])) count++;
    return count;
  };
  /** the main knocks of a rattle: 2 ms windows over a quarter of its loudest, 60 ms or more apart (the bounces are closer) */
  const knocks = (x: Float32Array): number[] => {
    const w = Math.floor(0.002 * sr);
    const env: number[] = [];
    for (let o = 0; o + w <= x.length; o += w) {
      let e = 0;
      for (let i = o; i < o + w; i++) e += x[i] * x[i];
      env.push(Math.sqrt(e / w));
    }
    const max = Math.max(...env);
    const at: number[] = [];
    env.forEach((v, k) => {
      const t = (k * w) / sr;
      if (v > 0.25 * max && (at.length === 0 || t - at[at.length - 1] >= 0.06)) at.push(t);
    });
    return at;
  };

  it('has the spray sounds in the catalogue, with levels, and keeps the older spray and shake as they were', () => {
    for (const k of [...SPRAY_SHOTS, 'spray_hiss'] as const) {
      expect([...FOLEY_SHOTS, ...FOLEY_LOOPS] as string[], k).toContain(k);
      expect(foleyLevel(k), k).toBeGreaterThan(0);
      expect(foleyLevel(k), k).toBeLessThanOrEqual(1);
    }
    // (other code may use them)
    expect(foleyLevel('spray')).toBe(0.45);
    expect(foleyLevel('spray_shake')).toBe(0.45);
    expect(render('spray').length / sr).toBeCloseTo(1.95, 2);
    expect(render('spray_shake').length / sr).toBeCloseTo(0.7, 2);
  });

  it('renders every spray shot non-silent and unclipped at its level, from silence to silence, for any seed', () => {
    for (const kind of SPRAY_SHOTS) {
      for (const seed of [1, 1234, 777, mixed(5)]) {
        const x = render(kind, seed);
        const tag = `${kind} seed ${seed}`;
        let bad = 0;
        let dc = 0;
        for (const v of x) {
          if (!Number.isFinite(v)) bad++;
          dc += v;
        }
        expect(bad, tag).toBe(0);
        const s = measure(x, sr);
        expect(s.peak * foleyLevel(kind) * 1.08, tag).toBeLessThan(1);
        expect(s.rms, tag).toBeGreaterThan(0.003);
        expect(Math.abs(x[0]), tag).toBeLessThan(1e-3);
        expect(Math.abs(x[x.length - 1]), tag).toBeLessThan(1e-3);
        expect(Math.abs(dc / x.length), tag).toBeLessThan(0.01 * s.peak);
      }
    }
  });

  it('lasts as long as the brief says', () => {
    const len = (k: FoleyShot): number => render(k).length / sr;
    expect(len('spray_rattle')).toBeGreaterThan(0.7);
    expect(len('spray_rattle')).toBeLessThan(0.95);
    expect(len('spray_start')).toBeGreaterThan(0.1);
    expect(len('spray_start')).toBeLessThan(0.2);
    expect(len('spray_sputter')).toBeGreaterThan(0.6);
    expect(len('spray_sputter')).toBeLessThan(0.85);
    expect(len('paint_done')).toBeGreaterThan(0.5);
    expect(len('paint_done')).toBeLessThan(0.7);
  });

  it('rattles the can: five to seven clacks, never quite evenly, each ringing the tin', () => {
    const counts = new Set<number>();
    for (let s = 1; s <= 16; s++) {
      const x = render('spray_rattle', mixed(s));
      const k = knocks(x);
      expect(k.length, `seed ${s}`).toBeGreaterThanOrEqual(5);
      expect(k.length, `seed ${s}`).toBeLessThanOrEqual(7);
      counts.add(k.length);
      // a hand shaking it: the gaps between the clacks never all alike
      const gaps = k.slice(1).map((t, i) => t - k[i]);
      const mean = gaps.reduce((p, q) => p + q, 0) / gaps.length;
      const sd = Math.sqrt(gaps.reduce((p, q) => p + (q - mean) ** 2, 0) / gaps.length);
      expect(sd / mean, `seed ${s}`).toBeGreaterThan(0.005);
      // the tin: nearly all of it in its shell modes' range, its strongest at one of them
      const P = powerOf(x);
      expect(shareOf(P, sr, 1000, 6000), `seed ${s}`).toBeGreaterThan(0.85);
      const top = peaksOf(P, sr, 1000, 6000, 1)[0];
      expect(Math.min(...[1180, 1720, 2380, 3150, 4060, 5240].map((f) => Math.abs(top / f - 1))), `seed ${s}: ${top} Hz`).toBeLessThan(0.06);
    }
    expect(counts.size).toBeGreaterThan(1);
    // the player's own three renderings: 5, 6 and 7 clacks
    expect(
      player()
        .made('spray_rattle')
        .map((x) => knocks(x).length)
        .sort((a, b) => a - b),
    ).toEqual([5, 6, 7]);
  });

  it(
    'hisses steadily, as a pressurised can does: seamless, with more body than the old spray, the tin ringing faintly in it',
    () => {
      const old = powerOf(render('spray'));
      for (const seed of [1234, 99]) {
        const x = render('spray_hiss', seed);
        const tag = `seed ${seed}`;
        expectSeamless(x, sr, tag);
        // steady: no pulsing (a little fizz in it, but its level holds from one 50 ms to the next)
        expect(textureOf(x, sr).cv50, tag).toBeLessThan(0.15);
        const P = powerOf(x);
        expect(centroidOf(P, sr), tag).toBeGreaterThan(4500);
        expect(centroidOf(P, sr), tag).toBeLessThan(7500);
        // a body under it, which the old spray has not
        expect(shareOf(P, sr, 0, 2000), tag).toBeGreaterThan(Math.max(0.04, 4 * shareOf(old, sr, 0, 2000)));
        expect(shareOf(P, sr, 0, 2000), tag).toBeLessThan(0.2);
        // the can's tin: its two lowest rings stand out of the hiss
        const tin = peaksOf(P, sr, 1500, 4500, 4);
        for (const f of [1850, 2950]) expect(Math.min(...tin.map((p) => Math.abs(p / f - 1))), `${tag} ${f}: ${tin}`).toBeLessThan(0.03);
      }
    },
    30_000,
  );

  it('opens the valve with a short pssht over the hiss easing in, then is the hiss', () => {
    // a press as the player plays it: the loop easing in (time constant 0.03 s), the valve at its level on top
    const p = player();
    const hiss = p.made('spray_hiss')[0];
    const valves = p.made('spray_start');
    expect(valves.length).toBe(3);
    const L = foleyLevel('spray_hiss');
    const S = foleyLevel('spray_start');
    for (const [v, shot] of valves.entries()) {
      const n = Math.floor(0.4 * sr);
      const y = new Float32Array(n);
      const off = 9000 * (v + 1);
      for (let i = 0; i < n; i++) y[i] = L * (1 - Math.exp(-i / sr / 0.03)) * hiss[(off + i) % hiss.length] + (i < shot.length ? S * shot[i] : 0);
      const steady = rmsOf(y, 0.25, 0.4);
      const db = (a: number, b: number): number => 20 * Math.log10(rmsOf(y, a, b) / steady);
      // the pssht: a few dB over the hiss, at once
      const onset = Math.max(db(0.005, 0.015), db(0.01, 0.02), db(0.015, 0.025));
      expect(onset, `valve ${v}`).toBeGreaterThan(2);
      expect(onset, `valve ${v}`).toBeLessThan(7);
      // then the hiss's own level: no hole while the loop eases in under it, no second push
      for (let t = 0.04; t < 0.24; t += 0.01) {
        expect(db(t, t + 0.01), `valve ${v} at ${t.toFixed(2)} s`).toBeGreaterThan(-3);
        expect(db(t, t + 0.01), `valve ${v} at ${t.toFixed(2)} s`).toBeLessThan(3);
      }
      // the sputter in its first hundredths: the rush catches and lets go (where the steady hiss never dips so)
      expect(dips(shot), `valve ${v}`).toBeGreaterThanOrEqual(1);
    }
    expect(dips(hiss)).toBe(0);
  });

  it('runs dry: going on from the hiss a little weaker, coughing in fits, darker, out to nothing', () => {
    const hiss = render('spray_hiss');
    const hissRms = rmsOf(hiss, 0, hiss.length / sr) * foleyLevel('spray_hiss');
    for (const seed of [1, 2, 3, mixed(7)]) {
      const x = render('spray_sputter', seed);
      const tag = `seed ${seed}`;
      const begin = (rmsOf(x, 0.01, 0.07) * foleyLevel('spray_sputter')) / hissRms;
      expect(begin, tag).toBeGreaterThan(0.7);
      expect(begin, tag).toBeLessThan(1.1);
      // the fits: it drops out at least three times between them (5 ms windows)
      const w = 0.005;
      const lv: number[] = [];
      for (let t = 0.1; t < 0.6; t += w) lv.push(rmsOf(x, t, t + w));
      const loudest = Math.max(...lv);
      let drops = 0;
      for (let k = 1; k < lv.length; k++) if (lv[k] < 0.15 * loudest && lv[k - 1] >= 0.15 * loudest) drops++;
      expect(drops, tag).toBeGreaterThanOrEqual(3);
      // darker as the pressure goes
      const c0 = centroidOf(powerOf(x, 0, Math.floor(0.1 * sr) + 4096), sr);
      const c1 = centroidOf(powerOf(x, Math.floor(0.3 * sr), Math.floor(0.7 * sr)), sr);
      expect(c1, tag).toBeLessThan(0.85 * c0);
      // and nothing at the end
      expect(rmsOf(x, x.length / sr - 0.08, x.length / sr), tag).toBeLessThan(0.03 * rmsOf(x, 0, 0.1));
    }
  });

  it('finishes a coat with a soft two-note shimmer: G6 then B6, no strike, in tune and a little under the ding', () => {
    const ding = render('clean_ding');
    const peakWindow = (x: Float32Array): number => {
      let m = 0;
      for (let t = 0; t < 0.3; t += 0.005) m = Math.max(m, rmsOf(x, t, t + 0.01));
      return m;
    };
    for (const seed of [1234, 99]) {
      const x = render('paint_done', seed);
      const first = peaksOf(powerOf(x, 0, 4096), sr, 300, 8000, 1)[0];
      const second = peaksOf(powerOf(x, Math.floor(0.12 * sr), Math.floor(0.4 * sr)), sr, 300, 8000, 1)[0];
      expect(Math.abs(first / 1567.98 - 1), `${first} Hz`).toBeLessThan(0.015);
      expect(Math.abs(second / 1975.53 - 1), `${second} Hz`).toBeLessThan(0.015);
      // (G and B: the key of the cleaning chimes, and not the ding's D)
      for (const f of [first, second]) expect(Math.abs(f / 1174.66 - 1)).toBeGreaterThan(0.1);
      // it swells in where the ding is struck
      expect(rmsOf(x, 0, 0.005) / peakWindow(x)).toBeLessThan(0.3);
      expect(rmsOf(ding, 0, 0.005) / peakWindow(ding)).toBeGreaterThan(0.5);
      // and has died away by its end
      expect(rmsOf(x, x.length / sr - 0.04, x.length / sr)).toBeLessThan(0.05 * peakWindow(x));
    }
    // its three renderings as loud as one another, a little under the ding; played at its own pitch and level
    const p = player();
    const coat = p.made('paint_done');
    expect(coat.length).toBe(3);
    for (let k = 0; k < 6; k++) p.f.play('paint_done', { gain: 0.8 });
    for (const s of p.sources) {
      expect(s.playbackRate.value).toBe(1);
      expect(s.out!.gain.value).toBeCloseTo(foleyLevel('paint_done') * 0.8, 12);
    }
    const loud = coat.map((x) => kLoudness(x.map((v) => v * foleyLevel('paint_done')), sr, false));
    expect(Math.max(...loud) - Math.min(...loud)).toBeLessThan(1);
    const dings = p.made('clean_ding').map((x) => kLoudness(x.map((v) => v * foleyLevel('clean_ding')), sr, false));
    for (const l of loud) {
      expect(l).toBeLessThan(Math.min(...dings) - 0.5);
      expect(l).toBeGreaterThan(Math.max(...dings) - 4);
    }
  });

  it('sits in the mix at full gain: the hiss as loud as the scrapes, the shake a little under it', () => {
    const p = player();
    const loopLoud = (k: FoleyLoop): number => kLoudness(p.made(k)[0].map((v) => v * foleyLevel(k)), sr, true);
    const hiss = loopLoud('spray_hiss');
    const scrapes = SCRAPES.map(loopLoud);
    const mean = scrapes.reduce((a, b) => a + b, 0) / scrapes.length;
    expect(Math.abs(hiss - mean)).toBeLessThan(1.5);
    for (const x of p.made('spray_rattle')) {
      const l = kLoudness(x.map((v) => v * foleyLevel('spray_rattle')), sr, false);
      expect(l).toBeLessThan(hiss - 0.5);
      expect(l).toBeGreaterThan(hiss - 5);
    }
  });
});
