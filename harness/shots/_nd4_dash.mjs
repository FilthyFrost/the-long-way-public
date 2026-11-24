// probe: the dashboard tops of the stock vehicles (heights straight down over the area ahead of the wheel, and what is hit)
import { launchBrowser, openGame, startServer } from './lib.mjs';
const frames = (process.argv[2] || 'pickup,sedan,rv,van,wagon,fox,goat,buffalo,rhino,snail').split(',');
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  for (const fr of frames) {
    const { page } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:${fr}&time=12&weather=clear`, { width: 640, height: 360 });
    await page.evaluate(() => { const g = window.__rt.game; for (let i = 0; i < 40; i++) g.simulate(1 / 30); });
    const r = await page.evaluate(async () => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      await v.view.settled();
      const m = v.view.model;
      m.updateMatrixWorld(true);
      const st = v.view.frame.mounts.find((x) => x.cat === 'steering');
      const sx = st.pos.x, sy = st.pos.y;
      const o = g.core.origin;
      const P = g.core.camera.position.clone();
      const rows = [];
      for (let dx = 0.05; dx <= 0.65; dx += 0.06) {
        const row = [];
        for (const z of [-0.55, -0.35, -0.15, 0, 0.15, 0.35, 0.55]) {
          P.set(sx + dx, sy + 0.22, z);
          m.localToWorld(P);
          const y = v.surfaceAt(P.x + o.x, P.z + o.z, P.y + o.y);
          if (y === null) { row.push('  —  '); continue; }
          const Q = P.clone().set(P.x, y - o.y, P.z);
          m.worldToLocal(Q);
          row.push(Q.y.toFixed(2));
        }
        rows.push('x ' + (sx + dx).toFixed(2) + ': ' + row.join(' '));
      }
      return { id: v.view.frame.id, steer: [sx, sy], rows };
    }).catch((e) => ({ error: String(e) }));
    console.log(JSON.stringify(r, null, 0).replace(/","/g, '"\n  "'));
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
