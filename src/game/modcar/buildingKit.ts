/**
 * A building by the road put together from ModCar's building kit (docs/MODCAR.md §20). The pieces are
 * tools/blender/places/kit.py's; the rules and the reference assembler are kit_test.py's, and this is that assembler,
 * rule for rule: the walls round their openings (jambs, lintels, sills, the plaster 2 cm into each), the corner posts,
 * plinth and cornice, the windows (shutters on a house's), the roof — a gable's or a lean-to's modules sheared to its
 * pitch, a flat one behind its parapets — a porch on posts or an awning, the floor, a ceiling, the sign over the door
 * with its pictogram, a roller gate part of the way up. It is laid out as the old drawing laid it out
 * (game/scene/siteBuild.ts `building`: the same openings at the same places, the same roof heights), so what stands in
 * the world — its solids, the things inside — fits it. The door leaves are not among the pieces: doors.ts hangs them.
 *
 * Frames. The kit's building frame is Blender's: X along the front (to the right as one faces the building), Y across
 * with the front at −Y, Z up from the floor's top; every piece is placed in it by a matrix (location · rotation ·
 * scale along the piece's own axes, never a mirror; a roof module's a scale and a shear). A piece's GLB is in glTF's
 * axes (Blender's x, z, −y), and the site object's own frame has x along it, y up, z across with its front at −z: so
 * kit X = −x, Y = z, Z = y, and a piece's matrix in the object's frame is Q · M · A⁻¹.
 */
import * as THREE from 'three';
import { hash2 } from '../../core/math/rng';
import type { SiteObject } from '../../core/world/sites';

export type DoorName = 'door_wood' | 'door_shop' | 'door_shed';

/** a piece placed: its model (kit/<name>), its matrix in the object's frame; a sign's wear the place's own colours */
export interface KitPiece {
  name: string;
  m: THREE.Matrix4;
  sign?: boolean;
}

/** a door leaf: its hinge's frame (the kit's), its fixed turn (a pair's second leaf, never mirrored), its size, its swing */
export interface KitLeaf {
  name: DoorName;
  hinge: THREE.Matrix4;
  turn: THREE.Matrix4;
  scale: THREE.Matrix4;
  /** +1: it swings into the room with a positive angle; −1 the other leaf of a pair */
  sign: 1 | -1;
}

/** a doorway with its leaves: its middle in the object's frame (on the wall's middle plane), its width and height */
export interface KitOpening {
  name: DoorName;
  leaves: KitLeaf[];
  cx: number;
  cz: number;
  width: number;
  height: number;
}

/** every piece the kit has (public/models/modcar/places/kit/<name>.glb): all there, or the old drawing stays */
export const KIT_PIECES = [
  'wall',
  'plinth',
  'cornice',
  'corner',
  'jamb',
  'lintel',
  'sill',
  'win',
  'shutter',
  'door_wood',
  'door_shop',
  'door_shed',
  'gate_box',
  'gate_rail',
  'gate_shutter',
  'gate_bar',
  'roof_slope',
  'roof_slope_rust',
  'ridge',
  'gable_end',
  'mono_end',
  'roof_flat',
  'parapet',
  'verge',
  'post',
  'beam',
  'awning',
  'step',
  'chimney',
  'floor',
  'floor_slab',
  'signboard',
  'pict_fuel',
  'pict_wrench',
  'pict_shop',
  'pict_house',
  'pict_camp',
  'pict_fish',
  'pict_game',
  'pict_view',
  'pict_light',
  'pict_works',
] as const;

/** a building's colours (the old drawing's coats, by its variant): its plaster, its trims, its doors, its sign's board */
export const COATS: readonly { wall: number; trim: number; door: number; accent: number }[] = [
  { wall: 0xe3d8bd, trim: 0xf2ecdc, door: 0x4f8a86, accent: 0xc9623f },
  { wall: 0x9dbdb3, trim: 0xeef0e4, door: 0xb5563c, accent: 0xe0a23c },
  { wall: 0xb8604c, trim: 0xe9e2d0, door: 0xd9cdae, accent: 0x4f7f8a },
  { wall: 0xd9b469, trim: 0xf0e8d2, door: 0x5a6f8a, accent: 0xb5503c },
  { wall: 0xa98c68, trim: 0xc9b48e, door: 0x7a6248, accent: 0x9b4a3a },
  { wall: 0xc9503c, trim: 0xf2efe6, door: 0xe6dcc0, accent: 0xe0a23c },
];
export const coatOf = (o: SiteObject): (typeof COATS)[number] => COATS[o.v % COATS.length];
/** a sign's pale ink */
export const SIGN_INK = 0xf2ecdc;

/** the seed a building's pieces are picked by (siteArt and doors: the same building) */
export const kitSeed = (siteSeed: number, index: number): number => hash2(siteSeed, index, 0xb1d);

/** the pictograms by the sites' SIGN numbers */
const PICTS = ['', 'pict_fuel', 'pict_wrench', 'pict_shop', 'pict_house', 'pict_camp', 'pict_fish', 'pict_game', 'pict_view', 'pict_light', 'pict_works'];

// ------------------------------------------------------------------ the kit's constants (kit_test.py)

/** the walls' thickness, half of it (a wall's middle plane is HT inside its outer face) */
const T = 0.24;
const HT = 0.12;
/** how far the cornice stands out of the wall face; its top over the wall top */
const E = 0.09;
const C = 0.02;
/** the eaves' overhang beyond the cornice's front edge, the gables' beyond the end walls */
const OV = 0.35;
const OVX = 0.3;
const DOOR_H: Record<DoorName, number> = { door_wood: 2.05, door_shop: 2.1, door_shed: 2.0 };

// ------------------------------------------------------------------ matrices (Blender's frame)

const tr = (x: number, y: number, z: number): THREE.Matrix4 => new THREE.Matrix4().makeTranslation(x, y, z);
const rz = (deg: number): THREE.Matrix4 => new THREE.Matrix4().makeRotationZ((deg * Math.PI) / 180);
const sc = (x: number, y: number, z: number): THREE.Matrix4 => new THREE.Matrix4().makeScale(x, y, z);
const ID = new THREE.Matrix4();
const RX_PI = new THREE.Matrix4().makeRotationX(Math.PI);
const RY_PI = new THREE.Matrix4().makeRotationY(Math.PI);
function mul(...ms: THREE.Matrix4[]): THREE.Matrix4 {
  const out = new THREE.Matrix4();
  for (const m of ms) out.multiply(m);
  return out;
}
/** a roof module's transform: x' = m x, y' = s y, z' = z + (p s − 1) y (the sheet keeps its thickness at any pitch) */
function shear(m: number, s: number, p: number): THREE.Matrix4 {
  const M = new THREE.Matrix4();
  M.elements[0] = m;
  M.elements[5] = s;
  // (row 2, column 1)
  M.elements[6] = p * s - 1;
  return M;
}

/** the kit's building frame → the object's frame (X = −x, Y = z, Z = y) */
const Q = new THREE.Matrix4().set(-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
/** a piece's glTF axes → its Blender ones (x, −z, y) */
const AINV = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);

/** how many modules of about `size` cover `length`, and the scale of each */
function modules(length: number, size = 1): [number, number] {
  const n = Math.max(1, Math.round(length / size));
  return [n, length / n / size];
}

/** one wall's frame: origin on its middle plane at its middle, X along it, −Y outwards */
class Wall {
  readonly M: THREE.Matrix4;
  constructor(x: number, y: number, deg: number) {
    this.M = mul(tr(x, y, 0), rz(deg));
  }
  at(s: number, y: number, z: number, rot: THREE.Matrix4 = ID, scale: [number, number, number] = [1, 1, 1]): THREE.Matrix4 {
    return mul(this.M, tr(s, y, z), rot, sc(...scale));
  }
}

interface Op {
  s0: number;
  s1: number;
  z0: number;
  z1: number;
  kind: 'door' | 'gate' | 'window';
  wall?: 'front' | 'right' | 'back' | 'left';
}

/** the assembler: the pieces placed, in the kit's frame (turned into the object's at the end) */
class Asm {
  readonly pieces: KitPiece[] = [];
  put(name: string, M: THREE.Matrix4, sign = false): void {
    this.pieces.push({ name, m: mul(Q, M, AINV), ...(sign ? { sign } : {}) });
  }
  /** an X-stretched piece from s0 to s1 along the wall */
  band(wall: Wall, name: string, s0: number, s1: number, y: number, z: number, sz = 1): void {
    if (s1 - s0 > 1e-4) this.put(name, wall.at((s0 + s1) / 2, y, z, ID, [s1 - s0, 1, sz]));
  }
  plaster(wall: Wall, s0: number, s1: number, z0: number, z1: number): void {
    if (s1 - s0 > 1e-4 && z1 - z0 > 1e-4) this.put('wall', wall.at((s0 + s1) / 2, 0, z0, ID, [s1 - s0, 1, z1 - z0]));
  }
}

/** one wall: its plaster between the corners and round the openings, the trims, the windows, plinth and cornice */
function wallRun(a: Asm, wall: Wall, length: number, top: number, ops: Op[], plinth: [number, number], cornice: [number, number]): void {
  const La = length - T;
  const lo = -(La / 2 - 0.13);
  const hi = La / 2 - 0.13;
  let cur = lo;
  for (const op of [...ops].sort((x, y) => x.s0 - y.s0)) {
    const { s0, s1, z0, z1 } = op;
    a.plaster(wall, cur, s0 - 0.08, 0, top);
    const win = op.kind === 'window';
    const zl = z1 + 0.16;
    a.plaster(wall, s0 - 0.08, s1 + 0.08, zl - 0.02, top);
    if (win) {
      a.plaster(wall, s0 - 0.08, s1 + 0.08, 0, z0 - 0.07 + 0.02);
      a.band(wall, 'sill', s0 - 0.14, s1 + 0.14, 0, z0 - 0.07);
      a.put('win', wall.at((s0 + s1) / 2, 0, z0, ID, [s1 - s0, 1, z1 - z0]));
    }
    const zj = win ? z0 : 0;
    for (const sj of [s0 - 0.05, s1 + 0.05]) a.put('jamb', wall.at(sj, 0, zj, ID, [1, 1, z1 - zj]));
    a.band(wall, 'lintel', s0 - 0.14, s1 + 0.14, 0, z1);
    cur = s1 + 0.08;
  }
  a.plaster(wall, cur, hi, 0, top);
  // the plinth, stopping 2 cm short of doors and gates
  const cuts = ops.filter((o) => o.kind !== 'window').map((o) => [o.s0 - 0.02, o.s1 + 0.02] as const).sort((x, y) => x[0] - y[0]);
  let x = plinth[0];
  for (const [c0, c1] of cuts) {
    a.band(wall, 'plinth', x, c0, 0, -0.2);
    x = c1;
  }
  a.band(wall, 'plinth', x, plinth[1], 0, -0.2);
  a.band(wall, 'cornice', cornice[0], cornice[1], 0, top + C - 0.14);
}

/**
 * A verge along a roof's sloping edge in the plane X = xEdge, from the eave point (y, z of the underside at the eave)
 * to the apex (the underside at the ridge or the high end); inward = +1 when the roof lies at +X of the edge. The
 * board's back on the edge plane, its cap 2 mm over the crests.
 */
function vergeAlong(a: Asm, xEdge: number, inward: number, e0: [number, number], a0: [number, number], o: { tTop?: number; extLo?: number; extHi?: number | null; out?: number } = {}): void {
  const tTop = o.tTop ?? 0.06;
  const extLo = o.extLo ?? 0.02;
  const out = o.out ?? 0;
  const E0 = new THREE.Vector3(0, e0[0], e0[1]);
  const A0 = new THREE.Vector3(0, a0[0], a0[1]);
  const u = A0.clone().sub(E0).normalize();
  const Y = new THREE.Vector3(inward, 0, 0);
  let X = u.clone();
  let Z = X.clone().cross(Y);
  if (Z.z < 0) {
    X = u.clone().negate();
    Z = X.clone().cross(Y);
  }
  // (the sheet is tTop thick vertically, tTop cos(slope) across)
  const lift = tTop * Math.abs(u.y) + 0.002 - 0.16;
  // (to the ridge: the board's top edge, 0.20 above its foot, meets its pair's right over the ridge line)
  const extHi = o.extHi === null || o.extHi === undefined ? (0.2 + lift) * Math.abs(u.z / u.y) : o.extHi;
  const L = A0.clone().sub(E0).length();
  const mid = E0.clone().addScaledVector(u, (L + extHi - extLo) / 2).addScaledVector(Z, lift);
  const org = new THREE.Vector3(xEdge - inward * out, mid.y, mid.z).addScaledVector(Y, 0.015);
  const R = new THREE.Matrix4().makeBasis(X, Y, Z);
  a.put('verge', mul(tr(org.x, org.y, org.z), R, sc(L + extLo + extHi, 1, 1)));
}

/** roof_slope modules from x0 to x1, the eave (local Y 0) at (yEave, zEave), its run and slope; turned 180 for an eave at +Y */
function roofModules(a: Asm, x0: number, x1: number, yEave: number, zEave: number, run: number, p: number, turn: number, seed: number, rusty: number): void {
  const [n, m] = modules(x1 - x0);
  for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.5) * m;
    const piece = (hash2(seed, i, 0x7005) & 0xff) / 255 < rusty ? 'roof_slope_rust' : 'roof_slope';
    a.put(piece, mul(tr(x, yEave, zEave), rz(turn), shear(m, run, p)));
  }
}

function gableRoof(a: Asm, w: number, d: number, H: number, R: number, seed: number, rusty: number): void {
  const p = (R - C) / (d / 2 + E);
  const run = d / 2 + E + OV;
  const ze = H + C - p * OV;
  const xa = -(w / 2 + OVX);
  const xb = w / 2 + OVX;
  roofModules(a, xa, xb, -run, ze, run, p, 0, seed, rusty);
  roofModules(a, xa, xb, run, ze, run, p, 180, seed + 1, rusty);
  // the ridge
  const L = xb - xa + 0.08;
  const [n, m] = modules(L);
  const zr = H + R + 0.06 - 0.15 * p - 0.005;
  for (let i = 0; i < n; i++) a.put('ridge', mul(tr(-L / 2 + (i + 0.5) * m, 0, zr), sc(m, 1, 1)));
  // the gable triangles on the end walls
  for (const sx of [-1, 1]) a.put('gable_end', mul(tr(sx * (w / 2 - HT), 0, H + C), sc(1, d + 2 * E, R - C)));
  // the barge boards: up both slopes at both ends, the back slope's 1 cm further out; a finial over their joint
  for (const sx of [-1, 1]) {
    for (const [sy, out] of [
      [-1, 0],
      [1, 0.01],
    ] as const) {
      vergeAlong(a, sx * xb, -sx, [sy * run, ze], [0, H + R], { out, extHi: null });
    }
    a.put('post', mul(tr(sx * (xb + 0.02), 0, H + R - 0.22), sc(1, 1, 0.45)));
  }
}

function monoRoof(a: Asm, w: number, d: number, H: number, R: number, seed: number, rusty: number): void {
  const OVB = 0.4;
  const OVF = 0.25;
  const yLo = d / 2 + E;
  const zLo = H + C;
  const yHi = -d / 2 + 0.23;
  const zHi = H + R + C;
  const p = (zHi - zLo) / (yLo - yHi);
  const ye = yLo + OVB;
  const ze = zLo - p * OVB;
  const yf = -(d / 2 + E + OVF);
  const zf = zLo + p * (yLo - yf);
  const run = ye - yf;
  const xa = -(w / 2 + OVX);
  const xb = w / 2 + OVX;
  roofModules(a, xa, xb, ye, ze, run, p, 180, seed, rusty);
  // the end walls' triangles, from the front wall's face to the back cornice's front edge
  const span = yLo + d / 2;
  for (const sx of [-1, 1]) a.put('mono_end', mul(tr(sx * (w / 2 - HT), (yLo - d / 2) / 2, H + C), rz(180), sc(1, span, p * span)));
  for (const sx of [-1, 1]) vergeAlong(a, sx * xb, -sx, [ye, ze], [yf, zf], { extLo: 0.02, extHi: 0 });
  // along the high front edge: the board's back on the roof's front edge, the cap on the crests
  const Lf = xb - xa + 0.07;
  a.put('verge', mul(tr(0, yf + 0.015, zf + 0.06 + 0.002 - 0.16), sc(Lf, 1, 1)));
}

function flatRoof(a: Asm, w: number, d: number, H: number): void {
  for (const [deg, ox, oy, L] of [
    [0, 0, -d / 2 + HT, w],
    [180, 0, d / 2 - HT, w],
    [90, w / 2 - HT, 0, d - 2 * T],
    [-90, -w / 2 + HT, 0, d - 2 * T],
  ] as const) {
    a.put('parapet', mul(tr(ox, oy, H), rz(deg), sc(L, 1, 1)));
  }
  a.put('roof_flat', mul(tr(0, 0, H - 0.1), sc(w - 2 * (T - 0.01), d - 2 * (T - 0.01), 1)));
}

/** posts, a beam and a lean-to roof over a deck in front of the house */
function porch(a: Asm, w: number, d: number, H: number, pd: number, doorAt: number, seed: number, rusty: number): void {
  const yWall = -d / 2;
  const yPost = yWall - pd + 0.1;
  const zbTop = Math.min(2.22, H - 0.68);
  const zWall = Math.min(2.52, H - 0.38);
  // the deck: floor boards in front, from the deck's edge to the wall
  const [n, k] = modules(pd);
  for (let i = 0; i < n; i++) a.put('floor', mul(tr(0, yWall - pd + (i + 0.5) * k, -0.14), sc(w, k, 1)));
  // posts (where the site's solids have them) and the beam on them
  for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) a.put('post', mul(tr(x, yPost, 0), sc(1, 1, zbTop - 0.2)));
  a.put('beam', mul(tr(0, yPost, zbTop - 0.2), sc(w + 0.1, 1, 1)));
  // the lean-to roof: underside through the beam's top front edge, up to the wall
  const yEdge = yPost - 0.075;
  const p = (zWall - zbTop) / (yWall - yEdge);
  const yE = yEdge - 0.25;
  const run = yWall - yE;
  const zE = zbTop - p * 0.25;
  const xa = -(w / 2 + 0.15);
  const xb = w / 2 + 0.15;
  roofModules(a, xa, xb, yE, zE, run, p, 0, seed + 2, rusty);
  // flashing over its top end, verges on its sides
  a.put('verge', mul(tr(0, yWall - 0.05, zWall + 0.06 + 0.002 - 0.16), rz(180), sc(xb - xa + 0.07, 1, 1)));
  for (const sx of [-1, 1]) vergeAlong(a, sx * xb, -sx, [yE, zE], [yWall, zWall], { extLo: 0.02, extHi: 0 });
  // a step down from the deck at the door
  a.put('step', mul(tr(doorAt, yWall - pd - 0.18, -0.22), sc(1.2, 0.36, 1)));
}

/** what a building of the sites is built of: its door's kind, its floor, what it has */
function specOf(o: SiteObject): {
  door: DoorName;
  gate: boolean;
  floor: 'floor' | 'floor_slab';
  shutters: boolean;
  ceiling: boolean;
  backWindow: boolean;
  awning: number;
  porch: number;
} {
  const b = o.b!;
  const shed = b.gate && o.w < 5;
  const shop = b.sign === 1 || b.sign === 3;
  const home = !b.gate && !shop && b.roof === 'gable';
  return {
    // (a shed's wide opening has two board doors; a shop's and a filling station's door is glass)
    door: shed ? 'door_shed' : shop ? 'door_shop' : 'door_wood',
    gate: b.gate && !shed,
    floor: b.gate || shop ? 'floor_slab' : 'floor',
    shutters: home,
    ceiling: !b.gate && o.w > 5 && b.roof !== 'flat',
    backWindow: !b.gate && o.w > 6 && (hash2(Math.round(o.x * 10), Math.round(o.z * 10), 0xbac) & 0xff) / 255 < 0.6,
    awning: b.porch > 0 && !b.porchPosts ? b.porch : 0,
    porch: b.porch > 0 && b.porchPosts ? b.porch : 0,
  };
}

/**
 * A site's building as the kit's pieces (the object's frame) and its doorways. `seed` picks the rusty roof sheets
 * and the gate's height.
 */
export function buildingKit(o: SiteObject, seed: number): { pieces: KitPiece[]; openings: KitOpening[] } {
  const b = o.b!;
  const sp = specOf(o);
  const a = new Asm();
  const w = o.w;
  const d = o.d;
  const H = o.h;
  const roof = b.roof;
  const R = roof === 'gable' ? (d / 2) * 0.62 : roof === 'mono' ? d * 0.2 : 0;
  const Hf = roof === 'mono' ? H + R : H;
  const rusty = 0.12 + 0.25 * ((hash2(seed, 1, 0x3057) & 0xff) / 255);
  // (the kit runs along the front the other way: kit X = −x)
  const doorAt = -b.doorAt;
  const gateH = Math.min(H - 0.45, 3.1);
  const zd = sp.gate ? gateH : DOOR_H[sp.door];
  const front: Op[] = [{ s0: doorAt - b.doorW / 2, s1: doorAt + b.doorW / 2, z0: 0, z1: zd, kind: sp.gate ? 'gate' : 'door' }];
  const ww = b.windowW;
  const sill = ww > 2 ? 0.75 : 0.95;
  const wtop = Math.min(H - 0.5, sill + (ww > 2 ? 1.6 : 1.15));
  for (const at of b.windows) front.push({ s0: -at - ww / 2, s1: -at + ww / 2, z0: sill, z1: wtop, kind: 'window' });
  const side: Op[] = b.sideWindows ? [{ s0: -0.55, s1: 0.55, z0: 0.95, z1: Math.min(H - 0.45, 2.0), kind: 'window' }] : [];
  const back: Op[] = sp.backWindow ? [{ s0: -0.6, s1: 0.6, z0: 1.0, z1: Math.min(H - 0.5, 2.0), kind: 'window' }] : [];
  const walls: Record<'front' | 'right' | 'back' | 'left', { wall: Wall; length: number; top: number; ops: Op[] }> = {
    front: { wall: new Wall(0, -d / 2 + HT, 0), length: w, top: Hf, ops: front },
    right: { wall: new Wall(w / 2 - HT, 0, 90), length: d, top: H, ops: side },
    back: { wall: new Wall(0, d / 2 - HT, 180), length: w, top: H, ops: back },
    left: { wall: new Wall(-w / 2 + HT, 0, -90), length: d, top: H, ops: side },
  };
  for (const [key, { wall, length, top, ops }] of Object.entries(walls)) {
    let ps: [number, number];
    let cs: [number, number];
    if (key === 'front' || key === 'back') {
      ps = [-length / 2 - 0.08, length / 2 + 0.08];
      cs = [-length / 2 - 0.09, length / 2 + 0.09];
    } else {
      ps = [-(length / 2 - 0.22), length / 2 - 0.22];
      cs = [-(length / 2 - 0.23), length / 2 - 0.23];
      // (under the high front the end walls' cornice runs on to the middle of the front corner post)
      if (roof === 'mono') cs = key === 'left' ? [-(length / 2 - 0.23), length / 2 - 0.12] : [-(length / 2 - 0.12), length / 2 - 0.23];
    }
    wallRun(a, wall, length, top, ops, ps, cs);
  }
  // the corners
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    a.put('corner', mul(tr(sx * (w / 2 - HT), sy * (d / 2 - HT), 0), sc(1, 1, sy < 0 ? Hf : H)));
  }
  // what fills the openings
  const fw = walls.front.wall;
  const openings: KitOpening[] = [];
  const all: Op[] = [...front, ...side.map((x) => ({ ...x, wall: 'right' as const })), ...side.map((x) => ({ ...x, wall: 'left' as const })), ...back.map((x) => ({ ...x, wall: 'back' as const }))];
  for (const op of all) {
    const wall = walls[op.wall ?? 'front'].wall;
    const { s0, s1, z0, z1 } = op;
    if (op.kind === 'window' && sp.shutters && (op.wall ?? 'front') === 'front') {
      const sw = (s1 - s0) / 2 / 0.5;
      a.put('shutter', wall.at(s0 - 0.1, -0.147, z0, rz(180), [sw, 1, z1 - z0]));
      a.put('shutter', wall.at(s1 + 0.1, -0.147, z1, RX_PI, [sw, 1, z1 - z0]));
    }
    if (op.kind === 'door') {
      const leaves: KitLeaf[] = [];
      if (s1 - s0 > 1.1 + 1e-6) {
        // two leaves, hinged at both jambs; the second turned round, not mirrored (a shop door about Z, a shed's
        // about Y — upside down, its origin then at its top — so that its straps still face out)
        const half = (s1 - s0) / 2;
        leaves.push({ name: sp.door, hinge: wall.at(s0, 0, 0), turn: ID.clone(), scale: sc(half, 1, 1), sign: 1 });
        if (sp.door === 'door_shed') leaves.push({ name: sp.door, hinge: wall.at(s1, 0, DOOR_H[sp.door]), turn: RY_PI.clone(), scale: sc(half, 1, 1), sign: -1 });
        else leaves.push({ name: sp.door, hinge: wall.at(s1, 0, 0), turn: rz(180), scale: sc(half, 1, 1), sign: -1 });
      } else leaves.push({ name: sp.door, hinge: wall.at(s0, 0, 0), turn: ID.clone(), scale: sc(s1 - s0, 1, 1), sign: 1 });
      openings.push({ name: sp.door, leaves, cx: -(s0 + s1) / 2, cz: -d / 2 + HT, width: s1 - s0, height: DOOR_H[sp.door] });
      // the floor through the wall's thickness, up to the room's (which starts 1 cm into the wall)
      a.put(sp.floor, wall.at((s0 + s1) / 2, -0.005, -0.14, ID, [s1 - s0, T - 0.01, 1]));
      if (!sp.porch) a.put('step', wall.at((s0 + s1) / 2, -HT - 0.2, -0.22, ID, [s1 - s0 + 0.4, 0.4, 1]));
    }
    if (op.kind === 'gate') {
      a.put('gate_rail', wall.at(s0 - 0.04, -0.21, 0, ID, [1, 1, z1]));
      a.put('gate_rail', wall.at(s1 + 0.04, -0.21, 0, rz(180), [1, 1, z1]));
      a.put('gate_box', wall.at((s0 + s1) / 2, -0.35, z1, ID, [s1 - s0 + 0.28, 1, 1]));
      // (stuck part of the way up, as the old drawing had it: high enough to walk and drive under)
      const down = 0.3 + 0.15 * ((hash2(seed, 2, 0x6a7e) & 0xff) / 255);
      const zb = z1 * (1 - down);
      const gx = s1 - s0 + 0.08;
      const [n, k] = modules(z1 + 0.2 - (zb + 0.08));
      for (let i = 0; i < n; i++) a.put('gate_shutter', wall.at((s0 + s1) / 2, -0.21, zb + 0.08 + i * k, ID, [gx, 1, k]));
      a.put('gate_bar', wall.at((s0 + s1) / 2, -0.21, zb, ID, [gx, 1, 1]));
      a.put('floor_slab', wall.at((s0 + s1) / 2, -0.005, -0.14, ID, [s1 - s0, T - 0.01, 1]));
      // a concrete apron in front of it, at the floor's level
      a.put('step', wall.at((s0 + s1) / 2, -HT - 0.8, -0.15, ID, [s1 - s0 + 0.4, 1.6, 1]));
    }
  }
  // the sign over the door or the gate (with an awning: on the parapet, or squeezed over the awning)
  const pict = PICTS[b.sign] ?? '';
  if (pict) {
    const op = front[0];
    const scx = (op.s0 + op.s1) / 2;
    let zs = op.z1 + (sp.gate ? 0.45 + 0.17 : 0.3);
    let bw = sp.gate ? 2.2 : 1.5;
    let k = 1;
    const ySign = -HT - 0.04;
    if (sp.awning) {
      if (roof === 'flat') {
        zs = H + 0.45;
        bw = 2.6;
      } else {
        zs = 2.55 + 0.32;
        k = Math.max(0.35, Math.min(1, (H - 0.05 - zs) / 0.6));
      }
    }
    a.put('signboard', fw.at(scx, ySign, zs, ID, [bw, 1, k]), true);
    a.put(pict, fw.at(scx, ySign - 0.025 - 0.01, zs + 0.05 * k, ID, [k, 1, k]), true);
  }
  // the floor inside, 1 cm into the walls; under it a footing down into the ground (a site's floor is level, its ground not)
  const fx = w - 2 * (T - 0.01);
  const fy = d - 2 * (T - 0.01);
  if (sp.floor === 'floor') {
    const [n, k] = modules(fy);
    for (let i = 0; i < n; i++) a.put('floor', mul(tr(0, -fy / 2 + (i + 0.5) * k, -0.14), sc(fx, k, 1)));
  } else a.put('floor_slab', mul(tr(0, 0, -0.14), sc(fx, fy, 1)));
  a.put('step', mul(tr(0, 0, -1.4), sc(w - 0.04, d - 0.04, 1.24 / 0.15)));
  // the roof
  if (roof === 'gable') gableRoof(a, w, d, H, R, seed, rusty);
  else if (roof === 'mono') monoRoof(a, w, d, H, R, seed, rusty);
  else flatRoof(a, w, d, H);
  if (sp.ceiling) a.put('roof_flat', mul(tr(0, 0, H - 0.1), sc(fx, fy, 1)));
  if (sp.porch) porch(a, w, d, H, sp.porch, doorAt, seed, rusty);
  if (sp.awning) {
    // modules along the front, the wall end on the wall face; deeper than a metre it is scaled in Z too
    const depth = sp.awning;
    const L = w - 0.6;
    const [n, m] = modules(L);
    for (let i = 0; i < n; i++) a.put('awning', fw.at(-L / 2 + (i + 0.5) * m, -HT, 2.55, ID, [m, depth, Math.max(1, depth * 0.7)]));
  }
  if (b.chimney && roof !== 'flat') {
    // behind the ridge, its top 0.6 over the ridge's crest line (as the old drawing: on one side or the other)
    const cx = (w / 2) * 0.45 * ((hash2(seed, 3, 0xc41) & 1) === 0 ? 1 : -1);
    const zTop = H + R + 0.06 + 0.6;
    a.put('chimney', tr(cx, (d / 2) * 0.25, zTop - 1.8));
  }
  return { pieces: a.pieces, openings };
}

const TMP = new THREE.Matrix4();

/** a door leaf swung `a` (rad) into the room: its matrix in the object's frame (for the leaf's glTF model) */
export function leafMatrix(l: KitLeaf, a: number, out: THREE.Matrix4): THREE.Matrix4 {
  return out.copy(Q).multiply(l.hinge).multiply(TMP.makeRotationZ(l.sign * a)).multiply(l.turn).multiply(l.scale).multiply(AINV);
}
