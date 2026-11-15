/**
 * The player's body in the game: getting out of the vehicle, walking in the world, getting back in.
 * The simulation is src/core/onfoot (pure, fixed-step); this file only joins it to the game's
 * vehicle, input and camera.
 *
 * Costs nothing while one sits in the vehicle: nothing here is drawn or stepped until one gets out.
 */
import * as THREE from 'three';
import { Walker } from '../../core/onboard/walker';
import { GroundLand, type Land } from '../../core/onfoot/land';
import { Modes, type Mode } from '../../core/onfoot/modes';
import { doorsOf, doorWithin, EXIT_KMH, nearestDoor, placeAtDoor, VehicleSolid, worldToBody, type Door } from '../../core/onfoot/vehicle';
import { Holds } from '../../core/interact/holds';
import { InteractSet, Picker, UseDriver, type Actor, type Interactable } from '../../core/interact/interact';
import { Hands, loadCarrier, newPack, saveCarrier, type CarrierState } from '../../core/items/carry';
import { Containers, type ContainerState } from '../../core/items/containers';
import { FuelSources } from '../../core/items/fuel';
import { LooseItems, type LooseState } from '../../core/items/loose';
import { sizeOf } from '../../core/items/shapes';
import { HeldView, ItemsView } from './itemsView';
import type { FootState } from '../../core/onfoot/walker';
import type { Inventory } from '../../core/items/inventory';
import { FOOT, FootWalker, type FootInput } from '../../core/onfoot/walker';
import { SolidSet } from '../../core/world/solids';
import type { Game } from '../game';
import type { Action } from '../input';
import { Fixture } from './fixtures';
import { readPlayerParams, type PlayerParams } from './params';
import { yardToWorld } from '../../core/onfoot/testbed';
import { SpineSample } from '../../core/world/spine';
import { Overlay } from './overlay';
import { VehicleUses } from './vehicleUses';
import { CargoUses } from './cargoUses';
import { Fishing, ROD } from './fishing';
import type { CargoState } from '../../core/onfoot/cargo';

/** converts the rig frame (+x forward, +z right) to a Three.js camera (−z forward, +x right) */
const QFIX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

/** field of view on foot (deg): a little wider than the driver's seat (5.3) */
export const FOOT_FOV = 68;
/** a seat this close to a door (m, on the plan) is got out of straight away with E */
export const SEAT_DOOR_REACH = 1.15;

/** seconds G is held to put down what is in the hands */
export const PUT_HOLD = 0.6;

export interface PlayerSave {
  mode: Mode;
  seat: string;
  foot: FootState | null;
  carrier: CarrierState;
  loose: LooseState;
  containers: ContainerState[];
  fuel: { id: string; litres: number }[];
  cargo?: CargoState | null;
}

export class Player implements Actor {
  readonly id = 'p1';
  readonly hands = new Hands();
  readonly pack: Inventory = newPack();
  /** the eye (world), kept up to date while on foot */
  readonly eye = { x: 0, y: 0, z: 0 };
  /** everything one can use: the vehicle's doors, the test yard, and whatever the world registers */
  readonly interact = new InteractSet();
  readonly picker = new Picker();
  readonly use_ = new UseDriver();
  /** who holds E on what (the systems' two-person timings ask `holds.count(id)`) */
  readonly holds = new Holds();
  /** what is looked at now (on foot) */
  looked: Interactable | null = null;
  readonly vehicleUses: VehicleUses;
  /** the vehicle's bed / rear deck / carrier and what rides on it */
  readonly cargo: CargoUses;
  /** the rod, the school of shadows, the float (docs/DESIGN_V2.md 8.4) */
  readonly fishing: Fishing;
  /** the world's things: lying about, in containers, petrol in tanks (the roadside sites fill these) */
  readonly loose = new LooseItems();
  readonly containers = new Containers();
  readonly fuel = new FuelSources();
  readonly itemsView: ItemsView;
  readonly heldView: HeldView;
  /** the backpack panel is open (Tab) */
  packOpen = false;
  /** G held this long (s); at PUT_HOLD what is in the hands is put down */
  private gHeld = 0;
  /** set by the scripted hooks: G held down regardless of the keyboard */
  gScripted = false;
  private overlay: Overlay | null = null;
  /** E went down since the last frame (a tap shorter than a frame still counts) */
  private eLatch = false;
  /** set by the scripted hooks: E held down regardless of the keyboard */
  eScripted = false;

  readonly modes = new Modes();
  readonly walker: FootWalker;
  /** everything a walker keeps out of: the vehicle, the test yard, and whatever the world registers */
  readonly solids = new SolidSet();
  readonly vehicleSolid: VehicleSolid;
  readonly land: Land;
  readonly input: FootInput = { forward: 0, right: 0, run: false, crouch: false, jump: false };
  private readonly qa = new THREE.Quaternion();
  private readonly qb = new THREE.Quaternion();
  private readonly b = new Float64Array(9);
  private readonly p = { x: 0, y: 0, z: 0 };
  private readonly eyeP = { x: 0, y: 0, z: 0 };
  private readonly dir = { x: 1, y: 0, z: 0 };
  private readonly v3 = new THREE.Vector3();
  private readonly box = { x: 0, y: 0, r: 0 };

  constructor(readonly game: Game) {
    this.land = game.world ?? new GroundLand(game.ground);
    this.vehicleSolid = new VehicleSolid(game.sim);
    this.solids.add(this.vehicleSolid);
    this.walker = new FootWalker(this.land, this.solids);
    this.vehicleUses = new VehicleUses(this);
    this.interact.add(this.vehicleUses);
    this.cargo = new CargoUses(this);
    this.fishing = new Fishing(this);
    this.interact.add(this.cargo);
    // the places by the road stand in the way (the jetty's deck is walked on)
    if (game.world) this.solids.add(game.world.sites);
    this.interact.add(this.loose);
    this.interact.add(this.containers);
    this.interact.add(this.fuel);
    this.solids.add(this.containers);
    this.itemsView = new ItemsView(game.core, this.loose, this.containers);
    this.heldView = new HeldView(game.core);
    this.params = readPlayerParams();
    if (this.params.fixture) this.fixture = new Fixture(game, this, game.params.s);
  }
  readonly params: PlayerParams;
  /** the test yard (?fixture=1) */
  fixture: Fixture | null = null;
  private started = false;

  /** the start the URL asks for (?onfoot=…), once the game is fully up */
  private start(): void {
    this.started = true;
    const o = this.params.onfoot;
    if (!o) return;
    const deg = (o.deg * Math.PI) / 180;
    if (o.at === 'door') this.getOut();
    else if (o.at === 'world') this.standAt(o.a, o.b, deg);
    else if (o.at === 'yard') {
      const f = this.fixture?.frame ?? { x: this.game.sim.px, z: this.game.sim.pz, heading: 0 };
      const w = yardToWorld(f, o.a, o.b);
      this.standAt(w.x, w.z, f.heading + deg);
    } else if (this.game.world) {
      const sp = new SpineSample();
      this.game.world.spine.at(o.a, sp);
      this.standAt(sp.x - Math.sin(sp.phi) * o.b, sp.z + Math.cos(sp.phi) * o.b, sp.phi + deg);
    }
    this.walker.pitch = (this.params.pitch * Math.PI) / 180;
    this.game.input.lookPitch = this.walker.pitch;
  }

  get onFoot(): boolean {
    return this.modes.mode === 'onfoot';
  }

  get heading(): number {
    return this.walker.heading;
  }

  /** the vehicle's doors (its walk area's door for the motorhome) */
  doors(): Door[] {
    return doorsOf(this.game.sim.spec, this.game.view.parts.walk);
  }

  /** what the game's own state says (seated / on board), when not on foot */
  private gameMode(): Mode {
    return this.onFoot ? 'onfoot' : this.game.walker ? 'onboard' : 'seated';
  }

  /** keep the machine in step with the game's seat and in-vehicle walker */
  sync(): void {
    const m = this.gameMode();
    if (m !== this.modes.mode) this.modes.go(m, m === 'seated' ? this.game.seat || 'driver' : '');
  }

  /**
   * E. Returns true when it was handled here (on foot; or getting out), false to leave it to the
   * vehicle's own seat logic (stand up / sit down inside).
   */
  use(): boolean {
    this.sync();
    const g = this.game;
    if (this.onFoot) {
      this.eLatch = true;
      return true;
    }
    // cab controls: seated or on board, E uses what is looked at (a lever, a door); else as before
    if (this.looked) {
      this.eLatch = true;
      return true;
    }
    if (Math.abs(g.sim.kmh) > EXIT_KMH) return false;
    if (g.walker) {
      // on board: out through the door when standing in it
      const dr = g.view.parts.walk?.areas.find((r) => r.name === 'door');
      if (dr && g.walker.x >= dr.x0 - 0.05 && g.walker.x <= dr.x1 + 0.05 && g.walker.z >= dr.z0 - 0.05 && g.walker.z <= dr.z1 + 0.05) return this.getOut();
      return false;
    }
    // seated: a vehicle one can walk about in stands one up inside — unless the seat is next to a
    // door (the cab's seats): then straight out; any other vehicle lets one out
    if (g.view.parts.walk && !this.seatByDoor()) return false;
    return this.getOut();
  }

  /** the seat one sits in is within reach of a door (plan distance in the body frame) */
  seatByDoor(reach = SEAT_DOOR_REACH): boolean {
    const g = this.game;
    const vp = g.seat ? g.view.parts.views[g.seat] : null;
    const x = vp ? vp.x : g.sim.spec.eye.x;
    const z = vp ? vp.z : g.sim.spec.eye.z;
    return doorWithin(this.doors(), x, z, g.sim.spec.body.halfWidth, reach) !== null;
  }

  /** out of the vehicle, beside the door nearest to where one sat or stood */
  getOut(): boolean {
    const g = this.game;
    const doors = this.doors();
    let bx = g.sim.spec.eye.x;
    let bz = g.sim.spec.eye.z;
    if (g.walker) {
      bx = g.walker.x;
      bz = g.walker.z;
    } else if (g.seat && g.view.parts.views[g.seat]) {
      bx = g.view.parts.views[g.seat].x;
      bz = g.view.parts.views[g.seat].z;
    }
    const door = nearestDoor(doors, bx, bz, g.sim);
    this.sync();
    g.setSeat('');
    placeAtDoor(this.walker, g.sim, door);
    this.walker.pitch = 0;
    g.input.freeLook = true;
    g.input.lookYaw = this.walker.heading;
    g.input.lookPitch = 0;
    this.modes.go('onfoot', door.name);
    return true;
  }

  /** in through a door: into its seat, or onto the floor of a vehicle one walks about in */
  getIn(door: Door): boolean {
    const g = this.game;
    g.input.freeLook = false;
    g.input.lookYaw = 0;
    g.input.lookPitch = 0;
    if (door.leads === 'onboard' && door.inside && g.view.parts.walk) {
      const w = new Walker(g.view.parts.walk);
      // facing in, away from the door
      const yaw = door.side > 0 ? -Math.PI / 2 : Math.PI / 2;
      w.place(door.inside.x, door.inside.z, yaw);
      g.setSeat('');
      g.walker = w;
      g.input.freeLook = true;
      g.input.lookYaw = yaw;
      this.modes.go('onboard', door.name);
      return true;
    }
    const seat = door.seat === 'driver' || g.view.parts.views[door.seat] ? door.seat : 'driver';
    g.setSeat(seat);
    this.modes.go('seated', seat);
    return true;
  }

  /** put the player on foot at a world point (tests and screenshots) */
  standAt(x: number, z: number, heading: number): boolean {
    const g = this.game;
    g.setSeat('');
    const ok = this.walker.place(x, z, heading);
    this.walker.pitch = 0;
    g.input.freeLook = true;
    g.input.lookYaw = heading;
    g.input.lookPitch = 0;
    if (this.modes.mode !== 'onfoot') this.modes.go('onfoot', 'placed');
    return ok;
  }

  /** read the keys and step the walker (only on foot) */
  update(dt: number): void {
    if (!this.onFoot) {
      this.sync();
      return;
    }
    const g = this.game;
    const inp = this.input;
    inp.forward = g.input.walk.forward;
    inp.right = g.input.walk.right;
    inp.run = g.input.isDown('ShiftLeft') || g.input.isDown('ShiftRight');
    if (g.input.isDown('Space')) inp.jump = true;
    this.walker.heading = g.input.lookYaw;
    this.walker.pitch = g.input.lookPitch;
    this.walker.advance(dt, inp);
    inp.jump = false;
  }

  /** a scripted walk at fixed steps (tests and screenshots) */
  walk(seconds: number, forward: number, right: number, heading?: number, run = false): void {
    if (heading !== undefined) this.walker.heading = heading;
    const inp: FootInput = { forward, right, run, crouch: this.input.crouch, jump: false };
    const n = Math.round(seconds / FOOT.h);
    for (let i = 0; i < n; i++) this.walker.step(inp);
    this.game.input.lookYaw = this.walker.heading;
  }

  /** C on foot: crouch / stand */
  toggleCrouch(): void {
    this.input.crouch = !this.input.crouch;
  }

  /**
   * A key action, before the game's own handling. Returns true when it is used up here: on foot the
   * vehicle's keys mean other things (C crouches, the number keys do not jump into seats).
   */
  action(a: Action): boolean {
    if (a === 'use') return this.use();
    if (!this.onFoot) return a === 'drop' || a === 'pack' ? this.offFootKey(a) : false;
    if (a === 'camera') {
      this.toggleCrouch();
      return true;
    }
    // the car's own keys do nothing from outside it (no starting the engine from the verge)
    if (a.startsWith('seat') || a === 'robot' || a === 'key' || a === 'leverUp' || a === 'leverDown' || a === 'manual') return true;
    return this.offFootKey(a);
  }

  /** G and Tab */
  private offFootKey(a: Action): boolean {
    if (a === 'pack') {
      if (!this.onFoot) return false;
      this.packOpen = !this.packOpen;
      return true;
    }
    return a === 'drop' && this.onFoot;
  }

  /**
   * Put down what is in the hands on free ground in front (G held): straight ahead, then a little
   * nearer, further or to the sides. Returns false when there is no room anywhere in front.
   */
  putDown(): boolean {
    const id = this.hands.id;
    if (!id || !this.onFoot) return false;
    const w = this.walker;
    const s = sizeOf(id);
    const room = Math.max(s.hx, s.hz) + 0.05;
    for (const dist of [0.75, 0.55, 1.0]) {
      for (const turn of [0, -0.45, 0.45, -0.9, 0.9]) {
        const a = w.heading + turn;
        const x = w.x + Math.cos(a) * dist;
        const z = w.z + Math.sin(a) * dist;
        if (!w.freeAt(x, z, room - 0.3 > 0 ? room - 0.3 : 0)) continue;
        const y = w.landAt(x, z, w.y + 0.3);
        if (Math.abs(y - w.y) > 0.45) continue;
        this.loose.add(id, 1, x, Math.max(y, w.y - 0.45), z, w.heading + Math.PI / 2, this.id, this.hands.fill, undefined, this.hands.cond); // vehicle systems: keeps a part's condition
        this.hands.set(null);
        return true;
      }
    }
    return false;
  }

  /** after the game has placed its camera: on foot the camera is ours; returns the point to build the world round */
  afterCamera(_dt: number, cam: THREE.PerspectiveCamera, origin: { x: number; y: number; z: number }, vx: number, vz: number): { x: number; z: number } {
    if (!this.started) this.start();
    this.fixture?.update();
    if (this.onFoot && this.game.viewMode === 'cockpit') this.placeCamera(cam, origin);
    this.lookAndUse(_dt, cam);
    const fo = this.focus(this.fo, vx, vz);
    // the world's things near where one is (nothing near: hidden, nothing drawn)
    this.itemsView.update(fo.x, this.onFoot ? this.walker.y : this.game.sim.py, fo.z);
    this.cargo.update();
    if (this.onFoot && this.game.viewMode === 'cockpit') this.fishing.update(_dt, cam);
    else this.fishing.update(0, cam);
    // the rod is drawn by the fishing (it bends); everything else by the held view
    this.heldView.update(this.onFoot && this.game.viewMode === 'cockpit' && this.hands.id !== ROD ? this.hands.id : null, cam, this.walker.sway, 0);
    return fo;
  }
  private readonly fo = { x: 0, z: 0 };

  /** the first-person camera on foot */
  placeCamera(cam: THREE.PerspectiveCamera, origin: { x: number; y: number; z: number }): void {
    const w = this.walker;
    const e = w.eye(this.eyeP);
    cam.position.set(e.x - origin.x, e.y - origin.y, e.z - origin.z);
    this.qa.setFromAxisAngle(Y, -w.heading);
    this.qb.setFromAxisAngle(Z, w.pitch);
    cam.quaternion.copy(this.qa).multiply(this.qb).multiply(QFIX);
    if (Math.abs(cam.fov - FOOT_FOV) > 0.01) {
      cam.fov = FOOT_FOV;
      cam.updateProjectionMatrix();
    }
  }

  /** look and use for dt seconds without moving (the scripted hooks; E as `eScripted` says) */
  tickUse(dt: number): void {
    this.lookAndUse(dt, this.game.core.camera);
  }

  /** what is looked at, E held or not, and the HUD for it */
  private lookAndUse(dt: number, cam: THREE.PerspectiveCamera): void {
    if (!this.onFoot) {
      this.holds.set(this.id, null);
      this.packOpen = false;
      this.seatedLookAndUse(dt, cam); // cab controls
      return;
    }
    const w = this.walker;
    w.load = this.hands.size === 'large' ? 'large' : this.hands.size === 'medium' ? 'medium' : 'none';
    w.eye(this.eye);
    w.look(this.dir);
    this.looked = this.picker.pick(this.interact, this.solids, this, this.eye, this.dir);
    const down = this.eScripted || this.eLatch || this.game.input.isDown('KeyE');
    this.eLatch = false;
    this.use_.update(dt, this.looked, down, this);
    this.holds.set(this.id, this.use_.target ? this.use_.target.id : null);
    // G held: put it down
    let word = this.use_.word;
    let ring = this.use_.ring;
    const gDown = this.hands.id !== null && (this.gScripted || this.game.input.isDown('KeyG'));
    if (gDown) {
      this.gHeld += dt;
      word = '放下';
      ring = Math.min(1, this.gHeld / PUT_HOLD);
      if (this.gHeld >= PUT_HOLD) {
        this.putDown();
        this.gHeld = -Infinity; // not again until G is let go
      }
    } else this.gHeld = 0;
    // with the rod: the ring is the charge or the line's load, the word the catch's tag
    const fh = gDown ? null : this.fishing.hud();
    if (fh) {
      if (fh.word) word = fh.word;
      if (fh.ring >= 0) ring = fh.ring;
    }
    if (typeof document === 'undefined') return;
    if (!this.overlay) this.overlay = new Overlay();
    this.overlay.update(true, word, ring >= 0 && ring <= 1 ? ring : -1, this.looked && !gDown ? this.screenBox(this.looked, cam) : null);
    this.overlay.showPack(this.packOpen ? this.pack.slots : null, this.hands.id);
  }

  /**
   * cab controls: seated or standing on board, the same pick from the camera (the seat's own eye):
   * the cab's levers, switches, doors and the glovebox are things to look at and use.
   */
  private seatedLookAndUse(dt: number, cam: THREE.PerspectiveCamera): void {
    const o = this.game.core.origin;
    cam.updateMatrixWorld();
    cam.getWorldPosition(this.v3);
    this.eye.x = this.v3.x + o.x;
    this.eye.y = this.v3.y + o.y;
    this.eye.z = this.v3.z + o.z;
    cam.getWorldDirection(this.v3);
    this.dir.x = this.v3.x;
    this.dir.y = this.v3.y;
    this.dir.z = this.v3.z;
    this.looked = this.game.viewMode === 'cockpit' ? this.picker.pick(this.interact, this.solids, this, this.eye, this.dir) : null;
    const down = this.eScripted || this.eLatch || this.game.input.isDown('KeyE');
    this.eLatch = false;
    this.use_.update(dt, this.looked, down, this);
    if (typeof document === 'undefined') return;
    if (!this.overlay) this.overlay = new Overlay();
    const ring = this.use_.ring;
    // seated, the mark shows only over something one can use (the road ahead stays clean)
    this.overlay.update(this.game.viewMode === 'cockpit' && (this.looked !== null || this.use_.target !== null), this.use_.word, ring >= 0 && ring <= 1 ? ring : -1, this.looked ? this.screenBox(this.looked, cam) : null);
    this.overlay.showPack(null, this.hands.id);
  }

  /** the thing on screen: centre and half size in px (for the corner marks) */
  private screenBox(it: Interactable, cam: THREE.PerspectiveCamera): { x: number; y: number; r: number } | null {
    const o = this.game.core.origin;
    it.aim(this.p);
    const v = this.v3.set(this.p.x - o.x, this.p.y - o.y, this.p.z - o.z);
    const d = v.distanceTo(cam.position);
    cam.updateMatrixWorld();
    v.project(cam);
    if (v.z > 1) return null;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const f = H / 2 / Math.tan((cam.fov * Math.PI) / 360);
    this.box.x = (v.x * 0.5 + 0.5) * W;
    this.box.y = (-v.y * 0.5 + 0.5) * H;
    this.box.r = (it.radius / Math.max(0.2, d)) * f * 0.9;
    return this.box;
  }

  /** where the world should be built round and the light measured: the walker when on foot */
  focus(out: { x: number; z: number }, vx: number, vz: number): { x: number; z: number } {
    out.x = this.onFoot ? this.walker.x : vx;
    out.z = this.onFoot ? this.walker.z : vz;
    return out;
  }

  /** where the walker stands in the vehicle's frame (for the tests: getting in beside the door) */
  inBodyFrame(out = { x: 0, y: 0, z: 0 }): { x: number; y: number; z: number } {
    return worldToBody(this.game.sim, this.b, this.walker.x, this.walker.y, this.walker.z, out);
  }

  /** everything of the player and the world's things, as plain data (10.3: what a host sends) */
  save(): PlayerSave {
    return {
      mode: this.modes.mode,
      seat: this.game.seat,
      foot: this.onFoot ? this.walker.toJSON() : null,
      carrier: saveCarrier(this),
      loose: this.loose.toJSON(),
      containers: this.containers.toJSON(),
      fuel: this.fuel.toJSON(),
      cargo: this.cargo.toJSON(),
    };
  }

  load(s: PlayerSave): void {
    loadCarrier(this, s.carrier);
    this.loose.load(s.loose);
    this.containers.load(s.containers);
    this.fuel.load(s.fuel);
    this.cargo.load(s.cargo ?? null);
    if (s.mode === 'onfoot' && s.foot) {
      this.standAt(s.foot.x, s.foot.z, s.foot.heading);
      this.walker.restore(s.foot);
    } else if (s.mode === 'seated') {
      this.game.input.freeLook = false;
      this.game.setSeat(s.seat);
      this.sync();
      if (this.onFoot) this.modes.go('seated', s.seat || 'driver');
    }
  }

  telemetry(): Record<string, number | string | boolean> {
    const w = this.walker;
    if (!this.onFoot) return { mode: this.modes.mode };
    return { mode: 'onfoot', footX: w.x, footY: w.y, footZ: w.z, footHeading: w.heading, swimming: w.swimming, depth: w.depth, crouched: w.crouched, hands: this.hands.id ?? '', handsFill: this.hands.fill, fish: this.fishing.angling.phase, shadows: this.fishing.school.shadows.length, lastCatch: this.fishing.lastCatch?.id ?? '', packUsed: this.pack.used, looked: this.looked?.id ?? '', itemsDrawn: this.itemsView.drawn };
  }
}
