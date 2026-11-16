/**
 * ModGame: the game with the modular vehicles (docs/MODCAR.md §8). It starts in the workshop — build a
 * car out of what lies about, then drive out of the door onto the road — and reuses everything the
 * world already has: renderer, environment, terrain and roads, the first-person rig, input and sound.
 *
 * Places: 'garage' (the workshop stage) and 'road' (the world). Driving past the workshop's apron
 * fades out and puts the vehicle on the road with the same build.
 */
import * as THREE from 'three';
import { FirstPersonRig } from '../../core/camera/rig';
import { allInstances, decodeBuild, newInstance, fitSub, stockBuild, stockTireFor } from '../../core/modcar/build';
import { frameDef } from '../../core/modcar/frames';
import { partDef, PARTS } from '../../core/modcar/parts';
import { newTool } from '../../core/modcar/tools';
import type { Build, PartDef } from '../../core/modcar/types';
import { GroundLand } from '../../core/onfoot/land';
import { SpineSample } from '../../core/world/spine';
import { BiomeBlend } from '../../core/world/spine';
import { World } from '../../core/world/terrain';
import { GroundSample, SURFACES, type Ground } from '../../core/world/ground';
import { Push, pushOut, type Solid } from '../../core/world/solids';
import { AudioEngine } from '../audio';
import { Environment } from '../env/environment';
import { Hud } from '../hud';
import { InputManager } from '../input';
import type { Params } from '../params';
import { applyGhost, carEnvUniforms } from '../render/carMaterials';
import { RenderCore } from '../render/core';
import { globals } from '../render/shaderlib';
import { LandmarkView } from '../scene/landmarks';
import { WorldView } from '../scene/worldView';
import { BeaconView } from '../scene/beacons';
import { cloneModel, frameModel, partModel, preload, seatTyres, standInFrame, toolGlb } from './assets';
import { DevPanel, type DevHost, type DevItem, type DevPoint } from './devPanel';
import { buildGarage } from './garage';
import { buildGarageStub, type GarageContext, type GarageDevice, type GarageScene } from './garageStub';
import { EngineVoice } from './engineAudio';
import { Foley, type FoleyLoop, type FoleyOpts, type FoleyShot, type PanelMaterial } from './foley';
import { ASSIST_LABELS, loadAssists, saveAssists, type Assists } from './assists';
import { HeldThing } from './held';
import { Radio } from './radio';
import { clearSave, writeSave, type SaveV1, type SavedLoose } from './save';
import { Sparks } from './sparks';
import { LooseThings, toolModel } from './loose';
import { CarMaterials } from './materials';
import { ModPlayer, type PlayerHost } from './player';
import { Cockpit, type CockpitHost } from './cockpit';
import { ModUI } from './ui';
import { ModVehicle, visibleUp } from './vehicle';
import type { ModEnv } from '../../core/modcar/systems';
import { applyWheelMods } from '../../core/modcar/simlink';

/** converts the rig frame (+x forward, +z right) to a Three.js camera (−z forward, +x right) */
const QFIX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

export type ViewMode = 'cockpit' | 'chase' | 'orbit';

export interface ModParams extends Params {
  /** garage (default) or road */
  start: 'garage' | 'road';
  /** a build in the text form of src/core/modcar/build.ts (the road start's vehicle) */
  build: string;
  /** the garage's first project: tutorial (default) or full (everything fitted) */
  project: 'tutorial' | 'full';
  /** which workshop: the real one (default) or the plain stand-in (?garage=stub) */
  garage: 'workshop' | 'stub';
  /** this is the player's game, kept in the browser (save.ts); not a test drive or the harness's run */
  keep: boolean;
}

export function readModParams(base: Params, search: string = window.location.search): ModParams {
  const q = new URLSearchParams(search);
  const start = q.get('start') === 'road' ? 'road' : 'garage';
  return {
    ...base,
    start,
    build: q.get('build') ?? 'stock:sedan',
    project: q.get('project') === 'full' ? 'full' : 'tutorial',
    garage: q.get('garage') === 'stub' ? 'stub' : 'workshop',
    keep: false,
    time: Number.isFinite(base.time) ? base.time : start === 'garage' ? 9.2 : base.time,
    weather: base.weather === 'auto' && start === 'garage' ? 'clear' : base.weather,
  };
}

/** a number 0…1 from a string (the same every time) */
function hash01(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

/** a build that has stood about: dust and rust on its body and every part, a little different each */
function weather(b: Build, dirt: number, rust: number, seed: number): void {
  b.dirt = dirt;
  b.rust = rust;
  for (const [mount, inst] of Object.entries(b.parts)) {
    const k = hash01(`${seed}:${mount}`);
    inst.dirt = Math.min(1, dirt * (0.7 + 0.6 * k));
    inst.rust = Math.min(1, rust * (0.5 + 1.0 * k));
    for (const sub of Object.values(inst.sub)) {
      sub.dirt = inst.dirt;
      sub.rust = inst.rust * 0.5;
    }
  }
}

/** what the first project car is missing: the things the checklist asks for, in order */
export const TUTORIAL_MISSING = ['battery', 'hub_FL', 'hub_RR', 'engine'] as const;

/** do two boxes on the plan overlap (a round post taken as its square)? */
function boxesMeet(a: { x: number; z: number; hx: number; hz: number; yaw: number }, b: { x: number; z: number; hx: number; hz: number; yaw: number }): boolean {
  const ext = (o: typeof a, ux: number, uz: number): number => {
    const hz = o.hz === 0 ? o.hx : o.hz;
    const c = Math.cos(o.yaw);
    const s = Math.sin(o.yaw);
    return Math.abs(o.hx * (c * ux + s * uz)) + Math.abs(hz * (-s * ux + c * uz));
  };
  for (const ang of [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2]) {
    const ux = Math.cos(ang);
    const uz = Math.sin(ang);
    if (Math.abs((b.x - a.x) * ux + (b.z - a.z) * uz) > ext(a, ux, uz) + ext(b, ux, uz)) return false;
  }
  return true;
}

/** the tyre the parts bin puts on a rim: its frame's factory tyre, else a road tyre (none on a wheel that is all rubber) */
function devTyreFor(def: PartDef): string | null {
  if (def.cat !== 'rim' || !def.rim?.tire) return null;
  const tag = def.tags?.find((t) => t.startsWith('stock:'));
  return (tag ? stockTireFor(frameDef(tag.slice(6))) : null) ?? 'tire_road';
}

export class ModGame implements PlayerHost, CockpitHost, DevHost {
  readonly core: RenderCore;
  readonly env: Environment;
  readonly input: InputManager;
  readonly hud: Hud;
  readonly audio = new AudioEngine();
  readonly rig = new FirstPersonRig();
  readonly ui = new ModUI();
  readonly mats = new CarMaterials();
  readonly vehicles: ModVehicle[] = [];
  readonly loose: LooseThings;
  readonly player: ModPlayer;
  /** the controls in the cab, worked with the mouse from the driver's seat */
  readonly cockpit = new Cockpit(this);
  /** what is in the hands, in first person */
  readonly heldThing: HeldThing;
  /** metal on the road */
  readonly sparks: Sparks;
  /** the assists (F2) */
  readonly assists: Assists = loadAssists();
  private readonly sparkDue = new Map<ModVehicle, number>();
  place: 'garage' | 'road';
  garage: GarageScene | null = null;
  world: World | null = null;
  worldView: WorldView | null = null;
  landmarks: LandmarkView | null = null;
  beacons: BeaconView | null = null;
  ground: Ground;
  /** the vehicle the player sits in (null on foot) */
  seated: ModVehicle | null = null;
  /** the vehicle the camera and the sound follow (the one last sat in) */
  focus: ModVehicle | null = null;
  viewMode: ViewMode;
  readonly orbit = { yaw: 0.6, pitch: 0.25, dist: 7, target: 0.8 };
  time = 0;
  /** checklist progress for the garage's first build */
  readonly done = new Set<string>();
  private fadeT = -1;
  private garageCtx: GarageContext | null = null;
  private readonly gs = new GroundSample();
  private readonly bl = new BiomeBlend();
  private readonly pr = { s: 0, d: 0 };
  private readonly chasePos = new THREE.Vector3();
  private chaseInit = false;
  private readonly basis = new Float64Array(9);
  private readonly qa = new THREE.Quaternion();
  private readonly qb = new THREE.Quaternion();
  private readonly eyeP = { x: 0, y: 0, z: 0 };
  /** pedals set by a script (the journey test, screenshots) instead of the keyboard */
  scripted: { steer: number; throttle: number; brake: number; handbrake: number } | null = null;
  private hbHeld = 0;
  private hbWasDown = false;
  private hbIgnore = false;
  readonly ready: Promise<void>;

  constructor(
    canvas: HTMLCanvasElement,
    readonly params: ModParams,
    /** a game in progress to go on with (save.ts), or null for a new one */
    private readonly restore: SaveV1 | null = null,
  ) {
    this.core = new RenderCore(canvas, params.quality);
    this.core.usePost = params.post;
    this.viewMode = params.view === 'chase' ? 'chase' : params.view === 'orbit' ? 'orbit' : 'cockpit';
    // (ModUI shows this game's own key card; the numbers line only with ?hud=1, F3 toggles it)
    this.hud = new Hud(typeof location !== 'undefined' && new URLSearchParams(location.search).get('hud') === '1', '');
    this.input = new InputManager(canvas);
    this.input.freeLook = true;
    this.env = new Environment(this.core, params.seed, { hour: params.time, weather: params.weather, stage: params.wstage });
    this.env.shotMode = params.shot;
    this.orbit.yaw = (params.orbit[0] * Math.PI) / 180;
    this.orbit.pitch = (params.orbit[1] * Math.PI) / 180;
    this.orbit.dist = params.orbit[2];
    this.orbit.target = params.orbit[3];
    this.place = params.start;
    if (params.start === 'garage') {
      this.garage = params.garage === 'stub' ? buildGarageStub(this.core) : buildGarage(this.core);
      this.ground = this.garage.ground;
    } else {
      this.makeWorld();
      this.ground = this.world!;
    }
    this.loose = new LooseThings(this.core, this.mats, (x, z, fromY) => (this.garage ? this.garage.surfaceAt(x, z, fromY) : this.groundAt(x, z)));
    // (things put on a vehicle ride with it)
    this.loose.carriers = () => this.vehicles;
    this.heldThing = new HeldThing(this.core);
    this.sparks = new Sparks(this.core);
    const land = this.garage ? this.garage.land : new GroundLand(this.world!);
    this.player = new ModPlayer(this.world ?? land, this);
    if (this.garage) this.player.addSolids(this.garage.solids);
    else this.worldSolids();
    this.ready = this.populate();
    this.bindInput(canvas);
    window.addEventListener('resize', () => this.core.resize(window.innerWidth, window.innerHeight));
  }

  get origin(): { x: number; y: number; z: number } {
    return this.core.origin;
  }

  get devices(): readonly GarageDevice[] {
    return this.garage?.devices ?? [];
  }

  private makeWorld(): void {
    const p = this.params;
    this.world = new World(p.seed, { chapterScale: p.chapter, startBiome: p.biome });
    this.worldView = new WorldView(this.core, this.world, this.core.quality);
    this.landmarks = new LandmarkView(this.core, this.world);
    this.beacons = new BeaconView(this.core, this.world);
    // (from the start on the road the walker comes after the world)
    if (this.player) this.worldSolids();
  }

  /** what stands by the road (walls, pumps, benches, signs, guard rails): the walker and the vehicles keep out of it */
  private worldSolids(): void {
    if (!this.world) return;
    this.player.addSolids(this.world.sites);
    this.player.addSolids(this.world.furniture);
    for (const v of this.vehicles) this.roadSolids(v);
  }

  /** a vehicle on the road keeps out of what stands by it, and of the other vehicles (not of itself) */
  private roadSolids(v: ModVehicle): void {
    if (!this.world) return;
    v.sim.solids = this.player.solids;
    v.sim.onKnock = (sd, vx, vz, speed) => {
      // a crate, a barrel, a bench shoved: the place moves it and is drawn again …
      const site = this.world?.sites.knock(sd, vx, vz, speed);
      if (site) {
        this.worldView?.redrawSite(site.id);
        return;
      }
      // … or a delineator or a chevron board at the road's edge: it lies where it fell
      const at = this.world ? this.world.furniture.knock(sd, vx, vz) : NaN;
      if (at === at) this.worldView?.redrawFurniture(at);
    };
  }

  private groundAt(x: number, z: number): number {
    this.ground.sample(x, z, this.gs);
    return this.gs.h;
  }

  // ------------------------------------------------------------------ setting up

  /** the vehicles and the things lying about at the start */
  private async populate(): Promise<void> {
    const p = this.params;
    if (this.garage) {
      const g = this.garage;
      await Promise.all([preload(PARTS.map((x) => x.id)), g.ready]);
      if (this.restore) {
        this.restoreGarage(this.restore);
        await Promise.all([...this.vehicles.map((v) => v.view.settled()), this.loose.settled()]);
        this.ui.say('接着上次的进度。（连按两次 F9 从头开始）', 5);
        return;
      }
      const project = p.project === 'full' ? stockBuild('sedan', { fuel: 0.05 }) : stockBuild('sedan', { fuel: 0, without: [...TUTORIAL_MISSING] });
      // a car that stood in a barn for a winter: dust on everything, a little rust at the edges (the sponge has work)
      weather(project, 0.42, 0.06, 1);
      const v = this.addVehicle(project, g.carSpot.x, g.carSpot.z, g.carSpot.yaw);
      this.focus = v;
      // the missing parts and the tools, round the bay; the fun parts on the shelves
      const spots = [...g.spots];
      // a garage without a spot of some kind offers the nearest kind it has
      const instead: Record<string, string> = { charger: 'bench', rack: 'shelf', cans: 'floor' };
      const take = (where: string): (typeof spots)[number] => {
        let i = spots.findIndex((s) => s.where === where);
        if (i < 0 && instead[where]) i = spots.findIndex((s) => s.where === instead[where]);
        return spots.splice(i >= 0 ? i : 0, 1)[0];
      };
      const put = (id: string, where: string, withTyre = ''): void => {
        const s = take(where);
        const inst = newInstance(id, { charge: 0.85 });
        if (withTyre) fitSub(inst, 'tire', newInstance(withTyre));
        // things found round the farm: some dustier than others, the odd one rusty
        const k = hash01(`${id}:${spots.length}`);
        inst.dirt = 0.15 + 0.4 * k;
        inst.rust = id.startsWith('rim_') || id.startsWith('bf_') || id.startsWith('roof_') ? 0.2 + 0.4 * k : 0.05 * k;
        this.loose.addPart(inst, s.x, s.y + 0.4, s.z, s.yaw);
      };
      if (p.project === 'tutorial') {
        // the battery waits on the charger
        put('bat_std', 'charger');
        put('rim_steel13', 'floor', 'tire_road');
        put('rim_steel13', 'floor', 'tire_road');
        put('eng_i4', 'floor');
      }
      // the jerrycans stand by the drums, the rest of the tools lie on the bench
      const tools = [newTool('jerrycan', { fuel: 'petrol', litres: 20 }), newTool('jerrycan', { fuel: 'diesel', litres: 20 }), newTool('bottle'), newTool('oilcan'), newTool('spray', { colour: 13 }), newTool('spray', { colour: 4 }), newTool('sponge')];
      for (const t of tools) {
        const s = take(t.kind === 'jerrycan' ? 'cans' : 'bench');
        this.loose.addTool(t, s.x, s.y + 0.3, s.z, s.yaw);
      }
      // the heavy fun on the steel rack, the light on the shelves
      for (const id of ['eng_v8', 'seat_toilet', 'seat_race', 'gb_5', 'exh_side', 'roof_spikes']) put(id, 'rack');
      for (const id of ['steer_ship', 'turbo_small', 'hl_spot', 'horn_trumpet', 'steer_sport', 'hb_drift']) put(id, 'shelf');
      for (const id of ['bf_ram', 'seat_armchair', 'tank_drum', 'eng_flat6']) put(id, 'floor');
      put('rim_off16', 'floor', 'tire_tractor');
      put('rim_off16', 'floor', 'tire_tractor');
      put('rim_cart', 'floor');
      put('rim_cart', 'floor');
      // a second frame to take parts from
      const donor = stockBuild('pickup', { fuel: 0.3 });
      weather(donor, 0.6, 0.32, 2);
      this.addVehicle(donor, g.bay2.x, g.bay2.z, g.bay2.yaw);
      // and the others found round the place (the workshop's yard): a motorcycle on its stand by the door, a
      // motorhome by the pump with its tank dry (the diesel can is for it)
      if (p.garage === 'workshop') {
        const bike = stockBuild('moto', { fuel: 0.3 });
        weather(bike, 0.45, 0.18, 3);
        // (by the barn's front corner, out of the way of what drives out)
        this.addVehicle(bike, g.bay2.x - 2.9, g.bay2.z + 1.5, -1.25);
        const rv = stockBuild('rv', { fuel: 0 });
        weather(rv, 0.5, 0.22, 4);
        this.addVehicle(rv, g.bay2.x + 4.3, -3.7, 0.18);
      }
      this.player.walker.place(g.spawn.x, g.spawn.z, g.spawn.heading);
      this.input.lookYaw = g.spawn.heading;
    } else {
      const b = this.restore?.vehicles[0]?.build ?? decodeBuild(p.build, { fuel: 0.7 });
      const v = this.placeOnRoad(b, p.s);
      if (this.restore) {
        v.radioOn = !!this.restore.vehicles[0].radioOn;
        v.radioSong = this.restore.vehicles[0].radioSong ?? 0;
        for (const d of this.restore.done) this.done.add(d);
        this.restoreLoose(this.restore.loose.filter((l) => l.on === 0));
        this.ui.say('接着上次的路。（连按两次 F9 从车库重新开始）', 5);
      }
      v.sys.startNow();
      this.seated = v;
      this.focus = v;
    }
    await Promise.all([...this.vehicles.map((v) => v.view.settled()), this.loose.settled()]);
    // (once the model is in: where its clocks are)
    if (this.seated) this.input.lookPitch = this.seatPitch(this.seated);
  }

  private readonly pitchV = new THREE.Vector3();
  /**
   * How far down one looks on sitting in: enough that the clocks show above the bottom of the view (a
   * pickup's high seat over a low dash, a bike's bars), level when they already do.
   */
  private seatPitch(v: ModVehicle): number {
    const needle = Object.values(v.view.needles)[0];
    if (!needle) return v.view.frame.balance ? -0.15 : 0;
    v.view.model.updateMatrixWorld(true);
    const n = v.view.model.worldToLocal(needle.getWorldPosition(this.pitchV));
    const cg = v.sys.derived.cg;
    const e = v.sim.spec.eye;
    const below = Math.atan2(e.y + cg.y - n.y, Math.max(0.2, n.x - (e.x + cg.x)));
    // (the clocks some 22° under the middle of the view sit in its lower fifth)
    return -Math.max(0, Math.min(0.18, below - 0.38));
  }

  /** the things of a save: on the floor where they lay, on board the vehicle they rode on */
  private restoreLoose(list: SavedLoose[]): void {
    for (const l of list) {
      const thing = l.part ? this.loose.addPart(l.part, l.x, l.y + 0.05, l.z, l.yaw) : l.tool ? this.loose.addTool(l.tool, l.x, l.y + 0.05, l.z, l.yaw) : null;
      const v = l.on !== undefined ? this.vehicles[l.on] : undefined;
      if (thing && v && l.pos && l.rot) this.loose.ride(thing, v, { pos: new THREE.Vector3().fromArray(l.pos), rot: new THREE.Quaternion().fromArray(l.rot) });
    }
  }

  /** the workshop as it was left: its vehicles, what lay about, the checklist, where one stood */
  private restoreGarage(s: SaveV1): void {
    for (const sv of s.vehicles) {
      const v = this.addVehicle(sv.build, sv.x, sv.z, sv.yaw);
      v.radioOn = !!sv.radioOn;
      v.radioSong = sv.radioSong ?? 0;
    }
    this.focus = this.vehicles[0] ?? null;
    this.restoreLoose(s.loose);
    for (const d of s.done) this.done.add(d);
    this.player.walker.place(s.player.x, s.player.z, s.player.heading);
    this.input.lookYaw = s.player.heading;
  }

  // ------------------------------------------------------------------ saving

  private saveT = 0;
  /** no more saving (a new game is about to begin) */
  private saveOff = false;
  private newGameAsked = -1;

  /** the game as it stands, for save.ts; null while it cannot be (screenshots, the fade to the road) */
  snapshot(): SaveV1 | null {
    if (this.params.shot || this.fadeT >= 0 || !this.vehicles.length) return null;
    const w = this.player.walker;
    const loose: SavedLoose[] = this.loose.list.map((l) => {
      const r = l.riding;
      const on = r ? this.vehicles.indexOf(r.on as ModVehicle) : -1;
      return { part: l.part ?? undefined, tool: l.tool ?? undefined, x: l.x, y: l.y, z: l.z, yaw: l.yaw, ...(r && on >= 0 ? { on, pos: r.pos.toArray(), rot: r.rot.toArray() } : {}) };
    });
    // what is in the hands is put down where one stands
    const h = this.player.held;
    if (h) loose.push({ part: h.kind === 'part' ? h.inst : undefined, tool: h.kind === 'tool' ? h.tool : undefined, x: w.x, y: w.y, z: w.z, yaw: w.heading });
    const s: SaveV1 = {
      v: 1,
      at: Date.now(),
      place: this.place,
      hour: this.env.clock.hourAt(this.time),
      done: [...this.done],
      vehicles: this.vehicles.map((v) => ({ build: v.build, x: v.sim.px, z: v.sim.pz, yaw: v.sim.yaw, radioOn: v.radioOn, radioSong: v.radioSong })),
      loose,
      player: { x: w.x, z: w.z, heading: w.heading },
    };
    if (this.place === 'road' && this.world) {
      // (on the road only the vehicle one drives goes on)
      const v = this.seated ?? this.focus ?? this.vehicles[0];
      const vi = this.vehicles.indexOf(v);
      s.vehicles = s.vehicles.filter((_, i) => i === vi);
      // (and what rides on it)
      s.loose = s.loose.filter((l) => l.on === vi).map((l) => ({ ...l, on: 0 }));
      s.road = { s: this.world.spine.sAtX(v.sim.px), seed: this.params.seed };
    }
    return s;
  }

  /** write the save now (also when the page goes out of sight) */
  save(): void {
    if (this.saveOff || !this.params.keep) return;
    const s = this.snapshot();
    if (s) writeSave(s);
  }

  /** F9 twice: the save cleared and a new game from the workshop */
  private askNewGame(): void {
    if (this.newGameAsked >= 0 && this.time - this.newGameAsked < 3) {
      this.saveOff = true;
      clearSave();
      location.reload();
      return;
    }
    this.newGameAsked = this.time;
    this.ui.say('再按一次 F9：清除存档，从车库重新开始。', 3);
  }

  addVehicle(build: Build, x: number, z: number, yaw: number): ModVehicle {
    const gy = this.groundAt(x, z);
    const v = new ModVehicle(this.core, build, x, gy + 0.05, z, yaw, this.ground);
    this.vehicles.push(v);
    this.player.addSolids(v.solid);
    this.roadSolids(v);
    return v;
  }

  private placeOnRoad(build: Build, s: number): ModVehicle {
    const w = this.world!;
    const st = new SpineSample();
    w.spine.at(s, st);
    const lane = 1.6;
    const x = st.x - Math.sin(st.phi) * lane;
    const z = st.z + Math.cos(st.phi) * lane;
    const v = this.addVehicle(build, x, z, -st.phi);
    return v;
  }

  // ------------------------------------------------------------------ the developer's parts bin (`)

  private dev: DevPanel | null = null;
  private devGhost: { key: string; group: THREE.Group } | null = null;
  private readonly devRay = new THREE.Raycaster();
  private readonly devNdc = new THREE.Vector2();
  private readonly devNear: Solid[] = [];
  private readonly devPush = new Push();

  /** the parts bin, once it has been opened */
  get devPanel(): DevPanel | null {
    return this.dev;
  }

  /** open or shut the parts bin */
  toggleDev(open = !this.dev?.open): void {
    if (!open && !this.dev) return;
    this.dev ??= new DevPanel(this);
    this.dev.setOpen(open);
  }

  devOpened(open: boolean): void {
    const canvas = this.core.renderer.domElement;
    this.input.lockable = !open;
    if (open) {
      // the mouse let go, for the tiles
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      this.ui.showHelp(false);
      return;
    }
    this.devPreview(null, null);
    // back to the game: the mouse taken again (a key press lets a page do it; else a click will)
    if (!this.params.shot) {
      try {
        void (canvas.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {});
      } catch {
        /* a click will do */
      }
    }
  }

  devModel(item: DevItem): Promise<THREE.Object3D | null> {
    if (item.kind === 'part') {
      const def = partDef(item.id);
      const tyre = devTyreFor(def);
      return partModel(item.id).then(async (m) => {
        const g = new THREE.Group();
        g.add(cloneModel(m));
        if (tyre && def.rim) g.add(seatTyres(m, await partModel(tyre, item.id), def.rim.radius, partDef(tyre).tire!.sidewall, false));
        return g;
      });
    }
    if (item.kind === 'tool') {
      const kind = item.tool;
      return toolGlb(kind).then((m) => (m ? cloneModel(m) : toolModel({ uid: 'dev', kind, fuel: item.fuel })));
    }
    const f = frameDef(item.frame);
    return frameModel(item.frame, () => standInFrame(f.body, f.kind)).then((m) => cloneModel(m));
  }

  /** is (x, y, z) inside a wall, a post, a bench's side (not a vehicle: those are met by their meshes) */
  private devInSolid(x: number, y: number, z: number): boolean {
    const near = this.devNear;
    near.length = 0;
    this.player.solids.solidsNear(x, z, 0.02, near);
    for (const s of near) {
      if (s.tag.startsWith('modcar:') || y < s.y0 || y > s.y1) continue;
      if (pushOut(s, x, z, 0.01, this.devPush)) return true;
    }
    return false;
  }

  devPick(clientX: number, clientY: number): DevPoint | null {
    const canvas = this.core.renderer.domElement;
    const r = canvas.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
    this.devNdc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.core.camera.updateMatrixWorld();
    this.devRay.setFromCamera(this.devNdc, this.core.camera);
    const o = this.core.origin;
    const ray = this.devRay.ray;
    // a vehicle under it: where the ray first meets its body (a roof, a bed, a bonnet, a seat)
    let far = 40;
    let onCar: DevPoint | null = null;
    for (const v of this.vehicles) {
      v.view.root.updateMatrixWorld(true);
      for (const h of this.devRay.intersectObject(v.view.root, true)) {
        if (h.distance >= far) break;
        if (!h.face || !visibleUp(h.object) || h.object.renderOrder >= 20) continue;
        far = h.distance;
        onCar = { x: h.point.x + o.x, y: h.point.y + o.y, z: h.point.z + o.z };
        break;
      }
    }
    // the floor and what stands on it (a bench, a shelf); a wall stops it short, on the floor before the wall
    const at = (t: number): DevPoint => ({ x: ray.origin.x + ray.direction.x * t + o.x, y: ray.origin.y + ray.direction.y * t + o.y, z: ray.origin.z + ray.direction.z * t + o.z });
    const under = (p: DevPoint): number => this.loose.surfaceAt(p.x, p.z, p.y + 0.15) ?? -Infinity;
    const step = 0.1;
    let prev = at(0);
    for (let t = step; t < far; t += step) {
      const p = at(t);
      if (p.y <= under(p)) {
        // back up to where it went under
        let a = t - step;
        let b = t;
        for (let k = 0; k < 6; k++) {
          const m = (a + b) / 2;
          const q = at(m);
          if (q.y <= under(q)) b = m;
          else a = m;
        }
        const q = at(b);
        return { x: q.x, y: under(q), z: q.z };
      }
      if (this.devInSolid(p.x, p.y, p.z)) return { x: prev.x, y: this.loose.surfaceAt(prev.x, prev.z, prev.y) ?? prev.y, z: prev.z };
      prev = p;
    }
    return onCar;
  }

  /** where a thing goes when its tile is only clicked: a step ahead of one's feet (from a seat: beside the vehicle) */
  private devFeet(ahead: number): DevPoint {
    const v = this.seated;
    if (v) {
      const b = this.basis;
      v.sim.basis(b);
      const side = (v.sim.spec.eye.z < 0 ? -1 : 1) * (v.sim.spec.body.halfWidth + 0.9 + ahead * 0.4);
      const x = v.sim.px + b[6] * side;
      const z = v.sim.pz + b[8] * side;
      return { x, y: this.loose.surfaceAt(x, z, v.sim.py + 1) ?? v.sim.py, z };
    }
    const w = this.player.walker;
    const x = w.x + Math.cos(w.heading) * ahead;
    const z = w.z + Math.sin(w.heading) * ahead;
    return { x, y: this.loose.surfaceAt(x, z, w.y + 1.2) ?? w.y, z };
  }

  devSpawn(item: DevItem, at: DevPoint | null): void {
    const yaw = this.player.walker.heading;
    if (item.kind === 'vehicle') {
      const p = at ?? this.devFeet(5);
      const b = stockBuild(item.frame, { fuel: 0.6 });
      if (!item.stock) b.parts = {};
      // facing the way one looks; where another vehicle, a wall or oneself already is, the nearest free place round it
      this.devRoom(this.addVehicle(b, p.x, p.z, -yaw));
      this.ui.say(`放下了：${frameDef(item.frame).name.zh}${item.stock ? '' : '（空车架）'}`, 1.8);
      return;
    }
    const p = at ?? this.devFeet(1.1);
    if (item.kind === 'part') {
      const def = partDef(item.id);
      const inst = newInstance(item.id, { charge: 0.9 });
      const tyre = devTyreFor(def);
      if (tyre) fitSub(inst, 'tire', newInstance(tyre));
      this.loose.addPart(inst, p.x, p.y + 0.3, p.z, yaw);
      this.sound('putdown', def.mass);
      this.ui.say(`放下了：${def.name.zh}`, 1.5);
      return;
    }
    const tool = item.tool === 'jerrycan' ? newTool('jerrycan', { fuel: item.fuel ?? 'petrol', litres: item.litres ?? 20 }) : item.tool === 'spray' ? newTool('spray', { colour: 13 }) : newTool(item.tool);
    this.loose.addTool(tool, p.x, p.y + 0.25, p.z, yaw);
    this.sound('putdown', 3);
  }

  /** a vehicle let go on top of another, in a wall or on oneself: moved to the nearest free place round there */
  private devRoom(v: ModVehicle): void {
    const own = v.solid.update();
    const dx = own.x - v.sim.px;
    const dz = own.z - v.sim.pz;
    const w = this.player.walker;
    const me = { x: 0, z: 0, hx: own.hx + 0.2, hz: own.hz + 0.2, yaw: own.yaw };
    const free = (x: number, z: number): boolean => {
      me.x = x + dx;
      me.z = z + dz;
      if (boxesMeet(me, { x: w.x, z: w.z, hx: 0.45, hz: 0.45, yaw: 0 })) return false;
      const near = this.devNear;
      near.length = 0;
      this.player.solids.solidsNear(me.x, me.z, Math.hypot(me.hx, me.hz), near);
      for (const s of near) {
        // (low things, a kerb or a mat, and what is overhead stay out of it)
        if (s === own || s.y1 - s.y0 < 0.3 || s.y0 > v.sim.py + 1) continue;
        if (boxesMeet(me, s)) return false;
      }
      return true;
    };
    const px = v.sim.px;
    const pz = v.sim.pz;
    for (let r = 0; r <= 9; r += 0.6) {
      const n = r === 0 ? 1 : Math.round(r * 7);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const x = px + Math.cos(a) * r;
        const z = pz + Math.sin(a) * r;
        if (!free(x, z)) continue;
        if (r > 0) {
          v.sim.reset(x, this.groundAt(x, z) + 0.05, z, v.sim.yaw, this.ground);
          v.awake = 3;
        }
        return;
      }
    }
  }

  devPreview(item: DevItem | null, at: DevPoint | null): void {
    const key = item ? JSON.stringify(item) : '';
    if ((this.devGhost?.key ?? '') !== key) {
      this.devGhost?.group.removeFromParent();
      this.devGhost = null;
      if (item) {
        const group = new THREE.Group();
        group.name = 'ghost:dev';
        group.visible = false;
        this.core.scene.add(group);
        const g = { key, group };
        this.devGhost = g;
        void this.devModel(item).then((obj) => {
          if (this.devGhost !== g || !obj) return;
          // as it will lie: a wheel on its side
          const def = item.kind === 'part' ? partDef(item.id) : null;
          if (def && (def.cat === 'rim' || def.cat === 'tire')) {
            obj.rotation.x = Math.PI / 2;
            obj.position.y = (def.rim?.width ?? def.tire?.width ?? 0.15) / 2;
          }
          applyGhost(obj, 'empty', true);
          group.add(obj);
        });
      }
    }
    const g = this.devGhost;
    if (!g) return;
    g.group.visible = !!at;
    if (at) {
      this.core.place(g.group, at.x, at.y, at.z);
      g.group.rotation.set(0, -this.player.walker.heading, 0);
    }
  }

  devClear(): void {
    const n = this.loose.list.length;
    for (const l of [...this.loose.list]) this.loose.remove(l);
    this.ui.say(n ? `清掉了 ${n} 件。` : '地上本来就没有东西。', 2);
  }

  devRepair(): void {
    for (const v of this.vehicles) {
      const b = v.build;
      const eng = Object.values(b.parts).find((i) => partDef(i.part).cat === 'engine');
      const fuelType = eng ? (partDef(eng.part).engine?.fuel ?? 'petrol') : 'petrol';
      b.cond = 1;
      b.dirt = 0;
      b.rust = 0;
      for (const { inst } of allInstances(b)) {
        const fresh = newInstance(inst.part, { charge: 1, fuelL: 1e6, fuelType });
        inst.cond = 1;
        inst.dirt = 0;
        inst.rust = 0;
        inst.flat = false;
        inst.fluids = fresh.fluids;
        if (fresh.tread !== undefined) inst.tread = fresh.tread;
      }
      v.changed();
    }
    this.ui.say('所有车都修好了：汽油、机油、冷却液、电瓶都加满了。', 2.5);
  }

  // ------------------------------------------------------------------ input

  private bindInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('mousedown', (e) => {
      if (!this.input.locked) return;
      this.audio.start();
      if (this.seated) {
        this.cockpit.press(this.seated, e.button === 2);
        return;
      }
      if (e.button === 0) this.player.press();
      if (e.button === 2) this.player.secondary = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (this.seated) this.cockpit.release(this.seated);
      if (e.button === 0) this.player.release();
      if (e.button === 2) this.player.secondary = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // the parts bin open (the mouse free): a drag on the view turns it (either button: a trackpad has only the one)
    let turning = -1;
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.dev?.open || (e.button !== 0 && e.button !== 2)) return;
      turning = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId === turning) this.input.turn(e.movementX, e.movementY, 0.0045);
    });
    const stopTurning = (e: PointerEvent): void => {
      if (e.pointerId === turning) turning = -1;
    };
    canvas.addEventListener('pointerup', stopTurning);
    canvas.addEventListener('pointercancel', stopTurning);
    canvas.addEventListener('wheel', (e) => this.player.wheel(e.deltaY));
    window.addEventListener('keydown', () => this.audio.start(), { once: true });
    // the key card: at the start until the first click, and on F1 any time
    if (!this.params.shot) this.ui.showHelp(true);
    window.addEventListener('keydown', (e) => {
      // the key left of 1 (` on a US keyboard; § on a Mac's international one): the developer's parts bin
      if (e.code === 'Backquote' || e.code === 'IntlBackslash' || e.key === '`' || e.key === '§') {
        e.preventDefault();
        if (!e.repeat) this.toggleDev();
        return;
      }
      if (e.key === 'Escape' && this.dev?.open) {
        this.toggleDev(false);
        return;
      }
      if (e.code === 'F1') {
        e.preventDefault();
        this.ui.showHelp(!this.ui.helpShown);
        return;
      }
      if (e.code === 'F2') {
        e.preventDefault();
        this.ui.showAssists(this.ui.assistsShown ? null : this.assistItems());
        return;
      }
      if (e.code === 'F9') {
        e.preventDefault();
        this.askNewGame();
        return;
      }
      // the assists card open: the number keys switch them
      const n = /^Digit([1-9])$/.exec(e.code);
      if (n && this.ui.assistsShown) {
        const entry = ASSIST_LABELS[Number(n[1]) - 1];
        if (!entry) return;
        this.assists[entry[0]] = !this.assists[entry[0]];
        saveAssists(this.assists);
        this.ui.showAssists(this.assistItems());
      }
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === canvas) this.ui.showHelp(false);
    });
    // the game is kept when the page goes out of sight or away
    if (this.params.keep) {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.save();
      });
      window.addEventListener('pagehide', () => this.save());
    }
    this.input.onAction((a) => {
      this.hud.dismissHint();
      if (a === 'use') {
        if (this.seated) this.getOut();
        else this.player.press();
        return;
      }
      if (a === 'camera') {
        this.viewMode = this.viewMode === 'cockpit' ? 'chase' : 'cockpit';
        return;
      }
      if (a === 'hud') this.hud.toggle();
      const v = this.seated;
      if (!v) return;
      if (a === 'key') {
        if (v.sys.running) v.sys.stop('');
        else v.sys.crank(true);
        this.sound('key');
      } else if (a === 'lights') {
        v.sys.cycleLights();
        this.sound('switch');
      } else if (a === 'horn') v.sys.setHorn(true);
      else if (a === 'leverUp' || a === 'leverDown') this.sound(v.sys.stepLever(a === 'leverUp' ? -1 : 1) ? 'lever' : 'grind');
      else if (a === 'manual') v.sim.setManual(!v.sim.manual);
      else if (a === 'hazard') {
        v.view.hazard = !v.view.hazard;
        this.sound('switch');
      }
      else if (a === 'reset') this.resetUpright(v);
    });
    this.input.onRelease((a) => {
      const v = this.seated;
      if (a === 'use' && !this.seated) this.player.release();
      if (!v) return;
      if (a === 'horn') v.sys.setHorn(false);
      else if (a === 'key') v.sys.crank(false);
    });
  }

  private assistItems(): { label: string; on: boolean }[] {
    return ASSIST_LABELS.map(([k, label]) => ({ label, on: this.assists[k] }));
  }

  /** the assists into the vehicles and the player, every step */
  private applyAssists(): void {
    const a = this.assists;
    for (const v of this.vehicles) {
      v.sim.autoRelease = a.autoRelease;
      v.assistHold = a.autoHold;
      v.sys.assistReverse = a.autoReverse;
    }
    this.player.showGhostsOn = a.ghosts;
    this.player.showCardOn = a.card;
  }

  // ------------------------------------------------------------------ getting in and out

  enter(v: ModVehicle): void {
    const seat = v.view.frame.mounts.find((m) => m.driver);
    if (!seat || !v.build.parts[seat.id]) {
      this.ui.say('驾驶位没有座椅，坐不进去。');
      return;
    }
    if (this.player.held) this.player.putDown();
    this.player.ghosts.clear();
    this.player.clearHighlight();
    this.seated = v;
    this.focus = v;
    v.awake = 3;
    this.input.freeLook = false;
    this.input.lookYaw = 0;
    // astride a bike one looks down the road over the clocks (level, they sit under the view's edge)
    this.input.lookPitch = this.seatPitch(v);
    this.rig.reset();
    // (no door on a motorcycle: the stand folds up)
    this.sound(v.view.frame.balance ? 'lever' : 'door_close', v.view.frame.balance ? 0.7 : 1);
    this.checkTutorial();
  }

  getOut(): void {
    const v = this.seated;
    if (!v || Math.abs(v.sim.kmh) > 6) return;
    const b = this.basis;
    v.sim.basis(b);
    const e = v.sim.spec.eye;
    const side = e.z < 0 ? -1 : 1;
    const out = v.sim.spec.body.halfWidth + 0.55;
    // beside the driver's door, facing the way the car faces
    const lx = e.x - 0.2;
    const lz = side * out;
    const x = v.sim.px + b[0] * lx + b[6] * lz;
    const z = v.sim.pz + b[2] * lx + b[8] * lz;
    const heading = Math.atan2(b[2], b[0]);
    this.seated = null;
    v.view.highlight(null);
    // nothing holds it now but the handbrake (or P): say so when it is off
    if (v.sim.parkBrake <= 0 && v.sim.selector !== 'P') this.ui.say(v.sys.hasPart('handbrake') ? '没拉手刹——车会溜。' : '这车没有手刹，停在坡上会溜。', 3);
    this.player.walker.place(x, z, heading);
    this.input.freeLook = true;
    this.input.lookYaw = heading;
    this.input.lookPitch = 0;
    this.sound(v.view.frame.balance ? 'lever' : 'door_close', v.view.frame.balance ? 0.7 : 1);
  }

  private resetUpright(v: ModVehicle): void {
    const s = v.sim;
    this.ground.sample(s.px, s.pz, this.gs);
    s.reset(s.px, this.gs.h + 0.15, s.pz, s.yaw);
    v.sys.bind(s);
    this.rig.reset();
  }

  // ------------------------------------------------------------------ PlayerHost

  changed(v: ModVehicle, what: string): void {
    v.changed();
    // a wheel or a spec change keeps the per-wheel grip in force
    applyWheelMods(v.sim, v.sys.derived);
    void what;
    this.checkTutorial();
  }

  // ------------------------------------------------------------------ sound

  /** the engine voice and the mechanical sounds (docs/MODCAR_AUDIO.md), on the game's context once a gesture started it */
  private voice: EngineVoice | null = null;
  private foley: Foley | null = null;
  /** loops asked for this frame (spray, sponge, pour, the wrench) and the ones playing */
  private readonly loopsNow = new Map<FoleyLoop, FoleyOpts>();
  private readonly loopsOn = new Set<FoleyLoop>();
  private hornOn: 'horn_beep' | 'horn_trumpet' | 'horn_air' | '' = '';
  /** the radio of the vehicle one is in or beside */
  private radio: Radio | null = null;
  private readonly lastGear: { v: ModVehicle | null; gear: number } = { v: null, gear: 0 };
  private wasBlinking = false;

  private sounds(): Foley | null {
    const ctx = this.audio.context;
    const out = this.audio.output;
    if (!ctx || !out) return null;
    if (!this.foley) {
      this.voice = new EngineVoice(ctx, out);
      this.foley = new Foley(ctx, out);
      this.foley.warm(['door_open', 'door_close', 'part_pickup', 'part_setdown', 'part_install', 'key_turn', 'handbrake_pull', 'gear_shift', 'ratchet']);
    }
    return this.foley;
  }

  /** the material a door makes its sound in, by the style of the part on it */
  private panelMaterial(v: ModVehicle | null | undefined, mount?: string): PanelMaterial {
    const inst = v && mount ? v.build.parts[mount] : undefined;
    const style = inst ? partDef(inst.part).panel?.style : undefined;
    return style === 'rusty' || style === 'armor' || style === 'cage' || style === 'fridge' ? style : 'metal';
  }

  /**
   * A sound by name, from the player, the cab and the garage: one-shots play at once; the names of things
   * that go on while a button is held (spray, scrub, pour) keep their loop going for this frame.
   * @param gain a mass (kg) for things picked up and put down, litres moved for a pour, else a level
   */
  sound(name: string, gain = 1, mount?: string): void {
    const f = this.sounds();
    if (!f) return;
    const held = this.player.held;
    const v = this.seated ?? this.focus;
    switch (name) {
      case 'spray':
        this.loopsNow.set('spray', {});
        return;
      case 'scrub':
        this.loopsNow.set('sponge', {});
        return;
      case 'pour': {
        const liquid = held?.kind === 'tool' ? (held.tool.kind === 'bottle' ? 'water' : held.tool.kind === 'oilcan' ? 'oil' : 'fuel') : 'fuel';
        this.loopsNow.set('pour', { liquid });
        return;
      }
    }
    const shot: Partial<Record<string, [FoleyShot, FoleyOpts]>> = {
      ratchet_done: ['part_install', { mass: held?.kind === 'part' ? partDef(held.inst.part).mass : 10 }],
      remove_done: ['part_remove', { mass: gain }],
      pickup: ['part_pickup', { mass: gain }],
      putdown: ['part_setdown', { mass: gain }],
      door_open: [mount && /hood/.test(mount) ? 'hood_open' : mount && /trunk/.test(mount) ? 'trunk_open' : 'door_open', { material: this.panelMaterial(v, mount) }],
      door_close: [mount && /hood/.test(mount) ? 'hood_close' : mount && /trunk/.test(mount) ? 'trunk_close' : 'door_close', { material: this.panelMaterial(v, mount) }],
      key: ['key_turn', {}],
      ratchet: [v && v.sim.parkBrake > 0 ? 'handbrake_pull' : 'handbrake_release', {}],
      lever: ['lever', {}],
      crash: ['crash', { gain }],
      shift: ['gear_shift', { gain: 0.6 }],
      grind: ['gear_grind', { gain: Math.min(1, gain) }],
      latch: ['latch', {}],
      switch: ['switch', {}],
    };
    const s = shot[name];
    if (s) f.play(s[0], s[1]);
  }

  /** start the loops asked for this frame, stop the rest; the horn of the vehicle in focus */
  private updateFoley(): void {
    const f = this.foley;
    if (!f) return;
    // the wrench turns while a part goes on or comes off
    const t = this.player.target;
    if (!this.seated && this.player.progress > 0 && t && (t.kind === 'ghost' || t.kind === 'looseSub' || ((t.kind === 'part' || t.kind === 'loose') && this.player.secondary))) this.loopsNow.set('ratchet', {});
    for (const [k, o] of this.loopsNow) {
      if (!this.loopsOn.has(k)) {
        f.start(k, o);
        this.loopsOn.add(k);
      }
    }
    for (const k of [...this.loopsOn]) {
      if (this.loopsNow.has(k)) continue;
      f.stop(k);
      this.loopsOn.delete(k);
    }
    this.loopsNow.clear();
    // the hazard relay ticks as the lamps go on and off (in the car one sits in)
    const sv = this.seated;
    const blinkNow = !!sv && sv.view.blinking;
    if (sv && blinkNow !== this.wasBlinking) f.play('switch', { gain: 0.35 });
    this.wasBlinking = blinkNow;
    const d = (this.seated ?? this.focus)?.sys.dash;
    const want = d?.horn ? (d.hornSound === 'trumpet' ? 'horn_trumpet' : d.hornSound === 'air' ? 'horn_air' : 'horn_beep') : '';
    if (want !== this.hornOn) {
      if (this.hornOn) f.horn(this.hornOn, false);
      if (want) f.horn(want, true);
      this.hornOn = want;
    }
  }

  /** the car radio: the one in the vehicle one sits in, or the nearest one playing within earshot */
  private updateRadio(): void {
    const ctx = this.audio.context;
    const out = this.audio.output;
    if (!ctx || !out) return;
    this.radio ??= new Radio(ctx, out);
    let best: ModVehicle | null = null;
    let level = 0;
    for (const v of this.vehicles) {
      if (!v.radioOn || !v.sys.hasPart('radio') || v.sys.dash.battery <= 0.02) continue;
      const watts = v.view.frame.mounts.find((m) => m.cat === 'radio' && v.build.parts[m.id]);
      const loud = watts && partDef(v.build.parts[watts.id].part).radio?.tape ? 1.15 : 1;
      let l: number;
      // (about as loud as the engine and the road at a cruise: measured on the master output)
      if (this.seated === v) l = 0.14 * loud;
      else {
        const d = Math.hypot(this.player.walker.x - v.sim.px, this.player.walker.z - v.sim.pz);
        // a closed car keeps most of it in
        l = (0.09 * loud * (0.35 + 0.65 * (1 - v.sys.derived.enclosed))) / (1 + (d * d) / 6);
      }
      if (l > level) {
        level = l;
        best = v;
      }
    }
    let song = best?.radioSong ?? 0;
    // the garage's own set on the tool chest, heard round the workshop (and a little from a seat)
    const set = this.garage?.radio?.();
    if (set?.on) {
      const d = Math.hypot(this.player.walker.x - set.x, this.player.walker.z - set.z);
      const l = (this.seated ? 0.03 : 0.12) / (1 + (d * d) / 12);
      if (l > level) {
        level = l;
        song = set.song;
      }
    }
    this.radio.update({ on: level > 0.01, song, level });
  }

  /** the engine of the vehicle in focus: heard from the seat, or from where one stands */
  private updateEngineVoice(): void {
    const voice = this.voice;
    const v = this.seated ?? this.focus;
    if (!voice || !v) return;
    const d = v.sys.dash;
    const sim = v.sim;
    const ex = v.view.frame.mounts.find((m) => m.cat === 'exhaust' && v.build.parts[m.id]);
    const eng = v.view.frame.mounts.find((m) => m.cat === 'engine' && v.build.parts[m.id]);
    const engInst = eng ? v.build.parts[eng.id] : undefined;
    const inGear = sim.selector === 'D' || sim.selector === 'R';
    // the cabin is as open as its missing and open doors (and a frame that has none) make it
    let open = 1 - v.sys.derived.enclosed;
    for (const m of v.view.frame.mounts) if (m.cat === 'door' && v.build.parts[m.id]) open += v.view.panelOpen(m.id) * 0.25;
    const inside = this.seated === v && this.viewMode === 'cockpit';
    const dx = this.player.walker.x - sim.px;
    const dz = this.player.walker.z - sim.pz;
    const dist = this.seated === v ? (this.viewMode === 'chase' ? v.view.frame.chase.dist : 3) : Math.hypot(dx, dz);
    // from where one stands: the speed it comes towards one at (Doppler)
    const approach = this.seated === v ? 0 : (sim.vx * dx + sim.vz * dz) / Math.max(0.5, dist);
    // a worn engine misfires, a worn-out one knocks; past the red it boils over
    const cond = engInst?.cond ?? 1;
    voice.update({
      engineId: engInst?.part ?? null,
      exhaustId: ex ? v.build.parts[ex.id].part : null,
      turbo: !!engInst?.sub.turbo,
      rpm: d.rpm,
      load: d.running ? sim.throttle * (inGear ? 1 : 0.35) : 0,
      throttle: sim.throttle,
      running: d.running,
      cranking: d.cranking,
      inside,
      doorsOpen: Math.min(1, Math.max(0, open)),
      starterRate: Math.min(1, d.battery * 1.6),
      boost: d.boost,
      distance: Math.max(1, dist),
      approach,
      misfire: Math.max(0, Math.min(1, (0.55 - cond) / 0.45)),
      knock: Math.max(0, Math.min(1, (0.3 - cond) / 0.3)),
      steam: Math.max(0, Math.min(1, (d.coolantC - 110) / 15)),
    });
    // the box changing gear by itself (automatic or a sequential change) clunks
    if (this.lastGear.v === v && this.lastGear.gear !== sim.gear && d.running) this.sound('shift');
    this.lastGear.v = v;
    this.lastGear.gear = sim.gear;
  }

  // ------------------------------------------------------------------ the checklist

  tutorialSteps(): { id: string; text: string; done: boolean }[] {
    const v = this.vehicles[0];
    if (!v) return [];
    const b = v.build;
    const fuel = v.sys.dash.tankL > 0 ? v.sys.dash.fuel : 0;
    const hood = v.view.hasPanel('hood') && !!b.parts.hood;
    return [
      ...(hood || this.done.has('hood') ? [{ id: 'hood', text: '打开引擎盖', done: this.done.has('hood') || (!!b.parts.battery && !!b.parts.engine) }] : []),
      { id: 'battery', text: '装上电瓶', done: !!b.parts.battery },
      { id: 'wheels', text: '装上两个车轮', done: !!b.parts.hub_FL && !!b.parts.hub_RR },
      { id: 'engine', text: '装上发动机', done: !!b.parts.engine },
      { id: 'fuel', text: '用油桶加油', done: fuel > 0.04 },
      // (what was opened is shut again before the road: an open bonnet fills the windscreen)
      ...(hood || this.done.has('hood') ? [{ id: 'shut', text: '关上引擎盖', done: this.done.has('shut') }] : []),
      // (a workshop with doors to open: the button beside them)
      ...(this.garage?.doorsOpen || this.done.has('door') ? [{ id: 'door', text: '按门边的按钮，打开大门', done: this.done.has('door') || !!this.garage?.doorsOpen?.() }] : []),
      { id: 'seat', text: '坐进驾驶座', done: this.seated === v || this.done.has('seat') },
      { id: 'start', text: '按住 K 打火', done: v.sys.running || this.done.has('start') },
      { id: 'drive', text: '松手刹，开出车库', done: this.place === 'road' },
    ];
  }

  private checkTutorial(): void {
    const v = this.vehicles[0];
    if (!v) return;
    if (this.garage?.doorsOpen?.()) this.done.add('door');
    if (v.view.panelOpen('hood') > 0.6 || (v.view.hasPanel('hood') && !v.build.parts.hood)) this.done.add('hood');
    // shut once what goes under it is in (or there is no bonnet left to shut)
    const under = !!v.build.parts.battery && !!v.build.parts.engine;
    if (this.done.has('hood') && under && (v.view.panelOpen('hood') < 0.05 || !v.build.parts.hood)) this.done.add('shut');
    if (this.seated === v) this.done.add('seat');
    // sat behind an open bonnet: say why the road cannot be seen (once)
    if (this.seated === v && v.view.panelOpen('hood') > 0.5 && !this.done.has('hoodWarned')) {
      this.done.add('hoodWarned');
      this.ui.say('引擎盖还开着，挡住了前面：下车把它关上。', 4);
    }
    if (v.sys.running) this.done.add('start');
  }

  // ------------------------------------------------------------------ the frame

  modEnv(v: ModVehicle): ModEnv {
    const e = this.env;
    const sky = e.sky as unknown as { daylight?: number };
    let surface: number | undefined;
    for (const w of v.sim.wheels) if (w.contact) surface = w.surface;
    return { ambientC: e.state.temp, dark: e.dark, rain: e.state.rain, sun: sky.daylight ?? 1, surface };
  }

  private handbrakeKey(dt: number, down: boolean, v: ModVehicle): number {
    const sim = v.sim;
    if (down && !this.hbWasDown) {
      this.hbHeld = 0;
      this.hbIgnore = sim.parkBrake > 0;
      if (this.hbIgnore) sim.setParkBrake(false);
    }
    if (down) this.hbHeld += dt;
    if (!down && this.hbWasDown && !this.hbIgnore && this.hbHeld >= 0.5 && sim.kmh < 1) sim.setParkBrake(true);
    this.hbWasDown = down;
    return down && !this.hbIgnore ? 1 : 0;
  }

  step(dt: number, alpha?: number): void {
    this.input.update(dt);
    this.applyAssists();
    this.time += dt;
    // and every half minute
    if (this.params.keep && (this.saveT += dt) > 30) {
      this.saveT = 0;
      this.save();
    }
    // on foot: walk, look, use
    if (!this.seated) {
      const i = this.input;
      this.player.update(dt, i.lookYaw, i.lookPitch, {
        forward: i.walk.forward,
        right: i.walk.right,
        run: i.isDown('ShiftLeft') || i.isDown('ShiftRight'),
        jump: i.isDown('Space'),
        drop: i.isDown('KeyG'),
        take: this.player.secondary || i.isDown('KeyF'),
        // (the right button's release is seen through the window's mouseup below)
      } as never);
    } else {
      // seated: the workbench words go away (the cab's controls have the mark now)
      this.ui.showCard(null);
      this.ui.showHeld(null);
      this.ui.showPaint(null, 0);
    }
    // vehicles
    for (const v of this.vehicles) {
      let input = null;
      if (v === this.seated) {
        const d = this.input.drive;
        input = this.scripted ?? { steer: d.steer, throttle: d.throttle, brake: d.brake, handbrake: this.handbrakeKey(dt, d.handbrake > 0.5, v) };
      }
      v.step(dt, this.ground, this.modEnv(v), input);
      // a knock against something hard, heard from the seat
      if (v.sim.hits !== v.knocksHeard) {
        v.knocksHeard = v.sim.hits;
        if (v === this.seated && v.sim.lastHitSpeed > 2.5) this.sound('crash', Math.min(1, 0.3 + v.sim.lastHitSpeed / 14));
      }
    }
    this.loose.update(dt);
    this.throwSparks(dt);
    this.checkTutorial();
    if (this.garage) this.garage.update(dt, this.garageContext());
    this.leaveGarage(dt);
    this.updateViews(dt, alpha);
    this.loose.follow();
  }

  private garageContext(): GarageContext {
    if (!this.garageCtx) {
      const game = this;
      this.garageCtx = {
        get vehicles() {
          return game.vehicles;
        },
        loose: this.loose,
        player: this.player,
        ui: this.ui,
        get seated() {
          return game.seated;
        },
        get hour() {
          return game.env.sky.hour;
        },
        checklist: () => this.tutorialSteps(),
        changed: (v: ModVehicle, what: string) => this.changed(v, what),
        sound: (name: string, gain?: number) => this.sound(name, gain),
      };
    }
    return this.garageCtx;
  }

  private readonly sparkB = new Float64Array(9);
  private readonly sparkL = { x: 0, y: 0, z: 0 };
  /**
   * Sparks where a vehicle drags metal on the road (the physics' feel.scrape): from each empty hub's drum,
   * or else from the lowest corner of the body, thrown back the way the road goes past.
   */
  private throwSparks(dt: number): void {
    for (const v of this.vehicles) {
      const sim = v.sim;
      const scrape = sim.feel.scrape ?? 0;
      if (scrape < 1) continue;
      // in bursts, a dozen or so at a time, more often the faster it drags
      const due = (this.sparkDue.get(v) ?? 0) + dt * (4 + 10 * Math.min(1, scrape / 8));
      const bursts = Math.floor(due);
      this.sparkDue.set(v, due - bursts);
      if (!bursts) continue;
      const n = bursts * (8 + Math.floor(Math.random() * 12));
      const b = this.sparkB;
      sim.basis(b);
      const sp = Math.hypot(sim.vx, sim.vz) || 1;
      const back = { x: -sim.vx / sp, z: -sim.vz / sp };
      const at = (lx: number, ly: number, lz: number): [number, number, number] => [sim.px + b[0] * lx + b[3] * ly + b[6] * lz, sim.py + b[1] * lx + b[4] * ly + b[7] * lz, sim.pz + b[2] * lx + b[5] * ly + b[8] * lz];
      let thrown = false;
      const hubR = sim.spec.emptyHubRadius ?? 0.45 * sim.spec.wheelRadius;
      for (let i = 0; i < 4; i++) {
        const w = sim.wheels[i];
        if (w.fit !== 2) continue;
        sim.wheelLocal(i, this.sparkL);
        const [x, y, z] = at(this.sparkL.x, this.sparkL.y - hubR, this.sparkL.z);
        if (y - this.groundAt(x, z) > 0.12) continue;
        this.sparks.emit(x, y, z, back, Math.min(9, scrape * 0.8), Math.max(1, Math.round(n / 2)));
        thrown = true;
      }
      if (!thrown) {
        // the body: whichever bottom corner is nearest the ground
        const bd = sim.spec.body;
        let best: [number, number, number] | null = null;
        let gap = Infinity;
        for (const ex of [bd.centerX + bd.halfLength, bd.centerX - bd.halfLength]) {
          for (const ez of [-bd.halfWidth * 0.8, bd.halfWidth * 0.8]) {
            const p = at(ex, bd.bottom, ez);
            const g = p[1] - this.groundAt(p[0], p[2]);
            if (g < gap) {
              gap = g;
              best = p;
            }
          }
        }
        if (best && gap < 0.15) this.sparks.emit(best[0], best[1], best[2], back, Math.min(9, scrape * 0.8), n);
      }
    }
    this.sparks.update(dt);
  }

  /** drove out past the apron: fade out, onto the road, fade in */
  private leaveGarage(dt: number): void {
    if (this.place !== 'garage' || !this.garage) return;
    const v = this.seated;
    if (this.fadeT < 0) {
      if (v && v.sim.px > this.garage.exitX) {
        this.fadeT = 0;
        this.ui.setFade(1);
      }
      return;
    }
    this.fadeT += dt;
    if (this.fadeT > 0.7 && v) {
      const speed = v.sim.vForward;
      // the garage and what lies in it stay behind
      this.garage.dispose();
      this.player.removeSolids(this.garage.solids);
      this.garage = null;
      // (but what is on board goes too)
      for (const l of [...this.loose.list]) if (l.riding?.on !== v) this.loose.remove(l);
      for (const o of this.vehicles.filter((x) => x !== v)) o.view.dispose();
      this.vehicles.splice(0, this.vehicles.length, v);
      this.makeWorld();
      this.ground = this.world!;
      this.player.walker.land = this.world!;
      const st = new SpineSample();
      this.world!.spine.at(this.params.s, st);
      const x = st.x - Math.sin(st.phi) * 1.6;
      const z = st.z + Math.cos(st.phi) * 1.6;
      this.world!.sample(x, z, this.gs);
      v.sim.reset(x, this.gs.h + 0.05, z, -st.phi);
      v.sys.bind(v.sim);
      // keep it rolling at the speed it left the garage with
      const b = this.basis;
      v.sim.basis(b);
      v.sim.vx = b[0] * speed;
      v.sim.vz = b[2] * speed;
      this.place = 'road';
      this.chaseInit = false;
      this.rig.reset();
      this.fadeT = -1;
      this.ui.setFade(0);
      this.ui.say('上路了。');
    }
  }

  private updateViews(dt: number, alpha?: number): void {
    const core = this.core;
    const cam = core.camera;
    const o = core.origin;
    // the weather's wipers on the car one sits in; the filler cap open while fuel goes in
    this.env.wiperMode = this.seated?.view.wipers.length ? 'auto' : 'off';
    const t = this.player.target;
    for (const v of this.vehicles) {
      v.view.wiperAngle = v === this.seated ? this.env.wiperAngle : 0;
      v.view.capOpen = !this.seated && t?.kind === 'pour' && t.v === v && this.player.primary;
      v.view.ridden = v === this.seated;
      v.view.update(dt, v.sim, v.sys.dash, core, v === this.seated ? alpha : 1);
    }
    const f = this.seated ?? this.focus;
    // the floating origin follows whoever the camera is with
    const fx = this.seated ? this.seated.sim.px : this.player.walker.x;
    const fy = this.seated ? this.seated.sim.py : this.player.walker.y;
    const fz = this.seated ? this.seated.sim.pz : this.player.walker.z;
    if (core.maybeRebase(fx, fy, fz)) {
      for (const v of this.vehicles) v.view.update(0, v.sim, v.sys.dash, core, 1);
      if (this.garage) core.place(this.garage.root, 0, 0, 0);
    }
    if (this.viewMode === 'orbit' && f) {
      const sim = f.sim;
      const b = this.basis;
      sim.basis(b);
      let fx2 = b[0];
      let fz2 = b[2];
      const fl = Math.hypot(fx2, fz2) || 1;
      fx2 /= fl;
      fz2 /= fl;
      const rx = -fz2;
      const rz = fx2;
      const ob = this.orbit;
      const ch = Math.cos(ob.pitch);
      const dx = (fx2 * Math.cos(ob.yaw) + rx * Math.sin(ob.yaw)) * ch;
      const dz = (fz2 * Math.cos(ob.yaw) + rz * Math.sin(ob.yaw)) * ch;
      const ty = sim.py - sim.spec.cgHeight + ob.target;
      cam.position.set(sim.px + dx * ob.dist - o.x, ty + Math.sin(ob.pitch) * ob.dist - o.y, sim.pz + dz * ob.dist - o.z);
      cam.up.set(0, 1, 0);
      cam.lookAt(sim.px - o.x, ty - o.y, sim.pz - o.z);
      if (cam.fov !== 40) {
        cam.fov = 40;
        cam.updateProjectionMatrix();
      }
    } else if (this.seated && this.viewMode === 'chase') {
      const sim = this.seated.sim;
      const b = this.basis;
      sim.basis(b);
      let fx2 = b[0];
      let fz2 = b[2];
      const fl = Math.hypot(fx2, fz2) || 1;
      fx2 /= fl;
      fz2 /= fl;
      const ch = this.seated.view.frame.chase;
      const pose = this.seated.view.pose;
      const tmp = new THREE.Vector3(pose.x - fx2 * ch.dist - o.x, pose.y + ch.height - o.y, pose.z - fz2 * ch.dist - o.z);
      if (!this.chaseInit || dt === 0) {
        this.chasePos.copy(tmp);
        this.chaseInit = true;
      } else this.chasePos.lerp(tmp, 1 - Math.exp(-dt * 5));
      cam.position.copy(this.chasePos);
      cam.up.set(0, 1, 0);
      cam.lookAt(pose.x - o.x, pose.y + ch.look - o.y, pose.z - o.z);
      if (cam.fov !== 55) {
        cam.fov = 55;
        cam.updateProjectionMatrix();
      }
    } else if (this.seated) {
      const sim = this.seated.sim;
      this.rig.lookYaw = this.input.lookYaw;
      this.rig.lookPitch = this.input.lookPitch;
      this.rig.seat = null;
      this.rig.update(dt, sim, this.seated.view.pose);
      cam.position.set(this.rig.x - o.x, this.rig.y - o.y, this.rig.z - o.z);
      cam.quaternion.set(this.rig.qx, this.rig.qy, this.rig.qz, this.rig.qw).multiply(QFIX);
      // a motorcycle leans: the rider's eye goes round the line the tyres touch the road on, and the view rolls with it
      if (this.seated.view.frame.balance && sim.lean !== 0) {
        const b = this.basis;
        sim.basis(b);
        const pose = this.seated.view.pose;
        const py = sim.leanPivotY;
        const pv = this.leanP.set(pose.x + b[3] * py - o.x, pose.y + b[4] * py - o.y, pose.z + b[5] * py - o.z);
        this.qa.setFromAxisAngle(this.leanAxis.set(b[0], b[1], b[2]), sim.lean);
        cam.position.sub(pv).applyQuaternion(this.qa).add(pv);
        cam.quaternion.premultiply(this.qa);
      }
      if (Math.abs(cam.fov - this.rig.fov) > 0.01) {
        cam.fov = this.rig.fov;
        cam.updateProjectionMatrix();
      }
      this.chaseInit = false;
    } else {
      // on foot, first person
      const w = this.player.walker;
      const e = w.eye(this.eyeP);
      cam.position.set(e.x - o.x, e.y - o.y, e.z - o.z);
      this.qa.setFromAxisAngle(Y, -w.heading);
      this.qb.setFromAxisAngle(Z, w.pitch);
      cam.quaternion.copy(this.qa).multiply(this.qb).multiply(QFIX);
      if (Math.abs(cam.fov - 68) > 0.01) {
        cam.fov = 68;
        cam.updateProjectionMatrix();
      }
    }
    // the thing in the hands, on foot in first person
    this.heldThing.set(this.player.held);
    this.heldThing.update(dt, cam, !this.seated && this.viewMode !== 'orbit', this.player.walker.sway, 0);
    // in the seat: the mark on the cab's controls (the one it is on lights up)
    if (this.seated) {
      this.cockpit.update(dt, this.seated, cam, this.viewMode === 'cockpit');
      // (a small control lights up under the mark; the wheel one looks through, and a door, do not)
      const a = this.cockpit.aimed;
      this.seated.view.highlight(a && a.cat !== 'steering' && a.cat !== 'door' ? a.id : null);
    }
    this.updateBeam();
    // shadows round the vehicle in focus (or the walker)
    core.shadowFocus.set(fx - o.x, fy - o.y, fz - o.z);
    // in the workshop the fine map goes where one looks (the sun's patches through the windows stay crisp)
    if (this.garage?.shadowFocus && !this.seated) {
      const w = this.player.walker;
      this.garage.shadowFocus(w.x, w.z, w.heading, core.shadowFocus);
      core.shadowFocus.x -= o.x;
      core.shadowFocus.z -= o.z;
      core.shadowFocus.y -= o.y;
    }
    if (this.worldView) this.worldView.update(fx, fz, 3.5);
    // biome and light
    const bl = this.bl;
    if (this.world) {
      this.world.spine.project(fx, fz, NaN, this.pr);
      this.world.spine.biomeAt(this.pr.s, bl);
      this.landmarks?.update(this.pr.s, fx, fz);
    } else {
      bl.a = bl.b = 0;
      bl.t = 0;
    }
    this.env.camX = cam.position.x + o.x;
    this.env.camZ = cam.position.z + o.z;
    const sim = f?.sim;
    this.env.update(dt, this.time, bl.a, bl.b, bl.t, this.world, sim?.vx ?? 0, sim?.vy ?? 0, sim?.vz ?? 0);
    // indoors the eye opens up
    if (this.garage) core.exposure *= this.garage.exposureAt(cam.position.x + o.x, cam.position.y + o.y, cam.position.z + o.z);
    this.ui.update(dt);
    this.updateHudBits();
    this.updateAudio();
  }

  /**
   * The headlight beam that lights the road and everything else (one, like the old vehicles'): from
   * between the lamps that are fitted, as bright as they are, and only with the switch on and a battery.
   */
  private updateBeam(): void {
    const v = this.seated ?? this.focus;
    const o = this.core.origin;
    const u = globals;
    // the cars' reflections show the ground they stand on
    if (this.place === 'garage') carEnvUniforms.uCarGround.value.setRGB(0.3, 0.29, 0.27);
    else carEnvUniforms.uCarGround.value.setRGB(0.2, 0.21, 0.19);
    if (!v || !v.sys.dash.lightsOn) {
      u.uHeadColor.value.setRGB(0, 0, 0);
      return;
    }
    let light = 0;
    let n = 0;
    let lx = 0;
    let ly = 0;
    for (const m of v.view.frame.mounts) {
      if (m.cat !== 'headlight') continue;
      const inst = v.build.parts[m.id];
      if (!inst) continue;
      const def = partDef(inst.part);
      // (a lamp smashed in a crash gives no light; a worn one less)
      const w = inst.cond < 0.15 ? 0 : (def.lamp?.light ?? 1) * Math.max(0.3, inst.cond);
      light += w;
      lx += m.pos.x * w;
      ly += m.pos.y * w;
      n += w;
    }
    // a light bar on the roof comes on with the high beam: more light, from higher up
    const roofM = v.view.frame.mounts.find((m) => m.cat === 'roof' && v.build.parts[m.id]);
    const roof = roofM ? partDef(v.build.parts[roofM.id].part).roof : undefined;
    if (roofM && roof?.lightW && v.sys.dash.lights === 'high') {
      const w = (roof.lightW / 100) * Math.max(0.3, v.build.parts[roofM.id].cond);
      light += w;
      lx += (roofM.pos.x + 0.5) * w;
      ly += (roofM.pos.y + 0.2) * w;
      n += w;
    }
    if (n <= 0) {
      u.uHeadColor.value.setRGB(0, 0, 0);
      return;
    }
    const sim = v.sim;
    const b = this.basis;
    sim.basis(b);
    // lamp positions are in the frame's model space (origin on the ground): to the body frame (centre of gravity)
    const cg = v.sys.derived.cg;
    const bx = lx / n - cg.x;
    const by = ly / n - cg.y;
    const pose = v.view.pose;
    u.uHeadPos.value.set(pose.x + b[0] * bx + b[3] * by - o.x, pose.y + b[1] * bx + b[4] * by - o.y, pose.z + b[2] * bx + b[5] * by - o.z);
    u.uHeadDir.value.set(b[0] - b[3] * 0.1, b[1] - b[4] * 0.1, b[2] - b[5] * 0.1).normalize();
    // a pair of stock lamps = the old vehicles' beam; one lamp, weak lamps or a flat battery give less
    const k = Math.min(3, light / 2) * (v.sys.dash.lights === 'high' ? 1.25 : 1) * Math.min(1, v.sys.dash.battery * 4 + (v.sys.running ? 1 : 0));
    u.uHeadColor.value.setRGB(1.0, 0.82, 0.55).multiplyScalar(2.4 * k);
  }

  private updateHudBits(): void {
    const v = this.seated;
    if (v) {
      const d = v.sys.dash;
      const red = v.sim.spec.engine.redline;
      this.ui.showDash({
        kmh: d.kmh,
        gear: d.gearLabel,
        rpm: red > 0 ? d.rpm / red : 0,
        rpmText: `${(d.rpm / 1000).toFixed(1)}k`,
        fuel: d.fuel,
        temp: (d.coolantC - 40) / 90,
        tempText: `${d.coolantC.toFixed(0)}°`,
        battery: d.battery,
        running: d.running,
        handbrake: d.handbrake,
        lights: d.lights,
        warn: d.lamps,
      });
      if (d.message) this.ui.say(d.message.text.zh, 2);
    } else this.ui.showDash(null);
    if (this.place === 'garage' && this.vehicles[0] && this.assists.guide) {
      const steps = this.tutorialSteps();
      const now = steps.findIndex((s) => !s.done);
      this.ui.showList('让「方糖」跑起来', steps.map((s, i) => ({ text: s.text, done: s.done, now: i === now })));
    } else this.ui.showList(null, []);
    this.ui.showPause(!this.params.shot && !this.input.locked && !this.ui.helpShown && !this.dev?.open);
    this.updateMarker();
  }

  /** where the checklist's next step is (world coordinates) and what to call it; null = nowhere to point */
  objective(): { x: number; y: number; z: number; text: string } | null {
    if (!this.assists.guide) return null;
    const v = this.vehicles[0];
    if (this.place !== 'garage' || !v || !this.garage) return null;
    const step = this.tutorialSteps().find((st) => !st.done);
    if (!step) return null;
    const held = this.player.held;
    const holding = (id: string): boolean => (held?.kind === 'part' && held.inst.part === id) || (held?.kind === 'tool' && `tool:${held.tool.kind}` === id);
    const lying = (id: string, text: string): { x: number; y: number; z: number; text: string } | null => {
      const l = this.loose.list.find((x) => x.part?.part === id || (x.tool && `tool:${x.tool.kind}` === id && (x.tool.kind !== 'jerrycan' || x.tool.fuel === 'petrol')));
      return l ? { x: l.x, y: l.y + l.mid + l.radius + 0.25, z: l.z, text } : null;
    };
    const at = (mount: string, text: string, up = 0.35): { x: number; y: number; z: number; text: string } | null => {
      const n = v.view.mountNode(mount);
      if (!n) return null;
      n.updateWorldMatrix(true, false);
      const p = n.getWorldPosition(new THREE.Vector3());
      const o = this.core.origin;
      return { x: p.x + o.x, y: p.y + o.y + up, z: p.z + o.z, text };
    };
    const b = v.build.parts;
    switch (step.id) {
      case 'hood':
      case 'shut': {
        // (shut: on top towards its front edge; standing open: on its middle)
        const open = v.view.panelBox('hood');
        const p = v.view.panelOpen('hood') > 0.5 && open ? open.getCenter(this.markerV) : v.view.panelGrip('hood', this.markerV);
        const o = this.core.origin;
        const text = step.id === 'hood' ? '打开引擎盖' : '关上引擎盖';
        return p ? { x: p.x + o.x, y: p.y + o.y + 0.22, z: p.z + o.z, text } : at('hood', text, 0.25);
      }
      case 'battery':
        return holding('bat_std') ? at('battery', '电瓶装这里') : lying('bat_std', '电瓶');
      case 'wheels': {
        const hub = !b.hub_FL ? 'hub_FL' : 'hub_RR';
        return holding('rim_steel13') ? at(hub, '车轮装这里', 0.5) : lying('rim_steel13', '车轮');
      }
      case 'engine':
        return holding('eng_i4') ? at('engine', '发动机装这里', 0.6) : lying('eng_i4', '发动机');
      case 'fuel':
        if (held?.kind === 'tool' && held.tool.kind === 'jerrycan' && held.tool.fuel === 'petrol') return at('fuelTank', '加油口', 0.5);
        return lying('tool:jerrycan', '油桶（汽油）');
      case 'door': {
        const d = this.devices.find((x) => x.id === 'door');
        return d ? { x: d.x, y: d.y + 0.3, z: d.z, text: '大门按钮' } : null;
      }
      case 'seat': {
        const seat = v.view.frame.mounts.find((m) => m.driver);
        return seat ? at(seat.id, '上车', 0.9) : null;
      }
      case 'start':
        return null;
      case 'drive': {
        const g = this.garage;
        return { x: g.exitX - 4, y: 1.6, z: g.carSpot.z, text: '开出去' };
      }
    }
    return null;
  }

  private readonly markerV = new THREE.Vector3();
  private readonly leanP = new THREE.Vector3();
  private readonly leanAxis = new THREE.Vector3();
  /** the objective's diamond on screen (at the edge on its side when it is off screen) */
  private updateMarker(): void {
    const t = this.objective();
    if (!t) {
      this.ui.showMarker(null);
      return;
    }
    const cam = this.core.camera;
    const o = this.core.origin;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const p = this.markerV.set(t.x - o.x, t.y - o.y, t.z - o.z);
    cam.updateMatrixWorld();
    p.applyMatrix4(cam.matrixWorldInverse);
    const behind = p.z > -0.1;
    p.applyMatrix4(cam.projectionMatrix);
    let sx = (p.x * 0.5 + 0.5) * w;
    let sy = (-p.y * 0.5 + 0.5) * h;
    const edge = behind || sx < 24 || sx > w - 24 || sy < 40 || sy > h - 24;
    if (behind) {
      // behind: at the side it is on, halfway up
      sx = p.x > 0 ? 24 : w - 24;
      sy = h * 0.5;
    }
    if (edge) {
      sx = Math.min(w - 24, Math.max(24, sx));
      sy = Math.min(h - 24, Math.max(40, sy));
    }
    // close by and in the middle of the view: the mark's own words say it all
    const near = Math.hypot(t.x - this.player.walker.x, t.z - this.player.walker.z) < 1.4 && !this.seated;
    // behind a wall (or the doors) from here: faint, without its words
    const eye = cam.getWorldPosition(this.eyeV);
    this.markerHidden = this.blockedBetween(eye.x + o.x, eye.y + o.y, eye.z + o.z, t.x, t.y, t.z, this.markerHidden);
    this.ui.showMarker(near ? null : { x: sx, y: sy, text: this.markerHidden ? '' : t.text, edge, dim: this.markerHidden });
  }

  private markerHidden = false;
  private readonly eyeV = new THREE.Vector3();
  private markerAsk = 0;
  private readonly solidsTmp: Solid[] = [];
  /**
   * Whether the workshop's walls stand between two points (world); asked a few times a second, the last
   * answer kept in between. (The cars do not hide a mark: it is on them.)
   */
  private blockedBetween(ax: number, ay: number, az: number, bx: number, by: number, bz: number, was: boolean): boolean {
    if (!this.garage || --this.markerAsk > 0) return was;
    this.markerAsk = 6;
    const out = this.solidsTmp;
    out.length = 0;
    const len = Math.hypot(bx - ax, bz - az);
    this.garage.solids.solidsNear((ax + bx) / 2, (az + bz) / 2, len / 2 + 0.5, out);
    for (const s of out) {
      // into the box's own frame (along its heading, across it)
      const c = Math.cos(s.yaw);
      const n = Math.sin(s.yaw);
      const hx = s.hx;
      const hz = s.round ? s.hx : s.hz;
      const lx = (x: number, z: number): number => (x - s.x) * c + (z - s.z) * n;
      const lz = (x: number, z: number): number => -(x - s.x) * n + (z - s.z) * c;
      const a = [lx(ax, az), ay, lz(ax, az)];
      const b = [lx(bx, bz), by, lz(bx, bz)];
      const lo = [-hx, s.y0, -hz];
      const hi = [hx, s.y1, hz];
      // (the mark itself inside something, or the eye: no wall between)
      const inside = (p: number[]): boolean => p.every((v, i) => v >= lo[i] && v <= hi[i]);
      if (inside(a) || inside(b)) continue;
      let t0 = 0;
      let t1 = 1;
      let hit = true;
      for (let i = 0; i < 3 && hit; i++) {
        const d = b[i] - a[i];
        if (Math.abs(d) < 1e-9) {
          if (a[i] < lo[i] || a[i] > hi[i]) hit = false;
          continue;
        }
        let u0 = (lo[i] - a[i]) / d;
        let u1 = (hi[i] - a[i]) / d;
        if (u0 > u1) [u0, u1] = [u1, u0];
        t0 = Math.max(t0, u0);
        t1 = Math.min(t1, u1);
        if (t0 > t1) hit = false;
      }
      if (hit) return true;
    }
    return false;
  }

  private updateAudio(): void {
    this.sounds();
    this.updateFoley();
    this.updateEngineVoice();
    this.updateRadio();
    const v = this.focus;
    if (!v) return;
    const sim = v.sim;
    const d = v.sys.dash;
    let slip = 0;
    let rough = 0;
    for (const wh of sim.wheels) {
      if (wh.util > slip) slip = wh.util;
      if (wh.contact) rough = Math.max(rough, SURFACES[wh.surface].rough);
    }
    // a bare rim grinding on the road and a hub or the body dragging on it screech like a skid
    const grind = Math.min(1, (sim.feel.rim ?? 0) / 8 + (sim.feel.scrape ?? 0) / 4);
    if (grind > slip) slip = grind;
    // a flat tyre flaps
    const flat = sim.speed > 0.5 && Object.values(v.build.parts).some((p) => !!p.sub.tire?.flat);
    const w = this.env.state;
    const eng = v.sys.derived.engine?.engine;
    this.audio.update(
      {
        rpm: d.rpm,
        idleRpm: sim.spec.engine.idle,
        redline: sim.spec.engine.redline,
        cylinders: eng?.cylinders ?? 4,
        throttle: sim.throttle,
        speed: sim.speed,
        slip,
        rough,
        rain: w.rain,
        hail: w.hail,
        snow: w.snow,
        dust: w.dust,
        wind: w.wind,
        enclosed: this.seated ? v.sys.derived.enclosed : 0,
        // (the engine and its starter are the EngineVoice's)
        engineOn: false,
        cranking: false,
        starterRate: Math.min(1, d.battery * 2),
        shifting: sim.shiftTimer > 0 ? sim.shiftTimer / Math.max(0.05, sim.spec.gearbox.shiftTime) : 0,
        thump: sim.feel.thump,
        suspension: sim.feel.suspRms,
        buzz: sim.feel.buzz,
        flat,
        horn: false,
        hornDetune: false,
      },
      this.env.flash,
    );
  }

  render(): void {
    if (this.env.shotMode) this.env.prepareShot();
    this.core.render(this.time);
  }

  frame(dt: number): void {
    this.step(dt);
    this.render();
    this.hud.update(dt, () => {
      const st = this.core.stats;
      return `${this.place}  ${st.calls} 次绘制  ${(st.triangles / 1000).toFixed(0)}k 三角形`;
    });
  }

  /** fixed steps without drawing (the screenshot harness) */
  simulate(seconds: number): void {
    const n = Math.max(1, Math.round(seconds * 60));
    const dt = seconds / n;
    for (let i = 0; i < n; i++) this.step(dt, 1);
    if (seconds === 0) this.step(0, 1);
  }

  telemetry(): Record<string, unknown> {
    const st = this.core.stats;
    const v = this.seated ?? this.focus;
    return {
      place: this.place,
      seated: !!this.seated,
      calls: st.calls,
      triangles: st.triangles,
      programs: st.programs,
      kmh: v?.sim.kmh ?? 0,
      exploded: this.vehicles.some((x) => x.sim.exploded),
      vehicles: this.vehicles.map((x) => ({ frame: x.build.frame, parts: Object.keys(x.build.parts).length, running: x.sys.running, x: x.sim.px, z: x.sim.pz })),
      loose: this.loose.list.length,
      tutorial: this.tutorialSteps().map((s) => (s.done ? 1 : 0)).join(''),
      steps: this.tutorialSteps().filter((s) => s.done).map((s) => s.id),
      ...(this.garage?.telemetry() ?? {}),
      ...this.player.telemetry(),
    };
  }
}

export { partDef };
