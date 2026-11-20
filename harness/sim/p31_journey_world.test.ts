// Milestone 3-1 (docs/V3/nodes/P3-1-journey-world.md): the journey in the world — world version 3 lays the fifty
// scenic roads, shuffled, and the joins between them on the road, a scene drawn as its nearest region for now, and
// names a scene on the screen as one drives into it.
import { describe, expect, it } from 'vitest';
import { BIOMES, BIOME_INDEX } from '../../src/core/world/biomes';
import { JourneyRoad, STAND_INS, journeyRoad, regionOfScene } from '../../src/core/world/journey/road';
import { SCENES } from '../../src/core/world/journey/scenes';
import { RULES_V3, WORLD_REV, rulesFor } from '../../src/core/world/rules';
import { TerrainPoint, World } from '../../src/core/world/terrain';
import { journeyFrom } from '../../src/game/modcar/devJourney';
import { describePlace } from '../../src/game/modcar/devWorld';
import { PlaceNames } from '../../src/game/modcar/placeNames';
import { savedWorldOf } from '../../src/game/modcar/worldSave';

const lakes = BIOME_INDEX.lakes;

describe('the journey on the road (world version 3)', () => {
  it('draws every scene as a region the world knows: its own where there is one, else its stand-in', () => {
    for (const c of SCENES) {
      expect(STAND_INS[c.id], c.id).toBeDefined();
      const r = regionOfScene(c, BIOMES.length);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(BIOMES.length);
      if (c.region) expect(BIOMES[r].id).toBe(c.region);
      else expect(BIOMES[r].id).toBe(STAND_INS[c.id]);
    }
    // (a world that knows fewer regions: the first of all, never one it does not know)
    for (const c of SCENES) expect(regionOfScene(c, 3)).toBeLessThan(3);
  });

  it('sets out from home, then a gentle first scene; scenes five to seven and a half kilometres, all in whole stretches', () => {
    for (const seed of [1, 7, 99, 12345]) {
      const j = new JourneyRoad(seed);
      j.chapter(30);
      const [home, first] = j.pieces;
      expect(home.kind).toBe('home');
      expect(home.region).toBe(BIOME_INDEX.plains);
      expect(home.end).toBe(2500);
      expect(first.kind).toBe('scene');
      expect(first.scene!.gentle).toBe(true);
      for (const p of j.pieces) {
        expect((p.end - p.start) % 1250).toBe(0);
        if (p.kind === 'scene') {
          expect(p.end - p.start).toBeGreaterThanOrEqual(5000);
          expect(p.end - p.start).toBeLessThanOrEqual(7500);
        }
      }
    }
  });

  it('joins two scenes as the journey says: a blend its length, a quiet stretch with short borders, a threshold a short border', () => {
    const j = new JourneyRoad(7);
    j.chapter(60);
    let ecotones = 0, buffers = 0, thresholds = 0;
    for (let k = 1; k < j.pieces.length; k++) {
      const p = j.pieces[k];
      if (p.threshold) {
        thresholds++;
        expect(p.border).toBe(400);
        expect(p.thresholdLength).toBeGreaterThan(700);
      } else if (p.kind === 'buffer' || j.pieces[k - 1].kind !== 'scene') {
        buffers++;
        expect(p.border).toBeLessThanOrEqual(900);
      } else {
        ecotones++;
        expect(p.border).toBeGreaterThanOrEqual(1000);
        expect(p.border).toBeLessThanOrEqual(1500);
      }
    }
    expect(ecotones + buffers + thresholds).toBe(j.pieces.length - 1);
    expect(buffers).toBeGreaterThan(0);
  });

  it('deals all fifty once a round, the same for a seed and another for another', () => {
    const a = new JourneyRoad(7);
    const b = new JourneyRoad(7);
    const c = new JourneyRoad(8);
    const scenes = (j: JourneyRoad): string[] => {
      const out: string[] = [];
      for (let k = 0; out.length < 50; k++) {
        while (j.pieces.length <= k) j.chapter(j.chapters.length);
        const p = j.pieces[k];
        if (p.scene) out.push(p.scene.id);
      }
      return out;
    };
    const sa = scenes(a);
    expect(new Set(sa).size).toBe(50);
    expect(scenes(b)).toEqual(sa);
    expect(scenes(c)).not.toEqual(sa);
  });

  it('runs pieces of one region on as one chapter: never two lakes running (each would hang a sea of its own)', () => {
    for (const seed of [3, 7, 11, 2026]) {
      const j = new JourneyRoad(seed);
      j.chapter(80);
      for (let c = 1; c < j.chapters.length; c++) expect(j.chapters[c].region).not.toBe(j.chapters[c - 1].region);
      for (const ch of j.chapters) {
        const sum = j.pieces.slice(ch.first, ch.end).reduce((n, p) => n + (p.end - p.start), 0);
        expect(sum).toBe(ch.length);
      }
      expect(j.chapters.some((ch) => ch.region === lakes)).toBe(true);
    }
  });

  it('is the world\'s chapter plan: its regions, lengths and borders, its land whole across them', () => {
    const w = new World(7, { worldVersion: 3 });
    expect(w.rules).toBe(RULES_V3);
    const j = w.journey!;
    expect(j).toBe(journeyRoad(7, 1, BIOMES.length, 1250, BIOME_INDEX.plains));
    const plan = w.spine.plan;
    const tp = new TerrainPoint();
    const at = { x: 0, y: 0, z: 0, phi: 0, kappa: 0, grade: 0, bank: 0 };
    for (let s = 25; s < 90000; s += 250) {
      const piece = j.pieceAt(s);
      expect(plan.biomes[plan.chapterAt(s)]).toBe(piece.region);
      w.spine.at(s, at);
      w.shape(at.x + 25, at.z, tp);
      expect(Number.isFinite(tp.h)).toBe(true);
    }
    for (let c = 1; c < 20; c++) {
      plan.chapterAt(plan.starts[c] + 1);
      expect(plan.transitionAt(c)).toBe(j.chapters[c].border);
    }
    // (version 2's worlds are as they were: no journey)
    expect(new World(7, { worldVersion: 2 }).journey).toBeNull();
    expect(rulesFor(2).dealer).not.toBe(RULES_V3.dealer);
  });

  it('shows the developer its pieces, the scenes by name, and where one is by the scene\'s name', () => {
    const w = new World(7, { worldVersion: 3 });
    const j = w.journey!;
    const stops = journeyFrom(w, 0, 12);
    expect(stops).toHaveLength(12);
    expect(stops[0].label).toBe('出发');
    expect(stops[1].scene).toBe(true);
    expect(stops[1].label).toBe(j.pieces[1].scene!.name);
    expect(stops[1].tag).toBe(j.pieces[1].scene!.tag);
    for (const [k, x] of stops.entries()) {
      expect(x.start).toBe(j.pieces[k].start);
      expect(x.intensity).toBe(x.scene ? 'scenic' : 'calm');
    }
    expect(describePlace(w, j.pieces[1].start + 1000)).toContain(j.pieces[1].scene!.name);
    // (version 2: its regions, as before)
    expect(journeyFrom(new World(7, { worldVersion: 2 }), 0, 3)[0].scene).toBeUndefined();
  });

  it('is saved as its version, with the generator\'s revision', () => {
    const w = new World(7, { worldVersion: 3 });
    expect(savedWorldOf(w, 7)).toEqual({ seed: 7, version: 3, regionCount: BIOMES.length, rev: WORLD_REV });
  });
});

describe('the name of a scene on the screen', () => {
  it('names a scene as one drives into it, not at home nor between two, once a minute at most', () => {
    const j = new JourneyRoad(7);
    j.chapter(20);
    const names = new PlaceNames();
    const shown: string[] = [];
    let now = 0;
    const drive = (s: number): void => {
      now += 0.5;
      const c = names.update(j, s, now, 0.5);
      if (c) shown.push(c.name);
    };
    // (the first moment of a session: nothing yet)
    for (let i = 0; i < 4; i++) drive(100);
    expect(shown).toEqual([]);
    // home: no name; into the first scene: its name, once
    for (let s = 100; s < j.pieces[1].start + 300; s += 50) drive(s);
    expect(shown).toEqual([j.pieces[1].scene!.name]);
    // back over the border and in again within the minute: not again
    drive(j.pieces[1].start - 100);
    drive(j.pieces[1].start + 100);
    expect(shown).toHaveLength(1);
    // on through every piece to the tenth: every scene's name in turn, the quiet stretches none
    for (let s = j.pieces[1].start + 300; s < j.pieces[10].end; s += 100) drive(s);
    const scenes = j.pieces.slice(1, 11).filter((p) => p.kind === 'scene').map((p) => p.scene!.name);
    expect(shown).toEqual(scenes);
  });

  it('names nothing in a world without a journey', () => {
    expect(new PlaceNames().update(null, 5000, 10, 3)).toBeNull();
  });
});
