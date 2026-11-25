/**
 * The fight (docs/V3/plan/fishing-fight.md §3): the fish walked left and right till it is spent, as DREADMOOR has it.
 *
 * The fish swims off to one side of the line or the other and turns every so often. The rod pulled the other way
 * (A/D, the mouse: `steer`) tires it — its stamina, the bar left of the mark — the harder the further the rod is
 * over; the rod with it, or left in the middle, lets it get its breath back. The left button reels: against a fish
 * that still pulls it strains the line (the bar right of the mark), and a fish let run too far strains it too; let
 * go, the reel gives line and the strain falls. At the top of the bar the line parts: the one way to lose a fish.
 *
 * It keeps its distance while it has its strength (holdOf: the user's word, 2026-11-23): out where it was hooked, or
 * further, the reel hardly gains on it; it comes in only as it tires, near one's feet only nearly spent. Hooked near,
 * it runs out to where it fights at once; wound in nearer than it will be, it takes the line back out.
 *
 * Spent is not landed: the fish lies still a few seconds, the time to wind it in; past them it gets some of its
 * strength back and fights another round (a big one several), and near the bank it makes one last bolt. Brought to
 * one's feet spent, it can be landed (the session's land()).
 *
 * A strong move — a run, a leap, a bore, a shock — is told a moment before it comes (the rod tip nods, the water
 * breaks): the time to let go. A fish in the air or giving a shock snatches a reeled line taut at once. A fish that
 * bores down pulls the line straight down: the rod to one side does nothing to it then, and reeling strains the line.
 * Its temper says how often it turns, runs, leaps or bores; a lord's move is its own (the old carp bores for the
 * reeds, the taimen runs three times …). Everything is a pure function of the state, the hands and the fish's dice;
 * one step is dt seconds.
 */
import { Stream } from './rules';
import type { Move, Temper } from './types';

export type FightEnd = 'none' | 'landed' | 'snap' | 'thrown';
export type FishPhase = 'swim' | 'run' | 'rest' | 'jump' | 'dive' | 'zap' | 'breathe' | 'spent';

export interface FightParams {
  /** the fish's strength over the rod's power */
  readonly ratio: number;
  /** seconds of the rod held hard against it that tire it from fresh */
  readonly pool: number;
  readonly temper: Temper;
  readonly move?: Move;
  /** a slick fish (an eel, a loach) wriggles: it turns more often */
  readonly slick: boolean;
  /** how quickly the rod tires it (the rod's power over its strength, softened) */
  readonly lever: number;
  /** the strain the line takes: the bar's top is a load of this */
  readonly tough: number;
  /** metres a second the reel winds at best */
  readonly reel: number;
  /** metres of line on the reel */
  readonly lineMax: number;
  /** how quickly the strain follows (1; the counterweight 0.8) */
  readonly damp: number;
  /** the share of its stamina it gets back when its spent moment passes without its being landed */
  readonly back: number;
  /** seconds it lies spent */
  readonly spentFor: number;
  /** how quickly it gets its breath back with the rod idle (a share of its stamina a second; the rod with it: 1.7 times) */
  readonly heal: number;
  /** it bolts once more near the bank */
  readonly bolt: boolean;
  /** the share of its strong moves it makes without their being told (a lord's) */
  readonly sly: number;
}

/** what the hands do: reel (the left button held), and where the rod is pulled, −1 to the left … 1 to the right */
export interface FightHands {
  reel: boolean;
  steer: number;
}

export interface FightState {
  t: number;
  /** metres of line out to the fish */
  dist: number;
  /** how far out it keeps fresh (m): where it was hooked, or further — it comes in from there only as it tires (holdOf) */
  far: number;
  /** stamina 1 fresh … 0 spent */
  stamina: number;
  /** the line's strain, 0 … 1: at 1 it parts */
  tension: number;
  phase: FishPhase;
  /** seconds left of the phase */
  phaseT: number;
  /** which way it swims across the line: −1 to the angler's left, 1 to the right */
  dir: -1 | 1;
  /** seconds since it last turned, and until it turns of itself */
  turnT: number;
  turnIn: number;
  /** a strong move told: seconds until it comes (0: none), and which; a told move that is a feint (it rests instead) */
  tell: number;
  next: FishPhase;
  feint: boolean;
  /** a trickster's false turn: seconds until it turns back (0: none) */
  fake: number;
  /** where it is across the view, −1 … 1, and how deep (0 at the surface … 1 bored down) */
  side: number;
  depth: number;
  /** how many times it has been spent; its bolt near the bank made */
  rounds: number;
  bolted: boolean;
  /** at one's feet and spent: it can be landed */
  landable: boolean;
  /** how many runs and bores it has made (a lord's moves count them), the pull of the run under way over its usual */
  runs: number;
  bores: number;
  runBoost: number;
  /** seconds since its last breath / shock (the arapaima's, the electric eel's) */
  sinceBreath: number;
  sinceZap: number;
  /** seconds the rod was against it, with it; seconds reeled (the record and the tests) */
  against: number;
  wrong: number;
  reeled: number;
  /** the strain at its highest */
  peak: number;
  end: FightEnd;
  /** the fish's dice */
  rng: number;
}

/** where the bar's gold and red begin (the words over the hotbar, the robots' eyes) */
export const GOLD_AT = 0.5;
export const RED_AT = 0.7;
/** how close a spent fish has to be to be landed (m), and the nearest it comes */
export const LAND_AT = 2.4;
const NEAREST = 1.4;
/** the least a fresh fish keeps out (m): hooked nearer, it takes line out to here at once */
const FAR_MIN = 10;
/** how a fish's distance follows its stamina: the share of the way out it keeps, stamina^HOLD_POW (the user's word,
 * 2026-11-23: it is not drawn to one's face while it has strength; nearly spent it comes in near) */
const HOLD_POW = 0.45;

/** the nearest a fish lets itself be wound in now (m): far out while it has its strength, at one's feet only spent */
export function holdOf(s: FightState): number {
  if (s.phase === 'spent' || s.phase === 'breathe') return NEAREST;
  return NEAREST + (s.far - NEAREST) * Math.pow(Math.max(0, s.stamina), HOLD_POW);
}
/** how far over against it the rod has to be to wear it (DREADMOOR: only at the rod's extreme) */
const HARD = 0.6;
/** seconds after a turn before the rod still the old way counts as with it */
export const GRACE = 0.3;
/** the reel's own load on the line while it winds */
/** the strain's rise a second while one reels a fish that fights (over its pull, its pull a share of the rod's power),
 * its fall a second while one does not (DREADMOOR's 60 of 100), and its rise a second with all the line run out */
const STRAIN = 0.8;
const SLACK = 0.6;
/** the strain's rise a second with the rod not over against a fish that pulls (over its pull and the line's toughness) */
const IDLE_STRAIN = 0.16;
const FAR_STRAIN = 0.9;

export function startFight(dist: number, seed: number): FightState {
  const r = new Stream(seed | 0);
  const s: FightState = {
    t: 0,
    dist,
    far: Math.max(FAR_MIN, dist),
    stamina: 1,
    tension: 0.25,
    phase: 'run',
    phaseT: 1.1 + 0.6 * r.next(),
    dir: r.next() < 0.5 ? -1 : 1,
    turnT: 0,
    turnIn: 1.2 + 0.8 * r.next(),
    tell: 0,
    next: 'swim',
    feint: false,
    fake: 0,
    side: 0,
    depth: 0,
    rounds: 0,
    bolted: false,
    landable: false,
    runs: 1,
    bores: 0,
    runBoost: 1,
    sinceBreath: 0,
    sinceZap: 0,
    against: 0,
    wrong: 0,
    reeled: 0,
    peak: 0,
    end: 'none',
    rng: 0,
  };
  s.rng = r.s;
  return s;
}

/** how often a temper does each thing when a phase ends: swim, run, rest, jump, dive */
const HABIT: Readonly<Record<Temper, readonly [number, number, number, number, number]>> = {
  steady: [0.55, 0.15, 0.3, 0, 0],
  runner: [0.35, 0.45, 0.2, 0, 0],
  jumper: [0.4, 0.22, 0.18, 0.2, 0],
  diver: [0.4, 0.15, 0.2, 0, 0.25],
  brute: [0.45, 0.35, 0.1, 0, 0.1],
  trick: [0.4, 0.35, 0.2, 0.05, 0],
};

/** how long it keeps a way before it turns of itself (s): from, to */
const TURNS: Readonly<Record<Temper, readonly [number, number]>> = {
  steady: [2.4, 4],
  runner: [1.5, 2.8],
  jumper: [1.8, 3],
  diver: [2, 3.5],
  brute: [2.8, 4.5],
  trick: [1.2, 2.2],
};

/** the way a kind of fish pulls first: the same every time for its temper and its own move */
function firstDirOf(p: FightParams): -1 | 1 {
  let h = 7;
  for (const c of `${p.temper}${p.move ?? ''}${p.slick ? 's' : ''}`) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h & 2 ? 1 : -1;
}

/** how long a strong move is told before it comes: shorter for a stronger fish (s) */
export function tellOf(ratio: number): number {
  return Math.max(0.3, Math.min(0.5, 0.52 - 0.12 * ratio));
}

const sneakyOf = (p: FightParams): boolean => p.temper === 'trick' || p.move === 'surge' || p.move === 'eclipse';

function turnInOf(p: FightParams, r: Stream): number {
  const [a, b] = TURNS[p.temper];
  const k = (p.slick ? 0.75 : 1) * (p.move === 'heavy' ? 1.8 : 1);
  // (DREADMOOR's pulls come in a fixed rhythm for each kind of fish: no dice in it)
  void r;
  return ((a + b) / 2) * k * 0.8;
}

/** it turns: the other way across the line (a trickster sometimes only for a moment, then back) */
function turn(s: FightState, p: FightParams, r: Stream, fakeOk = true): void {
  s.dir = s.dir === 1 ? -1 : 1;
  s.turnT = 0;
  s.turnIn = turnInOf(p, r);
  // (no false turns: its pulls keep their order)
  void fakeOk;
  void r;
  void p;
}

function pick(s: FightState, p: FightParams, r: Stream): void {
  const m = p.move;
  let w = [...HABIT[p.temper]];
  if (m === 'reedBore') w = [0.3, 0.15, 0.15, 0, 0.4];
  if (m === 'tripleBore') w = s.bores < 3 ? [0.2, 0.1, 0.1, 0, 0.6] : [0.4, 0.25, 0.2, 0, 0.15];
  if (m === 'tripleRun') w = s.runs < 3 ? [0.2, 0.65, 0.15, 0, 0] : [0.45, 0.3, 0.25, 0, 0];
  if (m === 'leap') w = [0.3, 0.2, 0.15, 0.35, 0];
  if (m === 'longRun') w = [0.35, 0.45, 0.2, 0, 0];
  if (m === 'iceDive') w = [0.3, 0.2, 0.15, 0, 0.35];
  if (m === 'heavy') w = [0.75, 0.1, 0.15, 0, 0];
  // (worn down, it seldom has a strong move left in it)
  const left = Math.min(1, s.stamina / 0.3);
  w[1] *= left;
  w[3] *= left;
  w[4] *= left;
  let sum = 0;
  for (const x of w) sum += x;
  let u = r.next() * sum;
  let k = 0;
  for (; k < 4; k++) {
    if (u < w[k]) break;
    u -= w[k];
  }
  const kinds: FishPhase[] = ['swim', 'run', 'rest', 'jump', 'dive'];
  let next = kinds[k];
  // the shocks and the breaths come on their own time
  if (m === 'zap' && s.sinceZap > 6 + 3 * r.next()) next = 'zap';
  if (m === 'breathe' && s.sinceBreath > 13) next = 'breathe';
  // (a run straight after a run is a swim)
  if (next === 'run' && s.phase === 'run') next = 'swim';
  // (a run is one of its pulls, left or right, and comes untold, as DREADMOOR's do; a leap, a bore, a shock are told)
  const strong = next === 'jump' || next === 'dive' || next === 'zap';
  const sneaky = sneakyOf(p);
  const untold = (sneaky ? (m === 'surge' ? 0.4 : 0.3) : 0) + p.sly;
  if (strong && !(r.next() < untold)) {
    if (s.phase === 'run' || s.phase === 'dive') begin(s, p, 'swim', r);
    s.tell = tellOf(p.ratio);
    s.next = next;
    s.feint = false;
    s.phaseT = s.tell;
    return;
  }
  begin(s, p, next, r);
}

function begin(s: FightState, p: FightParams, phase: FishPhase, r: Stream): void {
  const m = p.move;
  s.phase = phase;
  s.tell = 0;
  switch (phase) {
    case 'swim':
      s.phaseT = m === 'heavy' ? 5 + 3 * r.next() : 1.6 + 1.6 * r.next();
      break;
    case 'rest':
      s.phaseT = 0.8 + 0.8 * r.next();
      break;
    case 'run': {
      const n = s.runs++;
      s.runBoost = m === 'tripleRun' && n < 3 ? 1 + 0.08 * n : 1;
      s.phaseT = m === 'tripleRun' && n < 3 ? 2.5 + 1.2 * n : m === 'longRun' ? 4 + 2 * r.next() : p.temper === 'runner' ? 2 + 1.5 * r.next() : 1.4 + 1.2 * r.next();
      // (a run mostly sets off the other way)
      break;
    }
    case 'jump':
      s.phaseT = 0.9;
      break;
    case 'dive':
      s.bores++;
      s.phaseT = m === 'reedBore' || m === 'tripleBore' ? 3 + 1.5 * r.next() : 1.8 + 1.2 * r.next();
      break;
    case 'zap':
      s.phaseT = 1.1;
      s.sinceZap = 0;
      break;
    case 'breathe':
      s.phaseT = 2.5;
      s.sinceBreath = 0;
      break;
    case 'spent':
      // (spent, it lies there long enough to be wound in from where it is: DREADMOOR's window to pull it in)
      s.phaseT = p.spentFor + (0.8 * s.dist) / p.reel;
      s.rounds++;
      break;
  }
}

/** how hard it pulls now (a share of the rod's power), before the rod against it turns its head */
export function pullOf(s: FightState, p: FightParams): number {
  const v = 0.35 + 0.65 * s.stamina;
  const r = p.ratio;
  switch (s.phase) {
    case 'swim':
      return (p.move === 'heavy' ? 0.5 : 0.42) * r * v;
    case 'run':
      return (p.temper === 'runner' || p.move === 'longRun' ? 1.04 : 0.96) * r * v * s.runBoost;
    case 'rest':
      return 0.12 * r * v;
    case 'dive':
      return 0.8 * r * v;
    case 'zap':
      return 0.3 * r * v;
    case 'spent':
      return 0.03 * r;
    default:
      return 0;
  }
}

/** how much a pull of the rod is against the fish: 1 hard against it, −1 hard with it (0 in a bore: it is below) */
export function againstOf(s: FightState, steer: number): number {
  if (s.phase === 'dive' || s.phase === 'jump' || s.phase === 'breathe' || s.phase === 'spent') return 0;
  return -s.dir * Math.max(-1, Math.min(1, steer));
}

/** one step of dt seconds with the hands as they are */
export function stepFight(s: FightState, p: FightParams, hands: FightHands, dt: number): FightState {
  if (s.end !== 'none') return s;
  const r = new Stream(0);
  r.s = s.rng;
  const reel = hands.reel;
  // (the first pull's way is its kind's, every time: DREADMOOR's fish pull in a fixed order, this way first)
  if (s.t === 0) {
    s.dir = firstDirOf(p);
    s.turnIn = turnInOf(p, r);
  }
  s.t += dt;
  s.turnT += dt;
  s.sinceBreath += dt;
  s.sinceZap += dt;
  // ---- the fish's part: its phases, told or not, and its turns
  if (s.tell > 0) {
    s.tell -= dt;
    if (s.tell <= 0) {
      if (s.feint) {
        s.feint = false;
        begin(s, p, 'rest', r);
      } else begin(s, p, s.next, r);
    }
  } else {
    s.phaseT -= dt;
    if (s.phaseT <= 0) {
      if (s.phase === 'spent') {
        // its moment passed: some of its strength back, and another round (the other way)
        s.stamina = Math.min(1, p.back * (0.8 + 0.4 * r.next()));
        begin(s, p, 'run', r);
        turn(s, p, r, false);
      } else pick(s, p, r);
    }
  }
  if (s.fake > 0) {
    s.fake -= dt;
    if (s.fake <= 0) {
      s.fake = 0;
      turn(s, p, r, false);
    }
  }
  const swims = s.phase === 'swim' || s.phase === 'run' || s.phase === 'rest';
  if (swims) {
    s.turnIn -= dt;
    if (s.turnIn <= 0) turn(s, p, r);
  }
  // ---- the rod against it
  const steer = Math.max(-1, Math.min(1, hands.steer));
  const against = againstOf(s, steer);
  const pullRaw = pullOf(s, p);
  // (the rod over against it turns its head: it pulls less)
  const pull = pullRaw * (1 - 0.25 * Math.max(0, against));
  // ---- its stamina: worn by the rod against it, got back with the rod with it or idle
  // (DREADMOOR's rule: worn only with the rod pulled right over against it and the reel still; any other time —
  // reeling too — it gets its breath back)
  // (the approved design, 2026-11-24: the rod held over against it wears it, reeling or not; reeling never gives it its breath back)
  if (swims && against >= HARD) {
    const k = s.phase === 'run' ? 1.4 : s.phase === 'rest' ? 0.7 : 1;
    s.stamina -= (p.lever * k * dt) / p.pool;
    s.against += dt;
  } else if (s.phase === 'dive') {
    // (a bore against the drag wears it a little)
    s.stamina -= (0.25 * dt) / p.pool;
  } else if (swims && s.turnT > GRACE) {
    s.stamina += p.heal * dt;
    if (against < -0.2) s.wrong += dt;
  }
  s.stamina = s.stamina < 0 ? 0 : s.stamina > 1 ? 1 : s.stamina;
  if (s.stamina <= 0 && (swims || s.phase === 'dive')) begin(s, p, 'spent', r);
  // ---- near the bank, worn down, it bolts once more
  if (p.bolt && !s.bolted && s.dist < 6 && s.stamina < 0.45 && s.tell <= 0 && s.phase !== 'run' && s.phase !== 'jump' && s.phase !== 'dive' && s.phase !== 'zap') {
    s.bolted = true;
    s.stamina = Math.min(1, Math.max(s.stamina, 0.18) + 0.22);
    begin(s, p, 'run', r);
    s.runBoost = 1.15;
    if (s.phase === 'spent') s.phase = 'swim';
  }
  // ---- the line's strain follows the reel and the pull
  // (a strong fish's pull is never quite steady: a slow wobble on the line, the more the stronger it is)
  const wob = Math.sin(s.t * 2.3 + (s.rng & 1023) * 0.006) * 0.6 + Math.sin(s.t * 5.1 + (s.rng & 4095) * 0.0015) * 0.4;
  // (DREADMOOR's rule, docs/V3/plan/fishing-feel.md §9: the strain climbs only while one reels a fish that still
  // fights — the faster the stronger and heavier it is — and while a fish is let run too far; at any other time it
  // falls away at a steady rate. Doing nothing strains nothing: a fish left alone swims off, and that parts the line.)
  const fighting = s.phase !== 'spent' && s.phase !== 'breathe';
  const far = (s.dist - 0.8 * p.lineMax) / (0.2 * p.lineMax);
  // (the approved design: the rod not over against a fish that pulls puts its whole pull on the line — left alone it parts
  // in a dozen seconds, a lord in three; reeling it while it fights strains it more; held against it, the reel still, the strain falls)
  const countering = against >= HARD;
  let rate = countering && !reel ? -SLACK : 0;
  if (fighting && swims && !countering) rate += (IDLE_STRAIN * (0.4 + pull)) / p.tough;
  if (reel && fighting) rate += (STRAIN * (0.35 + pull) * (1 + 0.15 * wob)) / p.tough;
  if (reel && (s.phase === 'jump' || s.phase === 'zap')) rate = Math.max(rate, 2.5);
  if (far > 0) rate = Math.max(rate, 0) + (FAR_STRAIN * far) / p.tough;
  s.tension += rate * (rate > 0 ? p.damp : 1) * dt;
  if (s.tension < 0) s.tension = 0;
  if (s.tension > s.peak) s.peak = s.tension;
  if (s.tension >= 1) {
    s.end = 'snap';
    s.tension = 1;
  }
  // ---- the line in and out: wound in only as far as its strength lets it (holdOf) — reeled while it is still strong
  // it hardly comes; nearer than that, it takes the line back out (hooked near: its first run, out to where it fights)
  // (losing it gives ground, the user's word, 2026-11-24: a run strips line off the reel whatever the hands do — the
  // rod over against it holds it to a third, reeling only slows it and strains the line; let swim unopposed, or with
  // the rod its way, it swims off with the line)
  const hold = Math.max(0, against);
  let out = 0;
  if (s.phase === 'run') out = pull * (2.6 * (1 - hold) + 0.5 * hold) * (reel ? 0.55 : 1);
  else if (s.phase === 'swim') out = (0.35 + 1.4 * pull) * (1 - hold) * (reel ? 0.4 : 1) + (against < -0.2 ? 1.2 * pull : 0);
  else if (s.phase === 'dive') out = pull * 0.6;
  else if (!reel) out = s.phase === 'rest' ? 0.15 : s.phase === 'spent' ? 0.08 : 0.05;
  if (reel) {
    s.reeled += dt;
    if (s.phase === 'spent' || s.phase === 'breathe') s.dist -= p.reel * dt;
    // (reeling always brings it in: slowly while it is fresh, fast as it tires, faster with the rod against it)
    else s.dist -= p.reel * (0.3 + 0.7 * (1 - s.stamina)) * (countering ? 1 : 0.6) * dt;
  }
  s.dist += out * dt;
  s.dist = Math.max(NEAREST, Math.min(p.lineMax + 2, s.dist));
  // ---- at one's feet and spent: it can be landed
  s.landable = s.end === 'none' && s.dist <= LAND_AT && s.phase === 'spent';
  // ---- where it is across the view and how deep
  // (it walks wide across the water, as DREADMOOR's fish do: a run takes it most of the way over)
  const sp = s.phase === 'run' ? 0.62 : s.phase === 'swim' ? 0.28 : s.phase === 'rest' ? 0.08 : 0;
  s.side += s.dir * sp * (1 - 0.55 * Math.max(0, against)) * dt;
  if (s.phase === 'spent') s.side *= Math.max(0, 1 - dt * 0.5);
  // (at the edge of the view it turns back)
  if (Math.abs(s.side) > 0.95) {
    s.side = Math.sign(s.side) * 0.95;
    if (Math.sign(s.side) === s.dir && swims) turn(s, p, r, false);
  }
  const deep = s.phase === 'dive' ? 1 : s.phase === 'jump' ? -1 : 0;
  s.depth += (deep - s.depth) * Math.min(1, dt * (s.phase === 'jump' ? 6 : 2));
  s.rng = r.s;
  return s;
}

/** land a fish that can be landed; whether it was */
export function landFight(s: FightState): boolean {
  if (!s.landable || s.end !== 'none') return false;
  s.end = 'landed';
  return true;
}

/** the tiers' share of their stamina got back after a spent moment, how long they lie spent (s), how quickly they get their breath back unchecked (a share a second; with the rod with them 1.7 times) */
const BACK: readonly number[] = [0.3, 0.3, 0.3, 0.3, 0.3, 0.3];
const SPENT: readonly number[] = [3.2, 3, 2.8, 2.6, 2.3, 2.4];
const RECOVER: readonly number[] = [0.3, 0.3, 0.3, 0.3, 0.3, 0.3];

/**
 * The parameters of a fight for a fish (its strength over the rod's, its stamina) on a rod: its feel, its cast, its
 * reel's speed (`speed`, m/s at best: gear.ts RODS; absent, as the first build had it, by its cast), and the tackle
 * box's line and reel levels (`line`, `reel`).
 */
export function fightParams(o: { ratio: number; pool: number; temper: Temper; move?: Move; slick?: boolean; tier: number; feel: number; cast: number; speed?: number; line: number; reel: number; damp?: boolean }): FightParams {
  const t = Math.max(0, Math.min(5, o.tier | 0));
  // (a fish strong for the rod tires far more slowly, a weak one quickly: the rod's tier tells, the user's word, 2026-11-24)
  const lever = 1.3 * Math.max(0.35, Math.min(1.8, Math.pow(1 / Math.max(0.05, o.ratio), 0.8)));
  return {
    ratio: o.ratio,
    pool: o.pool,
    temper: o.temper,
    move: o.move,
    slick: !!o.slick,
    // (a fish strong for the rod tires far more slowly, a weak one quickly: the rod's tier tells, the user's word, 2026-11-24)
    lever,
    tough: (1 + 0.3 * o.feel) * (1 + 0.04 * o.line),
    reel: (o.speed ?? 2.4 + 0.035 * o.cast) * (1 + 0.08 * o.reel),
    // (line enough for a run or two: a fish let run on strips the reel and strains the line to parting)
    lineMax: o.cast + 20,
    damp: o.damp ? 0.8 : 1,
    back: BACK[t],
    spentFor: SPENT[t],
    // (it gets its breath back faster than the rod wears it, the more so the bigger it is: DREADMOOR's small fish 20 to 17, its big ones 45 to 10)
    heal: (RECOVER[t] * lever) / Math.max(0.5, o.pool),
    bolt: t >= 1,
    sly: t >= 4 ? 0.25 : 0,
  };
}
