// Shared helpers: start a Vite dev server + a headless Chrome with software WebGL.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function startServer() {
  // no hot reload: editing the source while a run is going must not reload pages half way through a shot
  // (new pages still get the new code; a shot already open keeps the code it started with)
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', port: 5199, strictPort: false, hmr: false } });
  await server.listen();
  const addr = server.httpServer.address();
  return { server, url: `http://127.0.0.1:${addr.port}` };
}

const DEFAULT_CHROME = process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome';

export async function launchBrowser() {
  // SHOTS_GPU=1: draw on the machine's GPU (D3D11 through ANGLE) — about ten times faster than the
  // software renderer, for iterating on models and materials; gate runs keep the software renderer
  const gpu = process.env.SHOTS_GPU === '1';
  // SHOTS_GL=llvmpipe: Mesa's llvmpipe through ANGLE's GL back end. On a machine without a GPU it draws a
  // 1280×720 frame of the game in about half a second where SwiftShader takes four to seven (measured on
  // the 8-core development machine, 2026-11-18, docs/V3/STATUS.md). Still a software renderer: for
  // functional runs only; pictures compared with a SwiftShader baseline are drawn with SwiftShader.
  const llvmpipe = !gpu && process.env.SHOTS_GL === 'llvmpipe';
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || DEFAULT_CHROME,
    headless: true,
    args: [
      '--no-sandbox',
      ...(gpu ? ['--use-angle=d3d11'] : llvmpipe ? ['--use-gl=angle', '--use-angle=gl-egl'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--disable-gpu-vsync',
      '--hide-scrollbars',
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  // a software renderer on a busy machine needs longer than Playwright's 30 s to open a page
  // (SHOTS_NAV_MS; this only delays the failure of a page that never loads)
  const nav = Number(process.env.SHOTS_NAV_MS) || 180_000;
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...a) => {
    const page = await newPage(...a);
    page.setDefaultNavigationTimeout(nav);
    page.setDefaultTimeout(nav);
    return page;
  };
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...a) => {
    const context = await newContext(...a);
    context.setDefaultNavigationTimeout(nav);
    context.setDefaultTimeout(nav);
    return context;
  };
  return browser;
}

/** true when the run draws on a real GPU (SHOTS_GPU=1): only then does a frame time mean anything */
export const ON_GPU = process.env.SHOTS_GPU === '1';

// ---- waiting for the game instead of the wall clock
// A software renderer draws a frame of the live game in half a second or more, and the live loop caps a
// frame's time step at 0.1 s (src/game/modcar/entry.ts), so game time runs several times slower than the
// clock on the wall. A script that presses a key and waits 250 ms, or holds a key for 3 s, then finds that
// nothing has happened yet. Wait for the game's own frames or for the condition itself.

/** count the live game's frames in window.__gameFrames (safe to call again) */
export async function countFrames(page) {
  await page.evaluate(() => {
    if (window.__gameFrames !== undefined) return;
    const g = window.__rt.game;
    window.__gameFrames = 0;
    const f = g.frame.bind(g);
    g.frame = (dt) => {
      window.__gameFrames++;
      f(dt);
    };
  });
}

/** wait until the live loop has run n more frames; false if it has not within the timeout (the loop stopped) */
export async function waitFrames(page, n = 3, timeout = 120_000) {
  await countFrames(page);
  const to = (await page.evaluate(() => window.__gameFrames)) + n;
  try {
    await page.waitForFunction((to) => window.__gameFrames >= to, to, { timeout, polling: 50 });
    return true;
  } catch {
    return false;
  }
}

/** let the game settle: at least ms on the wall AND n frames of the game */
export async function settle(page, ms = 250, n = 3) {
  await page.waitForTimeout(ms);
  await waitFrames(page, n);
}

/**
 * Hold a key until fn(arg) is true in the page, then let go. Returns whether it became true within the
 * timeout: a hold that never completes still fails the script that asked for it.
 */
export async function holdKeyUntil(page, code, fn, arg, timeout = 120_000) {
  await page.keyboard.down(code);
  let ok = true;
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 50 });
  } catch {
    ok = false;
  }
  await page.keyboard.up(code);
  return ok;
}

/** Open a page, wait until the game says it is ready, return {page, errors}. */
export async function openGame(browser, url, { width = 1280, height = 720, timeout = 180_000 } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(url, { waitUntil: 'load', timeout });
  await page.waitForFunction(() => window.__rt && window.__rt.ready === true, null, { timeout });
  return { page, errors };
}
