/**
 * The modal seam of the V3 kernel (node C1 opens it for the cooking panel; the bench and fishing can take it up):
 * a system opens a panel that has the keys for a while — the cooking at a fire, later a fishing line's fight —
 * without the game's input code knowing the system.
 *
 * While a modal is open:
 *   - a key goes to it first (its `key`); what it uses goes no further. Escape closes it and is not handed on.
 *     The hotbar's number keys are not offered to it: they still choose a slot. A key it does not use goes on
 *     to the game as before (F1, the developer's panel …), but the game's own actions (E for use, Tab for the
 *     list, C for the camera …) are held back: the keys are the modal's;
 *   - the wheel goes to it (`wheel`), not to the hotbar;
 *   - the walker does not move and the view holds; the mark finds nothing;
 *   - a modal that wants the mouse (`mouse`) has the pointer lock let go while it is open, and a click does not
 *     take it again until it is closed.
 * One modal at a time: opening another closes the one before ('replaced'). It closes by itself when its
 * `near()` says the player has walked away from what it is about ('away') or the player sits in a vehicle
 * ('seated'); the game asks once a frame (`step`).
 *
 * The game (ModGame) does the input part and listens to `onChange` for the pointer lock; the tests' stand-in
 * (harness/sim/v3/fakeGame.ts) calls `step` as the game does. No three, no DOM: this runs in plain Node.
 *
 * Whatever a modal's own code does wrong is set apart: a hook that throws is reported (`onError`) and the modal
 * is closed, and the game goes on.
 */

/** why a modal was closed */
export type ModalClose = 'escape' | 'away' | 'seated' | 'replaced' | 'owner' | 'fault';

export interface Modal {
  /** whose it is ('cooking'), for the telemetry and the reports */
  readonly id: string;
  /** it wants the mouse: the pointer lock is let go while it is open */
  readonly mouse?: boolean;
  /** a key went down while it is open (the code: 'KeyE', 'Space' …; `repeat`: held, the key's repeat): true when it used it */
  key?(code: string, repeat: boolean): boolean;
  /** a key came up */
  keyUp?(code: string): void;
  /** the wheel turned (deltaY as the browser gives it): true when it used it */
  wheel?(deltaY: number): boolean;
  /** still about what it was opened for (the player within reach of it)? Asked every frame; false closes it */
  near(): boolean;
  /** it was closed: by Escape, by walking away, by sitting in a vehicle, by another modal, by its owner */
  closed?(why: ModalClose): void;
}

/** the hotbar's number keys: never the modal's */
const DIGIT = /^Digit[0-9]$/;

export class Modals {
  /** told when a modal opens (the modal) and when the last one closes (null): the game lets go of the pointer lock and takes it back */
  onChange: ((open: Modal | null) => void) | null = null;
  /** told of a modal's hook that threw (the modal is closed then) */
  onError: ((error: unknown, where: string) => void) | null = null;
  private now: Modal | null = null;
  /** how many were opened since the page began (the telemetry's) */
  private opened = 0;

  /** the modal open now (null: none) */
  get current(): Modal | null {
    return this.now;
  }

  get isOpen(): boolean {
    return this.now !== null;
  }

  /** a modal is open that wants the mouse */
  get wantsMouse(): boolean {
    return this.now !== null && this.now.mouse === true;
  }

  /** is this one the modal open now? */
  isOpenFor(m: Modal): boolean {
    return this.now === m;
  }

  /** open a modal (the one open before, if another, is closed first: 'replaced'); opening the one that is open changes nothing */
  open(m: Modal): void {
    if (this.now === m) return;
    if (this.now) this.shut(this.now, 'replaced', false);
    this.now = m;
    this.opened++;
    this.onChange?.(m);
  }

  /** close it, if it is the one open (the owner closes its own: 'owner'); true when it was open */
  close(m: Modal, why: ModalClose = 'owner'): boolean {
    if (this.now !== m) return false;
    this.shut(m, why, true);
    return true;
  }

  /** whatever is open, closed (a new game, the player died) */
  closeAll(why: ModalClose = 'owner'): void {
    if (this.now) this.shut(this.now, why, true);
  }

  /**
   * A key went down: true when the modal open took it (the game does nothing more with it). Escape closes the
   * modal; the hotbar's number keys are never taken.
   */
  key(code: string, repeat = false): boolean {
    const m = this.now;
    if (!m) return false;
    if (code === 'Escape') {
      if (!repeat) this.shut(m, 'escape', true);
      return true;
    }
    if (DIGIT.test(code) || !m.key) return false;
    try {
      return m.key(code, repeat) === true;
    } catch (e) {
      this.fault(m, 'key', e);
      return true;
    }
  }

  keyUp(code: string): void {
    const m = this.now;
    if (!m?.keyUp) return;
    try {
      m.keyUp(code);
    } catch (e) {
      this.fault(m, 'keyUp', e);
    }
  }

  /** the wheel: true when the modal open took it */
  wheel(deltaY: number): boolean {
    const m = this.now;
    if (!m) return false;
    if (!m.wheel) return true;
    try {
      m.wheel(deltaY);
    } catch (e) {
      this.fault(m, 'wheel', e);
    }
    return true;
  }

  /** once a frame: the modal open is closed when the player sits in a vehicle, or has walked away from it */
  step(seated: boolean): void {
    const m = this.now;
    if (!m) return;
    if (seated) {
      this.shut(m, 'seated', true);
      return;
    }
    let near: boolean;
    try {
      near = m.near();
    } catch (e) {
      this.fault(m, 'near', e);
      return;
    }
    if (!near) this.shut(m, 'away', true);
  }

  telemetry(): { open: string | null; mouse: boolean; opened: number } {
    return { open: this.now ? this.now.id : null, mouse: this.wantsMouse, opened: this.opened };
  }

  private fault(m: Modal, asked: string, e: unknown): void {
    this.onError?.(e, `modal ${m.id} (${asked})`);
    if (this.now === m) this.shut(m, 'fault', true);
  }

  /** `last`: no other opens straight after (the game is told that none is open) */
  private shut(m: Modal, why: ModalClose, last: boolean): void {
    this.now = null;
    try {
      m.closed?.(why);
    } catch (e) {
      this.onError?.(e, `modal ${m.id} (closed)`);
    }
    if (last && this.now === null) this.onChange?.(null);
  }
}
