/**
 * The compendium's record beside the fish (docs/V3/plan/finish.md §十四: Tab 的图鉴 — 鱼、车、收藏、照片): how far each
 * sort of vehicle has been driven, which keepsakes have been in the hands (the bobbleheads, the tapes, the paintings,
 * the licence plates) and the photographs taken. It is counted as the game goes — ModGame steps it with what is
 * driven and what is held — and kept in the save; the page that shows it is the journal's (v3/fishing/journalUi.ts).
 */
import { FRAMES } from '../../core/modcar/frames';
import { itemDef, type ItemInstance } from '../../core/modcar/items';
import { BOBBLES } from '../../core/v3/nd/bobble';
import { GRADES, plateText, REGIONS, TIERS, type PlateRoll } from '../../core/v3/nd/plates';
import { TAPES } from '../../core/v3/nd/tapes';
import { PICTURES } from './nd/canvasArt';

/** a row of a page of the compendium: under which heading, its name, a word beside it, whether it has been met; its side panel's lines */
export interface JournalRow {
  group: string;
  name: string;
  value: string;
  known: boolean;
  lines: (readonly [string, string])[];
  note: string;
  /** a photograph: its picture's key in the photo store */
  picture?: string;
}

export interface JournalSection {
  id: string;
  title: string;
  /** the line at the head of the page (html) */
  count: string;
  rows: JournalRow[];
}

interface PlateKept {
  text: string;
  region: number;
  grade: number;
  tier: number;
  oneIn: number;
}

interface PhotoKept {
  key: string;
  day: number;
  km: number;
}

export interface JournalSave {
  /** metres driven by each sort of vehicle */
  cars?: Record<string, number>;
  /** keepsakes that have been in the hands: a kind's id; a painting as pic:<n> */
  keeps?: string[];
  plates?: PlateKept[];
  photos?: PhotoKept[];
}

/** a vehicle counts as driven after this far (m) */
const DRIVEN_M = 30;
/** how many plates and photographs the record keeps (the rarest plates, the latest photographs) */
const PLATES_KEPT = 60;
const PHOTOS_KEPT = 80;

const FRAME_ID = 'nd_frame';
const PLATE_ID = 'nd_plate';
const PHOTO_ID = 'nd_photo';
const KINDS: ReadonlySet<string> = new Set<string>([...BOBBLES, ...TAPES.map((t) => t.id)]);

const km = (m: number): string => (m >= 10_000 ? `${Math.round(m / 1000)} 公里` : `${(m / 1000).toFixed(1)} 公里`);

function nameOf(id: string): string {
  try {
    return itemDef(id).name.zh;
  } catch {
    return id;
  }
}

export class JournalBook {
  private cars: Record<string, number> = {};
  private readonly keeps = new Set<string>();
  private plates: PlateKept[] = [];
  private photos: PhotoKept[] = [];
  /** the thing last looked at in the hands (looked at once, as it is taken up) */
  private lastUid = '';
  /** counts up as the record grows: the page draws again */
  rev = 0;

  /** a step of the game: the sort of vehicle driven (null: on foot) and how fast (m/s), what is in the hands, the day it is */
  step(dt: number, frame: string | null, speed: number, held: ItemInstance | null, day: number): void {
    if (frame && speed > 0.5) this.cars[frame] = (this.cars[frame] ?? 0) + speed * dt;
    if (!held) {
      this.lastUid = '';
      return;
    }
    if (held.uid === this.lastUid) return;
    if (this.meet(held, day)) this.lastUid = held.uid;
  }

  /** a thing taken into the hands: a keepsake is written down; false: it is one whose own roll is not made yet (looked at again) */
  private meet(held: ItemInstance, day: number): boolean {
    const id = held.item;
    if (KINDS.has(id)) {
      if (!this.keeps.has(id)) {
        this.keeps.add(id);
        this.rev++;
      }
      return true;
    }
    if (id === FRAME_ID) {
      const k = held.state?.picture;
      if (k === undefined) return false;
      const key = `pic:${((Math.round(k) % PICTURES.length) + PICTURES.length) % PICTURES.length}`;
      if (!this.keeps.has(key)) {
        this.keeps.add(key);
        this.rev++;
      }
      return true;
    }
    if (id === PLATE_ID) {
      const p = held.state?.plate as PlateRoll | undefined;
      if (!p) return false;
      const text = plateText(p);
      if (!this.plates.some((x) => x.text === text)) {
        this.plates.push({ text, region: p.region, grade: p.grade, tier: p.tier, oneIn: p.oneIn });
        // (the rarest first; past what is kept, the commonest go)
        this.plates.sort((a, b) => b.oneIn - a.oneIn);
        if (this.plates.length > PLATES_KEPT) this.plates.length = PLATES_KEPT;
        this.rev++;
      }
      return true;
    }
    if (id === PHOTO_ID) {
      const ph = held.state?.photo;
      if (!ph?.key) return false;
      if (!this.photos.some((x) => x.key === ph.key)) {
        this.photos.push({ key: ph.key, day, km: Math.round((ph.s ?? 0) / 100) / 10 });
        if (this.photos.length > PHOTOS_KEPT) this.photos.splice(0, this.photos.length - PHOTOS_KEPT);
        this.rev++;
      }
      return true;
    }
    return true;
  }

  /** the pages after the fish: the vehicles, the keepsakes, the photographs */
  sections(): JournalSection[] {
    // ---- the vehicles (what is towed is not driven)
    const frames = FRAMES.filter((f) => f.id !== 'trailer');
    const carRows = frames.map((f): JournalRow => {
      const m = this.cars[f.id] ?? 0;
      const known = m >= DRIVEN_M;
      return { group: '', name: known ? f.name.zh : '？？？', value: known ? km(m) : '', known, lines: known ? [['开过', km(m)]] : [], note: known ? '' : '还没开过。' };
    });
    const driven = carRows.filter((r) => r.known).length;
    // ---- the keepsakes
    const keepRows: JournalRow[] = [];
    const fixed = (group: string, key: string, name: string, note: string): void => {
      const known = this.keeps.has(key);
      keepRows.push({ group, name: known ? name : '？？？', value: '', known, lines: [], note: known ? note : '还没见过。' });
    };
    for (const id of BOBBLES) fixed('摇头娃娃', id, nameOf(id), '只在埋着的箱子里。放在仪表台上，一路跟着车点头。');
    for (const t of TAPES) fixed('磁带', t.id, t.title, '放进车上的收音机里听。');
    PICTURES.forEach((name, i) => fixed('画', `pic:${i}`, name, '装在画框里，能挂到车厢的墙上。'));
    const met = keepRows.filter((r) => r.known).length;
    const total = keepRows.length;
    for (const p of this.plates) {
      keepRows.push({
        group: '车牌',
        name: p.text,
        value: TIERS[p.tier]?.zh ?? '',
        known: true,
        lines: [
          ['哪里的', REGIONS[p.region]?.name ?? ''],
          ['成色', GRADES[p.grade]?.zh ?? ''],
          ['多少见', `${Math.round(p.oneIn).toLocaleString('en-US')} 块里有一块`],
        ],
        note: '',
      });
    }
    // ---- the photographs, the latest first
    const photoRows = [...this.photos].reverse().map(
      (p): JournalRow => ({
        group: '',
        name: `第 ${p.day} 天`,
        value: `${p.km.toFixed(1)} 公里`,
        known: true,
        lines: [
          ['哪天拍的', `第 ${p.day} 天`],
          ['在哪', `路上 ${p.km.toFixed(1)} 公里处`],
        ],
        note: '',
        picture: p.key,
      }),
    );
    return [
      { id: 'cars', title: '车', count: `开过 <b>${driven}</b> / ${frames.length} 种`, rows: carRows },
      { id: 'keeps', title: '收藏', count: `见过 <b>${met}</b> / ${total} 样 · 车牌 ${this.plates.length} 块`, rows: keepRows },
      { id: 'photos', title: '照片', count: `拍过 <b>${this.photos.length}</b> 张`, rows: photoRows },
    ];
  }

  save(): JournalSave | undefined {
    const cars: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.cars)) if (v >= 1) cars[k] = Math.round(v);
    if (!Object.keys(cars).length && !this.keeps.size && !this.plates.length && !this.photos.length) return undefined;
    return { cars, keeps: [...this.keeps], plates: this.plates.map((p) => ({ ...p })), photos: this.photos.map((p) => ({ ...p })) };
  }

  load(s: JournalSave | undefined): void {
    this.cars = {};
    this.keeps.clear();
    this.plates = [];
    this.photos = [];
    this.lastUid = '';
    this.rev++;
    if (!s || typeof s !== 'object') return;
    for (const [k, v] of Object.entries(s.cars ?? {})) if (typeof v === 'number' && v > 0) this.cars[k] = v;
    for (const k of s.keeps ?? []) if (typeof k === 'string') this.keeps.add(k);
    for (const p of s.plates ?? []) if (p && typeof p.text === 'string') this.plates.push({ text: p.text, region: p.region | 0, grade: p.grade | 0, tier: p.tier | 0, oneIn: +p.oneIn || 1 });
    for (const p of s.photos ?? []) if (p && typeof p.key === 'string') this.photos.push({ key: p.key, day: p.day | 0, km: +p.km || 0 });
  }
}
