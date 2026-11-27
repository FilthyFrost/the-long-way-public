/**
 * J9e (docs/V3/plan/growth.md §六 2): the ladder and the motorcycle rack.
 *   - the frames' ladder mounts: one up the side of every frame with a roof (none on the motorcycle or the trailer, the
 *     Whale's its own model's up its back), outside the body, its foot off the ground, behind the doors' hinges
 *   - the ladder as it is climbed (core/modcar/ladders.ts with core/v3/nd/climb.ts): taken hold of from the ground in
 *     front of it, climbed to just over the roof, let go onto a floor; taken hold of from up there with one's back to
 *     it at its head; the roof's floors raised to a rack's slats
 *   - the motorcycle rack: a part in the hitch's place, the Swallow light enough for it, its tray behind every body
 *   - the plan: the ladder's blueprint first at 4.5–9 km, then every 10–15 km, at the big places, not in the roof
 *     rack's box every time; the motorcycle rack's 2–5 km after the motorcycle
 */
import { describe, expect, it } from 'vitest';
import { fitPart, newInstance, stockBuild } from '../../src/core/modcar/build';
import { derive } from '../../src/core/modcar/derive';
import { FRAMES, frameDef } from '../../src/core/modcar/frames';
import { bodyCut, floorAt, ladderLine, ladderMountOf, ladderSpot, LADDER_SPOTS, roofFloors } from '../../src/core/modcar/ladders';
import { motoTray } from '../../src/core/modcar/motoRack';
import { recipeDef } from '../../src/core/modcar/crafting';
import { boxesOfFinds, planBoxes, planGround } from '../../src/core/modcar/loot';
import { partDef, partsOf } from '../../src/core/modcar/parts';
import { placeFinds, placesPlan, plan, vehiclePlan, type PlanPlace } from '../../src/core/modcar/schedule';
import { CLIMB, climbAlong, takesHold } from '../../src/core/v3/nd/climb';
import type { Site } from '../../src/core/world/sites';
import { modcarWorld } from '../../src/game/modcar/seamless';
import '../../src/core/v3/nd/cards';
// (the modules' own things — the blueprints' — registered as the game installs them)
import.meta.glob('../../src/game/modcar/v3/*/index.ts', { eager: true });

const ROOFED = ['sedan', 'pickup', 'van', 'rv', 'goat', 'wagon', 'fox', 'snail', 'buffalo', 'rhino', 'elephant', 'camel', 'turtle'];

/** where one walking stands in a ladder's own terms (as NdClimb.tryHold measures it), model space */
function inTerms(ln: ReturnType<typeof ladderLine>, feet: { x: number; y: number; z: number }, heading: { x: number; z: number }) {
  const d = { x: ln.head.x - ln.foot.x, y: ln.head.y - ln.foot.y, z: ln.head.z - ln.foot.z };
  const len = Math.hypot(d.x, d.y, d.z);
  const u = { x: d.x / len, y: d.y / len, z: d.z / len };
  const along = (feet.x - ln.foot.x) * u.x + (feet.y - ln.foot.y) * u.y + (feet.z - ln.foot.z) * u.z;
  const sa = Math.max(0, Math.min(len, along));
  const px = ln.foot.x + u.x * sa;
  const pz = ln.foot.z + u.z * sa;
  const dx = feet.x - px;
  const dz = feet.z - pz;
  const out = -(dx * ln.face.x + dz * ln.face.z);
  const side = dx * -ln.face.z + dz * ln.face.x;
  return { out, side, along, len, up: feet.y - ln.foot.y, top: ln.head.y - ln.foot.y, facing: heading.x * ln.face.x + heading.z * ln.face.z };
}

describe('J9e: the ladder', () => {
  it('a ladder mount up the side of every frame with a roof, outside its body, its foot off the ground; none on the motorcycle or the trailer; the Whale has its own', () => {
    for (const f of FRAMES) {
      const lad = f.mounts.filter((m) => m.cat === 'ladder');
      const roof = f.mounts.some((m) => m.cat === 'roof') || f.id === 'turtle';
      if (!roof) {
        expect(lad, `${f.id}: no roof, no ladder`).toHaveLength(0);
        expect(ladderSpot(f.id), f.id).toBeNull();
        continue;
      }
      expect(ROOFED).toContain(f.id);
      const spot = ladderSpot(f.id)!;
      expect(spot, f.id).toBeTruthy();
      if (spot.builtin) {
        expect(f.id).toBe('rv');
        expect(lad, 'the Whale: its own model has its ladder').toHaveLength(0);
        continue;
      }
      expect(lad, f.id).toHaveLength(1);
      const m = lad[0];
      expect(m.side, f.id).toBe(spot.side);
      expect(m.pos).toEqual(ladderMountOf(f.id)!.pos);
      // (its rails outside the body's box, its foot between 0.3 and 1 m up, along the body between its ends)
      expect(Math.abs(m.pos.z), f.id).toBeGreaterThan(f.body.halfWidth);
      expect(Math.abs(m.pos.z), f.id).toBeLessThan(f.body.halfWidth + 0.12);
      expect(Math.sign(m.pos.z)).toBe(m.side);
      expect(m.pos.y, f.id).toBeGreaterThanOrEqual(0.3);
      expect(m.pos.y, f.id).toBeLessThanOrEqual(1.0);
      expect(m.pos.x, f.id).toBeLessThan(f.body.front - 0.3);
      expect(m.pos.x, f.id).toBeGreaterThan(f.body.rear + 0.3);
      // (behind the hinges of the doors on its side: a door opens away from it)
      for (const d of f.mounts.filter((x) => x.cat === 'door' && Math.sign(x.pos.z) === m.side && x.hinge === 'z')) {
        if (d.pos.x < m.pos.x) continue;
        expect(d.pos.x - m.pos.x, `${f.id}: ${d.id}`).toBeGreaterThan(0.25);
      }
      // (the part goes on it, its build derives)
      const b = stockBuild(f.id);
      fitPart(b, m.id, newInstance('ladder'));
      expect(Number.isFinite(derive(b).mass)).toBe(true);
    }
    expect(partsOf('ladder').map((p) => p.id)).toEqual(['ladder']);
    expect(partDef('ladder').ladder!.maxKg).toBeGreaterThan(100);
  });

  it('climbed as a building’s ladder: taken hold of from the ground in front of it, up past its head onto a floor of the roof, back down from up there', () => {
    for (const id of ROOFED) {
      const spot = LADDER_SPOTS[id];
      const floors = roofFloors(spot, null);
      const ln = ladderLine(spot, floors);
      // (the exit on a floor, the head just over it, the way one faces it into the body)
      const top = floorAt(floors, ln.exit.x, ln.exit.z);
      expect(top, `${id}: let go onto a floor`).not.toBeNull();
      expect(ln.head.y - top!, id).toBeCloseTo(0.12, 6);
      expect(ln.exit.y - top!, id).toBeCloseTo(0.02, 6);
      if (spot.side === 0) expect(ln.face).toEqual({ x: 1, z: 0 });
      else expect(ln.face).toEqual({ x: 0, z: -spot.side });
      // walking into it on the ground from in front of it (out from its line, facing it, the stick forward)
      const front = { x: ln.foot.x - ln.face.x * 0.3, y: 0, z: ln.foot.z - ln.face.z * 0.3 };
      expect(takesHold({ ...inTerms(ln, front, ln.face), forward: 1 }), `${id}: from the ground`).toBe('foot');
      // (turned away, or off to its side: not)
      expect(takesHold({ ...inTerms(ln, front, { x: -ln.face.x, z: -ln.face.z }), forward: 1 }), id).toBeNull();
      // up it at two metres a second: past its head in about its length over two
      let s = 0;
      let t = 0;
      let off: string | null = null;
      for (; t < 5 && !off; t += 1 / 60) {
        const k = climbAlong(s, 1, 1 / 60, Math.hypot(ln.head.x - ln.foot.x, ln.head.y - ln.foot.y, ln.head.z - ln.foot.z));
        s = k.s;
        off = k.off;
      }
      expect(off, id).toBe('head');
      expect(t, id).toBeLessThan(1.5);
      // let go up there at the exit: too far in to take hold of it again (walked to the edge by it, one does)
      const atExit = { x: ln.exit.x, y: top!, z: ln.exit.z };
      expect(takesHold({ ...inTerms(ln, atExit, { x: -ln.face.x, z: -ln.face.z }), forward: 1 }), `${id}: at the exit`).toBeNull();
      // at the roof's edge by its head (the floor's nearest to it: a car's ladder may stand just behind its roof's end,
      // its hooks forward over it), one's back to it, walking on: taken hold of from above
      const fl = floors.find((f) => floorAt([f], ln.exit.x, ln.exit.z) !== null)!;
      const ex = Math.max(fl.along[0] + 0.05, Math.min(fl.along[1] - 0.05, ln.head.x + ln.face.x * (CLIMB.standOff + 0.25)));
      const ez = Math.max(fl.across[0] + 0.05, Math.min(fl.across[1] - 0.05, ln.head.z + ln.face.z * (CLIMB.standOff + 0.25)));
      const edge = { x: ex, y: top!, z: ez };
      expect(takesHold({ ...inTerms(ln, edge, { x: -ln.face.x, z: -ln.face.z }), forward: 1 }), `${id}: from above`).toBe('head');
      // (the body's box cut below every floor)
      expect(bodyCut(floors)).toBeLessThan(Math.min(...floors.map((f) => f.top)));
    }
  });

  it('a rack on the roof lifts what one stands on to its slats; another roof part its own height; none, the roof itself', () => {
    for (const id of ROOFED) {
      const spot = LADDER_SPOTS[id];
      const roof = frameDef(id).mounts.find((m) => m.cat === 'roof');
      if (!roof) continue;
      const bare = roofFloors(spot, null);
      expect(bare.map((f) => f.top)).toEqual(spot.floors.map((f) => f.top));
      const racked = roofFloors(spot, { part: 'roof_rack', mountY: roof.pos.y, fitH: roof.fit![2] });
      for (let i = 0; i < racked.length; i++) {
        if (spot.floors[i].rack) {
          expect(racked[i].top, id).toBeCloseTo(Math.max(spot.floors[i].top, roof.pos.y + 0.085 * (roof.fit![2] / 0.15)), 6);
          expect(racked[i].top, id).toBeGreaterThan(roof.pos.y);
        } else expect(racked[i].top).toBe(spot.floors[i].top);
      }
      // (the floor with the rack holds the roof mount's middle: the rack is stood on)
      expect(floorAt(racked, roof.pos.x, 0), id).not.toBeNull();
      // (a light bar lifts nothing)
      expect(roofFloors(spot, { part: 'roof_lightbar', mountY: roof.pos.y, fitH: 0.15 }).map((f) => f.top)).toEqual(bare.map((f) => f.top));
    }
  });
});

describe('J9e: the motorcycle rack', () => {
  it('a part in the hitch’s place (it tows nothing), on every frame with a hitch mount; the Swallow light enough for it; its tray behind every body', () => {
    const rack = partDef('moto_rack');
    expect(rack.cat).toBe('hitch');
    expect(rack.hitch!.maxKg).toBe(0);
    const swallow = derive(stockBuild('moto')).mass;
    expect(swallow).toBeLessThan(rack.hitch!.motoKg!);
    const moto = frameDef('moto');
    let n = 0;
    for (const f of FRAMES) {
      const h = f.mounts.find((m) => m.cat === 'hitch');
      if (!h) {
        expect(!!f.balance || !!f.towed, f.id).toBe(true);
        continue;
      }
      n++;
      const b = stockBuild(f.id);
      fitPart(b, h.id, newInstance('moto_rack'));
      expect(Number.isFinite(derive(b).mass)).toBe(true);
      // (the motorcycle across the tray: its body clear of the carrier's — the carrier's box ends 5 cm past its rear bumper)
      const trayX = h.pos.x + motoTray(f.id).x;
      expect(trayX + moto.body.halfWidth, f.id).toBeLessThan(f.body.rear - 0.05 - 0.05);
      // (its wheels on the tray, off the ground)
      expect(h.pos.y + motoTray(f.id).y, f.id).toBeGreaterThan(0.35);
      expect(h.pos.y + motoTray(f.id).y, f.id).toBeLessThan(0.85);
    }
    // (ten, and the Turtle, the Old Elephant and the Camel: docs/V3/plan/rv.md)
    expect(n).toBe(13);
  });
});

describe('J9e: the plan', () => {
  it('the ladder and the motorcycle rack are learnt from sheets of the third chapter (30–50 km) and made at a bench; the rack’s own sheet still comes 2–5 km after the motorcycle', () => {
    // (docs/V3/plan/finish.md §六 2: parts, fitted as parts are)
    expect(recipeDef('ladder')).toMatchObject({ chapter: 3, cost: { scrap: 45 }, makes: { kind: 'part', part: 'ladder' } });
    expect(recipeDef('moto_rack')).toMatchObject({ chapter: 3, cost: { scrap: 80 }, makes: { kind: 'part', part: 'moto_rack' } });
    for (const seed of [7, 1000, 8919, 31337]) {
      const p = plan(seed, 100);
      // the chapter's blueprint places: its seven sheets and one more, within its kilometres, at the big places
      const bp = p.filter((f) => 'blueprint' in f.thing && f.thing.blueprint === 3);
      expect(bp.length).toBe(8);
      for (const f of bp) {
        expect(f.s / 1000).toBeGreaterThanOrEqual(30);
        expect(f.s / 1000).toBeLessThanOrEqual(50);
        expect(f.themes).toContain('garage');
      }
      const moto = vehiclePlan(seed, 100).find((v) => v.frame === 'moto')!;
      const mr = placesPlan(seed, 100).filter((f) => f.entry === 'moto_rack');
      expect(mr).toHaveLength(1);
      expect(mr[0].thing).toEqual({ item: 'bp_moto_rack' });
      expect(mr[0].s).toBeGreaterThanOrEqual(moto.s + 2000 - 1e-6);
      expect(mr[0].s).toBeLessThanOrEqual(moto.s + 5000 + 1e-6);
    }
  });

  it('laid over real worlds: the second chapter’s blueprint places find places to be at by the 32nd km, most of them of their sorts; the rack’s sheet after the motorcycle', () => {
    const seeds = Number(process.env.ROBOT_SEEDS ?? 8);
    let laid = 0;
    let sorted = 0;
    let all = 0;
    let lastKm = 0;
    for (let k = 0; k < seeds; k++) {
      const seed = 2000 + k * 7919;
      const w = modcarWorld(seed, { worldVersion: 5 }).world;
      const sites: Site[] = [];
      w.sites.between(0, 60_000, sites);
      sites.sort((a, b) => a.s - b.s);
      const places: PlanPlace[] = sites.map((s) => ({ s: s.s, kind: s.kind, boxes: planBoxes(s).length, ground: planGround(s) }));
      const finds = placesPlan(seed, 60);
      const at = placeFinds(finds, places);
      const where = new Map<object, { i: number; box: number }>();
      for (const [i, list] of at) {
        const boxes = boxesOfFinds(sites[i], list);
        list.forEach((f, j) => where.set(f, { i, box: boxes[j] }));
      }
      for (const f of finds) {
        if (!('blueprint' in f.thing) || f.thing.blueprint !== 2) continue;
        all++;
        const wf = where.get(f);
        if (!wf) continue;
        laid++;
        lastKm = Math.max(lastKm, sites[wf.i].s / 1000);
        // (at a place of its sorts, or another when none came within the wait: the plan's way)
        if (f.themes!.includes(sites[wf.i].kind)) sorted++;
      }
      const moto = vehiclePlan(seed, 60).find((v) => v.frame === 'moto');
      const mr = finds.find((f) => f.entry === 'moto_rack');
      if (moto && mr && where.get(mr)) expect(sites[where.get(mr)!.i].s).toBeGreaterThanOrEqual(moto.s + 2000 - 1);
    }
    console.info(`the second chapter's blueprint places over ${seeds} worlds: ${laid} of ${all} laid (${sorted} at a place of their sorts), the last at ${lastKm.toFixed(1)} km`);
    expect(all).toBe(seeds * 6);
    expect(laid).toBeGreaterThanOrEqual(Math.ceil(all * 0.9));
    expect(lastKm).toBeLessThanOrEqual(32);
    // (six sheets' places in eighteen kilometres: a little under half find no place of their sorts within the wait and are
    // at the next place there is — the plan's way with anything)
    expect(sorted).toBeGreaterThanOrEqual(Math.ceil(laid * 0.4));
  }, 300_000);
});
