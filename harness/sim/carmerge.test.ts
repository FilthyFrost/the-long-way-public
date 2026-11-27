/**
 * ModCar car materials and merging, checked in Node (specs/art/CAR_LOOK.md §9, src/game/render/carMaterials.ts,
 * src/game/render/carMerge.ts): names map to materials shared per car, transparent ones stay out of the
 * shadow maps, the body height and cabin are measured as the look needs them, lamps light by where they
 * sit, ghosts get their depth and x-ray twins, and a merged car keeps every part's colour, wear and id in
 * its own stretch of the vertex attributes (updatePart rewrites only that stretch).
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyGhost, CarLook, carMaterialName, measureCarShape } from '../../src/game/render/carMaterials';
import { MergedCar, mergeCarParts } from '../../src/game/render/carMerge';
import { LAYER_SHADOW_FAR } from '../../src/game/render/shadow';

/** a box mesh with a GLB-style material name, placed at (x, y, z) */
function box(name: string, sx: number, sy: number, sz: number, x: number, y: number, z: number): THREE.Mesh {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const ao = new Float32Array(g.getAttribute('position').count * 4).fill(1);
  g.setAttribute('color', new THREE.Float32BufferAttribute(ao, 4));
  const m = new THREE.MeshStandardMaterial();
  m.name = name;
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  return mesh;
}

/** a small car: a painted body, a chrome bumper, a glass pane, seats, a roof load */
function smallCar(): THREE.Group {
  const car = new THREE.Group();
  car.add(box('paint', 4, 1.0, 1.6, 0, 0.75, 0));
  car.add(box('paint_b.001', 1.6, 0.1, 1.4, -0.3, 1.3, 0));
  car.add(box('chrome', 0.1, 0.12, 1.6, 2.05, 0.4, 0));
  car.add(box('glass', 0.02, 0.4, 1.3, 0.6, 1.05, 0));
  car.add(box('leather', 0.5, 0.5, 0.5, -0.3, 0.6, -0.35));
  car.add(box('fabric', 1.2, 0.05, 1.2, -0.3, 0.3, 0));
  // a load strapped to the roof: neither body nor cabin
  car.add(box('ceramic', 0.4, 0.5, 0.4, -0.6, 1.65, 0));
  car.add(box('fabric', 0.05, 0.6, 1.4, -0.6, 1.6, 0));
  return car;
}

describe('car materials', () => {
  it('maps names to one shared material per name, glass out of the shadow maps', () => {
    expect(carMaterialName('paint.001')).toBe('paint');
    expect(carMaterialName('Chrome')).toBe('chrome');
    expect(carMaterialName('steel_brushed')).toBeNull();
    const car = smallCar();
    car.add(box('mystery', 0.1, 0.1, 0.1, 0, 2, 0));
    const look = new CarLook().apply(car);
    const paints = new Set<THREE.Material>();
    car.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.Material).name === 'car:paint') paints.add(m.material as THREE.Material);
    });
    expect(paints.size).toBe(1);
    expect([...look.unknown]).toEqual(['mystery']);
    const glass = car.children.find((o) => ((o as THREE.Mesh).material as THREE.Material).name === 'car:glass')!;
    expect(((glass as THREE.Mesh).material as THREE.Material).transparent).toBe(true);
    expect(glass.userData.carNoShadow).toBe(true);
  });

  it('measures the painted body and the cabin, leaving the roof load out', () => {
    const shape = measureCarShape(smallCar());
    expect(shape.bodyHeight).toBeCloseTo(1.35, 2);
    expect(shape.cabin).not.toBeNull();
    const c = shape.cabin!;
    // round the seat and the carpet, kept under the roof skin, the strap on the roof not in it
    expect(c.min.y).toBeLessThan(0.3);
    expect(c.max.y).toBeLessThanOrEqual(1.35 - 0.05 + 1e-9);
    expect(c.max.x).toBeLessThan(0.5);
  });

  it('finds no cabin where nothing roofs it over (a bike: a saddle and dials in the open air)', () => {
    const bike = new THREE.Group();
    // the frame and tank, in front of the rider; the saddle and the dials, nothing over them but the sky
    bike.add(box('paint', 0.5, 0.25, 0.25, 0.25, 0.85, 0));
    bike.add(box('paint', 1.6, 0.1, 0.12, 0, 0.45, 0));
    bike.add(box('leather', 0.5, 0.1, 0.25, -0.35, 0.78, 0));
    bike.add(box('gauge', 0.1, 0.1, 0.1, 0.55, 1.0, 0));
    expect(measureCarShape(bike).cabin).toBeNull();
  });

  it('measures meshes that already wear car materials (the game swaps them first)', () => {
    const car = smallCar();
    new CarLook().apply(car);
    const shape = measureCarShape(car);
    expect(shape.bodyHeight).toBeCloseTo(1.35, 2);
    expect(shape.cabin).not.toBeNull();
  });

  it('lights lamps by where they sit: reversing at the back, indicators by side', () => {
    const look = new CarLook();
    const head = look.material('lens_head');
    const amber = look.material('lens_amber');
    const tail = look.material('lens_tail');
    look.setLights({ head: 1, reverse: false, turnLeft: true, brake: 1, tail: true });
    const q = (m: THREE.ShaderMaterial): number[] => (m.uniforms.uLampQ.value as THREE.Vector4).toArray();
    const [hfl, hfr, hrl, hrr] = q(head);
    expect(hfl).toBeGreaterThan(0);
    expect(hfr).toBe(hfl);
    expect(hrl).toBe(0);
    expect(hrr).toBe(0);
    look.setLights({ reverse: true });
    expect(q(head)[2]).toBeGreaterThan(0);
    const [afl, afr, arl, arr] = q(amber);
    expect(afl).toBeGreaterThan(0);
    expect(arl).toBe(afl);
    expect(afr).toBe(0);
    expect(arr).toBe(0);
    expect(q(tail).every((v) => v > 1)).toBe(true);
  });

  it('fixes body height and cabin when told to, and measures again when asked', () => {
    const look = new CarLook();
    look.setBodyHeight(2.9);
    look.setCabin(null);
    look.apply(smallCar());
    const m = look.material('paint');
    expect(m.uniforms.uBodyHeight.value).toBe(2.9);
    expect((m.uniforms.uCabinMin.value as THREE.Vector3).x).toBeGreaterThan((m.uniforms.uCabinMax.value as THREE.Vector3).x);
    look.setBodyHeight(null);
    look.setCabin(undefined);
    look.apply(smallCar());
    expect(m.uniforms.uBodyHeight.value).toBeCloseTo(1.35, 2);
    expect((m.uniforms.uCabinMin.value as THREE.Vector3).x).toBeLessThan((m.uniforms.uCabinMax.value as THREE.Vector3).x);
  });

  it('keeps the weather off a car under a roof, for every material of it', () => {
    const look = new CarLook();
    const paint = look.material('paint');
    const glass = look.material('glass');
    expect(paint.uniforms.uShelter.value).toBe(0);
    look.setShelter(1);
    expect(paint.uniforms.uShelter.value).toBe(1);
    // (one uniform for the whole car: a material made later shares it)
    expect(glass.uniforms.uShelter).toBe(paint.uniforms.uShelter);
    expect(look.material('rubber').uniforms.uShelter.value).toBe(1);
    look.setShelter(7);
    expect(paint.uniforms.uShelter.value).toBe(1);
  });

  it('gives ghosts a depth twin and an always-on 20% see-through x-ray twin (ND holograms)', () => {
    const part = new THREE.Group();
    part.add(box('steel', 0.5, 0.5, 0.5, 0, 0, 0));
    applyGhost(part, 'replace');
    const mesh = part.children[0] as THREE.Mesh;
    expect(mesh.children.filter((c) => c.userData.ghostDepth)).toHaveLength(1);
    expect(mesh.children.filter((c) => c.userData.ghostXray)).toHaveLength(1);
    expect(mesh.layers.isEnabled(LAYER_SHADOW_FAR)).toBe(false);
    applyGhost(part, 'empty');
    expect(mesh.children.filter((c) => c.userData.ghostXray)).toHaveLength(1);
    expect(mesh.children.filter((c) => c.userData.ghostDepth)).toHaveLength(1);
    applyGhost(part, 'empty', true);
    expect(mesh.children.filter((c) => c.userData.ghostXray)).toHaveLength(1);
  });
});

describe('merged cars', () => {
  /** a frame with a body (id 1), a door-like part (id 2) and its mirrored twin (id 3), a moving panel */
  function holderTree(): { model: THREE.Group; body: THREE.Group; left: THREE.Group; right: THREE.Group } {
    const model = new THREE.Group();
    const body = new THREE.Group();
    body.add(box('paint', 4, 1, 1.6, 0, 0.75, 0), box('chrome', 0.1, 0.12, 1.6, 2.05, 0.4, 0));
    const panel = new THREE.Group();
    panel.name = 'pivot_hood';
    panel.add(box('paint', 1, 0.05, 1.4, 1.4, 1.3, 0));
    body.add(panel);
    const left = new THREE.Group();
    left.name = 'part_mirror_L';
    left.add(box('paint', 0.1, 0.1, 0.2, 0.4, 1.0, 0), box('rubber', 0.05, 0.05, 0.05, 0.4, 0.92, 0.05));
    left.position.set(0, 0, -0.9);
    const right = left.clone();
    right.name = 'part_mirror_R';
    right.position.set(0, 0, 0.9);
    right.scale.z = -1;
    model.add(body, left, right);
    return { model, body, left, right };
  }

  it('merges per material, leaves moving pieces out, hides and restores the originals', () => {
    const t = holderTree();
    const merged = new MergedCar(t.model, [
      { id: 1, object: t.body, look: { paint: 0x9e2f22 } },
      { id: 2, object: t.left, look: { paint: 0x2f5f8a, dirt: 0.5 } },
      { id: 3, object: t.right, look: { paint: 0x2f5f8a } },
    ]);
    t.model.add(merged.group);
    const names = merged.group.children.map((c) => c.name).sort();
    expect(names).toEqual(['merged:chrome', 'merged:paint', 'merged:rubber']);
    expect(merged.calls).toBe(3);
    // the hinged panel is not merged and stays visible; the merged originals are hidden
    expect(t.body.getObjectByName('pivot_hood')!.children[0].visible).toBe(true);
    expect(t.body.children[0].visible).toBe(false);
    const paint = merged.group.getObjectByName('merged:paint') as THREE.Mesh;
    // body box (24 vertices) + two mirror boxes; not the hood
    expect(paint.geometry.getAttribute('position').count).toBe(24 * 3);
    expect(paint.layers.isEnabled(LAYER_SHADOW_FAR)).toBe(true);
    merged.dispose();
    expect(t.body.children[0].visible).toBe(true);
    expect(t.model.children.includes(merged.group)).toBe(false);
  });

  it('rewrites only the stretch of one part when its paint or wear changes', () => {
    const t = holderTree();
    const merged = new MergedCar(t.model, [
      { id: 1, object: t.body, look: { paint: 0x9e2f22 } },
      { id: 2, object: t.left, look: { paint: 0x2f5f8a, dirt: 0.5 } },
      { id: 3, object: t.right, look: { paint: 0x2f5f8a } },
    ]);
    const paint = merged.group.getObjectByName('merged:paint') as THREE.Mesh;
    const pa = paint.geometry.getAttribute('aPaint') as THREE.BufferAttribute;
    const wa = paint.geometry.getAttribute('aWear') as THREE.BufferAttribute;
    const id = paint.geometry.getAttribute('aPartId') as THREE.BufferAttribute;
    const before = Array.from(pa.array as Float32Array);
    merged.updatePart(2, { paint: 0xd9a441, rust: 0.7 });
    const yellow = new THREE.Color(0xd9a441);
    for (let i = 0; i < pa.count; i++) {
      const pid = id.getX(i);
      if (pid === 2) {
        expect(pa.getX(i)).toBeCloseTo(yellow.r, 5);
        expect(wa.getX(i)).toBeCloseTo(0.5, 5);
        expect(wa.getY(i)).toBeCloseTo(0.7, 5);
      } else {
        expect(pa.getX(i)).toBe(before[i * 3]);
        expect(wa.getY(i)).toBe(0);
      }
    }
    // the rubber of part 2 carries its wear too, but no paint attribute at all
    const rubber = merged.group.getObjectByName('merged:rubber') as THREE.Mesh;
    expect(rubber.geometry.hasAttribute('aPaint')).toBe(false);
    const rw = rubber.geometry.getAttribute('aWear') as THREE.BufferAttribute;
    const rid = rubber.geometry.getAttribute('aPartId') as THREE.BufferAttribute;
    for (let i = 0; i < rw.count; i++) if (rid.getX(i) === 2) expect(rw.getY(i)).toBeCloseTo(0.7, 5);
    expect(pa.updateRanges.length).toBeGreaterThan(0);
  });

  it('keeps a mirrored part the right way out', () => {
    const t = holderTree();
    const merged = new MergedCar(t.model, [{ id: 3, object: t.right, look: { paint: 0x2f5f8a } }]);
    const paint = merged.group.getObjectByName('merged:paint') as THREE.Mesh;
    const g = paint.geometry;
    const p = g.getAttribute('position');
    const ix = g.index!;
    const centre = new THREE.Vector3(0.4, 1.0, 0.9);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    let outward = 0;
    for (let i = 0; i < ix.count; i += 3) {
      a.fromBufferAttribute(p, ix.getX(i));
      b.fromBufferAttribute(p, ix.getX(i + 1));
      c.fromBufferAttribute(p, ix.getX(i + 2));
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      const mid = a.clone().add(b).add(c).divideScalar(3).sub(centre);
      if (n.dot(mid) > 0) outward++;
    }
    expect(outward).toBe(ix.count / 3);
  });

  it('says which part a ray meets: by the face it hits, and by the boxes', () => {
    const t = holderTree();
    const merged = new MergedCar(t.model, [
      { id: 1, object: t.body, look: { paint: 0x9e2f22 } },
      { id: 2, object: t.left, look: { paint: 0x2f5f8a } },
    ]);
    t.model.add(merged.group);
    t.model.updateMatrixWorld(true);
    // from the left of the car, level with the mirror
    const ray = new THREE.Ray(new THREE.Vector3(0.4, 1.0, -5), new THREE.Vector3(0, 0, 1));
    const rc = new THREE.Raycaster(ray.origin, ray.direction);
    const hits = rc.intersectObject(merged.group, true);
    expect(merged.partAt(hits[0])).toBe(2);
    expect(merged.pick(ray)?.id).toBe(2);
    const low = new THREE.Ray(new THREE.Vector3(0, 0.5, -5), new THREE.Vector3(0, 0, 1));
    expect(merged.pick(low)?.id).toBe(1);
    expect(merged.boxOf(2)!.max.z).toBeLessThan(-0.7);
  });

  it('mergeCarParts gives one mesh per material and the per-part attributes', () => {
    const t = holderTree();
    const group = mergeCarParts(
      [
        { object: t.body, id: 1 },
        { object: t.left, id: 2, paint: 0x2f5f8a, dirt: 0.4 },
      ],
      t.model,
    );
    const paint = group.getObjectByName('merged:paint') as THREE.Mesh;
    expect(paint.geometry.hasAttribute('aPaint')).toBe(true);
    expect(paint.geometry.hasAttribute('aWear')).toBe(true);
    expect(paint.geometry.hasAttribute('aPartId')).toBe(true);
    // (mergeCarParts merges whatever it is given: the hood under the body is in it)
    expect(paint.geometry.getAttribute('position').count).toBe(24 * 3);
  });
});
