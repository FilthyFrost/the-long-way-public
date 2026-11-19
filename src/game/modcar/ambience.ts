/**
 * The country round one and its weather, recorded (docs/V3/nodes/M4-audio.md): beds of the sound archive's that
 * loop — green country's birds by day and its crickets and owls by night, a dry country's warm air, a cold one's
 * thin wind; a breeze and a gale (a blizzard in snow); light rain and a downpour — mixed by the hour, the kind of
 * country one is in and the weather, and thunder rolling in after the lightning. All of it comes in from outside:
 * through the mixer's outside low-pass (audio.ts), muffled by a shut cab's or a house's walls. Without the archive
 * none of it plays, and the synthesized wind, rain and thunder go on as before (ModGame.updateAmbience).
 */
import { dbToGain } from '../../core/audio/loudness';
import type { CueFile } from '../../core/audio/cueTable';
import { archiveUrl, type SoundArchive } from './soundArchive';

export interface AmbienceInputs {
  /** 0 night .. 1 day (the sky's daylight) */
  daylight: number;
  /** how much of each kind of country one is in (BiomeDef.kin: plains, desert, alpine), together 1 */
  green: number;
  dry: number;
  cold: number;
  /** the weather (env.state): rain, hail, snow 0..1, wind m/s, dust 0..1 */
  rain: number;
  hail: number;
  snow: number;
  wind: number;
  dust: number;
  /** 0 out in it .. 1 shut in (a closed cab, a house, the workshop) */
  enclosed: number;
  /** the lightning now (env.flash, 0..1) */
  flash: number;
}

/** each bed's loudness at its full (dB RMS before the master), set against the synthesized weather it takes over from (audio.ts) */
export const BED_DB: Readonly<Record<string, number>> = {
  'bed:day': -40,
  'bed:night': -41,
  'bed:day_desert': -41,
  'bed:night_desert': -43,
  'bed:day_alpine': -40,
  'bed:night_alpine': -42,
  'bed:wind_light': -33,
  'bed:wind_heavy': -25,
  'bed:blizzard': -24,
  'bed:rain_light': -29,
  'bed:rain_heavy': -19,
};

/** the beds there are */
export const BEDS: readonly string[] = Object.keys(BED_DB);

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * How much of each bed is heard (0..1), before the walls: the country's by the hour, hushed by rain and wind;
 * the wind's by its strength (a blizzard's in snow, a gale in a dust storm); the rain's by how hard it falls.
 * Exported for the tests.
 */
export function bedWeights(i: AmbienceInputs, out: Record<string, number> = {}): Record<string, number> {
  const day = clamp01(i.daylight);
  const night = 1 - day;
  // (the weather drowns the birds and the crickets out)
  const hush = 1 - 0.8 * Math.max(clamp01(i.rain * 1.6), smooth(8, 18, i.wind), clamp01(i.dust));
  out['bed:day'] = i.green * day * hush;
  out['bed:night'] = i.green * night * hush;
  out['bed:day_desert'] = i.dry * day * hush;
  out['bed:night_desert'] = i.dry * night * hush;
  out['bed:day_alpine'] = i.cold * day * hush;
  out['bed:night_alpine'] = i.cold * night * hush;
  const light = smooth(1.5, 6, i.wind) * (1 - smooth(10, 16, i.wind)) * (0.55 + 0.45 * smooth(1.5, 10, i.wind));
  const gale = Math.max(smooth(10, 16, i.wind) * (0.75 + 0.25 * smooth(16, 24, i.wind)), clamp01(i.dust));
  const snowy = smooth(0.2, 0.6, i.snow);
  out['bed:wind_light'] = light;
  out['bed:wind_heavy'] = gale * (1 - snowy);
  out['bed:blizzard'] = gale * snowy;
  const r = clamp01(Math.max(i.rain, i.hail * 0.8));
  out['bed:rain_light'] = smooth(0.02, 0.15, r) * (1 - smooth(0.4, 0.7, r)) * (0.6 + 0.8 * r);
  out['bed:rain_heavy'] = smooth(0.4, 0.7, r) * (0.7 + 0.3 * r);
  return out;
}

/** longer than this a bed is streamed (a seam once round it); shorter, decoded and looped without one */
const STREAM_S = 100;
/** a bed not heard for this long is let go (its memory freed) */
const IDLE_S = 45;

/** one bed: its recording, how loud it is, its gain */
class Bed {
  readonly gain: GainNode;
  /** what brings the recording to its loudness (1 / its RMS: 0 until measured) */
  private norm = 0;
  private el: HTMLAudioElement | null = null;
  private elSrc: MediaElementAudioSourceNode | null = null;
  private src: AudioBufferSourceNode | null = null;
  private starting = false;
  private idle = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly archive: SoundArchive,
    readonly cue: string,
    private readonly file: CueFile,
    bus: AudioNode,
  ) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(bus);
  }

  get playing(): boolean {
    return !!(this.el || this.src);
  }

  /** the bed at a weight now (0..1): started when first wanted, let go when long unwanted */
  /** how much of it is heard now (0..1, through the walls) */
  weight = 0;

  update(weight: number, dt: number): void {
    const t = this.ctx.currentTime;
    this.weight = weight;
    if (weight > 0.002) {
      this.idle = 0;
      if (!this.playing && !this.starting) this.begin();
    } else if (this.playing && (this.idle += dt) > IDLE_S) this.end();
    const level = this.norm > 0 ? weight * dbToGain(BED_DB[this.cue] ?? -40) * this.norm : 0;
    this.gain.gain.setTargetAtTime(Math.min(12, level), t, 1.2);
  }

  private begin(): void {
    this.starting = true;
    const f = this.file;
    if (f.dur > STREAM_S) {
      // (a long one streamed through an element, looping, from somewhere in it)
      const el = new Audio();
      el.preload = 'auto';
      el.loop = true;
      el.src = archiveUrl(f.file);
      el.addEventListener(
        'loadedmetadata',
        () => {
          try {
            el.currentTime = Math.random() * Math.max(0, el.duration - 5);
          } catch {
            /* (from its start) */
          }
          void el.play().catch(() => undefined);
        },
        { once: true },
      );
      this.elSrc = this.ctx.createMediaElementSource(el);
      this.elSrc.connect(this.gain);
      this.el = el;
      this.starting = false;
      void this.archive.loudness(f.file).then((l) => {
        if (l && l.rms > 0) this.norm = 1 / Math.max(0.002, l.rms);
      });
      return;
    }
    void this.archive.load(f.file, true).then((rec) => {
      this.starting = false;
      if (!rec || this.src) return;
      const s = this.ctx.createBufferSource();
      s.buffer = rec.buf;
      s.loop = true;
      s.connect(this.gain);
      s.start(this.ctx.currentTime, Math.random() * rec.buf.duration);
      this.src = s;
      this.norm = 1 / Math.max(0.002, rec.loud.rms);
    });
  }

  private end(): void {
    this.el?.pause();
    this.elSrc?.disconnect();
    this.elSrc = null;
    // (its file let go: no src, loaded again empty)
    if (this.el) {
      this.el.removeAttribute('src');
      this.el.load();
    }
    this.el = null;
    this.src?.stop();
    this.src?.disconnect();
    this.src = null;
    this.archive.forget(this.file.file);
    this.idle = 0;
  }

  dispose(): void {
    this.end();
    this.gain.disconnect();
  }
}

/** the beds and the thunder, on the archive (made once it is there) */
export class Ambience {
  private readonly beds = new Map<string, Bed>();
  private readonly w: Record<string, number> = {};
  private thunderAt = -1;
  /** the beds' gains as last set, and the thunder rolled (for the harness and the developer) */
  thunders = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly archive: SoundArchive,
    private readonly bus: AudioNode,
  ) {}

  update(i: AmbienceInputs, dt: number): void {
    if (!this.archive.live) return;
    const w = bedWeights(i, this.w);
    // (through the walls: a shut cab or a house keeps most of it out, its low-pass the rest)
    const walls = 0.25 + 0.75 * (1 - clamp01(i.enclosed));
    for (const cue of BEDS) {
      let bed = this.beds.get(cue);
      if (!bed) {
        const f = this.archive.files(cue)[0];
        if (!f) continue;
        bed = new Bed(this.ctx, this.archive, cue, f, this.bus);
        this.beds.set(cue, bed);
      }
      bed.update(w[cue] * walls, dt);
    }
    // thunder: rolling in a moment after the flash, the nearer the sooner and the harder (its recordings fetched as the storm comes)
    if (i.rain > 0.35 || i.flash > 0) {
      this.archive.warm('thunder');
      this.archive.warm('thunder:near');
    }
    const t = this.ctx.currentTime;
    if (i.flash > 0.9 && this.thunderAt < t) {
      const delay = 0.6 + 2.6 * Math.random();
      this.thunderAt = t + delay + 4;
      this.thunder(delay);
    }
  }

  /** a roll of thunder `delay` seconds from now (the nearer, the sooner and the harder): false if none is in yet */
  thunder(delay = 0): boolean {
    this.archive.warm('thunder');
    this.archive.warm('thunder:near');
    const near = delay < 1.1;
    const r = this.archive.pick(near ? 'thunder:near' : 'thunder', Math.random()) ?? this.archive.pick('thunder', Math.random());
    if (!r) return false;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = r.buf;
    const g = this.ctx.createGain();
    g.gain.value = Math.min(6, (dbToGain(near ? -13 : -17) / Math.max(1e-4, r.loud.max)) * (0.7 + 0.3 * Math.random()));
    s.connect(g).connect(this.bus);
    s.start(t + delay);
    s.onended = () => {
      s.disconnect();
      g.disconnect();
    };
    this.thunders++;
    return true;
  }

  /** every bed faded out (the archive switched off): each let go once it has been silent a while */
  silence(dt: number): void {
    for (const b of this.beds.values()) b.update(0, dt);
  }

  /** what is heard now: each bed's gain and whether it plays (for the harness and the developer) */
  debug(): Record<string, { gain: number; playing: boolean; db: number }> {
    const out: Record<string, { gain: number; playing: boolean; db: number }> = {};
    for (const [cue, b] of this.beds) out[cue] = { gain: b.gain.gain.value, playing: b.playing, db: b.weight > 1e-4 ? (BED_DB[cue] ?? -40) + 20 * Math.log10(b.weight) : -Infinity };
    return out;
  }

  dispose(): void {
    for (const b of this.beds.values()) b.dispose();
    this.beds.clear();
  }
}
