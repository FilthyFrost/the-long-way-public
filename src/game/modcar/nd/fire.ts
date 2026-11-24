/**
 * A camp fire's flames and its glow (docs/ND/PLAN.md, ND5: the camp site's fire, lit by the hand): three crossed cards
 * of flame drawn additively from a painted tongue of fire, licking and swaying, and a soft round glow about it — the
 * light of a fire where the game has no lamps that light the ground. Made once, shared by every fire.
 */
import * as THREE from 'three';

let flameTex: THREE.CanvasTexture | null = null;
let glowTex: THREE.CanvasTexture | null = null;

function tongue(): THREE.CanvasTexture | null {
  if (flameTex) return flameTex;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  if (!g) return null;
  // a tongue of flame: white-yellow at its root, orange up its body, red at its tip, its edge soft
  for (let y = 0; y < 256; y++) {
    const t = y / 255;
    const w = 52 * Math.sin(Math.PI * Math.pow(1 - t, 0.8)) * (0.35 + 0.65 * (1 - t)) + 4;
    const col = t > 0.78 ? [255, 248, 210] : t > 0.45 ? [255, 190, 80] : [240, 96, 40];
    const grad = g.createLinearGradient(64 - w, 0, 64 + w, 0);
    const a = Math.min(1, (1 - t) * 3) * Math.min(1, t * 6);
    grad.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},0)`);
    grad.addColorStop(0.5, `rgba(${col[0]},${col[1]},${col[2]},${a})`);
    grad.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 255 - y, 128, 1);
  }
  flameTex = new THREE.CanvasTexture(c);
  flameTex.colorSpace = THREE.SRGBColorSpace;
  return flameTex;
}

function halo(): THREE.CanvasTexture | null {
  if (glowTex) return glowTex;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (!g) return null;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,190,110,0.55)');
  r.addColorStop(0.35, 'rgba(255,150,70,0.22)');
  r.addColorStop(1, 'rgba(255,120,50,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/** a fire's flames and glow, standing on its ash at the group's origin; animate it with `flicker` */
export function makeFire(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'nd:fire';
  const tex = tongue();
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const geo = new THREE.PlaneGeometry(0.55, 0.8);
  geo.translate(0, 0.4, 0);
  for (let k = 0; k < 3; k++) {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.y = (k * Math.PI) / 3;
    m.userData.k = k;
    m.renderOrder = 24;
    g.add(m);
  }
  const ht = halo();
  if (ht) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ht, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    s.scale.set(3.2, 3.2, 1);
    s.position.y = 0.45;
    s.name = 'nd:fire-glow';
    g.add(s);
  }
  g.visible = false;
  return g;
}

/** the flames licking: each card's height and sway at time t (s) */
export function flicker(g: THREE.Group, t: number): void {
  for (const c of g.children) {
    const k = c.userData.k as number | undefined;
    if (k === undefined) {
      const s = 3.0 + 0.25 * Math.sin(t * 7.3) + 0.15 * Math.sin(t * 13.1);
      c.scale.set(s, s, 1);
      continue;
    }
    const h = 0.82 + 0.16 * Math.sin(t * (9 + k * 2.3) + k) + 0.08 * Math.sin(t * (21 + k * 3.1));
    c.scale.set(0.9 + 0.1 * Math.sin(t * 5 + k * 2), h, 1);
    c.rotation.z = 0.06 * Math.sin(t * (4 + k) + k * 1.7);
  }
}
