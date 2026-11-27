/**
 * What the ND modules share in the game (docs/ND/PLAN.md): a thing's own parts aimed at as devices of their own (a
 * coffee machine's lid, its switch, the cup under its spout; a pot's fruits), the model of a thing lying about, the
 * frame of a thing's model, and a few sounds of their own made on the spot (a shutter, a motor's whine) where the
 * game has none.
 */
import * as THREE from 'three';
import { castMesh } from '../../render/triGrid';
import type { Loose } from '../loose';

/** a box in a model's own frame (the game's: x forward, y up, z = −Blender y), metres */
/**
 * What a buried chest is first found with besides its own loot (docs/ND/PLAN.md, ND4: Nomad Drive's first two, a
 * bobblehead from the world's deck and a tape not had yet): each system that deals its keepsakes pushes a dealer; the
 * chest asks them in turn the first time it is opened (rare: a rare chest). What they deal stands in for as many of
 * its own.
 */
export const chestDealers: ((rare: boolean) => string[])[] = [];

export interface PartBox {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** a box from a centre and a size given in Blender's frame (x, y, z up) as the model's script has them */
export function blenderBox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): PartBox {
  return { min: [cx - sx / 2, cz - sz / 2, -cy - sy / 2], max: [cx + sx / 2, cz + sz / 2, -cy + sy / 2] };
}

const INV = new THREE.Matrix4();
const RAY = new THREE.Ray();
const B3 = new THREE.Box3();
const P = new THREE.Vector3();

/** where the line of sight (render space) meets a box of an object's own frame, null: it misses or is beyond reach */
export function boxHit(obj: THREE.Object3D, ray: THREE.Ray, box: PartBox, reach: number): number | null {
  INV.copy(obj.matrixWorld).invert();
  RAY.copy(ray).applyMatrix4(INV);
  B3.min.set(box.min[0], box.min[1], box.min[2]);
  B3.max.set(box.max[0], box.max[1], box.max[2]);
  const p = RAY.intersectBox(B3, P);
  if (!p) return null;
  // (back in render space: the frame is rigid, its scale one)
  const d = p.applyMatrix4(obj.matrixWorld).distanceTo(ray.origin);
  return d <= reach ? d : null;
}

/**
 * Where the line of sight (render space) first meets one of a model's own meshes (null: none within reach): what of a
 * thing one can look into one sees — the back of an open cupboard, the floor of an open chest — and not its box, which
 * would stand in front of what is in it.
 */
export function meshHit(model: THREE.Object3D | null, ray: THREE.Ray, reach: number): number | null {
  if (!model) return null;
  let best = Infinity;
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const h = castMesh(m, ray.origin, ray.direction, Math.min(reach, best));
    if (h && h.dist < best) best = h.dist;
  });
  return best <= reach ? best : null;
}

/** the model drawn for a thing lying about (its own GLB once that is in), null while it is a stand-in or merged away */
export function modelOf(l: Loose): THREE.Object3D | null {
  const c = l.obj.children;
  for (let i = c.length - 1; i >= 0; i--) if (c[i].name !== 'nd:extra') return c[i];
  return null;
}

/** a marker of a model (its position in the model's frame), or the fallback */
export function markerOf(model: THREE.Object3D | null, name: string, fallback: THREE.Vector3): THREE.Vector3 {
  const o = model?.getObjectByName(name);
  if (!o) return fallback.clone();
  // (the marker's position under the model's root)
  const v = new THREE.Vector3();
  o.updateWorldMatrix(true, false);
  model!.updateWorldMatrix(true, false);
  v.setFromMatrixPosition(o.matrixWorld);
  return model!.worldToLocal(v);
}

/** a group of a system's own drawn with a thing lying about, in its frame (named so modelOf passes it by) */
export function extraOf(l: Loose): THREE.Group {
  let g = l.obj.getObjectByName('nd:extra') as THREE.Group | undefined;
  if (!g) {
    g = new THREE.Group();
    g.name = 'nd:extra';
    l.obj.add(g);
  }
  return g;
}

// ------------------------------------------------------------------ sounds of their own

let audio: AudioContext | null = null;
/** the game's sound (GameContext.audio), once an ND system is set up: its context and the master bus */
let game: { readonly context: AudioContext | null; readonly output: AudioNode | null } | null = null;

/** the ND sounds join the game's master bus from now on (its volume, its mute), once it has started */
export function ndAudio(a: GameAudio | undefined): void {
  if (a) game = a;
}
type GameAudio = { readonly context: AudioContext | null; readonly output: AudioNode | null };

function ac(): AudioContext | null {
  // (the game's own, once it has one: else one of our own — a page with no game sound yet, a test)
  const g = game?.context;
  if (g) return g;
  if (typeof window === 'undefined' || !(window as unknown as { AudioContext?: unknown }).AudioContext) return null;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    return audio;
  } catch {
    return null;
  }
}

/** where a sound of ours goes: the game's master bus when it is in the same context, else straight out */
function dest(c: BaseAudioContext): AudioNode {
  const o = game?.output;
  return o && o.context === c ? o : c.destination;
}

let noiseBuf: AudioBuffer | null = null;
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const b = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (noiseBuf = b);
}

/**
 * a short sound of its own: 'shutter' (an instant camera's clack and its motor pushing the print), 'click', 'tick',
 * 'dig' (a shovel into earth; 'strike' the first, harder), 'beep' (a metal detector's), 'fail' (a lock that will not give)
 */
export function blip(kind: 'shutter' | 'motor' | 'click' | 'tick' | 'dig' | 'strike' | 'beep' | 'fail', gain = 1): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const out = c.createGain();
  out.gain.value = 0.5 * gain;
  out.connect(dest(c));
  const burst = (at: number, dur: number, freq: number, q: number, level: number) => {
    const s = c.createBufferSource();
    s.buffer = noise(c);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t + at);
    g.gain.linearRampToValueAtTime(level, t + at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + at + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t + at, Math.random() * 0.5, dur + 0.05);
  };
  if (kind === 'shutter') {
    burst(0, 0.05, 3200, 1.5, 0.9);
    burst(0.045, 0.07, 1800, 2.0, 0.7);
  } else if (kind === 'motor') {
    // the print pushed out: a buzzing motor for its two seconds
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t);
    o.frequency.linearRampToValueAtTime(96, t + 1.9);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.05);
    g.gain.setValueAtTime(0.12, t + 1.85);
    g.gain.linearRampToValueAtTime(0, t + 2.0);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + 2.05);
  } else if (kind === 'click') burst(0, 0.03, 2600, 3, 0.6);
  else if (kind === 'dig' || kind === 'strike') {
    // the blade into the earth: a low crunch, a scatter of grit after it (the first stroke harder, with a thud)
    const hard = kind === 'strike' ? 1.4 : 1;
    burst(0, 0.12, 420, 0.8, 0.8 * hard);
    burst(0.02, 0.18, 1500, 0.6, 0.35 * hard);
    burst(0.1, 0.22, 3200, 0.5, 0.18);
    if (kind === 'strike') {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
      const g = c.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.16);
    }
  } else if (kind === 'beep' || kind === 'fail') {
    const o = c.createOscillator();
    o.type = kind === 'beep' ? 'sine' : 'square';
    o.frequency.value = kind === 'beep' ? 1850 : 180;
    const g = c.createGain();
    const dur = kind === 'beep' ? 0.045 : 0.12;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(kind === 'beep' ? 0.12 : 0.08, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.01);
    if (kind === 'fail') burst(0, 0.08, 2200, 4, 0.5);
  } else burst(0, 0.015, 4200, 4, 0.35);
}

/** a steady tone that is on or off (a metal detector over what it hears) */
export class Tone {
  private o: OscillatorNode | null = null;
  private g: GainNode | null = null;
  set(on: boolean, hz = 1850, level = 0.07): void {
    const c = ac();
    if (!c) return;
    if (!on) {
      if (this.o) {
        const o = this.o;
        this.g!.gain.setTargetAtTime(0, c.currentTime, 0.04);
        setTimeout(() => o.stop(), 250);
        this.o = null;
        this.g = null;
      }
      return;
    }
    if (!this.o) {
      this.g = c.createGain();
      this.g.gain.value = 0;
      this.g.connect(dest(c));
      this.o = c.createOscillator();
      this.o.type = 'sine';
      this.o.connect(this.g);
      this.o.start();
    }
    this.o.frequency.setTargetAtTime(hz, c.currentTime, 0.02);
    this.g!.gain.setTargetAtTime(level, c.currentTime, 0.02);
  }
}

/** a motor's whine that follows a speed (0 … 1): a grinder's disc */
export class Whine {
  private o: OscillatorNode | null = null;
  private o2: OscillatorNode | null = null;
  private g: GainNode | null = null;
  private n: AudioBufferSourceNode | null = null;
  private ng: GainNode | null = null;

  set(spin: number, load: number): void {
    const c = ac();
    if (!c) return;
    if (spin <= 0.002) {
      this.stop();
      return;
    }
    if (!this.o) {
      this.g = c.createGain();
      this.g.gain.value = 0;
      this.g.connect(dest(c));
      this.o = c.createOscillator();
      this.o.type = 'sawtooth';
      this.o2 = c.createOscillator();
      this.o2.type = 'square';
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 3500;
      this.o.connect(f);
      this.o2.connect(f);
      f.connect(this.g);
      this.o.start();
      this.o2.start();
      this.n = c.createBufferSource();
      this.n.buffer = noise(c);
      this.n.loop = true;
      const nf = c.createBiquadFilter();
      nf.type = 'highpass';
      nf.frequency.value = 2500;
      this.ng = c.createGain();
      this.ng.gain.value = 0;
      this.n.connect(nf).connect(this.ng).connect(dest(c));
      this.n.start();
    }
    const t = c.currentTime;
    const hz = 120 + 520 * spin - 60 * load;
    this.o.frequency.setTargetAtTime(hz, t, 0.05);
    this.o2!.frequency.setTargetAtTime(hz * 2.01, t, 0.05);
    this.g!.gain.setTargetAtTime(0.07 * spin, t, 0.05);
    this.ng!.gain.setTargetAtTime(0.16 * load * spin, t, 0.04);
  }

  stop(): void {
    if (!this.o) return;
    const c = this.g!.context;
    const t = c.currentTime;
    this.g!.gain.setTargetAtTime(0, t, 0.03);
    this.ng!.gain.setTargetAtTime(0, t, 0.03);
    const o = this.o;
    const o2 = this.o2!;
    const n = this.n!;
    setTimeout(() => {
      o.stop();
      o2.stop();
      n.stop();
    }, 200);
    this.o = this.o2 = null;
    this.n = null;
    this.g = this.ng = null;
  }
}

/** the hiss of something frying (0 … 1 how loud: as near as the nearest pan), a crackle in it now and then */
export class Sizzle {
  private n: AudioBufferSourceNode | null = null;
  private g: GainNode | null = null;
  private f: BiquadFilterNode | null = null;
  private level = 0;

  set(level: number): void {
    const c = ac();
    if (!c) return;
    if (level <= 0.002) {
      if (this.n && this.level > 0) this.g!.gain.setTargetAtTime(0, c.currentTime, 0.08);
      this.level = 0;
      return;
    }
    if (!this.n) {
      this.n = c.createBufferSource();
      this.n.buffer = noise(c);
      this.n.loop = true;
      this.f = c.createBiquadFilter();
      this.f.type = 'bandpass';
      this.f.frequency.value = 4200;
      this.f.Q.value = 0.7;
      this.g = c.createGain();
      this.g.gain.value = 0;
      this.n.connect(this.f).connect(this.g).connect(dest(c));
      this.n.start();
    }
    this.level = level;
    const t = c.currentTime;
    // (a crackle: the level jumps for a moment)
    const pop = Math.random() < 0.08 ? 1.8 : 1;
    this.g!.gain.setTargetAtTime(0.06 * level * pop, t, 0.03);
    this.f!.frequency.setTargetAtTime(3600 + Math.random() * 1600, t, 0.05);
  }
}

/**
 * Turns a thing that has just been put down from the hands to face the one who put it down (the game lays a thing
 * down facing the way one looks: a stove's knobs, a machine's switch, a cupboard's doors would face away). A system
 * tells it each frame what is in the hands (`saw`), and asks of each thing that has come to lie about whether it is
 * the one that was in them (`face`).
 */
export class FaceTheHand {
  private uid = '';
  private at = -1;
  /** what is in the hands now (the item's uid, '' nothing), and the time */
  saw(uid: string, now: number): void {
    if (uid) {
      this.uid = uid;
      this.at = now;
    }
  }
  /** a thing lying about that was in the hands a moment ago: turned to face back the way it came; true when turned */
  face(l: Loose, now: number): boolean {
    if (!l.item || l.item.uid !== this.uid || now - this.at > 0.5 || l.riding) return false;
    this.uid = '';
    l.yaw += Math.PI;
    l.obj.rotation.set(0, -l.yaw, 0);
    return true;
  }
}
