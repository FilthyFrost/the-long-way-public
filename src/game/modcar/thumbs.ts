/**
 * Pictures of the parts for the developer's parts bin: each model drawn once, small, in a cel look of its
 * own (flat colours by material name over the baked AO, a dark outline), from three-quarters in front and
 * above, on a clear ground. A second, small WebGL canvas: the game's renderer and its materials are not
 * touched. Asked for as tiles come into view, drawn a couple a frame.
 */
import * as THREE from 'three';

const COLOURS: Record<string, number> = {
  paint: 0xa3472e,
  paint_b: 0xd8cdb4,
  trim: 0x34302c,
  chrome: 0xdfe3e8,
  steel: 0x8d9299,
  alu: 0xbcc1c7,
  rubber: 0x2c2b2a,
  glass: 0xa9cfe0,
  glass_dark: 0x46545c,
  lens_head: 0xf3ecd6,
  lens_tail: 0xc0281f,
  lens_amber: 0xe48c2c,
  fabric: 0x9c8c74,
  leather: 0x7c4c2e,
  wood: 0x9c6c3c,
  plastic_int: 0x4c4642,
  gauge: 0xf0eadb,
  ceramic: 0xf4f1ea,
  rust: 0x8c4c28,
  emit: 0xfff3c4,
  cap_oil: 0xe0a024,
  cap_water: 0x2f6fc0,
};

const W = 176;
const H = 132;

interface Job {
  key: string;
  load: () => Promise<THREE.Object3D | null>;
  paint?: number;
  paint2?: number;
  done: ((url: string | null) => void)[];
}

export class PartThumbs {
  private renderer: THREE.WebGLRenderer | null = null;
  private failed = false;
  private readonly scene = new THREE.Scene();
  private readonly cam = new THREE.PerspectiveCamera(26, W / H, 0.01, 200);
  private readonly urls = new Map<string, string | null>();
  private readonly jobs = new Map<string, Job>();
  private readonly order: string[] = [];
  private busy = false;
  private readonly toon = new Map<string, THREE.MeshToonMaterial>();
  private readonly ramp: THREE.DataTexture;
  private readonly ink: THREE.ShaderMaterial;

  constructor() {
    // three tones: the shadow side, the lit side, the highlight
    const d = new Uint8Array([92, 92, 92, 255, 178, 178, 178, 255, 255, 255, 255, 255]);
    this.ramp = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
    this.ramp.minFilter = THREE.NearestFilter;
    this.ramp.magFilter = THREE.NearestFilter;
    this.ramp.needsUpdate = true;
    // the outline: the back faces pushed out along their normals, a constant width on screen
    this.ink = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { uWidth: { value: 0.0045 } },
      vertexShader: /* glsl */ `
        uniform float uWidth;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 n = normalize(normalMatrix * normal);
          mv.xyz += n * uWidth * -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `void main() { gl_FragColor = vec4(0.17, 0.13, 0.10, 1.0); }`,
    });
    this.scene.add(new THREE.HemisphereLight(0xfff6e6, 0x5c4c3c, 1.6));
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
  }

  /** a picture of the thing `load` gives (the same key asked again: the same picture); null when none can be drawn */
  request(key: string, load: () => Promise<THREE.Object3D | null>, done: (url: string | null) => void, paint?: number, paint2?: number): void {
    if (this.urls.has(key)) {
      done(this.urls.get(key) ?? null);
      return;
    }
    const j = this.jobs.get(key);
    if (j) {
      j.done.push(done);
      return;
    }
    this.jobs.set(key, { key, load, paint, paint2, done: [done] });
    this.order.push(key);
  }

  /** draw the next waiting picture (one at a time; call every frame while the bin is open) */
  pump(): void {
    if (this.busy || !this.order.length) return;
    const key = this.order.shift()!;
    const job = this.jobs.get(key);
    if (!job) return;
    this.busy = true;
    void job
      .load()
      .then((obj) => this.draw(obj, job.paint, job.paint2))
      .catch(() => null)
      .then((url) => {
        this.urls.set(key, url);
        this.jobs.delete(key);
        for (const f of job.done) f(url);
        this.busy = false;
      });
  }

  private ensure(): THREE.WebGLRenderer | null {
    if (this.renderer || this.failed) return this.renderer;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      r.setPixelRatio(1);
      r.setSize(W, H, false);
      r.setClearColor(0x000000, 0);
      r.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer = r;
    } catch {
      this.failed = true;
    }
    return this.renderer;
  }

  private material(name: string, vc: boolean, paint?: number, paint2?: number): THREE.MeshToonMaterial {
    const base = name.replace(/^car:/, '').replace(/\.\d+$/, '');
    // (a second colour of its own for paint_b: an item's two; else paint_b takes the paint too)
    const colour = base === 'paint_b' && paint2 !== undefined ? paint2 : (base === 'paint' || base === 'paint_b') && paint !== undefined ? paint : (COLOURS[base] ?? 0x9a8e80);
    const key = `${colour}:${vc}`;
    let m = this.toon.get(key);
    if (!m) {
      m = new THREE.MeshToonMaterial({ color: colour, gradientMap: this.ramp, vertexColors: vc });
      this.toon.set(key, m);
    }
    return m;
  }

  private draw(obj: THREE.Object3D | null, paint?: number, paint2?: number): string | null {
    const r = this.ensure();
    if (!r || !obj) return null;
    const root = obj.clone(true);
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    const outlines: THREE.Mesh[] = [];
    for (const mesh of meshes) {
      const names = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => m?.name ?? '');
      const kept = mesh.userData.mat as string[] | undefined;
      const vc = !!mesh.geometry.getAttribute('color');
      const mats = names.map((n, i) => this.material(kept?.[i] ?? n, vc, paint, paint2));
      mesh.material = Array.isArray(mesh.material) ? mats : mats[0];
      const line = new THREE.Mesh(mesh.geometry, this.ink);
      line.matrixAutoUpdate = false;
      outlines.push(line);
      mesh.add(line);
    }
    root.updateMatrixWorld(true);
    // (framed on what shows: a model's hidden helpers stay out of it)
    const box = new THREE.Box3();
    const part = new THREE.Box3();
    for (const mesh of meshes) {
      let shown = true;
      for (let p: THREE.Object3D | null = mesh; p && shown; p = p.parent) shown = p.visible;
      if (!shown) continue;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      box.union(part.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld));
    }
    if (box.isEmpty()) return null;
    const c = box.getCenter(new THREE.Vector3());
    const radius = Math.max(0.05, box.getSize(new THREE.Vector3()).length() / 2);
    // from three-quarters in front, on its right, a little above
    const dir = new THREE.Vector3(0.78, 0.46, 0.62).normalize();
    const dist = (radius / Math.sin(THREE.MathUtils.degToRad(this.cam.fov / 2))) * 0.92;
    this.cam.position.copy(c).addScaledVector(dir, dist);
    this.cam.near = Math.max(0.01, dist - radius * 2);
    this.cam.far = dist + radius * 2;
    this.cam.lookAt(c);
    this.cam.updateProjectionMatrix();
    this.ink.uniforms.uWidth.value = 0.0035;
    this.scene.add(root);
    r.render(this.scene, this.cam);
    const url = r.domElement.toDataURL('image/png');
    this.scene.remove(root);
    for (const l of outlines) l.removeFromParent();
    return url;
  }
}
