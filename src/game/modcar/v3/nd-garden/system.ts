/**
 * The ND plant pot in the game (docs/ND/PLAN.md; its rules: core/v3/nd/plants.ts, its plants: crops.ts): every pot
 * lying about or riding in a vehicle is a device the mark finds — E with a packet of seeds in the hands sows it, E
 * held with water (a water can, a bucket, a bottle of water, the radiator's water bottle) pours it into the soil at
 * that vessel's own speed (Nomad Drive's: a water can's litre a second) until the soil has its litre or the button is
 * let go (Nomad Drive pours as long as one holds; the pour shown as nd-water shows its own), E with empty hands picks it up, F held
 * as well — and, ripe, each of its fruits is a device of its own (E picks it into the hands, or drops it by the pot
 * when they are full). It grows in the game's own seconds wherever it is while its soil is wet, its plant drawn as
 * young as it is, its soil darker while wet. Its state is the pot's own (ItemState.pot): this keeps nothing.
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import { itemDef, itemPaint, newItem, type ItemInstance } from '../../../../core/modcar/items';
import type { Text } from '../../../../core/modcar/types';
import { ND_FRUIT, ND_POT, type CropId } from '../../../../core/v3/nd/items';
import { cropOfSeeds, fruitsLeft, GROW_S, grownOf, growing, pick, potOf, potStep, POT, sow, stageOf, water } from '../../../../core/v3/nd/plants';
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
const CROP_NAME: Record<CropId, string> = { apple: '苹果', potato: '土豆', tomato: '番茄', watermelon: '西瓜' };
const STAGE_NAME = ['刚冒芽', '长叶子', '长个子', '开花了', '熟了'];

const BOX_POT = blenderBox(0, 0, 0.13, 0.32, 0.32, 0.27);
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
    this.id = `nd-garden:${p.l.uid}`;
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
  /** water in the hands: E held pours it, as long as the soil takes it */
  get holdS(): number | undefined {
    const w = this.sys.waterHeld();
    if (!w || w.litres < 0.01) return undefined;
    const room = POT.holds - (potOf(this.p.item).water ?? 0);
    if (room < 0.01) return undefined;
    // (the hold's length set as it begins: what the soil takes then, at the pour's rate — not shrinking as it fills)
    if (this.sys.time - this.p.pourAt > 0.25 || !this.p.pourHoldS) this.p.pourHoldS = Math.max(0.25, Math.min(room, w.litres) / w.flow);
    return this.p.pourHoldS;
  }
  holding(k: number): void {
    this.sys.pouring(this.p, k, this.holdS ?? 0);
  }
  readonly alt = null;
  use(): void {
    if (this.sys.waterHeld()) this.sys.pouring(this.p, 1, 0);
    else this.sys.pickUp(this.p);
  }
  take(held: NonNullable<Held>): { ok: boolean; word: Text; keep?: boolean } | null {
    return this.sys.take(this.p, held);
  }
  useWith(held: NonNullable<Held>): void {
    this.sys.useWith(this.p, held);
  }
  hit(ray: THREE.Ray, reach: number): number | null {
    const d = boxHit(this.p.l.obj, ray, BOX_POT, reach);
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
    this.id = `nd-garden:${p.l.uid}:f${i}`;
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
    const crop = potOf(this.p.item).crop;
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

/** one pot lying about or riding in a vehicle */
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
  dressedFor: THREE.Object3D | null = null;
  constructor(
    sys: NdGarden,
    readonly l: Loose,
  ) {
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
  private readonly pots = new Map<Loose, Pot>();
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
      if (l.item?.item !== ND_POT) continue;
      seen.add(l);
      l.device = true;
      if (!this.pots.has(l)) {
        this.pots.set(l, new Pot(this, l));
        loose.keepApart(l.uid, true);
      }
    }
    for (const [l, p] of [...this.pots]) {
      if (seen.has(l)) continue;
      this.clearPlant(p);
      loose.keepApart(l.uid, false);
      this.pots.delete(l);
    }
  }

  // ------------------------------------------------------------------ what E does

  word(p: Pot): Text {
    const s = potOf(p.item);
    // (water in the hands and room in the soil: E held waters it, sown or not)
    const wh = this.waterHeld();
    if (wh && wh.litres >= 0.01 && POT.holds - (s.water ?? 0) >= 0.01) return T('浇水', 'Water it');
    if (!s.crop) return T('拿起 <b>花盆</b>', 'Pick up the pot');
    const st = stageOf(p.item);
    const w = s.water ?? 0;
    const name = CROP_NAME[s.crop];
    if (st >= 4) return T(`拿起 <b>花盆</b>`, 'Pick up the pot');
    void w;
    return T('拿起 <b>花盆</b>', 'Pick up the pot');
  }

  take(p: Pot, held: NonNullable<Held>): { ok: boolean; word: Text; keep?: boolean } | null {
    const s = potOf(p.item);
    if (held.kind === 'item') {
      const crop = cropOfSeeds(held.item.item);
      if (crop) {
        if (s.crop) return { ok: false, word: T('种着东西了', 'Something grows here') };
        return { ok: true, word: T(`种下 <b>${CROP_NAME[crop]}</b>`, 'Sow the seeds') };
      }
    }
    // (water goes in with E held: its holdS; what stops it is said)
    const wtr = waterIn(held);
    if (wtr) {
      if (wtr.litres < 0.01) return { ok: false, word: T('没水了', 'Water · it is empty') };
      if (POT.holds - (s.water ?? 0) < 0.01) return { ok: false, word: T('土湿透了', 'The soil is soaked') };
    }
    return null;
  }

  useWith(p: Pot, held: NonNullable<Held>): void {
    const ctx = this.ctx!;
    if (held.kind === 'item') {
      const crop = cropOfSeeds(held.item.item);
      if (crop && sow(p.item, crop)) {
        ctx.sound('wrapper', 0.5);
        ctx.loose.touch(p.l);
        ctx.player.flashWhy(potOf(p.item).water ? `种下了${CROP_NAME[crop]}` : '种下了 · 要浇水');
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
    const took = water(p.item, Math.min(want, w.litres));
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
    const kind = pick(p.item, i);
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
    if (!potOf(p.item).crop) ctx.player.flashWhy('摘完了');
  }

  // ------------------------------------------------------------------ the frame

  step(dt: number, ctx: GameContext): void {
    this.time += dt;
    this.refresh(ctx);
    for (const p of this.pots.values()) {
      if (!growing(p.item)) continue;
      const wasStage = stageOf(p.item);
      if (potStep(p.item, dt)) {
        ctx.loose.touch(p.l);
        if (this.near2(p) < 64) {
          ctx.sound('clean_ding', 0.4);
          ctx.ui.say(`${CROP_NAME[potOf(p.item).crop!]}熟了`, 2.4);
        }
      } else if (stageOf(p.item) !== wasStage) ctx.loose.touch(p.l);
    }
  }

  private near2(p: Pot): number {
    const w = this.ctx!.player.walker;
    return (p.l.x - w.x) ** 2 + (p.l.z - w.z) ** 2;
  }

  lateUpdate(_dt: number, ctx: GameContext): void {
    this.refresh(ctx);
    for (const p of this.pots.values()) this.draw(p);
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
      p.soil.copy(markerOf(model, 'M_soil', p.soil));
    }
    const s = potOf(p.item);
    const g = extraOf(p.l);
    // the wet soil: a darker disc over it
    if (!p.wet) {
      p.wetMat = new THREE.MeshBasicMaterial({ color: 0x1d120b, transparent: true, opacity: 0 });
      p.wet = new THREE.Mesh(new THREE.CircleGeometry(0.122, 28).rotateX(-Math.PI / 2), p.wetMat);
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
    const key = `${s.crop}:${p.item.uid}`;
    if (p.drawnFor !== key) {
      this.clearPlant(p);
      p.drawnFor = key;
      let seed = 0;
      for (let i = 0; i < p.item.uid.length; i++) seed = (seed * 31 + p.item.uid.charCodeAt(i)) | 0;
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
    const k = Math.min(1, (s.grown ?? 0) / (GROW_S * 0.75));
    const sc = (0.1 + 0.9 * (k * k * (3 - 2 * k))) * (stageOf(p.item) >= 4 ? (p.drawn?.ripe ?? 1) : 1);
    if (p.plant) {
      p.plant.position.copy(p.soil);
      p.plant.scale.setScalar(sc);
    }
    if (p.cane) p.cane.visible = k > 0.3;
    // the fruits still on it, once it is ripe
    const left = new Set(fruitsLeft(p.item));
    const d = p.drawn!;
    for (let i = 0; i < d.fruits.length; i++) {
      const want = left.has(i);
      let o = p.fruitObjs[i];
      if (want && !o) {
        const kind = ND_FRUIT[s.crop];
        const m = this.fruitModel(kind);
        if (m) {
          o = cloneModel(m);
          applyMaterials(o, this.mats.look(`nd-garden:fruit:${kind}`, itemPaint(newItemOf(kind))));
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
    for (const p of this.pots.values()) {
      const dx = p.l.x - at.x;
      const dz = p.l.z - at.z;
      if (dx * dx + dz * dz > (r + 0.6) ** 2) continue;
      const left = fruitsLeft(p.item);
      for (const i of left) if (p.fruits[i]) out.push(p.fruits[i]);
      out.push(p.thing);
    }
  }

  telemetry(): Record<string, unknown> {
    return { pots: [...this.pots.values()].map((p) => ({ uid: p.l.uid, ...potOf(p.item), stage: stageOf(p.item), fruits: fruitsLeft(p.item).length })) };
  }

  readonly harness = {
    pots: (): { uid: string; x: number; y: number; z: number; stage: number; water: number; crop: string }[] =>
      [...this.pots.values()].map((p) => ({ uid: p.l.uid, x: p.l.x, y: p.l.y, z: p.l.z, stage: stageOf(p.item), water: potOf(p.item).water ?? 0, crop: potOf(p.item).crop ?? '' })),
    /** a fruit's place (world) on a pot */
    fruitAt: (uid: string, i: number): { x: number; y: number; z: number } | null => {
      const p = [...this.pots.values()].find((x) => x.l.uid === uid);
      const f = p?.fruits[i];
      return f ? { x: f.x, y: f.y, z: f.z } : null;
    },
  };

  dispose(): void {
    for (const p of this.pots.values()) this.clearPlant(p);
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
