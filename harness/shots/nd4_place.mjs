// ND4's placing (docs/ND/PLAN.md; Nomad Drive's placement mode): R with a chair in the hands holds it out with its
// ghost on the cabin's yard, E turns it a quarter round, the left button puts it down; a bookshelf held into the
// cabin's wall shows red; inside, the chair goes onto the floor; a chair held out at the pickup's bed goes to its spot
// there and rides in it; in a second world the motorhome's side door open, a sofa held out into it goes onto its floor.
//   SHOTS_GPU=1 node harness/shots/nd4_place.mjs [seed] [hour]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/nd4');
fs.mkdirSync(out, { recursive: true });
const seed = process.argv[2] || '7';
const hour = process.argv[3] || '15.6';
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  let { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&nd=cabin&time=${hour}&weather=clear`, { width: 1280, height: 720 });
  const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
  const frames = (n) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.step(1 / 60, 1); }, n);
  const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
  const shot = async (f, extra = '') => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, f) });
    console.log('shot', f, extra);
  };
  const settle = async () => {
    for (let i = 0; i < 80; i++) {
      await step(4);
      const st = await page.evaluate(() => ({ pending: window.__rt.worldPending(), drawn: window.__rt.game.systems.harness('nd-build', 'drawn') }));
      if (st.pending <= 0 && st.drawn.length && st.drawn.every((d) => d.ready)) break;
    }
    await page.evaluate(() => window.__rt.game.loose.settled());
    await step(8);
  };
  const P = (await H('nd-build', 'places')).find((p) => p.prefab === 'cabin');
  if (!P) throw new Error('no cabin laid');
  // card frame -> world (u along the road, v away from it)
  const W = (u, v) => ({ x: P.x + Math.cos(P.yaw) * u - Math.sin(P.yaw) * v, z: P.z + Math.sin(P.yaw) * u + Math.cos(P.yaw) * v });
  const standAt = async (from, to, pitch) => {
    const a = W(from[0], from[1]);
    const b = W(to[0], to[1]);
    await page.evaluate(({ a, b, pitch }) => window.__rt.stand(a.x, a.z, Math.atan2(b.z - a.z, b.x - a.x), pitch), { a, b, pitch });
    await step(4);
  };
  await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, W(-7, -8));
  await settle();
  await H('nd-build', 'door', P.id, true);
  const chairs = () => page.evaluate(() => window.__rt.game.loose.list.filter((l) => l.item?.item === 'nd_chair').map((l) => [+l.x.toFixed(2), +l.y.toFixed(2), +l.z.toFixed(2), +l.yaw.toFixed(2), !!l.riding]));
  // the yard in front of the cabin: a chair held out on the grass
  await standAt([-1, -6.5], [-1, -9], -0.45);
  await page.evaluate(() => window.__rt.hold('item:nd_chair'));
  await frames(10);
  console.log('placing', await H('nd-place', 'start'));
  await H('nd-place', 'wheel', 8);
  await frames(30);
  console.log('aim', JSON.stringify(await H('nd-place', 'aim')));
  await shot('10_chair_held_out.png');
  await H('nd-place', 'turn', 1);
  await frames(20);
  await shot('11_chair_turned.png');
  console.log('put', await H('nd-place', 'put'));
  await frames(20);
  await shot('12_chair_put_down.png', JSON.stringify(await chairs()));
  // inside: a bookshelf held into the wall is red; then onto the floor clear of it
  await standAt([0.2, -1.2], [0.2, 1.5], -0.2);
  await page.evaluate(() => window.__rt.hold('item:nd_bookshelf'));
  await frames(6);
  console.log('placing', await H('nd-place', 'start'));
  await H('nd-place', 'wheel', 20);
  await frames(30);
  console.log('aim into the wall', JSON.stringify(await H('nd-place', 'aim')));
  await shot('15_bookshelf_into_the_wall.png');
  await H('nd-place', 'wheel', -20);
  await page.evaluate(() => { window.__rt.game.input.lookPitch = -0.55; });
  await frames(30);
  console.log('aim on the floor', JSON.stringify(await H('nd-place', 'aim')));
  await shot('16_bookshelf_on_the_floor.png');
  await H('nd-place', 'stop');
  await page.evaluate(() => { const p = window.__rt.game.player; p.slots[p.sel] = null; });
  // the pickup: a chair held out at its bed
  const v = await page.evaluate(() => { const g = window.__rt.game; const v = g.vehicles[0]; const b = new Float64Array(9); v.sim.basis(b); return { x: v.sim.px, z: v.sim.pz, h: Math.atan2(b[2], b[0]), y: v.sim.py }; });
  const bed = { x: v.x + Math.cos(v.h) * -1.45, z: v.z + Math.sin(v.h) * -1.45 };
  const gy = await page.evaluate(({ bed }) => window.__rt.game.world.heightAt(bed.x, bed.z), { bed });
  await page.evaluate(() => window.__rt.hold('item:nd_chair'));
  // (looking over the shut tailgate down into the bed: through it, the bed is not aimed at since docs/V3/plan/prompts.md §四)
  await page.evaluate(({ bed, v, gy }) => window.__rt.aimPoint(bed.x, gy + 0.85, bed.z, v.h + Math.PI, 1.6), { bed, v, gy });
  await frames(6);
  console.log('placing', await H('nd-place', 'start'));
  await frames(30);
  console.log('aim at the bed', JSON.stringify(await H('nd-place', 'aim')));
  await shot('13_chair_at_the_bed.png');
  console.log('put', await H('nd-place', 'put'));
  await frames(30);
  console.log('chairs', JSON.stringify(await chairs()));
  await page.evaluate(({ v }) => window.__rt.aimPoint(v.x, v.y + 0.6, v.z, v.h + 2.2, 6.5), { v });
  await frames(10);
  await shot('14_chair_in_the_bed.png');
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
  await page.close();
  // the motorhome: its side door open, a sofa held out into it
  ({ page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=2&seed=7&start=road&build=stock:rv&s=300&time=${hour}&weather=clear`, { width: 1280, height: 720 }));
  for (let i = 0; i < 30; i++) await step(4);
  await page.evaluate(() => window.__rt.game.loose.settled());
  const rv = await page.evaluate(() => { const g = window.__rt.game; const v = g.vehicles[0]; const b = new Float64Array(9); v.sim.basis(b); v.view.setPanelOpen('door_side', true); return { x: v.sim.px, z: v.sim.pz, h: Math.atan2(b[2], b[0]), y: v.sim.py }; });
  await step(10);
  // the side door is on the right (+z of the frame): stand out from it, looking in at the floor by the door
  const right = { x: -Math.sin(rv.h), z: Math.cos(rv.h) };
  const inFloor = { x: rv.x + Math.cos(rv.h) * -0.3 + right.x * 0.3, z: rv.z + Math.sin(rv.h) * -0.3 + right.z * 0.3 };
  const fy = await page.evaluate(({ p }) => window.__rt.game.world.heightAt(p.x, p.z), { p: inFloor });
  await page.evaluate(() => window.__rt.hold('item:nd_sofa'));
  await page.evaluate(({ p, fy, rv }) => window.__rt.aimPoint(p.x, fy + 0.9, p.z, rv.h + Math.PI / 2, 2.3), { p: inFloor, fy, rv });
  await frames(8);
  console.log('placing', await H('nd-place', 'start'));
  await H('nd-place', 'yaw', rv.h + Math.PI);
  await frames(30);
  console.log('aim into the motorhome', JSON.stringify(await H('nd-place', 'aim')));
  await shot('17_sofa_into_the_motorhome.png');
  console.log('put', await H('nd-place', 'put'));
  await frames(30);
  console.log('sofa', JSON.stringify(await page.evaluate(() => window.__rt.game.loose.list.filter((l) => l.item?.item === 'nd_sofa').map((l) => ({ riding: !!l.riding, stow: l.stow ?? null })))));
  await shot('18_sofa_in_the_motorhome.png');
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
