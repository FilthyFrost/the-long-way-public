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
import { RenderCore } from '../render/core';
import { LandmarkView } from '../scene/landmarks';
import { WorldView } from '../scene/worldView';
import { BeaconView } from '../scene/beacons';
import { preload } from './assets';
import { buildGarageStub, type GarageDevice, type GarageScene } from './garageStub';
import { LooseThings } from './loose';
import { CarMaterials } from './materials';
import { ModPlayer, type PlayerHost } from './player';
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
}

export function readModParams(base: Params, search: string = window.location.search): ModParams {
  const q = new URLSearchParams(search);
  const start = q.get('start') === 'road' ? 'road' : 'garage';
  return {
    ...base,
    start,
    build: q.get('build') ?? 'stock:sedan',
    project: q.get('project') === 'full' ? 'full' : 'tutorial',
    time: Number.isFinite(base.time) ? base.time : start === 'garage' ? 9.2 : base.time,
    weather: base.weather === 'auto' && start === 'garage' ? 'clear' : base.weather,
  };
}

/** what the first project car is missing: the things the checklist asks for, in order */
export const TUTORIAL_MISSING = ['battery', 'hub_FL', 'hub_RR', 'engine'] as const;

export class ModGame implements PlayerHost {
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
    this.hud = new Hud(params.hud);
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
      this.garage = buildGarageStub(this.core);
      this.ground = this.garage.ground;
    } else {
      this.makeWorld();
      this.ground = this.world!;
    }
    this.loose = new LooseThings(this.core, this.mats, (x, z, fromY) => (this.garage ? this.garage.surfaceAt(x, z, fromY) : this.groundAt(x, z)));
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
      await preload(PARTS.map((x) => x.id));
      const project = p.project === 'full' ? stockBuild('sedan', { fuel: 0.05 }) : stockBuild('sedan', { fuel: 0, without: [...TUTORIAL_MISSING] });
      const v = this.addVehicle(project, g.carSpot.x, g.carSpot.z, g.carSpot.yaw);
      this.focus = v;
      // the missing parts and the tools, round the bay; the fun parts on the shelves
      const spots = [...g.spots];
      const take = (where: string): (typeof spots)[number] => {
        const i = spots.findIndex((s) => s.where === where);
        return spots.splice(i >= 0 ? i : 0, 1)[0];
      };
      const put = (id: string, where: 'floor' | 'bench' | 'shelf', withTyre = ''): void => {
        const s = take(where);
        const inst = newInstance(id, { charge: 0.85 });
        if (withTyre) fitSub(inst, 'tire', newInstance(withTyre));
        this.loose.addPart(inst, s.x, s.y + 0.4, s.z, s.yaw);
      };
      if (p.project === 'tutorial') {
        put('bat_std', 'bench');
        put('rim_steel13', 'floor', 'tire_road');
        put('rim_steel13', 'floor', 'tire_road');
        put('eng_i4', 'floor');
      }
      const tools = [newTool('jerrycan', { fuel: 'petrol', litres: 20 }), newTool('jerrycan', { fuel: 'diesel', litres: 20 }), newTool('bottle'), newTool('oilcan'), newTool('spray', { colour: 13 }), newTool('spray', { colour: 4 }), newTool('sponge')];
      for (const t of tools) {
        const s = take('bench');
        this.loose.addTool(t, s.x, s.y + 0.3, s.z, s.yaw);
      }
      for (const id of ['eng_v8', 'seat_toilet', 'steer_ship', 'turbo_small', 'hl_spot', 'horn_trumpet', 'seat_race', 'steer_sport', 'roof_spikes', 'exh_side', 'gb_5', 'hb_drift']) put(id, 'shelf');
      for (const id of ['bf_ram', 'seat_armchair', 'tank_drum', 'eng_flat6']) put(id, 'floor');
      put('rim_off16', 'floor', 'tire_tractor');
      put('rim_off16', 'floor', 'tire_tractor');
      put('rim_cart', 'floor');
      put('rim_cart', 'floor');
      // a second frame to take parts from
      const donor = stockBuild('pickup', { fuel: 0.3 });
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
    const v = new ModVehicle(this.core, build, x, gy + 0.05, z, yaw);
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
      if (e.button === 0) this.player.press();
      if (e.button === 2) this.player.secondary = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.player.release();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => this.player.wheel(e.deltaY));
    window.addEventListener('keydown', () => this.audio.start(), { once: true });
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
        this.audio.oneShot('key');
      } else if (a === 'lights') {
        v.sys.cycleLights();
        this.audio.oneShot('key');
      } else if (a === 'horn') v.sys.setHorn(true);
      else if (a === 'leverUp' || a === 'leverDown') this.audio.oneShot(v.sys.stepLever(a === 'leverUp' ? -1 : 1) ? 'lever' : 'grind');
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

  // ------------------------------------------------------------------ getting in and out

  enter(v: ModVehicle): void {
    const seat = v.view.frame.mounts.find((m) => m.driver);
    if (!seat || !v.build.parts[seat.id]) {
      this.ui.say('驾驶位没有座椅，坐不进去。');
      return;
    }
    if (this.player.held) this.player.putDown();
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

  sound(name: string, gain = 1): void {
    const map: Record<string, string> = { ratchet_done: 'ratchet', door_open: 'lever', door_close: 'lever', pickup: 'key', putdown: 'key' };
    const s = map[name];
    if (s) this.audio.oneShot(s as never);
    void gain;
  }

  // ------------------------------------------------------------------ the checklist

  tutorialSteps(): { id: string; text: string; done: boolean }[] {
    const v = this.vehicles[0];
    if (!v) return [];
    const b = v.build;
    const fuel = v.sys.dash.tankL > 0 ? v.sys.dash.fuel : 0;
    return [
      { id: 'battery', text: '装上电瓶', done: !!b.parts.battery },
      { id: 'wheels', text: '装上两个车轮', done: !!b.parts.hub_FL && !!b.parts.hub_RR },
      { id: 'engine', text: '装上发动机', done: !!b.parts.engine },
      { id: 'fuel', text: '用油桶加油', done: fuel > 0.04 },
      { id: 'seat', text: '坐进驾驶座', done: this.seated === v || this.done.has('seat') },
      { id: 'start', text: '按住 K 打火', done: v.sys.running || this.done.has('start') },
      { id: 'drive', text: '松手刹，开出车库', done: this.place === 'road' },
    ];
  }

  private checkTutorial(): void {
    const v = this.vehicles[0];
    if (!v) return;
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
      // seated: the workbench words go away (the dash line shows instead)
      this.ui.prompt(false, '', -1);
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
    this.checkTutorial();
    this.garage?.update(dt);
    this.leaveGarage(dt);
    this.updateViews(dt, alpha);
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
    for (const v of this.vehicles) v.view.update(dt, v.sim, v.sys.dash, core, v === this.seated ? alpha : 1);
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
    // shadows round the vehicle in focus (or the walker)
    core.shadowFocus.set(fx - o.x, fy - o.y, fz - o.z);
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
    this.ui.update(dt);
    this.updateHudBits();
    this.updateAudio();
  }

  private updateHudBits(): void {
    const v = this.seated;
    if (v) {
      const d = v.sys.dash;
      this.ui.showDash(`${d.kmh.toFixed(0).padStart(3)} km/h  ${d.gearLabel}${d.handbrake ? ' 手刹' : ''}  ${d.rpm.toFixed(0)} rpm  油 ${(d.fuel * 100).toFixed(0)}%  水温 ${d.coolantC.toFixed(0)}°C  电 ${(d.battery * 100).toFixed(0)}%${d.running ? '' : '  熄火'}`);
      if (d.message) this.ui.say(d.message.text.zh, 2);
    } else this.ui.showDash(null);
    if (this.place === 'garage' && this.vehicles[0]) {
      const steps = this.tutorialSteps();
      const now = steps.findIndex((s) => !s.done);
      this.ui.showList('让「方糖」跑起来', steps.map((s, i) => ({ text: s.text, done: s.done, now: i === now })));
    } else this.ui.showList(null, []);
  }

  private updateAudio(): void {
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
        engineOn: d.running,
        cranking: d.cranking,
        starterRate: Math.min(1, d.battery * 2),
        shifting: sim.shiftTimer > 0 ? sim.shiftTimer / Math.max(0.05, sim.spec.gearbox.shiftTime) : 0,
        thump: sim.feel.thump,
        suspension: sim.feel.suspRms,
        buzz: sim.feel.buzz,
        flat: false,
        horn: d.horn,
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
      ...this.player.telemetry(),
    };
  }
}

export { partDef };
