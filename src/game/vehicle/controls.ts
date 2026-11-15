/**
 * Everything in and on the vehicle one operates (the owner's list: handbrake, doors, windows,
 * lights, dashboard, radio): each control point a model lists in `VehicleParts.controls` becomes an
 * `Interactable` with one word (src/game/player/vehicleUses.ts shows the pattern), and every frame
 * the parts that show a control's state are posed from the vehicle systems — the lever is where
 * `systems` says it is, whether it was moved by a key or by a hand.
 *
 * Control ids (the part after '@' only tells two handles of one thing apart, e.g. a door's inside
 * and outside handle):
 *   key, selector, handbrake, lights, wipers, horn, hazard, radio, tune, volume, cabinLamp, stopCord
 *     — operate the systems; posed by the mover `ctl:<id>`
 *   any id that is one of the vehicle's movers (doorL, windowR, bonnet, glovebox, visorL, door,
 *   awning, tailgate, slideDoor, rearDoor, drawer …) — open / shut it (a window goes down in steps)
 */
import { bodyToWorld, EXIT_KMH } from '../../core/onfoot/vehicle';
import type { Actor, Interactable, InteractSource, LongUse, Vec3 } from '../../core/interact/interact';
import type { Container } from '../../core/items/containers';
import type { Game } from '../game';
import type { ControlPoint, Reach } from './kit';
import { Radio, TUNE_STEPS, VOLUME_STEPS } from './radio';

/** what a selector step reaches, and its word */
const SEL = ['P', 'R', 'N', 'D'] as const;
const SEL_WORD: Record<string, string> = { P: '驻车', R: '倒挡', N: '空挡', D: '前进' };
/** windows go down in thirds */
export const WINDOW_STEP = 1 / 3;

/** the semantic part of a control id ('doorL@out' → 'doorL') */
export function baseId(id: string): string {
  const i = id.indexOf('@');
  return i < 0 ? id : id.slice(0, i);
}

/** the word a door-like mover gets */
function openWord(id: string, open: boolean): string {
  if (/^door|Door$|^tailgate|^rearDoor/.test(id)) return open ? '关门' : '开门';
  if (id.startsWith('window')) return open ? '摇上' : '摇下';
  if (id === 'bonnet') return open ? '合盖' : '开盖';
  if (id === 'awning') return open ? '收起' : '撑开';
  if (id === 'drawer') return open ? '推回' : '拉出';
  if (id.startsWith('visor')) return open ? '翻上' : '放下';
  return open ? '合上' : '打开';
}

class CabUse implements Interactable {
  readonly hold = 0;
  private readonly b = new Float64Array(9);
  long?: LongUse;
  constructor(
    readonly cab: CabControls,
    readonly cid: string,
    readonly pt: ControlPoint,
  ) {
    if (baseId(cid) === 'selector') {
      // a tap moves the lever one notch towards D, a hold one notch towards P
      this.long = {
        hold: 0.6,
        prompt: () => {
          const n = cab.selectorStep(-1);
          return n ? SEL_WORD[n] : null;
        },
        act: () => cab.game.systems.stepLever(-1),
      };
    }
    // the starter and the horn go on while E is held
    const b = baseId(cid);
    if (b === 'key' || b === 'horn') this.channel = (a: Actor, dt: number) => cab.channel(b, a, dt);
  }
  channel?: (a: Actor, dt: number) => boolean;
  get id(): string {
    return `${this.cab.game.sim.spec.id}:${this.cid}`;
  }
  get radius(): number {
    return this.pt.r;
  }
  get through(): string {
    return this.cab.game.sim.spec.id;
  }
  aim(out: Vec3): void {
    bodyToWorld(this.cab.game.sim, this.b, this.pt.x, this.pt.y, this.pt.z, out);
  }
  prompt(_a: Actor): string | null {
    const need = this.pt.needsOpen;
    if (need && (this.cab.game.view.moverState[need] ?? 0) < 0.5) return null;
    return this.cab.word(baseId(this.cid));
  }
  act(_a: Actor): boolean {
    return this.cab.operate(baseId(this.cid));
  }
}

/** where the player is: which controls are in reach */
export function reachOf(game: Game): Reach {
  if (game.player?.onFoot) return 'outside';
  if (game.walker) return 'onboard';
  if (!game.seat) return 'driver';
  return game.seat === 'passenger' ? 'passenger' : 'seated';
}

export function reaches(pt: ControlPoint, where: Reach): boolean {
  if (pt.from.includes(where)) return true;
  // the driver and the passenger are seated too
  return (where === 'driver' || where === 'passenger') && pt.from.includes('seated');
}

export class CabControls implements InteractSource {
  readonly uses: CabUse[] = [];
  readonly radio = new Radio();
  /** the radio's one sentence on screen (text bubble for now) and how long it stays */
  bubble = '';
  private bubbleT = 0;
  private lastCode = '';
  private cranking = false;
  private honking = false;
  private usedThisFrame = '';
  private thumps = 0;
  private hopY = 0;
  private hopV = 0;
  private rattleT = 0;
  private bubbleEl: HTMLDivElement | null = null;
  glovebox: Container | null = null;
  private readonly b = new Float64Array(9);
  private readonly p = { x: 0, y: 0, z: 0 };
  private readonly q = { x: 0, y: 0, z: 0 };

  constructor(readonly game: Game) {
    const parts = game.view.parts;
    for (const [id, pt] of Object.entries(parts.controls ?? {})) this.uses.push(new CabUse(this, id, pt));
    const gb = parts.glovebox;
    if (gb && game.player) {
      // (never a solid: it rides inside the car, and a solid there is something the car itself runs into
      // at every step — shoved sideways off the road with a pinched tyre before the first frame)
      this.glovebox = game.player.containers.add({ id: `${game.sim.spec.id}:glovebox`, kind: 'glovebox', x: 0, y: 0, z: 0, heading: 0, seed: 7, hx: gb.hx, h: gb.h, hz: gb.hz, slots: 4, solid: false });
      this.follow();
    }
  }

  interactablesNear(x: number, z: number, r: number, out: Interactable[]): void {
    const sim = this.game.sim;
    const reach = r + sim.spec.body.halfLength + 1;
    if ((sim.px - x) ** 2 + (sim.pz - z) ** 2 > reach * reach) return;
    const where = reachOf(this.game);
    for (const u of this.uses) if (reaches(u.pt, where)) out.push(u);
  }

  private mover(id: string): number {
    return this.game.view.moverState[id] ?? 0;
  }

  /** the selector one notch along (−1 towards P, +1 towards D), or null at the end */
  selectorStep(d: number): string | null {
    const i = SEL.indexOf(this.game.sim.selector) + d;
    return i >= 0 && i < SEL.length ? SEL[i] : null;
  }

  /** the one word for a control now (null: nothing to do with it) */
  word(id: string): string | null {
    const g = this.game;
    const sys = g.systems;
    switch (id) {
      case 'key':
        return sys.state.running ? '熄火' : '打火';
      case 'selector': {
        const n = this.selectorStep(1);
        return n ? SEL_WORD[n] : null;
      }
      case 'handbrake':
        return g.sim.parkBrake > 0 ? '放下' : '拉起';
      case 'lights':
        return '车灯';
      case 'wipers':
        return '雨刷';
      case 'horn':
        return '喇叭';
      case 'hazard':
        return '双闪';
      case 'radio':
        return sys.state.radio ? '关机' : '开机';
      case 'tune':
        return sys.state.radio ? '调台' : null;
      case 'volume':
        return sys.state.radio ? '音量' : null;
      case 'cabinLamp':
        return g.view.cabinLight ? '关灯' : '开灯';
      case 'stopCord':
        return '停车';
    }
    if (!g.view.parts.movers[id]) return null;
    // a door does not open at speed
    if (/^door|Door$|^tailgate/.test(id) && Math.abs(g.sim.kmh) > EXIT_KMH && this.mover(id) < 0.5) return null;
    if (id.startsWith('window')) return openWord(id, this.mover(id) >= 1 - 1e-6);
    return openWord(id, this.mover(id) > 0.5);
  }

  /** a press on a control */
  operate(id: string): boolean {
    const g = this.game;
    const sys = g.systems;
    this.usedThisFrame = id;
    switch (id) {
      case 'selector':
        return sys.stepLever(1);
      case 'handbrake':
        sys.toggleHandbrake();
        return true;
      case 'lights':
        g.lightsManual = null;
        sys.cycleLights();
        return true;
      case 'wipers':
        sys.cycleWipers();
        return true;
      case 'hazard':
        sys.toggleHazard();
        return true;
      case 'radio':
        sys.setRadio(!sys.state.radio);
        return true;
      case 'tune':
        this.radio.nextTune();
        return true;
      case 'volume':
        this.radio.nextVolume();
        return true;
      case 'cabinLamp':
        g.cabinLightManual = !g.view.cabinLight;
        return true;
      case 'stopCord':
        // ding: whoever drives stops; the robot hands back and the vehicle is held with a gentle brake
        this.radio.ding(2);
        if (g.robot) g.robot = null;
        this.say('好，前面找地方停。');
        this.cordT = 0.6;
        return true;
    }
    if (!g.view.parts.movers[id]) return false;
    const t = this.mover(id);
    if (id.startsWith('window')) g.view.setMover(id, t >= 1 - 1e-6 ? 0 : Math.min(1, t + WINDOW_STEP));
    else g.view.setMover(id, t > 0.5 ? 0 : 1);
    return true;
  }
  private cordT = 0;

  /** the starter and the horn, while E is held */
  channel(id: string, _a: Actor, _dt: number): boolean {
    const sys = this.game.systems;
    this.usedThisFrame = id;
    if (id === 'horn') {
      sys.setHorn(true);
      this.honking = true;
      return true;
    }
    if (sys.state.running) {
      if (!this.cranking) sys.stopEngine();
      this.cranking = false;
      sys.crank(false);
      return false;
    }
    sys.crank(true);
    this.cranking = true;
    return true;
  }

  /** the radio's voice: one sentence in a bubble */
  say(text: string): void {
    this.bubble = text;
    this.bubbleT = text ? 4 : 0;
  }

  /** the glovebox container follows the vehicle (its things are the vehicle's) */
  private follow(): void {
    const gb = this.game.view.parts.glovebox;
    const c = this.glovebox;
    if (!gb || !c) return;
    const sim = this.game.sim;
    bodyToWorld(sim, this.b, gb.x, gb.y, gb.z, this.p);
    bodyToWorld(sim, this.b, gb.x + 1, gb.y, gb.z, this.q);
    const d = c.def;
    d.x = this.p.x;
    d.y = this.p.y;
    d.z = this.p.z;
    d.heading = Math.atan2(this.q.z - this.p.z, this.q.x - this.p.x);
    c.solid.set(d.x, d.z, d.hx, d.hz, d.heading, d.y - 0.1, d.y + d.h, false, d.id);
  }

  /** the t each systems-driven part stands at */
  states(): Record<string, number> {
    const g = this.game;
    const s = g.systems.state;
    const order = <T>(list: readonly T[], v: T): number => Math.max(0, list.indexOf(v)) / Math.max(1, list.length - 1);
    return {
      'ctl:key': g.systems.dash.cranking ? 1 : order(['off', 'acc', 'on'] as const, s.ignition) * (2 / 3),
      'ctl:selector': order(SEL, g.sim.selector),
      'ctl:handbrake': g.sim.parkBrake > 0 ? 1 : 0,
      'ctl:lights': order(['off', 'auto', 'low', 'high'] as const, s.lights),
      'ctl:wipers': order(['auto', 'off', 'slow', 'fast'] as const, s.wipers),
      'ctl:hazard': s.hazard ? 1 : 0,
      'ctl:radio': s.radio ? 1 : 0,
      'ctl:tune': this.radio.tune / (TUNE_STEPS - 1),
      'ctl:volume': (this.radio.volume - 1) / (VOLUME_STEPS - 1),
      'ctl:cabinLamp': g.view.cabinLight ? 1 : 0,
      'ctl:stopCord': this.cordT > 0 ? 1 : 0,
      'ctl:horn': g.systems.dash.horn ? 1 : 0,
    };
  }

  /** every frame, after the systems and the view */
  update(dt: number): void {
    const g = this.game;
    const view = g.view;
    const parts = view.parts;
    const sys = g.systems;
    // E let go: the starter springs back, the horn stops
    const held = g.player?.use_.target;
    const heldId = held && held instanceof CabUse ? baseId(held.cid) : '';
    if (this.cranking && heldId !== 'key') {
      sys.crank(false);
      this.cranking = false;
    }
    if (this.honking && heldId !== 'horn') {
      sys.setHorn(false);
      this.honking = false;
    }
    this.usedThisFrame = '';
    if (this.cordT > 0) this.cordT -= dt;
    // the parts that show the systems' state
    for (const [m, t] of Object.entries(this.states())) if (parts.movers[m] && Math.abs((view.moverState[m] ?? -1) - t) > 1e-4) view.setMover(m, t);
    // a wheel taken off: its hub and drum stay (game.ts hides the wheel)
    parts.hubs?.update(parts.wheels, (i) => !!sys.state.wheels[i]?.off);
    // the live dash
    const d = sys.dash;
    parts.dashPanel?.update(d, view.lightsOn || g.env?.dark === true);
    // the radio: on with the systems' switch, a bump may skip a station
    this.radio.on = sys.state.radio && sys.state.ignition !== 'off';
    const thumps = g.sim.feel.thumps;
    const bumped = thumps !== this.thumps;
    if (bumped && this.radio.on && sys.hasQuirk('radio_skip') && g.sim.feel.thump > 0.25) this.radio.skip();
    const doorOpen = sys.state.ignition !== 'off' && Object.keys(parts.movers).some((m) => /^door[LR]$/.test(m) && (view.moverState[m] ?? 0) > 0.5);
    this.radio.update(dt, doorOpen);
    // things on the dash hop on a bump
    if (bumped) this.hopV += Math.min(0.9, g.sim.feel.thump * 1.6);
    this.thumps = thumps;
    if (this.hopV !== 0 || this.hopY > 0) {
      this.hopV -= 9.8 * dt;
      this.hopY += this.hopV * dt;
      if (this.hopY <= 0) {
        this.hopY = 0;
        this.hopV = Math.abs(this.hopV) > 0.15 ? -this.hopV * 0.3 : 0;
      }
    }
    if (parts.jumpers) parts.jumpers.position.y = this.hopY;
    // a door that rattles: a shake in its frame after a bump
    if (bumped && sys.hasQuirk('door_rattle') && g.sim.feel.thump > 0.2) {
      this.rattleT = 0.16;
      this.radio.rattle();
    }
    if (this.rattleT > 0) {
      this.rattleT -= dt;
      const door = ['doorL', 'doorR', 'door'].find((m) => parts.movers[m] && (view.moverState[m] ?? 0) < 0.02);
      if (door) view.setMover(door, this.rattleT > 0 && Math.floor(this.rattleT * 40) % 2 === 0 ? 0.012 : 0);
    }
    // the radio's voice: a red lamp says one sentence
    const code = d.message.code;
    if (code && code !== this.lastCode && d.message.zh) this.say(d.message.zh);
    this.lastCode = code;
    if (this.bubbleT > 0) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) this.bubble = '';
    }
    this.showBubble();
    this.follow();
    if (this.glovebox?.opened && (view.moverState.glovebox ?? 0) < 0.5 && parts.movers.glovebox && !this.gbAuto) {
      view.setMover('glovebox', 1);
      this.gbAuto = true;
    }
  }
  private gbAuto = false;

  private showBubble(): void {
    if (typeof document === 'undefined') return;
    if (!this.bubbleEl) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;left:50%;bottom:16%;transform:translateX(-50%);max-width:60%;padding:8px 14px;border-radius:14px;background:rgba(243,234,214,0.94);color:#2a2622;font:15px/1.4 sans-serif;box-shadow:0 2px 0 rgba(42,38,34,0.5);pointer-events:none;display:none;z-index:20';
      document.body.appendChild(el);
      this.bubbleEl = el;
    }
    const show = this.bubble !== '' && !this.game.player?.onFoot;
    this.bubbleEl.style.display = show ? 'block' : 'none';
    if (show) this.bubbleEl.textContent = `收音机：${this.bubble}`;
  }

  telemetry(): Record<string, number | string | boolean> {
    const lit = this.game.view.parts.dashPanel?.lit ?? {};
    return {
      radioOn: this.radio.on,
      radioTune: this.radio.tune,
      radioStation: this.radio.station,
      radioVolume: this.radio.volume,
      bubble: this.bubble,
      lampsLit: Object.entries(lit).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(','),
    };
  }
}
