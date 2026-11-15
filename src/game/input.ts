/**
 * Player input: keyboard, mouse look (pointer lock) and gamepad, merged into one driver intent.
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
  | 'pack'; // player

const KEY_ACTIONS: Record<string, Action> = {
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
  KeyG: 'drop', // player: G put down
  Tab: 'pack', // player: Tab backpack
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

export class InputManager {
  readonly drive: VehicleInput = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
  /** free-look in radians: yaw + = right, pitch + = up */
  lookYaw = 0;
  lookPitch = 0;
  /** walking about: the mouse turns all the way round and the view does not ease back */
  freeLook = false;
  /** walking stick: forward and right, −1 … 1 */
  readonly walk = { forward: 0, right: 0 };
  locked = false;
  private readonly keys = new Set<string>();
  private readonly listeners: ((a: Action) => void)[] = [];
  private readonly releaseListeners: ((a: Action) => void)[] = [];
  /** gamepad buttons held last frame (for edges) */
  private readonly padPrev: boolean[] = [];
  private lastLook = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const a = KEY_ACTIONS[e.code];
      if (a) {
        e.preventDefault();
        for (const fn of this.listeners) fn(a);
      }
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const a = KEY_ACTIONS[e.code];
      if (a) for (const fn of this.releaseListeners) fn(a);
    });
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => {
      if (!this.locked) canvas.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lookYaw = this.freeLook ? this.lookYaw + e.movementX * 0.0022 : Math.max(-2.4, Math.min(2.4, this.lookYaw + e.movementX * 0.0022));
      this.lookPitch = Math.max(-1.0, Math.min(1.0, this.lookPitch - e.movementY * 0.0022));
      this.lastLook = performance.now();
    });
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
      if (lx !== 0 || ly !== 0) {
        this.lookYaw = this.freeLook ? this.lookYaw + lx * dt * 2.2 : Math.max(-2.4, Math.min(2.4, this.lookYaw + lx * dt * 2.2));
        this.lookPitch = Math.max(-1.0, Math.min(1.0, this.lookPitch - ly * dt * 1.6));
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
