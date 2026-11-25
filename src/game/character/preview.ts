// Her preview page (character.html): she stands on a floor in the game's own light, frame and ink, playing a clip
// or holding the pose she was modelled in. Drag to turn round her, wheel to come closer. For the screenshot
// harness, window.__rt drives it (harness/shots/character.mjs).
//   ?clip=Idle|Walk|Run|… ?t=0.3 (seconds into it) ?pose=bind ?time=15.5 ?orbit=yaw,pitch,dist,targetH ?shot=1
//   ?quality=high|med|low ?weather=clear ?fp=1 (her arms seen from her own eyes)

import * as THREE from 'three';
import { Environment } from '../env/environment';
import { RenderCore, type Quality } from '../render/core';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, GLSL_VERTEX_MAIN, GLSL_VERTEX_PARS, globals } from '../render/shaderlib';
import { type ClipSet, loadClips } from './clips';
import { Animator, type Drive, handFrame } from './animator';
import { DressView } from './dressView';
import { WardrobeView } from './wardrobeView';
import { PATTERNS, type Pattern } from '../../core/character/wardrobe';
import { type HerRig, loadHer, toBindPose } from './her';

const DEG = Math.PI / 180;
const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const orbitArg = (q.get('orbit') ?? '20,8,3.2,0.95').split(',').map(Number);

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

class Preview {
  readonly core: RenderCore;
  readonly env: Environment;
  rig: HerRig | null = null;
  dress: DressView | null = null;
  wardrobe: WardrobeView | null = null;
  anim: Animator | null = null;
  /** what the test asks of her: ?act=stand|walk|run|strafe|crouch|crouchwalk|sit|jump */
  act = q.get('act');
  drive: Drive = { mode: 'foot', pos: new THREE.Vector3(), vel: new THREE.Vector3(), grounded: true, crouch: false, yaw: Math.PI / 2, pitch: 0, firstPerson: false };
  readonly wheelRoot = new THREE.Group();
  clips: ClipSet | null = null;
  mixer: THREE.AnimationMixer | null = null;
  action: THREE.AnimationAction | null = null;
  time = 0;
  orbit = { yaw: orbitArg[0] * DEG, pitch: orbitArg[1] * DEG, dist: orbitArg[2], target: orbitArg[3] };
  fp = q.get('fp') === '1';
  constructor(canvas: HTMLCanvasElement) {
    this.core = new RenderCore(canvas, (q.get('quality') ?? 'high') as Quality);
    const geo = new THREE.PlaneGeometry(400, 400, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(geo, floorMaterial());
    floor.frustumCulled = false;
    this.core.scene.add(floor);
    this.env = new Environment(this.core, 7, { hour: num('time', 15.5), weather: (q.get('weather') ?? 'clear') as never });
    this.env.clock.dayLength = 1e12;
    this.env.clock.setHour(num('time', 15.5), 0);
    this.env.shotMode = q.get('shot') === '1';
    this.core.camera.fov = num('fov', 40);
    this.core.camera.updateProjectionMatrix();
  }
  async load(): Promise<void> {
    this.rig = await loadHer();
    this.core.scene.add(this.rig.root);
    // ?clay=1: her skin as grey clay, for judging her forms
    // (?clay=2: flat magenta, her silhouette for measuring against the turnaround)
    if (q.get('clay') === '1' || q.get('clay') === '2') for (const m of [this.rig.skin, this.rig.arms.l.material as THREE.ShaderMaterial]) if (m.uniforms.uClay) m.uniforms.uClay.value = Number(q.get('clay'));
    this.clips = await loadClips(this.rig);
    this.mixer = new THREE.AnimationMixer(this.rig.root);
    if (this.act) {
      this.anim = new Animator(this.rig, this.clips);
      for (const o of (q.get('off') ?? '').split(',').filter(Boolean)) this.anim.off.add(o);
      this.setupAct(this.act);
    } else if (q.get('pose') === 'bind') toBindPose(this.rig);
    else this.play(q.get('clip') ?? 'Idle', num('t', 0));
    if (q.get('dress') !== '0') {
      this.dress = new DressView(this.rig, this.rig.parts, this.rig.meta, this.core.scene);
      // ?wear=down,pants_snow,boots,gloves,beanie,pack: clothes on her (in colours of their own)
      if (q.get('wear')) {
        const w = new WardrobeView(this.rig, this.dress);
        const colours: Record<string, [number, number]> = { down: [0xd9543a, 0x3a3f4a], jacket: [0x5a6b4a, 0x3a2f26], padded: [0x6b7f8f, 0x2a2f36], sweater: [0xc9b48f, 0x8a7a5a], pants: [0x3f4a5f, 0x2a2f36], pants_snow: [0x2f4f6f, 0x1f2f3f], boots: [0x5a3f2a, 0x2a1f18], shoes: [0x8a8a8a, 0x3a3a3a], gloves: [0x7a5a3a, 0x4a3a2a], gloves_ski: [0x2f3f5f, 0x8f2f2f], gloves_fingerless: [0x4a4a4a, 0x2a2a2a], beanie: [0xb03a3a, 0xe8e0d0], cap: [0x3a5a8a, 0xe8e0d0], trapper: [0x6a4a2a, 0xe8dcc8], pack: [0x6a5a3a, 0x3a2f20], pack_big: [0x3a5a4a, 0x2a2f2a] };
        const list = (q.get('wear') ?? '').split(',').filter((x) => x in PATTERNS) as Pattern[];
        w.set(list.map((pattern) => ({ slot: PATTERNS[pattern].slot, pattern, paint: colours[pattern]?.[0] ?? 0x888888, paint2: colours[pattern]?.[1] ?? 0x444444 })));
        this.wardrobe = w;
        this.drive.pos.y += w.sole;
      }
      // let her settle into what she is doing and the cloth fall, before the first picture
      for (let i = 0; i < 90; i++) {
        if (this.anim) this.anim.update(1 / 60, this.drive);
        this.dress.sitting = this.drive.mode === 'seat' || this.drive.crouch;
        this.dress.update(1 / 60);
      }
    }
  }
  /** A test of the animator: speeds, a crouch, a seat with a steering wheel in front of it. */
  setupAct(act: string): void {
    const d = this.drive;
    const speed = num('speed', act === 'run' ? 4.4 : act === 'walk' ? 1.4 : act === 'crouchwalk' ? 1.0 : act === 'strafe' ? 1.4 : 0);
    // she faces +z: the game's yaw for that is π/2
    d.yaw = Math.PI / 2;
    d.vel.set(0, 0, act === 'strafe' ? 0 : speed);
    if (act === 'strafe') { d.vel.set(speed, 0, 0); d.firstPerson = true; }
    d.crouch = act === 'crouch' || act === 'crouchwalk';
    d.ground = () => 0;
    if (act === 'sit') {
      d.mode = 'seat';
      d.seatYaw = Math.PI / 2;
      d.pos.set(0, 0.48, 0);
      d.floorY = 0.12;
      // a steering wheel 0.4 m ahead of her chest, tilted back 25°, radius 0.19
      const center = new THREE.Vector3(0, 0.98, 0.46);
      const normal = new THREE.Vector3(0, Math.sin(0.44), -Math.cos(0.44));
      const up = new THREE.Vector3(0, Math.cos(0.44), Math.sin(0.44));
      d.wheel = { center, normal, up, radius: 0.19, angle: num('steer', 0) };
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.016, 10, 48), new THREE.MeshBasicMaterial({ color: 0x222222 }));
      ring.position.copy(center);
      ring.lookAt(center.clone().add(normal));
      this.core.scene.add(ring);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.5), new THREE.MeshBasicMaterial({ color: 0x5a4636 }));
      seat.position.set(0, 0.43, -0.05);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.1), new THREE.MeshBasicMaterial({ color: 0x5a4636 }));
      back.position.set(0, 0.75, -0.27);
      back.rotation.x = -0.2;
      this.core.scene.add(seat, back);
    }
    if (act === 'jump') { d.grounded = false; d.vel.y = 2.0; }
    if (act === 'hands') {
      // both hands held up in front of her, palms in, in the grip asked for; the fine first-person arms drawn
      const grip = (q.get('grip') ?? 'relaxed') as never;
      const palm = q.get('palm') ?? 'in';
      const mk = (s: 'l' | 'r') => {
        const side = s === 'l' ? 1 : -1;
        const pos = new THREE.Vector3(side * num('hx', 0.11), num('hy', 1.2), num('hz', 0.3));
        const fingers = new THREE.Vector3(-side * 0.25, 0.55, 1).normalize();
        const palmDir = palm === 'down' ? new THREE.Vector3(0, -1, 0) : palm === 'up' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(-side, 0, 0);
        return { pos, rot: handFrame(s, fingers, palmDir, palmDir), grip, w: 1, pole: new THREE.Vector3(side * 0.6, -1, -0.2).normalize() };
      };
      d.hands = { l: mk('l'), r: mk('r') };
      if (q.get('one') === '1') {
        // the right hand alone, held out in front and to her right, its back up, fingers forward
        const r = d.hands.r!;
        r.pos.set(-0.2, 1.1, 0.34);
        r.rot = handFrame('r', new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -1, 0));
        r.pole = new THREE.Vector3(-1, -1, 0).normalize();
        d.hands.l = { ...d.hands.l!, w: 0 };
      }
      if (this.rig) {
        this.rig.arms.l.visible = this.rig.arms.r.visible = true;
        (this.rig.skin.uniforms.uHide.value as THREE.Vector4).set(q.get('fp') === '1' ? 1 : 0, 1, 1, 0);
        if (q.get('fp') === '1') {
          this.rig.hairMat.uniforms.uHide.value = 1;
          // (her eye is inside the helmet: from it neither the helmet nor the mask is drawn, as in the game)
          if (this.rig.helmet) this.rig.helmet.visible = false;
          if (this.rig.mask) this.rig.mask.visible = false;
        }
      }
    }
  }

  play(name: string, t = 0): void {
    if (!this.mixer || !this.clips) return;
    const clip = this.clips.clips[name];
    if (!clip) throw new Error(`no clip ${name}: ${Object.keys(this.clips.clips).join(', ')}`);
    this.mixer.stopAllAction();
    this.action = this.mixer.clipAction(clip);
    this.action.reset().play();
    this.action.time = t;
    this.mixer.update(0);
  }
  simulate(seconds: number): void {
    let left = seconds;
    do {
      const h = Math.min(1 / 30, left);
      this.time += h;
      if (this.anim) this.anim.update(h, this.drive);
      else if (this.mixer && q.get('pose') !== 'bind') this.mixer.update(h);
      if (this.dress) this.dress.sitting = this.drive.mode === 'seat' || this.drive.crouch;
      this.dress?.update(h);
      this.wardrobe?.update(false);
      left -= h;
    } while (left > 1e-9);
    this.update(seconds);
  }
  update(dt: number): void {
    const core = this.core, env = this.env, cam = core.camera;
    env.update(dt, this.time, 0, 0, 0, null, 0, 0, 0);
    const ob = this.orbit;
    // (?tz=: the point looked at is that far in front of her)
    const at = new THREE.Vector3(num('tx', 0), ob.target, num('tz', 0));
    const ch = Math.cos(ob.pitch);
    // yaw 0 in front of her (she faces +z), + round to her left
    cam.position.set(at.x + Math.sin(ob.yaw) * ch * ob.dist, ob.target + Math.sin(ob.pitch) * ob.dist, at.z + Math.cos(ob.yaw) * ch * ob.dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(at);
    cam.updateMatrixWorld(true);
    env.camX = cam.position.x + core.origin.x;
    env.camZ = cam.position.z + core.origin.z;
    core.shadowFocus.set(0, 0.9, 0);
  }
  render(): void {
    if (this.env.shotMode) this.env.prepareShot();
    this.core.render(this.time);
  }
}

async function main(): Promise<void> {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const p = new Preview(canvas);
  const rt = {
    ready: false,
    preview: p,
    render: () => p.render(),
    simulate: (s: number) => p.simulate(s),
    setOrbit: (yaw: number, pitch: number, dist: number, targetH = p.orbit.target) => {
      Object.assign(p.orbit, { yaw: yaw * DEG, pitch: pitch * DEG, dist, target: targetH });
      p.simulate(0);
    },
    setHour: (h: number) => { p.env.clock.setHour(h, p.time); p.simulate(0); },
    play: (name: string, t = 0) => { p.play(name, t); p.simulate(0); },
    bindPose: () => { if (p.rig) toBindPose(p.rig); p.mixer?.stopAllAction(); p.simulate(0); },
    clipNames: () => Object.keys(p.clips?.clips ?? {}),
    bones: (names: string[]) => Object.fromEntries(names.map((n) => {
      const b = p.rig!.bones[n];
      const w = b.getWorldPosition(new THREE.Vector3());
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()));
      return [n, { p: w.toArray().map((v) => +v.toFixed(3)), y: up.toArray().map((v) => +v.toFixed(2)) }];
    })),
    debug: () => p.anim?.debug,
    telemetry: () => ({ calls: p.core.stats.calls, tris: p.rig ? (p.rig.body.geometry.index!.count / 3) : 0 }),
  };
  (window as unknown as { __rt: typeof rt }).__rt = rt;
  await p.load();
  if (q.get('shot') === '1') {
    p.simulate(0);
    p.render();
    rt.ready = true;
    return;
  }
  let drag: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', () => (drag = null));
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    p.orbit.yaw -= (e.clientX - drag.x) * 0.006;
    p.orbit.pitch = Math.max(-0.4, Math.min(1.2, p.orbit.pitch + (e.clientY - drag.y) * 0.004));
    drag = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('wheel', (e) => { p.orbit.dist = Math.max(0.3, Math.min(12, p.orbit.dist * Math.exp(e.deltaY * 0.001))); });
  window.addEventListener('keydown', (e) => {
    const names = rt.clipNames();
    if (e.key === 'n' || e.key === 'p') {
      const cur = p.action?.getClip().name ?? names[0];
      const i = (names.indexOf(cur) + (e.key === 'n' ? 1 : names.length - 1)) % names.length;
      p.play(names[i]);
    }
    if (e.key === 'b') rt.bindPose();
  });
  let last = performance.now();
  const loop = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    p.simulate(dt);
    p.render();
    requestAnimationFrame(loop);
  };
  rt.ready = true;
  loop();
}

main().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;position:fixed;top:8px;left:8px">${String(e)}</pre>`);
});
