/**
 * Entry of the ModCar game (index.html and modcar.html; the game before it is classic.html). Builds ModGame and the
 * test hook `window.__rt` the screenshot harness and the journey scripts drive it through.
 */
import { tried } from './devLab';
import { sectionOf, type SectionId } from '../../core/modcar/proving/layout';
import * as THREE from 'three';
import { decodeBuild, encodeBuild, fitPart, fitSub, newInstance, removePart } from '../../core/modcar/build';
import { partDef } from '../../core/modcar/parts';
import { BIOMES } from '../../core/world/biomes';
import { newTool, type ToolKind } from '../../core/modcar/tools';
import { newItem } from '../../core/modcar/items';
import { zonesOf } from '../../core/modcar/cargo';
import { heldName, heldOf } from './player';
import type { Loose } from './loose';
import { GroundSample } from '../../core/world/ground';
import { readParams } from '../params';
import { loadStats } from './assets';
import { devItemOf } from './devPanel';
import { Tune } from './devTune';
import { ModGame, NEW_SEED_KEY, readModParams, type ViewMode } from './ModGame';
// (the V3 modules are found, and whatever they add to the catalogues at their top level is in, when this line is
// reached: before anything below runs, so before the save is read and checked against those catalogues)
import { MODULES } from './kernel/discovery';
import type { GameModule } from './kernel/modules';
import { clearSave, loadSave } from './save';
import { wreckSpots } from './wrecks';
import { isRare, rollWreck } from '../../core/modcar/wrecks';

/** is a thing lying about the one asked for: a part id, tool:<kind> or item:<id> */
function looseIs(l: Loose, id: string): boolean {
  return l.part?.part === id || (!!l.tool && `tool:${l.tool.kind}` === id) || (!!l.item && `item:${l.item.item}` === id);
}

const canvas = document.getElementById('view') as HTMLCanvasElement;
const base = readParams();
const fresh = readModParams(base);
// a game in progress goes on, unless the address asks for something of its own (the harness, a test drive)
const q = new URLSearchParams(location.search);
if (q.has('new')) clearSave();
const own = fresh.shot || ['start', 'build', 'project', 'garage'].some((k) => q.has(k));
// (?new=1: the save cleared, a new game kept from here on)
const save = own || q.has('new') ? null : loadSave();
// (a new game of one's own, no world asked for: the new world's seed ModGame.newGame left for it)
if (!save && !own && !q.has('seed')) {
  try {
    const ns = Number(localStorage.getItem(NEW_SEED_KEY));
    if (ns > 0) fresh.seed = ns;
    localStorage.removeItem(NEW_SEED_KEY);
  } catch {
    /* storage unavailable */
  }
}
// (a save of the one world with the workshop in it starts there, in the yard or down the road, as the save has it)
const params = save
  ? { ...fresh, keep: true, start: save.world ? 'garage' : save.place, time: save.hour, s: save.road?.s ?? fresh.s, seed: save.world?.seed ?? save.road?.seed ?? fresh.seed, weather: save.place === 'road' ? base.weather : fresh.weather }
  : { ...fresh, keep: !own };
// the developer's dials, the terrain's among them, are in before the world is made
const tune = new Tune();
tune.applyAll();
// (a test script may hand the page modules of its own before this runs, installed after the game's: that is how
// harness/shots/modcar_kernel.mjs tries the kernel's seams in the real game, with a probe module of its own)
const handed = (window as unknown as { __rtModules?: GameModule[] }).__rtModules;
const game = new ModGame(canvas, params, save, tune, handed?.length ? [...MODULES, ...handed] : MODULES);

const gl = game.core.renderer.getContext();
const dbg = gl.getExtension('WEBGL_debug_renderer_info');

/** stand off a point (world) on the side `from` (0 = +x), looking at it; what the mark is on */
function aimPoint(x: number, y: number, z: number, from: number, dist: number): string {
  if (game.seated) game.getOut();
  const w = game.player.walker;
  game.viewMode = 'cockpit';
  w.place(x + Math.cos(from) * dist, z + Math.sin(from) * dist, from + Math.PI);
  for (let i = 0; i < 3; i++) {
    game.simulate(i ? 0.05 : 0);
    const eye = w.eye();
    game.input.lookYaw = Math.atan2(z - w.z, x - w.x);
    game.input.lookPitch = Math.atan2(y - eye.y, Math.hypot(x - w.x, z - w.z));
  }
  game.simulate(0);
  return String(game.player.telemetry().target);
}

const vehicle = (i: number) => {
  const v = game.vehicles[i];
  if (!v) throw new Error(`no vehicle ${i}`);
  return v;
};

const rt = {
  ready: false,
  /** the last error a frame threw (the loop goes on past it) */
  lastError: '' as string,
  game,
  params,
  info: { renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown', three: THREE.REVISION },
  simulate: (seconds: number) => game.simulate(seconds),
  render: () => game.render(),
  telemetry: () => game.telemetry(),
  setView: (v: ViewMode) => {
    game.viewMode = v;
    game.simulate(0);
  },
  setOrbit: (yaw: number, pitch: number, dist: number, targetH = game.orbit.target, vehicleIndex = -1) => {
    game.viewMode = 'orbit';
    if (vehicleIndex >= 0) game.focus = vehicle(vehicleIndex);
    game.orbit.yaw = (yaw * Math.PI) / 180;
    game.orbit.pitch = (pitch * Math.PI) / 180;
    game.orbit.dist = dist;
    game.orbit.target = targetH;
    game.simulate(0);
  },
  look: (yaw: number, pitch: number) => {
    game.input.lookYaw = yaw;
    game.input.lookPitch = pitch;
    game.simulate(0);
  },
  setHour: (h: number) => {
    game.env.clock.setHour(h, game.time);
    game.simulate(0);
  },
  setWeather: (k: string | null) => {
    game.env.weather.force = k as never;
    game.simulate(0);
  },
  /** stand somewhere (world x, z, heading rad) and look (pitch rad) */
  stand: (x: number, z: number, heading: number, pitch = 0) => {
    if (game.seated) game.getOut();
    game.player.walker.place(x, z, heading);
    game.input.lookYaw = heading;
    game.input.lookPitch = pitch;
    game.viewMode = 'cockpit';
    game.simulate(0);
  },
  /** stand ~1.6 m from a vehicle's mount, looking at it */
  aim: (vi: number, mount: string, dist = 1.6, side = 0) => {
    const v = vehicle(vi);
    const n = v.view.mountNode(mount);
    if (!n) return false;
    game.simulate(0);
    n.updateWorldMatrix(true, false);
    // (a panel: its middle as it stands, open or shut, not its hinge)
    v.view.model.updateMatrixWorld(true);
    const box = v.view.panelBox(mount);
    const p = (box ? box.getCenter(new THREE.Vector3()) : n.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(game.core.origin.x, game.core.origin.y, game.core.origin.z));
    const b = new Float64Array(9);
    v.sim.basis(b);
    // from the side the mount is on (or in front / behind for centre mounts)
    const m = v.view.frame.mounts.find((mm) => mm.id === mount);
    const s = side || (m && m.side !== 0 ? m.side : m && m.pos.x < 0 ? -2 : 2);
    let ox: number;
    let oz: number;
    if (Math.abs(s) === 2) {
      ox = b[0] * Math.sign(s) * dist;
      oz = b[2] * Math.sign(s) * dist;
    } else {
      ox = b[6] * s * dist;
      oz = b[8] * s * dist;
    }
    const x = p.x + ox;
    const z = p.z + oz;
    if (game.seated) game.getOut();
    game.player.walker.place(x, z, 0, 0);
    const w = game.player.walker;
    // look from where the walker actually stands (placing keeps it out of the vehicle's body)
    const eye = w.eye();
    const heading = Math.atan2(p.z - w.z, p.x - w.x);
    const pitch = Math.atan2(p.y - eye.y, Math.hypot(p.x - w.x, p.z - w.z));
    game.input.lookYaw = heading;
    game.input.lookPitch = pitch;
    game.viewMode = 'cockpit';
    game.simulate(0);
    return true;
  },
  /** stand beside a vehicle's fuel filler (the flap, or a motorcycle's tank), looking at it */
  aimCap: (vi: number, dist = 1.1) => {
    const v = vehicle(vi);
    game.simulate(0);
    const c = v.view.capWorld(new THREE.Vector3());
    if (!c) return false;
    const o = game.core.origin;
    const p = c.add(new THREE.Vector3(o.x, o.y, o.z));
    const b = new Float64Array(9);
    v.sim.basis(b);
    // out from the side it is on (a tank on top: from the side of it)
    const local = v.view.model.worldToLocal(new THREE.Vector3(p.x - o.x, p.y - o.y, p.z - o.z));
    const s = local.z >= 0 ? 1 : -1;
    if (game.seated) game.getOut();
    game.player.walker.place(p.x + b[6] * s * dist, p.z + b[8] * s * dist, 0, 0);
    const w = game.player.walker;
    const eye = w.eye();
    game.input.lookYaw = Math.atan2(p.z - w.z, p.x - w.x);
    game.input.lookPitch = Math.atan2(p.y - eye.y, Math.hypot(p.x - w.x, p.z - w.z));
    game.viewMode = 'cockpit';
    game.simulate(0);
    return true;
  },
  /** stand by one of a vehicle's fillers (fuel, water, oil), looking at its mouth (from whichever side one can stand on) */
  aimFiller: (vi: number, liquid: 'fuel' | 'water' | 'oil', dist = 0.95) => {
    const v = vehicle(vi);
    game.simulate(0);
    const m = new THREE.Vector3();
    const n = new THREE.Vector3();
    if (!v.view.fillerMouth(liquid, m, n)) return false;
    const o = game.core.origin;
    const p = m.clone().add(new THREE.Vector3(o.x, o.y, o.z));
    // out from the body: the way the mouth faces (a cap on top: away from the vehicle's middle)
    let a0 = Math.atan2(n.z, n.x);
    if (Math.hypot(n.x, n.z) < 0.3) a0 = Math.atan2(p.z - v.sim.pz, p.x - v.sim.px);
    if (game.seated) game.getOut();
    const w = game.player.walker;
    game.viewMode = 'cockpit';
    for (const d of [dist, dist * 1.35, dist * 1.8]) {
      for (const da of [0, 0.6, -0.6, 1.2, -1.2, Math.PI]) {
        w.place(p.x + Math.cos(a0 + da) * d, p.z + Math.sin(a0 + da) * d, 0, 0);
        // (the body pushes one out: look again from where one ends up)
        for (let i = 0; i < 3; i++) {
          game.simulate(i ? 0.05 : 0);
          const eye = w.eye();
          game.input.lookYaw = Math.atan2(p.z - w.z, p.x - w.x);
          game.input.lookPitch = Math.atan2(p.y - eye.y, Math.hypot(p.x - w.x, p.z - w.z));
        }
        game.simulate(0);
        const t = String(game.player.telemetry().target);
        if (t.startsWith('filler:') || t.startsWith('cap:')) return true;
      }
    }
    return false;
  },
  /** the fuel filler's state: flap open (0…1), litres in the tank by kind */
  filler: (vi: number) => {
    const v = vehicle(vi);
    const tank = v.build.parts.fuelTank;
    return { open: v.view.capOpen, amount: v.view.capAmount, flap: v.view.hasFlap, fuel: tank ? { ...(tank.fluids.fuel ?? {}) } : null };
  },
  /**
   * Walk up to a garage device (the door button, the light switch, …), look at it and press, the way a
   * player would: the mark has to find it. Returns the target the mark was on.
   */
  useDevice: (id: string, dist = 1.15) => {
    const d = game.devices.find((x) => x.id === id);
    if (!d) return `no device ${id}`;
    // stand on the room side of it (towards the middle of the floor)
    const toMid = Math.atan2(-d.z, -d.x);
    if (game.seated) game.getOut();
    game.player.walker.place(d.x + Math.cos(toMid) * dist, d.z + Math.sin(toMid) * dist, toMid + Math.PI);
    const w = game.player.walker;
    const eye = w.eye();
    game.input.lookYaw = Math.atan2(d.z - w.z, d.x - w.x);
    game.input.lookPitch = Math.atan2(d.y - eye.y, Math.hypot(d.x - w.x, d.z - w.z));
    game.viewMode = 'cockpit';
    game.simulate(0);
    const target = String(game.player.telemetry().target);
    game.player.press();
    game.step(1 / 60, 1);
    game.player.release();
    game.simulate(0);
    return target;
  },
  /** put a new part (or a tool kind prefixed with "tool:", an item with "item:") into the hands */
  hold: (id: string, opts: Record<string, unknown> = {}) => {
    // (what was in the hands gives way, as it always did here; the new thing then enters them the one way things do:
    // onto a stack of its sort or into a basket in the other slots when there is one, else into the hand just emptied)
    game.player.held = null;
    if (id.startsWith('tool:')) game.player.receive({ kind: 'tool', tool: newTool(id.slice(5) as ToolKind, opts) });
    else if (id.startsWith('item:')) game.player.receive({ kind: 'item', item: newItem(id.slice(5), opts) });
    else game.player.receive({ kind: 'part', inst: newInstance(id) });
    game.simulate(0);
    return game.player.telemetry();
  },
  /** pick up the first loose thing of a part id (into the hands, or the hotbar's free slot as the game does) */
  pickUp: (id: string) => {
    const l = game.loose.list.find((x) => looseIs(x, id));
    if (!l) return false;
    const slot = game.player.freeSlot();
    if (slot < 0) return false;
    game.player.sel = slot;
    game.loose.remove(l);
    game.player.held = heldOf(l);
    game.simulate(0);
    return true;
  },
  /**
   * Stand `dist` off a device (the workshop's too: gen_cord, gen_switch, recycler, bench) on the side `from`
   * (0 = +x, π/2 = +z), looking at it; what the mark is on then
   */
  aimAt: (id: string, from: number, dist = 1.0) => {
    const d = game.devices.find((x) => x.id === id);
    if (!d) return `no device ${id}`;
    return aimPoint(d.x, d.y, d.z, from, dist);
  },
  /** stand off a point (world) on the side `from`, looking at it */
  aimPoint: (x: number, y: number, z: number, from: number, dist = 1.0) => aimPoint(x, y, z, from, dist),
  /** the generator's filler (world), for aiming a can at it */
  genFiller: () => {
    const p = game.tanks[0];
    if (!p) return null;
    const m = new THREE.Vector3();
    const o = new THREE.Vector3();
    p.mouth(m, o);
    const g = game.origin;
    return { x: m.x + g.x, y: m.y + g.y, z: m.z + g.z, open: p.open };
  },
  /** the workshop: the generator, the recycler, the bench; the materials */
  workshop: () => ({ ...(game.workshop?.telemetry() ?? {}), stock: { ...game.stock }, garage: game.garage?.telemetry() ?? null }),
  /** materials given (the developer's) */
  addStock: (scrap = 0, organics = 0, chemicals = 0) => {
    game.stock.scrap += scrap;
    game.stock.organics += organics;
    game.stock.chemicals += chemicals;
    return { ...game.stock };
  },
  /** E held for a while on what the mark is on (the generator's rope: 0.6 s a pull) */
  holdFor: (seconds: number) => {
    game.player.press();
    const dt = 1 / 60;
    for (let t = 0; t < seconds; t += dt) {
      game.player.primary = true;
      game.step(dt, 1);
    }
    game.player.release();
    game.simulate(0);
    return game.player.telemetry();
  },
  /** at the bench (open): make a recipe and strike every blow; the thing is there after its second */
  craftAll: (id: string) => {
    const ws = game.workshop as unknown as { open: boolean; crafting: boolean; strike(i?: number): void; craftNow?: (id: string) => void } | null;
    if (!ws?.open) return 'bench not open';
    (game.workshop as unknown as { craft: (id: string) => void }).craft(id);
    game.simulate(0.3);
    let n = 0;
    while (ws.crafting && n < 12) {
      ws.strike();
      game.simulate(0.7);
      n++;
    }
    game.simulate(1.2);
    return { struck: n, open: ws.open };
  },
  /** stand before the first loose thing of a part id (tool:<kind> for a tool), looking at it (from whichever side one can stand on) */
  aimLoose: (id: string, dist = 1.0, which: 'any' | 'stowed' | 'free' = 'any') => {
    // (the garage's own junk lies about too: 'stowed' finds the one riding in a vehicle)
    const l = game.loose.list.find((x) => looseIs(x, id) && (which === 'any' || (which === 'stowed') === !!x.riding));
    if (!l) return false;
    if (game.seated) game.getOut();
    const w = game.player.walker;
    game.viewMode = 'cockpit';
    const a0 = Math.atan2(w.z - l.z, w.x - l.x);
    for (let k = 0; k < 8; k++) {
      const a = a0 + (k * Math.PI) / 4;
      w.place(l.x + Math.cos(a) * dist, l.z + Math.sin(a) * dist, 0, 0);
      // (the walls and benches push one out: look again from where one ends up)
      for (let i = 0; i < 3; i++) {
        game.simulate(i ? 0.05 : 0);
        const e = w.eye();
        game.input.lookYaw = Math.atan2(l.z - w.z, l.x - w.x);
        game.input.lookPitch = Math.atan2(l.y + l.mid - e.y, Math.hypot(l.x - w.x, l.z - w.z));
      }
      game.simulate(0);
      if (game.player.telemetry().target === `loose:${l.uid}`) return true;
    }
    return false;
  },
  /** put a slot of the hotbar in the hands (0 or 1) */
  select: (i: number) => {
    game.player.select(i);
    game.simulate(0);
    return game.player.telemetry();
  },
  /**
   * Scrub what the mark is on with the cleaning tool in the hands (the left button held): the mouse's point
   * swept across and back `passes` times over a patch w by h (fractions of the screen's half) round the middle,
   * stepping down it, for `seconds`. What is being cleaned afterwards, unit by unit.
   */
  scrub: (seconds = 2, passes = 6, w = 0.3, h = 0.25, cx = 0, cy = 0) => {
    game.player.press('mouse');
    if (!game.player.scrub) return { started: false, target: game.player.telemetry().target, grime: game.grimeTelemetry() };
    const dt = 1 / 60;
    const n = Math.round(seconds / dt);
    for (let k = 0; k < n; k++) {
      const sc = game.player.scrub;
      if (!sc) break;
      const t = k / n;
      const row = t * passes;
      const f = row % 1;
      const x = (Math.floor(row) % 2 === 0 ? f : 1 - f) - 0.5;
      sc.cursor.set(cx + x * w * 2, cy + (0.5 - t) * h * 2);
      game.step(dt, 1);
    }
    game.player.release('mouse');
    for (let k = 0; k < 12; k++) game.step(dt, 1);
    return { started: true, grime: game.grimeTelemetry() };
  },
  grime: () => game.grimeTelemetry(),
  /** hold the use button for a while (fit, pour, spray) */
  useFor: (seconds: number) => {
    game.player.press();
    const dt = 1 / 60;
    for (let t = 0; t < seconds; t += dt) {
      game.player.primary = true;
      game.step(dt, 1);
    }
    game.player.release();
    game.simulate(0);
    return game.player.telemetry();
  },
  /** hold the take-off button for a while */
  takeFor: (seconds: number) => {
    const dt = 1 / 60;
    for (let t = 0; t < seconds; t += dt) {
      game.rightButton = true;
      game.step(dt, 1);
    }
    game.rightButton = false;
    game.simulate(0);
    return game.player.telemetry();
  },
  press: () => {
    game.player.press();
    game.step(1 / 60, 1);
    game.player.release();
    game.simulate(0);
    return game.player.telemetry();
  },
  drop: () => game.player.putDown(),
  /** hold G for a while (put down; looking at a vehicle: into it) */
  dropFor: (seconds: number) => {
    const dt = 1 / 60;
    for (let t = 0; t < seconds; t += dt) {
      game.dropButton = true;
      game.step(dt, 1);
    }
    game.dropButton = false;
    game.simulate(0);
    return game.player.telemetry();
  },
  /** stand by one of a vehicle's zones (cargo.ts: trunk, rear, pass, bed, cabin, pillion), looking at the middle of its floor */
  aimZone: (vi: number, zoneId: string, dist = 1.4) => {
    const v = vehicle(vi);
    const zone = zonesOf(v.view.frame.id).find((z) => z.id === zoneId);
    if (!zone) return false;
    game.simulate(0);
    const model = v.view.model;
    model.updateMatrixWorld(true);
    const o = game.core.origin;
    const cx = (zone.x[0] + zone.x[1]) / 2;
    const cz = (zone.z[0] + zone.z[1]) / 2;
    const p = model.localToWorld(new THREE.Vector3(cx, zone.floor + 0.05, cz)).add(new THREE.Vector3(o.x, o.y, o.z));
    // from behind for what is at the back (a boot, a bed), else from its side
    const back = zone.id === 'trunk' || zone.id === 'bed';
    const lx = back ? zone.x[0] - dist : cx;
    const lz = back ? cz : (cz >= 0 ? zone.z[1] : zone.z[0]) + Math.sign(cz || 1) * dist;
    const s = model.localToWorld(new THREE.Vector3(lx, 0, lz)).add(new THREE.Vector3(o.x, o.y, o.z));
    if (game.seated) game.getOut();
    game.player.walker.place(s.x, s.z, 0, 0);
    const w = game.player.walker;
    const eye = w.eye();
    game.input.lookYaw = Math.atan2(p.z - w.z, p.x - w.x);
    game.input.lookPitch = Math.atan2(p.y - eye.y, Math.hypot(p.x - w.x, p.z - w.z));
    game.viewMode = 'cockpit';
    game.simulate(0);
    return game.player.telemetry();
  },
  /** a zone's floor as drawn from above: how much of it has a floor, its heights, a row across its middle */
  floorOf: (vi: number, zoneId: string) => {
    const v = vehicle(vi);
    const zone = zonesOf(v.view.frame.id).find((z) => z.id === zoneId);
    if (!zone) return null;
    game.cargo.invalidate(v);
    const g = game.cargo.grid(v, zone);
    let n = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (const h of g.h) {
      if (Number.isNaN(h)) continue;
      n++;
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    const mid = Math.floor(g.nz / 2);
    const row: string[] = [];
    for (let i = 0; i < g.nx; i += Math.max(1, Math.floor(g.nx / 14))) row.push(Number.isNaN(g.h[mid * g.nx + i]) ? '.' : g.h[mid * g.nx + i].toFixed(2));
    return { nx: g.nx, nz: g.nz, floor: n / g.h.length, lo, hi, row: row.join(' ') };
  },
  /** what rides in a vehicle: by zone, and its load (kg) and mass */
  stowed: (vi: number) => {
    const v = vehicle(vi);
    const things = game.cargo.ridersOf(v).map((l) => ({ what: l.part?.part ?? (l.tool ? `tool:${l.tool.kind}` : `item:${l.item?.item}`), zone: l.stow ?? '' }));
    return { things, load: game.cargo.loadOf(v), mass: v.sys.derived.mass };
  },
  /** to a section of the proving ground (proving/layout.ts SECTIONS: accel, brake, skidpad, slalom, offroad, hill), with the vehicle */
  provingGo: (id: SectionId) => {
    const s = sectionOf(id);
    game.teleportTo(s.x, s.z, s.yaw, true);
    game.simulate(0);
    const v = game.seated ?? game.focus;
    return v ? { x: v.sim.px, z: v.sim.pz } : null;
  },
  /** to a section with the robot at the wheel (its options: slalomKmh, brakeKmh, ramp) */
  provingRobot: (id: SectionId, opts: { slalomKmh?: number; brakeKmh?: number; ramp?: number } = {}) => {
    const s = game.provingRun;
    if (!s) return false;
    Object.assign(s.robotOpts, opts);
    s.go(id, true);
    game.simulate(0);
    return !!s.pilot;
  },
  /** A (the vehicle as it is) against B (it with a part tried) on a section, the robot driving or not */
  provingAB: (id: SectionId, partId: string, robot = true) => {
    const s = game.provingRun;
    const v = game.seated ?? game.focus;
    if (!s || !v) return 'no session or vehicle';
    const b = tried(v.build, partId);
    if (!b) return 'no place for it';
    return s.compare(id, { build: structuredClone(v.build), what: '车现在的样子' }, { build: b, what: `换上${partDef(partId).name.zh}` }, robot) || 'ok';
  },
  /** where the proving ground's session stands: the run (section, phase, its line), the robot, the comparison, the results */
  provingState: () => {
    const s = game.provingRun;
    if (!s) return null;
    const r = s.runs.current;
    return {
      on: !!s.vehicle,
      run: r ? { section: r.section, phase: r.phase, line: s.runs.line(s.car) } : null,
      robot: s.pilot ? { section: s.pilot.section, doing: s.pilot.doing } : null,
      car: { kmh: s.car.kmh, rpm: s.car.rpm, latG: s.car.latG, slipDeg: s.car.slipDeg },
      results: s.runs.results.map((x) => ({ section: x.section, ok: x.ok, line: x.line, figures: Object.fromEntries(x.figures.map((f) => [f.key, f.value])) })),
      ab: s.ab ? { section: s.ab.section, i: s.ab.i, why: s.ab.why, legs: s.ab.legs.map((l) => ({ label: l.label, what: l.what, line: l.result?.line ?? null })), rows: s.rows() } : null,
      build: game.seated ? encodeBuild(game.seated.build) : null,
    };
  },
  /** the proving ground's level and its cones (where each is, knocked or not) */
  proving: () => ({
    level: game.proving?.level ?? NaN,
    cones: game.provingCones?.cones.map((c) => ({ x: c.x, y: c.y, z: c.z, group: c.group, down: c.down })) ?? [],
  }),
  /** fit a part straight onto a mount (screenshots of builds) */
  fit: (vi: number, mount: string, partId: string) => {
    const v = vehicle(vi);
    fitPart(v.build, mount, newInstance(partId));
    game.changed(v, `on:${mount}`);
    game.simulate(0.3);
    return encodeBuild(v.build);
  },
  remove: (vi: number, mount: string) => {
    const v = vehicle(vi);
    removePart(v.build, mount);
    game.changed(v, `off:${mount}`);
    game.simulate(0.3);
  },
  /** replace a vehicle's whole build */
  setBuild: (vi: number, text: string) => {
    const v = vehicle(vi);
    const b = decodeBuild(text, { fuel: 0.6 });
    v.build.frame = b.frame;
    for (const k of Object.keys(v.build.parts)) delete v.build.parts[k];
    Object.assign(v.build.parts, b.parts);
    game.changed(v, 'build');
    game.simulate(0.5);
    return encodeBuild(v.build);
  },
  paint: (vi: number, mount: string | null, colour: number) => {
    const v = vehicle(vi);
    if (mount) v.build.parts[mount].paint = colour;
    else v.build.paint = colour;
    v.view.refresh();
    game.simulate(0);
  },
  openPanel: (vi: number, mount: string, open = true) => {
    const v = vehicle(vi);
    const ok = v.view.setPanelOpen(mount, open);
    // (as the player's hand does it: a wreck's first look under its bonnet)
    game.panelOpened(v, mount, open);
    game.simulate(0.6);
    return ok;
  },
  enter: (vi = 0) => {
    game.enter(vehicle(vi));
    game.simulate(0);
    return !!game.seated;
  },
  exit: () => {
    game.getOut();
    game.simulate(0);
  },
  crank: (seconds: number) => {
    const v = game.seated;
    if (!v) return false;
    v.sys.crank(true);
    game.simulate(seconds);
    v.sys.crank(false);
    game.simulate(0);
    return v.sys.running;
  },
  /** drive with fixed pedals (the player's input is bypassed); the world goes on as in play */
  drive: (seconds: number, throttle = 1, steer = 0, brake = 0) => {
    const v = game.seated;
    if (!v) return null;
    v.sim.setParkBrake(false);
    game.scripted = { steer, throttle, brake, handbrake: 0 };
    const dt = 1 / 60;
    for (let t = 0; t < seconds; t += dt) game.step(dt, 1);
    game.scripted = null;
    const u = game.seated ?? v;
    return { kmh: u.sim.kmh, place: game.place, rpm: u.sim.rpm, x: u.sim.px };
  },
  /** a new part instance (with a tyre on it, for a rim) — to put down somewhere in a test */
  newPart: (id: string, tyre = '') => {
    const inst = newInstance(id);
    if (tyre) fitSub(inst, 'tire', newInstance(tyre));
    return inst;
  },
  /** a vehicle set down somewhere else (at rest on the ground there), e.g. between the lift's posts */
  placeVehicle: (vi: number, x: number, z: number, yaw = 0) => {
    const v = game.vehicles[vi];
    if (!v) return false;
    const at = new GroundSample();
    game.ground.sample(x, z, at);
    v.sim.reset(x, at.h, z, yaw, game.ground);
    v.awake = 3;
    return true;
  },
  /** what the garage itself costs to draw (meshes, triangles, shadow casters) */
  garageCost: () => (game.garage as unknown as { cost?: () => unknown } | null)?.cost?.() ?? null,
  /** the seated (or focused) vehicle's lights to a position: 'low', 'high' or 'off' */
  lights: (mode: 'off' | 'low' | 'high' = 'low') => {
    const v = game.seated ?? game.focus;
    if (!v) return false;
    for (let i = 0; i < 3 && v.sys.lights !== mode; i++) v.sys.cycleLights();
    game.simulate(0);
    return v.sys.lightsOn;
  },
  dash: () => JSON.parse(JSON.stringify(game.seated?.sys.dash ?? game.focus?.sys.dash ?? null)) as unknown,
  builds: () => game.vehicles.map((v) => encodeBuild(v.build)),
  /** what is on a mount (part id, paint, dirt, rust…), or null */
  part: (vi: number, mount: string) => {
    const inst = vehicle(vi).build.parts[mount];
    return inst ? { part: inst.part, paint: inst.paint, dirt: inst.dirt, rust: inst.rust, cond: inst.cond } : null;
  },
  partName: (id: string) => partDef(id).name,
  /** the developer's parts bin open (true) or shut; what it shows */
  dev: (open?: boolean) => {
    game.toggleDev(open ?? !game.devPanel?.open);
    const p = game.devPanel;
    return { open: !!p?.open, pictures: p?.pictures ?? 0 };
  },
  /** where a point of the view (fractions of the canvas) would put a thing dropped there, or null */
  devPick: (fx: number, fy: number) => {
    const r = canvas.getBoundingClientRect();
    return game.devPick(r.left + fx * r.width, r.top + fy * r.height);
  },
  /** a tile of the bin (part:<id>, tool:<kind>[:fuel[:litres]], vehicle:<frame>:stock|bare) let go at a point of the view; none = clicked (at one's feet) */
  devDrop: (key: string, fx?: number, fy?: number) => {
    const item = devItemOf(key);
    if (!item) throw new Error(`no tile ${key}`);
    let at = null;
    if (fx !== undefined && fy !== undefined) {
      const r = canvas.getBoundingClientRect();
      at = game.devPick(r.left + fx * r.width, r.top + fy * r.height);
      if (!at) return null;
    }
    game.devSpawn(item, at);
    return at ?? { feet: true };
  },
  /** the things lying about */
  loose: () => game.loose.list.map((l) => ({ part: l.part?.part ?? null, tool: l.tool?.kind ?? null, x: l.x, y: l.y, z: l.z, resting: l.resting })),
  /** the developer's panel open on a tab (parts, place, weather, time, look, terrain) */
  devTab: (tab: string) => {
    game.toggleDev(true);
    game.devPanel?.showTab(tab as never);
    return game.devPanel?.tab ?? null;
  },
  /** off to a random place of a kind (devWorld.ts PLACES), or to a distance down the road */
  devGo: (kind: string, bring = true) => game.devTools.go(kind, bring),
  devGoKm: (km: number, bring = true) => game.devTools.goKm(km, bring),
  devWhere: () => game.devTools.where(),
  /** the weather forced (null: the schedule's), the hour, a dial (no value: back to the game's own) */
  devWeather: (kind: string | null, stage?: number | null) => {
    game.devTools.setWeather(kind as never);
    if (stage !== undefined) game.devTools.setStage(stage);
    return game.devTools.forced;
  },
  devHour: (h: number) => {
    game.devTools.setHour(h);
    return game.devTools.hour;
  },
  devDial: (id: string, v?: number) => {
    if (v === undefined) tune.reset(id);
    else tune.set(id, v);
    return tune.get(id);
  },
  devExport: () => tune.export(game.devTools.context()).text,
  /** pieces of the world still to build round the camera */
  worldPending: () => game.worldView?.pending ?? -1,
  /**
   * The world's places anchored within [s0, s1] of the road (of a kind, or any but the verges): their containers
   * (with the side to stand at, the front: −v of the sites' frame) and pumps
   */
  placeSites: (s0: number, s1: number, kind = '') => {
    if (!game.world) return [];
    const out: import('../../core/world/sites').Site[] = [];
    game.world.sites.between(s0, s1, out);
    return out
      .filter((x) => (kind ? x.kind === kind : x.kind !== 'roadside'))
      .map((x) => ({
        id: x.id,
        kind: x.kind,
        s: x.s,
        x: x.x,
        z: x.z,
        containers: x.containers.map((c) => ({ id: c.id, kind: c.kind, x: c.x, y: c.y, z: c.z, h: c.solid ? c.h : 1, hz: c.hz, solid: c.solid, from: Math.atan2(-Math.cos(c.yaw), Math.sin(c.yaw)) })),
        pumps: x.objects.filter((o) => o.kind === 'pump').map((o) => ({ x: o.x, y: o.y, z: o.z, d: o.d, from: Math.atan2(-Math.cos(o.yaw), Math.sin(o.yaw)) })),
        loose: x.loose.length,
      }));
  },
  /** the places there now (places.ts) */
  places: () => JSON.parse(JSON.stringify(game.places?.telemetry() ?? null)) as unknown,
  /** what the list shows now (a container's: its name and rows; null: shut) */
  listOpen: () => {
    const g = game as unknown as { listV: unknown; containerRows?: (pc: unknown) => { name: string }[] };
    const v = g.listV as { kind?: string; name?: string; contents?: unknown[] } | null;
    if (!v) return null;
    return v.kind === 'container' ? { container: v.name ?? '', n: v.contents?.length ?? 0 } : { other: true };
  },
  take: () => {
    game.takeFromList();
    game.simulate(0);
    return game.player.held ? heldName(game.player.held) : null;
  },
  /** the wrecks about (wrecks.ts): how many there, kept, taken, and each one there */
  wrecks: () => JSON.parse(JSON.stringify(game.wreckTelemetry())) as unknown,
  /** the world's wrecks anchored within [s0, s1] of the road, each with what it is (its roll) */
  wreckSpots: (s0: number, s1: number) =>
    game.world
      ? wreckSpots(game.world, s0, s1).map((w) => {
          const r = rollWreck(w.seed, w.type, w.stripped, w.s);
          return { ...w, frame: r.build.frame, parts: Object.keys(r.build.parts).length, finds: r.finds.map((f) => f.part), rare: r.finds.filter((f) => isRare(r.build.frame, f.part)).map((f) => f.part), things: r.items.length + r.tools.length, hood: !!r.build.parts.hood, seat: !!r.build.parts.seat_driver };
        })
      : [],
  /** a biome's numbers as the world was made with them (the terrain dials write into them) */
  biomeDef: (id: string) => ({ ...BIOMES.find((b) => b.id === id) }),
  /**
   * The V3 kernel (docs/V3/nodes/N0-foundation.md): the modules installed, each system's times against its
   * budget, the save slices, the world's clock, and the last thing the kernel reported and set apart. A
   * system's own test functions are reached through the game: game.systems.harness(id, name, ...args).
   */
  kernel: () => game.kernel.telemetry(),
};
(window as unknown as { __rt: typeof rt }).__rt = rt;
// what the kernel sets apart (a V3 system that throws in its hook, a listener, a slice) is the last error too:
// the scripts look there to know that a run went wrong
game.kernel.onError = (message) => {
  rt.lastError = message;
};
if (game.kernel.log.last) rt.lastError = game.kernel.log.last;

// the loading card until the garage and its parts are in (not in screenshots)
if (!params.shot) {
  game.ui.showLoading(0);
  const tick = (): void => {
    if (rt.ready) return;
    game.ui.showLoading(loadStats.requested ? loadStats.done / loadStats.requested : 0);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

void game.ready.then(() => {
  game.ui.showLoading(null);
  // back from making the world again (the panel's terrain tab, a new world): the panel open where it was
  const dp = q.get('devpanel');
  if (dp) {
    game.toggleDev(true);
    game.devPanel?.showTab(dp as never);
  }
  if (params.shot) {
    game.simulate(0.8);
    game.render();
    rt.ready = true;
    return;
  }
  let last = performance.now();
  let failed = '';
  const loop = (now: number): void => {
    // (the next frame is asked for first: a frame that throws must not stop the game for good)
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    try {
      game.frame(dt);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      rt.lastError = msg;
      if (msg !== failed) {
        failed = msg;
        console.error(e);
        game.ui.say('出了个小错，已跳过，游戏继续。', 3);
      }
    }
    rt.ready = true;
  };
  requestAnimationFrame(loop);
});
