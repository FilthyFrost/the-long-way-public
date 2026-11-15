/**
 * T1 — the van 「面包」: a rounded, flat-nosed (forward-control) microbus, the first vehicle with a
 * roof and a room behind the seats. Spec: specs/vehicles/van_offroad_models.md (§1–§2).
 * Model space = vehicle body frame: +x forward, +y up, +z right, origin at the centre of gravity
 * (0.70 m above the ground).
 *
 * Every exterior measure lives in DIM (heights above the ground, h); the building code only refers
 * to it. Meshes: body / body:cut (painted shell; the tailgate and the sliding door ride in them as
 * posed parts), room / room:cut (the inside, lit by the cabin lamp; the bench and the curtains ride
 * in them), slots (every fixture in one mesh), glass / glass:cut (the panes of the tailgate and the
 * door ride along), windscreen, mirrors, lamps, cab instruments, the nodding figure, four wheels.
 * Nobody walks in a van: seats and viewpoints only.
 */
import * as THREE from 'three';
import type { VehicleSpec } from '../../core/vehicle/spec';
import { glassMaterial } from '../render/materials';
import { ModelBuilder, type Outline } from './builder';
import { buildCluster, buildLamps, buildMirrors, buildScreen, buildSteering, buildWheels, makeSlot, paneGeometry, PoseMesh, sidePane, SlotMesh, turnAbout, vehicleMaterials, WheelHubs, type ControlPoint, type PosedPart, type Reach, type VehicleParts, type VehicleSlot, type VehicleViewpoint } from './kit';
import { ACCENT, CabParts } from './cabkit';
import { DashPanel } from './dash';
import * as P from './props';
import { archPts, at, band, clamp01, cornerArc, cornerSolid, cushionPts, grow, roofSection, roundRect, type Win } from './shape';

const PAL = P.PAL;

/** all exterior measures (m). x along the body, z across (+ = right), h = height above the ground */
export const DIM = {
  /** body ends (the rounded box) and the small bumpers */
  xRear: -2.12,
  xFront: 2.1,
  bumperFront: 2.18,
  bumperRear: -2.18,
  /** half width of the body; skin and lining thickness */
  halfW: 0.85,
  skin: 0.025,
  lining: 0.025,
  /** radius of the vertical corners (round nose, round back) */
  cornerFront: 0.15,
  cornerRear: 0.16,
  /** bottom edge of the body (ground clearance) */
  bottom: 0.32,
  /** the darker waist line between the mustard below and the cream above */
  waist: { lo: 1.02, hi: 1.08 },
  /** where the walls turn into the rounded roof, the top of the roof, half width of its flat top */
  shoulder: 1.7,
  roof: 1.95,
  roofFlat: 0.6,
  /** inside: the floor, the flat ceiling, the engine deck at the back (x0 … x1, its top) */
  floor: 0.42,
  ceiling: 1.89,
  deck: { x0: -2.08, x1: -1.45, h: 0.95 },
  /** windscreen: foot and head of the glass (x, h) and its half width */
  glassFoot: { x: 2.07, h: 1.12 },
  glassHead: { x: 1.93, h: 1.86 },
  glassHalf: 0.71,
  /** the brow over the windscreen, back to front: [x, half width, roof top, shoulder height] */
  brow: [
    [1.7, 0.85, 1.95, 1.7],
    [1.8, 0.835, 1.945, 1.72],
    [1.88, 0.8, 1.925, 1.76],
    [1.945, 0.73, 1.89, 1.8],
  ] as [number, number, number, number][],
  /** a shallow shelf of a dash under the glass: from x0 to the glass, its top */
  dash: { x0: 1.8, h: 1.08 },
  /** wheel arches: radius and height of the arc's centre */
  arch: { r: 0.42, centre: 0.37 },
  /** round head lamps on the nose */
  headlamp: { h: 0.82, z: 0.48, r: 0.095 },
  /** tall tail lamps on the back */
  taillamp: { h: 0.8, z: 0.6, tall: 0.22, wide: 0.08 },
  /** front doors (seams only), the sliding door on the right (opens) */
  frontDoor: { x0: 0.78, x1: 1.58, bottom: 0.84, top: 1.68 },
  /** a little front quarter window ahead of the cab door, its front edge follows the pillar */
  quarter: { x0: 1.63, h0: 1.16, h1: 1.62 },
  slideDoor: { x0: -0.58, x1: 0.47, bottom: 0.5, top: 1.66 },
  /** how far the sliding door travels back */
  slideTravel: 1.0,
  doorWindow: { x0: -0.47, x1: 0.36, h0: 1.18, h1: 1.58 },
  windowsLeft: {
    cab: { x0: 0.86, x1: 1.52, h0: 1.16, h1: 1.64 },
    middle: { x0: -0.55, x1: 0.62, h0: 1.18, h1: 1.62 },
    rear: { x0: -1.84, x1: -0.74, h0: 1.18, h1: 1.62 },
  } as Record<string, Win>,
  windowsRight: {
    cab: { x0: 0.86, x1: 1.52, h0: 1.16, h1: 1.64 },
    rear: { x0: -1.84, x1: -0.74, h0: 1.18, h1: 1.62 },
  } as Record<string, Win>,
  /** the tailgate: opening across the back (z0 … z1 here), its hinge height, how far it lifts */
  tailgate: { z: 0.56, h0: 0.97, h1: 1.76, hinge: 1.78, open: 100 },
  tailWindow: { z: 0.47, h0: 1.24, h1: 1.68 },
  /** square mirrors on short stalks */
  mirror: { x: 1.8, h: 1.42, z: 1.0, tall: 0.17, wide: 0.13 },
} as const;

// paint
const MUSTARD = 0xd6a446;
const CREAM = 0xf0e6cc;
const WAIST = 0x9a6a33;
const DARK = 0x393d45;
const CHROME = 0xb9c0c4;
const RUBBER = 0x2b2e33;
const SIGNAL = 0xe39a3b;
const MUD = 0x9a7b55;
// inside
const LINING = 0xece0c2;
const CEIL = 0xfff3d8;
const PANEL = PAL.woodLight;
const FLOOR = 0x6a7471;
const SEAT = 0xc0623f;
const SEAT_STRIPE = 0xe9d9b4;
const DASHTOP = 0x4b4f55;
const CURTAIN = 0x6f9f8f;
const CURTAIN_TIE = PAL.cream;

const DEG = Math.PI / 180;
const LEFT = -Math.PI / 2; // a prop on the left wall facing the aisle
const RIGHT = Math.PI / 2;
const ZAXIS = new THREE.Vector3(0, 0, 1);
const YAXIS = new THREE.Vector3(0, 1, 0);

export function buildVan(spec: VehicleSpec): VehicleParts {
  const D = DIM;
  const cg = spec.cgHeight;
  const y = (h: number): number => h - cg;
  const root = new THREE.Group();
  root.name = spec.id;
  const cut = new THREE.Group();
  cut.name = 'cut';
  root.add(cut);

  const W = D.halfW;
  const zSkin = W - D.skin;
  const zIn = zSkin - D.lining; // 0.80: the room's walls
  const frontAxle = spec.wheelbase * (1 - spec.weightFront);
  const rearAxle = -spec.wheelbase * spec.weightFront;
  const eye = spec.eye;
  const fl = y(D.floor);

  // builders, one per mesh (posed parts are kept apart and handed to the PoseMeshes)
  const hull = new ModelBuilder();
  const hullCut = new ModelBuilder();
  const shell = new ModelBuilder();
  const shellCut = new ModelBuilder();
  const room = new ModelBuilder();
  const roomCut = new ModelBuilder();
  const dashKit = new ModelBuilder();
  const bodyParts: PosedPart[] = [];
  const bodyCutParts: PosedPart[] = [];
  const roomParts: PosedPart[] = [];
  const roomCutParts: PosedPart[] = [];
  const glassParts: PosedPart[] = [];
  const glassCutParts: PosedPart[] = [];

  // ------------------------------------------------------------------ side walls
  const xSideRear = D.xRear + D.cornerRear;
  const xSideFront = D.xFront - D.cornerFront;
  const zF = W - D.cornerFront;
  const zR = W - D.cornerRear;
  const yArch = y(D.arch.centre);
  /** where the A-pillar's back edge meets a height h (it leans back with the glass) */
  const pillarX = (h: number): number => xSideFront - ((D.glassFoot.x - D.glassHead.x) * (h - D.glassFoot.h)) / (D.glassHead.h - D.glassFoot.h);
  const sideOutline = (door: boolean): Outline => {
    const o: Outline = [[xSideRear, y(D.bottom)]];
    o.push([rearAxle - D.arch.r, y(D.bottom)], ...archPts(rearAxle, D.arch.r, yArch), [rearAxle + D.arch.r, y(D.bottom)]);
    o.push([frontAxle - D.arch.r, y(D.bottom)], ...archPts(frontAxle, D.arch.r, yArch), [frontAxle + D.arch.r, y(D.bottom)]);
    o.push([xSideFront, y(D.bottom)], [xSideFront, y(D.glassFoot.h)], [pillarX(D.shoulder), y(D.shoulder)], [xSideRear, y(D.shoulder)]);
    return o;
  };
  const winOutline = (w: Win, r = 0.07): Outline => roundRect(w.x0, w.x1, y(w.h0), y(w.h1), r);
  const leftWins = Object.values(D.windowsLeft);
  const rightWins = Object.values(D.windowsRight);
  /** the front quarter window: four corners (x, h), its front edge leaning back with the pillar */
  const q = D.quarter;
  const quarterPts = (d = 0): [number, number][] => [[q.x0 - d, q.h0 - d], [pillarX(q.h0) - 0.06 + d, q.h0 - d], [pillarX(q.h1) - 0.06 + d, q.h1 + d], [q.x0 - d, q.h1 + d]];
  const quarterOutline = (d = 0): Outline => quarterPts(d).map(([x, h]) => [x, y(h)]);
  /** the sliding door's opening: a hole above the sill */
  const doorHole: Outline = [[D.slideDoor.x0, y(D.slideDoor.bottom)], [D.slideDoor.x1, y(D.slideDoor.bottom)], [D.slideDoor.x1, y(D.slideDoor.top)], [D.slideDoor.x0, y(D.slideDoor.top)]];
  const fd = D.frontDoor;
  /** the cab door's opening (the door with its window rides in it, posed) */
  const cabDoorHole: Outline = [[fd.x0, y(fd.bottom)], [fd.x1, y(fd.bottom)], [fd.x1, y(fd.top)], [fd.x0, y(fd.top)]];
  const notCab = (wins: Win[]): Win[] => wins.filter((w) => w !== D.windowsLeft.cab && w !== D.windowsRight.cab);
  const holes = (wins: Win[], door = false): Outline[] => [...notCab(wins).map((w) => winOutline(w)), quarterOutline(), cabDoorHole, ...(door ? [doorHole] : [])];
  hull.prism('xy', sideOutline(false), holes(leftWins), -W, -zSkin, CREAM);
  hullCut.prism('xy', sideOutline(true), holes(rightWins, true), zSkin, W, CREAM);

  // the lining inside: floor to shoulder, wood panels below the windows
  const liningOutline = (door: boolean): Outline => {
    const o: Outline = [[D.xRear + 0.05, y(D.floor)]];
    o.push([xSideFront - 0.02, y(D.floor)], [xSideFront - 0.02, y(D.glassFoot.h)], [pillarX(D.shoulder) - 0.03, y(D.shoulder)], [D.xRear + 0.05, y(D.shoulder)]);
    return o;
  };
  room.prism('xy', liningOutline(false), holes(leftWins), -zSkin, -zIn, LINING);
  roomCut.prism('xy', liningOutline(true), holes(rightWins, true), zIn, zSkin, LINING);
  // wood panels under the windows (the room part, behind the cab)
  const panelSpans = (door: boolean): [number, number][] => (door ? [[D.xRear + 0.06, D.slideDoor.x0 - 0.04], [D.slideDoor.x1 + 0.04, 0.72]] : [[D.xRear + 0.06, 0.72]]);
  for (const [x0, x1] of panelSpans(false)) room.span(x0, x1, y(D.floor), y(1.1), -zIn, -zIn + 0.008, PANEL);
  for (const [x0, x1] of panelSpans(true)) roomCut.span(x0, x1, y(D.floor), y(1.1), zIn - 0.008, zIn, PANEL);
  for (const [s, b, door] of [[-1, room, false], [1, roomCut, true]] as [number, ModelBuilder, boolean][]) {
    for (const [x0, x1] of panelSpans(door)) b.span(x0, x1, y(1.1), y(1.125), s * (zIn - 0.03), s * zIn, PAL.wood); // a rail along the top
  }

  // paint: mustard below the waist, the darker waist line, mud by the wheels; arch lips
  const lowerOutline = (x0: number, x1: number): Outline => {
    const o: Outline = [[x0, y(D.bottom)]];
    for (const xa of [rearAxle, frontAxle]) {
      if (xa - D.arch.r > x0 && xa + D.arch.r < x1) o.push([xa - D.arch.r, y(D.bottom)], ...archPts(xa, D.arch.r, yArch), [xa + D.arch.r, y(D.bottom)]);
    }
    o.push([x1, y(D.bottom)], [x1, y(D.waist.lo)], [x0, y(D.waist.lo)]);
    return o;
  };
  const paintSide = (b: ModelBuilder, side: number, door: boolean): void => {
    const z0 = side * W;
    const spans: [number, number][] = door ? [[xSideRear, D.slideDoor.x0], [D.slideDoor.x1, xSideFront]] : [[xSideRear, xSideFront]];
    const fdLow: Outline = [[fd.x0, y(fd.bottom)], [fd.x1, y(fd.bottom)], [fd.x1, y(D.waist.lo)], [fd.x0, y(D.waist.lo)]];
    for (const [x0, x1] of spans) {
      b.prism('xy', lowerOutline(x0, x1), x0 < fd.x0 && x1 > fd.x1 ? [fdLow] : [], z0, z0 + side * 0.004, MUSTARD);
      const bands: [number, number][] = x0 < fd.x0 && x1 > fd.x1 ? [[x0, fd.x0], [fd.x1, x1]] : [[x0, x1]];
      for (const [a, c] of bands) band(b, a, c, () => y(D.waist.lo), () => y(D.waist.hi), z0, side, WAIST, 0.005);
    }
    // arch lips: a dark rim round each arch
    for (const xa of [rearAxle, frontAxle]) {
      const pts = archPts(xa, D.arch.r + 0.02, yArch);
      for (let i = 0; i + 1 < pts.length; i++) b.bar(pts[i][0], pts[i][1], side * (W + 0.008), pts[i + 1][0], pts[i + 1][1], side * (W + 0.008), 0.05, DARK);
    }
    // window frames: a dark rim round each opening
    for (const w of notCab(side < 0 ? leftWins : rightWins)) b.prism('xy', winOutline(grow(w, 0.03), 0.09), [winOutline(w)], z0, z0 + side * 0.012, DARK);
    b.prism('xy', quarterOutline(0.03), [quarterOutline()], z0, z0 + side * 0.012, DARK);
    // the sill under the sliding door's opening keeps the mustard
    if (door) b.span(D.slideDoor.x0, D.slideDoor.x1, y(D.bottom), y(D.slideDoor.bottom), z0, z0 + side * 0.004, MUSTARD);
    // a drip rail where the wall turns into the roof
    b.span(xSideRear, pillarX(D.shoulder), y(D.shoulder) - 0.01, y(D.shoulder) + 0.012, z0, z0 + side * 0.018, DARK);
    // a step under the cab door, mud by the wheels
    b.span(fd.x0 + 0.05, fd.x0 + 0.4, y(0.36), y(0.39), z0, z0 + side * 0.1, DARK);
    for (const xa of [rearAxle, frontAxle]) {
      for (const [dx, dh, s] of [[-0.5, 0.42, 0.04], [-0.56, 0.52, 0.03], [0.48, 0.46, 0.035], [0.55, 0.4, 0.04]] as [number, number, number][]) {
        b.box(xa + dx, y(dh), z0 + side * 0.006, s * 1.4, s, 0.004, MUD, { rz: dx * 0.7 });
      }
    }
  };
  paintSide(shell, -1, false);
  paintSide(shellCut, 1, true);
  // a fuel flap on the left, a sticker of a loaf (the van's name) on each side
  shell.cyl(-1.62, y(0.9), -(W + 0.006), 0.06, 0.012, DARK, { rx: Math.PI / 2, segments: 10 });
  const loaf = (b: ModelBuilder, x: number, h: number, z: number, side: number): void => {
    b.box(x, y(h), z, 0.2, 0.09, 0.006, 0xe0b06a);
    b.cyl(x, y(h + 0.045), z, 0.1, 0.006, 0xe0b06a, { rx: Math.PI / 2, segments: 12 });
    for (const dx of [-0.05, 0.0, 0.05]) b.box(x + dx, y(h + 0.07), z + side * 0.003, 0.012, 0.05, 0.004, 0x9a6a33, { rz: 0.4 });
  };
  loaf(shell, -1.35, 1.32, -(W + 0.004), -1);
  loaf(shellCut, -1.35, 1.32, W + 0.004, 1);

  // ------------------------------------------------------------------ the nose: face, round corners, pillars
  {
    const rf = D.cornerFront;
    const fh = D.glassFoot.h;
    hull.prism('zy', [[-zF, y(D.bottom)], [zF, y(D.bottom)], [zF, y(fh)], [-zF, y(fh)]], [], D.xFront - 0.03, D.xFront, CREAM);
    for (const s of [-1, 1]) {
      hull.hull(cornerSolid(cornerArc(xSideFront, zF, rf, 1, s), y(D.bottom), y(fh)), CREAM);
      // the A-pillar: a round post leaning back with the glass, from the corner up to the brow
      const foot = cornerArc(xSideFront, zF, rf, 1, s).map(([x, z]) => [x, y(fh - 0.005), z]);
      const head = cornerArc(D.glassHead.x - 0.1, zF, 0.1, 1, s).map(([x, z]) => [x, y(D.glassHead.h + 0.06), z]);
      room.bar(xSideFront - 0.03, y(D.glassFoot.h + 0.02), s * (zF + 0.1), pillarX(D.glassHead.h) - 0.05, y(D.glassHead.h - 0.02), s * (zF + 0.07), 0.07, DASHTOP);
      hull.hull([...foot, ...head], CREAM);
      // paint carried round the corner
      shell.hull(cornerSolid(cornerArc(xSideFront, zF, rf + 0.004, 1, s), y(D.bottom), y(D.waist.lo)), MUSTARD);
      shell.hull(cornerSolid(cornerArc(xSideFront, zF, rf + 0.005, 1, s), y(D.waist.lo), y(D.waist.hi)), WAIST);
    }
    const xf = D.xFront + 0.004;
    shell.span(D.xFront, xf, y(D.bottom), y(D.waist.lo), -zF, zF, MUSTARD);
    shell.span(D.xFront, xf + 0.001, y(D.waist.lo), y(D.waist.hi), -zF, zF, WAIST);
    // round lamps in chrome rings, small signals over them
    for (const s of [-1, 1]) {
      shell.cyl(xf + 0.004, y(D.headlamp.h), s * D.headlamp.z, D.headlamp.r + 0.025, 0.02, CHROME, { rz: Math.PI / 2, segments: 16 });
      shell.box(xf + 0.006, y(0.97), s * 0.5, 0.02, 0.05, 0.1, SIGNAL);
    }
    // a vent of three slats under the waist line, a painted loaf in the middle (no maker's badge)
    for (let i = 0; i < 3; i++) shell.span(D.xFront, xf + 0.008, y(0.62 + i * 0.05), y(0.64 + i * 0.05), -0.28, 0.28, DARK);
    shell.box(xf + 0.004, y(0.86), 0, 0.006, 0.1, 0.22, 0xe0b06a);
    shell.cyl(xf + 0.004, y(0.91), 0, 0.11, 0.006, 0xe0b06a, { rz: Math.PI / 2, segments: 12 });
    for (const dz of [-0.06, 0, 0.06]) shell.box(xf + 0.008, y(0.94), dz, 0.004, 0.05, 0.014, WAIST, { rx: 0.4 });
    // small bumper with overriders, a number plate
    hull.span(D.xFront, D.bumperFront, y(0.4), y(0.52), -W + 0.04, W - 0.04, DARK);
    shell.span(D.bumperFront - 0.002, D.bumperFront + 0.006, y(0.47), y(0.49), -W + 0.06, W - 0.06, CHROME);
    for (const s of [-1, 1]) shell.span(D.bumperFront - 0.02, D.bumperFront + 0.02, y(0.36), y(0.6), s * 0.36 - 0.03, s * 0.36 + 0.03, DARK);
    shell.span(D.bumperFront, D.bumperFront + 0.01, y(0.42), y(0.5), -0.2, 0.2, PAL.paper);
    shell.span(D.bumperFront + 0.008, D.bumperFront + 0.012, y(0.445), y(0.475), -0.15, 0.15, DARK);
    // the seal round the glass, the cowl
    shell.span(D.glassFoot.x - 0.02, D.xFront + 0.004, y(D.glassFoot.h) - 0.012, y(D.glassFoot.h) + 0.006, -D.glassHalf - 0.02, D.glassHalf + 0.02, RUBBER);
    shell.bar(D.glassHead.x + 0.012, y(D.glassHead.h + 0.003), -D.glassHalf, D.glassHead.x + 0.012, y(D.glassHead.h + 0.003), D.glassHalf, 0.028, RUBBER);
  }

  // ------------------------------------------------------------------ the back: face, corners, tailgate opening
  const rearSection = (aDeg: number): { x: number; sec: number[][] } => {
    const a = aDeg * DEG;
    const r = D.cornerRear;
    const inset = r * (1 - Math.cos(a));
    return { x: xSideRear - r * Math.sin(a), sec: roofSection(W - inset, y(D.roof - 0.8 * inset), y(D.shoulder), D.roofFlat - inset) };
  };
  const tg = D.tailgate;
  const tgOutline: Outline = roundRect(-tg.z, tg.z, y(tg.h0), y(tg.h1), 0.08);
  const twOutline: Outline = roundRect(-D.tailWindow.z, D.tailWindow.z, y(D.tailWindow.h0), y(D.tailWindow.h1), 0.06);
  {
    const secRear = rearSection(90).sec;
    const outline: Outline = [[-zR, y(D.bottom)], [zR, y(D.bottom)]];
    for (let i = secRear.length - 1; i >= 0; i--) outline.push([secRear[i][0], secRear[i][1]]);
    hull.prism('zy', outline, [tgOutline, roundRect(-0.5, 0.5, y(0.46), y(0.9), 0.05)], D.xRear, D.xRear + 0.03, CREAM);
    for (const s of [-1, 1]) {
      hull.hull(cornerSolid(cornerArc(xSideRear, zR, D.cornerRear, -1, s), y(D.bottom), y(D.shoulder)), CREAM);
      shell.hull(cornerSolid(cornerArc(xSideRear, zR, D.cornerRear + 0.004, -1, s), y(D.bottom), y(D.waist.lo)), MUSTARD);
      shell.hull(cornerSolid(cornerArc(xSideRear, zR, D.cornerRear + 0.005, -1, s), y(D.waist.lo), y(D.waist.hi)), WAIST);
    }
    const xr = D.xRear - 0.004;
    // mustard round the engine lid's opening (the lid carries its own)
    shell.span(xr, D.xRear, y(D.bottom), y(0.46), -zR, zR, MUSTARD);
    shell.span(xr, D.xRear, y(0.46), y(0.9), -zR, -0.5, MUSTARD);
    shell.span(xr, D.xRear, y(0.46), y(0.9), 0.5, zR, MUSTARD);
    shell.span(xr, D.xRear, y(0.9), y(tg.h0 - 0.02), -zR, zR, MUSTARD);
    shell.span(xr, D.xRear, y(tg.h0 - 0.02), y(D.waist.lo), -zR, -tg.z - 0.02, MUSTARD);
    shell.span(xr, D.xRear, y(tg.h0 - 0.02), y(D.waist.lo), tg.z + 0.02, zR, MUSTARD);
    shell.span(xr - 0.001, D.xRear, y(D.waist.lo), y(D.waist.hi), -zR, -tg.z - 0.02, WAIST);
    shell.span(xr - 0.001, D.xRear, y(D.waist.lo), y(D.waist.hi), tg.z + 0.02, zR, WAIST);
    // a dark rim round the opening
    shell.prism('zy', roundRect(-tg.z - 0.025, tg.z + 0.025, y(tg.h0 - 0.025), y(tg.h1 + 0.025), 0.1), [tgOutline], D.xRear - 0.008, D.xRear, DARK);
    // the engine lid: seams, louvres, a handle; the bumper and the plate
    shell.prism('zy', roundRect(-0.5, 0.5, y(0.46), y(0.9), 0.05), [roundRect(-0.488, 0.488, y(0.472), y(0.888), 0.045)], xr - 0.003, xr, DARK);
    // the engine behind the lid, under the deck: block, fan, air filter, battery, a little heater box
    shell.span(-2.06, -1.62, y(0.44), y(0.8), -0.4, 0.3, 0x4a5058);
    shell.span(-2.0, -1.7, y(0.8), y(0.85), -0.32, 0.22, 0x8c3b30);
    shell.cyl(-2.07, y(0.66), -0.05, 0.16, 0.02, DARK, { rz: Math.PI / 2, segments: 12 });
    shell.cyl(-1.8, y(0.84), 0.32, 0.07, 0.1, DARK, { segments: 10 });
    shell.span(-1.98, -1.76, y(0.46), y(0.6), -0.48, -0.36, DARK);
    shell.span(-1.96, -1.78, y(0.6), y(0.61), -0.46, -0.38, PAL.red);
    shell.span(-2.04, -1.9, y(0.72), y(0.82), -0.46, -0.3, 0x6a7471);
    hull.span(D.bumperRear, D.xRear, y(0.38), y(0.48), -W + 0.06, W - 0.06, DARK);
    shell.span(D.bumperRear - 0.006, D.bumperRear, y(0.4), y(0.47), 0.2, 0.52, PAL.paper);
    shell.span(D.bumperRear - 0.009, D.bumperRear - 0.006, y(0.42), y(0.45), 0.25, 0.47, DARK);
    // stickers: a sun and a mountain of our own
    shell.cyl(xr - 0.004, y(0.66), -0.62, 0.05, 0.006, PAL.orange, { rz: Math.PI / 2, segments: 12 });
    shell.hull([[xr - 0.004, y(0.58), 0.62], [xr - 0.004, y(0.58), 0.48], [xr - 0.004, y(0.68), 0.56], [xr - 0.008, y(0.6), 0.56]], PAL.sky);
  }

  // ------------------------------------------------------------------ the rounded roof
  {
    const full = roofSection(W, y(D.roof), y(D.shoulder), D.roofFlat);
    const rearLoft = [90, 60, 30, 0].map((a) => {
      const r = rearSection(a);
      return at(r.x, r.sec);
    });
    hullCut.loft(rearLoft, CREAM);
    hullCut.loft([at(xSideRear, full), at(D.brow[0][0], full)], CREAM);
    const lip = roofSection(D.brow[3][1], y(D.glassHead.h), y(D.glassHead.h), D.brow[3][1] - 0.13);
    const frontLoft = [...D.brow.map(([x, wd, top, sh]) => at(x, roofSection(wd, y(top), y(sh), Math.min(D.roofFlat, wd - 0.2)))), at(D.glassHead.x + 0.005, lip)];
    hullCut.loft(frontLoft, CREAM);
    // the ceiling under it: slanted strips from the walls to the flat ceiling, the flat part, a header over the glass
    const inner = (x: number): number[][] => [[x, y(D.shoulder), -zIn], [x, y(1.82), -0.72], [x, y(D.ceiling), -0.56]];
    const innerR = (x: number): number[][] => inner(x).map(([a, b, c]) => [a, b, -c]).reverse();
    const cx0 = D.xRear + 0.05;
    const cx1 = 1.76;
    roomCut.loft([inner(cx0), inner(cx1)], CEIL);
    roomCut.loft([innerR(cx0), innerR(cx1)], CEIL);
    roomCut.span(cx0, cx1, y(D.ceiling), y(D.ceiling) + 0.015, -0.56, 0.56, CEIL);
    roomCut.span(cx1, D.glassHead.x - 0.01, y(D.glassHead.h) - 0.01, y(D.ceiling) + 0.015, -zIn, zIn, LINING);
    // ribs across the ceiling (old vans show their bows)
    for (const x of [-1.5, -0.6, 0.3]) roomCut.span(x - 0.03, x + 0.03, y(D.ceiling) - 0.012, y(D.ceiling), -0.56, 0.56, PAL.woodLight);
    // the back wall's lining above the deck, with the tailgate opening
    const o: Outline = [[-zIn, y(D.deck.h)], [zIn, y(D.deck.h)], [zIn, y(D.shoulder)], [0.72, y(1.82)], [0.56, y(D.ceiling)], [-0.56, y(D.ceiling)], [-0.72, y(1.82)], [-zIn, y(D.shoulder)]];
    room.prism('zy', o, [tgOutline], D.xRear + 0.03, D.xRear + 0.05, LINING);
    room.prism('zy', roundRect(-tg.z - 0.03, tg.z + 0.03, y(tg.h0 - 0.03), y(tg.h1 + 0.03), 0.1), [tgOutline], D.xRear + 0.05, D.xRear + 0.062, PAL.woodLight);
    // a gutter over the tailgate and two drip rails on the roof
    shellCut.span(D.xRear - 0.03, D.xRear, y(tg.hinge + 0.03), y(tg.hinge + 0.05), -tg.z - 0.05, tg.z + 0.05, DARK);
  }

  // ------------------------------------------------------------------ inside: floor, wheel boxes, deck
  {
    const fx0 = frontAxle - 0.44;
    const fx1 = frontAxle + 0.44;
    const rx1 = rearAxle + 0.42;
    const outline: Outline = [
      [D.deck.x1, -zIn], [rx1, -zIn], [rx1, -0.56], [rx1, -0.56], [fx0, -0.56], [fx0, -zIn], [fx0, -zIn],
      [fx0, -zIn], [fx0, -0.56], [fx1, -0.56], [fx1, -zIn], [2.0, -zIn],
      [2.0, zIn], [fx1, zIn], [fx1, 0.56], [fx0, 0.56], [fx0, zIn], [rx1, zIn], [rx1, 0.56], [D.deck.x1, 0.56],
    ];
    // simpler: a floor plate between the housings, and strips beside them
    room.span(D.deck.x1, 2.0, fl - 0.04, fl, -0.56, 0.56, FLOOR);
    for (const s of [-1, 1]) {
      room.span(rx1, fx0, fl - 0.04, fl, s * 0.56, s * zIn, FLOOR);
      room.span(fx1, 2.0, fl - 0.04, fl, s * 0.56, s * zIn, FLOOR);
    }
    void outline;
    // the front wheel housings: a lid and walls, open underneath
    for (const s of [-1, 1]) {
      room.span(fx0, fx1, fl, y(0.79), s * 0.53, s * 0.55, PAL.dark);
      room.span(fx0, fx1, y(0.77), y(0.79), s * 0.55, s * zIn, PAL.dark);
      room.span(fx0 - 0.02, fx0, fl, y(0.79), s * 0.53, s * zIn, PAL.dark);
      room.span(fx1, fx1 + 0.02, fl, y(0.79), s * 0.53, s * zIn, PAL.dark);
      // the rear ones poke out in front of the bench base
      room.span(D.deck.x1, rx1, fl, y(0.73), s * 0.53, s * 0.55, PAL.woodDark);
      room.span(D.deck.x1, rx1, y(0.71), y(0.73), s * 0.55, s * zIn, PAL.woodDark);
      room.span(rx1, rx1 + 0.02, fl, y(0.73), s * 0.53, s * zIn, PAL.woodDark);
    }
    // the engine deck: a carpeted top, a wooden riser with a grille
    const dk = D.deck;
    room.span(dk.x0, dk.x1, y(dk.h) - 0.04, y(dk.h), -zIn, zIn, 0x8d6f5a);
    room.span(dk.x1 - 0.02, dk.x1, fl, y(dk.h) - 0.04, -zIn, zIn, PAL.wood);
    for (let i = 0; i < 4; i++) room.span(dk.x1, dk.x1 + 0.006, y(0.56 + i * 0.06), y(0.585 + i * 0.06), -0.3, 0.3, PAL.woodDark);
    // a rug between the seats and the cabinet
    P.rug(room, P.place(-0.05, fl, 0.12), 1.3, 0.62, PAL.red, PAL.paper);
    // the underbody (keeps the light from showing under the floor)
    shell.span(-1.98, 1.98, y(0.3), fl - 0.05, -0.55, 0.55, RUBBER);
    // the step up by the sliding door
    roomCut.span(D.slideDoor.x0, D.slideDoor.x1, fl, y(D.slideDoor.bottom), zIn - 0.03, zSkin, PAL.woodDark);
    roomCut.span(D.slideDoor.x0, D.slideDoor.x1, y(D.slideDoor.bottom) - 0.006, y(D.slideDoor.bottom) + 0.004, zIn - 0.05, zSkin, CHROME);
  }

  // ------------------------------------------------------------------ the cab: dash, seats, gear stick
  const seatX = 1.15;
  const seatH = 0.8 - D.floor;
  {
    const dx0 = D.dash.x0;
    const dx1 = D.glassFoot.x - 0.01;
    // the shelf of a dash: a padded top, a painted face sloping down to the toe board
    room.hull([[dx0, y(D.dash.h), -zIn], [dx1, y(D.dash.h), -zIn], [dx0, y(D.dash.h), zIn], [dx1, y(D.dash.h), zIn], [dx0, y(0.92), -zIn], [dx0, y(0.92), zIn], [dx1, y(0.86), -zIn], [dx1, y(0.86), zIn]], CREAM);
    room.span(dx0 - 0.015, dx1, y(D.dash.h), y(D.dash.h) + 0.025, -zIn, zIn, DASHTOP);
    room.span(dx0 - 0.03, dx0 + 0.01, y(D.dash.h) + 0.02, y(D.dash.h) + 0.045, -zIn + 0.05, zIn - 0.05, DASHTOP); // the lip that keeps things on the shelf
    room.hull([[dx0 + 0.05, y(0.92), -zIn], [dx0 + 0.05, y(0.92), zIn], [dx1, y(0.92), -zIn], [dx1, y(0.92), zIn], [2.0, fl, -zIn], [2.0, fl, zIn], [dx1, fl, -zIn], [dx1, fl, zIn]], RUBBER);
    room.span(dx0 - 0.002, dx0, y(0.94), y(1.05), 0.19, 0.61, PAL.dark); // the glovebox's opening (its lid is posed)
    // pedals
    for (const [z, wd] of [[-0.54, 0.06], [-0.42, 0.08], [-0.3, 0.06]] as [number, number][]) room.box(1.88, y(0.56), z, 0.03, 0.1, wd, DARK, { rz: 0.6 });
    // the gear stick's boot on the floor (the stick is posed), the handbrake's console between the seats
    room.span(1.5, 1.62, fl, fl + 0.03, -0.08, 0.08, RUBBER);
    room.span(1.2, 1.4, fl, y(0.72), -0.16, -0.08, DARK);
    // dash top: the radio buddy turned to the driver, an open map, a mug; the nodding figure's body
    P.radioBuddy(room, P.place(1.92, y(D.dash.h) + 0.025, 0.12, Math.PI - Math.atan2(0.54, 0.82)));
    // the centre mirror on its stalk
    room.box(1.86, y(1.78), 0, 0.03, 0.07, 0.24, DARK);
    room.bar(1.87, y(1.81), 0, 1.88, y(1.86), 0, 0.02, DARK);
    // the two front seats, and a seat-belt reel on each door pillar
    for (const s of [-1, 1]) {
      P.armchair(room, P.place(seatX, fl, s * 0.42), { seatH, width: 0.42, cover: SEAT, pocket: 0x9c4f33, arms: false });
      room.span(seatX - 0.12, seatX + 0.26, fl + seatH + 0.002, fl + seatH + 0.008, s * 0.42 - 0.02, s * 0.42 + 0.02, SEAT_STRIPE);
    }
    P.pillow(room, P.place(seatX - 0.1, fl + seatH, 0.42, 0.3), 0.1, 0.16, 0.26, PAL.mustard);
  }

  // ------------------------------------------------------------------ steering wheel, column, the instrument pod
  const tilt = 1.08; // the wheel's axis 62° above horizontal: big and flat, as on a microbus
  const wheelC = new THREE.Vector3(1.43, y(1.18), eye.z);
  const steeringWheel = buildSteering(root, wheelC, { tilt, radius: 0.21, grip: 0.028, rim: 0xe6dcc0, hub: MUSTARD, spokes: 'T', cabin: true, marker: DARK });
  const colLen = (wheelC.y - fl) / Math.sin(tilt);
  dashKit.bar(wheelC.x + 0.04 * Math.cos(tilt), wheelC.y - 0.04 * Math.sin(tilt), eye.z, wheelC.x + colLen * Math.cos(tilt), fl + 0.02, eye.z, 0.045, DARK);
  // the pod on a stalk from the dash, over the far side of the rim
  const pod = { x: 1.7, h: 1.33 };
  {
    const zc = eye.z;
    dashKit.hull(cushionPts(pod.x - 0.03, pod.x + 0.06, y(pod.h - 0.085), y(pod.h + 0.085), zc - 0.13, zc + 0.13, 0.02).map(([a, b, c]) => [a, b, c]), CREAM);
    dashKit.span(pod.x - 0.06, pod.x + 0.06, y(pod.h + 0.075), y(pod.h + 0.095), zc - 0.14, zc + 0.14, DASHTOP); // the hood
    dashKit.span(pod.x - 0.031, pod.x - 0.029, y(pod.h - 0.07), y(pod.h + 0.07), zc - 0.12, zc + 0.12, 0x23262b); // dark face behind the dial
    dashKit.bar(pod.x + 0.04, y(pod.h - 0.08), zc, D.dash.x0 + 0.06, y(D.dash.h), zc, 0.04, DASHTOP);
  }
  const { dialGlow, speedNeedle, fuelNeedle } = buildCluster(root, new THREE.Vector3(pod.x - 0.034, y(pod.h), eye.z), 0.35, 0.22);
  // the live strip (rev counter, temperature, battery, lamps, P R N D) bolted on left of the pod, clear of the radio
  const strip = { x: pod.x - 0.03, h: pod.h - 0.02, z: eye.z - 0.32, w: 0.34 };
  dashKit.span(strip.x + 0.002, strip.x + 0.04, y(strip.h - 0.026), y(strip.h + 0.026), strip.z - strip.w / 2 - 0.01, strip.z + strip.w / 2 + 0.01, DASHTOP);
  dashKit.bar(strip.x + 0.03, y(strip.h - 0.02), strip.z, D.dash.x0 + 0.08, y(D.dash.h), strip.z, 0.025, DASHTOP);

  // ------------------------------------------------------------------ things to operate (their meaning is in controls.ts)
  const cp = new CabParts(y);
  const DRIVER: Reach[] = ['driver'];
  const FRONT: Reach[] = ['driver', 'passenger'];
  {
    const dx0 = D.dash.x0;
    // the key in its lock on the dash face, right of the wheel (where the driver sees it past the rim)
    cp.key(room, new THREE.Vector3(dx0 - 0.005, y(1.0), 0.05), new THREE.Vector3(-1, 0, 0), DRIVER);
    // the long gear stick from the floor: P forward, D back
    cp.stick('selector', new THREE.Vector3(1.56, fl, 0.0), new THREE.Vector3(1.38, y(1.02), 0.0), -0.22, 0.22, FRONT, PAL.metal);
    // the handbrake: a lever on the console, grip at the back, pulled up
    cp.handbrake(room, new THREE.Vector3(1.32, y(0.72), -0.12), new THREE.Vector3(1.02, y(0.8), -0.12), DRIVER);
    // knobs on the dash face left of the wheel: lights and wipers; the hazard button in the middle
    cp.knob('lights', new THREE.Vector3(dx0 - 0.005, y(1.0), -0.7), DRIVER, 4);
    cp.knob('wipers', new THREE.Vector3(dx0 - 0.005, y(1.0), -0.6), DRIVER, 4);
    cp.button('hazard', new THREE.Vector3(dx0 - 0.005, y(0.99), 0.15), FRONT, PAL.red);
    // the horn: the wheel's hub
    cp.point('horn', wheelC.x, wheelC.y, wheelC.z, 0.06, DRIVER);
    // the radio buddy: its body is the switch, its eyes the tuning and volume knobs
    cp.radioBuddy(room, P.place(1.92, y(D.dash.h) + 0.025, 0.12, Math.PI - Math.atan2(0.54, 0.82)), FRONT);
    // the glovebox lid falls open into a little tray; the glovebox itself is a container
    cp.lid('glovebox', new THREE.Vector3(dx0 - 0.004, y(0.945), 0.19), new THREE.Vector3(dx0, y(1.045), 0.61), FRONT, PAL.woodDark);
    // the sun visors on the header over the glass
    for (const [id, sd, from] of [['visorL', -1, DRIVER], ['visorR', 1, ['passenger'] as Reach[]]] as [string, number, Reach[]][]) cp.visor(id, room, 1.92, y(1.85), sd * 0.1, sd * 0.66, 0.14, from, 0xd9c8a4);
    // the cabin lamp in the ceiling: its lens is the switch
    cp.point('cabinLamp', -0.3, y(D.ceiling) - 0.03, 0, 0.1, ['seated']);
    // and a switch for it on the header over the glass, for the front seats
    room.span(1.83, 1.86, y(1.84), y(1.87), 0.14, 0.24, DASHTOP);
    room.span(1.825, 1.83, y(1.845), y(1.865), 0.17, 0.21, ACCENT);
    cp.point('cabinLamp@front', 1.83, y(1.855), 0.19, 0.05, FRONT);
  }
  // small things on the dash that hop on a bump
  const jump = new ModelBuilder();
  P.openMap(jump, P.place(1.95, y(D.dash.h) + 0.025, 0.5, 0.3), 0.3, 0.22);
  P.mug(jump, P.place(1.88, y(D.dash.h) + 0.025, 0.66), PAL.teal);

  // ------------------------------------------------------------------ the room: cabinet frame, bench, curtains
  // the low cabinet along the left wall: a plinth the stove and the cooler slots stand on
  const cab = { x0: -0.35, x1: 0.65, z0: -zIn, z1: -0.4, top: 0.95 };
  room.span(cab.x0 - 0.02, cab.x1 + 0.02, fl, fl + 0.06, cab.z0, cab.z1 - 0.02, PAL.woodDark);
  // the rear bench: a base over the wheel housings (fixed); its seat and back ride on the bench mover
  const bench = { x0: -1.45, x1: -0.85, top: 0.85, back: 1.4 };
  room.span(bench.x0, bench.x1, fl, y(0.73), -0.53, 0.53, PAL.wood);
  room.span(bench.x1, bench.x1 + 0.006, fl + 0.04, y(0.69), -0.49, 0.49, PAL.woodDark);
  {
    // seat cushion (with a fold-down leg pair at its front edge)
    const seat = new ModelBuilder();
    seat.hull(cushionPts(-1.38, bench.x1, y(0.73), y(bench.top), -zIn + 0.01, zIn - 0.01, 0.03), SEAT);
    for (const z of [-0.5, -0.1, 0.3]) seat.span(-1.38, bench.x1 + 0.003, y(bench.top - 0.05), y(bench.top - 0.035), z, z + 0.04, SEAT_STRIPE);
    for (const z of [-0.3, 0.3]) seat.span(bench.x1 - 0.06, bench.x1 - 0.03, y(0.33), y(0.73), z - 0.02, z + 0.02, PAL.steel);
    const slide = new THREE.Vector3(0.48, 0.1, 0);
    roomParts.push({ mover: 'bench', geo: seat.build(), pose: (t) => new THREE.Matrix4().makeTranslation(slide.x * t, slide.y * t, 0) });
    // the backrest: stands at the back of the seat, lies down flat behind it (its face up) when folded
    const back = new ModelBuilder();
    back.hull(cushionPts(bench.x0, -1.33, y(bench.top), y(bench.back), -zIn + 0.01, zIn - 0.01, 0.02), SEAT);
    back.hull(cushionPts(-1.36, -1.32, y(bench.top + 0.06), y(bench.back - 0.03), -zIn + 0.04, zIn - 0.04, 0.012), 0xcf7752);
    for (const z of [-0.5, -0.1, 0.3]) back.span(-1.33, -1.317, y(bench.top + 0.04), y(bench.back - 0.04), z, z + 0.04, SEAT_STRIPE);
    const p0 = new THREE.Vector3(-1.33, y(bench.top), 0);
    const p1 = new THREE.Vector3(-0.9, y(D.deck.h), 0);
    roomParts.push({
      mover: 'bench',
      geo: back.build(),
      pose: (t) => {
        const p = p0.clone().lerp(p1, t);
        return new THREE.Matrix4().makeTranslation(p.x, p.y, p.z).multiply(new THREE.Matrix4().makeRotationZ((Math.PI / 2) * t)).multiply(new THREE.Matrix4().makeTranslation(-p0.x, -p0.y, -p0.z));
      },
    });
  }
  // curtains: drawn across the side windows of the room, gathered at the pillars when open
  const curtainGeo = (w: Win, side: number): THREE.BufferGeometry => {
    const b = new ModelBuilder();
    const z = side * (zIn - 0.03);
    const top = w.h1 + 0.06;
    const drop = w.h1 - w.h0 + 0.1;
    const n = Math.max(6, Math.round((w.x1 - w.x0 + 0.08) / 0.06));
    const fw = (w.x1 - w.x0 + 0.08) / n;
    for (let i = 0; i < n; i++) b.box(w.x0 - 0.04 + (i + 0.5) * fw, y(top) - drop / 2, z + side * (i % 2) * 0.012, fw + 0.004, drop, 0.012, i % 5 === 2 ? 0x8bb7a8 : CURTAIN);
    return b.build();
  };
  const gather = (anchor: number) => (t: number): THREE.Matrix4 => {
    const s = 0.16 + 0.84 * clamp01(t);
    return new THREE.Matrix4().makeTranslation(anchor, 0, 0).multiply(new THREE.Matrix4().makeScale(s, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(-anchor, 0, 0));
  };
  for (const [w, side, list] of [[D.windowsLeft.middle, -1, roomParts], [D.windowsLeft.rear, -1, roomParts], [D.windowsRight.rear, 1, roomCutParts]] as [Win, number, PosedPart[]][]) {
    list.push({ mover: 'curtain', geo: curtainGeo(w, side), pose: gather(w.x0 - 0.04) });
    // the rail, fixed
    const b = side < 0 ? room : roomCut;
    b.span(w.x0 - 0.08, w.x1 + 0.06, y(w.h1 + 0.06) - 0.008, y(w.h1 + 0.06) + 0.008, side * (zIn - 0.05), side * (zIn - 0.01), PAL.woodDark);
  }
  // window trims inside
  for (const [wins, side, b] of [[leftWins, -1, room], [rightWins, 1, roomCut]] as [Win[], number, ModelBuilder][]) {
    for (const w of wins) b.prism('xy', winOutline(grow(w, 0.025), 0.09), [winOutline(w)], side * zIn, side * (zIn - 0.01), PAL.woodLight);
    b.prism('xy', quarterOutline(0.02), [quarterOutline()], side * zIn, side * (zIn - 0.01), DASHTOP);
  }
  // a net of maps and a hat on the left wall over the cabinet, a coat hook by the door
  room.span(0.0, 0.5, y(1.12), y(1.16), -zIn, -zIn + 0.05, PAL.woodDark);
  P.books(room, P.place(0.2, y(1.16), -zIn + 0.06, LEFT), 5);
  roomCut.bar(D.slideDoor.x1 + 0.08, y(1.3), zIn - 0.04, D.slideDoor.x1 + 0.08, y(1.62), zIn - 0.04, 0.022, PAL.steel); // grab handle

  // ------------------------------------------------------------------ slots
  const slots: VehicleSlot[] = [];
  const slot = (id: string, kind: string, label: string, installed: boolean, empty: (b: ModelBuilder) => void, built: (b: ModelBuilder) => void, isCut = false, moving?: { mover: string; build: (b: ModelBuilder) => void; pose: (t: number) => THREE.Matrix4 | null }[]): void => {
    const e = new ModelBuilder();
    const bb = new ModelBuilder();
    empty(e);
    built(bb);
    const mv = moving?.map((m) => {
      const g = new ModelBuilder();
      m.build(g);
      return { mover: m.mover, built: true, geo: g.build(), pose: m.pose };
    });
    slots.push(makeSlot(id, kind, label, e, bb, installed, isCut, mv));
  };
  const cabD = cab.z1 - cab.z0;
  const cabH = cab.top - D.floor;
  slot('stove', 'stove', '灶台', true,
    (b) => P.slotFrame(b, P.place(0.4, fl + 0.06, -zIn + cabD / 2, LEFT), 'stove', cabD, 0.5, cabH - 0.06),
    (b) => {
      P.stoveUnit(b, P.place(0.4, fl + 0.06, -zIn + cabD / 2, LEFT), 0.5, cabD, cabH - 0.06);
      // a spice rack and a tea towel on the wall behind
      b.span(0.2, 0.62, y(1.12), y(1.15), -zIn, -zIn + 0.07, PAL.wood);
      for (let i = 0; i < 4; i++) b.cyl(0.26 + i * 0.1, y(1.15) + 0.04, -zIn + 0.04, 0.025, 0.08, [PAL.red, PAL.mustard, PAL.green, PAL.terracotta][i], { segments: 6 });
    });
  slot('cooler', 'cooler', '冷藏箱', false,
    (b) => P.slotFrame(b, P.place(-0.1, fl + 0.06, -zIn + cabD / 2, LEFT), 'cooler', cabD, 0.48, cabH - 0.06),
    (b) => {
      // an ice chest built into the cabinet: a pale blue lid on top, a drain tap on the front
      const x0 = cab.x0;
      const x1 = 0.15;
      b.span(x0, x1, fl + 0.06, y(cab.top - 0.04), cab.z0, cab.z1 - 0.02, PAL.wood);
      b.span(x0 + 0.03, x1 - 0.03, fl + 0.12, y(cab.top - 0.08), cab.z1 - 0.025, cab.z1 - 0.01, 0x8fbfd0);
      b.span(x0, x1, y(cab.top - 0.04), y(cab.top), cab.z0, cab.z1, 0xbfdcc9);
      b.span(x0 + 0.04, x1 - 0.04, y(cab.top), y(cab.top) + 0.02, cab.z1 - 0.06, cab.z1 - 0.02, PAL.steel); // handle
      b.box((x0 + x1) / 2, y(cab.top - 0.12), cab.z1 - 0.005, 0.06, 0.04, 0.03, PAL.steel); // latch
      b.cyl(x1 - 0.08, fl + 0.18, cab.z1 - 0.005, 0.015, 0.03, PAL.red, { rx: Math.PI / 2, segments: 6 });
      P.mug(b, P.place(x0 + 0.1, y(cab.top) + 0.02, cab.z0 + 0.12), PAL.cream);
    });
  slot('bed', 'bed', '床铺', true,
    (b) => P.slotFrame(b, P.place((D.deck.x0 + D.deck.x1) / 2, y(D.deck.h), 0.28, 0), 'bed', D.deck.x1 - D.deck.x0 - 0.04, 0.96, 0.4),
    (b) => {
      const dk = D.deck;
      b.hull(cushionPts(dk.x0 + 0.02, dk.x1 - 0.02, y(dk.h), y(dk.h + 0.08), -0.22, zIn - 0.02, 0.025), PAL.cream);
      b.span(dk.x0 + 0.25, dk.x1 - 0.03, y(dk.h + 0.08), y(dk.h + 0.105), -0.2, zIn - 0.04, PAL.blue); // quilt, folded back
      b.span(dk.x0 + 0.24, dk.x0 + 0.29, y(dk.h + 0.105), y(dk.h + 0.11), -0.2, zIn - 0.04, PAL.paper);
      P.pillow(b, P.place(dk.x0 + 0.13, y(dk.h + 0.08), 0.05, 0), 0.2, 0.1, 0.42, PAL.paper);
      P.pillow(b, P.place(dk.x0 + 0.13, y(dk.h + 0.08), 0.52, 0), 0.2, 0.1, 0.42, PAL.mustard);
      P.blanketRoll(b, P.place(dk.x1 - 0.12, y(dk.h + 0.105), 0.3), 0.7, PAL.red);
    }, false, [{
      // the bedding spread over the folded bench: only while it lies flat
      mover: 'bench',
      build: (b) => {
        b.hull(cushionPts(D.deck.x1 - 0.01, -0.4, y(D.deck.h), y(D.deck.h + 0.06), -zIn + 0.03, zIn - 0.03, 0.02), PAL.blue);
        b.span(-1.0, -0.42, y(D.deck.h + 0.06), y(D.deck.h + 0.065), -zIn + 0.05, zIn - 0.05, PAL.paper);
      },
      pose: (t) => (t > 0.98 ? new THREE.Matrix4() : null),
    }]);
  slot('storage', 'storage', '储物', true,
    (b) => P.slotFrame(b, P.place((D.deck.x0 + D.deck.x1) / 2, y(D.deck.h), -0.53, 0), 'storage', D.deck.x1 - D.deck.x0 - 0.04, 0.5, 0.36),
    (b) => {
      const dk = D.deck;
      const z0 = -zIn + 0.02;
      const z1 = -0.27;
      // a lidded wooden chest on the deck, a crate and a basket on it, a cargo net over them
      P.cabinet(b, P.place((dk.x0 + dk.x1) / 2 + 0.02, y(dk.h), (z0 + z1) / 2, 0), z1 - z0, dk.x1 - dk.x0 - 0.06, 0.3, { doors: 1, door: PAL.tealSoft });
      P.crate(b, P.place(dk.x0 + 0.2, y(dk.h + 0.3), -0.62, 0.2), 0.3, 0.2, 0.26, PAL.woodLight);
      b.cyl(dk.x1 - 0.16, y(dk.h + 0.38), -0.45, 0.1, 0.16, PAL.rope, { segments: 10, radiusTop: 0.12 }); // a basket
      b.sphere(dk.x1 - 0.16, y(dk.h + 0.47), -0.45, 0.06, PAL.orange, 0); // oranges in it
      b.sphere(dk.x1 - 0.12, y(dk.h + 0.48), -0.41, 0.045, PAL.orange, 0);
      for (const x of [dk.x0 + 0.08, dk.x1 - 0.08]) b.bar(x, y(dk.h + 0.32), z0 + 0.01, x, y(dk.h + 0.32), z1 - 0.01, 0.01, PAL.rope);
    });
  const roofY = y(D.roof);
  slot('roofRack', 'roof', '行李架', false,
    (b) => P.slotPad(b, P.place(-0.3, roofY, 0, 0), 'roof', 2.2, 1.1),
    (b) => {
      const x0 = -1.55;
      const x1 = 0.95;
      for (const s of [-1, 1]) {
        b.span(x0, x1, roofY + 0.1, roofY + 0.13, s * 0.56, s * 0.6, DARK);
        for (const x of [x0 + 0.05, -0.3, x1 - 0.05]) b.span(x - 0.02, x + 0.02, roofY - 0.01, roofY + 0.13, s * 0.56, s * 0.6, DARK);
      }
      for (const x of [x0, x1]) b.span(x - 0.02, x + 0.02, roofY + 0.1, roofY + 0.13, -0.6, 0.6, DARK);
      for (let i = 1; i < 6; i++) b.span(x0 + (i * (x1 - x0)) / 6 - 0.015, x0 + (i * (x1 - x0)) / 6 + 0.015, roofY + 0.06, roofY + 0.08, -0.58, 0.58, DARK);
      P.crate(b, P.place(-1.1, roofY + 0.08, -0.25, 0.1), 0.6, 0.3, 0.5, PAL.woodLight);
      P.blanketRoll(b, P.place(-0.4, roofY + 0.08, 0.0, Math.PI / 2), 0.9, PAL.green);
      P.jerrycan(b, P.place(0.4, roofY + 0.08, 0.32, Math.PI / 2), PAL.red);
      P.jerrycan(b, P.place(0.4, roofY + 0.08, -0.05, Math.PI / 2), 0x6f7d5b);
      b.span(0.62, 0.92, roofY + 0.08, roofY + 0.2, -0.5, 0.2, PAL.sky); // a folded tarp
      b.bar(-1.2, roofY + 0.4, -0.58, -1.2, roofY + 0.12, 0.58, 0.015, PAL.orange); // straps
      b.bar(-0.45, roofY + 0.26, -0.58, -0.45, roofY + 0.26, 0.58, 0.015, PAL.orange);
    }, true);

  // ------------------------------------------------------------------ outside: mirrors on stalks
  for (const s of [-1, 1]) {
    const m = D.mirror;
    shell.bar(D.frontDoor.x1 - 0.04, y(1.2), s * (W + 0.005), m.x, y(m.h - m.tall / 2 + 0.02), s * (m.z - 0.04), 0.025, DARK);
    shell.span(m.x, m.x + 0.04, y(m.h - m.tall / 2), y(m.h + m.tall / 2), s * m.z - m.wide / 2, s * m.z + m.wide / 2, DARK);
  }

  // ------------------------------------------------------------------ the movers' panels
  // the tailgate: hinged at the roof, lifts to a canopy over the tailgate seat
  const tgPose = (t: number): THREE.Matrix4 => turnAbout(D.xRear, y(tg.hinge), 0, ZAXIS, -tg.open * DEG * clamp01(t));
  {
    const out = new ModelBuilder();
    out.prism('zy', tgOutline, [twOutline], D.xRear - 0.005, D.xRear + 0.02, CREAM);
    out.span(D.xRear - 0.01, D.xRear - 0.005, y(tg.h0 + 0.01), y(D.waist.lo), -tg.z + 0.02, tg.z - 0.02, MUSTARD);
    out.span(D.xRear - 0.011, D.xRear - 0.005, y(D.waist.lo), y(D.waist.hi), -tg.z + 0.01, tg.z - 0.01, WAIST);
    out.prism('zy', roundRect(-D.tailWindow.z - 0.025, D.tailWindow.z + 0.025, y(D.tailWindow.h0 - 0.025), y(D.tailWindow.h1 + 0.025), 0.08), [twOutline], D.xRear - 0.012, D.xRear - 0.005, DARK);
    out.box(D.xRear - 0.02, y(1.15), 0, 0.03, 0.03, 0.16, CHROME); // handle
    bodyParts.push({ mover: 'tailgate', geo: out.build(), pose: tgPose });
    const inn = new ModelBuilder();
    inn.prism('zy', tgOutline, [twOutline], D.xRear + 0.02, D.xRear + 0.035, LINING);
    inn.prism('zy', roundRect(-D.tailWindow.z - 0.025, D.tailWindow.z + 0.025, y(D.tailWindow.h0 - 0.025), y(D.tailWindow.h1 + 0.025), 0.08), [twOutline], D.xRear + 0.035, D.xRear + 0.045, PAL.woodLight);
    inn.box(D.xRear + 0.05, y(1.1), 0, 0.02, 0.025, 0.2, PAL.woodDark); // a pull strap
    roomParts.push({ mover: 'tailgate', geo: inn.build(), pose: tgPose });
    // gas struts, shown when it stands open
    const strut = new ModelBuilder();
    const a = tg.open * DEG;
    const tip = (s: number): [number, number] => [D.xRear - s * Math.sin(a), y(tg.hinge) + s * -Math.cos(a)];
    for (const s of [-1, 1]) {
      const [tx, ty] = tip(0.5);
      strut.bar(D.xRear + 0.03, y(1.32), s * (tg.z + 0.035), tx, ty, s * (tg.z - 0.02), 0.02, DARK);
    }
    roomParts.push({ mover: 'tailgate', geo: strut.build(), pose: (t) => (t > 0.98 ? new THREE.Matrix4() : null) });
    glassParts.push({ mover: 'tailgate', geo: paneGeometry([[D.xRear + 0.012, y(D.tailWindow.h0), -D.tailWindow.z, D.xRear + 0.012, y(D.tailWindow.h0), D.tailWindow.z, D.xRear + 0.012, y(D.tailWindow.h1), D.tailWindow.z, D.xRear + 0.012, y(D.tailWindow.h1), -D.tailWindow.z]]), pose: tgPose });
  }
  // the sliding door: steps out, then runs back along the body
  const sd = D.slideDoor;
  const sdPose = (t: number): THREE.Matrix4 => {
    const k = clamp01(t);
    const out = Math.min(1, k / 0.12);
    const back = Math.max(0, (k - 0.12) / 0.88);
    return new THREE.Matrix4().makeTranslation(-D.slideTravel * back, 0, 0.06 * out);
  };
  {
    const dw = D.doorWindow;
    const outline: Outline = [[sd.x0 + 0.005, y(sd.bottom)], [sd.x1 - 0.005, y(sd.bottom)], [sd.x1 - 0.005, y(sd.top) - 0.005], [sd.x0 + 0.005, y(sd.top) - 0.005]];
    const win = winOutline(dw, 0.06);
    const out = new ModelBuilder();
    out.prism('xy', outline, [win], zSkin, W, CREAM);
    out.prism('xy', [[sd.x0 + 0.005, y(sd.bottom)], [sd.x1 - 0.005, y(sd.bottom)], [sd.x1 - 0.005, y(D.waist.lo)], [sd.x0 + 0.005, y(D.waist.lo)]], [], W, W + 0.004, MUSTARD);
    band(out, sd.x0 + 0.005, sd.x1 - 0.005, () => y(D.waist.lo), () => y(D.waist.hi), W, 1, WAIST, 0.005);
    out.prism('xy', winOutline(grow(dw, 0.03), 0.09), [win], W, W + 0.012, DARK);
    out.box(sd.x1 - 0.1, y(1.12), W + 0.02, 0.14, 0.03, 0.03, CHROME); // handle
    out.span(sd.x0 + 0.02, sd.x1 - 0.02, y(sd.top) - 0.03, y(sd.top) - 0.01, W, W + 0.01, DARK); // the top runner
    loaf(out, -0.05, 0.72, W + 0.006, 1);
    bodyCutParts.push({ mover: 'slideDoor', geo: out.build(), pose: sdPose });
    const inn = new ModelBuilder();
    inn.prism('xy', outline, [win], zSkin - 0.02, zSkin, LINING);
    inn.span(sd.x0 + 0.05, sd.x1 - 0.05, y(0.5), y(1.08), zSkin - 0.028, zSkin - 0.02, PANEL);
    inn.prism('xy', winOutline(grow(dw, 0.025), 0.09), [win], zSkin - 0.03, zSkin - 0.02, PAL.woodLight);
    inn.box(sd.x1 - 0.1, y(1.12), zSkin - 0.04, 0.12, 0.025, 0.03, PAL.steel);
    // a little café curtain on the door window, always half drawn
    for (let i = 0; i < 8; i++) inn.box(dw.x0 + 0.03 + i * 0.1, y(dw.h0 + 0.09), zSkin - 0.04 - (i % 2) * 0.01, 0.105, 0.16, 0.01, i % 2 ? PAL.cream : 0xe6d3a8);
    inn.span(dw.x0 - 0.04, dw.x1 + 0.04, y(dw.h0 + 0.23), y(dw.h0 + 0.24), zSkin - 0.05, zSkin - 0.03, PAL.woodDark);
    roomCutParts.push({ mover: 'slideDoor', geo: inn.build(), pose: sdPose });
    glassCutParts.push({ mover: 'slideDoor', geo: paneGeometry([sidePane(dw.x0, dw.x1, y(dw.h0), y(dw.h1), zSkin + 0.01)]), pose: sdPose });
  }

  // ------------------------------------------------------------------ the cab doors: hinged at the front, each with a window that winds down
  {
    const W_DROP = D.windowsLeft.cab.h1 - D.windowsLeft.cab.h0;
    for (const side of [-1, 1]) {
      const L = side < 0 ? 'L' : 'R';
      const door = `door${L}`;
      const win = `window${L}`;
      const cw = (side < 0 ? D.windowsLeft : D.windowsRight).cab;
      const hinge = (t: number): THREE.Matrix4 => turnAbout(fd.x1, 0, side * W, YAXIS, side * 70 * DEG * clamp01(t));
      const outline: Outline = [[fd.x0 + 0.006, y(fd.bottom) + 0.006], [fd.x1 - 0.004, y(fd.bottom) + 0.006], [fd.x1 - 0.004, y(fd.top) - 0.006], [fd.x0 + 0.006, y(fd.top) - 0.006]];
      const hole = winOutline(cw);
      // outside: the panel in the two colours, the window frame, the vent wing, the handle
      const out = new ModelBuilder();
      const zo = side * W;
      out.prism('xy', outline, [hole], side * zSkin, zo, CREAM);
      out.span(fd.x0 + 0.006, fd.x1 - 0.004, y(fd.bottom) + 0.006, y(D.waist.lo), zo, zo + side * 0.004, MUSTARD);
      out.span(fd.x0 + 0.006, fd.x1 - 0.004, y(D.waist.lo), y(D.waist.hi), zo, zo + side * 0.005, WAIST);
      out.prism('xy', winOutline(grow(cw, 0.03), 0.09), [hole], zo, zo + side * 0.012, DARK);
      out.bar(cw.x1 - 0.2, y(cw.h0), zo + side * 0.008, cw.x1 - 0.2, y(cw.h1), zo + side * 0.008, 0.022, DARK);
      out.box(fd.x0 + 0.14, y(1.12), zo + side * 0.02, 0.14, 0.03, 0.03, ACCENT);
      (side < 0 ? bodyParts : bodyCutParts).push({ mover: door, geo: out.build(), pose: hinge });
      // inside: the lining, a card, the pull, the window crank (it turns as the window goes down)
      const inn = new ModelBuilder();
      inn.prism('xy', outline, [hole], side * zIn, side * zSkin, LINING);
      inn.span(fd.x0 + 0.04, fd.x1 - 0.04, y(fd.bottom + 0.03), y(1.1), side * (zIn - 0.012), side * zIn, PAL.tealSoft);
      inn.prism('xy', winOutline(grow(cw, 0.025), 0.09), [hole], side * zIn, side * (zIn - 0.01), PAL.woodLight);
      inn.box(fd.x0 + 0.12, y(1.06), side * (zIn - 0.035), 0.12, 0.025, 0.03, ACCENT); // the pull
      (side < 0 ? roomParts : roomCutParts).push({ mover: door, geo: inn.build(), pose: hinge });
      const crankAt = new THREE.Vector3(fd.x0 + 0.42, y(0.98), side * (zIn - 0.02));
      const crank = new ModelBuilder();
      crank.cyl(crankAt.x, crankAt.y, crankAt.z, 0.022, 0.03, DARK, { rx: Math.PI / 2, segments: 8 });
      crank.bar(crankAt.x, crankAt.y, crankAt.z - side * 0.02, crankAt.x + 0.08, crankAt.y, crankAt.z - side * 0.02, 0.018, PAL.steel);
      crank.cyl(crankAt.x + 0.08, crankAt.y, crankAt.z - side * 0.045, 0.014, 0.04, ACCENT, { rx: Math.PI / 2, segments: 8 });
      (side < 0 ? roomParts : roomCutParts).push({
        mover: win,
        follows: [door],
        geo: crank.build(),
        pose: (t, all) => hinge(all[door] ?? 0).multiply(turnAbout(crankAt.x, crankAt.y, crankAt.z, ZAXIS, -side * Math.PI * 3 * clamp01(t))),
      });
      // the pane: between the skin and the lining, goes down into the door
      const zg = side * (zSkin - 0.012);
      (side < 0 ? glassParts : glassCutParts).push({
        mover: win,
        follows: [door],
        geo: paneGeometry([sidePane(cw.x0, cw.x1, y(cw.h0), y(cw.h1), zg)]),
        pose: (t, all) => hinge(all[door] ?? 0).multiply(new THREE.Matrix4().makeTranslation(0, -W_DROP * 0.97 * clamp01(t), 0)),
      });
      const fromIn: Reach[] = side < 0 ? ['driver'] : ['passenger'];
      cp.point(door, fd.x0 + 0.12, y(1.06), side * (zIn - 0.04), 0.06, fromIn);
      cp.point(`${door}@out`, fd.x0 + 0.14, y(1.12), side * (W + 0.03), 0.07, ['outside']);
      cp.point(win, crankAt.x + 0.04, crankAt.y, crankAt.z - side * 0.03, 0.06, fromIn);
      cp.movers.push([door, '车门'], [win, '车窗']);
    }
    // the sliding door and the tailgate from outside (and the sliding door from the rear seats)
    cp.point('slideDoor', D.slideDoor.x1 - 0.1, y(1.12), zSkin - 0.06, 0.07, ['seated']);
    cp.point('slideDoor@out', D.slideDoor.x1 - 0.1, y(1.12), W + 0.04, 0.08, ['outside']);
    cp.point('tailgate@out', D.xRear - 0.04, y(1.15), 0, 0.09, ['outside']);
    // the engine lid at the back (the van's bonnet: its engine is behind the seats), hinged at its top
    const lid = new ModelBuilder();
    lid.span(D.xRear - 0.012, D.xRear + 0.018, y(0.474), y(0.886), -0.486, 0.486, MUSTARD);
    for (let i = 0; i < 5; i++) lid.span(D.xRear - 0.024, D.xRear - 0.012, y(0.76 + i * 0.024), y(0.772 + i * 0.024), -0.36, -0.08, DARK);
    for (let i = 0; i < 5; i++) lid.span(D.xRear - 0.024, D.xRear - 0.012, y(0.76 + i * 0.024), y(0.772 + i * 0.024), 0.08, 0.36, DARK);
    lid.box(D.xRear - 0.027, y(0.6), 0, 0.02, 0.03, 0.12, ACCENT);
    bodyParts.push({ mover: 'bonnet', geo: lid.build(), pose: (t) => turnAbout(D.xRear, y(0.89), 0, ZAXIS, -80 * DEG * clamp01(t)) });
    cp.point('bonnet@out', D.xRear - 0.04, y(0.6), 0, 0.09, ['outside']);
    cp.movers.push(['bonnet', '发动机盖']);
  }

  // ------------------------------------------------------------------ meshes
  const vm = vehicleMaterials();
  const hullGeo = hull.build();
  const hullCutGeo = hullCut.build();
  const hullBox = hullGeo.boundingBox!.clone().union(hullCutGeo.boundingBox!);
  shell.add(hullGeo);
  shellCut.add(hullCutGeo);
  const posed = (b: ModelBuilder | THREE.BufferGeometry, parts: PosedPart[], mat: THREE.Material, name: string, parent: THREE.Object3D): PoseMesh => {
    const pm = new PoseMesh(b instanceof ModelBuilder ? b.build() : b, parts, mat, name);
    parent.add(pm.mesh);
    return pm;
  };
  const posedMeshes: PoseMesh[] = [];
  const bodyPM = posed(shell, bodyParts, vm.body, 'body', root);
  const bodyCutPM = posed(shellCut, bodyCutParts, vm.body, 'body:cut', cut);
  roomParts.push(...cp.room);
  const roomPM = posed(room, roomParts, vm.cabin, 'room', root);
  const roomCutPM = posed(roomCut, roomCutParts, vm.cabin, 'room:cut', cut);
  posedMeshes.push(bodyPM, bodyCutPM, roomPM, roomCutPM);
  const cluster = new THREE.Group();
  cluster.name = 'cluster';
  root.add(cluster);
  const hoodPM = new PoseMesh(dashKit.build(), cp.hood, vm.cabin, 'cluster:hood');
  posedMeshes.push(hoodPM);
  const hood = hoodPM.mesh;
  hood.name = 'cluster:hood';
  cluster.add(hood);
  for (const o of [...root.children]) if ((o as THREE.Group).isGroup && o !== cut && o.children.some((c) => (c as THREE.Mesh).material === dialGlow)) cluster.attach(o);
  const dashPanel = new DashPanel(cluster, { pos: new THREE.Vector3(strip.x - 0.002, y(strip.h), strip.z), tiltBack: 0.35, width: strip.w, redline: spec.engine.redline });
  // the hopping things on the dash: one mesh the controls lift on a bump
  const jumpers = new THREE.Group();
  jumpers.name = 'jumpers';
  const jumpMesh = new THREE.Mesh(jump.build(), vm.cabin);
  jumpMesh.name = 'jumpers';
  jumpers.add(jumpMesh);
  root.add(jumpers);

  const slotMesh = new SlotMesh(slots, vm.cabin);
  root.add(slotMesh.mesh);

  // glass: what stays, what goes with the cutaway (mid wall, between skin and lining)
  const pane = (w: Win, z: number): number[] => sidePane(w.x0, w.x1, y(w.h0), y(w.h1), z);
  const quarterPane = (z: number): number[] => quarterPts().flatMap(([x, h]) => [x, y(h), z]);
  const glassPM = posed(paneGeometry([...notCab(leftWins).map((w) => pane(w, -zSkin)), quarterPane(-zSkin)]), glassParts, glassMaterial(0xbfd6dc, 0.14), 'glass', root);
  const glassCutPM = posed(paneGeometry([...notCab(rightWins).map((w) => pane(w, zSkin)), quarterPane(zSkin)]), glassCutParts, glassMaterial(0xbfd6dc, 0.14), 'glass:cut', cut);
  glassPM.mesh.renderOrder = 9;
  glassCutPM.mesh.renderOrder = 9;
  posedMeshes.push(glassPM, glassCutPM);

  const gf = D.glassFoot;
  const gh = D.glassHead;
  const { windscreen, wipers } = buildScreen(root, [gf.x, y(gf.h), -D.glassHalf, gf.x, y(gf.h), D.glassHalf, gh.x, y(gh.h), D.glassHalf, gh.x, y(gh.h), -D.glassHalf], [-0.56, 0.04], 0.52);
  const m = D.mirror;
  buildMirrors(root, [
    [m.x - 0.003, y(m.h), -m.z, m.wide - 0.025, m.tall - 0.03, -1.36],
    [m.x - 0.003, y(m.h), m.z, m.wide - 0.025, m.tall - 0.03, -(Math.PI - 1.36)],
    [1.844, y(1.78), 0, 0.21, 0.055, -Math.PI / 2],
  ]);
  const { headlights, taillights } = buildLamps(
    root,
    [new THREE.Vector3(D.xFront + 0.012, y(D.headlamp.h), -D.headlamp.z), new THREE.Vector3(D.xFront + 0.012, y(D.headlamp.h), D.headlamp.z)],
    [new THREE.Vector3(D.xRear - 0.008, y(D.taillamp.h), -D.taillamp.z), new THREE.Vector3(D.xRear - 0.008, y(D.taillamp.h), D.taillamp.z)],
    D.headlamp.r,
    [D.taillamp.tall, D.taillamp.wide],
  );
  // lamp shades: a dome in the middle of the ceiling, a little reading lamp over the bed
  const lampB = new ModelBuilder();
  lampB.cyl(-0.3, y(D.ceiling) - 0.025, 0, 0.11, 0.05, 0xf3e6c4, { segments: 12, radiusTop: 0.08 });
  lampB.cyl(-1.75, y(D.ceiling) - 0.02, 0.5, 0.06, 0.04, 0xf3e6c4, { segments: 10, radiusTop: 0.04 });
  const lampMesh = new THREE.Mesh(lampB.build(), vm.lamps);
  lampMesh.name = 'lamps';
  cut.add(lampMesh);

  // the nodding figure on the dash: its body is fixed, its head nods with what the cab feels (the charm).
  // The view swings a charm like a hanging pendulum; the head stands on its spring, so the frame is
  // turned half round to make it lean the way a sprung head leans.
  const nod = { x: 1.98, z: -0.08 };
  {
    room.cyl(nod.x, y(D.dash.h) + 0.035, nod.z, 0.022, 0.02, DARK, { segments: 8 });
    room.cyl(nod.x, y(D.dash.h) + 0.07, nod.z, 0.02, 0.05, PAL.blue, { segments: 8, radiusTop: 0.016 });
  }
  const charmBase = new THREE.Group();
  charmBase.position.set(nod.x, y(D.dash.h) + 0.095, nod.z);
  charmBase.rotation.y = Math.PI;
  root.add(charmBase);
  const charm = new THREE.Group();
  charmBase.add(charm);
  {
    const hb = new ModelBuilder();
    hb.cyl(0, 0.008, 0, 0.006, 0.016, PAL.steel, { segments: 5 });
    hb.sphere(0, 0.04, 0, 0.03, PAL.paper, 1);
    hb.box(-0.026, 0.044, 0, 0.012, 0.012, 0.028, DARK); // a face toward the driver (turned with the frame)
    hb.cyl(0, 0.07, 0, 0.032, 0.012, PAL.red, { segments: 10 });
    hb.cyl(0, 0.08, 0, 0.018, 0.016, PAL.red, { segments: 8 });
    const head = new THREE.Mesh(hb.build(), vm.cabin);
    head.name = 'charm';
    charm.add(head);
  }
  const wheels = buildWheels(root, spec, { width: 0.2, tyre: RUBBER, hub: CREAM, cap: CHROME, hubR: 0.62, capR: 0.24 });

  // ------------------------------------------------------------------ movers
  const movers: VehicleParts['movers'] = {};
  const mover = (name: string, label: string): void => {
    movers[name] = {
      label,
      set: (t) => {
        const k = clamp01(t);
        for (const pm of posedMeshes) pm.set(name, k);
        slotMesh.setMover(name, k);
      },
    };
  };
  mover('slideDoor', '侧滑门');
  mover('tailgate', '尾门');
  mover('bench', '后排放倒');
  mover('curtain', '窗帘');
  for (const [m, label] of cp.movers) mover(m, label);

  // ------------------------------------------------------------------ seats and viewpoints
  const v = (x: number, h: number, z: number, yawDeg: number, pitchDeg: number, label: string, seat: boolean, extra: Partial<VehicleViewpoint> = {}): VehicleViewpoint => ({ x, y: y(h), z, yaw: yawDeg * DEG, pitch: pitchDeg * DEG, label, seat, ...extra });
  const views: Record<string, VehicleViewpoint> = {
    passenger: { x: eye.x, y: eye.y, z: -eye.z, yaw: 0, pitch: -3.7 * DEG, label: '副驾', seat: true },
    rearLeft: v(-1.08, 1.61, -0.4, 0, -6, '后排（左）', true),
    rearRight: v(-1.08, 1.61, 0.4, 0, -6, '后排（右）', true),
    tailgate: v(-1.97, 1.62, 0.05, 180, -10, '尾门坐沿', true, { open: ['tailgate'] }),
    room: v(0.86, 1.46, 0.02, 180, -16, '车厢（从前座之间向后看）', false),
    roomRear: v(-1.7, 1.56, -0.05, 0, -8, '车厢（从床上向前看）', false),
    galley: v(0.1, 1.42, 0.62, -90, -24, '侧滑门口看厨柜', false),
  };

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
    cluster,
    views,
    slots,
    slotMesh,
    movers,
    cut,
    casters: [bodyPM.mesh, bodyCutPM.mesh, roomPM.mesh, roomCutPM.mesh, slotMesh.mesh],
    body: bodyPM.mesh,
    hull: hullBox,
    beam: { x: D.xFront + 0.05, y: y(D.headlamp.h) },
    footprint: { length: 4.8, width: 2.1 },
    chase: { dist: 7.6, height: 2.6, look: 0.9 },
    enclosed: 1,
    camp: ['tailgate', 'slideDoor'],
    controls: cp.controls,
    dashPanel,
    jumpers,
    glovebox: { x: D.dash.x0 - 0.06, y: y(0.95), z: 0.4, hx: 0.05, h: 0.06, hz: 0.18 },
    // behind the engine lid at the back
    bay: { engine: { x: -1.84, y: y(0.82), z: -0.05 }, cooling: { x: -2.07, y: y(0.66), z: -0.05 }, battery: { x: -1.87, y: y(0.61), z: -0.42 }, heater: { x: -1.97, y: y(0.82), z: -0.38 } },
    hubs: new WheelHubs(root, spec, vm.body),
  };
}
