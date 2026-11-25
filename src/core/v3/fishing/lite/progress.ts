/**
 * The angler's side of the casual fishing module (docs/V3/nodes/F2-fishing-lite.md §7–11): coins, the keepnet,
 * the live-bait bucket, the journal and its records, the hut's shop, the licences, the tackle box, the charms and
 * rods earned by goals, the day's orders, what a junk catch gives, and the clock and the sky's moments. One plain
 * object (`FishingSave`) holds all of it, so the page saves it as it is.
 *
 * Pure: no three, no DOM. The page and the tests drive it through `Angler`.
 */
import { BAITS, BAIT_INDEX, baitIndexOf, CHARMS, CHARM_INDEX, NET_SIZE, rodIdNow, RODS, ROD_INDEX, STAR_TIER, TACKLE_MAX, tacklePrice } from './gear';
import { FISH, FISH_INDEX, fishOfSpot } from './fish';
import { dice, inSpan, levelOf, medalOf, partOf, rollVariant, Stream, valueOf, xpOf, PITY_AT, type Rig } from './rules';
import type { Landed } from './session';
import { SPOTS } from './spots';
import { NIGHT, TACKLE_LINES, TIERS, type Catch, type Junk, type Medal, type TackleLine, type Variant } from './types';

// ------------------------------------------------------------------ the clock

/** seconds of play to a day of the world's (an hour a minute) */
export const DAY_LENGTH = 1440;
/** the hour the journey's clock begins at, and the hour a new day (a new stock, new orders) begins at */
export const START_HOUR = 6.5;
export const DAY_BEGINS = 5;

/** the world's day (a new one each morning at five) and hour at world seconds t */
export function clockOf(t: number): { day: number; hour: number } {
  const hours = START_HOUR + (t / DAY_LENGTH) * 24;
  return { day: Math.floor((hours - DAY_BEGINS) / 24), hour: ((hours % 24) + 24) % 24 };
}

/** the world seconds at which a day reaches an hour (the hour after DAY_BEGINS belongs to that day) */
export function timeOf(day: number, hour: number): number {
  const h = hour < DAY_BEGINS ? hour + 24 : hour;
  return ((day * 24 + h - START_HOUR) / 24) * DAY_LENGTH;
}

// ------------------------------------------------------------------ the sky's moments

/** is the water's celestial moment on? (every other day, in its hours; the dream only once the other nine are found) */
export function skyMoment(spot: number, day: number, hour: number, found: (fishId: string) => boolean): boolean {
  const sp = SPOTS[spot];
  if ((day + spot) % 2 !== 0) return false;
  if (!inSpan(sp.eventSpan, hour)) return false;
  if (sp.event === 'dream') {
    for (let s = 0; s < SPOTS.length - 1; s++) {
      const sky = fishOfSpot(s).find((i) => FISH[i].tier === 5);
      if (sky !== undefined && !found(FISH[sky].id)) return false;
    }
  }
  return true;
}

/** a full-moon night at the crater (its lord comes only then): one night in three */
export function fullMoon(day: number): boolean {
  return ((day % 3) + 3) % 3 === 1;
}

/** the next time a water's moment begins at or after (day, hour): its day and the hour it begins */
export function nextMoment(spot: number, day: number, hour: number): { day: number; hour: number } {
  const sp = SPOTS[spot];
  for (let d = day; d < day + 4; d++) {
    if ((d + spot) % 2 !== 0) continue;
    // (a span past midnight belongs to the evening it begins on)
    const end = sp.eventSpan[1] > sp.eventSpan[0] ? sp.eventSpan[1] : sp.eventSpan[1] + 24;
    const h = d === day ? (hour < DAY_BEGINS ? hour + 24 : hour) : -1;
    if (h < end) return { day: d, hour: sp.eventSpan[0] };
  }
  return { day: day + 1, hour: sp.eventSpan[0] };
}

// ------------------------------------------------------------------ the save

export interface NetFish {
  uid: number;
  fish: number;
  cm: number;
  kg: number;
  q: number;
  variant: Variant;
  medal: Medal;
  value: number;
}

export interface JournalEntry {
  /** how many were caught, the longest (cm) and heaviest, the best medal, the colours met (a bit each), the day first caught */
  n: number;
  cm: number;
  kg: number;
  medal: Medal;
  vars: number;
  day: number;
}

export type OrderKind = 'count' | 'size' | 'tier' | 'variant' | 'night' | 'medal';

export interface Order {
  kind: OrderKind;
  /** the fish asked for (index into FISH), how many, the least length (cm) or rarity or medal */
  fish: number;
  n: number;
  min: number;
  have: number;
  coins: number;
  bait?: string;
  baitN?: number;
  star?: number;
  done: boolean;
}

export interface FishingSave {
  v: 1;
  coins: number;
  xp: number;
  /** world seconds played */
  t: number;
  spot: number;
  licences: number[];
  rods: string[];
  rod: string;
  baits: Record<string, number>;
  /** the bait on the hook: a bait id, or 'live:<fish id>' */
  bait: string;
  charms: string[];
  worn: string[];
  tackle: Record<TackleLine, number>;
  net: NetFish[];
  /** the live-bait bucket: fish id → how many */
  live: Record<string, number>;
  journal: Record<string, JournalEntry>;
  stats: { casts: number; catches: number; perfect: number; lost: number; sold: number; variants: number; golds: number; orders: number; crates: number; junk: number; released: number };
  orders: { day: number; spot: number; list: Order[] };
  /** each water's stock of the day: which day, the uids landed, the fish added since the morning */
  ponds: Record<string, { day: number; taken: number[]; refills: number }>;
  streak: number;
  pity: number;
  /** lines of help already shown */
  told: string[];
  /** bottles' clues found (the lords' baits) */
  clues: string[];
}

export function newSave(): FishingSave {
  const tackle = {} as Record<TackleLine, number>;
  for (const l of TACKLE_LINES) tackle[l] = 0;
  return {
    v: 1,
    coins: 120,
    xp: 0,
    t: 0,
    spot: 0,
    licences: [0],
    rods: ['rod_willow'],
    rod: 'rod_willow',
    baits: { worm: 60, stardust: 1 },
    bait: 'worm',
    charms: ['float'],
    worn: ['float'],
    tackle,
    net: [],
    live: {},
    journal: {},
    stats: { casts: 0, catches: 0, perfect: 0, lost: 0, sold: 0, variants: 0, golds: 0, orders: 0, crates: 0, junk: 0, released: 0 },
    orders: { day: -1, spot: -1, list: [] },
    ponds: {},
    streak: 0,
    pity: 0,
    told: [],
    clues: [],
  };
}

/** a save read back: anything missing filled in from a new one (a save of an older build) */
export function fixSave(raw: unknown): FishingSave {
  const base = newSave();
  if (!raw || typeof raw !== 'object' || (raw as { v?: number }).v !== 1) return base;
  const s = { ...base, ...(raw as Partial<FishingSave>) } as FishingSave;
  s.tackle = { ...base.tackle, ...(s.tackle ?? {}) };
  s.stats = { ...base.stats, ...(s.stats ?? {}) };
  // (rods retired since: read back as the rod nearest each in power, docs/V3/plan/fishing-feel.md §11)
  s.rod = typeof s.rod === 'string' ? rodIdNow(s.rod) : 'rod_willow';
  s.rods = [...new Set((Array.isArray(s.rods) ? s.rods : []).filter((r) => typeof r === 'string').map(rodIdNow))];
  if (!s.rods.includes('rod_willow')) s.rods.unshift('rod_willow');
  if (!s.rods.includes(s.rod)) s.rod = 'rod_willow';
  s.spot = Math.max(0, Math.min(SPOTS.length - 1, s.spot | 0));
  // (baits retired since, or of no kind there is: counted as the bait they are now, docs/V3/plan/fishing-feel.md §10)
  const baits: Record<string, number> = {};
  for (const [id, n] of Object.entries(s.baits && typeof s.baits === 'object' ? s.baits : {})) {
    if (typeof n !== 'number' || !(n > 0)) continue;
    const now = BAITS[baitIndexOf(id)].id;
    baits[now] = (baits[now] ?? 0) + Math.floor(n);
  }
  s.baits = baits;
  if (typeof s.bait !== 'string') s.bait = 'worm';
  else if (!s.bait.startsWith('live:')) s.bait = BAITS[baitIndexOf(s.bait)].id;
  return s;
}

/** what a reward was, for its toast */
export interface Gift {
  coins: number;
  star: number;
  bait?: [string, number];
  clue?: string;
  charm?: string;
  rod?: string;
  text: string;
}

/** the first water whose hut sells the bait of a tier (the star bait: none): the worm and the spoon from the first, the shrimp from the second, the squid strip from the fourth */
const BAIT_FROM: Readonly<Record<number, number>> = { 0: 0, 1: 0, 2: 1, 3: 3, [STAR_TIER]: 99 };

/** the measure of a water's prices and rewards (what a common fish of it fetched while a fish's worth went by its water) */
export function spotBase(spot: number): number {
  return 4 * Math.pow(1.75, spot);
}

// ------------------------------------------------------------------ the angler

export class Angler {
  constructor(public s: FishingSave) {}

  get level(): number {
    return levelOf(this.s.xp).level;
  }

  get netSize(): number {
    return NET_SIZE[this.s.tackle.net];
  }

  /** what is on the line now (the host's session reads it every step) */
  rig(): Rig {
    const rod = RODS[ROD_INDEX.get(this.s.rod) ?? 0];
    const b = this.s.bait;
    let bait: Rig['bait'];
    if (b.startsWith('live:')) {
      // (a fish alive: the lords' bait, of no tier of its own)
      const f = FISH_INDEX.get(b.slice(5)) ?? 0;
      bait = { kind: 'lure', tier: -1, live: f };
    } else {
      const def = BAITS[baitIndexOf(b)];
      bait = { kind: def.kind, tier: def.tier, star: def.tier === STAR_TIER };
    }
    const charms = this.s.worn.map((id) => CHARMS[CHARM_INDEX.get(id) ?? 0].effect);
    return { rod, bait, charms, tackle: this.s.tackle, streak: this.s.streak, pity: this.s.pity };
  }

  /** how many of the bait on the hook are left (Infinity: a lure is kept) */
  baitLeft(): number {
    const b = this.s.bait;
    if (b.startsWith('live:')) return this.s.live[b.slice(5)] ?? 0;
    const def = BAITS[baitIndexOf(b)];
    return def.lure && (this.s.baits[b] ?? 0) > 0 ? Infinity : (this.s.baits[b] ?? 0);
  }

  hasBait(): boolean {
    return this.baitLeft() > 0;
  }

  /** a bait went on a fish: used up (a lure is not; the bait box saves one now and then) */
  consume(u: number): void {
    const b = this.s.bait;
    if (b.startsWith('live:')) {
      const id = b.slice(5);
      this.s.live[id] = Math.max(0, (this.s.live[id] ?? 0) - 1);
      if (!this.s.live[id]) {
        delete this.s.live[id];
        this.s.bait = this.fallbackBait();
      }
      return;
    }
    const def = BAITS[baitIndexOf(b)];
    if (def.lure) return;
    if (u < 0.06 * this.s.tackle.box) return;
    this.s.baits[b] = Math.max(0, (this.s.baits[b] ?? 0) - 1);
    if (!this.s.baits[b]) this.s.bait = this.fallbackBait();
  }

  /** a lure lost with the line */
  loseLure(): void {
    const b = this.s.bait;
    const def = BAITS[baitIndexOf(b)];
    if (!def.lure) return;
    this.s.baits[b] = Math.max(0, (this.s.baits[b] ?? 0) - 1);
    if (!this.s.baits[b]) this.s.bait = this.fallbackBait();
  }

  /** the bait one is left with when the last of one is gone: the most of the cheapest kind there is */
  private fallbackBait(): string {
    let best = this.s.bait;
    let n = 0;
    for (const def of BAITS) {
      const have = this.s.baits[def.id] ?? 0;
      if (have > n && def.tier !== STAR_TIER) {
        n = have;
        best = def.id;
      }
    }
    return best;
  }

  found(id: string): boolean {
    return (this.s.journal[id]?.n ?? 0) > 0;
  }

  /** kinds in the journal (all ten waters, the celestial ones too) */
  species(): number {
    let n = 0;
    for (const id in this.s.journal) if (this.s.journal[id].n > 0) n++;
    return n;
  }

  /** kinds found of one water (`regular`: not counting its celestial fish) */
  speciesOf(spot: number, regular = true): number {
    let n = 0;
    for (const i of fishOfSpot(spot)) if ((!regular || FISH[i].tier < 5) && this.found(FISH[i].id)) n++;
    return n;
  }

  /**
   * A fish (or junk) landed: its colour rolled, its worth and its lesson reckoned, the journal and the records,
   * the orders and the goals brought up to date. Returns the catch for its card (null for junk, see `junk`).
   */
  finish(l: Landed, night: boolean, day: number, u: number): Catch {
    const def = FISH[l.fish];
    const rig = this.rig();
    const variant = rollVariant(def, rig, u);
    const je = this.s.journal[def.id];
    const first = !je || je.n === 0;
    const record = !first && l.cm > je.cm;
    const newVariant = variant > 0 && !(je && je.vars & (1 << variant));
    const medal = medalOf(l.q);
    const c: Catch = {
      fish: l.fish,
      cm: l.cm,
      kg: l.kg,
      medal,
      variant,
      value: valueOf(def, l.q, variant, rig),
      xp: xpOf(def, l.q, variant, first),
      first,
      record,
      newVariant,
      perfect: l.perfect,
      bonus: l.bonus?.fish,
    };
    const e = je ?? { n: 0, cm: 0, kg: 0, medal: 0 as Medal, vars: 0, day };
    e.n++;
    e.cm = Math.max(e.cm, l.cm);
    e.kg = Math.max(e.kg, l.kg);
    e.medal = Math.max(e.medal, medal) as Medal;
    e.vars |= 1 << variant;
    this.s.journal[def.id] = e;
    this.s.xp += c.xp;
    const st = this.s.stats;
    st.catches++;
    if (l.perfect) st.perfect++;
    if (variant > 0) st.variants++;
    if (medal >= 3) st.golds++;
    this.s.streak = l.perfect ? this.s.streak + 1 : 0;
    this.s.pity = variant > 0 || def.tier >= 4 ? 0 : this.s.pity + 1;
    if (this.s.pity >= PITY_AT) this.s.pity = 0;
    // the twin hook's small one goes straight into the journal and the net
    if (l.bonus) {
      const bd = FISH[l.bonus.fish];
      const be = this.s.journal[bd.id] ?? { n: 0, cm: 0, kg: 0, medal: 0 as Medal, vars: 0, day };
      be.n++;
      be.cm = Math.max(be.cm, l.bonus.cm);
      be.kg = Math.max(be.kg, l.bonus.kg);
      be.vars |= 1;
      this.s.journal[bd.id] = be;
      if (this.s.net.length < this.netSize) this.s.net.push({ uid: -2, fish: l.bonus.fish, cm: l.bonus.cm, kg: l.bonus.kg, q: l.bonus.q, variant: 0, medal: medalOf(l.bonus.q), value: valueOf(bd, l.bonus.q, 0, rig) });
    }
    this.progressOrders(c, night);
    return c;
  }

  /** into the keepnet (false: it is full) */
  keep(c: Catch, uid: number, q: number): boolean {
    if (this.s.net.length >= this.netSize) return false;
    this.s.net.push({ uid, fish: c.fish, cm: c.cm, kg: c.kg, q, variant: c.variant, medal: c.medal, value: c.value });
    return true;
  }

  /** back into the water: experience instead of coins (twice as much from level 15) */
  release(c: Catch): number {
    const xp = Math.round(c.xp * (this.level >= 15 ? 1 : 0.5));
    this.s.xp += xp;
    this.s.stats.released++;
    return xp;
  }

  /** a fish one can put on the hook alive (from level 5): small ones, and a lord's own bait whatever its size */
  canLive(c: Catch): boolean {
    if (this.level < 5) return false;
    const def = FISH[c.fish];
    if (def.tier >= 4) return false;
    if (c.kg <= 0.5) return true;
    return FISH.some((f) => f.live === def.id);
  }

  toLive(c: Catch): void {
    const id = FISH[c.fish].id;
    this.s.live[id] = Math.min(10, (this.s.live[id] ?? 0) + 1);
  }

  /** sell everything in the keepnet */
  sellAll(): number {
    let sum = 0;
    for (const f of this.s.net) sum += f.value;
    this.s.net = [];
    this.s.coins += sum;
    this.s.stats.sold += sum;
    return sum;
  }

  sellOne(i: number): number {
    const f = this.s.net[i];
    if (!f) return 0;
    this.s.net.splice(i, 1);
    this.s.coins += f.value;
    this.s.stats.sold += f.value;
    return f.value;
  }

  // ---------------------------------------------------------------- the hut

  /** which baits the hut of the water one is at sells */
  baitsHere(): string[] {
    return BAITS.filter((b) => b.tier !== STAR_TIER && this.s.spot >= (BAIT_FROM[b.tier] ?? 99)).map((b) => b.id);
  }

  buyBait(id: string): boolean {
    const def = BAITS[BAIT_INDEX.get(id) ?? -1];
    if (!def || !this.baitsHere().includes(id)) return false;
    const price = def.price * def.pack;
    if (this.s.coins < price) return false;
    this.s.coins -= price;
    this.s.baits[id] = (this.s.baits[id] ?? 0) + def.pack;
    return true;
  }

  selectBait(id: string): boolean {
    if (id.startsWith('live:')) {
      if (!(this.s.live[id.slice(5)] > 0)) return false;
    } else if (!(this.s.baits[id] > 0)) return false;
    this.s.bait = id;
    return true;
  }

  /** rods the hut of this water sells (the carbon at the second water, the pro at the fifth, the sea rod at the sea bay, the eighth) */
  rodsHere(): string[] {
    return RODS.filter((r) => r.shop === this.s.spot).map((r) => r.id);
  }

  buyRod(id: string): boolean {
    const i = ROD_INDEX.get(id);
    if (i === undefined) return false;
    const r = RODS[i];
    if (r.shop !== this.s.spot || this.s.rods.includes(id) || this.s.coins < r.price) return false;
    this.s.coins -= r.price;
    this.s.rods.push(id);
    this.s.rod = id;
    return true;
  }

  equipRod(id: string): boolean {
    if (!this.s.rods.includes(id)) return false;
    this.s.rod = id;
    return true;
  }

  upgrade(line: TackleLine): boolean {
    const lv = this.s.tackle[line];
    const price = tacklePrice(line, lv);
    if (lv >= TACKLE_MAX || this.s.coins < price) return false;
    this.s.coins -= price;
    this.s.tackle[line] = lv + 1;
    return true;
  }

  /** charm slots: one, two from level 12 */
  charmSlots(): number {
    return this.level >= 12 ? 2 : 1;
  }

  wear(id: string): boolean {
    if (!this.s.charms.includes(id)) return false;
    if (this.s.worn.includes(id)) {
      this.s.worn = this.s.worn.filter((w) => w !== id);
      if (!this.s.worn.length) this.s.worn = ['float'];
      return true;
    }
    const slots = this.charmSlots();
    const worn = this.s.worn.filter((w) => w !== 'float');
    worn.push(id);
    this.s.worn = worn.slice(-slots);
    return true;
  }

  /** whether a water can be gone to: licensed, and the one before it known well enough */
  canEnter(spot: number): { ok: boolean; licensed: boolean; why: string } {
    const licensed = this.s.licences.includes(spot);
    if (licensed) return { ok: true, licensed, why: '' };
    if (spot > 0 && this.speciesOf(spot - 1) < 6) return { ok: false, licensed, why: `先在${SPOTS[spot - 1].zh}钓到 6 种鱼（现在 ${this.speciesOf(spot - 1)} 种）` };
    if (this.s.coins < SPOTS[spot].licence) return { ok: false, licensed, why: `许可证 ${SPOTS[spot].licence} 硬币` };
    return { ok: true, licensed, why: '' };
  }

  buyLicence(spot: number): boolean {
    const c = this.canEnter(spot);
    if (c.licensed || !c.ok) return false;
    this.s.coins -= SPOTS[spot].licence;
    this.s.licences.push(spot);
    return true;
  }

  travel(spot: number): boolean {
    if (!this.s.licences.includes(spot)) return false;
    this.s.spot = spot;
    return true;
  }

  // ---------------------------------------------------------------- goals: charms and rods earned

  /** charms and rods earned since the last look (each once): their ids */
  unlocks(): { charms: string[]; rods: string[] } {
    const out = { charms: [] as string[], rods: [] as string[] };
    const sp = this.species();
    const st = this.s.stats;
    for (const c of CHARMS) {
      if (this.s.charms.includes(c.id)) continue;
      let ok = false;
      if (c.id === 'bell') ok = st.catches >= 1;
      else if (c.goal) {
        const g = c.goal;
        ok = g.kind === 'species' ? sp >= g.n : g.kind === 'order' ? st.orders >= g.n : g.kind === 'golds' ? st.golds >= g.n : g.kind === 'sold' ? st.sold >= g.n : g.kind === 'crate' ? st.crates >= g.n : st.variants >= g.n;
      }
      if (ok) {
        this.s.charms.push(c.id);
        out.charms.push(c.id);
      }
    }
    // (the one rod earned, not sold: the night rod, for ten orders done)
    const rodGoals: Record<string, () => boolean> = {
      rod_heron: () => st.orders >= 10,
    };
    for (const id in rodGoals) {
      if (!this.s.rods.includes(id) && rodGoals[id]()) {
        this.s.rods.push(id);
        out.rods.push(id);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- junk

  /** what a junk catch gives (its dice from the caller) */
  junk(kind: Junk, u: number): Gift {
    const base = spotBase(this.s.spot);
    this.s.stats.junk++;
    const r = new Stream(Math.floor(u * 1e9));
    switch (kind) {
      case 'boot':
        return { coins: 0, star: 0, text: '一只旧靴子。里面住着一只小螃蟹。' };
      case 'can':
        return { coins: 1, star: 0, text: '一个易拉罐。卖了 1 个硬币。' };
      case 'bottle': {
        const lords = FISH.filter((f) => f.tier === 4);
        const lord = lords[Math.min(lords.length - 1, this.s.spot)];
        const live = lord.live ? FISH[FISH_INDEX.get(lord.live) ?? 0].zh : '';
        const span = lord.span ? `${fmtHour(lord.span[0])}–${fmtHour(lord.span[1])}` : '';
        const clue = `${lord.zh}只吃活的${live}，${span}出没。`;
        if (!this.s.clues.includes(lord.id)) this.s.clues.push(lord.id);
        const star = r.next() < 0.25 ? 1 : 0;
        const coins = Math.round(base * (3 + 4 * r.next()));
        this.s.coins += coins;
        this.s.baits.stardust = (this.s.baits.stardust ?? 0) + star;
        return { coins, star, clue, text: `漂流瓶里的纸条：「${clue}」` + (star ? ' 瓶底还有一撮星屑。' : '') };
      }
      case 'crate': {
        this.s.stats.crates++;
        if (this.s.spot === 7 && !this.s.told.includes('crate@7')) this.s.told.push('crate@7');
        const coins = Math.round(base * (20 + 40 * r.next()));
        const star = r.next() < 0.4 ? 1 : 0;
        this.s.coins += coins;
        this.s.baits.stardust = (this.s.baits.stardust ?? 0) + star;
        return { coins, star, text: `一个沉船上的木箱：${coins} 个硬币` + (star ? '，还有一包星屑饵。' : '。') };
      }
      case 'pearl': {
        const coins = Math.round(base * 60);
        this.s.coins += coins;
        return { coins, star: 0, text: `一颗大珍珠！卖了 ${coins} 个硬币。` };
      }
    }
  }

  // ---------------------------------------------------------------- orders

  /** the board's three orders for a water and a day (made the first time they are asked for) */
  orders(spot: number, day: number): Order[] {
    const o = this.s.orders;
    if (o.day === day && o.spot === spot) return o.list;
    o.day = day;
    o.spot = spot;
    o.list = makeOrders(spot, day);
    return o.list;
  }

  private progressOrders(c: Catch, night: boolean): void {
    const o = this.s.orders;
    if (o.spot !== this.s.spot) return;
    const def = FISH[c.fish];
    for (const ord of o.list) {
      if (ord.done) continue;
      let hit = false;
      if (ord.kind === 'count') hit = c.fish === ord.fish;
      else if (ord.kind === 'size') hit = c.fish === ord.fish && c.cm >= ord.min;
      else if (ord.kind === 'tier') hit = def.tier >= ord.min;
      else if (ord.kind === 'variant') hit = c.variant > 0;
      else if (ord.kind === 'night') hit = night;
      else if (ord.kind === 'medal') hit = c.medal >= ord.min;
      if (hit) ord.have++;
    }
  }

  /** orders done since the last look: their rewards given (each once) */
  claim(): Gift[] {
    const out: Gift[] = [];
    for (const ord of this.s.orders.list) {
      if (ord.done || ord.have < ord.n) continue;
      ord.done = true;
      this.s.stats.orders++;
      this.s.coins += ord.coins;
      if (ord.bait) this.s.baits[ord.bait] = (this.s.baits[ord.bait] ?? 0) + (ord.baitN ?? 0);
      if (ord.star) this.s.baits.stardust = (this.s.baits.stardust ?? 0) + ord.star;
      out.push({ coins: ord.coins, star: ord.star ?? 0, bait: ord.bait ? [ord.bait, ord.baitN ?? 0] : undefined, text: `委托完成：${orderText(ord)}` });
    }
    return out;
  }
}

export function fmtHour(h: number): string {
  const hh = Math.floor(((h % 24) + 24) % 24);
  const mm = Math.round((h - Math.floor(h)) * 60);
  return `${hh}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`;
}

/** an order's line on the board */
export function orderText(o: Order): string {
  const name = o.fish >= 0 ? FISH[o.fish].zh : '';
  switch (o.kind) {
    case 'count':
      return `钓 ${o.n} 条${name}`;
    case 'size':
      return `一条 ${o.min} 厘米以上的${name}`;
    case 'tier':
      return `钓 ${o.n} 条${TIERS[o.min].zh}或更稀有的鱼`;
    case 'variant':
      return '钓到一条带品相的鱼';
    case 'night':
      return `夜里钓 ${o.n} 条鱼`;
    case 'medal':
      return `钓一条${['', '铜', '银', '金', '钻石'][o.min]}牌以上的鱼`;
  }
}

/** the three orders of a water's board on a day: the same for everyone */
export function makeOrders(spot: number, day: number): Order[] {
  const r = new Stream(spot * 4099 + day * 131 + 7);
  const base = spotBase(spot);
  const kinds: OrderKind[] = ['count', 'size', 'tier', 'variant', 'night', 'medal'];
  // (a count and a size every day; one of the others)
  const pick: OrderKind[] = ['count', 'size', kinds[2 + r.int(4)]];
  const small = fishOfSpot(spot).filter((i) => FISH[i].tier <= 1);
  const out: Order[] = [];
  // (the bait of a tier: one to each)
  const nextBait = (tier: number): string | undefined => BAITS.find((b) => b.tier === tier)?.id;
  for (const kind of pick) {
    const f = small[r.int(small.length)];
    const o: Order = { kind, fish: -1, n: 1, min: 0, have: 0, coins: 0, done: false };
    switch (kind) {
      case 'count':
        o.fish = f;
        o.n = FISH[f].tier === 0 ? 4 : 2;
        o.coins = Math.round(base * 9 * o.n * (FISH[f].tier + 1));
        break;
      case 'size':
        o.fish = f;
        o.min = Math.round(FISH[f].cm[0] + (FISH[f].cm[1] - FISH[f].cm[0]) * 0.72);
        o.coins = Math.round(base * 45 * (FISH[f].tier + 1));
        break;
      case 'tier':
        o.n = 2;
        o.min = 2;
        o.coins = Math.round(base * 50);
        o.bait = nextBait(Math.min(3, 1 + Math.floor(spot / 2)));
        // (a lure is kept till the line parts: one is as good as a pack)
        o.baitN = o.bait && BAITS[BAIT_INDEX.get(o.bait) ?? 0].lure ? 1 : 5;
        break;
      case 'variant':
        o.coins = Math.round(base * 40);
        o.star = 1;
        break;
      case 'night':
        o.n = 3;
        o.coins = Math.round(base * 30);
        break;
      case 'medal':
        o.min = 2;
        o.coins = Math.round(base * 45);
        o.star = r.next() < 0.3 ? 1 : 0;
        break;
    }
    out.push(o);
  }
  return out;
}

/** is an hour night (for the orders and the charms) */
export function isNight(hour: number): boolean {
  return partOf(hour) === NIGHT;
}

/** a die for a catch's colour, by the angler's casts (the page keeps the count) */
export function catchDie(casts: number, uid: number): number {
  return dice(casts, uid, 0xc01);
}
