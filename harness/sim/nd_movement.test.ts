/**
 * Step 5 unit verification: Nomad Drive on-foot movement physics (ND_FOOT), composite walkable VehicleWalkSolids,
 * EntryAssistZone dynamic step-up, Turtle roof-down crouch / roof-up stand clearance, Buffalo lowered tailgate,
 * always-solid vehicle roofs, and Turtle's left-rear side ladder.
 */
import { describe, expect, it } from 'vitest';
import { FunctionLand, type Land } from '../../src/core/onfoot/land';
import { FOOT, FootWalker, ND_FOOT, type FootInput } from '../../src/core/onfoot/walker';
import { ENTRY_ASSIST_STEP, VehicleWalkSolids, type WalkVehicle } from '../../src/core/modcar/vehicleSolids';
import { newInstance, stockBuild } from '../../src/core/modcar/build';
import { derive } from '../../src/core/modcar/derive';
import { frameDef } from '../../src/core/modcar/frames';
import { ladderSpot } from '../../src/core/modcar/ladders';
import { StaticSolids } from '../../src/core/onfoot/statics';
import { VehicleSim } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';

const flat = new FunctionLand(() => 0);
const go = (forward = 1, right = 0, o: Partial<FootInput> = {}): FootInput => ({ forward, right, run: false, crouch: false, jump: false, ...o });

function run(w: FootWalker, seconds: number, inp: FootInput, each?: (w: FootWalker) => void): void {
  const n = Math.round(seconds / FOOT.h);
  for (let i = 0; i < n; i++) {
    w.step(inp);
    each?.(w);
  }
}

function makeWalkVehicle(
  frameId: string,
  opts: { openPanels?: Record<string, number>; roofT?: number; roofPart?: string } = {},
): WalkVehicle {
  const b = stockBuild(frameId);
  if (opts.roofPart) b.parts.roof = newInstance(opts.roofPart);
  const d = derive(b);
  const sim = new VehicleSim(d.spec as VehicleSpec);
  sim.reset(0, 0, 0, 0);
  const f = frameDef(frameId);
  const panels = opts.openPanels ?? {};
  return {
    build: b,
    sys: { derived: d },
    sim,
    view: {
      frame: f,
      roofT: opts.roofT ?? 0,
      hasPanel: (m) => f.mounts.some((x) => x.id === m && !!x.panel),
      panelOpen: (m) => panels[m] ?? 0,
    },
    carriedBy: null,
  };
}

describe('ND_FOOT movement physics', () => {
  const ndWalker = (land: Land = flat, solids?: StaticSolids | VehicleWalkSolids): FootWalker => {
    const w = new FootWalker(land, solids);
    w.setProfile(ND_FOOT);
    return w;
  };

  it('matches Nomad Drive speeds: walk 2.75, sprint 5.0, crouch 1.5, crouch-sprint 2.0, zero walking head bob', () => {
    const pace = (inp: FootInput): { speed: number; bobMax: number } => {
      const w = ndWalker();
      w.place(0, 0, 0);
      // Let crouch eye ease finish before sampling bob
      run(w, 1.5, inp);
      const x0 = w.x;
      const z0 = w.z;
      const eye0 = w.eye().y;
      let bobMax = 0;
      run(w, 1.5, inp, (q) => {
        bobMax = Math.max(bobMax, Math.abs(q.eye().y - eye0));
      });
      return { speed: Math.hypot(w.x - x0, w.z - z0) / 1.5, bobMax };
    };
    const walk = pace(go());
    expect(walk.speed).toBeCloseTo(2.75, 2);
    expect(walk.bobMax).toBeLessThan(1e-4);

    const sprint = pace(go(1, 0, { run: true }));
    expect(sprint.speed).toBeCloseTo(5.0, 2);
    expect(sprint.bobMax).toBeLessThan(1e-4);

    const crouch = pace(go(1, 0, { crouch: true }));
    expect(crouch.speed).toBeCloseTo(1.5, 2);
    expect(crouch.bobMax).toBeLessThan(1e-4);

    const crouchRun = pace(go(1, 0, { crouch: true, run: true }));
    expect(crouchRun.speed).toBeCloseTo(2.0, 2);
  });

  it('accelerates and brakes crisply at 20 m/s^2 and reaches 0.82 m jump apex with v0 = 4.0 m/s', () => {
    const w = ndWalker();
    w.place(0, 0, 0);
    // 0.1 s at 20 m/s^2 reaches 2.0 m/s
    run(w, 0.1, go(1, 0, { run: true }));
    expect(w.vx).toBeCloseTo(2.0, 1);
    // Stop cleanly within 0.15 s
    run(w, 0.15, go(0));
    expect(Math.hypot(w.vx, w.vz)).toBeLessThan(0.01);

    // Jump apex ~ 4.0^2 / (2 * 9.81) = 0.815 m
    let peak = 0;
    const j = go(0, 0, { jump: true });
    run(w, 1.2, j, (q) => (peak = Math.max(peak, q.y)));
    expect(peak).toBeGreaterThan(0.79);
    expect(peak).toBeLessThan(0.84);
    expect(w.grounded).toBe(true);
  });

  it('forbids jumping while crouched and honours 0.45 m base step & 0.70 m dynamic EntryAssistZone step', () => {
    const w = ndWalker();
    w.place(0, 0, 0);
    run(w, 0.2, go(0, 0, { crouch: true }));
    expect(w.crouched).toBe(true);
    run(w, 0.4, go(0, 0, { crouch: true, jump: true }));
    expect(w.jumps).toBe(0);
    expect(w.y).toBeCloseTo(0, 4);

    // Base step 0.45 m walks straight up a 0.44 m ledge, blocked by 0.60 m unless stepLimit raises it to 0.70 m
    const s = new StaticSolids();
    s.box(2.5, 0, 1.0, 1.0, 0, -0.1, 0.44, true);
    const w2 = ndWalker(flat, s);
    w2.place(0, 0, 0);
    run(w2, 1.2, go());
    expect(w2.y).toBeCloseTo(0.44, 2);

    const sHigh = new StaticSolids();
    sHigh.box(2.5, 0, 1.0, 1.0, 0, -0.1, 0.62, true);
    const wBlocked = ndWalker(flat, sHigh);
    wBlocked.place(0, 0, 0);
    run(wBlocked, 1.5, go());
    expect(wBlocked.y).toBeCloseTo(0, 2);

    const wAssist = ndWalker(flat, sHigh);
    wAssist.stepLimit = () => ENTRY_ASSIST_STEP;
    wAssist.place(0, 0, 0);
    run(wAssist, 0.9, go());
    expect(wAssist.y).toBeCloseTo(0.62, 2);
  });

  it('honours 0.1 s coyote time off a ledge and 0.1 s jump buffer before landing', () => {
    const s = new StaticSolids();
    s.box(0, 0, 1.0, 1.0, 0, -0.1, 1.0, true);
    const w = ndWalker(flat, s);
    w.place(0.85, 0, 0);
    // Walk off ledge for ~0.04 s after becoming airborne, then jump via coyote time
    let fell = 0;
    let jumped = false;
    for (let i = 0; i < 60; i++) {
      const wantJump = !w.grounded && fell >= 3 && !jumped;
      if (!w.grounded) fell++;
      if (wantJump) jumped = true;
      w.step(go(1, 0, { jump: wantJump }));
    }
    expect(w.jumps).toBe(1);
  });
});

describe('VehicleWalkSolids: campers, Buffalo bed, Turtle pop-up roof, and always-solid roofs', () => {
  it('Whale: closed side door blocks entry; open side door lets player walk freely up the steps into the cabin', () => {
    const rvClosed = makeWalkVehicle('rv', { openPanels: { door_side: 0 } });
    const vsClosed = new VehicleWalkSolids(rvClosed);
    const wClosed = new FootWalker(flat, vsClosed).setProfile(ND_FOOT);
    wClosed.stepLimit = (x, y, z) => vsClosed.entryStepLimit(x, y, z);
    // Start outside Whale's side door (x=-0.92, z=1.9), face -z (-PI/2)
    wClosed.place(-0.92, 1.9, -Math.PI / 2);
    run(wClosed, 1.5, go());
    expect(vsClosed.insideLiving(wClosed.x, wClosed.y, wClosed.z)).toBe(false);

    const rvOpen = makeWalkVehicle('rv', { openPanels: { door_side: 1 } });
    const vsOpen = new VehicleWalkSolids(rvOpen);
    const wOpen = new FootWalker(flat, vsOpen).setProfile(ND_FOOT);
    wOpen.stepLimit = (x, y, z) => vsOpen.entryStepLimit(x, y, z);
    wOpen.place(-0.92, 1.9, -Math.PI / 2);
    run(wOpen, 1.2, go());
    expect(vsOpen.insideLiving(wOpen.x, wOpen.y, wOpen.z)).toBe(true);
    expect(wOpen.y).toBeGreaterThan(0.75);
    expect(wOpen.floorTag).toBe(vsOpen.tagFloor);
  });

  it('Turtle: high-top cabin lets standing player walk right in with roof down and stand on rear decks; roof up adds headroom', () => {
    const turtleDown = makeWalkVehicle('turtle', { openPanels: { door_side: 1 }, roofT: 0 });
    const vsDown = new VehicleWalkSolids(turtleDown);
    const w = new FootWalker(flat, vsDown).setProfile(ND_FOOT);
    w.stepLimit = (x, y, z) => vsDown.entryStepLimit(x, y, z);
    w.place(-0.86, 1.85, -Math.PI / 2);
    // Walk straight inside standing upright while roof is down (#3 high-top remodel)
    run(w, 1.5, go(1, 0, { crouch: false }));
    expect(vsDown.insideLiving(w.x, w.y, w.z)).toBe(true);
    expect(w.crouched).toBe(false);

    // Raise the pop-up roof -> extra headroom and player can jump freely inside
    (turtleDown.view as { roofT: number }).roofT = 1;
    let peak = w.y;
    run(w, 0.8, go(0, 0, { jump: true }), (q) => (peak = Math.max(peak, q.y)));
    expect(w.jumps).toBe(1);
    expect(peak).toBeGreaterThan(w.y + 0.35);
    // Head must never exceed raised ceiling (3.12 m)
    expect(peak + ND_FOOT.height).toBeLessThanOrEqual(3.16);
  });

  it('Buffalo: lowered tailgate + invisible ND step plate + EntryAssistZone let player walk straight into the 0.80 m bed', () => {
    const buf = makeWalkVehicle('buffalo', { openPanels: { trunk: 1 } });
    const vs = new VehicleWalkSolids(buf);
    const w = new FootWalker(flat, vs).setProfile(ND_FOOT);
    w.stepLimit = (x, y, z) => vs.entryStepLimit(x, y, z);
    // Start behind the lowered tailgate facing +x (forward into the bed)
    w.place(-3.8, 0, 0);
    run(w, 1.5, go());
    expect(w.x).toBeGreaterThan(-2.3);
    expect(w.x).toBeLessThan(-1.2);
    expect(w.y).toBeGreaterThan(0.72);
    expect(w.floorTag).toBe(vs.tagBed);
  });

  it('all roofed frames (including Turtle) always expose a solid walkable roof slab', () => {
    for (const id of ['rv', 'turtle', 'sedan', 'buffalo', 'camel', 'elephant']) {
      const v = makeWalkVehicle(id);
      const vs = new VehicleWalkSolids(v);
      const spot = ladderSpot(id)!;
      expect(spot, id).toBeTruthy();
      const w = new FootWalker(flat, vs).setProfile(ND_FOOT);
      const [ex, ez] = spot.exit;
      const top = spot.floors[0].top;
      const cg = v.sys.derived.cg;
      // Convert model-space roof exit to world space (yaw = 0)
      const wx = v.sim.px + (ex - cg.x);
      const wy = v.sim.py + (top - cg.y);
      const wz = v.sim.pz + (ez - cg.z);
      w.placeAt(wx, wy + 0.1, wz, 0);
      run(w, 0.3, go(0));
      expect(w.grounded, id).toBe(true);
      expect(w.floorTag, id).toBe(vs.tagRoof);
      expect(w.y, id).toBeGreaterThan(wy - 0.15);
    }
  });
});
