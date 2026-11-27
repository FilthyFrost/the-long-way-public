/**
 * Composite walkable vehicle solids for on-foot movement (docs/V3/plan/finish.md §19 step 5).
 *
 * Replaces the single solid bounding box on the on-foot FootWalker so every vehicle behaves like a real 3D physical
 * structure (as Nomad Drive does):
 *  - Campers and walk-in vans/trailers have hollow interiors with real floor slabs, raised decks, doorway stairwells,
 *    exterior steps, open/closed door slabs, interior ceilings (including Turtle's dynamic pop-up roof height), and
 *    always-solid walkable roofs.
 *  - Pickups (Buffalo, Mule, Rhino) have walkable cargo beds, side walls, and lowered walkable tailgates with
 *    invisible exterior entry-assist step plates so high beds (~0.80 m) are walked into smoothly with ND's 0.45 m
 *    step and 0.82 m jump.
 *  - Roofed cars always expose their walkable roof (and roof rack slats when fitted) without requiring a ladder swap.
 *  - Active EntryAssistZones raise the walker's dynamic step-up limit up to 0.70 m inside open doorways and behind
 *    lowered tailgates so sloped/uneven ground never blocks entry.
 *
 * Vehicle-to-vehicle driving collision continues to use the simple VehicleSolid untouched.
 * All Solid and EntryZone records are pre-allocated once per vehicle: zero per-frame allocations.
 */
import { Solid, solidWithin, type SolidSource } from '../world/solids';
import { ABOARD, doorSteps, roomOf, type Aboardable, type DoorSteps } from './aboard';
import { bodyCut, ladderSpot, roofFloors, type LadderFloor, type RoofAsBuilt } from './ladders';
import type { FrameDef } from './types';

export interface WalkVehicle {
  readonly build: {
    readonly uid: string;
    readonly frame: string;
    readonly parts: Readonly<Record<string, { readonly part: string } | undefined>>;
  };
  readonly sys: {
    readonly derived: { readonly cg: { readonly x: number; readonly y: number; readonly z: number } };
  };
  readonly sim: {
    readonly px: number;
    readonly py: number;
    readonly pz: number;
    readonly qx: number;
    readonly qy: number;
    readonly qz: number;
    readonly qw: number;
    readonly yaw: number;
    readonly spec: {
      readonly id: string;
      readonly body: { readonly centerX: number; readonly halfLength: number; readonly halfWidth: number; readonly bottom: number; readonly top: number };
    };
    basis(out: Float64Array | number[]): void;
  };
  readonly view: {
    readonly frame: FrameDef;
    readonly roofT: number;
    hasPanel(mountId: string): boolean;
    panelOpen(mountId: string): number;
  };
  readonly carriedBy: unknown | null;
}

interface EntryZone {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
  stepMax: number;
}

/** maximum dynamic step-up inside an open doorway or lowered tailgate entry-assist zone (m, Nomad Drive) */
export const ENTRY_ASSIST_STEP = 0.7;

const WALL_T = 0.09;
const FLOOR_T = 0.22;
const POOL_SOLIDS = 36;
const POOL_ZONES = 6;

/** precomputed doorway steps per aboardable frame (never re-allocated per frame) */
const DOOR_STEPS_CACHE = new Map<string, readonly DoorSteps[]>();
function cachedSteps(frameId: string, def: Aboardable): readonly DoorSteps[] {
  let list = DOOR_STEPS_CACHE.get(frameId);
  if (!list) {
    list = def.doors.map((d) => doorSteps(def, d));
    DOOR_STEPS_CACHE.set(frameId, list);
  }
  return list;
}

const ROOM_BOX_CACHE = new Map<string, { lo: [number, number, number]; hi: [number, number, number] } | null>();
function cachedRoom(frameId: string): { lo: [number, number, number]; hi: [number, number, number] } | null {
  if (!ROOM_BOX_CACHE.has(frameId)) ROOM_BOX_CACHE.set(frameId, roomOf(frameId));
  return ROOM_BOX_CACHE.get(frameId) ?? null;
}

function isDoorOpen(v: WalkVehicle, mount: string): boolean {
  if (!v.build.parts[mount]) return true;
  if (!v.view.hasPanel(mount)) return true;
  return v.view.panelOpen(mount) >= 0.45;
}

function roofPartOf(v: WalkVehicle): RoofAsBuilt | null {
  const m = v.view.frame.mounts.find((x) => x.cat === 'roof');
  const on = m ? v.build.parts[m.id] : undefined;
  return m && on ? { part: on.part, mountY: m.pos.y, fitH: m.fit?.[2] ?? 0.15 } : null;
}

/**
 * Composite walkable SolidSource for one vehicle.
 * Every emitted Solid carries a structured tag `veh:<uid>:<kind>` where kind is one of:
 *   floor | step | bed | roof | wall | body
 */
export class VehicleWalkSolids implements SolidSource {
  readonly prefix: string;
  readonly tagFloor: string;
  readonly tagStep: string;
  readonly tagBed: string;
  readonly tagRoof: string;
  readonly tagWall: string;
  readonly tagBody: string;

  private readonly pool: Solid[] = Array.from({ length: POOL_SOLIDS }, () => new Solid());
  private count = 0;
  private readonly zones: EntryZone[] = Array.from({ length: POOL_ZONES }, () => ({ x0: 0, x1: 0, z0: 0, z1: 0, y0: 0, y1: 0, stepMax: 0 }));
  private zoneCount = 0;
  private readonly b = new Float64Array(9);
  private readonly p = { x: 0, y: 0, z: 0 };
  private yaw = 0;

  private roofPartKey = '';
  private floorsCache: LadderFloor[] = [];
  private cutCache = 0;

  constructor(readonly v: WalkVehicle) {
    this.prefix = `veh:${v.build.uid}:`;
    this.tagFloor = `${this.prefix}floor`;
    this.tagStep = `${this.prefix}step`;
    this.tagBed = `${this.prefix}bed`;
    this.tagRoof = `${this.prefix}roof`;
    this.tagWall = `${this.prefix}wall`;
    this.tagBody = `${this.prefix}body`;
    this.refreshRoofCache();
  }

  private refreshRoofCache(): void {
    const spot = ladderSpot(this.v.view.frame.id);
    if (!spot) {
      this.floorsCache = [];
      this.cutCache = 0;
      return;
    }
    const key = this.v.build.parts.roof?.part ?? '';
    if (key === this.roofPartKey && this.floorsCache.length > 0) return;
    this.roofPartKey = key;
    this.floorsCache = roofFloors(spot, roofPartOf(this.v));
    this.cutCache = bodyCut(this.floorsCache);
  }

  /** model-space point -> world-space point using current sim basis (zero allocations) */
  private toWorld(mx: number, my: number, mz: number): { x: number; y: number; z: number } {
    const s = this.v.sim;
    const cg = this.v.sys.derived.cg;
    const b = this.b;
    const dx = mx - cg.x;
    const dy = my - cg.y;
    const dz = mz - cg.z;
    this.p.x = s.px + b[0] * dx + b[3] * dy + b[6] * dz;
    this.p.y = s.py + b[1] * dx + b[4] * dy + b[7] * dz;
    this.p.z = s.pz + b[2] * dx + b[5] * dy + b[8] * dz;
    return this.p;
  }

  /** world-space point -> model-space point (zero allocations) */
  worldToModel(wx: number, wy: number, wz: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const s = this.v.sim;
    const cg = this.v.sys.derived.cg;
    const b = this.b;
    s.basis(b);
    const dx = wx - s.px;
    const dy = wy - s.py;
    const dz = wz - s.pz;
    out.x = b[0] * dx + b[1] * dy + b[2] * dz + cg.x;
    out.y = b[3] * dx + b[4] * dy + b[5] * dz + cg.y;
    out.z = b[6] * dx + b[7] * dy + b[8] * dz + cg.z;
    return out;
  }

  /** emit one oriented model-space box [x0,x1] x [y0,y1] x [z0,z1] into the pool */
  private emit(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, floor: boolean, tag: string): void {
    if (this.count >= POOL_SOLIDS || x1 <= x0 + 1e-4 || y1 <= y0 + 1e-4 || z1 <= z0 + 1e-4) return;
    const cx = (x0 + x1) * 0.5;
    const cz = (z0 + z1) * 0.5;
    const hx = (x1 - x0) * 0.5;
    const hz = (z1 - z0) * 0.5;
    const lo = this.toWorld(cx, y0, cz);
    const wy0 = lo.y;
    const hi = this.toWorld(cx, y1, cz);
    const wy1 = hi.y;
    const mid = this.toWorld(cx, (y0 + y1) * 0.5, cz);
    const a = Math.min(wy0, wy1);
    const c = Math.max(wy0, wy1);
    this.pool[this.count++].set(mid.x, mid.z, hx, hz, this.yaw, a, Math.max(a + 0.02, c), floor, tag);
  }

  private emitZone(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, stepMax = ENTRY_ASSIST_STEP): void {
    if (this.zoneCount >= POOL_ZONES) return;
    const z = this.zones[this.zoneCount++];
    z.x0 = x0;
    z.x1 = x1;
    z.z0 = z0;
    z.z1 = z1;
    z.y0 = y0;
    z.y1 = y1;
    z.stepMax = stepMax;
  }

  /** rebuild all active solids for this vehicle's current pose, open doors, roof height, and fitted rack */
  rebuild(): void {
    this.count = 0;
    this.zoneCount = 0;
    if (this.v.carriedBy) return;
    const s = this.v.sim;
    s.basis(this.b);
    this.yaw = Math.atan2(this.b[2], this.b[0]);
    this.refreshRoofCache();

    const fid = this.v.view.frame.id;
    const ab = ABOARD[fid];
    if (ab) {
      this.buildCamper(fid, ab);
      return;
    }
    if (fid === 'buffalo') {
      this.buildPickup(-2.48, -1.13, 0.86, 0.8, 1.32, 0.9, 2.45, 1.26, 0.36);
      return;
    }
    if (fid === 'pickup') {
      this.buildPickup(-2.32, -0.4, 0.82, 0.691, 1.18, 0.72, 2.25, 1.12, 0.31);
      return;
    }
    if (fid === 'rhino') {
      this.buildRhino();
      return;
    }
    if (fid === 'van') {
      this.buildVan();
      return;
    }
    this.buildCar();
  }

  // ------------------------------------------------------------------ campers & walk-in boxes

  private buildCamper(fid: string, ab: Aboardable): void {
    const body = this.v.view.frame.body;
    const hw = body.halfWidth;
    const roofT = this.v.view.roofT;
    const minFloor = Math.min(...ab.areas.map((a) => a.floor));

    // Interior ceiling height (y0 of ceiling/roof slab)
    const ceilY =
      fid === 'turtle'
        ? 1.86 + roofT * 0.62
        : fid === 'rv'
          ? 2.76
          : fid === 'elephant'
            ? 2.66
            : fid === 'camel'
              ? 2.74
              : fid === 'snail'
                ? 2.8
                : 2.52;

    // 1. Interior walkable floor areas (padded slightly toward walls so zero cracks, never over stairwells)
    let roomX0 = Infinity;
    let roomX1 = -Infinity;
    for (let i = 0; i < ab.areas.length; i++) {
      const a = ab.areas[i];
      roomX0 = Math.min(roomX0, a.x0);
      roomX1 = Math.max(roomX1, a.x1);
      this.emit(a.x0 - 0.04, a.x1 + 0.04, a.floor - FLOOR_T, a.floor, a.z0 - 0.04, a.z1 + 0.04, true, this.tagFloor);
    }

    // Extra interior decks / bunks
    if (fid === 'rv') {
      // Over-cab bunk mattress (kept in Step 7)
      this.emit(0.99, 1.93, 2.18, 2.32, -1.03, 1.03, true, this.tagFloor);
    } else if (fid === 'elephant') {
      // Rear engine deck inside Old Elephant (accessible by jump/step from back aisle)
      this.emit(-5.57, -4.11, 0.58, 1.28, -1.16, 1.16, true, this.tagFloor);
      // Rear & front wheel-hump covers so the cabin floor has zero drop-through gaps
      this.emit(-4.11, -3.42, 0.58, 1.02, -1.16, -0.56, true, this.tagFloor);
      this.emit(-4.11, -3.42, 0.58, 1.02, 0.56, 1.16, true, this.tagFloor);
      this.emit(2.1, 2.5, 0.58, 1.05, -1.16, -0.58, false, this.tagWall);
      this.emit(2.1, 2.5, 0.58, 1.05, 0.58, 1.16, false, this.tagWall);
      roomX0 = Math.min(roomX0, -5.57);
    } else if (fid === 'turtle') {
      // Rear axle deck (0.80 m — 0.38 m rise from 0.42 m floor, walkable!) + rear engine deck (0.95 m — 0.15 m rise)
      this.emit(-2.48, -1.43, 0.38, 0.8, -1.03, 1.03, true, this.tagFloor);
      this.emit(-3.28, -2.48, 0.58, 0.95, -1.03, 1.03, true, this.tagFloor);
      roomX0 = Math.min(roomX0, -3.28);
    } else if (fid === 'camel') {
      // Wheel humps on left and right of middle aisle: steppable surfaces rather than hollow holes
      this.emit(-3.46, -2.24, 0.7, 1.12, -1.16, -0.58, true, this.tagFloor);
      this.emit(-3.46, -2.24, 0.7, 1.12, 0.58, 1.16, true, this.tagFloor);
      // Driver-side cab floor + console barrier beside the entry door landing so walking straight in never drops out
      this.emit(1.84, 2.74, 0.5, 0.72, -1.18, -0.06, true, this.tagFloor);
      this.emit(1.9, 2.74, 0.72, 1.55, -1.18, -0.18, false, this.tagWall);
    }

    // 2. Doorway stairwell treads, exterior steps, ND invisible entry plate, and EntryAssistZone
    const stepsList = cachedSteps(fid, ab);
    let sideDoor: { loX: number; hiX: number; loY: number; open: boolean } | null = null;
    let rearDoor: { loZ: number; hiZ: number; loY: number; open: boolean } | null = null;

    for (let i = 0; i < ab.doors.length; i++) {
      const door = ab.doors[i];
      const st = stepsList[i];
      const open = isDoorOpen(this.v, door.mount);
      const isSide = Math.abs(st.uz) >= Math.abs(st.ux);
      if (isSide) sideDoor = { loX: door.box.lo[0], hiX: door.box.hi[0], loY: door.box.lo[1], open };
      else rearDoor = { loZ: door.box.lo[2], hiZ: door.box.hi[2], loY: door.box.lo[1], open };

      // Face coordinate along outward axis
      const faceAlong = st.inside[0] * st.ux + st.inside[1] * st.uz + st.sill;
      const ax = -st.uz;
      const az = st.ux;
      const midAcross = st.mid[0] * ax + st.mid[1] * az;
      const half = st.half + 0.04;

      const emitTread = (s0: number, s1: number, top: number): void => {
        // Compute axis-aligned model box from (s0..s1) along (ux, uz) and (-half..+half) across
        const p0x = st.ux * (faceAlong + s0) + ax * (midAcross - half);
        const p1x = st.ux * (faceAlong + s1) + ax * (midAcross + half);
        const p0z = st.uz * (faceAlong + s0) + az * (midAcross - half);
        const p1z = st.uz * (faceAlong + s1) + az * (midAcross + half);
        this.emit(Math.min(p0x, p1x), Math.max(p0x, p1x), Math.max(0, top - 0.24), top, Math.min(p0z, p1z), Math.max(p0z, p1z), true, this.tagStep);
      };

      let maxOutS = 0;
      for (let k = 0; k < st.treads.length; k++) {
        const tr = st.treads[k];
        const isExterior = tr.s0 >= -1e-4;
        if (isExterior && !open) continue;
        emitTread(tr.s0, tr.s1, tr.top);
        if (tr.s1 > maxOutS) maxOutS = tr.s1;
      }

      // ND invisible ~0.20 m entry step plate outside doors without an exterior step (e.g. Camel bus stairwell)
      if (open && !st.out) {
        emitTread(0, 0.34, 0.2);
        maxOutS = Math.max(maxOutS, 0.34);
      }

      // EntryAssistZone covering exterior approach + doorway treads so uneven terrain raises step-up to 0.70 m
      if (open) {
        const sMin = st.treads.length ? st.treads[0].s0 - 0.15 : -0.35;
        const sMax = maxOutS + 0.65;
        const padW = half + 0.22;
        const p0x = st.ux * (faceAlong + sMin) + ax * (midAcross - padW);
        const p1x = st.ux * (faceAlong + sMax) + ax * (midAcross + padW);
        const p0z = st.uz * (faceAlong + sMin) + az * (midAcross - padW);
        const p1z = st.uz * (faceAlong + sMax) + az * (midAcross + padW);
        this.emitZone(Math.min(p0x, p1x), Math.max(p0x, p1x), Math.min(p0z, p1z), Math.max(p0z, p1z), -0.6, st.floor + 0.45, ENTRY_ASSIST_STEP);
      }
    }

    // 3. Hollow exterior walls (left, right with side-door cutout, rear with rear-door cutout, cab/front bulkhead)
    const wallBot = Math.min(body.bottom, minFloor - 0.22);
    const wallTop = ceilY;
    const rearX = Math.max(body.rear, roomX0 - WALL_T);
    const frontX = Math.min(body.front, roomX1 + WALL_T);

    // Left wall (-z)
    this.emit(rearX, frontX, wallBot, wallTop, -hw, -hw + WALL_T, false, this.tagWall);

    // Right wall (+z) with doorway cutout
    if (sideDoor) {
      this.emit(rearX, sideDoor.loX, wallBot, wallTop, hw - WALL_T, hw, false, this.tagWall);
      this.emit(sideDoor.hiX, frontX, wallBot, wallTop, hw - WALL_T, hw, false, this.tagWall);
      // Closed side door panel blocks entry; open/missing leaves opening completely clear
      if (!sideDoor.open) {
        this.emit(sideDoor.loX, sideDoor.hiX, wallBot, wallTop, hw - WALL_T, hw, false, this.tagWall);
      }
    } else {
      this.emit(rearX, frontX, wallBot, wallTop, hw - WALL_T, hw, false, this.tagWall);
    }

    // Rear wall with optional rear-door cutout (Snail, Tadpole; Turtle tailgate when open)
    if (rearDoor) {
      this.emit(rearX, rearX + WALL_T, wallBot, wallTop, -hw, rearDoor.loZ, false, this.tagWall);
      this.emit(rearX, rearX + WALL_T, wallBot, wallTop, rearDoor.hiZ, hw, false, this.tagWall);
      if (!rearDoor.open) {
        this.emit(rearX, rearX + WALL_T, wallBot, wallTop, rearDoor.loZ, rearDoor.hiZ, false, this.tagWall);
      }
    } else if (fid === 'turtle' && isDoorOpen(this.v, 'trunk')) {
      // Turtle rear tailgate open: leave rear tailgate opening clear above engine deck (0.95 m), solid below
      this.emit(rearX, rearX + WALL_T, wallBot, 0.95, -hw, hw, false, this.tagWall);
    } else {
      this.emit(rearX, rearX + WALL_T, wallBot, wallTop, -hw, hw, false, this.tagWall);
    }

    // Front cab / bulkhead
    if (ab.aft) {
      // Walk-through camper cab: solid front nose + left/right cab seat wings, center aisle left open up to aft
      const aftX = ab.aft[0];
      const noseX = Math.max(roomX1 + 0.15, aftX + 0.25);
      const cabTop = fid === 'rv' ? 2.15 : wallTop;
      if (body.front > noseX + 0.05) {
        this.emit(noseX, body.front, wallBot, cabTop, -hw, hw, false, this.tagBody);
      }
      // Side wings bridging roomX1 -> noseX on left & right of center aisle
      if (noseX > frontX - WALL_T) {
        this.emit(frontX - WALL_T, noseX, wallBot, cabTop, -hw, -0.36, false, this.tagWall);
        this.emit(frontX - WALL_T, noseX, wallBot, cabTop, 0.36, hw, false, this.tagWall);
      }
    } else {
      // Separate cab or trailer front wall: solid bulkhead + cab block
      this.emit(frontX - WALL_T, frontX, wallBot, wallTop, -hw, hw, false, this.tagWall);
      if (body.front > frontX + 0.08) {
        // Snail cab block (cut just below cab roof 2.262 so cab roof slab is walkable!)
        const cabTop = fid === 'snail' ? 2.2 : wallTop;
        this.emit(frontX, body.front, wallBot, cabTop, -hw, hw, false, this.tagBody);
      }
    }

    // 4. Walkable roofs (also serving as interior ceiling at y0!)
    if (fid === 'turtle') {
      // Rear fixed strip where the left-rear side ladder exits (always at 2.08 m)
      this.emit(-3.22, -2.65, 1.94, 2.08, -0.95, 0.95, true, this.tagRoof);
      // Dynamic pop-up shell: down y0 = 1.86 (crouch fits, stand blocked); up y0 = 2.48 (stand & jump fit!)
      this.emit(-2.65, 1.45, ceilY, 2.08 + roofT * 0.62, -1.02, 1.02, true, this.tagRoof);
    } else if (this.floorsCache.length > 0) {
      for (let i = 0; i < this.floorsCache.length; i++) {
        const f = this.floorsCache[i];
        // Box-body roof uses ceilY as underside (interior ceiling); lower cab roof (Snail) sits on cab top
        const y0 = f.top < ceilY ? f.top - 0.14 : Math.min(ceilY, f.top - 0.12);
        this.emit(f.along[0], f.along[1], y0, f.top, f.across[0], f.across[1], true, this.tagRoof);
      }
    } else {
      // Trailer roof slab (no ladder, still acts as ceiling & walkable roof)
      this.emit(body.rear, body.front, ceilY, body.top, -hw, hw, true, this.tagRoof);
    }
  }

  // ------------------------------------------------------------------ pickups (Buffalo, Mule)

  private buildPickup(
    bedX0: number,
    bedX1: number,
    bedHalfW: number,
    bedFloor: number,
    wallTop: number,
    hoodX0: number,
    hoodX1: number,
    hoodTop: number,
    stepTop: number,
  ): void {
    const body = this.v.view.frame.body;
    const hw = body.halfWidth;
    const cabTop = this.cutCache > 0.5 ? this.cutCache : body.top - 0.05;

    // 1. Cab solid block + walkable hood + always-solid cab roof
    this.emit(bedX1, hoodX0, body.bottom, cabTop, -hw, hw, false, this.tagBody);
    this.emit(hoodX0, hoodX1, body.bottom, hoodTop, -hw, hw, true, this.tagBody);
    this.emitRoofFloors();

    // 2. Walkable bed floor + side walls
    this.emit(bedX0, bedX1, body.bottom, bedFloor, -bedHalfW, bedHalfW, true, this.tagBed);
    this.emit(bedX0, bedX1, bedFloor, wallTop, -hw, -bedHalfW + WALL_T, false, this.tagWall);
    this.emit(bedX0, bedX1, bedFloor, wallTop, bedHalfW - WALL_T, hw, false, this.tagWall);

    // 3. Tailgate: closed blocks rear; open/lowered becomes walkable horizontal deck + invisible ND step plate + EntryAssistZone
    const hasTailgate = !!this.v.build.parts.trunk;
    const open = isDoorOpen(this.v, 'trunk');
    if (hasTailgate && !open) {
      this.emit(bedX0 - 0.06, bedX0 + 0.06, bedFloor, wallTop, -bedHalfW, bedHalfW, false, this.tagWall);
    } else if (hasTailgate && open) {
      // Horizontal lowered tailgate deck extending 0.58 m behind bed
      this.emit(bedX0 - 0.58, bedX0 + 0.04, bedFloor - 0.14, bedFloor, -bedHalfW + 0.04, bedHalfW - 0.04, true, this.tagBed);
      // Invisible ND exterior entry step plate behind lowered tailgate
      this.emit(bedX0 - 1.04, bedX0 - 0.56, 0, stepTop, -bedHalfW + 0.04, bedHalfW - 0.04, true, this.tagStep);
      // EntryAssistZone raising step-up up to 0.70 m across tailgate approach
      this.emitZone(bedX0 - 1.45, bedX0 + 0.15, -bedHalfW - 0.12, bedHalfW + 0.12, -0.6, bedFloor + 0.4, ENTRY_ASSIST_STEP);
    } else {
      // Tailgate removed: invisible ND step plate right behind open bed + EntryAssistZone
      this.emit(bedX0 - 0.48, bedX0 + 0.02, 0, stepTop, -bedHalfW + 0.04, bedHalfW - 0.04, true, this.tagStep);
      this.emitZone(bedX0 - 0.9, bedX0 + 0.15, -bedHalfW - 0.12, bedHalfW + 0.12, -0.6, bedFloor + 0.4, ENTRY_ASSIST_STEP);
    }
  }

  // ------------------------------------------------------------------ Rhino (heavy cargo truck)

  private buildRhino(): void {
    const body = this.v.view.frame.body;
    const hw = body.halfWidth;
    const cabTop = this.cutCache > 0.5 ? this.cutCache : 2.52;

    // Cab & hood + walkable cab roof + canvas walls from ladders.json
    this.emit(-0.34, 1.35, body.bottom, cabTop, -hw, hw, false, this.tagBody);
    this.emit(1.35, body.front, body.bottom, 1.68, -hw, hw, true, this.tagBody);
    this.emitRoofFloors();

    // Cargo bed floor + side walls
    const bedX0 = -3.1;
    const bedX1 = -0.34;
    const bedFloor = 1.24;
    this.emit(bedX0, bedX1, body.bottom, bedFloor, -1.07, 1.07, true, this.tagBed);
    this.emit(bedX0, bedX1, bedFloor, 2.75, -hw, -1.07 + WALL_T, false, this.tagWall);
    this.emit(bedX0, bedX1, bedFloor, 2.75, 1.07 - WALL_T, hw, false, this.tagWall);

    // Tailgate
    const hasTailgate = !!this.v.build.parts.trunk;
    const open = isDoorOpen(this.v, 'trunk');
    if (hasTailgate && !open) {
      this.emit(bedX0 - 0.06, bedX0 + 0.06, bedFloor, 2.1, -1.07, 1.07, false, this.tagWall);
    } else {
      const tailEnd = hasTailgate ? bedX0 - 0.55 : bedX0;
      if (hasTailgate) this.emit(tailEnd, bedX0 + 0.04, bedFloor - 0.14, bedFloor, -1.0, 1.0, true, this.tagBed);
      // Two entry steps (0.42 m and 0.84 m) for Rhino's high 1.24 m military cargo bed
      this.emit(tailEnd - 0.36, tailEnd + 0.02, 0.5, 0.84, -0.85, 0.85, true, this.tagStep);
      this.emit(tailEnd - 0.72, tailEnd - 0.34, 0, 0.42, -0.85, 0.85, true, this.tagStep);
      this.emitZone(tailEnd - 1.15, bedX0 + 0.15, -1.05, 1.05, -0.6, bedFloor + 0.4, ENTRY_ASSIST_STEP);
    }
  }

  // ------------------------------------------------------------------ Loaf (cargo van)

  private buildVan(): void {
    const body = this.v.view.frame.body;
    const hw = body.halfWidth;
    const openSide = isDoorOpen(this.v, 'door_side');

    // Interior cargo floor (0.42 m) & rear luggage deck (0.95 m)
    this.emit(-0.75, 0.72, body.bottom, 0.42, -0.82, 0.82, true, this.tagFloor);
    this.emit(-2.18, -0.75, body.bottom, 0.95, -0.82, 0.82, true, this.tagFloor);

    // Hollow walls around cabin, door_side opening on +z (-0.70..0.52)
    this.emit(body.rear, 0.75, body.bottom, 1.82, -hw, -hw + WALL_T, false, this.tagWall);
    this.emit(body.rear, -0.7, body.bottom, 1.82, hw - WALL_T, hw, false, this.tagWall);
    this.emit(0.52, 0.75, body.bottom, 1.82, hw - WALL_T, hw, false, this.tagWall);
    this.emit(body.rear, body.rear + WALL_T, body.bottom, 1.82, -hw, hw, false, this.tagWall);
    if (!openSide) {
      this.emit(-0.7, 0.52, body.bottom, 1.82, hw - WALL_T, hw, false, this.tagWall);
    } else {
      this.emit(-0.7, 0.52, 0, 0.21, hw, hw + 0.34, true, this.tagStep);
      this.emitZone(-0.85, 0.65, hw - 0.3, hw + 0.95, -0.6, 0.9, ENTRY_ASSIST_STEP);
    }
    // Cab front
    this.emit(0.75, body.front, body.bottom, 1.82, -hw, hw, false, this.tagBody);
    // Always-solid walkable roof
    this.emitRoofFloors();
  }

  // ------------------------------------------------------------------ regular cars & motorcycle

  private buildCar(): void {
    const body = this.v.view.frame.body;
    const hw = body.halfWidth;
    if (this.floorsCache.length > 0) {
      // Cut body just below walkable roof so roof slabs sit cleanly on top
      this.emit(body.rear, body.front, body.bottom, Math.max(body.bottom + 0.1, this.cutCache), -hw, hw, false, this.tagBody);
      this.emitRoofFloors();
    } else {
      // Motorcycle or unroofed frame: single body box
      this.emit(body.rear, body.front, body.bottom, body.top, -hw, hw, false, this.tagBody);
    }
  }

  private emitRoofFloors(): void {
    const spot = ladderSpot(this.v.view.frame.id);
    if (!spot) return;
    for (let i = 0; i < this.floorsCache.length; i++) {
      const f = this.floorsCache[i];
      this.emit(f.along[0], f.along[1], Math.min(this.cutCache, f.top - 0.1), f.top, f.across[0], f.across[1], true, this.tagRoof);
    }
    if (spot.walls) {
      for (let i = 0; i < spot.walls.length; i++) {
        const wl = spot.walls[i];
        this.emit(wl.along[0], wl.along[1], wl.height[0], wl.height[1], wl.across[0], wl.across[1], false, this.tagWall);
      }
    }
  }

  // ------------------------------------------------------------------ SolidSource & spatial queries

  solidsNear(x: number, z: number, r: number, out: Solid[]): void {
    const s = this.v.sim;
    const reach = s.spec.body.halfLength + Math.abs(s.spec.body.centerX) + 2.2 + r;
    if (Math.abs(x - s.px) > reach || Math.abs(z - s.pz) > reach) return;
    this.rebuild();
    for (let i = 0; i < this.count; i++) {
      if (solidWithin(this.pool[i], x, z, r)) out.push(this.pool[i]);
    }
  }

  /** dynamic step-up ceiling (m) if (wx, wy, wz) lies inside an active doorway/tailgate EntryAssistZone; else 0 */
  entryStepLimit(wx: number, wy: number, wz: number): number {
    if (this.v.carriedBy) return 0;
    const s = this.v.sim;
    const reach = s.spec.body.halfLength + Math.abs(s.spec.body.centerX) + 2.4;
    if (Math.abs(wx - s.px) > reach || Math.abs(wz - s.pz) > reach) return 0;
    if (this.zoneCount === 0) this.rebuild();
    if (this.zoneCount === 0) return 0;
    const m = this.worldToModel(wx, wy, wz, this.p);
    let best = 0;
    for (let i = 0; i < this.zoneCount; i++) {
      const z = this.zones[i];
      if (m.x >= z.x0 && m.x <= z.x1 && m.z >= z.z0 && m.z <= z.z1 && m.y >= z.y0 && m.y <= z.y1) {
        if (z.stepMax > best) best = z.stepMax;
      }
    }
    return best;
  }

  /** true when the walker's feet (wx, wy, wz) are physically inside this vehicle's living-space room */
  insideLiving(wx: number, wy: number, wz: number): boolean {
    if (this.v.carriedBy) return false;
    const box = cachedRoom(this.v.view.frame.id);
    if (!box) return false;
    const s = this.v.sim;
    const reach = s.spec.body.halfLength + Math.abs(s.spec.body.centerX) + 1.4;
    if (Math.abs(wx - s.px) > reach || Math.abs(wz - s.pz) > reach) return false;
    const m = this.worldToModel(wx, wy, wz, this.p);
    const fid = this.v.view.frame.id;
    const minX = fid === 'turtle' ? -3.3 : fid === 'elephant' ? -5.6 : box.lo[0];
    const maxY = fid === 'turtle' ? 1.88 + this.v.view.roofT * 0.64 : box.hi[1] - 0.12;
    return m.x >= minX && m.x <= box.hi[0] + 0.15 && m.z >= box.lo[2] && m.z <= box.hi[2] && m.y >= box.lo[1] - 0.15 && m.y <= maxY;
  }

  /** true when `tag` belongs to any surface of this vehicle */
  ownsTag(tag: string): boolean {
    return tag.startsWith(this.prefix);
  }
}
