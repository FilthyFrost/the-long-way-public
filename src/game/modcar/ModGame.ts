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
import { decodeBuild, newInstance, fitSub, stockBuild } from '../../core/modcar/build';
import { partDef, PARTS } from '../../core/modcar/parts';
import { newTool } from '../../core/modcar/tools';
import type { Build } from '../../core/modcar/types';
import { GroundLand } from '../../core/onfoot/land';
import { SpineSample } from '../../core/world/spine';
import { BiomeBlend } from '../../core/world/spine';
import { World } from '../../core/world/terrain';
import { GroundSample, SURFACES, type Ground } from '../../core/world/ground';
import { AudioEngine } from '../audio';
import { Environment } from '../env/environment';
import { Hud } from '../hud';
import { InputManager } from '../input';
import type { Params } from '../params';
import { carEnvUniforms } from '../render/carMaterials';
import { RenderCore } from '../render/core';
import { globals } from '../render/shaderlib';
import { LandmarkView } from '../scene/landmarks';
import { WorldView } from '../scene/worldView';
import { BeaconView } from '../scene/beacons';
import { preload } from './assets';
import { buildGarage } from './garage';
import { buildGarageStub, type GarageContext, type GarageDevice, type GarageScene } from './garageStub';
import { EngineVoice } from './engineAudio';
import { Foley, type FoleyLoop, type FoleyOpts, type FoleyShot, type PanelMaterial } from './foley';
import { ASSIST_LABELS, loadAssists, saveAssists, type Assists } from './assists';
import { HeldThing } from './held';
import { Sparks } from './sparks';
import { LooseThings } from './loose';
import { CarMaterials } from './materials';
import { ModPlayer, type PlayerHost } from './player';
import { Cockpit, type CockpitHost } from './cockpit';
import { ModUI } from './ui';
import { ModVehicle } from './vehicle';
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

export class ModGame implements PlayerHost, CockpitHost {
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
  ) {
    this.core = new RenderCore(canvas, params.quality);
    this.core.usePost = params.post;
    this.viewMode = params.view === 'chase' ? 'chase' : params.view === 'orbit' ? 'orbit' : 'cockpit';
    // (ModUI shows this game's own key card)
    this.hud = new Hud(params.hud, '');
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
    this.heldThing = new HeldThing(this.core);
    this.sparks = new Sparks(this.core);
    const land = this.garage ? this.garage.land : new GroundLand(this.world!);
    this.player = new ModPlayer(this.world ?? land, this);
    if (this.garage) this.player.addSolids(this.garage.solids);
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
      this.player.walker.place(g.spawn.x, g.spawn.z, g.spawn.heading);
      this.input.lookYaw = g.spawn.heading;
    } else {
      const b = decodeBuild(p.build, { fuel: 0.7 });
      const v = this.placeOnRoad(b, p.s);
      v.sys.startNow();
      this.seated = v;
      this.focus = v;
    }
    await Promise.all([...this.vehicles.map((v) => v.view.settled()), this.loose.settled()]);
  }

  addVehicle(build: Build, x: number, z: number, yaw: number): ModVehicle {
    const gy = this.groundAt(x, z);
    const v = new ModVehicle(this.core, build, x, gy + 0.05, z, yaw, this.ground);
    this.vehicles.push(v);
    this.player.addSolids(v.solid);
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
    canvas.addEventListener('wheel', (e) => this.player.wheel(e.deltaY));
    window.addEventListener('keydown', () => this.audio.start(), { once: true });
    // the key card: at the start until the first click, and on F1 any time
    if (!this.params.shot) this.ui.showHelp(true);
    window.addEventListener('keydown', (e) => {
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
    this.input.lookPitch = 0;
    this.rig.reset();
    this.sound('door_close');
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
    this.sound('door_close');
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
  private readonly lastGear: { v: ModVehicle | null; gear: number } = { v: null, gear: 0 };

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
    const d = (this.seated ?? this.focus)?.sys.dash;
    const want = d?.horn ? (d.hornSound === 'trumpet' ? 'horn_trumpet' : d.hornSound === 'air' ? 'horn_air' : 'horn_beep') : '';
    if (want !== this.hornOn) {
      if (this.hornOn) f.horn(this.hornOn, false);
      if (want) f.horn(want, true);
      this.hornOn = want;
    }
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
    if (this.seated === v) this.done.add('seat');
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
    }
    this.loose.update(dt);
    this.throwSparks(dt);
    this.checkTutorial();
    if (this.garage) this.garage.update(dt, this.garageContext());
    this.leaveGarage(dt);
    this.updateViews(dt, alpha);
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
      const due = (this.sparkDue.get(v) ?? 0) + dt * 70 * Math.min(1, scrape / 8);
      const n = Math.floor(due);
      this.sparkDue.set(v, due - n);
      if (!n) continue;
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
      this.garage = null;
      for (const l of [...this.loose.list]) this.loose.remove(l);
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
      this.seated.view.highlight(this.cockpit.aimed?.id ?? null);
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
      light += (def.lamp?.light ?? 1) * Math.max(0.3, inst.cond);
      lx += m.pos.x;
      ly += m.pos.y;
      n++;
    }
    if (!n) {
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
    const k = Math.min(2.2, light / 2) * (v.sys.dash.lights === 'high' ? 1.25 : 1) * Math.min(1, v.sys.dash.battery * 4 + (v.sys.running ? 1 : 0));
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
    this.ui.showPause(!this.params.shot && !this.input.locked && !this.ui.helpShown);
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
        return at('hood', '打开引擎盖', 0.25);
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
    this.ui.showMarker(near ? null : { x: sx, y: sy, text: t.text, edge });
  }

  private updateAudio(): void {
    this.sounds();
    this.updateFoley();
    this.updateEngineVoice();
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
