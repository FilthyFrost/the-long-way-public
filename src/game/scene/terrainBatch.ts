import * as THREE from 'three';
import type { RenderCore } from '../render/core';

/**
 * The land's leaves drawn in a few calls (docs/V3/nodes/P3-terrain-batch.md). Every leaf of the terrain's quadtree
 * is the same grid (worldBuild.ts buildTerrain: 33 × 33 points and their skirts over one shared index), so the leaves
 * drawn with one material share batches of fixed slots: a leaf takes a free slot, its points are written into it and
 * it is drawn there by its own translation. A batch is one call (WEBGL_multi_draw) where every leaf was one; each
 * leaf is still culled by its own bounds.
 *
 * A slot is never given back to the batch's buffers (BatchedMesh would only append), only hidden and handed to the
 * next leaf, which is the same size: a batch's buffers never grow past its slots, and a leaf costs what it did, its
 * points copied in and sent to the GPU once.
 */
export interface TerrainSlot {
  readonly page: TerrainPage;
  readonly i: number;
  /** where the leaf's origin lies in the world (the render origin moves under it: rebase) */
  readonly wx: number;
  readonly wy: number;
  readonly wz: number;
}

export interface TerrainPage {
  readonly mesh: THREE.BatchedMesh;
  readonly material: THREE.Material;
  readonly size: number;
  /** each slot's geometry and instance in the batch (−1: not made yet) */
  readonly geo: Int32Array;
  readonly inst: Int32Array;
  made: number;
  readonly free: number[];
  readonly slots: (TerrainSlot | null)[];
  used: number;
  /** kept when empty: the shared material's pages are wanted again as soon as one drives on */
  readonly keep: boolean;
}

export class TerrainBatch {
  readonly pages: TerrainPage[] = [];
  private readonly m = new THREE.Matrix4();

  /**
   * @param verts points in a leaf (all leaves have as many)
   * @param indices indices in a leaf
   * @param perPage slots in a batch of the shared material; a batch of a material of its own (the far ring's) has `ownPage`
   */
  constructor(
    private readonly core: Pick<RenderCore, 'origin'>,
    private readonly parent: THREE.Object3D,
    private readonly name: string,
    private readonly verts: number,
    private readonly indices: number,
    private readonly perPage = 64,
    private readonly ownPage = 16,
  ) {}

  /**
   * A leaf into a slot of a batch drawn with `material`. The geometry's points are copied: the caller may dispose
   * of it at once. `keep`: the material is shared and lasts (its batches stay when empty).
   */
  add(geometry: THREE.BufferGeometry, material: THREE.Material, wx: number, wy: number, wz: number, keep: boolean): TerrainSlot {
    let page: TerrainPage | undefined;
    for (const p of this.pages) {
      if (p.material === material && (p.free.length > 0 || p.made < p.size)) {
        page = p;
        break;
      }
    }
    if (!page) page = this.newPage(material, keep);
    const mesh = page.mesh;
    let i: number;
    if (page.free.length > 0) {
      i = page.free.pop()!;
      mesh.setGeometryAt(page.geo[i], geometry);
      mesh.setVisibleAt(page.inst[i], true);
    } else {
      i = page.made++;
      page.geo[i] = mesh.addGeometry(geometry, this.verts, this.indices);
      page.inst[i] = mesh.addInstance(page.geo[i]);
    }
    const slot: TerrainSlot = { page, i, wx, wy, wz };
    page.slots[i] = slot;
    page.used++;
    this.place(slot);
    return slot;
  }

  /** a leaf out of its batch; a batch of a material of its own goes with its last leaf */
  remove(slot: TerrainSlot): void {
    const p = slot.page;
    if (p.slots[slot.i] !== slot) return;
    p.mesh.setVisibleAt(p.inst[slot.i], false);
    p.slots[slot.i] = null;
    p.free.push(slot.i);
    p.used--;
    if (p.used === 0 && !p.keep) {
      this.parent.remove(p.mesh);
      p.mesh.dispose();
      this.pages.splice(this.pages.indexOf(p), 1);
    }
  }

  /** every leaf set again where the world puts it, the render origin having moved */
  rebase(): void {
    for (const p of this.pages) for (const s of p.slots) if (s) this.place(s);
  }

  /** leaves held, and batches */
  get leaves(): number {
    let n = 0;
    for (const p of this.pages) n += p.used;
    return n;
  }

  private place(s: TerrainSlot): void {
    const o = this.core.origin;
    this.m.makeTranslation(s.wx - o.x, s.wy - o.y, s.wz - o.z);
    s.page.mesh.setMatrixAt(s.page.inst[s.i], this.m);
  }

  private newPage(material: THREE.Material, keep: boolean): TerrainPage {
    const size = keep ? this.perPage : this.ownPage;
    const mesh = new THREE.BatchedMesh(size, size * this.verts, size * this.indices, material);
    mesh.name = this.name;
    // (each leaf is culled by its own bounds; the batch's own sphere is not kept up as leaves come and go)
    mesh.frustumCulled = false;
    mesh.perObjectFrustumCulled = true;
    mesh.sortObjects = true;
    this.parent.add(mesh);
    const page: TerrainPage = {
      mesh,
      material,
      size,
      geo: new Int32Array(size).fill(-1),
      inst: new Int32Array(size).fill(-1),
      made: 0,
      free: [],
      slots: new Array<TerrainSlot | null>(size).fill(null),
      used: 0,
      keep,
    };
    this.pages.push(page);
    return page;
  }
}
