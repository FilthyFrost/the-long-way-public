/**
 * The waters one fishes in the game's world (docs/V3/plan/fishing.md): the ten of core/v3/fishing/lite/spots.ts, each
 * the jetty the world built at a real lake (or the pier under a lighthouse), found in the world the game is playing
 * when it is the world they are in (their seed). A water's stand is the end of its jetty over the deeper water,
 * facing out; its pond is the water in reach of it, read from the world's land in the stand's own axes (z out over
 * the water, x to the right). One may fish from the end of the jetty, along it or from the shore near it: the
 * session (session.ts) is told where one stands in those axes.
 */
import { PondShape } from '../../../../core/v3/fishing/lite/pond';
import { SPOTS } from '../../../../core/v3/fishing/lite/spots';
import { TerrainPoint, type World } from '../../../../core/world/terrain';

export interface Stand {
  /** which water (index into SPOTS) */
  spot: number;
  /** the end of the jetty (world m): where the pond's axes begin, the deck's height */
  x: number;
  y: number;
  z: number;
  /** out over the water (unit, world x z) and its right */
  fx: number;
  fz: number;
  rx: number;
  rz: number;
  /** the water's surface height there */
  level: number;
  shape: PondShape;
}

const tp = new TerrainPoint();

/** metres of water at a world point (0 or less: land) */
export function waterDepth(world: World, x: number, z: number): number {
  world.shape(x, z, tp);
  if (!(tp.wkind > 0) || !Number.isFinite(tp.wl)) return -1;
  return tp.wl - tp.bed;
}

/** the water's surface height at a world point (NaN: no water there) */
export function waterLevel(world: World, x: number, z: number): number {
  world.shape(x, z, tp);
  return tp.wkind > 0 && Number.isFinite(tp.wl) ? tp.wl : NaN;
}

/** the jetty of a water in this world (its middle, its length and its heading), or null when the world has none there */
export function jettyOf(world: World, spot: number): { x: number; y: number; z: number; w: number; yaw: number } | null {
  const sp = SPOTS[spot];
  for (let k = sp.slot - 2; k <= sp.slot + 2; k++) {
    if (k < 0) continue;
    world.sites.ensure(k);
    const site = world.sites.sitesOf(k).find((s) => s.id === sp.site);
    const j = site?.objects.find((o) => o.kind === 'jetty');
    if (j) return { x: j.x, y: j.y, z: j.z, w: j.w, yaw: j.yaw };
  }
  return null;
}

/** where one fishes a water from in this world; null: the world has no such jetty (another world, another seed) */
export function standOf(world: World, spot: number): Stand | null {
  const jetty = jettyOf(world, spot);
  if (!jetty) return null;
  // the jetty's two ends along its length: the one over deeper water is the end one fishes from
  const ux = Math.cos(jetty.yaw);
  const uz = Math.sin(jetty.yaw);
  const half = jetty.w / 2 - 0.7;
  const a = { x: jetty.x + ux * half, z: jetty.z + uz * half };
  const b = { x: jetty.x - ux * half, z: jetty.z - uz * half };
  const da = waterDepth(world, a.x + ux * 3, a.z + uz * 3);
  const db = waterDepth(world, b.x - ux * 3, b.z - uz * 3);
  const end = da >= db ? a : b;
  const fx = da >= db ? ux : -ux;
  const fz = da >= db ? uz : -uz;
  const rx = -fz;
  const rz = fx;
  const lv = waterLevel(world, end.x + fx * 2, end.z + fz * 2);
  const level = Number.isFinite(lv) ? lv : jetty.y - 0.5;
  const shape = new PondShape((x, z) => waterDepth(world, end.x + fx * z + rx * x, end.z + fz * z + rz * x));
  return { spot, x: end.x, y: jetty.y, z: end.z, fx, fz, rx, rz, level, shape };
}

/** a point of the stand's axes (x right, z out) in the world, into `out` */
export function toWorld(st: Stand, x: number, z: number, out: { x: number; z: number }): { x: number; z: number } {
  out.x = st.x + st.fx * z + st.rx * x;
  out.z = st.z + st.fz * z + st.rz * x;
  return out;
}

/** a world point in the stand's axes, into `out` */
export function toLocal(st: Stand, wx: number, wz: number, out: { x: number; z: number }): { x: number; z: number } {
  const dx = wx - st.x;
  const dz = wz - st.z;
  out.x = dx * st.rx + dz * st.rz;
  out.z = dx * st.fx + dz * st.fz;
  return out;
}

/** a heading in the world (the walker's: forward (cos h, sin h)) as an aim in the stand's axes (0 out, + to the right) */
export function aimOf(st: Stand, heading: number): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return Math.atan2(c * st.rx + s * st.rz, c * st.fx + s * st.fz);
}

/** a heading in the stand's axes (as fish keep them: forward (sin h, cos h)) as a heading in the world (forward (cos, sin)) */
export function worldHeading(st: Stand, h: number): number {
  const wx = st.rx * Math.sin(h) + st.fx * Math.cos(h);
  const wz = st.rz * Math.sin(h) + st.fz * Math.cos(h);
  return Math.atan2(wz, wx);
}
