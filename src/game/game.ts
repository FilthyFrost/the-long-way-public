/**
 * Game: owns the simulation, the views and the frame loop.
 * Simulation always advances in fixed steps; rendering is separate, so the same class serves
 * the live game, deterministic screenshots and the benchmark.
 */
import * as THREE from 'three';
import { FirstPersonRig } from '../core/camera/rig';
import { autopilotFor } from '../core/driver/autopilot';
import { EYE_HEIGHT, Walker } from '../core/onboard/walker';
import { RobotDriver, StraightPath, type DrivePath } from '../core/driver/robot';
import { VehicleSim, type VehicleInput } from '../core/vehicle/sim';
import type { Solid } from '../core/world/solids';
import { CarPlaces } from './systems/carPlaces';
import { stockState, VehicleSystems, type SlotId } from '../core/vehicle/systems';
import type { Ground } from '../core/world/ground';
import { GroundSample } from '../core/world/ground';
import { BIOMES } from '../core/world/biomes';
import { BiomeBlend, SpineSample } from '../core/world/spine';
import { World } from '../core/world/terrain';
import { WorldView } from './scene/worldView';
import { BeaconView } from './scene/beacons';
import { LandmarkView } from './scene/landmarks';
import { Environment } from './env/environment';
import { AudioEngine } from './audio';
import { SURFACES } from '../core/world/ground';
import type { WeatherKind } from '../core/env/weather';
import { Hud } from './hud';
import { InputManager } from './input';
import type { Params } from './params';
import { RenderCore } from './render/core';
import { ProvingGround } from './scene/provingGround';
import type { VehicleViewpoint } from './vehicle/kit';
import { vehicleSpecFor } from './vehicle/models';
import { VehicleView } from './vehicle/view';
import { Player } from './player/player'; // player
import { CabControls } from './vehicle/controls'; // cab controls
import { Fauna, type Threat } from '../core/world/fauna'; // world: the animals at the places by the road
import { TerrainPoint } from '../core/world/terrain'; // world
import { FaunaView } from './scene/faunaView'; // world
import { SiteThings } from './scene/siteThings'; // world: the places' containers, loose things and petrol

export type ViewMode = 'cockpit' | 'chase' | 'hood' | 'orbit';

/** converts the rig frame (+x forward, +z right) to a Three.js camera (−z forward, +x right) */
const QFIX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);

export class Game {
  readonly core: RenderCore;
  readonly sim: VehicleSim;
  /** parts, condition, fuel, battery, cooling, ignition, lights (docs/VEHICLE_SYSTEMS.md) */
  readonly systems: VehicleSystems;
  readonly view: VehicleView;
  /** player: getting out, walking, looking at things and using them */
  readonly player: Player;
  /** cab controls: levers, switches, doors, windows, the radio, the live dash */
  readonly cab: CabControls;
  /**
   * Told when the vehicle knocks a light solid aside (a crate, a barrel, a fence run): the solid, the
   * vehicle's velocity at the hit (world x, z, m/s) and the closing speed. The owner of the solid moves
   * it or lays it flat (vehicle systems).
   */
  /** vehicle systems: the wheels, the bonnet's parts, the arches, the mounts as places to work at */
  readonly carPlaces: CarPlaces;
  readonly knockListeners: ((s: Solid, vx: number, vz: number, speed: number) => void)[] = [];
  readonly rig = new FirstPersonRig();
  readonly input: InputManager;
  readonly hud: Hud;
  ground: Ground;
  path: DrivePath;
  proving: ProvingGround | null = null;
  world: World | null = null;
  worldView: WorldView | null = null;
  landmarks: LandmarkView | null = null;
  /** world: the lamps of the lighthouses */
  beacons: BeaconView | null = null;
  /** world: what the places by the road hand to the player; the animals that live at them */
  siteThings: SiteThings | null = null;
  fauna: Fauna | null = null;
  faunaView: FaunaView | null = null;
  /** world (debug, screenshots): the animals take no notice of anybody */
  tame = false;
  private readonly threats: Threat[] = [
    { x: 0, z: 0, heard: 0, seen: 0 },
    { x: 0, z: 0, heard: 0, seen: 0 },
  ];
  readonly env: Environment;
  readonly audio = new AudioEngine();
  /** null = lights follow the daylight; true/false = the driver's choice */
  lightsManual: boolean | null = null;
  private readonly bl = new BiomeBlend();
  private readonly pr = { s: 0, d: 0 };
  private sHint = NaN;
  /** lane the robot keeps and the player starts in (m right of the centre line) */
  readonly lane = 1.6;
  viewMode: ViewMode;
  /** where the camera sits in the vehicle: a key of the vehicle's views; '' = the driver's seat */
  seat = '';
  /** the orbit camera round the vehicle: yaw and pitch (rad), distance (m), height looked at above the ground (m) */
  readonly orbit = { yaw: 0.6, pitch: 0.25, dist: 11, target: 1.3 };
  /** null = the cabin lamp comes on with the dark */
  cabinLightManual: boolean | null = null;
  /** up and about inside the vehicle (vehicles with a walk area): null = sitting */
  walker: Walker | null = null;
  /** nobody at the wheel and no robot: the vehicle is held with a gentle brake */
  static readonly IDLE_BRAKE = 0.25;
  private readonly idleInput: VehicleInput = { steer: 0, throttle: 0, brake: Game.IDLE_BRAKE, handbrake: 0 };
  robot: RobotDriver | null = null;
  /** seconds of simulated time */
  time = 0;
  private readonly chasePos = new THREE.Vector3();
  private chaseInit = false;
  private readonly gs = new GroundSample();
  private readonly basis = new Float64Array(9);
  private readonly tmp = new THREE.Vector3();

  constructor(
    canvas: HTMLCanvasElement,
    readonly params: Params,
  ) {
    this.core = new RenderCore(canvas, params.quality);
    this.core.usePost = params.post;
    this.viewMode = params.view;
    this.hud = new Hud(params.hud);
    this.input = new InputManager(canvas);

    const spec = vehicleSpecFor(params.vehicle);
    this.sim = new VehicleSim(spec);
    // the game starts with most of a tank and the worn starting conditions (the headless handling
    // tests keep an endless tank and no systems)
    this.systems = new VehicleSystems(spec, stockState(spec, params.seed));
    if (params.scene === 'world') {
      this.world = new World(params.seed, { chapterScale: params.chapter, startBiome: params.biome });
      this.ground = this.world;
      this.path = this.world.spine;
      this.worldView = new WorldView(this.core, this.world, this.core.quality);
      this.landmarks = new LandmarkView(this.core, this.world);
      this.beacons = new BeaconView(this.core, this.world);
      this.placeOnRoad(params.s);
    } else {
      this.proving = new ProvingGround(this.core);
      this.ground = this.proving.ground;
      this.path = new StraightPath();
      this.ground.sample(0, 0, this.gs);
      this.sim.reset(0, this.gs.h, 0, 0);
    }
    this.systems.bind(this.sim);
    this.view = new VehicleView(this.core, this.sim);
    this.player = new Player(this); // player
    this.cab = new CabControls(this); // cab controls
    this.player.interact.add(this.cab); // cab controls
    if (this.world) {
      // world: the places by the road come alive
      this.siteThings = new SiteThings(this.world, this.player);
      this.fauna = new Fauna(this.world, new TerrainPoint());
      this.faunaView = new FaunaView(this.core, this.fauna);
      this.tame = params.tame;
      // a car shoving a crate, a barrel, a board: the place moves it and is drawn again
      this.knockListeners.push((sd, vx, vz, speed) => {
        const site = this.world?.sites.knock(sd, vx, vz, speed);
        if (!site) return;
        this.siteThings?.moved(site);
        this.worldView?.redrawSite(site.id);
      });
      // … or a delineator or a chevron board at the road's edge: it lies where it fell
      this.knockListeners.push((sd, vx, vz) => {
        const at = this.world ? this.world.furniture.knock(sd, vx, vz) : NaN;
        if (at === at) this.worldView?.redrawFurniture(at);
      });
    }
    // vehicle systems: the places on the car where it is repaired and modified by hand (§7.3)
    this.carPlaces = new CarPlaces(this);
    this.player.interact.add(this.carPlaces);
    // the body keeps out of everything standing in the world (vehicle systems: docs/VEHICLE_SYSTEMS.md §4.7)
    this.sim.solids = this.player.solids;
    this.sim.onKnock = (sd, vx, vz, speed) => {
      for (const fn of this.knockListeners) fn(sd, vx, vz, speed);
    };
    this.orbit.yaw = (params.orbit[0] * Math.PI) / 180;
    this.orbit.pitch = (params.orbit[1] * Math.PI) / 180;
    this.orbit.dist = params.orbit[2];
    this.orbit.target = params.orbit[3];
    this.cabinLightManual = params.cabinLight;
    this.setSlots(params.slots);
    if (params.cutaway) this.view.setCutaway(true);
    if (params.camp) this.setCamp(true);
    if (params.seat) this.setSeat(params.seat);
    this.env = new Environment(this.core, params.seed, { hour: params.time, weather: params.weather, stage: params.wstage });
    this.env.shotMode = params.shot;
    this.applySystemsParams(params);
    if (params.auto) this.robot = this.makeRobot();

    this.input.onAction((a) => {
      this.hud.dismissHint();
      if (this.player.action(a)) return; // player: on-foot keys first
      if (a === 'reset') this.resetUpright();
      else if (a === 'camera') this.viewMode = this.viewMode === 'cockpit' ? 'chase' : 'cockpit';
      else if (a === 'lights') {
        this.lightsManual = null;
        this.systems.cycleLights();
        this.audio.oneShot('key');
      } else if (a === 'wipers') this.systems.cycleWipers();
      else if (a === 'horn') this.systems.setHorn(true);
      else if (a === 'hazard') this.systems.toggleHazard();
      else if (a === 'key') this.keyDown();
      else if (a === 'leverUp' || a === 'leverDown') this.lever(a === 'leverUp' ? -1 : 1);
      else if (a === 'manual') this.systems.toggleManual();
      else if (a === 'hud') this.hud.toggle();
      else if (a === 'robot') this.robot = this.robot ? null : this.makeRobot();
      else if (a === 'use') this.standOrSit();
      else if (a === 'camp') this.toggleCamp();
      else if (a.startsWith('seat')) this.jumpToSeat(Number(a.slice(4)));
    });
    this.input.onRelease((a) => {
      if (a === 'horn') this.systems.setHorn(false);
      else if (a === 'key') this.systems.crank(false);
    });
    canvas.addEventListener('click', () => {
      this.hud.dismissHint();
      this.audio.start();
    });
    window.addEventListener('keydown', () => this.audio.start(), { once: true });
    window.addEventListener('resize', () => this.core.resize(window.innerWidth, window.innerHeight));
  }

  // ------------------------------------------------------------------ the driver's controls

  /** K pressed: a running engine is switched off; otherwise the key turns and the starter runs while held */
  keyDown(): void {
    if (!this.atWheel()) return;
    this.audio.oneShot('key');
    if (this.systems.state.running) this.systems.stopEngine();
    else this.systems.crank(true);
  }

  /** Q / Z: the lever one notch (manual mode: a gear up / down) */
  lever(delta: number): boolean {
    if (!this.atWheel()) return false;
    const ok = this.systems.stepLever(delta);
    this.audio.oneShot(ok ? 'lever' : 'grind');
    return ok;
  }

  /** the player sits at the wheel (not another seat, not walking) */
  atWheel(): boolean {
    return !this.seat && !this.walker;
  }

  /** relaxed controls: leaving the wheel at a standstill puts the lever in P */
  private leftWheel(): void {
    if (this.systems.state.assist === 'relaxed' && this.sim.kmh < 3) this.sim.shift('P');
  }

  /** handbrake key: held = pulled; held for half a second at a standstill and let go = latched; a tap releases */
  private hbHeld = 0;
  private hbWasDown = false;
  private hbIgnore = false;
  private handbrakeKey(dt: number, down: boolean): number {
    const sim = this.sim;
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
  private readonly playerInput: VehicleInput = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };

  /** URL keys for the vehicle systems (screenshots and tests): docs/VEHICLE_SYSTEMS.md §11.3 */
  applySystemsParams(p: Params): void {
    const sys = this.systems;
    const sim = this.sim;
    if (p.assist === 'real' || p.assist === 'relaxed') sys.setAssist(p.assist);
    if (p.ignition === 'off' || p.ignition === 'acc' || p.ignition === 'on') sys.turnKey(p.ignition);
    if (p.engine === 'off') sys.turnKey('off');
    if (p.lightsw === 'off' || p.lightsw === 'auto' || p.lightsw === 'low' || p.lightsw === 'high') sys.setLights(p.lightsw);
    const g = p.gear.toUpperCase();
    if (g === 'P' || g === 'R' || g === 'N' || g === 'D') sim.shift(g);
    else if (/^M[1-6]$/.test(g)) {
      sim.shift('D');
      sim.setManual(true);
      sim.gear = Math.min(Number(g[1]), sim.spec.gearbox.ratios.length);
    }
    if (p.handbrake) sim.setParkBrake(true);
    if (p.sys) this.patchSystems(p.sys);
    sys.update(0, this.systemsEnv());
  }

  /** "fuel:0.1,battery:5,temp:115,flat:0,engine:30,quirks:1" — set parts of the state directly (debug) */
  patchSystems(spec: string): void {
    const s = this.systems.state;
    for (const kv of spec.split(',')) {
      const [k, raw] = kv.split(':');
      const v = Number(raw);
      if (!k || !Number.isFinite(v)) continue;
      if (k === 'fuel') s.fuelL = v * this.systems.tankL;
      else if (k === 'battery') s.battery = v;
      else if (k === 'temp') s.coolantC = v;
      else if (k === 'coolant') s.coolant = v;
      else if (k === 'flat') this.systems.puncture(v);
      else if (k === 'off' && s.wheels[v]) s.wheels[v].off = true; // a wheel taken off (screenshots)
      else if (k === 'tread') for (const w of s.wheels) w.tread = v;
      else if (k === 'quirks') {
        if (v > 0)
          for (const slot of ['engine', 'cooling', 'battery', 'suspension', 'brakes', 'body'] as SlotId[]) {
            const part = s.slots[slot];
            if (part) part.cond = Math.min(part.cond, 30);
          }
      } else {
        const part = s.slots[k as SlotId];
        if (part) part.cond = v;
      }
    }
    if (Number.isFinite(this.sim.fuelL)) this.sim.fuelL = s.fuelL;
    this.systems.applyMods();
  }

  systemsEnv(): { ambientC: number; dark: boolean; rain: number } {
    const e = this.env;
    return e ? { ambientC: e.state.temp, dark: e.dark, rain: e.state.rain } : { ambientC: 15, dark: false, rain: 0 };
  }

  /** hand the wheel to the robot driver (or take it back) */
  setRobot(on: boolean): void {
    this.robot = on ? (this.robot ?? this.makeRobot()) : null;
  }

  /** the seats one can take, in the order of the number keys: 1 = the driver */
  seatList(): string[] {
    const p = this.view.parts;
    const installed = new Set(p.slots.filter((s) => s.installed).map((s) => s.id));
    return ['driver', ...Object.entries(p.views).filter(([, v]) => v.seat && (!v.needs || installed.has(v.needs))).map(([k]) => k)];
  }

  /** number key n: straight to the n-th seat */
  jumpToSeat(n: number): void {
    const name = this.seatList()[n - 1];
    if (!name) return;
    this.setSeat(name);
  }

  /**
   * E: stand up from the seat into the nearest place one can stand, or sit down on the nearest seat
   * within 0.9 m (the driver's seat included).
   */
  standOrSit(): void {
    const p = this.view.parts;
    if (!p.walk) return;
    const w = this.walker;
    if (w) {
      const floor = w.floorAt(w.x, w.z);
      let best = '';
      let bd = 0.9;
      const eye = this.sim.spec.eye;
      const cands: [string, number, number, number][] = [['driver', eye.x, eye.y, eye.z]];
      for (const name of this.seatList().slice(1)) {
        const vp = p.views[name];
        this.seatEye(vp, this.seatTmp);
        cands.push([name, this.seatTmp.x, this.seatTmp.y, this.seatTmp.z]);
      }
      for (const [name, x, y, z] of cands) {
        const up = y - floor;
        if (up < 0.3 || up > 1.8) continue; // not from this floor (the roof deck is reached from outside)
        const d = Math.hypot(x - w.x, z - w.z);
        if (d <= bd) {
          bd = d;
          best = name;
        }
      }
      if (best) this.setSeat(best);
      return;
    }
    // stand up next to where one sat, facing the way one looked
    const vp = this.seat ? p.views[this.seat] : null;
    const e = this.sim.spec.eye;
    if (vp) this.seatEye(vp, this.seatTmp);
    const sx = vp ? this.seatTmp.x : e.x;
    const sz = vp ? this.seatTmp.z : e.z;
    const yaw = (vp ? this.seatTmp.yaw : 0) + this.input.lookYaw;
    if (!this.seat) this.leftWheel();
    const nw = new Walker(p.walk);
    nw.place(sx, sz, yaw);
    this.walker = nw;
    this.input.freeLook = true;
    this.input.lookYaw = yaw;
    this.input.lookPitch = 0;
  }

  /** sit (or stand, for pictures) at one of the vehicle's places; '' or 'driver' = the driver's seat */
  setSeat(name: string): boolean {
    if (this.walker) {
      this.walker = null;
      this.input.freeLook = false;
      this.input.lookYaw = 0;
      this.input.lookPitch = 0;
    }
    if (!name || name === 'driver') {
      this.seat = '';
      return true;
    }
    if (!this.seat) this.leftWheel();
    if (!this.view.parts.views[name]) {
      console.warn(`no seat "${name}" in ${this.sim.spec.id}`);
      return false;
    }
    this.seat = name;
    return true;
  }

  /** 'all' | 'none' | 'default' | comma list of slot ids */
  setSlots(mode: string): void {
    if (mode === 'all' || mode === 'none' || mode === 'default') this.view.setSlots(mode);
    else this.view.setSlots(mode.split(',').filter(Boolean));
  }

  /** parked and set up for the night: the vehicle's camp movers out (door and awning by default), or packed away */
  setCamp(on: boolean): void {
    for (const m of this.view.parts.camp ?? ['door', 'awning']) this.view.setMover(m, on ? 1 : 0);
  }

  /** O: set up camp once stopped, or pack up (any time) */
  toggleCamp(): void {
    const open = (this.view.parts.camp ?? ['door', 'awning']).some((m) => (this.view.moverState[m] ?? 0) > 0.5);
    if (open) this.setCamp(false);
    else if (this.sim.kmh < 1) this.setCamp(true);
  }

  /** the seat's eye in the body frame, turned with the seat when it swivels */
  private seatEye(vp: VehicleViewpoint, out: { x: number; y: number; z: number; yaw: number; pitch: number }): void {
    out.x = vp.x;
    out.y = vp.y;
    out.z = vp.z;
    out.yaw = vp.yaw;
    out.pitch = vp.pitch;
    if (vp.swivel) {
      const a = Math.PI * (this.view.moverState[vp.swivel.mover] ?? 0);
      const dx = vp.x - vp.swivel.x;
      const dz = vp.z - vp.swivel.z;
      // a turn about the vertical: +a turns the front (+x) toward −z, i.e. to the left
      out.x = vp.swivel.x + dx * Math.cos(a) + dz * Math.sin(a);
      out.z = vp.swivel.z - dx * Math.sin(a) + dz * Math.cos(a);
      out.yaw = vp.yaw - a;
    }
  }
  private readonly seatTmp = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };

  private makeRobot(): RobotDriver {
    // the autopilot drives off like a person would: engine on, D, handbrake down
    this.systems.startEngine();
    this.sim.shift('D');
    this.sim.setParkBrake(false);
    const ap = autopilotFor(this.sim.spec.id);
    const r = new RobotDriver({ cruise: ap.cruiseKmh / 3.6, lane: this.world ? this.lane : 0, latG: ap.latG });
    if (this.world) {
      const pr = { s: 0, d: 0 };
      this.world.spine.project(this.sim.px, this.sim.pz, NaN, pr);
      r.s = pr.s;
    }
    return r;
  }

  /** Park the vehicle in its lane at distance s along the road. */
  placeOnRoad(s: number): void {
    if (!this.world) return;
    const st = new SpineSample();
    this.world.spine.at(s, st);
    const x = st.x - Math.sin(st.phi) * this.lane;
    const z = st.z + Math.cos(st.phi) * this.lane;
    this.world.sample(x, z, this.gs);
    this.sim.reset(x, this.gs.h + 0.02, z, -st.phi);
    this.systems?.bind(this.sim);
    this.rig.reset();
    if (this.robot) this.robot.s = s;
    this.chaseInit = false;
  }

  /** debug: jump the clock / pin the weather */
  setHour(hour: number): void {
    this.env.clock.setHour(hour, this.time);
  }

  setWeather(kind: WeatherKind | null): void {
    this.env.weather.force = kind;
  }

  /** put the vehicle back on its wheels where it stands */
  resetUpright(): void {
    const s = this.sim;
    this.ground.sample(s.px, s.pz, this.gs);
    s.reset(s.px, this.gs.h + 0.15, s.pz, s.yaw);
    this.systems.bind(s);
    this.rig.reset();
  }

  private driverInput(dt: number): VehicleInput {
    if (this.robot) return this.robot.update(dt, this.sim, this.path);
    // nobody at the wheel: no throttle, a gentle brake
    if (this.seat || this.walker || this.player.onFoot) return this.idleInput; // player: nobody at the wheel
    const d = this.input.drive;
    const p = this.playerInput;
    p.steer = d.steer;
    p.throttle = d.throttle;
    p.brake = d.brake;
    p.handbrake = this.handbrakeKey(dt, d.handbrake > 0.5);
    // relaxed: pressing on with the engine off starts it (the key ritual plays by itself)
    const sys = this.systems;
    if (sys.state.assist === 'relaxed' && !sys.state.running && d.throttle > 0.2 && sys.startProblem() === '') sys.startEngine();
    return p;
  }

  /** Advance the world by dt seconds of real time and update views (does not draw). */
  step(dt: number, alpha?: number): void {
    const sim = this.sim;
    this.input.update(dt);
    if (this.walker) {
      this.walker.yaw = this.input.lookYaw;
      this.walker.step(dt, this.input.walk.forward, this.input.walk.right);
    }
    this.player.update(dt); // player
    // the robot decides once per physics step, exactly as in the headless tests
    let left = dt + 0;
    if (this.robot) {
      // run sub-steps manually so the controller sees every state
      let n = 0;
      this.stepAcc += left;
      while (this.stepAcc >= sim.h && n < 10) {
        sim.substep(this.robot.update(sim.h, sim, this.path), this.ground);
        this.stepAcc -= sim.h;
        n++;
      }
      if (n === 10) this.stepAcc = 0;
      alpha = alpha ?? this.stepAcc / sim.h;
      left = 0;
      this.systems.update(n * sim.h, this.systemsEnv());
    } else {
      const n = sim.update(dt, this.driverInput(dt), this.ground);
      this.systems.update(n * sim.h, this.systemsEnv());
    }
    this.time += dt;
    this.updateViews(dt, alpha);
  }
  private stepAcc = 0;

  /** Fixed-step simulation without drawing: used by the screenshot harness. */
  simulate(seconds: number, input?: Partial<VehicleInput> | 'robot'): void {
    const sim = this.sim;
    const inp: VehicleInput = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
    let robot: RobotDriver | null = null;
    if (input === 'robot') robot = this.robot ?? (this.robot = this.makeRobot());
    else if (input) Object.assign(inp, input);
    const n = Math.round(seconds / sim.h);
    for (let i = 0; i < n; i++) {
      sim.substep(robot ? robot.update(sim.h, sim, this.path) : inp, this.ground);
      if (i % 4 === 3) this.systems.update(sim.h * 4, this.systemsEnv());
      // keep camera springs and the charm moving with the car
      if (i % 2 === 1) this.updateViews(sim.h * 2, 1, -1);
    }
    this.time += n * sim.h;
    this.updateViews(0, 1, Infinity);
  }

  /** @param streamBudget ms for world streaming this call; Infinity = build everything, negative = skip */
  private updateViews(dt: number, alpha?: number, streamBudget = 3.5): void {
    const sim = this.sim;
    const core = this.core;
    // world: here rather than in step(), so that scripted time (simulate) moves the animals too
    this.stepWorldLife(dt);
    const dash = this.systems.dash;
    // a flickering headlight (quirk) blinks for the moment after a bump
    const blink = dash.headlightFlicker && Math.floor(this.time * 18) % 2 === 0;
    this.view.lightsOn = (this.lightsManual ?? this.systems.lightsOn) && !blink;
    this.view.cabinLight = this.cabinLightManual ?? this.env.dark;
    // the wiper switch: the environment owns the one sweep, so the blades and the cleared glass agree in every
    // position (auto follows the rain; slow / fast sweep by themselves; off parks them and the rain stays)
    this.env.wiperMode = this.systems.state.wipers;
    this.view.wiperAngle = this.env.wiperAngle;
    this.view.fuel = dash.tankL > 0 ? dash.fuel : 0.72;
    // vehicle systems: a wheel that is off the car is not drawn (until the model track draws the hub)
    const ws = this.systems.state.wheels;
    for (let i = 0; i < 4; i++) {
      const node = this.view.parts.wheels[i];
      if (node) node.pivot.visible = !ws[i]?.off;
    }
    this.view.update(dt, this.ground, alpha);
    this.cab?.update(dt); // cab controls (not yet there during construction)
    const pose = this.view.pose;
    core.maybeRebase(pose.x, pose.y, pose.z);
    // re-place after a possible origin move
    core.place(this.view.parts.root, pose.x, pose.y, pose.z);

    const cam = core.camera;
    const o = core.origin;
    this.rig.lookYaw = this.input.lookYaw;
    this.rig.lookPitch = this.input.lookPitch;
    const vp = this.seat ? this.view.parts.views[this.seat] : undefined;
    if (this.walker) {
      // standing: the heading is the look itself (all the way round)
      const w = this.walker;
      const st = this.seatTmp;
      st.x = w.x;
      st.y = w.floorAt(w.x, w.z) + EYE_HEIGHT;
      st.z = w.z;
      st.yaw = 0;
      st.pitch = 0;
      this.rig.seat = st;
    } else if (vp) {
      this.seatEye(vp, this.seatTmp);
      this.rig.seat = this.seatTmp;
    } else this.rig.seat = null;
    this.rig.update(dt, sim, pose);
    // hood: the driver's eye with the truck hidden, for comparing the world with the references
    this.view.parts.root.visible = this.viewMode !== 'hood';
    if (this.viewMode === 'orbit') {
      // round the vehicle: yaw 0 = in front of it, + = round to its right; looks at a point above the ground under its middle
      const b = this.basis;
      sim.basis(b);
      let fx = b[0];
      let fz = b[2];
      const fl = Math.hypot(fx, fz) || 1;
      fx /= fl;
      fz /= fl;
      const rx = -fz;
      const rz = fx;
      const ob = this.orbit;
      const ch = Math.cos(ob.pitch);
      const dx = (fx * Math.cos(ob.yaw) + rx * Math.sin(ob.yaw)) * ch;
      const dz = (fz * Math.cos(ob.yaw) + rz * Math.sin(ob.yaw)) * ch;
      const ty = pose.y - sim.spec.cgHeight + ob.target;
      cam.position.set(pose.x + dx * ob.dist - o.x, ty + Math.sin(ob.pitch) * ob.dist - o.y, pose.z + dz * ob.dist - o.z);
      cam.up.set(0, 1, 0);
      cam.lookAt(pose.x - o.x, ty - o.y, pose.z - o.z);
      if (cam.fov !== 40) {
        cam.fov = 40;
        cam.updateProjectionMatrix();
      }
      this.chaseInit = false;
    } else if (this.viewMode !== 'chase') {
      cam.position.set(this.rig.x - o.x, this.rig.y - o.y, this.rig.z - o.z);
      cam.quaternion.set(this.rig.qx, this.rig.qy, this.rig.qz, this.rig.qw).multiply(QFIX);
      if (Math.abs(cam.fov - this.rig.fov) > 0.01) {
        cam.fov = this.rig.fov;
        cam.updateProjectionMatrix();
      }
      this.chaseInit = false;
    } else {
      const b = this.basis;
      sim.basis(b);
      let fx = b[0];
      let fz = b[2];
      const fl = Math.hypot(fx, fz) || 1;
      fx /= fl;
      fz /= fl;
      const yawOff = this.input.lookYaw;
      const cx = Math.cos(yawOff);
      const sx = Math.sin(yawOff);
      // rotate the boom around the car with free-look
      const bx = fx * cx - fz * sx;
      const bz = fz * cx + fx * sx;
      const ch = this.view.parts.chase;
      this.tmp.set(pose.x - bx * ch.dist - o.x, pose.y + ch.height - o.y, pose.z - bz * ch.dist - o.z);
      if (!this.chaseInit || dt === 0) {
        this.chasePos.copy(this.tmp);
        this.chaseInit = true;
      } else this.chasePos.lerp(this.tmp, 1 - Math.exp(-dt * 5));
      cam.position.copy(this.chasePos);
      cam.up.set(0, 1, 0);
      cam.lookAt(pose.x - o.x, pose.y + ch.look - o.y, pose.z - o.z);
      if (cam.fov !== 55) {
        cam.fov = 55;
        cam.updateProjectionMatrix();
      }
    }
    const fo = this.player.afterCamera(dt, cam, o, pose.x, pose.z); // player: own camera on foot; build round the walker
    this.proving?.update(fo.x, fo.z);
    this.faunaView?.update(cam.position.x + o.x, cam.position.z + o.z); // world
    if (this.worldView && streamBudget >= 0) this.worldView.update(fo.x, fo.z, streamBudget);

    // biome mix where the vehicle is, then light, sky and weather
    const bl = this.bl;
    if (this.world) {
      this.world.spine.project(pose.x, pose.z, this.sHint, this.pr);
      this.sHint = this.pr.s;
      this.world.spine.biomeAt(this.pr.s, bl);
      this.landmarks?.update(this.pr.s, pose.x, pose.z);
    } else {
      bl.a = bl.b = 0;
      bl.t = 0;
    }
    this.env.camX = cam.position.x + o.x;
    this.env.camZ = cam.position.z + o.z;
    this.env.update(dt, this.time, bl.a, bl.b, bl.t, this.world, sim.vx, sim.vy, sim.vz);
    // world: the lighthouses light up as the day goes, and in thick weather
    if (this.beacons) {
      const sk = this.env.sky;
      const w = this.env.state;
      const dusk = 1 - Math.min(1, Math.max(0, (sk.daylight - 0.1) / 0.4));
      this.beacons.update(this.pr.s, this.time, Math.max(dusk, w.fog > 0.4 ? 0.7 : 0));
    }
    this.updateAudio();
  }

  /**
   * World: hand over the things of the places coming near, and step the animals with what there is
   * to be afraid of — the car (its engine carries far, further when it moves) and whoever is on foot
   * (running is heard at 40 m, walking at 20, creeping at 8).
   */
  private stepWorldLife(dt: number): void {
    if (!this.siteThings || !this.fauna) return;
    const sim = this.sim;
    const w = this.player.walker;
    const foot = this.player.onFoot;
    const fx = foot ? w.x : sim.px;
    const fz = foot ? w.z : sim.pz;
    this.siteThings.update(fx, fz);
    const car = this.threats[0];
    const moving = sim.kmh > 6;
    car.x = sim.px;
    car.z = sim.pz;
    car.heard = sim.engineOn ? (moving ? 75 : 32) : moving ? 25 : 0;
    car.seen = moving ? 90 : 0;
    const me = this.threats[1];
    me.x = w.x;
    me.z = w.z;
    const pace = foot ? Math.hypot(w.vx, w.vz) : 0;
    me.heard = !foot ? 0 : pace > 2.6 ? 40 : pace > 0.3 ? (w.crouched ? 8 : 20) : 3;
    me.seen = !foot ? 0 : w.crouched ? 20 : 40;
    this.fauna.update(dt, fx, fz, this.env.sky.hour, this.tame ? [] : this.threats);
  }

  private lastShifts = 0;
  private lastLever = 0;
  private updateAudio(): void {
    const sim = this.sim;
    const w = this.env.state;
    if (sim.shifts !== this.lastShifts) {
      this.lastShifts = sim.shifts;
      this.audio.oneShot('shift');
    }
    if (sim.leverEvents !== this.lastLever) {
      this.lastLever = sim.leverEvents;
      this.audio.oneShot('ratchet');
    }
    const sys = this.systems;
    const dash = sys.dash;
    let slip = 0;
    let rough = 0;
    for (const wh of sim.wheels) {
      if (wh.util > slip) slip = wh.util;
      if (wh.contact) rough = Math.max(rough, SURFACES[wh.surface].rough);
    }
    this.audio.update(
      {
        rpm: dash.rpm + dash.idleWobbleRpm * Math.sin(this.time * 2.3),
        idleRpm: sim.spec.engine.idle,
        redline: sim.spec.engine.redline,
        cylinders: 3,
        throttle: sim.throttle,
        speed: sim.speed,
        slip,
        rough,
        rain: w.rain,
        hail: w.hail,
        snow: w.snow,
        dust: w.dust,
        wind: w.wind,
        enclosed: this.view.parts.enclosed,
        engineOn: sys.state.running,
        cranking: dash.cranking,
        starterRate: Math.min(1, sys.state.battery / 40),
        shifting: sim.shiftTimer > 0 ? sim.shiftTimer / sim.spec.gearbox.shiftTime : 0,
        thump: sim.feel.thump,
        suspension: sim.feel.suspRms,
        buzz: sim.feel.buzz,
        flat: sys.state.wheels.some((x) => x.flat),
        horn: dash.horn,
        hornDetune: sys.hasQuirk('horn_detune'),
      },
      this.env.flash,
    );
  }

  render(): void {
    if (this.env.shotMode) this.env.prepareShot();
    this.core.render(this.time);
  }

  /** one live frame */
  frame(dt: number): void {
    this.step(dt);
    this.render();
    this.hud.update(dt, () => {
      const s = this.sim;
      const st = this.core.stats;
      const d = this.systems.dash;
      const gear = `${d.gearLabel}${d.handbrake ? ' (手刹)' : ''}`;
      const e = this.env;
      const hh = Math.floor(e.sky.hour);
      const mm = Math.floor((e.sky.hour - hh) * 60);
      const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}  ${e.state.kind}  ${e.state.temp.toFixed(0)}°C  `;
      const sysLine = `  油 ${(d.fuel * 100).toFixed(0)}%  水 ${d.coolantC.toFixed(0)}°C  电 ${(d.battery * 100).toFixed(0)}%${d.running ? '' : '  熄火'}${d.message.zh ? '  「' + d.message.zh + '」' : ''}`;
      return clock + `${s.kmh.toFixed(0).padStart(3)} km/h  档 ${gear}  ${d.rpm.toFixed(0).padStart(4)} rpm${sysLine}  ${st.calls} 次绘制  ${(st.triangles / 1000).toFixed(0)}k 三角形${this.robot ? '  [自动驾驶]' : ''}`;
    });
  }

  private worldTelemetry(): Record<string, number | string> {
    if (!this.world || !this.worldView) return {};
    const pr = { s: 0, d: 0 };
    this.world.spine.project(this.sim.px, this.sim.pz, NaN, pr);
    const bl = new BiomeBlend();
    this.world.spine.biomeAt(pr.s, bl);
    const c = this.worldView.counts;
    return {
      s: pr.s,
      d: pr.d,
      biome: BIOMES[bl.t < 0.5 ? bl.a : bl.b].id,
      strips: c.strips,
      terrainLeaves: c.terrain,
      tiles: c.tiles,
      pending: c.pending,
      maxBuildMs: this.worldView.maxBuildMs,
      landmark: this.landmarks?.nearestKind ?? '',
      landmarkDist: this.landmarks ? Math.round(this.landmarks.nearestDist) : -1,
    };
  }

  telemetry(): Record<string, number | string | boolean> {
    const s = this.sim;
    const st = this.core.stats;
    return {
      time: this.time,
      x: s.px,
      y: s.py,
      z: s.pz,
      kmh: s.kmh,
      gear: s.dir < 0 ? -1 : s.gear,
      rpm: s.rpm,
      steerDeg: (s.steerAngle * 180) / Math.PI,
      rollDeg: (s.roll * 180) / Math.PI,
      pitchDeg: (s.pitch * 180) / Math.PI,
      exploded: s.exploded,
      calls: st.calls,
      triangles: st.triangles,
      programs: st.programs,
      geometries: st.geometries,
      textures: st.textures,
      originX: this.core.origin.x,
      hour: this.env.sky.hour,
      weather: this.env.state.kind,
      act: this.env.state.act,
      wetness: this.env.state.wetness,
      snowCover: this.env.state.snowCover,
      temp: this.env.state.temp,
      lights: this.view.lightsOn,
      vehicle: s.spec.id,
      seat: this.walker ? 'walking' : this.seat || 'driver',
      fuel: Number.isFinite(s.fuelL) ? s.fuelL : -1,
      selector: s.selector,
      gearLabel: this.systems.dash.gearLabel,
      manual: s.manual,
      handbrake: s.parkBrake > 0,
      engineOn: this.systems.state.running,
      ignition: this.systems.state.ignition,
      coolantC: this.systems.state.coolantC,
      battery: this.systems.state.battery,
      lightSwitch: this.systems.state.lights,
      sysMessage: this.systems.dash.message.code,
      quirks: this.systems.dash.quirks.join(','),
      odometerKm: this.systems.dash.odometerKm,
      cabinLight: this.view.cabinLight,
      cutaway: this.view.cutaway,
      ...this.worldTelemetry(),
      ...this.player.telemetry(), // player
      ...this.cab?.telemetry(), // cab controls
      sitesKnown: this.siteThings?.sites ?? 0, // world
      siteContainers: this.siteThings?.containers ?? 0,
      siteLoose: this.siteThings?.loose ?? 0,
      animals: this.faunaView?.shown ?? 0,
    };
  }
}
