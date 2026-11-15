/**
 * Gate for the ModCar physics extensions: the four legacy vehicles (no new spec fields, neutral new
 * modifiers) must run exactly the old code — every scenario of harness/sim/modcar/legacyTrace.ts
 * hashes to the value recorded before the extensions went in.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VEHICLES } from '../../src/core/vehicle/spec';
import { GOLDEN_FILE, legacyTrace } from './modcar/legacyTrace';

const golden = JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8')) as Record<string, Record<string, string>> & { _recorded: string };

describe('modcar · legacy vehicles are bit-identical', () => {
  for (const spec of Object.values(VEHICLES)) {
    it(`${spec.id}: every scenario hashes as before`, () => {
      // (exact doubles: a Node whose Math functions round differently changes them too — then record
      // them again from the legacy simulation, `git checkout f6541e4 -- src/core/vehicle` in a scratch
      // copy and `npx tsx harness/sim/modcar/legacyTrace.ts --write`)
      expect(legacyTrace(spec), `golden hashes recorded with ${golden._recorded}; this is node ${process.version}`).toEqual(golden[spec.id]);
    });
  }
});
