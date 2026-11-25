// The fishing module in the game itself (docs/V3/plan/fishing.md), with the game's own keys:
//   look     at each water named (default the first): standing by its jetty with the rod in the hands
//   play     the first water: a rod with worms and a creel, a cast (the button held, let go), a fish sent to the float,
//            the strike, the fight walked left and right (A/D against its run, the button held while it lets one reel),
//            spent at one's feet a fresh press lands it; the fish swung onto the boards, its card under the mark, E: into the creel
//   SHOTS_GPU=1 node harness/shots/fishing.mjs <look|play> [spots, comma separated] [base url]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/fishing');
fs.mkdirSync(out, { recursive: true });
const mode = process.argv[2] || 'play';
const spots = (process.argv[3] || '0').split(',').map(Number);
let server = null;
let base = process.argv[4];
if (!base) ({ server, url: base } = await startServer());
const browser = await launchBrowser();
let bad = 0;
const ok = (cond, why) => {
  if (!cond) bad++;
  console.log(cond ? 'ok  ' : 'FAIL', why);
};

async function open(spot, hour = 9.5) {
  const { page, errors } = await openGame(browser, `${base}/modcar.html?shot=1&world=5&seed=20261113&fish=${spot}&time=${hour}&weather=clear`, { width: 1280, height: 720 });
  await page.evaluate(async () => {
    const rt = window.__rt;
    const g = rt.game;
    const M = await import('/src/game/modcar/v3/fishing/index.ts');
    window.__FISH = (await import('/src/core/v3/fishing/lite/fish.ts')).FISH;
    const RB = await import('/src/core/v3/fishing/lite/robot.ts');
    const sys = M.fishing;
    // a robot's hands on the game's own inputs (docs/V3/plan/fishing-fight.md): the left button for the reel, A/D held
    // in the game's key set for the rod pulled over, a fresh press to land the fish spent at one's feet
    const keys = g.input.keys;
    const fightHands = { hands: null, on: null, held: false, key: '' };
    const setKey = (k) => {
      if (k === fightHands.key) return;
      if (fightHands.key) keys.delete(fightHands.key);
      if (k) keys.add(k);
      fightHands.key = k;
    };
    const step = (s, f) => {
      const dt = 1 / 60;
      for (let t = 0; t < s - 1e-9; t += dt) {
        if (f) f(t);
        g.step(dt, 1);
      }
    };
    window.__f = {
      sys,
      step,
      tel: () => sys.telemetry(),
      player: () => g.player.telemetry(),
      walker: () => ({ x: g.player.walker.x, y: g.player.walker.y, z: g.player.walker.z, h: g.player.walker.heading }),
      look(yaw, pitch) {
        g.input.lookYaw = yaw;
        g.input.lookPitch = pitch;
        g.simulate(0);
      },
      /** the use button held for s seconds (the left button) */
      hold(s) {
        g.player.press('mouse');
        step(s);
        g.player.release('mouse');
        step(1 / 60);
      },
      tap() {
        g.player.press('mouse');
        step(1 / 60);
        g.player.release('mouse');
        step(1 / 60);
      },
      /** the fish lying about nearest one, if any */
      nearestFish() {
        const w = g.player.walker;
        let best = null;
        let bd = 1e9;
        for (const l of g.loose.list) {
          if (!l.item || !l.item.item.startsWith('fish_')) continue;
          const d = Math.hypot(l.x - w.x, l.z - w.z);
          if (d < bd) {
            bd = d;
            best = { x: l.x, y: l.y, z: l.z, d, item: l.item.item, state: l.item.state?.fish ?? null, resting: l.resting };
          }
        }
        return best;
      },
      render() {
        rt.render();
      },
      /** the fish on the line played for so long by a robot's hands (RB.USUAL, RB.EXPERT …) through the game's inputs */
      fight(secs, who = 'USUAL') {
        const s = sys.session;
        const fh = fightHands;
        let t = 0;
        const dt = 1 / 60;
        while (s && s.phase === 'fight' && t < secs) {
          if (fh.on !== s.fight) {
            fh.on = s.fight;
            fh.hands = RB.robotHands(7);
          }
          const h = RB.robotPlay(fh.hands, RB[who], s.fight, s.fightP, dt);
          setKey(h.steer > 0.3 ? 'KeyD' : h.steer < -0.3 ? 'KeyA' : '');
          if (h.land && s.fight.landable && !window.__noLand) {
            if (fh.held) {
              g.player.release('mouse');
              step(dt);
            }
            g.player.press('mouse');
            fh.held = true;
          } else if (h.reel !== fh.held && !(window.__noLand && h.reel && s.fight.landable)) {
            // (a fresh press at one's feet lands it: not while the pictures want it kept on the line)
            if (h.reel) g.player.press('mouse');
            else g.player.release('mouse');
            fh.held = h.reel;
          }
          step(dt);
          t += dt;
        }
        if (!s || s.phase !== 'fight') {
          setKey('');
          if (fh.held) g.player.release('mouse');
          fh.held = false;
        }
        return { t, phase: s?.phase, tension: s?.fight?.tension ?? 0 };
      },
    };
  });
  return { page, errors };
}

const shot = async (page, name) => {
  await page.evaluate(() => window.__f.render());
  await page.screenshot({ path: path.join(out, `${name}.png`) });
};

try {
  if (mode === 'look') {
    for (const s of spots) {
      const { page, errors } = await open(s);
      const t = await page.evaluate(() => {
        window.__f.step(5);
        return { tel: window.__f.tel(), w: window.__f.walker(), p: window.__f.player() };
      });
      console.log(`water ${s}:`, JSON.stringify(t.tel), JSON.stringify(t.w));
      ok(t.tel.spot === s, `at water ${s}`);
      await shot(page, `look_${s}`);
      ok(errors.length === 0, `no errors (${errors.slice(0, 2).join(' | ')})`);
      await page.close();
    }
  }
  if (mode === 'play') {
    const s = spots[0];
    const { page, errors } = await open(s);
    const a = await page.evaluate(() => {
      const f = window.__f;
      f.step(5);
      // face out over the water, a little down
      const st = f.sys.stand;
      f.look(Math.atan2(st.fz, st.fx), -0.12);
      f.step(0.5);
      // (fishing has no skill: whatever experience a save holds under its name stays as it is)
      return { tel: f.tel(), p: f.player(), w: f.walker(), xp: window.__rt.game.systems.harness('progress', 'xp', 'fishing') };
    });
    console.log('ready', JSON.stringify(a.tel), JSON.stringify(a.p).slice(0, 300));
    ok(a.tel.spot === s && a.tel.hook === 'worm', 'at the water with worms on the rod');
    await shot(page, 'play_0_ready');
    // the cast: the button held, the ring on the water, let go
    await page.evaluate(() => {
      const g = window.__rt.game;
      g.player.press('mouse');
      window.__f.step(0.55);
    });
    await shot(page, 'play_1_charge');
    const b = await page.evaluate(() => {
      const f = window.__f;
      window.__rt.game.player.release('mouse');
      f.step(1.4);
      return f.tel();
    });
    ok(b.phase === 'wait', `the float is out (${b.phase})`);
    await shot(page, 'play_2_wait');
    // a fish sent to the float; the bite, the strike
    const c = await page.evaluate(() => {
      const f = window.__f;
      const s = f.sys.session;
      let rushed = f.sys.rush();
      let t = 0;
      while (t < 25 && !(s.committed && s.committed.state === 'bite')) {
        f.step(0.05);
        t += 0.05;
        if (!s.committed && s.phase === 'wait') rushed = f.sys.rush() || rushed;
      }
      const bit = !!(s.committed && s.committed.state === 'bite');
      return { rushed, bit, t, phase: s.phase };
    });
    ok(c.bit, `a bite after ${c.t.toFixed(1)} s`);
    await shot(page, 'play_3_bite');
    // the fight, walked left and right by a usual hand on the game's own inputs — pictures as it runs with the rod
    // pulled over against it, and as it lies spent
    await page.evaluate(() => {
      const f = window.__f;
      f.step(0.15);
      f.tap();
      window.__fightFor = (secs) => f.fight(secs, 'USUAL');
      // (into its first run, which lasts 1.1 s at the least: the worms draw a common fish, and a steady one, worn down fast
      // on the willow, may make no other run before it is spent — docs/V3/plan/fishing-feel.md §10)
      window.__fightFor(0.6);
    });
    const runShot = await page.evaluate(() => {
      const f = window.__f;
      const s = f.sys.session;
      for (let i = 0; i < 600 && s.phase === 'fight' && !(s.fight.phase === 'run' && s.fight.tell <= 0 && Math.abs(f.sys.steer) > 0.7 && s.fight.turnT > 0.5); i++) window.__fightFor(1 / 60);
      return f.tel();
    });
    console.log('running', JSON.stringify(runShot));
    ok(runShot.phase === 'fight' && Math.sign(runShot.steer) === -Math.sign(runShot.dir), `the rod pulled over against its run (steer ${runShot.steer}, it swims ${runShot.dir > 0 ? 'right' : 'left'})`);
    ok(runShot.live, 'the fish seen fighting at the surface');
    await shot(page, 'play_3b_fight');
    const perf = await page.evaluate(() => {
      const g = window.__rt.game;
      const gl = g.core.renderer.getContext();
      const px = new Uint8Array(4);
      const times = [];
      g.systems.resetTimings();
      for (let i = 0; i < 90 && window.__f.sys.session.phase === 'fight'; i++) {
        const t0 = performance.now();
        window.__fightFor(1 / 60);
        window.__rt.render();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      const rep = g.systems.telemetry().fishing;
      const info = g.core.renderer.info.render;
      return { n: times.length, mean: times.reduce((a, b) => a + b, 0) / Math.max(1, times.length), p95: times[Math.floor(times.length * 0.95)] ?? 0, fishingMs: rep.ms.total, fishingMax: rep.max.total, calls: info.calls, tris: info.triangles };
    });
    console.log('perf during the fight', JSON.stringify(perf));
    // (spent: it rolls over on its side, the stamina bar empty and blinking, the time to wind it in)
    const spentShot = await page.evaluate(() => {
      const s = window.__f.sys.session;
      for (let i = 0; i < 4800 && s.phase === 'fight' && s.fight.phase !== 'spent'; i++) window.__fightFor(1 / 60);
      // (a moment for it to roll over)
      for (let i = 0; i < 25 && s.phase === 'fight' && s.fight.phase === 'spent' && !s.fight.landable; i++) window.__fightFor(1 / 60);
      // (the words over the hotbar are the frame before's: one more)
      if (s.phase === 'fight') window.__f.step(1 / 60);
      return window.__f.tel();
    });
    console.log('spent', JSON.stringify(spentShot));
    if (spentShot.phase === 'fight') await shot(page, 'play_3c_spent');
    const d = await page.evaluate(() => {
      const r = window.__fightFor(120);
      return { ...r, tel: window.__f.tel() };
    });
    console.log('fight', JSON.stringify(d));
    ok(d.phase !== 'fight', `the fight is over after ${d.t.toFixed(1)} s (${d.phase})`);
    // up out of the water and into the hands: the haul, then held up before the eye, flopping; its card beside it
    // (the frames of the landing, timed: the hands' shaders were made at the strike, not now)
    const landPerf = await page.evaluate(() => {
      const g = window.__rt.game;
      const gl = g.core.renderer.getContext();
      const px = new Uint8Array(4);
      const times = [];
      for (let i = 0; i < 15; i++) {
        const t0 = performance.now();
        window.__f.step(1 / 60);
        window.__rt.render();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        times.push(performance.now() - t0);
      }
      return { mean: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2), max: +Math.max(...times).toFixed(2) };
    });
    console.log('perf landing', JSON.stringify(landPerf));
    ok(landPerf.max < 40, `no hitch as it comes up out of the water (worst frame ${landPerf.max} ms)`);
    await shot(page, 'play_4_haul');
    const held = await page.evaluate(() => {
      const f = window.__f;
      f.step(0.75);
      return f.tel();
    });
    console.log('held', JSON.stringify(held));
    ok(held.held && held.holdPhase === 'hold' && held.phase === 'reveal', `the fish in the hands (${held.holdPhase}, ${held.phase})`);
    await shot(page, 'play_5_hold');
    // (a breath later, still flopping: the body bent another way)
    const bends = await page.evaluate(() => {
      const f = window.__f;
      const out = [];
      for (let i = 0; i < 12; i++) {
        f.step(0.1);
        out.push(f.tel().holdBend);
      }
      return out;
    });
    console.log('bends', JSON.stringify(bends));
    ok(Math.max(...bends) - Math.min(...bends) > 0.15, 'it flops: its body bends one way and the other');
    await page.evaluate(() => window.__f.step(0.37));
    await shot(page, 'play_5b_hold');
    // E: into the creel, the rod back in the hands
    const kept = await page.evaluate(() => {
      const f = window.__f;
      const g = window.__rt.game;
      g.player.press('key');
      f.step(1 / 60);
      g.player.release('key');
      f.step(0.4);
      const creel = g.player.slots.find((h) => h?.kind === 'item' && h.item.item === 'fishing_creel');
      return { tel: f.tel(), inCreel: creel?.item.inside?.filter((x) => x.item.startsWith('fish_')).length ?? 0, near: f.nearestFish(), xp: g.systems.harness('progress', 'xp', 'fishing') };
    });
    console.log('kept', JSON.stringify(kept));
    ok(!kept.tel.held && kept.tel.phase === 'idle' && kept.inCreel === 1, `E: into the creel (${kept.inCreel} in it), the rod back`);
    ok(kept.xp === a.xp, `no fishing experience for the catch (${a.xp} → ${kept.xp})`);
    await shot(page, 'play_6_kept');
    // another cast after the catch (the bug of 2026-11-23: a cast over with the button still down left the rod taking it
    // for down for good — no charge, no cast — once it was let go)
    const again = await page.evaluate(() => {
      const f = window.__f;
      const s = f.sys.session;
      const g = window.__rt.game;
      const st = f.sys.stand;
      f.look(Math.atan2(st.fz, st.fx), -0.12);
      f.step(0.3);
      g.player.press('mouse');
      f.step(0.5);
      const charged = s.phase;
      g.player.release('mouse');
      f.step(1.4);
      return { charged, after: s.phase };
    });
    ok(again.charged === 'charge' && again.after === 'wait', `a second cast after the catch (${again.charged} → ${again.after})`);
    ok(errors.length === 0, `no errors (${errors.slice(0, 3).join(' | ')})`);
    await page.close();
  }
  if (mode === 'mouse') {
    // the plain game (no screenshot mode) and the real mouse: a click for the pointer, a cast, a fish played with the
    // button held until it lands, let go only after it, and a second cast
    const { page, errors } = await openGame(browser, `${base}/?seed=20261113&fish=0`, { width: 1280, height: 720 });
    await page.waitForTimeout(9000);
    const st = () => page.evaluate(() => {
      const g = window.__rt.game;
      const M = g.systems.get('fishing');
      const s = M.session;
      return { phase: s?.phase, down: s?.held, bite: !!(s?.committed && s.committed.state === 'bite'), catches: M.log.stats.catches };
    });
    await page.mouse.click(640, 360);
    await page.waitForTimeout(500);
    await page.mouse.down();
    await page.waitForTimeout(500);
    const charging = await st();
    await page.mouse.up();
    await page.waitForTimeout(1500);
    ok(charging.phase === 'charge' && (await st()).phase === 'wait', 'the real left button held: a charge; let go: the float out');
    await page.evaluate(() => window.__rt.game.systems.get('fishing').rush());
    let s = await st();
    for (let i = 0; i < 250 && !s.bite && s.phase === 'wait'; i++) {
      await page.waitForTimeout(100);
      s = await st();
      if (!s.bite && i % 20 === 19) await page.evaluate(() => window.__rt.game.systems.get('fishing').rush());
    }
    // the strike, then the fight on the real keys and the real button: A/D against the way it swims, the button held
    // to reel while it lets one, let go when it pulls; spent at one's feet, a fresh press lands it
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.up();
    // (the mouse swiped sideways pulls the rod over, the view stays on the fish)
    const locked = await page.evaluate(() => window.__rt.game.input.locked);
    for (let i = 0; i < 8; i++) await page.mouse.move(640 + 30 * (i + 1), 360);
    await page.waitForTimeout(60);
    const swiped = await page.evaluate(() => window.__rt.game.systems.get('fishing').steer);
    for (let i = 0; i < 16; i++) await page.mouse.move(880 - 30 * (i + 1), 360);
    await page.waitForTimeout(60);
    const back = await page.evaluate(() => window.__rt.game.systems.get('fishing').steer);
    await page.mouse.move(640, 360);
    ok(!locked || (swiped > 0.5 && back < -0.5), `the mouse swiped right pulls the rod right, left pulls it left (pointer ${locked ? 'locked' : 'free: not tried'}; ${swiped.toFixed(2)}, ${back.toFixed(2)})`);
    let key = '';
    let down = false;
    for (let i = 0; i < 2500; i++) {
      await page.waitForTimeout(40);
      const f = await page.evaluate(() => {
        const s = window.__rt.game.systems.get('fishing').session;
        const x = s?.fight;
        return x ? { phase: s.phase, dir: x.dir, fp: x.phase, tell: x.tell, T: x.tension, land: x.landable } : { phase: s?.phase };
      });
      if (f.phase !== 'fight') break;
      const want = f.fp === 'dive' || f.fp === 'jump' || f.fp === 'spent' ? '' : f.dir > 0 ? 'KeyA' : 'KeyD';
      if (want !== key) {
        if (key) await page.keyboard.up(key);
        if (want) await page.keyboard.down(want);
        key = want;
      }
      if (f.land) {
        if (down) {
          await page.mouse.up();
          await page.waitForTimeout(40);
        }
        await page.mouse.down();
        down = true;
        continue;
      }
      const reel = f.fp === 'spent' || ((f.fp === 'swim' || f.fp === 'rest') && f.tell <= 0 && f.T < 0.7);
      if (reel !== down) {
        if (reel) await page.mouse.down();
        else await page.mouse.up();
        down = reel;
      }
    }
    if (key) await page.keyboard.up(key);
    s = await st();
    ok(s.catches === 1 && s.phase !== 'fight', `a fish walked and landed on the real keys and button (${s.phase}, ${s.catches})`);
    // up in the hands; a click puts it into the creel
    await page.waitForTimeout(1200);
    await page.mouse.up();
    await page.waitForTimeout(200);
    const inHands = await st();
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.up();
    await page.waitForTimeout(300);
    const kept = await st();
    ok(inHands.phase === 'reveal' && kept.phase === 'idle', `the fish in the hands, a click: into the creel (${inHands.phase} → ${kept.phase})`);
    await page.mouse.down();
    await page.waitForTimeout(500);
    const second = await st();
    await page.mouse.up();
    await page.waitForTimeout(1500);
    ok(second.phase === 'charge' && (await st()).phase === 'wait', `let go after it, held again: the second cast charges and goes out (${second.phase})`);
    ok(errors.length === 0, `no errors (${errors.slice(0, 3).join(' | ')})`);
    await page.close();
  }
  if (mode === 'hands') {
    // the hands' own uses: a fish in the hand put back into the water (G), a bait onto the rod (F), a small fish onto
    // the hook alive (F: fishing has no levels, so from the first catch), a drift bottle opened (F)
    const s = spots[0];
    const { page, errors } = await open(s);
    const r = await page.evaluate(async () => {
      const f = window.__f;
      const g = window.__rt.game;
      const IT = await import('/src/core/modcar/items.ts');
      const FI = await import('/src/core/v3/fishing/lite/items.ts');
      const sys = f.sys;
      f.step(5);
      const st = sys.stand;
      const out = {};
      const F = () => {
        g.rightButton = true;
        f.step(1 / 60);
        g.rightButton = false;
        f.step(0.1);
      };
      // a fish in the free hand: the creel set aside first
      g.player.slots[1] = null;
      const carp = IT.newItem('fish_crucian_carp', { state: { fish: { cm: 22, kg: 0.31, q: 0.4, v: 0, m: 1 } } });
      g.player.receive({ kind: 'item', item: carp });
      g.player.select(1);
      // (at the very end of the jetty, facing out: what is put down goes into the water)
      g.player.walker.place(st.x + st.fx * 0.2, st.z + st.fz * 0.2, Math.atan2(st.fz, st.fx), 0.5);
      f.look(Math.atan2(st.fz, st.fx), -0.6);
      f.step(0.3);
      out.held = f.player().held;
      const before = sys.log.stats.released;
      window.__rt.dropFor(1.2);
      f.step(1.5);
      out.released = sys.log.stats.released - before;
      out.after = f.player().slot2;
      {
        const W = await import('/src/game/modcar/v3/fishing/water.ts');
        const l = g.loose.list.filter((x) => x.item?.item === 'fish_crucian_carp').pop();
        const w = f.walker();
        out.put = l ? { x: l.x - w.x, z: l.z - w.z, y: l.y, wy: w.y, level: W.waterLevel(g.world, l.x, l.z), depth: W.waterDepth(g.world, l.x, l.z), resting: l.resting } : null;
      }
      // a bait onto the rod: shrimp in the hand, F
      g.player.receive({ kind: 'item', item: IT.newItem('bait_shrimp', { n: 20 }) });
      g.player.select(1);
      f.step(0.1);
      F();
      const rod = g.player.slots[0].item;
      out.rodBait = rod.inside?.map((x) => `${x.item}x${x.n ?? 1}`).join(',');
      out.handAfterBait = f.player().slot2;
      out.sel = g.player.sel;
      // a small fish onto the hook alive
      g.player.slots[1] = null;
      g.player.receive({ kind: 'item', item: IT.newItem('fish_bleak', { state: { fish: { cm: 11, kg: 0.012, q: 0.3, v: 0, m: 0 } } }) });
      g.player.select(1);
      f.step(0.1);
      F();
      out.live = rod.state?.rod?.live?.f ?? null;
      out.hook = sys.telemetry().hook;
      // a drift bottle opened
      g.player.slots[1] = null;
      g.player.receive({ kind: 'item', item: { ...IT.newItem(FI.BOTTLE), state: { bottle: { s: 0 } } } });
      g.player.select(1);
      f.step(0.1);
      F();
      out.bottle = f.player().slot2;
      out.clues = sys.log.clues.slice();
      // a bare rod cast takes up a bait carried by itself (docs/V3/plan/fishing-feel.md §10): the rod emptied, squid
      // strips in the other hand (put there, not picked up: picked up they would go onto the rod by themselves), the
      // button pressed
      if (rod.state?.rod) delete rod.state.rod.live;
      rod.inside = [];
      g.player.slots[1] = { kind: 'item', item: IT.newItem('bait_squid_strip', { n: 12 }) };
      g.player.select(0);
      f.look(Math.atan2(st.fz, st.fx), -0.12);
      f.step(0.3);
      out.bareKeys = sys.telemetry().hook;
      g.player.press('mouse');
      f.step(0.3);
      out.autoBait = rod.inside?.map((x) => `${x.item}x${x.n ?? 1}`).join(',') ?? '';
      out.autoPhase = sys.session.phase;
      out.autoHand = f.player().slot2;
      g.player.release('mouse');
      f.step(1.5);
      out.lastBait = sys.log.lastBait;
      return out;
    });
    console.log(JSON.stringify(r));
    ok(r.held === 'item:fish_crucian_carp', 'a crucian carp in the hand');
    ok(r.released === 1, 'G looking at the water: put back');
    ok(r.rodBait === 'bait_shrimpx20' && /bait_worm/.test(r.handAfterBait) && r.sel === 0, 'F: the shrimp onto the rod, the worms back in the hand, the rod in the hands');
    ok(r.live === 'bleak' && r.hook === 'live:bleak', 'F: the bleak onto the hook alive');
    ok(r.clues.includes('old_pond_lord'), 'F: the bottle read (the lord\'s habits)');
    ok(r.bareKeys === '' && r.autoBait === 'bait_squid_stripx12' && r.autoHand === '' && r.autoPhase === 'charge' && r.lastBait === 'squid_strip', `a bare rod cast: the squid strips carried go on by themselves and the cast goes out (${r.autoBait}, ${r.autoPhase}, last ${r.lastBait})`);
    await shot(page, 'hands_bottle');
    ok(errors.length === 0, `no errors (${errors.slice(0, 3).join(' | ')})`);
    await page.close();
  }
  if (mode === 'lord' || mode === 'sky') {
    // a water's lord on its live fish at its hour, with the next rod; or its sky fish on the star bait in its moment
    const s = spots[0];
    const lordMode = mode === 'lord';
    const { page, errors } = await open(s, lordMode ? 17.4 : 16.2);
    const r = await page.evaluate(async (lordMode) => {
      const f = window.__f;
      const g = window.__rt.game;
      const IT = await import('/src/core/modcar/items.ts');
      const W = await import('/src/game/modcar/v3/fishing/water.ts');
      const SE = await import('/src/core/v3/fishing/lite/session.ts');
      const FS = await import('/src/core/v3/fishing/lite/fish.ts');
      const RB = await import('/src/core/v3/fishing/lite/robot.ts');
      const sys = f.sys;
      f.step(5);
      const pond = sys.ponds.get(sys.spot);
      const out = { spot: sys.spot };
      // the rod for it into the hands: for a lord the rod above its step of the ladder (gear.ts homePower), for a sky
      // fish the pro
      const G = await import('/src/core/v3/fishing/lite/gear.ts');
      const up = G.RODS.filter((x) => x.shop >= 0 && x.power > 1.3 * G.homePower(sys.spot)).sort((a, b) => a.power - b.power)[0] ?? G.RODS[G.REC_ROD[3]];
      g.player.slots[0] = null;
      const rod = IT.newItem(lordMode ? up.id : 'rod_pro');
      if (lordMode) rod.state = { rod: { live: { f: 'bleak', cm: 11, kg: 0.012, q: 0.3, v: 0 } } };
      else IT.putInside(rod, IT.newItem('bait_stardust', { n: 5 }), 0);
      g.player.slots[0] = { kind: 'item', item: rod };
      g.player.select(0);
      if (!lordMode) sys.forceMoment(sys.ctx, 60);
      f.step(1);
      const who = () => pond.fish.find((x) => (lordMode ? x.uid % 1000 === 900 : x.guest === 'sky'));
      const target = who();
      out.found = !!target;
      out.moment = sys.telemetry().moment;
      if (!target) return out;
      out.kind = FS.FISH[target.f].id;
      const st = sys.stand;
      const tries = [];
      for (let k = 0; k < 6; k++) {
        const t = who();
        if (!t) break;
        // aim a little short of it, so the splash does not scare it
        const ses = sys.session;
        const ax = ses.angler.x;
        const az = ses.angler.z;
        const dx = t.x - ax;
        const dz = t.z - az;
        const d = Math.max(3, Math.hypot(dx, dz) - 2.2);
        const at = W.toWorld(st, ax + (dx / Math.hypot(dx, dz)) * d, az + (dz / Math.hypot(dx, dz)) * d, { x: 0, z: 0 });
        const w = g.player.walker;
        f.look(Math.atan2(at.z - w.z, at.x - w.x), -0.15);
        const charge = Math.max(0.02, Math.min(1, (d - 2.5) / (sys.rig.rod.cast - 2.5)));
        g.player.press('mouse');
        f.step(charge);
        g.player.release('mouse');
        let tt = 0;
        f.step(0.05);
        while ((ses.phase === 'flight' || ses.phase === 'wait') && tt < 60 && !(ses.committed && ses.committed.state === 'bite')) {
          f.step(0.05);
          tt += 0.05;
        }
        const biter = ses.committed?.uid ?? -1;
        if (!(ses.committed && ses.committed.state === 'bite')) {
          tries.push(`no bite in ${tt.toFixed(1)} s`);
          f.hold(0.6);
          f.step(1);
          continue;
        }
        f.step(0.12);
        f.tap();
        const fr = f.fight(240, 'EXPERT');
        const ft = fr.t;
        tries.push(`bite by ${biter % 1000} after ${tt.toFixed(1)} s, fight ${ft.toFixed(1)} s`);
        f.step(1.4);
        // (landed: up in the hands, flopping)
        const tel = f.tel();
        if (tel.held && tel.heldKind === out.kind) {
          out.landed = { kind: tel.heldKind, phase: tel.holdPhase };
          break;
        }
        f.step(1);
      }
      out.tries = tries;
      return out;
    }, lordMode);
    console.log(JSON.stringify(r));
    ok(r.found, lordMode ? 'the lord is in the pond today' : `the sky fish came with the moment (${r.moment})`);
    ok(!!r.landed, `${r.kind} landed`);
    await shot(page, `${mode}_${s}_landed`);
    if (r.landed) {
      // (a moment later, flopping still, its card beside it)
      await page.evaluate(() => window.__f.step(0.45));
      await shot(page, `${mode}_${s}_card`);
    }
    ok(errors.length === 0, `no errors (${errors.slice(0, 3).join(' | ')})`);
    await page.close();
  }
  if (mode === 'lure') {
    // a lure wound in at an even pace on the game's own button: a hunter follows it (its shadow behind it), strikes,
    // held through the strike the hook is set (fishing-fight.md §5)
    const { page, errors } = await open(0, 18.2);
    const r = await page.evaluate(async () => {
      const f = window.__f;
      const g = window.__rt.game;
      const IT = await import('/src/core/modcar/items.ts');
      f.step(5);
      const sys = f.sys;
      const rod = g.player.held.item;
      rod.inside = [IT.newItem('bait_spoon')];
      const st = sys.stand;
      f.look(Math.atan2(st.fz, st.fx), -0.12);
      f.step(0.4);
      const s = sys.session;
      const out = { tries: [] };
      for (let k = 0; k < 6 && !out.hooked; k++) {
        g.player.press('mouse');
        f.step(0.9);
        g.player.release('mouse');
        f.step(1.2);
        let t = 0;
        let followShot = false;
        let down = false;
        while (s.phase === 'wait' && t < 30) {
          const biting = s.committed?.state === 'bite';
          const want = biting || t % 1.25 < 0.85;
          if (want !== down) {
            if (want) g.player.press('mouse');
            else g.player.release('mouse');
            down = want;
          }
          f.step(1 / 30);
          t += 1 / 30;
          if (!followShot && s.committed?.state === 'follow' && s.follow.t > 0.6) {
            followShot = true;
            out.follow = { t, tel: f.tel() };
            return { ...out, at: 'follow' };
          }
        }
        if (down) g.player.release('mouse');
        out.tries.push(`${s.phase} after ${t.toFixed(1)} s`);
        f.step(1);
      }
      return out;
    });
    console.log('lure', JSON.stringify(r).slice(0, 400));
    ok(r.at === 'follow', 'a hunter follows the lure as it is wound in');
    if (r.at === 'follow') {
      await shot(page, 'lure_1_follow');
      const h = await page.evaluate(() => {
        const f = window.__f;
        const g = window.__rt.game;
        const s = f.sys.session;
        let t = 0;
        let down = g.player.primary;
        while (s.phase === 'wait' && t < 20) {
          const want = s.committed?.state === 'bite' || t % 1.25 < 0.85;
          if (want !== down) {
            if (want) g.player.press('mouse');
            else g.player.release('mouse');
            down = want;
          }
          f.step(1 / 30);
          t += 1 / 30;
        }
        return { phase: s.phase, tel: f.tel() };
      });
      console.log('struck', JSON.stringify(h).slice(0, 300));
      ok(h.phase === 'fight', `it strikes and, held through, the hook is set (${h.phase})`);
      await page.evaluate(() => window.__f.fight(0.6, 'USUAL'));
      await shot(page, 'lure_2_fight');
    }
    ok(errors.length === 0, `no errors (${errors.slice(0, 3).join(' | ')})`);
    await page.close();
  }
  if (mode === 'trophy') {
    // every kind of body held up in the hands, flopping (fishing-fight.md §6): a small fish, a carp, a catfish, an eel,
    // a lord, a crayfish, a golden koi — two moments of each
    const { page, errors } = await open(0);
    await page.evaluate(() => {
      const f = window.__f;
      f.step(5);
      const st = f.sys.stand;
      f.look(Math.atan2(st.fz, st.fx), -0.12);
      f.step(0.4);
    });
    const kinds = (process.argv[5] || 'bleak:13,crucian_carp:26,catfish:85,eel:80,old_pond_lord:128,crayfish:12,koi:70:4').split(',');
    for (const k of kinds) {
      const [id, cm, v] = k.split(':');
      const r = await page.evaluate(({ id, cm, v }) => {
        const f = window.__f;
        const ok = f.sys.holdUp(window.__rt.game, id, Number(cm), Number(v || 0));
        f.step(0.95);
        return { ok, tel: f.tel() };
      }, { id, cm, v });
      ok(r.ok && r.tel.holdPhase === 'hold', `${id} held up (${r.tel.holdPhase})`);
      await shot(page, `trophy_${id}_a`);
      // (what it costs a frame, flopping in the hands)
      const perf = await page.evaluate(() => {
        const g = window.__rt.game;
        const gl = g.core.renderer.getContext();
        const px = new Uint8Array(4);
        const times = [];
        g.systems.resetTimings();
        for (let i = 0; i < 60; i++) {
          const t0 = performance.now();
          window.__f.step(1 / 60);
          window.__rt.render();
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          times.push(performance.now() - t0);
        }
        const rep = g.systems.telemetry().fishing;
        return { mean: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2), first: times.slice(0, 8).map((t) => Math.round(t)), fishingMs: +rep.ms.total.toFixed(3), fishingMax: +rep.max.total.toFixed(3) };
      });
      console.log(`perf holding ${id}`, JSON.stringify(perf));
      await page.evaluate(() => window.__f.step(0.33));
      await shot(page, `trophy_${id}_b`);
    }
    // G held: back into the water ahead
    const rel = await page.evaluate(() => {
      const f = window.__f;
      const g = window.__rt.game;
      const before = f.sys.log.stats.released;
      const keys = g.input.keys;
      keys.add('KeyG');
      f.step(0.75);
      keys.delete('KeyG');
      f.step(0.6);
      return { released: f.sys.log.stats.released - before, tel: f.tel(), held: g.player.telemetry().held };
    });
    console.log('release', JSON.stringify(rel));
    ok(rel.released === 1 && !rel.tel.held && rel.held === 'item:rod_willow', `G held: back into the water, the rod still in the hands (${rel.held})`);
    ok(errors.length === 0, `no errors (${errors.slice(0, 3).join(' | ')})`);
    await page.close();
  }
  if (mode === 'film') {
    // the fight filmed: the biggest fish about struck and played to the end by a robot's hands, a picture every eighth
    // of a second (as the reference's frames are taken), to be laid in strips beside DREADMOOR's (docs/V3/plan/fishing-feel.md §7)
    // (loop/shots/fishing/film_<tag>_NNN; node harness/shots/fishing.mjs film 0 "" <tag> [seconds] [robot])
    const tag = process.argv[5] || 'now';
    const secs = Number(process.argv[6]) || 30;
    const who = process.argv[7] || 'USUAL';
    // ('rare': the rarest fish of the water below its lord brought to the float, for a long fight; a full cast)
    const rare = process.argv[8] === 'rare';
    const { page, errors } = await open(spots[0], Number(process.env.FEEL_HOUR) || 9.5);
    const hooked = await page.evaluate((rare) => {
      const f = window.__f;
      const g = window.__rt.game;
      f.step(5);
      const st = f.sys.stand;
      f.look(Math.atan2(st.fz, st.fx), -0.12);
      f.step(0.5);
      g.player.press('mouse');
      f.step(rare ? 1.2 : 0.55);
      g.player.release('mouse');
      f.step(1.4);
      const s = f.sys.session;
      const rushBig = () => {
        const pond = f.sys.pond;
        if (!pond || s.phase !== 'wait' || s.committed) return;
        const FISH = window.__FISH;
        const big = rare
          ? pond.fish.filter((p) => p.state === 'roam' && FISH[p.f].tier < 4).sort((a, b) => FISH[b.f].tier - FISH[a.f].tier || b.cm - a.cm)[0]
          : pond.fish.filter((p) => p.state === 'roam' && Math.hypot(p.x - s.float.x, p.z - s.float.z) < 30).sort((a, b) => b.cm - a.cm)[0];
        if (!big) return void f.sys.rush();
        if (rare) Object.assign(big, { x: s.float.x + 1.5, z: s.float.z + 1.5 });
        Object.assign(big, { state: 'come', t: 0, shy: 0, nibbles: 0 });
        s.committed = big;
      };
      let t = 0;
      rushBig();
      while (t < 25 && !(s.committed && s.committed.state === 'bite')) {
        f.step(0.05);
        t += 0.05;
        if (!s.committed && s.phase === 'wait') rushBig();
      }
      f.step(0.15);
      f.tap();
      f.step(0.02);
      return { ...f.tel(), cm: s.hooked?.cm, ratio: s.ratio, kind: s.hooked ? window.__FISH[s.hooked.f].id : '' };
    }, rare);
    console.log('hooked', JSON.stringify(hooked));
    ok(hooked.phase === 'fight', `a fish on (${hooked.phase})`);
    const log = [];
    let after = -1;
    for (let i = 0; i < secs * 8 && after < 32; i++) {
      const at = await page.evaluate((who) => {
        const f = window.__f;
        const s = f.sys.session;
        if (s.phase === 'fight') f.fight(0.125, who);
        else f.step(0.125);
        const ft = s.fight;
        return { phase: s.phase, fish: ft?.phase, dist: ft ? +ft.dist.toFixed(1) : 0, stamina: ft ? +ft.stamina.toFixed(2) : 0, tension: ft ? +ft.tension.toFixed(2) : 0, dir: ft?.dir, side: ft ? +ft.side.toFixed(2) : 0 };
      }, who);
      log.push(at);
      await shot(page, `film_${tag}_${String(i).padStart(3, '0')}`);
      // (the catch filmed for four seconds after the fight is over)
      if (at.phase !== 'fight' || after >= 0) after++;
    }
    fs.writeFileSync(path.join(out, `film_${tag}.json`), JSON.stringify(log));
    console.log('frames', log.length, 'end', JSON.stringify(log[log.length - 1]));
    ok(errors.length === 0, `no errors (${errors.slice(0, 3).join(' | ')})`);
    await page.close();
  }
  if (mode === 'feel') {
    // the moments of docs/V3/plan/fishing-feel.md §5, each to be laid beside its frame of DREADMOOR: the strike, the rod
    // pulled over against a run one way and the other, a turn, a leap, the fish near, and the catch up out of the water
    // (loop/shots/fishing/feel_<tag>_*; node harness/shots/fishing.mjs feel 0 "" <tag>)
    const tag = process.argv[5] || 'now';
    // (FEEL_HOUR=21: the same moments at night)
    const { page, errors } = await open(spots[0], Number(process.env.FEEL_HOUR) || 9.5);
    const pic = (name) => shot(page, `feel_${tag}_${name}`);
    const hooked = await page.evaluate(() => {
      const f = window.__f;
      const g = window.__rt.game;
      f.step(5);
      const st = f.sys.stand;
      f.look(Math.atan2(st.fz, st.fx), -0.12);
      f.step(0.5);
      g.player.press('mouse');
      f.step(0.55);
      g.player.release('mouse');
      f.step(1.4);
      const s = f.sys.session;
      // (the biggest fish about sent to the float, for a fight worth the pictures)
      const rushBig = () => {
        const pond = f.sys.pond;
        if (!pond || s.phase !== 'wait' || s.committed) return;
        const big = pond.fish.filter((p) => p.state === 'roam' && Math.hypot(p.x - s.float.x, p.z - s.float.z) < 30).sort((a, b) => b.cm - a.cm)[0];
        if (!big) return void f.sys.rush();
        Object.assign(big, { state: 'come', t: 0, shy: 0, nibbles: 0 });
        s.committed = big;
      };
      let t = 0;
      rushBig();
      while (t < 25 && !(s.committed && s.committed.state === 'bite')) {
        f.step(0.05);
        t += 0.05;
        if (!s.committed && s.phase === 'wait') rushBig();
      }
      f.step(0.15);
      f.tap();
      f.step(0.06);
      window.__noLand = true;
      window.__fightFor = (secs) => f.fight(secs, 'USUAL');
      return { ...f.tel(), cm: s.hooked?.cm };
    });
    console.log('hooked', JSON.stringify(hooked));
    ok(hooked.phase === 'fight', `a fish on (${hooked.phase})`);
    await pic('0_hook');
    // (the robot plays it until the moment wanted comes, or the fight is over)
    const until = (cond, secs) =>
      page.evaluate(
        ({ cond, secs }) => {
          const s = window.__f.sys.session;
          const sys = window.__f.sys;
          const test = new Function('s', 'sys', `return ${cond}`);
          for (let i = 0; i < secs * 60 && s.phase === 'fight'; i++) {
            if (s.fight && test(s, sys)) return { ok: true, tel: window.__f.tel() };
            window.__fightFor(1 / 60);
          }
          return { ok: false, tel: window.__f.tel() };
        },
        { cond, secs },
      );
    // (the rod pulled hard over against a run held this way, the line strained: the key held, the fish kept to its run)
    const pose = (key, dir) =>
      page.evaluate(
        ({ key, dir }) => {
          const f = window.__f;
          const g = window.__rt.game;
          const s = f.sys.session;
          if (s.phase !== 'fight') return null;
          g.input.keys.add(key);
          for (let i = 0; i < 45; i++) {
            Object.assign(s.fight, { dir, phase: 'run', phaseT: 1, tension: 0.84, turnT: 1, tell: 0 });
            f.step(1 / 60);
          }
          g.input.keys.delete(key);
          return f.tel();
        },
        { key, dir },
      );
    const left = await pose('KeyA', 1);
    console.log('left', JSON.stringify(left));
    if (left) await pic('1_left');
    const right = await pose('KeyD', -1);
    console.log('right', JSON.stringify(right));
    if (right) await pic('2_right');
    const turn = await until('s.fight.turnT > 0.06 && s.fight.turnT < 0.12 && s.fight.phase !== "spent"', 25);
    console.log('turn', JSON.stringify(turn.tel));
    if (turn.ok) await pic('3_turn');
    // a leap, made to come now (its splash, its sound, the body out of the water: the system's own 'phase' event)
    const leapt = await page.evaluate(() => {
      const f = window.__f;
      const s = f.sys.session;
      if (s.phase !== 'fight' || !f.sys.live) return false;
      f.sys.onEvent(window.__rt.game, { type: 'phase', phase: 'jump' });
      for (let i = 0; i < 20; i++) window.__fightFor(1 / 60);
      return !!f.sys.live && f.sys.live.jumpT > 0;
    });
    if (leapt) await pic('4_leap');
    const near = await until('s.fight.landable', 150);
    console.log('near', JSON.stringify(near.tel));
    if (near.ok) await pic('5_near');
    // landed: up out of the water and into the hand
    const landed = await page.evaluate(() => {
      const f = window.__f;
      const s = f.sys.session;
      window.__noLand = false;
      if (s.phase !== 'fight' || !s.fight.landable) return null;
      const g = window.__rt.game;
      g.player.release('mouse');
      f.step(1 / 60);
      g.player.press('mouse');
      f.step(1 / 60);
      g.player.release('mouse');
      f.step(0.1);
      return f.tel();
    });
    console.log('landed', JSON.stringify(landed));
    ok(!!landed && landed.held, 'landed into the hands');
    if (landed) {
      await pic('6_haul');
      for (const [name, secs] of [['7_catch', 0.3], ['8_hold', 0.55], ['9_hold', 0.45], ['10_hold', 0.7]]) {
        await page.evaluate((secs) => window.__f.step(secs), secs);
        await pic(name);
      }
    }
    ok(errors.length === 0, `no errors (${errors.slice(0, 3).join(' | ')})`);
    await page.close();
  }
  if (mode === 'wild') {
    // a lake that is none of the ten: stood on its shore with the kit, the water in front of one is a wild water stocked
    // with the fish of the ten's most like it — cast, a bite, a fish
    const { page, errors } = await open(0);
    const r = await page.evaluate(async () => {
      const f = window.__f;
      const g = window.__rt.game;
      const SP = await import('/src/core/v3/fishing/lite/spots.ts');
      const W = await import('/src/game/modcar/v3/fishing/water.ts');
      const sys = f.sys;
      f.step(5);
      const ours = new Set(SP.SPOTS.map((s) => s.slot));
      const world = g.world;
      let lake = null;
      for (let k = 20; k < 260 && !lake; k++) {
        const ft = world.water.feature(k);
        if (ft && ft.kind === 'lake' && ![k - 1, k, k + 1].some((j) => ours.has(j)) && ft.depth > 2.5) lake = ft;
      }
      if (!lake) return { lake: null };
      // a steep bit of its shore: from the middle out in eight ways until the water ends, the one deepest 10 m back in
      let best = null;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const ux = Math.cos(a);
        const uz = Math.sin(a);
        let d = 0;
        while (d < Math.max(lake.a, lake.b) * 2 && W.waterDepth(world, lake.cx + ux * d, lake.cz + uz * d) > 0) d += 1;
        const deep = W.waterDepth(world, lake.cx + ux * (d - 10), lake.cz + uz * (d - 10));
        if (!best || deep > best.deep) best = { ux, uz, d, deep };
      }
      const x = lake.cx + best.ux * (best.d + 1.5);
      const z = lake.cz + best.uz * (best.d + 1.5);
      const h = Math.atan2(-best.uz, -best.ux);
      sys.ctx.teleportTo(x, z, -h, false);
      f.step(4);
      f.look(h, -0.1);
      f.step(1.2);
      const tel = sys.telemetry();
      const ses = sys.session;
      if (!ses || !sys.pond) return { lake: { slot: lake.slot, a: lake.a, b: lake.b }, tel };
      // at the nearest fish of it, a little short
      const fish = sys.pond.fish.slice().sort((p, q) => Math.hypot(p.x - ses.angler.x, p.z - ses.angler.z) - Math.hypot(q.x - ses.angler.x, q.z - ses.angler.z))[0];
      const dx = fish.x - ses.angler.x;
      const dz = fish.z - ses.angler.z;
      const dd = Math.max(3, Math.hypot(dx, dz) - 1.8);
      const at = W.toWorld(sys.stand, ses.angler.x + (dx / Math.hypot(dx, dz)) * dd, ses.angler.z + (dz / Math.hypot(dx, dz)) * dd, { x: 0, z: 0 });
      const w = g.player.walker;
      f.look(Math.atan2(at.z - w.z, at.x - w.x), -0.1);
      f.step(0.2);
      g.player.press('mouse');
      f.step(Math.max(0.02, Math.min(1, (dd - 2.5) / (sys.rig.rod.cast - 2.5))));
      g.player.release('mouse');
      f.step(1.6);
      let t = 0;
      if (ses.phase === 'wait') sys.rush();
      while (ses.phase === 'wait' && t < 30 && !(ses.committed && ses.committed.state === 'bite')) {
        f.step(0.05);
        t += 0.05;
        if (!ses.committed) sys.rush();
      }
      const bit = !!(ses.committed && ses.committed.state === 'bite');
      return { lake: { slot: lake.slot, a: Math.round(lake.a), b: Math.round(lake.b), depth: lake.depth }, tel, phase: ses.phase, bit, t };
    });
    console.log(JSON.stringify(r));
    ok(!!r.lake, 'a lake none of the ten');
    ok(r.tel && r.tel.wild >= 0 && r.tel.fish > 0, `a wild water with fish (${r.tel?.water}, ${r.tel?.fish})`);
    ok(r.bit, `a bite there (${r.phase}, ${r.t?.toFixed?.(1)} s)`);
    await shot(page, 'wild');
    ok(errors.length === 0, `no errors (${errors.slice(0, 3).join(' | ')})`);
    await page.close();
  }
} finally {
  await browser.close();
  if (server) await server.close();
}
console.log(bad ? `${bad} FAILED` : 'all ok');
process.exit(bad ? 1 : 0);
