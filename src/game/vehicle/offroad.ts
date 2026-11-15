/**
 * T2 — the off-roader 「山羊」: a short, square four-by-four that goes where the others cannot.
 * Spec: specs/vehicles/van_offroad_models.md §2. Model space = vehicle body frame: +x forward,
 * +y up, +z right, origin at the centre of gravity (0.74 m above the ground).
 *
 * Every exterior measure lives in DIM (heights above the ground, h). Meshes: body / body:cut (the
 * bonnet and the side-hinged rear door with its spare wheel ride in body as posed parts), room /
 * room:cut, slots (the drawer kitchen and the roof tent ride in it), glass / glass:cut, windscreen,
 * mirrors, lamps, cab instruments, the goat bell on the mirror, four wheels. Seats only.
 */
import * as THREE from 'three';
import type { VehicleSpec } from '../../core/vehicle/spec';
import { glassMaterial } from '../render/materials';
import { ModelBuilder, type Outline } from './builder';
import { buildCluster, buildLamps, buildMirrors, buildScreen, buildSteering, buildWheels, crossPane, makeSlot, paneGeometry, PoseMesh, sidePane, SlotMesh, turnAbout, vehicleMaterials, WheelHubs, type PosedPart, type Reach, type VehicleParts, type VehicleSlot, type VehicleViewpoint } from './kit';
import { ACCENT, CabParts } from './cabkit';
import { DashPanel } from './dash';
import * as P from './props';
import { archPts, at, band, clamp01, cornerArc, cornerSolid, cushionPts, grow, roofSection, roundRect, type Win } from './shape';

const PAL = P.PAL;

/** all exterior measures (m). x along the body, z across (+ = right), h = height above the ground */
export const DIM = {
  /** body ends and bumpers (the front one carries the winch) */
  xRear: -1.98,
  xFront: 1.98,
  bumperFront: 2.1,
  bumperRear: -2.04,
  /** half width of the body; how far the dark wheel flares stand out */
  halfW: 0.84,
  flare: 0.93,
  skin: 0.025,
  lining: 0.025,
  /** small round vertical corners: a square body */
  corner: 0.07,
  /** bottom of the body (sills), the waist line, the shoulder and the flat roof */
  bottom: 0.46,
  waist: 1.18,
  shoulder: 1.76,
  roof: 1.84,
  roofFlat: 0.74,
  /** inside: floor, the raised cargo floor at the back (behind x), the ceiling */
  floor: 0.42,
  cargo: { x: -1.08, h: 0.62 },
  ceiling: 1.8,
  /** the flat bonnet: from the foot of the glass to the nose, its height; hinge at the back */
  bonnet: { x0: 0.98, h: 1.15, open: 55 },
  /** windscreen: foot and head (x, h), half width */
  glassFoot: { x: 0.94, h: 1.14 },
  glassHead: { x: 0.84, h: 1.74 },
  glassHalf: 0.75,
  /** the dash: from x0 to the glass, its top */
  dash: { x0: 0.62, h: 1.08 },
  /** wheel arches: radius and height of the arc's centre */
  arch: { r: 0.47, centre: 0.4 },
  /** round head lamps in square surrounds on the grille */
  headlamp: { h: 0.96, z: 0.58, r: 0.09 },
  taillamp: { h: 0.86, z: 0.76, tall: 0.24, wide: 0.07 },
  /** front doors (seams only) */
  frontDoor: { x0: -0.12, x1: 0.68, bottom: 0.5, top: 1.74 },
  windows: {
    door: { x0: 0.0, x1: 0.6, h0: 1.24, h1: 1.68 },
    rear: { x0: -1.78, x1: -0.3, h0: 1.26, h1: 1.68 },
  } as Record<string, Win>,
  /** the side-hinged rear door: opening z0 … z1 across the back, h0 … h1; hinge on the right */
  rearDoor: { z0: -0.66, z1: 0.66, h0: 0.56, h1: 1.7, hinge: 0.7, open: 100 },
  rearWindow: { z0: -0.5, z1: 0.42, h0: 1.38, h1: 1.64 },
  spare: { h: 0.98, z: -0.06, r: 0.37 },
  mirror: { x: 0.8, h: 1.36, z: 1.0, tall: 0.15, wide: 0.12 },
} as const;

// paint
const BRICK = 0xa5553f;
const BRICK_LIGHT = 0xb96a52;
const CREAM = 0xece2c8;
const DARK = 0x393d45;
const CHROME = 0xb9c0c4;
const RUBBER = 0x2b2e33;
const SIGNAL = 0xe39a3b;
const MUD = 0x8f7350;
// inside
const LINING = 0xddd1b4;
const CEIL = 0xf2e8d0;
const FLOOR = 0x4b4f55;
const SEAT = 0x5f8a7a;
const SEAT_LIGHT = 0x7fa595;
const DASH = 0x55595f;
const CANVAS = 0xc98a4b;
const CANVAS_LIGHT = 0xe3b16b;
const CANVAS_SEAM = 0xa86a33;

const DEG = Math.PI / 180;
const XAXIS = new THREE.Vector3(1, 0, 0);
const YAXIS = new THREE.Vector3(0, 1, 0);
const ZAXIS = new THREE.Vector3(0, 0, 1);
void XAXIS;

export function buildOffroad(spec: VehicleSpec): VehicleParts {
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
  const zIn = zSkin - D.lining; // 0.79
  const frontAxle = spec.wheelbase * (1 - spec.weightFront);
  const rearAxle = -spec.wheelbase * spec.weightFront;
  const eye = spec.eye;
  const fl = y(D.floor);
  const cf = y(D.cargo.h);

  const hull = new ModelBuilder();
  const hullCut = new ModelBuilder();
  const shell = new ModelBuilder();
  const shellCut = new ModelBuilder();
  const room = new ModelBuilder();
  const roomCut = new ModelBuilder();
  const dashKit = new ModelBuilder();
  const bodyParts: PosedPart[] = [];
  const roomParts: PosedPart[] = [];
  const bodyCutParts: PosedPart[] = [];
  const roomCutParts: PosedPart[] = [];
  const glassCutParts: PosedPart[] = [];
  const glassParts: PosedPart[] = [];

  // ------------------------------------------------------------------ side walls
  const xSideRear = D.xRear + D.corner;
  const xSideFront = D.xFront - D.corner;
  const zC = W - D.corner;
  const yArch = y(D.arch.centre);
  const pillarX = (h: number): number => D.glassFoot.x + 0.03 - ((D.glassFoot.x - D.glassHead.x) * (h - D.glassFoot.h)) / (D.glassHead.h - D.glassFoot.h);
  const sideOutline: Outline = [[xSideRear, y(D.bottom)]];
  sideOutline.push([rearAxle - D.arch.r, y(D.bottom)], ...archPts(rearAxle, D.arch.r, yArch), [rearAxle + D.arch.r, y(D.bottom)]);
  sideOutline.push([frontAxle - D.arch.r, y(D.bottom)], ...archPts(frontAxle, D.arch.r, yArch), [frontAxle + D.arch.r, y(D.bottom)]);
  sideOutline.push([xSideFront, y(D.bottom)], [xSideFront, y(D.bonnet.h - 0.02)], [pillarX(D.bonnet.h), y(D.bonnet.h - 0.02)], [pillarX(D.shoulder), y(D.shoulder)], [xSideRear, y(D.shoulder)]);
  const winOutline = (w: Win, r = 0.05): Outline => roundRect(w.x0, w.x1, y(w.h0), y(w.h1), r);
  const wins = Object.values(D.windows);
  const quarterPts = (d = 0): [number, number][] => [[0.68 - d, 1.24 - d], [pillarX(1.24) - 0.06 + d, 1.24 - d], [pillarX(1.68) - 0.06 + d, 1.68 + d], [0.68 - d, 1.68 + d]];
  const quarterOutline = (d = 0): Outline => quarterPts(d).map(([x, h]) => [x, y(h)]);
  const fd = D.frontDoor;
  const doorTop = D.shoulder - 0.03;
  /** the door's opening (the door with its window rides in it, posed) */
  const doorHole: Outline = [[fd.x0, y(fd.bottom + 0.1)], [fd.x1, y(fd.bottom + 0.1)], [fd.x1, y(doorTop)], [fd.x0, y(doorTop)]];
  const fixedWins = wins.filter((w) => w !== D.windows.door);
  const holes = (): Outline[] => [...fixedWins.map((w) => winOutline(w)), quarterOutline(), doorHole];
  hull.prism('xy', sideOutline, holes(), -W, -zSkin, BRICK);
  hullCut.prism('xy', sideOutline, holes(), zSkin, W, BRICK);
  const liningOutline: Outline = [[D.xRear + 0.05, y(D.floor)], [rearAxle - D.arch.r, y(D.floor)], ...archPts(rearAxle, D.arch.r, yArch).filter(([, yy]) => yy > y(D.floor)), [rearAxle + D.arch.r, y(D.floor)], [frontAxle - D.arch.r, y(D.floor)], ...archPts(frontAxle, D.arch.r, yArch).filter(([x, yy]) => yy > y(D.floor) && x < D.glassFoot.x - 0.02), [D.glassFoot.x - 0.02, y(0.82)], [D.glassFoot.x - 0.02, y(D.glassFoot.h)], [pillarX(D.shoulder) - 0.04, y(D.shoulder)], [D.xRear + 0.05, y(D.shoulder)]];
  room.prism('xy', liningOutline, holes(), -zSkin, -zIn, LINING);
  roomCut.prism('xy', liningOutline, holes(), zIn, zSkin, LINING);

  const paintSide = (b: ModelBuilder, side: number): void => {
    const z0 = side * W;
    // dark flares round the arches, standing out over the tyres
    for (const xa of [rearAxle, frontAxle]) {
      const pts = archPts(xa, D.arch.r + 0.035, yArch, 10);
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        b.hull([[ax, ay, z0 - side * 0.01], [bx, by, z0 - side * 0.01], [ax, ay, side * D.flare], [bx, by, side * D.flare], [ax + (ax - xa) * 0.18, ay + (ay - yArch) * 0.18, z0], [bx + (bx - xa) * 0.18, by + (by - yArch) * 0.18, z0]], DARK);
      }
    }
    // the sill: a dark rocker panel between the arches
    b.span(rearAxle + D.arch.r + 0.03, frontAxle - D.arch.r - 0.03, y(D.bottom), y(0.58), z0, z0 + side * 0.03, DARK);
    // the waist: a pale crease, window frames
    band(b, xSideRear, fd.x0, () => y(D.waist - 0.015), () => y(D.waist + 0.015), z0, side, BRICK_LIGHT, 0.006);
    band(b, fd.x1, pillarX(D.waist), () => y(D.waist - 0.015), () => y(D.waist + 0.015), z0, side, BRICK_LIGHT, 0.006);
    for (const w of fixedWins) b.prism('xy', winOutline(grow(w, 0.03), 0.07), [winOutline(w)], z0, z0 + side * 0.012, DARK);
    b.prism('xy', quarterOutline(0.03), [quarterOutline()], z0, z0 + side * 0.012, DARK);
    b.span(xSideRear, pillarX(D.shoulder), y(D.shoulder) - 0.01, y(D.shoulder) + 0.012, z0, z0 + side * 0.018, DARK); // drip rail
    // the hinges stay on the body
    for (const h of [0.82, 1.08]) b.span(fd.x1 - 0.01, fd.x1 + 0.03, y(h), y(h + 0.08), z0, z0 + side * 0.025, DARK);
    // mud thrown up by the wheels (none on the door: it would hang in the air with the door open)
    for (const xa of [rearAxle, frontAxle]) {
      for (const [dx, dh, s] of [[-0.62, 0.62, 0.05], [-0.66, 0.74, 0.035], [0.6, 0.66, 0.04], [0.66, 0.56, 0.05], [-0.56, 0.86, 0.03]] as [number, number, number][]) {
        if (xa + dx > fd.x0 - 0.05 && xa + dx < fd.x1 + 0.05 && dh > fd.bottom + 0.05) continue;
        b.box(xa + dx, y(dh), z0 + side * 0.006, s * 1.5, s, 0.004, MUD, { rz: dx * 0.6 });
      }
    }
    b.span(xSideRear, xSideFront, y(D.bottom), y(D.bottom + 0.06), z0, z0 + side * 0.004, MUD);
  };
  paintSide(shell, -1);
  paintSide(shellCut, 1);

  // ------------------------------------------------------------------ the nose: grille face, corners, engine bay, bonnet
  {
    const bh = D.bonnet.h;
    hull.prism('zy', [[-zC, y(D.bottom)], [zC, y(D.bottom)], [zC, y(bh - 0.02)], [-zC, y(bh - 0.02)]], [], D.xFront - 0.03, D.xFront, BRICK);
    for (const s of [-1, 1]) {
      hull.hull(cornerSolid(cornerArc(xSideFront, zC, D.corner, 1, s), y(D.bottom), y(bh - 0.02)), BRICK);
      // the A-pillar: a square post up the edge of the glass
      hull.bar(D.glassFoot.x + 0.02, y(D.glassFoot.h - 0.01), s * (D.glassHalf + 0.05), D.glassHead.x + 0.02, y(D.glassHead.h + 0.02), s * (D.glassHalf + 0.05), 0.1, BRICK);
    }
    const xf = D.xFront + 0.004;
    // the grille: a dark panel with four bars; round lamps in cream square surrounds; signals
    shell.span(D.xFront, xf, y(0.7), y(1.08), -0.42, 0.42, DARK);
    for (let i = 0; i < 4; i++) shell.span(xf, xf + 0.012, y(0.75 + i * 0.085), y(0.775 + i * 0.085), -0.4, 0.4, BRICK_LIGHT);
    for (const s of [-1, 1]) {
      shell.span(D.xFront, xf + 0.006, y(D.headlamp.h - 0.13), y(D.headlamp.h + 0.13), s * D.headlamp.z - 0.13, s * D.headlamp.z + 0.13, CREAM);
      shell.cyl(xf + 0.01, y(D.headlamp.h), s * D.headlamp.z, D.headlamp.r + 0.02, 0.02, CHROME, { rz: Math.PI / 2, segments: 16 });
      shell.box(xf + 0.006, y(0.76), s * 0.62, 0.02, 0.06, 0.12, SIGNAL);
    }
    // a goat's head painted small on the nose (our own mark)
    shell.hull([[xf + 0.006, y(1.1), -0.04], [xf + 0.006, y(1.1), 0.04], [xf + 0.006, y(1.06), 0.0], [xf + 0.01, y(1.08), 0.0]], CREAM);
    shell.bar(xf + 0.008, y(1.1), -0.03, xf + 0.008, y(1.13), -0.06, 0.012, CREAM);
    shell.bar(xf + 0.008, y(1.1), 0.03, xf + 0.008, y(1.13), 0.06, 0.012, CREAM);
    // the engine bay under the bonnet: walls, engine, radiator, battery, air box
    shell.span(D.bonnet.x0, D.xFront - 0.03, y(0.6), y(0.62), -0.55, 0.55, RUBBER);
    shell.span(D.bonnet.x0 - 0.02, D.bonnet.x0, y(0.6), y(0.92), -0.55, 0.55, DARK); // firewall, between the wheels
    shell.span(D.bonnet.x0 - 0.02, D.bonnet.x0, y(0.92), y(bh - 0.02), -0.8, 0.8, DARK); // and over them
    shell.span(1.2, 1.7, y(0.62), y(1.0), -0.3, 0.25, 0x4a5058); // engine
    shell.span(1.28, 1.62, y(1.0), y(1.06), -0.22, 0.17, 0x8c3b30); // rocker cover
    shell.span(1.86, 1.94, y(0.66), y(1.08), -0.55, 0.55, 0x3f4650); // radiator
    for (const s of [-1, 1]) {
      // inner wings over the wheels, the outer wing above them
      shell.span(D.bonnet.x0, D.xFront - 0.03, y(0.62), y(0.92), s * 0.55, s * 0.57, DARK);
      shell.span(D.bonnet.x0, D.xFront - 0.03, y(0.9), y(0.92), s * 0.57, s * 0.8, DARK);
      shell.span(D.bonnet.x0, D.xFront - 0.03, y(0.92), y(bh - 0.03), s * 0.78, s * 0.8, BRICK);
    }
    shell.span(1.55, 1.76, y(0.92), y(1.06), 0.36, 0.6, DARK); // battery on the right wing
    shell.span(1.57, 1.74, y(1.06), y(1.07), 0.39, 0.57, PAL.red);
    shell.span(1.56, 1.74, y(0.92), y(1.04), -0.62, -0.38, 0x6a7471); // the cold kit's pre-heater on the left
    shell.cyl(1.25, y(1.0), 0.5, 0.08, 0.14, DARK, { segments: 10 }); // air box
    // the bonnet: a flat panel, a cream stripe, two latches; hinged at the foot of the glass
    const bon = new ModelBuilder();
    bon.span(D.bonnet.x0, D.xFront + 0.005, y(bh - 0.025), y(bh), -W + 0.005, W - 0.005, BRICK);
    bon.span(D.bonnet.x0 + 0.05, D.xFront - 0.04, y(bh), y(bh) + 0.004, -0.16, 0.16, CREAM);
    bon.span(D.bonnet.x0, D.xFront + 0.005, y(bh - 0.03), y(bh - 0.025), -0.76, 0.76, DARK); // its underside
    for (const s of [-1, 1]) bon.box(D.xFront - 0.08, y(bh) + 0.01, s * 0.45, 0.05, 0.02, 0.03, DARK);
    bon.span(1.35, 1.6, y(bh), y(bh) + 0.03, -0.3, -0.06, DARK); // a vent
    bodyParts.push({ mover: 'bonnet', geo: bon.build(), pose: (t) => turnAbout(D.bonnet.x0, y(bh), 0, ZAXIS, D.bonnet.open * DEG * clamp01(t)) });
    // the cowl under the glass and the seal round it
    shell.span(D.glassFoot.x - 0.02, D.bonnet.x0, y(D.glassFoot.h) - 0.01, y(bh), -0.8, 0.8, DARK);
    shell.bar(D.glassHead.x + 0.012, y(D.glassHead.h + 0.003), -D.glassHalf, D.glassHead.x + 0.012, y(D.glassHead.h + 0.003), D.glassHalf, 0.03, RUBBER);
    // the bumper: a deep dark bar with a tow eye; the winch sits on it (slot)
    hull.span(D.xFront, D.bumperFront, y(0.46), y(0.64), -0.88, 0.88, DARK);
    shell.span(D.bumperFront - 0.06, D.bumperFront - 0.02, y(0.42), y(0.46), -0.6, 0.6, DARK);
    for (const s of [-1, 1]) shell.torus(D.bumperFront + 0.02, y(0.5), s * 0.7, 0.04, 0.012, PAL.red, { ry: Math.PI / 2 });
    shell.span(D.bumperFront, D.bumperFront + 0.008, y(0.49), y(0.6), 0.48, 0.8, PAL.paper); // plate, off to one side
    // the snorkel up the right pillar
    shell.bar(1.18, y(1.0), W + 0.05, 1.0, y(1.12), W + 0.06, 0.08, DARK);
    shell.bar(1.0, y(1.12), W + 0.06, D.glassHead.x + 0.03, y(D.roof + 0.12), W - 0.02, 0.075, DARK);
    shell.box(D.glassHead.x + 0.06, y(D.roof + 0.16), W - 0.02, 0.18, 0.1, 0.1, DARK);
  }

  // ------------------------------------------------------------------ the back: face round the door opening, corners
  const rd = D.rearDoor;
  const rdOutline: Outline = roundRect(rd.z0, rd.z1, y(rd.h0), y(rd.h1), 0.04);
  const rwOutline: Outline = roundRect(D.rearWindow.z0, D.rearWindow.z1, y(D.rearWindow.h0), y(D.rearWindow.h1), 0.04);
  const rearSection = (aDeg: number): { x: number; sec: number[][] } => {
    const a = aDeg * DEG;
    const r = D.corner;
    const inset = r * (1 - Math.cos(a));
    return { x: xSideRear - r * Math.sin(a), sec: roofSection(W - inset, y(D.roof - 0.5 * inset), y(D.shoulder), D.roofFlat - inset) };
  };
  {
    const secRear = rearSection(90).sec;
    const outline: Outline = [[-zC, y(D.bottom)], [zC, y(D.bottom)]];
    for (let i = secRear.length - 1; i >= 0; i--) outline.push([secRear[i][0], secRear[i][1]]);
    hull.prism('zy', outline, [rdOutline], D.xRear, D.xRear + 0.03, BRICK);
    for (const s of [-1, 1]) hull.hull(cornerSolid(cornerArc(xSideRear, zC, D.corner, -1, s), y(D.bottom), y(D.shoulder)), BRICK);
    shell.prism('zy', roundRect(rd.z0 - 0.025, rd.z1 + 0.025, y(rd.h0 - 0.025), y(rd.h1 + 0.025), 0.06), [rdOutline], D.xRear - 0.008, D.xRear, DARK);
    hull.span(D.bumperRear, D.xRear, y(0.44), y(0.56), -0.86, 0.86, DARK);
    shell.span(D.bumperRear - 0.03, D.bumperRear, y(0.46), y(0.54), -0.86, -0.7, DARK); // a step at the corner
    // a tow hitch, the jerrycan bracket on the left rear quarter
    shell.span(D.bumperRear - 0.18, D.bumperRear, y(0.44), y(0.5), -0.05, 0.05, DARK);
    shell.sphere(D.bumperRear - 0.18, y(0.53), 0, 0.03, CHROME);
    const jx = -1.62;
    shell.span(jx - 0.12, jx + 0.12, y(0.86), y(0.9), -W - 0.12, -W, DARK);
    shell.span(jx - 0.12, jx + 0.12, y(1.2), y(1.23), -W - 0.12, -W, DARK);
    P.jerrycan(shell, P.place(jx, y(0.9), -W - 0.08, Math.PI / 2), 0x6f7d5b);
  }

  // ------------------------------------------------------------------ the roof: flat, its edges turned down; the ceiling
  {
    const full = roofSection(W, y(D.roof), y(D.shoulder), D.roofFlat);
    const rearLoft = [90, 45, 0].map((a) => {
      const r = rearSection(a);
      return at(r.x, r.sec);
    });
    hullCut.loft(rearLoft, CREAM);
    hullCut.loft([at(xSideRear, full), at(D.glassHead.x + 0.03, full)], CREAM);
    // the header over the glass closes the roof's front
    hullCut.prism('zy', full.map(([z, yy]) => [z, yy] as [number, number]), [], D.glassHead.x, D.glassHead.x + 0.03, CREAM);
    hullCut.span(D.glassHead.x, D.glassHead.x + 0.03, y(D.glassHead.h + 0.01), y(D.shoulder), -W, W, CREAM);
    // the ceiling: flat, with slanted edges, and three ribs
    const inner = (x: number): number[][] => [[x, y(D.shoulder - 0.06), -zIn], [x, y(D.ceiling), -0.66]];
    const innerR = (x: number): number[][] => inner(x).map(([a, b, c]) => [a, b, -c]).reverse();
    const cx0 = D.xRear + 0.05;
    const cx1 = D.glassHead.x - 0.02;
    roomCut.loft([inner(cx0), inner(cx1)], CEIL);
    roomCut.loft([innerR(cx0), innerR(cx1)], CEIL);
    roomCut.span(cx0, cx1, y(D.ceiling), y(D.ceiling) + 0.015, -0.66, 0.66, CEIL);
    for (const x of [-1.3, -0.4]) roomCut.span(x - 0.025, x + 0.025, y(D.ceiling) - 0.012, y(D.ceiling), -0.66, 0.66, PAL.woodLight);
    // a grab rail along each side of the ceiling
    for (const s of [-1, 1]) roomCut.bar(-1.6, y(1.72), s * 0.7, 0.4, y(1.72), s * 0.7, 0.025, DARK);
    // the back wall's lining round the door opening
    const o: Outline = [[-zIn, y(D.cargo.h)], [zIn, y(D.cargo.h)], [zIn, y(D.shoulder - 0.06)], [0.66, y(D.ceiling)], [-0.66, y(D.ceiling)], [-zIn, y(D.shoulder - 0.06)]];
    room.prism('zy', o, [roundRect(rd.z0, rd.z1, y(Math.max(rd.h0, D.cargo.h + 0.01)), y(rd.h1), 0.04)], D.xRear + 0.03, D.xRear + 0.05, LINING);
  }

  // ------------------------------------------------------------------ inside: floors, wheel boxes, tunnel
  {
    const fx0 = frontAxle - 0.46;
    const fx1 = D.glassFoot.x - 0.02;
    const rx0 = D.xRear + 0.05;
    const rx1 = rearAxle + 0.48;
    room.span(rx1, fx0, fl - 0.04, fl, -zIn, zIn, FLOOR);
    room.span(D.cargo.x, rx1, fl - 0.04, fl, -0.5, 0.5, FLOOR);
    room.span(fx0, D.glassFoot.x - 0.02, fl - 0.04, fl, -0.5, 0.5, FLOOR);
    room.span(D.xRear + 0.05, D.cargo.x, cf - 0.03, cf, -0.5, 0.5, PAL.wood); // the cargo floor, wooden slats
    for (let i = 0; i < 5; i++) room.span(D.xRear + 0.05, D.cargo.x, cf, cf + 0.004, -0.42 + i * 0.21, -0.4 + i * 0.21, PAL.woodDark);
    room.span(D.cargo.x - 0.02, D.cargo.x, fl, cf, -0.5, 0.5, PAL.woodDark); // its riser behind the rear seats
    for (const s of [-1, 1]) {
      // front wheel housings in the foot wells, rear ones in the cargo bay
      room.span(fx0, fx1, fl, y(0.86), s * 0.5, s * 0.52, DARK);
      room.span(fx0, fx1, y(0.84), y(0.86), s * 0.52, s * zIn, DARK);
      room.span(fx0 - 0.02, fx0, fl, y(0.86), s * 0.5, s * zIn, DARK);
      room.span(rx0, rx1, fl, y(0.86), s * 0.5, s * 0.52, PAL.woodDark);
      room.span(rx0, rx1, y(0.84), y(0.86), s * 0.52, s * zIn, PAL.woodDark);
      room.span(rx1, rx1 + 0.02, fl, y(0.86), s * 0.5, s * zIn, PAL.woodDark);
      room.span(rx0, rx1, fl, cf, s * 0.5, s * 0.52, PAL.woodDark);
    }
    // the transmission tunnel between the front seats
    room.span(-0.3, D.glassFoot.x - 0.02, fl, fl + 0.16, -0.12, 0.12, RUBBER);
    shell.span(-1.9, 1.9, y(0.3), fl - 0.05, -0.5, 0.5, RUBBER); // underbody
    for (const s of [-1, 1]) shell.span(-1.9, 1.9, y(0.32), y(0.44), s * 0.42, s * 0.5, DARK); // chassis rails
  }

  // ------------------------------------------------------------------ the cab: dash, seats, levers
  const seatX = 0.3;
  const seatH = 0.7 - D.floor;
  {
    const dx0 = D.dash.x0;
    const dx1 = D.glassFoot.x - 0.02;
    room.span(dx0, dx1, y(0.86), y(D.dash.h), -zIn, zIn, DASH);
    room.span(dx0 - 0.02, dx1, y(D.dash.h), y(D.dash.h) + 0.02, -zIn, zIn, 0x3f4349); // a padded top
    room.hull([[dx0 + 0.05, y(0.86), -0.5], [dx0 + 0.05, y(0.86), 0.5], [dx1, y(0.86), -0.5], [dx1, y(0.86), 0.5], [dx1, fl, -0.5], [dx1, fl, 0.5], [dx1 - 0.12, fl, -0.5], [dx1 - 0.12, fl, 0.5]], RUBBER);
    room.span(dx0 - 0.002, dx0, y(0.89), y(1.05), 0.21, 0.67, PAL.dark); // the glovebox's opening (its lid is posed)
    // the passenger's grab handle across the dash
    room.bar(dx0 - 0.06, y(D.dash.h + 0.06), 0.18, dx0 - 0.06, y(D.dash.h + 0.06), 0.62, 0.03, DARK);
    for (const z of [0.18, 0.62]) room.bar(dx0 - 0.06, y(D.dash.h + 0.06), z, dx0 + 0.02, y(D.dash.h + 0.01), z, 0.025, DARK);
    // the inclinometer: a round dial with a weighted pointer, standing on the dash in the middle
    room.span(dx0 + 0.06, dx0 + 0.12, y(D.dash.h) + 0.02, y(D.dash.h) + 0.05, -0.06, 0.06, DARK);
    room.cyl(dx0 + 0.09, y(D.dash.h + 0.11), 0, 0.065, 0.04, DARK, { rz: Math.PI / 2, segments: 16 });
    room.cyl(dx0 + 0.068, y(D.dash.h + 0.11), 0, 0.055, 0.004, PAL.paper, { rz: Math.PI / 2, segments: 16 });
    room.span(dx0 + 0.064, dx0 + 0.066, y(D.dash.h + 0.07), y(D.dash.h + 0.075), -0.045, 0.045, PAL.red); // the red sector
    room.bar(dx0 + 0.062, y(D.dash.h + 0.11), 0, dx0 + 0.062, y(D.dash.h + 0.065), 0.0, 0.006, DARK);
    // switches, pedals, gear and transfer levers on the tunnel, the hand brake
    for (const [z, wd] of [[-0.48, 0.06], [-0.36, 0.08], [-0.24, 0.06]] as [number, number][]) room.box(0.8, y(0.55), z, 0.03, 0.1, wd, DARK, { rz: 0.6 });
    room.bar(0.42, fl + 0.16, 0.06, 0.37, y(0.88), 0.08, 0.018, PAL.metal);
    room.sphere(0.37, y(0.9), 0.08, 0.028, PAL.red);
    room.span(0.5, 0.64, fl, y(0.62), -0.12, -0.02, DARK); // the handbrake's console
    // sun visors, the centre mirror
    room.box(0.78, y(1.68), 0, 0.03, 0.065, 0.22, DARK);
    room.bar(0.79, y(1.71), 0, 0.8, y(1.78), 0, 0.02, DARK);
    // the four seats: two front buckets, two rear seats a little higher
    for (const s of [-1, 1]) P.armchair(room, P.place(seatX, fl, s * 0.36), { seatH, width: 0.44, cover: SEAT, pocket: 0x4e7568, arms: false });
    for (const s of [-1, 1]) {
      const z0 = s < 0 ? -0.6 : 0.12;
      const z1 = s < 0 ? -0.12 : 0.6;
      room.span(-0.94, -0.5, fl, y(0.62), Math.max(z0 + 0.02, -0.52), Math.min(z1 - 0.02, 0.52), DARK);
      room.hull(cushionPts(-0.98, -0.5, y(0.62), y(0.76), z0, z1, 0.03), SEAT);
      room.hull(cushionPts(-1.07, -0.97, y(0.7), y(1.36), z0 + 0.01, z1 - 0.01, 0.025), SEAT);
      room.span(-1.04, -0.99, y(1.38), y(1.52), (z0 + z1) / 2 - 0.12, (z0 + z1) / 2 + 0.12, SEAT_LIGHT); // head rest
      room.bar(-1.02, y(1.36), (z0 + z1) / 2 - 0.08, -1.02, y(1.38), (z0 + z1) / 2 - 0.08, 0.015, DARK);
      room.bar(-1.02, y(1.36), (z0 + z1) / 2 + 0.08, -1.02, y(1.38), (z0 + z1) / 2 + 0.08, 0.015, DARK);
    }
    P.pillow(room, P.place(-0.74, y(0.76), 0.36, 0.3), 0.16, 0.12, 0.22, PAL.mustard);
    // window trims (the door's own is on the door)
    for (const [side, b] of [[-1, room], [1, roomCut]] as [number, ModelBuilder][]) {
      for (const w of fixedWins) b.prism('xy', winOutline(grow(w, 0.025), 0.07), [winOutline(w)], side * zIn, side * (zIn - 0.01), 0x8a8578);
      b.prism('xy', quarterOutline(0.025), [quarterOutline()], side * zIn, side * (zIn - 0.01), 0x8a8578);
    }
  }

  // ------------------------------------------------------------------ steering wheel, column, gauges
  const tilt = 0.62; // the wheel stands up: an upright seat, a thick rim
  const wheelC = new THREE.Vector3(0.62, y(1.1), eye.z);
  const steeringWheel = buildSteering(root, wheelC, { tilt, radius: 0.19, grip: 0.04, rim: 0x2f3338, hub: DASH, spokes: 'Y', cabin: true, marker: PAL.mustard });
  dashKit.bar(wheelC.x + 0.04 * Math.cos(tilt), wheelC.y - 0.04 * Math.sin(tilt), eye.z, D.glassFoot.x - 0.03, wheelC.y - (D.glassFoot.x - 0.03 - wheelC.x) * Math.tan(tilt), eye.z, 0.05, DARK);
  const gauge = { x: 0.79, h: 1.15 };
  {
    const zc = eye.z;
    dashKit.span(gauge.x - 0.02, D.glassFoot.x - 0.04, y(D.dash.h - 0.04), y(gauge.h + 0.07), zc - 0.16, zc + 0.16, DASH);
    dashKit.span(gauge.x - 0.035, gauge.x + 0.08, y(gauge.h + 0.07), y(gauge.h + 0.085), zc - 0.17, zc + 0.17, 0x3f4349); // the hood
    dashKit.span(gauge.x - 0.022, gauge.x - 0.02, y(gauge.h - 0.06), y(gauge.h + 0.065), zc - 0.15, zc + 0.15, 0x23262b);
  }
  const { dialGlow, speedNeedle, fuelNeedle } = buildCluster(root, new THREE.Vector3(gauge.x - 0.025, y(gauge.h), eye.z), 0.2, 0.26);
  // the live strip (rev counter, temperature, battery, lamps, P R N D) on top of the binnacle's hood, over the rim
  const strip = { x: gauge.x - 0.005, h: gauge.h + 0.12, z: eye.z, w: 0.26 };
  dashKit.span(strip.x + 0.002, strip.x + 0.05, y(strip.h - 0.03), y(strip.h + 0.022), strip.z - strip.w / 2 - 0.01, strip.z + strip.w / 2 + 0.01, 0x3f4349);

  // ------------------------------------------------------------------ things to operate (their meaning is in controls.ts)
  const cp = new CabParts(y);
  const DRIVER: Reach[] = ['driver'];
  const FRONT: Reach[] = ['driver', 'passenger'];
  const jump = new ModelBuilder();
  {
    const dx0 = D.dash.x0;
    cp.key(room, new THREE.Vector3(dx0 - 0.005, y(0.98), -0.12), new THREE.Vector3(-1, 0, 0), DRIVER);
    cp.stick('selector', new THREE.Vector3(0.53, fl + 0.16, 0.0), new THREE.Vector3(0.46, y(0.99), 0.0), -0.2, 0.2, FRONT, PAL.metal);
    cp.handbrake(room, new THREE.Vector3(0.6, y(0.64), -0.07), new THREE.Vector3(0.34, y(0.72), -0.07), DRIVER);
    cp.knob('lights', new THREE.Vector3(dx0 - 0.005, y(0.99), -0.62), DRIVER, 4);
    cp.knob('wipers', new THREE.Vector3(dx0 - 0.005, y(0.99), -0.72), DRIVER, 4);
    cp.button('hazard', new THREE.Vector3(dx0 - 0.005, y(0.97), 0.1), FRONT, PAL.red);
    cp.point('horn', 0.62, y(1.1), eye.z, 0.06, DRIVER);
    const rd = new THREE.Vector3(0.76, y(D.dash.h) + 0.02, 0.4);
    cp.radioBuddy(room, P.place(rd.x, rd.y, rd.z, Math.atan2(rd.z - eye.z, eye.x - rd.x)), FRONT);
    cp.lid('glovebox', new THREE.Vector3(dx0 - 0.005, y(0.895), 0.21), new THREE.Vector3(dx0, y(1.045), 0.67), ['passenger'], PAL.woodDark);
    for (const [id, sd, from] of [['visorL', -1, DRIVER], ['visorR', 1, ['passenger'] as Reach[]]] as [string, number, Reach[]][]) cp.visor(id, room, 0.84, y(1.765), sd * 0.08, sd * 0.66, 0.14, from, 0x8d8a80);
    cp.point('cabinLamp', -0.4, y(D.ceiling) - 0.03, 0, 0.1, ['seated']);
    // the cabin lamp has a switch on the header for the front seats too
    room.span(0.82, 0.86, y(1.74), y(1.77), 0.1, 0.2, 0x3f4349);
    room.span(0.815, 0.82, y(1.745), y(1.765), 0.13, 0.17, ACCENT);
    cp.point('cabinLamp@front', 0.815, y(1.755), 0.15, 0.05, FRONT);
    // things on the dash that hop on a bump: a mug, a compass, a notebook
    P.mug(jump, P.place(0.74, y(D.dash.h) + 0.02, 0.66), PAL.red);
    jump.cyl(0.7, y(D.dash.h) + 0.035, -0.2, 0.035, 0.03, DARK, { segments: 10 });
    jump.cyl(0.7, y(D.dash.h) + 0.051, -0.2, 0.028, 0.004, PAL.paper, { segments: 10 });
    jump.span(0.68, 0.82, y(D.dash.h) + 0.02, y(D.dash.h) + 0.035, 0.12, 0.24, PAL.mustard);
  }

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
  const BACK = Math.PI; // a fixture in the cargo bay facing the rear door
  const bayX0 = D.xRear + 0.06;
  const bayX1 = D.cargo.x - 0.04;
  const bayMid = (bayX0 + bayX1) / 2;
  const drawerTop = 0.9;
  const drawerOut = 0.9;
  slot('kitchen', 'stove', '抽屉厨房', true,
    (b) => P.slotFrame(b, P.place(bayMid, cf, 0, BACK), 'stove', bayX1 - bayX0, 0.98, drawerTop - D.cargo.h),
    (b) => {
      // the carcase: sides and a top board the cooler and the boxes stand on
      for (const s of [-1, 1]) b.span(bayX0, bayX1, cf, y(drawerTop), s * 0.47, s * 0.5, PAL.woodDark);
      b.span(bayX0, bayX1, y(drawerTop - 0.02), y(drawerTop), -0.5, 0.5, PAL.wood);
      b.span(bayX1 - 0.02, bayX1, cf, y(drawerTop - 0.02), -0.47, 0.47, PAL.woodDark);
    }, false, [{
      mover: 'drawer',
      build: (b) => {
        const x0 = bayX0 - 0.02;
        const x1 = bayX1 - 0.04;
        const top = drawerTop - 0.03;
        b.span(x0, x1, cf + 0.01, y(top - 0.02), -0.45, 0.45, PAL.wood);
        b.span(x0 - 0.02, x0, cf + 0.01, y(top), -0.46, 0.46, PAL.tealSoft); // the drawer front
        b.box(x0 - 0.03, y(top - 0.12), 0, 0.02, 0.025, 0.2, PAL.steel);
        // a two-burner hob and a cutting board on top
        b.span(x0 + 0.04, x0 + 0.38, y(top - 0.02), y(top), -0.42, 0.02, PAL.cream);
        for (const z of [-0.3, -0.1]) b.cyl(x0 + 0.21, y(top) + 0.004, z, 0.065, 0.01, DARK, { segments: 12 });
        b.span(x0 + 0.42, x1 - 0.06, y(top - 0.02), y(top), 0.06, 0.42, PAL.woodLight);
        P.kettle(b, P.place(x0 + 0.21, y(top) + 0.01, -0.3, 0.4), PAL.orange);
        for (let i = 0; i < 3; i++) b.cyl(x0 + 0.5 + i * 0.06, y(top) + 0.04, 0.36, 0.02, 0.08, [PAL.red, PAL.green, PAL.mustard][i], { segments: 6 });
      },
      pose: (t) => new THREE.Matrix4().makeTranslation(-drawerOut * clamp01(t), 0, 0),
    }, {
      // a fold-down leg under the drawer's end, only when it is all the way out
      mover: 'drawer',
      build: (b) => {
        const x = bayX0 - drawerOut + 0.02;
        for (const z of [-0.4, 0.4]) b.span(x - 0.02, x + 0.02, y(0.02), cf + 0.01, z - 0.02, z + 0.02, PAL.steel);
      },
      pose: (t) => (t > 0.98 ? new THREE.Matrix4() : null),
    }]);
  slot('cooler', 'cooler', '冷藏箱', false,
    (b) => P.slotFrame(b, P.place(bayMid, y(drawerTop), 0.27, BACK), 'cooler', bayX1 - bayX0, 0.44, 0.4),
    (b) => {
      const x0 = bayX0 + 0.04;
      const x1 = bayX1 - 0.06;
      b.hull(cushionPts(x0, x1, y(drawerTop), y(drawerTop + 0.36), 0.06, 0.48, 0.03), 0x7fb5c8);
      b.span(x0 - 0.005, x1 + 0.005, y(drawerTop + 0.3), y(drawerTop + 0.32), 0.055, 0.485, CREAM); // lid seam
      for (const z of [0.12, 0.42]) b.span(x0 - 0.02, x0, y(drawerTop + 0.2), y(drawerTop + 0.24), z - 0.04, z + 0.04, CREAM);
      b.box(x0 - 0.01, y(drawerTop + 0.27), 0.27, 0.02, 0.03, 0.08, PAL.steel);
    });
  slot('storage', 'storage', '储物', true,
    (b) => P.slotFrame(b, P.place(bayMid, y(drawerTop), -0.27, BACK), 'storage', bayX1 - bayX0, 0.44, 0.42),
    (b) => {
      P.crate(b, P.place(bayMid, y(drawerTop), -0.27, 0), bayX1 - bayX0 - 0.06, 0.24, 0.42, PAL.woodLight);
      P.crate(b, P.place(bayMid + 0.05, y(drawerTop + 0.24), -0.3, 0.15), 0.4, 0.16, 0.3, 0x6f7d5b);
      P.blanketRoll(b, P.place(bayMid - 0.18, y(drawerTop + 0.24), -0.2, 0), 0.3, PAL.red);
      // a cargo net over them, hooked to the side ledge
      for (const x of [bayX0 + 0.06, bayMid, bayX1 - 0.06]) b.bar(x, y(drawerTop + 0.42), -0.06, x, y(drawerTop + 0.1), -0.5, 0.008, PAL.rope);
      b.bar(bayX0 + 0.06, y(drawerTop + 0.42), -0.06, bayX1 - 0.06, y(drawerTop + 0.42), -0.06, 0.008, PAL.rope);
      // and stuff on the ledge over the left wheel box
      P.jerrycan(b, P.place(-1.5, y(0.86), -0.66, Math.PI / 2), PAL.red);
    });
  const roofY = y(D.roof);
  const rackTop = roofY + 0.12;
  const tent = { x0: -1.78, x1: -0.38, z0: -0.6, z1: 0.62, fold: 1.22, h: 0.95 };
  slot('roofRack', 'roof', '行李架', true,
    (b) => P.slotPad(b, P.place(-0.5, roofY, 0, 0), 'roof', 2.4, 1.3),
    (b) => {
      const x0 = -1.82;
      const x1 = 0.74;
      // a flat platform: a frame on six feet and slats across
      for (const s of [-1, 1]) {
        b.span(x0, x1, rackTop - 0.04, rackTop, s * 0.68, s * 0.72, DARK);
        for (const x of [x0 + 0.05, (x0 + x1) / 2, x1 - 0.05]) b.span(x - 0.025, x + 0.025, roofY, rackTop, s * 0.66, s * 0.72, DARK);
      }
      for (const x of [x0, x1]) b.span(x - 0.02, x + 0.02, rackTop - 0.04, rackTop, -0.72, 0.72, DARK);
      for (let i = 1; i < 9; i++) b.span(x0 + (i * (x1 - x0)) / 9 - 0.02, x0 + (i * (x1 - x0)) / 9 + 0.02, rackTop - 0.035, rackTop - 0.01, -0.7, 0.7, DARK);
      // a light bar over the windscreen, sand ladders and a spade at the front
      b.span(x1 - 0.06, x1 - 0.02, rackTop, rackTop + 0.1, -0.5, 0.5, DARK);
      for (const z of [-0.3, 0.0, 0.3]) b.cyl(x1 - 0.015, rackTop + 0.05, z, 0.04, 0.02, 0xf2ead2, { rz: Math.PI / 2, segments: 10 });
      for (const z of [-0.5, 0.2]) {
        b.span(-0.3, 0.62, rackTop, rackTop + 0.03, z, z + 0.3, PAL.orange);
        for (let i = 0; i < 6; i++) b.span(-0.26 + i * 0.15, -0.2 + i * 0.15, rackTop + 0.03, rackTop + 0.045, z + 0.03, z + 0.27, 0xb86a2c);
      }
      b.bar(-0.3, rackTop + 0.06, 0.6, 0.6, rackTop + 0.06, 0.6, 0.025, PAL.woodDark); // the spade's handle
      b.span(-0.45, -0.3, rackTop + 0.03, rackTop + 0.08, 0.53, 0.67, PAL.steel);
    }, true);
  slot('roofTent', 'roof', '车顶帐', false,
    (b) => P.slotPad(b, P.place((tent.x0 + tent.x1) / 2, rackTop, 0, 0), 'roof', tent.x1 - tent.x0, 1.1),
    (b) => {
      // the mounting rails (it stands on these whether the rack is fitted or not)
      for (const x of [tent.x0 + 0.15, tent.x1 - 0.15]) b.span(x - 0.03, x + 0.03, roofY, rackTop, tent.z0, tent.z1, DARK);
    }, true, [{
      mover: 'tent',
      // folded: a hard shell box with a cover strap and a handle for the ladder
      build: (b) => {
        b.hull(cushionPts(tent.x0, tent.x1, rackTop, rackTop + 0.3, tent.z0, tent.z1, 0.05), 0x4b4f55);
        b.span(tent.x0 + 0.02, tent.x1 - 0.02, rackTop + 0.12, rackTop + 0.16, tent.z0 - 0.005, tent.z1 + 0.005, CANVAS);
        b.span(tent.x0 + 0.3, tent.x0 + 0.34, rackTop + 0.02, rackTop + 0.3, tent.z1, tent.z1 + 0.01, CANVAS_LIGHT);
        b.span(tent.x1 - 0.34, tent.x1 - 0.3, rackTop + 0.02, rackTop + 0.3, tent.z1, tent.z1 + 0.01, CANVAS_LIGHT);
      },
      pose: (t) => (t < 0.5 ? new THREE.Matrix4() : null),
    }, {
      mover: 'tent',
      // open: the floor folded out to the right, a canvas room over both halves, a ladder down
      build: (b) => {
        const z0 = tent.z0;
        const z1 = tent.z1 + tent.fold;
        const base = rackTop;
        b.span(tent.x0, tent.x1, base, base + 0.06, z0, tent.z1, 0x4b4f55);
        b.span(tent.x0, tent.x1, base, base + 0.06, tent.z1, z1, 0x4b4f55);
        b.hull(cushionPts(tent.x0 + 0.04, tent.x1 - 0.04, base + 0.06, base + 0.14, z0 + 0.04, z1 - 0.04, 0.03), PAL.cream); // mattress
        P.pillow(b, P.place(tent.x0 + 0.3, base + 0.14, 0.15, 0), 0.22, 0.09, 0.4, PAL.paper);
        P.pillow(b, P.place(tent.x0 + 0.3, base + 0.14, 0.65, 0), 0.22, 0.09, 0.4, PAL.sky);
        b.span(tent.x0 + 0.6, tent.x1 - 0.06, base + 0.14, base + 0.17, z0 + 0.06, 0.45, PAL.red); // a sleeping bag
        // the canvas: a ridge along x over the middle, walls down to the floor at both sides
        // the canvas section at x: it sags (lower, a little in) halfway between the two bows
        const sec = (x: number): number[][] => {
          const f = Math.sin(((x - tent.x0) / (tent.x1 - tent.x0)) * Math.PI);
          const sag = 0.06 * f;
          return [[x, base + 0.06, z0 + 0.02 * f], [x, base + 0.7 - sag * 0.6, z0 + 0.03 * f], [x, base + tent.h - sag, (z0 + z1) / 2], [x, base + 0.7 - sag * 0.6, z1 - 0.03 * f]];
        };
        b.cyl((tent.x0 + tent.x1) / 2, base + 0.66, z1 + 0.03, 0.055, tent.x1 - tent.x0 - 0.1, CANVAS_LIGHT, { rz: Math.PI / 2, segments: 8 }); // the door, rolled up
        for (const x of [tent.x0 + 0.02, tent.x1 - 0.02]) b.bar(x, base + 0.06, z1, x, base + 0.7, z1, 0.02, DARK); // its corner poles
        const xs = [0, 0.25, 0.5, 0.75, 1].map((f) => tent.x0 + (tent.x1 - tent.x0) * f);
        b.loft(xs.map((x) => sec(x)), CANVAS);
        // seams: a darker strip along the ridge and down the middle, piping along the eaves
        for (let i = 0; i + 1 < xs.length; i++) {
          const a = sec(xs[i]);
          const c = sec(xs[i + 1]);
          b.bar(a[2][0], a[2][1] + 0.012, a[2][2], c[2][0], c[2][1] + 0.012, c[2][2], 0.025, CANVAS_SEAM);
          b.bar(a[1][0], a[1][1] + 0.006, a[1][2] - 0.006, c[1][0], c[1][1] + 0.006, c[1][2] - 0.006, 0.02, CANVAS_SEAM);
          b.bar(a[3][0], a[3][1] + 0.006, a[3][2] + 0.006, c[3][0], c[3][1] + 0.006, c[3][2] + 0.006, 0.02, CANVAS_SEAM);
        }
        // guy lines from the eaves out to pegs on the roof rack and the ladder side
        for (const x of [tent.x0 + 0.05, tent.x1 - 0.05]) {
          b.bar(x, base + 0.68, z0, x - (x < (tent.x0 + tent.x1) / 2 ? 0.25 : -0.25), base + 0.02, z0 + 0.1, 0.008, PAL.rope);
          b.bar(x, base + 0.68, z1, x - (x < (tent.x0 + tent.x1) / 2 ? 0.25 : -0.25), base + 0.04, z1 - 0.15, 0.008, PAL.rope);
        }
        // a window in the back end with its flap rolled up over it, and a rain fly's peak
        b.prism('zy', roundRect(z0 + 0.5, z0 + 1.1, base + 0.32, base + 0.62, 0.05), [], tent.x0 - 0.015, tent.x0 - 0.011, 0x6a7a6a);
        b.cyl(tent.x0 - 0.03, base + 0.66, z0 + 0.8, 0.035, 0.62, CANVAS_SEAM, { rx: Math.PI / 2, segments: 8 });
        // the back end closed, the front end with its flap rolled up over a big opening
        const end: Outline = [[z0, base + 0.06], [z1, base + 0.06], [z1, base + 0.7], [(z0 + z1) / 2, base + tent.h], [z0, base + 0.7]];
        b.prism('zy', end, [], tent.x0 - 0.01, tent.x0 + 0.01, CANVAS_LIGHT);
        b.prism('zy', end, [roundRect(z0 + 0.18, z1 - 0.18, base + 0.2, base + 0.72, 0.08)], tent.x1 - 0.01, tent.x1 + 0.01, CANVAS_LIGHT);
        b.cyl(tent.x1 + 0.04, base + 0.76, (z0 + z1) / 2, 0.05, z1 - z0 - 0.4, CANVAS, { rx: Math.PI / 2, segments: 8 });
        // the bows that hold it up and the stays out to the corners
        for (const x of [tent.x0 + 0.02, tent.x1 - 0.02]) {
          b.bar(x, base + 0.7, z1 + 0.01, x, base + tent.h + 0.005, (z0 + z1) / 2, 0.02, DARK);
          b.bar(x, base + 0.7, z0 - 0.01, x, base + tent.h + 0.005, (z0 + z1) / 2, 0.02, DARK);
        }
        // the ladder from the folded-out edge down to the ground
        const zl0 = z1 - 0.04;
        const zl1 = z1 + 0.42;
        const gy = y(0.0);
        for (const x of [-1.32, -0.88]) b.bar(x, base, zl0, x, gy + 0.02, zl1, 0.035, PAL.steel);
        for (let i = 1; i < 7; i++) {
          const f = i / 7;
          b.bar(-1.32, base + (gy - base) * f, zl0 + (zl1 - zl0) * f, -0.88, base + (gy - base) * f, zl0 + (zl1 - zl0) * f, 0.03, PAL.steel);
        }
      },
      pose: (t) => (t >= 0.5 ? new THREE.Matrix4() : null),
    }]);
  slot('winch', 'winch', '绞盘', false,
    (b) => P.slotFrame(b, P.place(D.bumperFront + 0.025, y(0.66), 0, 0), 'winch', 0.04, 0.5, 0.22, { wall: true, card: 0.1 }),
    (b) => {
      const x = D.bumperFront + 0.06;
      b.cyl(x, y(0.72), 0, 0.075, 0.42, DARK, { rx: Math.PI / 2, segments: 12 });
      b.cyl(x, y(0.72), 0, 0.082, 0.34, 0x8a8f94, { rx: Math.PI / 2, segments: 12 }); // the wound cable
      for (const s of [-1, 1]) b.span(x - 0.08, x + 0.08, y(0.64), y(0.82), s * 0.21 - 0.02, s * 0.21 + 0.02, DARK);
      b.span(D.bumperFront, x + 0.09, y(0.63), y(0.65), -0.24, 0.24, DARK);
      b.span(x + 0.08, x + 0.1, y(0.66), y(0.78), -0.08, 0.08, CHROME); // fairlead
      b.torus(x + 0.12, y(0.66), 0, 0.03, 0.01, PAL.red, { ry: Math.PI / 2 });
    });

  // ------------------------------------------------------------------ outside: mirrors
  for (const s of [-1, 1]) {
    const m = D.mirror;
    shell.bar(0.72, y(1.2), s * (W + 0.005), m.x, y(m.h - m.tall / 2 + 0.02), s * (m.z - 0.04), 0.025, DARK);
    shell.span(m.x, m.x + 0.04, y(m.h - m.tall / 2), y(m.h + m.tall / 2), s * m.z - m.wide / 2, s * m.z + m.wide / 2, DARK);
  }

  // ------------------------------------------------------------------ the rear door, with the spare wheel on it
  const rdPose = (t: number): THREE.Matrix4 => turnAbout(D.xRear, 0, rd.hinge, YAXIS, rd.open * DEG * clamp01(t));
  {
    const out = new ModelBuilder();
    out.prism('zy', rdOutline, [rwOutline], D.xRear - 0.005, D.xRear + 0.02, BRICK);
    out.prism('zy', roundRect(D.rearWindow.z0 - 0.025, D.rearWindow.z1 + 0.025, y(D.rearWindow.h0 - 0.025), y(D.rearWindow.h1 + 0.025), 0.06), [rwOutline], D.xRear - 0.012, D.xRear - 0.005, DARK);
    for (const h of [0.72, 1.5]) out.span(D.xRear - 0.03, D.xRear, y(h), y(h + 0.07), rd.z1 - 0.04, rd.z1 + 0.04, DARK); // hinges
    out.box(D.xRear - 0.02, y(1.2), rd.z0 + 0.1, 0.03, 0.12, 0.03, DARK); // handle
    // the spare on its carrier
    const sp = D.spare;
    out.span(D.xRear - 0.1, D.xRear - 0.005, y(sp.h - 0.04), y(sp.h + 0.04), sp.z - 0.25, sp.z + 0.25, DARK);
    out.cyl(D.xRear - 0.16, y(sp.h), sp.z, sp.r, 0.25, RUBBER, { rz: Math.PI / 2, segments: 20 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      out.box(D.xRear - 0.16, y(sp.h) + Math.sin(a) * (sp.r + 0.004), sp.z + Math.cos(a) * (sp.r + 0.004), 0.22, 0.035, 0.05, RUBBER, { rx: a });
    }
    out.cyl(D.xRear - 0.165, y(sp.h), sp.z, sp.r * 0.6, 0.26, CREAM, { rz: Math.PI / 2, segments: 14 });
    out.cyl(D.xRear - 0.17, y(sp.h), sp.z, sp.r * 0.2, 0.28, CHROME, { rz: Math.PI / 2, segments: 8 });
    out.cyl(D.xRear - 0.295, y(sp.h), sp.z, sp.r * 0.75, 0.01, DARK, { rz: Math.PI / 2, segments: 14 }); // a cover band
    bodyParts.push({ mover: 'rearDoor', geo: out.build(), pose: rdPose });
    const inn = new ModelBuilder();
    inn.prism('zy', rdOutline, [rwOutline], D.xRear + 0.02, D.xRear + 0.035, 0x8a8578);
    inn.box(D.xRear + 0.045, y(1.2), rd.z0 + 0.12, 0.02, 0.1, 0.025, PAL.steel);
    roomParts.push({ mover: 'rearDoor', geo: inn.build(), pose: rdPose });
    glassParts.push({ mover: 'rearDoor', geo: paneGeometry([crossPane(D.xRear + 0.008, y(D.rearWindow.h0), y(D.rearWindow.h1), D.rearWindow.z0, D.rearWindow.z1)]), pose: rdPose });
  }

  // ------------------------------------------------------------------ the doors: hinged at the front, each with a window that winds down
  {
    const dw = D.windows.door;
    const W_DROP = dw.h1 - dw.h0;
    for (const side of [-1, 1]) {
      const L = side < 0 ? 'L' : 'R';
      const door = `door${L}`;
      const win = `window${L}`;
      const hinge = (t: number): THREE.Matrix4 => turnAbout(fd.x1, 0, side * W, YAXIS, side * 75 * DEG * clamp01(t));
      const outline: Outline = [[fd.x0 + 0.006, y(fd.bottom + 0.1) + 0.006], [fd.x1 - 0.004, y(fd.bottom + 0.1) + 0.006], [fd.x1 - 0.004, y(doorTop) - 0.006], [fd.x0 + 0.006, y(doorTop) - 0.006]];
      const hole = winOutline(dw);
      const out = new ModelBuilder();
      const zo = side * W;
      out.prism('xy', outline, [hole], side * zSkin, zo, BRICK);
      out.span(fd.x0 + 0.006, fd.x1 - 0.004, y(D.waist - 0.015), y(D.waist + 0.015), zo, zo + side * 0.006, BRICK_LIGHT);
      out.prism('xy', winOutline(grow(dw, 0.03), 0.07), [hole], zo, zo + side * 0.012, DARK);
      out.box(fd.x0 + 0.14, y(1.15), zo + side * 0.02, 0.13, 0.03, 0.03, ACCENT);
      (side < 0 ? bodyParts : bodyCutParts).push({ mover: door, geo: out.build(), pose: hinge });
      const inn = new ModelBuilder();
      inn.prism('xy', outline, [hole], side * zIn, side * zSkin, LINING);
      inn.span(fd.x0 + 0.04, fd.x1 - 0.06, y(0.62), y(1.18), side * (zIn - 0.012), side * zIn, 0x8a8578);
      inn.span(fd.x0 + 0.1, fd.x1 - 0.15, y(0.64), y(0.8), side * (zIn - 0.05), side * zIn, 0x6f6b60); // a map pocket
      inn.prism('xy', winOutline(grow(dw, 0.025), 0.07), [hole], side * zIn, side * (zIn - 0.01), 0x8a8578);
      inn.box(fd.x0 + 0.12, y(1.08), side * (zIn - 0.035), 0.12, 0.025, 0.03, ACCENT); // the pull
      (side < 0 ? roomParts : roomCutParts).push({ mover: door, geo: inn.build(), pose: hinge });
      const crankAt = new THREE.Vector3(fd.x0 + 0.4, y(0.98), side * (zIn - 0.02));
      const crank = new ModelBuilder();
      crank.cyl(crankAt.x, crankAt.y, crankAt.z, 0.022, 0.03, DARK, { rx: Math.PI / 2, segments: 8 });
      crank.bar(crankAt.x, crankAt.y, crankAt.z - side * 0.02, crankAt.x + 0.08, crankAt.y, crankAt.z - side * 0.02, 0.018, PAL.steel);
      crank.cyl(crankAt.x + 0.08, crankAt.y, crankAt.z - side * 0.045, 0.014, 0.04, ACCENT, { rx: Math.PI / 2, segments: 8 });
      (side < 0 ? roomParts : roomCutParts).push({ mover: win, follows: [door], geo: crank.build(), pose: (t, all) => hinge(all[door] ?? 0).multiply(turnAbout(crankAt.x, crankAt.y, crankAt.z, ZAXIS, -side * Math.PI * 3 * clamp01(t))) });
      const zg = side * (zSkin - 0.012);
      (side < 0 ? glassParts : glassCutParts).push({ mover: win, follows: [door], geo: paneGeometry([sidePane(dw.x0, dw.x1, y(dw.h0), y(dw.h1), zg)]), pose: (t, all) => hinge(all[door] ?? 0).multiply(new THREE.Matrix4().makeTranslation(0, -W_DROP * 0.97 * clamp01(t), 0)) });
      const fromIn: Reach[] = side < 0 ? ['driver'] : ['passenger'];
      cp.point(door, fd.x0 + 0.12, y(1.08), side * (zIn - 0.04), 0.06, fromIn);
      cp.point(`${door}@out`, fd.x0 + 0.14, y(1.15), side * (W + 0.03), 0.07, ['outside']);
      cp.point(win, crankAt.x + 0.04, crankAt.y, crankAt.z - side * 0.03, 0.06, fromIn);
      cp.movers.push([door, '车门'], [win, '车窗']);
    }
    cp.point('rearDoor@out', D.xRear - 0.03, y(1.2), D.rearDoor.z0 + 0.1, 0.08, ['outside']);
    cp.point('bonnet@out', D.xFront + 0.02, y(D.bonnet.h - 0.04), 0.3, 0.1, ['outside']);
    cp.point('drawer@out', D.xRear - 0.05, y(0.78), 0.0, 0.1, ['outside'], 'rearDoor');
  }

  // ------------------------------------------------------------------ meshes
  const vm = vehicleMaterials();
  const hullGeo = hull.build();
  const hullCutGeo = hullCut.build();
  const hullBox = hullGeo.boundingBox!.clone().union(hullCutGeo.boundingBox!);
  shell.add(hullGeo);
  shellCut.add(hullCutGeo);
  const posedMeshes: PoseMesh[] = [];
  const posed = (base: THREE.BufferGeometry, parts: PosedPart[], mat: THREE.Material, name: string, parent: THREE.Object3D): PoseMesh => {
    const pm = new PoseMesh(base, parts, mat, name);
    parent.add(pm.mesh);
    posedMeshes.push(pm);
    return pm;
  };
  const bodyPM = posed(shell.build(), bodyParts, vm.body, 'body', root);
  const bodyCutPM = posed(shellCut.build(), bodyCutParts, vm.body, 'body:cut', cut);
  roomParts.push(...cp.room);
  const roomPM = posed(room.build(), roomParts, vm.cabin, 'room', root);
  const roomCutPM = posed(roomCut.build(), roomCutParts, vm.cabin, 'room:cut', cut);
  const cluster = new THREE.Group();
  cluster.name = 'cluster';
  root.add(cluster);
  const hood = posed(dashKit.build(), cp.hood, vm.cabin, 'cluster:hood', cluster).mesh;
  hood.name = 'cluster:hood';
  cluster.add(hood);
  for (const o of [...root.children]) if ((o as THREE.Group).isGroup && o !== cut && o.children.some((c) => (c as THREE.Mesh).material === dialGlow)) cluster.attach(o);
  const dashPanel = new DashPanel(cluster, { pos: new THREE.Vector3(strip.x - 0.002, y(strip.h), strip.z), tiltBack: 0.3, width: strip.w, redline: spec.engine.redline });
  const jumpers = new THREE.Group();
  jumpers.name = 'jumpers';
  const jumpMesh = new THREE.Mesh(jump.build(), vm.cabin);
  jumpMesh.name = 'jumpers';
  jumpers.add(jumpMesh);
  root.add(jumpers);

  const slotMesh = new SlotMesh(slots, vm.cabin);
  root.add(slotMesh.mesh);

  const pane = (w: Win, z: number): number[] => sidePane(w.x0, w.x1, y(w.h0), y(w.h1), z);
  const quarterPane = (z: number): number[] => quarterPts().flatMap(([x, h]) => [x, y(h), z]);
  const glassPM = posed(paneGeometry([...fixedWins.map((w) => pane(w, -zSkin)), quarterPane(-zSkin)]), glassParts, glassMaterial(0xbfd6dc, 0.14), 'glass', root);
  const glassCutPM = posed(paneGeometry([...fixedWins.map((w) => pane(w, zSkin)), quarterPane(zSkin)]), glassCutParts, glassMaterial(0xbfd6dc, 0.14), 'glass:cut', cut);
  glassPM.mesh.renderOrder = 9;
  glassCutPM.mesh.renderOrder = 9;

  const gf = D.glassFoot;
  const gh = D.glassHead;
  const { windscreen, wipers } = buildScreen(root, [gf.x, y(gf.h), -D.glassHalf, gf.x, y(gf.h), D.glassHalf, gh.x, y(gh.h), D.glassHalf, gh.x, y(gh.h), -D.glassHalf], [-0.62, 0.06], 0.54);
  const m = D.mirror;
  buildMirrors(root, [
    [m.x - 0.003, y(m.h), -m.z, m.wide - 0.025, m.tall - 0.03, -1.36],
    [m.x - 0.003, y(m.h), m.z, m.wide - 0.025, m.tall - 0.03, -(Math.PI - 1.36)],
    [0.764, y(1.68), 0, 0.19, 0.05, -Math.PI / 2],
  ]);
  const { headlights, taillights } = buildLamps(
    root,
    [new THREE.Vector3(D.xFront + 0.016, y(D.headlamp.h), -D.headlamp.z), new THREE.Vector3(D.xFront + 0.016, y(D.headlamp.h), D.headlamp.z)],
    [new THREE.Vector3(D.xRear - 0.008, y(D.taillamp.h), -D.taillamp.z), new THREE.Vector3(D.xRear - 0.008, y(D.taillamp.h), D.taillamp.z)],
    D.headlamp.r,
    [D.taillamp.tall, D.taillamp.wide],
  );
  // a dome lamp over the rear seats, a strip lamp over the cargo bay
  const lampB = new ModelBuilder();
  lampB.cyl(-0.4, y(D.ceiling) - 0.02, 0, 0.1, 0.04, 0xf3e6c4, { segments: 12, radiusTop: 0.075 });
  lampB.span(-1.75, -1.35, y(D.ceiling) - 0.025, y(D.ceiling), -0.06, 0.06, 0xf3e6c4);
  const lampMesh = new THREE.Mesh(lampB.build(), vm.lamps);
  lampMesh.name = 'lamps';
  cut.add(lampMesh);

  // the charm: a little brass goat bell hanging from the centre mirror
  const charm = new THREE.Group();
  charm.position.set(0.78, y(1.645), 0.06);
  root.add(charm);
  {
    const cb = new ModelBuilder();
    cb.bar(0, 0, 0, 0, -0.06, 0, 0.004, 0x40362c);
    cb.cyl(0, -0.085, 0, 0.026, 0.05, 0xc9a24a, { segments: 10, radiusTop: 0.012 });
    cb.sphere(0, -0.112, 0, 0.008, DARK, 0);
    const bell = new THREE.Mesh(cb.build(), vm.cabin);
    bell.name = 'charm';
    charm.add(bell);
  }
  const wheels = buildWheels(root, spec, { width: 0.26, tyre: RUBBER, hub: CREAM, cap: CHROME, hubR: 0.56, capR: 0.18, boltR: 0.34, knobs: true });

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
  mover('rearDoor', '尾门');
  mover('drawer', '抽屉厨房');
  mover('tent', '车顶帐');
  mover('bonnet', '引擎盖');
  for (const [m, label] of cp.movers) mover(m, label);

  // ------------------------------------------------------------------ seats and viewpoints
  const v = (x: number, h: number, z: number, yawDeg: number, pitchDeg: number, label: string, seat: boolean, extra: Partial<VehicleViewpoint> = {}): VehicleViewpoint => ({ x, y: y(h), z, yaw: yawDeg * DEG, pitch: pitchDeg * DEG, label, seat, ...extra });
  const views: Record<string, VehicleViewpoint> = {
    passenger: { x: eye.x, y: eye.y, z: -eye.z, yaw: 0, pitch: -3.7 * DEG, label: '副驾', seat: true },
    rearLeft: v(-0.72, 1.48, -0.36, 0, -6, '后排（左）', true),
    rearRight: v(-0.72, 1.48, 0.36, 0, -6, '后排（右）', true),
    tent: v(-1.08, D.roof + 0.44, 1.3, 90, -4, '车顶帐（躺着向外看）', true, { needs: 'roofTent', open: ['tent'] }),
    room: v(-0.62, 1.74, 0.0, 180, -38, '车厢（越过后排看货舱）', false),
    tailgate: v(-3.05, 1.62, 0.3, 0, -30, '车尾（抽屉厨房）', false),
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
    footprint: { length: 4.6, width: 2.1 },
    chase: { dist: 7.4, height: 2.5, look: 0.9 },
    enclosed: 1,
    camp: ['rearDoor', 'drawer', 'tent'],
    controls: cp.controls,
    dashPanel,
    jumpers,
    glovebox: { x: D.dash.x0 - 0.06, y: y(0.9), z: 0.44, hx: 0.05, h: 0.06, hz: 0.2 },
    bay: { engine: { x: 1.45, y: y(1.06), z: -0.02 }, cooling: { x: 1.9, y: y(1.0), z: 0 }, battery: { x: 1.65, y: y(1.07), z: 0.48 }, heater: { x: 1.65, y: y(1.04), z: -0.5 } },
    hubs: new WheelHubs(root, spec, vm.body),
  };
}
