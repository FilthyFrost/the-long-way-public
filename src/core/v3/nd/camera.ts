/**
 * The instant camera's rules (docs/ND/PLAN.md, Nomad Drive's polaroid camera as the research measured it): a camera
 * comes with ten prints in it and a box of film puts ten more in (held 0.5 s); raised to the eye in 0.3 s, it takes
 * a picture no sooner than 2 s after the last; the print slides out of its slot over 2 s, 14 cm, and hangs there
 * developing for 12 s from a grey blue to the picture; the next picture, or the camera put away, pushes it out and it
 * falls. Its zoom goes up to four times, exponentially with the wheel. What a camera has and what a print is ride on
 * the things themselves (ItemState.camera, ItemState.photo), so they are saved with them. Pure: no three, no DOM.
 */
import type { ItemInstance } from '../../modcar/items';

export const CAMERA = {
  /** prints in a camera when it is found, and in a box of film */
  films: 10,
  pack: 10,
  /** a box of film put in: held this long (s) */
  loadS: 0.5,
  /** up to the eye (s); between two pictures at least (s) */
  raiseS: 0.3,
  coolS: 2,
  /** the print out of its slot: over this long (s), this far (m); then developing (s) */
  ejectS: 2,
  ejectM: 0.14,
  developS: 12,
  /** how far it zooms in at most (times) */
  maxZoom: 4,
  /** a print's picture (px): 512 high, 1.068 times as wide */
  px: [547, 512] as const,
  /** a print's size (m): the card, and the picture on it (a wider margin below) */
  card: [0.11, 0.13] as const,
  picture: [0.094, 0.088] as const,
} as const;

export interface CameraState {
  /** prints left in it */
  film: number;
}

export interface PhotoState {
  /** its picture's key in the photo store (game/modcar/v3/nd-camera/store.ts) */
  key: string;
  /** when it was taken (world seconds) and how far along the road (m), where */
  at: number;
  s?: number;
  /** stuck somewhere: on what (a vehicle's uid, a place's id, 'world'), its position and turn there (that one's frame) */
  stuck?: { on: string; x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number };
}

declare module '../../modcar/items' {
  interface ItemState {
    /** an instant camera's (docs/ND/PLAN.md) */
    camera?: CameraState;
    /** a print's */
    photo?: PhotoState;
  }
}

/** how many prints are left in a camera */
export function filmOf(cam: ItemInstance): number {
  return cam.state?.camera?.film ?? CAMERA.films;
}

/** one print used (false: there was none left) */
export function useFilm(cam: ItemInstance): boolean {
  const n = filmOf(cam);
  if (n <= 0) return false;
  cam.state ??= {};
  cam.state.camera = { film: n - 1 };
  return true;
}

/** a box of film put into the camera: ten more */
export function loadFilm(cam: ItemInstance): number {
  cam.state ??= {};
  cam.state.camera = { film: filmOf(cam) + CAMERA.pack };
  return cam.state.camera.film;
}

/** the zoom at a setting 0 … 1 (exponential: the wheel's steps feel even) */
export function zoomAt(z: number): number {
  return Math.pow(CAMERA.maxZoom, Math.max(0, Math.min(1, z)));
}

/** how far out of its slot a print is (0 … 1) this long after the shutter */
export function ejected(t: number): number {
  const k = Math.max(0, Math.min(1, t / CAMERA.ejectS));
  // (a motor's pull: quick at first, easing out)
  return 1 - (1 - k) * (1 - k);
}

/** how far developed a print is (0 … 1) this long after the shutter (it starts as it begins to come out) */
export function developed(t: number): number {
  return Math.max(0, Math.min(1, t / CAMERA.developS));
}

/** a print's state, made for a picture just taken */
export function newPhoto(key: string, at: number, s?: number): PhotoState {
  return s === undefined ? { key, at } : { key, at, s };
}

/** the print's picture key, '' when it has none */
export function photoKey(p: ItemInstance): string {
  return p.state?.photo?.key ?? '';
}
