import { describe, expect, it } from 'vitest';
import { forageKind } from '../../src/core/v3/forage/kinds';
import { ECO_PROFILES } from '../../src/core/world/data/ecoProfiles';
import { FORAGE_NEEDS_MODEL, ROAD_FOODS, ROAD_LIFE, type RoadLife } from '../../src/core/world/data/ecoFauna';
import { FLORA, floraTableOf } from '../../src/core/world/floraTables';
import { ForageField } from '../../src/core/v3/forage/field';
import { LAYER_GROUND, LAYER_TREE, type FloraField } from '../../src/core/world/flora';
import { plantDef, plantIndex } from '../../src/core/world/plants';

function rules(region: string, kin = 'plains') {
  const table = floraTableOf(region, kin);
  return [...table.trees, ...table.shrubs, ...table.ground];
}

function foods(region: string, kin = 'plains') {
  return new Set(rules(region, kin).map(rule => plantDef(rule.plant).bears?.forage));
}

describe('forage geography and item identity', () => {
  it('resolves each recorded food against its profile, and keeps the model gaps explicit', () => {
    const needs = Object.entries(ROAD_FOODS).filter(([, food]) => food.forageId === null).map(([id]) => id);
    expect(needs.sort()).toEqual([...FORAGE_NEEDS_MODEL].sort());
    for (const profile of ECO_PROFILES) {
      const recorded: RoadLife = ROAD_LIFE[profile.id as keyof typeof ROAD_LIFE];
      const expected = recorded.foods.map(food => ROAD_FOODS[food].forageId).filter(id => id !== null);
      const present = foods(profile.id, profile.kin);
      for (const id of expected) expect(present.has(id), profile.id + '/' + id).toBe(true);
      for (const id of ['snow_lotus', 'cordyceps', 'sage', 'fiddlehead']) expect(present.has(id), profile.id).toBe(false);
      for (const id of ['saguaro_fruit', 'cactus_fruit', 'pine_nut', 'cloudberry', 'bilberry', 'calafate', 'evergreen_huckleberry', 'wild_garlic', 'native_raspberry', 'serviceberry', 'lingonberry', 'hazelnut']) {
        expect(present.has(id), profile.id + '/' + id).toBe(expected.some(food => food === id));
      }
    }
  });

  it('ties rice to recorded paddy crops and keeps marine finds away from fresh water', () => {
    for (const profile of ECO_PROFILES) {
      const crops: RoadLife['crops'] = ROAD_LIFE[profile.id as keyof typeof ROAD_LIFE].crops;
      const rice = rules(profile.id, profile.kin).filter(rule => rule.plant === 'rice_stand');
      expect(rice.length > 0, profile.id).toBe(crops.some(c => ['riceG', 'riceI', 'riceH'].includes(c)));
      for (const rule of rice) {
        expect(rule).toMatchObject({ waterKinds: 3, water: [0, 2] });
        expect(rule.road).toBeDefined();
        expect(rule.slope).toBeDefined();
      }
    }
    for (const id of ['kelp', 'clam', 'mussel', 'crab']) {
      const row = rules('lakes').find(rule => plantDef(rule.plant).bears?.forage === id);
      expect(row?.waterKinds, id).toBe(4);
    }
    for (const [region, wrong] of Object.entries({
      wetland: ['wild_rice', 'lotus_root', 'cranberry', 'water_chestnut'],
      red_canyon: ['sea_buckthorn', 'saguaro_fruit', 'saltpetre', 'thyme'],
      alpine: ['snow_lotus', 'cordyceps', 'cloudberry', 'pine_nut'],
      bamboo_sea: ['tea_leaf', 'wild_garlic'], lakes: ['wild_rice', 'lotus_root', 'salt'],
    })) for (const id of wrong) expect(foods(region).has(id), region + '/' + id).toBe(false);
  });

  it('keeps catalogue and host names unambiguous, including items already in a save', () => {
    expect(forageKind('wild_rice').name).toEqual({ zh: '稻谷', en: 'Cultivated rice' });
    expect(forageKind('watercress').name.zh).toBe('豆瓣菜');
    expect(plantDef('watercress_plant').name.zh).toBe('豆瓣菜');
    expect(forageKind('water_chestnut').name.en).toBe('Water caltrop');
    expect(plantDef('prickly_pear').bears?.forage).toBe('cactus_fruit');
    expect(plantDef('saguaro').bears?.forage).toBe('saguaro_fruit');
    expect(plantDef('pinyon').bears?.forage).toBe('pine_nut');
    for (const host of ['fern', 'sage_bush', 'pine']) expect(plantDef(host).bears).toBeUndefined();
    expect(forageKind('fly_agaric').twin).toBeUndefined();
    expect(forageKind('death_cap').twin).toBeUndefined();
    expect(forageKind('glow_mushroom').twin).toBe('chanterelle');
  });

  it('only offers pine litter beside a pine, including trees across a tile boundary', () => {
    const tree = { n: 1, x: [129], z: [4], vary: [0.9], plant: [plantIndex('pine')] };
    const patch = { n: 1, x: [127], y: [2], z: [4], size: [1], vary: [0.1], yaw: [0], plant: [plantIndex('pine_needle_plant')] };
    const flora = { tile: (layer: number, tx: number, tz: number) => {
      if (tz === 0 && layer === LAYER_GROUND && tx === 0) return patch;
      if (tz === 0 && layer === LAYER_TREE && tx === 1) return tree;
      return { n: 0 };
    } };
    const field = new ForageField(flora as unknown as FloraField);
    expect(field.near(127, 4, 8, [])).toBe(1);
    tree.plant[0] = plantIndex('spruce');
    expect(field.near(127, 4, 8, [])).toBe(0);
    tree.plant[0] = plantIndex('pine');
    tree.x[0] = 151;
    expect(field.near(127, 4, 8, [])).toBe(0);
  });

  it('keeps unknown geography free of inherited forage even when callers supply different terrain', () => {
    const unknown = 'unrecorded-region';
    expect(floraTableOf(unknown, 'plains').eco).toBe(FLORA.plains.eco);
    expect(floraTableOf(unknown, 'desert').eco).toBe(FLORA.desert.eco);
    expect([...foods(unknown, 'desert')].filter(Boolean)).toEqual([]);
    expect(foods('desert', 'desert').has('saguaro_fruit')).toBe(true);
  });
});
