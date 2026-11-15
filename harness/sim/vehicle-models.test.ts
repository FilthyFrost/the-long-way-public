/**
 * Vehicle models, checked in Node without a browser (specs/vehicles/rv_model.md §7 and
 * specs/vehicles/van_offroad_models.md §7): every modelled vehicle builds without a DOM, its hull has
 * the size of its spec, the wheels have room, the driver sees the road, heads fit at every seat, the
 * walkable floor is clear to the ceiling (vehicles one walks in), the slots are the ones the spec
 * lists, the movers move, and the draw-call and triangle budgets hold. The truck must not change.
 */
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { connected } from '../../src/core/onboard/walker';
import { VehicleSim, zeroInput } from '../../src/core/vehicle/sim';
import { T0_TRUCK, T1_VAN, VEHICLES, type VehicleSpec } from '../../src/core/vehicle/spec';
import { FlatGround } from '../../src/core/world/ground';
import type { VehicleParts } from '../../src/game/vehicle/kit';
import { MODELS, VEHICLE_ALIASES, buildVehicle, vehicleSpecFor } from '../../src/game/vehicle/models';

const DEG = Math.PI / 180;

/**
 * The truck's budget. It stayed as it was until the cab controls (the model track's cab package):
 * then it got half doors, levers, a radio, the live dash strip and things that hop (20 → 23 meshes, the hubs of a wheel taken off included).
 */
const TRUCK_TRIANGLES = 8000;
const TRUCK_MESHES = 23;

interface Built {
  spec: VehicleSpec;
  parts: VehicleParts;
  /** wheel centres at rest (body frame), radius and tyre width */
  wheels: THREE.Vector3[];
  wheelR: number;
  wheelW: number;
}

const cache = new Map<string, Built>();

function built(id: string): Built {
  let b = cache.get(id);
  if (b) return b;
  const spec = VEHICLES[id];
  const parts = buildVehicle(spec);
  // wheels where the suspension holds them at rest
  const sim = new VehicleSim(spec);
  const ground = new FlatGround();
  sim.reset(0, 0, 0, 0);
  for (let t = 0; t < 2; t += sim.h) sim.substep(zeroInput(), ground);
  const wheels: THREE.Vector3[] = [];
  const o = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 4; i++) {
    sim.wheelLocal(i, o);
    wheels.push(new THREE.Vector3(o.x, o.y, o.z));
    parts.wheels[i].pivot.position.set(o.x, o.y, o.z);
  }
  parts.root.updateMatrixWorld(true);
  const wg = (parts.wheels[0].spin.children[0] as THREE.Mesh).geometry;
  wg.computeBoundingBox();
  const wb = wg.boundingBox!;
  b = { spec, parts, wheels, wheelR: spec.wheelRadius, wheelW: wb.max.z - wb.min.z };
  cache.set(id, b);
  return b;
}

function visible(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

function meshes(parts: VehicleParts, keep: (m: THREE.Mesh) => boolean = () => true): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  parts.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && visible(m) && keep(m)) out.push(m);
  });
  return out;
}

function isWheel(parts: VehicleParts, m: THREE.Object3D): boolean {
  return parts.wheels.some((w) => isUnder(m, w.pivot));
}

function isUnder(o: THREE.Object3D, anc: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === anc) return true;
  return false;
}

/** see-through things: glass, windscreen */
function isGlass(m: THREE.Mesh): boolean {
  const mat = m.material as THREE.Material;
  return mat.transparent || m.name === 'windscreen' || m.name.startsWith('glass');
}

/** solid geometry: not glass, not wheels */
function solids(b: Built): THREE.Mesh[] {
  return meshes(b.parts, (m) => !isGlass(m) && !isWheel(b.parts, m));
}

function triangles(m: THREE.Mesh): number {
  const g = m.geometry;
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}

function forEachVertex(m: THREE.Mesh, fn: (v: THREE.Vector3) => void): void {
  const pos = m.geometry.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
    fn(v);
  }
}

function forEachTriangle(m: THREE.Mesh, fn: (t: THREE.Triangle) => void): void {
  const g = m.geometry;
  const pos = g.getAttribute('position');
  const idx = g.index;
  const n = idx ? idx.count : pos.count;
  const t = new THREE.Triangle();
  for (let i = 0; i + 2 < n; i += 3) {
    const a = idx ? idx.getX(i) : i;
    const b = idx ? idx.getX(i + 1) : i + 1;
    const c = idx ? idx.getX(i + 2) : i + 2;
    t.a.fromBufferAttribute(pos, a).applyMatrix4(m.matrixWorld);
    t.b.fromBufferAttribute(pos, b).applyMatrix4(m.matrixWorld);
    t.c.fromBufferAttribute(pos, c).applyMatrix4(m.matrixWorld);
    fn(t);
  }
}

/** every hit along a ray (both faces of every triangle), nearest first */
function cast(objs: THREE.Mesh[], from: THREE.Vector3, dir: THREE.Vector3, far: number): THREE.Intersection[] {
  const rc = new THREE.Raycaster(from, dir.clone().normalize(), 0, far);
  const saved = objs.map((m) => (m.material as THREE.Material).side);
  for (const m of objs) (m.material as THREE.Material).side = THREE.DoubleSide;
  try {
    return rc.intersectObjects(objs, false).sort((a, b) => a.distance - b.distance);
  } finally {
    objs.forEach((m, i) => ((m.material as THREE.Material).side = saved[i]));
  }
}

function dirFrom(yaw: number, pitch: number): THREE.Vector3 {
  return new THREE.Vector3(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw));
}

const modelled = Object.keys(MODELS);

/** what each spec asks of its model (the closed vehicles; the truck predates the kit) */
interface Expect {
  spec: string;
  /** hull: ends (bumpers included), half width, roof height above the ground (without what stands on it) */
  hull: { xMin: number; xMax: number; half: number; roof: [number, number] };
  /** nothing of the painted shell further out than this (mirrors on their stalks, a spare wheel) */
  shell: { half: number; xMin: number; xMax: number };
  /** the room: inner half width, floor and ceiling above the ground (slots stay inside it) */
  room: { half: number; floor: number; ceiling: number };
  slots: Record<string, string>;
  /** slot kinds that live outside the room (roof, back, bumper) */
  outside: string[];
  installed: string[];
  movers: string[];
  camp: string[];
  seats: string[];
  views: string[];
  cutNames: string[];
  /** a cut-away vertex is on the right (z above this) or up top (body y above this) */
  cutRight: number;
  cutTop: number;
  walk: boolean;
  budget: { triangles: number; meshes: number };
}

const EXPECT: Record<string, Expect> = {
  t3_rv: {
    spec: 'rv_model.md',
    hull: { xMin: -3.3, xMax: 3.55, half: 1.1, roof: [2.8, 2.95] },
    shell: { half: 1.45, xMin: -3.8, xMax: 3.7 },
    room: { half: 1.04, floor: 0.8, ceiling: 2.78 },
    slots: {
      fridge: 'cooler', water: 'water', stove: 'stove', workbench: 'workbench', bunks: 'bed', map: 'map',
      storage: 'storage', board: 'board', hobby: 'hobby', roofRack: 'roof', roofSolar: 'roof', roofDeck: 'roof', rear: 'rear',
    },
    outside: ['roof', 'rear'],
    installed: ['bunks', 'map', 'storage', 'stove', 'water'],
    movers: ['awning', 'curtain', 'door', 'passengerSeat'],
    camp: ['door', 'awning'],
    seats: ['passenger', 'dinette1', 'dinette2', 'dinette3', 'dinette4', 'sofa', 'bunkLow', 'bunkHigh', 'deck1', 'deck2'],
    views: ['roomFront', 'roomRear', 'galley', 'overDash'],
    cutNames: ['body:cut', 'room:cut', 'glass:cut', 'lamps'],
    cutRight: 0.5,
    cutTop: 1.7,
    walk: true,
    budget: { triangles: 90_000, meshes: 32 },
  },
  t1_van: {
    spec: 'van_offroad_models.md §1',
    hull: { xMin: -2.18, xMax: 2.18, half: 0.85, roof: [1.9, 2.0] },
    shell: { half: 1.1, xMin: -2.25, xMax: 2.25 },
    room: { half: 0.8, floor: 0.42, ceiling: 1.89 },
    slots: { stove: 'stove', cooler: 'cooler', bed: 'bed', storage: 'storage', roofRack: 'roof' },
    outside: ['roof'],
    installed: ['bed', 'storage', 'stove'],
    movers: ['bench', 'curtain', 'slideDoor', 'tailgate'],
    camp: ['tailgate', 'slideDoor'],
    seats: ['passenger', 'rearLeft', 'rearRight', 'tailgate'],
    views: ['room', 'roomRear', 'galley'],
    cutNames: ['body:cut', 'room:cut', 'glass:cut', 'lamps'],
    cutRight: 0.5,
    cutTop: 1.2,
    walk: false,
    budget: { triangles: 60_000, meshes: 28 },
  },
  t2_offroad: {
    spec: 'van_offroad_models.md §2',
    hull: { xMin: -2.04, xMax: 2.1, half: 0.84, roof: [1.8, 1.9] },
    shell: { half: 1.12, xMin: -2.4, xMax: 2.2 },
    room: { half: 0.79, floor: 0.42, ceiling: 1.8 },
    slots: { kitchen: 'stove', cooler: 'cooler', storage: 'storage', roofRack: 'roof', roofTent: 'roof', winch: 'winch' },
    outside: ['roof', 'winch'],
    installed: ['kitchen', 'roofRack', 'storage'],
    movers: ['bonnet', 'drawer', 'rearDoor', 'tent'],
    camp: ['rearDoor', 'drawer', 'tent'],
    seats: ['passenger', 'rearLeft', 'rearRight', 'tent'],
    views: ['room', 'tailgate'],
    cutNames: ['body:cut', 'room:cut', 'glass:cut', 'lamps'],
    cutRight: 0.5,
    cutTop: 1.0,
    walk: false,
    budget: { triangles: 60_000, meshes: 28 },
  },
};

describe('vehicle model registry', () => {
  it('knows the truck, the van, the off-roader and the motorhome', () => {
    for (const id of ['t0_truck', 't1_van', 't2_offroad', 't3_rv']) expect(modelled, id).toContain(id);
  });
  it('accepts short names and ids', () => {
    for (const [alias, id] of Object.entries(VEHICLE_ALIASES)) {
      expect(vehicleSpecFor(alias).id).toBe(id);
      expect(vehicleSpecFor(id).id).toBe(id);
    }
    expect(vehicleSpecFor(null).id).toBe('t0_truck');
  });
  it('draws a vehicle without a model as the truck, warning once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unknown: VehicleSpec = { ...T1_VAN, id: 't9_unmodelled' };
    const a = buildVehicle(unknown);
    const b = buildVehicle(unknown);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    expect(a.root.name).toBe(unknown.id);
    expect(b.wheels.length).toBe(4);
  });
  it('every closed model has its expectations written down', () => {
    for (const id of modelled) if (id !== 't0_truck') expect(EXPECT[id], id).toBeTruthy();
  });
});

for (const id of modelled) {
  describe(`model · ${id}`, () => {
    it('1. builds in Node, every required part present', () => {
      expect(typeof document).toBe('undefined');
      const p = built(id).parts;
      expect(p.root).toBeInstanceOf(THREE.Group);
      expect(p.wheels.length).toBe(4);
      for (const k of ['steeringWheel', 'speedNeedle', 'fuelNeedle', 'charm', 'windscreen', 'headlights', 'taillights', 'dialGlow', 'views', 'slots', 'movers', 'beam', 'footprint', 'chase'] as const) expect(p[k], k).toBeTruthy();
      expect(p.wipers.length).toBeGreaterThanOrEqual(1);
      expect(p.enclosed).toBeGreaterThanOrEqual(0);
      expect(p.enclosed).toBeLessThanOrEqual(1);
    });

    // The truck predates the kit: its front wheels' tops sit inside the bench base, and it may not change
    // (§0: same picture; §7.9: same triangle count), so it is the one model left out of this check.
    it.skipIf(id === 't0_truck')('3. the wheels have room: no body or room vertex inside a wheel at rest', () => {
      const b = built(id);
      const r = b.wheelR + 0.02;
      const hw = b.wheelW / 2 + 0.01;
      let bad = 0;
      let first = '';
      for (const m of solids(b)) {
        forEachVertex(m, (v) => {
          for (const c of b.wheels) {
            if (Math.abs(v.z - c.z) <= hw && Math.hypot(v.x - c.x, v.y - c.y) <= r) {
              bad++;
              if (!first) first = `${m.name} at ${v.toArray().map((n) => n.toFixed(3))}`;
            }
          }
        });
      }
      expect(bad, first).toBe(0);
    });

    it('5. every seat: the head is clear and so is the view straight ahead', () => {
      const b = built(id);
      const tmp = new THREE.Vector3();
      for (const [name, vp] of Object.entries(b.parts.views)) {
        if (!vp.seat) continue;
        // a seat that needs a slot or an open mover is checked with them in place
        const was = b.parts.slots.filter((s) => s.installed).map((s) => s.id);
        if (vp.needs) b.parts.slotMesh?.setInstalled([...was, vp.needs]);
        for (const m of vp.open ?? []) b.parts.movers[m].set(1);
        b.parts.root.updateMatrixWorld(true);
        const objs = solids(b);
        const eye = new THREE.Vector3(vp.x, vp.y, vp.z);
        let near = Infinity;
        let what = '';
        for (const m of objs) {
          forEachTriangle(m, (t) => {
            const d = t.closestPointToPoint(eye, tmp).distanceTo(eye);
            if (d < near) {
              near = d;
              what = m.name;
            }
          });
        }
        expect(near, `${name}: head touches ${what}`).toBeGreaterThan(0.11);
        const hits = cast(objs, eye, dirFrom(vp.yaw, vp.pitch), 0.3);
        expect(hits.length, `${name}: something within 0.3 m ahead (${hits[0]?.object.name})`).toBe(0);
        for (const m of vp.open ?? []) b.parts.movers[m].set(0);
        if (vp.needs) b.parts.slotMesh?.setInstalled(was);
      }
    });

    it('8. budget: triangles and meshes (draw calls) with every slot installed', () => {
      const p = built(id).parts;
      const was = p.slots.filter((s) => s.installed).map((s) => s.id);
      p.slotMesh?.setInstalled(p.slots.map((s) => s.id));
      let tris = 0;
      let n = 0;
      p.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          n++;
          tris += triangles(m);
        }
      });
      if (id === 't0_truck') {
        // 9. the truck within its budget
        expect(tris).toBeLessThanOrEqual(TRUCK_TRIANGLES);
        expect(n).toBeLessThanOrEqual(TRUCK_MESHES);
      } else {
        const e = EXPECT[id];
        expect(tris).toBeLessThanOrEqual(e.budget.triangles);
        expect(n).toBeLessThanOrEqual(e.budget.meshes);
      }
      p.slotMesh?.setInstalled(was);
    });
  });
}

for (const [id, e] of Object.entries(EXPECT)) {
  describe(`model · ${id} (specs/vehicles/${e.spec})`, () => {
    const spec = VEHICLES[id];
    const cg = spec.cgHeight;

    it('2. hull size: length, width, roof height, against the collision box', () => {
      const p = built(spec.id).parts;
      const h = p.hull!;
      expect(h).toBeTruthy();
      expect(Math.abs(h.min.x - e.hull.xMin), `rear end ${h.min.x.toFixed(3)}`).toBeLessThanOrEqual(0.15);
      expect(Math.abs(h.max.x - e.hull.xMax), `front end ${h.max.x.toFixed(3)}`).toBeLessThanOrEqual(0.15);
      expect(Math.abs(h.min.z + e.hull.half)).toBeLessThanOrEqual(0.15);
      expect(Math.abs(h.max.z - e.hull.half)).toBeLessThanOrEqual(0.15);
      expect(h.max.y + cg, 'roof').toBeGreaterThanOrEqual(e.hull.roof[0]);
      expect(h.max.y + cg, 'roof').toBeLessThanOrEqual(e.hull.roof[1]);
      const bx = spec.body;
      expect(Math.abs(h.min.x - (bx.centerX - bx.halfLength))).toBeLessThanOrEqual(0.5);
      expect(Math.abs(h.max.x - (bx.centerX + bx.halfLength))).toBeLessThanOrEqual(0.5);
      // the hull is the body: nothing of the shell stands far out of it (mirrors on their stalks at most)
      const all = new THREE.Box3();
      for (const m of meshes(p, (m) => m.name.startsWith('body'))) all.expandByObject(m);
      expect(all.max.z).toBeLessThanOrEqual(e.shell.half);
      expect(all.min.z).toBeGreaterThanOrEqual(-e.shell.half);
      expect(all.max.x).toBeLessThanOrEqual(e.shell.xMax);
      expect(all.min.x).toBeGreaterThanOrEqual(e.shell.xMin);
    });

    it('4. the driver sees the road: rays from the eye', () => {
      const b = built(spec.id);
      const p = b.parts;
      const eye = new THREE.Vector3(spec.eye.x, spec.eye.y, spec.eye.z);
      const all = meshes(p, (m) => !isWheel(p, m));
      const allowed = (o: THREE.Object3D): boolean => isUnder(o, p.steeringWheel) || (p.cluster ? isUnder(o, p.cluster) : false) || p.wipers.some((w) => isUnder(o, w));
      // nine directions over the forward half: the first thing met is the windscreen or something further than 0.45 m
      const nine: [number, number][] = [[0, 0], [0, 10], [0, -10], [0, 20], [0, -20], [10, 0], [-10, 0], [20, 0], [-20, 0]];
      for (const [yaw, pitch] of nine) {
        const hits = cast(all, eye, dirFrom(yaw * DEG, pitch * DEG), 6);
        expect(hits.length, `yaw ${yaw} pitch ${pitch}: nothing ahead at all`).toBeGreaterThan(0);
        const h = hits[0];
        expect(h.object === p.windscreen || h.distance > 0.45, `yaw ${yaw} pitch ${pitch}: ${h.object.name} at ${h.distance.toFixed(2)} m`).toBe(true);
      }
      // straight ahead and 5–20° down: through the glass before anything of the body (wheel, dials, wipers excepted)
      for (const pitch of [0, -5, -10, -15, -20]) {
        const hits = cast(all, eye, dirFrom(0, pitch * DEG), 6);
        const gi = hits.findIndex((h) => h.object === p.windscreen);
        expect(gi, `pitch ${pitch}: the ray never meets the windscreen`).toBeGreaterThanOrEqual(0);
        for (const h of hits.slice(0, gi)) expect(allowed(h.object), `pitch ${pitch}: ${h.object.name} at ${h.distance.toFixed(2)} m before the glass`).toBe(true);
      }
      // up 20°: sky through the glass
      {
        const hits = cast(all, eye, dirFrom(0, 20 * DEG), 6);
        expect(hits[0]?.object).toBe(p.windscreen);
      }
      // nothing within 0.12 m of the eye along the six axes
      const solid = solids(b);
      for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const hits = cast(solid, eye, new THREE.Vector3(...d), 0.12);
        expect(hits.length, `axis ${d}: ${hits[0]?.object.name}`).toBe(0);
      }
    });

    it.skipIf(!e.walk)('6. where one can walk: clear from the floor to head height, one piece, aisle wide enough', () => {
      const b = built(spec.id);
      const p = b.parts;
      const walk = p.walk!;
      expect(walk).toBeTruthy();
      expect(walk.headroom).toBeGreaterThanOrEqual(1.9);
      expect(connected(walk)).toBe(true);
      const objs = solids(b);
      let bad = 0;
      let first = '';
      for (const r of walk.areas) {
        const nx = Math.max(1, Math.ceil((r.x1 - r.x0) / 0.15));
        const nz = Math.max(1, Math.ceil((r.z1 - r.z0) / 0.15));
        for (let i = 0; i <= nx; i++) {
          for (let k = 0; k <= nz; k++) {
            const x = r.x0 + ((r.x1 - r.x0) * i) / nx;
            const z = r.z0 + ((r.z1 - r.z0) * k) / nz;
            const hits = cast(objs, new THREE.Vector3(x, r.floor + 0.05, z), new THREE.Vector3(0, 1, 0), 1.85);
            if (hits.length) {
              bad++;
              if (!first) first = `${r.name} (${x.toFixed(2)}, ${z.toFixed(2)}): ${hits[0].object.name} at ${(hits[0].distance + 0.05).toFixed(2)} m above the floor`;
            }
          }
        }
      }
      expect(bad, first).toBe(0);
      const aisles = walk.areas.filter((r) => r.name === 'aisle');
      expect(aisles.length).toBeGreaterThan(0);
      for (const r of aisles) expect(Math.min(r.x1 - r.x0, r.z1 - r.z0)).toBeGreaterThanOrEqual(0.55);
    });

    it.skipIf(e.walk)('6. nobody walks here: no walk areas, seats only', () => {
      expect(built(spec.id).parts.walk).toBeUndefined();
    });

    it('7. slots: the spec’s ids and kinds, both states built, inside the room', () => {
      const p = built(spec.id).parts;
      expect(Object.fromEntries(p.slots.map((s) => [s.id, s.kind]))).toEqual(e.slots);
      const h = p.hull!;
      for (const s of p.slots) {
        for (const g of [s.empty, s.built]) {
          expect(g.getAttribute('position').count, `${s.id}`).toBeGreaterThan(0);
          if (e.outside.includes(s.kind)) continue;
          g.computeBoundingBox();
          const bb = g.boundingBox!;
          expect(bb.min.x, s.id).toBeGreaterThanOrEqual(h.min.x);
          expect(bb.max.x, s.id).toBeLessThanOrEqual(h.max.x);
          expect(bb.min.z, s.id).toBeGreaterThanOrEqual(-e.room.half - 1e-6);
          expect(bb.max.z, s.id).toBeLessThanOrEqual(e.room.half + 1e-6);
          expect(bb.min.y, s.id).toBeGreaterThanOrEqual(e.room.floor - cg - 1e-6);
          expect(bb.max.y, s.id).toBeLessThanOrEqual(e.room.ceiling - cg);
        }
      }
      // default: these installed, the rest empty, so both states show
      expect(p.slots.filter((s) => s.installed).map((s) => s.id).sort()).toEqual([...e.installed].sort());
    });

    it('all slots are one mesh, rebuilt when a slot changes; the cutaway drops the roof slots', () => {
      const p = built(spec.id).parts;
      const sm = p.slotMesh!;
      const count = (): number => sm.mesh.geometry.getAttribute('position').count;
      const before = count();
      const slotMeshes = meshes(p, (m) => m.name.startsWith('slot'));
      expect(slotMeshes.length).toBe(1);
      const off = p.slots.find((s) => !s.installed)!;
      sm.set(off.id, true);
      expect(count()).not.toBe(before);
      sm.set(off.id, false);
      expect(count()).toBe(before);
      const roof = p.slots.find((s) => s.cut)!;
      sm.setInstalled([roof.id]);
      const withRoof = count();
      sm.setCutaway(true);
      expect(count()).toBeLessThan(withRoof);
      sm.setCutaway(false);
      sm.setInstalled(e.installed);
      expect(count()).toBe(before);
    });

    it('movers, seats and viewpoints the spec names; every mover moves something and comes back', () => {
      const p = built(spec.id).parts;
      // the cab's operable parts (ctl:… and the controls' own lids, visors, doors) are checked in cab-controls.test.ts
      for (const m of e.movers) expect(p.movers[m], m).toBeTruthy();
      const extra = Object.keys(p.movers).filter((m) => !e.movers.includes(m));
      const ctlIds = new Set(Object.keys(p.controls ?? {}).map((k) => k.split('@')[0]));
      for (const m of extra) expect(m.startsWith('ctl:') || ctlIds.has(m), `${m}: a mover the spec does not name`).toBe(true);
      for (const k of e.seats) expect(p.views[k]?.seat, k).toBe(true);
      for (const k of e.views) expect(p.views[k]?.seat, k).toBe(false);
      const camp = p.camp ?? ['door', 'awning'];
      for (const m of camp) expect(p.movers[m], `camp mover ${m}`).toBeTruthy();
      expect([...camp].sort()).toEqual([...e.camp].sort());
      // every mover changes the picture (something moves) and shuts again to the same picture
      p.slotMesh?.setInstalled(p.slots.map((s) => s.id));
      const snapshot = (): string => {
        const out: number[] = [];
        p.root.updateMatrixWorld(true);
        for (const m of meshes(p)) {
          // where the vertices are, summed (a curtain drawn inside the room keeps the room's box)
          const sum = [0, 0, 0];
          forEachVertex(m, (v) => {
            sum[0] += v.x;
            sum[1] += v.y;
            sum[2] += v.z;
          });
          out.push(...sum, m.geometry.getAttribute('position').count);
        }
        return out.map((v) => v.toFixed(2)).join(',');
      };
      const shut = snapshot();
      for (const [name, m] of Object.entries(p.movers)) {
        m.set(1);
        expect(snapshot(), `${name} moved nothing`).not.toBe(shut);
        m.set(0);
        expect(snapshot(), `${name} did not shut`).toBe(shut);
      }
      p.slotMesh?.setInstalled(e.installed);
      expect(p.cut).toBeTruthy();
      expect(p.enclosed).toBe(1);
    });

    it('the cutaway group holds the right wall, the right glass and the roof', () => {
      const p = built(spec.id).parts;
      const names = new Set<string>();
      p.cut!.traverse((o) => names.add(o.name));
      for (const n of e.cutNames) expect(names.has(n), n).toBe(true);
      // what is cut is on the right or up top
      for (const m of meshes(p, (m) => isUnder(m, p.cut!) && m.name === 'glass:cut')) {
        forEachVertex(m, (v) => expect(v.z > e.cutRight || v.y > e.cutTop).toBe(true));
      }
    });
  });
}

describe('model · t0_truck stays as it was', () => {
  it('uses the truck model and spec', () => {
    const p = built(T0_TRUCK.id).parts;
    expect(p.root.name).toBe('t0_truck');
    expect(p.enclosed).toBe(0);
  });
});
