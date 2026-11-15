/**
 * Fish shadows (docs/DESIGN_V2.md 8.4, Animal Crossing's shadows): simple agents in the water near
 * the player. Each is one fish already — its species, length, and whether it is a big one — so what
 * is seen is what is caught. They gather in a jetty's zone and are sparse elsewhere; they shy away
 * from splashes and from someone wading near them; one that sees a float within 1.5 m comes to it.
 *
 * Pure, seeded, fixed step; the state (shadows and the random stream) is plain data.
 */
import type { Land } from '../onfoot/land';
import { TerrainPoint } from '../onfoot/land';
import { BIOMES } from '../world/biomes';
import { SPECIES, speciesFor, weightOf, type FishWeather, type Species, type WaterKind } from './species';

/** a small random stream whose state can be saved */
export class Stream {
  constructor(public s: number) {
    this.s = s | 0;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
}

/** water fishable here: deeper than this (m) */
export const FISHABLE_DEPTH = 0.4;

export interface WaterFacts {
  fishable: boolean;
  kind: WaterKind;
  level: number;
  depth: number;
  /** which lake / river: the road stretch it lies by (one old king per lake) */
  body: number;
}

/** what the water is at (x, z) */
export function waterAt(land: Land, x: number, z: number, tp: TerrainPoint, out: WaterFacts): WaterFacts {
  land.shape(x, z, tp);
  out.level = tp.wl;
  out.depth = Number.isFinite(tp.wl) ? tp.wl - tp.bed : 0;
  const frozen = tp.frozen > 0.5;
  const biome = BIOMES[tp.bt < 0.5 ? tp.ba : tp.bb]?.id ?? 'plains';
  // wkind: 1 lake, 2 river, 3 sea
  out.kind = frozen ? 'ice' : tp.wkind === 2 ? 'stream' : tp.wkind === 3 ? 'sea' : biome === 'desert' ? 'oasis' : 'lake';
  out.body = Math.floor(tp.s / 1250) * 4 + tp.wkind;
  // ice fishing (a hole and an auger) is a later package
  out.fishable = out.depth > FISHABLE_DEPTH && !frozen;
  return out;
}

export type ShadowState = 'roam' | 'flee' | 'come' | 'hooked';

export interface Shadow {
  id: number;
  species: string;
  size: 0 | 1 | 2 | 3;
  lengthCm: number;
  big: boolean;
  x: number;
  z: number;
  heading: number;
  state: ShadowState;
  /** seconds left in this state / until the next turn */
  t: number;
  /** the lake it belongs to */
  body: number;
}

export interface SchoolState {
  rng: number;
  next: number;
  spawnT: number;
  shadows: Shadow[];
  kingsTaken: number[];
}

/** the radius round the player where shadows live, and the counts kept there */
export const SCHOOL_R = 24;
export const IN_ZONE = 7;
export const OUT_ZONE = 2;

export interface Zone {
  x: number;
  z: number;
  r: number;
}

export interface FishEnv {
  hour: number;
  weather: FishWeather;
}

export class School {
  shadows: Shadow[] = [];
  readonly rng: Stream;
  private next = 1;
  private spawnT = 0;
  /** lakes whose old king has been caught */
  readonly kingsTaken = new Set<number>();
  private readonly tp = new TerrainPoint();
  private readonly wf: WaterFacts = { fishable: false, kind: 'lake', level: 0, depth: 0, body: 0 };
  private readonly list: Species[] = [];

  constructor(seed: number) {
    this.rng = new Stream(seed ^ 0x2f1c4a7);
  }

  /** step: keep the shadows near (cx, cz) alive, moving, and as many as the place holds */
  step(h: number, land: Land, cx: number, cz: number, env: FishEnv, zones: readonly Zone[]): void {
    let inZone: Zone | null = null;
    for (const z of zones) if ((z.x - cx) ** 2 + (z.z - cz) ** 2 < (z.r + SCHOOL_R) ** 2) inZone = z;
    // the far ones go
    this.shadows = this.shadows.filter((s) => s.state === 'hooked' || (s.x - cx) ** 2 + (s.z - cz) ** 2 < (SCHOOL_R + 10) ** 2);
    const want = inZone ? IN_ZONE : OUT_ZONE;
    this.spawnT -= h;
    if (this.shadows.length < want && this.spawnT <= 0) {
      this.spawnT = 0.8;
      this.spawn(land, cx, cz, env, inZone);
    }
    for (const s of this.shadows) this.move(s, h, land, inZone);
  }

  private spawn(land: Land, cx: number, cz: number, env: FishEnv, zone: Zone | null): void {
    const r = this.rng;
    for (let tries = 0; tries < 6; tries++) {
      // in a zone: inside it; elsewhere: anywhere round the player
      const a = r.next() * Math.PI * 2;
      const d = zone ? Math.sqrt(r.next()) * zone.r : 4 + r.next() * (SCHOOL_R - 4);
      const x = (zone ? zone.x : cx) + Math.cos(a) * d;
      const z = (zone ? zone.z : cz) + Math.sin(a) * d;
      if ((x - cx) ** 2 + (z - cz) ** 2 > SCHOOL_R * SCHOOL_R) continue;
      const w = waterAt(land, x, z, this.tp, this.wf);
      if (!w.fishable) continue;
      const sp = this.roll(w.kind, w.body, env);
      if (!sp) return;
      const big = r.next() < 0.1;
      const [lo, hi] = sp.len;
      const lengthCm = Math.round(big ? hi - (hi - lo) * 0.2 * r.next() : lo + (hi - lo) * 0.8 * r.next() ** 1.4);
      this.shadows.push({ id: this.next++, species: sp.id, size: sp.size, lengthCm, big, x, z, heading: r.next() * Math.PI * 2, state: 'roam', t: r.range(1, 4), body: w.body });
      return;
    }
  }

  private roll(kind: WaterKind, body: number, env: FishEnv): Species | null {
    const l = this.list;
    l.length = 0;
    speciesFor(kind, env.hour, env.weather, l);
    // one old king per lake: not if caught, and not two at once
    for (let i = l.length - 1; i >= 0; i--) {
      if (!l[i].onePerLake) continue;
      if (this.kingsTaken.has(body) || this.shadows.some((s) => s.species === l[i].id)) l.splice(i, 1);
    }
    if (l.length === 0) return null;
    let total = 0;
    for (const s of l) total += weightOf(s, env.weather);
    let u = this.rng.next() * total;
    for (const s of l) {
      u -= weightOf(s, env.weather);
      if (u < 0) return s;
    }
    return l[l.length - 1];
  }

  private move(s: Shadow, h: number, land: Land, zone: Zone | null): void {
    if (s.state === 'hooked' || s.state === 'come') return; // the line moves these
    s.t -= h;
    if (s.t <= 0) {
      if (s.state === 'flee') s.state = 'roam';
      s.t = this.rng.range(1.5, 4.5);
      s.heading += this.rng.range(-1.6, 1.6);
      // keep to the zone
      if (zone && (s.x - zone.x) ** 2 + (s.z - zone.z) ** 2 > zone.r * zone.r) s.heading = Math.atan2(zone.z - s.z, zone.x - s.x);
    }
    const v = s.state === 'flee' ? 2.6 : 0.35 + 0.1 * s.size;
    const nx = s.x + Math.cos(s.heading) * v * h;
    const nz = s.z + Math.sin(s.heading) * v * h;
    const w = waterAt(land, nx, nz, this.tp, this.wf);
    if (w.fishable && w.depth > 0.6) {
      s.x = nx;
      s.z = nz;
    } else {
      // the shore: turn back
      s.heading += Math.PI * (0.6 + 0.4 * this.rng.next());
    }
  }

  /** a splash at (x, z): those within r dart away for t seconds */
  scare(x: number, z: number, r: number, t = 3): void {
    for (const s of this.shadows) {
      if (s.state === 'hooked') continue;
      const dx = s.x - x;
      const dz = s.z - z;
      if (dx * dx + dz * dz > r * r) continue;
      s.state = 'flee';
      s.t = t;
      s.heading = Math.atan2(dz, dx) + this.rng.range(-0.4, 0.4);
    }
  }

  /** the roaming shadow nearest to (x, z) within r, or null */
  nearest(x: number, z: number, r: number): Shadow | null {
    let best: Shadow | null = null;
    let bd = r * r;
    for (const s of this.shadows) {
      if (s.state !== 'roam') continue;
      const d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d <= bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  remove(s: Shadow): void {
    const i = this.shadows.indexOf(s);
    if (i >= 0) this.shadows.splice(i, 1);
  }

  toJSON(): SchoolState {
    return { rng: this.rng.s, next: this.next, spawnT: this.spawnT, shadows: this.shadows.map((s) => ({ ...s })), kingsTaken: [...this.kingsTaken] };
  }

  load(s: SchoolState): this {
    this.rng.s = s.rng;
    this.next = s.next;
    this.spawnT = s.spawnT;
    this.shadows = s.shadows.map((x) => ({ ...x }));
    this.kingsTaken.clear();
    for (const k of s.kingsTaken) this.kingsTaken.add(k);
    return this;
  }
}

/** a species by id */
export function speciesById(id: string): Species | undefined {
  return SPECIES.find((s) => s.id === id);
}
