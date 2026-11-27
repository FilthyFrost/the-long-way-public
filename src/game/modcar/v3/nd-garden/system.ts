/**
 * The ND plant pot in the game (docs/ND/PLAN.md; its rules: core/v3/nd/plants.ts, its plants: crops.ts): every pot
 * lying about or riding in a vehicle is a device the mark finds — E with a packet of seeds in the hands sows it, E
 * held with water (a water can, a bucket, a bottle of water, the radiator's water bottle) pours it into the soil at
 * that vessel's own speed (Nomad Drive's: a water can's litre a second) until the soil has its litre or the button is
 * let go (Nomad Drive pours as long as one holds; the pour shown as nd-water shows its own), E with empty hands picks it up, F held
 * as well — and, ripe, each of its fruits is a device of its own (E picks it into the hands, or drops it by the pot
 * when they are full). It grows in the game's own seconds wherever it is while its soil is wet and the sun is on it
 * (docs/V3/plan/finish.md §八 2: by day, under the sky or riding in a vehicle by its windows; under a roof a third as
 * fast; not at night), its plant drawn as young as it is, its soil darker while wet. Picked bare it bears again; a
 * packet of other seeds sown over it takes its place. Its state is the pot's own (ItemState.pot): this keeps nothing.
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import { itemDef, itemPaint, newItem, type ItemInstance } from '../../../../core/modcar/items';
import type { Text } from '../../../../core/modcar/types';
import { smoothstep } from '../../../../core/math/util';
import { CROP_IDS, CROP_INFO, ND_FRUIT, type CropId } from '../../../../core/v3/nd/items';
import { bedsOf, cropOfSeeds, fruitsLeft, growSOf, growing, pick, potOf, potStep, POT, sow, stageOf, water } from '../../../../core/v3/nd/plants';
import { floraMaterial } from '../../../scene/flora/material';
import { cloneModel, itemGlb, type Model } from '../../assets';
import type { GarageDevice } from '../../garageStub';
import { itemCardKept, type ItemCard } from '../../itemInfo';
import { itemNow } from '../../itemTime';
import type { GameContext } from '../../kernel/context';
import type { InteractSource, PlanPoint } from '../../kernel/interact';
import type { Loose } from '../../loose';
import { applyMaterials, CarMaterials } from '../../materials';
import type { Held } from '../../player';
import { blenderBox, boxHit, extraOf, markerOf, modelOf } from '../../nd/kit';
import { heldVessel } from '../../nd/vessel';
import type { NdWater } from '../nd-water/system';
import { CROP_LOOK, drawCrop, type CropDrawn } from './crops';

const T = (zh: string, en: string): Text => ({ zh, en });
const CROP_NAME = Object.fromEntries(CROP_IDS.map((id) => [id, CROP_INFO[id].zh])) as Record<CropId, string>;
/** how much of the day's sun a plant under a roof has (a window's worth) */
const UNDER_ROOF = 0.3;
/** how often a pot's sun is looked at again (s) */
const SUN_EVERY = 2;
/** other seeds over a plant: the left button held this long sows them in its place (s) — a press would be too easy a way to lose a plant */
const RESOW_HOLD_S = 0.9;

const BOX_POT = blenderBox(0, 0, 0.13, 0.32, 0.32, 0.27);
/** a planter box's three beds: how far apart along its length (m), and the part of the box the mark finds each by */
const BED_DX = 0.25;
const BOX_BED = [-1, 0, 1].map((k) => blenderBox(k * BED_DX, 0, 0.1, 0.26, 0.26, 0.22));
/** water the hands can pour (a vessel of water: core/v3/nd/water.ts): litres there, how fast it pours, how to take them out */
function waterIn(h: NonNullable<Held>): { litres: number; flow: number; take(l: number): void } | null {
  const v = heldVessel(h);
  if (!v || (v.liquid !== null && v.liquid !== 'water')) return null;
  return {
    litres: v.litres,
    flow: v.flow,
    take: (l) => void (v.litres = Math.max(0, v.litres - l)),
  };
}

class PotThing implements GarageDevice {
  readonly id: string;
  constructor(
    readonly sys: NdGarden,
    readonly p: Pot,
  ) {
    this.id = p.beds > 1 ? `nd-garden:${p.l.uid}:b${p.bed}` : `nd-garden:${p.l.uid}`;
  }
  get loose(): Loose {
    return this.p.l;
  }
  get x(): number {
    return this.p.l.x;
  }
  get y(): number {
    return this.p.l.y + 0.15;
  }
  get z(): number {
    return this.p.l.z;
  }
  readonly radius = 0.25;
  get word(): Text {
    return this.sys.word(this.p);
  }
  get card(): ItemCard {
    return itemCardKept(this.p.item, itemNow(), this.sys.time);
  }
  /** other seeds in the hands over a plant: E held sows them in its place; water in the hands: E held pours it, as long as the soil takes it */
  get holdS(): number | undefined {
    if (this.sys.resowHeld(this.p)) return RESOW_HOLD_S;
    const w = this.sys.waterHeld();
    if (!w || w.litres < 0.01) return undefined;
    const room = this.sys.room(this.p);
    if (room < 0.01) return undefined;
    // (the hold's length set as it begins: what the soil takes then, at the pour's rate — not shrinking as it fills)
    if (this.sys.time - this.p.pourAt > 0.25 || !this.p.pourHoldS) this.p.pourHoldS = Math.max(0.25, Math.min(room, w.litres) / w.flow);
    return this.p.pourHoldS;
  }
  holding(k: number): void {
    if (this.sys.resowHeld(this.p)) return;
    this.sys.pouring(this.p, k, this.holdS ?? 0);
  }
  readonly alt = null;
  use(): void {
    if (this.sys.resowHeld(this.p)) this.sys.resow(this.p);
    else if (this.sys.waterHeld()) this.sys.pouring(this.p, 1, 0);
    else this.sys.pickUp(this.p);
  }
  take(held: NonNullable<Held>): { ok: boolean; word: Text; keep?: boolean } | null {
    return this.sys.take(this.p, held);
  }
  useWith(held: NonNullable<Held>): void {
    this.sys.useWith(this.p, held);
  }
  hit(ray: THREE.Ray, reach: number): number | null {
    const d = boxHit(this.p.l.obj, ray, this.p.beds > 1 ? BOX_BED[this.p.bed] : BOX_POT, reach);
    return d === null ? null : d + 0.06;
  }
}

class FruitThing implements GarageDevice {
  readonly id: string;
  readonly radius = 0.08;
  private readonly sph = new THREE.Sphere();
  private readonly hp = new THREE.Vector3();
  constructor(
    readonly sys: NdGarden,
    readonly p: Pot,
    readonly i: number,
  ) {
    this.id = p.beds > 1 ? `nd-garden:${p.l.uid}:b${p.bed}:f${i}` : `nd-garden:${p.l.uid}:f${i}`;
  }
  get loose(): Loose {
    return this.p.l;
  }
  /** where it hangs (world) */
  private at(): THREE.Vector3 {
    const d = this.p.drawn;
    const v = this.hp.copy(d?.fruits[this.i] ?? new THREE.Vector3()).add(this.p.soil);
    this.p.l.obj.updateWorldMatrix(true, false);
    v.applyMatrix4(this.p.l.obj.matrixWorld);
    const o = this.sys.origin();
    return v.set(v.x + o.x, v.y + o.y, v.z + o.z);
  }
  get x(): number {
    return this.at().x;
  }
  get y(): number {
    return this.at().y;
  }
  get z(): number {
    return this.at().z;
  }
  get word(): Text {
    const crop = potOf(this.p.item, this.p.bed).crop;
    return T(`摘${crop ? CROP_NAME[crop] : ''}`, 'Pick it');
  }
  readonly alt = null;
  use(): void {
    this.sys.pickFruit(this.p, this.i);
  }
  hit(ray: THREE.Ray, reach: number): number | null {
    const w = this.at();
    const o = this.sys.origin();
    this.sph.center.set(w.x - o.x, w.y - o.y, w.z - o.z);
    this.sph.radius = 0.07 * ((this.p.drawn?.fruitScale ?? 0.5) / 0.5);
    const p = ray.intersectSphere(this.sph, this.hp);
    if (!p) return null;
    const d = p.distanceTo(ray.origin);
    return d <= reach ? d : null;
  }
}

/** one plant's place lying about or riding in a vehicle: a pot, or one of a planter box's three beds */
class Pot {
  readonly thing: PotThing;
  fruits: FruitThing[] = [];
  /** its plant as drawn (for which crop and seed), the mesh, the fruits' models */
  drawn: CropDrawn | null = null;
  drawnFor = '';
  plant: THREE.InstancedMesh | null = null;
  cane: THREE.Mesh | null = null;
  fruitObjs: (THREE.Object3D | null)[] = [];
  soilObj: THREE.Object3D | null = null;
  wetMat: THREE.MeshBasicMaterial | null = null;
  wet: THREE.Mesh | null = null;
  readonly soil = new THREE.Vector3(0, 0.236, 0);
  /** the pour under way: how far along its hold, when last */
  pourK = 0;
  pourAt = -1;
  pourHoldS = 0;
  /** the sun on it (0 the dark … 1 the open day), and when it was last looked at */
  sun = 1;
  sunAt = -9;
  dressedFor: THREE.Object3D | null = null;
  constructor(
    sys: NdGarden,
    readonly l: Loose,
    /** which bed of the thing this is, of how many */
    readonly bed = 0,
    readonly beds = 1,
  ) {
    if (beds > 1) this.soil.set((bed - 1) * BED_DX, 0.175, 0);
    this.thing = new PotThing(sys, this);
  }
  get item(): ItemInstance {
    return this.l.item!;
  }
}

export class NdGarden implements System<GameContext>, InteractSource {
  readonly id = 'nd-garden';
  readonly budget = { cpuMs: 0.3 };
  private ctx: GameContext | null = null;
  time = 0;
  private readonly pots = new Map<Loose, Pot[]>();
  /** every bed there is (the pots' and the boxes'), as last looked for */
  private all: Pot[] = [];
  private rev = -1;
  private readonly mats = new CarMaterials();
  private readonly fruitModels = new Map<string, Model | null>();
  private caneMat: THREE.MeshLambertMaterial | null = null;

  init(ctx: GameContext): void {
    this.ctx = ctx;
  }

  origin(): { x: number; y: number; z: number } {
    return this.ctx?.core.origin ?? { x: 0, y: 0, z: 0 };
  }

  private refresh(ctx: GameContext): void {
    const loose = ctx.loose;
    if (loose.rev === this.rev) return;
    this.rev = loose.rev;
    const seen = new Set<Loose>();
    for (const l of loose.list) {
      const n = l.item ? bedsOf(l.item.item) : 0;
      if (!n) continue;
      seen.add(l);
      l.device = true;
      if (!this.pots.has(l)) {
        const beds: Pot[] = [];
        for (let i = 0; i < n; i++) beds.push(new Pot(this, l, i, n));
        this.pots.set(l, beds);
        loose.keepApart(l.uid, true);
      }
    }
    for (const [l, beds] of [...this.pots]) {
      if (seen.has(l)) continue;
      for (const p of beds) this.clearPlant(p);
      loose.keepApart(l.uid, false);
      this.pots.delete(l);
    }
    this.all = [];
    for (const beds of this.pots.values()) for (const p of beds) this.all.push(p);
  }

  /** the beds of the thing a bed is of (a pot: itself) */
  private mates(p: Pot): readonly Pot[] {
    return this.pots.get(p.l) ?? [p];
  }

  /** the water the thing's soil still takes (L): a pot's own, a planter box's three beds' together — it is watered as one */
  room(p: Pot): number {
    let r = 0;
    for (const m of this.mates(p)) r += POT.holds - (potOf(m.item, m.bed).water ?? 0);
    return r;
  }

  // ------------------------------------------------------------------ what E does

  /** the crop of the packet of seeds in the hands when the pot has another growing in it (held, they are sown in its place); null otherwise */
  resowHeld(p: Pot): CropId | null {
    const h = this.ctx?.player.held;
    const crop = h?.kind === 'item' ? cropOfSeeds(h.item.item) : null;
    const now = potOf(p.item, p.bed).crop;
    return crop && now && crop !== now ? crop : null;
  }

  /** the left button held with other seeds over a plant: they are sown in its place, the packet used up */
  resow(p: Pot): void {
    const ctx = this.ctx!;
    const crop = this.resowHeld(p);
    if (!crop || !sow(p.item, crop, true, p.bed)) return;
    ctx.player.held = null;
    ctx.sound('wrapper', 0.5);
    ctx.loose.touch(p.l);
    ctx.player.flashWhy(potOf(p.item, p.bed).water ? `改种了${CROP_NAME[crop]}` : `改种了${CROP_NAME[crop]} · 要浇水`);
  }

  word(p: Pot): Text {
    const over = this.resowHeld(p);
    if (over) return T(`改种 <b>${CROP_NAME[over]}</b>`, 'Sow these instead');
    // (water in the hands and room in the soil: E held waters it, sown or not)
    const wh = this.waterHeld();
    if (wh && wh.litres >= 0.01 && this.room(p) >= 0.01) return T('浇水', 'Water it');
    return T(`拿起 <b>${itemDef(p.item.item).name.zh}</b>`, 'Pick it up');
  }

  take(p: Pot, held: NonNullable<Held>): { ok: boolean; word: Text; keep?: boolean } | null {
    const s = potOf(p.item, p.bed);
    if (held.kind === 'item') {
      const crop = cropOfSeeds(held.item.item);
      if (crop) {
        if (s.crop === crop) return { ok: false, word: T(`已经种着${CROP_NAME[crop]}了`, 'It grows here already') };
        // (another crop over the one that grows here: not by a press — the left button held: holdS)
        if (s.crop) return null;
        return { ok: true, word: T(`种下 <b>${CROP_NAME[crop]}</b>`, 'Sow the seeds') };
      }
    }
    // (water goes in with E held: its holdS; what stops it is said)
    const wtr = waterIn(held);
    if (wtr) {
      if (wtr.litres < 0.01) return { ok: false, word: T('没水了', 'Water · it is empty') };
      if (this.room(p) < 0.01) return { ok: false, word: T('土湿透了', 'The soil is soaked') };
    }
    return null;
  }

  useWith(p: Pot, held: NonNullable<Held>): void {
    const ctx = this.ctx!;
    if (held.kind === 'item') {
      const crop = cropOfSeeds(held.item.item);
      if (crop && sow(p.item, crop, false, p.bed)) {
        ctx.sound('wrapper', 0.5);
        ctx.loose.touch(p.l);
        ctx.player.flashWhy(potOf(p.item, p.bed).water ? `种下了${CROP_NAME[crop]}` : '种下了 · 要浇水');
        return;
      }
    }
  }

  /** water the hands hold, if any */
  waterHeld(): { litres: number; flow: number; take(l: number): void } | null {
    const h = this.ctx?.player.held;
    return h ? waterIn(h) : null;
  }

  /** the pour as E is held (k of its holdS done): what has run since the last step goes into the soil */
  pouring(p: Pot, k: number, holdS: number): void {
    const ctx = this.ctx!;
    const w = this.waterHeld();
    if (!w) return;
    // (a new hold begins again from nothing)
    if (k < p.pourK || this.time - p.pourAt > 0.25) p.pourK = 0;
    const dk = Math.max(0, k - p.pourK);
    p.pourK = k;
    p.pourAt = this.time;
    const want = holdS > 0 ? dk * holdS * w.flow : 0;
    if (want <= 0) return;
    // (a planter box's beds drink together: what is poured is shared out among those with room)
    let left = Math.min(want, w.litres);
    let took = 0;
    const dry = this.mates(p).filter((m) => POT.holds - (potOf(m.item, m.bed).water ?? 0) > 1e-6);
    for (let i = 0; i < dry.length; i++) {
      const t = water(p.item, left / (dry.length - i), dry[i].bed);
      took += t;
      left -= t;
    }
    w.take(took);
    if (took > 0) {
      ctx.loose.touch(p.l);
      // (the pour shown as the water's own: the vessel tipped over the soil, the stream, its sound)
      const v = p.soil.clone().applyMatrix4(p.l.obj.matrixWorld);
      const o = this.origin();
      const nw = ctx.systems.get<NdWater>('nd-water');
      if (nw) nw.pourOut(v.x + o.x, v.y + o.y, v.z + o.z, 'water');
      else ctx.sound('pour_water');
    }
  }

  pickUp(p: Pot): void {
    const ctx = this.ctx!;
    if (!ctx.player.takeLoose(p.l)) ctx.player.flashWhy('手满了');
  }

  pickFruit(p: Pot, i: number): void {
    const ctx = this.ctx!;
    const kind = pick(p.item, i, p.bed);
    if (!kind) return;
    const fruit = newItem(kind);
    const h = { kind: 'item' as const, item: fruit };
    ctx.sound('pickup', 0.4);
    ctx.loose.touch(p.l);
    if (ctx.player.receive(h) > 0) {
      // (hands full: it drops by the pot)
      const o = this.origin();
      const v = (p.drawn?.fruits[i] ?? new THREE.Vector3()).clone().add(p.soil).applyMatrix4(p.l.obj.matrixWorld);
      const l = ctx.loose.addItem(fruit, v.x + o.x, v.y + o.y, v.z + o.z, 0);
      ctx.loose.drop(l);
      ctx.player.flashWhy('手满了');
    } else {
      const at = ctx.player.slots.indexOf(h);
      if (at >= 0) ctx.player.sel = at;
    }
    if (!fruitsLeft(p.item, p.bed).length) ctx.player.flashWhy('摘完了 · 还会再结');
  }

  // ------------------------------------------------------------------ the frame

  step(dt: number, ctx: GameContext): void {
    this.time += dt;
    this.refresh(ctx);
    for (const p of this.all) {
      if (!growing(p.item, p.bed)) continue;
      const wasStage = stageOf(p.item, p.bed);
      if (potStep(p.item, dt, this.sunOn(p, ctx), p.bed)) {
        ctx.loose.touch(p.l);
        if (this.near2(p) < 64) {
          ctx.sound('clean_ding', 0.4);
          ctx.ui.say(`${CROP_NAME[potOf(p.item, p.bed).crop!]}熟了`, 2.4);
        }
      } else if (stageOf(p.item, p.bed) !== wasStage) ctx.loose.touch(p.l);
    }
  }

  /**
   * The sun on a pot now (looked at every couple of seconds): the day's — none at night, rising through the dawn, gone
   * by dusk — whole under the sky and for a pot riding in a vehicle (by its windows), a third of it under a roof
   */
  private sunOn(p: Pot, ctx: GameContext): number {
    if (this.time - p.sunAt < SUN_EVERY) return p.sun;
    p.sunAt = this.time;
    // (the sky's own daylight: none in the night, coming through the dawn, going through the dusk)
    const day = smoothstep(0.12, 0.6, (ctx.env.sky as unknown as { daylight?: number }).daylight ?? 1);
    const roofed = !p.l.riding && !!ctx.world && !!ctx.world.sites.coverAt(p.l.x, p.l.y + 1.2, p.l.z);
    p.sun = day * (roofed ? UNDER_ROOF : 1);
    return p.sun;
  }

  private near2(p: Pot): number {
    const w = this.ctx!.player.walker;
    return (p.l.x - w.x) ** 2 + (p.l.z - w.z) ** 2;
  }

  lateUpdate(_dt: number, ctx: GameContext): void {
    this.refresh(ctx);
    for (const p of this.all) this.draw(p);
  }

  private clearPlant(p: Pot): void {
    p.plant?.removeFromParent();
    p.plant?.geometry.dispose();
    p.plant = null;
    p.cane?.removeFromParent();
    p.cane = null;
    for (const f of p.fruitObjs) f?.removeFromParent();
    p.fruitObjs = [];
    p.fruits = [];
    p.drawn = null;
    p.drawnFor = '';
  }

  /** its plant as grown as it is, its fruits when it is ripe, its soil darker while wet */
  private draw(p: Pot): void {
    const model = modelOf(p.l);
    if (model && p.dressedFor !== model) {
      p.dressedFor = model;
      p.soil.copy(markerOf(model, p.beds > 1 ? `M_soil_${p.bed}` : 'M_soil', p.soil));
    }
    const s = potOf(p.item, p.bed);
    const g = extraOf(p.l);
    // the wet soil: a darker disc over it
    if (!p.wet) {
      p.wetMat = new THREE.MeshBasicMaterial({ color: 0x1d120b, transparent: true, opacity: 0 });
      p.wet = new THREE.Mesh(new THREE.CircleGeometry(p.beds > 1 ? 0.098 : 0.122, 28).rotateX(-Math.PI / 2), p.wetMat);
      g.add(p.wet);
    }
    p.wet.position.set(p.soil.x, p.soil.y + 0.0015, p.soil.z);
    p.wetMat!.opacity = Math.min(0.55, (s.water ?? 0) * 0.9);
    p.wet.visible = (s.water ?? 0) > 0.005;
    if (!s.crop) {
      if (p.drawn) this.clearPlant(p);
      return;
    }
    // the plant (planned once for its crop and the pot's own seed)
    const key = `${s.crop}:${p.item.uid}:${p.bed}`;
    if (p.drawnFor !== key) {
      this.clearPlant(p);
      p.drawnFor = key;
      let seed = 0;
      for (let i = 0; i < p.item.uid.length; i++) seed = (seed * 31 + p.item.uid.charCodeAt(i)) | 0;
      // (a box's three plants each their own)
      seed = (seed + p.bed * 7919) | 0;
      const d = drawCrop(s.crop, (seed >>> 0) % 100000);
      p.drawn = d;
      const look = CROP_LOOK[s.crop];
      const geo = d.geometry;
      geo.setAttribute('aFade', new THREE.InstancedBufferAttribute(new Float32Array([0, 0, 0]), 3));
      geo.setAttribute('aLook', new THREE.InstancedBufferAttribute(new Float32Array([0, 4, look.leaf, look.second]), 4));
      geo.setAttribute('aTree', new THREE.InstancedBufferAttribute(new Float32Array([((seed >>> 0) % 97) / 97, 0.3, look.bright ? 2 : 0, 1]), 4));
      const mesh = new THREE.InstancedMesh(geo, floraMaterial(), 1);
      mesh.setMatrixAt(0, new THREE.Matrix4());
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.name = 'nd-garden:plant';
      g.add(mesh);
      p.plant = mesh;
      if (d.cane) {
        this.caneMat ??= new THREE.MeshLambertMaterial({ color: 0x9a7a4e });
        p.cane = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, d.cane, 6).translate(0, d.cane / 2, 0), this.caneMat);
        p.cane.position.set(p.soil.x + 0.04, p.soil.y - 0.02, p.soil.z - 0.03);
        g.add(p.cane);
      }
      p.fruits = d.fruits.map((_, i) => new FruitThing(this, p, i));
      p.fruitObjs = d.fruits.map(() => null);
    }
    // grown as far as it is: a sprout at first, full size by its fourth stage
    const k = Math.min(1, (s.grown ?? 0) / (growSOf(s.crop) * 0.75));
    const sc = (0.1 + 0.9 * (k * k * (3 - 2 * k))) * (stageOf(p.item, p.bed) >= 4 ? (p.drawn?.ripe ?? 1) : 1);
    if (p.plant) {
      p.plant.position.copy(p.soil);
      p.plant.scale.setScalar(sc);
    }
    if (p.cane) p.cane.visible = k > 0.3;
    // the fruits still on it, once it is ripe
    const left = new Set(fruitsLeft(p.item, p.bed));
    const d = p.drawn!;
    const lamp = this.ctx ? this.ctx.loose.cabinLampOf(p.l.riding?.on ?? null) : null;
    for (let i = 0; i < d.fruits.length; i++) {
      const want = left.has(i);
      let o = p.fruitObjs[i];
      const kind = ND_FRUIT[s.crop];
      const owner = `nd-garden:fruit:${p.l.uid}:${kind}`;
      if (want && !o) {
        const m = this.fruitModel(kind);
        if (m) {
          o = cloneModel(m);
          const look = this.mats.look(owner, itemPaint(newItemOf(kind)));
          if (lamp) look.setCabinLamp(lamp);
          applyMaterials(o, look);
          o.scale.setScalar(d.fruitScale);
          o.position.copy(d.fruits[i]).add(p.soil);
          // (hanging from above: its own top up; lying on the soil for the potato and the melon)
          o.rotation.y = i * 1.7;
          g.add(o);
          p.fruitObjs[i] = o;
        }
      } else if (!want && o) {
        o.removeFromParent();
        p.fruitObjs[i] = null;
      }
      if (o && lamp) {
        o.updateMatrixWorld(true);
        this.mats.setFrameOf(owner, o.matrixWorld);
        this.mats.lookOf(owner)?.setCabinLamp(lamp);
      }
    }
  }

  private fruitModel(kind: string): Model | null {
    if (this.fruitModels.has(kind)) return this.fruitModels.get(kind)!;
    this.fruitModels.set(kind, null);
    void itemGlb(itemDef(kind).model).then((m) => void this.fruitModels.set(kind, m));
    return null;
  }

  // ------------------------------------------------------------------ what the mark finds

  near(at: PlanPoint, r: number, out: GarageDevice[]): void {
    for (const p of this.all) {
      const dx = p.l.x - at.x;
      const dz = p.l.z - at.z;
      if (dx * dx + dz * dz > (r + 0.6) ** 2) continue;
      const left = fruitsLeft(p.item, p.bed);
      for (const i of left) if (p.fruits[i]) out.push(p.fruits[i]);
      out.push(p.thing);
    }
  }

  telemetry(): Record<string, unknown> {
    return { pots: this.all.map((p) => ({ uid: p.l.uid, ...potOf(p.item, p.bed), stage: stageOf(p.item, p.bed), fruits: fruitsLeft(p.item, p.bed).length, sun: p.sun })) };
  }

  readonly harness = {
    pots: (): { uid: string; bed: number; x: number; y: number; z: number; stage: number; water: number; crop: string }[] =>
      this.all.map((p) => ({ uid: p.l.uid, bed: p.bed, x: p.l.x, y: p.l.y, z: p.l.z, stage: stageOf(p.item, p.bed), water: potOf(p.item, p.bed).water ?? 0, crop: potOf(p.item, p.bed).crop ?? '' })),
    /** a pot grown on at once by so many seconds of full sun (its soil kept wet): a test's shortcut through a day */
    grow: (uid: string, seconds: number): number => {
      const ps = this.all.filter((x) => x.l.uid === uid);
      if (!ps.length) return -1;
      for (const p of ps) {
        for (let t = 0; t < seconds && growing(p.item, p.bed); t += 30) {
          water(p.item, POT.holds, p.bed);
          potStep(p.item, Math.min(30, seconds - t), 1, p.bed);
        }
      }
      this.ctx?.loose.touch(ps[0].l);
      return stageOf(ps[0].item, ps[0].bed);
    },
    /** a fruit's place (world) on a pot */
    fruitAt: (uid: string, i: number, bed = 0): { x: number; y: number; z: number } | null => {
      const p = this.all.find((x) => x.l.uid === uid && x.bed === bed);
      const f = p?.fruits[i];
      return f ? { x: f.x, y: f.y, z: f.z } : null;
    },
  };

  dispose(): void {
    for (const p of this.all) this.clearPlant(p);
    this.mats.dispose();
  }
}

/** a thing of a kind, for its colours */
const KIND_INST = new Map<string, ItemInstance>();
function newItemOf(kind: string): ItemInstance {
  let it = KIND_INST.get(kind);
  if (!it) {
    it = newItem(kind);
    KIND_INST.set(kind, it);
  }
  return it;
}
