import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const page = (name: string): string => fileURLToPath(new URL(name, import.meta.url));

/**
 * The developer's panel (src/game/modcar/devPanel.ts) saves the dials it has moved here, on the dev server
 * only: loop/dev-tune.json and loop/dev-tune.txt (kept out of git), to be written into the game for good.
 */
function devTuneSave(): Plugin {
  return {
    name: 'dev-tune-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/tune', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        let size = 0;
        let over = false;
        req.on('data', (c: Buffer) => {
          size += c.length;
          if (size > 512 * 1024) over = true;
          else body += c.toString('utf8');
        });
        req.on('end', () => {
          try {
            if (over) throw new Error('too big');
            const o = JSON.parse(body) as { name?: string; text: string; json: unknown };
            // (a test run saves under its own name, never over the developer's own)
            const name = typeof o.name === 'string' && /^[a-z0-9-]{1,40}$/.test(o.name) ? o.name : 'dev-tune';
            const dir = page('./loop/');
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, `${name}.json`), `${JSON.stringify(o.json, null, 2)}\n`);
            fs.writeFileSync(path.join(dir, `${name}.txt`), `${String(o.text)}\n`);
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: `loop/${name}.json` }));
          } catch {
            res.statusCode = 400;
            res.end();
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [devTuneSave()],
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    // the game (index.html: the ModCar game, also at modcar.html), the classic game before ModCar
    // (classic.html) and the ModCar model viewer (docs/MODCAR.md §6, §8)
    rolldownOptions: { input: { main: page('./index.html'), modcar: page('./modcar.html'), classic: page('./classic.html'), viewer: page('./viewer.html') } },
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: false },
});
