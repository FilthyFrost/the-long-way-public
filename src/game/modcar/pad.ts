/**
 * A gamepad in ModCar (docs/MODCAR.md §24), on top of what the shared input already reads off it (src/game/input.ts,
 * the older game's too, left as it is: the left stick walks and steers, the right stick looks, the triggers are
 * the throttle and the brake, A the handbrake, the d-pad the gear lever, the key and the lights, Y the manual box).
 * What ModCar's hands and its menus need besides, in the standard layout:
 *  - on foot: RT does what the left button does (take, fit, spray, scrub), LT or B what the right button does
 *    (take off, eat, pull back), X is E, Y puts down (G), A jumps, the left stick pressed in runs, LB / RB go
 *    through the hotbar, View opens the backpack or the vehicle's load (Tab), the right stick pressed in shows and
 *    hides the item cards (I), the d-pad's down lights up where the dirt still is (H);
 *  - in a list (the vehicle's load, the backpack): the d-pad's up and down choose, X takes out, B closes;
 *  - at the crafting bench: the d-pad chooses and turns the tabs, A makes it (and strikes the blows), B leaves;
 *  - in the seat: X gets out, LB the horn (held), RB the view, B the hazard lights, View sets it upright, the
 *    right stick pressed in works what one looks at in the cab (the left button's job: a lever, the radio);
 *  - Menu (start) shows and hides the key card, which has the pad's buttons on it too.
 */

/** what the pad does in the game */
export interface PadHost {
  seated(): boolean;
  /** a list open (the vehicle's load, the backpack) */
  listing(): boolean;
  /** the crafting bench open: its keys (KeyboardEvent.code) */
  bench(code: string): boolean;
  benchOpen(): boolean;
  primary(down: boolean): void;
  use(down: boolean): void;
  pack(): void;
  hotbar(step: number): void;
  listMove(step: number): void;
  listClose(): void;
  cards(): void;
  help(): void;
  highlight(): void;
  camera(): void;
  horn(down: boolean): void;
  hazard(): void;
  upright(): void;
  /** a pad came or went (its name; '' gone) */
  connected(name: string): void;
}

/** the standard layout's buttons */
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, View: 8, Menu: 9, LS: 10, RS: 11, Up: 12, Down: 13, Left: 14, Right: 15 } as const;

/** a trigger counts as pressed past this */
const TRIGGER = 0.55;

export class ModPad {
  /** held this frame (on foot): take off (LT, B), put down (Y), jump (A), run (the left stick in) */
  take = false;
  drop = false;
  jump = false;
  run = false;
  /** the right stick (−1 … 1; down +): what moves a scrubbing tool */
  rx = 0;
  ry = 0;
  /** the pad in use ('' none) */
  name = '';
  private prev: boolean[] = [];

  /** read the pad (once a frame, after the shared input's update) */
  update(host: PadHost, pads: readonly (Gamepad | null)[] = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []): void {
    const pad = pads.find((p) => !!p && p.connected) ?? null;
    const name = pad?.id ?? '';
    if (name !== this.name) {
      this.name = name;
      this.prev = [];
      host.connected(name);
    }
    if (!pad) {
      this.take = this.drop = this.jump = this.run = false;
      this.rx = this.ry = 0;
      return;
    }
    const dz = (v: number, z = 0.12): number => (Math.abs(v) < z ? 0 : (v - Math.sign(v) * z) / (1 - z));
    this.rx = dz(pad.axes[2] ?? 0);
    this.ry = dz(pad.axes[3] ?? 0);
    const now: boolean[] = [];
    for (let i = 0; i < 16; i++) {
      const b = pad.buttons[i];
      now[i] = !!b && (i === B.LT || i === B.RT ? b.value > TRIGGER : b.pressed);
    }
    const prev = this.prev;
    const went = (i: number): boolean => now[i] && !prev[i];
    const left = (i: number): boolean => !now[i] && !!prev[i];
    const seated = host.seated();
    this.take = this.drop = this.jump = this.run = false;
    if (went(B.Menu)) host.help();
    if (host.benchOpen()) {
      // (the bench's list: its keys)
      if (went(B.Up)) host.bench('ArrowUp');
      if (went(B.Down)) host.bench('ArrowDown');
      if (went(B.Left)) host.bench('ArrowLeft');
      if (went(B.Right)) host.bench('ArrowRight');
      if (went(B.A) || went(B.RT)) host.bench('Space');
      if (went(B.B)) host.bench('Escape');
      if (went(B.X)) host.bench('KeyE');
    } else if (seated) {
      if (went(B.X)) host.use(true);
      if (left(B.X)) host.use(false);
      if (went(B.LB)) host.horn(true);
      if (left(B.LB)) host.horn(false);
      if (went(B.RB)) host.camera();
      if (went(B.B)) host.hazard();
      if (went(B.View)) host.upright();
      if (went(B.RS)) host.primary(true);
      if (left(B.RS)) host.primary(false);
    } else if (host.listing()) {
      if (went(B.Up)) host.listMove(-1);
      if (went(B.Down)) host.listMove(1);
      if (went(B.X) || went(B.RT)) host.use(true);
      if (left(B.X)) host.use(false);
      if (went(B.B) || went(B.View)) host.listClose();
    } else {
      if (went(B.RT)) host.primary(true);
      if (left(B.RT)) host.primary(false);
      if (went(B.X)) host.use(true);
      if (left(B.X)) host.use(false);
      if (went(B.LB)) host.hotbar(-1);
      if (went(B.RB)) host.hotbar(1);
      if (went(B.View)) host.pack();
      if (went(B.RS)) host.cards();
      if (went(B.Down)) host.highlight();
      this.take = now[B.LT] || now[B.B];
      this.drop = now[B.Y];
      this.jump = now[B.A];
      this.run = now[B.LS];
    }
    this.prev = now;
  }
}
