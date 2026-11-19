import { expect, it } from 'vitest';
import { ECO_PROFILES } from '../../src/core/world/data/ecoProfiles';
import { BIOMES } from '../../src/core/world/biomes';
import { Ecotope } from '../../src/core/world/ecotope';
import { groundField, groundMonth } from '../../src/core/world/groundField';
import { blossoms, crownFlowers, elevationBand, groundProfile, pigments, plants, siteElevation, siteFit } from '../../src/core/world/groundTables';
import { sampleRock } from '../../src/core/world/rockTables';
import { Solid } from '../../src/core/world/solids';
import { World, TerrainPoint } from '../../src/core/world/terrain';
import { SpineSample } from '../../src/core/world/spine';

it('has a model and paint for every surveyed band, including the last metres before its upper limit',()=>{
  for(const profile of ECO_PROFILES){
    expect(groundProfile(profile.id)).toBe(profile);
    for(const band of profile.bands){
      expect(elevationBand(profile,band.toM-0.01)).toBe(band);
      for(const name of [...band.ground,...band.shrubs]) expect(plants.has(name),name).toBe(true);
      for(const flower of band.flowers){
        expect(blossoms.has(flower.name)||crownFlowers.has(flower.name),flower.name).toBe(true);
        for(const color of flower.colors) expect(pigments[color],color).toBeTypeOf('number');
      }
    }
    for(const rock of profile.rocks) expect(pigments[rock.color],rock.color).toBeTypeOf('number');
  }
});

it('keeps forest-floor plants out of the open, wet sedges out of dry scrub, and rice on benches',()=>{
  const e=new Ecotope();
  const fern=plants.get('剑蕨')!,sedge=plants.get('莎草')!,rice=plants.get('水稻')!;
  expect(siteFit(fern,e,false)).toBe(0);
  expect(siteFit(sedge,e,false)).toBe(0);
  expect(siteFit(rice,e,false)).toBe(0);
  e.canopy=0.96;e.moisture=0.91;
  expect(siteFit(fern,e,false)).toBeGreaterThan(0.8);
  expect(siteFit(sedge,e,false)).toBeGreaterThan(0.75);
  expect(siteFit(rice,e,true)).toBe(1);
});

it('draws and collides with the same seeded rocks and admits only the local species in flower that month',()=>{
  expect(groundMonth(0)).toBe(6);expect(groundMonth(30)).toBe(7);expect(groundMonth(214)).toBe(1);
  const opts={worldVersion:2 as const,startBiome:'plains'};
  const w=new World(7,opts), other=new World(7,opts);
  const field=groundField(w), site=new SpineSample(), e=new Ecotope(), tp=new TerrainPoint();
  let rocks=0, flowering=0, plantsSeen=0;
  for (let s=1000;s<9500;s+=410){
    w.spine.at(s,site);
    const tx=Math.floor(site.x/128),tz=Math.floor((site.z+80)/128);
    const mineral=field.tile(tx,tz,true);
    expect(mineral).toEqual(groundField(other).tile(tx,tz,true));
    for(const r of mineral){
      const nearby:Solid[]=[];
      field.solidsNear(r.x,r.z,0.2,nearby);
      if (r.solid){expect(nearby).toContain(r.solid);rocks++;}
      else expect(nearby.every(s=>s.x!==r.x || s.z!==r.z)).toBe(true);
    }
    for(const m of [1,6,10]){
      field.setMonth(m);
      for(const c of field.tile(tx,tz,false)){
        w.eco!.at(c.x,c.z,e);w.shape(c.x,c.z,tp);
        const id=BIOMES[e.rt>=0.5?e.rb:e.ra].id,p=groundProfile(id)!;
        const band=elevationBand(p,siteElevation(id,e))!;
        expect(tp.zone).toBe(0);expect(tp.bed).toBeGreaterThanOrEqual(tp.wl);
        const f=band.flowers.find(f=>f.name===c.name && blossoms.get(f.name)?.form===c.form);
        if(f){expect(f.bloomMonths).toContain(m);flowering++;}
        else expect([...band.ground,...band.shrubs]).toContain(c.name);
        plantsSeen++;
      }
      expect(field.tile(tx,tz,true)).toBe(mineral);
    }
  }
  expect(rocks).toBeGreaterThan(2);expect(flowering).toBeGreaterThan(10);expect(plantsSeen).toBeGreaterThan(150);
});

it('sorts bank cobbles and cliff debris, and preserves the local lithology',()=>{
  const e=new Ecotope(), p=groundProfile('redrock')!;
  e.waterKind=2;e.waterDist=2;
  expect(sampleRock(p,e,0,0)?.form).toBe('cobbles');
  e.waterDist=35;e.slope=0.94;
  expect(sampleRock(p,e,0,0.2)?.form).toBe('scree');
  expect(sampleRock(p,e,0,0)?.form).toBe('fin');
  expect(sampleRock(p,e,0,0)?.paint).toBe(pigments[p.rocks[0].color]);
});
