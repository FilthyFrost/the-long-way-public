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
  return chromium.launch({
    executablePath: process.env.CHROME_PATH || DEFAULT_CHROME,
    headless: true,
    args: [
      '--no-sandbox',
      ...(gpu ? ['--use-angle=d3d11'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--disable-gpu-vsync',
      '--hide-scrollbars',
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
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
