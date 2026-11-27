/**
 * The fish of the fishing module drawn as our own models (docs/V3/nodes/F2-fishing-lite.md §12), in a Ghibli / Breath
 * of the Wild look: a body lofted from a profile of its family (how tall and wide it is along its length, where it is
 * tallest, how blunt its head), its belly a little flattened, the gill cover's lip and the mouth's line modelled into
 * it; fins as thin see-through sheets, their rays solid in a thinner membrane, lit through from behind (forked, square,
 * round or crescent tails; spiny, tall, long or sail-like backs); eyes in a dark socket with an iris ring and a
 * catch-light of their own; whiskers, snouts, scutes; the oddities (squid, octopus, crayfish, frog, turtle, the cube
 * fish) built as their own. Its skin is painted from its row's colours and pattern (fishSkin.ts) and recoloured for
 * the five colours a catch can come in. Drawn in the props' cel look (render/materials.ts surfaceMaterial, inked), with
 * the sun's rim on its lit edge and a hard wet glint.
 *
 * Model frame: one unit long along +x (head at +x), y up, the right side (+z) the one shown on a card.
 */
import * as THREE from 'three';
import { surfaceMaterial } from '../../../render/materials';
import type { Family, FishDef, Variant } from '../../../../core/v3/fishing/lite/types';
import { detailTexture, hashStr, hsl2rgb, mixC, mixN, paintSkin, rgbOf, rng, scaleC, SKIN_H, SKIN_W, smooth, type RGB, type SkinEye, type SkinFin, type SkinShape } from './fishSkin';

export interface FishModel {
  group: THREE.Group;
  /** the tail fin's pivot (wag it about y) */
  tail: THREE.Object3D;
  dispose(): void;
}

// ------------------------------------------------------------------ the bodies

interface Body {
  /** full height and width against the length; where it is tallest; the peduncle's and the snout's share of it; how round the head */
  H: number;
  W: number;
  peak: number;
  ped: number;
  tip: number;
  head: number;
  /** the belly's sag and the back's hump (share of the height) */
  sag: number;
  hump: number;
  /** the tail fin's share of the length and its shape */
  cl: number;
  caudal: 'fork' | 'trunc' | 'round' | 'lunate' | 'eel' | 'hetero';
  dorsal: 'mid' | 'long' | 'spiny' | 'tall' | 'small' | 'rear' | 'fringe' | 'eel' | 'none';
  eye: number;
  eyeU: number;
  eyeY: number;
  spec: number;
}

const BODIES: Readonly<Partial<Record<Family, Body>>> = {
  fusiform: { H: 0.24, W: 0.12, peak: 0.56, ped: 0.22, tip: 0.1, head: 1.8, sag: 0.08, hump: 0, cl: 0.17, caudal: 'fork', dorsal: 'mid', eye: 0.026, eyeU: 0.9, eyeY: 0.22, spec: 0.45 },
  carp: { H: 0.32, W: 0.15, peak: 0.55, ped: 0.24, tip: 0.18, head: 2.6, sag: 0.12, hump: 0.05, cl: 0.16, caudal: 'fork', dorsal: 'long', eye: 0.024, eyeU: 0.88, eyeY: 0.15, spec: 0.5 },
  perch: { H: 0.32, W: 0.12, peak: 0.6, ped: 0.24, tip: 0.13, head: 2.0, sag: 0.06, hump: 0.04, cl: 0.15, caudal: 'trunc', dorsal: 'spiny', eye: 0.03, eyeU: 0.88, eyeY: 0.22, spec: 0.35 },
  disc: { H: 0.62, W: 0.1, peak: 0.52, ped: 0.15, tip: 0.2, head: 2.4, sag: 0, hump: 0, cl: 0.13, caudal: 'trunc', dorsal: 'tall', eye: 0.034, eyeU: 0.86, eyeY: 0.18, spec: 0.35 },
  eel: { H: 0.08, W: 0.07, peak: 0.7, ped: 0.5, tip: 0.36, head: 2.0, sag: 0, hump: 0, cl: 0.06, caudal: 'eel', dorsal: 'eel', eye: 0.012, eyeU: 0.95, eyeY: 0.25, spec: 0.55 },
  catfish: { H: 0.18, W: 0.17, peak: 0.78, ped: 0.3, tip: 0.38, head: 3.0, sag: 0.1, hump: 0, cl: 0.13, caudal: 'round', dorsal: 'small', eye: 0.012, eyeU: 0.93, eyeY: 0.3, spec: 0.5 },
  pike: { H: 0.15, W: 0.1, peak: 0.45, ped: 0.3, tip: 0.06, head: 1.3, sag: 0.04, hump: 0, cl: 0.13, caudal: 'fork', dorsal: 'rear', eye: 0.02, eyeU: 0.85, eyeY: 0.35, spec: 0.4 },
  flat: { H: 0.55, W: 0.05, peak: 0.52, ped: 0.15, tip: 0.3, head: 2.2, sag: 0, hump: 0, cl: 0.12, caudal: 'trunc', dorsal: 'fringe', eye: 0.024, eyeU: 0.86, eyeY: 0.3, spec: 0.25 },
  ancient: { H: 0.14, W: 0.12, peak: 0.62, ped: 0.25, tip: 0.1, head: 1.6, sag: 0.04, hump: 0.02, cl: 0.14, caudal: 'hetero', dorsal: 'rear', eye: 0.014, eyeU: 0.9, eyeY: 0.28, spec: 0.3 },
  round: { H: 0.52, W: 0.44, peak: 0.52, ped: 0.15, tip: 0.42, head: 2.5, sag: 0, hump: 0, cl: 0.12, caudal: 'trunc', dorsal: 'small', eye: 0.04, eyeU: 0.84, eyeY: 0.2, spec: 0.35 },
  tetra: { H: 0.26, W: 0.1, peak: 0.55, ped: 0.24, tip: 0.15, head: 2.0, sag: 0.04, hump: 0, cl: 0.18, caudal: 'fork', dorsal: 'mid', eye: 0.04, eyeU: 0.86, eyeY: 0.18, spec: 0.5 },
};

function bodyOf(def: FishDef): Body {
  const base = BODIES[def.family] ?? BODIES.fusiform!;
  const b: Body = { ...base };
  const f = def.look.f ?? [];
  if (def.look.h) b.H = def.look.h;
  if (def.look.w) b.W = def.look.w;
  if (f.includes('sickleTail')) b.caudal = 'lunate';
  if (f.includes('sail')) b.dorsal = 'tall';
  if (f.includes('mola')) {
    b.H = 0.95;
    b.W = 0.16;
    b.peak = 0.45;
    b.ped = 0.5;
    b.tip = 0.35;
    b.head = 2.4;
    b.cl = 0.07;
    b.caudal = 'round';
    b.dorsal = 'none';
  }
  if (f.includes('moonDisc')) {
    b.H = 0.96;
    b.W = 0.18;
    b.peak = 0.5;
    b.ped = 0.25;
    b.tip = 0.3;
    b.head = 2.2;
    b.cl = 0.08;
    b.caudal = 'trunc';
    b.dorsal = 'fringe';
  }
  if (f.includes('snout')) {
    b.tip = 0.04;
    b.head = 1.1;
  }
  if (f.includes('duckbill')) {
    b.tip = 0.08;
    b.head = 1.15;
  }
  if (f.includes('flatHead')) {
    b.head = Math.max(2.4, b.head);
    b.tip = Math.max(b.tip, 0.25);
  }
  if (f.includes('hump')) b.hump = 0.18;
  if (f.includes('bigMouth')) b.tip = Math.max(b.tip, 0.2);
  if (f.includes('glassEye')) b.eye *= 1.35;
  if (f.includes('lowEyes')) b.eyeY = -0.1;
  return b;
}

// ------------------------------------------------------------------ the characters

/**
 * A few kinds have a touch of character past their family's body (the user's word, 2026-11-24: only about one fish in
 * ten, the rest serious, natural fish): each water's lord and the Dream, one striking touch apiece (the Old Pond
 * Lord's is a monocle and a moustache): crowns and other headgear, an eyepatch, a lantern. Sizes go by the fish's own
 * head. The same touches draw what some kinds really have that their row's look does not (NATURE).
 */
interface Quirk {
  /** a long drooping moustache from under the snout (in place of its whiskers): its colour */
  stache?: number;
  hat?: 'crown' | 'trident' | 'icecrown' | 'antlers' | 'horns' | 'nightcap' | 'pschent' | 'feathers';
  /** a lantern on a stalk from the forehead: its light's colour */
  lantern?: number;
  eyewear?: 'monocle' | 'patch';
  /** rows of pointed teeth along the mouth (a pike's, a gar's), a spawning salmon's hooked jaw */
  teeth?: 'rows' | 'kype';
  /** both eyes on the side shown (a flatfish) */
  oneSide?: boolean;
}

const WHITE_HAIR = 0xf4f0e2;

/** the characters: the ten lords and one sky fish, the Dream (the last of all), a touch apiece */
const QUIRKS: Readonly<Record<string, Quirk>> = {
  old_pond_lord: { eyewear: 'monocle', stache: WHITE_HAIR },
  forest_taimen: { hat: 'antlers' },
  delta_catfish: { eyewear: 'patch' },
  lake_king: { hat: 'crown' },
  pharaoh: { hat: 'pschent' },
  arapaima: { hat: 'feathers' },
  ice_king: { hat: 'icecrown' },
  sea_king: { hat: 'trident' },
  lava_sturgeon: { hat: 'horns' },
  moon_below: { lantern: 0xfff6c8 },
  dream_fish: { hat: 'nightcap' },
};

/** what a kind really has that its row's look does not draw: a flatfish's eyes, a pike's and a gar's teeth, a kype */
const NATURE: Readonly<Record<string, Quirk>> = {
  flounder: { oneSide: true },
  pike: { teeth: 'rows' },
  lake_king: { teeth: 'rows' },
  spotted_gar: { teeth: 'rows' },
  alligator_gar: { teeth: 'rows' },
  sockeye: { teeth: 'kype' },
};

/** height and width shares at a point of the length (u: 0 the tail's root … 1 the snout) */
function profile(b: Body, u: number): { h: number; w: number; y: number } {
  let s: number;
  if (u <= b.peak) s = b.ped + (1 - b.ped) * Math.pow(smooth(u / b.peak), 0.85);
  else {
    const t = (u - b.peak) / (1 - b.peak);
    s = b.tip + (1 - b.tip) * Math.sqrt(Math.max(0, 1 - Math.pow(t, b.head)));
  }
  const wPeak = Math.min(0.9, b.peak + 0.12);
  let sw: number;
  if (u <= wPeak) sw = b.ped * 0.6 + (1 - b.ped * 0.6) * Math.pow(smooth(u / wPeak), 0.7);
  else {
    const t = (u - wPeak) / (1 - wPeak);
    sw = b.tip + (1 - b.tip) * Math.sqrt(Math.max(0, 1 - Math.pow(t, Math.max(1.4, b.head))));
  }
  const y = -b.sag * b.H * 0.5 * Math.sin(Math.PI * u) + b.hump * b.H * 0.5 * Math.exp(-Math.pow((u - 0.55) / 0.18, 2));
  return { h: (b.H / 2) * s, w: (b.W / 2) * sw, y };
}

/** what is modelled into a body past its profile: the gill cover's lip, the mouth's line, a flatter belly */
interface Shape {
  /** the gill cover's edge at mid-height (u: it curves forward above and below) and how far its lip stands proud (share of the radius) */
  gill: number;
  lip: number;
  /** the mouth's line (cos θ round the section, θ 0 the back), its corner (u) and its groove's depth (share of the radius) */
  mouthC: number;
  mouthU: number;
  groove: number;
  /** the belly flattened (0 a round section … about 0.35): its lower half a superellipse toward a flat belly */
  flat: number;
  /** a broad flat head (the catfish's): its upper half pressed down toward the snout */
  flatHead: boolean;
}

const FLAT_BELLY: Readonly<Partial<Record<Family, number>>> = { fusiform: 0.22, carp: 0.25, perch: 0.2, disc: 0.05, eel: 0.1, catfish: 0.35, pike: 0.2, flat: 0, ancient: 0.3, round: 0.1, tetra: 0.15 };

function shapeOf(def: FishDef, b: Body): Shape {
  const f = def.look.f ?? [];
  const big = f.includes('bigMouth');
  const fam = def.family;
  return {
    gill: Math.min(0.8, b.eyeU - 0.08),
    lip: fam === 'eel' || fam === 'round' ? 0.025 : 0.05,
    mouthC: fam === 'catfish' ? -0.05 : big ? -0.08 : -0.12,
    mouthU: 1 - (big ? 0.12 : fam === 'catfish' ? 0.09 : fam === 'pike' ? 0.1 : f.includes('snout') || f.includes('duckbill') ? 0.04 : 0.065),
    groove: fam === 'eel' ? 0.05 : 0.08,
    flat: FLAT_BELLY[fam] ?? 0.2,
    flatHead: fam === 'catfish' || f.includes('flatHead'),
  };
}

/** where the gill cover's edge runs at a height round the section (c = cos θ): furthest back at mid-height */
const gillAt = (s: Shape, c: number): number => s.gill + 0.035 * c * c;

/** the mouth's groove round the section at θ: 1 on its line (both sides), falling away within a few degrees */
function grooveAt(s: Shape, th: number): number {
  const tm = Math.acos(s.mouthC);
  const d1 = th - tm;
  const d2 = th - (Math.PI * 2 - tm);
  return Math.exp(-((d1 * d1) / 0.0036)) + Math.exp(-((d2 * d2) / 0.0036));
}

/**
 * The body's surface at u along it (0 the tail's root … 1 the snout) and θ round it (0 the back, π/2 the right side
 * +z, π the belly), in the model's frame: its section an ellipse round the profile's middle, the lower half squared off
 * toward a flat belly, squarer still in the deep bodies; the head's top pressed flat in the catfish; the gill cover's
 * lip — the head standing a little proud of the body just behind it, a step at its edge — and the mouth's groove from
 * its corner to the snout.
 */
function surfaceAt(b: Body, s: Shape, x0: number, xL: number, u: number, th: number): P3 {
  const pr = profile(b, u);
  const c = Math.cos(th);
  // (flattest mid-body, round again toward the head and the tail)
  const q = 1 - s.flat * smooth((u - 0.12) / 0.25) * smooth((0.9 - u) / 0.12);
  let dy = (c < 0 ? -Math.pow(-c, q) : c) * pr.h;
  let dz = Math.sin(th) * pr.w;
  if (b.H > 0.4) dz *= 0.85 + 0.15 * c * c;
  if (s.flatHead && c > 0) dy *= 1 - 0.25 * smooth((u - 0.7) / 0.25);
  const sg = u - gillAt(s, c);
  let k = 1 + s.lip * smooth(sg / 0.006) * (1 - smooth((sg - 0.012) / 0.05)) * smooth((0.75 - c) / 0.2) * smooth((c + 0.92) / 0.15);
  k *= 1 - s.groove * grooveAt(s, th) * smooth((u - s.mouthU) / 0.025);
  return [x0 + u * xL, pr.y + dy * k, dz * k];
}

/** an even spacing with some values put in, those of the spacing too near one of them left out (its ends kept) */
function withExtras(even: number[], extras: number[], near: number): number[] {
  const lo = even[0];
  const hi = even[even.length - 1];
  const out = even.filter((x, i) => i === 0 || i === even.length - 1 || extras.every((e) => Math.abs(e - x) > near));
  for (const e of extras) if (e > lo + near && e < hi - near) out.push(e);
  return out.sort((a, c) => a - c);
}

/**
 * The body lofted (40 rings along it and 24 round at full detail), with more where its shape is modelled: rings bent to
 * follow the gill cover's edge, so its lip is one clean step, and columns along the mouth's line for its groove. Wound
 * to face out (it was wound inward, and with its back faces culled the inside of its far half was what showed). Its
 * uv: u along it, v round it (θ / 2π). The seam down its back (θ 0 and 2π: the same points twice, for the uv) is given
 * one normal; it is closed at the snout and at the tail's root.
 */
function loftBody(b: Body, s: Shape, x0: number, xL: number, detail: number): THREE.BufferGeometry {
  const TAU = Math.PI * 2;
  const NU = Math.max(10, Math.round(40 * detail));
  const NV = Math.max(8, Math.round(24 * detail));
  const us = withExtras(Array.from({ length: NU + 1 }, (_, i) => i / NU), [s.gill - 0.008, s.gill, s.gill + 0.006, s.gill + 0.014], 0.005);
  const tm = Math.acos(s.mouthC);
  const ths = withExtras(Array.from({ length: NV + 1 }, (_, j) => (j / NV) * TAU), [tm - 0.08, tm, tm + 0.08, TAU - tm - 0.08, TAU - tm, TAU - tm + 0.08], 0.03);
  const nr = us.length;
  const nc = ths.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const ur of us) {
    // (the rings near the gill cover's edge bent to run along it: the one on it exactly, those further off less)
    const bend = 1 - smooth((Math.abs(ur - s.gill) - 0.015) / 0.095);
    for (const th of ths) {
      const u = ur + (gillAt(s, Math.cos(th)) - s.gill) * bend;
      const p = surfaceAt(b, s, x0, xL, u, th);
      pos.push(p[0], p[1], p[2]);
      uv.push(u, th / TAU);
    }
  }
  for (let i = 0; i < nr - 1; i++)
    for (let j = 0; j < nc - 1; j++) {
      const a = i * nc + j;
      const c = a + nc;
      idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
  // the snout closed to a point just ahead of the last ring
  const prTip = profile(b, 1);
  const tip = pos.length / 3;
  pos.push(x0 + xL + 0.01, prTip.y, 0);
  uv.push(1, 0.5);
  const last = (nr - 1) * nc;
  for (let j = 0; j < nc - 1; j++) idx.push(last + j, last + j + 1, tip);
  // the tail's root closed by a flat cap facing back (on vertices of its own, so the body's normals stay its own)
  const cap = pos.length / 3;
  for (let j = 0; j < nc; j++) {
    pos.push(pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]);
    uv.push(0, ths[j] / TAU);
  }
  const root = pos.length / 3;
  pos.push(x0 - 0.003, profile(b, 0).y, 0);
  uv.push(0, 0.5);
  for (let j = 0; j < nc - 1; j++) idx.push(cap + j, root, cap + j + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // the seam down the back: one normal for its two copies, or the back shows a crease along it
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < nr; i++) {
    const a = i * nc;
    const z = a + nc - 1;
    const nx = nor.getX(a) + nor.getX(z);
    const ny = nor.getY(a) + nor.getY(z);
    const nz = nor.getZ(a) + nor.getZ(z);
    const l = Math.hypot(nx, ny, nz) || 1;
    nor.setXYZ(a, nx / l, ny / l, nz / l);
    nor.setXYZ(z, nx / l, ny / l, nz / l);
  }
  return g;
}

// ------------------------------------------------------------------ the skin

/** the girth of an ellipse of half-axes a and b (Ramanujan's) */
const ellipseRound = (a: number, b: number): number => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));

/** what the skin's painter is told of a body: its gill cover's edge, its mouth, its girth, its eyes and its fins' roots */
function skinShape(def: FishDef, b: Body, s: Shape, xL: number, eyes: SkinEye[], fins: SkinFin[]): SkinShape {
  return {
    family: def.family,
    gill: s.gill,
    mouthC: s.mouthC,
    mouthU: s.mouthU,
    girth: (u) => {
      const p = profile(b, u);
      return ellipseRound(p.h, p.w) / xL;
    },
    eyes,
    fins,
  };
}

/** a fish's skin in a colour of catch as a texture (fishSkin.ts paints it): its rows the uv's v as they are, not flipped */
function skinTexture(def: FishDef, sh: SkinShape, variant: Variant): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = SKIN_W;
  cv.height = SKIN_H;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(SKIN_W, SKIN_H);
  img.data.set(paintSkin(def, sh, variant));
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** the pale warm light along a fish's belly (render/materials.ts bellyTint) */
const BELLY_TINT = new THREE.Color(0.3, 0.26, 0.2);

const finVariant = (c: RGB, variant: Variant): RGB =>
  variant === 2 ? mixC([0.98, 0.9, 0.88], c, 0.15) : variant === 3 ? scaleC(c, 0.18) : variant === 4 ? mixC([0.9, 0.7, 0.25], c, 0.2) : variant === 5 ? hsl2rgb(0.8, 0.7, 0.65) : variant === 1 ? scaleC(c, 1.12) : c;

// ------------------------------------------------------------------ geometry builders

type P3 = [number, number, number];

class Builder {
  readonly pos: number[] = [];
  readonly col: number[] = [];
  readonly uv: number[] = [];
  readonly idx: number[] = [];
  /** normals given outright (a fin's sheet), kept over the ones worked out from the faces */
  private readonly given = new Map<number, P3>();
  vert(x: number, y: number, z: number, c: RGB, u = 0, v = 0): number {
    this.pos.push(x, y, z);
    this.col.push(c[0], c[1], c[2]);
    this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }
  normal(i: number, n: P3): void {
    this.given.set(i, n);
  }
  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    const nor = g.getAttribute('normal') as THREE.BufferAttribute;
    for (const [i, n] of this.given) nor.setXYZ(i, n[0], n[1], n[2]);
    return g;
  }
}

/**
 * A fin: one sheet fanned from a root line out to its edge, drawn from both sides by its material (the two windings on
 * shared vertices it once had cancelled each other's normals out and shaded it in random patches). Its normals are the
 * sheet's own at each ray: along the ray × across the fan, the side its winding faces. Its uv: u counts its rays along
 * the root (the fin's mask draws one ray in each unit of u, one at either end), v runs from the root (0) out to the edge
 * (1). Darker at the root, a little lighter at the edge. `back`: a back face as well, on vertices of its own with its
 * normals turned over, for a material drawn from one side only (the oddities' parts).
 */
function fin(bld: Builder, root: P3[], edge: P3[], base: RGB, tipC: RGB, rays: number, back = false): void {
  const n = root.length;
  const rootC = scaleC(base, 0.8);
  const edgeC = mixC(tipC, [1, 1, 1], 0.1);
  const nor: (P3 | null)[] = [];
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(n - 1, i + 1);
    // across the fan (its root and its edge together) and along the ray
    const ax = root[i1][0] - root[i0][0] + edge[i1][0] - edge[i0][0];
    const ay = root[i1][1] - root[i0][1] + edge[i1][1] - edge[i0][1];
    const az = root[i1][2] - root[i0][2] + edge[i1][2] - edge[i0][2];
    const lx = edge[i][0] - root[i][0];
    const ly = edge[i][1] - root[i][1];
    const lz = edge[i][2] - root[i][2];
    const nx = ly * az - lz * ay;
    const ny = lz * ax - lx * az;
    const nz = lx * ay - ly * ax;
    const l = Math.hypot(nx, ny, nz);
    nor.push(l > 1e-12 ? [nx / l, ny / l, nz / l] : null);
  }
  // (a ray of no length — a fin closing to a point — takes its neighbour's)
  for (let i = 1; i < n; i++) if (!nor[i]) nor[i] = nor[i - 1];
  for (let i = n - 2; i >= 0; i--) if (!nor[i]) nor[i] = nor[i + 1];
  for (let face = 0; face < (back ? 2 : 1); face++) {
    const s = face === 0 ? 1 : -1;
    const a0 = bld.pos.length / 3;
    for (let i = 0; i < n; i++) {
      const u = 0.5 + (n > 1 ? i / (n - 1) : 0) * Math.max(0, rays - 1);
      const nn = nor[i] ?? [0, 0, 1];
      const ns: P3 = [nn[0] * s, nn[1] * s, nn[2] * s];
      bld.normal(bld.vert(root[i][0], root[i][1], root[i][2], rootC, u, 0), ns);
      bld.normal(bld.vert(edge[i][0], edge[i][1], edge[i][2], edgeC, u, 1), ns);
    }
    for (let i = 0; i < n - 1; i++) {
      const r0 = a0 + i * 2;
      const r1 = a0 + (i + 1) * 2;
      if (face === 0) {
        bld.tri(r0, r0 + 1, r1 + 1);
        bld.tri(r0, r1 + 1, r1);
      } else {
        bld.tri(r0, r1 + 1, r0 + 1);
        bld.tri(r0, r1, r1 + 1);
      }
    }
  }
}

// ------------------------------------------------------------------ the fins' look

/** how much of the light behind shows through a fin's membrane (its mask's alpha) and the whole fin's opacity */
const FIN_MEMBRANE = 0.35;
const FIN_OPACITY = 0.95;
const MASK_W = 32;
const MASK_H = 128;
type FinStyle = 'soft' | 'spiny';
const MASKS = new Map<FinStyle, THREE.DataTexture>();

/**
 * A fin's mask (render/materials.ts maskMap): one ray to each unit of u, repeating, v from the root (0) to the edge
 * (1). Alpha: the rays solid, the membrane between them about 0.35 toward the edge, fuller at the fleshy root, and a
 * wide band along its edge fuller and darker; rgb: each ray two-toned, a light core between darker sides. The
 * membrane's edge scalloped a little between the rays, the rays running on past it to the fin's edge, tapering: soft
 * fins' rays fork two thirds of the way out; a spiny fin's spines taper to points past a membrane cut away between them.
 */
function finMask(style: FinStyle): THREE.DataTexture {
  let t = MASKS.get(style);
  if (t) return t;
  const data = new Uint8Array(MASK_W * MASK_H * 4);
  const px = 1 / MASK_W;
  // (coverage of a line of half-width hw at a distance d across it, antialiased over a texel)
  const cover = (d: number, hw: number): number => Math.max(0, Math.min(1, (hw - d) / px + 0.5));
  for (let j = 0; j < MASK_H; j++) {
    const v = (j + 0.5) / MASK_H;
    for (let i = 0; i < MASK_W; i++) {
      const x = (i + 0.5) / MASK_W;
      const dx = Math.abs(x - 0.5);
      let dr: number;
      let hw: number;
      let top: number;
      if (style === 'spiny') {
        dr = dx;
        hw = 0.025 + 0.12 * (1 - 0.9 * v);
        top = 0.64 + 0.34 * (1 - Math.pow(dx * 2, 1.5));
      } else {
        // (forked: two branches at ±fork about the middle, each the nearer one to its side; the membrane's edge a
        // shallow scallop between them, the rays tapering on past it)
        const fork = 0.15 * smooth((v - 0.6) / 0.4);
        dr = Math.abs(dx - fork);
        top = 0.95 - 0.1 * (dx * 2) * (dx * 2);
        hw = (0.13 - 0.05 * v) * (1 - 0.3 * smooth((v - 0.6) / 0.2)) * (1 - 0.45 * smooth((v - top) / Math.max(0.02, 1 - top)));
      }
      const ray = cover(dr, hw);
      const core = cover(dr, hw * 0.42);
      const mem = 1 - smooth((v - top + 0.03) / 0.03);
      // (the edge band: the outer sixth of the membrane, fuller and darker)
      const band = smooth((v - top + 0.2) / 0.08) * mem;
      // (the membrane fuller toward the fleshy root, about 0.35 over its outer part, and a shade darker than the fin's
      // colour so a fin still reads against bright water)
      const memA = mixN(mixN(0.95, FIN_MEMBRANE, smooth((v - 0.06) / 0.5)), 0.72, band);
      const a = Math.max(ray, memA * mem);
      const memTone = 0.92 * (1 - 0.62 * band);
      const rayTone = mixN(0.48, 0.96, core);
      const tone = mixN(memTone, rayTone, ray) * mixN(0.85, 1, smooth(v / 0.25));
      const k = (j * MASK_W + i) * 4;
      data[k] = data[k + 1] = data[k + 2] = Math.round(255 * Math.min(1, tone));
      data[k + 3] = Math.round(255 * Math.min(1, a));
    }
  }
  t = new THREE.DataTexture(data, MASK_W, MASK_H, THREE.RGBAFormat);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  MASKS.set(style, t);
  return t;
}

/** a tapered tube along points (whiskers, arms, snouts, legs); its colour one, or one along it (0 … 1) */
function tube(bld: Builder, pts: THREE.Vector3[], r0: number, r1: number, cc: RGB | ((t: number) => RGB), sides = 6): void {
  const a0 = bld.pos.length / 3;
  const t = new THREE.Vector3();
  const n1 = new THREE.Vector3();
  const n2 = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    t.subVectors(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    n1.crossVectors(t, Math.abs(t.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up).normalize();
    n2.crossVectors(t, n1).normalize();
    const r = mixN(r0, r1, i / (pts.length - 1));
    const c = typeof cc === 'function' ? cc(i / (pts.length - 1)) : cc;
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      bld.vert(p.x + (n1.x * Math.cos(a) + n2.x * Math.sin(a)) * r, p.y + (n1.y * Math.cos(a) + n2.y * Math.sin(a)) * r, p.z + (n1.z * Math.cos(a) + n2.z * Math.sin(a)) * r, scaleC(c, 0.85 + 0.15 * Math.cos(a)));
    }
  }
  // (wound to face out)
  for (let i = 0; i < pts.length - 1; i++)
    for (let k = 0; k < sides; k++) {
      const a = a0 + i * sides + k;
      const b = a0 + i * sides + ((k + 1) % sides);
      const c2 = a + sides;
      const d = b + sides;
      bld.tri(a, d, c2);
      bld.tri(a, b, d);
    }
}

/**
 * an ellipsoid (heads, bodies of the oddities, eyes) with vertex colours from a function of its unit normal; wound to
 * face out, its normals the ellipsoid's own (the poles' too, where the faces meeting have no area to give one)
 */
function blob(bld: Builder, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, colour: (nx: number, ny: number, nz: number) => RGB, seg = 12, ring = 8): void {
  const a0 = bld.pos.length / 3;
  for (let j = 0; j <= ring; j++) {
    const ph = (j / ring) * Math.PI;
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      const nx = Math.sin(ph) * Math.cos(th);
      const ny = Math.cos(ph);
      const nz = Math.sin(ph) * Math.sin(th);
      const k = bld.vert(cx + nx * rx, cy + ny * ry, cz + nz * rz, colour(nx, ny, nz));
      const mx = nx / rx;
      const my = ny / ry;
      const mz = nz / rz;
      const l = Math.hypot(mx, my, mz) || 1;
      bld.normal(k, [mx / l, my / l, mz / l]);
    }
  }
  for (let j = 0; j < ring; j++)
    for (let i = 0; i < seg; i++) {
      const a = a0 + j * (seg + 1) + i;
      const b = a + seg + 1;
      bld.tri(a, a + 1, b);
      bld.tri(a + 1, b + 1, b);
    }
}

/**
 * a ball: the unit sphere through a matrix (an ellipsoid turned and placed), its vertex colours from a function of the
 * sphere's own unit normal; wound to face out whichever way the matrix turns, its normals the ellipsoid's own
 */
function ball(bld: Builder, m: THREE.Matrix4, colour: (nx: number, ny: number, nz: number) => RGB, seg = 10, ring = 6): void {
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  const flip = m.determinant() < 0;
  const a0 = bld.pos.length / 3;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let j = 0; j <= ring; j++) {
    const ph = (j / ring) * Math.PI;
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      const nx = Math.sin(ph) * Math.cos(th);
      const ny = Math.cos(ph);
      const nz = Math.sin(ph) * Math.sin(th);
      p.set(nx, ny, nz).applyMatrix4(m);
      n.set(nx, ny, nz).applyMatrix3(nm).normalize();
      bld.normal(bld.vert(p.x, p.y, p.z, colour(nx, ny, nz)), [n.x, n.y, n.z]);
    }
  }
  for (let j = 0; j < ring; j++)
    for (let i = 0; i < seg; i++) {
      const a = a0 + j * (seg + 1) + i;
      const b = a + seg + 1;
      if (flip) {
        bld.tri(a, b, a + 1);
        bld.tri(a + 1, b, b + 1);
      } else {
        bld.tri(a, a + 1, b);
        bld.tri(a + 1, b + 1, b);
      }
    }
}

const V3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
/** a matrix placing a ball: its middle, its half-axes, turned about z (then y) */
const place = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rz = 0, ry = 0): THREE.Matrix4 =>
  new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, rz)), V3(sx, sy, sz));
/** a matrix from a frame: its middle and its three axes, each scaled */
const frameAt = (o: THREE.Vector3, t: THREE.Vector3, b: THREE.Vector3, n: THREE.Vector3, st: number, sb: number, sn: number): THREE.Matrix4 =>
  new THREE.Matrix4().makeBasis(t.clone().multiplyScalar(st), b.clone().multiplyScalar(sb), n.clone().multiplyScalar(sn)).setPosition(o);

// ------------------------------------------------------------------ the whole fish

const MATS = new Map<string, THREE.Material>();
/** a lantern's light: self-lit in its own colour */
function glowMaterial(hex: number): THREE.Material {
  const key = `glow:${hex}`;
  let m = MATS.get(key);
  if (!m) {
    m = surfaceMaterial({ vertexColors: true, ink: true, emissive: hex, emissiveIntensity: 1.1, cabinLift: true });
    MATS.set(key, m);
  }
  return m;
}
/**
 * The fins' look: drawn from both sides, a little see-through (the rays solid, the membrane between them thinner: the
 * mask), the sun shining through them from behind. (See-through, they write no ink of their own: the mask's darker rim
 * draws their edge.)
 */
function finMaterial(style: FinStyle = 'soft'): THREE.Material {
  const key = `fin:${style}`;
  let m = MATS.get(key);
  if (!m) {
    m = surfaceMaterial({ vertexColors: true, side: THREE.DoubleSide, spec: 0.12, opacity: FIN_OPACITY, maskMap: finMask(style), backLight: 0.9, cabinLift: true });
    MATS.set(key, m);
  }
  return m;
}
function partMaterial(spec: number): THREE.Material {
  const key = `part${spec}`;
  let m = MATS.get(key);
  if (!m) {
    m = surfaceMaterial({ vertexColors: true, ink: true, spec, cabinLift: true });
    MATS.set(key, m);
  }
  return m;
}
/**
 * The eyes' looks: the socket and the eyeball inked as one by a base colour of their own (the ink goes round the
 * socket, not between pupil, iris and socket), wet; the catch-lights self-lit, with the same ink so none goes round them.
 */
const EYE_INK = 0xfdfdfd;
function eyeMaterial(lights: boolean, iris: RGB = [1, 1, 1], socket: RGB = [0, 0, 0]): THREE.Material {
  const key = lights ? 'eye:lights' : `eye:${iris.join()}:${socket.join()}`;
  let m = MATS.get(key);
  if (!m) {
    // (the eyeball under its cornea a little glossy: the cornea has the wet highlights)
    m = lights
      ? surfaceMaterial({ color: EYE_INK, ink: true, inkBase: true, emissive: 0xffffff, emissiveIntensity: 1.3, cabinLift: true })
      : surfaceMaterial({ vertexColors: true, map: irisTexture(iris, socket), color: EYE_INK, ink: true, inkBase: true, spec: 0.15, cabinLift: true });
    MATS.set(key, m);
  }
  return m;
}

/**
 * The cornea: a clear dome over the eyeball that only adds its light — the sun's soft highlight and its hard glint
 * and the eye-side light's — to what is under it, the frame's alpha (the ink's ids) kept. No fog (it would add the
 * fog's colour), and no `uMapEmissive`, so a lamp's fill (bend.ts) leaves it clear.
 */
function corneaMaterial(): THREE.Material {
  let m = MATS.get('cornea') as THREE.ShaderMaterial | undefined;
  if (!m) {
    m = surfaceMaterial({ color: 0x000000, spec: 1, glint: 1, skySheen: 0.8, fog: false });
    m.transparent = true;
    m.depthWrite = false;
    m.blending = THREE.CustomBlending;
    m.blendEquation = THREE.AddEquation;
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneFactor;
    m.blendSrcAlpha = THREE.ZeroFactor;
    m.blendDstAlpha = THREE.OneFactor;
    delete m.uniforms.uMapEmissive;
    MATS.set('cornea', m);
  }
  return m;
}

/** an eye's texture: u round its pole, v from it — the eyeball's angle from its pole / EYE_V (to 100°), the socket beyond */
const EYE_V = 120;
const IRIS_W = 128;
const IRIS_H = 128;
const IRISES = new Map<string, THREE.DataTexture>();

/**
 * An eye's colours: the pupil, the iris from a light inner ring through its colour to a darker outer one, streaked
 * radially (each streak its own length and tone) with a faint ring a third of the way out, a dark limbal ring, the
 * dark of the eyeball past it, and the socket. Linear, as the vertex colours it stands in for.
 */
function irisTexture(iris: RGB, socket: RGB): THREE.DataTexture {
  const key = `${iris.join()}|${socket.join()}`;
  let t = IRISES.get(key);
  if (t) return t;
  const data = new Uint8Array(IRIS_W * IRIS_H * 4);
  const r = rng(hashStr(key));
  // (the streaks round the iris: a value and a length to each of 64, smoothed into their neighbours)
  const NS = 64;
  const sv = Array.from({ length: NS }, () => r());
  const sl = Array.from({ length: NS }, () => 0.45 + 0.55 * r());
  const streak = (x: number, f: number): number => {
    const s = x * NS;
    const i0 = Math.floor(s);
    const k = smooth(s - i0);
    const a = (i0 % NS + NS) % NS;
    const b = (a + 1) % NS;
    const val = mixN(sv[a], sv[b], k);
    const len = mixN(sl[a], sl[b], k);
    // (a streak runs out from the pupil, fading past its own length)
    return (val - 0.5) * (1 - smooth((f - len) / 0.2));
  };
  const pupil: RGB = [0.02, 0.025, 0.04];
  const inner = mixC(iris, [1, 1, 1], 0.3);
  const outer = scaleC(iris, 0.62);
  const rim = scaleC(iris, 0.28);
  const dark = mixC(socket, rim, 0.5);
  for (let j = 0; j < IRIS_H; j++) {
    const deg = ((j + 0.5) / IRIS_H) * EYE_V;
    for (let i = 0; i < IRIS_W; i++) {
      const x = (i + 0.5) / IRIS_W;
      let c: RGB;
      if (deg >= 100) c = scaleC(socket, 1 + 0.25 * smooth((deg - 112) / 6));
      else {
        // the iris, 31° … 61° from the pole
        const f = (deg - 31) / 30;
        c = f < 0.5 ? mixC(inner, iris, smooth(f / 0.5)) : mixC(iris, outer, smooth((f - 0.5) / 0.5));
        c = scaleC(c, (1 + 0.42 * streak(x, f)) * (1 - 0.14 * Math.exp(-(((f - 0.3) / 0.05) ** 2))));
        // the pupil, the limbal ring and the dark past it, each edge a crisp one
        c = mixC(c, pupil, 1 - smooth((deg - 30.2) / 1.6));
        c = mixC(c, rim, smooth((deg - 60.2) / 1.6));
        c = mixC(c, dark, smooth((deg - 70.2) / 1.6));
      }
      const k = (j * IRIS_W + i) * 4;
      data[k] = Math.round(255 * Math.min(1, c[0]));
      data[k + 1] = Math.round(255 * Math.min(1, c[1]));
      data[k + 2] = Math.round(255 * Math.min(1, c[2]));
      data[k + 3] = 255;
    }
  }
  t = new THREE.DataTexture(data, IRIS_W, IRIS_H, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  IRISES.set(key, t);
  return t;
}

/**
 * An eye on one side of the head (`side` +1 the right, −1 the left), sat on the body's own surface there: a dark socket
 * ring hugging the head (its vertices laid on the surface, raised toward the eyeball), the eyeball domed out of it —
 * a large pupil, a streaked iris lighter within and darker without, a dark rim round it (the eye's texture, irisTexture)
 * — a clear glossy cornea over it (in `cornea`), and two catch-lights on it, a larger one up and forward, a speck down
 * and back (in `lights`).
 */
/** where an eye sits on the head: its middle, the head's normal there, along the body (T) and up it (B) */
interface EyeFrame {
  P: THREE.Vector3;
  N: THREE.Vector3;
  T: THREE.Vector3;
  B: THREE.Vector3;
  /** the body's u and θ at x along T and y up B from the eye's middle (model units) */
  uv(x: number, y: number): [number, number];
  /** the point of the head there, lifted off it along N */
  on(x: number, y: number, lift: number): THREE.Vector3;
}

function eyeFrame(b: Body, s: Shape, x0: number, xL: number, side: number, u0 = b.eyeU, eyeY = b.eyeY): EyeFrame {
  const at = (u: number, th: number): THREE.Vector3 => {
    const p = surfaceAt(b, s, x0, xL, u, th);
    return new THREE.Vector3(p[0], p[1], p[2]);
  };
  const t0 = Math.acos(Math.max(-0.95, Math.min(0.95, eyeY)));
  const th0 = side > 0 ? t0 : Math.PI * 2 - t0;
  const P = at(u0, th0);
  const Pu = at(u0 + 0.002, th0).sub(at(u0 - 0.002, th0)).divideScalar(0.004);
  const Pt = at(u0, th0 + 0.01).sub(at(u0, th0 - 0.01)).divideScalar(0.02);
  const N = new THREE.Vector3().crossVectors(Pt, Pu).normalize();
  if (N.z * side < 0) N.negate();
  const T = Pu.clone().normalize();
  const B = new THREE.Vector3().crossVectors(N, T).normalize();
  if (B.y < 0) B.negate();
  const pu2 = Pu.lengthSq();
  const pt2 = Pt.lengthSq();
  const uv = (x: number, y: number): [number, number] => {
    const o = T.clone().multiplyScalar(x).addScaledVector(B, y);
    return [u0 + o.dot(Pu) / pu2, th0 + o.dot(Pt) / pt2];
  };
  return {
    P,
    N,
    T,
    B,
    uv,
    on: (x, y, lift) => {
      const [u, th] = uv(x, y);
      return at(u, th).addScaledVector(N, lift);
    },
  };
}

/** where an eye sits (u, cos θ) if not the body's place (a flatfish's) */
interface EyeLook {
  u?: number;
  y?: number;
}

function eye(eyes: Builder, lights: Builder, cornea: Builder, b: Body, s: Shape, x0: number, xL: number, side: number, er: number, iris: RGB, socket: RGB, look: EyeLook = {}): void {
  const F = eyeFrame(b, s, x0, xL, side, look.u, look.y);
  const { P, N, T, B } = F;
  // (which way round N the angles run: the faces below are wound to face out along it either way)
  const ccw = new THREE.Vector3().crossVectors(T, B).dot(N) > 0;
  const quad = (bld: Builder, a: number, a1: number, c: number, c1: number): void => {
    if (ccw) {
      bld.tri(a, c, a1);
      bld.tri(a1, c, c1);
    } else {
      bld.tri(a, a1, c);
      bld.tri(a1, c1, c);
    }
  };
  const SEG = 24;
  // ---- the socket: rings laid on the head round the eye, raised toward it (each ring closed on its own vertices, so
  // its worked-out normals have no seam)
  const RS = [0.78, 0.95, 1.08, 1.2, 1.32, 1.42];
  const white: RGB = [1, 1, 1];
  let a0 = eyes.pos.length / 3;
  for (let i = 0; i < RS.length; i++) {
    const rk = RS[i];
    const r = rk * er;
    const lift = er * (0.03 + 0.15 * (1 - smooth((rk - 1) / 0.42)));
    for (let k = 0; k < SEG; k++) {
      const ph = (k / SEG) * Math.PI * 2;
      const q = F.on(Math.cos(ph) * r, Math.sin(ph) * r, lift);
      // (its colour the eye's texture's socket rows, past the eyeball's 100°)
      eyes.vert(q.x, q.y, q.z, white, k / SEG, (100 + (20 * i) / (RS.length - 1)) / EYE_V);
    }
  }
  for (let i = 0; i < RS.length - 1; i++)
    for (let k = 0; k < SEG; k++) {
      const a = a0 + i * SEG + k;
      const a1 = a0 + i * SEG + ((k + 1) % SEG);
      quad(eyes, a, a1, a + SEG, a1 + SEG);
    }
  // ---- the eyeball: a dome out of the socket, its colours from the eye's texture by the angle from its pole (the
  // iris's gradient and streaks, its rings)
  const depth = 0.62 * er;
  const C = P.clone().addScaledVector(N, -0.1 * er);
  const rings = [0, 8, 16, 24, 31, 38, 46, 54, 61, 66, 71, 80, 90, 100];
  a0 = eyes.pos.length / 3;
  for (const deg of rings) {
    const phi = (deg * Math.PI) / 180;
    for (let k = 0; k <= SEG; k++) {
      const ph = (k / SEG) * Math.PI * 2;
      const dir = T.clone().multiplyScalar(Math.cos(ph)).addScaledVector(B, Math.sin(ph));
      const q = C.clone().addScaledVector(N, Math.cos(phi) * depth).addScaledVector(dir, Math.sin(phi) * er);
      const nn = N.clone().multiplyScalar(Math.cos(phi) / depth).addScaledVector(dir, Math.sin(phi) / er).normalize();
      eyes.normal(eyes.vert(q.x, q.y, q.z, white, k / SEG, deg / EYE_V), [nn.x, nn.y, nn.z]);
    }
  }
  for (let j = 0; j < rings.length - 1; j++)
    for (let k = 0; k < SEG; k++) {
      const a = a0 + j * (SEG + 1) + k;
      quad(eyes, a, a + 1, a + SEG + 1, a + SEG + 2);
    }
  // ---- the cornea: a clear dome a little over the eyeball, tucked under the socket's rim. (Its vertex colours, the
  // eye's bands, are for the pictures that draw it plainly: its own material reads none.)
  const pupil: RGB = [0.02, 0.025, 0.04];
  const rim = scaleC(iris, 0.28);
  const dark = mixC(socket, rim, 0.5);
  const bands: [number, RGB][] = [
    [0, pupil],
    [16, pupil],
    [31, pupil],
    [31, mixC(iris, [1, 1, 1], 0.15)],
    [46, iris],
    [61, scaleC(iris, 0.78)],
    [61, rim],
    [71, rim],
    [71, dark],
    [80, dark],
  ];
  const cd = depth + 0.06 * er;
  const cr = 1.04 * er;
  a0 = cornea.pos.length / 3;
  for (const [deg, col] of bands) {
    const phi = (deg * Math.PI) / 180;
    for (let k = 0; k <= SEG; k++) {
      const ph = (k / SEG) * Math.PI * 2;
      const dir = T.clone().multiplyScalar(Math.cos(ph)).addScaledVector(B, Math.sin(ph));
      const q = C.clone().addScaledVector(N, Math.cos(phi) * cd).addScaledVector(dir, Math.sin(phi) * cr);
      const nn = N.clone().multiplyScalar(Math.cos(phi) / cd).addScaledVector(dir, Math.sin(phi) / cr).normalize();
      cornea.normal(cornea.vert(q.x, q.y, q.z, col), [nn.x, nn.y, nn.z]);
    }
  }
  for (let j = 0; j < bands.length - 1; j++) {
    if (bands[j][0] === bands[j + 1][0]) continue;
    for (let k = 0; k < SEG; k++) {
      const a = a0 + j * (SEG + 1) + k;
      quad(cornea, a, a + 1, a + SEG + 1, a + SEG + 2);
    }
  }
  // ---- the catch-lights: small discs lying on the eyeball
  const light = (deg: number, ang: number, rad: number): void => {
    const phi = (deg * Math.PI) / 180;
    const dir = T.clone().multiplyScalar(Math.cos(ang)).addScaledVector(B, Math.sin(ang));
    const nn = N.clone().multiplyScalar(Math.cos(phi) / depth).addScaledVector(dir, Math.sin(phi) / er).normalize();
    const c = C.clone().addScaledVector(N, Math.cos(phi) * depth).addScaledVector(dir, Math.sin(phi) * er).addScaledVector(nn, 0.03 * er);
    const e1 = new THREE.Vector3().crossVectors(nn, Math.abs(nn.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const e2 = new THREE.Vector3().crossVectors(nn, e1);
    const mid = lights.vert(c.x, c.y, c.z, [1, 1, 1]);
    lights.normal(mid, [nn.x, nn.y, nn.z]);
    const ring0 = lights.pos.length / 3;
    const n = 12;
    for (let k = 0; k < n; k++) {
      const ph = (k / n) * Math.PI * 2;
      const q = c.clone().addScaledVector(e1, Math.cos(ph) * rad).addScaledVector(e2, Math.sin(ph) * rad).addScaledVector(nn, -0.15 * rad);
      lights.normal(lights.vert(q.x, q.y, q.z, [1, 1, 1]), [nn.x, nn.y, nn.z]);
    }
    // (e1 × e2 = nn: the ring runs anticlockwise about it, so these face out)
    for (let k = 0; k < n; k++) lights.tri(mid, ring0 + k, ring0 + ((k + 1) % n));
  };
  light(36, Math.atan2(0.85, 0.55), 0.2 * er);
  light(42, Math.atan2(-0.8, -0.6), 0.08 * er);
}

/** build a fish's model for a catch of a colour (`detail` 1 near, 0.5 for small pictures) */
export function buildFish(def: FishDef, variant: Variant, detail = 1): FishModel {
  const group = new THREE.Group();
  const tail = new THREE.Group();
  const own: { dispose(): void }[] = [];
  const L = def.look;
  const feat = L.f ?? [];
  const finC = finVariant(rgbOf(L.c[3]), variant);
  const backC = finVariant(rgbOf(L.c[0]), variant);
  const bellyC = finVariant(rgbOf(L.c[2]), variant);
  // (the fins drawn from the back's colour at their root to their own at the edge)
  const finRoot = mixC(finC, backC, 0.3);
  const special = def.family === 'squid' || def.family === 'octopus' || def.family === 'crayfish' || def.family === 'frog' || def.family === 'turtle' || def.family === 'cube';
  if (special) {
    const parts = new Builder();
    buildOdd(def, parts, backC, finVariant(rgbOf(L.c[1]), variant), bellyC, finC);
    const g = parts.geometry();
    own.push(g);
    group.add(new THREE.Mesh(g, partMaterial(0.3)));
    return { group, tail, dispose: () => own.forEach((o) => o.dispose()) };
  }
  const Q: Quirk = { ...NATURE[def.id], ...QUIRKS[def.id] };
  const b = bodyOf(def);
  const shape = shapeOf(def, b);
  const x0 = -0.5 + b.cl;
  const xL = 1 - b.cl;
  const prTip = profile(b, 1);
  // ---- the body, lofted (the first of the meshes: bend.ts reads its section from it); its skin is painted once the
  // fins are laid out, their roots shaded into it
  const bodyG = loftBody(b, shape, x0, xL, detail);
  own.push(bodyG);
  const bodyMesh = new THREE.Mesh(bodyG);
  group.add(bodyMesh);
  const finRoots: SkinFin[] = [];
  // ---- fins (the soft ones in one mesh, a spiny dorsal in another: their masks differ)
  const fins = new Builder();
  const spines = new Builder();
  const top = (u: number): number => {
    const p = profile(b, u);
    return p.y + p.h;
  };
  const bot = (u: number): number => {
    const p = profile(b, u);
    return p.y - p.h;
  };
  const xu = (u: number): number => x0 + u * xL;
  const long = feat.includes('longFins') ? 1.3 : 1;
  // (a ray to every 1.7 hundredths of the length along a fin's root)
  const finRows = (u0: number, u1: number, height: (t: number) => number, upper: boolean, n = 9, sweep = 0.06, style: FinStyle = 'soft'): void => {
    const root: P3[] = [];
    const edge: P3[] = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const u = mixN(u0, u1, t);
      const y = upper ? top(u) - 0.004 : bot(u) + 0.004;
      const hgt = height(t) * long;
      root.push([xu(u), y, 0]);
      edge.push([xu(u) - sweep * hgt * 4, y + (upper ? hgt : -hgt), 0]);
    }
    const rays = Math.max(3, Math.round(((u1 - u0) * xL) / (style === 'spiny' ? 0.016 : 0.017)));
    fin(style === 'spiny' ? spines : fins, root, edge, finRoot, finC, rays);
    finRoots.push({ u0, c0: upper ? 1 : -1, u1, c1: upper ? 1 : -1, side: 0 });
  };
  const H = b.H;
  switch (b.dorsal) {
    case 'mid':
      finRows(0.42, 0.62, (t) => H * 0.42 * Math.sin(Math.PI * Math.pow(t, 0.7)) * (1 - 0.3 * t), true);
      break;
    case 'long':
      finRows(0.3, 0.64, (t) => H * 0.32 * (t < 0.85 ? 0.5 + 0.5 * t : (1 - t) * 6.5 * 0.5), true, 12);
      break;
    case 'spiny':
      finRows(0.48, 0.66, (t) => H * 0.38 * (0.6 + 0.4 * Math.abs(Math.sin(t * 9))) * (1 - t * 0.4), true, 11, 0.03, 'spiny');
      finRows(0.28, 0.47, (t) => H * 0.3 * Math.sin(Math.PI * Math.min(1, t * 1.1)), true, 9);
      break;
    case 'tall':
      finRows(0.25, 0.7, (t) => H * 0.42 * Math.sin(Math.PI * t), true, 14, 0.08);
      break;
    case 'small':
      finRows(0.5, 0.6, (t) => H * 0.3 * Math.sin(Math.PI * t), true, 7);
      break;
    case 'rear':
      finRows(0.14, 0.3, (t) => H * 0.55 * Math.sin(Math.PI * t), true, 8);
      break;
    case 'fringe':
      finRows(0.08, 0.85, (t) => H * 0.12 * Math.sin(Math.PI * t), true, 18, 0.02);
      break;
    case 'eel':
      finRows(0.0, 0.62, (t) => H * 0.38 * (0.4 + 0.6 * Math.sin(Math.PI * t * 0.9)), true, 16, 0.02);
      break;
    case 'none':
      break;
  }
  if (feat.includes('crest')) finRows(0.02, 0.98, () => H * 0.55, true, 26, 0.0);
  // anal fin
  if (b.dorsal === 'fringe') finRows(0.08, 0.7, (t) => H * 0.12 * Math.sin(Math.PI * t), false, 16, 0.02);
  else if (b.dorsal === 'eel') finRows(0.0, 0.45, (t) => H * 0.3 * (0.5 + 0.5 * Math.sin(Math.PI * t)), false, 14, 0.02);
  else if (feat.includes('mola')) {
    finRows(0.3, 0.46, (t) => H * 0.42 * Math.sin(Math.PI * t), true, 8, 0.1);
    finRows(0.3, 0.46, (t) => H * 0.42 * Math.sin(Math.PI * t), false, 8, 0.1);
  } else finRows(0.16, 0.3, (t) => H * (b.dorsal === 'tall' ? 0.4 : 0.26) * Math.sin(Math.PI * t), false, 8);
  // pectoral fins (both sides) and pelvic fins
  const pect = (side: number): void => {
    const u = 0.76;
    const px = xu(u);
    const pyv = profile(b, u).y - profile(b, u).h * 0.45;
    const pz = profile(b, u).w * 0.85 * side;
    const len = (feat.includes('bigFins') ? 0.16 : feat.includes('threadFins') ? 0.12 : 0.075) * long;
    const root: P3[] = [];
    const edge: P3[] = [];
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      root.push([px - 0.012 * t, pyv + 0.025 * t, pz]);
      const sp = feat.includes('threadFins') ? 0.15 : 1;
      edge.push([px - len * (0.9 + 0.2 * Math.sin(Math.PI * t)), pyv - 0.01 + 0.04 * t * sp, pz + side * len * 0.45]);
    }
    fin(fins, root, edge, finRoot, finC, 9);
    finRoots.push({ u0: u, c0: -0.45, u1: u - 0.012 / xL, c1: -0.45 + 0.025 / Math.max(1e-3, profile(b, u).h), side });
  };
  pect(1);
  pect(-1);
  if (def.family !== 'eel') {
    for (const side of [1, -1]) {
      const u = 0.55;
      const px = xu(u);
      const y = bot(u) + 0.004;
      const pz = profile(b, u).w * 0.35 * side;
      const root: P3[] = [];
      const edge: P3[] = [];
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        root.push([px - 0.04 * t, y, pz]);
        edge.push([px - 0.04 * t - 0.05, y - 0.04 * Math.sin(Math.PI * (0.3 + 0.7 * t)) * long, pz + side * 0.015]);
      }
      fin(fins, root, edge, finRoot, finC, 6);
      finRoots.push({ u0: u, c0: -0.94, u1: u - 0.04 / xL, c1: -0.94, side });
    }
  }
  // finlets (mackerel, tuna): each one ray
  if (feat.includes('finlets')) {
    for (let k = 0; k < 6; k++) {
      const u = 0.04 + k * 0.035;
      for (const upper of [true, false]) {
        const y = upper ? top(u) : bot(u);
        fin(fins, [[xu(u), y, 0], [xu(u) - 0.01, y, 0]], [[xu(u) - 0.012, y + (upper ? 0.025 : -0.025), 0], [xu(u) - 0.022, y + (upper ? 0.02 : -0.02), 0]], rgbOf(L.c[3]), rgbOf(L.c[3]), 1);
      }
    }
  }
  const finsG = fins.geometry();
  own.push(finsG);
  group.add(new THREE.Mesh(finsG, finMaterial()));
  if (spines.pos.length) {
    const spinesG = spines.geometry();
    own.push(spinesG);
    group.add(new THREE.Mesh(spinesG, finMaterial('spiny')));
  }
  // ---- the tail fin, on its own pivot
  const tb = new Builder();
  const pedH = profile(b, 0).h;
  const span = Math.max(pedH * 2.6, H * (b.caudal === 'lunate' ? 0.75 : 0.55)) * (feat.includes('longTail') ? 1.4 : 1);
  const cl = b.cl * (feat.includes('longTail') ? 1.8 : 1);
  const tn = 13;
  const root: P3[] = [];
  const edge: P3[] = [];
  for (let i = 0; i < tn; i++) {
    const t = i / (tn - 1);
    const s = t * 2 - 1;
    root.push([0, s * pedH * 0.95, 0]);
    let ex: number;
    let ey = s * span * 0.5;
    switch (b.caudal) {
      case 'fork':
        ex = -cl * (0.55 + 0.45 * Math.pow(Math.abs(s), 1.3));
        break;
      case 'lunate':
        ex = -cl * (0.35 + 0.65 * Math.pow(Math.abs(s), 1.8));
        ey *= 1.15;
        break;
      case 'trunc':
        ex = -cl * (0.92 - 0.08 * s * s);
        break;
      case 'round':
        ex = -cl * Math.sqrt(Math.max(0, 1 - s * s * 0.7));
        ey *= 0.85;
        break;
      case 'hetero':
        ex = -cl * (s > 0 ? 0.6 + 0.6 * s : 0.6 + 0.2 * -s);
        ey = s > 0 ? s * span * 0.6 : s * span * 0.3;
        break;
      default:
        ex = -cl * 0.6 * (1 - Math.abs(s));
        ey *= 0.5;
    }
    edge.push([ex, ey, 0]);
  }
  fin(tb, root, edge, finRoot, finC, b.caudal === 'eel' ? 10 : 19);
  const tailG = tb.geometry();
  own.push(tailG);
  tail.add(new THREE.Mesh(tailG, finMaterial()));
  tail.position.set(x0 + 0.004, profile(b, 0).y, 0);
  group.add(tail);
  // (where the eyes go, a fifth larger than they were: a flatfish's both on the side shown; none under an eyepatch)
  const er = b.eye * 1.2;
  const places: ({ side: number } & EyeLook)[] = (
    Q.oneSide
      ? [
          { side: 1, u: b.eyeU, y: 0.55 },
          { side: 1, u: b.eyeU - 0.07, y: 0.05 },
        ]
      : [{ side: 1 }, { side: -1 }]
  ).filter((p) => !(Q.eyewear === 'patch' && p.side > 0));
  // ---- the skin, painted with the eyes' sockets and the fins' roots shaded into it, and its look: the broad highlight
  // softer than it was (the wet glint is the bright one now), the sun's rim on its lit edge
  const skinEyes: SkinEye[] = places.map((p) => ({ u: p.u ?? b.eyeU, c: p.y ?? b.eyeY, side: p.side, r: er / xL }));
  const sh = skinShape(def, b, shape, xL, skinEyes, finRoots);
  let mat: THREE.Material;
  const tex = skinTexture(def, sh, variant);
  const glow = feat.includes('glow');
  const spec = (variant === 4 ? 0.95 : variant === 1 || variant === 5 ? 0.8 : b.spec) * 0.55;
  const glint = variant === 4 || variant === 1 || variant === 5 ? 1 : 0.8;
  // (wet and finely modelled: the skin's relief and wetness, the sky in it at a grazing angle, the cel light's steps
  // softened over the round of the body, a pale warm light along the belly's edge; the relief made once for each kind
  // and colour and shared, so not the model's own to dispose of)
  const wetLook = { detailMap: detailTexture(def, sh, variant), skySheen: 0.5, soft: true, bellyTint: BELLY_TINT };
  if (tex) {
    own.push(tex);
    // (inked by its base colour, not by its skin: the ink goes round the fish, not along every scale and stripe of it)
    mat = surfaceMaterial({ map: tex, ink: true, inkBase: true, spec, rim: 1, glint, emissive: glow ? (L.pc ?? 0xffffff) : 0x000000, emissiveIntensity: glow ? 0.12 : 0, cabinLift: true, ...wetLook });
  } else {
    mat = surfaceMaterial({ color: L.c[1], ink: true, spec, rim: 1, glint, cabinLift: true, ...wetLook });
  }
  own.push(mat);
  bodyMesh.material = mat;
  // ---- the eyes: a dark socket, the eyeball with its streaked iris, the clear cornea, the catch-lights
  const eyes = new Builder();
  const lights = new Builder();
  const cornea = new Builder();
  const iris: RGB = variant === 2 ? [0.9, 0.25, 0.3] : feat.includes('redEye') ? [0.8, 0.15, 0.1] : feat.includes('glowEye') ? [0.95, 0.85, 0.35] : feat.includes('glassEye') ? [0.8, 0.85, 0.75] : [0.85, 0.7, 0.32];
  const socket = mixC(scaleC(backC, 0.3), [0.05, 0.05, 0.07], 0.5);
  for (const p of places) eye(eyes, lights, cornea, b, shape, x0, xL, p.side, er, iris, socket, { u: p.u, y: p.y });
  const eyesG = eyes.geometry();
  const lightsG = lights.geometry();
  const corneaG = cornea.geometry();
  own.push(eyesG, lightsG, corneaG);
  const corneaM = new THREE.Mesh(corneaG, corneaMaterial());
  corneaM.userData.cornea = true;
  group.add(new THREE.Mesh(eyesG, eyeMaterial(false, iris, socket)), new THREE.Mesh(lightsG, eyeMaterial(true)), corneaM);
  // ---- whiskers, snouts, scutes, oddments
  const parts = new Builder();
  if (Q.stache === undefined && (feat.includes('whiskers') || feat.includes('barbels') || feat.includes('chinBarbel'))) {
    const n = feat.includes('chinBarbel') ? 1 : def.family === 'catfish' ? 3 : feat.includes('barbels') ? 1 : 2;
    const len = def.family === 'catfish' ? 0.22 : 0.09;
    for (let k = 0; k < n; k++)
      for (const side of feat.includes('chinBarbel') ? [0] : [1, -1]) {
        const pts: THREE.Vector3[] = [];
        const sx = 0.5 - 0.01 - k * 0.025;
        const sy = profile(b, 0.98).y - profile(b, 0.98).h * (0.2 + 0.25 * k);
        for (let i = 0; i < 6; i++) {
          const t = i / 5;
          pts.push(new THREE.Vector3(sx - len * t * 0.8, sy - len * 0.35 * t - 0.1 * len * t * t * (k + 1), side * (profile(b, 0.98).w + len * 0.5 * t)));
        }
        tube(parts, pts, 0.006, 0.0015, scaleC(backC, 0.8), 4);
      }
  }
  if (feat.includes('snout') || feat.includes('trunk')) {
    const pts: THREE.Vector3[] = [];
    const len = feat.includes('trunk') ? 0.12 : 0.16;
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      pts.push(new THREE.Vector3(0.49 + len * t, prTip.y - (feat.includes('trunk') ? 0.06 * t * t : 0), 0));
    }
    tube(parts, pts, profile(b, 0.97).h * 0.7, 0.004, scaleC(backC, 0.95), 7);
  }
  if (feat.includes('scutes') || feat.includes('armor')) {
    for (let k = 0; k < 12; k++) {
      const u = 0.18 + k * 0.055;
      const y = top(u);
      blob(parts, xu(u), y, 0, 0.012, 0.014, 0.008, () => scaleC(bellyC, 0.9), 5, 3);
      for (const side of [1, -1]) blob(parts, xu(u), profile(b, u).y, side * profile(b, u).w * 0.98, 0.01, 0.01, 0.006, () => scaleC(bellyC, 0.85), 5, 3);
    }
  }
  if (feat.includes('spikes')) {
    const r = rng(hashStr(def.id) ^ 5);
    for (let k = 0; k < 40; k++) {
      const u = 0.15 + 0.7 * r();
      const th = r() * Math.PI * 2;
      const p = profile(b, u);
      const base = new THREE.Vector3(xu(u), p.y + Math.cos(th) * p.h, Math.sin(th) * p.w);
      const out = new THREE.Vector3(0, Math.cos(th), Math.sin(th)).multiplyScalar(0.035);
      tube(parts, [base, base.clone().add(out)], 0.006, 0.0005, scaleC(backC, 1.1), 4);
    }
  }
  if (feat.includes('teeth') || feat.includes('tusks') || feat.includes('fangs')) {
    for (let k = 0; k < (feat.includes('tusks') ? 6 : 8); k++) {
      const x = 0.47 - k * 0.012;
      for (const side of [1, -1]) {
        const p = profile(b, (x - x0) / xL);
        const base = new THREE.Vector3(x, p.y - p.h * 0.05, side * p.w * 0.7);
        tube(parts, [base, base.clone().add(new THREE.Vector3(0, -0.018 * (feat.includes('tusks') ? 1.6 : 1), side * 0.002))], 0.0035, 0.0005, [0.97, 0.95, 0.9], 4);
      }
    }
  }
  if (feat.includes('cap')) {
    blob(parts, 0.32, top(0.82) + 0.02, 0, 0.11, 0.06, 0.11, (nx, ny) => (ny > 0.1 ? finVariant(rgbOf(0xc0402a), variant) : [0.95, 0.9, 0.82]), 14, 7);
  }
  if (feat.includes('moss')) {
    const r = rng(hashStr(def.id) ^ 11);
    for (let k = 0; k < 26; k++) {
      const u = 0.25 + 0.5 * r();
      blob(parts, xu(u), top(u) - 0.004, (r() - 0.5) * profile(b, u).w, 0.018 + 0.015 * r(), 0.01, 0.014, () => mixC([0.25, 0.42, 0.16], [0.4, 0.55, 0.2], r()), 6, 3);
    }
  }
  // ---- the touches (QUIRKS, NATURE): teeth and a hooked jaw, a moustache, eyewear, headgear, a lantern's light
  const glows = new Builder();
  const gear = new Builder();
  dress(Q, { def, b, s: shape, x0, xL, variant, er, backC, parts, gear, glows });
  if (gear.pos.length) {
    const gg = gear.geometry();
    own.push(gg);
    group.add(new THREE.Mesh(gg, partMaterial(0.12)));
  }
  if (parts.pos.length) {
    const pg = parts.geometry();
    own.push(pg);
    group.add(new THREE.Mesh(pg, partMaterial(0.6)));
  }
  if (glows.pos.length && Q.lantern !== undefined) {
    const gg = glows.geometry();
    own.push(gg);
    group.add(new THREE.Mesh(gg, glowMaterial(Q.lantern)));
  }
  return { group, tail, dispose: () => own.forEach((o) => o.dispose()) };
}

/** what the touches are built from */
interface Kit {
  def: FishDef;
  b: Body;
  s: Shape;
  x0: number;
  xL: number;
  variant: Variant;
  /** the eyes' radius */
  er: number;
  backC: RGB;
  parts: Builder;
  /** the matte parts: hair, hats, eyewear */
  gear: Builder;
  glows: Builder;
}

/** a kind's touches (QUIRKS, NATURE), sized by its head, in the parts' mesh (a lantern's light in `glows`) */
function dress(q: Quirk, k: Kit): void {
  const { b, s, x0, xL, variant } = k;
  // (glossy: teeth and jaws; then matte for hair, hats and eyewear, which a wet highlight would wash out)
  let parts = k.parts;
  // (eyewear goes by an eye no smaller than a middling one: a catfish's pinhead eyes would hide it)
  const er = Math.max(k.er, 0.022);
  const TAU = Math.PI * 2;
  const xu = (u: number): number => x0 + u * xL;
  const top = (u: number): number => {
    const p = profile(b, u);
    return p.y + p.h;
  };
  const S = (u: number, th: number): THREE.Vector3 => {
    const p = surfaceAt(b, s, x0, xL, u, th);
    return V3(p[0], p[1], p[2]);
  };
  /** a point of the surface lifted straight out from the body's middle line */
  const off = (p: THREE.Vector3, u: number, lift: number): THREE.Vector3 => {
    const pr = profile(b, Math.max(0, Math.min(1, u)));
    return p.clone().add(V3(0, p.y - pr.y, p.z).normalize().multiplyScalar(lift));
  };
  /** how far out the skin is (z) at a place on the side, x along and y up */
  const skinZ = (x: number, y: number): number => {
    const p = profile(b, Math.max(0, Math.min(1, (x - x0) / xL)));
    const t = (y - p.y) / Math.max(1e-4, p.h);
    return p.w * Math.sqrt(Math.max(0, 1 - t * t));
  };
  const tm = Math.acos(s.mouthC);
  // the mouth's height at the snout, the head's height just behind it
  const yM = S(0.99, tm).y;
  const hT = profile(b, 0.95).h;
  const sc = Math.max(0.7, Math.min(1.5, hT / 0.07));
  const white: RGB = [0.98, 0.97, 0.92];
  const one = (c: RGB) => (): RGB => c;
  const lit = (c: RGB) => (_nx: number, ny: number): RGB => mixC(scaleC(c, 0.72), mixC(c, [1, 1, 1], 0.1), smooth((ny + 0.6) / 1.2));
  // ---- teeth and jaws
  if (q.teeth === 'kype') {
    // a spawning salmon's hooked jaw, curled down over the lower one
    const kh = Math.max(0.02, hT * 0.5);
    const kc = k.def.look.f?.includes('greenHead') ? finVariant([0.23, 0.42, 0.29], variant) : k.backC;
    tube(parts, [V3(0.48, yM + kh * 0.6, 0), V3(0.51, yM + kh * 0.55, 0), V3(0.533, yM + kh * 0.25, 0), V3(0.54, yM - kh * 0.2, 0), V3(0.53, yM - kh * 0.5, 0)], kh * 0.45, kh * 0.1, kc, 8);
  } else if (q.teeth === 'rows') {
    // rows of pointed teeth along the mouth's line: points down from above it and up from below, in turn
    const tl = Math.max(0.007, hT * 0.12);
    const n = Math.max(3, Math.min(9, Math.round(((1 - s.mouthU) * xL) / (tl * 1.1))));
    for (let i = 0; i < n; i++) {
      const u = s.mouthU + 0.012 + ((1 - s.mouthU - 0.02) * (i + 0.5)) / n;
      const dn = i % 2 === 0 ? -1 : 1;
      for (const side of [1, -1]) {
        const p = S(u, side > 0 ? tm : TAU - tm);
        tube(parts, [V3(p.x, p.y - dn * tl * 0.3, p.z + side * tl * 0.2), V3(p.x + 0.002, p.y + dn * tl * 0.75, p.z + side * tl * 0.25)], tl * 0.32, 0.0006, white, 4);
      }
    }
  }
  parts = k.gear;
  // ---- a long drooping moustache from under the snout, both sides
  if (q.stache !== undefined) {
    const col = finVariant(rgbOf(q.stache), variant);
    const path: [number, number, number][] = [[0, 0, 0], [-0.01, -0.012, 0.006], [-0.02, -0.04, 0.01], [-0.024, -0.075, 0.012], [-0.02, -0.11, 0.012], [-0.01, -0.145, 0.012]];
    const r0 = 0.009 * sc;
    const r1 = 0.0018 * sc;
    const rx = 0.5 - 0.004;
    const ry = yM + Math.max(0.006, hT * 0.15);
    for (const side of [1, -1]) {
      const pts = path.map(([dx, dy, dz], i) => {
        const x = rx + dx * sc;
        const y = ry + dy * sc;
        const r = mixN(r0, r1, i / (path.length - 1));
        return V3(x, y, side * (skinZ(x, y) + r * 0.8 + 0.002 + dz * sc));
      });
      tube(parts, pts, r0, r1, col, 6);
      ball(parts, place(pts[0].x, pts[0].y, pts[0].z, r0, r0, r0), one(col), 6, 4);
    }
  }
  // ---- eyewear on the eye shown
  if (q.eyewear) {
    const F = eyeFrame(b, s, x0, xL, 1);
    if (q.eyewear === 'monocle') {
      const gold: RGB = [0.96, 0.78, 0.3];
      const R = er * 1.5;
      const ring: THREE.Vector3[] = [];
      for (let i = 0; i <= 18; i++) {
        const a = (i / 18) * TAU;
        ring.push(F.P.clone().addScaledVector(F.T, Math.cos(a) * R).addScaledVector(F.B, Math.sin(a) * R).addScaledVector(F.N, er * 0.55));
      }
      tube(parts, ring, er * 0.13, er * 0.13, gold, 5);
      // its chain, hanging back to the flank behind the gill cover
      const c0 = ring[11];
      const c1 = off(S(Math.max(0.55, s.gill - 0.06), Math.PI * 0.56), s.gill - 0.06, 0.004);
      const chain: THREE.Vector3[] = [];
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        chain.push(c0.clone().lerp(c1, t).add(V3(0, -0.035 * Math.sin(Math.PI * t), 0.008 * Math.sin(Math.PI * t))));
      }
      tube(parts, chain, er * 0.05, er * 0.05, gold, 4);
    } else {
      const black: RGB = [0.06, 0.05, 0.05];
      ball(parts, frameAt(F.P.clone().addScaledVector(F.N, er * 0.12), F.T, F.B, F.N, er * 1.55, er * 1.4, er * 0.3), (_nx, ny, nz) => scaleC(black, 1 + 1.2 * Math.max(0, nz) * Math.max(0, ny)), 12, 6);
      // its strap, from the patch's top over the head and down behind the other eye
      const [u1, th1] = F.uv(er * 0.3, er * 1.3);
      const strap: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const u = u1 - 0.05 * smooth(t);
        strap.push(off(S(u, th1 * (1 - 2 * t)), u, 0.004));
      }
      tube(parts, strap, er * 0.16, er * 0.16, black, 4);
    }
  }
  // ---- headgear, on the head just behind the eyes, tipped back a little at a jaunty angle
  if (q.hat) {
    const hat = q.hat;
    const hu = Math.min(0.83, b.eyeU - 0.035);
    const slope = (top(hu + 0.01) - top(hu - 0.01)) / (0.02 * xL);
    const hs = Math.max(0.036, Math.min(0.08, profile(b, hu).w * 0.95 + 0.014));
    const hm = new THREE.Matrix4().compose(V3(xu(hu), top(hu) - hs * 0.15, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.atan(slope) + 0.22)), V3(1, 1, 1));
    const P = (x: number, y: number, z = 0): THREE.Vector3 => V3(x, y, z).applyMatrix4(hm);
    const M = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rz = 0): THREE.Matrix4 => hm.clone().multiply(place(x, y, z, sx, sy, sz, rz));
    switch (hat) {
      case 'crown':
      case 'trident':
      case 'icecrown': {
        // a king's crown of gold with jewelled points, the sea's three-pronged one, the ice's of icicles
        const ice = hat === 'icecrown';
        const metal: RGB = ice ? [0.8, 0.93, 1] : [0.98, 0.76, 0.22];
        const n = hat === 'trident' ? 3 : ice ? 7 : 5;
        const r = rng(hashStr(k.def.id) ^ 0x3c);
        tube(parts, [P(0, 0), P(0, hs * 0.55)], hs * 0.9, hs * 0.98, metal, 14);
        for (let i = 0; i < n; i++) {
          const a = hat === 'trident' ? [0, Math.PI / 2, Math.PI][i] : (i / n) * TAU + 0.3;
          const ht = hs * (hat === 'trident' ? (i === 1 ? 2.1 : 1.5) : ice ? 0.7 + 1.1 * r() : 1.05);
          const bx = Math.cos(a) * hs * 0.94;
          const bz = Math.sin(a) * hs * 0.94;
          tube(parts, [P(bx, hs * 0.5, bz), P(bx * 1.08, hs * 0.5 + ht, bz * 1.08)], hs * (ice ? 0.24 : hat === 'trident' ? 0.2 : 0.3), hs * 0.02, metal, 5);
          if (hat === 'trident') tube(parts, [P(bx * 1.04, hs * 0.5 + ht * 0.62, bz * 1.04), P(bx * 1.04 + hs * 0.22, hs * 0.5 + ht * 0.45, bz * 1.04)], hs * 0.1, hs * 0.02, metal, 4);
          else if (!ice) ball(parts, M(bx * 1.08, hs * 0.5 + ht, bz * 1.08, hs * 0.14, hs * 0.14, hs * 0.14), one(i % 2 ? [0.2, 0.45, 0.95] : [0.9, 0.15, 0.2]), 6, 4);
        }
        if (!ice) ball(parts, M(0, hs * 0.28, hs * 0.96, hs * 0.18, hs * 0.18, hs * 0.08), one([0.85, 0.12, 0.2]), 8, 4);
        break;
      }
      case 'antlers': {
        // a forest spirit's twiggy antlers, a leaf or two on them
        const bark: RGB = [0.52, 0.37, 0.22];
        const leaf: RGB = [0.42, 0.7, 0.26];
        const kk = hs / 0.05;
        for (const side of [1, -1]) {
          const z0 = side * hs * 0.55;
          const A = (x: number, y: number, z: number): THREE.Vector3 => P(x * kk, y * kk, z0 + side * z * kk);
          const beam = [A(0, -0.005, 0), A(-0.005, 0.04, 0.01), A(-0.02, 0.085, 0.022), A(-0.045, 0.12, 0.03), A(-0.075, 0.135, 0.034)];
          tube(parts, beam, 0.008 * kk, 0.0035 * kk, bark, 6);
          tube(parts, [beam[1], A(0.015, 0.07, 0.016), A(0.028, 0.095, 0.018)], 0.005 * kk, 0.0025 * kk, bark, 5);
          tube(parts, [beam[2], A(-0.01, 0.12, 0.028), A(-0.004, 0.152, 0.03)], 0.005 * kk, 0.0025 * kk, bark, 5);
          ball(parts, M(0.03 * kk, 0.1 * kk, z0 + side * 0.02 * kk, 0.013 * kk, 0.005 * kk, 0.008 * kk, 0.6), lit(leaf), 8, 4);
        }
        break;
      }
      case 'horns': {
        // a lava lord's horns, sweeping back, glowing at their tips
        for (const side of [1, -1]) {
          const pts = [P(0.01, -0.005, side * hs * 0.5), P(0.005, hs * 0.8, side * hs * 0.75), P(-hs * 0.4, hs * 1.5, side * hs * 0.95), P(-hs * 1.1, hs * 1.75, side * hs), P(-hs * 1.6, hs * 1.55, side * hs)];
          tube(parts, pts, hs * 0.38, hs * 0.03, (t) => mixC([0.16, 0.12, 0.11], [1, 0.55, 0.15], Math.pow(t, 2.2)), 7);
        }
        break;
      }
      case 'nightcap': {
        // a striped nightcap flopping back over, a bobble on its end
        const c1: RGB = [0.38, 0.45, 0.92];
        const c2: RGB = [0.97, 0.95, 0.88];
        const ctl = [V3(0, 0, 0), V3(-0.05, 0.8, 0), V3(-0.3, 1.55, 0), V3(-0.85, 2.0, 0), V3(-1.55, 1.85, 0), V3(-2.0, 1.3, 0), V3(-2.15, 0.85, 0)];
        const curve = new THREE.CatmullRomCurve3(ctl);
        const pts = curve.getPoints(16).map((p) => P(p.x * hs, p.y * hs, 0));
        tube(parts, pts, hs * 1.02, hs * 0.12, (t) => (Math.floor(t * 16 + 0.5) % 4 < 2 ? c1 : c2), 12);
        tube(parts, [P(0, -hs * 0.12), P(0, hs * 0.32)], hs * 1.14, hs * 1.1, c2, 14);
        const e = ctl[ctl.length - 1];
        ball(parts, M(e.x * hs, e.y * hs - hs * 0.12, 0, hs * 0.36, hs * 0.36, hs * 0.36), lit([1, 0.97, 0.9]), 8, 6);
        break;
      }
      case 'pschent': {
        // the pharaoh's double crown: a red bowl, a tall white crown out of it, a gold cobra at the front
        const red: RGB = [0.78, 0.18, 0.14];
        const ivory: RGB = [0.96, 0.94, 0.86];
        const gold: RGB = [0.95, 0.74, 0.2];
        tube(parts, [P(0, -0.004), P(0, hs * 0.85)], hs * 0.95, hs * 1.05, red, 14);
        ball(parts, M(0, hs * 0.85, 0, hs * 1.05, hs * 0.06, hs * 1.05), one(red), 14, 3);
        tube(parts, [P(0, hs * 0.5), P(-hs * 0.2, hs * 1.8), P(-hs * 0.35, hs * 2.5)], hs * 0.7, hs * 0.28, ivory, 12);
        ball(parts, M(-hs * 0.35, hs * 2.55, 0, hs * 0.3, hs * 0.3, hs * 0.3), one(ivory), 8, 5);
        tube(parts, [P(hs * 0.9, hs * 0.1), P(hs * 1.15, hs * 0.45), P(hs * 1.05, hs * 0.85)], hs * 0.13, hs * 0.08, gold, 5);
        break;
      }
      case 'feathers': {
        // a headdress of three tall feathers, red fading to teal at their tips, on a gold bead
        for (let i = 0; i < 3; i++) {
          const a = 0.4 - i * 0.4;
          ball(parts, M(-Math.sin(a) * hs * 1.5, Math.cos(a) * hs * 1.5, (i - 1) * hs * 0.12, hs * 0.32, hs * 1.55, hs * 0.07, a), (_nx, ny) => mixC([0.86, 0.2, 0.14], [0.1, 0.62, 0.6], smooth((ny - 0.2) / 0.6)), 8, 6);
        }
        ball(parts, M(0, hs * 0.1, 0, hs * 0.35, hs * 0.3, hs * 0.35), lit([0.95, 0.74, 0.2]), 8, 5);
        break;
      }
    }
  }
  // ---- a lantern on a stalk from the forehead, arching out ahead of the snout
  if (q.lantern !== undefined) {
    const lu = Math.min(0.92, b.eyeU + 0.01);
    const ls = Math.max(0.7, Math.min(1.4, b.H / 0.26));
    const A = V3(xu(lu), top(lu) - 0.004, 0);
    const path: [number, number][] = [[0, 0], [0.004, 0.06], [0.025, 0.115], [0.065, 0.14], [0.105, 0.125], [0.125, 0.09]];
    const pts = path.map(([dx, dy]) => V3(A.x + dx * ls, A.y + dy * ls, 0));
    tube(parts, pts, 0.0065 * ls, 0.003 * ls, scaleC(k.backC, 0.85), 6);
    const e = pts[pts.length - 1];
    const lc = rgbOf(q.lantern);
    ball(k.glows, place(e.x, e.y - 0.024 * ls, 0, 0.024 * ls, 0.028 * ls, 0.024 * ls), (_nx, ny) => mixC(lc, [1, 1, 1], 0.35 * Math.max(0, ny)), 10, 7);
  }
}

/** the oddities: built whole from parts (all in one vertex-coloured mesh) */
function buildOdd(def: FishDef, bld: Builder, backC: RGB, flankC: RGB, bellyC: RGB, finC: RGB): void {
  const r = rng(hashStr(def.id));
  const shade = (base: RGB, under: RGB) => (_nx: number, ny: number) => mixC(under, base, smooth((ny + 0.4) / 0.9));
  switch (def.family) {
    case 'squid': {
      // the mantle (+x), its fins at the tip, the head and arms (−x)
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        blob(bld, 0.25 - 0.1 * t, 0, 0, 0.26 - t * 0.04, 0.085, 0.085, shade(flankC, bellyC), 12, 6);
      }
      fin(bld, [[0.42, 0, 0], [0.3, 0, 0]], [[0.4, 0, 0.12], [0.3, 0, 0.0]], finC, finC, 1, true);
      fin(bld, [[0.42, 0, 0], [0.3, 0, 0]], [[0.4, 0, -0.12], [0.3, 0, 0.0]], finC, finC, 1, true);
      blob(bld, -0.08, 0, 0, 0.07, 0.06, 0.06, shade(flankC, bellyC), 10, 6);
      blob(bld, -0.07, 0.025, 0.045, 0.016, 0.016, 0.01, () => [0.05, 0.05, 0.06], 8, 4);
      blob(bld, -0.07, 0.025, -0.045, 0.016, 0.016, 0.01, () => [0.05, 0.05, 0.06], 8, 4);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const long = k === 2 || k === 7 ? 1.9 : 1;
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < 7; i++) {
          const t = i / 6;
          pts.push(new THREE.Vector3(-0.12 - 0.3 * t * long, Math.cos(a) * 0.035 * (1 + t) - 0.02 * t * t, Math.sin(a) * 0.035 * (1 + t)));
        }
        tube(bld, pts, 0.012, 0.003, flankC, 5);
      }
      break;
    }
    case 'octopus': {
      blob(bld, 0.18, 0.08, 0, 0.18, 0.15, 0.15, shade(backC, flankC), 14, 8);
      blob(bld, 0.05, 0.06, 0.09, 0.02, 0.02, 0.012, () => [0.95, 0.85, 0.4], 8, 4);
      blob(bld, 0.05, 0.06, -0.09, 0.02, 0.02, 0.012, () => [0.95, 0.85, 0.4], 8, 4);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.2;
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < 9; i++) {
          const t = i / 8;
          const curl = 0.5 + r() * 0.2;
          pts.push(new THREE.Vector3(0.02 - 0.36 * t + 0.08 * Math.sin(t * 5 * curl), -0.04 - 0.06 * t + 0.05 * Math.sin(t * 6 + k), Math.sin(a) * (0.05 + 0.25 * t)));
        }
        tube(bld, pts, 0.03, 0.004, flankC, 6);
      }
      break;
    }
    case 'crayfish': {
      for (let k = 0; k < 6; k++) blob(bld, -0.05 - k * 0.07, 0, 0, 0.045, 0.05 - k * 0.004, 0.055 - k * 0.004, shade(backC, bellyC), 10, 5);
      fin(bld, [[-0.45, 0, -0.05], [-0.45, 0, 0.05]], [[-0.52, 0, -0.09], [-0.52, 0, 0.09]], finC, finC, 1, true);
      blob(bld, 0.12, 0.01, 0, 0.13, 0.065, 0.07, shade(backC, bellyC), 12, 6);
      for (const side of [1, -1]) {
        tube(bld, [new THREE.Vector3(0.18, 0, side * 0.05), new THREE.Vector3(0.3, 0.01, side * 0.12), new THREE.Vector3(0.38, 0.01, side * 0.13)], 0.018, 0.012, backC, 6);
        blob(bld, 0.45, 0.01, side * 0.14, 0.08, 0.03, 0.04, shade(backC, bellyC), 10, 5);
        tube(bld, [new THREE.Vector3(0.24, 0.02, side * 0.02), new THREE.Vector3(0.45, 0.06, side * 0.1), new THREE.Vector3(0.62, 0.02, side * 0.22)], 0.004, 0.0015, backC, 4);
        for (let k = 0; k < 4; k++) tube(bld, [new THREE.Vector3(0.1 - k * 0.04, -0.03, side * 0.05), new THREE.Vector3(0.08 - k * 0.04, -0.07, side * 0.12)], 0.006, 0.003, flankC, 4);
      }
      blob(bld, 0.22, 0.04, 0.035, 0.012, 0.012, 0.012, () => [0.04, 0.04, 0.05], 6, 4);
      blob(bld, 0.22, 0.04, -0.035, 0.012, 0.012, 0.012, () => [0.04, 0.04, 0.05], 6, 4);
      break;
    }
    case 'frog': {
      blob(bld, 0.05, 0.02, 0, 0.26, 0.12, 0.2, shade(backC, bellyC), 14, 8);
      blob(bld, 0.27, 0.04, 0, 0.12, 0.08, 0.15, shade(backC, bellyC), 12, 6);
      for (const side of [1, -1]) {
        blob(bld, 0.3, 0.12, side * 0.08, 0.04, 0.04, 0.04, (nx, ny, nz) => (nz * side > 0.6 && ny > -0.2 ? [0.05, 0.05, 0.05] : [0.9, 0.75, 0.3]), 8, 5);
        tube(bld, [new THREE.Vector3(-0.1, -0.02, side * 0.15), new THREE.Vector3(-0.3, 0.02, side * 0.24), new THREE.Vector3(-0.18, -0.06, side * 0.3), new THREE.Vector3(-0.42, -0.08, side * 0.32)], 0.045, 0.02, backC, 6);
        tube(bld, [new THREE.Vector3(0.15, -0.05, side * 0.14), new THREE.Vector3(0.22, -0.1, side * 0.2)], 0.025, 0.015, backC, 6);
      }
      break;
    }
    case 'turtle': {
      blob(bld, 0, 0.02, 0, 0.36, 0.14, 0.3, (nx, ny, nz) => {
        // plates on the shell
        const k = Math.floor((Math.atan2(nz, nx) / Math.PI + 1) * 4) + Math.floor(ny * 3);
        return ny > -0.1 ? scaleC(backC, 0.88 + 0.14 * (k % 2)) : bellyC;
      }, 16, 8);
      blob(bld, 0.4, 0.0, 0, 0.1, 0.07, 0.08, shade(flankC, bellyC), 10, 6);
      blob(bld, 0.46, 0.03, 0.05, 0.012, 0.012, 0.01, () => [0.05, 0.05, 0.05], 6, 4);
      blob(bld, 0.46, 0.03, -0.05, 0.012, 0.012, 0.01, () => [0.05, 0.05, 0.05], 6, 4);
      for (const side of [1, -1]) {
        tube(bld, [new THREE.Vector3(0.22, -0.04, side * 0.22), new THREE.Vector3(0.3, -0.08, side * 0.36)], 0.05, 0.025, flankC, 6);
        tube(bld, [new THREE.Vector3(-0.22, -0.04, side * 0.2), new THREE.Vector3(-0.3, -0.08, side * 0.3)], 0.045, 0.025, flankC, 6);
      }
      tube(bld, [new THREE.Vector3(-0.34, -0.02, 0), new THREE.Vector3(-0.5, -0.06, 0)], 0.03, 0.006, flankC, 6);
      break;
    }
    case 'cube': {
      // a rounded box (a blob with a squarish section)
      const a0 = bld.pos.length / 3;
      const seg = 16;
      const ring = 10;
      for (let j = 0; j <= ring; j++) {
        const ph = (j / ring) * Math.PI;
        for (let i = 0; i <= seg; i++) {
          const th = (i / seg) * Math.PI * 2;
          const nx = Math.sin(ph) * Math.cos(th);
          const ny = Math.cos(ph);
          const nz = Math.sin(ph) * Math.sin(th);
          const k = 1 / Math.pow(Math.pow(Math.abs(nx), 4) + Math.pow(Math.abs(ny), 4) + Math.pow(Math.abs(nz), 4), 0.25);
          const v = bld.vert(nx * k * 0.3, ny * k * 0.18, nz * k * 0.16, mixC(bellyC, flankC, smooth((ny + 0.4) / 0.9)));
          // (the superellipsoid's own normal: its gradient)
          const gx = Math.pow(nx * k, 3) / 0.3;
          const gy = Math.pow(ny * k, 3) / 0.18;
          const gz = Math.pow(nz * k, 3) / 0.16;
          const gl = Math.hypot(gx, gy, gz) || 1;
          bld.normal(v, [gx / gl, gy / gl, gz / gl]);
        }
      }
      for (let j = 0; j < ring; j++)
        for (let i = 0; i < seg; i++) {
          const a = a0 + j * (seg + 1) + i;
          const b = a + seg + 1;
          bld.tri(a, a + 1, b);
          bld.tri(a + 1, b + 1, b);
        }
      fin(bld, [[-0.3, 0.1, 0], [-0.3, -0.1, 0]], [[-0.45, 0.14, 0], [-0.45, -0.14, 0]], finC, finC, 1, true);
      fin(bld, [[0.05, 0.18, 0], [-0.15, 0.18, 0]], [[0.0, 0.27, 0], [-0.18, 0.24, 0]], finC, finC, 1, true);
      for (const side of [1, -1]) {
        blob(bld, 0.22, 0.05, side * 0.16, 0.035, 0.035, 0.015, (nx, ny, nz) => (nz * side > 0.5 ? [0.04, 0.04, 0.05] : [0.95, 0.9, 0.5]), 8, 4);
      }
      break;
    }
    default:
      break;
  }
}

/** a little picture of a fish (the journal's): drawn once in a small renderer of its own, as a data URL */
export class FishThumbs {
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-0.62, 0.62, 0.36, -0.36, 0.1, 10);
  private readonly cache = new Map<string, string>();

  constructor(private readonly w = 160, private readonly h = 92) {}

  /** the picture of a fish of a colour; `dark`: its black silhouette (one not caught yet) */
  get(def: FishDef, variant: Variant, dark = false): string {
    const key = `${def.id}:${variant}:${dark ? 1 : 0}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (!this.renderer) {
      const cv = document.createElement('canvas');
      cv.width = this.w;
      cv.height = this.h;
      this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.scene.add(new THREE.AmbientLight(0xffffff, 1.4));
      const sun = new THREE.DirectionalLight(0xffffff, 1.8);
      sun.position.set(0.3, 1, 1);
      this.scene.add(sun);
      this.camera.position.set(0, 0, 3);
      this.camera.lookAt(0, 0, 0);
    }
    const m = buildFish(def, variant, 0.6);
    // the thumbnails are lit simply: swap the game's materials for plain ones with the same maps and colours
    m.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // (the clear cornea only adds light: drawn plainly it would hide the eye)
      if (mesh.userData.cornea) mesh.visible = false;
      const old = mesh.material as THREE.ShaderMaterial;
      const map = (old.uniforms?.uMap?.value as THREE.Texture | null) ?? null;
      mesh.material = dark ? new THREE.MeshBasicMaterial({ color: 0x1c2430, side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ map, vertexColors: !map, side: THREE.DoubleSide });
    });
    // fit: the length across, the height within
    const box = new THREE.Box3().setFromObject(m.group);
    const size = box.getSize(new THREE.Vector3());
    const k = Math.min(1.08 / Math.max(0.01, size.x), 0.62 / Math.max(0.01, size.y));
    m.group.scale.setScalar(k);
    const c = box.getCenter(new THREE.Vector3()).multiplyScalar(k);
    m.group.position.set(-c.x, -c.y, 0);
    this.scene.add(m.group);
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.scene.remove(m.group);
    m.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) (mesh.material as THREE.Material).dispose();
    });
    m.dispose();
    this.cache.set(key, url);
    return url;
  }
}
