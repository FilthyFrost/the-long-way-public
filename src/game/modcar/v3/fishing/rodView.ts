/**
 * The rod in the angler's hands, the line from its tip, the float on the water and the ring that shows where a cast
 * will land (docs/V3/plan/fishing-feel.md §4, the first step: the rod the fight's hero, as DREADMOOR has it).
 *
 * A long, stout rod held at the bottom right of the view by hands that are not drawn (none are until the character
 * model is made: docs/V3/plan/fishing-feel.md §6), a reel under its seat whose handle turns as one winds; the rod
 * reaches up and across the view. With a fish on it bends toward the line — the tip's third most —
 * the more the line is strained, to a C with its tip pointing at the fish when the strain is at the top; pulled over
 * against a run, the whole rod swings across the view, lying almost flat on the left, standing on the right. It is a
 * spring: it nods back when the strain lets go, the strike throws it up, the fish's turns and runs yank it toward
 * the water. The line sags when slack, runs straight when taut and shivers near the breaking point. The float bobs,
 * ticks down at a nibble and is pulled under at the bite.
 */
import * as THREE from 'three';
import { surfaceMaterial } from '../../../render/materials';
import { Spring } from './shake';

/** rings along the blank, sides round it, and the grip's rings (the butt cap, the rear grip, the reel seat, the fore grip) */
const SEG = 30;
const SIDES = 14;
/** what a ring of the grip is: rubber, the two corks of its bands, the seat's gunmetal, its threads, brass trim */
const G_CAP = 0;
const G_CORK = 1;
const G_CORK2 = 2;
const G_SEAT = 3;
const G_THREAD = 4;
const G_TRIM = 5;
/** each kind's colour and gloss (the lacquer's stripe on it) */
const GRIP_LOOK: readonly (readonly [number, number])[] = [
  [0x2b2d31, 0.25],
  [0xc39b64, 0.06],
  [0xb28854, 0.06],
  [0x3d4249, 1],
  [0x202328, 0.5],
  [0xd1ad5c, 1.3],
];
/**
 * The grip's rings along the rod from the right hand (m), their radius (m) and kind: a rubber butt cap and a brass
 * ring, the rear grip in bands of cork swelling under the palm, the reel seat's threaded hood and barrel between brass
 * rings, the fore grip tapering to the blank, and the winding check
 */
function gripProfile(): (readonly [number, number, number])[] {
  const g: (readonly [number, number, number])[] = [];
  g.push([-0.247, 0.009, G_CAP], [-0.243, 0.0195, G_CAP], [-0.228, 0.021, G_CAP], [-0.225, 0.0218, G_TRIM], [-0.219, 0.0218, G_TRIM]);
  for (let i = 0; i <= 14; i++) {
    const u = i / 14;
    g.push([-0.216 + u * 0.24, 0.0193 + 0.0028 * Math.sin(Math.PI * u), i % 2 ? G_CORK2 : G_CORK]);
  }
  g.push([0.028, 0.0188, G_TRIM], [0.033, 0.0188, G_TRIM]);
  for (let i = 0; i < 6; i++) g.push([0.037 + i * 0.004, i % 2 ? 0.0166 : 0.0172, i % 2 ? G_THREAD : G_SEAT]);
  g.push([0.062, 0.0158, G_SEAT], [0.1, 0.0158, G_SEAT], [0.104, 0.0168, G_TRIM], [0.112, 0.0168, G_TRIM]);
  for (let i = 0; i <= 7; i++) {
    const u = i / 7;
    g.push([0.117 + u * 0.125, 0.0182 - 0.0028 * u, i % 2 ? G_CORK2 : G_CORK]);
  }
  g.push([0.246, 0.0142, G_TRIM], [0.256, 0.0136, G_TRIM]);
  return g;
}
const GRIP = gripProfile();
/** the line's guides along the blank (its share of the way out), their rings' radius and how high their feet stand (m); the last the tip-top */
const GUIDES: readonly (readonly [number, number, number])[] = [
  [0.1, 0.0125, 0.026],
  [0.25, 0.0095, 0.019],
  [0.39, 0.0075, 0.015],
  [0.52, 0.0062, 0.012],
  [0.63, 0.0053, 0.01],
  [0.73, 0.0046, 0.0085],
  [0.82, 0.004, 0.0072],
  [0.9, 0.0036, 0.006],
  [0.96, 0.0033, 0.0052],
  [1, 0.003, 0],
];
const LINE_PTS = 40;
/** the blank's length beyond the fore grip (m), where it begins along the rod from the hand */
const BLANK = 3.0;
const BLANK0 = 0.27;
/** how the bend gathers toward the tip (the tip's third bends most) */
const TAPER = 2.2;
/** the reel: where along the rod from the hand, how far under it, its radius, the handle's reach */
const REEL_AT = 0.075;
const REEL_DROP = 0.058;
const REEL_R = 0.043;
const CRANK = 0.034;

export interface RodPose {
  /** 0 … 1 drawn back while charging */
  charge: number;
  /** seconds since the cast (the flick), Infinity when none */
  sinceCast: number;
  /** the line's tension, 0 … 1.2 */
  tension: number;
  /** where the line goes to (render space), or null: the line hangs from the tip */
  to: THREE.Vector3 | null;
  /** the float in the air: its arc's height share (0 on the water) */
  air: number;
  /** a fish on: the tip twitches with its pull */
  fight: boolean;
  /** the rod's colours: blank, grip */
  blank: number;
  /** no cast out: the float hangs from the tip */
  dangle: boolean;
  /** no line (the catch is held up) */
  hide: boolean;
  /** the rod pulled over against a fish, −1 to the left … 1 to the right (docs/V3/plan/fishing-fight.md §4) */
  steer: number;
  /** the reel winding: 0 still … 1 as fast as it goes (its handle turns) */
  reel: number;
  /** a fish on: how hard it pulls now (a share of the rod's power), the way it swims across (−1 to the left … 1),
   * how hard it thrashes (0 … 1: shakes of its head, hard strokes), and its tail's stroke (rad): the tug-of-war */
  pull: number;
  fishDir: number;
  thrash: number;
  beat: number;
  /** its stamina, 1 fresh … 0 spent (a fresh fish keeps the rod trembling) */
  stamina: number;
}

/** the rod's keyed poses in the camera's frame: where the right hand holds it, and which way it reaches (unit) */
const HOLD_REST = new THREE.Vector3(0.25, -0.215, -0.4);
const DIR_REST = new THREE.Vector3(-0.14, 0.44, -0.89).normalize();
const HOLD_FIGHT = new THREE.Vector3(0.16, -0.2, -0.39);
const DIR_FIGHT = new THREE.Vector3(-0.42, 0.48, -0.77).normalize();
// (pulled over, it sweeps the whole width of the view, as DREADMOOR's does: nearly flat across the water on the left,
// swung out past the right edge on the right)
const HOLD_LEFT = new THREE.Vector3(0.0, -0.21, -0.38);
const DIR_LEFT = new THREE.Vector3(-0.86, 0.24, -0.46).normalize();
const HOLD_RIGHT = new THREE.Vector3(0.33, -0.2, -0.42);
const DIR_RIGHT = new THREE.Vector3(0.74, 0.42, -0.52).normalize();
/** the elbows, below the view */

/** the tangent of half the view's height on foot (68°): the poses above are for it */
const TAN_FOOT = Math.tan((68 * Math.PI) / 360);

const CAM_UP = new THREE.Vector3(0, 1, 0);

export class RodView {
  readonly group = new THREE.Group();
  private readonly rodGeo = new THREE.BufferGeometry();
  private readonly lineGeo = new THREE.BufferGeometry();
  private readonly floatGeo: THREE.BufferGeometry;
  readonly float: THREE.Mesh;
  readonly ring: THREE.Mesh;
  private readonly rodMesh: THREE.Mesh;
  private readonly lineMesh: THREE.Mesh;
  private readonly rodPos: Float32Array;
  private readonly rodCol: Float32Array;
  private readonly linePos = new Float32Array(LINE_PTS * 2 * 3);
  /** each ring's own colour and gloss: the shading and the lacquer's stripe are laid over them each frame */
  private readonly ringRGB: Float32Array;
  private readonly ringGloss: Float32Array;
  /** the guides on their feet, their thread wraps and gold trims; the line run up from the reel through them */
  private readonly guides: THREE.InstancedMesh;
  private readonly feet: THREE.InstancedMesh;
  private readonly wraps: THREE.InstancedMesh;
  private readonly trims: THREE.InstancedMesh;
  private readonly guideAt: THREE.Vector3[] = GUIDES.map(() => new THREE.Vector3());
  private readonly runGeo = new THREE.BufferGeometry();
  private readonly runPos = new Float32Array((GUIDES.length + 2) * 2 * 3);
  private readonly runPts: THREE.Vector3[] = Array.from({ length: GUIDES.length + 2 }, () => new THREE.Vector3());
  private readonly runMesh: THREE.Mesh;
  private readonly m4 = new THREE.Matrix4();
  private readonly gv: THREE.Vector3[] = Array.from({ length: 6 }, () => new THREE.Vector3());
  private readonly lightL = new THREE.Vector3();
  private readonly lightH = new THREE.Vector3();
  readonly tip = new THREE.Vector3();
  private readonly pts: THREE.Vector3[] = [];
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private blankColour = -1;
  // ---- the reel
  private readonly reel = new THREE.Group();
  private readonly handle = new THREE.Group();
  private crank = 0;
  // ---- the springs: the bend at the tip, the strike's throw up, the fish's yank toward the water, the swing across
  private readonly bend = new Spring(140, 11);
  private readonly kick = new Spring(90, 9);
  private readonly yank = new Spring(70, 8);
  private readonly swing = new Spring(60, 13);
  // ---- the tug-of-war (docs/V3/plan/fishing-feel.md §7): the rod across the view where the hands pull it and the fish
  // drags it back, late and overshooting; the tip whipped aside by shakes of its head (the bend's plane turned, rad)
  private readonly sway = new Spring(46, 6.2);
  private readonly flick = new Spring(150, 8);
  private shakeT = 0;
  private dice = 0x2545f491;
  /** a shake of the fish's head snatching the whole rod toward it (rad), every half second or so */
  private readonly snatchS = new Spring(120, 10);
  /** the tip's last span whipped on its own at the strike, quick and ringing (rad at the tip, + toward the line) */
  private readonly tipWhip = new Spring(300, 7);
  private snatchT = 0.3;
  /** where the line went last frame (render space): the bend's plane is toward it */
  private readonly lastTo = new THREE.Vector3();
  private hadTo = false;
  // ---- the frame's own vectors (camera space, then render space)
  private readonly hold = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly bendDir = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly camUp = new THREE.Vector3();
  /** scratch vectors for the frame (the line has its own points) */
  private readonly sv: THREE.Vector3[] = Array.from({ length: 2 }, () => new THREE.Vector3());
  private readonly m3 = new THREE.Matrix4();
  private readonly xs = new Float32Array(SEG + 1);
  private readonly ys = new Float32Array(SEG + 1);
  private readonly ths = new Float32Array(SEG + 1);

  constructor() {
    // the rod: the grip's rings, then the blank's (SEG + 1), one mesh of vertex colours, its positions rewritten each frame
    const rings = GRIP.length + SEG + 1;
    this.rodPos = new Float32Array(rings * SIDES * 3 + 2 * 3);
    this.rodCol = new Float32Array(this.rodPos.length);
    this.ringRGB = new Float32Array(rings * 3);
    this.ringGloss = new Float32Array(rings);
    this.rodGeo.setAttribute('position', new THREE.BufferAttribute(this.rodPos, 3));
    this.rodGeo.setAttribute('color', new THREE.BufferAttribute(this.rodCol, 3));
    const idx: number[] = [];
    for (let i = 0; i < rings - 1; i++)
      for (let k = 0; k < SIDES; k++) {
        const a = i * SIDES + k;
        const b = i * SIDES + ((k + 1) % SIDES);
        idx.push(a, a + SIDES, b + SIDES, a, b + SIDES, b);
      }
    // the butt's cap and the tip's, two fans
    const capA = rings * SIDES;
    const capB = capA + 1;
    for (let k = 0; k < SIDES; k++) {
      idx.push(capA, k, (k + 1) % SIDES);
      const t = (rings - 1) * SIDES;
      idx.push(capB, t + ((k + 1) % SIDES), t + k);
    }
    this.rodGeo.setIndex(idx);
    this.rodMesh = new THREE.Mesh(this.rodGeo, surfaceMaterial({ vertexColors: true, ink: true, spec: 0.5, fog: false }));
    this.rodMesh.frustumCulled = false;
    this.group.add(this.rodMesh);
    // the reel: gunmetal side plates ringed in brass, a spool wound full of line between them on three pillars, a hub
    // nut and a drag knob, its foot and clamp up to the seat; a counterweighted handle with a turned wooden knob
    const metal = surfaceMaterial({ color: 0x3c4148, ink: true, spec: 0.9, fog: false });
    const brass = surfaceMaterial({ color: 0xcfa851, ink: true, spec: 1, fog: false });
    const wound = surfaceMaterial({ color: 0x9db39a, ink: true, spec: 0.25, fog: false });
    const dark = surfaceMaterial({ color: 0x1f2226, ink: true, spec: 0.5, fog: false });
    const wood = surfaceMaterial({ color: 0x6b4126, ink: true, spec: 0.45, fog: false });
    const across = (g: THREE.BufferGeometry, x: number): THREE.BufferGeometry => g.rotateZ(Math.PI / 2).translate(x, 0, 0);
    const parts: THREE.Mesh[] = [
      new THREE.Mesh(across(new THREE.CylinderGeometry(REEL_R, REEL_R, 0.005, 36), 0.0175), metal),
      new THREE.Mesh(across(new THREE.CylinderGeometry(REEL_R, REEL_R, 0.005, 36), -0.0175), metal),
      new THREE.Mesh(new THREE.TorusGeometry(REEL_R, 0.0021, 6, 40).rotateY(Math.PI / 2).translate(0.0205, 0, 0), brass),
      new THREE.Mesh(new THREE.TorusGeometry(REEL_R, 0.0021, 6, 40).rotateY(Math.PI / 2).translate(-0.0205, 0, 0), brass),
      new THREE.Mesh(across(new THREE.CylinderGeometry(REEL_R * 0.8, REEL_R * 0.8, 0.03, 32), 0), wound),
      new THREE.Mesh(across(new THREE.CylinderGeometry(0.011, 0.011, 0.005, 20), 0.022), brass),
      new THREE.Mesh(across(new THREE.CylinderGeometry(0.012, 0.0135, 0.008, 12), -0.024), dark),
      new THREE.Mesh(new THREE.BoxGeometry(0.01, REEL_DROP, 0.026).translate(0, REEL_DROP / 2, 0), metal),
      new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.004, 0.05).translate(0, REEL_DROP - 0.004, 0), metal),
    ];
    for (const a of [0.5, 2.6, 4.4]) parts.push(new THREE.Mesh(across(new THREE.CylinderGeometry(0.0024, 0.0024, 0.035, 8), 0).translate(0, Math.cos(a) * REEL_R * 0.92, Math.sin(a) * REEL_R * 0.92), brass));
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.005, CRANK * 1.6, 0.011).translate(0.026, CRANK * 0.3, 0), brass);
    const weight = new THREE.Mesh(across(new THREE.CylinderGeometry(0.0075, 0.0075, 0.006, 14), 0.026).translate(0, -CRANK * 0.5, 0), brass);
    const knob = new THREE.Mesh(across(new THREE.CylinderGeometry(0.0085, 0.0072, 0.026, 14), 0.041).translate(0, CRANK, 0), wood);
    const knobCap = new THREE.Mesh(across(new THREE.CylinderGeometry(0.0055, 0.0055, 0.003, 12), 0.0555).translate(0, CRANK, 0), brass);
    for (const m of [...parts, arm, weight, knob, knobCap]) {
      m.frustumCulled = false;
      m.userData.ownLook = true;
    }
    this.handle.add(arm, weight, knob, knobCap);
    this.reel.add(...parts, this.handle);
    this.group.add(this.reel);
    // the guides: a dark chrome ring on a foot, square across the line, a thread wrap round the blank under each
    // (gold-trimmed at its ends), one more wrap above the grip
    const chrome = surfaceMaterial({ color: 0x2c3036, ink: true, spec: 1, fog: false });
    this.guides = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.17, 6, 18), chrome, GUIDES.length);
    this.feet = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), chrome, GUIDES.length);
    this.wraps = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 14, 1, true), surfaceMaterial({ color: 0x7a1f24, ink: true, spec: 0.6, fog: false }), GUIDES.length + 1);
    this.trims = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 14, 1, true), surfaceMaterial({ color: 0xd9b45a, ink: true, spec: 1, fog: false }), (GUIDES.length + 1) * 2);
    for (const im of [this.guides, this.feet, this.wraps, this.trims]) {
      im.frustumCulled = false;
      im.userData.ownLook = true;
      this.group.add(im);
    }
    // the line from the reel up through the guides to the tip: a thin ribbon facing the eye
    this.runGeo.setAttribute('position', new THREE.BufferAttribute(this.runPos, 3));
    const ri: number[] = [];
    for (let i = 0; i < GUIDES.length + 1; i++) ri.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2);
    this.runGeo.setIndex(ri);
    this.runMesh = new THREE.Mesh(this.runGeo, surfaceMaterial({ color: 0x262c33, emissive: 0x1d232a, emissiveIntensity: 0.5, fog: false, side: THREE.DoubleSide }));
    this.runMesh.frustumCulled = false;
    this.runMesh.renderOrder = 20;
    this.group.add(this.runMesh);
    // the line: a ribbon facing the eye
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    const li: number[] = [];
    for (let i = 0; i < LINE_PTS - 1; i++) li.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2);
    this.lineGeo.setIndex(li);
    this.lineMesh = new THREE.Mesh(this.lineGeo, surfaceMaterial({ color: 0x262c33, emissive: 0x1d232a, emissiveIntensity: 0.5, fog: false, side: THREE.DoubleSide }));
    this.lineMesh.frustumCulled = false;
    this.lineMesh.renderOrder = 20;
    this.group.add(this.lineMesh);
    for (let i = 0; i < LINE_PTS; i++) this.pts.push(new THREE.Vector3());
    // the float: a red cap over a white belly with a stalk
    this.floatGeo = floatGeometry();
    this.float = new THREE.Mesh(this.floatGeo, surfaceMaterial({ vertexColors: true, ink: true, spec: 0.6 }));
    this.float.frustumCulled = false;
    this.group.add(this.float);
    // the landing ring: a thin ring on the water
    const rg = new THREE.RingGeometry(0.42, 0.55, 40);
    rg.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(rg, surfaceMaterial({ color: 0xfff2c8, emissive: 0xffe9a8, emissiveIntensity: 0.9, opacity: 0.75, fog: false, side: THREE.DoubleSide }));
    this.ring.frustumCulled = false;
    this.ring.renderOrder = 21;
    this.ring.visible = false;
    this.group.add(this.ring);
  }

  /** how far over the rod is across the view now (−1 the left … 1 the right, with the fish's tug in it) */
  get swayNow(): number {
    return this.sway.x;
  }

  /**
   * The strike, the fish taking it (the user's word of 2026-11-24): the rod snatched hard round toward the fish, the
   * hands thrown forward and down after it, bowed deep, its tip whipped down toward the water and ringing back; k how
   * big the fish (0.3 … 1.6)
   */
  strike(k = 1): void {
    this.snatchS.v += 2.5 + 3 * k;
    this.kick.v -= 1.5 + 2 * k;
    this.yank.v += 2.5 + 3 * k;
    this.bend.v += 8 + 10 * k;
    this.tipWhip.v += 4 + 8 * k;
    this.flick.v += (this.rand() < 0.5 ? -1 : 1) * 5 * k;
  }

  /** the line parted: the rod springs back straight and up */
  snap(): void {
    this.bend.v -= 16;
    this.kick.v += 4;
  }

  /** the fish yanks the rod toward the water (a turn, a run, a leap): k 0 … 1; a turn snatches it across too (its new way) */
  jerk(k: number, across = 0): void {
    this.yank.v += 5 * k;
    this.bend.v += 10 * k;
    this.sway.v += 4.5 * k * across;
  }

  /** a thrash at the surface: the whole rod snatched hard toward the fish, its tip whipped aside, its bend kicked deep */
  burst(k: number): void {
    this.snatchS.v += 5.5 * k;
    this.flick.v += (this.rand() < 0.5 ? -1 : 1) * 12 * k;
    this.bend.v += 14 * k;
    this.yank.v += 4 * k;
  }

  /** the rod's own dice (xorshift), apart from the game's */
  private rand(): number {
    let x = this.dice | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.dice = x >>> 0;
    return this.dice / 4294967296;
  }

  private paintRod(blank: number): void {
    if (blank === this.blankColour) return;
    this.blankColour = blank;
    const c = new THREE.Color(blank);
    const tipC = c.clone().lerp(new THREE.Color(0xf2e6c8), 0.12);
    const cap = new THREE.Color(GRIP_LOOK[G_CAP][0]);
    const col = this.rodCol;
    const cc = new THREE.Color();
    const put = (ring: number, from: THREE.Color, gloss: number): void => {
      this.ringRGB[ring * 3] = from.r;
      this.ringRGB[ring * 3 + 1] = from.g;
      this.ringRGB[ring * 3 + 2] = from.b;
      this.ringGloss[ring] = gloss;
    };
    for (let i = 0; i < GRIP.length; i++) put(i, cc.setHex(GRIP_LOOK[GRIP[i][2]][0]), GRIP_LOOK[GRIP[i][2]][1]);
    for (let i = 0; i <= SEG; i++) {
      const s = i / SEG;
      // (the blank deeper at the butt, lighter up toward its tip, the tip's last span lighter still)
      put(GRIP.length + i, s > 0.95 ? tipC : cc.copy(c).multiplyScalar(0.86 + 0.18 * s), 0.9);
    }
    const caps = (GRIP.length + SEG + 1) * SIDES * 3;
    col[caps] = cap.r;
    col[caps + 1] = cap.g;
    col[caps + 2] = cap.b;
    col[caps + 3] = tipC.r;
    col[caps + 4] = tipC.g;
    col[caps + 5] = tipC.b;
    (this.rodGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** place the rod by the camera (render space), bend it, run the line, set the float */
  update(cam: THREE.PerspectiveCamera, pose: RodPose, time: number, dt: number, floatAt: THREE.Vector3 | null, floatDip: number): void {
    this.paintRod(pose.blank);
    cam.updateMatrixWorld();
    const m = cam.matrixWorld;
    // ---- where the right hand holds it and which way it reaches (the camera's frame)
    const flick = pose.sinceCast < 0.4 ? Math.sin((pose.sinceCast / 0.4) * Math.PI) : 0;
    const c = Math.min(1, Math.max(0, pose.charge));
    const wind = c * c * (3 - 2 * c);
    const shake = c > 0.92 ? (Math.sin(time * 41) * 0.03 * (c - 0.92)) / 0.08 : 0;
    // (on a narrow screen the hands come in toward the middle)
    const narrow = Math.min(1, cam.aspect / 1.5);
    const fightK = this.swing.step(dt, pose.fight ? 1 : 0);
    // the tug-of-war: pulled over by the hands one way, dragged back by the fish the way it swims — the harder it pulls
    // the further, surging with each stroke of its tail; the rod gets there late and swings past
    // (even a small fish is felt: it tugs the rod with every stroke, and the hands never hold it quite still)
    const stroke = Math.sin(pose.beat);
    const th = pose.fight ? pose.thrash : 0;
    const tug = pose.fight ? pose.fishDir * (0.1 + 0.42 * Math.min(1.3, pose.pull)) * (1 + 0.6 * stroke * Math.max(0.35, th)) : 0;
    const wander = th * (0.16 * Math.sin(time * 3.1 + 1.3 * Math.sin(time * 1.1)) + 0.1 * Math.sin(time * 7.3 + 2));
    const st = this.sway.step(dt, Math.max(-1.12, Math.min(1.12, pose.steer + tug + wander)));
    // shakes of its head: the tip whipped aside, the rod snatched down
    this.shakeT -= dt;
    if (pose.fight && pose.thrash > 0.05 && this.shakeT <= 0) {
      const k = pose.thrash * (0.45 + 0.55 * this.rand());
      this.shakeT = (0.1 + 0.32 * this.rand()) / (0.35 + pose.thrash);
      this.flick.v += (this.rand() < 0.5 ? -1 : 1) * 9 * k;
      this.bend.v += 6 * k;
      this.yank.v += 2.2 * k;
      this.sway.v += (this.rand() - 0.5) * 2.4 * k;
    }
    const whip = this.flick.step(dt, 0);
    this.snatchT -= dt;
    if (pose.fight && th > 0.1 && this.snatchT <= 0) {
      this.snatchT = (0.4 + 0.5 * this.rand()) / (0.55 + 0.6 * th);
      this.snatchS.v += (3 + 1.9 * this.rand()) * (0.6 + 0.8 * th);
      this.bend.v += 5 * th;
    }
    const snatch = this.snatchS.step(dt, 0);
    const hold = this.hold.copy(HOLD_REST).lerp(HOLD_FIGHT, fightK);
    const dir = this.dir.copy(DIR_REST).lerp(DIR_FIGHT, fightK);
    if (st < 0) {
      const k = -st * fightK;
      hold.lerp(HOLD_LEFT, k);
      dir.lerp(DIR_LEFT, k);
    } else if (st > 0) {
      const k = st * fightK;
      hold.lerp(HOLD_RIGHT, k);
      dir.lerp(DIR_RIGHT, k);
    }
    hold.x *= narrow;
    // (the view narrowed in a fight, kernel/heldUse.ts look().fov: the rod and the hands kept where they are on the screen)
    const fk = Math.tan((cam.fov * Math.PI) / 360) / TAN_FOOT;
    hold.x *= fk;
    hold.y *= fk;
    // (wound back over the shoulder with the charge, a tremble at the full, whipped forward on the cast)
    hold.x += wind * 0.05;
    hold.y += wind * 0.1;
    hold.z += wind * 0.06;
    dir.x += wind * 0.14 + shake;
    dir.y += wind * 1.6 - flick * 0.75;
    dir.z += wind * 0.72;
    dir.x *= fk;
    dir.y *= fk;
    dir.normalize();
    // (the strike throws it up, the hands with it toward the eye; the fish yanks it down toward the water, and keeps
    // dragging it down as it pulls, a surge with each stroke of its tail)
    const kx = this.kick.step(dt, 0);
    const drag = pose.fight ? (0.05 + 0.22 * Math.min(1.3, pose.pull)) * (1 + 0.6 * stroke * Math.max(0.35, th)) : 0;
    const up = kx - this.yank.step(dt, drag) * 0.5;
    hold.y += kx * 0.22;
    hold.z += kx * 0.12;
    if (up !== 0) {
      this.tmp.crossVectors(dir, CAM_UP).normalize();
      dir.applyAxisAngle(this.tmp, up * 0.5).normalize();
    }
    // (a fish on keeps the rod trembling in the hands, the fresher the more)
    if (pose.fight) {
      // (a slow shudder of the whole rod and a fast tremble on it)
      const jit = 0.045 * th * (0.4 + 0.6 * Math.max(0, pose.stamina));
      dir.x += jit * (Math.sin(time * 5.3) * 0.5 + Math.sin(time * 19.7) * 0.3 + Math.sin(time * 31.3 + 2) * 0.2);
      dir.y += jit * (Math.sin(time * 4.1 + 1) * 0.5 + Math.sin(time * 23.9 + 1) * 0.3 + Math.sin(time * 37.1) * 0.2);
      dir.normalize();
    }
    // a little sway in the hands; the rod nodding with each turn of the reel's handle as it winds
    hold.x += Math.sin(time * 1.3) * 0.004;
    hold.y += Math.sin(time * 0.9 + 1) * 0.004 + 0.004 * pose.reel * Math.sin(this.crank);
    hold.applyMatrix4(m);
    dir.transformDirection(m);
    const camUp = this.camUp.copy(CAM_UP).transformDirection(m);
    // (a shake of its head snatches the whole rod round toward it, 4 to 10 degrees, and lets it back)
    const pullTo = pose.to ?? (this.hadTo && pose.fight ? this.lastTo : null);
    if (pose.fight && pullTo && Math.abs(snatch) > 1e-4) {
      const toL = this.tmp.subVectors(pullTo, hold).normalize();
      const ax = this.tmp2.crossVectors(dir, toL);
      if (ax.lengthSq() > 1e-8) dir.applyAxisAngle(ax.normalize(), snatch).normalize();
    }
    // ---- the bend: in the plane of the rod and the line, toward the line, the more the more it is strained
    const tension = Math.max(0, pose.tension);
    const bendDir = this.bendDir;
    let target = 0.06;
    const to = pose.to;
    if (to) {
      this.lastTo.copy(to);
      this.hadTo = true;
    }
    const toward = to ?? (this.hadTo && pose.fight ? this.lastTo : null);
    const tip0 = this.tmp.copy(hold).addScaledVector(dir, BLANK0 + BLANK * 0.92);
    if (toward) {
      bendDir.subVectors(toward, tip0).normalize();
      const along = bendDir.dot(dir);
      const phi = Math.acos(Math.max(-1, Math.min(1, along)));
      bendDir.addScaledVector(dir, -along);
      if (bendDir.lengthSq() < 1e-6) bendDir.copy(camUp).multiplyScalar(-1).addScaledVector(dir, dir.dot(camUp));
      bendDir.normalize();
      // the share of the angle to the line the tip comes round: a slack line a little, the top of the strain nearly all
      const T = Math.min(1, tension / 0.95);
      const share = 0.08 + 0.86 * T * T * (3 - 2 * T);
      // (it bows deeper with each stroke of the fish's tail, and quivers under the strain)
      target = phi * share * (1 + 0.2 * stroke * th) + (pose.fight ? 0.08 * tension * Math.sin(time * 31) : 0);
    } else {
      // (nothing on the line: it droops a touch under its own weight)
      bendDir.copy(camUp).multiplyScalar(-1).addScaledVector(dir, dir.dot(camUp)).normalize();
    }
    // (the bend's plane turned: the tip whipped aside by a shake of the fish's head, shivering out of its plane when strained)
    const twist = whip + (pose.fight ? Math.max(0, tension - 0.4) * 0.2 * Math.sin(time * 43 + 1) : 0);
    if (twist !== 0) bendDir.applyAxisAngle(dir, twist);
    const theta = Math.max(-0.4, Math.min(2.9, this.bend.step(dt, target)));
    // (the strike's whip, in the tip's last third)
    const tw = Math.max(-0.7, Math.min(1.3, this.tipWhip.step(dt, 0)));
    // the blank's centre line, integrated out from the fore grip: its angle from the rod's line grows as the s^TAPER
    const xs = this.xs;
    const ys = this.ys;
    const ths = this.ths;
    xs[0] = 0;
    ys[0] = 0;
    ths[0] = 0;
    for (let i = 1; i <= SEG; i++) {
      const s = i / SEG;
      const sm = (i - 0.5) / SEG;
      const am = theta * Math.pow(sm, TAPER) + tw * Math.pow(sm, 5);
      ths[i] = theta * Math.pow(s, TAPER) + tw * Math.pow(s, 5);
      xs[i] = xs[i - 1] + (Math.cos(am) * BLANK) / SEG;
      ys[i] = ys[i - 1] + (Math.sin(am) * BLANK) / SEG;
    }
    const normal = this.normal.crossVectors(dir, bendDir).normalize();
    const pos = this.rodPos;
    // (a light from up and to the left behind the eye, whatever the sun: the rod's shading and its lacquer's stripe —
    // a bright line running down it and round its bend, brass and gunmetal brighter, cork none, in its bands)
    const col = this.rodCol;
    const rgb = this.ringRGB;
    const gls = this.ringGloss;
    const L = this.lightL.set(-0.35, 0.8, 0.5).transformDirection(m);
    const H = this.lightH.set(0, 0, 1).transformDirection(m).add(L).normalize();
    const ringAt = (ri: number, cx: number, cy: number, cz: number, tx: number, ty: number, tz: number, r: number): void => {
      // the ring's two axes: the bend's normal, and the one in the bend's plane across the rod (t × normal)
      const ax = ty * normal.z - tz * normal.y;
      const ay = tz * normal.x - tx * normal.z;
      const az = tx * normal.y - ty * normal.x;
      const br = rgb[ri * 3];
      const bgr = rgb[ri * 3 + 1];
      const bb = rgb[ri * 3 + 2];
      const gl = gls[ri];
      for (let k = 0; k < SIDES; k++) {
        const a = (k / SIDES) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const nx = ax * ca + normal.x * sa;
        const ny = ay * ca + normal.y * sa;
        const nz = az * ca + normal.z * sa;
        const o = (ri * SIDES + k) * 3;
        pos[o] = cx + nx * r;
        pos[o + 1] = cy + ny * r;
        pos[o + 2] = cz + nz * r;
        const lam = Math.max(0, nx * L.x + ny * L.y + nz * L.z);
        const hv = nx * H.x + ny * H.y + nz * H.z;
        // (the stripe wide enough to span a few of the ring's sides: one clean line, not a sparkle on a corner)
        // (bright enough to stay over the cel shading's steps all along: one solid line, not dashes)
        const e = Math.max(0, Math.min(1, (hv - 0.6) / 0.3));
        const hi = gl * 0.65 * e * e * (3 - 2 * e);
        const sh = 0.68 + 0.32 * lam;
        col[o] = Math.min(1, br * sh + hi);
        col[o + 1] = Math.min(1, bgr * sh + hi);
        col[o + 2] = Math.min(1, bb * sh + hi);
      }
    };
    for (let i = 0; i < GRIP.length; i++) {
      const [d, r] = GRIP[i];
      ringAt(i, hold.x + dir.x * d, hold.y + dir.y * d, hold.z + dir.z * d, dir.x, dir.y, dir.z, r);
    }
    const b0x = hold.x + dir.x * BLANK0;
    const b0y = hold.y + dir.y * BLANK0;
    const b0z = hold.z + dir.z * BLANK0;
    for (let i = 0; i <= SEG; i++) {
      const s = i / SEG;
      const ct = Math.cos(ths[i]);
      const stt = Math.sin(ths[i]);
      const tx = dir.x * ct + bendDir.x * stt;
      const ty = dir.y * ct + bendDir.y * stt;
      const tz = dir.z * ct + bendDir.z * stt;
      const cx = b0x + dir.x * xs[i] + bendDir.x * ys[i];
      const cy = b0y + dir.y * xs[i] + bendDir.y * ys[i];
      const cz = b0z + dir.z * xs[i] + bendDir.z * ys[i];
      ringAt(GRIP.length + i, cx, cy, cz, tx, ty, tz, 0.0125 * (1 - s) + 0.0026);
      if (i === SEG) this.tip.set(cx, cy, cz);
    }
    // ---- the guides, on their feet on the line's side of the blank (the inside of its bend, below it slack), each a
    // ring square across the line; the thread wraps under them, gold-trimmed; one more wrap above the grip
    {
      const [t, l, lt, va, vb, vc] = this.gv;
      let w = 0;
      for (let g = 0; g <= GUIDES.length; g++) {
        const s = g < GUIDES.length ? GUIDES[g][0] : 0.012;
        const f = Math.min(SEG - 1e-6, s * SEG);
        const i0 = Math.floor(f);
        const u = f - i0;
        const x = xs[i0] + (xs[i0 + 1] - xs[i0]) * u;
        const y = ys[i0] + (ys[i0 + 1] - ys[i0]) * u;
        const th = ths[i0] + (ths[i0 + 1] - ths[i0]) * u;
        const ct = Math.cos(th);
        const sth = Math.sin(th);
        t.set(dir.x * ct + bendDir.x * sth, dir.y * ct + bendDir.y * sth, dir.z * ct + bendDir.z * sth);
        l.set(bendDir.x * ct - dir.x * sth, bendDir.y * ct - dir.y * sth, bendDir.z * ct - dir.z * sth);
        lt.crossVectors(l, t);
        const cx = b0x + dir.x * x + bendDir.x * y;
        const cy = b0y + dir.y * x + bendDir.y * y;
        const cz = b0z + dir.z * x + bendDir.z * y;
        const rb = 0.0125 * (1 - s) + 0.0026;
        const big = g < GUIDES.length ? GUIDES[g][1] : 0.025;
        const wl = 0.012 + 0.9 * big;
        const rw = rb + 0.0009;
        this.m4.makeBasis(va.copy(l).multiplyScalar(rw), vb.copy(t).multiplyScalar(wl), vc.copy(lt).multiplyScalar(rw)).setPosition(cx, cy, cz);
        this.wraps.setMatrixAt(g, this.m4);
        for (const e of [-0.5, 0.5]) {
          const rt = rb + 0.0012;
          this.m4.makeBasis(va.copy(l).multiplyScalar(rt), vb.copy(t).multiplyScalar(0.0024), vc.copy(lt).multiplyScalar(rt)).setPosition(cx + t.x * e * wl, cy + t.y * e * wl, cz + t.z * e * wl);
          this.trims.setMatrixAt(w++, this.m4);
        }
        if (g === GUIDES.length) break;
        const [, rg, so] = GUIDES[g];
        this.m4.makeBasis(va.copy(lt).multiplyScalar(0.0016), vb.copy(l).multiplyScalar(Math.max(1e-4, so)), vc.copy(t).multiplyScalar(0.013)).setPosition(cx + l.x * rb, cy + l.y * rb, cz + l.z * rb);
        this.feet.setMatrixAt(g, this.m4);
        const off = rb + so + rg;
        const gp = this.guideAt[g].set(cx + l.x * off, cy + l.y * off, cz + l.z * off);
        this.m4.makeBasis(va.copy(l).multiplyScalar(rg), vb.crossVectors(t, l).multiplyScalar(rg), vc.copy(t).multiplyScalar(rg)).setPosition(gp.x, gp.y, gp.z);
        this.guides.setMatrixAt(g, this.m4);
      }
      for (const im of [this.guides, this.feet, this.wraps, this.trims]) im.instanceMatrix.needsUpdate = true;
    }
    // (the caps: the butt's end, the tip's end)
    const capA = (GRIP.length + SEG + 1) * SIDES * 3;
    pos[capA] = hold.x + dir.x * (GRIP[0][0] - 0.004);
    pos[capA + 1] = hold.y + dir.y * (GRIP[0][0] - 0.004);
    pos[capA + 2] = hold.z + dir.z * (GRIP[0][0] - 0.004);
    pos[capA + 3] = this.tip.x;
    pos[capA + 4] = this.tip.y;
    pos[capA + 5] = this.tip.z;
    (this.rodGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.rodGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    this.rodGeo.computeVertexNormals();
    // ---- the reel under the seat, its face to the left; the handle cranked round as the reel winds
    const below = this.tmp2.copy(camUp).addScaledVector(dir, -dir.dot(camUp)).normalize().multiplyScalar(-1);
    const axis = this.side.crossVectors(below, dir).normalize();
    // (its face toward the left of the view)
    this.tmp.set(-1, 0, 0).transformDirection(m);
    if (axis.dot(this.tmp) < 0) axis.multiplyScalar(-1);
    const yAx = this.tmp.copy(below).multiplyScalar(-1);
    const zAx = this.sv[0].crossVectors(axis, yAx).normalize();
    this.m3.makeBasis(axis, yAx, zAx);
    this.reel.quaternion.setFromRotationMatrix(this.m3);
    this.reel.position.copy(hold).addScaledVector(dir, REEL_AT).addScaledVector(yAx, -REEL_DROP);
    this.crank += dt * pose.reel * 2.6 * Math.PI * 2;
    this.handle.rotation.x = -this.crank;
    this.reel.updateMatrixWorld(true);
    // ---- the line run from the top of the reel's spool up through every guide to the tip
    {
      const pts = this.runPts;
      pts[0].copy(this.reel.position).addScaledVector(yAx, REEL_R * 0.8);
      for (let g = 0; g < GUIDES.length; g++) pts[g + 1].copy(this.guideAt[g]);
      pts[GUIDES.length + 1].copy(this.tip);
      const rp = this.runPos;
      const n = pts.length;
      const [tg, sd] = this.gv;
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        tg.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
        sd.subVectors(cam.position, p).cross(tg).normalize();
        const w = 0.0007;
        rp[i * 6] = p.x + sd.x * w;
        rp[i * 6 + 1] = p.y + sd.y * w;
        rp[i * 6 + 2] = p.z + sd.z * w;
        rp[i * 6 + 3] = p.x - sd.x * w;
        rp[i * 6 + 4] = p.y - sd.y * w;
        rp[i * 6 + 5] = p.z - sd.z * w;
      }
      (this.runGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      this.runMesh.visible = !pose.hide;
    }
    // ---- the line
    const tip = this.tip;
    const lineTo = pose.to ?? this.tmp2.copy(tip).add(new THREE.Vector3(0.02 * Math.sin(time * 1.1), -0.55, 0.02 * Math.cos(time * 0.8)));
    const span = tip.distanceTo(lineTo);
    // (a fish on: the line ruler-straight while the rod is loaded, a touch of sag only as the strain falls right off)
    const sag = pose.to ? (pose.fight ? 0.01 + span * 0.012 * Math.max(0, 1 - tension * 2) : Math.max(0.02, span * (0.09 * (1 - Math.min(1, tension * 1.4)) + 0.004))) : 0.01;
    // (near the breaking point it shivers)
    const shiver = pose.fight ? Math.max(0, tension - 0.72) * 0.012 * span : 0;
    for (let i = 0; i < LINE_PTS; i++) {
      const t = i / (LINE_PTS - 1);
      const p = this.pts[i];
      p.lerpVectors(tip, lineTo, t);
      p.y -= sag * 4 * t * (1 - t) - pose.air * 4 * t * (1 - t) * Math.min(6, span * 0.25);
      if (shiver > 0) p.addScaledVector(camUp, shiver * Math.sin(time * 97 + t * 9) * Math.sin(Math.PI * t));
    }
    const lp = this.linePos;
    for (let i = 0; i < LINE_PTS; i++) {
      const p = this.pts[i];
      const q = this.pts[Math.min(LINE_PTS - 1, i + 1)];
      const r = this.pts[Math.max(0, i - 1)];
      this.tmp.subVectors(q, r).normalize();
      this.side.subVectors(cam.position, p).cross(this.tmp).normalize();
      const w = Math.max(0.0011, cam.position.distanceTo(p) * 0.0016);
      lp[i * 6] = p.x + this.side.x * w;
      lp[i * 6 + 1] = p.y + this.side.y * w;
      lp[i * 6 + 2] = p.z + this.side.z * w;
      lp[i * 6 + 3] = p.x - this.side.x * w;
      lp[i * 6 + 4] = p.y - this.side.y * w;
      lp[i * 6 + 5] = p.z - this.side.z * w;
    }
    (this.lineGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.lineMesh.visible = !pose.hide;
    // (near parting the line glows red, pulsing the faster the nearer: DREADMOOR's warning)
    const danger = pose.fight ? Math.max(0, Math.min(1, (tension - 0.5) / 0.4)) : 0;
    const glow = danger > 0 ? danger * (0.7 + 0.3 * Math.sin(time * (10 + 14 * danger))) : 0;
    for (const lm of [this.lineMesh.material, this.runMesh.material] as THREE.ShaderMaterial[]) {
      (lm.uniforms.uColor.value as THREE.Color).setRGB(0.149 + 0.85 * glow, 0.173 - 0.02 * glow, 0.2 - 0.08 * glow);
      (lm.uniforms.uEmissive.value as THREE.Color).setRGB(0.057 + 1.3 * glow, 0.069 + 0.1 * glow, 0.082);
    }
    // ---- the float (hanging from the tip when nothing is cast)
    if (!floatAt && pose.dangle) floatAt = this.tmp.copy(lineTo).add(new THREE.Vector3(0, -0.05, 0));
    if (floatAt) {
      this.float.visible = true;
      this.float.position.copy(floatAt);
      const bob = Math.sin(time * 2.1) * 0.012 + Math.sin(time * 3.7) * 0.006;
      this.float.position.y += bob - floatDip * 0.09;
      this.float.rotation.z = Math.sin(time * 1.7) * 0.08 + floatDip * 0.3;
      this.float.scale.setScalar(pose.dangle && !pose.to ? 0.8 : Math.max(1, cam.position.distanceTo(floatAt) * 0.06));
    } else this.float.visible = false;
  }

  /** the ring where a cast at this charge lands (render space), or none */
  showRing(at: THREE.Vector3 | null, time: number, colour = 0xfff2c8): void {
    if (!at) {
      this.ring.visible = false;
      return;
    }
    this.ring.visible = true;
    this.ring.position.copy(at);
    this.ring.position.y += 0.04;
    const k = 1 + 0.08 * Math.sin(time * 8);
    this.ring.scale.set(k, 1, k);
    ((this.ring.material as THREE.ShaderMaterial).uniforms.uColor.value as THREE.Color).setHex(colour);
  }

  dispose(): void {
    this.runGeo.dispose();
    for (const im of [this.guides, this.feet, this.wraps, this.trims]) im.geometry.dispose();
    this.rodGeo.dispose();
    this.lineGeo.dispose();
    this.floatGeo.dispose();
    this.reel.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}

function floatGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const red = [0.86, 0.16, 0.12];
  const white = [0.95, 0.94, 0.9];
  const seg = 12;
  const ring = 8;
  for (let j = 0; j <= ring; j++) {
    const ph = (j / ring) * Math.PI;
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      const y = Math.cos(ph);
      const r = Math.sin(ph);
      pos.push(Math.cos(th) * r * 0.035, y * 0.045 + 0.01, Math.sin(th) * r * 0.035);
      const c = y > 0.05 ? red : y > -0.1 ? [0.1, 0.1, 0.1] : white;
      col.push(c[0], c[1], c[2]);
    }
  }
  for (let j = 0; j < ring; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + seg + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  // the stalk
  const s0 = pos.length / 3;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    pos.push(Math.cos(a) * 0.004, 0.05, Math.sin(a) * 0.004);
    col.push(red[0], red[1], red[2]);
    pos.push(Math.cos(a) * 0.003, 0.11, Math.sin(a) * 0.003);
    col.push(0.98, 0.95, 0.3);
  }
  for (let k = 0; k < 4; k++) {
    const a = s0 + k * 2;
    const b = s0 + ((k + 1) % 4) * 2;
    idx.push(a, a + 1, b + 1, a, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
