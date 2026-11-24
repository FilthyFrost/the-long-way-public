/**
 * The ND flashlight in the game (docs/ND/PLAN.md, ND3; its rules: core/v3/nd/flashlight.ts, as Nomad Drive has it):
 *
 *  - In the hands the left button switches it on and off (spent, it only clicks); F held focuses its beam from wide
 *    to narrow over 0.35 s (Nomad Drive's: its primary button held). The beam goes from its lens to the point under
 *    the mark (as far as the ground or a floor there, 0.6 to 40 m), following the view smoothly.
 *  - On, it drains, held or lying about; put down lit it stays lit, its beam along it as it lies; put away (in the
 *    other hand, a backpack, a box) it goes off, and taken up again it comes on of itself.
 *  - Its light is the world's one beam (the one a vehicle's head lamps cast: render/shaderlib.ts), as wide and as far
 *    as it is focused, dimming and warming as its charge runs down, flickering below a quarter, sputtering out
 *    spent. In a vehicle the vehicle's lamps have the beam; on foot a lit flashlight has it — the one in the hands,
 *    else the nearest lying about.
 *  - Spent, its battery is gone: a battery in the hands goes into it where it lies with E held half a second
 *    (battery.ts). Found, it is three tenths to wholly charged.
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import { hash2 } from '../../../../core/math/rng';
import type { ItemInstance } from '../../../../core/modcar/items';
import type { Text } from '../../../../core/modcar/types';
import { BATTERY, insertBattery, ND_BATTERY } from '../../../../core/v3/nd/battery';
import {
  beamAt,
  drainLight,
  FLASHLIGHT,
  foundLight,
  isOn,
  kelvinAt,
  kelvinRgb,
  lightAt,
  lightCharge,
  lightLeftS,
  ND_FLASHLIGHT,
  sputterAt,
  stowLight,
  switchLight,
  unstowLight,
} from '../../../../core/v3/nd/flashlight';
import { globals } from '../../../render/shaderlib';
import type { GarageDevice } from '../../garageStub';
import type { Action } from '../../hudItems';
import { itemCardKept, registerItemCardLines, type ItemCard } from '../../itemInfo';
import { itemNow } from '../../itemTime';
import type { GameContext } from '../../kernel/context';
import type { InteractSource, PlanPoint } from '../../kernel/interact';
import type { Loose } from '../../loose';
import type { HandsUse, Held } from '../../player';
import { blenderBox, blip, boxHit, extraOf, markerOf, modelOf } from '../../nd/kit';

const T = (zh: string, en: string): Text => ({ zh, en });
const BOX = blenderBox(0.0, 0.0, 0.045, 0.34, 0.1, 0.1);
/** the beam's brightness against a car's lamps' (theirs 2.4 a pair) for the wide beam at full charge */
const BASE = 2.2;
/** the aim is looked for this far along the view (m), and kept within these */
const AIM_FAR = 40;
const AIM_NEAR = 0.6;
/** a lying flashlight lights the world within this of one (m) */
const LYING_REACH = 40;
/** the flashlight's turn in the hand (rad about the up axis: its +x, the lens, ahead and a little to the left) */
const HAND_TURN = 1.9;
/** a right click shorter than this switches the flashlight; held longer it focuses (s) */
const LIGHT_TAP_S = 0.22;
/** the car's beam as it always is (shaderlib.ts) */
const CAR_CONE = [0.86, 0.975, 0.4, 0.9] as const;
const CAR_REACH = 420;

function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

/** a smooth noise of one variable in 0 … 1 (for the flicker) */
function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = ((Math.sin(i * 127.1) * 43758.5453) % 1 + 1) % 1;
  const b = ((Math.sin((i + 1) * 127.1) * 43758.5453) % 1 + 1) % 1;
  return a + (b - a) * f * f * (3 - 2 * f);
}

/** a flashlight lying about: the battery's way into it */
class LightThing implements GarageDevice {
  readonly id: string;
  readonly radius = 0.18;
  readonly alt = null;
  constructor(
    readonly sys: NdLight,
    readonly l: Loose,
  ) {
    this.id = `nd-light:${l.uid}`;
  }
  get loose(): Loose {
    return this.l;
  }
  get x(): number {
    return this.l.x;
  }
  get y(): number {
    return this.l.y + 0.05;
  }
  get z(): number {
    return this.l.z;
  }
  get word(): Text {
    const it = this.l.item!;
    const c = lightCharge(it);
    if (this.sys.batteryHeld() && c <= 0) return T('装上电池', 'Put in the battery');
    return T('拿起 <b>手电筒</b>', 'Pick up the flashlight');
  }
  get card(): ItemCard {
    return itemCardKept(this.l.item!, itemNow(), this.sys.time);
  }
  /** a battery in the hands, this one spent: E held half a second puts it in */
  get holdS(): number | undefined {
    return this.sys.batteryHeld() && lightCharge(this.l.item!) <= 0 ? BATTERY.insertS : undefined;
  }
  take(held: NonNullable<Held>): { ok: boolean; word: Text } | null {
    if (held.kind === 'item' && held.item.item === ND_BATTERY && lightCharge(this.l.item!) > 0) return { ok: false, word: T('还有电', 'It still has charge') };
    return null;
  }
  use(): void {
    if (this.sys.batteryHeld()) this.sys.insert(this.l);
    else this.sys.pickUp(this.l);
  }
  hit(ray: THREE.Ray, reach: number): number | null {
    const d = boxHit(this.l.obj, ray, BOX, reach);
    return d === null ? null : d + 0.03;
  }
}

/** what a flashlight's light is doing now: its filament (0 … 1), a blackout's time left, the sputter's time into it */
interface Glow {
  fil: number;
  dark: number;
  sputter: number;
  mesh: THREE.Mesh | null;
}

export class NdLight implements System<GameContext>, InteractSource {
  readonly id = 'nd-light';
  readonly budget = { cpuMs: 0.2 };
  private ctx: GameContext | null = null;
  time = 0;
  private readonly lying = new Map<Loose, LightThing>();
  private rev = -1;
  private readonly glows = new Map<string, Glow>();
  /** the one in the hands last frame (to know when it is put away), its focus (0 … 1) */
  private heldInst: ItemInstance | null = null;
  private focus = 0;
  private wantFocus = false;
  /** where the beam aims from the hands (smoothed): its distance, its direction (render space) */
  private aimD = 10;
  private readonly aimDir = new THREE.Vector3(1, 0, 0);
  private aimInit = false;
  /** the beam was this system's last frame (its shape is to be given back) */
  private ours = false;
  private glowGeo: THREE.CircleGeometry | null = null;
  private readonly rgb: [number, number, number] = [1, 1, 1];
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly lens = new THREE.Vector3(0.162, 0.045, 0);
  /** the beam now (the harness): whose, from where, how bright, how wide */
  last: { from: string; x: number; y: number; z: number; gain: number; half: number; reach: number } | null = null;

  readonly hands: HandsUse = {
    id: 'nd-light',
    claims: (h) => h.kind === 'item' && h.item.item === ND_FLASHLIGHT,
    // (the right button is the flashlight's: let go at once it switches it, held it focuses — docs/V3/plan/growth.md J1)
    takesF: () => true,
    step: (h, dt, f) => {
      if (f) this.rightT = this.rightT < 0 ? 0 : this.rightT + dt;
      else if (this.rightT >= 0) {
        if (this.rightT <= LIGHT_TAP_S && h.kind === 'item') this.toggle(h.item);
        this.rightT = -1;
      }
      this.wantFocus = f && this.rightT > LIGHT_TAP_S;
      // (held with its lens ahead, a little in towards the middle of the view, as one points a flashlight: the
      // game turns a small thing in the hand inward, which had its lens looking back at one)
      if (this.ctx) this.ctx.heldThing.handTurn = HAND_TURN;
    },
    words: (h) => this.words(h),
    gone: () => {
      if (this.ctx) this.ctx.heldThing.handTurn = null;
    },
  };

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.player.hands?.push(this.hands);
  }

  /** how long the right button has been down with the flashlight in the hands (s; −1: it is up) */
  private rightT = -1;

  private onLoose(): boolean {
    const t = this.ctx?.player.target;
    return !!t && ((t.kind === 'device' && !!t.device.loose) || t.kind === 'loose');
  }

  private words(h: NonNullable<Held>): Action[] {
    if (h.kind !== 'item') return [];
    const c = lightCharge(h.item);
    if (c <= 0) return [{ keys: ['RMB'], text: '打开', off: true, why: '没电了' }];
    const pct = Math.round((c / FLASHLIGHT.max) * 100);
    const s = Math.round(lightLeftS(h.item));
    void pct;
    void s;
    const out: Action[] = [{ keys: ['RMB'], text: isOn(h.item) ? '关掉' : '打开' }];
    out.push({ keys: ['RMB'], hold: true, text: '聚光' });
    return out;
  }

  toggle(it: ItemInstance): void {
    const want = !isOn(it);
    if (!switchLight(it, want)) {
      blip('tick', 0.8);
      this.ctx?.player.flashWhy('没电了');
      return;
    }
    blip('click', 0.7);
  }

  batteryHeld(): boolean {
    const h = this.ctx?.player.held;
    return h?.kind === 'item' && h.item.item === ND_BATTERY;
  }

  insert(l: Loose): void {
    const ctx = this.ctx!;
    const h = ctx.player.held;
    if (h?.kind !== 'item' || h.item.item !== ND_BATTERY || !l.item) return;
    if (!insertBattery(l.item, FLASHLIGHT.max)) return;
    // (the battery is gone into it)
    ctx.player.slots[ctx.player.sel] = null;
    ctx.loose.touch(l);
    blip('click', 0.9);
    ctx.player.flashWhy('换上了电池');
  }

  pickUp(l: Loose): void {
    if (!this.ctx!.player.takeLoose(l)) this.ctx!.player.flashWhy('手满了');
  }

  // ------------------------------------------------------------------ the frame

  private refresh(ctx: GameContext): void {
    const loose = ctx.loose;
    if (loose.rev === this.rev) return;
    this.rev = loose.rev;
    const seen = new Set<Loose>();
    const seed = ctx.world?.seed ?? 0;
    for (const l of loose.list) {
      if (l.item?.item !== ND_FLASHLIGHT) continue;
      seen.add(l);
      l.device = true;
      if (this.lying.has(l)) continue;
      foundLight(l.item, hash2(Math.round(l.x * 20), Math.round(l.z * 20), seed));
      this.lying.set(l, new LightThing(this, l));
      loose.keepApart(l.uid, true);
    }
    for (const [l] of [...this.lying]) {
      if (seen.has(l)) continue;
      loose.keepApart(l.uid, false);
      this.lying.delete(l);
    }
  }

  private glowOf(uid: string): Glow {
    let g = this.glows.get(uid);
    if (!g) {
      g = { fil: 0, dark: 0, sputter: -1, mesh: null };
      this.glows.set(uid, g);
    }
    return g;
  }

  lateUpdate(dt: number, ctx: GameContext): void {
    this.time += dt;
    this.refresh(ctx);
    const h = ctx.player.held;
    const cur = h?.kind === 'item' && h.item.item === ND_FLASHLIGHT ? h.item : null;
    // put away: off (remembering); taken up: on again if it was
    if (this.heldInst && this.heldInst !== cur) {
      const lies = [...this.lying.keys()].some((l) => l.item === this.heldInst);
      if (!lies) stowLight(this.heldInst);
      this.focus = 0;
    }
    if (cur && cur !== this.heldInst) {
      foundLight(cur, hashStr(cur.uid));
      if (unstowLight(cur)) blip('click', 0.5);
      this.aimInit = false;
    }
    this.heldInst = cur;
    // the focus following the button
    const want = cur && this.wantFocus ? 1 : 0;
    this.focus = want > this.focus ? Math.min(want, this.focus + dt / FLASHLIGHT.focusS) : Math.max(want, this.focus - dt / FLASHLIGHT.focusS);
    this.wantFocus = false;
    // each one's light: drained while on, its filament, its sputter as it runs out
    if (cur) this.stepGlow(cur, dt);
    for (const l of this.lying.keys()) if (l.item) this.stepGlow(l.item, dt);
    // the beam: the vehicle's when one is in one; else the lit one in the hands, else the nearest lit lying about
    if (ctx.seated) return this.giveBack();
    if (cur && this.lit(cur)) return this.beamFromHands(cur, ctx, dt);
    let best: Loose | null = null;
    let bd = LYING_REACH;
    const w = ctx.player.walker;
    for (const l of this.lying.keys()) {
      if (!l.item || !this.lit(l.item)) continue;
      const d = Math.hypot(l.x - w.x, l.z - w.z);
      if (d < bd) {
        bd = d;
        best = l;
      }
    }
    if (best) return this.beamFromLying(best, ctx);
    this.giveBack();
  }

  /** a flashlight's light gives any (on, coming on or going off, sputtering) */
  private lit(it: ItemInstance): boolean {
    const g = this.glows.get(it.uid);
    return isOn(it) || (!!g && (g.fil > 0.002 || g.sputter >= 0));
  }

  private stepGlow(it: ItemInstance, dt: number): void {
    const g = this.glowOf(it.uid);
    if (drainLight(it, dt)) {
      // spent: it sputters out (0.6 s), its battery gone
      g.sputter = 0;
      if (this.ctx) this.ctx.loose.touch();
    }
    if (g.sputter >= 0) {
      g.sputter += dt;
      if (g.sputter >= FLASHLIGHT.sputterS) g.sputter = -1;
    }
    g.fil = isOn(it) ? Math.min(1, g.fil + dt / FLASHLIGHT.warmS) : Math.max(0, g.fil - dt / FLASHLIGHT.coolS);
    if (g.dark > 0) g.dark = Math.max(0, g.dark - dt);
  }

  /** how bright its light is now (against the wide beam at full), and its colour (into this.rgb) */
  private brightness(it: ItemInstance, gain: number): number {
    const g = this.glowOf(it.uid);
    const share = lightCharge(it) / FLASHLIGHT.max;
    const L = lightAt(share);
    let k = BASE * Math.pow(gain, 0.6);
    if (g.sputter >= 0) {
      // (its last light: at the brightness of no charge, flickering all through)
      k *= sputterAt(g.sputter) * FLASHLIGHT.dimAtZero * (1 - 0.45 * noise1(this.time * 9));
      kelvinRgb(FLASHLIGHT.lowK, this.rgb);
      return k;
    }
    k *= L.bright * g.fil * g.fil;
    // below a quarter it flickers, and now and then goes nearly dark for a moment
    if (L.flicker > 0) {
      const n = 0.65 * noise1(this.time * 9) + 0.35 * noise1(this.time * 24.3 + 17);
      k *= 1 - L.flicker * 0.45 * n;
      if (g.dark <= 0 && Math.random() < L.flicker * 0.8 * (1 / 60)) g.dark = 0.04 + Math.random() * 0.12;
      if (g.dark > 0) k *= 0.15;
    }
    // (its colour: warmer as it runs down; from the filament's red as it comes on)
    const kelvin = FLASHLIGHT.startK + (kelvinAt(share) - FLASHLIGHT.startK) * g.fil;
    kelvinRgb(kelvin, this.rgb);
    return k;
  }

  private setBeam(from: THREE.Vector3, dir: THREE.Vector3, k: number, focus: number, who: string): void {
    const B = beamAt(focus);
    const u = globals;
    u.uHeadPos.value.copy(from);
    u.uHeadDir.value.copy(dir);
    u.uHeadColor.value.setRGB(this.rgb[0], this.rgb[1], this.rgb[2]).multiplyScalar(k);
    (u.uHeadCone.value as THREE.Vector4).set(Math.cos(B.half), Math.cos(B.inner), Math.cos(Math.min(1.45, B.half * 2.2)), Math.cos(B.half));
    u.uHeadReach.value = (B.reach * B.reach) / 11.5;
    this.ours = true;
    const o = this.ctx!.core.origin;
    this.last = { from: who, x: from.x + o.x, y: from.y + o.y, z: from.z + o.z, gain: k, half: B.half, reach: B.reach };
  }

  /** the beam given back to the vehicles (its shape as theirs always is) */
  private giveBack(): void {
    this.hideGlows();
    if (!this.ours) return;
    this.ours = false;
    (globals.uHeadCone.value as THREE.Vector4).set(CAR_CONE[0], CAR_CONE[1], CAR_CONE[2], CAR_CONE[3]);
    globals.uHeadReach.value = CAR_REACH;
    // (on foot with no lit flashlight: the game's own beam stands as it set it this frame)
    this.last = null;
  }

  private beamFromHands(it: ItemInstance, ctx: GameContext, dt: number): void {
    const p = ctx.player;
    const o = ctx.core.origin;
    // the lens of the model in the hands (render space)
    const model = ctx.heldThing.model;
    if (model) {
      this.a.copy(markerOf(model, 'M_beam', this.lens));
      model.localToWorld(this.a);
    } else this.a.set(p.eye.x - o.x, p.eye.y - 0.25 - o.y, p.eye.z - o.z);
    // what is under the mark: the thing it is on, else the ground or a floor along the view
    let d = p.target?.dist ?? this.groundAlong(ctx);
    d = Math.max(AIM_NEAR, Math.min(AIM_FAR, d));
    if (!this.aimInit) {
      this.aimD = d;
      this.aimInit = true;
    } else this.aimD += (d - this.aimD) * (1 - Math.exp(-dt * 10));
    this.b.set(p.eye.x - o.x + p.dir.x * this.aimD, p.eye.y - o.y + p.dir.y * this.aimD, p.eye.z - o.z + p.dir.z * this.aimD);
    this.c.subVectors(this.b, this.a).normalize();
    if (this.aimDir.lengthSq() < 0.5) this.aimDir.copy(this.c);
    this.aimDir.lerp(this.c, 1 - Math.exp(-dt * 18)).normalize();
    const B = beamAt(this.focus);
    const k = this.brightness(it, B.gain);
    this.setBeam(this.a, this.aimDir, k, this.focus, 'hands');
    this.showGlow(it, model, k);
  }

  private beamFromLying(l: Loose, ctx: GameContext): void {
    const model = modelOf(l) ?? l.obj;
    this.a.copy(markerOf(modelOf(l), 'M_beam', this.lens));
    model.localToWorld(this.a);
    // (along it as it lies: its +x)
    this.c.set(1, 0, 0).applyQuaternion(l.obj.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const k = this.brightness(l.item!, 1);
    this.setBeam(this.a, this.c, k, 0, `lying:${l.uid}`);
    this.showGlow(l.item!, modelOf(l), k, l);
  }

  /** how far along the view the ground or a floor is (m; AIM_FAR when it is not met) */
  private groundAlong(ctx: GameContext): number {
    const p = ctx.player;
    for (let s = 0.5; s <= AIM_FAR; s += 0.5) {
      const x = p.eye.x + p.dir.x * s;
      const y = p.eye.y + p.dir.y * s;
      const z = p.eye.z + p.dir.z * s;
      if (ctx.loose.surfaceAt(x, z, y + 0.02) >= y) return s;
    }
    return AIM_FAR;
  }

  /** the lens aglow on the model, as bright as the light */
  private showGlow(it: ItemInstance, model: THREE.Object3D | null, k: number, l?: Loose): void {
    const g = this.glowOf(it.uid);
    if (!model) return;
    if (!g.mesh) {
      this.glowGeo ??= new THREE.CircleGeometry(0.038, 20).rotateY(Math.PI / 2);
      g.mesh = new THREE.Mesh(this.glowGeo, new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, depthWrite: false, toneMapped: false }));
      g.mesh.name = 'nd:light-glow';
    }
    const parent = l ? extraOf(l) : model;
    if (g.mesh.parent !== parent) parent.add(g.mesh);
    g.mesh.position.copy(markerOf(l ? modelOf(l) : model, 'M_beam', this.lens)).x += 0.002;
    const m = g.mesh.material as THREE.MeshBasicMaterial;
    m.color.setRGB(this.rgb[0], this.rgb[1], this.rgb[2]);
    m.opacity = Math.min(1, 0.25 + k * 0.35);
    g.mesh.visible = k > 0.01;
  }

  private hideGlows(): void {
    for (const g of this.glows.values()) if (g.mesh) g.mesh.visible = false;
  }

  // ------------------------------------------------------------------ what the mark finds

  near(at: PlanPoint, r: number, out: GarageDevice[]): void {
    for (const [l, t] of this.lying) {
      const dx = l.x - at.x;
      const dz = l.z - at.z;
      const rr = r + t.radius;
      if (dx * dx + dz * dz <= rr * rr) out.push(t);
    }
  }

  telemetry(): Record<string, unknown> {
    return { lying: this.lying.size, beam: this.last?.from ?? null };
  }

  readonly harness = {
    /** the beam as this system set it last (null: it is the vehicles') */
    beam: () => this.last,
    /** the one in the hands: on, charge, focus */
    held: (): { on: boolean; charge: number; focus: number } | null => (this.heldInst ? { on: isOn(this.heldInst), charge: lightCharge(this.heldInst), focus: this.focus } : null),
    /** the flashlights lying about */
    lying: (): { uid: string; x: number; y: number; z: number; on: boolean; charge: number }[] =>
      [...this.lying.keys()].map((l) => ({ uid: l.uid, x: l.x, y: l.y, z: l.z, on: isOn(l.item!), charge: lightCharge(l.item!) })),
    /** focus as if F were held this frame (a test) */
    focusNow: (): void => void (this.wantFocus = true),
  };

  dispose(): void {
    this.giveBack();
    for (const g of this.glows.values()) g.mesh?.removeFromParent();
    this.glowGeo?.dispose();
  }
}

/** a battery tool's charge on its card: a bar (the flashlight's of 100, the grinder's of 125) */
export function chargeCardLines(max: number): (inst: ItemInstance, card: ItemCard) => void {
  return (inst, card) => {
    const c = inst.state?.charge ?? max;
    card.bars.push({ label: '电量', value: c, max, text: `${Math.round((c / max) * 100)}%`, tone: 'charge' });
  };
}

registerItemCardLines({ item: ND_FLASHLIGHT }, chargeCardLines(FLASHLIGHT.max));
