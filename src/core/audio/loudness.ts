/**
 * How loud a recording is (docs/V3/nodes/M4-audio.md): the game brings the archive's recordings to the levels its
 * own sounds were mixed at (foley.ts SHOT_LEVEL, the weather's voices), so a recorded door shuts as loud as the
 * synthesized one did. Two measures: the loudest 400 ms of a short sound (as a meter's momentary maximum reads
 * it, unweighted), and the whole of a long one (a bed of wind or rain).
 */

/** the RMS of the loudest 400 ms of a run of samples (all of a shorter one) */
export function momentaryMax(x: ArrayLike<number>, sr: number, step = 1): number {
  const n = x.length;
  if (!n) return 0;
  const w = Math.max(1, Math.min(n, Math.floor((0.4 * sr) / step)));
  let s = 0;
  for (let i = 0; i < w; i++) s += x[i] * x[i];
  let best = s;
  for (let i = w; i < n; i++) {
    s += x[i] * x[i] - x[i - w] * x[i - w];
    if (s > best) best = s;
  }
  return Math.sqrt(Math.max(0, best) / w);
}

/** the RMS of the whole */
export function rmsOf(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return x.length ? Math.sqrt(s / x.length) : 0;
}

export interface Loudness {
  /** the RMS of the whole (linear) */
  rms: number;
  /** the RMS of the loudest 400 ms (linear) */
  max: number;
  /** seconds */
  dur: number;
}

/** dB to a linear gain */
export const dbToGain = (db: number): number => Math.pow(10, db / 20);

/**
 * A WAV file's loudness, read straight from its bytes (16-, 24- or 32-bit PCM, or 32-bit float; its channels
 * mixed to one), every `every`-th frame of it (a long bed measured from a sample of it: loudness does not need
 * every sample). Null: not a WAV this reads.
 */
export function wavLoudness(b: Uint8Array, every = 1): Loudness | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (o: number): string => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (b.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let fmt = -1;
  let channels = 0;
  let sr = 0;
  let bits = 0;
  let data = -1;
  let dataLen = 0;
  let o = 12;
  while (o + 8 <= b.length) {
    const id = tag(o);
    const len = dv.getUint32(o + 4, true);
    if (id === 'fmt ') {
      fmt = dv.getUint16(o + 8, true);
      channels = dv.getUint16(o + 10, true);
      sr = dv.getUint32(o + 12, true);
      bits = dv.getUint16(o + 22, true);
      // (WAVE_FORMAT_EXTENSIBLE: the real format is the first two bytes of its sub-format)
      if (fmt === 0xfffe && len >= 26) fmt = dv.getUint16(o + 32, true);
    } else if (id === 'data') {
      data = o + 8;
      dataLen = Math.min(len, b.length - data);
      break;
    }
    o += 8 + len + (len & 1);
  }
  if (data < 0 || channels < 1 || sr < 1 || !(fmt === 1 || fmt === 3)) return null;
  const bytes = bits / 8;
  const frame = bytes * channels;
  if (!(bytes >= 2 && bytes <= 4) || frame <= 0) return null;
  const frames = Math.floor(dataLen / frame);
  const step = Math.max(1, Math.floor(every));
  const mono = new Float32Array(Math.ceil(frames / step));
  const read = (at: number): number => {
    if (fmt === 3) return bytes === 4 ? dv.getFloat32(at, true) : 0;
    if (bytes === 2) return dv.getInt16(at, true) / 32768;
    if (bytes === 3) {
      const v = b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
      return ((v << 8) >> 8) / 8388608;
    }
    return dv.getInt32(at, true) / 2147483648;
  };
  for (let f = 0, k = 0; f < frames; f += step, k++) {
    let s = 0;
    const at = data + f * frame;
    for (let c = 0; c < channels; c++) s += read(at + c * bytes);
    mono[k] = s / channels;
  }
  return { rms: rmsOf(mono), max: momentaryMax(mono, sr, step), dur: frames / sr };
}
