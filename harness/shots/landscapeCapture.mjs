import { ON_GPU } from './lib.mjs';

/** the test hook's functions by name */
export const hook = (page) => (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });

/** step the game until the world round the vehicle is built (the vehicle held where it stands), then build the rest at once */
export async function built(page) {
  for (let round = 0; round < 14; round++) {
    const pending = await page.evaluate(() => {
      const g = window.__rt.game;
      g.scripted = { steer: 0, throttle: 0, brake: 0, handbrake: 1 };
      for (let i = 0; i < 40; i++) {
        g.simulate(0.1);
        if (i > 4 && window.__rt.worldPending() === 0) break;
      }
      g.simulate(0.3);
      g.scripted = null;
      return window.__rt.worldPending();
    });
    if (pending === 0) break;
  }
  return page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.seated ?? g.focus ?? g.vehicles[0];
    g.worldView.update(v.sim.px, v.sim.pz, 1e9);
    return g.worldView.pending === 0;
  });
}

/** what the game fetches as it goes has arrived */
export const idle = (page) =>
  page.waitForFunction(
    async () => {
      const { loadStats } = await import('/src/game/modcar/assets.ts');
      return loadStats.done >= loadStats.requested;
    },
    null,
    { timeout: 120_000, polling: 50 },
  );

/** where the vehicle is by the road, and the region under it */
export const vehicleNow = (page) =>
  page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.seated ?? g.focus ?? g.vehicles[0];
    const pr = { s: 0, d: 0 };
    g.world.spine.project(v.sim.px, v.sim.pz, NaN, pr);
    const bl = { a: 0, b: 0, t: 0, ia: 0, ib: 0 };
    g.world.spine.plan.blend(pr.s, bl);
    const regions = window.__rt.devRegions();
    return { s: pr.s, d: pr.d, region: regions[bl.t > 0.5 ? bl.b : bl.a].id };
  });

/**
 * The frame as drawn: draw calls and triangles by the renderer's own counters, the painted crowns drawn, and (on a
 * GPU, SHOTS_GPU=1) the time a frame takes:  frames drawn one after another, each waited for to the end
 * (a pixel read back), the crowns set out again every frame as while driving. On a software renderer the time
 * means nothing and is not taken.
 */
export const frameFigures = (page, frames = ON_GPU ? 40 : 0) =>
  page.evaluate((frames) => {
    const g = window.__rt.game;
    const crowns = g.worldView?.crowns ?? null;
    window.__rt.render();
    const s = g.core.stats;
    const out = { calls: s.calls, triangles: s.triangles, crowns: crowns ? { ...crowns.drawn, levels: [...crowns.drawn.levels] } : null, ms: null };
    if (frames > 0) {
      const gl = g.core.renderer.getContext();
      const px = new Uint8Array(4);
      const one = () => {
        if (crowns) crowns.changed = true;
        window.__rt.render();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      };
      for (let i = 0; i < 6; i++) one();
      const samples = [];
      for (let i = 0; i < frames; i++) {
        const start = performance.now();
        one();
        samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b);
      out.ms = +(samples.reduce((a, b) => a + b, 0) / frames).toFixed(2);
      out.p95 = +samples[Math.ceil(0.95 * samples.length) - 1].toFixed(2);
    }
    return out;
  }, frames);
