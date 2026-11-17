/**
 * Dirt coming off as a tool goes over it (docs/MODCAR.md §15): flakes of crust and rust curling off the blade
 * and falling, crumbs of dried mud, the sponge's foam — small quads in the colour of what came off, tumbling
 * down to the floor and lying there a moment before they go. One instanced mesh, a few hundred at most.
 */
import * as THREE from 'three';
import { globals } from '../render/shaderlib';

const MAX = 640;

/** lit as the world is (its sky and its sun), both faces; the ink ids under them kept (no lines round a crumb) */
function flakeMaterial(): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: { uSunDir: globals.uSunDir, uSunColor: globals.uSunColor, uSkyColor: globals.uSkyColor },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vCol;
      varying vec3 vN;
      void main() {
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
        m = modelMatrix * instanceMatrix;
        #endif
        vCol = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
        vCol = instanceColor;
        #endif
        vN = normalize(mat3(m) * normal);
        gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyColor;
      varying vec3 vCol;
      varying vec3 vN;
      void main() {
        #include <logdepthbuf_fragment>
        float sun = abs(dot(normalize(vN), uSunDir));
        gl_FragColor = vec4(vCol * (uSkyColor * 0.9 + uSunColor * 0.3 * sun), 0.0);
      }`,
    side: THREE.DoubleSide,
  });
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.ZeroFactor;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
  return m;
}

interface Bit {
  p: THREE.Vector3;
  v: THREE.Vector3;
  axis: THREE.Vector3;
  spin: number;
  angle: number;
  size: number;
  life: number;
  age: number;
  foam: boolean;
  /** lying on the floor (stopped) */
  down: boolean;
}

export class Flakes {
  private readonly mesh: THREE.InstancedMesh;
  private readonly bits: Bit[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly col = new THREE.Color();
  private seed = 1;

  constructor(scene: THREE.Scene) {
    const g = new THREE.PlaneGeometry(1, 1);
    // (a little irregular: the corners pulled in, so a flake is not a square)
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setXY(i, pos.getX(i) * (i % 2 ? 0.8 : 1), pos.getY(i) * (i === 2 ? 0.7 : 1));
    this.mesh = new THREE.InstancedMesh(g, flakeMaterial(), MAX);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'modcar:flakes';
    scene.add(this.mesh);
  }

  private rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /**
   * n bits off a surface at `at` (render space) facing `normal`, the colour of what came off (linear), moving a
   * little along `push` (the stroke). foam: the sponge's (white, light, slow).
   */
  emit(at: THREE.Vector3, normal: THREE.Vector3, push: THREE.Vector3, color: THREE.Color, n: number, foam = false): void {
    for (let k = 0; k < n; k++) {
      // (as many as there are room for: the oldest go first anyway)
      if (this.bits.length >= MAX) return;
      const r = (): number => this.rnd() * 2 - 1;
      const v = new THREE.Vector3().copy(normal).multiplyScalar(foam ? 0.15 + 0.2 * this.rnd() : 0.25 + 0.5 * this.rnd());
      v.addScaledVector(push, (foam ? 0.1 : 0.35) * this.rnd()).add(new THREE.Vector3(r(), r() * 0.5, r()).multiplyScalar(foam ? 0.08 : 0.18));
      const b: Bit = {
        p: at.clone().addScaledVector(normal, 0.004).add(new THREE.Vector3(r(), r(), r()).multiplyScalar(0.02)),
        v,
        axis: new THREE.Vector3(r(), r(), r()).normalize(),
        spin: (foam ? 2 : 8) + 10 * this.rnd(),
        angle: this.rnd() * Math.PI * 2,
        size: foam ? 0.006 + 0.01 * this.rnd() : 0.004 + 0.009 * this.rnd(),
        life: foam ? 0.9 + 0.8 * this.rnd() : 1.4 + 1.2 * this.rnd(),
        age: 0,
        foam,
        down: false,
      };
      this.bits.push(b);
      const i = this.bits.length - 1;
      const c = this.col.copy(color).multiplyScalar(0.8 + 0.4 * this.rnd());
      this.mesh.instanceColor!.setXYZ(i, c.r, c.g, c.b);
    }
  }

  /** fall, tumble, lie on the floor (floorY: where it is, render space) and go; how many landed this frame */
  update(dt: number, floorY: number): number {
    let w = 0;
    let landed = 0;
    const colours = this.mesh.instanceColor!;
    for (let i = 0; i < this.bits.length; i++) {
      const b = this.bits[i];
      b.age += dt;
      if (b.age >= b.life) continue;
      if (!b.down) {
        // (foam drifts down slowly; flakes fall, flutter a little)
        b.v.y -= (b.foam ? 1.2 : 6.5) * dt;
        b.v.multiplyScalar(Math.exp(-dt * (b.foam ? 3 : 1.6)));
        b.p.addScaledVector(b.v, dt);
        b.angle += b.spin * dt;
        if (b.p.y <= floorY + 0.002) {
          b.p.y = floorY + 0.002;
          b.down = true;
          if (!b.foam) landed++;
          // (lying flat, a little longer)
          b.axis.set(1, 0, 0);
          b.angle = -Math.PI / 2;
          b.life = Math.min(b.life + 0.8, b.age + 1.2);
        }
      }
      const fade = Math.min(1, (b.life - b.age) / 0.4);
      const grow = b.foam ? 1 + 0.6 * (b.age / b.life) : 1;
      this.q.setFromAxisAngle(b.axis, b.angle);
      this.s.setScalar(b.size * fade * grow);
      this.m.compose(b.p, this.q, this.s);
      if (w !== i) {
        this.bits[w] = b;
        colours.setXYZ(w, colours.getX(i), colours.getY(i), colours.getZ(i));
      }
      this.mesh.setMatrixAt(w, this.m);
      w++;
    }
    this.bits.length = w;
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    colours.needsUpdate = true;
    return landed;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
