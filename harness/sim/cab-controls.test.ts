/**
 * The cab's operable parts (docs/VEHICLE_SYSTEMS.md §11.1, the model track's cab package), in Node:
 * every control flips its state in the vehicle systems (or its mover) and back; every control's
 * posed part really moves; every control point is within pick range of the seat that reaches it
 * and nothing of the vehicle stands between the eye and it; the live dash tells the truth.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PICK_RANGE } from '../../src/core/interact/interact';
import { VehicleSim, zeroInput } from '../../src/core/vehicle/sim';
import { VEHICLES } from '../../src/core/vehicle/spec';
import { stockState, VehicleSystems } from '../../src/core/vehicle/systems';
import { Containers } from '../../src/core/items/containers';
import { FlatGround } from '../../src/core/world/ground';
import { SolidSet, type Solid } from '../../src/core/world/solids';
import { baseId, CabControls, reaches, WINDOW_STEP } from '../../src/game/vehicle/controls';
import type { Reach, VehicleParts } from '../../src/game/vehicle/kit';
import { buildVehicle, MODELS } from '../../src/game/vehicle/models';

interface FakeGame {
  sim: VehicleSim;
  systems: VehicleSystems;
  view: { parts: VehicleParts; moverState: Record<string, number>; setMover(n: string, t: number): boolean; cabinLight: boolean; lightsOn: boolean };
  player: undefined;
  robot: null;
  lightsManual: boolean | null;
  cabinLightManual: boolean | null;
  seat: string;
  walker: null;
  env: { dark: boolean };
}

function rig(id: string): { g: FakeGame; cab: CabControls } {
  const spec = VEHICLES[id];
  const parts = buildVehicle(spec);
  const sim = new VehicleSim(spec);
  sim.reset(0, 0, 0, 0);
  const ground = new FlatGround();
  for (let t = 0; t < 1; t += sim.h) sim.substep(zeroInput(), ground);
  const systems = new VehicleSystems(spec, stockState(spec, 1, { fresh: true })).bind(sim);
  const moverState: Record<string, number> = {};
  for (const k of Object.keys(parts.movers)) moverState[k] = 0;
  const g: FakeGame = {
    sim,
    systems,
    view: {
      parts,
      moverState,
      setMover(n, t) {
        const m = parts.movers[n];
        if (!m) return false;
        moverState[n] = t;
        m.set(t);
        return true;
      },
      cabinLight: false,
      lightsOn: false,
    },
    player: undefined,
    robot: null,
    lightsManual: null,
    cabinLightManual: null,
    seat: '',
    walker: null,
    env: { dark: false },
  };
  const cab = new CabControls(g as never);
  return { g, cab };
}

/** a vertex-position fingerprint of the vehicle (a posed part moved or not) */
function fingerprint(p: VehicleParts): string {
  p.root.updateMatrixWorld(true);
  let sx = 0;
  let sy = 0;
  let sz = 0;
  const v = new THREE.Vector3();
  p.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      sx += v.x;
      sy += v.y;
      sz += v.z;
    }
  });
  return [sx, sy, sz].map((n) => n.toFixed(3)).join(',');
}

/** the eye of a reach: the driver's eye, the passenger's, the nearest seat, a walker inside, outside */
function eyesOf(p: VehicleParts, eye: { x: number; y: number; z: number }, where: Reach, at: THREE.Vector3, behindOpenDoor = false): THREE.Vector3[] {
  if (where === 'driver') return [new THREE.Vector3(eye.x, eye.y, eye.z)];
  const seats = Object.values(p.views).filter((v) => v.seat);
  if (where === 'passenger') return seats.filter((_, i) => Object.keys(p.views).filter((k) => p.views[k].seat)[i] === 'passenger').map((v) => new THREE.Vector3(v.x, v.y, v.z));
  if (where === 'seated') return [new THREE.Vector3(eye.x, eye.y, eye.z), ...seats.map((v) => new THREE.Vector3(v.x, v.y, v.z))];
  if (where === 'onboard') return Object.values(p.views).filter((v) => !v.seat).map((v) => new THREE.Vector3(v.x, v.y, v.z)).sort((a, b) => a.distanceTo(at) - b.distanceTo(at)).slice(0, 1);
  // outside: a person standing 0.6 m out from the point, eye 1.6 m above the ground
  const out = at.clone();
  const hb = p.hull ?? new THREE.Box3().setFromObject(p.root.getObjectByName('body')!);
  // stand off the nearest face of the body
  const faces: [number, () => void][] = [
    [hb.max.z - at.z, () => (out.z = hb.max.z + 0.6)],
    [at.z - hb.min.z, () => (out.z = hb.min.z - 0.6)],
    [hb.max.x - at.x, () => (out.x = hb.max.x + 0.6)],
    [at.x - hb.min.x, () => (out.x = hb.min.x - 0.6)],
  ];
  faces.sort((a, b) => a[0] - b[0])[0][1]();
  // reached through a door that stands open: from beside the opening, behind the door (it is hinged at the front)
  if (behindOpenDoor) out.x -= 0.5;
  out.y = hb.min.y + (1.6 - 0.3);
  return [out];
}

const withControls = Object.keys(MODELS).filter((id) => buildVehicle(VEHICLES[id]).controls);

describe('cab controls: which vehicles have them', () => {
  it('the van has its cab controls', () => {
    expect(withControls).toContain('t1_van');
  });
});

for (const id of withControls) {
  describe(`cab controls · ${id}`, () => {
    it('every control flips its state in the systems (or its mover) and back', () => {
      const { g, cab } = rig(id);
      const sys = g.systems;
      for (const u of cab.uses) {
        const b = baseId(u.cid);
        const word = cab.word(b);
        if (b === 'key' || b === 'horn') {
          // held: the starter turns (or a running engine stops), the horn sounds; let go: they stop
          const env = { ambientC: 15, dark: false, rain: 0 };
          const running = sys.state.running;
          cab.channel(b, null as never, 0.1);
          sys.update(0.01, env);
          if (b === 'horn') expect(sys.dash.horn, 'horn').toBe(true);
          else if (running) expect(sys.state.ignition, 'key: stopped').toBe('off');
          else expect(sys.state.ignition, 'key: on and cranking').toBe('on');
          cab.update(0.016);
          sys.update(0.01, env);
          if (b === 'horn') expect(sys.dash.horn).toBe(false);
          continue;
        }
        if (b === 'selector') {
          const before = g.sim.selector;
          g.sim.shift('P');
          expect(cab.operate(b), 'lever towards D').toBe(true);
          expect(g.sim.selector).toBe('R');
          expect(u.long?.act(null as never)).toBe(true);
          expect(g.sim.selector).toBe('P');
          g.sim.shift(before);
          continue;
        }
        if (b === 'stopCord') {
          expect(cab.operate(b)).toBe(true);
          continue;
        }
        const read = (): string =>
          JSON.stringify([sys.state.lights, sys.state.wipers, sys.state.hazard, sys.state.radio, g.sim.parkBrake > 0, g.cabinLightManual, cab.radio.tune, cab.radio.volume, g.view.moverState[b] ?? null]);
        if ((b === 'tune' || b === 'volume') && !sys.state.radio) sys.setRadio(true);
        const was = read();
        expect(word ?? cab.word(b), `${u.cid}: no word`).toBeTruthy();
        expect(cab.operate(b), `${u.cid}: refused`).toBe(true);
        expect(read(), `${u.cid}: nothing changed`).not.toBe(was);
        // and back: toggles once more, cycles round, windows step down and come up
        const n = b === 'lights' || b === 'wipers' ? 3 : b === 'tune' ? 8 : b === 'volume' ? 3 : b.startsWith('window') ? Math.round(1 / WINDOW_STEP) : 1;
        if (b === 'cabinLamp') g.view.cabinLight = g.cabinLightManual ?? false;
        for (let i = 0; i < n; i++) {
          cab.operate(b);
          if (b === 'cabinLamp') g.view.cabinLight = g.cabinLightManual ?? false;
        }
        if (b === 'cabinLamp') expect(g.cabinLightManual).toBe(false);
        else expect(read(), `${u.cid}: did not come back`).toBe(was);
      }
    });

    it('every part a control poses really moves, and comes back', () => {
      const { g } = rig(id);
      const p = g.view.parts;
      const ctlIds = new Set(Object.keys(p.controls ?? {}).map((k) => k.split('@')[0]));
      const names = Object.keys(p.movers).filter((m) => m.startsWith('ctl:') || ctlIds.has(m));
      expect(names.length).toBeGreaterThan(5);
      const rest = fingerprint(p);
      for (const m of names) {
        p.movers[m].set(1);
        expect(fingerprint(p), `${m} moved nothing`).not.toBe(rest);
        p.movers[m].set(0);
        expect(fingerprint(p), `${m} did not come back`).toBe(rest);
      }
    });

    it('every control is within pick range of whoever reaches it, and nothing of the vehicle is in between', () => {
      const { g } = rig(id);
      const p = g.view.parts;
      p.root.updateMatrixWorld(true);
      const solids: THREE.Mesh[] = [];
      p.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.Material;
        if (mat.transparent || m.name === 'windscreen' || m.name.startsWith('glass')) return;
        if (p.wheels.some((w) => { for (let q: THREE.Object3D | null = m; q; q = q.parent) if (q === w.pivot) return true; return false; })) return;
        solids.push(m);
      });
      const spec = g.sim.spec;
      for (const [cid, pt] of Object.entries(p.controls!)) {
        const at = new THREE.Vector3(pt.x, pt.y, pt.z);
        expect(pt.from.length, cid).toBeGreaterThan(0);
        if (pt.needsOpen) {
          p.movers[pt.needsOpen].set(1);
          p.root.updateMatrixWorld(true);
        }
        for (const where of pt.from) {
          // every eye of the reach must see it — except 'seated', where one seat that does is enough
          const why: string[] = [];
          let any = false;
          for (const e of eyesOf(p, spec.eye, where, at, !!pt.needsOpen && /^door/.test(pt.needsOpen))) {
            const d = e.distanceTo(at);
            if (d - pt.r > PICK_RANGE) {
              why.push(`${d.toFixed(2)} m away`);
              continue;
            }
            // the ray stops short of the thing by its size (its own part is not in its way)
            const far = Math.max(0, d - pt.r - 0.02);
            const rc = new THREE.Raycaster(e, at.clone().sub(e).normalize(), 0.01, far);
            const saved = solids.map((m) => (m.material as THREE.Material).side);
            for (const m of solids) (m.material as THREE.Material).side = THREE.DoubleSide;
            const hits = rc.intersectObjects(solids, false);
            solids.forEach((m, i) => ((m.material as THREE.Material).side = saved[i]));
            if (hits.length) why.push(`hidden by ${hits[0].object.name} at ${hits[0].distance.toFixed(2)} m of ${d.toFixed(2)}`);
            else any = true;
          }
          if (where === 'seated') expect(any, `${cid} from any seat: ${why.join('; ')}`).toBe(true);
          else expect(why, `${cid} from ${where}`).toEqual([]);
        }
        if (pt.needsOpen) p.movers[pt.needsOpen].set(0);
        // a seat can always reach what the driver reaches only when the list says so
        expect(reaches(pt, pt.from[0])).toBe(true);
      }
    });

    it('a bonnet (the systems read the mover `bonnet`), the four places under it, a hub where a wheel is off', () => {
      const { g, cab } = rig(id);
      const p = g.view.parts;
      expect(p.movers.bonnet, 'bonnet mover').toBeTruthy();
      expect(Object.keys(p.controls!).some((k) => k.startsWith('bonnet')), 'a handle to open it').toBe(true);
      const bay = p.bay!;
      expect(Object.keys(bay).sort()).toEqual(['battery', 'cooling', 'engine', 'heater']);
      // every place sits within the body's length and width, and they are not all on one spot
      const hb = p.hull ?? new THREE.Box3().setFromObject(p.root.getObjectByName('body')!);
      for (const [k, v] of Object.entries(bay)) {
        expect(v.x, k).toBeGreaterThanOrEqual(hb.min.x - 0.05);
        expect(v.x, k).toBeLessThanOrEqual(hb.max.x + 0.05);
        expect(Math.abs(v.z), k).toBeLessThanOrEqual(Math.max(hb.max.z, -hb.min.z));
      }
      const pts = Object.values(bay);
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y, pts[i].z - pts[j].z)).toBeGreaterThan(0.15);
      // hubs: hidden with every wheel on, shown (at the wheel) when one is off
      const hubs = p.hubs!;
      expect(hubs).toBeTruthy();
      for (let i = 0; i < 4; i++) p.wheels[i].pivot.position.set(i < 2 ? 1 : -1, -0.3, i % 2 ? 0.7 : -0.7);
      cab.update(0.016);
      expect(hubs.mesh.visible).toBe(false);
      g.systems.state.wheels[1].off = true;
      cab.update(0.016);
      expect(hubs.mesh.visible).toBe(true);
      hubs.mesh.geometry.computeBoundingBox();
      const bb = hubs.mesh.geometry.boundingBox!;
      expect(bb.max.z).toBeGreaterThan(0.6);
      expect(bb.max.x).toBeGreaterThan(0.85); // the drum at wheel 1 (front right); the others are folded away at the origin
      g.systems.state.wheels[1].off = false;
      cab.update(0.016);
      expect(hubs.mesh.visible).toBe(false);
    });

    it('the live dash tells the truth: lamps in the self-check, the lever in its window, the needles', () => {
      const { g } = rig(id);
      const sys = g.systems;
      const panel = g.view.parts.dashPanel!;
      expect(panel).toBeTruthy();
      sys.turnKey('off');
      sys.update(0.01, { ambientC: 15, dark: false, rain: 0 });
      panel.update(sys.dash, false);
      expect(Object.values(panel.lit).every((v) => v === 0), 'key off: all dark').toBe(true);
      expect(panel.selector).toBe('');
      sys.turnKey('on');
      let lit = 0;
      for (let t = 0; t < 1.5; t += 0.05) {
        sys.update(0.05, { ambientC: 15, dark: false, rain: 0 });
        panel.update(sys.dash, false);
        lit = Math.max(lit, Object.values(panel.lit).filter((v) => v > 0).length);
      }
      expect(lit, 'the self-check lit the lamps').toBeGreaterThanOrEqual(5);
      expect(panel.selector).toBe(sys.dash.selector);
      // a nearly empty tank: the fuel lamp stays on after the check
      sys.state.fuelL = 0.02 * sys.tankL;
      g.sim.fuelL = sys.state.fuelL;
      for (let t = 0; t < 3; t += 0.1) sys.update(0.1, { ambientC: 15, dark: false, rain: 0 });
      panel.update(sys.dash, false);
      expect(panel.lit.fuel, 'fuel lamp').toBeGreaterThan(0);
      expect(panel.lit.fuel).toBe(sys.dash.lamps.fuel);
      // the needles read the dash
      expect(panel.needles.temp).toBeCloseTo(sys.dash.temp, 5);
      expect(panel.needles.battery).toBeCloseTo(sys.dash.battery, 5);
    });
    // (found in the first merged build: the glovebox was registered as a solid container, the car ran
  // into it at every step, and stood shoved off the road with a pinched tyre before the first frame)
  it('nothing the cab hands to the player is a solid the car itself can run into', () => {
    for (const id of Object.keys(MODELS)) {
      const spec = VEHICLES[id];
      const parts = buildVehicle(spec);
      const sim = new VehicleSim(spec);
      sim.reset(0, 0, 0, 0);
      const ground = new FlatGround();
      const containers = new Containers();
      const solids = new SolidSet();
      solids.add(containers);
      const g = {
        sim,
        systems: new VehicleSystems(spec, stockState(spec, 1, { fresh: true })).bind(sim),
        view: { parts, moverState: {} as Record<string, number>, setMover: () => true, cabinLight: false, lightsOn: false },
        player: { containers, solids, interact: { add: () => undefined } },
        robot: null,
        lightsManual: null,
        cabinLightManual: null,
        seat: '',
        walker: null,
        env: { dark: false },
      };
      // (what the cab registers is placed where the car stands as it is made)
      void new CabControls(g as never);
      sim.solids = solids;
      let knocks = 0;
      sim.onKnock = () => knocks++;
      const near: Solid[] = [];
      for (let t = 0; t < 2; t += sim.h) sim.substep(zeroInput(), ground);
      solids.solidsNear(sim.px, sim.pz, 6, near);
      expect(near.map((sd) => sd.tag), `${id}: solids riding in the car`).toEqual([]);
      expect(Math.hypot(sim.px, sim.pz), `${id}: moved while standing`).toBeLessThan(0.05);
      expect(sim.feel.thumps, `${id}: hits while standing`).toBe(0);
      expect(knocks).toBe(0);
    }
  });
});
}
