/**
 * ModCar sound checks (Node, no browser): the engine banks are complete and consistent (every
 * manifest entry has its files in both formats, the containers decode to the lengths the loop
 * points assume, rpm steps cover idle to redline within the pitch budget, seams measured clean when
 * the bank was built), the mixing maths behaves, and every foley recipe renders sane audio.
 * The decoded, played-back seam check is in harness/audio/modcar_render.mjs --loops (Chrome).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blendWeights, healLoop, loadMix, loopGain, engineTone, rpmWeights, popSample, blowOffSample, rodKnockSample, solenoidSample, type BankManifest, type LoopRec } from '../../src/game/modcar/engineAudio';
import { recipe, FOLEY_LOOPS, FOLEY_SHOTS, type FoleyLoop, type FoleyShot } from '../../src/game/modcar/foley';
import { Rng, measure } from '../../src/game/modcar/synth';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BANKS = path.join(ROOT, 'public', 'audio', 'modcar', 'engines');
const ENGINES = ['eng_mower', 'eng_single', 'eng_2t', 'eng_i4', 'eng_i4d', 'eng_flat6', 'eng_v8', 'eng_d6'];
// MODCAR.md 2.3: the redline of every engine
const REDLINE: Record<string, number> = { eng_mower: 3600, eng_single: 9000, eng_2t: 9500, eng_i4: 6200, eng_i4d: 4400, eng_flat6: 7200, eng_v8: 6000, eng_d6: 2800 };

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

      it('covers idle to past the redline at both loads, within the pitch budget', () => {
        expect(m.redlineRpm).toBe(REDLINE[id]);
        for (const load of [0, 1]) {
          const ls = m.loops.filter((l) => l.load === load).sort((a, b) => a.rpm - b.rpm);
          expect(ls.length).toBeGreaterThanOrEqual(7);
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
        for (const shot of ['crank', 'catch', 'shutdown', 'stall', 'limiter']) expect(m.oneshots[shot], `${id} ${shot}`).toBeDefined();
      });

      it('measured clean seams when the bank was built', () => {
        for (const e of [...m.loops, m.oneshots.crank, m.oneshots.limiter] as unknown as Array<Record<string, number>>) {
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
        expect(loopGain(tone, top, m.idleRpm, m.redlineRpm)).toBeGreaterThan(loopGain(tone, idle, m.idleRpm, m.redlineRpm) * 2.5);
        for (const r of on) {
          const off = m.loops.find((l) => l.load === 0 && l.rpm === r.rpm && !l.idle);
          if (off) expect(loopGain(tone, off, m.idleRpm, m.redlineRpm), `${id} ${r.file}`).toBeLessThan(loopGain(tone, r, m.idleRpm, m.redlineRpm) * 1.05);
        }
      });
    });
  }
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

describe('ModCar foley recipes', () => {
  const sr = 48000;
  const render = (kind: FoleyShot | FoleyLoop, o = {}): Float32Array => recipe(kind, o)(sr, new Rng(1234));

  it('renders every sound: finite, audible, no clipping', () => {
    const variants: Array<[FoleyShot | FoleyLoop, object]> = [
      ...FOLEY_SHOTS.map((k) => [k, {}] as [FoleyShot, object]),
      ...FOLEY_LOOPS.map((k) => [k, {}] as [FoleyLoop, object]),
      ...(['metal', 'rusty', 'armor', 'cage', 'fridge'] as const).flatMap((material) => [['door_open', { material }], ['door_close', { material }]] as Array<[FoleyShot, object]>),
      ...(['fuel', 'water', 'oil'] as const).map((liquid) => ['pour', { liquid }] as [FoleyLoop, object]),
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
