/**
 * The great forms' water (G8, core/world/earth/wonders.ts): a salt pan's film — the sky's mirror — and a caldera's
 * lake, drawn as sheets of their own. The land itself is the land function's: the tiles draw it.
 *
 *   pan      a strip of sheet along its causeway, out to where the pan ends either side; every vertex carries how deep
 *            the film stands over the land there (World.shape) and how fully the point lies on the pan; painted by
 *            render/mirror.ts panMaterial with the mirror's picture;
 *   caldera  a square of sheet over its lake at the lake's level, the depth of its bed at every vertex, painted as any
 *            lake is (render/water.ts) with the mirror's picture for what lies on it: the rim across the water.
 *
 * Each is built a few rows a frame as its place comes within reach, and asks for the mirror (render/mirror.ts) while
 * the eye is over it.
 */
import * as THREE from 'three';
import { SpineSample } from '../../core/world/spine';
import { TerrainPoint, type World } from '../../core/world/terrain';
import { PAN_FILM, wonderKindOf, type Caldera, type Pan, type Wonder } from '../../core/world/earth/wonders';
import type { RenderCore } from '../render/core';
import { panMaterial } from '../render/mirror';
import { waterMaterial } from '../render/water';

/** a pan's sheet: its rows across the road, metres from the centre line either side */
const PAN_ROWS = [5.5, 7, 9, 12, 17, 26, 42, 70, 120, 200, 330, 540, 860, 1300, 1850];
/** … and three more about its edge, from where it lies in full (Pan.w0): the film's edge is the mesh's own */
const PAN_EDGE_ROWS = [-25, 30, 110];
/** … and how far apart its stations along the road are (m) */
const PAN_STEP = 40;
/** a caldera's sheet: this many cells across */
const LAKE_CELLS = 76;

interface Build {
  wonder: Pan | Caldera;
  /** rows done, and what they are written into */
  row: number;
  rows: number;
  cols: number;
  pos: Float32Array;
  att: Float32Array;
  anchor: [number, number, number];
}

interface Live {
  meshes: THREE.Mesh[];
  anchors: [number, number, number][];
  builds: Build[];
  wonders: readonly Wonder[];
}

export class WonderView {
  private readonly live = new Map<number, Live>();
  private readonly tp = new TerrainPoint();
  private readonly st = new SpineSample();
  private readonly lakeMat = waterMaterial(true);
  private planS = NaN;
  /** sheets drawn (the harness asks) */
  sheets = 0;

  constructor(
    private readonly core: RenderCore,
    private readonly world: World,
  ) {
    core.onRebase(() => {
      for (const l of this.live.values()) l.meshes.forEach((m, i) => core.place(m, l.anchors[i][0], l.anchors[i][1], l.anchors[i][2]));
    });
  }

  /** the great forms of the places in reach (the harness asks) */
  near(): Wonder[] {
    const out: Wonder[] = [];
    for (const l of this.live.values()) out.push(...l.wonders);
    return out;
  }

  /**
   * @param s the eye's place along the road (m)
   * @param ex,ey,ez the eye, in the world
   */
  update(s: number, ex: number, ey: number, ez: number): void {
    const earth = this.world.earth;
    const wonders = this.world.wonders;
    if (!earth || !wonders) return;
    if (!(Math.abs(s - this.planS) < 150)) {
      this.planS = s;
      const keep = new Set<number>();
      for (const p of earth.pieces) {
        if (p.end < s - 6000 || p.start > s + 9000 || wonderKindOf(p) === null) continue;
        keep.add(p.index);
        if (this.live.has(p.index)) continue;
        const ws = wonders.of(p);
        const builds: Build[] = [];
        for (const w of ws) {
          if (w.kind === 'pan') builds.push(this.beginPan(w));
          else if (w.kind === 'caldera') builds.push(this.beginLake(w));
        }
        this.live.set(p.index, { meshes: [], anchors: [], builds, wonders: ws });
      }
      for (const [k, l] of this.live) {
        if (keep.has(k)) continue;
        for (const m of l.meshes) {
          this.core.scene.remove(m);
          m.geometry.dispose();
          if (m.material !== this.lakeMat) (m.material as THREE.Material).dispose();
        }
        this.live.delete(k);
      }
    }
    // build: a few rows a frame, the nearest place's first
    let budget = 3;
    for (const l of this.live.values()) {
      while (l.builds.length && budget > 0) {
        budget--;
        const b = l.builds[0];
        if (b.wonder.kind === 'pan' ? this.stepPan(b) : this.stepLake(b)) {
          l.builds.shift();
          const mesh = this.finish(b);
          if (mesh) {
            l.meshes.push(mesh);
            l.anchors.push(b.anchor);
            this.core.place(mesh, b.anchor[0], b.anchor[1], b.anchor[2]);
            this.core.scene.add(mesh);
          }
        }
      }
    }
    // the mirror: the water the eye is over, or nearest
    this.sheets = 0;
    let best = Infinity;
    let level = 0;
    for (const l of this.live.values()) {
      this.sheets += l.meshes.length;
      for (const w of l.wonders) {
        let d = Infinity;
        let y = 0;
        if (w.kind === 'pan') {
          d = s < w.s0 - 900 ? w.s0 - 900 - s : s > w.s1 + 900 ? s - w.s1 - 900 : 0;
          y = w.level + PAN_FILM;
        } else if (w.kind === 'caldera') {
          d = Math.max(0, Math.hypot(ex - w.cx, ez - w.cz) - w.r0 - 500);
          y = w.lake;
        } else continue;
        if (ey > y && d < best) {
          best = d;
          level = y;
        }
      }
    }
    this.core.mirror.plane = best < 1500 ? level : null;
  }

  private beginPan(w: Pan): Build {
    const s0 = w.s0 - w.fade;
    const rows = Math.ceil((w.s1 + w.fade - s0) / PAN_STEP) + 1;
    const cols = (PAN_ROWS.length + PAN_EDGE_ROWS.length) * 2;
    this.world.spine.at((w.s0 + w.s1) / 2, this.st);
    return { wonder: w, row: 0, rows, cols, pos: new Float32Array(rows * cols * 3), att: new Float32Array(rows * cols * 3), anchor: [this.st.x, w.level + PAN_FILM, this.st.z] };
  }

  /** eight stations more of a pan's sheet; true when it is done */
  private stepPan(b: Build): boolean {
    const w = b.wonder as Pan;
    const { tp, st } = this;
    const s0 = w.s0 - w.fade;
    const end = Math.min(b.rows, b.row + 8);
    for (let j = b.row; j < end; j++) {
      this.world.spine.at(Math.min(w.s1 + w.fade, s0 + j * PAN_STEP), st);
      // (across the road by the road point of the same x, as the land measures its pan: the sheet covers it to its corners)
      const across = 1 / Math.cos(st.phi);
      for (let i = 0; i < b.cols; i++) {
        const half = b.cols / 2;
        const q = i < half ? half - 1 - i : i - half;
        const off = q < PAN_ROWS.length ? PAN_ROWS[q] : w.w0 + PAN_EDGE_ROWS[q - PAN_ROWS.length];
        const lat = i < half ? -off : off;
        const x = st.x;
        const z = st.z + lat * across;
        this.world.shape(x, z, tp);
        const k = j * b.cols + i;
        b.pos[k * 3] = x - b.anchor[0];
        b.pos[k * 3 + 1] = 0;
        b.pos[k * 3 + 2] = z - b.anchor[2];
        b.att[k * 3] = tp.wkind === 4 ? Math.max(-0.5, tp.wl - tp.bed) : -0.5;
        b.att[k * 3 + 1] = tp.pan;
        // (by the road: over its strip of land, whose depth is pulled towards the eye — render/mirror.ts)
        b.att[k * 3 + 2] = off < 60 ? 1 : 0;
      }
    }
    b.row = end;
    return end >= b.rows;
  }

  private beginLake(w: Caldera): Build {
    const n = LAKE_CELLS + 1;
    return { wonder: w, row: 0, rows: n, cols: n, pos: new Float32Array(n * n * 3), att: new Float32Array(n * n * 4), anchor: [w.cx, w.lake, w.cz] };
  }

  /** six rows more of a caldera's lake; true when it is done */
  private stepLake(b: Build): boolean {
    const w = b.wonder as Caldera;
    const tp = this.tp;
    const R = w.r0 * 1.02;
    const end = Math.min(b.rows, b.row + 6);
    for (let j = b.row; j < end; j++) {
      const z = (j / LAKE_CELLS - 0.5) * 2 * R;
      for (let i = 0; i < b.cols; i++) {
        const x = (i / LAKE_CELLS - 0.5) * 2 * R;
        this.world.shape(w.cx + x, w.cz + z, tp);
        const k = j * b.cols + i;
        b.pos[k * 3] = x;
        b.pos[k * 3 + 1] = 0;
        b.pos[k * 3 + 2] = z;
        b.att[k * 4] = tp.wl === w.lake ? w.lake - tp.bed : -5;
      }
    }
    b.row = end;
    return end >= b.rows;
  }

  private finish(b: Build): THREE.Mesh | null {
    const pan = b.wonder.kind === 'pan';
    const stride = pan ? 3 : 4;
    const idx: number[] = [];
    for (let j = 0; j < b.rows - 1; j++) {
      for (let i = 0; i < b.cols - 1; i++) {
        // (a pan's sheet leaves the road's own strip open, between its two innermost rows)
        if (pan && i === b.cols / 2 - 1) continue;
        const a = j * b.cols + i;
        const c = a + b.cols;
        if (Math.max(b.att[a * stride], b.att[(a + 1) * stride], b.att[c * stride], b.att[(c + 1) * stride]) < -0.1) continue;
        // (their faces up: an eye under the plane, the mirror's, sees none of them)
        if (pan) idx.push(a, a + 1, c, a + 1, c + 1, c);
        else idx.push(a, c, a + 1, a + 1, c, c + 1);
      }
    }
    if (!idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(b.pos, 3));
    g.setAttribute(pan ? 'aFilm' : 'aWater', new THREE.BufferAttribute(b.att, stride));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, pan ? panMaterial(0.2 + 0.3 * (((b.wonder as Pan).seed >>> 8) & 255) / 255) : this.lakeMat);
    mesh.name = pan ? 'wonder:pan' : 'wonder:lake';
    mesh.renderOrder = pan ? 0 : 3;
    return mesh;
  }
}
