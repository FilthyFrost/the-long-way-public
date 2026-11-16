/**
 * Rain striking things: a drop lands and bursts — a little crown of droplets thrown up and out, a ring spreading
 * on the wet — on the ground round the camera and on the tops of the vehicles near it (the roof, the bonnet, the
 * boot lid, a pickup's bed, the glass): what makes a downpour look as if it hits something. Painted like the
 * rain itself: pale strokes lit by the sky, each burst over in a fifth of a second, a ring in half a second.
 *
 * A vehicle's tops are found once (and again when it changes) by drawing it from above into a small map of
 * heights; its bursts are kept in its own frame, so they ride with it.
 */
import * as THREE from 'three';
import { maskPreservingBlend } from '../render/materials';
import { GLSL_COMMON, globals } from '../render/shaderlib';

/** bursts per second over the ground in view, at a full downpour */
export const GROUND_RATE = 520;
/** bursts per second per square metre of a vehicle's top, at a full downpour */
export const CAR_RATE = 28;
/** how big a burst is (m: a crown's width, a ring's widest) */
export const SIZE = 0.19;

const CROWN_LIFE = 0.2;
const RING_LIFE = 0.5;

/** @param ring how wide a ring spreads, in burst sizes (a puddle's wider than a bonnet's) */
const material = (ring: number): THREE.ShaderMaterial => {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...globals, uNow: { value: 0 }, uSize: { value: SIZE }, uRing: { value: ring }, uColor: { value: new THREE.Color(0xd8e6f0) } },
    // (a crown is turned to the eye, a ring lies face up: neither's winding is worth keeping track of)
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec4 aSplash;   // xyz where (the parent's frame), w the time it landed
      attribute vec2 aKind;     // x: 0 crown, 1 ring; y: its own random 0…1
      uniform float uNow;
      uniform float uSize;
      uniform float uRing;
      varying vec2 vQ;
      varying float vAge;
      varying float vKind;
      varying float vSeed;
      void main() {
        float life = aKind.x < 0.5 ? ${CROWN_LIFE.toFixed(3)} : ${RING_LIFE.toFixed(3)};
        float age = (uNow - aSplash.w) / life;
        vAge = age;
        vKind = aKind.x;
        vSeed = aKind.y;
        vQ = position.xy * 2.0;
        if (age < 0.0 || age > 1.0) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }
        float size = uSize * (0.75 + 0.5 * aKind.y);
        vec4 c = modelMatrix * vec4(aSplash.xyz, 1.0);
        vec3 wp;
        if (aKind.x < 0.5) {
          // a crown: standing up from where it landed, turned to the eye about the vertical
          vec3 toEye = cameraPosition - c.xyz;
          vec3 side = normalize(vec3(-toEye.z, 0.0, toEye.x) + vec3(1e-5, 0.0, 0.0));
          wp = c.xyz + side * position.x * size + vec3(0.0, 1.0, 0.0) * (position.y + 0.5) * size * 0.75;
        } else {
          // a ring: lying on the surface it landed on (the parent's up)
          vec3 ax = normalize((modelMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
          vec3 az = normalize((modelMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
          wp = c.xyz + (ax * position.x + az * position.y) * size * uRing + vec3(0.0, 0.004, 0.0);
        }
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${GLSL_COMMON}
      uniform vec3 uColor;
      varying vec2 vQ;
      varying float vAge;
      varying float vKind;
      varying float vSeed;
      void main() {
        #include <logdepthbuf_fragment>
        float a = 0.0;
        float t = vAge;
        if (vKind < 0.5) {
          // the crown: a fan of short strokes shot up and out from the point it landed on, which break off
          // and fly on as drops (the stroke's foot leaves the ground and catches up with its tip)
          vec2 q = vec2(vQ.x, (vQ.y + 1.0) * 0.5);
          float n = 4.0 + floor(fract(vSeed * 5.3) * 3.0);
          for (int k = 0; k < 6; k++) {
            float fk = float(k);
            if (fk >= n) break;
            float ang = (fk / (n - 1.0) - 0.5) * 2.3 + (fract(vSeed * 7.13 + fk * 0.37) - 0.5) * 0.3;
            float reach = 0.6 + 0.4 * fract(vSeed * 3.7 + fk * 0.61);
            vec2 d = vec2(sin(ang) * 0.95, cos(ang));
            float tip = min(1.0, t * 2.6) * reach;
            float foot = max(0.0, t * 1.9 - 0.55) * reach;
            float fall = 0.9 * t * t;
            vec2 p0 = d * foot - vec2(0.0, fall);
            vec2 p1 = d * tip - vec2(0.0, fall);
            vec2 e = p1 - p0;
            float h = clamp(dot(q - p0, e) / max(dot(e, e), 1e-5), 0.0, 1.0);
            float w = mix(0.07, 0.035, t);
            a = max(a, 1.0 - smoothstep(w * 0.4, w, length(q - p0 - e * h)));
          }
          // (a little lip where it landed, gone at once)
          a = max(a, (1.0 - smoothstep(0.02, 0.05, q.y)) * (1.0 - smoothstep(0.1, 0.22, abs(q.x))) * (1.0 - smoothstep(0.0, 0.35, t)));
          a *= pow(1.0 - t, 1.2);
        } else {
          // the ring: a thin circle spreading out and fading
          float rr = length(vQ);
          float r = 0.1 + 0.9 * sqrt(t);
          a = (1.0 - smoothstep(0.02, 0.055, abs(rr - r))) * pow(1.0 - t, 2.0) * 0.5;
        }
        if (a < 0.01) discard;
        // (a burst of water catches the sky: brighter than the drops falling through it)
        vec3 col = uColor * (uSkyColor * 1.7 + uSunColor * 0.3 + uBounceColor * 0.5);
        gl_FragColor = vec4(col, a * 0.85);
      }`,
  });
  maskPreservingBlend(m);
  return m;
};

/** a ring of bursts in one frame (the world's, or a vehicle's) */
class Bursts {
  readonly mesh: THREE.Mesh;
  private readonly at: THREE.InstancedBufferAttribute;
  private readonly kind: THREE.InstancedBufferAttribute;
  private next = 0;

  constructor(
    readonly count: number,
    mat: THREE.ShaderMaterial,
  ) {
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    this.at = new THREE.InstancedBufferAttribute(new Float32Array(count * 4).fill(-1e6), 4);
    this.kind = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
    this.at.setUsage(THREE.DynamicDrawUsage);
    this.kind.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aSplash', this.at);
    geo.setAttribute('aKind', this.kind);
    geo.instanceCount = count;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 19;
    this.mesh.name = 'splashes';
  }

  /** a burst at (x, y, z) of the frame, landed at `now`; with a ring after it on a wet enough surface */
  add(x: number, y: number, z: number, now: number, ring: boolean): void {
    this.put(x, y, z, now, 0);
    if (ring) this.put(x, y, z, now, 1);
  }

  private put(x: number, y: number, z: number, now: number, kind: number): void {
    const i = this.next;
    this.next = (i + 1) % this.count;
    this.at.setXYZW(i, x, y, z, now);
    this.kind.setXY(i, kind, Math.random());
    this.at.needsUpdate = true;
    this.kind.needsUpdate = true;
  }
}

/** a vehicle's tops (from its map of heights) and its own bursts */
interface Tops {
  key: string;
  /** points of its tops in its model frame (x, y, z), and the area they stand for (m²) */
  points: Float32Array;
  area: number;
  bursts: Bursts;
  carry: number;
  /** when the map was drawn (s) */
  at: number;
}

/** what the splashes need of a vehicle */
export interface SplashVehicle {
  /** its model: the frame its tops are in (origin on the ground, +y up) */
  model: THREE.Object3D;
  /** a key that changes when what it is made of changes (its tops are found again) */
  key: string;
  /** world position (for the distance to the camera) */
  x: number;
  z: number;
}

const MAP_W = 64;
const MAP_H = 32;

export class Splashes {
  private readonly mat = material(1.5);
  /** the vehicles' own: smaller rings (a drop on paint spreads less than one in a puddle) */
  private readonly carMat = material(0.6);
  private readonly ground: Bursts;
  private readonly tops = new Map<SplashVehicle['model'], Tops>();
  private carry = 0;
  private readonly gp = { h: 0, hard: true };
  private readonly cam = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private rt: THREE.WebGLRenderTarget | null = null;
  private heightMat: THREE.ShaderMaterial | null = null;
  /** dials (devTune.ts): how many on the ground, how many on the vehicles, how big */
  groundRate = 1;
  carRate = 1;
  size = 1;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
  ) {
    this.ground = new Bursts(1400, this.mat);
    scene.add(this.ground.mesh);
  }

  /**
   * @param rain     how hard it is raining (0…; above 1 a dial has made it harder)
   * @param wet      how wet the ground is (rings on the wet)
   * @param now      the clock the bursts are timed by (the shaders' uTime)
   * @param origin   render space's origin in the world
   * @param groundAt the height of the ground at a world point (NaN where nothing lands: under a roof), and
   *                 whether the water stands on it (a road, a track: rings) or soaks in (grass)
   */
  update(dt: number, rain: number, wet: number, now: number, camera: THREE.Camera, origin: { x: number; y: number; z: number }, groundAt: (x: number, z: number, out: { h: number; hard: boolean }) => void, vehicles: readonly SplashVehicle[]): void {
    for (const m of [this.mat, this.carMat]) {
      m.uniforms.uNow.value = now;
      m.uniforms.uSize.value = SIZE * this.size;
    }
    const on = rain > 0.03;
    this.ground.mesh.visible = on;
    for (const t of this.tops.values()) t.bursts.mesh.visible = on;
    if (!on || dt <= 0) return;
    // ---- the ground in view: a fan in front of the camera, nearer ones more often (they are bigger on screen)
    camera.getWorldPosition(this.cam);
    camera.getWorldDirection(this.dir);
    const yaw = Math.atan2(this.dir.z, this.dir.x);
    this.carry += GROUND_RATE * this.groundRate * Math.min(rain, 3) * dt;
    const ring = wet > 0.25;
    while (this.carry >= 1) {
      this.carry -= 1;
      const r = 0.8 + 13 * Math.random() ** 1.6;
      const a = yaw + (Math.random() - 0.5) * 2.3;
      const x = this.cam.x + origin.x + Math.cos(a) * r;
      const z = this.cam.z + origin.z + Math.sin(a) * r;
      if (vehicles.some((v) => Math.abs(v.x - x) < 1.2 && Math.abs(v.z - z) < 1.2)) continue;
      const g = this.gp;
      groundAt(x, z, g);
      if (!(g.h === g.h)) continue;
      // (in grass most of them vanish among the blades)
      if (!g.hard && Math.random() < 0.6) continue;
      this.ground.add(x - origin.x, g.h - origin.y + 0.01, z - origin.z, now, ring && g.hard && Math.random() < 0.65);
    }
    // ---- the tops of the vehicles near the camera
    const camX = this.cam.x + origin.x;
    const camZ = this.cam.z + origin.z;
    for (const v of vehicles) {
      const near = Math.hypot(v.x - camX, v.z - camZ) < 18;
      let t = this.tops.get(v.model);
      if (!near) {
        if (t) t.bursts.mesh.visible = false;
        continue;
      }
      if (!t || t.key !== v.key || now - t.at > 6) t = this.measure(v, t, now);
      if (!t || !t.points.length) continue;
      t.carry += CAR_RATE * this.carRate * Math.min(rain, 3) * t.area * dt;
      const n = t.points.length / 3;
      while (t.carry >= 1) {
        t.carry -= 1;
        const i = Math.floor(Math.random() * n) * 3;
        // (anywhere on the cell, not on its middle)
        const jx = (Math.random() - 0.5) * this.cellX;
        const jz = (Math.random() - 0.5) * this.cellZ;
        t.bursts.add(t.points[i] + jx, t.points[i + 1] + 0.005, t.points[i + 2] + jz, now, Math.random() < 0.35);
      }
    }
    // (vehicles gone: their bursts with them)
    for (const [model, t] of this.tops) {
      if (vehicles.some((v) => v.model === model)) continue;
      t.bursts.mesh.removeFromParent();
      t.bursts.mesh.geometry.dispose();
      this.tops.delete(model);
    }
  }

  private cellX = 0.1;
  private cellZ = 0.1;

  /** the vehicle drawn from above into a map of heights: the cells of it that face up are its tops */
  private measure(v: SplashVehicle, was: Tops | undefined, now: number): Tops | undefined {
    const model = v.model;
    model.updateMatrixWorld(true);
    // its bounds in its own frame (ghosts and what is hidden left out)
    const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    const hide: THREE.Object3D[] = [];
    model.traverse((o) => {
      if (o.name.startsWith('ghost:') || o.name === 'splashes') {
        if (o.visible) hide.push(o);
        return;
      }
      const m = o as THREE.Mesh;
      if (!m.isMesh || !shown(m)) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      tmp.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
      box.union(tmp);
    });
    if (box.isEmpty()) return was;
    for (const o of hide) o.visible = false;
    const r = this.renderer;
    this.rt ??= new THREE.WebGLRenderTarget(MAP_W, MAP_H, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, colorSpace: THREE.NoColorSpace });
    this.heightMat ??= heightMaterial();
    this.heightMat.uniforms.uToModel.value.copy(inv);
    // an orthographic eye above it, looking down its own −y (its x across the map, its −z up the map)
    const cam = new THREE.OrthographicCamera(box.min.x, box.max.x, -box.min.z, -box.max.z, 0.01, box.max.y - box.min.y + 2);
    const local = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)).setPosition(0, box.max.y + 1, 0);
    new THREE.Matrix4().copy(model.matrixWorld).multiply(local).decompose(cam.position, cam.quaternion, cam.scale);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    // only its meshes, on a layer of their own for a moment, all in the height material
    const LAYER = 30;
    const masks: [THREE.Object3D, number][] = [];
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        masks.push([o, o.layers.mask]);
        o.layers.set(LAYER);
      }
    });
    cam.layers.set(LAYER);
    const scene = this.scene;
    const override = scene.overrideMaterial;
    scene.overrideMaterial = this.heightMat;
    const prevTarget = r.getRenderTarget();
    const prevClear = new THREE.Color();
    r.getClearColor(prevClear);
    const prevAlpha = r.getClearAlpha();
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(scene, cam);
    const px = new Uint8Array(MAP_W * MAP_H * 4);
    r.readRenderTargetPixels(this.rt, 0, 0, MAP_W, MAP_H, px);
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevClear, prevAlpha);
    scene.overrideMaterial = override;
    for (const [o, mask] of masks) o.layers.mask = mask;
    for (const o of hide) o.visible = true;
    // the cells facing up, high enough off the ground to be the vehicle's (not its wheels' bottoms)
    const pts: number[] = [];
    const sx = (box.max.x - box.min.x) / MAP_W;
    const sz = (box.max.z - box.min.z) / MAP_H;
    this.cellX = sx;
    this.cellZ = sz;
    for (let j = 0; j < MAP_H; j++) {
      for (let i = 0; i < MAP_W; i++) {
        const k = (j * MAP_W + i) * 4;
        if (px[k + 3] < 128) continue;
        const h = ((px[k] + px[k + 1] / 255) / 255) * 4;
        const up = px[k + 2] / 255;
        if (up < 0.6 || h < 0.35) continue;
        pts.push(box.min.x + (i + 0.5) * sx, h, box.max.z - (j + 0.5) * sz);
      }
    }
    let t = was;
    if (!t) {
      const bursts = new Bursts(700, this.carMat);
      // (not merged into the vehicle's batches: render/carMerge leaves movers out)
      bursts.mesh.userData.mover = true;
      model.add(bursts.mesh);
      t = { key: v.key, points: new Float32Array(), area: 0, bursts, carry: 0, at: now };
      this.tops.set(model, t);
    }
    if (t.bursts.mesh.parent !== model) model.add(t.bursts.mesh);
    t.key = v.key;
    t.at = now;
    t.points = new Float32Array(pts);
    t.area = (pts.length / 3) * sx * sz;
    return t;
  }

  dispose(): void {
    this.ground.mesh.removeFromParent();
    for (const t of this.tops.values()) t.bursts.mesh.removeFromParent();
    this.tops.clear();
    this.rt?.dispose();
  }
}

function shown(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/** writes the height (m, in the model's frame: 0…4 m in two bytes) and how much the surface faces up */
function heightMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uToModel: { value: new THREE.Matrix4() } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform mat4 uToModel;
      varying float vH;
      varying vec3 vN;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vH = (uToModel * wp).y;
        vN = normalize(mat3(uToModel) * normalize(mat3(modelMatrix) * normal));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying float vH;
      varying vec3 vN;
      void main() {
        float q = clamp(vH / 4.0, 0.0, 0.9999) * 255.0;
        float hi = floor(q);
        // (a face seen from above whose normal points down is its other side: up all the same)
        float up = abs(vN.y);
        gl_FragColor = vec4(hi / 255.0, fract(q), up, 1.0);
      }`,
  });
}
