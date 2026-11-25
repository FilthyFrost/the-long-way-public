/**
 * The catch held up (docs/V3/plan/fishing-feel.md §4, the fourth step, as DREADMOOR shows it): the fish whipped up out
 * of the water on the line and held up by it before the eye — hanging from the hook in its mouth, its head up, its body
 * coming toward the eye, as near as makes it fill the view's height from near its top (a lord more than the view
 * holds). It swings on the line like a weight on a string, turns on it, and flops: its whole body curled one way and
 * flung the other, the tail slapping, the line jerked with it, drops of water flung off; in bursts with a breath
 * between, wearing down to a twitch now and then. Then it is let go back into the water, or taken away (into the
 * creel, onto the ground: the system's to say).
 *
 * The hand that holds the line is not drawn (no hands are until the character model is made: fishing-feel.md §6): the
 * line runs up from the snout out of the top of the view. The near side of the fish — its right side, the one its card
 * shows — is mostly toward the eye as it turns.
 *
 * A big catch is not hung like that (the user's word, 2026-11-24: a 1.86 m sturgeon showed only its head at the foot of
 * the view): it is held up as a trophy, laid over toward the level with its head high on the right, its back a little
 * toward the eye, and as far off as fits the whole of it, fins and all, into the view left of its card. A small fish
 * hangs as before; between the two (TROPHY_FROM … TROPHY_TO m long) it is laid over, put back and moved by degrees.
 *
 * Everything is drawn in render space and placed from the camera every frame (it stays in view as one turns).
 */
import * as THREE from 'three';
import { FishBody } from './bend';
import { Spring } from './shake';

export type HoldPhase = 'haul' | 'hold' | 'release' | 'gone';

/** seconds the haul out of the water takes, and the fall back into it */
const HAUL = 0.42;
const SLIP = 0.5;
/** the share of the view's height the fish hangs over (from the fist near its top: its tail goes out of the bottom) */
const FILL = 1;
/** where the line is held, by a hand not drawn: a share of the view's half-width left of the middle, of its half-height above it */
const FIST_X = -0.16;
const FIST_Y = 0.44;
/** how far on above where it is held the line is drawn (m): out of the top of the view */
const LINE_UP = 0.8;
/** the line from the fist to the snout (m), and the fish's lean toward the eye at rest (rad) */
const LEADER = 0.065;
const LEAN = 0.18;
/** how far it is turned on the line at rest (rad: − its back away from the eye) */
const TURN = -0.3;
/** held up as a trophy, not hung: not at all up to so long (m), wholly from so long, smoothly between */
const TROPHY_FROM = 0.4;
const TROPHY_TO = 0.9;
/** a trophy's slant above the level (rad: its head up on the right), its lean toward the eye and its turn on the line at rest */
const SLANT = 0.52;
const TROPHY_LEAN = 0.07;
const TROPHY_TURN = 0.22;
/** the frame a trophy's whole body is fitted into (shares of the view's half-width and half-height, from its middle): left of the card */
const FRAME_L = -0.86;
const FRAME_R = 0.4;
const FRAME_B = -0.82;
const FRAME_T = 0.82;
/** a trophy put further off by so much of its length: its flops bring its tail toward the eye, the bigger */
const FLOP_ROOM = 0.1;
/** the line's colour (sRGB) */
const LINE = 0xa9aeaa;

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const VIEW_Z = new THREE.Vector3(0, 0, 1);
const spine = { x: 0, z: 0, a: 0 };

/** drops of water flung off the fish: a pool of points in render space, each with its own speed and life */
class Drops {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private next = 0;

  constructor(n = 220) {
    this.pos = new Float32Array(n * 3).fill(1e6);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    let map: THREE.Texture | null = null;
    if (cv) {
      cv.width = cv.height = 32;
      const c = cv.getContext('2d')!;
      const grad = c.createRadialGradient(13, 12, 1, 16, 16, 15);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.45, 'rgba(225,244,255,0.95)');
      grad.addColorStop(0.8, 'rgba(150,205,235,0.75)');
      grad.addColorStop(1, 'rgba(150,205,235,0)');
      c.fillStyle = grad;
      c.fillRect(0, 0, 32, 32);
      map = new THREE.CanvasTexture(cv);
    }
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.011, map, transparent: true, depthWrite: false, color: 0xffffff, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 30;
  }

  /** a spray from a point (render space): so many drops, flung off this way and up */
  fling(at: THREE.Vector3, away: THREE.Vector3, n: number, speed: number): void {
    const N = this.life.length;
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % N;
      const o = i * 3;
      this.pos[o] = at.x + (Math.random() - 0.5) * 0.03;
      this.pos[o + 1] = at.y + (Math.random() - 0.5) * 0.02;
      this.pos[o + 2] = at.z + (Math.random() - 0.5) * 0.03;
      const s = speed * (0.4 + Math.random());
      this.vel[o] = away.x * s + (Math.random() - 0.5) * speed * 0.9;
      this.vel[o + 1] = away.y * s + (0.6 + Math.random()) * speed * 0.8;
      this.vel[o + 2] = away.z * s + (Math.random() - 0.5) * speed * 0.9;
      this.life[i] = 0.45 + Math.random() * 0.4;
    }
  }

  /** one frame; a drop that comes up to the eye is gone (it would fill the view) */
  update(dt: number, eye: THREE.Vector3): void {
    const N = this.life.length;
    let any = false;
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      const o = i * 3;
      if (this.life[i] <= 0) {
        this.pos[o] = this.pos[o + 1] = this.pos[o + 2] = 1e6;
        continue;
      }
      this.vel[o + 1] -= 9.8 * dt;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      const dx = this.pos[o] - eye.x;
      const dy = this.pos[o + 1] - eye.y;
      const dz = this.pos[o + 2] - eye.z;
      if (dx * dx + dy * dy + dz * dz < 0.2 * 0.2) {
        this.life[i] = 0;
        this.pos[o] = this.pos[o + 1] = this.pos[o + 2] = 1e6;
      }
    }
    if (any) (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  rebase(dx: number, dy: number, dz: number): void {
    for (let i = 0; i < this.life.length; i++) {
      if (this.life[i] <= 0) continue;
      this.pos[i * 3] -= dx;
      this.pos[i * 3 + 1] -= dy;
      this.pos[i * 3 + 2] -= dz;
    }
  }
}

export class FishHold {
  readonly group = new THREE.Group();
  phase: HoldPhase = 'gone';
  /** seconds into the phase */
  t = 0;
  /** what happened this frame: slaps (each one's strength 0 … 1), the splash back into the water, the catch in the hand */
  readonly slaps: number[] = [];
  splashed = false;
  caught = false;
  /** the catch thrust up to the eye as it comes into the hand (1), easing back to where it is held */
  private push = 0;
  private body: FishBody | null = null;
  /** the fish where it is (flying up out of the water, hanging, falling back) */
  private readonly rig = new THREE.Group();
  private readonly cyl = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  private readonly line: THREE.Mesh;
  private readonly drops = new Drops();
  private len = 0.3;
  private big = 0;
  /** how far it is held up as a trophy instead of hung (0 … 1, by its length), and its outline across it at rest (the model's y: its fins' tips) */
  private lay = 0;
  private lo = -0.1;
  private hi = 0.1;
  private style: 'c' | 's' | 'stiff' = 'c';
  /** how much it still has in it (1 fresh out of the water … a floor of a twitch now and then) */
  energy = 1;
  /** how far its body is curled now, one way (+) or the other (the tests read it) */
  bend = 0;
  private ph = 0;
  private burst = 0;
  private rest = 0;
  private lastSin = 0;
  private hz = 2;
  /** it swings on the line (across the view, toward and away from the eye) and turns on it: springs (rad) */
  private readonly swingX = new Spring(40, 1.6);
  private readonly swingZ = new Spring(40, 1.6);
  private readonly twist = new Spring(16, 2.2);
  /** the fist pulled down and aside by its jerks (m, camera's frame) */
  private readonly fistY = new Spring(260, 16);
  /** where it came out of the water and where it goes back (render space), and how it lay in the water */
  private readonly from = new THREE.Vector3();
  private readonly fromQ = new THREE.Quaternion();
  private readonly to = new THREE.Vector3();
  /** this frame: where the fish is held (its frame's origin and turn), the fist, the snout (render space) */
  private readonly holdPos = new THREE.Vector3();
  private readonly holdQ = new THREE.Quaternion();
  private readonly fist = new THREE.Vector3();
  private readonly snout = new THREE.Vector3();
  private readonly top = new THREE.Vector3();
  private readonly xf = new THREE.Vector3();
  private readonly yf = new THREE.Vector3();
  private readonly zf = new THREE.Vector3();
  private readonly camQ = new THREE.Quaternion();

  constructor() {
    this.line = new THREE.Mesh(this.cyl, new THREE.MeshBasicMaterial({ color: LINE }));
    this.line.frustumCulled = false;
    this.line.userData.ownLook = true;
    this.group.add(this.rig, this.line, this.drops.points);
    this.group.visible = false;
    this.line.visible = false;
  }

  /**
   * The fish (its body as fishModel.ts makes it) out of the water at `from` (render space), lying as `fromQ` has it;
   * how it flops: curled into a C one way and the other (most), an eel's S running down it, an odd one (a crayfish,
   * a frog, a turtle …) only jerking on the line
   */
  start(model: THREE.Object3D, len: number, from: THREE.Vector3, fromQ: THREE.Quaternion, style: 'c' | 's' | 'stiff' = 'c'): void {
    this.clear();
    this.style = style;
    const body = new FishBody(model);
    this.body = body;
    this.len = len;
    this.big = Math.max(0, Math.min(1, (len - 0.4) / 1.2));
    const u = Math.max(0, Math.min(1, (len - TROPHY_FROM) / (TROPHY_TO - TROPHY_FROM)));
    this.lay = u * u * (3 - 2 * u);
    this.lo = 0;
    this.hi = 0;
    for (const o of body.group.children) {
      const p = (o as THREE.Mesh).geometry?.getAttribute('position');
      if (p) for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        if (y < this.lo) this.lo = y;
        if (y > this.hi) this.hi = y;
      }
    }
    body.group.scale.setScalar(len);
    this.rig.add(body.group);
    this.from.copy(from);
    this.fromQ.copy(fromQ);
    this.energy = 1.15;
    this.ph = 0;
    this.burst = 5;
    this.rest = 0;
    this.lastSin = 0;
    this.hz = Math.max(1.15, Math.min(2.7, 2.7 - 1.1 * len));
    // (a pendulum's own swing: a short fish quick, a long one slow)
    const arm = LEADER + 0.5 * len;
    this.swingX.k = 9.8 / arm;
    this.swingZ.k = 9.8 / arm;
    this.swingX.reset();
    this.swingZ.reset();
    this.twist.reset();
    this.fistY.reset();
    this.twist.v = 0.9;
    this.phase = 'haul';
    this.t = 0;
    this.group.visible = true;
  }

  /** the hand lets it go: it falls back into the water at `to` (render space) */
  release(to: THREE.Vector3): void {
    if (this.phase !== 'hold' && this.phase !== 'haul') return;
    this.to.copy(to);
    this.phase = 'release';
    this.t = 0;
  }

  /** the line's and the drops' shaders made now (at the strike), not on the frame the fish comes up */
  warm(renderer: THREE.WebGLRenderer, cam: THREE.Camera): void {
    if (this.warmed) return;
    this.warmed = true;
    const scene = new THREE.Scene();
    const g = new THREE.BoxGeometry(0.01, 0.01, 0.01);
    scene.add(new THREE.Mesh(g, this.line.material as THREE.Material));
    const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3)), this.drops.points.material);
    scene.add(pts);
    renderer.compile(scene, cam);
    g.dispose();
    pts.geometry.dispose();
  }

  private warmed = false;

  /** it is taken away (into the creel, onto the ground): gone at once */
  end(): void {
    this.clear();
  }

  private clear(): void {
    this.body?.dispose();
    this.body = null;
    this.phase = 'gone';
    this.line.visible = false;
    this.group.visible = this.drops.points.visible;
  }

  /**
   * Where it is held this frame (render space): the fist up on the left of the view, the line down from it to the snout,
   * the fish below with its body leaning toward the eye, swung and turned on the line; a big one laid over as a trophy
   * from its snout, put further off and its snout moved up to the right, so that the whole of it is in the view
   */
  private holdPose(cam: THREE.PerspectiveCamera, dt: number): void {
    const L = this.len;
    const body = this.body!;
    const lay = this.lay;
    const tanV = Math.tan((cam.fov * Math.PI) / 360);
    const tanH = tanV * Math.max(0.6, cam.aspect);
    // hung: as near as makes it hang over FILL of the view's height (a big fish no further than an arm's length)
    const dHang = Math.max(0.33, Math.min(0.8, (L + LEADER) / (2 * FILL * tanV)));
    // a trophy: laid over from hanging as far as it is one (its head up on the right); its outline so laid (the corners
    // about the snout: back along it to the tail's tip, across it to its fins' tips) as far off as fits it into the frame,
    // the snout where that puts the outline's middle on the frame's
    const tilt = lay * (Math.PI / 2 - SLANT);
    const ca = Math.sin(tilt);
    const sa = Math.cos(tilt);
    const back = (body.x0 - body.x1) * L;
    const hi = this.hi * L;
    const lo = this.lo * L;
    const xa = Math.min(-hi * sa, -lo * sa, back * ca - hi * sa, back * ca - lo * sa);
    const xb = Math.max(-hi * sa, -lo * sa, back * ca - hi * sa, back * ca - lo * sa);
    const ya = Math.min(hi * ca, lo * ca, back * sa + hi * ca, back * sa + lo * ca);
    const yb = Math.max(hi * ca, lo * ca, back * sa + hi * ca, back * sa + lo * ca);
    const dLaid = Math.max((xb - xa) / ((FRAME_R - FRAME_L) * tanH), (yb - ya) / ((FRAME_T - FRAME_B) * tanV)) + FLOP_ROOM * L;
    // where the line is held (shares of the view's half-width and half-height): hung, up on the left; a trophy, over its snout
    const lu = (0.5 * (FRAME_L + FRAME_R) * dLaid * tanH - 0.5 * (xa + xb)) / (dLaid * tanH);
    const lv = (0.5 * (FRAME_B + FRAME_T) * dLaid * tanV - 0.5 * (ya + yb) + LEADER) / (dLaid * tanV);
    // (put where a trophy goes sooner than it is laid over: a middling fish half laid over is already wholly in view)
    const w = 1 - (1 - lay) * (1 - lay);
    // (the catch thrust up to the eye as it comes into the hand, easing back)
    this.push = Math.max(0, this.push - dt * 1.6);
    const D = (dHang + (dLaid - dHang) * w) * (1 - 0.32 * this.push * this.push);
    cam.updateMatrixWorld();
    const m = cam.matrixWorld;
    this.camQ.setFromRotationMatrix(tmpM.extractRotation(m));
    // where the line is held, jerked down by the flops
    const fy = this.fistY.step(dt, 0);
    this.fist.set((FIST_X + (lu - FIST_X) * w) * D * tanH, (FIST_Y + (lv - FIST_Y) * w) * D * tanV - fy, -D);
    // the line down from it: swung across the view and toward the eye (a trophy laid over hardly swings: its tail would
    // sweep out of the view)
    const sx = this.swingX.x * (1 - 0.9 * lay);
    const sz = this.swingZ.x * (1 - 0.7 * lay);
    const lean = LEAN + (TROPHY_LEAN - LEAN) * lay;
    const down = tmpV.set(Math.sin(sx), -Math.cos(sx) * Math.cos(lean + sz), Math.sin(lean + sz)).normalize();
    this.snout.copy(this.fist).addScaledVector(down, LEADER);
    // the fish's frame (the camera's): its snout up the line (a trophy laid over from it, its head up on the right), its
    // right side toward the eye, turned on the line
    const xf = this.xf.copy(down).multiplyScalar(-1).applyAxisAngle(VIEW_Z, -tilt);
    const zf = this.zf.set(0, 0, 1).addScaledVector(xf, -xf.z).normalize();
    zf.applyAxisAngle(xf, this.twist.x + TURN + (TROPHY_TURN - TURN) * lay);
    const yf = this.yf.crossVectors(zf, xf).normalize();
    tmpM.makeBasis(xf, yf, zf);
    this.holdQ.setFromRotationMatrix(tmpM).premultiply(this.camQ);
    // its frame's origin: the snout (x1 along its length) at the hook
    this.holdPos.copy(this.snout).addScaledVector(xf, -body.x1 * L).applyMatrix4(m);
    this.snout.applyMatrix4(m);
    // the line on up from where it is held, out of the top of the view (however far off that is)
    this.top
      .copy(this.fist)
      .addScaledVector(down, -Math.max(LINE_UP, 2.5 * D * tanV))
      .applyMatrix4(m);
    this.fist.applyMatrix4(m);
  }

  /** one frame (render space; the camera as it is this frame); `fill`: how much it is lit as by a lamp (the night's) */
  update(dt: number, cam: THREE.PerspectiveCamera, fill = 0): void {
    this.slaps.length = 0;
    this.splashed = false;
    this.caught = false;
    this.drops.update(dt, cam.position);
    const body = this.body;
    if (!body || this.phase === 'gone') {
      this.group.visible = this.drops.points.visible;
      return;
    }
    this.t += dt;
    body.fill(fill);
    // ---- the flop: bursts of a C flung one way and the other, a breath between, wearing down
    const hz = this.hz * (this.phase === 'haul' ? 1.35 : 1);
    let s = 0;
    if (this.rest > 0) {
      this.rest -= dt;
      // (a breath: the gills, a twitch of the tail)
      this.ph += dt * hz * 0.9;
      s = 0.12 * Math.sin(this.ph * 2.3) * this.energy;
    } else {
      this.ph += dt * hz * Math.PI * 2 * (0.8 + 0.35 * this.energy);
      const sn = Math.sin(this.ph);
      s = Math.tanh(2.6 * sn) / Math.tanh(2.6);
      if (Math.sign(sn) !== Math.sign(this.lastSin) && this.lastSin !== 0) {
        // a slap: the half-flop done — the fish thrown aside on the line, turned on it, the fist jerked
        const k = Math.min(1, this.energy * (0.55 + 0.45 * this.big));
        this.slaps.push(k);
        this.fling(0.8 + 0.6 * this.energy);
        this.swingX.v += Math.sign(sn) * (0.9 + 0.5 * Math.random()) * this.energy * (1 - 0.4 * this.big);
        this.swingZ.v += (Math.random() - 0.5) * 0.5 * this.energy;
        this.twist.v += (Math.random() - 0.5) * 0.8 * this.energy;
        this.fistY.v += 0.35 * this.energy * (0.6 + this.big);
        this.burst--;
        if (this.burst <= 0) {
          this.rest = (0.45 + Math.random() * 0.9) * (1.5 - 0.5 * Math.min(1, this.energy));
          this.burst = 3 + Math.floor(Math.random() * (3 + 3 * this.energy));
        }
      }
      this.lastSin = sn;
    }
    this.swingX.step(dt, 0);
    this.swingZ.step(dt, 0);
    // (turned to and fro on the line, its near side mostly toward the eye)
    this.twist.step(dt, 0.22 * Math.sin(this.t * 0.8));
    if (this.phase === 'hold') this.energy = Math.max(0.22, this.energy - dt * (0.055 - 0.025 * this.big));
    // (a trophy laid over flops less: its tail would come at the eye)
    const A = 1.5 * Math.min(1.25, this.energy) * (1 - 0.3 * this.big) * (1 - 0.25 * this.lay) * (this.style === 'stiff' ? 0.22 : 1);
    const e = this.energy;
    const ph = this.ph;
    // (hung by the snout: the head holds still, the body below it curls and the tail swings)
    const pivot = 0.97;
    if (this.style === 's') body.pose((u) => A * 2.6 * Math.sin(ph * 0.55 + u * 7.5) * (0.45 + 0.55 * (1 - u)) * (0.5 + 0.5 * Math.abs(s)), pivot);
    else body.pose((u) => A * (s * 1.6 * Math.exp(-(((u - 0.5) / 0.3) ** 2)) + 0.55 * e * Math.sin(ph * 2 + u * 4) * (1 - u) * (1 - u)), pivot);
    this.bend = A * s;
    // ---- where it is: up out of the water, hanging, or falling back
    this.holdPose(cam, dt);
    let reach = 1;
    if (this.phase === 'haul') {
      const u = Math.min(1, this.t / HAUL);
      const k = 1 - (1 - u) * (1 - u) * (1 - u);
      this.rig.position.lerpVectors(this.from, this.holdPos, k);
      this.rig.position.y += Math.sin(Math.PI * u) * (0.5 + 0.3 * this.len);
      this.rig.quaternion.slerpQuaternions(this.fromQ, this.holdQ, Math.min(1, u * 1.3));
      reach = Math.max(0, (u - 0.45) / 0.55);
      if (u >= 1) {
        this.phase = 'hold';
        this.t = 0;
        this.caught = true;
        this.push = 1;
        this.fling(1.8);
        this.slaps.push(1);
        // (caught: it swings on with the speed it came up with)
        this.swingZ.v -= 1;
        this.swingX.v += (Math.random() - 0.5) * 2.4;
        this.fistY.v += 0.9;
      }
    } else if (this.phase === 'release') {
      const u = Math.min(1, this.t / SLIP);
      this.rig.position.lerpVectors(this.holdPos, this.to, u * u);
      this.rig.position.y += Math.sin(Math.PI * u) * 0.15;
      this.rig.quaternion.copy(this.holdQ);
      reach = 1;
      if (u >= 1) {
        this.splashed = true;
        this.clear();
        return;
      }
    } else {
      this.rig.position.copy(this.holdPos);
      this.rig.quaternion.copy(this.holdQ);
    }
    this.rig.updateMatrixWorld(true);
    this.placeLine(reach);
  }

  /** the line from the snout up out of the top of the view (once it is held, at the end of the haul) */
  private placeLine(reach: number): void {
    const ln = this.line;
    ln.visible = this.phase === 'hold' || (this.phase === 'haul' && reach > 0.6);
    if (!ln.visible) return;
    const d = tmpV2.subVectors(this.top, this.snout);
    const len = d.length();
    tmpQ.setFromUnitVectors(UP, d.multiplyScalar(1 / Math.max(1e-4, len)));
    ln.quaternion.copy(tmpQ);
    ln.position.copy(this.top).add(this.snout).multiplyScalar(0.5);
    ln.scale.set(0.0012, len, 0.0012);
  }

  /** drops flung off the body (render space), the more the harder it flops */
  private fling(k: number): void {
    const body = this.body;
    if (!body) return;
    const m = body.group.matrixWorld;
    for (const u of [0.08, 0.3, 0.55, 0.85]) {
      body.spineAt(u, spine);
      tmpV.set(spine.x, 0.05, spine.z).applyMatrix4(m);
      // (off its far side and up: away from the eye)
      tmpV2.set(Math.sin(spine.a), 0.55, -Math.cos(spine.a)).transformDirection(m);
      this.drops.fling(tmpV, tmpV2, Math.round((u < 0.2 ? 6 : 3) * k * (0.6 + this.len)), 0.9 + 0.5 * k);
    }
    this.drops.points.visible = true;
  }

  rebase(dx: number, dy: number, dz: number): void {
    this.drops.rebase(dx, dy, dz);
    this.from.x -= dx;
    this.from.y -= dy;
    this.from.z -= dz;
    this.to.x -= dx;
    this.to.y -= dy;
    this.to.z -= dz;
  }

  dispose(): void {
    this.clear();
    this.cyl.dispose();
    this.group.removeFromParent();
  }
}
