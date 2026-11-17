// ModCar sound render harness: renders the engine banks and the foley through the real
// EngineVoice / Foley code in headless Chrome with OfflineAudioContext (nothing reaches a speaker;
// Chrome also runs with --mute-audio), writes WAVs and prints levels and spectral centroids.
//
//   node harness/audio/modcar_render.mjs [engines...] [--foley] [--loops] [--variants] [--workshop] [--scrub] [--spray] [--road] [--places] [--tyres] [--all] [--no-metrics]
//
// Vehicle engines render the 'tour'; the generator (gen_d1) renders its own sequence instead: two
// pulls on the rope (the second catches), running light with the governor hunting, the recycler's
// load, light again, switched off; plus running dry, and two checks of its pull start (no starter
// motor to hear, a flat battery changes nothing). --loops checks the engines named, else all.
// --workshop renders the workshop scene (the generator and the workshop foley together) as a mix check.
// --scrub renders scrubbing as the game drives it (every frame a gain and a rate from the tool's speed,
// the blade's catch at each stroke, flakes, the chimes) and checks each scrub loop: unclipped, silent once
// let go, no step added by a rate changing every frame, a fast stroke heard brighter than a slow one.
// --spray renders spray painting as the game drives it (the can shaken, pressed, held, let go, pressed
// again, the coat done, the can run dry) and checks the valve's pssht into the hiss and the quiet after.
// --road renders tyres and wrecks as the game drives them (a blowout, the flat driven on, its rate from
// the speed every frame, the bare rim, two wrecks forced open, a small and a golden find, the walk up to a
// rare part) and checks the flap keeping time with the wheel, the rate gliding, the glint heard only near.
// --places renders the roadside places as the game drives them (five containers searched, two found empty,
// a house's door and a shop's with its bell, the pump filling a tank until it clicks off and a can until it
// runs dry) and checks each search busy all through, silent once let go, the bell's notes, the pump's flow.
// --tyres renders the tyres on the road as the game drives them (asphalt at 30 and 100 km/h, the road
// getting wet, a door shut and opened, gravel, a hard stop on locked wheels, a slide on gravel, ice) and
// checks a faster roll brighter, its rate gliding with no step, wet louder and brighter, a cutoff given to a
// playing loop muffling its top and not its body, with no click as it comes and goes, the squeal a tone,
// ice quiet, silence after.
// WAVs go to $MODCAR_AUDIO_OUT (default D:/modcar-scratch/sound/out); the summary is written there
// as report.json and, compactly, to loop/metrics/audio_modcar.json (not with --no-metrics).
// Exit code 1 if a loop clicks or a check fails.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, startServer } from '../shots/lib.mjs';

const ENGINES = ['eng_mower', 'eng_single', 'eng_2t', 'eng_i4', 'eng_i4d', 'eng_flat6', 'eng_v8', 'eng_d6'];
/** machines that are not driven: their own sequence, not the tour */
const MACHINES = ['gen_d1'];
/** the scrubbing loops (foley.ts) */
const SCRUBS = ['scrape_glass', 'scrape_metal', 'scrape_rust', 'scrape_mud', 'brush_wire', 'sponge_scrub'];
/** the tyres on the road (foley.ts): rolling and sliding on each surface */
const TYRES = ['roll_asphalt', 'roll_wet', 'roll_gravel', 'roll_dirt', 'roll_grass', 'roll_sand', 'roll_snow', 'roll_ice', 'skid_asphalt', 'skid_gravel', 'skid_dirt', 'skid_grass', 'skid_sand', 'skid_snow', 'skid_ice'];
const OUT = process.env.MODCAR_AUDIO_OUT || 'D:/modcar-scratch/sound/out';
const args = process.argv.slice(2);
const all = args.includes('--all');
const doFoley = all || args.includes('--foley');
const doLoops = all || args.includes('--loops');
const doVariants = all || args.includes('--variants');
const doSweep = all || args.includes('--sweep');
const doWorkshop = all || args.includes('--workshop');
const doScrub = all || args.includes('--scrub');
const doSpray = all || args.includes('--spray');
const doRoad = all || args.includes('--road');
const doPlaces = all || args.includes('--places');
const doTyres = all || args.includes('--tyres');
const doMetrics = !args.includes('--no-metrics');
const named = args.filter((a) => !a.startsWith('--'));
const engines = named.length ? named : all || (!doFoley && !doLoops && !doVariants && !doSweep && !doWorkshop && !doScrub && !doSpray && !doRoad && !doPlaces && !doTyres) ? [...ENGINES, ...MACHINES] : [];

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
// the generator's sequence: the first pull (no catch), between the pulls, the catch, running light,
// under the recycler's load, light again, the run-down, after it
const GEN_SEGMENTS = { pull: [0.35, 0.9], quiet: [1.4, 1.85], catch: [2.5, 3.6], light: [4.5, 7.9], loaded: [9.0, 11.9], light2: [13.0, 14.9], rundown: [15.05, 17.3], after: [17.5, 18.0] };

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

  const check = (ok, what) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
    if (!ok) failed = true;
  };

  for (const id of engines.filter((e) => MACHINES.includes(e))) {
    const genSeg = async (spec, name) => {
      const r = await page.evaluate((s) => window.__modcarAudio.renderEngine(s), spec);
      const x = fromBase64(r.pcm);
      writeWav(path.join(OUT, `${name}.wav`), x, r.sampleRate);
      const seg = {};
      for (const [k, [a, b]] of Object.entries(GEN_SEGMENTS)) seg[k] = stats(x, r.sampleRate, a, b);
      return { all: stats(x, r.sampleRate), seg, x, sr: r.sampleRate };
    };
    // what one render has that another has not (the renders are deterministic)
    const diff = (p, q, a, b) => {
      const d = new Float32Array(p.x.length);
      for (let i = 0; i < d.length; i++) d[i] = p.x[i] - (q.x[i] ?? 0);
      return stats(d, p.sr, a, b).rms;
    };
    const g = await genSeg({ engineId: id, sequence: 'genset' }, `${id}_genset`);
    report.engines[id] = g.seg;
    const s = g.seg;
    console.log(`${id.padEnd(10)} pull ${s.pull.rms} dB/${s.pull.centroid} Hz  catch ${s.catch.rms}  light ${s.light.rms}/${s.light.centroid}  loaded ${s.loaded.rms}/${s.loaded.centroid}  run-down ${s.rundown.rms}  after ${s.after.rms}  peak ${g.all.peak}`);
    check(s.pull.rms > s.quiet.rms + 12, `${id}: the pull is heard (${s.pull.rms} dB against ${s.quiet.rms} dB between pulls)`);
    // (loaded it thumps louder and deeper; running light it clatters)
    check(s.loaded.rms > s.light.rms + 0.5 && Math.abs(s.loaded.centroid / s.light.centroid - 1) > 0.05, `${id}: the recycler's load is heard (${s.light.rms} -> ${s.loaded.rms} dB, ${s.light.centroid} -> ${s.loaded.centroid} Hz)`);
    check(s.after.rms < s.light.rms - 30, `${id}: silent once run down (${s.after.rms} dB)`);
    check(g.all.peak < -0.5, `${id}: no clipping (peak ${g.all.peak} dB)`);
    // the pull start: with it the voice adds no starter motor; with a starter (an A/B render) it would
    const ab = await genSeg({ engineId: id, sequence: 'genset', tone: { pullStart: false } }, `${id}_genset_starter_ab`);
    const whine = diff(ab, g, ...GEN_SEGMENTS.pull);
    const same = diff(ab, g, ...GEN_SEGMENTS.light);
    check(whine > -70 && same < -90, `${id}: no starter-motor whine on the rope (an electric starter would add ${whine} dB over the pull; running, the two renders differ by ${same} dB)`);
    // a rope needs no battery: a flat one changes nothing (no solenoid clicks, it still turns over)
    const flat = await genSeg({ engineId: id, sequence: 'genset', extra: { starterRate: 0.05 } }, `${id}_genset_flat`);
    const flatDiff = diff(flat, g, 0, 4.0);
    // (with an electric starter a flat battery only clicks: no cranking loop under the clicks)
    const clicksB = await genSeg({ engineId: id, sequence: 'genset', extra: { starterRate: 0.05 }, tone: { pullStart: false } }, `${id}_genset_flat_starter_ab`);
    check(flatDiff < -90 && clicksB.seg.pull.rms > -80, `${id}: a flat battery changes nothing on the rope (difference ${flatDiff} dB; an electric starter would only click instead: ${clicksB.seg.pull.rms} dB over the pull)`);
    const dry = await genSeg({ engineId: id, sequence: 'dry' }, `${id}_dry`);
    report.variants[`${id}_dry`] = dry.seg;
  }

  for (const id of engines.filter((e) => !MACHINES.includes(e))) {
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
      // level in windows of two engine cycles at the swept rpm, against a 0.5 s moving average:
      // the wobble that is not the overall rise (loops that do not match, or sum out of phase)
      const I = r.idleRpm;
      const R = r.redlineRpm;
      const rpmAt = (t) => (t < 8 ? I + ((R - I) * t) / 8 : R + ((I - R) * (t - 8.05)) / 7.95);
      const rough = (a, b) => {
        const lv = [];
        for (let t = a; t < b; t += 0.02) {
          const w = Math.floor(((2 * 120) / rpmAt(t)) * r.sampleRate);
          const o = Math.floor(t * r.sampleRate) - (w >> 1);
          let e = 0;
          for (let i = 0; i < w; i++) e += x[o + i] * x[o + i];
          lv.push(10 * Math.log10(e / w + 1e-12));
        }
        let worst = 0;
        let sum = 0;
        let n = 0;
        for (let i = 12; i < lv.length - 12; i++) {
          let m = 0;
          for (let k = i - 12; k <= i + 12; k++) m += lv[k];
          m /= 25;
          const d = Math.abs(lv[i] - m);
          worst = Math.max(worst, d);
          sum += d * d;
          n++;
        }
        return { rms: +Math.sqrt(sum / Math.max(1, n)).toFixed(2), worst: +worst.toFixed(2) };
      };
      const on = rough(0.5, 7.4);
      const off = rough(8.6, 15.5);
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
      ['eng_v8', { extra: { misfire: 0.18, knock: 0.7 } }, 'v8_worn'],
      ['eng_i4', { extra: { steam: 1 } }, 'i4_steam'],
    ];
    for (const [id, extra, name] of variants) {
      const res = await render({ engineId: id, sequence: 'tour', ...extra }, name);
      report.variants[name] = res.seg;
      const s = res.seg;
      const last = res.debug[res.debug.length - 1] || {};
      console.log(`${name.padEnd(18)} idle ${s.idle.rms}/${s.idle.centroid}  pull_high ${s.pull_high.rms}/${s.pull_high.centroid} hf ${s.pull_high.hf}  overrun ${s.overrun.rms}/${s.overrun.centroid}  pops ${last.popsFired ?? '?'} bov ${last.bovFired ?? '?'}`);
    }
  }

  if (doVariants) {
    // a car going past at 20 m/s, 3 m away: pitch high then low, loud and bright as it passes
    const r = await page.evaluate((s) => window.__modcarAudio.renderEngine(s), { engineId: 'eng_v8', sequence: 'passby' });
    const x = fromBase64(r.pcm);
    writeWav(path.join(OUT, 'v8_passby.wav'), x, r.sampleRate);
    const near = stats(x, r.sampleRate, 3.8, 4.2);
    const far = stats(x, r.sampleRate, 0.3, 0.8);
    report.variants.passby = { near, far };
    console.log(`passby             far ${far.rms} dB/${far.centroid} Hz  near ${near.rms} dB/${near.centroid} Hz`);
    // a flat battery: the solenoid clicks, nothing turns; then a good one cranks and it catches
    const fb = await page.evaluate((s) => window.__modcarAudio.renderEngine(s), { engineId: 'eng_i4', sequence: 'flat' });
    const y = fromBase64(fb.pcm);
    writeWav(path.join(OUT, 'i4_flat_battery.wav'), y, fb.sampleRate);
    const clicks = stats(y, fb.sampleRate, 0.2, 2.4);
    const crank = stats(y, fb.sampleRate, 2.7, 3.5);
    report.variants.flat_battery = { clicks, crank };
    console.log(`flat battery       clicks ${clicks.rms} dB  then cranking ${crank.rms} dB`);
  }

  if (doFoley) {
    const list = [
      ['door_open', { material: 'metal' }], ['door_close', { material: 'metal' }], ['door_close', { material: 'rusty' }], ['door_close', { material: 'armor' }],
      ['door_open', { material: 'fridge' }], ['door_close', { material: 'fridge' }], ['door_open', { material: 'cage' }], ['door_close', { material: 'cage' }],
      ['latch', {}], ['hood_open', {}], ['hood_close', {}], ['trunk_open', {}], ['trunk_close', {}],
      ['part_pickup', { mass: 0.3 }], ['part_pickup', { mass: 20 }], ['part_setdown', { mass: 0.3 }], ['part_setdown', { mass: 4 }], ['part_setdown', { mass: 25 }], ['part_setdown', { mass: 235 }],
      ['part_install', { mass: 10 }], ['part_remove', { mass: 10 }], ['key_turn', {}], ['handbrake_pull', {}], ['handbrake_release', {}], ['gear_shift', {}], ['gear_grind', {}], ['spray_shake', {}], ['switch', {}], ['lever', {}],
      ['horn_trumpet', {}], ['ratchet', {}], ['spray', {}], ['sponge', {}], ['pour', { liquid: 'fuel' }], ['pour', { liquid: 'water' }], ['pour', { liquid: 'oil' }], ['horn_beep', {}], ['horn_air', {}],
      // the workshop
      ['cord_pull', {}], ['gen_switch', {}], ['gen_cough', {}], ...['metal', 'plastic', 'organic', 'cloth', 'wood'].map((grind) => ['shred', { grind }]), ['tally', {}], ['craft_start', {}], ['hammer_swing', {}],
      ...['metal', 'plastic', 'wood', 'organic', 'cloth'].map((grind) => ['hammer_hit', { grind }]), ['craft_done', {}], ['power_on', {}], ['power_off', {}], ['no_power', {}],
      ['recycler_run', {}], ['recycler_grind', {}], ['lamp_buzz', {}],
      // scrubbing: the catch on each surface, the flakes, the chimes; each loop at a mid, a slow and a fast stroke's rate
      ...['glass', 'metal', 'rust', 'mud'].map((surface) => ['scrape_start', { surface }]), ['flake_drop', {}],
      ['clean_ding', {}], ['clean_rust_done', {}], ['clean_car_done', {}], ['tool_worn', {}], ['highlight_ping', {}],
      ...SCRUBS.flatMap((kind) => [[kind, {}], [kind, { rate: 0.7 }], [kind, { rate: 1.6 }]]),
      // spray paint
      ['spray_rattle', {}], ['spray_start', {}], ['spray_sputter', {}], ['paint_done', {}], ['spray_hiss', {}], ['spray_hiss', { rate: 0.9 }],
      // tyres and wrecks: the find at each tier; the flap and the rim at a crawl, at 30 km/h and at 90
      ['tyre_burst', {}], ['wreck_creak', {}], ...[1, 2, 3, 4, 5].map((tier) => ['loot_reveal', { tier }]),
      ...['flat_flap', 'rim_grind'].flatMap((kind) => [[kind, { rate: 0.3 }], [kind, {}], [kind, { rate: 3 }]]), ['rare_glint', {}],
      // roadside places: each container's opening, its search and nothing in it; the doors; the pump
      ...['wood', 'crate', 'metal', 'cloth', 'card'].flatMap((material) => [['container_open', { material }], ['rummage', { material }], ['container_empty', { material }]]), ['rummage', { material: 'wood', rate: 1.3 }],
      ['door_house_open', {}], ['door_house_close', {}], ['door_shop_open', {}], ['door_shop_close', {}],
      ['pump_lift', {}], ['pump_hang', {}], ['pump_click', {}], ['pump_run', {}], ['pump_run', { rate: 0.8 }], ['pump_run', { rate: 1.2 }], ['pump_dry', {}],
      // the tyres on the road: each loop at 25, 50 and 100 km/h (a slide slow, steady and fast); two heard from a closed cabin
      ...TYRES.flatMap((kind) => [[kind, { rate: 0.5 }], [kind, {}], [kind, { rate: 2 }]]), ['roll_asphalt', { cutoff: 1200 }], ['roll_gravel', { cutoff: 2000 }],
    ];
    for (const [kind, opts] of list) {
      const r = await page.evaluate((s) => window.__modcarAudio.renderFoley(s), { kind, opts, hold: 2.5 });
      const x = fromBase64(r.pcm);
      const tag = [kind, opts.material, opts.mass !== undefined ? `${opts.mass}kg` : null, opts.liquid, opts.grind, opts.surface, opts.tier !== undefined ? `t${opts.tier}` : null, opts.rate !== undefined ? `rate${opts.rate}` : null, opts.cutoff !== undefined ? `cut${opts.cutoff}` : null].filter(Boolean).join('_');
      writeWav(path.join(OUT, `foley_${tag}.wav`), x, r.sampleRate);
      const st = stats(x, r.sampleRate);
      report.foley[tag] = st;
      console.log(`foley ${tag.padEnd(26)} rms ${st.rms} dB  peak ${st.peak} dB  centroid ${st.centroid} Hz  hf ${st.hf}`);
    }
  }

  if (doWorkshop) {
    const r = await page.evaluate(() => window.__modcarAudio.renderWorkshop());
    const x = fromBase64(r.pcm);
    writeWav(path.join(OUT, 'workshop_scene.wav'), x, r.sampleRate);
    report.workshop = {};
    for (const [k, [a, b]] of Object.entries(r.marks)) report.workshop[k] = stats(x, r.sampleRate, a, b);
    const w = report.workshop;
    console.log(`workshop scene: ${Object.entries(w).map(([k, v]) => `${k} ${v.rms}`).join('  ')} (dB rms)  peak ${stats(x, r.sampleRate).peak} dB`);
    check(stats(x, r.sampleRate).peak < -0.5, `workshop scene: no clipping (peak ${stats(x, r.sampleRate).peak} dB)`);
    check(w.quiet.rms < -60, `workshop scene: silent once everything is off (${w.quiet.rms} dB)`);
  }

  if (doScrub) {
    const scrub = (spec) => page.evaluate((s) => window.__modcarAudio.renderScrub(s), spec);
    // all of it as the game will play it: a hand on each scrub, the catches, the flakes, the chimes, the fanfare
    const scene = await scrub({ kinds: SCRUBS, motion: 'stroke', shots: true, seconds: 3.5 });
    const x = fromBase64(scene.pcm);
    writeWav(path.join(OUT, 'scrub_scene.wav'), x, scene.sampleRate);
    report.scrub = { scene: {}, loops: {} };
    for (const [k, [a, b]] of Object.entries(scene.marks)) report.scrub.scene[k] = stats(x, scene.sampleRate, a, b);
    const s = report.scrub.scene;
    const peak = stats(x, scene.sampleRate).peak;
    console.log(`scrub scene, ${scene.strokes} strokes: ${SCRUBS.map((k) => `${k} ${s[k].rms} dB/${s[k].centroid} Hz`).join('  ')}  ping ${s.ping.rms}  fanfare ${s.fanfare.rms} (dB rms)  peak ${peak} dB`);
    check(peak < -0.5, `scrub scene: no clipping (peak ${peak} dB)`);
    for (const k of SCRUBS) check(s[`${k}_after`].rms < -60, `scrub scene: ${k} let go and its chime rung out, silence (${s[`${k}_after`].rms} dB)`);
    // each loop: at a steady rate, held at a slow and a fast stroke's, stepping 0.7 -> 1.6 half way, a new rate every frame
    for (const kind of SCRUBS) {
      const one = async (motion, rate, seconds = 3) => {
        const r = await scrub({ kinds: [kind], motion, rate, seconds });
        const y = fromBase64(r.pcm);
        writeWav(path.join(OUT, `scrub_${kind}_${motion}${rate !== undefined ? `_${rate}` : ''}.wav`), y, r.sampleRate);
        return { x: y, sr: r.sampleRate, marks: r.marks, rates: r.rates[kind], turn: r.loopSeconds[kind] };
      };
      const steady = await one('steady');
      const step = await one('step');
      const jitter = await one('jitter');
      // one whole turn of the loop at each (the same sound at both rates: the brightness moves with the rate alone)
      const [pSlow, pFast] = steady.rates;
      const held = async (rate, p) => {
        const r = await one('steady', rate, steady.turn / p + 0.4);
        const a = r.marks[kind][0] + 0.1;
        return stats(r.x, r.sr, a, a + r.turn / p);
      };
      // the largest sample-to-sample step over [a, b) seconds
      const maxStep = (r, a, b) => {
        let m = 0;
        for (let i = Math.floor(a * r.sr); i < Math.floor(b * r.sr); i++) m = Math.max(m, Math.abs(r.x[i] - r.x[i - 1]));
        return m;
      };
      const [a, b] = jitter.marks[kind];
      // (a faster rate makes bigger steps by itself: compare with the fast half of the stepped render too)
      const ref = Math.max(maxStep(steady, a + 0.05, b), maxStep(step, ...step.marks[`${kind}_fast`]));
      const added = maxStep(jitter, a + 0.05, b) / ref;
      const slow = await held(0.7, pSlow);
      const fast = await held(1.6, pFast);
      const quiet = stats(steady.x, steady.sr, ...steady.marks[`${kind}_after`]).rms;
      report.scrub.loops[kind] = { steady: stats(steady.x, steady.sr, a, b), slow, fast, jitterStep: +added.toFixed(2), quiet };
      console.log(`scrub ${kind.padEnd(13)} steady ${report.scrub.loops[kind].steady.rms} dB/${report.scrub.loops[kind].steady.centroid} Hz  rate 0.7 ${slow.rms} dB/${slow.centroid} Hz  rate 1.6 ${fast.rms} dB/${fast.centroid} Hz  jitter step x${added.toFixed(2)}  after ${quiet} dB`);
      check(added < 1.3, `${kind}: a new rate every frame adds no step (largest ${added.toFixed(2)}x that at a steady rate)`);
      // (by about the ratio of the playback rates: 1.6 / 0.7, the glass's squeal half way)
      const heard = fast.centroid / slow.centroid / (pFast / pSlow);
      check(heard > 0.85 && heard < 1.15, `${kind}: a fast stroke heard brighter than a slow one (${slow.centroid} -> ${fast.centroid} Hz, playback ${pSlow} -> ${pFast})`);
      // the step from slow to fast glides: no step at the change bigger than the fast half's own
      const [sa, sb] = step.marks[kind];
      const mid = (sa + sb) / 2;
      check(maxStep(step, mid - 0.05, mid + 0.15) <= 1.05 * maxStep(step, ...step.marks[`${kind}_fast`]), `${kind}: the rate's change glides (no step at it)`);
      check(Math.abs(fast.rms - slow.rms) < 3, `${kind}: as loud fast as slow (${slow.rms} / ${fast.rms} dB)`);
      check(quiet < -60, `${kind}: silent once let go (${quiet} dB)`);
    }
  }

  if (doSpray) {
    const r = await page.evaluate(() => window.__modcarAudio.renderSpray());
    const x = fromBase64(r.pcm);
    writeWav(path.join(OUT, 'spray_scene.wav'), x, r.sampleRate);
    report.spray = {};
    for (const [k, [a, b]] of Object.entries(r.marks)) report.spray[k] = stats(x, r.sampleRate, a, b);
    const s = report.spray;
    const peak = stats(x, r.sampleRate).peak;
    console.log(`spray scene: ${Object.entries(s).map(([k, v]) => `${k} ${v.rms} dB/${v.centroid} Hz`).join('  ')}  peak ${peak} dB`);
    check(peak < -0.5, `spray scene: no clipping (peak ${peak} dB)`);
    // each press: the valve's pssht a few dB over the hiss at once, then the hiss with no hole while it eases in
    const steady = stats(x, r.sampleRate, 2.0, 3.6).rms;
    const win = (a) => stats(x, r.sampleRate, a, a + 0.01).rms;
    for (const t0 of [1.3, 4.4]) {
      const onset = Math.max(win(t0 + 0.005), win(t0 + 0.01), win(t0 + 0.015)) - steady;
      let hole = 0;
      let push = -99;
      for (let t = t0 + 0.04; t < t0 + 0.25; t += 0.01) {
        hole = Math.min(hole, win(t) - steady);
        push = Math.max(push, win(t) - steady);
      }
      check(onset > 1.5 && onset < 7.5, `spray press at ${t0} s: the valve's pssht over the hiss (${onset.toFixed(1)} dB)`);
      check(hole > -3.5 && push < 3.5, `spray press at ${t0} s: then the hiss, no hole and no second push while it eases in (${hole.toFixed(1)} / +${push.toFixed(1)} dB)`);
    }
    check(s.released.rms < -60, `spray: silent once let go (${s.released.rms} dB)`);
    check(s.quiet.rms < -60, `spray: silent once the can has run dry (${s.quiet.rms} dB)`);
  }

  if (doRoad) {
    const r = await page.evaluate(() => window.__modcarAudio.renderRoad());
    const x = fromBase64(r.pcm);
    const sr = r.sampleRate;
    writeWav(path.join(OUT, 'road_scene.wav'), x, sr);
    report.road = {};
    for (const [k, [a, b]] of Object.entries(r.marks)) report.road[k] = stats(x, sr, a, b);
    const s = report.road;
    const peak = stats(x, sr).peak;
    console.log(`road scene: ${Object.entries(s).map(([k, v]) => `${k} ${v.rms} dB/${v.centroid} Hz`).join('  ')}  peak ${peak} dB`);
    check(peak < -0.5, `road scene: no clipping (peak ${peak} dB)`);
    // the flap keeps time with the wheel: six slaps a second at rate 1, wherever the speed is held
    const slaps = (a, b, period) => {
      const w = Math.floor(0.002 * sr);
      const env = [];
      for (let o = Math.floor(a * sr); o + w <= Math.floor(b * sr); o += w) {
        let e = 0;
        for (let i = o; i < o + w; i++) e += x[i] * x[i];
        env.push([o / sr, Math.sqrt(e / w)]);
      }
      const max = Math.max(...env.map(([, v]) => v));
      const at = [];
      for (const [t, v] of env) if (v > max / 3 && (at.length === 0 || t - at[at.length - 1] >= 0.6 * period)) at.push(t);
      return at.length > 1 ? (at[at.length - 1] - at[0]) / (at.length - 1) : 0;
    };
    for (const k of ['flap_cruise', 'flap_crawl', 'flap_fast']) {
      const period = 1 / (6 * r.rates[k]);
      const heard = slaps(...r.marks[k], period);
      check(Math.abs(heard / period - 1) < 0.05, `road: ${k} slaps once every ${heard.toFixed(4)} s (the wheel ${period.toFixed(4)} s, rate ${r.rates[k].toFixed(2)})`);
    }
    // the rate followed every frame adds no step: the largest sample step braking or speeding up no bigger than held fast
    const maxStep = (a, b) => {
      let m = 0;
      for (let i = Math.floor(a * sr); i < Math.floor(b * sr); i++) m = Math.max(m, Math.abs(x[i] - x[i - 1]));
      return m;
    };
    const held = Math.max(maxStep(...r.marks.flap_cruise), maxStep(...r.marks.flap_fast));
    const moving = Math.max(maxStep(...r.marks.flap_braking), maxStep(...r.marks.flap_away));
    check(moving <= 1.3 * held, `road: the flap's rate gliding adds no step (largest ${(moving / held).toFixed(2)}x that held)`);
    const rimHeld = Math.max(maxStep(...r.marks.rim_fast), maxStep(...r.marks.rim_slow));
    check(maxStep(...r.marks.rim_braking) <= 1.3 * rimHeld, `road: the rim's rate gliding adds no step (largest ${(maxStep(...r.marks.rim_braking) / rimHeld).toFixed(2)}x that held)`);
    // the rim grinding higher the faster it goes, by its playback rates (half the wheel's)
    const brighter = s.rim_fast.centroid / s.rim_slow.centroid / (r.rates.rim_fast / r.rates.rim_slow);
    check(brighter > 0.75 && brighter < 1.25, `road: the rim heard brighter fast than slow (${s.rim_slow.centroid} -> ${s.rim_fast.centroid} Hz, playback ${r.rates.rim_slow.toFixed(2)} -> ${r.rates.rim_fast.toFixed(2)})`);
    check(s.after_rim.rms < -60, `road: silent once the car has stopped on its rim (${s.after_rim.rms} dB)`);
    // the wrecks: the panel's groan well under the blowout, the golden find louder than the small one
    check(s.creak.rms < s.burst.rms - 4 && s.creak2.rms < s.burst.rms - 4, `road: a wreck forced open under the blowout (${s.creak.rms} / ${s.creak2.rms} dB against ${s.burst.rms} dB)`);
    check(s.find_golden.rms > s.find_small.rms + 1, `road: the golden find fuller than the small one (${s.find_small.rms} -> ${s.find_golden.rms} dB)`);
    // the rare part heard only near it, and faintly
    check(s.glint_far.rms < -70 && s.glint_near.rms > s.glint_far.rms + 20, `road: the glint heard near the rare part, not from 4 m (${s.glint_far.rms} -> ${s.glint_near.rms} dB)`);
    check(s.glint_near.rms < s.burst.rms - 25, `road: the glint faint even at its nearest (${s.glint_near.rms} dB)`);
    check(s.quiet.rms < -60, `road: silent at the end (${s.quiet.rms} dB)`);
  }

  if (doPlaces) {
    const r = await page.evaluate(() => window.__modcarAudio.renderPlaces());
    const x = fromBase64(r.pcm);
    const sr = r.sampleRate;
    writeWav(path.join(OUT, 'places_scene.wav'), x, sr);
    report.places = {};
    for (const [k, [a, b]] of Object.entries(r.marks)) report.places[k] = stats(x, sr, a, b);
    const s = report.places;
    const peak = stats(x, sr).peak;
    console.log(`places scene: ${Object.entries(s).map(([k, v]) => `${k} ${v.rms} dB/${v.centroid} Hz`).join('  ')}  peak ${peak} dB`);
    check(peak < -0.5, `places scene: no clipping (peak ${peak} dB)`);
    // each search heard all through, from its first moment to its last: no 0.4 s of it (a pause between two moves) more than 16 dB under its loudest
    const win = (a, b) => stats(x, sr, a, b).rms;
    for (const k of ['search_wood', 'search_crate', 'search_metal', 'search_cloth', 'search_card']) {
      const [a, b] = r.marks[k];
      const lv = [];
      for (let t = a; t + 0.4 <= b + 1e-9; t += 0.05) lv.push(win(t, t + 0.4));
      check(Math.min(...lv) > Math.max(...lv) - 16, `places: ${k} heard all through (0.4 s windows ${Math.min(...lv).toFixed(1)} .. ${Math.max(...lv).toFixed(1)} dB)`);
    }
    // the crate held three times as long: its search goes on, its last stretch as its first after the lid
    check(Math.abs(s.crate_on.rms - s.crate_later.rms) < 6, `places: a longer search goes on as it was (${s.crate_on.rms} / ${s.crate_later.rms} dB)`);
    check(s.after_wood.rms < -60 && s.after_search.rms < -60, `places: silent once E is let go (${s.after_wood.rms} / ${s.after_search.rms} dB)`);
    // the shop's bell: B6 and G6 standing out of the door's sound
    const tone = (f, a, b) => {
      let c = 0;
      let q = 0;
      for (let i = Math.floor(a * sr); i < Math.floor(b * sr); i++) {
        c += x[i] * Math.cos((2 * Math.PI * f * i) / sr);
        q += x[i] * Math.sin((2 * Math.PI * f * i) / sr);
      }
      return Math.hypot(c, q);
    };
    const [sa] = r.marks.shop_open;
    const bell = Math.min(tone(1975.53, sa, sa + 0.6), tone(1567.98, sa, sa + 0.6)) / tone(1760, sa, sa + 0.6);
    check(bell > 10, `places: the shop's bell rings B6 and G6 (${(20 * Math.log10(bell)).toFixed(1)} dB over the A between them)`);
    // the pump: the flow rising under the trigger, then steady; silent once the nozzle clicks off and once it has run dry
    const runLv = [];
    for (let t = r.marks.run[0]; t + 0.2 <= r.marks.run[1] + 1e-9; t += 0.2) runLv.push(win(t, t + 0.2));
    check(s.flow_rising.rms < s.run.rms - 4, `places: the pump's flow rising as the trigger is squeezed (${s.flow_rising.rms} -> ${s.run.rms} dB)`);
    check(Math.max(...runLv) - Math.min(...runLv) < 3, `places: the pump steady at full flow (0.2 s windows within ${(Math.max(...runLv) - Math.min(...runLv)).toFixed(1)} dB)`);
    check(s.after_click.rms < -60, `places: silent once the nozzle clicks off (${s.after_click.rms} dB)`);
    check(s.dry.rms > s.can_run.rms - 4, `places: running dry heard over the run that went before it (${s.can_run.rms} -> ${s.dry.rms} dB)`);
    check(s.after_dry.rms < -55, `places: the pump wound down to nothing (${s.after_dry.rms} dB)`);
    check(s.quiet.rms < -60, `places: silent at the end (${s.quiet.rms} dB)`);
  }

  if (doTyres) {
    const r = await page.evaluate(() => window.__modcarAudio.renderTyres());
    const x = fromBase64(r.pcm);
    const sr = r.sampleRate;
    writeWav(path.join(OUT, 'tyres_scene.wav'), x, sr);
    report.tyres = {};
    for (const [k, [a, b]] of Object.entries(r.marks)) report.tyres[k] = stats(x, sr, a, b);
    const s = report.tyres;
    const peak = stats(x, sr).peak;
    console.log(`tyres scene: ${Object.entries(s).map(([k, v]) => `${k} ${v.rms} dB/${v.centroid} Hz`).join('  ')}  peak ${peak} dB`);
    check(peak < -0.5, `tyres: no clipping (peak ${peak} dB)`);
    // a faster roll brighter, by about its playback rates; and louder
    const brighter = s.asphalt_100.centroid / s.asphalt_30.centroid / (r.rates.asphalt_100 / r.rates.asphalt_30);
    check(brighter > 0.75 && brighter < 1.25, `tyres: asphalt at 100 km/h brighter than at 30 (${s.asphalt_30.centroid} -> ${s.asphalt_100.centroid} Hz, playback ${r.rates.asphalt_30.toFixed(2)} -> ${r.rates.asphalt_100.toFixed(2)})`);
    check(s.asphalt_100.rms > s.asphalt_30.rms + 6, `tyres: asphalt louder at 100 km/h than at 30 (${s.asphalt_30.rms} -> ${s.asphalt_100.rms} dB)`);
    // the largest sample step over [a, b) s
    const maxStep = (a, b) => {
      let m = 0;
      for (let i = Math.floor(a * sr) + 1; i < Math.floor(b * sr); i++) m = Math.max(m, Math.abs(x[i] - x[i - 1]));
      return m;
    };
    const held = Math.max(maxStep(...r.marks.asphalt_30), maxStep(...r.marks.asphalt_100));
    check(maxStep(...r.marks.speeding_up) <= 1.3 * held, `tyres: the rate gliding every frame adds no step (largest ${(maxStep(...r.marks.speeding_up) / held).toFixed(2)}x that held)`);
    check(s.wet_100.rms > s.asphalt_100.rms + 1.5 && s.wet_100.centroid > 1.3 * s.asphalt_100.centroid, `tyres: wet louder and brighter (${s.asphalt_100.rms} dB/${s.asphalt_100.centroid} Hz -> ${s.wet_100.rms} dB/${s.wet_100.centroid} Hz)`);
    // the energy between lo and hi Hz over [a, b) s, per second (dB): a cutoff takes the top, not the body
    const band = (a, b, lo, hi) => {
      const N = 4096;
      let e = 0;
      let frames = 0;
      for (let o = Math.floor(a * sr); o + N <= Math.floor(b * sr); o += N) {
        const re = new Float64Array(N);
        const im = new Float64Array(N);
        for (let i = 0; i < N; i++) re[i] = x[o + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
        fft(re, im);
        for (let k = 1; k < N / 2; k++) {
          const f = (k * sr) / N;
          if (f >= lo && f < hi) e += re[k] * re[k] + im[k] * im[k];
        }
        frames++;
      }
      return 10 * Math.log10(e / Math.max(1, frames) + 1e-30);
    };
    const topDrop = band(...r.marks.cabin_open, 3000, 20000) - band(...r.marks.cabin_shut, 3000, 20000);
    const lowDiff = band(...r.marks.cabin_open, 30, 400) - band(...r.marks.cabin_shut, 30, 400);
    report.tyres.cabin = { topDropDb: +topDrop.toFixed(1), lowDiffDb: +lowDiff.toFixed(1) };
    check(topDrop > 15 && Math.abs(lowDiff) < 1.5, `tyres: the door shut muffles the wet road (over 3 kHz down ${topDrop.toFixed(1)} dB, under 400 Hz ${lowDiff.toFixed(1)} dB)`);
    const gTop = band(...r.marks.gravel_open, 3000, 20000) - band(...r.marks.gravel_shut, 3000, 20000);
    check(gTop > 8, `tyres: gravel started behind a shut door muffled from its first frame, opened after (over 3 kHz ${gTop.toFixed(1)} dB more once open)`);
    // the low-pass coming and going adds no click: the largest step near each door no bigger than the loop's own either side
    for (const t of r.doors) {
      const near = maxStep(t - 0.02, t + 0.25);
      const around = Math.max(maxStep(t - 0.6, t - 0.1), maxStep(t + 0.35, t + 0.8));
      check(near <= 1.3 * around, `tyres: the cutoff at ${t} s comes or goes with no click (largest step ${(near / around).toFixed(2)}x that either side)`);
    }
    check(s.gravel_open.peak - s.gravel_open.rms > s.asphalt_100.peak - s.asphalt_100.rms + 2.5, `tyres: gravel crunching in grains, its crest over the asphalt's (${(s.gravel_open.peak - s.gravel_open.rms).toFixed(1)} against ${(s.asphalt_100.peak - s.asphalt_100.rms).toFixed(1)} dB)`);
    // the squeal: a tone standing out of the slide (the strongest bin 800 Hz - 1.6 kHz over the mean 200 Hz - 8 kHz)
    const tone = (() => {
      const [a, b] = r.marks.skid_asphalt;
      const N = 8192;
      const P = new Float64Array(N / 2);
      for (let o = Math.floor(a * sr); o + N <= Math.floor(b * sr); o += N / 2) {
        const re = new Float64Array(N);
        const im = new Float64Array(N);
        for (let i = 0; i < N; i++) re[i] = x[o + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
        fft(re, im);
        for (let k = 0; k < N / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k];
      }
      let best = 0;
      let m = 0;
      let c = 0;
      for (let k = 1; k < N / 2; k++) {
        const f = (k * sr) / N;
        if (f >= 200 && f < 8000) {
          m += P[k];
          c++;
        }
        if (f >= 800 && f < 1600) best = Math.max(best, P[k]);
      }
      return 10 * Math.log10(best / (m / c));
    })();
    check(tone > 15, `tyres: the wheels locked on asphalt squeal, a tone ${tone.toFixed(1)} dB over the slide's spectrum`);
    check(s.after_stop.rms < -60, `tyres: silent once stopped (${s.after_stop.rms} dB)`);
    check(s.ice_30.rms < s.asphalt_30.rms - 6, `tyres: ice very quiet beside asphalt at the same speed (${s.asphalt_30.rms} -> ${s.ice_30.rms} dB)`);
    check(s.quiet.rms < -60, `tyres: silent at the end (${s.quiet.rms} dB)`);
  }

  if (doLoops) {
    for (const id of named.length ? named : [...ENGINES, ...MACHINES]) {
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
for (const [id, s] of Object.entries(report.engines)) {
  compact[id] = MACHINES.includes(id)
    ? { light_db: s.light.rms, loaded_db: s.loaded.rms, pull_db: s.pull.rms, light_hz: s.light.centroid, loaded_hz: s.loaded.centroid }
    : { idle_db: s.idle.rms, pull_high_db: s.pull_high.rms, overrun_db: s.overrun.rms, idle_hz: s.idle.centroid, pull_high_hz: s.pull_high.centroid };
}
for (const [k, v] of Object.entries(report.loops)) compact[`loops_${k}`] = v.worst;
for (const [k, v] of Object.entries(report.sweeps || {})) compact[`sweep_wobble_${k}`] = { on: v.on.rms, off: v.off.rms };
if (doMetrics && Object.keys(compact).length) {
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
