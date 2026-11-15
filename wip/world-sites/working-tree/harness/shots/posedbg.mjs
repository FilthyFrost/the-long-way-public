// one-off: where the car stands after loading a shot URL
import { launchBrowser, openGame, startServer } from './lib.mjs';
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  for (const q of process.argv.slice(2)) {
    const { page, errors } = await openGame(browser, `${url}/?scene=world&shot=1&weather=clear&${q}`, { width: 480, height: 270 });
    const t = await page.evaluate(() => {
      const g = window.__rt.telemetry();
      const st = window.__rt.sys.state();
      return { s: g.s, d: g.d, kmh: g.kmh, roll: g.rollDeg, pitch: g.pitchDeg, sel: g.selector, hb: g.handbrake, eng: g.engineOn, ign: g.ignition, flat: st.wheels.map((w) => (w.flat ? 1 : 0)).join(''), off: st.wheels.map((w) => (w.off ? 1 : 0)).join(''), time: g.time };
    });
    console.log(q, JSON.stringify(t), errors.length ? errors.slice(0, 2) : '');
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
