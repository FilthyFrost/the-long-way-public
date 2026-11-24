/**
 * What is drawn of the appliances over their own models (node M2, docs/V3/nodes/M2-rv.md): the television's
 * picture (five channels of moving pictures, a line opening into the picture as it warms up and closing to a dot
 * as it goes off), the clock radio's red digits telling the world's hour, the record's label turning while it
 * plays, the desk lamp's and the solar lamp's light with a halo the bloom spreads, the coffee maker's switch lit
 * while it brews and the coffee standing in its pot (and in a pot on its own).
 *
 * The overlays are not the things' own meshes: the things lying still are merged into one mesh per material
 * (loose.ts), so each thing's overlays are a group of their own under the loose things' root that copies the
 * thing's place every frame. Nothing here is lit by the world's lights: what glows is held at what it looks like
 * on screen whatever the eye's exposure (as the workshop's bulbs are), what does not glow (the coffee, the label)
 * is darkened with the sky.
 */
import * as THREE from 'three';
import type { ApplianceKind } from '../../../../core/v3/appliances/appliances';

/** what a look is told each frame */
export interface LookNow {
  /** switched on (the solar lamp: and dark enough to light) */
  on: boolean;
  /** the station, channel or record */
  ch: number;
  /** the hour of the world's day (the clock radio's digits) */
  hour: number;
  /** the coffee in its pot, a share of the pot (−1: no pot) */
  coffee: number;
  /** the light the sky gives what does not glow (0 night … 1 noon) */
  light: number;
  /** how far the eye is opened up (core.exposure): what glows is divided by it */
  exposure: number;
  /** seconds since the start (the pictures move, the record turns) */
  t: number;
  dt: number;
  /** lying on a wall (the lamp's pool of light below it: none) */
  onWall: boolean;
}

export interface ApplianceLook {
  readonly group: THREE.Group;
  update(now: LookNow): void;
  dispose(): void;
}

// ------------------------------------------------------------------ shared pieces

const WARM = new THREE.Color(1.0, 0.72, 0.42);

let haloTex: THREE.Texture | null = null;
/** a soft round glow (a canvas once; none where there is no document) */
function halo(): THREE.Texture | null {
  if (haloTex) return haloTex;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  haloTex = new THREE.CanvasTexture(c);
  haloTex.colorSpace = THREE.NoColorSpace;
  return haloTex;
}

function glowMat(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  return m;
}

function haloSprite(size: number): THREE.Sprite | null {
  const tex = halo();
  if (!tex) return null;
  const m = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  s.renderOrder = 10;
  return s;
}

/** a flat face on the thing's front (+x), its middle at (x, y, z), w across (along z) and h high */
function frontPlane(mat: THREE.Material, x: number, y: number, z: number, w: number, h: number): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  return m;
}

function disposeGroup(g: THREE.Group): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
  g.removeFromParent();
}

// ------------------------------------------------------------------ the television

const TV_FS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime;
uniform float uCh;
uniform float uOn;
uniform float uGain;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }

vec3 picture(vec2 uv, float ch, float t) {
  if (ch < 0.5) {
    // the landscape channel: a slow drive past hills under a low sun
    vec3 sky = mix(vec3(0.98, 0.72, 0.42), vec3(0.32, 0.55, 0.88), smoothstep(0.35, 1.0, uv.y));
    float sun = smoothstep(0.1, 0.085, length((uv - vec2(0.68, 0.62)) * vec2(1.25, 1.0)));
    vec3 c = mix(sky, vec3(1.0, 0.93, 0.7), sun);
    float h1 = 0.42 + 0.07 * sin(uv.x * 5.0 + t * 0.12) + 0.035 * sin(uv.x * 13.0 + t * 0.2 + 2.0);
    float h2 = 0.28 + 0.05 * sin(uv.x * 8.0 + t * 0.35 + 1.0) + 0.02 * sin(uv.x * 23.0 + t * 0.5);
    c = mix(c, vec3(0.36, 0.5, 0.42), step(uv.y, h1));
    c = mix(c, vec3(0.3, 0.52, 0.28), step(uv.y, h2));
    // the road, its dashes running towards one
    float road = step(uv.y, 0.16) * step(abs(uv.x - 0.5), 0.5 - uv.y * 1.6);
    c = mix(c, vec3(0.25, 0.24, 0.26), road);
    float dash = step(abs(uv.x - 0.5), 0.012 * (1.0 - uv.y * 4.0)) * step(0.5, fract(uv.y * 14.0 + t * 1.6)) * step(uv.y, 0.15);
    c = mix(c, vec3(0.95, 0.9, 0.7), dash);
    return c;
  }
  if (ch < 1.5) {
    // the test card: colour bars over a grey strip and a tone's black and white blocks
    float i = floor(uv.x * 7.0);
    vec3 bar = vec3(i < 4.0 ? 0.85 : 0.08, (i < 2.0 || (i > 3.0 && i < 6.0)) ? 0.85 : 0.08, mod(i, 2.0) < 0.5 ? 0.85 : 0.08);
    vec3 c = bar;
    if (uv.y < 0.3) c = vec3(step(0.5, fract(uv.x * 4.0)) * 0.9);
    if (uv.y < 0.3 && uv.y > 0.22) c = vec3(0.35);
    float circ = abs(length((uv - 0.5) * vec2(1.3, 1.0)) - 0.3);
    c = mix(c, vec3(0.95), smoothstep(0.012, 0.004, circ));
    return c;
  }
  if (ch < 2.5) {
    // snow: nothing on this channel
    float n = hash(floor(uv * vec2(160.0, 120.0)) + floor(t * 30.0));
    float roll = 0.12 * smoothstep(0.0, 0.08, abs(fract(uv.y + t * 0.4) - 0.5));
    return vec3(n * 0.85 + roll * 0.2);
  }
  if (ch < 3.5) {
    // the cartoon: a red ball bouncing over a checked floor
    vec3 c = mix(vec3(0.55, 0.82, 0.95), vec3(0.85, 0.95, 1.0), uv.y);
    float fl = step(uv.y, 0.3);
    float chk = mod(floor((uv.x - 0.5) / max(0.05, 0.32 - uv.y) * 2.0 + t * 1.2) + floor(uv.y * 20.0), 2.0);
    c = mix(c, mix(vec3(0.95, 0.88, 0.6), vec3(0.4, 0.62, 0.32), chk), fl);
    float x = 0.5 + 0.32 * sin(t * 0.9);
    float y = 0.36 + 0.42 * abs(sin(t * 2.6));
    float r = length((uv - vec2(x, y)) * vec2(1.3, 1.0));
    float sh = length((uv - vec2(x, 0.27)) * vec2(1.3, 4.0));
    c = mix(c, c * 0.6, smoothstep(0.12, 0.08, sh));
    c = mix(c, vec3(0.92, 0.25, 0.2), smoothstep(0.09, 0.08, r));
    c = mix(c, vec3(1.0, 0.85, 0.8), smoothstep(0.03, 0.02, length((uv - vec2(x - 0.025, y + 0.03)) * vec2(1.3, 1.0))));
    return c;
  }
  // the news: someone at a desk, a map behind, the ticker running along the bottom
  vec3 c = mix(vec3(0.18, 0.28, 0.5), vec3(0.3, 0.45, 0.7), uv.y);
  float map = smoothstep(0.02, 0.0, box(uv - vec2(0.75, 0.62), vec2(0.17, 0.14), 0.02));
  c = mix(c, vec3(0.55, 0.75, 0.55) * (0.8 + 0.2 * sin(uv.x * 40.0) * sin(uv.y * 30.0)), map);
  float head = smoothstep(0.075, 0.065, length((uv - vec2(0.36, 0.6 + 0.004 * sin(t * 3.0))) * vec2(1.3, 1.0)));
  float body = smoothstep(0.02, 0.0, box(uv - vec2(0.36, 0.36), vec2(0.15, 0.15), 0.08));
  c = mix(c, vec3(0.2, 0.2, 0.25), body);
  c = mix(c, vec3(0.93, 0.76, 0.62), head);
  float desk = step(uv.y, 0.3) * step(0.18, uv.y);
  c = mix(c, vec3(0.55, 0.38, 0.25), desk);
  float tick = step(uv.y, 0.15) * step(0.06, uv.y);
  c = mix(c, vec3(0.9, 0.2, 0.15), tick);
  float letters = step(0.55, fract(uv.x * 18.0 + t * 0.6)) * step(0.085, uv.y) * step(uv.y, 0.125) * step(0.4, hash(vec2(floor(uv.x * 18.0 + t * 0.6), 3.0)));
  c = mix(c, vec3(1.0), letters);
  return c;
}

void main() {
  #include <logdepthbuf_fragment>
  vec2 p = vUv - 0.5;
  // the tube's rounded face
  if (box(p, vec2(0.5), 0.09) > 0.0) discard;
  // warming up: a bright line that opens into the picture; going off: the picture closes to a dot
  float open = clamp(uOn * 1.6 - 0.15, 0.0, 1.0);
  float line = smoothstep(0.012, 0.0, abs(p.y)) * clamp(uOn * 4.0, 0.0, 1.0);
  vec3 c = picture(vUv, uCh, uTime);
  // scan lines and the curve of the glass darkening to the edges
  c *= 0.86 + 0.14 * sin(vUv.y * 420.0);
  c *= 1.0 - 0.9 * dot(p, p);
  float shown = step(abs(p.y), 0.5 * open);
  vec3 col = c * shown + vec3(0.9, 0.95, 1.0) * line * (1.0 - open);
  // a little flicker of the tube
  col *= 0.96 + 0.04 * sin(uTime * 53.0);
  if (dot(col, vec3(1.0)) < 0.003) discard;
  gl_FragColor = vec4(col * uGain, 1.0);
}`;

// (the scene draws into a logarithmic depth buffer: a shader of one's own writes its depth the same way, or it is hidden)
const UV_VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;

class TvLook implements ApplianceLook {
  readonly group = new THREE.Group();
  private readonly mat = new THREE.ShaderMaterial({
    vertexShader: UV_VS,
    fragmentShader: TV_FS,
    uniforms: { uTime: { value: 0 }, uCh: { value: 0 }, uOn: { value: 0 }, uGain: { value: 1 } },
    toneMapped: false,
  });
  private readonly screen: THREE.Mesh;
  private warm = 0;

  constructor() {
    // (the tube's face: x 0.197–0.221 bulging out, y 0.12–0.37, z −0.09–0.21, junk_tv.glb)
    this.screen = frontPlane(this.mat, 0.2225, 0.245, 0.06, 0.285, 0.232);
    this.mat.polygonOffset = true;
    this.mat.polygonOffsetFactor = -2;
    this.group.add(this.screen);
  }

  update(n: LookNow): void {
    // (the tube warms up in about a second, and goes off in a quarter)
    this.warm = n.on ? Math.min(1, this.warm + n.dt * 1.1) : Math.max(0, this.warm - n.dt * 4);
    this.screen.visible = this.warm > 0.001;
    const u = this.mat.uniforms;
    u.uTime.value = n.t;
    u.uCh.value = n.ch;
    u.uOn.value = this.warm;
    // (on screen about as bright as a lit page: the picture's own colours, a little over at the brightest)
    u.uGain.value = 0.85 / Math.max(0.5, n.exposure);
  }

  /** how bright the picture is now (0 off … 1): its flicker on the walls of a cabin */
  get glow(): number {
    return this.warm;
  }

  dispose(): void {
    disposeGroup(this.group);
  }
}

// ------------------------------------------------------------------ the clock radio's digits

const CLOCK_FS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uHour;
uniform float uGain;
uniform float uBlink;
varying vec2 vUv;

float seg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
float bit(float m, float k) { return mod(floor(m / pow(2.0, k)), 2.0); }
// one seven-segment digit in a cell (p: 0..1 across, 0..1 up): the segments lit, with the unlit ones faint
float digit(vec2 p, float d) {
  float m = d < 0.5 ? 63.0 : d < 1.5 ? 6.0 : d < 2.5 ? 91.0 : d < 3.5 ? 79.0 : d < 4.5 ? 102.0 : d < 5.5 ? 109.0 : d < 6.5 ? 125.0 : d < 7.5 ? 7.0 : d < 8.5 ? 127.0 : 111.0;
  vec2 q = vec2(p.x + (p.y - 0.5) * 0.12, p.y);
  float w = 0.075;
  float on = 0.0;
  float off = 0.0;
  vec2 A = vec2(0.2, 0.92), B = vec2(0.8, 0.92), C = vec2(0.8, 0.5), D = vec2(0.8, 0.08), E = vec2(0.2, 0.08), F = vec2(0.2, 0.5);
  vec2 s0a = A, s0b = B; vec2 s1a = B, s1b = C; vec2 s2a = C, s2b = D; vec2 s3a = E, s3b = D; vec2 s4a = F, s4b = E; vec2 s5a = A, s5b = F; vec2 s6a = F, s6b = C;
  float l;
  l = smoothstep(w, w * 0.5, seg(q, s0a, s0b)); on += l * bit(m, 0.0); off += l;
  l = smoothstep(w, w * 0.5, seg(q, s1a, s1b)); on += l * bit(m, 1.0); off += l;
  l = smoothstep(w, w * 0.5, seg(q, s2a, s2b)); on += l * bit(m, 2.0); off += l;
  l = smoothstep(w, w * 0.5, seg(q, s3a, s3b)); on += l * bit(m, 3.0); off += l;
  l = smoothstep(w, w * 0.5, seg(q, s4a, s4b)); on += l * bit(m, 4.0); off += l;
  l = smoothstep(w, w * 0.5, seg(q, s5a, s5b)); on += l * bit(m, 5.0); off += l;
  l = smoothstep(w, w * 0.5, seg(q, s6a, s6b)); on += l * bit(m, 6.0); off += l;
  return min(1.0, on) + 0.08 * min(1.0, off);
}

void main() {
  #include <logdepthbuf_fragment>
  // the hours in two cells, the colon in a narrow one, the minutes in two (u along the display, v up)
  float h = floor(uHour);
  float mi = floor(fract(uHour) * 60.0);
  float x = vUv.x * 4.6;
  float py = (vUv.y - 0.12) / 0.76;
  float v = 0.0;
  if (py >= 0.0 && py <= 1.0) {
    if (x < 2.0) {
      float d = x < 1.0 ? floor(h / 10.0) : mod(h, 10.0);
      vec2 p = vec2(fract(x), py);
      // (the hours' leading nought is not lit: only the faint segments)
      v = x < 1.0 && d < 0.5 ? 0.08 * digit(p, 8.0) / 1.08 : digit(p, d);
    } else if (x < 2.6) {
      vec2 p = vec2((x - 2.0) / 0.6, py);
      v = (smoothstep(0.16, 0.1, length((p - vec2(0.5, 0.3)) * vec2(0.6, 1.0))) + smoothstep(0.16, 0.1, length((p - vec2(0.5, 0.7)) * vec2(0.6, 1.0)))) * uBlink;
    } else {
      float x2 = x - 2.6;
      float d = x2 < 1.0 ? floor(mi / 10.0) : mod(mi, 10.0);
      v = digit(vec2(fract(x2), py), d);
    }
  }
  vec3 c = vec3(1.0, 0.16, 0.07) * v;
  if (v < 0.01) discard;
  gl_FragColor = vec4(c * uGain, 1.0);
}`;

class ClockLook implements ApplianceLook {
  readonly group = new THREE.Group();
  private readonly mat = new THREE.ShaderMaterial({
    vertexShader: UV_VS,
    fragmentShader: CLOCK_FS,
    uniforms: { uHour: { value: 12 }, uGain: { value: 1 }, uBlink: { value: 1 } },
    toneMapped: false,
    transparent: false,
  });

  constructor() {
    // (the display's dark glass: x 0.053–0.056, y 0.033–0.071, z −0.089 – −0.015, junk_clockradio.glb)
    const plane = frontPlane(this.mat, 0.0568, 0.052, -0.052, 0.066, 0.03);
    this.mat.polygonOffset = true;
    this.mat.polygonOffsetFactor = -2;
    this.group.add(plane);
  }

  update(n: LookNow): void {
    const u = this.mat.uniforms;
    u.uHour.value = ((n.hour % 24) + 24) % 24;
    u.uBlink.value = Math.floor(n.t) % 2 === 0 ? 1 : 0.15;
    // (brighter with the radio playing)
    u.uGain.value = (n.on ? 2.2 : 1.4) / Math.max(0.5, n.exposure);
  }

  dispose(): void {
    disposeGroup(this.group);
  }
}

// ------------------------------------------------------------------ the record player's label

const LABEL_FS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uLight;
uniform vec3 uColour;
varying vec2 vUv;
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  vec3 c = uColour;
  // a pale band across it with a few lines of print, the hole in the middle: one sees it turn
  float band = step(abs(p.y), 0.22) * step(0.3, r);
  c = mix(c, vec3(0.94, 0.9, 0.8), band);
  float print = band * step(0.5, fract(p.x * 6.0)) * step(abs(p.y), 0.1) * step(0.35, abs(p.x));
  c = mix(c, vec3(0.2), print);
  c = mix(c, vec3(0.06), step(r, 0.12));
  // the edge where it meets the vinyl
  c *= mix(0.85, 1.0, step(r, 0.93));
  gl_FragColor = vec4(c * uLight, 1.0);
}`;

const LABEL_COLOURS = [0xc8323a, 0x2e4a6b, 0xf0c23c, 0x557a46, 0xa99bc9];

class RecordLook implements ApplianceLook {
  readonly group = new THREE.Group();
  private readonly mat = new THREE.ShaderMaterial({
    vertexShader: UV_VS,
    fragmentShader: LABEL_FS,
    uniforms: { uLight: { value: 1 }, uColour: { value: new THREE.Color(LABEL_COLOURS[0]) } },
  });
  private readonly label: THREE.Mesh;
  private spin = 0;
  private speed = 0;

  constructor() {
    // (the label on the record: its middle at x 0.005, z 0.05, its top 0.1161, radius 0.044, junk_record.glb)
    const g = new THREE.CircleGeometry(0.0445, 28);
    g.rotateX(-Math.PI / 2);
    this.label = new THREE.Mesh(g, this.mat);
    this.label.position.set(0.005, 0.1166, 0.05);
    this.mat.polygonOffset = true;
    this.mat.polygonOffsetFactor = -2;
    this.group.add(this.label);
  }

  update(n: LookNow): void {
    // thirty-three and a third turns a minute, run up and run down in a second or two
    const want = n.on ? (33.333 / 60) * Math.PI * 2 : 0;
    this.speed += (want - this.speed) * Math.min(1, n.dt * 1.8);
    this.spin = (this.spin + this.speed * n.dt) % (Math.PI * 2);
    this.label.rotation.y = -this.spin;
    const u = this.mat.uniforms;
    u.uLight.value = 0.12 + 0.88 * n.light;
    (u.uColour.value as THREE.Color).setHex(LABEL_COLOURS[n.ch % LABEL_COLOURS.length]);
  }

  dispose(): void {
    disposeGroup(this.group);
  }
}

// ------------------------------------------------------------------ lamps

class LampLook implements ApplianceLook {
  readonly group = new THREE.Group();
  private readonly bulbMat = glowMat();
  private readonly bulb: THREE.Mesh;
  private readonly halo: THREE.Sprite | null;
  private readonly pool: THREE.Mesh | null;
  private level = 0;

  /**
   * at: the bulb's middle (the desk lamp's at 0.26, 0.30, 0; the solar lamp's lens at 0, 0.444, 0); shape: a
   * sphere of that radius, or a cylinder of that radius and height; pool: where its light falls on what it
   * stands on (x, z, radius), or none
   */
  constructor(
    at: THREE.Vector3,
    shape: { r: number; h?: number },
    haloSize: number,
    pool: { x: number; z: number; r: number } | null,
    private readonly colour: THREE.Color,
    private readonly power: number,
  ) {
    const geo = shape.h ? new THREE.CylinderGeometry(shape.r, shape.r, shape.h, 20) : new THREE.SphereGeometry(shape.r, 14, 10);
    this.bulb = new THREE.Mesh(geo, this.bulbMat);
    this.bulb.position.copy(at);
    this.group.add(this.bulb);
    this.halo = haloSprite(haloSize);
    if (this.halo) {
      this.halo.position.copy(at);
      this.group.add(this.halo);
    }
    this.pool = null;
    if (pool && halo()) {
      const m = new THREE.MeshBasicMaterial({ map: halo(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 });
      const g = new THREE.PlaneGeometry(pool.r * 2, pool.r * 2);
      g.rotateX(-Math.PI / 2);
      this.pool = new THREE.Mesh(g, m);
      this.pool.position.set(pool.x, 0.003, pool.z);
      this.pool.renderOrder = 9;
      this.group.add(this.pool);
    }
  }

  /** how bright it is now (0 … 1): its light in a cabin */
  get glow(): number {
    return this.level;
  }

  update(n: LookNow): void {
    // (a bulb comes up and dies away in a moment)
    this.level += ((n.on ? 1 : 0) - this.level) * Math.min(1, n.dt * 12);
    const lit = this.level > 0.01;
    this.bulb.visible = lit;
    const ex = Math.max(0.5, n.exposure);
    const k = (this.power * this.level) / ex;
    this.bulbMat.color.copy(this.colour).multiplyScalar(k * 2.4);
    if (this.halo) {
      this.halo.visible = lit;
      (this.halo.material as THREE.SpriteMaterial).color.copy(this.colour).multiplyScalar(k * (0.35 + 0.65 * (1 - n.light)));
    }
    if (this.pool) {
      this.pool.visible = lit && !n.onWall;
      (this.pool.material as THREE.MeshBasicMaterial).color.copy(this.colour).multiplyScalar(k * 0.5 * (0.2 + 0.8 * (1 - n.light)));
    }
  }

  dispose(): void {
    disposeGroup(this.group);
  }
}

// ------------------------------------------------------------------ the coffee maker, and a pot on its own

class CoffeeLook implements ApplianceLook {
  readonly group = new THREE.Group();
  private readonly switchMat = glowMat();
  private readonly lit: THREE.Mesh;
  private readonly coffeeMat = new THREE.MeshBasicMaterial({ color: 0x1a0d06 });
  private readonly coffee: THREE.Mesh;
  private readonly steam: THREE.Sprite[] = [];
  private brewing = 0;

  /** pot: where the pot's glass stands (its middle on the ground: x, z, and the height of its inside's bottom); maker: there is the machine round it */
  constructor(
    private readonly pot: { x: number; z: number; y0: number },
    maker: boolean,
  ) {
    // the rocker switch at the front, lit red while it brews (junk_coffee.glb: at 0.129, 0.026, −0.055)
    this.lit = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.018, 0.029), this.switchMat);
    this.lit.position.set(0.1295, 0.026, -0.055);
    this.lit.rotation.z = (-10 * Math.PI) / 180;
    this.lit.visible = false;
    if (maker) this.group.add(this.lit);
    // the coffee in the pot: a dark column, as high as the pot is full
    const g = new THREE.CylinderGeometry(0.057, 0.055, 1, 20);
    g.translate(0, 0.5, 0);
    this.coffee = new THREE.Mesh(g, this.coffeeMat);
    this.coffee.position.set(pot.x, pot.y0, pot.z);
    this.coffee.visible = false;
    this.group.add(this.coffee);
    // steam over the lid while it brews
    if (maker) {
      for (let i = 0; i < 4; i++) {
        const s = haloSprite(0.07);
        if (!s) break;
        s.material.blending = THREE.NormalBlending;
        s.visible = false;
        this.steam.push(s);
        this.group.add(s);
      }
    }
  }

  update(n: LookNow): void {
    this.brewing += ((n.on ? 1 : 0) - this.brewing) * Math.min(1, n.dt * 8);
    this.lit.visible = this.brewing > 0.02;
    this.switchMat.color.setRGB(1.0, 0.12, 0.05).multiplyScalar((2.2 * this.brewing) / Math.max(0.5, n.exposure));
    const full = n.coffee;
    this.coffee.visible = full > 0.01;
    // (the pot's inside is some 9 cm high to where it narrows)
    this.coffee.scale.y = Math.max(0.001, full * 0.088);
    this.coffeeMat.color.setRGB(0.1, 0.05, 0.022).multiplyScalar(0.15 + 0.85 * n.light);
    for (let i = 0; i < this.steam.length; i++) {
      const s = this.steam[i];
      const ph = (n.t * 0.45 + i / this.steam.length) % 1;
      s.visible = this.brewing > 0.05;
      s.position.set(-0.02 + 0.015 * Math.sin(n.t * 1.3 + i * 2.1), 0.345 + ph * 0.22, 0.01 * Math.cos(n.t * 1.1 + i));
      s.scale.setScalar(0.05 + ph * 0.12);
      s.material.opacity = 0.35 * this.brewing * Math.sin(ph * Math.PI) * (0.4 + 0.6 * n.light);
      s.material.color.setRGB(0.92, 0.92, 0.95);
    }
  }

  dispose(): void {
    disposeGroup(this.group);
  }
}

// ------------------------------------------------------------------ which look for which

/** what the lamp in a cabin gives, by kind: its colour at full brightness (linear) */
// (a desk lamp gives a third of what a motorhome's own lamp under its roof would; the eye at night opens up by 2.6)
export const CABIN_GLOW: Partial<Record<ApplianceKind, THREE.Color>> = {
  lamp: new THREE.Color(1.0, 0.7, 0.42).multiplyScalar(0.2),
  solar: new THREE.Color(1.0, 0.86, 0.62).multiplyScalar(0.06),
  tv: new THREE.Color(0.45, 0.55, 0.75).multiplyScalar(0.09),
};

/** the overlays of an appliance of a kind (pot: a coffee pot on its own) */
export function makeLook(kind: ApplianceKind | 'pot'): ApplianceLook | null {
  switch (kind) {
    case 'tv':
      return new TvLook();
    case 'radio':
      return new ClockLook();
    case 'record':
      return new RecordLook();
    case 'lamp':
      return new LampLook(new THREE.Vector3(0.26, 0.3, 0), { r: 0.0255 }, 0.3, { x: 0.45, z: 0, r: 0.24 }, WARM, 1.0);
    case 'solar':
      return new LampLook(new THREE.Vector3(0, 0.444, 0), { r: 0.0415, h: 0.062 }, 0.36, null, new THREE.Color(1.0, 0.9, 0.7), 0.85);
    case 'pot':
      return new CoffeeLook({ x: 0, z: 0, y0: 0.006 }, false);
    default:
      return null;
  }
}

/** the brightness of a look now, for the light it gives a cabin (0: none) */
export function glowOf(look: ApplianceLook): number {
  return look instanceof LampLook || look instanceof TvLook ? look.glow : 0;
}
