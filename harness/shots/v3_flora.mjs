// The vegetation of a world of version 2 as the game draws it (docs/V3/nodes/W2-flora.md, the renderer's part).
//
// Three parts, all of them or the ones named on the command line:
//
//   regions   world=2: every region of the registry is gone to, and pictured at what makes it — a cluster of
//             towers or buttes, a terraced hillside, a lake's shore (wetland, lakes), a grove (the bamboo sea),
//             a field in rows (the flower fields), else well inside it — from three-quarter above the road and
//             from the driver's seat, by day; the flower fields and the bamboo sea from far back too. No error.
//   v1        world=1: two fixed spots (a plains and a forest stretch of seed 7), each from the driver's seat
//             and from above. A world of version 1 keeps the vegetation it had: these pictures are the same
//             before and after any work on version 2 (harness/shots/pixdiff.py between two runs' folders).
//   measure   the scatter's draw calls and triangles by the renderer's own counters (renderer.info, read once
//             with the trees and bushes drawn and once without), at a forest, the flower fields and the karst
//             in a world of version 2, and at a forest and a plains spot in a world of version 1.
//
// And one more, only when it is named: `sheet` sets every tree, shrub and ground plant of the catalogue out in
// rows beside the road, each in its near model with its far model behind it, and pictures the rows from across
// the road (for looking at the models themselves).
//
// Nothing here waits on the wall clock for a result: the game is stepped, or its own state is waited for.
//   SHOTS_GL=llvmpipe node harness/shots/v3_flora.mjs
//   SHOTS_GL=llvmpipe node harness/shots/v3_flora.mjs measure v1
//   SHOTS_GL=llvmpipe node harness/shots/v3_flora.mjs bamboo_sea flower_fields     (those regions' pictures only)
// V3_FLORA_OUT names another folder under loop/shots for the pictures and the numbers (a run kept for comparison).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const args = process.argv.slice(2);
const PARTS = ['regions', 'v1', 'measure', 'sheet'];
const parts = args.filter((a) => PARTS.includes(a));
/** region ids named on the command line: only their pictures are taken */
const only = args.filter((a) => !PARTS.includes(a));
const want = (part) => (part !== 'sheet' && parts.length === 0 && only.length === 0) || parts.includes(part) || (part === 'regions' && only.length > 0);
const out = path.join(ROOT, 'loop/shots', process.env.V3_FLORA_OUT || 'v3_flora');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};

/** the test hook's functions by name */
const hook = (page) => (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });

/** step the game until the world round the vehicle is built (the vehicle held where it stands); false when it never is */
async function built(page) {
  for (let round = 0; round < 14; round++) {
    const pending = await page.evaluate(() => {
      const g = window.__rt.game;
      g.scripted = { steer: 0, throttle: 0, brake: 0, handbrake: 1 };
      for (let i = 0; i < 40; i++) {
        g.simulate(0.1);
        if (i > 4 && window.__rt.worldPending() === 0) break;
      }
      g.simulate(0.3);
      g.scripted = null;
      return window.__rt.worldPending();
    });
    if (pending === 0) return true;
  }
  return false;
}

/** the vehicle one sits in: where it is by the road and which region is under it */
const vehicleNow = (page) =>
  page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.seated ?? g.focus ?? g.vehicles[0];
    const pr = { s: 0, d: 0 };
    g.world.spine.project(v.sim.px, v.sim.pz, NaN, pr);
    const bl = { a: 0, b: 0, t: 0, ia: 0, ib: 0 };
    g.world.spine.plan.blend(pr.s, bl);
    const regions = window.__rt.devRegions();
    return { s: pr.s, d: pr.d, x: v.sim.px, z: v.sim.pz, region: regions[bl.t > 0.5 ? bl.b : bl.a].id };
  });

/**
 * The scatter's share of a frame: the frame drawn as it is and drawn again with every scatter tile hidden, by
 * the renderer's own counters (every pass of the frame: the two shadow maps and the picture). Also how many
 * objects the tiles hold, and how many plants.
 */
const scatterCost = (page) =>
  page.evaluate(() => {
    const g = window.__rt.game;
    const wv = g.worldView;
    const objs = [];
    for (const p of wv.tiles.values()) for (const o of p.objects) objs.push(o);
    const read = () => {
      window.__rt.render();
      const s = g.core.stats;
      return { calls: s.calls, triangles: s.triangles };
    };
    const all = read();
    for (const o of objs) o.visible = false;
    const without = read();
    for (const o of objs) o.visible = true;
    window.__rt.render();
    let plants = 0;
    for (const o of objs) plants += o.isInstancedMesh ? o.count : (o.geometry?.instanceCount ?? 0);
    return { frame: all, scatter: { calls: all.calls - without.calls, triangles: all.triangles - without.triangles }, objects: objs.length, tiles: wv.tiles.size, plants, programs: g.core.stats.programs };
  });

/** the scatter's cost where the vehicle stands: from the driver's seat, and from above the road looking on down it */
async function costAt(page, rt, label) {
  await rt('setView', 'cockpit');
  const seat = await scatterCost(page);
  await rt('setOrbit', 200, 22, 80, 6, 0);
  const above = await scatterCost(page);
  await rt('setView', 'cockpit');
  const row = { spot: label, seat, above };
  console.log(`   ${label.padEnd(22)} seat: scatter ${String(seat.scatter.calls).padStart(4)} calls ${String(seat.scatter.triangles).padStart(8)} tris (frame ${seat.frame.calls} / ${seat.frame.triangles})   above: scatter ${String(above.scatter.calls).padStart(4)} calls ${String(above.scatter.triangles).padStart(8)} tris (frame ${above.frame.calls} / ${above.frame.triangles})   ${seat.objects} objects in ${seat.tiles} tiles, ${seat.plants} plants, ${seat.programs} programs`);
  return row;
}

/** the first stretch of a chapter of karst country with a cluster of towers: the road point abreast of the nearest; null: none */
const clusterOf = (page, chapter) =>
  page.evaluate(
    ({ start, length }) => {
      const w = window.__rt.game.world;
      const SLOT = w.rules.slot;
      const pr = { s: 0, d: 0 };
      for (let k = Math.max(1, Math.round(start / SLOT)); k < Math.round((start + length) / SLOT); k++) {
        const fs = w.features ? w.features.of(k) : [];
        if (!fs.length) continue;
        let best = null;
        for (const f of fs) {
          w.spine.project(f.x, f.z, NaN, pr);
          const off = Math.abs(pr.d) - f.r;
          if (!best || off < best.off) best = { off, s: pr.s, side: Math.sign(pr.d) || 1, x: f.x, z: f.z };
        }
        return best;
      }
      return null;
    },
    { start: chapter.start, length: chapter.length },
  );


/** the regions whose mark is somewhere of its own, and what it is; every other region is pictured well inside it */
const MARK_OF = { karst_peaks: 'cluster of towers', red_canyon: 'cluster of buttes', terraces: 'terraced side', wetland: 'lake shore', lakes: 'lake shore', bamboo_sea: 'bamboo grove', flower_fields: 'field in rows' };

/**
 * Where a region shows what makes it, in one of its chapters: the road point to stand at (s), the side the
 * mark is on, the point to look at (tx, tz), the road's right-hand normal there (nx, nz), and what was found;
 * null: the chapter has none.
 */
const markOf = (page, id, chapter) =>
  page.evaluate(
    async ({ id, start, length }) => {
      const g = window.__rt.game;
      const w = g.world;
      const SLOT = w.rules.slot;
      const k0 = Math.max(1, Math.round(start / SLOT));
      const k1 = Math.round((start + length) / SLOT);
      const pr = { s: 0, d: 0 };
      const { SpineSample } = await import('/src/core/world/spine.ts');
      const { TerrainPoint } = await import('/src/core/world/terrain.ts');
      const st = new SpineSample();
      const tp = new TerrainPoint();
      /** the point d m to the right of the road at arc length s */
      const beside = (s, d) => {
        w.spine.at(s, st);
        return [st.x - Math.sin(st.phi) * d, st.z + Math.cos(st.phi) * d];
      };
      const at = (s, side, what, tx, tz) => {
        w.spine.at(s, st);
        const nx = -Math.sin(st.phi);
        const nz = Math.cos(st.phi);
        if (tx === undefined) {
          tx = st.x + nx * side * 220 + Math.cos(st.phi) * 110;
          tz = st.z + nz * side * 220 + Math.sin(st.phi) * 110;
        }
        return { s, side, what, tx, tz, nx, nz };
      };
      if (id === 'karst_peaks' || id === 'red_canyon') {
        for (let k = k0; k < k1; k++) {
          const fs = w.features ? w.features.of(k) : [];
          if (!fs.length) continue;
          let best = null;
          for (const f of fs) {
            w.spine.project(f.x, f.z, NaN, pr);
            const off = Math.abs(pr.d) - f.r;
            if (!best || off < best.off) best = { off, s: pr.s, d: pr.d, f };
          }
          return at(best.s, Math.sign(best.d) || 1, { landforms: fs.length, height: Math.round(best.f.h), foot: Math.round(best.off) }, best.f.x, best.f.z);
        }
        return null;
      }
      if (id === 'terraces') {
        const { LandParams } = await import('/src/core/world/landform.ts');
        const lp = new LandParams();
        for (let k = k0; k < k1; k++) {
          const kind = w.land.kindOf(k);
          if (kind !== 'hillside' && kind !== 'valley') continue;
          const s = (k + 0.5) * SLOT;
          w.land.at(s, lp);
          if (!(lp.terrace > 0.5)) continue;
          return at(s, kind === 'hillside' ? w.land.sideOf(k) : 1, { country: kind, step: lp.step });
        }
        return null;
      }
      if (id === 'wetland' || id === 'lakes') {
        for (let k = k0; k < k1; k++) {
          const f = w.water.feature(k);
          if (!f || f.kind !== 'lake') continue;
          w.spine.project(f.cx, f.cz, NaN, pr);
          const side = Math.sign(pr.d) || 1;
          // the road point abreast of the lake's middle, and how far out from it the water begins
          let shore = NaN;
          for (let d = 8; d < 700; d += 2) {
            const [x, z] = beside(pr.s, side * d);
            w.shape(x, z, tp);
            if (tp.wl > tp.bed + 0.05) {
              shore = d;
              break;
            }
          }
          if (!(shore === shore)) continue;
          return { ...at(pr.s, side, { shore: Math.round(shore), level: +f.level.toFixed(1) }, f.cx, f.cz), shore };
        }
        return null;
      }
      if (id === 'bamboo_sea') {
        // the stretch of road with the most bamboo within some 130 m of it
        const { plantIndex } = await import('/src/core/world/plants.ts');
        const bamboo = plantIndex('bamboo');
        let best = null;
        for (let s = start + 400; s < start + length - 400; s += 90) {
          let n = 0;
          let right = 0;
          for (const d of [-90, -40, 40, 90]) {
            const [x, z] = beside(s, d);
            const t = w.flora.tile(0, Math.floor(x / 128), Math.floor(z / 128));
            for (let i = 0; i < t.n; i++) {
              if (t.plant[i] !== bamboo) continue;
              n++;
              if (d > 0) right++;
            }
          }
          if (!best || n > best.n) best = { n, s, side: right * 2 >= n ? 1 : -1 };
        }
        return best && best.n > 0 ? at(best.s, best.side, { bamboo: best.n }) : null;
      }
      if (id === 'flower_fields') {
        // the stretch of road with the most ground in flower beside it
        const { Cover } = await import('/src/core/world/flora.ts');
        const c = new Cover();
        let best = null;
        for (let s = start + 400; s < start + length - 400; s += 90) {
          let n = 0;
          let right = 0;
          for (let along = -60; along <= 60; along += 20) {
            for (let d = 14; d <= 160; d += 6.5) {
              for (const side of [-1, 1]) {
                const [x, z] = beside(s + along, side * d);
                if (w.flora.cover(x, z, c).flowers > 0.3) {
                  n++;
                  if (side > 0) right++;
                }
              }
            }
          }
          if (!best || n > best.n) best = { n, s, side: right * 2 >= n ? 1 : -1 };
        }
        return best && best.n > 0 ? at(best.s, best.side, { inFlower: best.n }) : null;
      }
      return null;
    },
    { id, start: chapter.start, length: chapter.length },
  );

try {
  // ------------------------------------------------------------------ version 1: two fixed spots, the same before and after
  if (want('v1')) {
    for (const [name, s] of [
      ['v1_plains', 3180],
      ['v1_forest', 64000],
    ]) {
      const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=1&seed=7&start=road&build=stock:pickup&s=${s}&time=13&weather=clear`, { width: 1280, height: 720 });
      const rt = hook(page);
      const w = await page.evaluate(() => ({ version: window.__rt.game.world.rules.version, flora: window.__rt.game.world.flora !== null }));
      if (w.version !== 1 || w.flora) fail(`${name}: the world is of version ${w.version}${w.flora ? ' and has a flora field' : ''}`);
      await page.evaluate(() => (window.__rt.game.ui.root.style.visibility = 'hidden'));
      // (the same picture every time: everything the world view wants is built now, whatever the machine's
      // pace — a page under load opens with its far land unfinished — and the game is stepped by a fixed time)
      const left = await page.evaluate(() => {
        const g = window.__rt.game;
        const v = g.seated ?? g.focus ?? g.vehicles[0];
        g.worldView.update(v.sim.px, v.sim.pz, 1e9);
        return g.worldView.pending;
      });
      if (left !== 0) fail(`${name}: ${left} pieces of the world still to build`);
      // (a world of version 1 is drawn with nothing of the new: no plant of the atlas, no leaf with palettes of its own)
      const added = await page.evaluate(() => {
        const wv = window.__rt.game.worldView;
        let own = 0;
        for (const p of wv.terrain.values()) for (const o of p.objects) if (o.userData.own) own++;
        let flora = 0;
        for (const p of wv.tiles.values()) for (const o of p.objects) if (!o.isInstancedMesh) flora++;
        return { own, flora, plants: wv.plants !== null };
      });
      if (added.own || added.flora || added.plants) fail(`${name}: a world of version 1 drawn with the new vegetation (${JSON.stringify(added)})`);
      // (… and what the game fetches as it goes — a wreck by the road is a vehicle, loaded when it is come to,
      // and settles on its springs once it is there — has always arrived before the next step is taken: the
      // game is stepped in fixed lengths, and between two of them the script waits until nothing is on its way)
      const idle = () =>
        page.waitForFunction(
          async () => {
            const { loadStats } = await import('/src/game/modcar/assets.ts');
            return loadStats.done >= loadStats.requested;
          },
          null,
          { timeout: 120_000, polling: 50 },
        );
      await idle();
      for (let round = 0; round < 6; round++) {
        await rt('simulate', 0.5);
        await idle();
      }
      await rt('setView', 'cockpit');
      await page.evaluate(() => window.__rt.render());
      await page.screenshot({ path: path.join(out, `${name}_seat.png`) });
      await rt('setOrbit', 200, 22, 80, 6, 0);
      await page.evaluate(() => window.__rt.render());
      await page.screenshot({ path: path.join(out, `${name}_above.png`) });
      const last = await page.evaluate(() => window.__rt.lastError);
      if (last) fail(`${name}: ${last}`);
      if (errors.length) fail(`${name}: page errors: ${errors.slice(0, 3).join(' | ')}`);
      console.log(`version 1: ${name} pictured`);
      await page.close();
    }
  }


  // ------------------------------------------------------------------ the catalogue's plants side by side (only when asked for)
  if (want('sheet')) {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=2&seed=7&start=road&build=stock:pickup&s=900&time=13&weather=clear`, { width: 1280, height: 720 });
    const rt = hook(page);
    await page.evaluate(() => (window.__rt.game.ui.root.style.visibility = 'hidden'));
    const rows = await page.evaluate(async () => {
      const g = window.__rt.game;
      const w = g.world;
      const { plantRegistry } = await import('/src/game/scene/plantRegistry.ts');
      const { floraSheet } = await import('/src/game/scene/floraScatter.ts');
      const { floraMesh, floraShadows } = await import('/src/game/scene/floraMesh.ts');
      const { PLANTS } = await import('/src/core/world/plants.ts');
      const { SpineSample } = await import('/src/core/world/spine.ts');
      const { TerrainPoint } = await import('/src/core/world/terrain.ts');
      const reg = plantRegistry();
      const st = new SpineSample();
      const tp = new TerrainPoint();
      const pr = { s: 0, d: 0 };
      const v = g.seated;
      w.spine.project(v.sim.px, v.sim.pz, NaN, pr);
      const slot = w.spine.plan.chapterAt(pr.s) & 3;
      const point = (s, d) => {
        w.spine.at(s, st);
        const x = st.x - Math.sin(st.phi) * d;
        const z = st.z + Math.cos(st.phi) * d;
        w.shape(x, z, tp);
        return { x, y: tp.h, z };
      };
      const o = point(pr.s, 0);
      const list = [];
      const out = { trees: [], small: [] };
      /** a row along the road from `from` m ahead, `gap` apart, `d` m to the right; the far models `back` m behind */
      const row = (ids, from, gap, d, back, into) => {
        ids.forEach((plant, i) => {
          const s = pr.s + from + i * gap;
          const near = point(s, d);
          list.push({ plant, x: near.x - o.x, y: near.y - o.y, z: near.z - o.z, bears: true, slot, vary: (i * 0.37) % 1, yaw: i * 1.3 });
          const far = point(s, d + back);
          list.push({ plant, x: far.x - o.x, y: far.y - o.y, z: far.z - o.z, level: 1, slot, vary: (i * 0.37) % 1, yaw: i * 1.3 });
          // (and a tree's smallest model behind that)
          const last = point(s, d + 2 * back);
          list.push({ plant, x: last.x - o.x, y: last.y - o.y, z: last.z - o.z, level: 2, slot, vary: (i * 0.37) % 1, yaw: i * 1.3 });
          into.push({ plant, s });
        });
      };
      const drawn = PLANTS.filter((p, i) => reg.draws[i].drawn);
      const trees = drawn.filter((p) => p.layer === 'tree').map((p) => p.id);
      row(trees, 16, 10, 11, 15, out.trees);
      // (the small plants further down the road, clear of the trees: twice, the second time each as it is when it does not bear)
      const small = drawn.filter((p) => p.layer !== 'tree').map((p) => p.id);
      row(small, 46 + trees.length * 10, 4.2, -8.5, -7, out.small);
      // (the render origin moves with whoever walks far: the sheet is set down again before every picture)
      window.__sheet = [];
      for (const b of floraSheet(reg, list)) {
        const m = floraMesh(b, g.worldView.floraMat, 1);
        m.frustumCulled = false;
        floraShadows(m);
        g.core.scene.add(m);
        window.__sheet.push(() => g.core.place(m, o.x, o.y, o.z));
      }
      // where to stand for each picture: across the road from the middle of each handful of plants
      const stands = [];
      const stand = (name, items, per, d, lookD) => {
        for (let k = 0; k * per < items.length; k++) {
          const part = items.slice(k * per, k * per + per);
          const s = (part[0].s + part[part.length - 1].s) / 2;
          const from = point(s, d);
          const to = point(s, lookD);
          stands.push({ name: `sheet_${name}_${k}`, x: from.x, z: from.z, heading: Math.atan2(to.z - from.z, to.x - from.x), plants: part.map((p) => p.plant) });
        }
      };
      stand('trees', out.trees, 4, -11, 11);
      stand('small', out.small, 4, -0.5, -8.5);
      return stands;
    });
    for (const st of rows) {
      await rt('stand', st.x, st.z, st.heading, st.name.includes('trees') ? 0.3 : -0.1);
      await page.evaluate(() => {
        for (const put of window.__sheet) put();
        window.__rt.render();
      });
      await page.screenshot({ path: path.join(out, `${st.name}.png`) });
      console.log(`${st.name}: ${st.plants.join(', ')}`);
    }
    const last = await page.evaluate(() => window.__rt.lastError);
    if (last) fail(`sheet: ${last}`);
    if (errors.length) fail(`sheet: page errors: ${errors.slice(0, 4).join(' | ')}`);
    await page.close();
  }

  // ------------------------------------------------------------------ version 2: every region at its mark
  if (want('regions')) {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=2&seed=7&start=road&build=stock:pickup&s=300&time=13&weather=clear`, { width: 1280, height: 720 });
    const rt = hook(page);
    const w = await page.evaluate(() => ({ version: window.__rt.game.world.rules.version, flora: window.__rt.game.world.flora !== null }));
    if (w.version !== 2 || !w.flora) fail(`the regions' page is of a world of version ${w.version}${w.flora ? '' : ' without a flora field'}`);
    await rt('setHour', 13);
    await page.evaluate(() => (window.__rt.game.ui.root.style.visibility = 'hidden'));
    const regions = await rt('devRegions');
    const shot = async (name) => {
      await page.evaluate(() => window.__rt.render());
      await page.screenshot({ path: path.join(out, `${name}.png`) });
    };
    for (const [i, r] of regions.entries()) {
      if (only.length && !only.includes(r.id)) continue;
      const name = `${String(i).padStart(2, '0')}_${r.id}`;
      const went = await rt('devGoRegion', r.id, true);
      if (!went.startsWith(`${r.zh}：`)) fail(`${r.id}: the panel said "${went}"`);
      await page.evaluate(() => window.__rt.game.simulate(0));
      let chapter = (await rt('devJourney', 1))[0];
      // where the region shows what makes it: this chapter of it, or one of its next
      let mark = null;
      if (MARK_OF[r.id]) {
        for (let tries = 0; tries < 6 && !mark; tries++) {
          mark = await markOf(page, r.id, chapter);
          if (mark) break;
          const on = await rt('devGoRegion', r.id, true);
          if (!on.startsWith(`${r.zh}：`)) break;
          await page.evaluate(() => window.__rt.game.simulate(0));
          chapter = (await rt('devJourney', 1))[0];
        }
        if (!mark) fail(`${r.id}: no ${MARK_OF[r.id]} in six chapters of the region`);
      }
      const s = mark ? mark.s : chapter.start + 2600;
      const side = mark ? mark.side : 1;
      await rt('devGoKm', s / 1000, true);
      if (!(await built(page))) fail(`${r.id}: the world round the vehicle was never built`);
      const at = await vehicleNow(page);
      console.log(`${String(i).padStart(2)} ${r.id.padEnd(14)} ${(at.s / 1000).toFixed(2)} km${mark ? `  ${MARK_OF[r.id]} on the ${side > 0 ? 'right' : 'left'} ${JSON.stringify(mark.what)}` : ''}`);
      if (at.region !== r.id) fail(`${r.id}: the region under the vehicle is ${at.region}`);
      if (Math.abs(at.s - s) > 25 || Math.abs(at.d) > 4.5) fail(`${r.id}: the vehicle is not where it was sent (${JSON.stringify(at)})`);
      // what is drawn: plants of the flora field in every scatter tile that holds any, and every leaf of the far
      // ring with the palettes of its own chapters
      const drawn = await page.evaluate(() => {
        const wv = window.__rt.game.worldView;
        let far = 0;
        let own = 0;
        const materials = new Set();
        for (const p of wv.terrain.values()) {
          if (p.level >= 0) continue;
          far++;
          if (!p.objects.some((o) => o.userData.own)) continue;
          own++;
          for (const o of p.objects) materials.add(o.material);
        }
        let old = 0;
        let plants = 0;
        for (const p of wv.tiles.values()) {
          for (const o of p.objects) {
            if (o.isInstancedMesh && o.material !== wv.shadowMat) old++;
            else plants += o.geometry?.instanceCount ?? 0;
          }
        }
        return { far, own, old, plants, materials: materials.size };
      });
      console.log(`   ${drawn.plants} plants in the scatter; ${drawn.far} far leaves, painted with ${drawn.materials} sets of palettes of their own`);
      if (drawn.old) fail(`${r.id}: ${drawn.old} scatter draws of the first renderer's in a world of version 2`);
      if (!(drawn.plants > 0)) fail(`${r.id}: no plant of the flora field is drawn`);
      if (drawn.far === 0 || drawn.own !== drawn.far) fail(`${r.id}: ${drawn.own} of ${drawn.far} far leaves keep palettes of their own`);
      if (drawn.materials > 8) fail(`${r.id}: the far leaves are painted with ${drawn.materials} materials (one for each run of chapters is enough)`);
      // three-quarter: from behind the vehicle on the side away from the mark, looking across the road at it
      await rt('setOrbit', side > 0 ? 250 : 110, 13, 60, 8, 0);
      await shot(name);
      // from the driver's seat
      await rt('setView', 'cockpit');
      await shot(`${name}_seat`);
      // from far back and higher: the flower fields, the bamboo sea, the towers of the karst
      if (['flower_fields', 'bamboo_sea', 'karst_peaks'].includes(r.id)) {
        await rt('setOrbit', side > 0 ? 222 : 138, 12, 330, 55, 0);
        await shot(`${name}_far`);
        await rt('setView', 'cockpit');
      }
      // and on foot where the mark is to one side: at the road's edge looking at it; by a lake, down at its
      // shore looking along it
      if (mark) {
        let d = side * 4.2;
        let turn = 0;
        if (mark.shore) {
          d = side * Math.max(6, mark.shore - 16);
          turn = side * 0.9;
        }
        const x = at.x + mark.nx * (d - at.d);
        const z = at.z + mark.nz * (d - at.d);
        await rt('stand', x, z, Math.atan2(mark.tz - z, mark.tx - x) + turn, mark.shore ? -0.03 : 0.08);
        await shot(`${name}_eye`);
        await rt('enter', 0);
      }
      const last = await page.evaluate(() => window.__rt.lastError);
      if (last) fail(`${r.id}: ${last}`);
    }
    if (errors.length) fail(`page errors: ${errors.slice(0, 4).join(' | ')}`);
    await page.close();
  }

  // ------------------------------------------------------------------ the scatter's draw calls and triangles
  if (want('measure')) {
    const rows = {};
    for (const version of [1, 2]) {
      const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=${version}&seed=7&start=road&build=stock:pickup&s=300&time=13&weather=clear`, { width: 1280, height: 720 });
      const rt = hook(page);
      await page.evaluate(() => (window.__rt.game.ui.root.style.visibility = 'hidden'));
      console.log(`version ${version}: the scatter's share of a frame (draw calls and triangles, every pass)`);
      const spots = version === 1 ? ['forest', 'plains'] : ['forest', 'flower_fields', 'karst_peaks'];
      rows[version] = [];
      for (const id of spots) {
        const went = await rt('devGoRegion', id, true);
        await page.evaluate(() => window.__rt.game.simulate(0));
        const stop = (await rt('devJourney', 1))[0];
        let s = stop.start + 2600;
        if (id === 'karst_peaks') {
          // (among the towers: the first stretch of the region with a cluster, this chapter or its next ones)
          let chapter = stop;
          let at = null;
          for (let tries = 0; tries < 6 && !at; tries++) {
            at = await clusterOf(page, chapter);
            if (at) break;
            await rt('devGoRegion', id, true);
            await page.evaluate(() => window.__rt.game.simulate(0));
            chapter = (await rt('devJourney', 1))[0];
          }
          if (at) s = at.s;
          else fail('no cluster of towers in six chapters of the karst');
        }
        await rt('devGoKm', s / 1000, true);
        if (!(await built(page))) fail(`${id}: the world round the vehicle was never built`);
        const at = await vehicleNow(page);
        if (at.region !== id) fail(`version ${version}: wanted ${id}, the vehicle stands in ${at.region} (${went})`);
        rows[version].push({ region: id, s: Math.round(at.s), ...(await costAt(page, rt, `${id} ${(at.s / 1000).toFixed(2)} km`)) });
        const last = await page.evaluate(() => window.__rt.lastError);
        if (last) fail(`version ${version}, ${id}: ${last}`);
      }
      if (errors.length) fail(`version ${version}: page errors: ${errors.slice(0, 3).join(' | ')}`);
      await page.close();
    }
    fs.writeFileSync(path.join(out, 'scatter_cost.json'), JSON.stringify(rows, null, 2) + '\n');
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `${bad} failed` : 'v3 flora ok');
process.exit(bad ? 1 : 0);
