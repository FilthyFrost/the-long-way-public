// Every frame on the road (docs/MODCAR.md §10): start seated in a stock build, drive away, lean into a
// bend, brake. A chase-view screenshot per stage into loop/shots/modcar_frames_drive/ and a line of
// numbers each (speed, lean, steer); exits non-zero when a frame does not get going or flies apart.
//   SHOTS_GPU=1 node harness/shots/modcar_frames_drive.mjs [sedan,pickup,moto,rv]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const frames = (process.argv[2] ?? 'sedan,pickup,moto,rv').split(',');
const out = path.join(ROOT, 'loop/shots/modcar_frames_drive');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let failed = 0;
const log = [];
try {
  for (const f of frames) {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&start=road&build=stock:${f}&seed=7&s=3180&time=10`, { width: 1280, height: 720 });
    const rt = (fn, ...args) => page.evaluate(([n, a]) => window.__rt[n](...a), [fn, args]);
    const lean = () => page.evaluate(() => {
      const v = window.__rt.game.seated;
      return v ? { lean: ((v.sim.lean ?? 0) * 180) / Math.PI, steer: (v.sim.steerAngle * 180) / Math.PI, kmh: v.sim.kmh, y: v.sim.py } : null;
    });
    const shot = async (name) => {
      await rt('setView', 'chase');
      await page.evaluate(() => window.__rt.render());
      await page.screenshot({ path: path.join(out, `${f}_${name}.png`) });
    };
    const row = { frame: f };
    await shot('0_start');
    row.straight = await rt('drive', 8, 1, 0);
    await shot('1_straight');
    row.bend = await rt('drive', 2.5, 0.6, 0.35);
    row.bendLean = await lean();
    await shot('2_bend');
    row.brake = await rt('drive', 4, 0, 0, 1);
    row.stopLean = await lean();
    await shot('3_stopped');
    const tele = await rt('telemetry');
    row.exploded = tele.exploded;
    row.errors = errors.slice(0, 3);
    const ok = !tele.exploded && row.straight && row.straight.kmh > 30 && !errors.length;
    if (!ok) failed++;
    log.push(row);
    console.log(`${ok ? ' ok ' : 'FAIL'} ${f}  straight ${row.straight?.kmh.toFixed(0)} km/h  bend lean ${row.bendLean?.lean.toFixed(1)}° steer ${row.bendLean?.steer.toFixed(1)}° at ${row.bendLean?.kmh.toFixed(0)} km/h  stopped ${row.brake?.kmh.toFixed(1)} km/h lean ${row.stopLean?.lean.toFixed(1)}°`);
    await page.close();
  }
} finally {
  fs.writeFileSync(path.join(out, 'drive.json'), JSON.stringify(log, null, 1));
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
