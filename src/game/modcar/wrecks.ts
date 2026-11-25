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
import { hash2, Rng } from '../../core/math/rng';
import { partStars } from '../../core/modcar/crafting';
import { itemSig } from '../../core/modcar/items';
import type { Build, PartInstance } from '../../core/modcar/types';
import { isRare, rollFound, rollWreck, type WreckRoll } from '../../core/modcar/wrecks';
import { lootRules } from '../../core/modcar/loot';
import { PAD_FROM, type Site } from '../../core/world/sites';
import { SitePlanner, vehiclePlan, type VehiclePlanned } from '../../core/modcar/schedule';
import { frameSize } from '../../core/modcar/frames';
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
  /** the sort of place it stands at (a verge's lay-by, a garage's yard) */
  siteKind: string;
  /** a vehicle to find (the plan's: schedule.ts vehiclePlan): its sort, its roll's seed, the tier of the parts beside it */
  find?: { frame: string; seed: number; tier: number };
}

/** a part laid beside a vehicle to find (places.ts lays it, as a place's own): its id, the part, where, which way */
export interface BesidePart {
  id: string;
  inst: PartInstance;
  x: number;
  z: number;
  yaw: number;
}

/**
 * Could this wreck be one's own (docs/V3/plan/growth.md §六 2, 定案 2)? The ones by the road are for their parts only; a
 * vehicle standing at a big place (a garage's or a works' yard first, else a station's, a shop's, a house's, a camp's
 * levelled ground) from the 12th kilometre on may be a find — the places the plan picks (VehicleFinds) hold one.
 */
export function takeableWreck(spot: Pick<WreckSpot, 'siteKind' | 's'>): boolean {
  return BIG_PLACES.has(spot.siteKind) && spot.s >= TAKE_FROM_M;
}

/** where the vehicles one can take begin (m: the plan's first new vehicle, 12–20 km) */
export const TAKE_FROM_M = 12_000;

/** the big places: where a vehicle to find may stand (the verges' lay-bys and the hides are not) */
const BIG_PLACES: ReadonlySet<string> = new Set(['garage', 'works', 'station', 'shop', 'house', 'camp', 'lookout']);

/** the place a wreck of a site stands at (its id less its own part) */
const placeOf = (id: string): string => id.slice(0, id.lastIndexOf('/w'));

/**
 * Where a vehicle to find stands at a place: on its levelled ground, along the road, clear of everything the place has
 * by its own length and a row of its parts beside it (frameSize) — of a prefab building (a Nomad Drive one: its footprint
 * and what of it stands low) by as much, in its yard (core/world/prefabs.ts PrefabCard.yard). Null: no room there.
 */
function freeSpot(site: Site, k: number, taken: readonly WreckSpot[], frame = 'van'): WreckSpot | null {
  if (site.depth <= 0 || site.halfL <= 5) return null;
  const size = frameSize(frame);
  const clear = size.length / 2 + 1.2;
  const r = new Rng(hash2(site.seed, 0x7e41d, k));
  const cands: [number, number][] = [];
  for (let a = -site.halfL + clear; a <= site.halfL - clear; a += 1.5) for (let b = PAD_FROM + 3; b <= site.depth - size.width - 2; b += 1.5) cands.push([a, b]);
  for (let i = cands.length - 1; i > 0; i--) {
    const j = r.int(i + 1);
    [cands[i], cands[j]] = [cands[j], cands[i]];
  }
  const near = (x: number, z: number, px: number, pz: number, d: number): boolean => (x - px) ** 2 + (z - pz) ** 2 < d * d;
  // (a prefab building: its footprint and its solids that stand low, each a box in its own frame, as near as `clear`)
  const inBox = (x: number, z: number, cx: number, cz: number, yaw: number, hx: number, hz: number): boolean => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const u = (x - cx) * c + (z - cz) * s;
    const v = -(x - cx) * s + (z - cz) * c;
    const du = Math.max(0, Math.abs(u) - hx);
    const dv = Math.max(0, Math.abs(v) - hz);
    return du * du + dv * dv < clear * clear;
  };
  const prefab = site.objects.find((o) => o.kind === 'prefab');
  const low = prefab ? site.solids.filter((sd) => sd.y0 < prefab.y + 2.6) : [];
  for (const [a, b] of cands) {
    const x = site.x + site.e1x * a + site.e2x * b;
    const z = site.z + site.e1z * a + site.e2z * b;
    if (site.objects.some((o) => o.kind !== 'line' && o.kind !== 'patch' && (o.kind === 'prefab' ? inBox(x, z, o.x, o.z, o.yaw, o.w / 2, o.d / 2) : near(x, z, o.x, o.z, Math.max(o.w, o.d) / 2 + clear)))) continue;
    if (low.some((sd) => inBox(x, z, sd.x, sd.z, sd.yaw, sd.hx, sd.hz || sd.hx))) continue;
    if (site.containers.some((c) => near(x, z, c.x, c.z, Math.max(c.hx, c.hz) + clear))) continue;
    if (site.loose.some((l) => near(x, z, l.x, l.z, clear)) || site.fuel.some((f) => near(x, z, f.x, f.z, clear))) continue;
    if (taken.some((t) => near(x, z, t.x, t.z, clear * 2 + 1))) continue;
    // (along the road, nose either way)
    const turn = (r.next() - 0.5) * 0.3 + (r.next() < 0.5 ? Math.PI : 0);
    return { id: `${site.id}/wf${k}`, seed: hash2(site.seed, k, 0x3ec5), x, z, yaw: -(site.yaw + turn), type: 1, stripped: false, s: site.s, siteKind: site.kind };
  }
  return null;
}

/**
 * The vehicles to find, the plan laid over a world's places as one comes down the road (schedule.ts vehiclePlan): at the
 * place the plan picks for each (a big place within THEME_WAIT_M of where it is due, else the next with room), the
 * planned frame standing on its levelled ground (freeSpot), its parts to lay beside it (besideOf). The world's own
 * wrecks are for their parts.
 */
export class VehicleFinds {
  private readonly planner: SitePlanner;
  /** at each place the plan picked, its finds (ids) */
  private readonly picked = new Map<string, Set<string>>();
  /** the finds, in road order */
  private readonly extra: WreckSpot[] = [];

  constructor(readonly world: World) {
    this.planner = new SitePlanner(vehiclePlan(world.seed, 4000));
  }

  /** the places down to s taken in, in road order: what each holds decided */
  private upTo(s: number): void {
    if (this.planner.through >= s) return;
    const sites: Site[] = [];
    this.world.sites.between(Math.max(0, this.planner.through - 1), s + 1, sites);
    sites.sort((a, b) => a.s - b.s);
    // (a big place with levelled ground and room for a vehicle may take the plan's)
    const room = (x: Site): boolean => BIG_PLACES.has(x.kind) && x.depth > 0 && freeSpot(x, 0, []) !== null;
    // (and ground for this one's size: a big one waits for a place it fits)
    this.planner.take(sites.map((x) => ({ id: x.id, s: x.s, kind: x.kind, boxes: room(x) ? 1 : 0, room: (f) => freeSpot(x, 0, [], (f as VehiclePlanned).frame) !== null })));
    for (const x of sites) {
      const finds = this.planner.findsAt(x.id) as readonly VehiclePlanned[];
      if (!finds.length || this.picked.has(x.id)) continue;
      const ids = new Set<string>();
      finds.forEach((f, k) => {
        const sp = freeSpot(x, k, this.extra, f.frame);
        if (!sp) return;
        sp.find = { frame: f.frame, seed: f.seed, tier: f.tier };
        this.extra.push(sp);
        ids.add(sp.id);
      });
      this.picked.set(x.id, ids);
    }
  }

  /** the finds standing at a place (taken in already, or now) */
  at(site: Site): readonly WreckSpot[] {
    this.upTo(site.s);
    const ids = this.picked.get(site.id);
    return ids ? this.extra.filter((x) => ids.has(x.id)) : [];
  }

  /** is this one of the finds (its place picked by the plan) */
  has(spot: Pick<WreckSpot, 'id' | 'siteKind' | 's'>): boolean {
    if (!takeableWreck(spot)) return false;
    this.upTo(spot.s);
    return this.picked.get(placeOf(spot.id))?.has(spot.id) ?? false;
  }

  /** the finds standing where the world laid no wreck, within [sMin, sMax] of the road */
  extraSpots(sMin: number, sMax: number, out: WreckSpot[] = []): WreckSpot[] {
    this.upTo(sMax);
    for (const sp of this.extra) if (sp.s >= sMin && sp.s <= sMax) out.push(sp);
    return out;
  }
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
      out.push({ id: `${site.id}/w${i}`, seed: hash2(site.seed, i, 0x3ec4), x: o.x, z: o.z, yaw: -o.yaw, type: o.v & 7, stripped: (o.v & 8) !== 0, s: site.s, siteKind: site.kind });
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
  /** what a found vehicle's frame comes with put in its places (FrameDef.fittings; once its model is in) */
  stowFittings?(v: ModVehicle): Promise<void>;
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

  /** the yards the plan picks for a vehicle to find */
  private findsOf: VehicleFinds | null = null;

  /** the plan's vehicles to find in this world (null: no world) */
  private finds(): VehicleFinds | null {
    const w = this.host.world;
    if (!w) return null;
    if (this.findsOf?.world !== w) this.findsOf = new VehicleFinds(w);
    return this.findsOf;
  }

  /** may a wreck lying there be taken (its place the plan's pick for a vehicle to find) */
  takeableSpot(spot: Pick<WreckSpot, 'id' | 'siteKind' | 's'>): boolean {
    return this.finds()?.has(spot) ?? false;
  }

  /** the vehicles to find, within [sMin, sMax] of the road */
  extraSpots(sMin: number, sMax: number, out: WreckSpot[] = []): WreckSpot[] {
    return this.finds()?.extraSpots(sMin, sMax, out) ?? out;
  }

  /**
   * What lies beside the vehicles to find at a place (places.ts lays them as the place's own): each find's parts
   * (rollFound's beside) in a row along its side, a metre out from it — the engine first, then the radiator, the battery,
   * the wheels
   */
  besideAt(site: Site): BesidePart[] {
    const out: BesidePart[] = [];
    for (const sp of this.finds()?.at(site) ?? []) {
      if (!sp.find) continue;
      const fr = rollFound(sp.find.frame, sp.find.seed, sp.find.tier);
      const size = frameSize(sp.find.frame);
      // (the sim's yaw: forward is (cos yaw, −sin yaw), its right side (sin yaw, cos yaw))
      const fx = Math.cos(sp.yaw);
      const fz = -Math.sin(sp.yaw);
      const out1 = size.width / 2 + 1.0;
      const step = Math.min(1.1, (size.length - 0.6) / Math.max(1, fr.beside.length - 1));
      fr.beside.forEach((p, i) => {
        const along = -size.length / 2 + 0.3 + step * i;
        out.push({ id: `${sp.id}/b${i}`, inst: p.inst, x: sp.x + fx * along - fz * out1, z: sp.z + fz * along + fx * out1, yaw: -sp.yaw + Math.PI / 2 });
      });
    }
    return out;
  }

  /** may it be taken (a find at a big place); false for a wreck by the road, and for what is no wreck */
  takeable(v: ModVehicle): boolean {
    const l = this.byVehicle.get(v);
    return !!l && this.takeableSpot(l.spot);
  }

  /** taken: one's own vehicle from now on (got into, driven or towed off) — a find only, never a wreck by the road */
  claim(v: ModVehicle): boolean {
    const l = this.byVehicle.get(v);
    if (!l || !this.takeable(v)) return false;
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
    // (and the vehicles to find where the world laid none)
    this.extraSpots(s - WRECK_FAR - 200, s + WRECK_FAR + 200, this.spots);
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
      // (a vehicle to find: its planned frame, bare, its parts beside it — besideAt; the world's wrecks as they roll)
      if (sp.find) {
        const fr = rollFound(sp.find.frame, sp.find.seed, sp.find.tier);
        roll = { build: fr.build, items: [], tools: [], special: false, finds: [] };
      } else roll = rollWreck(sp.seed, sp.type, sp.stripped, sp.s, false, lootRules(this.host.world?.rules?.version ?? 1));
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
      if (sp.find) await this.host.stowFittings?.(v);
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
