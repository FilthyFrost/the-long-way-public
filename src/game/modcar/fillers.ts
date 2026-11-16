/**
 * Where liquid goes into a part (docs/MODCAR.md §5.3): the oil filler on top of each engine, the water
 * filler on each radiator, the cap on a motorcycle's tank. Each gets a cap you can see — oil caps yellow,
 * water caps blue, as in a real engine bay — and a FILLER marker at its mouth (its +y the way out) that
 * the can lines up with. The motorcycle's tank cap hinges open (pivot_FILLER) over a dark neck
 * (FLAP_FILLER_neck); a car's filler is the flap on the body (carView.ts).
 */
import * as THREE from 'three';
import type { LiquidKind } from '../../core/modcar/tools';

export type FillerKind = LiquidKind;

/** the filler of a part model: what goes in, the top of its cap (model frame, m) and the cap's radius */
export const FILLERS: Record<string, { kind: FillerKind; at: [number, number, number]; r: number }> = {
  eng_i4: { kind: 'oil', at: [0.125, 0.6, 0.05], r: 0.022 },
  eng_v8: { kind: 'oil', at: [0.1, 0.603, 0.295], r: 0.022 },
  eng_d6: { kind: 'oil', at: [0.305, 0.852, -0.112], r: 0.026 },
  eng_i4d: { kind: 'oil', at: [-0.22, 0.688, -0.095], r: 0.024 },
  eng_flat6: { kind: 'oil', at: [0.2, 0.533, -0.1], r: 0.022 },
  eng_single: { kind: 'oil', at: [0.071, 0.436, 0.035], r: 0.017 },
  eng_mower: { kind: 'oil', at: [0.12, 0.334, -0.09], r: 0.016 },
  rad_small: { kind: 'water', at: [0, 0.34, 0.127], r: 0.026 },
  rad_std: { kind: 'water', at: [0, 0.4, 0.163], r: 0.026 },
  rad_big: { kind: 'water', at: [0, 0.5, 0.217], r: 0.026 },
  tank_moto: { kind: 'fuel', at: [0.063, 0.264, 0], r: 0.026 },
};

const CAP_H = 0.016;

function mesh(geo: THREE.BufferGeometry, mat: string, name: string): THREE.Mesh {
  const m = new THREE.MeshStandardMaterial();
  m.name = mat;
  const o = new THREE.Mesh(geo, m);
  o.name = name;
  return o;
}

/** the cap and the marker of a part's filler, put on its model (once, on the loaded model) */
export function addFiller(partId: string, model: THREE.Object3D): void {
  const f = FILLERS[partId];
  if (!f || model.getObjectByName('FILLER')) return;
  const [x, y, z] = f.at;
  const marker = new THREE.Object3D();
  marker.name = 'FILLER';
  marker.userData.filler = f.kind;
  marker.userData.radius = f.r;
  if (f.kind === 'fuel') {
    // a motorcycle's tank: a dark neck under a chrome cap hinged at its front edge
    // (named so that it is never merged with the static parts: it shows and hides)
    const neck = mesh(new THREE.CylinderGeometry(f.r * 0.62, f.r * 0.62, 0.004, 24), 'trim', 'FLAP_FILLER_neck');
    neck.position.set(x, y + 0.001, z);
    neck.visible = false;
    model.add(neck);
    const pivot = new THREE.Group();
    pivot.name = 'pivot_FILLER';
    pivot.position.set(x + f.r, y, z);
    const cap = mesh(new THREE.CylinderGeometry(f.r, f.r * 1.04, 0.012, 28), 'chrome', 'FILLER_cap');
    cap.position.set(-f.r, 0.006, 0);
    pivot.add(cap);
    model.add(pivot);
    marker.position.set(x, y + 0.002, z);
  } else {
    // a screw cap in the colour of what goes in
    const cap = mesh(new THREE.CylinderGeometry(f.r, f.r * 1.08, CAP_H, 28), f.kind === 'oil' ? 'cap_oil' : 'cap_water', 'FILLER_cap');
    cap.position.set(x, y + CAP_H / 2 - 0.004, z);
    const grip = mesh(new THREE.BoxGeometry(f.r * 1.5, 0.006, f.r * 0.32), f.kind === 'oil' ? 'cap_oil' : 'cap_water', 'FILLER_grip');
    grip.position.set(x, y + CAP_H - 0.002, z);
    model.add(cap, grip);
    marker.position.set(x, y + CAP_H, z);
  }
  model.add(marker);
}
