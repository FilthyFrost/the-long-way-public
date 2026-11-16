/**
 * Entry of the ModCar game (index.html and modcar.html; the game before it is classic.html). Builds ModGame and the
 * test hook `window.__rt` the screenshot harness and the journey scripts drive it through.
 */
import * as THREE from 'three';
import { decodeBuild, encodeBuild, fitPart, fitSub, newInstance, removePart } from '../../core/modcar/build';
import { partDef } from '../../core/modcar/parts';
import { BIOMES } from '../../core/world/biomes';
import { newTool, type ToolKind } from '../../core/modcar/tools';
import { GroundSample } from '../../core/world/ground';
import { readParams } from '../params';
import { loadStats } from './assets';
import { devItemOf } from './devPanel';
import { Tune } from './devTune';
import { ModGame, readModParams, type ViewMode } from './ModGame';
import { clearSave, loadSave } from './save';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const base = readParams();
const fresh = readModParams(base);
// a game in progress goes on, unless the address asks for something of its own (the harness, a test drive)
const q = new URLSearchParams(location.search);
if (q.has('new')) clearSave();
const own = fresh.shot || ['start', 'build', 'project', 'garage'].some((k) => q.has(k));
// (?new=1: the save cleared, a new game kept from here on)
const save = own || q.has('new') ? null : loadSave();
const params = save
  ? { ...fresh, keep: true, start: save.place, time: save.hour, s: save.road?.s ?? fresh.s, seed: save.road?.seed ?? fresh.seed, weather: save.place === 'road' ? base.weather : fresh.weather }
  : { ...fresh, keep: !own };
// the developer's dials, the terrain's among them, are in before the world is made
const tune = new Tune();
tune.applyAll();
const game = new ModGame(canvas, params, save, tune);

const gl = game.core.renderer.getContext();
const dbg = gl.getExtension('WEBGL_debug_renderer_info');

const vehicle = (i: number) => {
  const v = game.vehicles[i];
  if (!v) throw new Error(`no vehicle ${i}`);
  return v;
};

const rt = {
  ready: false,
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
  /** put a new part (or a tool kind prefixed with "tool:") into the hands */
  hold: (id: string, opts: Record<string, unknown> = {}) => {
    if (id.startsWith('tool:')) game.player.held = { kind: 'tool', tool: newTool(id.slice(5) as ToolKind, opts) };
    else game.player.held = { kind: 'part', inst: newInstance(id) };
    game.simulate(0);
    return game.player.telemetry();
  },
  /** pick up the first loose thing of a part id */
  pickUp: (id: string) => {
    const l = game.loose.list.find((x) => x.part?.part === id || (x.tool && `tool:${x.tool.kind}` === id));
    if (!l) return false;
    game.loose.remove(l);
    game.player.held = l.part ? { kind: 'part', inst: l.part } : { kind: 'tool', tool: l.tool! };
    game.simulate(0);
    return true;
  },
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
      game.player.secondary = true;
      game.step(dt, 1);
    }
    game.player.secondary = false;
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
    const ok = vehicle(vi).view.setPanelOpen(mount, open);
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
  /** a biome's numbers as the world was made with them (the terrain dials write into them) */
  biomeDef: (id: string) => ({ ...BIOMES.find((b) => b.id === id) }),
};
(window as unknown as { __rt: typeof rt }).__rt = rt;

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
  const loop = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    game.frame(dt);
    rt.ready = true;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
