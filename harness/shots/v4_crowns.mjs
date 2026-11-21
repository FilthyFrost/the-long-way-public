// The crowns' cost probe (V4): what the painted crowns cost at one of the gate's spots — their draws by kind (near,
// middle, far impostors, the shadow casters), each hidden in turn; the shadow maps off; the screen without crowns at
// all. GPU timed by a read-back as the gate does.
//   SHOTS_GPU=1 node harness/shots/v4_crowns.mjs [km=7.75] [seed=7]
import { built, idle } from './landscapeCapture.mjs';
import { launchBrowser, openGame, startServer } from './lib.mjs';

const km = Number(process.argv[2] ?? 7.75);
const seed = Number(process.argv[3] ?? 7);
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&s=300&time=15.5&weather=clear`, { width: 1920, height: 1080 });
  await idle(page);
  await page.evaluate((k) => window.__rt.devGoKm(k, true), km);
  await built(page);
  await idle(page);
  await page.evaluate(() => {
    const rt = window.__rt;
    const g = rt.game;
    if (!g.seated) g.enter(g.focus, 'driver');
    rt.setView('cockpit');
    rt.look(0, 0.02);
    g.simulate(0.4);
    for (let i = 0; i < 4; i++) rt.render();
  });
  await built(page);
  await page.waitForTimeout(1500);
  const res = await page.evaluate(() => {
    const rt = window.__rt;
    const g = rt.game;
    const gl = g.core.renderer.getContext();
    const px = new Uint8Array(4);
    const time = (n = 40) => {
      const one = () => {
        rt.render();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      };
      for (let i = 0; i < 6; i++) one();
      const ms = [];
      for (let i = 0; i < n; i++) {
        const t = performance.now();
        one();
        ms.push(performance.now() - t);
      }
      ms.sort((a, b) => a - b);
      return +ms[Math.floor(n / 2)].toFixed(2);
    };
    const out = { base: time(60) };
    const crowns = g.core.scene.getObjectByName('crowns');
    const kinds = new Map();
    for (const o of crowns.children) {
      if (!o.visible || !o.isInstancedMesh || o.count === 0) continue;
      const m = o.material;
      const k = `order${o.renderOrder}${o.layers.mask !== 1 ? ' shadow' : ''}${m.defines?.CROWN_ATLAS ? ' atlas' : ''}${o.name ? ' ' + o.name : ''}`;
      const e = kinds.get(k) ?? { list: [], instances: 0, tris: 0 };
      e.list.push(o);
      e.instances += o.count;
      e.tris += o.count * (o.userData.trisEach ?? (o.geometry.index ? o.geometry.index.count / 3 : 0));
      kinds.set(k, e);
    }
    out.kinds = {};
    for (const [k, e] of kinds) {
      for (const o of e.list) o.visible = false;
      out.kinds[k] = { draws: e.list.length, instances: e.instances, ktris: Math.round(e.tris / 1000), ms: +(out.base - time()).toFixed(2) };
      for (const o of e.list) o.visible = true;
    }
    crowns.visible = false;
    out.noCrowns = +(out.base - time()).toFixed(2);
    crowns.visible = true;
    const sh = g.core.shadows;
    if (sh) {
      g.core.shadows = null;
      out.noShadowMaps = +(out.base - time()).toFixed(2);
      g.core.shadows = sh;
    }
    out.after = time(60);
    return out;
  });
  console.log(JSON.stringify(res, null, 1));
} finally {
  await browser.close();
  await server.close();
}
