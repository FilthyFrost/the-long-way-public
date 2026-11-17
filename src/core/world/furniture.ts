/**
 * What an old road still carries along its edges (docs/DESIGN_V2.md 4.5, W4): the things that say
 * "this was built for driving" and that a driver steers by.
 *
 *   delineators  a white post with a red band every 50 m on both sides, every 25 m through a bend
 *   guard rails  where the verge falls away, round the outside of a tight bend, up to a bridge
 *   chevrons     boards on the outside of the tightest bends, facing whoever comes
 *   km stones    one a kilometre, on the right
 *
 * A good part of it is gone or leaning. Everything is a pure function of the road and the seed, in
 * blocks of 256 m; the scene draws it into the same mesh as the poles. The rails are solids that stop a
 * car; the posts and the boards are light ones that a car lays flat (`knock`) — the one thing here that
 * is not a function of the seed, and the plan remembers it for as long as the journey lasts.
 */
import { hash2 } from '../math/rng';
import { Solid, type SolidSource } from './solids';
import { SpineSample } from './spine';
import type { TerrainPoint, World } from './terrain';
import type { River } from './water';

/** metres of road per block */
export const FURNITURE_BLOCK = 256;
/** a rail post every so many metres */
export const RAIL_STEP = 4;
/** where a rail stands, and a delineator (m from the centre line) */
export const RAIL_AT = 4.72;
export const POST_AT = 4.3;
/** the tag of a delineator's solid: light, a car lays it flat */
export const POST_TAG = 'light:post';

export type PostKind = 'delineator' | 'chevron' | 'kmstone';

export interface RoadPost {
  kind: PostKind;
  s: number;
  /** +1 right, −1 left */
  side: number;
  x: number;
  y: number;
  z: number;
  /** heading of the road there */
  phi: number;
  /** 0 standing, 1 leaning, 2 laid flat by a car */
  state: number;
  /** which way it lies when flat (rad, on the plan) */
  fall: number;
  /** a number for whoever draws it to vary by */
  h: number;
}

/** a rail along one edge between two arc lengths (whole RAIL_STEPs); `gone` marks the lengths that are missing */
export interface RailRun {
  side: number;
  s0: number;
  s1: number;
}

interface Block {
  posts: RoadPost[];
  rails: RailRun[];
  solids: Solid[];
}

const st = new SpineSample();

export class Furniture implements SolidSource {
  private readonly blocks = new Map<number, Block>();
  private readonly seed: number;
  private readonly br: { river: River | null; mask: number } = { river: null, mask: 0 };
  /** what cars have laid flat: kind|s|side → the way it fell */
  private readonly flat = new Map<string, number>();

  constructor(
    private readonly world: World,
    private readonly tp: TerrainPoint,
    seed: number,
  ) {
    this.seed = hash2(seed | 0, 0xf0a7, 61);
  }

  /** which side is the outside of the bend at a road point: the heading turns towards +z (the right) when kappa > 0 */
  static outer(kappa: number): number {
    return kappa > 0 ? -1 : 1;
  }

  /** does the edge on `side` at arc length s want a rail? */
  private wantsRail(s: number, side: number): boolean {
    const world = this.world;
    const tp = this.tp;
    world.spine.at(s, st);
    const kappa = st.kappa;
    const nx = -Math.sin(st.phi) * side;
    const nz = Math.cos(st.phi) * side;
    const x = st.x;
    const z = st.z;
    // not on a bridge (it has its own railings), not where a place opens onto the road
    world.water.bridgeAt(s, this.br);
    // (the rail runs right up to where the deck's own railing takes over)
    if (this.br.mask > 0.9) return false;
    world.shape(x + nx * 5.2, z + nz * 5.2, tp);
    if (tp.site > 0.05 || tp.plot > 0.05) return false;
    const h5 = tp.h;
    // up to a bridge, on both sides
    if (this.br.mask > 0) return true;
    world.water.bridgeAt(s + 34, this.br);
    const ahead = this.br.mask;
    world.water.bridgeAt(s - 34, this.br);
    if (ahead > 0.5 || this.br.mask > 0.5) return true;
    // where the land drops away beyond the shoulder, or stands in water
    world.shape(x + nx * 13, z + nz * 13, tp);
    if (h5 - tp.bed > 2.3) return true;
    if (tp.wl > -1e8 && tp.wl > tp.bed && h5 - tp.wl > 0.8) return true;
    // …or where a lake or a river lies a little further off, below the road: a shore road is railed
    world.shape(x + nx * 24, z + nz * 24, tp);
    if (tp.wl > -1e8 && tp.wl > tp.bed + 0.25 && h5 - tp.wl > 1.0) return true;
    // round the outside of a tight bend
    const k = kappa < 0 ? -kappa : kappa;
    return k > 1 / 130 && Furniture.outer(kappa) === side;
  }

  private build(b: number): Block {
    const world = this.world;
    const sp = world.spine;
    const blk: Block = { posts: [], rails: [], solids: [] };
    const sA = b * FURNITURE_BLOCK;
    if (sA < 0) return blk;
    const n = FURNITURE_BLOCK / RAIL_STEP;
    // ---- rails: wanted lengths, short gaps closed, short stubs dropped
    for (const side of [-1, 1]) {
      const want: boolean[] = [];
      for (let i = -3; i <= n + 3; i++) want.push(sA + i * RAIL_STEP > 40 && this.wantsRail(sA + (i + 0.5) * RAIL_STEP, side));
      const has: boolean[] = [];
      for (let i = 0; i < n; i++) {
        // (a rail runs a little past whatever it guards, one length either way — but never onto a bridge's
        // own deck, nor across the mouth of a place)
        let ok = want[i + 3] || want[i + 2] || want[i + 4];
        if (ok && !want[i + 3]) {
          const sm = sA + (i + 0.5) * RAIL_STEP;
          world.water.bridgeAt(sm, this.br);
          sp.at(sm, st);
          world.shape(st.x - Math.sin(st.phi) * side * 5.2, st.z + Math.cos(st.phi) * side * 5.2, this.tp);
          if (this.br.mask > 0.9 || this.tp.site > 0.05 || this.tp.plot > 0.05) ok = false;
        }
        has.push(ok);
      }
      let i = 0;
      while (i < n) {
        if (!has[i]) {
          i++;
          continue;
        }
        let j = i;
        while (j < n && has[j]) j++;
        // (a stub of one or two lengths in the middle of nowhere guards nothing; at a block's edge it may be the end of a longer one)
        if (j - i >= 4 || i === 0 || j === n) {
          // lengths gone to the years: one in fourteen, never the first of a run, and never two within
          // a few lengths of each other (a rail in dashes reads as a mistake, not as age)
          let from = i;
          let last = -9;
          for (let q = i; q <= j; q++) {
            let gone = q < j && q > i && q - last > 5 && (hash2(Math.round(sA / RAIL_STEP) + q, side + 7, this.seed) & 0xff) < 18;
            if (gone) {
              // (the lengths that lead onto a bridge are the ones somebody kept mended)
              world.water.bridgeAt(sA + q * RAIL_STEP + 20, this.br);
              const ahead = this.br.mask;
              world.water.bridgeAt(sA + q * RAIL_STEP - 16, this.br);
              if (ahead > 0 || this.br.mask > 0) gone = false;
            }
            if (q === j || gone) {
              if (q > from) blk.rails.push({ side, s0: sA + from * RAIL_STEP, s1: sA + q * RAIL_STEP });
              from = q + 1;
              if (gone) last = q;
            }
          }
        }
        i = j;
      }
    }
    // rails keep cars on the road: one thin solid per length
    for (const r of blk.rails) {
      for (let s = r.s0; s < r.s1 - 1e-6; s += RAIL_STEP) {
        sp.at(s + RAIL_STEP / 2, st);
        const x = st.x - Math.sin(st.phi) * r.side * RAIL_AT;
        const z = st.z + Math.cos(st.phi) * r.side * RAIL_AT;
        world.shape(x, z, this.tp);
        blk.solids.push(new Solid().set(x, z, RAIL_STEP / 2 + 0.05, 0.09, st.phi, this.tp.h - 0.3, this.tp.h + 0.78, false, 'road:rail'));
      }
    }
    const railed = (s: number, side: number): boolean => blk.rails.some((r) => r.side === side && s >= r.s0 - 1 && s <= r.s1 + 1);
    // ---- delineators, chevrons, the kilometre stone
    for (let s = Math.ceil(sA / 25) * 25; s < sA + FURNITURE_BLOCK; s += 25) {
      if (s < 50) continue;
      sp.at(s, st);
      const k = st.kappa < 0 ? -st.kappa : st.kappa;
      const curved = k > 1 / 400;
      world.water.bridgeAt(s, this.br);
      if (this.br.mask > 0.02) continue;
      for (const side of [-1, 1]) {
        if (!curved && Math.round(s / 25) % 2 === 1) continue;
        const h = hash2(Math.round(s / 25), side + 3, this.seed);
        // one in seven is gone; a rail does the job where there is one
        if ((h & 0xff) < 36 || railed(s, side)) continue;
        this.post(blk, 'delineator', s, side, POST_AT, (h >>> 8) & 0xff, h);
      }
      if (s % 1000 === 0) this.post(blk, 'kmstone', s, 1, 5.5, 255, hash2(s, 99, this.seed));
    }
    for (let s = Math.ceil(sA / 16) * 16; s < sA + FURNITURE_BLOCK; s += 16) {
      if (s < 80) continue;
      sp.at(s, st);
      const k = st.kappa < 0 ? -st.kappa : st.kappa;
      if (k < 1 / 105) continue;
      const side = Furniture.outer(st.kappa);
      const h = hash2(Math.round(s / 16), 0xc4e, this.seed);
      if ((h & 0xff) < 50) continue;
      this.post(blk, 'chevron', s, side, 6.1, (h >>> 8) & 0xff, h);
    }
    return blk;
  }

  private post(blk: Block, kind: PostKind, s: number, side: number, off: number, lean: number, h: number): void {
    const world = this.world;
    world.spine.at(s, st);
    const x = st.x - Math.sin(st.phi) * side * off;
    const z = st.z + Math.cos(st.phi) * side * off;
    world.shape(x, z, this.tp);
    // nothing stands in water or on the ground of a place
    if (this.tp.site > 0.05 || this.tp.plot > 0.05 || (this.tp.wl > -1e8 && this.tp.wl > this.tp.bed - 0.2)) return;
    const fall = this.flat.get(`${kind}|${s}|${side}`);
    blk.posts.push({ kind, s, side, x, y: this.tp.h, z, phi: st.phi, state: fall !== undefined ? 2 : lean < 40 ? 1 : 0, fall: fall ?? 0, h });
    // what lies flat keeps nobody out; a kilometre stone is too low and too far from the road to matter
    if (fall !== undefined || kind === 'kmstone') return;
    const sd = kind === 'chevron' ? new Solid().set(x, z, 0.66, 0.05, st.phi + Math.PI / 2, this.tp.h - 0.3, this.tp.h + 1.9, false, 'road:board') : new Solid().set(x, z, 0.07, 0, 0, this.tp.h - 0.3, this.tp.h + 1.16, false, POST_TAG);
    sd.ref = blk.posts.length - 1;
    blk.solids.push(sd);
  }

  /**
   * A car ran into a delineator or a chevron board: it goes down the way the car was going and stays
   * down. Returns the arc length it stood at (for whoever draws that stretch of road), or NaN if the
   * solid is not one of the road's light things.
   */
  knock(solid: Solid, vx: number, vz: number): number {
    if (solid.tag !== POST_TAG && solid.tag !== 'road:board') return NaN;
    const s = this.world.spine.sAtX(solid.x);
    for (let b = Math.max(0, Math.floor((s - 80) / FURNITURE_BLOCK)); b * FURNITURE_BLOCK < s + 80; b++) {
      const blk = this.blocks.get(b);
      const i = blk ? blk.solids.indexOf(solid) : -1;
      if (!blk || i < 0) continue;
      const post = blk.posts[solid.ref];
      if (!post) return NaN;
      post.state = 2;
      post.fall = Math.atan2(vz, vx);
      this.flat.set(`${post.kind}|${post.s}|${post.side}`, post.fall);
      blk.solids.splice(i, 1);
      return post.s;
    }
    return NaN;
  }

  private block(b: number): Block {
    let blk = this.blocks.get(b);
    if (!blk) {
      blk = this.build(b);
      this.blocks.set(b, blk);
      // (a journey passes thousands of blocks: keep the last few hundred)
      if (this.blocks.size > 400) {
        const first = this.blocks.keys().next().value as number;
        this.blocks.delete(first);
      }
    }
    return blk;
  }

  /** posts and rails of the blocks that cover [s0, s1) */
  between(s0: number, s1: number, posts: RoadPost[], rails: RailRun[]): void {
    for (let b = Math.max(0, Math.floor(s0 / FURNITURE_BLOCK)); b * FURNITURE_BLOCK < s1; b++) {
      const blk = this.block(b);
      for (const p of blk.posts) if (p.s >= s0 && p.s < s1) posts.push(p);
      for (const r of blk.rails) if (r.s1 > s0 && r.s0 < s1) rails.push(r);
    }
  }

  solidsNear(x: number, z: number, r: number, out: Solid[]): void {
    const s = this.world.spine.sAtX(x);
    const reach = r + 12;
    for (let b = Math.max(0, Math.floor((s - reach - 60) / FURNITURE_BLOCK)); b * FURNITURE_BLOCK < s + reach + 60; b++) {
      for (const sd of this.block(b).solids) {
        const dx = sd.x - x;
        const dz = sd.z - z;
        const lim = r + sd.hx + 0.2;
        if (dx * dx + dz * dz < lim * lim) out.push(sd);
      }
    }
  }
}
