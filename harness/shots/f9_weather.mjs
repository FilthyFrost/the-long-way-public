// F9 (docs/V3/plan/finish.md §十二 8), in the game — the weather only changes slowly, looked at: the twenty moments of
// twenty-four worlds' 300 km at 90 km/h at which the sky changed fastest (harness/sim/f9_weather.test.ts writes them
// to loop/shots/f9_weather/worst.json: run it first), each pictured twice, ten seconds apart — five before the moment
// and five after it, the weather followed to there as the game follows it for the ten minutes of road before. What is
// checked is what the pictures are of: over those ten seconds the cloud, the overcast, the fog and what falls change
// by no more than ten of their one-second thresholds; how far apart the two frames are in brightness is written down
// (the fastest of them are the sun coming up: the clock's doing, as fast as it ever was).
//   npx vitest run harness/sim/f9_weather && SHOTS_GPU=1 node harness/shots/f9_weather.mjs [how many]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/f9_weather');
const file = path.join(out, 'worst.json');
if (!fs.existsSync(file)) {
  console.log('FAIL no loop/shots/f9_weather/worst.json: run npx vitest run harness/sim/f9_weather first');
  process.exit(1);
}
const { worst, limits, kmh } = JSON.parse(fs.readFileSync(file, 'utf8'));
const N = Math.min(worst.length, Number(process.argv[2] ?? 20) || 20);
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const ok = (cond, why) => (cond ? console.log('ok  ', why) : fail(why));
const speed = kmh / 3.6;

/** the mean brightness of a picture (0 … 255), in the page */
const brightness = (page, buf) =>
  page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 90;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, 160, 90);
    const d = x.getImageData(0, 0, 160, 90).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return sum / (d.length / 4);
  }, buf.toString('base64'));

try {
  let worstDiff = 0;
  for (let k = 0; k < N; k++) {
    const m = worst[k];
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=7&seed=${m.seed}&start=road&build=stock:sedan&s=900`, { width: 1280, height: 720 });
    const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
    /** the game at a moment of that drive: down the road to where the car would be, the weather followed to there from ten minutes before (or on from where it was followed to) */
    const at = (t, from) =>
      page.evaluate(
        async ({ t, from, speed }) => {
          const g = window.__rt.game;
          const S = await import('/src/core/world/spine.ts');
          const T = await import('/src/core/env/time.ts');
          g.time = t;
          window.__rt.devGoKm((t * speed) / 1000, true);
          // (the hour has jumped: the game takes that as a cut — then the weather is followed again, as it would have been)
          g.simulate(0.3);
          // (from: followed again from there, as the game would have followed it down that road; null: the game's own
          // step has followed it on from where it was)
          if (from !== null) {
            const bl = new S.BiomeBlend();
            const sky = new T.SkyState();
            for (let tt = from; tt <= t; tt += 0.25) {
              g.world.spine.skyAt(tt * speed, bl);
              g.env.clock.state(tt, sky);
              g.env.weather.step(0.25, tt, sky.hour, sky.daylight, bl.a, bl.b, bl.t);
            }
          }
          g.simulate(0.05);
          for (let i = 0; i < 400 && (g.worldView?.pending ?? 0) > 0; i++) {
            g.worldView.update(g.vehicles[0].sim.px, g.vehicles[0].sim.pz, 40);
            await new Promise((r) => setTimeout(r, 0));
          }
          g.ui.showHelp(false);
          for (let i = 0; i < 2; i++) window.__rt.render();
          const s = g.env.state;
          return { cloud: s.cloud, overcast: s.overcast, fog: s.fog, rain: s.rain, snow: s.snow, hour: +g.env.sky.hour.toFixed(2), kind: s.kind, km: +(g.roadS / 1000).toFixed(2) };
        },
        { t, from, speed },
      );
    await rt('setView', 'chase');
    const a = await at(m.t - 5, m.t - 605);
    const pa = await page.screenshot({ path: path.join(out, `${String(k + 1).padStart(2, '0')}_a.png`) });
    const b = await at(m.t + 5, null);
    const pb = await page.screenshot({ path: path.join(out, `${String(k + 1).padStart(2, '0')}_b.png`) });
    const la = await brightness(page, pa);
    const lb = await brightness(page, pb);
    const diff = Math.abs(la - lb) / Math.max(1, (la + lb) / 2);
    worstDiff = Math.max(worstDiff, diff);
    const moved = ['cloud', 'overcast', 'fog', 'rain', 'snow'].map((key) => [key, Math.abs(b[key] - a[key])]);
    const within = moved.every(([key, d]) => d <= 10 * limits[key] + 1e-6);
    ok(
      within && diff < 0.35,
      `${k + 1}. world ${m.seed}, ${m.km} km (${m.region}), ${a.hour} h, ${a.kind}: the ${m.what} changing fastest there (${m.rate} a second) — over ten seconds ${moved
        .filter(([, d]) => d > 0.0005)
        .map(([key, d]) => `${key} ${d.toFixed(3)}`)
        .join(', ') || 'nothing of the weather moves'}; the two pictures ${(diff * 100).toFixed(1)} % apart in brightness`,
    );
    const lastError = await page.evaluate(() => window.__rt.lastError);
    if (lastError) fail(`a frame threw: ${lastError}`);
    if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
    await page.close();
  }
  ok(N >= 1, `${N} moments pictured, each twice ten seconds apart: at the most ${(worstDiff * 100).toFixed(1)} % apart in brightness`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `f9_weather: ${bad} FAILED` : 'f9_weather: ok');
process.exit(bad ? 1 : 0);
