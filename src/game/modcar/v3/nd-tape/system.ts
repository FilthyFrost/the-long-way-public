/**
 * The tapes played in a vehicle's tape deck (docs/ND/PLAN.md, ND4; the tapes and the deck's numbers:
 * core/v3/nd/tapes.ts). From a seat, the mark on the radio: a tape deck's lid opens; with a tape in the hands the
 * left button held 0.4 s puts it in (it slides in) and it plays from its start, over again when it ends; a click
 * stops it and starts it again where it was; the button held with the hands free takes it out into them (one in
 * the hands goes in in its place); the wheel is the volume, fifteen steps (ten at first), the knob turning with it,
 * for the stations too. A tape in a deck keeps its station quiet. What is in a deck, where in its song it is and its
 * volume ride on the deck itself (PartInstance.tape, .tapeAt, .vol), so they are saved with the vehicle and go with
 * the deck when it is taken out. The song is the sound archive's (streamed from the dev server, the radio's way);
 * without it, one made up for the tape. Heard full within 4 m of the deck, nothing past 25 m, through the body from
 * outside it as the radio is. Which tapes have been put in is kept (this module's save).
 */
import type { System } from '../../../../core/kernel/systems';
import type { SaveSlice } from '../../../../core/kernel/slices';
import type { ItemInstance } from '../../../../core/modcar/items';
import { partDef } from '../../../../core/modcar/parts';
import type { MountDef, PartInstance } from '../../../../core/modcar/types';
import { clock, DECK, deckFalloff, nextOf, tapeDeck, tapeOf, TAPES, volumeStep, type Tape } from '../../../../core/v3/nd/tapes';
import { chestDealers } from '../../nd/kit';
import type { CockpitUse } from '../../cockpit';
import type { Action } from '../../hudItems';
import type { GameContext } from '../../kernel/context';
import { renderSong, SONGS, songTitle, stationLabel, type Song } from '../../radio';
import { archiveUrl, soundArchive } from '../../soundArchive';
import type { ModVehicle } from '../../vehicle';

declare module '../../../../core/modcar/items' {
  interface ItemState {
    /** a tape dealt from the world's deck (one lying where a place had a tape is dealt the next one not had yet) */
    dealt?: boolean;
  }
}

declare module '../../../../core/modcar/types' {
  interface PartInstance {
    /** a tape deck's: the tape in it, how far into its song it is (s), its volume (0…15; absent: ten) */
    tape?: ItemInstance;
    tapeAt?: number;
    vol?: number;
  }
}

/** how loud a deck is at full volume from a seat in its vehicle (the radio's 0.14 at ten of fifteen) */
const SEAT_LEVEL = 0.21;
/** each archive song brought to this loudness (RMS), as the radio does */
const SONG_RMS = 0.2;

const volOf = (inst: PartInstance): number => inst.vol ?? DECK.start;

/** the radio of a vehicle: its mount, the part in it (null: none) */
function radioOf(v: ModVehicle): { m: MountDef; inst: PartInstance } | null {
  for (const m of v.view.frame.mounts) {
    if (m.cat !== 'radio') continue;
    const inst = v.build.parts[m.id];
    if (inst) return { m, inst };
  }
  return null;
}

const isDeck = (inst: PartInstance): boolean => !!partDef(inst.part).radio?.tape;

/** a tape's song made up (no archive): its tempo, key and voices, eight bars from its seed */
function madeUp(t: Tape): Song {
  const progs: [number, boolean][][] = [
    [[0, false], [5, false], [7, false], [0, false], [9, true], [5, false], [7, false], [0, false]],
    [[0, true], [8, false], [3, false], [10, false], [0, true], [5, true], [7, false], [0, true]],
    [[0, false], [9, true], [5, false], [7, false], [0, false], [9, true], [2, true], [7, false]],
  ];
  return { name: t.title, bpm: t.synth.bpm, beats: t.synth.style === 'waltz' ? 3 : 4, key: t.synth.key, bars: progs[t.synth.seed % progs.length], style: t.synth.style, lead: t.synth.lead, seed: t.synth.seed };
}

/** the voice the tapes are heard through: the archive's song streamed through one element, or a made-up one */
class TapeVoice {
  private readonly out: GainNode;
  private el: HTMLAudioElement | null = null;
  private gain: GainNode | null = null;
  private src: AudioBufferSourceNode | null = null;
  private srcT0 = 0;
  private srcDur = 0;
  /** what it plays: the tape's id ('' nothing) and the file ('' made up) */
  tape = '';
  file = '';
  private static readonly made = new Map<string, AudioBuffer>();

  constructor(
    private readonly ctx: AudioContext,
    output: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(output);
  }

  private element(): HTMLAudioElement | null {
    if (this.el) return this.el;
    if (typeof Audio === 'undefined' || typeof this.ctx.createMediaElementSource !== 'function') return null;
    const el = new Audio();
    el.preload = 'auto';
    el.loop = true;
    const src = this.ctx.createMediaElementSource(el);
    // (a tape deck's sound: fuller than an AM set's, the top a little rolled off)
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 55;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 11000;
    this.gain = this.ctx.createGain();
    src.connect(hp).connect(lp).connect(this.gain).connect(this.out);
    this.el = el;
    return el;
  }

  /** where in its song it is now (s) */
  get at(): number {
    if (this.el && this.file) return this.el.currentTime;
    if (this.src && this.srcDur > 0) return (this.ctx.currentTime - this.srcT0) % this.srcDur;
    return 0;
  }

  /** how long its song is (s; 0 not known yet) */
  get dur(): number {
    if (this.el && this.file) return Number.isFinite(this.el.duration) ? this.el.duration : 0;
    return this.srcDur;
  }

  /** play a tape's song from `at` (s): the archive's file, else the made-up song */
  play(t: Tape, file: string, at: number): void {
    this.stop();
    this.tape = t.id;
    this.file = file;
    if (file) {
      const el = this.element();
      if (!el) return;
      el.src = archiveUrl(file);
      el.addEventListener(
        'loadedmetadata',
        () => {
          if (this.file !== file) return;
          try {
            el.currentTime = Math.min(Math.max(0, el.duration - 0.5), Math.max(0, at));
          } catch {
            /* (not seekable: from its start) */
          }
          void el.play().catch(() => undefined);
        },
        { once: true },
      );
      el.load();
      const g = this.gain!;
      g.gain.setValueAtTime(1, this.ctx.currentTime);
      void soundArchive()
        ?.loudness(file)
        .then((l) => {
          if (l && l.rms > 0 && this.file === file) g.gain.setTargetAtTime(Math.min(8, SONG_RMS / Math.max(0.01, l.rms)), this.ctx.currentTime, 0.2);
        });
      return;
    }
    // made up: rendered once, looped
    const key = `${t.id}@${this.ctx.sampleRate}`;
    let b = TapeVoice.made.get(key);
    if (!b) {
      const x = renderSong(madeUp(t), this.ctx.sampleRate);
      b = this.ctx.createBuffer(1, x.length, this.ctx.sampleRate);
      b.getChannelData(0).set(x);
      TapeVoice.made.set(key, b);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    src.connect(this.out);
    const off = b.duration > 0 ? ((at % b.duration) + b.duration) % b.duration : 0;
    src.start(this.ctx.currentTime + 0.05, off);
    this.src = src;
    this.srcDur = b.duration;
    this.srcT0 = this.ctx.currentTime + 0.05 - off;
  }

  stop(): void {
    this.el?.pause();
    this.src?.stop();
    this.src = null;
    this.tape = '';
    this.file = '';
  }

  level(l: number): void {
    this.out.gain.setTargetAtTime(l, this.ctx.currentTime, 0.12);
  }

  dispose(): void {
    this.stop();
    this.out.disconnect();
  }
}

export class NdTape implements System<GameContext> {
  readonly id = 'nd-tape';
  readonly budget = { cpuMs: 0.2 };
  private ctx: GameContext | null = null;
  private voice: TapeVoice | null = null;
  /** the deck heard now (its part), the place kept last */
  private heard: PartInstance | null = null;
  private keptT = 0;
  /** the tapes ever put in (Nomad Drive's "Greatest Hits": all thirteen), ever in the hands, dealt to a place or a chest */
  readonly had = new Set<string>();
  readonly found = new Set<string>();
  readonly dealt = new Set<string>();
  private rev = -1;
  /** the left button held on a deck: which, how long, whether it has done its thing */
  private hold: { v: ModVehicle; m: MountDef; t: number; done: boolean } | null = null;
  /** the last step of the volume (s, its own clock) */
  private volT = -1;
  private time = 0;
  /** each deck's lid and its tape's slide (0 out … 1 in), by the part */
  private readonly lids = new WeakMap<PartInstance, { lid: number; slide: number }>();

  readonly slice: SaveSlice<{ had?: string[]; found?: string[]; dealt?: string[] }> = {
    id: 'nd-tape',
    version: 1,
    snapshot: () => (this.had.size || this.found.size || this.dealt.size ? { had: [...this.had].sort(), found: [...this.found].sort(), dealt: [...this.dealt].sort() } : undefined),
    restore: (d) => {
      for (const [set, ids] of [[this.had, d.had], [this.found, d.found], [this.dealt, d.dealt]] as const) {
        set.clear();
        for (const id of ids ?? []) if (tapeOf(id)) set.add(id);
      }
    },
    clear: () => {
      this.had.clear();
      this.found.clear();
      this.dealt.clear();
    },
  };

  /** the next tape the world deals (one not found or dealt yet; once all are, any of the deck in turn) */
  dealTape(): string {
    const ctx = this.ctx;
    const deck = tapeDeck(ctx?.world?.seed ?? ctx?.params.seed ?? 1);
    const gone = new Set([...this.found, ...this.dealt]);
    const id = gone.size >= deck.length ? deck[(this.dealt.size + this.found.size) % deck.length] : nextOf(deck, gone);
    this.dealt.add(id);
    return id;
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.cockpit.uses.push(this.use);
    // a buried chest's second keepsake: a tape not had yet
    chestDealers.push(() => [this.dealTape()]);
    // the stations: as loud as the knob says, quiet while a tape is in the deck
    ctx.radioLevel.push((v) => {
      const r = radioOf(v);
      if (!r) return 1;
      if (r.inst.tape) return 0;
      return volOf(r.inst) / DECK.start;
    });
  }

  dispose(): void {
    this.voice?.dispose();
    this.voice = null;
  }

  // ------------------------------------------------------------------ the deck from a seat

  private tapeInHands(): ItemInstance | null {
    const h = this.ctx?.player.held;
    return h?.kind === 'item' && tapeOf(h.item.item) ? h.item : null;
  }

  readonly use: CockpitUse = {
    claims: (v, m) => m.cat === 'radio' && !!v.build.parts[m.id],
    actions: (v, m) => this.actions(v, m),
    press: (v, m, right) => {
      const inst = v.build.parts[m.id];
      if (!inst) return false;
      // the right button: the next station (the cockpit's own), nothing with a tape in
      if (right) return !!inst.tape;
      this.hold = { v, m, t: 0, done: false };
      return true;
    },
    release: (v) => {
      const h = this.hold;
      this.hold = null;
      if (!h || h.done || h.v !== v) return;
      // a click: the tape (or the station) stops, or starts again
      v.radioOn = !v.radioOn;
      this.ctx?.sound('switch');
      const inst = v.build.parts[h.m.id];
      if (v.radioOn && !inst?.tape) this.ctx?.ui.say(v.sys.dash.battery > 0.02 ? `「${stationLabel(v.radioSong)}」` : '电瓶没电', 2.2);
    },
    wheel: (v, m, delta) => {
      const inst = v.build.parts[m.id];
      if (!inst) return false;
      const next = volumeStep(volOf(inst), delta < 0 ? 1 : -1, this.time, this.volT);
      if (next !== null) {
        this.volT = this.time;
        if (next !== volOf(inst)) this.ctx?.sound('switch', 0.3);
        inst.vol = next;
      }
      return true;
    },
  };

  private actions(v: ModVehicle, m: MountDef): Action[] {
    const inst = v.build.parts[m.id];
    const name = partDef(inst.part).name.zh;
    const deck = isDeck(inst);
    const inHands = this.tapeInHands();
    const vol = `音量 ${Math.round((volOf(inst) / DECK.steps) * 100)}%`;
    const acts: Action[] = [];
    const t = inst.tape ? tapeOf(inst.tape.item) : null;
    if (t) {
      const on = v.radioOn && this.heard === inst && this.voice?.tape === t.id;
      const at = on ? this.voice!.at : (inst.tapeAt ?? 0);
      const dur = on ? this.voice!.dur : 0;
      const where = dur > 0 ? ` · ${clock(at)} / ${clock(dur)}` : '';
      void where;
      acts.push({ keys: ['LMB'], text: v.radioOn ? '暂停' : '播放' });
      acts.push({ keys: ['LMB'], hold: true, text: inHands ? '换磁带' : '退出磁带' });
    } else {
      acts.push(v.radioOn ? { keys: ['LMB'], text: `关掉 <b>${name}</b>` } : { keys: ['LMB'], text: `打开 <b>${name}</b>` });
      if (v.radioOn) acts.push({ keys: ['RMB'], text: '换台' });
      if (inHands) acts.push(deck ? { keys: ['LMB'], hold: true, text: '放进磁带' } : { keys: ['LMB'], hold: true, text: '放进磁带', off: true, why: '放不了磁带' });
    }
    acts.push({ keys: ['Wheel'], text: vol });
    if (v.sys.dash.battery <= 0.02) acts.push({ keys: ['LMB'], text: '播放', off: true, why: '电瓶没电' });
    return acts;
  }

  /** a tape from the hands into the deck (the one in it, if any, into the hands in its place) */
  private insert(v: ModVehicle, inst: PartInstance, item: ItemInstance): void {
    const ctx = this.ctx!;
    const pl = ctx.player;
    const i = pl.slots.findIndex((h) => h?.kind === 'item' && h.item === item);
    if (i < 0) return;
    const old = inst.tape;
    pl.slots[i] = old ? { kind: 'item', item: old } : null;
    inst.tape = item;
    inst.tapeAt = 0;
    v.radioOn = true;
    const st = this.lids.get(inst);
    if (st) st.slide = 0;
    ctx.sound('container_open', 0.35);
    const t = tapeOf(item.item)!;
    const first = !this.had.has(t.id);
    this.had.add(t.id);
    ctx.ui.say(first ? `《${t.title}》· ${this.had.size} / ${TAPES.length}` : `《${t.title}》`, 2.4);
  }

  /** the tape out of the deck into a free hand */
  private eject(inst: PartInstance): void {
    const ctx = this.ctx!;
    const item = inst.tape;
    if (!item) return;
    const pl = ctx.player;
    const free = pl.freeSlot();
    if (free < 0) return void ctx.player.flashWhy('手满了');
    pl.slots[free] = { kind: 'item', item };
    pl.sel = free;
    delete inst.tape;
    delete inst.tapeAt;
    const st = this.lids.get(inst);
    if (st) st.slide = 1;
    ctx.sound('container_open', 0.3);
  }

  // ------------------------------------------------------------------ every frame

  lateUpdate(dt: number, ctx: GameContext): void {
    this.time += dt;
    // a tape lying where a place had one: dealt the world's next (once); one in the hands: found
    if (ctx.loose.rev !== this.rev) {
      this.rev = ctx.loose.rev;
      for (const l of ctx.loose.list) {
        const it = l.item;
        if (!it || !tapeOf(it.item) || it.state?.dealt) continue;
        it.item = this.dealTape();
        (it.state ??= {}).dealt = true;
      }
    }
    const inHands = this.tapeInHands();
    if (inHands) {
      this.found.add(inHands.item);
      (inHands.state ??= {}).dealt = true;
    }
    // the left button held on a deck from a seat
    const h = this.hold;
    if (h && !h.done) {
      const inst = h.v.build.parts[h.m.id];
      if (ctx.seated !== h.v || ctx.cockpit.aimed !== h.m || !inst) this.hold = null;
      else {
        h.t += dt;
        if (h.t >= DECK.holdS) {
          h.done = true;
          const inHands = this.tapeInHands();
          if (inHands && isDeck(inst)) this.insert(h.v, inst, inHands);
          else if (inst.tape) this.eject(inst);
        }
      }
    }
    this.hear(dt, ctx);
    this.pose(dt, ctx);
  }

  /** the deck heard: the loudest one playing a tape, its place in the song kept on it */
  private hear(dt: number, ctx: GameContext): void {
    const au = ctx.audio;
    if (!au?.context || !au.output) return;
    let best: { v: ModVehicle; inst: PartInstance; l: number } | null = null;
    const w = ctx.player.walker;
    for (const v of ctx.vehicles) {
      const r = radioOf(v);
      if (!r?.inst.tape || !v.radioOn || v.sys.dash.battery <= 0.02) continue;
      const vol = volOf(r.inst) / DECK.steps;
      let l: number;
      if (ctx.seated === v || ctx.player.aboard?.v === v) l = SEAT_LEVEL * vol;
      else {
        const d = ctx.seated ? Math.hypot(ctx.seated.sim.px - v.sim.px, ctx.seated.sim.pz - v.sim.pz) : Math.hypot(w.x - v.sim.px, w.z - v.sim.pz);
        // (a closed body keeps most of it in, as the radio's)
        l = SEAT_LEVEL * vol * deckFalloff(d) * (0.35 + 0.65 * (1 - v.sys.derived.enclosed));
      }
      if (l > 0.0005 && (!best || l > best.l)) best = { v, inst: r.inst, l };
    }
    this.voice ??= new TapeVoice(au.context, au.output);
    const voice = this.voice;
    if (!best) {
      if (this.heard && voice.tape) this.heard.tapeAt = voice.at;
      if (voice.tape) voice.stop();
      voice.level(0);
      this.heard = null;
      return;
    }
    const tape = tapeOf(best.inst.tape!.item)!;
    if (this.heard !== best.inst || voice.tape !== tape.id) {
      if (this.heard && voice.tape) this.heard.tapeAt = voice.at;
      this.heard = best.inst;
      voice.play(tape, this.fileOf(tape), best.inst.tapeAt ?? 0);
      this.keptT = 0;
    }
    voice.level(best.l);
    this.keptT += dt;
    if (this.keptT >= DECK.keepS) {
      this.keptT = 0;
      best.inst.tapeAt = voice.at;
    }
  }

  /** a tape's song in the archive (its file under the archive's folder; '' not there: made up) */
  private fileOf(t: Tape): string {
    const a = soundArchive();
    if (!a?.live) return '';
    const s = a.table?.stations[t.station]?.songs.find((x) => x.title === t.song);
    return s?.file ?? '';
  }

  /** the decks' lids open while looked at from a seat, their tapes slid in, their volume knobs turned */
  private pose(dt: number, ctx: GameContext): void {
    const sv = ctx.seated;
    for (const v of ctx.vehicles) {
      const r = radioOf(v);
      if (!r || !isDeck(r.inst)) continue;
      if (sv !== v && Math.hypot(v.sim.px - ctx.player.walker.x, v.sim.pz - ctx.player.walker.z) > 30) continue;
      const node = v.view.nodeOf(r.m.id);
      if (!node) continue;
      let st = this.lids.get(r.inst);
      if (!st) {
        st = { lid: 0, slide: r.inst.tape ? 1 : 0 };
        this.lids.set(r.inst, st);
      }
      const look = sv === v && ctx.cockpit.aimed === r.m ? 1 : 0;
      st.lid = look ? Math.min(1, st.lid + dt / DECK.lidOpenS) : Math.max(0, st.lid - dt / DECK.lidShutS);
      st.slide = r.inst.tape ? Math.min(1, st.slide + dt / DECK.slideS) : Math.max(0, st.slide - dt / DECK.slideS);
      const door = node.getObjectByName('TAPE_DOOR');
      if (door) {
        const k = st.lid * st.lid * (3 - 2 * st.lid);
        door.rotation.z = (DECK.lidDeg * Math.PI * k) / 180;
      }
      const cas = node.getObjectByName('N_cassette');
      if (cas) {
        cas.userData.restX ??= cas.position.x;
        cas.visible = !!r.inst.tape || st.slide > 0.001;
        const k = st.slide * st.slide * (3 - 2 * st.slide);
        cas.position.x = (cas.userData.restX as number) - 0.03 * (1 - k);
      }
      const knob = node.getObjectByName('KNOB_L');
      if (knob) knob.rotation.x = v.radioOn ? (DECK.knobDeg * Math.PI * (volOf(r.inst) / DECK.steps)) / 180 : 0;
    }
  }

  telemetry(): Record<string, unknown> {
    return { playing: this.voice?.tape ?? '', file: this.voice?.file ? (this.voice.file.split('/').pop() ?? '') : '', at: +(this.voice?.at ?? 0).toFixed(1), had: this.had.size };
  }

  readonly harness = {
    /** a deck's state: the tape in it, its place, its volume, whether it plays */
    deck: (vi = 0): { tape: string | null; at: number; vol: number; on: boolean; deck: boolean } | null => {
      const v = this.ctx?.vehicles[vi];
      const r = v ? radioOf(v) : null;
      if (!v || !r) return null;
      return { tape: r.inst.tape?.item ?? null, at: r.inst.tapeAt ?? 0, vol: volOf(r.inst), on: v.radioOn, deck: isDeck(r.inst) };
    },
    /** what is heard now */
    heard: (): { tape: string; file: string; at: number; dur: number } => ({ tape: this.voice?.tape ?? '', file: this.voice?.file ?? '', at: this.voice?.at ?? 0, dur: this.voice?.dur ?? 0 }),
    /** the tape in the hands put into the seated vehicle's deck at once (as the button held), or the one in it taken out */
    insert: (): boolean => {
      const v = this.ctx?.seated;
      const r = v ? radioOf(v) : null;
      const item = this.tapeInHands();
      if (!v || !r || !item || !isDeck(r.inst)) return false;
      this.insert(v, r.inst, item);
      return true;
    },
    eject: (): boolean => {
      const v = this.ctx?.seated;
      const r = v ? radioOf(v) : null;
      if (!r?.inst.tape) return false;
      this.eject(r.inst);
      return !r.inst.tape;
    },
    volume: (n: number): number => {
      const v = this.ctx?.seated;
      const r = v ? radioOf(v) : null;
      if (!r) return -1;
      r.inst.vol = Math.max(0, Math.min(DECK.steps, n));
      return r.inst.vol;
    },
    had: (): string[] => [...this.had],
    /** the tapes' song titles as the archive has them (where it has them) */
    songs: (): { id: string; title: string; file: string }[] => TAPES.map((t) => ({ id: t.id, title: songTitle(t.song), file: this.fileOf(t) })),
    stations: (): number => SONGS.length,
  };
}

