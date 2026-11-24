/**
 * ND9 (docs/V3/plan/growth.md §三, its last paragraph): Nomad Drive's buildings in the places' dice of a new game's
 * world — world version 6 (core/world/rules.ts), version 5's road and land with them (core/world/sites.ts, the dice's
 * cards core/world/prefabs.ts PREFAB_DICE, their boxes and yards core/v3/nd/cards.ts):
 *   - a world of version 5 is the world it was (its places hash as they did before ND9); one of version 6 is its road
 *     and its land, the same seed the same world however it is asked
 *   - over many worlds every one of the 25 buildings comes, ours keep coming (the filling station, the camp and the works
 *     each in both their looks), none swamps the road; the counts a hundred kilometres
 *   - a building the dice lay: on its own flat levelled ground facing the road, a big one's yard beside it, the boxes the
 *     plan's finds go in (nothing of their own in them, the building's own things not at their spots), its sort of place
 *   - the plan's finds land in their boxes by their sorts; the new things wait for the plan's first (heldBackUntil)
 *   - a vehicle to find at one of them stands in its yard (j9_wrecks holds it too)
 */
import { describe, expect, it } from 'vitest';
import '../../src/core/v3/nd/cards';
// (the modules' own things — the kitchen's, the blueprints' — registered as the game installs them)
import.meta.glob('../../src/game/modcar/v3/*/index.ts', { eager: true });
import { ND_BOXES, ND_BUILDINGS } from '../../src/core/v3/nd/cards';
import { boxesOfFinds, ownRoll, planBoxes, planGround } from '../../src/core/modcar/loot';
import { heldBackUntil, placesPlan, SitePlanner, THEME_WAIT_M, VEHICLE_PLACES, type PlannedFind } from '../../src/core/modcar/schedule';
import { PREFAB_DICE, prefabCard } from '../../src/core/world/prefabs';
import { NEWEST_WORLD } from '../../src/core/world/rules';
import type { Site } from '../../src/core/world/sites';
import { SpineSample } from '../../src/core/world/spine';
import { TerrainPoint, type World } from '../../src/core/world/terrain';
import { modcarWorld } from '../../src/game/modcar/seamless';
import { VehicleFinds } from '../../src/game/modcar/wrecks';

const SEEDS = Array.from({ length: 24 }, (_, k) => (k === 0 ? 7 : 1000 + k * 7919));

function sitesOf(w: World, km: number): Site[] {
  const out: Site[] = [];
  w.sites.between(0, km * 1000, out);
  return out.sort((a, b) => a.s - b.s);
}

/** a fingerprint of worlds' places down their first km, in the order the plan has them (positions to the millimetre) */
function fingerprint(ws: readonly World[], km: number): string {
  const r3 = (x: number): number => Math.round(x * 1000);
  let h = 0x811c9dc5;
  const mix = (s: string): void => {
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  };
  for (const w of ws) {
    const out: Site[] = [];
    w.sites.between(0, km * 1000, out);
    for (const s of out) {
      mix(`${s.id}|${s.kind}|${s.prefab}|${r3(s.x)}|${r3(s.z)}|${r3(s.y)}|${s.halfL}|${s.depth}|${s.seed}`);
      for (const o of s.objects) mix(`${o.kind}${r3(o.x)},${r3(o.z)},${r3(o.y)},${r3(o.yaw)},${o.v}`);
      for (const c of s.containers) mix(`${c.id}${c.kind}${r3(c.x)},${r3(c.z)},${c.seed}`);
      for (const l of s.loose) mix(`${l.id}${l.item}${r3(l.x)},${r3(l.z)}`);
      for (const f of s.fuel) mix(`${f.id}${f.litres}`);
    }
  }
  return (h >>> 0).toString(16);
}

/** what a place is, for the counts: one of theirs by its card, ours by its kind (the verges' wrecks and crates apart) */
const lookOf = (s: Site): string => (s.prefab ? `nd:${s.prefab}` : s.kind);
const isVerge = (s: Site): boolean => s.kind === 'roadside' && !s.prefab;

describe('ND9: Nomad Drive’s buildings in the places’ dice (world version 6)', () => {
  it('a world of version 5 is the world it was; one of version 6 is its road and its land, the same for a seed however it is asked', () => {
    // (recorded at 1e5709cf, before ND9: seeds 7, 1000, 8919, 16838, 200 km each, 1393 places and verges)
    const v5 = [7, 1000, 8919, 16838].map((seed) => modcarWorld(seed, { worldVersion: 5 }).world);
    expect(v5.reduce((n, w) => n + sitesOf(w, 200).length, 0)).toBe(1393);
    expect(fingerprint(v5, 200)).toBe(FP_V5);
    // version 6: the same road, the same land away from the places
    const w5 = v5[0];
    const w6 = modcarWorld(7, { worldVersion: 6 }).world;
    expect(w6.rules.version).toBe(6);
    const a = new SpineSample();
    const b = new SpineSample();
    const p5 = new TerrainPoint();
    const p6 = new TerrainPoint();
    for (let s = 0; s < 120_000; s += 997) {
      w5.spine.at(s, a);
      w6.spine.at(s, b);
      expect([b.x, b.z, b.y, b.phi]).toEqual([a.x, a.z, a.y, a.phi]);
      // (300 m off the road: no place's levelled ground reaches so far)
      const nx = -Math.sin(a.phi) * 300;
      const nz = Math.cos(a.phi) * 300;
      w5.shape(a.x + nx, a.z + nz, p5);
      w6.shape(a.x + nx, a.z + nz, p6);
      expect(p6.h).toBe(p5.h);
    }
    // … and its places otherwise: Nomad Drive's among them; the same seed the same world, asked from the start or from far down first
    const one = modcarWorld(7, { worldVersion: 6 }).world;
    const two = modcarWorld(7, { worldVersion: 6 }).world;
    two.sites.sitesOf(150);
    expect(fingerprint([two], 200)).toBe(fingerprint([one], 200));
    expect(sitesOf(one, 200).some((s) => s.prefab)).toBe(true);
    expect(fingerprint([one], 200)).not.toBe(fingerprint([w5], 200));
  });

  it('over many worlds every one of the 25 comes, ours keep coming — the filling station, the camp and the works in both their looks — and none swamps the road', () => {
    const KM = 300;
    const count = new Map<string, number>();
    let places = 0;
    let nd = 0;
    const per = (x: number): number => (x / SEEDS.length) * (100 / KM);
    for (const seed of SEEDS) {
      for (const s of sitesOf(modcarWorld(seed, { worldVersion: NEWEST_WORLD }).world, KM)) {
        if (isVerge(s)) continue;
        places++;
        if (s.prefab) nd++;
        count.set(lookOf(s), (count.get(lookOf(s)) ?? 0) + 1);
      }
    }
    const rows = [...count.entries()].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${per(v).toFixed(1)}`);
    console.info(`${SEEDS.length} worlds of version ${NEWEST_WORLD}, ${KM} km each: ${per(places).toFixed(1)} places a hundred kilometres, ${per(nd).toFixed(1)} of them Nomad Drive's (${((nd / places) * 100).toFixed(0)} %) — ${rows.join(', ')}`);
    // every card the dice name, each a few times a hundred kilometres at most
    for (const d of PREFAB_DICE) {
      expect(count.get(`nd:${d.id}`) ?? 0, d.id).toBeGreaterThan(0);
      expect(per(count.get(`nd:${d.id}`) ?? 0), d.id).toBeGreaterThan(0.2);
      expect(per(count.get(`nd:${d.id}`) ?? 0), d.id).toBeLessThan(3);
    }
    // (all 25 of them: the 15 big and the 10 small)
    expect(PREFAB_DICE.length).toBe(25);
    expect(new Set(PREFAB_DICE.map((d) => d.id))).toEqual(new Set(Object.keys(ND_BUILDINGS)));
    // ours still: both looks of the filling station, the camp and the works
    for (const k of ['station', 'camp', 'works', 'garage', 'shop', 'house', 'jetty', 'hide', 'lookout', 'lighthouse']) expect(count.get(k) ?? 0, k).toBeGreaterThan(0);
    for (const k of ['nd:station', 'nd:camp', 'nd:factory1', 'nd:containeryard']) expect(count.get(k) ?? 0, k).toBeGreaterThan(0);
    // a mix: theirs a quarter of the places or so, nothing a sixth of them; the workshops and shops as often as before (v5: 12.8 and 8.7)
    expect(nd / places).toBeGreaterThan(0.15);
    expect(nd / places).toBeLessThan(0.4);
    for (const [k, v] of count) expect(v / places, k).toBeLessThan(1 / 6);
    expect(per(count.get('garage') ?? 0)).toBeGreaterThan(10);
    expect(per(count.get('shop') ?? 0)).toBeGreaterThan(8);
  });

  it('a building the dice lay: on its own flat levelled ground facing the road, a big one with its yard, its boxes for the plan with nothing of their own, its own things not at their spots', () => {
    const tp = new TerrainPoint();
    let checked = 0;
    let yards = 0;
    for (const seed of SEEDS.slice(0, 8)) {
      const w = modcarWorld(seed, { worldVersion: NEWEST_WORLD }).world;
      const sites = sitesOf(w, 200);
      for (const site of sites.filter((s) => s.prefab)) {
        checked++;
        const card = prefabCard(site.prefab)!;
        const o = site.objects.find((x) => x.kind === 'prefab')!;
        // its sort of place, its floor on its plinth over its flat levelled ground
        expect(site.kind).toBe(card.siteKind);
        expect(o.y - site.flat).toBeCloseTo(card.plinth, 6);
        for (const [u, v] of [[0, 0], [-card.w / 2, -card.d / 2], [card.w / 2, card.d / 2]]) {
          w.shape(o.x + Math.cos(o.yaw) * u - Math.sin(o.yaw) * v, o.z + Math.sin(o.yaw) * u + Math.cos(o.yaw) * v, tp);
          expect(Math.abs(tp.h - site.flat), `${site.id} ${site.prefab}`).toBeLessThan(0.05);
        }
        // facing the road: the road's centre line on its front (−v) side, its front behind the levelled ground's start
        const v = -(site.x - o.x) * Math.sin(o.yaw) + (site.z - o.z) * Math.cos(o.yaw);
        expect(v).toBeLessThan(-card.d / 2 - 4.4);
        // (the levelled ground: its footprint and margins, and a big place's yard)
        expect(site.halfL).toBeCloseTo(card.w / 2 + card.margin + (card.yard ?? 0) / 2, 6);
        if (card.yard) yards++;
        // its boxes: the card's, for the plan alone; its own things never at their spots
        const boxes = planBoxes(site);
        expect(boxes.length).toBe(card.boxes?.length ?? 0);
        for (const c of boxes) {
          expect(c.plan).toBe(true);
          expect(ownRoll(c, site.s, site.kind)).toEqual([]);
          for (const l of site.loose) expect(Math.hypot(l.x - c.x, l.z - c.z) > 0.05 || Math.abs(l.y - (c.y + c.shelf)) > 0.05, `${site.prefab} ${c.id}`).toBe(true);
        }
        // not in the way of another place: the second place of its stretch well off its levelled ground
        for (const x of sites) if (x !== site && x.slot === site.slot && !isVerge(x)) expect(Math.abs(x.s - site.s)).toBeGreaterThan(x.halfL + site.halfL);
      }
    }
    expect(checked).toBeGreaterThan(40);
    expect(yards).toBeGreaterThan(10);
    // every box at a spot of its card (cards.ts would not have loaded otherwise); the small places and the towers no yard
    for (const id of Object.keys(ND_BOXES)) expect(prefabCard(id)!.boxes!.length).toBe(ND_BOXES[id].length);
    for (const id of ['busstop', 'mailboxes', 'graveyard', 'watchtower', 'watertower']) expect(prefabCard(id)!.yard).toBeUndefined();
    for (const id of ['station', 'motel', 'camp', 'factory1', 'windfarm', 'cabin']) expect(prefabCard(id)!.yard!).toBeGreaterThanOrEqual(8);
  });

  it('the plan’s finds go in their boxes by their sorts; the new things wait for the plan’s first', () => {
    const atNd = new Map<string, string[]>();
    let themed = 0;
    let total = 0;
    for (const seed of SEEDS.slice(0, 12)) {
      const w = modcarWorld(seed, { worldVersion: NEWEST_WORLD }).world;
      const sites = sitesOf(w, 150);
      const planner = new SitePlanner(placesPlan(seed, 160));
      planner.take(sites.map((x) => ({ id: x.id, s: x.s, kind: x.kind, boxes: planBoxes(x).length, ground: planGround(x) })));
      for (const site of sites.filter((s) => s.prefab)) {
        const finds = planner.findsAt(site.id);
        if (!finds.length) continue;
        // (only a building with boxes takes the plan's: a small place by the road none, but its wreck's ground the petrol)
        if (!planBoxes(site).length) expect(finds.every((f: PlannedFind) => !f.themes || f.themes.includes(site.kind))).toBe(true);
        const into = boxesOfFinds(site, finds);
        if (planBoxes(site).length) expect(into.every((i) => i >= 0 && i < planBoxes(site).length)).toBe(true);
        for (const f of finds) {
          total++;
          if (f.themes?.includes(site.kind)) themed++;
          const list = atNd.get(site.prefab) ?? [];
          list.push(f.entry);
          atNd.set(site.prefab, list);
        }
      }
    }
    const say = [...atNd.entries()].map(([k, v]) => `${k} ${v.length}`).join(', ');
    console.info(`twelve worlds, 150 km: ${total} of the plan's finds at Nomad Drive's buildings (${themed} at a place of their sort) — ${say}`);
    expect(total).toBeGreaterThan(100);
    // the sorts: a home's at its homes, a workshop's at its works, a filling station's at its station
    const has = (ids: string[], entries: string[]): boolean => ids.some((id) => (atNd.get(id) ?? []).some((e) => entries.includes(e)));
    expect(has(['cabin', 'motel', 'commune', 'starter'], ['stove', 'coffee', 'pot', 'camera', 'painkillers', 'stomach', 'food', 'water', 'bandage', 'kitchen2', 'pack'])).toBe(true);
    expect(has(['factory1', 'factory2', 'factory3', 'containeryard', 'radiostation', 'windfarm'], ['engine_kit', 'charger', 'tyre_kit', 'coolant', 'oil', 'crowbar', 'torch', 'grinder', 'polisher', 'spray', 'detector'])).toBe(true);
    expect(has(['station'], ['coolant', 'oil', 'tyre_kit', 'charger', 'torch', 'spray', 'fuel', 'painkillers', 'food', 'water'])).toBe(true);
    // the new things: each held back until the plan's first of it; the furniture never; the other bobbleheads and the hiking pack with theirs
    for (const seed of [7, 1000]) {
      const finds = placesPlan(seed, 4000);
      const held = heldBackUntil(finds);
      const first = (entry: string): number => finds.find((f) => f.entry === entry)!.s;
      expect(held.get('nd_coffee_machine')).toBe(first('coffee'));
      expect(held.get('nd_camera')).toBe(first('camera'));
      expect(held.get('kit_stove')).toBe(first('stove'));
      expect(held.get('nd_grinder')).toBe(first('grinder'));
      expect(held.get('nd_metal_detector')).toBe(first('detector'));
      expect(held.get('nd_bobble_3')).toBe(first('bobble'));
      expect(held.get('pack_hike')).toBe(first('pack'));
      for (const id of ['nd_chair', 'nd_table', 'nd_fridge', 'nd_wall_shelf', 'nd_mug', 'nd_battery', 'drink_water']) expect(held.has(id), id).toBe(false);
    }
    // (a new game's: the first Nomad Drive cabins of the default world hold back their coffee machines and cameras)
    const w = modcarWorld(7, { worldVersion: NEWEST_WORLD }).world;
    const held = heldBackUntil(placesPlan(7, 4000));
    let back = 0;
    for (const site of sitesOf(w, 300).filter((s) => s.prefab)) for (const l of site.loose) if ((held.get(l.item) ?? -Infinity) + THEME_WAIT_M > site.s) back++;
    expect(back).toBeGreaterThan(0);
  });

  it('a vehicle to find at one of their big places stands in its yard, clear of the building and of its things', () => {
    let atNd = 0;
    for (const seed of SEEDS.slice(0, 12)) {
      const w = modcarWorld(seed, { worldVersion: NEWEST_WORLD }).world;
      const finder = new VehicleFinds(w);
      const sites = sitesOf(w, 150);
      for (const x of finder.extraSpots(0, 150_000)) {
        const site = sites.find((y) => x.id.startsWith(`${y.id}/`))!;
        expect(VEHICLE_PLACES).toContain(site.kind);
        if (!site.prefab) continue;
        atNd++;
        const o = site.objects.find((q) => q.kind === 'prefab')!;
        const card = prefabCard(site.prefab)!;
        // (beyond the building's end, in its yard: along the road further from its middle than its half and its margin)
        const u = (x.x - o.x) * Math.cos(o.yaw) + (x.z - o.z) * Math.sin(o.yaw);
        expect(Math.abs(u)).toBeGreaterThan(card.w / 2);
        const a = (x.x - site.x) * site.e1x + (x.z - site.z) * site.e1z;
        expect(Math.abs(a)).toBeLessThanOrEqual(site.halfL);
        for (const l of site.loose) expect(Math.hypot(l.x - x.x, l.z - x.z)).toBeGreaterThan(2);
      }
    }
    console.info(`twelve worlds, 150 km: ${atNd} vehicles to find in the yards of Nomad Drive's buildings`);
    expect(atNd).toBeGreaterThan(5);
  });
});

/** the places of four worlds of version 5 (seeds 7, 1000, 8919, 16838; 200 km each), recorded at 1e5709cf before ND9 */
const FP_V5 = '4ef0e5a5';
