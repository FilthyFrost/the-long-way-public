// A cooler's lid against the cooler (the player's ask, 2026-11-26: "I want to open the cooler's lid, but it only gets
// picked up"), with the real mouse: the mark on the lid says 打开 and a click opens it — no list comes up (the player's
// ask of the same day: what is in it stands in it, nd_containers.mjs plays that) — the mark on the open lid says 盖上 and
// a click shuts it, the mark on the box's side picks the box up; a fridge's door opened the same way, no list.
//   SHOTS_GPU=1 node harness/shots/ui_lids.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/ui_lids');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const ok = (c, why) => {
  if (!c) bad++;
  console.log(c ? 'ok  ' : 'FAIL', why);
};
try {
  const { page } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:sedan&s=600&time=11&weather=clear`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const step = (s) => ev((s) => { const g = window.__rt.game; for (let t = 0; t < s; t += 1 / 60) g.step(1 / 60, 1); g.simulate(0); }, s);
  const state = () => ev(() => {
    const g = window.__rt.game;
    const t = g.player.target;
    const l = g.loose.list.find((x) => x.item?.item === 'kit_cooler');
    return {
      t: t ? `${t.kind}:${t.device?.id ?? ''}` : '-',
      words: document.querySelector('.mc-bot')?.innerText.replace(/\s+/g, ' ') ?? '',
      open: !!l?.item?.state?.open?.includes('LID'),
      list: !!g.listOpen,
      held: g.player.held?.kind === 'item' ? g.player.held.item.item : '',
    };
  });
  const shot = async (name) => { await rt('render'); await page.screenshot({ path: path.join(out, `${name}.png`) }); };
  const click = async () => { await page.mouse.down(); await step(0.08); await page.mouse.up(); await step(0.5); };
  await page.mouse.move(640, 360);
  await page.mouse.click(640, 360);
  for (let i = 0; i < 10; i++) {
    const s = await ev(() => { const g = window.__rt.game; if (g.seated) { g.seated.sim.setParkBrake(true); g.getOut(); } for (let t = 0; t < 0.5; t += 1 / 60) g.step(1 / 60, 1); return !!g.seated; });
    if (!s) break;
  }
  // a cooler on the road ahead of the car, the walker 1.1 m from it
  const at = await ev(async () => {
    const g = window.__rt.game;
    const v = g.vehicles[0];
    const b = new Float64Array(9);
    v.sim.basis(b);
    const I = await import('/src/core/modcar/items.ts');
    const x = v.sim.px + b[0] * 6;
    const z = v.sim.pz + b[2] * 6;
    const l = g.loose.addItem(I.newItem('kit_cooler'), x, v.sim.py, z, Math.atan2(b[2], b[0]));
    for (let t = 0; t < 1.5; t += 1 / 60) g.step(1 / 60, 1);
    return { x: l.x, y: l.y, z: l.z, top: l.y + 2 * l.mid, mid: l.y + l.mid, yaw: Math.atan2(b[2], b[0]) };
  });
  // 1. the mark on the lid (from beside it, looking down on its top): 打开, a click opens it and lists what is in it
  await rt('aimPoint', at.x, at.top - 0.01, at.z, at.yaw + Math.PI / 2, 1.0);
  await step(0.3);
  let s = await state();
  ok(s.t.startsWith('device:lids:') && /打开/.test(s.words), `the mark on the lid: the lid's own, 打开 (${s.t}, "${s.words}")`);
  await shot('1_lid_aimed');
  await click();
  s = await state();
  ok(s.open && !s.list, `a click on the lid opens it, and no list comes up (open ${s.open}, list ${s.list})`);
  await shot('2_lid_open');
  // 2. the open lid stands up at its back: the mark on its middle says 盖上, a click shuts it
  const lidAt = await ev(() => {
    const g = window.__rt.game;
    const l = g.loose.list.find((x) => x.item?.item === 'kit_cooler');
    const lid = l.obj.getObjectByName('LID');
    const o = g.core.origin;
    const V = g.core.camera.position.constructor;
    lid.updateWorldMatrix(true, true);
    // (the middle of the lid's leaf: half its length out from its hinge along its own +x)
    const inv = lid.matrixWorld.clone().invert();
    let len = 0;
    lid.traverse((c) => { if (c.isMesh) { c.geometry.computeBoundingBox(); const bb = c.geometry.boundingBox.clone().applyMatrix4(inv.clone().multiply(c.matrixWorld)); len = Math.max(len, bb.max.x); } });
    const p = lid.localToWorld(new V(len / 2, 0.03, 0));
    return { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z };
  });
  await rt('aimPoint', lidAt.x, lidAt.y, lidAt.z, at.yaw + Math.PI / 2, 1.0);
  await step(0.3);
  s = await state();
  ok(s.t.startsWith('device:lids:') && /盖上/.test(s.words), `the mark on the open lid: 盖上 (${s.t}, "${s.words}")`);
  await click();
  s = await state();
  ok(!s.open, `a click on the open lid shuts it (open ${s.open})`);
  await ev(() => window.__rt.game.closeCargoList?.());
  // 3. the mark on the box's side (the middle of its face towards one, half way up): the box itself — a click picks it up
  const face = await ev(() => {
    const g = window.__rt.game;
    const l = g.loose.list.find((x) => x.item?.item === 'kit_cooler');
    const part = l.obj.getObjectByName('PART');
    const V = g.core.camera.position.constructor;
    const o = g.core.origin;
    part.updateWorldMatrix(true, true);
    // (its body's end across its long way: the model's +z face — its tub's, not its handle's — a centimetre in, half way up)
    const p = part.localToWorld(new V(0, 0.2, 0.31));
    const c = part.localToWorld(new V(0, 0.2, 0));
    return { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z, yaw: Math.atan2(c.z - p.z, c.x - p.x) };
  });
  await rt('aimPoint', face.x, face.y, face.z, face.yaw + Math.PI, 1.2);
  await step(0.3);
  s = await state();
  ok(s.t.startsWith('loose:'), `the mark on the box's side: the box (${s.t}, "${s.words}")`);
  await shot('3_box_aimed');
  await click();
  s = await state();
  ok(s.held === 'kit_cooler', `a click on the box picks it up (in the hands: ${s.held || 'nothing'})`);

  // 4. a fridge: the mark on its door opens the door, the mark on its side (its cabinet) is the fridge to take up
  await ev(() => { const p = window.__rt.game.player; p.slots[p.sel] = null; });
  const fr = await ev(async () => {
    const g = window.__rt.game;
    const v = g.vehicles[0];
    const b = new Float64Array(9);
    v.sim.basis(b);
    const I = await import('/src/core/modcar/items.ts');
    const x = v.sim.px + b[0] * 9;
    const z = v.sim.pz + b[2] * 9;
    const l = g.loose.addItem(I.newItem('nd_fridge'), x, v.sim.py, z, Math.atan2(b[2], b[0]) + Math.PI);
    // (its model in: the door is a piece of it)
    for (let i = 0; i < 400 && !l.obj.getObjectByName('P_door'); i++) { for (let t = 0; t < 0.1; t += 1 / 60) g.step(1 / 60, 1); await new Promise((r) => setTimeout(r, 25)); }
    for (let t = 0; t < 1; t += 1 / 60) g.step(1 / 60, 1);
    const V = g.core.camera.position.constructor;
    const o = g.core.origin;
    l.obj.updateWorldMatrix(true, true);
    const door = l.obj.getObjectByName('P_door');
    // (the door's middle on its face, and the cabinet's side half way up: the model's +x is its front)
    const box = { min: new V(Infinity, Infinity, Infinity), max: new V(-Infinity, -Infinity, -Infinity) };
    door.traverse((c) => { if (c.isMesh) { c.geometry.computeBoundingBox(); const bb = c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld); box.min.min(bb.min); box.max.max(bb.max); } });
    const dc = box.min.clone().add(box.max).multiplyScalar(0.5);
    const front = l.obj.localToWorld(new V(1, 0, 0)).sub(l.obj.localToWorld(new V(0, 0, 0)));
    const side = l.obj.localToWorld(new V(-0.05, l.mid, 0.33)); // its right flank, a little behind the door
    return { door: { x: dc.x + o.x, y: dc.y + o.y, z: dc.z + o.z }, front: Math.atan2(front.z, front.x), side: { x: side.x + o.x, y: side.y + o.y, z: side.z + o.z }, sideYaw: Math.atan2(l.obj.localToWorld(new V(0, 0, 1)).z - l.obj.position.z, l.obj.localToWorld(new V(0, 0, 1)).x - l.obj.position.x) };
  });
  await rt('aimPoint', fr.door.x, fr.door.y, fr.door.z, fr.front, 1.3);
  await step(0.3);
  s = await state();
  ok(/打开冰箱门/.test(s.words), `the mark on the fridge's door: 打开冰箱门 ("${s.words}")`);
  await shot('4_fridge_door');
  await click();
  const fopen = await ev(() => !!window.__rt.game.loose.list.find((x) => x.item?.item === 'nd_fridge')?.item?.state?.open?.length);
  s = await state();
  ok(fopen && !s.list, `a click on the door opens it, and no list comes up (${fopen}, list ${s.list})`);
  await rt('aimPoint', fr.side.x, fr.side.y, fr.side.z, fr.sideYaw, 1.2);
  await step(0.3);
  s = await state();
  ok(/拿起/.test(s.words) && !/冰箱门/.test(s.words), `the mark on the fridge's side: the fridge itself, 拿起 (${s.t}, "${s.words}")`);
  await shot('5_fridge_side');
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `ui_lids: ${bad} failed` : 'ui_lids ok');
process.exit(bad ? 1 : 0);
