import * as THREE from 'three';
import { Game, type ViewMode } from './game';
import { readParams } from './params';
import { applyOp, CarrierStores, fillerChannel, planOp, SimpleInventory, type ItemInstance, type OpRequest } from '../core/vehicle/systems';
import { Hands } from '../core/items/carry';
import { playerHooks } from './player/hooks'; // player

const canvas = document.getElementById('view') as HTMLCanvasElement;
const params = readParams();
const game = new Game(canvas, params);

const gl = game.core.renderer.getContext();
const dbg = gl.getExtension('WEBGL_debug_renderer_info');

/** Debug / test hook. The screenshot harness drives the game through this object. */
const rt = {
  ready: false,
  game,
  params,
  info: {
    webgl2: gl instanceof WebGL2RenderingContext,
    renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown',
    three: THREE.REVISION,
  },
  simulate: (seconds: number, input?: Parameters<Game['simulate']>[1]) => game.simulate(seconds, input),
  render: () => game.render(),
  setView: (v: ViewMode) => {
    game.viewMode = v;
    game.simulate(0);
  },
  /** sit at one of the vehicle's places ('' or 'driver' = the wheel) */
  setSeat: (name: string) => {
    const ok = game.setSeat(name);
    game.simulate(0);
    return ok;
  },
  /** open / shut a mover: door, awning, passengerSeat, curtain (0 … 1) */
  setMover: (name: string, t: number) => {
    const ok = game.view.setMover(name, t);
    game.simulate(0);
    return ok;
  },
  // cab controls: press one by id (screenshots and tests), turn the key to see the self-check after `seconds`
  cabUse: (id: string, times = 1) => {
    let ok = false;
    for (let i = 0; i < times; i++) ok = game.cab.operate(id);
    game.simulate(0);
    return ok;
  },
  selfCheck: (seconds: number) => {
    game.systems.turnKey('off');
    game.simulate(0);
    game.systems.turnKey('on');
    game.simulate(seconds);
    return game.systems.dash.selfCheck.step;
  },
  /** 'all' | 'none' | 'default' | comma list of slot ids */
  setSlots: (mode: string) => {
    game.setSlots(mode);
    game.simulate(0);
  },
  setCutaway: (on: boolean) => {
    game.view.setCutaway(on);
    game.simulate(0);
  },
  setCamp: (on: boolean) => {
    game.setCamp(on);
    game.simulate(0);
  },
  /** orbit camera: yaw, pitch (deg), distance (m), height looked at (m) */
  setOrbit: (yaw: number, pitch: number, dist: number, targetH = game.orbit.target) => {
    game.viewMode = 'orbit';
    game.orbit.yaw = (yaw * Math.PI) / 180;
    game.orbit.pitch = (pitch * Math.PI) / 180;
    game.orbit.dist = dist;
    game.orbit.target = targetH;
    game.simulate(0);
  },
  /** E: stand up / sit down on the nearest seat */
  use: () => {
    game.standOrSit();
    game.simulate(0);
    return game.walker ? 'walking' : game.seat || 'driver';
  },
  /** walk for a while with the stick held (forward, right), heading = the look */
  walk: (seconds: number, forward: number, right: number, yaw?: number) => {
    if (!game.walker) return null;
    if (yaw !== undefined) game.input.lookYaw = yaw;
    const dt = 1 / 60;
    for (let t = 0; t < seconds; t += dt) {
      game.walker.yaw = game.input.lookYaw;
      game.walker.step(dt, forward, right);
    }
    game.simulate(0);
    return { x: game.walker.x, z: game.walker.z };
  },
  /** cabin lamp on / off; null = with the dark */
  setCabinLight: (on: boolean | null) => {
    game.cabinLightManual = on;
    game.simulate(0);
  },
  look: (yaw: number, pitch: number) => {
    game.input.lookYaw = yaw;
    game.input.lookPitch = pitch;
    game.simulate(0);
  },
  ...playerHooks(game), // player: footOut, footAt, footWalk, footLook, footUse, …
  // world: the animals ignore the car and the walker (screenshots); what stands near the player
  tameAnimals: (on = true) => {
    game.tame = on;
  },
  animals: () => game.fauna?.near(game.player.onFoot ? game.player.walker.x : game.sim.px, game.player.onFoot ? game.player.walker.z : game.sim.pz, 400, []).map((a) => ({ id: a.id, state: a.state, x: a.x, z: a.z })) ?? [],
  telemetry: () => game.telemetry(),
  setHour: (h: number) => {
    game.setHour(h);
    game.simulate(0);
  },
  setWeather: (k: string | null) => {
    game.setWeather(k as never);
    game.simulate(0);
  },
  /** teleport to distance s along the road and settle */
  goto: (s: number) => {
    game.placeOnRoad(s);
    game.simulate(0.6);
  },
  /** vehicle systems: dashboard telemetry, state, operations and the driver's controls (docs/VEHICLE_SYSTEMS.md §11) */
  sys: {
    dash: () => JSON.parse(JSON.stringify(game.systems.dash)) as unknown,
    state: () => game.systems.toJSON(),
    /** plan (dry = true) or perform an operation with a given inventory (ids or instances) */
    op: (req: OpRequest, items: (ItemInstance | string)[] = [], people = 1, dry = false) => {
      const ctx = { inv: new SimpleInventory(items), people };
      const r = dry ? planOp(game.systems, req, ctx) : applyOp(game.systems, req, ctx);
      game.simulate(0);
      return { ...r, inventory: ctx.inv.items };
    },
    /** plan or perform an operation with what the player actually holds (hands and backpack) */
    opHeld: (req: OpRequest, dry = false) => {
      const ctx = { inv: new CarrierStores([game.player]), people: 1 };
      const r = dry ? planOp(game.systems, req, ctx) : applyOp(game.systems, req, ctx);
      game.simulate(0);
      return r;
    },
    key: (pos: 'off' | 'acc' | 'on') => {
      game.systems.turnKey(pos);
      game.simulate(0);
      return game.systems.dash.ignition;
    },
    /** hold the starter for a while (s); returns whether it is running */
    crank: (seconds: number) => {
      game.systems.crank(true);
      game.simulate(seconds);
      game.systems.crank(false);
      return game.systems.state.running;
    },
    lever: (delta: number) => {
      const ok = game.systems.stepLever(delta);
      game.simulate(0);
      return { ok, selector: game.sim.selector, gear: game.systems.dash.gearLabel };
    },
    manual: () => game.systems.toggleManual(),
    handbrake: (on: boolean) => {
      game.systems.setHandbrake(on);
      game.simulate(0);
    },
    lights: (l: 'off' | 'auto' | 'low' | 'high') => {
      game.systems.setLights(l);
      game.simulate(0);
    },
    assist: (a: 'relaxed' | 'real') => game.systems.setAssist(a),
    puncture: (wheel: number) => {
      game.systems.puncture(wheel);
      game.systems.applyMods();
      game.simulate(0);
    },
    /** pour a jerrycan into the tank for a while (the fuel needle moves; screenshots) — returns litres in the tank */
    pour: (seconds: number, litres = 10) => {
      const hands = new Hands();
      hands.set('fuel.jerrycan', litres);
      const dt = 1 / 30;
      for (let t = 0; t < seconds; t += dt) {
        if (!fillerChannel(game.systems, hands, 'pour', null, dt)) break;
        game.simulate(dt);
      }
      game.simulate(0);
      return game.systems.state.fuelL;
    },
    /** same syntax as the ?sys= URL key */
    set: (patch: string) => {
      game.patchSystems(patch);
      game.simulate(0);
    },
  },
  spineHash: (n: number) => (game.world ? game.world.spine.hash(n) : 0),
  /** let a bolt of lightning go now (weather screenshots) */
  strike: () => {
    game.env.strike();
    game.simulate(0);
  },
  /** start sound and report whether it is running and audible (test hook) */
  audioProbe: async (waitMs = 500) => {
    const started = game.audio.start();
    game.simulate(0);
    // Wait on the audio clock, not the wall clock: under software rendering the sound thread starts late
    // and may make a fifth of a second of sound in two seconds, and the gains ramp in its time.
    const t0 = performance.now();
    const need = Math.min(0.4, waitMs / 1000);
    while (game.audio.clock < need && performance.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 50));
    game.simulate(0);
    let rms = 0;
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 40));
      rms = Math.max(rms, game.audio.rms());
    }
    return { started, running: game.audio.running, rms, debug: game.audio.debug() };
  },
  /**
   * Drive with the robot using the live frame path (budgeted streaming), without drawing.
   * Returns streaming statistics: how far behind the builder got and its longest single build.
   */
  drive: (seconds: number, fps = 30) => {
    game.setRobot(true);
    const dt = 1 / fps;
    let maxPending = 0;
    let sumPending = 0;
    let frames = 0;
    const wv = game.worldView;
    if (wv) wv.maxBuildMs = 0;
    const t0 = performance.now();
    for (let t = 0; t < seconds; t += dt) {
      game.step(dt);
      const p = wv ? wv.pending : 0;
      if (p > maxPending) maxPending = p;
      sumPending += p;
      frames++;
    }
    return {
      maxPending,
      meanPending: sumPending / Math.max(1, frames),
      maxBuildMs: wv ? wv.maxBuildMs : 0,
      builds: wv ? wv.totalBuilds : 0,
      cpuMsPerFrame: (performance.now() - t0) / Math.max(1, frames),
      kmh: game.sim.kmh,
    };
  },
};
// the screenshot sets' "call" steps reach top-level methods only
(rt as Record<string, unknown>).sysPour = rt.sys.pour;
(rt as Record<string, unknown>).sysSet = rt.sys.set;
(window as unknown as { __rt: typeof rt }).__rt = rt;

if (params.shot) {
  // harness mode: settle on the suspension, draw once, then wait for commands
  game.simulate(0.5);
  game.render();
  rt.ready = true;
} else {
  let last = performance.now();
  const loop = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    game.frame(dt);
    rt.ready = true;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
