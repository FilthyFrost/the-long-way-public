/**
 * Small reusable props for the rooms of the vehicles: seats, cabinets, the stove and its kettle,
 * plants, books, the radio buddy, the empty-slot frame with its blueprint card …
 *
 * Every prop is drawn in its own frame and placed with one transform (`place`):
 * origin on the floor under the middle of the prop, +x = its front (the side one uses it from),
 * +y up, +z = its right-hand side seen from the front ... width runs along z, depth along x.
 * A prop on the left wall that faces the aisle is placed with ry = −π/2, on the right wall +π/2,
 * a seat that faces the back of the vehicle with π.
 *
 * Colours: a handful of flat tones. Ink lines come from colour changes, so neighbouring parts that
 * should read apart get different tones and nothing is painted with fake shading.
 */
import * as THREE from 'three';
import type { ModelBuilder } from './builder';

/** the room palette (shared by every vehicle's interior) */
export const PAL = {
  wood: 0xc39461,
  woodDark: 0x8f6d45,
  woodLight: 0xdcc08e,
  cream: 0xf3ead6,
  paper: 0xeadfc4,
  teal: 0x5f9f95,
  tealSoft: 0x7fb5a6,
  orange: 0xd98a3d,
  red: 0xb9523f,
  mustard: 0xd8a03f,
  blue: 0x6f86b5,
  sky: 0x7fa6b8,
  green: 0x6fae5e,
  greenDark: 0x5c9a58,
  terracotta: 0xb5633f,
  metal: 0x8e969b,
  steel: 0xb9c0c4,
  dark: 0x393d45,
  rubber: 0x232529,
  cork: 0xb98d5c,
  blueprint: 0x4f7fae,
  rope: 0xcbb88c,
  plum: 0x8a5a78,
  mint: 0xbfdcc9,
} as const;

/** one transform: position, turn about the vertical (rad), uniform scale */
export function place(x: number, y: number, z: number, ry = 0, s = 1): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));
}

type C = THREE.ColorRepresentation;

// ------------------------------------------------------------------ furniture

/**
 * An armchair for the cab: pedestal, cushion, backrest with a head rest, two armrests.
 * `seatH` = top of the cushion above the origin; the backrest is at the back (−x).
 */
export function armchair(b: ModelBuilder, m: THREE.Matrix4, o: { seatH: number; width?: number; cover?: C; frame?: C; arms?: boolean; pocket?: C } = { seatH: 0.45 }): void {
  const w = o.width ?? 0.52;
  const cover = o.cover ?? PAL.teal;
  const frame = o.frame ?? PAL.dark;
  const h = o.seatH;
  b.within(m, () => {
    b.box(0.02, (h - 0.12) / 2, 0, 0.34, h - 0.12, w * 0.62, frame); // pedestal
    b.hull(cushion(-0.2, 0.28, h - 0.13, h, -w / 2, w / 2, 0.035), cover); // seat cushion
    // backrest leaning back a little, head rest on top
    b.hull(
      [
        [-0.22, h - 0.06, -w / 2 + 0.02], [-0.22, h - 0.06, w / 2 - 0.02], [-0.1, h - 0.06, -w / 2 + 0.02], [-0.1, h - 0.06, w / 2 - 0.02],
        [-0.29, h + 0.58, -w / 2 + 0.04], [-0.29, h + 0.58, w / 2 - 0.04], [-0.19, h + 0.58, -w / 2 + 0.04], [-0.19, h + 0.58, w / 2 - 0.04],
      ],
      cover,
    );
    b.box(-0.26, h + 0.7, 0, 0.09, 0.2, w * 0.56, PAL.tealSoft, { rz: -0.1 }); // head rest
    b.box(-0.262, h + 0.2, 0, 0.02, 0.3, w * 0.7, o.pocket ?? 0x4e8a80, { rz: 0.11 }); // a map pocket on the back
    b.bar(-0.24, h + 0.58, -0.1, -0.26, h + 0.61, -0.1, 0.02, frame);
    b.bar(-0.24, h + 0.58, 0.1, -0.26, h + 0.61, 0.1, 0.02, frame);
    if (o.arms !== false) {
      for (const s of [-1, 1]) {
        b.box(0.03, h + 0.2, s * (w / 2 + 0.03), 0.36, 0.05, 0.06, frame);
        b.bar(-0.14, h, s * (w / 2 + 0.03), -0.14, h + 0.18, s * (w / 2 + 0.03), 0.035, frame);
      }
    }
  });
}

/** a cushion-shaped hull: box with its top edges bevelled */
function cushion(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, bev: number): number[][] {
  return [
    [x0, y0, z0], [x1, y0, z0], [x0, y0, z1], [x1, y0, z1],
    [x0 + bev, y1, z0 + bev], [x1 - bev, y1, z0 + bev], [x0 + bev, y1, z1 - bev], [x1 - bev, y1, z1 - bev],
    [x0, y1 - bev, z0], [x1, y1 - bev, z0], [x0, y1 - bev, z1], [x1, y1 - bev, z1],
  ];
}

/** a soft cushion lying on a seat or a bed: size along x, y, z */
export function pillow(b: ModelBuilder, m: THREE.Matrix4, sx: number, sy: number, sz: number, color: C = PAL.cream): void {
  b.within(m, () => b.hull(cushion(-sx / 2, sx / 2, 0, sy, -sz / 2, sz / 2, Math.min(sy, sx, sz) * 0.4), color));
}

/**
 * A base cabinet: carcass, doors on the front with knobs, a top board that overhangs the front.
 * Width along z, depth along x (the back is at −depth/2 … the front at +depth/2).
 */
export function cabinet(b: ModelBuilder, m: THREE.Matrix4, w: number, d: number, h: number, o: { body?: C; door?: C; top?: C; doors?: number; topT?: number; drawers?: boolean } = {}): void {
  const body = o.body ?? PAL.wood;
  const door = o.door ?? PAL.tealSoft;
  const n = o.doors ?? Math.max(1, Math.round(w / 0.4));
  const tt = o.topT ?? 0.04;
  b.within(m, () => {
    b.span(-d / 2, d / 2 - 0.02, 0, h - tt, -w / 2, w / 2, body);
    b.span(-d / 2 + 0.02, d / 2 - 0.02, 0, 0.08, -w / 2 + 0.03, w / 2 - 0.03, PAL.woodDark); // toe kick reads as a shadow line
    const dw = (w - 0.06) / n;
    for (let i = 0; i < n; i++) {
      const z0 = -w / 2 + 0.03 + i * dw;
      if (o.drawers) {
        for (let k = 0; k < 3; k++) {
          const y0 = 0.1 + k * ((h - tt - 0.14) / 3);
          b.span(d / 2 - 0.02, d / 2 + 0.005, y0 + 0.015, y0 + (h - tt - 0.14) / 3 - 0.015, z0 + 0.015, z0 + dw - 0.015, door);
          b.box(d / 2 + 0.015, y0 + (h - tt - 0.14) / 6, z0 + dw / 2, 0.02, 0.02, 0.08, PAL.steel);
        }
      } else {
        b.span(d / 2 - 0.02, d / 2 + 0.005, 0.11, h - tt - 0.04, z0 + 0.015, z0 + dw - 0.015, door);
        b.box(d / 2 + 0.015, h - tt - 0.14, z0 + (i % 2 === 0 ? dw - 0.07 : 0.07), 0.02, 0.06, 0.02, PAL.steel);
      }
    }
    if (o.top !== null) b.span(-d / 2, d / 2 + 0.025, h - tt, h, -w / 2, w / 2, o.top ?? PAL.woodLight);
  });
}

/** a wall cabinet hung under the ceiling: doors face +x; origin at its bottom-middle */
export function wallCabinet(b: ModelBuilder, m: THREE.Matrix4, w: number, d: number, h: number, o: { body?: C; door?: C } = {}): void {
  const n = Math.max(1, Math.round(w / 0.42));
  b.within(m, () => {
    b.span(-d / 2, d / 2 - 0.02, 0, h, -w / 2, w / 2, o.body ?? PAL.wood);
    const dw = (w - 0.04) / n;
    for (let i = 0; i < n; i++) {
      const z0 = -w / 2 + 0.02 + i * dw;
      b.span(d / 2 - 0.02, d / 2 + 0.006, 0.025, h - 0.025, z0 + 0.012, z0 + dw - 0.012, o.door ?? PAL.cream);
      b.box(d / 2 + 0.016, 0.06, z0 + dw / 2, 0.02, 0.02, 0.07, PAL.woodDark);
    }
  });
}

/** an old round-shouldered fridge, chest high: door with a long chrome handle */
export function fridge(b: ModelBuilder, m: THREE.Matrix4, w: number, d: number, h: number, color: C = PAL.mint): void {
  const r = 0.07;
  b.within(m, () => {
    b.hull(
      [
        [-d / 2, 0, -w / 2], [d / 2, 0, -w / 2], [-d / 2, 0, w / 2], [d / 2, 0, w / 2],
        [-d / 2, h - r, -w / 2], [d / 2, h - r, -w / 2], [-d / 2, h - r, w / 2], [d / 2, h - r, w / 2],
        [-d / 2, h, -w / 2 + r], [d / 2 - r, h, -w / 2 + r], [-d / 2, h, w / 2 - r], [d / 2 - r, h, w / 2 - r],
        [d / 2 - r * 0.3, h - r * 0.3, 0],
      ],
      color,
    );
    b.span(d / 2 - 0.005, d / 2 + 0.01, 0.06, 0.1, -w / 2 + 0.03, w / 2 - 0.03, PAL.dark); // kick grille
    b.span(d / 2 - 0.005, d / 2 + 0.008, h * 0.62, h * 0.625, -w / 2 + 0.02, w / 2 - 0.02, PAL.metal); // door seam (freezer)
    b.bar(d / 2 + 0.035, h * 0.38, w / 2 - 0.07, d / 2 + 0.035, h * 0.58, w / 2 - 0.07, 0.025, PAL.steel); // handle
    b.box(d / 2 + 0.018, h * 0.48, w / 2 - 0.07, 0.03, 0.02, 0.025, PAL.steel);
    b.box(d / 2 + 0.018, h * 0.4, w / 2 - 0.07, 0.03, 0.02, 0.025, PAL.steel);
    b.span(d / 2 - 0.004, d / 2 + 0.008, h * 0.82, h * 0.86, -0.08, 0.08, PAL.steel); // badge
    // magnets and a note
    b.box(d / 2 + 0.006, h * 0.72, -0.1, 0.006, 0.09, 0.07, PAL.paper, { rx: 0.08 });
    b.box(d / 2 + 0.01, h * 0.76, -0.1, 0.01, 0.025, 0.025, PAL.red);
    b.box(d / 2 + 0.01, h * 0.5, 0.0, 0.01, 0.03, 0.03, PAL.mustard);
  });
}

/** the sink cabinet: counter, round steel basin, a tap, a water jug in the open bottom shelf */
export function sinkUnit(b: ModelBuilder, m: THREE.Matrix4, w: number, d: number, h: number): void {
  b.within(m, () => {
    b.span(-d / 2, d / 2 - 0.02, 0, h - 0.04, -w / 2, w / 2, PAL.wood);
    b.span(-d / 2 + 0.03, d / 2 + 0.001, 0.12, h * 0.48, -w / 2 + 0.04, w / 2 - 0.04, PAL.woodDark); // open shelf (dark back)
    b.span(-d / 2 + 0.03, d / 2 - 0.02, h * 0.48, h * 0.5, -w / 2 + 0.03, w / 2 - 0.03, PAL.wood);
    b.span(d / 2 - 0.02, d / 2 + 0.005, h * 0.53, h - 0.08, -w / 2 + 0.03, w / 2 - 0.03, PAL.tealSoft); // door
    b.box(d / 2 + 0.015, h - 0.14, 0, 0.02, 0.02, 0.08, PAL.steel);
    // the counter with the basin set in
    b.span(-d / 2, d / 2 + 0.025, h - 0.04, h, -w / 2, -0.17, PAL.woodLight);
    b.span(-d / 2, d / 2 + 0.025, h - 0.04, h, 0.17, w / 2, PAL.woodLight);
    b.span(-d / 2, -0.17, h - 0.04, h, -0.17, 0.17, PAL.woodLight);
    b.span(0.17, d / 2 + 0.025, h - 0.04, h, -0.17, 0.17, PAL.woodLight);
    b.span(-0.16, 0.16, h - 0.16, h - 0.005, -0.16, 0.16, PAL.steel); // basin
    b.span(-0.14, 0.14, h - 0.155, h - 0.15, -0.14, 0.14, PAL.metal);
    b.cyl(-0.22, h + 0.1, 0, 0.012, 0.2, PAL.steel, { segments: 6 }); // tap
    b.bar(-0.22, h + 0.2, 0, -0.1, h + 0.17, 0, 0.022, PAL.steel);
    b.cyl(-0.22, h + 0.08, 0.08, 0.018, 0.02, PAL.red, { segments: 6 });
    // a blue water jug in the shelf
    b.box(0.0, 0.12 + 0.16, -w / 4, 0.26, 0.32, 0.2, PAL.sky);
    b.cyl(0.0, 0.12 + 0.34, -w / 4, 0.03, 0.04, PAL.cream, { segments: 6 });
    // a mug and a sponge on the counter
    mug(b, place(0.12, h, 0.22, 0.6), PAL.red);
    b.box(0.05, h + 0.015, -0.22, 0.08, 0.03, 0.05, PAL.mustard);
  });
}

/** the stove: counter cabinet with one gas burner and its grate; the kettle sits on it */
export function stoveUnit(b: ModelBuilder, m: THREE.Matrix4, w: number, d: number, h: number): void {
  b.within(m, () => {
    cabinet(b, place(0, 0, 0), w, d, h, { doors: 1, drawers: true, door: PAL.orange });
    // a little enamel hob on the counter
    b.span(-0.18, 0.2, h, h + 0.06, -0.2, 0.2, PAL.cream);
    b.span(0.2, 0.205, h + 0.01, h + 0.05, -0.18, 0.18, PAL.dark);
    b.cyl(0.21, h + 0.03, 0.12, 0.018, 0.015, PAL.dark, { rz: Math.PI / 2, segments: 8 }); // knob
    b.cyl(0.0, h + 0.065, 0.0, 0.08, 0.012, PAL.dark, { segments: 12 }); // burner
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI + Math.PI / 4;
      b.bar(Math.cos(a) * -0.12, h + 0.085, Math.sin(a) * -0.12, Math.cos(a) * 0.12, h + 0.085, Math.sin(a) * 0.12, 0.012, PAL.rubber);
    }
    kettle(b, place(0, h + 0.09, 0, 0.5));
    // a gas bottle in the cupboard is not visible; a pan hangs on the side instead
    b.cyl(0.1, h - 0.25, w / 2 + 0.012, 0.11, 0.02, PAL.dark, { rx: Math.PI / 2, segments: 12 });
    b.bar(0.1, h - 0.14, w / 2 + 0.012, 0.1, h - 0.02, w / 2 + 0.012, 0.02, PAL.dark);
  });
}

/** an enamel kettle */
export function kettle(b: ModelBuilder, m: THREE.Matrix4, color: C = PAL.teal): void {
  b.within(m, () => {
    b.cyl(0, 0.065, 0, 0.085, 0.13, color, { segments: 12, radiusTop: 0.06 });
    b.cyl(0, 0.14, 0, 0.03, 0.025, PAL.dark, { segments: 8 });
    b.bar(0.07, 0.06, 0, 0.14, 0.13, 0, 0.022, color); // spout
    b.bar(-0.05, 0.13, 0, -0.03, 0.2, 0, 0.014, PAL.dark); // handle
    b.bar(-0.03, 0.2, 0, 0.04, 0.2, 0, 0.014, PAL.dark);
    b.bar(0.04, 0.2, 0, 0.05, 0.13, 0, 0.014, PAL.dark);
  });
}

export function mug(b: ModelBuilder, m: THREE.Matrix4, color: C = PAL.cream): void {
  b.within(m, () => {
    b.cyl(0, 0.045, 0, 0.035, 0.09, color, { segments: 8 });
    b.box(0.045, 0.045, 0, 0.02, 0.05, 0.012, color);
  });
}

/** a potted plant: terracotta pot and three round leaf clumps */
export function plant(b: ModelBuilder, m: THREE.Matrix4, size = 1): void {
  b.within(m, () => {
    b.cyl(0, 0.05 * size, 0, 0.055 * size, 0.1 * size, PAL.terracotta, { segments: 8, radiusTop: 0.068 * size });
    b.sphere(0, 0.15 * size, 0, 0.07 * size, PAL.green, 1);
    b.sphere(0.04 * size, 0.2 * size, 0.03 * size, 0.045 * size, PAL.greenDark, 0);
    b.sphere(-0.03 * size, 0.19 * size, -0.04 * size, 0.04 * size, 0x82bb66, 0);
  });
}

/** a row of books standing on a shelf along z */
export function books(b: ModelBuilder, m: THREE.Matrix4, n = 5): void {
  const cols = [PAL.red, PAL.blue, PAL.mustard, PAL.teal, PAL.plum, PAL.cream, PAL.terracotta];
  b.within(m, () => {
    let z = -n * 0.022;
    for (let i = 0; i < n; i++) {
      const t = 0.03 + ((i * 7) % 3) * 0.008;
      const hh = 0.17 + ((i * 5) % 4) * 0.018;
      b.box(0, hh / 2, z + t / 2, 0.13, hh, t, cols[i % cols.length], i === n - 1 ? { rx: -0.25 } : undefined);
      z += t + 0.003;
    }
  });
}

/** a hurricane lantern: base, glass (pale), cap and a bail */
export function lantern(b: ModelBuilder, m: THREE.Matrix4, glow: C = 0xf6e2a8): void {
  b.within(m, () => {
    b.cyl(0, 0.025, 0, 0.055, 0.05, PAL.red, { segments: 8 });
    b.cyl(0, 0.1, 0, 0.04, 0.1, glow, { segments: 8 });
    b.cyl(0, 0.17, 0, 0.05, 0.04, PAL.red, { segments: 8, radiusTop: 0.02 });
    b.torus(0, 0.21, 0, 0.035, 0.005, PAL.dark);
  });
}

/** a rolled blanket lying along z */
export function blanketRoll(b: ModelBuilder, m: THREE.Matrix4, len = 0.5, color: C = PAL.red): void {
  b.within(m, () => {
    b.cyl(0, 0.08, 0, 0.08, len, color, { rx: Math.PI / 2, segments: 10 });
    b.cyl(0, 0.08, -len * 0.3, 0.083, 0.03, PAL.rope, { rx: Math.PI / 2, segments: 10 });
    b.cyl(0, 0.08, len * 0.3, 0.083, 0.03, PAL.rope, { rx: Math.PI / 2, segments: 10 });
  });
}

/** a wooden crate */
export function crate(b: ModelBuilder, m: THREE.Matrix4, sx = 0.45, sy = 0.3, sz = 0.35, color: C = PAL.woodLight): void {
  b.within(m, () => {
    b.span(-sx / 2, sx / 2, 0, sy, -sz / 2, sz / 2, color);
    for (const y of [sy * 0.33, sy * 0.66]) {
      b.span(-sx / 2 - 0.005, sx / 2 + 0.005, y - 0.006, y + 0.006, -sz / 2 - 0.005, sz / 2 + 0.005, PAL.woodDark);
    }
  });
}

/** a jerrycan standing up; front = its narrow side */
export function jerrycan(b: ModelBuilder, m: THREE.Matrix4, color: C = PAL.red): void {
  b.within(m, () => {
    b.span(-0.08, 0.08, 0, 0.44, -0.17, 0.17, color);
    b.span(-0.085, 0.085, 0.2, 0.24, -0.15, 0.15, PAL.dark); // embossed band
    b.cyl(0.0, 0.47, 0.11, 0.025, 0.06, PAL.dark, { segments: 6 });
    b.bar(0, 0.46, -0.12, 0, 0.46, 0.04, 0.03, color); // handle
  });
}

/** an acoustic guitar standing on its end, leaning back against the wall behind it (−x) */
export function guitar(b: ModelBuilder, m: THREE.Matrix4): void {
  b.within(m, () => {
    const lean = -0.12;
    b.within(new THREE.Matrix4().makeRotationZ(lean), () => {
      b.cyl(0, 0.2, 0, 0.17, 0.09, PAL.mustard, { rz: Math.PI / 2, segments: 14 }); // lower bout
      b.cyl(0, 0.44, 0, 0.13, 0.09, PAL.mustard, { rz: Math.PI / 2, segments: 12 }); // upper bout
      b.cyl(0.047, 0.36, 0, 0.045, 0.004, PAL.dark, { rz: Math.PI / 2, segments: 10 }); // sound hole
      b.box(0.045, 0.22, 0, 0.012, 0.03, 0.12, PAL.woodDark); // bridge
      b.box(0.02, 0.78, 0, 0.03, 0.5, 0.05, PAL.woodDark); // neck
      b.box(0.015, 1.07, 0, 0.04, 0.13, 0.08, PAL.woodDark); // head
      b.box(0.045, 0.6, 0, 0.004, 0.6, 0.03, PAL.steel); // strings
      b.box(0.0, 0.62, 0.0, 0.01, 0.4, 0.02, PAL.red, { rx: 0.9 }); // strap
    });
  });
}

/** a cork board on the wall (facing +x) with polaroids, postcards and pins */
export function corkboard(b: ModelBuilder, m: THREE.Matrix4, w: number, h: number): void {
  const cards: [number, number, number, number, C][] = [
    [-0.36, 0.7, 0.1, 0.12, PAL.cream],
    [-0.2, 0.62, 0.14, 0.1, PAL.sky],
    [-0.02, 0.72, 0.1, 0.12, PAL.cream],
    [0.17, 0.66, 0.13, 0.09, PAL.mustard],
    [0.33, 0.74, 0.1, 0.12, PAL.cream],
    [-0.3, 0.35, 0.14, 0.1, PAL.tealSoft],
    [-0.08, 0.38, 0.1, 0.12, PAL.cream],
    [0.12, 0.33, 0.16, 0.11, PAL.paper],
    [0.32, 0.38, 0.1, 0.12, PAL.cream],
    [-0.15, 0.15, 0.2, 0.09, PAL.orange],
    [0.18, 0.13, 0.12, 0.09, PAL.cream],
  ];
  b.within(m, () => {
    b.span(-0.02, 0.0, 0, h, -w / 2, w / 2, PAL.woodDark);
    b.span(0.0, 0.015, 0.03, h - 0.03, -w / 2 + 0.03, w / 2 - 0.03, PAL.cork);
    for (const [cz, cy, cw, ch, col] of cards) {
      const z = (cz * w) / 0.9;
      const y = (cy * h) / 0.9;
      b.box(0.02, y, z, 0.004, ch, cw, col, { rx: ((cz * 37) % 0.2) - 0.1 });
      if (col === PAL.cream) b.box(0.023, y + 0.012, z, 0.003, ch * 0.62, cw * 0.8, PAL.sky, { rx: ((cz * 37) % 0.2) - 0.1 }); // photo
      b.box(0.026, y + ch / 2 - 0.012, z, 0.008, 0.012, 0.012, PAL.red);
    }
    // a string of the route between two cards
    b.bar(0.024, (0.38 * h) / 0.9, (-0.3 * w) / 0.9, 0.024, (0.7 * h) / 0.9, (0.33 * w) / 0.9, 0.004, PAL.red);
  });
}

/** a rug lying on the floor: size along x and z, with two stripes */
export function rug(b: ModelBuilder, m: THREE.Matrix4, sx: number, sz: number, color: C = PAL.red, stripe: C = PAL.paper): void {
  b.within(m, () => {
    b.span(-sx / 2, sx / 2, 0, 0.008, -sz / 2, sz / 2, color);
    for (const f of [-0.36, 0.36]) b.span(-sx / 2 + 0.04, sx / 2 - 0.04, 0.008, 0.011, f * sz - 0.025, f * sz + 0.025, stripe);
    for (const f of [-0.5, 0.5]) b.span(f * sx - 0.015, f * sx + 0.015, 0, 0.012, -sz / 2 + 0.03, sz / 2 - 0.03, stripe);
  });
}

/**
 * A curtain gathered to one side of a window: hangs from y = top down `drop`, `w` wide along z
 * (when the frame is placed on a wall facing +x), a few folds.
 */
export function curtain(b: ModelBuilder, m: THREE.Matrix4, w: number, drop: number, color: C = PAL.orange, tie: C = PAL.cream): void {
  // an accordion of narrow panels turned alternately: the light picks out the pleats
  const folds = Math.max(3, Math.round(w / 0.03));
  const fw = w / folds;
  const turn = 0.65;
  b.within(m, () => {
    for (let i = 0; i < folds; i++) {
      const z = -w / 2 + (i + 0.5) * fw;
      b.box(0.022, -drop / 2, z, 0.008, drop, fw / Math.cos(turn) + 0.004, color, { ry: i % 2 ? turn : -turn });
    }
    b.span(0.0, 0.045, -drop * 0.55 - 0.02, -drop * 0.55 + 0.02, -w / 2 - 0.005, w / 2 + 0.005, tie); // tie-back
  });
}

/**
 * The radio buddy: the hand-crank radio that rides on the dash and, from stop 5, drives (§5.7).
 * A rounded box with a speaker grille for a mouth, two big knobs for eyes, a crank and an aerial.
 * Front (the face) = +x.
 */
export function radioBuddy(b: ModelBuilder, m: THREE.Matrix4): void {
  b.within(m, () => {
    b.hull(cushion(-0.06, 0.06, 0, 0.13, -0.11, 0.11, 0.02), PAL.orange); // body
    b.span(-0.065, 0.065, 0.0, 0.015, -0.115, 0.115, PAL.dark); // feet strip
    b.span(0.058, 0.064, 0.025, 0.06, -0.07, 0.07, PAL.paper); // grille (mouth)
    for (let i = 0; i < 3; i++) b.span(0.063, 0.066, 0.032 + i * 0.01, 0.036 + i * 0.01, -0.06, 0.06, PAL.woodDark);
    // eyes: two knobs with a dark pupil each
    for (const z of [-0.045, 0.045]) {
      b.cyl(0.062, 0.093, z, 0.026, 0.02, PAL.cream, { rz: Math.PI / 2, segments: 12 });
      b.cyl(0.075, 0.096, z + 0.004, 0.011, 0.012, PAL.dark, { rz: Math.PI / 2, segments: 8 });
    }
    b.bar(-0.02, 0.13, 0.08, -0.06, 0.32, 0.12, 0.006, PAL.steel); // aerial
    b.sphere(-0.06, 0.32, 0.12, 0.01, PAL.red, 0);
    b.bar(0.0, 0.065, -0.112, 0.0, 0.065, -0.14, 0.012, PAL.dark); // crank
    b.bar(0.0, 0.065, -0.14, 0.0, 0.02, -0.14, 0.012, PAL.dark);
    b.cyl(0.0, 0.02, -0.15, 0.012, 0.03, PAL.red, { rx: Math.PI / 2, segments: 6 });
    b.box(-0.0, 0.14, 0.0, 0.06, 0.02, 0.12, PAL.dark); // handle
  });
}

/** a nodding figure for the dash: spring and a round head */
export function bobble(b: ModelBuilder, m: THREE.Matrix4): void {
  b.within(m, () => {
    b.cyl(0, 0.012, 0, 0.025, 0.024, PAL.dark, { segments: 8 });
    b.cyl(0, 0.045, 0, 0.018, 0.045, PAL.blue, { segments: 8 });
    b.sphere(0, 0.09, 0, 0.032, PAL.paper, 1);
    b.box(0.026, 0.095, 0, 0.012, 0.012, 0.03, PAL.dark);
    b.cyl(0, 0.122, 0, 0.034, 0.012, PAL.red, { segments: 10 }); // hat
  });
}

/** an open road map lying flat, a pencil on it */
export function openMap(b: ModelBuilder, m: THREE.Matrix4, sx = 0.34, sz = 0.26): void {
  b.within(m, () => {
    b.box(0, 0.003, 0, sx, 0.006, sz, PAL.paper, { ry: 0.12 });
    b.box(0, 0.007, 0, sx * 0.8, 0.003, 0.012, PAL.red, { ry: 0.5 });
    b.box(sx * 0.15, 0.007, -sz * 0.2, 0.08, 0.003, 0.06, PAL.sky, { ry: 0.12 });
    b.box(-sx * 0.2, 0.007, sz * 0.2, 0.06, 0.003, 0.05, PAL.green, { ry: 0.12 });
    b.box(-sx * 0.1, 0.011, -sz * 0.1, 0.12, 0.008, 0.008, PAL.mustard, { ry: -0.6 });
  });
}

/** a stool */
export function stool(b: ModelBuilder, m: THREE.Matrix4, h = 0.5): void {
  b.within(m, () => {
    b.cyl(0, h - 0.02, 0, 0.16, 0.04, PAL.wood, { segments: 12 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      b.bar(Math.cos(a) * 0.1, h - 0.04, Math.sin(a) * 0.1, Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15, 0.025, PAL.woodDark);
    }
    b.torus(0, h * 0.35, 0, 0.13, 0.008, PAL.woodDark, { rx: Math.PI / 2 });
  });
}

/** a small easel with a canvas on it, facing +x */
export function easel(b: ModelBuilder, m: THREE.Matrix4): void {
  b.within(m, () => {
    b.bar(0.08, 0, -0.18, -0.02, 1.2, -0.04, 0.025, PAL.woodDark);
    b.bar(0.08, 0, 0.18, -0.02, 1.2, 0.04, 0.025, PAL.woodDark);
    b.bar(-0.25, 0, 0, -0.02, 1.1, 0, 0.022, PAL.woodDark);
    b.box(0.07, 0.62, 0, 0.04, 0.025, 0.42, PAL.woodDark); // ledge
    b.box(0.04, 0.88, 0, 0.025, 0.48, 0.38, PAL.cream, { rz: 0.12 }); // canvas
    b.box(0.056, 0.82, -0.04, 0.004, 0.16, 0.3, PAL.sky, { rz: 0.12 }); // a painted sky
    b.box(0.06, 0.74, 0.02, 0.004, 0.1, 0.32, PAL.green, { rz: 0.12 }); // and a hill
    b.box(0.064, 0.92, 0.1, 0.004, 0.05, 0.05, PAL.mustard, { rz: 0.12 }); // a sun
  });
}

/** a bench vice on a work top (top surface at the origin) */
export function vise(b: ModelBuilder, m: THREE.Matrix4): void {
  b.within(m, () => {
    b.span(-0.06, 0.06, 0, 0.03, -0.07, 0.07, PAL.teal);
    b.span(0.0, 0.1, 0.03, 0.11, -0.06, 0.06, PAL.teal);
    b.span(-0.06, 0.0, 0.03, 0.11, -0.06, 0.06, PAL.teal);
    b.bar(0.1, 0.07, 0, 0.2, 0.07, 0, 0.018, PAL.steel);
    b.bar(0.2, 0.07, -0.08, 0.2, 0.07, 0.08, 0.014, PAL.steel);
  });
}

/** a pegboard on the wall (facing +x) with a few tools hanging on it */
export function toolBoard(b: ModelBuilder, m: THREE.Matrix4, w: number, h: number): void {
  b.within(m, () => {
    b.span(0, 0.015, 0, h, -w / 2, w / 2, PAL.woodLight);
    // tools: a hammer, a saw, a spanner set, a coil of wire
    b.box(0.03, h * 0.55, -w * 0.32, 0.02, h * 0.5, 0.025, PAL.woodDark);
    b.box(0.03, h * 0.78, -w * 0.32, 0.03, 0.04, 0.12, PAL.dark);
    b.box(0.025, h * 0.5, -w * 0.08, 0.01, h * 0.55, 0.14, PAL.steel);
    b.box(0.03, h * 0.82, -w * 0.08, 0.03, 0.06, 0.09, PAL.red);
    for (let i = 0; i < 4; i++) b.box(0.025, h * 0.6 - i * 0.02, w * 0.12 + i * 0.035, 0.012, h * (0.32 + i * 0.06), 0.018, PAL.metal);
    b.torus(0.03, h * 0.55, w * 0.34, 0.06, 0.012, PAL.terracotta, { ry: Math.PI / 2 });
  });
}

/** a spare wheel standing on edge, facing +x */
export function spareWheel(b: ModelBuilder, m: THREE.Matrix4, r = 0.36): void {
  b.within(m, () => {
    b.cyl(0, 0, 0, r, 0.22, PAL.rubber, { rz: Math.PI / 2, segments: 18 });
    b.cyl(0.005, 0, 0, r * 0.6, 0.225, PAL.cream, { rz: Math.PI / 2, segments: 14 });
    b.cyl(0.01, 0, 0, r * 0.2, 0.235, PAL.metal, { rz: Math.PI / 2, segments: 8 });
  });
}

/** a solar panel on short legs (origin under its middle, facing up, tilted toward +x) */
export function solarPanel(b: ModelBuilder, m: THREE.Matrix4, sx: number, sz: number): void {
  b.within(m, () => {
    for (const x of [-sx / 2 + 0.06, sx / 2 - 0.06]) for (const z of [-sz / 2 + 0.06, sz / 2 - 0.06]) b.span(x - 0.02, x + 0.02, 0, 0.07, z - 0.02, z + 0.02, PAL.metal);
    b.span(-sx / 2, sx / 2, 0.07, 0.1, -sz / 2, sz / 2, PAL.steel);
    b.span(-sx / 2 + 0.03, sx / 2 - 0.03, 0.1, 0.106, -sz / 2 + 0.03, sz / 2 - 0.03, 0x3f5f8a);
    const n = Math.max(2, Math.round(sx / 0.22));
    for (let i = 1; i < n; i++) b.span(-sx / 2 + (i * sx) / n - 0.006, -sx / 2 + (i * sx) / n + 0.006, 0.1, 0.108, -sz / 2 + 0.03, sz / 2 - 0.03, 0x6e8db5);
    b.span(-sx / 2 + 0.03, sx / 2 - 0.03, 0.1, 0.108, -0.006, 0.006, 0x6e8db5);
  });
}

/** a deck chair, reclined, facing +x */
export function lounger(b: ModelBuilder, m: THREE.Matrix4, cloth: C = PAL.orange): void {
  b.within(m, () => {
    for (const s of [-1, 1]) {
      b.bar(0.45, 0, s * 0.26, 0.05, 0.35, s * 0.26, 0.025, PAL.woodDark);
      b.bar(-0.35, 0, s * 0.26, -0.2, 0.75, s * 0.26, 0.025, PAL.woodDark);
      b.bar(0.05, 0.35, s * 0.26, -0.2, 0.75, s * 0.26, 0.025, PAL.woodDark);
      b.bar(0.1, 0.2, s * 0.27, 0.1, 0.42, s * 0.27, 0.025, PAL.woodDark); // arm post
      b.box(0.05, 0.43, s * 0.27, 0.3, 0.025, 0.05, PAL.woodDark);
    }
    // the cloth sags between the rails: seat then back
    b.loft(
      [
        [[0.4, 0.06, -0.24], [0.2, 0.18, -0.24], [0.0, 0.3, -0.24], [-0.18, 0.72, -0.24]],
        [[0.4, 0.04, 0.0], [0.2, 0.14, 0.0], [0.0, 0.26, 0.0], [-0.18, 0.7, 0.0]],
        [[0.4, 0.06, 0.24], [0.2, 0.18, 0.24], [0.0, 0.3, 0.24], [-0.18, 0.72, 0.24]],
      ],
      cloth,
    );
    for (const z of [-0.12, 0.12]) b.box(-0.08, 0.5, z, 0.02, 0.4, 0.05, PAL.cream, { rz: 1.12 }); // stripes
  });
}

/** a folding chair hanging flat (on a ladder, a hook): seat facing +x, lying in the y–z plane */
export function foldedChair(b: ModelBuilder, m: THREE.Matrix4, cloth: C = PAL.teal): void {
  b.within(m, () => {
    b.bar(0, -0.42, -0.2, 0, 0.42, -0.2, 0.025, PAL.steel);
    b.bar(0, -0.42, 0.2, 0, 0.42, 0.2, 0.025, PAL.steel);
    b.span(0.01, 0.03, -0.25, 0.35, -0.19, 0.19, cloth);
    b.span(0.032, 0.036, 0.0, 0.08, -0.19, 0.19, PAL.cream);
  });
}

/** a bucket with a rope handle */
export function bucket(b: ModelBuilder, m: THREE.Matrix4, color: C = PAL.sky): void {
  b.within(m, () => {
    b.cyl(0, 0.13, 0, 0.13, 0.26, color, { segments: 10, radiusTop: 0.15 });
    b.cyl(0, 0.265, 0, 0.152, 0.015, PAL.steel, { segments: 10 });
    b.torus(0, 0.27, 0, 0.15, 0.008, PAL.rope, { rz: Math.PI / 2 });
  });
}

/** a flower box under a window (facing +x, hung on the wall behind it) */
export function flowerBox(b: ModelBuilder, m: THREE.Matrix4, w: number): void {
  b.within(m, () => {
    b.span(0, 0.16, 0, 0.14, -w / 2, w / 2, PAL.woodDark);
    b.span(0.16, 0.165, 0.02, 0.12, -w / 2 + 0.02, w / 2 - 0.02, PAL.wood);
    const n = Math.max(3, Math.round(w / 0.12));
    for (let i = 0; i < n; i++) {
      const z = -w / 2 + (i + 0.5) * (w / n);
      b.sphere(0.08, 0.17 + (i % 2) * 0.02, z, 0.06, i % 2 ? PAL.green : PAL.greenDark, 0);
      if (i % 2 === 0) b.sphere(0.12, 0.21, z + 0.02, 0.025, i % 4 === 0 ? PAL.red : PAL.mustard, 0);
    }
  });
}

// ------------------------------------------------------------------ slots

/** the silhouette drawn on a slot's blueprint card: a few blocks per kind of fixture (card plane y–z) */
const ICONS: Record<string, [number, number, number, number][]> = {
  // [z, y, width, height] on a card 0.2 wide and 0.14 high, centred
  cooler: [[0, 0, 0.07, 0.1], [0.02, 0.02, 0.008, 0.03]],
  water: [[0, -0.02, 0.1, 0.04], [-0.03, 0.02, 0.01, 0.05], [-0.01, 0.045, 0.04, 0.01]],
  stove: [[0, -0.03, 0.12, 0.03], [0, 0.01, 0.06, 0.04], [0.04, 0.02, 0.03, 0.01]],
  workbench: [[0, 0.01, 0.13, 0.015], [-0.05, -0.03, 0.012, 0.07], [0.05, -0.03, 0.012, 0.07], [0.03, 0.03, 0.03, 0.025]],
  bed: [[0, -0.035, 0.14, 0.015], [0, 0.03, 0.14, 0.015], [-0.065, 0, 0.012, 0.09], [0.065, 0, 0.012, 0.09]],
  map: [[0, 0.01, 0.12, 0.02], [0, -0.03, 0.012, 0.06], [0.03, 0.025, 0.04, 0.01]],
  storage: [[0, 0, 0.12, 0.09], [0, 0, 0.12, 0.006], [-0.03, 0.02, 0.012, 0.008], [-0.03, -0.025, 0.012, 0.008]],
  board: [[0, 0, 0.13, 0.09], [-0.03, 0.01, 0.03, 0.035], [0.025, -0.01, 0.035, 0.03]],
  hobby: [[-0.02, 0, 0.04, 0.06], [0.02, 0.03, 0.01, 0.06], [0.05, -0.01, 0.02, 0.08]],
  roof: [[0, 0, 0.13, 0.05], [0, -0.035, 0.1, 0.008]],
  winch: [[0, 0, 0.1, 0.05], [-0.06, 0, 0.015, 0.07], [0.06, 0, 0.015, 0.07], [0.0, -0.045, 0.012, 0.03]],
  rear: [[-0.02, 0, 0.07, 0.07], [0.045, 0, 0.03, 0.06]],
};

/**
 * A slot with nothing installed: light wood strips outline the fixture's footprint (and its back on
 * the wall), and a cream card with the fixture's silhouette is pinned at the back. Origin = floor
 * under the middle of the footprint, front = +x; depth along x, width along z, h = how tall the
 * fixture will be. `wall` = only the frame on the wall (a board, a picture rail).
 */
export function slotFrame(b: ModelBuilder, m: THREE.Matrix4, kind: string, d: number, w: number, h: number, o: { wall?: boolean; card?: number } = {}): void {
  const t = 0.03;
  const wood = PAL.woodLight;
  b.within(m, () => {
    if (!o.wall) {
      // a strip round the footprint on the floor
      b.span(-d / 2, d / 2, 0, 0.012, -w / 2, -w / 2 + t, wood);
      b.span(-d / 2, d / 2, 0, 0.012, w / 2 - t, w / 2, wood);
      b.span(-d / 2, -d / 2 + t, 0, 0.012, -w / 2 + t, w / 2 - t, wood);
      b.span(d / 2 - t, d / 2, 0, 0.012, -w / 2 + t, w / 2 - t, wood);
      // corner posts at the back and a rail across the top: the fixture's outline against the wall
      b.span(-d / 2, -d / 2 + t, 0, h, -w / 2, -w / 2 + t, wood);
      b.span(-d / 2, -d / 2 + t, 0, h, w / 2 - t, w / 2, wood);
      b.span(-d / 2, -d / 2 + t, h - t, h, -w / 2, w / 2, wood);
    } else {
      b.span(-d / 2, -d / 2 + 0.02, 0, t, -w / 2, w / 2, wood);
      b.span(-d / 2, -d / 2 + 0.02, h - t, h, -w / 2, w / 2, wood);
      b.span(-d / 2, -d / 2 + 0.02, 0, h, -w / 2, -w / 2 + t, wood);
      b.span(-d / 2, -d / 2 + 0.02, 0, h, w / 2 - t, w / 2, wood);
    }
    // the blueprint card, pinned at the back (or lying on a floor frame that has no wall)
    const cy = o.card ?? Math.min(h * 0.6, 0.5);
    const cx = -d / 2 + (o.wall ? 0.022 : t + 0.004);
    b.span(cx, cx + 0.006, cy - 0.09, cy + 0.09, -0.13, 0.13, PAL.cream);
    b.span(cx + 0.006, cx + 0.009, cy - 0.075, cy + 0.075, -0.115, 0.115, 0xdcd3bc);
    for (const [z, y, iw, ih] of ICONS[kind] ?? ICONS.storage) b.span(cx + 0.009, cx + 0.013, cy + y * 1.15 - (ih * 1.15) / 2, cy + y * 1.15 + (ih * 1.15) / 2, z * 1.15 - (iw * 1.15) / 2, z * 1.15 + (iw * 1.15) / 2, PAL.blueprint);
    b.box(cx + 0.015, cy + 0.075, 0, 0.01, 0.018, 0.018, PAL.red); // the pin
  });
}

/** an empty slot that lies flat (on a roof, on a floor without a wall): strips and a card on a little stand */
export function slotPad(b: ModelBuilder, m: THREE.Matrix4, kind: string, d: number, w: number): void {
  const t = 0.035;
  const wood = PAL.woodLight;
  b.within(m, () => {
    b.span(-d / 2, d / 2, 0, 0.03, -w / 2, -w / 2 + t, wood);
    b.span(-d / 2, d / 2, 0, 0.03, w / 2 - t, w / 2, wood);
    b.span(-d / 2, -d / 2 + t, 0, 0.03, -w / 2 + t, w / 2 - t, wood);
    b.span(d / 2 - t, d / 2, 0, 0.03, -w / 2 + t, w / 2 - t, wood);
    // the card on a low stand, leaning well back, facing +x
    b.span(-0.08, 0.02, 0, 0.05, -0.06, 0.06, PAL.woodDark);
    b.within(new THREE.Matrix4().makeRotationZ(0.95).setPosition(-0.02, 0.1, 0), () => {
      b.span(-0.003, 0.003, -0.09, 0.09, -0.13, 0.13, PAL.cream);
      for (const [z, y, iw, ih] of ICONS[kind] ?? ICONS.storage) b.span(0.003, 0.007, y * 1.15 - (ih * 1.15) / 2, y * 1.15 + (ih * 1.15) / 2, z * 1.15 - (iw * 1.15) / 2, z * 1.15 + (iw * 1.15) / 2, PAL.blueprint);
    });
  });
}
