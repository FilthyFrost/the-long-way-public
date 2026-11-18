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
    return page;
  };
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...a) => {
    const context = await newContext(...a);
    context.setDefaultNavigationTimeout(nav);
    return context;
  };
  return browser;
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
