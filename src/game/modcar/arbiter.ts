/**
 * Unified interaction arbiter (docs/V3/plan/finish.md §十九, steps 2+3):
 * one single source of truth that decides what every key and mouse button does
 * in the current frame, and generates both the centre prompt (under the mark)
 * and the right-side key column from that same decision.
 *
 * Enforces Nomad Drive's four conflict-prevention rules by construction:
 *  1. Secondary promotion: if an aimed target has no primary (LMB) action, its
 *     secondary (E) action promotes to LMB. When a target has both a function
 *     and a secondary action (e.g. a door: open/close + detach), function stays
 *     on LMB and detach stays on hold E — never tap+hold on the same key.
 *  2. Tool-replaces-target: when the matching tool is in hand (repair kit on
 *     its part, printed photo on a surface), it replaces the target's actions
 *     instead of adding a competing action.
 *  3. Target beats held item: if the aimed target claims a physical key (LMB,
 *     E, Wheel, etc.), any held-item action on that same key is withheld and
 *     hidden from the right-side key list for this frame.
 *  4. Mode isolation: on-foot, placement, and driving modes each emit only
 *     their own keys, with zero duplicate key bindings within a mode.
 */
import type { Action, KeyName } from './hudItems';

export type ArbiterMode = 'foot' | 'place' | 'seat';

export type HoldKind = 'attach' | 'detach' | 'repair' | 'wear' | 'grab' | 'use' | 'throw' | 'stand';

/** Fixed Nomad Drive hold durations (seconds). */
export const ND_HOLD_S = {
  attach: 0.35,
  detach: 0.5,
  repair: 0.5,
  wear: 0.5,
  grab: 0.5,
  stand: 0.35,
  throwMax: 1.2,
  grace: 0.2,
} as const;

/** A single candidate binding fed into the arbiter. */
export interface CandidateBinding {
  /** Stable id for dispatch and testing (e.g. 'door.toggle', 'part.detach', 'kit.repair', 'item.eat'). */
  readonly id: string;
  /** Physical key before promotion; 'Secondary' marks a target secondary slot eligible for LMB promotion. */
  readonly key: KeyName;
  readonly hold?: boolean;
  readonly holdS?: number;
  readonly text: string;
  readonly off?: boolean;
  readonly why?: string;
  /** True when this binding is the target's secondary action (eligible for promotion to LMB if target has no LMB). */
  readonly secondarySlot?: boolean;
  /** Additional keys displayed together on one prompt row (e.g. ['Q', 'E'] for 90-deg rotate in placement). */
  readonly extraKeys?: readonly KeyName[];
}

export interface ResolvedBinding {
  readonly id: string;
  readonly key: KeyName;
  readonly keys: KeyName[];
  readonly hold: boolean;
  readonly holdS: number;
  readonly text: string;
  readonly off: boolean;
  readonly why?: string;
  readonly source: 'target' | 'held' | 'mode';
}

export interface ArbiterInput {
  readonly mode: ArbiterMode;
  /** Target's own candidate actions (centre prompt). Already replaced if a tool overrides the target. */
  readonly target?: readonly CandidateBinding[];
  /** Held item's own candidate actions (right-side list). Ignored in 'seat' mode. */
  readonly held?: readonly CandidateBinding[];
  /** Mode-level persistent hints (e.g. Q throw, R place, or driving keys in 'seat'). */
  readonly extra?: readonly CandidateBinding[];
}

export interface ArbiterResult {
  readonly mode: ArbiterMode;
  /** Actions shown centred below the crosshair. */
  readonly center: Action[];
  /** Actions shown down the right side of the screen. */
  readonly right: Action[];
  /** Winning binding per physical key for actual input dispatch. */
  readonly byKey: ReadonlyMap<KeyName, ResolvedBinding>;
  /** Keys claimed by the aimed target (used to withhold held-item presses). */
  readonly targetKeys: ReadonlySet<KeyName>;
  /** True if target secondary action was promoted from E to LMB. */
  readonly promotedSecondary: boolean;
}

function toAction(b: ResolvedBinding): Action {
  return {
    keys: b.keys,
    ...(b.hold ? { hold: true } : {}),
    text: b.text,
    ...(b.off ? { off: true } : {}),
    ...(b.why !== undefined ? { why: b.why } : {}),
  };
}

/**
 * Promote a target's secondary action (E) to primary (LMB) when the target
 * has no primary (LMB) action of its own — matching Nomad Drive's secondary
 * promotion rule.
 */
export function applySecondaryPromotion(target: readonly CandidateBinding[]): {
  readonly list: CandidateBinding[];
  readonly promoted: boolean;
} {
  if (target.length === 0) return { list: [], promoted: false };
  const hasPrimary = target.some((b) => b.key === 'LMB' && !b.secondarySlot);
  if (hasPrimary) return { list: [...target], promoted: false };
  let promoted = false;
  const list = target.map((b) => {
    if (b.secondarySlot && b.key === 'E') {
      promoted = true;
      return { ...b, key: 'LMB' as KeyName };
    }
    return b;
  });
  return { list, promoted };
}

/**
 * Resolve one frame of interaction bindings across target, held item, and mode.
 * Guarantees at most one binding per physical key.
 */
export function resolveArbiter(input: ArbiterInput): ArbiterResult {
  const byKey = new Map<KeyName, ResolvedBinding>();
  const targetKeys = new Set<KeyName>();
  const center: Action[] = [];
  const right: Action[] = [];

  const { list: promotedTarget, promoted: promotedSecondary } = applySecondaryPromotion(input.target ?? []);

  const claim = (cand: CandidateBinding, source: 'target' | 'held' | 'mode'): ResolvedBinding | null => {
    const keys: KeyName[] = cand.extraKeys ? [cand.key, ...cand.extraKeys] : [cand.key];
    // Never allow two bindings to claim the same physical key.
    for (const k of keys) {
      if (byKey.has(k)) return null;
    }
    const resolved: ResolvedBinding = {
      id: cand.id,
      key: cand.key,
      keys,
      hold: !!cand.hold,
      holdS: cand.holdS ?? 0,
      text: cand.text,
      off: !!cand.off,
      why: cand.why,
      source,
    };
    for (const k of keys) {
      byKey.set(k, resolved);
      if (source === 'target') targetKeys.add(k);
    }
    return resolved;
  };

  // 1. Target claims first (centre prompt).
  for (const c of promotedTarget) {
    const r = claim(c, 'target');
    if (r) center.push(toAction(r));
  }

  // 2. Held item claims next (right column), suppressed on any key claimed by target.
  if (input.mode !== 'seat') {
    for (const c of input.held ?? []) {
      const r = claim(c, 'held');
      if (r) right.push(toAction(r));
    }
  }

  // 3. Mode-level bindings (Q throw, R place, placement controls, driving keys).
  for (const c of input.extra ?? []) {
    const r = claim(c, 'mode');
    if (r) right.push(toAction(r));
  }

  return { mode: input.mode, center, right, byKey, targetKeys, promotedSecondary };
}

/**
 * Audit helper: returns any physical keys that appear more than once across the
 * visible center + right prompt arrays (or with conflicting actions).
 * An empty array proves one-key-one-meaning for that frame.
 */
export function findKeyConflicts(center: readonly Action[], right: readonly Action[]): KeyName[] {
  const seen = new Set<KeyName>();
  const dup = new Set<KeyName>();
  for (const a of [...center, ...right]) {
    if (a.off) continue;
    for (const k of a.keys) {
      if (seen.has(k)) dup.add(k);
      else seen.add(k);
    }
  }
  return [...dup];
}

/**
 * Filter a raw right-side action list against keys already claimed by the centre
 * prompt (used while migrating individual subsystems onto the full arbiter so
 * centre and right can never contradict each other on the same key).
 */
export function gateRightActions(center: readonly Action[], right: readonly Action[]): Action[] {
  const claimed = new Set<KeyName>();
  for (const a of center) {
    for (const k of a.keys) claimed.add(k);
  }
  if (claimed.size === 0) return [...right];
  const out: Action[] = [];
  for (const a of right) {
    if (a.keys.length > 0 && a.keys.some((k) => claimed.has(k))) continue;
    out.push(a);
  }
  return out;
}
