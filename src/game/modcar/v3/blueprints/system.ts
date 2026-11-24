/**
 * The upgrade blueprints (docs/V3/plan/growth.md §六 2, Nomad Drive's: a sheet that says how to fit an upgrade, the
 * upgrade made from it as it is fitted): the roof rack's (J9c), the ladder's and the motorcycle rack's (J9e). Held to a
 * vehicle standing still — the place for it clear — the left button held a second fits the upgrade to it from the
 * sheet, and the sheet is used up: a rack on the roof is a place for things (core/modcar/cargo.ts zonesFor), a ladder
 * up its side takes one onto its roof (v3/ladder), a motorcycle rack in its hitch's place carries the Swallow across its
 * back (v3/moto-rack). On a moving vehicle, one without the place for it (the motorcycle has no roof and no hitch) or
 * one whose place has something on it already, it says why not.
 */
import type { System } from '../../../../core/kernel/systems';
import { fitPart, newInstance } from '../../../../core/modcar/build';
import { ladderSpot } from '../../../../core/modcar/ladders';
import { partDef } from '../../../../core/modcar/parts';
import type { GameContext } from '../../kernel/context';
import type { Action } from '../../hudItems';
import type { HandsUse, Held } from '../../player';
import type { ModVehicle } from '../../vehicle';

/**
 * the blueprints: what each fits on which category of mount, what it is called, why not on a vehicle without that
 * mount, and what it says of what is there already
 */
export const BLUEPRINTS: Readonly<Record<string, { part: string; cat: string; name: string; none: string; taken: (what: string) => string }>> = {
  bp_roof_rack: { part: 'roof_rack', cat: 'roof', name: '车顶行李架', none: '这辆车没有车顶', taken: (w) => `车顶上已经有${w}` },
  bp_ladder: { part: 'ladder', cat: 'ladder', name: '梯子', none: '这辆车没有车顶', taken: (w) => `车上已经有${w}` },
  // (in the hitch's place: a hitch ball on it, a trailer on that, are what is there)
  bp_moto_rack: { part: 'moto_rack', cat: 'hitch', name: '摩托车架', none: '这辆车后面装不了车架', taken: (w) => `后面已经装着${w}` },
};

/** the left button held this long (s) */
export const FIT_S = 1;

/** what a blueprint would be fitted to, or why not */
export function blueprintAim(bp: string, v: ModVehicle | null): { v: ModVehicle; mount: string } | { why: string } {
  const b = BLUEPRINTS[bp];
  if (!b || !v) return { why: '对着车' };
  const m = v.view.frame.mounts.find((x) => x.cat === b.cat);
  // (the Whale's ladder is its own model's, up its back: climbed without one)
  if (!m && b.cat === 'ladder' && ladderSpot(v.view.frame.id)?.builtin) return { why: '这辆车自带梯子' };
  if (!m) return { why: b.none };
  const on = v.build.parts[m.id];
  if (on) return { why: b.taken(partDef(on.part).name.zh) };
  if (Math.abs(v.sim.kmh) > 1.5) return { why: '先停车' };
  return { v, mount: m.id };
}

export class Blueprints implements System<GameContext> {
  readonly id = 'blueprints';
  readonly budget = { cpuMs: 0.05 };
  private ctx: GameContext | null = null;
  /** the hold: how long so far (s), on which vehicle */
  private holdT = -1;
  private holdOn: ModVehicle | null = null;

  readonly hands: HandsUse = {
    id: 'blueprints',
    claims: (h) => h.kind === 'item' && !!BLUEPRINTS[h.item.item],
    press: (h, from) => {
      if (from !== 'key' || h.kind !== 'item' || !this.ctx) return false;
      const a = blueprintAim(h.item.item, this.ctx.player.lookVehicle);
      if (!('v' in a)) return false;
      this.holdT = 0;
      this.holdOn = a.v;
      return true;
    },
    release: (_h, from) => {
      if (from !== 'key' || this.holdT < 0) return false;
      this.stop();
      return true;
    },
    step: (h, dt) => this.stepHold(h, dt),
    words: (h) => this.wordsOf(h),
    gone: () => this.stop(),
  };

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.player.hands?.push(this.hands);
  }

  private stop(): void {
    this.holdT = -1;
    this.holdOn = null;
    if (this.ctx) this.ctx.player.progress = 0;
  }

  private stepHold(h: NonNullable<Held>, dt: number): void {
    const ctx = this.ctx;
    if (!ctx || this.holdT < 0 || h.kind !== 'item') return;
    const a = blueprintAim(h.item.item, ctx.player.lookVehicle);
    // (looked away, the vehicle moved off, or let go: the hold is off)
    if (!('v' in a) || a.v !== this.holdOn || !ctx.player.primary) {
      this.stop();
      return;
    }
    this.holdT += dt;
    ctx.player.progress = Math.min(1, this.holdT / FIT_S);
    if (this.holdT < FIT_S) return;
    // done: the upgrade made from the sheet and fitted, the sheet used up
    const b = BLUEPRINTS[h.item.item];
    const inst = newInstance(b.part);
    inst.cond = 0.92;
    fitPart(a.v.build, a.mount, inst);
    this.stop();
    ctx.player.slots[ctx.player.sel] = null;
    // (the button still down is spent: the empty hands must not take the rack off again)
    ctx.player.spent = true;
    a.v.changed();
    ctx.cargo.invalidate(a.v);
    ctx.sound('ratchet_done', 0.8);
    ctx.ui.say(`装上了${b.name}`, 2.2);
  }

  private wordsOf(h: NonNullable<Held>): Action[] {
    if (h.kind !== 'item' || !this.ctx) return [];
    const b = BLUEPRINTS[h.item.item];
    const a = blueprintAim(h.item.item, this.ctx.player.lookVehicle);
    if (!('v' in a)) return [{ keys: ['LMB'], hold: true, text: `装上 <b>${b.name}</b>`, off: true, why: a.why }];
    return [{ keys: ['LMB'], hold: true, text: `装上 <b>${b.name}</b>` }];
  }

  /** for the harness: fitted on this vehicle now, as the hold would (true: done) */
  fitNow(bp: string, v: ModVehicle): boolean {
    const a = blueprintAim(bp, v);
    if (!('v' in a)) return false;
    const inst = newInstance(BLUEPRINTS[bp].part);
    inst.cond = 0.92;
    fitPart(v.build, a.mount, inst);
    v.changed();
    this.ctx?.cargo.invalidate(v);
    return true;
  }
}
