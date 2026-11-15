/**
 * A plain stand-in workshop for building and testing vehicles until the real starting garage
 * (docs/MODCAR.md §9) is in: a concrete floor, a timber back wall and side walls, a roof on beams,
 * a workbench and shelves to put parts on, the door open to a concrete apron. Everything the game
 * needs from a garage goes through the GarageScene interface, which the real one implements too.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FlatGround, Surface, type Ground } from '../../core/world/ground';
import { FunctionLand, type Land } from '../../core/onfoot/land';
import { Solid, type SolidSource } from '../../core/world/solids';
import type { Text } from '../../core/modcar/types';
import { surfaceMaterial } from '../render/materials';
import type { RenderCore } from '../render/core';
import type { LooseThings } from './loose';
import type { ModPlayer } from './player';
import type { ModUI } from './ui';
import type { ModVehicle } from './vehicle';

export interface GarageDevice {
  id: string;
  /** aim point (world) and how big it is to look at */
  x: number;
  y: number;
  z: number;
  radius: number;
  /** what pressing would do, as the mark shows it (may change with the device's state) */
  readonly word: Text;
  use(): void;
}

/** what a garage may look at and touch each frame: its devices work on the things in it */
export interface GarageContext {
  readonly vehicles: readonly ModVehicle[];
  readonly loose: LooseThings;
  readonly player: ModPlayer;
  readonly ui: ModUI;
  /** the vehicle the player sits in, if any */
  readonly seated: ModVehicle | null;
  /** the hour of the day (the clock on the wall) */
  readonly hour: number;
  /** the checklist of the first build (the chalkboard) */
  checklist(): { text: string; done: boolean }[];
  /** a vehicle's build was changed by a device (a new coat of paint) */
  changed(v: ModVehicle, what: string): void;
  sound(name: string, gain?: number): void;
}

export interface GarageScene {
  readonly root: THREE.Group;
  readonly solids: SolidSource;
  /** for the vehicles */
  readonly ground: Ground;
  /** for the walker */
  readonly land: Land;
  /** highest surface at (x, z) not above `fromY`: the floor, a bench, a shelf */
  surfaceAt(x: number, z: number, fromY: number): number;
  readonly spawn: { x: number; z: number; heading: number };
  /** where the project vehicle stands, facing the door */
  readonly carSpot: { x: number; z: number; yaw: number };
  /** a second bay */
  readonly bay2: { x: number; z: number; yaw: number };
  /** places for things to lie at the start: floor spots, the bench, the shelves */
  readonly spots: { x: number; y: number; z: number; yaw: number; where: 'floor' | 'bench' | 'shelf' }[];
  /** a vehicle driving past this x has left for the road */
  readonly exitX: number;
  readonly devices: GarageDevice[];
  /** resolves when the models are in (the screenshots wait for it) */
  readonly ready: Promise<void>;
  update(dt: number, ctx: GarageContext): void;
  /** exposure factor for an eye at (x, y, z) (world): the eye opens up indoors */
  exposureAt(x: number, y: number, z: number): number;
  /** where the fine shadow map should be centred for someone at (x, z) looking along heading (world; fills out) */
  shadowFocus?(x: number, z: number, heading: number, out: { x: number; y: number; z: number }): void;
  /** a garage whose doors open: are they open (wide enough to drive out)? */
  doorsOpen?(): boolean;
  /** for the test hook: the doors, the lamps, the devices' state */
  telemetry(): Record<string, string | number | boolean>;
  dispose(): void;
}

class Boxes implements SolidSource {
  readonly list: Solid[] = [];
  add(x: number, z: number, hx: number, hz: number, y0: number, y1: number, floor = false): Solid {
    const s = new Solid().set(x, z, hx, hz, 0, y0, y1, floor, 'garage');
    this.list.push(s);
    return s;
  }
  solidsNear(x: number, z: number, r: number, out: Solid[]): void {
    for (const s of this.list) if (Math.abs(s.x - x) < s.hx + r + 0.1 && Math.abs(s.z - z) < s.hz + r + 0.1) out.push(s);
  }
}

/** the workshop: 14 m long (door at +x), 10 m wide, roof at 3.6 m */
export function buildGarageStub(core: RenderCore): GarageScene {
  const root = new THREE.Group();
  root.name = 'garage';
  const geo: Record<string, THREE.BufferGeometry[]> = { floor: [], wall: [], wood: [], roof: [], steel: [], apron: [] };
  const boxGeo = (key: string, sx: number, sy: number, sz: number, x: number, y: number, z: number): void => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(x, y, z);
    geo[key].push(g);
  };
  const L = 14;
  const W = 10;
  const H = 3.6;
  const x0 = -L / 2;
  const x1 = L / 2;
  boxGeo('floor', L, 0.2, W, 0, -0.1, 0);
  boxGeo('apron', 26, 0.18, 14, x1 + 13, -0.09, 0);
  // back wall and side walls (the right one with two windows)
  boxGeo('wall', 0.2, H, W, x0, H / 2, 0);
  boxGeo('wall', L, H, 0.2, 0, H / 2, -W / 2);
  boxGeo('wall', L, 1.0, 0.2, 0, 0.5, W / 2);
  boxGeo('wall', L, 0.9, 0.2, 0, H - 0.45, W / 2);
  for (const px of [-6.5, -2.2, 2.2, 6.5]) boxGeo('wall', 1.0, H, 0.2, px, H / 2, W / 2);
  // roof on beams
  boxGeo('roof', L + 0.6, 0.12, W + 0.6, 0, H + 0.06, 0);
  for (let bx = x0 + 1; bx < x1; bx += 2.4) boxGeo('wood', 0.16, 0.24, W, bx, H - 0.12, 0);
  // door frame
  boxGeo('wood', 0.3, H, 0.3, x1, H / 2, -W / 2 + 0.15);
  boxGeo('wood', 0.3, H, 0.3, x1, H / 2, W / 2 - 0.15);
  boxGeo('wood', 0.3, 0.4, W, x1, H - 0.2, 0);
  // workbench along the left wall, shelves along the right
  const solids = new Boxes();
  const benchTop = 0.92;
  boxGeo('wood', 4.2, 0.08, 0.8, -3.5, benchTop - 0.04, -W / 2 + 0.55);
  for (const lx of [-5.4, -1.6]) boxGeo('wood', 0.08, benchTop - 0.08, 0.7, lx, (benchTop - 0.08) / 2, -W / 2 + 0.55);
  solids.add(-3.5, -W / 2 + 0.55, 2.1, 0.4, 0, benchTop, true);
  const shelves = [0.45, 1.25, 2.05];
  for (const sy of shelves) boxGeo('wood', 5.0, 0.05, 0.6, -2.5, sy, W / 2 - 0.45);
  for (const lx of [-5, 0]) boxGeo('steel', 0.05, 2.2, 0.6, lx, 1.1, W / 2 - 0.45);
  solids.add(-2.5, W / 2 - 0.45, 2.5, 0.3, 0, 2.2);
  // the walls as solids
  solids.add(x0, 0, 0.1, W / 2, 0, H);
  solids.add(0, -W / 2, L / 2, 0.1, 0, H);
  solids.add(0, W / 2, L / 2, 0.1, 0, H);

  const mats: Record<string, THREE.Material> = {
    floor: surfaceMaterial({ color: 0x9a968e, brush: 0.6 }),
    apron: surfaceMaterial({ color: 0xa6a298, brush: 0.7 }),
    wall: surfaceMaterial({ color: 0xb9946a, brush: 0.8 }),
    wood: surfaceMaterial({ color: 0x7a5434, brush: 0.5 }),
    roof: surfaceMaterial({ color: 0x5f4a3c, brush: 0.4, side: THREE.DoubleSide }),
    steel: surfaceMaterial({ color: 0x5e6a70, spec: 0.3 }),
  };
  for (const [k, list] of Object.entries(geo)) {
    if (!list.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(list, false), mats[k]);
    mesh.name = `garage:${k}`;
    mesh.castShadow = k !== 'floor' && k !== 'apron';
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  core.scene.add(root);
  core.place(root, 0, 0, 0);

  const ground = new FlatGround({ surface: Surface.Asphalt });
  const land = new FunctionLand(() => 0);
  const spots: GarageScene['spots'] = [];
  // floor spots round the car's bay, the bench, the shelves
  for (const [x, z] of [
    [-4.2, -1.6],
    [-4.2, 1.6],
    [-2.6, -3.2],
    [-1.0, -3.2],
    [0.6, -3.2],
    [2.2, -3.2],
    [3.8, -3.2],
    [-2.6, 3.0],
    [-1.0, 3.0],
    [0.6, 3.0],
    [2.2, 3.0],
    [3.8, 3.0],
    [5.4, -3.2],
    [5.4, 3.0],
  ])
    spots.push({ x, y: 0, z, yaw: 0, where: 'floor' });
  for (let i = 0; i < 6; i++) spots.push({ x: -5.2 + i * 0.68, y: benchTop, z: -W / 2 + 0.55, yaw: Math.PI / 2, where: 'bench' });
  for (const sy of shelves) for (let i = 0; i < 6; i++) spots.push({ x: -4.6 + i * 0.8, y: sy + 0.03, z: W / 2 - 0.45, yaw: -Math.PI / 2, where: 'shelf' });

  const surfaceAt = (x: number, z: number, fromY: number): number => {
    let best = 0;
    // bench
    if (Math.abs(x + 3.5) < 2.1 && Math.abs(z - (-W / 2 + 0.55)) < 0.4 && fromY >= benchTop - 0.02) best = Math.max(best, benchTop);
    // shelves
    if (Math.abs(x + 2.5) < 2.5 && Math.abs(z - (W / 2 - 0.45)) < 0.3) for (const sy of shelves) if (fromY >= sy + 0.02) best = Math.max(best, sy + 0.025);
    return best;
  };

  return {
    root,
    solids,
    ground,
    land,
    surfaceAt,
    spawn: { x: -4.6, z: -0.4, heading: 0.15 },
    carSpot: { x: 0.4, z: 0, yaw: 0 },
    bay2: { x: 9, z: 3, yaw: 0 },
    spots,
    exitX: x1 + 14,
    devices: [],
    ready: Promise.resolve(),
    update: () => {},
    exposureAt: () => 1,
    telemetry: () => ({ garage: 'stub' }),
    dispose: () => {
      root.removeFromParent();
      for (const m of Object.values(mats)) m.dispose();
    },
  };
}
