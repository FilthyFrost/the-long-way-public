/**
 * Climbing a ladder as Nomad Drive has it (docs/ND/PLAN.md, ND6; its PlayerLadderClimb and vehicle ladder, their fields
 * as the game's assets have them): no key and nothing on screen — walking into a ladder while facing it (within 60°)
 * takes hold of it; standing at its head with one's back to it, walking on over the edge takes hold of it from above
 * (turned round to face it). Taking hold draws one onto its line in a quarter of a second; the walking keys go up and
 * down it at two metres a second (no faster running; the view turned to face it, looking up and down as ever); a
 * rung's sound every 0.45 m. Past its head (5 cm) one is drawn onto the platform in 0.3 s and let go; at its foot,
 * walking back puts one down at once; jumping lets go anywhere. Half a second before it is taken hold of again.
 */

export const CLIMB = {
  /** up and down it (m/s) */
  speed: 2.0,
  /** the walking stick at least this far forward to take hold */
  grabInput: 0.5,
  /** facing it at least this much (the cosine of the angle off it: 60°) */
  facing: 0.5,
  /** taking hold of it (s), drawn onto the platform at its head (s), before taking hold again (s) */
  grabS: 0.25,
  releaseS: 0.3,
  cooldownS: 0.5,
  /** past its head or below its foot by this much: off it (m) */
  endTol: 0.05,
  /** the feet within this of its head: taking hold of it from above (m) */
  topTol: 0.5,
  /** a rung's sound each so far climbed (m) */
  rungSound: 0.45,
  /** how near its line one takes hold of it: out in front of it, either side (m: its trigger with the body's width) */
  depth: 0.75,
  side: 0.58,
  /** the feet's line out from its rungs (m) */
  standOff: 0.31,
  /** the eye over the feet while on it (m) */
  eye: 1.55,
  /** the input past which a step down at its foot puts one on the ground */
  dead: 0.1,
} as const;

/** where along a ladder's line (0 its foot, len its head) the climb goes in dt, and whether that takes one off it */
export function climbAlong(s: number, input: number, dt: number, len: number): { s: number; off: 'head' | 'foot' | null } {
  const ns = s + input * CLIMB.speed * dt;
  if (ns > len + CLIMB.endTol) return { s: len + CLIMB.endTol, off: 'head' };
  if (ns < -CLIMB.endTol || (ns <= 0 && input < -CLIMB.dead)) return { s: Math.max(-CLIMB.endTol, ns), off: 'foot' };
  return { s: ns, off: null };
}

/** whether one walking takes hold of a ladder: from below facing it, or from its head with one's back to it */
export function takesHold(o: {
  /** the feet in the ladder's own terms: out in front of its line, to its side, along it (0 its foot … len its head) */
  out: number;
  side: number;
  along: number;
  len: number;
  /** the feet's height over its foot, its head's over its foot */
  up: number;
  top: number;
  /** the cosine of the angle between where one faces and where it faces */
  facing: number;
  forward: number;
}): 'foot' | 'head' | null {
  if (o.forward < CLIMB.grabInput || Math.abs(o.side) > CLIMB.side) return null;
  if (o.up > o.top - CLIMB.topTol) {
    // (at its head, on the platform behind its line: one's back to it, within its trigger there — Nomad Drive's half a
    // metre deep, with the body's width — walking on towards the edge)
    return o.facing < -CLIMB.facing && o.out > -CLIMB.depth && o.out < 0.3 && o.along > o.len - 1.2 ? 'head' : null;
  }
  // (from below: within its trigger at its foot — Nomad Drive's 2.7 m from the ground its legs stand on, its foot's
  // point up to 0.61 m over that ground: the climb lifts one onto it)
  return o.facing > CLIMB.facing && o.out > -0.25 && o.out < CLIMB.depth && o.up > -1.0 && o.up < 2.1 ? 'foot' : null;
}
