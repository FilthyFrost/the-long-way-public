/**
 * The sound archive in the game (docs/V3/nodes/M4-audio.md): the table of cues the dev server makes from the
 * archive's catalogue (vite.config.ts audioArchive, core/audio/cueTable.ts), and the recordings themselves,
 * fetched and decoded as they are first wanted (a few at a time), measured for loudness as they come in. Not
 * there (a build, another machine, `?archive=0`): `live` stays false and every sound is the game's own,
 * synthesized, as before.
 */
import type { CueFile, CueTable } from '../../core/audio/cueTable';
import { momentaryMax, rmsOf, type Loudness } from '../../core/audio/loudness';

export const ARCHIVE_URL = '/audio-archive/';

/** a recording decoded and measured */
export interface Recording {
  file: string;
  buf: AudioBuffer;
  loud: Loudness;
}

/** the address of a recording (each part of its path escaped) */
export function archiveUrl(file: string): string {
  return ARCHIVE_URL + file.split('/').map(encodeURIComponent).join('/');
}

/** how many recordings are fetched at once */
const AT_ONCE = 4;

export class SoundArchive {
  table: CueTable | null = null;
  private probing: Promise<boolean> | null = null;
  private readonly done = new Map<string, Recording | null>();
  private readonly loading = new Map<string, Promise<Recording | null>>();
  private readonly queue: Array<() => void> = [];
  private busy = 0;
  private readonly last = new Map<string, string>();
  private readonly louds = new Map<string, Promise<Loudness | null>>();
  /** recordings played from it so far, by cue (what the harness and the developer read back) */
  readonly played = new Map<string, number>();
  /** recordings that would not come (not found, not decoded) */
  failed = 0;

  constructor(
    readonly ctx: BaseAudioContext,
    readonly enabled = true,
  ) {}

  /** ask the dev server for its table once: true if the archive is there */
  probe(): Promise<boolean> {
    if (!this.enabled || typeof fetch !== 'function') return Promise.resolve(false);
    this.probing ??= fetch(`${ARCHIVE_URL}__cues.json`)
      .then((r) => (r.ok ? (r.json() as Promise<CueTable>) : null))
      .then((t) => {
        this.table = t && typeof t === 'object' && t.cues ? t : null;
        return !!this.table;
      })
      .catch(() => false);
    return this.probing;
  }

  /** the archive's recordings in use (the developer's tab can switch them off, to hear the game's own sounds alone) */
  inUse = true;

  get live(): boolean {
    return !!this.table && this.inUse;
  }

  /** the recordings a cue is (none: the archive does not have it, or is not there) */
  files(cue: string): readonly CueFile[] {
    return this.table?.cues[cue] ?? NONE;
  }

  has(cue: string): boolean {
    return this.files(cue).length > 0;
  }

  /** a recording, decoded (to one channel, unless `stereo`) and measured: fetched once, a few at a time */
  load(file: string, stereo = false): Promise<Recording | null> {
    let p = this.loading.get(file);
    if (!p) {
      p = new Promise<Recording | null>((resolve) => {
        const go = (): void => {
          this.busy++;
          fetch(archiveUrl(file))
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
            .then((b) => this.ctx.decodeAudioData(b))
            .then((buf) => {
              const one = stereo || buf.numberOfChannels === 1 ? buf : this.mono(buf);
              const x = one.getChannelData(0);
              const rec: Recording = { file, buf: one, loud: { rms: rmsOf(x), max: momentaryMax(x, one.sampleRate), dur: one.duration } };
              this.done.set(file, rec);
              resolve(rec);
            })
            .catch(() => {
              this.failed++;
              this.done.set(file, null);
              resolve(null);
            })
            .finally(() => {
              this.busy--;
              this.queue.shift()?.();
            });
        };
        if (this.busy < AT_ONCE) go();
        else this.queue.push(go);
      });
      this.loading.set(file, p);
    }
    return p;
  }

  /** the channels of a recording mixed to one (half the memory: a one-shot is placed by the game anyway) */
  private mono(b: AudioBuffer): AudioBuffer {
    const out = this.ctx.createBuffer(1, b.length, b.sampleRate);
    const o = out.getChannelData(0);
    for (let c = 0; c < b.numberOfChannels; c++) {
      const x = b.getChannelData(c);
      for (let i = 0; i < x.length; i++) o[i] += x[i];
    }
    const k = 1 / b.numberOfChannels;
    for (let i = 0; i < o.length; i++) o[i] *= k;
    return out;
  }

  /** a recording already decoded (undefined: not yet, null: it would not come) */
  ready(file: string): Recording | null | undefined {
    return this.done.get(file);
  }

  /** let a decoded recording go (a bed long not heard: its memory back); asked for again, it is fetched again */
  forget(file: string): void {
    if (!this.done.get(file)) return;
    this.done.delete(file);
    this.loading.delete(file);
  }

  /** start fetching every recording of a cue, ahead of its first play */
  warm(cue: string): void {
    for (const f of this.files(cue)) void this.load(f.file);
  }

  /**
   * One of a cue's recordings to play now, never the one played last when there is another: of those decoded so
   * far (the rest asked for). Null while none is in yet (the caller plays its own sound, or none).
   */
  pick(cue: string, rnd: number): Recording | null {
    const files = this.files(cue);
    if (!files.length) return null;
    const got: Recording[] = [];
    for (const f of files) {
      const r = this.done.get(f.file);
      if (r) got.push(r);
      else if (r === undefined) void this.load(f.file);
    }
    if (!got.length) return null;
    let i = Math.min(got.length - 1, Math.floor(rnd * got.length));
    const last = this.last.get(cue);
    if (got.length > 1 && got[i].file === last) i = (i + 1) % got.length;
    this.last.set(cue, got[i].file);
    this.played.set(cue, (this.played.get(cue) ?? 0) + 1);
    return got[i];
  }

  /** how loud a long recording is (a bed, a song), as the dev server measures it from its file (once) */
  loudness(file: string): Promise<Loudness | null> {
    let p = this.louds.get(file);
    if (!p) {
      p = fetch(`${ARCHIVE_URL}__loud/${file.split('/').map(encodeURIComponent).join('/')}`)
        .then((r) => (r.ok ? (r.json() as Promise<Loudness>) : null))
        .catch(() => null);
      this.louds.set(file, p);
    }
    return p;
  }

  /** what the developer and the harness read: is it there, what has come in, what has played */
  debug(): { live: boolean; cues: number; decoded: number; failed: number; played: Record<string, number> } {
    let decoded = 0;
    for (const r of this.done.values()) if (r) decoded++;
    return { live: this.live, cues: this.table ? Object.keys(this.table.cues).length : 0, decoded, failed: this.failed, played: Object.fromEntries(this.played) };
  }
}

const NONE: readonly CueFile[] = [];

/** the game's one archive (made with the game's audio context; radio.ts reads the stations' names from it) */
let shared: SoundArchive | null = null;

export function soundArchive(): SoundArchive | null {
  return shared;
}

/** the archive for this context, made once and asked for its table */
export function openArchive(ctx: BaseAudioContext, enabled: boolean): SoundArchive {
  if (!shared || shared.ctx !== ctx) {
    shared = new SoundArchive(ctx, enabled);
    void shared.probe();
  }
  return shared;
}
