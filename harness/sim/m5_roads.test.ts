import { expect, it } from 'vitest';
import { World } from '../../src/core/world/terrain';
import { SpineSample } from '../../src/core/world/spine';
import { GroundSample, Surface } from '../../src/core/world/ground';
import { Pavement, roadStyleAt } from '../../src/core/world/roadStyles';
import { buildStrip } from '../../src/game/scene/worldBuild';

it('paints loose road sectors with the same surface the pickup wheels sample', () => {
  const world = new World(7,{worldVersion:2,startBiome:'desert'});
  const st = new SpineSample(), ground = new GroundSample();
  for (const [kind,surface] of [[Pavement.gravel,Surface.Gravel],[Pavement.earth,Surface.Dirt]]) {
    let found = false;
    for (let cell=0;cell<8000;cell++) {
      const s = cell*64+32;
      if (roadStyleAt(world,s).pavement!==kind) continue;
      world.spine.at(s,st);
      world.sample(st.x,st.z,ground);
      if (ground.surface===Surface.Asphalt) continue; // a bridge deck
      expect(ground.surface).toBe(surface);
      for (const level of [0,1,2]) {
        const {geometry} = buildStrip(world,cell,level);
        const attr = geometry.getAttribute('aRoadStyle');
        expect(attr.getX(attr.count-1)).toBe(kind);
        geometry.dispose();
      }
      found=true;
      break;
    }
    expect(found).toBe(true);
  }
});
