// ND9's own performance gate (docs/V3/plan/growth.md §三: 每种建筑都过一遍性能闸门): each of Nomad Drive's 25 buildings
// as a new game's world lays it (world 6), the first of it down the road of seed 7 (or the one asked), stood before on
// foot from the road's side with the whole of it in view, 1920×1080 at 15:30 in clear weather — how long a frame takes
// (each frame read back, so the GPU's work is in it, as harness/shots/perf_gate.mjs measures: mean and P95 of 60 frames),
// how many draw calls and triangles — held to the budget (docs/V3/perf-budget.json: P95 11 ms, 400 calls, 3 M
// triangles). A building over it fails the run (exit 1). Frame times mean something only with the machine to itself:
// run it alone (the figures go to loop/shots/nd9_perf/<label>.json, a picture of each beside them).
//   SHOTS_GPU=1 node harness/shots/nd9_perf.mjs [label] [card ...] [--seed=7] [--km=1500]
import fs from 'node:fs';
import path from 'node:path';
import { built, idle } from './landscapeCapture.mjs';
import { ROOT, ON_GPU, launchBrowser, openGame, startServer } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  if (a) args.splice(args.indexOf(a), 1);
  return a ? a.slice(name.length + 3) : def;
};
const seed = opt('seed', '7');
const KM = Number(opt('km', '1500'));
/** the 25 (core/world/prefabs.ts PREFAB_DICE): any of them named on the line are the ones measured, the other word the label */
const CARDS = ['station', 'cabin', 'motel', 'commune', 'starter', 'camp', 'factory1', 'factory2', 'factory3', 'containeryard', 'radiostation', 'windfarm', 'watertower', 'graveyard', 'watchtower', 'busstop', 'toilets', 'mailboxes', 'pump', 'windmill', 'hays', 'crosses', 'wreck1', 'wreck2', 'wreck3'];
const wanted = args.filter((a) => CARDS.includes(a));
const label = args.find((a) => !CARDS.includes(a)) ?? 'now';
const budget = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/V3/perf-budget.json'), 'utf8'));
const out = path.join(ROOT, 'loop/shots/nd9_perf');
fs.mkdirSync(out, { recursive: true });
if (!ON_GPU) console.log('(not on the GPU: SHOTS_GPU=1 for real frame times)');

const { server, url } = await startServer();
const browser = await launchBrowser();
const report = { label, at: new Date().toISOString(), seed, budget, cards: [] };
let over = 0;
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=6&seed=${seed}&start=road&build=stock:pickup&s=300&time=15.5&weather=clear`, { width: 1920, height: 1080 });
  await idle(page);
  // the first of each card down the road
  const firsts = await page.evaluate(async (KM) => {
    const g = window.__rt.game;
    const { PREFAB_DICE } = await import('/src/core/world/prefabs.ts');
    const sites = [];
    g.world.sites.between(0, KM * 1000, sites);
    sites.sort((a, b) => a.s - b.s);
    return PREFAB_DICE.map((d) => {
      const x = sites.find((q) => q.prefab === d.id);
      if (!x) return { prefab: d.id, missing: true };
      const o = x.objects.find((q) => q.kind === 'prefab');
      return { prefab: d.id, id: x.id, s: x.s, x: o.x, y: o.y, z: o.z, yaw: o.yaw, w: o.w, d: o.d, h: o.h };
    });
  }, KM);
  for (const f of firsts.filter((q) => q.missing && (!wanted.length || wanted.includes(q.prefab)))) {
    console.log(`MISS ${f.prefab}: none in the first ${KM} km of seed ${seed} (--km= further, or --seed=)`);
    over++;
  }
  for (const t of firsts.filter((q) => !q.missing && (!wanted.length || wanted.includes(q.prefab)))) {
    await page.evaluate((km) => window.__rt.devGoKm(km, true), t.s / 1000);
    await built(page);
    await idle(page);
    // on foot before it, from the road's side, the whole of it in view (its height: a little up)
    const far = Math.max(16, Math.min(75, Math.max(t.w * 0.75, t.h * 0.9)));
    const W = (u, v) => ({ x: t.x + Math.cos(t.yaw) * u - Math.sin(t.yaw) * v, z: t.z + Math.sin(t.yaw) * u + Math.cos(t.yaw) * v });
    const a = W(0, -t.d / 2 - far);
    const pitch = Math.min(0.35, Math.atan2(t.h * 0.35, far + t.d / 2));
    const stand = () => page.evaluate(({ a, t, pitch }) => {
      const g = window.__rt.game;
      const v = g.seated ?? g.vehicles[0];
      if (g.seated) g.getOut();
      // (the vehicle one came in put away: its engine off — left idling in gear it creeps, and a vehicle moving is never
      // merged — behind the one standing there, out of the picture, more than 9 m off: parked, merged)
      if (v) {
        if (v.sys.running) v.sys.stop('');
        const dx = a.x - t.x;
        const dz = a.z - t.z;
        const n = Math.hypot(dx, dz) || 1;
        window.__rt.placeVehicle(g.vehicles.indexOf(v), a.x + (dx / n) * 14, a.z + (dz / n) * 14, Math.atan2(dz, dx));
      }
      window.__rt.stand(a.x, a.z, Math.atan2(t.z - a.z, t.x - a.x), pitch);
      g.ui.root.style.visibility = 'hidden';
      g.simulate(0);
    }, { a, t, pitch });
    await stand();
    await built(page);
    await stand();
    // (its model in, its things laid out and their models in, the vehicles about parked — more than 9 m off, nobody in
    // them — merged and their far twins made: what the measure is of is what one sees standing there a while)
    for (let i = 0; i < 80; i++) {
      const busy = await page.evaluate(async (id) => {
        const g = window.__rt.game;
        for (let k = 0; k < 6; k++) g.simulate(1 / 30);
        await g.loose.settled?.();
        const drawn = g.systems.harness('nd-build', 'drawn').find((d) => d.site === id);
        const lp = g.places?.telemetry().live.find((x) => x.id === id);
        const cars = g.vehicles.some((v) => (v.view.loads?.size ?? 0) > 0 || v.view.mergeDirty || v.view.merging || (v.view.merged?.reducing ?? false) || (v !== g.seated && !v.view.isParked));
        return window.__rt.worldPending() > 0 || !drawn?.ready || !lp || lp.laid !== lp.containers || cars;
      }, t.id);
      if (!busy) break;
      await page.waitForTimeout(250);
    }
    const fig = await page.evaluate(async (frames) => {
      const g = window.__rt.game;
      const gl = g.core.renderer.getContext();
      const px = new Uint8Array(4);
      const one = () => {
        const crowns = g.worldView?.crowns;
        if (crowns) crowns.changed = true;
        window.__rt.render();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      };
      // (the far pictures of the trees in view baked first, one a frame as the game bakes them: not timed)
      let bake = 0;
      do {
        one();
        bake++;
      } while ((g.worldView?.crowns?.pendingBakes ?? 0) > 0 && bake < 600);
      for (let i = 0; i < 8; i++) one();
      // what is drawn, as perf_gate.mjs counts it: the triangles on the screen (the shadow maps' apart), the calls by
      // kind — the building (nd-build's root), the things lying about, the rest — and the busiest groups
      const KINDS = [
        ['building', /^nd-build:/],
        ['things', /^loose:|^loose$|merged-loose|looseLots/i],
        ['trees', /crown|tree|trunk|impostor|wood|forest|canopy/i],
        ['grass_flowers', /grass|meadow|flora|flower|blade|fern|herb|shrub|bush|plant|reed/i],
        ['ground_road', /terrain|ground|road|strip|tile|chunk|land|shoulder|verge|water|lake|river|sea|wire|pole|kerb|curb|line/i],
        ['vehicles_player', /modcar|vehicle|car|wheel|tyre|cab|seat|player|hand|held|cockpit|dash|merged/i],
      ];
      const kindOf = (o) => {
        for (let p = o; p; p = p.parent) {
          const n = `${p.name ?? ''}`;
          if (!n.trim()) continue;
          for (const [k, re] of KINDS) if (re.test(n)) return k;
        }
        return 'other';
      };
      const mainCam = g.core.camera;
      const tally = { tri: 0, calls: 0, shadowCalls: 0, kinds: {}, groups: {} };
      const hooked = [];
      g.core.scene.traverse((o) => {
        if (!o.isMesh && !o.isPoints) return;
        const was = o.onBeforeRender;
        const kind = kindOf(o);
        o.onBeforeRender = function (r, sc, c, geo, mat, group) {
          const ret = was.call(this, r, sc, c, geo, mat, group);
          if (c !== mainCam) {
            tally.shadowCalls++;
            return ret;
          }
          let tri;
          let n = 1;
          if (o.isBatchedMesh) {
            let e = 0;
            for (let i = 0; i < o._multiDrawCount; i++) e += o._multiDrawCounts[i];
            tri = e / 3;
            n = o._multiDrawCount === 0 ? 0 : r.extensions.has('WEBGL_multi_draw') ? 1 : o._multiDrawCount;
          } else {
            const idx = geo.index ? geo.index.count : geo.attributes.position?.count ?? 0;
            const count = group ? group.count : Math.min(idx, geo.drawRange?.count ?? Infinity);
            const inst = o.isInstancedMesh ? o.count : geo.isInstancedBufferGeometry ? geo.instanceCount : 1;
            tri = o.isPoints ? 0 : (o.userData?.trisEach !== undefined ? o.userData.trisEach : count / 3) * inst;
          }
          tally.tri += tri;
          tally.calls += n;
          tally.kinds[kind] = (tally.kinds[kind] ?? 0) + n;
          const name = [o, o.parent, o.parent?.parent].map((p) => p?.name).filter(Boolean).join('<') || o.type;
          tally.groups[name] = (tally.groups[name] ?? 0) + n;
          return ret;
        };
        hooked.push([o, was]);
      });
      window.__rt.render();
      for (const [o, was] of hooked) o.onBeforeRender = was;
      const s = g.core.stats;
      const res = { calls: s.calls, triangles: tally.tri, allTriangles: s.triangles ?? null, onScreenCalls: tally.calls, shadowCalls: tally.shadowCalls, kinds: tally.kinds, busy: Object.entries(tally.groups).sort((a, b) => b[1] - a[1]).slice(0, 8), bake: bake - 1 };
      if (frames > 0) {
        const ms = [];
        for (let i = 0; i < frames; i++) {
          const t0 = performance.now();
          one();
          ms.push(performance.now() - t0);
        }
        ms.sort((x, y) => x - y);
        res.ms = +(ms.reduce((x, y) => x + y, 0) / ms.length).toFixed(2);
        res.p95 = +ms[Math.ceil(ms.length * 0.95) - 1].toFixed(2);
      }
      // (the ND systems' own share of a step)
      g.systems.resetTimings?.();
      for (let i = 0; i < 30; i++) g.step(1 / 60);
      const sys = g.systems.telemetry();
      res.nd = Object.fromEntries(Object.entries(sys).filter(([k]) => k.startsWith('nd-')).map(([k, v]) => [k, +((v.ms?.total ?? 0) / 30).toFixed(3)]));
      return res;
    }, ON_GPU ? 60 : 0);
    const fails = [];
    if (fig.p95 !== undefined && fig.p95 > budget.frameMs) fails.push(`P95 ${fig.p95} ms > ${budget.frameMs}`);
    if (fig.calls > budget.calls) fails.push(`${fig.calls} calls > ${budget.calls}`);
    if (fig.triangles > budget.triangles) fails.push(`${(fig.triangles / 1e6).toFixed(2)} M triangles > ${budget.triangles / 1e6}`);
    if (fails.length) over++;
    await page.screenshot({ path: path.join(out, `${label}_${t.prefab}.png`) });
    report.cards.push({ ...t, ...fig, fails });
    console.log(`${fails.length ? 'OVER' : 'ok  '} ${t.prefab.padEnd(14)} ${(t.s / 1000).toFixed(1).padStart(6)} km  ${fig.ms ?? '-'} ms (P95 ${fig.p95 ?? '-'})  ${fig.calls} calls (${fig.shadowCalls} in shadows)  ${(fig.triangles / 1e6).toFixed(2)} M tris on screen  — calls by kind ${Object.entries(fig.kinds).map(([k, v]) => `${k} ${v}`).join(', ')}${fails.length ? '  ← ' + fails.join('; ') : ''}`);
    if (process.env.ND9_DETAIL) console.log(`     busiest: ${fig.busy.map(([n, c]) => `${n} ${c}`).join(' | ')}  nd systems ${JSON.stringify(fig.nd)}`);
  }
  report.errors = errors.slice(0, 8);
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  fs.writeFileSync(path.join(out, `${label}.json`), JSON.stringify(report, null, 1));
  await browser.close();
  await server.close();
}
console.log(over ? `${over} building(s) over the budget or not found` : "every building within the budget", `— loop/shots/nd9_perf/${label}.json`);
process.exit(over ? 1 : 0);
