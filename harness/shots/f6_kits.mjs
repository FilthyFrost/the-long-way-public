// F6 (docs/V3/plan/finish.md §二 3), in the game — a world of version 7: the things that go together come apart.
//  - the camera's place (chapter 1): its box holds the camera and none of its film; picked up, its film is put out two
//    to five kilometres on; driven past (three kilometres beyond the place that took it), it is put out again further
//    on; picked up there, the set is whole and its cards say nothing is wanting;
//  - the coffee machine's place (chapter 3): no pot and no beans at it nor anywhere before it; picked up, its card says
//    what is wanting (还缺：咖啡壶、咖啡豆) and the pot is put out ahead — at the place the plan's planner chooses; the
//    pot picked up, the beans; the game saved and taken up again in between: the same place has them;
//  - the next coffee machine down the road, the set begun and its machine in the pack: a box of old components instead;
//  - a step of things one has other uses for (the grinder's battery) is taken at once when one has one, and the step
//    of a later chapter waits for its kilometre (the polisher: not before the 105th);
//  - a world made before (version 6): nothing of all this.
//   SHOTS_GPU=1 node harness/shots/f6_kits.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/f6_kits');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const ok = (cond, why) => (cond ? console.log('ok  ', why) : fail(why));
const SEED = 7;

/** the helpers of one page */
function helpers(page) {
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
  /** where the plan — the world's own and what the game has added to it — puts the finds of these entries: each one's places in road order */
  const planOf = (entries) =>
    page.evaluate(async (entries) => {
      const S = await import('/src/core/modcar/schedule.ts');
      const L = await import('/src/core/modcar/loot.ts');
      const g = window.__rt.game;
      // (the game's own plan: the world's, fitted to its places)
      const planner = new S.SitePlanner(g.places.plannedFinds());
      planner.add(g.addedFinds);
      const sites = [];
      g.world.sites.between(0, 150000, sites);
      sites.sort((a, b) => a.s - b.s);
      planner.take(sites.map((x) => ({ id: x.id, s: x.s, kind: x.kind, boxes: L.planBoxes(x).length, ground: L.planGround(x) })));
      const out = Object.fromEntries(entries.map((e) => [e, []]));
      for (const x of sites) for (const f of planner.findsAt(x.id)) if (out[f.entry]) out[f.entry].push({ id: x.id, s: x.s, kind: x.kind, due: f.s, boxes: x.containers.map((c) => c.id) });
      return out;
    }, entries);
  /** at a place, its containers laid out */
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
  /** what the containers of a place hold, each by its id (and what lies about within 60 m) */
  const holds = (w) =>
    page.evaluate((w) => {
      const g = window.__rt.game;
      const name = (h) => (h.kind === 'item' ? h.item.item : h.kind === 'tool' ? `tool:${h.tool.kind}` : `part:${h.inst.part}`);
      const boxes = {};
      for (const id of w.boxes) {
        const pc = g.places?.containerOf(id);
        if (pc?.contents) boxes[id] = pc.contents.map(name);
      }
      const p = g.player.walker;
      const about = g.loose.list.filter((l) => Math.hypot(l.x - p.x, l.z - p.z) < 60).map((l) => l.item?.item ?? (l.tool ? `tool:${l.tool.kind}` : `part:${l.part?.part}`));
      return { boxes, about };
    }, w);
  // (where each thing is: the middle of it as it lies — one too tall for its shelf lies on its side, and its middle is not over its base)
  const things = (id) =>
    page.evaluate((id) => {
      const g = window.__rt.game;
      const pc = g.places?.containerOf(id);
      if (!pc) return null;
      const o = g.core.origin;
      return pc.things.map((l) => {
        // (its drawn box, in the world: three's own, from the object as it stands in the scene)
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
        return {
          what: l.item?.item ?? (l.tool ? `tool:${l.tool.kind}` : `part:${l.part?.part}`),
          shut: !!l.shut,
          x: drawn ? (lo[0] + hi[0]) / 2 + o.x : l.x,
          y: drawn ? (lo[1] + hi[1]) / 2 + o.y : l.y + l.mid,
          z: drawn ? (lo[2] + hi[2]) / 2 + o.z : l.z,
        };
      });
    }, id);
  const frontOf = (id) =>
    page.evaluate((id) => {
      const g = window.__rt.game;
      const s = g.places?.containerOf(id)?.slots?.[0];
      if (!s) return null;
      s.frame.updateWorldMatrix(true, false);
      const e = s.frame.matrixWorld.elements;
      const o = g.core.origin;
      return { x: e[12] + o.x, y: e[13] + o.y, z: e[14] + o.z, from: Math.atan2(e[2], e[0]) };
    }, id);
  /** a thing taken out of the box of a place that holds it, by hand: the box opened, the thing aimed at, the button held. What is in the hands then. */
  const takeAt = async (w, what, before) => {
    const h = await holds(w);
    const box = Object.keys(h.boxes).find((id) => h.boxes[id].includes(what));
    if (!box) return { held: null, why: `no box of the place holds it: ${JSON.stringify(h.boxes)}` };
    // (a box with a front of its own — doors, drawers, a lid: opened first; a patch of a building's floor has none: its things are simply there)
    const fr = await frontOf(box);
    let t = ((await things(box)) ?? []).find((x) => x.what === what);
    if (!t) return { held: null, why: 'not among its box’s things' };
    // (behind a door, in a drawer, under a lid: the box opened first — the mark on the box itself, from whichever side it is reached)
    const isOpen = () => page.evaluate((id) => window.__rt.game.places?.isOpen(id) ?? false, box);
    if (t.shut && !(await isOpen())) {
      for (const turn of [0, 0.6, -0.6, Math.PI, 1.2, -1.2, 2.2, -2.2]) {
        const m0 = await rt('aimAt', `box:${box}`, (fr ? fr.from : 0) + turn, 1.3);
        if (m0 === `device:box:${box}`) {
          await rt('press');
          await rt('simulate', 0.8);
        }
        if (await isOpen()) break;
      }
      if (!(await isOpen())) return { held: null, why: 'its box would not open' };
      t = ((await things(box)) ?? []).find((x) => x.what === what) ?? t;
    }
    if (!fr) await rt('aimPoint', t.x, t.y, t.z, 0, 1.35);
    // (what is to be done standing at the box, before the thing is taken: a hand freed)
    await before?.();
    t = ((await things(box)) ?? []).find((x) => x.what === what) ?? t;
    let m = '';
    const from = fr ? fr.from : 0;
    for (const turn of [0, 0.5, -0.5, Math.PI, 1, -1, 1.6, -1.6, 2.4, -2.4]) {
      m = await rt('aimPoint', t.x, t.y, t.z, from + turn, 1.35);
      if (/^(loose|device):/.test(m) && !/^device:box:/.test(m)) break;
    }
    await rt('simulate', 0.3);
    const tel = await rt('useFor', 1.2);
    return { held: tel.held, mark: m, box };
  };
  /** how the sets stand, what the game has added to the plan, how far down the road one is */
  const state = () =>
    page.evaluate(() => {
      const g = window.__rt.game;
      // (the sets' own finds: what the game adds besides — a can, a tin for one all but out of them, as this walker with
      // empty hands and no car is: needs.ts — is not theirs)
      const all = g.addedFinds.map((f) => ({ entry: f.entry, s: f.s, thing: f.thing.item ?? f.thing.part ?? f.thing.tool }));
      return { kits: JSON.parse(JSON.stringify(g.kits)), added: all.filter((f) => f.entry.startsWith('kit:')), other: all.filter((f) => !f.entry.startsWith('kit:')).map((f) => `${f.entry}@${(f.s / 1000).toFixed(1)}`), s: g.roadS };
    });
  /** the line of the card of what is in the hands that says what is wanting of its set (null: none) */
  const wanting = () =>
    page.evaluate(() => {
      const g = window.__rt.game;
      const h = g.player.held;
      if (!h) return null;
      // (what the card says, looked into afresh)
      g.kitNotes.clear();
      return g.player.cardOf(h).wanting ?? null;
    });
  return { rt, shot, planOf, goTo, holds, takeAt, state, wanting };
}

/** the things of the sets that come after their main one, and what is kept back with them (kits.ts) */
const LATER = ['coffee_pot', 'nd_coffee_pack', 'kit_gas', 'kit_pan', 'kit_spice', 'kit_pot', 'kit_board', 'kit_plate', 'kit_dish', 'nd_seeds_tomato', 'nd_seeds_potato', 'nd_seeds_apple', 'nd_seeds_watermelon', 'fishing_creel', 'bait_worm', 'bait_spoon', 'bait_shrimp', 'bait_squid_strip', 'nd_key_1', 'nd_key_2', 'nd_polisher', 'nd_film_pack', 'nd_tape_01'];

try {
  // ------------------------------------------------------------------ a game of one's own, kept as it goes
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const ready = () => page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 180000 });
    const { rt, shot, planOf, goTo, holds, takeAt, state, wanting } = helpers(page);
    await page.goto(`${url}/modcar.html?world=7&seed=${SEED}&new=1`, { waitUntil: 'domcontentloaded' });
    await ready();
    await rt('setHour', 11);
    await rt('simulate', 0.5);
    ok((await page.evaluate(() => window.__rt.game.params.world)) === 7, 'a world of version 7');
    let st = await state();
    ok(Object.keys(st.kits).length === 0 && st.added.length === 0, 'a new game: no set begun, nothing added to the plan');

    // 1. what the places' own would have had of the sets' later things, and has not: none anywhere before a set is begun
    const plan0 = await planOf(['camera', 'coffee', 'stove', 'kit:photo:1', 'kit:coffee:1']);
    ok(plan0['kit:photo:1'].length === 0 && plan0['kit:coffee:1'].length === 0, 'the plan of the road has no film and no coffee pot of its own');
    const camera = plan0.camera[0];
    // (this world's road has nothing with a box in it from 9.9 km to 13.7: the camera, due at 10.4, is at the house before)
    ok(!!camera && camera.s >= 5000 && camera.s <= 12000, `the first camera in the first chapter: ${camera ? `${(camera.s / 1000).toFixed(1)} km, a ${camera.kind}` : 'none'}`);
    const ownLater = await page.evaluate(async (LATER) => {
      // (the places' own boxes down the first sixty kilometres, as they roll: how many of the sets' later things)
      const L = await import('/src/core/modcar/loot.ts');
      const g = window.__rt.game;
      const sites = [];
      g.world.sites.between(0, 60000, sites);
      let n = 0;
      for (const x of sites) {
        for (const c of x.containers) for (const f of L.ownRoll(c, x.s, x.kind)) if ('item' in f && LATER.includes(f.item)) n++;
        for (const l of x.loose) if (LATER.includes(l.item)) n++;
      }
      return n;
    }, LATER);
    console.log(`the places' own down the first 60 km would have had ${ownLater} of the sets' later things`);

    // 2. the camera: by itself; picked up, its film put out ahead
    ok(await goTo(camera), `at the ${camera.kind} at ${(camera.s / 1000).toFixed(1)} km, its boxes laid out`);
    let h = await holds(camera);
    const all = (x) => [...Object.values(x.boxes).flat(), ...x.about];
    ok(all(h).includes('nd_camera') && !all(h).some((k) => LATER.includes(k)), `the camera there and none of the sets' later things: ${JSON.stringify(h.boxes)}`);
    let took = await takeAt(camera, 'nd_camera');
    ok(took.held === 'item:nd_camera', `the camera taken out of its box by hand (${took.held ?? took.why})`);
    await rt('simulate', 1.2);
    st = await state();
    const film1 = st.added.find((f) => f.entry === 'kit:photo:1');
    ok(st.kits.photo?.got === 1 && st.kits.photo?.out?.step === 1 && !!film1 && film1.thing === 'nd_film_pack' && film1.s >= st.s + 2000 - 1 && film1.s <= st.s + 5000 + 1, `picked up at ${(st.s / 1000).toFixed(2)} km: its film put out at ${(film1?.s / 1000).toFixed(2)} km`);
    ok((await wanting()) === '还缺：拍立得相纸', `the camera's card: ${await wanting()}`);
    await shot('01_camera.png');

    // 3. the film driven past: put out again further on
    const filmAt = (await planOf(['kit:photo:1']))['kit:photo:1'];
    ok(filmAt.length === 1 && filmAt[0].s >= film1.s - 1, `the film's place: a ${filmAt[0]?.kind} at ${(filmAt[0]?.s / 1000).toFixed(2)} km`);
    await rt('devGoKm', (filmAt[0].s + 2900) / 1000, false);
    await rt('simulate', 1.5);
    st = await state();
    ok(st.added.filter((f) => f.entry === 'kit:photo:1').length === 1, 'not three kilometres past its place: nothing more put out');
    // (the place it is laid at taken in by the game's own plan as the places beyond it come)
    let again = null;
    for (let km = 3.1; km < 6 && !again; km += 0.4) {
      await rt('devGoKm', (filmAt[0].s + km * 1000) / 1000, false);
      await rt('simulate', 1.5);
      st = await state();
      again = st.added.filter((f) => f.entry === 'kit:photo:1')[1] ?? null;
    }
    ok(!!again && st.kits.photo.out.n === 1 && again.s >= st.s + 2000 - 1 && again.s <= st.s + 5000 + 1, `more than three kilometres past it, not picked up: put out again at ${(again?.s / 1000).toFixed(2)} km (one is at ${(st.s / 1000).toFixed(2)})`);
    const film2 = (await planOf(['kit:photo:1']))['kit:photo:1'][1];
    ok(!!film2 && (await goTo(film2)), `at the film's second place: a ${film2?.kind} at ${(film2?.s / 1000).toFixed(2)} km`);
    await rt('select', 1);
    took = await takeAt(film2, 'nd_film_pack');
    ok(took.held === 'item:nd_film_pack', `the film taken out of its box (${took.held ?? took.why})`);
    await rt('simulate', 1.2);
    st = await state();
    ok(st.kits.photo.got === 2 && !st.kits.photo.out, `the set whole: ${JSON.stringify(st.kits.photo)}`);
    ok((await wanting()) === null, 'the film’s card says nothing is wanting');
    await shot('02_film.png');
    // (both put down: the hands free for the coffee)
    await rt('drop');
    await rt('select', 0);
    await rt('drop');
    await rt('simulate', 0.5);

    // 4. the coffee machine: no pot, no beans — there or before; picked up, the pot ahead
    const coffee = (await planOf(['coffee'])).coffee;
    const machine = coffee[0];
    ok(!!machine && machine.s >= 31000 && machine.s < 37000, `the first coffee machine in the third chapter: ${machine ? `${(machine.s / 1000).toFixed(1)} km, a ${machine.kind}` : 'none'}`);
    ok(await goTo(machine), `at the ${machine.kind} at ${(machine.s / 1000).toFixed(1)} km`);
    h = await holds(machine);
    ok(all(h).includes('nd_coffee_machine') && !all(h).some((k) => LATER.includes(k) && k !== 'nd_film_pack'), `the machine there, no pot and no beans: ${JSON.stringify(h.boxes)}; about: ${h.about.filter((k) => LATER.includes(k)).join()}`);
    took = await takeAt(machine, 'nd_coffee_machine');
    ok(took.held === 'item:nd_coffee_machine', `the coffee machine taken (${took.held ?? took.why})`);
    await rt('simulate', 1.2);
    st = await state();
    const pot = st.added.find((f) => f.entry === 'kit:coffee:1');
    ok(st.kits.coffee?.got === 1 && !!pot && pot.thing === 'coffee_pot' && pot.s >= st.s + 2000 - 1 && pot.s <= st.s + 5000 + 1, `picked up at ${(st.s / 1000).toFixed(2)} km: its pot put out at ${(pot?.s / 1000).toFixed(2)} km`);
    ok((await wanting()) === '还缺：咖啡壶、咖啡豆', `the machine's card: ${await wanting()}`);
    await rt('simulate', 0.3);
    await shot('03_machine.png');
    const onScreen = await page.evaluate(() => [...document.querySelectorAll('.mc-ic')].filter((e) => e.style.display !== 'none').map((e) => e.innerText.replace(/\s+/g, ' ')));
    ok(onScreen.some((t) => t.includes('咖啡机') && t.includes('还缺：咖啡壶、咖啡豆')), `on screen, on the card of the thing in the hands: ${onScreen.join(' | ')}`);

    // 5. saved, the page opened again: the same sets, the same plan; the pot where the plan has it
    const potAt0 = (await planOf(['kit:coffee:1']))['kit:coffee:1'][0];
    await page.evaluate(() => window.__rt.game.save());
    await page.goto(`${url}/modcar.html`, { waitUntil: 'domcontentloaded' });
    await ready();
    await rt('simulate', 0.5);
    st = await state();
    ok((await page.evaluate(() => window.__rt.game.params.world)) === 7 && st.kits.coffee?.got === 1 && st.kits.photo?.got === 2 && st.added.length === 3, `taken up again: ${JSON.stringify(st.kits)}, ${st.added.length} finds of the sets added (and for one all but out of things: ${st.other.join(' ') || 'none'})`);
    const potAt = (await planOf(['kit:coffee:1']))['kit:coffee:1'][0];
    ok(!!potAt && potAt.id === potAt0.id, `the pot's place the same as before: a ${potAt?.kind} at ${(potAt?.s / 1000).toFixed(2)} km`);
    ok(await goTo(potAt), 'at the pot’s place');
    ok((await page.evaluate(() => window.__rt.game.places.laidAt(window.__rt.game.addedFinds.find((f) => f.entry === 'kit:coffee:1')))) === potAt.s, 'the game’s own plan has it at that place');
    h = await holds(potAt);
    ok(all(h).includes('coffee_pot') && !all(h).includes('nd_coffee_pack'), `the pot there, the beans not yet: ${JSON.stringify(h.boxes)}`);
    const held0 = await page.evaluate(() => window.__rt.game.player.slots.map((x) => x?.item?.item ?? null));
    ok(held0.includes('nd_coffee_machine'), `the machine still in the pack: ${JSON.stringify(held0)}`);
    await rt('select', held0.indexOf('nd_coffee_machine') === 0 ? 1 : 0);
    took = await takeAt(potAt, 'coffee_pot');
    ok(took.held === 'item:coffee_pot', `the pot taken (${took.held ?? took.why})`);
    await rt('simulate', 1.2);
    st = await state();
    const beans = st.added.find((f) => f.entry === 'kit:coffee:2');
    ok(st.kits.coffee.got === 2 && !!beans && beans.thing === 'nd_coffee_pack' && beans.s >= st.s + 2000 - 1, `the pot picked up: the beans put out at ${(beans?.s / 1000).toFixed(2)} km`);
    ok((await wanting()) === '还缺：咖啡豆', `the pot's card: ${await wanting()}`);
    await shot('04_pot.png');

    // 6. the beans: the set whole
    const beansAt = (await planOf(['kit:coffee:2']))['kit:coffee:2'][0];
    ok(!!beansAt && (await goTo(beansAt)), `at the beans' place: a ${beansAt?.kind} at ${(beansAt?.s / 1000).toFixed(2)} km`);
    h = await holds(beansAt);
    ok(all(h).includes('nd_coffee_pack'), `the beans there: ${JSON.stringify(h.boxes)}`);
    // (the pot put down by the box — within reach still: one's own)
    took = await takeAt(beansAt, 'nd_coffee_pack', async () => {
      await rt('drop');
      await rt('simulate', 0.6);
    });
    ok(took.held === 'item:nd_coffee_pack', `the beans taken (${took.held ?? took.why})`);
    await rt('simulate', 1.2);
    st = await state();
    ok(st.kits.coffee.got === 3 && !st.kits.coffee.out, `the coffee whole: ${JSON.stringify(st.kits.coffee)}`);
    ok((await wanting()) === null, `nothing wanting on the beans’ card (${await wanting()})`);
    await shot('05_beans.png');

    // 7. the next coffee machine down the road: a box of old components in its place (the machine in the pack)
    const next = coffee[1];
    ok(!!next && next.s - machine.s > 20000, `the plan's next coffee machine: ${(next?.s / 1000).toFixed(1)} km`);
    ok(await goTo(next), 'at its place');
    h = await holds(next);
    ok(!all(h).includes('nd_coffee_machine') && all(h).includes('crate_parts'), `no second machine there — a box of old components: ${JSON.stringify(h.boxes)}`);

    await page.evaluate(() => {
      window.__rt.game.saveOff = true;
      for (const k of Object.keys(localStorage)) if (k.startsWith('modcar.')) localStorage.removeItem(k);
    });
    const lastError = await page.evaluate(() => window.__rt.lastError);
    if (lastError) fail(`a frame threw: ${lastError}`);
    if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
    await ctx.close();
  }

  // ------------------------------------------------------------------ a step taken at once, a step that waits for its chapter
  {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=7&seed=${SEED}&start=road&build=stock:sedan&s=66000&time=11&weather=clear`, { width: 1280, height: 720 });
    const { rt, state, wanting } = helpers(page);
    await rt('exit');
    await rt('simulate', 0.3);
    await rt('select', 0);
    await rt('hold', 'item:nd_battery');
    await rt('select', 1);
    await rt('hold', 'item:nd_grinder');
    await rt('simulate', 1.2);
    const st = await state();
    const pol = st.added.find((f) => f.entry === 'kit:refit:2');
    ok(st.kits.refit?.got === 2 && st.added.every((f) => f.entry !== 'kit:refit:1'), `the grinder picked up with a battery in the pack: its battery's step taken at once (${JSON.stringify(st.kits.refit)})`);
    ok(!!pol && pol.thing === 'nd_polisher' && pol.s >= 105000, `the polisher put out — not before the 105th kilometre: ${(pol?.s / 1000).toFixed(1)} km (one is at ${(st.s / 1000).toFixed(1)})`);
    ok((await wanting()) === '还缺：抛光机', `the grinder's card: ${await wanting()}`);
    const lastError = await page.evaluate(() => window.__rt.lastError);
    if (lastError) fail(`a frame threw: ${lastError}`);
    if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
    await page.close();
  }

  // ------------------------------------------------------------------ a world made before: as it was
  {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=6&seed=${SEED}&start=road&build=stock:sedan&s=33000&time=11&weather=clear`, { width: 1280, height: 720 });
    const { rt, state, wanting } = helpers(page);
    await rt('exit');
    await rt('simulate', 0.3);
    await rt('hold', 'item:nd_coffee_machine');
    await rt('simulate', 1.2);
    const st = await state();
    ok(Object.keys(st.kits).length === 0 && st.added.length === 0 && (await wanting()) === null, `a world of version 6: a coffee machine picked up begins no set (${JSON.stringify(st.kits)})`);
    const lastError = await page.evaluate(() => window.__rt.lastError);
    if (lastError) fail(`a frame threw: ${lastError}`);
    if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
    await page.close();
  }
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `f6_kits: ${bad} FAILED` : 'f6_kits: ok');
process.exit(bad ? 1 : 0);
