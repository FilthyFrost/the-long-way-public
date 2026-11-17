/**
 * ModCar sound checks (Node, no browser): the engine banks are complete and consistent (every
 * manifest entry has its files in both formats, the containers decode to the lengths the loop
 * points assume, rpm steps cover idle to redline within the pitch budget, seams measured clean when
 * the bank was built), the mixing maths behaves, and every foley recipe renders sane audio. The
 * workshop generator (gen_d1) is a bank of its own kind: a few loops round its governed speed, no
 * rev limiter, started on a rope (pullStart). The decoded, played-back seam check and the voice's
 * pull start (no starter whine, no solenoid clicks) are in harness/audio/modcar_render.mjs (Chrome).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blendWeights, healLoop, loadMix, loopGain, engineTone, rpmWeights, popSample, blowOffSample, rodKnockSample, solenoidSample, type BankManifest, type LoopRec } from '../../src/game/modcar/engineAudio';
import { Foley, recipe, foleyLevel, FOLEY_LOOPS, FOLEY_SHOTS, type FoleyLoop, type FoleyOpts, type FoleyShot, type GrindMaterial } from '../../src/game/modcar/foley';
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
