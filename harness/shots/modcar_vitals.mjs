// The body (src/core/modcar/vitals.ts, src/game/modcar/vitalsHud.ts, restore.ts; docs/MODCAR.md §13), as
// Arctic Drive keeps it: sprinting in the open (Shift) runs at 5 m/s and costs 6 stamina a second, back two
// seconds after; out of breath one only walks; a packet of prawn crackers eaten with F (about four seconds of
// bites) feeds one; a big bottle of water drunk with F held quenches; a beer makes one drunk; painkillers heal;
// the bar and the tiles follow (docs/V3/plan/finish.md §三); the body is saved and read back; one who falls with
// a first-aid box in the hotbar gets up with it; without one, on a kept page, the restore points
// are offered, nothing is saved meanwhile, and the one picked is gone on from; with the needs switched off
// (F2) one is never hungry.
//   SHOTS_GPU=1 node harness/shots/modcar_vitals.mjs
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
  const body = () =>
    page.evaluate(() => {
      const b = window.__rt.game.body;
      const r = (x) => Math.round(x * 10) / 10;
      return { hp: r(b.hp), st: r(b.stamina), food: r(b.food), water: r(b.water), temp: r(b.temp), cap: r(b.cap ?? 100), dead: b.dead, fx: Object.keys(b.effects).filter((k) => b.effects[k] > 0) };
    });
  /** step the game by so many seconds at 60 a second, the right button (F) held or not */
  const steps = (s, take = false) =>
    page.evaluate(
      ({ s, take }) => {
        const g = window.__rt.game;
        for (let t = 0; t < s; t += 1 / 60) {
          g.rightButton = take;
          g.step(1 / 60, 1);
        }
        g.rightButton = false;
      },
      { s, take },
    );
  const set = (o) => page.evaluate((o) => Object.assign(window.__rt.game.body, o), o);
  await page.goto(`${url}/modcar.html`, { waitUntil: 'domcontentloaded' });
  await ready();
  const keep = await page.evaluate(() => window.__rt.params.keep);
  if (!keep) fail('the plain page is not a kept one');

  // the bar and the three needs' tiles are there
  const hud = await page.evaluate(() => ({ bar: !!document.querySelector('.mc-vit .bar .hp'), tiles: document.querySelectorAll('.mc-vit .tile').length, hp: parseFloat(document.querySelector('.mc-vit .bar .hp')?.style.width ?? '') }));
  if (!hud.bar || hud.tiles !== 3 || hud.hp !== 100) fail(`the vitals are not on screen ${JSON.stringify(hud)}`);

  // 1. sprinting in the open, outside the workshop's door: 5 m/s, 6 stamina a second
  await rt('stand', 9, -1, 0);
  const x0 = await page.evaluate(() => window.__rt.game.player.walker.x);
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await steps(2);
  const sprint = { ...(await body()), dx: (await page.evaluate(() => window.__rt.game.player.walker.x)) - x0, v: await page.evaluate(() => window.__rt.game.player.walker.speed) };
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  console.log('sprint', JSON.stringify(sprint));
  if (Math.abs(sprint.st - (100 - 12)) > 2.5) fail(`two seconds' sprint left ${sprint.st} stamina (not 88)`);
  if (!(sprint.dx > 8)) fail(`two seconds' sprint went ${sprint.dx.toFixed(1)} m`);
  // back, two seconds after the last of it
  await steps(3);
  const rested = await body();
  if (!(rested.st > sprint.st + 5)) fail(`stamina does not come back (${sprint.st} → ${rested.st})`);
  // out of breath: Shift held, only walking
  await set({ stamina: 0.2 });
  await rt('stand', 9, -1, 0);
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await steps(1);
  const tired = await page.evaluate(() => Math.hypot(window.__rt.game.player.walker.vx, window.__rt.game.player.walker.vz));
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  if (Math.abs(tired - 2.5) > 0.4) fail(`out of breath one goes ${tired.toFixed(2)} m/s (not a walk's 2.5)`);
  await set({ stamina: 100 });
  await page.evaluate(() => window.__rt.render());
  await page.screenshot({ path: 'loop/shots/modcar_vitals_hud.png', clip: { x: 0, y: 0, width: 420, height: 200 } });

  // 2. hungry: prawn crackers with F (bites, then gone from the hands), the food over five seconds
  await set({ food: 30 });
  await rt('hold', 'item:food_chips');
  await steps(1 / 60, true);
  await steps(1.5);
  const eating = await page.evaluate(() => window.__rt.game.player.use?.kind ?? null);
  await steps(3);
  const ate = { ...(await body()), held: (await rt('telemetry')).held };
  await steps(5.5);
  const fed = await body();
  console.log('ate', JSON.stringify({ eating, ate, fed }));
  if (eating !== 'eat') fail(`F did not start eating (${eating})`);
  if (ate.held) fail(`the crackers are still in the hands (${ate.held})`);
  if (Math.abs(fed.food - 50) > 1.5) fail(`the crackers fed ${fed.food} (not 30 + 20)`);
  const foodBar = await page.evaluate(() => parseFloat(document.querySelector('.mc-vit .tile[data-k="food"] .b i').style.width));
  if (Math.abs(foodBar - fed.food) > 2) fail(`the food tile reads ${foodBar}% for ${fed.food}`);

  // 3. thirsty: a big bottle of water, F held 2.5 s (the liquid flows after half a second)
  await set({ water: 25 });
  await rt('hold', 'item:drink_water');
  await steps(2.5, true);
  const litres = await page.evaluate(() => window.__rt.game.player.held?.item?.litres);
  await steps(5.5);
  const drunkWater = await body();
  console.log('drank', JSON.stringify({ litres, drunkWater }));
  if (!(litres < 1.5 && litres > 1.1)) fail(`the bottle has ${litres} L left (not about 1.4)`);
  // (two seconds flowing at 0.3 L/s: 0.6 L, 60 points)
  if (Math.abs(drunkWater.water - 85) > 2) fail(`the water quenched to ${drunkWater.water} (not 25 + 60)`);

  // 4. a beer: drunk; painkillers: health
  await rt('hold', 'item:drink_beer');
  await steps(1.2, true);
  const beer = await body();
  if (!beer.fx.includes('drunk')) fail(`a beer did not make one drunk ${JSON.stringify(beer.fx)}`);
  await set({ hp: 40 });
  await rt('hold', 'item:med_pain_2');
  await steps(1 / 60, true);
  await steps(2.6);
  const healed = await body();
  if (Math.abs(healed.hp - 80) > 1) fail(`painkillers left ${healed.hp} life (not 40 + 40)`);

  // 5. saved and read back
  await set({ hp: 66, food: 44, water: 55, stamina: 70 });
  await page.evaluate(() => window.__rt.game.save());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready();
  const back = await body();
  console.log('read back', JSON.stringify(back));
  if (Math.abs(back.hp - 66) > 0.5 || Math.abs(back.food - 44) > 0.5 || Math.abs(back.water - 55) > 0.5) fail(`the body did not come back ${JSON.stringify(back)}`);

  // 6. falling with a first-aid box in the hotbar: up again with its 30
  await rt('hold', 'item:nd_first_aid');
  await set({ hp: 1, food: 0, ticks: { starve: 5.95, thirst: 0, cold: 0, sick: 0, warm: 0 } });
  await steps(0.5);
  const fell = { ...(await body()), down: await page.evaluate(() => window.__rt.game.deadT) };
  await steps(1.6);
  const up = { ...(await body()), held: (await rt('telemetry')).held };
  console.log('the kit', JSON.stringify({ fell, up }));
  if (!fell.dead || !(fell.down >= 0)) fail(`starving at 1 health did not fell one ${JSON.stringify(fell)}`);
  if (up.dead || Math.abs(up.hp - 30) > 0.5 || up.held) fail(`the box did not bring one up ${JSON.stringify(up)}`);

  // 7. without one: a restore point (every five minutes), then the card offering it; nothing saved meanwhile
  await set({ food: 80 });
  await page.evaluate(() => {
    const g = window.__rt.game;
    g.restoreT = 299.99;
    g.step(1 / 60, 1);
  });
  const points = await page.evaluate(() => JSON.parse(localStorage.getItem('modcar.restore.v1') ?? '[]').length);
  if (points !== 1) fail(`${points} restore points after five minutes (not 1)`);
  const pointHp = await page.evaluate(() => JSON.parse(localStorage.getItem('modcar.restore.v1'))[0].save.body.hp);
  await page.evaluate(() => window.__rt.game.save());
  const savedAt = await page.evaluate(() => JSON.parse(localStorage.getItem('modcar.save.v1')).at);
  await set({ hp: 1, food: 0, ticks: { starve: 5.95, thirst: 0, cold: 0, sick: 0, warm: 0 } });
  await steps(2.2);
  // (the card comes up with the live loop's frames: on a software renderer under load that takes longer than
  // any fixed pause, so wait for the card itself; a card that never comes still fails below)
  await page.waitForFunction(() => !!document.querySelector('.mc-death.on'), null, { timeout: 90_000, polling: 100 }).catch(() => {});
  const card = await page.evaluate(() => ({ on: !!document.querySelector('.mc-death.on'), points: document.querySelectorAll('.mc-death button[data-i]').length }));
  await page.screenshot({ path: 'loop/shots/modcar_vitals_death.png' });
  await page.evaluate(() => window.__rt.game.save());
  const savedAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('modcar.save.v1')).at);
  console.log('the card', JSON.stringify({ card, pointHp, saved: savedAfter === savedAt }));
  if (!card.on || card.points !== 1) fail(`the card does not offer the restore point ${JSON.stringify(card)}`);
  if (savedAfter !== savedAt) fail('the game was saved while one was down');
  // the point picked: the page again, the body as it was then
  await Promise.all([page.waitForEvent('load'), page.click('.mc-death button[data-i="0"]')]);
  await ready();
  const restored = await body();
  console.log('restored', JSON.stringify(restored));
  if (restored.dead || Math.abs(restored.hp - pointHp) > 0.5) fail(`the restore point was not gone on from ${JSON.stringify(restored)}`);

  // 8. the needs off (F2): a minute without getting hungry
  await page.evaluate(() => {
    window.__rt.game.assists.needs = false;
  });
  const f0 = (await body()).food;
  await steps(60);
  const f1 = (await body()).food;
  if (Math.abs(f1 - f0) > 0.05) fail(`with the needs off food went ${f0} → ${f1}`);
  await page.evaluate(() => {
    window.__rt.game.assists.needs = true;
    localStorage.removeItem('modcar.save.v1');
    localStorage.removeItem('modcar.restore.v1');
  });

  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
  console.log(bad ? `${bad} failed` : 'vitals ok');
} finally {
  await browser.close();
  await server.close();
}
process.exit(bad ? 1 : 0);
