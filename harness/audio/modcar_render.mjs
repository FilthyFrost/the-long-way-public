// ModCar sound render harness: renders the engine banks and the foley through the real
// EngineVoice / Foley code in headless Chrome with OfflineAudioContext (nothing reaches a speaker;
// Chrome also runs with --mute-audio), writes WAVs and prints levels and spectral centroids.
//
//   node harness/audio/modcar_render.mjs [engines...] [--foley] [--loops] [--variants] [--all]
//
// WAVs go to $MODCAR_AUDIO_OUT (default D:/modcar-scratch/sound/out); the summary is written there
// as report.json and, compactly, to loop/metrics/audio_modcar.json. Exit code 1 if a loop clicks.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, startServer } from '../shots/lib.mjs';

const ENGINES = ['eng_mower', 'eng_single', 'eng_2t', 'eng_i4', 'eng_i4d', 'eng_flat6', 'eng_v8', 'eng_d6'];
const OUT = process.env.MODCAR_AUDIO_OUT || 'D:/modcar-scratch/sound/out';
const args = process.argv.slice(2);
const all = args.includes('--all');
const doFoley = all || args.includes('--foley');
const doLoops = all || args.includes('--loops');
const doVariants = all || args.includes('--variants');
const doSweep = all || args.includes('--sweep');
const named = args.filter((a) => !a.startsWith('--'));
const engines = named.length ? named : all || (!doFoley && !doLoops && !doVariants && !doSweep) ? ENGINES : [];

// ---------------------------------------------------------------- analysis

function fromBase64(b64) {
  const b = Buffer.from(b64, 'base64');
  const x = new Float32Array(b.length / 2);
  for (let i = 0; i < x.length; i++) x[i] = b.readInt16LE(2 * i) / 32768;
  return x;
}

function writeWav(file, x, sr) {
  const n = x.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + 2 * i);
  fs.writeFileSync(file, buf);
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** rms (dBFS), peak (dBFS), spectral centroid (Hz) and the share of energy above 2 kHz, over [a, b) seconds */
function stats(x, sr, a = 0, b = x.length / sr) {
  const s = Math.max(0, Math.floor(a * sr));
  const e = Math.min(x.length, Math.floor(b * sr));
  let sum = 0;
  let peak = 0;
  for (let i = s; i < e; i++) {
    sum += x[i] * x[i];
    peak = Math.max(peak, Math.abs(x[i]));
  }
  const N = 4096;
  let num = 0;
  let den = 0;
  let hi = 0;
  for (let o = s; o + N <= e; o += N) {
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[o + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      const f = (k * sr) / N;
      num += p * f;
      den += p;
      if (f > 2000) hi += p;
    }
  }
  const db = (v) => (v > 0 ? 20 * Math.log10(v) : -120);
  return { rms: +db(Math.sqrt(sum / Math.max(1, e - s))).toFixed(1), peak: +db(peak).toFixed(1), centroid: den ? Math.round(num / den) : 0, hf: den ? +(hi / den).toFixed(3) : 0 };
}

// tour segments (seconds, see harness/audio/render.ts)
const SEGMENTS = { crank: [0.2, 1.2], idle: [2.6, 3.9], blip: [4.3, 4.9], pull_low: [7.4, 8.4], pull_high: [9.6, 10.5], limiter: [10.6, 11.05], second: [12.5, 14.3], overrun: [15.0, 18.0], off: [20.6, 21.8] };

// ---------------------------------------------------------------- run

const t0 = Date.now();
fs.mkdirSync(OUT, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
const report = { engines: {}, variants: {}, foley: {}, loops: {} };
let failed = false;
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(`${url}/harness/audio/render.html`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => window.__modcarAudio && window.__modcarAudio.ready, null, { timeout: 120_000 });

  const render = async (spec, name) => {
    const r = await page.evaluate((s) => window.__modcarAudio.renderEngine(s), spec);
    const x = fromBase64(r.pcm);
    writeWav(path.join(OUT, `${name}.wav`), x, r.sampleRate);
    const seg = {};
    for (const [k, [a, b]] of Object.entries(SEGMENTS)) seg[k] = stats(x, r.sampleRate, a, b);
    return { all: stats(x, r.sampleRate), seg, debug: r.debug };
  };

  for (const id of engines) {
    const res = await render({ engineId: id, sequence: 'tour' }, `${id}_tour`);
    report.engines[id] = res.seg;
    const s = res.seg;
    console.log(
      `${id.padEnd(10)} idle ${s.idle.rms} dB/${s.idle.centroid} Hz  pull ${s.pull_low.rms}/${s.pull_low.centroid} -> ${s.pull_high.rms}/${s.pull_high.centroid}  lim ${s.limiter.rms}  overrun ${s.overrun.rms}/${s.overrun.centroid}  crank ${s.crank.rms}  off ${s.off.rms}  peak ${res.all.peak}`,
    );
  }

  if (doSweep) {
    // a slow full-load sweep and overrun: the level should glide, not step, between loops
    for (const id of ENGINES) {
      const r = await page.evaluate((s) => window.__modcarAudio.renderEngine(s), { engineId: id, sequence: 'sweep' });
      const x = fromBase64(r.pcm);
      writeWav(path.join(OUT, `${id}_sweep.wav`), x, r.sampleRate);
      const rough = (a, b) => {
        const w = Math.floor(0.05 * r.sampleRate);
        const lv = [];
        for (let o = Math.floor(a * r.sampleRate); o + w <= Math.floor(b * r.sampleRate); o += w) {
          let e = 0;
          for (let i = 0; i < w; i++) e += x[o + i] * x[o + i];
          lv.push(10 * Math.log10(e / w + 1e-12));
        }
        // against a 0.5 s moving average: the wobble that is not the overall rise
        let worst = 0;
        let sum = 0;
        for (let i = 0; i < lv.length; i++) {
          const lo = Math.max(0, i - 5);
          const hi = Math.min(lv.length, i + 6);
          let m = 0;
          for (let k = lo; k < hi; k++) m += lv[k];
          m /= hi - lo;
          const d = Math.abs(lv[i] - m);
          worst = Math.max(worst, d);
          sum += d * d;
        }
        return { rms: +Math.sqrt(sum / Math.max(1, lv.length)).toFixed(2), worst: +worst.toFixed(2) };
      };
      const on = rough(0.3, 7.9);
      const off = rough(8.4, 15.8);
      report.sweeps = report.sweeps || {};
      report.sweeps[id] = { on, off };
      console.log(`sweep ${id.padEnd(10)} full load wobble ${on.rms} dB (worst ${on.worst})   overrun wobble ${off.rms} dB (worst ${off.worst})`);
    }
  }

  if (doVariants) {
    const variants = [
      ['eng_v8', { exhaustId: 'exh_sport' }, 'v8_sport'],
      ['eng_v8', { exhaustId: 'exh_side' }, 'v8_side'],
      ['eng_v8', { exhaustId: null }, 'v8_open'],
      ['eng_v8', { inside: true, doorsOpen: 0 }, 'v8_inside'],
      ['eng_v8', { inside: true, doorsOpen: 1 }, 'v8_inside_nodoors'],
      ['eng_i4', { turbo: true }, 'i4_turbo'],
      ['eng_i4d', { turbo: true }, 'i4d_turbo'],
      ['eng_flat6', { exhaustId: 'exh_sport' }, 'flat6_sport'],
      ['eng_2t', { exhaustId: 'exh_side' }, '2t_side'],
    ];
    for (const [id, extra, name] of variants) {
      const res = await render({ engineId: id, sequence: 'tour', ...extra }, name);
      report.variants[name] = res.seg;
      const s = res.seg;
      const last = res.debug[res.debug.length - 1] || {};
      console.log(`${name.padEnd(18)} idle ${s.idle.rms}/${s.idle.centroid}  pull_high ${s.pull_high.rms}/${s.pull_high.centroid} hf ${s.pull_high.hf}  overrun ${s.overrun.rms}/${s.overrun.centroid}  pops ${last.popsFired ?? '?'} bov ${last.bovFired ?? '?'}`);
    }
  }

  if (doFoley) {
    const list = [
      ['door_open', { material: 'metal' }], ['door_close', { material: 'metal' }], ['door_close', { material: 'rusty' }], ['door_close', { material: 'armor' }],
      ['door_open', { material: 'fridge' }], ['door_close', { material: 'fridge' }], ['door_open', { material: 'cage' }], ['door_close', { material: 'cage' }],
      ['latch', {}], ['hood_open', {}], ['hood_close', {}], ['trunk_open', {}], ['trunk_close', {}],
      ['part_pickup', { mass: 0.3 }], ['part_pickup', { mass: 20 }], ['part_setdown', { mass: 0.3 }], ['part_setdown', { mass: 4 }], ['part_setdown', { mass: 25 }], ['part_setdown', { mass: 235 }],
      ['part_install', { mass: 10 }], ['part_remove', { mass: 10 }], ['key_turn', {}], ['handbrake_pull', {}], ['handbrake_release', {}], ['gear_shift', {}], ['gear_grind', {}], ['spray_shake', {}],
      ['horn_trumpet', {}], ['ratchet', {}], ['spray', {}], ['sponge', {}], ['pour', { liquid: 'fuel' }], ['pour', { liquid: 'water' }], ['pour', { liquid: 'oil' }], ['horn_beep', {}], ['horn_air', {}],
    ];
    for (const [kind, opts] of list) {
      const r = await page.evaluate((s) => window.__modcarAudio.renderFoley(s), { kind, opts, hold: 2.5 });
      const x = fromBase64(r.pcm);
      const tag = [kind, opts.material, opts.mass !== undefined ? `${opts.mass}kg` : null, opts.liquid].filter(Boolean).join('_');
      writeWav(path.join(OUT, `foley_${tag}.wav`), x, r.sampleRate);
      const st = stats(x, r.sampleRate);
      report.foley[tag] = st;
      console.log(`foley ${tag.padEnd(26)} rms ${st.rms} dB  peak ${st.peak} dB  centroid ${st.centroid} Hz  hf ${st.hf}`);
    }
  }

  if (doLoops) {
    for (const id of ENGINES) {
      for (const sr of [48000, 44100]) {
        const res = await page.evaluate(([e, s]) => window.__modcarAudio.checkLoops(e, s), [id, sr]);
        const worst = res.reduce((a, b) => (b.ratio > a.ratio ? b : a), { ratio: 0, file: '' });
        report.loops[`${id}@${sr}`] = { worst: +worst.ratio.toFixed(2), file: worst.file, count: res.length };
        const bad = res.filter((r) => r.ratio > 2.0);
        if (bad.length) failed = true;
        console.log(`loops ${id}@${sr}: ${res.length} checked, worst seam ${worst.ratio.toFixed(2)} (${worst.file})${bad.length ? `  CLICK: ${bad.map((b) => b.file).join(' ')}` : ''}`);
      }
    }
  }
  if (errors.length) {
    console.log('page errors:\n  ' + errors.join('\n  '));
    failed = true;
  }
} finally {
  await browser.close();
  await server.close();
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
const metricsFile = path.join(ROOT, 'loop', 'metrics', 'audio_modcar.json');
const compact = {};
for (const [id, s] of Object.entries(report.engines)) compact[id] = { idle_db: s.idle.rms, pull_high_db: s.pull_high.rms, overrun_db: s.overrun.rms, idle_hz: s.idle.centroid, pull_high_hz: s.pull_high.centroid };
for (const [k, v] of Object.entries(report.loops)) compact[`loops_${k}`] = v.worst;
if (Object.keys(compact).length) {
  let prev = {};
  try {
    prev = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
  } catch {
    /* first run */
  }
  fs.writeFileSync(metricsFile, JSON.stringify({ ...prev, ...compact }, null, 1) + '\n');
}
console.log(`wrote ${OUT} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
process.exit(failed ? 1 : 0);
