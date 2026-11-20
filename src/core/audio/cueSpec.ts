/**
 * The recordings the game plays from the sound archive (docs/V3/nodes/M4-audio.md): each cue is a name the game
 * plays by (foley.ts's sounds, sometimes with a variant after a colon: `door_open:fridge`, `step:snow`), and the
 * recordings that are it, found in the archive's catalogue (全部可用音频.json) by the game they were recorded for
 * (A: Arctic Drive, L: Long Drive North) and a pattern their names match whole (no `.wav`). The radio's stations
 * are lists of its songs the same way.
 *
 * Only these names are in the repository: the recordings stay where the archive is, read from there by the dev
 * server (vite.config.ts audioArchive), and a game without them plays its own synthesized sounds as before.
 */

export interface CuePick {
  /** the game the recording was made for: A Arctic Drive, L Long Drive North */
  lib: 'A' | 'L';
  /** a pattern (RegExp source) the recording's name matches whole, without its extension */
  name: string;
  /** and, when two recordings share a name, a pattern its file's name (without its extension) matches whole */
  file?: string;
}

const A = (name: string, file?: string): CuePick => ({ lib: 'A', name, ...(file ? { file } : {}) });
const L = (name: string): CuePick => ({ lib: 'L', name });
/** a numbered run: `stem_01`, `stem_2`, `stem-3`, `stem 4` (or the stem alone) */
const n = (stem: string): string => `${stem}([-_ ]?\\d+)?`;

/**
 * The cues. A foley sound (foley.ts) plays the first of `kind:variant`, `kind` the archive has, else its own
 * synthesized one; the sounds that are new with the archive (footsteps, the weather's beds, getting in) play only
 * from it.
 */
export const CUE_SPEC: Readonly<Record<string, readonly CuePick[]>> = {
  // ---- the vehicle's body
  door_open: [A(n('vehicle_door_generic_open')), L(n('LDN_RV_Door_Open'))],
  door_close: [A(n('vehicle_door_generic_close')), L(n('LDN_RV_Door_Close'))],
  'door_open:fridge': [A(n('item_fridge_door_open'))],
  'door_close:fridge': [A(n('item_fridge_door_close'))],
  'door_open:cage': [A(n('item_cabin_metal_open'))],
  'door_close:cage': [A(n('item_cabin_metal_close'))],
  hood_open: [A(n('vehicle_hood_open')), L(n('LDN_RV_Hood_Open'))],
  hood_close: [A(n('vehicle_hood_close')), L(n('LDN_RV_Hood_Close'))],
  trunk_open: [L(n('LDN_RV_LightDoor_Open'))],
  trunk_close: [L(n('LDN_RV_LightDoor_Close'))],
  handbrake_pull: [A(n('Vehicle_Car_HandBrake'))],
  handbrake_release: [A(n('Handbrake-Click'))],
  switch: [L(n('LDN_RV_InteriorLight_On')), L(n('LDN_RV_InteriorLight_Off'))],
  'crash:small': [A(n('vechicle_impact_small'))],
  'crash:medium': [A(n('vechicle_impact_medium'))],
  'crash:big': [A(n('vechicle_impact_big'))],
  'crash:massive': [A(n('vechicle_impact_massive'))],
  /** sitting down in a seat, getting up out of it (new: over the door) */
  car_getin: [A(n('action_car_getin'))],
  car_getout: [A(n('action_car_getout'))],

  // ---- the tyres (tyreSound.ts), as recorded: the asphalt's squeal (a slide; a driven wheel spinning plays it
  // lower), the gravel's crunch and its slide. The rest of the surfaces have no recordings: synthesized.
  skid_asphalt: [L('AsphaltSkidNoise')],
  roll_gravel: [A('vehicle_tires_loop_gravel')],
  skid_gravel: [A('vehicle_tire_braking_gravel')],

  // ---- the body (Arctic Drive's own): relieving oneself — the start, the stream on what it falls on, the end,
  // and a sigh of relief; out of breath — a pant at a time, fast and then slower, and the breath got back; the heart
  'pee_start': [A('Action-Pee', '.*__w403325015')],
  'pee_end': [A('Action-Pee', '.*__w875654566')],
  'pee:concrete': [A('player_action_pee_concrete')],
  'pee:metal': [A('player_action_pee_metal')],
  'pee:wood': [A('player_action_pee_wood')],
  'pee:snow': [A('player_action_pee_snow')],
  'pee:toilet': [A(n('ActionPeeingToiletLoop'))],
  pee_relief: [A(n('player_pee'))],
  breath_fast: [A(n('player_exhausted_fast'))],
  breath_slow: [A(n('player_exhausted_slow'))],
  breath_end: [A(n('player_action_exhausted_end'))],
  heartbeat: [L('heartbeat')],

  // ---- things picked up, set down, fitted (by their weight: foley.ts massClass, see cueVariant)
  'part_pickup:light': [L(n('LDN_Item_Small_Pickup'))],
  'part_pickup:medium': [L(n('LDN_Tools_Generic_Pickup')), A(n('item_pickup_metal_solid'))],
  'part_pickup:heavy': [L(n('LDN_Item_Large_Pickup')), A(n('item_pickup_metal_big_rattly'))],
  'part_setdown:light': [L(n('LDN_Item_Small_Release'))],
  'part_setdown:medium': [L(n('LDN_Tools_Generic_Place'))],
  'part_setdown:heavy': [L(n('LDN_Item_Large_Place')), A(n('item_decoration_heavy_place'))],
  part_install: [L(n('LDN_Tools_Generic_Install')), L(n('LDN_RV_Item_Install'))],
  part_remove: [L(n('LDN_RV_Item_Remove')), A(n('item_decoration_light_remove'))],
  /** what a thing is, picked up (ModGame.sound: by the thing in the hands) */
  'pickup:bottle': [A(n('PickupBottle'))],
  'pickup:can': [A(n('item_pickup_sodacan'))],
  'pickup:bag': [A(n('item_pickup_bag_chips')), A(n('item_pickup_bag_plastic'))],
  'pickup:paper': [A(n('item_pickup_paper')), A(n('item_pickup_book'))],
  'pickup:box': [A(n('item_pickup_box_cardboard'))],
  'pickup:keys': [A(n('item_pickup_keys'))],
  'pickup:gascan': [A(n('item_pickup_gascan_full')), A(n('item_pickup_gascan_empty'))],
  'pickup:glass': [A(n('item_pickup_glass'))],
  'pickup:plastic': [A(n('item_pickup_plastic_small')), A(n('pickup-plastic'))],
  'pickup:cloth': [A(n('throw_cloth_layer'))],

  // ---- the body
  /** a meal eaten: chewing, the whole of it (played once, at the first bite) */
  eat: [A(n('player_action_eating')), L(n('LDN_Player_Eat'))],
  gulp: [L(n('LDN_Food_Liquid_Drink'))],
  cap_open: [A(n('item_plastic_cap_open')), A(n('item_bottle_beer_open'))],
  pills: [A(n('pills_swallow'))],
  hurt: [L(n('LDN_Player_Voice_Pain'))],
  cloth: [A(n('player_clothes_wear_long'))],

  // ---- roadside places: containers, doors, the pumps
  'container_open:wood': [A(n('item_cabinet_open')), A(n('item_drawer_open'))],
  'container_open:crate': [A(n('item_pickup_wood_big_creaky'))],
  'container_open:metal': [A(n('item_cabin_metal_open')), L(n('LDN_RV_PropaneStorage_Open'))],
  'container_open:card': [A(n('item_pickup_box_cardboard'))],
  'container_open:cloth': [A(n('throw_cloth_layer'))],
  'container_close:wood': [A(n('item_cabinet_close')), A(n('item_drawer_close_ending'))],
  'container_close:crate': [A(n('item_phy_impact_wood_big_creaky'))],
  'container_close:metal': [A(n('item_cabin_metal_close')), L(n('LDN_RV_PropaneStorage_Close'))],
  door_house_open: [A(n('item_door_normal_open')), L(n('LDN_Door_Wooden_Open'))],
  door_house_close: [A(n('item_door_normal_close')), L(n('LDN_Door_Wooden_Close'))],
  pump_lift: [A(n('Action-FillingUp-Gas-OneShot'))],

  // ---- the workshop
  craft_start: [A(n('crafting_start'))],
  craft_done: [A(n('crafting_complete'))],
  hammer_swing: [A(n('crafting_hammer_swing'))],
  'hammer_hit:metal': [A(n('crafting_hammering_metal_big_solid')), A(n('crafting_hammering_metal_big'))],

  // ---- loops
  'pour:water': [A(n('pour_water_to_container_loop'))],
  'pour:fuel': [A(n('Action-FillingUp-Gas-Loop'))],
  pump_run: [A(n('Action-FillingUp-Gas-Loop'))],

  // ---- on foot (new): a footfall on what is under the feet, the push off a jump, a landing
  'step:dirt': [L(n('LDN_Player_Footstep_Dirt_Step'))],
  'step:gravel': [L(n('Footsteps_Gravel_Run'))],
  'step:snow': [L(n('LDN_Player_Footstep_Snow_Step'))],
  'step:carpet': [L(n('LDN_Player_Footstep_Carpet'))],
  'step:wood': [A(n('player_footstep_wood'))],
  'step:concrete': [A(n('Footstep-Concrete'))],
  'step:metal': [A(n('FootStep-Metal'))],
  'jump:dirt': [L(n('LDN_Player_Footstep_Dirt_Jump'))],
  'jump:snow': [L(n('LDN_Player_Footstep_Snow_Jump')), A(n('player_jump_snow'))],
  'jump:carpet': [L(n('LDN_Player_Footstep_Carpet_Jump'))],
  jump: [L(n('LDN_Player_Footstep_Jump')), A(n('player_jump_general'))],
  'land:dirt': [L(n('LDN_Player_Footstep_Dirt_Land'))],
  'land:snow': [L(n('LDN_Player_Footstep_Snow_Land')), A(n('footsteps_land_snow'))],
  'land:carpet': [L(n('LDN_Player_Footstep_Carpet_Land'))],
  'land:wood': [A(n('footsteps_land_wood'))],
  land: [L(n('LDN_Player_Footstep_Land'))],
  /** a hard fall (new): the body thumping down */
  'land:hard': [A(n('footsteps_land_impact_low')), A(n('footsteps_land_impact_medium'))],

  // ---- the weather and the country round one (audio/ambience.ts): beds that loop, thunder that rolls
  'bed:wind_light': [L('LDN_Wind_Light')],
  'bed:wind_heavy': [L('LDN_Wind_Heavy')],
  'bed:blizzard': [L('mixkit-blizzard-cold-winds-\\d+')],
  'bed:rain_light': [L('LDN_Weather_Rain_Light')],
  'bed:rain_heavy': [L('LDN_Weather_Rain_Heavy_Exterior')],
  /** green country by day and by night: birds, then crickets and an owl */
  'bed:day': [L('LDN_Ambience_Day')],
  'bed:night': [L('LDN_Ambience_Night')],
  /** dry country: a warm, still air with insects; at night a quiet wind */
  'bed:day_desert': [L('mixkit-desert-ambience-\\d+')],
  'bed:night_desert': [A('Wind-Quiet2-Ambient')],
  /** cold, high country: thin wind, no birds */
  'bed:day_alpine': [A('Wind-Quiet-Ambient')],
  'bed:night_alpine': [A('Wind-Quiet2-Ambient')],
  thunder: [L(n('LDN_Weather_Thunder_Moderate')), A(n('enviro_thunder'))],
  'thunder:near': [A(n('lightning_close'))],

  // ---- the radio
  radio_static: [L('Static \\d+')],
  radio_tune: [A(n('Radio-Changing-Station'))],
};

/**
 * What a thing of the game's catalogue sounds like picked up (`pickup:<what>` above), by its id: a packet, a tin,
 * a glass bottle, a plastic one, clothes, a box; null for the rest, which are picked up by their weight
 * (foley.ts part_pickup).
 */
export function pickupOf(item: string): string | null {
  if (/^food_(fish_can|dog_old|cat_old)$/.test(item) || /^drink_(soda|cola|energy)$/.test(item)) return 'can';
  if (/^food_/.test(item) || /^med_warm/.test(item)) return 'bag';
  if (/^drink_(beer|spirit)$/.test(item)) return 'bottle';
  if (item === 'drink_water' || /^med_pain/.test(item) || /^junk_(crate_plastic|bucket|bucket_old|bucket_paint|bin|cone|food_bucket)$/.test(item)) return 'plastic';
  if (/^(wear|pack)_/.test(item) || /^junk_(pillow|pillow_s|bag|bag_s)$/.test(item)) return 'cloth';
  if (/^junk_(mug|plate|candle)$/.test(item)) return 'glass';
  if (/^med_kit/.test(item) || /^crate_/.test(item) || item === 'junk_box_food') return 'box';
  return null;
}

export interface StationSpec {
  /** what the dial says */
  name: string;
  en: string;
  songs: readonly CuePick[];
}

/** a song by its file's name (the catalogue's, without `.wav`) */
const song = (lib: 'A' | 'L', title: string): CuePick => ({ lib, name: title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') });

/**
 * The radio's five stations (as many as the old synthesized songs: a set's dial, a TV's channels and a record's
 * label count them, radio.ts), each a list of the archive's songs played one after another round the clock, as
 * if on air: every set tuned to a station hears the same song at the same place in it.
 */
export const STATIONS: readonly StationSpec[] = [
  {
    name: '乡村之声',
    en: 'Country',
    songs: [
      song('L', 'american-heartland-371219'),
      song('A', 'Philip Ravenel - Joyful Countryside'),
      song('L', 'backroads-country-music-381194'),
      song('A', 'ES_Tumbleweed - Roots and Recognition'),
      song('L', 'cinematic-country-loop-western-theme-266525'),
      song('A', 'legacyAlli - RF Country Landscape'),
      song('L', 'country-music-347561'),
      song('A', 'ES_Small Town Talk (Instrumental Version) - Northside'),
      song('L', 'country-on-the-menu-111330'),
      song('A', 'ES_Dragonfly - Roots and Recognition'),
      song('L', 'country-rock-349183'),
      song('A', 'ES_Trails of Yesterday - Johan Glossner'),
      song('A', 'ES_Greatness on Me (Instrumental Version) - Witchitaw Slim'),
    ],
  },
  {
    name: '古典音乐台',
    en: 'Classical',
    songs: [
      song('A', '1877_peer-gynt-suite-no-1-op-46-i-morning'),
      song('A', '245_aya-higuchi-nocturne-op-9-no-2-pd'),
      song('A', 'Tchaikovsky-SwanLake-Op20-Act-II-Pt1'),
      song('A', '1877_peer-gynt-suite-no-1-op-46-iii-anitras-dream'),
      song('A', 'Symphony-No-40-in-G-Minor-K-550-IV-Allegro-assai'),
      song('A', 'Tchaikovsky-TheNutcrackerSuite-ActI-No8-WaltzOfTheFlowers'),
      song('A', '1877_peer-gynt-suite-no-1-op-46-iv-in-the-hall-of-the-mountain-king'),
      song('A', 'AweofWinter-SleddersMainTheme'),
      song('A', 'Wagner-GrandFantasieFromDieWalkurie'),
    ],
  },
  {
    name: '公路摇滚',
    en: 'Road rock',
    songs: [
      song('A', "ES_Sick Man's Blues - Peter Crosby"),
      song('A', 'JMHBM - Long Way Home'),
      song('A', "ES_School of Life - Rockin' For Decades"),
      song('A', 'JMHBM - Harley Davidson'),
      song('A', "ES_Ain't No Mercy Here - Def Lev"),
      song('A', 'JMHBM - Baby Girl'),
      song('A', 'Positive Instrumental Rock Music by Wayne John Bradley'),
      song('A', 'JMHBM - Stampede'),
      song('A', 'ES_Heavy Lungs - Non-State Actor'),
      song('A', 'Formation Sound - Upward Climb'),
    ],
  },
  {
    name: '霓虹电台',
    en: 'Neon FM',
    songs: [
      song('A', 'LMMS - 1986 Highway'),
      song('A', 'ES_Pink Vortex - ELFL'),
      song('A', 'ULTRAWAVE - Oceandrive'),
      song('A', 'ES_Daytona Dystopia - Dylan Sitts'),
      song('A', 'Jol3x - Electro House 2017'),
      song('A', 'ES_Night Surfing - OTE'),
      song('A', 'Punch Deck - Restabilized'),
      song('A', 'ES_LAX2DUBAI - Ballpoint'),
      song('A', 'HOME - We’re Finally Landing'),
    ],
  },
  {
    name: '深夜频道',
    en: 'Late night',
    songs: [
      song('A', 'HoliznaPATREON - LoFidelty Drama5'),
      song('A', 'ES_2AM - Ben Elson'),
      song('A', 'ES_Velvet - Dylan Sitts'),
      song('A', 'ES_2 iced out! (Instrumental Version) - Enophi'),
      song('A', 'Ketsa - Unkown Causes'),
      song('A', 'ES_take down (Instrumental Version) - Relyae'),
      song('A', 'ES_Dream Chasing - Mizlo'),
      song('A', "ES_Satisfied (Instrumental Version) - I'MIN"),
      song('A', 'Alex Productions - PRAY'),
      song('A', 'ES_At the Crack of Dawn - Emanuel Wilde'),
    ],
  },
];
