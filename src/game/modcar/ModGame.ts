/**
 * ModGame: the game with the modular vehicles (docs/MODCAR.md §8). It starts in the workshop — build a
 * car out of what lies about, then drive out of the door onto the road — and reuses everything the
 * world already has: renderer, environment, terrain and roads, the first-person rig, input and sound.
 *
 * Places: 'garage' (the workshop stage) and 'road' (the world). Driving past the workshop's apron
 * fades out and puts the vehicle on the road with the same build.
 */
import * as THREE from 'three';
import { FirstPersonRig } from '../../core/camera/rig';
import { allInstances, decodeBuild, encodeBuild, missingMounts, newInstance, fitSub, stockBuild, stockTireFor } from '../../core/modcar/build';
import { frameDef } from '../../core/modcar/frames';
import { partDef, PARTS, staysClean } from '../../core/modcar/parts';
import { ND_GRINDER } from '../../core/v3/nd/items';
import { cleanerOf, newTool, toolModelId } from '../../core/modcar/tools';
import { paintHex } from '../../core/modcar/palette';
import { nozzleOf, SPRAY_TIERS, sprayFound, sprayLeft, sprayTier, sprayUse, takesPaint, type SprayResult } from '../../core/modcar/paint';
import { COAT_WET_S, Coats, takesCoat, type Coat } from './coat';
import { itemNow } from './itemTime';
import { gradesOn, isRare, type WreckRoll } from '../../core/modcar/wrecks';
import type { Build, PartDef, PartInstance, Text } from '../../core/modcar/types';
import { GroundLand } from '../../core/onfoot/land';
import { SpineSample } from '../../core/world/spine';
import { BiomeBlend } from '../../core/world/spine';
import { groundField } from '../../core/world/groundField';
import { TerrainPoint, World } from '../../core/world/terrain';
import { GroundSample, Surface, SURFACES, type Ground } from '../../core/world/ground';
import { Push, pushOut, Solid } from '../../core/world/solids';
import { AudioEngine } from '../audio';
import { Environment } from '../env/environment';
import { Splashes, type SplashVehicle } from '../env/splash';
import { Hud } from '../hud';
import { InputManager } from '../input';
import type { Params } from '../params';
import { applyGhost, carEnvUniforms } from '../render/carMaterials';
import { RenderCore } from '../render/core';
import { meadowUniforms, PRESSED } from '../render/meadowMaterial';
import { pressUniforms } from '../render/press';
import { globals } from '../render/shaderlib';
import { LandmarkView } from '../scene/landmarks';
import { GeothermalView } from '../scene/geothermal';
import { SpireView } from '../scene/spires';
import { WonderView } from '../scene/wonders';
import { SpireSolids } from '../../core/world/earth/spires';
import { WaterfallView } from '../scene/waterfalls';
import { SkyFlocks } from '../scene/skyFlocks';
import { FishView } from '../scene/fishView';
import { HeroPeakView } from '../scene/heroPeaks';
import { GlacierView } from '../scene/glaciers';
import { WorldView } from '../scene/worldView';
import { BeaconView } from '../scene/beacons';
import { cloneModel, frameModel, itemGlb, panelPaint, partModel, preload, seatTyres, standInFrame, toolGlb } from './assets';
import { TONE_COLOUR } from './cards';
import type { Dock } from './held';
import type { Action } from './hudItems';
import { LiquidStream } from './stream';
import { PartThumbs } from './thumbs';
import { DevPanel, type DevHost, type DevItem, type DevPoint } from './devPanel';
import { Tune } from './devTune';
import { DevWorld } from './devWorld';
import { buildGarage } from './garage';
import { buildGarageStub, type GarageContext, type GarageDevice, type GarageScene } from './garageStub';
import { EngineVoice, loadBank } from './engineAudio';
import { cueKeys, Foley, FOLEY_LOOPS, FOLEY_SHOTS, type FoleyLoop, type FoleyOpts, type FoleyShot, type PanelMaterial } from './foley';
import type { SurfaceId } from '../../core/world/ground';
import { openArchive } from './soundArchive';
import { Ambience, type AmbienceInputs } from './ambience';
import { footfallGain, footingOf, type Footing } from '../../core/audio/footing';
import { pickupOf } from '../../core/audio/cueSpec';
import { BIOMES } from '../../core/world/biomes';
import { salvageOfHeld, Workshop, WORKSHOP_PLAN, type WorkshopSave } from './workshop';
import { MaterialsHud } from './vitalsHud';
import { blueprintOf, CHAPTER_KM, chapterAt, newStock, recipeDef, recipeOfBlueprint, sheetAt, stockOf, type Cost, type Stock } from '../../core/modcar/crafting';
import type { PaintAim, ScrubHit, Scrub, TankPort } from './player';
import { SprayMist } from './sprayMist';
import { modcarWorld, SeamlessGround, SeamlessLand } from './seamless';
import { prefabsAsked } from '../../core/world/prefabs';
import { rehome, savedWorldOf, stampWorld, WORLD_CHANGED, worldMoved } from './worldSave';
import { NEWEST_WORLD, type WorldVersion } from '../../core/world/rules';
import { ProvingGround } from '../../core/modcar/proving/layout';
import { ConeField, type ConeBody } from '../../core/modcar/proving/cones';
import { provingSolids } from '../../core/modcar/proving/props';
import { ProvingView } from './provingView';
import { ProvingSession, type SessionHost } from './provingSession';
import { ProvingHud } from './provingHud';
import { PlaceNames } from './placeNames';
import { onPlot } from './garageOutdoors';
import { SolidSet } from '../../core/world/solids';
import { Grime, unitAt, unitName, type GrimeMask, type GrimeOwner, type UnitLeft } from './grime';
import { FloorGround } from './floorGround';
import { Flakes } from './flakes';
import { triGrid } from '../render/triGrid';
import { forgetMasks, keepMask, keepOnly, keptMask } from './grimeStore';
import { ScrubHud } from './scrubHud';
import type { Cleaner, Tool } from '../../core/modcar/tools';
import { ASSIST_KEYS, ASSIST_LABELS, loadAssists, saveAssists, type Assists } from './assists';
import { MainMenu, type MenuHost, type MenuMode } from './menu';
import { loadSettings, saveSettings, type Settings } from './settings';
import { DIFFICULTY } from '../../core/modcar/difficulty';
import { PLACES_KEEP } from '../../core/modcar/loot';
import type { PlannedFind, ScheduledThing } from '../../core/modcar/schedule';
import { climateAhead, regionsAlong, type RoadRegion } from '../../core/modcar/lookahead';
import { rescueFinds, stockOf as stockOfFound, supplyFactors, type RescueState, type Stocks } from '../../core/modcar/needs';
import { FOOD } from '../../core/v3/kitchen/pantry';
import { kitBegun, kitHeld, kitOf, kitPicked, KITS, kitsPassed, kitWanting, thingKey, type KitsState, type PlacesAhead } from '../../core/modcar/kits';
import './scheduleCards';
import { HeldThing } from './held';
import { Radio, stationLabel } from './radio';
import { soundTab, type SoundStatus } from './soundTab';
import { clearSave, writeSave, type SaveV1, type SavedLoose } from './save';
import { hasItem, itemDef, itemMass, itemModelOf, itemPaint, newItem } from '../../core/modcar/items';
import { setItemClock } from './itemTime';
import { setItemCardFault } from './itemInfo';
import { backInTheWorld } from './save';
import { Sparks } from './sparks';
import { SeatShake, seatCushion, type ShakeEngine } from './seatShake';
import { ModPad, type PadHost } from './pad';
import { WheelDust } from './wheelDust';
import { tyreLoops } from './tyreSound';
import { itemStandIn, LooseThings, toolLook, toolModel, type Loose } from './loose';
import { CargoBay, carryOf, massOf } from './cargo';
import { CargoList, type CargoRow } from './cargoList';
import { boxInHand, boxOnMark, boxSource, guardedSource, HandsList, Listing, placeSource, selfSource, setListDesk, vehicleSource, type ListSource } from './listSources';
import { canSprint, crashDamage, cure as cureVital, drink as drinkVital, eat as eatVital, fallDamage, has as hasEffect, injure, medicate, mend as mendVital, newVitals, revive as reviveVital, sleep as sleepVitals, sleepHours, speedFactor, stepVitals, treat as treatVital, VITALS, type Vitals, type VitalsEvents, type VitalsRules } from '../../core/modcar/vitals';
import { DayClock } from '../../core/env/time';
import { BUFFS, buffBodyMods, Buffs } from '../../core/v3/cooking/buffs';
import { airLines, newBodyMods, resetBodyMods, sleepy as sleepyNow } from '../../core/modcar/vitals';
import { difficultyOf, vitalsRules, type Difficulty } from '../../core/modcar/difficulty';
import { bareShell, KEPT_LAMP, KIT_GROUPS, kitStepsOf, mountsFilled, ROAD_MOUNTS, START_FRAME, START_JUNK, startParts, WATER_FULL, type KitGroup, type KitPart } from '../../core/modcar/startKit';
import { CarPage } from './carPage';
import { DeathCard, VitalsHud } from './vitalsHud';
import { agoText, clearRestores, pushRestore, restorePoints, useRestore } from './restore';
import { JournalBook } from './journal';
import type { NdCamera } from './v3/nd-camera/system';
import { activeSlot, clearSlot, exportSlot, importSlot, rotateBackups, setActiveSlot, slotHasSave, slotMeta, SLOTS, writeSlotMeta } from './slots';
import { cleanLook } from '../character/looks';
import type { DrinkLiquid, ItemInstance, WearSlot } from '../../core/modcar/items';
import { zoneOf, type ZoneId } from '../../core/modcar/cargo';
import { heldName, heldOf } from './player';
import { CarMaterials } from './materials';
import { ModPlayer, type Held, type PlayerHost } from './player';
import { glintsOf, WithoutWrecks, WreckGlints, Wrecks, type WreckHost } from './wrecks';
import { isContainer, Places, planPlaces, worldPlan, type PlaceContainer, type PlacesHost } from './places';
import { SiteArt } from './siteArt';
import { Doors } from './doors';
import { solidWithin, type SolidSource } from '../../core/world/solids';
import type { Site, SiteObject } from '../../core/world/sites';
import { Cockpit, passengerSeat, seatMount, type CockpitHost, type FrontSeat } from './cockpit';
import { Aboard } from './aboard';
import { aboardOf, roomRev, type BoardDoor } from '../../core/modcar/aboard';
import { ModUI } from './ui';
import { ModVehicle, visibleUp } from './vehicle';
import type { ModEnv } from '../../core/modcar/systems';
import { applyWheelMods } from '../../core/modcar/simlink';
import type { WorldTime } from '../../core/kernel/clock';
import type { GameContext, RadioSet, TabPage } from './kernel/context';
import type { HeldLook } from './kernel/heldUse';
import { Kernel } from './kernel/kernel';
import type { GameModule } from './kernel/modules';
import { HerInGame } from '../character/inGame';
import { ITEM_PATTERN } from '../../core/character/wardrobe';
import type { Wear } from '../character/wardrobeView';

/** converts the rig frame (+x forward, +z right) to a Three.js camera (−z forward, +x right) */
const QFIX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);

/** the sound archive's cues fetched as soon as it answers (the rest as they are first played): the car's body, things in the hands, the feet */
const ARCHIVE_WARM: readonly string[] = [
  'door_open', 'door_close', 'hood_open', 'hood_close', 'trunk_open', 'trunk_close', 'handbrake_pull', 'handbrake_release', 'switch',
  'part_pickup:light', 'part_pickup:medium', 'part_pickup:heavy', 'part_setdown:light', 'part_setdown:medium', 'part_setdown:heavy', 'part_install', 'part_remove',
  'step:dirt', 'step:gravel', 'step:concrete', 'step:wood', 'step:carpet', 'step:snow', 'jump', 'jump:dirt', 'land', 'land:dirt',
  'car_getin', 'car_getout', 'crash:small', 'crash:medium', 'gulp', 'eat', 'cap_open', 'pickup:can', 'pickup:bag', 'pickup:bottle', 'pickup:plastic',
  'container_open:wood', 'container_close:wood', 'container_open:crate', 'door_house_open', 'door_house_close',
  'breath_fast', 'breath_slow', 'breath_end', 'heartbeat',
  'skid_asphalt', 'roll_gravel', 'skid_gravel',
];
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

export type ViewMode = 'cockpit' | 'chase' | 'orbit';

export interface ModParams extends Params {
  /** garage (default) or road */
  start: 'garage' | 'road';
  /** a build in the text form of src/core/modcar/build.ts (the road start's vehicle) */
  build: string;
  /** the garage's first project: tutorial (default) or full (everything fitted) */
  project: 'tutorial' | 'full';
  /**
   * how the workshop is laid out for a new game: J5's (docs/V3/plan/growth.md §一 1–3: the Sugar Cube a bare shell, its
   * thirty parts about the room, nothing else but what the start needs) or the one before it (?kit=classic: the car
   * short of four parts, the fun parts on the shelves, the donor pickup, the motorcycle and the motorhome — the older
   * walkthroughs' garage)
   */
  kit: 'j5' | 'classic';
  /** a new game's difficulty (difficulty.ts): the menu's choice, or ?difficulty= (a save keeps its own) */
  difficulty: Difficulty;
  /** a new game's look of her (character/looks.ts): the menu's choice (a save keeps its own; absent: as she was made) */
  look?: { skin: number; helmet: number };
  /** which workshop: the real one (default) or the plain stand-in (?garage=stub) */
  garage: 'workshop' | 'stub';
  /** this is the player's game, kept in the browser (save.ts); not a test drive or the harness's run */
  keep: boolean;
  /**
   * Which version of the world's generator (core/world/rules.ts): the newest for a new game (NEWEST_WORLD: 7, the
   * journey in chapters down the scenic roads, begun gently — docs/V3/plan/finish.md §二) — the address may ask for an
   * older one (?world=6, … ?world=1, the worlds from before there were versions) — and a save's own for a game gone on
   * with
   */
  world: WorldVersion;
  /** how many regions of the registry the world knows: a save's own count, or the address's (?regions=); absent: the version's own — all there are now, for a new world of version 2 */
  regions?: number;
  /** play the sound archive's recordings where it is there (docs/V3/nodes/M4-audio.md); ?archive=0: the game's own synthesized sounds only */
  archive: boolean;
  /**
   * A test lot of prefab buildings along the road (?nd=cabin,motel or ?nd=all: core/world/prefabs.ts, docs/ND/PLAN.md),
   * read from the address every time (a save does not keep it); null: none, the world as it is
   */
  nd: string | null;
}

/** is the page driven by a test harness (Playwright, Puppeteer: navigator.webdriver) */
export function automated(): boolean {
  return typeof navigator !== 'undefined' && navigator.webdriver === true;
}

export function readModParams(base: Params, search: string = window.location.search): ModParams {
  const q = new URLSearchParams(search);
  const start = q.get('start') === 'road' ? 'road' : 'garage';
  const regions = Number(q.get('regions') ?? NaN);
  return {
    ...base,
    start,
    build: q.get('build') ?? 'stock:sedan',
    project: q.get('project') === 'full' ? 'full' : 'tutorial',
    // (a browser driven by the harness — navigator.webdriver — gets the start its older walkthroughs were written for, unless it asks for J5's)
    kit: q.get('kit') === 'classic' || (q.get('kit') !== 'j5' && automated()) ? 'classic' : 'j5',
    difficulty: difficultyOf(q.get('difficulty')),
    garage: q.get('garage') === 'stub' ? 'stub' : 'workshop',
    keep: false,
    world: q.get('world') === '1' ? 1 : q.get('world') === '2' ? 2 : q.get('world') === '3' ? 3 : q.get('world') === '4' ? 4 : q.get('world') === '5' ? 5 : q.get('world') === '6' ? 6 : q.get('world') === '7' ? 7 : NEWEST_WORLD,
    ...(Number.isInteger(regions) ? { regions } : {}),
    archive: q.get('archive') !== '0',
    nd: q.get('nd'),
    time: Number.isFinite(base.time) ? base.time : start === 'garage' ? 9.2 : base.time,
    weather: base.weather === 'auto' && start === 'garage' ? 'clear' : base.weather,
  };
}

/** a number 0…1 from a string (the same every time) */
/** where a new game's world seed waits for it (ModGame.newGame: a new world each new game) */
export const NEW_SEED_KEY = 'modcar.newSeed';
/**
 * The developer's keys — the parts bin (`), a new game at once (F9 twice), the numbers line (F3): on the developer's
 * own server and for the harness; in a build made to be played only when the address asks (?dev). docs/V3/plan/
 * finish.md §十四, the list before release.
 */
export const DEV_KEYS: boolean = (() => {
  try {
    if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) return true;
    return typeof location !== 'undefined' && new URLSearchParams(location.search).has('dev');
  } catch {
    return false;
  }
})();
/** … how she looks in it, the menu's choice (JSON of { skin, helmet }) */
export const NEW_LOOK_KEY = 'modcar.newLook';
/** … and a kept game gone on with from the menu's page of them: the page opened again goes straight on, no title */
export const GO_ON_KEY = 'modcar.goOn';
/** … and its difficulty, the menu's choice (its being there: the page opened again for the new game, no title) */
export const NEW_DIFFICULTY_KEY = 'modcar.newDifficulty';

/** a fire close by warms the air one feels no further than this (°C): a mild room's */
const FIRE_WARMS_TO = 22;
/** how long rust painted over without grinding takes to come all the way back through the coat (world s: three days) */
const COAT_BLEED_S = 3 * 86400;

/**
 * The look at the instruments (docs/V3/plan/finish.md §五): how long the mark rests on the plate before it counts
 * (s), how long off it before it is over, how long the wheel takes to fade and to come back, and how much bigger the
 * plate is then.
 */
const GAUGE_DWELL = 0.12;
const GAUGE_LEAVE = 0.3;
const GAUGE_IN = 0.15;
const GAUGE_OUT = 0.3;
const GAUGE_ZOOM = 1.4;
/**
 * The look at the instruments drawing the view in and fading the wheel: off, as the player chose in the UI restore of
 * 2026-11-26 (docs/V3/plan/finish.md §十八, 界面恢复) — the cab's instruments are read from where one sits, as in Nomad
 * Drive, the view as it is.
 */
const GAUGE_LOOK = false;

/** how long Q is held in a seat before one stands up (s; Nomad Drive's 0.35) */
const STAND_S = 0.35;
/** how long Q is held on foot before the thing in the hands is put out to be placed (a shorter press puts it down) */
const PLACE_HOLD_S = 0.3;
/** how strongly the dirt left shows while a cleaning tool is in the hands (the H pulse's full is 1) */
const GRIME_SHOW_HELD = 0.45;

function hash01(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

/** a build that has stood about: dust and rust on its body and every part, a little different each */
function weather(b: Build, dirt: number, rust: number, seed: number, crust = 0): void {
  b.dirt = dirt;
  b.rust = rust;
  b.crust = crust;
  for (const [mount, inst] of Object.entries(b.parts)) {
    const k = hash01(`${seed}:${mount}`);
    inst.dirt = Math.min(1, dirt * (0.7 + 0.6 * k));
    inst.rust = Math.min(1, rust * (0.5 + 1.0 * k));
    // (the crust where a barn's years settle: the panels, the bumpers, the lamps; not what was under the bonnet)
    const cat = partDef(inst.part).cat;
    const outside = ['door', 'hood', 'trunk', 'bumperFront', 'bumperRear', 'headlight', 'taillight', 'mirror', 'rim', 'roof'].includes(cat);
    if (crust > 0 && outside) inst.crust = Math.min(1, crust * (0.75 + 0.5 * k));
    for (const sub of Object.values(inst.sub)) {
      sub.dirt = inst.dirt;
      sub.rust = inst.rust * 0.5;
      if (inst.crust) sub.crust = inst.crust * 0.6;
    }
  }
}

/**
 * J5's workshop: where the Sugar Cube's parts that lie on the floor are (x, z, heading; the room's floor, the car
 * at 0.4, −0.25 with its nose to +x and the doors): the engine by its nose, the wheels by the tyre changer, the
 * seats along the shelves, the panels flat in the free end of the room by where one comes in, the bumpers in front
 * of the shelves. The rest go on the rack, the shelves and the charger (the garage's spots).
 */
const START_SPOTS: Record<string, [number, number, number]> = {
  engine: [2.6, -2.55, 0],
  hub_FL: [2.9, 2.35, 0],
  hub_FR: [4.4, 1.6, 0.4],
  hub_RL: [5.2, 3.3, -0.3],
  hub_RR: [5.3, 2.1, 0.2],
  // (the doors on the floor beside the car, each by where it goes)
  door_FL: [0.95, -2.2, 0],
  door_RL: [-0.3, -2.2, 0],
  door_FR: [0.95, 1.5, 3.14],
  door_RR: [-0.3, 1.5, 3.14],
  hood: [-3.3, -2.55, 1.57],
  trunk: [-2.85, -0.25, 1.57],
  seat_driver: [-1.95, 2.35, 2.0],
  seat_pass: [-0.75, 2.95, 1.6],
  seat_rear: [1.35, 3.0, -2.6],
  bumperFront: [-1.1, 3.75, 0],
  bumperRear: [0.6, 3.8, 0],
};

/** a step of the workshop's task board (the corner's list, the chalkboard): J5's with its group, its short word and how far it is */
export interface BoardStep {
  id: string;
  text: string;
  done: boolean;
  group?: KitGroup;
  /** the chalkboard's word for it */
  short?: string;
  /** so many of so many (the wheels 2/4) */
  n?: number;
  of?: number;
}

/** what keeps the cold out without any clothes on (the nightdress: docs/V3/plan/growth.md §四) */
const BASE_WARMTH = 4;

/** the old jacket and shoes one has on where a game does not begin in J5's workshop (and in a save from before J6) */
function oldClothes(): Partial<Record<WearSlot, ItemInstance>> {
  return { jacket: newItem('wear_jacket_torn'), shoes: newItem('wear_shoes_torn') };
}

/** what the first project car is missing: the things the checklist asks for, in order */
export const TUTORIAL_MISSING = ['battery', 'hub_FL', 'hub_RR', 'engine'] as const;

/** do two boxes on the plan overlap (a round post taken as its square)? */
function boxesMeet(a: { x: number; z: number; hx: number; hz: number; yaw: number }, b: { x: number; z: number; hx: number; hz: number; yaw: number }): boolean {
  const ext = (o: typeof a, ux: number, uz: number): number => {
    const hz = o.hz === 0 ? o.hx : o.hz;
    const c = Math.cos(o.yaw);
    const s = Math.sin(o.yaw);
    return Math.abs(o.hx * (c * ux + s * uz)) + Math.abs(hz * (-s * ux + c * uz));
  };
  for (const ang of [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2]) {
    const ux = Math.cos(ang);
    const uz = Math.sin(ang);
    if (Math.abs((b.x - a.x) * ux + (b.z - a.z) * uz) > ext(a, ux, uz) + ext(b, ux, uz)) return false;
  }
  return true;
}

/** the tyre the parts bin puts on a rim: its frame's factory tyre, else a road tyre (none on a wheel that is all rubber) */
function devTyreFor(def: PartDef): string | null {
  if (def.cat !== 'rim' || !def.rim?.tire) return null;
  const tag = def.tags?.find((t) => t.startsWith('stock:'));
  return (tag ? stockTireFor(frameDef(tag.slice(6))) : null) ?? 'tire_road';
}

/** something being cleaned (grime.ts): whose it is, its units as last measured, a unit's flash */
interface Cleaning {
  v: ModVehicle | null;
  /** a part lying about (and not on a vehicle) */
  loose: Loose | null;
  owner: string;
  key: string;
  label: string;
  kind: 0 | 1;
  units: UnitLeft[];
  measuredAt: number;
  dirty: boolean;
  flash: number;
  flashUnit: number;
}

/** what comes off as one cleans (linear colours): caked crust, crumbs of dust, rust, the sponge's foam */
const CRUST_BITS = new THREE.Color(0.12, 0.095, 0.07);
const GLASS_CRUST = new THREE.Color(0.16, 0.13, 0.1);
const DUST_BITS = new THREE.Color(0.32, 0.27, 0.21);
const RUST_BITS = new THREE.Color(0.38, 0.12, 0.035);
const FOAM = new THREE.Color(0.85, 0.88, 0.9);
/** how big a turbo is to the ear: 0 the small one … 1 the big one (by its boost) */
function turboSizeOf(partId: string): number {
  const boost = partDef(partId).turbo?.boost ?? 1.28;
  return Math.min(1, Math.max(0, (boost - 1.28) / (1.7 - 1.28)));
}

/** how fast the wipers take the dust off their arcs of the windscreen, sweeping the rain (the body's dirt figure a second) */
const WIPE_RATE = 0.15;

/** a few solids of the game's own (a roadside garage's machines) */
class SolidList implements SolidSource {
  readonly list: Solid[] = [];
  solidsNear(x: number, z: number, r: number, out: Solid[]): void {
    for (const sd of this.list) if (solidWithin(sd, x, z, r)) out.push(sd);
  }
}

export class ModGame implements PlayerHost, CockpitHost, DevHost, SessionHost, GameContext {
  readonly core: RenderCore;
  readonly env: Environment;
  readonly input: InputManager;
  readonly hud: Hud;
  readonly audio = new AudioEngine();
  readonly rig = new FirstPersonRig();
  /** the seat's shake on top of the head's sway: the road, the engine, the knocks (seatShake.ts) */
  readonly shake = new SeatShake();
  /** a gamepad's buttons for the hands, the lists, the bench and the seat (pad.ts; the sticks and the pedals are the shared input's) */
  readonly pad = new ModPad();
  private padHostObj: PadHost | null = null;
  private readonly felt: ShakeEngine = { running: false, rpm: 0, idle: 800, cylinders: 4, misfire: 0 };
  readonly ui = new ModUI();
  readonly mats = new CarMaterials();
  readonly vehicles: ModVehicle[] = [];
  readonly loose: LooseThings;
  /** the things stowed in the vehicles: their floors, where the held thing would go, what the load weighs */
  readonly cargo: CargoBay;
  readonly player: ModPlayer;
  /** the controls in the cab, worked with the mouse from the driver's seat */
  readonly cockpit = new Cockpit(this);
  /** what is in the hands, in first person */
  readonly heldThing: HeldThing;
  /** the player character (docs/V3/plan/character-pv.md): her body, drawn and posed from what the player does */
  readonly her: HerInGame;
  /** the right mouse button is down (take off; with a can, draw it back out) */
  rightButton = false;
  /** the left button, as it is now (in a seat: held on nothing of the cab's, sleep — docs/V3/plan/finish.md §十三) */
  leftButton = false;
  /** G held (by the harness; the keyboard's own is read from the input) */
  dropButton = false;
  /** the body (vitals.ts): life and health, stamina, food, water, energy, temperature */
  body: Vitals = newVitals();
  /** the materials (crafting.ts): shared counts the recycler gives and the bench takes */
  readonly stock: Stock = newStock();
  /** what one has learnt to make (recipe ids): from blueprints, learnt with the right button, kept for good and the same at every bench (docs/V3/plan/finish.md §六 2) */
  readonly learned = new Set<string>();
  /** the blueprint each of the plan's places has been found to have: its place's key → the recipe, and how far down the road it is (m) */
  private readonly sheets = new Map<string, { r: string; s: number }>();
  /** how the sets stand (core/modcar/kits.ts): which of each has been picked up, which step is out to be found */
  readonly kits: KitsState = {};
  /** the finds added to the plan as the game went (a set's steps): kept, and put back into the plan when the game is taken up */
  private readonly addedFinds: PlannedFind[] = [];
  /** what one is all but out of and has been promised at the next place (core/modcar/needs.ts) */
  private readonly rescue: RescueState = {};
  /** what one has of what one lives on, as last counted (stockNow) */
  private stockKept: { t: number; v: Stocks & { tankFrac: number; cansL: number } } | null = null;
  /** the things of the sets that have been in the hands already (each thing itself: another of its kind is another find) */
  private readonly kitSeen = new WeakSet<object>();
  private kitT = 0;
  /** the workshop's generator, recycler and bench (workshop.ts; in the garage) */
  workshop: Workshop | null = null;
  /** the workshop as last seen (kept through a trip down the road) */
  private workshopKept: WorkshopSave | undefined;
  private matHud: MaterialsHud | null = null;
  /** the grime masks of what is being cleaned (grime.ts) */
  private grime: Grime | null = null;
  /** the coats of paint sprayed on (coat.ts) */
  private coats: Coats | null = null;
  /** how much of each coated part is covered, as last measured, and when */
  private readonly coatCover = new Map<string, { dry: number; wet: number; at: number }>();
  /** the ring on the surface where the spray would land (the nozzle's size) */
  private sprayRing: THREE.Mesh | null = null;
  private readonly sprayColour = new THREE.Color();
  /** what is being cleaned: its units as last measured, when, a unit's flash as it comes clean */
  private readonly cleaning = new Map<string, Cleaning>();
  /** looks that came clean all over: their flash fading */
  private readonly lookFlashes: { look: import('../render/carMaterials').CarLook; t: number }[] = [];
  /** H: the dirt still left lit up (s to go) */
  private grimeShowT = 0;
  /** the dirt's light now (0…GRIME_SHOW_HELD), when the left button was last down, whether it is down */
  private showK = 0;
  private showDownAt = -1e9;
  leftDown = false;
  private flakes: Flakes | null = null;
  private scrubHud: ScrubHud | null = null;
  private readonly gcV = new THREE.Vector3();
  private readonly gcM = new THREE.Matrix4();
  /** the scrub's sound: its loop (kept through a pause), its level smoothed, how long the tool has been still */
  private scrubLoop: FoleyLoop | '' = '';
  private scrubGain = 0;
  private scrubStill = 1;
  private flakeTickT = 0;
  private warmedScrub = false;
  /** the spray can's mist (sprayMist.ts) */
  private mist: SprayMist | null = null;
  /** sprayed last frame (the valve opened, the hiss is on) */
  private sprayWas = false;
  /** the spray can in the hands last frame, and when each can was last shaken */
  private heldCanUid = '';
  private readonly shookAt = new Map<string, number>();
  private warmedSpray = false;
  /** said once: out of the yard onto the road */
  private saidOnRoad = false;
  private readonly nozV = new THREE.Vector3();
  private readonly nozD = new THREE.Vector3();
  private readonly canUp = new THREE.Vector3();
  /** at the bench: how far the view has gone over to it (0 … 1) */
  private benchB = 0;
  private readonly benchEye = new THREE.Vector3();
  private readonly benchAt = new THREE.Vector3();
  private readonly benchM = new THREE.Matrix4();
  private readonly benchQ = new THREE.Quaternion();
  private readonly wsEye = new THREE.Vector3();
  private devicesAll: GarageDevice[] | null = null;
  private vitHud: VitalsHud | null = null;
  private death: DeathCard | null = null;
  /** since one died (s; −1 alive); since the last restore point (s) */
  private deadT = -1;
  private restoreT = 0;
  /** sprinting now (blended for the view's widening) */
  private sprintB = 0;
  /** the view narrowed by the thing in the hands (kernel/heldUse.ts look().fov): how far in (eased 0 … 1), and to what */
  private heldZoomB = 0;
  private heldFov = 0;
  private jumpsSeen = 0;
  /** what is in a vehicle, as a list (Tab): the vehicle it is open on, the row picked */
  private cargoList: CargoList | null = null;
  /**
   * Beside a vehicle's list, what one has in the hands and the slots (docs/V3/nodes/M1-interact.md): its own
   * panel, its own row picked; `listSide` 0 when it is the one being worked (E puts the picked thing in), 1 the
   * vehicle's (E takes out)
   */
  private cargoListL: CargoList | null = null;
  private handsList: HandsList | null = null;
  private readonly listingL = new Listing();
  private listSelL = 0;
  private listSide: 0 | 1 = 1;
  private listV: ModVehicle | 'self' | PlaceContainer | ListSource | null = null;
  /** the Tab screen's pages beside the lists (GameContext.addTabPage: the recipes, the compendium), and the one open (−1: none) */
  private readonly tabPages: TabPage[] = [];
  private tabAt = -1;
  /** where the thing in the hands has the view look this frame (a rod with a fish on), or null (kernel/heldUse.ts look()) */
  private heldLookNow: HeldLook | null = null;
  private listSel = 0;
  /** the liquid going in from a can at a filler */
  readonly stream: LiquidStream;
  /** rain bursting on the ground and on the vehicles' tops */
  readonly splashes: Splashes;
  /** metal on the road */
  readonly sparks: Sparks;
  /** the dust the wheels throw up (wheelDust.ts) */
  readonly dust: WheelDust;
  /** the assists (F2) */
  readonly assists: Assists = loadAssists();
  private readonly sparkDue = new Map<ModVehicle, number>();
  /**
   * Where one is: in the workshop's yard ('garage') or out on the road. With the workshop a place in the world
   * (`seamless`, docs/MODCAR.md §17) it is only where one is, worked out every frame; with the stand-in garage
   * (?garage=stub) it is which of the two stages is loaded.
   */
  place: 'garage' | 'road';
  /** the workshop is a place in the world: one world, the road beginning at its gate, nothing faded or thrown away */
  readonly seamless: boolean;
  /** what the vehicles keep out of in the world: what stands by the road, and each other (not the garage's walls: keepIn) */
  private readonly vehicleSolids = new SolidSet();
  /** the wrecks by the road as vehicles one can take apart (wrecks.ts, docs/MODCAR.md §19); made with the world */
  wrecks: Wrecks | null = null;
  /** a rare part on a wreck catching the light */
  private glints: WreckGlints | null = null;
  /** the places by the road: their containers, pumps and things lying about (places.ts, docs/MODCAR.md §20) */
  places: Places | null = null;
  /** … and their things drawn as our models (siteArt.ts) */
  siteArt: SiteArt | null = null;
  /** … their buildings' doors (doors.ts) */
  doors: Doors | null = null;
  /** when the wrecks about were last looked over for a find close by (s), and the glint's level from it */
  private greetT = 0;
  private glintGain = 0;
  /** sounds to render before they are wanted, one a frame (a render can take tens of milliseconds) */
  private readonly warmQueue: [FoleyShot | FoleyLoop, FoleyOpts][] = [];
  private warmedTyres = false;
  /** the tyres' rolls rendered (the first time one sits in a vehicle) */
  private warmedRolls = false;
  /** how much of the shared road-noise bed the tyres' own sounds leave (tyreSound.ts), this frame */
  private roadLeft = 1;
  /** the tyres' loops this frame (tyreSound.ts) */
  private tyreNow: ReturnType<typeof tyreLoops> | null = null;
  private warmedWrecks = false;
  garage: GarageScene | null = null;
  /** how hard the journey is (difficulty.ts): a save's own, else the new game's */
  difficulty: Difficulty = 'normal';
  /** how she looks (character/looks.ts): a save's own, else the new game's */
  look = { skin: 0, helmet: 0 };
  /** seconds played (the menus and the nights slept through are none of it): kept with the game, shown on its card */
  playS = 0;
  /** the compendium's record beside the fish (journal.ts), and what the systems read of it (GameContext.journalBook) */
  readonly journal = new JournalBook();
  readonly journalBook = ((g: ModGame) => ({
    get rev(): number {
      return g.journal.rev;
    },
    sections: () => g.journal.sections(),
    picture: (key: string): Promise<string | null> => g.systems.get<NdCamera>('nd-camera')?.store.url(key) ?? Promise.resolve(null),
  }))(this);
  /** the card of the place the game is kept in is to be written again, with a picture of the next frame drawn */
  private cardDue = false;
  private cardShot: HTMLCanvasElement | null = null;
  /** what a good meal leaves behind for a while (core/v3/cooking/buffs.ts), and what it does to the body this step */
  readonly buffs = new Buffs();
  private readonly bodyMods = newBodyMods();
  /** the main menu (menu.ts): the title as the page opens, the pause in play */
  readonly menu: MainMenu;
  /** the player's settings (settings.ts) */
  settings: Settings = loadSettings();
  /** the game is being played (false while the title stands over a game not yet begun or gone on with) */
  private played = true;
  /** the key card is owed: the very first start, shown once the game begins */
  private helpDue = false;
  /** the body's rules at it */
  private vitalsR: VitalsRules = VITALS;
  /** how the workshop was laid out when the game began (ModParams.kit; a save from before J5: the classic one) */
  kit: 'j5' | 'classic' = 'j5';
  world: World | null = null;
  worldView: WorldView | null = null;
  landmarks: LandmarkView | null = null;
  /** a geothermal place's springs, vents, geyser and steam (V5, scene/geothermal.ts) */
  geothermal: GeothermalView | null = null;
  /** a place's spires: a pillar mountain's pillars, a karst's towers, a coast's sea stacks (V5, scene/spires.ts) */
  spires: SpireView | null = null;
  /** (G8) the great forms' water: a salt pan's mirror, a caldera's lake (scene/wonders.ts) */
  wonders: WonderView | null = null;
  /** a place's waterfalls down its steep land: a gorge's, a fjord's, a table mountain's (V5, scene/waterfalls.ts) */
  waterfalls: WaterfallView | null = null;
  /** the flocks of the sky far off: murmurations, skeins of geese, gulls, swifts, egrets (V7, scene/skyFlocks.ts) */
  skyFlocks: SkyFlocks | null = null;
  /** the fish in the shallow water near the car, and their leaps (V7, scene/fishView.ts) */
  fish: FishView | null = null;
  /** a stratovolcano's or a horn's own peak far off ahead (V9, scene/heroPeaks.ts) */
  heroPeaks: HeroPeakView | null = null;
  /** a glacier place's tongues of ice down its mountains (V9, scene/glaciers.ts) */
  glaciers: GlacierView | null = null;
  beacons: BeaconView | null = null;
  ground: Ground;
  /** the vehicle the player sits in (null on foot) */
  seated: ModVehicle | null = null;
  /** which front seat of it (docs/V3/nodes/M1-interact.md): from the passenger's one drives nothing */
  seatAt: FrontSeat = 'driver';
  /** the eye on its way between the seats: 0 the driver's, 1 the passenger's */
  private seatSlide = 0;
  private readonly seatEye = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  /** the vehicle the camera and the sound follow (the one last sat in) */
  focus: ModVehicle | null = null;
  viewMode: ViewMode;
  /** crouching on foot (C): kept until C again, or a seat taken */
  crouch = false;
  readonly orbit = { yaw: 0.6, pitch: 0.25, dist: 7, target: 0.8 };
  time = 0;
  /** checklist progress for the garage's first build */
  readonly done = new Set<string>();
  private fadeT = -1;
  private garageCtx: GarageContext | null = null;
  private readonly gs = new GroundSample();
  private readonly bl = new BiomeBlend();
  /** the mix the sky and the weather take: over a wider band about a border than the ground's (docs/V3/plan/finish.md §十二 4) */
  private readonly blSky = new BiomeBlend();
  /** the scenic stretches' names on the screen as one drives into them (a world of version 3) */
  private readonly placeNames = new PlaceNames();
  private readonly pr = { s: 0, d: 0 };
  private readonly chasePos = new THREE.Vector3();
  private chaseInit = false;
  /** a part just went on or came off: the view nods down a touch with its weight, then back (0-1) */
  private thunk = 0;
  private readonly basis = new Float64Array(9);
  private readonly qa = new THREE.Quaternion();
  private readonly qb = new THREE.Quaternion();
  private readonly eyeP = { x: 0, y: 0, z: 0 };
  /** pedals set by a script (the journey test, screenshots) instead of the keyboard */
  scripted: { steer: number; throttle: number; brake: number; handbrake: number } | null = null;
  private hbHeld = 0;
  private hbWasDown = false;
  private hbIgnore = false;
  readonly ready: Promise<void>;

  /** the developer's dials (devTune.ts) and the world tools that apply them */
  readonly tune: Tune;
  readonly devTools: DevWorld;

  // ------------------------------------------------------------------ the V3 kernel (docs/V3/nodes/N0-foundation.md)
  // What a V3 system plugs into. The game itself is the context every system is handed (kernel/context.ts);
  // the kernel's six parts stand here under the names the context gives them.

  /** the kernel: its parts, and what is done with them at the game's fixed moments (kernel/kernel.ts) */
  readonly kernel = new Kernel({
    now: () => performance.now(),
    // (a fault set apart is said in a line, but not into a screenshot)
    say: (text, seconds) => {
      if (!this.params.shot) this.ui.say(text, seconds);
    },
  });
  /** what happened, said and heard: the systems' events and the game's own (kernel/context.ts lists those) */
  readonly events = this.kernel.events;
  /** the systems and their hooks in the frame (preStep, step, lateUpdate), each timed against its budget */
  readonly systems = this.kernel.systems;
  /** each system's part of the save */
  readonly slices = this.kernel.slices;
  /** the world's time: saved, never backwards; it follows the hour the environment shows */
  readonly clock: WorldTime = this.kernel.clock;
  /** (things that go off read the same clock: itemTime.ts) */
  private readonly itemClockSet = setItemClock(this.kernel.clock);
  /** (a system's lines on an item's card that throw are reported like its other faults: itemInfo.ts) */
  private readonly cardFaultSet = setItemCardFault((where, e) => this.kernel.report(where, e));
  /** things in the world the mark finds and E works, from the systems (the player's pick asks it) */
  readonly interact = this.kernel.interact;
  /** the systems' tabs of the developer's panel */
  readonly devTabs = this.kernel.devTabs;
  /** the payload of body:drank, used again every frame a drink flows */
  private readonly drankEvent: { liquid: DrinkLiquid; litres: number } = { liquid: 'water', litres: 0 };

  constructor(
    canvas: HTMLCanvasElement,
    readonly params: ModParams,
    /** a game in progress to go on with (save.ts), or null for a new one */
    private readonly restore: SaveV1 | null = null,
    tune?: Tune,
    /** the V3 modules to install (the page hands in the ones kernel/discovery.ts found; none: the game as it is without them) */
    modules: readonly GameModule[] = [],
  ) {
    if (tune) this.tune = tune;
    else {
      this.tune = new Tune();
      this.tune.applyAll();
    }
    this.core = new RenderCore(canvas, params.quality);
    this.core.usePost = params.post;
    this.viewMode = params.view === 'chase' ? 'chase' : params.view === 'orbit' ? 'orbit' : 'cockpit';
    // (ModUI shows this game's own key card; the numbers line only with ?hud=1, F3 toggles it)
    this.hud = new Hud(typeof location !== 'undefined' && new URLSearchParams(location.search).get('hud') === '1', '');
    this.input = new InputManager(canvas);
    this.input.lookScale = this.settings.look;
    this.audio.setVolume(this.settings.volume);
    this.menu = new MainMenu(this.ui.root, this.menuHost());
    this.input.freeLook = true;
    this.env = new Environment(this.core, params.seed, { hour: params.time, weather: params.weather, stage: params.wstage, slow: true, world: params.world });
    this.env.shotMode = params.shot;
    // (the graphics card's context lost — a driver restarted, the machine woken: the game is kept as it is and said so;
    // given back, the page is opened again on the kept game, which makes everything of the picture anew)
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.save();
      this.saveOff = true;
      this.ui.say('显卡的画面丢了，进度已经存好，正在恢复……', 30);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      if (!this.params.shot) location.reload();
    });
    this.devTools = new DevWorld(this, this.tune);
    this.orbit.yaw = (params.orbit[0] * Math.PI) / 180;
    this.orbit.pitch = (params.orbit[1] * Math.PI) / 180;
    this.orbit.dist = params.orbit[2];
    this.orbit.target = params.orbit[3];
    this.place = params.start;
    this.kit = restore ? (restore.kit === 'j5' ? 'j5' : 'classic') : params.kit;
    this.setDifficulty(restore ? difficultyOf(restore.difficulty) : params.difficulty);
    this.setLook(restore ? restore.look : params.look);
    this.playS = restore?.playS ?? 0;
    this.journal.load(restore?.journal);
    this.input.invertY = this.settings.invertY;
    this.seamless = params.start === 'garage' && params.garage !== 'stub';
    if (params.start === 'garage') {
      this.garage = params.garage === 'stub' ? buildGarageStub(this.core) : buildGarage(this.core);
      this.ground = this.garage.ground;
      // (J5: the doors open once the car can start and drive)
      this.garage.doorLock = () => (this.kitReady() ? null : { zh: '车还开不了', en: 'The car cannot drive yet' });
    } else {
      this.makeWorld();
      this.ground = this.floored(this.proving!);
    }
    // the workshop in the world: the world made with it, the garage's ground on its plot, the world's beyond
    if (this.seamless && this.garage) {
      this.makeWorld();
      this.ground = this.floored(new SeamlessGround(this.garage.ground, this.proving!));
    }
    // (out in the world a thing let fall lands on the ground, or on a floor above it — a porch, a jetty's deck: floorGround.ts floorTop)
    this.loose = new LooseThings(this.core, this.mats, (x, z, fromY) => (this.garage && (!this.seamless || onPlot(x, z)) ? this.garage.surfaceAt(x, z, fromY) : Math.max(this.groundAt(x, z), this.looseFloors().floorTop(x, z, fromY))));
    // (things put on a vehicle ride with it)
    this.loose.carriers = () => this.vehicles;
    this.cargo = new CargoBay(this.core, this.loose);
    this.heldThing = new HeldThing(this.core);
    this.her = new HerInGame(this.core);
    this.her.setLook(this.look);
    this.stream = new LiquidStream(this.core.scene);
    this.splashes = new Splashes(this.core.renderer, this.core.scene);
    this.sparks = new Sparks(this.core);
    this.dust = new WheelDust(this.core.origin);
    this.core.scene.add(this.dust.mesh);
    this.grime = new Grime(this.core.renderer);
    this.coats = new Coats(this.core.renderer);
    this.sprayRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }));
    this.sprayRing.visible = false;
    this.sprayRing.renderOrder = 5;
    this.core.scene.add(this.sprayRing);
    this.flakes = new Flakes(this.core.scene);
    this.mist = new SprayMist(this.core.scene);
    const land = this.garage ? this.garage.land : new GroundLand(this.world!);
    this.player = new ModPlayer(this.seamless && this.garage ? new SeamlessLand(this.garage.land, this.proving!) : (this.proving ?? land), this);
    // (Arctic Drive's walking and sprinting, 2.5 and 5 m/s; the vitals take a share off)
    this.player.walker.speeds = { walk: 2.5, run: 5.0 };
    try {
      this.player.cardsOn = localStorage.getItem('modcar.ui.cards') !== '0';
    } catch {
      /* storage unavailable: shown */
    }
    if (this.garage) this.player.addSolids(this.garage.solids);
    if (!this.garage || this.seamless) this.worldSolids();
    // the V3 kernel: its clock set (a journey begins at the hour the page starts at; a save with a clock goes on
    // from its own) and the modules installed before anything is stepped; their systems are set up once the
    // garage, the vehicles and the things lying about are there, and then the save's slices are read
    this.kernel.install(modules, this, this.env.clock.hourAt(0), this.restore);
    // ("这辆车": the first page of the Tab screen — what the vehicle one stands by still lacks)
    this.carPage = new CarPage({
      root: this.ui.root,
      car: () => {
        const v = this.carBy();
        if (!v) return null;
        // (the parts lying within thirty metres of it, not fitted: their sorts)
        const near = new Set<PartDef['cat']>();
        for (const l of this.loose.list) if (l.part && Math.hypot(l.x - v.sim.px, l.z - v.sim.pz) < 30) near.add(partDef(l.part.part).cat);
        return { name: v.view.frame.name.zh, build: v.build, near };
      },
      nextTitle: () => this.tabPages[this.tabAt + 1]?.title ?? '',
      turnTab: (dir) => this.turnTab(dir),
      closeTab: () => this.closeTab(),
    });
    this.tabPages.unshift(this.carPage.page);
    this.devTabs.add(soundTab({ status: () => this.soundStatus(), test: (what) => this.soundTest(what), setArchive: (on) => this.setArchive(on) }));
    this.ready = this.populate().then(() => this.kernel.start(this));
    this.bindInput(canvas);
    window.addEventListener('resize', () => this.core.resize(window.innerWidth, window.innerHeight));
  }

  /**
   * The V3 systems taken down, the last set up first (a new game: the page is about to go). The rest of the
   * game has no teardown of its own: it ends with its page.
   */
  dispose(): void {
    this.kernel.dispose();
  }

  get origin(): { x: number; y: number; z: number } {
    return this.core.origin;
  }

  /** how far down the road one is (m; on the road) */
  get roadS(): number {
    return this.pr.s;
  }

  private probeWorld: World | null = null;
  /** the proving ground in the world (core/modcar/proving): its ground, over the world's land; its cones, what stands there, its look */
  proving: ProvingGround | null = null;
  provingCones: ConeField | null = null;
  private provingProps: SolidSource | null = null;
  private provingView: ProvingView | null = null;
  private readonly coneBodies: ConeBody[] = [];
  /** driving there: the runs, the live curves, the robot, the comparisons (provingSession.ts); its panel */
  provingRun: ProvingSession | null = null;
  private provingPanel: ProvingHud | null = null;
  /** the road's world, or (in the stand-in garage) the same world to look for places in */
  devWorld(): World {
    const p = this.params;
    return this.world ?? (this.probeWorld ??= modcarWorld(p.seed, { chapterScale: p.chapter, startBiome: p.biome, worldVersion: p.world, regionCount: p.regions, prefabs: prefabsAsked(p.nd) ?? undefined }).world);
  }

  /** seconds left of building the world fast after a teleport (under a fade) */
  private devLoad = 0;

  /**
   * The developer's teleport: onto the road at arc length s (out of the garage first, when one is in it). The
   * vehicle one sits in comes along; on foot, with `bring`, the one last driven is parked on the verge ahead.
   */
  teleport(s: number, bring: boolean): void {
    // (on foot: the one last driven, else the nearest one about)
    let v = this.seated ?? (bring ? this.focus : null);
    if (!v && bring) {
      const w = this.player.walker;
      let best = 15;
      for (const o of this.vehicles) {
        const d = Math.hypot(o.sim.px - w.x, o.sim.pz - w.z);
        if (d < best) {
          best = d;
          v = o;
        }
      }
    }
    if (this.place === 'garage' && !this.seamless) this.exitGarage(v);
    const w = this.world!;
    const st = new SpineSample();
    w.spine.at(s, st);
    const sn = Math.sin(st.phi);
    const cs = Math.cos(st.phi);
    if (v) {
      // in the lane, facing down the road; on foot, it waits a few metres ahead on the verge
      const ahead = this.seated ? 0 : 7;
      const lane = this.seated ? 1.6 : 2.6;
      const x = st.x + cs * ahead - sn * lane;
      const z = st.z + sn * ahead + cs * lane;
      w.sample(x, z, this.gs);
      v.sim.reset(x, this.gs.h + 0.05, z, -st.phi, this.ground);
      v.sys.bind(v.sim);
      v.awake = 3;
      this.focus = v;
    }
    if (!this.seated) {
      // on the verge, looking down the road
      const x = st.x - sn * 5.2;
      const z = st.z + cs * 5.2;
      this.player.walker.place(x, z, st.phi);
      this.input.lookYaw = st.phi;
      this.input.lookPitch = 0;
    }
    this.chaseInit = false;
    this.rig.reset();
    this.shake.reset();
    this.env.cloudsNow = true;
    this.devLoad = 4;
    // (screenshots go without the fade: the harness builds the world before it draws)
    if (!this.params.shot) this.ui.setFade(1);
  }

  /**
   * The developer's teleport to a place off the road (the proving ground's sections: proving/layout.ts): the vehicle
   * one sits in (on foot, with `bring`, the one last driven or the nearest) set down there at rest, heading `yaw`
   * (the sim's: 0 along +x); on foot one stands a few metres to its left, facing its way. The world round it is
   * built behind the fade.
   */
  teleportTo(x: number, z: number, yaw: number, bring: boolean): void {
    let v = this.seated ?? (bring ? this.focus : null);
    if (!v && bring) {
      const w = this.player.walker;
      let best = 15;
      for (const o of this.vehicles) {
        const d = Math.hypot(o.sim.px - w.x, o.sim.pz - w.z);
        if (d < best) {
          best = d;
          v = o;
        }
      }
    }
    if (this.place === 'garage' && !this.seamless) this.exitGarage(v);
    // (the sim's heading: forward (cos yaw, −sin yaw); the walker's: its angle on the plan)
    const fx = Math.cos(yaw);
    const fz = -Math.sin(yaw);
    if (v) {
      this.ground.sample(x, z, this.gs);
      v.sim.reset(x, this.gs.h + 0.05, z, yaw, this.ground);
      v.sys.bind(v.sim);
      v.awake = 3;
      this.focus = v;
    }
    if (!this.seated) {
      // (to its left: −right, right being (−fz, fx))
      const off = v ? v.view.frame.body.halfWidth + 1.6 : 0;
      this.player.walker.place(x + fz * off, z - fx * off, Math.atan2(fz, fx));
      this.input.lookYaw = Math.atan2(fz, fx);
      this.input.lookPitch = 0;
    }
    this.chaseInit = false;
    this.rig.reset();
    this.shake.reset();
    this.env.cloudsNow = true;
    this.devLoad = 4;
    if (!this.params.shot) this.ui.setFade(1);
  }

  /** a build put on a vehicle in place of its own (the proving ground's comparisons): its parts swapped, its look and systems made again */
  swapBuild(v: ModVehicle, b: Build): void {
    if (b.frame !== v.build.frame) return;
    for (const k of Object.keys(v.build.parts)) delete v.build.parts[k];
    Object.assign(v.build.parts, b.parts);
    this.changed(v, 'build');
  }

  /** the proving ground's session and panel (the developer's tab) */
  provingSession(): ProvingSession | null {
    return this.provingRun;
  }

  provingHud(): ProvingHud | null {
    return this.provingPanel;
  }

  /** out of the garage onto the road's world: the garage, what lies in it and the other vehicles stay behind */
  private exitGarage(keep: ModVehicle | null): void {
    if (!this.garage) return;
    this.garage.dispose();
    this.player.removeSolids(this.garage.solids);
    this.garage = null;
    // (but what is on board goes too)
    for (const l of [...this.loose.list]) if (!keep || l.riding?.on !== keep) this.loose.remove(l);
    for (const o of this.vehicles.filter((x) => x !== keep)) {
      o.view.dispose();
      this.player.removeSolids(o.solid);
    }
    this.vehicles.splice(0, this.vehicles.length, ...(keep ? [keep] : []));
    if (this.focus && this.focus !== keep) this.focus = null;
    this.makeWorld();
    this.ground = this.floored(this.proving!);
    this.player.walker.land = this.proving!;
    this.place = 'road';
    this.fadeT = -1;
  }

  /** every workshop there now: the starting one, and the roadside garages' about */
  private allWorkshops(): Workshop[] {
    const road = this.places?.workshops ?? [];
    return this.workshop ? [this.workshop, ...road] : road;
  }

  /** the workshop whose bench is open or at work (its view, its keys, its blows), else the starting one */
  private get benchWs(): Workshop | null {
    for (const w of this.allWorkshops()) if (w.open || w.crafting) return w;
    return this.workshop;
  }

  get devices(): readonly GarageDevice[] {
    const dd = this.doors?.devices ?? [];
    const pl = dd.length ? [...(this.places?.devices ?? []), ...dd] : (this.places?.devices ?? []);
    const base = this.workshop ? (this.devicesAll ??= [...(this.garage?.devices ?? []), ...this.workshop.devices]) : (this.garage?.devices ?? []);
    return pl.length ? [...base, ...pl] : base;
  }

  get tanks(): readonly TankPort[] {
    const pl = this.places?.ports ?? [];
    const w = this.workshop?.tanks ?? [];
    return pl.length ? [...w, ...pl] : w;
  }

  /** the workshop's machines, in the starting garage (its power, its recycler, its bench) */
  private makeWorkshop(): void {
    const g = this.garage;
    if (!g || this.params.garage !== 'workshop') return;
    const core = this.core;
    const game = this;
    this.workshop = new Workshop(
      {
        root: g.root,
        flash: (w) => this.player.flashWhy(w),
        loose: this.loose,
        ui: this.ui,
        stock: this.stock,
        learned: this.learned,
        get origin() {
          return core.origin;
        },
        camera: core.camera,
        groundAt: (x, z) => g.surfaceAt(x, z, 0.4),
        addSolid: (x, z, hx, hz, yaw, y0, y1) => {
          (g.solids as unknown as { add: (x: number, z: number, hx: number, hz: number, y0: number, y1: number, floor?: boolean, yaw?: number, tag?: string) => void }).add(x, z, hx, hz, y0, y1, false, yaw, 'garage:machine');
        },
        addSurface: (x0, x1, z0, z1, y) => g.addSurface?.(x0, x1, z0, z1, y),
        sound: (name, gain) => game.sound(name, gain),
        loop: (name, gain) => game.loopFor(name, gain),
        stockChanged: (d) => game.stockChanged(d),
        benchMode: (on) => game.benchMode(on),
        genSound: (s) => {
          if (game.workshop) game.genAsked.set(game.workshop, s);
        },
        sparks: (x, y, z, n) => game.sparks.emit(x, y, z, { x: 0, z: 0 }, 2.2, n),
        iconOf: (h) => game.iconOf(h),
        cardOf: (h) => game.player.cardOf(h),
        crafted: (id) => {
          if (id.startsWith('scraper_')) game.done.add('scraper');
        },
        // (J5's board counts the start's junk as it goes in: 0/3)
        recycled: (h) => {
          if (game.kit !== 'j5' || h.kind !== 'item' || !START_JUNK.includes(h.item.item)) return;
          let n = 1;
          while (game.done.has(`junk:${n}`)) n++;
          if (n <= START_JUNK.length) game.done.add(`junk:${n}`);
        },
        keep: (h) => game.neededPart(h),
      },
      WORKSHOP_PLAN,
      this.restore?.workshop,
    );
    this.devicesAll = null;
  }

  /** the generators' sounds asked for this frame, by their workshop: the nearest running one is heard */
  private readonly genAsked = new Map<Workshop, Parameters<ModGame['genSound']>[0]>();

  /**
   * A roadside garage's machines (Arctic Drive's outposts): its working bench where its old one stood, against the
   * back wall facing into the room; the recycler beside it; the generator outside its end wall; the cable between
   * them along the floor and the walls. Null when the garage has no bench.
   */
  private makeRoadWorkshop(site: Site, save?: WorkshopSave): Workshop | null {
    const shop = site.objects.find((o) => o.kind === 'building' && o.b?.gate);
    const bench = site.objects.find((o) => o.kind === 'workbench');
    if (!shop || !bench) return null;
    const c = Math.cos(shop.yaw);
    const s = Math.sin(shop.yaw);
    // (the building's own frame: u along it, v across, its gate's wall at −v)
    const W = (u: number, v: number): { x: number; z: number } => ({ x: shop.x + c * u - s * v, z: shop.z + s * u + c * v });
    const bu = (bench.x - shop.x) * c + (bench.z - shop.z) * s;
    const bv = -(bench.x - shop.x) * s + (bench.z - shop.z) * c;
    const f = Math.sign(bu) || 1;
    const hw = shop.w / 2;
    const hd = shop.d / 2;
    const inward = Math.atan2(-c, s);
    const outward = (side: number): number => Math.atan2(s * side, c * side);
    const floor = shop.y;
    const benchAt = W(bu, bv);
    // (a spot clear of everything else the place has: the lift, the car on it, the shelves, the crates and drums outside)
    const others = site.objects.filter((o) => o !== shop && o !== bench);
    const clear = (u: number, v: number, r: number): boolean => {
      const p = W(u, v);
      for (const o of others) {
        const oc = Math.cos(o.yaw);
        const os = Math.sin(o.yaw);
        const lu = (p.x - o.x) * oc + (p.z - o.z) * os;
        const lv = -(p.x - o.x) * os + (p.z - o.z) * oc;
        if (Math.abs(lu) < o.w / 2 + r && Math.abs(lv) < o.d / 2 + r) return false;
      }
      return true;
    };
    // the recycler along the back wall, beside the bench towards the middle; the generator outside an end wall
    let ru = bu - f * 2.4;
    for (let k = 0; k < 8 && !clear(ru, hd - 0.65, 0.65); k++) ru -= f * 0.5;
    const rec = W(ru, hd - 0.65);
    let gu = f * (hw + 0.95);
    let gv = hd - 1.7;
    search: for (const side of [f, -f]) {
      for (let k = 0; k < 12; k++) {
        const v = hd - 1.0 - k * 0.6;
        if (v < -hd + 1.0) break;
        if (clear(side * (hw + 0.95), v, 0.75)) {
          gu = side * (hw + 0.95);
          gv = v;
          break search;
        }
      }
    }
    const gen = W(gu, gv);
    const gf = Math.sign(gu) || f;
    const P = (u: number, v: number, y: number): [number, number, number] => {
      const p = W(u, v);
      return [p.x, floor + y, p.z];
    };
    const plan = {
      generator: { ...gen, heading: outward(gf) },
      recycler: { ...rec, heading: inward },
      bench: { ...benchAt, heading: inward },
      spec: WORKSHOP_PLAN.spec,
      cable: {
        toBox: [P(gf * (hw + 0.55), gv, 0.03), P(gf * (hw + 0.14), gv, 0.03), P(gf * (hw - 0.14), gv, 0.12), P(gf * (hw - 0.18), gv, 1.1)],
        box: P(gf * (hw - 0.17), gv, 1.28),
        toRecycler: [P(gf * (hw - 0.18), gv, 0.04), P(gf * (hw - 0.6), hd - 0.3, 0.02), P(ru + f * 0.45, hd - 0.3, 0.02)],
        toBench: [P(gf * (hw - 0.18), gv, 1.6), P(gf * (hw - 0.18), hd - 0.18, 1.6), P(bu + f * 0.9, hd - 0.18, 1.6)],
      },
    };
    const inside = (x: number, z: number): boolean => {
      const u = (x - shop.x) * c + (z - shop.z) * s;
      const v = -(x - shop.x) * s + (z - shop.z) * c;
      return Math.abs(u) < hw && Math.abs(v) < hd;
    };
    const root = new THREE.Group();
    root.name = `roadshop:${site.id}`;
    this.core.scene.add(root);
    this.core.place(root, 0, 0, 0);
    const solids = new SolidList();
    this.player.addSolids(solids);
    this.vehicleSolids.add(solids);
    const core = this.core;
    const game = this;
    let ws: Workshop | null = null;
    ws = new Workshop(
      {
        root,
        flash: (w) => this.player.flashWhy(w),
        loose: this.loose,
        ui: this.ui,
        stock: this.stock,
        learned: this.learned,
        get origin() {
          return core.origin;
        },
        camera: core.camera,
        groundAt: (x, z) => (inside(x, z) ? floor : game.groundAt(x, z)),
        addSolid: (x, z, hx, hz, yaw, y0, y1) => {
          const base = inside(x, z) ? floor : game.groundAt(x, z);
          solids.list.push(new Solid().set(x, z, hx, hz, yaw, base + y0, base + y1, false, `${site.id}:machine`));
        },
        addSurface: () => undefined,
        sound: (name, gain) => game.sound(name, gain),
        loop: (name, gain) => game.loopFor(name, gain),
        stockChanged: (d) => game.stockChanged(d),
        benchMode: (on) => game.benchMode(on),
        genSound: (st) => {
          if (ws) game.genAsked.set(ws, st);
        },
        sparks: (x, y, z, n) => game.sparks.emit(x, y, z, { x: 0, z: 0 }, 2.2, n),
        iconOf: (h) => game.iconOf(h),
        cardOf: (h) => game.player.cardOf(h),
        crafted: () => undefined,
      },
      plan,
      save,
    );
    this.roadShops.set(ws, { root, solids });
    return ws;
  }

  /** the roadside garages' machines there now: their root and their solids */
  private readonly roadShops = new Map<Workshop, { root: THREE.Group; solids: SolidList }>();

  private dropRoadWorkshop(ws: Workshop): void {
    const r = this.roadShops.get(ws);
    if (ws.open) ws.closeBench();
    ws.dispose();
    this.genAsked.delete(ws);
    if (r) {
      r.root.removeFromParent();
      this.player.removeSolids(r.solids);
      this.vehicleSolids.remove(r.solids);
      this.roadShops.delete(ws);
    }
  }

  /** materials came in or went out: a few words over the vitals */
  stockChanged(d: Cost): void {
    this.matHud ??= new MaterialsHud(this.ui.root);
    this.matHud.show(d, this.stock);
  }

  /** the bench has the view and the mouse; given back */
  private benchMode(on: boolean): void {
    const canvas = this.core.renderer.domElement;
    this.player.aside = on;
    if (on) {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      this.input.lockable = false;
      this.ui.showHelp(false);
      this.player.use = null;
    } else {
      // (back to looking about: the next click takes the mouse again, the pause card says so)
      this.input.lockable = true;
    }
  }

  /** the save gone on with was written under another revision of the generator and has been made fit for this one (said once the game is up) */
  private movedWorld = false;

  private makeWorld(): void {
    const p = this.params;
    // (ModCar's world: the road begins at the workshop's gate, its yard a plot of the land, with the workshop there or
    // not; the proving ground behind it another, its ground what the wheels and the feet have there)
    // (and a test lot of prefab buildings along its road when the address asks for one: docs/ND/PLAN.md)
    const made = modcarWorld(p.seed, { chapterScale: p.chapter, startBiome: p.biome, worldVersion: p.world, regionCount: p.regions, prefabs: prefabsAsked(p.nd) ?? undefined });
    this.world = made.world;
    // (a save written under another revision of the generator: its vehicles back on the road, what lies about
    // down on the land as it is now, before anything reads it — worldSave.ts)
    if (this.restore && worldMoved(this.restore)) {
      if (this.restore.world) rehome(this.restore, this.world);
      this.movedWorld = true;
    }
    this.proving = new ProvingGround(made.level, this.world);
    this.provingCones = new ConeField(this.proving);
    this.provingProps = provingSolids(this.proving);
    this.provingView?.dispose();
    this.provingView = new ProvingView(this.core, this.proving, this.provingCones);
    this.provingRun = new ProvingSession(this);
    this.worldView = new WorldView(this.core, this.world, this.core.quality);
    // (the wrecks by the road are vehicles of their own: wrecks.ts; the places' things our models where we have them)
    this.siteArt ??= new SiteArt(this.core, (id) => this.places?.isOpen(id) ?? false);
    const art = this.siteArt;
    this.doors ??= new Doors(
      {
        core: this.core,
        origin: this.core.origin,
        model: (name) => art.kitModel(name),
        play: (name) => {
          const f = this.sounds();
          if (f && (FOLEY_SHOTS as readonly string[]).includes(name)) f.play(name as FoleyShot, {});
        },
      },
      this.restore?.places?.doors,
    );
    art.doors = this.doors;
    this.worldView.skipObject = (o, site) => o.kind === 'wreck' || (o.kind === 'workbench' && site.kind === 'garage') || art.draws(o, site);
    this.landmarks = new LandmarkView(this.core, this.world);
    this.geothermal = new GeothermalView(this.core, this.world);
    this.spires = new SpireView(this.core, this.world);
    this.wonders = new WonderView(this.core, this.world);
    this.waterfalls = new WaterfallView(this.core, this.world);
    this.skyFlocks = new SkyFlocks(this.core, this.world);
    this.fish = new FishView(this.core, this.world);
    this.heroPeaks = new HeroPeakView(this.core, this.world);
    this.glaciers = new GlacierView(this.core, this.world);
    this.beacons = new BeaconView(this.core, this.world);
    // (from the start on the road the walker comes after the world)
    if (this.player) this.worldSolids();
  }

  /** what stands by the road (walls, pumps, benches, signs, guard rails): the walker and the vehicles keep out of it */
  private worldSolids(): void {
    if (!this.world) return;
    // (not the wrecks' boxes: the wrecks are vehicles, solids of their own)
    const sites = new WithoutWrecks(this.world.sites);
    this.player.addSolids(sites);
    this.player.addSolids(this.world.furniture);
    if (this.world.rules.version >= 2) {
      const rocks = groundField(this.world);
      this.player.addSolids(rocks);
      this.vehicleSolids.add(rocks);
    }
    // (the spires: a pillar mountain's pillars, a karst's towers, the sea stacks, V5)
    if (this.world.earth) {
      const spires = new SpireSolids(this.world, new TerrainPoint(), new SpineSample());
      this.player.addSolids(spires);
      this.vehicleSolids.add(spires);
    }
    this.vehicleSolids.add(sites);
    this.vehicleSolids.add(this.world.furniture);
    // (the buildings' doors, while they are shut)
    if (this.doors) {
      this.player.addSolids(this.doors.solids);
      this.vehicleSolids.add(this.doors.solids);
    }
    // (the proving ground's tower, gantry, boards)
    if (this.provingProps) {
      this.player.addSolids(this.provingProps);
      this.vehicleSolids.add(this.provingProps);
    }
    for (const v of this.vehicles) this.roadSolids(v);
  }

  /** the proving ground's cones: the bodies of the vehicles on it knock them flying (cones.ts) */
  private stepCones(dt: number): void {
    const f = this.provingCones;
    const pg = this.proving;
    if (!f || !pg) return;
    const bodies = this.coneBodies;
    let n = 0;
    const b = this.basis;
    for (const v of this.vehicles) {
      const s = v.sim;
      if (!pg.near(s.px, s.pz)) continue;
      s.basis(b);
      const fl = Math.hypot(b[0], b[2]) || 1;
      const box = v.view.frame.body;
      const over = Math.max(0, s.py - s.spec.cgHeight - pg.heightAt(s.px, s.pz));
      const o = (bodies[n++] ??= { x: 0, z: 0, vx: 0, vz: 0, yawRate: 0, fx: 1, fz: 0, front: 0, rear: 0, halfWidth: 0, bottom: 0 });
      o.x = s.px;
      o.z = s.pz;
      o.vx = s.vx;
      o.vz = s.vz;
      o.yawRate = s.yawRate;
      o.fx = b[0] / fl;
      o.fz = b[2] / fl;
      o.front = box.front;
      o.rear = box.rear;
      o.halfWidth = box.halfWidth;
      o.bottom = box.bottom + over;
    }
    bodies.length = n;
    f.step(dt, bodies);
  }

  /** a vehicle on the road keeps out of what stands by it, and of the other vehicles (not of itself) */
  private roadSolids(v: ModVehicle): void {
    if (!this.world) return;
    // (in the world with the workshop: not the garage's walls and benches, which keepIn deals with)
    v.sim.solids = this.seamless ? this.vehicleSolids : this.player.solids;
    v.sim.onKnock = (sd, vx, vz, speed) => {
      // a crate, a barrel, a bench shoved: the place moves it and is drawn again …
      const site = this.world?.sites.knock(sd, vx, vz, speed);
      if (site) {
        this.worldView?.redrawSite(site.id);
        return;
      }
      // … or a delineator or a chevron board at the road's edge: it lies where it fell
      const at = this.world ? this.world.furniture.knock(sd, vx, vz) : NaN;
      if (at === at) this.worldView?.redrawFurniture(at);
    };
  }

  private groundAt(x: number, z: number): number {
    this.ground.sample(x, z, this.gs);
    return this.gs.h;
  }

  /** the places' floors for things let fall (made the first time asked: the solids are the vehicles' own set) */
  private looseFloor: FloorGround | null = null;
  private looseFloors(): FloorGround {
    return (this.looseFloor ??= new FloorGround(this.ground, this.vehicleSolids, () => this.time));
  }

  /** the wheels' ground with the places' floors on it: a building's plinth is driven onto, not into (floorGround.ts) */
  private floored(land: Ground): Ground {
    return new FloorGround(land, this.vehicleSolids, () => this.time);
  }

  // ------------------------------------------------------------------ setting up

  /** the vehicles and the things lying about at the start */
  private async populate(): Promise<void> {
    const p = this.params;
    // (a new game anywhere but J5's workshop: the old jacket and shoes on, as one always had them)
    if (!this.restore && (p.start !== 'garage' || this.kit === 'classic')) this.player.worn = oldClothes();
    // (the places' models in before any place is drawn: what is ours is never drawn twice)
    if (this.siteArt) await this.siteArt.ready;
    if (this.garage) {
      const g = this.garage;
      await Promise.all([preload(PARTS.map((x) => x.id)), g.ready]);
      this.takeKnown();
      this.makeWorkshop();
      if (this.restore) {
        this.restoreGarage(this.restore);
        await Promise.all([...this.vehicles.map((v) => v.view.settled()), this.loose.settled()]);
        await this.restoreGrime();
        await this.restoreCoats();
        if (this.seamless) await this.buildWorldAround();
        if (this.seated) this.input.lookPitch = this.seatPitch(this.seated);
        // (gone on with as it was: nothing said, unless something was moved — docs/V3/plan/prompts.md §五)
        const moved = this.movedWords();
        if (moved) this.ui.say(moved, 5);
        return;
      }
      const classic = this.kit === 'classic';
      // (J5: the Sugar Cube a bare shell, docs/V3/plan/growth.md §一 3 — the classic start's short of four parts)
      const project = p.project === 'full' ? stockBuild('sedan', { fuel: 0.05 }) : classic ? stockBuild('sedan', { fuel: 0, without: [...TUTORIAL_MISSING] }) : bareShell();
      // a car that stood in a barn for years: caked with grime (the windows too: nothing to be seen through
      // them until they are scraped), dust over it, rust at the edges (docs/MODCAR.md §15)
      weather(project, 0.5, 0.1, 1, p.project === 'tutorial' ? 0.62 : 0.32);
      const v = this.addVehicle(project, g.carSpot.x, g.carSpot.z, g.carSpot.yaw);
      this.focus = v;
      // the missing parts and the tools, round the bay; the fun parts on the shelves (not under the workshop's machines)
      const spots = g.spots.filter((s) => !this.workshop?.occupies(s.x, s.z));
      // a garage without a spot of some kind offers the nearest kind it has
      const instead: Record<string, string> = { charger: 'bench', rack: 'shelf', cans: 'floor' };
      const take = (where: string): (typeof spots)[number] => {
        let i = spots.findIndex((s) => s.where === where);
        if (i < 0 && instead[where]) i = spots.findIndex((s) => s.where === instead[where]);
        return spots.splice(i >= 0 ? i : 0, 1)[0];
      };
      const put = (id: string, where: string, withTyre = ''): void => {
        const s = take(where);
        const inst = newInstance(id, { charge: 0.85 });
        if (withTyre) fitSub(inst, 'tire', newInstance(withTyre));
        // things found round the farm: some dustier than others, the odd one rusty
        const k = hash01(`${id}:${spots.length}`);
        inst.dirt = 0.15 + 0.4 * k;
        inst.rust = id.startsWith('rim_') || id.startsWith('bf_') || id.startsWith('roof_') ? 0.2 + 0.4 * k : 0.05 * k;
        this.loose.addPart(inst, s.x, s.y + 0.4, s.z, s.yaw);
      };
      if (!classic) {
        // J5: what the start needs and nothing else (docs/V3/plan/growth.md §一 1–3); the old jacket and shoes on the
        // bench to put on (J6: the board's first step), the nightdress all one has on
        this.layStart(p.project === 'tutorial', take);
        for (const it of Object.values(oldClothes())) {
          const sp = take('bench');
          if (sp && it) this.loose.addItem(it, sp.x, sp.y + 0.3, sp.z, sp.yaw);
        }
        this.player.walker.place(g.spawn.x, g.spawn.z, g.spawn.heading);
        this.input.lookYaw = g.spawn.heading;
        await Promise.all([...this.vehicles.map((v) => v.view.settled()), this.loose.settled()]);
        if (this.seamless) await this.buildWorldAround();
        return;
      }
      // (one engine lies about, no more: several to choose from would only confuse - the tutorial's I4, or
      // a V8 to play with when the project car is whole)
      if (p.project === 'tutorial') {
        // the battery waits on the charger
        put('bat_std', 'charger');
        put('rim_steel13', 'floor', 'tire_road');
        put('rim_steel13', 'floor', 'tire_road');
        put('eng_i4', 'floor');
      } else put('eng_v8', 'rack');
      // the jerrycans stand by the drums, the rest of the tools lie on the bench
      // (the spray cans as Arctic Drive's starting garage has them: two small ones, part full; and, while there is
      // no world yet to find more in, a medium and a large one beside them)
      const can = (tier: 1 | 2 | 3, colour: number): ReturnType<typeof newTool> => newTool('spray', { tier, colour, paint: sprayFound(tier, hash01(`spray:${tier}:${colour}`)) });
      const tools = [newTool('jerrycan', { fuel: 'petrol', litres: 20 }), newTool('jerrycan', { fuel: 'diesel', litres: 20 }), newTool('bottle'), newTool('oilcan'), can(1, 13), can(1, 26), can(2, 3), can(3, 23), newTool('scraper', { tier: 1 })];
      for (const t of tools) {
        const s = take(t.kind === 'jerrycan' ? 'cans' : 'bench');
        this.loose.addTool(t, s.x, s.y + 0.3, s.z, s.yaw);
      }
      // junk to recycle (Arctic Drive's starting garage has its boxes of old components): enough scrap for the
      // plastic scraper and a little over, piled by the recycler, on the bench and the shelves
      if (this.workshop) {
        const pile: [string, number, number, number][] = [
          ['crate_parts', 3.85, -3.45, 0.3],
          ['crate_parts', 3.55, -2.72, -0.25],
          ['crate_junk', 2.95, -3.7, 0.1],
          ['junk_tv', 2.55, -3.95, -0.4],
          ['junk_bucket', 4.15, -4.15, 0],
          ['junk_chair_office', -5.2, -3.6, 2.2],
          ['junk_bag', -6.45, 2.45, 0.4],
          ['junk_bag', -6.35, 3.0, -0.6],
        ];
        for (const [id, x, z, yaw] of pile) this.loose.addItem(newItem(id), x, 0.3, z, yaw);
        for (const id of ['junk_fax']) {
          const s = take('bench');
          if (s) this.loose.addItem(newItem(id), s.x, s.y + 0.3, s.z, s.yaw);
        }
        const sh = take('shelf');
        if (sh) this.loose.addItem(newItem('crate_supps'), sh.x, sh.y + 0.3, sh.z, sh.yaw);
      }
      // the heavy fun on the steel rack, the light on the shelves
      for (const id of ['seat_toilet', 'seat_race', 'gb_5', 'exh_side', 'roof_spikes']) put(id, 'rack');
      for (const id of ['steer_ship', 'turbo_small', 'hl_spot', 'horn_trumpet', 'steer_sport', 'hb_drift']) put(id, 'shelf');
      for (const id of ['bf_ram', 'seat_armchair', 'tank_drum']) put(id, 'floor');
      put('rim_off16', 'floor', 'tire_tractor');
      put('rim_off16', 'floor', 'tire_tractor');
      put('rim_cart', 'floor');
      put('rim_cart', 'floor');
      // a second frame to take parts from
      const donor = stockBuild('pickup', { fuel: 0.3 });
      weather(donor, 0.6, 0.32, 2);
      this.addVehicle(donor, g.bay2.x, g.bay2.z, g.bay2.yaw);
      // and the others found round the place (the workshop's yard): a motorcycle on its stand by the door, a
      // motorhome by the pump with its tank dry (the diesel can is for it)
      if (p.garage === 'workshop') {
        const bike = stockBuild('moto', { fuel: 0.3 });
        weather(bike, 0.45, 0.18, 3);
        // (by the barn's front corner, out of the way of what drives out)
        this.addVehicle(bike, g.bay2.x - 2.9, g.bay2.z + 1.5, -1.25);
        const rv = stockBuild('rv', { fuel: 0 });
        weather(rv, 0.5, 0.22, 4);
        this.addVehicle(rv, g.bay2.x + 4.3, -3.7, 0.18);
      }
      this.player.walker.place(g.spawn.x, g.spawn.z, g.spawn.heading);
      this.input.lookYaw = g.spawn.heading;
    } else {
      this.takeKnown();
      this.workshopKept = this.restore?.workshop;
      const b = this.restore?.vehicles[0]?.build ?? decodeBuild(p.build, { fuel: 0.7 });
      const v = this.placeOnRoad(b, p.s);
      if (this.restore) {
        v.radioOn = !!this.restore.vehicles[0].radioOn;
        v.radioSong = this.restore.vehicles[0].radioSong ?? 0;
        if ((this.restore.vehicles[0].room ?? 0) < roomRev(v.build.frame)) this.roomOld.add(v);
        for (const d of this.restore.done) this.done.add(d);
        this.restoreLoose(this.restore.loose.filter((l) => l.on === 0));
        this.restoreHands(this.restore);
        const movedR = this.movedWords();
        if (movedR) this.ui.say(movedR, 5);
      }
      v.sys.startNow();
      this.seated = v;
      this.focus = v;
    }
    await Promise.all([...this.vehicles.map((v) => v.view.settled()), this.loose.settled()]);
    // (the world round the workshop built before the game shows: the country seen through its door, the road out)
    if (this.seamless) await this.buildWorldAround();
    // (once the model is in: where its clocks are)
    if (this.seated) this.input.lookPitch = this.seatPitch(this.seated);
  }

  /**
   * J5's workshop (docs/V3/plan/growth.md §一 1–3): the Sugar Cube's thirty parts about the room (the tutorial; a
   * whole car, ?project=full, has none to lay out), each where a mechanic would put it — the engine on the floor by
   * the car's nose, the gearbox, radiator and exhaust on the steel rack, the wheels by the tyre changer, the seats
   * along the shelves, the doors, the bonnet and the boot lid flat on the floor in the free end of the room, the
   * bumpers in front of the shelves, the small things on them, the battery on its charger; a can of petrol by the
   * drums; on the bench a water bottle for the radiator, a big bottle of water to drink, two packs of crackers and a
   * sponge; by the recycler two boxes of old components and a dead television, the 50 scrap the plastic scraper costs
   * (the foraging knife and basket are the forage system's, at one's feet). No other vehicle.
   */
  private layStart(parts: boolean, take: (where: string) => { x: number; y: number; z: number; yaw: number } | undefined): void {
    const lay = (inst: KitPart['inst'], x: number, y: number, z: number, yaw: number): void => void this.loose.addPart(inst, x, y + 0.4, z, yaw);
    if (parts) {
      for (const k of startParts(this.rough)) {
        const at = START_SPOTS[k.mount];
        if (at) lay(k.inst, at[0], 0, at[1], at[2]);
        else {
          const sp = take(k.spot === 'charger' ? 'charger' : k.spot === 'rack' ? 'rack' : k.spot === 'shelf' ? 'shelf' : 'floor');
          if (sp) lay(k.inst, sp.x, sp.y, sp.z, sp.yaw);
        }
      }
    }
    // the can of petrol by the drums (enough to the first filling station); the rest on the bench
    const can = take('cans');
    if (can) this.loose.addTool(newTool('jerrycan', { fuel: 'petrol', litres: 20 }), can.x, can.y + 0.3, can.z, can.yaw);
    for (const t of [newTool('bottle'), newTool('sponge')]) {
      const sp = take('bench');
      if (sp) this.loose.addTool(t, sp.x, sp.y + 0.3, sp.z, sp.yaw);
    }
    for (const id of ['drink_water', 'food_biscuits', 'food_biscuits']) {
      const sp = take('bench');
      if (sp) this.loose.addItem(newItem(id), sp.x, sp.y + 0.3, sp.z, sp.yaw);
    }
    // the junk the scraper is made from, by the recycler
    if (this.workshop) {
      const pile: [number, number, number][] = [
        [3.85, -3.45, 0.3],
        [3.55, -2.72, -0.25],
        [2.95, -3.75, 0.1],
      ];
      START_JUNK.forEach((id, i) => this.loose.addItem(newItem(id), pile[i][0], 0.3, pile[i][1], pile[i][2]));
    }
  }

  /** the line for a save that was made fit for another revision of the generator (written out in English, as the kernel writes its own); null: it was not */
  private movedWords(): string | null {
    if (!this.movedWorld) return null;
    console.info(`[world] ${WORLD_CHANGED.en}`);
    // (this line stands: the one for being out on the road, which the first step would say over it, is not said)
    this.saidOnRoad = true;
    return WORLD_CHANGED.zh;
  }

  /** the world round where one is, built under the loading card (a few seconds at most) */
  private async buildWorldAround(): Promise<void> {
    const wv = this.worldView;
    if (!wv) return;
    const sv = this.seated;
    const x = sv ? sv.sim.px : this.player.walker.x;
    const z = sv ? sv.sim.pz : this.player.walker.z;
    const t0 = performance.now();
    wv.update(x, z, 40);
    while (wv.pending > 0 && performance.now() - t0 < 15000) {
      wv.update(x, z, 40);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  private readonly pitchV = new THREE.Vector3();
  /**
   * How far down one looks on sitting in: enough that the clocks show above the bottom of the view (a
   * pickup's high seat over a low dash, a bike's bars), level when they already do.
   */
  private seatPitch(v: ModVehicle): number {
    const needle = Object.values(v.view.needles)[0];
    if (!needle) return v.view.frame.balance ? -0.15 : 0;
    v.view.model.updateMatrixWorld(true);
    const n = v.view.model.worldToLocal(needle.getWorldPosition(this.pitchV));
    const cg = v.sys.derived.cg;
    const e = v.sim.spec.eye;
    const below = Math.atan2(e.y + cg.y - n.y, Math.max(0.2, n.x - (e.x + cg.x)));
    // (the clocks some 22° under the middle of the view sit in its lower fifth)
    return -Math.max(0, Math.min(0.18, below - 0.38));
  }

  /**
   * The vehicles of a save whose living space was made anew since it was written (SavedVehicle.room under the frame's
   * roomRev): what rode in them is put in again where there is room now (restow) — and what there is to put in so,
   * by its vehicle.
   */
  private readonly roomOld = new Set<ModVehicle>();
  private readonly restowing = new Map<ModVehicle, NonNullable<Held>[]>();

  /** a saved thing that rode in a vehicle is to be put in anew: its place there is no more (or it never had one) */
  private restowed(l: SavedLoose, v: ModVehicle | undefined): boolean {
    if (!v || (l.pos && l.rot && !this.roomOld.has(v))) return false;
    const h: Held = l.part ? { kind: 'part', inst: l.part } : l.tool ? { kind: 'tool', tool: l.tool } : l.item ? { kind: 'item', item: backInTheWorld(l.item) } : null;
    if (!h) return true;
    let q = this.restowing.get(v);
    if (!q) {
      this.restowing.set(v, (q = []));
      void this.restow(v);
    }
    q.push(h);
    return true;
  }

  /**
   * What rode in a vehicle put in again, once its model is there: the big things first, each where the vehicle has
   * room for it (as the left button packs it in); what finds none is stood on the ground by its door. Said once.
   */
  private async restow(v: ModVehicle): Promise<void> {
    await v.view.settled();
    const q = this.restowing.get(v) ?? [];
    this.restowing.delete(v);
    this.roomOld.delete(v);
    if (!this.vehicles.includes(v)) return;
    const size = (h: NonNullable<Held>): number => (carryOf(h) === 'large' ? 2 : carryOf(h) === 'medium' ? 1 : 0);
    q.sort((a, b) => size(b) - size(a));
    let out = 0;
    for (const h of q) {
      if (!this.cargo.boxOf(h)) {
        await this.loose.objectFor(h);
        for (let i = 0; i < 20 && !this.cargo.boxOf(h); i++) await new Promise((r) => setTimeout(r, 0));
      }
      if (!this.vehicles.includes(v)) return;
      const at = this.cargo.packSpot(v, h);
      if (at) {
        this.cargo.stow(v, at.zone, at.spot, h);
        continue;
      }
      // (no room: on the ground beside it, to its right, one after another along it)
      v.sim.basis(this.overBasis);
      const b = this.overBasis;
      const side = v.view.frame.body.halfWidth + 0.9;
      const along = -1.5 + (out % 6) * 0.7;
      const x = v.sim.px + b[0] * along + b[6] * (side + Math.floor(out / 6) * 0.7);
      const z = v.sim.pz + b[2] * along + b[8] * (side + Math.floor(out / 6) * 0.7);
      this.ground.sample(x, z, this.gs);
      const y = this.gs.h + 0.05;
      const l = h.kind === 'part' ? this.loose.addPart(h.inst, x, y, z, 0) : h.kind === 'tool' ? this.loose.addTool(h.tool, x, y, z, 0) : this.loose.addItem(h.item, x, y, z, 0);
      this.loose.drop(l);
      out++;
    }
    this.cargo.weigh(v);
    if (q.length) this.ui.say(out ? `车厢重新隔过了：里面的东西重新摆了一遍，${out} 件放不下的在车旁边` : '车厢重新隔过了：里面的东西重新摆了一遍', 5);
  }

  /** the things of a save: on the floor where they lay, on board the vehicle they rode on */
  private restoreLoose(list: SavedLoose[]): void {
    for (const l of list) {
      if (l.on !== undefined && this.restowed(l, this.vehicles[l.on])) continue;
      const thing = l.part ? this.loose.addPart(l.part, l.x, l.y + 0.05, l.z, l.yaw) : l.tool ? this.loose.addTool(l.tool, l.x, l.y + 0.05, l.z, l.yaw) : l.item ? this.loose.addItem(backInTheWorld(l.item), l.x, l.y + 0.05, l.z, l.yaw) : null;
      const v = l.on !== undefined ? this.vehicles[l.on] : undefined;
      if (thing && v && l.pos && l.rot) {
        this.loose.ride(thing, v, { pos: new THREE.Vector3().fromArray(l.pos), rot: new THREE.Quaternion().fromArray(l.rot) });
        if (l.zone) thing.stow = l.zone;
        if (l.lie) thing.lie = l.lie;
      }
    }
    // (what rides in each vehicle weighs on it again)
    for (const v of this.vehicles) this.cargo.weigh(v);
  }

  cargoChanged(v: ModVehicle): void {
    this.cargo.weigh(v);
  }

  /** a list is open (Tab): G there puts the thing in the hands into the list, so the hands do not offer G for putting it down (player.ts) */
  get listOpen(): boolean {
    return !!this.listV;
  }

  // ------------------------------------------------------------------ the body (vitals.ts)

  /** is one under the workshop's roof (in a vehicle: is it) */
  /** what the one on foot stands under this frame (a building by the road, a canopy), worked out once a frame: shelterOf */
  private coverNow: SiteObject | null = null;
  private shelterNow = 0;

  /**
   * How shut in from the weather the one on foot is (docs/V3/nodes/M1-interact.md), 0 the open sky … 1 a closed
   * cab: inside the workshop (less with its doors open), inside a building by the road through its doorway, under
   * a canopy only a little. The rain is heard through it as from a cab, and does not fall on one.
   */
  private shelterOf(): number {
    this.coverNow = null;
    if (this.seated) return 0;
    // (inside a vehicle's living space: shut in as its cab, by its doors)
    const ab = this.player.aboard;
    if (ab) return 1 - this.cabinOpen(ab.v);
    if (this.place === 'garage' && (!this.seamless || this.indoors())) return this.garage?.doorsOpen?.() ? 0.75 : 0.95;
    if (!this.world) return 0;
    const w = this.player.walker;
    const o = this.world.sites.coverAt(w.x, w.y + 1.5, w.z);
    this.coverNow = o;
    if (!o) return 0;
    // (a doorway lets a little of the outside in; a wide gate more; a canopy keeps only the rain off one)
    return o.kind === 'canopy' ? 0.3 : o.b?.gate ? 0.8 : 0.94;
  }

  private indoors(): boolean {
    const sv = this.seated;
    const w = this.player.walker;
    return !!this.garage?.indoors?.(sv ? sv.sim.px : w.x, sv ? sv.sim.pz : w.z);
  }

  /**
   * The air round one (°C): the weather's, and what one has put between oneself and it (docs/V3/plan/finish.md §三.2).
   * A closed cab with its engine running is heated and cooled: 20 to 25. A room — a building by the road, a living
   * space, a closed cab standing, the workshop (never under 15) — is 8 °C nearer 20 than outside. A roof alone (a
   * canopy, a cab without its doors) keeps the sun off: a hot day is 6 °C cooler under it, never under 26.
   */
  bodyAirC(): number {
    const out = this.env.state.temp;
    const sv = this.seated;
    const closed = sv ? sv.sys.derived.enclosed : 0;
    if (sv && sv.sys.running && closed > 0.5) return Math.min(25, Math.max(out, 20));
    const garage = this.place === 'garage' && (!this.seamless || this.indoors());
    // (how shut in: a seat's by its cab — a roof over one at least, where the frame has one —, on foot by what is round one)
    const shut = sv ? (closed > 0.5 ? 0.9 : sv.view.frame.enclosed > 0 ? 0.4 : 0) : this.shelterNow;
    let c = out;
    if (garage || shut >= 0.75) c += Math.max(-8, Math.min(8, 20 - c));
    else if (shut >= 0.25 && c > 26) c = Math.max(26, c - 6);
    // (a fire close by — a lit stove: the systems' own, the warmest of them — warms the air one feels, as far as a mild room's and no further)
    if (c < FIRE_WARMS_TO && this.warmers.length) {
      const px = sv ? sv.sim.px : this.player.walker.x;
      const pz = sv ? sv.sim.pz : this.player.walker.z;
      let warm = 0;
      for (const f of this.warmers) warm = Math.max(warm, f(px, pz));
      if (warm > 0) c = Math.min(FIRE_WARMS_TO, c + warm);
    }
    return garage ? Math.max(c, 15) : c;
  }

  /** how one is dressed for the air outside, for the Tab's line over 我身上 */
  bodyAir(): { warmth: number; outC: number; feel: '' | 'cold' | 'hot' } {
    const outC = this.env.state.temp;
    return { warmth: this.warmth(), outC, feel: this.airFeel(outC) };
  }

  /** what the air round one will do to one as one is dressed (the cab's thermometer and the Tab's line say it before one gets out): 会冷, 会热, or nothing */
  airFeel(c = this.env.state.temp): '' | 'cold' | 'hot' {
    const l = airLines(this.warmth(), false, this.vitalsR);
    return c < l.cold ? 'cold' : c > l.hot ? 'hot' : '';
  }

  /** the body, every step: what one does to it, what it does to one */
  private stepBody(dt: number, shift: boolean): void {
    const b = this.body;
    this.vitHud ??= new VitalsHud(this.ui.root);
    const w = this.player.walker;
    const moving = !this.seated && Math.hypot(w.vx ?? 0, w.vz ?? 0) > 0.6;
    const sprinting = !this.seated && shift && moving && canSprint(b);
    const jumps = w.jumps - this.jumpsSeen;
    this.jumpsSeen = w.jumps;
    if (this.deadT < 0) {
      if (this.assists.needs) {
        // (sitting still in a seat: energy comes back slowly — docs/V3/plan/growth.md §四)
        const resting = !!this.seated && Math.abs(this.seated.sim.kmh) < 1;
        this.buffs.step(dt);
        const mods = buffBodyMods(this.buffs, resetBodyMods(this.bodyMods));
        const ev = stepVitals(b, { dt, sprinting, jumped: jumps > 0, ambientC: this.bodyAirC(), warmth: this.warmth(), rain: !this.seated && (this.seamless ? !this.indoors() : this.place === 'road') && this.shelterNow < 0.5 && this.env.state.rain > 0.15, resting, mods }, this.vitalsR);
        if (ev.hurt > 0) {
          this.vitHud.hurt();
          this.sound('hurt', Math.min(1, ev.hurt / 4));
        }
        if (ev.vomit) {
          this.vitHud.hurt();
          this.sound('hurt', 0.8);
          this.ui.say('吐了……', 2);
        }
        // (health going: the bar's grey end grows, with a dull thud — not the red of a blow)
        if (ev.sapped > 0) {
          this.vitHud.sap();
          this.sound('hurt', 0.3);
        }
        // (sleepy from now on: said once, with what to do about it — the wheel comes round late from here, and nothing
        // else says why. Found by the hundred-kilometre walk: a traveller who never sleeps runs off the road.)
        const drowsy = sleepyNow(b);
        if (drowsy && !this.wasSleepy && !b.dead) this.ui.say('困了，方向盘跟得慢了：停车熄火，空着手长按右键睡一觉', 6);
        this.wasSleepy = drowsy;
        // a fall (from how fast one came down), a crash (the vehicle one sits in, how fast it hit)
        this.knocksOnBody();
        if (b.dead && !ev.died) this.onDeath(this.lastBlow);
        if (ev.died) this.onDeath(ev.why);
      } else {
        // (the needs off: only stamina, as one sprints)
        const keep = { food: b.food, water: b.water, temp: b.temp, hp: b.hp, cap: b.cap };
        stepVitals(b, { dt, sprinting, jumped: jumps > 0, ambientC: 20, warmth: 20, rain: false });
        Object.assign(b, keep);
      }
    } else this.stepDeath(dt);
    this.stepSleep(dt);
    // on foot: slower frozen, heat-struck, hurt or sleepy, quicker on an energy drink
    w.speedScale = speedFactor(b);
    this.sprintB += ((sprinting ? 1 : 0) - this.sprintB) * (1 - Math.exp(-dt * 6));
    this.vitHud.update(b, this.bodyAirC(), dt, this.buffNames());
    // breathing hard, the heart
    this.bodySounds(dt, b);
    // the restore points: every five minutes of play
    if (this.params.keep && this.deadT < 0 && (this.restoreT += dt) > 300) {
      this.restoreT = 0;
      const s = this.snapshot();
      if (s) pushRestore(s);
    }
  }

  /** the landings and the vehicle's knocks seen so far (a new one: a blow to the body), and what the last blow was */
  private landsSeen = -1;
  private hitsSeen = new WeakMap<ModVehicle, number>();
  private lastBlow: VitalsEvents['why'] = '';

  /**
   * What the world does to the body (docs/V3/plan/growth.md §四, Nomad Drive's numbers): a fall — from how fast one
   * came down, v²/2g — hurts from 6 m (5 to 100 by 25 m, the end beyond); a knock of the vehicle one sits in at 6 m/s
   * and more hurts 1 to 15 by 20 m/s. A blow of over 8: hurt for a while (a limp).
   */
  private knocksOnBody(): void {
    const b = this.body;
    const w = this.player.walker;
    if (this.landsSeen < 0) this.landsSeen = w.lands;
    if (w.lands !== this.landsSeen) {
      this.landsSeen = w.lands;
      const h = (w.landSpeed * w.landSpeed) / (2 * 9.81);
      const hp = Math.round(fallDamage(h) * this.hurtK());
      if (hp > 0 && !this.seated) this.blow(injure(b, hp, 'fall'), h >= 25 ? '' : '摔伤了');
    }
    const v = this.seated;
    if (v) {
      const was = this.hitsSeen.get(v);
      this.hitsSeen.set(v, v.sim.hits);
      if (was !== undefined && v.sim.hits !== was) {
        const hp = Math.round(crashDamage(v.sim.lastHitSpeed) * this.hurtK());
        if (hp > 0) this.blow(injure(b, hp, 'crash'), hp > 8 ? '撞伤了' : '');
      }
    }
  }

  /** the buffs a meal left, by name, for the body's states (暖身, 有劲…) */
  private buffNames(): string[] {
    const out = this.buffNamesOut;
    out.length = 0;
    for (let i = 0; i < this.buffs.count; i++) out.push(BUFFS[this.buffs.at(i)].name.zh);
    return out;
  }
  private readonly buffNamesOut: string[] = [];

  /** how much a blow hurts at the difficulty (the hard one's half again) */
  private hurtK(): number {
    return this.difficulty === 'hard' ? 1.5 : this.difficulty === 'easy' ? 0.6 : 1;
  }

  private blow(ev: VitalsEvents, said: string): void {
    if (ev.hurt <= 0) return;
    this.lastBlow = ev.why;
    this.vitHud?.hurt();
    this.sound('hurt', Math.min(1, ev.hurt / 10));
    if (said && !ev.died) this.ui.say(said, 1.6);
    if (ev.died) this.onDeath(ev.why);
  }

  /**
   * What keeps the cold out (docs/V3/plan/growth.md §四: clothes one wears): the nightdress one has on whatever happens
   * (4), and each piece of clothing worn its warmth.
   */
  warmth(): number {
    let w = BASE_WARMTH;
    for (const it of Object.values(this.player.worn)) if (it) w += itemDef((it as ItemInstance).item).wear?.warmth ?? 0;
    return w;
  }

  /** the body's sounds as they were last heard: out of breath (and the next breath due in), the next heartbeat due in */
  private readonly bodyS = { winded: false, breathT: 0, beatT: 0 };

  /**
   * The body's sounds, the archive's recordings of them: out of breath from when stamina runs low, a pant at a
   * time, fast and then slower as it comes back, and the breath got back at last; the heart when badly hurt, a beat
   * at a time, quicker the worse it is. Without the archive, the synthesized loops as before.
   */
  private bodySounds(dt: number, b: Vitals): void {
    const f = this.foley;
    const s = this.bodyS;
    const rec = !!f && f.has('breath_fast');
    if (!f || !rec) {
      if (!this.seated && b.stamina < 20 + (this.loopsOn.has('breath') ? 15 : 0)) this.loopsNow.set('breath', {});
      if (b.hp < 25 && this.deadT < 0) this.loopsNow.set('heart', {});
      return;
    }
    if (!this.seated && b.stamina < 20) s.winded = true;
    if (s.winded && (s.breathT -= dt) <= 0) {
      if (this.seated || b.stamina >= 45) {
        if (!this.seated) f.cue('breath_end', 1);
        s.winded = false;
        s.breathT = 0;
      } else {
        const fast = b.stamina < 25;
        f.cue(fast ? 'breath_fast' : 'breath_slow', 1);
        s.breathT = fast ? 0.8 : 1.15;
      }
    }
    if (b.hp < 25 && this.deadT < 0) {
      if ((s.beatT -= dt) <= 0) {
        f.cue('heartbeat', 0.8 + 0.4 * (1 - b.hp / 25));
        s.beatT = 0.62 + 0.5 * (b.hp / 25);
      }
    } else s.beatT = 0;
  }

  /** eaten or taken: what it does (food and health over five seconds, a pill at once, its effect) */
  consume(item: ItemInstance): void {
    const d = itemDef(item.item);
    if (d.eat && (d.eat.food > 0 || d.eat.hp !== 0 || d.eat.effect)) {
      // (poison — a deadly mushroom's ten of health, off at once: the bar's grey end jumps)
      const ev = eatVital(this.body, d.eat.food, d.eat.hp, d.eat.effect, this.vitalsR);
      if (ev.sapped > 0) {
        this.vitHud?.sap();
        this.sound('hurt', 0.6);
      }
      if (ev.died) this.onDeath('sick');
    }
    // (a juicy fruit quenches as well: its water as so much drunk, 100 a litre — docs/ND/PLAN.md)
    if (d.eat?.water) drinkVital(this.body, 'water', d.eat.water / 100);
    if (d.heal) {
      medicate(this.body, d.heal.hp, d.heal.warm ?? 0, this.vitalsR);
      if (d.heal.cap) mendVital(this.body, d.heal.cap, this.vitalsR);
      if (d.heal.cure) cureVital(this.body);
      if (d.heal.treat) treatVital(this.body, 0, this.vitalsR);
    }
    // (eaten: the body's bars say so)
    this.events.emit('body:ate', { item });
  }

  drank(liquid: DrinkLiquid, litres: number): void {
    drinkVital(this.body, liquid, litres);
    // (said every frame the drink flows: only when someone listens, and with the one payload)
    if (this.events.has('body:drank')) {
      const e = this.drankEvent;
      e.liquid = liquid;
      e.litres = litres;
      this.events.emit('body:drank', e);
    }
  }

  /** one died: a first-aid kit carried brings one up again; else the restore points */
  private onDeath(why: VitalsEvents['why']): void {
    if (this.deadT >= 0) return;
    this.deadT = 0;
    const WHY: Partial<Record<VitalsEvents['why'], string>> = { starve: '饿得撑不住了。', thirst: '渴得撑不住了。', cold: '冻得撑不住了。', heat: '热得撑不住了。', sick: '病得撑不住了。', fall: '摔得太重了。', crash: '撞得太重了。' };
    this.deathWhy = WHY[why] ?? '伤得太重了。';
    this.player.use = null;
    this.closeCargoList();
  }

  private deathWhy = '';

  private stepDeath(dt: number): void {
    this.deadT += dt;
    if (this.deadT < 1.6) return;
    // a first-aid kit in the hands or the backpack: up again
    const slot = this.player.slots.findIndex((h) => h?.kind === 'item' && !!itemDef(h.item.item).revive);
    if (slot >= 0 && !this.death?.open) {
      const h = this.player.slots[slot] as { kind: 'item'; item: ItemInstance };
      const hp = itemDef(h.item.item).revive!.hp;
      this.player.slots[slot] = null;
      reviveVital(this.body, hp);
      this.deadT = -1;
      this.ui.say(`${itemDef(h.item.item).name.zh}救了你一命。`, 3);
      return;
    }
    // (a test page, not kept: straight up again)
    if (!this.params.keep) {
      reviveVital(this.body, 50);
      this.deadT = -1;
      this.ui.say('（不存档的页面：直接站起来了）', 2.5);
      return;
    }
    if (this.death?.open) return;
    this.death ??= new DeathCard(this.ui.root);
    this.ui.showHelp(false);
    this.ui.showAssists(null);
    const canvas = this.core.renderer.domElement;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    this.input.lockable = false;
    const pts = restorePoints();
    this.saveOff = true;
    this.death.show(
      this.deathWhy,
      pts.map((p) => ({ label: p.place === 'road' ? '在路上' : '在车库', ago: agoText(p.at) })),
      (i) => {
        if (useRestore(i)) location.reload();
      },
      // (back to the title: the game as it was last kept stays; a new game, another kept game are there)
      () => this.reopen(),
    );
  }

  // ------------------------------------------------------------------ what is in a vehicle (Tab)
  //
  // The list shows a source (listSources.ts): what rides in a vehicle, what is in a place's container, what one
  // has on, what is in a thing that holds things, a system's own. `listV` is what it is open on: for the three
  // the game has always had, the vehicle, 'self' or the container itself; for any other, its source.

  /** the lists' desk (listSources.ts): a system opens a list of its own with openList(source), without knowing the game */
  private readonly listDeskSet = setListDesk(this);
  /**
   * The source of what the list is open on, and what that was when the source was made. It is asked through a
   * guard (listSources.ts guardedSource): what a source's code throws is reported, as the kernel reports a
   * system's device that throws, the source then says it is out of reach and the list shuts; the frame goes on.
   */
  private listSrc: ListSource | null = null;
  private listSrcOf: unknown = null;
  private readonly listFault = (title: string, asked: string, e: unknown): void => this.kernel.report(`list source ${title} (${asked})`, e);
  /**
   * What the list keeps while it is open and what its keys do (listSources.ts Listing: the rows as last built,
   * the row picked after a move or a take, the put, what the list draws): here it is only handed the source,
   * the row picked (`listSel`) and the hands.
   */
  private readonly listing = new Listing();

  /**
   * Tab: the list of what is in the thing that holds things the mark is on (lying within reach), else of the
   * one in the hands; else of the vehicle the mark is on (or one stands by), else of what one has on. Open: shut it.
   */
  toggleCargoList(): void {
    if (this.listV) {
      this.closeCargoList();
      return;
    }
    if (this.seated) return;
    const box = boxOnMark(this) ?? boxInHand(this);
    if (box) {
      if (this.openList(boxSource(this, box))) this.sound('cloth');
      return;
    }
    const w = this.player.walker;
    let v = this.player.lookVehicle;
    if (!v) {
      let bd = 2.5;
      for (const c of this.vehicles) {
        const d = Math.hypot(c.sim.px - w.x, c.sim.pz - w.z) - c.sim.spec.body.halfLength;
        if (d < bd) {
          bd = d;
          v = c;
        }
      }
    }
    // (no vehicle by: what one has on)
    this.listV = v ?? 'self';
    this.listSel = 0;
    this.sound('door_open', 0.5, 'trunk');
  }

  /** the list opened on a source (a thing that holds things, a system's own box: listSources.ts); false: one is at the wheel, where no list opens */
  openList(src: ListSource): boolean {
    if (this.seated) return false;
    this.listV = src;
    this.listSel = 0;
    return true;
  }

  /** "这辆车" (carPage.ts) */
  private readonly carPage: CarPage;

  /** the vehicle one stands by — looked at, else the nearest within thirty metres — else the one one had last, else one's first */
  private carBy(): ModVehicle | null {
    const w = this.player.walker;
    let v: ModVehicle | null = this.player.lookVehicle;
    if (!v) {
      let bd = 30;
      for (const c of this.vehicles) {
        const d = Math.hypot(c.sim.px - w.x, c.sim.pz - w.z) - c.sim.spec.body.halfLength;
        if (d < bd) {
          bd = d;
          v = c;
        }
      }
    }
    return v ?? this.focus ?? this.vehicles[0] ?? null;
  }

  /** the start of a world of version 7 on: what makes the car "a car" is down the road (core/modcar/startKit.ts) */
  private get rough(): boolean {
    return this.kit === 'j5' && this.params.world >= 7;
  }

  addTabPage(page: TabPage): () => void {
    this.tabPages.push(page);
    return () => {
      const i = this.tabPages.indexOf(page);
      if (i < 0) return;
      if (this.tabAt === i) this.closeTab();
      else if (this.tabAt > i) this.tabAt--;
      this.tabPages.splice(i, 1);
    };
  }

  /** a page of the Tab screen is open (the game stands still as with a list) */
  get tabPageOpen(): boolean {
    return this.tabAt >= 0;
  }

  /** the Tab screen: on to the next page (1) or back (−1) — from the lists D goes to the first page, and A from it back to the lists */
  turnTab(dir: -1 | 1): void {
    const n = this.tabPages.length;
    if (this.tabAt < 0) {
      if (dir < 0 || !n || this.seated) return;
      this.closeCargoList();
      this.tabAt = 0;
      this.tabPages[0].show(true);
      return;
    }
    const to = this.tabAt + dir;
    if (to >= n) return;
    this.tabPages[this.tabAt].show(false);
    this.tabAt = to;
    if (to < 0) this.toggleCargoList();
    else this.tabPages[to].show(true);
  }

  openTab(id: string): void {
    const i = this.tabPages.findIndex((p) => p.id === id);
    if (i < 0 || i === this.tabAt || this.seated) return;
    if (this.tabAt >= 0) this.tabPages[this.tabAt].show(false);
    this.closeCargoList();
    this.tabAt = i;
    this.tabPages[i].show(true);
  }

  closeTab(): void {
    if (this.tabAt >= 0) {
      const p = this.tabPages[this.tabAt];
      this.tabAt = -1;
      p.show(false);
    }
    if (this.listV) this.closeCargoList();
  }

  closeCargoList(): void {
    this.listV = null;
    this.listSrc = null;
    this.listSrcOf = null;
    this.listing.reset();
    this.cargoList?.show(null);
    this.listingL.reset();
    this.cargoListL?.show(null);
    this.listSide = 1;
    this.listSelL = 0;
  }

  /** a vehicle's list is open: the hands' beside it */
  private get pairedList(): boolean {
    return this.listV instanceof ModVehicle;
  }

  /** A or D in the two lists: the other one is worked */
  private switchListSide(to: 0 | 1): void {
    if (!this.pairedList || this.listSide === to) return;
    this.listSide = to;
    this.sound('switch', 0.25);
  }

  /** the source of what the list is open on (null: it is shut) */
  private listSource(): ListSource | null {
    const v = this.listV;
    if (!v) return null;
    if (this.listSrcOf !== v || !this.listSrc) {
      this.listSrcOf = v;
      this.listSrc = guardedSource(v === 'self' ? selfSource(this) : isContainer(v) ? placeSource(this, v) : v instanceof ModVehicle ? vehicleSource(this, v) : v, this.listFault);
    }
    return this.listSrc;
  }

  private moveListSel(d: number): void {
    if (this.pairedList && this.listSide === 0 && this.handsList) {
      const sel = this.listingL.move(this.handsList, this.listSelL, d);
      if (sel < 0) return;
      this.listSelL = sel;
      this.sound('switch', 0.25);
      return;
    }
    const src = this.listSource();
    if (!src) return;
    const sel = this.listing.move(src, this.listSel, d);
    if (sel < 0) return;
    this.listSel = sel;
    this.sound('switch', 0.25);
  }

  /** a container's list of what is in it (a place's cupboard, its crate, its shelves) */
  private openContainerList(pc: PlaceContainer): void {
    this.listV = pc;
    this.listSel = 0;
  }

  /** the picked thing out of what the list shows, into the hands (as much of it as they take); a take that empties a vehicle's or a container's list shuts it */
  takeFromList(): void {
    const src = this.listSource();
    if (!src) return;
    // (from the hands' list: the picked thing into the vehicle, where G held looking at it would pack it: player.ts packIn)
    if (this.pairedList && this.listSide === 0 && this.handsList) {
      const slot = this.handsList.slotOf[this.listSelL];
      if (slot === undefined || !(this.listV instanceof ModVehicle)) return;
      this.player.sel = slot;
      this.player.packIn(this.listV);
      return;
    }
    const sel = this.listing.take(src, this.listSel);
    if (sel < 0) this.closeCargoList();
    else this.listSel = sel;
  }

  /** G in a list: the thing in the hands into what the list shows, as much of it as goes (a source that takes things in) */
  putIntoList(): void {
    const src = this.listSource();
    if (src) this.listing.put(src, this.player);
  }

  /** the list as it stands (shut when one walked off, the vehicle drove away or the thing it shows is gone) */
  private showCargoList(): void {
    const src = this.listSource();
    if (!src) return;
    this.cargoList ??= new CargoList(this.ui.root);
    const sel = this.listing.frame(src, this.listSel, this.player.held);
    if (sel < 0) {
      this.closeCargoList();
      return;
    }
    this.listSel = sel;
    const paired = this.pairedList;
    this.listing.view.pair = paired;
    // (D from the last list goes on to the Tab screen's first page: said in its foot)
    this.listing.view.next = (!paired || this.listSide === 1) && this.tabPages.length ? this.tabPages[0].title : '';
    this.cargoList.side(paired ? 'r' : 'mid', !paired || this.listSide === 1);
    this.cargoList.show(this.listing.view);
    // beside a vehicle's list: the hands'
    if (paired) {
      this.handsList ??= new HandsList(this);
      this.cargoListL ??= new CargoList(this.ui.root);
      const selL = this.listingL.frame(this.handsList, this.listSelL, null);
      this.listSelL = Math.max(0, selL);
      this.listingL.view.pair = true;
      this.cargoListL.side('l', this.listSide === 0);
      this.cargoListL.show(this.listingL.view);
    } else this.cargoListL?.show(null);
  }

  /** the workshop as it was left: its vehicles, what lay about, the checklist, where one stood */
  private restoreGarage(s: SaveV1): void {
    for (const sv of s.vehicles) {
      const v = this.addVehicle(sv.build, sv.x, sv.z, sv.yaw);
      v.radioOn = !!sv.radioOn;
      v.radioSong = sv.radioSong ?? 0;
      if ((sv.room ?? 0) < roomRev(sv.build.frame)) this.roomOld.add(v);
    }
    this.focus = this.vehicles[0] ?? null;
    this.restoreLoose(s.loose);
    for (const d of s.done) this.done.add(d);
    this.player.walker.place(s.player.x, s.player.z, s.player.heading);
    this.input.lookYaw = s.player.heading;
    this.restoreHands(s);
    // (the one world: back in the seat of the vehicle one sat in, down the road or in the yard)
    const sv = s.seat !== undefined ? this.vehicles[s.seat] : undefined;
    if (sv && this.seamless) {
      this.seated = sv;
      this.focus = sv;
      this.seatAt = s.seatAt === 'pass' && passengerSeat(sv) ? 'pass' : 'driver';
      this.seatSlide = this.seatAt === 'pass' ? 1 : 0;
      if (s.place === 'road') sv.sys.startNow();
    }
    // (inside a vehicle's living space: back where one stood in it)
    const av = s.aboard ? this.vehicles[s.aboard.v] : undefined;
    if (av && s.aboard && this.seamless && !this.seated && aboardOf(av.view.frame.id)) {
      const ab = new Aboard(av, [s.aboard.x, s.aboard.z], s.aboard.yaw);
      this.player.goAboard(ab);
      this.input.lookYaw = ab.heading() + s.aboard.yaw;
    }
  }

  /** the hotbar as it was */
  private restoreHands(s: SaveV1): void {
    if (s.body && typeof s.body.hp === 'number') {
      this.body = { ...newVitals(), ...s.body };
      if (typeof s.sleptAt === 'number') this.sleptAt = s.sleptAt;
      if (this.body.dead || this.body.hp <= 0) {
        this.body.dead = true;
        this.onDeath('');
      }
    }
    // (a backpack on: its slots first)
    if (s.pack) {
      this.player.pack = backInTheWorld(s.pack);
      const n = 2 + (itemDef(s.pack.item).pack?.slots ?? 0);
      while (this.player.slots.length < n) this.player.slots.push(null);
    }
    (s.hands ?? []).forEach((h, i) => {
      const held: Held = h?.part ? { kind: 'part', inst: h.part } : h?.tool ? { kind: 'tool', tool: h.tool } : h?.item ? { kind: 'item', item: backInTheWorld(h.item) } : null;
      if (i < this.player.slots.length) this.player.slots[i] = held;
      // (a slot the hotbar has no more: the backpack that gave it is of a kind this build does not have and was
      // left out of the save as it was read, or it gives fewer slots now. What was in it is not lost.)
      else if (held) this.setDown(held);
    });
    this.player.sel = s.sel !== undefined && s.sel >= 0 && s.sel < this.player.slots.length ? s.sel : 0;
    this.buffs.restore(s.buffs);
    // (what one has on; a save from before there were clothes to wear: the old jacket and shoes, as one always had on)
    this.player.worn = {};
    const worn = s.worn ?? oldClothes();
    for (const [slot, it] of Object.entries(worn)) if (it) this.player.worn[slot as WearSlot] = backInTheWorld(it);
  }

  /** a thing put down where one stands (what a save held in a slot the hotbar no longer has) */
  private setDown(h: NonNullable<Held>): void {
    const w = this.player.walker;
    const l = h.kind === 'part' ? this.loose.addPart(h.inst, w.x, w.y + 1, w.z, w.heading) : h.kind === 'item' ? this.loose.addItem(h.item, w.x, w.y + 1, w.z, w.heading) : this.loose.addTool(h.tool, w.x, w.y + 1, w.z, w.heading);
    this.loose.drop(l);
  }

  // ------------------------------------------------------------------ saving

  private saveT = 0;
  /** no more saving (a new game is about to begin) */
  private saveOff = false;
  private newGameAsked = -1;

  /** the game as it stands, for save.ts; null while it cannot be (screenshots, the fade to the road) */
  snapshot(): SaveV1 | null {
    if (this.params.shot || this.fadeT >= 0 || !this.vehicles.length) return null;
    const w = this.player.walker;
    // (the wrecks by the road are not one's own: they come back from the world, the touched ones as `wrecks` keeps them)
    const own = this.vehicles.filter((v) => !this.wrecks?.isWreck(v));
    const loose: SavedLoose[] = this.loose.list.filter((l) => !(l.riding && this.wrecks?.isWreck(l.riding.on as ModVehicle)) && !this.places?.owns(l)).map((l) => {
      const r = l.riding;
      const on = r ? own.indexOf(r.on as ModVehicle) : -1;
      return { part: l.part ?? undefined, tool: l.tool ?? undefined, item: l.item ?? undefined, x: l.x, y: l.y, z: l.z, yaw: l.yaw, ...(r && on >= 0 ? { on, pos: r.pos.toArray(), rot: r.rot.toArray(), ...(l.stow ? { zone: l.stow } : {}), ...(l.lie ? { lie: l.lie } : {}) } : {}) };
    });
    const s: SaveV1 = {
      v: 1,
      at: Date.now(),
      place: this.place,
      hour: this.env.clock.hourAt(this.time),
      done: [...this.done],
      vehicles: own.map((v) => ({ build: v.build, x: v.sim.px, z: v.sim.pz, yaw: v.sim.yaw, radioOn: v.radioOn, radioSong: v.radioSong, ...(roomRev(v.build.frame) ? { room: roomRev(v.build.frame) } : {}) })),
      loose,
      player: { x: w.x, z: w.z, heading: w.heading },
      // (the two slots go on with the player, to the road too)
      hands: this.player.slots.map((h) => (h ? (h.kind === 'part' ? { part: h.inst } : h.kind === 'item' ? { item: h.item } : { tool: h.tool }) : null)),
      sel: this.player.sel,
      ...(this.player.pack ? { pack: this.player.pack } : {}),
      worn: { ...this.player.worn },
      body: this.body,
      ...(this.sleptAt === this.sleptAt ? { sleptAt: this.sleptAt } : {}),
      ...(this.buffs.count ? { buffs: this.buffs.snapshot() } : {}),
      difficulty: this.difficulty,
      look: { ...this.look },
      playS: Math.round(this.playS),
      ...(this.journal.save() ? { journal: this.journal.save() } : {}),
      kit: this.kit,
      stock: { ...this.stock },
      ...(this.learned.size ? { learned: [...this.learned] } : {}),
      ...(this.sheets.size ? { sheets: Object.fromEntries(this.sheets) } : {}),
      ...(Object.keys(this.kits).length ? { kits: JSON.parse(JSON.stringify(this.kits)) as KitsState } : {}),
      ...(this.addedFinds.length ? { finds: this.addedFinds.map((f) => ({ ...f })) } : {}),
      ...(Object.keys(this.rescue).length ? { rescue: { ...this.rescue } } : {}),
      ...(this.workshop ? { workshop: this.workshop.snapshot() } : this.workshopKept ? { workshop: this.workshopKept } : {}),
    };
    if (this.seamless && this.world) {
      // (one world: everything where it is, the world's seed and the generator it is of, the vehicle one sits in)
      s.world = savedWorldOf(this.world, this.params.seed);
      if (this.seated && own.includes(this.seated)) {
        s.seat = own.indexOf(this.seated);
        if (this.seatAt === 'pass') s.seatAt = 'pass';
      }
      const ab = this.player.aboard;
      if (ab && own.includes(ab.v)) s.aboard = { v: own.indexOf(ab.v), x: ab.w.x, z: ab.w.z, yaw: ab.w.yaw };
    } else if (this.place === 'road' && this.world) {
      // (on the road only the vehicle one drives goes on)
      const v = this.seated ?? this.focus ?? own[0];
      const vi = own.indexOf(v);
      s.vehicles = s.vehicles.filter((_, i) => i === vi);
      // (and what rides on it)
      s.loose = s.loose.filter((l) => l.on === vi).map((l) => ({ ...l, on: 0 }));
      s.road = { s: this.world.spine.sAtX(v.sim.px), ...savedWorldOf(this.world, this.params.seed) };
    }
    if (this.wrecks) s.wrecks = this.wrecks.snapshot();
    if (this.places) s.places = { ...this.places.snapshot(), ...(this.doors ? { doors: this.doors.snapshot() } : {}) };
    // (a world of version 2: how far along the road everything is, and what kind each place remembered is, for
    // a later revision of the generator to put it back by — worldSave.ts)
    if (this.world) stampWorld(s, this.world, this.restore?.world?.sites);
    // (the V3 systems' parts, where any has something to keep, and the world's clock)
    this.kernel.write(s);
    return s;
  }

  /** write the save now (also when the page goes out of sight) */
  save(): void {
    if (this.saveOff || !this.params.keep || this.deadT >= 0) return;
    // (what stands behind the title before a game is begun or gone on with is no game: nothing of it is kept — a
    // window let go of at the title left a save of a game never played)
    if (!this.played && !this.restore) return;
    const s = this.snapshot();
    if (s) {
      // (a save the browser will not keep was a silent thing; with the systems' parts in it, and six restore
      // points beside it, a full storage is nearer: said once, and it is the test hook's last error)
      if (!writeSave(s)) this.kernel.report('save', new Error('the browser would not keep the save (its storage is full or shut): the game goes on unsaved'), '存档没能写进去：浏览器的存储满了或者用不了，眼下的进度存不下来。');
      // (its place's card: written now as it stands, and again with a picture once the next frame is drawn)
      this.keepCard(false);
      this.cardDue = true;
      this.keepGrime();
    }
  }

  /**
   * The card of the place the game is kept in (slots.ts SlotMeta): the day, how far, the car, how hard, how long
   * played — and, when the frame just drawn can be had, a small picture of it (the picture before stays otherwise).
   */
  private keepCard(shot: boolean): void {
    if (!this.params.keep || this.params.shot) return;
    const i = activeSlot();
    const was = slotMeta(i);
    let pic = was?.shot;
    if (shot) {
      try {
        const c = (this.cardShot ??= document.createElement('canvas'));
        c.width = 256;
        c.height = 144;
        const src = this.core.renderer.domElement;
        const g = c.getContext('2d');
        if (g && src.width > 0) {
          g.drawImage(src, 0, 0, c.width, c.height);
          pic = c.toDataURL('image/jpeg', 0.62);
        }
      } catch {
        // (the picture before stays)
      }
    }
    const v = this.seated ?? this.focus ?? this.vehicles.find((x) => !this.wrecks?.isWreck(x)) ?? null;
    const day = ((this.clock as unknown as { day?: number }).day ?? 0) + 1;
    writeSlotMeta(i, { day, km: Math.round(((this.place === 'road' ? this.roadS : (this.restore?.road?.s ?? 0)) / 1000) * 10) / 10, car: v ? v.view.frame.name.zh : '', difficulty: DIFFICULTY[this.difficulty].name.zh, minutes: Math.round(this.playS / 60), at: Date.now(), shot: pic });
  }

  /** the three places for a game, as the menu's cards show them */
  private slotCards(): { i: number; active: boolean; has: boolean; meta: ReturnType<typeof slotMeta> }[] {
    const now = activeSlot();
    const out = [];
    for (let i = 0; i < SLOTS; i++) out.push({ i, active: i === now, has: slotHasSave(i), meta: slotMeta(i) });
    return out;
  }

  /** the page opened again as it is (the picture's quality kept), the game let go of first */
  private reopen(): void {
    const quality = new URLSearchParams(location.search).get('quality');
    this.saveOff = true;
    this.dispose();
    location.replace(`${location.pathname}${quality ? `?quality=${encodeURIComponent(quality)}` : ''}`);
  }

  /** go on with the game kept in a place: this one kept first, then the page opened again on that one, straight into it */
  private loadSlot(i: number): void {
    if (!slotHasSave(i)) return;
    if (i === activeSlot() && (this.played || this.restore)) return this.play();
    if (this.played || this.restore) this.save();
    setActiveSlot(i);
    try {
      localStorage.setItem(GO_ON_KEY, '1');
    } catch {
      /* storage unavailable: the title, one click more */
    }
    this.reopen();
  }

  /** a place emptied; the one the page goes on with: the page opened again on nothing (the title, a new game behind it) */
  private deleteSlot(i: number): void {
    const here = i === activeSlot();
    if (here) this.saveOff = true;
    clearSlot(i);
    if (here) this.reopen();
  }

  /** a place's game handed to the browser as a file (the game in play kept first, so that the file is of now) */
  private exportSlotFile(i: number): void {
    if (i === activeSlot()) this.save();
    const text = exportSlot(i);
    if (!text) return;
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.download = `the-long-way-${i + 1}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch {
      /* the browser would not hand it over */
    }
  }

  /** a file's text put into a place; into the one the page goes on with: the page opened again on it */
  private importSlotText(i: number, text: string): string | null {
    const here = i === activeSlot();
    if (here) this.saveOff = true;
    const why = importSlot(i, text);
    if (why) {
      if (here) this.saveOff = false;
      return why;
    }
    if (here) this.reopen();
    return null;
  }

  /** the pause: the game kept, and the page opened again on the title */
  private toTitle(): void {
    this.save();
    this.reopen();
  }

  /** her look chosen (a new game's): what the game keeps, and what she is drawn in */
  setLook(l: { skin?: number; helmet?: number } | null | undefined): void {
    this.look = cleanLook(l);
    // (asked for as the game is made, before she is: she takes it as she is made — the constructor)
    (this.her as HerInGame | undefined)?.setLook(this.look);
  }

  /** the masks of what is being cleaned kept with the save (IndexedDB): the ones changed since; the rest forgotten */
  private keepGrime(): void {
    const g = this.grime;
    if (!g || this.player.scrub) return;
    const keys = new Set(g.keys);
    // (a mask still on its way back from the store after a reload is kept too)
    for (const v of this.vehicles) {
      if (v.build.grime) keys.add(`${v.build.uid}:body`);
      for (const inst of Object.values(v.build.parts)) {
        if (inst.grime) keys.add(inst.uid);
        for (const sub of Object.values(inst.sub)) if (sub.grime) keys.add(sub.uid);
      }
    }
    for (const l of this.loose.list) if (l.part?.grime) keys.add(l.part.uid);
    for (const k of this.wrecks?.keptGrimeKeys() ?? []) keys.add(k);
    // the coats of paint, the same way (their key: the mask's and ':coat')
    for (const v of this.vehicles) {
      if (v.build.coat) keys.add(`${v.build.uid}:body:coat`);
      for (const inst of Object.values(v.build.parts)) if (inst.coat) keys.add(`${inst.uid}:coat`);
    }
    for (const l of this.loose.list) if (l.part?.coat) keys.add(`${l.part.uid}:coat`);
    const cs = this.coats;
    if (cs) {
      for (const key of cs.keys) {
        keys.add(`${key}:coat`);
        const c = cs.get(key)!;
        if (!c.changed) continue;
        c.changed = false;
        void keepMask(`${key}:coat`, c.size, cs.read(c), { dirt: [], rust: [] });
      }
    }
    for (const key of g.keys) {
      const m = g.get(key)!;
      if (!m.changed) continue;
      m.changed = false;
      void keepMask(key, m.size, g.read(m), { dirt: [...m.doneDirt], rust: [...m.doneRust] });
    }
    void keepOnly(keys);
  }

  /** after a reload: the parts marked as being cleaned take their masks back from the store */
  private async restoreGrime(): Promise<void> {
    const g = this.grime;
    if (!g) return;
    for (const v of this.vehicles) await this.restoreGrimeOf(v);
    // (and the things lying about)
    for (const l of this.loose.list) {
      for (const p of this.loose.grimeParts(l)) {
        if (!p.inst.grime || g.get(p.inst.uid)) continue;
        const kept = await keptMask(p.inst.uid, p.size);
        const o = this.grimeOwnerOf(null, p.owner, l);
        if (!o) continue;
        if (!kept) {
          p.inst.grime = false;
          continue;
        }
        const m = g.open(o, kept.texels);
        for (const u of kept.doneDirt) m.doneDirt.add(u);
        for (const u of kept.doneRust) m.doneRust.add(u);
        m.changed = false;
        this.loose.setGrimeHeld(l.uid, true);
      }
    }
  }

  /** a vehicle's parts marked as being cleaned take their masks back from the store (after a reload; a kept wreck come back) */
  private async restoreGrimeOf(v: ModVehicle): Promise<void> {
    const g = this.grime;
    if (!g) return;
    for (const p of v.view.grimeParts()) {
      const marked = p.inst ? p.inst.grime : v.build.grime;
      if (!marked || g.get(p.key)) continue;
      const kept = await keptMask(p.key, p.size);
      const o = this.grimeOwnerOf(v, p.owner);
      if (!o || g.get(p.key)) continue;
      if (!kept) {
        // (the store lost it: the part as its figures show it)
        if (p.inst) p.inst.grime = false;
        else v.build.grime = false;
        continue;
      }
      const m = g.open(o, kept.texels);
      for (const u of kept.doneDirt) m.doneDirt.add(u);
      for (const u of kept.doneRust) m.doneRust.add(u);
      m.changed = false;
      v.view.setGrimeHeld(p.owner, true);
      this.cleaning.set(p.key, { v, loose: null, owner: p.owner, key: p.key, label: p.label, kind: p.kind, units: [], measuredAt: -1, dirty: true, flash: 0, flashUnit: -1 });
    }
  }

  // ------------------------------------------------------------------ the main menu

  /** is the menu up (the game stands still behind it: the page's loop steps it by nothing) */
  get menuOpen(): boolean {
    return this.menu.isOpen;
  }

  /** the menu over the game: the title (a game not yet begun or gone on with), or the pause */
  openMenu(mode: MenuMode): void {
    if (mode === 'title') this.played = false;
    this.menu.open(mode);
    this.audio.hold(true);
    this.input.lockable = false;
    const canvas = this.core.renderer.domElement;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    this.ui.showHelp(false);
  }

  /** the game goes on (or begins): the menu shut, the voices let go, the key card if it is owed, the mouse taken */
  play(): void {
    this.played = true;
    if (this.menu.isOpen) this.menu.close();
    this.audio.hold(false);
    this.input.lockable = true;
    if (this.helpDue) {
      // (the very first start: the key card until the first click, which takes the mouse)
      this.helpDue = false;
      this.ui.showHelp(true);
      return;
    }
    if (this.params.shot) return;
    const canvas = this.core.renderer.domElement;
    try {
      void (canvas.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {});
    } catch {
      /* a click will do */
    }
  }

  /** the line under 继续游戏: the day of the journey, where one is, how hard */
  private resumeLine(): string {
    const day = (this.clock as unknown as { day?: number }).day ?? 0;
    const where = this.place === 'garage' ? '车库' : '路上';
    return `第 ${day + 1} 天 · ${where} · ${DIFFICULTY[this.difficulty].name.zh}`;
  }

  private menuHost(): MenuHost {
    return {
      canResume: () => !!this.restore || this.played,
      resumeLine: () => this.resumeLine(),
      resume: () => this.play(),
      begin: (d, o) => {
        // (the game behind the title not yet begun, the place it would be kept in the one chosen, no journey's number
        // asked for: this is the new game, at that difficulty, she as chosen)
        if (!this.restore && !this.played && (!o || (o.slot === activeSlot() && o.seed === null && !slotHasSave(o.slot)))) {
          this.setDifficulty(d);
          if (o) this.setLook(o);
          this.play();
        } else this.newGame(d, o);
      },
      slots: () => this.slotCards(),
      loadSlot: (i) => this.loadSlot(i),
      deleteSlot: (i) => this.deleteSlot(i),
      exportSlot: (i) => this.exportSlotFile(i),
      importSlot: (i, text) => this.importSlotText(i, text),
      toTitle: () => this.toTitle(),
      isFullscreen: () => !!document.fullscreenElement,
      toggleFullscreen: () => {
        try {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen();
        } catch {
          /* the browser would not */
        }
      },
      endsGame: () => !!this.restore || this.played,
      settings: () => ({ ...this.settings }),
      setSettings: (st) => this.applySettings(st),
      assists: () => this.assistItems(),
      unstick: () => ({ car: this.vehicles.some((v) => !v.view.frame.towed), bed: this.canBackToBed() }),
      unstickCar: () => this.unstickCar(),
      backToBed: () => this.backToBed(),
      toggleAssist: (i) => {
        const e = ASSIST_LABELS[i];
        if (!e) return;
        this.assists[e[0]] = !this.assists[e[0]];
        saveAssists(this.assists);
      },
    };
  }

  /** the picture's quality as the first visit's trial of the machine found it: kept, and the page opened again in it */
  applyQuality(q: Settings['quality']): void {
    this.applySettings({ ...this.settings, quality: q, tried: true });
  }

  /** the settings taken up and kept: the volume and the mouse at once, the picture's quality by opening the page again (the game kept first) */
  private applySettings(st: Settings): void {
    const was = this.settings.quality;
    this.settings = { ...st };
    saveSettings(this.settings);
    this.audio.setVolume(st.volume);
    this.input.lookScale = st.look;
    this.input.invertY = st.invertY;
    if (st.quality !== was && !this.params.shot) {
      // (chosen by hand: the first visit's trial of the machine does not choose again)
      this.settings.tried = true;
      saveSettings(this.settings);
      // (a game gone on with or begun is kept first; what stands behind the title before either is none)
      if (this.played || this.restore) this.save();
      const q = new URLSearchParams(location.search);
      q.delete('quality');
      const rest = q.toString();
      this.saveOff = true;
      this.dispose();
      location.replace(`${location.pathname}${rest ? `?${rest}` : ''}`);
    }
  }

  /** the journey's difficulty (a new game's choice in the menu): the body's rules follow it */
  setDifficulty(d: Difficulty): void {
    this.difficulty = d;
    this.vitalsR = vitalsRules(d);
    for (const v of this.vehicles ?? []) v.sys.wearK = DIFFICULTY[d].wear;
  }

  /** F9 twice: the save cleared and a new game from the workshop */
  private askNewGame(): void {
    if (this.newGameAsked >= 0 && this.time - this.newGameAsked < 3) {
      this.newGame();
      return;
    }
    this.newGameAsked = this.time;
    this.ui.say('再按一次 F9：清除存档，从车库重新开始。', 3);
  }

  /**
   * The save cleared and a new game from the workshop, as on a first visit: nothing more written as the page
   * goes, and the page opened again at its plain address — what the address asked for of its own (the road, a
   * build, a seed, a version of the world's generator, the developer's panel open again after the world was made
   * again) dropped, the picture's quality kept. The restore points go with the save (a death in the new game
   * would offer the old game's), whichever way the new game was asked for: F9 twice, the developer's panel, the
   * death screen.
   */
  newGame(difficulty: Difficulty = this.difficulty, o?: { slot: number; skin: number; helmet: number; seed: number | null }): void {
    // (into another place than the game in play is kept in: that game is kept first, and stays)
    // (a game: one gone on with or begun — what stands behind the title before either is none, and is not kept)
    const slot = o?.slot ?? activeSlot();
    if (slot !== activeSlot()) {
      if (this.played || this.restore) this.save();
      setActiveSlot(slot);
    }
    this.saveOff = true;
    try {
      localStorage.setItem(NEW_DIFFICULTY_KEY, difficulty);
      if (o) localStorage.setItem(NEW_LOOK_KEY, JSON.stringify({ skin: o.skin, helmet: o.helmet }));
      else localStorage.removeItem(NEW_LOOK_KEY);
    } catch {
      /* storage unavailable: the normal one */
    }
    clearSave();
    clearRestores();
    clearSlot(slot);
    // (the grime masks are the cars' of every place: forgotten only when no other place has a game)
    let others = false;
    for (let i = 0; i < SLOTS; i++) if (i !== slot && slotHasSave(i)) others = true;
    if (!others) void forgetMasks();
    // (the V3 systems' parts of the save and the world's clock: as a new game starts, and said)
    this.kernel.newGame(this.env.clock.hourAt(this.time));
    // (a new world each new game, Arctic Drive's: a seed of its own for it, kept with its save from then on)
    // (… or the journey's number asked for: the same number is the same road — docs/V3/plan/finish.md §十四)
    try {
      localStorage.setItem(NEW_SEED_KEY, String(o?.seed ?? 1 + Math.floor(Math.random() * 999_999)));
    } catch {
      /* storage unavailable: the first world again */
    }
    const quality = new URLSearchParams(location.search).get('quality');
    this.dispose();
    location.replace(`${location.pathname}${quality ? `?quality=${encodeURIComponent(quality)}` : ''}`);
  }

  addVehicle(build: Build, x: number, z: number, yaw: number): ModVehicle {
    const gy = this.groundAt(x, z);
    const v = new ModVehicle(this.core, build, x, gy + 0.05, z, yaw, this.ground);
    // (it wears at the difficulty's pace: docs/V3/plan/growth.md §五)
    v.sys.wearK = DIFFICULTY[this.difficulty].wear;
    this.vehicles.push(v);
    this.player.addSolids(v.solid);
    this.vehicleSolids.add(v.solid);
    this.roadSolids(v);
    return v;
  }

  /** a vehicle gone from the world (a wreck left far behind), with what rode in it */
  removeVehicle(v: ModVehicle): void {
    const i = this.vehicles.indexOf(v);
    if (i < 0) return;
    for (const l of this.loose.ridersOf(v)) this.loose.remove(l);
    this.vehicles.splice(i, 1);
    this.player.removeSolids(v.solid);
    this.vehicleSolids.remove(v.solid);
    this.cargo.forget(v);
    this.sparkDue.delete(v);
    // (what was being cleaned on it: its masks stay, taken up again if it comes back)
    for (const [key, c] of this.cleaning) if (c.v === v) this.cleaning.delete(key);
    if (this.lastGear.v === v) this.lastGear.v = null;
    if (this.focus === v) this.focus = null;
    if (this.seated === v) this.seated = null;
    v.view.dispose();
  }

  /** what the places need of the game */
  private placesHost(): PlacesHost {
    const game = this;
    return {
      get world() {
        return game.world;
      },
      // (what turns up down the road: docs/V3/plan/growth.md §六 3 — the world's seed, the difficulty; 400 km of it)
      // (as far as anyone drives: the plan's first stretch is the same however far it is laid)
      // (a world of version 7: fitted to its places, with what the road ahead asks for — places.ts worldPlan)
      planned: () => (game.world ? worldPlan(game.world, game.params.seed, game.difficulty) : null),
      climate: (s) => (game.params.world >= 7 && game.world ? climateAhead(game.regionsTo(s + 20_000), s) : 'mild'),
      supply: () => (game.params.world >= 7 && game.world ? supplyFactors(game.stockNow()) : undefined),
      blueprintAt: (slot, chapter, s, want) => game.blueprintAt(slot, chapter, s, want),
      added: () => game.addedFinds,
      withheld: (key) => game.withheld(key),
      // (… while one still has it: lost or taken to pieces, the next one down the road is there again)
      begun: (key) => game.params.world >= 7 && kitBegun(game.kits, key) && game.hasThing(key),
      besideOf: (site) => game.wrecks?.besideAt(site) ?? [],
      keep: () => (game.world ? Math.min(1, PLACES_KEEP * DIFFICULTY[game.difficulty].supply) : 1),
      get origin() {
        return game.core.origin;
      },
      loose: this.loose,
      get vehicles() {
        return game.vehicles;
      },
      play: (name, opts, delay) => {
        const f = this.sounds();
        const ctx = this.audio.context;
        if (f && ctx && (FOLEY_SHOTS as readonly string[]).includes(name)) f.play(name as FoleyShot, (opts ?? {}) as FoleyOpts, delay ? ctx.currentTime + delay : 0);
      },
      warm: (name, opts) => {
        if ((FOLEY_SHOTS as readonly string[]).includes(name) || (FOLEY_LOOPS as readonly string[]).includes(name)) this.warmQueue.push([name as FoleyShot, (opts ?? {}) as FoleyOpts]);
      },
      loop: (name, opts) => {
        if ((FOLEY_LOOPS as readonly string[]).includes(name)) this.loopsNow.set(name as FoleyLoop, (opts ?? {}) as FoleyOpts);
      },
      say: (text, seconds) => this.ui.say(text, seconds),
      openContainer: (pc) => this.openContainerList(pc),
      fuelled: (v) => {
        v.sys.rebuild();
        v.awake = 1;
      },
      makeWorkshop: (site, save) => this.makeRoadWorkshop(site, save),
      dropWorkshop: (ws) => this.dropRoadWorkshop(ws),
      opened: (id) => this.siteArt?.open(id),
      setOpen: (id, open) => this.siteArt?.setOpen(id, open),
      movesOf: (id, site) => this.siteArt?.movesOf(id, site) ?? null,
      slots: (id, site) => (this.siteArt ? this.siteArt.slotsOf(id, site) : []),
      measure: (h) => this.cargo.measured(h),
    };
  }

  /** what the wrecks need of the game */
  private wreckHost(): WreckHost {
    const game = this;
    return {
      get world() {
        return game.world;
      },
      core: this.core,
      addVehicle: (b, x, z, yaw) => this.addVehicle(b, x, z, yaw),
      removeVehicle: (v) => this.removeVehicle(v),
      stowLoot: (v, roll) => this.stowLoot(v, roll),
      stowFittings: (v) => this.stowFittings(v),
      ridersOf: (v) => this.ridersSaved(v),
      restoreRiders: (v, list, room) => this.restoreRiders(v, list, room),
      restoreGrimeOf: (v) => void v.view.settled().then(() => this.restoreGrimeOf(v)),
    };
  }

  /** what was left in a wreck, put in its boot or its bed (the first zone with room; what finds none is left out) */
  private async stowLoot(v: ModVehicle, roll: WreckRoll): Promise<void> {
    const things: NonNullable<Held>[] = [...roll.items.map((id): NonNullable<Held> => ({ kind: 'item', item: newItem(id) })), ...roll.tools.map((t): NonNullable<Held> => ({ kind: 'tool', tool: t }))];
    for (const h of things) {
      // (its own box once its model is in: packed by its real size)
      if (!this.cargo.boxOf(h)) {
        await this.loose.objectFor(h);
        await new Promise((r) => setTimeout(r, 0));
      }
      if (!this.vehicles.includes(v)) return;
      const at = this.cargo.packSpot(v, h);
      if (at) this.cargo.stow(v, at.zone, at.spot, h);
    }
  }

  /**
   * What a found vehicle's frame comes with, put in its places (FrameDef.fittings: the Old Elephant's hobs on its
   * worktop): each where its place has room, packed by its real size once its model is in; what finds no room is left out
   */
  async stowFittings(v: ModVehicle): Promise<void> {
    for (const f of v.view.frame.fittings ?? []) {
      for (let k = 0; k < f.n; k++) {
        const h: NonNullable<Held> = { kind: 'item', item: newItem(f.item) };
        if (!this.cargo.boxOf(h)) {
          await this.loose.objectFor(h);
          for (let i = 0; i < 20 && !this.cargo.boxOf(h); i++) await new Promise((r) => setTimeout(r, 0));
        }
        if (!this.vehicles.includes(v)) return;
        // (spread evenly along its place, each turned as the frame has it — just there, off any grid; where that is taken,
        // as near as there is room)
        const zone = zoneOf(v.build.frame, f.zone as ZoneId);
        const near = f.at ? { x: f.at[0], z: f.at[1] } : zone ? { x: zone.x[0] + ((zone.x[1] - zone.x[0]) * (k + 0.5)) / f.n, z: (zone.z[0] + zone.z[1]) / 2 } : null;
        const at = this.cargo.spotIn(v, f.zone as ZoneId, h, near, f.yaw ?? 0, 0) ?? this.cargo.spotIn(v, f.zone as ZoneId, h);
        if (at) this.cargo.stow(v, at.zone, at.spot, h);
      }
    }
  }

  /** what rides in a vehicle, as a save has it (in its frame) */
  private ridersSaved(v: ModVehicle): SavedLoose[] {
    return this.loose.ridersOf(v).map((l) => ({
      part: l.part ?? undefined,
      tool: l.tool ?? undefined,
      item: l.item ?? undefined,
      x: l.x,
      y: l.y,
      z: l.z,
      yaw: l.yaw,
      pos: l.riding!.pos.toArray(),
      rot: l.riding!.rot.toArray(),
      ...(l.stow ? { zone: l.stow } : {}),
      ...(l.lie ? { lie: l.lie } : {}),
    }));
  }

  /** what rode in a vehicle, in it again where it was */
  private restoreRiders(v: ModVehicle, list: readonly SavedLoose[], room = 0): void {
    if (room < roomRev(v.build.frame) && list.length) this.roomOld.add(v);
    for (const l of list) {
      if (this.restowed(l, v)) continue;
      const thing = l.part ? this.loose.addPart(l.part, l.x, l.y + 0.05, l.z, l.yaw) : l.tool ? this.loose.addTool(l.tool, l.x, l.y + 0.05, l.z, l.yaw) : l.item ? this.loose.addItem(backInTheWorld(l.item), l.x, l.y + 0.05, l.z, l.yaw) : null;
      if (!thing || !l.pos || !l.rot) continue;
      this.loose.ride(thing, v, { pos: new THREE.Vector3().fromArray(l.pos), rot: new THREE.Quaternion().fromArray(l.rot) });
      if (l.zone) thing.stow = l.zone;
      if (l.lie) thing.lie = l.lie;
    }
    this.cargo.weigh(v);
  }

  private placeOnRoad(build: Build, s: number): ModVehicle {
    const w = this.world!;
    const st = new SpineSample();
    w.spine.at(s, st);
    const lane = 1.6;
    const x = st.x - Math.sin(st.phi) * lane;
    const z = st.z + Math.cos(st.phi) * lane;
    const v = this.addVehicle(build, x, z, -st.phi);
    return v;
  }

  // ------------------------------------------------------------------ the hotbar's pictures, the keys in the seat

  private icons: PartThumbs | null = null;
  private readonly iconUrl = new Map<string, string | null>();
  private readonly dockMouth = new THREE.Vector3();
  private readonly dockOut = new THREE.Vector3();
  private readonly spoutV = new THREE.Vector3();

  /** the picture of a held thing for the hotbar (drawn once per kind; null while it is drawn) */
  iconOf(h: NonNullable<Held>): string | null {
    // (a thing a system draws with a model of its own — a golden carp — is pictured as that: itemModelOf)
    const own = h.kind === 'item' ? itemModelOf(h.item) : '';
    const key = h.kind === 'part' ? `part:${h.inst.part}:${h.inst.sub.tire?.part ?? ''}` : h.kind === 'item' ? `item:${h.item.item}:${h.item.tint ?? ''}:${own}` : `tool:${h.tool.kind}:${h.tool.kind === 'jerrycan' ? (h.tool.fuel ?? 'petrol') : ''}:${h.tool.kind === 'spray' ? (h.tool.colour ?? 0) : ''}:${h.tool.tier ?? ''}`;
    if (this.iconUrl.has(key)) return this.iconUrl.get(key) ?? null;
    this.iconUrl.set(key, null);
    this.icons ??= new PartThumbs();
    let item: DevItem;
    let paint: number | undefined;
    let paint2: number | undefined;
    if (h.kind === 'part') {
      item = { kind: 'part', id: h.inst.part };
      const def = partDef(h.inst.part);
      paint = def.panel ? panelPaint(def.panel.style, 0xa3472e) : undefined;
    } else if (h.kind === 'item') {
      item = { kind: 'item', id: h.item.item };
      ({ paint, paint2 } = itemPaint(h.item));
    } else {
      const t = h.tool;
      item = { kind: 'tool', tool: t.kind, fuel: t.fuel === 'diesel' ? 'diesel' : t.fuel === 'petrol' ? 'petrol' : undefined, tier: t.tier, colour: t.colour };
      ({ paint, paint2 } = toolLook(t));
    }
    const make = h.kind === 'item' && own !== itemDef(h.item.item).model ? () => itemGlb(own).then((m) => (m ? cloneModel(m) : itemStandIn(h.item))) : () => this.devModel(item);
    this.icons.request(key, make, (url) => this.iconUrl.set(key, url), paint, paint2);
    return null;
  }

  /** the colour of what a can holds (sRGB hex) */
  private liquidColour(h: Held): number {
    if (h?.kind !== 'tool') return 0xffffff;
    const tone = h.tool.kind === 'jerrycan' ? (h.tool.fuel ?? 'petrol') : h.tool.kind === 'bottle' ? 'water' : 'oil';
    return parseInt(TONE_COLOUR[tone].slice(1), 16);
  }

  /** what the keys do in the seat (down the right) */
  private driveKeys(v: ModVehicle): Action[] {
    const out: Action = { keys: ['Q'], hold: true, text: '下车' };
    const running = v.sys.running;
    // (sat in a third time and after: only the key while the engine is off — docs/V3/plan/prompts.md §五)
    if (v !== this.seatSeen) {
      this.seatSeen = v;
      this.seatCount++;
      try {
        localStorage.setItem('modcar.hint.seat', String(this.seatCount));
      } catch {
        /* none */
      }
    }
    // (tired, in a seat of a vehicle standing with its engine off: sleep — docs/V3/plan/growth.md §四)
    const doze: Action[] = this.canSleep() && (this.body.energy ?? 100) < 60 ? [{ keys: ['RMB'], hold: true, text: '睡觉' }] : [];
    if (this.seatCount > 2) return [...(this.seatAt === 'pass' || running ? [] : [{ keys: ['LMB'], hold: true, text: '打火' } as Action]), ...doze];
    if (this.seatAt === 'pass') return [{ keys: ['V'], text: '换视角' }, ...doze, out];
    return [
      { keys: ['W'], text: '油门' },
      { keys: ['S'], text: '刹车 / 倒车' },
      { keys: ['Space'], hold: true, text: '手刹' },
      // (the key is turned with the left button on it: said here until the engine runs)
      ...(running ? [] : [{ keys: ['LMB'], hold: true, text: '打火' } as Action]),
      ...(v.sim.manual ? [{ keys: ['Wheel'], text: '换挡' } as Action] : []),
      // (the lamps and the horn on the card again, as on 11-24: docs/V3/plan/finish.md §十八, 界面恢复)
      { keys: ['L'], text: '车灯' },
      { keys: ['H'], hold: true, text: '喇叭' },
      { keys: ['V'], text: '换视角' },
      ...doze,
      out,
    ];
  }

  /** in a seat of a vehicle standing still with its engine off, the hands empty: one may sleep */
  canSleep(): boolean {
    const v = this.seated;
    return !!v && !v.sys.running && Math.abs(v.sim.kmh) < 1 && !this.player.held && this.deadT < 0 && this.sleepT < 0;
  }

  /** the wheel as the hands hold it (sleepy: it follows what one asks a moment late) */
  private steerHeld = 0;

  /** sleepy at the last step of the body (said once as it begins) */
  private wasSleepy = false;
  /** the place by the road one is at (how far along the road it stands; null: none) — left behind, the game is kept */
  private atSite: number | null = null;
  private siteT = 0;
  private readonly siteList: Site[] = [];
  /** a night was slept through: once one is up again the game is kept and its older copies moved on */
  private sleptSave = false;
  /** the right button held in a seat (s), and the sleep under way (s into its fade; −1: none) */
  private sleepHold = 0;
  private sleepT = -1;
  private sleptHours = 0;
  /** the sleep under way is in a bed (rested sooner: vitals.ts sleepHours) */
  private sleepBed = false;

  /** lie down in a bed and sleep (GameContext.sleepInBed: the camper's beds): why not, or null when it begins */
  sleepInBed(): { zh: string; en: string } | null {
    if (this.sleepT >= 0 || this.deadT >= 0) return { zh: '现在不行', en: 'Not now' };
    if ((this.body.energy ?? 100) >= 80) return { zh: '还不困', en: 'Not tired' };
    this.sleepBed = true;
    this.sleepT = 0;
    return null;
  }

  /**
   * Sleep in a seat (docs/V3/plan/growth.md §四): the right button held a second with the hands empty, the vehicle
   * standing with its engine off — not when one is rested (还不困). The view goes dark, the night goes by (the clock
   * on so many hours, eight from nothing), the body rested; it comes up again.
   */
  private stepSleep(dt: number): void {
    if (this.sleepT >= 0) {
      this.sleepT += dt;
      const FADE = 0.9;
      const HOLD = 1.1;
      if (this.sleepT < FADE) this.ui.setFade(this.sleepT / FADE);
      else if (this.sleepT < FADE + HOLD) {
        this.ui.setFade(1);
        if (this.sleptHours === 0) this.sleptHours = this.sleepNow();
      } else if (this.sleepT < FADE * 2 + HOLD) this.ui.setFade(1 - (this.sleepT - FADE - HOLD) / FADE);
      else {
        this.ui.setFade(0);
        this.sleepT = -1;
        this.ui.say(`睡了 ${this.sleptHours} 小时`, 2.4);
        this.sleptHours = 0;
        this.sleepBed = false;
        // (up again: the game's older copies moved on — the newer is of the moment one lay down — and the game kept)
        if (this.sleptSave) {
          this.sleptSave = false;
          if (this.params.keep && !this.saveOff) rotateBackups();
          this.save();
        }
      }
      return;
    }
    // (in a seat: the right button held, as on 11-24 — docs/V3/plan/finish.md §十八, 界面恢复)
    const held = !!this.seated && this.rightButton;
    if (!held || !this.canSleep()) {
      this.sleepHold = 0;
      return;
    }
    if ((this.body.energy ?? 100) >= 80) {
      if (this.sleepHold === 0) this.player.flashWhy('还不困');
      this.sleepHold = dt;
      return;
    }
    this.sleepHold += dt;
    if (this.sleepHold >= 1) {
      this.sleepHold = 0;
      this.sleepT = 0;
    }
  }

  /** the night gone by: the clock on, the body rested; how many hours */
  private sleepNow(): number {
    const hours = sleepHours(this.body, this.sleepBed);
    const clock = this.env.clock;
    const now = clock.hourAt(this.time);
    const dp = (((DayClock.phaseOfHour(now + hours) - DayClock.phaseOfHour(now)) % 1) + 1) % 1;
    const seconds = dp * clock.dayLength;
    sleepVitals(this.body, hours, this.vitalsR, seconds / hours, this.sleepBed);
    // (where: the pause menu's 回到上次睡觉的地方 goes back there)
    if (this.world) {
      const at = this.seated?.sim ?? null;
      const w = this.player.walker;
      this.world.spine.project(at ? at.px : w.x, at ? at.pz : w.z, NaN, this.pr);
      this.sleptAt = this.pr.s;
    }
    clock.advance(seconds);
    this.env.cloudsNow = true;
    // (a night gone by: the game kept, and its older copies moved on — the newer is of last night, the older of the
    // night before; docs/V3/plan/finish.md §十四)
    this.sleptSave = true;
    return hours;
  }

  /** times sat in a seat (the keys said the first two), and the vehicle last sat in */
  private seatCount = (() => {
    try {
      return Number(localStorage.getItem('modcar.hint.seat') ?? 0) || 0;
    } catch {
      return 0;
    }
  })();
  private seatSeen: ModVehicle | null = null;

  /** how long Q has been down on foot since it went down (s; −1: it is not) */
  private qT = -1;

  /** Q on foot: let go soon, the thing is put down; held, it is put out to be placed (Nomad Drive's placing) */
  private qHold(dt: number): void {
    if (this.qT < 0) return;
    if (this.input.isDown('KeyQ')) {
      this.qT += dt;
      const p = this.player.placer;
      if (this.qT >= PLACE_HOLD_S && p && !p.placing && this.player.held) {
        p.toggle();
        this.qT = -1;
      }
      return;
    }
    this.qT = -1;
    this.player.drop();
  }

  /** how long Q has been held in a seat (s) */
  private standT = 0;

  /** Q held in a seat a third of a second: one gets up and out (Nomad Drive's) */
  private standUp(dt: number): void {
    if (!this.input.isDown('KeyQ') || this.deadT >= 0 || this.listV) {
      this.standT = 0;
      return;
    }
    this.standT += dt;
    if (this.standT >= STAND_S) {
      this.standT = -Infinity;
      this.getOut();
    }
  }

  // ------------------------------------------------------------------ never stranded (docs/V3/plan/finish.md §四.2)

  /** where one last slept: how far along the road (m; NaN: nowhere yet) */
  private sleptAt = NaN;
  /** the clocks of what strands a vehicle (s): lying over, pushed against something (and from where), hung up, in the water; the dark of a tow lifting (−1: none) */
  private readonly stuck = { over: 0, push: 0, pushX: 0, pushZ: 0, hung: 0, wet: 0, fade: -1 };
  private readonly towSt = new SpineSample();
  private readonly towTp = new TerrainPoint();
  private readonly towV = new THREE.Vector3();
  private readonly overBasis = new Float64Array(9);

  /**
   * What strands the vehicle one drives — the one sat in, else the one last driven — and its way out, each frame:
   *  - through the ground, off the world's edge, blown up: back on the road at once;
   *  - on its roof or its side, all but still, five seconds: put on its wheels where it lies — with one in it at once;
   *    without, when one comes within ten metres of it or it is out of sight (not turned over before one's eyes from afar);
   *  - in the water over its axles two seconds; two wheels or more off the ground and all but still five; the
   *    throttle held with the engine pulling and not a metre and a half made in eight: the view goes dark and it is
   *    back on the road where that is nearest (车拖回了路上).
   * Not in the workshop (a car driven against its shut door is not stranded), nor one that is towed or carried.
   */
  private stepStranded(dt: number): void {
    const s = this.stuck;
    if (s.fade >= 0) {
      s.fade += dt;
      const k = (s.fade - 0.5) / 0.6;
      this.ui.setFade(k <= 0 ? 1 : k >= 1 ? 0 : 1 - k);
      if (k >= 1) s.fade = -1;
    }
    const v = this.seated ?? this.focus;
    if (!v || !this.vehicles.includes(v) || this.deadT >= 0 || this.sleepT >= 0 || this.fadeT >= 0 || v.carriedBy || v.view.frame.towed) {
      s.over = s.push = s.hung = s.wet = 0;
      return;
    }
    const sim = v.sim;
    this.ground.sample(sim.px, sim.pz, this.gs);
    if (sim.exploded || !(sim.py === sim.py) || sim.py < this.gs.h - 6) {
      if (!this.towToRoad(v)) this.resetUpright(v);
      return;
    }
    const seated = v === this.seated;
    const b = this.overBasis;
    sim.basis(b);
    // (the body's up against the world's: under cos 70° it lies over)
    const over = b[4] < Math.cos((70 * Math.PI) / 180) && sim.bodyKmh < 4;
    s.over = over ? s.over + dt : 0;
    if (s.over >= 5) {
      const w = this.player.walker;
      if (seated || Math.hypot(sim.px - w.x, sim.pz - w.z) < 10 || !this.inView(sim.px, sim.py, sim.pz)) {
        s.over = 0;
        this.resetUpright(v);
        this.ui.say('车扶正了', 2);
        return;
      }
    }
    if (!this.world || this.place === 'garage') {
      s.push = s.hung = s.wet = 0;
      return;
    }
    // in the water over its axles
    this.world.shape(sim.px, sim.pz, this.towTp);
    const axle = sim.wheels[0].radius + 0.12;
    // (the clocks of these two run back at twice the pace rather than start again: a body rocks on what it hangs on)
    s.wet = this.towTp.wl - this.gs.h > axle && sim.py - sim.spec.cgHeight < this.towTp.wl - axle + 0.3 ? s.wet + dt : Math.max(0, s.wet - 2 * dt);
    // hung up: two wheels or more in the air (a single-track vehicle's wheels are two rays each: all four)
    let off = 0;
    for (const w of sim.wheels) if (!w.contact) off++;
    s.hung = !over && off >= (v.view.frame.balance ? 4 : 2) && sim.bodyKmh < 5 ? s.hung + dt : Math.max(0, s.hung - 2 * dt);
    // pushed against something: the throttle held, the engine pulling, no way made (not held back by its own
    // handbrake or brake: that is the driver's doing, and the cab says so)
    if (seated && this.seatAt === 'driver' && v.sys.running && sim.engaged && sim.throttle > 0.5 && sim.parkBrake <= 0 && sim.brake < 0.2 && sim.handbrake === 0 && !this.scripted) {
      if (s.push === 0 || Math.hypot(sim.px - s.pushX, sim.pz - s.pushZ) > 1.5) {
        s.pushX = sim.px;
        s.pushZ = sim.pz;
        s.push = 0;
      }
      s.push += dt;
    } else s.push = 0;
    if (s.wet >= 2 || s.hung >= 5 || s.push >= 8) this.towToRoad(v);
  }

  /** is a point of the world in the picture now */
  private inView(x: number, y: number, z: number): boolean {
    const o = this.core.origin;
    const cam = this.core.camera;
    // (the camera as it stands now — its matrices are the last picture's otherwise — and the point seen from it:
    // ahead of it, and inside the picture's angles with a little to spare)
    cam.updateMatrixWorld();
    const p = this.towV.set(x - o.x, y - o.y, z - o.z).applyMatrix4(cam.matrixWorldInverse.copy(cam.matrixWorld).invert());
    const ahead = -p.z;
    if (ahead < 0.2) return false;
    const ty = Math.tan((cam.fov * Math.PI) / 360) * 1.08;
    return Math.abs(p.y) < ahead * ty && Math.abs(p.x) < ahead * ty * cam.aspect;
  }

  /**
   * A vehicle put back on the road where that is nearest to it (docs/V3/plan/finish.md §四.2): in its lane, facing
   * the way it was heading along it, at rest; the view dark for a moment, and a line that says so. False where there
   * is no road to put it on (the stand-in workshop).
   */
  towToRoad(v: ModVehicle, said = '车拖回了路上', near?: { x: number; z: number }): boolean {
    const w = this.world;
    if (!w || (this.place === 'garage' && !this.seamless)) return false;
    const sim = v.sim;
    const from = near ?? { x: sim.px, z: sim.pz };
    w.spine.project(from.x, from.z, NaN, this.pr);
    const st = this.towSt;
    w.spine.at(Math.max(2, this.pr.s), st);
    const sn = Math.sin(st.phi);
    const cs = Math.cos(st.phi);
    // (the way it was heading, as near as the road goes: the sim's forward is (cos yaw, −sin yaw))
    const yaw = sim.yaw;
    const dir = Math.cos(yaw) * cs - Math.sin(yaw) * sn >= 0 || !(yaw === yaw) ? 1 : -1;
    const lane = 1.6 * dir;
    const x = st.x - sn * lane;
    const z = st.z + cs * lane;
    w.sample(x, z, this.gs);
    sim.reset(x, this.gs.h + 0.05, z, dir > 0 ? -st.phi : Math.PI - st.phi, this.ground);
    v.sys.bind(sim);
    v.awake = 3;
    if (v === this.seated) {
      this.chaseInit = false;
      this.rig.reset();
      this.shake.reset();
    }
    const s = this.stuck;
    s.over = s.push = s.hung = s.wet = 0;
    if (!this.params.shot) {
      this.ui.setFade(1);
      s.fade = 0;
    }
    if (said) this.ui.say(said, 2.6);
    return true;
  }

  /** the pause menu's two ways out when nothing else is left: the car put on the road by one, and back to where one last slept */
  unstickCar(): void {
    const v = this.seated ?? this.focus ?? this.vehicles.find((x) => !x.view.frame.towed && !this.wrecks?.isWreck(x)) ?? null;
    if (!v) return;
    // (on foot: the road nearest to where one stands — it is the car that is lost, not oneself)
    const w = this.player.walker;
    if (!this.towToRoad(v, '车放回了路上', this.seated ? undefined : { x: w.x, z: w.z })) this.resetUpright(v);
  }

  canBackToBed(): boolean {
    return !!this.world && this.sleptAt === this.sleptAt;
  }

  backToBed(): void {
    if (!this.canBackToBed()) return;
    this.teleport(this.sleptAt, true);
    this.ui.say('回到了上次睡觉的地方', 2.6);
  }

  /** the vehicle whose lamps the dark turned on by themselves (the assist), and how long it has been dark, or light, at the wheel (s) */
  private autoLit: ModVehicle | null = null;
  private darkT = 0;

  /**
   * The headlamps by themselves (the assist 天黑自动开车灯, docs/V3/plan/finish.md §十三: L is no key one has to
   * know): at the wheel with the engine running, two seconds into the dark they come on, dipped; ten seconds into the
   * light again they go out — unless one has switched them oneself meanwhile: put out in the dark they stay out until
   * it has been light, and switched to main beam they are left alone.
   */
  private stepAutoLights(dt: number): void {
    const v = this.seated;
    if (!this.assists.autoLights || !v || this.seatAt === 'pass') {
      this.darkT = 0;
      return;
    }
    const dark = this.env.dark;
    this.darkT = dark === this.darkT > 0 ? this.darkT + (dark ? dt : -dt) : dark ? dt : -dt;
    if (dark && this.darkT > 2 && v.sys.running && v.sys.lights === 'off' && this.autoLit !== v) {
      v.sys.lights = 'low';
      this.autoLit = v;
      this.sound('switch');
    } else if (!dark && this.darkT < -10 && this.autoLit) {
      if (this.autoLit === v && v.sys.lights === 'low') {
        v.sys.lights = 'off';
        this.sound('switch');
      }
      this.autoLit = null;
    }
  }

  // ------------------------------------------------------------------ the developer's parts bin (`)

  private dev: DevPanel | null = null;
  private devGhost: { key: string; group: THREE.Group } | null = null;
  private readonly devRay = new THREE.Raycaster();
  private readonly devNdc = new THREE.Vector2();
  private readonly devNear: Solid[] = [];
  private readonly devPush = new Push();

  /** the parts bin, once it has been opened */
  get devPanel(): DevPanel | null {
    return this.dev;
  }

  /** open or shut the parts bin */
  toggleDev(open = !this.dev?.open): void {
    if (!open && !this.dev) return;
    this.dev ??= new DevPanel(this);
    this.dev.setOpen(open);
  }

  devOpened(open: boolean): void {
    const canvas = this.core.renderer.domElement;
    this.input.lockable = !open;
    if (open) {
      // the mouse let go, for the tiles
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      this.ui.showHelp(false);
      return;
    }
    this.devPreview(null, null);
    // back to the game: the mouse taken again (a key press lets a page do it; else a click will)
    if (!this.params.shot) {
      try {
        void (canvas.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {});
      } catch {
        /* a click will do */
      }
    }
  }

  devModel(item: DevItem): Promise<THREE.Object3D | null> {
    if (item.kind === 'part') {
      const def = partDef(item.id);
      const tyre = devTyreFor(def);
      return partModel(item.id).then(async (m) => {
        const g = new THREE.Group();
        g.add(cloneModel(m));
        if (tyre && def.rim) g.add(seatTyres(m, await partModel(tyre, item.id), def.rim, partDef(tyre).tire!.sidewall, false));
        return g;
      });
    }
    if (item.kind === 'tool') {
      const kind = item.tool;
      return toolGlb(toolModelId({ kind, tier: item.tier })).then((m) => (m ? cloneModel(m) : toolModel({ uid: 'dev', kind, fuel: item.fuel, tier: item.tier, colour: item.colour })));
    }
    if (item.kind === 'item') {
      const it = newItem(item.id);
      return itemGlb(itemDef(item.id).model).then((m) => (m ? cloneModel(m) : itemStandIn(it)));
    }
    const f = frameDef(item.frame);
    return frameModel(item.frame, () => standInFrame(f.body, f.kind)).then((m) => cloneModel(m));
  }

  /** is (x, y, z) inside a wall, a post, a bench's side (not a vehicle: those are met by their meshes) */
  private devInSolid(x: number, y: number, z: number): boolean {
    const near = this.devNear;
    near.length = 0;
    this.player.solids.solidsNear(x, z, 0.02, near);
    for (const s of near) {
      if (s.tag.startsWith('modcar:') || y < s.y0 || y > s.y1) continue;
      if (pushOut(s, x, z, 0.01, this.devPush)) return true;
    }
    return false;
  }

  devPick(clientX: number, clientY: number): DevPoint | null {
    const canvas = this.core.renderer.domElement;
    const r = canvas.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
    this.devNdc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.core.camera.updateMatrixWorld();
    this.devRay.setFromCamera(this.devNdc, this.core.camera);
    const o = this.core.origin;
    const ray = this.devRay.ray;
    // a vehicle under it: where the ray first meets its body (a roof, a bed, a bonnet, a seat)
    let far = 40;
    let onCar: DevPoint | null = null;
    for (const v of this.vehicles) {
      v.view.root.updateMatrixWorld(true);
      for (const h of this.devRay.intersectObject(v.view.root, true)) {
        if (h.distance >= far) break;
        if (!h.face || !visibleUp(h.object) || h.object.renderOrder >= 20) continue;
        far = h.distance;
        onCar = { x: h.point.x + o.x, y: h.point.y + o.y, z: h.point.z + o.z };
        break;
      }
    }
    // the floor and what stands on it (a bench, a shelf); a wall stops it short, on the floor before the wall
    const at = (t: number): DevPoint => ({ x: ray.origin.x + ray.direction.x * t + o.x, y: ray.origin.y + ray.direction.y * t + o.y, z: ray.origin.z + ray.direction.z * t + o.z });
    const under = (p: DevPoint): number => this.loose.surfaceAt(p.x, p.z, p.y + 0.15) ?? -Infinity;
    const step = 0.1;
    let prev = at(0);
    for (let t = step; t < far; t += step) {
      const p = at(t);
      if (p.y <= under(p)) {
        // back up to where it went under
        let a = t - step;
        let b = t;
        for (let k = 0; k < 6; k++) {
          const m = (a + b) / 2;
          const q = at(m);
          if (q.y <= under(q)) b = m;
          else a = m;
        }
        const q = at(b);
        return { x: q.x, y: under(q), z: q.z };
      }
      if (this.devInSolid(p.x, p.y, p.z)) return { x: prev.x, y: this.loose.surfaceAt(prev.x, prev.z, prev.y) ?? prev.y, z: prev.z };
      prev = p;
    }
    return onCar;
  }

  /** where a thing goes when its tile is only clicked: a step ahead of one's feet (from a seat: beside the vehicle) */
  private devFeet(ahead: number): DevPoint {
    const v = this.seated;
    if (v) {
      const b = this.basis;
      v.sim.basis(b);
      const side = (v.sim.spec.eye.z < 0 ? -1 : 1) * (v.sim.spec.body.halfWidth + 0.9 + ahead * 0.4);
      const x = v.sim.px + b[6] * side;
      const z = v.sim.pz + b[8] * side;
      return { x, y: this.loose.surfaceAt(x, z, v.sim.py + 1) ?? v.sim.py, z };
    }
    const w = this.player.walker;
    const x = w.x + Math.cos(w.heading) * ahead;
    const z = w.z + Math.sin(w.heading) * ahead;
    return { x, y: this.loose.surfaceAt(x, z, w.y + 1.2) ?? w.y, z };
  }

  devStock(): void {
    const d = { scrap: 100, components: 20 };
    this.stock.scrap += d.scrap;
    this.stock.components += d.components;
    this.stockChanged(d);
  }

  /** the kept game's materials (one kept before there were two: crafting.ts stockOf), what was learnt, what sheet each place had */
  private takeKnown(): void {
    const r = this.restore;
    if (!r) return;
    if (r.stock) Object.assign(this.stock, stockOf(r.stock as Partial<Record<string, number>>));
    for (const id of r.learned ?? []) this.learned.add(id);
    for (const [k, v] of Object.entries(r.sheets ?? {})) this.sheets.set(k, v);
    Object.assign(this.kits, r.kits ?? {});
    this.addedFinds.push(...(r.finds ?? []));
    Object.assign(this.rescue, r.rescue ?? {});
  }

  /** has one this thing (its key: an item's id, `part:` and a part's): in the hands, in or on a vehicle of one's own, fitted to one, or lying within twenty metres */
  private hasThing(key: string): boolean {
    const isIt = (h: Held | { item?: ItemInstance | null; part?: PartInstance | null }): boolean => {
      if (!h) return false;
      const item = 'kind' in h ? (h.kind === 'item' ? h.item : null) : (h.item ?? null);
      const part = 'kind' in h ? (h.kind === 'part' ? h.inst : null) : (h.part ?? null);
      if (item) return item.item === key || !!item.inside?.some((x) => x.item === key);
      return !!part && `part:${part.part}` === key;
    };
    if (this.player.slots.some((h) => isIt(h))) return true;
    const w = this.player.walker;
    for (const l of this.loose.list) if ((l.riding || Math.hypot(l.x - w.x, l.z - w.z) < 20) && isIt(l)) return true;
    if (key.startsWith('part:')) for (const v of this.vehicles) for (const inst of Object.values(v.build.parts)) if (inst && `part:${inst.part}` === key) return true;
    return false;
  }

  /** the regions of the world's road from its start, as far as they have been asked for (core/modcar/lookahead.ts) */
  private roadRegions: RoadRegion[] = [];
  private regionsTo(toM: number): readonly RoadRegion[] {
    if (!this.world) return [];
    const have = this.roadRegions.length ? this.roadRegions[this.roadRegions.length - 1].to : 0;
    // (asked for a little further than wanted: not made again for every place)
    if (have < toM) this.roadRegions = regionsAlong(this.world.spine.plan, toM + 40_000);
    return this.roadRegions;
  }

  /** is this thing kept back for now: a piece of a set whose earlier pieces have not been picked up yet (GameContext.withheld; a world of version 7 on) */
  withheld(key: string): boolean {
    return this.params.world >= 7 && kitHeld(this.kits, key);
  }

  /** what is still wanting of the set a thing in the hands belongs to, for its card (PlayerHost.kitNote) */
  kitNote(h: NonNullable<Held>): string | null {
    if (this.params.world < 7) return null;
    const key = h.kind === 'item' ? h.item.item : h.kind === 'part' ? `part:${h.inst.part}` : '';
    if (!key || !kitOf(key)) return null;
    // (looked into twice a second: what one has is looked for among everything lying about)
    const kept = this.kitNotes.get(key);
    if (kept && Math.abs(this.time - kept.t) < 0.5) return kept.text;
    const w = kitWanting(key, (k) => this.hasThing(k));
    const name = (k: string): string => (k.startsWith('part:') ? partDef(k.slice(5)).name.zh : hasItem(k) ? itemDef(k).name.zh : k);
    const text = w && w.wanting.length ? `还缺：${w.wanting.map(name).join('、')}` : null;
    this.kitNotes.set(key, { t: this.time, text });
    return text;
  }
  private readonly kitNotes = new Map<string, { t: number; text: string | null }>();

  /**
   * The sets (core/modcar/kits.ts, docs/V3/plan/finish.md §二 3; a world of version 7 on): what comes into the hands
   * for the first time moves its set on — its next step put out two to five kilometres ahead — and a step driven past
   * is put out again. Looked at twice a second.
   */
  private stepKits(dt: number): void {
    if (this.params.world < 7 || !this.world || !this.places) return;
    this.kitT -= dt;
    if (this.kitT > 0) return;
    this.kitT = 0.5;
    this.checkWhole();
    this.stepRoad();
    const s = this.roadS;
    const world = this.world;
    // (where a step may be put: the places ahead with a box of their own)
    const ahead: PlacesAhead = (from, to) => planPlaces(world, from, to).filter((p) => p.boxes > 0);
    const fresh: PlannedFind[] = [];
    for (const h of this.player.slots) {
      const key = !h ? '' : h.kind === 'item' ? h.item.item : h.kind === 'part' ? `part:${h.inst.part}` : '';
      const it = !h ? null : h.kind === 'item' ? h.item : h.kind === 'part' ? h.inst : null;
      if (!key || !it || this.kitSeen.has(it) || !kitOf(key)) continue;
      this.kitSeen.add(it);
      fresh.push(...kitPicked(this.kits, key, s, this.params.seed, ahead));
    }
    // (a step of things one has other uses for — a battery, a shovel, a bucket — when one has one already: taken at once)
    for (const kit of KITS) {
      for (let guard = 0; guard < 4; guard++) {
        const k = this.kits[kit.id];
        const step = k && k.got >= 1 ? kit.steps[k.got - 1] : undefined;
        const have = step?.free ? step.things.map(thingKey).find((x) => this.hasThing(x)) : undefined;
        if (!have) break;
        fresh.push(...kitPicked(this.kits, have, s, this.params.seed, ahead));
      }
    }
    // (a step driven past: the place that took it three kilometres behind, and it not picked up)
    const places = this.places;
    fresh.push(
      ...kitsPassed(
        this.kits,
        s,
        this.params.seed,
        (kit, step) => {
          const entry = `kit:${kit}:${step}`;
          for (let i = this.addedFinds.length - 1; i >= 0; i--) if (this.addedFinds[i].entry === entry) return places.laidAt(this.addedFinds[i]);
          return undefined;
        },
        ahead,
      ),
    );
    // (a step put out and taken in the same breath — the battery one had already: its find is not wanted)
    const wanted = fresh.filter((f) => {
      const m = /^kit:(.+):(\d+)$/.exec(f.entry);
      return !m || this.kits[m[1]]?.out?.step === Number(m[2]);
    });
    if (!wanted.length) return;
    this.addedFinds.push(...places.addFinds(wanted));
  }

  /**
   * What one has of what one lives on (core/modcar/needs.ts Stocks): in the hands and the pack, riding in a vehicle of
   * one's own, lying within thirty metres — what is in a box among them too; the petrol the tank of the vehicle one
   * drives holds and the cans'. Counted afresh every two seconds at most.
   */
  stockNow(): Stocks & { tankFrac: number; cansL: number } {
    if (this.stockKept && Math.abs(this.time - this.stockKept.t) < 2) return this.stockKept.v;
    const v = { food: 0, water: 0, petrol: 0, tyres: 0, meds: 0, tankFrac: 1, cansL: 0 };
    const portion = (item: string): number => FOOD[item.slice(4)]?.food ?? 0;
    const item = (it: ItemInstance): void => {
      const got = stockOfFound({ item: it.item, n: it.n ?? 1 }, portion);
      // (a bottle part drunk: what is left in it)
      if (got.water !== undefined && it.litres !== undefined && itemDef(it.item).drink) got.water *= it.litres / Math.max(1e-6, itemDef(it.item).drink!.litres);
      for (const k of ['food', 'water', 'tyres', 'meds'] as const) v[k] += got[k] ?? 0;
      for (const x of it.inside ?? []) item(x);
    };
    const thing = (h: { item?: ItemInstance | null; tool?: Tool | null }): void => {
      if (h.item) item(h.item);
      else if (h.tool && h.tool.kind === 'jerrycan' && (h.tool.fuel ?? 'petrol') === 'petrol') v.cansL += h.tool.litres ?? 0;
    };
    for (const h of this.player.slots) if (h) thing(h.kind === 'item' ? { item: h.item } : h.kind === 'tool' ? { tool: h.tool } : {});
    const w = this.player.walker;
    for (const l of this.loose.list) if (l.riding || Math.hypot(l.x - w.x, l.z - w.z) < 30) thing(l);
    const car = this.seated ?? this.focus ?? this.vehicles[0];
    const tankL = car?.sys.dash.tankL ?? 0;
    const fuelL = car && tankL > 0 ? car.sys.dash.fuelL : 0;
    v.tankFrac = tankL > 0 ? fuelL / tankL : 1;
    v.petrol = fuelL + v.cansL;
    this.stockKept = { t: this.time, v };
    return v;
  }

  /**
   * Down the road (a world of version 7 on; twice a second): what one is all but out of is at the next place for
   * certain (core/modcar/needs.ts rescueFinds — the tank under fifteen in a hundred with no can aboard, next to
   * nothing to eat or to drink), and every fifty kilometres the odometer's round number is said, once.
   */
  private stepRoad(): void {
    const s = this.roadS;
    if (this.place !== 'road' || !this.places) return;
    const now = this.stockNow();
    const fresh = rescueFinds(this.rescue, s, now);
    if (fresh.length) this.addedFinds.push(...this.places.addFinds(fresh));
    const k = Math.floor(s / 50_000);
    if (k >= 1 && !this.done.has(`km:${k * 50}`)) {
      this.done.add(`km:${k * 50}`);
      // (the ones before it too: a game taken up further on says the one it is at, no more)
      for (let j = 1; j < k; j++) this.done.add(`km:${j * 50}`);
      this.ui.say(`第 ${k * 50} 公里`, 4);
    }
  }

  /**
   * The car one started with, whole at last (docs/V3/plan/finish.md §二 2: 装齐那一刻顶上说一句): every part that was down
   * the road is on it, and its one lamp — said once, the moment the last goes on.
   */
  private checkWhole(): void {
    if (!this.rough || this.done.has('whole')) return;
    const v = this.vehicles[0];
    if (!v || v.build.frame !== START_FRAME) return;
    if (!v.build.parts[KEPT_LAMP] || !ROAD_MOUNTS.every((m) => !!v.build.parts[m])) return;
    // (and everything else of it: a part taken off again to make room is still to go back)
    if (missingMounts(v.build).some((m) => m.cat !== 'radio')) return;
    this.done.add('whole');
    this.ui.say(`${v.view.frame.name.zh}装齐了`, 4);
  }

  /** a making learnt from its blueprint, for good (GameContext.learn): true when it is new */
  learn(recipe: string): boolean {
    if (this.learned.has(recipe)) return false;
    recipeDef(recipe);
    this.learned.add(recipe);
    return true;
  }

  /**
   * The sheet a place of the plan has for one who comes to it now (crafting.ts sheetAt: the next not learnt yet, not
   * one in the hands, not one a place just passed has). Nothing left to learn so far: a box of components.
   */
  blueprintAt(slot: string, chapter: number, s: number, want?: string): ScheduledThing {
    // (a place that has a sheet of its own — the motorcycle rack's, after the motorcycle: that one while it is still to be
    // learnt, and no other place near has it then; learnt already, the place has the next one as any other)
    const own = want ? recipeOfBlueprint(want) : null;
    if (own && !this.learned.has(own.id)) {
      this.sheets.set(slot, { r: own.id, s });
      return { item: blueprintOf(own.id) };
    }
    const next = sheetAt(slot, own ? chapterAt(s / 1000) : chapter, s, this.learned, this.sheets, (r) => this.player.slots.some((h) => h?.kind === 'item' && h.item.item === blueprintOf(r)));
    return { item: next ? blueprintOf(next.id) : 'crate_chem' };
  }

  devSpawn(item: DevItem, at: DevPoint | null): void {
    const yaw = this.player.walker.heading;
    if (item.kind === 'vehicle') {
      const p = at ?? this.devFeet(5);
      const b = stockBuild(item.frame, { fuel: 0.6 });
      if (!item.stock) b.parts = {};
      // facing the way one looks; where another vehicle, a wall or oneself already is, the nearest free place round it
      this.devRoom(this.addVehicle(b, p.x, p.z, -yaw));
      this.ui.say(`放下了：${frameDef(item.frame).name.zh}${item.stock ? '' : '（空车架）'}`, 1.8);
      return;
    }
    const p = at ?? this.devFeet(1.1);
    if (item.kind === 'part') {
      const def = partDef(item.id);
      const inst = newInstance(item.id, { charge: 0.9 });
      const tyre = devTyreFor(def);
      if (tyre) fitSub(inst, 'tire', newInstance(tyre));
      this.loose.addPart(inst, p.x, p.y + 0.3, p.z, yaw);
      this.sound('putdown', def.mass);
      this.ui.say(`放下了：${def.name.zh}`, 1.5);
      return;
    }
    if (item.kind === 'item') {
      const it = newItem(item.id);
      this.loose.addItem(it, p.x, p.y + 0.25, p.z, yaw);
      this.sound('putdown', itemMass(it));
      this.ui.say(`放下了：${itemDef(item.id).name.zh}`, 1.5);
      return;
    }
    const tool = item.tool === 'jerrycan' ? newTool('jerrycan', { fuel: item.fuel ?? 'petrol', litres: item.litres ?? 20 }) : item.tool === 'spray' ? newTool('spray', { tier: item.tier ?? 2, colour: item.colour ?? 13 }) : item.tool === 'scraper' ? newTool('scraper', { tier: item.tier ?? 1 }) : newTool(item.tool);
    this.loose.addTool(tool, p.x, p.y + 0.25, p.z, yaw);
    this.sound('putdown', 3);
  }

  /** a vehicle let go on top of another, in a wall or on oneself: moved to the nearest free place round there */
  private devRoom(v: ModVehicle): void {
    const own = v.solid.update();
    const dx = own.x - v.sim.px;
    const dz = own.z - v.sim.pz;
    const w = this.player.walker;
    const me = { x: 0, z: 0, hx: own.hx + 0.2, hz: own.hz + 0.2, yaw: own.yaw };
    const free = (x: number, z: number): boolean => {
      me.x = x + dx;
      me.z = z + dz;
      if (boxesMeet(me, { x: w.x, z: w.z, hx: 0.45, hz: 0.45, yaw: 0 })) return false;
      const near = this.devNear;
      near.length = 0;
      this.player.solids.solidsNear(me.x, me.z, Math.hypot(me.hx, me.hz), near);
      for (const s of near) {
        // (low things, a kerb or a mat, and what is overhead stay out of it)
        if (s === own || s.y1 - s.y0 < 0.3 || s.y0 > v.sim.py + 1) continue;
        if (boxesMeet(me, s)) return false;
      }
      return true;
    };
    const px = v.sim.px;
    const pz = v.sim.pz;
    for (let r = 0; r <= 9; r += 0.6) {
      const n = r === 0 ? 1 : Math.round(r * 7);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const x = px + Math.cos(a) * r;
        const z = pz + Math.sin(a) * r;
        if (!free(x, z)) continue;
        if (r > 0) {
          v.sim.reset(x, this.groundAt(x, z) + 0.05, z, v.sim.yaw, this.ground);
          v.awake = 3;
        }
        return;
      }
    }
  }

  devPreview(item: DevItem | null, at: DevPoint | null): void {
    const key = item ? JSON.stringify(item) : '';
    if ((this.devGhost?.key ?? '') !== key) {
      this.devGhost?.group.removeFromParent();
      this.devGhost = null;
      if (item) {
        const group = new THREE.Group();
        group.name = 'ghost:dev';
        group.visible = false;
        this.core.scene.add(group);
        const g = { key, group };
        this.devGhost = g;
        void this.devModel(item).then((obj) => {
          if (this.devGhost !== g || !obj) return;
          // as it will lie: a wheel on its side
          const def = item.kind === 'part' ? partDef(item.id) : null;
          if (def && (def.cat === 'rim' || def.cat === 'tire')) {
            obj.rotation.x = Math.PI / 2;
            obj.position.y = (def.rim?.width ?? def.tire?.width ?? 0.15) / 2;
          }
          applyGhost(obj, 'empty', true);
          group.add(obj);
        });
      }
    }
    const g = this.devGhost;
    if (!g) return;
    g.group.visible = !!at;
    if (at) {
      this.core.place(g.group, at.x, at.y, at.z);
      g.group.rotation.set(0, -this.player.walker.heading, 0);
    }
  }

  devClear(): void {
    const n = this.loose.list.length;
    for (const l of [...this.loose.list]) this.loose.remove(l);
    this.ui.say(n ? `清掉了 ${n} 件。` : '地上本来就没有东西。', 2);
  }

  /** the vehicle the handling lab measures (devLab.ts): the one sat in, else the one in focus, else the nearest within 12 m */
  devLabVehicle(): { build: Build; name: string } | null {
    let v = this.seated ?? this.focus;
    if (!v) {
      const w = this.player.walker;
      let best = 12;
      for (const o of this.vehicles) {
        const d = Math.hypot(o.sim.px - w.x, o.sim.pz - w.z);
        if (d < best) {
          best = d;
          v = o;
        }
      }
    }
    return v ? { build: v.build, name: frameDef(v.build.frame).name.zh } : null;
  }

  devRepair(): void {
    for (const v of this.vehicles) {
      const b = v.build;
      const eng = Object.values(b.parts).find((i) => partDef(i.part).cat === 'engine');
      const fuelType = eng ? (partDef(eng.part).engine?.fuel ?? 'petrol') : 'petrol';
      b.cond = 1;
      b.dirt = 0;
      b.rust = 0;
      for (const { inst } of allInstances(b)) {
        const fresh = newInstance(inst.part, { charge: 1, fuelL: 1e6, fuelType });
        inst.cond = 1;
        inst.dirt = 0;
        inst.rust = 0;
        inst.flat = false;
        inst.fluids = fresh.fluids;
        if (fresh.tread !== undefined) inst.tread = fresh.tread;
      }
      v.changed();
    }
    this.ui.say('所有车都修好了：汽油、机油、冷却液、电瓶都加满了。', 2.5);
  }

  async devNewGame(resetDials: boolean): Promise<void> {
    this.ui.say('正在清空存档，回车库从头开始…', 8);
    if (resetDials && this.tune.changed().length) {
      // (the moved dials kept on the dev server first, loop/dev-tune-before-restart.json, so that none is lost)
      const { text, json } = this.tune.export(this.devTools.context());
      await Promise.race([this.devTools.saveTune(text, json, 'dev-tune-before-restart'), new Promise((r) => setTimeout(r, 1500))]);
      this.tune.resetAll();
    }
    this.newGame();
  }

  // ------------------------------------------------------------------ input

  private bindInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('mousedown', (e) => {
      // (the bench's blows: a click anywhere on the view strikes the next one)
      if (this.benchWs?.crafting && e.button === 0) {
        this.benchWs.strike();
        return;
      }
      if (!this.input.locked || this.deadT >= 0) return;
      this.audio.start();
      if (e.button === 0) this.leftButton = true;
      if (this.seated) {
        // (the right button held in a seat is sleep's — stepSleep, as on 11-24; it was never told the button, so only the
        // scripts, which set it, could sleep there)
        if (e.button === 2) this.rightButton = true;
        if (e.button === 0 && this.cockpit.aimedSeat && this.viewMode === 'cockpit') this.moveOver();
        else if (e.button === 0 && this.cockpit.aimedAft) this.goAft();
        else this.cockpit.press(this.seated, e.button === 2);
        return;
      }
      // (a page of the Tab screen: the left button is its own, the right one shuts it — every page the same way: docs/V3/plan/finish.md §十三)
      if (this.tabAt >= 0) {
        if (e.button === 0) this.tabPages[this.tabAt]?.press?.();
        else if (e.button === 2) this.closeTab();
        return;
      }
      if (this.listV) {
        if (e.button === 0) this.takeFromList();
        else if (e.button === 2) this.closeCargoList();
        return;
      }
      if (e.button === 0) this.player.press('mouse');
      if (e.button === 2) this.rightButton = true;
    });
    // scrubbing: the mouse moves the tool over the surface (the view holds still)
    document.addEventListener('mousemove', (e) => {
      if (this.player.scrub && this.input.locked) this.player.scrubMove(e.movementX, e.movementY);
      // (the thing in the hands has the view — a rod with a fish on: kernel/heldUse.ts look() — the mouse pulls it over)
      else if (this.heldLookNow && this.input.locked) this.player.heldPointer(e.movementX);
    });
    window.addEventListener('mouseup', (e) => {
      if (this.seated) this.cockpit.release(this.seated);
      if (e.button === 0) this.player.release('mouse');
      if (e.button === 0) this.leftButton = false;
      if (e.button === 2) this.rightButton = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // the parts bin open (the mouse free): a drag on the view turns it (either button: a trackpad has only the one)
    let turning = -1;
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.dev?.open || (e.button !== 0 && e.button !== 2)) return;
      turning = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId === turning) this.input.turn(e.movementX, e.movementY, 0.0045);
    });
    const stopTurning = (e: PointerEvent): void => {
      if (e.pointerId === turning) turning = -1;
    };
    canvas.addEventListener('pointerup', stopTurning);
    canvas.addEventListener('pointercancel', stopTurning);
    canvas.addEventListener('wheel', (e) => {
      if (this.tabAt >= 0) this.tabPages[this.tabAt]?.wheel?.(e.deltaY > 0 ? 1 : -1);
      else if (this.listV) this.moveListSel(e.deltaY > 0 ? 1 : -1);
      else if (this.seated && this.cockpit.wheel(this.seated, e.deltaY)) return;
      else if (this.seated) {
        const v = this.seated;
        if (this.seatAt === 'driver' && v.sim.manual) this.sound(v.sys.stepLever(e.deltaY > 0 ? 1 : -1) ? 'lever' : 'grind');
      } else this.player.wheel(e.deltaY);
    });
    window.addEventListener('keydown', () => this.audio.start(), { once: true });
    // the key card: at the very first start until the first click (docs/V3/plan/prompts.md 定案 4), and on F1 any time
    let seen = true;
    try {
      seen = localStorage.getItem('modcar.helpSeen') === '1';
      localStorage.setItem('modcar.helpSeen', '1');
    } catch {
      /* none */
    }
    this.helpDue = !this.params.shot && !seen;
    window.addEventListener('keydown', (e) => {
      // at the bench: its list and its blows have the keys
      if (this.benchWs?.open && !e.repeat && this.benchWs.key(e.code)) {
        e.preventDefault();
        return;
      }
      // the key left of 1 (` on a US keyboard; § on a Mac's international one): the developer's parts bin — where
      // the developer's keys are (DEV_KEYS: not in a build made to be played, unless its address asks)
      if (DEV_KEYS && (e.code === 'Backquote' || e.code === 'IntlBackslash' || e.key === '`' || e.key === '§')) {
        e.preventDefault();
        if (!e.repeat) this.toggleDev();
        return;
      }
      if (this.listV && (e.code === 'KeyW' || e.code === 'ArrowUp' || e.code === 'KeyS' || e.code === 'ArrowDown')) {
        this.moveListSel(e.code === 'KeyW' || e.code === 'ArrowUp' ? -1 : 1);
        return;
      }
      // (the two lists beside a vehicle: A the hands', D the vehicle's)
      if (this.listV && (e.code === 'KeyA' || e.code === 'ArrowLeft' || e.code === 'KeyD' || e.code === 'ArrowRight')) {
        const right = e.code === 'KeyD' || e.code === 'ArrowRight';
        // (D past the last list: on to the Tab screen's next page — the recipes)
        if (right && !e.repeat && (!this.pairedList || this.listSide === 1) && this.tabPages.length) this.turnTab(1);
        else this.switchListSide(right ? 1 : 0);
        return;
      }
      // (a list that takes things in: Q puts the thing in the hands into it)
      if (this.listV && e.code === 'KeyQ' && !e.repeat) {
        this.putIntoList();
        return;
      }
      if (e.key === 'Escape' && (this.listV || this.tabAt >= 0)) {
        this.closeTab();
        return;
      }
      if (e.key === 'Escape' && this.dev?.open) {
        this.toggleDev(false);
        return;
      }
      if (e.code === 'F1') {
        e.preventDefault();
        this.ui.showHelp(!this.ui.helpShown);
        return;
      }
      if (e.code === 'F2') {
        e.preventDefault();
        this.ui.showAssists(this.ui.assistsShown ? null : this.assistItems());
        return;
      }
      if (DEV_KEYS && e.code === 'F9') {
        e.preventDefault();
        this.askNewGame();
        return;
      }
      // on foot: the number keys put the hotbar's slots in the hands (1 and 2, a backpack's 3 to 6 after
      // them); I shows and hides the item cards
      const slotKey = /^Digit([1-6])$/.exec(e.code);
      if (!this.ui.assistsShown && !this.seated && slotKey) {
        this.player.select(Number(slotKey[1]) - 1);
        return;
      }
      // the assists card open: the number keys switch them
      const n = ASSIST_KEYS.indexOf(e.code);
      if (n >= 0 && this.ui.assistsShown) {
        const entry = ASSIST_LABELS[n];
        if (!entry) return;
        this.assists[entry[0]] = !this.assists[entry[0]];
        saveAssists(this.assists);
        this.ui.showAssists(this.assistItems());
      }
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === canvas) this.ui.showHelp(false);
      // (let go in play — Esc, or the window left: the pause; the bench, the panel and the death card let it go themselves)
      else if (!this.params.shot && this.played && this.input.lockable && !this.menu.isOpen && !this.dev?.open && !this.benchWs?.open && this.deadT < 0) this.openMenu('pause');
    });
    // the game is kept when the page goes out of sight or away
    if (this.params.keep) {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.save();
      });
      window.addEventListener('pagehide', () => this.save());
    }
    this.input.onAction((a) => {
      this.hud.dismissHint();
      if (this.deadT >= 0) return;
      if (a === 'pack') {
        // (Tab: the Tab screen — a page of it open: shut)
        if (this.tabAt >= 0) this.closeTab();
        else this.toggleCargoList();
        return;
      }
      // Q on foot: what is in the hands put down at once (into the vehicle looked at); placing, a quarter round
      // to the left (in a seat Q is held to stand up: the frame counts that) — docs/V3/plan/hands.md §四
      if (a === 'drop') {
        if (this.seated || this.listV) return;
        const p = this.player.placer;
        if (p?.placing) p.turnStep(-1);
        // (the thing in the hands may have its own way with Q: a fish held to the water goes back into it)
        else if (!this.player.heldDrop()) this.player.drop();
        return;
      }
      // R: placing — what is in the hands held out to be put down just so, or taken back
      if (a === 'place') {
        if (this.seated || this.listV) return;
        const p = this.player.placer;
        if (p && (p.placing || this.player.held)) p.toggle();
        return;
      }
      // E: only while placing — a quarter round to the right, onto the grid (docs/V3/plan/prompts.md §四)
      if (a === 'turnRight') {
        if (this.player.placer?.placing) this.player.placer.turnStep(1);
        return;
      }
      if (a === 'crouch') {
        // (C crouches and stands again, on foot only: the view is V's everywhere — docs/V3/plan/finish.md §十三)
        if (!this.seated) this.crouch = !this.crouch;
        return;
      }
      if (a === 'camera') {
        // (V, the view: in a seat the cab or behind the car; on foot her eyes or behind her)
        if (this.seated) this.viewMode = this.viewMode === 'cockpit' ? 'chase' : 'cockpit';
        else this.her.thirdPerson = !this.her.thirdPerson;
        return;
      }
      // (the numbers line: one of the developer's keys — DEV_KEYS)
      if (a === 'hud' && DEV_KEYS) this.hud.toggle();
      const v = this.seated;
      if (!v || this.seatAt === 'pass') return;
      if (a === 'key') {
        if (v.sys.running) v.sys.stop('');
        else if (!this.blockedStart(v)) v.sys.crank(true);
        this.sound('key');
      } else if (a === 'lights') {
        v.sys.cycleLights();
        this.sound('switch');
      } else if (a === 'horn') v.sys.setHorn(true);
      else if (a === 'leverUp' || a === 'leverDown') this.sound(v.sys.stepLever(a === 'leverUp' ? -1 : 1) ? 'lever' : 'grind');
      else if (a === 'manual') v.sim.setManual(!v.sim.manual);
    });
    this.input.onRelease((a) => {
      const v = this.seated;
      if (!v) return;
      if (a === 'horn') v.sys.setHorn(false);
      else if (a === 'key') v.sys.crank(false);
    });
  }

  /** the item cards shown or hidden (I), kept for next time */
  private toggleCards(): void {
    this.player.cardsOn = !this.player.cardsOn;
    try {
      localStorage.setItem('modcar.ui.cards', this.player.cardsOn ? '1' : '0');
    } catch {
      /* kept for this page */
    }
  }

  /** what the gamepad's buttons do in the game (pad.ts): what the mouse buttons and the keys do */
  private padHost(): PadHost {
    if (this.padHostObj) return this.padHostObj;
    const g = this;
    const wake = (): boolean => {
      g.ui.showHelp(false);
      g.hud.dismissHint();
      g.audio.start();
      return g.deadT < 0;
    };
    this.padHostObj = {
      seated: () => !!g.seated,
      listing: () => !!g.listV,
      benchOpen: () => !!g.benchWs?.open,
      bench: (code) => !!g.benchWs?.key(code),
      primary: (down) => {
        g.leftDown = down;
        if (!down) {
          if (g.seated) g.cockpit.release(g.seated);
          g.player.release('mouse');
          return;
        }
        if (!wake()) return;
        if (g.seated) g.cockpit.press(g.seated, false);
        else if (g.listV) g.takeFromList();
        else g.player.press('mouse');
      },
      use: (down) => {
        if (!down) {
          if (!g.seated) g.player.release();
          return;
        }
        if (!wake()) return;
        if (g.listV) g.takeFromList();
        // (the mark on the other front seat: over to it; else out)
        else if (g.seated) {
          if (g.cockpit.aimedSeat && g.viewMode === 'cockpit') g.moveOver();
          else if (g.cockpit.aimedAft) g.goAft();
          else g.getOut();
        }
        else g.player.press();
      },
      pack: () => {
        if (wake()) g.toggleCargoList();
      },
      hotbar: (step) => g.player.wheel(step * 100),
      listMove: (step) => g.moveListSel(step),
      listClose: () => g.closeCargoList(),
      cards: () => g.toggleCards(),
      help: () => g.ui.showHelp(!g.ui.helpShown),
      highlight: () => {
        g.grimeShowT = 2.4;
        g.sound('highlight_ping', 0.7);
      },
      camera: () => {
        if (!g.seated) g.crouch = !g.crouch;
        else g.viewMode = g.viewMode === 'cockpit' ? 'chase' : 'cockpit';
      },
      horn: (down) => {
        if (!down || wake()) g.seated?.sys.setHorn(down);
      },
      hazard: () => {
        const v = g.seated;
        if (!v) return;
        v.view.hazard = !v.view.hazard;
        g.sound('switch');
      },
      upright: () => {
        if (g.seated) g.resetUpright(g.seated);
      },
      connected: (name) => {
        if (name) g.ui.say('手柄已连接', 2.5);
      },
    };
    return this.padHostObj;
  }

  private assistItems(): { label: string; on: boolean }[] {
    return ASSIST_LABELS.map(([k, label]) => ({ label, on: this.assists[k] }));
  }

  /** the assists into the vehicles and the player, every step */
  private applyAssists(): void {
    const a = this.assists;
    // (the proving ground's robot never wants the brake to become reverse: it holds the brake at walking pace)
    const robot = this.provingRun?.pilot ? this.seated : null;
    for (const v of this.vehicles) {
      v.sim.autoRelease = a.autoRelease;
      v.sim.abs = a.abs;
      v.sim.esc = a.esc;
      v.assistHold = a.autoHold;
      v.sys.assistReverse = a.autoReverse && v !== robot;
    }
    this.player.showGhostsOn = a.ghosts;
    this.player.showCardOn = a.compare;
  }

  // ------------------------------------------------------------------ getting in and out

  /** a wreck by the road is for its parts (docs/V3/plan/growth.md 定案 2): a find at a big place may be got into */
  partsOnly(v: ModVehicle): boolean {
    return !!this.wrecks?.isWreck(v) && !this.wrecks.takeable(v);
  }

  enter(v: ModVehicle, at: FrontSeat = 'driver'): void {
    const seat = seatMount(v, at);
    if (!seat || !v.build.parts[seat.id]) {
      this.player.flashWhy('没有座椅');
      return;
    }
    if (this.partsOnly(v)) {
      this.player.flashWhy('只能拆零件');
      return;
    }
    // (a motorcycle on another's rack is carried, not ridden: v3/moto-rack)
    if (v.carriedBy) {
      this.player.flashWhy('先从车架上卸下来');
      return;
    }
    this.seatAt = at;
    this.seatSlide = at === 'pass' ? 1 : 0;
    // (one sits down standing up: C means the view in the seat)
    this.crouch = false;
    // (from the living space behind: one sits down where one stood)
    if (this.player.aboard) this.player.leaveAboard();
    // a wreck by the road one gets into is one's own from then on (it stays when one drives off, it is saved)
    if (this.wrecks?.claim(v)) this.ui.say(`这辆${v.view.frame.name.zh}归你了`, 2.6);
    // (what is in the two slots goes along)
    this.player.ghosts.clear();
    this.player.clearHighlight();
    this.seated = v;
    this.focus = v;
    v.awake = 3;
    this.input.freeLook = false;
    this.input.lookYaw = 0;
    // astride a bike one looks down the road over the clocks (level, they sit under the view's edge)
    this.input.lookPitch = this.seatPitch(v);
    this.rig.reset();
    this.shake.reset();
    // (no door on a motorcycle: the stand folds up)
    this.sound(v.view.frame.balance ? 'lever' : 'door_close', v.view.frame.balance ? 0.7 : 1);
    if (!v.view.frame.balance) this.foley?.cue('car_getin', 0.9);
    this.checkTutorial();
  }

  getOut(): void {
    const v = this.seated;
    // (how fast it goes, not only along its length: a car spinning out slides sideways with next to nothing along it —
    // got out of at 13 km/h sideways it slid on for two seconds on its handbrake, J8–J10's "creep")
    if (!v || v.sim.speed * 3.6 > 6) return;
    const b = this.basis;
    v.sim.basis(b);
    const e = this.eyeOf(v, this.seatAt);
    const side = e.z < 0 ? -1 : 1;
    const out = v.sim.spec.body.halfWidth + 0.55;
    // beside the door of one's seat, facing the way the car faces
    const lx = e.x - 0.2;
    const lz = side * out;
    const x = v.sim.px + b[0] * lx + b[6] * lz;
    const z = v.sim.pz + b[2] * lx + b[8] * lz;
    const heading = Math.atan2(b[2], b[0]);
    this.seated = null;
    this.seatAt = 'driver';
    this.seatSlide = 0;
    this.seatSeen = null;
    v.view.highlight(null);
    // nothing holds it now but the handbrake (or P): say so when it is off
    if (v.sim.parkBrake <= 0 && v.sim.selector !== 'P') this.player.flashWhy(v.sys.hasPart('handbrake') ? '没拉手刹' : '没有手刹');
    this.player.walker.place(x, z, heading);
    this.input.freeLook = true;
    this.input.lookYaw = heading;
    this.input.lookPitch = 0;
    this.sound(v.view.frame.balance ? 'lever' : 'door_close', v.view.frame.balance ? 0.7 : 1);
    if (!v.view.frame.balance) this.foley?.cue('car_getout', 0.9);
  }

  /** may one go into a vehicle's living space now: it stands still, an elevating roof is up (else says why) */
  mayBoard(v: ModVehicle): boolean {
    if (v.sim.bodyKmh > 3) {
      this.player.flashWhy('车还在动');
      return false;
    }
    // (an elevating roof down: no standing up in there)
    if (aboardOf(v.view.frame.id)?.roof && v.view.roofT < 0.95) {
      this.player.flashWhy('先把顶升起来');
      return false;
    }
    return true;
  }

  /** into a vehicle's living space by an open door (docs/V3/nodes/M2-rv.md): only a vehicle standing still */
  board(v: ModVehicle, door: BoardDoor, lookYaw?: number): void {
    if (!this.mayBoard(v)) return;
    const ab = new Aboard(v, door.inside, door.inYaw);
    this.player.goAboard(ab);
    this.input.freeLook = true;
    // (walked in: still looking where one looked; by the key: straight in)
    this.input.lookYaw = lookYaw ?? ab.heading() + door.inYaw;
    this.sound('cloth', 0.35);
  }

  /** out of it by the door one looks at: outside the door, facing away from the vehicle */
  alight(v: ModVehicle, door: BoardDoor): void {
    const ab = this.player.aboard;
    if (!ab || ab.v !== v) return;
    const out = ab.toWorld(door.outside[0], 0, door.outside[1], this.core.origin, this.alightP);
    const heading = ab.heading() + door.inYaw + Math.PI;
    this.player.leaveAboard();
    this.player.walker.place(out.x, out.z, heading);
    this.input.lookYaw = heading;
    this.sound('cloth', 0.35);
  }
  private readonly alightP = { x: 0, y: 0, z: 0 };

  /** from the driver's seat back into the living space behind it (looking back, E): standing behind the seats, facing aft */
  goAft(): void {
    const v = this.seated;
    const def = v ? aboardOf(v.view.frame.id) : null;
    if (!v || !def || !def.aft) return;
    if (v.sim.bodyKmh > 3) {
      this.player.flashWhy('先停车');
      return;
    }
    if (def.roof && v.view.roofT < 0.95) {
      this.player.flashWhy('先把顶升起来');
      return;
    }
    this.seated = null;
    this.seatAt = 'driver';
    this.seatSlide = 0;
    this.seatSeen = null;
    v.view.highlight(null);
    const ab = new Aboard(v, def.aft, Math.PI);
    this.player.goAboard(ab);
    this.input.freeLook = true;
    this.input.lookYaw = ab.heading() + Math.PI;
    this.input.lookPitch = 0;
    this.sound('cloth', 0.4);
  }

  /** looking back from the seat into a living space behind it, the vehicle standing (the cockpit's E 到车厢里) */
  aftReady(v: ModVehicle): boolean {
    return !!aboardOf(v.view.frame.id)?.aft && Math.abs(this.input.lookYaw) > 1.9 && v.sim.bodyKmh < 3;
  }

  /**
   * Over to the other front seat (docs/V3/nodes/M1-interact.md): the vehicle stopped, a seat there; the eye goes
   * across (frame()'s seat eye), and from the passenger's seat one drives nothing until one moves back.
   */
  moveOver(): void {
    const v = this.seated;
    if (!v) return;
    const to: FrontSeat = this.seatAt === 'pass' ? 'driver' : 'pass';
    const seat = seatMount(v, to);
    if (!seat || !v.build.parts[seat.id]) {
      this.player.flashWhy('没有座椅');
      return;
    }
    if (v.sim.bodyKmh > 3) {
      this.player.flashWhy('先停车');
      return;
    }
    this.seatAt = to;
    this.sound('cloth', 0.5);
  }

  /**
   * The eye of a front seat (body frame): the driver's is the vehicle's own (spec.eye); the passenger's is as far
   * across from it as the seats stand apart.
   */
  eyeOf(v: ModVehicle, at: FrontSeat): { x: number; y: number; z: number } {
    const e = v.sim.spec.eye;
    if (at === 'driver') return e;
    const d = seatMount(v, 'driver');
    const p = passengerSeat(v);
    if (!d || !p) return { x: e.x, y: e.y, z: -e.z };
    return { x: e.x + (p.pos.x - d.pos.x), y: e.y + (p.pos.y - d.pos.y), z: e.z + (p.pos.z - d.pos.z) };
  }

  private resetUpright(v: ModVehicle): void {
    const s = v.sim;
    this.ground.sample(s.px, s.pz, this.gs);
    s.reset(s.px, this.gs.h + 0.15, s.pz, s.yaw);
    v.sys.bind(s);
    this.rig.reset();
    this.shake.reset();
  }

  // ------------------------------------------------------------------ PlayerHost

  changed(v: ModVehicle, what: string): void {
    v.changed();
    // (a seat taken out or a part on the bed: its floors are drawn again)
    this.cargo.invalidate(v);
    // a wheel or a spec change keeps the per-wheel grip in force
    applyWheelMods(v.sim, v.sys.derived);
    void what;
    this.checkTutorial();
  }

  /**
   * A door or a lid opened or shut. On a wreck, the first look under its bonnet or into its boot: the hinges
   * that stood for years, and what is in there — a find under the bonnet said with its stars (and heard: the
   * better it is the brighter), what was left in the boot listed
   */
  panelOpened(v: ModVehicle, mount: string, open: boolean): void {
    const w = this.wrecks?.wreckOf(v);
    if (!w || !open || w.opened.has(mount)) return;
    w.opened.add(mount);
    const m = v.view.frame.mounts.find((x) => x.id === mount);
    if (!m || (m.cat !== 'hood' && m.cat !== 'trunk')) return;
    this.sound('wreck_creak', 1, mount);
    const lid = m.cat === 'hood' ? '引擎盖' : '后备箱';
    // (what is under it, the best first: a find, or what an old car has; the sting only for a find, the brighter the better)
    const under = gradesOn(v.build, v.view.under(mount));
    const things = this.loose.ridersOf(v).filter((l) => l.stow && zoneOf(v.build.frame, l.stow)?.via?.includes(mount));
    if (things.length) {
      const names = things.slice(0, 3).map((l) => (l.item ? itemDef(l.item.item).name.zh : l.tool ? heldName({ kind: 'tool', tool: l.tool }) : l.part ? partDef(l.part.part).name.zh : ''));
      this.sounds()?.play('loot_reveal', { tier: 1 });
      this.ui.say(`${lid}里：${names.join('、')}${things.length > 3 ? '……' : ''}`, 2.8);
    } else if (under.length) {
      const best = under[0];
      if (best.star >= 3) this.sounds()?.play('loot_reveal', { tier: best.star });
      const rare = under.filter((g) => isRare(v.build.frame, g.part) && g !== best);
      const more = rare.length ? `，还有${rare.slice(0, 2).map((g) => partDef(g.part).name.zh).join('、')}` : '';
      this.ui.say(`${lid}下面：${partDef(best.part).name.zh} ${'★'.repeat(best.star)}${more}`, 3.4);
    } else if (m.cat === 'hood') this.ui.say(`${lid}下面是空的`, 2);
  }

  /** every frame: a find on a wreck catching the light; seen close to for the first time, heard */
  private stepGlints(dt: number): void {
    const wr = this.wrecks;
    if (!wr) return;
    this.glints ??= new WreckGlints(this.core.scene);
    const sky = this.env.sky as unknown as { daylight?: number };
    const light = Math.max(sky.daylight ?? 1, this.seated?.sys.lightsOn ? 0.45 : 0);
    const live = [...wr.live.values()];
    this.glints.update(dt, live, this.core.camera.position, light, this.time);
    // (a wreck about: its creak, its reveal and the glint rendered before they are wanted)
    if (live.length && !this.warmedWrecks) {
      this.warmedWrecks = true;
      this.warmLater(['wreck_creak', 'rare_glint']);
      for (let tier = 1; tier <= 5; tier++) this.warmQueue.push(['loot_reveal', { tier }]);
    }
    if ((this.greetT -= dt) > 0) return;
    this.greetT = 0.2;
    // the glint heard within a few metres of the nearest find not under a shut lid (one loop, the nearest sets it)
    const eye = this.core.camera.position;
    const box = this.glintBox;
    let near = Infinity;
    for (const l of live) {
      if (!l.sig || l.v.view.root.position.distanceTo(eye) > 12) continue;
      for (const g of glintsOf(l.v)) {
        if (!l.v.view.boundsOf(g.mount, box)) continue;
        near = Math.min(near, box.distanceToPoint(eye));
      }
    }
    this.glintGain = light > 0.08 ? Math.max(0, Math.min(1, (4 - near) / 3.4)) : 0;
  }

  private readonly glintBox = new THREE.Box3();

  /** these rendered one a frame from now on */
  private warmLater(kinds: readonly (FoleyShot | FoleyLoop)[]): void {
    for (const k of kinds) this.warmQueue.push([k, {}]);
  }

  /** how far a vehicle is from where one hears from (the seat one is in, or one's feet) */
  private listenerDist(v: ModVehicle): number {
    const sv = this.seated;
    return Math.hypot(v.sim.px - (sv ? sv.sim.px : this.player.walker.x), v.sim.pz - (sv ? sv.sim.pz : this.player.walker.z));
  }

  /** the loops of the road (the tyres on what they roll on, a flat flapping, a bare rim grinding) and of a find close by, kept going this frame */
  private worldLoops(): void {
    this.roadLeft = 1;
    const v = this.focus;
    // the tyres on what they roll on (tyreSound.ts): from the seat through the cab (as open as its doors), or as one
    // stands by (worked out with the sound off too: the probes read it)
    this.tyreNow = null;
    if (v) {
      const near = this.seated === v ? 1 : Math.max(0, 1 - this.listenerDist(v) / 60);
      const inside = this.seated === v && this.viewMode === 'cockpit';
      this.tyreNow = tyreLoops(v.sim.wheels, { wet: this.env.state.wetness, near, cabin: inside ? this.cabinOpen(v) : null });
      this.roadLeft = this.tyreNow.road;
    }
    if (!this.foley) return;
    if (v) {
      const sim = v.sim;
      const near = this.seated === v ? 1 : Math.max(0, 1 - this.listenerDist(v) / 60);
      const flats = Object.values(v.build.parts).filter((p) => !!p.sub.tire?.flat).length;
      const sp = sim.speed;
      // (a slap a turn of the wheel: six a second at rate 1)
      if (flats > 0 && sp > 0.3 && near > 0) {
        const turns = sp / (2 * Math.PI * Math.max(0.15, sim.spec.wheelRadius));
        this.loopFor('flat_flap', near * Math.min(1, 0.8 + 0.2 * (flats - 1)) * Math.min(1, sp / 1.5), Math.max(0.25, Math.min(3.5, turns / 6)));
      }
      const rim = sim.feel.rim ?? 0;
      if (rim > 0.05 && near > 0) this.loopFor('rim_grind', near * Math.min(1, rim / 5), Math.max(0.25, Math.min(3.5, rim / 8.33)));
      for (const l of this.tyreNow?.loops ?? []) this.loopFor(l.name, l.gain, l.rate, l.cutoff);
      if (!this.warmedRolls && v === this.seated) {
        this.warmedRolls = true;
        this.warmLater(['roll_asphalt', 'roll_wet', 'skid_asphalt', 'roll_gravel']);
      }
      // (a tyre in its last stage: its blow-out and what follows rendered before they are wanted)
      if (!this.warmedTyres && v === this.seated && v.sys.dash.tyres.some((t) => t.tread >= 0 && t.tread <= 0.25)) {
        this.warmedTyres = true;
        this.warmLater(['tyre_burst', 'flat_flap', 'rim_grind']);
      }
    }
    if (this.glintGain > 0.01) this.loopFor('rare_glint', this.glintGain);
  }

  // ------------------------------------------------------------------ sound

  /** the engine voice and the mechanical sounds (docs/MODCAR_AUDIO.md), on the game's context once a gesture started it */
  private voice: EngineVoice | null = null;
  private foley: Foley | null = null;
  /** loops asked for this frame (spray, sponge, pour, the wrench) and the ones playing */
  private readonly loopsNow = new Map<FoleyLoop, FoleyOpts>();
  private readonly loopsOn = new Set<FoleyLoop>();
  private hornOn: 'horn_beep' | 'horn_trumpet' | 'horn_air' | '' = '';
  /** the radio of the vehicle one is in or beside */
  private radio: Radio | null = null;
  private readonly lastGear: { v: ModVehicle | null; gear: number } = { v: null, gear: 0 };
  private wasBlinking = false;

  private sounds(): Foley | null {
    const ctx = this.audio.context;
    const out = this.audio.output;
    if (!ctx || !out) return null;
    if (!this.foley) {
      this.voice = new EngineVoice(ctx, out);
      this.foley = new Foley(ctx, out);
      this.foley.warm(['door_open', 'door_close', 'part_pickup', 'part_setdown', 'part_install', 'key_turn', 'handbrake_pull', 'gear_shift', 'ratchet', 'latch']);
      // the sound archive's recordings in place of the synthesized sounds, once it answers (docs/V3/nodes/M4-audio.md)
      const archive = openArchive(ctx, this.params.archive !== false);
      this.foley.archive = archive;
      void archive.probe().then((ok) => {
        if (ok) this.foley?.warmCues(ARCHIVE_WARM);
      });
    }
    return this.foley;
  }

  /** what the sound archive is doing (the developer's tab 声音, the harness) */
  soundStatus(): SoundStatus {
    const a = this.foley?.archive;
    const d = a?.debug();
    const v = this.seated;
    return {
      live: !!a?.table,
      on: !!a?.inUse,
      cues: d?.cues ?? 0,
      decoded: d?.decoded ?? 0,
      failed: d?.failed ?? 0,
      played: d?.played ?? {},
      beds: this.ambience?.debug() ?? {},
      radio: this.radio?.debug() ?? null,
      station: this.radioStation(),
      seated: !!v,
      footing: this.footing(),
      thunders: this.ambience?.thunders ?? 0,
    };
  }

  /** the station of the radio heard now (the car's, the garage's set, a system's), as its dial says it */
  private radioStation(): string {
    const d = this.radio?.debug();
    return d && d.mode !== 'off' && d.station >= 0 ? stationLabel(d.station) : '';
  }

  /** a test sound of the developer's tab: a footfall where one stands, a car door, a thing picked up, thunder */
  soundTest(what: 'step' | 'door' | 'pickup' | 'thunder'): void {
    const f = this.sounds();
    if (!f) return;
    if (what === 'step') f.cue(`step:${this.footing()}`, 1);
    else if (what === 'door') f.play('door_close', {});
    else if (what === 'pickup') f.play('part_pickup', { mass: 5 });
    else if (!this.ambience?.thunder(1.5)) this.foley?.archive?.warm('thunder');
  }

  /** the archive's recordings in use, or the game's own synthesized sounds alone (to compare) */
  setArchive(on: boolean): void {
    const a = this.foley?.archive;
    if (a) a.inUse = on;
  }

  /** the footsteps' counts last heard (FootWalker.steps, lands, jumps), and the walk inside a living space */
  private readonly feet = { steps: 0, lands: 0, jumps: 0, walked: 0, x: NaN, z: NaN };
  private readonly footGs = new GroundSample();

  /** what the feet fall on now (core/audio/footing.ts) */
  footing(): Footing {
    const w = this.player.walker;
    const tag = w.floorTag;
    const colon = tag.indexOf(':');
    const siteKind = colon > 0 ? (this.places?.siteKind(tag.slice(0, colon)) ?? null) : null;
    let surface: number = Surface.Grass;
    if (!tag) {
      this.ground.sample(w.x, w.z, this.footGs);
      surface = this.footGs.surface;
    }
    return footingOf({ aboard: !!this.player.aboard, workshop: this.place === 'garage' && (!this.seamless || this.indoors()), floorTag: tag, siteKind, surface: surface as SurfaceId });
  }

  /** footfalls, jumps and landings on what is under the feet (the archive's recordings: none without it) */
  private updateFootsteps(): void {
    const f = this.foley;
    const w = this.player.walker;
    const k = this.feet;
    const fresh = w.steps !== k.steps;
    const jumped = w.jumps !== k.jumps;
    const landed = w.lands !== k.lands;
    k.steps = w.steps;
    k.jumps = w.jumps;
    k.lands = w.lands;
    if (!f || this.seated || !f.has('step:dirt')) {
      k.x = NaN;
      return;
    }
    let step = fresh && !w.swimming && w.depth < 0.3;
    const ab = this.player.aboard;
    if (ab) {
      // (inside a living space the walk is the vehicle's own: a footfall every 70 cm of it)
      if (Number.isFinite(k.x)) k.walked += Math.hypot(w.x - k.x, w.z - k.z);
      k.x = w.x;
      k.z = w.z;
      if (k.walked > 0.7) {
        k.walked = 0;
        step = true;
      }
    } else k.x = NaN;
    if (!step && !jumped && !landed) return;
    const on = this.footing();
    if (landed) {
      const g = Math.min(1.4, 0.5 + w.landSpeed / 8);
      if (w.landSpeed > 7) f.cue('land:hard', g);
      if (!f.cue(`land:${on}`, g)) f.cue('land', g);
    } else if (jumped) {
      if (!f.cue(`jump:${on}`, 1)) f.cue('jump', 1);
    } else {
      const speed = ab ? 1.2 : Math.hypot(w.vx, w.vz);
      f.cue(`step:${on}`, footfallGain(on, speed, speed > 3), { vary: 0.12 });
    }
  }

  /** the country round one and its weather, recorded (ambience.ts); the synthesized rain, thunder and weather wind silent while it plays */
  private ambience: Ambience | null = null;
  private readonly ambIn: AmbienceInputs = { daylight: 1, green: 1, dry: 0, cold: 0, rain: 0, hail: 0, snow: 0, wind: 0, dust: 0, enclosed: 0, flash: 0 };
  private updateAmbience(dt: number): void {
    const a = this.foley?.archive;
    const ctx = this.audio.context;
    const bus = this.audio.outsideBus;
    const live = !!a && a.live && !!ctx && !!bus && a.has('bed:wind_light');
    this.audio.replaced.rain = live;
    this.audio.replaced.thunder = live;
    if (!live || !a || !ctx || !bus) {
      // (switched off: the beds fade out, the synthesized weather is back)
      this.ambience?.silence(dt);
      return;
    }
    this.ambience ??= new Ambience(ctx, a, bus);
    const i = this.ambIn;
    const w = this.env.state;
    i.daylight = this.env.sky.daylight;
    // the kind of country: its regions' kin, as one blends into the next along the road
    const bl = this.bl;
    i.green = i.dry = i.cold = 0;
    const kin = (id: number, share: number): void => {
      const k = BIOMES[id]?.kin ?? 'plains';
      if (k === 'desert') i.dry += share;
      else if (k === 'alpine') i.cold += share;
      else i.green += share;
    };
    kin(bl.a, 1 - bl.t);
    kin(bl.b, bl.t);
    i.rain = w.rain;
    i.hail = w.hail;
    i.snow = w.snow;
    i.wind = w.wind;
    i.dust = w.dust;
    i.enclosed = this.seated ? 1 - this.cabinOpen(this.seated) : this.shelterNow;
    i.flash = this.env.flash;
    this.ambience.update(i, dt);
  }

  /** the material a door makes its sound in, by the style of the part on it */
  private panelMaterial(v: ModVehicle | null | undefined, mount?: string): PanelMaterial {
    const inst = v && mount ? v.build.parts[mount] : undefined;
    const style = inst ? partDef(inst.part).panel?.style : undefined;
    return style === 'rusty' || style === 'armor' || style === 'cage' || style === 'fridge' ? style : 'metal';
  }

  /**
   * A sound by name, from the player, the cab and the garage: one-shots play at once; the names of things
   * that go on while a button is held (spray, scrub, pour) keep their loop going for this frame.
   * @param gain a mass (kg) for things picked up and put down, litres moved for a pour, else a level
   */
  sound(name: string, gain = 1, mount?: string): void {
    const f = this.sounds();
    if (!f) return;
    const held = this.player.held;
    const v = this.seated ?? this.focus;
    switch (name) {
      case 'bite':
        // (the archive's chewing is a whole meal's: played once, at the first bite)
        if (f.has('eat')) {
          if (this.player.biteCount <= 1) f.cue('eat');
          return;
        }
        break;
      case 'pickup': {
        const what = held?.kind === 'item' ? pickupOf(held.item.item) : held?.kind === 'tool' && held.tool.kind === 'jerrycan' ? 'gascan' : null;
        if (what && f.cue(`pickup:${what}`, 1)) return;
        break;
      }
      case 'spray':
        this.loopsNow.set('spray_hiss', {});
        return;
      case 'pump_run':
        this.loopFor('pump_run', 0.9);
        return;
      case 'scrub':
        this.loopsNow.set('sponge', {});
        return;
      case 'glug':
        this.loopsNow.set('glug', {});
        return;
      case 'pour': {
        const liquid = held?.kind === 'tool' ? (held.tool.kind === 'bottle' ? 'water' : held.tool.kind === 'oilcan' ? 'oil' : 'fuel') : 'fuel';
        this.loopsNow.set('pour', { liquid });
        return;
      }
      // (water poured from one vessel into another: docs/ND/PLAN.md, a water can, a bucket, a pump)
      case 'pour_water':
        this.loopsNow.set('pour', { liquid: 'water' });
        return;
    }
    if (name === 'ratchet_done' || name === 'remove_done') {
      const kg = name === 'remove_done' ? gain : held?.kind === 'part' ? partDef(held.inst.part).mass : 10;
      this.thunk = Math.min(1, 0.35 + kg / 250);
    }
    const shot: Partial<Record<string, [FoleyShot, FoleyOpts]>> = {
      ratchet_done: ['part_install', { mass: held?.kind === 'part' ? partDef(held.inst.part).mass : 10 }],
      remove_done: ['part_remove', { mass: gain }],
      pickup: ['part_pickup', { mass: gain }],
      putdown: ['part_setdown', { mass: gain }],
      door_open: [mount && /hood/.test(mount) ? 'hood_open' : mount && /trunk/.test(mount) ? 'trunk_open' : 'door_open', { material: this.panelMaterial(v, mount) }],
      door_close: [mount && /hood/.test(mount) ? 'hood_close' : mount && /trunk/.test(mount) ? 'trunk_close' : 'door_close', { material: this.panelMaterial(v, mount) }],
      key: ['key_turn', {}],
      ratchet: [v && v.sim.parkBrake > 0 ? 'handbrake_pull' : 'handbrake_release', {}],
      lever: ['lever', {}],
      crash: ['crash', { gain }],
      shift: ['gear_shift', { gain: 0.6 }],
      grind: ['gear_grind', { gain: Math.min(1, gain) }],
      latch: ['latch', {}],
      switch: ['switch', {}],
      // the body
      bite: ['bite', {}],
      wrapper: ['wrapper', {}],
      can_open: ['can_open', {}],
      cap_open: ['cap_open', {}],
      pills: ['pills', {}],
      gulp: ['gulp', {}],
      hurt: ['hurt', { gain }],
      cloth: ['cloth', {}],
    };
    const s = shot[name];
    if (s) {
      f.play(s[0], s[1]);
      return;
    }
    // a dish's reveal by its stars (the kitchen: 'loot_reveal_3')
    const reveal = /^loot_reveal_([1-5])$/.exec(name);
    if (reveal) {
      f.play('loot_reveal', { gain, tier: Number(reveal[1]) });
      return;
    }
    // the workshop's (foley.ts names, a material after the last _ for the grinding and the hammer)
    const m = /^(shred|hammer_hit)_(\w+)$/.exec(name);
    const kind = m ? m[1] : name;
    if ((FOLEY_SHOTS as readonly string[]).includes(kind)) f.play(kind as FoleyShot, { gain, ...(m ? { grind: m[2] } : {}) } as FoleyOpts);
    // a recording of the archive's with no synthesized sound of its own (the kitchen's 'yuck'): heard when the archive is there
    else f.cue(name, gain);
  }

  /** a loop of the game's own kept going this frame (GameContext.loop) */
  loop(name: string, gain = 1): void {
    this.loopFor(name, gain);
  }

  /** a sound made ready ahead of its first play (GameContext.warmSound): rendered, its recording fetched */
  warmSound(name: string): void {
    if ((FOLEY_SHOTS as readonly string[]).includes(name) || (FOLEY_LOOPS as readonly string[]).includes(name)) this.warmQueue.push([name as FoleyShot, {}]);
    else this.sounds()?.warmCues([name]);
  }

  /** a loop of the workshop's (the recycler) kept going this frame */
  loopFor(name: string, gain = 1, rate?: number, cutoff?: number): void {
    if (!(FOLEY_LOOPS as readonly string[]).includes(name)) return;
    const o: FoleyOpts = { gain };
    if (rate !== undefined) o.rate = rate;
    if (cutoff !== undefined) o.cutoff = cutoff;
    this.loopsNow.set(name as FoleyLoop, o);
  }

  // ------------------------------------------------------------------ cleaning (grime.ts, docs/MODCAR.md §15)

  get camera(): THREE.Camera {
    return this.core.camera;
  }

  /** the point of something that can be cleaned a ray (render space) meets first, within far */
  grimeCast(origin: THREE.Vector3, dir: THREE.Vector3, far: number): ScrubHit | null {
    let best: ScrubHit | null = null;
    for (const v of this.vehicles) {
      v.view.root.getWorldPosition(this.gcV);
      if (this.gcV.distanceTo(origin) > far + 7) continue;
      const h = v.view.grimeCast(origin, dir, best ? best.dist : far);
      if (!h || (best && h.dist >= best.dist)) continue;
      // (inside the car nothing is cleaned or painted: its seats and levers, its cabin's and boot's own faces)
      if ((h.part.inst && staysClean(h.part.inst.part)) || this.insideOf(v, h.point, h.normal, h.glass) || (h.part.owner.startsWith('p:') && v.view.panelFacesIn(h.part.owner.slice(2).split('+')[0], h.normal))) continue;
      best = { v, loose: null, key: h.part.key, owner: h.part.owner, inst: h.part.inst, kind: h.part.kind, label: h.part.label, point: h.point, normal: h.normal, dist: h.dist, glass: h.glass };
    }
    const lh = this.loose.grimeCast(origin, dir, best ? best.dist : far);
    if (lh && (!best || lh.dist < best.dist)) best = { v: null, loose: lh.part.loose, key: lh.part.inst.uid, owner: lh.part.owner, inst: lh.part.inst, kind: 0, label: lh.part.label, point: lh.point, normal: lh.normal, dist: lh.dist, glass: lh.glass };
    if (best) best.label = unitName(best.kind, this.unitOfHit(best), best.label);
    return best;
  }

  /** a point of a vehicle (render space) on its inside — in its cabin's box or its boot's, on a face not turned out of it (docs/V3/plan/hands.md §五) */
  private insideOf(v: ModVehicle, p: THREE.Vector3, n: THREE.Vector3, glass = false): boolean {
    // (the windows are the outside: cleaned from without)
    if (glass) return false;
    const m = this.gcM.copy(v.view.model.matrixWorld).invert();
    const lp = this.gcV.copy(p).applyMatrix4(m);
    const ln = this.gcN.copy(n).transformDirection(m);
    for (const b of [v.view.mats.cabin, v.view.mats.boot]) {
      if (!b || !b.containsPoint(lp)) continue;
      // (a side's skin turned out of it — a pillar, a frame's outer face — is the outside; the rest is in)
      const cz = (b.min.z + b.max.z) / 2;
      const side = lp.z - cz;
      const out = Math.abs(side) > (b.max.z - b.min.z) * 0.35 && ln.z * Math.sign(side) > 0.3;
      if (!out) return true;
    }
    return false;
  }

  private readonly gcN = new THREE.Vector3();

  /** the unit of a part the point is in (by its normal in the vehicle's frame) */
  private unitOfHit(h: ScrubHit): number {
    if (!h.v) return h.glass ? 1 : 0;
    this.gcM.copy(h.v.view.model.matrixWorld).invert();
    const n = this.gcV.copy(h.normal).transformDirection(this.gcM);
    return unitAt(h.kind, n, h.glass);
  }

  /** a part as the masks see it (null: it is not on the vehicle any more, or not lying about) */
  private grimeOwnerOf(v: ModVehicle | null, owner: string, loose: Loose | null = null): GrimeOwner | null {
    if (loose) {
      const p = this.loose.grimeParts(loose).find((x) => x.owner === owner);
      const look = p ? this.loose.lookOfOwner(owner) : undefined;
      if (!p || !look) return null;
      return { key: p.inst.uid, meshes: p.meshes, look, size: p.size, kind: 0, frame: loose.obj, around: loose.obj, amounts: { dirt: p.inst.dirt, crust: p.inst.crust ?? 0, rust: p.inst.rust }, loose: true };
    }
    if (!v) return null;
    const p = v.view.grimeParts().find((x) => x.owner === owner);
    if (!p) return null;
    const b = v.build;
    const i = p.inst;
    return {
      key: p.key,
      meshes: p.meshes,
      look: p.look,
      size: p.size,
      kind: p.kind,
      frame: v.view.model,
      around: v.view.root,
      amounts: i ? { dirt: i.dirt, crust: i.crust ?? 0, rust: i.rust } : { dirt: b.dirt, crust: b.crust ?? 0, rust: b.rust },
    };
  }

  /** the mask of what is under the tool, opened the first time a tool goes over it */
  private openGrime(v: ModVehicle | null, owner: string, label: string, o: GrimeOwner, loose: Loose | null = null): GrimeMask | null {
    const g = this.grime;
    if (!g) return null;
    let m = g.get(o.key);
    const fresh = !m;
    m ??= g.open(o);
    if (v) v.view.setGrimeHeld(owner, true);
    if (loose) this.loose.setGrimeHeld(loose.uid, true);
    const p = v?.view.grimeParts().find((x) => x.owner === owner);
    const li = loose ? this.loose.grimeParts(loose).find((x) => x.owner === owner)?.inst : undefined;
    if (p?.inst) p.inst.grime = true;
    else if (li) li.grime = true;
    else if (v && owner === 'body') v.build.grime = true;
    if (!this.cleaning.has(o.key)) this.cleaning.set(o.key, { v, loose, owner, key: o.key, label, kind: o.kind, units: [], measuredAt: -1, dirty: true, flash: 0, flashUnit: -1 });
    if (fresh) this.measureClean(o.key, this.cleaning.get(o.key)!, o, m);
    return m;
  }

  /** a stroke of a cleaning tool, from a to b: the band it takes off, what comes off it */
  scrubStroke(hit: ScrubHit, a: THREE.Vector3, b: THREE.Vector3, side: THREE.Vector3, tool: Tool, c: Cleaner, dt: number): void {
    const g = this.grime;
    const o = this.grimeOwnerOf(hit.v, hit.owner, hit.loose);
    if (!g || !o) return;
    const base = hit.v?.view.grimeParts().find((x) => x.owner === hit.owner)?.label ?? (hit.loose ? this.loose.grimeParts(hit.loose).find((x) => x.owner === hit.owner)?.label : undefined) ?? hit.label;
    const m = this.openGrime(hit.v, hit.owner, base, o, hit.loose);
    if (!m) return;
    g.stroke(m, o, { a, b, normal: hit.normal, side, half: c.width / 2, soft: 0.006, depth: c.depth, take: c.take, wet: c.wet });
    // (a coat of paint under it: the sponge wipes off what is still wet, a scraper, the brush and the grinder
    // strip what has set — the harder the tool on rust, the more of it at a pass)
    const coat = this.coats?.get(o.key);
    if (coat) {
      const dry = c.wet > 0 ? 0 : (c.coat ?? Math.max(c.take[1] * 0.6, c.take[2]));
      const wet = c.wet > 0 ? 0.75 : Math.max(0.5, dry);
      this.coats!.strip(coat, o, { a, b, normal: hit.normal, side, half: c.width / 2, soft: 0.006, depth: c.depth }, dry, wet);
      this.coatCover.delete(o.key);
    }
    const cl = this.cleaning.get(o.key);
    if (cl) cl.dirty = true;
    // what comes off: flakes of crust, crumbs of dirt, flecks of rust, the sponge's foam
    const len = a.distanceTo(b);
    const u = cl ? this.unitLeft(cl, this.unitOfHit(hit)) : null;
    const left = u ? (tool.kind === 'brush' ? Math.max(u.rust, u.dirt * 0.5) : u.dirt) : 1;
    if (this.flakes && left > 0.04 && len > 0.002) {
      const n = Math.min(4, Math.max(1, Math.round(len * 90 * Math.min(1, left * 2))));
      const am = o.amounts;
      const col =
        tool.kind === 'sponge'
          ? FOAM
          : tool.kind === 'brush' && am.rust > 0.05
            ? RUST_BITS
            : am.crust > 0.15
              ? hit.glass
                ? GLASS_CRUST
                : CRUST_BITS
              : DUST_BITS;
      const push = this.gcV.subVectors(b, a).normalize();
      this.flakes.emit(b, hit.normal, push, col, n, tool.kind === 'sponge');
    }
    void dt;
  }

  /** the scrubbing stopped: what it was on is measured at once */
  scrubEnd(last: ScrubHit | null, tool: Tool): void {
    void tool;
    if (!last) return;
    const c = this.cleaning.get(last.key);
    if (c) {
      c.dirty = true;
      c.measuredAt = -1;
    }
  }

  /** how much is left of a unit of what is being cleaned (its last measure), or null */
  private unitLeft(c: Cleaning, unit: number): UnitLeft | null {
    return c.units.find((u) => u.unit === unit) ?? null;
  }

  /**
   * What is being cleaned measured again (only: just these units, the side being scrubbed — the rest when the
   * tool is lifted); units come clean (the ding, the flash), and the whole part
   */
  private measureClean(key: string, c: Cleaning, o: GrimeOwner, m: GrimeMask, only?: number[]): void {
    const g = this.grime;
    if (!g) return;
    const got = g.measure(o, only);
    if (only && c.units.length) {
      for (const u of got) {
        const i = c.units.findIndex((x) => x.unit === u.unit);
        if (i >= 0) c.units[i] = u;
        else c.units.push(u);
      }
    } else {
      c.units = got;
      c.dirty = false;
    }
    c.measuredAt = this.time;
    const MIN = 2.5;
    for (const u of c.units) {
      const name = unitName(c.kind, u.unit, c.label);
      if (u.dirtWas > MIN && !m.doneDirt.has(u.unit) && u.dirt <= 0.08) {
        m.doneDirt.add(u.unit);
        g.snap(m, o, u.unit, 'dirt');
        c.flash = 1;
        c.flashUnit = u.unit;
        this.sound('clean_ding', 0.9);
        const rusty = u.rustWas > MIN && u.rust > 0.08;
        if (!rusty) this.ui.say(`${name} · 干净了`, 1.6);
        if (/挡风玻璃/.test(name)) this.done.add('windscreen');
      }
      if (u.rustWas > MIN && !m.doneRust.has(u.unit) && u.rust <= 0.08 && (m.doneDirt.has(u.unit) || u.dirtWas <= MIN)) {
        m.doneRust.add(u.unit);
        g.snap(m, o, u.unit, 'rust');
        c.flash = 1;
        c.flashUnit = u.unit;
        this.sound('clean_rust_done', 0.9);
        this.ui.say(`${name} · 干净了`, 1.6);
      }
    }
    const left = c.units.some((u) => (u.dirtWas > MIN && !m.doneDirt.has(u.unit)) || (u.rustWas > MIN && !m.doneRust.has(u.unit)));
    if (!left && c.units.length) this.cleanDone(key, c, o);
  }

  /** a whole part came clean: its figures to nothing, its mask goes; the whole vehicle: its own fanfare */
  private cleanDone(key: string, c: Cleaning, o: GrimeOwner): void {
    const v = c.v;
    const p = v?.view.grimeParts().find((x) => x.owner === c.owner);
    const inst = p?.inst ?? (c.loose ? (this.loose.grimeParts(c.loose).find((x) => x.owner === c.owner)?.inst ?? null) : null);
    if (inst) {
      inst.dirt = 0;
      inst.crust = 0;
      inst.rust = 0;
      inst.grime = false;
    } else if (v) {
      v.build.dirt = 0;
      v.build.crust = 0;
      v.build.rust = 0;
      v.build.grime = false;
    }
    this.grime?.close(key, o.look);
    // (a coat of paint on it: still drawn on its own, for the coat)
    const coated = !!this.coats?.get(key);
    if (!coated) v?.view.setGrimeHeld(c.owner, false);
    if (c.loose && !coated && !this.loose.grimeParts(c.loose).some((x) => x.inst !== inst && (this.grime?.get(x.inst.uid) || this.coats?.get(x.inst.uid)))) this.loose.setGrimeHeld(c.loose.uid, false);
    this.cleaning.delete(key);
    o.look.setGrimeFlash(1, -1);
    this.lookFlashes.push({ look: o.look, t: 1 });
    if (v) {
      v.sys.rebuild();
      // the whole vehicle clean: its own sound
      const all = v.view.grimeParts().every((x) => {
        const f = x.inst ? x.inst.dirt + (x.inst.crust ?? 0) + x.inst.rust : v.build.dirt + (v.build.crust ?? 0) + v.build.rust;
        return f < 0.05 && !this.grime?.get(x.key);
      });
      if (all) {
        this.sound('clean_car_done', 1);
        this.ui.say(`${v.view.frame.name.zh} · 里里外外焕然一新！`, 3.2);
      }
    }
  }

  /** every frame: the masks follow what grew on their parts, dry, flash; what was scrubbed is measured again */
  private stepGrime(dt: number): void {
    const g = this.grime;
    if (!g) return;
    this.grimeShowT = Math.max(0, this.grimeShowT - dt);
    // (a cleaning tool in the hands — the plastic scraper, the grinder: where the dirt still is shows softly on what
    // one looks at; the button down, it goes within 0.15 s, so one sees the real surface; let go, it is back 0.3 s on —
    // docs/V3/plan/hands.md §五)
    const hh = this.seated ? null : this.player.held;
    const cleaning = (hh?.kind === 'tool' && !!cleanerOf(hh.tool)) || (hh?.kind === 'item' && hh.item.item === ND_GRINDER);
    const down = this.leftDown || !!this.player.scrub;
    if (down) this.showDownAt = this.time;
    const want = cleaning && !down && this.time - this.showDownAt > 0.3 ? GRIME_SHOW_HELD : 0;
    this.showK = want > this.showK ? Math.min(want, this.showK + (dt / 0.25) * GRIME_SHOW_HELD) : Math.max(want, this.showK - (dt / 0.15) * GRIME_SHOW_HELD);
    carEnvUniforms.uGrimeShow.value = Math.max(this.grimeShowT > 0 ? Math.min(1, this.grimeShowT / 0.4, (2.4 - this.grimeShowT) / 0.2) : 0, this.showK);
    const lit = cleaning || this.grimeShowT > 0;
    const sa = this.player.scrubAim;
    const showV = lit ? (sa?.v ?? (sa?.loose ? null : this.player.lookVehicle)) : null;
    for (const v of this.vehicles) v.view.mats.setShowHere(v === showV);
    this.loose.setShowHere(lit ? (sa?.loose?.uid ?? null) : null);
    // a part with a mask fitted again (or loaded): its look takes the mask, it is drawn on its own
    for (const v of this.vehicles) {
      for (const p of v.view.grimeParts()) {
        if (!g.get(p.key)) continue;
        if (!p.look.hasGrime) g.bind(p.key, p.look);
        v.view.setGrimeHeld(p.owner, true);
        const c = this.cleaning.get(p.key);
        if (!c) this.cleaning.set(p.key, { v, loose: null, owner: p.owner, key: p.key, label: p.label, kind: p.kind, units: [], measuredAt: -1, dirty: true, flash: 0, flashUnit: -1 });
        else if (c.v !== v || c.owner !== p.owner) {
          c.v = v;
          c.loose = null;
          c.owner = p.owner;
          c.label = p.label;
        }
      }
    }
    for (const l of this.loose.list) {
      for (const p of this.loose.grimeParts(l)) {
        if (!g.get(p.inst.uid)) continue;
        const look = this.loose.lookOfOwner(p.owner);
        if (look && !look.hasGrime) g.bind(p.inst.uid, look);
        this.loose.setGrimeHeld(l.uid, true);
        const c = this.cleaning.get(p.inst.uid);
        if (!c) this.cleaning.set(p.inst.uid, { v: null, loose: l, owner: p.owner, key: p.inst.uid, label: p.label, kind: 0, units: [], measuredAt: -1, dirty: true, flash: 0, flashUnit: -1 });
        else if (c.loose !== l || c.owner !== p.owner) {
          c.v = null;
          c.loose = l;
          c.owner = p.owner;
          c.label = p.label;
        }
      }
    }
    // (a part with its mask in the hands shows it there too)
    const hp = this.player.held;
    const hl = hp?.kind === 'part' ? this.heldThing.look : undefined;
    if (hp?.kind === 'part' && hl && g.get(hp.inst.uid) && !hl.hasGrime) g.bind(hp.inst.uid, hl);
    for (const [key, c] of this.cleaning) {
      const o = this.grimeOwnerOf(c.v, c.owner, c.loose);
      const m = g.get(key);
      if (!o || !m || o.key !== key) continue;
      g.grow(m, o);
      g.dry(m, o, dt);
      if (c.flash > 0) {
        c.flash = Math.max(0, c.flash - dt * 2.2);
        o.look.setGrimeFlash(c.flash, c.flashUnit);
      }
      const sh = this.player.scrub?.hit;
      const scrubbing = sh?.key === key;
      // (while the tool is on it: the unit under it, a few times a second; the whole part once it is lifted)
      if (c.dirty && scrubbing && c.units.length && this.time - c.measuredAt > 0.25) this.measureClean(key, c, o, m, [this.unitOfHit(sh!)]);
      else if (c.dirty && !scrubbing && this.time - c.measuredAt > 0.05) this.measureClean(key, c, o, m);
    }
    this.stepCoats();
    this.stepSprayRing();
    for (let i = this.lookFlashes.length - 1; i >= 0; i--) {
      const f = this.lookFlashes[i];
      f.t = Math.max(0, f.t - dt * 1.6);
      f.look.setGrimeFlash(f.t, -1);
      if (f.t <= 0) this.lookFlashes.splice(i, 1);
    }
    // the bits that came off fall to the floor
    const floor = (this.garage && !this.seamless ? 0 : this.groundAt(this.player.walker.x, this.player.walker.z)) - this.core.origin.y;
    const landed = this.flakes?.update(dt, floor) ?? 0;
    this.flakeTickT -= dt;
    if (landed > 0 && this.flakeTickT <= 0) {
      this.sound('flake_drop', 0.6);
      this.flakeTickT = 0.25;
    }
    // the sound of the scrub, by what it is on and how fast it goes: its loop goes on (silent) while the tool
    // stands still, so the next stroke picks it up where it was; a stroke after a pause catches the surface
    const sc = this.player.scrub;
    const held = this.player.held;
    const f = this.foley;
    const cleaningTool = held?.kind === 'tool' && (held.tool.kind === 'sponge' || held.tool.kind === 'scraper' || held.tool.kind === 'brush');
    if (cleaningTool && f && !this.warmedScrub) {
      this.warmedScrub = true;
      f.warm(['scrape_glass', 'scrape_metal', 'scrape_rust', 'scrape_mud', 'brush_wire', 'sponge_scrub'] as FoleyLoop[]);
      for (const surface of ['glass', 'metal', 'rust', 'mud'] as const) f.warm(['scrape_start' as FoleyShot], { surface } as FoleyOpts);
    }
    // a cleaning tool in the hands: the vehicles near got ready to be scrubbed, a little each frame (the rays'
    // grids over their meshes, the measure's programs), so the first stroke does not stall (a spray can aims by them too)
    if (cleaningTool || (held?.kind === 'tool' && held.tool.kind === 'spray')) this.readyScrub();
    if (sc && held?.kind === 'tool') {
      const h = sc.hit;
      const c = h ? this.cleaning.get(h.key) : null;
      const u = c && h ? this.unitLeft(c, this.unitOfHit(h)) : null;
      const dirty = u ? (held.tool.kind === 'brush' ? Math.max(u.rust, u.dirt) : u.dirt) > 0.05 : true;
      const am = h ? this.grimeOwnerOf(h.v, h.owner, h.loose)?.amounts : undefined;
      const surface: 'glass' | 'metal' | 'rust' | 'mud' = h?.glass ? 'glass' : am && am.crust > 0.25 ? 'rust' : am && am.dirt > 0.35 ? 'mud' : 'metal';
      const name: FoleyLoop | '' = !h
        ? this.scrubLoop
        : ((held.tool.kind === 'sponge' ? 'sponge_scrub' : held.tool.kind === 'brush' ? 'brush_wire' : `scrape_${surface}`) as FoleyLoop);
      // (the level smoothed over a few frames: the mouse's jitter would make it flutter)
      const want = h ? Math.min(1, sc.speed / 0.7) * (dirty ? 1 : 0.4) : 0;
      this.scrubGain += (want - this.scrubGain) * (1 - Math.exp(-dt / 0.06));
      if (name) {
        this.scrubLoop = name;
        this.loopFor(name, this.scrubGain, 0.7 + Math.min(0.9, sc.speed * 0.6));
      }
      // the blade catching as a stroke begins
      if (sc.speed > 0.06 && this.scrubStill > 0.15 && h && held.tool.kind !== 'sponge' && f) f.play('scrape_start' as FoleyShot, { surface: held.tool.kind === 'brush' ? 'rust' : surface, gain: 0.8 } as FoleyOpts);
      this.scrubStill = sc.speed < 0.02 ? this.scrubStill + dt : 0;
    } else {
      this.scrubLoop = '';
      this.scrubGain = 0;
      this.scrubStill = 1;
    }
  }

  // ------------------------------------------------------------------ spray paint (paint.ts, docs/MODCAR.md §16)

  /** what a spray can held along the ray would paint: the thing the ray meets first (by its meshes), within far */
  paintCast(origin: THREE.Vector3, dir: THREE.Vector3, far: number): PaintAim | null {
    const h = this.grimeCast(origin, dir, far);
    if (!h) return null;
    if (h.v) {
      const t = h.v.view.paintTarget(h.owner);
      if (!t) return null;
      // (and only what has a painted skin: a bare steel bull bar takes no coat)
      const skin = t.paintable && takesCoat(h.v.view.grimeParts().find((x) => x.owner === h.owner)?.meshes ?? []);
      return { v: h.v, loose: null, inst: t.inst, mount: t.mount, owner: h.owner, label: t.label, point: h.point.clone(), normal: h.normal.clone(), dist: h.dist, paintable: skin };
    }
    if (!h.loose || !h.inst) return null;
    // (a tyre on a wheel lying about: the wheel's, and no paint)
    const own = h.owner === `l:${h.loose.uid}`;
    const skin = own && takesPaint(h.inst.part) && takesCoat(this.loose.grimeParts(h.loose).find((x) => x.owner === h.owner)?.meshes ?? []);
    return { v: null, loose: h.loose, inst: h.inst, mount: null, owner: h.owner, label: partDef(h.inst.part).name.zh, point: h.point.clone(), normal: h.normal.clone(), dist: h.dist, paintable: skin };
  }

  /**
   * The can sprayed at it for dt seconds (docs/V3/plan/growth.md §1.5, J3): a disc of the nozzle's size where it
   * lands, soft to its rim, over what is there; the can drawn on all the while. The ring: how much of the part the
   * coat covers (measured a few times a second).
   */
  spray(aim: PaintAim, can: Tool, dt: number): SprayResult {
    const left = sprayLeft(can);
    const o = this.grimeOwnerOf(aim.v, aim.owner, aim.loose);
    const cs = this.coats;
    if (!o || !cs || left <= 0) return { t: 0, used: 0, done: false, already: false, empty: left <= 0 };
    const coat = this.openCoat(aim.v, aim.owner, o, aim.loose);
    if (!coat) return { t: 0, used: 0, done: false, already: false, empty: false };
    const nz = nozzleOf(can);
    const hex = paintHex(can.colour ?? 0);
    this.sprayColour.setRGB(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, THREE.LinearSRGBColorSpace);
    // (painted over rust that was never ground off: noted, it comes back through with the days)
    const owned = this.coatOwnerOf(aim.v, aim.owner, aim.loose);
    if (owned && !owned.coatRust && o.amounts.rust > 0.15) owned.coatRust = [o.amounts.rust, itemNow()];
    cs.spray(coat, o, aim.point, aim.normal, nz.r, this.sprayColour, nz.rate * dt, this.time);
    const used = sprayUse(can, dt);
    const cov = this.coverOf(coat);
    if (sprayLeft(can) <= 1e-9 && used > 0) this.player.flashWhy('罐子空了');
    return { t: Math.min(1, cov.dry + cov.wet * (1 - cov.dry)), used, done: false, already: false, empty: sprayLeft(can) <= 1e-9 };
  }

  /** how much of what the can is aimed at a coat covers, and how much of it is wet (null: no coat on it) */
  coatOn(aim: PaintAim): { dry: number; wet: number } | null {
    const cs = this.coats;
    if (!cs) return null;
    const key = aim.loose ? this.loose.grimeParts(aim.loose).find((x) => x.owner === aim.owner)?.inst.uid : aim.v?.view.grimeParts().find((x) => x.owner === aim.owner)?.key;
    const c = key ? cs.get(key) : undefined;
    return c ? this.coverOf(c) : null;
  }

  /** how much of a coated part the coat covers, measured at most a few times a second */
  private coverOf(c: Coat): { dry: number; wet: number } {
    const m = this.coatCover.get(c.key);
    if (m && this.time - m.at < 0.35) return m;
    const r = this.coats!.measure(c);
    const out = { dry: r.dry, wet: r.wet, at: this.time };
    this.coatCover.set(c.key, out);
    return out;
  }

  /** the part (or the body) a coat belongs to, as the save has it: where its flags are kept */
  private coatOwnerOf(v: ModVehicle | null, owner: string, loose: Loose | null): { coat?: boolean; coatRust?: [number, number] } | null {
    if (loose) return this.loose.grimeParts(loose).find((x) => x.owner === owner)?.inst ?? null;
    if (!v) return null;
    const p = v.view.grimeParts().find((x) => x.owner === owner);
    return p?.inst ?? (owner === 'body' ? v.build : null);
  }

  /** the coat of what the can is on, made the first time it is sprayed: the part drawn on its own from then on */
  private openCoat(v: ModVehicle | null, owner: string, o: GrimeOwner, loose: Loose | null): Coat | null {
    const cs = this.coats;
    if (!cs) return null;
    const c = cs.open(o);
    if (v) v.view.setGrimeHeld(owner, true);
    if (loose) this.loose.setGrimeHeld(loose.uid, true);
    const p = this.coatOwnerOf(v, owner, loose);
    if (p) p.coat = true;
    return c;
  }

  /** how far rust painted over without grinding has come back through (the days since: three to all of it) */
  private coatBleed(p: { coatRust?: [number, number] } | null | undefined): number {
    const r = p?.coatRust;
    if (!r) return 0;
    return r[0] * Math.min(1, Math.max(0, (itemNow() - r[1]) / COAT_BLEED_S));
  }

  /** every frame: the coats on their looks (a part fitted again, a reload), set a minute after the last spray, rust coming back through */
  private stepCoats(): void {
    const cs = this.coats;
    if (!cs) return;
    for (const v of this.vehicles) {
      for (const p of v.view.grimeParts()) {
        const c = cs.get(p.key);
        if (!c) continue;
        if (!p.look.hasCoat) p.look.setCoat(c);
        v.view.setGrimeHeld(p.owner, true);
        p.look.setCoatBleed(this.coatBleed(p.inst ?? (p.owner === 'body' ? v.build : null)));
      }
    }
    for (const l of this.loose.list) {
      for (const p of this.loose.grimeParts(l)) {
        const c = cs.get(p.inst.uid);
        if (!c) continue;
        const look = this.loose.lookOfOwner(p.owner);
        if (look && !look.hasCoat) look.setCoat(c);
        this.loose.setGrimeHeld(l.uid, true);
        look?.setCoatBleed(this.coatBleed(p.inst));
      }
    }
    const hp = this.player.held;
    const hl = hp?.kind === 'part' ? this.heldThing.look : undefined;
    if (hp?.kind === 'part' && hl) {
      const c = cs.get(hp.inst.uid);
      if (c && !hl.hasCoat) hl.setCoat(c);
    }
    for (const key of cs.keys) {
      const c = cs.get(key)!;
      if (c.wetNow && this.time - c.sprayedAt > COAT_WET_S) {
        cs.set(c);
        this.coatCover.delete(key);
      }
    }
  }

  /** the ring on the surface where the spray would land (the nozzle's size): a can in the hands, aimed at what takes paint */
  private stepSprayRing(): void {
    const ring = this.sprayRing;
    if (ring) ring.visible = false;
    const held = this.seated ? null : this.player.held;
    const t = this.player.target;
    const u = carEnvUniforms;
    if (held?.kind !== 'tool' || held.tool.kind !== 'spray' || t?.kind !== 'paint' || sprayLeft(held.tool) <= 0) {
      u.uBrushOn.value = 0;
      this.heldThing.aimSpray(null);
      return;
    }
    // the brush's shadow where the paint goes (docs/V3/plan/hands.md §六): its size, the can's colour; its rim
    // warns when what it is on is rusty or dirty (the paint will not hide dirt; rust comes back through it)
    const a = t.aim;
    const p = a.inst ?? a.v?.build ?? null;
    u.uBrushOn.value = 1;
    u.uBrushC.value.copy(a.point);
    u.uBrushN.value.copy(a.normal);
    u.uBrushR.value = nozzleOf(held.tool).r;
    u.uBrushColor.value.setHex(paintHex(held.tool.colour ?? 0));
    u.uBrushWarn.value = p && (p.rust >= 0.3 || p.dirt >= 0.3 || (p.crust ?? 0) >= 0.3) ? 1 : 0;
    // the can held up to it: 0.37 m off, 0.30 m while spraying, the nozzle square to it (Nomad Drive's)
    this.heldThing.aimSpray(a.point, a.normal, !!this.player.spraying);
  }

  /** after a reload: the parts marked as painted take their coats back from the store */
  private async restoreCoats(): Promise<void> {
    const cs = this.coats;
    if (!cs) return;
    for (const v of this.vehicles) {
      for (const p of v.view.grimeParts()) {
        const own = p.inst ?? (p.owner === 'body' ? v.build : null);
        if (!own?.coat || cs.get(p.key)) continue;
        const size = Math.max(64, Math.floor(p.size / 2));
        const kept = await keptMask(`${p.key}:coat`, size);
        const o = this.grimeOwnerOf(v, p.owner);
        if (!o || cs.get(p.key)) continue;
        if (!kept) {
          own.coat = false;
          continue;
        }
        cs.open(o, kept.texels, size).changed = false;
        v.view.setGrimeHeld(p.owner, true);
      }
    }
    for (const l of this.loose.list) {
      for (const p of this.loose.grimeParts(l)) {
        if (!p.inst.coat || cs.get(p.inst.uid)) continue;
        const size = Math.max(64, Math.floor(p.size / 2));
        const kept = await keptMask(`${p.inst.uid}:coat`, size);
        const o = this.grimeOwnerOf(null, p.owner, l);
        if (!o) continue;
        if (!kept) {
          p.inst.coat = false;
          continue;
        }
        cs.open(o, kept.texels, size).changed = false;
        this.loose.setGrimeHeld(l.uid, true);
      }
    }
  }

  /** every frame: the mist out of the nozzle and over the surface, the hiss, the can shaken when it is taken up */
  private stepSpray(dt: number): void {
    const held = this.player.held;
    const can = held?.kind === 'tool' && held.tool.kind === 'spray' ? held.tool : null;
    const f = this.foley;
    if (can && f && !this.warmedSpray) {
      this.warmedSpray = true;
      f.warm(['spray_rattle', 'spray_start', 'spray_sputter', 'paint_done'] as FoleyShot[]);
      f.warm(['spray_hiss'] as FoleyLoop[]);
    }
    // a can taken up (with paint in it): shaken, the ball rattling, once in a while
    if ((can?.uid ?? '') !== this.heldCanUid) {
      this.heldCanUid = can?.uid ?? '';
      if (can && !this.seated && sprayLeft(can) > 0 && this.time - (this.shookAt.get(can.uid) ?? -1e9) > 30) {
        this.shookAt.set(can.uid, this.time);
        this.heldThing.shake();
        this.sound('spray_rattle', 0.9);
      }
    }
    const s = this.seated ? null : this.player.spraying;
    if (s && can) {
      if (!this.sprayWas) this.sound('spray_start', 1);
      // (the hiss a little lower as the can empties: the pressure falls)
      const fill = sprayLeft(can) / SPRAY_TIERS[sprayTier(can)].capacity;
      this.loopFor('spray_hiss', 1, 0.9 + 0.1 * fill);
      const noz = this.heldThing.nozzleWorld(this.nozV, this.nozD);
      if (noz && this.mist) {
        this.canUp.set(0, 1, 0).applyQuaternion(this.heldThing.root.quaternion);
        this.mist.emit(dt, noz, this.nozD, this.canUp, s.aim.point, s.aim.normal, paintHex(can.colour ?? 0), fill);
      }
      if (sprayLeft(can) <= 0) this.sound('spray_sputter', 1);
    } else if (this.player.sprayDry) this.sound('spray_sputter', 0.8);
    this.sprayWas = !!(s && can && sprayLeft(can) > 0);
    this.mist?.update(dt);
  }

  /** the vehicles made ready to scrub (their measure's programs compiled), and the meshes whose ray grids are still to build */
  private readonly scrubReady = new Set<ModVehicle>();
  private readonly gridQueue: THREE.Mesh[] = [];

  private readyScrub(): void {
    const g = this.grime;
    if (!g) return;
    const w = this.player.walker;
    for (const v of this.vehicles) {
      if (this.scrubReady.has(v) || Math.hypot(v.sim.px - w.x, v.sim.pz - w.z) > 8) continue;
      this.scrubReady.add(v);
      const parts = v.view.grimeParts();
      for (const p of parts) this.gridQueue.push(...p.meshes);
      // (the body and a panel between them have every material a measure draws)
      for (const p of [parts.find((x) => x.kind === 1), parts.find((x) => x.kind === 0 && x.owner.startsWith('p:'))]) {
        const o = p ? this.grimeOwnerOf(v, p.owner) : null;
        if (o) void g.prewarm(o);
      }
    }
    // two meshes' grids a frame
    for (let i = 0; i < 2 && this.gridQueue.length; i++) triGrid(this.gridQueue.shift()!.geometry);
  }

  /** where the scrubbing tool sits: its working face on the point, turned to the stroke and the surface */
  private scrubPose(sc: Scrub, cam: THREE.Camera): { pos: THREE.Vector3; q: THREE.Quaternion; at: THREE.Vector3 } | null {
    const h = sc.hit;
    const held = this.player.held;
    if (!h || held?.kind !== 'tool') return null;
    const n = h.normal.clone();
    const toEye = cam.position.clone().sub(h.point);
    if (n.dot(toEye) < 0) n.negate();
    const d = sc.dir.clone().addScaledVector(n, -sc.dir.dot(n));
    if (d.lengthSq() < 1e-6) d.set(0, 1, 0).cross(n);
    d.normalize();
    // (the handle towards the eye: the tool pushes away along the stroke's line, whichever way it goes)
    if (d.dot(toEye) > 0) d.negate();
    const x = new THREE.Vector3();
    const y = new THREE.Vector3();
    const z = new THREE.Vector3();
    let at: THREE.Vector3;
    const wiggle = 0.05 * Math.sin(this.time * 23) * Math.min(1, sc.speed);
    if (held.tool.kind === 'scraper') {
      // the blade's edge on the point, leaning into the surface (the models' +x the working end, +y up)
      const t = 0.5;
      x.copy(d).multiplyScalar(Math.cos(t)).addScaledVector(n, -Math.sin(t)).normalize();
      y.copy(n).multiplyScalar(Math.cos(t)).addScaledVector(d, Math.sin(t)).normalize();
      z.crossVectors(x, y);
      at = this.heldThing.marker('M_edge') ?? new THREE.Vector3(0.13, 0, 0);
    } else if (held.tool.kind === 'brush') {
      // the bristles on it, the block across the stroke
      y.copy(n);
      x.crossVectors(n, d).normalize();
      z.crossVectors(x, y);
      at = this.heldThing.marker('M_face') ?? new THREE.Vector3(0.08, 0, 0);
    } else {
      // the sponge flat on it
      y.copy(n);
      x.copy(d);
      z.crossVectors(x, y);
      at = new THREE.Vector3(0, 0, 0);
    }
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(n, wiggle));
    return { pos: h.point.clone().addScaledVector(n, 0.0015), q, at };
  }

  /** the scrub's ring at the tool (how clean that piece is) and the mouse's point */
  private showScrub(cam: THREE.Camera): void {
    const hud = (this.scrubHud ??= new ScrubHud(this.ui.root));
    const sc = this.player.scrub;
    const held = this.player.held;
    const s = this.ui.hudScale;
    const toHud = (p: THREE.Vector3): { x: number; y: number } => {
      const q = p.clone().project(cam);
      return { x: (((q.x + 1) / 2) * window.innerWidth) / s, y: (((1 - q.y) / 2) * window.innerHeight) / s };
    };
    const h = sc?.hit ?? (!this.seated && held?.kind === 'tool' ? this.player.scrubAim : null);
    const c = h ? this.cleaning.get(h.key) : null;
    let what: { key: string; name: string; clean: number; done: boolean } | null = null;
    if (h && held?.kind === 'tool' && !this.seated) {
      const unit = this.unitOfHit(h);
      const u = c ? this.unitLeft(c, unit) : null;
      const brush = held.tool.kind === 'brush';
      const left = u ? (brush ? (u.rustWas > 2.5 ? u.rust : u.dirt) : u.dirtWas > 2.5 ? u.dirt : 0) : 1;
      const m = this.grime?.get(h.key);
      const done = !!m && (brush ? m.doneRust.has(unit) : m.doneDirt.has(unit));
      what = { key: `${h.key}:${unit}`, name: h.label, clean: c || !this.grime?.get(h.key) ? (u ? 1 - left : this.figuresClean(h) ? 1 : 0) : 0, done: done || (u ? left <= 0.08 : this.figuresClean(h)) };
    }
    const cursor = sc ? { x: (((sc.cursor.x + 1) / 2) * window.innerWidth) / s, y: (((1 - sc.cursor.y) / 2) * window.innerHeight) / s } : null;
    hud.show(h && what && sc ? toHud(h.point) : null, sc ? what : null, cursor);
  }

  /** is what the tool is on clean by its figures (no mask) */
  private figuresClean(h: ScrubHit): boolean {
    const i = h.inst;
    const b = h.v?.build;
    const f = i ? i.dirt + (i.crust ?? 0) + i.rust : b ? b.dirt + (b.crust ?? 0) + b.rust : 0;
    return f < 0.05;
  }

  // ------------------------------------------------------------------ the generator's engine

  private genVoice: EngineVoice | null = null;
  /** the generator's own bank (gen_d1), or the mower's single while that is not there */
  private genBank = '';
  private readonly listenV = new THREE.Vector3();

  genSound(s: { running: boolean; cranking: boolean; rpm: number; load: number; at: THREE.Vector3; stalled?: boolean } | null): void {
    const ctx = this.audio.context;
    const out = this.audio.output;
    if (!ctx || !out) return;
    if (!this.genVoice) {
      this.genVoice = new EngineVoice(ctx, out);
      this.genBank = 'eng_mower';
      void loadBank(ctx, 'gen_d1').then(
        () => (this.genBank = 'gen_d1'),
        () => undefined,
      );
    }
    if (!s) {
      // (switched off or run dry: its own run-down, never a stall)
      this.genVoice.update({ engineId: this.genBank, rpm: 0, load: 0, throttle: 0, running: false, cranking: false, inside: false, doorsOpen: 1, distance: 30, stalled: false });
      return;
    }
    const cam = this.core.camera.getWorldPosition(this.listenV);
    const d = Math.max(0.5, cam.distanceTo(s.at));
    // (heard through the wall from inside, the doors shut: duller and quieter)
    const inside = this.place === 'garage' && (this.seamless ? this.indoors() : this.player.walker.x < 7) && !this.seated;
    const shut = inside && !(this.garage?.doorsOpen?.() ?? true);
    // (the rack follows the load: light running sounds light, the recycler's grinding loads it)
    this.genVoice.update({ engineId: this.genBank, rpm: s.rpm, load: s.load, throttle: s.running ? s.load : 0, running: s.running, cranking: s.cranking, inside: shut, doorsOpen: shut ? 0.25 : 1, distance: d + (shut ? 4 : 0), starterRate: 1, stalled: s.stalled ?? false });
  }

  /** start the loops asked for this frame, stop the rest; the horn of the vehicle in focus */
  private updateFoley(): void {
    const f = this.foley;
    if (!f) return;
    const w = this.warmQueue.shift();
    if (w) {
      f.warm([w[0]], w[1]);
      f.warmCues(cueKeys(w[0], w[1]));
    }
    // the wrench turns while a part goes on or comes off
    const t = this.player.target;
    if (!this.seated && this.player.progress > 0 && t && (t.kind === 'ghost' || t.kind === 'looseSub' || ((t.kind === 'part' || t.kind === 'loose') && this.player.secondary))) this.loopsNow.set('ratchet', {});
    for (const [k, o] of this.loopsNow) {
      // (one with a level of its own, a machine heard from further off or nearer, follows it every frame)
      if (!this.loopsOn.has(k) || o.gain !== undefined) {
        f.start(k, o);
        this.loopsOn.add(k);
      }
    }
    for (const k of [...this.loopsOn]) {
      if (this.loopsNow.has(k)) continue;
      f.stop(k);
      this.loopsOn.delete(k);
    }
    this.loopsNow.clear();
    // the hazard relay ticks as the lamps go on and off (in the car one sits in)
    const sv = this.seated;
    const blinkNow = !!sv && sv.view.blinking;
    if (sv && blinkNow !== this.wasBlinking) f.play('switch', { gain: 0.35 });
    this.wasBlinking = blinkNow;
    const d = (this.seated ?? this.focus)?.sys.dash;
    const want = d?.horn ? (d.hornSound === 'trumpet' ? 'horn_trumpet' : d.hornSound === 'air' ? 'horn_air' : 'horn_beep') : '';
    if (want !== this.hornOn) {
      if (this.hornOn) f.horn(this.hornOn, false);
      if (want) f.horn(want, true);
      this.hornOn = want;
    }
  }

  /** how far a system zooms the view on foot (GameContext.lookZoom: 1 none) */
  lookZoom = 1;
  /** how far the view on foot stands where her eyes are crouched (0 standing … 1 crouched: HerInGame.CROUCH_VIEW) */
  private crouchView = 0;
  /** how much nearer her eyes the view on foot stands than it would (drawn back inside a living space), m */
  private aheadCut = 0;
  /** the view kept on a point while the kitchen crouches one to a stove or stands one up again: for how long still (s), the point, the pitch last set and what the mouse added since */
  private keepWas = false;
  private keepT = 0;
  private keepSet = 0;
  private keepUser = 0;
  private readonly keepAt = { x: 0, y: 0, z: 0 };
  private readonly keepEye = { x: 0, y: 0, z: 0 };
  private readonly keepDir = { x: 0, y: 0, z: 0 };
  private readonly keepLook = { yaw: 0, pitch: 0 };
  /** the view drawn in on what one stands working at, and crouched to it (GameContext.workZoom, workCrouch: the kitchen's) */
  workZoom = 1;
  workCrouch = false;
  /** the systems' fires (GameContext.warmers): what each adds to the air one feels where one is */
  readonly warmers: ((x: number, z: number) => number)[] = [];

  /** the systems' shares of a vehicle radio's loudness (GameContext.radioLevel): its knob's volume; 0, its station quiet */
  readonly radioLevel: ((v: ModVehicle) => number)[] = [];

  /** the systems' sets that play the radio's songs (GameContext.addRadios) */
  private readonly radioSets: (readonly RadioSet[])[] = [];

  addRadios(sets: readonly RadioSet[]): () => void {
    if (!this.radioSets.includes(sets)) this.radioSets.push(sets);
    return () => {
      const i = this.radioSets.indexOf(sets);
      if (i >= 0) this.radioSets.splice(i, 1);
    };
  }

  /** a system's solids: the walker and the vehicles keep out of them (GameContext.addSolids; docs/ND/PLAN.md, a prefab's doors) */
  addSolids(s: SolidSource): () => void {
    this.player.addSolids(s);
    this.vehicleSolids.add(s);
    return () => {
      this.player.removeSolids(s);
      this.vehicleSolids.remove(s);
    };
  }

  /** the car radio: the one in the vehicle one sits in, or the nearest one playing within earshot */
  private updateRadio(): void {
    const ctx = this.audio.context;
    const out = this.audio.output;
    if (!ctx || !out) return;
    this.radio ??= new Radio(ctx, out);
    let best: ModVehicle | null = null;
    let level = 0;
    for (const v of this.vehicles) {
      if (!v.radioOn || !v.sys.hasPart('radio') || v.sys.dash.battery <= 0.02) continue;
      const watts = v.view.frame.mounts.find((m) => m.cat === 'radio' && v.build.parts[m.id]);
      const loud = watts && partDef(v.build.parts[watts.id].part).radio?.tape ? 1.15 : 1;
      let l: number;
      // (about as loud as the engine and the road at a cruise: measured on the master output)
      if (this.seated === v) l = 0.14 * loud;
      else {
        const d = Math.hypot(this.player.walker.x - v.sim.px, this.player.walker.z - v.sim.pz);
        // a closed car keeps most of it in
        l = (0.09 * loud * (0.35 + 0.65 * (1 - v.sys.derived.enclosed))) / (1 + (d * d) / 6);
      }
      // (a system's say: the knob turned down, a tape playing instead)
      for (const f of this.radioLevel) l *= f(v);
      if (l > level) {
        level = l;
        best = v;
      }
    }
    let song = best?.radioSong ?? 0;
    // the garage's own set on the tool chest, heard round the workshop (and a little from a seat)
    const set = this.garage?.radio?.();
    if (set?.on) {
      const d = Math.hypot(this.player.walker.x - set.x, this.player.walker.z - set.z);
      const l = (this.seated ? 0.03 : 0.12) / (1 + (d * d) / 12);
      if (l > level) {
        level = l;
        song = set.song;
      }
    }
    // the systems' sets (a clock radio on the motorhome's table, a record player by the road): heard as loud as a
    // car radio's from a seat close by, through the walls of the vehicle they are in from outside it
    const here = this.seated ?? this.player.aboard?.v ?? null;
    const w = this.player.walker;
    for (const sets of this.radioSets) {
      for (const s of sets) {
        const d = this.seated ? Math.hypot(this.seated.sim.px - s.x, this.seated.sim.pz - s.z) * 0.5 : Math.hypot(w.x - s.x, w.y + 1.5 - s.y, w.z - s.z);
        const walls = s.inside && s.inside !== here ? 0.3 + 0.7 * this.cabinOpen(s.inside) : 1;
        const l = (0.12 * s.loud * walls) / (1 + (d * d) / 8);
        if (l > level) {
          level = l;
          song = s.song;
        }
      }
    }
    this.radio.update({ on: level > 0.01, song, level });
  }

  /** the engine of the vehicle in focus: heard from the seat, or from where one stands */
  private updateEngineVoice(): void {
    const voice = this.voice;
    const v = this.seated ?? this.focus;
    if (!voice || !v) return;
    const d = v.sys.dash;
    const sim = v.sim;
    const ex = v.view.frame.mounts.find((m) => m.cat === 'exhaust' && v.build.parts[m.id]);
    const eng = v.view.frame.mounts.find((m) => m.cat === 'engine' && v.build.parts[m.id]);
    const engInst = eng ? v.build.parts[eng.id] : undefined;
    const inGear = sim.selector === 'D' || sim.selector === 'R';
    // the cabin is as open as its missing and open doors (and a frame that has none) make it
    const open = this.cabinOpen(v);
    const inside = this.seated === v && this.viewMode === 'cockpit';
    const dx = this.player.walker.x - sim.px;
    const dz = this.player.walker.z - sim.pz;
    const dist = this.seated === v ? (this.viewMode === 'chase' ? v.view.frame.chase.dist : 3) : Math.hypot(dx, dz);
    // from where one stands: the speed it comes towards one at (Doppler)
    const approach = this.seated === v ? 0 : (sim.vx * dx + sim.vz * dz) / Math.max(0.5, dist);
    // a worn engine misfires, a worn-out one knocks; past the red it boils over
    const cond = engInst?.cond ?? 1;
    voice.update({
      engineId: engInst?.part ?? null,
      exhaustId: ex ? v.build.parts[ex.id].part : null,
      turbo: !!engInst?.sub.turbo,
      turboSize: engInst?.sub.turbo ? turboSizeOf(engInst.sub.turbo.part) : 0,
      rpm: d.rpm,
      load: d.running ? sim.throttle * (inGear ? 1 : 0.35) : 0,
      throttle: sim.throttle,
      running: d.running,
      cranking: d.cranking,
      inside,
      doorsOpen: open,
      starterRate: Math.min(1, d.battery * 1.6),
      boost: d.boost,
      distance: Math.max(1, dist),
      approach,
      misfire: Math.max(0, Math.min(1, (0.55 - cond) / 0.45)),
      knock: Math.max(0, Math.min(1, (0.3 - cond) / 0.3)),
      steam: Math.max(0, Math.min(1, (d.coolantC - 110) / 15)),
    });
    // the box changing gear by itself (automatic or a sequential change) clunks
    if (this.lastGear.v === v && this.lastGear.gear !== sim.gear && d.running) this.sound('shift');
    this.lastGear.v = v;
    this.lastGear.gear = sim.gear;
  }

  // ------------------------------------------------------------------ the checklist

  tutorialSteps(): BoardStep[] {
    const v = this.vehicles[0];
    if (!v) return [];
    if (this.kit === 'j5') return this.kitSteps(v);
    const b = v.build;
    // (what is in the tank against what it holds: the gauge's needle keeps a reserve under its bottom)
    const fuel = v.sys.dash.tankL > 0 ? v.sys.dash.fuelL / v.sys.dash.tankL : 0;
    const hood = v.view.hasPanel('hood') && !!b.parts.hood;
    // (the workshop's, before the car: the power, the materials, a scraper made at the bench)
    const ws = this.workshop && this.params.project === 'tutorial' ? this.workshop : null;
    const made = this.done.has('scraper');
    const steps: { id: string; text: string; done: boolean }[] = [
      ...(ws
        ? [
            { id: 'power', text: '到门外拉发电机，车库来电', done: this.done.has('power') || ws.power },
            { id: 'scrap', text: '旧零件箱丢进回收台，攒 70 废料', done: made || this.stock.scrap >= 70 },
            { id: 'scraper', text: '在工作台做一把清理铲', done: made },
            { id: 'windscreen', text: '拿清理铲刮干净挡风玻璃', done: this.done.has('windscreen') || this.windscreenClean() },
          ]
        : []),
      ...(hood || this.done.has('hood') ? [{ id: 'hood', text: '打开引擎盖', done: this.done.has('hood') || (!!b.parts.battery && !!b.parts.engine) }] : []),
      { id: 'battery', text: '装上电瓶', done: !!b.parts.battery },
      { id: 'wheels', text: '装上两个车轮', done: !!b.parts.hub_FL && !!b.parts.hub_RR },
      { id: 'engine', text: '装上发动机', done: !!b.parts.engine },
      { id: 'fuel', text: '用油桶加油', done: fuel > 0.04 },
      // (what was opened is shut again before the road: an open bonnet fills the windscreen)
      ...(hood || this.done.has('hood') ? [{ id: 'shut', text: '关上引擎盖', done: this.done.has('shut') }] : []),
      // (a workshop with doors to open: the button beside them)
      ...(this.garage?.doorsOpen || this.done.has('door') ? [{ id: 'door', text: '按门边的按钮，打开大门', done: this.done.has('door') || !!this.garage?.doorsOpen?.() }] : []),
      { id: 'seat', text: '坐进驾驶座', done: this.seated === v || this.done.has('seat') },
      { id: 'start', text: '打火', done: v.sys.running || this.done.has('start') },
      { id: 'drive', text: '松手刹，开出车库', done: this.place === 'road' },
    ];
    // (a step once done stays done — a part taken off again, back in the workshop: the list does not go back, docs/V3/plan/prompts.md 定案 4)
    for (const s of steps) {
      if (s.done) this.done.add(`step:${s.id}`);
      else if (this.done.has(`step:${s.id}`)) s.done = true;
    }
    return steps;
  }

  /** how many of the start's junk have gone into the recycler (J5's board) */
  private junkIn(): number {
    let n = 0;
    while (this.done.has(`junk:${n + 1}`)) n++;
    return n;
  }

  /**
   * J5's board (core/modcar/startKit.ts): the workshop's four steps first (the power, the junk into the recycler,
   * the scraper made, the windscreen scraped), then the car's — to start, to drive — and the way out (the doors,
   * the seat, the key, the road); last, not in the way of the road, what makes it a car. Each car step done when
   * its mounts are filled (the wheels four of four), the water when the radiator holds 60 % of what it takes, the
   * fuel when the tank shows any; a step once done stays done (docs/V3/plan/prompts.md 定案 4).
   */
  private kitSteps(v: ModVehicle): BoardStep[] {
    const b = v.build;
    const ws = this.workshop && this.params.project === 'tutorial' ? this.workshop : null;
    const made = this.done.has('scraper');
    const steps: BoardStep[] = [];
    if (ws) {
      // (the old jacket and shoes on the bench: one wakes in the nightdress — Arctic Drive's 穿好衣服 first)
      const worn = (this.player.worn.jacket ? 1 : 0) + (this.player.worn.shoes ? 1 : 0);
      steps.push({ id: 'clothes', group: 'prep', text: `穿上外套和鞋（${worn}/2）`, short: '穿衣服', n: worn, of: 2, done: worn >= 2 });
      const n = Math.min(START_JUNK.length, this.junkIn());
      steps.push({ id: 'power', group: 'prep', text: '拉发电机，车库来电', short: '来电', done: this.done.has('power') || ws.power });
      steps.push({ id: 'scrap', group: 'prep', text: `两个零件箱和坏电视丢进回收台（${n}/${START_JUNK.length}）`, short: '回收', n, of: START_JUNK.length, done: made || n >= START_JUNK.length });
      steps.push({ id: 'scraper', group: 'prep', text: '在工作台做一把清理铲', short: '清理铲', done: made });
      steps.push({ id: 'windscreen', group: 'prep', text: '刮干净挡风玻璃', short: '挡风玻璃', done: this.done.has('windscreen') || this.windscreenClean() });
    }
    for (const k of kitStepsOf(this.rough)) {
      if (k.mounts) {
        const n = mountsFilled(b, k.mounts);
        const of = k.mounts.length;
        steps.push({ id: k.id, group: k.group, text: `装上${k.name.zh}${of > 1 ? `（${n}/${of}）` : ''}`, short: k.name.zh, n, of, done: n >= of });
      } else if (k.id === 'water') {
        const r = b.parts.radiator;
        const cap = r ? (partDef(r.part).radiator?.coolantL ?? 1) : 1;
        steps.push({ id: k.id, group: k.group, text: '水箱加水', short: '加水', done: !!r && (r.fluids.coolantL ?? 0) >= WATER_FULL * cap });
      } else steps.push({ id: k.id, group: k.group, text: '用油桶加油', short: '加油', done: (v.sys.dash.tankL > 0 ? v.sys.dash.fuelL / v.sys.dash.tankL : 0) > 0.04 });
    }
    steps.push({ id: 'door', group: 'go', text: '按门边的按钮，打开大门', short: '开大门', done: this.done.has('door') || !!this.garage?.doorsOpen?.() });
    steps.push({ id: 'seat', group: 'go', text: '坐进驾驶座', short: '上车', done: this.seated === v || this.done.has('seat') });
    steps.push({ id: 'start', group: 'go', text: '打火', short: '打火', done: v.sys.running || this.done.has('start') });
    steps.push({ id: 'drive', group: 'go', text: '松手刹，开出车库', short: '开出去', done: this.place === 'road' });
    // (the car's: last — on the board, not in the way of the road)
    const car = steps.filter((x) => x.group === 'car');
    const rest = steps.filter((x) => x.group !== 'car');
    const out = [...rest, ...car];
    for (const st of out) {
      if (st.done) this.done.add(`step:${st.id}`);
      else if (this.done.has(`step:${st.id}`)) st.done = true;
    }
    return out;
  }

  /** J5: the car can start and drive (the board's first two groups done, or once were): the doors open */
  private kitReady(): boolean {
    if (this.kit !== 'j5' || this.done.has('ready')) return true;
    const steps = this.tutorialSteps();
    const ok = steps.length > 0 && steps.every((st) => st.done || (st.group !== 'start' && st.group !== 'drive'));
    if (ok) this.done.add('ready');
    return ok;
  }

  /** why a thing must not go into the recycler: a part the project car still has an empty place for (J5's start) */
  neededPart(h: NonNullable<Held>): Text | null {
    if (this.kit !== 'j5' || h.kind !== 'part' || this.place !== 'garage') return null;
    const v = this.vehicles[0];
    if (!v) return null;
    const cat = partDef(h.inst.part).cat;
    const empty = v.view.frame.mounts.some((m) => m.cat === cat && !v.build.parts[m.id]);
    return empty ? { zh: '车上要用', en: 'The car needs it' } : null;
  }

  /** the board's heading in the corner: J5's group of the step now and how far it is (能发动 2/7); the classic one's name */
  private boardTitle(steps: BoardStep[], now: number): string {
    const st = steps[now];
    if (this.kit !== 'j5' || !st?.group || st.group === 'prep') return '让「方糖」跑起来';
    const g = KIT_GROUPS.find((x) => x.id === st.group);
    const of = steps.filter((x) => x.group === st.group);
    return `${g?.name.zh ?? ''} ${of.filter((x) => x.done).length}/${of.length}`;
  }

  private checkTutorial(): void {
    const v = this.vehicles[0];
    if (!v) return;
    if (this.garage?.doorsOpen?.()) this.done.add('door');
    if (this.workshop?.power) this.done.add('power');
    if (v.view.panelOpen('hood') > 0.6 || (v.view.hasPanel('hood') && !v.build.parts.hood)) this.done.add('hood');
    // shut once what goes under it is in (or there is no bonnet left to shut)
    const under = !!v.build.parts.battery && !!v.build.parts.engine;
    if (this.done.has('hood') && under && (v.view.panelOpen('hood') < 0.05 || !v.build.parts.hood)) this.done.add('shut');
    if (this.seated === v) this.done.add('seat');
    // sat behind an open bonnet: say why the road cannot be seen (once)
    if (this.seated === v && v.view.panelOpen('hood') > 0.5 && !this.done.has('hoodWarned')) {
      this.done.add('hoodWarned');
      this.ui.say('引擎盖还开着', 3);
    }
    if (v.sys.running) this.done.add('start');
  }

  // ------------------------------------------------------------------ the frame

  modEnv(v: ModVehicle): ModEnv {
    const e = this.env;
    const sky = e.sky as unknown as { daylight?: number };
    let surface: number | undefined;
    for (const w of v.sim.wheels) if (w.contact) surface = w.surface;
    return { ambientC: e.state.temp, dark: e.dark, rain: e.state.rain, wet: e.state.wetness, sun: sky.daylight ?? 1, surface, hour: e.clock.hourAt(this.time) };
  }

  private handbrakeKey(dt: number, down: boolean, v: ModVehicle): number {
    const sim = v.sim;
    if (down && !this.hbWasDown) {
      this.hbHeld = 0;
      this.hbIgnore = sim.parkBrake > 0;
      if (this.hbIgnore) sim.setParkBrake(false);
    }
    if (down) this.hbHeld += dt;
    if (!down && this.hbWasDown && !this.hbIgnore && this.hbHeld >= 0.5 && sim.kmh < 1) sim.setParkBrake(true);
    this.hbWasDown = down;
    return down && !this.hbIgnore ? 1 : 0;
  }

  /** the render alpha of this frame (GameContext.renderAlpha) */
  renderAlpha = 1;

  /** what the systems do where a shovel went into bare ground (GameContext.dug) */
  readonly dug: ((x: number, y: number, z: number) => void)[] = [];
  /** the systems' rules against starting an engine (GameContext.startBlockers) */
  readonly startBlockers: ((v: ModVehicle) => { zh: string; en: string } | null)[] = [];
  /** what feeds the electric things riding in the vehicles (GameContext.powerAt: the power module's) */
  readonly powerAt: ((l: Loose) => 'on' | 'flat' | null | undefined)[] = [];

  /** why this vehicle's engine may not start now (a system's rule), or null */
  startWhy(v: ModVehicle): { zh: string; en: string } | null {
    for (const f of this.startBlockers) {
      const w = f(v);
      if (w) return w;
    }
    return null;
  }

  /** the key turned on a vehicle a rule keeps from starting: its why flashed, true (CockpitHost.blockedStart) */
  blockedStart(v: ModVehicle): boolean {
    const w = this.startWhy(v);
    if (w) this.player.flashWhy(w.zh);
    return !!w;
  }

  /** a vehicle of the world's made one's own (GameContext.claimVehicle: a trailer hitched) */
  claimVehicle(v: ModVehicle): void {
    this.wrecks?.claim(v);
  }

  step(dt: number, alpha?: number): void {
    this.renderAlpha = alpha ?? 1;
    // (one world with the workshop in it: in its yard or out on the road is only where one is)
    if (this.seamless) {
      const sv = this.seated;
      const was = this.place;
      this.place = onPlot(sv ? sv.sim.px : this.player.walker.x, sv ? sv.sim.pz : this.player.walker.z) ? 'garage' : 'road';
      if (sv && was === 'garage' && this.place === 'road' && !this.saidOnRoad) {
        this.saidOnRoad = true;
        // (out on the road: nothing said — docs/V3/plan/prompts.md §五)
      }
    }
    this.input.update(dt);
    this.pad.update(this.padHost());
    this.padFeel(dt);
    this.applyAssists();
    this.time += dt;
    this.playS += dt;
    {
      // the compendium's record: what is driven and how far, what is in the hands
      const dv = this.seated;
      const h = this.player.held;
      this.journal.step(dt, dv ? dv.view.frame.id : null, dv ? Math.abs(dv.sim.speed) : 0, h?.kind === 'item' ? h.item : null, ((this.clock as unknown as { day?: number }).day ?? 0) + 1);
    }
    // and every half minute
    if (this.params.keep && (this.saveT += dt) > 30) {
      this.saveT = 0;
      this.save();
    }
    // … and as a place by the road is left behind (docs/V3/plan/finish.md §十四: 离开一个地点时)
    if (this.params.keep && this.world && this.place === 'road' && (this.siteT += dt) > 1) {
      this.siteT = 0;
      const s = this.roadS;
      if (this.atSite === null) {
        this.siteList.length = 0;
        for (const site of this.world.sites.between(s - 45, s + 45, this.siteList)) {
          this.atSite = site.s;
          break;
        }
      } else if (Math.abs(s - this.atSite) > 120) {
        this.atSite = null;
        this.saveT = 0;
        this.save();
      }
    }
    // the V3 systems, before the body, the player and the vehicles are stepped
    this.systems.preStep(dt, this);
    const shift = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight') || this.pad.run;
    this.stepBody(dt, shift);
    {
      const e = this.player.walker.eye(this.eyeP);
      this.wsEye.set(e.x, e.y, e.z);
      this.genAsked.clear();
      for (const [, r] of this.roadShops) this.core.place(r.root, 0, 0, 0);
      for (const w of this.allWorkshops()) w.update(dt, this.wsEye);
      if (this.workshop && this.garage) this.garage.power = this.workshop.power;
      // (the generators: the nearest one running is heard, else the last one's run-down)
      let best: Parameters<ModGame['genSound']>[0] = null;
      let bd = Infinity;
      const cam = this.core.camera.position;
      for (const st of this.genAsked.values()) {
        if (!st) continue;
        const d = st.at.distanceTo(cam);
        if (d < bd) {
          bd = d;
          best = st;
        }
      }
      if (this.genAsked.size) this.genSound(best);
    }
    this.stepGrime(dt);
    // the wrecks by the road: the ones within reach there, the ones far behind gone (kept as they were left)
    if (this.world) {
      this.wrecks ??= new Wrecks(this.wreckHost(), this.restore?.wrecks);
      const sv = this.seated;
      this.wrecks.update(dt, sv ? sv.sim.px : this.player.walker.x, sv ? sv.sim.pz : this.player.walker.z);
      // the places by the road: their containers, pumps and things lying about, while one is by them
      this.places ??= new Places(this.placesHost(), this.restore?.places);
      this.places.update(dt, sv ? sv.sim.px : this.player.walker.x, sv ? sv.sim.pz : this.player.walker.z);
      // (a pump filling a vehicle: its flap open, the nozzle out of its hook and in the filler)
      const noz = this.places.nozzle();
      let to: Parameters<SiteArt['pumpNozzle']>[0] = null;
      if (noz) {
        noz.v.view.capOpen = true;
        if (noz.v.view.fillerMouth('fuel', this.nozMouth, this.nozOut)) to = { site: noz.site, obj: noz.obj, mouth: this.nozMouth, out: this.nozOut };
      }
      this.siteArt?.pumpNozzle(to);
      this.siteArt?.update(dt, this.world, sv ? sv.sim.px : this.player.walker.x, sv ? sv.sim.pz : this.player.walker.z);
      this.doors?.update(dt);
    }
    // on foot: walk, look, use
    if (!this.seated) {
      const i = this.input;
      const down = this.deadT >= 0;
      const listing = !!this.listV || down || !!this.benchWs?.open || this.tabAt >= 0;
      // the thing in the hands has the view (a rod with a fish on, kernel/heldUse.ts look()): it eases there, and the
      // mouse and the pad's right stick pull the thing over instead of turning it
      const hl = listing ? null : this.player.heldLook();
      this.heldLookNow = hl;
      if (hl) {
        const k = Math.min(1, dt * hl.k);
        const dy = Math.atan2(Math.sin(hl.yaw - i.lookYaw), Math.cos(hl.yaw - i.lookYaw));
        i.lookYaw += dy * k;
        i.lookPitch += (hl.pitch - i.lookPitch) * k;
        if (this.pad.rx !== 0) this.player.heldPointer(this.pad.rx * dt * 700);
      }
      // (the view on foot is from her eyes, and everything is aimed from there: Walker.view, HerInGame.FOOT_VIEW —
      // and, crouched, from where her eyes are as she squats: CROUCH_VIEW, eased over as she goes down and comes up)
      this.crouchView += ((this.player.walker.crouched ? 1 : 0) - this.crouchView) * (1 - Math.exp(-dt / 0.07));
      if (this.crouchView < 0.002) this.crouchView = 0;
      if (!this.her.ready) Object.assign(this.player.walker.view, HerInGame.NO_VIEW);
      else {
        const a = HerInGame.FOOT_VIEW;
        const b = HerInGame.CROUCH_VIEW;
        const k = this.crouchView;
        const v = this.player.walker.view;
        v.ahead = a.ahead + (b.ahead - a.ahead) * k;
        v.aheadDown = a.aheadDown + (b.aheadDown - a.aheadDown) * k;
        v.below = a.below + (b.below - a.below) * k;
        v.belowDown = a.belowDown + (b.belowDown - a.belowDown) * k;
        v.turn = a.turn + (b.turn - a.turn) * k;
        // (inside a living space the view stands no further out than its walk goes on ahead: its walls and its
        // furniture are where the walk ends, and a hand's breadth out from her eyes the view was in them — Nomad
        // Drive's view is drawn back so when it would be in something)
        const ab = this.player.aboard;
        const want = v.ahead;
        if (ab) {
          const fw = this.player.walker;
          const u = Math.max(-0.9, Math.min(1.1, -fw.pitch));
          const extra = v.aheadDown * u + v.turn * (1 - Math.cos(u));
          v.ahead = Math.max(0, Math.min(v.ahead, ab.roomAhead(0.5) + 0.05 - extra));
        }
        this.aheadCut = want - v.ahead;
      }
      // (crouched to a stove by the kitchen — workCrouch — or stood up from it again, the view goes on looking at what
      // it looked at while the eye sinks or rises: the same pitch from half a metre lower looks 15 cm short of the stove,
      // the mark comes off the pan and a button held on it lets go. For as long as the eye moves; what the mouse adds
      // meanwhile is kept on top.)
      if (this.workCrouch !== this.keepWas) {
        this.keepWas = this.workCrouch;
        const t = this.player.target;
        this.keepT = 0;
        if (t?.kind === 'device') {
          const w = this.player.walker;
          const e = w.eye(this.keepEye);
          const d = w.look(this.keepDir);
          const along = Math.max(0.3, (t.device.x - e.x) * d.x + (t.device.y - e.y) * d.y + (t.device.z - e.z) * d.z);
          this.keepAt.x = e.x + d.x * along;
          this.keepAt.y = e.y + d.y * along;
          this.keepAt.z = e.z + d.z * along;
          this.keepT = 0.7;
          this.keepSet = i.lookPitch;
          this.keepUser = 0;
        }
      }
      if (this.keepT > 0) {
        this.keepT -= dt;
        this.keepUser += i.lookPitch - this.keepSet;
        const want = this.player.walker.lookAt(this.keepAt.x, this.keepAt.y, this.keepAt.z, this.keepLook).pitch;
        i.lookPitch = Math.max(-1.45, Math.min(1.45, want + this.keepUser));
        this.keepSet = i.lookPitch;
      }
      this.player.update(dt, i.lookYaw, i.lookPitch, {
        forward: listing ? 0 : i.walk.forward,
        right: listing ? 0 : i.walk.right,
        // (sprinting while there is stamina)
        run: shift && canSprint(this.body),
        jump: !listing && (i.isDown('Space') || this.pad.jump),
        crouch: this.crouch || this.workCrouch,
        drop: !listing && (this.dropButton || this.pad.drop),
        // (the right button, as it is now: what the player made of it last frame is not fed back)
        take: !listing && (this.rightButton || this.pad.take),
        // (the right button's release is seen through the window's mouseup below)
      } as never);
      // (Q is a press now: placing is R's — docs/V3/plan/hands.md §四; the thing in the hands may have the view: a rod with a fish on)
      this.input.lookHold = this.player.transferring || listing || !!this.player.scrub || !!hl;
      // (a pad's right stick moves the scrubbing tool as the mouse does)
      if (this.player.scrub && (this.pad.rx !== 0 || this.pad.ry !== 0)) this.player.scrubMove(this.pad.rx * dt * 700, this.pad.ry * dt * 700);
      this.showCargoList();
      // (a list open: its rows say what things are; the cards of what one holds and looks at would stand over them)
      if (this.listV) this.ui.items.showCards(null, null, false);
    } else {
      // seated: the workbench words go away (the cab's controls have the mark now); the hotbar stays
      this.input.lookHold = false;
      this.heldLookNow = null;
      const items = this.ui.items;
      items.showCards(null, null, false);
      items.showTransfer(null);
      items.showKeys(this.driveKeys(this.seated));
      items.showHotbar(this.player.slotViews(), this.player.sel);
      this.standUp(dt);
      this.stepAutoLights(dt);
    }
    this.stepStranded(dt);
    this.stepKits(dt);
    // vehicles
    for (const v of this.vehicles) {
      let input = null;
      if (v === this.seated && (this.seatAt === 'driver' || this.scripted)) {
        const d = this.input.drive;
        // (the proving ground's robot at the wheel, until the player takes it back with the pedals or the wheel)
        const pr = this.provingRun;
        if (pr?.pilot && !this.scripted && (Math.abs(d.steer) > 0.35 || d.throttle > 0.35 || d.brake > 0.35)) {
          pr.stopAll();
          this.ui.say('你接过了方向盘', 1.6);
        }
        const robot = this.deadT >= 0 || this.scripted ? null : (pr?.input(dt, v) ?? null);
        // (sleepy at the wheel: the hands come round a moment late — docs/V3/plan/growth.md §四)
        const k = sleepyNow(this.body) ? 1 - Math.exp(-dt * 3.5) : 1;
        this.steerHeld += (d.steer - this.steerHeld) * k;
        input = this.deadT >= 0 ? { steer: 0, throttle: 0, brake: 1, handbrake: 1 } : this.scripted ?? robot ?? { steer: this.steerHeld, throttle: d.throttle, brake: d.brake, handbrake: this.handbrakeKey(dt, d.handbrake > 0.5, v) };
      }
      v.step(dt, this.ground, this.modEnv(v), input);
      // a knock against something hard, heard from the seat
      if (v.sim.hits !== v.knocksHeard) {
        v.knocksHeard = v.sim.hits;
        if (v === this.seated && v.sim.lastHitSpeed > 2.5) this.sound('crash', Math.min(1, 0.3 + v.sim.lastHitSpeed / 14));
      }
      // a tyre blew out (tyres.ts): the bang, from the seat through the body, or from the roadside the further off the quieter
      if (v.sys.bursts !== v.burstsHeard) {
        v.burstsHeard = v.sys.bursts;
        const gain = v === this.seated ? 1 : Math.max(0, 1 - this.listenerDist(v) / 150);
        if (gain > 0.02) this.sounds()?.play('tyre_burst', { gain });
      }
    }
    this.stepCones(dt);
    this.provingRun?.update(dt);
    this.loose.update(dt);
    // the V3 systems, after the vehicles and the loose things have moved and before any view
    this.systems.step(dt, this);
    this.throwSparks(dt);
    this.kickDust(dt);
    this.checkTutorial();
    if (this.garage) this.garage.update(dt, this.garageContext());
    this.leaveGarage(dt);
    this.updateViews(dt, alpha);
    this.loose.follow();
    this.stepGlints(dt);
  }

  private garageContext(): GarageContext {
    if (!this.garageCtx) {
      const game = this;
      this.garageCtx = {
        get vehicles() {
          return game.vehicles;
        },
        loose: this.loose,
        player: this.player,
        ui: this.ui,
        get seated() {
          return game.seated;
        },
        get hour() {
          return game.env.sky.hour;
        },
        checklist: () => this.tutorialSteps(),
        changed: (v: ModVehicle, what: string) => this.changed(v, what),
        sound: (name: string, gain?: number) => this.sound(name, gain),
      };
    }
    return this.garageCtx;
  }

  /**
   * The dust the wheels throw up (wheelDust.ts): every vehicle near enough to be seen, on what it rolls on,
   * none off ground the weather has wet; then the puffs drifting on the wind.
   */
  private kickDust(dt: number): void {
    const c = this.core.camera.position;
    const o = this.core.origin;
    const wet = this.env.state.wetness;
    for (const v of this.vehicles) {
      if (Math.hypot(v.sim.px - c.x - o.x, v.sim.pz - c.z - o.z) > 180) continue;
      // (a motorcycle's two tracks are four contacts a hand apart: half each)
      this.dust.kick(dt, v, v.sim.wheels, wet, v.view.frame.balance ? 0.5 : 1);
      // a hot brake smokes from its hub, the more the more it has faded (brakeHeat.ts)
      for (let i = 0; i < 4; i++) {
        const fade = 1 - v.sys.dash.brakes[i].bite;
        if (fade < 0.02) continue;
        const key = v.sim.wheels[i];
        const due = (this.smokeDue.get(key) ?? 0) + dt * 14 * Math.min(1, fade * 4);
        const n = Math.floor(due);
        this.smokeDue.set(key, due - n);
        if (!n) continue;
        const b = this.sparkB;
        v.sim.basis(b);
        v.sim.wheelLocal(i, this.sparkL);
        const L = this.sparkL;
        this.dust.smoke(v.sim.px + b[0] * L.x + b[3] * L.y + b[6] * L.z, v.sim.py + b[1] * L.x + b[4] * L.y + b[7] * L.z, v.sim.pz + b[2] * L.x + b[5] * L.y + b[8] * L.z, v.sim.vx, v.sim.vz, n);
      }
    }
    const w = this.env.state;
    this.dustWind.x = Math.cos(w.windDir) * w.wind;
    this.dustWind.z = Math.sin(w.windDir) * w.wind;
    this.dust.update(dt, this.dustWind);
  }

  private readonly dustWind = { x: 0, z: 0 };
  /** the filler a pump's nozzle goes into (render space) */
  private readonly nozMouth = new THREE.Vector3();
  private readonly nozOut = new THREE.Vector3();
  /** each hot brake's share of a smoke puff not given off yet */
  private readonly smokeDue = new WeakMap<object, number>();

  /** the engine as the seat feels it (seatShake.ts): running or not, its revs, its cylinders, how worn */
  private engineFelt(v: ModVehicle): ShakeEngine {
    const d = v.sys.dash;
    const eng = v.view.frame.mounts.find((m) => m.cat === 'engine' && v.build.parts[m.id]);
    const cond = eng ? v.build.parts[eng.id].cond : 1;
    const f = this.felt;
    f.running = d.running;
    f.rpm = d.rpm;
    f.idle = v.sim.spec.engine.idle;
    f.cylinders = v.sys.derived.engine?.engine?.cylinders ?? 4;
    f.misfire = Math.max(0, Math.min(1, (0.55 - cond) / 0.45));
    return f;
  }

  /** the seat's shake was worked out with the eye this frame (in the cockpit); else the pad's motors work it out themselves */
  private shookFrame = false;

  /**
   * The pad's motors (pad.ts rumble), by what the seat feels, in any view: the knocks on the strong one; on the
   * weak one the road's buzz and the engine's, the limiter cutting in, wheels locked under the brake
   */
  private padFeel(dt: number): void {
    const v = this.seated;
    const k = this.tune.get('pad.rumble');
    if (!v || !this.pad.name || k <= 0) {
      this.pad.rumble(0, 0, this.time);
      this.shookFrame = false;
      return;
    }
    const sh = this.shake;
    const sim = v.sim;
    if (!this.shookFrame) sh.update(dt, sim, this.engineFelt(v));
    this.shookFrame = false;
    const r = sh.raw;
    const strong = Math.min(1, r.jolt / 0.012);
    let weak = Math.min(0.6, r.road / 0.006) + Math.min(0.3, r.engine / 0.004);
    // the limiter: held against it the engine buzzes in the hands (its cut, a dozen times a second)
    const d = v.sys.dash;
    if (d.running && sim.throttle > 0.5 && d.rpm > sim.spec.engine.redline * 0.985) weak += Math.sin(this.time * 2 * Math.PI * 12) > 0 ? 0.45 : 0.1;
    // wheels locked under the brake at speed: a judder
    if (sim.speed > 3 && sim.brake > 0.3) {
      const rad = sim.spec.wheelRadius;
      if (sim.wheels.some((w) => w.contact && Math.abs(w.omega * rad) < 0.2 * sim.speed)) weak += 0.35;
    }
    this.pad.rumble(strong * k, Math.min(1, weak) * k, this.time);
  }

  /** how stiff a vehicle's springs are against its frame's own (a sport strut passes more of the road on; none, it rides on its stops) */
  private stiffnessOf(v: ModVehicle): number {
    let sum = 0;
    let n = 0;
    for (const m of v.view.frame.mounts) {
      if (m.cat !== 'suspension') continue;
      const p = v.build.parts[m.id];
      sum += p ? (partDef(p.part).suspension?.spring ?? 1) : 3;
      n++;
    }
    return n ? sum / n : 1;
  }

  /** how much of the shake the driver's seat passes on (seatShake.ts: an armchair less, a crate more; none fitted, the bare frame) */
  private cushionOf(v: ModVehicle): number {
    const m = v.view.frame.mounts.find((x) => x.cat === 'seat' && x.driver);
    const inst = m ? v.build.parts[m.id] : undefined;
    return seatCushion(inst ? (partDef(inst.part).seat?.comfort ?? 0.6) : 0);
  }

  /** how open a vehicle's cabin is (0 shut … 1 open): a frame without doors, the doors missing, the ones standing open */
  private cabinOpen(v: ModVehicle): number {
    let open = 1 - v.sys.derived.enclosed;
    for (const m of v.view.frame.mounts) if (m.cat === 'door' && v.build.parts[m.id]) open += v.view.panelOpen(m.id) * 0.25;
    return Math.min(1, Math.max(0, open));
  }

  private readonly sparkB = new Float64Array(9);
  private readonly sparkL = { x: 0, y: 0, z: 0 };
  /**
   * Sparks where a vehicle drags metal on the road (the physics' feel.scrape): from each empty hub's drum,
   * or else from the lowest corner of the body, thrown back the way the road goes past.
   */
  private throwSparks(dt: number): void {
    for (const v of this.vehicles) {
      const sim = v.sim;
      const scrape = sim.feel.scrape ?? 0;
      if (scrape < 1) continue;
      // in bursts, a dozen or so at a time, more often the faster it drags
      const due = (this.sparkDue.get(v) ?? 0) + dt * (4 + 10 * Math.min(1, scrape / 8));
      const bursts = Math.floor(due);
      this.sparkDue.set(v, due - bursts);
      if (!bursts) continue;
      const n = bursts * (8 + Math.floor(Math.random() * 12));
      const b = this.sparkB;
      sim.basis(b);
      const sp = Math.hypot(sim.vx, sim.vz) || 1;
      const back = { x: -sim.vx / sp, z: -sim.vz / sp };
      const at = (lx: number, ly: number, lz: number): [number, number, number] => [sim.px + b[0] * lx + b[3] * ly + b[6] * lz, sim.py + b[1] * lx + b[4] * ly + b[7] * lz, sim.pz + b[2] * lx + b[5] * ly + b[8] * lz];
      let thrown = false;
      const hubR = sim.spec.emptyHubRadius ?? 0.45 * sim.spec.wheelRadius;
      for (let i = 0; i < 4; i++) {
        const w = sim.wheels[i];
        if (w.fit !== 2) continue;
        sim.wheelLocal(i, this.sparkL);
        const [x, y, z] = at(this.sparkL.x, this.sparkL.y - hubR, this.sparkL.z);
        if (y - this.groundAt(x, z) > 0.12) continue;
        this.sparks.emit(x, y, z, back, Math.min(9, scrape * 0.8), Math.max(1, Math.round(n / 2)));
        thrown = true;
      }
      if (!thrown) {
        // the body: whichever bottom corner is nearest the ground
        const bd = sim.spec.body;
        let best: [number, number, number] | null = null;
        let gap = Infinity;
        for (const ex of [bd.centerX + bd.halfLength, bd.centerX - bd.halfLength]) {
          for (const ez of [-bd.halfWidth * 0.8, bd.halfWidth * 0.8]) {
            const p = at(ex, bd.bottom, ez);
            const g = p[1] - this.groundAt(p[0], p[2]);
            if (g < gap) {
              gap = g;
              best = p;
            }
          }
        }
        if (best && gap < 0.15) this.sparks.emit(best[0], best[1], best[2], back, Math.min(9, scrape * 0.8), n);
      }
    }
    this.sparks.update(dt);
  }

  /** drove out past the apron: fade out, onto the road, fade in */
  private leaveGarage(dt: number): void {
    if (this.place !== 'garage' || !this.garage || this.seamless) return;
    const v = this.seated;
    if (this.fadeT < 0) {
      if (v && v.sim.px > this.garage.exitX) {
        this.fadeT = 0;
        this.ui.setFade(1);
      }
      return;
    }
    this.fadeT += dt;
    if (this.fadeT > 0.7 && v) {
      const speed = v.sim.vForward;
      // the garage, what lies in it and the other vehicles stay behind
      this.exitGarage(v);
      const st = new SpineSample();
      this.world!.spine.at(this.params.s, st);
      const x = st.x - Math.sin(st.phi) * 1.6;
      const z = st.z + Math.cos(st.phi) * 1.6;
      this.world!.sample(x, z, this.gs);
      v.sim.reset(x, this.gs.h + 0.05, z, -st.phi);
      v.sys.bind(v.sim);
      // keep it rolling at the speed it left the garage with
      const b = this.basis;
      v.sim.basis(b);
      v.sim.vx = b[0] * speed;
      v.sim.vz = b[2] * speed;
      this.chaseInit = false;
      this.rig.reset();
      this.shake.reset();
      this.ui.setFade(0);
      this.ui.say('上路了。');
    }
  }

  private updateViews(dt: number, alpha?: number): void {
    const core = this.core;
    const cam = core.camera;
    const o = core.origin;
    // the weather's wipers on the car one sits in (not under the workshop's roof: no rain on the glass there); the
    // filler cap open while fuel goes in
    const sheltered = this.place === 'garage' && (!this.seamless || this.indoors());
    this.env.wiperMode = this.seated?.view.wipers.length && !sheltered ? 'auto' : 'off';
    const t = this.player.target;
    for (const v of this.vehicles) {
      v.view.wiperAngle = v === this.seated ? this.env.wiperAngle : 0;
      // the blades sweep the rain off their arcs of the windscreen, and the dust with it (not caked crust: that is
      // the scraper's); the dust that settles after shows on them again
      const wp = v.view.wipe;
      const wiping = v === this.seated && this.env.wipePeriod > 0 && v.view.wipers.length > 0;
      const b = v.build;
      if (wiping) b.wiped = Math.min(b.dirt, (b.wiped ?? 0) + dt * WIPE_RATE);
      else if ((b.wiped ?? 0) > b.dirt) b.wiped = b.dirt;
      wp.phase = wiping ? this.env.wipePhase : 0;
      wp.period = wiping ? this.env.wipePeriod : 0;
      wp.regrow = THREE.MathUtils.lerp(2.2, 0.55, Math.min(1, this.env.glassWet));
      wp.wiped = b.wiped ?? 0;
      // (a flap left open shuts itself once the vehicle drives off)
      if (v.view.capOpen && Math.abs(v.sim.kmh) > 3) v.view.capOpen = false;
      // (a motorcycle strapped on a rack has its stand up, as ridden)
      v.view.ridden = v === this.seated || !!v.carriedBy;
      // (the key on with someone at the wheel: its instruments lit by the battery with the engine stopped)
      v.view.atWheel = v === this.seated && this.seatAt === 'driver';
      // (standing away from the player, nobody in it: every part merged, a handful of draws — carView.ts setParked;
      // within 7 m again it is taken apart before anything of it can be reached)
      if (this.vehicles.length > 0) {
        const px = this.seated ? this.seated.sim.px : this.player.walker.x;
        const pz = this.seated ? this.seated.sim.pz : this.player.walker.z;
        const far = Math.hypot(v.sim.px - px, v.sim.pz - pz);
        // (merged from 9 m, taken apart within 7: a door or a part is reached from a metre or two, and a car merged at
        // 9 m costs its dozen draws, not its sixty)
        v.view.setParked(v !== this.seated && Math.abs(v.sim.kmh) < 0.5 && (v.view.isParked ? far > 7 : far > 9));
        // (and further off its reduced models: a third of its triangles from some twenty metres, a tenth from forty-five
        // with the cab's inside left out)
        const lv = v.view.detail;
        v.view.setDetail(!v.view.isParked ? 0 : far > (lv === 2 ? 36 : 45) ? 2 : far > (lv >= 1 ? 20 : 24) ? 1 : 0);
      }
      v.view.update(dt, v.sim, v.sys.dash, core, v === this.seated ? alpha : 1);
    }
    const f = this.seated ?? this.focus;
    // the floating origin follows whoever the camera is with
    const fx = this.seated ? this.seated.sim.px : this.player.walker.x;
    const fy = this.seated ? this.seated.sim.py : this.player.walker.y;
    const fz = this.seated ? this.seated.sim.pz : this.player.walker.z;
    if (core.maybeRebase(fx, fy, fz)) {
      for (const v of this.vehicles) v.view.update(0, v.sim, v.sys.dash, core, 1);
      if (this.garage) core.place(this.garage.root, 0, 0, 0);
    }
    if (this.viewMode === 'orbit' && f) {
      const sim = f.sim;
      const b = this.basis;
      sim.basis(b);
      let fx2 = b[0];
      let fz2 = b[2];
      const fl = Math.hypot(fx2, fz2) || 1;
      fx2 /= fl;
      fz2 /= fl;
      const rx = -fz2;
      const rz = fx2;
      const ob = this.orbit;
      const ch = Math.cos(ob.pitch);
      const dx = (fx2 * Math.cos(ob.yaw) + rx * Math.sin(ob.yaw)) * ch;
      const dz = (fz2 * Math.cos(ob.yaw) + rz * Math.sin(ob.yaw)) * ch;
      const ty = sim.py - sim.spec.cgHeight + ob.target;
      cam.position.set(sim.px + dx * ob.dist - o.x, ty + Math.sin(ob.pitch) * ob.dist - o.y, sim.pz + dz * ob.dist - o.z);
      cam.up.set(0, 1, 0);
      cam.lookAt(sim.px - o.x, ty - o.y, sim.pz - o.z);
      if (cam.fov !== 40) {
        cam.fov = 40;
        cam.updateProjectionMatrix();
      }
    } else if (this.seated && this.viewMode === 'chase') {
      const sim = this.seated.sim;
      const b = this.basis;
      sim.basis(b);
      let fx2 = b[0];
      let fz2 = b[2];
      const fl = Math.hypot(fx2, fz2) || 1;
      fx2 /= fl;
      fz2 /= fl;
      const ch = this.seated.view.frame.chase;
      const pose = this.seated.view.pose;
      // (further back and a little higher over what it tows)
      const back = this.seated.chaseBack;
      const tmp = new THREE.Vector3(pose.x - fx2 * (ch.dist + back) - o.x, pose.y + ch.height + back * 0.3 - o.y, pose.z - fz2 * (ch.dist + back) - o.z);
      if (!this.chaseInit || dt === 0) {
        this.chasePos.copy(tmp);
        this.chaseInit = true;
      } else this.chasePos.lerp(tmp, 1 - Math.exp(-dt * 5));
      cam.position.copy(this.chasePos);
      cam.up.set(0, 1, 0);
      cam.lookAt(pose.x - o.x, pose.y + ch.look - o.y, pose.z - o.z);
      if (cam.fov !== 55) {
        cam.fov = 55;
        cam.updateProjectionMatrix();
      }
    } else if (this.seated) {
      const sim = this.seated.sim;
      this.rig.lookYaw = this.input.lookYaw;
      this.rig.lookPitch = this.input.lookPitch;
      // (moving over: the eye slides across the cab in about half a second)
      const want = this.seatAt === 'pass' ? 1 : 0;
      this.seatSlide += Math.sign(want - this.seatSlide) * Math.min(Math.abs(want - this.seatSlide), dt * 2.2);
      if (this.seatSlide > 1e-3) {
        const a = this.seatSlide * this.seatSlide * (3 - 2 * this.seatSlide);
        const d = sim.spec.eye;
        const p = this.eyeOf(this.seated, 'pass');
        const se = this.seatEye;
        se.x = d.x + (p.x - d.x) * a;
        // (a little lower half way: one ducks across)
        se.y = d.y + (p.y - d.y) * a - 0.12 * Math.sin(Math.PI * a);
        se.z = d.z + (p.z - d.z) * a;
        this.rig.seat = se;
      } else this.rig.seat = null;
      this.rig.update(dt, sim, this.seated.view.pose);
      cam.position.set(this.rig.x - o.x, this.rig.y - o.y, this.rig.z - o.z);
      // (the cab seen as Nomad Drive's are: the view back and up from her eyes by the frame's own cabView)
      const cv = this.seated.view.frame.cabView;
      if (cv) {
        const b = this.basis;
        sim.basis(b);
        cam.position.x += -b[0] * cv.back + b[3] * cv.up;
        cam.position.y += -b[1] * cv.back + b[4] * cv.up;
        cam.position.z += -b[2] * cv.back + b[5] * cv.up;
      }
      cam.quaternion.set(this.rig.qx, this.rig.qy, this.rig.qz, this.rig.qw).multiply(QFIX);
      // a motorcycle leans: the rider's eye goes round the line the tyres touch the road on, and the view rolls with it
      if (this.seated.view.frame.balance && sim.lean !== 0) {
        const b = this.basis;
        sim.basis(b);
        const pose = this.seated.view.pose;
        const py = sim.leanPivotY;
        const pv = this.leanP.set(pose.x + b[3] * py - o.x, pose.y + b[4] * py - o.y, pose.z + b[5] * py - o.z);
        this.qa.setFromAxisAngle(this.leanAxis.set(b[0], b[1], b[2]), sim.lean);
        cam.position.sub(pv).applyQuaternion(this.qa).add(pv);
        cam.quaternion.premultiply(this.qa);
      }
      // the seat's shake on top (seatShake.ts): the road through the tyres, the engine on its mounts, the knocks
      const sh = this.shake;
      sh.scale = this.tune.get('look.shake') * this.settings.shake;
      sh.stiffness = this.stiffnessOf(this.seated);
      sh.cushion = this.cushionOf(this.seated);
      sh.update(dt, sim, this.engineFelt(this.seated));
      this.shookFrame = true;
      if (sh.scale > 0) {
        const b = this.basis;
        sim.basis(b);
        cam.position.x += b[0] * sh.x + b[3] * sh.y + b[6] * sh.z;
        cam.position.y += b[1] * sh.x + b[4] * sh.y + b[7] * sh.z;
        cam.position.z += b[2] * sh.x + b[5] * sh.y + b[8] * sh.z;
        // (the camera's own axes: x to the right, y up, looking down −z)
        cam.rotateX(sh.pitch);
        cam.rotateZ(-sh.roll);
        cam.rotateY(sh.yaw);
      }
      // (looking at the instruments: the view drawn in — stepGauges)
      const wide = this.rig.fov + this.tune.get('look.fov') + this.settings.fov - 70;
      const seatFov = this.gauges.zoom > 1.001 ? (Math.atan(Math.tan((wide * Math.PI) / 360) / this.gauges.zoom) * 360) / Math.PI : wide;
      if (Math.abs(cam.fov - seatFov) > 0.01) {
        cam.fov = seatFov;
        cam.updateProjectionMatrix();
      }
      this.chaseInit = false;
    } else if (this.her.thirdPerson && this.her.ready) {
      // on foot, from behind her (V): over her shoulder, the way the view looks
      this.her.placeFollowCamera(cam, this.player.walker, dt);
      const footFov = this.tune.get('look.fov') + this.settings.fov;
      if (Math.abs(cam.fov - footFov) > 0.01) {
        cam.fov = footFov;
        cam.updateProjectionMatrix();
      }
    } else {
      // on foot, first person: the view's eye (the walker's, and where her eyes are from it by the look)
      const w = this.player.walker;
      const e = w.eye(this.eyeP);
      cam.position.set(e.x - o.x, e.y - o.y, e.z - o.z);
      this.qa.setFromAxisAngle(Y, -w.heading);
      // (the nod: down at once, back within a fifth of a second)
      this.thunk *= Math.exp(-dt * 13);
      this.qb.setFromAxisAngle(Z, w.pitch - 0.02 * this.thunk);
      cam.quaternion.copy(this.qa).multiply(this.qb).multiply(QFIX);
      // (sprinting widens the view by 4°; drunk, it sways)
      // (the thing in the hands may narrow it: a rod with a fish on, the fight drawn closer — eased in and out)
      const hf = this.heldLookNow?.fov;
      // (from one narrowing to another it eases too: a leap drawn in closer within the fight's own)
      if (hf) this.heldFov = this.heldZoomB < 0.01 ? hf : this.heldFov + (hf - this.heldFov) * (1 - Math.exp(-dt * 7));
      this.heldZoomB += ((hf ? 1 : 0) - this.heldZoomB) * (1 - Math.exp(-dt * 3.5));
      if (this.heldZoomB < 0.002) this.heldZoomB = 0;
      const baseFov = this.tune.get('look.fov') + this.settings.fov + 4 * this.sprintB;
      let footFov = this.heldZoomB > 0 ? baseFov + (this.heldFov - baseFov) * this.heldZoomB : baseFov;
      // (a system's zoom: a camera raised to the eye, GameContext.lookZoom)
      // (… and drawn in on what one stands working at: GameContext.workZoom)
      const zoom = this.lookZoom * this.workZoom;
      if (zoom > 1.0001) footFov = (2 * Math.atan(Math.tan((footFov * Math.PI) / 360) / zoom) * 180) / Math.PI;
      if (hasEffect(this.body, 'drunk')) {
        const t = this.time;
        this.qb.setFromAxisAngle(Z, w.pitch - 0.02 * this.thunk + 0.025 * Math.sin(t * 1.3));
        this.qa.setFromAxisAngle(Y, -w.heading + 0.035 * Math.sin(t * 0.9));
        cam.quaternion.copy(this.qa).multiply(this.qb).multiply(QFIX);
        cam.rotateZ(0.04 * Math.sin(t * 0.7));
      }
      if (Math.abs(cam.fov - footFov) > 0.01) {
        cam.fov = footFov;
        cam.updateProjectionMatrix();
      }
    }
    // at the bench: the view goes over to it (a quarter of a second), a blow shakes it a little
    const ws = this.benchWs;
    this.benchB += ((ws?.open ? 1 : 0) - this.benchB) * Math.min(1, dt * 12);
    if (this.benchB < 0.002) this.benchB = 0;
    if (ws && this.benchB > 0 && !this.seated) {
      ws.benchView(this.benchEye, this.benchAt);
      const k = this.benchB * this.benchB * (3 - 2 * this.benchB);
      this.benchM.lookAt(this.benchEye, this.benchAt, Y);
      this.benchQ.setFromRotationMatrix(this.benchM);
      cam.position.lerp(this.benchEye, k);
      cam.quaternion.slerp(this.benchQ, k);
      cam.position.y -= 0.008 * ws.blowShake;
    }
    // behind the title the view moves a little by itself (docs/V3/plan/finish.md §十四): a slow turn to and fro and a
    // slower nod, by the clock on the wall — the game's own stands still there
    if (this.menu.isOpen && !this.played && !this.params.shot) {
      const tw = performance.now() / 1000;
      cam.rotateY(0.07 * Math.sin(tw * 0.11));
      cam.rotateX(0.015 * Math.sin(tw * 0.07 + 1.3));
    }
    // the thing in the hands, on foot in first person (a can held to an open filler goes to it)
    this.heldThing.set(this.player.held);
    this.heldThing.setUse(this.player.use);
    const pt = this.player.target;
    let dock: Dock | null = null;
    if (!this.seated && pt?.kind === 'filler' && pt.open && pt.v.view.fillerMouth(pt.liquid, this.dockMouth, this.dockOut)) dock = { mouth: this.dockMouth, out: this.dockOut, eye: cam.position, pour: this.player.flow ? 1 : 0 };
    else if (!this.seated && pt?.kind === 'tank' && pt.port.open && this.player.held?.kind === 'tool' && this.player.held.tool.kind === 'jerrycan' && pt.port.mouth(this.dockMouth, this.dockOut)) dock = { mouth: this.dockMouth, out: this.dockOut, eye: cam.position, pour: this.player.flow && !pt.port.pump ? 1 : 0 };
    const sc = this.player.scrub;
    this.heldThing.pin(!this.seated && sc?.hit ? this.scrubPose(sc, cam) : null);
    // (the can's pose: stepSprayRing, from the mark on the surface)
    // (at its own size: drawn back from a wall ahead, seen through in the middle of the frame it is drawn into)
    this.heldThing.room = this.seated ? Infinity : this.player.roomAhead(1.8, 0.45);
    this.heldThing.frameSize(this.core.frame.rtScene.width, this.core.frame.rtScene.height);
    // (what is in her hands is held from her eyes: the view on foot stands a hand's breadth ahead of them)
    const fw = this.player.walker;
    if (this.her.ready && !this.seated) {
      HerInGame.eyeShift(fw.heading, fw.pitch, this.heldThing.eyeShift);
      // (the view drawn back inside a living space: by as much less)
      this.heldThing.eyeShift.x -= Math.cos(fw.heading) * this.aheadCut;
      this.heldThing.eyeShift.z -= Math.sin(fw.heading) * this.aheadCut;
    } else this.heldThing.eyeShift.set(0, 0, 0);
    // (a thing a system draws in the hands itself — a rod on its line, kernel/heldUse.ts — is not drawn here as well)
    this.heldThing.update(dt, cam, !this.seated && this.viewMode !== 'orbit' && this.benchB < 0.05 && !this.her.thirdPerson && !this.player.heldDrawnElsewhere, this.player.walker.sway, 0, dock);
    this.showScrub(cam);
    this.stepSpray(dt);
    for (const w of this.allWorkshops()) w.frame();
    // the liquid itself, from the spout into the mouth once the can is tipped over
    const flow = this.player.flow;
    const atPump = pt?.kind === 'tank' && !!pt.port.pump;
    const tip = flow && dock && this.player.lastMoved > 0 && (this.heldThing.pouring > 0.7 || atPump) ? this.heldThing.spoutWorld(this.spoutV) : null;
    this.stream.update(dt, tip, this.dockMouth, this.liquidColour(this.player.held), flow?.dir === 'out' ? -1 : 1);
    this.icons?.pump();
    // in the seat: the mark on the cab's controls (the one it is on lights up)
    if (this.seated) {
      this.cockpit.update(dt, this.seated, cam, this.viewMode === 'cockpit');
      // (a small control lights up under the mark; the wheel one looks through, and a door, do not)
      const a = this.cockpit.aimed;
      this.seated.view.highlight(a && a.cat !== 'steering' && a.cat !== 'door' ? a.id : null);
    }
    this.updateBeam();
    this.updateHer(dt, cam);
    this.stepGauges(dt, cam);
    // shadows round the vehicle in focus (or the walker)
    core.shadowFocus.set(fx - o.x, fy - o.y, fz - o.z);
    // in the workshop the fine map goes where one looks (the sun's patches through the windows stay crisp)
    if (this.garage?.shadowFocus && !this.seated) {
      const w = this.player.walker;
      this.garage.shadowFocus(w.x, w.z, w.heading, core.shadowFocus);
      core.shadowFocus.x -= o.x;
      core.shadowFocus.z -= o.z;
      core.shadowFocus.y -= o.y;
    }
    if (this.worldView) {
      // after a teleport: the world round the new place built fast, behind the fade, until it is there
      if (this.devLoad > 0) {
        this.devLoad -= dt;
        this.worldView.update(fx, fz, 45);
        this.provingView?.update(dt, fx, fz, 30);
        if ((this.worldView.pending === 0 && !this.provingView?.pending) || this.devLoad <= 0) {
          this.devLoad = 0;
          this.ui.setFade(0);
        }
      } else {
        this.worldView.update(fx, fz, 3.5);
        this.provingView?.update(dt, fx, fz, 2);
      }
    }
    // the proving ground's panel: the run, the live curves (provingHud.ts); the start gantry's lights by the
    // acceleration run: amber while a vehicle stands at the line, green from the moment it moves off, then off
    if (this.provingRun) {
      this.provingPanel ??= new ProvingHud(this.ui.root);
      this.provingPanel.update(this.provingRun, this.time, !!this.dev?.open);
      if (this.provingView) {
        const r = this.provingRun.runs.current;
        const accel = r?.section === 'accel' ? r : null;
        const shown = this.provingRun.shown;
        this.provingView.startLights = accel?.phase === 'running' ? 'go' : accel?.phase === 'ready' ? 'set' : shown?.section === 'accel' && this.time - shown.at < 6 ? 'ready' : 'off';
      }
    }
    // biome and light
    const bl = this.bl;
    if (this.world) {
      this.world.spine.project(fx, fz, NaN, this.pr);
      this.world.spine.biomeAt(this.pr.s, bl);
      this.world.spine.skyAt(this.pr.s, this.blSky);
      this.landmarks?.update(this.pr.s, fx, fz);
      this.geothermal?.update(this.pr.s);
      this.spires?.update(this.pr.s);
      this.wonders?.update(this.pr.s, this.core.camera.position.x + this.core.origin.x, this.core.camera.position.y + this.core.origin.y, this.core.camera.position.z + this.core.origin.z);
      this.waterfalls?.update(this.pr.s);
      this.heroPeaks?.update(this.pr.s);
      this.glaciers?.update(this.pr.s);
      {
        const ws = this.env.state;
        this.skyFlocks?.update(dt, this.pr.s, this.env.clock.hourAt(this.time), Math.min(1, Math.max(ws.rain * 1.6, ws.snow * 1.6, ws.fog, (ws.wind - 12) / 10)));
        const here = this.world.earth?.pieces.find((q) => q.start <= this.pr.s && q.end > this.pr.s);
        this.fish?.update(dt, here?.scene?.place.macro.tSea ?? 15);
      }
      const place = this.placeNames.update(this.world.journey, this.pr.s, this.time, dt);
      if (place) this.ui.showPlace(place.name, place.tag);
    } else {
      bl.a = bl.b = 0;
      bl.t = 0;
      this.blSky.a = this.blSky.b = 0;
      this.blSky.t = 0;
    }
    this.env.camX = cam.position.x + o.x;
    this.env.camZ = cam.position.z + o.z;
    const sim = f?.sim;
    this.keepRainOut();
    this.pressGrass();
    this.devTools.beforeEnv(dt);
    this.env.update(dt, this.time, this.blSky.a, this.blSky.b, this.blSky.t, this.world, sim?.vx ?? 0, sim?.vy ?? 0, sim?.vz ?? 0);
    this.devTools.afterEnv();
    this.updateSplashes(dt);
    // indoors the eye opens up
    if (this.garage) core.exposure *= this.garage.exposureAt(cam.position.x + o.x, cam.position.y + o.y, cam.position.z + o.z);
    // the world's clock goes on to this frame's hour; then the V3 systems, the camera, the origin and the weather final
    this.kernel.tick(this.env.sky, this);
    this.systems.lateUpdate(dt, this);
    this.ui.update(dt);
    this.updateHudBits();
    this.updateAudio(dt);
  }

  private readonly splashGs = new GroundSample();
  /** where the rain lands: the ground (not under the garage's roof), and the tops of the vehicles out in it */
  private updateSplashes(dt: number): void {
    const sp = this.splashes;
    const t = this.tune;
    sp.groundRate = t.get('splash.ground');
    sp.carRate = t.get('splash.car');
    sp.size = t.get('splash.size');
    const o = this.core.origin;
    const rm = globals.uRoomMin.value;
    const rx = globals.uRoomMax.value;
    const indoors = (x: number, z: number): boolean => rm.w > 0.5 && x - o.x > rm.x && x - o.x < rx.x && z - o.z > rm.z && z - o.z < rx.z;
    const vehicles: SplashVehicle[] = [];
    for (const v of this.vehicles) {
      if (indoors(v.sim.px, v.sim.pz)) continue;
      vehicles.push({
        model: v.view.model,
        get key() {
          return encodeBuild(v.build);
        },
        x: v.sim.px,
        z: v.sim.pz,
      });
    }
    const w = this.env.state;
    sp.update(dt, w.rain, w.wetness, this.time, this.core.camera, o, (x, z, out) => {
      if (indoors(x, z)) {
        out.h = NaN;
        return;
      }
      this.ground.sample(x, z, this.splashGs);
      out.h = this.splashGs.h;
      // (water stands on a road, a track, a bare floor; it soaks into grass, settles in snow)
      const sf = this.splashGs.surface;
      out.hard = sf === Surface.Asphalt || sf === Surface.Gravel || sf === Surface.Dirt || sf === Surface.Ice;
    }, vehicles);
  }

  /**
   * The grass under the vehicles near one is pressed flat (render/meadowMaterial.ts uPressA): the nearest few, each its
   * body's rectangle on the plan a hand's width in from its sides — a blade under a living space's floor came up
   * through it into the room. A motorcycle presses none.
   */
  private pressGrass(): void {
    const A = meadowUniforms.uPressA.value;
    const B = meadowUniforms.uPressB.value;
    const H = pressUniforms.uPressH.value;
    const at = this.seated?.sim ?? null;
    const w = this.player.walker;
    const ex = at ? at.px : w.x;
    const ez = at ? at.pz : w.z;
    this.pressed.length = 0;
    for (const v of this.vehicles) {
      const d = Math.hypot(v.sim.px - ex, v.sim.pz - ez);
      if (d < 45) this.pressed.push({ v, d });
    }
    this.pressed.sort((a, b) => a.d - b.d);
    for (let i = 0; i < PRESSED; i++) {
      const p = this.pressed[i];
      if (!p) {
        A[i].set(0, 0, 0, 0);
        continue;
      }
      const body = p.v.view.frame.body;
      const m = p.v.view.model;
      m.updateMatrixWorld();
      const e = m.matrixWorld.elements;
      // (the body's middle on its length, in render space; its length along the model's x — a hand's breadth more all
      // round, so that no blade beside a sill leans up through it: the player saw grass come up through the car)
      const mid = (body.front + body.rear) / 2;
      const fl = Math.hypot(e[0], e[2]) || 1;
      A[i].set(e[12] + e[0] * mid, e[14] + e[2] * mid, (body.front - body.rear) / 2 + 0.1, body.halfWidth + 0.1);
      B[i].set(e[0] / fl, e[2] / fl);
      // (only what is rooted below its floor: a plant in a pot in the living space is not pressed)
      H[i] = e[13] + body.bottom + 0.2;
    }
  }
  private readonly pressed: { v: ModVehicle; d: number }[] = [];

  private readonly cabInv = new THREE.Matrix4();
  /**
   * The rain, snow and dust stay out of the cabin of the vehicle one sits in (or stands by): a closed body
   * keeps the weather out. A motorcycle has none.
   */
  private readonly coverM = new THREE.Matrix4();
  private readonly coverLo = new THREE.Vector3();
  private readonly coverHi = new THREE.Vector3();
  private keepRainOut(): void {
    let v = this.seated;
    this.shelterNow = this.shelterOf();
    const cover = this.coverNow;
    if (!v && cover && cover.kind === 'building') {
      const o = this.core.origin;
      // (its frame: u along its long side is local x, v across it local z; from its floor up)
      this.coverM.makeRotationY(-cover.yaw).setPosition(cover.x - o.x, cover.y - o.y, cover.z - o.z);
      this.cabInv.copy(this.coverM).invert();
      this.coverLo.set(-cover.w / 2, -0.2, -cover.d / 2);
      this.coverHi.set(cover.w / 2, cover.h + 0.5, cover.d / 2);
      this.env.precip.setCabin(this.cabInv, this.coverLo, this.coverHi);
      return;
    }
    if (!v) {
      const w = this.player.walker;
      let best = 9;
      for (const o of this.vehicles) {
        const d = Math.hypot(o.sim.px - w.x, o.sim.pz - w.z);
        if (d < best) {
          best = d;
          v = o;
        }
      }
    }
    const cab = v?.view.mats.cabin;
    if (!v || !cab) {
      this.env.precip.setCabin(null);
      return;
    }
    v.view.model.updateMatrixWorld();
    this.cabInv.copy(v.view.model.matrixWorld).invert();
    this.env.precip.setCabin(this.cabInv, cab.min, cab.max);
  }

  /**
   * The headlight beam that lights the road and everything else (one, like the old vehicles'): from
   * between the lamps that are fitted, as bright as they are, and only with the switch on and a battery.
   */
  private updateBeam(): void {
    const v = this.seated ?? this.focus;
    const o = this.core.origin;
    const u = globals;
    // the cars' reflections show the ground they stand on
    if (this.place === 'garage') carEnvUniforms.uCarGround.value.setRGB(0.3, 0.29, 0.27);
    else carEnvUniforms.uCarGround.value.setRGB(0.2, 0.21, 0.19);
    if (!v || !v.sys.dash.lightsOn) {
      u.uHeadColor.value.setRGB(0, 0, 0);
      return;
    }
    let light = 0;
    let n = 0;
    let lx = 0;
    let ly = 0;
    for (const m of v.view.frame.mounts) {
      if (m.cat !== 'headlight') continue;
      const inst = v.build.parts[m.id];
      if (!inst) continue;
      const def = partDef(inst.part);
      // (a lamp smashed in a crash gives no light; a worn one less; a dirty one dimmer, a caked one far dimmer —
      // as much as is left on it, a lamp being cleaned by its measure)
      const left = this.cleaning.get(inst.uid)?.units.find((x) => x.unit === 0)?.dirt ?? 1;
      const grime = Math.min(1, (inst.dirt * 0.6 + (inst.crust ?? 0) * 1.2) * left);
      const w = inst.cond < 0.15 ? 0 : (def.lamp?.light ?? 1) * Math.max(0.3, inst.cond) * (1 - 0.7 * grime);
      light += w;
      lx += m.pos.x * w;
      ly += m.pos.y * w;
      n += w;
    }
    // a light bar on the roof comes on with the high beam: more light, from higher up
    const roofM = v.view.frame.mounts.find((m) => m.cat === 'roof' && v.build.parts[m.id]);
    const roof = roofM ? partDef(v.build.parts[roofM.id].part).roof : undefined;
    if (roofM && roof?.lightW && v.sys.dash.lights === 'high') {
      const w = (roof.lightW / 100) * Math.max(0.3, v.build.parts[roofM.id].cond);
      light += w;
      lx += (roofM.pos.x + 0.5) * w;
      ly += (roofM.pos.y + 0.2) * w;
      n += w;
    }
    if (n <= 0) {
      u.uHeadColor.value.setRGB(0, 0, 0);
      return;
    }
    const sim = v.sim;
    const b = this.basis;
    sim.basis(b);
    // lamp positions are in the frame's model space (origin on the ground): to the body frame (centre of gravity)
    const cg = v.sys.derived.cg;
    const bx = lx / n - cg.x;
    const by = ly / n - cg.y;
    const pose = v.view.pose;
    u.uHeadPos.value.set(pose.x + b[0] * bx + b[3] * by - o.x, pose.y + b[1] * bx + b[4] * by - o.y, pose.z + b[2] * bx + b[5] * by - o.z);
    u.uHeadDir.value.set(b[0] - b[3] * 0.1, b[1] - b[4] * 0.1, b[2] - b[5] * 0.1).normalize();
    // a pair of stock lamps = the old vehicles' beam; one lamp, weak lamps or a flat battery give less
    const k = Math.min(3, light / 2) * (v.sys.dash.lights === 'high' ? 1.25 : 1) * Math.min(1, v.sys.dash.battery * 4 + (v.sys.running ? 1 : 0));
    u.uHeadColor.value.setRGB(1.0, 0.82, 0.55).multiplyScalar(2.4 * k);
  }

  private updateHudBits(): void {
    const v = this.seated;
    // (what the vehicle reads is on its own instruments in the cab — cluster.ts: the readings in the corner of the screen
    // are gone, the player's ask of 2026-11-26)
    if (v?.sys.dash.message) this.ui.say(v.sys.dash.message.text.zh, 2);
    const steps = this.place === 'garage' && this.vehicles[0] && this.assists.guide ? this.tutorialSteps() : [];
    const now = steps.findIndex((s) => !s.done);
    // (all done: the list goes, and does not come back)
    if (now >= 0) this.ui.showList(this.boardTitle(steps, now), steps.map((s, i) => ({ text: s.text, done: s.done, now: i === now })));
    else this.ui.showList(null, []);
    this.ui.showPause(!this.params.shot && !this.input.locked && !this.pad.name && !this.ui.helpShown && !this.dev?.open && !this.benchWs?.open && this.deadT < 0 && !this.menu.isOpen);
    this.updateMarker();
  }

  /** where the checklist's next step is (world coordinates) and what to call it; null = nowhere to point */
  objective(): { x: number; y: number; z: number; text: string } | null {
    if (!this.assists.guide) return null;
    const v = this.vehicles[0];
    if (this.place !== 'garage' || !v || !this.garage) return null;
    const step = this.tutorialSteps().find((st) => !st.done);
    if (!step) return null;
    const held = this.player.held;
    const holding = (id: string): boolean => (held?.kind === 'part' && held.inst.part === id) || (held?.kind === 'tool' && `tool:${held.tool.kind}` === id);
    const lying = (id: string, text: string): { x: number; y: number; z: number; text: string } | null => {
      const l = this.loose.list.find((x) => x.part?.part === id || (x.tool && `tool:${x.tool.kind}` === id && (x.tool.kind !== 'jerrycan' || x.tool.fuel === 'petrol')));
      return l ? { x: l.x, y: l.y + l.mid + l.radius + 0.25, z: l.z, text } : null;
    };
    const at = (mount: string, text: string, up = 0.35): { x: number; y: number; z: number; text: string } | null => {
      const n = v.view.mountNode(mount);
      if (!n) return null;
      n.updateWorldMatrix(true, false);
      const p = n.getWorldPosition(new THREE.Vector3());
      const o = this.core.origin;
      return { x: p.x + o.x, y: p.y + o.y + up, z: p.z + o.z, text };
    };
    const b = v.build.parts;
    const device = (id: string, text: string, up = 0.3): { x: number; y: number; z: number; text: string } | null => {
      const d = this.devices.find((x) => x.id === id);
      return d ? { x: d.x, y: d.y + up, z: d.z, text } : null;
    };
    // J5's board (startKit.ts): a step that fills places on the car points at the place for the part in the hands,
    // else at the nearest part lying about that goes onto one of them
    const kitStep = this.kit === 'j5' ? kitStepsOf(this.rough).find((x) => x.id === step.id) : undefined;
    if (kitStep?.mounts) {
      const frame = v.view.frame;
      const catOf = (id: string): string | undefined => frame.mounts.find((x) => x.id === id)?.cat;
      const missing = kitStep.mounts.filter((m) => !b[m]);
      if (held?.kind === 'part') {
        const cat = partDef(held.inst.part).cat;
        const m = missing.find((id) => catOf(id) === cat);
        if (m) return at(m, '装这里', cat === 'rim' ? 0.5 : cat === 'engine' ? 0.6 : 0.35);
      }
      const cats = new Set(missing.map(catOf));
      const w = this.player.walker;
      let best: { x: number; y: number; z: number; text: string } | null = null;
      let bd = Infinity;
      for (const l of this.loose.list) {
        if (!l.part || l.riding || !cats.has(partDef(l.part.part).cat)) continue;
        const d = Math.hypot(l.x - w.x, l.z - w.z);
        if (d < bd) {
          bd = d;
          best = { x: l.x, y: l.y + l.mid + l.radius + 0.25, z: l.z, text: partDef(l.part.part).name.zh };
        }
      }
      return best;
    }
    if (this.kit === 'j5' && step.id === 'clothes') {
      if (held?.kind === 'item' && itemDef(held.item.item).wear) return null;
      const l = this.loose.list.find((x) => x.item && itemDef(x.item.item).wear && !x.riding);
      return l ? { x: l.x, y: l.y + l.mid + l.radius + 0.25, z: l.z, text: itemDef(l.item!.item).name.zh } : null;
    }
    if (kitStep && step.id === 'water') {
      // the bottle, filled at the sink, poured into the radiator
      const bottle = held?.kind === 'tool' && held.tool.kind === 'bottle' ? held.tool : null;
      if (!bottle) {
        const l = this.loose.list.find((x) => x.tool?.kind === 'bottle');
        return l ? { x: l.x, y: l.y + l.mid + l.radius + 0.25, z: l.z, text: '水壶' } : null;
      }
      if ((bottle.litres ?? 0) < 0.5) return device('sink', '水池', 0.3);
      const mouth = new THREE.Vector3();
      if (v.view.fillerMouth('water', mouth, this.markerV)) {
        const o = this.core.origin;
        return { x: mouth.x + o.x, y: mouth.y + o.y + 0.25, z: mouth.z + o.z, text: '水箱口' };
      }
      return at('radiator', '水箱', 0.4);
    }
    switch (step.id) {
      case 'power':
        return device('gen_cord', '发电机');
      case 'scrap': {
        // something that gives scrap in the hands: to the recycler; else the nearest box of old components
        const w = this.player.walker;
        // (of the things, those made of something: whatever else there is gives the recycler's one scrap for anything, and
        // is not what the board means — one's biscuits)
        const solid = held ? (held.kind === 'item' ? (itemDef(held.item.item).salvage.scrap ?? 0) > 0 : (salvageOfHeld(held).scrap ?? 0) > 0) : false;
        if (held && solid && !this.neededPart(held)) return device('recycler', '回收台', 0.35);
        let best: { x: number; y: number; z: number; text: string } | null = null;
        let bd = Infinity;
        for (const l of this.loose.list) {
          if (!l.item || l.riding || !(itemDef(l.item.item).salvage.scrap ?? 0)) continue;
          const d = Math.hypot(l.x - w.x, l.z - w.z) - (itemDef(l.item.item).cat === 'crate' ? 3 : 0);
          if (d < bd) {
            bd = d;
            best = { x: l.x, y: l.y + l.mid + l.radius + 0.25, z: l.z, text: itemDef(l.item.item).name.zh };
          }
        }
        return best;
      }
      case 'scraper':
        return device('bench', '工作台', 0.25);
      case 'windscreen': {
        // the scraper in the hands: to the windscreen; else where the scraper lies
        if (!(held?.kind === 'tool' && held.tool.kind === 'scraper')) {
          const l = this.loose.list.find((x) => x.tool?.kind === 'scraper');
          if (l) return { x: l.x, y: l.y + l.mid + l.radius + 0.25, z: l.z, text: '拿起清理铲' };
        }
        const w = v.view.windscreenAt(new THREE.Vector3());
        if (!w) return null;
        const o = this.core.origin;
        return { x: w.x + o.x, y: w.y + o.y + 0.35, z: w.z + o.z, text: '挡风玻璃' };
      }
      case 'hood':
      case 'shut': {
        // (shut: on top towards its front edge; standing open: on its middle)
        const open = v.view.panelBox('hood');
        const p = v.view.panelOpen('hood') > 0.5 && open ? open.getCenter(this.markerV) : v.view.panelGrip('hood', this.markerV);
        const o = this.core.origin;
        const text = step.id === 'hood' ? '打开引擎盖' : '关上引擎盖';
        return p ? { x: p.x + o.x, y: p.y + o.y + 0.22, z: p.z + o.z, text } : at('hood', text, 0.25);
      }
      case 'battery':
        return holding('bat_std') ? at('battery', '电瓶装这里') : lying('bat_std', '电瓶');
      case 'wheels': {
        const hub = !b.hub_FL ? 'hub_FL' : 'hub_RR';
        return holding('rim_steel13') ? at(hub, '车轮装这里', 0.5) : lying('rim_steel13', '车轮');
      }
      case 'engine':
        return holding('eng_i4') ? at('engine', '发动机装这里', 0.6) : lying('eng_i4', '发动机');
      case 'fuel': {
        const can = held?.kind === 'tool' && held.tool.kind === 'jerrycan' && held.tool.fuel === 'petrol';
        const canSlot = this.player.slots.some((h) => h?.kind === 'tool' && h.tool.kind === 'jerrycan' && h.tool.fuel === 'petrol');
        if (can || canSlot) {
          // the filler (the flap on the body), not the tank behind the boot: its flap opened by hand first
          const c = v.view.capWorld(this.markerV);
          const o = this.core.origin;
          const text = !v.view.capOpen ? '加油口盖' : '加油口';
          void can;
          return c ? { x: c.x + o.x, y: c.y + o.y + 0.22, z: c.z + o.z, text } : at('fuelTank', '加油口', 0.5);
        }
        return lying('tool:jerrycan', '油桶（汽油）');
      }
      case 'door': {
        const d = this.devices.find((x) => x.id === 'door');
        return d ? { x: d.x, y: d.y + 0.3, z: d.z, text: '大门按钮' } : null;
      }
      case 'seat': {
        const seat = v.view.frame.mounts.find((m) => m.driver);
        return seat ? at(seat.id, '上车', 0.9) : null;
      }
      case 'start':
        return null;
      case 'drive': {
        const g = this.garage;
        return { x: g.exitX - 4, y: 1.6, z: g.carSpot.z, text: '开出去' };
      }
    }
    return null;
  }

  private readonly markerV = new THREE.Vector3();
  private readonly leanP = new THREE.Vector3();
  private readonly leanAxis = new THREE.Vector3();
  /** the objective's diamond on screen (at the edge on its side when it is off screen) */
  private updateMarker(): void {
    const t = this.objective();
    if (!t) {
      this.ui.showMarker(null);
      return;
    }
    const cam = this.core.camera;
    const o = this.core.origin;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const p = this.markerV.set(t.x - o.x, t.y - o.y, t.z - o.z);
    cam.updateMatrixWorld();
    p.applyMatrix4(cam.matrixWorldInverse);
    const behind = p.z > -0.1;
    p.applyMatrix4(cam.projectionMatrix);
    let sx = (p.x * 0.5 + 0.5) * w;
    let sy = (-p.y * 0.5 + 0.5) * h;
    const edge = behind || sx < 24 || sx > w - 24 || sy < 40 || sy > h - 24;
    if (behind) {
      // behind: at the side it is on, halfway up
      sx = p.x > 0 ? 24 : w - 24;
      sy = h * 0.5;
    }
    if (edge) {
      sx = Math.min(w - 24, Math.max(24, sx));
      sy = Math.min(h - 24, Math.max(40, sy));
    }
    // close by and in the middle of the view: the mark's own words say it all
    const near = Math.hypot(t.x - this.player.walker.x, t.z - this.player.walker.z) < 1.4 && !this.seated;
    // behind a wall (or the doors) from here: faint, without its words
    const eye = cam.getWorldPosition(this.eyeV);
    this.markerHidden = this.blockedBetween(eye.x + o.x, eye.y + o.y, eye.z + o.z, t.x, t.y, t.z, this.markerHidden);
    this.ui.showMarker(near ? null : { x: sx, y: sy, text: this.markerHidden ? '' : t.text, edge, dim: this.markerHidden });
  }

  private markerHidden = false;
  private readonly eyeV = new THREE.Vector3();
  private markerAsk = 0;
  private readonly solidsTmp: Solid[] = [];
  /**
   * Whether the workshop's walls stand between two points (world); asked a few times a second, the last
   * answer kept in between. (The cars do not hide a mark: it is on them.)
   */
  private blockedBetween(ax: number, ay: number, az: number, bx: number, by: number, bz: number, was: boolean): boolean {
    if (!this.garage || --this.markerAsk > 0) return was;
    this.markerAsk = 6;
    const out = this.solidsTmp;
    out.length = 0;
    const len = Math.hypot(bx - ax, bz - az);
    this.garage.solids.solidsNear((ax + bx) / 2, (az + bz) / 2, len / 2 + 0.5, out);
    for (const s of out) {
      // into the box's own frame (along its heading, across it)
      const c = Math.cos(s.yaw);
      const n = Math.sin(s.yaw);
      const hx = s.hx;
      const hz = s.round ? s.hx : s.hz;
      const lx = (x: number, z: number): number => (x - s.x) * c + (z - s.z) * n;
      const lz = (x: number, z: number): number => -(x - s.x) * n + (z - s.z) * c;
      const a = [lx(ax, az), ay, lz(ax, az)];
      const b = [lx(bx, bz), by, lz(bx, bz)];
      const lo = [-hx, s.y0, -hz];
      const hi = [hx, s.y1, hz];
      // (the mark itself inside something, or the eye: no wall between)
      const inside = (p: number[]): boolean => p.every((v, i) => v >= lo[i] && v <= hi[i]);
      if (inside(a) || inside(b)) continue;
      let t0 = 0;
      let t1 = 1;
      let hit = true;
      for (let i = 0; i < 3 && hit; i++) {
        const d = b[i] - a[i];
        if (Math.abs(d) < 1e-9) {
          if (a[i] < lo[i] || a[i] > hi[i]) hit = false;
          continue;
        }
        let u0 = (lo[i] - a[i]) / d;
        let u1 = (hi[i] - a[i]) / d;
        if (u0 > u1) [u0, u1] = [u1, u0];
        t0 = Math.max(t0, u0);
        t1 = Math.min(t1, u1);
        if (t0 > t1) hit = false;
      }
      if (hit) return true;
    }
    return false;
  }

  private updateAudio(dt: number): void {
    this.sounds();
    this.worldLoops();
    this.updateFoley();
    this.updateEngineVoice();
    this.updateRadio();
    this.updateFootsteps();
    this.updateAmbience(dt);
    // (the weather's wind is the archive's beds while they play: the synthesized wind keeps only the car's own speed)
    const recorded = this.audio.replaced.rain;
    const v = this.focus;
    if (!v) return;
    const sim = v.sim;
    const d = v.sys.dash;
    // (the tyres' own rolls and slides are foley's, by surface (tyreSound.ts): the shared bed under them is asphalt's,
    // turned down, and its old skid hiss is kept for a hub or the body dragging on the road)
    let slip = 0;
    let rough = 0;
    for (const wh of sim.wheels) {
      if (wh.util > slip) slip = wh.util;
      if (wh.contact) rough = SURFACES[Surface.Asphalt].rough;
    }
    slip = Math.min(slip, 0.9);
    // a hub or the body dragging on the road screeches like a skid (a bare rim grinds: foley's rim_grind)
    const grind = Math.min(1, (sim.feel.scrape ?? 0) / 4);
    if (grind > slip) slip = grind;
    // (a flat tyre flaps: foley's flat_flap, in time with the wheel)
    const flat = false;
    const w = this.env.state;
    const eng = v.sys.derived.engine?.engine;
    this.audio.update(
      {
        rpm: d.rpm,
        idleRpm: sim.spec.engine.idle,
        redline: sim.spec.engine.redline,
        cylinders: eng?.cylinders ?? 4,
        throttle: sim.throttle,
        speed: sim.speed,
        slip,
        rough,
        rain: w.rain,
        hail: w.hail,
        snow: w.snow,
        dust: recorded ? 0 : w.dust,
        wind: recorded ? 0 : w.wind,
        // (the wind and the rain come in at a door standing open as at one that is not there; on foot, through
        // the walls and the roof one stands under)
        enclosed: this.seated ? 1 - this.cabinOpen(v) : this.shelterNow,
        // (the engine and its starter are the EngineVoice's)
        engineOn: false,
        cranking: false,
        starterRate: Math.min(1, d.battery * 2),
        shifting: sim.shiftTimer > 0 ? sim.shiftTimer / Math.max(0.05, sim.spec.gearbox.shiftTime) : 0,
        thump: sim.feel.thump,
        suspension: sim.feel.suspRms,
        buzz: sim.feel.buzz,
        // (the old mixer's road-noise bed and the rush of air the car's own speed makes: none, as the player asked —
        // heard as a hiss under everything; the weather's wind is the archive's beds)
        roadScale: 0,
        airScale: 0,
        flat,
        horn: false,
        hornDetune: false,
      },
      this.env.flash,
    );
  }

  /**
   * The look at the instruments (docs/V3/plan/finish.md §五). The mark come to rest on the plate for 0.12 s is taken
   * as wanting to read it: the wheel and her hands on it fade to a quarter where they stand before the plate (the rest
   * of them as always), and the view is drawn in until the plate is four tenths bigger — she leans a little towards
   * it, the lens does the rest. Off the plate for 0.3 s, it is over; in over 0.15 s, out over 0.3 s.
   */
  private readonly gauges = { on: 0, off: 0, want: false, k: 0, zoom: 1, car: null as ModVehicle['view'] | null, box: { x: 0, y: 0, hx: 1, hy: 1 } };
  private readonly gaugeEye = new THREE.Vector3();
  private readonly gaugeDir = new THREE.Vector3();
  /** how far the look at the instruments is in (0 … 1) */
  get gaugeLook(): number {
    return this.gauges.k;
  }
  private stepGauges(dt: number, cam: THREE.PerspectiveCamera): void {
    const g = this.gauges;
    const v = this.seated;
    const c = GAUGE_LOOK && v && this.viewMode === 'cockpit' && this.seatAt !== 'pass' ? v.view.cluster : null;
    const fw = this.core.frame.rtScene.width;
    const fh = this.core.frame.rtScene.height;
    // (another vehicle's wheel, or none: the one that was faded is whole again)
    if (g.car && g.car !== v?.view) {
      g.car.wheelSeeThrough(0, fw, fh, null, this.core.renderer, this.core.scene, cam);
      g.car = null;
    }
    if (!c || !v) {
      if (g.k > 0) this.her.seeThrough(0);
      g.on = g.off = g.k = 0;
      g.want = false;
      g.zoom = 1;
      return;
    }
    cam.updateMatrixWorld();
    // (the mark on one of the cab's controls — the key in the plate's bite, the radio beside it — is for that control;
    // the wheel is looked through)
    const ctl = this.cockpit.aimed;
    const busy = !!ctl && ctl.cat !== 'steering' && ctl.cat !== 'door';
    const aimed = !busy && c.aimed(cam.getWorldPosition(this.gaugeEye), cam.getWorldDirection(this.gaugeDir));
    if (aimed) {
      g.on += dt;
      g.off = 0;
      if (g.on >= GAUGE_DWELL) g.want = true;
    } else {
      g.off += dt;
      g.on = 0;
      if (g.off >= GAUGE_LEAVE) g.want = false;
    }
    g.k = Math.max(0, Math.min(1, g.k + (g.want ? dt / GAUGE_IN : -dt / GAUGE_OUT)));
    const e = g.k * g.k * (3 - 2 * g.k);
    // she leans towards the plate a little (a tenth of the way, 4 cm at most); the lens makes up the rest of the four tenths
    let lean = 0;
    let dist = 1;
    if (e > 0) {
      // (the plate where the vehicle is now: Cluster.aimed has brought its world matrix up to this frame)
      const d = this.gaugeDir.setFromMatrixPosition(c.group.matrixWorld).sub(cam.position);
      dist = Math.max(0.1, d.length());
      lean = Math.min(0.04, dist * 0.1) * e;
      cam.position.addScaledVector(d, lean / dist);
      cam.updateMatrixWorld();
    }
    g.zoom = (1 + (GAUGE_ZOOM - 1) * e) * ((dist - lean) / dist);
    g.car = v.view;
    const box = e > 0.002 && c.screenBox(cam, fw, fh, g.box) ? g.box : null;
    v.view.wheelSeeThrough(e, fw, fh, box, this.core.renderer, this.core.scene, cam);
    if (box) this.her.seeThrough(e, box.x, box.y, box.hx, box.hy, fh);
    else this.her.seeThrough(0);
  }

  /** Her body for the frame (character/inGame.ts): on foot under the walker, in the driver's seat at the wheel. */
  private readonly herSeat = { eye: new THREE.Vector3(), fwd: new THREE.Vector3(), up: new THREE.Vector3(), lookYaw: 0, lookPitch: 0, wheel: null as THREE.Object3D | null, wheelRadius: 0.19, wheelPart: 'steer_std', throttle: 0, brake: 0, cab: true, bar: null as THREE.Object3D | null, lean: 0, leanPivot: new THREE.Vector3() };
  private updateHer(dt: number, cam: THREE.Camera): void {
    const her = this.her;
    if (!her.ready) return;
    const v = this.seated;
    let seat: typeof this.herSeat | null = null;
    if (v) {
      const b = this.basis;
      v.sim.basis(b);
      const hs = this.herSeat;
      hs.eye.set(this.rig.x, this.rig.y, this.rig.z);
      hs.fwd.set(b[0], b[1], b[2]);
      hs.up.set(b[3], b[4], b[5]);
      hs.lookYaw = this.input.lookYaw;
      hs.lookPitch = this.input.lookPitch;
      hs.wheel = this.seatAt === 'pass' ? null : v.view.nodeOf('steering');
      hs.wheelPart = v.build.parts.steering?.part ?? 'steer_std';
      hs.bar = null;
      if (hs.wheel && partDef(v.build.parts.steering?.part ?? 'steer_std').steering?.bar) {
        hs.bar = hs.wheel;
        hs.wheel = null;
      }
      hs.lean = v.view.frame.balance ? v.sim.lean : 0;
      // (the line the tyres meet the road on, the bike leans about it: as the view does)
      const pose = v.view.pose;
      const py = v.sim.leanPivotY;
      hs.leanPivot.set(pose.x + b[3] * py, pose.y + b[4] * py, pose.z + b[5] * py);
      hs.throttle = v.sim.throttle;
      hs.brake = (v.sim as unknown as { brake?: number }).brake ?? 0;
      hs.cab = !v.view.frame.balance;
      seat = hs;
    }
    const view = this.viewMode === 'orbit' || (v && this.viewMode !== 'cockpit') ? 'outside' : !v && her.thirdPerson ? 'third' : 'first';
    const h = this.heldThing;
    const held = !v && h.shown && h.model ? { frame: h.handFrame, size: h.size, twoHanded: h.twoHanded, kind: h.kind, grip: h.marker('M_grip')?.clone().sub(h.centre) ?? null } : null;
    // what she wears: the hotbar's clothes put on (ModPlayer.worn) and the pack on her back
    const wear: Wear[] = [];
    const p = this.player;
    for (const [slot, it] of Object.entries(p.worn)) {
      const pattern = it ? ITEM_PATTERN[it.item] : undefined;
      if (!it || !pattern) continue;
      const d = itemDef(it.item);
      wear.push({ slot: slot as Wear['slot'], pattern, paint: d.paint, paint2: d.paint2 ?? d.paint });
    }
    if (p.pack && ITEM_PATTERN[p.pack.item]) {
      const d = itemDef(p.pack.item);
      wear.push({ slot: 'pack', pattern: ITEM_PATTERN[p.pack.item], paint: d.paint, paint2: d.paint2 ?? d.paint });
    }
    this.reachOut(dt, cam);
    her.update(dt, this.player.walker, seat, cam, view, held, wear);
  }

  /** how far her hand is out (0 … 1), how long the button's press is kept (a click is seen), where it went */
  private reachK = 0;
  private reachKeep = 0;
  private reachWas = false;

  /**
   * Her right hand goes to what the left button works (docs/V3/plan/finish.md §十): on foot the point under the mark
   * (a thing lying about, a door, a part, a device), within an arm's length; in a seat the cab's control under the
   * mark (the key, the lever, the handbrake, the radio). Out quickly as the button goes down, kept there at least a
   * fifth of a second (a click is a touch, not nothing), back as it is let go.
   */
  private reachOut(dt: number, cam: THREE.Camera): void {
    const r = this.her.reach;
    const p = this.player;
    const o = this.core.origin;
    const down = (p.primary || this.leftButton) && this.deadT < 0 && !this.menu.isOpen && !this.listV;
    let at = false;
    let press = false;
    const v = this.seated;
    if (v) {
      const m = this.cockpit.aimed;
      if (m && down) {
        v.view.model.updateMatrixWorld();
        v.view.model.localToWorld(r.at.set(m.pos.x, m.pos.y, m.pos.z));
        at = true;
        press = m.cat === 'horn' || m.cat === 'radio';
      }
    } else {
      const t = p.target;
      if (t && down && t.dist < 1.15 && !p.held && !p.placer?.placing) {
        r.at.set(p.eye.x + p.dir.x * t.dist - o.x, p.eye.y + p.dir.y * t.dist - o.y, p.eye.z + p.dir.z * t.dist - o.z);
        at = true;
      }
    }
    void cam;
    if (at && !this.reachWas) this.reachKeep = 0.22;
    this.reachWas = at;
    this.reachKeep = Math.max(0, this.reachKeep - dt);
    const want = at || this.reachKeep > 0 ? 1 : 0;
    if (at) r.press = press;
    this.reachK += (want - this.reachK) * (1 - Math.exp(-dt * (want ? 18 : 8)));
    if (this.reachK < 0.005) this.reachK = 0;
    r.w = this.reachK * this.reachK * (3 - 2 * this.reachK);
  }

  render(): void {
    if (this.env.shotMode) this.env.prepareShot();
    this.core.render(this.time);
    // (the game was just kept: its place's card again, with this frame for its picture)
    if (this.cardDue && !this.menu.isOpen) {
      this.cardDue = false;
      this.keepCard(true);
    }
  }

  frame(dt: number): void {
    this.step(dt);
    this.render();
    this.hud.update(dt, () => {
      const st = this.core.stats;
      return `${this.place}  ${st.calls} 次绘制  ${(st.triangles / 1000).toFixed(0)}k 三角形`;
    });
  }

  /** fixed steps without drawing (the screenshot harness) */
  simulate(seconds: number): void {
    const n = Math.max(1, Math.round(seconds * 60));
    const dt = seconds / n;
    for (let i = 0; i < n; i++) this.step(dt, 1);
    if (seconds === 0) this.step(0, 1);
  }

  /** is the project car's windscreen clean (its body has no crust or dirt left on it, or the unit is done) */
  private windscreenClean(): boolean {
    const v = this.vehicles[0];
    if (!v) return false;
    const key = `${v.build.uid}:body`;
    const m = this.grime?.get(key);
    if (m) return m.doneDirt.has(5);
    return (v.build.crust ?? 0) + v.build.dirt < 0.05;
  }

  /** what is being cleaned, unit by unit (the probes') */
  grimeTelemetry(): Record<string, unknown> {
    return {
      masks: this.grime?.keys ?? [],
      texels: this.grime?.texels ?? 0,
      cleaning: [...this.cleaning.values()].map((c) => {
        const m = this.grime?.get(c.key);
        return {
          key: c.key,
          owner: c.owner,
          label: c.label,
          units: c.units.map((u) => ({ unit: u.unit, name: unitName(c.kind, u.unit, c.label), dirt: +u.dirt.toFixed(3), dirtWas: +u.dirtWas.toFixed(1), rust: +u.rust.toFixed(3), rustWas: +u.rustWas.toFixed(1) })),
          doneDirt: m ? [...m.doneDirt] : [],
          doneRust: m ? [...m.doneRust] : [],
        };
      }),
      scrub: this.player.scrub ? { hit: this.player.scrub.hit?.label ?? '', speed: +this.player.scrub.speed.toFixed(2) } : null,
      aim: this.player.scrubAim?.label ?? '',
    };
  }

  /** the wrecks about: how many there, kept, taken; each one there, what it is and where (the probes') */
  wreckTelemetry(): Record<string, unknown> | null {
    const wr = this.wrecks;
    if (!wr) return null;
    const sv = this.seated;
    const x = sv ? sv.sim.px : this.player.walker.x;
    const z = sv ? sv.sim.pz : this.player.walker.z;
    return {
      live: wr.live.size,
      kept: wr.kept.size,
      gone: wr.gone.size,
      spawned: wr.spawned,
      despawned: wr.despawned,
      flares: this.glints?.flares ?? 0,
      list: [...wr.live.values()].map((l) => ({
        id: l.spot.id,
        frame: l.v.build.frame,
        index: this.vehicles.indexOf(l.v),
        parts: Object.keys(l.v.build.parts).length,
        dist: Math.round(Math.hypot(l.v.sim.px - x, l.v.sim.pz - z) * 10) / 10,
        x: l.v.sim.px,
        z: l.v.sim.pz,
        y: l.v.sim.py,
        ready: !!l.sig,
        touched: wr.touched(l),
        finds: l.roll?.finds.map((f) => f.part) ?? [],
        riders: this.loose.ridersOf(l.v).length,
      })),
    };
  }

  telemetry(): Record<string, unknown> {
    const st = this.core.stats;
    const v = this.seated ?? this.focus;
    return {
      place: this.place,
      seated: !!this.seated,
      calls: st.calls,
      triangles: st.triangles,
      programs: st.programs,
      kmh: v?.sim.kmh ?? 0,
      exploded: this.vehicles.some((x) => x.sim.exploded),
      vehicles: this.vehicles.map((x) => ({ frame: x.build.frame, parts: Object.keys(x.build.parts).length, running: x.sys.running, x: x.sim.px, z: x.sim.pz })),
      loose: this.loose.list.length,
      wrecks: this.wreckTelemetry(),
      places: this.places?.telemetry() ?? null,
      siteArt: this.siteArt?.telemetry() ?? null,
      shake: { ...this.shake.parts },
      rumble: { ...this.pad.rumbleNow },
      dust: { live: this.dust.live, thrown: this.dust.thrown },
      tyres: (this.tyreNow?.loops ?? []).map((l) => `${l.name}:${l.gain.toFixed(2)}${l.cutoff ? `@${Math.round(l.cutoff)}` : ''}`),
      wipers: v ? { ...v.view.wipe, dirt: v.build.dirt, crust: v.build.crust ?? 0, blades: v.view.wipers.length } : null,
      tutorial: this.tutorialSteps().map((s) => (s.done ? 1 : 0)).join(''),
      steps: this.tutorialSteps().filter((s) => s.done).map((s) => s.id),
      kernel: this.kernel.telemetry(),
      // (the brush's shadow a spray can casts: on, its colour, its rim's warning of rust or dirt under it)
      brush: { on: carEnvUniforms.uBrushOn.value, hex: carEnvUniforms.uBrushColor.value.getHex(), warn: carEnvUniforms.uBrushWarn.value },
      ...(this.garage?.telemetry() ?? {}),
      ...this.player.telemetry(),
    };
  }
}

export { partDef };
