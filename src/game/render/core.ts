/**
 * Renderer core: WebGL setup, the off-screen frame + paint pass, and the floating origin.
 *
 * The simulation lives in world coordinates (doubles). The GPU only gets positions relative to
 * `origin`, which follows the player in kilometre steps — so there is no jitter far from home.
 */
import * as THREE from 'three';
import { Frame } from './frame';
import { NOISE_PERIOD, globals } from './shaderlib';
import { STYLE } from './style';
import { skyDomeMaterial } from '../env/sky';
import { ShadowPass } from './shadow';
import { MirrorPass } from './mirror';

export type Quality = 'low' | 'med' | 'high';

export interface QualitySettings {
  pixelRatioCap: number;
  msaa: number;
  paintRadius: number;
  /** shadow map size in texels (0 = soft ground discs only) */
  shadowSize: number;
  /** view distance multiplier for scenery */
  viewScale: number;
  /** vegetation density multiplier */
  density: number;
  /** SMAA over the finished frame (smooths the ink lines, drawn after the MSAA resolve) */
  smaa: boolean;
}

export const QUALITY: Record<Quality, QualitySettings> = {
  low: { pixelRatioCap: 1, msaa: STYLE.pipeline.msaa.low, paintRadius: STYLE.pipeline.paint.radius.low, shadowSize: 0, viewScale: 0.6, density: 0.4, smaa: false },
  med: { pixelRatioCap: 1.25, msaa: STYLE.pipeline.msaa.med, paintRadius: STYLE.pipeline.paint.radius.med, shadowSize: 1024, viewScale: 0.85, density: 0.7, smaa: true },
  high: { pixelRatioCap: 1.5, msaa: STYLE.pipeline.msaa.high, paintRadius: STYLE.pipeline.paint.radius.high, shadowSize: 2048, viewScale: 1, density: 1, smaa: true },
};

export class RenderCore {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  // (the far plane beyond the land's last leaves: scene/worldView.ts draws it out to HORIZON_LAND, 90 km)
  readonly camera = new THREE.PerspectiveCamera(STYLE.pipeline.fov, 16 / 9, 0.06, 130000);
  readonly quality: QualitySettings;
  /** world position of render-space (0,0,0) */
  readonly origin = { x: 0, y: 0, z: 0 };
  readonly sky: THREE.Mesh;
  readonly frame: Frame;
  /** exposure of the hour, set by the environment */
  exposure = 1;
  /** shafts of light from a low sun (0…1), set by the environment */
  shafts = 0;
  /** (G7) the place's own finish against the style's (env/colorScript.ts Look), set by the environment */
  placeContrast = 1;
  placeSaturation = 1;
  /** the depth buffer is reversed and floating (else logarithmic): see the constructor */
  readonly reversedDepth: boolean;
  /** the night's eye (frame.ts night) */
  night = 0;
  readonly shaftColor = new THREE.Color(1, 0.9, 0.7);
  /** false = no paint finish (the rest of the frame stays) */
  usePost = true;
  readonly shadows: ShadowPass | null;
  /** (G8) the world upside down in a level water, for whoever asks for it this frame (render/mirror.ts) */
  readonly mirror: MirrorPass;
  /** centre of the fine shadow map (the vehicle), render space */
  readonly shadowFocus = new THREE.Vector3();
  private readonly shadowFar = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly rebaseListeners: ((dx: number, dy: number, dz: number) => void)[] = [];
  private readonly frameListeners: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = QUALITY[quality];
    // The depth buffer (V2): reversed and floating where the GPU can (EXT_clip_control) — then no shader writes its own
    // depth and the GPU leaves unshaded what is hidden (early depth: the forest spot 10.6 → 7.6 ms); else logarithmic,
    // as it was. ?depth=log keeps the logarithmic one.
    const want = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('depth') : null;
    this.reversedDepth = want !== 'log' && canReverseDepth();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, logarithmicDepthBuffer: !this.reversedDepth, reversedDepthBuffer: this.reversedDepth, powerPreference: 'high-performance', alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatioCap));
    this.renderer.info.autoReset = false;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.frame = new Frame(this.renderer, { samples: this.quality.msaa, paint: this.quality.paintRadius, smaa: this.quality.smaa, reversed: this.reversedDepth });
    this.shadows = this.quality.shadowSize > 0 ? new ShadowPass(this.quality.shadowSize, this.reversedDepth) : null;
    this.mirror = new MirrorPass(this.reversedDepth);
    this.sky = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 4), skyDomeMaterial());
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    this.scene.add(this.sky);
    this.resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
  }

  resize(cssW: number, cssH: number): void {
    this.renderer.setSize(cssW, cssH, false);
    this.camera.aspect = cssW / cssH;
    this.camera.updateProjectionMatrix();
  }

  /** Place an object given its world position. */
  place(obj: THREE.Object3D, wx: number, wy: number, wz: number): void {
    obj.position.set(wx - this.origin.x, wy - this.origin.y, wz - this.origin.z);
  }

  onRebase(fn: (dx: number, dy: number, dz: number) => void): void {
    this.rebaseListeners.push(fn);
  }

  /**
   * Called at the start of every frame drawn, before the shadow maps: whatever sets itself out by the camera
   * (scene/crowns/crownView.ts). Returns the way to stop.
   */
  onFrame(fn: () => void): () => void {
    this.frameListeners.push(fn);
    return () => {
      const i = this.frameListeners.indexOf(fn);
      if (i >= 0) this.frameListeners.splice(i, 1);
    };
  }

  /** Move the render origin close to (wx, wy, wz) when it has drifted too far. Returns true if it moved. */
  maybeRebase(wx: number, wy: number, wz: number, limit = 1024): boolean {
    const dx = wx - this.origin.x;
    const dz = wz - this.origin.z;
    const dy = wy - this.origin.y;
    if (Math.abs(dx) < limit && Math.abs(dz) < limit && Math.abs(dy) < limit) return false;
    // snap to whole steps so world-space patterns keep their phase
    const snap = 256;
    const nx = Math.round(wx / snap) * snap;
    const ny = Math.round(wy / snap) * snap;
    const nz = Math.round(wz / snap) * snap;
    const sx = nx - this.origin.x;
    const sy = ny - this.origin.y;
    const sz = nz - this.origin.z;
    this.origin.x = nx;
    this.origin.y = ny;
    this.origin.z = nz;
    for (const fn of this.rebaseListeners) fn(sx, sy, sz);
    return true;
  }

  render(time: number): void {
    const o = this.origin;
    const wrap = (v: number): number => ((v % NOISE_PERIOD) + NOISE_PERIOD) % NOISE_PERIOD;
    globals.uOriginOffset.value.set(wrap(o.x), wrap(o.y), wrap(o.z));
    globals.uTime.value = time;
    globals.uCamRange.value.set(this.camera.near, this.camera.far);
    this.renderer.info.reset();
    for (const fn of this.frameListeners) fn();
    // The shadow maps and the screen draw the scene four times (two maps, the plants into the wide one again, the
    // screen), and the renderer would bring every matrix in it up to date each time: once is enough, nothing moving
    // between the passes (a third of the CPU's part of a frame went on it).
    const scene = this.scene;
    scene.updateMatrixWorld();
    const auto = scene.matrixWorldAutoUpdate;
    scene.matrixWorldAutoUpdate = false;
    try {
      if (this.shadows) {
        // the wide map sits a little ahead of the camera, where shadows are actually seen
        this.camera.getWorldDirection(this.fwd);
        this.fwd.y = 0;
        if (this.fwd.lengthSq() > 1e-6) this.fwd.normalize();
        this.shadowFar.copy(this.camera.position).addScaledVector(this.fwd, 55);
        this.shadows.render(this.renderer, scene, this.shadowFocus, this.shadowFar);
      }
      this.mirror.render(this.renderer, scene, this.camera, o.y);
      this.frame.exposure = this.exposure;
      this.frame.shafts = this.shafts;
      this.frame.placeContrast = this.placeContrast;
      this.frame.placeSaturation = this.placeSaturation;
      this.frame.night = this.night;
      this.frame.shaftColor.copy(this.shaftColor);
      this.frame.paint = this.usePost ? this.quality.paintRadius : 0;
      this.frame.render(scene, this.camera, time);
    } finally {
      scene.matrixWorldAutoUpdate = auto;
    }
    // (what wants the frame as it was drawn, once: a camera's shutter, docs/ND/PLAN.md — the canvas still holds it now)
    if (this.afterFrame.length) {
      const fns = this.afterFrame.splice(0);
      for (const fn of fns) fn(this.renderer.domElement);
    }
  }

  /** called once each, right after the next frame is drawn, with the canvas it is on (read it then: it is cleared after) */
  readonly afterFrame: ((canvas: HTMLCanvasElement) => void)[] = [];

  get stats(): { calls: number; triangles: number; geometries: number; textures: number; programs: number } {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length ?? 0 };
  }
}

/** whether this GPU can draw a reversed depth buffer (EXT_clip_control on a WebGL 2 context): asked once, of a throwaway canvas */
function canReverseDepth(): boolean {
  try {
    if (typeof document === 'undefined') return false;
    const gl = document.createElement('canvas').getContext('webgl2');
    const ok = !!gl && !!gl.getExtension('EXT_clip_control');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}
