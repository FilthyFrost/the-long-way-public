/**
 * The toolkit's plants in the shadow map (docs/V3/nodes/P2-flora.md): DOM-free, so that the crowns' growth worker
 * (scene/crowns/crownGrowWorker.ts) makes them as the main thread does.
 */
import * as THREE from 'three';
import { FLORA_TILES } from './atlas';

/**
 * A plant's shadow caster: its geometry with each spray's uv made its own card's (0 … 1), so the shadow pass,
 * which cuts every tree's sprays from the world's one round spray (render/shadow.ts), cuts these the same way.
 */
export function shadowCaster(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const s = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) if (name !== 'uv') s.setAttribute(name, attr);
  s.setIndex(g.index);
  const uv = g.getAttribute('uv');
  const card = g.getAttribute('aCard');
  const local = new Float32Array(uv.count * 2);
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    if (card && card.getX(i) > 0.5) {
      local[i * 2] = (u * FLORA_TILES) % 1;
      local[i * 2 + 1] = (v * FLORA_TILES) % 1;
    } else {
      local[i * 2] = u;
      local[i * 2 + 1] = v;
    }
  }
  s.setAttribute('uv', new THREE.BufferAttribute(local, 2));
  return s;
}
