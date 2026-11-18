/**
 * Gate for world generation: a world of version 1 is the same world to the bit, whatever is added to the
 * generator round it. Every reference world of harness/sim/worldTrace.ts is traced — road, chapters, land,
 * water, sea, places, colossal remains, road furniture, twenty thousand heights — and each part must hash
 * to the value recorded in harness/sim/world-golden.json (the first four worlds: the values of
 * docs/V3/maps/world-core.md, Appendix A). Each world is traced a second time after being asked about a
 * place far down its road first: whoever asks first must not matter. The weather of the six regions of
 * version 1 is held to its record the same way.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GOLDEN_FILE, REFERENCE_WORLDS, TRACE_PARTS, askOutOfOrder, weatherTrace, worldTrace, type WorldFingerprint, type WorldGolden } from './worldTrace';

const golden = JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8')) as WorldGolden;

/** hold a fingerprint to the recorded one, part by part (every part that differs is reported, not only the first) */
function expectRecorded(got: WorldFingerprint, name: string, how: string): void {
  const want = golden[name];
  // (exact doubles through the engine's Math functions: a Node that rounds them differently changes the
  // parts that go through them — the spine and the chapters never — and the file is then recorded again
  // on the unchanged generator: npx tsx harness/sim/worldTrace.ts --write)
  const note = `${name} ${how}; golden hashes recorded with ${golden._recorded}; this is node ${process.version}`;
  for (const part of TRACE_PARTS) expect.soft(got[part], `${part} of ${note}`).toBe(want[part]);
  expect.soft(got.counts, `counts of ${note}`).toEqual(want.counts);
}

describe('world · version 1 worlds are bit-identical', () => {
  it('every reference world has its fingerprint on file, and the file holds no other', () => {
    expect(Object.keys(golden).filter((k) => !k.startsWith('_')).sort()).toEqual(Object.keys(REFERENCE_WORLDS).sort());
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
