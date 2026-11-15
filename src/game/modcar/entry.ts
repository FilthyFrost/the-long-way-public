/**
 * Entry of the ModCar game (modcar.html; index.html once it is the default). Builds ModGame and the
 * test hook `window.__rt` the screenshot harness and the journey scripts drive it through.
 */
import * as THREE from 'three';
import { decodeBuild, encodeBuild, fitPart, newInstance, removePart } from '../../core/modcar/build';
import { partDef } from '../../core/modcar/parts';
import { newTool, type ToolKind } from '../../core/modcar/tools';
import { readParams } from '../params';
import { ModGame, readModParams, type ViewMode } from './ModGame';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const params = readModParams(readParams());
const game = new ModGame(canvas, params);

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
    const p = n.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(game.core.origin.x, game.core.origin.y, game.core.origin.z));
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
  /** what the garage itself costs to draw (meshes, triangles, shadow casters) */
  garageCost: () => (game.garage as unknown as { cost?: () => unknown } | null)?.cost?.() ?? null,
  dash: () => JSON.parse(JSON.stringify(game.seated?.sys.dash ?? game.focus?.sys.dash ?? null)) as unknown,
  builds: () => game.vehicles.map((v) => encodeBuild(v.build)),
  partName: (id: string) => partDef(id).name,
};
(window as unknown as { __rt: typeof rt }).__rt = rt;

void game.ready.then(() => {
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
