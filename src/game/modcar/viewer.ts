/**
 * ModCar model viewer (viewer.html, docs/MODCAR.md §6): one GLB on a quiet stage, drawn by the game's
 * own renderer, sky and light, with the car materials swapped in by name. For the people modelling the
 * frames and parts (does it read? does it sit in our world?) and for the screenshot harness.
 *
 *   viewer.html?glb=frames/sedan            public/models/modcar/frames/sedan.glb (default: test/testcar)
 *   &time=15.5 &weather=clear               hour, weather (as the game)
 *   &orbit=35,10,7,0.7                      yaw°, pitch°, distance m, height looked at m (yaw 0 = in front, + = round to its right)
 *   &target=1.8,0.6,0.5                     look at this point of the model instead (model frame, m)
 *   &sun=60                                 turn the model so the sun stands there (° from its nose, + = its right)
 *   &paint=9e2f22 &paint2=e6dccb            the two paints (sRGB hex)
 *   &dirt=0.5 &rust=0.3 &wear=0.2           wear for the whole model
 *   &lights=1|2 &brake=1 &turn=L|R &reverse=1   lamps: low / high beam, brake lamps, indicator, reversing lamps
 *   &cabin=1                                the cabin lamp (warm, as the game has it at night)
 *   &ghost=1|empty|replace|blocked          draw the model as the install hologram
 *   &stage=studio|proving|world             painted concrete floor (default), the proving ground, or parked
 *                                           on the road of the real world (&s=3180 &seed=7 &biome= &lane=1.6)
 *   &spin=1                                 turntable (live view)
 *   &debug=ao|mat|normal|env                the baked AO, a flat colour per material, the normals, the
 *                                           mirrored regions (sky, bright band, horizon, dark band, ground)
 *   &merge=1|2                              static parts merged into one mesh per material (2: plus a second,
 *                                           repainted, dirty copy in the same meshes: per-vertex colour and wear)
 *   &highlight=2|WHEEL_FL                   light up a part: its id in the merged meshes, or an object's name
 *   &repaint=3,2f5f8a                       merged: repaint part 3 in place (MergedCar.updatePart)
 *   &ghostpart=test/testwheel &ghostat=1.18,0.285,-0.7 &ghostkind=replace &ghostfocus=1
 *                                           a second model as a ghost at a point of the first (model frame)
 *   &fov=40 &quality=high &post=1 &shot=1   (shot = the harness drives simulate / render)
 *
 * Live: drag to orbit, wheel to zoom, L lamps, B brake, G ghost kinds, P paints, D dirt, R rust, T hour +1, space spin.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Environment } from '../env/environment';
import { applyCarMaterials, applyGhost, carEnvUniforms, carShadows, type CarLook, type GhostKind } from '../render/carMaterials';
import { MergedCar, type MergeEntry } from '../render/carMerge';
import { RenderCore, type Quality } from '../render/core';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, GLSL_VERTEX_MAIN, GLSL_VERTEX_PARS, globals } from '../render/shaderlib';
import { ProvingGround } from '../scene/provingGround';
import { WorldView } from '../scene/worldView';
import { GroundSample } from '../../core/world/ground';
import { BiomeBlend, SpineSample } from '../../core/world/spine';
import { World } from '../../core/world/terrain';

const DEG = Math.PI / 180;

export interface ViewerParams {
  /** URL of the GLB */
  glb: string;
  time: number;
  weather: string;
  orbit: [number, number, number, number];
  target: [number, number, number] | null;
  sun: number;
  paint: string;
  paint2: string;
  dirt: number;
  rust: number;
  wear: number;
  lights: number;
  brake: number;
  turn: '' | 'L' | 'R';
  reverse: boolean;
  /** the cabin lamp on (as the game's VehicleView at night) */
  cabin: boolean;
  ghost: GhostKind | null;
  stage: 'studio' | 'proving' | 'world';
  /** world stage: distance along the road (m), first biome, biome length factor, lane (m right of the centre line) */
  s: number;
  biome: string;
  chapter: number;
  lane: number;
  spin: boolean;
  fov: number;
  quality: Quality;
  post: boolean;
  shot: boolean;
  seed: number;
  /** 0 off, 1 AO, 2 materials, 3 normals */
  debug: number;
  merge: number;
  highlight: string;
  /** merged: [part id, sRGB hex] repainted after merging */
  repaint: [number, string] | null;
  /** a second GLB drawn as a ghost at ghostAt (model frame) */
  ghostPart: string;
  ghostAt: [number, number, number];
  ghostKind: GhostKind;
  ghostFocus: boolean;
}

/** 'frames/sedan' → /models/modcar/frames/sedan.glb; absolute paths and URLs are taken as they are */
export function glbUrl(v: string): string {
  if (/^(\/|https?:|blob:|data:)/.test(v)) return v;
  return `/models/modcar/${v}${v.toLowerCase().endsWith('.glb') ? '' : '.glb'}`;
}

export function readViewerParams(search: string = window.location.search): ViewerParams {
  const raw = new URLSearchParams(search);
  const get = (k: string): string | null => raw.getAll(k).at(-1) ?? null;
  const num = (k: string, d: number): number => {
    const v = get(k);
    if (v === null || v === '') return d;
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const flag = (k: string, d = false): boolean => {
    const v = get(k);
    return v === null ? d : v !== '0' && v !== 'false';
  };
  const list = (k: string): number[] => (get(k) ?? '').split(',').filter((s) => s !== '').map(Number);
  const o = list('orbit');
  const oi = (i: number, d: number): number => (Number.isFinite(o[i]) ? o[i] : d);
  const t = list('target');
  const g = get('ghost');
  const ghost: GhostKind | null = g === null || g === '0' || g === 'false' ? null : g === 'replace' || g === 'blocked' ? g : 'empty';
  const q = get('quality');
  const lights = get('lights');
  const turn = (get('turn') ?? '').toUpperCase();
  return {
    glb: glbUrl(get('glb') ?? 'test/testcar'),
    time: num('time', 15.5),
    weather: get('weather') ?? 'clear',
    orbit: [oi(0, 35), oi(1, 10), oi(2, 7), oi(3, 0.7)],
    target: t.length === 3 && t.every(Number.isFinite) ? [t[0], t[1], t[2]] : null,
    sun: num('sun', 60),
    paint: get('paint') ?? '',
    paint2: get('paint2') ?? '',
    dirt: num('dirt', 0),
    rust: num('rust', 0),
    wear: num('wear', 0),
    lights: lights === 'high' ? 2 : lights === 'low' ? 1 : Math.max(0, Math.min(2, num('lights', 0))),
    brake: num('brake', 0),
    turn: turn === 'L' || turn === 'R' ? turn : '',
    reverse: flag('reverse'),
    cabin: flag('cabin'),
    ghost,
    stage: get('stage') === 'proving' ? 'proving' : get('stage') === 'world' ? 'world' : 'studio',
    s: num('s', 3180),
    biome: get('biome') ?? 'plains',
    chapter: num('chapter', 1),
    lane: num('lane', 1.6),
    spin: flag('spin'),
    fov: num('fov', 40),
    quality: q === 'low' || q === 'med' ? q : 'high',
    post: flag('post', true),
    shot: flag('shot'),
    seed: num('seed', 20261113),
    debug: ({ ao: 1, mat: 2, normal: 3, env: 4 } as Record<string, number>)[get('debug') ?? ''] ?? 0,
    merge: num('merge', 0),
    highlight: get('highlight') ?? '',
    repaint: ((r) => (r.length === 2 && Number.isFinite(Number(r[0])) ? [Number(r[0]), r[1]] : null) as [number, string] | null)((get('repaint') ?? '').split(',')),
    ghostPart: get('ghostpart') ? glbUrl(get('ghostpart')!) : '',
    ghostAt: ((a) => (a.length === 3 && a.every(Number.isFinite) ? [a[0], a[1], a[2]] : [0, 0, 0]) as [number, number, number])(list('ghostat')),
    ghostKind: get('ghostkind') === 'replace' || get('ghostkind') === 'blocked' ? (get('ghostkind') as GhostKind) : 'empty',
    ghostFocus: flag('ghostfocus'),
  };
}

const hex = (s: string): THREE.Color | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
  return m ? new THREE.Color(`#${m[1]}`) : null;
};

/** The studio floor: warm grey painted concrete with a faint metre grid, in the light and shadows of the hour. */
function stageMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...globals },
    vertexShader: /* glsl */ `
      ${GLSL_VERTEX_PARS}
      void main() {
        vec3 transformed = position;
        vec3 objNormal = normal;
        ${GLSL_VERTEX_MAIN}
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      void main() {
        #include <logdepthbuf_fragment>
        vec2 w = rtWorldXZ(vPos);
        float dist = length(vPos - cameraPosition);
        float near = 1.0 - smoothstep(12.0, 45.0, dist);
        vec3 base = mix(vec3(0.27, 0.26, 0.25), vec3(0.35, 0.34, 0.32), rtFbm(w, 23.0));
        base *= 1.0 + (rtStrokeAt(w, 2.6) - 0.5) * 0.22 * near + (rtFbm(w + 7.0, 6.0) - 0.5) * 0.12;
        // a faint metre grid near the model, to judge size by
        vec2 g = abs(fract(w - 0.5) - 0.5);
        vec2 aa = fwidth(w) * 1.2;
        vec2 l = 1.0 - smoothstep(vec2(0.008) - aa, vec2(0.008) + aa, g);
        base = mix(base, base * 1.22, max(l.x, l.y) * 0.5 * near);
        vec3 n = vec3(0.0, 1.0, 0.0);
        float sh = rtShadow(vPos, n);
        vec3 col = base * rtGroundLight(sh);
        col += rtHeadlight(base, n, vPos);
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/** the soft dark under a car where the sky does not reach (the cast shadow is the shadow maps' job) */
function contactShadow(length: number, width: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: 0.75 } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uStrength;
      varying vec2 vUv;
      void main() {
        #include <logdepthbuf_fragment>
        vec2 d = (vUv - 0.5) * 2.0;
        // a rounded box, densest under the middle
        vec2 q = abs(d) - vec2(0.62, 0.45);
        float r = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
        float a = 1.0 - smoothstep(-0.25, 0.42, r);
        // it darkens what is under it (by day and by night alike), tinted by the sky it hides
        gl_FragColor = vec4(mix(vec3(1.0), vec3(0.42, 0.47, 0.6), a * uStrength), 1.0);
      }`,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  // multiply the colour under it; keep the alpha (the paint finish and the ink read it)
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = THREE.CustomBlending;
  mat.blendSrc = THREE.ZeroFactor;
  mat.blendDst = THREE.SrcColorFactor;
  mat.blendSrcAlpha = THREE.ZeroFactor;
  mat.blendDstAlpha = THREE.OneFactor;
  const geo = new THREE.PlaneGeometry(length, width);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -5;
  return m;
}

/** what the harness and the console can ask of the viewer */
export interface ViewerTelemetry {
  [k: string]: number | string | boolean | string[];
}

export class ModelViewer {
  readonly core: RenderCore;
  readonly env: Environment;
  readonly params: ViewerParams;
  /** turned so the sun stands where `sun` says; the model sits in it at the origin */
  readonly carRoot = new THREE.Group();
  model: THREE.Object3D | null = null;
  look: CarLook | null = null;
  private readonly cabinLamp = new THREE.Color();
  ghost: GhostKind | null;
  /** seconds of simulated time */
  time = 0;
  readonly orbit: { yaw: number; pitch: number; dist: number; target: number };
  target: THREE.Vector3 | null;
  spin: boolean;
  /** extra turn of the model (turntable), radians */
  spinAngle = 0;
  lights: number;
  brake: number;
  turn: '' | 'L' | 'R';
  error = '';
  readonly bounds = new THREE.Box3();
  private readonly proving: ProvingGround | null = null;
  private readonly stage: THREE.Mesh | null = null;
  /** world stage: the country, and where on the road the model is parked */
  readonly world: World | null = null;
  private readonly worldView: WorldView | null = null;
  private readonly parked = { x: 0, y: 0, z: 0, phi: 0 };
  private readonly blend = new BiomeBlend();
  private contact: THREE.Mesh | null = null;
  private readonly tmp = new THREE.Vector3();
  private readonly beamFrom = new THREE.Vector3(1.9, 0.7, 0);

  constructor(canvas: HTMLCanvasElement, params: ViewerParams) {
    this.params = params;
    this.core = new RenderCore(canvas, params.quality);
    this.core.usePost = params.post;
    this.core.camera.fov = params.fov;
    this.core.camera.updateProjectionMatrix();
    this.orbit = { yaw: params.orbit[0] * DEG, pitch: params.orbit[1] * DEG, dist: params.orbit[2], target: params.orbit[3] };
    this.target = params.target ? new THREE.Vector3(...params.target) : null;
    this.ghost = params.ghost;
    this.spin = params.spin;
    this.lights = params.lights;
    this.brake = params.brake;
    this.turn = params.turn;
    if (params.stage === 'proving') this.proving = new ProvingGround(this.core);
    else if (params.stage === 'world') {
      this.world = new World(params.seed, { chapterScale: params.chapter, startBiome: params.biome });
      this.worldView = new WorldView(this.core, this.world, this.core.quality);
      // parked in its lane, facing along the road (as Game.placeOnRoad)
      const st = new SpineSample();
      this.world.spine.at(params.s, st);
      const x = st.x - Math.sin(st.phi) * params.lane;
      const z = st.z + Math.cos(st.phi) * params.lane;
      const gs = new GroundSample();
      this.world.sample(x, z, gs);
      Object.assign(this.parked, { x, y: gs.h, z, phi: st.phi });
      this.core.maybeRebase(x, gs.h, z, 0);
      this.world.spine.biomeAt(params.s, this.blend);
    } else {
      const geo = new THREE.PlaneGeometry(6000, 6000, 1, 1);
      geo.rotateX(-Math.PI / 2);
      this.stage = new THREE.Mesh(geo, stageMaterial());
      this.stage.frustumCulled = false;
      this.core.scene.add(this.stage);
    }
    this.core.scene.add(this.carRoot);
    this.env = new Environment(this.core, params.seed, { hour: params.time, weather: params.weather });
    // the viewer's clock stands still: the hour is what the URL says
    this.env.clock.dayLength = 1e12;
    this.env.clock.setHour(params.time, 0);
    this.env.shotMode = params.shot;
    // what the cars mirror below the horizon: the floor, or the road and the country beside it
    carEnvUniforms.uCarDebug.value = params.debug;
    if (this.world) carEnvUniforms.uCarGround.value.setRGB(0.2, 0.21, 0.19);
    else carEnvUniforms.uCarGround.value.setRGB(0.31, 0.3, 0.285);
  }

  async load(url: string): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(url);
    const model = gltf.scene;
    this.setModel(model);
    const p = this.params;
    if (p.ghostPart) {
      // a part held up to the model: drawn as the install hologram where it would go
      const part = (await new GLTFLoader().loadAsync(p.ghostPart)).scene;
      part.position.set(...p.ghostAt);
      applyGhost(part, p.ghostKind, p.ghostFocus);
      this.carRoot.add(part);
    }
  }

  setModel(model: THREE.Object3D): void {
    if (this.model) this.carRoot.remove(this.model);
    this.look?.dispose();
    this.model = model;
    this.carRoot.add(model);
    model.updateMatrixWorld(true);
    // the size of what was loaded (empties and all), in the model's own frame
    this.bounds.makeEmpty();
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld);
      this.bounds.union(b);
    });
    // a part is modelled round its mount point: stand anything that reaches below the floor on it
    if (!this.bounds.isEmpty() && this.bounds.min.y < -0.01) {
      model.position.y -= this.bounds.min.y;
      model.updateMatrixWorld(true);
      this.bounds.translate(new THREE.Vector3(0, -this.bounds.min.y, 0));
    }
    // the head lamps: from the lamp mounts if the model has them, else the front of its box
    const hl = model.getObjectByName('M_headlight_L') ?? model.getObjectByName('M_headlight');
    if (hl) hl.getWorldPosition(this.beamFrom);
    else if (!this.bounds.isEmpty()) this.beamFrom.set(this.bounds.max.x, THREE.MathUtils.lerp(this.bounds.min.y, this.bounds.max.y, 0.45), 0);
    this.beamFrom.z = 0;
    const p = this.params;
    if (p.merge > 0 && !this.ghost) this.mergeStatic(model);
    this.look = applyCarMaterials(model, {
      paint: hex(p.paint) ?? undefined,
      paint2: hex(p.paint2) ?? undefined,
      dirt: p.dirt,
      rust: p.rust,
      wear: p.wear,
    });
    if (this.ghost) applyGhost(model, this.ghost);
    else carShadows(model);
    if (p.highlight && this.look) {
      const id = Number(p.highlight);
      this.look.setHighlight(Number.isFinite(id) ? id : (model.getObjectByName(p.highlight) ?? null));
    }
    if (this.stage && !this.bounds.isEmpty()) {
      if (this.contact) this.carRoot.remove(this.contact);
      const size = this.bounds.getSize(this.tmp);
      // a part held at its mount (not a whole car standing on the ground) gets no contact shadow
      if (this.bounds.min.y < 0.25 && !this.ghost) {
        this.contact = contactShadow(size.x * 1.12, size.z * 1.18);
        this.contact.position.set((this.bounds.min.x + this.bounds.max.x) / 2, 0.004, (this.bounds.min.z + this.bounds.max.z) / 2);
        this.carRoot.add(this.contact);
      }
    }
  }

  /**
   * merge=1: every top-level object that does not move (not a wheel, a hinged panel, an empty) goes into one
   * mesh per material, ids 1, 2, … in order; merge=2 adds a repainted, dirty copy beside it into the same meshes
   */
  private mergeStatic(model: THREE.Object3D): void {
    const moves = (o: THREE.Object3D): boolean => /^(WHEEL_|P_|M_|STEER|NEEDLE)/.test(o.name) || !!o.userData.mover;
    const statics = model.children.filter((o) => !moves(o));
    const paint = hex(this.params.paint) ?? new THREE.Color(0x9e2f22);
    const paint2 = hex(this.params.paint2) ?? new THREE.Color(0xe6dccb);
    const entries: MergeEntry[] = statics.map((object, i) => ({ id: i + 1, object, look: { paint, paint2 } }));
    if (this.params.merge > 1) {
      const twin = new THREE.Group();
      twin.position.set(0, 0, 2.4);
      for (const o of model.children) if (!/^M_/.test(o.name)) twin.add(o.clone());
      model.add(twin);
      twin.updateMatrixWorld(true);
      twin.children.forEach((object, i) => entries.push({ id: 100 + i, object, look: { paint: 0x2f5f8a, paint2: 0xd9a441, dirt: 0.65, rust: 0.25 } }));
    }
    this.merged?.dispose();
    this.merged = new MergedCar(model, entries);
    model.add(this.merged.group);
    const r = this.params.repaint;
    const c = r ? hex(r[1]) : null;
    if (r && c) this.merged.updatePart(r[0], { paint: c, paint2: c });
    model.updateMatrixWorld(true);
  }
  merged: MergedCar | null = null;

  /** advance the viewer's time (ghost breathing, indicators, turntable) */
  simulate(seconds: number): void {
    const dt = 1 / 60;
    let left = seconds;
    while (left > 1e-9) {
      const h = Math.min(dt, left);
      this.time += h;
      if (this.spin) this.spinAngle += h * 20 * DEG;
      left -= h;
    }
    this.update(seconds);
  }

  /** place model, camera and light for the current time (does not draw) */
  update(dt: number): void {
    const core = this.core;
    const env = this.env;
    const cam = core.camera;
    const bl = this.blend;
    env.update(dt, this.time, bl.a, bl.b, bl.t, this.world, 0, 0, 0);
    // on the road: parked along it; elsewhere turned so the sun stands at `sun` degrees from its nose
    const s = globals.uSunDir.value;
    const az = Math.atan2(s.z, s.x);
    const psi = (this.world ? this.parked.phi : az - this.params.sun * DEG) + this.spinAngle;
    if (this.world) core.place(this.carRoot, this.parked.x, this.parked.y, this.parked.z);
    this.carRoot.rotation.y = -psi;
    this.carRoot.updateMatrixWorld(true);
    this.look?.setCarFrame(this.carRoot.matrixWorld);
    // the orbit camera, as the game's: yaw 0 in front of the model, + round to its right
    const fwd = this.tmp.set(Math.cos(psi), 0, Math.sin(psi));
    const rx = -fwd.z;
    const rz = fwd.x;
    const ob = this.orbit;
    const ch = Math.cos(ob.pitch);
    const dx = (fwd.x * Math.cos(ob.yaw) + rx * Math.sin(ob.yaw)) * ch;
    const dz = (fwd.z * Math.cos(ob.yaw) + rz * Math.sin(ob.yaw)) * ch;
    const at = this.target ? this.carRoot.localToWorld(this.target.clone()) : this.carRoot.position.clone().add(new THREE.Vector3(0, ob.target, 0));
    cam.position.set(at.x + dx * ob.dist, at.y + Math.sin(ob.pitch) * ob.dist, at.z + dz * ob.dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(at);
    cam.updateMatrixWorld(true);
    const o = core.origin;
    env.camX = cam.position.x + o.x;
    env.camZ = cam.position.z + o.z;
    this.proving?.update(cam.position.x, cam.position.z);
    this.worldView?.update(env.camX, env.camZ, this.params.shot || dt === 0 ? Infinity : 3.5);
    core.shadowFocus.copy(this.carRoot.position);
    core.shadowFocus.y += Math.max(0.5, this.bounds.isEmpty() ? 0.7 : (this.bounds.min.y + this.bounds.max.y) / 2);
    // lamps: the model's own, and the beam on the floor in front of it
    const blink = Math.floor(this.time / 0.38) % 2 === 0;
    this.look?.setLights({ head: this.lights, tail: this.lights > 0, brake: this.brake, turnLeft: this.turn === 'L' && blink, turnRight: this.turn === 'R' && blink, reverse: this.params.reverse });
    const from = this.carRoot.localToWorld(this.beamFrom.clone());
    globals.uHeadPos.value.copy(from);
    globals.uHeadDir.value.set(Math.cos(psi), -0.1, Math.sin(psi)).normalize();
    if (this.lights > 0 && !this.ghost) globals.uHeadColor.value.setRGB(1.0, 0.82, 0.55).multiplyScalar(this.lights > 1 ? 3.0 : 2.4);
    else globals.uHeadColor.value.setRGB(0, 0, 0);
    // the cabin lamp: the game's warm bulb at its strength (vehicle/view.ts)
    // (the look's own: every vehicle's cabin has its own lamp)
    if (this.params.cabin) this.cabinLamp.setRGB(1.0, 0.7, 0.42).multiplyScalar(0.62);
    else this.cabinLamp.setRGB(0, 0, 0);
    this.look?.setCabinLamp(this.cabinLamp);
  }

  render(): void {
    if (this.env.shotMode) this.env.prepareShot();
    this.core.render(this.time);
  }

  telemetry(): ViewerTelemetry {
    const st = this.core.stats;
    let meshes = 0;
    let tris = 0;
    const mats = new Set<string>();
    this.model?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.visible) return;
      meshes++;
      const g = m.geometry;
      tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      for (const mt of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mt.name);
    });
    return {
      calls: st.calls,
      triangles: st.triangles,
      programs: st.programs,
      geometries: st.geometries,
      textures: st.textures,
      kmh: 0,
      exploded: false,
      biome: this.params.stage,
      glb: this.params.glb,
      hour: this.env.sky.hour,
      weather: this.env.state.kind,
      /** draw calls of the model in the main pass (one per visible mesh) */
      modelCalls: meshes,
      modelTriangles: Math.round(tris),
      materials: [...mats].sort(),
      unknownMaterials: this.look ? [...this.look.unknown].sort() : [],
      error: this.error,
    };
  }
}

// ------------------------------------------------------------------------------------------ page

const canvas = document.getElementById('view') as HTMLCanvasElement | null;
if (canvas) void main(canvas);

async function main(canvas: HTMLCanvasElement): Promise<void> {
  const params = readViewerParams();
  const viewer = new ModelViewer(canvas, params);
  const gl = viewer.core.renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const PAINTS = ['9e2f22', '2f5f8a', 'd9a441', '3f6e4a', 'e6dccb', '262a30', 'c8553d', '6c4f8f'];
  let paintIx = 0;
  /** Debug / test hook: the screenshot harness drives the viewer through this object (harness/shots/run.mjs). */
  const rt = {
    ready: false,
    viewer,
    params,
    info: {
      webgl2: gl instanceof WebGL2RenderingContext,
      renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown',
      three: THREE.REVISION,
    },
    render: () => viewer.render(),
    simulate: (seconds: number) => viewer.simulate(seconds),
    /** orbit camera: yaw, pitch (deg), distance (m), height looked at (m) */
    setOrbit: (yaw: number, pitch: number, dist: number, targetH = viewer.orbit.target) => {
      viewer.orbit.yaw = yaw * DEG;
      viewer.orbit.pitch = pitch * DEG;
      viewer.orbit.dist = dist;
      viewer.orbit.target = targetH;
      viewer.target = null;
      viewer.simulate(0);
    },
    /** look at a point of the model (model frame, m) instead of the point above its middle */
    setTarget: (x: number, y: number, z: number) => {
      viewer.target = new THREE.Vector3(x, y, z);
      viewer.simulate(0);
    },
    setHour: (h: number) => {
      viewer.env.clock.setHour(h, viewer.time);
      viewer.simulate(0);
    },
    setWeather: (k: string | null) => {
      viewer.env.weather.force = k as never;
      viewer.simulate(0);
    },
    setPaint: (a: string, b?: string) => {
      const ca = hex(a);
      const cb = b ? hex(b) : null;
      if (ca) viewer.look?.setPaint(ca);
      if (cb) viewer.look?.setPaint2(cb);
      viewer.simulate(0);
    },
    setLights: (head: number, brake = 0, turn: '' | 'L' | 'R' = '') => {
      viewer.lights = head;
      viewer.brake = brake;
      viewer.turn = turn;
      viewer.simulate(0);
    },
    telemetry: () => viewer.telemetry(),
  };
  (window as unknown as { __rt: typeof rt }).__rt = rt;

  const status = document.createElement('div');
  status.style.cssText = 'position:fixed;left:12px;bottom:10px;font:12px/1.45 ui-monospace,Consolas,monospace;color:#f3ead6;text-shadow:0 1px 2px #0009;pointer-events:none;white-space:pre;opacity:.88';
  if (!params.shot) document.body.appendChild(status);

  try {
    await viewer.load(params.glb);
  } catch (e) {
    viewer.error = `could not load ${params.glb}: ${String(e)}`;
    console.error(viewer.error);
  }

  if (params.shot) {
    viewer.simulate(0);
    viewer.render();
    rt.ready = true;
    return;
  }

  // ---- live: orbit with the mouse, a few keys to try the looks
  let drag: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointerup', () => (drag = null));
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    viewer.orbit.yaw += (e.clientX - drag.x) * 0.006;
    viewer.orbit.pitch = THREE.MathUtils.clamp(viewer.orbit.pitch + (e.clientY - drag.y) * 0.004, -0.15, 1.45);
    drag = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('wheel', (e) => {
    viewer.orbit.dist = THREE.MathUtils.clamp(viewer.orbit.dist * Math.exp(e.deltaY * 0.001), 0.4, 60);
    e.preventDefault();
  }, { passive: false });
  const ghosts: (GhostKind | null)[] = [null, 'empty', 'replace', 'blocked'];
  let dirt = params.dirt;
  let rust = params.rust;
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'l') viewer.lights = (viewer.lights + 1) % 3;
    else if (k === 'b') viewer.brake = viewer.brake > 0 ? 0 : 1;
    else if (k === ' ') viewer.spin = !viewer.spin;
    else if (k === 't') viewer.env.clock.setHour((viewer.env.sky.hour + 1) % 24, viewer.time);
    else if (k === 'p') {
      paintIx = (paintIx + 1) % PAINTS.length;
      viewer.look?.setPaint(new THREE.Color(`#${PAINTS[paintIx]}`));
    } else if (k === 'g' && viewer.model) {
      viewer.ghost = ghosts[(ghosts.indexOf(viewer.ghost) + 1) % ghosts.length];
      void viewer.load(params.glb);
    } else if (k === 'd') dirt = dirt >= 1 ? 0 : Math.min(1, dirt + 0.25);
    else if (k === 'r') rust = rust >= 1 ? 0 : Math.min(1, rust + 0.25);
    else return;
    viewer.look?.setWear?.({ dirt, rust });
  });

  let last = performance.now();
  let frames = 0;
  let acc = 0;
  const loop = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    viewer.simulate(dt);
    viewer.render();
    rt.ready = true;
    frames++;
    acc += dt;
    if (acc > 0.5) {
      const t = viewer.telemetry();
      status.textContent =
        `${(frames / acc).toFixed(0)} fps  ${params.glb}  ${t.modelTriangles} 三角形  模型 ${t.modelCalls} 次绘制（全帧 ${t.calls}）  ${String(t.hour).slice(0, 5)} 时\n` +
        `材质 ${(t.materials as string[]).join(' ')}${(t.unknownMaterials as string[]).length ? `  未知 ${(t.unknownMaterials as string[]).join(' ')}` : ''}${viewer.error ? `\n${viewer.error}` : ''}\n` +
        '拖动 环绕 · 滚轮 远近 · L 车灯 · B 刹车灯 · G 幽灵 · P 换漆 · D 脏 · R 锈 · T 时间 · 空格 转台';
      frames = 0;
      acc = 0;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.addEventListener('resize', () => viewer.core.resize(window.innerWidth, window.innerHeight));
}
