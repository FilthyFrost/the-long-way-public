import { localMonth } from './sceneSeason';
import { rand2 } from '../math/rng';
import { BIOMES } from './biomes';
import { Ecotope, ECO_SITE, ECO_PLOT, ECO_TILE } from './ecotope';
import { Cover, onBench } from './flora';
import { blossoms, elevationBand, groundProfile, pigments, plants, siteElevation, siteFit, type Growth } from './groundTables';
import { sampleRock } from './rockTables';
import { accentColour, autumnColour, barkColour, grassColour, groundColour, leafColour, stoneColour, type PlacePalette } from './earth/palette';
import { Solid, solidWithin, type SolidSource } from './solids';
import { TerrainPoint, type World } from './terrain';

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
const BLADES = new Set(['grass','tussock','sedge','rice']);
const MATS = new Set(['crust','moss','lichen','needles','litter','clover','cushion','knees']);

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
  constructor(private readonly world: World) {}


  tile(tx: number, tz: number, rocks: boolean): GroundClump[] {
    const cache = rocks ? this.mineral : this.tiles;
    const key = tx+','+tz;
    const prev = cache.get(key);
    if (prev) return prev;
    const list: GroundClump[] = [];
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
    const pick = rand2(i,j,seed+3);
    if (rocks) {
      const r = sampleRock(profile,e,pick,die);
      if (!r) return;
      g = r; name = r.name;
      accent = e.moisture > 0.56 && e.slope < 0.9 && g.form !== 'cobbles' ? 0x858856 : g.paint;
    } else {
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
    }
    this.world.shape(x,z,tp);
    if (tp.zone || tp.site>0.1 || tp.plot>0.1 || tp.wl>tp.bed || Math.abs(tp.d)<(rocks ? 12 : 7.6)) return;
    if (g.habitat === 'bench' && !onBench(tp.bed,e.step)) return;
    const vary = rand2(i,j,seed+5), scale=0.62+0.66*vary;
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
