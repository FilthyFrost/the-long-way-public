/**
 * Tile pictures into one sheet: node harness/shots/tile.mjs out.png cols scale a.png b.png …
 */
import fs from 'node:fs';
import { PNG } from 'pngjs';
const [out, colsS, scaleS, ...files] = process.argv.slice(2);
const cols = Number(colsS);
const k = Number(scaleS);
const imgs = files.map((f) => PNG.sync.read(fs.readFileSync(f)));
const w = Math.floor(imgs[0].width * k);
const h = Math.floor(imgs[0].height * k);
const rows = Math.ceil(imgs.length / cols);
const sheet = new PNG({ width: w * cols, height: h * rows });
imgs.forEach((img, n) => {
  const ox = (n % cols) * w;
  const oy = Math.floor(n / cols) * h;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x / k));
      const sy = Math.min(img.height - 1, Math.floor(y / k));
      const si = (sy * img.width + sx) * 4;
      const di = ((oy + y) * sheet.width + ox + x) * 4;
      sheet.data[di] = img.data[si];
      sheet.data[di + 1] = img.data[si + 1];
      sheet.data[di + 2] = img.data[si + 2];
      sheet.data[di + 3] = 255;
    }
});
fs.writeFileSync(out, PNG.sync.write(sheet));
console.log(`${out}: ${sheet.width}x${sheet.height}`);
