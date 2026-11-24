/**
 * The ND prefab buildings in the game (docs/ND/PLAN.md): each place the world laid as a prefab (core/world/
 * prefabs.ts; the cards: core/v3/nd/cards.ts) drawn from its own model (public/models/modcar/places/nd/<id>.glb,
 * tools/blender/nd/<id>.py) once one comes within reach of it, in its place's two colours, dropped when one has
 * gone on. Its doors hang on their hinges and open into the room with E (shut, they keep the walker and the
 * vehicles out); its switch works its lamps (the bulbs glow, the room is lit warm); what is dropped in it lands
 * on its floors. A door may be found stuck or locked (core/v3/nd/pry.ts, rolled from the world's seed): it rattles
 * and will not give; a key opens a locked one at a press; a crowbar in the hands pries it open with E held (its
 * bites shaking the door), and then it stays open for good. What one opened, switched on, unlocked and forced
 * stays so (the save's slice `nd-build`).
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import type { SaveSlice } from '../../../../core/kernel/slices';
import { hash2 } from '../../../../core/math/rng';
import type { Text } from '../../../../core/modcar/types';
import { ND_BUILDINGS, type CardDoor, type CardLamp, type CardSpin, type CardSwitch, type NdBuilding } from '../../../../core/v3/nd/cards';
import { ND_KEY } from '../../../../core/v3/nd/dig';
import { ND_CROWBAR, PRY, priesLeft, pryBites, pryFound, pryS, spendPry, unlockWithKey, type PryState } from '../../../../core/v3/nd/pry';
import type { Site, SiteObject } from '../../../../core/world/sites';
import { Solid, solidWithin, type SolidSource } from '../../../../core/world/solids';
import { cloneModel, placeGlb, type Model } from '../../assets';
import { flicker, makeFire } from '../../nd/fire';
import { makeHalo, makePool } from '../../nd/glow';
import type { GarageDevice } from '../../garageStub';
import type { GameContext } from '../../kernel/context';
import type { InteractSource, PlanPoint } from '../../kernel/interact';
import { applyMaterials, CarMaterials } from '../../materials';
import { mergeCarParts } from '../../../render/carMerge';
import { blip, ndAudio } from '../../nd/kit';
import { registerItemCardLines } from '../../itemInfo';
import { PLACE_GLOSS } from '../../siteArt';
import type { CarLook } from '../../../render/carMaterials';

/** a building is drawn within this of one (m, past its own reach), dropped beyond FAR */
const NEAR = 460;
const FAR = 620;
const CHECK_EVERY = 0.5;
/** a door's swing (s); shut enough to keep one out below this much open */
const SWING_S = 0.55;
const SHUT = 0.18;

/** the walls' paints and the trims' (sRGB): a place takes one of each by its seed */
const WALLS = [0x9f4a3c, 0x7d977a, 0x6c8fae, 0xc4973f, 0x52715a, 0x5f8f8a, 0xb7705a, 0x8a7d9e];
const TRIMS = [0xede4cb, 0xf3efe4, 0xe2d3ad, 0xdfe6e2];

const T = (zh: string, en: string): Text => ({ zh, en });

interface LiveDoor {
  id: string;
  card: CardDoor;
  obj: THREE.Object3D | null;
  q0: THREE.Quaternion;
  /** a sliding lid's place shut (the model's frame) */
  p0: THREE.Vector3;
  t: number;
  target: 0 | 1;
  solid: Solid;
  device: GarageDevice;
  /** stuck, locked (as found, or as one left it) */
  pry: PryState;
  /** a rattle's time into it, a bite's (−1 none) and how hard; it swings fast (forced) */
  shake: number;
  kick: number;
  kickK: number;
  fast: boolean;
  /** the pry under way: how far along its hold, when last */
  pryK: number;
  pryAt: number;
}

interface LiveLamp {
  card: CardLamp;
  glow: THREE.Mesh;
  /** a camp fire's flames (a lamp named fire…) */
  flame?: THREE.Group;
  /** the lamp's own glass (the model's node N_lit_<lamp>: a tube's diffuser, a sign's neon letters): its meshes, their own materials, and lit */
  lit?: { meshes: THREE.Mesh[]; off: (THREE.Material | THREE.Material[])[]; on: THREE.Material; shown: boolean };
  /** a neon sign's halo, a lamp out of doors' pool of light on the ground under it */
  halo?: THREE.Object3D;
}

/** a door's name as a number (each door of a place its own) */
function nameKey(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h | 0;
}

/** a neon sign's light (sRGB): a warm coral red */
const NEON = 0xff5f45;
/** a lamp's glass lit: a bulb's warm, a tube's cooler */
const BULB = 0xfff1c8;
const TUBE = 0xeef5ff;

interface Drawn {
  site: Site;
  o: SiteObject;
  b: NdBuilding;
  root: THREE.Group;
  look: CarLook | null;
  doors: LiveDoor[];
  lamps: LiveLamp[];
  devices: GarageDevice[];
  /** the model in (the doors hung) */
  ready: boolean;
  /** what turns: its node, its turn shut, its axis, its own pace (×), how far round (°), how fast now (rpm), its gusts' phase */
  spins?: { card: CardSpin; obj: THREE.Object3D; q0: THREE.Quaternion; axis: THREE.Vector3; k: number; angle: number; rpm: number; phase: number }[];
  /**
   * Its doors at rest drawn as one (ND9: a motel's fifty leaves, a radio station's thirty lockers, a hundred draws of
   * their own): merged one mesh a material (render/carMerge.ts), the leaves themselves hidden — any of them moving, every
   * leaf its own again until they have all been still a while (`rest`, s)
   */
  batch: THREE.Group | null;
  batched: Set<LiveDoor>;
  rest: number;
  /** its look's colours and wear (what a merged leaf carries in its vertices) */
  tone: { paint: number; paint2: number; dirt: number; rust: number; wear: number };
}

/** the doors of a building merged once they have all been still this long (s) */
const BATCH_REST_S = 1.5;

interface Saved {
  /** the doors one left open (1) or shut (0) */
  doors?: Record<string, 0 | 1>;
  /** the switches one left on ("site/switch"; a site alone: all its switches, as the first saves had it) */
  lit?: string[];
  /** the places whose switches one has worked (their lamps no longer as they were found) */
  touched?: string[];
  /** the doors forced open with a crowbar (never shut fast again), and those unlocked with a key */
  forced?: string[];
  keyed?: string[];
}

const UP = new THREE.Vector3(0, 1, 0);

/** a tilting leaf's middle (the card's frame, from its hinge) turned `a` (rad) about its level hinge line along (su, sv):
 * the model's frame (x: u, y: up, z: v), turned as three turns it (right-handed) */
function tiltMid(cd: CardDoor, a: number, out: { u: number; y: number; v: number }): void {
  const m = cd.tilt!;
  const kx = cd.su;
  const kz = cd.sv;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const dot = kx * m.u + kz * m.v;
  out.u = m.u * ca - kz * m.y * sa + kx * dot * (1 - ca);
  out.y = m.y * ca + (kz * m.u - kx * m.v) * sa;
  out.v = m.v * ca + kx * m.y * sa + kz * dot * (1 - ca);
}

/** another system's own with a building as its model comes in and as it is dropped (docs/ND/PLAN.md, ND5: a station's pump, v3/nd-fuel) */
export interface BuildingWatch {
  /** its model is in, in its place (the building's frame: `root`, the card's u, y, v) */
  dressed(site: Site, model: THREE.Object3D, root: THREE.Group): void;
  /** it is gone (one went too far from it), its model with it */
  dropped(site: string): void;
}

export class NdBuildings implements System<GameContext>, InteractSource, SolidSource {
  readonly id = 'nd-build';
  /** the systems told of each building drawn and dropped */
  readonly watchers: BuildingWatch[] = [];
  readonly budget = { cpuMs: 0.3 };
  private ctx: GameContext | null = null;
  private readonly drawn = new Map<string, Drawn>();
  private readonly mats = new CarMaterials();
  private readonly sites: Site[] = [];
  private readonly devices: GarageDevice[] = [];
  private checkT = 0;
  private readonly doorState = new Map<string, 0 | 1>();
  private readonly lit = new Set<string>();
  private readonly touched = new Set<string>();
  /** a neon sign coming on: when it strikes (the clock of this system, s), by site and lamp */
  private readonly strikes = new Map<string, number>();
  private readonly forced = new Set<string>();
  private readonly keyed = new Set<string>();
  /** the door being pried (its crowbar pinned to it), when last */
  private prying: LiveDoor | null = null;
  private pinned = false;
  private time = 0;
  private readonly q = new THREE.Quaternion();
  private glowGeo: THREE.SphereGeometry | null = null;
  private glowMat: THREE.MeshBasicMaterial | null = null;
  private readonly warm = new THREE.Color(1.0, 0.72, 0.42);
  private readonly dark = new THREE.Color(0, 0, 0);

  /** the save's part */
  readonly slice: SaveSlice<Saved> = {
    id: 'nd-build',
    version: 1,
    snapshot: () => {
      const doors: Record<string, 0 | 1> = {};
      for (const [k, v] of this.doorState) doors[k] = v;
      if (!this.doorState.size && !this.lit.size && !this.touched.size && !this.forced.size && !this.keyed.size) return undefined;
      return { doors, lit: [...this.lit].sort(), ...(this.touched.size ? { touched: [...this.touched].sort() } : {}), ...(this.forced.size ? { forced: [...this.forced].sort() } : {}), ...(this.keyed.size ? { keyed: [...this.keyed].sort() } : {}) };
    },
    restore: (d) => {
      this.doorState.clear();
      this.lit.clear();
      this.touched.clear();
      this.forced.clear();
      this.keyed.clear();
      for (const [k, v] of Object.entries(d.doors ?? {})) this.doorState.set(k, v ? 1 : 0);
      for (const id of d.lit ?? []) this.lit.add(id);
      for (const id of d.touched ?? []) this.touched.add(id);
      for (const id of d.forced ?? []) this.forced.add(id);
      for (const id of d.keyed ?? []) this.keyed.add(id);
      for (const dr of this.drawn.values())
        for (const door of dr.doors) {
          door.t = door.target = this.doorState.get(door.id) ?? door.target;
          door.pry = this.pryOf(door.id);
        }
    },
    clear: () => {
      this.doorState.clear();
      this.lit.clear();
      this.touched.clear();
      this.forced.clear();
      this.keyed.clear();
    },
  };

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.addSolids(this);
    // (the ND modules' own sounds through the game's master bus)
    ndAudio(ctx.audio);
    // (a thing dropped in a prefab building lands on its floors, the porch's, a step: the land is under them)
    const base = ctx.loose.surfaceAt;
    ctx.loose.surfaceAt = (x, z, fromY) => {
      const g = base(x, z, fromY);
      const f = this.floorAt(x, z, fromY);
      return f > g ? f : g;
    };
  }

  /** the highest prefab floor at (x, z) not above fromY (−∞: none) */
  floorAt(x: number, z: number, fromY: number): number {
    let top = -Infinity;
    for (const d of this.drawn.values()) {
      const s = d.site;
      if (Math.hypot(x - s.x, z - s.z) > s.reach + 2) continue;
      for (const sd of s.solids) {
        if (!sd.floor || sd.y1 > fromY + 0.05 || sd.y1 <= top) continue;
        if (solidWithin(sd, x, z, 0)) top = sd.y1;
      }
    }
    return top;
  }

  // ------------------------------------------------------------------ the frame

  lateUpdate(dt: number, ctx: GameContext): void {
    this.time += dt;
    const core = ctx.core;
    // (a pry let go of: the crowbar back in the hands)
    if (this.prying && this.time - this.prying.pryAt > 0.15) {
      this.prying.pryK = 0;
      this.prying = null;
      this.unpin();
    }
    for (const d of this.drawn.values()) {
      core.place(d.root, d.o.x, d.o.y, d.o.z);
      if (d.look) {
        d.root.updateMatrixWorld();
        d.look.setCarFrame(d.root.matrixWorld);
      }
      for (const door of d.doors) {
        // (a rattle, a bite: shaken on its hinge a moment)
        if (door.shake >= 0) door.shake = door.shake + dt > PRY.shakeS ? -1 : door.shake + dt;
        if (door.kick >= 0) door.kick = door.kick + dt > 0.27 ? -1 : door.kick + dt;
        if (door.t === door.target && door.shake < 0 && door.kick < 0) continue;
        // (a leaf moving: none merged with the others while it does)
        d.rest = 0;
        const was = door.t;
        // (Nomad Drive's own time for each door, opening and shutting; forced: quicker)
        const own = door.target ? (door.card.secs ?? SWING_S) : (door.card.shutSecs ?? door.card.secs ?? SWING_S);
        const swing = door.fast ? own * PRY.fast : own;
        door.t = door.target > door.t ? Math.min(door.target, door.t + dt / swing) : Math.max(door.target, door.t - dt / swing);
        if (door.t === door.target) door.fast = false;
        this.pose(door);
        if (was > 0 && door.t === 0) this.doorSound(door, false);
      }
      // (its leaves all still a while: merged into a draw a material)
      if (d.ready && !d.batch && (d.rest += dt) > BATCH_REST_S) this.batchDoors(d);
      // the lamps: each on as its switch is (or by the clock, a sign striking as it comes on); the rooms lit warm while one is
      let inside = false;
      for (const l of d.lamps) {
        const on = this.lampOn(d, l.card, ctx);
        l.glow.visible = on && !l.flame && !l.lit;
        if (l.lit && l.lit.shown !== on) {
          l.lit.shown = on;
          l.lit.meshes.forEach((m, i) => (m.material = on ? l.lit!.on : l.lit!.off[i]));
        }
        if (l.halo) l.halo.visible = on;
        if (l.flame) {
          l.flame.visible = on;
          if (on) flicker(l.flame, this.time);
        }
        if (on && (!l.card.hours || l.card.inside) && !l.flame) inside = true;
      }
      d.look?.setCabinLamp(inside ? this.warm : this.dark);
      if (d.spins?.length) this.turn(d, dt, ctx);
    }
    // (what is in a locker or an electric box is out of reach while its door is shut: looked at four times a second)
    if ((this.shutT -= dt) <= 0) {
      this.shutT = 0.25;
      for (const d of this.drawn.values()) if (d.doors.some((x) => x.card.box)) this.shutIn(d, ctx);
    }
    if ((this.checkT -= dt) > 0) return;
    this.checkT = CHECK_EVERY;
    const world = ctx.world;
    if (!world) return;
    const w = ctx.player.walker;
    const px = ctx.seated ? ctx.seated.sim.px : w.x;
    const pz = ctx.seated ? ctx.seated.sim.pz : w.z;
    const s = world.spine.sAtX(px);
    this.sites.length = 0;
    world.sites.between(s - FAR - 200, s + FAR + 200, this.sites);
    for (const site of this.sites) {
      if (!site.prefab || this.drawn.has(site.id)) continue;
      if (Math.hypot(site.x - px, site.z - pz) - site.reach > NEAR) continue;
      this.draw(site, ctx);
    }
    for (const [id, d] of [...this.drawn]) {
      if (Math.hypot(d.site.x - px, d.site.z - pz) - d.site.reach > FAR) this.drop(id, d);
    }
  }

  private draw(site: Site, ctx: GameContext): void {
    const o = site.objects.find((x) => x.kind === 'prefab');
    const b = ND_BUILDINGS[site.prefab];
    if (!o || !b) return;
    const root = new THREE.Group();
    root.name = `nd-build:${site.id}`;
    root.rotation.y = -o.yaw;
    ctx.core.scene.add(root);
    ctx.core.place(root, o.x, o.y, o.z);
    const d: Drawn = { site, o, b, root, look: null, doors: [], lamps: [], devices: [], ready: false, batch: null, batched: new Set(), rest: 0, tone: { paint: 0, paint2: 0, dirt: 0, rust: 0, wear: 0 } };
    this.drawn.set(site.id, d);
    // its doors and its switch work before the model is in (their solids from the card)
    for (const cd of b.geo.doors) d.doors.push(this.door(d, cd));
    for (const sw of b.geo.switches) d.devices.push(this.switchDevice(d, sw));
    for (const dr of d.doors) d.devices.push(dr.device);
    this.devices.push(...d.devices);
    void placeGlb(`nd/${site.prefab}`).then((m) => {
      if (this.drawn.get(site.id) !== d || !m) return;
      this.dress(d, m);
    });
  }

  private dress(d: Drawn, m: Model): void {
    const k = d.site.seed >>> 0;
    // (a house's walls and trims, or the place's own colours: a well's stones)
    const walls = d.b.paints?.walls ?? WALLS;
    const trims = d.b.paints?.trims ?? TRIMS;
    d.tone = {
      paint: walls[k % walls.length],
      paint2: trims[(k >>> 4) % trims.length],
      dirt: 0.2 + 0.25 * (((k >>> 8) & 0xff) / 255),
      rust: d.b.paints?.rust ?? 0.15,
      wear: 0.35 + 0.3 * (((k >>> 16) & 0xff) / 255),
    };
    const look = this.mats.look(`nd:${d.site.id}`, { ...d.tone, matte: PLACE_GLOSS });
    const model = cloneModel(m);
    applyMaterials(model, look);
    d.root.add(model);
    d.look = look;
    // the doors' leaves: the model's movers, hung shut or as they were left
    for (const door of d.doors) {
      door.obj = model.getObjectByName(door.card.name) ?? null;
      if (door.obj) {
        door.q0.copy(door.obj.quaternion);
        door.p0.copy(door.obj.position);
      }
      this.pose(door);
    }
    // what turns: a roof fan, a wind turbine's rotor (its own pace and a start of its own, by the place)
    d.spins = [];
    for (const [i, sp] of (d.b.geo.spins ?? []).entries()) {
      const obj = model.getObjectByName(`N_spin_${sp.name}`);
      if (!obj) continue;
      const r = (hash2(d.site.seed | 0, i, 0x5b1) >>> 0) / 4294967296;
      const r2 = (hash2(d.site.seed | 0, i, 0x5b2) >>> 0) / 4294967296;
      const axis = new THREE.Vector3(sp.axis === 'x' ? 1 : 0, sp.axis === 'y' ? 1 : 0, sp.axis === 'z' ? 1 : 0);
      d.spins.push({ card: sp, obj, q0: obj.quaternion.clone(), axis, k: 1 + 0.16 * (r - 0.5), angle: r2 * 360, rpm: 0, phase: r * 6.283 });
    }
    // the lamps' bulbs: a glow over each, seen when they are on
    this.glowGeo ??= new THREE.SphereGeometry(0.07, 12, 8);
    this.glowMat ??= new THREE.MeshBasicMaterial({ color: 0xfff1c8, toneMapped: false });
    for (const cl of d.b.geo.lamps) {
      const glow = new THREE.Mesh(this.glowGeo, this.glowMat);
      glow.position.set(cl.u, cl.y, cl.v);
      glow.visible = false;
      d.root.add(glow);
      // (a camp fire: its flames on its ash)
      let flame: THREE.Group | undefined;
      if (cl.name.startsWith('fire')) {
        flame = makeFire();
        flame.position.set(cl.u, cl.y - 0.38, cl.v);
        d.root.add(flame);
      }
      // (its own glass, lit with it: a tube's diffuser, a sign's letters)
      let lit: LiveLamp['lit'];
      const node = model.getObjectByName(`N_lit_${cl.name}`);
      if (node) {
        const meshes: THREE.Mesh[] = [];
        node.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
        });
        lit = { meshes, off: meshes.map((x) => x.material), on: this.litMat(cl.color ?? (cl.neon ? NEON : cl.warm ? BULB : TUBE)), shown: false };
      }
      // (a neon sign's halo about it, a beacon's red one seen from far; a lamp out of doors lights the ground under it)
      let halo: THREE.Object3D | undefined;
      if (cl.neon) halo = makeHalo(cl.color ?? NEON, 5.2, 3.0) ?? undefined;
      else if (cl.beacon) halo = makeHalo(cl.color ?? 0xff3a24, 4.5, 4.5, 0.85) ?? undefined;
      else if (cl.hours && !cl.inside) {
        halo = makePool(cl.color ?? (cl.warm ? BULB : TUBE), Math.min(9, cl.reach * 0.55)) ?? undefined;
        // (a floodlight's where its beam falls)
        halo?.position.set(cl.aim?.u ?? cl.u, (cl.pool ?? -(d.b.geo.plinth ?? 0)) + 0.02, cl.aim?.v ?? cl.v);
      }
      if (halo) {
        if (cl.neon || cl.beacon) halo.position.set(cl.u, cl.y, cl.v);
        d.root.add(halo);
      }
      d.lamps.push({ card: cl, glow, flame, lit, halo });
    }
    d.ready = true;
    for (const w of this.watchers) w.dressed(d.site, model, d.root);
  }

  private shutT = 0;

  /** the things in a drawn place's lockers and boxes: shut in while their doors are (Loose.shut: the mark passes them by) */
  private shutIn(d: Drawn, ctx: GameContext): void {
    const o = d.o;
    const c = Math.cos(o.yaw);
    const s = Math.sin(o.yaw);
    const r2 = (d.site.reach + 2) ** 2;
    for (const l of ctx.loose.list) {
      const dx = l.x - o.x;
      const dz = l.z - o.z;
      if (dx * dx + dz * dz > r2 || l.riding) continue;
      const u0 = c * dx + s * dz;
      const v0 = -s * dx + c * dz;
      const y = l.y - o.y;
      // (a compartment behind two doors — a container's — in reach while either of them stands open)
      let inBox = false;
      let open = false;
      for (const door of d.doors) {
        const b = door.card.box;
        if (!b) continue;
        // (a turned compartment — a container lying askew: the point turned back about its middle)
        let u = u0;
        let v = v0;
        if (b.turn) {
          const mu = (b.u0 + b.u1) / 2;
          const mv = (b.v0 + b.v1) / 2;
          const ct = Math.cos(b.turn);
          const st = Math.sin(b.turn);
          u = mu + ct * (u0 - mu) + st * (v0 - mv);
          v = mv - st * (u0 - mu) + ct * (v0 - mv);
        }
        if (u < b.u0 - 0.02 || u > b.u1 + 0.02 || v < b.v0 - 0.02 || v > b.v1 + 0.02 || y < b.y0 - 0.05 || y > b.y1) continue;
        inBox = true;
        if (door.t >= 0.35) {
          open = true;
          break;
        }
      }
      if (inBox) l.shut = !open;
    }
  }

  /**
   * What turns in a drawn place: always at its pace (a roof fan), or with the wind (Nomad Drive's rotor: 16 rpm at its
   * strongest, the wind's share of that; six seconds to speed up, twelve to slow; gusts of ±5 % a ten-second swell; each
   * its own ±8 %).
   */
  private turn(d: Drawn, dt: number, ctx: GameContext): void {
    const wind = Math.max(0, Math.min(1, (ctx.env.state?.wind ?? 4) / 18));
    for (const s of d.spins!) {
      let degS = s.card.degS ?? 0;
      if (s.card.rpm !== undefined) {
        const cs = s.card;
        // (its gusts: a rotor's one slow swell; a windmill's own quicker, bigger ones of two swells)
        const hz = cs.gustHz ?? 0.25;
        const g = cs.gust === undefined ? 1 + 0.05 * Math.sin(this.time * 0.1 * 2 * Math.PI + s.phase) : 1 + cs.gust * (0.65 * Math.sin(this.time * hz * 2 * Math.PI + s.phase) + 0.35 * Math.sin(this.time * hz * 4.74 * Math.PI + 1.3 * s.phase));
        const want = cs.rpm! * wind * s.k * g;
        const tau = want > s.rpm ? (cs.upS ?? 2) : (cs.downS ?? 4);
        s.rpm += (want - s.rpm) * (1 - Math.exp(-dt / tau));
        degS = s.rpm * 6;
      }
      s.angle = (s.angle + (s.card.sign ?? 1) * degS * dt) % 360;
      this.q.setFromAxisAngle(s.axis, (s.angle * Math.PI) / 180);
      s.obj.quaternion.copy(s.q0).multiply(this.q);
    }
  }

  /** a lamp's glass lit, by its colour (made once each, shared) */
  private readonly litMats = new Map<number, THREE.MeshBasicMaterial>();
  private litMat(color: number): THREE.MeshBasicMaterial {
    let m = this.litMats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
      this.litMats.set(color, m);
    }
    return m;
  }

  private drop(id: string, d: Drawn): void {
    if (d.ready) for (const w of this.watchers) w.dropped(id);
    this.unbatchDoors(d);
    d.root.removeFromParent();
    this.mats.drop(`nd:${id}`);
    for (const dev of d.devices) {
      const i = this.devices.indexOf(dev);
      if (i >= 0) this.devices.splice(i, 1);
    }
    this.drawn.delete(id);
  }

  /**
   * A building's leaves at rest merged one mesh a material (render/carMerge.ts, the look's colours and wear in their
   * vertices as a merged car's are), the leaves themselves hidden: where they stand now, shut or open
   */
  private batchDoors(d: Drawn): void {
    if (d.batch || !d.look) return;
    const still = d.doors.filter((x) => x.obj && x.obj.visible && x.t === x.target && x.shake < 0 && x.kick < 0);
    if (still.length < 2) return;
    const tone = d.tone;
    const group = mergeCarParts(
      still.map((x) => ({ object: x.obj!, paint: tone.paint, paint2: tone.paint2, dirt: tone.dirt, rust: tone.rust, wear: tone.wear, crust: 0 })),
      d.root,
    );
    group.name = 'nd-build:doors';
    applyMaterials(group, d.look, true);
    d.root.add(group);
    for (const x of still) {
      x.obj!.visible = false;
      d.batched.add(x);
    }
    d.batch = group;
  }

  /** every leaf its own again (one is about to move, or the building goes) */
  private unbatchDoors(d: Drawn): void {
    if (!d.batch) return;
    d.batch.removeFromParent();
    d.batch.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    for (const x of d.batched) if (x.obj) x.obj.visible = true;
    d.batched.clear();
    d.batch = null;
    d.rest = 0;
  }

  // ------------------------------------------------------------------ doors

  /** a door of a drawn building: its solid (shut), its device */
  private door(d: Drawn, cd: CardDoor): LiveDoor {
    const id = `${d.site.id}/${cd.name}`;
    // (most are found shut; one in five left open)
    // (a door found as another of the place is — a container's right door as its left — takes that one's roll)
    const twin = cd.same ? d.b.geo.doors.find((x) => x.name === cd.same) : undefined;
    const found: 0 | 1 = (hash2(d.site.seed, nameKey(twin ? twin.name : cd.name), 0xd00) & 0xff) < 52 ? 1 : 0;
    const pry = this.pryOf(id, twin ? twin.pry : cd.pry, twin ? `${d.site.id}/${twin.name}` : undefined);
    // (a stuck or locked door is found shut)
    const st = this.doorState.get(id) ?? (pry.locked || pry.stuck ? 0 : found);
    const o = d.o;
    const c = Math.cos(o.yaw);
    const s = Math.sin(o.yaw);
    // the leaf shut: from its hinge along (su, sv) its width, its thickness across
    const hx = o.x + c * cd.u - s * cd.v;
    const hz = o.z + s * cd.u + c * cd.v;
    const dx = c * cd.su - s * cd.sv;
    const dz = s * cd.su + c * cd.sv;
    const y0 = cd.y0 ?? 0;
    const solid = new Solid().set(hx + (dx * cd.width) / 2, hz + (dz * cd.width) / 2, cd.width / 2, Math.max(0.06, cd.thick / 2), Math.atan2(dz, dx), o.y + y0, o.y + cd.y1, false, `${d.site.id}:door`);
    const door: LiveDoor = { id, card: cd, obj: null, q0: new THREE.Quaternion(), p0: new THREE.Vector3(), t: st, target: st, solid, device: null as unknown as GarageDevice, pry, shake: -1, kick: -1, kickK: 0, fast: false, pryK: 0, pryAt: -1 };
    const sys = this;
    const ang0 = Math.atan2(dz, dx);
    // (a tilting leaf: its middle as it is turned about its hinge line now)
    const tm = { u: 0, y: 0, v: 0 };
    const tilted = (): typeof tm => {
      tiltMid(cd, cd.turn * ((cd.open * Math.PI) / 180) * door.t, tm);
      return tm;
    };
    door.device = {
      id: `nd-build:door:${id}`,
      // (the leaf's middle where it is now: shut in the doorway, open against the room)
      get x() {
        if (cd.tilt) {
          const m = tilted();
          return o.x + c * (cd.u + m.u) - s * (cd.v + m.v);
        }
        // (a sliding lid: its middle where it has slid to)
        if (cd.slide) return hx + dx * cd.open * door.t;
        const a = ang0 - cd.turn * ((cd.open * Math.PI) / 180) * door.t;
        return hx + (Math.cos(a) * cd.width) / 2;
      },
      get y() {
        if (cd.tilt) return o.y + y0 + tilted().y;
        // (a door from the floor: at the hand's height; a locker's door off it: its middle)
        return o.y + (y0 > 0.05 ? (y0 + cd.y1) / 2 : 1.1);
      },
      get z() {
        if (cd.tilt) {
          const m = tilted();
          return o.z + s * (cd.u + m.u) + c * (cd.v + m.v);
        }
        if (cd.slide) return hz + dz * cd.open * door.t;
        const a = ang0 - cd.turn * ((cd.open * Math.PI) / 180) * door.t;
        return hz + (Math.sin(a) * cd.width) / 2;
      },
      // (a locker's narrow door: no more than its own width round its middle, its neighbours its own)
      radius: Math.min(0.55, cd.width * 0.55),
      get word(): Text {
        return sys.doorWord(door);
      },
      // (locked or stuck, nothing in the hands for it: pressed, it rattles and says why)
      get why(): Text | null {
        return sys.doorWhy(door);
      },
      get state(): Text {
        if (door.pry.locked && door.pry.stuck) return T('门锁着，还卡住了', 'Locked and stuck');
        if (door.pry.locked) return T('门锁着', 'The door is locked');
        if (door.pry.stuck) return T('门卡住了', 'The door is stuck');
        return door.target ? T('门开着', 'The door is open') : T('门关着', 'The door is shut');
      },
      /** a crowbar in the hands on a door that will not give: E held pries it */
      get holdS(): number | undefined {
        return sys.barHeld() && !door.target && (door.pry.locked || door.pry.stuck) ? pryS(door.pry) : undefined;
      },
      holding: (k: number) => sys.prying_(door, k),
      use: () => sys.useDoor(door),
    };
    return door;
  }

  /** a door's state: as found (the world's seed), as one left it (unlocked with a key, forced) */
  private pryOf(id: string, kind?: CardDoor['pry'], roll?: string): PryState {
    if (this.forced.has(id)) return { locked: false, stuck: false };
    const k = kind ?? this.doorKind(id);
    const found = pryFound(this.ctx?.world?.seed ?? 0, roll ?? id, k);
    return this.keyed.has(id) ? unlockWithKey(found) : found;
  }

  /** a door's kind by its id (site/name), from its building's card (a house's when not found) */
  private doorKind(id: string): NonNullable<CardDoor['pry']> {
    const i = id.lastIndexOf('/');
    const d = this.drawn.get(id.slice(0, i));
    return d?.b.geo.doors.find((x) => x.name === id.slice(i + 1))?.pry ?? 'house';
  }

  barHeld(): boolean {
    const h = this.ctx?.player.held;
    return h?.kind === 'item' && h.item.item === ND_CROWBAR;
  }

  private keyHeld(): boolean {
    const h = this.ctx?.player.held;
    return h?.kind === 'item' && h.item.item === ND_KEY;
  }

  doorWord(door: LiveDoor): Text {
    const p = door.pry;
    if (door.target || (!p.locked && !p.stuck)) return door.target ? T('关门', 'Shut the door') : T('开门', 'Open the door');
    if (this.barHeld()) return T('撬开', 'Pry it open');
    if (p.locked && this.keyHeld()) return T('开锁', 'Unlock it with the key');
    return T('开门', 'Open the door');
  }

  /** why a door does not open pressed now (null: it does something) */
  doorWhy(door: LiveDoor): Text | null {
    const p = door.pry;
    if (door.target || (!p.locked && !p.stuck) || this.barHeld() || (p.locked && this.keyHeld())) return null;
    return p.locked ? T('锁着 · 要钥匙或撬棍', 'Locked · a key or a crowbar') : T('卡住了 · 要撬棍', 'Stuck · it needs a crowbar');
  }

  /** E on a door: open or shut it; one that will not give rattles; a key unlocks a locked one; a crowbar's hold, done, forces it */
  useDoor(door: LiveDoor): void {
    const ctx = this.ctx!;
    const p = door.pry;
    if (door.target || (!p.locked && !p.stuck)) return this.toggleDoor(door);
    if (this.barHeld()) return this.force(door);
    if (p.locked && this.keyHeld()) {
      // (the key turned: it stays in the lock)
      ctx.player.slots[ctx.player.sel] = null;
      door.pry = unlockWithKey(p);
      this.keyed.add(door.id);
      blip('click', 1);
      if (door.pry.stuck) {
        door.shake = 0;
        ctx.player.flashWhy('还卡着 · 要撬棍');
      } else {
        ctx.player.flashWhy('锁开了');
        this.toggleDoor(door);
      }
      return;
    }
    door.shake = 0;
    blip('fail', 0.7);
    // (it rattles; why is said with the press: doorWhy)
  }

  /** the crowbar's hold on a door (k of it done): the bar to the door's edge, its bites as they come */
  prying_(door: LiveDoor, k: number): void {
    if (k < door.pryK || this.time - door.pryAt > 0.25) door.pryK = 0;
    for (const b of pryBites(door.pry)) {
      if (door.pryK < b.at && k >= b.at) {
        door.kick = 0;
        door.kickK = b.strength;
        blip('dig', 0.5 + 0.4 * b.strength);
      }
    }
    door.pryK = k;
    door.pryAt = this.time;
    this.prying = door;
    this.pinBar(door, k);
  }

  /** forced: open for good, swinging fast; the crowbar spent a prying (its last breaks it) */
  private force(door: LiveDoor): void {
    const ctx = this.ctx!;
    door.pry = { locked: false, stuck: false };
    this.forced.add(door.id);
    door.fast = true;
    door.target = 1;
    this.doorState.set(door.id, 1);
    this.sound('door_house_open', 0.9);
    blip('strike', 0.8);
    this.prying = null;
    this.unpin();
    const h = ctx.player.held;
    if (h?.kind === 'item' && h.item.item === ND_CROWBAR && spendPry(h.item)) {
      ctx.player.slots[ctx.player.sel] = null;
      ctx.player.flashWhy('撬开了 · 撬棍断了');
    } else ctx.player.flashWhy('撬开了');
  }

  /** the crowbar set into the door's gap by its latch, leaning out towards one, levered round as the hold goes on */
  private pinBar(door: LiveDoor, k: number): void {
    const ctx = this.ctx!;
    const dev = door.device;
    const o = ctx.core.origin;
    const w = ctx.player.walker;
    // (the leaf's free edge: from its hinge along its line, the latch's height)
    const d = this.drawnOf(door);
    if (!d) return;
    const c = Math.cos(d.o.yaw);
    const s = Math.sin(d.o.yaw);
    const cd = door.card;
    const hx = d.o.x + c * cd.u - s * cd.v;
    const hz = d.o.z + s * cd.u + c * cd.v;
    const dx = c * cd.su - s * cd.sv;
    const dz = s * cd.su + c * cd.sv;
    const ex = hx + dx * (cd.width - 0.06);
    const ez = hz + dz * (cd.width - 0.06);
    void dev;
    // the bar from its claw in the gap up and out towards one: leaning 35° out of the upright, levered 28° more as it goes
    const tx = w.x - ex;
    const tz = w.z - ez;
    const tn = Math.hypot(tx, tz) || 1;
    const out = new THREE.Vector3(tx / tn, 0, tz / tn);
    const a = ((35 + 28 * k) * Math.PI) / 180;
    const along = new THREE.Vector3().copy(UP).multiplyScalar(Math.cos(a)).addScaledVector(out, Math.sin(a)).normalize();
    // (the model's +x runs from its grip to its claw: down the bar into the gap; its z across, along the door's edge)
    const xAxis = along.clone().negate();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, out).normalize();
    const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
    const model = ctx.heldThing.model;
    const at = model ? markerOfModel(model, 'M_tip') : new THREE.Vector3(0.28, 0.11, 0);
    ctx.heldThing.pinFor({ pos: new THREE.Vector3(ex - o.x, d.o.y + 1.0 - o.y, ez - o.z), q, at });
    this.pinned = true;
  }

  private unpin(): void {
    if (!this.pinned) return;
    this.pinned = false;
    this.ctx?.heldThing.pinFor(null);
  }

  private drawnOf(door: LiveDoor): Drawn | null {
    for (const d of this.drawn.values()) if (d.doors.includes(door)) return d;
    return null;
  }

  private pose(door: LiveDoor): void {
    if (!door.obj) return;
    // (a merged leaf moving: every leaf of its building its own again first)
    if (!door.obj.visible) {
      const d = this.drawnOf(door);
      if (d?.batched.has(door)) this.unbatchDoors(d);
    }
    if (door.card.slide) {
      // (a lid slides along its way, its own model's frame: the card's u, v)
      const k = smooth(door.t) * door.card.open;
      door.obj.position.set(door.p0.x + door.card.su * k, door.p0.y, door.p0.z + door.card.sv * k);
      return;
    }
    let a = door.card.turn * ((door.card.open * Math.PI) / 180) * smooth(door.t);
    // (rattled: a shiver on its latch; bitten by the bar: kicked open a little and back)
    if (door.shake >= 0) a += door.card.turn * 0.012 * Math.sin(door.shake * PRY.shakeHz * Math.PI * 2) * (1 - door.shake / PRY.shakeS);
    if (door.kick >= 0) {
      const t = door.kick;
      const k = t < 0.05 ? t / 0.05 : Math.max(0, 1 - (t - 0.05) / 0.22);
      a += door.card.turn * ((PRY.kickDeg * Math.PI) / 180) * door.kickK * k;
    }
    // (a tilting one about its level hinge line, the others about the upright)
    this.q.setFromAxisAngle(door.card.tilt ? this.tiltAxis.set(door.card.su, 0, door.card.sv).normalize() : UP, a);
    door.obj.quaternion.copy(door.q0).multiply(this.q);
  }

  private readonly tiltAxis = new THREE.Vector3();

  toggleDoor(door: LiveDoor): void {
    door.target = door.target ? 0 : 1;
    this.doorState.set(door.id, door.target);
    if (door.target) this.doorSound(door, true);
  }

  /** a door's sound as it opens or shuts: a house's door, a metal one, a stone lid grinding */
  private doorSound(door: LiveDoor, open: boolean): void {
    const m = door.card.mat;
    if (m === 'metal') this.sound(open ? 'latch' : 'door_close', 0.55);
    else if (m === 'stone') this.sound('scrape_start', open ? 0.6 : 0.45);
    else this.sound(open ? 'door_house_open' : 'door_house_close', 0.7);
  }

  solidsNear(x: number, z: number, r: number, out: Solid[]): void {
    // (a sliding lid and a tilting one stand in no doorway: what they close is the card's own solid)
    for (const d of this.drawn.values()) for (const door of d.doors) if (!door.card.slide && !door.card.tilt && door.t < SHUT && solidWithin(door.solid, x, z, r)) out.push(door.solid);
  }

  // ------------------------------------------------------------------ lamps

  /** whether a switch of a drawn place is on (as it was found, until one works one of its switches) */
  switchOn(d: Drawn, name: string): boolean {
    const id = d.site.id;
    if (!this.touched.has(id) && !this.lit.has(id) && ![...d.b.geo.switches].some((s) => this.lit.has(`${id}/${s.name}`))) return this.foundOn(d).has(name);
    return this.lit.has(id) || this.lit.has(`${id}/${name}`);
  }

  /** the switches a place's lamps are found on with (Nomad Drive's motel: two or three of them, by the world's seed and the place) */
  private foundOn(d: Drawn): Set<string> {
    const out = new Set<string>();
    const sl = d.b.startLit;
    const sws = d.b.geo.switches;
    if (!sl || !sws.length) return out;
    const k = hash2(d.site.seed | 0, 0x11a7, (this.ctx?.world?.seed ?? 0) | 0) >>> 0;
    const n = Math.min(sws.length, sl[0] + (k % (sl[1] - sl[0] + 1)));
    const order = sws.map((s, i) => ({ s, r: hash2(k | 0, i, 0x5e1) >>> 0 })).sort((a, b) => a.r - b.r);
    for (let i = 0; i < n; i++) out.add(order[i].s.name);
    return out;
  }

  /** a switch worked: on or off (the place's lamps as they were found become the ones one left) */
  private toggle(d: Drawn, sw: CardSwitch): void {
    const id = d.site.id;
    if (!this.touched.has(id)) {
      const was = [...d.b.geo.switches].filter((s) => this.switchOn(d, s.name)).map((s) => s.name);
      this.lit.delete(id);
      for (const s of d.b.geo.switches) this.lit.delete(`${id}/${s.name}`);
      for (const n of was) this.lit.add(`${id}/${n}`);
      this.touched.add(id);
    } else if (this.lit.has(id)) {
      // (a first save's whole place on: each of its switches on)
      this.lit.delete(id);
      for (const s of d.b.geo.switches) this.lit.add(`${id}/${s.name}`);
    }
    const key = `${id}/${sw.name}`;
    if (this.lit.has(key)) this.lit.delete(key);
    else this.lit.add(key);
  }

  /** a lamp of a drawn place lit now: by the clock (a neon strikes, after a moment, as it comes on), else by any switch of its */
  private lampOn(d: Drawn, cl: CardLamp, ctx: GameContext): boolean {
    if (cl.hours) {
      const h = ctx.clock.hour;
      const [a, b] = cl.hours;
      const on = a <= b ? h >= a && h < b : h >= a || h < b;
      const key = `${d.site.id}/${cl.name}`;
      if (!on) {
        this.strikes.delete(key);
        return false;
      }
      if (!cl.neon && !cl.tube) return true;
      let at = this.strikes.get(key);
      if (at === undefined) {
        // (Nomad Drive's: a moment's wait, up to 4 s, then a neon's 0.45 s of striking, a tube's 1.4 s)
        at = this.time + 4 * ((hash2(d.site.seed | 0, nameKey(cl.name), 0x9e0) >>> 0) / 4294967296);
        this.strikes.set(key, at);
      }
      const t = this.time - at;
      if (t < 0) return false;
      if (cl.tube) return t >= 1.4 || (t > 0.15 && t < 0.24) || (t > 0.5 && t < 0.62) || (t > 0.9 && t < 0.95) || t > 1.18;
      if (t < 0.45) return Math.sin(t * 61) > 0.1;
      return true;
    }
    for (const sw of d.b.geo.switches) if (sw.lamps.includes(cl.name) && this.switchOn(d, sw.name)) return true;
    return false;
  }

  private switchDevice(d: Drawn, sw: CardSwitch): GarageDevice {
    const o = d.o;
    const c = Math.cos(o.yaw);
    const s = Math.sin(o.yaw);
    const sys = this;
    return {
      id: `nd-build:switch:${d.site.id}/${sw.name}`,
      x: o.x + c * sw.u - s * sw.v,
      y: o.y + sw.y,
      z: o.z + s * sw.u + c * sw.v,
      radius: 0.12,
      get word(): Text {
        const on = sys.switchOn(d, sw.name);
        // (a camp fire is its own switch)
        if (sw.name.startsWith('fire')) return on ? T('灭火', 'Put the fire out') : T('点火', 'Light the fire');
        return on ? T('关灯', 'Lights off') : T('开灯', 'Lights on');
      },
      use: () => {
        sys.toggle(d, sw);
        sys.sound(sw.name.startsWith('fire') ? 'cloth' : 'switch', 0.6);
      },
    };
  }

  // ------------------------------------------------------------------ what the mark finds

  near(at: PlanPoint, r: number, out: GarageDevice[]): void {
    for (let i = 0; i < this.devices.length; i++) {
      const dev = this.devices[i];
      const dx = dev.x - at.x;
      const dz = dev.z - at.z;
      const rr = r + dev.radius;
      if (dx * dx + dz * dz <= rr * rr) out.push(dev);
    }
  }

  private sound(name: string, gain: number): void {
    this.ctx?.sound(name, gain);
  }

  telemetry(): Record<string, unknown> {
    return {
      drawn: [...this.drawn.values()].map((d) => ({ site: d.site.id, prefab: d.site.prefab, ready: d.ready, doors: d.doors.map((x) => x.t), lit: d.b.geo.switches.some((s) => this.switchOn(d, s.name)), switches: d.b.geo.switches.map((s) => `${s.name}:${this.switchOn(d, s.name) ? 1 : 0}`) })),
    };
  }

  readonly harness = {
    /** the buildings drawn now and whether their models are in */
    drawn: (): { site: string; ready: boolean }[] => [...this.drawn.values()].map((d) => ({ site: d.site.id, ready: d.ready })),
    /** the prefab places laid so far along the road: id, card, arc length, where its floor is */
    places: (): { id: string; prefab: string; s: number; x: number; y: number; z: number; yaw: number }[] => {
      const w = this.ctx?.world;
      if (!w) return [];
      const out: Site[] = [];
      w.sites.between(0, w.spine.sAtX(this.ctx!.player.walker.x) + 40000, out);
      return out
        .filter((s) => s.prefab)
        .map((s) => {
          const o = s.objects.find((x) => x.kind === 'prefab')!;
          return { id: s.id, prefab: s.prefab, s: s.s, x: o.x, y: o.y, z: o.z, yaw: o.yaw };
        });
    },
    /** a building's door (its first, or the one named) opened or shut at once */
    door: (site: string, open: boolean, name?: string): boolean => {
      const d = this.drawn.get(site);
      const door = name ? d?.doors.find((x) => x.card.name === name) : d?.doors[0];
      if (!door) return false;
      if (!!door.target !== open) this.toggleDoor(door);
      door.t = door.target;
      this.pose(door);
      return true;
    },
    /** a building's first door made stuck or locked (a test), and how it is now */
    setPry: (site: string, locked: boolean, stuck: boolean): boolean => {
      const door = this.drawn.get(site)?.doors[0];
      if (!door) return false;
      door.pry = { locked, stuck };
      if (locked || stuck) {
        door.t = door.target = 0;
        this.pose(door);
      }
      return true;
    },
    /** every door of a building: its name, how it was found (locked, stuck), how open */
    doors: (site: string): { name: string; locked: boolean; stuck: boolean; open: number }[] => (this.drawn.get(site)?.doors ?? []).map((x) => ({ name: x.card.name, ...x.pry, open: x.t })),
    pry: (site: string): { locked: boolean; stuck: boolean; open: number } | null => {
      const door = this.drawn.get(site)?.doors[0];
      return door ? { ...door.pry, open: door.t } : null;
    },
    lights: (site: string, on: boolean): void => {
      const d = this.drawn.get(site);
      this.touched.add(site);
      this.lit.delete(site);
      for (const s of d?.b.geo.switches ?? []) {
        if (on) this.lit.add(`${site}/${s.name}`);
        else this.lit.delete(`${site}/${s.name}`);
      }
      if (!d && on) this.lit.add(site);
    },
  };

  dispose(): void {
    for (const [id, d] of [...this.drawn]) this.drop(id, d);
    this.glowGeo?.dispose();
    this.glowMat?.dispose();
    for (const m of this.litMats.values()) m.dispose();
    this.litMats.clear();
  }
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** a marker of a model in its own frame (its tip) */
function markerOfModel(model: THREE.Object3D, name: string): THREE.Vector3 {
  const m = model.getObjectByName(name);
  const v = new THREE.Vector3(0.28, 0.11, 0);
  if (!m) return v;
  m.updateWorldMatrix(true, false);
  model.updateWorldMatrix(true, false);
  v.setFromMatrixPosition(m.matrixWorld);
  return model.worldToLocal(v);
}

// (a crowbar's card: its prying left)
registerItemCardLines({ item: ND_CROWBAR }, (inst, card) => {
  const n = priesLeft(inst);
  card.bars.push({ label: '还能撬', value: n, max: PRY.uses, text: `${n} / ${PRY.uses} 次`, tone: 'mid' });
});
