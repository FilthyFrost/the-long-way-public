// a probe: the palette slots and the styles of the regions about a point of a world of version 4
import { built, idle } from './landscapeCapture.mjs';
import { launchBrowser, openGame, startServer } from './lib.mjs';
const seed = Number(process.argv[2] ?? 1);
const km = Number(process.argv[3] ?? 132.15);
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openGame(browser, `${url}/modcar.html?shot=1&world=4&seed=${seed}&start=road&build=stock:pickup&s=300&time=15.5&weather=clear`, { width: 960, height: 540 });
  await idle(page);
  await page.evaluate((km) => window.__rt.devGoKm(km, true), km);
  await built(page);
  await idle(page);
  const r = await page.evaluate(async () => {
    const g = window.__rt.game;
    const style = await import('/src/game/render/style.ts');
    const biomes = await import('/src/core/world/biomes.ts');
    const pal = await import('/src/game/scene/palette.ts');
    const s = g.pr?.s ?? 0;
    const plan = g.world.spine.plan;
    const c = plan.chapterAt(s);
    const out = { s, chapter: c, regions: [] };
    for (let k = c - 1; k <= c + 2; k++) {
      const b = plan.biomeOf(k);
      const def = biomes.BIOMES[b];
      const st = style.styleOf(b);
      out.regions.push({ k, b, id: def.id, label: def.label, earth: !!def.earth, palette: !!pal.paletteOf(def), deep: st.ground.deep, grassDensity: st.grassDensity, dryness: st.dryness });
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
} finally {
  await browser.close();
  await server.close();
}
