// Probe the ghosts on the ModCar page: hold a part, aim at a mount, report every ghost object and
// whether it is drawn (run from the repo root):  node harness/shots/modcar_ghost_probe.mjs rim_steel13 hub_FL
import { launchBrowser, openGame, startServer } from './lib.mjs';

const part = process.argv[2] ?? 'rim_steel13';
const mount = process.argv[3] ?? 'hub_FL';
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1`, { width: 960, height: 540 });
  await page.evaluate(([p, m]) => {
    window.__rt.pickUp(p);
    window.__rt.aim(0, m, 1.8);
  }, [part, mount]);
  await page.evaluate(() => window.__rt.simulate(0));
  const out = await page.evaluate(() => {
    const g = window.__rt.game;
    const res = [];
    g.core.scene.updateMatrixWorld(true);
    g.core.scene.traverse((o) => {
      if (!o.name.startsWith('ghost:')) return;
      let vis = true;
      const chain = [];
      for (let p = o; p; p = p.parent) {
        if (!p.visible) vis = false;
        chain.push(`${p.name || p.type}${p.visible ? '' : '(hidden)'}`);
      }
      let meshes = 0;
      const mats = new Set();
      o.traverse((c) => {
        if (c.isMesh) {
          meshes++;
          mats.add(`${c.material.name}|ro${c.renderOrder}|L${c.layers.mask}`);
        }
      });
      const e = o.matrixWorld.elements;
      res.push({ name: o.name, vis, meshes, mats: [...mats].slice(0, 6), pos: [e[12].toFixed(2), e[13].toFixed(2), e[14].toFixed(2)], scale: [e[0].toFixed(2), e[5].toFixed(2), e[10].toFixed(2)], chain: chain.slice(0, 8).join(' < ') });
    });
    const cam = g.core.camera;
    return { ghosts: res, cam: [cam.position.x.toFixed(2), cam.position.y.toFixed(2), cam.position.z.toFixed(2)], tele: window.__rt.telemetry().target };
  });
  console.log(JSON.stringify(out, null, 1));
  console.log('errors', errors);
} finally {
  await browser.close();
  await server.close();
}
