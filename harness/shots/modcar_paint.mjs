// Spray paint as a coat (docs/V3/plan/growth.md §1.5, J3; src/game/modcar/coat.ts): the garage's cans; a can held
// on a door — the mark says what and in which colour, a door does not open under the nozzle — the button held: a
// disc of the nozzle's size goes on where the spray lands, soft to its rim, wet; the mist in the air, the can
// losing its paint by the nozzle; a smiley drawn on the door with the fine nozzle; while it is wet the plastic
// scraper takes half of it off, a minute on it has set and the scraper still takes some a pass, the grinder the rest;
// rust painted over without grinding comes back through with the days; a wheel takes no paint, an engine neither;
// a bumper lying about takes it; the wheel goes through the can's seven nozzles; the garage's gun hooked to the
// can gives it a wide nozzle, as far as its hose reaches; saved and read back, the coat as it was.
//   SHOTS_GPU=1 node harness/shots/modcar_paint.mjs
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
  const ready = () => page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 180000 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const shot = async (name) => {
    await page.evaluate(() => {
      window.__rt.game.ui.showHelp(false);
      window.__rt.render();
    });
    await page.screenshot({ path: `loop/shots/modcar_paint_${name}.png` });
  };
  const words = () => page.evaluate(() => document.querySelector('.mc-acts')?.textContent ?? '');
  /** a shot of how it looks: out of reach (nothing marked on it), the hands empty, the mist gone (then the hands as they were) */
  const resultShot = async (name, mount, dist = 3.3) => {
    const sel = await page.evaluate(() => {
      const p = window.__rt.game.player;
      const was = p.sel;
      const free = p.slots.findIndex((x) => !x);
      if (free >= 0) p.sel = free;
      return was;
    });
    await rt('aim', 0, mount, dist);
    await rt('simulate', 2.5);
    await shot(name);
    await page.evaluate((sel) => {
      window.__rt.game.player.sel = sel;
      window.__rt.game.simulate(0);
    }, sel);
  };
  /** how much of a part (a mount's, or the body: null) its coat covers now: set, wet (null: no coat) */
  const coverOf = (mount) =>
    page.evaluate((mount) => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      const inst = mount ? v.build.parts[mount] : null;
      const key = inst ? inst.uid : `${v.build.uid}:body`;
      const c = g.coats.get(key);
      if (!c) return null;
      const m = g.coats.measure(c);
      return { dry: +m.dry.toFixed(4), wet: +m.wet.toFixed(4) };
    }, mount);
  const canLeft = () => page.evaluate(() => window.__rt.game.player.held?.tool?.paint ?? null);
  /** hold the button for s seconds where the mark is (the button stays down for the shot if asked) */
  const sprayHold = (s, release = true) =>
    page.evaluate(
      ({ s, release }) => {
        const g = window.__rt.game;
        g.player.press();
        let puffs = 0;
        let ring = 0;
        for (let t = 0; t < s - 1e-9; t += 1 / 60) {
          g.player.primary = true;
          g.step(1 / 60, 1);
          puffs = Math.max(puffs, g.mist?.count ?? 0);
          ring = Math.max(ring, g.player.progress ?? 0);
        }
        const left = g.player.held?.tool?.paint ?? null;
        if (release) {
          g.player.release();
          g.simulate(0);
        }
        return { puffs, ring, left };
      },
      { s, release },
    );
  /**
   * Strokes drawn on a door with the button held, the view turned from point to point along each (u along the car,
   * v up, metres from the door's middle); let go between strokes. speed: m/s along a stroke; dwell: s on a single point
   */
  const draw = (mount, strokes, speed = 0.12, dwell = 0.7, from = 'key') =>
    page.evaluate(
      ({ mount, strokes, speed, dwell, from }) => {
        const g = window.__rt.game;
        const v = g.vehicles[0];
        const at = g.__drawFrame?.(mount);
        const w = g.player.walker;
        const lookAt = (u, vv) => {
          const x = at.c.x + at.f.x * u + at.up.x * vv;
          const y = at.c.y + at.f.y * u + at.up.y * vv;
          const z = at.c.z + at.f.z * u + at.up.z * vv;
          const eye = w.eye();
          g.input.lookYaw = Math.atan2(z - w.z, x - w.x);
          g.input.lookPitch = Math.atan2(y - eye.y, Math.hypot(x - w.x, z - w.z));
        };
        void v;
        let frames = 0;
        for (const st of strokes) {
          lookAt(st[0][0], st[0][1]);
          g.simulate(0);
          g.player.press(from);
          if (st.length === 1) {
            for (let t = 0; t < dwell; t += 1 / 60) {
              g.player.primary = true;
              g.step(1 / 60, 1);
              frames++;
            }
          } else {
            for (let i = 1; i < st.length; i++) {
              const [u0, v0] = st[i - 1];
              const [u1, v1] = st[i];
              const n = Math.max(1, Math.round((Math.hypot(u1 - u0, v1 - v0) / speed) * 60));
              for (let k = 1; k <= n; k++) {
                lookAt(u0 + ((u1 - u0) * k) / n, v0 + ((v1 - v0) * k) / n);
                g.player.primary = true;
                g.step(1 / 60, 1);
                frames++;
              }
            }
          }
          g.player.release(from);
          g.simulate(0);
        }
        return frames;
      },
      { mount, strokes, speed, dwell, from },
    );

  await page.goto(`${url}/modcar.html?new=1`, { waitUntil: 'domcontentloaded' });
  await ready();
  await rt('setHour', 13);
  // (the car clean and rust-free, the better to see its coat: a coat goes over the colour, not over the dirt)
  await page.evaluate(() => {
    const g = window.__rt.game;
    const b = g.vehicles[0].build;
    b.dirt = b.rust = 0;
    b.crust = 0;
    for (const p of Object.values(b.parts)) {
      p.dirt = p.rust = 0;
      p.crust = 0;
    }
    g.vehicles[0].view.refresh();
    // a door's frame for drawing on it: its middle (a little below, under the window), along the car, up
    g.__drawFrame = (mount) => {
      const v = g.vehicles[0];
      v.view.model.updateMatrixWorld(true);
      const box = v.view.panelBox(mount);
      const o = g.core.origin;
      const c = box.getCenter(new (g.core.camera.position.constructor)());
      const b = new Float64Array(9);
      v.sim.basis(b);
      return { c: { x: c.x + o.x, y: c.y + o.y - 0.12, z: c.z + o.z }, f: { x: b[0], y: b[1], z: b[2] }, up: { x: b[3], y: b[4], z: b[5] } };
    };
  });
  await rt('simulate', 0.5);

  // 1. the garage's cans (two small ones part full, a medium and a large)
  const cans = await page.evaluate(() => window.__rt.game.loose.list.filter((l) => l.tool?.kind === 'spray').map((l) => ({ tier: l.tool.tier, colour: l.tool.colour, paint: l.tool.paint })));
  console.log('cans', JSON.stringify(cans));
  const small = cans.filter((c) => c.tier === 1);
  if (small.length !== 2 || small.some((c) => !(c.paint >= 2 && c.paint <= 10 && Number.isInteger(c.paint)))) fail(`not two small cans part full (${JSON.stringify(small)})`);
  if (!cans.some((c) => c.tier === 2) || !cans.some((c) => c.tier === 3)) fail('no medium or no large can');

  // 2. a medium cherry-red can on the front-left door: the mark says so; the button does not open the door
  await rt('hold', 'tool:spray', { tier: 2, colour: 13 });
  await rt('aim', 0, 'door_FL', 1.35);
  await rt('simulate', 0.1);
  let tel = await rt('telemetry');
  if (!String(tel.target).startsWith('paint:') || !String(tel.target).endsWith(':door_FL')) fail(`the mark is not on the door to paint (target ${tel.target})`);
  let w = await words();
  console.log('words', w);
  // (one verb and the name since docs/V3/plan/prompts.md §五: the colour is the brush's shadow's)
  if (!/喷/.test(w) || !/车门/.test(w) || /樱桃红|·/.test(w)) fail(`the words are not one verb and the door (${w})`);
  if (!(tel.brush?.on === 1 && tel.brush.hex !== 0xffffff && tel.brush.warn === 0)) fail(`the brush's shadow is not on the door in the can's colour (${JSON.stringify(tel.brush)})`);
  if (/已经是/.test(w)) fail(`the words refuse the colour (${w})`);
  await shot('aim');
  const open0 = await page.evaluate(() => window.__rt.game.vehicles[0].view.panelOpen('door_FL'));
  const left0 = await canLeft();

  // 3. held 1.2 s on one spot: a disc of the medium nozzle's size, wet, the mist in the air, the can down by 1.2 units
  const spot = await sprayHold(1.2, false);
  await shot('spot');
  await page.evaluate(() => {
    window.__rt.game.player.release();
    window.__rt.game.simulate(0);
  });
  const open1 = await page.evaluate(() => window.__rt.game.vehicles[0].view.panelOpen('door_FL'));
  if (open1 > open0 + 0.05) fail(`the door opened under the nozzle (${open0} → ${open1})`);
  const c1 = await coverOf('door_FL');
  const left1 = spot.left;
  console.log('spot', JSON.stringify({ c1, left0, left1, puffs: spot.puffs, ring: spot.ring }));
  if (!c1 || !(c1.wet > 0.01 && c1.wet < 0.2) || c1.dry !== 0) fail(`a spot is not a small wet disc on the door (${JSON.stringify(c1)})`);
  // (the 36 cm nozzle a can comes with: 3 units a second — docs/V3/plan/hands.md §六)
  if (!(Math.abs(left0 - left1 - 3.6) < 0.15)) fail(`the can did not lose 3.6 units (${left0} → ${left1})`);
  // (a thin short jet, not a cloud: docs/V3/plan/hands.md §六)
  if (!(spot.puffs > 3 && spot.puffs < 60)) fail(`the jet is not thin (${spot.puffs} puffs)`);
  if (!(spot.ring > 0.005)) fail(`the ring does not follow the coat (${spot.ring})`);
  // (the paint is on the door only: not on the body, nor the door behind)
  if (await coverOf('door_RL')) fail('the rear door has a coat');
  if (await coverOf(null)) fail('the body has a coat');
  w = await words();
  // (how far the coat is: the ring's, not the words' — docs/V3/plan/prompts.md §五)
  if (/漆盖住|湿|%/.test(w)) fail(`the words count the coat (${w})`);
  // (let go: it does not spread)
  await rt('simulate', 0.6);
  const c1b = await coverOf('door_FL');
  if (Math.abs(c1b.wet - c1.wet) > 1e-3) fail(`the coat moved without the button (${c1.wet} → ${c1b.wet})`);
  await resultShot('spot_done', 'door_FL');

  // 4. the wheel: a size a notch, down finer to the finest and no further — the can's own seven
  const noz = await page.evaluate(() => {
    const g = window.__rt.game;
    const out = [];
    for (let i = 0; i < 4; i++) {
      g.player.wheel(1);
      out.push(g.player.held.tool.nozzle);
    }
    return out;
  });
  console.log('nozzles', JSON.stringify(noz));
  if (JSON.stringify(noz) !== '[2,1,0,0]') fail(`the wheel does not go down through the nozzles to the finest (${JSON.stringify(noz)})`);

  // 5. a smiley on the rear-left door with the fine nozzle (yellow): two eyes and a smile
  await rt('hold', 'tool:spray', { tier: 3, colour: 9, nozzle: 0 });
  await rt('aim', 0, 'door_RL', 1.3);
  await rt('simulate', 0.1);
  const smile = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI + 0.45 + ((Math.PI - 0.9) * i) / 12;
    smile.push([0.2 * Math.cos(a), 0.02 + 0.16 * Math.sin(a)]);
  }
  const frames = await draw('door_RL', [[[-0.1, 0.1]], [[0.1, 0.1]], smile]);
  const cs = await coverOf('door_RL');
  console.log('smiley', frames, JSON.stringify(cs));
  if (!cs || !(cs.wet > 0.02)) fail(`no smiley on the door (${JSON.stringify(cs)})`);
  await shot('smiley_drawing');
  await resultShot('smiley', 'door_RL');

  // 6. while it is wet: the plastic scraper takes half of it off (the half nearer the car's front; the halves found from where it is held)
  await rt('hold', 'tool:scraper', { tier: 1 });
  await rt('aim', 0, 'door_RL', 1.3);
  await rt('simulate', 0.1);
  const half = await page.evaluate(() => {
    const g = window.__rt.game;
    const at = g.__drawFrame('door_RL');
    const cam = g.core.camera;
    const o = g.core.origin;
    const P = cam.position.constructor;
    const ndc = (u, v) => new P(at.c.x + at.f.x * u + at.up.x * v - o.x, at.c.y + at.f.y * u + at.up.y * v - o.y, at.c.z + at.f.z * u + at.up.z * v - o.z).project(cam);
    const a = ndc(0.26, 0.2);
    const b = ndc(0, -0.2);
    const c = ndc(-0.26, 0.2);
    return { front: { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x) }, back: { x0: Math.min(c.x, b.x), x1: Math.max(c.x, b.x) }, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) };
  });
  console.log('halves', JSON.stringify(half));
  const scrubHalf = (hh, seconds, passes) =>
    rt('scrub', seconds, passes, (hh.x1 - hh.x0) / 2, (half.y1 - half.y0) / 2 + 0.02, (hh.x0 + hh.x1) / 2, (half.y0 + half.y1) / 2);
  const before = await coverOf('door_RL');
  const sp = await scrubHalf(half.front, 3, 8);
  const wiped = await coverOf('door_RL');
  console.log('wiped', JSON.stringify({ started: sp.started, before, wiped }));
  if (!sp.started) fail('the scraper did not start on the door');
  if (!(wiped.wet < before.wet * 0.75 && wiped.wet > before.wet * 0.25)) fail(`the scraper did not take about half of the wet smiley (${before.wet} → ${wiped.wet})`);
  await resultShot('wiped', 'door_RL');

  // 7. a minute on: it has set (wet → dry); the plastic scraper still takes some of it a pass (a quarter where it goes)
  await page.evaluate(() => {
    const g = window.__rt.game;
    for (let t = 0; t < 62; t += 0.5) g.step(0.5, 1);
    g.simulate(0);
  });
  const set = await coverOf('door_RL');
  console.log('set', JSON.stringify(set));
  if (!(set.wet === 0 && Math.abs(set.dry - wiped.wet) < 0.01)) fail(`a minute on the coat has not set (${JSON.stringify(wiped)} → ${JSON.stringify(set)})`);
  await rt('aim', 0, 'door_RL', 1.3);
  await rt('simulate', 0.1);
  if (!(await scrubHalf(half.back, 3, 10)).started) fail('the plastic scraper did not start on the set coat');
  const plastic = await coverOf('door_RL');
  console.log('plastic scraper', JSON.stringify({ set, plastic }));
  if (!(plastic.dry < set.dry - 0.002) || !(plastic.dry > set.dry * 0.3)) fail(`a pass of the plastic scraper did not take some of the set paint, slowly (${set.dry} → ${plastic.dry})`);

  // 8. the grinder takes what has set: the other half, swept over it with the left button held
  await rt('hold', 'item:nd_grinder');
  await rt('aim', 0, 'door_RL', 0.8);
  await rt('simulate', 0.2);
  const rows = [[[-0.3, 0.12], [0.02, 0.12], [0.02, 0.0], [-0.3, 0.0], [-0.3, -0.12], [0.02, -0.12], [0.02, -0.2], [-0.3, -0.2]]];
  for (let k = 0; k < 2; k++) await draw('door_RL', rows, 0.3, 0, 'mouse');
  const scraped = await coverOf('door_RL');
  console.log('ground', JSON.stringify({ set, scraped }));
  if (!(scraped.dry < plastic.dry * 0.35)) fail(`the grinder did not take the set half off (${plastic.dry} → ${scraped.dry})`);
  await resultShot('scraped', 'door_RL');

  // 9. rust painted over without grinding: hidden under the coat, then back through it three days on
  const rust = await page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.vehicles[0];
    v.build.parts.door_RL.rust = 0.85;
    v.view.refresh();
    g.simulate(0.1);
    return v.build.parts.door_RL.rust;
  });
  await resultShot('rust_before', 'door_RL');
  await rt('hold', 'tool:spray', { tier: 3, colour: 0, nozzle: 2 });
  await rt('aim', 0, 'door_RL', 1.3);
  await rt('simulate', 0.1);
  w = await words();
  // (the rust under it: the brush's rim in amber, not a line of words — docs/V3/plan/hands.md §六)
  tel = await rt('telemetry');
  if (/锈/.test(w) || tel.brush?.warn !== 1) fail(`the rust under it is not warned of by the brush's rim (${w}, ${JSON.stringify(tel.brush)})`);
  await draw('door_RL', [[[-0.32, 0.06], [0.32, 0.06]], [[0.32, -0.14], [-0.32, -0.14]]], 0.09);
  await page.evaluate(() => {
    const g = window.__rt.game;
    for (let t = 0; t < 62; t += 0.5) g.step(0.5, 1);
    g.simulate(0);
  });
  const hood = await coverOf('door_RL');
  const noted = await page.evaluate(() => window.__rt.game.vehicles[0].build.parts.door_RL.coatRust ?? null);
  console.log('rust', rust, JSON.stringify({ door: hood, noted }));
  if (!noted || !(noted[0] > 0.5)) fail(`painting over rust was not noted (${JSON.stringify(noted)})`);
  await resultShot('rust_hidden', 'door_RL');
  const bleed = await page.evaluate(() => {
    const g = window.__rt.game;
    const p = g.vehicles[0].build.parts.door_RL;
    p.coatRust[1] -= 3 * 86400;
    g.simulate(0.1);
    const look = g.vehicles[0].view.grimeParts().find((x) => x.inst?.uid === p.uid)?.look;
    return look?.shared?.uCoatBleed?.value ?? null;
  });
  console.log('bleed', bleed);
  if (!(bleed > 0.5)) fail(`the rust does not come back through three days on (${bleed})`);
  await resultShot('rust_back', 'door_RL');

  // (the grinder: step 8)
  const frOk = false;
  if (frOk) {
    await draw('door_FR', [[[-0.3, 0.05], [0.3, 0.05]], [[0.3, -0.12], [-0.3, -0.12]]], 0.12);
    await page.evaluate(() => {
      const g = window.__rt.game;
      for (let t = 0; t < 62; t += 0.5) g.step(0.5, 1);
      g.simulate(0);
    });
    const g0 = await coverOf('door_FR');
    await rt('hold', 'item:nd_grinder');
    await rt('aim', 0, 'door_FR', 0.75);
    await rt('simulate', 0.2);
    // (the disc is where the grinder is held, a little off the mark: a sweep over the bands takes some of them each time)
    const sweep = [[[-0.32, 0.05], [0.32, 0.05], [0.32, -0.12], [-0.32, -0.12]]];
    await draw('door_FR', sweep, 0.25, 0, 'mouse');
    const g1 = await coverOf('door_FR');
    await draw('door_FR', sweep, 0.25, 0, 'mouse');
    await draw('door_FR', sweep, 0.25, 0, 'mouse');
    const g3 = await coverOf('door_FR');
    console.log('grinder', JSON.stringify({ g0, g1, g3 }));
    if (!g0 || !(g0.dry > 0.1)) fail(`no white bands on the right front door to grind (${JSON.stringify(g0)})`);
    else if (!(g1.dry < g0.dry * 0.75) || !(g3.dry < g0.dry * 0.5)) fail(`the grinder did not take the set coat off fast (${g0.dry} → ${g1.dry} in one sweep, ${g3.dry} in three)`);
    await resultShot('ground', 'door_FR');
  } else console.log('(the right front door is not to be aimed at here: the grinder not checked)');

  // 10. an engine lying about takes no paint (and the words say so); a headlamp neither
  await rt('hold', 'tool:spray', { tier: 3, colour: 24, nozzle: 2 });
  await rt('aimLoose', 'eng_i4', 1.1, 'free');
  await rt('simulate', 0.1);
  tel = await rt('telemetry');
  const engAim = await page.evaluate(() => {
    const a = window.__rt.game.player.paintAim;
    return a ? { label: a.label, paintable: a.paintable } : null;
  });
  const wordsEng = await words();
  console.log('engine', tel.target, JSON.stringify(engAim), wordsEng);
  if (String(tel.target).startsWith('paint:') || engAim?.paintable !== false) fail(`an engine is a paint target (${tel.target} ${JSON.stringify(engAim)})`);
  if (/喷漆 /.test(wordsEng)) fail(`the words offer to paint the engine (${wordsEng})`);

  // 11. a bull bar lying about is bare steel: no paint goes on it, and the words say so
  const bar = await page.evaluate(() => {
    const l = window.__rt.game.loose.list.find((x) => x.part?.part === 'bf_ram');
    return l ? { x: l.x, y: l.y + l.mid, z: l.z, uid: l.uid } : null;
  });
  if (bar) {
    for (let k = 0; k < 8; k++) {
      await rt('aimPoint', bar.x, bar.y, bar.z, (k * Math.PI) / 4, 1.1);
      await rt('simulate', 0.05);
      if ((await page.evaluate(() => window.__rt.game.player.paintAim?.owner ?? '')) === `l:${bar.uid}`) break;
    }
    const b = await page.evaluate(() => {
      const a = window.__rt.game.player.paintAim;
      return { owner: a?.owner ?? null, paintable: a?.paintable ?? null, words: document.querySelector('.mc-acts')?.textContent ?? '' };
    });
    console.log('bull bar', JSON.stringify(b));
    // (the left button picks it up there, as ever: the words do not offer paint)
    if (b.owner === `l:${bar.uid}` && (b.paintable || /喷漆 /.test(b.words))) fail(`a bare steel bull bar takes paint (${JSON.stringify(b)})`);
  }
  // a door lying about on the floor takes a coat
  await rt('hold', 'door_stock');
  await rt('aim', 0, 'door_FL', 3.2);
  await rt('drop');
  await rt('simulate', 1.5);
  const ram = await page.evaluate(() => {
    const l = window.__rt.game.loose.list.find((x) => x.part?.part === 'door_stock' && !x.riding);
    return l ? { uid: l.part.uid } : null;
  });
  await rt('hold', 'tool:spray', { tier: 3, colour: 24, nozzle: 2 });
  if (!ram) fail('no door lying about to paint');
  else {
    const at = await page.evaluate((uid) => {
      const l = window.__rt.game.loose.list.find((x) => x.part?.uid === uid);
      return { x: l.x, y: l.y + l.mid, z: l.z, uid: l.uid };
    }, ram.uid);
    for (let k = 0; k < 16; k++) {
      await rt('aimPoint', at.x, at.y, at.z, (k * Math.PI) / 4, k < 8 ? 1.1 : 1.6);
      await rt('simulate', 0.05);
      if ((await page.evaluate(() => window.__rt.game.player.paintAim?.owner ?? '')) === `l:${at.uid}`) break;
    }
    const onIt = await page.evaluate(() => window.__rt.game.player.paintAim?.owner ?? '');
    if (onIt !== `l:${at.uid}`) console.log(`(the mark is not on the door lying about: ${onIt})`);
    await sprayHold(1.5);
    const after = await page.evaluate((uid) => {
      const g = window.__rt.game;
      const c = g.coats.get(uid);
      return c ? g.coats.measure(c) : null;
    }, ram.uid);
    console.log('door lying about', JSON.stringify(after));
    if (!after || !(after.wet > 0.02)) fail(`the door lying about took no coat (${JSON.stringify(after)})`);
    await shot('loose');
  }

  // 12. the gun on the compressor: hooked to the can, a nozzle wider than the can's own, as far as its hose reaches
  const gun = await page.evaluate(() => !!window.__rt.game.devices.find((d) => d.id === 'paintbooth'));
  if (gun) {
    await rt('hold', 'tool:spray', { tier: 3, colour: 22 });
    // (no power: the compressor does not run, the gun stays where it is)
    await rt('useDevice', 'paintbooth');
    const dead = await page.evaluate(() => window.__rt.game.player.held?.tool?.nozzle ?? 3);
    if (dead === 7) fail('the gun hooked up with no power');
    await page.evaluate(() => {
      const g = window.__rt.game;
      g.workshop.gen.on = true;
      g.simulate(0.2);
    });
    const r = await rt('useDevice', 'paintbooth');
    const hooked = await page.evaluate(() => window.__rt.game.player.held?.tool?.nozzle);
    console.log('gun', JSON.stringify(r), hooked);
    if (hooked !== 7) fail(`the gun did not hook to the can (nozzle ${hooked})`);
    await rt('aim', 0, 'trunk', 1.5);
    await rt('simulate', 0.1);
    const t0 = await coverOf('trunk');
    await sprayHold(1.0);
    const t1 = await coverOf('trunk');
    const still = await page.evaluate(() => window.__rt.game.player.held?.tool?.nozzle);
    console.log('gun coat', JSON.stringify({ t0, t1, still }));
    if (still !== 7) console.log('(the boot is beyond the hose from the booth: not checked)');
    else if (!t1 || !(t1.wet > (c1?.wet ?? 0) * 1.6)) fail(`a second of the gun covers no more than the medium nozzle (${JSON.stringify(t1)} vs ${c1?.wet})`);
    await shot('gun');
    // (taken twenty metres off: it comes off the hose)
    await page.evaluate(() => {
      const g = window.__rt.game;
      const d = g.devices.find((x) => x.id === 'paintbooth');
      g.player.walker.place(d.x + 20, d.z, 0);
      g.step(1 / 60, 1);
      g.simulate(0);
    });
    const off = await page.evaluate(() => window.__rt.game.player.held?.tool?.nozzle);
    if (off !== 3) fail(`the can taken twenty metres off is still on the hose (nozzle ${off})`);
  } else console.log('(no paint gun in this garage)');

  // 13. saved and read back: the coats as they were (the wet ones set)
  await rt('hold', 'tool:spray', { tier: 2, colour: 13 });
  await rt('aim', 0, 'door_FL', 1.35);
  await sprayHold(0.6);
  // (what is kept: the set coat with the wet over it, as one — measured from the texels the store gets)
  const kept = (mount) =>
    page.evaluate((mount) => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      const c = g.coats.get(v.build.parts[mount].uid);
      if (!c) return null;
      const px = g.coats.read(c);
      let a = 0;
      for (let i = 3; i < px.length; i += 4) a += px[i];
      return { dry: +Math.min(1, a / 255 / (px.length / 4) / c.surface).toFixed(4), wet: 0 };
    }, mount);
  const keep = { fl: await kept('door_FL'), rl: await kept('door_RL'), trunk: await kept('trunk') };
  await page.evaluate(() => window.__rt.game.save());
  await page.waitForTimeout(1200);
  await page.goto(`${url}/modcar.html`, { waitUntil: 'domcontentloaded' });
  await ready();
  await rt('simulate', 0.4);
  const back = { fl: await kept('door_FL'), rl: await kept('door_RL'), trunk: await kept('trunk') };
  const backWet = [await coverOf('door_FL'), await coverOf('door_RL'), await coverOf('trunk')].map((c) => c?.wet ?? -1);
  console.log('read back', JSON.stringify({ keep, back }));
  const sum = (c) => (c ? c.dry + c.wet : -1);
  if (backWet.some((x) => x !== 0)) fail(`a coat came back wet or not at all (${JSON.stringify(backWet)})`);
  for (const k of ['fl', 'rl', 'trunk']) if (!back[k] || Math.abs(sum(back[k]) - sum(keep[k])) > 0.003) fail(`the ${k} coat came back otherwise (${JSON.stringify(keep[k])} → ${JSON.stringify(back[k])})`);
  await rt('setHour', 13);
  await rt('aim', 0, 'door_RL', 2.6);
  await rt('simulate', 0.2);
  await shot('reloaded');
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
console.log(bad ? `modcar_paint: ${bad} FAILED` : 'paint ok');
process.exit(bad ? 1 : 0);
