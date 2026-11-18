/**
 * The wrecks by the road as vehicles one can take apart (docs/MODCAR.md §19). Each wreck the world lays out
 * (core/world/sites.ts: where, which way, stripped long ago or not) comes as one of our vehicles as one comes
 * within 230 m of it, with what is left of it rolled from its id (core/modcar/wrecks.ts), and goes again beyond
 * 420 m: the same wreck at every visit. One that was touched — a part taken off or put on, a thing taken out
 * of the boot, cleaned, painted, siphoned, pushed — is kept as it was left and comes back so; one that was got
 * into, or taken off (moved more than 15 m), is no wreck of the world's any more but a vehicle of one's own.
 *
 * The world's own drawing and box of a wreck go (WorldView.skipObject, WithoutWrecks), and a rare part on a
 * wreck that is not under a shut lid catches the light now and then (WreckGlints): a find is seen from the road.
 */
import * as THREE from 'three';
import { hash2 } from '../../core/math/rng';
import { partStars } from '../../core/modcar/crafting';
import { itemSig } from '../../core/modcar/items';
import type { Build } from '../../core/modcar/types';
import { isRare, rollWreck, type WreckRoll } from '../../core/modcar/wrecks';
import type { Site } from '../../core/world/sites';
import type { Solid, SolidSource } from '../../core/world/solids';
import type { World } from '../../core/world/terrain';
import type { RenderCore } from '../render/core';
import type { SavedLoose } from './save';
import type { ModVehicle } from './vehicle';

/** come this close to a wreck and it is there; go this far off and it goes (m) */
export const WRECK_NEAR = 230;
export const WRECK_FAR = 420;
/** moved this far from where it lay: someone took it (m); this far: it was pushed, kept where it is */
const CLAIM_MOVE = 15;
const KEEP_MOVE = 1.5;
/** how often the wrecks about are looked over (s) */
const CHECK_EVERY = 0.4;

/** a wreck kept as it was left: its build, where it lies, what rides in it */
export interface SavedWreck {
  build: Build;
  x: number;
  z: number;
  yaw: number;
  loose: SavedLoose[];
}

/** the wrecks in a save: the ones kept as they were left, the ones taken (vehicles of one's own now) */
export interface WrecksSave {
  kept: Record<string, SavedWreck>;
  gone: string[];
}

/** a wreck of the world's: its id, its seed, where it lies and which way (the vehicle's yaw), its kind, how far down the road */
export interface WreckSpot {
  id: string;
  seed: number;
  x: number;
  z: number;
  yaw: number;
  type: number;
  stripped: boolean;
  s: number;
}

/** the world's wrecks anchored within [sMin, sMax] of the road */
export function wreckSpots(world: World, sMin: number, sMax: number, out: WreckSpot[] = []): WreckSpot[] {
  const sites: Site[] = [];
  world.sites.between(sMin, sMax, sites);
  for (const site of sites) {
    for (let i = 0; i < site.objects.length; i++) {
      const o = site.objects[i];
      if (o.kind !== 'wreck') continue;
      // (the object's long axis is (cos yaw, sin yaw), its nose that way: a vehicle's yaw is the other way round)
      out.push({ id: `${site.id}/w${i}`, seed: hash2(site.seed, i, 0x3ec4), x: o.x, z: o.z, yaw: -o.yaw, type: o.v & 7, stripped: (o.v & 8) !== 0, s: site.s });
    }
  }
  return out;
}

/** the sites' solids without the wrecks' boxes (the wrecks are vehicles now, solids of their own) */
export class WithoutWrecks implements SolidSource {
  constructor(private readonly inner: SolidSource) {}

  solidsNear(x: number, z: number, r: number, out: Solid[]): void {
    const n = out.length;
    this.inner.solidsNear(x, z, r, out);
    let j = n;
    for (let i = n; i < out.length; i++) if (!out[i].tag.endsWith(':wreck')) out[j++] = out[i];
    out.length = j;
  }
}

/** what the wrecks need of the game */
export interface WreckHost {
  readonly world: World | null;
  readonly core: RenderCore;
  addVehicle(build: Build, x: number, z: number, yaw: number): ModVehicle;
  /** a vehicle gone from the world, and what rode in it */
  removeVehicle(v: ModVehicle): void;
  /** what was left in it put into its boot or its bed (once its model is in) */
  stowLoot(v: ModVehicle, roll: WreckRoll): Promise<void>;
  /** what rides in it, as saved (in its frame) */
  ridersOf(v: ModVehicle): SavedLoose[];
  /** put back what rode in it */
  restoreRiders(v: ModVehicle, list: readonly SavedLoose[]): void;
  /** a kept wreck back: the masks of what was being cleaned on it */
  restoreGrimeOf(v: ModVehicle): void;
}

/** a wreck there now: its spot, its vehicle, where it came to rest, what it was then (to tell whether it was touched) */
export interface LiveWreck {
  spot: WreckSpot;
  v: ModVehicle;
  /** the roll (null: a kept one, come back) */
  roll: WreckRoll | null;
  x0: number;
  z0: number;
  /** its state as it came (once its model and its loot were in): '' until then */
  sig: string;
  /** kept as it was left already (touched before) */
  kept: boolean;
  /** the lids opened on it already (the reveal is once a lid) */
  opened: Set<string>;
  /** said already: the glint of a find seen close to */
  greeted: boolean;
}

/**
 * A build as it stands, to the hundredth (its ids aside): a part off or on, cleaned, painted, siphoned all show.
 * A thing riding in it shows as what it is in the state it is in (items.ts itemSig: its kind, how many of it,
 * what is left in it, what it holds), so some taken off a stack, a bottle drunk from or a thing put into a
 * box in the boot is a touch too.
 */
function sigOf(b: Build, riders: readonly SavedLoose[]): string {
  const round = (k: string, v: unknown): unknown => (k === 'uid' || k === 'cargo' ? undefined : typeof v === 'number' ? Math.round(v * 100) / 100 : v);
  return JSON.stringify(b, round) + '|' + riders.map((l) => (l.item ? itemSig(l.item) : (l.tool?.kind ?? l.part?.part ?? ''))).sort().join(',');
}

export class Wrecks {
  readonly live = new Map<string, LiveWreck>();
  private readonly byVehicle = new Map<ModVehicle, LiveWreck>();
  readonly kept = new Map<string, SavedWreck>();
  readonly gone = new Set<string>();
  private checkT = 0;
  private readonly spots: WreckSpot[] = [];
  /** spawned and despawned so far (the telemetry's) */
  spawned = 0;
  despawned = 0;

  constructor(
    private readonly host: WreckHost,
    save?: WrecksSave,
  ) {
    if (save) {
      for (const [id, w] of Object.entries(save.kept ?? {})) this.kept.set(id, w);
      for (const id of save.gone ?? []) this.gone.add(id);
    }
  }

  /** is it a wreck of the world's (not taken)? */
  isWreck(v: ModVehicle): boolean {
    return this.byVehicle.has(v);
  }

  wreckOf(v: ModVehicle): LiveWreck | undefined {
    return this.byVehicle.get(v);
  }

  /** taken: one's own vehicle from now on (got into, driven or towed off) */
  claim(v: ModVehicle): boolean {
    const l = this.byVehicle.get(v);
    if (!l) return false;
    this.byVehicle.delete(v);
    this.live.delete(l.spot.id);
    this.kept.delete(l.spot.id);
    this.gone.add(l.spot.id);
    return true;
  }

  /** every frame: the wrecks within reach of (x, z) come, the ones far behind go, the ones taken off are claimed */
  update(dt: number, x: number, z: number): void {
    const world = this.host.world;
    if (!world) return;
    // (taken off: claimed at once, whoever moved it)
    for (const l of this.live.values()) {
      if (Math.hypot(l.v.sim.px - l.x0, l.v.sim.pz - l.z0) > CLAIM_MOVE) this.claim(l.v);
    }
    if ((this.checkT -= dt) > 0) return;
    this.checkT = CHECK_EVERY;
    const s = world.spine.sAtX(x);
    this.spots.length = 0;
    wreckSpots(world, s - WRECK_FAR - 200, s + WRECK_FAR + 200, this.spots);
    // the nearest one not there yet, within reach (one a look: a vehicle's model is put together over a frame or two)
    let best: WreckSpot | null = null;
    let bestD = WRECK_NEAR;
    for (const sp of this.spots) {
      if (this.live.has(sp.id) || this.gone.has(sp.id)) continue;
      const k = this.kept.get(sp.id);
      const d = Math.hypot((k?.x ?? sp.x) - x, (k?.z ?? sp.z) - z);
      if (d < bestD) {
        bestD = d;
        best = sp;
      }
    }
    if (best) this.spawn(best);
    // the ones far behind go (kept as they were left, if they were touched)
    for (const l of [...this.live.values()]) {
      if (Math.hypot(l.v.sim.px - x, l.v.sim.pz - z) > WRECK_FAR) this.despawn(l);
    }
  }

  private spawn(sp: WreckSpot): void {
    const k = this.kept.get(sp.id);
    let roll: WreckRoll | null = null;
    let v: ModVehicle;
    if (k) {
      v = this.host.addVehicle(k.build, k.x, k.z, k.yaw);
      this.host.restoreRiders(v, k.loose);
      this.host.restoreGrimeOf(v);
    } else {
      roll = rollWreck(sp.seed, sp.type, sp.stripped, sp.s);
      v = this.host.addVehicle(roll.build, sp.x, sp.z, sp.yaw);
    }
    const l: LiveWreck = { spot: sp, v, roll, x0: k?.x ?? sp.x, z0: k?.z ?? sp.z, sig: '', kept: !!k, opened: new Set(), greeted: false };
    this.live.set(sp.id, l);
    this.byVehicle.set(v, l);
    this.spawned++;
    // (its loot in, once its model is: then it is as it came)
    void (async (): Promise<void> => {
      await v.view.settled();
      if (this.byVehicle.get(v) !== l) return;
      if (roll) await this.host.stowLoot(v, roll);
      if (this.byVehicle.get(v) !== l) return;
      l.sig = sigOf(v.build, this.host.ridersOf(v));
    })();
  }

  /** has it been touched since it came? (a part, a thing, a wipe, a coat, a push) */
  touched(l: LiveWreck): boolean {
    if (l.kept) return true;
    if (!l.sig) return false;
    if (Math.hypot(l.v.sim.px - l.x0, l.v.sim.pz - l.z0) > KEEP_MOVE) return true;
    return sigOf(l.v.build, this.host.ridersOf(l.v)) !== l.sig;
  }

  private keep(l: LiveWreck): void {
    const v = l.v;
    this.kept.set(l.spot.id, { build: v.build, x: v.sim.px, z: v.sim.pz, yaw: v.sim.yaw, loose: this.host.ridersOf(v) });
  }

  private despawn(l: LiveWreck): void {
    if (this.touched(l)) this.keep(l);
    this.live.delete(l.spot.id);
    this.byVehicle.delete(l.v);
    this.host.removeVehicle(l.v);
    this.despawned++;
  }

  /** everything there now goes (a new world, a jump down the road): the touched ones kept */
  clear(): void {
    for (const l of [...this.live.values()]) this.despawn(l);
  }

  /** for the save: the kept ones (the touched ones there now too), the taken ones */
  snapshot(): WrecksSave {
    for (const l of this.live.values()) if (this.touched(l)) this.keep(l);
    return { kept: Object.fromEntries(this.kept), gone: [...this.gone] };
  }

  /** the build uids of the kept ones, and of their parts (their grime masks are kept with the save) */
  keptGrimeKeys(): string[] {
    const out: string[] = [];
    for (const w of this.kept.values()) {
      if (w.build.grime) out.push(`${w.build.uid}:body`);
      for (const inst of Object.values(w.build.parts)) {
        if (inst.grime) out.push(inst.uid);
        for (const sub of Object.values(inst.sub)) if (sub.grime) out.push(sub.uid);
      }
    }
    return out;
  }
}

// ------------------------------------------------------------------ the glint of a find

const GLINT_RANGE = 45;

/** a four-pointed star of light, drawn once */
function glintTexture(): THREE.Texture {
  const n = 64;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const g = c.getContext('2d')!;
  const h = n / 2;
  const glow = g.createRadialGradient(h, h, 0, h, h, h);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.18, 'rgba(255,246,214,0.55)');
  glow.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, n, n);
  // the rays: long across and up, short on the diagonals
  g.globalCompositeOperation = 'lighter';
  for (const [len, w, turn] of [
    [h, 2.4, 0],
    [h, 2.4, Math.PI / 2],
    [h * 0.45, 1.6, Math.PI / 4],
    [h * 0.45, 1.6, -Math.PI / 4],
  ] as const) {
    g.save();
    g.translate(h, h);
    g.rotate(turn);
    const ray = g.createLinearGradient(-len, 0, len, 0);
    ray.addColorStop(0, 'rgba(255,240,200,0)');
    ray.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    ray.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = ray;
    g.fillRect(-len, -w / 2, len * 2, w);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** the parts of a wreck that glint: rare finds not under a shut lid, its mount (a wheel's for a tyre) */
export function glintsOf(v: ModVehicle): { mount: string; part: string; star: number }[] {
  const out: { mount: string; part: string; star: number }[] = [];
  const frame = v.build.frame;
  for (const [mount, inst] of Object.entries(v.build.parts)) {
    if (v.view.shutOver(mount)) continue;
    for (const id of [inst.part, ...Object.values(inst.sub).map((x) => x.part)]) {
      if (isRare(frame, id)) out.push({ mount, part: id, star: partStars(id) });
    }
  }
  return out;
}

/**
 * A rare part on a wreck, not under a shut lid, catches the light now and then: a star flares on it for a
 * moment (gold for a ★5), every few seconds while one is within 45 m — a find is seen from the road
 */
export class WreckGlints {
  private readonly tex = glintTexture();
  private readonly pool: { sprite: THREE.Sprite; t: number; mat: THREE.SpriteMaterial }[] = [];
  /** per wreck: when it glints next (s) */
  private readonly due = new Map<ModVehicle, number>();
  private readonly box = new THREE.Box3();
  private readonly at = new THREE.Vector3();
  /** flares so far (the telemetry's) */
  flares = 0;

  constructor(private readonly scene: THREE.Scene) {}

  private sprite(): { sprite: THREE.Sprite; t: number; mat: THREE.SpriteMaterial } {
    const free = this.pool.find((p) => p.t >= 1);
    if (free) return free;
    const mat = new THREE.SpriteMaterial({ map: this.tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: false });
    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = 5;
    sprite.visible = false;
    this.scene.add(sprite);
    const p = { sprite, t: 1, mat };
    this.pool.push(p);
    return p;
  }

  /**
   * @param wrecks the wrecks there now
   * @param eye where one looks from (render space)
   * @param light how much light there is to catch (0 night … 1 day; a lamp on it at night does too)
   */
  update(dt: number, wrecks: readonly LiveWreck[], eye: THREE.Vector3, light: number, time: number): void {
    for (const p of this.pool) {
      if (p.t >= 1) continue;
      p.t = Math.min(1, p.t + dt / 0.75);
      // up fast, down slow, a quarter turn as it goes
      const k = p.t < 0.25 ? p.t / 0.25 : Math.pow(1 - (p.t - 0.25) / 0.75, 1.6);
      const size = 0.55 * k + 0.05;
      p.sprite.scale.set(size, size, 1);
      p.mat.rotation = p.t * 0.9;
      p.mat.opacity = Math.min(1, k * 1.2);
      p.sprite.visible = p.t < 1;
    }
    if (light < 0.08) return;
    for (const l of wrecks) {
      const v = l.v;
      if (!l.sig) continue;
      v.view.root.updateMatrixWorld();
      const d = this.at.setFromMatrixPosition(v.view.root.matrixWorld).distanceTo(eye);
      if (d > GLINT_RANGE) continue;
      const due = this.due.get(v) ?? time + 0.5 + ((l.spot.seed >>> 0) % 1000) / 500;
      if (!this.due.has(v)) this.due.set(v, due);
      if (time < due) continue;
      this.due.set(v, time + 2.6 + ((l.spot.seed >>> 3) % 1000) / 600 + Math.random() * 0.8);
      const list = glintsOf(v);
      if (!list.length) continue;
      const g = list[Math.floor(Math.random() * list.length)];
      if (!v.view.boundsOf(g.mount, this.box)) continue;
      const p = this.sprite();
      this.box.getCenter(p.sprite.position);
      // (towards the eye a little: on its skin, not inside it)
      const toward = this.at.subVectors(eye, p.sprite.position).normalize();
      const size = this.box.getSize(new THREE.Vector3());
      p.sprite.position.addScaledVector(toward, Math.min(0.5, Math.max(size.x, size.y, size.z) * 0.45));
      p.t = 0;
      p.mat.color.setRGB(1, g.star >= 5 ? 0.78 : 0.93, g.star >= 5 ? 0.35 : 0.7);
      p.mat.color.multiplyScalar(0.6 + 0.6 * Math.min(1, light));
      p.sprite.visible = true;
      this.flares++;
    }
    // (the wrecks gone: forgotten)
    if (this.due.size > wrecks.length) {
      const there = new Set(wrecks.map((l) => l.v));
      for (const v of [...this.due.keys()]) if (!there.has(v)) this.due.delete(v);
    }
  }

  dispose(): void {
    for (const p of this.pool) {
      p.sprite.removeFromParent();
      p.mat.dispose();
    }
    this.tex.dispose();
  }
}
