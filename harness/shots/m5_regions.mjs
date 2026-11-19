// Continuous stock pickup drive, one world at normal chapter scale. Run under the shared GPU lock.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, ON_GPU, launchBrowser, openGame, startServer } from './lib.mjs';
import { built, idle, frameFigures, hook, vehicleNow } from './landscapeCapture.mjs';

if (!ON_GPU) throw Error('GPU capture required');
const out = path.join(ROOT, 'loop/shots/m5-regions');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, url + '/modcar.html?shot=1&world=2&seed=1&start=road&build=stock:pickup&s=300&time=15.5&weather=clear', { width: 1920, height: 1080 });
  const rt = hook(page);
  const strip = await page.evaluate(async () => {
    const g = window.__rt.game;
    const gl = g.core.renderer.getContext();
    const gpu = gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
    if (!/5060/i.test(gpu)) throw Error(gpu);
    g.ui.root.style.visibility = 'hidden';
    const plan = g.world.spine.plan;
    const regions = window.__rt.devRegions();
    plan.biomeOf(6);
    const { RobotDriver } = await import('/src/core/driver/robot.ts');
    window.driver = new RobotDriver({ lane: 0.7, cruise: 19, latG: 0.19 });
    return plan.biomes.slice(0, 6).map((id, i) => ({ ...regions[id], start: plan.starts[i], end: plan.starts[i + 1], blend: plan.transitionAt(i) }));
  });
  const shots = [];
  const recoveries = [];
  for (const [i, r] of strip.entries()) {
    const stops = [];
    if (i === 2 || i === 3) stops.push({ s: r.start - r.blend * 0.1, name: strip[i-1].id + '_to_' + r.id });
    let middle = (r.start + r.end) / 2;
    if (r.id === 'lakes' || r.id === 'wetland') {
      middle = await page.evaluate(({ start, end, middle }) => {
        const w = window.__rt.game.world;
        for (let k = start / w.rules.slot + 1; k < end / w.rules.slot - 1; k++) {
          const f = w.water.feature(k);
          if (f?.kind === 'lake') return f.s - 110;
          if (w.sea.coastOf(k)) return (k + 0.4) * w.rules.slot;
        }
        return middle;
      }, { ...r, middle });
    }
    stops.push({ s: i === 0 ? 500 : middle, name: r.id });
    for (const stop of stops) {
      let before = -500;
      for (;;) {
        const s = await page.evaluate((end) => {
          const g = window.__rt.game;
          g.devRepair();
          const sim = g.seated.sim;
          sim.setParkBrake(false);
          const robot = window.driver;
          for (let j = 0; j < 2400 && robot.s < end; j++) {
            g.scripted = robot.update(1 / 60, sim, g.world.spine);
            g.step(1 / 60, 1);
          }
          g.scripted = null;
          return robot.s;
        }, stop.s);
        if (s >= stop.s) break;
        if (s < before + 10) {
          if (recoveries.length > 30 || Math.abs(s - (recoveries.at(-1) ?? -100)) < 3) throw Error('Driver stalled at ' + s);
          // Tow the pickup back onto the pavement at its current kilometre.
          recoveries.push(s);
          await rt('devGoKm', s / 1000, true);
        }
        before = s;
      }
      // Park on the lane at the kilometre actually reached for the photograph.
      await rt('devGoKm', (await vehicleNow(page)).s / 1000, true);
      await built(page);
      await idle(page);
      await rt('setView', 'cockpit');
      await rt('setHour', 15.5);
      await rt('simulate', 0.1);
      const at = await vehicleNow(page);
      const file = String(shots.length+1).padStart(2, '0') + '_' + stop.name + '.png';
      const frame = await frameFigures(page);
      await page.screenshot({ path: path.join(out, file) });
      shots.push({ file, at, frame });
      fs.writeFileSync(path.join(out, 'route.json'), JSON.stringify({ seed: 1, strip, recoveries, shots }, null, 2));
      console.log(file, at.s, frame.ms);
    }
  }
  if (errors.length) throw Error(errors.join('\n'));
} finally {
  await browser.close();
  await server.close();
}
