import { localMonth } from './sceneSeason';
import { rand2 } from '../math/rng';
import { fbm2 } from '../math/noise';
import { BIOMES } from './biomes';
import { Ecotope, ECO_SITE, ECO_PLOT, ECO_TILE } from './ecotope';
import { Cover, onBench } from './flora';
import { blossoms, elevationBand, groundProfile, pigments, plants, siteElevation, siteFit, type Growth } from './groundTables';
import { sampleRock } from './rockTables';
import { accentColour, autumnColour, barkColour, grassColour, groundColour, leafColour, stoneColour, type PlacePalette } from './earth/palette';
import { Solid, solidWithin, type SolidSource } from './solids';
import { Clump, clumpAt, driftFactor } from './layout';
import { TerrainPoint, type World } from './terrain';
import { SpineSample } from './spine';
import { inVentClearing, ventsNear, type Vent } from './earth/geothermal';

export interface GroundClump {
  x:number; y:number; z:number; yaw:number; radius:number; height:number;
  form:string; name:string; paint:number; accent:number; seed:number; solid?:Solid;
}
const CELL = 8;
const EDGE = ECO_TILE/CELL;
const stores = new WeakMap<World, GroundField>();
export function groundField(world: World) {
  let field = stores.get(world);
  if (!field) {field = new GroundField(world); stores.set(world,field);}
  return field;
}


/** the forms that are blades (their key the meadow's), and the low mats of the ground (drawn to its soil) */
const BLADES = new Set(['grass','tussock','sedge','rice','spinifex','tall']);
const MATS = new Set(['crust','moss','lichen','needles','litter','clover','knees']);

/** a clump of a place of the emergent Earth in its place's palette: its leaf, its blades, its flowers, its stone */
function earthClump(c: GroundClump, pal: PlacePalette, rocks: boolean, flower: boolean, dry: boolean, autumn: boolean, winter: boolean): void {
  if (rocks) {
    c.paint = stoneColour(pal, c.paint);
    c.accent = groundColour(pal, c.accent);
    return;
  }
  const f = c.form;
  c.paint = winter ? barkColour(pal, c.paint) : autumn ? autumnColour(pal, c.paint) : BLADES.has(f) ? grassColour(pal, c.paint, dry) : MATS.has(f) ? groundColour(pal, c.paint) : leafColour(pal, c.paint);
  c.accent = flower ? accentColour(pal, c.accent) : grassColour(pal, c.accent, true);
}

export class GroundField implements SolidSource {
  private readonly tiles = new Map<string,GroundClump[]>();
  private readonly mineral = new Map<string,GroundClump[]>();
  private readonly e = new Ecotope();
  private readonly cover = new Cover();
  private readonly tp = new TerrainPoint();
  private readonly ss = new SpineSample();
  private vents: readonly Vent[] = [];
  private readonly clump = new Clump();
  constructor(private readonly world: World) {}


  tile(tx: number, tz: number, rocks: boolean): GroundClump[] {
    const cache = rocks ? this.mineral : this.tiles;
    const key = tx+','+tz;
    const prev = cache.get(key);
    if (prev) return prev;
    const list: GroundClump[] = [];
    // (V5: nothing grows or lies on a geothermal field's springs and vents)
    this.world.shape((tx + 0.5) * ECO_TILE, (tz + 0.5) * ECO_TILE, this.tp);
    this.vents = ventsNear(this.world, this.tp.s, (tx + 0.5) * ECO_TILE, (tz + 0.5) * ECO_TILE, ECO_TILE * 0.75, this.tp, this.ss);
    if (this.world.eco) for (let j=0;j<EDGE;j++) for (let i=0;i<EDGE;i++) {
      const cell = this.cell(tx*EDGE+i,tz*EDGE+j,rocks);
      if (cell) list.push(cell);
    }
    if (cache.size >= 192) cache.delete(cache.keys().next().value!);
    cache.set(key,list);
    return list;
  }

  private cell(i:number,j:number,rocks:boolean): GroundClump | undefined {
    const seed = this.world.seed + (rocks ? 92231 : 96793);
    const x = (i+rand2(i,j,seed))*CELL, z = (j+rand2(i,j,seed+1))*CELL;
    if (this.vents.length && inVentClearing(this.vents, x, z)) return;
    const die = rand2(i,j,seed+2);
    if (rocks && die > 0.83) return;
    const e = this.world.eco!.at(x,z,this.e);
    if (e.ad < (rocks ? 12 : 7.6) || e.flags & (ECO_SITE|ECO_PLOT)) return;
    const month = localMonth(BIOMES[e.ra].id, BIOMES[e.rb].id, e.rt);
    const biome = BIOMES[e.rt >= 0.5 ? e.rb : e.ra];
    const profile = groundProfile(biome.id);
    if (!profile) return;
    const tp = this.tp;
    let g:Growth|undefined, name:string, accent = 0, dry = false, autumn = false, winter = false;
    let pick = rand2(i,j,seed+3);
    const C = this.clump;
    /** (G3) how deep in its outcrop a stone lies (0: a stone of a slope's scree or of a bank) */
    let core = 0;
    // (G3 composes the places of the emergent Earth; a region written by hand keeps its ground as it was, to the stone)
    const composed = !!biome.earth;
    if (rocks && !composed) {
      // (V3: stones lie in patches some tens of metres across)
      const patch = Math.min(1, Math.max(0, 0.5 + 0.9 * fbm2(x / 70, z / 70, this.world.seed + 0x5ad, 2)));
      const r = sampleRock(profile,e,pick,die,patch);
      if (!r) return;
      g = r; name = r.name;
      accent = e.moisture > 0.56 && e.slope < 0.9 && g.form !== 'cobbles' ? 0x858856 : g.paint;
    } else if (!rocks && !composed) {
      const altitude = siteElevation(biome.id,e);
      const band = elevationBand(profile,altitude);
      if (!band) return;
      const flower = die < 0.19;
      const names = flower ? band.flowers : die < 0.42 ? band.shrubs : band.ground;
      if (!names.length) return;
      const choice = names[Math.floor(pick*names.length)];
      if (typeof choice === 'string') {
        name = choice; g = plants.get(name);
      } else {
        if (!choice.bloomMonths.includes(month)) return;
        if (biome.id === 'flower_fields' && !this.world.flora!.cover(x,z,this.cover,e.h).flowers) return;
        name = choice.name; g = blossoms.get(name);
        accent = pigments[choice.colors[Math.floor(rand2(i,j,seed+8)*choice.colors.length)]];
      }
      if (!g) return;
      const snow = profile.snowlineM[Math.floor(month%12/3)];
      if (snow !== null && altitude > snow && g.height < 0.3) return;
      const bench = e.terrace >= 0.5;
      if (rand2(i,j,seed+4) > siteFit(g,e,bench)) return;
      const localMonth = (month - 1 + (profile.climate.latitude < 0 ? 6 : 0)) % 12 + 1;
      const deciduous = /矮柳|矮桦|越橘/.test(name);
      autumn = deciduous && localMonth >= 9 && localMonth <= 11;
      winter = deciduous && profile.climate.lowC[month-1] < -2 && (localMonth >= 11 || localMonth <= 3);
      dry = /grass|tussock|sedge|rice/.test(g.form) && (profile.climate.precipMm[month-1]<30 || profile.climate.lowC[month-1]<4);
    } else if (rocks) {
      // (G3, layout.ts) Its stones lie where its rock comes through, not anywhere: in outcrops — one to so many squares
      // of the country, the more and the bigger the stonier the place — the rock in the middle and its fallen blocks
      // round it; the likelier on a slope, a knoll, a landform's flank; and as scree under what is steep, as cobbles on a
      // bank. Between them the ground is clear.
      const rk = profile.rockiness ?? 0;
      core = clumpAt(x, z, 92 - 40 * rk, Math.min(0.92, 0.07 + 1.05 * rk), 4 + 6 * rk, 9 + 15 * rk, this.world.seed + 0x5ae, C);
      const bank = (e.waterKind === 1 || e.waterKind === 2) && e.waterDist < 9 && e.slope < 0.48;
      const site = Math.min(1, 0.22 + 1.5 * e.slope + 0.5 * Math.max(0, -e.hollow) + (e.landform > 1 ? 0.4 : 0) + 1.2 * rk);
      // (an outcrop on ground that does not suit is no outcrop at all: by its own number, the whole of it)
      const stands = C.id < site;
      const steep = Math.min(1, Math.max(0, (e.slope - 0.5) / 0.4));
      const chance = bank ? 0.8 : Math.max(core > 0 && stands ? 0.34 + 0.6 * Math.min(1, core * 2.2) : 0, 0.5 * steep * steep * (3 - 2 * steep));
      if (die >= 0.83 * chance) return;
      if (!(core > 0 && stands)) core = 0;
      const r = sampleRock(profile,e,pick,die,0.5,core);
      if (!r) return;
      g = r; name = r.name;
      accent = e.moisture > 0.56 && e.slope < 0.9 && g.form !== 'cobbles' ? 0x858856 : g.paint;
    } else {
      const altitude = siteElevation(biome.id,e);
      const band = elevationBand(profile,altitude);
      if (!band) return;
      // (G3, layout.ts) What stands here: a flower of the drift the spot lies in — a drift is of one kind and one colour
      // —, a low shrub of its thicket, else the ground's own rough grass, sedge, fern or moss, in patches with clear
      // ground between; a stray flower now and then. It was a flower, a shrub or a tuft to every eight metres, anywhere.
      let names: typeof band.ground | typeof band.flowers;
      let colour = rand2(i,j,seed+8);
      const drift = band.flowers.length && driftFactor(x, z, this.world.seed, C) > 1 ? C.k : 0;
      if (drift > 0 && die < 0.66 * Math.min(1, drift * 3)) {
        names = band.flowers;
        pick = C.id;
        colour = (C.id * 7.31) % 1;
      } else {
        const thicket = band.shrubs.length ? clumpAt(x, z, 38, 0.36, 4, 9, this.world.seed + 0x5b2, C) : 0;
        if (thicket > 0 && die < 0.25 + 0.6 * Math.min(1, thicket * 3)) {
          names = band.shrubs;
          pick = C.id;
        } else if (die > 0.42 && fbm2(x / 44, z / 44, this.world.seed + 0x5b3, 2) > -0.04) names = band.ground;
        else if (die < 0.015) names = band.flowers;
        else return;
      }
      if (!names.length) return;
      const choice = names[Math.min(names.length - 1, Math.floor(pick*names.length))];
      if (typeof choice === 'string') {
        name = choice; g = plants.get(name);
      } else {
        if (!choice.bloomMonths.includes(month)) return;
        if (biome.id === 'flower_fields' && !this.world.flora!.cover(x,z,this.cover,e.h).flowers) return;
        name = choice.name; g = blossoms.get(name);
        accent = pigments[choice.colors[Math.min(choice.colors.length - 1, Math.floor(colour*choice.colors.length))]];
      }
      if (!g) return;
      const snow = profile.snowlineM[Math.floor(month%12/3)];
      if (snow !== null && altitude > snow && g.height < 0.3) return;
      const bench = e.terrace >= 0.5;
      if (rand2(i,j,seed+4) > siteFit(g,e,bench)) return;
      const localMonth = (month - 1 + (profile.climate.latitude < 0 ? 6 : 0)) % 12 + 1;
      const deciduous = /矮柳|矮桦|越橘/.test(name);
      autumn = deciduous && localMonth >= 9 && localMonth <= 11;
      winter = deciduous && profile.climate.lowC[month-1] < -2 && (localMonth >= 11 || localMonth <= 3);
      dry = /grass|tussock|sedge|rice/.test(g.form) && (profile.climate.precipMm[month-1]<30 || profile.climate.lowC[month-1]<4);
    }
    this.world.shape(x,z,tp);
    if (tp.zone || tp.site>0.1 || tp.plot>0.1 || tp.wl>tp.bed || Math.abs(tp.d)<(rocks ? 12 : 7.6)) return;
    if (g.habitat === 'bench' && !onBench(tp.bed,e.step)) return;
    const vary = rand2(i,j,seed+5);
    // (V3: one stone in eight of a stony place a big one, twice to three times the size)
    // (G3: an outcrop's stones biggest in its middle — the rock itself — and smaller out to its rim; a scree's all small)
    const big = !composed
      ? (rocks && (profile.rockiness ?? 0) > 0.2 && rand2(i,j,seed+9) < 0.12 ? 2 + rand2(i,j,seed+10) : rocks && (g as { outcrop?: boolean }).outcrop ? 1.5 + 0.8 * rand2(i,j,seed+10) : 1)
      : rocks ? (core > 0 ? 0.62 + 2.1 * core * core * (0.75 + 0.5 * rand2(i,j,seed+10)) : 0.7 + 0.4 * rand2(i,j,seed+10)) : 1;
    const scale=(0.62+0.66*vary)*big;
    const h = g.height*scale*(winter ? 0.73 : 1), r = g.radius*scale*(g.form==='fern' ? 1.43 : 1);
    const yaw = g.form==='rice' ? 0 : rand2(i,j,seed+6)*2*Math.PI;
    const out:GroundClump = {x,y:tp.bed,z,yaw,radius:r,height:h,form:g.form,name,paint:winter ? 0x8a806c : autumn ? 0xb98552 : dry ? 0xb9a16b : g.paint,accent:accent || (rocks ? g.paint : 0xb19a6c),seed:vary};
    // (a place of the emergent Earth: every clump in its palette, docs/V3/nodes/R1-palettes.md)
    const pal = biome.earth?.palette;
    if (pal) earthClump(out, pal, rocks, accent !== 0 && !rocks, dry, autumn, winter);
    if (rocks && h>0.68) {
      const fin = g.form==='fin' || g.form==='strata';
      out.solid = new Solid().set(x,z,r*0.8,fin ? r*0.35 : 0,-yaw,tp.bed-0.5,tp.bed+h*0.9,false,'geology:'+g.form);
    }
    return out;
  }

  solidsNear(x:number,z:number,r:number,out:Solid[]) {
    const reach = r+4;
    for (let tz=Math.floor((z-reach)/ECO_TILE);tz<=Math.floor((z+reach)/ECO_TILE);tz++)
      for (let tx=Math.floor((x-reach)/ECO_TILE);tx<=Math.floor((x+reach)/ECO_TILE);tx++)
        for (const rock of this.tile(tx,tz,true)) if (rock.solid && solidWithin(rock.solid,x,z,r)) out.push(rock.solid);
  }
}
