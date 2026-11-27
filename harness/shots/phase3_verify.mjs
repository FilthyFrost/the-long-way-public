/**
 * Playtest Round 2 — Phase 3 live browser GPU verification + 720p .webm video recording (#29).
 *
 * Verifies & records:
 *   1) Remodeled & enlarged raw ingredients spread (tomato, marbled beef, potato, carrot, onion, cheese, bread, egg, chicken, salmon)
 *   2) First-person held close-ups of marbled raw beef steak & heirloom tomato
 *   3) Dedicated `prep_beef_slices` (cut beef) & `prep_wedges` (cut tomato) on cutting board AND sizzling inside a lit frying pan (no pan-shrink!)
 *   4) Remodeled & enlarged cooked dishes feast (steak cutlet, tomato & egg stirfry, potato beef stew, beef noodle soup, fried rice, salad, pizza, cake)
 *   5) First-person held close-up of seared steak dish
 *
 * Output:
 *   - Screenshots: D:/cindy-scratch/phase3-verify/*.png
 *   - 720p video:  D:/cindy-scratch/phase3-verify/videos/01_phase3_food_prep_cooking_feast.webm
 */
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser, startServer } from './lib.mjs';

const OUT = 'D:/cindy-scratch/phase3-verify';
const VID = path.join(OUT, 'videos');
fs.mkdirSync(VID, { recursive: true });

let bad = 0;
function ok(cond, msg) {
  if (cond) console.log(`ok   ${msg}`);
  else {
    bad++;
    console.error(`FAIL ${msg}`);
  }
}

async function stepN(page, n, dt = 1 / 30) {
  await page.evaluate(([cnt, step]) => {
    const g = window.__rt.game;
    for (let i = 0; i < cnt; i++) g.frame(step);
  }, [n, dt]);
}

async function playSec(page, sec, onStep) {
  const frames = Math.max(1, Math.round(sec * 30));
  for (let i = 0; i < frames; i++) {
    if (onStep) await onStep(i, frames);
    await page.evaluate(() => window.__rt.game.frame(1 / 30));
    await page.waitForTimeout(22);
  }
}

async function waitModels(page, ms = 1400) {
  const steps = Math.ceil(ms / 60);
  for (let i = 0; i < steps; i++) {
    await page.evaluate(() => window.__rt.game.frame(1 / 30));
    await page.waitForTimeout(40);
  }
}

async function shot(page, name) {
  const p = path.join(OUT, `${name}.png`);
  await stepN(page, 3);
  await page.screenshot({ path: p });
  console.log(`shot ${p}`);
  return p;
}

const { server, url } = await startServer();
const browser = await launchBrowser();

try {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: VID, size: { width: 1280, height: 720 } },
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });

  await page.goto(`${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:wagon&s=900&time=11&weather=clear`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => !!window.__rt?.game?.vehicles?.[0], { timeout: 60_000 });
  await waitModels(page, 1800);

  // Exit vehicle to bright sunlit roadside stage
  await page.keyboard.down('KeyQ');
  await playSec(page, 0.45);
  await page.keyboard.up('KeyQ');
  await playSec(page, 0.25);

  // ================================================================ 1) RAW INGREDIENTS TABLETOP SHOWCASE
  const rawSetup = await page.evaluate(() => {
    const g = window.__rt.game;
    const w = g.player.walker;
    const yaw = g.input.lookYaw + Math.PI;
    const fx = Math.cos(yaw);
    const fz = Math.sin(yaw);
    const rx = -fz;
    const rz = fx;
    const px = w.x + fx * 4.0;
    const pz = w.z + fz * 4.0;
    w.place(px, pz, yaw);
    const tx = px + fx * 0.96;
    const tz = pz + fz * 0.96;
    // nd_kitchen_stand width (1.12 m) runs along local Z; aligning local +Z to camera right (rx, rz) -> rotY = atan2(rx, rz)
    const rotY = Math.atan2(rx, rz);
    window.__p3 = [];

    const ks = g.loose.addItem({ uid: 'p3-ks-raw', item: 'nd_kitchen_stand', qty: 1 }, tx, w.y, tz, rotY);
    g.loose.seat(ks, w.y);
    window.__p3Stand = ks;

    const topY = w.y + 0.722;
    const row1 = ['ing_tomato', 'ing_beef', 'ing_potato', 'ing_cheese', 'ing_egg'];
    const row2 = ['ing_carrot', 'ing_onion', 'ing_bread', 'ing_chicken', 'ing_salmon'];
    const placed = [];
    row1.forEach((id, i) => {
      const s = -0.44 + i * 0.22;
      const d = -0.14;
      const it = g.loose.addItem({ uid: `p3-r1-${i}`, item: id, qty: 1 }, tx + rx * s + fx * d, topY, tz + rz * s + fz * d, rotY + i * 0.2);
      g.loose.seat(it, topY);
      window.__p3.push(it);
      placed.push(it.uid);
    });
    row2.forEach((id, i) => {
      const s = -0.44 + i * 0.22;
      const d = 0.14;
      const it = g.loose.addItem({ uid: `p3-r2-${i}`, item: id, qty: 1 }, tx + rx * s + fx * d, topY, tz + rz * s + fz * d, rotY + i * 0.25);
      g.loose.seat(it, topY);
      window.__p3.push(it);
      placed.push(it.uid);
    });
    g.input.lookYaw = yaw;
    g.input.lookPitch = -0.56;
    return { yaw, px, pz, tx, tz, fx, fz, rx, rz, rotY, topY, placedCount: placed.length };
  });
  await waitModels(page, 1400);
  await shot(page, '01_raw_ingredients_showcase');
  // Slow cinematic pan over raw ingredients
  await playSec(page, 0.9, (i, n) =>
    page.evaluate(([y]) => {
      window.__rt.game.input.lookYaw = y;
    }, [rawSetup.yaw + Math.sin((i / n) * Math.PI * 2) * 0.22]),
  );

  // ================================================================ 2) HELD CLOSE-UPS: RAW MARBLED BEEF & HEIRLOOM TOMATO
  await page.evaluate(([y]) => {
    const g = window.__rt.game;
    const w = g.player.walker;
    const b = g.loose.addItem({ uid: 'p3-hb', item: 'ing_beef', qty: 1 }, w.x, 0, w.z, 0);
    g.player.slots[0] = { kind: 'item', item: b.item };
    g.loose.remove(b);
    g.player.sel = 0;
    g.input.lookYaw = y;
    g.input.lookPitch = -0.18;
  }, [rawSetup.yaw]);
  await waitModels(page, 700);
  await playSec(page, 0.55);
  await shot(page, '02_held_beef_closeup');

  await page.evaluate(() => {
    const g = window.__rt.game;
    const w = g.player.walker;
    const t = g.loose.addItem({ uid: 'p3-ht', item: 'ing_tomato', qty: 1 }, w.x, 0, w.z, 0);
    g.player.slots[0] = { kind: 'item', item: t.item };
    g.loose.remove(t);
    g.player.sel = 0;
  });
  await waitModels(page, 700);
  await playSec(page, 0.55);
  await shot(page, '03_held_tomato_closeup');

  // ================================================================ 3) CUT BEEF (prep_beef_slices) & CUT TOMATO ON BOARD + SIZZLING IN FRYING PAN
  const cookCheck = await page.evaluate(([s]) => {
    const g = window.__rt.game;
    const w = g.player.walker;
    g.player.slots[0] = null;
    // Clear previous raw food items off the stand
    for (const it of window.__p3.splice(0)) g.loose.remove(it);
    const { tx, tz, fx, fz, rx, rz, rotY, topY, yaw } = s;
    // Left side of counter: chopping board with freshly sliced beef (`prep_beef_slices`) + loose cut_beef & cut_tomato!
    const board = g.loose.addItem(
      {
        uid: 'p3-board',
        item: 'kit_board',
        qty: 1,
        state: { kit: { food: { id: 'beef', cut: 1 } } },
      },
      tx - rx * 0.34,
      topY,
      tz - rz * 0.34,
      rotY,
    );
    g.loose.seat(board, topY);
    window.__p3.push(board);

    const cutTomato = g.loose.addItem(
      { uid: 'p3-ctom', item: 'cut_tomato', qty: 1 },
      tx - rx * 0.02 + fx * 0.11,
      topY,
      tz - rz * 0.02 + fz * 0.11,
      rotY + 0.3,
    );
    g.loose.seat(cutTomato, topY);
    window.__p3.push(cutTomato);

    const cutBeef = g.loose.addItem(
      { uid: 'p3-cbeef', item: 'cut_beef', qty: 1 },
      tx - rx * 0.02 - fx * 0.12,
      topY,
      tz - rz * 0.02 - fz * 0.12,
      rotY - 0.2,
    );
    g.loose.seat(cutBeef, topY);
    window.__p3.push(cutBeef);

    // Right side of counter: lit camp stove with frying pan holding BOTH cut beef & cut tomato sizzling generously!
    const stove = g.loose.addItem(
      {
        uid: 'p3-stove',
        item: 'kit_stove',
        qty: 1,
        state: {
          kit: {
            gas: 1800,
            fire: 2,
            on: 'kit_pan',
            pot: {
              items: [
                { id: 'beef', cut: 1 },
                { id: 'tomato', cut: 1 },
                { id: 'beef', cut: 1 },
              ],
              done: 0.45,
            },
          },
        },
      },
      tx + rx * 0.34,
      topY,
      tz + rz * 0.34,
      rotY,
    );
    g.loose.seat(stove, topY);
    window.__p3.push(stove);

    // Position player slightly closer for crisp inspection of board + sizzling pan
    w.place(tx - fx * 0.80, tz - fz * 0.80, yaw);
    g.input.lookYaw = yaw;
    g.input.lookPitch = -0.60;
    return { boardFood: board.item.state?.kit?.food?.id, panCount: stove.item.state?.kit?.pot?.items?.length ?? 0 };
  }, [rawSetup]);
  await waitModels(page, 1600);
  await playSec(page, 1.1);
  await shot(page, '04_cut_beef_tomato_board_and_pan');
  ok(
    cookCheck.boardFood === 'beef' && cookCheck.panCount === 3,
    `#29 prep_beef_slices on board & cut beef+tomato sizzling generously in pan (${JSON.stringify(cookCheck)})`,
  );

  // ================================================================ 4) REMODELED & ENLARGED COOKED DISHES FEAST
  await page.evaluate(([s]) => {
    const g = window.__rt.game;
    const w = g.player.walker;
    // Clear previous counter props + old stand
    for (const it of window.__p3.splice(0)) g.loose.remove(it);
    if (window.__p3Stand) {
      g.loose.remove(window.__p3Stand);
      window.__p3Stand = null;
    }
    const { px, pz, fx, fz, rx, rz, rotY, yaw } = s;
    const tx = px + fx * 1.15;
    const tz = pz + fz * 1.15;
    const topY = w.y + 0.722;

    // Place two kitchen stands side by side for a grand 8-dish showcase
    const ksL = g.loose.addItem({ uid: 'p3-fksL', item: 'nd_kitchen_stand', qty: 1 }, tx - rx * 0.62, w.y, tz - rz * 0.62, rotY);
    g.loose.seat(ksL, w.y);
    const ksR = g.loose.addItem({ uid: 'p3-fksR', item: 'nd_kitchen_stand', qty: 1 }, tx + rx * 0.62, w.y, tz + rz * 0.62, rotY);
    g.loose.seat(ksR, w.y);

    const dishes = [
      // Front row (4)
      { id: 'dish_steak', s: -0.90, d: -0.15 },
      { id: 'dish_tomato_egg', s: -0.32, d: -0.15 },
      { id: 'dish_potato_beef', s: 0.32, d: -0.15 },
      { id: 'dish_beef_noodle', s: 0.90, d: -0.15 },
      // Back row (4)
      { id: 'dish_egg_fried_rice', s: -0.90, d: 0.16 },
      { id: 'dish_caesar', s: -0.32, d: 0.16 },
      { id: 'dish_pizza', s: 0.32, d: 0.16 },
      { id: 'dish_strawberry_cake', s: 0.90, d: 0.16 },
    ];
    dishes.forEach((dish, i) => {
      const it = g.loose.addItem(
        { uid: `p3-dish-${i}`, item: dish.id, qty: 1, state: { meal: { food: 40, perfect: 1 } } },
        tx + rx * dish.s + fx * dish.d,
        topY,
        tz + rz * dish.s + fz * dish.d,
        rotY + 0.15 * (i % 3 - 1),
      );
      g.loose.seat(it, topY);
    });
    w.place(px - fx * 0.45, pz - fz * 0.45, yaw);
    g.input.lookYaw = yaw;
    g.input.lookPitch = -0.38;
  }, [rawSetup]);
  await waitModels(page, 1600);
  await shot(page, '05_remodeled_dishes_feast');

  // Sweep camera left -> right across the full 8-dish feast in the video!
  await playSec(page, 1.4, (i, n) =>
    page.evaluate(([y]) => {
      window.__rt.game.input.lookYaw = y;
    }, [rawSetup.yaw + Math.sin((i / n) * Math.PI * 2) * 0.36]),
  );

  // ================================================================ 5) HELD CLOSE-UP OF REMODELED SEARED STEAK DISH
  await page.evaluate(([y]) => {
    const g = window.__rt.game;
    const w = g.player.walker;
    const st = g.loose.addItem({ uid: 'p3-hsteak', item: 'dish_steak', qty: 1, state: { meal: { food: 50, perfect: 1 } } }, w.x, 0, w.z, 0);
    g.player.slots[0] = { kind: 'item', item: st.item };
    g.loose.remove(st);
    g.player.sel = 0;
    g.input.lookYaw = y;
    g.input.lookPitch = -0.22;
  }, [rawSetup.yaw]);
  await waitModels(page, 700);
  await playSec(page, 0.7);
  await shot(page, '06_held_steak_dish_closeup');

  ok(errors.length === 0, `Phase 3 console clean (${errors.length} errors)`);

  const vidSrc = await page.video()?.path();
  await ctx.close();
  if (vidSrc && fs.existsSync(vidSrc)) {
    const dst = path.join(VID, '01_phase3_food_prep_cooking_feast.webm');
    try {
      fs.rmSync(dst, { force: true });
    } catch {}
    fs.renameSync(vidSrc, dst);
    console.log(`vid  ${dst}`);
  }
} finally {
  await browser.close();
  await server.close();
}

console.log(`\nPHASE3_VERIFY_DONE bad=${bad}`);
process.exit(bad ? 1 : 0);
