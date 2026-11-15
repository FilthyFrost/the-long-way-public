// Probe the ModCar page: why a vehicle is or is not drawn (run from the repo root).
import { launchBrowser, openGame, startServer } from '../../harness/shots/lib.mjs';

const q = process.argv[2] ?? 'shot=1';
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?${q}`, { width: 960, height: 540 });
  const out = await page.evaluate(() => {
    const g = window.__rt.game;
    const res = [];
    for (const v of g.vehicles) {
      let meshes = 0;
      let nan = 0;
      let hidden = 0;
      const mats = new Set();
      const samples = [];
      v.view.root.updateMatrixWorld(true);
      v.view.root.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        if (o.matrixWorld.elements.some((e) => !Number.isFinite(e))) nan++;
        let vis = true;
        for (let p = o; p; p = p.parent) if (!p.visible) vis = false;
        if (!vis) hidden++;
        mats.add(o.material.type + ':' + (o.material.name || '') + ':' + (o.material.visible ? 'v' : 'inv'));
        if (samples.length < 4) samples.push({ name: o.name, pos: [o.matrixWorld.elements[12], o.matrixWorld.elements[13], o.matrixWorld.elements[14]], layers: o.layers.mask, frustumCulled: o.frustumCulled, bs: o.geometry.boundingSphere ? o.geometry.boundingSphere.radius : null });
      });
      res.push({ meshes, nan, hidden, mats: [...mats].slice(0, 12), samples, rootLayers: v.view.root.layers.mask });
    }
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  console.log('errors', errors);
} finally {
  await browser.close();
  await server.close();
}
