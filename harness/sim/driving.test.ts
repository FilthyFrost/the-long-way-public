/**
 * Gate L2 for driving: every metric on every vehicle spec card must be inside its range
 * (handling from scenarios.ts; fuel, climbing and the autopilot's record from vehicles.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { VEHICLES } from '../../src/core/vehicle/spec';
import { collectDrivingMetrics, type Metrics } from './scenarios';
import { collectVehicleMetrics } from './vehicles';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(ROOT, 'specs/driving');

interface Card {
  id: string;
  title: string;
  metrics: Record<string, { label?: string; min?: number; max?: number }>;
}

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const card = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Card;
  describe(`driving · ${card.title}`, () => {
    let m: Metrics = {};
    beforeAll(() => {
      const spec = VEHICLES[card.id];
      expect(spec, `vehicle ${card.id} exists`).toBeTruthy();
      m = { ...collectDrivingMetrics(spec), ...collectVehicleMetrics(spec) };
    });
    for (const [key, t] of Object.entries(card.metrics)) {
      it(`${key} — ${t.label ?? ''}`, () => {
        const v = m[key];
        expect(Number.isFinite(v), `${key} was measured`).toBe(true);
        if (t.min !== undefined) expect(v).toBeGreaterThanOrEqual(t.min);
        if (t.max !== undefined) expect(v).toBeLessThanOrEqual(t.max);
      });
    }
  });
}
