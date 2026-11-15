// The first seconds of the ModCar page as a player sees them (not screenshot mode): the loading card,
// then the key card over the garage. Writes loop/shots/modcar_first/{loading,ready}.png.
//   SHOTS_GPU=1 node harness/shots/modcar_first.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/modcar_first');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${url}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, 'loading.png') });
  await page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, 'ready.png') });
  console.log(errors.length ? `errors: ${errors.slice(0, 3)}` : 'first ok');
} finally {
  await browser.close();
  await server.close();
}
