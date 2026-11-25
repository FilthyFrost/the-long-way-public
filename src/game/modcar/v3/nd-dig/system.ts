/**
 * The ND digging in the game (docs/ND/PLAN.md, ND3; its rules: core/v3/nd/dig.ts, as Nomad Drive has it):
 *
 *  - The places by the road have their chests buried round them (the same every visit of the same world) and their
 *    keys lying on the ground on their road side, there while one is near (a key once taken is one's own).
 *  - The shovel in the hands digs with the left button where the line of sight meets bare ground within 3 m (not the
 *    road, not a floor): over a chest each stroke brings it up a stage, its hole opening round it — the fourth and it
 *    is out, a chest one can carry; anywhere else a patch of sand is left for two minutes. The shovel goes into the
 *    ground and comes up again with each stroke.
 *  - The metal detector in the hands, its coil swept over the ground ahead, beeps for the nearest chest not dug at
 *    within 30 m, the faster the nearer, its lamp flashing with each beep; right over it, a steady tone.
 *  - A chest out of the ground is locked: E rattles its padlock, E held half a second with a key in the hands opens
 *    it (the key stays in it, the padlock falls). Then E opens and shuts its lid (0.5 s); open, what is in it is in
 *    the list (three or four things the first time). Shut, F held carries it, locked or not.
 *  - What has been dug, what is out, which keys are taken is kept (the save's slice `nd-dig`).
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import type { SaveSlice } from '../../../../core/kernel/slices';
import { hash2 } from '../../../../core/math/rng';
import { itemDef, newItem, putInside, type ItemInstance } from '../../../../core/modcar/items';
import type { Text } from '../../../../core/modcar/types';
import { beepFor, chestLoot, chestUnder, DETECT, DIG, keyFor, LOCK, ND_CHEST, ND_CHEST_RARE, ND_DETECTOR, ND_KEY, ND_KEY_RARE, ND_SHOVEL, treasuresOf, type Treasure } from '../../../../core/v3/nd/dig';
import type { Site } from '../../../../core/world/sites';
import { ROAD_HALF } from '../../../../core/world/terrain';
import { surfaceMaterial } from '../../../render/materials';
import { cloneModel, itemGlb, type Model } from '../../assets';
import type { GarageDevice } from '../../garageStub';
import type { Action } from '../../hudItems';
import { itemCardKept, type ItemCard } from '../../itemInfo';
import { itemNow } from '../../itemTime';
import type { GameContext } from '../../kernel/context';
import type { InteractSource, PlanPoint } from '../../kernel/interact';
import { boxList, openList } from '../../listSources';
import type { Loose } from '../../loose';
import { applyMaterials, CarMaterials } from '../../materials';
import type { HandsUse, Held } from '../../player';
import { blenderBox, blip, boxHit, chestDealers, extraOf, markerOf, modelOf, Tone } from '../../nd/kit';

const T = (zh: string, en: string): Text => ({ zh, en });
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
/** places are looked over this often (s), within this of one (m); keys lie while one is within NEAR, go beyond FAR */
const CHECK_S = 0.5;
const LOOK = 260;
const NEAR = 90;
const FAR = 150;
const BOX_CHEST = blenderBox(0.0, 0.0, 0.23, 0.62, 0.84, 0.47);
/** a chest's half height (its middle is where Nomad Drive puts it at each stage) */
const CHEST_HALF = 0.225;

/** what has become of one buried chest (the save's) */
interface Rec {
  stage: number;
  /** out of the ground (a chest lying about from then on) */
  out?: true;
  /** its key taken */
  key?: true;
}

interface Saved {
  recs?: Record<string, Rec>;
}

/** a chest coming up out of its hole (stages 1 to 3): its model, the hole round it, where it is going */
interface Rising {
  t: Treasure;
  group: THREE.Group;
  chest: THREE.Object3D | null;
  hole: THREE.Mesh;
  /** the stage it shows, the one it moves from, how far through the move (0 … 1) */
  shown: number;
  from: number;
  move: number;
  holeK: number;
  /** after it is out: the time its chest left the hole (−1 not yet), the chest */
  leftAt: number;
}

/** a patch of sand where a stroke found nothing */
interface Patch {
  mesh: THREE.Mesh;
  until: number;
}

/** a chest lying about: its lid, its padlock */
interface Box {
  l: Loose;
  thing: ChestThing;
  lid: THREE.Object3D | null;
  q0: THREE.Quaternion;
  model: THREE.Object3D | null;
  /** the lid's opening (0 shut … 1 open) */
  lidT: number;
  lock: THREE.Group | null;
  /** the padlock's rattle, its falling off (time into each; −1 none) */
  rattle: number;
  fall: number;
  fallY: number;
  fallV: number;
}

class ChestThing implements GarageDevice {
  readonly id: string;
  readonly radius = 0.45;
  readonly alt = null;
  constructor(
    readonly sys: NdDig,
    readonly b: Box,
  ) {
    this.id = `nd-dig:${b.l.uid}`;
  }
  /** shut, it can be carried (F held); open, not */
  get loose(): Loose | undefined {
    return this.sys.isOpen(this.b) ? undefined : this.b.l;
  }
  get x(): number {
    return this.b.l.x;
  }
  get y(): number {
    return this.b.l.y + 0.25;
  }
  get z(): number {
    return this.b.l.z;
  }
  get word(): Text {
    return this.sys.chestWord(this.b);
  }
  get card(): ItemCard {
    return itemCardKept(this.b.l.item!, itemNow(), this.sys.time);
  }
  get holdS(): number | undefined {
    return this.sys.locked(this.b) && this.sys.keyHeld(this.b) ? LOCK.holdS : undefined;
  }
  take(held: NonNullable<Held>): { ok: boolean; word: Text } | null {
    if (!this.sys.locked(this.b)) return null;
    if (held.kind === 'item' && (held.item.item === ND_KEY || held.item.item === ND_KEY_RARE) && !this.sys.keyHeld(this.b)) return { ok: false, word: T('钥匙不对', 'Wrong key') };
    return null;
  }
  use(): void {
    this.sys.useChest(this.b);
  }
  hit(ray: THREE.Ray, reach: number): number | null {
    const d = boxHit(this.b.l.obj, ray, BOX_CHEST, reach);
    return d === null ? null : d + 0.05;
  }
}

export class NdDig implements System<GameContext>, InteractSource {
  readonly id = 'nd-dig';
  readonly budget = { cpuMs: 0.3 };
  private ctx: GameContext | null = null;
  time = 0;
  private checkT = 0;
  private readonly recs = new Map<string, Rec>();
  /** the places' fields as laid out (by place id), the ones near now */
  private readonly fields = new Map<string, Treasure[]>();
  private readonly nearTreasures: Treasure[] = [];
  private readonly sites: Site[] = [];
  /** keys lying where their places put them (by treasure id) */
  private readonly keys = new Map<string, Loose>();
  private readonly rising = new Map<string, Rising>();
  private readonly patches: Patch[] = [];
  private readonly boxes = new Map<Loose, Box>();
  private rev = -1;
  private readonly mats = new CarMaterials();
  private chestModel: Model | null = null;
  private chestModelAsked = false;
  private sandMat: THREE.Material | null = null;
  private holeMat: THREE.Material | null = null;
  private steelMat: THREE.Material | null = null;
  private patchGeo: THREE.BufferGeometry | null = null;
  private puffs: { mesh: THREE.Mesh; v: THREE.Vector3; t: number }[] = [];
  /** the shovel's stroke: when it began, where it went in (render space), how it was turned */
  private stroke: { t0: number; at: THREE.Vector3; yaw: number } | null = null;
  private lastStroke = -9;
  private pinned = false;
  /** the detector: the next look, the chest heard and how far, the next beep, its lamp */
  private detNext = 0;
  private heard: { t: Treasure; d: number } | null = null;
  private beepAt = 0;
  private led = 0;
  private ledMesh: THREE.Mesh | null = null;
  private readonly tone = new Tone();
  private readonly pinP = new THREE.Vector3();
  private readonly pinQ = new THREE.Quaternion();
  private readonly qa = new THREE.Quaternion();
  private readonly qb = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly proj = { s: 0, d: 0 };
  /** what was dug (the harness): strokes, stages gained */
  strokes = 0;
  stages = 0;

  readonly slice: SaveSlice<Saved> = {
    id: 'nd-dig',
    version: 1,
    snapshot: () => {
      if (!this.recs.size) return undefined;
      const recs: Record<string, Rec> = {};
      for (const [k, r] of [...this.recs].sort((a, b) => (a[0] < b[0] ? -1 : 1))) recs[k] = r;
      return { recs };
    },
    restore: (d) => {
      this.recs.clear();
      for (const [k, r] of Object.entries(d.recs ?? {})) {
        if (!r || typeof r.stage !== 'number') continue;
        this.recs.set(k, { stage: Math.max(0, Math.min(DIG.stages, Math.floor(r.stage))), ...(r.out ? { out: true as const } : {}), ...(r.key ? { key: true as const } : {}) });
      }
    },
    clear: () => this.recs.clear(),
  };

  readonly shovel: HandsUse = {
    id: 'nd-dig:shovel',
    claims: (h) => h.kind === 'item' && h.item.item === ND_SHOVEL,
    press: (_h, from) => {
      if (from !== 'mouse') return false;
      this.dig();
      return true;
    },
    step: (_h, dt) => this.strokeStep(dt),
    words: () => {
      const h = this.groundHit();
      return [typeof h === 'string' ? { keys: ['LMB'], text: '挖', off: true, why: h } : { keys: ['LMB'], text: this.digWord() }];
    },
    gone: () => {
      this.stroke = null;
      this.unpin();
    },
  };

  readonly detector: HandsUse = {
    id: 'nd-dig:detector',
    claims: (h) => h.kind === 'item' && h.item.item === ND_DETECTOR,
    step: (_h, dt) => this.detectStep(dt),
    words: () => this.detectWords(),
    gone: () => {
      this.tone.set(false);
      this.heard = null;
      this.unpin();
    },
  };

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.player.hands?.push(this.shovel, this.detector);
  }

  private rec(id: string): Rec {
    let r = this.recs.get(id);
    if (!r) {
      r = { stage: 0 };
      this.recs.set(id, r);
    }
    return r;
  }

  private stageOf(id: string): number {
    return this.recs.get(id)?.stage ?? 0;
  }

  // ------------------------------------------------------------------ the places' fields

  private onRoad = (x: number, z: number): boolean => {
    const w = this.ctx?.world;
    if (!w) return false;
    w.spine.project(x, z, w.spine.sAtX(x), this.proj);
    return Math.abs(this.proj.d) < ROAD_HALF + 1.2;
  };

  private lookOver(ctx: GameContext): void {
    const world = ctx.world;
    if (!world) return;
    // (where one is: in the vehicle one sits in, else on foot)
    const sv = ctx.seated;
    const w = sv ? { x: sv.sim.px, z: sv.sim.pz } : ctx.player.walker;
    const s = world.spine.sAtX(w.x);
    this.sites.length = 0;
    world.sites.between(s - LOOK - 100, s + LOOK + 100, this.sites);
    this.nearTreasures.length = 0;
    for (const site of this.sites) {
      if (Math.hypot(site.x - w.x, site.z - w.z) - site.reach > LOOK) continue;
      let list = this.fields.get(site.id);
      if (!list) {
        list = treasuresOf(site, world.seed, this.onRoad);
        this.fields.set(site.id, list);
      }
      for (const t of list) this.nearTreasures.push(t);
    }
    // the keys where their places put them, while one is near; a key taken is one's own
    const seenKey = new Set<string>();
    for (const l of ctx.loose.list) {
      const of = l.item?.state?.keyOf;
      if (of) seenKey.add(of);
    }
    for (const t of this.nearTreasures) {
      const r = this.recs.get(t.id);
      if (r?.key) continue;
      const d = Math.hypot(t.kx - w.x, t.kz - w.z);
      const l = this.keys.get(t.id);
      if (l && !ctx.loose.list.includes(l)) {
        // (picked up: one's own from now on)
        this.keys.delete(t.id);
        this.rec(t.id).key = true;
        continue;
      }
      // (a key before the metal detector has been picked up is a piece of a set not begun: not yet — the game's)
      if (!l && d < NEAR && !seenKey.has(t.id) && !ctx.withheld?.(t.key)) {
        const it = newItem(t.key, { state: { keyOf: t.id } });
        const k = ctx.loose.addItem(it, t.kx, world.heightAt(t.kx, t.kz) + 0.05, t.kz, t.yaw);
        k.resting = true;
        this.keys.set(t.id, k);
      } else if (l && d > FAR) {
        ctx.loose.remove(l);
        this.keys.delete(t.id);
      }
    }
    // the chests coming up out of their holes, near
    for (const t of this.nearTreasures) {
      const st = this.stageOf(t.id);
      if (st >= 1 && !this.recs.get(t.id)?.out && !this.rising.has(t.id)) this.rise(t, st, st);
    }
    for (const [id, rs] of [...this.rising]) {
      if (Math.hypot(rs.t.x - w.x, rs.t.z - w.z) > FAR + 40) this.unrise(id, rs);
    }
  }

  // ------------------------------------------------------------------ the shovel

  /** where the line of sight meets bare ground within reach (world), or why not */
  private groundHit(): { x: number; y: number; z: number } | string {
    const ctx = this.ctx!;
    const world = ctx.world;
    if (!world) return '这里挖不了';
    const p = ctx.player;
    for (let s = 0.1; s <= DIG.reach; s += 0.05) {
      const x = p.eye.x + p.dir.x * s;
      const y = p.eye.y + p.dir.y * s;
      const z = p.eye.z + p.dir.z * s;
      const top = ctx.loose.surfaceAt(x, z, y + 0.05);
      if (y > top) continue;
      const g = world.heightAt(x, z);
      if (top > g + 0.05) return '这里挖不了';
      if (this.onRoad(x, z) && Math.abs(this.proj.d) < ROAD_HALF + 0.3) return '路面挖不动';
      const cover = world.sites.coverAt(x, g + 0.5, z);
      if (cover) return '屋里挖不了';
      return { x, y: g, z };
    }
    return '对着脚边的土';
  }

  private digWord(): string {
    const h = this.groundHit();
    void h;
    return '挖';
  }

  private dig(): void {
    const ctx = this.ctx!;
    if (this.time - this.lastStroke < DIG.coolS) return;
    const h = this.groundHit();
    if (typeof h === 'string') {
      ctx.ui.say(h, 1.6);
      return;
    }
    this.lastStroke = this.time;
    this.strokes++;
    const o = ctx.core.origin;
    const w = ctx.player.walker;
    this.stroke = { t0: this.time, at: new THREE.Vector3(h.x - o.x, h.y - o.y, h.z - o.z), yaw: Math.atan2(h.z - w.z, h.x - w.x) };
    // a chest under it: up a stage; else a patch of sand
    const list = this.nearTreasures.filter((t) => !this.recs.get(t.id)?.out).map((t) => ({ t, x: t.x, z: t.z, stage: this.stageOf(t.id) }));
    const i = chestUnder(list, h.x, h.z);
    if (i >= 0) {
      const t = list[i].t;
      const r = this.rec(t.id);
      const first = r.stage === 0;
      r.stage++;
      this.stages++;
      blip(first ? 'strike' : 'dig', 0.9);
      if (r.stage >= DIG.stages) this.surface(t);
      else {
        const rs = this.rising.get(t.id);
        if (rs) {
          rs.from = rs.shown;
          rs.shown = r.stage;
          rs.move = 0;
        } else this.rise(t, r.stage, r.stage - 1);
      }
      return;
    }
    blip('dig', 0.75);
    this.sand(h.x, h.y, h.z);
  }

  /** the shovel's stroke: into the ground (0.14 s), up with a scoop (0.18 s), back to the hands */
  private strokeStep(_dt: number): void {
    const ctx = this.ctx!;
    const s = this.stroke;
    if (!s) return;
    const t = this.time - s.t0;
    if (t > 0.32) {
      this.stroke = null;
      this.unpin();
      return;
    }
    let up: number;
    let tilt = -0.96;
    if (t < 0.14) {
      const k = t / 0.14;
      up = 0.23 + (-0.02 - 0.23) * (1 - Math.pow(1 - k, 3));
    } else {
      const k = (t - 0.14) / 0.18;
      up = -0.02 + 0.15 * k;
      tilt += (35 * Math.PI) / 180 * k;
    }
    this.qa.setFromAxisAngle(Y, -s.yaw);
    this.qb.setFromAxisAngle(Z, tilt);
    this.pinQ.copy(this.qa).multiply(this.qb);
    this.pinP.copy(s.at).y += up;
    const model = ctx.heldThing.model;
    const at = markerOf(model, 'M_blade', this.v.set(0.59, 0.03, 0));
    ctx.heldThing.pinFor({ pos: this.pinP.clone(), q: this.pinQ.clone(), at });
    this.pinned = true;
  }

  private unpin(): void {
    if (!this.pinned) return;
    this.pinned = false;
    this.ctx?.heldThing.pinFor(null);
  }

  private sand(x: number, y: number, z: number): void {
    const ctx = this.ctx!;
    this.patchGeo ??= this.patchShape();
    this.sandMat ??= surfaceMaterial({ color: 0xc9b07a });
    const m = new THREE.Mesh(this.patchGeo, this.sandMat);
    m.name = 'nd-dig:sand';
    m.rotation.y = Math.random() * Math.PI * 2;
    m.scale.setScalar(0.35 + Math.random() * 0.1);
    ctx.core.scene.add(m);
    ctx.core.place(m, x, y + 0.015, z);
    this.patches.push({ mesh: m, until: this.time + DIG.sandS });
    // (no more than a few dozen at once)
    if (this.patches.length > 40) this.patches.shift()?.mesh.removeFromParent();
  }

  /** an uneven round patch, flat on the ground (its edge a little ragged) */
  private patchShape(): THREE.BufferGeometry {
    const n = 18;
    const pos: number[] = [0, 0, 0];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 1 + 0.12 * Math.sin(a * 5) + 0.07 * Math.sin(a * 3 + 1);
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
    const idx: number[] = [];
    for (let i = 1; i <= n; i++) idx.push(0, i + 1, i);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // ------------------------------------------------------------------ chests coming up

  private loadChest(): void {
    if (this.chestModelAsked) return;
    this.chestModelAsked = true;
    void itemGlb(itemDef(ND_CHEST).model).then((m) => {
      this.chestModel = m;
      for (const rs of this.rising.values()) this.dressRising(rs);
    });
  }

  private rise(t: Treasure, stage: number, from: number): void {
    const ctx = this.ctx!;
    const world = ctx.world;
    if (!world) return;
    this.loadChest();
    const g = new THREE.Group();
    g.name = `nd-dig:rising:${t.id}`;
    ctx.core.scene.add(g);
    this.patchGeo ??= this.patchShape();
    this.holeMat ??= surfaceMaterial({ color: 0x4a3626 });
    const hole = new THREE.Mesh(this.patchGeo, this.holeMat);
    hole.position.y = 0.012;
    hole.scale.setScalar(0.62);
    g.add(hole);
    const rs: Rising = { t, group: g, chest: null, hole, shown: stage, from, move: from === stage ? 1 : 0, holeK: from === stage ? 1 : 0, leftAt: -1 };
    this.rising.set(t.id, rs);
    this.dressRising(rs);
  }

  private dressRising(rs: Rising): void {
    if (rs.chest || !this.chestModel) return;
    const model = cloneModel(this.chestModel);
    const d = itemDef(rs.t.chest);
    applyMaterials(model, this.mats.look(`nd-dig:${rs.t.id}`, { paint: d.paint, paint2: d.paint2, dirt: 0.75, crust: 0.5 }));
    rs.group.add(model);
    rs.chest = model;
  }

  private unrise(id: string, rs: Rising): void {
    rs.group.removeFromParent();
    this.mats.drop(`nd-dig:${id}`);
    this.rising.delete(id);
  }

  /** out of the ground: a chest lying about, locked; its hole stays a while */
  private surface(t: Treasure): void {
    const ctx = this.ctx!;
    const world = ctx.world!;
    const r = this.rec(t.id);
    r.out = true;
    const it = newItem(t.chest, { state: { chest: { from: t.id } } });
    const g = world.heightAt(t.x, t.z);
    const l = ctx.loose.addItem(it, t.x, g + 0.03, t.z, t.yaw);
    l.resting = true;
    ctx.loose.touch(l);
    const rs = this.rising.get(t.id);
    if (rs?.chest) {
      rs.chest.removeFromParent();
      rs.chest = null;
    }
    // (the dust it throws up)
    const o = ctx.core.origin;
    this.puff(t.x - o.x, g + 0.2 - o.y, t.z - o.z);
    ctx.ui.say('挖出一个箱子', 2.4);
  }

  private puff(x: number, y: number, z: number): void {
    const ctx = this.ctx!;
    const geo = new THREE.SphereGeometry(0.07, 8, 6);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xc9b07a, transparent: true, opacity: 0.8, depthWrite: false }));
      m.position.set(x, y, z);
      ctx.core.scene.add(m);
      const a = (i / 10) * Math.PI * 2;
      this.puffs.push({ mesh: m, v: new THREE.Vector3(Math.cos(a) * 0.8, 0.9 + Math.random() * 0.6, Math.sin(a) * 0.8), t: 0 });
    }
  }

  private stepRising(dt: number, ctx: GameContext): void {
    const world = ctx.world;
    if (!world) return;
    for (const [id, rs] of [...this.rising]) {
      const t = rs.t;
      const g = world.heightAt(t.x, t.z);
      ctx.core.place(rs.group, t.x, g, t.z);
      rs.holeK = Math.min(1, rs.holeK + dt / 0.25);
      // the hole: 0.8 to 1 as it opens (a little overshoot)
      const k = rs.holeK;
      const back = 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
      let hs = 0.62 * (0.8 + 0.2 * back);
      const r = this.recs.get(id);
      if (r?.out) {
        // (out: the hole stays a minute once its chest has gone from it, then shrinks away)
        const chest = [...this.boxes.keys()].find((l) => l.item?.state?.chest?.from === id);
        const gone = !chest || Math.hypot(chest.x - t.x, chest.z - t.z) > 1;
        if (gone && rs.leftAt < 0) rs.leftAt = this.time;
        if (rs.leftAt >= 0) {
          const after = this.time - rs.leftAt - DIG.holeS;
          if (after > DIG.holeFadeS) {
            this.unrise(id, rs);
            continue;
          }
          if (after > 0) hs *= 1 - after / DIG.holeFadeS;
        }
      }
      rs.hole.scale.setScalar(hs);
      if (rs.chest) {
        rs.move = Math.min(1, rs.move + dt / DIG.moveS);
        const e = 1 - Math.pow(1 - rs.move, 3);
        const y0 = DIG.stageY[Math.max(0, rs.from - 1)] ?? DIG.stageY[0];
        const y1 = DIG.stageY[Math.max(0, rs.shown - 1)];
        const tw0 = DIG.stageTwist[Math.max(0, rs.from - 1)];
        const tw1 = DIG.stageTwist[Math.max(0, rs.shown - 1)];
        const yy = (rs.from === 0 ? y1 - 0.4 : y0) + (y1 - (rs.from === 0 ? y1 - 0.4 : y0)) * e;
        rs.chest.position.set(0, yy - CHEST_HALF, 0);
        rs.chest.rotation.set(0, -t.yaw + ((tw0[0] + (tw1[0] - tw0[0]) * e) * Math.PI) / 180, ((tw0[1] + (tw1[1] - tw0[1]) * e) * Math.PI) / 180);
      }
    }
  }

  // ------------------------------------------------------------------ the detector

  private coil(out: THREE.Vector3): THREE.Vector3 {
    const ctx = this.ctx!;
    const w = ctx.player.walker;
    const fx = ctx.player.dir.x;
    const fz = ctx.player.dir.z;
    const n = Math.hypot(fx, fz) || 1;
    const sweep = 0.31 * Math.sin((this.time / 2.0) * Math.PI * 2);
    const a = Math.atan2(fz / n, fx / n) + sweep;
    const x = w.x + Math.cos(a) * 1.15;
    const z = w.z + Math.sin(a) * 1.15;
    return out.set(x, (ctx.world?.heightAt(x, z) ?? w.y) + 0.12, z);
  }

  private detectStep(dt: number): void {
    const ctx = this.ctx!;
    const c = this.coil(this.v);
    // (where the coil is: held there, flat over the ground, at its own size)
    const o = ctx.core.origin;
    const w = ctx.player.walker;
    this.qa.setFromAxisAngle(Y, -Math.atan2(c.z - w.z, c.x - w.x));
    const model = ctx.heldThing.model;
    const at = markerOf(model, 'M_coil', new THREE.Vector3(0.36, 0.005, 0));
    ctx.heldThing.pinFor({ pos: new THREE.Vector3(c.x - o.x, c.y - o.y, c.z - o.z), q: this.qa.clone(), at });
    this.pinned = true;
    // what it hears, ten times a second: the nearest chest not dug at, on the plan
    if ((this.detNext -= dt) <= 0) {
      this.detNext = DETECT.everyS;
      let best: Treasure | null = null;
      let bd: number = DETECT.range;
      for (const t of this.nearTreasures) {
        if (this.stageOf(t.id) > 0 || this.recs.get(t.id)?.out) continue;
        const d = Math.hypot(t.x - c.x, t.z - c.z);
        if (d <= bd) {
          bd = d;
          best = t;
        }
      }
      this.heard = best ? { t: best, d: bd } : null;
    }
    const b = this.heard ? beepFor(this.heard.d) : null;
    this.tone.set(b === 'tone');
    if (b === 'tone') this.led = 10;
    else if (typeof b === 'number') {
      if (this.time >= this.beepAt) {
        blip('beep', 0.8);
        this.led = 6;
        this.beepAt = this.time + b;
      }
      this.led = Math.max(0.6, this.led - (6 / 0.12) * dt);
    } else this.led = 0.6;
    this.showLed(model);
  }

  private showLed(model: THREE.Object3D | null): void {
    if (!model) return;
    if (!this.ledMesh) {
      this.ledMesh = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 6), new THREE.MeshBasicMaterial({ color: 0xff1a00, toneMapped: false, transparent: true }));
      this.ledMesh.name = 'nd-dig:led';
    }
    if (this.ledMesh.parent !== model) model.add(this.ledMesh);
    this.ledMesh.position.set(-0.235, 0.327, -0.022);
    const m = this.ledMesh.material as THREE.MeshBasicMaterial;
    const k = Math.min(1, this.led / 10);
    m.color.setRGB(0.25 + 0.75 * k, 0.03 + 0.07 * k, 0);
    m.opacity = 0.5 + 0.5 * k;
  }

  private detectWords(): Action[] {
    if (!this.heard) return [];
    const b = beepFor(this.heard.d);
    // (the beeping says how near: nothing written but when it is right under one)
    return b === 'tone' ? [{ keys: [], text: '就在下面' }] : [];
  }

  // ------------------------------------------------------------------ chests lying about

  private refresh(ctx: GameContext): void {
    const loose = ctx.loose;
    if (loose.rev === this.rev) return;
    this.rev = loose.rev;
    const seen = new Set<Loose>();
    for (const l of loose.list) {
      if (l.item?.item !== ND_CHEST && l.item?.item !== ND_CHEST_RARE) continue;
      seen.add(l);
      l.device = true;
      if (!this.boxes.has(l)) {
        const b: Box = { l, thing: null as unknown as ChestThing, lid: null, q0: new THREE.Quaternion(), model: null, lidT: this.isOpenState(l.item) ? 1 : 0, lock: null, rattle: -1, fall: -1, fallY: 0, fallV: 0 };
        b.thing = new ChestThing(this, b);
        this.boxes.set(l, b);
        loose.keepApart(l.uid, true);
      }
    }
    for (const [l, b] of [...this.boxes]) {
      if (seen.has(l)) continue;
      b.lock?.removeFromParent();
      loose.keepApart(l.uid, false);
      this.boxes.delete(l);
    }
  }

  private isOpenState(it: ItemInstance): boolean {
    return !!it.state?.chest?.open;
  }

  isOpen(b: Box): boolean {
    return this.isOpenState(b.l.item!);
  }

  locked(b: Box): boolean {
    return !b.l.item?.state?.chest?.unlocked;
  }

  keyHeld(b: Box): boolean {
    const h = this.ctx?.player.held;
    return h?.kind === 'item' && h.item.item === keyFor(b.l.item!.item);
  }

  chestWord(b: Box): Text {
    if (this.locked(b)) return this.keyHeld(b) ? T('开锁', 'Unlock it') : T('打开箱子', 'Open it');
    return this.isOpen(b) ? T('关上箱子', 'Shut it') : T('打开箱子', 'Open it');
  }

  useChest(b: Box): void {
    const ctx = this.ctx!;
    const it = b.l.item!;
    if (this.locked(b)) {
      if (!this.keyHeld(b)) {
        b.rattle = 0;
        blip('fail', 0.8);
        ctx.player.flashWhy('锁着：要钥匙');
        return;
      }
      // the key into the lock: it stays there; the padlock comes off and falls
      ctx.player.slots[ctx.player.sel] = null;
      it.state ??= {};
      it.state.chest = { ...(it.state.chest ?? {}), unlocked: true };
      ctx.loose.touch(b.l);
      b.fall = 0;
      b.fallY = 0;
      b.fallV = 0;
      blip('click', 1);
      ctx.player.flashWhy('锁开了');
      return;
    }
    const open = !this.isOpen(b);
    it.state ??= {};
    it.state.chest = { ...(it.state.chest ?? {}), open };
    if (!open) delete it.state.chest.open;
    ctx.loose.touch(b.l);
    ctx.sound(open ? 'container_open:wood' : 'container_close:wood', 0.6);
    if (!open) return;
    // the first time: what it was buried with
    if (!it.state.chest.filled) {
      it.state.chest.filled = true;
      const seed = hash2(this.hashStr(it.state.chest.from ?? it.uid), 0x5eed, 0);
      // (the keepsakes dealt to it first, in place of as many of its own: a bobblehead, a tape)
      const own = chestLoot(seed, it.item === ND_CHEST_RARE);
      const dealt: string[] = [];
      for (const deal of chestDealers) dealt.push(...deal(it.item === ND_CHEST_RARE));
      for (const id of [...dealt, ...own.slice(dealt.length)]) putInside(it, newItem(id), itemNow());
      ctx.loose.touch(b.l);
    }
    const l = b.l;
    const src = boxList(it, { near: () => this.withinReach(l) });
    if (src) openList(src);
  }

  private hashStr(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h | 0;
  }

  private withinReach(l: Loose): boolean {
    const w = this.ctx?.player.walker;
    return !!w && Math.hypot(l.x - w.x, l.z - w.z) < 2.6;
  }

  /** a chest's lid as it is (0.5 s a swing), its padlock while it is locked (rattled; falling off) */
  private stepBoxes(dt: number): void {
    for (const b of this.boxes.values()) {
      const model = modelOf(b.l);
      if (model !== b.model) {
        b.model = model;
        b.lid = model?.getObjectByName('LID') ?? null;
        if (b.lid) b.q0.copy(b.lid.quaternion);
      }
      const want = this.isOpen(b) ? 1 : 0;
      b.lidT = want > b.lidT ? Math.min(1, b.lidT + dt / LOCK.lidS) : Math.max(0, b.lidT - dt / LOCK.lidS);
      if (b.lid) {
        const e = b.lidT * b.lidT * (3 - 2 * b.lidT);
        this.qa.setFromAxisAngle(Z, (105 * Math.PI) / 180 * e);
        b.lid.quaternion.copy(b.q0).multiply(this.qa);
      }
      this.stepLock(b, dt);
    }
  }

  private stepLock(b: Box, dt: number): void {
    const showLock = this.locked(b) || (b.fall >= 0 && b.fall < 3);
    if (!showLock) {
      if (b.lock) b.lock.visible = false;
      return;
    }
    if (!b.lock) b.lock = this.padlock();
    const g = extraOf(b.l);
    if (b.lock.parent !== g) g.add(b.lock);
    b.lock.visible = true;
    // (on the hasp, at the front of the lid: the model's M_lock)
    const at = markerOf(modelOf(b.l), 'M_lock', this.v.set(0.304, 0.22, 0));
    let x = at.x + 0.03;
    let y = at.y + 0.02;
    let rx = 0;
    let ry = 0;
    if (b.rattle >= 0) {
      b.rattle += dt;
      if (b.rattle > 0.25) b.rattle = -1;
      else y += 0.01 * Math.sin(b.rattle * 5 * Math.PI * 2) * (1 - b.rattle / 0.25);
    }
    if (b.fall >= 0) {
      b.fall += dt;
      const f = b.fall;
      // the shackle up (0.3 s), a turn (0.2 s), then it drops to the ground and lies there till it goes
      if (f < 0.3) y += 0.1 * (f / 0.3) * 0.6;
      else if (f < 0.5) {
        y += 0.06;
        ry = (Math.PI / 2) * ((f - 0.3) / 0.2);
        rx = (Math.PI / 6) * ((f - 0.3) / 0.2);
      } else {
        b.fallV -= 9.8 * dt;
        b.fallY = Math.max(-(at.y + 0.02), b.fallY + b.fallV * dt);
        y += 0.06 + b.fallY;
        x += 0.12 * Math.min(1, (f - 0.5) / 0.4);
        ry = Math.PI / 2;
        rx = Math.PI / 6;
      }
      if (f >= 3) b.fall = -1;
    }
    b.lock.position.set(x, y, at.z);
    b.lock.rotation.set(rx, ry, 0);
  }

  /** a padlock: a steel body and its shackle */
  private padlock(): THREE.Group {
    this.steelMat ??= surfaceMaterial({ color: 0x8b9096, spec: 0.6 });
    const g = new THREE.Group();
    g.name = 'nd-dig:padlock';
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.045), this.steelMat);
    body.position.y = -0.03;
    g.add(body);
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 6, 14, Math.PI), this.steelMat);
    shackle.rotation.y = Math.PI / 2;
    shackle.position.y = -0.006;
    g.add(shackle);
    return g;
  }

  // ------------------------------------------------------------------ the frame

  lateUpdate(dt: number, ctx: GameContext): void {
    this.time += dt;
    this.refresh(ctx);
    if ((this.checkT -= dt) <= 0) {
      this.checkT = CHECK_S;
      this.lookOver(ctx);
    }
    this.stepRising(dt, ctx);
    this.stepBoxes(dt);
    // the patches of sand going, the dust settling
    for (let i = this.patches.length - 1; i >= 0; i--) {
      if (this.time < this.patches[i].until) continue;
      this.patches[i].mesh.removeFromParent();
      this.patches.splice(i, 1);
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.t += dt;
      p.v.y -= 2.5 * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      p.mesh.scale.setScalar(1 + p.t * 2);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 * (1 - p.t / 0.8));
      if (p.t > 0.8) {
        p.mesh.removeFromParent();
        (p.mesh.material as THREE.Material).dispose();
        this.puffs.splice(i, 1);
      }
    }
    // (the detector put away: its tone stops)
    const h = ctx.player.held;
    if (!(h?.kind === 'item' && h.item.item === ND_DETECTOR)) this.tone.set(false);
  }

  near(at: PlanPoint, r: number, out: GarageDevice[]): void {
    for (const [l, b] of this.boxes) {
      const dx = l.x - at.x;
      const dz = l.z - at.z;
      const rr = r + b.thing.radius;
      if (dx * dx + dz * dz <= rr * rr) out.push(b.thing);
    }
  }

  telemetry(): Record<string, unknown> {
    return { near: this.nearTreasures.length, rising: this.rising.size, chests: this.boxes.size, strokes: this.strokes };
  }

  readonly harness = {
    /** the chests buried round the places near now: where, how far dug, out, their keys */
    treasures: (): { id: string; x: number; z: number; kx: number; kz: number; stage: number; out: boolean; key: boolean; keyLying: boolean }[] =>
      this.nearTreasures.map((t) => ({ id: t.id, x: t.x, z: t.z, kx: t.kx, kz: t.kz, stage: this.stageOf(t.id), out: !!this.recs.get(t.id)?.out, key: !!this.recs.get(t.id)?.key, keyLying: this.keys.has(t.id) })),
    /** the places looked over now (the field laid round each: how many chests) */
    fields: (): { site: string; kind: string; n: number }[] => this.sites.filter((s) => this.fields.has(s.id)).map((s) => ({ site: s.id, kind: s.kind, n: this.fields.get(s.id)!.length })),
    /** what the detector hears */
    heard: (): { id: string; d: number; beep: string | number | null } | null => (this.heard ? { id: this.heard.t.id, d: this.heard.d, beep: beepFor(this.heard.d) } : null),
    /** the chests lying about: locked, open, how many things in them */
    chests: (): { uid: string; x: number; y: number; z: number; locked: boolean; open: boolean; inside: number }[] =>
      [...this.boxes.values()].map((b) => ({ uid: b.l.uid, x: b.l.x, y: b.l.y, z: b.l.z, locked: this.locked(b), open: this.isOpen(b), inside: b.l.item!.inside?.length ?? 0 })),
    /** a chest lying about opened as E would (unlocked first, as its key would), and what is in it then */
    open: (uid: string): string[] | null => {
      const b = [...this.boxes.values()].find((x) => x.l.uid === uid);
      if (!b) return null;
      const it = b.l.item!;
      it.state ??= {};
      it.state.chest = { ...(it.state.chest ?? {}), unlocked: true };
      if (!this.isOpen(b)) this.useChest(b);
      return (it.inside ?? []).map((x) => x.item);
    },
    /** look over the places now (a test) */
    lookNow: (): void => {
      if (this.ctx) this.lookOver(this.ctx);
    },
  };

  dispose(): void {
    this.unpin();
    this.tone.set(false);
    for (const [id, rs] of [...this.rising]) this.unrise(id, rs);
    for (const p of this.patches) p.mesh.removeFromParent();
    for (const b of this.boxes.values()) b.lock?.removeFromParent();
  }
}

declare module '../../../../core/modcar/items' {
  interface ItemState {
    /** a key lying where its place put it: the buried chest it is for (docs/ND/PLAN.md) */
    keyOf?: string;
  }
}
