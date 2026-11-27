/**
 * Milestone M4, the sound archive (docs/V3/nodes/M4-audio.md): its catalogue read into the game's cues and the
 * radio's stations (core/audio/cueTable.ts, against the real archive where this machine has it), a station on air,
 * the loudness the recordings are brought to (core/audio/loudness.ts), which cue a foley sound is (foley.ts
 * cueKeys) and the recording played in its place as loud as the synthesized one was, the footfalls counted and
 * what they fall on (core/onfoot/walker.ts, core/audio/footing.ts), the country's beds by the hour and the weather
 * (ambience.ts), a station's name on the dial (radio.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CUE_SPEC, pickupOf, STATIONS } from '../../src/core/audio/cueSpec';
import { baseName, diskPath, onAir, resolveCues, type CatalogEntry } from '../../src/core/audio/cueTable';
import { footfallGain, footingOf } from '../../src/core/audio/footing';
import { dbToGain, momentaryMax, rmsOf, wavLoudness } from '../../src/core/audio/loudness';
import { FunctionLand } from '../../src/core/onfoot/land';
import { FOOT, FootWalker, type FootInput } from '../../src/core/onfoot/walker';
import { Surface } from '../../src/core/world/ground';
import { bedWeights, BEDS, type AmbienceInputs } from '../../src/game/modcar/ambience';
import { cueKeys, cueLevelDb, Foley, foleyLevel, recipe, weightClass } from '../../src/game/modcar/foley';
import { nowOn, SONGS, songTitle, stationLabel, stationName } from '../../src/game/modcar/radio';
import { Rng } from '../../src/game/modcar/synth';
import type { Recording, SoundArchive } from '../../src/game/modcar/soundArchive';

const ARCHIVE = process.env.TLW_AUDIO_ARCHIVE ?? 'D:/公路游戏音频整理-20261118/最终可用音频';
const CATALOGUE = path.join(ARCHIVE, '全部可用音频.json');
const here = fs.existsSync(CATALOGUE);

describe('the archive’s catalogue read into cues', () => {
  const entry = (game: string, name: string, file = `${game}/x/${name}.wav`, sha = name): CatalogEntry => ({ kind: 'source', game, name, file, duration_seconds: 1, sha256: sha });

  it('finds a cue’s recordings by game and whole name, a numbered run of them, each once, on the disk as it is', () => {
    const cat = [
      entry('Arctic Drive', 'vehicle_door_generic_close_01.wav'),
      entry('Arctic Drive', 'vehicle_door_generic_close_02.wav'),
      // (the same recording under two headings: once)
      entry('Arctic Drive', 'vehicle_door_generic_close_02.wav', 'Arctic Drive/y/vehicle_door_generic_close_02.wav', 'vehicle_door_generic_close_02.wav'),
      // (not the whole name; the other game's)
      entry('Arctic Drive', 'vehicle_door_generic_close_01_tail.wav'),
      entry('Long Drive North', 'vehicle_door_generic_close_03'),
      entry('Long Drive North', 'LDN_RV_Door_Close_01'),
      { ...entry('Long Drive North', 'LDN_RV_Door_Close_02'), kind: 'native_engine_preview' },
    ];
    const t = resolveCues(cat, { door_close: [{ lib: 'A', name: 'vehicle_door_generic_close([-_ ]?\\d+)?' }, { lib: 'L', name: 'LDN_RV_Door_Close_\\d+' }] }, []);
    expect(t.cues.door_close.map((f) => f.file)).toEqual(['A_lib/x/vehicle_door_generic_close_01.wav.wav', 'A_lib/x/vehicle_door_generic_close_02.wav.wav', 'L_lib/x/LDN_RV_Door_Close_01.wav']);
    expect(diskPath('Long Drive North/06_音乐与广播/a.wav')).toBe('L_lib/06_音乐与广播/a.wav');
    expect(baseName('Arctic Drive\\sub\\ES_Velvet - Dylan Sitts.wav')).toBe('ES_Velvet - Dylan Sitts');
  });

  it('a station’s songs: each the first its title finds, in the station’s order', () => {
    const cat = [entry('Arctic Drive', 'B song.wav'), entry('Arctic Drive', 'A song.wav'), entry('Arctic Drive', 'A song.wav', 'Arctic Drive/z/A song.wav', 'other')];
    const t = resolveCues(cat, {}, [{ name: 's', en: 's', songs: [{ lib: 'A', name: 'A song' }, { lib: 'A', name: 'B song' }] }]);
    expect(t.stations[0].songs.map((s) => s.title)).toEqual(['A song', 'B song']);
  });

  it.runIf(here)('every cue and every station’s song is found in the real archive, and lies on its disk', () => {
    const t = resolveCues(JSON.parse(fs.readFileSync(CATALOGUE, 'utf8')) as CatalogEntry[]);
    for (const cue of Object.keys(CUE_SPEC)) {
      expect(t.cues[cue]?.length ?? 0, cue).toBeGreaterThan(0);
      for (const f of t.cues[cue]) {
        expect(f.file, cue).toMatch(/^(A_lib|L_lib)\//);
        expect(fs.existsSync(path.join(ARCHIVE, f.file)), f.file).toBe(true);
      }
    }
    for (const [i, st] of STATIONS.entries()) {
      expect(t.stations[i].songs.length, st.name).toBe(st.songs.length);
      for (const s of t.stations[i].songs) {
        expect(fs.existsSync(path.join(ARCHIVE, s.file)), s.file).toBe(true);
        expect(s.dur, s.file).toBeGreaterThan(60);
      }
    }
    // (the radio's dial has as many places as there were synthesized songs)
    expect(STATIONS.length).toBe(SONGS.length);
  });

  it.runIf(here)('measures the archive’s recordings straight from their files', () => {
    const t = resolveCues(JSON.parse(fs.readFileSync(CATALOGUE, 'utf8')) as CatalogEntry[]);
    for (const cue of ['door_close', 'step:snow', 'bed:rain_light']) {
      const l = wavLoudness(fs.readFileSync(path.join(ARCHIVE, t.cues[cue][0].file)));
      expect(l, cue).not.toBeNull();
      expect(l!.rms, cue).toBeGreaterThan(1e-4);
      expect(l!.max, cue).toBeGreaterThanOrEqual(l!.rms * 0.99);
      expect(l!.dur, cue).toBeCloseTo(t.cues[cue][0].dur, 0);
    }
  });

  it('bundled public/audio-archive/__cues.json is self-contained with all cues, 51 songs, and pre-measured loudness', () => {
    const bundledRoot = path.resolve(process.cwd(), 'public/audio-archive');
    const cuesPath = path.join(bundledRoot, '__cues.json');
    expect(fs.existsSync(cuesPath)).toBe(true);
    const tbl = JSON.parse(fs.readFileSync(cuesPath, 'utf8')) as {
      cues: Record<string, Array<{ file: string; dur: number }>>;
      stations: Array<{ name: string; songs: Array<{ file: string; dur: number; title: string }> }>;
      loud?: Record<string, { rms: number; max: number; dur: number }>;
    };
    for (const cue of Object.keys(CUE_SPEC)) {
      expect(tbl.cues[cue]?.length ?? 0, cue).toBeGreaterThan(0);
      for (const f of tbl.cues[cue]) {
        expect(fs.existsSync(path.join(bundledRoot, f.file)), f.file).toBe(true);
        if (cue.startsWith('bed:')) expect(tbl.loud?.[f.file]?.rms ?? 0, f.file).toBeGreaterThan(0);
      }
    }
    expect(tbl.stations.length).toBe(STATIONS.length);
    for (const [i, st] of STATIONS.entries()) {
      expect(tbl.stations[i].songs.length, st.name).toBe(st.songs.length);
      for (const s of tbl.stations[i].songs) {
        expect(fs.existsSync(path.join(bundledRoot, s.file)), s.file).toBe(true);
        expect(tbl.loud?.[s.file]?.rms ?? 0, s.file).toBeGreaterThan(0);
      }
    }
  });
});

describe('a station on air', () => {
  const songs = [{ file: 'a', dur: 100 }, { file: 'b', dur: 50 }];
  it('plays its songs one after another round the clock, a second between them', () => {
    expect(onAir(songs, 0)).toEqual({ song: 0, at: 0 });
    expect(onAir(songs, 42)).toEqual({ song: 0, at: 42 });
    expect(onAir(songs, 101.5)).toEqual({ song: 1, at: 0.5 });
    // (round again after 152 s; and before the clock's start the same way)
    expect(onAir(songs, 152 + 10)).toEqual({ song: 0, at: 10 });
    expect(onAir(songs, -2)).toEqual({ song: 1, at: Math.min(49, 50 - 0.05) });
    expect(onAir([], 5).song).toBe(-1);
  });
});

describe('loudness', () => {
  /** a WAV of a sine of amplitude a: `bits` 16 or 24 PCM, or 32 float; two channels */
  function wav(a: number, seconds: number, bits: 16 | 24 | 32, float = false): Uint8Array {
    const sr = 8000;
    const n = Math.floor(seconds * sr);
    const bytes = bits / 8;
    const data = n * 2 * bytes;
    const b = new Uint8Array(44 + data);
    const dv = new DataView(b.buffer);
    const tag = (o: number, s: string): void => [...s].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
    tag(0, 'RIFF');
    dv.setUint32(4, 36 + data, true);
    tag(8, 'WAVE');
    tag(12, 'fmt ');
    dv.setUint32(16, 16, true);
    dv.setUint16(20, float ? 3 : 1, true);
    dv.setUint16(22, 2, true);
    dv.setUint32(24, sr, true);
    dv.setUint32(28, sr * 2 * bytes, true);
    dv.setUint16(32, 2 * bytes, true);
    dv.setUint16(34, bits, true);
    tag(36, 'data');
    dv.setUint32(40, data, true);
    for (let i = 0; i < n; i++) {
      const v = a * Math.sin((2 * Math.PI * 440 * i) / sr);
      for (let c = 0; c < 2; c++) {
        const o = 44 + (i * 2 + c) * bytes;
        if (float) dv.setFloat32(o, v, true);
        else if (bits === 16) dv.setInt16(o, Math.round(v * 32767), true);
        else {
          const x = Math.round(v * 8388607);
          b[o] = x & 255;
          b[o + 1] = (x >> 8) & 255;
          b[o + 2] = (x >> 16) & 255;
        }
      }
    }
    return b;
  }

  it('reads a WAV’s loudness from its bytes, whatever its samples are', () => {
    for (const [bits, float] of [[16, false], [24, false], [32, true]] as const) {
      const l = wavLoudness(wav(0.5, 1, bits, float))!;
      expect(l.rms, `${bits}`).toBeCloseTo(0.5 / Math.SQRT2, 2);
      expect(l.max, `${bits}`).toBeCloseTo(0.5 / Math.SQRT2, 2);
      expect(l.dur).toBeCloseTo(1, 3);
    }
    // (a sample of it measures the same)
    expect(wavLoudness(wav(0.5, 1, 16), 4)!.rms).toBeCloseTo(0.5 / Math.SQRT2, 2);
    expect(wavLoudness(new Uint8Array(100))).toBeNull();
  });

  it('a short sound’s loudest 400 ms, a long one’s whole', () => {
    const sr = 1000;
    const x = new Float32Array(2000);
    for (let i = 1000; i < 1100; i++) x[i] = 1;
    // (100 ms of 1 in the loudest 400 ms window: RMS √(0.1/0.4))
    expect(momentaryMax(x, sr)).toBeCloseTo(0.5, 3);
    expect(rmsOf(x)).toBeCloseTo(Math.sqrt(0.05), 4);
    expect(dbToGain(-20)).toBeCloseTo(0.1, 6);
  });
});

describe('which of the archive’s cues a foley sound is', () => {
  it('a crash by how hard, a thing by its weight, a fridge’s door, a container by what it is, a pour by what flows', () => {
    expect(cueKeys('crash', { gain: 0.35 })).toEqual(['crash:small']);
    expect(cueKeys('crash', { gain: 1 })).toEqual(['crash:massive']);
    expect([0.3, 5, 40].map(weightClass)).toEqual(['light', 'medium', 'heavy']);
    expect(cueKeys('part_pickup', { mass: 30 })).toEqual(['part_pickup:heavy']);
    expect(cueKeys('door_open', { material: 'fridge' })).toEqual(['door_open:fridge']);
    expect(cueKeys('door_close', { material: 'rusty' })).toEqual(['door_close']);
    expect(cueKeys('container_open', { material: 'crate' })).toEqual(['container_open:crate']);
    expect(cueKeys('container_close', {})).toEqual(['container_close:wood']);
    expect(cueKeys('pour', { liquid: 'water' })).toEqual(['pour:water']);
    expect(cueKeys('hood_close')).toEqual(['hood_close']);
    // every cue a foley sound may be is one the archive is asked for (or has none: the synthesized one)
    for (const k of ['door_open', 'door_close', 'hood_open', 'part_install', 'switch', 'gulp', 'door_house_open', 'pump_lift']) expect(CUE_SPEC[cueKeys(k as never)[0]], k).toBeDefined();
    expect(cueLevelDb('step:carpet')).toBe(-34);
    expect(cueLevelDb('step:dirt')).toBe(-31);
    expect(cueLevelDb('nothing')).toBe(-30);
  });

  it('a thing picked up by what it is', () => {
    expect(['drink_soda', 'food_chips', 'drink_beer', 'drink_water', 'wear_jacket', 'junk_mug', 'crate_parts', 'junk_tv'].map(pickupOf)).toEqual(['can', 'bag', 'bottle', 'plastic', 'cloth', 'glass', 'box', null]);
    for (const w of ['can', 'bag', 'bottle', 'plastic', 'cloth', 'glass', 'box']) expect(CUE_SPEC[`pickup:${w}`], w).toBeDefined();
  });
});

describe('the archive’s recording played in place of the synthesized sound', () => {
  const sr = 8000;
  const started: Array<{ buffer: unknown; gain: number; loop: boolean }> = [];
  const param = (v = 0): Record<string, unknown> => {
    const p: Record<string, unknown> = { value: v };
    p.setTargetAtTime = (x: number) => ((p.value = x), p);
    p.setValueAtTime = (x: number) => ((p.value = x), p);
    p.cancelScheduledValues = () => p;
    return p;
  };
  const ctx = {
    sampleRate: sr,
    currentTime: 0,
    destination: { channelCount: 1 },
    createGain: () => {
      const g = { gain: param(1), connect: (n: unknown) => n, disconnect: () => undefined };
      lastGain = g;
      return g;
    },
    createBuffer: (_c: number, n: number) => ({ length: n, duration: n / sr, copyToChannel: () => undefined }),
    createBufferSource: () => {
      const s = { buffer: null as unknown, loop: false, playbackRate: param(1), onended: null, connect: (n: unknown) => n, disconnect: () => undefined, stop: () => undefined, start: () => started.push({ buffer: s.buffer, gain: Number((lastGain as { gain: { value: number } }).gain.value), loop: s.loop }) };
      return s;
    },
  };
  let lastGain: unknown = null;
  const rec = (file: string, max: number, rms = max): Recording => ({ file, buf: { duration: 1, file } as unknown as AudioBuffer, loud: { rms, max, dur: 1 } });
  const archive = (have: Record<string, Recording>) =>
    ({ live: true, has: (c: string) => c in have, pick: (c: string) => have[c] ?? null, warm: () => undefined }) as unknown as SoundArchive;

  it('as loud as the synthesized one was (its loudest 400 ms), and the synthesized one where the archive has none', () => {
    const f = new Foley(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode);
    const door = rec('door.wav', 0.05);
    f.archive = archive({ door_close: door });
    started.length = 0;
    f.play('door_close', {});
    expect(started[0].buffer).toBe(door.buf);
    const synth = momentaryMax(recipe('door_close', {})(sr, new Rng(7)), sr);
    // (its level: the sound's own, the synthesized one's loudness over the recording's, a hair of variation)
    expect(started[0].gain / (foleyLevel('door_close') * (synth / 0.05))).toBeGreaterThan(0.9);
    expect(started[0].gain / (foleyLevel('door_close') * (synth / 0.05))).toBeLessThan(1.1);
    // none in the archive: the synthesized one, as before
    started.length = 0;
    f.play('latch', {});
    expect(started[0].buffer).not.toBe(door.buf);
    // a new cue plays only from the archive
    expect(f.cue('step:dirt')).toBe(false);
    f.archive = archive({ 'step:dirt': rec('step.wav', 0.2) });
    expect(f.cue('step:dirt')).toBe(true);
    expect(started.at(-1)!.gain).toBeCloseTo(dbToGain(-31) / 0.2, 0);
  });

  it('a loop keeps its recording while it plays (the pour started every frame is one pour)', () => {
    const f = new Foley(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode);
    const pour = rec('pour.wav', 0.2, 0.1);
    f.archive = archive({ 'pour:water': pour });
    started.length = 0;
    for (let i = 0; i < 10; i++) f.start('pour', { liquid: 'water' });
    expect(started.length).toBe(1);
    expect(started[0].buffer).toBe(pour.buf);
    expect(started[0].loop).toBe(true);
    f.stop('pour');
  });
});

describe('footfalls', () => {
  const flat = new FunctionLand(() => 0);
  const go = (forward = 1, o: Partial<FootInput> = {}): FootInput => ({ forward, right: 0, run: false, crouch: false, jump: false, ...o });
  const run = (w: FootWalker, s: number, inp: FootInput): void => {
    for (let i = 0; i < Math.round(s / FOOT.h); i++) w.step(inp);
  };

  it('are counted as one walks, quicker running, none standing still; a jump’s landing is counted with its speed', () => {
    const w = new FootWalker(flat);
    w.place(0, 0, 0);
    run(w, 1, go(0));
    expect(w.steps).toBe(0);
    run(w, 4, go(1));
    // (about two steps a second at a walk)
    expect(w.steps).toBeGreaterThanOrEqual(7);
    expect(w.steps).toBeLessThanOrEqual(10);
    const walked = w.steps;
    run(w, 4, go(1, { run: true }));
    expect(w.steps - walked).toBeGreaterThan(walked);
    const n = w.lands;
    run(w, 0.5, go(0));
    run(w, 1.2, go(0, { jump: true }));
    expect(w.lands).toBe(n + 1);
    expect(w.landSpeed).toBeGreaterThan(3);
    expect(w.landSpeed).toBeLessThan(3.6);
  });

  it('fall on what is underfoot: a motorhome’s carpet, the workshop’s slab, a house’s boards, a shop’s tiles, a jetty, the land', () => {
    const at = (o: Partial<Parameters<typeof footingOf>[0]>) => footingOf({ aboard: false, workshop: false, floorTag: '', siteKind: null, surface: Surface.Grass, ...o });
    expect(at({ aboard: true })).toBe('carpet');
    expect(at({ workshop: true })).toBe('concrete');
    expect(at({ floorTag: 'site7:building', siteKind: 'house' })).toBe('wood');
    expect(at({ floorTag: 'site7:building', siteKind: 'station' })).toBe('concrete');
    expect(at({ floorTag: 'site9:jetty', siteKind: 'jetty' })).toBe('wood');
    expect(at({ floorTag: 'garage' })).toBe('concrete');
    expect([Surface.Asphalt, Surface.Gravel, Surface.Dirt, Surface.Grass, Surface.Sand, Surface.Snow, Surface.Ice].map((s) => at({ surface: s }))).toEqual(['concrete', 'gravel', 'dirt', 'dirt', 'dirt', 'snow', 'concrete']);
    expect(footfallGain('dirt', 1.9, false)).toBeLessThan(footfallGain('concrete', 1.9, false));
    expect(footfallGain('concrete', 3.6, true)).toBeGreaterThan(footfallGain('concrete', 1.9, false));
    for (const f of ['dirt', 'gravel', 'snow', 'carpet', 'wood', 'concrete', 'metal']) expect(CUE_SPEC[`step:${f}`], f).toBeDefined();
  });
});

describe('the country’s beds', () => {
  const calm: AmbienceInputs = { daylight: 1, green: 1, dry: 0, cold: 0, rain: 0, hail: 0, snow: 0, wind: 0, dust: 0, enclosed: 0, flash: 0 };
  it('by the hour and the kind of country; hushed by the weather; the rain and the wind by how hard', () => {
    const day = bedWeights(calm);
    expect(day['bed:day']).toBe(1);
    expect(day['bed:night']).toBe(0);
    expect(day['bed:rain_light'] + day['bed:rain_heavy'] + day['bed:wind_light'] + day['bed:wind_heavy']).toBe(0);
    const night = bedWeights({ ...calm, daylight: 0, green: 0, cold: 1 });
    expect(night['bed:night_alpine']).toBe(1);
    expect(night['bed:day'] + night['bed:night']).toBe(0);
    const drizzle = bedWeights({ ...calm, rain: 0.25 });
    expect(drizzle['bed:rain_light']).toBeGreaterThan(0.5);
    expect(drizzle['bed:rain_heavy']).toBe(0);
    expect(drizzle['bed:day']).toBeLessThan(0.8);
    const pour = bedWeights({ ...calm, rain: 1 });
    expect(pour['bed:rain_heavy']).toBe(1);
    expect(pour['bed:rain_light']).toBe(0);
    const gale = bedWeights({ ...calm, wind: 20 });
    expect(gale['bed:wind_heavy']).toBeGreaterThan(0.8);
    expect(gale['bed:wind_light']).toBe(0);
    expect(bedWeights({ ...calm, wind: 20, snow: 1 })['bed:blizzard']).toBeGreaterThan(0.8);
    expect(bedWeights({ ...calm, wind: 5 })['bed:wind_light']).toBeGreaterThan(0.4);
    for (const b of BEDS) expect(CUE_SPEC[b], b).toBeDefined();
  });
});

describe('a station on the dial', () => {
  it('is the synthesized song’s without the archive; titles are read from file names', () => {
    expect(stationName(0)).toBe(SONGS[0].name);
    expect(stationLabel(6)).toBe(SONGS[1].name);
    expect(nowOn(-1)).toBe(SONGS[4].name);
    expect(songTitle("ES_Sick Man's Blues - Peter Crosby")).toBe("Sick Man's Blues - Peter Crosby");
    expect(songTitle('country-rock-349183')).toBe('Country Rock');
    expect(songTitle('1877_peer-gynt-suite-no-1-op-46-i-morning')).toBe('Peer Gynt Suite No 1 Op 46 I Morning');
  });
});
