/**
 * Gate for world generation: a world of version 1 is the same world to the bit, whatever is added to the
 * generator round it. Every reference world of harness/sim/worldTrace.ts is traced — road, chapters, land,
 * water, sea, places, colossal remains, road furniture, twenty thousand heights — and each part must hash
 * to the value recorded in harness/sim/world-golden.json (the first four worlds: the values of
 * docs/V3/maps/world-core.md, Appendix A). Each world is traced a second time after being asked about a
 * place far down its road first: whoever asks first must not matter. The weather of the six regions of
 * version 1 is held to its record the same way.
 *
 * Worlds of version 2 are held to reference worlds of their own, recorded under the revision of their
 * generator (rules.ts WORLD_REV): version 2 may change, but whoever changes what its worlds look like
 * raises the revision and records them again (npx tsx harness/sim/worldTrace.ts --write), so that no
 * change to it goes unnoticed. They are traced from their start, after being asked out of order, and
 * after being asked in small bites along the road.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORLD_REV } from '../../src/core/world/rules';
import { GOLDEN_FILE, REFERENCE_WORLDS, REFERENCE_WORLDS_V2, TRACE_PARTS, askInBites, askOutOfOrder, weatherTrace, worldTrace, type WorldFingerprint, type WorldGolden } from './worldTrace';

const golden = JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8')) as WorldGolden;

/** hold a fingerprint to the recorded one, part by part (every part that differs is reported, not only the first) */
function expectRecorded(got: WorldFingerprint, name: string, how: string): void {
  const want = golden[name];
  // (exact doubles through the engine's Math functions: a Node that rounds them differently changes the
  // parts that go through them — the spine and the chapters never — and the file is then recorded again
  // on the unchanged generator: npx tsx harness/sim/worldTrace.ts --write)
  const note = `${name} ${how}; golden hashes recorded with ${golden._recorded}; this is node ${process.version}`;
  for (const part of TRACE_PARTS) expect.soft(got[part], `${part} of ${note}`).toBe(want[part]);
  // (the anchored landforms: a part only worlds of version 2 have)
  expect.soft(got.features, `features of ${note}`).toBe(want.features);
  expect.soft(got.counts, `counts of ${note}`).toEqual(want.counts);
}

describe('world · version 1 worlds are bit-identical', () => {
  it('every reference world has its fingerprint on file, and the file holds no other', () => {
    expect(Object.keys(golden).filter((k) => !k.startsWith('_')).sort()).toEqual([...Object.keys(REFERENCE_WORLDS), ...Object.keys(REFERENCE_WORLDS_V2)].sort());
    for (const name of Object.keys(REFERENCE_WORLDS)) expect(golden[name].features, `${name} is a world of version 1: no anchored landforms`).toBeUndefined();
  });

  it('the weather of the six regions hashes as recorded', () => {
    expect(weatherTrace(), `golden hashes recorded with ${golden._recorded}; this is node ${process.version}`).toBe(golden._weather);
  });

  for (const [name, ref] of Object.entries(REFERENCE_WORLDS)) {
    it(`${name}: every part hashes as recorded`, () => {
      expectRecorded(worldTrace(ref.make(), ref.km), name, 'traced from its start');
    });

    it(`${name}: the same world when a place far down the road is asked about first`, () => {
      const world = ref.make();
      askOutOfOrder(world, ref.km);
      expectRecorded(worldTrace(world, ref.km), name, 'asked out of order first');
    });
  }
});

describe(`world · version 2 worlds are what they were recorded as under revision ${WORLD_REV}`, () => {
  const hint = `a world of version 2 changed: if that was meant, raise WORLD_REV (src/core/world/rules.ts) and record the reference worlds again (npx tsx harness/sim/worldTrace.ts --write)`;

  it('the reference worlds on file were recorded under the generator\'s present revision', () => {
    expect(golden._rev, `WORLD_REV is ${WORLD_REV} and the file was recorded under ${golden._rev}: record the worlds of version 2 again (npx tsx harness/sim/worldTrace.ts --write)`).toBe(WORLD_REV);
  });

  for (const [name, ref] of Object.entries(REFERENCE_WORLDS_V2)) {
    it(`${name}: every part hashes as recorded`, () => {
      const world = ref.make();
      expect(world.rules.version).toBe(2);
      expectRecorded(worldTrace(world, ref.km), name, `traced from its start (${hint})`);
    });

    it(`${name}: the same world when a place far down the road is asked about first`, () => {
      const world = ref.make();
      askOutOfOrder(world, ref.km);
      expectRecorded(worldTrace(world, ref.km), name, 'asked out of order first');
    });

    it(`${name}: the same world when it is asked in small bites along the road`, () => {
      const world = ref.make();
      askInBites(world, ref.km);
      expectRecorded(worldTrace(world, ref.km), name, 'asked in small bites first');
    });
  }
});
