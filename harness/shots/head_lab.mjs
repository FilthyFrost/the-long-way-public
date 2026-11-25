// Her head beside the turnaround (refs/character/turnaround.png), from the head workbench (head.html): each view on
// white at the drawing's scale doubled, the drawing's same square beside it, and the two outlines laid over each other
// (hers red, the drawing's blue) — the loop for the skull and the hair. Pictures to loop/shots/head/.
//   SHOTS_GPU=1 node harness/shots/head_lab.mjs [--q=extra&params] [--only front,side] [--tag name]
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const args = process.argv.slice(2);
const extra = (args.find((a) => a.startsWith('--q=')) ?? '').slice(4);
const onlyAt = args.indexOf('--only');
const only = onlyAt >= 0 ? new Set(args[onlyAt + 1].split(',')) : null;
const tagAt = args.indexOf('--tag');
const tag = tagAt >= 0 ? args[tagAt + 1] : '';
const outDir = path.join(ROOT, 'loop/shots/head');
fs.mkdirSync(outDir, { recursive: true });

// the drawing: 775 px to the metre, her feet at 1361; each view's middle across (px)
const REF = path.join(ROOT, 'refs/character/turnaround.png');
const REF_PX = 775, FEET = 1361, MID_Y = 1.505, FRAME = 800;
// (the side view lined up by her ear, which is 0.7 cm ahead of the Head joint's line)
const REF_X = { front: 435, side: 1007, back: 1650 };
const VIEWS = ['front', 'side', 'back', 'three'];

const ref = fs.existsSync(REF) ? PNG.sync.read(fs.readFileSync(REF)) : null;
/** the drawing's square about a view's middle, doubled to the frame's scale */
function refSquare(view) {
  const out = new PNG({ width: FRAME, height: FRAME });
  out.data.fill(255);
  if (!ref || !(view in REF_X)) return out;
  const s = 1550 / REF_PX;
  const cx = REF_X[view], cy = FEET - MID_Y * REF_PX;
  for (let y = 0; y < FRAME; y++) {
    for (let x = 0; x < FRAME; x++) {
      const sx = Math.floor(cx + (x - FRAME / 2) / s), sy = Math.floor(cy + (y - FRAME / 2) / s);
      if (sx < 0 || sy < 0 || sx >= ref.width || sy >= ref.height) continue;
      const si = (sy * ref.width + sx) * 4, di = (y * FRAME + x) * 4;
      for (let k = 0; k < 4; k++) out.data[di + k] = ref.data[si + k];
    }
  }
  return out;
}
/** each row's outermost dark pixels (the outline against white) */
function outline(img, th = 170) {
  const rows = [];
  for (let y = 0; y < img.height; y++) {
    let L = -1, R = -1;
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if (0.3 * img.data[i] + 0.59 * img.data[i + 1] + 0.11 * img.data[i + 2] < th) { if (L < 0) L = x; R = x; }
    }
    rows.push([L, R]);
  }
  return rows;
}
function dot(img, x, y, c) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const xx = x + dx, yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= img.width || yy >= img.height) continue;
    const i = (yy * img.width + xx) * 4;
    img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
  }
}
function side(...imgs) {
  const W = imgs.reduce((a, i) => a + i.width, 0), H = Math.max(...imgs.map((i) => i.height));
  const out = new PNG({ width: W, height: H });
  out.data.fill(255);
  let ox = 0;
  for (const im of imgs) {
    for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) {
      const si = (y * im.width + x) * 4, di = (y * W + ox + x) * 4;
      for (let k = 0; k < 4; k++) out.data[di + k] = im.data[si + k];
    }
    ox += im.width;
  }
  return out;
}

const { server, url } = await startServer();
const browser = await launchBrowser();
const report = {};
try {
  const t0 = Date.now();
  const { page, errors } = await openGame(browser, `${url}/head.html?shot=1&bg=white&view=front${extra ? `&${extra}` : ''}`, { width: FRAME, height: FRAME });
  await page.waitForFunction(() => window.__rt && window.__rt.ready, null, { timeout: 300000 });
  console.log('built in', ((Date.now() - t0) / 1000).toFixed(1), 's');
  for (const view of VIEWS) {
    if (only && !only.has(view)) continue;
    await page.evaluate((v) => window.__rt.setView(v), view);
    const file = path.join(outDir, `ours_${view}${tag ? '_' + tag : ''}.png`);
    await page.screenshot({ path: file });
    const tel = await page.evaluate(() => window.__rt.telemetry());
    if (errors.length) console.log(view, 'errors:', errors.slice(0, 3).join(' | '));
    const ours = PNG.sync.read(fs.readFileSync(file));
    const drawn = refSquare(view);
    // the outlines laid over each other, on a pale copy of the drawing
    const over = new PNG({ width: FRAME, height: FRAME });
    for (let i = 0; i < drawn.data.length; i += 4) for (let k = 0; k < 3; k++) over.data[i + k] = 255 - (255 - drawn.data[i + k]) * 0.35;
    for (let i = 3; i < over.data.length; i += 4) over.data[i] = 255;
    const a = outline(ours), b = view in REF_X ? outline(drawn) : [];
    let diff = 0, rowsBoth = 0;
    for (let y = 0; y < FRAME; y++) {
      if (b[y] && b[y][0] >= 0) { dot(over, b[y][0], y, [40, 80, 255]); dot(over, b[y][1], y, [40, 80, 255]); }
      if (a[y][0] >= 0) { dot(over, a[y][0], y, [235, 30, 30]); dot(over, a[y][1], y, [235, 30, 30]); }
      if (b[y] && b[y][0] >= 0 && a[y][0] >= 0) { diff += Math.abs(a[y][0] - b[y][0]) + Math.abs(a[y][1] - b[y][1]); rowsBoth++; }
    }
    const tops = [a.findIndex((r) => r[0] >= 0), b.length ? b.findIndex((r) => r[0] >= 0) : -1];
    report[view] = { ...tel, outlineGapPx: rowsBoth ? +(diff / rowsBoth / 2).toFixed(1) : null, topOurs: tops[0], topDrawn: tops[1] };
    fs.writeFileSync(path.join(outDir, `cmp_${view}${tag ? '_' + tag : ''}.png`), PNG.sync.write(side(drawn, ours, over)));
    console.log(view, JSON.stringify(report[view]));
  }
  await page.close();
} finally {
  await browser.close();
  server.close();
}
