#!/usr/bin/env node
/**
 * Bundle all audio files referenced by the game's CueTable (111 cue groups + 51 radio/vinyl/cassette songs)
 * from the local uncompressed WAV archive into self-contained compressed MP3 assets under public/audio-archive/,
 * together with pre-computed __cues.json (including lossless-measured loudness for all beds and songs).
 *
 * Run: node tools/audio/pack_archive.mjs [--src <wav-archive-dir>] [--ffmpeg <ffmpeg.exe>]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wavLoudness } from '../../src/core/audio/loudness.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'public/audio-archive');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const SRC = path.resolve(arg('--src', process.env.TLW_AUDIO_ARCHIVE ?? 'D:/公路游戏音频整理-20261118/最终可用音频'));
const CUES_URL = arg('--cues-url', 'http://127.0.0.1:5173/audio-archive/__cues.json');
const FFMPEG = arg(
  '--ffmpeg',
  'C:/Users/XD/.cache/grapple-r04-media-python/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe',
);

function slug(name) {
  const base = path.basename(name, path.extname(name));
  const clean = base
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return clean || 'clip';
}

function encodeMp3(srcAbs, dstAbs, args) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
    const p = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-i', srcAbs, '-vn', ...args, dstAbs], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let err = '';
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code} for ${srcAbs}: ${err.trim()}`));
    });
  });
}

async function runPool(items, concurrency, fn) {
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (next < items.length) {
      const idx = next++;
      await fn(items[idx], idx);
      done++;
      if (done % 40 === 0 || done === items.length) {
        process.stdout.write(`  encoded ${done}/${items.length}\n`);
      }
    }
  });
  await Promise.all(workers);
}

async function main() {
  if (!fs.existsSync(FFMPEG)) throw new Error(`ffmpeg not found: ${FFMPEG}`);
  if (!fs.existsSync(SRC)) throw new Error(`audio archive not found: ${SRC}`);

  console.log(`Fetching CueTable from ${CUES_URL} ...`);
  const res = await fetch(CUES_URL);
  if (!res.ok) throw new Error(`failed to fetch ${CUES_URL}: ${res.status}`);
  const raw = await res.json();

  // Classify every unique file referenced by cues or stations: song > bed > sfx
  const kindOf = new Map();
  for (const [cue, list] of Object.entries(raw.cues)) {
    const isBed = cue.startsWith('bed:');
    for (const f of list) {
      const prev = kindOf.get(f.file);
      if (prev === 'song') continue;
      if (isBed || !prev) kindOf.set(f.file, isBed ? 'bed' : 'sfx');
    }
  }
  for (const st of raw.stations) {
    for (const s of st.songs) kindOf.set(s.file, 'song');
  }

  // Assign deterministic ASCII-only destination paths under public/audio-archive/
  const map = new Map();
  const counters = { song: 0, bed: 0, sfx: 0 };
  const jobs = [];
  for (const [rel, kind] of kindOf) {
    const srcAbs = path.join(SRC, rel);
    if (!fs.existsSync(srcAbs)) throw new Error(`missing source audio: ${srcAbs}`);
    counters[kind]++;
    const dir = kind === 'song' ? 'songs' : kind === 'bed' ? 'beds' : 'sfx';
    const pad = kind === 'sfx' ? 3 : 2;
    const dstRel = `${dir}/${String(counters[kind]).padStart(pad, '0')}_${slug(rel)}.mp3`;
    map.set(rel, dstRel);
    jobs.push({ rel, kind, srcAbs, dstRel, dstAbs: path.join(OUT, dstRel) });
  }

  console.log(`Packing ${jobs.length} unique audio files (${counters.song} songs, ${counters.bed} beds, ${counters.sfx} sfx) -> ${OUT}`);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const loud = {};
  const concurrency = Math.max(4, Math.min(10, os.cpus().length));
  await runPool(jobs, concurrency, async (j) => {
    // Measure lossless loudness on songs, ambient beds, and any file over 1 MB
    const stat = fs.statSync(j.srcAbs);
    if (j.kind === 'song' || j.kind === 'bed' || stat.size > 1024 * 1024) {
      const buf = await fs.promises.readFile(j.srcAbs);
      const l = wavLoudness(buf, buf.length > 30e6 ? 4 : 1);
      if (l) {
        loud[j.dstRel] = {
          rms: +l.rms.toFixed(6),
          max: +l.max.toFixed(6),
          dur: +l.dur.toFixed(3),
        };
      }
    }
    const ffArgs =
      j.kind === 'sfx'
        ? ['-c:a', 'libmp3lame', '-ac', '1', '-ar', '44100', '-q:a', '5']
        : ['-c:a', 'libmp3lame', '-ar', '44100', '-q:a', '6'];
    await encodeMp3(j.srcAbs, j.dstAbs, ffArgs);
  });

  // Rewrite CueTable with bundled paths + pre-measured loudness
  const cues = {};
  for (const [k, list] of Object.entries(raw.cues)) {
    cues[k] = list.map((f) => ({ file: map.get(f.file), dur: +Number(f.dur).toFixed(3) }));
  }
  const stations = raw.stations.map((st) => ({
    name: st.name,
    en: st.en,
    songs: st.songs.map((s) => ({
      file: map.get(s.file),
      dur: +Number(s.dur).toFixed(3),
      title: s.title,
    })),
  }));

  fs.writeFileSync(path.join(OUT, '__cues.json'), `${JSON.stringify({ cues, stations, loud })}\n`);

  // Report total bundled size and largest file
  let totalBytes = 0;
  let maxBytes = 0;
  let maxFile = '';
  for (const j of jobs) {
    const sz = fs.statSync(j.dstAbs).size;
    totalBytes += sz;
    if (sz > maxBytes) {
      maxBytes = sz;
      maxFile = j.dstRel;
    }
  }
  const cuesSz = fs.statSync(path.join(OUT, '__cues.json')).size;
  console.log(
    JSON.stringify(
      {
        files: jobs.length,
        cues: Object.keys(cues).length,
        songs: counters.song,
        loudEntries: Object.keys(loud).length,
        totalMB: +((totalBytes + cuesSz) / 1048576).toFixed(2),
        maxFileMB: +(maxBytes / 1048576).toFixed(2),
        maxFile,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
