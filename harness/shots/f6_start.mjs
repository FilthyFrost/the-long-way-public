// F6 (docs/V3/plan/finish.md §二 2), in the game — a rougher start, in a world of version 7:
//  - the workshop has what starts the car and drives it and one headlamp: thirteen parts about the room, no door, no
//    bonnet, no boot lid, no bumper among them; the board asks for nothing it has not got, the headlamp among the
//    steps to drive;
//  - the Tab screen's first page, 这辆车: what the car lacks, which of it lies by (旁边有), where to look for the rest;
//  - a boot without its lid holds nothing (the left button says why);
//  - down the road the driver's door is where the plan has it, within three kilometres: a door shaped for the car,
//    taken up and fitted by hand at its place on the car;
//  - the last of the sixteen on: 方糖装齐了, said once; the page says it is whole (and that it could have a radio); the
//    boot, its lid on, takes the can;
//  - a world made before (version 6): the workshop as it always was — twenty-nine parts, the board's last group.
//   SHOTS_GPU=1 node harness/shots/f6_start.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/f6_start');
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

try {
  {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&kit=j5&time=10&world=7&seed=${SEED}`, { width: 1280, height: 720 });
    const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const shot = async (f) => {
      await ev(async () => {
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
    const carPage = async () => {
      await ev(() => window.__rt.game.openTab('car'));
      await rt('simulate', 0.1);
      const text = await ev(() => {
        const e = document.querySelector('.mc-carpage.open');
        return e ? e.innerText.replace(/\s+/g, ' ') : null;
      });
      return text;
    };
    const closeTab = async () => {
      await ev(() => window.__rt.game.closeTab());
      await rt('simulate', 0.1);
    };
    await rt('simulate', 1.0);

    // ---- 1. the workshop as the start has it
    const kit = await ev(async () => {
      const K = await import('/src/core/modcar/startKit.ts');
      const g = window.__rt.game;
      const lying = g.loose.list.filter((l) => l.part).map((l) => l.part.part).sort();
      const road = K.roadParts();
      return { world: g.params.world, onCar: Object.keys(g.vehicles[0].build.parts).length, lying, want: K.startParts(true).map((p) => p.inst.part).sort(), road: road.map((p) => p.part), panels: lying.filter((id) => /^(door|hood|trunk|bf_|br_|mir)/.test(id)) };
    });
    ok(kit.world === 7, 'a world of version 7');
    ok(kit.lying.length === 13 && kit.lying.join() === kit.want.join(), `thirteen parts about the room, the ones that start the car and drive it and one headlamp (${kit.lying.length}: ${kit.lying.join(' ')})`);
    ok(kit.panels.length === 0, `no door, no bonnet, no boot lid, no bumper, no mirror among them (${kit.panels.join(' ') || 'none'})`);
    const board = await ev(() => window.__rt.game.tutorialSteps().map((s) => ({ id: s.id, group: s.group ?? null, text: s.text })));
    ok(!board.some((s) => s.group === 'car') && board.some((s) => s.id === 'lamp' && s.group === 'drive'), `the board: nothing of "像一辆车", the headlamp among the steps to drive (${board.filter((s) => s.group === 'drive').map((s) => s.text).join(' · ')})`);
    await shot('01_workshop.png');

    // ---- 2. the page of the Tab screen
    let text = await carPage();
    ok(!!text && text.includes('这辆车') && text.includes('方糖') && /还缺 29 件/.test(text), `这辆车: ${text?.slice(0, 80)}`);
    ok(!!text && /发动机 没装 ?旁边有/.test(text) && /车门 左前车门、右前车门、左后车门、右后车门 (?!旁边有)/.test(text) && text.includes('不在旁边的零件要到路上找'), `what lies by is said, what does not is to be looked for down the road: ${text}`);
    await shot('02_page_start.png');
    await closeTab();

    // ---- 3. the workshop's parts on (as the board asks), the ones lying about gone into the car
    await ev(async () => {
      const K = await import('/src/core/modcar/startKit.ts');
      const g = window.__rt.game;
      for (const p of K.startParts(true)) window.__rt.fit(0, p.mount, p.inst.part);
      for (const l of g.loose.list.filter((x) => x.part)) g.loose.remove(l);
      g.simulate(0.2);
    });
    text = await carPage();
    ok(!!text && /还缺 16 件/.test(text) && text.includes('还可以加：收音机') && !text.includes('旁边有'), `the workshop's parts on: ${text}`);
    await shot('03_page_sixteen.png');
    await closeTab();

    // ---- 4. a boot without its lid: held out over it (R), it may not go there, and why is said
    const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
    // (a can of petrol: what one would put in a boot first)
    await rt('hold', 'tool:jerrycan', { fuel: 'petrol', litres: 5 });
    await rt('aimZone', 0, 'trunk', 1.3);
    await rt('simulate', 0.3);
    await page.keyboard.press('KeyR');
    await rt('simulate', 0.4);
    const out0 = await H('nd-place', 'aim');
    ok(!out0.ok && out0.into === 'trunk' && out0.why.includes('没有盖'), `held out over the boot with no lid: ${JSON.stringify({ ok: out0.ok, into: out0.into, why: out0.why })}`);
    await rt('press');
    await rt('simulate', 0.2);
    const said = await ev(() => document.body.innerText);
    ok(said.includes('后备箱没有盖'), 'the left button there: why is said');
    await shot('04_no_lid.png');
    if (await H('nd-place', 'placing')) await page.keyboard.press('KeyR');
    await rt('simulate', 0.2);
    // (Q held, looking at the car: into it without aiming — anywhere but the boot)
    await rt('aimZone', 0, 'trunk', 1.3);
    await rt('simulate', 0.2);
    await rt('dropFor', 0.8);
    await rt('simulate', 0.3);
    const packed = await rt('stowed', 0);
    const still = await rt('telemetry');
    ok(!packed.things.some((t) => t.zone === 'trunk'), `packed in without aiming: not into the boot (${JSON.stringify(packed.things)}; in the hands: ${still.held || 'nothing'})`);
    // (out of the car again, or off the floor: gone — another is taken up later)
    await ev(() => {
      const g = window.__rt.game;
      for (const l of g.loose.list.filter((x) => x.tool?.kind === 'jerrycan' && (x.tool.litres ?? 0) === 5)) g.loose.remove(l);
      g.player.held = null;
    });

    // ---- 5. down the road: the driver's door
    const door = await ev(async () => {
      const S = await import('/src/core/modcar/schedule.ts');
      const L = await import('/src/core/modcar/loot.ts');
      const g = window.__rt.game;
      const planner = new S.SitePlanner(g.places.plannedFinds());
      const sites = [];
      g.world.sites.between(0, 14000, sites);
      sites.sort((a, b) => a.s - b.s);
      planner.take(sites.map((x) => ({ id: x.id, s: x.s, kind: x.kind, boxes: L.planBoxes(x).length, ground: L.planGround(x) })));
      const at = [];
      for (const x of sites) for (const f of planner.findsAt(x.id)) if (f.entry.startsWith('start:')) at.push({ entry: f.entry, part: f.thing.part, id: x.id, s: x.s, kind: x.kind, boxes: x.containers.map((c) => c.id) });
      return { all: at, door: at.find((x) => x.entry === 'start:door_FL') };
    });
    ok(door.all.length === 16 && door.all.every((x) => x.s <= 12000), `the sixteen within the first twelve kilometres, at ${new Set(door.all.map((x) => x.id)).size} places (${door.all.map((x) => `${x.entry.slice(6)}@${(x.s / 1000).toFixed(1)}`).join(' ')})`);
    const w = door.door;
    // (a workshop or a filling station where the first three kilometres have one: this world's have none — the last place with a box in them)
    ok(!!w && w.s <= 3000, `the driver's door: a ${w?.kind} at ${(w?.s / 1000).toFixed(2)} km`);
    await rt('devGoKm', w.s / 1000, true);
    for (let k = 0; k < 80; k++) {
      await rt('simulate', 0.25);
      const p = await rt('places');
      const lp = p?.live?.find((x) => x.id === w.id);
      if (lp && lp.laid === lp.containers) break;
      await page.waitForTimeout(60);
    }
    // (the door's model in: where it lies is known then)
    let lies = null;
    for (let k = 0; k < 40 && !lies; k++) {
      lies = await ev((part) => {
        const g = window.__rt.game;
        const l = g.loose.list.find((x) => x.part?.part === part && x.part.shapeOf === 'sedan' && !x.riding);
        return l ? { uid: l.uid, x: l.x, y: l.y + l.mid, z: l.z, shut: !!l.shut } : null;
      }, w.part);
      if (!lies) {
        await rt('simulate', 0.25);
        await page.waitForTimeout(80);
      }
    }
    ok(!!lies, `a door shaped for the car lies there (${w.part})`);
    if (lies) {
      // (in a box that shuts: opened first)
      if (lies.shut) {
        const box = await ev((w) => {
          const g = window.__rt.game;
          for (const id of w.boxes) {
            const pc = g.places.containerOf(id);
            if (pc?.contents?.some((h) => h.kind === 'part' && h.inst.shapeOf === 'sedan')) {
              const s = pc.slots?.[0];
              if (!s) return null;
              s.frame.updateWorldMatrix(true, false);
              const e = s.frame.matrixWorld.elements;
              const o = g.core.origin;
              return { x: e[12] + o.x, y: e[13] + o.y, z: e[14] + o.z, from: Math.atan2(e[2], e[0]) };
            }
          }
          return null;
        }, w);
        if (box) {
          await rt('aimPoint', box.x, box.y + 0.1, box.z, box.from, 1.3);
          await rt('press');
          await rt('simulate', 0.8);
        }
      }
      let mark = '';
      for (const turn of [0, 0.8, -0.8, Math.PI, 1.6, -1.6]) {
        mark = await rt('aimPoint', lies.x, lies.y, lies.z, turn, 1.5);
        if (mark === `loose:${lies.uid}`) break;
      }
      await rt('simulate', 0.2);
      await shot('05_door_found.png');
      let tel = await rt('press');
      if (tel.held !== w.part) tel = await rt('useFor', 1.0);
      ok(tel.held === w.part, `the door taken up by hand (aimed ${mark}; held ${tel.held})`);
      // to its place on the car: its ghost there, the button held
      let fitted = false;
      for (let k = 0; k < 12 && !fitted; k++) {
        await rt('aim', 0, 'door_FL', 1.6);
        await rt('simulate', 0.2);
        await rt('useFor', 1.2);
        fitted = await ev(() => !!window.__rt.game.vehicles[0].build.parts.door_FL);
        if (!fitted) await page.waitForTimeout(250);
      }
      ok(fitted, 'fitted by hand at its place on the car');
      await shot('06_door_on.png');
    }
    text = await carPage();
    ok(!!text && /还缺 15 件/.test(text), `the page: ${text?.slice(0, 60)}`);
    await closeTab();

    // ---- 6. the last of the sixteen: said once; the boot takes the box
    const saidBefore = await ev(() => document.body.innerText.includes('装齐了'));
    await ev(async () => {
      const K = await import('/src/core/modcar/startKit.ts');
      const g = window.__rt.game;
      for (const p of K.roadParts()) if (!g.vehicles[0].build.parts[p.mount]) window.__rt.fit(0, p.mount, p.part);
    });
    await rt('simulate', 1.2);
    const whole = await ev(() => ({ said: document.body.innerText.includes('方糖装齐了'), done: window.__rt.game.done.has('whole') }));
    ok(!saidBefore && whole.said && whole.done, `the last one on: 方糖装齐了 (${JSON.stringify(whole)})`);
    await shot('07_whole.png');
    text = await carPage();
    ok(!!text && text.includes('装齐了，一件不缺') && text.includes('还可以加：收音机'), `the page: ${text}`);
    await shot('08_page_whole.png');
    await closeTab();
    await rt('hold', 'tool:jerrycan', { fuel: 'petrol', litres: 5 });
    await rt('aimZone', 0, 'trunk', 1.3);
    await rt('simulate', 0.2);
    await rt('dropFor', 0.8);
    await rt('simulate', 0.6);
    const stowed = await rt('stowed', 0);
    ok(stowed.things.some((t) => t.what === 'tool:jerrycan' && t.zone === 'trunk'), `the boot, its lid on, takes the can: ${JSON.stringify(stowed.things)}`);
    await shot('09_boot.png');
    const lastError = await ev(() => window.__rt.lastError);
    if (lastError) fail(`a frame threw: ${lastError}`);
    if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
    await page.close();
  }

  // ------------------------------------------------------------------ a world made before: the workshop as it always was
  {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&kit=j5&time=10&world=6&seed=${SEED}`, { width: 1280, height: 720 });
    const ev = (fn, arg) => page.evaluate(fn, arg);
    await ev(() => window.__rt.simulate(1.0));
    const old = await ev(() => {
      const g = window.__rt.game;
      return { parts: g.loose.list.filter((l) => l.part).length, car: g.tutorialSteps().filter((s) => s.group === 'car').length, lamp: g.tutorialSteps().some((s) => s.id === 'lamp') };
    });
    ok(old.parts === 29 && old.car === 8 && !old.lamp, `a world of version 6: twenty-nine parts about the room, the board's last group there (${JSON.stringify(old)})`);
    if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
    await page.close();
  }
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `f6_start: ${bad} FAILED` : 'f6_start: ok');
process.exit(bad ? 1 : 0);
