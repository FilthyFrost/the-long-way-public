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
import { allInstances, decodeBuild, encodeBuild, newInstance, fitSub, stockBuild, stockTireFor } from '../../core/modcar/build';
import { frameDef } from '../../core/modcar/frames';
import { partDef, PARTS } from '../../core/modcar/parts';
import { newTool, toolModelId } from '../../core/modcar/tools';
import { PALETTE, paintHex } from '../../core/modcar/palette';
import { coatOf, keepPartColours, paintTargets, SPRAY_TIERS, sprayFound, sprayLeft, sprayStep, sprayTier, takesPaint, type SprayResult } from '../../core/modcar/paint';
import { tyreStage } from '../../core/modcar/tyres';
import { gradesOn, isRare, type WreckRoll } from '../../core/modcar/wrecks';
import type { Build, PartDef } from '../../core/modcar/types';
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
import { newStock, type Cost, type Stock } from '../../core/modcar/crafting';
import type { PaintAim, ScrubHit, Scrub, TankPort } from './player';
import { SprayMist } from './sprayMist';
import { modcarWorld, SeamlessGround, SeamlessLand } from './seamless';
import { rehome, savedWorldOf, stampWorld, WORLD_CHANGED, worldMoved } from './worldSave';
import type { WorldVersion } from '../../core/world/rules';
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
import { ASSIST_LABELS, loadAssists, saveAssists, type Assists } from './assists';
import { HeldThing } from './held';
import { Radio, stationLabel } from './radio';
import { soundTab, type SoundStatus } from './soundTab';
import { clearSave, writeSave, type SaveV1, type SavedLoose } from './save';
import { itemDef, itemMass, itemPaint, newItem } from '../../core/modcar/items';
import { setItemClock } from './itemTime';
import { setItemCardFault } from './itemInfo';
import { backInTheWorld } from './save';
import { Sparks } from './sparks';
import { SeatShake, seatCushion, type ShakeEngine } from './seatShake';
import { ModPad, type PadHost } from './pad';
import { WheelDust } from './wheelDust';
import { PeeStream } from './peeStream';
import { tyreLoops } from './tyreSound';
import { itemStandIn, LooseThings, paintBaseOf, toolLook, toolModel, type Loose } from './loose';
import { CargoBay, massOf } from './cargo';
import { CargoList, type CargoRow } from './cargoList';
import { boxInHand, boxOnMark, boxSource, guardedSource, HandsList, Listing, placeSource, selfSource, setListDesk, vehicleSource, type ListSource } from './listSources';
import { canSprint, drink as drinkVital, eat as eatVital, has as hasEffect, medicate, newVitals, revive as reviveVital, speedFactor, stepVitals, type Vitals } from '../../core/modcar/vitals';
import { DeathCard, VitalsHud } from './vitalsHud';
import { agoText, clearRestores, pushRestore, restorePoints, useRestore } from './restore';
import type { DrinkLiquid, ItemInstance } from '../../core/modcar/items';
import { zoneOf } from '../../core/modcar/cargo';
import { heldName, heldOf } from './player';
import { CarMaterials } from './materials';
import { ModPlayer, type Held, type PlayerHost } from './player';
import { glintsOf, WithoutWrecks, WreckGlints, Wrecks, type WreckHost } from './wrecks';
import { isContainer, Places, type PlaceContainer, type PlacesHost } from './places';
import { SiteArt } from './siteArt';
import { Doors } from './doors';
import { solidWithin, type SolidSource } from '../../core/world/solids';
import type { Site, SiteObject } from '../../core/world/sites';
import { Cockpit, passengerSeat, seatMount, type CockpitHost, type FrontSeat } from './cockpit';
import { Aboard } from './aboard';
import { aboardOf, type BoardDoor } from '../../core/modcar/aboard';
import { ModUI } from './ui';
import { ModVehicle, visibleUp } from './vehicle';
import type { ModEnv } from '../../core/modcar/systems';
import { applyWheelMods } from '../../core/modcar/simlink';
import type { WorldTime } from '../../core/kernel/clock';
import type { GameContext, RadioSet } from './kernel/context';
import { Kernel } from './kernel/kernel';
import type { GameModule } from './kernel/modules';

/** converts the rig frame (+x forward, +z right) to a Three.js camera (−z forward, +x right) */
const QFIX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);

/** the sound archive's cues fetched as soon as it answers (the rest as they are first played): the car's body, things in the hands, the feet */
const ARCHIVE_WARM: readonly string[] = [
  'door_open', 'door_close', 'hood_open', 'hood_close', 'trunk_open', 'trunk_close', 'handbrake_pull', 'handbrake_release', 'switch',
  'part_pickup:light', 'part_pickup:medium', 'part_pickup:heavy', 'part_setdown:light', 'part_setdown:medium', 'part_setdown:heavy', 'part_install', 'part_remove',
  'step:dirt', 'step:gravel', 'step:concrete', 'step:wood', 'step:carpet', 'step:snow', 'jump', 'jump:dirt', 'land', 'land:dirt',
  'car_getin', 'car_getout', 'crash:small', 'crash:medium', 'gulp', 'eat', 'cap_open', 'pickup:can', 'pickup:bag', 'pickup:bottle', 'pickup:plastic',
  'container_open:wood', 'container_close:wood', 'container_open:crate', 'door_house_open', 'door_house_close',
  'pee_start', 'pee_end', 'pee:concrete', 'pee:snow', 'pee:wood', 'pee:metal', 'pee_relief', 'breath_fast', 'breath_slow', 'breath_end', 'heartbeat',
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
  /** which workshop: the real one (default) or the plain stand-in (?garage=stub) */
  garage: 'workshop' | 'stub';
  /** this is the player's game, kept in the browser (save.ts); not a test drive or the harness's run */
  keep: boolean;
  /**
   * Which version of the world's generator (core/world/rules.ts): 3 for a new game, the journey of the fifty
   * scenic roads (docs/V3/nodes/P3-1-journey-world.md) — the address may ask for 2 (?world=2) or for 1, the
   * worlds from before there were versions (?world=1) — and a save's own for a game gone on with
   */
  world: WorldVersion;
  /** how many regions of the registry the world knows: a save's own count, or the address's (?regions=); absent: the version's own — all there are now, for a new world of version 2 */
  regions?: number;
  /** play the sound archive's recordings where it is there (docs/V3/nodes/M4-audio.md); ?archive=0: the game's own synthesized sounds only */
  archive: boolean;
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
    garage: q.get('garage') === 'stub' ? 'stub' : 'workshop',
    keep: false,
    world: q.get('world') === '1' ? 1 : q.get('world') === '2' ? 2 : q.get('world') === '3' ? 3 : q.get('world') === '4' ? 4 : 5,
    ...(Number.isInteger(regions) ? { regions } : {}),
    archive: q.get('archive') !== '0',
    time: Number.isFinite(base.time) ? base.time : start === 'garage' ? 9.2 : base.time,
    weather: base.weather === 'auto' && start === 'garage' ? 'clear' : base.weather,
  };
}

/** a number 0…1 from a string (the same every time) */
/** where a new game's world seed waits for it (ModGame.newGame: a new world each new game) */
export const NEW_SEED_KEY = 'modcar.newSeed';

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
  /** the right mouse button is down (take off; with a can, draw it back out) */
  rightButton = false;
  /** G held (by the harness; the keyboard's own is read from the input) */
  dropButton = false;
  /** the body (vitals.ts): health, stamina, food, water, temperature, the bladder */
  body: Vitals = newVitals();
  /** the materials (crafting.ts): shared counts the recycler gives and the bench takes */
  readonly stock: Stock = newStock();
  /** the workshop's generator, recycler and bench (workshop.ts; in the garage) */
  workshop: Workshop | null = null;
  /** the workshop as last seen (kept through a trip down the road) */
  private workshopKept: WorkshopSave | undefined;
  private matHud: MaterialsHud | null = null;
  /** the grime masks of what is being cleaned (grime.ts) */
  private grime: Grime | null = null;
  /** what is being cleaned: its units as last measured, when, a unit's flash as it comes clean */
  private readonly cleaning = new Map<string, Cleaning>();
  /** looks that came clean all over: their flash fading */
  private readonly lookFlashes: { look: import('../render/carMaterials').CarLook; t: number }[] = [];
  /** H: the dirt still left lit up (s to go) */
  private grimeShowT = 0;
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
  /** the looks a spray can went on lately (drawn on their own while it is about: their colour moves, they flash), and when */
  private readonly paintHeld = new Map<string, { v: ModVehicle | null; loose: Loose | null; owner: string; at: number }>();
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
  /** the bladder went by itself: emptying until it is empty */
  private autoPee = false;
  /** since one died (s; −1 alive); since the last restore point (s) */
  private deadT = -1;
  private restoreT = 0;
  /** sprinting now (blended for the view's widening) */
  private sprintB = 0;
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
  private listSel = 0;
  /** the liquid going in from a can at a filler */
  readonly stream: LiquidStream;
  /** rain bursting on the ground and on the vehicles' tops */
  readonly splashes: Splashes;
  /** metal on the road */
  readonly sparks: Sparks;
  /** the dust the wheels throw up (wheelDust.ts) */
  readonly dust: WheelDust;
  /** relieving oneself, seen: the stream and the wet patch it leaves (peeStream.ts) */
  readonly pee: PeeStream;
  private readonly peeFrom = { x: 0, y: 0, z: 0 };
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
  /** crouching on foot (C; seated, C changes the view): kept until C again, or a seat taken */
  crouch = false;
  readonly orbit = { yaw: 0.6, pitch: 0.25, dist: 7, target: 0.8 };
  time = 0;
  /** checklist progress for the garage's first build */
  readonly done = new Set<string>();
  private fadeT = -1;
  private garageCtx: GarageContext | null = null;
  private readonly gs = new GroundSample();
  private readonly bl = new BiomeBlend();
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
    this.input.freeLook = true;
    this.env = new Environment(this.core, params.seed, { hour: params.time, weather: params.weather, stage: params.wstage });
    this.env.shotMode = params.shot;
    this.devTools = new DevWorld(this, this.tune);
    this.orbit.yaw = (params.orbit[0] * Math.PI) / 180;
    this.orbit.pitch = (params.orbit[1] * Math.PI) / 180;
    this.orbit.dist = params.orbit[2];
    this.orbit.target = params.orbit[3];
    this.place = params.start;
    this.seamless = params.start === 'garage' && params.garage !== 'stub';
    if (params.start === 'garage') {
      this.garage = params.garage === 'stub' ? buildGarageStub(this.core) : buildGarage(this.core);
      this.ground = this.garage.ground;
    } else {
      this.makeWorld();
      this.ground = this.floored(this.proving!);
    }
    // the workshop in the world: the world made with it, the garage's ground on its plot, the world's beyond
    if (this.seamless && this.garage) {
      this.makeWorld();
      this.ground = this.floored(new SeamlessGround(this.garage.ground, this.proving!));
    }
    this.loose = new LooseThings(this.core, this.mats, (x, z, fromY) => (this.garage && (!this.seamless || onPlot(x, z)) ? this.garage.surfaceAt(x, z, fromY) : this.groundAt(x, z)));
    // (things put on a vehicle ride with it)
    this.loose.carriers = () => this.vehicles;
    this.cargo = new CargoBay(this.core, this.loose);
    this.heldThing = new HeldThing(this.core);
    this.stream = new LiquidStream(this.core.scene);
    this.splashes = new Splashes(this.core.renderer, this.core.scene);
    this.sparks = new Sparks(this.core);
    this.dust = new WheelDust(this.core.origin);
    this.core.scene.add(this.dust.mesh);
    this.pee = new PeeStream(this.core.origin);
    this.core.scene.add(this.pee.mesh, this.pee.spot);
    this.grime = new Grime(this.core.renderer);
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
    return this.world ?? (this.probeWorld ??= modcarWorld(p.seed, { chapterScale: p.chapter, startBiome: p.biome, worldVersion: p.world, regionCount: p.regions }).world);
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
        loose: this.loose,
        ui: this.ui,
        stock: this.stock,
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
        loose: this.loose,
        ui: this.ui,
        stock: this.stock,
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
  private stockChanged(d: Cost): void {
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
    const made = modcarWorld(p.seed, { chapterScale: p.chapter, startBiome: p.biome, worldVersion: p.world, regionCount: p.regions });
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

  /** the wheels' ground with the places' floors on it: a building's plinth is driven onto, not into (floorGround.ts) */
  private floored(land: Ground): Ground {
    return new FloorGround(land, this.vehicleSolids, () => this.time);
  }

  // ------------------------------------------------------------------ setting up

  /** the vehicles and the things lying about at the start */
  private async populate(): Promise<void> {
    const p = this.params;
    // (the places' models in before any place is drawn: what is ours is never drawn twice)
    if (this.siteArt) await this.siteArt.ready;
    if (this.garage) {
      const g = this.garage;
      await Promise.all([preload(PARTS.map((x) => x.id)), g.ready]);
      if (this.restore?.stock) Object.assign(this.stock, this.restore.stock);
      this.makeWorkshop();
      if (this.restore) {
        this.restoreGarage(this.restore);
        await Promise.all([...this.vehicles.map((v) => v.view.settled()), this.loose.settled()]);
        await this.restoreGrime();
        if (this.seamless) await this.buildWorldAround();
        if (this.seated) this.input.lookPitch = this.seatPitch(this.seated);
        this.ui.say(this.movedWords() ?? '接着上次的进度。（从头开始：开发者面板里的「从头开始」，或连按两次 F9）', 5);
        return;
      }
      const project = p.project === 'full' ? stockBuild('sedan', { fuel: 0.05 }) : stockBuild('sedan', { fuel: 0, without: [...TUTORIAL_MISSING] });
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
      const tools = [newTool('jerrycan', { fuel: 'petrol', litres: 20 }), newTool('jerrycan', { fuel: 'diesel', litres: 20 }), newTool('bottle'), newTool('oilcan'), can(1, 13), can(1, 26), can(2, 3), can(3, 23), newTool('sponge'), newTool('brush')];
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
        for (const id of ['junk_fax', 'junk_coffee']) {
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
      if (this.restore?.stock) Object.assign(this.stock, this.restore.stock);
      this.workshopKept = this.restore?.workshop;
      const b = this.restore?.vehicles[0]?.build ?? decodeBuild(p.build, { fuel: 0.7 });
      const v = this.placeOnRoad(b, p.s);
      if (this.restore) {
        v.radioOn = !!this.restore.vehicles[0].radioOn;
        v.radioSong = this.restore.vehicles[0].radioSong ?? 0;
        for (const d of this.restore.done) this.done.add(d);
        this.restoreLoose(this.restore.loose.filter((l) => l.on === 0));
        this.restoreHands(this.restore);
        this.ui.say(this.movedWords() ?? '接着上次的路。（回车库从头开始：开发者面板里的「从头开始」，或连按两次 F9）', 5);
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

  /** the things of a save: on the floor where they lay, on board the vehicle they rode on */
  private restoreLoose(list: SavedLoose[]): void {
    for (const l of list) {
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

  /** the air round one: the weather's, the workshop's (never under 15 °C), a running cab's heater */
  bodyAirC(): number {
    const out = this.env.state.temp;
    if (this.seated && this.seated.sys.running && this.seated.sys.derived.enclosed > 0.5) return Math.max(out, 20);
    if (this.place === 'garage' && (!this.seamless || this.indoors())) return Math.max(out, 15);
    return out;
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
    const peeing = !this.seated && (this.input.isDown('KeyP') || this.autoPee) && b.bladder > 0.5;
    if (b.bladder < 0.5) this.autoPee = false;
    if (this.deadT < 0) {
      if (this.assists.needs) {
        const ev = stepVitals(b, { dt, sprinting, jumped: jumps > 0, ambientC: this.bodyAirC(), warmth: 9, rain: !this.seated && (this.seamless ? !this.indoors() : this.place === 'road') && this.shelterNow < 0.5 && this.env.state.rain > 0.15, peeing });
        if (ev.hurt > 0) {
          this.vitHud.hurt();
          this.sound('hurt', Math.min(1, ev.hurt / 4));
        }
        if (ev.wet && !this.autoPee) {
          this.autoPee = true;
          this.ui.say('憋不住了……', 2.2);
        }
        if (ev.died) this.onDeath(ev.why);
      } else {
        // (the needs off: only stamina, as one sprints)
        const keep = { food: b.food, water: b.water, temp: b.temp, bladder: b.bladder };
        stepVitals(b, { dt, sprinting, jumped: jumps > 0, ambientC: 20, warmth: 37, rain: false, peeing: false });
        Object.assign(b, keep);
      }
    } else this.stepDeath(dt);
    // on foot: slower frozen or relieving oneself, quicker on an energy drink
    w.speedScale = speedFactor(b, peeing);
    this.sprintB += ((sprinting ? 1 : 0) - this.sprintB) * (1 - Math.exp(-dt * 6));
    this.vitHud.update(b, this.bodyAirC(), dt);
    // breathing hard, the heart, relieving oneself
    this.bodySounds(dt, b, peeing);
    // the restore points: every five minutes of play
    if (this.params.keep && this.deadT < 0 && (this.restoreT += dt) > 300) {
      this.restoreT = 0;
      const s = this.snapshot();
      if (s) pushRestore(s);
    }
  }

  /** the body's sounds as they were last heard: relieving oneself, out of breath (and the next breath due in), the next heartbeat due in */
  private readonly bodyS = { peeing: false, winded: false, breathT: 0, beatT: 0 };

  /**
   * The body's sounds, the archive's recordings of them (Arctic Drive's; the heart Long Drive North's): relieving
   * oneself — the start, the stream on what it falls on, a sigh of relief when it was needed, the end; out of breath
   * from when stamina runs low, a pant at a time, fast and then slower as it comes back, and the breath got back at
   * last; the heart when badly hurt, a beat at a time, quicker the worse it is. Without the archive, the synthesized
   * loops as before.
   */
  private bodySounds(dt: number, b: Vitals, peeing: boolean): void {
    const f = this.foley;
    const s = this.bodyS;
    const rec = !!f && f.has('breath_fast');
    if (peeing !== s.peeing) {
      s.peeing = peeing;
      if (f && rec) {
        f.cue(peeing ? 'pee_start' : 'pee_end', 1);
        if (peeing && b.bladder > 40) f.cue('pee_relief', 1, { when: (this.audio.context?.currentTime ?? 0) + 1.4 });
      }
    }
    if (peeing) this.loopsNow.set('pee', { footing: this.footing() });
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
    if (d.eat && (d.eat.food > 0 || d.eat.hp > 0 || d.eat.effect)) eatVital(this.body, d.eat.food, d.eat.hp, d.eat.effect);
    if (d.heal) {
      const side = medicate(this.body, d.heal.hp, d.heal.warm ?? 0, d.heal.side ?? 0, Math.random());
      if (side) this.ui.say(side === 'drunk' ? '药劲上头了，有点晕……' : '肚子不太舒服……', 2.4);
    }
    this.ui.say(`${d.cat === 'med' ? '吃了' : '吃完了'}${d.name.zh}。`, 1.6);
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
  private onDeath(why: '' | 'starve' | 'thirst' | 'cold'): void {
    this.deadT = 0;
    this.deathWhy = why === 'starve' ? '饿得撑不住了。' : why === 'thirst' ? '渴得撑不住了。' : why === 'cold' ? '冻得撑不住了。' : '伤得太重了。';
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
      () => {
        clearRestores();
        this.newGame();
      },
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
      vehicles: own.map((v) => ({ build: v.build, x: v.sim.px, z: v.sim.pz, yaw: v.sim.yaw, radioOn: v.radioOn, radioSong: v.radioSong })),
      loose,
      player: { x: w.x, z: w.z, heading: w.heading },
      // (the two slots go on with the player, to the road too)
      hands: this.player.slots.map((h) => (h ? (h.kind === 'part' ? { part: h.inst } : h.kind === 'item' ? { item: h.item } : { tool: h.tool }) : null)),
      sel: this.player.sel,
      ...(this.player.pack ? { pack: this.player.pack } : {}),
      body: this.body,
      stock: { ...this.stock },
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
    const s = this.snapshot();
    if (s) {
      // (a save the browser will not keep was a silent thing; with the systems' parts in it, and six restore
      // points beside it, a full storage is nearer: said once, and it is the test hook's last error)
      if (!writeSave(s)) this.kernel.report('save', new Error('the browser would not keep the save (its storage is full or shut): the game goes on unsaved'), '存档没能写进去：浏览器的存储满了或者用不了，眼下的进度存不下来。');
      this.keepGrime();
    }
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
   * again) dropped, the picture's quality kept.
   */
  newGame(): void {
    this.saveOff = true;
    clearSave();
    void forgetMasks();
    // (the V3 systems' parts of the save and the world's clock: as a new game starts, and said)
    this.kernel.newGame(this.env.clock.hourAt(this.time));
    // (a new world each new game, Arctic Drive's: a seed of its own for it, kept with its save from then on)
    try {
      localStorage.setItem(NEW_SEED_KEY, String(1 + Math.floor(Math.random() * 999_999)));
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
    for (const [key, p] of this.paintHeld) if (p.v === v) this.paintHeld.delete(key);
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
      ridersOf: (v) => this.ridersSaved(v),
      restoreRiders: (v, list) => this.restoreRiders(v, list),
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
  private restoreRiders(v: ModVehicle, list: readonly SavedLoose[]): void {
    for (const l of list) {
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
    const key = h.kind === 'part' ? `part:${h.inst.part}:${h.inst.sub.tire?.part ?? ''}` : h.kind === 'item' ? `item:${h.item.item}:${h.item.tint ?? ''}` : `tool:${h.tool.kind}:${h.tool.kind === 'jerrycan' ? (h.tool.fuel ?? 'petrol') : ''}:${h.tool.kind === 'spray' ? (h.tool.colour ?? 0) : ''}:${h.tool.tier ?? ''}`;
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
    this.icons.request(key, () => this.devModel(item), (url) => this.iconUrl.set(key, url), paint, paint2);
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
    if (this.seatAt === 'pass') return [{ keys: ['C'], text: '换视角' }];
    const running = v.sys.running;
    return [
      { keys: ['W'], text: '油门' },
      { keys: ['S'], text: '刹车 / 倒车' },
      { keys: ['Space'], hold: true, text: '手刹' },
      running ? { keys: ['K'], text: '熄火' } : { keys: ['K'], hold: true, text: '打火' },
      { keys: ['L'], text: '车灯' },
      { keys: ['C'], text: '换视角' },
    ];
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
    const d = { scrap: 100, organics: 100, chemicals: 100 };
    this.stock.scrap += 100;
    this.stock.organics += 100;
    this.stock.chemicals += 100;
    this.stockChanged(d);
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
      if (this.seated) {
        this.cockpit.press(this.seated, e.button === 2);
        return;
      }
      if (this.listV) {
        if (e.button === 0) this.takeFromList();
        return;
      }
      if (e.button === 0) this.player.press('mouse');
      if (e.button === 2) this.rightButton = true;
    });
    // scrubbing: the mouse moves the tool over the surface (the view holds still)
    document.addEventListener('mousemove', (e) => {
      if (this.player.scrub && this.input.locked) this.player.scrubMove(e.movementX, e.movementY);
    });
    window.addEventListener('mouseup', (e) => {
      if (this.seated) this.cockpit.release(this.seated);
      if (e.button === 0) this.player.release('mouse');
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
      if (this.listV) this.moveListSel(e.deltaY > 0 ? 1 : -1);
      else this.player.wheel(e.deltaY);
    });
    window.addEventListener('keydown', () => this.audio.start(), { once: true });
    // the key card: at the start until the first click, and on F1 any time
    if (!this.params.shot) this.ui.showHelp(true);
    window.addEventListener('keydown', (e) => {
      // at the bench: its list and its blows have the keys
      if (this.benchWs?.open && !e.repeat && this.benchWs.key(e.code)) {
        e.preventDefault();
        return;
      }
      // the key left of 1 (` on a US keyboard; § on a Mac's international one): the developer's parts bin
      if (e.code === 'Backquote' || e.code === 'IntlBackslash' || e.key === '`' || e.key === '§') {
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
        this.switchListSide(e.code === 'KeyA' || e.code === 'ArrowLeft' ? 0 : 1);
        return;
      }
      // (a list that takes things in: G puts the thing in the hands into it)
      if (this.listV && e.code === 'KeyG' && !e.repeat) {
        this.putIntoList();
        return;
      }
      if (e.key === 'Escape' && this.listV) {
        this.closeCargoList();
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
      if (e.code === 'F9') {
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
      // H: where the dirt still is, lit up for a couple of seconds
      if (e.code === 'KeyH' && !e.repeat && !this.seated) {
        this.grimeShowT = 2.4;
        this.sound('highlight_ping', 0.7);
        return;
      }
      if (e.code === 'KeyI' && !e.repeat) {
        this.toggleCards();
        return;
      }
      // the assists card open: the number keys switch them
      const n = /^Digit([1-9])$/.exec(e.code);
      if (n && this.ui.assistsShown) {
        const entry = ASSIST_LABELS[Number(n[1]) - 1];
        if (!entry) return;
        this.assists[entry[0]] = !this.assists[entry[0]];
        saveAssists(this.assists);
        this.ui.showAssists(this.assistItems());
      }
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === canvas) this.ui.showHelp(false);
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
        this.toggleCargoList();
        return;
      }
      if (a === 'use') {
        if (this.listV) this.takeFromList();
        else if (this.seated) {
          if (this.cockpit.aimedSeat && this.viewMode === 'cockpit') this.moveOver();
          else if (this.cockpit.aimedAft) this.goAft();
          else this.getOut();
        } else this.player.press();
        return;
      }
      if (a === 'camera') {
        // (on foot C crouches and stands again; in the seat it changes the view)
        if (!this.seated) this.crouch = !this.crouch;
        else this.viewMode = this.viewMode === 'cockpit' ? 'chase' : 'cockpit';
        return;
      }
      if (a === 'hud') this.hud.toggle();
      const v = this.seated;
      if (!v || this.seatAt === 'pass') return;
      if (a === 'key') {
        if (v.sys.running) v.sys.stop('');
        else v.sys.crank(true);
        this.sound('key');
      } else if (a === 'lights') {
        v.sys.cycleLights();
        this.sound('switch');
      } else if (a === 'horn') v.sys.setHorn(true);
      else if (a === 'leverUp' || a === 'leverDown') this.sound(v.sys.stepLever(a === 'leverUp' ? -1 : 1) ? 'lever' : 'grind');
      else if (a === 'manual') v.sim.setManual(!v.sim.manual);
      else if (a === 'hazard') {
        v.view.hazard = !v.view.hazard;
        this.sound('switch');
      }
      else if (a === 'reset') this.resetUpright(v);
    });
    this.input.onRelease((a) => {
      const v = this.seated;
      if (a === 'use' && !this.seated) this.player.release();
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
        if (name) g.ui.say('手柄已连接。按菜单键看手柄的按键。', 3.5);
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
      v.assistHold = a.autoHold;
      v.sys.assistReverse = a.autoReverse && v !== robot;
    }
    this.player.showGhostsOn = a.ghosts;
    this.player.showCardOn = a.card;
  }

  // ------------------------------------------------------------------ getting in and out

  enter(v: ModVehicle, at: FrontSeat = 'driver'): void {
    const seat = seatMount(v, at);
    if (!seat || !v.build.parts[seat.id]) {
      this.ui.say(at === 'pass' ? '副驾驶没有座椅，坐不进去。' : '驾驶位没有座椅，坐不进去。');
      return;
    }
    this.seatAt = at;
    this.seatSlide = at === 'pass' ? 1 : 0;
    // (one sits down standing up: C means the view in the seat)
    this.crouch = false;
    // (from the living space behind: one sits down where one stood)
    if (this.player.aboard) this.player.leaveAboard();
    // a wreck by the road one gets into is one's own from then on (it stays when one drives off, it is saved)
    if (this.wrecks?.claim(v)) this.ui.say(`坐进了这辆${v.view.frame.name.zh}——现在它归你了。`, 2.6);
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
    if (!v || Math.abs(v.sim.kmh) > 6) return;
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
    v.view.highlight(null);
    // nothing holds it now but the handbrake (or P): say so when it is off
    if (v.sim.parkBrake <= 0 && v.sim.selector !== 'P') this.ui.say(v.sys.hasPart('handbrake') ? '没拉手刹——车会溜。' : '这车没有手刹，停在坡上会溜。', 3);
    this.player.walker.place(x, z, heading);
    this.input.freeLook = true;
    this.input.lookYaw = heading;
    this.input.lookPitch = 0;
    this.sound(v.view.frame.balance ? 'lever' : 'door_close', v.view.frame.balance ? 0.7 : 1);
    if (!v.view.frame.balance) this.foley?.cue('car_getout', 0.9);
  }

  /** into a vehicle's living space by an open door (docs/V3/nodes/M2-rv.md): only a vehicle standing still */
  board(v: ModVehicle, door: BoardDoor, lookYaw?: number): void {
    if (Math.abs(v.sim.kmh) > 3) {
      this.ui.say('车还在动。', 2);
      return;
    }
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
    if (!v || !def) return;
    if (Math.abs(v.sim.kmh) > 3) {
      this.ui.say('先把车停下。', 2);
      return;
    }
    this.seated = null;
    this.seatAt = 'driver';
    this.seatSlide = 0;
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
    return !!aboardOf(v.view.frame.id) && Math.abs(this.input.lookYaw) > 1.9 && Math.abs(v.sim.kmh) < 3;
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
      this.ui.say(to === 'pass' ? '副驾驶没有座椅。' : '驾驶位没有座椅。', 2);
      return;
    }
    if (Math.abs(v.sim.kmh) > 3) {
      this.ui.say('先把车停下。', 2);
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
    } else if (m.cat === 'hood') this.ui.say(`${lid}下面是空的：早被人拆光了。`, 2.4);
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
      best = { v, loose: null, key: h.part.key, owner: h.part.owner, inst: h.part.inst, kind: h.part.kind, label: h.part.label, point: h.point, normal: h.normal, dist: h.dist, glass: h.glass };
    }
    const lh = this.loose.grimeCast(origin, dir, best ? best.dist : far);
    if (lh && (!best || lh.dist < best.dist)) best = { v: null, loose: lh.part.loose, key: lh.part.inst.uid, owner: lh.part.owner, inst: lh.part.inst, kind: 0, label: lh.part.label, point: lh.point, normal: lh.normal, dist: lh.dist, glass: lh.glass };
    if (best) best.label = unitName(best.kind, this.unitOfHit(best), best.label);
    return best;
  }

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
        this.ui.say(rusty ? `${name} · 泥壳刮掉了，还有锈：用钢丝刷刷` : `${name} · 干净了`, 2.2);
        if (/挡风玻璃/.test(name)) this.done.add('windscreen');
      }
      if (u.rustWas > MIN && !m.doneRust.has(u.unit) && u.rust <= 0.08 && (m.doneDirt.has(u.unit) || u.dirtWas <= MIN)) {
        m.doneRust.add(u.unit);
        g.snap(m, o, u.unit, 'rust');
        c.flash = 1;
        c.flashUnit = u.unit;
        this.sound('clean_rust_done', 0.9);
        this.ui.say(`${name} · 锈刷干净了`, 2.2);
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
    v?.view.setGrimeHeld(c.owner, false);
    if (c.loose && !this.loose.grimeParts(c.loose).some((x) => x.inst !== inst && this.grime?.get(x.inst.uid))) this.loose.setGrimeHeld(c.loose.uid, false);
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
    carEnvUniforms.uGrimeShow.value = this.grimeShowT > 0 ? Math.min(1, this.grimeShowT / 0.4, (2.4 - this.grimeShowT) / 0.2) : 0;
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
      return { v: h.v, loose: null, inst: t.inst, mount: t.mount, owner: h.owner, label: t.label, point: h.point.clone(), normal: h.normal.clone(), dist: h.dist, paintable: t.paintable };
    }
    if (!h.loose || !h.inst) return null;
    // (a tyre on a wheel lying about: the wheel's, and no paint)
    const own = h.owner === `l:${h.loose.uid}`;
    return { v: null, loose: h.loose, inst: h.inst, mount: null, owner: h.owner, label: partDef(h.inst.part).name.zh, point: h.point.clone(), normal: h.normal.clone(), dist: h.dist, paintable: own && takesPaint(h.inst.part) };
  }

  /** the can sprayed at it for dt seconds: the coat goes on, the can empties; the thing drawn on its own meanwhile, a flash when it is whole */
  spray(aim: PaintAim, can: Tool, dt: number): SprayResult {
    const v = aim.v;
    const p = aim.inst ?? v?.build;
    if (!p) return { t: 0, used: 0, done: false, already: true, empty: sprayLeft(can) <= 0 };
    const colour = can.colour ?? 0;
    // the body taking a colour of its own: the doors and lids that wore its colour keep theirs (each is painted on its own)
    if (v && !aim.inst && v.build.paint !== colour) keepPartColours(v.build);
    const from = v ? v.view.paintBase(aim.owner) : paintBaseOf(aim.inst!);
    const r = sprayStep(can, p, from, dt);
    if (r.already) return r;
    // (drawn on its own while the can is on it: its colour moves every frame, it flashes when whole)
    const key = `${v?.build.uid ?? aim.loose?.uid ?? ''}|${aim.owner}`;
    if (!this.paintHeld.has(key)) {
      if (v) v.view.setPaintHeld(aim.owner, true);
      else if (aim.loose) this.loose.setPaintHeld(aim.loose.uid, true);
    }
    this.paintHeld.set(key, { v, loose: aim.loose, owner: aim.owner, at: this.time });
    if (r.done) {
      const look = v ? v.view.mats.lookOf(aim.owner) : this.loose.lookOfOwner(aim.owner);
      if (look) {
        look.setGrimeFlash(1, -1);
        this.lookFlashes.push({ look, t: 1 });
      }
      this.sound('paint_done', 1);
      const name = PALETTE[colour]?.name.zh ?? '';
      // the whole vehicle one colour (Arctic Drive's "Class Above All")
      const all = v ? paintTargets(v.build).every((x) => coatOf(x.mount ? v.build.parts[x.mount] : v.build, colour) >= 1) : false;
      if (v && all && paintTargets(v.build).length > 1) {
        this.sound('clean_car_done', 0.8);
        this.ui.say(`${v.view.frame.name.zh} · 从头到尾都是${name}了！`, 3);
      } else this.ui.say(`${aim.label} · 喷成${name}了`, 1.6);
    }
    if (r.empty && r.used > 0) this.ui.say('罐子喷空了。', 2);
    return r;
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
    // the looks sprayed lately go back into their merge a while after the can left them
    for (const [key, h] of this.paintHeld) {
      if (this.time - h.at < 4 && can) continue;
      this.paintHeld.delete(key);
      if (h.v) h.v.view.setPaintHeld(h.owner, false);
      else if (h.loose && ![...this.paintHeld.values()].some((x) => x.loose === h.loose)) this.loose.setPaintHeld(h.loose.uid, false);
    }
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

  /** the systems' sets that play the radio's songs (GameContext.addRadios) */
  private readonly radioSets: (readonly RadioSet[])[] = [];

  addRadios(sets: readonly RadioSet[]): () => void {
    if (!this.radioSets.includes(sets)) this.radioSets.push(sets);
    return () => {
      const i = this.radioSets.indexOf(sets);
      if (i >= 0) this.radioSets.splice(i, 1);
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

  tutorialSteps(): { id: string; text: string; done: boolean }[] {
    const v = this.vehicles[0];
    if (!v) return [];
    const b = v.build;
    const fuel = v.sys.dash.tankL > 0 ? v.sys.dash.fuel : 0;
    const hood = v.view.hasPanel('hood') && !!b.parts.hood;
    // (the workshop's, before the car: the power, the materials, a scraper made at the bench)
    const ws = this.workshop && this.params.project === 'tutorial' ? this.workshop : null;
    const made = this.done.has('scraper');
    return [
      ...(ws
        ? [
            { id: 'power', text: '到门外拉发电机，车库来电', done: this.done.has('power') || ws.power },
            { id: 'scrap', text: '旧零件箱丢进回收台，攒 70 废料', done: made || this.stock.scrap >= 70 },
            { id: 'scraper', text: '在制作台做一把清理铲', done: made },
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
      { id: 'start', text: '按住 K 打火', done: v.sys.running || this.done.has('start') },
      { id: 'drive', text: '松手刹，开出车库', done: this.place === 'road' },
    ];
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
      this.ui.say('引擎盖还开着，挡住了前面：下车把它关上。', 4);
    }
    if (v.sys.running) this.done.add('start');
  }

  // ------------------------------------------------------------------ the frame

  modEnv(v: ModVehicle): ModEnv {
    const e = this.env;
    const sky = e.sky as unknown as { daylight?: number };
    let surface: number | undefined;
    for (const w of v.sim.wheels) if (w.contact) surface = w.surface;
    return { ambientC: e.state.temp, dark: e.dark, rain: e.state.rain, wet: e.state.wetness, sun: sky.daylight ?? 1, surface };
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

  step(dt: number, alpha?: number): void {
    // (one world with the workshop in it: in its yard or out on the road is only where one is)
    if (this.seamless) {
      const sv = this.seated;
      const was = this.place;
      this.place = onPlot(sv ? sv.sim.px : this.player.walker.x, sv ? sv.sim.pz : this.player.walker.z) ? 'garage' : 'road';
      if (sv && was === 'garage' && this.place === 'road' && !this.saidOnRoad) {
        this.saidOnRoad = true;
        this.ui.say('上路了。想回车库，掉头开回来就是。', 3);
      }
    }
    this.input.update(dt);
    this.pad.update(this.padHost());
    this.padFeel(dt);
    this.applyAssists();
    this.time += dt;
    // and every half minute
    if (this.params.keep && (this.saveT += dt) > 30) {
      this.saveT = 0;
      this.save();
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
      const listing = !!this.listV || down || !!this.benchWs?.open;
      this.player.update(dt, i.lookYaw, i.lookPitch, {
        forward: listing ? 0 : i.walk.forward,
        right: listing ? 0 : i.walk.right,
        // (sprinting while there is stamina)
        run: shift && canSprint(this.body),
        jump: !listing && (i.isDown('Space') || this.pad.jump),
        crouch: this.crouch,
        drop: !listing && (this.dropButton || i.isDown('KeyG') || this.pad.drop),
        // (the right button or F, as they are now: what the player made of them last frame is not fed back)
        take: !listing && (this.rightButton || i.isDown('KeyF') || this.pad.take),
        // (the right button's release is seen through the window's mouseup below)
      } as never);
      this.input.lookHold = this.player.transferring || listing || !!this.player.scrub;
      // (a pad's right stick moves the scrubbing tool as the mouse does)
      if (this.player.scrub && (this.pad.rx !== 0 || this.pad.ry !== 0)) this.player.scrubMove(this.pad.rx * dt * 700, this.pad.ry * dt * 700);
      this.showCargoList();
      // (a list open: its rows say what things are; the cards of what one holds and looks at would stand over them)
      if (this.listV) this.ui.items.showCards(null, null, false);
    } else {
      // seated: the workbench words go away (the cab's controls have the mark now); the hotbar stays
      this.input.lookHold = false;
      const items = this.ui.items;
      items.showCards(null, null, false);
      items.showTransfer(null);
      items.showKeys(this.driveKeys(this.seated));
      items.showHotbar(this.player.slotViews(), this.player.sel);
    }
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
        input = this.deadT >= 0 ? { steer: 0, throttle: 0, brake: 1, handbrake: 1 } : this.scripted ?? robot ?? { steer: d.steer, throttle: d.throttle, brake: d.brake, handbrake: this.handbrakeKey(dt, d.handbrake > 0.5, v) };
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
    // the stream, from the hips a step ahead of one (lower crouched), while it flows; the patch it leaves drying
    const fw = this.player.walker;
    const yaw = this.input.lookYaw;
    const from = this.peeFrom;
    from.x = fw.x + Math.cos(yaw) * 0.16;
    from.y = fw.y + (fw.crouched ? 0.55 : 0.92);
    from.z = fw.z + Math.sin(yaw) * 0.16;
    this.pee.update(dt, this.bodyS.peeing && !this.seated ? from : null, yaw, fw.y);
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
      v.view.ridden = v === this.seated;
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
      const tmp = new THREE.Vector3(pose.x - fx2 * ch.dist - o.x, pose.y + ch.height - o.y, pose.z - fz2 * ch.dist - o.z);
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
      sh.scale = this.tune.get('look.shake');
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
      const seatFov = this.rig.fov + this.tune.get('look.fov') - 68;
      if (Math.abs(cam.fov - seatFov) > 0.01) {
        cam.fov = seatFov;
        cam.updateProjectionMatrix();
      }
      this.chaseInit = false;
    } else {
      // on foot, first person
      const w = this.player.walker;
      const e = w.eye(this.eyeP);
      cam.position.set(e.x - o.x, e.y - o.y, e.z - o.z);
      this.qa.setFromAxisAngle(Y, -w.heading);
      // (the nod: down at once, back within a fifth of a second)
      this.thunk *= Math.exp(-dt * 13);
      this.qb.setFromAxisAngle(Z, w.pitch - 0.02 * this.thunk);
      cam.quaternion.copy(this.qa).multiply(this.qb).multiply(QFIX);
      // (sprinting widens the view by 4°; drunk, it sways)
      const footFov = this.tune.get('look.fov') + 4 * this.sprintB;
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
    // the thing in the hands, on foot in first person (a can held to an open filler goes to it)
    this.heldThing.set(this.player.held);
    this.heldThing.setUse(this.player.use);
    const pt = this.player.target;
    let dock: Dock | null = null;
    if (!this.seated && pt?.kind === 'filler' && pt.open && pt.v.view.fillerMouth(pt.liquid, this.dockMouth, this.dockOut)) dock = { mouth: this.dockMouth, out: this.dockOut, eye: cam.position, pour: this.player.flow ? 1 : 0 };
    else if (!this.seated && pt?.kind === 'tank' && pt.port.open && this.player.held?.kind === 'tool' && this.player.held.tool.kind === 'jerrycan' && pt.port.mouth(this.dockMouth, this.dockOut)) dock = { mouth: this.dockMouth, out: this.dockOut, eye: cam.position, pour: this.player.flow && !pt.port.pump ? 1 : 0 };
    const sc = this.player.scrub;
    this.heldThing.pin(!this.seated && sc?.hit ? this.scrubPose(sc, cam) : null);
    this.heldThing.aimSpray(!this.seated && this.player.spraying ? this.player.spraying.aim.point : null);
    this.heldThing.update(dt, cam, !this.seated && this.viewMode !== 'orbit' && this.benchB < 0.05, this.player.walker.sway, 0, dock);
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
    }
    this.env.camX = cam.position.x + o.x;
    this.env.camZ = cam.position.z + o.z;
    const sim = f?.sim;
    this.keepRainOut();
    this.devTools.beforeEnv(dt);
    this.env.update(dt, this.time, bl.a, bl.b, bl.t, this.world, sim?.vx ?? 0, sim?.vy ?? 0, sim?.vz ?? 0);
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
    if (v) {
      const d = v.sys.dash;
      const red = v.sim.spec.engine.redline;
      this.ui.showDash({
        kmh: d.kmh,
        gear: d.gearLabel,
        rpm: red > 0 ? d.rpm / red : 0,
        rpmText: `${(d.rpm / 1000).toFixed(1)}k`,
        fuel: d.fuel,
        temp: (d.coolantC - 40) / 90,
        tempText: `${d.coolantC.toFixed(0)}°`,
        battery: d.battery,
        running: d.running,
        handbrake: d.handbrake,
        lights: d.lights,
        warn: d.lamps,
        // (a motorcycle's two wheels each twice in the simulation: front and back once)
        tyres: (v.view.frame.balance ? [d.tyres[0], d.tyres[2]] : d.tyres).map((t) => (t.tread < 0 ? -1 : t.flat ? 4 : tyreStage(t.tread))),
      });
      if (d.message) this.ui.say(d.message.text.zh, 2);
    } else this.ui.showDash(null);
    if (this.place === 'garage' && this.vehicles[0] && this.assists.guide) {
      const steps = this.tutorialSteps();
      const now = steps.findIndex((s) => !s.done);
      this.ui.showList('让「方糖」跑起来', steps.map((s, i) => ({ text: s.text, done: s.done, now: i === now })));
    } else this.ui.showList(null, []);
    this.ui.showPause(!this.params.shot && !this.input.locked && !this.pad.name && !this.ui.helpShown && !this.dev?.open && !this.benchWs?.open && this.deadT < 0);
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
    switch (step.id) {
      case 'power':
        return device('gen_cord', '发电机：按住 E 拉启动绳');
      case 'scrap': {
        // something that gives scrap in the hands: to the recycler; else the nearest box of old components
        const w = this.player.walker;
        if (held && (salvageOfHeld(held).scrap ?? 0) > 0) return device('recycler', '回收台：按 E 丢进去', 0.35);
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
        return device('bench', '制作台：做一把清理铲', 0.25);
      case 'windscreen': {
        // the scraper in the hands: to the windscreen; else where the scraper lies
        if (!(held?.kind === 'tool' && held.tool.kind === 'scraper')) {
          const l = this.loose.list.find((x) => x.tool?.kind === 'scraper');
          if (l) return { x: l.x, y: l.y + l.mid + l.radius + 0.25, z: l.z, text: '拿起清理铲' };
        }
        const w = v.view.windscreenAt(new THREE.Vector3());
        if (!w) return null;
        const o = this.core.origin;
        return { x: w.x + o.x, y: w.y + o.y + 0.35, z: w.z + o.z, text: '挡风玻璃：按住左键刮' };
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
          const text = !v.view.capOpen ? (held ? `加油口盖：按 ${this.player.sel === 0 ? 2 : 1} 空出手，再按 E 打开` : '加油口盖：按 E 打开') : can ? '加油口：拿油桶对着它，按住 E' : `加油口：按 ${this.player.sel === 0 ? 2 : 1} 拿出油桶`;
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

  render(): void {
    if (this.env.shotMode) this.env.prepareShot();
    this.core.render(this.time);
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
      ...(this.garage?.telemetry() ?? {}),
      ...this.player.telemetry(),
    };
  }
}

export { partDef };
