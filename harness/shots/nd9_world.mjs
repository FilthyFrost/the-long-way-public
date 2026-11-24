// ND9 (docs/V3/plan/growth.md §三, its last paragraph), in the game: a new game's world (version 6) has Nomad Drive's
// buildings among our places. Down its road, one of each sort found there — the filling station, a home, a works, the
// camp, a tower, the graveyard, two small places — gone to (devGoKm) and looked at from the road and close to:
// drawn, on its own levelled ground (neither floating nor sunk), clear of the road and of the other places, furnished,
// its boxes for the plan's finds there; at one, a planned find lying in its box; a vehicle to find in a big one's yard.
//   SHOTS_GPU=1 node harness/shots/nd9_world.mjs [seed]   (no seed: the game's own, a new game's)
// Pictures: loop/shots/nd9/ (a seed asked for: loop/shots/nd9/seed<N>/)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const seed = process.argv[2] ?? '';
const out = path.join(ROOT, 'loop/shots/nd9', seed ? `seed${seed}` : '');
fs.mkdirSync(out, { recursive: true });
let bad = 0;
const check = (cond, why) => {
  console.log(cond ? 'ok  ' : 'FAIL', why);
  if (!cond) bad++;
};

/** the sorts of place to go to, the first of each down the road (the small ones: two of them) */
const GROUPS = [
  ['filling station', ['station'], 1],
  ['home', ['cabin', 'motel', 'commune', 'starter'], 1],
  ['works', ['factory1', 'factory2', 'factory3', 'containeryard', 'radiostation', 'windfarm'], 1],
  ['camp', ['camp'], 1],
  ['tower', ['watchtower', 'watertower'], 1],
  ['graveyard', ['graveyard'], 1],
  ['small place', ['busstop', 'toilets', 'mailboxes', 'pump', 'windmill', 'hays', 'crosses', 'wreck1', 'wreck2', 'wreck3'], 2],
];

const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  // (a new game of the newest world: the address names its version, as the harness's browser would else make it 1)
  const { page, errors } = await openGame(browser, `${url}/modcar.html?new=1&shot=1&world=6${seed ? `&seed=${seed}` : ''}&time=11&weather=clear`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
  const sim = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
  const info = await page.evaluate(() => ({ seed: window.__rt.game.params.seed, version: window.__rt.game.world.rules.version }));
  console.log(`a new game: world ${info.version}, seed ${info.seed}`);
  check(info.version === 6, `a new game's world is of version 6 (${info.version})`);

  // the world's places down the road, Nomad Drive's among them, and what of the plan each holds (the game's planner, as the robot traveller lays it)
  const all = await page.evaluate(async () => {
    const g = window.__rt.game;
    const S = await import('/src/core/modcar/schedule.ts');
    const L = await import('/src/core/modcar/loot.ts');
    const sites = [];
    g.world.sites.between(0, 160_000, sites);
    sites.sort((a, b) => a.s - b.s);
    const planner = new S.SitePlanner(S.placesPlan(g.params.seed, 4000, g.difficulty));
    planner.take(sites.map((x) => ({ id: x.id, s: x.s, kind: x.kind, boxes: L.planBoxes(x).length, ground: L.planGround(x) })));
    const places = sites.filter((x) => !(x.kind === 'roadside' && !x.prefab)).map((x) => ({ id: x.id, s: x.s, halfL: x.halfL, slot: x.slot }));
    return {
      places,
      nd: sites
        .filter((x) => x.prefab)
        .map((x) => {
          const o = x.objects.find((q) => q.kind === 'prefab');
          return { id: x.id, prefab: x.prefab, kind: x.kind, s: x.s, slot: x.slot, x: o.x, y: o.y, z: o.z, yaw: o.yaw, w: o.w, d: o.d, h: o.h, flat: x.flat, ax: x.x, az: x.z, e2x: x.e2x, e2z: x.e2z, halfL: x.halfL, boxes: L.planBoxes(x).map((c) => ({ id: c.id, x: c.x, y: c.y + c.shelf, z: c.z, floor: c.y })), finds: planner.findsAt(x.id).map((f) => f.entry), loose: x.loose.length };
        }),
    };
  });
  console.log(`down the first 160 km: ${all.nd.length} of Nomad Drive's places — ${all.nd.map((x) => `${x.prefab} ${(x.s / 1000).toFixed(1)}`).join(', ')}`);
  check(all.nd.length >= 10, `Nomad Drive's places along the road (${all.nd.length} in 160 km)`);

  // which to go to: the first of each sort; and the first with the plan's finds in its boxes
  const go = [];
  for (const [what, ids, n] of GROUPS) {
    const seen = new Set();
    for (const x of all.nd) {
      if (go.filter((g) => g.what === what).length >= n) break;
      if (!ids.includes(x.prefab) || seen.has(x.prefab)) continue;
      seen.add(x.prefab);
      go.push({ what, ...x });
    }
    if (!go.some((g) => g.what === what)) console.log(`(no ${what} in the first 160 km)`);
  }
  const withFinds = all.nd.find((x) => x.boxes.length && x.finds.length);
  if (withFinds && !go.some((g) => g.id === withFinds.id)) go.push({ what: 'planned find', ...withFinds });
  go.sort((a, b) => a.s - b.s);
  check(new Set(go.map((g) => g.what)).size >= 6, `six sorts at least to go to (${[...new Set(go.map((g) => g.what))].join(', ')})`);

  let n = 0;
  let planned = 0;
  for (const t of go) {
    n++;
    const tag = `${String(n).padStart(2, '0')}_${t.prefab}`;
    console.log(`\n${t.what}: ${t.prefab} (${t.kind}) at ${(t.s / 1000).toFixed(2)} km, ${t.id}`);
    // (the building's frame: u along its length, v away from the road; and where it stands)
    const W = (u, v) => ({ x: t.x + Math.cos(t.yaw) * u - Math.sin(t.yaw) * v, z: t.z + Math.sin(t.yaw) * u + Math.cos(t.yaw) * v });
    await rt('devGoKm', t.s / 1000, false);
    const far = Math.max(16, Math.min(70, Math.max(t.w * 0.75, t.h * 0.9)));
    const from = W(0, -t.d / 2 - far);
    // (a tall one looked up at: its top in view)
    const up = Math.min(0.32, Math.max(0, Math.atan2(t.h * 0.5 - 1.6, far + t.d / 2)));
    await page.evaluate(({ a, t, up }) => window.__rt.stand(a.x, a.z, Math.atan2(t.z - a.z, t.x - a.x), up), { a: from, t, up });
    let state = null;
    for (let i = 0; i < 120; i++) {
      await sim(4);
      state = await page.evaluate((id) => {
        const g = window.__rt.game;
        const drawn = g.systems.harness('nd-build', 'drawn').find((d) => d.site === id);
        const lp = g.places?.telemetry().live.find((x) => x.id === id);
        return { pending: window.__rt.worldPending(), ready: !!drawn?.ready, live: lp ?? null };
      }, t.id);
      if (state.pending <= 0 && state.ready && state.live && state.live.laid === state.live.containers) break;
      await page.waitForTimeout(40);
    }
    check(state.ready, `${t.prefab}: drawn, its model in`);
    check(!!state.live && state.live.containers === t.boxes.length, `${t.prefab}: there as a place with its ${t.boxes.length} boxes for the plan (${state.live?.containers ?? '–'})`);
    // on its own ground: the land under its corners and its middle at its floor's foot (its levelled ground's height)
    const ground = await page.evaluate((t) => {
      const g = window.__rt.game;
      const W = (u, v) => ({ x: t.x + Math.cos(t.yaw) * u - Math.sin(t.yaw) * v, z: t.z + Math.sin(t.yaw) * u + Math.cos(t.yaw) * v });
      return [[0, 0], [-t.w / 2, -t.d / 2], [t.w / 2, -t.d / 2], [-t.w / 2, t.d / 2], [t.w / 2, t.d / 2]].map(([u, v]) => {
        const p = W(u, v);
        return +(g.world.heightAt(p.x, p.z) - t.flat).toFixed(3);
      });
    }, t);
    check(ground.every((d) => Math.abs(d) < 0.08), `${t.prefab}: on its levelled ground, neither floating nor sunk (the land under its middle and corners ${ground.join(', ')} m off its foot)`);
    // clear of the road (its front behind where its levelled ground begins) and of the other places
    const front = (t.x - t.ax) * t.e2x + (t.z - t.az) * t.e2z - t.d / 2;
    check(front >= 6.6, `${t.prefab}: its front ${front.toFixed(1)} m from the road's middle (the road's edge at 4.5)`);
    const near = all.places.filter((p) => p.id !== t.id && Math.abs(p.s - t.s) < p.halfL + t.halfL);
    check(near.length === 0, `${t.prefab}: no other place on its levelled ground${near.length ? ` (${near.map((p) => p.id).join(', ')})` : ''}`);
    // furnished: its things lying about it
    const things = await page.evaluate((t) => window.__rt.game.loose.list.filter((l) => Math.hypot(l.x - t.x, l.z - t.z) < Math.hypot(t.w, t.d) / 2 + 4).map((l) => l.item?.item ?? l.tool?.kind ?? l.part?.part ?? '?'), t);
    console.log(`  its things (${things.length}): ${things.slice(0, 18).join(', ')}${things.length > 18 ? ' …' : ''}`);
    check(things.length > 0 || t.loose === 0, `${t.prefab}: furnished (${things.length} things about it)`);
    await page.evaluate(() => { const g = window.__rt.game; g.ui.showHelp(false); for (let i = 0; i < 3; i++) window.__rt.render(); });
    await page.screenshot({ path: path.join(out, `${tag}_a_from_the_road.png`) });
    // the plan's finds: in its boxes, lying where one sees them — at a small wreck place, which has none, on the ground by its wreck's door
    if (t.finds.length && !t.boxes.length) {
      const byWreck = await page.evaluate((id) => [...(window.__rt.game.places?.live?.get(id)?.loose?.keys() ?? [])].filter((k) => k.includes('/plan')), t.id);
      console.log(`  the plan's here: ${t.finds.join(', ')} — on the ground by its wreck: ${byWreck.join(', ')}`);
      check(byWreck.length >= t.finds.length, `${t.prefab}: the plan's ${t.finds.length} finds on the ground by its wreck (${byWreck.length})`);
    }
    if (t.finds.length && t.boxes.length) {
      const inBox = await page.evaluate((t) => {
        const g = window.__rt.game;
        return t.boxes.map((b) => {
          const pc = g.places?.containerOf(b.id);
          return { id: b.id, contents: pc?.contents?.map((h) => (h.kind === 'item' ? h.item.item : h.kind === 'tool' ? `tool:${h.tool.kind}` : h.inst.part)) ?? null, lying: pc?.things.length ?? 0 };
        });
      }, t);
      const got = inBox.flatMap((b) => b.contents ?? []);
      console.log(`  the plan's here: ${t.finds.join(', ')} — in its boxes: ${JSON.stringify(inBox.filter((b) => b.contents?.length))}`);
      check(got.length >= t.finds.length, `${t.prefab}: the plan's ${t.finds.length} finds in its boxes (${got.join(', ')})`);
      check(inBox.reduce((a, b) => a + b.lying, 0) >= got.length, `${t.prefab}: each lying in its box where one sees it`);
      planned++;
      // looked at, close to: the first box with something in it (its doors open: a locker's, a container's)
      const b = t.boxes.find((x) => inBox.find((y) => y.id === x.id)?.contents?.length);
      if (b) {
        const doors = await H('nd-build', 'doors', t.id);
        for (const d of doors) await H('nd-build', 'door', t.id, true, d.name);
        await sim(8);
        const thing = await page.evaluate((id) => {
          const l = window.__rt.game.places?.containerOf(id)?.things[0];
          return l ? { x: l.x, y: l.y + (l.mid ?? 0), z: l.z, uid: l.uid, shut: !!l.shut } : null;
        }, b.id);
        const at = thing ?? b;
        // (from the room's side, the first way round the mark falls on it from — on it as itself, or as the device it is —
        // stood on the floor it lies on, with nothing of the building between the eye and it: the eye not in a wall)
        const onIt = (m) => /^loose:/.test(m) || (!!thing && m.endsWith(`:${thing.uid}`));
        const floor = b.floor;
        const views = await page.evaluate(({ at, yaw, floor }) => {
          const g = window.__rt.game;
          const solids = [];
          g.world.sites.solidsNear(at.x, at.z, 4, solids);
          const inside = (x, y, z) => solids.some((s) => {
            if (y < s.y0 || y > s.y1) return false;
            const c = Math.cos(s.yaw), n = Math.sin(s.yaw);
            const u = (x - s.x) * c + (z - s.z) * n;
            const v = -(x - s.x) * n + (z - s.z) * c;
            return Math.abs(u) < s.hx + 0.05 && Math.abs(v) < (s.hz || s.hx) + 0.05;
          });
          const out = [];
          for (const dist of [1.4, 1.1, 0.9]) {
            for (let k = 0; k < 12; k++) {
              const from = yaw - Math.PI / 2 + (k * Math.PI) / 6;
              const ex = at.x + Math.cos(from) * dist, ez = at.z + Math.sin(from) * dist;
              // (the eye over the floor it lies on, and the body under it clear of the building too)
              const ey = floor + 1.6;
              let clear = !inside(ex, floor + 0.5, ez) && !inside(ex, floor + 1.2, ez);
              for (let i = 0; i <= 10 && clear; i++) {
                const f = i / 10;
                if (f > 0.85) break;
                if (inside(ex + (at.x - ex) * f, ey + (at.y - ey) * f, ez + (at.z - ez) * f)) clear = false;
              }
              if (clear) out.push({ from, dist });
            }
          }
          return out;
        }, { at, yaw: t.yaw, floor });
        // (stood there on that floor, looking at it: what the mark is on)
        const aimFrom = (v) => page.evaluate(({ at, v, floor }) => {
          const g = window.__rt.game;
          if (g.seated) g.getOut();
          const w = g.player.walker;
          g.viewMode = 'cockpit';
          w.place(at.x + Math.cos(v.from) * v.dist, at.z + Math.sin(v.from) * v.dist, v.from + Math.PI);
          for (let i = 0; i < 3; i++) {
            w.y = floor + 0.02;
            g.simulate(i ? 0.05 : 0);
            w.y = floor + 0.02;
            const eye = w.eye();
            g.input.lookYaw = Math.atan2(at.z - w.z, at.x - w.x);
            g.input.lookPitch = Math.atan2(at.y - eye.y, Math.hypot(at.x - w.x, at.z - w.z));
          }
          g.simulate(0);
          return String(g.player.telemetry().target);
        }, { at, v, floor });
        let m = '';
        for (const v of [...views, { from: t.yaw - Math.PI / 2, dist: 1.4 }]) {
          m = await aimFrom(v);
          if (onIt(m)) break;
        }
        await sim(4);
        check(onIt(m), `${t.prefab}: a find of the plan aimed at in its box (${m}${thing?.shut ? ', shut in' : ''})`);
        await page.evaluate(() => { const g = window.__rt.game; g.ui.showHelp(false); for (let i = 0; i < 3; i++) window.__rt.render(); });
        await page.screenshot({ path: path.join(out, `${tag}_c_a_planned_find.png`) });
      }
    }
    // close to: before its front, looking in
    const close = W(t.w > 12 ? t.w * 0.18 : 0, -t.d / 2 - Math.max(5, Math.min(14, t.w * 0.35)));
    const look = W(0, 0);
    await page.evaluate(({ a, b }) => window.__rt.stand(a.x, a.z, Math.atan2(b.z - a.z, b.x - a.x), 0.02), { a: close, b: look });
    await sim(10);
    await page.evaluate(() => { const g = window.__rt.game; g.ui.showHelp(false); for (let i = 0; i < 3; i++) window.__rt.render(); });
    await page.screenshot({ path: path.join(out, `${tag}_b_close_to.png`) });
  }
  check(planned > 0, `a planned find seen at one of them (${planned})`);

  // a vehicle to find in a big one's yard, if one comes in the first 160 km
  const finds = (await rt('wreckSpots', 0, 160_000)).filter((w) => w.findFrame);
  const yardFind = finds.find((w) => all.nd.some((x) => w.id.startsWith(`${x.id}/`)));
  console.log(`\nvehicles to find in 160 km: ${finds.map((w) => `${w.findFrame} ${(w.s / 1000).toFixed(1)} (${w.siteKind})`).join(', ')}`);
  if (yardFind) {
    const t = all.nd.find((x) => yardFind.id.startsWith(`${x.id}/`));
    console.log(`the ${yardFind.findFrame} in the yard of the ${t.prefab} at ${(t.s / 1000).toFixed(2)} km`);
    await rt('devGoKm', t.s / 1000, false);
    const a = { x: yardFind.x + Math.cos(t.yaw + Math.PI / 2) * -14, z: yardFind.z + Math.sin(t.yaw + Math.PI / 2) * -14 };
    await page.evaluate(({ a, b }) => window.__rt.stand(a.x, a.z, Math.atan2(b.z - a.z, b.x - a.x), -0.05), { a, b: yardFind });
    let there = null;
    for (let i = 0; i < 120; i++) {
      await sim(4);
      there = await page.evaluate((id) => ({ pending: window.__rt.worldPending(), live: (window.__rt.wrecks()?.list ?? []).find((l) => l.id === id) ?? null }), yardFind.id);
      if (there.pending <= 0 && there.live?.ready) break;
      await page.waitForTimeout(40);
    }
    check(!!there?.live, `the ${yardFind.findFrame} to find stands in the ${t.prefab}'s yard`);
    // (clear of the building: beyond its end)
    const u = (yardFind.x - t.x) * Math.cos(t.yaw) + (yardFind.z - t.z) * Math.sin(t.yaw);
    check(Math.abs(u) > t.w / 2, `beside the ${t.prefab}, not in it (${u.toFixed(1)} m along it, its half ${(t.w / 2).toFixed(1)})`);
    await page.evaluate(() => { const g = window.__rt.game; g.ui.showHelp(false); for (let i = 0; i < 3; i++) window.__rt.render(); });
    await page.screenshot({ path: path.join(out, `${String(n + 1).padStart(2, '0')}_${t.prefab}_yard_vehicle.png`) });
  } else console.log('(no vehicle to find at one of their yards in the first 160 km)');

  const errs = errors.filter((e) => !/favicon|404/.test(e));
  if (errs.length) console.log('errors:', errs.slice(0, 10).join('\n'));
  check(errs.length === 0, `no page errors (${errs.length})`);
  await page.close();
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
