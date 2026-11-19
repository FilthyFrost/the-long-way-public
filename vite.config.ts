import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { resolveCues, type CatalogEntry } from './src/core/audio/cueTable';
import { wavLoudness, type Loudness } from './src/core/audio/loudness';

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

/**
 * The sound archive (docs/V3/nodes/M4-audio.md), read from where it lies on this machine, never copied into the
 * repository or a build: on the dev server only, /audio-archive/__cues.json is the game's table of cues made from
 * its catalogue (src/core/audio/cueTable.ts), and /audio-archive/<A_lib|L_lib>/… a recording in it (ranges for
 * the long ones streamed: the radio's songs, the country's beds). No archive (TLW_AUDIO_ARCHIVE names another
 * folder, or none is there): every address is not found, and the game plays its own synthesized sounds.
 */
function audioArchive(): Plugin {
  const root = path.resolve(process.env.TLW_AUDIO_ARCHIVE ?? 'D:/公路游戏音频整理-20261118/最终可用音频');
  let table: string | null = null;
  const louds = new Map<string, Promise<Loudness | null>>();
  const TYPES: Record<string, string> = { '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.flac': 'audio/flac' };
  return {
    name: 'audio-archive',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/audio-archive', (req, res) => {
        const notFound = (): void => {
          res.statusCode = 404;
          res.end();
        };
        try {
          const rel = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '');
          if (rel === '__cues.json') {
            if (table === null) {
              const cat = path.join(root, '全部可用音频.json');
              if (!fs.existsSync(cat)) return notFound();
              table = JSON.stringify(resolveCues(JSON.parse(fs.readFileSync(cat, 'utf8')) as CatalogEntry[]));
            }
            res.setHeader('content-type', 'application/json');
            res.setHeader('cache-control', 'no-store');
            res.end(table);
            return;
          }
          // (how loud a recording is, measured from its bytes once: a long bed the game streams, a song)
          const loud = /^__loud\/(.+)$/.exec(rel);
          // (a recording of the two games' folders, nothing outside them)
          const abs = path.resolve(root, loud ? loud[1] : rel);
          const type = TYPES[path.extname(abs).toLowerCase()];
          if (!type || !/^(A_lib|L_lib)[\\/]/.test(path.relative(root, abs)) || !abs.startsWith(root + path.sep) || !fs.existsSync(abs)) return notFound();
          if (loud) {
            let p = louds.get(abs);
            if (!p) {
              p = fs.promises.readFile(abs).then((b) => wavLoudness(b, b.length > 30e6 ? 4 : 1));
              louds.set(abs, p);
            }
            void p.then(
              (l) => {
                if (!l) return notFound();
                res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify(l));
              },
              () => notFound(),
            );
            return;
          }
          const size = fs.statSync(abs).size;
          res.setHeader('content-type', type);
          res.setHeader('accept-ranges', 'bytes');
          res.setHeader('cache-control', 'max-age=86400');
          const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
          if (m && (m[1] || m[2])) {
            const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
            const end = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
            if (!(start <= end) || start >= size) {
              res.statusCode = 416;
              res.setHeader('content-range', `bytes */${size}`);
              res.end();
              return;
            }
            res.statusCode = 206;
            res.setHeader('content-range', `bytes ${start}-${end}/${size}`);
            res.setHeader('content-length', String(end - start + 1));
            fs.createReadStream(abs, { start, end }).pipe(res);
            return;
          }
          res.setHeader('content-length', String(size));
          fs.createReadStream(abs).pipe(res);
        } catch {
          notFound();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [devTuneSave(), audioArchive()],
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
