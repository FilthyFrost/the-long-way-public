/** All the new masonry, timber, kerbs and grid bars of a streamed stretch share one box draw. */
import * as THREE from 'three';
import { hash2 } from '../../core/math/rng';
import { RAIL_AT, RAIL_STEP, type RailRun } from '../../core/world/furniture';
import { roadStyleAt, Verge } from '../../core/world/roadStyles';
import { SpineSample } from '../../core/world/spine';
import { TerrainPoint, type World } from '../../core/world/terrain';

const box = new THREE.BoxGeometry();
const up = new THREE.Vector3(0,1,0);
const axis = new THREE.Vector3(1,0,0);
export function roadFixtures(world: World, start: number, end: number, origin: THREE.Vector3, material: THREE.Material, stoneMaterial?: THREE.Material): THREE.InstancedMesh[] {
  const matrices: THREE.Matrix4[] = [], colors: number[] = [];
  // (V6: the walls' stones apart, each drawn as a stone of its own: render/materials.ts surfaceMaterial block)
  const stoneMatrices: THREE.Matrix4[] = [], stoneColors: number[] = [];
  let into = { m: matrices, c: colors };
  const st = new SpineSample(), tp = new TerrainPoint();
  const point = (s: number, d: number) => {
    world.spine.at(s,st);
    const x = st.x-Math.sin(st.phi)*d, z = st.z+Math.cos(st.phi)*d;
    world.shape(x,z,tp);
    return new THREE.Vector3(x,tp.h,z).sub(origin);
  };
  function beam(a: THREE.Vector3,b: THREE.Vector3,y: number,thickness: number,width: number,color: number) {
    const dir = b.clone().sub(a);
    const q = new THREE.Quaternion().setFromUnitVectors(axis,dir.clone().normalize());
    into.m.push(new THREE.Matrix4().compose(a.clone().lerp(b,0.5).addScaledVector(up,y),q,new THREE.Vector3(dir.length(),thickness,width)));
    into.c.push(color);
  }
  const runs: RailRun[] = [];
  world.furniture.between(start,end,[],runs);
  for (const run of runs) {
    for (let s=Math.max(start,run.s0); s<Math.min(end,run.s1); s+=RAIL_STEP) {
      const kind = roadStyleAt(world,s+2).rail;
      if (kind==='steel') continue;
      const d = run.side*RAIL_AT;
      const a = point(s,d), b = point(s+RAIL_STEP,d);
      if (kind==='stone') {
        if (stoneMaterial) into = { m: stoneMatrices, c: stoneColors };
        for (let row=0; row<3; row++) {
          const cuts = row%2 ? [0,0.25,0.74,1] : [0,0.52,1];
          for (let i=1; i<cuts.length; i++) {
            const stone = hash2(s+i,row,world.seed)&3;
            beam(a.clone().lerp(b,cuts[i-1]+0.004),a.clone().lerp(b,cuts[i]-0.004),row*0.24+0.08,0.235,0.48-row*0.065,[0x9c927c,0xb1a68d,0x847e70,0x938975][stone]);
          }
        }
        into = { m: matrices, c: colors };
      } else {
        beam(a,a.clone().addScaledVector(up,0.96),-0.07,0.15,0.15,0x72533c);
        beam(a,b,0.70,kind==='wood'?0.19:0.11,0.13,0x977856);
        beam(a,b,0.37,0.10,0.10,0x80664a);
      }
    }
  }
  const bridge = {river:null,mask:0};
  for (let s=start; s<end; s+=4) {
    const style = roadStyleAt(world,s+2);
    world.water.bridgeAt(s+2,bridge);
    if (bridge.mask>0.01) continue;
    if (style.verge===Verge.kerb) {
      for (const side of [-1,1]) {
        const a = point(s,side*(style.half+0.15));
        // Drop the kerb across the site's entrance.
        if (world.sites.padWeight(s+2,side*4.6)>0.62) continue;
        beam(a,point(s+3.97,side*(style.half+0.15)),0.07,0.15,0.28,0xb6ae9b);
      }
    } else if (style.rail==='fence' && s%512===64 && (hash2(s,96,world.seed)&3)===0) {
      for (let i=0; i<10; i++) {
        const at = s+i*0.16;
        beam(point(at,-style.half),point(at,style.half),0.028,0.042,0.082,0x716f66);
      }
    }
  }
  const out: THREE.InstancedMesh[] = [];
  const color = new THREE.Color();
  for (const [ms, cs, mat] of [[matrices, colors, material], [stoneMatrices, stoneColors, stoneMaterial ?? material]] as const) {
    if (!ms.length) continue;
    const mesh = new THREE.InstancedMesh(box, mat, ms.length);
    ms.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, color.setHex(cs[i])); });
    out.push(mesh);
  }
  return out;
}
