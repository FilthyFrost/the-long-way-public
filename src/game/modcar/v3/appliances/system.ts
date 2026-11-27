/**
 * The appliances system (node M2, docs/V3/nodes/M2-rv.md): every appliance lying about or riding in a vehicle is a
 * device the mark finds — the left button switches it on and off, the wheel does its second thing (the next
 * station, channel or record), the left button held picks it up; a coffee pot lying about is drawn with the coffee in
 * it (the coffee machine is Nomad Drive's: nd-coffee). What it does is drawn over its model
 * (looks.ts), what plays is heard as a car radio is (GameContext.addRadios), and a lamp or a television on in a
 * vehicle lights its inside (the vehicle's own cabin lamp).
 *
 * Its state is the thing's own (ItemState.app: core/v3/appliances): nothing of it is kept here, so it has no
 * save slice. A thing that changes where a place had it lying is marked as touched, so the place lets it go and
 * it is saved as it is now (places.ts).
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import { itemDef, type ItemInstance } from '../../../../core/modcar/items';
import { batteryCharge } from '../../../../core/modcar/rules';
import type { Text } from '../../../../core/modcar/types';
import { appOf, appState, applianceOf, channelOf, COFFEE_POT, nextChannel, toggle, type ApplianceKind } from '../../../../core/v3/appliances/appliances';
import { deckFalloff, nextOf } from '../../../../core/v3/nd/tapes';
import { vinylDeck, vinylOf, VINYLS, type Vinyl } from '../../../../core/v3/nd/vinyls';
import type { GarageDevice } from '../../garageStub';
import { itemCardKept, type ItemCard } from '../../itemInfo';
import { itemNow } from '../../itemTime';
import { powerOf, type GameContext, type RadioSet } from '../../kernel/context';
import type { InteractSource, PlanPoint } from '../../kernel/interact';
import type { Loose } from '../../loose';
import { chestDealers, modelOf } from '../../nd/kit';
import { heldOf, type Held } from '../../player';
import { roomOf } from '../../../../core/modcar/aboard';
import type { ThingBox } from '../../../../core/modcar/cargo';
import { renderSong, stationLabel, type Song } from '../../radio';
import { archiveUrl, soundArchive } from '../../soundArchive';
import type { ModVehicle } from '../../vehicle';
import { CABIN_GLOW, glowOf, makeLook, type ApplianceLook, type LookNow } from './looks';
import { globals, LOCAL_LAMPS } from '../../../render/shaderlib';
import { castMesh } from '../../../render/triGrid';

/** what a vehicle's own cabin dome light (U) gives its interior when switched on (unified for cab and RV rear) */
const DOME_GLOW = new THREE.Color(1.0, 0.88, 0.72).multiplyScalar(0.95);
/** soft daylight window fill for living-space RVs and riding furniture so rear interiors stay bright and legible by day */
const DAY_FILL = new THREE.Color(1.0, 0.96, 0.9).multiplyScalar(0.2);
const LAMP_ZERO = new THREE.Color(0, 0, 0);
const DESK_BULB_LOCAL = new THREE.Vector3(0.26, 0.30, 0);
const DESK_DIR_LOCAL = new THREE.Vector3(0.55, -0.835, 0).normalize();
const SOLAR_BULB_LOCAL = new THREE.Vector3(0, 0.444, 0);
const LAMP_POS_TMP = new THREE.Vector3();
const LAMP_DIR_TMP = new THREE.Vector3();
const LAMP_Q_TMP = new THREE.Quaternion();

/** a vinyl's procedural fallback song when the local archive is absent */
function madeUpVinyl(v: Vinyl): Song {
  const progs: [number, boolean][][] = [
    [[0, false], [5, false], [7, false], [0, false], [9, true], [5, false], [7, false], [0, false]],
    [[0, true], [8, false], [3, false], [10, false], [0, true], [5, true], [7, false], [0, true]],
    [[0, false], [9, true], [5, false], [7, false], [0, false], [9, true], [2, true], [7, false]],
  ];
  return { name: v.title, bpm: v.synth.bpm, beats: v.synth.style === 'waltz' ? 3 : 4, key: v.synth.key, bars: progs[v.synth.seed % progs.length], style: v.synth.style, lead: v.synth.lead, seed: v.synth.seed };
}

/** dedicated audio player for physical vinyl records spinning on a turntable (#28) */
class VinylVoice {
  private readonly out: GainNode;
  private el: HTMLAudioElement | null = null;
  private gain: GainNode | null = null;
  private src: AudioBufferSourceNode | null = null;
  private srcT0 = 0;
  private srcDur = 0;
  vinyl = '';
  file = '';
  private static readonly made = new Map<string, AudioBuffer>();

  constructor(
    private readonly ctx: AudioContext,
    output: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(output);
  }

  private element(): HTMLAudioElement | null {
    if (this.el) return this.el;
    if (typeof Audio === 'undefined' || typeof this.ctx.createMediaElementSource !== 'function') return null;
    const el = new Audio();
    el.preload = 'auto';
    el.loop = true;
    const src = this.ctx.createMediaElementSource(el);
    // warm turntable EQ (gentle vinyl warmth & rolled-off ultra highs)
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 65;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 9500;
    this.gain = this.ctx.createGain();
    src.connect(hp).connect(lp).connect(this.gain).connect(this.out);
    this.el = el;
    return el;
  }

  get at(): number {
    if (this.el && this.file) return this.el.currentTime;
    if (this.src && this.srcDur > 0) return (this.ctx.currentTime - this.srcT0) % this.srcDur;
    return 0;
  }

  play(v: Vinyl, file: string, at: number): void {
    this.stop();
    this.vinyl = v.id;
    this.file = file;
    if (file) {
      const el = this.element();
      if (!el) return;
      el.src = archiveUrl(file);
      el.addEventListener(
        'loadedmetadata',
        () => {
          if (this.file !== file) return;
          try {
            el.currentTime = Math.min(Math.max(0, el.duration - 0.5), Math.max(0, at));
          } catch {
            /* ignore non-seekable */
          }
          void el.play().catch(() => undefined);
        },
        { once: true },
      );
      el.load();
      const g = this.gain!;
      g.gain.setValueAtTime(1, this.ctx.currentTime);
      void soundArchive()
        ?.loudness(file)
        .then((l) => {
          if (l && l.rms > 0 && this.file === file) g.gain.setTargetAtTime(Math.min(8, 0.2 / Math.max(0.01, l.rms)), this.ctx.currentTime, 0.2);
        });
      return;
    }
    const key = `${v.id}@${this.ctx.sampleRate}`;
    let b = VinylVoice.made.get(key);
    if (!b) {
      const x = renderSong(madeUpVinyl(v), this.ctx.sampleRate);
      b = this.ctx.createBuffer(1, x.length, this.ctx.sampleRate);
      b.getChannelData(0).set(x);
      VinylVoice.made.set(key, b);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    src.connect(this.out);
    const off = b.duration > 0 ? ((at % b.duration) + b.duration) % b.duration : 0;
    src.start(this.ctx.currentTime + 0.05, off);
    this.src = src;
    this.srcDur = b.duration;
    this.srcT0 = this.ctx.currentTime + 0.05 - off;
  }

  stop(): void {
    this.el?.pause();
    this.src?.stop();
    this.src = null;
    this.vinyl = '';
    this.file = '';
  }

  level(l: number): void {
    this.out.gain.setTargetAtTime(l, this.ctx.currentTime, 0.12);
  }

  dispose(): void {
    this.stop();
    this.out.disconnect();
  }
}

/** what each kind is called on the mark */
const NAME: Record<ApplianceKind, string> = { radio: '收音闹钟', record: '唱片机', tv: '电视', lamp: '台灯', solar: '太阳能灯' };
/** how loud each FM/TV set plays, against a car radio's 1 (record players use dedicated VinylVoice #28) */
const LOUD: Partial<Record<ApplianceKind, number>> = { radio: 0.7, tv: 0.8 };
/** the television's channels (looks.ts draws them in this order) */
export const TV_CHANNELS = ['风景台', '测试卡', '雪花', '卡通台', '新闻台'];

const T = (zh: string, en: string): Text => ({ zh, en });

/** a song's name on the radio's dial */
function songName(ch: number): string {
  return stationLabel(ch);
}

/** one appliance lying about or riding in a vehicle: the device the mark finds, and what is drawn of it */
class Unit implements GarageDevice {
  readonly id: string;
  look: ApplianceLook | null = null;
  /** how bright it is now, for a cabin's light (0 … 1) */
  glow = 0;
  private readonly ctr = new THREE.Vector3();
  private readonly sph = new THREE.Sphere();
  private readonly hitP = new THREE.Vector3();
  private readonly inv = new THREE.Matrix4();
  private readonly lray = new THREE.Ray();
  private readonly b3 = new THREE.Box3();

  constructor(
    private readonly sys: Appliances,
    readonly loose: Loose,
    /** a coffee pot on its own: drawn (the coffee in it), not a device */
    readonly potOnly: boolean,
  ) {
    this.id = `appliances:${loose.uid}`;
  }

  get item(): ItemInstance {
    return this.loose.item!;
  }

  get kind(): ApplianceKind {
    return applianceOf(this.item.item) ?? 'lamp';
  }

  get x(): number {
    return this.loose.x;
  }
  get y(): number {
    return this.loose.y + this.loose.mid;
  }
  get z(): number {
    return this.loose.z;
  }
  get radius(): number {
    return this.loose.radius;
  }

  /** what LMB does */
  get word(): Text {
    const it = this.item;
    const s = appOf(it);
    const name = NAME[this.kind];
    switch (this.kind) {
      case 'record': {
        const hv = this.sys.vinylInHands();
        if (hv) {
          const v = vinylOf(hv.item);
          return s.vinyl ? T(`换上唱片 <b>《${v?.title ?? ''}》</b>`, 'Swap vinyl') : T(`放上唱片 <b>《${v?.title ?? ''}》</b>`, 'Place vinyl');
        }
        const cur = s.vinyl ? vinylOf(s.vinyl.item) : null;
        if (!cur) return T('放黑胶唱片', 'Place a vinyl record');
        return s.on ? T(`暂停 <b>《${cur.title}》</b>`, 'Pause record') : T(`播放 <b>《${cur.title}》</b>`, 'Play record');
      }
      case 'lamp':
        return s.on ? T('关灯', 'Switch the lamp off') : T('开灯', 'Switch the lamp on');
      default:
        return s.on ? T(`关掉 <b>${name}</b>`, `Switch off`) : T(`打开 <b>${name}</b>`, `Switch on`);
    }
  }

  /** the left button held: the thing itself is picked up */
  grabbable(): NonNullable<Held> | null {
    return heldOf(this.loose);
  }

  grab(): boolean {
    const ctx = this.sys.context;
    if (!ctx) return false;
    return ctx.player.takeLoose(this.loose);
  }

  /** its second thing, on RMB / wheel while looked at (another station/channel, or ejecting vinyl from turntable) */
  get alt(): { word: Text; use(): void } | null {
    const it = this.item;
    const s = appOf(it);
    switch (this.kind) {
      case 'radio':
        return s.on ? { word: T('换台', 'Next station'), use: () => this.sys.next(this) } : null;
      case 'record':
        return s.vinyl ? { word: T('取出唱片', 'Remove vinyl'), use: () => this.sys.ejectVinyl(this) } : null;
      case 'tv':
        return s.on ? { word: T('换台', 'Next channel'), use: () => this.sys.next(this) } : null;
      default:
        return null;
    }
  }

  get card(): ItemCard {
    return itemCardKept(this.item, itemNow(), this.sys.time);
  }

  use(): void {
    this.sys.press(this);
  }

  /** nothing goes into an appliance from the hands */
  take(_held: NonNullable<Held>): { ok: boolean; word: Text; keep?: boolean } | null {
    return null;
  }

  /**
   * Where the line of sight meets it: its model's box as it lies (a hand's breadth more all round), or until its
   * model is in the sphere a thing lying about is picked by. The box keeps a clock radio by a lamp its own. Riding in a
   * vehicle it is met where it is met, as a thing lying there is: the vehicle's own meshes in front of it hide it (it
   * was offered 1.2 m nearer than it stood, from when the vehicle's body was a box round it — a can in front of it
   * lost to it, and from outside it was marked through the wall).
   */
  hit(ray: THREE.Ray, reach: number): number | null {
    const l = this.loose;
    const box = this.sys.boxOf(l);
    let d: number;
    if (box) {
      this.inv.copy(l.obj.matrixWorld).invert();
      this.lray.copy(ray).applyMatrix4(this.inv);
      const m = 0.005;
      this.b3.min.set(box.minX - m, box.minY - m, box.minZ - m);
      this.b3.max.set(box.maxX + m, box.maxY + m, box.maxZ + m);
      const p = this.lray.intersectBox(this.b3, this.hitP);
      if (!p) return null;
      d = p.distanceTo(this.lray.origin);
      // Test the appliance's actual meshes so empty space around a tapered shade or stem never steals rays from items beside it.
      let hasMesh = false;
      let md = Infinity;
      l.obj.traverse((ob) => {
        const mesh = ob as THREE.Mesh;
        if (!mesh.isMesh) return;
        hasMesh = true;
        const h = castMesh(mesh, ray.origin, ray.direction, Math.min(reach, md));
        if (h && h.dist < md) md = h.dist;
      });
      if (hasMesh) {
        if (!Number.isFinite(md)) return null;
        d = md;
      }
    } else {
      const o = this.sys.origin();
      this.sph.center.set(l.x - o.x, l.y + l.mid - o.y, l.z - o.z);
      this.sph.radius = l.radius * 0.85;
      const p = ray.intersectSphere(this.sph, this.hitP);
      if (!p) return null;
      d = p.distanceTo(ray.origin);
    }
    return d > reach ? null : d;
  }

  /** where its middle is in render space (for the sounds' distance) */
  centre(): THREE.Vector3 {
    const o = this.sys.origin();
    return this.ctr.set(this.loose.x - o.x, this.loose.y + this.loose.mid - o.y, this.loose.z - o.z);
  }
}

export class Appliances implements System<GameContext>, InteractSource {
  readonly id = 'appliances';
  readonly budget = { cpuMs: 0.4 };
  /** the sets playing now (GameContext.addRadios: the game reads the list every frame) */
  readonly radios: RadioSet[] = [];
  private readonly pool: RadioSet[] = [];
  private ctx: GameContext | null = null;

  /** the game, for the devices (null before init) */
  get context(): GameContext | null {
    return this.ctx;
  }

  private readonly units = new Map<Loose, Unit>();
  private readonly list: Unit[] = [];
  private rev = -1;
  /** the system's own clock (s): the pictures, the cards kept */
  time = 0;
  /** what is drawn of them: only in a game that draws */
  private root: THREE.Group | null = null;
  private readonly now: LookNow = { on: false, ch: 0, hour: 12, coffee: -1, light: 1, exposure: 1, t: 0, dt: 0, onWall: false, vinyl: null, model: null };
  private readonly lamps = new Map<ModVehicle, THREE.Color>();
  private readonly sum = new THREE.Color();
  private vinylVoice: VinylVoice | null = null;
  private heardRecord: Unit | null = null;
  private vinylKeepT = 0;
  readonly dealtVinyls = new Set<string>();

  /** deal the next un-dealt vinyl from the 51-track shuffled world pool */
  dealVinyl(): string {
    const ctx = this.ctx;
    const deck = vinylDeck(ctx?.world?.seed ?? ctx?.params.seed ?? 1);
    const id = this.dealtVinyls.size >= deck.length ? deck[this.dealtVinyls.size % deck.length] : nextOf(deck, this.dealtVinyls);
    this.dealtVinyls.add(id);
    return id;
  }

  /** physical vinyl currently held in the player's hands, if any */
  vinylInHands(): ItemInstance | null {
    const h = this.ctx?.player.held;
    return h?.kind === 'item' && vinylOf(h.item.item) ? h.item : null;
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.addRadios(this.radios);
    chestDealers.push(() => [this.dealVinyl()]);
    if (ctx.core.scene && ctx.loose.root) {
      this.root = new THREE.Group();
      this.root.name = 'appliances';
      ctx.loose.root.add(this.root);
    }
  }

  origin(): { x: number; y: number; z: number } {
    return this.ctx?.core.origin ?? { x: 0, y: 0, z: 0 };
  }

  /** a thing's model's box in its own frame (null: its model not in yet) */
  boxOf(l: Loose): ThingBox | null {
    return this.ctx?.cargo.boxOf?.(heldOf(l)) ?? null;
  }

  /** the appliances lying about now, in the order they were found (the harness) */
  get all(): readonly Unit[] {
    return this.list;
  }

  /** the units brought up to date with the things lying about (only when they have changed) */
  private refresh(ctx: GameContext): void {
    const loose = ctx.loose;
    if (loose.rev === this.rev) return;
    this.rev = loose.rev;
    const seen = new Set<Loose>();
    for (const l of loose.list) {
      const it = l.item;
      if (!it) continue;
      const kind = applianceOf(it.item);
      // coffee_pot liquid column is rendered by nd-water (supporting coffee, water, milk without duplicate z-fighting)
      const pot = false;
      if (!kind && !pot) continue;
      seen.add(l);
      // (an appliance is found by the mark as its device: E works it, F held picks it up)
      if (!pot) l.device = true;
      let u = this.units.get(l);
      // (a pot become a machine or the other way round: made again)
      if (u && u.potOnly !== pot) {
        this.drop(u);
        u = undefined;
      }
      if (!u) {
        u = new Unit(this, l, pot);
        this.units.set(l, u);
        this.list.push(u);
      }
    }
    for (const u of [...this.list]) if (!seen.has(u.loose)) this.drop(u);
  }

  private drop(u: Unit): void {
    u.look?.dispose();
    u.look = null;
    this.units.delete(u.loose);
    const i = this.list.indexOf(u);
    if (i >= 0) this.list.splice(i, 1);
  }

  step(dt: number, ctx: GameContext): void {
    this.time += dt;
    this.refresh(ctx);
  }

  lateUpdate(dt: number, ctx: GameContext): void {
    this.refresh(ctx);
    const n = this.now;
    n.dt = dt;
    n.t = this.time;
    n.hour = ctx.clock.hour;
    n.exposure = ctx.core.exposure ?? 1;
    const sky = globals.uSkyColor.value as THREE.Color;
    const sun = globals.uSunColor.value as THREE.Color;
    // (the light the sky and the sun give a thing, about 1 at noon)
    n.light = Math.min(1, ((sky.r + sky.g + sky.b) / 3) * 1.4 + ((sun.r + sun.g + sun.b) / 3) * 0.35);
    const night = ctx.env.sky?.night ?? 0;
    // the sets playing, the lamps in vehicles
    let sets = 0;
    for (const c of this.lamps.values()) c.setRGB(0, 0, 0);
    for (const u of this.list) {
      const it = u.item;
      const s = appOf(it);
      const kind = u.potOnly ? null : u.kind;
      const on = !!s.on && (kind !== 'solar' || night > 0.35);
      // what is drawn of it, where it lies
      if (this.root) {
        if (!u.look) {
          u.look = makeLook(u.potOnly ? 'pot' : u.kind);
          if (u.look) this.root.add(u.look.group);
        }
        const look = u.look;
        if (look) {
          const g = look.group;
          g.position.copy(u.loose.obj.position);
          g.quaternion.copy(u.loose.obj.quaternion);
          n.on = on;
          n.ch = channelOf(it);
          n.coffee = u.potOnly ? (it.litres ?? 0) / (itemDef(COFFEE_POT).drink?.litres ?? 1) : -1;
          n.onWall = u.loose.stow === 'wall';
          const vin = kind === 'record' && s.vinyl ? vinylOf(s.vinyl.item) : null;
          n.vinyl = vin ? { id: vin.id, label: vin.label, accent: vin.accent } : null;
          n.model = kind === 'record' ? modelOf(u.loose) : null;
          look.update(n);
          u.glow = glowOf(look);
        }
      } else u.glow = on ? 1 : 0;
      if (!kind) continue;
      // playing: heard where it stands
      const loud = LOUD[kind];
      if (loud && s.on) {
        const r = (this.pool[sets] ??= { x: 0, y: 0, z: 0, song: 0, loud: 0, inside: null });
        r.x = u.x;
        r.y = u.y;
        r.z = u.z;
        r.song = channelOf(it);
        r.loud = loud;
        r.inside = (u.loose.riding?.on as ModVehicle | undefined) ?? null;
        this.radios[sets++] = r;
      }
      // a lamp, a television on in a vehicle: its inside lit
      const glow = CABIN_GLOW[kind];
      const v = u.loose.riding?.on as ModVehicle | undefined;
      if (glow && v && u.glow > 0.01) {
        let c = this.lamps.get(v);
        if (!c) this.lamps.set(v, (c = new THREE.Color(0, 0, 0)));
        const flick = kind === 'tv' ? 0.8 + 0.2 * Math.sin(this.time * 7.1) * Math.sin(this.time * 2.3 + 1.1) : 1;
        c.r += glow.r * u.glow * flick;
        c.g += glow.g * u.glow * flick;
        c.b += glow.b * u.glow * flick;
      }
    }
    this.radios.length = sets;
    this.hearVinyls(dt, ctx);
    // Unified single vehicle interior dome light (strictly toggled by driver U via v.domeOn, never double-stacked)
    // plus soft daytime window fill for walkable RV interiors.
    const power = ctx.systems.get('power') as { ceilingOf?(v: ModVehicle): number } | undefined;
    const dayAmt = Math.max(0, 1 - night) * n.light;
    const domeScale = 0.28 + 0.72 * night;
    for (let i = 0; i < ctx.vehicles.length; i++) {
      const v = ctx.vehicles[i];
      if (dayAmt > 0.02 && roomOf(v.view.frame.id)) {
        let c = this.lamps.get(v);
        if (!c) this.lamps.set(v, (c = new THREE.Color(0, 0, 0)));
        c.r += DAY_FILL.r * dayAmt;
        c.g += DAY_FILL.g * dayAmt;
        c.b += DAY_FILL.b * dayAmt;
      }
      const dome = power?.ceilingOf ? power.ceilingOf(v) : v.domeOn && batteryCharge(v.build) > 0.02 ? 1 : 0;
      if (dome > 0.004) {
        let c = this.lamps.get(v);
        if (!c) this.lamps.set(v, (c = new THREE.Color(0, 0, 0)));
        c.r += DOME_GLOW.r * domeScale * dome;
        c.g += DOME_GLOW.g * domeScale * dome;
        c.b += DOME_GLOW.b * domeScale * dome;
      }
    }
    for (const [v, c] of this.lamps) {
      if (!ctx.vehicles.includes(v)) {
        this.lamps.delete(v);
        continue;
      }
      this.sum.copy(c);
      v.view.mats.setCabinLamp(this.sum);
      ctx.loose.setRidingCabinLamp(v, this.sum);
    }
    // Sync held items, R-mode placement previews, held stove pots, and item surfaceMaterials to the active cabin lamp
    const ndPlace = ctx.systems.get('nd-place') as { targetVehicle?(): ModVehicle | null } | undefined;
    const handV = ctx.seated ?? ctx.player.aboard?.v ?? ndPlace?.targetVehicle?.() ?? null;
    const handLamp = handV ? (this.lamps.get(handV) ?? LAMP_ZERO) : LAMP_ZERO;
    ctx.heldThing.setCabinLamp?.(handLamp);
    ctx.loose.mats?.lookOf?.('kitchen:held:pot')?.setCabinLamp(handLamp);
    (globals.uCabinLamp.value as THREE.Color).copy(handLamp);
    // Feed up to LOCAL_LAMPS (4) nearest lit portable desk/solar lamps into global shader uniforms for real 3D lighting
    this.syncLocalLamps(ctx, night);
  }

  /** push nearest lit portable desk lamps and solar lanterns into shaderlib uLocalLamp* uniforms */
  private syncLocalLamps(ctx: GameContext, night: number): void {
    const cam = ctx.core.camera?.position;
    const pArr = globals.uLocalLampP.value as Float32Array;
    const dArr = globals.uLocalLampD.value as Float32Array;
    const cArr = globals.uLocalLampC.value as Float32Array;
    const cands: { u: Unit; d2: number; px: number; py: number; pz: number; dx: number; dy: number; dz: number; reach: number; cosOut: number; cosIn: number; r: number; g: number; b: number }[] = [];
    for (let i = 0; i < this.list.length; i++) {
      const u = this.list[i];
      if (u.potOnly || u.glow <= 0.01) continue;
      if (u.kind !== 'lamp' && u.kind !== 'solar') continue;
      u.loose.obj.updateMatrixWorld(true);
      const isDesk = u.kind === 'lamp';
      LAMP_POS_TMP.copy(isDesk ? DESK_BULB_LOCAL : SOLAR_BULB_LOCAL).applyMatrix4(u.loose.obj.matrixWorld);
      const d2 = cam ? LAMP_POS_TMP.distanceToSquared(cam) : 0;
      if (d2 > 900) continue;
      if (isDesk) {
        u.loose.obj.getWorldQuaternion(LAMP_Q_TMP);
        LAMP_DIR_TMP.copy(DESK_DIR_LOCAL).applyQuaternion(LAMP_Q_TMP).normalize();
        const gain = 1.4 * u.glow * (0.58 + 0.68 * night);
        cands.push({ u, d2, px: LAMP_POS_TMP.x, py: LAMP_POS_TMP.y, pz: LAMP_POS_TMP.z, dx: LAMP_DIR_TMP.x, dy: LAMP_DIR_TMP.y, dz: LAMP_DIR_TMP.z, reach: 5.0, cosOut: 0.28, cosIn: 0.78, r: 1.0 * gain, g: 0.76 * gain, b: 0.44 * gain });
      } else {
        const gain = 0.9 * u.glow;
        cands.push({ u, d2, px: LAMP_POS_TMP.x, py: LAMP_POS_TMP.y, pz: LAMP_POS_TMP.z, dx: 0, dy: -1, dz: 0, reach: 3.8, cosOut: -1.0, cosIn: 0.0, r: 1.0 * gain, g: 0.86 * gain, b: 0.58 * gain });
      }
    }
    if (cands.length > 1) cands.sort((a, b) => a.d2 - b.d2);
    const n = Math.min(LOCAL_LAMPS, cands.length);
    for (let i = 0; i < LOCAL_LAMPS; i++) {
      const k = i * 4;
      if (i < n) {
        const s = cands[i];
        pArr[k] = s.px;
        pArr[k + 1] = s.py;
        pArr[k + 2] = s.pz;
        pArr[k + 3] = s.reach;
        dArr[k] = s.dx;
        dArr[k + 1] = s.dy;
        dArr[k + 2] = s.dz;
        dArr[k + 3] = s.cosOut;
        cArr[k] = s.r;
        cArr[k + 1] = s.g;
        cArr[k + 2] = s.b;
        cArr[k + 3] = s.cosIn;
      } else {
        pArr[k] = pArr[k + 1] = pArr[k + 2] = pArr[k + 3] = 0;
        dArr[k] = dArr[k + 1] = dArr[k + 2] = dArr[k + 3] = 0;
        cArr[k] = cArr[k + 1] = cArr[k + 2] = cArr[k + 3] = 0;
      }
    }
  }

  near(at: PlanPoint, r: number, out: GarageDevice[]): void {
    for (let i = 0; i < this.list.length; i++) {
      const u = this.list[i];
      if (u.potOnly) continue;
      const l = u.loose;
      const dx = l.x - at.x;
      const dz = l.z - at.z;
      const rr = r + l.radius;
      if (dx * dx + dz * dz <= rr * rr) out.push(u);
    }
  }

  // ------------------------------------------------------------------ what the buttons do

  /** LMB press on an appliance */
  press(u: Unit): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const it = u.item;
    if (u.kind === 'record') {
      const heldV = this.vinylInHands();
      if (heldV) {
        this.placeVinyl(u, heldV);
        return;
      }
      const cur = appOf(it).vinyl;
      if (!cur || !vinylOf(cur.item)) {
        ctx.sound('switch', 0.45);
        ctx.player.flashWhy('先拿一张黑胶唱片放上去');
        return;
      }
      if (!appOf(it).on && powerOf(ctx, u.loose) === 'flat') {
        ctx.sound('switch', 0.6);
        ctx.player.flashWhy('没电了');
        return;
      }
      const on = toggle(it);
      ctx.sound('switch', 0.55);
      const v = vinylOf(cur.item)!;
      if (on) ctx.ui.say(`唱片机：《${v.title}》`, 2.2);
      ctx.loose.touch(u.loose);
      return;
    }
    // (in a vehicle with nothing to draw on it does not come on: docs/V3/plan/rv.md R2, the power module)
    if (!appOf(it).on && u.kind !== 'solar' && powerOf(ctx, u.loose) === 'flat') {
      ctx.sound('switch', 0.6);
      ctx.player.flashWhy('没电了');
      return;
    }
    const on = toggle(it);
    if (u.kind === 'tv') ctx.sound(on ? 'power_on' : 'power_off', 0.5);
    else ctx.sound('switch', 0.6);
    if (on && u.kind === 'radio') ctx.ui.say(`${NAME[u.kind]}：「${songName(channelOf(it))}」`, 2.2);
    if (on && u.kind === 'tv') ctx.ui.say(`电视：${TV_CHANNELS[channelOf(it)]}`, 2);
    if (on && u.kind === 'solar' && (ctx.env.sky?.night ?? 0) <= 0.35) ctx.player.flashWhy('天黑了才亮');
    ctx.loose.touch(u.loose);
  }

  /** place or swap a physical vinyl from hands onto the turntable platter and begin spinning (#28) */
  placeVinyl(u: Unit, item: ItemInstance): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const pl = ctx.player;
    const slot = pl.slots.findIndex((h) => h?.kind === 'item' && h.item === item);
    if (slot < 0) return;
    const s = appState(u.item);
    const old = s.vinyl;
    pl.slots[slot] = old ? { kind: 'item', item: old } : null;
    s.vinyl = item;
    s.vinylAt = 0;
    s.on = powerOf(ctx, u.loose) !== 'flat';
    ctx.sound('container_open', 0.35);
    const v = vinylOf(item.item);
    if (v) ctx.ui.say(s.on ? `放上黑胶：《${v.title}》` : `已放上《${v.title}》（没电）`, 2.4);
    ctx.loose.touch(u.loose);
  }

  /** lift the tonearm and take the physical vinyl off the turntable back into a free hand (#28) */
  ejectVinyl(u: Unit): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const s = appState(u.item);
    const cur = s.vinyl;
    if (!cur) return;
    const pl = ctx.player;
    const free = pl.freeSlot();
    if (free < 0) return void pl.flashWhy('手满了');
    pl.slots[free] = { kind: 'item', item: cur };
    pl.sel = free;
    delete s.vinyl;
    delete s.vinylAt;
    delete s.on;
    ctx.sound('container_open', 0.3);
    const v = vinylOf(cur.item);
    if (v) ctx.ui.say(`取出黑胶：《${v.title}》`, 2.0);
    ctx.loose.touch(u.loose);
  }

  /** stream the loudest spinning turntable's exact vinyl song through VinylVoice */
  private hearVinyls(dt: number, ctx: GameContext): void {
    const au = ctx.audio;
    if (!au?.context || !au.output) return;
    const px = ctx.seated ? ctx.seated.sim.px : ctx.player.walker.x;
    const pz = ctx.seated ? ctx.seated.sim.pz : ctx.player.walker.z;
    let best: { u: Unit; v: Vinyl; l: number } | null = null;
    for (const u of this.list) {
      if (u.potOnly || u.kind !== 'record') continue;
      const s = appOf(u.item);
      if (!s.on || !s.vinyl) continue;
      const vin = vinylOf(s.vinyl.item);
      if (!vin) continue;
      const d = Math.hypot(u.x - px, u.z - pz);
      const ride = u.loose.riding?.on as ModVehicle | undefined;
      const inSame = !!ride && (ctx.seated === ride || ctx.player.aboard?.v === ride);
      const l = inSame ? 0.2 : 0.2 * deckFalloff(d) * (ride ? 0.35 + 0.65 * (1 - ride.sys.derived.enclosed) : 1);
      if (l > 0.0005 && (!best || l > best.l)) best = { u, v: vin, l };
    }
    this.vinylVoice ??= new VinylVoice(au.context, au.output);
    const voice = this.vinylVoice;
    if (!best) {
      if (this.heardRecord && voice.vinyl) appState(this.heardRecord.item).vinylAt = voice.at;
      if (voice.vinyl) voice.stop();
      voice.level(0);
      this.heardRecord = null;
      return;
    }
    if (this.heardRecord !== best.u || voice.vinyl !== best.v.id) {
      if (this.heardRecord && voice.vinyl) appState(this.heardRecord.item).vinylAt = voice.at;
      this.heardRecord = best.u;
      const a = soundArchive();
      const file = a?.live ? (a.table?.stations[best.v.station]?.songs.find((x) => x.title === best.v.song)?.file ?? '') : '';
      voice.play(best.v, file, appOf(best.u.item).vinylAt ?? 0);
      this.vinylKeepT = 0;
    }
    voice.level(best.l);
    this.vinylKeepT += dt;
    if (this.vinylKeepT >= 0.5) {
      this.vinylKeepT = 0;
      appState(best.u.item).vinylAt = voice.at;
    }
  }

  /** F let go at once: the next station or TV channel */
  next(u: Unit): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (u.kind === 'record') {
      this.ejectVinyl(u);
      return;
    }
    const ch = nextChannel(u.item);
    ctx.sound('switch', 0.4);
    if (u.kind === 'tv') ctx.ui.say(`电视：${TV_CHANNELS[ch]}`, 1.8);
    else ctx.ui.say(`${NAME[u.kind]}：「${songName(ch)}」`, 2);
    ctx.loose.touch(u.loose);
  }

  telemetry(): Record<string, unknown> {
    return {
      count: this.list.filter((u) => !u.potOnly).length,
      on: this.list.filter((u) => !u.potOnly && appOf(u.item).on).map((u) => u.item.item),
      playing: this.radios.map((r) => r.song),
      vinyl: this.vinylVoice?.vinyl ?? '',
      vinylCount: VINYLS.length,
    };
  }

  dispose(): void {
    this.vinylVoice?.dispose();
    this.vinylVoice = null;
    const pArr = globals.uLocalLampP.value as Float32Array;
    const dArr = globals.uLocalLampD.value as Float32Array;
    const cArr = globals.uLocalLampC.value as Float32Array;
    pArr.fill(0);
    dArr.fill(0);
    cArr.fill(0);
    (globals.uCabinLamp.value as THREE.Color).setRGB(0, 0, 0);
    for (const u of [...this.list]) this.drop(u);
    this.root?.removeFromParent();
    this.root = null;
  }
}
