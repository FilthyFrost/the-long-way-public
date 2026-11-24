/**
 * Soft light where the game has no lamps that light the ground (docs/ND/PLAN.md, ND5): a disc of light fading from its
 * middle, drawn additively — a neon sign's halo (a sprite about it), a canopy's pool of light on the forecourt under
 * its lamps (a disc on the ground). One texture, made once, shared by all of them.
 */
import * as THREE from 'three';

let disc: THREE.CanvasTexture | null = null;

/** a white disc fading from its middle to nothing at its rim */
export function softDisc(): THREE.CanvasTexture | null {
  if (disc) return disc;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (!g) return null;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  r.addColorStop(0.65, 'rgba(255,255,255,0.16)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  disc = new THREE.CanvasTexture(c);
  disc.colorSpace = THREE.SRGBColorSpace;
  return disc;
}

/** a halo about a lit sign: a sprite `w` by `h` (m) in the light's colour, hidden until lit */
export function makeHalo(color: number, w: number, h: number, strength = 0.6): THREE.Sprite | null {
  const t = softDisc();
  if (!t) return null;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color, transparent: true, opacity: strength, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  s.scale.set(w, h, 1);
  s.name = 'nd:halo';
  s.renderOrder = 22;
  s.visible = false;
  return s;
}

/** a pool of light on the ground: a disc of radius r (m) lying flat, in the light's colour, hidden until lit */
export function makePool(color: number, r: number, strength = 0.32): THREE.Mesh | null {
  const t = softDisc();
  if (!t) return null;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * r, 2 * r),
    new THREE.MeshBasicMaterial({ map: t, color, transparent: true, opacity: strength, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.name = 'nd:pool';
  m.renderOrder = 21;
  m.visible = false;
  return m;
}
