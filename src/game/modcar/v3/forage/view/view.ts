/**
 * What is drawn of the forage points (node W3): ONE instanced batch, one draw call, for every plant one picks
 * off the ground and for the glint over every point (families.ts: the models; material.ts: the shader).
 *
 * Trees, shrubs and bushes that bear are the world's own (the scatter draws them, with their fruit): of those
 * this draws nothing but the glint. The ground plants that bear are not drawn by anything else: each is an
 * instance of its family's model, stretched to the plant's crown and height, turned as the flora field turned
 * it, in the plant's two colours.
 *
 * The batch is written anew whenever the system hands over the points that show (three times a second at the
 * most, and when one is picked): a plant within 60 m gets an instance (it grows in between 45 and 35 m, in
 * the shader); a tree's or a bush's glint only within reach of the hint distance. A point that was not there
 * the last time grows in over half a second; a picked one stays in the batch a third of a second longer,
 * shrinking. Nothing here allocates once the batch is as large as it needs to be.
 *
 * The batch casts no shadow (its plants are a hand high) and is placed anew each frame against the floating
 * origin; its instances are written about an anchor of their own, where one stood when it was last written.
 */
import * as THREE from 'three';
import type { ForagePoint } from '../../../../../core/v3/forage/field';
import { FORAGE_KINDS } from '../../../../../core/v3/forage/kinds';
import { PLANTS } from '../../../../../core/world/plants';
import type { GameContext } from '../../../kernel/context';
import type { ForageShow } from '../system';
import { buildForageAtlas, FAMILY_INDEX, FLOATS, type ForageAtlas } from './families';
import { FADE_FAR, forageMaterial, SHRINK_S } from './material';

/** a ground plant this near where one stands is in the batch (m): the growing-in ends at FADE_FAR, the rest is room to walk in before the batch is written again */
const PLANT_M = FADE_FAR + 15;
/** a glint is in the batch this far beyond the hint distance (m) */
const GLINT_MARGIN_M = 10;
/** the small plants are drawn a little larger than they stand (things to find are drawn to be found); a patch a metre across is not */
const SIZE = 1.35;
const SIZE_FROM = 0.4;
const SIZE_TO = 0.75;
/** the least a plant measures as drawn (m): across, and up */
const LEAST_ACROSS = 0.1;
const LEAST_UP = 0.06;
/** how high over a plant's top, or over where the mark aims at a bush or a tree, its glint stands (m) */
const GLINT_LIFT = 0.16;
/** the family number of an instance that is nothing but a glint */
const ONLY_GLINT = -2;
const LONG_AGO = -1e6;
const NEVER = 1e6;
/** picked points that are still shrinking: no more than this many at a time */
const DYING = 8;

/** how far over the water's surface the mark aims at a plant of the water (system.ts aimAt) */
export const AIM_OVER_WATER = 0.05;

/** n numbers from one list into another (no view of either is made: this runs while the game does) */
function copy(from: Float32Array, at: number, to: Float32Array, into: number, n: number): void {
  for (let i = 0; i < n; i++) to[into + i] = from[at + i];
}

/** what the view needs of the renderer (render/core.ts RenderCore has it) */
export interface ForageStage {
  readonly scene: THREE.Scene;
  readonly origin: { x: number; y: number; z: number };
}

export class ForageView implements ForageShow {
  readonly atlas: ForageAtlas;
  readonly mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly material: THREE.ShaderMaterial;
  /** the material's two uniforms the view writes every frame: where one stands, and (hint distance, mark, seconds since the batch was written) */
  private readonly eye: THREE.Vector3;
  private readonly state: THREE.Vector4;
  private capacity = 0;
  private matrix!: Float32Array;
  private tintA!: Float32Array;
  private tintB!: Float32Array;
  private data!: Float32Array;
  private more!: Float32Array;
  /** each instance's point (its key) and when it appeared, on the view's clock */
  private keys!: Float64Array;
  private born!: Float32Array;
  private lastKeys!: Float64Array;
  private lastBorn!: Float32Array;
  private lastCount = 0;
  private count = 0;
  /** the view's own clock (s), and how long ago the batch was written */
  private clock = 0;
  private since = 0;
  /** where the instances are written about (world), and where one stands */
  private readonly anchor = { x: 0, y: 0, z: 0 };
  private readonly here = { x: 0, y: 0, z: 0 };
  private hintM = 8;
  private mark = false;
  /** each plant's two colours, linear: six numbers a plant, by its index in PLANTS */
  private readonly tints: Float32Array;
  /** the picked points still shrinking: sixteen numbers of matrix (about the anchor of then), the colours and the rest, as they were; and when each was picked */
  private readonly dying = new Float32Array(DYING * 28);
  private readonly dyingAt = new Float32Array(DYING).fill(LONG_AGO);
  private readonly dyingKey = new Float64Array(DYING).fill(-1);
  /** the anchor each of them was written about (world; kept apart: a world coordinate does not fit the batch's small numbers) */
  private readonly dyingBase = new Float64Array(DYING * 3);

  constructor(private readonly stage: ForageStage) {
    this.atlas = buildForageAtlas();
    this.material = forageMaterial();
    this.eye = this.material.uniforms.uEye.value as THREE.Vector3;
    this.state = this.material.uniforms.uState.value as THREE.Vector4;
    this.mesh = new THREE.InstancedMesh(this.atlas.geometry, this.material, 1);
    this.mesh.name = 'forage:plants';
    // (instances lie anywhere within 150 m of the anchor, and most of the geometry is put outside the view by the shader)
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.grow(256);
    const c = new THREE.Color();
    this.tints = new Float32Array(PLANTS.length * 6);
    PLANTS.forEach((p, i) => {
      // (a plant without colours of its own would take its region's: none of the forage plants is without)
      c.setHex(p.tint ? p.tint[0] : 0x6fa456);
      this.tints.set([c.r, c.g, c.b], i * 6);
      c.setHex(p.tint ? p.tint[1] : 0xc2334a);
      this.tints.set([c.r, c.g, c.b], i * 6 + 3);
    });
    stage.scene.add(this.mesh);
  }

  /** room for this many instances (the buffers made anew: at the start, and if ever a place has more points than any before) */
  private grow(n: number): void {
    this.capacity = n;
    const g = this.atlas.geometry;
    const inst = (size: number): { array: Float32Array; attr: THREE.InstancedBufferAttribute } => {
      const array = new Float32Array(n * size);
      const attr = new THREE.InstancedBufferAttribute(array, size);
      attr.setUsage(THREE.DynamicDrawUsage);
      return { array, attr };
    };
    const m = inst(16);
    this.matrix = m.array;
    this.mesh.instanceMatrix = m.attr;
    const a = inst(3);
    this.tintA = a.array;
    g.setAttribute('iTintA', a.attr);
    const b = inst(3);
    this.tintB = b.array;
    g.setAttribute('iTintB', b.attr);
    const d = inst(4);
    this.data = d.array;
    g.setAttribute('iData', d.attr);
    const o = inst(2);
    this.more = o.array;
    g.setAttribute('iMore', o.attr);
    this.keys = new Float64Array(n);
    this.born = new Float32Array(n);
    this.lastKeys = new Float64Array(n);
    this.lastBorn = new Float32Array(n);
    this.lastCount = 0;
    this.count = 0;
  }

  /** when the point of this key appeared, if it was in the batch as last written; the clock now if it was not */
  private bornOf(key: number, hint: number): number {
    const keys = this.lastKeys;
    const n = this.lastCount;
    if (n === 0) return this.clock;
    // (the points come in much the same order from one time to the next: looked for from where it was)
    let i = hint < n ? hint : hint % n;
    for (let k = 0; k < n; k++) {
      if (keys[i] === key) return this.lastBorn[i];
      if (++i === n) i = 0;
    }
    return this.clock;
  }

  /**
   * The points that show now, the first `n` of `points`, with the height the mark aims at each (`aimY`) and
   * where one stands: the batch written anew.
   */
  show(points: readonly ForagePoint[], n: number, aimY: Float32Array, at: { readonly x: number; readonly y: number; readonly z: number }): void {
    this.here.x = at.x;
    this.here.y = at.y;
    this.here.z = at.z;
    this.write(points, n, aimY);
  }

  private write(points: readonly ForagePoint[], n: number, aimY: Float32Array): void {
    // the batch as it was, to carry over when each point appeared
    const lk = this.lastKeys;
    const lb = this.lastBorn;
    this.lastKeys = this.keys;
    this.lastBorn = this.born;
    this.keys = lk;
    this.born = lb;
    this.lastCount = this.count;
    const hx = this.here.x;
    const hz = this.here.z;
    const a = this.anchor;
    a.x = hx;
    a.y = this.here.y;
    a.z = hz;
    const glintM = (this.mark ? 1e9 : this.hintM) + GLINT_MARGIN_M;
    let c = 0;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      const plant = PLANTS[p.plant];
      const fam = plant.layer === 'ground' ? (FAMILY_INDEX[plant.model] ?? ONLY_GLINT) : ONLY_GLINT;
      const dx = p.x - hx;
      const dz = p.z - hz;
      const d2 = dx * dx + dz * dz;
      if (fam === ONLY_GLINT ? d2 > glintM * glintM : d2 > PLANT_M * PLANT_M && d2 > glintM * glintM) continue;
      if (c >= this.capacity - DYING) {
        // (more points than ever before: the buffers are made larger and this writing begun again)
        this.grow(this.capacity * 2);
        this.write(points, n, aimY);
        return;
      }
      const born = this.bornOf(p.key, c);
      this.keys[c] = p.key;
      this.born[c] = born;
      let across = LEAST_ACROSS;
      let up = LEAST_UP;
      let y = p.y;
      let lift: number;
      if (fam === ONLY_GLINT) {
        // over where the mark aims: the middle of a bush, head height on a trunk, the foot of a tree whose nuts have fallen
        y = aimY[i];
        lift = GLINT_LIFT + (plant.layer === 'tree' && !p.on ? 0.2 : 0);
      } else {
        const k = plant.crown <= SIZE_FROM ? SIZE : plant.crown >= SIZE_TO ? 1 : SIZE - ((SIZE - 1) * (plant.crown - SIZE_FROM)) / (SIZE_TO - SIZE_FROM);
        across = Math.max(LEAST_ACROSS, plant.crown * p.size * k);
        up = Math.max(LEAST_UP, plant.height * p.size * k);
        // (a plant of the water is modelled from the surface up, and the mark aims a little over the surface)
        if (FLOATS.has(plant.model)) y = aimY[i] - AIM_OVER_WATER + 0.01;
        lift = up + GLINT_LIFT;
      }
      this.put(c, dx, y - a.y, dz, p.yaw, across, up);
      const t = this.tints;
      const o = p.plant * 6;
      this.tintA[c * 3] = t[o];
      this.tintA[c * 3 + 1] = t[o + 1];
      this.tintA[c * 3 + 2] = t[o + 2];
      this.tintB[c * 3] = t[o + 3];
      this.tintB[c * 3 + 1] = t[o + 4];
      this.tintB[c * 3 + 2] = t[o + 5];
      this.data[c * 4] = fam;
      this.data[c * 4 + 1] = FORAGE_KINDS[p.kind].look.glow ? 1 : 0;
      // (the moment it appeared, on the clock the shader counts from this writing)
      this.data[c * 4 + 2] = Math.max(LONG_AGO, born - this.clock);
      this.data[c * 4 + 3] = NEVER;
      this.more[c * 2] = lift;
      this.more[c * 2 + 1] = p.vary;
      c++;
    }
    // the picked ones still shrinking, as they were (moved to the new anchor)
    for (let k = 0; k < DYING; k++) {
      const age = this.clock - this.dyingAt[k];
      if (age > SHRINK_S + 0.1) continue;
      const d = this.dying;
      const o = k * 28;
      copy(d, o, this.matrix, c * 16, 16);
      this.matrix[c * 16 + 12] = d[o + 12] + (this.dyingBase[k * 3] - a.x);
      this.matrix[c * 16 + 13] = d[o + 13] + (this.dyingBase[k * 3 + 1] - a.y);
      this.matrix[c * 16 + 14] = d[o + 14] + (this.dyingBase[k * 3 + 2] - a.z);
      copy(d, o + 16, this.tintA, c * 3, 3);
      copy(d, o + 19, this.tintB, c * 3, 3);
      copy(d, o + 22, this.data, c * 4, 4);
      this.data[c * 4 + 2] = LONG_AGO;
      this.data[c * 4 + 3] = -age;
      copy(d, o + 26, this.more, c * 2, 2);
      this.keys[c] = this.dyingKey[k];
      this.born[c] = LONG_AGO;
      c++;
    }
    this.count = c;
    this.since = 0;
    this.state.z = 0;
    this.mesh.count = c;
    this.mesh.instanceMatrix.needsUpdate = true;
    const g = this.atlas.geometry;
    g.getAttribute('iTintA').needsUpdate = true;
    g.getAttribute('iTintB').needsUpdate = true;
    g.getAttribute('iData').needsUpdate = true;
    g.getAttribute('iMore').needsUpdate = true;
  }

  /** instance c: at (x, y, z) about the anchor, turned by `yaw`, `across` wide (the model's unit) and `up` tall */
  private put(c: number, x: number, y: number, z: number, yaw: number, across: number, up: number): void {
    const m = this.matrix;
    const o = c * 16;
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    m[o] = cs * across;
    m[o + 1] = 0;
    m[o + 2] = -sn * across;
    m[o + 3] = 0;
    m[o + 4] = 0;
    m[o + 5] = up;
    m[o + 6] = 0;
    m[o + 7] = 0;
    m[o + 8] = sn * across;
    m[o + 9] = 0;
    m[o + 10] = cs * across;
    m[o + 11] = 0;
    m[o + 12] = x;
    m[o + 13] = y;
    m[o + 14] = z;
    m[o + 15] = 1;
  }

  /** a point was picked: its plant shrinks away where it stands, its glint goes at once */
  picked(point: ForagePoint): void {
    let at = -1;
    for (let i = 0; i < this.count; i++) {
      if (this.keys[i] === point.key) {
        at = i;
        break;
      }
    }
    if (at < 0) return;
    // (the moment of the pick, on the clock the shader counts from the last writing)
    this.data[at * 4 + 3] = this.since;
    this.atlas.geometry.getAttribute('iData').needsUpdate = true;
    // kept as it is, for the writings to come while it shrinks (the oldest of the dying gives way)
    let k = 0;
    for (let i = 1; i < DYING; i++) if (this.dyingAt[i] < this.dyingAt[k]) k = i;
    const d = this.dying;
    const o = k * 28;
    copy(this.matrix, at * 16, d, o, 16);
    this.dyingBase[k * 3] = this.anchor.x;
    this.dyingBase[k * 3 + 1] = this.anchor.y;
    this.dyingBase[k * 3 + 2] = this.anchor.z;
    copy(this.tintA, at * 3, d, o + 16, 3);
    copy(this.tintB, at * 3, d, o + 19, 3);
    copy(this.data, at * 4, d, o + 22, 4);
    copy(this.more, at * 2, d, o + 26, 2);
    this.dyingAt[k] = this.clock;
    this.dyingKey[k] = point.key;
  }

  /** once a frame, the floating origin final */
  update(dt: number, _ctx: GameContext, x: number, y: number, z: number, hintM: number, mark: boolean): void {
    this.clock += dt;
    this.since += dt;
    this.here.x = x;
    this.here.y = y;
    this.here.z = z;
    this.hintM = hintM;
    this.mark = mark;
    const o = this.stage.origin;
    this.mesh.position.set(this.anchor.x - o.x, this.anchor.y - o.y, this.anchor.z - o.z);
    this.eye.set(x - o.x, y + 1.2 - o.y, z - o.z);
    this.state.set(hintM, mark ? 1 : 0, this.since, 0);
  }

  clear(): void {
    this.count = 0;
    this.lastCount = 0;
    this.mesh.count = 0;
    this.dyingAt.fill(LONG_AGO);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.atlas.geometry.dispose();
    this.material.dispose();
  }

  /** what the batch costs to draw now: one call; the triangles handed to the renderer, and those of them that are drawn */
  stats(): { calls: number; instances: number; triangles: number; drawn: number } {
    let drawn = 0;
    for (let i = 0; i < this.count; i++) {
      const fam = this.data[i * 4];
      drawn += 2 + (fam >= 0 ? (this.atlas.triangles[fam] ?? 0) : 0);
    }
    return { calls: this.count > 0 ? 1 : 0, instances: this.count, triangles: this.count * this.atlas.total, drawn };
  }
}
