// What the draw calls of the ModCar garage are made of: meshes per top-level group, how many are in
// the shadow maps, and the main / shadow pass counts (run from the repo root).
//   SHOTS_GPU=1 node harness/shots/modcar_calls_probe.mjs
import { launchBrowser, openGame, startServer } from './lib.mjs';

const q = process.argv[2] ?? 'shot=1';
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?${q}`, { width: 1280, height: 720 });
  const out = await page.evaluate(() => {
    const g = window.__rt.game;
    const scene = g.core.scene;
    const rows = {};
    for (const top of scene.children) {
      let meshes = 0;
      let shadow = 0;
      let visible = 0;
      const mats = {};
      top.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        let vis = true;
        for (let p = o; p; p = p.parent) if (!p.visible) vis = false;
        if (vis) visible++;
        if (vis && (o.layers.mask & 6)) shadow++;
        const n = o.material?.name ?? '?';
        mats[n] = (mats[n] ?? 0) + 1;
      });
      const key = top.name || top.type;
      rows[key] = { meshes, visible, shadow, mats: Object.entries(mats).sort((a, b) => b[1] - a[1]).slice(0, 8) };
    }
    window.__rt.render();
    const info = g.core.renderer.info.render;
    return { rows, calls: info.calls, tris: info.triangles };
  });
  console.log(JSON.stringify(out, null, 1));
  console.log('errors', errors);
} finally {
  await browser.close();
  await server.close();
}
