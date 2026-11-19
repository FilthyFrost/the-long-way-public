/** An engineering treatment belongs to a length of road, shared by the strip,
 * tyres and roadside fixtures. Boundaries are construction joints on 64 m stations. */
import { hash2 } from '../math/rng';
import { BIOMES } from './biomes';
import { Surface } from './ground';
import { SITE_SLOT } from './sites';
import type { World } from './terrain';

export const Pavement = { renewed: 0, patched: 1, chip: 2, slab: 3, gravel: 4, earth: 5, cobble: 6 } as const;
export const Verge = { shoulder: 0, grass: 1, ditch: 2, kerb: 3, bank: 4, sand: 5 } as const;
export interface RoadStyle {
  pavement: number;
  lines: number;
  verge: number;
  half: number;
  rail: 'steel' | 'wood' | 'stone' | 'fence';
}
const road = (p: keyof typeof Pavement, lines: number, v: keyof typeof Verge, half: number, rail: RoadStyle['rail']): RoadStyle =>
  ({ pavement: Pavement[p], lines, verge: Verge[v], half, rail });
const highway = road('renewed',1,'shoulder',3.25,'steel');
const pasture = road('chip',0,'grass',2.92,'fence');
const north = road('patched',0.47,'ditch',3.10,'wood');
const track = road('gravel',0,'grass',2.78,'wood');
const pass = road('renewed',1,'bank',3.25,'steel');
const desert = road('patched',0.48,'sand',3.25,'steel');
const earth = road('earth',0,'sand',2.86,'wood');
const slabs = road('slab',0.22,'ditch',3.10,'stone');
const upland = road('chip',0.36,'grass',2.95,'stone');
const village = road('cobble',0,'kerb',2.96,'stone');
const orchard = road('patched',0,'grass',2.88,'stone');
export const ROAD_STYLES: Readonly<Record<string, readonly [RoadStyle,RoadStyle]>> = {
  plains:[pasture,highway], forest:[north,track], maple:[north,pasture], lakes:[track,north],
  alpine:[pass,upland], desert:[desert,earth], red_canyon:[earth,desert], karst_peaks:[slabs,upland],
  terraces:[slabs,orchard], bamboo_sea:[slabs,track], flower_fields:[pasture,orchard],
  wetland:[track,slabs], mediterranean:[orchard,upland],
};

const caches = new WeakMap<World,Map<number,RoadStyle>>();
export function roadStyleAt(world: World, s: number): RoadStyle {
  const cell = Math.floor(s/64);
  let cache = caches.get(world);
  if (!cache) caches.set(world, cache = new Map());
  const known = cache.get(cell);
  if (known) return known;
  const mid = cell*64 + 32;
  const bl = {a:0,b:0,t:0,ia:0,ib:0};
  world.spine.biomeAt(mid,bl);
  const region = BIOMES[bl.t >= 0.5 ? bl.b : bl.a];
  const pair = ROAD_STYLES[region.id] ?? ROAD_STYLES[region.kin] ?? ROAD_STYLES.plains;
  const sector = Math.floor(mid/768);
  let style = pair[(hash2(sector, 731, world.seed) & 255) < 72 ? 1 : 0];
  const place = world.sites.placeOf(Math.floor(mid/SITE_SLOT));
  if (place && (place.kind === 'shop' || place.kind === 'house') && Math.abs(mid-place.s) < place.halfL+32) style = village;
  if (cache.size >= 8192) cache.clear();
  cache.set(cell,style);
  return style;
}

export function roadSurface(style: RoadStyle, distance: number): number {
  if (distance > style.half) return style.verge === Verge.sand ? Surface.Sand : style.verge === Verge.grass ? Surface.Grass : Surface.Gravel;
  return style.pavement === Pavement.gravel ? Surface.Gravel : style.pavement === Pavement.earth ? Surface.Dirt : Surface.Asphalt;
}
