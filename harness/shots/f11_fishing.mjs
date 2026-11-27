// F11 (docs/V3/plan/finish.md §九), in the game — fishing in the journey:
//  - a shovel in the hands, its strokes into the bank of a water: worms turn up, lying where it went in (a stack of a
//    few a stroke, most strokes), and are bait as any; the same strokes into ground far from any water turn up none;
//  - the journal is a page of the Tab screen: every fish by its rarity, one never caught as ？？？ with its water, one
//    caught by its name with how many, the longest and its medal; the wheel goes down the list.
//   SHOTS_GPU=1 node harness/shots/f11_fishing.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/f11_fishing');
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
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=20261113&fish=0&time=9.5&weather=clear`, { width: 1280, height: 720 });
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
    console.log('shot', f);
  };
  await page.evaluate(async () => {
    const g = window.__rt.game;
    for (let i = 0; i < 400 && g.place !== 'road'; i++) {
      g.simulate(0.05);
      await new Promise((r) => setTimeout(r, 10));
    }
    g.simulate(1.5);
    // (brought to the water by ?fish=: stood by its jetty a moment after arriving — until then one is put back there)
    const sys = g.systems.get('fishing');
    for (let i = 0; i < 300 && sys.settleT > 0; i++) g.simulate(0.05);
    g.simulate(0.5);
  });
  // two places to dig: the bank (dry ground, water within 3 m of it) and ground with no water within 25 m
  const spots = await page.evaluate(async () => {
    const g = window.__rt.game;
    const W = await import('/src/game/modcar/v3/fishing/water.ts');
    const w = g.player.walker;
    const world = g.world;
    const wet = (x, z) => W.waterDepth(world, x, z) > 0.05;
    const free = (x, z) => {
      const gy = world.heightAt(x, z);
      return !world.sites.coverAt(x, gy + 0.5, z) && g.loose.surfaceAt(x, z, gy + 1) <= gy + 0.05;
    };
    const near = (x, z, r) => {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        if (wet(x + Math.cos(a) * r, z + Math.sin(a) * r)) return true;
      }
      return false;
    };
    let bank = null;
    let dry = null;
    for (let r = 2; r <= 120 && !(bank && dry); r += 2) {
      for (let k = 0; k < 36 && !(bank && dry); k++) {
        const a = (k / 36) * Math.PI * 2;
        const x = w.x + Math.cos(a) * r;
        const z = w.z + Math.sin(a) * r;
        if (W.waterDepth(world, x, z) > 0.001 || !free(x, z)) continue;
        // (ground one can stand on beside it too: a metre and a third back from the point, away from the water)
        if (!bank && near(x, z, 3) && !wet(x, z)) {
          for (let j = 0; j < 12 && !bank; j++) {
            const from = (j / 12) * Math.PI * 2;
            const sx = x + Math.cos(from) * 1.35;
            const sz = z + Math.sin(from) * 1.35;
            if (!wet(sx, sz) && free(sx, sz) && Math.abs(world.heightAt(sx, sz) - world.heightAt(x, z)) < 0.5) bank = { x, z, y: world.heightAt(x, z), from };
          }
        }
        if (!dry && r > 30 && !near(x, z, 8) && !near(x, z, 16) && !near(x, z, 25)) dry = { x, z, y: world.heightAt(x, z), from: a };
      }
    }
    return { bank, dry };
  });
  if (!spots.bank || !spots.dry) fail(`no place to dig found (${JSON.stringify(spots)})`);
  else {
    const digAt = (at, strokes) =>
      page.evaluate(
        async ({ at, strokes }) => {
          const g = window.__rt.game;
          window.__rt.hold('item:nd_shovel');
          // (stood a metre and a third from the point, the mark on it: the hand's own aim)
          window.__rt.aimPoint(at.x, at.y, at.z, at.from, 1.35);
          g.simulate(0.2);
          const said = [];
          let done = 0;
          for (let i = 0; i < strokes; i++) {
            const before = g.systems.get('nd-dig').strokes;
            g.player.press('mouse');
            g.step(1 / 60, 1);
            g.player.release('mouse');
            for (let k = 0; k < 50; k++) g.step(1 / 60, 1);
            if (g.systems.get('nd-dig').strokes > before) done++;
            else if (i === 0) {
              const t = document.body.innerText;
              for (const why of ['这里挖不了', '路面挖不动', '屋里挖不了', '对着脚边的土']) if (t.includes(why)) said.push(why);
              said.push('held ' + (g.player.held?.kind === 'item' ? g.player.held.item.item : String(g.player.held?.kind)), 'place ' + g.place, 'pitch ' + g.input.lookPitch.toFixed(2), 'eye ' + [g.player.eye.x, g.player.eye.y, g.player.eye.z].map((v) => v.toFixed(1)).join(','), 'ground ' + g.world.heightAt(at.x, at.z).toFixed(2));
            }
          }
          g.simulate(0.8);
          const worms = g.loose.list.filter((l) => l.item?.item === 'bait_worm' && Math.hypot(l.x - at.x, l.z - at.z) < 3);
          return { done, stacks: worms.length, worms: worms.reduce((n, l) => n + (l.item.n ?? 1), 0), resting: worms.every((l) => l.resting), said, text: document.body.innerText.includes('土里翻出了蚯蚓') };
        },
        { at, strokes },
      );
    const bank = await digAt(spots.bank, 12);
    ok(bank.done >= 10 && bank.stacks >= 3 && bank.worms >= 6 && bank.resting, `a shovel's strokes into the bank of the water (${bank.done} of 12 went in): worms turned up — ${bank.stacks} little heaps, ${bank.worms} worms, lying there (${JSON.stringify(bank)})`);
    await shot('01_worms_on_the_bank.png');
    // one heap taken up: bait, as any
    const taken = await page.evaluate(async () => {
      const g = window.__rt.game;
      const F = await import('/src/core/v3/fishing/lite/items.ts');
      const l = g.loose.list.find((x) => x.item?.item === 'bait_worm');
      g.player.slots[0] = null;
      g.player.slots[1] = null;
      g.player.sel = 0;
      const got = g.player.takeLoose(l);
      g.simulate(0.3);
      const h = g.player.held;
      return { got, held: h?.kind === 'item' ? h.item.item : null, bait: h?.kind === 'item' ? F.baitOfItem(h.item.item) : -1, n: h?.kind === 'item' ? (h.item.n ?? 1) : 0 };
    });
    ok(taken.got && taken.held === 'bait_worm' && taken.bait >= 0 && taken.n >= 2, `a heap taken up: worms in the hands, a bait (${JSON.stringify(taken)})`);
    const dry = await digAt(spots.dry, 8);
    ok(dry.done >= 6 && dry.stacks === 0, `the same strokes into ground with no water near (${dry.done} of 8 went in): no worms (${JSON.stringify(dry)})`);
  }

  // the journal: a page of the Tab screen
  const j0 = await page.evaluate(async () => {
    const g = window.__rt.game;
    g.player.slots[0] = null;
    g.player.slots[1] = null;
    g.openTab('journal');
    g.simulate(0.3);
    const el = document.querySelector('.fj-book');
    const rows = [...document.querySelectorAll('.fj-book .row')].map((r) => r.textContent);
    return { open: !!el && el.classList.contains('open'), head: document.querySelector('.fj-book .head')?.textContent ?? '', rows: rows.length, unknown: rows.filter((t) => t.includes('？？？')).length, side: document.querySelector('.fj-book .side')?.textContent ?? '' };
  });
  ok(j0.open && j0.head.includes('图鉴') && j0.rows >= 10 && j0.unknown === j0.rows && j0.side.includes('还没钓到过'), `the journal, a page of the Tab screen, with nothing caught yet: every fish ？？？ with its water (${JSON.stringify({ head: j0.head, rows: j0.rows })})`);
  const j1 = await page.evaluate(async () => {
    const g = window.__rt.game;
    const F = await import('/src/core/v3/fishing/lite/fish.ts');
    const sys = g.systems.get('fishing');
    // (two of the first water's fish in the log, as two catches would have left them)
    const first = F.FISH.filter((f) => f.spot === 0 && f.tier === 0).slice(0, 2);
    sys.log.kinds[first[0].id] = { n: 3, cm: 31.5, kg: 0.42, medal: 2, vars: 0 };
    sys.log.kinds[first[1].id] = { n: 1, cm: 18, kg: 0.08, medal: 0, vars: 0 };
    sys.log.stats.catches = 4;
    sys.journal.changed();
    g.simulate(0.2);
    const rows = [...document.querySelectorAll('.fj-book .row')].map((r) => r.textContent);
    const named = rows.filter((t) => !t.includes('？？？'));
    const sel0 = document.querySelector('.fj-book .row.sel')?.textContent ?? '';
    // the wheel: three notches down
    const page = g.tabPages?.find?.((p) => p.id === 'journal');
    for (let i = 0; i < 3; i++) sys.journal.wheel(1);
    g.simulate(0.1);
    const sel1 = document.querySelector('.fj-book .row.sel')?.textContent ?? '';
    return { names: first.map((f) => f.zh), named, head: document.querySelector('.fj-book .head')?.textContent ?? '', sel0, sel1, hasPage: !!page };
  });
  ok(j1.named.length === 2 && j1.named.some((t) => t.includes(j1.names[0]) && t.includes('3 条') && t.includes('银牌')) && j1.head.includes('2') && j1.sel0 !== j1.sel1, `two fish caught: they are named, with how many, the longest and the medal; the wheel goes down the list (${JSON.stringify({ named: j1.named, head: j1.head })})`);
  await page.evaluate(() => {
    const g = window.__rt.game;
    const sys = g.systems.get('fishing');
    for (let i = 0; i < 3; i++) sys.journal.wheel(-1);
    g.simulate(0.1);
  });
  await shot('02_journal.png');
  const shut = await page.evaluate(() => {
    const g = window.__rt.game;
    g.closeTab();
    g.simulate(0.2);
    return !document.querySelector('.fj-book')?.classList.contains('open');
  });
  ok(shut, 'the Tab screen shut: the journal with it');

  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `f11_fishing: ${bad} FAILED` : 'f11_fishing: ok');
process.exit(bad ? 1 : 0);
