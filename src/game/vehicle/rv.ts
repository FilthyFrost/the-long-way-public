/**
 * T3 — the motorhome 「鲸鱼」: a rounded, flat-nosed (forward-control) old camper you can walk about in.
 * Spec: specs/vehicles/rv_model.md. Model space = vehicle body frame: +x forward, +y up, +z right,
 * origin at the centre of gravity (1.0 m above the ground).
 *
 * Every exterior measure lives in DIM (heights above the ground, h); the building code below only
 * refers to it, so the body can be re-proportioned from a reference picture by editing the table.
 *
 * Meshes (draw calls): shell / shell:cut (painted body), room / room:cut (the home, lit by the cabin
 * lamp), cab + cluster (the cab: its own share of the lamp), slots (all fixtures, one mesh), glass /
 * glass:cut, windscreen, mirrors, head / tail lamps, lamp shades, the cab instruments, four wheels,
 * and the movers (door ×2, awning, passenger seat, curtain). Everything on the right-hand side and
 * on the roof sits under `cut` and is hidden for the cutaway picture.
 */
import * as THREE from 'three';
import type { WalkRect } from '../../core/onboard/walker';
import type { VehicleSpec } from '../../core/vehicle/spec';
import { glassMaterial, surfaceMaterial } from '../render/materials';
import { ModelBuilder, type Outline } from './builder';
import { buildCharm, buildCluster, buildGlass, buildLamps, buildMirrors, buildScreen, buildSteering, buildWheels, makeSlot, paneGeometry, PoseMesh, sidePane, SlotMesh, turnAbout, vehicleMaterials, WheelHubs, type PosedPart, type Reach, type VehicleParts, type VehicleSlot, type VehicleViewpoint } from './kit';
import { ACCENT, CabParts } from './cabkit';
import { DashPanel } from './dash';
import * as P from './props';

const PAL = P.PAL;

/** window: x0…x1 along the side (or z0…z1 across the back), h0…h1 above the ground */
interface Win {
  x0: number;
  x1: number;
  h0: number;
  h1: number;
}

/** all exterior measures (m). x along the body, z across (+ = right), h = height above the ground */
export const DIM = {
  /** body ends (the rounded box) and bumpers */
  xRear: -3.3,
  xFront: 3.45,
  bumperFront: 3.56,
  bumperRear: -3.4,
  /** half width of the body; skin and lining thickness */
  halfW: 1.1,
  skin: 0.03,
  lining: 0.03,
  /** radius of the vertical corners, drawn with three facets (front below the glass, back) */
  cornerFront: 0.16,
  cornerRear: 0.14,
  /** bottom edge of the body (ground clearance), the dark skirt and the band of old grime above it */
  bottom: 0.42,
  skirt: 0.6,
  grime: 0.7,
  /** where the walls turn into the rounded roof, and the top of the roof */
  shoulder: 2.52,
  roof: 2.86,
  /** half width of the flat top of the roof */
  roofFlat: 0.86,
  /** inside: floor of the room, the cab foot wells, the ceiling */
  floor: 0.8,
  cabFloor: 0.62,
  ceiling: 2.78,
  /** where the cab ends and the room begins (x) */
  cabX: 1.45,
  /** windscreen: foot and head of the glass (x, h) and its half width */
  glassFoot: { x: 3.4, h: 1.28 },
  glassHead: { x: 3.24, h: 2.45 },
  glassHalf: 0.98,
  /** the brow over the windscreen, back to front: [x, roof top, shoulder height] of each cross-section */
  brow: [
    [2.82, 2.86, 2.52],
    [3.08, 2.83, 2.51],
    [3.23, 2.74, 2.5],
    [3.31, 2.6, 2.48],
  ] as [number, number, number][],
  /** top of the room's wall lining, where the slanted ceiling begins */
  liningTop: 2.48,
  /** dash: from the driver's knees to the glass, its top */
  dash: { x0: 2.45, x1: 3.38, h: 1.27 },
  /** wheel arches: half length, height of the arc's centre (the arch top is at centre + half length) */
  arch: { half: 0.5, centre: 0.5 },
  /** round head lamps */
  headlamp: { h: 0.98, z: 0.7, r: 0.11 },
  /** tall tail lamps */
  taillamp: { h: 0.9, z: 0.9, tall: 0.4, wide: 0.08 },
  /** the waist band: teal sweep and the orange line under it; heights at the back and at the front corner */
  belt: { rear: [1.24, 1.5], front: [1.2, 1.42], line: 0.045, gap: 0.03, curlX: 2.62, curlDrop: 0.55 },
  /** doors: driver (left, seams only) and the entry (right, opens) */
  driverDoor: { x0: 1.5, x1: 2.35, bottom: 1.06, top: 2.42 },
  door: { x0: 0.6, x1: 1.4, top: 2.4 },
  doorWindow: { x0: 0.8, x1: 1.2, h0: 1.85, h1: 2.25 },
  windowsLeft: {
    driver: { x0: 1.62, x1: 2.32, h0: 1.45, h1: 2.38 },
    driverQuarter: { x0: 2.42, x1: 3.12, h0: 1.45, h1: 2.32 },
    kitchen: { x0: -0.3, x1: 0.75, h0: 1.82, h1: 2.3 },
    workbench: { x0: -1.12, x1: -0.62, h0: 2.0, h1: 2.36 },
    bunkLow: { x0: -2.6, x1: -2.0, h0: 1.3, h1: 1.6 },
    bunkHigh: { x0: -2.6, x1: -2.0, h0: 2.14, h1: 2.42 },
  } as Record<string, Win>,
  windowsRight: {
    passenger: { x0: 1.62, x1: 2.32, h0: 1.45, h1: 2.38 },
    passengerQuarter: { x0: 2.42, x1: 3.12, h0: 1.45, h1: 2.32 },
    dinette: { x0: -0.72, x1: 0.44, h0: 1.56, h1: 2.32 },
    hobby: { x0: -2.36, x1: -1.76, h0: 1.7, h1: 2.3 },
  } as Record<string, Win>,
  /** the big window across the back (z0…z1 here) */
  rearWindow: { x0: -0.9, x1: 0.9, h0: 1.45, h1: 2.4 },
  /** roof light over the galley (x0…x1, z0…z1) */
  skylight: { x0: -0.3, x1: 0.4, z0: -0.55, z1: 0.05 },
  /** awning roller on the right, over the windows */
  awning: { x0: -1.95, x1: 1.25, h: 2.5, reach: 2.2, drop: 0.32 },
  /** long truck mirrors on stalks */
  mirror: { x: 3.3, h: 1.95, z: 1.32, tall: 0.42, wide: 0.17 },
  /** ladder up the back to the roof deck */
  ladder: { z0: 0.6, z1: 0.88, top: 3.3 },
} as const;

// paint
const CREAM = 0xece2c8;
const TEAL = 0x5f9f95;
const ORANGE = 0xd98a3d;
const ROOF = 0xf6f1e6;
const DARK = 0x393d45;
const GRIME = 0xd2c4a2;
const MUD = 0x9a7b55;
const CHROME = 0xb9c0c4;
const RUBBER = 0x2b2e33;
const SIGNAL = 0xe39a3b;
// the room
const LINING = 0xe8dabb;
const CEIL = 0xfff3d8;
const FLOOR = 0x9c7350;
const DASH = 0x6aa596;
const MAT = 0x4b4f55;
const CURTAIN = 0xd9895a;
const SOFA = PAL.mustard;
const CURTAIN_TIE = 0xb86a45;
const BENCH = PAL.teal;

const DEG = Math.PI / 180;

/** a rectangle with its corners cut by one or two short facets (u0…u1, v0…v1) */
function roundRect(u0: number, u1: number, v0: number, v1: number, r: number): Outline {
  const k = r * 0.29;
  return [
    [u0 + r, v0], [u1 - r, v0], [u1 - k, v0 + k], [u1, v0 + r],
    [u1, v1 - r], [u1 - k, v1 - k], [u1 - r, v1],
    [u0 + r, v1], [u0 + k, v1 - k], [u0, v1 - r],
    [u0, v0 + r], [u0 + k, v0 + k],
  ];
}

/** the same rectangle grown by d on every side */
function grow(w: Win, d: number): Win {
  return { x0: w.x0 - d, x1: w.x1 + d, h0: w.h0 - d, h1: w.h1 + d };
}

export function buildRV(spec: VehicleSpec): VehicleParts {
  const D = DIM;
  const cg = spec.cgHeight;
  const y = (h: number): number => h - cg;
  const root = new THREE.Group();
  root.name = spec.id;
  const cut = new THREE.Group();
  cut.name = 'cut';
  root.add(cut);

  const W = D.halfW;
  const zSkin = W - D.skin; // 1.07: skin inner face = lining outer face
  const zIn = zSkin - D.lining; // 1.04: the room's walls
  const frontAxle = spec.wheelbase * (1 - spec.weightFront);
  const rearAxle = -spec.wheelbase * spec.weightFront;
  const eye = spec.eye;

  // builders, one per mesh
  const hull = new ModelBuilder(); // the outer hull that stays (its size is checked)
  const hullCut = new ModelBuilder();
  const shell = new ModelBuilder(); // trim on the body
  const shellCut = new ModelBuilder();
  const room = new ModelBuilder();
  const roomCut = new ModelBuilder();
  const cab = new ModelBuilder();
  const dashKit = new ModelBuilder();

  // ------------------------------------------------------------------ side walls
  const archPts = (xa: number): Outline => {
    const pts: Outline = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI - (i / n) * Math.PI;
      pts.push([xa + Math.cos(a) * D.arch.half, y(D.arch.centre) + Math.sin(a) * D.arch.half]);
    }
    return pts;
  };
  const xSideRear = D.xRear + D.cornerRear;
  const xSideFront = D.xFront - D.cornerFront;
  /** points round a vertical corner: centre (cx, cz), radius r, from the side (α = 0) to the end face (90°); fx = ±1 front / back, s = ±1 side */
  const cornerArc = (cx: number, cz: number, r: number, fx: number, s: number, n = 3): [number, number][] => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * (Math.PI / 2);
      pts.push([cx + fx * r * Math.sin(a), s * (cz + r * Math.cos(a))]);
    }
    return pts;
  };
  /** a solid round corner between two heights (a slice of a cylinder), as hull points */
  const cornerSolid = (arc: [number, number][], h0: number, h1: number): number[][] => arc.flatMap(([x, z]) => [[x, y(h0), z], [x, y(h1), z]]);
  /** outline of a side wall in (x, y); the right one has the entry door cut out of it */
  const sideOutline = (door: boolean): Outline => {
    const o: Outline = [[xSideRear, y(D.bottom)]];
    o.push([rearAxle - D.arch.half, y(D.bottom)], ...archPts(rearAxle), [rearAxle + D.arch.half, y(D.bottom)]);
    if (door) o.push([D.door.x0, y(D.bottom)], [D.door.x0, y(D.door.top)], [D.door.x1, y(D.door.top)], [D.door.x1, y(D.bottom)]);
    o.push([frontAxle - D.arch.half, y(D.bottom)], ...archPts(frontAxle), [frontAxle + D.arch.half, y(D.bottom)]);
    o.push([xSideFront, y(D.bottom)], [xSideFront, y(D.glassFoot.h)], [D.glassFoot.x - 0.02, y(D.glassFoot.h)], [D.glassHead.x - 0.02, y(D.glassHead.h)]);
    // up the brow's edge, cross-section by cross-section, then back along the shoulder
    for (let i = D.brow.length - 1; i >= 0; i--) o.push([D.brow[i][0], y(D.brow[i][2])]);
    o.push([xSideRear, y(D.shoulder)]);
    return o;
  };
  const winOutline = (w: Win, r = 0.07): Outline => roundRect(w.x0, w.x1, y(w.h0), y(w.h1), r);
  const leftWins = Object.values(D.windowsLeft);
  const rightWins = Object.values(D.windowsRight);
  const dd = D.driverDoor;
  /** the driver's door's opening (the door with its window rides in it, posed) */
  const ddHole: Outline = [[dd.x0, y(dd.bottom)], [dd.x1, y(dd.bottom)], [dd.x1, y(dd.top)], [dd.x0, y(dd.top)]];
  /** the left wall's windows without the driver's (it is in the door); the right ones without the passenger's pane (it winds down) */
  const leftFixed = leftWins.filter((w) => w !== D.windowsLeft.driver);
  hull.prism('xy', sideOutline(false), [...leftFixed.map((w) => winOutline(w)), ddHole], -W, -zSkin, CREAM);
  hullCut.prism('xy', sideOutline(true), rightWins.map((w) => winOutline(w)), zSkin, W, CREAM);

  // the room's lining: floor to shoulder, the cab's down to the foot wells
  const liningOutline = (door: boolean): Outline => {
    const o: Outline = [[D.xRear + 0.06, y(D.floor)]];
    if (door) o.push([D.door.x0, y(D.floor)], [D.door.x0, y(D.door.top)], [D.door.x1, y(D.door.top)], [D.door.x1, y(D.floor)]);
    o.push([D.cabX, y(D.floor)], [D.cabX, y(D.cabFloor)], [xSideFront, y(D.cabFloor)], [xSideFront, y(D.glassFoot.h)], [D.glassFoot.x - 0.05, y(D.glassFoot.h)]);
    o.push([D.glassHead.x - 0.05, y(D.glassHead.h)], [3.1, y(D.liningTop)], [D.xRear + 0.06, y(D.liningTop)]);
    return o;
  };
  room.prism('xy', liningOutline(false), [...leftFixed.map((w) => winOutline(w)), ddHole], -zSkin, -zIn, LINING);
  roomCut.prism('xy', liningOutline(true), rightWins.map((w) => winOutline(w)), zIn, zSkin, LINING);

  // paint over the skin: skirt, grime, the belt (a teal sweep that curls down at the nose, an orange line under it)
  const sideSpans = (door: boolean): [number, number][] => {
    const s: [number, number][] = [[xSideRear, rearAxle - D.arch.half], [rearAxle + D.arch.half, frontAxle - D.arch.half], [frontAxle + D.arch.half, xSideFront]];
    if (!door) return s;
    return [s[0], [s[1][0], D.door.x0], [D.door.x1, s[1][1]], s[2]];
  };
  const beltTop = (x: number): number => {
    const t = (x - xSideRear) / (D.belt.curlX - xSideRear);
    if (t <= 1) return D.belt.rear[1] + (D.belt.front[1] - D.belt.rear[1]) * t + 0.025 * Math.sin(t * Math.PI * 2.0);
    const u = (x - D.belt.curlX) / (xSideFront - D.belt.curlX);
    return D.belt.front[1] - D.belt.curlDrop * u * u;
  };
  const beltBottom = (x: number): number => {
    const t = (x - xSideRear) / (D.belt.curlX - xSideRear);
    if (t <= 1) return D.belt.rear[0] + (D.belt.front[0] - D.belt.rear[0]) * t + 0.025 * Math.sin(t * Math.PI * 2.0);
    const u = (x - D.belt.curlX) / (xSideFront - D.belt.curlX);
    return D.belt.front[0] - (D.belt.curlDrop + 0.12) * u * u;
  };
  /** a band between two height functions from x0 to x1, drawn as a thin prism on a side */
  const band = (b: ModelBuilder, x0: number, x1: number, lo: (x: number) => number, hi: (x: number) => number, side: number, color: number, lift = 0.004): void => {
    const n = Math.max(2, Math.ceil((x1 - x0) / 0.25));
    const o: Outline = [];
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      o.push([x, y(lo(x))]);
    }
    for (let i = n; i >= 0; i--) {
      const x = x0 + ((x1 - x0) * i) / n;
      o.push([x, y(hi(x))]);
    }
    const z0 = side * W;
    b.prism('xy', o, [], z0, z0 + side * lift, color);
  };
  const paintSide = (b: ModelBuilder, side: number, door: boolean): void => {
    for (const [x0, x1] of sideSpans(door)) {
      band(b, x0, x1, () => D.bottom, () => D.skirt, side, DARK);
      band(b, x0, x1, () => D.skirt, () => D.grime, side, GRIME);
    }
    // the belt runs over the door too (the door carries its own piece)
    const beltSpans: [number, number][] = door ? [[xSideRear, D.door.x0], [D.door.x1, xSideFront]] : [[xSideRear, D.driverDoor.x0], [D.driverDoor.x1, xSideFront]];
    for (const [x0, x1] of beltSpans) {
      band(b, x0, x1, beltBottom, beltTop, side, TEAL);
      band(b, x0, x1, (x) => beltBottom(x) - D.belt.gap - D.belt.line, (x) => beltBottom(x) - D.belt.gap, side, ORANGE);
    }
    // arch lips
    for (const xa of [rearAxle, frontAxle]) {
      const pts = archPts(xa);
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        const mx = (ax + bx) / 2 - xa;
        const my = (ay + by) / 2 - y(D.arch.centre);
        const ml = Math.hypot(mx, my);
        const ox = (mx / ml) * 0.03;
        const oy = (my / ml) * 0.03;
        b.bar(ax + ox, ay + oy, side * (W + 0.012), bx + ox, by + oy, side * (W + 0.012), 0.06, DARK);
      }
    }
    // window frames: a dark rim round each opening
    for (const w of side < 0 ? leftWins.filter((w) => w !== D.windowsLeft.driver) : rightWins) b.prism('xy', winOutline(grow(w, 0.035), 0.1), [winOutline(w)], side * W, side * (W + 0.014), DARK);
    // a drip rail where the wall turns into the roof
    b.span(xSideRear, D.brow[0][0], y(D.shoulder) - 0.012, y(D.shoulder) + 0.012, side * W, side * (W + 0.02), DARK);
    // mud thrown up by the wheels
    for (const xa of [rearAxle, frontAxle]) {
      for (const [dx, dh, s] of [[-0.62, 0.66, 0.05], [-0.7, 0.8, 0.035], [0.6, 0.7, 0.04], [0.74, 0.62, 0.05], [-0.55, 0.9, 0.03]] as [number, number, number][]) {
        b.box(xa + dx, y(dh), side * (W + 0.006), s * 1.4, s, 0.004, MUD, { rx: 0, rz: dx * 0.7 });
      }
    }
  };
  paintSide(shell, -1, false);
  paintSide(shellCut, 1, true);

  // a step under the driver's door (the door itself opens: see the doors below)
  shell.span(dd.x0 - 0.02, dd.x0 + 0.42, y(0.5), y(0.54), -(W + 0.22), -W, DARK);
  // stickers and a fuel cap on the left, a lantern hook by the door on the right
  shell.cyl(-2.85, y(1.82), -(W + 0.005), 0.11, 0.008, PAL.mustard, { rx: Math.PI / 2, segments: 12 });
  shell.cyl(-2.85, y(1.82), -(W + 0.009), 0.05, 0.004, ORANGE, { rx: Math.PI / 2, segments: 10 });
  shell.box(-2.55, y(1.84), -(W + 0.006), 0.22, 0.14, 0.006, PAL.sky, { rz: 0.08 });
  shell.box(-2.55, y(1.82), -(W + 0.008), 0.18, 0.05, 0.006, PAL.green, { rz: 0.08 });
  shell.box(-1.9, y(1.06), -(W + 0.006), 0.16, 0.1, 0.006, PAL.red, { rz: -0.1 });
  shell.cyl(-0.85, y(0.98), -(W + 0.008), 0.07, 0.016, DARK, { rx: Math.PI / 2, segments: 10 });

  let hatchGeo: THREE.BufferGeometry | null = null;
  // ------------------------------------------------------------------ front: lower face, corners, pillars, glass frame
  {
    const rf = D.cornerFront;
    const zF = W - rf;
    hull.prism('zy', [[-zF, y(D.bottom)], [zF, y(D.bottom)], [zF, y(D.glassFoot.h)], [-zF, y(D.glassFoot.h)]], [[[-0.52, y(0.77)], [0.52, y(0.77)], [0.52, y(1.1)], [-0.52, y(1.1)]]], D.xFront - 0.03, D.xFront, CREAM);
    for (const s of [-1, 1]) {
      // the round corner between side and front, below the glass
      hull.hull(cornerSolid(cornerArc(xSideFront, zF, rf, 1, s), D.bottom, D.glassFoot.h), CREAM);
      // A-pillar: a thick post along the edge of the glass
      hull.bar(D.glassFoot.x + 0.01, y(D.glassFoot.h - 0.02), s * (D.glassHalf + 0.06), D.glassHead.x + 0.0, y(D.glassHead.h + 0.03), s * (D.glassHalf + 0.06), 0.13, CREAM);
      // skirt and grime carried round the corner
      shell.hull(cornerSolid(cornerArc(xSideFront, zF, rf + 0.004, 1, s), D.bottom, D.skirt), DARK);
      shell.hull(cornerSolid(cornerArc(xSideFront, zF, rf + 0.004, 1, s), D.skirt, D.grime), GRIME);
    }
    // the front face: teal band across under the glass, head lamp bezels, grille bars, signals
    const xf = D.xFront + 0.004;
    hull.span(D.xFront - 0.01, xf, y(D.bottom), y(D.skirt), -zF, zF, DARK);
    shell.span(D.xFront, xf + 0.002, y(1.12), y(1.25), -zF, zF, TEAL);
    shell.span(D.xFront, xf + 0.002, y(1.12) - D.belt.gap - D.belt.line, y(1.12) - D.belt.gap, -zF, zF, ORANGE);
    for (const s of [-1, 1]) {
      shell.cyl(xf + 0.006, y(D.headlamp.h), s * D.headlamp.z, D.headlamp.r + 0.025, 0.02, CHROME, { rz: Math.PI / 2, segments: 16 });
      shell.box(xf + 0.006, y(D.headlamp.h - 0.02), s * 0.93, 0.02, 0.09, 0.07, SIGNAL);
    }
    // the grille is the service hatch (posed below); behind it the radiator, the engine's front, the battery
    shell.span(D.xFront - 0.25, D.xFront - 0.2, y(0.78), y(1.08), -0.48, 0.48, 0x3f4650); // radiator
    shell.span(D.xFront - 0.6, D.xFront - 0.25, y(0.7), y(1.05), -0.3, 0.3, 0x4a5058); // the engine
    shell.span(D.xFront - 0.45, D.xFront - 0.25, y(0.78), y(0.92), 0.32, 0.5, DARK); // battery
    shell.span(D.xFront - 0.44, D.xFront - 0.26, y(0.92), y(0.93), 0.34, 0.48, PAL.red);
    shell.span(D.xFront - 0.45, D.xFront - 0.25, y(0.78), y(0.9), -0.5, -0.32, 0x6a7471); // the cold kit
    const hatch = new ModelBuilder();
    hatch.span(D.xFront - 0.006, D.xFront + 0.004, y(0.775), y(1.095), -0.515, 0.515, CREAM);
    for (const h of [0.82, 0.9, 0.98, 1.06]) hatch.span(D.xFront, xf + 0.018, y(h) - 0.012, y(h) + 0.012, -0.46, 0.46, CHROME);
    hatch.span(D.xFront, xf + 0.01, y(0.78), y(1.09), -0.5, -0.47, CHROME);
    hatch.span(D.xFront, xf + 0.01, y(0.78), y(1.09), 0.47, 0.5, CHROME);
    hatch.box(xf + 0.02, y(0.8), 0, 0.02, 0.025, 0.12, ACCENT); // the catch
    hatchGeo = hatch.build();
    // a little whale painted on the nose (our own mark, no maker's badge)
    shell.hull([[xf + 0.012, y(1.31), -0.07], [xf + 0.012, y(1.35), 0.06], [xf + 0.012, y(1.29), 0.09], [xf + 0.02, y(1.32), 0.0]], CREAM);
    shell.box(xf + 0.015, y(1.32), 0.1, 0.01, 0.05, 0.02, CREAM, { rx: 0.5 });
    // bumper: dark with a thin chrome strip, a number plate
    hull.span(D.xFront, D.bumperFront, y(0.48), y(0.66), -W + 0.04, W - 0.04, DARK);
    shell.span(D.bumperFront - 0.002, D.bumperFront + 0.006, y(0.62), y(0.645), -W + 0.06, W - 0.06, CHROME);
    shell.span(D.bumperFront, D.bumperFront + 0.01, y(0.5), y(0.6), -0.22, 0.22, PAL.paper);
    shell.span(D.bumperFront + 0.008, D.bumperFront + 0.012, y(0.53), y(0.57), -0.16, 0.16, DARK);
    // the cowl under the glass and the dark seal round it
    shell.span(D.glassFoot.x - 0.03, D.xFront, y(D.glassFoot.h) - 0.012, y(D.glassFoot.h) + 0.008, -D.glassHalf - 0.03, D.glassHalf + 0.03, RUBBER);
    shell.bar(D.glassHead.x + 0.01, y(D.glassHead.h + 0.005), -D.glassHalf, D.glassHead.x + 0.01, y(D.glassHead.h + 0.005), D.glassHalf, 0.03, RUBBER);
    shell.span(D.xFront, xf + 0.002, y(D.skirt), y(D.grime), -zF, zF, GRIME);
    // the thin post down the middle of the glass
    shell.bar(D.glassFoot.x + 0.012, y(D.glassFoot.h), 0, D.glassHead.x + 0.012, y(D.glassHead.h), 0, 0.035, DARK);
  }

  // ------------------------------------------------------------------ the back: face, corners, window
  /**
   * A cross-section of the roof, left to right in (z, y): up the shoulder in three facets, across the
   * flat top (with two points where the roof light is cut out), down the other shoulder.
   */
  const section = (Wd: number, top: number, sh: number, flat: number = D.roofFlat): number[][] => {
    const d = top - sh;
    const k = Wd - flat;
    const t = y(top);
    const half: number[][] = [[Wd, y(sh)], [Wd - 0.17 * k, y(sh + 0.55 * d)], [Wd - 0.5 * k, y(sh + 0.87 * d)]];
    return [...half.map(([z, yy]) => [-z, yy]), [-flat, t], [D.skylight.z0, t], [D.skylight.z1, t], [flat, t], ...half.reverse()];
  };
  /** the roof light's segment in a section */
  const SKY_SEG = 4;
  /** the rounded back end: sections round the corner's arc (α = 90° is the back face itself) */
  const rearSection = (aDeg: number): { x: number; sec: number[][] } => {
    const a = (aDeg * Math.PI) / 180;
    const r = D.cornerRear;
    const inset = r * (1 - Math.cos(a));
    return { x: xSideRear - r * Math.sin(a), sec: section(W - inset, D.roof - 0.8 * inset, D.shoulder, D.roofFlat - inset) };
  };
  const secRear = rearSection(90).sec;
  {
    const zR = W - D.cornerRear;
    const outline: Outline = [[-zR, y(D.bottom)], [zR, y(D.bottom)]];
    for (let i = secRear.length - 1; i >= 0; i--) outline.push([secRear[i][0], secRear[i][1]]);
    const rw = D.rearWindow;
    hull.prism('zy', outline, [roundRect(rw.x0, rw.x1, y(rw.h0), y(rw.h1), 0.08)], D.xRear, D.xRear + 0.03, CREAM);
    for (const s of [-1, 1]) {
      // the round corner between side and back, and the skirt and grime round it
      hull.hull(cornerSolid(cornerArc(xSideRear, zR, D.cornerRear, -1, s), D.bottom, D.shoulder), CREAM);
      shell.hull(cornerSolid(cornerArc(xSideRear, zR, D.cornerRear + 0.004, -1, s), D.bottom, D.skirt), DARK);
      shell.hull(cornerSolid(cornerArc(xSideRear, zR, D.cornerRear + 0.004, -1, s), D.skirt, D.grime), GRIME);
    }
    const xr = D.xRear - 0.004;
    shell.span(xr, D.xRear, y(D.bottom), y(D.skirt), -zR, zR, DARK);
    shell.span(xr, D.xRear, y(D.skirt), y(D.grime), -zR, zR, GRIME);
    shell.span(xr - 0.002, D.xRear, y(1.2), y(1.32), -zR, zR, TEAL);
    shell.span(xr - 0.002, D.xRear, y(1.2) - D.belt.gap - D.belt.line, y(1.2) - D.belt.gap, -zR, zR, ORANGE);
    shell.prism('zy', roundRect(rw.x0 - 0.035, rw.x1 + 0.035, y(rw.h0 - 0.035), y(rw.h1 + 0.035), 0.1), [roundRect(rw.x0, rw.x1, y(rw.h0), y(rw.h1), 0.08)], D.xRear - 0.014, D.xRear, DARK);
    hull.span(D.bumperRear, D.xRear, y(0.46), y(0.64), -W + 0.06, W - 0.06, DARK);
    shell.span(D.bumperRear - 0.006, D.bumperRear, y(0.5), y(0.6), 0.25, 0.55, PAL.paper); // plate
    shell.box(D.bumperRear - 0.008, y(0.55), 0.4, 0.004, 0.04, 0.24, DARK);
    // stickers on the back: a sun and a striped flag of our own
    shell.cyl(xr - 0.004, y(2.55), -0.62, 0.08, 0.006, PAL.mustard, { rz: Math.PI / 2, segments: 12 });
    shell.box(xr - 0.004, y(1.38), -0.75, 0.006, 0.08, 0.18, PAL.sky, { rx: 0.06 });
    shell.box(xr - 0.006, y(1.38), -0.75, 0.006, 0.025, 0.18, PAL.paper, { rx: 0.06 });
  }

  // ------------------------------------------------------------------ the rounded roof: one skin through cross-sections
  {
    const S = (x: number, sec: number[][]): number[][] => sec.map(([z, yy]) => [x, yy, z]);
    const full = section(W, D.roof, D.shoulder);
    const rearLoft = [90, 60, 30, 0].map((a) => {
      const r = rearSection(a);
      return S(r.x, r.sec);
    });
    // the brow: bulges over the glass, its underside closes onto the head of the windscreen
    const lip = full.map(([z]) => [z, y(D.glassHead.h)]);
    const frontLoft = [...D.brow.map(([x, top, sh]) => S(x, section(W, top, sh))), S(D.glassHead.x - 0.01, lip)];
    hullCut.loft(rearLoft, ROOF);
    hullCut.loft([S(xSideRear, full), S(D.skylight.x0, full)], ROOF);
    // around the roof light: everything but the segment over it
    const skyLoft = [S(D.skylight.x0, full), S(D.skylight.x1, full)];
    for (let i = 0; i + 1 < full.length; i++) {
      if (i === SKY_SEG) continue;
      hullCut.loft(skyLoft.map((sec) => [sec[i], sec[i + 1]]), ROOF);
    }
    hullCut.loft([S(D.skylight.x1, full), S(D.brow[0][0], full)], ROOF);
    hullCut.loft(frontLoft, ROOF);
    // the lining under it: slanted strips from the walls to the flat ceiling
    const inner = (x: number): number[][] => [
      [x, y(D.liningTop), -zIn], [x, y(2.68), -0.97], [x, y(D.ceiling), -0.84],
    ];
    const innerR = (x: number): number[][] => inner(x).map(([a, b, c]) => [a, b, -c]).reverse();
    // the back wall's lining, shaped to the slanted ceiling, with the big window
    {
      const rw = D.rearWindow;
      const o: Outline = [[-zIn, y(D.floor)], [zIn, y(D.floor)], [zIn, y(D.liningTop)], [0.97, y(2.68)], [0.84, y(D.ceiling)], [-0.84, y(D.ceiling)], [-0.97, y(2.68)], [-zIn, y(D.liningTop)]];
      room.prism('zy', o, [roundRect(rw.x0, rw.x1, y(rw.h0), y(rw.h1), 0.08)], D.xRear + 0.03, D.xRear + 0.06, LINING);
      room.prism('zy', roundRect(rw.x0 - 0.03, rw.x1 + 0.03, y(rw.h0 - 0.03), y(rw.h1 + 0.03), 0.09), [roundRect(rw.x0, rw.x1, y(rw.h0), y(rw.h1), 0.08)], D.xRear + 0.06, D.xRear + 0.072, PAL.woodLight);
    }
    roomCut.loft([inner(D.xRear + 0.06), inner(3.0)], CEIL);
    roomCut.loft([innerR(D.xRear + 0.06), innerR(3.0)], CEIL);
    const sk = D.skylight;
    roomCut.prism('xz', [[D.xRear + 0.06, -0.86], [3.0, -0.86], [3.0, 0.86], [D.xRear + 0.06, 0.86]], [[[sk.x0, sk.z0], [sk.x1, sk.z0], [sk.x1, sk.z1], [sk.x0, sk.z1]]], y(D.ceiling), y(D.ceiling) + 0.02, CEIL);
    // the light well up to the roof
    roomCut.span(sk.x0 - 0.02, sk.x0, y(D.ceiling), y(D.roof), sk.z0, sk.z1, PAL.woodLight);
    roomCut.span(sk.x1, sk.x1 + 0.02, y(D.ceiling), y(D.roof), sk.z0, sk.z1, PAL.woodLight);
    roomCut.span(sk.x0, sk.x1, y(D.ceiling), y(D.roof), sk.z0 - 0.02, sk.z0, PAL.woodLight);
    roomCut.span(sk.x0, sk.x1, y(D.ceiling), y(D.roof), sk.z1, sk.z1 + 0.02, PAL.woodLight);
    // the hood over it: a raised rim and a lid propped open toward the back
    shellCut.span(sk.x0 - 0.05, sk.x1 + 0.05, y(D.roof), y(D.roof) + 0.07, sk.z0 - 0.05, sk.z0, DARK);
    shellCut.span(sk.x0 - 0.05, sk.x1 + 0.05, y(D.roof), y(D.roof) + 0.07, sk.z1, sk.z1 + 0.05, DARK);
    shellCut.span(sk.x0 - 0.05, sk.x0, y(D.roof), y(D.roof) + 0.07, sk.z0, sk.z1, DARK);
    shellCut.span(sk.x1, sk.x1 + 0.05, y(D.roof), y(D.roof) + 0.07, sk.z0, sk.z1, DARK);
    const lidA = 26 * DEG;
    const lx = (t: number): number => sk.x1 - t * Math.cos(lidA) * (sk.x1 - sk.x0);
    const ly = (t: number): number => y(D.roof) + 0.07 + t * Math.sin(lidA) * (sk.x1 - sk.x0);
    shellCut.bar(lx(0), ly(0), sk.z0, lx(1), ly(1), sk.z0, 0.03, DARK);
    shellCut.bar(lx(0), ly(0), sk.z1, lx(1), ly(1), sk.z1, 0.03, DARK);
    shellCut.bar(lx(1), ly(1), sk.z0, lx(1), ly(1), sk.z1, 0.03, DARK);
    shellCut.bar(lx(0.55), y(D.roof) + 0.07, sk.z1 - 0.06, lx(0.55), ly(0.55), sk.z1 - 0.06, 0.015, CHROME); // prop
    // chimney over the stove
    shellCut.cyl(-0.15, y(D.roof) + 0.17, -0.72, 0.05, 0.34, DARK, { segments: 10 });
    shellCut.cyl(-0.15, y(D.roof) + 0.37, -0.72, 0.1, 0.06, DARK, { segments: 10, radiusTop: 0.02 });
    shellCut.cyl(-0.15, y(D.roof) + 0.02, -0.72, 0.09, 0.04, DARK, { segments: 10 });
    // drip rails along the roof edges are on the walls (paintSide); a vent and a hatch near the front
    shellCut.span(1.9, 2.2, y(D.roof), y(D.roof) + 0.06, 0.3, 0.6, PAL.steel);
  }

  // ------------------------------------------------------------------ inside: floors, cab, dash
  {
    // the room floor, with the rear wheels' housings and the step well by the door cut out
    const rx0 = rearAxle - 0.5;
    const rx1 = rearAxle + 0.5;
    const outline: Outline = [
      [D.xRear + 0.06, -zIn], [rx0, -zIn], [rx0, -0.7], [rx1, -0.7], [rx1, -zIn], [D.cabX, -zIn],
      [D.cabX, zIn], [D.door.x1 - 0.02, zIn], [D.door.x1 - 0.02, 0.76], [D.door.x0 + 0.02, 0.76], [D.door.x0 + 0.02, zIn],
      [rx1, zIn], [rx1, 0.7], [rx0, 0.7], [rx0, zIn], [D.xRear + 0.06, zIn],
    ];
    room.prism('xz', outline, [], y(D.floor) - 0.04, y(D.floor), FLOOR);
    // wheel housings: a lid and an inner wall, open underneath
    for (const s of [-1, 1]) {
      room.span(rx0, rx1, y(D.floor), y(0.94), s * 0.7, s * 0.72, PAL.woodDark);
      room.span(rx0, rx1, y(0.92), y(0.94), s * 0.72, s * zIn, PAL.woodDark);
      room.span(rx0 - 0.02, rx0, y(0.62), y(0.94), s * 0.7, s * zIn, PAL.woodDark);
      room.span(rx1, rx1 + 0.02, y(0.62), y(0.94), s * 0.7, s * zIn, PAL.woodDark);
    }
    // step well inside the door: a tread and its riser
    room.span(D.door.x0 + 0.02, D.door.x1 - 0.02, y(0.56), y(0.6), 0.76, zIn, PAL.woodDark);
    room.span(D.door.x0 + 0.02, D.door.x1 - 0.02, y(0.6), y(D.floor), 0.74, 0.76, PAL.woodDark);
    room.span(D.door.x0 + 0.02, D.door.x1 - 0.02, y(0.44), y(0.56), zIn - 0.02, zIn, DARK);
    room.span(D.door.x0 + 0.02, D.door.x1 - 0.02, y(D.floor) - 0.01, y(D.floor) + 0.006, 0.735, 0.76, CHROME); // nosing
    // fold-out step outside
    shellCut.span(D.door.x0 + 0.08, D.door.x1 - 0.08, y(0.33), y(0.37), W, W + 0.26, DARK);
    shellCut.span(D.door.x0 + 0.08, D.door.x1 - 0.08, y(0.37), y(0.38), W + 0.02, W + 0.24, CHROME);
    // the underbody between the wheels (keeps the light from showing under the floor)
    shell.span(-3.05, 3.2, y(0.45), y(D.floor) - 0.05, -0.66, 0.66, RUBBER);
    shell.span(-3.0, 3.2, y(0.5), y(D.floor) - 0.05, -0.68, -0.66, DARK);
    shell.span(-3.0, 3.2, y(0.5), y(D.floor) - 0.05, 0.66, 0.68, DARK);
  }
  // things on the dash and the brow shelf that hop on a bump (one mesh)
  const jump = new ModelBuilder();
  // the cab: foot wells, the engine cover between the seats (the passage), dash and wheel boxes
  {
    const fx0 = frontAxle - 0.46;
    const fx1 = frontAxle + 0.46;
    cab.prism('xz', [[D.cabX, -zIn], [fx0, -zIn], [fx0, -0.72], [fx1, -0.72], [fx1, -zIn], [D.dash.x1, -zIn], [D.dash.x1, zIn], [fx1, zIn], [fx1, 0.72], [fx0, 0.72], [fx0, zIn], [D.cabX, zIn]], [], y(D.cabFloor) - 0.04, y(D.cabFloor), MAT);
    for (const s of [-1, 1]) {
      cab.span(fx0, fx1, y(D.cabFloor), y(0.92), s * 0.72, s * 0.74, DARK);
      cab.span(fx0, fx1, y(0.9), y(0.92), s * 0.74, s * zIn, DARK);
      cab.span(fx0 - 0.02, fx0, y(D.cabFloor), y(0.92), s * 0.72, s * zIn, DARK);
      cab.span(fx1, fx1 + 0.02, y(D.cabFloor), y(0.92), s * 0.72, s * zIn, DARK);
    }
    // the step down from the room into the cab
    cab.span(D.cabX - 0.02, D.cabX, y(D.cabFloor), y(D.floor), -zIn, zIn, PAL.woodDark);
    // the passage: the engine cover, flush with the room floor, a rubber mat and an access lid
    cab.span(D.cabX, D.dash.x0 + 0.5, y(D.cabFloor), y(D.floor) - 0.01, -0.225, 0.225, DASH);
    cab.span(D.cabX, D.dash.x0 + 0.5, y(D.floor) - 0.01, y(D.floor), -0.215, 0.215, MAT);
    cab.span(1.7, 1.71, y(D.floor), y(D.floor) + 0.003, -0.18, 0.18, DARK);
    cab.span(2.2, 2.21, y(D.floor), y(D.floor) + 0.003, -0.18, 0.18, DARK);
    cab.span(1.7, 2.2, y(D.floor), y(D.floor) + 0.003, -0.185, -0.175, DARK);
    cab.span(1.7, 2.2, y(D.floor), y(D.floor) + 0.003, 0.175, 0.185, DARK);
    // flask holder at the front of the passage
    cab.cyl(2.4, y(D.floor) + 0.08, 0.12, 0.045, 0.16, PAL.woodDark, { segments: 8 });
    cab.cyl(2.4, y(D.floor) + 0.2, 0.12, 0.038, 0.26, PAL.red, { segments: 8 });
    cab.cyl(2.4, y(D.floor) + 0.34, 0.12, 0.03, 0.03, DARK, { segments: 8 });
    // the dash: a deep platform from the knees to the glass; a toe board under it
    const dsh = D.dash;
    cab.hull([[dsh.x0, y(dsh.h), -zIn], [dsh.x1, y(dsh.h), -zIn], [dsh.x0, y(dsh.h), zIn], [dsh.x1, y(dsh.h), zIn], [dsh.x0, y(0.98), -zIn], [dsh.x0, y(0.98), zIn], [dsh.x1, y(0.9), -zIn], [dsh.x1, y(0.9), zIn], [dsh.x0 + 0.06, y(0.94), -zIn], [dsh.x0 + 0.06, y(0.94), zIn]], DASH);
    cab.hull([[dsh.x0 + 0.08, y(0.94), -zIn], [dsh.x0 + 0.08, y(0.94), zIn], [dsh.x1, y(0.94), -zIn], [dsh.x1, y(0.94), zIn], [2.8, y(D.cabFloor), -zIn], [2.8, y(D.cabFloor), zIn], [dsh.x1, y(D.cabFloor), -zIn], [dsh.x1, y(D.cabFloor), zIn]], RUBBER);
    cab.span(dsh.x0 + 0.002, dsh.x0 + 0.1, y(dsh.h), y(dsh.h) + 0.012, -zIn, zIn, 0x8cc0b0); // worn top edge
    cab.span(3.2, 3.3, y(dsh.h), y(dsh.h) + 0.006, -0.9, -0.15, DARK); // demister vents
    cab.span(3.2, 3.3, y(dsh.h), y(dsh.h) + 0.006, 0.15, 0.9, DARK);
    // pedals and the shifter on the dash face, switches
    for (const [z, wd] of [[-0.62, 0.07], [-0.46, 0.09], [-0.3, 0.07]] as [number, number][]) cab.box(2.68, y(0.74), z, 0.03, 0.1, wd, DARK, { rz: 0.5 });
    cab.span(dsh.x0 - 0.002, dsh.x0, y(0.99), y(1.14), 0.44, 0.86, DARK); // the glovebox's opening (its lid is posed)
    // the brow over the glass is a shelf from inside: blankets, books, a lantern
    cab.span(2.96, D.glassHead.x + 0.02, y(D.glassHead.h) + 0.0, y(D.glassHead.h) + 0.03, -zIn, zIn, PAL.wood);
    cab.span(2.94, 2.97, y(D.glassHead.h) - 0.02, y(D.glassHead.h) + 0.09, -zIn, zIn, PAL.woodDark);
    cab.span(2.96, 3.25, y(2.75), y(D.ceiling) + 0.02, -zIn, zIn, CEIL);
    cab.span(3.18, 3.26, y(D.glassHead.h) + 0.03, y(2.78), -zIn, zIn, LINING);
    P.blanketRoll(jump, P.place(3.1, y(D.glassHead.h) + 0.03, -0.55), 0.6, PAL.red);
    P.blanketRoll(jump, P.place(3.1, y(D.glassHead.h) + 0.03, -0.12, 0, 0.8), 0.32, PAL.blue);
    P.books(jump, P.place(3.08, y(D.glassHead.h) + 0.03, 0.28, Math.PI), 6);
    P.lantern(jump, P.place(3.08, y(D.glassHead.h) + 0.03, 0.7));
    // the centre mirror and its stalk (the visors are posed)
    cab.box(3.14, y(2.36), 0, 0.03, 0.08, 0.28, DARK);
    cab.bar(3.15, y(2.4), 0, 3.17, y(2.48), 0, 0.02, DARK);
    // dash top: a plant, an open map, the radio buddy turned toward the driver, a nodding figure
    P.plant(cab, P.place(3.05, y(dsh.h), 0.62, 0, 1.3));
    P.openMap(jump, P.place(2.85, y(dsh.h), 0.3, 0.2), 0.4, 0.3);
    P.bobble(jump, P.place(3.18, y(dsh.h), -0.2));
    P.mug(jump, P.place(2.62, y(dsh.h), 0.55), PAL.teal);
  }

  // ------------------------------------------------------------------ steering wheel, column, instruments
  const wheelC = new THREE.Vector3(2.28, y(1.42), eye.z);
  const tilt = 1.1; // the wheel's axis 63° above horizontal: a bus wheel, big and flat
  const steeringWheel = buildSteering(root, wheelC, { tilt, radius: 0.22, grip: 0.032, rim: 0x2f3338, hub: DASH, spokes: 'bus', cabin: true, marker: 0xe8dec4 });
  dashKit.bar(wheelC.x + 0.04 * Math.cos(tilt), wheelC.y - 0.04 * Math.sin(tilt), eye.z, wheelC.x + 0.42 * Math.cos(tilt), wheelC.y - 0.42 * Math.sin(tilt), eye.z, 0.05, DARK);
  // the instrument hood: over the far side of the wheel, its dials clear of the rim
  const clusterPos = new THREE.Vector3(2.535, y(1.545), eye.z);
  {
    const zc = eye.z;
    dashKit.span(2.55, 2.64, y(D.dash.h) - 0.01, y(1.625), zc - 0.17, zc + 0.17, DASH);
    dashKit.span(2.5, 2.64, y(1.625), y(1.645), zc - 0.18, zc + 0.18, DASH);
    dashKit.span(2.5, 2.56, y(1.46), y(1.645), zc - 0.18, zc - 0.165, DASH);
    dashKit.span(2.5, 2.56, y(1.46), y(1.645), zc + 0.165, zc + 0.18, DASH);
    dashKit.span(2.548, 2.552, y(1.465), y(1.625), zc - 0.165, zc + 0.165, 0x23262b); // dark face behind the dials
  }
  const { dialGlow, speedNeedle, fuelNeedle } = buildCluster(root, clusterPos, 0.3, 0.3);
  // the live strip (rev counter, temperature, battery, lamps, P R N D) left of the hood
  const strip = { x: 2.53, h: 1.54, z: eye.z - 0.37, w: 0.34 };
  dashKit.span(strip.x + 0.002, strip.x + 0.05, y(strip.h - 0.03), y(strip.h + 0.03), strip.z - strip.w / 2 - 0.01, strip.z + strip.w / 2 + 0.01, DASH);
  dashKit.bar(strip.x + 0.04, y(strip.h - 0.025), strip.z, strip.x + 0.06, y(D.dash.h), strip.z, 0.03, DASH);

  // ------------------------------------------------------------------ things to operate (their meaning is in controls.ts)
  const cp = new CabParts(y);
  const DRIVER: Reach[] = ['driver'];
  const FRONT: Reach[] = ['driver', 'passenger'];
  {
    const x0 = D.dash.x0;
    cp.key(cab, new THREE.Vector3(x0 - 0.005, y(1.16), -0.02), new THREE.Vector3(-1, 0, 0), DRIVER);
    // the bus shifter on the dash face: P up, D down
    cp.stick('selector', new THREE.Vector3(x0, y(1.05), -0.2), new THREE.Vector3(2.3, y(1.18), -0.18), 0.32, -0.28, DRIVER, PAL.metal);
    // the handbrake on the engine cover, right of the driver's seat
    cp.handbrake(cab, new THREE.Vector3(2.34, y(D.floor + 0.18), -0.3), new THREE.Vector3(2.06, y(D.floor + 0.28), -0.3), DRIVER);
    cp.knob('lights', new THREE.Vector3(x0 - 0.005, y(1.16), -0.86), DRIVER, 4);
    cp.knob('wipers', new THREE.Vector3(x0 - 0.005, y(1.16), -0.95), DRIVER, 4);
    cp.button('hazard', new THREE.Vector3(x0 - 0.005, y(1.18), 0.14), FRONT, PAL.red);
    cp.point('horn', wheelC.x, wheelC.y, wheelC.z, 0.07, DRIVER);
    cp.radioBuddy(cab, P.place(2.7, y(D.dash.h), 0.04, Math.PI - Math.atan2(0.54, 0.8)), FRONT);
    cp.lid('glovebox', new THREE.Vector3(x0 - 0.004, y(0.995), 0.44), new THREE.Vector3(x0, y(1.135), 0.86), ['passenger'], PAL.woodDark);
    for (const [id, sd, from] of [['visorL', -1, DRIVER], ['visorR', 1, ['passenger'] as Reach[]]] as [string, number, Reach[]][]) cp.visor(id, cab, 3.21, y(2.445), sd * 0.2, sd * 0.88, 0.15, from, 0xd9c8a4);
    // the cabin lamps: the pendant over the table for the room, a switch under the brow shelf for the front seats
    cp.point('cabinLamp', -0.13, y(2.47), 0.68, 0.12, ['seated', 'onboard']);
    cab.span(2.9, 2.94, y(2.42), y(2.46), -0.06, 0.06, DASH);
    cab.span(2.895, 2.9, y(2.425), y(2.455), -0.03, 0.03, ACCENT);
    cp.point('cabinLamp@front', 2.895, y(2.44), 0.0, 0.05, FRONT);
  }

  // ------------------------------------------------------------------ seats in the cab
  const seatH = 1.07 - D.cabFloor;
  const seatX = 1.84;
  const seatZ = 0.55;
  P.armchair(cab, P.place(seatX, y(D.cabFloor), -seatZ), { seatH, width: 0.48 });
  const passengerSeat = new THREE.Group();
  passengerSeat.position.set(seatX, y(D.cabFloor), seatZ);
  const passengerB = new ModelBuilder();
  P.armchair(passengerB, P.place(0, 0, 0), { seatH, width: 0.48 });
  P.pillow(passengerB, P.place(-0.1, seatH - 0.01, 0.0, 0.3), 0.1, 0.18, 0.28, PAL.orange);

  // ------------------------------------------------------------------ the room: fixed furniture
  const LEFT = -Math.PI / 2; // a prop on the left wall facing the aisle
  const RIGHT = Math.PI / 2;
  const fl = y(D.floor);
  // dinette benches (the table between them is the map slot)
  const bench = (x0: number, x1: number, backAtFront: boolean): void => {
    const z0 = 0.3;
    room.span(x0, x1, fl, y(1.16), z0, zIn, PAL.wood);
    room.span(x0 + 0.02, x1 - 0.02, fl, fl + 0.07, z0 - 0.005, z0 + 0.02, PAL.woodDark);
    room.hull(cushionPts(x0 + 0.01, x1 - 0.01, y(1.16), y(1.26), z0 + 0.01, zIn - 0.01, 0.03), BENCH);
    const bx0 = backAtFront ? x1 - 0.1 : x0;
    const bx1 = backAtFront ? x1 : x0 + 0.1;
    room.span(bx0, bx1, y(1.16), y(1.82), z0, zIn, PAL.wood);
    const cx0 = backAtFront ? x1 - 0.17 : x0 + 0.1;
    const cx1 = backAtFront ? x1 - 0.1 : x0 + 0.17;
    room.hull(cushionPts(cx0, cx1, y(1.28), y(1.76), z0 + 0.03, zIn - 0.02, 0.025), PAL.tealSoft);
  };
  bench(0.12, 0.58, true);
  bench(-0.85, -0.39, false);
  P.pillow(room, P.place(-0.62, y(1.26), 0.92, 0.3), 0.16, 0.12, 0.2, PAL.orange);
  // the sofa across the back, under the rear window
  {
    const x0 = D.xRear + 0.06;
    const x1 = -2.55;
    const z0 = -0.12;
    room.span(x0, x1, fl, y(1.16), z0, zIn, PAL.wood);
    room.span(x1 - 0.02, x1, fl, fl + 0.08, z0 + 0.02, zIn - 0.02, PAL.woodDark);
    room.hull(cushionPts(x0 + 0.12, x1 - 0.01, y(1.16), y(1.3), z0 + 0.1, zIn - 0.01, 0.035), SOFA);
    room.hull(cushionPts(x0, x0 + 0.16, y(1.16), y(1.78), z0 + 0.08, zIn - 0.01, 0.04), SOFA);
    room.span(x0, x1, y(1.16), y(1.46), z0, z0 + 0.08, PAL.wood); // the arm on the aisle side
    room.hull(cushionPts(x0, x1, y(1.46), y(1.5), z0 - 0.01, z0 + 0.09, 0.015), PAL.woodDark);
    P.pillow(room, P.place(-3.02, y(1.3), 0.15, 0.4), 0.14, 0.26, 0.3, PAL.red);
    P.pillow(room, P.place(-3.02, y(1.3), 0.82, -0.3), 0.14, 0.24, 0.28, PAL.cream);
    room.span(x0 + 0.2, x1 - 0.05, y(1.3), y(1.33), 0.38, 0.62, PAL.blue); // a blanket folded on the seat
    room.span(x0 + 0.2, x1 - 0.05, y(1.33), y(1.335), 0.44, 0.46, PAL.paper);
  }
  // upper cabinets over the galley and the work bench
  P.wallCabinet(room, P.place(-0.42, y(2.36), -zIn + 0.17, LEFT), 1.76, 0.32, 0.3);
  room.span(-1.3, 0.47, y(2.66), y(D.ceiling), -zIn, -0.72, LINING);
  P.wallCabinet(room, P.place(-1.12, y(2.36), -zIn + 0.17, LEFT), 0.36, 0.32, 0.3);
  // a shelf with jars over the fridge, under the slanted ceiling
  room.span(0.86, 1.44, y(2.3), y(2.33), -zIn, -0.78, PAL.wood);
  for (let i = 0; i < 4; i++) room.cyl(0.95 + i * 0.13, y(2.33) + 0.07, -0.92, 0.045, 0.14, [PAL.mustard, PAL.red, PAL.green, PAL.sky][i], { segments: 8 });
  // the overhead cabinet on the right over storage / board is part of the storage slot; a hook rail by the door
  roomCut.span(1.44, 1.47, y(1.7), y(2.3), 0.66, 0.98, PAL.wood);
  for (let i = 0; i < 3; i++) roomCut.bar(1.44, y(2.15), 0.71 + i * 0.1, 1.38, y(2.18), 0.71 + i * 0.1, 0.015, PAL.steel);
  roomCut.box(1.4, y(1.98), 0.81, 0.05, 0.32, 0.14, PAL.terracotta); // a jacket on a hook
  roomCut.box(1.4, y(2.12), 0.92, 0.07, 0.1, 0.12, PAL.mustard, { rx: 0.3 }); // a hat
  // the rug down the aisle
  P.rug(room, P.place(-0.3, fl, -0.07), 1.9, 0.56, PAL.red, PAL.paper);
  P.rug(room, P.place(-2.15, fl, 0.17, 0), 0.6, 0.5, PAL.blue, PAL.cream);
  // curtains at the room's windows, gathered at both sides, and their rods
  const hangCurtains = (b: ModelBuilder, w: Win, side: number): void => {
    const zc = side * (zIn - 0.005);
    const ry = side < 0 ? LEFT : RIGHT;
    const drop = w.h1 - w.h0 + 0.12;
    for (const [x, wd] of [[w.x0 - 0.04, 0.12], [w.x1 + 0.04, 0.12]] as [number, number][]) P.curtain(b, P.place(x, y(w.h1 + 0.06), zc, ry), wd, drop, CURTAIN, CURTAIN_TIE);
    b.span(w.x0 - 0.14, w.x1 + 0.14, y(w.h1 + 0.06) - 0.01, y(w.h1 + 0.06) + 0.01, side * (zIn - 0.035), side * (zIn - 0.015), PAL.woodDark);
    // a wooden sill inside
    b.span(w.x0 - 0.03, w.x1 + 0.03, y(w.h0) - 0.02, y(w.h0), side * (zIn - 0.05), side * zIn, PAL.wood);
  };
  hangCurtains(room, D.windowsLeft.kitchen, -1);
  hangCurtains(room, D.windowsLeft.workbench, -1);
  hangCurtains(room, D.windowsLeft.bunkLow, -1);
  hangCurtains(room, D.windowsLeft.bunkHigh, -1);
  hangCurtains(roomCut, D.windowsRight.dinette, 1);
  hangCurtains(roomCut, D.windowsRight.hobby, 1);
  {
    // the back window: two curtains and a sill with a plant
    const rw = D.rearWindow;
    const xc = D.xRear + 0.065;
    for (const z of [rw.x0 - 0.05, rw.x1 + 0.05]) P.curtain(room, P.place(xc, y(rw.h1 + 0.06), z, 0), 0.14, rw.h1 - rw.h0 + 0.12, CURTAIN, CURTAIN_TIE);
    room.span(xc, xc + 0.03, y(rw.h1 + 0.06) - 0.01, y(rw.h1 + 0.06) + 0.01, rw.x0 - 0.16, rw.x1 + 0.16, PAL.woodDark);
    P.plant(room, P.place(xc + 0.08, y(1.78), 0.62, 0, 1.1));
  }
  // the door: inner trim round the opening
  roomCut.span(D.door.x0 - 0.04, D.door.x0, fl, y(D.door.top + 0.04), zIn - 0.02, zIn, PAL.wood);
  roomCut.span(D.door.x1, D.door.x1 + 0.04, fl, y(D.door.top + 0.04), zIn - 0.02, zIn, PAL.wood);
  roomCut.span(D.door.x0 - 0.04, D.door.x1 + 0.04, y(D.door.top), y(D.door.top + 0.04), zIn - 0.02, zIn, PAL.wood);
  roomCut.bar(D.door.x1 + 0.02, y(1.3), zIn - 0.05, D.door.x1 + 0.02, y(1.9), zIn - 0.05, 0.025, PAL.steel); // grab handle

  // window trims inside, every window
  for (const [wins, side, b] of [[leftFixed, -1, room], [rightWins, 1, roomCut]] as [Win[], number, ModelBuilder][]) {
    for (const w of wins) b.prism('xy', winOutline(grow(w, 0.03), 0.09), [winOutline(w)], side * zIn, side * (zIn - 0.012), PAL.woodLight);
  }
  // the curtain rail between the cab and the room
  roomCut.span(1.49, 1.51, y(2.745), y(D.ceiling), -zIn, zIn, PAL.steel);

  // ------------------------------------------------------------------ slots
  const slots: VehicleSlot[] = [];
  const slot = (id: string, kind: string, label: string, installed: boolean, empty: (b: ModelBuilder) => void, built: (b: ModelBuilder) => void, isCut = false): void => {
    const e = new ModelBuilder();
    const bb = new ModelBuilder();
    empty(e);
    built(bb);
    slots.push(makeSlot(id, kind, label, e, bb, installed, isCut));
  };
  const counterH = 0.9;
  const counterD = 0.6;
  const galleyZ = -zIn + counterD / 2;
  slot('fridge', 'cooler', '冰箱', false,
    (b) => P.slotFrame(b, P.place(1.15, fl, -zIn + 0.28, LEFT), 'cooler', 0.56, 0.56, 1.22),
    (b) => P.fridge(b, P.place(1.15, fl, -zIn + 0.29, LEFT), 0.56, 0.56, 1.22));
  slot('water', 'water', '水槽', true,
    (b) => P.slotFrame(b, P.place(0.525, fl, galleyZ, LEFT), 'water', counterD, 0.64, counterH),
    (b) => P.sinkUnit(b, P.place(0.525, fl, galleyZ, LEFT), 0.65, counterD, counterH));
  slot('stove', 'stove', '灶台', true,
    (b) => P.slotFrame(b, P.place(-0.125, fl, galleyZ, LEFT), 'stove', counterD, 0.64, counterH),
    (b) => P.stoveUnit(b, P.place(-0.125, fl, galleyZ, LEFT), 0.65, counterD, counterH));
  slot('workbench', 'workbench', '工作台', false,
    (b) => P.slotFrame(b, P.place(-0.875, fl, -zIn + 0.27, LEFT), 'workbench', 0.54, 0.84, 0.82),
    (b) => {
      const x = -0.875;
      const z0 = -zIn;
      const z1 = -zIn + 0.55;
      b.span(-1.29, -0.46, y(1.58), y(1.63), z0, z1, PAL.woodDark);
      for (const xx of [-1.26, -0.49]) b.span(xx - 0.025, xx + 0.025, fl, y(1.58), z1 - 0.06, z1 - 0.01, PAL.woodDark);
      b.span(-1.29, -0.46, y(0.95), y(0.98), z0, z1 - 0.02, PAL.wood);
      P.crate(b, P.place(-1.05, y(0.98), z0 + 0.22, LEFT), 0.3, 0.22, 0.36, PAL.sky);
      P.jerrycan(b, P.place(-0.65, fl, z0 + 0.2, LEFT), PAL.green);
      P.vise(b, P.place(-0.58, y(1.63), z1 - 0.08, LEFT));
      P.toolBoard(b, P.place(x, y(1.66), z0 + 0.0, LEFT), 0.8, 0.3);
      b.box(-1.1, y(1.63) + 0.04, z0 + 0.3, 0.2, 0.08, 0.12, PAL.red); // a toolbox
      b.box(-0.85, y(1.63) + 0.01, z0 + 0.35, 0.18, 0.02, 0.1, PAL.woodLight); // a plank
    });
  slot('bunks', 'bed', '上下铺', true,
    (b) => P.slotFrame(b, P.place(-2.2, fl, -zIn + 0.38, LEFT), 'bed', 0.76, 1.85, 1.2),
    (b) => {
      const x0 = D.xRear + 0.07;
      const x1 = -1.3;
      const z0 = -zIn;
      const z1 = -0.29;
      // lower bunk on a base of drawers
      b.span(x0, x1, fl, y(1.12), z0, z1, PAL.wood);
      for (let i = 0; i < 3; i++) {
        const dx0 = x0 + 0.08 + i * ((x1 - x0 - 0.1) / 3);
        const dx1 = dx0 + (x1 - x0 - 0.1) / 3 - 0.06;
        b.span(dx0, dx1, y(0.86), y(1.07), z1, z1 + 0.012, PAL.tealSoft);
        b.box((dx0 + dx1) / 2, y(1.0), z1 + 0.02, 0.1, 0.02, 0.02, PAL.steel);
      }
      b.hull(cushionPts(x0 + 0.02, x1 - 0.02, y(1.12), y(1.24), z0 + 0.02, z1 - 0.02, 0.03), PAL.cream);
      b.span(x0 + 0.02, x1 - 0.5, y(1.24), y(1.27), z0 + 0.03, z1 - 0.01, PAL.blue); // blanket
      b.span(x1 - 0.55, x1 - 0.5, y(1.27), y(1.275), z0 + 0.03, z1 - 0.01, PAL.paper);
      P.pillow(b, P.place(x1 - 0.2, y(1.24), (z0 + z1) / 2, 0), 0.24, 0.09, 0.46, PAL.paper);
      // upper bunk on four posts, with a rail
      b.span(x0, x1, y(1.86), y(1.92), z0, z1, PAL.wood);
      b.hull(cushionPts(x0 + 0.02, x1 - 0.02, y(1.92), y(2.04), z0 + 0.02, z1 - 0.02, 0.03), PAL.cream);
      b.span(x0 + 0.02, x1 - 0.55, y(2.04), y(2.07), z0 + 0.03, z1 - 0.01, PAL.red);
      b.span(x1 - 0.6, x1 - 0.55, y(2.07), y(2.075), z0 + 0.03, z1 - 0.01, PAL.paper);
      P.pillow(b, P.place(x1 - 0.2, y(2.04), (z0 + z1) / 2, 0), 0.24, 0.09, 0.46, PAL.cream);
      for (const x of [x0 + 0.03, x1 - 0.03]) b.span(x - 0.03, x + 0.03, y(1.12), y(2.3), z1 - 0.06, z1, PAL.woodDark);
      b.span(x0 + 0.03, x1 - 0.45, y(2.16), y(2.2), z1 - 0.05, z1 - 0.01, PAL.woodDark);
      // the little ladder up, at the head end
      for (const z of [z1 - 0.005]) {
        b.span(x1 - 0.42, x1 - 0.39, y(D.floor), y(2.0), z - 0.02, z + 0.02, PAL.woodDark);
        b.span(x1 - 0.12, x1 - 0.09, y(D.floor), y(2.0), z - 0.02, z + 0.02, PAL.woodDark);
        for (let i = 1; i <= 4; i++) b.span(x1 - 0.39, x1 - 0.12, y(D.floor + i * 0.24), y(D.floor + i * 0.24) + 0.025, z - 0.015, z + 0.015, PAL.woodDark);
      }
      // bunk curtains drawn back to the foot end, a reading lamp, a book
      P.curtain(b, P.place(x0 + 0.2, y(1.84), z1 - 0.03, RIGHT + Math.PI), 0.3, 0.55, PAL.plum, PAL.cream);
      P.curtain(b, P.place(x0 + 0.2, y(2.62), z1 - 0.03, RIGHT + Math.PI), 0.3, 0.5, PAL.plum, PAL.cream);
      b.span(x0, x1, y(1.84) - 0.008, y(1.84) + 0.008, z1 - 0.04, z1 - 0.02, PAL.steel);
      b.span(x0, x1, y(2.62) - 0.008, y(2.62) + 0.008, z1 - 0.04, z1 - 0.02, PAL.steel);
      b.box(x1 - 0.7, y(1.29), (z0 + z1) / 2 + 0.1, 0.16, 0.03, 0.12, PAL.mustard, { ry: 0.4 });
    });
  slot('map', 'map', '地图桌', true,
    (b) => P.slotFrame(b, P.place(-0.13, fl, zIn - 0.34, RIGHT), 'map', 0.68, 0.4, 0.72),
    (b) => {
      const z0 = 0.36;
      const z1 = zIn - 0.02;
      b.cyl(-0.13, y(1.15), 0.72, 0.035, 0.7, PAL.steel, { segments: 8 });
      b.cyl(-0.13, fl + 0.01, 0.72, 0.15, 0.02, PAL.steel, { segments: 10 });
      b.span(-0.34, 0.08, y(1.47), y(1.51), z0, z1, PAL.wood);
      b.span(-0.34, 0.08, y(1.47) - 0.02, y(1.47), z1 - 0.04, z1, PAL.woodDark);
      P.openMap(b, P.place(-0.13, y(1.51), 0.66, -0.15), 0.36, 0.5);
      b.cyl(0.0, y(1.51) + 0.01, 0.45, 0.04, 0.02, PAL.steel, { segments: 10 }); // a compass
      b.cyl(0.0, y(1.51) + 0.021, 0.45, 0.03, 0.004, PAL.paper, { segments: 10 });
      P.mug(b, P.place(-0.27, y(1.51), 0.86), PAL.mustard);
      P.mug(b, P.place(0.02, y(1.51), 0.9, 1.2), PAL.cream);
      P.lantern(b, P.place(-0.28, y(1.51), 0.48));
    });
  slot('storage', 'storage', '储物柜', true,
    (b) => P.slotFrame(b, P.place(-1.225, fl, zIn - 0.21, RIGHT), 'storage', 0.42, 0.7, 0.86),
    (b) => {
      P.cabinet(b, P.place(-1.225, fl, zIn - 0.21, RIGHT), 0.7, 0.42, 0.86, { doors: 2, door: PAL.tealSoft });
      P.wallCabinet(b, P.place(-1.225, y(2.36), zIn - 0.15, RIGHT), 0.7, 0.3, 0.3, { door: PAL.cream });
      P.books(b, P.place(-1.35, y(1.66), zIn - 0.12, RIGHT), 7);
      P.plant(b, P.place(-1.0, y(1.66), zIn - 0.18, 0, 1.0));
    });
  slot('board', 'board', '软木板', false,
    (b) => P.slotFrame(b, P.place(-1.225, y(1.76), zIn - 0.02, RIGHT), 'board', 0.04, 0.6, 0.52, { wall: true, card: 0.26 }),
    (b) => P.corkboard(b, P.place(-1.225, y(1.76), zIn - 0.02, RIGHT), 0.6, 0.52));
  slot('hobby', 'hobby', '爱好角', false,
    (b) => P.slotFrame(b, P.place(-2.05, fl, zIn - 0.22, RIGHT), 'hobby', 0.44, 0.8, 1.15),
    (b) => {
      P.guitar(b, P.place(-1.7, fl + 0.015, zIn - 0.12, RIGHT));
      P.easel(b, P.place(-2.2, fl + 0.015, zIn - 0.25, RIGHT - 0.5));
      P.stool(b, P.place(-1.95, fl + 0.015, 0.78), 0.48);
      b.span(-2.4, -1.85, y(2.34), y(2.37), zIn - 0.18, zIn, PAL.wood); // a shelf of music and paints
      P.books(b, P.place(-2.25, y(2.37), zIn - 0.09, RIGHT), 4);
      for (let i = 0; i < 3; i++) b.cyl(-1.98 + i * 0.05, y(2.37) + 0.05, zIn - 0.08, 0.018, 0.1, [PAL.red, PAL.sky, PAL.mustard][i], { segments: 6 });
    });
  // the roof: rack at the front, solar in the middle, a deck at the back; the back: spare wheel and cans
  const roofY = y(D.roof);
  slot('roofRack', 'roof', '行李架', false,
    (b) => P.slotPad(b, P.place(2.2, roofY, 0, 0), 'roof', 1.25, 1.5),
    (b) => {
      for (const s of [-1, 1]) {
        b.span(1.55, 2.85, roofY + 0.12, roofY + 0.15, s * 0.74, s * 0.78, DARK);
        for (const x of [1.6, 2.2, 2.8]) b.span(x - 0.02, x + 0.02, roofY, roofY + 0.15, s * 0.74, s * 0.78, DARK);
      }
      for (const x of [1.7, 2.1, 2.5]) b.span(x - 0.02, x + 0.02, roofY + 0.04, roofY + 0.07, -0.76, 0.76, DARK);
      P.crate(b, P.place(1.9, roofY + 0.07, -0.35), 0.5, 0.32, 0.5, PAL.woodLight);
      P.crate(b, P.place(1.9, roofY + 0.39, -0.35, 0.2), 0.35, 0.22, 0.36, PAL.sky);
      P.blanketRoll(b, P.place(2.55, roofY + 0.07, 0.15), 1.2, PAL.green);
      P.jerrycan(b, P.place(2.3, roofY + 0.07, 0.45, Math.PI / 2), PAL.red);
      b.bar(1.7, roofY + 0.44, -0.6, 1.7, roofY + 0.1, -0.78, 0.015, PAL.orange); // straps
      b.bar(2.1, roofY + 0.44, -0.1, 2.1, roofY + 0.1, 0.0, 0.015, PAL.orange);
    }, true);
  slot('roofSolar', 'roof', '太阳能板', false,
    (b) => {
      P.slotPad(b, P.place(0.97, roofY, 0, 0), 'roof', 0.85, 1.4);
      P.slotPad(b, P.place(-0.85, roofY, 0, 0), 'roof', 0.85, 1.4);
    },
    (b) => {
      P.solarPanel(b, P.place(0.97, roofY, 0, 0), 0.85, 1.4);
      P.solarPanel(b, P.place(-0.85, roofY, 0, 0), 0.85, 1.4);
      b.bar(0.55, roofY + 0.05, 0.6, -0.4, roofY + 0.05, 0.62, 0.02, DARK);
    }, true);
  slot('roofDeck', 'roof', '车顶露台', false,
    (b) => P.slotPad(b, P.place(-2.3, roofY, 0, 0), 'roof', 1.7, 1.6),
    (b) => {
      const x0 = -3.12;
      const x1 = -1.45;
      b.span(x0, x1, roofY, roofY + 0.04, -0.82, 0.82, PAL.wood);
      for (let i = 0; i < 9; i++) b.span(x0 + 0.04 + i * 0.185, x0 + 0.05 + i * 0.185, roofY + 0.04, roofY + 0.044, -0.8, 0.8, PAL.woodDark);
      // a low rail, open where the ladder comes up
      const post = (x: number, z: number): void => {
        b.span(x - 0.02, x + 0.02, roofY + 0.04, roofY + 0.5, z - 0.02, z + 0.02, DARK);
      };
      for (const x of [x0, -2.55, -2.0, x1]) {
        post(x, -0.82);
        post(x, 0.82);
      }
      post(x0, -0.3);
      post(x0, 0.3);
      post(x1, 0.0);
      b.span(x0, x1, roofY + 0.48, roofY + 0.52, -0.84, -0.8, DARK);
      b.span(x0, x1, roofY + 0.48, roofY + 0.52, 0.8, 0.84, DARK);
      b.span(x0 - 0.02, x0 + 0.02, roofY + 0.48, roofY + 0.52, -0.82, 0.3, DARK);
      b.span(x1 - 0.02, x1 + 0.02, roofY + 0.48, roofY + 0.52, -0.82, 0.82, DARK);
      P.lounger(b, P.place(-2.45, roofY + 0.04, -0.42, 0), PAL.orange);
      P.lounger(b, P.place(-2.45, roofY + 0.04, 0.42, 0), PAL.teal);
      b.cyl(-1.75, roofY + 0.3, 0, 0.16, 0.03, PAL.wood, { segments: 10 });
      b.cyl(-1.75, roofY + 0.17, 0, 0.025, 0.26, DARK, { segments: 6 });
      P.mug(b, P.place(-1.72, roofY + 0.315, 0.06), PAL.red);
      P.plant(b, P.place(-1.8, roofY + 0.315, -0.07, 0, 0.9));
      // a string of lights along the rail
      for (let i = 0; i < 7; i++) b.sphere(x0 + 0.15 + i * 0.24, roofY + 0.46 - (i % 2) * 0.03, -0.82, 0.02, [PAL.mustard, PAL.red, PAL.cream][i % 3], 0);
    }, true);
  slot('rear', 'rear', '车尾架', false,
    (b) => P.slotFrame(b, P.place(D.xRear - 0.005, y(0.68), -0.2, Math.PI), 'rear', 0.04, 0.9, 0.72, { wall: true, card: 0.36 }),
    (b) => {
      const xr = D.xRear;
      b.span(xr - 0.08, xr, y(0.66), y(0.7), -0.85, 0.42, DARK);
      b.span(xr - 0.08, xr, y(1.38), y(1.42), -0.85, 0.42, DARK);
      for (const z of [-0.85, 0.0, 0.42]) b.span(xr - 0.08, xr, y(0.66), y(1.42), z - 0.02, z + 0.02, DARK);
      P.spareWheel(b, P.place(xr - 0.2, y(1.04), -0.42, Math.PI), 0.36);
      P.jerrycan(b, P.place(xr - 0.12, y(0.7), 0.11, -Math.PI / 2), PAL.red);
      P.jerrycan(b, P.place(xr - 0.12, y(0.7), 0.29, -Math.PI / 2), 0x6f7d5b);
      b.span(xr - 0.22, xr - 0.08, y(0.95), y(0.98), -0.06, 0.4, PAL.orange); // strap
    });

  // ------------------------------------------------------------------ outside: mirrors, ladder, awning roller, lived-in things
  for (const s of [-1, 1]) {
    const m = D.mirror;
    const tgt = shell;
    tgt.bar(m.x - 0.05, y(m.h + 0.2), s * (W - 0.02), m.x, y(m.h + 0.16), s * m.z, 0.03, DARK);
    tgt.bar(m.x - 0.05, y(m.h - 0.22), s * (W - 0.02), m.x, y(m.h - 0.16), s * m.z, 0.03, DARK);
    tgt.span(m.x, m.x + 0.05, y(m.h - m.tall / 2), y(m.h + m.tall / 2), s * m.z - m.wide / 2, s * m.z + m.wide / 2, DARK);
  }
  {
    // ladder up the back (above the roof it goes with the cutaway)
    const l = D.ladder;
    const xl = D.xRear - 0.1;
    for (const z of [l.z0, l.z1]) {
      shell.span(xl - 0.02, xl + 0.02, y(0.66), y(D.roof - 0.12), z - 0.02, z + 0.02, CHROME);
      shell.span(xl, D.xRear, y(0.8), y(0.84), z - 0.015, z + 0.015, CHROME);
      shell.span(xl, D.xRear, y(2.3), y(2.34), z - 0.015, z + 0.015, CHROME);
      shellCut.bar(xl, y(D.roof - 0.12), z, xl, y(l.top), z, 0.04, CHROME);
      shellCut.bar(xl, y(l.top), z, xl + 0.2, y(l.top), z, 0.04, CHROME);
      shellCut.bar(xl + 0.2, y(l.top), z, xl + 0.24, y(D.roof - 0.02), z, 0.04, CHROME);
    }
    for (let i = 0; i < 9; i++) shell.span(xl - 0.015, xl + 0.015, y(0.8 + i * 0.24), y(0.8 + i * 0.24) + 0.03, l.z0, l.z1, CHROME);
    // a towel over a rung, a bucket tied on, a folding chair hung on the ladder
    shell.span(xl - 0.05, xl - 0.015, y(2.1), y(2.34), l.z0 + 0.03, l.z1 - 0.03, PAL.red);
    shell.span(xl - 0.055, xl - 0.05, y(2.12), y(2.16), l.z0 + 0.03, l.z1 - 0.03, PAL.paper);
    P.bucket(shell, P.place(xl - 0.17, y(0.94), (l.z0 + l.z1) / 2), PAL.sky);
    shell.bar(xl - 0.17, y(1.2), (l.z0 + l.z1) / 2, xl, y(1.28), l.z0 + 0.02, 0.01, PAL.rope);
    P.foldedChair(shell, P.place(xl - 0.06, y(1.75), (l.z0 + l.z1) / 2, Math.PI), PAL.teal);
  }
  {
    // awning roller and its brackets on the right, a flower box and a lantern by the door
    const a = D.awning;
    shellCut.cyl((a.x0 + a.x1) / 2, y(a.h), W + 0.07, 0.065, a.x1 - a.x0, CREAM, { rz: Math.PI / 2, segments: 10 });
    shellCut.cyl(a.x0 - 0.01, y(a.h), W + 0.07, 0.07, 0.03, DARK, { rz: Math.PI / 2, segments: 10 });
    shellCut.cyl(a.x1 + 0.01, y(a.h), W + 0.07, 0.07, 0.03, DARK, { rz: Math.PI / 2, segments: 10 });
    for (const x of [a.x0 + 0.05, a.x1 - 0.05]) shellCut.span(x - 0.03, x + 0.03, y(a.h) - 0.08, y(a.h) + 0.04, W, W + 0.07, DARK);
    P.flowerBox(shellCut, P.place(-0.14, y(1.4), W, RIGHT + Math.PI), 1.0);
    shellCut.bar(D.door.x1 + 0.08, y(2.2), W, D.door.x1 + 0.08, y(2.2), W + 0.12, 0.015, DARK);
    P.lantern(shellCut, P.place(D.door.x1 + 0.08, y(2.0), W + 0.12));
    // stickers on the right: a mountain and a wave
    shellCut.hull([[0.0, y(1.75), W + 0.004], [0.0, y(1.75), W + 0.01], [-0.1, y(1.75), W + 0.004], [-0.05, y(1.85), W + 0.007]], PAL.sky);
    shellCut.box(-2.7, y(1.85), W + 0.005, 0.2, 0.12, 0.006, PAL.mustard, { rz: -0.1 });
  }

  // ------------------------------------------------------------------ meshes
  const vm = vehicleMaterials();
  const cabMat = surfaceMaterial({ vertexColors: true, flat: true, ink: true, cabin: true });
  cabMat.uniforms.uCabinLamp = { value: new THREE.Color(0, 0, 0) };
  const hullGeo = hull.build();
  const hullCutGeo = hullCut.build();
  const hullBox = hullGeo.boundingBox!.clone().union(hullCutGeo.boundingBox!);
  shell.add(hullGeo);
  shellCut.add(hullCutGeo);
  // every mesh that something moves in is a PoseMesh: the doors, the awning, the seat, the curtain, the levers ride in them
  const posedMeshes: PoseMesh[] = [];
  const posed = (b: ModelBuilder, mat: THREE.Material, name: string, parent: THREE.Object3D, parts: PosedPart[] = []): PoseMesh => {
    const pm = new PoseMesh(b.build(), parts, mat, name);
    parent.add(pm.mesh);
    posedMeshes.push(pm);
    return pm;
  };
  const bodyPM = posed(shell, vm.body, 'body', root);
  const bodyCutPM = posed(shellCut, vm.body, 'body:cut', cut);
  const roomPM = posed(room, vm.cabin, 'room', root);
  const roomCutPM = posed(roomCut, vm.cabin, 'room:cut', cut);
  const cabPM = posed(cab, cabMat, 'cab', root, cp.room);
  const body = bodyPM.mesh;
  const bodyCut = bodyCutPM.mesh;
  const roomMesh = roomPM.mesh;
  const roomCutMesh = roomCutPM.mesh;
  const cabMesh = cabPM.mesh;
  const cluster = new THREE.Group();
  cluster.name = 'cluster';
  root.add(cluster);
  posed(dashKit, cabMat, 'cluster:hood', cluster, cp.hood);
  // the dials belong to the cluster too (for the driver's view checks)
  for (const o of [...root.children]) if ((o as THREE.Group).isGroup && o !== cut && o.children.some((c) => (c as THREE.Mesh).material === dialGlow)) cluster.attach(o);
  const dashPanel = new DashPanel(cluster, { pos: new THREE.Vector3(strip.x - 0.002, y(strip.h), strip.z), tiltBack: 0.3, width: strip.w, redline: spec.engine.redline });
  const jumpers = new THREE.Group();
  jumpers.name = 'jumpers';
  const jumpMesh = new THREE.Mesh(jump.build(), cabMat);
  jumpMesh.name = 'jumpers';
  jumpers.add(jumpMesh);
  root.add(jumpers);

  const slotMesh = new SlotMesh(slots, vm.cabin);
  /** panes that move: the driver's door window, the passenger's window */
  const glassLeft: PosedPart[] = [];
  const glassRight: PosedPart[] = [];
  root.add(slotMesh.mesh);

  // glass: what stays, what goes with the cutaway (both in mid wall, between skin and lining)
  const pane = (w: Win, z: number): number[] => sidePane(w.x0, w.x1, y(w.h0), y(w.h1), z);
  const sk = D.skylight;
  const lidA = 26 * DEG;
  const lx1 = sk.x1 - Math.cos(lidA) * (sk.x1 - sk.x0);
  const ly1 = y(D.roof) + 0.07 + Math.sin(lidA) * (sk.x1 - sk.x0);
  const rw = D.rearWindow;
  const glassPM = new PoseMesh(paneGeometry([...leftFixed.map((w) => pane(w, -zSkin)), [D.xRear + 0.015, y(rw.h0), rw.x0, D.xRear + 0.015, y(rw.h0), rw.x1, D.xRear + 0.015, y(rw.h1), rw.x1, D.xRear + 0.015, y(rw.h1), rw.x0]]), glassLeft, glassMaterial(0xbfd6dc, 0.14), 'glass');
  glassPM.mesh.renderOrder = 9;
  root.add(glassPM.mesh);
  posedMeshes.push(glassPM);
  const glassCutPM = new PoseMesh(paneGeometry([...rightWins.filter((w) => w !== D.windowsRight.passenger).map((w) => pane(w, zSkin)), [sk.x1, y(D.roof) + 0.07, sk.z0, sk.x1, y(D.roof) + 0.07, sk.z1, lx1, ly1, sk.z1, lx1, ly1, sk.z0]]), glassRight, glassMaterial(0xbfd6dc, 0.14), 'glass:cut');
  glassCutPM.mesh.renderOrder = 9;
  cut.add(glassCutPM.mesh);
  posedMeshes.push(glassCutPM);

  const { windscreen, wipers } = buildScreen(
    root,
    [D.glassFoot.x, y(D.glassFoot.h), -D.glassHalf, D.glassFoot.x, y(D.glassFoot.h), D.glassHalf, D.glassHead.x, y(D.glassHead.h), D.glassHalf, D.glassHead.x, y(D.glassHead.h), -D.glassHalf],
    [-0.66, 0.16],
    0.64,
  );
  const m = D.mirror;
  const mirrorYaw = 1.27;
  buildMirrors(root, [
    [m.x - 0.003, y(m.h), -m.z, m.wide - 0.03, m.tall - 0.04, -mirrorYaw],
    [m.x - 0.003, y(m.h), m.z, m.wide - 0.03, m.tall - 0.04, -(Math.PI - mirrorYaw)],
    [3.124, y(2.36), 0, 0.25, 0.065, -Math.PI / 2],
  ]);
  const { headlights, taillights } = buildLamps(
    root,
    [new THREE.Vector3(D.xFront + 0.02, y(D.headlamp.h), -D.headlamp.z), new THREE.Vector3(D.xFront + 0.02, y(D.headlamp.h), D.headlamp.z)],
    [new THREE.Vector3(D.xRear - 0.01, y(D.taillamp.h), -D.taillamp.z), new THREE.Vector3(D.xRear - 0.01, y(D.taillamp.h), D.taillamp.z)],
    D.headlamp.r,
    [D.taillamp.tall, D.taillamp.wide],
  );
  // lamp shades under the ceiling: a pendant over the table (on its cord), two domes over the aisle
  const lampB = new ModelBuilder();
  lampB.cyl(-0.13, y(2.47), 0.68, 0.13, 0.13, 0xf3e6c4, { segments: 12, radiusTop: 0.05 });
  lampB.bar(-0.13, y(2.53), 0.68, -0.13, y(D.ceiling), 0.68, 0.012, 0xf3e6c4);
  lampB.cyl(0.5, y(2.755), -0.1, 0.1, 0.05, 0xf3e6c4, { segments: 12, radiusTop: 0.07 });
  lampB.cyl(-1.95, y(2.755), 0.15, 0.1, 0.05, 0xf3e6c4, { segments: 12, radiusTop: 0.07 });
  const lampMesh = new THREE.Mesh(lampB.build(), vm.lamps);
  lampMesh.name = 'lamps';
  cut.add(lampMesh);

  const charm = buildCharm(root, new THREE.Vector3(3.13, y(2.32), 0.07), PAL.red);
  const wheels = buildWheels(root, spec, { width: 0.25, tyre: RUBBER, hub: CREAM, cap: CHROME, dish: true, hubR: 0.6, capR: 0.22 });

  // ------------------------------------------------------------------ movers
  const movers: VehicleParts['movers'] = {};
  const mover = (name: string, label: string): void => {
    movers[name] = {
      label,
      set: (t) => {
        const k = clamp01(t);
        for (const pm of posedMeshes) pm.set(name, k);
      },
    };
  };
  {
    // the entry door, hinged at its back edge, opens outward 100°
    const dz = D.door;
    const outB = new ModelBuilder();
    const inB = new ModelBuilder();
    const L = dz.x1 - dz.x0 - 0.01;
    const dw = D.doorWindow;
    const win: Outline = roundRect(dw.x0 - dz.x0, dw.x1 - dz.x0, y(dw.h0), y(dw.h1), 0.06);
    const doorOutline: Outline = [[0.005, y(D.bottom)], [L, y(D.bottom)], [L, y(dz.top) - 0.005], [0.005, y(dz.top) - 0.005]];
    outB.prism('xy', doorOutline, [win], -D.skin, 0, CREAM);
    outB.prism('xy', win, [], -D.skin, -0.012, 0xdfe6e2); // frosted pane
    outB.span(0.005, L, y(D.bottom), y(D.skirt), 0, 0.004, DARK);
    outB.span(0.005, L, y(D.skirt), y(D.grime), 0, 0.004, GRIME);
    const xo = dz.x0;
    // the belt on the door (band() draws on the wall at z = W; the door's own frame has its skin at z = 0)
    const beltB = new ModelBuilder();
    band(beltB, 0.005, L, (x) => beltBottom(x + xo), (x) => beltTop(x + xo), 1, TEAL);
    band(beltB, 0.005, L, (x) => beltBottom(x + xo) - D.belt.gap - D.belt.line, (x) => beltBottom(x + xo) - D.belt.gap, 1, ORANGE);
    outB.add(beltB.build().applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, -W)));
    outB.prism('xy', roundRect(dw.x0 - dz.x0 - 0.03, dw.x1 - dz.x0 + 0.03, y(dw.h0 - 0.03), y(dw.h1 + 0.03), 0.08), [win], 0, 0.012, DARK);
    outB.box(L - 0.1, y(1.5), 0.02, 0.05, 0.12, 0.03, ACCENT);
    outB.cyl(0.4, y(1.68), 0.006, 0.07, 0.008, PAL.red, { rx: Math.PI / 2, segments: 10 }); // a sticker
    inB.prism('xy', [[0.005, y(D.floor - 0.2)], [L, y(D.floor - 0.2)], [L, y(dz.top) - 0.005], [0.005, y(dz.top) - 0.005]], [win], -D.skin - D.lining, -D.skin, LINING);
    inB.prism('xy', roundRect(dw.x0 - dz.x0 - 0.03, dw.x1 - dz.x0 + 0.03, y(dw.h0 - 0.03), y(dw.h1 + 0.03), 0.08), [win], -D.skin - D.lining - 0.012, -D.skin - D.lining, PAL.woodLight);
    inB.box(L - 0.1, y(1.5), -D.skin - D.lining - 0.02, 0.04, 0.1, 0.03, ACCENT);
    inB.span(0.1, L - 0.1, y(0.9), y(1.3), -D.skin - D.lining - 0.012, -D.skin - D.lining, PAL.tealSoft); // a panel
    inB.box(0.25, y(1.6), -D.skin - D.lining - 0.012, 0.012, 0.012, 0.012, PAL.steel); // a hook
    const place = new THREE.Matrix4().makeTranslation(dz.x0, 0, W);
    const doorPose = (t: number): THREE.Matrix4 => turnAbout(dz.x0, 0, W, new THREE.Vector3(0, 1, 0), -100 * DEG * t);
    bodyCutPM.add({ mover: 'door', geo: outB.build().applyMatrix4(place), pose: doorPose });
    roomCutPM.add({ mover: 'door', geo: inB.build().applyMatrix4(place), pose: doorPose });
    mover('door', '车门');
    cp.point('door@out', dz.x0 + L - 0.1, y(1.5), W + 0.04, 0.08, ['outside']);
    cp.point('door', dz.x0 + L - 0.1, y(1.5), zIn - 0.05, 0.08, ['onboard']);
  }
  {
    // the awning: unrolls from the roller into a sloping striped cloth on two poles
    const a = D.awning;
    const ab = new ModelBuilder();
    const n = 8;
    for (let i = 0; i < n; i++) {
      const x0 = a.x0 + ((a.x1 - a.x0) * i) / n;
      const x1 = a.x0 + ((a.x1 - a.x0) * (i + 1)) / n;
      const sec = (x: number): number[][] => [[x, 0, 0], [x, -a.drop * 0.55, a.reach * 0.5], [x, -a.drop, a.reach]];
      ab.loft([sec(x0), sec(x1)], i % 2 ? CREAM : TEAL);
    }
    for (let i = 0; i < 16; i++) {
      const x = a.x0 + ((a.x1 - a.x0) * (i + 0.5)) / 16;
      ab.box(x, -a.drop - 0.06, a.reach, (a.x1 - a.x0) / 16 - 0.01, 0.12, 0.012, i % 2 ? TEAL : CREAM);
    }
    for (const x of [a.x0 + 0.04, a.x1 - 0.04]) ab.span(x - 0.02, x + 0.02, -y(a.h) - cg, -a.drop, a.reach - 0.02, a.reach + 0.02, DARK);
    ab.span(a.x0, a.x1, -a.drop - 0.02, -a.drop + 0.02, a.reach - 0.02, a.reach + 0.02, DARK);
    const at = new THREE.Vector3(0, y(a.h), W + 0.07);
    bodyCutPM.add({
      mover: 'awning',
      geo: ab.build().applyMatrix4(new THREE.Matrix4().makeTranslation(at.x, at.y, at.z)),
      pose: (t) => (t <= 0.01 ? null : new THREE.Matrix4().makeTranslation(at.x, at.y, at.z).multiply(new THREE.Matrix4().makeScale(1, 1, t)).multiply(new THREE.Matrix4().makeTranslation(-at.x, -at.y, -at.z))),
    });
    mover('awning', '遮阳棚');
    cp.point('awning@out', a.x0 - 0.02, y(a.h), W + 0.07, 0.1, ['outside']);
  }
  {
    // the passenger seat turns round to face the room
    const at = new THREE.Vector3(seatX, y(D.cabFloor), seatZ);
    cabPM.add({ mover: 'passengerSeat', geo: passengerB.build().applyMatrix4(new THREE.Matrix4().makeTranslation(at.x, at.y, at.z)), pose: (t) => turnAbout(at.x, 0, at.z, new THREE.Vector3(0, 1, 0), Math.PI * t) });
    mover('passengerSeat', '副驾转椅');
  }
  {
    // the curtain between the cab and the room, gathered at the left wall when open
    const at = new THREE.Vector3(1.47, y(2.74), -zIn);
    const cb = new ModelBuilder();
    const folds = 24;
    const drop = 2.74 - 0.9;
    for (let i = 0; i < folds; i++) cb.box((i % 2) * 0.02, -drop / 2, (i + 0.5) / folds, 0.025, drop, 1 / folds + 0.004, i % 6 === 0 ? PAL.cream : CURTAIN);
    roomCutPM.add({
      mover: 'curtain',
      geo: cb.build().applyMatrix4(new THREE.Matrix4().makeTranslation(at.x, at.y, at.z)),
      pose: (t) => new THREE.Matrix4().makeTranslation(at.x, at.y, at.z).multiply(new THREE.Matrix4().makeScale(1, 1, 0.16 + (2 * zIn - 0.16) * t)).multiply(new THREE.Matrix4().makeTranslation(-at.x, -at.y, -at.z)),
    });
    mover('curtain', '布帘');
  }
  {
    // the driver's door: hinged at the front, its window winds down (part of the way: the door is short below it)
    const dw = D.windowsLeft.driver;
    const W_DROP = dw.h0 - dd.bottom - 0.05;
    const hinge = (t: number): THREE.Matrix4 => turnAbout(dd.x1, 0, -W, new THREE.Vector3(0, 1, 0), -70 * DEG * clamp01(t));
    const outline: Outline = [[dd.x0 + 0.006, y(dd.bottom) + 0.006], [dd.x1 - 0.004, y(dd.bottom) + 0.006], [dd.x1 - 0.004, y(dd.top) - 0.006], [dd.x0 + 0.006, y(dd.top) - 0.006]];
    const hole = winOutline(dw);
    const out = new ModelBuilder();
    out.prism('xy', outline, [hole], -W, -zSkin, CREAM);
    band(out, dd.x0 + 0.006, dd.x1 - 0.004, beltBottom, beltTop, -1, TEAL);
    band(out, dd.x0 + 0.006, dd.x1 - 0.004, (x) => beltBottom(x) - D.belt.gap - D.belt.line, (x) => beltBottom(x) - D.belt.gap, -1, ORANGE);
    out.prism('xy', winOutline(grow(dw, 0.035), 0.1), [hole], -W, -(W + 0.014), DARK);
    out.box(dd.x0 + 0.12, y(1.62), -(W + 0.02), 0.16, 0.03, 0.03, ACCENT);
    bodyPM.add({ mover: 'doorL', geo: out.build(), pose: hinge });
    const inn = new ModelBuilder();
    inn.prism('xy', outline, [hole], -zSkin, -zIn, LINING);
    inn.prism('xy', winOutline(grow(dw, 0.03), 0.09), [hole], -zIn, -(zIn - 0.012), PAL.woodLight);
    inn.span(dd.x0 + 0.05, dd.x1 - 0.05, y(dd.bottom + 0.04), y(1.4), -(zIn - 0.012), -zIn, PAL.tealSoft);
    inn.box(dd.x0 + 0.14, y(1.36), -(zIn - 0.035), 0.12, 0.025, 0.03, ACCENT); // the pull
    roomPM.add({ mover: 'doorL', geo: inn.build(), pose: hinge });
    const crankAt = new THREE.Vector3(dd.x0 + 0.45, y(1.3), -(zIn - 0.02));
    const crank = new ModelBuilder();
    crank.cyl(crankAt.x, crankAt.y, crankAt.z, 0.022, 0.03, DARK, { rx: Math.PI / 2, segments: 8 });
    crank.bar(crankAt.x, crankAt.y, crankAt.z + 0.02, crankAt.x + 0.08, crankAt.y, crankAt.z + 0.02, 0.018, PAL.steel);
    crank.cyl(crankAt.x + 0.08, crankAt.y, crankAt.z + 0.045, 0.014, 0.04, ACCENT, { rx: Math.PI / 2, segments: 8 });
    roomPM.add({ mover: 'windowL', follows: ['doorL'], geo: crank.build(), pose: (t, all) => hinge(all.doorL ?? 0).multiply(turnAbout(crankAt.x, crankAt.y, crankAt.z, new THREE.Vector3(0, 0, 1), Math.PI * 3 * clamp01(t))) });
    glassLeft.push({ mover: 'windowL', follows: ['doorL'], geo: paneGeometry([sidePane(dw.x0, dw.x1, y(dw.h0), y(dw.h1), -(zSkin - 0.012))]), pose: (t, all) => hinge(all.doorL ?? 0).multiply(new THREE.Matrix4().makeTranslation(0, -W_DROP * clamp01(t), 0)) });
    mover('doorL', '车门');
    mover('windowL', '车窗');
    cp.point('doorL', dd.x0 + 0.14, y(1.36), -(zIn - 0.05), 0.07, DRIVER);
    cp.point('doorL@out', dd.x0 + 0.12, y(1.62), -(W + 0.03), 0.08, ['outside']);
    cp.point('windowL', crankAt.x + 0.04, crankAt.y, crankAt.z + 0.03, 0.06, DRIVER);
    // the passenger's window winds down into the right wall
    const pw = D.windowsRight.passenger;
    const pCrank = new THREE.Vector3(2.0, y(1.3), zIn - 0.02);
    const pc = new ModelBuilder();
    pc.cyl(pCrank.x, pCrank.y, pCrank.z, 0.022, 0.03, DARK, { rx: Math.PI / 2, segments: 8 });
    pc.bar(pCrank.x, pCrank.y, pCrank.z - 0.02, pCrank.x + 0.08, pCrank.y, pCrank.z - 0.02, 0.018, PAL.steel);
    pc.cyl(pCrank.x + 0.08, pCrank.y, pCrank.z - 0.045, 0.014, 0.04, ACCENT, { rx: Math.PI / 2, segments: 8 });
    roomCutPM.add({ mover: 'windowR', geo: pc.build(), pose: (t) => turnAbout(pCrank.x, pCrank.y, pCrank.z, new THREE.Vector3(0, 0, 1), -Math.PI * 3 * t) });
    glassRight.push({ mover: 'windowR', geo: paneGeometry([sidePane(pw.x0, pw.x1, y(pw.h0), y(pw.h1), zSkin - 0.012)]), pose: (t) => new THREE.Matrix4().makeTranslation(0, -0.4 * t, 0) });
    mover('windowR', '车窗');
    cp.point('windowR', pCrank.x + 0.04, pCrank.y, pCrank.z - 0.03, 0.06, ['passenger']);
    // the stop cord along the ceiling over the dinette (5.7): pull it and whoever drives stops
    roomCut.span(-1.2, 1.4, y(2.7) - 0.006, y(2.7) + 0.006, 0.93, 0.945, PAL.rope);
  }
  {
    const h = new ModelBuilder();
    h.bar(0.3, y(2.7), 0.937, 0.3, y(2.52), 0.937, 0.008, PAL.rope);
    h.cyl(0.3, y(2.5), 0.937, 0.025, 0.06, ACCENT, { segments: 8 });
    roomCutPM.add({ mover: 'ctl:stopCord', geo: h.build(), pose: (t) => new THREE.Matrix4().makeTranslation(0, -0.06 * t, 0) });
    cp.point('stopCord', 0.3, y(2.5), 0.937, 0.07, ['seated', 'onboard']);
  }
  // the cab's operable parts that ride in the cab and the cluster meshes
  for (const [m, label] of cp.movers) mover(m, label);
  // the panes added to the glass after it was built
  glassPM.rebuild();
  glassCutPM.rebuild();
  mover('ctl:stopCord', '停车绳');
  // the service hatch over the grille, hinged at its top: the motorhome's bonnet
  bodyPM.add({ mover: 'bonnet', geo: hatchGeo!, pose: (t) => turnAbout(D.xFront, y(1.1), 0, new THREE.Vector3(0, 0, 1), 70 * DEG * t) });
  mover('bonnet', '检修盖');
  cp.point('bonnet@out', D.xFront + 0.03, y(0.82), 0, 0.12, ['outside']);

  // ------------------------------------------------------------------ seats, viewpoints, where one can walk
  const v = (x: number, h: number, z: number, yawDeg: number, pitchDeg: number, label: string, seat: boolean, extra: Partial<VehicleViewpoint> = {}): VehicleViewpoint => ({ x, y: y(h), z, yaw: yawDeg * DEG, pitch: pitchDeg * DEG, label, seat, ...extra });
  const standing = D.floor + 1.62;
  const seatedEye = 1.26 + 0.78;
  const views: Record<string, VehicleViewpoint> = {
    passenger: { x: eye.x, y: eye.y, z: -eye.z, yaw: 0, pitch: -3.7 * DEG, label: '副驾', seat: true, swivel: { mover: 'passengerSeat', x: seatX, z: seatZ } },
    dinette1: v(0.33, seatedEye, 0.48, 180, -6, '卡座（前，过道）', true),
    dinette2: v(0.33, seatedEye, 0.84, 180, -6, '卡座（前，窗边）', true),
    dinette3: v(-0.6, seatedEye, 0.48, 0, -6, '卡座（后，过道）', true),
    dinette4: v(-0.6, seatedEye, 0.84, 0, -6, '卡座（后，窗边）', true),
    sofa: v(-2.82, 1.3 + 0.75, 0.45, 0, -5, '车尾沙发', true),
    bunkLow: v(-1.6, 1.46, -0.66, 180, 3, '下铺', true, { needs: 'bunks' }),
    bunkHigh: v(-1.6, 2.24, -0.66, 180, 3, '上铺', true, { needs: 'bunks' }),
    deck1: v(-2.62, D.roof + 0.95, -0.42, 0, -4, '露台躺椅（左）', true, { needs: 'roofDeck' }),
    deck2: v(-2.62, D.roof + 0.95, 0.42, 0, -4, '露台躺椅（右）', true, { needs: 'roofDeck' }),
    roomFront: v(1.05, standing, -0.08, 180, -12, '车厢（前，向后看）', false),
    roomRear: v(-2.3, standing, 0.08, 0, -9, '车厢（后，向前看）', false),
    galley: v(-0.25, standing, 0.18, -62, -30, '厨房', false),
    overDash: v(2.15, D.floor + 1.45, 0.0, 0, -7, '中脊上方', false),
  };
  const fy = y(D.floor);
  const areas: WalkRect[] = [
    { x0: -1.28, x1: 0.86, z0: -0.39, z1: 0.28, floor: fy, name: 'aisle' },
    { x0: -2.48, x1: -1.28, z0: -0.25, z1: 0.56, floor: fy, name: 'aisle' },
    { x0: 0.62, x1: 1.42, z0: -0.39, z1: 0.72, floor: fy, name: 'door' },
    { x0: 1.42, x1: 2.3, z0: -0.2, z1: 0.2, floor: fy, name: 'passage' },
  ];

  return {
    root,
    wheels,
    steeringWheel,
    speedNeedle,
    fuelNeedle,
    charm,
    wipers,
    windscreen,
    headlights,
    taillights,
    dialGlow,
    cabinLamps: vm.lamps,
    cabMaterials: [cabMat, steeringMaterial(steeringWheel)].filter((x): x is THREE.ShaderMaterial => !!x),
    cluster,
    views,
    slots,
    slotMesh,
    movers,
    walk: { headroom: D.ceiling - D.floor, areas },
    cut,
    casters: [body, bodyCut, roomMesh, roomCutMesh, cabMesh, slotMesh.mesh],
    controls: cp.controls,
    dashPanel,
    jumpers,
    glovebox: { x: D.dash.x0 - 0.06, y: y(1.0), z: 0.65, hx: 0.05, h: 0.06, hz: 0.2 },
    bay: { engine: { x: D.xFront - 0.42, y: y(1.05), z: 0 }, cooling: { x: D.xFront - 0.22, y: y(1.08), z: 0 }, battery: { x: D.xFront - 0.35, y: y(0.93), z: 0.41 }, heater: { x: D.xFront - 0.35, y: y(0.9), z: -0.41 } },
    hubs: new WheelHubs(root, spec, vm.body),
    body,
    hull: hullBox,
    beam: { x: D.xFront + 0.05, y: y(D.headlamp.h) },
    footprint: { length: 7.2, width: 2.7 },
    chase: { dist: 10.5, height: 3.4, look: 1.1 },
    enclosed: 1,
  };
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

/** the wheel's own material: it should see the cab's share of the lamp */
function steeringMaterial(g: THREE.Group): THREE.ShaderMaterial | null {
  const m = g.children[0] as THREE.Mesh | undefined;
  if (!m) return null;
  const mat = m.material as THREE.ShaderMaterial;
  // its own lamp colour, not the shared one
  mat.uniforms.uCabinLamp = { value: new THREE.Color(0, 0, 0) };
  return mat;
}

/** a box with bevelled top edges, as hull points */
function cushionPts(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, bev: number): number[][] {
  return [
    [x0, y0, z0], [x1, y0, z0], [x0, y0, z1], [x1, y0, z1],
    [x0 + bev, y1, z0 + bev], [x1 - bev, y1, z0 + bev], [x0 + bev, y1, z1 - bev], [x1 - bev, y1, z1 - bev],
    [x0, y1 - bev, z0], [x1, y1 - bev, z0], [x0, y1 - bev, z1], [x1, y1 - bev, z1],
  ];
}
