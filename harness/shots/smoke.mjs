import { startServer, launchBrowser, openGame, ROOT } from './lib.mjs';
import path from 'node:path';
import fs from 'node:fs';

const out = path.join(ROOT, 'loop/shots/smoke');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const t0 = Date.now();
  const { page, errors } = await openGame(browser, `${url}/classic.html`);
  const info = await page.evaluate(() => window.__rt.info);
  await page.screenshot({ path: path.join(out, 'smoke.png') });
  console.log(JSON.stringify({ ms: Date.now() - t0, info, errors }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
