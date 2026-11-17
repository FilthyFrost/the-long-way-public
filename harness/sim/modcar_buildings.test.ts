/**
 * The buildings by the road put together from the building kit (docs/MODCAR.md §20, src/game/modcar/buildingKit.ts,
 * the reference assembler tools/blender/places/kit_test.py): every piece is one the kit has, none is mirrored (the
 * kit's rule: winding never flips), every door stands in the opening the site's walls leave for it, and nothing
 * stands out past the building's eaves, porch or awning.
 */
import fs from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Site, SiteObject } from '../../src/core/world/sites';
import { World } from '../../src/core/world/terrain';
import { buildingKit, KIT_PIECES, kitSeed, leafMatrix } from '../../src/game/modcar/buildingKit';
import { modcarWorldOptions } from '../../src/game/modcar/seamless';

const buildings: { site: Site; o: SiteObject; i: number }[] = [];
for (const seed of [20261118, 7, 314159, 99]) {
  const world = new World(seed, modcarWorldOptions({}));
  const sites: Site[] = [];
  world.sites.between(0, 90_000, sites);
  for (const site of sites) site.objects.forEach((o, i) => o.kind === 'building' && o.b && buildings.push({ site, o, i }));
}

/** a piece's own bounds (glTF axes), from its GLB's positions */
const bounds = new Map<string, THREE.Box3>();
function boundsOf(name: string): THREE.Box3 {
  let b = bounds.get(name);
  if (b) return b;
  const buf = fs.readFileSync(`public/models/modcar/places/kit/${name}.glb`);
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8')) as { meshes: { primitives: { attributes: { POSITION: number } }[] }[]; accessors: { min?: number[]; max?: number[] }[] };
  b = new THREE.Box3();
  for (const mesh of json.meshes) {
    for (const pr of mesh.primitives) {
      const a = json.accessors[pr.attributes.POSITION];
      if (a.min && a.max) b.union(new THREE.Box3(new THREE.Vector3(...a.min), new THREE.Vector3(...a.max)));
    }
  }
  bounds.set(name, b);
  return b;
}

/** where a piece reaches, placed (its bounds' corners through its matrix) */
function reach(name: string, m: THREE.Matrix4): THREE.Box3 {
  const own = boundsOf(name);
  const b = new THREE.Box3();
  for (const x of [own.min.x, own.max.x]) for (const y of [own.min.y, own.max.y]) for (const z of [own.min.z, own.max.z]) b.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(m));
  return b;
}

describe('ModCar buildings from the kit', () => {
  it('there are buildings of every roof and door to try', () => {
    const roofs = new Set(buildings.map((b) => b.o.b!.roof));
    expect(buildings.length).toBeGreaterThan(20);
    expect([...roofs].sort()).toEqual(['flat', 'gable', 'mono']);
  });

  it('every piece is one the kit has, its file is there, and none is mirrored', () => {
    for (const n of KIT_PIECES) expect(fs.existsSync(`public/models/modcar/places/kit/${n}.glb`), n).toBe(true);
    for (const { site, o, i } of buildings) {
      const { pieces, openings } = buildingKit(o, kitSeed(site.seed, i));
      expect(pieces.length, site.id).toBeGreaterThan(30);
      for (const p of pieces) {
        expect(KIT_PIECES as readonly string[], p.name).toContain(p.name);
        expect(p.m.determinant(), `${site.id} ${p.name}`).toBeGreaterThan(0);
      }
      for (const op of openings) for (const l of op.leaves) for (const a of [0, 1.2]) expect(leafMatrix(l, a, new THREE.Matrix4()).determinant()).toBeGreaterThan(0);
    }
  });

  it('a door stands in its opening: where the site’s front wall leaves it, as wide', () => {
    for (const { site, o, i } of buildings) {
      const b = o.b!;
      const { openings } = buildingKit(o, kitSeed(site.seed, i));
      const shed = b.gate && o.w < 5;
      if (b.gate && !shed) {
        expect(openings, `${site.id}: a gate has no leaves`).toHaveLength(0);
        continue;
      }
      expect(openings, site.id).toHaveLength(1);
      const op = openings[0];
      expect(op.cx, site.id).toBeCloseTo(b.doorAt, 6);
      expect(op.width, site.id).toBeCloseTo(b.doorW, 6);
      expect(op.cz, site.id).toBeCloseTo(-o.d / 2 + 0.12, 6);
      expect(op.leaves.length, site.id).toBe(b.doorW > 1.1 ? 2 : 1);
      // shut, a leaf spans its share of the opening on the wall's middle plane
      for (const l of op.leaves) {
        const m = leafMatrix(l, 0, new THREE.Matrix4());
        const hinge = new THREE.Vector3().applyMatrix4(m);
        const far = new THREE.Vector3(1, 0, 0).applyMatrix4(m);
        expect(Math.abs(hinge.z - op.cz), site.id).toBeLessThan(0.01);
        expect(Math.abs(far.z - op.cz), site.id).toBeLessThan(0.01);
        expect(Math.abs(hinge.x - far.x), site.id).toBeCloseTo(op.width / op.leaves.length, 3);
        expect(Math.min(Math.abs(hinge.x - (op.cx - op.width / 2)), Math.abs(hinge.x - (op.cx + op.width / 2))), site.id).toBeLessThan(0.01);
      }
    }
  });

  it('nothing stands out past the eaves, the porch or the awning, nor sinks below its footing', () => {
    for (const { site, o, i } of buildings) {
      const b = o.b!;
      const { pieces } = buildingKit(o, kitSeed(site.seed, i));
      const front = Math.max(0.7, b.porch + 0.6);
      for (const p of pieces) {
        const r = reach(p.name, p.m);
        expect(r.min.x, `${site.id} ${p.name}`).toBeGreaterThan(-o.w / 2 - 1.2);
        expect(r.max.x, `${site.id} ${p.name}`).toBeLessThan(o.w / 2 + 1.2);
        expect(r.max.z, `${site.id} ${p.name}`).toBeLessThan(o.d / 2 + 1.2);
        expect(r.min.z, `${site.id} ${p.name}`).toBeGreaterThan(-o.d / 2 - front - 1.2);
        expect(r.min.y, `${site.id} ${p.name}`).toBeGreaterThan(-1.5);
        expect(r.max.y, `${site.id} ${p.name}`).toBeLessThan(o.h + o.d * 0.4 + 2.6);
      }
    }
  });
});
