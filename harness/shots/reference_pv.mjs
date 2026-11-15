// Capture reference stills from the public Painted Valley demo (MIT code, CC0 art) with the
// same headless Chrome our own screenshots use, so both sides of a comparison go through the
// same software renderer.
//   node harness/shots/reference_pv.mjs [--query "quality=low&paint=3"] [--hours 15.5,18.8] [views...]
// Writes refs/targets/painted-valley/pv_<view>_<hour>.png
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser } from './lib.mjs';

const DEMO = 'https://01a1cd64361b77aabb85b391ef0c6f09-production.patchusercontent.com/';
const VIEWS = {
  // their own named views (metres down the valley u, right of it v; turn / pitch in degrees)
  opening: { u: 0, v: 0, turn: 0, pitch: 2 },
  slope: { u: 150, v: -60, turn: 30, pitch: 0 },
  low: { u: 90, v: -30, turn: -15, pitch: 14, y: 0.45 },
  tarn: { u: 368, v: 30, turn: 5, pitch: -4 },
  peaks: { u: 0, v: 0, turn: -6, pitch: 6, fov: 26 },
  // a driver's eye: 1.4 m up, a slightly long lens, looking along open ground
  drive: { u: 200, v: 40, turn: 2, pitch: -1, y: 1.4, fov: 62 },
};

const args = process.argv.slice(2);
const flag = (name, d) => {
  const i = args.indexOf(name);
  if (i < 0) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const query = flag('--query', 'quality=low&paint=3');
const hours = flag('--hours', '15.5').split(',').map(Number);
const names = args.length ? args : ['opening', 'drive', 'peaks'];
const out = path.join(ROOT, 'refs/targets/painted-valley');
fs.mkdirSync(out, { recursive: true });

const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  const t0 = Date.now();
  await page.goto(`${DEMO}?step&dpr=1&${query}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__tg?.ready, null, { timeout: 480000, polling: 1000 });
  console.log(`ready in ${Date.now() - t0} ms`);
  await page.addStyleTag({ content: '#start, #hud, .hud { display: none !important; }' });
  for (const hour of hours) {
    for (const name of names) {
      const v = VIEWS[name];
      const t1 = Date.now();
      await page.evaluate(
        ([view, h]) => {
          const tg = window.__tg;
          if (tg.setHour) tg.setHour(h);
          const [x, z] = tg.fromValley(view.u, view.v);
          const base = Math.atan2(-0.6, -0.8);
          tg.view = { x, z, y: view.y ?? 1.68, yaw: base - (view.turn * Math.PI) / 180, pitch: (view.pitch * Math.PI) / 180, fov: view.fov ?? 68 };
          for (let i = 0; i < 6; i++) tg.tick(1 / 30);
        },
        [v, hour],
      );
      const file = path.join(out, `pv_${name}_${String(hour).replace('.', 'h')}.png`);
      await page.screenshot({ path: file });
      console.log(`shot ${name} @ ${hour}: ${Date.now() - t1} ms`);
    }
  }
  if (problems.length) console.log(problems.slice(0, 5).join('\n'));
} finally {
  await browser.close();
}
