/**
 * The steps up into the living spaces, as Nomad Drive's campers have theirs (the player's ask, 2026-11-26: as handsome
 * as Nomad Drive's, part of the body, plain to see): a stairwell sunk into the floor inside the entry door of the
 * Whale, the Old Elephant and the Camel (tools/blender/frames/_steps.py), a step that slides out under the door of the
 * Whale, the Old Elephant and the Turtle, a ladder of them under the Snail's and the Tadpole's rear doors
 * (core/modcar/aboard.ts BoardDoor.well / step, doorSteps, stepHeight; game/modcar/carView.ts buildSteps).
 *   - from the ground to the floor every rise is 0.245 m or less (Nomad Drive's 0.15-0.24), the treads one after the
 *     other without a gap, the stairwell's inside the body's face, the steps outside it
 *   - the feet's height falls from the floor to the ground along the way out and never rises
 *   - no walk area of the room lies over a stairwell (one walks into it only up its treads)
 */
import { describe, expect, it } from 'vitest';
import { ABOARD, doorSteps, stepHeight } from '../../src/core/modcar/aboard';

describe('the steps into the living spaces', () => {
  for (const [frame, def] of Object.entries(ABOARD)) {
    for (const door of def.doors) {
      it(`${frame} ${door.mount}: treads from the floor to the ground, no rise over 0.245 m`, () => {
        const st = doorSteps(def, door);
        expect(st.treads.length).toBeGreaterThan(0);
        // (the innermost first, each starting where the one before it ended)
        for (let k = 1; k < st.treads.length; k++) expect(st.treads[k].s0).toBeCloseTo(st.treads[k - 1].s1, 6);
        const tops = [st.floor, ...st.treads.map((t) => t.top), 0];
        for (let k = 1; k < tops.length; k++) {
          const rise = tops[k - 1] - tops[k];
          expect(rise, `rise ${k}`).toBeGreaterThan(0.1);
          expect(rise, `rise ${k}`).toBeLessThanOrEqual(0.245);
        }
        // the stairwell inside the face (s < 0), the steps outside it
        if (door.well) {
          expect(st.treads[0].s0).toBeCloseTo(-door.well.tops.length * door.well.depth, 6);
          expect(st.treads[door.well.tops.length - 1].s1).toBeCloseTo(0, 6);
          // (the door's sill is the well's lowest tread)
          expect(door.box.lo[1]).toBeCloseTo(door.well.tops[0], 2);
          // the spot just inside is on the floor, past the well's inner edge
          expect(-st.sill).toBeLessThan(st.treads[0].s0);
        }
        if (st.out) expect(st.treads[st.treads.length - 1].s1).toBeCloseTo(st.out.tops.length * st.out.depth, 6);
      });

      it(`${frame} ${door.mount}: the feet go down from the floor to the ground and never up`, () => {
        const st = doorSteps(def, door);
        expect(stepHeight(st, -st.sill)).toBeCloseTo(st.floor, 6);
        expect(stepHeight(st, 3)).toBe(0);
        let last = Infinity;
        for (let s = -st.sill; s <= 2; s += 0.005) {
          const y = stepHeight(st, s);
          expect(y).toBeLessThanOrEqual(last + 1e-9);
          last = y;
        }
      });

      if (door.well) {
        it(`${frame} ${door.mount}: no walk area lies over the stairwell`, () => {
          const st = doorSteps(def, door);
          const half = st.half - 0.02;
          const ax = -st.uz;
          const az = st.ux;
          // (points over the well: s metres along the way out from the body's face, from the well's inner edge to the
          // face; across the doorway from its middle)
          const along = st.inside[0] * st.ux + st.inside[1] * st.uz + st.sill;
          const mid = st.mid[0] * ax + st.mid[1] * az;
          for (let s = st.treads[0].s0 + 0.02; s < -0.02; s += 0.05) {
            for (let a = -half; a <= half; a += 0.05) {
              const px = st.ux * (along + s) + ax * (mid + a);
              const pz = st.uz * (along + s) + az * (mid + a);
              const over = def.areas.some((r) => px > r.x0 + 1e-6 && px < r.x1 - 1e-6 && pz > r.z0 + 1e-6 && pz < r.z1 - 1e-6);
              expect(over, `${px.toFixed(2)}, ${pz.toFixed(2)}`).toBe(false);
            }
          }
        });
      }
    }
  }
});
