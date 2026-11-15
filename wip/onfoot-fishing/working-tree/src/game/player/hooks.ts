/**
 * The player's test hooks on window.__rt (the screenshot sets and the browser tests drive the
 * player through these). Every call settles the views (simulate(0)) so a render after it is current.
 */
import type { Game } from '../game';
import { Angler } from '../../core/fishing/angler';

export function playerHooks(game: Game) {
  const p = game.player;
  const settle = (): void => game.simulate(0);
  return {
    /** get out of the vehicle (beside the nearest door); returns the mode after */
    footOut: () => {
      p.getOut();
      settle();
      return p.modes.mode;
    },
    /** stand on foot at a world point facing heading (rad; 0 = +x, π/2 = +z) */
    footAt: (x: number, z: number, heading = 0) => {
      const ok = p.standAt(x, z, heading);
      settle();
      return ok;
    },
    /** walk with the stick held for a while (fixed steps); heading in rad, or keep the current one */
    footWalk: (seconds: number, forward: number, right = 0, heading?: number, run = false) => {
      p.walk(seconds, forward, right, heading, run);
      settle();
      const w = p.walker;
      return { x: w.x, y: w.y, z: w.z, swimming: w.swimming };
    },
    /** look: heading and pitch (rad) */
    footLook: (heading: number, pitch: number) => {
      p.walker.heading = heading;
      p.walker.pitch = pitch;
      game.input.lookYaw = heading;
      game.input.lookPitch = pitch;
      settle();
    },
    /** turn by deg (+ = right) and set the pitch (deg) */
    footTurn: (deg: number, pitchDeg = 0) => {
      p.walker.heading += (deg * Math.PI) / 180;
      p.walker.pitch = (pitchDeg * Math.PI) / 180;
      game.input.lookYaw = p.walker.heading;
      game.input.lookPitch = p.walker.pitch;
      settle();
    },
    /** E, as if pressed and let go (seated: stand up or get out; on foot: use what is looked at) */
    footUse: () => {
      if (!p.onFoot) {
        p.use();
        settle();
        return p.modes.mode;
      }
      p.eScripted = true;
      p.tickUse(0);
      p.eScripted = false;
      p.tickUse(1 / 30);
      settle();
      return p.modes.mode;
    },
    /** hold E for a while (1/30 s steps) on what is looked at; release = let go at the end */
    footHold: (seconds: number, release = true) => {
      p.eScripted = true;
      for (let t = 0; t < seconds - 1e-9; t += 1 / 30) p.tickUse(1 / 30);
      if (release) {
        p.eScripted = false;
        p.tickUse(1 / 30);
      }
      settle();
      return { word: p.use_.word, ring: p.use_.ring };
    },
    /** what is looked at now and its word */
    footLooked: () => {
      p.tickUse(0);
      return { id: p.looked?.id ?? null, word: p.use_.word };
    },
    /** hold G until what is in the hands is put down */
    footPut: () => {
      p.gScripted = true;
      for (let t = 0; t < 1; t += 1 / 30) p.tickUse(1 / 30);
      p.gScripted = false;
      p.tickUse(1 / 30);
      settle();
      return p.hands.id;
    },
    /** open / close the backpack panel */
    footPack: (open: boolean) => {
      p.packOpen = open;
      settle();
    },
    /** turn to face a world point (heading only; pitch in deg) */
    footFace: (x: number, z: number, pitchDeg = 0) => {
      p.walker.heading = Math.atan2(z - p.walker.z, x - p.walker.x);
      p.walker.pitch = (pitchDeg * Math.PI) / 180;
      game.input.lookYaw = p.walker.heading;
      game.input.lookPitch = p.walker.pitch;
      settle();
    },
    /** face a registered thing (loose key, container id, fuel id) from where one stands */
    footFaceThing: (id: string) => {
      const l = p.loose.get(id);
      const c = p.containers.get(id);
      const f = p.fuel.get(id);
      const t = l ? { x: l.x, y: l.y + 0.05, z: l.z } : c ? { x: c.def.x, y: c.def.y + c.def.h, z: c.def.z } : f ? { x: f.x, y: f.y, z: f.z } : null;
      if (!t) return false;
      p.walker.eye(p.eye);
      const dx = t.x - p.eye.x;
      const dz = t.z - p.eye.z;
      p.walker.heading = Math.atan2(dz, dx);
      p.walker.pitch = Math.atan2(t.y - p.eye.y, Math.hypot(dx, dz));
      game.input.lookYaw = p.walker.heading;
      game.input.lookPitch = p.walker.pitch;
      settle();
      return true;
    },
    /** debug: put a thing straight into the hands (screenshots) */
    footGive: (id: string, fill = 0) => {
      p.hands.set(id, fill);
      settle();
    },
    /** put what is in the hands onto the vehicle's cargo places */
    footCargo: () => {
      const ok = p.cargo.bay ? p.cargo.bay.putFrom(p) : false;
      settle();
      return ok;
    },
    /** climb onto the truck's bed (as the 爬上去 use does) */
    footClimb: () => {
      const spec = p.cargo.bay?.spec.climb;
      if (!spec) return false;
      const b = new Float64Array(9);
      game.sim.basis(b);
      const x = game.sim.px + b[0] * spec.x + b[6] * spec.z;
      const z = game.sim.pz + b[2] * spec.x + b[8] * spec.z;
      const ok = p.walker.place(x, z, p.walker.heading, 0.5);
      settle();
      return ok;
    },
    /** fishing: a robot angler holds the rod ('competent' | 'careless'), or the mouse does (null) */
    fishBot: (kind: 'competent' | 'careless' | null, seed = 1) => {
      p.fishing.bot = kind ? new Angler(kind, seed) : null;
    },
    /** fishing: run for up to `seconds` (fixed steps), stopping at a phase if given; returns the state */
    fishRun: (seconds: number, phase?: string) => {
      const a = p.fishing.angling;
      p.fishing.run(seconds, phase === 'shown' ? () => p.fishing.shown !== null : phase ? () => a.phase === phase : undefined);
      settle();
      return { phase: a.phase, tension: a.tension, run: a.run, shadows: p.fishing.school.shadows.length, shown: p.fishing.shown, last: p.fishing.lastCatch };
    },
    /** fishing: run until the fish is running (the rod bent against it) */
    fishRunning: (maxSeconds = 20) => {
      const a = p.fishing.angling;
      p.fishing.run(maxSeconds, () => a.phase === 'fight' && a.run !== 'none');
      p.fishing.run(0.5, () => a.phase !== 'fight');
      settle();
      return { phase: a.phase, run: a.run, tension: a.tension };
    },
    /** fishing: what is drawn (debugging the views) */
    fishDebug: () => {
      const f = p.fishing as unknown as { shadowMesh: { visible: boolean; geometry: { getAttribute(n: string): { count: number; array: ArrayLike<number> } | undefined }; material: { transparent: boolean } } };
      const pos = f.shadowMesh.geometry.getAttribute('position');
      const cam = game.core.camera.position;
      const sm = (p.fishing as unknown as { shadowMesh: import('three').Mesh }).shadowMesh;
      game.render();
      const c1 = game.core.stats.calls;
      sm.visible = false;
      game.render();
      const c0 = game.core.stats.calls;
      sm.visible = true;
      const extra = { parent: sm.parent?.type, mvis: (sm.material as import('three').Material).visible, transparent: (sm.material as import('three').Material).transparent, layers: sm.layers.mask, camLayers: game.core.camera.layers.mask, range: sm.geometry.drawRange, c1, c0, onBefore: String(sm.onBeforeRender).slice(0, 60) };
      return { extra, visible: f.shadowMesh.visible, verts: pos?.count ?? 0, first: pos ? Array.from(pos.array).slice(0, 3) : [], cam: [cam.x, cam.y, cam.z], shadows: p.fishing.school.shadows.map((s) => [s.x, s.z, s.state]), calls: game.core.stats.calls };
    },
    footSave: () => JSON.stringify(p.save()),
    footLoad: (json: string) => {
      p.load(JSON.parse(json));
      settle();
    },
    footState: () => ({ mode: p.modes.mode, ...p.walker.toJSON(), depth: p.walker.depth, hands: p.hands.id, fill: p.hands.fill, pack: p.pack.list(), looked: p.looked?.id ?? null, word: p.use_.word }),
  };
}
