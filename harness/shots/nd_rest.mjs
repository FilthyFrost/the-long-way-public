// Nothing sinks or interpenetrates (docs/V3/plan/finish.md §十九, step 6): the thin things — a cassette, a field-guide
// page, a blueprint, a photo — put down with the game's own drop (ModPlayer.putDown: in front, onto whatever is there)
// on the road, on the short grass beside it, in the meadow, on a table and on a treasure chest, each measured against
// what is drawn under it: a ray straight down through the drawn road strip and terrain leaves, or through the table's
// and the chest's own meshes. Then one thing of every sort (cassettes, guide pages, blueprints, photos, cans, food,
// cookware, tools, parts, furniture) let fall on the grass side by side, measured the same way; no two things' boxes
// overlap (shrunk to 85 %, as Nomad Drive tests a drop); a cassette over the chest lands on its lid and falls to the
// ground when the chest is taken away; a drop into the chest's side is refused; a thing thrown comes to rest.
//   SHOTS_GPU=1 node harness/shots/nd_rest.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = process.argv[2] || path.join(ROOT, 'loop/shots/nd_rest');
fs.mkdirSync(out, { recursive: true });
const log = [];
const say = (...a) => {
  const s = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  console.log(s);
  log.push(s);
};
const fails = [];
const check = (ok, what) => {
  if (!ok) fails.push(what);
  say(ok ? 'ok  ' : 'FAIL', what);
};
const THIN = ['nd_tape_01', 'forage_page_mushroom', 'bp_tire_kit', 'nd_photo'];
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:pickup&time=13&weather=clear`, { width: 1280, height: 720 });
  const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
  const frames = (n) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.step(1 / 60, 1); }, n);
  const shot = async (f) => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, f) });
    say('shot', f);
  };
  for (let i = 0; i < 30; i++) await step(4);
  // the measuring tools, in the page
  await page.evaluate(() => {
    const g = window.__rt.game;
    const V = g.player.ray.origin.constructor;
    const Ray = g.player.ray.constructor;
    const a = new V(), b = new V(), c = new V(), hit = new V();
    /** the highest point of these meshes straight under (x, z) (world), or null */
    const downOn = (meshes, x, z) => {
      const o = g.core.origin;
      const ray = new Ray(new V(x - o.x, 1e4, z - o.z), new V(0, -1, 0));
      let best = -Infinity;
      const tri = (pos, idx, t, mat) => {
        a.fromBufferAttribute(pos, idx ? idx.getX(t) : t).applyMatrix4(mat);
        b.fromBufferAttribute(pos, idx ? idx.getX(t + 1) : t + 1).applyMatrix4(mat);
        c.fromBufferAttribute(pos, idx ? idx.getX(t + 2) : t + 2).applyMatrix4(mat);
        if (ray.intersectTriangle(a, b, c, false, hit) && hit.y > best) best = hit.y;
      };
      for (const m of meshes) {
        m.updateMatrixWorld(true);
        const geo = m.geometry;
        const pos = geo.attributes.position;
        const idx = geo.index;
        if (m.isBatchedMesh) {
          const mat = new m.matrixWorld.constructor();
          for (let ii = 0; ii < (m._instanceInfo?.length ?? 0); ii++) {
            const info = m._instanceInfo[ii];
            if (!info || !info.active || !info.visible) continue;
            m.getMatrixAt(ii, mat);
            mat.premultiply(m.matrixWorld);
            const range = m._geometryInfo[info.geometryIndex];
            const bb = range.boundingBox;
            if (bb) {
              const lo = new V(bb.min.x, 0, bb.min.z).applyMatrix4(mat);
              const hi = new V(bb.max.x, 0, bb.max.z).applyMatrix4(mat);
              if (x - o.x < Math.min(lo.x, hi.x) - 1 || x - o.x > Math.max(lo.x, hi.x) + 1 || z - o.z < Math.min(lo.z, hi.z) - 1 || z - o.z > Math.max(lo.z, hi.z) + 1) continue;
            }
            for (let t = range.indexStart; t < range.indexStart + range.indexCount; t += 3) tri(pos, idx, t, mat);
          }
        } else {
          if (!geo.boundingBox) geo.computeBoundingBox();
          const bb = geo.boundingBox;
          const lo = new V(bb.min.x, 0, bb.min.z).applyMatrix4(m.matrixWorld);
          const hi = new V(bb.max.x, 0, bb.max.z).applyMatrix4(m.matrixWorld);
          if (x - o.x < Math.min(lo.x, hi.x) - 2 || x - o.x > Math.max(lo.x, hi.x) + 2 || z - o.z < Math.min(lo.z, hi.z) - 2 || z - o.z > Math.max(lo.z, hi.z) + 2) continue;
          const n = idx ? idx.count : pos.count;
          for (let t = 0; t < n; t += 3) tri(pos, idx, t, m.matrixWorld);
        }
      }
      return Number.isFinite(best) ? best + o.y : null;
    };
    const drawnMeshes = () => {
      const list = [];
      g.core.scene.getObjectByName('world')?.traverse((m) => {
        if ((m.isMesh || m.isBatchedMesh) && /world:(terrain|road)/.test(m.name)) list.push(m);
      });
      return list;
    };
    const meshesOf = (l) => {
      const list = [];
      l.obj.traverse((m) => { if (m.isMesh) list.push(m); });
      return list;
    };
    /** a thing's shape as it lies: its box in its own frame (from its meshes' vertices), its lowest point (world) */
    const shapeOf = (l) => {
      l.obj.updateMatrixWorld(true);
      const inv = l.obj.matrixWorld.clone().invert();
      const o = g.core.origin;
      const v = new V();
      const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
      let low = Infinity;
      for (const m of meshesOf(l)) {
        const pos = m.geometry.attributes.position;
        const rel = inv.clone().multiply(m.matrixWorld);
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
          if (v.y < low) low = v.y;
          v.fromBufferAttribute(pos, i).applyMatrix4(rel);
          box.minX = Math.min(box.minX, v.x); box.maxX = Math.max(box.maxX, v.x);
          box.minY = Math.min(box.minY, v.y); box.maxY = Math.max(box.maxY, v.y);
          box.minZ = Math.min(box.minZ, v.z); box.maxZ = Math.max(box.maxZ, v.z);
        }
      }
      return { box, low: low + o.y };
    };
    /** the corners of its footprint (10 % in from its edges) and its middle, world */
    const footOf = (l, box) => {
      const c = Math.cos(l.yaw), s = Math.sin(l.yaw);
      const pts = [];
      for (const [u, w] of [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) {
        const lx = box.minX + (box.maxX - box.minX) * u;
        const lz = box.minZ + (box.maxZ - box.minZ) * w;
        pts.push([l.x + lx * c - lz * s, l.z + lx * s + lz * c]);
      }
      return pts;
    };
    /** how a thing lies on what is drawn under it (or on a thing's meshes): its bottom over the surface at its middle, the most any of its corners is under it */
    window.__measure = (l, on = null) => {
      const { box, low } = shapeOf(l);
      const meshes = on ? meshesOf(on) : drawnMeshes();
      const pts = footOf(l, box);
      const under = pts.map(([x, z]) => downOn(meshes, x, z));
      const mid = under[0];
      const sunk = Math.max(...under.filter((u) => u !== null).map((u) => u - low));
      return { id: l.item?.item ?? l.part?.part ?? l.tool?.kind, h: +(box.maxY - box.minY).toFixed(4), gap: mid === null ? null : +(low - mid).toFixed(4), sunk: +sunk.toFixed(4), resting: l.resting };
    };
    /** pairs of things whose boxes (shrunk to 85 %) overlap: by their footprints (turned boxes) and heights */
    window.__overlaps = (list) => {
      const sh = list.map((l) => {
        const { box } = shapeOf(l);
        const k = 0.85;
        const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2, cz = (box.minZ + box.maxZ) / 2;
        const c = Math.cos(l.yaw), s = Math.sin(l.yaw);
        return { l, x: l.x + cx * c - cz * s, z: l.z + cx * s + cz * c, hx: ((box.maxX - box.minX) / 2) * k, hz: ((box.maxZ - box.minZ) / 2) * k, y0: l.y + cy - ((box.maxY - box.minY) / 2) * k, y1: l.y + cy + ((box.maxY - box.minY) / 2) * k, yaw: l.yaw };
      });
      const sep = (A, B) => {
        for (const r of [A, B]) {
          for (const [ax, az] of [[Math.cos(r.yaw), Math.sin(r.yaw)], [-Math.sin(r.yaw), Math.cos(r.yaw)]]) {
            const reach = (q) => q.hx * Math.abs(Math.cos(q.yaw) * ax + Math.sin(q.yaw) * az) + q.hz * Math.abs(-Math.sin(q.yaw) * ax + Math.cos(q.yaw) * az);
            if (Math.abs((B.x - A.x) * ax + (B.z - A.z) * az) > reach(A) + reach(B)) return true;
          }
        }
        return false;
      };
      const pairs = [];
      for (let i = 0; i < sh.length; i++)
        for (let j = i + 1; j < sh.length; j++) {
          const A = sh[i], B = sh[j];
          // (one lying on the other — its top, a chair's seat inside its box — is no overlap, as Nomad Drive leaves out the surface a thing is put on)
          if (A.l.under === B.l || B.l.under === A.l) continue;
          if (A.y1 <= B.y0 || B.y1 <= A.y0 || sep(A, B)) continue;
          pairs.push([A.l.item?.item ?? A.l.part?.part ?? A.l.tool?.kind, B.l.item?.item ?? B.l.part?.part ?? B.l.tool?.kind]);
        }
      return pairs;
    };
  });
  const base = await page.evaluate(() => {
    const g = window.__rt.game;
    if (g.seated) g.getOut();
    const v = g.vehicles[0];
    const b = new Float64Array(9);
    v.sim.basis(b);
    return { x: v.sim.px, z: v.sim.pz, fx: b[0], fz: b[2], sx: b[6], sz: b[8] };
  });
  // a spot `off` metres to the vehicle's left (negative: right), `ahead` along it
  const spotAt = (off, ahead) => ({ x: base.x - base.sx * off + base.fx * ahead, z: base.z - base.sz * off + base.fz * ahead });
  /** stand so that the game's drop (0.8 m ahead) comes down on (x, z), facing away from the road */
  const dropOn = async (id, at, heading) => {
    return page.evaluate(({ id, at, heading }) => {
      const g = window.__rt.game;
      const w = g.player.walker;
      w.place(at.x - Math.cos(heading) * 0.8, at.z - Math.sin(heading) * 0.8, heading);
      g.input.lookYaw = heading;
      g.input.lookPitch = -0.5;
      g.simulate(0);
      window.__rt.hold(`item:${id}`);
      const before = g.loose.list.length;
      const ok = g.player.putDown();
      g.simulate(0);
      return { ok, made: g.loose.list.length > before, held: !!g.player.held, said: g.ui?.items?.doneText?.() ?? null };
    }, { id, at, heading });
  };
  const lastThings = (n) => page.evaluate((n) => { window.__last = window.__rt.game.loose.list.slice(-n); return window.__last.length; }, n);
  const settle = async () => {
    await frames(90);
    await page.evaluate(() => window.__rt.game.loose.settled());
    await frames(20);
  };
  const away = Math.atan2(-base.sz, -base.sx);
  const along = Math.atan2(base.fz, base.fx);
  // ---------------------------------------------------------------- the four thin things on the road, the verge, the meadow
  for (const [name, off, ahead] of [['road', 0.6, 9], ['verge', 5.6, 4], ['meadow', 40, 4]]) {
    const spot = spotAt(off, ahead);
    // (the player there first, so the world round it is drawn at its finest)
    await page.evaluate(({ spot, away }) => window.__rt.stand(spot.x - Math.cos(away) * 2, spot.z - Math.sin(away) * 2, away, -0.4), { spot, away });
    for (let i = 0; i < 20; i++) await step(3);
    const res = [];
    for (let i = 0; i < THIN.length; i++) {
      const at = { x: spot.x + Math.cos(along) * (i - 1.5) * 0.3, z: spot.z + Math.sin(along) * (i - 1.5) * 0.3 };
      res.push(await dropOn(THIN[i], at, away));
    }
    await settle();
    await lastThings(THIN.length);
    const m = await page.evaluate(() => window.__last.map((l) => window.__measure(l)));
    say(name, JSON.stringify(m));
    for (const r of m) check(r.gap !== null && r.sunk <= 0.003 && -r.sunk <= 0.012, `${name}: ${r.id} on the drawn ground (none of it under it: ${r.sunk}; its middle ${r.gap} over it)`);
    const y = await page.evaluate((spot) => window.__rt.game.loose.surfaceAt(spot.x, spot.z, 1e4), spot);
    await page.evaluate(({ spot, y, away }) => window.__rt.aimPoint(spot.x, y + 0.02, spot.z, away + Math.PI, 1.0), { spot, y, away });
    await frames(4);
    await shot(`1_${name}_thin_things.png`);
    await page.evaluate(() => { const g = window.__rt.game; for (const l of window.__last) g.loose.remove(l); });
  }
  // ---------------------------------------------------------------- a table and a treasure chest on the verge
  const T = spotAt(9, 2);
  const C = spotAt(9, 3.6);
  await page.evaluate(({ T, away }) => window.__rt.stand(T.x - Math.cos(away) * 2.5, T.z - Math.sin(away) * 2.5, away, -0.3), { T, away });
  for (let i = 0; i < 20; i++) await step(3);
  await page.evaluate(async ({ T, C, along }) => {
    const g = window.__rt.game;
    const M = await import('/src/core/modcar/items.ts');
    const t = g.loose.addItem(M.newItem('nd_table'), T.x, g.loose.surfaceAt(T.x, T.z, 1e4) + 0.3, T.z, along);
    g.loose.drop(t);
    const c = g.loose.addItem(M.newItem('nd_chest_1'), C.x, g.loose.surfaceAt(C.x, C.z, 1e4) + 0.3, C.z, along);
    g.loose.drop(c);
    window.__table = t;
    window.__chest = c;
  }, { T, C, along });
  await settle();
  const furn = await page.evaluate(() => [window.__measure(window.__table), window.__measure(window.__chest)]);
  say('furniture', JSON.stringify(furn));
  // (a table on the verge's slope stands on its uphill legs, as Nomad Drive's would: none of it in the ground, touching it)
  for (const r of furn) check(r.gap !== null && r.sunk <= 0.003 && -r.sunk <= 0.02, `${r.id} on the drawn ground (none of it under it: ${r.sunk}; its middle ${r.gap} over it)`);
  // the thin things onto the table's top, a little apart
  for (let i = 0; i < THIN.length; i++) {
    const at = { x: T.x + Math.cos(along) * (i - 1.5) * 0.22, z: T.z + Math.sin(along) * (i - 1.5) * 0.22 };
    say('drop on the table', JSON.stringify(await dropOn(THIN[i], at, away)));
  }
  await settle();
  await lastThings(THIN.length);
  const onTable = await page.evaluate(() => window.__last.map((l) => window.__measure(l, window.__table)));
  say('on the table', JSON.stringify(onTable));
  for (const r of onTable) check(r.gap !== null && r.gap >= -0.001 && r.gap <= 0.012, `table: ${r.id} on the table's top (gap ${r.gap})`);
  const ty = await page.evaluate(() => window.__table.y);
  await page.evaluate(({ T, ty, away }) => window.__rt.aimPoint(T.x, ty + 0.75, T.z, away + Math.PI, 1.1), { T, ty, away });
  await frames(4);
  await shot('2_table_thin_things.png');
  const tableThings = await page.evaluate(() => (window.__onTable = window.__last).length);
  void tableThings;
  // a cassette onto the chest's lid (and the other three beside it, as far as they fit)
  const chestRes = [];
  for (let i = 0; i < THIN.length; i++) {
    const at = { x: C.x + Math.cos(along) * (i - 1.5) * 0.17, z: C.z + Math.sin(along) * (i - 1.5) * 0.17 };
    chestRes.push(await dropOn(THIN[i], at, away));
  }
  say('drops on the chest', JSON.stringify(chestRes));
  await settle();
  await lastThings(chestRes.filter((r) => r.made).length);
  const onChest = await page.evaluate(() => window.__last.map((l) => window.__measure(l, window.__chest)));
  say('on the chest', JSON.stringify(onChest));
  // (its lid is round: a thing near its edge lies level on its crown, its middle a few centimetres over the curve — none of it in the lid)
  const tape = onChest.find((r) => r.id === 'nd_tape_01');
  check(!!tape && tape.gap !== null && tape.gap >= -0.001 && tape.gap <= 0.05 && tape.sunk <= 0.003, `chest: the cassette on its lid (gap ${tape?.gap}, deepest corner under the lid ${tape?.sunk})`);
  for (const r of onChest) if (r.id !== 'nd_tape_01') check(r.gap !== null && r.gap >= -0.001 && r.gap <= 0.05 && r.sunk <= 0.003, `chest: ${r.id} on its lid (gap ${r.gap}, deepest corner under the lid ${r.sunk})`);
  const cy = await page.evaluate(() => window.__chest.y);
  await page.evaluate(({ C, cy, away }) => window.__rt.aimPoint(C.x, cy + 0.4, C.z, away + Math.PI, 1.1), { C, cy, away });
  await frames(4);
  await shot('3_chest_thin_things.png');
  // nothing in the scene overlaps
  const pairs = await page.evaluate(() => window.__overlaps([window.__table, window.__chest, ...window.__onTable, ...window.__last]));
  check(pairs.length === 0, `no two things' boxes overlap at 85 % (${JSON.stringify(pairs)})`);
  // the chest taken away: what lay on its lid comes down onto the ground
  const fell = await page.evaluate(async () => {
    const g = window.__rt.game;
    g.loose.remove(window.__chest);
    for (let i = 0; i < 90; i++) g.step(1 / 60, 1);
    await g.loose.settled();
    return window.__last.filter((l) => g.loose.list.includes(l)).map((l) => window.__measure(l));
  });
  say('the chest taken away', JSON.stringify(fell));
  for (const r of fell) check(r.gap !== null && r.sunk <= 0.003 && -r.sunk <= 0.012, `chest gone: ${r.id} came down onto the ground (none of it under it: ${r.sunk})`);
  await page.evaluate(() => { const g = window.__rt.game; for (const l of [...window.__last, ...window.__onTable, window.__table]) if (g.loose.list.includes(l)) g.loose.remove(l); });
  // ---------------------------------------------------------------- one of every sort, let fall on the grass side by side
  const G = spotAt(14, 0);
  await page.evaluate(({ G, away }) => window.__rt.stand(G.x - Math.cos(away) * 3, G.z - Math.sin(away) * 3, away, -0.4), { G, away });
  for (let i = 0; i < 20; i++) await step(3);
  const sorts = await page.evaluate(async ({ G, along, away }) => {
    const g = window.__rt.game;
    const M = await import('/src/core/modcar/items.ts');
    const P = await import('/src/core/modcar/parts.ts');
    const B = await import('/src/core/modcar/build.ts');
    const Tl = await import('/src/core/modcar/tools.ts');
    const firstOf = (re) => M.ITEMS.find((d) => re.test(d.id))?.id;
    const items = ['nd_tape_05', firstOf(/^forage_page_/), 'bp_tire_kit', 'nd_photo', 'drink_soda', 'food_fish_can', firstOf(/^food_bread|^food_/), firstOf(/pan|pot|kettle/), 'nd_chair', 'nd_key_1', 'nd_seeds_potato', firstOf(/rod_/)].filter(Boolean);
    const parts = [P.PARTS.find((p) => p.cat === 'rim')?.id, P.PARTS.find((p) => p.cat === 'engine')?.id, P.PARTS.find((p) => p.cat === 'battery')?.id].filter(Boolean);
    const tools = ['jerrycan', 'spray', 'scraper'];
    const made = [];
    let k = 0;
    const at = () => {
      const i = k++;
      const u = (i % 6) - 2.5;
      const w = Math.floor(i / 6) * 1.3;
      return { x: G.x + Math.cos(along) * u * 1.2 + Math.cos(away) * w, z: G.z + Math.sin(along) * u * 1.2 + Math.sin(away) * w };
    };
    for (const id of items) { const p = at(); made.push(g.loose.addItem(M.newItem(id), p.x, g.loose.surfaceAt(p.x, p.z, 1e4) + 1, p.z, 0.4)); }
    for (const id of parts) { const p = at(); made.push(g.loose.addPart(B.newInstance(id), p.x, g.loose.surfaceAt(p.x, p.z, 1e4) + 1, p.z, 0.4)); }
    for (const kind of tools) { const p = at(); made.push(g.loose.addTool(Tl.newTool(kind), p.x, g.loose.surfaceAt(p.x, p.z, 1e4) + 1, p.z, 0.4)); }
    for (const l of made) g.loose.drop(l);
    window.__sorts = made;
    return made.length;
  }, { G, along, away });
  say('sorts let fall', sorts);
  await settle();
  const sm = await page.evaluate(() => window.__sorts.map((l) => window.__measure(l)));
  say('sorts', JSON.stringify(sm));
  for (const r of sm) check(r.gap !== null && r.sunk <= 0.003 && -r.sunk <= 0.02, `grass: ${r.id} on the drawn ground (none of it under it: ${r.sunk}; its middle ${r.gap} over it)`);
  const gy = await page.evaluate((G) => window.__rt.game.loose.surfaceAt(G.x, G.z, 1e4), G);
  await page.evaluate(({ G, gy, away }) => window.__rt.aimPoint(G.x + Math.cos(away) * 0.6, gy + 0.1, G.z + Math.sin(away) * 0.6, away + Math.PI, 3.2), { G, gy, away });
  await frames(4);
  await shot('4_every_sort_on_grass.png');
  // ---------------------------------------------------------------- a drop into a chest's side is refused; a throw comes to rest
  const extra = await page.evaluate(async ({ G, away }) => {
    const g = window.__rt.game;
    const M = await import('/src/core/modcar/items.ts');
    for (const l of window.__sorts) g.loose.remove(l);
    const r = {};
    // (a chest on the grass; the drop's point at its side's edge: the cassette would go into its wall)
    const cx = G.x, cz = G.z;
    const chest = g.loose.addItem(M.newItem('nd_chest_1'), cx, g.loose.surfaceAt(cx, cz, 1e4) + 0.2, cz, away);
    g.loose.drop(chest);
    for (let i = 0; i < 60; i++) g.step(1 / 60, 1);
    await g.loose.settled();
    for (let i = 0; i < 10; i++) g.step(1 / 60, 1);
    window.__chest2 = chest;
    if (g.loose.dropPose) {
      const w = g.player.walker;
      // the drop point just off the chest's side (its middle 3 cm out from it): a seed packet there would be 4 cm into its wall
      const box = g.loose.snugBoxOf(chest);
      const half = box ? (box.maxX - box.minX) / 2 : 0.3;
      const px = cx + Math.cos(away) * (half + 0.03);
      const pz = cz + Math.sin(away) * (half + 0.03);
      w.place(px - Math.cos(away) * 0.8, pz - Math.sin(away) * 0.8, away);
      g.simulate(0);
      window.__rt.hold('item:nd_seeds_potato');
      // (its box measured from its model while it is in the hands, as it is by the time one lets it go)
      for (let i = 0; i < 20; i++) {
        g.step(1 / 60, 1);
        await new Promise((res) => setTimeout(res, 20));
      }
      const before = g.loose.list.length;
      r.refused = !g.player.putDown();
      r.stillHeld = !!g.player.held;
      r.made = g.loose.list.length - before;
      window.__clearAt = { x: px + Math.cos(away) * 0.09 - Math.cos(away) * 0.8, z: pz + Math.sin(away) * 0.09 - Math.sin(away) * 0.8 };
    }
    return r;
  }, { G, away });
  if ('refused' in extra) {
    // (the words said, as the player sees them)
    await page.evaluate(({ G, away }) => { const g = window.__rt.game; const w = g.player.walker; g.input.lookPitch = -0.6; g.input.lookYaw = away; g.simulate(0); }, { G, away });
    await frames(2);
    await shot('5_drop_refused.png');
    extra.clearDropped = await page.evaluate(({ away }) => {
      const g = window.__rt.game;
      g.player.walker.place(window.__clearAt.x, window.__clearAt.z, away);
      g.simulate(0);
      return g.player.putDown();
    }, { away });
  }
  Object.assign(extra, await page.evaluate(async ({ G, away }) => {
    const g = window.__rt.game;
    const M = await import('/src/core/modcar/items.ts');
    const r = {};
    const cx = G.x, cz = G.z;
    // a thing thrown: it flies, comes down, slides and stops
    if (g.loose.fling) {
      const w = g.player.walker;
      w.place(cx - Math.cos(away) * 4, cz - Math.sin(away) * 4, away + 0.6);
      g.simulate(0);
      const l = g.loose.addItem(M.newItem('drink_soda'), w.x + Math.cos(away + 0.6) * 0.4, w.y + 1.3, w.z + Math.sin(away + 0.6) * 0.4, 0);
      g.loose.fling(l, { x: Math.cos(away + 0.6) * 6, y: 2.5, z: Math.sin(away + 0.6) * 6 });
      let t = 0;
      while (!l.resting && t < 10) {
        g.step(1 / 60, 1);
        t += 1 / 60;
      }
      r.throw = { restedAfterS: +t.toFixed(2), resting: l.resting, dist: +Math.hypot(l.x - w.x, l.z - w.z).toFixed(2) };
      window.__thrown = l;
    }
    return r;
  }, { G, away }));
  say('refusal and throw', JSON.stringify(extra));
  if ('refused' in extra) {
    check(extra.refused && extra.stillHeld && extra.made === 0, 'a drop into the chest\'s side is refused and the thing stays in the hands');
    check(extra.clearDropped, 'a little further out, clear of the chest, it is let go');
  }
  if (extra.throw) {
    check(extra.throw.resting && extra.throw.restedAfterS < 8, `a thrown can comes to rest (${extra.throw.restedAfterS} s, ${extra.throw.dist} m out)`);
    const tm = await page.evaluate(() => window.__measure(window.__thrown));
    say('thrown', JSON.stringify(tm));
    check(tm.gap !== null && tm.sunk <= 0.003 && -tm.sunk <= 0.012, `the thrown can lies on the drawn ground (none of it under it: ${tm.sunk})`);
  }
  if (errors.length) say('page errors:', errors.slice(0, 8).join('\n'));
  say(fails.length ? `FAILED ${fails.length}` : 'all ok');
} finally {
  fs.writeFileSync(path.join(out, 'log.txt'), log.join('\n'));
  await browser.close();
  await server.close();
}
process.exitCode = fails.length ? 1 : 0;
