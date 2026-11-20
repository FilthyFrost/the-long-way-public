// How bright and how full a sound is: its spectral centroid and how its power falls into bands (low < 400 Hz,
// mid 400–2000, high > 2000), for the synthesized asphalt squeal and roll against the archive's recordings.
//   npx tsx harness/sim/m4fix_spectra.ts
import fs from 'node:fs';
import { recipe as recipeFor } from '../../src/game/modcar/foley';
import { Rng } from '../../src/game/modcar/synth';

const ARCHIVE = process.env.TLW_AUDIO_ARCHIVE ?? 'D:/公路游戏音频整理-20261118/最终可用音频';

function wav(file: string): { x: Float32Array; sr: number } {
  const b = fs.readFileSync(file);
  let p = 12;
  let sr = 44100;
  let ch = 1;
  let bits = 16;
  let fmt = 1;
  while (p < b.length - 8) {
    const id = b.toString('ascii', p, p + 4);
    const len = b.readUInt32LE(p + 4);
    if (id === 'fmt ') {
      fmt = b.readUInt16LE(p + 8);
      ch = b.readUInt16LE(p + 10);
      sr = b.readUInt32LE(p + 12);
      bits = b.readUInt16LE(p + 22);
    } else if (id === 'data') {
      const n = Math.floor(len / (bits / 8) / ch);
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let c = 0; c < ch; c++) {
          const o = p + 8 + (i * ch + c) * (bits / 8);
          s += fmt === 3 ? b.readFloatLE(o) : bits === 16 ? b.readInt16LE(o) / 32768 : bits === 24 ? (b.readIntLE(o, 3) / 8388608) : b.readInt32LE(o) / 2147483648;
        }
        x[i] = s / ch;
      }
      return { x, sr };
    }
    p += 8 + len + (len & 1);
  }
  throw new Error('no data: ' + file);
}

function spectrum(x: Float32Array, sr: number): { centroid: number; low: number; mid: number; high: number } {
  const N = 4096;
  const bins = new Float64Array(N / 2);
  let frames = 0;
  for (let s = 0; s + N <= x.length; s += N / 2) {
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
    // (an in-place radix-2 FFT)
    for (let i = 1, j = 0; i < N; i++) {
      let bit = N >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= N; len <<= 1) {
      const a = (-2 * Math.PI) / len;
      for (let i = 0; i < N; i += len) {
        for (let k = 0; k < len / 2; k++) {
          const wr = Math.cos(a * k);
          const wi = Math.sin(a * k);
          const ur = re[i + k];
          const ui = im[i + k];
          const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
          const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
          re[i + k] = ur + vr;
          im[i + k] = ui + vi;
          re[i + k + len / 2] = ur - vr;
          im[i + k + len / 2] = ui - vi;
        }
      }
    }
    for (let k = 0; k < N / 2; k++) bins[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  let tot = 0;
  let wsum = 0;
  let low = 0;
  let mid = 0;
  let high = 0;
  for (let k = 1; k < N / 2; k++) {
    const f = (k * sr) / N;
    const p = bins[k];
    tot += p;
    wsum += p * f;
    if (f < 400) low += p;
    else if (f < 2000) mid += p;
    else high += p;
  }
  void frames;
  return { centroid: wsum / tot, low: low / tot, mid: mid / tot, high: high / tot };
}

const show = (name: string, s: ReturnType<typeof spectrum>): void =>
  console.log(`${name.padEnd(34)} centroid ${Math.round(s.centroid).toString().padStart(5)} Hz   low ${(100 * s.low).toFixed(0).padStart(3)}%  mid ${(100 * s.mid).toFixed(0).padStart(3)}%  high ${(100 * s.high).toFixed(0).padStart(3)}%`);

const sr = 48000;
for (const kind of ['skid_asphalt', 'roll_asphalt'] as const) show(`synth ${kind}`, spectrum(recipeFor(kind)(sr, new Rng(7)), sr));
for (const f of ['L_lib/01_车辆/行驶与轮胎/AsphaltSkidNoise__u1200_resources.wav', 'L_lib/01_车辆/行驶与轮胎/AsphaltWheelNoise__u1383_resources.wav', 'A_lib/01_车辆/行驶与碰撞/vehicle_tire_braking_gravel__w1047007192.wav']) {
  const { x, sr: r } = wav(`${ARCHIVE}/${f}`);
  show(f.split('/').pop()!.replace(/__.*$/, ''), spectrum(x, r));
}
