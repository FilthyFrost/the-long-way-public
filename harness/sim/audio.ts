/** Headless checks of the sound mix mapping. */
import { AudioMix, attenuationDb, computeMix, type AudioInputs } from '../../src/core/audio/mix';
import { T0_TRUCK } from '../../src/core/vehicle/spec';
import type { Metrics } from './scenarios';

export function collectAudioMetrics(): Metrics {
  const base: AudioInputs = { rpm: T0_TRUCK.engine.idle, idleRpm: T0_TRUCK.engine.idle, redline: T0_TRUCK.engine.redline, cylinders: 3, throttle: 0, speed: 0, slip: 0, rough: 0.004, rain: 0, hail: 0, snow: 0, dust: 0, wind: 3, enclosed: 0 };
  const m = new AudioMix();
  const idleHz = computeMix(base, m).engineHz;
  const redHz = computeMix({ ...base, rpm: base.redline, throttle: 1 }, m).engineHz;
  // monotonic pitch and wind
  let nonMono = 0;
  let prevHz = 0;
  let prevWind = -1;
  let bad = 0;
  for (let k = 0; k <= 40; k++) {
    const r = computeMix({ ...base, rpm: base.idleRpm + ((base.redline - base.idleRpm) * k) / 40, throttle: k / 40, speed: k * 0.7 }, m);
    if (r.engineHz < prevHz) nonMono++;
    if (r.windGain < prevWind - 1e-9) nonMono++;
    prevHz = r.engineHz;
    prevWind = r.windGain;
    for (const v of Object.values(r)) if (!Number.isFinite(v as number) || (v as number) < 0) bad++;
    for (const key of ['engineGain', 'subGain', 'windGain', 'roadGain', 'skidGain', 'rainGain', 'roofGain', 'hailGain'] as const) if (r[key] > 1) bad++;
  }
  // closing the cabin in a storm at 60 km/h
  const storm = { ...base, rpm: 3000, throttle: 0.4, speed: 16.7, rain: 1, wind: 14 };
  const open = { ...computeMix({ ...storm, enclosed: 0 }, m) };
  const shut = { ...computeMix({ ...storm, enclosed: 1 }, m) };
  return {
    audio_engine_hz_idle: idleHz,
    audio_engine_hz_redline: redHz,
    audio_non_monotonic: nonMono,
    audio_values_out_of_range: bad,
    audio_enclosed_wind_drop_db: attenuationDb(open.windGain, shut.windGain),
    audio_enclosed_rain_drop_db: attenuationDb(open.rainGain, shut.rainGain),
    audio_roof_rain_open: open.roofGain,
    audio_roof_rain_enclosed: shut.roofGain,
    audio_outside_cutoff_enclosed_hz: shut.outsideCutoff,
    // vehicle systems: a dead engine is silent, the starter is heard, a kerb thuds, the horn quirk is lower
    audio_engine_off_gain: computeMix({ ...base, engineOn: false }, m).engineGain,
    audio_starter_gain_cranking: computeMix({ ...base, engineOn: false, cranking: true, starterRate: 1 }, m).starterGain,
    audio_thump_gain_kerb: computeMix({ ...base, thump: 0.6 }, m).thumpGain,
    audio_shift_engine_sag: computeMix({ ...base, rpm: 3000, throttle: 1, shifting: 1 }, m).engineGain / computeMix({ ...base, rpm: 3000, throttle: 1 }, m).engineGain,
    audio_horn_detune_ratio: computeMix({ ...base, horn: true, hornDetune: true }, m).hornHz / computeMix({ ...base, horn: true }, m).hornHz,
  };
}
