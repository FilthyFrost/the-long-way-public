// Her actions, to look at (actions.html): every movement the animator gives her (standing, walking, running,
// sprinting, sideways, crouched, jumping), at the wheel of a car and on a motorcycle (steered and leant, by hand or
// on their own), a can held and lifted, her hands in every grip, and each raw clip of the animation library — in
// the game's own light and ink, her helmet on, in the clothes chosen, from outside or from her own eyes.
// Drag to turn round her (from her eyes: to look round), the wheel to come closer.
//
// Packed into one HTML file by tools/character/pack_viewer.mjs: her mesh file and the clips then come inline
// (window.__HER_ASSETS__, data URLs) and the page opens from disk without a server.

import * as THREE from 'three';
import { Environment } from '../env/environment';
import { RenderCore } from '../render/core';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, GLSL_VERTEX_MAIN, GLSL_VERTEX_PARS, globals } from '../render/shaderlib';
import { type ClipSet, loadClips } from './clips';
import { Animator, type Drive, type HandTarget, handFrame } from './animator';
import { DressView } from './dressView';
import { WardrobeView } from './wardrobeView';
import { PATTERNS, type Pattern } from '../../core/character/wardrobe';
import { type HerRig, loadHer, toBindPose } from './her';
import type { GripName } from './hands';

const DEG = Math.PI / 180;
const asset = (p: string): string => (window as unknown as { __HER_ASSETS__?: Record<string, string> }).__HER_ASSETS__?.[p] ?? p;
const smooth = (x: number) => x * x * (3 - 2 * x);

function floorMaterial(): THREE.ShaderMaterial {
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
        vec3 base = mix(vec3(0.24, 0.29, 0.16), vec3(0.3, 0.36, 0.19), rtFbm(w, 9.0));
        vec2 g = abs(fract(w - 0.5) - 0.5);
        vec2 aa = fwidth(w) * 1.2;
        vec2 l = 1.0 - smoothstep(vec2(0.006) - aa, vec2(0.006) + aa, g);
        base = mix(base, base * 1.18, max(l.x, l.y) * 0.4);
        vec3 n = vec3(0.0, 1.0, 0.0);
        float sh = rtShadow(vPos, n);
        vec3 col = base * rtGroundLight(sh);
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

type Act = 'stand' | 'move' | 'strafe' | 'crouch' | 'crouchwalk' | 'jump' | 'car' | 'moto' | 'can' | 'hands';
/** what can be played: an act of the animator (a grip is the hands act), or a raw clip */
interface Item { id: string; label: string; kind: 'act' | 'clip'; act?: Act; speed?: number; grip?: GripName }

const MOVES: Item[] = [
  { id: 'stand', label: '站着', kind: 'act', act: 'stand' },
  { id: 'walk', label: '走路', kind: 'act', act: 'move', speed: 1.4 },
  { id: 'jog', label: '慢跑', kind: 'act', act: 'move', speed: 2.6 },
  { id: 'run', label: '跑步', kind: 'act', act: 'move', speed: 4.4 },
  { id: 'sprint', label: '冲刺', kind: 'act', act: 'move', speed: 6.0 },
  { id: 'strafe', label: '横着走', kind: 'act', act: 'strafe', speed: 1.4 },
  { id: 'crouch', label: '蹲下', kind: 'act', act: 'crouch' },
  { id: 'crouchwalk', label: '蹲着走', kind: 'act', act: 'crouchwalk', speed: 1.0 },
  { id: 'jump', label: '跳', kind: 'act', act: 'jump' },
];
const DRIVES: Item[] = [
  { id: 'car', label: '开车（握方向盘）', kind: 'act', act: 'car' },
  { id: 'moto', label: '骑摩托车', kind: 'act', act: 'moto' },
  { id: 'can', label: '拿着罐子', kind: 'act', act: 'can' },
];
const GRIP_NAMES: [GripName, string][] = [
  ['open', '张开'], ['relaxed', '放松'], ['loose', '半握'], ['fist', '握拳'], ['wheel', '握方向盘'], ['bar', '握把手'],
  ['bottle', '握瓶子'], ['cup', '端杯子'], ['pinch', '捏'], ['point', '指'], ['hook', '提东西'], ['flat', '手掌平放'],
  ['press', '按按钮'], ['phone', '拿手机'], ['ball', '托球'],
];
const GRIPS: Item[] = GRIP_NAMES.map(([g, l]) => ({ id: `grip_${g}`, label: l, kind: 'act', act: 'hands', grip: g }));
const OUTFITS: Record<string, { label: string; wear: Pattern[] }> = {
  dress: { label: '睡裙（初始）', wear: [] },
  down: { label: '羽绒服 + 雪裤 + 靴子 + 大背包', wear: ['down', 'pants_snow', 'boots', 'gloves_ski', 'pack_big'] },
  jacket: { label: '夹克 + 长裤 + 鞋', wear: ['jacket', 'pants', 'shoes'] },
  sweater: { label: '毛衣 + 长裤 + 半指手套 + 背包', wear: ['sweater', 'pants', 'shoes', 'gloves_fingerless', 'pack'] },
  padded: { label: '棉服 + 雪裤 + 靴子 + 手套', wear: ['padded', 'pants_snow', 'boots', 'gloves'] },
  pants: { label: '只穿长裤（睡裙上身留着）', wear: ['pants', 'shoes'] },
  jacketOnly: { label: '只穿夹克（下面是安全裤）', wear: ['jacket', 'shoes'] },
};
const COLOURS: Partial<Record<Pattern, [number, number]>> = { down: [0xd9543a, 0x3a3f4a], jacket: [0x5a6b4a, 0x3a2f26], padded: [0x6b7f8f, 0x2a2f36], sweater: [0xc9b48f, 0x8a7a5a], pants: [0x3f4a5f, 0x2a2f36], pants_snow: [0x2f4f6f, 0x1f2f3f], boots: [0x5a3f2a, 0x2a1f18], shoes: [0x8a8a8a, 0x3a3a3a], gloves: [0x7a5a3a, 0x4a3a2a], gloves_ski: [0x2f3f5f, 0x8f2f2f], gloves_fingerless: [0x4a4a4a, 0x2a2a2a], pack: [0x6a5a3a, 0x3a2f20], pack_big: [0x3a5a4a, 0x2a2f2a] };
/** the camera's places: yaw (deg, 0 in front of her, + round to her left), pitch (deg), distance, height looked at */
type Orbit = [number, number, number, number];
const CAMS: [string, Orbit][] = [
  ['全身', [25, 8, 3.4, 0.9]], ['正面', [0, 4, 3.0, 0.9]], ['侧面', [90, 4, 3.0, 0.9]], ['背面', [180, 6, 3.0, 0.9]],
  ['3/4', [-35, 12, 2.6, 1.0]], ['上半身', [20, 6, 1.5, 1.2]], ['手部特写', [15, 14, 0.85, 1.12]],
];
/** where the camera goes for an act when it is picked (none: it stays) */
const ACT_CAM: Partial<Record<Act, Orbit>> = { hands: [15, 14, 0.85, 1.12], can: [-30, 10, 1.1, 1.15], car: [-50, 12, 2.4, 0.85], moto: [-70, 10, 3.0, 0.9] };
/** from her eyes, how far down she looks at first */
const ACT_PITCH: Partial<Record<Act, number>> = { hands: -0.5, can: -0.35, car: -0.16, moto: -0.5, crouch: -0.2 };

// the car (she faces +z): the wheel's rim and its plane
const WHEEL_C = new THREE.Vector3(0, 0.95, 0.54);
const WHEEL_N = new THREE.Vector3(0, Math.sin(0.44), -Math.cos(0.44));
const WHEEL_UP = new THREE.Vector3(0, Math.cos(0.44), Math.sin(0.44));
// the motorcycle: the hip point on its seat, the bar (its middle and the head it turns about), the grips' half span
const MOTO_HIP = new THREE.Vector3(0, 0.84, -0.12);
const BAR_C = new THREE.Vector3(0, 1.0, 0.5);
const BAR_PIVOT = new THREE.Vector3(0, 1.0, 0.6);
const BAR_HALF = 0.306;
// the can, in her right hand at rest
const CAN_C = new THREE.Vector3(-0.16, 1.1, 0.32);

class Viewer {
  readonly core: RenderCore;
  readonly env: Environment;
  rig!: HerRig;
  clips!: ClipSet;
  dress!: DressView;
  wardrobe!: WardrobeView;
  anim: Animator | null = null;
  mixer!: THREE.AnimationMixer;
  readonly drive: Drive = { mode: 'foot', pos: new THREE.Vector3(), vel: new THREE.Vector3(), grounded: true, crouch: false, yaw: Math.PI / 2, pitch: 0, firstPerson: false };
  item: Item = MOVES[1];
  readonly props = new THREE.Group();
  readonly car = new THREE.Group();
  readonly moto = new THREE.Group();
  readonly wheel = new THREE.Group();
  readonly bar = new THREE.Group();
  readonly can = new THREE.Group();
  time = 0;
  /** time since the item was picked */
  t = 0;
  speed = 1;
  paused = false;
  /** steering (−1..1, + to her left) and the motorcycle's lean (rad, + her right side down); auto: they swing on their own */
  steer = 0;
  lean = 0;
  auto = true;
  /** the view: from outside (orbiting) or from her own eyes (where she looks: yaw off ahead, pitch) */
  firstPerson = false;
  look = { yaw: 0, pitch: 0 };
  readonly orbit = { yaw: 25 * DEG, pitch: 8 * DEG, dist: 3.4, target: 0.9 };
  readonly fpFov: number;
  private readonly eye = new THREE.Vector3();
  private eyeStarted = false;
  private pelvisBind = new THREE.Vector3();
  sole = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.core = new RenderCore(canvas, 'high');
    const geo = new THREE.PlaneGeometry(400, 400, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(geo, floorMaterial());
    floor.frustumCulled = false;
    this.core.scene.add(floor);
    this.env = new Environment(this.core, 7, { hour: 15.5, weather: 'clear' as never });
    this.env.clock.dayLength = 1e12;
    this.env.clock.setHour(15.5, 0);
    this.fpFov = this.core.camera.fov;
    this.core.camera.fov = 36;
    this.core.camera.updateProjectionMatrix();
    this.core.scene.add(this.props);
  }

  async load(onStep: (what: string) => void): Promise<void> {
    onStep('正在载入她的模型……');
    this.rig = await loadHer(asset('/models/character/her.bin'));
    this.core.scene.add(this.rig.root);
    onStep('正在载入动作……');
    this.clips = await loadClips(this.rig, asset('/models/character/pv-clips.glb'));
    this.mixer = new THREE.AnimationMixer(this.rig.root);
    this.pelvisBind.copy(this.rig.bones.pelvis.position);
    this.dress = new DressView(this.rig, this.rig.parts, this.rig.meta, this.core.scene);
    this.wardrobe = new WardrobeView(this.rig, this.dress);
    this.buildProps();
    this.choose(this.item);
  }

  /** the car's seat and wheel, the motorcycle, the can: simple stand-ins in flat colours */
  private buildProps(): void {
    const mat = (c: number) => new THREE.MeshBasicMaterial({ color: c });
    const box = (w: number, h: number, d: number, c: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
      m.position.set(x, y, z);
      return m;
    };
    // the car: a seat and its back, the floor her feet rest on, the wheel (a rim, three spokes) on its column
    const back = box(0.5, 0.6, 0.1, 0x5a4636, 0, 0.75, -0.27);
    back.rotation.x = -0.2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.016, 10, 48), mat(0x222222));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 20), mat(0x2c2c2c));
    hub.rotation.x = Math.PI / 2;
    const spokeL = box(0.15, 0.024, 0.012, 0x333333, 0.1, 0, 0);
    const spokeR = box(0.15, 0.024, 0.012, 0x333333, -0.1, 0, 0);
    const spokeD = box(0.024, 0.15, 0.012, 0x333333, 0, -0.1, 0);
    const mark = box(0.03, 0.03, 0.022, 0xd9543a, 0, 0.19, 0);
    this.wheel.add(rim, hub, spokeL, spokeR, spokeD, mark);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.42), mat(0x333333));
    column.position.copy(WHEEL_C).addScaledVector(WHEEL_N, -0.21);
    column.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), WHEEL_N);
    this.car.add(box(0.5, 0.1, 0.5, 0x5a4636, 0, 0.43, -0.05), back, box(0.7, 0.02, 0.55, 0x2e2a26, 0, 0.11, 0.4), this.wheel, column);
    // the motorcycle (she faces +z on it): tyres, frame, tank, seat, fork, the bar with its grips, foot pegs
    const m = this.moto;
    const tyre = (z: number) => {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.055, 10, 40), mat(0x1c1c1c));
      t.rotation.y = Math.PI / 2;
      t.position.set(0, 0.345, z);
      return t;
    };
    const red = mat(0xb8322a);
    const tank = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), red);
    tank.scale.set(0.95, 0.62, 1.4);
    tank.position.set(0, 0.88, 0.28);
    // the fork from the front axle up and back to the steering head
    const axle = new THREE.Vector3(0, 0.345, 0.86), head = new THREE.Vector3(0, 0.98, 0.6);
    const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, axle.distanceTo(head)), mat(0xc8ccd2));
    fork.position.copy(axle).add(head).multiplyScalar(0.5);
    fork.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), head.clone().sub(axle).normalize());
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 2 * BAR_HALF - 0.04), mat(0xc8ccd2));
    tube.rotation.z = Math.PI / 2;
    this.bar.add(tube);
    for (const s of [1, -1]) {
      // each grip sweeps back 20° (as the animator is told)
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.12, 16), mat(0x1c1c1c));
      grip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(s * 0.94, 0, -0.342));
      grip.position.set(s * BAR_HALF, 0, 0);
      this.bar.add(grip);
    }
    this.bar.position.copy(BAR_C);
    m.add(tyre(0.86), tyre(-0.62), tank, box(0.27, 0.07, 0.6, 0x4a3324, 0, 0.79, -0.2), box(0.2, 0.3, 0.95, 0x6f757d, 0, 0.56, 0), box(0.3, 0.025, 0.05, 0x8a8f96, 0, 0.44, -0.02), fork, this.bar);
    // the can
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 28), mat(0xe0702a));
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.033, 0.008, 28), mat(0xc8ccd2));
    lid.position.y = 0.064;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0335, 0.0335, 0.03, 28), mat(0xf2e6c8));
    this.can.add(body, lid, band);
    this.props.add(this.car, this.moto, this.can);
    for (const c of this.props.children) c.visible = false;
  }

  /** Play an item: an act (a fresh animator, the drive set for it), or a raw clip. */
  choose(item: Item): void {
    this.item = item;
    this.t = 0;
    const rig = this.rig, d = this.drive;
    // from a clean pose: the bones as modelled, no old animator still bound to them
    if (this.anim) { this.anim.mixer.stopAllAction(); this.anim.mixer.uncacheRoot(rig.root); this.anim = null; }
    this.mixer.stopAllAction();
    toBindPose(rig);
    rig.bones.pelvis.position.copy(this.pelvisBind);
    for (const c of this.props.children) c.visible = false;
    this.steer = 0;
    this.lean = 0;
    this.look.yaw = 0;
    this.look.pitch = ACT_PITCH[item.act ?? 'stand'] ?? -0.15;
    this.eyeStarted = false;
    if (item.kind === 'clip') {
      rig.root.position.set(0, this.sole, 0);
      rig.root.quaternion.identity();
      rig.root.updateMatrixWorld(true);
      this.mixer.clipAction(this.clips.clips[item.id]).reset().play();
      this.dress.sitting = /sit|crouch|kneel|lie|lay/i.test(item.id);
      this.firstPerson = false;
      return;
    }
    const act = item.act!;
    Object.assign(d, { mode: 'foot', grounded: true, crouch: false, yaw: Math.PI / 2, pitch: 0, firstPerson: false, seatYaw: undefined, floorY: undefined, wheel: undefined, bars: undefined, seatRoll: undefined, rollPivot: undefined, rollAxis: undefined, hands: undefined, throttle: undefined, brake: undefined });
    d.pos.set(0, this.sole, 0);
    d.vel.set(0, 0, 0);
    d.ground = () => this.sole;
    const sp = item.speed ?? 0;
    if (act === 'move') d.vel.set(0, 0, sp);
    if (act === 'strafe') d.vel.set(sp, 0, 0);
    if (act === 'crouch' || act === 'crouchwalk') { d.crouch = true; d.vel.set(0, 0, sp); }
    if (act === 'car') {
      d.mode = 'seat';
      d.seatYaw = Math.PI / 2;
      d.pos.set(0, 0.48, 0);
      d.floorY = 0.12;
      d.throttle = 0.3;
      this.car.visible = true;
    }
    if (act === 'moto') {
      d.mode = 'seat';
      d.seatYaw = Math.PI / 2;
      d.pos.copy(MOTO_HIP);
      d.floorY = 0;
      this.moto.visible = true;
    }
    if (act === 'hands') {
      // both hands held up in front of her, palms in, in the grip asked for
      const grip = item.grip ?? 'relaxed';
      const mk = (s: 'l' | 'r'): HandTarget => {
        const side = s === 'l' ? 1 : -1;
        const pos = new THREE.Vector3(side * 0.11, 1.2, 0.3);
        const fingers = new THREE.Vector3(-side * 0.25, 0.55, 1).normalize();
        const palm = new THREE.Vector3(-side, 0, 0);
        return { pos, rot: handFrame(s, fingers, palm, palm), grip, w: 1, pole: new THREE.Vector3(side * 0.6, -1, -0.2).normalize() };
      };
      d.hands = { l: mk('l'), r: mk('r') };
    }
    if (act === 'can') this.can.visible = true;
    this.anim = new Animator(rig, this.clips);
    this.applyLook();
    this.dress.sitting = d.mode === 'seat' || d.crouch;
  }

  /** the view's direction into the drive (from her eyes she looks where the view does; from outside, ahead) */
  private applyLook(): void {
    const d = this.drive;
    const act = this.item.act;
    d.firstPerson = this.firstPerson || act === 'strafe';
    d.yaw = Math.PI / 2 + (this.firstPerson ? this.look.yaw : 0);
    d.pitch = this.firstPerson ? this.look.pitch : 0;
  }

  /** the drive as the act asks this moment: the wheel turned, the motorcycle steered and leant, the can moved, a jump */
  private steerDrive(): void {
    const d = this.drive, t = this.t;
    const act = this.item.act;
    if (this.auto && (act === 'car' || act === 'moto')) {
      // a slow weave: left, right, and back
      this.steer = Math.sin(t * 0.55) * (act === 'car' ? 1 : 0.6);
      if (act === 'moto') this.lean = -this.steer * 0.5;
    }
    if (act === 'car') {
      const angle = this.steer * 2.4;
      d.wheel = { center: WHEEL_C, normal: WHEEL_N, up: WHEEL_UP, radius: 0.19, tube: 0.016, angle };
      this.wheel.position.copy(WHEEL_C);
      this.wheel.lookAt(WHEEL_C.clone().add(WHEEL_N));
      this.wheel.rotateZ(angle);
    }
    if (act === 'moto') {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.steer * 0.45);
      const grip = (s: number) => ({
        c: new THREE.Vector3(s * BAR_HALF, 0, 0).add(BAR_C).sub(BAR_PIVOT).applyQuaternion(q).add(BAR_PIVOT),
        out: new THREE.Vector3(s * 0.94, 0, -0.342).applyQuaternion(q),
      });
      d.bars = { l: grip(1), r: grip(-1) };
      d.seatRoll = this.lean;
      d.rollPivot = new THREE.Vector3(0, 0, 0);
      d.rollAxis = new THREE.Vector3(0, 0, 1);
      this.bar.position.copy(BAR_C).sub(BAR_PIVOT).applyQuaternion(q).add(BAR_PIVOT);
      this.bar.quaternion.copy(q);
      this.moto.quaternion.setFromAxisAngle(d.rollAxis, this.lean);
    }
    if (act === 'can') {
      // held at rest, now and then lifted up in front of her eyes and turned to be looked at, then lowered
      const ph = (t % 6) / 6;
      const up = ph < 0.25 ? 0 : ph < 0.45 ? smooth((ph - 0.25) / 0.2) : ph < 0.75 ? 1 : ph < 0.95 ? 1 - smooth((ph - 0.75) / 0.2) : 0;
      const c = CAN_C.clone().add(new THREE.Vector3(0.05 * up, 0.2 * up, 0.04 * up));
      const axis = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), -0.25 * up * Math.sin(Math.min(1, Math.max(0, (ph - 0.45) / 0.3)) * Math.PI)).normalize();
      this.can.position.copy(c);
      this.can.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
      // her right hand round its middle: the palm on its side, the fingers round its far side, the thumb round the near
      const r = 0.033, turn = 0.35;
      const side = new THREE.Vector3(-1, 0, 0), ahead = new THREE.Vector3(0, 0, 1);
      const fingers = ahead.clone().multiplyScalar(Math.cos(turn)).addScaledVector(side, -Math.sin(turn)).addScaledVector(axis, 0.1).normalize();
      const palm = side.clone().multiplyScalar(-Math.cos(turn)).addScaledVector(ahead, -Math.sin(turn)).normalize();
      const wrist = c.clone().addScaledVector(side, r + 0.0125).addScaledVector(axis, -0.012).addScaledVector(fingers, -0.06);
      d.hands = { r: { pos: wrist, rot: handFrame('r', fingers, palm, palm), grip: 'bottle', w: 1, pole: new THREE.Vector3(-0.5, -1, -0.2).normalize(), hold: { kind: 'cyl', c, axis, r } } };
    }
    if (act === 'jump') {
      // a jump in place every 1.8 s: up at 3 m/s, down again, landed and standing
      const v0 = 3.0, g = 9.8, air = (2 * v0) / g;
      const ph = t % 1.8;
      d.grounded = ph >= air;
      d.vel.y = d.grounded ? 0 : v0 - g * ph;
      d.pos.y = this.sole + (d.grounded ? 0 : Math.max(0, v0 * ph - 0.5 * g * ph * ph));
    }
  }

  /** what is drawn, as the game draws it: from her eyes the head and the helmet go and the finer arms come in place of
   *  the body's own (those begin a third of the way down the upper arm: seen from outside, their tops would show) */
  private applyView(): void {
    const rig = this.rig;
    const fp = this.firstPerson && this.item.kind === 'act';
    (rig.skin.uniforms.uHide.value as THREE.Vector4).set(fp ? 1 : 0, fp ? 1 : 0, fp ? 1 : 0, 0);
    rig.arms.l.visible = rig.arms.r.visible = fp;
    rig.hairMat.uniforms.uHide.value = fp ? 1 : 0;
    if (rig.mask) rig.mask.visible = !fp;
    if (rig.helmet) rig.helmet.visible = !fp;
    this.wardrobe.update(fp);
  }

  update(dt: number): void {
    const h = this.paused ? 0 : dt * this.speed;
    this.time += h;
    // (in steps no longer than a thirtieth of a second)
    let left = h;
    while (left > 1e-9) {
      const s = Math.min(1 / 30, left);
      this.t += s;
      if (this.item.kind === 'clip') this.mixer.update(s);
      else if (this.anim) {
        this.applyLook();
        this.steerDrive();
        this.anim.update(s, this.drive);
      }
      this.dress.update(s);
      left -= s;
    }
    this.applyView();
    const core = this.core, env = this.env, cam = core.camera;
    env.update(dt, this.time, 0, 0, 0, null, 0, 0, 0);
    if (this.firstPerson && this.item.kind === 'act') this.placeEye(dt);
    else {
      if (cam.fov !== 36) { cam.fov = 36; cam.updateProjectionMatrix(); }
      const ob = this.orbit;
      // (the camera rises with a jump, a little)
      const rise = this.item.act === 'jump' ? (this.drive.pos.y - this.sole) * 0.6 : 0;
      const at = new THREE.Vector3(0, ob.target + rise, 0);
      const ch = Math.cos(ob.pitch);
      cam.position.set(at.x + Math.sin(ob.yaw) * ch * ob.dist, ob.target + Math.sin(ob.pitch) * ob.dist, at.z + Math.cos(ob.yaw) * ch * ob.dist);
      cam.up.set(0, 1, 0);
      cam.lookAt(at);
    }
    cam.updateMatrixWorld(true);
    env.camX = cam.position.x + core.origin.x;
    env.camZ = cam.position.z + core.origin.z;
    core.shadowFocus.set(0, 0.9, 0);
    core.render(this.time);
  }

  /** the camera at her eye, looking where she looks (on foot her steps' bob smoothed out; on the motorcycle leant with it) */
  private placeEye(dt: number): void {
    const rig = this.rig, cam = this.core.camera, d = this.drive;
    if (cam.fov !== this.fpFov) { cam.fov = this.fpFov; cam.updateProjectionMatrix(); }
    const eye = rig.bones.Head.localToWorld(rig.eyeLocal.clone());
    if (!this.eyeStarted || d.mode === 'seat') { this.eye.copy(eye); this.eyeStarted = true; }
    else this.eye.lerp(eye, 1 - Math.exp(-Math.max(dt, 1e-4) / 0.1));
    cam.position.copy(this.eye);
    const cp = Math.cos(d.pitch);
    const dir = new THREE.Vector3(Math.cos(d.yaw) * cp, Math.sin(d.pitch), Math.sin(d.yaw) * cp);
    // (a rider's head stays nearer level than the machine: the view leans half as far)
    const up = new THREE.Vector3(0, 1, 0);
    if (this.item.act === 'moto') up.applyAxisAngle(new THREE.Vector3(0, 0, 1), this.lean * 0.5);
    cam.up.copy(up);
    cam.lookAt(this.eye.clone().add(dir));
  }

  wear(key: string): void {
    this.wardrobe.set(OUTFITS[key].wear.map((pattern) => ({ slot: PATTERNS[pattern].slot, pattern, paint: COLOURS[pattern]?.[0] ?? 0x888888, paint2: COLOURS[pattern]?.[1] ?? 0x444444 })));
    this.sole = this.wardrobe.sole;
  }
}

// ------------------------------------------------------------------------------------------------ the panel

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const k of kids) e.append(k);
  return e;
}

async function main(): Promise<void> {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const loading = document.getElementById('loading')!;
  const v = new Viewer(canvas);
  await v.load((what) => (loading.textContent = what));
  const panel = document.getElementById('panel')!;
  const now = document.getElementById('now')!;
  const buttons: [Item, HTMLButtonElement][] = [];
  const rows: Record<string, HTMLElement> = {};
  const all: Item[] = [];
  let tour = false, tourAt = 0;

  const setCam = (o: Orbit) => Object.assign(v.orbit, { yaw: o[0] * DEG, pitch: o[1] * DEG, dist: o[2], target: o[3] });
  const pick = (it: Item, keepCam = false) => {
    v.choose(it);
    for (const [i, b] of buttons) b.classList.toggle('on', i === it);
    const act = it.act;
    rows.steer.classList.toggle('hidden', act !== 'car' && act !== 'moto');
    rows.lean.classList.toggle('hidden', act !== 'moto');
    rows.auto.classList.toggle('hidden', act !== 'car' && act !== 'moto');
    viewBtns.fp.disabled = it.kind === 'clip';
    showView();
    const cam = act && ACT_CAM[act];
    if (cam && !keepCam) setCam(cam);
    else if (!keepCam && (it.kind === 'clip' || MOVES.includes(it))) setCam(CAMS[0][1]);
    tourAt = 0;
  };
  const group = (title: string, items: Item[], cls = '') => {
    panel.append(el('h2', { textContent: title }));
    const g = el('div', { className: 'grid' });
    for (const it of items) {
      const b = el('button', { textContent: it.label, className: cls, title: it.kind === 'clip' ? '动画库里的原始片段' : '' });
      b.onclick = () => { setTour(false); pick(it); };
      buttons.push([it, b]);
      all.push(it);
      g.append(b);
    }
    panel.append(g);
  };
  const slider = (key: string, label: string, min: number, max: number, step: number, value: number, on: (x: number) => void, fmt = (x: number) => x.toFixed(2)) => {
    const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
    const val = el('span', { className: 'val', textContent: fmt(value) });
    input.oninput = () => { const x = Number(input.value); val.textContent = fmt(x); on(x); };
    const row = el('div', { className: 'row' }, el('label', { textContent: label }), input, val);
    rows[key] = row;
    return { row, set: (x: number) => { input.value = String(x); val.textContent = fmt(x); } };
  };
  const check = (key: string, label: string, value: boolean, on: (x: boolean) => void) => {
    const input = el('input', { type: 'checkbox', checked: value });
    input.onchange = () => on(input.checked);
    const row = el('div', { className: 'row check' }, el('label', { className: 'wide' }, input, ` ${label}`));
    rows[key] = row;
    return { row, set: (x: boolean) => { input.checked = x; } };
  };

  panel.append(el('h1', { textContent: '她 · 动作查看器' }));
  // playing
  const pause = el('button', { textContent: '⏸ 暂停' });
  pause.onclick = () => { v.paused = !v.paused; pause.textContent = v.paused ? '▶ 播放' : '⏸ 暂停'; };
  const next = el('button', { textContent: '下一个 ▶▶' });
  next.onclick = () => { setTour(false); pick(all[(all.indexOf(v.item) + 1) % all.length]); };
  panel.append(el('div', { className: 'row' }, pause, next));
  const speed = slider('speed', '速度', 0.1, 2, 0.05, 1, (x) => (v.speed = x), (x) => `${x.toFixed(2)}×`);
  panel.append(speed.row);
  const tourBox = check('tour', '自动轮播全部动作（每个 6 秒）', false, (x) => setTour(x));
  const setTour = (x: boolean) => { tour = x; tourAt = 0; tourBox.set(x); };
  panel.append(tourBox.row);
  // the view
  panel.append(el('h2', { textContent: '视角' }));
  const viewBtns = { tp: el('button', { textContent: '第三人称' }), fp: el('button', { textContent: '第一人称（她的眼睛）' }) };
  const showView = () => {
    const fp = v.firstPerson && v.item.kind === 'act';
    viewBtns.tp.classList.toggle('on', !fp);
    viewBtns.fp.classList.toggle('on', fp);
    camGrid.classList.toggle('dim', fp);
  };
  viewBtns.tp.onclick = () => { v.firstPerson = false; showView(); };
  viewBtns.fp.onclick = () => { if (v.item.kind === 'clip') return; v.firstPerson = true; v.look.yaw = 0; v.look.pitch = ACT_PITCH[v.item.act!] ?? -0.15; showView(); };
  panel.append(el('div', { className: 'grid' }, viewBtns.tp, viewBtns.fp));
  const camGrid = el('div', { className: 'grid' });
  camGrid.style.marginTop = '6px';
  for (const [label, o] of CAMS) {
    const b = el('button', { textContent: label });
    b.onclick = () => { v.firstPerson = false; showView(); setCam(o); };
    camGrid.append(b);
  }
  panel.append(camGrid);
  // what she does
  group('移动', MOVES);
  group('驾驶 · 拿东西', DRIVES);
  const steer = slider('steer', '转向', -1, 1, 0.01, 0, (x) => { v.steer = x; v.auto = false; autoBox.set(false); });
  const lean = slider('lean', '侧倾', -0.6, 0.6, 0.01, 0, (x) => { v.lean = x; v.auto = false; autoBox.set(false); });
  const autoBox = check('auto', '自动转向 / 侧倾', true, (x) => (v.auto = x));
  panel.append(steer.row, lean.row, autoBox.row);
  group('手势（双手举在面前）', GRIPS);
  group('原始动画片段', Object.keys(v.clips.clips).sort().map((n) => ({ id: n, label: n, kind: 'clip' as const })), 'clip');
  // clothes, light
  panel.append(el('h2', { textContent: '衣服' }));
  const outfit = el('select');
  for (const [k, o] of Object.entries(OUTFITS)) outfit.append(el('option', { value: k, textContent: o.label }));
  outfit.onchange = () => { v.wear(outfit.value); pick(v.item, true); };
  panel.append(el('div', { className: 'row' }, outfit));
  panel.append(el('h2', { textContent: '光线' }));
  panel.append(slider('hour', '时间', 6, 19.5, 0.25, 15.5, (x) => v.env.clock.setHour(x, v.time), (x) => `${Math.floor(x)}:${String(Math.round((x % 1) * 60)).padStart(2, '0')}`).row);
  panel.append(el('div', { id: 'hint', innerHTML: '拖动画面：绕着她转（第一人称：转头看）<br>滚轮：拉近 / 拉远<br>空格：暂停 / 播放　→：下一个<br>F：切换第一 / 第三人称　H：收起面板' }));
  panel.classList.remove('hidden');
  loading.remove();
  const toggle = document.getElementById('toggle')!;
  toggle.classList.remove('hidden');
  toggle.onclick = () => panel.classList.toggle('hidden');
  pick(v.item);

  // the camera by hand
  let drag: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', () => (drag = null));
  canvas.addEventListener('pointercancel', () => (drag = null));
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag = { x: e.clientX, y: e.clientY };
    if (v.firstPerson && v.item.kind === 'act') {
      v.look.yaw = Math.max(-1.6, Math.min(1.6, v.look.yaw - dx * 0.004));
      v.look.pitch = Math.max(-1.25, Math.min(1.0, v.look.pitch - dy * 0.004));
      return;
    }
    v.orbit.yaw -= dx * 0.006;
    v.orbit.pitch = Math.max(-0.4, Math.min(1.3, v.orbit.pitch + dy * 0.004));
  });
  canvas.addEventListener('wheel', (e) => { v.orbit.dist = Math.max(0.4, Math.min(12, v.orbit.dist * Math.exp(e.deltaY * 0.001))); }, { passive: true });
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    // (a list or a slider keeps its own keys)
    if (target && (target.tagName === 'SELECT' || target.tagName === 'INPUT')) return;
    // (a button clicked last would take the space as a click of its own)
    if (target?.tagName === 'BUTTON') target.blur();
    if (e.code === 'Space') { e.preventDefault(); pause.click(); }
    if (e.code === 'ArrowRight') next.click();
    if (e.code === 'ArrowLeft') { setTour(false); pick(all[(all.indexOf(v.item) + all.length - 1) % all.length]); }
    if (e.code === 'KeyF') (v.firstPerson ? viewBtns.tp : viewBtns.fp).click();
    if (e.code === 'KeyH') panel.classList.toggle('hidden');
  });
  let last = performance.now();
  const loop = () => {
    const t = performance.now();
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    if (tour && !v.paused) {
      tourAt += dt;
      if (tourAt > 6) pick(all[(all.indexOf(v.item) + 1) % all.length]);
    }
    v.update(dt);
    // (the sliders show the steering and the lean as they swing on their own)
    if (v.auto && (v.item.act === 'car' || v.item.act === 'moto')) { steer.set(+v.steer.toFixed(2)); lean.set(+v.lean.toFixed(2)); }
    now.textContent = `正在播放：${v.item.label}${v.firstPerson && v.item.kind === 'act' ? '　·　第一人称' : ''}`;
    now.classList.remove('hidden');
    requestAnimationFrame(loop);
  };
  loop();
  (window as unknown as { __viewer: unknown }).__viewer = { v, pick: (id: string) => pick(all.find((i) => i.id === id)!), all };
}

main().catch((e) => {
  const l = document.getElementById('loading');
  if (l) l.textContent = `载入失败：${String(e)}`;
  console.error(e);
});
