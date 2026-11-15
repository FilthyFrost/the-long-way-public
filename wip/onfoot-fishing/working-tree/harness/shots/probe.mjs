// Probe: open the game with URL parameters, run __rt calls, print what each returns.
//   node harness/shots/probe.mjs "<query>" '[["fn", arg, …], …]'
import { launchBrowser, openGame, startServer } from './lib.mjs';

const [query, stepsJson] = process.argv.slice(2);
const steps = JSON.parse(stepsJson ?? '[]');
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/?${query}`);
  for (const [fn, ...args] of steps) {
    const r = await page.evaluate(([f, a]) => window.__rt[f](...a), [fn, args]);
    console.log(fn, JSON.stringify(r));
  }
  if (errors.length) console.log('errors', errors);
} finally {
  await browser.close();
  await server.close();
}
