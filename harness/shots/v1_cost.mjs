// The cost probe (V2): what a frame's time is made of at one of the gate's spots — the frame as it is, then without
// the paint finish, then without each of the scene's top-level groups in turn (how much each costs), GPU timed by a
// read-back as the gate does.
//   SHOTS_GPU=1 node harness/shots/v1_cost.mjs [km=7.75] [seed=7]
import { built, idle } from './landscapeCapture.mjs';
import { launchBrowser, openGame, startServer } from './lib.mjs';

const km = Number(process.argv[2] ?? 7.75);
const seed = Number(process.argv[3] ?? 7);
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&s=300&time=15.5&weather=clear${process.env.DEPTH ? '&depth=' + process.env.DEPTH : ''}`, { width: 1920, height: 1080 });
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
  const res = await page.evaluate(async () => {
    const rt = window.__rt;
    const g = rt.game;
    const gl = g.core.renderer.getContext();
    const px = new Uint8Array(4);
    const time = (n = 50) => {
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
      return +(ms[Math.floor(n / 2)]).toFixed(2);
    };
    const out = { base: time() };
    const frame = g.core.frame;
    const paint = frame.paint;
    const usePost = g.core.usePost;
    g.core.quality.paintRadius = 0;
    out.noPaint = time();
    g.core.quality.paintRadius = paint;
    const groups = {};
    const scene = g.core.scene;
    for (const o of scene.children) {
      if (!o.visible) continue;
      const name = o.name || o.type;
      o.visible = false;
      groups[name] = +(out.base - time(30)).toFixed(2);
      o.visible = true;
    }
    out.groups = groups;
    // (and the children of the world group, the heaviest)
    const world = scene.children.find((o) => o.name === 'world');
    const parts = {};
    // (all of one name at once: one measure, not a sum of noisy ones)
    const byName = new Map();
    if (world) for (const o of world.children) {
      if (!o.visible) continue;
      const name = o.name || o.type;
      byName.set(name, [...(byName.get(name) ?? []), o]);
    }
    for (const [name, list] of byName) {
      for (const o of list) o.visible = false;
      parts[name + ' x' + list.length] = +(out.base - time(30)).toFixed(2);
      for (const o of list) o.visible = true;
    }
    out.world = parts;
    // (the vehicle in focus, by its meshes' materials)
    const car = scene.children.find((o) => o.name === 'modcar:b1');
    const mats = new Map();
    if (car) car.traverse((o) => { if (o.isMesh && o.visible) { const k = (o.material?.name || o.material?.type || '?') + '/' + (o.material?.transparent ? 'T' : 'O'); mats.set(k, [...(mats.get(k) ?? []), o]); } });
    const carParts = {};
    for (const [k, list] of mats) {
      for (const o of list) o.visible = false;
      carParts[k + ' x' + list.length] = +(out.base - time(30)).toFixed(2);
      for (const o of list) o.visible = true;
    }
    out.car = carParts;
    out.after = time();
    void usePost;
    return out;
  });
  console.log(JSON.stringify(res, null, 1));
} finally {
  await browser.close();
  await server.close();
}
