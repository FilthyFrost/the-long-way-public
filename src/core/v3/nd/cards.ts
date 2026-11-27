/**
 * The ND prefab buildings' cards (docs/ND/PLAN.md): each building's geometry as its Blender script wrote it
 * (tools/blender/nd/<id>.py → cards/<id>.json: what cannot be walked through, its doors, lamps and switches, the
 * spots its furniture and its things stand on), with what the world needs to lay it by the road (core/world/
 * prefabs.ts: its footprint, how far it stands back, the level ground round it, its floor's height) and what it is
 * furnished with — and, as the places' dice lay it (world version 6, docs/V3/plan/growth.md §三), the boxes the plan's
 * finds go in and a big place's yard. Registered as this file is loaded. Pure: no three, no DOM.
 */
import type { ContainerKind } from '../../items/loot';
import { Rng, hash2 } from '../../math/rng';
import { hasItem } from '../../modcar/items';
import { registerPrefab, type PrefabBox, type PrefabCard, type PrefabSolid, type PrefabThing, type PrefabWreck } from '../../world/prefabs';
import type { PlaceSort, SiteKind } from '../../world/sites';
import cabinJson from './cards/cabin.json';
import pumpJson from './cards/pump.json';
import campJson from './cards/camp.json';
import stationJson from './cards/station.json';
import motelJson from './cards/motel.json';
import communeJson from './cards/commune.json';
import starterJson from './cards/starter.json';
import watertowerJson from './cards/watertower.json';
import watchtowerJson from './cards/watchtower.json';
import graveyardJson from './cards/graveyard.json';
import containeryardJson from './cards/containeryard.json';
import radiostationJson from './cards/radiostation.json';
import factory1Json from './cards/factory1.json';
import windfarmJson from './cards/windfarm.json';
import busstopJson from './cards/busstop.json';
import toiletsJson from './cards/toilets.json';
import mailboxesJson from './cards/mailboxes.json';
import windmillJson from './cards/windmill.json';
import haysJson from './cards/hays.json';
import crossesJson from './cards/crosses.json';
import wreck1Json from './cards/wreck1.json';
import wreck2Json from './cards/wreck2.json';
import wreck3Json from './cards/wreck3.json';
import factory2Json from './cards/factory2.json';
import factory3Json from './cards/factory3.json';
import { registerNdItems } from './items';

/** a door of a card (its frame: u along the road, v away from it, heights from the floor) */
export interface CardDoor {
  name: string;
  /** the hinge line, and the leaf's direction from it when shut (unit) */
  u: number;
  v: number;
  su: number;
  sv: number;
  width: number;
  thick: number;
  /** how far it opens (degrees), and which way: +1 turning from (su, sv) towards v's side of u (counter-clockwise seen from above in Blender's frame), −1 the other */
  open: number;
  turn: 1 | -1;
  /** the leaf's top over the floor, and its bottom (absent: the floor — a locker's upper door is higher) */
  y1: number;
  y0?: number;
  /** the compartment behind it (a locker's, an electric box's, a container's; the card's frame, turned about its middle
   * by `turn` as a solid is): what is in it is out of reach while it is shut */
  box?: { u0: number; u1: number; v0: number; v1: number; y0: number; y1: number; turn?: number };
  /** how long it takes to open, and to shut (s; absent: the game's own): Nomad Drive's metal door 0.4, a wooden one 1.0 */
  secs?: number;
  shutSecs?: number;
  /** found as another door of the place is (a container's right door as its left: locked, stuck, open or shut) */
  same?: string;
  /** a lid that slides (a tomb's): along (su, sv) by `open` metres, not swung round its hinge */
  slide?: boolean;
  /** a door that tilts about a level line (a mailbox's door hinged at its foot, a lid at its back, a trapdoor): the
   * line through its hinge (u, v at y0) along (su, sv), `tilt` its leaf's middle from the hinge when shut (the
   * card's frame); turned by `turn` × `open` the way the model's frame turns about (su, 0, sv) */
  tilt?: { u: number; v: number; y: number };
  /** what it is made of, as it sounds: wood (absent), metal, stone */
  mat?: 'wood' | 'metal' | 'stone';
  /** what kind of door it is, as to being found locked or stuck (core/v3/nd/pry.ts PRY_KINDS; absent: a house's) */
  pry?: 'house' | 'locker' | 'stuck' | 'none';
}

export interface CardLamp {
  name: string;
  u: number;
  v: number;
  y: number;
  /** how far its light reaches (m) */
  reach: number;
  warm: boolean;
  /** lit by the clock, not a switch (a filling station's sign: Nomad Drive's 18:00 to 06:00), and a neon's strike as it comes on */
  hours?: [number, number];
  neon?: boolean;
  /** a lamp out of doors: the height of the ground it lights under it (absent: the place's levelled ground) */
  pool?: number;
  /** a lamp lit by the clock that lights the rooms it hangs in (Nomad Drive's: every lamp of the ND6 places) */
  inside?: boolean;
  /** a fluorescent tube's strike as it comes on (1.4 s, after 0–4 s), a beacon's red halo seen from far; its light's colour (sRGB) */
  tube?: boolean;
  beacon?: boolean;
  color?: number;
  /** a floodlight's: where on the ground its beam falls (the card's frame), its pool of light there and not under it */
  aim?: { u: number; v: number };
}

export interface CardSwitch {
  name: string;
  u: number;
  v: number;
  y: number;
  /** the lamps it works */
  lamps: string[];
}

/** a ladder of a card (ND6: a water tower's; Nomad Drive's vehicle ladder: where the feet are at its foot and at its
 * head, where one is let go at the top; its frame as a door's) */
export interface CardLadder {
  name: string;
  /** the feet's line: at its foot and at its head (u, v on the plan, y over the floor); a leaning ladder's lean */
  foot: { u: number; v: number; y: number };
  head: { u: number; v: number; y: number };
  /** where one is drawn to at its head, and let go */
  exit: { u: number; v: number; y: number };
  /** the way one faces it while climbing (as a spot's yaw: turned from u towards v) */
  yaw: number;
  /** its width between the rails; iron or wood (its rungs' sound) */
  w: number;
  wood?: boolean;
}

export interface CardSpot {
  name: string;
  u: number;
  v: number;
  y: number;
  /** turned from the building's heading (rad) */
  yaw: number;
}

/** a building's geometry as its Blender script wrote it */
export interface CardGeo {
  id: string;
  w: number;
  d: number;
  h: number;
  plinth: number;
  solids: PrefabSolid[];
  doors: CardDoor[];
  lamps: CardLamp[];
  switches: CardSwitch[];
  spots: CardSpot[];
  /** what can be climbed (absent: nothing) */
  ladders?: CardLadder[];
  /** what turns (absent: nothing): a roof fan always, a wind turbine's rotor with the wind */
  spins?: CardSpin[];
  /** the road's own wrecks laid with it (a wreck place's) */
  wrecks?: PrefabWreck[];
}

/** a part of a card's model that turns (its node N_spin_<name>), about its own axis (the model's frame) */
export interface CardSpin {
  name: string;
  axis: 'x' | 'y' | 'z';
  /** always, this fast (°/s: Nomad Drive's roof fan 20), or with the wind, this fast at its strongest (rpm: its rotors 16) */
  degS?: number;
  rpm?: number;
  /** with the wind: its gusts (± share of its pace, absent: a rotor's 5 % on a ten-second swell; a windmill's 12 % at
   * 0.25 Hz), how quickly it speeds up and slows (s: a rotor's 2 and 4, a windmill's 1.5 and 3), which way (−1: the
   * other way round its axis) */
  gust?: number;
  gustHz?: number;
  upS?: number;
  downS?: number;
  sign?: 1 | -1;
}

/** what goes on a spot: one of these items (the first one the catalogue has, by the seed's pick), or nothing (chance) */
export interface Furnish {
  spot: string;
  items: readonly string[];
  /** how likely the spot is to have anything (absent: 1) */
  chance?: number;
  /** any one of the items the catalogue knows, by the seed (absent: the first it knows) */
  any?: boolean;
  n?: number;
}

/** an ND building: its geometry, its place's kind, how it stands at the road, what is in it */
export interface NdBuilding {
  geo: CardGeo;
  siteKind: SiteKind;
  /** (world version 7) the sort of place it is to what is found there, where that is not its kind (core/world/prefabs.ts PrefabCard.sort) */
  sort?: PlaceSort;
  setback: number;
  margin: number;
  ground: number;
  furnish: readonly Furnish[];
  /** Nomad Drive's own (for the record: which of its places this one stands for) */
  nd: string;
  /** its own colours (sRGB) where they are not a house's walls and trims: a well's stones and their mortar; how rusty its iron */
  paints?: { walls: readonly number[]; trims: readonly number[]; rust?: number };
  /** how many of its switches are on when it is first come to (Nomad Drive's motel: two or three, by the seed) */
  startLit?: [number, number];
}

/**
 * The wooden cabin (Nomad Drive's WoodenCabin01, a major place: some 39 things in it). Until the ND furniture is
 * modelled (ND4), what stands in it is the game's own furniture and junk; each line takes the first id the
 * catalogue knows, so the ND pieces take their spots as they are registered.
 */
const CABIN_FURNISH: readonly Furnish[] = [
  { spot: 'table', items: ['nd_table'] },
  { spot: 'chair_a', items: ['nd_chair', 'junk_chair_wood'] },
  { spot: 'chair_b', items: ['nd_chair', 'junk_chair_wood'], chance: 0.8 },
  { spot: 'sofa', items: ['nd_sofa', 'junk_chair_soft'] },
  { spot: 'bookshelf', items: ['nd_bookshelf'] },
  { spot: 'fridge', items: ['nd_fridge'] },
  { spot: 'kitchen', items: ['nd_kitchen_stand'] },
  { spot: 'wallcab', items: ['nd_top_cabinet'] },
  { spot: 'worktop_a', items: ['nd_coffee_machine'] },
  { spot: 'worktop_b', items: ['nd_mug', 'junk_mug'] },
  { spot: 'table_a', items: ['nd_camera', 'junk_lamp'] },
  { spot: 'table_b', items: ['nd_film_pack', 'drink_water'] },
  { spot: 'table_c', items: ['ing_milk', 'ing_orange', 'ing_banana'], any: true },
  { spot: 'worktop_c', items: ['nd_coffee_pack', 'coffee_pot'] },
  { spot: 'worktop_d', items: ['kit_stove'] },
  { spot: 'worktop_e', items: ['ing_beef'] },
  { spot: 'floor_b', items: ['kit_pan'] },
  { spot: 'shelf_a', items: ['nd_baked_beans', 'nd_tomato_soup', 'nd_tuna'], any: true },
  { spot: 'top_a', items: ['nd_cereal'], chance: 0.7 },
  { spot: 'top_b', items: ['nd_peanut_butter', 'nd_chocolate_1'], any: true },
  { spot: 'fridge_top', items: ['nd_pills', 'nd_first_aid'], any: true },
  { spot: 'nook_seat', items: ['nd_flashlight', 'nd_compass', 'junk_pillow'], any: true },
  // (a tape: the one the world deals next, whichever is named here: core/v3/nd/tapes.ts; a frame with its painting)
  { spot: 'nook_b', items: ['nd_tape_01'], chance: 0.7 },
  { spot: 'nook_c', items: ['nd_frame'], chance: 0.8 },
  { spot: 'sill_front', items: ['nd_plant_pot', 'junk_candle'] },
  { spot: 'floor_a', items: ['crate_junk'], chance: 0.5 },
  { spot: 'floor_c', items: ['junk_box_food'], chance: 0.6 },
  { spot: 'floor_d', items: ['nd_crowbar', 'nd_metal_detector', 'junk_record'], any: true, chance: 0.8 },
  { spot: 'porch_a', items: ['nd_bucket', 'junk_bucket'] },
  { spot: 'porch_b', items: ['junk_chair_fold'], chance: 0.7 },
  { spot: 'porch_c', items: ['nd_seeds_apple', 'nd_seeds_potato', 'nd_seeds_tomato', 'nd_seeds_watermelon'], any: true },
  { spot: 'ground_a', items: ['nd_battery'] },
  { spot: 'ground_b', items: ['nd_water_can'], chance: 0.6 },
  { spot: 'ground_c', items: ['junk_crate_plastic'], chance: 0.5 },
  { spot: 'shed', items: ['nd_grinder', 'nd_shovel', 'nd_polisher'], any: true },
];

/**
 * The water pump (Nomad Drive's Waterpump, a minor place: its pump alone by the road, the ground round it levelled
 * for a metre and a half): the pump on its well head, a bucket left by it now and then, a water can more rarely.
 */
const PUMP_FURNISH: readonly Furnish[] = [
  { spot: 'pump', items: ['nd_hand_pump'] },
  { spot: 'side', items: ['nd_bucket'], chance: 0.35 },
  { spot: 'back', items: ['nd_water_can'], chance: 0.2 },
  // (Nomad Drive's plates are found by the road: one left by the well now and then)
  { spot: 'lean', items: ['nd_plate'], chance: 0.3 },
];

/**
 * The camp site (Nomad Drive's CampSite, a major place of its Camp theme: 65 tries at a slot — its four tents' floors 8
 * and 16 more for trifles, its eight patches of ground 11 and 27, its fire 3 for meat): what campers leave in their
 * tents (a backpack, a torch, tins, a mug, a beer), their camp's gear on the ground about it (folding chairs, a table,
 * a camp stove and a pan, a bucket, a shovel), a steak or a drumstick on the grill (one on the whole, as in its seeds).
 */
const TENT = ['pack_old', 'pack_hike', 'nd_flashlight', 'nd_first_aid', 'nd_mug', 'nd_baked_beans', 'nd_tuna', 'nd_tomato_soup', 'drink_beer', 'nd_compass', 'junk_pillow', 'nd_chocolate_1', 'drink_water'];
const CAMP_FURNISH: readonly Furnish[] = [
  ...[0, 1, 2, 3].flatMap((i) => [
    { spot: `t${i}_a`, items: TENT, any: true, chance: 0.55 },
    { spot: `t${i}_b`, items: TENT, any: true, chance: 0.35 },
  ]),
  { spot: 'fire_a', items: ['ing_beef', 'ing_chicken'], any: true, chance: 0.6 },
  { spot: 'fire_b', items: ['ing_chicken', 'ing_beef'], any: true, chance: 0.3 },
  { spot: 'fire_c', items: ['ing_beef', 'ing_chicken'], any: true, chance: 0.1 },
  { spot: 'ground_a', items: ['nd_chair_fold'], chance: 0.8 },
  { spot: 'ground_a2', items: ['nd_chair_fold'], chance: 0.5 },
  { spot: 'ground_b', items: ['nd_dinner_table', 'nd_table'], chance: 0.45 },
  { spot: 'ground_c', items: ['kit_stove'], chance: 0.45 },
  { spot: 'ground_c2', items: ['kit_pan', 'kit_pot'], any: true, chance: 0.5 },
  { spot: 'ground_d', items: ['nd_bucket', 'junk_bucket'], chance: 0.5 },
  { spot: 'ground_e', items: ['nd_chair_fold'], chance: 0.6 },
  { spot: 'ground_e2', items: ['nd_shovel', 'nd_water_can'], any: true, chance: 0.4 },
  { spot: 'ground_f', items: ['drink_beer', 'ing_milk', 'ing_orange', 'ing_banana'], any: true, chance: 0.45 },
  { spot: 'ground_g', items: ['junk_crate_plastic', 'junk_box_food'], any: true, chance: 0.4 },
  { spot: 'ground_h', items: ['nd_coffee_pack', 'nd_mug', 'coffee_pot'], any: true, chance: 0.35 },
];

/**
 * The filling station (Nomad Drive's GasStation01, a major place of its Market and Garage themes: its shelves' ten
 * faces 10 tries and 30 more, the counter 2 and 2, under it 1, behind it 1 and 3, the garage's floor 4 and 4, the
 * store room 4 of its valuables, the roofs 3 hard to come by, about the pump 4 and 15): a shop's goods on its five
 * shelves, each to its own sort (drinks, snacks, tins and dry goods, the household's and the traveller's, the
 * road's), sweets and a souvenir on the counter, the garage's kits and cans, the store room's better things.
 * (A kind with a dot is the old game's, as the places lay it: a jerrycan, an oil can, a tyre, a battery: core/modcar/loot.ts looseFound.)
 */
const SHELF: Record<string, readonly string[]> = {
  sh0: ['drink_water', 'drink_soda', 'drink_cola', 'drink_energy', 'drink_beer', 'ing_milk'],
  sh1: ['food_chips', 'food_chips_ginger', 'food_licorice', 'food_nuts_old', 'nd_chocolate_1', 'nd_chocolate_1', 'nd_chocolate_1', 'nd_peanut_butter'],
  sh2: ['nd_baked_beans', 'nd_tomato_soup', 'nd_tuna', 'food_fish_can', 'nd_cereal', 'nd_coffee_pack', 'food_dumplings'],
  sh3: ['nd_first_aid', 'nd_pills', 'nd_flashlight', 'nd_battery', 'nd_film_pack', 'nd_compass', 'nd_mug', 'junk_candle', 'nd_seeds_apple', 'nd_seeds_potato', 'nd_seeds_tomato', 'nd_seeds_watermelon'],
  sh4: ['fuel.oil', 'nd_tire_kit', 'junk_lamp', 'nd_battery', 'drink_water', 'food_chips', 'nd_plant_pot'],
};
const STATION_FURNISH: readonly Furnish[] = [
  // (each shelf's first place at eye height a likely one, the rest less so: some twenty things in all)
  ...Object.entries(SHELF).flatMap(([sh, items]) =>
    ['e', 'w'].flatMap((f) =>
      ['m', 'h'].flatMap((lv) => [0, 1].map((k) => ({ spot: `${sh}${f}${lv}${k}`, items, any: true, chance: lv === 'm' && k === 0 ? 0.75 : 0.45 }))),
    ),
  ),
  // (the road's shelf: a tape the world deals next now and then)
  { spot: 'sh4wh1', items: ['nd_tape_01'], chance: 0.3 },
  { spot: 'counter_a', items: ['nd_tape_01'], chance: 0.35 },
  { spot: 'counter_b', items: ['nd_bobble_1'], chance: 0.3 },
  { spot: 'counter_c', items: ['food_licorice', 'nd_chocolate_1', 'nd_compass'], any: true, chance: 0.6 },
  { spot: 'under_counter', items: ['nd_first_aid', 'drink_spirit', 'nd_pills', 'nd_flashlight'], any: true, chance: 0.6 },
  { spot: 'behind_a', items: ['junk_box_food', 'crate_junk'], any: true, chance: 0.6 },
  { spot: 'behind_b', items: ['junk_mop', 'junk_sign_wet', 'junk_bucket'], any: true, chance: 0.4 },
  { spot: 'garage_a', items: ['nd_engine_kit', 'nd_tire_kit', 'fuel.oil'], any: true, chance: 0.8 },
  { spot: 'garage_b', items: ['nd_flashlight', 'nd_battery', 'nd_charger', 'fuel.oil'], any: true, chance: 0.6 },
  { spot: 'garage_c', items: ['fuel.jerrycan'], chance: 0.7 },
  { spot: 'garage_d', items: ['tyre.road'], chance: 0.6 },
  { spot: 'garage_e', items: ['part.battery.1', 'junk_jack', 'part.misc'], any: true, chance: 0.5 },
  { spot: 'garage_f', items: ['junk_cone', 'junk_bucket_old', 'junk_barrel', 'nd_crowbar'], any: true, chance: 0.5 },
  { spot: 'store_a', items: ['nd_metal_detector', 'nd_camera', 'nd_grinder', 'nd_polisher'], any: true, chance: 0.6 },
  { spot: 'store_b', items: ['nd_film_pack', 'nd_flashlight', 'nd_compass', 'nd_first_aid'], any: true, chance: 0.5 },
  { spot: 'store_c', items: ['crate_junk', 'junk_box_food', 'crate_parts'], any: true, chance: 0.7 },
  { spot: 'store_d', items: ['nd_shovel', 'fuel.jerrycan', 'junk_barrel'], any: true, chance: 0.5 },
  ...['roof_a', 'roof_b', 'roof_c', 'roof_d'].map((spot) => ({ spot, items: ['nd_plate', 'junk_ball', 'nd_bobble_2', 'junk_bag_s'], any: true, chance: 0.12 })),
  { spot: 'pump_a', items: ['fuel.jerrycan'], chance: 0.35 },
  { spot: 'pump_b', items: ['junk_cone', 'junk_sign_wet'], any: true, chance: 0.3 },
  { spot: 'pump_c', items: ['drink_soda', 'drink_cola', 'food_chips'], any: true, chance: 0.25 },
  { spot: 'pump_d', items: ['nd_plate'], chance: 0.15 },
  { spot: 'pump_e', items: ['junk_bin', 'junk_crate_plastic'], any: true, chance: 0.2 },
];

/**
 * The motel (Nomad Drive's Motel, a major place of its Lodging theme: its rooms' floors 16 tries and 32 more, the desk
 * 3 and 3, its eleven lockers one each, the eaves 4 hard to come by, the yard 3, behind it 4; lodging's furniture the
 * likelier — sofas, nightstands, a bookshelf, tables, the WC, a fridge): each room's nightstand and WC, a cabinet, a
 * bookshelf, a fridge or a table along its wall, a chair by its window, what a guest left on the bed and the sink and
 * the floor; the desk's key (a door or a locker of it may be locked), a souvenir and a tape, the lobby's sofa; the
 * lockers' better small things; the yard's and the back's leavings.
 */
const ROOM: readonly Furnish[] = [
  { spot: 'ns', items: ['nd_nightstand'], chance: 0.85 },
  { spot: 'cab', items: ['nd_cabinet', 'nd_bookshelf', 'nd_fridge', 'nd_table', 'nd_kitchen_stand'], any: true, chance: 0.75 },
  { spot: 'chair', items: ['nd_chair', 'nd_stool', 'nd_dinner_chair', 'nd_chair_fold', 'junk_chair_soft'], any: true, chance: 0.7 },
  { spot: 'wc', items: ['nd_wc'], chance: 0.9 },
  { spot: 'bed', items: ['junk_pillow', 'pack_old', 'pack_hike', 'nd_flashlight', 'nd_compass', 'nd_film_pack', 'drink_water', 'drink_beer'], any: true, chance: 0.45 },
  { spot: 'sink', items: ['nd_mug', 'junk_mug', 'nd_pills', 'drink_water'], any: true, chance: 0.35 },
  { spot: 'fa', items: ['junk_box_food', 'crate_junk', 'nd_bucket', 'pack_hike', 'junk_bag', 'junk_record'], any: true, chance: 0.35 },
  { spot: 'fb', items: ['junk_lamp', 'nd_plant_pot', 'junk_clockradio', 'junk_bucket', 'junk_trumpet'], any: true, chance: 0.3 },
];
const LOCKER = ['nd_battery', 'nd_film_pack', 'nd_flashlight', 'nd_first_aid', 'nd_pills', 'nd_chocolate_1', 'drink_spirit', 'nd_compass', 'food_licorice', 'junk_camera', 'nd_charger', 'drink_beer'];
const LOCKERS = ['lk0', 'lk1a', 'lk1b', 'lk2', 'lk3', 'lk4a', 'lk4b', 'lk5a', 'lk5b', 'lk6', 'lk7a', 'lk7b', 'lk8', 'lk9a', 'lk9b', 'lk10'];
const MOTEL_FURNISH: readonly Furnish[] = [
  ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((n) => ROOM.map((f) => ({ ...f, spot: `r${n}_${f.spot}` }))),
  { spot: 'desk_a', items: ['nd_key_1'], chance: 0.35 },
  { spot: 'desk_b', items: ['nd_bobble_3'], chance: 0.25 },
  { spot: 'desk_c', items: ['nd_tape_01'], chance: 0.3 },
  { spot: 'desk_d', items: ['crate_junk', 'junk_box_food'], any: true, chance: 0.6 },
  { spot: 'desk_e', items: ['nd_first_aid', 'junk_mop', 'junk_bucket'], any: true, chance: 0.45 },
  { spot: 'desk_f', items: ['junk_chair_office', 'nd_stool'], any: true, chance: 0.6 },
  { spot: 'lobby_a', items: ['nd_sofa_2', 'nd_sofa', 'nd_cot'], any: true, chance: 0.75 },
  { spot: 'lobby_b', items: ['nd_table', 'nd_dinner_table'], any: true, chance: 0.55 },
  { spot: 'lobby_c', items: ['nd_plant_pot'], chance: 0.7 },
  // (the lockers: one thing in most; a tape in one of them now and then, a bobblehead in another)
  ...LOCKERS.map((spot) => (spot === 'lk5a' ? { spot, items: ['nd_tape_01'], chance: 0.25 } : spot === 'lk9b' ? { spot, items: ['nd_bobble_1'], chance: 0.2 } : { spot, items: LOCKER, any: true, chance: 0.6 })),
  { spot: 'eb0', items: ['nd_battery', 'junk_transceiver'], any: true, chance: 0.3 },
  { spot: 'eb1', items: ['nd_battery', 'junk_transceiver'], any: true, chance: 0.3 },
  { spot: 'ut_a', items: ['junk_pillow', 'junk_bag_s', 'nd_first_aid'], any: true, chance: 0.5 },
  { spot: 'ut_b', items: ['nd_bucket', 'junk_mop', 'junk_bucket_paint', 'crate_junk', 'nd_crowbar'], any: true, chance: 0.5 },
  { spot: 'ut_c', items: ['nd_bucket', 'junk_mop', 'junk_bucket_paint', 'crate_junk', 'nd_crowbar'], any: true, chance: 0.5 },
  ...['yard_a', 'yard_b', 'yard_c'].map((spot) => ({ spot, items: ['junk_cone', 'junk_trolley', 'junk_sunchair', 'junk_bin', 'nd_plate', 'fuel.jerrycan'], any: true, chance: 0.45 })),
  ...['back_a', 'back_b', 'back_c', 'back_d'].map((spot) => ({ spot, items: ['junk_barrel', 'junk_crate_plastic', 'junk_bucket_old', 'nd_bucket', 'nd_water_can', 'junk_chair_fold', 'tyre.road'], any: true, chance: 0.45 })),
  ...['eave_a', 'eave_b', 'eave_c', 'eave_d'].map((spot) => ({ spot, items: ['nd_plate', 'junk_ball', 'nd_bobble_4', 'junk_bag_s'], any: true, chance: 0.12 })),
];

/**
 * The commune's houses (Nomad Drive's CommuneHouses-01, a major place of its Residential and Farm themes: its floors 17
 * tries and 44 more, its tables 3 and 5, its roof 1; the farm's things the likelier — a shovel, mushrooms, a pot, a
 * bucket, a water can, milk, bananas, oranges, seeds): each house's furniture and its leavings, the kitchen's stove and
 * fridge, the long table's food, the beds' seeds and pots and the tools by them, the shed's tools.
 */
const JUNK_IN = ['crate_junk', 'junk_box_food', 'pack_old', 'junk_record', 'junk_pillow', 'nd_bucket'];
const GARDEN = ['nd_seeds_apple', 'nd_seeds_potato', 'nd_seeds_tomato', 'nd_seeds_watermelon', 'nd_plant_pot', 'nd_mushroom'];
const COMMUNE_FURNISH: readonly Furnish[] = [
  { spot: 'h1_table', items: ['nd_table', 'nd_dinner_table'], any: true, chance: 0.8 },
  { spot: 'h1_chair_a', items: ['nd_dinner_chair', 'nd_chair', 'nd_stool'], any: true, chance: 0.7 },
  { spot: 'h1_chair_b', items: ['nd_dinner_chair', 'nd_chair', 'nd_stool'], any: true, chance: 0.5 },
  { spot: 'h1_sofa', items: ['nd_sofa', 'nd_sofa_2', 'nd_cot'], any: true, chance: 0.6 },
  { spot: 'h1_cab', items: ['nd_cabinet', 'nd_bookshelf'], any: true, chance: 0.6 },
  { spot: 'h1_fa', items: JUNK_IN, any: true, chance: 0.4 },
  { spot: 'h1_fb', items: ['junk_lamp', 'nd_plant_pot'], any: true, chance: 0.35 },
  { spot: 'h1_k_stand', items: ['nd_kitchen_stand'], chance: 0.8 },
  { spot: 'h1_k_fridge', items: ['nd_fridge'], chance: 0.6 },
  { spot: 'h1_k_fa', items: ['kit_pot', 'kit_pan', 'kit_stove'], any: true, chance: 0.5 },
  { spot: 'h1_porch_a', items: ['nd_chair_fold'], chance: 0.6 },
  { spot: 'h1_porch_b', items: ['nd_bucket', 'nd_water_can'], any: true, chance: 0.45 },
  { spot: 'h2_sofa', items: ['nd_sofa_2', 'nd_sofa', 'nd_cot'], any: true, chance: 0.6 },
  { spot: 'h2_table', items: ['nd_dinner_table', 'nd_table'], any: true, chance: 0.6 },
  { spot: 'h2_chair', items: ['nd_dinner_chair', 'nd_chair'], any: true, chance: 0.5 },
  { spot: 'h2_shelf', items: ['nd_bookshelf'], chance: 0.6 },
  { spot: 'h2_ns', items: ['nd_nightstand'], chance: 0.6 },
  { spot: 'h2_fa', items: JUNK_IN, any: true, chance: 0.35 },
  { spot: 'h2_fb', items: JUNK_IN, any: true, chance: 0.35 },
  { spot: 'h2_fc', items: JUNK_IN, any: true, chance: 0.35 },
  { spot: 'h2_v_a', items: ['nd_shovel', 'junk_bucket_old', 'nd_water_can'], any: true, chance: 0.4 },
  { spot: 'h2_v_b', items: ['nd_shovel', 'junk_bucket_old', 'nd_water_can'], any: true, chance: 0.4 },
  { spot: 'h3_stove', items: ['kit_stove'], any: true, chance: 0.6 },
  { spot: 'h3_table', items: ['nd_table'], chance: 0.5 },
  { spot: 'h3_chair', items: ['nd_stool'], chance: 0.5 },
  { spot: 'h3_fa', items: ['nd_mushroom', 'ing_potato', 'junk_box_food'], any: true, chance: 0.35 },
  { spot: 'h3_fb', items: ['nd_mushroom', 'ing_potato', 'junk_box_food'], any: true, chance: 0.35 },
  { spot: 'h3_s_a', items: ['nd_shovel', 'nd_grinder', 'nd_crowbar'], any: true, chance: 0.5 },
  { spot: 'h3_s_b', items: ['nd_flashlight', 'nd_battery'], any: true, chance: 0.3 },
  { spot: 'h4_g_a', items: ['crate_junk', 'junk_crate_plastic', 'junk_bucket_paint', ...GARDEN.slice(0, 4)], any: true, chance: 0.5 },
  { spot: 'h4_g_b', items: ['crate_junk', 'junk_crate_plastic', 'junk_bucket_paint', ...GARDEN.slice(0, 4)], any: true, chance: 0.5 },
  { spot: 'h4_g_c', items: ['crate_junk', 'junk_crate_plastic', 'junk_bucket_paint', ...GARDEN.slice(0, 4)], any: true, chance: 0.5 },
  { spot: 'h4_u_ns', items: ['nd_nightstand'], chance: 0.7 },
  { spot: 'h4_u_a', items: ['nd_cabinet', 'nd_bookshelf'], any: true, chance: 0.6 },
  { spot: 'h4_u_b', items: ['nd_chair'], chance: 0.5 },
  { spot: 'h4_u_c', items: ['pack_old', 'junk_pillow', 'nd_tape_01'], any: true, chance: 0.4 },
  { spot: 'h4_bal_a', items: ['nd_chair_fold'], chance: 0.6 },
  { spot: 'h4_bal_b', items: ['nd_plant_pot'], chance: 0.5 },
  ...['a', 'b', 'c', 'd', 'e'].map((k, i) => ({ spot: `tbl_${k}`, items: ['ing_milk', 'ing_banana', 'ing_orange', 'ing_apple', 'nd_mug', 'drink_water', 'ing_tomato', 'ing_potato'], any: true, chance: [0.7, 0.5, 0.5, 0.35, 0.35][i] })),
  ...[0, 1, 2, 3].flatMap((k) => [
    { spot: `bed${k}_a`, items: GARDEN, any: true, chance: 0.45 },
    { spot: `bed${k}_b`, items: ['nd_water_can', 'nd_bucket', 'nd_shovel'], any: true, chance: 0.4 },
  ]),
  { spot: 'pal_a', items: ['crate_junk', 'junk_crate_plastic', 'junk_box_food'], any: true, chance: 0.5 },
  { spot: 'pal_b', items: ['crate_junk', 'junk_crate_plastic', 'junk_box_food'], any: true, chance: 0.5 },
  ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((k) => ({ spot: `gr_${k}`, items: ['junk_bucket_old', 'junk_barrel', 'nd_bucket', 'junk_chair_fold', 'nd_plate', 'junk_cone', 'tyre.road', 'fuel.jerrycan', 'junk_trolley'], any: true, chance: 0.35 })),
  { spot: 'eb0', items: ['nd_battery'], chance: 0.3 },
  { spot: 'roof_a', items: ['nd_plate', 'junk_ball', 'nd_bobble_2'], any: true, chance: 0.15 },
];

/**
 * The starter house met along the road (Nomad Drive's StarterHouse, its counter 2 tries, its shelves 13, its tables 12,
 * its floors 51 — without the kit and the van one starts with there): a home's furniture room by room, the kitchen's
 * food and its coffee machine, the closet's bags and the attic's keepsakes, the garage's kits, cans and tools, the
 * yard's and the back's leavings.
 */
const ATTIC = ['crate_junk', 'junk_box_food', 'junk_crate_plastic', 'junk_lamp', 'junk_record', 'junk_trumpet', 'nd_frame', 'nd_wooden_hand'];
const GARAGE_SHELF = ['fuel.oil', 'nd_battery', 'junk_bucket_paint', 'crate_parts', 'nd_crowbar', 'nd_polisher', 'nd_grinder'];
const STARTER_FURNISH: readonly Furnish[] = [
  { spot: 'lv_sofa', items: ['nd_sofa', 'nd_sofa_2', 'nd_cot'], any: true, chance: 0.8 },
  { spot: 'lv_arm', items: ['junk_chair_soft', 'nd_chair'], any: true, chance: 0.6 },
  { spot: 'lv_table', items: ['nd_table'], chance: 0.6 },
  { spot: 'lv_shelf', items: ['nd_bookshelf'], chance: 0.7 },
  { spot: 'lv_fa', items: JUNK_IN, any: true, chance: 0.35 },
  { spot: 'lv_fb', items: JUNK_IN, any: true, chance: 0.35 },
  { spot: 'tv_top', items: ['nd_tape_01'], chance: 0.35 },
  { spot: 'hl_a', items: ['junk_bucket', 'junk_chair_wood', 'pack_old'], any: true, chance: 0.35 },
  { spot: 'hl_b', items: ['junk_bucket', 'junk_chair_wood', 'pack_old'], any: true, chance: 0.35 },
  { spot: 'kt_table', items: ['nd_dinner_table'], chance: 0.8 },
  { spot: 'kt_chair_a', items: ['nd_dinner_chair'], chance: 0.7 },
  { spot: 'kt_chair_b', items: ['nd_dinner_chair'], chance: 0.5 },
  { spot: 'kt_stand', items: ['nd_kitchen_stand'], chance: 0.8 },
  { spot: 'kt_fridge', items: ['nd_fridge'], chance: 0.7 },
  { spot: 'kt_ctr_a', items: ['nd_coffee_machine', 'nd_mug'], any: true, chance: 0.6 },
  { spot: 'kt_ctr_b', items: ['nd_baked_beans', 'nd_tomato_soup', 'nd_cereal', 'nd_coffee_pack'], any: true, chance: 0.6 },
  { spot: 'kt_sh_a', items: ['nd_tuna', 'nd_peanut_butter', 'nd_mug', 'nd_chocolate_1'], any: true, chance: 0.5 },
  { spot: 'kt_sh_b', items: ['nd_tuna', 'nd_peanut_butter', 'nd_mug', 'nd_chocolate_1'], any: true, chance: 0.5 },
  { spot: 'kt_fa', items: ['kit_pot', 'kit_pan', 'nd_bucket'], any: true, chance: 0.4 },
  { spot: 'bd_bed', items: ['junk_pillow', 'pack_old', 'nd_flashlight', 'nd_compass'], any: true, chance: 0.45 },
  { spot: 'bd_ns', items: ['nd_nightstand'], chance: 0.8 },
  { spot: 'bd_cab', items: ['nd_cabinet', 'nd_bookshelf'], any: true, chance: 0.6 },
  { spot: 'bd_fa', items: JUNK_IN, any: true, chance: 0.35 },
  { spot: 'bd_fb', items: JUNK_IN, any: true, chance: 0.35 },
  { spot: 'cl0', items: ['pack_hike', 'nd_first_aid', 'junk_pillow_s', 'nd_film_pack', 'nd_camera'], any: true, chance: 0.55 },
  { spot: 'cl1', items: ['pack_hike', 'nd_first_aid', 'junk_pillow_s', 'nd_film_pack', 'nd_camera'], any: true, chance: 0.55 },
  { spot: 'er_table', items: ['nd_table'], chance: 0.6 },
  { spot: 'er_chair', items: ['nd_chair'], chance: 0.6 },
  { spot: 'er_shelf', items: ['nd_bookshelf'], chance: 0.5 },
  { spot: 'er_fa', items: JUNK_IN, any: true, chance: 0.35 },
  { spot: 'er_fb', items: JUNK_IN, any: true, chance: 0.35 },
  ...['a', 'b', 'c', 'd', 'e', 'f'].map((k) => ({ spot: `at_${k}`, items: ATTIC, any: true, chance: 0.45 })),
  { spot: 'gr_bench_a', items: ['nd_engine_kit', 'nd_tire_kit', 'nd_charger'], any: true, chance: 0.7 },
  { spot: 'gr_bench_b', items: ['nd_flashlight', 'nd_battery', 'fuel.oil'], any: true, chance: 0.5 },
  ...['a', 'b', 'c', 'd', 'e', 'f'].map((k) => ({ spot: `gr_sh_${k}`, items: GARAGE_SHELF, any: true, chance: 0.45 })),
  { spot: 'gr_fa', items: ['fuel.jerrycan'], chance: 0.6 },
  { spot: 'gr_fb', items: ['tyre.road'], chance: 0.5 },
  { spot: 'gr_fc', items: ['part.battery.1'], chance: 0.35 },
  { spot: 'eb0', items: ['nd_battery'], chance: 0.3 },
  { spot: 'box_top', items: ['crate_junk', 'junk_box_food'], any: true, chance: 0.5 },
  { spot: 'pt_table', items: ['nd_mug', 'drink_beer', 'ing_milk'], any: true, chance: 0.45 },
  { spot: 'pal_a', items: ['crate_junk', 'junk_crate_plastic'], any: true, chance: 0.5 },
  ...['a', 'b', 'c', 'd', 'e', 'f'].map((k) => ({ spot: `yd_${k}`, items: ['junk_bucket_old', 'junk_barrel', 'junk_chair_fold', 'junk_cone', 'nd_plate', 'junk_trolley', 'nd_water_can'], any: true, chance: 0.35 })),
  ...['a', 'b', 'c', 'd'].map((k) => ({ spot: `bk_${k}`, items: ['junk_barrel', 'nd_bucket', 'junk_crate_plastic', 'nd_shovel'], any: true, chance: 0.4 })),
  { spot: 'po_a', items: ['nd_chair_fold', 'junk_chair_wood'], any: true, chance: 0.5 },
];

/**
 * The water tower (Nomad Drive's WaterTower, a major place of its Farm and Technical themes: its tank's floor 6 tries
 * and 10 more, the walkway 4 and 4, the ground 5 and 16; and always its water kit — three water cans, a bucket, two
 * bottles of water): the kit by the valve and up in the tank, the farm's and the technical things about it.
 */
const TOWER_IN = ['nd_shovel', 'nd_plant_pot', 'nd_seeds_tomato', 'nd_seeds_potato', 'junk_transceiver', 'nd_battery', 'nd_flashlight', 'crate_junk', 'junk_bucket_old', 'junk_box_food'];
const WATERTOWER_FURNISH: readonly Furnish[] = [
  { spot: 'kit_a', items: ['nd_water_can'] },
  { spot: 'kit_b', items: ['nd_water_can'] },
  { spot: 'kit_c', items: ['nd_bucket'] },
  { spot: 'kit_d', items: ['nd_water_can'] },
  { spot: 'kit_e', items: ['drink_water'] },
  { spot: 'kit_f', items: ['drink_water'] },
  ...['a', 'b', 'c', 'd', 'e', 'f'].map((k) => ({ spot: `t_${k}`, items: TOWER_IN, any: true, chance: 0.55 })),
  ...['a', 'b', 'c', 'd'].map((k) => ({ spot: `w_${k}`, items: ['nd_compass', 'nd_flashlight', 'junk_bag_s', 'drink_beer', 'nd_camera', 'nd_film_pack'], any: true, chance: 0.55 })),
  ...['a', 'b', 'c', 'd', 'e'].map((k) => ({ spot: `g_${k}`, items: ['nd_bucket', 'nd_water_can', 'junk_barrel', 'junk_crate_plastic', 'nd_shovel', 'tyre.road', 'junk_bucket_old'], any: true, chance: 0.45 })),
];

/**
 * The watch tower (Nomad Drive's WatchTower, a major place of its Technical and Camp themes: its cabin's floor 3 tries
 * and 4 more, the walkway 5 and 14, its roof 2 of market goods hard to come by, the ground 7 and 24 and 5 and 10 more
 * scattered): a lookout's things in the cabin, the walkway's chair and mug, a camp's things about its feet.
 */
const WATCHTOWER_FURNISH: readonly Furnish[] = [
  ...['a', 'b', 'c', 'd', 'e'].map((k) => ({ spot: `c_${k}`, items: ['nd_flashlight', 'nd_compass', 'junk_transceiver', 'nd_camera', 'nd_film_pack', 'pack_hike', 'nd_first_aid', 'nd_mug', 'junk_lamp', 'junk_clockradio'], any: true, chance: 0.55 })),
  { spot: 'finder', items: ['nd_compass'], chance: 0.5 },
  { spot: 'cot', items: ['junk_pillow', 'pack_old', 'nd_tape_01'], any: true, chance: 0.35 },
  ...['a', 'b', 'c', 'd', 'e', 'f'].map((k) => ({ spot: `w_${k}`, items: ['nd_chair_fold', 'drink_beer', 'nd_mug', 'junk_bag_s', 'junk_camera', 'nd_battery'], any: true, chance: 0.55 })),
  { spot: 'roof_a', items: ['drink_water', 'food_chips', 'nd_chocolate_1', 'nd_tuna'], any: true, chance: 0.12 },
  { spot: 'roof_b', items: ['drink_water', 'food_chips', 'nd_chocolate_1', 'nd_tuna'], any: true, chance: 0.12 },
  ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((k) => ({ spot: `g_${k}`, items: ['nd_chair_fold', 'junk_crate_plastic', 'nd_bucket', 'nd_shovel', 'junk_barrel', 'kit_pot', 'pack_old'], any: true, chance: 0.45 })),
];

/**
 * The old graveyard (Nomad Drive's Graveyard, a major place of its Sacred theme: inside its tombs 8 tries and 10 more,
 * small things only; on the two flat lids 2 and 2; the ground 6 and 18; the metal detector, the shovel and picture
 * frames the likelier): what was left in the tombs, candles and frames on the flat lids, a digger's tools about it.
 */
const IN_TOMB = ['nd_frame', 'junk_candle', 'nd_compass', 'nd_film_pack', 'junk_camera', 'nd_key_1', 'nd_pills', 'junk_record'];
const GRAVEYARD_FURNISH: readonly Furnish[] = [
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ spot: `in${i}`, items: IN_TOMB, any: true, chance: 0.55 })),
  { spot: 'lid2', items: ['junk_candle', 'nd_frame', 'nd_mug'], any: true, chance: 0.55 },
  { spot: 'lid6', items: ['junk_candle', 'nd_frame', 'nd_mug'], any: true, chance: 0.55 },
  ...['a', 'b', 'c', 'd', 'e', 'f'].map((k) => ({ spot: `g_${k}`, items: ['nd_shovel', 'nd_metal_detector', 'junk_bucket_old', 'nd_plate', 'junk_candle', 'nd_frame'], any: true, chance: 0.45 })),
];

/**
 * The container yard (Nomad Drive's ContainerPack-01, a major place of its Storage theme: on its containers' floors 16
 * tries and 32 more, two and four to a container; on their roofs 3 and 12, hard to come by; on the ground 4 and 12;
 * furniture, tyres and a car's parts the likelier): tools and spare parts by the doors, crates in the middle, the big
 * furniture stored at the far end; what was left on the roofs; a yard's junk about the lanes.
 */
const CT_DOOR = ['nd_crowbar', 'nd_tire_kit', 'nd_battery', 'nd_charger', 'nd_polisher', 'nd_grinder', 'fuel.oil', 'junk_bucket_paint', 'nd_camera', 'nd_mug', 'nd_coffee_pack', 'pack_old'];
const CT_MID = ['crate_parts', 'crate_junk', 'junk_crate_plastic', 'junk_box_food', 'nd_engine_kit', 'nd_tire_kit', 'junk_barrel', 'nd_frame', 'nd_seeds_apple'];
const CT_FAR = ['nd_cabinet', 'nd_bookshelf', 'nd_sofa', 'nd_dinner_table', 'nd_dinner_chair', 'nd_nightstand', 'nd_fridge', 'junk_chair_wood', 'crate_junk', 'crate_parts'];
const CT_ROOF = ['nd_battery', 'drink_water', 'food_chips', 'nd_tire_kit', 'nd_crowbar', 'junk_bag_s', 'nd_camera', 'drink_beer'];
const CT_YARD = ['junk_barrel', 'junk_crate_plastic', 'nd_bucket', 'junk_cone', 'nd_shovel', 'crate_junk', 'junk_trolley', 'junk_jack', 'nd_tire_kit'];
const CONTAINERYARD_FURNISH: readonly Furnish[] = [
  ...['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'].flatMap((c) => [
    { spot: `${c}_a`, items: CT_DOOR, any: true, chance: 0.9 },
    { spot: `${c}_b`, items: CT_DOOR, any: true, chance: 0.9 },
    { spot: `${c}_c`, items: CT_MID, any: true, chance: 0.45 },
    { spot: `${c}_d`, items: CT_MID, any: true, chance: 0.45 },
    { spot: `${c}_e`, items: CT_FAR, any: true, chance: 0.45 },
    { spot: `${c}_f`, items: CT_FAR, any: true, chance: 0.45 },
  ]),
  ...['c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'].flatMap((c) => [
    { spot: `${c}_roofa`, items: CT_ROOF, any: true, chance: 0.25 },
    { spot: `${c}_roofb`, items: CT_ROOF, any: true, chance: 0.25 },
  ]),
  ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((k) => ({ spot: `g_${k}`, items: CT_YARD, any: true, chance: 0.5 })),
  { spot: 'pallets', items: ['crate_parts', 'junk_crate_plastic', 'nd_tire_kit'], any: true, chance: 0.4 },
  { spot: 'tyres', items: ['nd_tire_kit', 'junk_jack'], any: true, chance: 0.3 },
];

/**
 * The radio station (Nomad Drive's RadioStation, a major place of its Technical theme: its desk 4 tries and 6 more;
 * each of its 23 lockers' compartments one, small things; its electric box one; its roofs 4 and 10, hard to come by;
 * the awning 1 and 4; the ground 7 and 24 and 5 and 10 more scattered; tyres, blueprints, a metal detector and a car's
 * parts the likelier): an operator's things on the desk, small things in the lockers, a fuse's worth in the box, a
 * technician's tools and spares about the yard.
 */
const RADIO_DESK = ['junk_transceiver', 'junk_clockradio', 'nd_mug', 'nd_flashlight', 'nd_compass', 'nd_battery', 'nd_charger', 'nd_camera', 'nd_film_pack', 'junk_lamp', 'nd_pills', 'nd_coffee_pack', 'nd_coffee_machine'];
const RADIO_LOCKERS = [
  ...[0, 1, 3, 4, 6, 7, 9, 10, 12, 14, 16].map((i) => `lk${i}`),
  ...[2, 5, 8, 11, 13, 15].flatMap((i) => [`lk${i}a`, `lk${i}b`]),
];
const RADIO_ROOF = ['nd_tire_kit', 'nd_battery', 'drink_water', 'nd_crowbar', 'junk_transceiver', 'pack_old', 'nd_metal_detector', 'drink_beer'];
const RADIO_YARD = ['nd_shovel', 'nd_metal_detector', 'nd_tire_kit', 'crate_parts', 'junk_barrel', 'kit_stove', 'kit_pot', 'kit_pan', 'junk_chair_office', 'junk_crate_plastic', 'nd_engine_kit', 'nd_seeds_tomato', 'nd_first_aid', 'pack_hike'];
const RADIOSTATION_FURNISH: readonly Furnish[] = [
  ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((k) => ({ spot: `desk_${k}`, items: RADIO_DESK, any: true, chance: 0.6 })),
  ...RADIO_LOCKERS.map((spot) => ({ spot, items: LOCKER, any: true, chance: 0.6 })),
  { spot: 'ebox', items: ['nd_battery', 'nd_charger', 'nd_flashlight'], any: true, chance: 0.7 },
  { spot: 'shelf_a', items: ['crate_parts', 'nd_tire_kit', 'nd_battery', 'fuel.oil'], any: true, chance: 0.5 },
  { spot: 'shelf_b', items: ['nd_flashlight', 'nd_charger', 'junk_transceiver', 'nd_first_aid'], any: true, chance: 0.5 },
  ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((k) => ({ spot: `roof_${k}`, items: RADIO_ROOF, any: true, chance: 0.4 })),
  ...['a', 'b', 'c'].map((k) => ({ spot: `awn_${k}`, items: ['drink_beer', 'nd_mug', 'junk_bag_s', 'food_chips', 'nd_battery'], any: true, chance: 0.5 })),
  ...'abcdefghijklmnop'.split('').map((k) => ({ spot: `g_${k}`, items: RADIO_YARD, any: true, chance: 0.6 })),
  ...'abcdefgh'.split('').map((k) => ({ spot: `s_${k}`, items: RADIO_YARD, any: true, chance: 0.65 })),
];

/**
 * The factories (Nomad Drive's Factory-01…03, major places of its Storage and Garage themes: their shelves the most —
 * the warehouse's 23 tries and 44 more, the works block's 28 and 56 —, their floors and the ground about them the rest;
 * spray paint, tyres, chargers, tyre kits, seeds and a car's parts the likelier): spares, tools and stores on the
 * shelves, a works' junk on the floors, a yard's about them.
 */
const WORKS_SHELF = ['crate_parts', 'crate_junk', 'nd_tire_kit', 'nd_engine_kit', 'nd_battery', 'junk_bucket_paint', 'fuel.oil', 'junk_box_food', 'junk_crate_plastic', 'nd_crowbar', 'nd_polisher', 'nd_grinder', 'nd_charger', 'nd_first_aid', 'nd_coffee_pack', 'nd_seeds_watermelon', 'nd_pills', 'nd_mug', 'nd_plate'];
const WORKS_FLOOR = ['junk_barrel', 'junk_crate_plastic', 'crate_junk', 'junk_trolley', 'junk_cone', 'nd_bucket', 'junk_jack', 'nd_chair_fold', 'junk_bucket_old', 'junk_bucket_paint', 'nd_tire_kit', 'pack_old'];
const WORKS_YARD = ['junk_barrel', 'junk_cone', 'nd_shovel', 'crate_junk', 'junk_trolley', 'junk_jack', 'nd_tire_kit', 'fuel.jerrycan', 'nd_plate', 'junk_crate_plastic', 'junk_bucket_paint'];
/** a shelving unit's spots (nd/_props.py shelving: its boards at 1.02 and 1.62, three to a board) */
const shelfSpots = (k: number): string[] => ['102', '162'].flatMap((b) => [0, 1, 2].map((i) => `sh${k}_${b}_${i}`));
const FACTORY1_FURNISH: readonly Furnish[] = [
  ...Array.from({ length: 30 }, (_, k) => ({ spot: `f_${String(k).padStart(2, '0')}`, items: [...WORKS_FLOOR, 'nd_tire_kit', 'nd_engine_kit', 'crate_parts', 'nd_plate', 'nd_seeds_watermelon', 'nd_charger'], any: true, chance: 0.5 })),
  ...Array.from({ length: 24 }, (_, k) => ({ spot: `g_${String(k).padStart(2, '0')}`, items: WORKS_YARD, any: true, chance: 0.4 })),
  ...['st0', 'st1'].flatMap((u) => ['102', '162'].flatMap((b) => [0, 1].map((i) => ({ spot: `${u}_${b}_${i}`, items: WORKS_SHELF, any: true, chance: 0.6 })))),
  ...'abcde'.split('').map((k) => ({ spot: `table_${k}`, items: ['nd_mug', 'nd_coffee_pack', 'nd_coffee_machine', 'nd_pills', 'junk_clockradio', 'nd_flashlight', 'nd_battery', 'nd_charger', 'nd_frame', 'junk_lamp'], any: true, chance: 0.6 })),
  ...[0, 1, 2].map((k) => ({ spot: `pallet_${k}`, items: ['crate_parts', 'crate_junk', 'junk_crate_plastic'], any: true, chance: 0.4 })),
  ...[0, 1].map((k) => ({ spot: `yard_pallet_${k}`, items: ['crate_junk', 'junk_crate_plastic', 'junk_bucket_paint'], any: true, chance: 0.4 })),
];
const FACTORY2_FURNISH: readonly Furnish[] = [
  ...Array.from({ length: 11 }, (_, k) => shelfSpots(k)).flat().map((spot) => ({ spot, items: WORKS_SHELF, any: true, chance: 0.5 })),
  ...'abcdefghijklmno'.split('').map((k) => ({ spot: `f_${k}`, items: WORKS_FLOOR, any: true, chance: 0.35 })),
  ...Array.from({ length: 24 }, (_, k) => ({ spot: `g_${String(k).padStart(2, '0')}`, items: WORKS_YARD, any: true, chance: 0.35 })),
];
const FACTORY3_FURNISH: readonly Furnish[] = [
  ...Array.from({ length: 17 }, (_, k) => k).filter((k) => k !== 4 && k !== 10 && k !== 16).flatMap((k) => shelfSpots(k)).map((spot) => ({ spot, items: WORKS_SHELF, any: true, chance: 0.45 })),
  ...[0, 1, 2].flatMap((fi) => Array.from({ length: 10 }, (_, k) => ({ spot: `f${fi}_${k}`, items: WORKS_FLOOR, any: true, chance: 0.4 }))),
  ...Array.from({ length: 19 }, (_, k) => ({ spot: `g_${String(k).padStart(2, '0')}`, items: WORKS_YARD, any: true, chance: 0.35 })),
];

/**
 * The wind farm (Nomad Drive's WindTurbines, a major place of its Technical theme: the ground about its towers 20
 * tries and 60 more; a shelf 4 and 6; in each nose two of its valuables; in the nacelles 4 and 6 market goods): a
 * technician's leavings about the towers, spares on the kiosks' shelves, a keepsake in each nose, a lunch up top.
 */
const WIND_GROUND = ['nd_tire_kit', 'crate_parts', 'junk_barrel', 'nd_shovel', 'nd_metal_detector', 'junk_cone', 'fuel.jerrycan', 'nd_engine_kit', 'junk_crate_plastic', 'nd_battery', 'nd_plate'];
const WIND_SHELF = ['nd_battery', 'nd_charger', 'nd_flashlight', 'nd_first_aid', 'crate_parts', 'fuel.oil', 'nd_tire_kit'];
const WIND_NOSE = ['nd_camera', 'nd_bobble_1', 'nd_bobble_2', 'nd_bobble_3', 'nd_bobble_4', 'junk_trumpet', 'nd_wooden_hand', 'nd_frame'];
const WIND_NACELLE = ['food_chips', 'nd_chocolate_1', 'drink_cola', 'drink_water', 'nd_tuna', 'nd_baked_beans', 'drink_energy', 'nd_coffee_pack', 'food_nuts_old', 'nd_peanut_butter'];
const WINDFARM_FURNISH: readonly Furnish[] = [
  ...['a', 'b'].flatMap((t) => Array.from({ length: 20 }, (_, k) => ({ spot: `g_${t}${String(k).padStart(2, '0')}`, items: WIND_GROUND, any: true, chance: 0.5 }))),
  ...['a', 'b'].flatMap((t) => ['102', '162'].flatMap((b) => [0, 1, 2].map((i) => ({ spot: `kiosk_${t}_${b}_${i}`, items: WIND_SHELF, any: true, chance: 0.45 })))),
  ...['a0', 'a1', 'b0', 'b1'].map((k) => ({ spot: `nose_${k}`, items: WIND_NOSE, any: true })),
  ...['a', 'b'].flatMap((t) => [0, 1, 2, 3, 4].map((k) => ({ spot: `nacelle_${t}${k}`, items: WIND_NACELLE, any: true, chance: 0.6 }))),
];

/**
 * The small places by the road (Nomad Drive's minor places, ND7): no guaranteed thing but the outhouse's bowl, each
 * place's spots its own (Nomad Drive's slots, a fixed number and as many more again: a slot holds something a little
 * under one time in two), what the place's themes favour the likelier — Roadside (the bus stop, the outhouses, the
 * mailboxes: snacks, pills, chairs, drinks, a plate), Farm (the windmill: seeds, fruit and greens, a shovel, a bucket,
 * a jug, a flower pot, milk), Farm, Camp and Market (the hay), Roadside and Sacred (the crosses: a metal detector, a
 * shovel, a painting, the wooden hand), Scrap (the wrecks: a car's parts, tyres, tapes, repair kits, a crowbar, a radio).
 */
const ROAD_SMALL = ['food_chips', 'food_licorice', 'nd_chocolate_1', 'nd_chocolate_1', 'nd_chocolate_1', 'nd_pills', 'drink_soda', 'drink_cola', 'drink_water', 'drink_energy', 'nd_charger', 'nd_battery', 'nd_compass', 'nd_film_pack', 'nd_tape_01', 'junk_mug', 'nd_mug'];
const ROAD_ANY = [...ROAD_SMALL, 'nd_chair_fold', 'nd_plate', 'nd_shovel', 'nd_crowbar', 'nd_tire_kit', 'nd_seeds_apple', 'junk_bag', 'junk_bag_s', 'drink_beer', 'tyre.road', 'nd_first_aid', 'junk_chair_fold'];
const FARM_SMALL = ['nd_seeds_apple', 'nd_seeds_potato', 'nd_seeds_tomato', 'nd_seeds_watermelon', 'ing_apple', 'ing_orange', 'ing_potato', 'ing_tomato', 'ing_banana', 'nd_mushroom', 'ing_milk', 'nd_battery'];
const FARM_ANY = [...FARM_SMALL, 'nd_shovel', 'nd_bucket', 'nd_water_can', 'nd_plant_pot', 'tyre.road'];
const CAMP_MARKET = ['pack_hike', 'pack_old', 'kit_pot', 'kit_pan', 'nd_chair_fold', 'nd_flashlight', 'nd_first_aid', 'nd_baked_beans', 'nd_tuna', 'nd_tomato_soup', 'nd_cereal', 'food_chips', 'nd_coffee_pack', 'nd_coffee_machine', 'drink_water', 'drink_beer', 'nd_engine_kit', 'nd_tire_kit'];
const SACRED = ['nd_metal_detector', 'nd_shovel', 'nd_frame', 'nd_wooden_hand', 'junk_candle', 'crate_junk', 'nd_pills', 'nd_tire_kit', ...ROAD_SMALL];
const SCRAP_SMALL = ['nd_tape_01', 'nd_engine_kit', 'nd_tire_kit', 'nd_crowbar', 'junk_transceiver', 'fuel.oil', 'nd_plate', 'nd_first_aid', 'nd_charger', 'part.battery.1'];
const SCRAP = [...SCRAP_SMALL, 'crate_parts', 'tyre.road', 'junk_clockradio', 'fuel.jerrycan', 'junk_jack'];
/** spots named <prefix>_0…n−1 holding one of `items` with `chance` */
const row = (prefix: string, n: number, items: readonly string[], chance: number): Furnish[] => Array.from({ length: n }, (_, i) => ({ spot: `${prefix}_${i}`, items, any: true, chance }));
const BUSSTOP_FURNISH: readonly Furnish[] = [
  ...row('bench', 7, ROAD_SMALL, 0.45),
  ...row('roof', 5, ['nd_plate', 'junk_ball', 'drink_soda', 'nd_pills', 'junk_bag_s'], 0.4),
  ...row('front', 6, ROAD_ANY, 0.45),
  ...row('behind', 6, ROAD_ANY, 0.45),
  { spot: 'bin', items: ['food_chips', 'drink_soda', 'nd_pills', 'nd_battery', 'junk_mug', 'nd_film_pack'], any: true, chance: 0.5 },
];
const TOILETS_FURNISH: readonly Furnish[] = [
  // (Nomad Drive's WC-01: always in the first, to be taken)
  { spot: 'bowl', items: ['nd_wc'] },
  ...['bench_b00', 'bench_b01', 'bench_b10', 'bench_b11'].map((spot) => ({ spot, items: ROAD_SMALL, any: true, chance: 0.45 })),
  ...row('roof_a', 3, ['nd_plate', 'junk_ball', 'nd_pills'], 0.35),
  ...row('roof_b', 3, ['nd_plate', 'junk_ball', 'nd_pills'], 0.35),
  ...row('between', 6, ROAD_ANY, 0.45),
  ...row('behind_a', 5, ROAD_ANY, 0.45),
  ...row('behind_b', 5, ROAD_ANY, 0.45),
];
const MAILBOXES_FURNISH: readonly Furnish[] = [
  // (small things only — Nomad Drive's tight boxes: what is bigger than its box sticks out of its shut lid)
  ...Array.from({ length: 8 }, (_, i) => ({ spot: `box${i}`, items: ['nd_pills', 'nd_film_pack', 'nd_compass', 'nd_battery', 'nd_tape_01', 'food_licorice', 'nd_chocolate_1'], any: true, chance: 0.5 })),
  ...row('behind', 6, ROAD_ANY, 0.45),
];
const WINDMILL_FURNISH: readonly Furnish[] = [
  ...row('bale_l', 3, FARM_SMALL, 0.5),
  ...row('bale_r', 3, FARM_SMALL, 0.5),
  ...row('behind', 6, FARM_ANY, 0.5),
  ...row('left', 5, FARM_ANY, 0.5),
  ...row('right', 5, FARM_ANY, 0.5),
];
const HAYS_FURNISH: readonly Furnish[] = [
  ...row('north', 3, [...FARM_SMALL, ...CAMP_MARKET.slice(0, 12)], 0.55),
  ...row('stack_a', 3, [...FARM_SMALL, ...CAMP_MARKET.slice(0, 12)], 0.55),
  ...row('west', 3, [...FARM_SMALL, ...CAMP_MARKET.slice(0, 12)], 0.55),
  ...row('south', 5, [...FARM_SMALL, ...CAMP_MARKET.slice(0, 12)], 0.55),
  ...row('stack_b', 3, [...FARM_SMALL, ...CAMP_MARKET.slice(0, 12)], 0.55),
  ...row('g_east', 5, [...FARM_ANY, ...CAMP_MARKET], 0.55),
  ...row('g_west', 5, [...FARM_ANY, ...CAMP_MARKET], 0.55),
  ...row('g_back', 5, [...FARM_ANY, ...CAMP_MARKET], 0.55),
];
const CROSSES_FURNISH: readonly Furnish[] = [
  ...row('mid_a', 4, SACRED, 0.5),
  ...row('mid_b', 3, SACRED, 0.5),
  ...row('mid_c', 3, SACRED, 0.5),
  ...row('mid_d', 2, SACRED, 0.5),
  ...row('behind', 6, SACRED, 0.5),
  ...row('left', 5, SACRED, 0.5),
  ...row('right', 5, SACRED, 0.5),
];
// (on and in the wreck: its own roll's — core/modcar/wrecks.ts; about it, the place's)
const wreckFurnish = (right: number, left: number, behind: number, front: number): readonly Furnish[] => [
  ...row('right', right, SCRAP, 0.5),
  ...row('left', left, SCRAP, 0.5),
  ...row('behind', behind, SCRAP, 0.5),
  ...row('front', front, SCRAP, 0.5),
];
/** a small place's card: on the verge, facing the road, its ground levelled as Nomad Drive's (its road gap and margin) */
const minor = (geo: unknown, furnish: readonly Furnish[], nd: string, setback: number, margin: number, paints: NdBuilding['paints']): NdBuilding => ({
  geo: geo as CardGeo,
  siteKind: 'roadside',
  setback,
  margin,
  ground: 0,
  furnish,
  nd,
  paints,
});

export const ND_BUILDINGS: Readonly<Record<string, NdBuilding>> = {
  cabin: { geo: cabinJson as unknown as CardGeo, siteKind: 'house', setback: 2.6, margin: 3.5, ground: 0, furnish: CABIN_FURNISH, nd: 'WoodenCabin01' },
  // (its tents' canvas: green, rust, blue, khaki, and cream)
  camp: { geo: campJson as unknown as CardGeo, siteKind: 'camp', setback: 3, margin: 2, ground: 0, furnish: CAMP_FURNISH, nd: 'CampSite', paints: { walls: [0x4f7a5a, 0xb8573a, 0x3e6f8f, 0x8a7a4a], trims: [0xe9dfc4, 0xd8c8a0], rust: 0.1 } },
  // (the station's colour: its sign, its canopy, its pump and its window frames — red, teal, mustard, blue, green — on cream walls)
  station: {
    geo: stationJson as unknown as CardGeo,
    siteKind: 'station',
    setback: 1,
    margin: 2,
    ground: 1,
    furnish: STATION_FURNISH,
    nd: 'GasStation01',
    paints: { walls: [0xb8463a, 0x2f7f86, 0xc9962e, 0x35679a, 0x4f8a5a], trims: [0xefe6cf, 0xe8e2d4, 0xf2ead8], rust: 0.12 },
    startLit: [0, 1],
  },
  // (the motel's colour on its walls — salmon, mint, sky, butter, lilac — trimmed white; two or three rooms found lit)
  // (a home to the dice; from world version 7 a sort of place of its own to the plan: what travellers leave, not what a household keeps)
  motel: {
    geo: motelJson as unknown as CardGeo,
    siteKind: 'house',
    sort: 'motel',
    setback: 1,
    margin: 2.5,
    ground: 1,
    furnish: MOTEL_FURNISH,
    nd: 'Motel',
    paints: { walls: [0xe8a48f, 0x8fc1b5, 0x9bbbd8, 0xe9cf7a, 0xc7a6c9], trims: [0xf4efe2, 0xefe6cf], rust: 0.1 },
    startLit: [2, 3],
  },
  // (the commune's colour on two of its houses — sage, straw, slate, terracotta, taupe — one of bare boards, the tower's upper room white)
  commune: {
    geo: communeJson as unknown as CardGeo,
    siteKind: 'house',
    setback: 2,
    margin: 2,
    ground: 0,
    furnish: COMMUNE_FURNISH,
    nd: 'CommuneHouses-01',
    paints: { walls: [0x9fb7a5, 0xc9b38a, 0xa5b5c6, 0xc48f7a, 0xb9a79a], trims: [0xefe6cf, 0xe4dccb], rust: 0.15 },
    startLit: [0, 2],
  },
  // (grey clapboard, trimmed white; its doors never locked nor stuck, as Nomad Drive's)
  starter: {
    geo: starterJson as unknown as CardGeo,
    siteKind: 'house',
    setback: 2,
    margin: 2.5,
    ground: 0,
    furnish: STARTER_FURNISH,
    nd: 'StarterHouse',
    paints: { walls: [0x9aa0a3, 0x8f9796, 0xa8a49b, 0x7e8a91, 0xa3a9a0], trims: [0xeeeae0, 0xe2ddd2], rust: 0.12 },
    startLit: [0, 1],
  },
  // (its legs, railing and ladder in the tower's colour — rust red, teal, green, cream — over a tank of wood)
  watertower: {
    geo: watertowerJson as unknown as CardGeo,
    siteKind: 'lookout',
    setback: 2,
    margin: 2,
    ground: 0,
    furnish: WATERTOWER_FURNISH,
    nd: 'WaterTower',
    paints: { walls: [0x9c3b2e, 0x3e6f6a, 0x5c7a4a, 0xd8d2c0], trims: [0x2f3236, 0x3a3d42], rust: 0.25 },
  },
  // (its cabin in the tower's colour — forest green, brown, slate, red — over a frame of timber)
  watchtower: {
    geo: watchtowerJson as unknown as CardGeo,
    siteKind: 'lookout',
    setback: 2,
    margin: 2,
    ground: 0,
    furnish: WATCHTOWER_FURNISH,
    nd: 'WatchTower',
    paints: { walls: [0x5b7a4e, 0x8a5a3c, 0x3e5f6f, 0xa0453a], trims: [0xefe6cf, 0xe4dccb], rust: 0.12 },
  },
  // (its tombs of weathered stone, its railing of iron)
  graveyard: {
    geo: graveyardJson as unknown as CardGeo,
    siteKind: 'roadside',
    setback: 2,
    margin: 2.5,
    ground: 0,
    furnish: GRAVEYARD_FURNISH,
    nd: 'Graveyard',
    paints: { walls: [0x9a958a, 0x8e8b84, 0xa39b8c, 0x8c9090], trims: [0x2f3236], rust: 0.02 },
  },
  // (the factories' block in a works' paint: brick, sand, grey-green, slate; their steel and shutters in a second)
  // the small places (ND7)
  busstop: minor(busstopJson, BUSSTOP_FURNISH, 'BusStop', 3.4, 1.0, { walls: [0x3f6f8f, 0x4f7a52, 0xa8432f, 0x6a6f74], trims: [0xc9a53a, 0xe8e0cc, 0x2f5a7a], rust: 0.3 }),
  toilets: minor(toiletsJson, TOILETS_FURNISH, 'ToiletCabins', 3.5, 1.5, { walls: [0x6f8a5c, 0x8a6a48, 0x5e7a86, 0x9a7a52], trims: [0xd9cfb6], rust: 0.45 }),
  mailboxes: minor(mailboxesJson, MAILBOXES_FURNISH, 'Mailboxes-01', 3.5, 1.5, { walls: [0x2f5f4f, 0x2e4a6e, 0x7a3a30, 0x3a3f44], trims: [0xc8322a], rust: 0.2 }),
  windmill: minor(windmillJson, WINDMILL_FURNISH, 'Windmill', 3.5, 1.5, { walls: [0xd9b45a, 0xcfa64a, 0xe2c272], trims: [0xb8473a, 0x3f6a8a, 0x4f7a52], rust: 0.3 }),
  hays: minor(haysJson, HAYS_FURNISH, 'Hays', 3.5, 1.5, { walls: [0xd9b45a, 0xcfa64a, 0xe2c272], trims: [0x5f6f8a, 0x8a5a3a, 0x7a7a7a], rust: 0 }),
  crosses: minor(crossesJson, CROSSES_FURNISH, 'WoodenCrosses', 3.5, 1.5, { walls: [0xe8e2d4, 0xd8d0c0], trims: [0x5a7a9a, 0x8a5a4a], rust: 0 }),
  wreck1: minor(wreck1Json, wreckFurnish(6, 4, 5, 3), 'CarWreckage01', 5.5, 1.0, { walls: [0x7a7a7a], trims: [0x555555], rust: 0.5 }),
  wreck2: minor(wreck2Json, wreckFurnish(6, 5, 6, 2), 'CarWreckage-02', 3.5, 1.5, { walls: [0x7a7a7a], trims: [0x555555], rust: 0.5 }),
  wreck3: minor(wreck3Json, wreckFurnish(6, 4, 5, 4), 'CarWreckage-03', 3.5, 1.5, { walls: [0x7a7a7a], trims: [0x555555], rust: 0.5 }),
  // (its towers, nacelles and blades white, the blades' tips and the tower's door red)
  windfarm: {
    geo: windfarmJson as unknown as CardGeo,
    siteKind: 'works',
    setback: 2,
    margin: 3,
    ground: 0,
    furnish: WINDFARM_FURNISH,
    nd: 'WindTurbines',
    paints: { walls: [0xeef0ec, 0xe7e9e5, 0xf2efe6], trims: [0xd23b2b, 0xc8452f], rust: 0.04 },
  },
  factory1: {
    geo: factory1Json as unknown as CardGeo,
    siteKind: 'works',
    setback: 2,
    margin: 2.5,
    ground: 1,
    furnish: FACTORY1_FURNISH,
    nd: 'Factory-01',
    paints: { walls: [0xb36a52, 0xc9b48e, 0x8b9a86, 0x7d8a96], trims: [0x4f6f8a, 0xc8a23c, 0x7a3e36, 0xd8d2c4], rust: 0.22 },
  },
  factory2: {
    geo: factory2Json as unknown as CardGeo,
    siteKind: 'works',
    setback: 2,
    margin: 2.5,
    ground: 1,
    furnish: FACTORY2_FURNISH,
    nd: 'Factory-02',
    paints: { walls: [0xb36a52, 0xc9b48e, 0x8b9a86, 0x7d8a96], trims: [0x4f6f8a, 0xc8a23c, 0x7a3e36, 0xd8d2c4], rust: 0.25 },
  },
  factory3: {
    geo: factory3Json as unknown as CardGeo,
    siteKind: 'works',
    setback: 2,
    margin: 2.5,
    ground: 1,
    furnish: FACTORY3_FURNISH,
    nd: 'Factory-03',
    paints: { walls: [0xb36a52, 0xc9b48e, 0x8b9a86, 0x7d8a96], trims: [0x4f6f8a, 0xc8a23c, 0x7a3e36, 0xd8d2c4], rust: 0.2 },
  },
  // (its block painted brick red, cream, sage or grey; its mast and its trims white, red or grey)
  radiostation: {
    geo: radiostationJson as unknown as CardGeo,
    siteKind: 'works',
    setback: 2,
    margin: 2.5,
    ground: 0,
    furnish: RADIOSTATION_FURNISH,
    nd: 'RadioStation',
    paints: { walls: [0xb5634a, 0xd9cdb0, 0x8fa287, 0x9a9c98], trims: [0xe8e4da, 0xb84a3a, 0x6f7479], rust: 0.12 },
  },
  // (its containers in a shipping line's red, blue, green or orange, and a second colour among them)
  containeryard: {
    geo: containeryardJson as unknown as CardGeo,
    siteKind: 'works',
    setback: 2,
    margin: 2.5,
    ground: 0,
    furnish: CONTAINERYARD_FURNISH,
    nd: 'ContainerPack-01',
    paints: { walls: [0xa8432f, 0x3f6a8a, 0x4f7a52, 0xc7742c], trims: [0x3c7f7a, 0xc9a53a, 0x7a3a34, 0x5d6f80], rust: 0.25 },
  },
  pump: {
    geo: pumpJson as unknown as CardGeo,
    siteKind: 'roadside',
    setback: 2.5,
    margin: 1.5,
    ground: 0,
    furnish: PUMP_FURNISH,
    nd: 'Waterpump',
    paints: { walls: [0x8d877c, 0x958b7a, 0x7f8584, 0x9a9184], trims: [0xbdb4a2, 0xc8bfae, 0xb3ab9c], rust: 0.05 },
  },
};

/** the things a building's spots hold for a seed: the same every visit (`s`: how far along the road, for later grading); nothing at the spots in `skip` */
export function furnishOf(b: NdBuilding, seed: number, _s: number, out: PrefabThing[], skip?: ReadonlySet<string>): void {
  const spots = new Map(b.geo.spots.map((sp) => [sp.name, sp]));
  b.furnish.forEach((f, i) => {
    const sp = spots.get(f.spot);
    if (!sp || skip?.has(f.spot)) return;
    const r = new Rng(hash2(seed | 0, i, 0x7a5e));
    if (f.chance !== undefined && r.next() >= f.chance) return;
    // (the old game's kinds, with a dot, as they are: the places make them what they are in ModCar)
    const known = f.items.filter((id) => id.includes('.') || hasItem(id));
    const item = f.any ? known[Math.floor(r.next() * known.length) % Math.max(1, known.length)] : known[0];
    if (!item) return;
    out.push({ item, u: sp.u, v: sp.v, y: sp.y, yaw: sp.yaw, ...(f.n ? { n: f.n } : {}) });
  });
}

/**
 * A box of a building's the plan's finds go in (core/world/prefabs.ts PrefabBox), at one of its spots — what the spot
 * holds of its own is then not laid there (docs/V3/plan/growth.md §三, ND9).
 */
export interface NdBox {
  spot: string;
  /** its sort (core/modcar/loot.ts BOX_ROOM: how many things it holds; a small one takes nothing bigger than a hand while a bigger one is there) */
  kind: ContainerKind;
  /** a top (a shelf's board, a desk, a locker's floor) over the room's floor at this height (the card's frame); absent: a patch of the spot's own floor */
  floor?: number;
  /** turned from the building's heading (rad): its things in a row along it, what has no room on it out of its +v side (absent: a floor's towards the front, π) */
  turn?: number;
  /** its length and depth (m; absent: a floor's 1.0 × 0.8, a top's 0.7 × 0.4) and the room over a top (absent: 0.7) */
  w?: number;
  d?: number;
  clear?: number;
}

const HALF = Math.PI / 2;
/** a shelving unit's board (nd/_props.py shelving: its boards 0.6 apart) */
const BOARD_BOX = { kind: 'shelf' as const, floor: 0, w: 0.75, d: 0.3, clear: 0.45 };
/** a locker's compartment (its door's box: core/v3/nd/cards.ts CardDoor.box — out of reach while its door is shut) */
const LOCKER_BOX = { kind: 'medicine' as const, floor: 0, w: 0.3, d: 0.35, clear: 0.7 };

/**
 * The boxes the plan's finds go in, by building (the big ones; the small places by the road and the graveyard keep to
 * their own): floors where there is room on them, the boards of shelving and the lockers where a small thing goes —
 * each away from the spots about it (what the others hold lies a metre off), what has no room in it out over open floor
 */
export const ND_BOXES: Readonly<Record<string, readonly NdBox[]>> = {
  station: [
    // (the garage bay's floor, the old store room's, the household shelf, the snacks shelf: their aisles to the east)
    { spot: 'garage_e', kind: 'crate' },
    { spot: 'store_c', kind: 'crate', turn: 0 },
    { spot: 'sh3em0', ...BOARD_BOX, turn: -HALF },
    { spot: 'sh1em1', ...BOARD_BOX, turn: -HALF },
  ],
  motel: [
    // (the reception's desk, two of its lockers, three rooms' floors, the utility room's)
    { spot: 'desk_c', kind: 'counter', floor: 0, turn: HALF, w: 0.5, d: 0.4 },
    { spot: 'lk3', ...LOCKER_BOX, turn: Math.PI },
    { spot: 'lk8', ...LOCKER_BOX, turn: Math.PI },
    { spot: 'r2_fa', kind: 'crate' },
    { spot: 'r5_fa', kind: 'crate' },
    { spot: 'r7_fa', kind: 'crate', turn: -HALF },
    { spot: 'ut_c', kind: 'crate' },
  ],
  cabin: [
    { spot: 'floor_a', kind: 'crate' },
    { spot: 'floor_c', kind: 'crate' },
    { spot: 'floor_d', kind: 'crate', w: 0.8, d: 0.6 },
  ],
  commune: [
    // (a floor in each of the four houses)
    { spot: 'h1_fa', kind: 'crate' },
    { spot: 'h2_fa', kind: 'crate' },
    { spot: 'h3_fa', kind: 'crate' },
    { spot: 'h4_g_a', kind: 'crate' },
  ],
  starter: [
    // (the living room's floor, the kitchen's, the garage's, the bedroom's upstairs)
    { spot: 'lv_fa', kind: 'crate' },
    { spot: 'kt_fa', kind: 'crate' },
    { spot: 'gr_fc', kind: 'crate', w: 0.8, d: 0.6 },
    { spot: 'bd_fa', kind: 'crate' },
  ],
  camp: [
    // (in each of the four tents)
    { spot: 't0_b', kind: 'crate', w: 0.7, d: 0.6 },
    { spot: 't1_b', kind: 'crate', w: 0.7, d: 0.6 },
    { spot: 't2_b', kind: 'crate', w: 0.7, d: 0.6 },
    { spot: 't3_b', kind: 'crate', w: 0.7, d: 0.6 },
  ],
  factory1: [
    // (the hall's floor on its loading dock)
    { spot: 'f_06', kind: 'crate' },
    { spot: 'f_10', kind: 'crate' },
    { spot: 'f_19', kind: 'crate' },
    { spot: 'f_27', kind: 'crate' },
  ],
  factory2: [
    // (the warehouse's floor between its shelving)
    { spot: 'f_b', kind: 'crate' },
    { spot: 'f_e', kind: 'crate' },
    { spot: 'f_l', kind: 'crate' },
    { spot: 'f_m', kind: 'crate' },
  ],
  factory3: [
    // (a floor of each of its three storeys, the ground floor's twice)
    { spot: 'f0_5', kind: 'crate' },
    { spot: 'f0_2', kind: 'crate' },
    { spot: 'f1_6', kind: 'crate' },
    { spot: 'f2_9', kind: 'crate' },
  ],
  containeryard: [
    // (inside four of the containers, behind their doors: along each, what has no room towards its middle)
    { spot: 'c1_c', kind: 'crate', turn: -HALF, w: 0.9, d: 0.7 },
    { spot: 'c4_c', kind: 'crate', turn: 0, w: 0.9, d: 0.7 },
    { spot: 'c6_c', kind: 'crate', turn: Math.PI, w: 0.9, d: 0.7 },
    { spot: 'c8_c', kind: 'crate', turn: -0.39, w: 0.9, d: 0.7 },
  ],
  radiostation: [
    // (the operator's desk, two lockers, the shelf by them)
    { spot: 'desk_d', kind: 'desk', floor: 0, turn: 0, w: 0.6, d: 0.4 },
    { spot: 'lk4', ...LOCKER_BOX, turn: Math.PI },
    { spot: 'lk12', ...LOCKER_BOX, turn: Math.PI },
    { spot: 'shelf_a', ...BOARD_BOX, turn: Math.PI, w: 0.6 },
  ],
  windfarm: [
    // (each kiosk's lower board, the ground by each tower's door)
    { spot: 'kiosk_a_102_1', ...BOARD_BOX, turn: Math.PI, w: 0.6 },
    { spot: 'kiosk_b_102_1', ...BOARD_BOX, turn: Math.PI, w: 0.6 },
    { spot: 'g_a05', kind: 'crate', w: 0.6, d: 0.5 },
    { spot: 'g_b06', kind: 'crate', w: 0.6, d: 0.5 },
  ],
  watertower: [
    // (the ground under it, the tank's floor up the ladder)
    { spot: 'g_b', kind: 'crate', w: 0.6, d: 0.5 },
    { spot: 'g_d', kind: 'crate', w: 0.8, d: 0.6 },
    { spot: 't_c', kind: 'crate', w: 0.8, d: 0.6 },
  ],
  watchtower: [
    // (the cabin up the stairs, the ground under it)
    { spot: 'c_d', kind: 'crate', w: 0.8, d: 0.6 },
    { spot: 'g_a', kind: 'crate', w: 0.8, d: 0.6 },
    { spot: 'g_b', kind: 'crate', w: 0.8, d: 0.6 },
  ],
};

/** a building's boxes as the world lays them (its spots': where, how high, how big) */
function boxesOf(id: string, g: CardGeo): PrefabBox[] {
  const spots = new Map(g.spots.map((sp) => [sp.name, sp]));
  return (ND_BOXES[id] ?? []).map((b) => {
    const sp = spots.get(b.spot);
    if (!sp) throw new Error(`the box of ${id} at '${b.spot}': the card has no such spot`);
    const top = b.floor !== undefined;
    const y0 = top ? b.floor! : sp.y;
    const shelf = sp.y - y0;
    const w = b.w ?? (top ? 0.7 : 1.0);
    const d = b.d ?? (top ? 0.4 : 0.8);
    // (a top's room over it: its height over its base is the top's and that room, less the 0.6 m an open box allows — places.ts)
    return { spot: b.spot, kind: b.kind, u: sp.u, v: sp.v, y0, shelf, hx: w / 2, hz: d / 2, h: top ? shelf + (b.clear ?? 0.7) - 0.6 : 1.2, solid: top, turn: b.turn ?? Math.PI };
  });
}

/**
 * The room a vehicle to find needs beside a building (game/modcar/wrecks.ts freeSpot): the biggest the plan finds (the
 * Whale, 6.84 m long) clear of it by half its length and 1.2 m either way, a step of the search's grid (1.5 m) to land on
 */
const VEHICLE_CLEAR = 6.84 / 2 + 1.2;

/**
 * The sorts of place a vehicle to find is put at (core/modcar/schedule.ts VEHICLE_PLACES, as Nomad Drive's buildings
 * have them: the filling station, the homes, the camp, the works): a building of one of these has a yard; the towers
 * stand alone, a vehicle never at them
 */
const YARD_KINDS: ReadonlySet<SiteKind> = new Set<SiteKind>(['house', 'station', 'camp', 'works']);

/**
 * A big place's yard (core/world/prefabs.ts PrefabCard.yard): levelled ground at one end, as long as a vehicle to find
 * needs to stand clear of the building, of what stands out of its footprint and of its things (their spots); none for
 * the others
 */
function yardOf(b: NdBuilding): number {
  const g = b.geo;
  if (!YARD_KINDS.has(b.siteKind)) return 0;
  // (how far what stands low by it — its solids, its spots — reaches out beyond its footprint along the road)
  let out = 0;
  for (const s of g.solids) {
    if (s.y0 + (g.plinth ?? 0) > 2.6) continue;
    const t = s.turn ?? 0;
    const hz = s.hz || s.hx;
    for (const [a, c] of [[-s.hx, -hz], [s.hx, -hz], [-s.hx, hz], [s.hx, hz]]) out = Math.max(out, Math.abs(s.u + Math.cos(t) * a - Math.sin(t) * c) - g.w / 2);
  }
  for (const sp of g.spots) if (sp.y < 2.6) out = Math.max(out, Math.abs(sp.u) + 0.3 - g.w / 2);
  return Math.ceil((2 * VEHICLE_CLEAR + 1.5 + out - b.margin) * 2) / 2;
}

/** an ND building as a prefab card (core/world/prefabs.ts) */
export function cardOf(id: string, b: NdBuilding): PrefabCard {
  const g = b.geo;
  const boxes = boxesOf(id, g);
  const yard = yardOf(b);
  return {
    id,
    siteKind: b.siteKind,
    ...(b.sort ? { sort: b.sort } : {}),
    w: g.w,
    d: g.d,
    h: g.h,
    setback: b.setback,
    margin: b.margin,
    // (a card that does not say: its floor on the levelled ground)
    plinth: g.plinth ?? 0,
    ground: b.ground,
    solids: g.solids,
    ...(g.wrecks?.length ? { wrecks: g.wrecks } : {}),
    ...(boxes.length ? { boxes } : {}),
    ...(yard > 0 ? { yard } : {}),
    furnish: (seed, s, out, skip) => furnishOf(b, seed, s, out, skip),
  };
}

// (the ND kinds the cards furnish with are in the catalogue before any world is made)
registerNdItems();
for (const [id, b] of Object.entries(ND_BUILDINGS)) registerPrefab(cardOf(id, b));
