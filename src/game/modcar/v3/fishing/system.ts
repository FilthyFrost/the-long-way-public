/**
 * The fishing system (docs/V3/plan/fishing.md): a rod in the hands is the whole of it. There is no screen of its own:
 * the game's mark, its line over the hotbar, its ring round the mark, its cards and its one line at the top are all
 * that is said, and the rest is the water, the rod, the line and the float.
 *
 *   - The rod works the use button by itself (kernel/heldUse.ts): held down, the cast is charged and a ring on the
 *     water shows where it will land; let go, the float flies out. The float bobs; a fish's shadow comes; the float
 *     dips once or twice; then it goes under with a thump, and a tap strikes (a tap before that scares it off). The
 *     splash of the bite is the colour of the fish's rarity. On the line: held, the reel winds; let go, it gives line.
 *     The ring round the mark is the line's strain, white, gold, red; past red too long, or a fish run held against,
 *     and the line parts. One stands still while a fish is on; walking away while the bait waits winds it in; the rod
 *     put away or another thing taken up and whatever was under way is over (session.ts abort).
 *   - A fish brought to one's feet is swung out of the water onto the boards or the bank beside one, where it flops a
 *     few times and lies: a thing like any other (core/v3/fishing/lite/items.ts), its card under the mark, E to pick
 *     up — into a creel in the hands if there is one, else into a free slot. Put down into the water (G, looking at
 *     it), it is released: a splash, and it is gone.
 *   - The bait is on the rod, in it (the rod holds one stack of one kind), and takes no slot: with a bait in the
 *     hands, F puts it onto the rod last fished with, else the one last in the hands (the rod's old bait comes back
 *     into the hand); a bait picked up while a rod is in a slot goes onto it by itself (the game's rule for things that
 *     hold things). A bare rod cast takes up a bait carried by itself, a word said: the kind last fished with if one
 *     has it, else the lowest tier one has (docs/V3/plan/fishing-feel.md §10). Each bait draws its own rarity's fish
 *     only; the keys down the right say which is on and its stars. Each cast takes one; a lure is kept till the line
 *     parts. A small fish caught, in the hands, goes onto the hook alive with F: the bait the waters' lords take.
 *   - The ten waters (spots.ts) are the jetties of real lakes in the game's world; at one of them the water in reach
 *     of the jetty's end is its pond (pond.ts): the fish one sees under the surface are the fish one catches, so many
 *     a day, fewer as one takes them. Anywhere else the float lands in whatever water is there and nothing bites.
 *   - The sky's moments the sky fish come with are the game's own sky (a rainbow after rain, the fog, a storm, a
 *     meteor shower, the aurora …); and every other day each water's own moment comes at its hours, the weather there
 *     drawn towards it while one is at that water (on top of the developer's dials, never in their place).
 *
 * What the angler has caught is the module's slice (log.ts); the compendium is the game's (progress). Fishing has no
 * skill, levels or experience (the user's word, 2026-11-24): only the rods, the baits and the fish differ.
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import { blueprintOf } from '../../../../core/modcar/crafting';
import { countOf, itemDef, itemModelOf, newItem, putInside, takeInside, type ItemInstance } from '../../../../core/modcar/items';
import type { WeatherState } from '../../../../core/env/weather';
import { againstOf, GOLD_AT, holdOf, LAND_AT, pullOf, RED_AT } from '../../../../core/v3/fishing/lite/fight';
import { FISH, FISH_INDEX, kgOf } from '../../../../core/v3/fishing/lite/fish';
import { BAITS, RODS } from '../../../../core/v3/fishing/lite/gear';
import { baitOfItem, canGoLive, CRATE, fishItem, fishOfItem, JUNK_ITEM, PANTRY_BAIT, rodOfItem, BOTTLE, TIER_STARS, type LiveBait } from '../../../../core/v3/fishing/lite/items';
import { bottleNote, crateContents, found, newLog, rigOf, settle, type FishLog, type Hook } from '../../../../core/v3/fishing/lite/log';
import { Pond, PondShape } from '../../../../core/v3/fishing/lite/pond';
import { fullMoon, skyMoment } from '../../../../core/v3/fishing/lite/progress';
import { appetite, inSpan, medalOf, type Rig } from '../../../../core/v3/fishing/lite/rules';
import { Session, type Landed, type SessionEvent } from '../../../../core/v3/fishing/lite/session';
import { SPOTS } from '../../../../core/v3/fishing/lite/spots';
import { MEDAL_ZH, TIERS, VARIANTS, type Cond, type Conditions, type Junk, type Tier, type Variant } from '../../../../core/v3/fishing/lite/types';
import { skyUniforms } from '../../../env/sky';
import { FISH_HUSH } from '../../../scene/fishView';
import { cloneModel, itemGlb } from '../../assets';
import type { Action } from '../../hudItems';
import { itemNow } from '../../itemTime';
import type { GameContext } from '../../kernel/context';
import type { Gauges, HeldButtons, HeldLook, HeldUse } from '../../kernel/heldUse';
import type { Loose } from '../../loose';
import { announce, cutLine, meet } from '../progress/api';
import { handFrame, type HandTarget } from '../../../character/animator';
import { FISH_DOMAIN } from './content';
import { FishBody, swimCurve } from './bend';
import { FishHold } from './hold';
import { rawFish } from './models';
import { JournalUi } from './journalUi';
import { RodView } from './rodView';
import { ViewShake } from './shake';
import { FishAudio } from './sounds';
import { shapeOf, WaterSigns, type ShadowSpec } from './waterSigns';
import { TerrainPoint } from '../../../../core/world/terrain';
import { aimOf, standOf, toLocal, toWorld, waterDepth, waterLevel, worldHeading, type Stand } from './water';

const E: Action['keys'] = ['LMB'];
const F: Action['keys'] = ['RMB'];

/** how near the end of a water's jetty one has to be to fish its pond (m) */
const NEAR = 110;
/** how far one may walk from where one cast before the bait is wound in (m), and how much further than the rod casts
 * the float may lie from one (the user's word, 2026-11-24: cast, then walk about freely; only far off is it wound in) */
const WANDER = 18;
const WANDER_LINE = 12;
/** how fast the hands bring the rod over (widths of its swing a second: −1 to 1 in about a second) */
const ROD_SWING = 12;
/** the view narrowed to this (degrees high) while a fish is on: the fight drawn closer (fishing-feel.md §4) */
const FIGHT_FOV = 50;
/** and drawn in closer still on a fish in the air */
const LEAP_FOV = 36;
/** the view as the catch comes up into the hand: level, narrowed to this (degrees high), for so many seconds of it held */
const REVEAL_FOV = 58;
const REVEAL_LOOK = 1.4;
/** seconds the catch is in the hand before its card comes up (the fish first, its numbers after) */
const CARD_AFTER = 0.6;
/** seconds a leap takes, out of the water and back in */
const LEAP_S = 1.15;
/** seconds G is held on a fish in the hands to put it back into the water */
const RELEASE_HOLD = 0.6;
/** the widths of the six shadow shapes against their length (waterSigns.ts shapeOf) */
const SHADOW_W = [0.4, 0.56, 0.16, 0.8, 0.9, 0.7];
/** a ring's colours (sRGB): the mark's own white, the strain's gold and red */
const RING_WHITE = '#f2efe8';
const RING_GOLD = '#e9c14a';
const RING_RED = '#ff6b5a';
/** the fish's stamina gauge, one colour whatever the fish (its rarity is its icon's colour), and the strain's marks and bands */
const STAMINA_COLOUR = '#5fd3a0';
/** seconds into a fight before its gauges come up */
const GAUGES_AFTER = 0.5;
/**
 * The strain's dial (docs/V3/plan/fishing-feel.md §7): its bands, safe, gold, red, with a needle over them — where the
 * line is now read at a glance, not a bar to be filled. Read on a stretched scale (shown = strain^DIAL_POW): an ordinary
 * pull sits about the middle, where its swings are seen, and the bands sit at their own strains.
 */
const DIAL_POW = 0.55;
const onDial = (t: number): number => Math.pow(Math.max(0, Math.min(1, t)), DIAL_POW);
const STRAIN_BANDS = [
  { from: 0, to: onDial(GOLD_AT), colour: '#3f9a78' },
  { from: onDial(GOLD_AT), to: onDial(RED_AT), colour: RING_GOLD },
  { from: onDial(RED_AT), to: 1, colour: RING_RED },
] as const;

/** how near water a shovel turns up worms (m), and how often a stroke there does */
const WORM_REACH = 7;
const WORM_ODDS = 0.65;
/** the water whose lord has the Night Heron's sheet: the third (its index among the waters) */
const HERON_LORD = 2;

/** a bottle knows which water it came out of (its lord's habits are on the note) */
declare module '../../../../core/modcar/items' {
  interface ItemState {
    bottle?: { s: number };
  }
}

/** a thing thrown out of the water onto the boards: from where, to where, how far along, its model meanwhile */
interface Flying {
  item: ItemInstance;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  yaw: number;
  obj: THREE.Object3D | null;
  big: boolean;
}

/** the fish on the line as it is seen fighting at the surface: its bending body, and what it is doing for the eye */
interface Live {
  uid: number;
  body: FishBody;
  /** its length (m), seconds since it was hooked, since its leap began (−1: none), its roll onto its side */
  len: number;
  t: number;
  jumpT: number;
  roll: number;
  /** seconds to its next splash, its swim's phase */
  splashT: number;
  beat: number;
  /** a turn's heave and roll at the surface (1 at the turn, dying away), and which way it rolls */
  flash: number;
  flashDir: number;
  /** where it was last frame (render space; NaN: not yet), and seconds to its wake's next streaks; its churn's count */
  px: number;
  pz: number;
  wakeT: number;
  churnN: number;
  /** close in, its surges across the line (m from where it is, eased toward surgeTo; seconds held there, to the next;
   * the way the last went), and the offset they put it at (render space: the line goes to it there) */
  surge: number;
  surgeV: number;
  surgeTo: number;
  surgeHold: number;
  surgeT: number;
  lastSurge: number;
  offX: number;
  offZ: number;
  /** its thrash bursts at the surface (docs/V3/plan/fishing-feel.md §8): how much of one is left (1 … 0), seconds to the next, which way it rolls */
  burst: number;
  burstT: number;
  burstSide: number;
}

/** a fish just landed on the boards, flopping */
interface Flop {
  loose: Loose;
  t: number;
  dur: number;
  phase: number;
  /** how hard it flops (a small fish quick and high, a big one slow and heavy) */
  k: number;
  /** its own body bending in place of the stiff one while it flops, and the stiff one (bend.ts) */
  bent?: FishBody | null;
  orig?: THREE.Object3D | null;
}

const tmpL = { x: 0, z: 0 };
const tmpW = { x: 0, z: 0 };

export class Fishing implements System<GameContext> {
  readonly id = 'fishing';
  readonly budget = { cpuMs: 0.8 };
  log: FishLog = newLog();

  /** the waters' stands in this world (undefined: not looked for yet; null: not in this world) */
  private stands: (Stand | null | undefined)[] = SPOTS.map(() => undefined);
  private standsSeed = NaN;
  private readonly ponds = new Map<number, Pond>();
  /** the water one is at (−1: none of the ten: a wild water, or no water), its stand, its pond, and the session on it */
  spot = -1;
  stand: Stand | null = null;
  pond: Pond | null = null;
  session: Session | null = null;
  /** a wild water's pond (a lake or the sea that is none of the ten): which table of fish, where it was made */
  private wild: { key: string; table: number } | null = null;
  private findT = 0;
  private freeAt = { x: NaN, z: NaN };

  /** the rod the session is the rod of (its uid: the rod last fished with), the hook it was cast with, the rig the rules read */
  private rodUid = '';
  /** the rod last in the hands (its uid): where a bait goes with F when none has been fished with */
  private heldRodUid = '';
  private hook: Hook = null;
  private rig: Rig = rigOf(0, null, newLog());
  private castFrom = { x: 0, z: 0 };
  private sinceCast = Infinity;
  private time = 0;
  private readonly cond: Conditions = { day: 0, hour: 0, rain: false, clear: true, fog: false, storm: false, snow: false, events: new Set<Cond>() };
  /** the developer's moment: which water's, until when (world seconds) */
  forced: { spot: number; until: number } | null = null;
  private momentNow = false;

  /** thrown onto the boards, flopping there, and the uids of what the module set down itself (not put back by hand) */
  private readonly flying: Flying[] = [];
  private readonly flops: Flop[] = [];
  /** the fish on the line, seen fighting at the surface */
  private live: Live | null = null;
  /** the catch in the hands (docs/V3/plan/fishing-fight.md §6): the thing itself, its kind, and how long G has been held on it; and its view */
  private holding: { item: ItemInstance; fish: number; g: number } | null = null;
  private hold: FishHold | null = null;
  /** the rod pulled over (docs/V3/plan/fishing-fight.md §4): by the keys (eased), by the mouse (where it was swiped to); both, −1 … 1 */
  private steerKey = 0;
  private steerMouse = 0;
  steer = 0;
  /** the line going out under the fish's pull (the reel's drag sings), m a second */
  private lineOut = 0;
  /** seconds wound against a fish too strong to come in, and seconds the rod pulled the wrong way (the words under the dial) */
  private noGainT = 0;
  private wrongT = 0;
  /** the dial's needle kicked up by a jolt on the line (the strike, a turn, a bolt, a leap), dying away; how fast the line comes in (m/s, + out) */
  private needleKick = 0;
  private distRate = 0;
  private lastRateDist = 0;
  /** the reel winding now, 0 … 1 (the left hand cranks it) */
  private reeling = 0;
  private lastDist = 0;
  /** the view's heading last frame (how fast it turns) */
  private lastYaw = 0;
  private readonly thrown = new Set<string>();
  private releaseT = 0;

  // ---------------------------------------------------------------- the views
  private rod: RodView | null = null;
  private viewsWarm = false;
  /** the knocks the fish gives the view (shake.ts) */
  private readonly shake = new ViewShake();
  private signs: WaterSigns | null = null;
  readonly sounds = new FishAudio();
  private readonly origin = { x: NaN, y: NaN, z: NaN };
  private signT = new Map<number, number>();
  private lastSigns = 0;
  private readonly floatV = new THREE.Vector3();
  private readonly toV = new THREE.Vector3();
  private readonly ringV = new THREE.Vector3();

  /** the weather drawn towards a water's moment: the dials' own function first (env.tune), then this */
  private prevTune: ((w: WeatherState) => void) | null = null;
  private skyTuned = false;
  private readonly tuneFn = (w: WeatherState): void => {
    this.prevTune?.(w);
    if (this.momentNow && this.spot >= 0) this.shapeWeather(w);
  };

  private ctx: GameContext | null = null;
  /** ?fish=<n> on the address: off to that water with a rod, once the world is there */
  private wantSpot = -1;
  private settleT = -1;

  // ================================================================ the uses in the hands

  /** a rod (kernel/heldUse.ts): the use button casts, strikes and reels */
  readonly rodUse: HeldUse = {
    busy: (it) => !!this.session && this.session.phase !== 'idle' && this.rodUid === it.uid,
    still: (it) => !!this.session && this.session.phase === 'fight' && this.rodUid === it.uid,
    buttons: (it, _slot, b, dt) => this.rodButtons(it, b, dt),
    acts: (it, _slot, _aimed, out) => this.rodActs(it, out),
    keys: (it, _slot, out) => this.rodKeys(it, out),
    ring: (it) => this.rodRing(it),
    gauges: (it) => this.rodGauges(it),
    look: (it) => this.rodLook(it),
    shows: (it) => (this.holding && this.rodUid === it.uid && this.hold?.phase === 'hold' && this.hold.t > CARD_AFTER ? this.holding.item : null),
    quiet: (it) => this.rodUid === it.uid && (this.session?.phase === 'fight' || !!this.holding),
    hidesMark: (it) => this.rodUid === it.uid && (this.session?.phase === 'fight' || !!this.holding),
    takesQ: (it) => !!this.holding && this.rodUid === it.uid,
    drop: (it) => this.dropCatch(it),
    draws: () => true,
  };

  /** a bait: F puts it onto the rod last fished with (else the one last in the hands, else the first in the hotbar) */
  readonly baitUse: HeldUse = {
    takesF: true,
    buttons: (it, slot, b) => {
      if (!b.takeEdge) return 0;
      this.baitOnRod(it, slot);
      return 2;
    },
    keys: (_it, slot, out) => {
      const rs = this.targetRod(slot);
      const rod = rs >= 0 ? this.ctx?.player.slots[rs] : null;
      out.push(rod?.kind === 'item' ? { keys: F, text: '挂上' } : { keys: F, text: '挂上', off: true, why: '没有鱼竿' });
    },
  };

  /**
   * a fish caught: the right button puts a small one onto the rod's hook alive (the same rod a bait would go onto); Q
   * with water ahead lets it go back in (no water there: the hands' own put-down)
   */
  readonly fishUse: HeldUse = {
    buttons: (it, slot, b) => (b.takeEdge && this.liveOnHook(it, slot) ? 2 : 0),
    takesQ: (it) => fishOfItem(it.item) >= 0 && this.waterNear(),
    drop: (it, slot) => this.fishBack(it, slot),
    keys: (it, slot, out) => {
      const i = fishOfItem(it.item);
      if (i >= 0 && canGoLive(i) && this.targetRod(slot) >= 0) out.push({ keys: F, text: '当活饵' });
      if (i >= 0 && this.waterNear()) out.push({ keys: ['Q'], text: '放回水里' });
    },
  };

  /** a drift bottle: F opens it */
  readonly bottleUse: HeldUse = {
    takesF: true,
    buttons: (it, slot, b) => {
      if (!b.takeEdge) return 0;
      this.openBottle(it, slot);
      return 2;
    },
    keys: (_it, _slot, out) => void out.push({ keys: F, text: '打开' }),
  };

  // ================================================================ the frame

  setup(ctx: GameContext): void {
    this.ctx = ctx;
    if (typeof location !== 'undefined') {
      const f = new URLSearchParams(location.search).get('fish');
      if (f !== null && /^\d+$/.test(f)) this.wantSpot = Math.min(SPOTS.length - 1, Number(f));
    }
    ctx.events.on('game:new', () => {
      this.log = newLog();
      this.ponds.clear();
    });
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    if (typeof document === 'undefined') return;
    this.rod = new RodView();
    this.rod.group.visible = false;
    ctx.core.scene.add(this.rod.group);
    this.signs = new WaterSigns();
    ctx.core.scene.add(this.signs.group);
    this.hold = new FishHold();
    ctx.core.scene.add(this.hold.group);
    // the journal: a page of the Tab screen
    this.journal = new JournalUi(ctx, () => this.log);
    // worms where a shovel turns the ground over by a water
    ctx.dug?.push(this.onDug);
    // her hands on the rod
    if (ctx.her) ctx.her.handsFor = (cam) => this.rodHands(cam);
  }

  private readonly handR: HandTarget = { pos: new THREE.Vector3(), rot: new THREE.Quaternion(), grip: 'bar', w: 1, hold: { kind: 'cyl', c: new THREE.Vector3(), axis: new THREE.Vector3(), r: 0.0165 } };
  private readonly handL: HandTarget = { pos: new THREE.Vector3(), rot: new THREE.Quaternion(), grip: 'pinch', w: 0, pole: new THREE.Vector3(-0.6, -1, 0).normalize() };
  private readonly bothHands = { l: this.handL, r: this.handR };
  private readonly oneHand = { r: this.handR };
  /** how much the left hand is on the reel's handle (0 … 1) */
  private windHand = 0;
  private readonly hv = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

  /**
   * Her hands on the rod as it is drawn (docs/V3/plan/finish.md §九: 握竿、摇轮用她的手): the right round the rear grip,
   * its fingers over the top; the left on the reel handle's knob while it winds, else under the fore grip. Null: no
   * rod is drawn in her hands.
   */
  private rodHands(cam: THREE.Camera): { l?: HandTarget; r?: HandTarget } | null {
    const rv = this.rod;
    if (!rv || !rv.group.visible) return null;
    const e = cam.matrixWorld.elements;
    const [right, up, palm, fingers, fwd, t] = this.hv;
    right.set(e[0], e[1], e[2]).normalize();
    up.set(e[4], e[5], e[6]).normalize();
    fwd.set(-e[8], -e[9], -e[10]).normalize();
    const along = rv.gripAxis;
    // the right hand: the palm on the grip's right side turned a little under it, the fingers over its top
    palm.copy(right).multiplyScalar(-0.6).addScaledVector(up, 0.5).normalize();
    fingers.crossVectors(along, palm).normalize();
    const r = this.handR;
    r.pos.copy(rv.gripAt).addScaledVector(palm, -0.03).addScaledVector(fingers, -0.045);
    r.rot!.copy(handFrame('r', fingers, palm, palm));
    r.hold!.c.copy(rv.gripAt);
    r.hold!.axis!.copy(along);
    // the left: winding, the knob between finger and thumb (the palm toward the reel's face) — coming to it as the
    // winding begins, letting go as it stops; else it is free (the fore grip is further across her than her left arm
    // reaches with the rod held out to the right: one hand holds it while it waits)
    const l = this.handL;
    const want = rv.winding > 0.02 ? 1 : 0;
    this.windHand += (want - this.windHand) * (1 - Math.exp(-(want ? 14 : 5) / 60));
    if (this.windHand < 0.03) return this.oneHand;
    palm.copy(rv.reelOut).multiplyScalar(-1);
    fingers.copy(up).multiplyScalar(0.45).addScaledVector(fwd, 0.85).addScaledVector(palm, -fwd.dot(palm) * 0.85).normalize();
    l.pos.copy(rv.knobAt).addScaledVector(palm, -0.035).addScaledVector(fingers, -0.075);
    l.rot!.copy(handFrame('l', fingers, palm, palm));
    l.w = this.windHand;
    void t;
    void rv.foreAt;
    return this.bothHands;
  }

  journal: JournalUi | null = null;
  /** worms dug so far (the first are said) */
  private wormsDug = 0;

  /**
   * A shovel went into bare ground (GameContext.dug): within WORM_REACH of water there are worms in it, more often
   * than not — a few, lying where the shovel went in (docs/V3/plan/finish.md §九: 蚯蚓：拿铁锹对着岸边的土挖). One is
   * never without bait where there is water and a shovel.
   */
  private readonly onDug = (x: number, y: number, z: number): void => {
    const ctx = this.ctx;
    const world = ctx?.world;
    // (the bank's own soil: not the bed of the water itself)
    if (!ctx || !world || waterDepth(world, x, z) > 0.05) return;
    let wet = false;
    for (let k = 0; k < 36 && !wet; k++) {
      const a = (k / 12) * Math.PI * 2;
      const r = WORM_REACH * (k < 12 ? 0.35 : k < 24 ? 0.7 : 1);
      if (waterDepth(world, x + Math.cos(a) * r, z + Math.sin(a) * r) > 0.05) wet = true;
    }
    if (!wet || Math.random() > WORM_ODDS) return;
    const n = 2 + Math.floor(Math.random() * 3);
    const l = ctx.loose.addItem(newItem('bait_worm', { n }), x, y + 0.08, z, Math.random() * Math.PI * 2);
    ctx.loose.drop(l);
    this.sounds.play('click');
    if (this.wormsDug === 0) announce(ctx, '土里翻出了蚯蚓', 2.2);
    this.wormsDug += n;
  };

  step(dt: number, ctx: GameContext): void {
    this.time += dt;
    this.sinceCast += dt;
    this.sounds.attach(ctx.audio?.context ?? null, ctx.audio?.output ?? null);
    this.goWanted(ctx);
    this.findWater(ctx, dt);
    this.conditions(ctx);
    const s = this.session;
    const rod = this.rodInHands(ctx);
    if (rod) this.heldRodUid = rod.uid;
    if (s) {
      // the rod gone from the hands: whatever was under way is over (a fish held up goes down at one's feet)
      if (s.phase !== 'idle' && (!rod || rod.uid !== this.rodUid)) {
        if (this.holding) this.putHeldDown(ctx);
        s.abort();
      }
      const st = this.stand!;
      const w = ctx.player.walker;
      if (rod) {
        toLocal(st, w.x, w.z, tmpL);
        // (the cast leaves from where one stands; the fight runs between there and the fish)
        if (s.phase !== 'fight') {
          s.angler.x = tmpL.x;
          s.angler.z = tmpL.z;
        }
        s.aim = aimOf(st, w.heading);
        // (how fast the view turns: turned hard while a fish is at a still bait, it is scared off)
        const turn = Math.abs(Math.atan2(Math.sin(w.heading - this.lastYaw), Math.cos(w.heading - this.lastYaw)));
        s.jiggle = dt > 0 ? turn / dt : 0;
        this.lastYaw = w.heading;
        if (s.phase === 'idle' || s.phase === 'charge') this.setHook(rod);
        if (s.phase === 'wait' && (Math.hypot(w.x - this.castFrom.x, w.z - this.castFrom.z) > WANDER || Math.hypot(s.float.x - tmpL.x, s.float.z - tmpL.z) > this.rig.rod.cast + WANDER_LINE)) s.reelIn();
      }
      const pond = this.pond;
      if (pond) {
        const f = s.float;
        pond.step(dt, ctx.clock.worldSeconds / 60, this.cond.day, s.phase === 'wait' && f.wet ? f : null, { active: this.momentNow });
        if (this.spot >= 0) this.keepPond(pond);
      }
      s.step(dt, this.cond);
      this.keepOffDeck(ctx, s);
      for (const e of s.events) this.onEvent(ctx, e);
      s.events.length = 0;
    }
    this.stepFlying(ctx, dt);
    this.releaseT += dt;
    if (this.releaseT > 0.3) {
      this.releaseT = 0;
      this.lookForReleased(ctx);
    }
    // (the line going out under the fish's pull: the reel's drag sings with it)
    const fd = s?.phase === 'fight' && s.fight ? s.fight.dist : 0;
    const out = fd > 0 && this.lastDist > 0 ? Math.max(0, (fd - this.lastDist) / Math.max(1e-3, dt)) : 0;
    this.lastDist = fd;
    this.lineOut += (out - this.lineOut) * Math.min(1, dt * 8);
    this.needleKick *= Math.exp(-dt * 3.5);
    const rate = fd > 0 && this.lastRateDist > 0 ? (fd - this.lastRateDist) / Math.max(1e-3, dt) : 0;
    this.lastRateDist = fd;
    this.distRate += (rate - this.distRate) * Math.min(1, dt * 3);
    // (wound against a fish that will not come yet; the rod pulled its way: said under the dial after a moment)
    const ff = s?.phase === 'fight' ? s.fight : null;
    if (s && ff) {
      const swims = ff.phase === 'swim' || ff.phase === 'run' || ff.phase === 'rest';
      this.noGainT = s.held && swims && ff.stamina > 0.35 && ff.dist - holdOf(ff) < 0.6 ? this.noGainT + dt : 0;
      this.wrongT = swims && againstOf(ff, this.steer) < -0.2 ? this.wrongT + dt : 0;
    } else this.noGainT = this.wrongT = 0;
    const reeling = s?.phase === 'fight' && s.held ? 1 : s?.phase === 'retrieve' ? 0.8 : s?.phase === 'wait' && s.lureSpeed > 0.05 ? Math.min(1, s.lureSpeed / 1.5) : 0;
    this.reeling = reeling;
    this.sounds.update(dt, s?.phase === 'fight' ? (s.fight?.tension ?? 0) : 0, reeling, Math.min(1, this.lineOut / 3));
  }

  lateUpdate(dt: number, ctx: GameContext): void {
    this.journal?.update();
    this.keepTune(ctx);
    this.afterSky(ctx);
    this.hush();
    if (!this.rod || !this.signs) return;
    const o = ctx.core.origin;
    if (!Number.isNaN(this.origin.x) && (o.x !== this.origin.x || o.y !== this.origin.y || o.z !== this.origin.z)) {
      this.signs.rebase(o.x - this.origin.x, o.y - this.origin.y, o.z - this.origin.z);
      this.hold?.rebase(o.x - this.origin.x, o.y - this.origin.y, o.z - this.origin.z);
    }
    this.origin.x = o.x;
    this.origin.y = o.y;
    this.origin.z = o.z;
    // (the knocks the fish gives the view and its tremble with the line strained past the gold: before the rod is
    // placed by the eye, the hands going with it)
    const sf = this.session?.phase === 'fight' ? this.session.fight : null;
    // (the body leans into the pull: the view drawn a little after the rod as it goes over, the fish's tugs in it)
    const lean = sf ? this.rod.swayNow : 0;
    this.shake.lean(-0.035 * lean, -0.022 * lean, dt);
    if (!ctx.seated) this.shake.apply(ctx.core.camera, dt, sf ? (sf.tension - GOLD_AT) / (1 - GOLD_AT) : 0);
    this.drawRod(ctx, dt);
    this.drawWater(ctx, dt);
    this.drawFlying(ctx);
    this.drawFlops(dt);
    this.drawLive(ctx, dt);
    this.drawHold(ctx, dt);
    this.signs.update(dt);
  }

  /** the game's own schools of fish kept out of the pond one is at: every shadow in it is a fish of the pond */
  private hush(): void {
    const st = this.stand;
    if (!this.pond || !st) {
      if (FISH_HUSH.length) FISH_HUSH.length = 0;
      return;
    }
    const h = (FISH_HUSH[0] ??= { x: 0, z: 0, r: 0 });
    h.x = st.x + st.fx * 22;
    h.z = st.z + st.fz * 22;
    h.r = 52;
    FISH_HUSH.length = 1;
  }

  dispose(): void {
    FISH_HUSH.length = 0;
    this.journal?.dispose();
    this.journal = null;
    const at = this.ctx?.dug?.indexOf(this.onDug) ?? -1;
    if (at >= 0) this.ctx!.dug!.splice(at, 1);
    if (this.ctx?.her) this.ctx.her.handsFor = null;
    this.dropLive();
    this.hold?.dispose();
    this.rod?.group.removeFromParent();
    this.signs?.group.removeFromParent();
  }

  telemetry(): Record<string, unknown> {
    const s = this.session;
    const pond = this.pond;
    return {
      spot: this.spot,
      water: this.spot >= 0 ? SPOTS[this.spot].zh : this.wild ? `野外的水（${SPOTS[this.wild.table].zh}的鱼）` : '',
      wild: this.wild?.table ?? -1,
      phase: s?.phase ?? '',
      tension: s?.fight ? Math.round(s.fight.tension * 100) / 100 : 0,
      stamina: s?.fight ? Math.round(s.fight.stamina * 100) / 100 : 0,
      fphase: s?.fight?.phase ?? '',
      dir: s?.fight?.dir ?? 0,
      steer: Math.round(this.steer * 100) / 100,
      dist: s?.fight ? Math.round(s.fight.dist * 10) / 10 : 0,
      landable: !!s?.fight?.landable,
      live: !!this.live,
      held: !!this.holding,
      heldKind: this.holding ? FISH[this.holding.fish].id : '',
      holdPhase: this.hold?.phase ?? '',
      holdBend: this.hold ? Math.round(this.hold.bend * 100) / 100 : 0,
      hook: this.hook ? (this.hook.kind === 'live' ? `live:${FISH[this.hook.fish].id}` : BAITS[this.hook.bait].id) : '',
      fish: pond?.fish.length ?? 0,
      moment: this.momentNow,
      flying: this.flying.length,
      flops: this.flops.length,
      casts: this.log.stats.casts,
      catches: this.log.stats.catches,
    };
  }

  // ================================================================ where one is

  /** the stand of a water in the world now (looked for once a world) */
  standAt(ctx: GameContext, spot: number): Stand | null {
    const world = ctx.world;
    if (!world) return null;
    if (ctx.params.seed !== this.standsSeed) {
      this.standsSeed = ctx.params.seed;
      this.stands = SPOTS.map(() => undefined);
    }
    let st = this.stands[spot];
    if (st === undefined) {
      st = SPOTS[spot].seed === ctx.params.seed ? standOf(world, spot) : null;
      this.stands[spot] = st;
    }
    return st;
  }

  /** which water one is at; the session is on it (a free one where one stands, at no water of the ten) */
  private findWater(ctx: GameContext, dt: number): void {
    this.findT -= dt;
    const busy = !!this.session && this.session.phase !== 'idle';
    if (busy || this.findT > 0) return;
    this.findT = 0.5;
    const world = ctx.world;
    if (!world) return;
    const w = ctx.player.walker;
    let best = -1;
    let bestD = NEAR;
    for (let i = 0; i < SPOTS.length; i++) {
      if (SPOTS[i].seed !== ctx.params.seed) continue;
      const st = this.standAt(ctx, i);
      if (!st) continue;
      const d = Math.hypot(w.x - st.x, w.z - st.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      if (best !== this.spot || !this.session) this.useWater(ctx, best);
      return;
    }
    // none of the ten: the water in front of one is a wild water, stocked with the fish of the ten's most like it (the sea's,
    // or the inland ones by how far down the road it is); no water there: the float lands where it may and nothing bites
    if (!this.rodInHands(ctx)) return;
    // (a wild water stays while one keeps near it; where there was no water, it is looked for again every few seconds)
    const near = this.spot === -1 && !!this.session && Math.hypot(w.x - this.freeAt.x, w.z - this.freeAt.z) < 40;
    if (near && (this.pond || this.time - this.dryAt < 2)) return;
    this.freeAt.x = w.x;
    this.freeAt.z = w.z;
    this.dryAt = this.time;
    // the water before one: straight ahead first, then to either side, out to 30 m
    let kind = 0;
    let lv = NaN;
    let fx = Math.cos(w.heading);
    let fz = Math.sin(w.heading);
    look: for (const da of [0, 0.5, -0.5, 1, -1]) {
      const ux = Math.cos(w.heading + da);
      const uz = Math.sin(w.heading + da);
      for (const d of [4, 8, 12, 17, 23, 30]) {
        const x = w.x + ux * d;
        const z = w.z + uz * d;
        if (waterDepth(world, x, z) < 0.5) continue;
        world.shape(x, z, this.tp);
        kind = this.tp.wkind;
        lv = this.tp.wl;
        fx = ux;
        fz = uz;
        break look;
      }
    }
    const st: Stand = { spot: -1, x: w.x, y: w.y, z: w.z, fx, fz, rx: -fz, rz: fx, level: Number.isFinite(lv) ? lv : w.y - 0.6, shape: new PondShape(() => -1) };
    let pond: Pond;
    if (kind > 0) {
      const table = kind === 3 ? 7 : FRESH[Math.max(0, Math.min(FRESH.length - 1, Math.floor(world.spine.sAtX(w.x) / WILD_STEP)))];
      const key = `${table}:${Math.round(w.x / 80)},${Math.round(w.z / 80)}`;
      st.shape = new PondShape((x, z) => waterDepth(world, st.x + st.fx * z + st.rx * x, st.z + st.fz * z + st.rz * x));
      pond = new Pond(table, st.shape);
      pond.wild = true;
      pond.salt = Math.abs(Math.round(w.x / 80) * 7919 + Math.round(w.z / 80) * 104729) % 100000;
      pond.stock(this.cond.day);
      this.wild = { key, table };
    } else {
      pond = new Pond(0, st.shape);
      this.wild = null;
    }
    this.spot = -1;
    this.stand = st;
    this.pond = kind > 0 ? pond : null;
    this.session = this.newSession(ctx, st, pond);
  }

  private readonly tp = new TerrainPoint();
  private dryAt = -Infinity;

  private useWater(ctx: GameContext, spot: number): void {
    const st = this.standAt(ctx, spot)!;
    let pond = this.ponds.get(spot);
    if (!pond) {
      pond = new Pond(spot, st.shape);
      const saved = this.log.ponds[SPOTS[spot].id];
      if (saved && saved.day === this.cond.day) pond.stock(saved.day, saved.taken, saved.refills);
      else pond.stock(this.cond.day);
      this.ponds.set(spot, pond);
    }
    this.spot = spot;
    this.stand = st;
    this.pond = pond;
    this.wild = null;
    this.session = this.newSession(ctx, st, pond);
    this.signT.clear();
  }

  private newSession(ctx: GameContext, st: Stand, pond: Pond): Session {
    const world = ctx.world!;
    // (no level handed over: the twitch is there from the first cast)
    const s = new Session(pond, { rig: () => this.rig }, (pond.spot + 1) * 7919 + Math.floor(ctx.clock.worldSeconds));
    s.fan = false;
    s.depthAt = (x, z) => waterDepth(world, st.x + st.fx * z + st.rx * x, st.z + st.fz * z + st.rz * x);
    return s;
  }

  /** the pond's day in the save: what has been taken out of it, so a page opened again finds it as it was */
  private keepPond(pond: Pond): void {
    const id = SPOTS[pond.spot].id;
    const saved = this.log.ponds[id];
    if (saved && saved.day === pond.day && saved.taken.length === pond.taken.size && saved.refills === pond.refills) return;
    this.log.ponds[id] = { day: pond.day, taken: [...pond.taken], refills: pond.refills };
  }

  /** the day a pond's stock is of: from five in the morning */
  private fishDay(ctx: GameContext): number {
    return ctx.clock.hour >= 5 ? ctx.clock.day : ctx.clock.day - 1;
  }

  // ================================================================ the rod

  /** the rod in the hands, or null */
  private rodInHands(ctx: GameContext): ItemInstance | null {
    const h = ctx.player.held;
    return h?.kind === 'item' && rodOfItem(h.item.item) >= 0 ? h.item : null;
  }

  /** a slot other than `not` with a rod in it (the first in the hotbar's order); −1: none */
  private rodSlot(not: number): number {
    const p = this.ctx?.player;
    if (!p) return -1;
    for (let i = 0; i < p.slots.length; i++) {
      if (i === not) continue;
      const h = p.slots[i];
      if (h?.kind === 'item' && rodOfItem(h.item.item) >= 0) return i;
    }
    return -1;
  }

  /**
   * The rod a bait (or a small fish) in the hands goes onto with F: the rod last fished with, else the one last in the
   * hands, else the first in the hotbar — its slot, other than `not` (the hands' own); −1: no rod in the hotbar.
   */
  private targetRod(not: number): number {
    const p = this.ctx?.player;
    if (!p) return -1;
    for (const uid of [this.rodUid, this.heldRodUid]) {
      if (!uid) continue;
      for (let i = 0; i < p.slots.length; i++) {
        const h = p.slots[i];
        if (i !== not && h?.kind === 'item' && h.item.uid === uid && rodOfItem(h.item.item) >= 0) return i;
      }
    }
    return this.rodSlot(not);
  }

  /**
   * The bait a bare rod takes up as it is cast (docs/V3/plan/fishing-feel.md §10): of those carried — in the hotbar,
   * or in a thing there that holds things, not on another rod — the kind last fished with, else the lowest tier (the
   * hotbar's order among equals). Null: no bait carried at all.
   */
  private baitCarried(): { item: ItemInstance; slot: number; box: ItemInstance | null } | null {
    const p = this.ctx?.player;
    if (!p) return null;
    const found: { item: ItemInstance; slot: number; box: ItemInstance | null }[] = [];
    for (let s = 0; s < p.slots.length; s++) {
      const h = p.slots[s];
      if (h?.kind !== 'item' || rodOfItem(h.item.item) >= 0) continue;
      if (baitOfItem(h.item.item) >= 0 && countOf(h.item) > 0) found.push({ item: h.item, slot: s, box: null });
      for (const x of h.item.inside ?? []) if (baitOfItem(x.item) >= 0 && countOf(x) > 0) found.push({ item: x, slot: s, box: h.item });
    }
    let best: (typeof found)[number] | null = null;
    let key = Infinity;
    for (const c of found) {
      const b = BAITS[baitOfItem(c.item.item)];
      const k = b.id === this.log.lastBait ? -1 : b.tier;
      if (k < key) {
        key = k;
        best = c;
      }
    }
    return best;
  }

  /** a bare rod cast: the bait carried (baitCarried) goes onto it, the whole stack, and is named in a word; false: none carried */
  private autoBait(rod: ItemInstance): boolean {
    const ctx = this.ctx;
    const c = this.baitCarried();
    // (none carried: a loaf or a cob in the hands does)
    if (ctx && !c) return this.pantryBait(rod);
    if (!ctx || !c) return false;
    const now = itemNow();
    const p = ctx.player;
    const name = itemDef(c.item.item).name.zh;
    if (c.box) {
      // (out of the thing it rides in; what the rod does not take, back into it, or into the hands)
      const at = c.box.inside?.indexOf(c.item) ?? -1;
      const taken = at >= 0 ? takeInside(c.box, at, now) : null;
      if (!taken) return false;
      if (putInside(rod, taken, now) > 0 && putInside(c.box, taken, now) > 0) p.receive({ kind: 'item', item: taken });
    } else if (putInside(rod, c.item, now) <= 0) p.slots[c.slot] = null;
    if (!this.hookOf(rod)) return false;
    this.sounds.play('click');
    announce(ctx, `挂上了${name}`, 1.4);
    return true;
  }

  /**
   * No bait carried and a bare rod cast (docs/V3/plan/finish.md §九: bread and maize do as a common bait): a loaf of
   * bread or a cob of maize in the hands' slots is pulled apart into pinches of bait — the rules' common bait under its
   * own name — and they go onto the hook; false: neither is carried
   */
  private pantryBait(rod: ItemInstance): boolean {
    const ctx = this.ctx;
    const p = ctx?.player;
    if (!ctx || !p) return false;
    for (let s = 0; s < p.slots.length; s++) {
      const h = p.slots[s];
      if (h?.kind !== 'item') continue;
      const made = PANTRY_BAIT[h.item.item];
      if (!made) continue;
      const bait = newItem(made.bait, { n: made.n });
      if (putInside(rod, bait, itemNow()) > 0 || !this.hookOf(rod)) continue;
      // (one loaf, one cob: the rest of a stack stays where it is)
      const n = countOf(h.item);
      if (n > 2) h.item.n = n - 1;
      else if (n === 2) delete h.item.n;
      else p.slots[s] = null;
      this.sounds.play('click');
      announce(ctx, `掰了些${itemDef(h.item.item).name.zh}，挂上了${itemDef(made.bait).name.zh}`, 1.8);
      return true;
    }
    return false;
  }

  /** a bait as the keys down the right say it: its name, how many, and its rarity's stars in its colour */
  private baitLabel(b: ItemInstance): string {
    const d = BAITS[baitOfItem(b.item)];
    if (!d) return '';
    const n = countOf(b);
    return `${itemDef(b.item).name.zh}${d.lure || n <= 1 ? '' : ` ×${n}`} <span style="color:${TIER_COLOUR[d.tier] ?? RING_WHITE}">${'★'.repeat(TIER_STARS[d.tier as Tier] ?? 1)}</span>`;
  }

  /** what is on a rod's hook, as the keys say it: a bait (baitLabel), or a fish alive (its lord's stars, if it is a lord's bait) */
  private hookLabel(rod: ItemInstance, hook: NonNullable<Hook>): string {
    if (hook.kind === 'bait') {
      const b = rod.inside?.[0];
      return b ? this.baitLabel(b) : BAITS[hook.bait].zh;
    }
    const f = FISH[hook.fish];
    const lord = FISH.find((x) => x.live === f.id);
    return `活的${f.zh}${lord ? ` <span style="color:${TIER_COLOUR[lord.tier]}">${'★'.repeat(TIER_STARS[lord.tier])}</span>` : ''}`;
  }

  /** what is on a rod's hook: a fish alive, else its bait, else nothing */
  hookOf(rod: ItemInstance): Hook {
    const live = rod.state?.rod?.live;
    if (live) {
      const f = FISH_INDEX.get(live.f);
      if (f !== undefined) return { kind: 'live', fish: f };
    }
    const b = rod.inside?.[0];
    if (b && countOf(b) > 0) {
      const i = baitOfItem(b.item);
      if (i >= 0) return { kind: 'bait', bait: i };
    }
    return null;
  }

  private setHook(rod: ItemInstance): void {
    const hook = this.hookOf(rod);
    const r = rodOfItem(rod.item);
    this.hook = hook;
    this.rig = rigOf(r, hook, this.log);
  }

  private rodButtons(it: ItemInstance, b: HeldButtons, dt: number): number {
    const s = this.session;
    if (!s) return 0;
    // (the catch in the hands: the buttons are its)
    if (s.phase === 'reveal' && this.holding) return this.holdButtons(b, dt);
    if (s.phase === 'idle') {
      // the button let go after the cast was over (a fish landed while it was held, the float wound in by it): the
      // session is told, or it would take the button for still down and never see the next press — no charge, no cast
      if (!b.use && s.held) s.press(false);
      // (the mark on a thing lying about, a door: the hands' own use — a fish to pick up)
      if (b.aimed || !b.useEdge) return 0;
      if (s.held) s.press(false);
      // (a bare rod takes up a bait carried by itself; none carried at all: said so)
      if (!this.hookOf(it) && !this.autoBait(it)) {
        this.ctx?.player.flashWhy('竿上没饵');
        return 1;
      }
      this.rodUid = it.uid;
      this.setHook(it);
    }
    if (s.phase === 'fight') this.steerRod(s, b, dt);
    else {
      this.steerKey = this.steerMouse = this.steer = 0;
      s.steer = 0;
    }
    s.press(b.use);
    return 1;
  }

  /**
   * The rod pulled over against the fish (docs/V3/plan/fishing-fight.md §4): A/D at once (eased over a few frames),
   * the mouse a swipe — the rod stays where it was swiped to; a key pressed takes over from it.
   */
  private steerRod(s: Session, b: HeldButtons, dt: number): void {
    const key = Math.max(-1, Math.min(1, b.side));
    this.steerKey = key;
    this.steerMouse = Math.max(-1, Math.min(1, this.steerMouse + b.pointerX / 160));
    if (key !== 0) this.steerMouse *= Math.max(0, 1 - dt * 6);
    // (the rod comes over slowly, as DREADMOOR's does: about a second from one side to the other)
    const want = Math.max(-1, Math.min(1, this.steerKey + this.steerMouse));
    const stepK = ROD_SWING * dt;
    this.steer += Math.max(-stepK, Math.min(stepK, want - this.steer));
    s.steer = this.steer;
  }

  /** the words over the hotbar: what the left button does this moment, one word (docs/V3/plan/prompts.md §五) */
  private rodActs(it: ItemInstance, out: Action[]): void {
    const s = this.session;
    if (!s) return;
    switch (s.phase) {
      case 'idle':
        // (a bare rod takes up a bait carried as it is cast)
        if (this.hookOf(it) || this.baitCarried()) out.push({ keys: E, hold: true, text: '抛竿' });
        else out.push({ keys: E, hold: true, text: '抛竿', off: true, why: '竿上没饵' });
        break;
      case 'charge':
        out.push({ keys: E, hold: true, text: `抛 <b>${Math.round(Session.reach(this.rig.rod.cast, s.charge))} 米</b>` });
        break;
      case 'wait': {
        const biting = s.committed?.state === 'bite' || (!!s.junk && s.float.dip >= 1);
        if (s.isLure(this.rig)) {
          // (a lure: wound in at an even pace; a hunter behind it says how the pace is)
          const k = s.committed;
          if (biting) out.push({ keys: E, hold: true, text: '<b>咬了</b>' });
          else if (k?.state === 'follow') out.push({ keys: E, hold: true, text: s.lureSpeed > 1.4 ? '<b>太快了</b>' : s.lureSpeed < 0.2 && s.follow.still > 0.7 ? '<b>别停</b>' : '<b>匀速收</b>' });
          else out.push({ keys: E, hold: true, text: '慢慢收' });
          break;
        }
        if (biting) out.push({ keys: E, text: '<b>提竿</b>' });
        else out.push({ keys: E, text: '提竿' }, { keys: E, hold: true, text: '收回' });
        break;
      }
      default:
        // (the catch held up: its keys are down the right, as the hands' are; a fish on: what to do is said under the strain's gauge)
        break;
    }
  }

  /** the lines down the right: the rod's own buttons now, and what is on its hook */
  private rodKeys(it: ItemInstance, out: Action[]): void {
    const s = this.session;
    if (this.holding && this.rodUid === it.uid) {
      out.push({ keys: E, text: '放进鱼篓' }, { keys: ['Q'], text: '放回水里' });
      if (canGoLive(this.holding.fish)) out.push({ keys: F, text: '当活饵' });
      return;
    }
    if (s?.phase === 'fight' && this.rodUid === it.uid) {
      out.push({ keys: E, hold: true, text: '收线' }, { keys: ['A', 'D'], text: '扳竿' });
      return;
    }
    const hook = this.hookOf(it);
    const next = hook ? null : this.baitCarried();
    if (hook || next) out.push({ keys: E, hold: true, text: '抛竿' });
    else out.push({ keys: E, hold: true, text: '抛竿', off: true, why: '竿上没饵' });
    // (what is on the hook, and the stars of the rarity it draws; a bare rod: what the cast will put on it)
    if (hook) out.push({ keys: [], text: this.hookLabel(it, hook) });
    else if (next) out.push({ keys: [], text: this.baitLabel(next.item) });
  }

  /** Q with the catch held up: back into the water ahead (kernel/heldUse.ts drop); the hands still coming up with it: not yet */
  private dropCatch(it: ItemInstance): boolean {
    const ctx = this.ctx;
    if (!ctx || !this.holding || this.rodUid !== it.uid) return false;
    if (this.hold?.phase !== 'haul') this.releaseHeld(ctx);
    return true;
  }

  private nearAt = -1;
  private nearIs = false;
  private readonly nearV = new THREE.Vector3();

  /** is there water ahead to let a fish go into (asked for the keys' line every frame: looked for five times a second) */
  private waterNear(): boolean {
    const ctx = this.ctx;
    if (!ctx) return false;
    if (this.nearAt < 0 || Math.abs(this.time - this.nearAt) > 0.2) {
      this.nearAt = this.time;
      this.nearIs = !!this.waterAhead(ctx, this.nearV);
    }
    return this.nearIs;
  }

  /** Q with a fish in the hands and water ahead: it goes back in (kernel/heldUse.ts drop); no water: the hands' own put-down */
  private fishBack(it: ItemInstance, slot: number): boolean {
    const ctx = this.ctx;
    const f = fishOfItem(it.item);
    if (!ctx || f < 0) return false;
    const to = this.waterAhead(ctx, this.toV);
    if (!to) return false;
    ctx.player.takeOne(slot);
    this.signs?.splash(to.x, to.y, to.z, 0.5);
    this.signs?.ring(to.x, to.y, to.z, 1.2, 1.6);
    this.sounds.play('splash', 0.7);
    this.released(ctx, f);
    this.nearAt = -1;
    return true;
  }

  private rodRing(it: ItemInstance): { value: number; colour?: string } | null {
    const s = this.session;
    if (!s || this.rodUid !== it.uid) return null;
    if (s.phase === 'charge') return { value: s.charge, colour: RING_WHITE };
    if (s.phase === 'reveal' && this.holding && this.holding.g > 0) return { value: Math.min(1, this.holding.g / RELEASE_HOLD), colour: RING_WHITE };
    return null;
  }

  /**
   * The HUD while a fish is on (docs/V3/plan/fishing-feel.md §7): its stamina (left, emptying from the top, in its
   * rarity's colour), the line's strain on a dial (right: a needle over safe, gold and red), an arrow out on the side to
   * pull the rod to (against the way it swims: nudging, gold while it works, red the wrong way), and how far off it is.
   */
  private rodGauges(it: ItemInstance): Gauges | null {
    const s = this.session;
    const f = s?.fight;
    if (!s || !f || s.phase !== 'fight' || this.rodUid !== it.uid || f.t < GAUGES_AFTER) return null;
    const tier = s.hooked ? FISH[s.hooked.f].tier : 0;
    // the needle: the strain as it is, jolted up a moment by a jolt on the line and trembling with the fish's strokes
    // (never into the red unless the line is near it)
    let t = f.tension + this.needleKick * (1 - f.tension) + 0.035 * this.thrashOf(f) * Math.sin(this.live?.beat ?? this.time * 14);
    if (f.tension < RED_AT - 0.04) t = Math.min(t, RED_AT - 0.02);
    t = Math.max(0, Math.min(1, t));
    const swims = f.phase === 'swim' || f.phase === 'run' || f.phase === 'rest';
    const ag = againstOf(f, this.steer);
    const colour = TIER_COLOUR[tier] ?? RING_WHITE;
    // (the distance, and whether it is coming in or going out)
    const trend = this.distRate < -0.25 ? '<i class="in">拉近</i>' : this.distRate > 0.35 ? '<i class="out">跑远</i>' : '';
    return {
      left: s.hooked ? { value: f.stamina, colour, blink: f.phase === 'spent', icon: colour, label: this.onLineLabel(s.hooked.f) } : null,
      right: { value: onDial(t), colour: t >= RED_AT ? RING_RED : t >= GOLD_AT ? RING_GOLD : RING_WHITE, zones: STRAIN_BANDS, needle: true, blink: f.tension >= RED_AT, label: this.nowLabel(f) },
      pull: swims && !f.landable ? { side: f.dir > 0 ? -1 : 1, state: ag > 0.3 ? 'good' : ag < -0.2 ? 'bad' : 'idle', key: f.dir > 0 ? 'A' : 'D' } : null,
      note: `<b>${f.dist.toFixed(1)}</b>米${trend}`,
    };
  }

  /** what is on the line, under the stamina gauge, as DREADMOOR shows it from the strike: its name and its rarity's stars */
  private onLineLabel(f: number): string {
    if (this.lineLabel.f !== f) {
      const def = FISH[f];
      const n = TIER_STARS[def.tier as Tier] ?? 1;
      this.lineLabel = { f, html: `${def.zh} <span style="color:${TIER_COLOUR[def.tier] ?? RING_WHITE}">${'★'.repeat(n)}</span>` };
    }
    return this.lineLabel.html;
  }

  private lineLabel = { f: -1, html: '' };

  /** how hard the fish on the line thrashes now (0 … 1): a run or a shock hardest, spent hardly at all; a stronger fish harder */
  private thrashOf(f: NonNullable<Session['fight']>): number {
    const ph = f.phase;
    const k = ph === 'run' || ph === 'zap' ? 1 : f.tell > 0 ? 0.9 : ph === 'jump' ? 0.8 : ph === 'dive' ? 0.6 : ph === 'swim' ? 0.45 : ph === 'rest' ? 0.2 : ph === 'spent' ? 0.04 : 0.15;
    return k * (0.7 + 0.3 * Math.min(1, this.session?.ratio ?? 0));
  }

  /** what to do this moment, under the strain's gauge (none: nothing pressing) */
  private nowLabel(f: NonNullable<Session['fight']>): string | undefined {
    if (f.landable) return '<b>拉上来！</b> E / 左键';
    // (about to part: wound in, let go; not wound in, it is the fish's own pull — the rod over against it)
    if (f.tension >= RED_AT) return this.session?.held ? `<span style="color:${RING_RED}">线要断了，松手！</span>` : `<span style="color:${RING_RED}">线要断了：照箭头扳竿顶住它！</span>`;
    if (f.dist > 0.8 * (this.session?.fightP?.lineMax ?? 1e9) && f.phase !== 'spent') return `<span style="color:${RING_RED}">线快放完了：扳竿顶住它！</span>`;
    if (f.tell > 0 && f.next !== 'breathe') return '<b>要冲了，松手！</b>';
    if (f.phase === 'jump') return '<b>跳起来了，松手！</b>';
    if (f.phase === 'dive') return '往下钻了，松手';
    if (f.phase === 'spent') return `<span style="color:${STAMINA_COLOUR}">没劲了，收线！</span>`;
    if (this.wrongT > 0.5) return `<span style="color:${RING_RED}">扳反了！往箭头那边扳</span>`;
    if (this.noGainT > 1.2) return '它还有劲，收不动：先扳竿耗它';
    return undefined;
  }

  /**
   * The view while a fish is on: on the water where it fights, a little behind its swings across so one sees which
   * way it goes (docs/V3/plan/fishing-fight.md §4); the mouse pulls the rod over meanwhile.
   */
  private rodLook(it: ItemInstance): HeldLook | null {
    const s = this.session;
    const ctx = this.ctx;
    const st = this.stand;
    // (the catch coming up into the hand and its first moment there: the eye level with it, drawn in a little — the
    // trophy against the water and the sky, as DREADMOOR shows it; then the view is the player's again)
    const hv = this.hold;
    if (ctx && this.holding && hv && this.rodUid === it.uid && (hv.phase === 'haul' || (hv.phase === 'hold' && hv.t < REVEAL_LOOK)))
      return { yaw: ctx.player.walker.heading, pitch: -0.03, k: 5, fov: REVEAL_FOV };
    if (!s || !ctx || !st || s.phase !== 'fight' || !s.fight || this.rodUid !== it.uid) return null;
    const w = ctx.player.walker;
    toWorld(st, s.float.x, s.float.z, tmpW);
    const dx = tmpW.x - w.x;
    const dz = tmpW.z - w.z;
    const d = Math.max(1, Math.hypot(dx, dz));
    const eye = w.y + 1.6 - st.level;
    // (out over the water with the far shore high in the view, about a sixth down, as DREADMOOR looks; as it comes in the
    // eye goes down with it only so far as keeps it a little above the middle, clear of the gauges low in the view:
    // docs/V3/plan/fishing-feel.md §7 — the rod then reaches across the view, the line runs out to the fish)
    const down = Math.atan2(eye, d);
    const leaping = !!this.live && this.live.jumpT >= 0;
    return { yaw: Math.atan2(dz, dx) - 0.275 * s.fight.side - 0.13 * s.fight.dir, pitch: Math.max(-0.8, Math.min(-0.1, -0.6 * down - 0.17, 0.06 - down)), k: 2.2, fov: leaping ? LEAP_FOV : FIGHT_FOV };
  }

  // ================================================================ bait onto the rod

  /** a bait in the hands onto the rod last fished with, else the one last in the hands (targetRod); the rod's old bait comes back into the hand */
  private baitOnRod(item: ItemInstance, slot: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const p = ctx.player;
    const rs = this.targetRod(slot);
    if (rs < 0) {
      ctx.player.flashWhy('没有鱼竿');
      return;
    }
    const rod = (p.slots[rs] as { kind: 'item'; item: ItemInstance }).item;
    const now = itemNow();
    const old = rod.inside?.[0] ?? null;
    const name = itemDef(item.item).name.zh;
    if (old && old.item === item.item) {
      // the same bait: as many as the rod's stack still takes go on, the rest stays in the hand
      const left = putInside(rod, item, now);
      if (left <= 0) p.slots[slot] = null;
    } else {
      if (old) rod.inside = [];
      const left = putInside(rod, item, now);
      if (left > 0) {
        // (it did not go on: the old bait back on the rod)
        if (old) rod.inside = [old];
        ctx.player.flashWhy('挂不上');
        return;
      }
      p.slots[slot] = old ? { kind: 'item', item: old } : null;
    }
    if (rod.state?.rod?.live) delete rod.state.rod.live;
    p.select(rs);
    ctx.sound('pickup', 0.2);
    this.sounds.play('click');
    announce(ctx, `挂上了${name}`, 1.6);
  }

  /** a small fish in the hands onto the rod's hook, alive */
  private liveOnHook(item: ItemInstance, slot: number): boolean {
    const ctx = this.ctx;
    if (!ctx) return false;
    const i = fishOfItem(item.item);
    if (i < 0 || !canGoLive(i)) return false;
    const rs = this.targetRod(slot);
    if (rs < 0) return false;
    const rod = (ctx.player.slots[rs] as { kind: 'item'; item: ItemInstance }).item;
    const s = item.state?.fish;
    const live: LiveBait = { f: FISH[i].id, cm: s?.cm ?? FISH[i].cm[0], kg: s?.kg ?? 0.1, q: s?.q ?? 0.2, v: (s?.v ?? 0) as Variant };
    rod.state = { ...(rod.state ?? {}), rod: { live } };
    ctx.player.takeOne(slot);
    ctx.player.select(rs);
    this.sounds.play('splash', 0.4);
    announce(ctx, `挂上了活的${FISH[i].zh}`, 1.8);
    return true;
  }

  /** one bait off the rod: the hook took it (a fish ate it), or a lure went with the line */
  private takeBait(rod: ItemInstance | null, lure: boolean): void {
    if (!rod) return;
    if (rod.state?.rod?.live) {
      delete rod.state.rod.live;
      return;
    }
    const b = rod.inside?.[0];
    if (!b) return;
    const i = baitOfItem(b.item);
    if (i < 0) return;
    if (!!BAITS[i].lure !== lure) return;
    const n = countOf(b);
    if (n <= 1) rod.inside = [];
    else b.n = n - 1;
  }

  // ================================================================ a bottle

  private openBottle(item: ItemInstance, slot: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const spot = item.state?.bottle?.s ?? Math.max(0, this.spot);
    const note = bottleNote(spot, (Number.parseInt(item.uid.replace(/\D/g, '').slice(-6) || '7', 10) % 9973) / 9973);
    ctx.player.takeOne(slot);
    if (!this.log.clues.includes(note.lord)) this.log.clues.push(note.lord);
    this.sounds.play('click');
    if (note.star) ctx.player.receive({ kind: 'item', item: newItem('bait_stardust') });
    announce(ctx, `纸条上写着：${note.text}${note.star ? '瓶底还有一撮星屑饵。' : ''}`, 5);
  }

  // ================================================================ what happened on the line

  private onEvent(ctx: GameContext, e: SessionEvent): void {
    const s = this.session!;
    const st = this.stand!;
    const f = s.float;
    switch (e.type) {
      case 'cast':
        this.sounds.play('cast');
        this.sinceCast = 0;
        this.castFrom.x = ctx.player.walker.x;
        this.castFrom.z = ctx.player.walker.z;
        this.log.stats.casts++;
        // (the kind a bare rod takes up first next time)
        if (this.hook?.kind === 'bait') this.log.lastBait = BAITS[this.hook.bait].id;
        break;
      case 'splash': {
        this.sounds.play('plop');
        const p = this.renderOf(ctx, st, e.x, e.z, this.floatV);
        this.signs?.ring(p.x, p.y, p.z, 0.9, 1.4);
        break;
      }
      case 'bank':
        this.sounds.play(e.shallow ? 'plop' : 'miss');
        if (e.shallow) this.tip('shallow', '水太浅了', 3);
        else this.tip('bank', '落到岸上了', 3);
        break;
      case 'twitch':
        this.sounds.play('click');
        break;
      case 'follow':
        this.tip('follow', '有鱼追上来了', 3);
        break;
      case 'lostInterest':
        this.sounds.play('miss');
        this.tip(`lost-${e.why}`, e.why === 'fast' ? '收太快，它走了' : '停太久，它走了', 3);
        break;
      case 'spooked': {
        this.sounds.play('miss');
        const p = this.renderOf(ctx, st, f.x, f.z, this.floatV);
        this.signs?.ring(p.x, p.y, p.z, 1.2, 0.9);
        this.tip('spooked', '鱼被吓跑了', 3);
        break;
      }
      case 'nibble': {
        this.sounds.play('nibble');
        const p = this.renderOf(ctx, st, f.x, f.z, this.floatV);
        this.signs?.ring(p.x, p.y, p.z, 0.45, 0.9);
        break;
      }
      case 'bite': {
        this.sounds.play('bite');
        const p = this.renderOf(ctx, st, f.x, f.z, this.floatV);
        // (the splash of the bite in the fish's colour: a rare one is told by it, without a word)
        this.signs?.splash(p.x, p.y, p.z, e.tier >= 3 ? 0.6 : 0.4, e.tier >= 0 ? e.tier + 2 : 0);
        this.signs?.ring(p.x, p.y, p.z, e.tier >= 2 ? 1.6 : 1, 1.2, e.tier >= 0 ? e.tier + 2 : 0);
        break;
      }
      case 'early':
        this.sounds.play('miss');
        this.tip('early', '提早了，鱼跑了', 3);
        break;
      case 'miss':
        this.sounds.play('miss');
        this.tip('miss', '慢了，鱼松口了', 3);
        break;
      case 'hook':
        this.sounds.play('strike');
        this.needleKick = 0.3;
        if (!e.junk && s.hooked) {
          // (as violent as the fish is big: the rod and the view snatched toward it, the water torn open where it is)
          const k = Math.min(1.6, 0.3 + s.hooked.cm / 110);
          const p = this.renderOf(ctx, st, s.hooked.x, s.hooked.z, this.floatV);
          this.rod?.strike(k);
          this.shake.strike(ctx.core.camera, p, k);
          this.signs?.strike(p.x, p.y, p.z, k, this.onScreen(ctx, p, Math.min(3, 0.8 + 1.5 * k), 0.15), this.onScreen(ctx, p, Math.min(4.6, 1.2 + 2.2 * k), 0.26), this.rod?.tip ?? null);
          this.sounds.play('splash', Math.min(1, 0.55 + s.hooked.cm / 150));
        } else {
          this.rod?.strike(0.3);
          this.shake.strike(ctx.core.camera, this.renderOf(ctx, st, f.x, f.z, this.floatV), 0.3);
        }
        // (the fish's model made now, while it fights, and not on the frame it comes out of the water)
        if (!e.junk && s.hooked) void itemGlb(`fish_${FISH[s.hooked.f].id}@0.${medalOf(s.hooked.q)}`);
        if (e.perfect) this.sounds.play('coin', 0.6);
        if (e.ratio > 1.3) this.tip('strong', '这条比竿还有劲', 2);
        // (the fish itself, at the surface, fighting; and the hands' shaders made now, not on the frame it comes up)
        if (!e.junk && s.hooked) this.makeLive(s.hooked.uid, s.hooked.f, s.hooked.cm / 100);
        this.hold?.warm(ctx.core.renderer, ctx.core.camera);
        this.steerKey = this.steerMouse = this.steer = 0;
        this.lastDist = s.fight?.dist ?? 0;
        // (it is worn down first and wound in as it tires: docs/V3/plan/fishing-feel.md §7)
        this.tip('steer', '上钩了', 3);
        break;
      case 'consume':
        this.takeBait(this.rodById(ctx), false);
        break;
      case 'tell':
        this.sounds.play('tell');
        break;
      case 'turn': {
        // (it turns: the water breaks where it does, the line swings)
        const h = s.hooked;
        if (!h) break;
        const p = this.renderOf(ctx, st, h.x, h.z, this.floatV);
        const k = Math.min(1.4, 0.35 + h.cm / 120);
        this.signs?.splash(p.x, p.y, p.z, k * 0.7, 0);
        this.signs?.ring(p.x, p.y, p.z, 0.8 + k, 1.1);
        // (it heaves up and rolls over at the surface as it turns, its side flashing)
        if (this.live && this.live.uid === h.uid) {
          this.live.flash = 1;
          this.live.flashDir = s.fight ? s.fight.dir : 1;
        }
        // (where it turns the water breaks white: a crown and a V of streaks the new way)
        this.signs?.crown(p.x, p.y, p.z, this.onScreen(ctx, p, 1 + k * 1.4), 6, 0.8, worldHeading(st, h.heading));
        this.signs?.wake(p.x, p.y, p.z, worldHeading(st, h.heading), Math.max(0.3, h.cm / 100), 1.5);
        this.sounds.play('thrash', Math.min(1, 0.45 + h.cm / 150));
        this.rod?.jerk(Math.min(1, 0.35 + h.cm / 120), s.fight ? s.fight.dir : 0);
        this.needleKick = Math.max(this.needleKick, 0.1 + 0.12 * Math.min(1, h.cm / 80));
        if (s.fight) this.shake.kick(-0.25, -s.fight.dir * Math.min(0.8, 0.3 + h.cm / 150), s.fight.dir * 0.3);
        break;
      }
      case 'bolt': {
        this.needleKick = Math.max(this.needleKick, 0.28);
        const h = s.hooked;
        if (h) {
          const p = this.renderOf(ctx, st, h.x, h.z, this.floatV);
          this.signs?.splash(p.x, p.y, p.z, 1.2, 0);
          this.signs?.crown(p.x, p.y, p.z, this.onScreen(ctx, p, 1.8 + h.cm / 80), 10, 0.9, worldHeading(st, h.heading));
        }
        this.sounds.play('splash', 1);
        this.rod?.jerk(1);
        this.shake.kick(-0.9, s.fight ? -s.fight.dir * 0.6 : 0, 0.4);
        this.tip('bolt', '它还要冲一次', 3);
        break;
      }
      case 'landable':
        this.sounds.play('click');
        this.tip('land', '鱼没劲了', 3);
        break;
      case 'phase':
        if (e.phase === 'jump' && s.hooked) {
          const p = this.renderOf(ctx, st, s.hooked.x, s.hooked.z, this.floatV);
          this.signs?.splash(p.x, p.y, p.z, 1.1);
          // (a low, quick crown where it leaves the water: the fish itself is the sight, up over it)
          this.signs?.crown(p.x, p.y, p.z, this.onScreen(ctx, p, 0.8 + s.hooked.cm / 120), 6, 0.5);
          this.sounds.play('jump');
          this.rod?.jerk(0.8);
          this.shake.kick(0.8, 0, 0.3);
          if (this.live) this.live.jumpT = 0;
          this.needleKick = Math.max(this.needleKick, 0.22);
        } else if (e.phase === 'zap') this.sounds.play('zap');
        else if (e.phase === 'spent' && s.hooked) {
          // (it rolls over on its side: the time to wind it in)
          this.tip('spent', '鱼翻肚皮了', 2);
        }
        break;
      case 'lost': {
        this.log.stats.lost++;
        const lure = e.why === 'snap';
        if (lure) this.takeBait(this.rodById(ctx), true);
        this.sounds.play(e.why === 'snap' ? 'snap' : 'miss');
        if (e.why === 'snap') {
          this.rod?.snap();
          this.shake.kick(1.8, 0, 1);
        }
        this.dropLive();
        const what = e.fish >= 0 && FISH[e.fish].tier >= 2 ? `，${FISH[e.fish].zh}还在水里` : '';
        // (the line's own words, the first times with what to do about it)
        const tipKey = `lost-${e.why}`;
        const told = this.told(tipKey) < 2;
        const why = e.why === 'snap' ? `线断了${what}。${s.held ? '它还在挣的时候硬收了：松开左键，先扳竿顶住它。' : '没顶住它的拉力：照箭头往反方向扳竿。'}` : `鱼跑了${what}。`;
        if (told) this.log.told.push(tipKey);
        announce(ctx, why, 2.8);
        break;
      }
      case 'landed': {
        // (out of the water as it lay fighting there)
        const lay = this.live ? this.live.body.group.getWorldQuaternion(new THREE.Quaternion()) : null;
        this.dropLive();
        this.landed(ctx, e.landed, lay);
        break;
      }
      case 'nobody':
        this.tip(`nobody-${this.spot}`, '这里的鱼不吃这种饵', 1);
        break;
      default:
        break;
    }
  }

  /** the rod the session was cast with, if it is still in the hands */
  private rodById(ctx: GameContext): ItemInstance | null {
    const r = this.rodInHands(ctx);
    return r && r.uid === this.rodUid ? r : null;
  }

  /**
   * A fish (or what came up instead) brought to one's feet and landed: worked out — the news of it — and a
   * fish caught in the hands and held up (docs/V3/plan/fishing-fight.md §6); junk swung onto the boards.
   */
  private landed(ctx: GameContext, l: Landed, lay: THREE.Quaternion | null): void {
    const s = this.session!;
    const st = this.stand!;
    const from = this.renderOf(ctx, st, s.float.x, s.float.z, new THREE.Vector3());
    if (l.junk) {
      const item = this.junkItem(l.junk);
      this.log.stats.junk++;
      this.sounds.play('junk');
      this.throwDown(ctx, item, from, 0.75, false);
      this.sounds.play('splash', 0.8);
      s.done();
      return;
    }
    const def = FISH[l.fish];
    // (the fight's words at the top are over: taken down, the catch's own news says itself at once)
    cutLine(ctx);
    const u = ((l.uid * 2654435761) >>> 0) / 4294967296;
    const got = settle(this.log, l, this.rig, (u + this.log.stats.catches * 0.618) % 1);
    const item = newItem(fishItem(l.fish), { state: { fish: got.state } });
    this.journal?.changed();
    // (the third water's lord, the first time it is landed: the sheet the Night Heron is made from comes up with it —
    // docs/V3/plan/finish.md §九; nowhere else on the road)
    if (got.first && def.tier === 4 && def.spot === HERON_LORD) {
      this.throwDown(ctx, newItem(blueprintOf('rod_heron')), from, 0.9, false);
      ctx.ui.say('它嘴里挂着一卷图纸：「夜鹭」夜钓竿', 4);
    }
    this.sounds.landed(def.tier, got.first);
    meet(ctx, FISH_DOMAIN, def.id, 1, { quiet: true });
    // (one line at most: the news of it)
    const v = got.state.v > 0 ? VARIANTS[got.state.v].zh : '';
    if (got.first) announce(ctx, `第一次钓到：${v ? `${v}的` : ''}${def.zh}`, 2.6);
    else if (got.record) announce(ctx, `新纪录：${def.zh} ${fmtCm(l.cm)}`, 2.6);
    else if (got.newVariant) announce(ctx, `${v}的${def.zh}！`, 2.4);
    else if (got.state.m >= 3) announce(ctx, `${MEDAL_ZH[got.state.m]}：${def.zh} ${fmtCm(l.cm)}`, 2.2);
    this.sounds.play('splash', 1);
    const p = this.renderOf(ctx, st, s.float.x, s.float.z, this.floatV);
    this.signs?.splash(p.x, p.y, p.z, Math.min(1.4, 0.6 + l.cm / 100), 0);
    this.signs?.crown(p.x, p.y, p.z, this.onScreen(ctx, p, Math.min(3, 1.3 + l.cm / 60), 0.3), 10, 0.9);
    // up out of the water and into the hands, held up before the eye (in its colour, as it came up)
    this.holding = { item, fish: l.fish, g: 0 };
    if (this.hold) {
      const yaw = worldHeading(st, Math.atan2(s.float.x - s.angler.x, s.float.z - s.angler.z) + Math.PI);
      const q = lay ?? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
      const fam = def.family;
      const style = fam === 'eel' ? 's' : fam === 'squid' || fam === 'octopus' || fam === 'crayfish' || fam === 'frog' || fam === 'turtle' || fam === 'cube' ? 'stiff' : 'c';
      this.hold.start(rawFish(l.fish, got.state.v as Variant), l.cm / 100, from, q, style);
    }
  }

  /** a thing swung (or dropped) from `from` (render space) down beside one's feet, where it lies (a fish flopping) */
  private throwDown(ctx: GameContext, item: ItemInstance, from: THREE.Vector3, dur: number, held: boolean): void {
    const to = this.landingSpot(ctx);
    const o = ctx.core.origin;
    const big = itemDef(item.item).carry !== 'small';
    this.flying.push({ item, from: from.clone(), to: new THREE.Vector3(to.x - o.x, to.y - o.y, to.z - o.z), t: 0, dur, yaw: ctx.player.walker.heading + Math.PI / 2, obj: null, big: big && !held });
    const fl = this.flying[this.flying.length - 1];
    void itemGlb(itemModelOf(item)).then((m) => {
      if (!m || !this.flying.includes(fl)) return;
      fl.obj = cloneModel(m);
      ctx.core.scene.add(fl.obj);
    });
  }

  // ================================================================ the catch in the hands

  /**
   * the buttons with the fish held up: the left button into the creel (or down at one's feet), the right one onto the
   * hook alive; Q back into the water (dropCatch: a press — the pad's drop button held does it here)
   */
  private holdButtons(b: HeldButtons, dt: number): number {
    const ctx = this.ctx;
    const h = this.holding;
    if (!ctx || !h) return 0;
    // (the hands still coming up with it out of the water: nothing yet)
    if (this.hold?.phase === 'haul') return (b.use ? 1 : 0) | (b.take ? 2 : 0) | (b.drop ? 4 : 0);
    if (b.drop) {
      h.g += dt;
      if (h.g >= RELEASE_HOLD) this.releaseHeld(ctx);
      return 4 | (b.use ? 1 : 0);
    }
    h.g = 0;
    if (b.useEdge) {
      this.keepHeld(ctx);
      return 1;
    }
    if (b.takeEdge) {
      this.liveHeld(ctx);
      return 2;
    }
    return (b.use ? 1 : 0) | (b.take ? 2 : 0);
  }

  /** where a fish let go of would go into the water: the first water ahead along the view (render space), or null */
  private waterAhead(ctx: GameContext, out: THREE.Vector3): THREE.Vector3 | null {
    const world = ctx.world;
    if (!world) return null;
    const w = ctx.player.walker;
    const fx = Math.cos(w.heading);
    const fz = Math.sin(w.heading);
    for (let d = 1; d <= 4.5; d += 0.25) {
      const x = w.x + fx * d;
      const z = w.z + fz * d;
      if (waterDepth(world, x, z) < 0.3) continue;
      const level = waterLevel(world, x, z);
      if (!Number.isFinite(level)) continue;
      const o = ctx.core.origin;
      return out.set(x - o.x, level - o.y, z - o.z);
    }
    return null;
  }

  /** E: into the creel (or a free hand); no room, down at one's feet */
  private keepHeld(ctx: GameContext): void {
    const h = this.holding!;
    const left = ctx.player.receive({ kind: 'item', item: h.item });
    this.holding = null;
    if (left > 0) {
      this.dropHeldThing(ctx, h.item);
      this.tip('toobig', '鱼篓装不下，放在脚边了', 3);
    } else {
      ctx.sound('pickup', 0.3);
      this.sounds.play('splash', 0.35);
      this.hold?.end();
    }
    this.session?.done();
  }

  /** G held: back into the water ahead (it slips out of the hands, a splash); no water there, down at one's feet */
  private releaseHeld(ctx: GameContext): void {
    const h = this.holding!;
    const to = this.waterAhead(ctx, this.toV);
    this.holding = null;
    if (!to) {
      this.dropHeldThing(ctx, h.item);
      announce(ctx, '前面没有水', 1.6);
      this.session?.done();
      return;
    }
    this.hold?.release(to);
    this.released(ctx, h.fish);
    this.session?.done();
  }

  /** F: a small fish onto the rod's hook alive */
  private liveHeld(ctx: GameContext): void {
    const h = this.holding!;
    if (!canGoLive(h.fish)) {
      ctx.player.flashWhy('太大了');
      return;
    }
    const rod = this.rodInHands(ctx);
    if (!rod) return;
    const s = h.item.state?.fish;
    const live: LiveBait = { f: FISH[h.fish].id, cm: s?.cm ?? FISH[h.fish].cm[0], kg: s?.kg ?? 0.1, q: s?.q ?? 0.2, v: (s?.v ?? 0) as Variant };
    rod.state = { ...(rod.state ?? {}), rod: { live } };
    this.holding = null;
    this.hold?.end();
    this.sounds.play('splash', 0.4);
    announce(ctx, `挂上了活的${FISH[h.fish].zh}`, 1.8);
    this.session?.done();
  }

  /** the fish in the hands put down at one's feet (no room for it, the rod put away): it drops onto the boards and flops there */
  private putHeldDown(ctx: GameContext): void {
    const h = this.holding;
    if (!h) return;
    this.holding = null;
    this.dropHeldThing(ctx, h.item);
  }

  private dropHeldThing(ctx: GameContext, item: ItemInstance): void {
    const cam = ctx.core.camera;
    cam.updateMatrixWorld();
    const from = new THREE.Vector3(0, -0.25, -0.45).applyMatrix4(cam.matrixWorld);
    this.hold?.end();
    this.throwDown(ctx, item, from, 0.35, true);
  }

  /** a fish put back into the water: counted, and said */
  private released(ctx: GameContext, f: number): void {
    this.log.stats.released++;
    announce(ctx, `放生了${FISH[f].zh}`, 1.8);
  }

  /** the catch held up: its flops' slaps and drops, its splash going back in */
  private drawHold(ctx: GameContext, dt: number): void {
    const hv = this.hold;
    if (!hv) return;
    // (at night the catch held up is lit as by a lamp at one's side: seen, not a black shape against the stars)
    hv.update(dt, ctx.core.camera, 0.13 * Math.max(0, Math.min(1, ctx.env.sky.night)));
    for (const k of hv.slaps) this.sounds.play('slap', k);
    // (caught in the hand: the view knocked down with it)
    if (hv.caught) {
      this.shake.kick(-1.3, (Math.random() - 0.5) * 0.6, 0.6);
      this.sounds.play('catch');
    }
    if (hv.splashed) {
      const p = this.toV;
      this.signs?.splash(p.x, p.y, p.z, 0.7, 0);
      this.signs?.ring(p.x, p.y, p.z, 1.3, 1.6);
      this.sounds.play('splash', 0.8);
    }
  }

  private junkItem(junk: Junk): ItemInstance {
    const id = JUNK_ITEM[junk];
    const item = newItem(id);
    if (id === BOTTLE) item.state = { ...(item.state ?? {}), bottle: { s: Math.max(0, this.spot) } };
    if (id === CRATE) {
      const now = itemNow();
      for (const [what, n] of crateContents(Math.max(0, this.spot), Math.random())) putInside(item, newItem(what, n > 1 ? { n } : {}), now);
    }
    return item;
  }

  /** where a thing swung out of the water lands: beside one's feet, on the boards or the bank (never in the water) */
  private landingSpot(ctx: GameContext): { x: number; y: number; z: number } {
    const w = ctx.player.walker;
    const fx = Math.cos(w.heading);
    const fz = Math.sin(w.heading);
    const rx = -fz;
    const rz = fx;
    const world = ctx.world;
    const st = this.stand;
    const jetty = st && st.spot >= 0 && world ? jettyRect(ctx, st.spot) : null;
    const tries: [number, number][] = [
      [0.75, 0.35],
      [0.7, -0.35],
      [0.4, 0.6],
      [0.4, -0.6],
      [0, 0.65],
      [0, -0.65],
      [-0.6, 0.3],
      [-0.6, -0.3],
    ];
    for (const [a, b] of tries) {
      const x = w.x + fx * a + rx * b;
      const z = w.z + fz * a + rz * b;
      const dry = !world || waterDepth(world, x, z) <= 0;
      if (dry || (jetty && jetty(x, z))) return { x, y: w.y + 0.5, z };
    }
    return { x: w.x - fx * 0.3, y: w.y + 0.5, z: w.z - fz * 0.3 };
  }

  private stepFlying(ctx: GameContext, dt: number): void {
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const fl = this.flying[i];
      fl.t += dt;
      if (fl.t < fl.dur) continue;
      this.flying.splice(i, 1);
      fl.obj?.removeFromParent();
      const o = ctx.core.origin;
      const l = ctx.loose.addItem(fl.item, fl.to.x + o.x, fl.to.y + o.y, fl.to.z + o.z, fl.yaw);
      ctx.loose.drop(l);
      this.thrown.add(l.uid);
      ctx.sound('putdown', fl.big ? 4 : 0.6);
      if (fishOfItem(fl.item.item) >= 0) this.flops.push({ loose: l, t: 0, dur: fl.big ? 3.4 : 2.6, phase: Math.random() * 6, k: fl.big ? 0.55 : 1 });
      // (too big for the creel and both hands full: nothing would show it why the mark passes it by)
      if (ctx.player.roomFor({ kind: 'item', item: fl.item }) <= 0) this.tip('toobig', '太大了，鱼篓装不下', 3);
    }
  }

  /** a fish lying in the water now (put down there by hand): released */
  private lookForReleased(ctx: GameContext): void {
    const world = ctx.world;
    if (!world) return;
    const list = ctx.loose.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const l = list[i];
      const it = l.item;
      if (!it || this.thrown.has(l.uid)) continue;
      const f = fishOfItem(it.item);
      if (f < 0 || l.riding) continue;
      const level = waterLevel(world, l.x, l.z);
      if (!Number.isFinite(level) || l.y > level - 0.05 || waterDepth(world, l.x, l.z) < 0.2) continue;
      ctx.loose.remove(l);
      const o = ctx.core.origin;
      this.signs?.splash(l.x - o.x, level - o.y, l.z - o.z, 0.5);
      this.signs?.ring(l.x - o.x, level - o.y, l.z - o.z, 1.2, 1.6);
      this.sounds.play('splash', 0.7);
      this.released(ctx, f);
    }
    // (what the module threw down itself and is no longer lying there: forgotten)
    if (this.thrown.size > 32) for (const uid of this.thrown) if (!list.some((l) => l.uid === uid)) this.thrown.delete(uid);
  }

  // ================================================================ the weather and the sky

  private conditions(ctx: GameContext): void {
    const c = this.cond;
    const w = ctx.env.state;
    const sky = ctx.env.sky;
    c.day = this.fishDay(ctx);
    c.hour = ctx.clock.hour;
    c.rain = w.rain > 0.15;
    c.snow = w.snow > 0.15;
    c.fog = w.fog > 0.35;
    c.storm = w.lightning > 0.02 || (w.rain > 0.6 && w.wind > 9);
    c.clear = w.cloud < 0.4 && w.rain < 0.05 && w.snow < 0.05;
    const ev = c.events as Set<Cond>;
    ev.clear();
    const night = sky.night > 0.5;
    if (w.rainbow > 0.3 && sky.daylight > 0.3) ev.add('rainbow');
    if (w.rain > 0.15 && w.overcast < 0.3 && sky.daylight > 0.5) ev.add('sunshower');
    if (c.fog) ev.add('fog');
    if (c.storm) ev.add('storm');
    if (c.snow) ev.add('snow');
    if (sky.sunElev > -0.05 && sky.sunElev < 0.14 && w.cloud > 0.25 && w.cloud < 0.8 && w.rain < 0.05) ev.add('afterglow');
    if (night && skyUniforms.uNight.value.y > 0.5) ev.add('meteor');
    if (night && skyUniforms.uAurora.value > 0.35) ev.add('aurora');
    if ((ctx.env.skyTune?.ribbon ?? 0) > 0.5) ev.add('ribbon');
    if (sky.moonY > 0.05) ev.add('moonup');
    if (night && fullMoon(c.day)) ev.add('fullmoon');
    // the water's own moment, every other day at its hours (the dream only once the other nine are found), or the developer's
    const sp = this.spot;
    this.momentNow = sp >= 0 && (skyMoment(sp, c.day, c.hour, (id) => found(this.log, id)) || (!!this.forced && this.forced.spot === sp && ctx.clock.worldSeconds < this.forced.until));
    if (this.forced && ctx.clock.worldSeconds >= this.forced.until) this.forced = null;
    if (this.momentNow) ev.add(SPOTS[sp].event);
  }

  /** the developer's tab: this water's moment, now, for so many game minutes */
  forceMoment(ctx: GameContext, minutes = 45): void {
    if (this.spot < 0) return;
    this.forced = { spot: this.spot, until: ctx.clock.worldSeconds + minutes * 60 };
  }

  /** the dials' function stays first: the module's goes after it (put back each frame the dials put theirs in) */
  private keepTune(ctx: GameContext): void {
    const env = ctx.env;
    if (env.tune !== this.tuneFn) {
      this.prevTune = env.tune;
      env.tune = this.tuneFn;
    }
    // the kinds of cloud of the two moments that have them, while they are on
    const want = this.momentNow && this.spot >= 0 ? SPOTS[this.spot].event : '';
    if (want === 'afterglow' || want === 'ribbon') {
      env.skyTune = want === 'afterglow' ? { altocumulus: 0.9, cirrus: 0.7, cirrocumulus: 0.5 } : { ribbon: 1, waves: 1 };
      this.skyTuned = true;
    } else if (this.skyTuned) {
      env.skyTune = null;
      this.skyTuned = false;
    }
    // the crater's full moon
    env.clock.moonOverride = this.spot === 9 && this.cond.events.has('fullmoon') ? 0.5 : null;
  }

  /** the weather of a water's moment, drawn towards it (from the first build: docs/V3/nodes/F2-fishing-lite.md §5) */
  private shapeWeather(w: WeatherState): void {
    const sp = SPOTS[this.spot];
    const span = sp.eventSpan;
    const len = (span[1] - span[0] + 24) % 24 || 24;
    const into = ((((this.cond.hour - span[0]) % 24) + 24) % 24) / len;
    switch (sp.event) {
      case 'rainbow':
        if (into < 0.15 && !this.forced) {
          w.rain = Math.max(w.rain, 0.55);
          w.cloud = Math.max(w.cloud, 0.75);
          w.overcast = Math.max(w.overcast, 0.5);
        } else {
          w.rain = 0;
          w.cloud = Math.min(w.cloud, 0.4);
          w.overcast = Math.min(w.overcast, 0.15);
          w.rainbow = 1;
          w.wetness = Math.max(w.wetness, 0.6);
        }
        break;
      case 'fog':
        w.fog = Math.max(w.fog, 0.8);
        w.cloud = Math.min(w.cloud, 0.5);
        w.rain = 0;
        break;
      case 'storm':
        w.rain = Math.max(w.rain, 0.8);
        w.fall = Math.max(w.fall, 0.8);
        w.cloud = 1;
        w.overcast = Math.max(w.overcast, 0.85);
        w.lightning = Math.max(w.lightning, 0.25);
        w.wind = Math.max(w.wind, 9);
        break;
      case 'sunshower':
        w.rain = Math.max(w.rain, 0.45);
        w.fall = Math.max(w.fall, 0.4);
        w.cloud = Math.min(w.cloud, 0.3);
        w.overcast = Math.min(w.overcast, 0.08);
        w.rainbow = Math.max(w.rainbow, 0.6);
        break;
      case 'afterglow':
        w.rain = 0;
        w.cloud = Math.max(0.45, Math.min(w.cloud, 0.6));
        w.overcast = Math.min(w.overcast, 0.15);
        break;
      case 'aurora':
      case 'meteor':
      case 'dream':
        w.rain = 0;
        w.snow = 0;
        w.cloud = Math.min(w.cloud, 0.08);
        w.overcast = 0;
        w.fog = Math.min(w.fog, 0.1);
        break;
      case 'ribbon':
        w.rain = 0;
        w.cloud = Math.min(w.cloud, 0.35);
        break;
      case 'snow':
        w.snow = Math.max(w.snow, 0.6);
        w.fall = Math.max(w.fall, 0.55);
        w.rain = 0;
        w.cloud = Math.max(w.cloud, 0.85);
        w.overcast = Math.max(w.overcast, 0.55);
        w.temp = Math.min(w.temp, -2);
        break;
      default:
        break;
    }
  }

  /** what the moment adds to the night sky once the environment has drawn it up */
  private afterSky(ctx: GameContext): void {
    if (!this.momentNow || this.spot < 0) return;
    const ev = SPOTS[this.spot].event;
    if (ctx.env.sky.night < 0.3) return;
    if (ev === 'meteor' || ev === 'dream') skyUniforms.uNight.value.y = 1;
    if (ev === 'aurora' || ev === 'dream') skyUniforms.uAurora.value = Math.max(skyUniforms.uAurora.value, ev === 'dream' ? 0.6 : 1);
  }

  // ================================================================ drawn

  /** a point of the stand's axes on the water, in render space */
  /**
   * A crown's size kept to a share of the view where it is (docs/V3/plan/fishing-feel.md §7): in the fight about a
   * seventh of its height at most, clear of the gauges (cap: the share of the distance to the eye, m a metre)
   */
  private onScreen(ctx: GameContext, p: THREE.Vector3, size: number, cap = 0.13): number {
    return Math.min(size, Math.max(0.25, cap * ctx.core.camera.position.distanceTo(p)));
  }

  private renderOf(ctx: GameContext, st: Stand, x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    toWorld(st, x, z, tmpW);
    const o = ctx.core.origin;
    return out.set(tmpW.x - o.x, st.level - o.y, tmpW.z - o.z);
  }

  private drawRod(ctx: GameContext, dt: number): void {
    const rv = this.rod!;
    const rod = this.rodInHands(ctx);
    // (the hands are on the catch while it is held up: the rod is down at one's side, out of the view)
    const show = !!rod && !ctx.seated && !this.holding && this.hold?.phase !== 'release';
    rv.group.visible = show;
    // (the rod's, its hands' and the white water's shaders made the first time a rod is in the hands: not at the strike,
    // when the first crown of spray goes up)
    if (show && !this.viewsWarm) {
      this.viewsWarm = true;
      const r = ctx.core.renderer;
      r.compile(rv.group, ctx.core.camera, ctx.core.scene);
      if (this.signs) r.compile(this.signs.group, ctx.core.camera, ctx.core.scene);
    }
    if (!show || !rod) {
      rv.showRing(null, this.time);
      return;
    }
    const s = this.session;
    const cam = ctx.core.camera;
    let floatAt: THREE.Vector3 | null = null;
    let to: THREE.Vector3 | null = null;
    let air = 0;
    const st = this.stand;
    if (s && st && this.rodUid === rod.uid) {
      const f = s.float;
      if (s.phase === 'flight') {
        floatAt = this.renderOf(ctx, st, f.x, f.z, this.floatV);
        const u = Math.min(1, f.t / Math.max(0.01, f.dur));
        air = Math.sin(u * Math.PI) * 0.35;
        floatAt.y += air * Math.min(6, Math.hypot(f.toX - f.fromX, f.toZ - f.fromZ) * 0.25);
        to = floatAt;
      } else if (s.phase === 'wait' || s.phase === 'retrieve') {
        floatAt = this.renderOf(ctx, st, f.x, f.z, this.floatV);
        to = this.toV.copy(floatAt);
        to.y += 0.08;
      } else if (s.phase === 'fight') {
        const h = s.hooked;
        to = h ? this.renderOf(ctx, st, h.x, h.z, this.toV) : this.renderOf(ctx, st, f.x, f.z, this.toV);
        // (a fish in the air takes the line up with it)
        const lv = this.live;
        if (h && lv && lv.uid === h.uid && lv.jumpT >= 0) to.copy(lv.body.group.position);
        else if (h && lv && lv.uid === h.uid) {
          // (close in, out to where its surge has taken it)
          to.x += lv.offX;
          to.z += lv.offZ;
        }
      }
    }
    const r = rodOfItem(rod.item);
    const blank = itemDef(rod.item).paint;
    const phase = s && this.rodUid === rod.uid ? s.phase : 'idle';
    // the tug-of-war on the rod (docs/V3/plan/fishing-feel.md §7): how hard the fish pulls, which way, how it thrashes
    const fs = phase === 'fight' ? s!.fight : null;
    const fp = phase === 'fight' ? s!.fightP : null;
    const fph = fs?.phase;
    const thrash = fs ? this.thrashOf(fs) : 0;
    rv.update(
      cam,
      {
        charge: phase === 'charge' ? s!.charge : 0,
        sinceCast: this.sinceCast,
        // (a fish on keeps the line taut and the rod bent, more as it pulls: the strain bar's share at least)
        tension: s?.fight ? Math.max(s.fight.tension, s.fight.phase === 'spent' ? 0.22 : s.fight.phase === 'run' ? 0.5 : 0.36) : phase === 'wait' ? 0.05 : 0,
        to,
        air,
        fight: phase === 'fight',
        blank,
        dangle: phase === 'idle' || phase === 'charge',
        hide: false,
        steer: phase === 'fight' ? this.steer : 0,
        reel: phase === 'idle' || phase === 'charge' ? 0 : this.reeling,
        pull: fs && fp ? pullOf(fs, fp) : 0,
        fishDir: fs ? fs.dir : 0,
        thrash,
        beat: this.live?.beat ?? this.time * 14,
        stamina: fs ? fs.stamina : 0,
      },
      this.time,
      dt,
      floatAt,
      phase === 'wait' ? (s?.float.dip ?? 0) : 0,
    );
    // where the cast will land, while it is charged
    if (s && st && phase === 'charge' && r >= 0) {
      const reach = Session.reach(RODS[r].cast, s.charge);
      const a = s.aim;
      const lx = s.angler.x + Math.sin(a) * reach;
      const lz = s.angler.z + Math.cos(a) * reach;
      const wet = (s.depthAt ? s.depthAt(lx, lz) : st.shape.depthAt(lx, lz)) > 0.35;
      rv.showRing(this.renderOf(ctx, st, lx, lz, this.ringV), this.time, wet ? 0xfff2c8 : 0xff8a7a);
    } else rv.showRing(null, this.time);
  }

  private drawWater(ctx: GameContext, dt: number): void {
    const signs = this.signs!;
    const pond = this.pond;
    const st = this.stand;
    if (!pond || !st) {
      signs.setShadows(NO_SHADOWS);
      return;
    }
    const s = this.session;
    const w = ctx.player.walker;
    const night = ctx.env.sky.night > 0.5;
    const list = this.shadows;
    list.length = 0;
    let n = 0;
    // (a fish on the line has the water round it to itself: no other shadow there to be taken for it)
    const hk = s?.phase === 'fight' ? s.hooked : null;
    for (const fish of pond.fish) {
      const def = FISH[fish.f];
      if (hk && fish.uid !== hk.uid && Math.hypot(fish.x - hk.x, fish.z - hk.z) < 6) continue;
      // (the rest scattered: faint while a fish is on)
      const faint = (hk && fish.uid !== hk.uid) || this.holding ? 0.3 : 1;
      const near = fish.state === 'come' || fish.state === 'follow' || fish.state === 'nibble' || fish.state === 'bite' || fish.state === 'hooked';
      let alpha = fish.zone === 0 ? 0.72 : fish.zone === 1 ? 0.45 : 0;
      if (near) alpha = Math.max(alpha, 0.6);
      if (def.look.p === 'clear' || def.id === 'icefish') alpha *= 0.35;
      if (night) alpha *= 0.55;
      alpha *= faint;
      if (alpha <= 0.01) continue;
      const p = this.renderOf(ctx, st, fish.x, fish.z, this.floatV);
      const o = ctx.core.origin;
      if (Math.hypot(p.x + o.x - w.x, p.z + o.z - w.z) > 40) continue;
      const shape = shapeOf(def.family);
      const len = Math.max(0.38, Math.min(4, (fish.cm / 100) * 1.5 + 0.18));
      const spec = (this.shadowPool[n] ??= { x: 0, y: 0, z: 0, heading: 0, len: 0, wid: 0, alpha: 0, shape: 0, wag: 0, phase: 0, shimmer: 0 });
      n++;
      spec.x = p.x;
      spec.y = p.y + 0.012;
      spec.z = p.z;
      spec.heading = worldHeading(st, fish.heading);
      spec.len = len;
      spec.wid = len * SHADOW_W[shape];
      spec.alpha = alpha;
      spec.shape = shape;
      spec.wag = fish.state === 'hooked' ? 1 : fish.state === 'flee' ? 0.9 : fish.state === 'follow' ? 0.75 : 0.3;
      spec.phase = fish.uid * 1.7;
      spec.shimmer = def.tier >= 2 ? 1 : 0;
      list.push(spec);
    }
    signs.setShadows(list);
    // the rings of the deep fish, the jumps, the boil, the gold rings, a fish's run on the line
    this.lastSigns += dt;
    if (this.lastSigns < 0.2) return;
    const step = this.lastSigns;
    this.lastSigns = 0;
    for (const fish of pond.fish) {
      if (fish.state === 'hooked') continue;
      const def = FISH[fish.f];
      const next = this.signT.get(fish.uid) ?? this.time + 2 + (fish.uid % 13);
      if (!this.signT.has(fish.uid)) this.signT.set(fish.uid, next);
      if (this.time < next) continue;
      const p = this.renderOf(ctx, st, fish.x, fish.z, this.floatV);
      const big = Math.min(2.4, 0.6 + fish.cm / 80);
      // (the water read from the first cast: a fish's rings in its rarity's colour)
      const tint = def.tier + 2;
      if (def.temper === 'jumper' && fish.uid % 5 === 0 && fish.zone > 0) signs.splash(p.x, p.y, p.z, 0.6 + big * 0.2, tint);
      else if (fish.zone > 0 || def.tier >= 2) signs.ring(p.x, p.y, p.z, big, 2.4, tint);
      this.signT.set(fish.uid, this.time + (fish.zone === 2 ? 7 : 11) + ((fish.uid * 7) % 9));
    }
    const b = pond.boil;
    if (b) {
      for (let i = 0; i < Math.ceil(step * 12); i++) {
        const p = this.renderOf(ctx, st, b.x + (Math.random() - 0.5) * 3.5, b.z + (Math.random() - 0.5) * 3.5, this.floatV);
        if (Math.random() < 0.5) signs.splash(p.x, p.y, p.z, 0.25);
        else signs.ring(p.x, p.y, p.z, 0.8, 1.2);
      }
    }
    const g = pond.golden;
    if (g) {
      const gf = pond.byUid(g.uid);
      if (gf && Math.random() < step * 2.5) {
        const p = this.renderOf(ctx, st, gf.x, gf.z, this.floatV);
        signs.ring(p.x, p.y, p.z, 1.8, 1.8, 1);
      }
    }
    const h = s?.hooked;
    if (h && s?.fight && (s.fight.phase === 'run' || s.fight.phase === 'dive')) {
      const p = this.renderOf(ctx, st, h.x, h.z, this.floatV);
      signs.splash(p.x, p.y, p.z, 0.3 + 0.2 * Math.min(2, s.ratio));
    }
  }

  private readonly shadows: ShadowSpec[] = [];
  private readonly shadowPool: ShadowSpec[] = [];

  /** the deck of the jetty of the water one is at, grown by a margin (for a fish on the line to be seen beyond it) */
  private deck: { spot: number; inside: ((x: number, z: number) => boolean) | null } | null = null;

  /**
   * A fish on the line brought in under the jetty's boards is in the water there, but out of sight: it is drawn, and
   * looked at, just beyond their edge along the line (the fight's own reckoning of the line is untouched).
   */
  private keepOffDeck(ctx: GameContext, s: Session): void {
    const h = s.hooked;
    const st = this.stand;
    if (!h || !st || s.phase !== 'fight' || this.spot < 0) return;
    if (!this.deck || this.deck.spot !== this.spot) this.deck = { spot: this.spot, inside: jettyRect(ctx, this.spot, 0.85) };
    const inside = this.deck.inside;
    if (!inside) return;
    toWorld(st, h.x, h.z, tmpW);
    if (!inside(tmpW.x, tmpW.z)) return;
    const dx = h.x - s.angler.x;
    const dz = h.z - s.angler.z;
    const d = Math.hypot(dx, dz) || 1;
    for (let k = 0.25; k <= 10; k += 0.25) {
      const x = h.x + (dx / d) * k;
      const z = h.z + (dz / d) * k;
      toWorld(st, x, z, tmpW);
      if (inside(tmpW.x, tmpW.z)) continue;
      h.x = s.float.x = x;
      h.z = s.float.z = z;
      return;
    }
  }

  /** the fish on the line, at the surface: made at the strike, its body bending as it swims (bend.ts) */
  private makeLive(uid: number, f: number, len: number): void {
    this.dropLive();
    const ctx = this.ctx;
    if (!ctx || typeof document === 'undefined') return;
    const body = new FishBody(rawFish(f, 0));
    ctx.core.scene.add(body.group);
    this.live = { uid, body, len, t: 0, jumpT: -1, roll: 0, splashT: 0.3, beat: 0, flash: 0, flashDir: 1, px: NaN, pz: NaN, wakeT: 0, churnN: 0, surge: 0, surgeV: 0, surgeTo: 0, surgeHold: 0, surgeT: 0.4, lastSurge: 1, offX: 0, offZ: 0, burst: 0, burstT: 1.2, burstSide: 1 };
  }

  private dropLive(): void {
    this.live?.body.dispose();
    this.live = null;
  }

  /**
   * The fish fighting at the surface (docs/V3/plan/fishing-fight.md §3): its back and its fin out of the water,
   * heading off across the line the way it swims, its whole body beating — hard on a run, slow at rest; down into the
   * dark on a bore, out of the water in an arc on a leap; spent, it rolls over on its side and lies there.
   */
  private drawLive(ctx: GameContext, dt: number): void {
    const lv = this.live;
    if (!lv) return;
    const s = this.session;
    const st = this.stand;
    const f = s?.fight;
    const h = s?.hooked;
    if (!s || !st || !f || !h || h.uid !== lv.uid || s.phase !== 'fight') {
      this.dropLive();
      return;
    }
    lv.t += dt;
    const L = lv.len;
    const g = lv.body.group;
    // its beat: how hard and how fast (a big fish beats slower)
    const ph = f.phase;
    const amp = ph === 'run' ? 0.4 : ph === 'swim' ? 0.3 : ph === 'rest' ? 0.18 : ph === 'dive' ? 0.26 : ph === 'jump' ? 0.42 : ph === 'zap' ? 0.3 : ph === 'spent' ? 0.035 : 0.12;
    const hz = (ph === 'run' ? 3.4 : ph === 'swim' ? 2.2 : ph === 'jump' ? 4.6 : ph === 'zap' ? 6 : ph === 'spent' ? 0.8 : 1.4) / (L > 0.8 ? 1 + 0.5 * Math.min(2, L - 0.8) : 1);
    // (in a thrash burst it beats twice as fast and hard)
    lv.beat += dt * hz * Math.PI * 2 * (1 + 1.6 * lv.burst);
    lv.body.pose(swimCurve(amp + (f.tell > 0 ? 0.15 : 0) + 0.28 * lv.burst, lv.beat), 0.72);
    const p = this.renderOf(ctx, st, h.x, h.z, this.floatV);
    const yaw = worldHeading(st, h.heading);
    // close in, it fights at the surface in surges (docs/V3/plan/fishing-feel.md §7): darting aside across the line and
    // back, a fan of spray flung the way it goes each time — and near the eye no wake or churned streaks about it, which
    // would lie there as a still hatching
    const eye = ctx.core.camera.position;
    const camD = Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z);
    const close = camD < 7 && ph !== 'spent' && lv.jumpT < 0 && f.depth < 0.5;
    lv.surgeT -= dt;
    lv.surgeHold -= dt;
    const al = Math.hypot(p.x - eye.x, p.z - eye.z) || 1;
    const sx = -(p.z - eye.z) / al;
    const sz = (p.x - eye.x) / al;
    if (close && lv.surgeT <= 0) {
      lv.surgeT = 0.45 + 0.6 * Math.random();
      const sgn = Math.random() < 0.7 ? -lv.lastSurge : lv.lastSurge;
      lv.lastSurge = sgn;
      lv.surgeTo = sgn * Math.max(0.3, Math.min(0.9, 0.15 * camD)) * (0.6 + 0.55 * this.thrashOf(f));
      lv.surgeHold = 0.3;
      const fx = p.x + sx * lv.surge;
      const fz = p.z + sz * lv.surge;
      this.signs?.crown(fx, p.y, fz, this.onScreen(ctx, p, 0.6 + L), 4, 0.5, Math.atan2(sz * sgn, sx * sgn));
      this.signs?.splash(fx, p.y, fz, Math.min(1.2, 0.4 + L) * 0.35, 0);
      this.sounds.play('thrash', Math.min(0.6, 0.25 + L * 0.4));
    }
    if (lv.surgeHold <= 0 || !close) lv.surgeTo = 0;
    lv.surgeV += (40 * (lv.surgeTo - lv.surge) - 9 * lv.surgeV) * dt;
    lv.surge += lv.surgeV * dt;
    lv.offX = sx * lv.surge;
    lv.offZ = sz * lv.surge;
    p.x += lv.offX;
    p.z += lv.offZ;
    // thrash bursts (docs/V3/plan/fishing-feel.md §8, the user's word, 2026-11-24): every second or three while it has
    // its strength it breaks the surface, half out, beating hard and rolling, and throws a burst of spray the way it
    // goes — the rod snatched, the view jolted, the needle kicked
    lv.burstT -= dt;
    lv.burst = Math.max(0, lv.burst - dt * 1.7);
    if ((ph === 'swim' || ph === 'run' || ph === 'rest') && lv.jumpT < 0 && f.depth < 0.5 && lv.burstT <= 0) {
      lv.burstT = (0.8 + 1.2 * Math.random()) / (0.5 + f.stamina);
      lv.burst = 1;
      lv.burstSide = Math.random() < 0.5 ? -1 : 1;
      const k = Math.min(1, 0.45 + 0.4 * L + 0.3 * f.stamina);
      this.signs?.crown(p.x, p.y, p.z, this.onScreen(ctx, p, 1.3 + 2.2 * L, 0.2), 9, 0.75, yaw);
      this.signs?.splash(p.x, p.y, p.z, 0.5 + 0.5 * k, 0);
      this.signs?.ring(p.x, p.y, p.z, 1 + 1.5 * L, 1.1);
      this.sounds.play('thrash', Math.min(1, 0.5 + L * 0.5));
      this.rod?.burst(k);
      this.shake.kick(-0.45 * k, (Math.random() - 0.5) * 0.5 * k, lv.burstSide * 0.3 * k);
      this.needleKick = Math.max(this.needleKick, 0.12 * k);
    }
    // spent: over on its side, belly up a little; else upright, rocking with its beat
    lv.flash = Math.max(0, lv.flash - dt * 2.4);
    const rollTo = ph === 'spent' ? 1.25 : lv.flash * 1.2 * lv.flashDir;
    lv.roll += (rollTo - lv.roll) * Math.min(1, dt * 2.5);
    let y = st.level - (ph === 'run' || ph === 'swim' ? 0.08 : 0.2) * L - f.depth * (0.5 + 0.8 * L) + Math.sin(Math.min(1, lv.flash) * Math.PI) * 0.35 * L;
    // (half out of the water in a burst, head up; porpoising on a run)
    const lift = Math.sin(Math.min(1, lv.burst) * Math.PI);
    y += lift * 0.4 * L;
    let pitch = -0.12 * f.depth + 0.55 * lift + (ph === 'run' ? 0.12 * Math.sin(lv.beat * 0.5) : 0);
    if (lv.jumpT >= 0) {
      // the leap: out of the water and back in, nose up and then down
      lv.jumpT += dt;
      const u = Math.min(1, lv.jumpT / LEAP_S);
      y = st.level + 4 * Math.min(2.2, 0.9 + 0.8 * L) * u * (1 - u) - 0.1 * L;
      // (water streaming off it in the air)
      if (u < 0.9) this.signs?.spray(p.x, y, p.z, 2, 1.2);
      pitch = (0.5 - u) * 1.7;
      if (u >= 1) {
        lv.jumpT = -1;
        this.signs?.splash(p.x, p.y, p.z, Math.min(1.5, 0.6 + L * 0.5), 0);
        this.signs?.crown(p.x, p.y, p.z, this.onScreen(ctx, p, Math.min(3.2, 1.6 + L * 1.4)), 10, 0.95);
        this.sounds.play('splash', Math.min(1, 0.5 + L * 0.4));
      }
    } else if (ph === 'spent') y = st.level - 0.05 * L;
    // (the white water it throws as it runs, fishing-feel.md §4: a V of streaks behind it, the harder it goes the longer)
    const vx = (p.x - lv.px) / Math.max(1e-3, dt);
    const vz = (p.z - lv.pz) / Math.max(1e-3, dt);
    const sp = Number.isNaN(lv.px) ? 0 : Math.hypot(vx, vz);
    lv.px = p.x;
    lv.pz = p.z;
    lv.wakeT -= dt;
    if (lv.wakeT <= 0 && lv.jumpT < 0 && f.depth < 0.55 && ph !== 'spent' && !close) {
      const k = Math.min(1.5, sp / 2.2) * (ph === 'run' ? 1.25 : 0.85);
      // (only a fish going at a clip draws a V — one creeping in near the bank would lay its Vs over each other into a
      // comb — and the nearer the eye, the smaller its white water: thin lines, as DREADMOOR's wake is)
      const hard = ph === 'run' || f.tell > 0;
      const nearK = Math.max(0.35, Math.min(1, (ctx.core.camera.position.distanceTo(p) - 2) / 6));
      const wl = Math.max(0.3, L) * nearK;
      if ((hard ? sp > 0.4 : sp > 1.1) && sp < 40) this.signs?.wake(p.x, p.y, p.z, Math.atan2(vz, vx), wl, k);
      // (a running fish throws a trail of spray off its tail)
      if (hard && sp > 0.8 && sp < 40) this.signs?.spray(p.x - (vx / sp) * L * 0.5, p.y + 0.04, p.z - (vz / sp) * L * 0.5, 3, 1.5 + 0.4 * k);
      if (hard || (lv.churnN = (lv.churnN + 1) % 3) === 0) this.signs?.churn(p.x, p.y, p.z, wl, hard ? 1 : 0.6);
      lv.wakeT = hard ? 0.08 + 0.1 / (0.6 + k) : 0.16;
    }
    g.position.set(p.x, y, p.z);
    // (it rolls as it fights, flashing its side, and shakes its head; hardest in a burst; hardly at all spent)
    const writhe = ph === 'spent' ? 0.2 : 1;
    g.rotation.set(lv.roll + Math.sin(lv.beat * 0.5) * (0.38 + 0.5 * lv.burst) * writhe * (lv.burst > 0 ? lv.burstSide : 1), -yaw + Math.sin(lv.beat * 0.9 + 1) * (0.2 + 0.3 * lv.burst) * writhe, pitch, 'YZX');
    // (drawn the larger the further off it fights, up to 2.2 times: a fish out on the water reads as one; near, its own
    // size — a little fuller in the body than its model, so seen from above it is no sliver)
    const sc = L * Math.max(1, Math.min(2.2, ctx.core.camera.position.distanceTo(g.position) / 4.5));
    g.scale.set(sc, sc * 1.12, sc * 1.32);
    // the water it breaks: spray on a run, rings as it swims, a slow ring spent
    lv.splashT -= dt;
    if (lv.splashT <= 0 && lv.jumpT < 0 && f.depth < 0.5) {
      const k = Math.min(1.3, 0.3 + L * 0.6);
      if (ph === 'run' || f.tell > 0) {
        this.signs?.splash(p.x, p.y, p.z, k * 0.45, 0);
        lv.splashT = 0.2 + 0.12 * Math.random();
      } else if (ph === 'swim' || ph === 'zap') {
        this.signs?.ring(p.x, p.y, p.z, 0.5 + k, 1);
        if (Math.random() < 0.35) this.signs?.splash(p.x, p.y, p.z, k * 0.25, 0);
        lv.splashT = 0.45 + 0.2 * Math.random();
      } else {
        this.signs?.ring(p.x, p.y, p.z, 0.4 + 0.6 * k, 1.6);
        lv.splashT = 1.1;
      }
    }
  }

  /** a thing on its way out of the water: an arc from the water to the boards, turning over */
  private drawFlying(ctx: GameContext): void {
    for (const fl of this.flying) {
      const o = fl.obj;
      if (!o) continue;
      const u = Math.min(1, fl.t / fl.dur);
      const e = u * u * (3 - 2 * u);
      o.position.lerpVectors(fl.from, fl.to, e);
      o.position.y += Math.sin(u * Math.PI) * (fl.big ? 1.3 : 1.8);
      o.rotation.set(Math.sin(u * 9) * 0.5, fl.yaw, Math.sin(u * 7) * 0.6);
      void ctx;
    }
  }

  /** a fish on the boards flopping: its whole body curled up off the boards and slapped down, hops and a roll, dying away (bend.ts) */
  private drawFlops(dt: number): void {
    for (let i = this.flops.length - 1; i >= 0; i--) {
      const f = this.flops[i];
      f.t += dt;
      const model = f.loose.obj.getObjectByName('PART');
      if (f.t >= f.dur || !f.loose.obj.parent) {
        if (model) {
          model.position.y = 0;
          model.rotation.set(0, 0, 0);
          const tail = model.getObjectByName('fish_tail');
          if (tail) tail.rotation.y = 0;
        }
        this.unbend(f);
        this.flops.splice(i, 1);
        continue;
      }
      if (!model || !f.loose.resting) continue;
      // (its own body, bending, in place of the stiff one while it flops)
      if (!f.bent && model.children[0]) {
        const it = f.loose.item;
        const fi = it ? fishOfItem(it.item) : -1;
        if (fi >= 0) {
          const orig = model.children[0];
          const fb = new FishBody(rawFish(fi, (it?.state?.fish?.v ?? 0) as Variant));
          fb.group.position.copy(orig.position);
          fb.group.quaternion.copy(orig.quaternion);
          fb.group.scale.copy(orig.scale);
          model.add(fb.group);
          orig.visible = false;
          f.bent = fb;
          f.orig = orig;
        }
      }
      const left = 1 - f.t / f.dur;
      const beat = f.t * (f.k > 0.8 ? 11 : 7) + f.phase;
      const up = Math.max(0, Math.sin(beat));
      const hop = up * 0.07 * f.k * left;
      model.position.y = hop;
      model.rotation.x = Math.sin(beat * 0.5) * 0.3 * left;
      model.rotation.z = Math.sin(beat) * 0.18 * left;
      if (f.bent) {
        // (lying on its side, its bend is up off the boards: head and tail lifted, then slapped down flat)
        const A = 2.2 * left * (0.6 + 0.4 * f.k);
        const s = up * up - 0.15;
        f.bent.pose((u) => A * s * 1.6 * Math.exp(-(((u - 0.5) / 0.3) ** 2)), 0.5);
      } else {
        const tail = model.getObjectByName('fish_tail');
        if (tail) tail.rotation.y = Math.sin(beat * 2.2) * 0.7 * left;
      }
      if (hop > 0.05 && Math.sin(beat - dt * 8) <= 0) this.sounds.play('slap', 0.35 * f.k * left + 0.1);
    }
  }

  /** a flop over: the stiff body back in place of the bending one */
  private unbend(f: Flop): void {
    f.bent?.dispose();
    if (f.orig) f.orig.visible = true;
    f.bent = null;
    f.orig = null;
  }

  // ================================================================ tips and the developer's ways in

  /** how often a tip has been said (in the save: never again past its count) */
  private told(key: string): number {
    let n = 0;
    for (const t of this.log.told) if (t === key) n++;
    return n;
  }

  private tip(key: string, text: string, times: number): void {
    if (!this.ctx || this.told(key) >= times) return;
    // (a hint for the moment: in place of another hint up, or not at all — counted only when it is said)
    if (announce(this.ctx, text, 2.6, true)) this.log.told.push(key);
  }

  /** off to a water: on the shore by the root of its jetty (the deck is built once the world round it is), then out onto it */
  goTo(ctx: GameContext, spot: number): boolean {
    const st = this.standAt(ctx, spot);
    if (!st) return false;
    const h = Math.atan2(st.fz, st.fx);
    ctx.teleportTo(st.x - st.fx * 1.2, st.z - st.fz * 1.2, -h, false);
    this.settleT = 2.5;
    this.settleSpot = spot;
    this.findT = 0;
    return true;
  }

  private settleSpot = -1;

  /** the address's water, and the walk out onto its jetty once the deck is there */
  private goWanted(ctx: GameContext): void {
    if (this.wantSpot >= 0 && ctx.world) {
      const spot = this.wantSpot;
      this.wantSpot = -1;
      if (this.goTo(ctx, spot) && !this.anyRod(ctx)) this.giveKit(ctx);
    }
    if (this.settleT > 0) {
      this.settleT -= 1 / 60;
      if (this.settleT <= 0 && this.settleSpot >= 0) {
        const st = this.standAt(ctx, this.settleSpot);
        if (st) ctx.player.walker.place(st.x - st.fx * 1.2, st.z - st.fz * 1.2, Math.atan2(st.fz, st.fx), 1.5);
      }
    }
  }

  /** is there a rod in the hotbar now (the cards ask) */
  anyRodNow(): boolean {
    return !!this.ctx && this.anyRod(this.ctx);
  }

  /** is there a rod in the hotbar */
  anyRod(ctx: GameContext): boolean {
    return ctx.player.slots.some((h) => h?.kind === 'item' && rodOfItem(h.item.item) >= 0);
  }

  /** a rod with bait on it into the hands, and a creel: what one fishes with (the developer's tab, ?fish=) */
  giveKit(ctx: GameContext, rodId = 'rod_willow', bait = 'bait_worm', n = 40): void {
    const rod = newItem(rodId);
    putInside(rod, newItem(bait, n > 1 ? { n } : {}), itemNow());
    ctx.player.receive({ kind: 'item', item: rod });
    ctx.player.receive({ kind: 'item', item: newItem('fishing_creel') });
    const i = ctx.player.slots.findIndex((h) => h?.kind === 'item' && h.item === rod);
    if (i >= 0) ctx.player.select(i);
  }

  /** the developer's tab: a fish of this pond comes to the float now (pictures, tests): the nearest that would take the bait, else the nearest */
  rush(): boolean {
    const s = this.session;
    const pond = this.pond;
    if (!s || !pond || s.phase !== 'wait' || s.committed) return false;
    let best = null;
    let bd = Infinity;
    let bw = false;
    for (const f of pond.fish) {
      if (f.state !== 'roam') continue;
      const d = Math.hypot(f.x - s.float.x, f.z - s.float.z);
      const w = appetite(FISH[f.f], f.q, this.rig, this.cond) > 0;
      if ((w && !bw) || (w === bw && d < bd)) {
        bd = d;
        best = f;
        bw = w;
      }
    }
    if (!best) return false;
    best.state = 'come';
    best.t = 0;
    best.shy = 0;
    best.nibbles = 0;
    s.committed = best;
    return true;
  }

  /**
   * The developer's tab and the pictures: a fish of this kind (at this length) held up in the hands as if just caught
   * out of the water ahead — every family's body and flop seen without a fight. False: no water here, no rod in hand.
   */
  holdUp(ctx: GameContext, id: string, cm?: number, variant: Variant = 0): boolean {
    const s = this.session;
    const st = this.stand;
    const f = FISH_INDEX.get(id);
    const rod = this.rodInHands(ctx);
    if (!s || !st || f === undefined || !rod || !this.hold) return false;
    this.hold.warm(ctx.core.renderer, ctx.core.camera);
    if (this.holding) {
      this.holding = null;
      this.hold.end();
    }
    s.abort();
    const def = FISH[f];
    const c = cm ?? Math.round((def.cm[0] + def.cm[1]) / 2);
    const kg = kgOf(def, c);
    const q = kg / kgOf(def, def.cm[1]);
    const item = newItem(fishItem(f), { state: { fish: { cm: c, kg, q, v: variant, m: medalOf(q) } } });
    this.rodUid = rod.uid;
    s.phase = 'reveal';
    this.holding = { item, fish: f, g: 0 };
    const w = ctx.player.walker;
    const o = ctx.core.origin;
    const from = new THREE.Vector3(w.x + Math.cos(w.heading) * 6 - o.x, st.level - o.y, w.z + Math.sin(w.heading) * 6 - o.z);
    const fam = def.family;
    const style = fam === 'eel' ? 's' : fam === 'squid' || fam === 'octopus' || fam === 'crayfish' || fam === 'frog' || fam === 'turtle' || fam === 'cube' ? 'stiff' : 'c';
    this.hold.start(rawFish(f, variant), c / 100, from, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -w.heading), style);
    return true;
  }

  /** what the pond of the water one is at holds now (the developer's tab) */
  pondCensus(): { n: number; tiers: number[]; lord: boolean; sky: boolean } | null {
    const pond = this.pond;
    if (!pond) return null;
    return { n: pond.fish.length, ...pond.census() };
  }

  /** the pond of the water one is at stocked afresh (the developer's tab) */
  restock(ctx: GameContext): void {
    const pond = this.pond;
    if (!pond) return;
    pond.stock(this.cond.day);
    if (this.spot >= 0) this.keepPond(pond);
    this.session?.abort();
    void ctx;
  }
}

const NO_SHADOWS: ShadowSpec[] = [];

/** the waters of the ten inland, in their order: a wild lake's fish by how far down the road it lies, one every WILD_STEP m */
const FRESH: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 8, 9];
const WILD_STEP = 30_000;

/** a length (cm) as said: "48 厘米", "1.2 米" */
export function fmtCm(cm: number): string {
  return cm >= 100 ? `${(cm / 100).toFixed(2)} 米` : `${cm >= 20 ? Math.round(cm) : cm.toFixed(1)} 厘米`;
}

/** a test for points on a water's jetty deck (its footprint, a little in from its edge) */
function jettyRect(ctx: GameContext, spot: number, grow = 0): ((x: number, z: number) => boolean) | null {
  const world = ctx.world;
  if (!world) return null;
  const sp = SPOTS[spot];
  let j: { x: number; z: number; w: number; d: number; yaw: number } | null = null;
  for (let k = sp.slot - 2; k <= sp.slot + 2 && !j; k++) {
    if (k < 0) continue;
    const site = world.sites.sitesOf(k).find((s) => s.id === sp.site);
    const o = site?.objects.find((q) => q.kind === 'jetty');
    if (o) j = { x: o.x, z: o.z, w: o.w, d: o.d, yaw: o.yaw };
  }
  if (!j) return null;
  const c = Math.cos(j.yaw);
  const s = Math.sin(j.yaw);
  const hw = j.w / 2 - 0.25 + grow;
  const hd = Math.max(0.3, j.d / 2 - 0.35 + grow);
  return (x, z) => {
    const dx = x - j!.x;
    const dz = z - j!.z;
    return Math.abs(dx * c + dz * s) <= hw && Math.abs(-dx * s + dz * c) <= hd;
  };
}

/** the time a wait for the strike lasts at most in the hour's light (tests read it) */
export function isNightHour(hour: number): boolean {
  return !inSpan([5, 20], hour);
}

/** the tiers' colours as the cards show them */
export const TIER_COLOUR: readonly string[] = TIERS.map((t) => t.color);
