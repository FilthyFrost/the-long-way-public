/**
 * What is drawn of the forage points (src/game/modcar/v3/forage/view, node W3), as far as it can be seen
 * without a renderer: the models of the nineteen families in one geometry, each within its box and its budget
 * of triangles; the one instanced batch — which points get an instance, of which family, how large, in which
 * colours; a point that appears growing in, a picked one shrinking away and then gone; what the batch costs to
 * draw (one call) and that writing it allocates nothing; and the system handing its points to it in a game.
 * How it looks is the browser script's pictures (harness/shots/v3_forage.mjs): no shader is compiled here.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ForageField, ForagePoint } from '../../src/core/v3/forage/field';
import { FORAGE_KINDS } from '../../src/core/v3/forage/kinds';
import { PLANTS } from '../../src/core/world/plants';
import { forage } from '../../src/game/modcar/v3/forage/index';
import { buildForageAtlas, FAMILIES, FAMILY_INDEX } from '../../src/game/modcar/v3/forage/view/families';
import { FADE_FAR, FADE_NEAR, forageMaterial } from '../../src/game/modcar/v3/forage/view/material';
import { ForageView } from '../../src/game/modcar/v3/forage/view/view';
import { forageRig, forestSpot, WORLD } from './v3/forageRig';
import { ALLOCATES, heapGrowth } from './v3/heap';

/** the bearing plants within r of the forest spot, as the field gives them, and where the mark would aim at each */
function pointsAt(r: number): { points: ForagePoint[]; n: number; aimY: Float32Array; at: { x: number; y: number; z: number } } {
  const spot = forestSpot();
  const points: ForagePoint[] = [];
  const n = new ForageField(WORLD.flora!).near(spot.x, spot.z, r, points);
  const aimY = new Float32Array(n);
  for (let i = 0; i < n; i++) aimY[i] = points[i].y + 0.3;
  return { points, n, aimY, at: { x: spot.x, y: WORLD.heightAt(spot.x, spot.z), z: spot.z } };
}

const stage = (): { scene: THREE.Scene; origin: { x: number; y: number; z: number } } => ({ scene: new THREE.Scene(), origin: { x: 0, y: 0, z: 0 } });
const ctx = null as never;

describe('forage view: the models', () => {
  it('a family for every model the ground plants that bear are drawn with', () => {
    const wanted = new Set(PLANTS.filter((p) => p.layer === 'ground' && p.bears).map((p) => p.model));
    expect([...wanted].sort()).toEqual([...FAMILIES].sort());
    expect(FAMILIES).toHaveLength(19);
    // (every forage plant has its two colours)
    for (const p of PLANTS) if (p.layer === 'ground' && p.bears) expect(p.tint).toBeDefined();
  });

  it('each within its box, 40 to 200 triangles, every vertex saying whose it is and how to paint it', () => {
    const atlas = buildForageAtlas();
    const g = atlas.geometry;
    const pos = g.getAttribute('position');
    const info = g.getAttribute('aInfo');
    const col = g.getAttribute('color');
    const nrm = g.getAttribute('normal');
    const index = g.getIndex()!;
    expect(atlas.triangles).toHaveLength(FAMILIES.length);
    const lines: string[] = [];
    FAMILIES.forEach((f, i) => {
      expect(atlas.triangles[i], f).toBeGreaterThanOrEqual(40);
      expect(atlas.triangles[i], f).toBeLessThanOrEqual(200);
      lines.push(`${f} ${atlas.triangles[i]}`);
    });
    expect(atlas.total).toBe(atlas.triangles.reduce((a, b) => a + b, 0) + 2);
    expect(index.count).toBe(atlas.total * 3);
    expect(atlas.vertices).toBe(pos.count);
    const box = FAMILIES.map(() => ({ r: 0, lo: Infinity, hi: -Infinity }));
    let glint = 0;
    for (let i = 0; i < pos.count; i++) {
      const fam = info.getZ(i);
      expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
      expect(Math.hypot(nrm.getX(i), nrm.getY(i), nrm.getZ(i))).toBeCloseTo(1, 3);
      if (fam === -1) {
        glint++;
        expect(Math.abs(pos.getX(i))).toBe(1);
        expect(Math.abs(pos.getY(i))).toBe(1);
        continue;
      }
      expect(Number.isInteger(fam) && fam >= 0 && fam < FAMILIES.length).toBe(true);
      const b = box[fam];
      b.r = Math.max(b.r, Math.hypot(pos.getX(i), pos.getZ(i)));
      b.lo = Math.min(b.lo, pos.getY(i));
      b.hi = Math.max(b.hi, pos.getY(i));
      // which colour: a mix of the plant's two, or a fixed one; a tone that is a colour; a sway of 0 … 1.2
      const tint = info.getX(i);
      expect(tint === -1 || (tint >= 0 && tint <= 1)).toBe(true);
      expect(info.getY(i)).toBeGreaterThanOrEqual(0);
      expect(info.getY(i)).toBeLessThanOrEqual(1.2);
      for (const c of [col.getX(i), col.getY(i), col.getZ(i)]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1.6);
      }
    }
    expect(glint).toBe(4);
    FAMILIES.forEach((f, i) => {
      // one unit to the edge of the clump, one unit tall, standing on the ground (a hand of slack either way)
      expect(box[i].r, f).toBeGreaterThan(0.6);
      expect(box[i].r, f).toBeLessThan(1.25);
      expect(box[i].lo, f).toBeGreaterThan(-0.12);
      expect(box[i].lo, f).toBeLessThan(0.15);
      expect(box[i].hi, f).toBeGreaterThan(0.45);
      expect(box[i].hi, f).toBeLessThan(1.3);
    });
    console.log(`[v3 forage] the models: ${atlas.total} triangles and ${atlas.vertices} vertices in one geometry (${lines.join(', ')}, the glint 2)`);
  });

  it('one material: opaque, both faces, the game’s own light and air, the switches the view sets', () => {
    const m = forageMaterial();
    expect(m.transparent).toBe(false);
    expect(m.side).toBe(THREE.DoubleSide);
    for (const u of ['uEye', 'uState', 'uFade', 'uSunDir', 'uSkyColor', 'uWind', 'uTime', 'uWeather', 'uFogColor']) expect(m.uniforms[u], u).toBeDefined();
    expect((m.uniforms.uFade.value as THREE.Vector2).toArray()).toEqual([FADE_NEAR, FADE_FAR]);
    expect(FADE_NEAR).toBe(35);
    expect(FADE_FAR).toBe(45);
    for (const a of ['aInfo', 'iTintA', 'iTintB', 'iData', 'iMore']) expect(m.vertexShader).toContain(`attribute ${a.startsWith('aI') ? 'vec3' : a === 'iData' ? 'vec4' : a === 'iMore' ? 'vec2' : 'vec3'} ${a};`);
  });
});

describe('forage view: the batch', () => {
  it('one mesh, one draw call: a ground plant near by is an instance of its family in its colours, a tree’s or a bush’s point nothing but a glint, and that only close', () => {
    const s = stage();
    const view = new ForageView(s);
    expect(s.scene.children).toEqual([view.mesh]);
    expect(view.mesh.count).toBe(0);
    expect(view.stats()).toMatchObject({ calls: 0, instances: 0 });
    // (the batch casts no shadow: it is in neither of the shadow passes' layers)
    expect(view.mesh.layers.mask).toBe(1);
    const { points, n, aimY, at } = pointsAt(70);
    view.update(1 / 60, ctx, at.x, at.y, at.z, 8, false);
    view.show(points, n, aimY, at);
    const g = view.mesh.geometry;
    const data = g.getAttribute('iData');
    const more = g.getAttribute('iMore');
    const tintA = g.getAttribute('iTintA');
    const count = view.mesh.count;
    expect(count).toBeGreaterThan(5);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const c = new THREE.Color();
    let plants = 0;
    let glints = 0;
    for (let i = 0; i < count; i++) {
      view.mesh.getMatrixAt(i, m);
      m.decompose(p, q, sc);
      const d = Math.hypot(p.x, p.z);
      // which point it is: the one at that place
      const pt = points.slice(0, n).find((x) => Math.abs(x.x - at.x - p.x) < 1e-3 && Math.abs(x.z - at.z - p.z) < 1e-3)!;
      expect(pt).toBeTruthy();
      const plant = PLANTS[pt.plant];
      const fam = data.getX(i);
      if (plant.layer === 'ground') {
        plants++;
        expect(fam).toBe(FAMILY_INDEX[plant.model]);
        expect(d).toBeLessThanOrEqual(FADE_FAR + 15 + 1e-3);
        // stretched to the plant's own crown and height, the small ones a little larger than life
        const k = plant.crown <= 0.4 ? 1.35 : plant.crown >= 0.75 ? 1 : 1.35 - (0.35 * (plant.crown - 0.4)) / 0.35;
        expect(sc.x).toBeCloseTo(Math.max(0.1, plant.crown * pt.size * k), 4);
        expect(sc.y).toBeCloseTo(Math.max(0.06, plant.height * pt.size * k), 4);
        expect(sc.z).toBeCloseTo(sc.x, 4);
        c.setHex(plant.tint![0]);
        expect(tintA.getX(i)).toBeCloseTo(c.r, 5);
        expect(tintA.getY(i)).toBeCloseTo(c.g, 5);
        // its glint stands over its top
        expect(more.getX(i)).toBeCloseTo(sc.y + 0.16, 4);
      } else {
        glints++;
        expect(fam).toBe(-2);
        expect(d).toBeLessThanOrEqual(8 + 10 + 1e-3);
      }
      expect(data.getY(i)).toBe(FORAGE_KINDS[pt.kind].look.glow ? 1 : 0);
      // it has been there long enough to be whole, and is not picked
      expect(data.getW(i)).toBe(1e6);
    }
    const ground = points.slice(0, n).filter((x) => PLANTS[x.plant].layer === 'ground' && Math.hypot(x.x - at.x, x.z - at.z) <= FADE_FAR + 15).length;
    expect(plants).toBe(ground);
    const stats = view.stats();
    expect(stats.calls).toBe(1);
    expect(stats.instances).toBe(count);
    expect(stats.triangles).toBe(count * view.atlas.total);
    expect(stats.drawn).toBeLessThan(count * 202);
    console.log(`[v3 forage] the batch at a forest stop (${n} bearing plants within 70 m): 1 draw call, ${count} instances (${plants} plants, ${glints} glints of trees and bushes), ${stats.triangles} triangles handed to the renderer of which ${stats.drawn} are drawn (the rest, the other families' of each instance, are put outside the view by the vertex shader)`);
    // with the developer's mark every point is in the batch
    view.update(1 / 60, ctx, at.x, at.y, at.z, 8, true);
    view.show(points, n, aimY, at);
    expect(view.mesh.count).toBe(n);
    view.dispose();
    expect(s.scene.children).toEqual([]);
  });

  it('a point that comes to show grows in; a picked one shrinks away where it stands and is then gone', () => {
    const view = new ForageView(stage());
    const { points, n, aimY, at } = pointsAt(40);
    const data = view.mesh.geometry.getAttribute('iData');
    view.update(1 / 60, ctx, at.x, at.y, at.z, 8, false);
    view.show(points, n, aimY, at);
    const count = view.mesh.count;
    // (all new: each appears at this writing)
    for (let i = 0; i < count; i++) expect(data.getZ(i)).toBe(0);
    for (let k = 0; k < 60; k++) view.update(1 / 60, ctx, at.x, at.y, at.z, 8, false);
    const state = view.mesh.material.uniforms.uState.value as THREE.Vector4;
    expect(state.z).toBeCloseTo(1, 5);
    // written again a second later: they are a second old, on the clock that begins anew
    view.show(points, n, aimY, at);
    expect(state.z).toBe(0);
    for (let i = 0; i < count; i++) expect(data.getZ(i)).toBeCloseTo(-1, 4);
    // one fewer shows, then it is back: it grows in again, the others stay as old as they were
    const ground = points.findIndex((x, i) => i < n && PLANTS[x.plant].layer === 'ground');
    const gone = points[ground];
    const rest = points.filter((_x, i) => i < n && i !== ground);
    const restAim = aimY.filter((_y, i) => i !== ground);
    view.show(rest, n - 1, restAim, at);
    expect(view.mesh.count).toBe(count - 1);
    view.update(0.5, ctx, at.x, at.y, at.z, 8, false);
    view.show(points, n, aimY, at);
    let fresh = 0;
    for (let i = 0; i < count; i++) if (data.getZ(i) === 0) fresh++;
    expect(fresh).toBe(1);
    // picked: its instance stays, marked with the moment; a third of a second on it is no longer written
    for (let k = 0; k < 30; k++) view.update(1 / 60, ctx, at.x, at.y, at.z, 8, false);
    view.picked(gone);
    const at0 = [...Array(count).keys()].find((i) => data.getW(i) !== 1e6)!;
    expect(data.getW(at0)).toBeCloseTo(0.5, 4);
    view.update(0.1, ctx, at.x, at.y, at.z, 8, false);
    view.show(rest, n - 1, restAim, at);
    expect(view.mesh.count).toBe(count);
    const dying = [...Array(count).keys()].find((i) => data.getW(i) !== 1e6)!;
    expect(data.getW(dying)).toBeCloseTo(-0.1, 4);
    expect(data.getX(dying)).toBe(FAMILY_INDEX[PLANTS[gone.plant].model]);
    view.update(0.5, ctx, at.x, at.y, at.z, 8, false);
    view.show(rest, n - 1, restAim, at);
    expect(view.mesh.count).toBe(count - 1);
    view.clear();
    expect(view.mesh.count).toBe(0);
  });

  it('it follows the floating origin, and writing it allocates nothing', () => {
    const s = stage();
    const view = new ForageView(s);
    const { points, n, aimY, at } = pointsAt(70);
    view.show(points, n, aimY, at);
    s.origin.x = 1024;
    s.origin.z = -512;
    view.update(1 / 60, ctx, at.x + 3, at.y, at.z, 16, false);
    expect(view.mesh.position.x).toBeCloseTo(at.x - 1024, 6);
    expect(view.mesh.position.z).toBeCloseTo(at.z + 512, 6);
    expect((view.mesh.material.uniforms.uEye.value as THREE.Vector3).x).toBeCloseTo(at.x + 3 - 1024, 6);
    expect((view.mesh.material.uniforms.uState.value as THREE.Vector4).x).toBe(16);
    const write = (): void => {
      view.update(1 / 60, ctx, at.x, at.y, at.z, 8, false);
      view.show(points, n, aimY, at);
    };
    expect(heapGrowth(write)).toBeLessThan(ALLOCATES / 4);
  });
});

describe('forage view: in a game', () => {
  it('the system makes it when the game draws, hands it the points that show, and tells it of a pick', async () => {
    const scene = new THREE.Scene();
    const r = await forageRig({ scene });
    expect(forage.view).toBeInstanceOf(ForageView);
    const view = forage.view as ForageView;
    expect(scene.children).toEqual([view.mesh]);
    r.settle();
    expect(view.mesh.count).toBeGreaterThan(5);
    /** is there an instance where this point stands? (the batch is written about an anchor: the mesh's own place) */
    const drawn = (pt: { x: number; z: number }): boolean => {
      const m = new THREE.Matrix4();
      for (let i = 0; i < view.mesh.count; i++) {
        view.mesh.getMatrixAt(i, m);
        if (Math.abs(view.mesh.position.x + m.elements[12] - pt.x) < 0.01 && Math.abs(view.mesh.position.z + m.elements[14] - pt.z) < 0.01) return true;
      }
      return false;
    };
    const pt = r.shown().find((p) => p.layer === 'ground' && p.dist < 30)!;
    r.frames(1);
    expect(drawn(pt)).toBe(true);
    r.pick(pt);
    // (still in the batch, shrinking; a second on it is gone)
    r.frames(1);
    expect(drawn(pt)).toBe(true);
    r.frames(60);
    expect(drawn(pt)).toBe(false);
    // driving: nothing is drawn
    const w = r.player.walker;
    r.game.seated = { sim: { kmh: 60, px: w.x, py: w.y, pz: w.z } } as never;
    r.frames(2);
    expect(view.mesh.count).toBe(0);
    expect(view.stats().calls).toBe(0);
    r.game.seated = null;
    // a frame with the real view allocates nothing either
    r.settle();
    expect(heapGrowth(() => r.game.frame(1 / 60))).toBeLessThan(ALLOCATES / 4);
    // the game ends: the batch leaves the scene
    r.game.newGame();
    expect(scene.children).toEqual([]);
    expect(r.game.reports).toEqual([]);
  });
});
