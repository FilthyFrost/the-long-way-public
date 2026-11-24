// J9d (docs/V3/plan/growth.md §六 2), in the game: the Tadpole trailer and a Mule with a tow hitch on the road — the
// trailer standing on its jockey wheel, the Mule backed up to it, 长按 挂上 骡子 at its coupling, hitched; driven off and
// round a bend the trailer follows, its coupling on the ball, its wheels on the ground and turning, cutting the corner;
// a chair put in its box rides along; backed up steered hard it folds no further than its drawbar lets it (60°);
// unhitched it stands where it was left. Then the plan's trailer, found standing whole at a big place 75–100 km down
// the road, its hitch ball planned a few kilometres before it.
//   SHOTS_GPU=1 node harness/shots/j9d_trailer.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/j9d_trailer');
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
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:pickup&s=900&time=10&weather=clear`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const shot = async (f) => {
    await page.evaluate(async () => {
      const g = window.__rt.game;
      g.ui.showHelp(false);
      for (let i = 0; i < 300 && (g.worldView?.pending ?? 0) > 0; i++) {
        const v = g.seated;
        g.worldView.update(v ? v.sim.px : g.player.walker.x, v ? v.sim.pz : g.player.walker.z, 40);
        await new Promise((r) => setTimeout(r, 0));
      }
      for (let i = 0; i < 2; i++) window.__rt.render();
    });
    await page.screenshot({ path: path.join(out, f) });
  };
  // the Mule: a hitch on it; the trailer spawned behind it, its coupling 2.4 m short of the ball
  const setup = await page.evaluate(async () => {
    const g = window.__rt.game;
    const B = await import('/src/core/modcar/build.ts');
    const T = await import('/src/game/modcar/v3/tow/system.ts');
    const mule = g.vehicles.find((v) => v.build.frame === 'pickup');
    if (g.seated) g.getOut();
    B.fitPart(mule.build, 'hitch', B.newInstance('hitch_ball'));
    mule.changed();
    mule.sim.setParkBrake(true);
    g.simulate(0.3);
    const ball = T.ballOf(mule);
    const yaw = mule.sim.yaw;
    const fx = Math.cos(yaw);
    const fz = -Math.sin(yaw);
    // (the trailer's model origin, under its axle: its coupler's length and 2.4 m more behind the ball, facing the same way)
    const L = 2.13;
    const ox = ball.x - fx * (L + 2.4);
    const oz = ball.z - fz * (L + 2.4);
    const tr = g.addVehicle(B.stockBuild('trailer'), ox, oz, yaw);
    // (its sim stands at its centre of gravity: from the origin by cg, turned with it)
    const cg = tr.sys.derived.cg;
    tr.sim.px = ox + Math.cos(yaw) * cg.x + Math.sin(yaw) * cg.z;
    tr.sim.pz = oz - Math.sin(yaw) * cg.x + Math.cos(yaw) * cg.z;
    g.simulate(0.5);
    return { mule: g.vehicles.indexOf(mule), trailer: g.vehicles.indexOf(tr), hitch: !!ball, ball, coupler: T.couplerOf(tr), cg };
  });
  ok(setup.hitch && setup.trailer >= 0, `a Mule with a hitch, a Tadpole behind it (${JSON.stringify(setup)})`);
  const pose = (i) => page.evaluate((i) => { const s = window.__rt.game.vehicles[i].sim; return { x: s.px, y: s.py, z: s.pz, yaw: s.yaw, pitch: s.pitch, roll: s.roll }; }, i);
  const stand = await pose(setup.trailer);
  ok(Math.abs(stand.roll) < 0.1 && Math.abs(stand.pitch) < 0.2, `standing on its jockey wheel: pitch ${stand.pitch.toFixed(3)}, roll ${stand.roll.toFixed(3)}`);
  const standH = await page.evaluate(async (i) => {
    const g = window.__rt.game;
    const T = await import('/src/game/modcar/v3/tow/system.ts');
    const c = T.couplerOf(g.vehicles[i]);
    return c.y - g.world.heightAt(c.x, c.z);
  }, setup.trailer);
  ok(Math.abs(standH - 0.445) < 0.08, `its coupling at its standing height (${standH.toFixed(3)} m over the ground)`);
  // on foot at its coupling: the word
  const couplerAt = (i) =>
    page.evaluate(async (i) => {
      const g = window.__rt.game;
      const T = await import('/src/game/modcar/v3/tow/system.ts');
      const t = g.vehicles[i];
      const c = T.couplerOf(t);
      return { x: c.x, y: c.y, z: c.z, yaw: t.sim.yaw };
    }, i);
  let coupler = await couplerAt(setup.trailer);
  console.log('near', JSON.stringify(await page.evaluate(async ({ t, m }) => {
    const g = window.__rt.game;
    const I = await import('/src/game/modcar/v3/tow/index.ts');
    const T = await import('/src/game/modcar/v3/tow/system.ts');
    const tr = g.vehicles[t];
    const v = g.vehicles[m];
    const ball = T.ballOf(v);
    const cp = T.couplerOf(tr);
    return { ball, cp, d: Math.hypot(ball.x - cp.x, ball.z - cp.z), dy: ball.y - cp.y, near: I.towing.towNear(tr) };
  }, { t: setup.trailer, m: setup.mule })));
  await rt('aimPoint', coupler.x, coupler.y, coupler.z, Math.PI / 2 - coupler.yaw, 1.1);
  await rt('simulate', 0.1);
  await shot('01_coupling.png');
  let words = await page.evaluate(() => document.body.innerText);
  const near = words.split('\n').filter((l) => l.includes('挂')).join(' · ');
  console.log('at the coupling:', near || '—');
  // (pressed with the ball 2.4 m off: why)
  await rt('useFor', 0.1);
  await rt('simulate', 0.1);
  words = await page.evaluate(() => document.body.innerText);
  ok(/把车倒到挂钩对着这儿/.test(words), `the ball 2.4 m off, pressed: why (${words.split('\n').filter((l) => l.includes('倒') || l.includes('挂')).join(' · ') || '—'})`);
  // the Mule backed up to it: the foot brake held at a standstill is reverse
  const backed = await page.evaluate(async ({ m, t }) => {
    const g = window.__rt.game;
    const T = await import('/src/game/modcar/v3/tow/system.ts');
    const v = g.vehicles[m];
    const tr = g.vehicles[t];
    const gap = () => {
      const b = T.ballOf(v);
      const c = T.couplerOf(tr);
      return Math.hypot(b.x - c.x, b.z - c.z);
    };
    // (the ball short of the coupling (+) or past it (−), along the trailer)
    const along = () => {
      const b = T.ballOf(v);
      const c = T.couplerOf(tr);
      return (b.x - c.x) * Math.cos(tr.sim.yaw) - (b.z - c.z) * Math.sin(tr.sim.yaw);
    };
    g.enter(v);
    v.sim.setParkBrake(false);
    if (!v.sys.running) v.sys.startNow();
    let i = 0;
    // (backing: the foot brake at a standstill is reverse; the last metre crept, stopped as the ball comes under it)
    for (; i < 60 * 20 && along() > 0.12 + Math.abs(v.sim.kmh / 3.6) * 0.45; i++) {
      g.scripted = { steer: 0, throttle: 0, brake: gap() > 1.3 ? 0.3 : 0.12, handbrake: 0 };
      g.step(1 / 60, 1);
    }
    const went = i / 60;
    for (let k = 0; k < 120 && Math.abs(v.sim.kmh) > 0.2; k++) {
      g.scripted = { steer: 0, throttle: 0, brake: 0, handbrake: 1 };
      g.step(1 / 60, 1);
    }
    g.scripted = null;
    v.sim.setParkBrake(true);
    g.getOut();
    g.simulate(0.3);
    return { gap: gap(), along: along(), went, kmh: v.sim.kmh };
  }, { m: setup.mule, t: setup.trailer });
  ok(backed.gap < 0.6, `backed up ${backed.went.toFixed(1)} s: the ball ${backed.gap.toFixed(2)} m from the coupling (${backed.along >= 0 ? 'short of it' : 'past it'})`);
  coupler = await couplerAt(setup.trailer);
  await rt('aimPoint', coupler.x, coupler.y, coupler.z, Math.PI / 2 - coupler.yaw, 1.1);
  await rt('simulate', 0.1);
  words = await page.evaluate(() => document.body.innerText);
  ok(/挂上\s*骡子/.test(words), `at the coupling: 长按 挂上 骡子 (${words.split('\n').filter((l) => l.includes('挂')).join(' · ') || '—'})`);
  await shot('02_backed_up.png');
  // held: hitched
  await rt('useFor', 0.8);
  await rt('simulate', 0.2);
  const linked = await page.evaluate(async ({ t }) => {
    const I = await import('/src/game/modcar/v3/tow/index.ts');
    const tow = I.towing.towOf(window.__rt.game.vehicles[t]);
    return tow ? tow.build.frame : null;
  }, { t: setup.trailer });
  ok(linked === 'pickup', `held: hitched to the Mule (${linked})`);
  await shot('03_hitched.png');
  // a chair in its box (packed in as Q packs it)
  const chairIn = await page.evaluate(async ({ t }) => {
    const g = window.__rt.game;
    const It = await import('/src/core/modcar/items.ts');
    const tr = g.vehicles[t];
    const held = { kind: 'item', item: It.newItem('nd_chair') };
    await g.loose.objectFor(held);
    await new Promise((r) => setTimeout(r, 0));
    const at = g.cargo.packSpot(tr, held);
    if (!at) {
      const C = await import('/src/core/modcar/cargo.ts');
      const z = C.zonesFor('trailer', tr.build)[0];
      const gr = g.cargo.grid(tr, z);
      const hs = Array.from(gr.h);
      const fin = hs.filter((x) => Number.isFinite(x));
      return { noRoom: { zone: z.id, top: z.top, box: g.cargo.boxOf(held), n: hs.length, finite: fin.length, min: Math.min(...fin), max: Math.max(...fin), mid: hs[Math.floor(hs.length / 2)], settled: !!tr.view.model } };
    }
    const l = g.cargo.stow(tr, at.zone, at.spot, held);
    window.__chair = l;
    return { zone: at.zone.id, y: +at.spot.y.toFixed(2) };
  }, { t: setup.trailer });
  ok(!!chairIn && chairIn.zone === 'cabin', `a chair packed into its box (${JSON.stringify(chairIn)})`);
  // driven off and round a bend: in two halves (a shot from the side in the bend between them)
  const driveFor = (from, to) =>
    page.evaluate(
      async ({ m, t, from, to }) => {
        const g = window.__rt.game;
        const v = g.vehicles[m];
        const tr = g.vehicles[t];
        const T = await import('/src/game/modcar/v3/tow/system.ts');
        if (from === 0) {
          g.enter(v);
          v.sim.setParkBrake(false);
          if (!v.sys.running) v.sys.startNow();
          window.__tow = { rows: [], maxGap: 0, maxOff: 0, spin0: tr.sim.wheels[2].spin };
        }
        const st = window.__tow;
        for (let i = from; i < to; i++) {
          const steer = i > 60 * 5 && i < 60 * 9 ? 0.45 : 0;
          // (stopped on the handbrake: the foot brake held at a standstill is reverse)
          const stopping = i >= 60 * 11;
          const stopped = stopping && Math.abs(v.sim.kmh) < 1;
          g.scripted = { steer, throttle: stopping ? 0 : 0.35, brake: stopping && !stopped ? 0.6 : 0, handbrake: stopped ? 1 : 0 };
          g.step(1 / 60, 1);
          // (the coupling on the ball: how far apart)
          const H = T.ballOf(v);
          const C = T.couplerOf(tr);
          if (i > 30) st.maxGap = Math.max(st.maxGap, Math.hypot(H.x - C.x, H.y - C.y, H.z - C.z));
          // (its wheels on the ground: the model origin, under the axle, over the ground there)
          const o = T.originOf(tr);
          const off = o.y - g.world.heightAt(o.x, o.z);
          if (i > 30) st.maxOff = Math.max(st.maxOff, Math.abs(off));
          if (i % 60 === 0) st.rows.push({ t: i / 60, kmh: +v.sim.kmh.toFixed(1), muleYaw: +v.sim.yaw.toFixed(2), trailerYaw: +tr.sim.yaw.toFixed(2), gap: +Math.hypot(H.x - C.x, H.z - C.z).toFixed(3), wheelsOff: +off.toFixed(3) });
        }
        g.scripted = null;
        return { rows: st.rows, maxGap: st.maxGap, maxOff: st.maxOff, spun: tr.sim.wheels[2].spin - st.spin0 };
      },
      { m: setup.mule, t: setup.trailer, from, to },
    );
  await driveFor(0, 60 * 8);
  // (in the bend, from the side and behind: the trailer cutting inside the Mule's line)
  await rt('setOrbit', 128, 22, 12.5, 0.9, setup.mule);
  await shot('04_bend.png');
  await rt('setView', 'chase');
  await shot('04_bend_chase.png');
  const track = await driveFor(60 * 8, 60 * 14);
  for (const r of track.rows) console.log('  ', JSON.stringify(r));
  ok(track.maxGap < 0.12, `driven 14 s and round a bend: the coupling on the ball (at most ${track.maxGap.toFixed(3)} m off)`);
  ok(track.spun > 10, `its wheels turned (${track.spun.toFixed(0)} rad)`);
  ok(track.maxOff < 0.05, `its wheels on the ground (at most ${track.maxOff.toFixed(3)} m off)`);
  const chair = await page.evaluate(async ({ t }) => {
    const g = window.__rt.game;
    const T = await import('/src/game/modcar/v3/tow/system.ts');
    const tr = g.vehicles[t];
    const l = window.__chair;
    if (!l) return null;
    const o = T.originOf(tr);
    return { rides: g.loose.ridersOf(tr).includes(l), plan: +Math.hypot(l.x - o.x, l.z - o.z).toFixed(2), up: +(l.y - o.y).toFixed(2) };
  }, { t: setup.trailer });
  ok(!!chair && chair.rides && chair.plan < 1.6 && chair.up > 0.4 && chair.up < 1.9, `the chair rode along in its box (${JSON.stringify(chair)})`);
  const bend = track.rows.find((r) => r.t === 8);
  ok(!!bend && Math.abs(bend.muleYaw - bend.trailerYaw) > 0.05, `in the bend the trailer's heading lags the Mule's (${bend ? (bend.muleYaw - bend.trailerYaw).toFixed(2) : '—'} rad)`);
  await rt('setView', 'chase');
  await shot('04_towing.png');
  const back = await page.evaluate(({ m }) => window.__rt.game.vehicles[m].chaseBack, { m: setup.mule });
  ok(back > 3, `towing, the chase view stands back over it (${back.toFixed(2)} m more)`);
  // backed up with it on, steered hard: it folds, no further than its drawbar lets it, and the Mule backs on
  const folded = await page.evaluate(
    async ({ m, t }) => {
      const g = window.__rt.game;
      const T = await import('/src/game/modcar/v3/tow/system.ts');
      const v = g.vehicles[m];
      const tr = g.vehicles[t];
      v.sim.setParkBrake(false);
      let most = 0;
      let gap = 0;
      const x0 = v.sim.px;
      const z0 = v.sim.pz;
      for (let i = 0; i < 60 * 7; i++) {
        g.scripted = { steer: 0.7, throttle: 0, brake: 0.35, handbrake: 0 };
        g.step(1 / 60, 1);
        let rel = tr.sim.yaw - v.sim.yaw;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        most = Math.max(most, Math.abs(rel));
        const H = T.ballOf(v);
        const C = T.couplerOf(tr);
        gap = Math.max(gap, Math.hypot(H.x - C.x, H.y - C.y, H.z - C.z));
      }
      const went = Math.hypot(v.sim.px - x0, v.sim.pz - z0);
      for (let i = 0; i < 120 && Math.abs(v.sim.kmh) > 0.3; i++) {
        g.scripted = { steer: 0, throttle: 0, brake: 0, handbrake: 1 };
        g.step(1 / 60, 1);
      }
      g.scripted = null;
      return { most, gap, went, jack: T.JACK };
    },
    { m: setup.mule, t: setup.trailer },
  );
  ok(folded.went > 3 && folded.most <= folded.jack + 0.03 && folded.most > 0.3 && folded.gap < 0.05, `backed up steered hard: it folds to ${folded.most.toFixed(2)} rad (the limit ${folded.jack}), the coupling on the ball (${folded.gap.toFixed(3)} m), the Mule backed ${folded.went.toFixed(1)} m`);
  await rt('setOrbit', 150, 30, 11, 0.9, setup.mule);
  await shot('04c_folded.png');
  // out, at its coupling: 摘下挂车; it stands where it was left
  await page.evaluate(() => {
    const g = window.__rt.game;
    g.seated.sim.setParkBrake(true);
    g.getOut();
    g.simulate(0.3);
  });
  coupler = await couplerAt(setup.trailer);
  console.log('hitched, the mark on:', await rt('aimPoint', coupler.x, coupler.y, coupler.z, Math.PI / 2 - coupler.yaw, 1.1));
  await rt('simulate', 0.1);
  words = await page.evaluate(() => document.body.innerText);
  ok(/摘下挂车/.test(words), `at its coupling, hitched: 摘下挂车 (${words.split('\n').filter((l) => l.includes('挂')).join(' · ') || '—'})`);
  await rt('useFor', 0.8);
  await rt('simulate', 0.4);
  const left = await page.evaluate(async ({ t }) => {
    const g = window.__rt.game;
    const I = await import('/src/game/modcar/v3/tow/index.ts');
    const T = await import('/src/game/modcar/v3/tow/system.ts');
    const tr = g.vehicles[t];
    const c = T.couplerOf(tr);
    return { towed: !!I.towing.towOf(tr), standH: c.y - g.world.heightAt(c.x, c.z), roll: tr.sim.roll };
  }, { t: setup.trailer });
  ok(!left.towed && Math.abs(left.standH - 0.445) < 0.1, `held: unhitched, standing on its jockey wheel (coupling ${left.standH.toFixed(3)} m up, roll ${left.roll.toFixed(3)})`);
  await shot('05_unhitched.png');
  // the plan's trailer, found: down the road at a big place, standing whole on its jockey wheel; its hitch ball before it
  const spots = (await rt('wreckSpots', 60000, 110000)).filter((w) => w.findFrame === 'trailer');
  ok(spots.length === 1, `one trailer to find in 60–110 km (${spots.map((w) => `${w.siteKind} ${(w.s / 1000).toFixed(1)} km`).join(', ') || '—'})`);
  const ball = await page.evaluate(async () => {
    const S = await import('/src/core/modcar/schedule.ts');
    const p = S.placesPlan(window.__rt.game.world.seed, 120);
    const b = p.find((x) => 'part' in x.thing && x.thing.part === 'hitch_ball');
    return b ? { s: b.s, themes: b.themes } : null;
  });
  ok(!!ball && !!spots[0] && ball.s < spots[0].s - 2500, `its hitch ball planned before it (${ball ? (ball.s / 1000).toFixed(1) : '—'} km, at ${ball?.themes?.join('/') ?? '—'})`);
  if (spots[0]) {
    const w = spots[0];
    await rt('devGoKm', w.s / 1000, false);
    let live = null;
    for (let k = 0; k < 80 && !live?.ready; k++) {
      await rt('simulate', 0.25);
      live = ((await rt('wrecks'))?.list ?? []).find((l) => l.id === w.id) ?? null;
      await page.waitForTimeout(50);
    }
    ok(!!live?.ready, `gone there: it stands at its place (${live ? live.id : '—'})`);
    if (live) {
      const found = await page.evaluate(async ({ i, side }) => {
        const g = window.__rt.game;
        const T = await import('/src/game/modcar/v3/tow/system.ts');
        const t = g.vehicles[i];
        g.simulate(0.5);
        const c = T.couplerOf(t);
        const o = T.originOf(t);
        const wheels = t.view.frame.mounts.filter((m) => m.cat === 'rim').every((m) => !!t.build.parts[m.id]);
        // (stood off it, three-quarters from the front, looking at it)
        const yaw = t.sim.yaw;
        const ang = yaw + side;
        const sx = o.x + Math.cos(ang) * 6.0;
        const sz = o.z - Math.sin(ang) * 6.0;
        window.__rt.stand(sx, sz, Math.atan2(o.z - sz, o.x - sx), -0.16);
        return { frame: t.build.frame, standH: c.y - g.world.heightAt(c.x, c.z), wheels, door: !!t.build.parts.trunk };
      }, { i: live.index, side: 0.7 });
      ok(found.frame === 'trailer' && found.wheels && Math.abs(found.standH - 0.445) < 0.1, `found whole, on its jockey wheel (${JSON.stringify(found)})`);
      await rt('simulate', 0.5);
      await shot('06_found.png');
      await page.evaluate(async ({ i }) => {
        const g = window.__rt.game;
        const T = await import('/src/game/modcar/v3/tow/system.ts');
        const t = g.vehicles[i];
        const o = T.originOf(t);
        const ang = t.sim.yaw - 0.75;
        const sx = o.x + Math.cos(ang) * 5.5;
        const sz = o.z - Math.sin(ang) * 5.5;
        window.__rt.stand(sx, sz, Math.atan2(o.z - sz, o.x - sx), -0.16);
      }, { i: live.index });
      await rt('simulate', 0.5);
      await shot('06_found_b.png');
    }
  }
  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `j9d_trailer: ${bad} FAILED` : 'j9d_trailer: ok');
process.exit(bad ? 1 : 0);
