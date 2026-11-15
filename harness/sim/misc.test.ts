/**
 * Gates for the smaller spec cards: sound mix mapping and light-transition smoothness.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { collectAudioMetrics } from './audio';
import { collectLookMetrics } from './look';
import type { Metrics } from './scenarios';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cases: [string, () => Metrics][] = [
  ['specs/audio/default.json', collectAudioMetrics],
  ['specs/weather/look.json', collectLookMetrics],
];

for (const [file, collect] of cases) {
  const card = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')) as {
    title: string;
    metrics: Record<string, { label?: string; min?: number; max?: number }>;
  };
  describe(card.title, () => {
    let m: Metrics = {};
    beforeAll(() => {
      m = collect();
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
