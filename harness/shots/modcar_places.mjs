// The places by the road in ModCar (docs/MODCAR.md §20):
//  1. the world's places down the first 80 km: filling stations, houses, garages, shops … with their containers;
//  2. at a filling station: its containers and pumps there as one comes; what the till holds lies on its counter
//     where one sees it (docs/V3/nodes/M3-loot.md), and a thing of it is picked up into the hands as any thing is;
//  3. a jerrycan held to a pump fills from it; a vehicle parked at a pump fills from it with empty hands (its flap
//     open, the pump's nozzle out of its hook and in the filler, back on the hook a moment after);
//  4. the things lying in plain sight are ModCar's; one picked up is taken for good;
//  5. left behind and come back: what was searched and taken stays so; the pump's litres stay; saved and read back too;
//  6. a house's cupboard and wardrobe, a garage's shelves: what each holds, lying in it; what has doors, drawers or
//     a lid opened with a press of E, and open still when one comes back.
//   SHOTS_GPU=1 node harness/shots/modcar_places.mjs
import { launchBrowser, startServer } from './lib.mjs';

const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const ready = () => page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 240000 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const shot = async (name) => {
    await page.evaluate(async () => {
      const g = window.__rt.game;
      g.ui.showHelp(false);
      for (let i = 0; i < 300 && (g.worldView?.pending ?? 0) > 0; i++) {
        const f = g.seated ?? null;
        g.worldView.update(f ? f.sim.px : g.player.walker.x, f ? f.sim.pz : g.player.walker.z, 40);
        await new Promise((r) => setTimeout(r, 0));
      }
      for (let i = 0; i < 3; i++) window.__rt.render();
    });
    await page.screenshot({ path: `loop/shots/modcar_places_${name}.png` });
  };
  /** on foot to a place, and wait until it is there, the things in its containers laid out (their models come in) */
  const goTo = async (site) => {
    await rt('devGoKm', site.s / 1000, false);
    for (let k = 0; k < 80; k++) {
      await rt('simulate', 0.25);
      const p = await rt('places');
      const lp = p?.live?.find((x) => x.id === site.id);
      if (lp && lp.laid === lp.containers) return p;
      await page.waitForTimeout(60);
    }
    return rt('places');
  };
  /** stand before a container (at its front) looking at it; what the mark is on */
  const before = (c, extra = 0.75) => rt('aimPoint', c.x, c.y + c.h * 0.55, c.z, c.from, c.hz + extra);
  const held = () => page.evaluate(() => {
    const h = window.__rt.game.player.held;
    return h ? (h.kind === 'tool' ? { tool: h.tool.kind, litres: h.tool.litres, fuel: h.tool.fuel } : h.kind === 'item' ? { item: h.item.item } : { part: h.inst.part }) : null;
  });
  await page.goto(`${url}/modcar.html?new=1`, { waitUntil: 'domcontentloaded' });
  await ready();
  await rt('setHour', 11);

  // 1. the places down the first 80 km
  const sites = await rt('placeSites', 0, 80000);
  const kinds = {};
  for (const x of sites) kinds[x.kind] = (kinds[x.kind] ?? 0) + 1;
  console.log('places in 80 km', sites.length, JSON.stringify(kinds));
  const station = sites.find((x) => x.kind === 'station' && x.pumps.length);
  const house = sites.find((x) => x.kind === 'house' && x.containers.some((c) => c.kind === 'cupboard'));
  const garage = sites.find((x) => x.kind === 'garage');
  if (!station) fail('no filling station in 80 km');
  if (!house) fail('no house with a cupboard in 80 km');

  // 2. at the filling station: the till searched, a thing taken out
  if (station) {
    let p = await goTo(station);
    const lp = p?.live?.find((x) => x.id === station.id);
    console.log('at the station', JSON.stringify(lp));
    if (!lp) fail('the filling station did not come');
    else {
      if (lp.pumps !== station.pumps.length) fail(`its pumps are not there (${lp.pumps} of ${station.pumps.length})`);
      if (lp.containers < 2) fail(`its containers are not there (${lp.containers})`);
    }
    const till = station.containers.find((c) => c.kind === 'counter') ?? station.containers[0];
    // what the till holds lies on its counter and on the keeper's side behind it: a thing on it picked up
    const tillThings = await page.evaluate((id) => {
      const pc = window.__rt.game.places.containerOf(id);
      return (pc?.things ?? []).filter((l) => !l.shut).map((l) => ({ x: l.x, y: l.y + l.mid, z: l.z, what: l.item?.item ?? l.tool?.kind ?? l.part?.part }));
    }, till.id);
    console.log('on the till', JSON.stringify(tillThings.map((t) => t.what)));
    const n0 = await page.evaluate((id) => window.__rt.game.places.containerOf(id)?.contents?.length ?? -1, till.id);
    if (tillThings.length) {
      const t = tillThings[0];
      const mark = await rt('aimPoint', t.x, t.y, t.z, till.from, till.hz + 0.7);
      console.log('before the till', mark);
      if (!/loose:/.test(mark)) fail(`the mark is not on the thing on the till (${mark})`);
      await shot('till');
      await rt('press');
      const took = await held();
      console.log('took', JSON.stringify(took));
      if (!took) fail('nothing came off the till into the hands');
      await rt('simulate', 0.1);
      const n1 = await page.evaluate((id) => window.__rt.game.places.containerOf(id)?.contents?.length ?? -1, till.id);
      if (n1 !== n0 - 1) fail(`the till still holds what was taken (${n0} → ${n1})`);
    } else if (n0 > 0) fail('the till holds things, none of them on its counter to reach');
    await page.evaluate(() => {
      const g = window.__rt.game;
      g.player.held = null;
      g.simulate(0);
    });

    // 3. a jerrycan filled at a pump; the pickup filled at a pump
    const pump = station.pumps[0];
    await rt('hold', 'tool:jerrycan', { litres: 0, fuel: 'petrol' });
    const pm = await rt('aimPoint', pump.x, pump.y + 1.0, pump.z, pump.from, pump.d / 2 + 0.75);
    console.log('can at the pump', pm);
    await rt('holdFor', 5);
    const can = await held();
    console.log('can', JSON.stringify(can));
    if (!(can?.litres > 8)) fail(`the can did not fill at the pump (${can?.litres} L)`);
    await page.evaluate(() => {
      window.__rt.game.player.held = null;
    });
    // (the yard's pickup brought along and parked at the pump)
    const filled = await page.evaluate(({ pump }) => {
      const g = window.__rt.game;
      const v = g.vehicles.find((x) => x.build.frame === 'pickup' && !g.wrecks?.isWreck(x));
      if (!v) return null;
      const tank = Object.values(v.build.parts).find((q) => q.fluids.fuel !== undefined);
      if (tank) tank.fluids.fuel = { diesel: 2 };
      const fx = Math.cos(pump.from);
      const fz = Math.sin(pump.from);
      const at = { h: 0 };
      const x = pump.x + fx * 2.6;
      const z = pump.z + fz * 2.6;
      g.ground.sample(x, z, at);
      v.sim.reset(x, at.h + 0.1, z, Math.atan2(-fx, fz), g.ground);
      v.awake = 3;
      g.simulate(1.5);
      const before = Object.values(tank?.fluids.fuel ?? {}).reduce((a, b) => a + b, 0);
      return { before, x, z };
    }, { pump: station.pumps[1] ?? pump });
    if (!filled) fail('no pickup to fill');
    else {
      const p2 = station.pumps[1] ?? pump;
      const m2 = await rt('aimPoint', p2.x, p2.y + 1.0, p2.z, p2.from + 0.9, p2.d / 2 + 0.8);
      console.log('empty hands at the pump', m2);
      // (part way: the nozzle off its hook and in the pickup's filler, the hose drawn to it)
      await rt('holdFor', 4);
      const noz = await page.evaluate(() => {
        const g = window.__rt.game;
        const v = g.vehicles.find((x) => x.build.frame === 'pickup' && !g.wrecks?.isWreck(x));
        const m = g.core.camera.position.clone();
        const n = m.clone();
        const has = v.view.fillerMouth('fuel', m, n);
        const out = (g.siteArt?.pumpTelemetry() ?? []).find((t) => t.out > 0.5);
        return { has, cap: v.view.capOpen, out: out ? out.out : 0, gap: out && has ? Math.hypot(out.tip[0] - m.x, out.tip[1] - m.y, out.tip[2] - m.z) : -1 };
      });
      console.log('nozzle', JSON.stringify(noz));
      if (!(noz.out > 0.9)) fail(`the nozzle is not out while the pickup fills (${noz.out})`);
      else if (!(noz.gap >= 0 && noz.gap < 0.08)) fail(`the nozzle's tip is not in the filler (${noz.gap} m off)`);
      if (!noz.cap) fail("the pickup's filler flap is not open while it fills");
      await shot('nozzle');
      await rt('holdFor', 10);
      const after = await page.evaluate(() => {
        const g = window.__rt.game;
        const v = g.vehicles.find((x) => x.build.frame === 'pickup' && !g.wrecks?.isWreck(x));
        const tank = Object.values(v.build.parts).find((q) => q.fluids.fuel !== undefined);
        return { fuel: { ...tank.fluids.fuel }, toast: g.ui.toast?.textContent ?? '' };
      });
      console.log('pickup', JSON.stringify(filled), '→', JSON.stringify(after));
      const total = Object.values(after.fuel).reduce((a, b) => a + b, 0);
      if (!(total > filled.before + 10)) fail(`the pickup did not fill at the pump (${filled.before} → ${total} L)`);
      await shot('pump');
      // (a moment after, the nozzle hung back on its hook)
      await rt('simulate', 1.5);
      const back = await page.evaluate(() => (window.__rt.game.siteArt?.pumpTelemetry() ?? []).every((t) => t.out < 0.01));
      if (!back) fail('the nozzle did not go back on its hook after the fill');
    }

    // 4. what lies in plain sight: ModCar's things, one taken for good
    p = await rt('places');
    const owned0 = p.owned;
    const pick = await page.evaluate(() => {
      const g = window.__rt.game;
      const l = g.loose.list.find((x) => g.places.owns(x));
      if (!l) return null;
      const name = l.item?.item ?? l.tool?.kind ?? l.part?.part;
      g.loose.remove(l);
      g.simulate(0.6);
      return name;
    });
    console.log('lying about', owned0, 'picked', pick);
    if (station.loose > 0 && !owned0) fail('nothing lies about at the station');

    // 5. left behind and come back: searched and taken stay so; the pump's litres stay
    const before5 = await rt('places');
    await rt('devGoKm', station.s / 1000 + 2, false);
    await rt('simulate', 1.2);
    const away = await rt('places');
    if (away.live.some((x) => x.id === station.id)) fail('the station is still there 2 km on');
    await goTo(station);
    const back = await rt('places');
    console.log('back', JSON.stringify({ before: before5.taken, after: back.taken, searched: back.searched }));
    if (back.taken < before5.taken) fail('a thing taken came back');
    const again = await before(till);
    console.log('the till again', again);
    await page.evaluate(() => window.__rt.game.save());
    await page.waitForTimeout(500);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('modcar.save.v1') ?? '{}').places ?? null);
    console.log('saved', JSON.stringify({ searched: saved?.searched?.length, left: Object.keys(saved?.left ?? {}).length, pumps: Object.keys(saved?.pumps ?? {}).length, taken: saved?.taken?.length }));
    if (tillThings.length && !saved?.left?.[till.id]) fail('what is left on the till is not in the save');
    if (!Object.keys(saved?.pumps ?? {}).length) fail('the pumps are not in the save');
  }

  // 6. a house's cupboard and wardrobe; a garage's shelves (what each holds, lying in it; what opens, opened with E)
  const movers = [];
  for (const site of [house, garage].filter(Boolean)) {
    await goTo(site);
    const got = [];
    // (a wreck's glovebox is the wreck's own: wrecks.ts)
    for (const c of site.containers.filter((x) => x.kind !== 'glovebox' && x.kind !== 'boot').slice(0, 4)) {
      const inside = () =>
        page.evaluate((id) => {
          const pc = window.__rt.game.places.containerOf(id);
          return pc ? { laid: pc.laid, n: pc.contents?.length ?? 0, things: pc.things.map((l) => (l.shut ? '(' : '') + (l.item?.item ?? l.tool?.kind ?? l.part?.part) + (l.shut ? ')' : '')) } : null;
        }, c.id);
      const in0 = await inside();
      if (!in0?.laid || in0.things.length !== in0.n) {
        got.push(`${c.kind}: not laid out (${JSON.stringify(in0)})`);
        continue;
      }
      const opens = await page.evaluate(({ id, sid }) => window.__rt.game.siteArt?.movesOf(id, sid) ?? null, { id: c.id, sid: site.id });
      if (opens) {
        const m = await before(c);
        if (!/device:box:/.test(m)) {
          got.push(`${c.kind}: mark on ${m}`);
          continue;
        }
        // (its doors, drawers or lid: shut before, open after a press of E, its things in reach)
        const shut = await page.evaluate((id) => window.__rt.game.siteArt?.openOf(id) ?? -1, c.id);
        await rt('press');
        await rt('simulate', 0.6);
        const opened = await page.evaluate((id) => window.__rt.game.siteArt?.openOf(id) ?? -1, c.id);
        movers.push(`${c.kind} ${shut.toFixed(2)}→${opened.toFixed(2)}`);
        if (shut > 0.01 || opened < 0.99) fail(`the ${c.kind}'s doors do not open with E (${shut} → ${opened})`);
      }
      const in1 = await inside();
      if (in1.things.some((t) => t.startsWith('('))) fail(`opened, the ${c.kind} still has things shut in it (${in1.things.join(',')})`);
      got.push(`${c.kind}: ${in1.things.join(',') || '(empty)'}`);
      if (c.kind === 'cupboard' && site === house) await shot('cupboard');
    }
    console.log(site.kind, JSON.stringify(got));
    if (got.some((x) => /not laid out/.test(x))) fail(`some containers at the ${site.kind} have not laid their things out (${got.filter((x) => /not laid/.test(x)).join(' | ')})`);
    if (got.some((x) => /mark on/.test(x))) fail(`some containers at the ${site.kind} could not be aimed at (${got.filter((x) => /mark on/.test(x)).join(' | ')})`);
  }
  console.log('opened', JSON.stringify(movers));
  if (!movers.length) fail('no container had doors, drawers or a lid to open');
  // (left far behind and come back to: the opened ones still open)
  if (house) {
    const opened = house.containers.filter((c) => c.kind === 'cupboard' || c.kind === 'wardrobe');
    await rt('devGoKm', (house.s + 3000) / 1000, false);
    await rt('simulate', 2);
    await goTo(house);
    for (const c of opened) {
      const t = await page.evaluate((id) => window.__rt.game.siteArt?.openOf(id) ?? -1, c.id);
      if (t >= 0 && t < 0.99) fail(`come back to, the opened ${c.kind} is shut again (${t})`);
    }
  }
  // (a house's door: shut, it keeps one out; opened with E it swings in and lets one through; the save has it)
  if (house) {
    await goTo(house);
    const door = await page.evaluate((sid) => (window.__rt.game.doors?.telemetry() ?? []).find((d) => d.id.startsWith(sid + '/') && d.name === 'door_wood') ?? null, house.id);
    console.log('house door', JSON.stringify(door));
    if (!door) fail('the house has no door hung');
    else {
      const blocks = () =>
        page.evaluate((d) => {
          const out = [];
          window.__rt.game.doors.solids.solidsNear(d.x, d.z, 0.4, out);
          return out.length;
        }, door);
      const shutBlocks = door.open < 0.5 ? await blocks() : -1;
      await page.evaluate((d) => {
        const g = window.__rt.game;
        g.doors.devices.find((x) => x.id === 'door:' + d.id)?.use();
        g.simulate(0.8);
      }, door);
      const now = await page.evaluate((id) => window.__rt.game.doors.telemetry().find((d) => d.id === id)?.open ?? -1, door.id);
      const openBlocks = await blocks();
      console.log('door', JSON.stringify({ was: door.open, now, shutBlocks, openBlocks }));
      if (Math.abs(now - (door.open < 0.5 ? 1 : 0)) > 0.01) fail(`the door did not swing (${door.open} → ${now})`);
      if (door.open < 0.5 && shutBlocks < 1) fail('the shut door does not keep one out');
      if (now > 0.5 && openBlocks > 0) fail('the open door still keeps one out');
      await page.evaluate(() => window.__rt.game.save());
      const kept = await page.evaluate((id) => JSON.parse(localStorage.getItem('modcar.save.v1') ?? '{}').places?.doors?.[id], door.id);
      if (kept === undefined) fail('the door is not in the save');
    }
  }
  // 7. a roadside garage's machines: its generator started, a thing recycled, its bench opened
  if (garage) {
    await goTo(garage);
    const ws0 = await page.evaluate(() => window.__rt.game.places.workshops[0]?.telemetry() ?? null);
    console.log('roadside workshop', JSON.stringify(ws0));
    if (!ws0) fail('the roadside garage has no machines');
    else {
      const ran = await page.evaluate(() => {
        const g = window.__rt.game;
        const w = g.places.workshops[0];
        const cord = w.devices.find((d) => d.id === 'gen_cord');
        // (the machines' roots hang in a root of world frame: their positions are the world's)
        const gp = w.gm.root.position;
        const from = Math.atan2(cord.z - gp.z, cord.x - gp.x);
        let marks = '';
        for (let k = 0; k < 14 && !w.power; k++) {
          marks = window.__rt.aimPoint(cord.x, cord.y, cord.z, from, 0.85);
          window.__rt.holdFor(0.8);
          g.simulate(0.5);
        }
        return { power: w.power, marks };
      });
      console.log('generator', JSON.stringify(ran));
      if (!ran.power) fail(`the roadside generator would not start (${ran.marks})`);
      await shot('roadshop');
      const rec = await page.evaluate(() => {
        const g = window.__rt.game;
        const w = g.places.workshops[0];
        const before = { ...g.stock };
        window.__rt.hold('item:junk_mug');
        const d = w.devices.find((x) => x.id === 'recycler');
        const fx = Math.cos(w.plan.recycler.heading);
        const fz = Math.sin(w.plan.recycler.heading);
        const mark = window.__rt.aimPoint(d.x, d.y, d.z, Math.atan2(fz, fx), 1.0);
        window.__rt.holdFor(0.3);
        g.simulate(6);
        return { mark, before, after: { ...g.stock }, held: !!g.player.held };
      });
      console.log('recycled', JSON.stringify(rec));
      if (rec.held || (rec.after.scrap ?? 0) + (rec.after.components ?? 0) <= (rec.before.scrap ?? 0) + (rec.before.components ?? 0)) fail(`nothing came of recycling at the roadside garage (${rec.mark})`);
      const bench = await page.evaluate(() => {
        const g = window.__rt.game;
        const w = g.places.workshops[0];
        const d = w.devices.find((x) => x.id === 'bench');
        // (the old garage's toolbox stands on the bench: aim at its other end)
        const tb = g.places.containerOf ? [...(g.places.devices ?? [])].filter((x) => x.id.startsWith('box:')).map((x) => ({ x: x.x, z: x.z })).sort((a, b) => Math.hypot(a.x - d.x, a.z - d.z) - Math.hypot(b.x - d.x, b.z - d.z))[0] : null;
        let ax = d.x;
        let az = d.z;
        if (tb && Math.hypot(tb.x - d.x, tb.z - d.z) < 1.2) {
          const n = Math.hypot(d.x - tb.x, d.z - tb.z) || 1;
          ax = d.x + ((d.x - tb.x) / n) * 0.4;
          az = d.z + ((d.z - tb.z) / n) * 0.4;
        }
        const mark = window.__rt.aimPoint(ax, d.y, az, Math.atan2(Math.sin(w.plan.bench.heading), Math.cos(w.plan.bench.heading)), 1.1);
        window.__rt.holdFor(0.2);
        g.simulate(0.6);
        return { mark, open: w.open };
      });
      console.log('bench', JSON.stringify(bench));
      if (!bench.open) fail(`the roadside bench did not open (${bench.mark})`);
      await shot('roadbench');
      await page.evaluate(() => {
        const w = window.__rt.game.places.workshops[0];
        w.closeBench();
        window.__rt.game.simulate(0.4);
      });
    }
  }
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
  await page.evaluate(() => {
    try {
      localStorage.removeItem('modcar.save.v1');
    } catch {
      /* none */
    }
  });
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `modcar_places: ${bad} FAILED` : 'places ok');
process.exit(bad ? 1 : 0);
