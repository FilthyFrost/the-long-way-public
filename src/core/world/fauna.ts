/**
 * What lives at the places by the road (docs/DESIGN_V2.md 8.5, 4.6): a few deer at the salt lick
 * below a hunter's stand, ducks on the water off a jetty.
 *
 * The approach matters more than the shot, so the animals are mostly ears and noses:
 *   they HEAR a threat within the distance its noise carries (a running walker 40 m, a walking one
 *   20 m, a crouching one 8 m; an engine much further),
 *   they SEE it within a shorter distance when it stands in front of them (they see nearly all
 *   round, but not behind),
 * and what they do about it is always the same, readable sequence: heads come up (alert, three
 * seconds), and if whatever it was keeps coming, they are gone — sixty to a hundred metres, then
 * they stand and look back. Left alone they graze, look about, wander, and come back to the lick.
 * At dawn and at dusk the whole herd is out; by day half of it lies up in the wood.
 *
 * Pure and seeded, stepped at a fixed tenth of a second: the same approach frightens the same deer.
 */
import { Rng, hash2 } from '../math/rng';
import type { Site } from './sites';
import type { TerrainPoint, World } from './terrain';

export type Species = 'deer' | 'reindeer' | 'duck';
export type AnimalState = 'graze' | 'look' | 'walk' | 'alert' | 'flee';

export interface SpeciesDef {
  /** how many make a herd */
  herd: readonly [number, number];
  /** walking and fleeing speed (m/s) */
  walk: number;
  run: number;
  /** on the water rather than the land */
  swims: boolean;
  /** shoulder height (m), for whoever draws it */
  height: number;
}

export const SPECIES: Record<Species, SpeciesDef> = {
  deer: { herd: [3, 6], walk: 1.1, run: 10, swims: false, height: 1.0 },
  reindeer: { herd: [4, 7], walk: 1.0, run: 9, swims: false, height: 1.1 },
  duck: { herd: [2, 5], walk: 0.35, run: 2.2, swims: true, height: 0.2 },
};

/** something the animals may notice: a walker, a car */
export interface Threat {
  x: number;
  z: number;
  /** how far its noise carries (m) */
  heard: number;
  /** how far off it is seen when in front of them (m) */
  seen: number;
}

export class Animal {
  id = '';
  species: Species = 'deer';
  /** 1 = full grown; a young one is smaller. Stags carry antlers */
  size = 1;
  antlers = false;
  x = 0;
  y = 0;
  z = 0;
  /** heading (rad): it faces (cos, sin) on the plan */
  heading = 0;
  speed = 0;
  state: AnimalState = 'graze';
  /** seconds left in this state */
  t = 0;
  /** where it is going (walk, flee) */
  tx = 0;
  tz = 0;
  /** legs: stride phase (rad). Head: 0 down in the grass … 1 up */
  stride = 0;
  head = 0;
  /** lying up in the wood: not to be drawn, cannot be frightened */
  hidden = false;
}

export class Herd {
  animals: Animal[] = [];
  /** seconds since something last frightened it */
  calm = 1e9;
  /** simulated time carried over between steps */
  acc = 0;
  constructor(
    readonly id: string,
    readonly species: Species,
    readonly homeX: number,
    readonly homeZ: number,
    readonly radius: number,
    readonly rng: Rng,
  ) {}
}

const STEP = 0.1;
const TAU = 6.283185307179586;

/** how much of a herd is out at this hour: all of it at dawn and dusk, half by day, a third at night */
export function presence(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const bump = (c: number, w: number): number => Math.max(0, 1 - Math.abs(h - c) / w);
  return Math.min(1, Math.max(h > 8 && h < 17 ? 0.55 : 0.34, bump(6.5, 2.2) * 1.4, bump(18.5, 2.4) * 1.4));
}

export class Fauna {
  private readonly herds = new Map<string, Herd>();
  private readonly sites: Site[] = [];
  /** the herds being simulated now (near enough to matter) */
  readonly awake: Herd[] = [];

  constructor(
    private readonly world: World,
    private readonly tp: TerrainPoint,
  ) {}

  /** the herd living at a site (made the first time it is asked for), or null if nothing lives there */
  herdOf(site: Site): Herd | null {
    if (site.zoneR <= 0) return null;
    let h = this.herds.get(site.id);
    if (h) return h;
    let species: Species;
    if (site.kind === 'hide') species = site.biome === 'alpine' ? 'reindeer' : 'deer';
    else if (site.kind === 'jetty' && site.zoneR > 10) species = 'duck';
    else return null;
    const def = SPECIES[species];
    const rng = new Rng(hash2(site.seed, 0xfa0a, 31));
    h = new Herd(site.id, species, site.zoneX, site.zoneZ, species === 'duck' ? site.zoneR * 1.6 : 38, rng);
    const n = def.herd[0] + rng.int(def.herd[1] - def.herd[0] + 1);
    for (let i = 0; i < n; i++) {
      const a = new Animal();
      a.id = `${site.id}/a${i}`;
      a.species = species;
      a.antlers = species !== 'duck' && (i === 0 || (species === 'reindeer' && rng.next() < 0.6));
      a.size = i > 0 && rng.next() < 0.3 ? 0.68 : 0.92 + 0.16 * rng.next();
      this.scatter(h, a, 0.55);
      a.heading = rng.next() * TAU;
      a.t = 2 + 8 * rng.next();
      h.animals.push(a);
    }
    this.herds.set(site.id, h);
    return h;
  }

  /** is (x, z) somewhere this kind of animal can stand (or float)? leaves the height in this.tp */
  private fits(h: Herd, x: number, z: number): boolean {
    const tp = this.tp;
    this.world.shape(x, z, tp);
    const wet = tp.wl > -1e8 && tp.wl > tp.bed + 0.05 && tp.frozen < 0.5;
    if (SPECIES[h.species].swims) return wet && tp.wl - tp.bed > 0.25;
    return !wet && tp.zone === 0 && tp.site < 0.2 && (tp.d > 14 || tp.d < -14);
  }

  private heightAt(h: Herd, x: number, z: number): number {
    const tp = this.tp;
    this.world.shape(x, z, tp);
    return SPECIES[h.species].swims && tp.wl > tp.bed ? tp.wl : tp.h;
  }

  /** put an animal somewhere it fits, within `spread` of the herd's range from home */
  private scatter(h: Herd, a: Animal, spread: number): void {
    for (let tries = 0; tries < 12; tries++) {
      const ang = h.rng.next() * TAU;
      const r = h.radius * spread * Math.sqrt(h.rng.next());
      const x = h.homeX + Math.cos(ang) * r;
      const z = h.homeZ + Math.sin(ang) * r;
      if (!this.fits(h, x, z) && tries < 11) continue;
      a.x = x;
      a.z = z;
      a.y = this.heightAt(h, x, z);
      return;
    }
  }

  /**
   * Step everything near (px, pz) by dt seconds.
   * @param hour  hour of the day (who is out)
   * @param threats what there is to be afraid of
   */
  update(dt: number, px: number, pz: number, hour: number, threats: readonly Threat[]): void {
    const s = this.world.spine.sAtX(px);
    this.sites.length = 0;
    this.awake.length = 0;
    for (const site of this.world.sites.between(s - 1500, s + 1500, this.sites)) {
      if (site.zoneR <= 0) continue;
      const d = Math.hypot(site.zoneX - px, site.zoneZ - pz);
      if (d > 650) continue;
      const h = this.herdOf(site);
      if (!h) continue;
      this.awake.push(h);
      // who is out at this hour: the first so many of the herd, the stag always among them
      const out = Math.max(1, Math.round(h.animals.length * presence(hour)));
      for (let i = 0; i < h.animals.length; i++) {
        const a = h.animals[i];
        const hide = i >= out;
        // (they come and go where nobody is looking: only when far from every threat)
        if (hide !== a.hidden && d > 180) {
          a.hidden = hide;
          if (!hide) this.scatter(h, a, 0.8);
        }
      }
      h.acc += dt;
      let guard = 0;
      while (h.acc >= STEP && guard++ < 20) {
        h.acc -= STEP;
        this.step(h, threats);
      }
      if (h.acc > STEP) h.acc = 0;
    }
  }

  private step(h: Herd, threats: readonly Threat[]): void {
    const def = SPECIES[h.species];
    const rng = h.rng;
    h.calm += STEP;
    for (const a of h.animals) {
      if (a.hidden) continue;
      // ---- what does it notice? the nearest thing it can hear or see
      let near: Threat | null = null;
      let nd = Infinity;
      for (const th of threats) {
        const dx = th.x - a.x;
        const dz = th.z - a.z;
        const d = Math.hypot(dx, dz);
        // seen unless it is behind (the quarter directly astern), heard all round
        const ahead = Math.cos(a.heading) * dx + Math.sin(a.heading) * dz > -0.7 * d;
        if ((d < th.heard || (ahead && d < th.seen)) && d < nd) {
          nd = d;
          near = th;
        }
      }
      if (near) {
        h.calm = 0;
        const reach = Math.max(near.heard, near.seen);
        if (a.state === 'flee') {
          // keep going while it follows
          if (nd < 70) this.runFrom(h, a, near, 60 + 50 * rng.next());
        } else if (a.state !== 'alert') {
          a.state = 'alert';
          a.t = 3;
          a.speed = 0;
        } else if (nd < reach * 0.62 || a.t <= STEP) {
          // it kept coming (or would not go away): gone
          this.runFrom(h, a, near, 60 + 60 * rng.next());
        }
        if (a.state === 'alert') {
          // head up, turned to face it
          const want = Math.atan2(near.z - a.z, near.x - a.x);
          a.heading += Math.atan2(Math.sin(want - a.heading), Math.cos(want - a.heading)) * 0.35;
        }
      }
      // one of the herd running sets the others off
      if (a.state !== 'flee' && h.calm < 2) {
        for (const o of h.animals) {
          if (o !== a && !o.hidden && o.state === 'flee' && Math.hypot(o.x - a.x, o.z - a.z) < 14) {
            a.state = 'flee';
            a.tx = o.tx + (rng.next() - 0.5) * 14;
            a.tz = o.tz + (rng.next() - 0.5) * 14;
            a.t = 12;
            break;
          }
        }
      }
      a.t -= STEP;
      switch (a.state) {
        case 'graze':
          a.head += (0 - a.head) * 0.25;
          // a slow step forward now and then, nose still down
          a.speed = a.t % 4 < 0.9 ? 0.18 : 0;
          if (a.t <= 0) {
            if (rng.next() < 0.5) {
              a.state = 'look';
              a.t = 1.5 + 2.5 * rng.next();
            } else this.wander(h, a);
          }
          break;
        case 'look':
          a.head += (1 - a.head) * 0.3;
          a.speed = 0;
          if (a.t <= 0) {
            a.state = 'graze';
            a.t = 4 + 9 * rng.next();
          }
          break;
        case 'alert':
          a.head += (1 - a.head) * 0.5;
          a.speed = 0;
          if (a.t <= 0 && !near) {
            a.state = 'look';
            a.t = 2 + 2 * rng.next();
          }
          break;
        case 'walk':
        case 'flee': {
          const fleeing = a.state === 'flee';
          a.head += ((fleeing ? 0.85 : 0.6) - a.head) * 0.3;
          const dx = a.tx - a.x;
          const dz = a.tz - a.z;
          const d = Math.hypot(dx, dz);
          const want = Math.atan2(dz, dx);
          a.heading += Math.atan2(Math.sin(want - a.heading), Math.cos(want - a.heading)) * (fleeing ? 0.5 : 0.25);
          a.speed += ((fleeing ? def.run : def.walk) * a.size ** 0.3 - a.speed) * (fleeing ? 0.35 : 0.2);
          if (d < 1.5 || a.t <= 0) {
            a.speed = 0;
            if (fleeing) {
              // far enough: stand and look back
              a.state = 'look';
              a.t = 4 + 4 * rng.next();
              a.heading += Math.PI * (0.7 + 0.6 * rng.next());
            } else {
              a.state = 'graze';
              a.t = 5 + 10 * rng.next();
            }
          }
          break;
        }
      }
      // ---- move; never onto ground it cannot stand on
      if (a.speed > 0.01) {
        const nx = a.x + Math.cos(a.heading) * a.speed * STEP;
        const nz = a.z + Math.sin(a.heading) * a.speed * STEP;
        if (this.fits(h, nx, nz)) {
          a.x = nx;
          a.z = nz;
          a.y = def.swims ? this.tp.wl : this.tp.h;
          a.stride += (a.speed * STEP * TAU) / (def.swims ? 0.5 : a.state === 'flee' ? 2.6 : 1.1);
        } else {
          // water or the road ahead: turn along it
          a.heading += 0.6;
          if (a.state === 'walk') a.t = 0;
        }
      }
      // ---- once all is quiet again, a strayed animal comes home
      if (h.calm > 25 && a.state === 'graze' && Math.hypot(a.x - h.homeX, a.z - h.homeZ) > h.radius) this.wander(h, a);
    }
  }

  private wander(h: Herd, a: Animal): void {
    for (let tries = 0; tries < 6; tries++) {
      const ang = h.rng.next() * TAU;
      const r = h.radius * (0.15 + 0.75 * Math.sqrt(h.rng.next()));
      const x = h.homeX + Math.cos(ang) * r;
      const z = h.homeZ + Math.sin(ang) * r;
      if (!this.fits(h, x, z)) continue;
      a.state = 'walk';
      a.tx = x;
      a.tz = z;
      a.t = Math.hypot(x - a.x, z - a.z) / SPECIES[h.species].walk + 4;
      return;
    }
    a.state = 'graze';
    a.t = 3;
  }

  private runFrom(h: Herd, a: Animal, th: Threat, far: number): void {
    const dx = a.x - th.x;
    const dz = a.z - th.z;
    const d = Math.hypot(dx, dz) || 1;
    // straight away from it, a little to one side; if that way is water or road, try round
    const base = Math.atan2(dz / d, dx / d);
    for (let k = 0; k < 7; k++) {
      const ang = base + (k === 0 ? (h.rng.next() - 0.5) * 0.6 : ((k + 1) >> 1) * 0.5 * (k & 1 ? 1 : -1));
      const x = a.x + Math.cos(ang) * far;
      const z = a.z + Math.sin(ang) * far;
      if (!this.fits(h, a.x + Math.cos(ang) * 12, a.z + Math.sin(ang) * 12) && k < 6) continue;
      a.state = 'flee';
      a.tx = x;
      a.tz = z;
      a.t = far / SPECIES[h.species].run + 3;
      return;
    }
  }

  /** every animal out in the open near (x, z) */
  near(x: number, z: number, r: number, out: Animal[]): Animal[] {
    for (const h of this.awake) {
      for (const a of h.animals) {
        if (a.hidden) continue;
        const dx = a.x - x;
        const dz = a.z - z;
        if (dx * dx + dz * dz < r * r) out.push(a);
      }
    }
    return out;
  }
}
