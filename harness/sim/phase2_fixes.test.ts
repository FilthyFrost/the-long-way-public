/**
 * Regression tests for Playtest Round 2 Phase 2 fixes:
 *  - #3 Turtle high-top walk-in doorway (2.22 m) + standing headroom across main floor & rear decks even with roof closed
 *  - #10 Camel completely flat 0.84 m bus floor (zero interior wheel humps) + sealed cab perimeter
 *  - #18 Lowered kitchen stand (0.722 m), cabinet (0.72 m), workbench (0.75 m) + raised 1.58 m standing eye height
 *  - #28 All 51 archive songs from cueSpec.ts STATIONS mapped 1-to-1 onto physical cassettes & physical vinyl records,
 *        plus turntable empty/loaded state words
 */
import { describe, expect, it } from 'vitest';
import { STATIONS } from '../../src/core/audio/cueSpec';
import { ABOARD } from '../../src/core/modcar/aboard';
import { frameDef } from '../../src/core/modcar/frames';
import { newItem } from '../../src/core/modcar/items';
import { ND_FOOT } from '../../src/core/onfoot/walker';
import { appState, stateWords } from '../../src/core/v3/appliances/appliances';
import { ND_CABINET, ND_KITCHEN_STAND, ND_WORKBENCH, registerNdItems } from '../../src/core/v3/nd/items';
import { TAPES } from '../../src/core/v3/nd/tapes';
import { vinylDeck, vinylOf, VINYLS } from '../../src/core/v3/nd/vinyls';
import { ROOMS } from '../../src/game/modcar/v3/nd-home/rooms';

describe('Playtest Round 2 Phase 2 regressions', () => {
  it('#3 Turtle high-top permits standing walk-in and standing on rear decks without popping roof', () => {
    const ab = ABOARD.turtle;
    expect(ab.roof).toBeUndefined();
    const door = ab.doors[0];
    expect(door.box.hi[1] - door.box.lo[1]).toBeGreaterThanOrEqual(1.75);
    const rearDeck = ab.areas.find((a) => a.name === 'rear_deck');
    expect(rearDeck).toBeTruthy();
    expect(rearDeck!.floor).toBeLessThanOrEqual(0.95);
    // High-top Turtle frame ceiling clears standing walker height (1.66 m) even atop rear engine deck (0.92 m)
    expect(2.62 - rearDeck!.floor).toBeGreaterThanOrEqual(ND_FOOT.height);
    expect(frameDef('turtle').body.top).toBeGreaterThan(2.55);
  });

  it('#10 Camel rear floor is completely flat at 0.84 m with zero wheel humps', () => {
    const ab = ABOARD.camel;
    const room = ab.areas.find((a) => a.name === 'room');
    expect(room).toBeTruthy();
    expect(room!.floor).toBeCloseTo(0.84, 3);
    expect(room!.z0).toBeLessThanOrEqual(-1.1);
    expect(room!.z1).toBeGreaterThanOrEqual(1.1);
    // Single uninterrupted wall-to-wall area across the rear wheel axle (-2.85 m)
    expect(room!.x0).toBeLessThan(-5.5);
    expect(room!.x1).toBeGreaterThan(1.5);
  });

  it('#18 Kitchen stand, cabinet, and workbench lowered to 0.72–0.75 m with 1.58 m standing eye height', () => {
    expect(ND_FOOT.eye).toBeCloseTo(1.58, 3);
    const ksTop = ROOMS[ND_KITCHEN_STAND].find((r) => r.top)!;
    const cabTop = ROOMS[ND_CABINET].find((r) => r.top)!;
    const wbTop = ROOMS[ND_WORKBENCH].find((r) => r.top)!;
    expect(ksTop.y).toBeCloseTo(0.722, 3);
    expect(cabTop.y).toBeCloseTo(0.72, 3);
    expect(wbTop.y).toBeCloseTo(0.75, 3);
    expect(ND_FOOT.eye - ksTop.y).toBeGreaterThan(0.8);
  });

  it('#28 All 51 archive songs mapped 1-to-1 onto physical cassettes and vinyl records', () => {
    registerNdItems();
    const allArchive = STATIONS.flatMap((st, si) => st.songs.map((s) => `${si}:${s.name.replace(/\\(.)/g, '$1')}`));
    expect(allArchive.length).toBe(51);

    const tapeKeys = new Set(TAPES.map((t) => `${t.station}:${t.song}`));
    const vinylKeys = new Set(VINYLS.map((v) => `${v.station}:${v.song}`));
    expect(TAPES.length).toBe(51);
    expect(VINYLS.length).toBe(51);
    expect(tapeKeys).toEqual(new Set(allArchive));
    expect(vinylKeys).toEqual(new Set(allArchive));

    const deck = vinylDeck(42);
    expect(new Set(deck).size).toBe(51);
    expect(vinylOf('nd_vinyl_01')?.title).toBe(TAPES[0].title);
    expect(vinylOf('nd_vinyl_51')?.title).toBe(TAPES[50].title);

    // Turntable requires physical vinyl placed on platter
    const rec = newItem('junk_record');
    expect(stateWords(rec, () => 'FM')).toContain('空盘');
    appState(rec).vinyl = newItem('nd_vinyl_09');
    appState(rec).on = true;
    expect(stateWords(rec, () => 'FM')).toContain(vinylOf('nd_vinyl_09')!.title);
  });
});
