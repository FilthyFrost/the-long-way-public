/**
 * A building by the road put together from ModCar's building kit (tools/blender/places/kit: walls, openings,
 * doors, roofs, porches, signs — docs/MODCAR.md §20), the way the old drawing laid it out (game/scene/siteBuild.ts
 * `case 'building'`: the same openings at the same places, the same roof heights), so that what stands in the world
 * — its solids, its door, the things inside — fits it.
 *
 * Frames. The building's own (the site object's): x along it (its w), z across (its d), its front wall — the door,
 * the gate, the windows — at −z, the floor at y = 0. A kit piece (Blender X along the wall, Y through it with the
 * outside at −Y, Z up; as glTF: X along, the outside towards +Z, Y up) is placed by a matrix of that frame: turned
 * to face out of its wall, stretched along the axes it stretches on, repeated in 1 m modules where it repeats.
 * Pure geometry (three's matrices only): what to draw, not how.
 */
import * as THREE from 'three';
import { Rng, hash2 } from '../../core/math/rng';
import type { SiteObject } from '../../core/world/sites';

/** a piece placed: its model, where (the building's frame), which of the building's colours its paint takes */
export interface KitPiece {
  name: string;
  m: THREE.Matrix4;
}

/** a door of the building (its leaf drawn on its own: it swings) */
export interface KitDoor {
  /** the leaf's model */
  name: 'door_wood' | 'door_shop' | 'door_shed';
  /** the hinge (the building's frame, at the floor) and which way the leaf runs from it (+1 along +x, −1 along −x) */
  hx: number;
  hz: number;
  dir: 1 | -1;
  width: number;
  height: number;
}

/** what the kit needs for a building: every piece's name (all must be there, or the old drawing stays) */
export const KIT_PIECES = [
  'wall',
  'plinth',
  'cornice',
  'corner',
  'jamb',
  'lintel',
  'sill',
  'win',
  'door_wood',
  'door_shop',
  'door_shed',
  'gate_box',
  'gate_rail',
  'gate_shutter',
  'roof_slope',
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

/** the pictograms by the sites' SIGN numbers */
const PICTS = ['', 'pict_fuel', 'pict_wrench', 'pict_shop', 'pict_house', 'pict_camp', 'pict_fish', 'pict_game', 'pict_view', 'pict_light', 'pict_works'];

const T = 0.24;
/** how far a roof reaches beyond the walls (m) */
const OVER = 0.42;

const Y = new THREE.Vector3(0, 1, 0);
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();

/** a piece's matrix: at (x, y, z), turned by `turn` about y, scaled (sx along, sy up, sz through/across) */
function at(x: number, y: number, z: number, turn: number, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  return new THREE.Matrix4().compose(tmpP.set(x, y, z), tmpQ.setFromAxisAngle(Y, turn), tmpS.set(sx, sy, sz));
}

/** an opening in a wall: along it from x0 to x1 (the wall's own x: left to right seen from outside), up from y0 to y1 */
interface Opening {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  kind: 'door' | 'gate' | 'window';
}

/**
 * The pieces of a building, and its doors. The openings as the old drawing has them: a door 2.05 m high (a gate as
 * high as the wall lets it, at most 3.1), windows from 0.95 (a shop's wide one from 0.75) to 1.15 above (1.6 for a
 * wide one); a back window and the end walls' as the spec and the building's own dice say.
 */
export function buildingKit(o: SiteObject, seed: number): { pieces: KitPiece[]; doors: KitDoor[] } {
  const sp = o.b!;
  const r = new Rng(hash2(seed | 0, 0xb17d, 0x51));
  const pieces: KitPiece[] = [];
  const doors: KitDoor[] = [];
  const P = (name: string, m: THREE.Matrix4): void => {
    pieces.push({ name, m });
  };
  const w2 = o.w / 2;
  const d2 = o.d / 2;
  const H = o.h;
  const rise = sp.roof === 'gable' ? d2 * 0.62 : sp.roof === 'mono' ? o.d * 0.2 : 0;
  // ---- the footing (a concrete base down into the ground: the land under it is never quite level), the floor
  P('step', at(0, -1.4, 0, 0, o.w + 0.2, 1.4 / 0.15, o.d + 0.2));
  P('floor', at(0, -0.12, 0, 0, o.w - 2 * T + 0.02, 1, o.d - 2 * T + 0.02));
  // ---- the walls: front (−z), back (+z), left end (−x), right end (+x), each seen from outside left to right
  const doorH = sp.gate ? Math.min(H - 0.45, 3.1) : 2.05;
  const sill = sp.windowW > 2 ? 0.75 : 0.95;
  const wTop = Math.min(H - 0.5, sill + (sp.windowW > 2 ? 1.6 : 1.15));
  const frontTop = sp.roof === 'mono' ? H + rise : H;
  // (the front wall's pieces are turned half round to face out: their own x runs along the building's −x)
  const front: Opening[] = [{ x0: -(sp.doorAt + sp.doorW / 2), x1: -(sp.doorAt - sp.doorW / 2), y0: 0, y1: doorH, kind: sp.gate ? 'gate' : 'door' }];
  for (const a of sp.windows) front.push({ x0: -(a + sp.windowW / 2), x1: -(a - sp.windowW / 2), y0: sill, y1: wTop, kind: 'window' });
  const back: Opening[] = !sp.gate && o.w > 6 && r.next() < 0.6 ? [{ x0: -0.6, x1: 0.6, y0: 1.0, y1: Math.min(H - 0.5, 2.0), kind: 'window' }] : [];
  const side = (): Opening[] => (sp.sideWindows && o.d > 3.2 ? [{ x0: -0.55, x1: 0.55, y0: 1.0, y1: Math.min(H - 0.5, 2.0), kind: 'window' }] : []);
  // a wall: its middle at (cx, cz), turned so its outside faces out, from −len/2 to len/2 along its own x
  const wall = (cx: number, cz: number, turn: number, len: number, top: (x: number) => number, ops: Opening[]): void => {
    const W = (x: number, y: number, name: string, sx: number, sy: number, sz = 1, dy = 0): void => {
      // (the wall's own x, its centre line, turned into the building's frame)
      const c = Math.cos(turn);
      const s = Math.sin(turn);
      P(name, at(cx + c * x, y + dy, cz - s * x, turn, sx, sy, sz));
    };
    // the runs of wall between the openings, full height; under and over each opening
    const sorted = [...ops].sort((a, b) => a.x0 - b.x0);
    let x = -len / 2;
    for (const op of [...sorted, null]) {
      const x1 = op ? op.x0 : len / 2;
      if (x1 - x > 0.02) {
        const mid = (x + x1) / 2;
        W(mid, 0, 'wall', x1 - x, top(mid));
      }
      if (!op) break;
      const mid = (op.x0 + op.x1) / 2;
      const ow = op.x1 - op.x0;
      if (op.y0 > 0.02) W(mid, 0, 'wall', ow, op.y0);
      const t = top(mid);
      if (t - op.y1 > 0.02) W(mid, op.y1, 'wall', ow, t - op.y1);
      // the opening's frame
      if (op.kind === 'window') {
        W(mid, op.y0, 'win', ow, op.y1 - op.y0);
        W(mid, op.y0 - 0.07, 'sill', ow + 0.16, 1);
      } else {
        W(op.x0 - 0.05, 0, 'jamb', 1, op.y1);
        W(op.x1 + 0.05, 0, 'jamb', 1, op.y1);
        W(mid, op.y1, 'lintel', ow + 0.2, 1);
        if (op.kind === 'gate') {
          W(mid, op.y1 + 0.16, 'gate_box', ow + 0.2, 1);
          W(op.x0 + 0.04, 0, 'gate_rail', 1, op.y1);
          W(op.x1 - 0.04, 0, 'gate_rail', 1, op.y1);
          // (a shutter stuck part of the way down, as an old garage's is)
          const down = 0.18 + 0.3 * r.next();
          W(mid, op.y1 * (1 - down), 'gate_shutter', ow, op.y1 * down, 1, 0);
        }
      }
      x = op.x1;
    }
    // the base band (not across a door), the band along the top
    let bx = -len / 2;
    for (const op of [...sorted.filter((p) => p.kind !== 'window'), null]) {
      const bx1 = op ? op.x0 : len / 2;
      if (bx1 - bx > 0.05) W((bx + bx1) / 2, 0, 'plinth', bx1 - bx, 1);
      if (!op) break;
      bx = op.x1;
    }
    const flat = top(-len / 2) === top(len / 2);
    if (flat) W(0, top(0) - 0.14, 'cornice', len, 1);
  };
  // (front: outside at −z, a half turn; back: no turn; left end: outside at −x; right end: outside at +x)
  wall(0, -d2 + T / 2, Math.PI, o.w, () => frontTop, front);
  wall(0, d2 - T / 2, 0, o.w, () => H, back);
  // (an end wall under a mono roof rises from the back to the front: its wall to H, the triangle above)
  wall(-w2 + T / 2, 0, -Math.PI / 2, o.d - 2 * T, () => H, side());
  wall(w2 - T / 2, 0, Math.PI / 2, o.d - 2 * T, () => H, side());
  // the corners
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) P('corner', at(sx * (w2 - 0.12), 0, sz * (d2 - 0.12), 0, 1, sz < 0 ? frontTop : H, 1));
  // ---- the roof
  const n = Math.max(1, Math.round(o.w + 2 * OVER));
  const mod = (o.w + 2 * OVER) / n;
  const xs = (i: number): number => -w2 - OVER + mod * (i + 0.5);
  if (sp.roof === 'gable') {
    const k = rise / d2;
    const eave = H - OVER * k;
    const run = d2 + OVER;
    const up = rise + OVER * k;
    for (let i = 0; i < n; i++) {
      // (the front slope: a half turn, its eave out front; the back slope as it is)
      P('roof_slope', new THREE.Matrix4().compose(tmpP.set(xs(i), eave, -run), tmpQ.setFromAxisAngle(Y, Math.PI), tmpS.set(mod, up, run)));
      P('roof_slope', new THREE.Matrix4().compose(tmpP.set(xs(i), eave, run), tmpQ.identity(), tmpS.set(mod, up, run)));
      P('ridge', at(xs(i), H + rise, 0, 0, mod, 1, 1));
    }
    for (const sx of [-1, 1]) P('gable_end', at(sx * (w2 - T / 2), H, 0, 0, 1, rise, o.d - 2 * T));
  } else if (sp.roof === 'mono') {
    const k = rise / o.d;
    const run = o.d + 2 * OVER;
    for (let i = 0; i < n; i++) P('roof_slope', new THREE.Matrix4().compose(tmpP.set(xs(i), H - OVER * k, d2 + OVER), tmpQ.identity(), tmpS.set(mod, rise + 2 * OVER * k, run)));
    // (the end walls' triangles: low at the back, high at the front — the piece's high end at its −y, our −z)
    for (const sx of [-1, 1]) P('mono_end', at(sx * (w2 - T / 2), H, 0, 0, 1, rise, o.d - 2 * T));
  } else {
    P('roof_flat', at(0, H, 0, 0, o.w + 0.3, 1, o.d + 0.3));
    P('parapet', at(0, H, -d2 + 0.12, Math.PI, o.w, 1, 1));
    P('parapet', at(0, H, d2 - 0.12, 0, o.w, 1, 1));
    P('parapet', at(-w2 + 0.12, H, 0, -Math.PI / 2, o.d - 0.24, 1, 1));
    P('parapet', at(w2 - 0.12, H, 0, Math.PI / 2, o.d - 0.24, 1, 1));
  }
  // ---- the porch: on posts, or an awning without
  if (sp.porch > 0) {
    if (sp.porchPosts) {
      const px = w2 - 0.3;
      const pz = -d2 - sp.porch + 0.15;
      const ph = Math.min(H, frontTop) - 0.25;
      for (const sx of [-1, 1]) P('post', at(sx * px, 0, pz, 0, 1, ph, 1));
      P('beam', at(0, ph, pz, Math.PI, o.w - 0.4, 1, 1));
      // its roof: a slope from the wall down to the beam, repeated along the front
      const pn = Math.max(1, Math.round(o.w));
      const pm = o.w / pn;
      for (let i = 0; i < pn; i++) P('roof_slope', new THREE.Matrix4().compose(tmpP.set(-w2 + pm * (i + 0.5), ph + 0.2, pz - 0.2), tmpQ.setFromAxisAngle(Y, Math.PI), tmpS.set(pm, 0.32, sp.porch + 0.05)));
    } else {
      const an = Math.max(1, Math.round(o.w - 1));
      const am = (o.w - 1) / an;
      for (let i = 0; i < an; i++) P('awning', at(-w2 + 0.5 + am * (i + 0.5), Math.min(H, frontTop) - 0.35, -d2, Math.PI, am, 1, sp.porch));
    }
  } else if (!sp.gate) P('step', at(sp.doorAt, -0.15, -d2 - 0.35, 0, sp.doorW + 0.5, 1, 0.6));
  // ---- the chimney, the sign over the door
  if (sp.chimney) P('chimney', at(w2 - 1.1, sp.roof === 'gable' ? H + rise * 0.45 : H, d2 * 0.35, 0));
  const pict = PICTS[sp.sign] ?? '';
  if (pict) {
    const sw = sp.gate ? 1.7 : 1.5;
    P('signboard', at(sp.doorAt, doorH + 0.25, -d2 - 0.07, Math.PI, sw, 1, 1));
    P(pict, at(sp.doorAt, doorH + 0.3, -d2 - 0.12, Math.PI, 1, 1, 1));
  }
  // ---- the doors: a house's wooden one, a shop's glass one, a shed's boards in two leaves
  if (!sp.gate) {
    const shop = sp.sign === 3 || sp.sign === 1;
    const leaves = sp.doorW > 1.3 ? 2 : 1;
    const lw = sp.doorW / leaves;
    const x0 = sp.doorAt - sp.doorW / 2;
    if (leaves === 1) doors.push({ name: shop ? 'door_shop' : 'door_wood', hx: r.next() < 0.5 ? x0 : x0 + sp.doorW, hz: -d2 + T / 2, dir: 1, width: lw, height: 2.04 });
    else {
      doors.push({ name: shop ? 'door_shop' : 'door_wood', hx: x0, hz: -d2 + T / 2, dir: 1, width: lw, height: 2.04 });
      doors.push({ name: shop ? 'door_shop' : 'door_wood', hx: x0 + sp.doorW, hz: -d2 + T / 2, dir: -1, width: lw, height: 2.04 });
    }
    // (a leaf hinged at the far end runs back towards the middle)
    for (const d of doors) if (d.hx > sp.doorAt + 1e-6) d.dir = -1;
  } else if (sp.doorW < 2.5) {
    // a shed's wide door: two leaves of boards
    const x0 = sp.doorAt - sp.doorW / 2;
    doors.push({ name: 'door_shed', hx: x0, hz: -d2 + T / 2, dir: 1, width: sp.doorW / 2, height: Math.min(doorH, 2.0) });
    doors.push({ name: 'door_shed', hx: x0 + sp.doorW, hz: -d2 + T / 2, dir: -1, width: sp.doorW / 2, height: Math.min(doorH, 2.0) });
  }
  return { pieces, doors };
}
