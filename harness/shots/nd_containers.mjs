// What a container holds stands in it (the player's ask, 2026-11-26: "打开保温箱，冰箱，柜子的时候不要跳出来这个UI…能直接看
// 到里面存放的物品，鼠标对准该物品就可以捡起来…所见即所得"), played with the real mouse and keys:
//   1. the cooler: its lid opened with a click on it — no list; a tomato and a can put in by aiming (R, the left button),
//      each where it was aimed; the lid shut: nothing of them drawn, nothing to aim at; opened again: there they are;
//      the tomato taken out by the mark on it; a pack put in with Q at the first place it fits; Tab still lists it.
//   2. a fridge: its door opened, a can on its top shelf and a bottle of beer in its door's shelf (it swings with the
//      door), shut, opened again, the can taken out by the mark on it, and the beer out of the door.
//   3. a cupboard (the two-door cabinet): its door opened, a tin and a can stood in it by aiming, shut (hidden),
//      opened again, the can taken out by the mark on it.
//   4. a nightstand's drawer: full at its three stacks — said so; the egg in it taken out by the mark on it (not the
//      drawer's); what an old save had in a cooler, with no places, laid out in it when it is opened.
//   5. the first cooler as the save keeps it, read back and put down again: its lid open, its things where they stood.
//   SHOTS_GPU=1 node harness/shots/nd_containers.mjs   (OUT=<dir> for the pictures)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = process.env.OUT || path.join(ROOT, 'loop/shots/nd_containers');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const ok = (c, why) => {
  if (!c) bad++;
  console.log(c ? 'ok  ' : 'FAIL', why);
};
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:sedan&s=600&time=11&weather=clear`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const step = (s) => ev((s) => { const g = window.__rt.game; for (let t = 0; t < s; t += 1 / 60) g.step(1 / 60, 1); g.simulate(0); }, s);
  const S = (fn, ...a) => ev(({ fn, a }) => window.__rt.game.systems.harness('nd-store', fn, ...a), { fn, a });
  const H = (fn, ...a) => ev(({ fn, a }) => window.__rt.game.systems.harness('nd-home', fn, ...a), { fn, a });
  const shot = async (name) => { await rt('render'); await page.screenshot({ path: path.join(out, `${name}.png`) }); };
  /** the left button, as the mouse gives it */
  const click = async () => { await page.mouse.down(); await step(0.08); await page.mouse.up(); await step(0.5); };
  const key = async (code) => { await page.keyboard.press(code); await step(0.1); };
  const state = () => ev(() => {
    const g = window.__rt.game;
    const t = g.player.target;
    const h = g.player.held;
    return {
      t: t ? `${t.kind}:${t.device?.id ?? t.loose?.item?.item ?? ''}` : '-',
      words: document.querySelector('.mc-bot')?.innerText.replace(/\s+/g, ' ') ?? '',
      list: !!g.listOpen,
      held: h?.kind === 'item' ? h.item.item : '',
      placing: g.systems.harness('nd-place', 'placing'),
    };
  });
  const view = async (uid) => (await S('views')).find((v) => v.uid === uid) ?? null;
  const inside = (uid) => ev((uid) => (window.__rt.game.loose.list.find((l) => l.uid === uid)?.item?.inside ?? []).map((x) => x.item), uid);
  await page.mouse.move(640, 360);
  await page.mouse.click(640, 360);
  for (let i = 0; i < 10; i++) {
    const s = await ev(() => { const g = window.__rt.game; if (g.seated) { g.seated.sim.setParkBrake(true); g.getOut(); } for (let t = 0; t < 0.5; t += 1 / 60) g.step(1 / 60, 1); return !!g.seated; });
    if (!s) break;
  }
  /** a container of a kind on the road ahead of the car (at `ahead` m, turned `turn` from the car's heading), its model in; things in it (no places: as an old save had them) */
  const put = (kind, ahead, turn = 0, things = [], state = null) => ev(async ({ kind, ahead, turn, things, state }) => {
    const g = window.__rt.game;
    const v = g.vehicles[0];
    const b = new Float64Array(9);
    v.sim.basis(b);
    const I = await import('/src/core/modcar/items.ts');
    const box = I.newItem(kind);
    if (state) box.state = state;
    for (const id of things) I.putInside(box, I.newItem(id), 0);
    const yaw = Math.atan2(b[2], b[0]) + turn;
    const l = g.loose.addItem(box, v.sim.px + b[0] * ahead, v.sim.py, v.sim.pz + b[2] * ahead, yaw);
    for (let i = 0; i < 400 && l.obj.children.length < 1; i++) await new Promise((r) => setTimeout(r, 25));
    for (let i = 0; i < 60; i++) { for (let t = 0; t < 0.05; t += 1 / 60) g.step(1 / 60, 1); await new Promise((r) => setTimeout(r, 25)); }
    return { uid: l.uid, x: l.x, y: l.y, z: l.z, top: l.y + 2 * l.mid, mid: l.y + l.mid, yaw };
  }, { kind, ahead, turn, things, state });
  /** the things' models measured (the hands and the boards go by their boxes) */
  await ev(async () => {
    const I = await import('/src/core/modcar/items.ts');
    for (const id of ['ing_tomato', 'drink_cola', 'drink_beer', 'food_fish_can', 'nd_coffee_pack', 'ing_egg', 'drink_water', 'ing_milk']) await window.__rt.game.cargo.measured({ kind: 'item', item: I.newItem(id) });
  });
  /** hold a thing out (R) and put it (the left button) where the line of sight meets a board of a container (its point, world), from the side `from` at `dist` */
  const placeAt = async (id, p, from, dist) => {
    await rt('hold', `item:${id}`);
    await step(0.1);
    await key('KeyR');
    await rt('aimPoint', p.x, p.y, p.z, from, dist);
    await step(0.2);
    const aim = await ev(() => window.__rt.game.systems.harness('nd-place', 'aim'));
    await rt('press');
    await step(0.3);
    const s = await state();
    if (s.placing) await key('KeyR');
    return { aim, held: s.held };
  };

  // ---------------------------------------------------------------- 1. the cooler
  const c = await put('kit_cooler', 6, Math.PI / 2);
  // (the mark on its lid from beside it, looking down on its top; a click opens it — and no list comes up)
  await rt('aimPoint', c.x, c.top - 0.01, c.z, c.yaw, 1.0);
  await step(0.3);
  let s = await state();
  ok(/打开/.test(s.words), `the mark on the cooler's lid: 打开 (${s.t}, "${s.words}")`);
  await click();
  s = await state();
  let v = await view(c.uid);
  ok(!s.list && v?.drawn && v.reached[0], `a click on the lid opens it, and no list comes up (list ${s.list}, reached ${v?.reached})`);
  await shot('1_cooler_open_empty');
  // (a tomato at the floor's back left, a can at its front right: aimed at from in front of it, looking down)
  const front = c.yaw;
  const a1 = await S('boardAt', c.uid, 0, -0.06, -0.14);
  const r1 = await placeAt('ing_tomato', a1, front, 0.55);
  const a2 = await S('boardAt', c.uid, 0, 0.03, 0.15);
  const r2 = await placeAt('drink_cola', a2, front, 0.55);
  v = await view(c.uid);
  const tom = v?.things.find((t) => t.item === 'ing_tomato');
  const can = v?.things.find((t) => t.item === 'drink_cola');
  ok(r1.aim.ok && r2.aim.ok && !r1.held && !r2.held, `R and the left button: the tomato and the can go into the cooler (${JSON.stringify([r1.aim.why, r2.aim.why, r1.held, r2.held])})`);
  ok(!!tom && !!can && Math.hypot(tom.at.x - a1.x, tom.at.z - a1.z) < 0.06 && Math.hypot(can.at.x - a2.x, can.at.z - a2.z) < 0.06, `each stands where it was aimed (${JSON.stringify(v?.things.map((t) => [t.item, +t.x.toFixed(3), +t.z.toFixed(3)]))})`);
  ok(JSON.stringify(await inside(c.uid)) === JSON.stringify(['ing_tomato', 'drink_cola']), `what the cooler holds: ${JSON.stringify(await inside(c.uid))}`);
  await rt('aimPoint', c.x, c.mid, c.z, front, 0.9);
  await step(0.3);
  await shot('2_cooler_two_in');
  // (shut: nothing of them drawn, nothing to aim at)
  await rt('aimPoint', c.x, c.top - 0.01, c.z, c.yaw, 1.0);
  await step(0.3);
  // (the open lid stands up at its back: its middle)
  const lidAt = await ev((uid) => {
    const g = window.__rt.game;
    const l = g.loose.list.find((x) => x.uid === uid);
    const lid = l.obj.getObjectByName('LID');
    const V = g.core.camera.position.constructor;
    const o = g.core.origin;
    lid.updateWorldMatrix(true, true);
    const p = lid.localToWorld(new V(0.21, 0.03, 0));
    return { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z };
  }, c.uid);
  await rt('aimPoint', lidAt.x, lidAt.y, lidAt.z, front, 1.0);
  await step(0.3);
  s = await state();
  ok(/盖上/.test(s.words), `the mark on the open lid: 盖上 ("${s.words}")`);
  await click();
  await step(0.6);
  v = await view(c.uid);
  ok(!v?.drawn && !(v?.things.length), `shut: nothing of what is in it is drawn (${JSON.stringify(v)})`);
  await rt('aimPoint', c.x, c.top - 0.01, c.z, c.yaw, 1.0);
  await step(0.3);
  await click();
  await step(0.3);
  v = await view(c.uid);
  const tom2 = v?.things.find((t) => t.item === 'ing_tomato');
  const can2 = v?.things.find((t) => t.item === 'drink_cola');
  ok(!!tom2 && !!can2 && tom2.x === tom.x && tom2.z === tom.z && can2.x === can.x && can2.z === can.z, 'opened again: the tomato and the can stand where they were');
  await rt('aimPoint', tom2.at.x, tom2.at.y, tom2.at.z, front, 0.6);
  await step(0.3);
  s = await state();
  ok(s.t === `device:nd-store:${c.uid}:${tom2.uid}` && /拿起/.test(s.words) && /番茄/.test(s.words), `the mark on the tomato in it: 拿起 番茄 (${s.t}, "${s.words}")`);
  await shot('3_cooler_reopened_tomato_aimed');
  await click();
  s = await state();
  ok(s.held === 'ing_tomato' && JSON.stringify(await inside(c.uid)) === JSON.stringify(['drink_cola']), `a click takes the tomato into the hands; the can stays (held ${s.held}, in it ${JSON.stringify(await inside(c.uid))})`);
  // (R placement puts a pack of coffee into the open cooler beside the can — old Q stow shortcut removed)
  const a3 = await S('boardAt', c.uid, 0, -0.05, -0.1);
  const r3 = await placeAt('nd_coffee_pack', a3, front, 0.55);
  s = await state();
  v = await view(c.uid);
  ok(r3.aim.ok && !s.held && JSON.stringify(await inside(c.uid)) === JSON.stringify(['drink_cola', 'nd_coffee_pack']) && v?.things.length === 2, `R placement: the pack goes in beside the can (held ${s.held || 'nothing'}, ${JSON.stringify(v?.things.map((t) => [t.item, +t.x.toFixed(3), +t.z.toFixed(3)]))})`);
  // (Tab no longer lists container contents — ND immersion; only 'self' body list or closed)
  await rt('aimPoint', c.x, c.mid, c.z, front, 0.8);
  await step(0.2);
  await key('Tab');
  await step(0.2);
  const listKind = await ev(() => {
    const lv = window.__rt.game.listV;
    return lv === 'self' ? 'self' : lv ? 'container' : null;
  });
  ok(listKind === 'self' || listKind === null, `Tab on the cooler does not open a container contents list (${listKind})`);
  await key('Tab');
  await step(0.2);

  // ---------------------------------------------------------------- 2. a fridge
  const f = await put('nd_fridge', 10, Math.PI);
  const ffront = f.yaw;
  await H('open', f.uid, 'P_door', true);
  await step(0.8);
  v = await view(f.uid);
  s = await state();
  ok(v?.drawn && v.reached.every(Boolean) && !s.list, `the fridge's door opened: its shelves and its door's are reached, no list (${JSON.stringify(v?.reached)}, list ${s.list})`);
  // (a can on its top shelf, aimed at from in front of it; a bottle of beer on the middle shelf in its door)
  const b0 = await S('boardAt', f.uid, 0, -0.08, 0.05);
  const p1 = await placeAt('drink_cola', b0, ffront, 0.9);
  const b4 = await S('boardAt', f.uid, 4, 0.186, 0.0);
  const doorFrom = await ev((uid) => {
    // (from where one looks into the open door's shelves: out along the door's inner side)
    const g = window.__rt.game;
    const l = g.loose.list.find((x) => x.uid === uid);
    const door = l.obj.getObjectByName('P_door');
    const V = g.core.camera.position.constructor;
    door.updateWorldMatrix(true, true);
    const a = door.localToWorld(new V(0, 0, 0));
    const n = door.localToWorld(new V(-1, 0, 0)).sub(a);
    return Math.atan2(n.z, n.x);
  }, f.uid);
  const p2 = await placeAt('drink_beer', b4, doorFrom, 0.7);
  v = await view(f.uid);
  ok(p1.aim.ok && p2.aim.ok && v?.things.length === 2, `a can on the fridge's top shelf, a beer in its door (${JSON.stringify([p1.aim, p2.aim])}; ${JSON.stringify(v?.things.map((t) => [t.item, t.b]))})`);
  await rt('aimPoint', f.x, f.y + 0.75, f.z, ffront - 0.45, 1.5);
  await step(0.3);
  await shot('4_fridge_two_in');
  await H('open', f.uid, 'P_door', false);
  await step(0.8);
  v = await view(f.uid);
  ok(!v?.drawn, `its door shut: nothing of them drawn (${v?.drawn})`);
  await H('open', f.uid, 'P_door', true);
  await step(0.8);
  v = await view(f.uid);
  const fcan = v?.things.find((t) => t.item === 'drink_cola');
  ok(v?.things.length === 2 && !!fcan, `opened again: the can and the beer (${JSON.stringify(v?.things.map((t) => [t.item, t.b, +t.x.toFixed(3), +t.z.toFixed(3)]))})`);
  await ev(() => { const p = window.__rt.game.player; p.slots[p.sel] = null; });
  await rt('aimPoint', fcan.at.x, fcan.at.y, fcan.at.z, ffront, 0.8);
  await step(0.3);
  s = await state();
  ok(/拿起/.test(s.words) && s.t.includes(fcan.uid), `the mark on the can in the fridge (${s.t}, "${s.words}")`);
  await shot('5_fridge_can_aimed');
  await click();
  s = await state();
  ok(s.held === 'drink_cola' && JSON.stringify(await inside(f.uid)) === JSON.stringify(['drink_beer']), `a click takes the can out (held ${s.held}, in it ${JSON.stringify(await inside(f.uid))})`);
  // (the beer on the shelf in the open door: the mark on it from in front of the door's inner side, a click takes it out)
  await ev(() => { const p = window.__rt.game.player; p.slots[p.sel] = null; });
  v = await view(f.uid);
  const fbeer = v?.things.find((t) => t.item === 'drink_beer');
  let bm = '';
  for (const [turn, dist] of [[0, 0.7], [0.3, 0.7], [-0.3, 0.7], [0, 0.9], [0.6, 0.8], [-0.6, 0.8]]) {
    if (!fbeer) break;
    bm = await rt('aimPoint', fbeer.at.x, fbeer.at.y, fbeer.at.z, doorFrom + turn, dist);
    if (bm.includes(fbeer.uid)) break;
  }
  await step(0.2);
  s = await state();
  ok(!!fbeer && bm.includes(fbeer.uid) && /拿起/.test(s.words), `the mark on the beer in the door's shelf (${bm}, "${s.words}")`);
  await click();
  s = await state();
  ok(s.held === 'drink_beer' && (await inside(f.uid)).length === 0, `a click takes the beer out of the door (held ${s.held}, in it ${JSON.stringify(await inside(f.uid))})`);

  // ---------------------------------------------------------------- 3. a cupboard: the two-door cabinet
  await ev(() => { const p = window.__rt.game.player; p.slots[p.sel] = null; });
  const k = await put('nd_cabinet', 14, Math.PI);
  const kfront = k.yaw;
  /** a mover's middle (world), where it is now */
  const moverAt = (uid, name) => ev(({ uid, name }) => {
    const g = window.__rt.game;
    const l = g.loose.list.find((x) => x.uid === uid);
    const o = g.core.origin;
    const m = l.obj.getObjectByName(name);
    const V = g.core.camera.position.constructor;
    m.updateWorldMatrix(true, true);
    const lo = new V(Infinity, Infinity, Infinity);
    const hi = new V(-Infinity, -Infinity, -Infinity);
    m.traverse((c) => { if (c.isMesh) { c.geometry.computeBoundingBox(); const bb = c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld); lo.min(bb.min); hi.max(bb.max); } });
    return { x: (lo.x + hi.x) / 2 + o.x, y: (lo.y + hi.y) / 2 + o.y, z: (lo.z + hi.z) / 2 + o.z };
  }, { uid, name });
  /** a point of a piece's own frame (world) */
  const pieceAt = (uid, x, y, z) => ev(({ uid, x, y, z }) => {
    const g = window.__rt.game;
    const l = g.loose.list.find((q) => q.uid === uid);
    const o = g.core.origin;
    const V = g.core.camera.position.constructor;
    l.obj.updateWorldMatrix(true, true);
    const p = l.obj.localToWorld(new V(x, y, z));
    return { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z };
  }, { uid, x, y, z });
  const inCabinet = () => ev((uid) => {
    const g = window.__rt.game;
    const l = g.loose.list.find((q) => q.uid === uid);
    if (!l) return [];
    return g.loose.list.filter((t) => t !== l && t.item && Math.hypot(t.x - l.x, t.z - l.z) < 0.6).map((t) => ({ uid: t.uid, item: t.item.item, shut: !!t.shut, seen: t.obj.visible, y: +(t.y - l.y).toFixed(3) }));
  }, k.uid);
  // (the mark on its door b: a click swings it open)
  const db = await moverAt(k.uid, 'P_door_b');
  await rt('aimPoint', db.x, db.y, db.z, kfront, 1.1);
  await step(0.3);
  s = await state();
  ok(/打开柜门/.test(s.words), `the mark on the cupboard's door: 打开柜门 ("${s.words}")`);
  await click();
  await step(0.5);
  // (a tin of fish on its bottom, a can on its shelf, each aimed into from in front of it, behind the open door)
  const zb = await ev((uid) => {
    const g = window.__rt.game;
    const l = g.loose.list.find((q) => q.uid === uid);
    const d = l.obj.getObjectByName('P_door_b');
    l.obj.updateWorldMatrix(true, true);
    const V = g.core.camera.position.constructor;
    // (the door's hinge side, in the piece's frame: which half it shut)
    return l.obj.worldToLocal(d.localToWorld(new V(0, 0, 0))).z;
  }, k.uid);
  const half = Math.sign(zb) * 0.18;
  const pk1 = await placeAt('food_fish_can', await pieceAt(k.uid, -0.02, 0.1, half), kfront, 1.6);
  const pk2 = await placeAt('drink_cola', await pieceAt(k.uid, -0.02, 0.489, half), kfront, 1.4);
  let ins = await inCabinet();
  ok(pk1.aim.ok && pk2.aim.ok && ins.some((t) => t.item === 'food_fish_can') && ins.some((t) => t.item === 'drink_cola'), `R and the left button: a tin on its bottom and a can on its shelf (${JSON.stringify(ins)})`);
  await rt('aimPoint', k.x, k.y + 0.45, k.z, kfront + 0.35, 1.5);
  await step(0.3);
  await shot('6_cupboard_two_in');
  // (the open door: the mark on it where it stands now says 关上柜门, a click shuts it — what is in it is not seen)
  const dbo = await moverAt(k.uid, 'P_door_b');
  await rt('aimPoint', dbo.x, dbo.y, dbo.z, kfront + Math.sign(zb) * 0.9, 0.9);
  await step(0.3);
  s = await state();
  ok(/关上柜门/.test(s.words), `the mark on the open door, where it stands: 关上柜门 ("${s.words}")`);
  await click();
  await step(0.6);
  ins = await inCabinet();
  ok(ins.length >= 2 && ins.every((t) => t.shut && !t.seen), `shut: the tin and the can not seen, not reached (${JSON.stringify(ins)})`);
  await rt('aimPoint', db.x, db.y, db.z, kfront, 1.1);
  await step(0.3);
  await click();
  await step(0.5);
  ins = await inCabinet();
  const kcan = ins.find((t) => t.item === 'drink_cola');
  ok(ins.every((t) => !t.shut && t.seen) && !!kcan, `opened again: there they stand (${JSON.stringify(ins)})`);
  const kc = await ev(({ uid }) => { const g = window.__rt.game; const l = g.loose.list.find((q) => q.uid === uid); return { x: l.x, y: l.y + l.mid, z: l.z }; }, { uid: kcan.uid });
  await rt('aimPoint', kc.x, kc.y, kc.z, kfront, 1.4);
  await step(0.3);
  s = await state();
  ok(s.t.startsWith('loose:') && /拿起/.test(s.words) && /可乐/.test(s.words), `the mark on the can in the cupboard: 拿起 山谷可乐 (${s.t}, "${s.words}")`);
  await shot('7_cupboard_can_aimed');
  await click();
  s = await state();
  ins = await inCabinet();
  ok(s.held === 'drink_cola' && !ins.some((t) => t.item === 'drink_cola') && ins.some((t) => t.item === 'food_fish_can'), `a click takes the can out; the tin stays (held ${s.held}, ${JSON.stringify(ins)})`);

  // ---------------------------------------------------------------- 4. full; and what an old save had in a cooler
  await ev(() => { const p = window.__rt.game.player; p.slots[p.sel] = null; });
  const n = await put('nd_nightstand', 18, Math.PI, ['ing_egg', 'ing_egg', 'ing_egg']);
  // (three eggs in three stacks: its three slots — split so, as the list would have them apart)
  await ev(async (uid) => {
    const g = window.__rt.game;
    const I = await import('/src/core/modcar/items.ts');
    const it = g.loose.list.find((q) => q.uid === uid).item;
    it.inside = [I.newItem('ing_egg', { n: 1 }), I.newItem('ing_tomato'), I.newItem('drink_cola')];
  }, n.uid);
  await H('open', n.uid, 'P_drawer_a', true);
  await step(0.8);
  v = await view(n.uid);
  ok(v?.drawn && v.things.length === 3 && v.things.every((t) => t.b === 0), `a nightstand's drawer pulled out: the three things in it stand in the drawer (${JSON.stringify(v?.things.map((t) => [t.item, +t.x.toFixed(3), +t.z.toFixed(3), t.lie]))})`);
  await rt('hold', 'item:ing_potato');
  await key('KeyR');
  const dn = await S('boardAt', n.uid, 0);
  await rt('aimPoint', dn.x, dn.y, dn.z, n.yaw, 0.6);
  await step(0.2);
  const full = await ev(() => window.__rt.game.systems.harness('nd-place', 'aim'));
  ok(!full.ok && /装满了/.test(full.why), `a potato held out over the drawer: 床头柜装满了 (${JSON.stringify([full.ok, full.why])})`);
  await rt('press');
  await step(0.2);
  s = await state();
  ok(s.held === 'ing_potato', `the left button there: it stays in the hands (${s.held})`);
  await rt('aimPoint', n.x, n.y + 0.5, n.z, n.yaw + 0.3, 1.1);
  await step(0.3);
  await shot('8_nightstand_drawer');
  if (s.placing || (await state()).placing) await key('KeyR');
  // (the mark on the egg in the drawer, from in front of it: a click takes it out — what is in a drawer is reached in it)
  await ev(() => { const p = window.__rt.game.player; p.slots[p.sel] = null; });
  v = await view(n.uid);
  const egg = v?.things.find((t) => t.item === 'ing_egg');
  let em = '';
  for (const [turn, dist] of [[0, 0.6], [0.4, 0.6], [-0.4, 0.6], [0, 0.45], [0, 0.8]]) {
    if (!egg) break;
    em = await rt('aimPoint', egg.at.x, egg.at.y, egg.at.z, n.yaw + turn, dist);
    if (em.includes(egg.uid)) break;
  }
  await step(0.2);
  s = await state();
  ok(!!egg && em.includes(egg.uid) && /拿起/.test(s.words), `the mark on the egg in the drawer, not on the drawer (${em}, "${s.words}")`);
  await click();
  s = await state();
  ok(s.held === 'ing_egg' && JSON.stringify(await inside(n.uid)) === JSON.stringify(['ing_tomato', 'drink_cola']), `a click takes the egg out of the drawer (held ${s.held}, in it ${JSON.stringify(await inside(n.uid))})`);
  // (a cooler as an old save had it: five things in it and no places — opened, each stands in it, none in another)
  await ev(() => { const p = window.__rt.game.player; p.slots[p.sel] = null; });
  const old = await put('kit_cooler', 22, Math.PI / 2, ['drink_water', 'ing_milk', 'ing_tomato', 'drink_cola', 'food_fish_can']);
  const before = await ev((uid) => !!window.__rt.game.loose.list.find((q) => q.uid === uid).item.state?.spots, old.uid);
  await ev((uid) => { const g = window.__rt.game; const it = g.loose.list.find((q) => q.uid === uid).item; it.state = { ...(it.state ?? {}), open: ['LID'] }; }, old.uid);
  await step(0.6);
  v = await view(old.uid);
  ok(!before && v?.things.length === 5 && v.things.every((t) => t.drawn), `an old save's cooler, no places: opened, its five things laid out in it (${JSON.stringify(v?.things.map((t) => [t.item, +t.x.toFixed(3), +t.z.toFixed(3), t.lie, t.up]))})`);
  await rt('aimPoint', old.x, old.mid, old.z, old.yaw, 0.85);
  await step(0.4);
  await shot('9_old_cooler_laid_out');

  // ---------------------------------------------------------------- 5. kept with the save
  // (the first cooler — the can and the pack in it, its lid open — as the save writes it (the thing as it is) and as a
  // save is read back (items.ts cleanItem), put down again where it stood: its lid open, each where it stood)
  const was = (await view(c.uid))?.things.map((t) => [t.item, t.x, t.z, t.r]) ?? [];
  const again = await ev(async (uid) => {
    const g = window.__rt.game;
    const I = await import('/src/core/modcar/items.ts');
    const l = g.loose.list.find((q) => q.uid === uid);
    const saved = JSON.stringify(l.item);
    const at = { x: l.x, y: l.y, z: l.z, yaw: l.yaw };
    g.loose.remove(l);
    for (let t = 0; t < 0.2; t += 1 / 60) g.step(1 / 60, 1);
    const loss = { unknown: 0 };
    const back = I.cleanItem(JSON.parse(saved), loss);
    const l2 = g.loose.addItem(back, at.x, at.y, at.z, at.yaw);
    for (let i = 0; i < 400 && l2.obj.children.length < 1; i++) await new Promise((r) => setTimeout(r, 25));
    for (let i = 0; i < 40; i++) { for (let t = 0; t < 0.05; t += 1 / 60) g.step(1 / 60, 1); await new Promise((r) => setTimeout(r, 25)); }
    return { uid: l2.uid, spots: Object.keys(back.state?.spots ?? {}).length, open: back.state?.open ?? [], loss: loss.unknown };
  }, c.uid);
  v = await view(again.uid);
  const now = v?.things.map((t) => [t.item, t.x, t.z, t.r]) ?? [];
  ok(again.spots === 2 && again.loss === 0 && v?.drawn && v.reached[0] && was.length === 2 && JSON.stringify(now) === JSON.stringify(was), `the cooler as the save keeps it, read back: its lid open, the can and the pack where they stood (${JSON.stringify({ was, now, open: again.open })})`);
  await rt('aimPoint', c.x, c.mid, c.z, c.yaw, 0.9);
  await step(0.3);
  await shot('10_cooler_from_save');
  if (errors.length) console.log('page errors:', errors.slice(0, 5).join(' | '));
} catch (e) {
  bad++;
  console.log('FAIL threw', e?.stack ?? e);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `nd_containers: ${bad} failed` : 'nd_containers ok');
process.exit(bad ? 1 : 0);
