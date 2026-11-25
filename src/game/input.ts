/**
 * Player input: keyboard, mouse look (pointer lock) and gamepad, merged into one driver intent.
 *
 * One set of keys (docs/V3/plan/growth.md, J1: the user's "就用鼠标左键…先做一套键位"): the left button is the
 * hand's work on what one looks at, the right button the use of what one holds, the wheel adjusts, Q puts down
 * (held in a seat: stands up). E, F, G and the cab's own letters (K, Q/Z, M, B, R) are gone: the cab's controls are
 * clicked, the gear lever too (and the wheel in a manual box), a car on its side rights itself.
 */
import type { VehicleInput } from '../core/vehicle/sim';

export type Action =
  | 'reset'
  | 'camera'
  | 'lights'
  | 'hud'
  | 'wipers'
  | 'horn'
  | 'robot'
  | 'use'
  | 'camp'
  | 'key'
  | 'leverUp'
  | 'leverDown'
  | 'manual'
  | 'hazard'
  | `seat${number}`
  | 'drop' // player
  | 'crouch' // player, on foot: crouch and stand again
  | 'pack' // player
  | 'place' // player: placing in and out (docs/V3/plan/hands.md §四)
  | 'turnRight'; // player, placing: a quarter round onto the grid (Q the other way)

const SEAT_KEYS: Record<string, Action> = {
  Digit1: 'seat1',
  Digit2: 'seat2',
  Digit3: 'seat3',
  Digit4: 'seat4',
  Digit5: 'seat5',
  Digit6: 'seat6',
  Digit7: 'seat7',
  Digit8: 'seat8',
  Digit9: 'seat9',
};

/** the game before ModCar (classic.html): its own letters, as they were */
export const CLASSIC_KEYS: Record<string, Action> = {
  KeyR: 'reset',
  KeyC: 'camera',
  KeyL: 'lights',
  F3: 'hud',
  KeyV: 'wipers',
  KeyH: 'horn',
  KeyP: 'robot',
  KeyE: 'use',
  KeyO: 'camp',
  KeyK: 'key',
  KeyQ: 'leverUp',
  KeyZ: 'leverDown',
  KeyM: 'manual',
  KeyB: 'hazard',
  KeyG: 'drop',
  Tab: 'pack',
  ...SEAT_KEYS,
};

/**
 * ModCar's one set of keys (docs/V3/plan/growth.md, J1; docs/V3/plan/finish.md §十三: a key means one thing): beside
 * the mouse only these letters — V the view (in a seat the cab or behind the car, on foot her eyes or behind her), C
 * crouch (on foot), L the lights, H the horn, Q put down (in a seat, held: stand up), Tab the lists; F3 the debug HUD.
 */
export const MODCAR_KEYS: Record<string, Action> = {
  KeyV: 'camera',
  KeyC: 'crouch',
  KeyL: 'lights',
  F3: 'hud',
  KeyH: 'horn',
  KeyQ: 'drop',
  Tab: 'pack',
  // (placing as Nomad Drive does: R in and out; Q and E a quarter round onto the grid — only while placing, docs/V3/plan/prompts.md §四)
  KeyR: 'place',
  KeyE: 'turnRight',
  ...SEAT_KEYS,
};

export class InputManager {
  readonly drive: VehicleInput = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
  /** free-look in radians: yaw + = right, pitch + = up */
  lookYaw = 0;
  lookPitch = 0;
  /** the view does not turn (liquid flowing from a can held to a filler) */
  lookHold = false;
  /** the mouse's turn times this (the settings' 鼠标灵敏度) */
  lookScale = 1;
  /** walking about: the mouse turns all the way round and the view does not ease back */
  freeLook = false;
  /** walking stick: forward and right, −1 … 1 */
  readonly walk = { forward: 0, right: 0 };
  locked = false;
  /** false: a click on the canvas does not take the mouse (the developer's parts bin is open) */
  lockable = true;
  private readonly keys = new Set<string>();
  private readonly listeners: ((a: Action) => void)[] = [];
  private readonly releaseListeners: ((a: Action) => void)[] = [];
  /** gamepad buttons held last frame (for edges) */
  private readonly padPrev: boolean[] = [];
  private lastLook = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly keyActions: Record<string, Action> = MODCAR_KEYS,
  ) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const a = this.keyActions[e.code];
      if (a) {
        e.preventDefault();
        for (const fn of this.listeners) fn(a);
      }
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const a = this.keyActions[e.code];
      if (a) for (const fn of this.releaseListeners) fn(a);
    });
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => {
      if (!this.locked && this.lockable) canvas.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) this.turn(e.movementX, e.movementY);
    });
  }

  /** turn the view by a movement of the mouse (px), as the captured mouse does (also: dragged with the right button) */
  turn(dx: number, dy: number, k0 = 0.0022): void {
    if (this.lookHold) return;
    const k = k0 * this.lookScale;
    this.lookYaw = this.freeLook ? this.lookYaw + dx * k : Math.max(-2.4, Math.min(2.4, this.lookYaw + dx * k));
    // (in a seat one may look further down: to the handbrake and the gear lever on the tunnel between the seats)
    this.lookPitch = Math.max(this.freeLook ? -1.0 : -1.3, Math.min(1.0, this.lookPitch - dy * k));
    this.lastLook = performance.now();
  }

  /** player: is a key held right now (KeyboardEvent.code) */
  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  onAction(fn: (a: Action) => void): void {
    this.listeners.push(fn);
  }

  /** a held action key (K, H) let go */
  onRelease(fn: (a: Action) => void): void {
    this.releaseListeners.push(fn);
  }

  private emit(a: Action, down: boolean): void {
    for (const fn of down ? this.listeners : this.releaseListeners) fn(a);
  }

  private down(...codes: string[]): boolean {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  update(dt: number): void {
    const d = this.drive;
    let steer = (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0);
    let throttle = this.down('KeyW', 'ArrowUp') ? 1 : 0;
    let brake = this.down('KeyS', 'ArrowDown') ? 1 : 0;
    let handbrake = this.down('Space') ? 1 : 0;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const dz = (v: number, z = 0.12): number => (Math.abs(v) < z ? 0 : (v - Math.sign(v) * z) / (1 - z));
      const sx = dz(pad.axes[0] ?? 0);
      // gentle curve: fine control around the centre
      if (Math.abs(sx) > Math.abs(steer)) steer = Math.sign(sx) * Math.pow(Math.abs(sx), 1.6);
      throttle = Math.max(throttle, pad.buttons[7]?.value ?? 0);
      brake = Math.max(brake, pad.buttons[6]?.value ?? 0);
      if (pad.buttons[0]?.pressed) handbrake = 1;
      // d-pad up / down = the lever, left = key (hold), right = lights; Y = manual mode
      const map: [number, Action][] = [
        [12, 'leverUp'],
        [13, 'leverDown'],
        [14, 'key'],
        [15, 'lights'],
        [3, 'manual'],
      ];
      for (const [b, a] of map) {
        const now = !!pad.buttons[b]?.pressed;
        if (now !== !!this.padPrev[b]) this.emit(a, now);
        this.padPrev[b] = now;
      }
      const lx = dz(pad.axes[2] ?? 0);
      const ly = dz(pad.axes[3] ?? 0);
      this.walk.forward = -dz(pad.axes[1] ?? 0);
      this.walk.right = dz(pad.axes[0] ?? 0);
      if ((lx !== 0 || ly !== 0) && !this.lookHold) {
        this.lookYaw = this.freeLook ? this.lookYaw + lx * dt * 2.2 : Math.max(-2.4, Math.min(2.4, this.lookYaw + lx * dt * 2.2));
        this.lookPitch = Math.max(this.freeLook ? -1.0 : -1.3, Math.min(1.0, this.lookPitch - ly * dt * 1.6));
        this.lastLook = performance.now();
      }
      break;
    }
    d.steer = steer;
    d.throttle = throttle;
    d.brake = brake;
    d.handbrake = handbrake;
    // the same keys walk when one is up and about (the stick was read above)
    const kf = (this.down('KeyW', 'ArrowUp') ? 1 : 0) - (this.down('KeyS', 'ArrowDown') ? 1 : 0);
    const kr = (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0);
    if (kf !== 0 || kr !== 0 || !pads.some((p) => p && p.connected)) {
      this.walk.forward = kf;
      this.walk.right = kr;
    }

    // without pointer lock (or after a while) the view eases back to straight ahead
    if (!this.freeLook && !this.locked && performance.now() - this.lastLook > 1500) {
      const k = Math.min(1, dt * 2.5);
      this.lookYaw -= this.lookYaw * k;
      this.lookPitch -= this.lookPitch * k;
    }
  }
}
