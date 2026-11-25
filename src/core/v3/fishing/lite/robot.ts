/**
 * Robot anglers (docs/V3/plan/fishing-fight.md §9): three pairs of hands — a novice, a usual player and an expert —
 * that play the fight by its rules with a reaction time and a share of slips. One hand pulls the rod against the
 * fish (it sees the fish turn a moment late), the other reels when the fish lets it and lets go when it pulls or a
 * strong move is told; a fish brought to the feet spent is landed. The tests hold the win rates and the lengths of
 * the fights to the plan's table; the developer's panel can let one fish for you.
 */
import { againstOf, startFight, stepFight, landFight, type FightHands, type FightParams, type FightState } from './fight';
import { Stream } from './rules';

export interface RobotSkill {
  readonly name: string;
  /** seconds before it sees a turn, a told move or a change of phase */
  readonly react: number;
  /** slips a second (for a moment the rod the wrong way, or the reel held on) */
  readonly err: number;
  /** it stops reeling when the strain passes this, and starts again once it has fallen 0.15 below */
  readonly guard: number;
  /** how far over it pulls the rod (0 … 1) */
  readonly over: number;
  /** rod widths a second the rod swings at (a key at once; the mouse a swipe) */
  readonly swing: number;
  /** seconds it takes to strike once the float goes under */
  readonly strike: number;
}

export const NOVICE: RobotSkill = { name: 'novice', react: 0.45, err: 0.22, guard: 0.85, over: 0.8, swing: 8, strike: 0.42 };
export const USUAL: RobotSkill = { name: 'usual', react: 0.3, err: 0.1, guard: 0.68, over: 0.95, swing: 10, strike: 0.3 };
export const EXPERT: RobotSkill = { name: 'expert', react: 0.2, err: 0.03, guard: 0.62, over: 1, swing: 12, strike: 0.2 };
export const ROBOTS: readonly RobotSkill[] = [NOVICE, USUAL, EXPERT];

/** what a robot's hands remember between steps */
export interface RobotHands {
  /** what it has seen of the fish: which way it swims, its phase, a told move; and what it is about to see, since when */
  seenDir: number;
  seenPhase: string;
  seenTell: boolean;
  pendDir: number;
  pendPhase: string;
  pendTell: boolean;
  since: number;
  /** a slip under way (seconds left), and which: the rod the wrong way, or the reel held on */
  wrong: number;
  wrongReel: boolean;
  /** easing off after the strain climbed too high, until it falls back */
  easing: boolean;
  /** the strain as the eye has it (a tenth of a second behind) */
  seenTension: number;
  /** the rod where the hand has it now, −1 … 1 */
  steer: number;
  /** seconds the fish has been landable to its eye */
  landSeen: number;
  rng: Stream;
}

export function robotHands(seed: number): RobotHands {
  return { seenDir: 0, seenPhase: 'run', seenTell: false, pendDir: 0, pendPhase: 'run', pendTell: false, since: 0, wrong: 0, wrongReel: false, easing: false, seenTension: 0.25, steer: 0, landSeen: 0, rng: new Stream(seed ^ 0x51ab) };
}

/** what the robot's hands do this step: reel or not, where the rod is; and whether it lands the fish now */
export function robotPlay(h: RobotHands, robot: RobotSkill, s: FightState, p: FightParams, dt: number): FightHands & { land: boolean } {
  // it sees the fish a moment late
  const dir = s.dir;
  const phase = s.phase;
  const tell = s.tell > 0;
  if (dir !== h.pendDir || phase !== h.pendPhase || tell !== h.pendTell) {
    h.pendDir = dir;
    h.pendPhase = phase;
    h.pendTell = tell;
    h.since = 0;
  } else h.since += dt;
  if (h.since >= robot.react || h.seenDir === 0) {
    h.seenDir = h.pendDir;
    h.seenPhase = h.pendPhase;
    h.seenTell = h.pendTell;
  }
  h.seenTension += (s.tension - h.seenTension) * Math.min(1, dt / 0.1);
  const tension = h.seenTension;
  const seen = h.seenPhase;
  // ---- the rod: against the way it swims (in the middle while it bores, leaps or lies spent)
  const idle = seen === 'dive' || seen === 'jump' || seen === 'breathe' || seen === 'spent';
  let want = idle ? 0 : -h.seenDir * robot.over;
  // ---- the reel: when the fish lets it; never into a told move, a run, a leap, a shock or a bore
  // (DREADMOOR's way: worn down with the rod held over against it and the reel still — reeling lets it get its breath
  // back and strains the line — and wound in once spent; near the end of the line, a few turns to hold it)
  let reel: boolean;
  if (seen === 'spent' || seen === 'breathe') reel = true;
  else if (h.seenTell || seen === 'run' || seen === 'jump' || seen === 'zap' || seen === 'dive') reel = false;
  else reel = true;
  if (tension > robot.guard) h.easing = true;
  else if (tension < robot.guard - 0.15) h.easing = false;
  if (h.easing) reel = false;
  // (a strain past the red: let go, whatever it is doing)
  if (tension > 0.9) reel = false;
  // now and then a slip of the hand
  if (h.wrong > 0) {
    h.wrong -= dt;
    if (h.wrongReel) reel = true;
    else want = -want;
  } else if (h.rng.next() < robot.err * dt) {
    h.wrong = 0.4;
    h.wrongReel = h.rng.next() < 0.5;
  }
  // (the hand swings the rod over at its speed)
  const step = robot.swing * dt;
  h.steer += Math.max(-step, Math.min(step, want - h.steer));
  // ---- a fish at the feet, spent: up it comes
  if (s.landable) h.landSeen += dt;
  else h.landSeen = 0;
  return { reel, steer: h.steer, land: h.landSeen >= robot.react };
}

/** the robot's eyes on how much the rod is against the fish now (for the page's numbers) */
export function robotAgainst(h: RobotHands, s: FightState): number {
  return againstOf(s, h.steer);
}

/** play one fish to the end; returns the final state */
export function robotFight(p: FightParams, dist: number, seed: number, robot: RobotSkill): FightState {
  const s = startFight(dist, seed);
  const h = robotHands(seed);
  const dt = 1 / 30;
  while (s.end === 'none' && s.t < 400) {
    const hands = robotPlay(h, robot, s, p, dt);
    if (hands.land && landFight(s)) break;
    stepFight(s, p, hands, dt);
  }
  return s;
}
