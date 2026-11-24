// The performance gate (docs/V3/PLAN.md, the 2026-11-20 plan: "性能预算"): the same fixed spots of the world of seed 7
// from the driver's seat at 1920×1080, 15:30 — how long a frame takes (each frame read back, so the GPU's work is in
// it), how many draw calls, and how many triangles, in all and by kind (trees, grass and flowers, the ground and the
// road, rocks, life, vehicles and the player, everything else) — set against the budget (docs/V3/perf-budget.json).
// A spot over its budget fails the gate (exit 1): nothing new goes in until it is back under.
//
//   SHOTS_GPU=1 node harness/shots/perf_gate.mjs [label] [spot ...]
// (GATE_BUILD=stock:camel: from another vehicle's seat — the motorhomes' own draw calls in it; the Mule's by default)
// The figures go to loop/shots/perf_gate/<label>.json (label: "now" by default) and are printed as a table.
import fs from 'node:fs';
import path from 'node:path';
import { built, idle } from './landscapeCapture.mjs';
import { ROOT, ON_GPU, launchBrowser, openGame, startServer } from './lib.mjs';

const args = process.argv.slice(2);
// (the world's trees and bushes are the plant toolkit's; --m5: as the M5 crowns grew them, ?flora=m5: docs/V3/nodes/P2-A-kit-default.md)
const m5 = args.includes('--m5');
if (m5) args.splice(args.indexOf('--m5'), 1);
const label = args[0] && !args[0].startsWith('-') ? args.shift() : 'now';
/** the gate's spots: forest, grassland, snow mountain (near and its long view), water (the coast's stand-in until the coast roads are made) */
// (WORLD=4: the emergent Earth's world of seed 7, docs/V3/nodes/E1-earth-world.md — its spots its first places of each kind)
// (WORLD=5: the scenic roads' world of the same seed, docs/V3/nodes/R2-roads.md)
const EARTH = process.env.WORLD === '4' || process.env.WORLD === '5';
let SPOTS = [
  { name: 'forest', km: 388.125 },
  { name: 'plains', km: 3.125 },
  { name: 'alpine', km: 394.375 },
  { name: 'alpine_vista', km: 278.125, look: -0.8 },
  { name: 'lakes', km: 326.875 },
].filter((s) => !args.length || args.includes(s.name));
const budget = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/V3/perf-budget.json'), 'utf8'));
const out = path.join(ROOT, 'loop/shots/perf_gate');
fs.mkdirSync(out, { recursive: true });
if (!ON_GPU) console.log('(not on the GPU: SHOTS_GPU=1 for real frame times)');

const { server, url } = await startServer();
const browser = await launchBrowser();
const report = { label, at: new Date().toISOString(), budget, spots: [] };
let over = 0;
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=${EARTH ? process.env.WORLD : 2}&seed=7&start=road&build=${process.env.GATE_BUILD ?? 'stock:pickup'}&s=300&time=15.5&weather=clear${m5 ? '&flora=m5' : ''}`, { width: 1920, height: 1080 });
  await idle(page);
  if (EARTH) {
    const wanted = args.length ? args : null;
    // (RIVER_ALONG: the river spot that many metres along from the middle of its river)
    await page.evaluate((a) => { window.__riverAlong = a; }, Number(process.env.RIVER_ALONG ?? 0));
    SPOTS = (await page.evaluate(() => {
      const j = window.__rt.game.world.earth;
      while (j.pieces.length < 81) j.chapter(j.chapters.length);
      // (G8: the great forms' mirror — a salt pan's, a crater lake's: the scene drawn once more upside down, render/mirror.ts)
      const kinds = { mirror: (p) => p.look.landform.id === 'salt_flat', crater: (p) => p.look.landform.id === 'crater_lake', forest: (p) => p.look.efg.struct === 'closed_forest', open: (p) => ['grassland', 'savanna', 'farmland'].includes(p.look.efg.struct), mountain: (p) => p.macro.context === 'mountain' && p.macro.relief > 600, coast: (p) => p.macro.water === 'coast', desert: (p) => ['desert', 'bare'].includes(p.look.efg.struct) };
      const spots = [];
      for (const [name, is] of Object.entries(kinds)) {
        const piece = j.pieces.find((q) => q.scene && is(q.scene.place));
        if (piece) spots.push({ name, km: (piece.start + 0.55 * (piece.end - piece.start)) / 1000, place: piece.scene.name });
      }
      // (world version 5: on the first viaduct over a ravine, and in the first gallery — docs/V3/nodes/R7-wrapup.md)
      const w = window.__rt.game.world;
      if (w.galleries && w.rules.version >= 5) {
        const end = j.pieces[80].end;
        const via = w.water.between(0, end, []).find((f) => f.kind === 'river' && f.wall !== undefined);
        if (via) spots.push({ name: 'viaduct', km: (via.span0 + 0.5 * (via.span1 - via.span0)) / 1000, place: j.pieces.find((q) => q.start <= via.s && q.end > via.s)?.scene?.name ?? '' });
        const str = w.water.between(0, end, []).find((f) => f.kind === 'stream');
        if (str) spots.push({ name: 'river', km: (str.s + Number(window.__riverAlong ?? 0)) / 1000, place: j.pieces.find((q) => q.start <= str.s && q.end > str.s)?.scene?.name ?? '' });
        const gal = w.galleries.between(0, end, [])[0];
        if (gal) spots.push({ name: 'gallery', km: (gal.s0 + 0.5 * (gal.s1 - gal.s0)) / 1000, place: j.pieces.find((q) => q.start <= gal.s0 && q.end > gal.s0)?.scene?.name ?? '' });
      }
      return spots;
    })).filter((s) => !wanted || wanted.includes(s.name));
    console.log('the Earth spots:', SPOTS.map((s) => `${s.name} ${s.place} ${s.km.toFixed(2)} km`).join(' · '));
  }
  for (const spot of SPOTS) {
    await page.evaluate((km) => window.__rt.devGoKm(km, true), spot.km);
    await built(page);
    await idle(page);
    await page.evaluate(({ look }) => {
      const rt = window.__rt;
      const g = rt.game;
      if (!g.seated) g.enter(g.focus, 'driver');
      g.ui.root.style.visibility = 'hidden';
      rt.setView('cockpit');
      rt.look(look ?? 0, 0.02);
      rt.simulate(0.5);
    }, spot);
    await built(page);
    // (the vehicles there loaded and merged — a car's parts come in over a second or two of the wall clock, and only
    // then is it merged: parked, all of it, carView.ts setParked)
    for (let i = 0; i < 40; i++) {
      const busy = await page.evaluate(() => {
        const g = window.__rt.game;
        for (let k = 0; k < 6; k++) g.simulate(1 / 30);
        // (and their reduced twins made: render/carMerge.ts prepareFar, a second or so in a worker)
        return g.vehicles.some((v) => (v.view.loads?.size ?? 0) > 0 || v.view.mergeDirty || v.view.merging || (v.view.merged?.reducing ?? false));
      });
      if (!busy) break;
      await page.waitForTimeout(400);
    }
    const fig = await page.evaluate(async ({ frames, deep }) => {
      const g = window.__rt.game;
      const scene = g.core.scene;
      // the kind of each thing drawn, by its name or its parents' (the first that says)
      const KINDS = [
        ['trees', /crown|tree|trunk|impostor|wood|forest|canopy/i],
        ['grass_flowers', /grass|meadow|flora|flower|blade|fern|herb|shrub|bush|plant|reed/i],
        ['ground_road', /terrain|ground|road|strip|tile|chunk|land|shoulder|verge|water|lake|river|sea|wire|pole|kerb|curb|line/i],
        ['rocks', /rock|stone|boulder|cobble|pebble|scree/i],
        ['life', /life|bird|fish|insect|butterfly|bee|deer|animal|firefl/i],
        ['vehicles_player', /modcar|vehicle|car|wheel|tyre|cab|seat|player|hand|held|cockpit|dash|merged/i],
      ];
      const kindOf = (o) => {
        for (let p = o; p; p = p.parent) {
          const n = `${p.name ?? ''} ${p.type === 'Scene' ? '' : p.userData?.kind ?? ''}`;
          if (!n.trim()) continue;
          for (const [k, re] of KINDS) if (re.test(n)) return k;
        }
        return 'other';
      };
      const tally = {};
      const calls = {};
      const shadow = { tri: 0, calls: 0, kinds: {} };
      const mainCam = g.core.camera;
      const others = {};
      const heavy = {};
      const hooked = [];
      scene.traverse((o) => {
        if (!o.isMesh && !o.isPoints) return;
        const kind = kindOf(o);
        const was = o.onBeforeRender;
        o.onBeforeRender = function (r, s, c, geo, mat, group) {
          let tri;
          let n = 1;
          let done = false;
          let ret;
          if (o.isBatchedMesh) {
            // (a batch, scene/terrainBatch.ts: what it draws is known once it has culled its own pieces — one call
            // for all of them where WEBGL_multi_draw is, else one each)
            ret = was.call(this, r, s, c, geo, mat, group);
            done = true;
            let e = 0;
            for (let i = 0; i < o._multiDrawCount; i++) e += o._multiDrawCounts[i];
            tri = e / 3;
            n = o._multiDrawCount === 0 ? 0 : r.extensions.has('WEBGL_multi_draw') ? 1 : o._multiDrawCount;
          } else {
            const idx = geo.index ? geo.index.count : geo.attributes.position?.count ?? 0;
            const range = Math.min(idx, geo.drawRange?.count ?? Infinity);
            const count = group ? group.count : range;
            const inst = o.isInstancedMesh ? o.count : geo.isInstancedBufferGeometry ? geo.instanceCount : 1;
            // (a pack of variants draws one of them: crowns/variantPack.ts, the triangles of one tree in userData)
            tri = o.isPoints ? 0 : (o.userData?.trisEach !== undefined ? o.userData.trisEach : count / 3) * inst;
          }
          // (the shadow maps draw the casters again, depth only: counted apart from what is on the screen)
          if (c !== mainCam) {
            shadow.tri += tri;
            shadow.calls += n;
            shadow.kinds[kind] = (shadow.kinds[kind] ?? 0) + n;
            return done ? ret : was.call(this, r, s, c, geo, mat, group);
          }
          tally[kind] = (tally[kind] ?? 0) + tri;
          calls[kind] = (calls[kind] ?? 0) + n;
          const pathName = (deep ? [o, o.parent, o.parent?.parent, o.parent?.parent?.parent, o.parent?.parent?.parent?.parent, o.parent?.parent?.parent?.parent?.parent] : [o, o.parent, o.parent?.parent]).map((p) => p?.name).filter(Boolean).join('<') || o.type;
          const h = (heavy[pathName] ??= { kind, tri: 0, calls: 0 });
          h.tri += tri;
          h.calls += n;
          if (kind === 'other') {
            const nm = o.name || o.parent?.name || o.type;
            others[nm] = (others[nm] ?? 0) + tri;
          }
          return done ? ret : was.call(this, r, s, c, geo, mat, group);
        };
        hooked.push([o, was]);
      });
      window.__rt.render();
      const s = g.core.stats;
      const onScreen = Object.values(tally).reduce((a, b) => a + b, 0);
      const res = { calls: s.calls, triangles: onScreen, allTriangles: s.triangles, shadow: { ...shadow }, kinds: { ...tally }, kindCalls: { ...calls }, others: Object.entries(others).sort((a, b) => b[1] - a[1]).slice(0, 8), heavy: Object.entries(heavy).sort((a, b) => b[1].tri - a[1].tri).slice(0, 14), busy: Object.entries(heavy).sort((a, b) => b[1].calls - a[1].calls).slice(0, deep ? 40 : 10) };
      for (const [o, was] of hooked) o.onBeforeRender = was;
      if (frames > 0) {
        const gl = g.core.renderer.getContext();
        const px = new Uint8Array(4);
        const one = () => {
          const crowns = g.worldView?.crowns;
          if (crowns) crowns.changed = true;
          window.__rt.render();
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        };
        // (the far pictures of the trees in view baked first, one a frame as the game bakes them: a frame that bakes one
        // is a frame of the bake, not of the spot — res.bakeFrames says how many it took)
        // (a frame is drawn first: what the trees in view want is known once one has been)
        let bakeFrames = 0;
        do {
          one();
          bakeFrames++;
        } while ((g.worldView?.crowns?.pendingBakes ?? 0) > 0 && bakeFrames < 600);
        res.bakeFrames = bakeFrames - 1;
        for (let i = 0; i < 8; i++) one();
        const ms = [];
        for (let i = 0; i < frames; i++) {
          const t = performance.now();
          one();
          ms.push(performance.now() - t);
        }
        ms.sort((a, b) => a - b);
        res.ms = +(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(2);
        res.p95 = +ms[Math.ceil(ms.length * 0.95) - 1].toFixed(2);
        // … and the CPU's part alone: render() a frame apart, nothing read back (what fewer draw calls save; the
        // GPU's own time is in the figure above, and another program on the GPU makes that one noisy)
        const cpu = [];
        for (let i = 0; i < frames; i++) {
          await new Promise((go) => requestAnimationFrame(go));
          const crowns = g.worldView?.crowns;
          if (crowns) crowns.changed = true;
          const t = performance.now();
          window.__rt.render();
          cpu.push(performance.now() - t);
        }
        cpu.sort((a, b) => a - b);
        res.cpu = +(cpu.reduce((a, b) => a + b, 0) / cpu.length).toFixed(2);
        res.cpu95 = +cpu[Math.ceil(cpu.length * 0.95) - 1].toFixed(2);
      }
      return res;
    }, { frames: ON_GPU ? 60 : 0, deep: !!process.env.GATE_DEEP });
    const fails = [];
    if (fig.p95 !== undefined && fig.p95 > budget.frameMs) fails.push(`P95 ${fig.p95} ms > ${budget.frameMs}`);
    if (fig.triangles > budget.triangles) fails.push(`${(fig.triangles / 1e6).toFixed(2)} M triangles > ${budget.triangles / 1e6}`);
    if (fig.calls > budget.calls) fails.push(`${fig.calls} calls > ${budget.calls}`);
    for (const [k, cap] of Object.entries(budget.kinds)) if ((fig.kinds[k] ?? 0) > cap) fails.push(`${k} ${((fig.kinds[k] ?? 0) / 1e6).toFixed(2)} M > ${cap / 1e6}`);
    await page.screenshot({ path: path.join(out, `${label}_${spot.name}.png`) });
    report.spots.push({ ...spot, ...fig, fails });
    if (fails.length) over++;
    const k = fig.kinds;
    const M = (x) => ((x ?? 0) / 1e6).toFixed(2);
    console.log(`${fails.length ? 'OVER' : 'ok  '} ${spot.name.padEnd(13)} ${fig.ms ?? '-'} ms (P95 ${fig.p95 ?? '-'}; CPU ${fig.cpu ?? '-'}, P95 ${fig.cpu95 ?? '-'})  ${fig.calls} calls (${fig.shadow.calls} in shadows)  ${M(fig.triangles)} M tris on screen (+${M(fig.shadow.tri)} in shadows) — trees ${M(k.trees)} grass ${M(k.grass_flowers)} ground ${M(k.ground_road)} rocks ${M(k.rocks)} life ${M(k.life)} vehicles ${M(k.vehicles_player)} other ${M(k.other)}${fails.length ? '  ← ' + fails.join('; ') : ''}`);
    console.log(`     calls by kind: ${Object.entries(fig.kindCalls).map(([n, c]) => `${n} ${c}`).join(', ')}  — in the shadows: ${Object.entries(fig.shadow.kinds).map(([n, c]) => `${n} ${c}`).join(', ')}`);
    if (fig.bakeFrames) console.log(`     (first ${fig.bakeFrames} frames baking far pictures of trees, one a frame; not timed)`);
    if (process.env.GATE_DETAIL) {
      console.log(`     heaviest: ${fig.heavy.map(([n, h]) => `${n} [${h.kind}] ${M(h.tri)}M/${h.calls}`).join(' | ')}`);
      console.log(`     busiest: ${fig.busy.map(([n, h]) => `${n} [${h.kind}] ${h.calls}`).join(' | ')}`);
    }
  }
  report.errors = errors.slice(0, 5);
} finally {
  fs.writeFileSync(path.join(out, `${label}.json`), JSON.stringify(report, null, 1));
  await browser.close();
  await server.close();
}
console.log(over ? `${over} spot(s) over the budget` : 'every spot within the budget', `— loop/shots/perf_gate/${label}.json`);
process.exit(over ? 1 : 0);
