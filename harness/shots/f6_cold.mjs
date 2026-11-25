// F6 (docs/V3/plan/finish.md §二 4, 6, §八 1), in the game — a world of version 7: the places keep food cold.
//  - a house of ours past the kitchen's chapter has a refrigerator by its kitchen cupboard: a box of the place's, shut;
//    the left button opens it; what is in it is to cook with or to drink — an ingredient taken out by hand;
//  - a camp's cool box by its table, likewise;
//  - a prefab building's own refrigerator stands fixed where its card has it: opened the same way, not carried off;
//  - what the cupboards and shelves hold further down the road: ingredients that keep among the tins.
//   SHOTS_GPU=1 node harness/shots/f6_cold.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/f6_cold');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const ok = (cond, why) => (cond ? console.log('ok  ', why) : fail(why));

try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=7&seed=7&start=road&build=stock:sedan&s=200&time=11&weather=clear`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const shot = async (f) => {
    await page.evaluate(async () => {
      const g = window.__rt.game;
      g.ui.showHelp(false);
      for (let i = 0; i < 300 && (g.worldView?.pending ?? 0) > 0; i++) {
        g.worldView.update(g.player.walker.x, g.player.walker.z, 40);
        await new Promise((r) => setTimeout(r, 0));
      }
      for (let i = 0; i < 2; i++) window.__rt.render();
    });
    await page.screenshot({ path: path.join(out, f) });
  };
  await rt('exit');
  await rt('simulate', 0.3);

  // the places with a cold box between the 50th kilometre and the 140th: one of each sort
  const found = await page.evaluate(() => {
    const g = window.__rt.game;
    const sites = [];
    g.world.sites.between(50000, 140000, sites);
    sites.sort((a, b) => a.s - b.s);
    const pick = (test) => {
      for (const x of sites) {
        const c = x.containers.find(test(x));
        if (c) return { id: x.id, s: x.s, kind: x.kind, prefab: x.prefab, box: c.id, boxKind: c.kind, n: x.containers.length };
      }
      return null;
    };
    return {
      house: pick((x) => (c) => !x.prefab && x.kind === 'house' && c.kind === 'fridge'),
      camp: pick((x) => (c) => !x.prefab && c.kind === 'coolbox'),
      prefab: pick((x) => (c) => !!x.prefab && c.kind === 'fridge'),
      counts: { fridges: sites.filter((x) => x.containers.some((c) => c.kind === 'fridge')).length, coolboxes: sites.filter((x) => x.containers.some((c) => c.kind === 'coolbox')).length, sites: sites.length },
    };
  });
  console.log('cold boxes from 50 to 140 km:', JSON.stringify(found.counts));
  ok(!!found.house && !!found.camp && !!found.prefab, `a house of ours with a refrigerator, a camp with a cool box, a prefab building with its refrigerator: ${JSON.stringify([found.house?.s, found.camp?.s, found.prefab?.s].map((s) => (s ? +(s / 1000).toFixed(1) : null)))} km`);

  const goTo = async (w) => {
    await rt('devGoKm', w.s / 1000, false);
    for (let k = 0; k < 80; k++) {
      await rt('simulate', 0.25);
      const p = await rt('places');
      const lp = p?.live?.find((x) => x.id === w.id);
      if (lp && lp.laid === lp.containers) return true;
      await page.waitForTimeout(60);
    }
    return false;
  };
  const box = (id) =>
    page.evaluate((id) => {
      const g = window.__rt.game;
      const pc = g.places.containerOf(id);
      if (!pc) return null;
      const o = g.core.origin;
      return {
        name: pc.name,
        open: g.places.isOpen(id),
        contents: pc.contents?.map((h) => (h.kind === 'item' ? h.item.item : h.kind)) ?? null,
        things: pc.things.map((l) => {
          l.obj.updateWorldMatrix(true, true);
          let lo = [Infinity, Infinity, Infinity];
          let hi = [-Infinity, -Infinity, -Infinity];
          const v = l.obj.position.clone();
          l.obj.traverse((m) => {
            const geo = m.geometry;
            if (!geo) return;
            if (!geo.boundingBox) geo.computeBoundingBox();
            const b = geo.boundingBox;
            for (const cx of [b.min.x, b.max.x]) for (const cy of [b.min.y, b.max.y]) for (const cz of [b.min.z, b.max.z]) {
              v.set(cx, cy, cz).applyMatrix4(m.matrixWorld);
              lo = [Math.min(lo[0], v.x), Math.min(lo[1], v.y), Math.min(lo[2], v.z)];
              hi = [Math.max(hi[0], v.x), Math.max(hi[1], v.y), Math.max(hi[2], v.z)];
            }
          });
          const drawn = Number.isFinite(lo[0]);
          return { what: l.item?.item ?? null, shut: !!l.shut, x: drawn ? (lo[0] + hi[0]) / 2 + o.x : l.x, y: drawn ? (lo[1] + hi[1]) / 2 + o.y : l.y + l.mid, z: drawn ? (lo[2] + hi[2]) / 2 + o.z : l.z };
        }),
        yaw: pc.c.yaw,
      };
    }, id);

  for (const [label, w, zh, f] of [
    ['a house of ours', found.house, '冰箱', '01_house'],
    ['a camp', found.camp, '保温箱', '02_camp'],
    ['a prefab building', found.prefab, '冰箱', '03_prefab'],
  ]) {
    if (!w) continue;
    ok(await goTo(w), `${label}: a ${w.prefab || w.kind} at ${(w.s / 1000).toFixed(1)} km, its boxes laid out`);
    let b = await box(w.box);
    ok(!!b && b.name === zh && !b.open && Array.isArray(b.contents), `its ${w.boxKind}: called ${b?.name}, shut, holding ${JSON.stringify(b?.contents)}`);
    const eat = (b?.contents ?? []).filter((id) => /^(ing_|drink_|food_|nd_)/.test(id));
    ok((b?.contents ?? []).every((id) => /^(ing_|drink_|food_|nd_|junk_)/.test(id)), 'nothing in it but what is to eat, to drink or to throw away');
    // the mark on it from in front (its door's side), the left button: open
    let m = '';
    let from = 0;
    for (const turn of [Math.PI / 2, -Math.PI / 2, 0, Math.PI, 0.8, -0.8, 2.4, -2.4]) {
      m = await rt('aimAt', `box:${w.box}`, (b?.yaw ?? 0) + turn, 1.5);
      if (m === `device:box:${w.box}`) {
        from = (b?.yaw ?? 0) + turn;
        break;
      }
    }
    ok(m === `device:box:${w.box}`, `the mark on it (${m})`);
    await rt('simulate', 0.2);
    await shot(`${f}_shut.png`);
    const said = await page.evaluate(() => document.body.innerText);
    ok(said.includes(zh), `its name on screen (${zh})`);
    await rt('press');
    await rt('simulate', 0.9);
    b = await box(w.box);
    ok(!!b?.open, 'the left button: open');
    await shot(`${f}_open.png`);
    const want = b?.things.find((t) => t.what && /^ing_/.test(t.what)) ?? b?.things.find((t) => t.what && /^(drink_|food_)/.test(t.what));
    if (eat.length && want) {
      let got = '';
      for (const turn of [0, 0.5, -0.5, 1, -1, Math.PI, 1.6, -1.6, 2.4, -2.4]) {
        const mm = await rt('aimPoint', want.x, want.y, want.z, from + turn, 1.2);
        if (/^loose:/.test(mm)) {
          const tel = await rt('press');
          got = tel.held;
          if (got) break;
        }
      }
      ok(got === `item:${want.what}`, `a thing of it taken out by hand: ${got || 'nothing'} (wanted ${want.what})`);
      await shot(`${f}_taken.png`);
      await page.evaluate(() => {
        window.__rt.game.player.held = null;
      });
    } else console.log(`     (nothing to eat in this one: ${JSON.stringify(b?.contents)})`);
    // (a refrigerator is the place's: no thing to pick up stands where it does)
    if (w.boxKind === 'fridge') {
      const loose = await page.evaluate(() => window.__rt.game.loose.list.filter((l) => l.item?.item === 'nd_fridge').length);
      ok(loose === 0, 'no refrigerator to carry off lies about the place');
    }
  }

  // what the places down the road hold to eat, as the game rolls them: ingredients among the tins from the kitchen's chapter on
  const tally = await page.evaluate(async () => {
    const L = await import('/src/core/modcar/loot.ts');
    const g = window.__rt.game;
    const rules = L.lootRules(g.params.world);
    const band = (a, b) => {
      const sites = [];
      g.world.sites.between(a, b, sites);
      let ready = 0;
      let raw = 0;
      const kinds = new Set();
      for (const x of sites.filter((x) => x.s >= a && x.s < b)) {
        for (const c of x.containers) {
          for (const f of L.ownRoll(c, x.s, x.kind, rules)) {
            if (!('item' in f)) continue;
            if (f.item.startsWith('ing_')) {
              raw += f.n ?? 1;
              kinds.add(f.item);
            } else if (f.item.startsWith('food_') || f.item === 'nd_baked_beans') ready++;
          }
        }
      }
      return { ready, raw, kinds: kinds.size };
    };
    return { to35: band(0, 35000), to70: band(35000, 70000), to120: band(70000, 120000), to200: band(120000, 200000) };
  });
  console.log('what the places hold to eat (tins and snacks / portions to cook / sorts of them):', JSON.stringify(tally));
  ok(tally.to35.raw === 0 && tally.to70.raw > 0 && tally.to200.kinds > tally.to70.kinds, 'none to cook before the 35th kilometre, some after, more sorts further on');

  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `f6_cold: ${bad} FAILED` : 'f6_cold: ok');
process.exit(bad ? 1 : 0);
