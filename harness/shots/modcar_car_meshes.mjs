// What one ModCar vehicle draws: its visible meshes grouped by the node they hang under (render/CarView).
//   SHOTS_GPU=1 node harness/shots/modcar_car_meshes.mjs [query]
import { launchBrowser, openGame, startServer } from './lib.mjs';

const q = process.argv[2] ?? 'shot=1&start=road&build=stock:sedan&seed=7&s=3180';
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openGame(browser, `${url}/modcar.html?${q}`, { width: 640, height: 360 });
  const out = await page.evaluate(() => {
    const v = window.__rt.game.vehicles[0];
    const groups = {};
    let total = 0;
    v.view.root.traverse((o) => {
      if (!o.isMesh) return;
      let vis = true;
      for (let p = o; p; p = p.parent) if (!p.visible) vis = false;
      if (!vis) return;
      total++;
      // the nearest named ancestor that tells what it is
      let p = o.parent;
      while (p && !/^(part_|pivot_|merged|FRAME|M_|N_|WIPER|FUEL)/.test(p.name)) p = p.parent;
      const k = p ? p.name : '?';
      groups[k] = (groups[k] ?? 0) + 1;
    });
    return { total, groups };
  });
  console.log('visible meshes', out.total);
  for (const [k, n] of Object.entries(out.groups).sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(4), k);
} finally {
  await browser.close();
  await server.close();
}
