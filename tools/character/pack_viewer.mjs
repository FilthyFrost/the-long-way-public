// The action viewer packed into one HTML file that opens from disk with no server and no network:
//   node tools/character/pack_viewer.mjs [out.html]      (default dist-viewer/她的动作查看器.html)
// Vite builds the page's code into one script (tools/character/vite.viewer.config.ts); that script goes into the page
// inline, and her mesh file and the animation clips as data URLs in window.__HER_ASSETS__, which the viewer reads in
// place of fetching them (src/game/character/actionViewer.ts).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dist = path.join(ROOT, 'dist-viewer');
const out = path.resolve(process.argv[2] ?? path.join(dist, '她的动作查看器.html'));

await build({ configFile: path.join(ROOT, 'tools/character/vite.viewer.config.ts') });
let html = fs.readFileSync(path.join(dist, 'actions.html'), 'utf8');
const built = (ref) => path.join(dist, ref.replace(/^\.\//, ''));
// (inside a script nothing may read as its end)
const safe = (code) => code.replace(/<\/(script)/gi, '<\\/$1');

const scripts = [...html.matchAll(/<script type="module" crossorigin src="([^"]+)"><\/script>/g)];
if (scripts.length !== 1) throw new Error(`expected one built script in the page, found ${scripts.length}`);
const left = fs.readdirSync(path.join(dist, 'assets')).filter((f) => f.endsWith('.js') && !scripts[0][1].endsWith(f));
if (left.length) throw new Error(`the build left scripts that would be loaded later: ${left.join(', ')}`);
const assets = {
  '/models/character/her.bin': `data:application/octet-stream;base64,${fs.readFileSync(path.join(ROOT, 'public/models/character/her.bin')).toString('base64')}`,
  '/models/character/pv-clips.glb': `data:model/gltf-binary;base64,${fs.readFileSync(path.join(ROOT, 'public/models/character/pv-clips.glb')).toString('base64')}`,
};
html = html.replace(scripts[0][0], () => `<script>window.__HER_ASSETS__ = ${JSON.stringify(assets)};</script>\n    <script type="module">${safe(fs.readFileSync(built(scripts[0][1]), 'utf8'))}</script>`);
html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/g, (_, ref) => `<style>${fs.readFileSync(built(ref), 'utf8')}</style>`);
if (/(src|href)="\.\/assets\//.test(html)) throw new Error('the page still links a built file');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${out}  ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
