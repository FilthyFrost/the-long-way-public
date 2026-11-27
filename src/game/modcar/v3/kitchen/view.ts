/**
 * What is drawn of the kitchen over the things' own models (docs/V3/plan/cooking.md §4, §5): the canister in the
 * stove's bay and the vessel on its burner, what is in a vessel (each portion as it went in — whole, or in its
 * prepared shape — browning as it cooks, a soup's surface in a pot), what lies on the board, the flame, the ring of
 * doneness round a vessel's rim, a burst when a dish comes out; the things' own moving pieces set to what they are
 * doing (the bay's cover, the lever, the knob, a lid lifted while one looks in, the knife at work); and the ghosts of
 * the thing in the hands wherever it can go.
 *
 * Each thing's additions are a group of their own under the loose things' root that copies the thing's place every
 * frame (the things lying still are merged into a mesh per material: loose.ts). They are painted as the things
 * themselves are (the loose things' looks); a vessel's contents are merged into a mesh per material, so a pan of five
 * things is a handful of draw calls. Only the flame, the ring and the burst are lights of their own: held at what
 * they look like on screen whatever the eye's exposure.
 */
import * as THREE from 'three';
import { itemDef, itemPaint, newItem } from '../../../../core/modcar/items';
import { WAYS, type Way } from '../../../../core/v3/kitchen/dishes';
import { GAS, WAY_OF, type Portion } from '../../../../core/v3/kitchen/items';
import { asksStir, bandsOf, electric, fireOf, gasOf, GAS_LOW, hasCanister, kitOf, phaseOf, potOf, underOf, vesselOf } from '../../../../core/v3/kitchen/kit';
import { FOOD_LOOK } from '../../../../core/v3/kitchen/looks';
import { FOOD } from '../../../../core/v3/kitchen/pantry';
import { applyGhost } from '../../../render/carMaterials';
import { globals } from '../../../render/shaderlib';
import { MergedCar } from '../../../render/carMerge';
import { cloneModel, itemGlb } from '../../assets';
import type { GameContext } from '../../kernel/context';
import { applyMaterials, type CarMaterials, type LookOf } from '../../materials';
import { KitDevice, STEAMER_LIFT, type GhostAt, type Kitchen, type Unit } from './system';
import { addLight, Glow, spot, Vapour } from './vapour';

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
/** towards a target, quicker the further off */
const approach = (v: number, to: number, dt: number, k: number): number => to + (v - to) * Math.exp(-dt * k);

/** food's gloss (core/v3/kitchen/items.ts gives the ingredients the same) */
const FOOD_GLOSS = 0.22;
/** how a vessel stands on the burner: turned about its upright so that a handle or a spout points to the cook's left */
const ON_STOVE_YAW: Readonly<Record<string, number>> = { kit_pan: -0.6, kit_kettle: 2.35 };
/** where the kettle's spout ends, in its own frame (cookware.py kit_kettle): its steam comes out there */
const SPOUT = new THREE.Vector3(-0.147, 0.108, 0);
/** the room each vessel has for what is in it: generous pan/pot cell budgets so remodeled ingredients & beef slices never shrink to tiny dots (#29) */
const ROOM: Readonly<Record<Way, { r: number; cell: number; lift: number; liquid: number; liquidR: number }>> = {
  fry: { r: 0.068, cell: 0.145, lift: 0.0, liquid: 0, liquidR: 0 },
  boil: { r: 0.056, cell: 0.12, lift: 0.052, liquid: 0.072, liquidR: 0.108 },
  mix: { r: 0.062, cell: 0.13, lift: 0.005, liquid: 0, liquidR: 0 },
  grill: { r: 0.078, cell: 0.155, lift: 0.0, liquid: 0, liquidR: 0 },
  steam: { r: 0.058, cell: 0.125, lift: 0.0, liquid: 0, liquidR: 0 },
  bake: { r: 0.062, cell: 0.135, lift: 0.0, liquid: 0, liquidR: 0 },
  brew: { r: 0, cell: 0, lift: 0, liquid: 0, liquidR: 0 },
};
/** the stove's knob against its model (4 cm across there), and its ring's colours: the flame off, low, high */
const KNOB_SCALE = 1.6;
const KNOB_OFF = 0x4a4f56;
const KNOB_LOW = 0xf2b84a;
const KNOB_HIGH = 0xff4a22;

/** the doneness the ring runs to */
const RING_MAX = 1.8;

// ------------------------------------------------------------------ colours

const cA = new THREE.Color();
const cB = new THREE.Color();
function mix(a: number, b: number, t: number): number {
  cA.setHex(a);
  cB.setHex(b);
  return cA.lerp(cB, clamp01(t)).getHex();
}

/**
 * An ingredient's colour as far along as the pot is: meat and fish go from raw to done (browned in a pan, pale in a
 * pot), everything else takes a little colour over a dry heat; past "a little over" it all goes to char.
 */
function cooked(hex: number, id: string, way: Way, done: number, over: number, burnt: number): number {
  const f = FOOD[id];
  const dry = way === 'fry' || way === 'grill' || way === 'bake';
  const t = clamp01(done);
  let c = hex;
  if (WAYS[way].heats) {
    const flesh = f ? f.group === 'meat' || f.tags.includes('fish') : false;
    if (flesh) c = mix(c, dry ? 0x8a4a22 : 0xb08868, 0.7 * t);
    else if (f?.tags.includes('shell')) c = mix(c, 0xe8502a, 0.55 * t);
    else if (f?.group === 'egg') c = mix(c, 0xf6c838, 0.25 * t);
    else c = mix(c, dry ? 0x9a7436 : 0xd8c890, (dry ? 0.24 : 0.1) * t);
    if (done > over) c = mix(c, 0x1c1814, 0.9 * clamp01((done - over) / Math.max(0.05, burnt - over)));
  }
  return c;
}

// ------------------------------------------------------------------ a model in its colours

/** an item's model painted two colours, there as soon as its file is in */
class Model {
  readonly obj = new THREE.Group();
  ready = false;
  private gone = false;

  constructor(
    private readonly mats: CarMaterials,
    readonly owner: string,
    readonly model: string,
    look: LookOf,
    then?: (m: Model) => void,
  ) {
    const l = mats.look(owner, look);
    void itemGlb(model).then((m) => {
      if (this.gone || !m) return;
      const real = cloneModel(m);
      applyMaterials(real, l);
      this.obj.add(real);
      this.ready = true;
      then?.(this);
    });
  }

  node(name: string): THREE.Object3D | null {
    return this.obj.getObjectByName(name) ?? null;
  }

  frame(): void {
    this.mats.setFrameOf(this.owner, this.obj.matrixWorld);
  }

  dispose(): void {
    this.gone = true;
    this.obj.removeFromParent();
    this.mats.drop(this.owner);
  }
}

// ------------------------------------------------------------------ what is in a vessel

/** how far a lid reaches from its middle (its own frame) */
function lidRadius(lid: THREE.Object3D): number {
  let r = 0.02;
  lid.traverse((o) => {
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (!g) return;
    if (!g.boundingBox) g.computeBoundingBox();
    if (g.boundingBox) r = Math.max(r, g.boundingBox.max.x, -g.boundingBox.min.x);
  });
  return r;
}

/** where the k-th of n portions lies about the middle of a vessel */
function slotOf(k: number, n: number, r: number, out: THREE.Vector3): THREE.Vector3 {
  if (n <= 1) return out.set(0, 0, 0);
  if (n === 2) return out.set((k === 0 ? -1 : 1) * r * 0.62, 0, 0);
  if (n === 5 && k === 4) return out.set(0, 0, 0);
  const m = n === 5 ? 4 : n;
  const a = (Math.PI * 2 * k) / m + (m === 4 ? Math.PI / 4 : Math.PI / 2);
  return out.set(Math.cos(a) * r, 0, Math.sin(a) * r);
}

/** the model and the two colours of a portion as it lies in a pot or on a board */
function portionLook(p: Portion): { model: string; paint: number; paint2: number } {
  const look = FOOD_LOOK[p.id];
  if (!look) {
    const d = itemDef(p.id);
    return { model: d.model, paint: d.paint, paint2: d.paint2 };
  }
  // cut, or never cut at all (poured, cracked): its prepared shape; whole otherwise (a shrimp has none: it is itself)
  if (look.prep && (p.cut || !look.chop)) return { model: `prep_${look.prep}`, paint: look.flesh, paint2: look.skin };
  return { model: `food_${p.id}`, paint: look.paint, paint2: look.paint2 };
}

const liquidGeo = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
const liquidMat = new THREE.MeshStandardMaterial();
liquidMat.name = 'paint';

class Contents {
  readonly group = new THREE.Group();
  private key = '';
  private merged: MergedCar | null = null;
  private sources: THREE.Group | null = null;
  private building = '';
  private readonly v = new THREE.Vector3();
  private readonly box = new THREE.Box3();
  private readonly size = new THREE.Vector3();

  constructor(
    private readonly mats: CarMaterials,
    private readonly owner: string,
  ) {
    this.group.name = 'kitchen:contents';
  }

  /** bring it up to what the vessel holds now (made again only when that, or its colour, has changed) */
  set(way: Way | null, items: readonly Portion[] | null, done: number, bands: readonly number[]): void {
    const room = way ? ROOM[way] : null;
    if (!way || !room || !items || !items.length || room.cell === 0) {
      if (this.key) this.clear();
      return;
    }
    // (its colour moves a step at a time: a merge is made again some dozen times over a pot's cooking)
    const bucket = WAYS[way].heats ? Math.floor(Math.min(done, RING_MAX) / 0.1) : 0;
    let key = `${way}|${bucket}`;
    for (const p of items) key += `|${p.id}${p.cut ? '*' : ''}`;
    if (key === this.key || key === this.building) return;
    this.building = key;
    const looks = items.map(portionLook);
    void Promise.all(looks.map((l) => itemGlb(l.model))).then((models) => {
      if (this.building !== key) return;
      this.building = '';
      this.clear();
      this.key = key;
      const src = new THREE.Group();
      this.group.add(src);
      const entries: { id: number; object: THREE.Object3D; look: { paint: number; paint2: number } }[] = [];
      const shade = bucket * 0.1 + 0.05;
      let sum = 0;
      let liquid = 0xd9c9a0;
      for (let k = 0; k < items.length; k++) {
        const m = models[k];
        if (!m) continue;
        const o = cloneModel(m);
        m.box.getSize(this.size);
        const s = Math.min(1, room.cell / Math.max(0.01, this.size.x, this.size.z), (room.cell * 0.9) / Math.max(0.01, this.size.y));
        o.scale.setScalar(s);
        slotOf(k, items.length, room.r, this.v);
        o.position.set(this.v.x, room.lift, this.v.z);
        o.rotation.y = k * 2.1 + 0.4;
        src.add(o);
        const paint = cooked(looks[k].paint, items[k].id, way, shade, bands[2], bands[3]);
        const paint2 = cooked(looks[k].paint2, items[k].id, way, shade, bands[2], bands[3]);
        entries.push({ id: k + 1, object: o, look: { paint, paint2 } });
        liquid = mix(liquid, paint, 1 / (++sum + 1.5));
      }
      if (room.liquid > 0) {
        const disc = new THREE.Mesh(liquidGeo, liquidMat);
        disc.scale.setScalar(room.liquidR);
        disc.position.y = room.liquid;
        src.add(disc);
        entries.push({ id: items.length + 1, object: disc, look: { paint: cooked(liquid, '', way, shade * 0.4, bands[2], bands[3]), paint2: liquid } });
      }
      if (!entries.length) return;
      this.group.updateMatrixWorld(true);
      const merged = new MergedCar(this.group, entries, () => false);
      this.group.add(merged.group);
      applyMaterials(merged.group, this.mats.look(this.owner, { paint: 0xffffff, paint2: 0xffffff, matte: FOOD_GLOSS }), true);
      this.merged = merged;
      this.sources = src;
      src.visible = false;
    });
  }

  frame(): void {
    if (this.merged) this.mats.setFrameOf(this.owner, this.group.matrixWorld);
  }

  private clear(): void {
    this.key = '';
    if (this.merged) {
      this.merged.group.removeFromParent();
      this.merged.dispose();
      this.merged = null;
    }
    this.sources?.removeFromParent();
    this.sources = null;
  }

  dispose(): void {
    this.building = '';
    this.clear();
    this.group.removeFromParent();
    this.mats.drop(this.owner);
  }
}

// ------------------------------------------------------------------ lights of their own

/** the ring of doneness round a vessel's rim: raw, nearly, just right, over, burnt, and where the pot is */
class Ring {
  readonly mesh: THREE.Mesh;
  private readonly u = {
    uDone: { value: 0 },
    uBands: { value: new THREE.Vector4(0.6, 0.85, 1.15, 1.4) },
    uGain: { value: 1 },
    uAsk: { value: 0 },
    uTime: { value: 0 },
  };

  constructor() {
    // (half as thick again as it was: read at a glance from where one stands — docs/V3/plan/finish.md §八 6)
    const g = new THREE.RingGeometry(0.82, 1, 48, 1).rotateX(-Math.PI / 2);
    const m = new THREE.ShaderMaterial({
      uniforms: this.u,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        varying vec3 vP;
        uniform float uDone; uniform vec4 uBands; uniform float uGain; uniform float uAsk; uniform float uTime;
        void main() {
          // round from the back, by the cook's left, to the back again
          float f = fract(atan(vP.z, -vP.x) / 6.2831853 + 1.0);
          float d = f * ${RING_MAX.toFixed(2)};
          vec3 c = d < uBands.x ? vec3(0.72, 0.78, 0.84) : d < uBands.y ? vec3(1.0, 0.82, 0.25) : d < uBands.z ? vec3(0.3, 0.92, 0.42) : d < uBands.w ? vec3(1.0, 0.5, 0.15) : vec3(0.85, 0.14, 0.1);
          float past = step(d, uDone);
          float a = mix(0.42, 1.0, past);
          c *= mix(0.42, 1.15, past);
          // where the pot is: a bright tick; blinking when it asks to be stirred
          float tick = smoothstep(0.035, 0.012, abs(d - uDone));
          float blink = 0.5 + 0.5 * sin(uTime * 9.0);
          c = mix(c, vec3(1.0), tick * mix(1.0, blink, uAsk));
          a = max(a, tick);
          c += vec3(1.0, 0.9, 0.5) * uAsk * blink * 0.35;
          gl_FragColor = vec4(c * uGain, a);
        }`,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.name = 'kitchen:ring';
    this.mesh.renderOrder = 12;
    this.mesh.visible = false;
  }

  set(done: number, bands: readonly number[], ask: boolean, gain: number, t: number): void {
    this.u.uDone.value = Math.min(done, RING_MAX);
    this.u.uBands.value.set(bands[0], bands[1], bands[2], bands[3]);
    this.u.uAsk.value = ask ? 1 : 0;
    this.u.uGain.value = gain;
    this.u.uTime.value = t;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** a ring of little blue flames under the vessel */
class Flame {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.MeshBasicMaterial;
  private level = 0;
  /** the flicker of the moment (the glow follows it) */
  flick = 1;

  constructor() {
    const n = 14;
    const pos: number[] = [];
    const col: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const r0 = 0.024;
      // a tongue: two points at the ports, its tip out and up (under a pan the flame spreads along its bottom)
      const bx = ca * r0;
      const bz = sa * r0;
      const w = 0.0075;
      pos.push(bx - sa * w, 0, bz + ca * w, bx + sa * w, 0, bz - ca * w, ca * 0.07, 0.026, sa * 0.07);
      col.push(0.55, 0.9, 1.0, 0.55, 0.9, 1.0, 0.1, 0.22, 0.95);
      // and its bright inner cone
      const w2 = 0.004;
      pos.push(bx - sa * w2, 0.001, bz + ca * w2, bx + sa * w2, 0.001, bz - ca * w2, ca * 0.036, 0.012, sa * 0.036);
      col.push(0.85, 0.97, 1.0, 0.85, 0.97, 1.0, 0.35, 0.65, 1.0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.mat = addLight(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false }));
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.name = 'kitchen:flame';
    this.mesh.renderOrder = 11;
    this.mesh.visible = false;
  }

  /** how far it burns now (0 out … 1 high), easing to the knob */
  get lit(): number {
    return this.level;
  }

  /** covered: a vessel on the burner (the tongues spread under it; with nothing there they stand up, narrower) */
  set(fire: number, low: boolean, gain: number, t: number, dt: number, covered: boolean): void {
    this.level = approach(this.level, fire === 2 ? 1 : fire === 1 ? 0.55 : 0, dt, 9);
    this.mesh.visible = this.level > 0.03;
    this.flick = 0.86 + 0.14 * Math.sin(t * 31) * Math.sin(t * 17.3 + 1.3) + (low ? 0.3 * Math.sin(t * 6.1) * Math.sin(t * 2.7) : 0);
    if (!this.mesh.visible) return;
    const xz = (covered ? 1 : 0.62) * (0.75 + 0.25 * this.level);
    this.mesh.scale.set(xz, this.level * Math.max(0.3, this.flick) * (covered ? 1 : 2.1), xz);
    this.mesh.rotation.y = t * 0.7;
    // (a canister nearly empty burns yellow)
    this.mat.color.setRGB(gain * (low ? 1.6 : 1.15), gain * (low ? 1.1 : 1.15), gain * (low ? 0.5 : 1.15));
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/** a hob's plate heating: its three rings glowing red, slow to come and slow to go (the flame's shape for the view) */
class Coil {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.MeshBasicMaterial;
  private level = 0;
  /** (steady: no flicker) */
  readonly flick = 1;

  constructor() {
    const pos: number[] = [];
    const idx: number[] = [];
    const seg = 40;
    for (const [r0, r1] of [
      [0.019, 0.031],
      [0.039, 0.051],
      [0.059, 0.071],
    ]) {
      const b = pos.length / 3;
      for (let i = 0; i <= seg; i++) {
        const a = (Math.PI * 2 * i) / seg;
        pos.push(Math.cos(a) * r0, 0, Math.sin(a) * r0, Math.cos(a) * r1, 0, Math.sin(a) * r1);
      }
      for (let i = 0; i < seg; i++) {
        const k = b + i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    this.mat = addLight(new THREE.MeshBasicMaterial({ color: 0xff4a12, side: THREE.DoubleSide, toneMapped: false, transparent: true, depthWrite: false }));
    this.mat.polygonOffset = true;
    this.mat.polygonOffsetFactor = -2;
    this.mat.polygonOffsetUnits = -2;
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.name = 'kitchen:coil';
    this.mesh.renderOrder = 11;
    this.mesh.visible = false;
  }

  /** how hot it is now (0 cold … 1 high) */
  get lit(): number {
    return this.level;
  }

  set(fire: number, _low: boolean, gain: number, _t: number, dt: number): void {
    const want = fire === 2 ? 1 : fire === 1 ? 0.6 : 0;
    // (an element heats in a few seconds and cools slower)
    this.level = approach(this.level, want, dt, want > this.level ? 0.9 : 0.45);
    this.mesh.visible = this.level > 0.03;
    if (!this.mesh.visible) return;
    this.mat.opacity = Math.min(1, this.level * 1.4);
    this.mat.color.setRGB(1.6 * gain * this.level, 0.32 * gain * this.level * this.level, 0.06 * gain * this.level);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/** a burst of sparks when a dish comes out: gold for a perfect one, pale for the rest, grey for a failure */
class Burst {
  readonly points: THREE.Points;
  private readonly mat: THREE.PointsMaterial;
  private t = -1;
  private readonly dirs: number[] = [];

  constructor() {
    const n = 30;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + 0.4 * (((i * 5) % 7) / 7);
      const r = 0.7 + 0.3 * (((i * 3) % 4) / 3);
      this.dirs.push(Math.cos(a) * r, 0.6 + 0.6 * ((i * 7) % 5) * 0.2, Math.sin(a) * r);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // (round, soft-edged sparks: a point is a square without its spot)
    this.mat = addLight(new THREE.PointsMaterial({ size: 0.02, sizeAttenuation: true, toneMapped: false, map: spot(), alphaTest: 0.01 }));
    this.points = new THREE.Points(g, this.mat);
    this.points.name = 'kitchen:burst';
    this.points.frustumCulled = false;
    this.points.renderOrder = 13;
    this.points.visible = false;
  }

  fire(kind: 'perfect' | 'good' | 'fail'): void {
    this.t = 0;
    this.mat.color.setHex(kind === 'perfect' ? 0xffd04a : kind === 'good' ? 0xfff4d8 : 0x8a8a8a);
    this.mat.size = kind === 'perfect' ? 0.07 : kind === 'good' ? 0.05 : 0.04;
  }

  update(dt: number, gain: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const life = 1.1;
    if (this.t > life) {
      this.t = -1;
      this.points.visible = false;
      return;
    }
    this.points.visible = true;
    const k = this.t / life;
    const a = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const reach = 0.24 * (1 - (1 - k) * (1 - k));
    for (let i = 0; i < a.count; i++) a.setXYZ(i, this.dirs[i * 3] * reach, 0.05 + this.dirs[i * 3 + 1] * 0.3 * k - 0.16 * k * k, this.dirs[i * 3 + 2] * reach);
    a.needsUpdate = true;
    this.mat.opacity = (1 - k) * Math.min(1, gain);
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}

// ------------------------------------------------------------------ one thing's additions

class UnitView {
  readonly group = new THREE.Group();
  /** the thing's own model as it was last looked into (its moving pieces found again when it is another) */
  private own: THREE.Object3D | null = null;
  private cover: THREE.Object3D | null = null;
  private lever: THREE.Object3D | null = null;
  private knob: THREE.Object3D | null = null;
  private knobRing: THREE.Mesh | null = null;
  private ownLid: THREE.Object3D | null = null;
  private knife: THREE.Object3D | null = null;
  private readonly knifeRest = new THREE.Vector3();
  private readonly lidRest = new THREE.Vector3();
  private lidR = 0.1;
  private vesselLidR = 0.1;
  private readonly mPot = new THREE.Vector3(0, 0.119, 0.068);
  private readonly mFlame = new THREE.Vector3(0, 0.12, 0.068);
  private readonly mCan = new THREE.Vector3(-0.012, 0.056, -0.122);
  private readonly mFood = new THREE.Vector3(0, 0.01, 0);
  // what is added
  private can: Model | null = null;
  private vessel: Model | null = null;
  private vesselKind = '';
  /** the pot of water under the steamer, its lid off */
  private base: Model | null = null;
  private baseKind = '';
  private vesselLid: THREE.Object3D | null = null;
  private readonly vesselLidRest = new THREE.Vector3();
  /** the vessel's own frame: on a stove, on the burner and turned; a vessel by itself, the thing's */
  private readonly holder = new THREE.Group();
  private readonly contents: Contents;
  private ring: Ring | null = null;
  private flame: Flame | Coil | null = null;
  private glow: Glow | null = null;
  private burst: Burst | null = null;
  private vapour: Vapour | null = null;
  /** the vapour now: how much, how sooty, how much of it steam (kept as it dies down off the flame) */
  private vapAmt = 0;
  private vapDark = 0;
  private vapSteam = 1;
  private boardFood: Model | null = null;
  private boardKey = '';
  // movements
  private swapT = -1;
  private swapOld = false;
  private swapPut = false;
  private leverUp = 0;
  private knobA = 0;
  private lidUp = 0;
  private touchT = 9;
  private stirT = 9;
  private addT = 9;
  private chopT = 9;
  private knifeAt = 0;
  private seen = { chopped: 0, stirred: 0, added: 0 };
  private said = 0;

  constructor(
    private readonly view: KitchenView,
    readonly unit: Unit,
  ) {
    this.group.name = `kitchen:${unit.key}`;
    this.group.add(this.holder);
    this.contents = new Contents(view.mats, `kitchen:${unit.key}:pot`);
    this.holder.add(this.contents.group);
    this.seen.chopped = unit.chopped;
    this.seen.stirred = unit.stirred;
    this.seen.added = unit.added;
  }

  /** the thing's own model looked into: its moving pieces and its places (again when the model is another) */
  private resolve(): void {
    const obj = this.unit.loose.obj;
    const own = obj.children[0] ?? null;
    if (own === this.own) return;
    this.own = own;
    // (a two-burner stove's second burner: its own pieces and places, named with _B — tools/blender/items/cookware.py;
    // not _1, which a loaded mesh of several materials calls its first piece)
    const sx = this.unit.burner > 0 ? '_B' : '';
    this.cover = obj.getObjectByName(`COVER${sx}`) ?? null;
    this.lever = obj.getObjectByName(`LEVER${sx}`) ?? null;
    this.knob = obj.getObjectByName(`KNOB_fire${sx}`) ?? null;
    // (the knob bigger than it is modelled, 4 cm to some 6.5 — docs/V3/plan/finish.md §八 6 — and a ring round it
    // that says how high the flame is: dark off, amber low, red high)
    if (this.knob) {
      this.knob.scale.setScalar(KNOB_SCALE);
      this.knobRing?.removeFromParent();
      const box = new THREE.Box3().setFromObject(this.knob);
      const size = box.getSize(new THREE.Vector3());
      // (in the stove's own frame the knob's axis is x, its face to the front: the ring round it in y–z)
      const r = (Math.max(size.y, size.z) / 2) * 1.12;
      this.knobRing = new THREE.Mesh(new THREE.TorusGeometry(Math.max(0.02, r), 0.0045, 8, 28).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: KNOB_OFF, toneMapped: false }));
      this.knobRing.name = 'kitchen:knob-ring';
      this.knobRing.position.copy(this.knob.position);
      this.knobRing.position.x += 0.004;
      this.knob.parent?.add(this.knobRing);
    }
    this.ownLid = obj.getObjectByName('LID') ?? null;
    this.knife = obj.getObjectByName('P_knife') ?? null;
    if (this.ownLid) {
      this.lidRest.copy(this.ownLid.position);
      this.lidR = lidRadius(this.ownLid);
    }
    if (this.knife) this.knifeRest.copy(this.knife.position);
    const at = (name: string, into: THREE.Vector3): void => {
      const n = obj.getObjectByName(name);
      if (n) into.copy(n.position);
    };
    at(`M_pot${sx}`, this.mPot);
    at(`M_flame${sx}`, this.mFlame);
    at(`M_can${sx}`, this.mCan);
    at('M_food', this.mFood);
  }

  update(dt: number, t: number, gain: number, marked: boolean, ghosted: boolean): void {
    const u = this.unit;
    const l = u.loose;
    const it = u.item;
    const mats = this.view.mats;
    this.group.position.copy(l.obj.position);
    this.group.quaternion.copy(l.obj.quaternion);
    this.group.visible = !l.shut;
    this.resolve();
    // what just happened
    if (u.chopped !== this.seen.chopped) {
      this.seen.chopped = u.chopped;
      this.chopT = 0;
    }
    if (u.stirred !== this.seen.stirred) {
      this.seen.stirred = u.stirred;
      this.stirT = 0;
      this.touchT = 0;
    }
    if (u.added !== this.seen.added) {
      this.seen.added = u.added;
      this.addT = 0;
      this.touchT = 0;
    }
    this.touchT += dt;
    this.stirT += dt;
    this.addT += dt;
    this.chopT += dt;

    if (u.kind === 'stove') this.stove(dt, t, gain);
    if (u.kind === 'board') this.board(dt);

    // the vessel: a stove's is a model set on its burner; a vessel by itself is the thing
    const v = vesselOf(it);
    let lid: THREE.Object3D | null = null;
    let lidRest = this.lidRest;
    let lidR = this.lidR;
    if (u.kind === 'stove') {
      if (v !== this.vesselKind) {
        this.vessel?.dispose();
        this.vessel = null;
        this.vesselLid = null;
        this.vesselKind = v ?? '';
        if (v) {
          const p = itemPaint(newItem(v));
          this.vessel = new Model(mats, `kitchen:${l.uid}:vessel`, itemDef(v).model, p, (m) => {
            this.vesselLid = m.node('LID');
            if (this.vesselLid) {
              this.vesselLidRest.copy(this.vesselLid.position);
              this.vesselLidR = lidRadius(this.vesselLid);
            }
            const f = m.node('M_food');
            if (f) this.contents.group.position.copy(f.position);
          });
          this.holder.add(this.vessel.obj);
        }
      }
      // (the steamer on the pot of water it stands on)
      const under = underOf(it) ?? '';
      if (under !== this.baseKind) {
        this.base?.dispose();
        this.base = null;
        this.baseKind = under;
        if (under) {
          this.base = new Model(mats, `kitchen:${l.uid}:base`, itemDef(under).model, itemPaint(newItem(under)), (m) => {
            const lid = m.node('LID');
            if (lid) lid.visible = false;
          });
          this.group.add(this.base.obj);
        }
      }
      if (this.base) {
        this.base.obj.position.copy(this.mPot);
        this.base.frame();
      }
      this.holder.position.copy(this.mPot);
      if (under) this.holder.position.y += STEAMER_LIFT;
      // (turned as it was set down there held out — nd-place's slot — else as the button sets it on)
      this.holder.rotation.y = v ? (kitOf(it).onYaw ?? ON_STOVE_YAW[v] ?? 0) : 0;
      lid = this.vesselLid;
      lidRest = this.vesselLidRest;
      lidR = this.vesselLidR;
      this.vessel?.frame();
    } else if (u.kind === 'vessel') {
      this.contents.group.position.copy(this.mFood);
      lid = this.ownLid;
    }
    if (u.kind === 'stove' || u.kind === 'vessel') {
      const way = v ? WAY_OF[v] : null;
      const pot = potOf(it);
      const bands = bandsOf(it);
      const done = pot?.done ?? 0;
      this.contents.set(way, pot?.items ?? null, done, bands);
      this.contents.frame();
      // a toss, a stir, something dropped in: what is in the vessel jumps
      const jump = this.stirT < 0.45 ? Math.sin((this.stirT / 0.45) * Math.PI) : 0;
      const drop = this.addT < 0.3 ? Math.sin((this.addT / 0.3) * Math.PI) : 0;
      const g = this.contents.group;
      g.rotation.y = 0.9 * jump;
      g.scale.setScalar(1 + 0.06 * drop);
      const baseY = u.kind === 'stove' ? (this.vessel?.node('M_food')?.position.y ?? 0.008) : this.mFood.y;
      g.position.y = baseY + 0.03 * jump + 0.012 * drop;
      // the lid lifted while one looks in, or puts something in
      // (the camp oven keeps its lid on while it bakes: only putting something in or a touch lifts it)
      const open = !!lid && !!way && ((way !== 'bake' && marked) || ghosted || this.touchT < 1.4);
      this.lidUp = approach(this.lidUp, open ? 1 : 0, dt, 9);
      if (lid) {
        // (tipped up on the rim's far side, as a hand would hold it: its far edge stays where it was)
        const a = 1.05 * this.lidUp;
        lid.position.set(lidRest.x - lidR * (1 - Math.cos(a)), lidRest.y + lidR * Math.sin(a), lidRest.z);
        lid.rotation.z = a;
      }
      // the ring of doneness
      const heats = !!way && WAYS[way].heats;
      const show = heats && !!pot && pot.items.length > 0 && !pot.out && (done > 0 || (u.kind === 'stove' && fireOf(it) > 0));
      if (show && !this.ring) {
        this.ring = new Ring();
        this.holder.add(this.ring.mesh);
      }
      if (this.ring) {
        this.ring.mesh.visible = show;
        if (show && v) {
          const R = v === 'kit_pan' ? 0.158 : v === 'kit_grill' ? 0.19 : v === 'kit_kettle' ? 0.12 : 0.152;
          this.ring.mesh.scale.setScalar(R);
          this.ring.mesh.position.y = v === 'kit_pan' ? 0.05 : v === 'kit_grill' ? 0.03 : 0.11;
          this.ring.set(done, bands, asksStir(it), gain, t);
        }
      }
      // steam off a pot of water; a frying pan's haze, greying as it goes over, black when it burns; dying down off the flame
      const lit = u.kind === 'stove' && fireOf(it) > 0;
      let want = 0;
      if (heats && pot && pot.items.length > 0 && !pot.out) {
        const ph = phaseOf(it);
        if (way === 'fry' || way === 'grill') {
          if (lit) {
            want = ph === 'raw' ? 0.12 : ph === 'cooking' ? 0.3 : ph === 'right' ? 0.42 : ph === 'over' ? 0.72 : 1;
            this.vapSteam = 0.3;
            this.vapDark = ph === 'over' ? 0.4 : ph === 'burnt' ? 1 : 0;
          }
        } else if (lit) {
          want = 0.15 + 0.85 * clamp01((done - 0.12) / 0.5);
          this.vapSteam = 1;
          this.vapDark = 0;
        }
      }
      // (the camp oven's steam comes out as its lid lifts)
      if (way === 'bake') want *= 0.2 + 0.8 * this.lidUp;
      // (the oil's haze is gone in a moment; hot water steams on a while)
      const water = way !== 'fry' && way !== 'grill';
      this.vapAmt = !v ? 0 : want > this.vapAmt ? Math.min(want, this.vapAmt + dt * 1.2) : Math.max(want, this.vapAmt - dt * (water ? 0.06 : 0.5));
      if (this.vapAmt > 0.02 && !this.vapour) {
        this.vapour = new Vapour();
        this.holder.add(this.vapour.mesh);
      }
      if (this.vapour) {
        // (out of the kettle's spout; off the rest where the food is)
        const c = way === 'brew' ? SPOUT : this.contents.group.position;
        this.vapour.mesh.position.set(c.x, c.y + (way === 'brew' ? 0.01 : 0.035), c.z);
        this.vapour.set(this.vapAmt, this.vapDark, this.vapSteam, l.riding ? 0 : 1);
      }
      // a dish came out
      if (u.served) {
        if (!this.burst) {
          this.burst = new Burst();
          this.holder.add(this.burst.points);
        }
        this.burst.fire(u.served.fail ? 'fail' : u.served.perfect ? 'perfect' : 'good');
        u.served = null;
        this.touchT = 0;
      }
      this.burst?.update(dt, gain);
    }
  }

  private stove(dt: number, t: number, gain: number): void {
    const u = this.unit;
    const it = u.item;
    const mats = this.view.mats;
    const has = hasCanister(it);
    // the canister changed: the cover up, the lever up, the old one out, the new one in, the lever down, the cover shut
    if (u.swap) {
      this.swapT = 0;
      this.swapOld = u.swap.old;
      this.swapPut = u.swap.put;
      this.said = 0;
      u.swap = null;
    }
    let cover = 0;
    let lever = has ? 0 : 1;
    let show = has;
    let out = 0;
    if (this.swapT >= 0) {
      const s = this.swapT;
      this.swapT += dt;
      // (each sound once, as the movement reaches it)
      const cue = (bit: number, at: number, name: string, gain = 1): void => {
        if (s < at || this.said & bit) return;
        this.said |= bit;
        this.view.ctx.sound(name, gain);
      };
      cue(1, 0, 'stove_cover_open');
      let a = 0.5;
      cover = ease(s / 0.3);
      lever = ease((s - 0.3) / 0.2);
      cue(2, 0.3, 'lever', 0.5);
      show = false;
      if (this.swapOld) {
        cue(4, a, 'canister_out');
        if (s < a + 0.45) {
          show = true;
          out = ease((s - a) / 0.45);
        }
        a += 0.45;
      }
      if (this.swapPut) {
        // (slid in over the last half of the push: seated as it ends)
        cue(8, a + 0.25, 'canister_in');
        if (s >= a) {
          show = true;
          out = 1 - ease((s - a) / 0.5);
        }
        a += 0.5;
        lever = Math.min(lever, 1 - ease((s - a) / 0.2));
        cue(16, a, 'latch', 0.8);
        a += 0.2;
      }
      cover = Math.min(cover, 1 - ease((s - a) / 0.3));
      if (s >= a + 0.3) {
        cue(32, a + 0.3, 'stove_cover_close');
        this.swapT = -1;
      }
    }
    this.leverUp = approach(this.leverUp, lever, dt, 22);
    if (this.cover) this.cover.rotation.z = cover * 1.75;
    if (this.lever) this.lever.rotation.z = -0.35 + 1.1 * this.leverUp;
    const fire = fireOf(it);
    this.knobA = approach(this.knobA, fire === 2 ? -2.0 : fire === 1 ? -1.0 : 0, dt, 14);
    if (this.knob) this.knob.rotation.x = this.knobA;
    if (this.knobRing) (this.knobRing.material as THREE.MeshBasicMaterial).color.setHex(fire === 2 ? KNOB_HIGH : fire === 1 ? KNOB_LOW : KNOB_OFF);
    // the canister lying in the bay, its valve to the front
    if (show && !this.can) {
      this.can = new Model(mats, `kitchen:${u.key}:can`, itemDef(GAS).model, itemPaint(newItem(GAS)));
      this.group.add(this.can.obj);
    }
    if (this.can) {
      this.can.obj.visible = show;
      if (show) {
        this.can.obj.position.set(this.mCan.x - 0.095 - 0.02 * out, this.mCan.y + 0.15 * out, this.mCan.z);
        this.can.obj.rotation.z = -Math.PI / 2 + 0.6 * out;
        this.can.frame();
      }
    }
    // the flame
    const hob = electric(it);
    if (fire && !this.flame) {
      this.flame = hob ? new Coil() : new Flame();
      this.group.add(this.flame.mesh);
    }
    if (this.flame) {
      // (a hob's plate glows on its rings, a hair over it; a hob is never low on gas: its light the warm one)
      const low = hob || gasOf(it) < GAS_LOW;
      this.flame.mesh.position.set(this.mFlame.x, this.mFlame.y - (hob ? 0 : 0.03), this.mFlame.z);
      this.flame.set(fire, low, gain, t, dt, !!vesselOf(it));
      // its light: a halo round the burner, a pool on what the stove stands on (stronger as night falls)
      if (!this.glow) {
        this.glow = new Glow();
        this.group.add(this.glow.halo, this.glow.pool);
      }
      this.glow.halo.position.set(this.mFlame.x, this.mFlame.y - 0.005, this.mFlame.z);
      this.glow.halo.scale.setScalar(0.4);
      // (the pool on what the stove stands on, round the burner)
      this.glow.pool.position.set(this.mFlame.x, 0.003, this.mFlame.z);
      this.glow.pool.scale.setScalar(1.1);
      this.glow.set(this.flame.lit * (hob ? 0.45 : 1), globals.uWeather.value.w, this.view.exposure, low, this.flame.flick);
    }
  }

  private board(dt: number): void {
    const u = this.unit;
    const f = kitOf(u.item).food;
    const key = f ? `${f.id}${f.cut ? '*' : ''}` : '';
    if (key !== this.boardKey) {
      this.boardKey = key;
      this.boardFood?.dispose();
      this.boardFood = null;
      if (f) {
        const pl = portionLook(f);
        this.boardFood = new Model(this.view.mats, `kitchen:${u.loose.uid}:food`, pl.model, { paint: pl.paint, paint2: pl.paint2, matte: FOOD_GLOSS });
        this.group.add(this.boardFood.obj);
      }
    }
    // a stroke: the knife down and up, what lies there squashed a little
    const stroke = this.chopT < 0.26 ? Math.sin((this.chopT / 0.26) * Math.PI) : 0;
    if (this.boardFood) {
      this.boardFood.obj.position.copy(this.mFood);
      this.boardFood.obj.scale.set(1 + 0.08 * stroke, 1 - 0.14 * stroke, 1 + 0.08 * stroke);
      this.boardFood.frame();
    }
    // the knife over what is to be cut, and back along the board's edge when there is nothing to cut
    const work = !!f && !f.cut;
    this.knifeAt = approach(this.knifeAt, work || this.chopT < 0.4 ? 1 : 0, dt, 11);
    if (this.knife) {
      const k = this.knifeAt;
      const r = this.knifeRest;
      this.knife.position.set(r.x + (this.mFood.x + 0.03 - r.x) * k, r.y + (0.021 + 0.075 - 0.07 * stroke) * k, r.z + (this.mFood.z - r.z) * k);
      this.knife.rotation.x = (Math.PI / 2) * k;
    }
  }

  /** where the thing in the hands would go on this, in this thing's own frame */
  place(slot: GhostAt['slot'], obj: THREE.Object3D, item: string): void {
    const u = this.unit;
    obj.rotation.set(0, 0, 0);
    obj.scale.setScalar(1);
    if (slot === 'can') {
      obj.position.set(this.mCan.x - 0.095, this.mCan.y, this.mCan.z);
      obj.rotation.z = -Math.PI / 2;
    } else if (slot === 'pot') {
      obj.position.copy(this.mPot);
      obj.rotation.y = ON_STOVE_YAW[item] ?? 0;
      // (the steamer onto the pot standing there)
      if (WAY_OF[item] === 'steam') obj.position.y += STEAMER_LIFT;
    } else if (u.kind === 'board') obj.position.copy(this.mFood);
    else {
      // into the vessel: over its middle, small enough to go in
      const v = vesselOf(u.item);
      const room = v ? ROOM[WAY_OF[v]] : ROOM.fry;
      const c = this.contents.group;
      obj.position.copy(c.position).applyQuaternion(this.holder.quaternion).add(this.holder.position);
      obj.position.y += 0.05 + room.liquid;
      obj.scale.setScalar(Math.min(1, (room.cell || 0.08) / Math.max(0.02, this.view.sizeOf(item))));
    }
  }

  dispose(): void {
    // (the thing's own pieces as they were: it may lie there still, as another kind)
    if (this.cover) this.cover.rotation.z = 0;
    if (this.knob) this.knob.rotation.x = 0;
    if (this.lever) this.lever.rotation.z = 0;
    if (this.ownLid) {
      this.ownLid.position.copy(this.lidRest);
      this.ownLid.rotation.z = 0;
    }
    if (this.knife) {
      this.knife.position.copy(this.knifeRest);
      this.knife.rotation.x = 0;
    }
    this.can?.dispose();
    this.vessel?.dispose();
    this.base?.dispose();
    this.boardFood?.dispose();
    this.contents.dispose();
    this.ring?.dispose();
    this.flame?.dispose();
    this.glow?.dispose();
    this.burst?.dispose();
    this.vapour?.dispose();
    this.group.removeFromParent();
  }
}

// ------------------------------------------------------------------ the whole of it

interface GhostObj {
  obj: THREE.Group;
  model: THREE.Object3D | null;
  focused: boolean;
  kind: 'empty' | 'replace';
}

export class KitchenView {
  readonly root = new THREE.Group();
  readonly mats: CarMaterials;
  private readonly views = new Map<Unit, UnitView>();
  private readonly ghosts = new Map<string, GhostObj>();
  private readonly keep = new Set<string>();
  private readonly sizes = new Map<string, number>();
  private readonly v3 = new THREE.Vector3();
  private t = 0;
  /** what is in the vessel in the hands, hung on its model there (null: none made yet); hung now */
  private heldPot: Contents | null = null;
  private heldHung = false;

  constructor(
    readonly ctx: GameContext,
    private readonly sys: Kitchen,
  ) {
    this.root.name = 'kitchen';
    this.mats = ctx.loose.mats;
    ctx.loose.root.add(this.root);
  }

  /** how big an item's model is across (m; a guess until its file is in) */
  sizeOf(item: string): number {
    const model = itemDef(item).model;
    const s = this.sizes.get(model);
    if (s !== undefined) return s;
    this.sizes.set(model, 0.1);
    void itemGlb(model).then((m) => {
      if (!m) return;
      m.box.getSize(this.v3);
      this.sizes.set(model, Math.max(this.v3.x, this.v3.z, this.v3.y));
    });
    return 0.1;
  }

  /** how far the eye is opened up now (core.exposure) */
  exposure = 1;

  update(dt: number): void {
    const ctx = this.ctx;
    this.t += dt;
    // (what glows is held at what it looks like on screen whatever the eye's exposure)
    this.exposure = ctx.core.exposure ?? 1;
    const gain = 1 / Math.max(0.05, this.exposure);
    const target = ctx.player.target;
    const on = target?.kind === 'device' && target.device instanceof KitDevice ? target.device.unit : null;
    const list = this.sys.list;
    for (const [u, v] of this.views) {
      if (list.includes(u)) continue;
      v.dispose();
      this.views.delete(u);
    }
    const gs = this.sys.ghosts;
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      let v = this.views.get(u);
      if (!v) {
        v = new UnitView(this, u);
        this.views.set(u, v);
        this.root.add(v.group);
      }
      let ghosted = false;
      for (let k = 0; k < gs.length; k++) if (gs[k].unit === u && gs[k].slot === 'food') ghosted = true;
      v.update(dt, this.t, gain, on === u, ghosted);
    }
    this.drawGhosts(gs);
    this.heldContents();
  }

  /** a vessel with food in it in the hands: its food with it, where it sits in the vessel (its M_food) */
  private heldContents(): void {
    const ctx = this.ctx;
    const h = ctx.seated ? null : ctx.player.held;
    const v = h?.kind === 'item' ? vesselOf(h.item) : null;
    const pot = v && h?.kind === 'item' ? potOf(h.item) : undefined;
    const model = ctx.heldThing.model;
    if (h?.kind === 'item' && v && pot && pot.items.length && model) {
      const c = (this.heldPot ??= new Contents(this.mats, 'kitchen:held:pot'));
      if (!this.heldHung || c.group.parent !== model) {
        const at = model.getObjectByName('M_food');
        c.group.position.copy(at ? at.position : this.v3.set(0, 0.006, 0));
        ctx.heldThing.hang(c.group);
        this.heldHung = true;
      }
      c.set(WAY_OF[v], pot.items, pot.done ?? 0, bandsOf(h.item));
      c.frame();
    } else if (this.heldHung && this.heldPot) {
      // (only what was hung here is taken off: the camera hangs its own)
      ctx.heldThing.hang(null);
      this.heldHung = false;
      this.heldPot.set(null, null, 0, []);
    }
  }

  private drawGhosts(list: readonly GhostAt[]): void {
    this.keep.clear();
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      const key = `${g.unit ? g.unit.key : 'world'}:${g.slot}:${g.item}`;
      this.keep.add(key);
      let o = this.ghosts.get(key);
      const kind: GhostObj['kind'] = g.slot === 'can' && g.unit && hasCanister(g.unit.item) ? 'replace' : 'empty';
      if (!o) {
        const made: GhostObj = { obj: new THREE.Group(), model: null, focused: g.focused, kind };
        made.obj.name = `kitchen:ghost:${key}`;
        o = made;
        this.ghosts.set(key, made);
        void itemGlb(itemDef(g.item).model).then((m) => {
          if (!m || this.ghosts.get(key) !== made) return;
          const c = cloneModel(m);
          applyGhost(c, made.kind, made.focused);
          made.model = c;
          made.obj.add(c);
        });
      }
      if (o.model && (o.focused !== g.focused || o.kind !== kind)) applyGhost(o.model, kind, g.focused);
      o.focused = g.focused;
      o.kind = kind;
      const uv = g.unit ? this.views.get(g.unit) : null;
      if (uv) {
        if (o.obj.parent !== uv.group) uv.group.add(o.obj);
        uv.place(g.slot, o.obj, g.item);
      } else if (g.at) {
        if (o.obj.parent !== this.root) this.root.add(o.obj);
        o.obj.position.set(g.at.x, g.at.y, g.at.z);
        o.obj.rotation.set(0, -g.at.yaw, 0);
        o.obj.scale.setScalar(1);
      }
    }
    for (const [key, o] of this.ghosts) {
      if (this.keep.has(key)) continue;
      o.obj.removeFromParent();
      this.ghosts.delete(key);
    }
  }

  dispose(): void {
    for (const v of this.views.values()) v.dispose();
    this.views.clear();
    if (this.heldHung) this.ctx.heldThing.hang(null);
    this.heldPot?.dispose();
    this.heldPot = null;
    for (const o of this.ghosts.values()) o.obj.removeFromParent();
    this.ghosts.clear();
    this.root.removeFromParent();
  }
}

