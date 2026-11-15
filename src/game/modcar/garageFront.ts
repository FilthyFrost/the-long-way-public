/**
 * The front of the workshop, the side the road sees: the sign painted over the big doors, and at
 * night the light on the yard — a pool under the lamp over the doors, and when they stand open the
 * lit room spilling out across the concrete. (The lamp lights the wall and the doors themselves as
 * one of the room's lamps flagged as outside: shaderlib.ts rtRoomLamps.)
 *
 * World frame as the garage's: x towards the road, y up, z right.
 */
import * as THREE from 'three';
import { surfaceMaterial } from '../render/materials';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, GLSL_VERTEX_MAIN, GLSL_VERTEX_PARS, globals } from '../render/shaderlib';
import { surfaceKind, visibleHeight } from './garageOutdoors';

// ------------------------------------------------------------------ the sign

const SIGN_W = 1280;
const SIGN_H = 218;

/**
 * The board over the doors, painted by hand some summers ago: what the place does in red, and under
 * it, smaller, why it is worth stopping. Faded by the sun at the top, the paint chipped.
 */
export class Sign {
  readonly mesh: THREE.Mesh;
  private readonly tex: THREE.CanvasTexture;
  private readonly mat: THREE.ShaderMaterial;

  constructor(at: { x: number; y: number; z: number; w: number; h: number }) {
    const canvas = document.createElement('canvas');
    canvas.width = SIGN_W;
    canvas.height = SIGN_H;
    paintSign(canvas);
    this.tex = new THREE.CanvasTexture(canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mat = surfaceMaterial({ color: 0xffffff, map: this.tex, spec: 0 });
    const g = new THREE.PlaneGeometry(at.w - 0.03, at.h - 0.03);
    // (a plane faces +z; the board faces +x, out to the road)
    g.rotateY(Math.PI / 2);
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.name = 'garage:sign';
    this.mesh.position.set(at.x + 0.004, at.y, at.z);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}

function paintSign(canvas: HTMLCanvasElement): void {
  const c = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  let s = 11;
  const rnd = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  // the cream ground, three planks, a little grain in each
  c.fillStyle = '#ece0c2';
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 3; i++) {
    const y = (i * H) / 3;
    c.fillStyle = `rgba(120,90,50,${0.05 + rnd() * 0.04})`;
    c.fillRect(0, y, W, H / 3);
    c.fillStyle = 'rgba(90,64,40,0.35)';
    c.fillRect(0, y - 1, W, 2);
    for (let k = 0; k < 14; k++) {
      c.strokeStyle = `rgba(110,80,46,${0.05 + rnd() * 0.06})`;
      c.lineWidth = 1 + rnd() * 1.5;
      c.beginPath();
      const yy = y + 4 + rnd() * (H / 3 - 8);
      c.moveTo(0, yy);
      c.bezierCurveTo(W * 0.3, yy + (rnd() - 0.5) * 6, W * 0.6, yy + (rnd() - 0.5) * 6, W, yy + (rnd() - 0.5) * 4);
      c.stroke();
    }
  }
  // a border line, painted with a wobble
  c.strokeStyle = '#9e2f26';
  c.lineWidth = 7;
  c.beginPath();
  const m = 16;
  c.moveTo(m, m + 1);
  c.lineTo(W - m, m - 1);
  c.lineTo(W - m + 1, H - m);
  c.lineTo(m - 1, H - m + 1);
  c.closePath();
  c.stroke();
  // what the place does, big and red
  const font = (px: number, bold = true): string => `${bold ? 'bold ' : ''}${px}px "LiSu", "STLiti", "KaiTi", "STKaiti", "SimHei", serif`;
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.font = font(104);
  const main = '修车 · 补胎 · 加水';
  for (let k = 0; k < 2; k++) {
    c.fillStyle = k === 0 ? 'rgba(80,20,14,0.35)' : '#b5352a';
    c.fillText(main, W / 2 + (k === 0 ? 3 : 0), 118 + (k === 0 ? 3 : 0));
  }
  // and why it is worth stopping, smaller, in green
  c.font = font(58);
  c.fillStyle = '#2c4636';
  c.fillText('前方三百公里  再无修理厂', W / 2, 190);
  // the sun has faded the top, rain has run down from the eaves
  const fade = c.createLinearGradient(0, 0, 0, H);
  fade.addColorStop(0, 'rgba(250,244,226,0.32)');
  fade.addColorStop(0.5, 'rgba(250,244,226,0.08)');
  fade.addColorStop(1, 'rgba(250,244,226,0)');
  c.fillStyle = fade;
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 18; i++) {
    const x = rnd() * W;
    const len = 20 + rnd() * 90;
    const g = c.createLinearGradient(x, 0, x, len);
    g.addColorStop(0, 'rgba(96,74,52,0.22)');
    g.addColorStop(1, 'rgba(96,74,52,0)');
    c.fillStyle = g;
    c.fillRect(x, 0, 2 + rnd() * 4, len);
  }
  // chips: the paint gone to the grey wood in flakes, most along the edges
  for (let i = 0; i < 260; i++) {
    const edge = rnd() < 0.6;
    const x = edge ? (rnd() < 0.5 ? rnd() * 60 : W - rnd() * 60) : rnd() * W;
    const y = edge && rnd() < 0.5 ? (rnd() < 0.5 ? rnd() * 24 : H - rnd() * 24) : rnd() * H;
    const r = 1 + rnd() * (edge ? 6 : 3);
    c.fillStyle = `rgba(${150 + rnd() * 20},${138 + rnd() * 20},${120 + rnd() * 16},${0.6 + rnd() * 0.4})`;
    c.beginPath();
    c.ellipse(x, y, r * (1 + rnd()), r, rnd() * 3, 0, Math.PI * 2);
    c.fill();
  }
}

// ------------------------------------------------------------------ the light on the yard at night

const YARD = { x0: 7.06, x1: 15.5, z0: -7.5, z1: 7.5, cell: 0.25 };

/**
 * Light thrown on the yard: added to the frame over the ground (its ink ids left alone), so it needs
 * the ground's colour — taken from the kind of ground under each corner (concrete, gravel, grass).
 */
export class YardLight {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    /** the lamp over the doors (render space), its colour × strength and reach */
    uLampPos: { value: new THREE.Vector3() },
    uLampCol: { value: new THREE.Color(0, 0, 0) },
    uLampReach: { value: 8.0 },
    /** the open part of the door (corner, edges; render space) and the lit room's light through it */
    uDoorA: { value: new THREE.Vector3() },
    uDoorU: { value: new THREE.Vector3() },
    uDoorV: { value: new THREE.Vector3() },
    uDoorL: { value: new THREE.Color(0, 0, 0) },
  };

  constructor() {
    const nx = Math.round((YARD.x1 - YARD.x0) / YARD.cell);
    const nz = Math.round((YARD.z1 - YARD.z0) / YARD.cell);
    const pos: number[] = [];
    const alb: number[] = [];
    const idx: number[] = [];
    const KIND: Record<number, [number, number, number]> = {
      0: [0.3, 0.29, 0.26],
      1: [0.28, 0.25, 0.21],
      3: [0.1, 0.15, 0.06],
    };
    for (let i = 0; i <= nx; i++) {
      for (let k = 0; k <= nz; k++) {
        const x = YARD.x0 + ((YARD.x1 - YARD.x0) * i) / nx;
        const z = YARD.z0 + ((YARD.z1 - YARD.z0) * k) / nz;
        pos.push(x, visibleHeight(x, z) + 0.025, z);
        const a = KIND[surfaceKind(x, z)] ?? KIND[3];
        alb.push(a[0], a[1], a[2]);
      }
    }
    for (let i = 0; i < nx; i++) {
      for (let k = 0; k < nz; k++) {
        const a = i * (nz + 1) + k;
        const b = a + nz + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, j) => (j % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('aAlbedo', new THREE.Float32BufferAttribute(alb, 3));
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      uniforms: { ...globals, ...this.uniforms },
      vertexShader: /* glsl */ `
        ${GLSL_VERTEX_PARS}
        attribute vec3 aAlbedo;
        varying vec3 vAlb;
        void main() {
          vAlb = aAlbedo;
          vec3 transformed = position;
          vec3 objNormal = normal;
          ${GLSL_VERTEX_MAIN}
        }`,
      fragmentShader: /* glsl */ `
        ${GLSL_FRAGMENT_PARS}
        ${GLSL_COMMON}
        uniform vec3 uLampPos;
        uniform vec3 uLampCol;
        uniform float uLampReach;
        uniform vec3 uDoorA;
        uniform vec3 uDoorU;
        uniform vec3 uDoorV;
        uniform vec3 uDoorL;
        varying vec3 vAlb;
        void main() {
          #include <logdepthbuf_fragment>
          vec3 n = vec3(0.0, 1.0, 0.0);
          // the lamp: a pool under it with a soft rim, its deep shade keeping it off the far yard
          vec3 L = uLampPos - vPos;
          float d2 = dot(L, L);
          float win = max(0.0, 1.0 - d2 / (uLampReach * uLampReach));
          vec3 l = L * inversesqrt(max(d2, 1e-4));
          float att = win * win / (0.35 + d2);
          // (a pool on the ground is what says "lamp" at night: the shade's cone drawn a little brighter
          // and sharper than its light on the wall)
          float cone = 0.08 + 0.92 * smoothstep(0.6, 0.9, l.y);
          vec3 c = uLampCol * 5.0 * att * cone * l.y;
          // the open doors: the lit room, a window of light low on the yard
          if (uDoorL.r + uDoorL.g + uDoorL.b > 1e-4) c += uDoorL * rtOpeningLight(vPos, n, uDoorA, uDoorU, uDoorV);
          // the ground's colour under it, a little broken up as the ground is
          float grain = 0.8 + 0.4 * rtNoiseAt(rtWorldXZ(vPos), 1.7).r;
          c *= vAlb * grain;
          // (added to the frame: the fog only takes away)
          c = rtFog(c, vPos, cameraPosition) - rtFog(vec3(0.0), vPos, cameraPosition);
          gl_FragColor = vec4(max(c, vec3(0.0)), 0.0);
        }`,
    });
    m.transparent = true;
    m.depthWrite = false;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -4;
    m.blending = THREE.CustomBlending;
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneFactor;
    m.blendSrcAlpha = THREE.ZeroFactor;
    m.blendDstAlpha = THREE.OneFactor;
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.name = 'garage:yardlight';
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
