/**
 * Fishing in the game (docs/DESIGN_V2.md 8.4): the rod in the hands, the mouse on it, and what is
 * seen — shadows under the surface, the rod bending with the load, the line from its tip, the float.
 * The rules are src/core/fishing; this file reads the mouse into them and draws them.
 *
 *   left mouse   hold to charge, let go to cast; held while a fish rests = reel; at the bite = strike
 *   mouse        during a fight: push against the run (left / right; back for a run out)
 *   right mouse  give up: wind in
 *
 * The HUD gets nothing new: the ring under the crosshair shows the charge while casting and the
 * line's load while fighting; the one word shows the catch and its length when it is landed.
 *
 * Draw calls: the shadows (one mesh, only with shadows near), the rod, float and line (one). Nothing at all while the player sits in a vehicle.
 */
import * as THREE from 'three';
import { Angling, FISH_STEP, type FishInput, type RodTip } from '../../core/fishing/angling';
import { Angler } from '../../core/fishing/angler';
import { School, type FishEnv, type Zone } from '../../core/fishing/school';
import { SHADOW_LEN, type FishWeather } from '../../core/fishing/species';
import { item } from '../../core/items/catalog';
import type { Site } from '../../core/world/sites';
import { TerrainPoint } from '../../core/onfoot/land';
import { surfaceMaterial } from '../render/materials';
import { FishSound } from './fishSound';
import { bakeTinted, vertexCount } from './shapes3d';
import type { Player } from './player';

export const ROD = 'tool.rod';
/** the rod as held: its butt in camera space, its length */
const BUTT = new THREE.Vector3(0.26, -0.36, -0.3);
const ROD_DIR = new THREE.Vector3(0.02, 0.42, -1).normalize();
const ROD_LEN = 2.1;
const SEG = 10;
/** points along the line */
const LINE_PTS = 24;
/** how long the catch is held up to be looked at (s) */
const SHOW = 2.6;

export class Fishing {
  readonly school: School;
  readonly angling: Angling;
  readonly sound = new FishSound();
  /** what the mouse does now */
  readonly input: FishInput = { down: false, pullX: 0, pullY: 0, cancel: false };
  /** scripted: a robot angler holds the rod (screenshots, tests in the browser) */
  bot: Angler | null = null;
  /** the catch being looked at, and for how long still */
  shown: { id: string; lengthCm: number; big: boolean } | null = null;
  private showT = 0;
  private acc = 0;
  private zones: Zone[] = [];
  private readonly sites: Site[] = [];
  private mouseL = false;
  private mouseR = false;
  private lockYaw = 0;
  private lockPitch = 0;
  private wasFight = false;
  // views
  private readonly shadowMesh: THREE.Mesh;
  private readonly rodMesh: THREE.Mesh;
  private readonly catchMesh: THREE.Mesh;
  private catchId = '';
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly tip: RodTip = { x: 0, y: 0, z: 0, heading: 0 };
  private readonly tipView = new THREE.Vector3();
  private readonly rodPts: THREE.Vector3[] = [];
  private readonly env: FishEnv = { hour: 12, weather: { raining: false, wetness: 0, clear: true } };

  constructor(readonly player: Player) {
    const g = player.game;
    const seed = (g.params.seed * 2654435761) >>> 0;
    this.school = new School(seed);
    this.angling = new Angling(seed ^ 0x9e37, this.school);
    for (let i = 0; i <= SEG; i++) this.rodPts.push(new THREE.Vector3());
    // shadows: quads on the water, one mesh, rebuilt every frame (a dozen at most)
    // a dark, see-through paint just over the surface (the shared surface material, so it sits in the frame like the rest)
    const sm = surfaceMaterial({ color: 0x0d1a1c, opacity: 0.5, fog: false });
    this.shadowMesh = new THREE.Mesh(new THREE.BufferGeometry(), sm);
    this.shadowMesh.frustumCulled = false;
    this.shadowMesh.renderOrder = 5;
    this.shadowMesh.visible = false;
    this.rodMesh = new THREE.Mesh(new THREE.BufferGeometry(), surfaceMaterial({ vertexColors: true, ink: true, fog: false }));
    this.rodMesh.frustumCulled = false;
    this.rodMesh.visible = false;
    this.catchMesh = new THREE.Mesh(new THREE.BufferGeometry(), surfaceMaterial({ vertexColors: true, ink: true, fog: false }));
    this.catchMesh.frustumCulled = false;
    this.catchMesh.visible = false;
    for (const m of [this.shadowMesh, this.rodMesh, this.catchMesh]) g.core.scene.add(m);
    if (typeof window !== 'undefined') {
      const c = g.core.renderer.domElement;
      c.addEventListener('mousedown', (e) => {
        if (e.button === 0) this.mouseL = true;
        if (e.button === 2) this.mouseR = true;
        this.sound.start();
      });
      window.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.mouseL = false;
        if (e.button === 2) this.mouseR = false;
      });
      c.addEventListener('contextmenu', (e) => {
        if (this.holding) e.preventDefault();
      });
    }
  }

  /** the rod is in the hands, on foot */
  get holding(): boolean {
    return this.player.onFoot && this.player.hands.id === ROD;
  }

  /** the jetties' zones near where one stands (asked again after 40 m) */
  private zonesNear(x: number, z: number): Zone[] {
    const world = this.player.game.world;
    if (!world) return this.zones;
    if ((x - this.zoneX) ** 2 + (z - this.zoneZ) ** 2 < 40 * 40) return this.zones;
    const pr = { s: 0, d: 0 };
    world.spine.project(x, z, NaN, pr);
    this.sites.length = 0;
    world.sites.between(pr.s - 300, pr.s + 300, this.sites);
    this.zones = this.sites.filter((st) => st.kind === 'jetty' && st.zoneR > 0).map((st) => ({ x: st.zoneX, z: st.zoneZ, r: st.zoneR }));
    this.zoneX = x;
    this.zoneZ = z;
    return this.zones;
  }
  private zoneX = Infinity;
  private zoneZ = Infinity;

  private weather(): FishWeather {
    const st = this.player.game.env.state;
    this.env.weather.raining = st.rain > 0.15;
    this.env.weather.wetness = st.wetness;
    this.env.weather.clear = st.kind === 'clear';
    return this.env.weather;
  }

  /** where the rod's tip is (unbent), and the heading one faces */
  private placeTip(cam: THREE.Camera): RodTip {
    this.tipView.copy(ROD_DIR).multiplyScalar(ROD_LEN).add(BUTT).applyQuaternion(cam.quaternion).add(cam.position);
    const o = this.player.game.core.origin;
    this.tip.x = this.tipView.x + o.x;
    this.tip.y = this.tipView.y + o.y;
    this.tip.z = this.tipView.z + o.z;
    this.tip.heading = this.player.walker.heading;
    return this.tip;
  }

  /** one frame: step the school and the rod, draw them */
  update(dt: number, cam: THREE.PerspectiveCamera): void {
    const p = this.player;
    if (!p.onFoot) {
      this.hide();
      return;
    }
    const w = p.walker;
    this.zonesNear(w.x, w.z);
    this.env.hour = p.game.env.sky.hour;
    this.weather();
    const holding = this.holding;
    if (!holding && this.angling.phase !== 'idle') this.angling.takeCatch();
    // mouse into the rod: the pull is the turn of the view, which is then held still
    const g = p.game;
    const fighting = this.angling.phase === 'fight';
    if (fighting && !this.wasFight) {
      this.lockYaw = g.input.lookYaw;
      this.lockPitch = g.input.lookPitch;
    }
    this.wasFight = fighting;
    const inp = this.input;
    if (fighting && !this.bot) {
      inp.pullX = Math.max(-1, Math.min(1, (g.input.lookYaw - this.lockYaw) * 6));
      inp.pullY = Math.max(-1, Math.min(1, -(g.input.lookPitch - this.lockPitch) * 6));
      // the view only sways a little with the pull
      g.input.lookYaw = this.lockYaw + (g.input.lookYaw - this.lockYaw) * 0.4;
      g.input.lookPitch = this.lockPitch + (g.input.lookPitch - this.lockPitch) * 0.4;
    } else if (!this.bot) {
      inp.pullX = 0;
      inp.pullY = 0;
    }
    if (!this.bot) {
      inp.down = holding && this.mouseL;
      inp.cancel = holding && this.mouseR;
    }
    this.placeTip(cam);
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= FISH_STEP) {
      this.acc -= FISH_STEP;
      this.fixedStep();
    }
    this.draw(cam);
  }

  /** one fixed step of the school and the rod (also what the scripted hooks call) */
  fixedStep(): void {
    const p = this.player;
    const w = p.walker;
    const land = p.land;
    this.school.step(FISH_STEP, land, w.x, w.z, this.env, this.zones);
    // wading near them sends them off
    if (w.depth > 0.3 && w.speed > 0.3) this.school.scare(w.x, w.z, 3.5, 2);
    if (!this.holding) return;
    const a = this.angling;
    a.bait = p.pack.list().some((s) => s.id.startsWith('bait.'));
    if (this.bot) {
      const inp = this.bot.decide(a, this.tip);
      Object.assign(this.input, inp);
      w.heading = this.tip.heading;
      p.game.input.lookYaw = w.heading;
    }
    a.events.length = 0;
    a.step(this.input, this.tip, land);
    for (const e of a.events) this.sound.play(e);
    this.sound.load(a.phase === 'fight' ? a.tension : 0);
    if (a.caught) this.land();
    if (this.showT > 0) {
      this.showT -= FISH_STEP;
      if (this.showT <= 0) this.stow();
    }
  }

  /** the catch comes out of the water: held up to look at for a moment */
  private land(): void {
    const c = this.angling.takeCatch();
    if (!c) return;
    this.shown = { id: c.id, lengthCm: c.lengthCm, big: c.big };
    this.showT = SHOW;
    const p = this.player;
    if (c.id.startsWith('fish.')) {
      const bait = p.pack.list().find((s) => s.id.startsWith('bait.'));
      if (bait) p.pack.remove(bait.id, 1);
    }
  }

  /** into the backpack (small), or laid at one's feet (what does not fit, and the big ones) */
  private stow(): void {
    const s = this.shown;
    this.shown = null;
    if (!s) return;
    const p = this.player;
    const left = item(s.id).size === 'small' ? p.pack.add(s.id, 1) : 1;
    if (left > 0) {
      const w = p.walker;
      p.loose.add(s.id, 1, w.x + Math.cos(w.heading + 1.2) * 0.6, w.y, w.z + Math.sin(w.heading + 1.2) * 0.6, w.heading, p.id);
    }
    this.lastCatch = s;
  }
  /** the last catch put away (telemetry) */
  lastCatch: { id: string; lengthCm: number; big: boolean } | null = null;

  /** the word and ring the HUD should show, or null */
  hud(): { word: string | null; ring: number } | null {
    if (!this.holding) return null;
    const a = this.angling;
    if (this.shown) {
      const d = item(this.shown.id);
      return { word: this.shown.lengthCm > 0 ? `${d.zh} ${this.shown.lengthCm} cm${this.shown.big ? ' ·大' : ''}` : d.zh, ring: -1 };
    }
    if (a.phase === 'charging') return { word: null, ring: Math.min(1, a.t / 1.2) };
    if (a.phase === 'fight') return { word: null, ring: a.tension };
    return null;
  }

  private hide(): void {
    this.shadowMesh.visible = false;
    this.rodMesh.visible = false;
    this.catchMesh.visible = false;
    this.sound.load(0);
  }

  // ------------------------------------------------------------------------------------ drawing

  private draw(cam: THREE.PerspectiveCamera): void {
    const o = this.player.game.core.origin;
    this.drawShadows(o);
    const holding = this.holding && this.player.game.viewMode === 'cockpit';
    this.rodMesh.visible = holding;
    this.catchMesh.visible = holding && this.shown !== null;
    if (!holding) return;
    this.drawRod(cam, o);
    if (this.shown) this.drawCatch(cam);
  }

  private drawShadows(o: { x: number; y: number; z: number }): void {
    const list = this.school.shadows.filter((s) => s.state !== 'hooked');
    if (list.length === 0) {
      this.shadowMesh.visible = false;
      return;
    }
    // each shadow: a spindle of a body and a tail, as a flat fan just over the surface
    const N = 14;
    const per = (N + 3) * 3;
    const pos = new Float32Array(list.length * per * 3);
    const nor = new Float32Array(list.length * per * 3);
    const tp = this.tpLevel;
    let k = 0;
    const vert = (x: number, y: number, z: number): void => {
      pos[k] = x;
      pos[k + 1] = y;
      pos[k + 2] = z;
      nor[k + 1] = 1;
      k += 3;
    };
    for (const s of list) {
      this.player.land.shape(s.x, s.z, tp);
      // a hair above the surface: the water writes no depth, and the shadow must read through it
      const y = (Number.isFinite(tp.wl) ? tp.wl : tp.h) + 0.03 - o.y;
      const L = SHADOW_LEN[s.size] * (s.big ? 1.25 : 1) * (0.7 + (0.6 * s.lengthCm) / 100) * 0.5;
      const W = L * (s.species === 'fish.eel' ? 0.16 : 0.36);
      const c = Math.cos(s.heading);
      const sn = Math.sin(s.heading);
      const at = (u: number, v: number): [number, number] => [s.x + u * c - v * sn - o.x, s.z + u * sn + v * c - o.z];
      // the body: an ellipse fan (triangles: centre, rim i, rim i + 1)
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2;
        const a1 = ((i + 1) / N) * Math.PI * 2;
        const [cx, cz] = at(L * 0.15, 0);
        const [x0, z0] = at(L * 0.15 + Math.cos(a0) * L * 0.85, Math.sin(a0) * W);
        const [x1, z1] = at(L * 0.15 + Math.cos(a1) * L * 0.85, Math.sin(a1) * W);
        vert(cx, y, cz);
        vert(x1, y, z1);
        vert(x0, y, z0);
      }
      // the tail
      const [t0x, t0z] = at(-L * 0.6, 0);
      const [t1x, t1z] = at(-L * 1.05, W * 0.55);
      const [t2x, t2z] = at(-L * 1.05, -W * 0.55);
      vert(t0x, y, t0z);
      vert(t2x, y, t2z);
      vert(t1x, y, t1z);
      // (two spare triangles kept degenerate so every shadow has the same count)
      for (let q = 0; q < 6; q++) vert(t0x, y, t0z);
    }
    const g = this.shadowMesh.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    this.shadowMesh.visible = true;
  }
  private readonly tpLevel = new TerrainPoint();

  /** the rod: a tapering pole from the hands, bending towards the line as the load grows */
  private drawRod(cam: THREE.PerspectiveCamera, o: { x: number; y: number; z: number }): void {
    const a = this.angling;
    const bend = a.bend;
    // the line's direction in camera space (towards the float)
    const toFloat = this.v.set(a.fx - o.x, (a.fy || this.tip.y - 1.5) - o.y, a.fz - o.z).sub(this.tipView);
    this.q.copy(cam.quaternion).invert();
    toFloat.applyQuaternion(this.q).normalize();
    const pts = this.rodPts;
    pts[0].copy(BUTT);
    const sway = this.player.walker.sway;
    for (let i = 1; i <= SEG; i++) {
      const t = i / SEG;
      const d = this.w.copy(ROD_DIR).lerp(toFloat, Math.min(1, bend * Math.pow(t, 1.6) * 1.5)).normalize();
      pts[i].copy(pts[i - 1]).addScaledVector(d, ROD_LEN / SEG);
      pts[i].x += sway * t * 0.5;
    }
    // the rod's colour along it, and the float's
    const rodId = ROD;
    void rodId;
    const sides = 4;
    const nRod = SEG * sides * 6;
    const nFloat = vertexCount('can');
    const lineOn = a.phase !== 'idle' && a.phase !== 'charging' && a.phase !== 'landed';
    const nLine = lineOn ? (LINE_PTS - 1) * 6 : 0;
    const pos = new Float32Array((nRod + nFloat + nLine) * 3);
    const nor = new Float32Array((nRod + nFloat + nLine) * 3);
    const col = new Float32Array((nRod + nFloat + nLine) * 3);
    const cw = new THREE.Vector3();
    const ax = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();
    let k = 0;
    const put = (p: THREE.Vector3, n: THREE.Vector3, r: number, gg: number, b: number): void => {
      // camera space → world (render) space
      cw.copy(p).applyQuaternion(cam.quaternion).add(cam.position);
      pos[k] = cw.x;
      pos[k + 1] = cw.y;
      pos[k + 2] = cw.z;
      ax.copy(n).applyQuaternion(cam.quaternion);
      nor[k] = ax.x;
      nor[k + 1] = ax.y;
      nor[k + 2] = ax.z;
      col[k] = r;
      col[k + 1] = gg;
      col[k + 2] = b;
      k += 3;
    };
    for (let i = 0; i < SEG; i++) {
      const r0 = 0.016 * (1 - (0.8 * i) / SEG);
      const r1 = 0.016 * (1 - (0.8 * (i + 1)) / SEG);
      const dir = this.w.copy(pts[i + 1]).sub(pts[i]).normalize();
      const side = new THREE.Vector3(1, 0, 0).cross(dir).normalize();
      const up = new THREE.Vector3().crossVectors(dir, side).normalize();
      const [cr, cg, cb] = i < 2 ? [0.06, 0.045, 0.035] : i % 3 === 0 ? [0.5, 0.42, 0.25] : [0.33, 0.16, 0.07];
      for (let s = 0; s < sides; s++) {
        const a0 = (s / sides) * Math.PI * 2;
        const a1 = ((s + 1) / sides) * Math.PI * 2;
        const n0 = new THREE.Vector3().addScaledVector(side, Math.cos(a0)).addScaledVector(up, Math.sin(a0));
        const n1 = new THREE.Vector3().addScaledVector(side, Math.cos(a1)).addScaledVector(up, Math.sin(a1));
        const A = p1.copy(pts[i]).addScaledVector(n0, r0).clone();
        const B = p1.copy(pts[i]).addScaledVector(n1, r0).clone();
        const C = p2.copy(pts[i + 1]).addScaledVector(n1, r1).clone();
        const D = p2.copy(pts[i + 1]).addScaledVector(n0, r1).clone();
        put(A, n0, cr, cg, cb);
        put(B, n1, cr, cg, cb);
        put(C, n1, cr, cg, cb);
        put(A, n0, cr, cg, cb);
        put(C, n1, cr, cg, cb);
        put(D, n0, cr, cg, cb);
      }
    }
    // the bent tip, for the line
    this.bentTip.copy(pts[SEG]).applyQuaternion(cam.quaternion).add(cam.position);
    // the float: a small two-colour can on the water (or flying to it)
    const f = this.floatAt(o);
    const m = new THREE.Matrix4().makeScale(0.55, 0.55, 0.55).setPosition(f.x, f.y, f.z);
    k += bakeTinted('can', 0xd8402c, m, pos, nor, col, k / 3) * 3;
    if (lineOn) this.ribbon(cam, f, pos, nor, col, k);
    const g = this.rodMesh.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.rodMesh.visible = true;
  }
  private readonly bentTip = new THREE.Vector3();
  private readonly fv = new THREE.Vector3();

  /** the float in render space: flying, floating, dipping, gone under */
  private floatAt(o: { x: number; y: number; z: number }): THREE.Vector3 {
    const a = this.angling;
    const f = this.fv;
    if (a.phase === 'idle' || a.phase === 'charging' || a.phase === 'landed') {
      // hanging from the tip
      return f.copy(this.bentTip).add(new THREE.Vector3(0, -0.35, 0));
    }
    if (a.phase === 'flight') {
      const t = Math.min(1, a.t / 0.6);
      const ex = a.fx - o.x;
      const ez = a.fz - o.z;
      const ey = this.tip.y - 1.6 - o.y;
      f.set(this.bentTip.x + (ex - this.bentTip.x) * t, this.bentTip.y + (ey - this.bentTip.y) * t + Math.sin(Math.PI * t) * 1.6, this.bentTip.z + (ez - this.bentTip.z) * t);
      return f;
    }
    return f.set(a.fx - o.x, a.fy - o.y - 0.03 - a.dip * 0.16, a.fz - o.z);
  }

  /**
   * The line, tip to float, as a thin ribbon facing the eye (inked like the rod, so it reads on
   * bright water); it sags while slack and runs straight when taut, paler at full load.
   */
  private ribbon(cam: THREE.PerspectiveCamera, f: THREE.Vector3, pos: Float32Array, nor: Float32Array, col: Float32Array, k: number): void {
    const a = this.angling;
    const tight = a.phase === 'fight' ? a.tension : a.phase === 'bite' ? 0.6 : 0.1;
    const t0 = this.bentTip;
    const len = t0.distanceTo(f);
    const pts = this.linePts;
    for (let i = 0; i < LINE_PTS; i++) {
      const t = i / (LINE_PTS - 1);
      const sag = (1 - tight) * 0.06 * len * Math.sin(Math.PI * t);
      pts[i].set(t0.x + (f.x - t0.x) * t, t0.y + (f.y - t0.y) * t - sag, t0.z + (f.z - t0.z) * t);
    }
    const c = 0.78 + 0.2 * tight;
    const seg = new THREE.Vector3();
    const toCam = new THREE.Vector3();
    const side = new THREE.Vector3();
    const corner = (p: THREE.Vector3, sgn: number, w: number): void => {
      pos[k] = p.x + side.x * w * sgn;
      pos[k + 1] = p.y + side.y * w * sgn;
      pos[k + 2] = p.z + side.z * w * sgn;
      nor[k] = toCam.x;
      nor[k + 1] = toCam.y;
      nor[k + 2] = toCam.z;
      col[k] = c;
      col[k + 1] = c * 0.97;
      col[k + 2] = c * 0.9;
      k += 3;
    };
    for (let i = 0; i < LINE_PTS - 1; i++) {
      const A = pts[i];
      const B = pts[i + 1];
      seg.copy(B).sub(A);
      toCam.copy(cam.position).sub(A).normalize();
      side.crossVectors(seg, toCam).normalize();
      const wa = Math.max(0.0018, A.distanceTo(cam.position) * 0.0011);
      const wb = Math.max(0.0018, B.distanceTo(cam.position) * 0.0011);
      corner(A, -1, wa);
      corner(A, 1, wa);
      corner(B, 1, wb);
      corner(A, -1, wa);
      corner(B, 1, wb);
      corner(B, -1, wb);
    }
  }
  private readonly linePts = Array.from({ length: LINE_PTS }, () => new THREE.Vector3());

  /** the catch held up before the eyes, its tag in the HUD's word */
  private drawCatch(cam: THREE.PerspectiveCamera): void {
    const s = this.shown!;
    if (s.id !== this.catchId) {
      this.catchId = s.id;
      const d = item(s.id);
      const n = vertexCount(d.shape);
      const pos = new Float32Array(n * 3);
      const nor = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const scale = s.lengthCm > 0 ? Math.max(0.6, (s.lengthCm / 100 / 0.3) * 0.5) : 1;
      bakeTinted(d.shape, d.tint, new THREE.Matrix4().makeTranslation(0, 0, 0), pos, nor, col, 0, Math.min(2.2, scale));
      const g = this.catchMesh.geometry;
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    // held up in the middle, a little low, side on, swinging gently
    const t = this.player.game.time;
    this.v.set(0.06, -0.02, -0.5).applyQuaternion(cam.quaternion).add(cam.position);
    this.catchMesh.position.copy(this.v);
    // side on (the shape's flank faces the eye), head down, swinging a little
    this.q.setFromEuler(new THREE.Euler(0, 0.25, -1.25 + Math.sin(t * 2) * 0.08));
    this.catchMesh.quaternion.copy(cam.quaternion).multiply(this.q);
  }

  // ------------------------------------------------------------------------------------ scripting

  /** run fixed steps (s) without drawing; stop early when `until` says so */
  run(seconds: number, until?: () => boolean): number {
    const cam = this.player.game.core.camera;
    let t = 0;
    for (; t < seconds; t += FISH_STEP) {
      this.placeTip(cam);
      this.fixedStep();
      if (until && until()) break;
    }
    return t;
  }

  toJSON(): unknown {
    return { school: this.school.toJSON(), angling: this.angling.toJSON() };
  }
}
