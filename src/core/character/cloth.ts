// Cloth that hangs from her and moves with her (docs/V3/plan/character-pv.md §5): the skirt of her nightdress and the
// ends of her halter tie. Painted Valley's cloak (src/figure/cloak.js) is the method: a grid of points held by threads
// of fixed length that pull when stretched and barely push (cloth folds, it doesn't spring), pulled by its weight,
// pushed by the air it moves through — so walking swings it, running lifts it out behind and a gust takes it aside —
// and kept out of her by a few rounded sticks. Stepped at 120 Hz whatever the frame rate.

import type { ClothSheet, Rope } from './dress';

export interface Capsule {
  a: [number, number, number];
  b: [number, number, number];
  r: number;
}

const STEP = 1 / 120;

export type Air = (x: number, y: number, z: number, out: number[]) => void;

export class Cloth {
  readonly n: number;
  readonly p: Float32Array;
  readonly prev: Float32Array;
  readonly normals: Float32Array;
  /** how deep in a fold each point is (what a painter shades) */
  readonly fold: Float32Array;
  /** the pinned points where they are now and were at the last step */
  readonly pins: Float32Array;
  readonly pinsBefore: Float32Array;
  private readonly pinned: Uint8Array;
  private readonly links: Float32Array;
  /** the threads split: the stiff ones (along and down) pulled every pass, the soft ones (across the diagonals, over two) every other */
  private readonly hard: Float32Array;
  private readonly soft: Float32Array;
  private left = 0;
  private time = 0;
  started = false;
  /** how many iterations of the threads a step */
  iterations = 4;
  /** what the air does to it (1 = a light fabric) */
  drag = 1.3;
  /** the most air (m/s) the cloth feels through it */
  maxAir = 3;
  /** how fast its swinging about her dies away (1/s) */
  relDamp = 5;
  /**
   * How far each column may swing from her body's down (cos of the angle, one per column; empty: free), measured from
   * its pin; and her body's down (set each update). Keeps a skirt from being flung up her back or caught up between her
   * legs as they scissor (the thighs' sticks overlap there): it may fly, it does not turn over.
   */
  swingCos = new Float32Array(0);
  /**
   * Where each point would be if the cloth were simply worn (skinned to her, set each update; empty: none), how far a
   * point may stray from there (m, one a row) and how much it is drawn back each step (one a point). It may fly and fold
   * about that; it cannot stay turned over, caught up or open like a door (the slit's flap).
   */
  home = new Float32Array(0);
  homeMax = new Float32Array(0);
  homePull = new Float32Array(0);
  readonly down = new Float32Array([0, -1, 0]);

  constructor(readonly sheet: ClothSheet) {
    const n = sheet.cols * sheet.rows;
    this.n = n;
    this.p = new Float32Array(sheet.rest);
    this.prev = new Float32Array(sheet.rest);
    this.normals = new Float32Array(n * 3);
    this.fold = new Float32Array(n);
    this.pins = new Float32Array(sheet.cols * 3);
    this.pinsBefore = new Float32Array(sheet.cols * 3);
    this.pinned = new Uint8Array(n);
    for (let i = 0; i < sheet.cols; i++) this.pinned[i] = 1;
    this.links = sheet.links;
    const hard: number[] = [], soft: number[] = [];
    for (let l = 0; l < sheet.links.length; l += 4) (sheet.links[l + 3] >= 0.99 ? hard : soft).push(sheet.links[l], sheet.links[l + 1], sheet.links[l + 2], sheet.links[l + 3]);
    this.hard = new Float32Array(hard);
    this.soft = new Float32Array(soft);
    this.computeNormals();
  }

  /** Pull a set of threads to their lengths once. */
  private pull(links: Float32Array): void {
    const p = this.p, pinned = this.pinned;
    for (let l = 0; l < links.length; l += 4) {
      const ia = links[l], ib = links[l + 1];
      const pa = pinned[ia], pbb = pinned[ib];
      if (pa && pbb) continue;
      const a = ia * 3, b = ib * 3, rest = links[l + 2], stiff = links[l + 3];
      const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      // threads pull when stretched and barely push when slack
      const k = ((d - rest) / d) * (d > rest ? stiff : stiff * 0.1);
      const wa = pa ? 0 : pbb ? 1 : 0.5, wb = pbb ? 0 : pa ? 1 : 0.5;
      p[a] += dx * k * wa; p[a + 1] += dy * k * wa; p[a + 2] += dz * k * wa;
      p[b] -= dx * k * wb; p[b + 1] -= dy * k * wb; p[b + 2] -= dz * k * wb;
    }
  }

  /** Hang it afresh from where the pins are now (a teleport, a first frame). `offset` moves the rest shape there. */
  hang(pins: Float32Array): void {
    const { cols } = this.sheet;
    this.pins.set(pins);
    this.pinsBefore.set(pins);
    // each column moved as its pin moved from rest
    for (let i = 0; i < cols; i++) {
      const dx = pins[i * 3] - this.sheet.rest[i * 3], dy = pins[i * 3 + 1] - this.sheet.rest[i * 3 + 1], dz = pins[i * 3 + 2] - this.sheet.rest[i * 3 + 2];
      for (let j = 0; j < this.sheet.rows; j++) {
        const k = (i + j * cols) * 3;
        this.p[k] = this.sheet.rest[k] + dx;
        this.p[k + 1] = this.sheet.rest[k + 1] + dy;
        this.p[k + 2] = this.sheet.rest[k + 2] + dz;
      }
    }
    this.prev.set(this.p);
    this.started = true;
    this.computeNormals();
  }

  /**
   * Advance by dt. `pins`: where the first row is now; `sticks`: her body; `air(x, y, z, out)`: the wind (m/s);
   * `floor`: the ground's height under her.
   */
  update(dt: number, pins: Float32Array, sticks: Capsule[], air: Air, floor: number): void {
    if (!this.started) return this.hang(pins);
    // a jump of more than a metre is a teleport
    if (Math.hypot(pins[0] - this.pins[0], pins[1] - this.pins[1], pins[2] - this.pins[2]) > 1) return this.hang(pins);
    this.pinsBefore.set(this.pins);
    this.pins.set(pins);
    this.left += Math.min(dt, 0.05);
    const steps = Math.min(6, Math.floor(this.left / STEP));
    if (steps <= 0) return;
    this.left -= steps * STEP;
    const { p, prev, normals, pinned } = this;
    const cols = this.sheet.cols;
    const wind = [0, 0, 0];
    for (let s = 0; s < steps; s++) {
      const u = (s + 1) / steps;
      this.time += STEP;
      this.computeNormals();
      // (one sample of the wind a step, at the waist: the skirt is half a metre across, the wind the same over it)
      air(pins[0], pins[1], pins[2], wind);
      // light cloth stops swinging about her quickly (the air in it, the rub on her legs): its speed beyond its pin's
      // fades at relDamp a second; its speed with her stays
      const keep = Math.exp(-this.relDamp * STEP);
      const pb0 = this.pinsBefore, pn0 = this.pins;
      for (let k = 0; k < this.n; k++) {
        if (pinned[k]) continue;
        const i = k * 3, ci = (k % cols) * 3;
        const ux = (pn0[ci] - pb0[ci]) / steps, uy = (pn0[ci + 1] - pb0[ci + 1]) / steps, uz = (pn0[ci + 2] - pb0[ci + 2]) / steps;
        const vx = ux + (p[i] - prev[i] - ux) * keep, vy = uy + (p[i + 1] - prev[i + 1] - uy) * keep, vz = uz + (p[i + 2] - prev[i + 2] - uz) * keep;
        // the air it meets: the wind less its own speed, felt across the cloth's face (no more than a breeze's worth: a
        // skirt in a run trails and flaps, it does not fly up)
        let rx = wind[0] - vx / STEP, ry = wind[1] - vy / STEP, rz = wind[2] - vz / STEP;
        const r2 = rx * rx + ry * ry + rz * rz;
        if (r2 > this.maxAir * this.maxAir) {
          const f = this.maxAir / Math.sqrt(r2);
          rx *= f; ry *= f; rz *= f;
        }
        const nx = normals[i], ny = normals[i + 1], nz = normals[i + 2];
        const across = rx * nx + ry * ny + rz * nz;
        const speed = Math.sqrt(rx * rx + ry * ry + rz * rz);
        const row = Math.floor(k / cols) / (this.sheet.rows - 1);
        const flutter = Math.sin(this.time * 10 - row * 6 + (k % cols) * 0.7) * 0.35 * speed * row;
        const ax = nx * (across * 0.9 + flutter) * this.drag + rx * 0.35, ay = -9.8 + ny * (across * 0.9 + flutter) * this.drag + ry * 0.12, az = nz * (across * 0.9 + flutter) * this.drag + rz * 0.35;
        prev[i] = p[i]; prev[i + 1] = p[i + 1]; prev[i + 2] = p[i + 2];
        p[i] += vx + ax * STEP * STEP;
        p[i + 1] += vy + ay * STEP * STEP;
        p[i + 2] += vz + az * STEP * STEP;
      }
      // the pins, eased from where they were to where they are over the steps
      const pb = this.pinsBefore, pn = this.pins;
      for (let c = 0; c < cols; c++) {
        const i = c * 3;
        p[i] = pb[i] + (pn[i] - pb[i]) * u;
        p[i + 1] = pb[i + 1] + (pn[i + 1] - pb[i + 1]) * u;
        p[i + 2] = pb[i + 2] + (pn[i + 2] - pb[i + 2]) * u;
      }
      for (let it = 0; it < this.iterations; it++) {
        this.pull(this.hard);
        if (it % 2 === 0) this.pull(this.soft);
        if (it % 2 === 1) this.collide(sticks, floor);
      }
      this.collide(sticks, floor);
      this.limitSwing();
      this.keepHome();
    }
    this.computeNormals();
    this.computeFolds();
  }

  /** each stick a pass: its start, its run, 1/length², radius, and the box round it (11 numbers) */
  private stickData = new Float32Array(0);

  private collide(sticks: Capsule[], floor: number): void {
    const p = this.p;
    const ns = sticks.length;
    if (this.stickData.length < ns * 14) this.stickData = new Float32Array(ns * 14);
    const S = this.stickData;
    for (let j = 0; j < ns; j++) {
      const s = sticks[j], o = j * 14;
      const r = s.r + 0.006;
      const ex = s.b[0] - s.a[0], ey = s.b[1] - s.a[1], ez = s.b[2] - s.a[2];
      const len2 = ex * ex + ey * ey + ez * ez;
      S[o] = s.a[0]; S[o + 1] = s.a[1]; S[o + 2] = s.a[2];
      S[o + 3] = ex; S[o + 4] = ey; S[o + 5] = ez;
      S[o + 6] = len2 > 1e-9 ? 1 / len2 : 0;
      S[o + 7] = r;
      S[o + 8] = Math.min(s.a[0], s.b[0]) - r; S[o + 9] = Math.max(s.a[0], s.b[0]) + r;
      S[o + 10] = Math.min(s.a[1], s.b[1]) - r; S[o + 11] = Math.max(s.a[1], s.b[1]) + r;
      S[o + 12] = Math.min(s.a[2], s.b[2]) - r; S[o + 13] = Math.max(s.a[2], s.b[2]) + r;
    }
    const pinned = this.pinned;
    for (let k = 0; k < this.n; k++) {
      if (pinned[k]) continue;
      const i = k * 3;
      let x = p[i], y = p[i + 1], z = p[i + 2];
      for (let j = 0; j < ns; j++) {
        const o = j * 14;
        if (x < S[o + 8] || x > S[o + 9] || y < S[o + 10] || y > S[o + 11] || z < S[o + 12] || z > S[o + 13]) continue;
        const ax = S[o], ay = S[o + 1], az = S[o + 2], ex = S[o + 3], ey = S[o + 4], ez = S[o + 5], r = S[o + 7];
        let t = ((x - ax) * ex + (y - ay) * ey + (z - az) * ez) * S[o + 6];
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = x - ax - ex * t, dy = y - ay - ey * t, dz = z - az - ez * t;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < r * r && d2 > 1e-12) {
          const d = Math.sqrt(d2), f = (r - d) / d;
          x += dx * f; y += dy * f; z += dz * f;
        }
      }
      if (y < floor + 0.01) y = floor + 0.01;
      p[i] = x; p[i + 1] = y; p[i + 2] = z;
    }
  }

  /** Each point drawn toward its home a little, and kept within its row's distance of it (the speed out past that lost). */
  private keepHome(): void {
    const home = this.home, cols = this.sheet.cols;
    if (home.length !== this.n * 3 || this.homeMax.length !== this.sheet.rows || this.homePull.length !== this.n) return;
    const p = this.p, prev = this.prev, pinned = this.pinned, max = this.homeMax, pull = this.homePull;
    for (let k = 0; k < this.n; k++) {
      if (pinned[k]) continue;
      const i = k * 3, j = (k / cols) | 0;
      const k1 = pull[k];
      p[i] += (home[i] - p[i]) * k1; p[i + 1] += (home[i + 1] - p[i + 1]) * k1; p[i + 2] += (home[i + 2] - p[i + 2]) * k1;
      const dx = p[i] - home[i], dy = p[i + 1] - home[i + 1], dz = p[i + 2] - home[i + 2];
      const d2 = dx * dx + dy * dy + dz * dz, m = max[j];
      if (d2 > m * m) {
        const f = m / Math.sqrt(d2);
        const nx = home[i] + dx * f, ny = home[i + 1] + dy * f, nz = home[i + 2] + dz * f;
        prev[i] += nx - p[i]; prev[i + 1] += ny - p[i + 1]; prev[i + 2] += nz - p[i + 2];
        p[i] = nx; p[i + 1] = ny; p[i + 2] = nz;
      }
    }
  }

  /**
   * Each piece of a column (row to row, from the top down) no further round from her body's down than that column may
   * swing (see swingCos); the speed it had past that is lost.
   */
  private limitSwing(): void {
    const cols = this.sheet.cols, lim = this.swingCos;
    if (lim.length !== cols) return;
    const p = this.p, prev = this.prev, pinned = this.pinned;
    const dx = this.down[0], dy = this.down[1], dz = this.down[2];
    for (let k = cols; k < this.n; k++) {
      if (pinned[k]) continue;
      const c = k % cols, i = k * 3, pi = i - cols * 3;
      const vx = p[i] - p[pi], vy = p[i + 1] - p[pi + 1], vz = p[i + 2] - p[pi + 2];
      const L = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (L < 1e-5) continue;
      const along = vx * dx + vy * dy + vz * dz;
      const cosMax = lim[c];
      if (along >= L * cosMax) continue;
      // turned back to the edge of its cone, as long as it was
      let qx = vx - dx * along, qy = vy - dy * along, qz = vz - dz * along;
      const ql = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1;
      qx /= ql; qy /= ql; qz /= ql;
      const sinMax = Math.sqrt(Math.max(0, 1 - cosMax * cosMax));
      const nx = p[pi] + (dx * cosMax + qx * sinMax) * L, ny = p[pi + 1] + (dy * cosMax + qy * sinMax) * L, nz = p[pi + 2] + (dz * cosMax + qz * sinMax) * L;
      prev[i] += nx - p[i]; prev[i + 1] += ny - p[i + 1]; prev[i + 2] += nz - p[i + 2];
      p[i] = nx; p[i + 1] = ny; p[i + 2] = nz;
    }
  }

  computeNormals(): void {
    const { cols, rows, closed } = this.sheet;
    const p = this.p, n = this.normals;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = (i + j * cols) * 3;
        const il = closed ? (i - 1 + cols) % cols : Math.max(i - 1, 0), ir = closed ? (i + 1) % cols : Math.min(i + 1, cols - 1);
        const l = (il + j * cols) * 3, r = (ir + j * cols) * 3;
        const up = (i + Math.max(j - 1, 0) * cols) * 3, dn = (i + Math.min(j + 1, rows - 1) * cols) * 3;
        const ax = p[r] - p[l], ay = p[r + 1] - p[l + 1], az = p[r + 2] - p[l + 2];
        const bx = p[dn] - p[up], by = p[dn + 1] - p[up + 1], bz = p[dn + 2] - p[up + 2];
        // round × down looks out of the skirt
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        // (round runs to her left: (right − left) × (down − up) points in; turned out)
        n[k] = -nx / len; n[k + 1] = -ny / len; n[k + 2] = -nz / len;
      }
    }
  }

  private computeFolds(): void {
    const { cols, rows, closed } = this.sheet;
    const p = this.p, n = this.normals;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = (i + j * cols) * 3;
        const il = closed ? (i - 1 + cols) % cols : Math.max(i - 1, 0), ir = closed ? (i + 1) % cols : Math.min(i + 1, cols - 1);
        const l = (il + j * cols) * 3, r = (ir + j * cols) * 3;
        this.fold[i + j * cols] = (p[l] + p[r] - 2 * p[k]) * n[k] + (p[l + 1] + p[r + 1] - 2 * p[k + 1]) * n[k + 1] + (p[l + 2] + p[r + 2] - 2 * p[k + 2]) * n[k + 2];
      }
    }
  }
}

/** A ribbon's free end: a chain of points from a pinned first one, swung by her and the wind. */
export class RopeSim {
  readonly n: number;
  readonly p: Float32Array;
  readonly prev: Float32Array;
  private readonly rest: number[] = [];
  private left = 0;
  started = false;
  constructor(readonly rope: Rope) {
    this.n = rope.rest.length / 3;
    this.p = new Float32Array(rope.rest);
    this.prev = new Float32Array(rope.rest);
    for (let k = 0; k + 1 < this.n; k++) {
      const a = k * 3, b = a + 3;
      this.rest.push(Math.hypot(rope.rest[b] - rope.rest[a], rope.rest[b + 1] - rope.rest[a + 1], rope.rest[b + 2] - rope.rest[a + 2]));
    }
  }
  update(dt: number, pin: number[], sticks: Capsule[], air: Air): void {
    const { p, prev } = this;
    if (!this.started || Math.hypot(pin[0] - p[0], pin[1] - p[1], pin[2] - p[2]) > 1) {
      for (let k = 0; k < this.n; k++) {
        p[k * 3] = this.rope.rest[k * 3] - this.rope.rest[0] + pin[0];
        p[k * 3 + 1] = this.rope.rest[k * 3 + 1] - this.rope.rest[1] + pin[1];
        p[k * 3 + 2] = this.rope.rest[k * 3 + 2] - this.rope.rest[2] + pin[2];
      }
      prev.set(p);
      this.started = true;
      return;
    }
    this.left += Math.min(dt, 0.05);
    const steps = Math.min(6, Math.floor(this.left / STEP));
    this.left -= steps * STEP;
    const wind = [0, 0, 0];
    for (let s = 0; s < steps; s++) {
      for (let k = 1; k < this.n; k++) {
        const i = k * 3;
        const vx = (p[i] - prev[i]) * 0.985, vy = (p[i + 1] - prev[i + 1]) * 0.985, vz = (p[i + 2] - prev[i + 2]) * 0.985;
        air(p[i], p[i + 1], p[i + 2], wind);
        prev[i] = p[i]; prev[i + 1] = p[i + 1]; prev[i + 2] = p[i + 2];
        p[i] += vx + (wind[0] - vx / STEP) * 0.5 * STEP * STEP;
        p[i + 1] += vy + (-9.8 + (wind[1] - vy / STEP) * 0.2) * STEP * STEP;
        p[i + 2] += vz + (wind[2] - vz / STEP) * 0.5 * STEP * STEP;
      }
      p[0] = pin[0]; p[1] = pin[1]; p[2] = pin[2];
      for (let it = 0; it < 4; it++) {
        for (let k = 0; k + 1 < this.n; k++) {
          const a = k * 3, b = a + 3;
          const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
          const d = Math.hypot(dx, dy, dz) || 1e-6;
          const f = (d - this.rest[k]) / d;
          const wa = k === 0 ? 0 : 0.5, wb = k === 0 ? 1 : 0.5;
          p[a] += dx * f * wa; p[a + 1] += dy * f * wa; p[a + 2] += dz * f * wa;
          p[b] -= dx * f * wb; p[b + 1] -= dy * f * wb; p[b + 2] -= dz * f * wb;
        }
        for (let k = 1; k < this.n; k++) {
          const i = k * 3;
          for (const st of sticks) {
            const r = st.r + 0.008;
            const ex = st.b[0] - st.a[0], ey = st.b[1] - st.a[1], ez = st.b[2] - st.a[2];
            const len2 = ex * ex + ey * ey + ez * ez;
            const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((p[i] - st.a[0]) * ex + (p[i + 1] - st.a[1]) * ey + (p[i + 2] - st.a[2]) * ez) / len2)) : 0;
            const dx = p[i] - st.a[0] - ex * t, dy = p[i + 1] - st.a[1] - ey * t, dz = p[i + 2] - st.a[2] - ez * t;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < r * r && d2 > 1e-12) {
              const d = Math.sqrt(d2), f = (r - d) / d;
              p[i] += dx * f; p[i + 1] += dy * f; p[i + 2] += dz * f;
            }
          }
        }
      }
    }
  }
}
