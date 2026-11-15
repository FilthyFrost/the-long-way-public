import { describe, expect, it } from 'vitest';
import { SONGS, renderSong } from '../../src/game/modcar/radio';

// the radio's songs are synthesized at first use: they must come out whole, quick and in range
describe('modcar · radio songs', () => {
  it('each station renders a clean loop of 8 bars, quickly', () => {
    const sr = 22050;
    for (const s of SONGS) {
      const t0 = performance.now();
      const x = renderSong(s, sr);
      const ms = performance.now() - t0;
      const bars = s.bars.length * s.beats * (60 / s.bpm);
      expect(Math.abs(x.length / sr - bars)).toBeLessThan(0.01);
      let peak = 0;
      let sum = 0;
      for (const v of x) {
        expect(Number.isFinite(v)).toBe(true);
        peak = Math.max(peak, Math.abs(v));
        sum += v * v;
      }
      const rms = Math.sqrt(sum / x.length);
      expect(peak).toBeLessThanOrEqual(1);
      expect(rms).toBeGreaterThan(0.05);
      // (at 22 kHz in Node; the browser renders at its own rate once per station)
      expect(ms).toBeLessThan(1500);
    }
  });
});
