/**
 * The on-foot test yard in the game (?fixture=1): the layout of src/core/onfoot/testbed.ts set on
 * the land beside the road, drawn as painted props in one mesh (one draw call), its solids handed
 * to the player.
 */
import * as THREE from 'three';
import { buildYard, YARD_AHEAD, YARD_OFFSET, type PlacedPiece, type YardFrame } from '../../core/onfoot/testbed';
import { SpineSample } from '../../core/world/spine';
import { surfaceMaterial } from '../render/materials';
import { ModelBuilder } from '../vehicle/builder';
import type { Game } from '../game';
import type { StaticSolids } from '../../core/onfoot/statics';
import type { Player } from './player';

const WOOD = 0x9a7350;
const WOOD_DARK = 0x6b4f3a;
const PLANK = 0xb89466;
const CONCRETE = 0xcfc4ad;
const CONCRETE_DARK = 0x9a8f7c;
const RED = 0xb5402c;
const STEEL = 0x7d8588;
const TANK = 0x3f6f8a;
const TANK_DARK = 0x2c4f63;

/** the yard frame for a vehicle parked at distance s along the road */
export function yardFrameAt(game: Game, s: number): YardFrame {
  const sp = new SpineSample();
  if (game.world) {
    game.world.spine.at(s + YARD_AHEAD, sp);
    return { x: sp.x - Math.sin(sp.phi) * YARD_OFFSET, z: sp.z + Math.cos(sp.phi) * YARD_OFFSET, heading: sp.phi };
  }
  // proving ground: the vehicle faces +x from the origin
  return { x: YARD_AHEAD, z: YARD_OFFSET, heading: 0 };
}

/** one prop in the yard's frame: u along x, height up y, v along z (three's +z = the yard's v) */
function piece(b: ModelBuilder, p: PlacedPiece, y0: number): void {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(p.u, p.y1 - p.h - y0, p.v), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -p.yaw), new THREE.Vector3(1, 1, 1));
  const below = p.h + (p.y1 - p.h - p.y0); // reach down into the ground
  b.within(m, () => {
    const L = p.hx * 2;
    const W = p.hz * 2;
    const H = p.h;
    switch (p.kind) {
      case 'wall': {
        // an old cinder-block wall with a capping course and a darker footing
        b.box(0, H / 2 - (below - H) / 2, 0, L, below, W, CONCRETE);
        b.box(0, H + 0.04, 0, L + 0.06, 0.08, W + 0.08, CONCRETE_DARK);
        b.box(0, 0.12, 0, L + 0.04, 0.24, W + 0.04, CONCRETE_DARK);
        for (let i = 0; i < 3; i++) b.box(-L / 2 + 0.3 + i * (L / 3), 0.75 + (i % 2) * 0.5, W / 2 + 0.005, 0.38, 0.18, 0.02, CONCRETE_DARK);
        break;
      }
      case 'step':
      case 'platform': {
        // a pallet deck on blocks
        b.box(0, H / 2 - (below - H) / 2 - 0.02, 0, L - 0.06, below - 0.04, W - 0.06, WOOD_DARK);
        const n = Math.max(3, Math.round(W / 0.16));
        for (let i = 0; i < n; i++) b.box(0, H - 0.025, -W / 2 + (i + 0.5) * (W / n), L, 0.05, W / n - 0.03, i % 2 ? PLANK : 0xa8845a);
        break;
      }
      case 'crate': {
        const open = p.container?.opened ?? false;
        const tray = H - 0.1;
        // body up to the tray, walls round it, dark inside
        b.box(0, tray / 2 - (below - H) / 2, 0, L - 0.04, tray + (below - H), W - 0.04, WOOD);
        b.box(0, tray + 0.004, 0, L - 0.1, 0.008, W - 0.1, WOOD_DARK);
        for (const sgn of [-1, 1]) {
          b.box(0, tray + 0.05, sgn * (W / 2 - 0.035), L - 0.04, 0.1, 0.03, WOOD);
          b.box(sgn * (L / 2 - 0.035), tray + 0.05, 0, 0.03, 0.1, W - 0.04, WOOD);
        }
        for (const y of [0.08, H - 0.08]) {
          b.box(0, y, W / 2 - 0.005, L, 0.1, 0.03, PLANK);
          b.box(0, y, -W / 2 + 0.005, L, 0.1, 0.03, PLANK);
        }
        b.bar(-L / 2 + 0.05, 0.1, W / 2 + 0.01, L / 2 - 0.05, H - 0.1, W / 2 + 0.01, 0.07, PLANK);
        if (!open) b.box(0, H - 0.015, 0, L, 0.03, W, PLANK);
        // the lid leant against its back
        else b.box(0, H * 0.55, -W / 2 - 0.09, L, 0.03, H * 0.95, PLANK, { rx: Math.PI / 2 - 0.2 });
        break;
      }
      case 'toolbox': {
        const open = p.container?.opened ?? false;
        b.box(0, H * 0.4 - (below - H) / 2, 0, L, H * 0.8 + (below - H), W, RED);
        b.box(0, H * 0.82, 0, L - 0.04, 0.008, W - 0.04, 0x2f3035);
        if (!open) {
          b.box(0, H * 0.86, 0, L + 0.02, H * 0.14, W + 0.02, 0x8f3324);
          b.bar(-L * 0.3, H, 0, L * 0.3, H, 0, 0.03, STEEL);
        } else b.box(0, H * 0.85 + W * 0.45, -W / 2 - 0.03, L + 0.02, H * 0.14, W, 0x8f3324, { rx: -1.3 });
        b.box(0, H * 0.55, W / 2 + 0.005, 0.08, 0.04, 0.02, STEEL);
        break;
      }
      case 'tank': {
        // a fuel tank on a cradle: a fat drum lying on two trestles, filler on top
        const r = p.hx;
        b.cyl(0, H / 2 - (below - H) / 2, 0, r, below, TANK, { segments: 14 });
        b.cyl(0, H * 0.25, 0, r + 0.02, 0.06, TANK_DARK, { segments: 14 });
        b.cyl(0, H * 0.75, 0, r + 0.02, 0.06, TANK_DARK, { segments: 14 });
        b.cyl(0.18, H + 0.06, 0.1, 0.07, 0.12, STEEL, { segments: 8 });
        b.cyl(-0.12, H + 0.03, -0.12, 0.05, 0.06, RED, { segments: 8 });
        // the tap and its hose
        b.cyl(-r - 0.05, 0.4, 0, 0.04, 0.12, STEEL, { rz: Math.PI / 2, segments: 8 });
        b.torus(-r - 0.12, 0.28, 0, 0.12, 0.022, 0x2f3035, { rx: Math.PI / 2 });
        break;
      }
      case 'post': {
        b.box(0, H / 2 - (below - H) / 2, 0, p.hx * 2, below, p.hx * 2, WOOD_DARK);
        b.box(0, H - 0.04, 0, p.hx * 2 + 0.03, 0.08, p.hx * 2 + 0.03, WOOD);
        break;
      }
    }
  });
}

export class Fixture {
  readonly frame: YardFrame;
  readonly solids: StaticSolids;
  readonly pieces: PlacedPiece[];
  readonly mesh: THREE.Mesh;
  /** height the mesh is built relative to */
  readonly y0: number;

  constructor(
    readonly game: Game,
    player: Player,
    s: number,
  ) {
    this.frame = yardFrameAt(game, s);
    const built = buildYard(player.land, this.frame, player);
    this.solids = built.solids;
    this.pieces = built.pieces;
    this.y0 = game.world ? game.world.heightAt(this.frame.x, this.frame.z) : 0;
    this.mesh = new THREE.Mesh(this.build(), surfaceMaterial({ vertexColors: true, ink: true }));
    this.mesh.rotation.y = -this.frame.heading;
    this.mesh.name = 'player.fixture';
    game.core.scene.add(this.mesh);
    player.solids.add(this.solids);
  }

  private opened = '';

  private build(): THREE.BufferGeometry {
    const b = new ModelBuilder();
    for (const p of this.pieces) piece(b, p, this.y0);
    this.opened = this.openKey();
    return b.build();
  }

  private openKey(): string {
    return this.pieces.map((p) => (p.container?.opened ? 1 : 0)).join('');
  }

  /** keep it in place as the render origin moves; redraw when a lid has been opened */
  update(): void {
    if (this.openKey() !== this.opened) {
      this.mesh.geometry.dispose();
      this.mesh.geometry = this.build();
    }
    this.game.core.place(this.mesh, this.frame.x, this.y0, this.frame.z);
  }
}
