/**
 * Gate for the day clock and weather schedule.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Metrics } from './scenarios';
import { collectWeatherMetrics } from './weather';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const card = JSON.parse(fs.readFileSync(path.join(ROOT, 'specs/weather/default.json'), 'utf8')) as {
  title: string;
  metrics: Record<string, { label?: string; min?: number; max?: number }>;
};

describe(`weather · ${card.title}`, () => {
  let m: Metrics = {};
  beforeAll(() => {
    m = collectWeatherMetrics();
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
