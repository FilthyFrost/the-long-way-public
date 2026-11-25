// The head workbench (head.html): her head alone — skull, mask, hair — grown here in the page from the same code as
// her build (core/character/head.ts), drawn in the game's light and ink, so it can be set beside the turnaround
// (harness/shots/head_lab.mjs) a few numbers at a time. Seen as the turnaround draws her: a long lens, 1550 pixels to
// the metre at 800 pixels square (twice the drawing's 775), the middle of the frame 1.505 m up.
//   ?view=front|side|back|three ?bg=white ?mask=0 ?hair=0 ?h=0.0012 (the skull's grid) ?pose=0 (head upright in every view)

import * as THREE from 'three';
import { Environment } from '../env/environment';
import { RenderCore, type Quality } from '../render/core';
import { buildSkeleton, HER } from '../../core/character/skeleton';
import { headLocal, maskField, sculptHead } from '../../core/character/head';
import { compile } from '../../core/character/sdf';
import { fieldNormals, polygonize } from '../../core/character/polygonize';
import { hairMaterial, skinMaterial } from './material';
import { HAIR, growHairSolid } from '../../core/character/hairSdf';
import { growHelmet } from '../../core/character/helmet';
import { HEADWEAR } from '../../core/character/body';
import { helmetMaterial } from './helmetMaterial';
import { maskMaterial } from './maskMaterial';

const DEG = Math.PI / 180;
const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);

/** how each view sees her: the camera's turn round her (deg, 0 her front, - toward her right) and how she holds her
 * head there (the turnaround's side view has it bowed, its back view bowed and turned to her right) */
export const VIEWS: Record<string, { yaw: number; pitch: number; bow: number; turn: number; dy: number }> = {
  front: { yaw: 0, pitch: 1, bow: 0, turn: 0, dy: 0 },
  // (the drawing's side view bows her head and draws it a little higher than its front view does)
  side: { yaw: -90, pitch: 1, bow: 20, turn: 0, dy: 0.028 },
  back: { yaw: 180, pitch: 1, bow: 12, turn: -30, dy: 0.01 },
  three: { yaw: -35, pitch: 6, bow: 0, turn: 0, dy: 0 },
};
const PX_PER_M = 1550;
const FRAME = 800;
const MID_Y = 1.505;

class HeadLab {
  readonly core: RenderCore;
  readonly env: Environment;
  /** the head and all on it, turned about the Head joint for the view's pose */
  readonly head = new THREE.Group();
  readonly backdrop: THREE.Mesh;
  view = q.get('view') ?? 'front';
  stats: Record<string, number> = {};
  pivot = new THREE.Vector3();
  /** each mesh's points as built (the pose is laid on them afresh each view) and how much each follows the head (the neck less and less down to its root) */
  private readonly rest = new Map<THREE.Mesh, { p: Float32Array; n: Float32Array; w: Float32Array }>();
  private keep(mesh: THREE.Mesh, neckRoot: number): void {
    const g = mesh.geometry;
    const p = (g.attributes.position.array as Float32Array).slice();
    const n = (g.attributes.normal.array as Float32Array).slice();
    const w = new Float32Array(p.length / 3);
    for (let i = 0; i < w.length; i++) {
      const t = Math.min(1, Math.max(0, (p[i * 3 + 1] - neckRoot) / (this.pivot.y - neckRoot)));
      w[i] = t * t * (3 - 2 * t);
    }
    this.rest.set(mesh, { p, n, w });
  }

  constructor(canvas: HTMLCanvasElement) {
    this.core = new RenderCore(canvas, (q.get('quality') ?? 'high') as Quality);
    this.env = new Environment(this.core, 7, { hour: num('time', 15.5), weather: 'clear' as never });
    this.env.clock.dayLength = 1e12;
    this.env.clock.setHour(num('time', 15.5), 0);
    this.env.shotMode = q.get('shot') === '1';
    this.core.camera.fov = 2 * Math.atan(FRAME / PX_PER_M / 2 / 2.95) / DEG;
    this.core.camera.updateProjectionMatrix();
    // a white card behind her (its outline number 0, as the sky's: lines are drawn round her against it)
    const card = new THREE.ShaderMaterial({
      vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'void main() { gl_FragColor = vec4(1.0, 1.0, 1.0, 0.0); }',
    });
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), card);
    this.backdrop.visible = q.get('bg') === 'white';
    this.core.scene.add(this.backdrop);
    this.core.scene.add(this.head);
  }

  build(): void {
    const t0 = performance.now();
    const sk = buildSkeleton(HER);
    const hs = sculptHead(sk);
    const o = sk.bindPos[sk.index.Head];
    this.pivot.set(o[0], o[1], o[2]);
    // the skull and neck (only the neck under a helmet)
    const helmet = (q.get('helmet') ?? (HEADWEAR === 'helmet' ? '1' : '0')) === '1';
    const f = compile(helmet ? hs.neckOnly : hs.neckHead, 0.03);
    const h = num('h', 0.0012);
    const raw = polygonize(f, { h, min: [-0.13, o[1] - 0.14, o[2] - 0.15], max: [0.13, o[1] + 0.26, o[2] + 0.14], project: 3 });
    const pos = new Float32Array(raw.positions);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(fieldNormals(f, pos, h * 0.7), 3));
    const n = pos.length / 3;
    g.setAttribute('aSkin', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
    g.setAttribute('aFinger', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
    g.setAttribute('aRegion', new THREE.BufferAttribute(new Float32Array(n).fill(8), 1));
    g.setIndex(new THREE.BufferAttribute(raw.indices, 1));
    const skin = skinMaterial();
    (skin.uniforms.uHead.value as THREE.Vector3).set(o[0], o[1], o[2]);
    const skull = new THREE.Mesh(g, skin);
    skull.name = 'player:head';
    skull.frustumCulled = false;
    this.head.add(skull);
    const neckRoot = sk.bindPos[sk.index.neck_01][1];
    this.keep(skull, neckRoot);
    this.stats.skullTris = raw.indices.length / 3;
    // the helmet
    if (helmet) {
      const t1 = performance.now();
      const hm = growHelmet(hs, { h: num('hh', 0.0012) });
      const hg = new THREE.BufferGeometry();
      hg.setAttribute('position', new THREE.BufferAttribute(hm.positions, 3));
      hg.setAttribute('normal', new THREE.BufferAttribute(hm.normals, 3));
      hg.setAttribute('aHelmet', new THREE.BufferAttribute(hm.helmet, 4));
      hg.setIndex(new THREE.BufferAttribute(hm.indices, 1));
      const mesh = new THREE.Mesh(hg, helmetMaterial());
      mesh.name = 'player:helmet';
      mesh.frustumCulled = false;
      this.head.add(mesh);
      this.keep(mesh, sk.bindPos[sk.index.neck_01][1]);
      this.stats.helmetTris = hm.indices.length / 3;
      this.stats.helmetMs = Math.round(performance.now() - t1);
    }
    // the mask
    if (!helmet && q.get('mask') !== '0') {
      const mf = maskField(hs);
      const mh = 0.0009;
      const mraw = polygonize(mf, { h: mh, min: [-0.075, o[1] - 0.05, o[2] - 0.01], max: [0.075, o[1] + 0.12, o[2] + 0.12], project: 3 });
      const mpos = new Float32Array(mraw.positions);
      const mg = new THREE.BufferGeometry();
      mg.setAttribute('position', new THREE.BufferAttribute(mpos, 3));
      mg.setAttribute('normal', new THREE.BufferAttribute(fieldNormals(mf, mpos, mh * 0.7), 3));
      const uv = new Float32Array((mpos.length / 3) * 2);
      for (let i = 0; i < mpos.length / 3; i++) {
        const l = headLocal(hs, mpos, i * 3);
        uv[i * 2] = l[0];
        uv[i * 2 + 1] = l[1];
      }
      mg.setAttribute('aMask', new THREE.BufferAttribute(uv, 2));
      mg.setIndex(new THREE.BufferAttribute(mraw.indices, 1));
      const mask = new THREE.Mesh(mg, maskMaterial());
      mask.name = 'player:mask';
      mask.frustumCulled = false;
      this.head.add(mask);
      this.keep(mask, neckRoot);
      this.stats.maskTris = mraw.indices.length / 3;
    }
    // the hair
    if (!helmet && q.get('hair') !== '0') {
      const t1 = performance.now();
      const hm = growHairSolid(hs, sk.index.Head, { h: num('hh', 0.0012) });
      const hg = new THREE.BufferGeometry();
      hg.setAttribute('position', new THREE.BufferAttribute(hm.positions, 3));
      hg.setAttribute('normal', new THREE.BufferAttribute(hm.normals, 3));
      hg.setAttribute('aHair', new THREE.BufferAttribute(hm.hair, 4));
      hg.setIndex(new THREE.BufferAttribute(hm.indices, 1));
      const hmat = hairMaterial();
      (hmat.uniforms.uHead.value as THREE.Vector3).set(o[0], o[1], o[2]);
      hmat.uniforms.uClumps.value = HAIR.teeth.count;
      const hair = new THREE.Mesh(hg, hmat);
      hair.name = 'player:hair';
      hair.frustumCulled = false;
      this.head.add(hair);
      this.keep(hair, sk.bindPos[sk.index.neck_01][1]);
      this.stats.hairTris = hm.indices.length / 3;
      this.stats.hairMs = Math.round(performance.now() - t1);
    }
    this.stats.buildMs = Math.round(performance.now() - t0);
  }

  /** Hold her head as the view has it, and look. */
  setView(name: string): void {
    this.view = name;
    const v = VIEWS[name] ?? VIEWS.front;
    // her head bowed (about her left-right) and turned (about up), about the Head joint
    const pose = q.get('pose') !== '0';
    const qh = new THREE.Quaternion().setFromEuler(new THREE.Euler(pose ? v.bow * DEG : 0, pose ? v.turn * DEG : 0, 0, 'YXZ'));
    const qi = new THREE.Quaternion(), tmp = new THREE.Vector3(), one = new THREE.Quaternion();
    for (const [mesh, r] of this.rest) {
      const pa = mesh.geometry.attributes.position as THREE.BufferAttribute, na = mesh.geometry.attributes.normal as THREE.BufferAttribute;
      for (let i = 0; i < r.w.length; i++) {
        qi.copy(one).slerp(qh, r.w[i]);
        tmp.set(r.p[i * 3], r.p[i * 3 + 1], r.p[i * 3 + 2]).sub(this.pivot).applyQuaternion(qi).add(this.pivot);
        tmp.y += (pose ? v.dy : 0) * r.w[i];
        pa.setXYZ(i, tmp.x, tmp.y, tmp.z);
        tmp.set(r.n[i * 3], r.n[i * 3 + 1], r.n[i * 3 + 2]).applyQuaternion(qi);
        na.setXYZ(i, tmp.x, tmp.y, tmp.z);
      }
      pa.needsUpdate = true;
      na.needsUpdate = true;
    }
    const cam = this.core.camera;
    const yaw = v.yaw * DEG, pitch = v.pitch * DEG, d = 2.95;
    const target = new THREE.Vector3(0, MID_Y, 0);
    cam.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * d, target.y + Math.sin(pitch) * d, target.z + Math.cos(yaw) * Math.cos(pitch) * d);
    cam.lookAt(target);
    cam.updateMatrixWorld(true);
    const back = target.clone().sub(cam.position).normalize();
    this.backdrop.position.copy(target).addScaledVector(back, 0.6);
    this.backdrop.lookAt(cam.position);
  }

  render(): void {
    this.env.update(0, 0, 0, 0, 0, null, 0, 0, 0);
    this.core.render(0);
  }
}

const canvas = document.getElementById('view') as HTMLCanvasElement;
const lab = new HeadLab(canvas);
lab.build();
lab.setView(lab.view);
const rt = {
  ready: true,
  render: () => lab.render(),
  setView: (n: string) => { lab.setView(n); lab.render(); },
  telemetry: () => ({ ...lab.stats, view: lab.view }),
};
(window as unknown as { __rt: typeof rt }).__rt = rt;
const loop = () => {
  lab.render();
  if (q.get('shot') !== '1') requestAnimationFrame(loop);
};
loop();
