/**
 * ModCar mechanical sounds, all synthesized (no recordings): doors and panels by material,
 * latches, the ratchet wrench while a part goes on or comes off, parts picked up and set down by
 * mass, spray can, sponge, pouring fuel / water / oil, the key, three horns, the handbrake, gear
 * changes and a grind. Each sound is a recipe that renders a short Float32Array (synth.ts); the
 * player caches a few variations of each and plays them on the game's AudioContext.
 */
import { Rng, biquad, burst, edges, mixInto, noise, normalize, ring, saturate, strike } from './synth';

export type FoleyShot =
  | 'door_open'
  | 'door_close'
  | 'latch'
  | 'hood_open'
  | 'hood_close'
  | 'trunk_open'
  | 'trunk_close'
  | 'part_pickup'
  | 'part_setdown'
  | 'part_install'
  | 'part_remove'
  | 'key_turn'
  | 'handbrake_pull'
  | 'handbrake_release'
  | 'gear_shift'
  | 'gear_grind'
  | 'spray_shake'
  | 'horn_trumpet'
  | 'switch'
  | 'lever'
  /** the body striking something hard: thump, crumpling sheet metal, a rattle settling */
  | 'crash'
  // the body (vitals): eating, drinking, medicine, getting hurt, a backpack
  /** a bite of something crunchy */
  | 'bite'
  /** a packet torn open, its wrapper crinkling */
  | 'wrapper'
  /** a ring-pull can opened: a click and a hiss */
  | 'can_open'
  /** a screw cap twisted off */
  | 'cap_open'
  /** pills shaken out of their box */
  | 'pills'
  /** a swallow */
  | 'gulp'
  /** hurt: a dull thump in the chest */
  | 'hurt'
  /** cloth and straps: a backpack put on or taken off, clothes */
  | 'cloth';

export type FoleyLoop = 'ratchet' | 'spray' | 'sponge' | 'pour' | 'horn_beep' | 'horn_air' | 'glug' | 'breath' | 'heart' | 'pee';

/** door / panel materials: door_stock, door_rusty, door_armor, door_cage, door_fridge */
export type PanelMaterial = 'metal' | 'rusty' | 'armor' | 'cage' | 'fridge';
export type Liquid = 'fuel' | 'water' | 'oil';

export interface FoleyOpts {
  material?: PanelMaterial;
  /** kg, for parts picked up / set down / installed */
  mass?: number;
  liquid?: Liquid;
  /** linear gain on top of the sound's own level */
  gain?: number;
  /** -1..1 stereo position (only with a stereo output) */
  pan?: number;
}

type Recipe = (sr: number, rng: Rng) => Float32Array;

const S = (sr: number, seconds: number): Float32Array => new Float32Array(Math.max(1, Math.floor(seconds * sr)));

// ------------------------------------------------------------------ building blocks

/** latch: a sharp two-stage clack (bolt over the striker, then home) */
function latchInto(x: Float32Array, sr: number, at: number, rng: Rng, amp = 1, heavy = false): void {
  const a = Math.floor(at * sr);
  burst(x, sr, a, 0.004, amp, rng, { attack: 0.0001, decay: 0.0008, filter: [['highpass', 1800], ['peaking' as const, 4200, 1.5]] });
  strike(x, sr, a, [[2900, 0.5, 0.012], [4700, 0.35, 0.008], [6100, 0.2, 0.005]], 0.35 * amp, rng);
  const b = a + Math.floor(rng.range(0.006, 0.011) * sr);
  burst(x, sr, b, 0.004, 0.8 * amp, rng, { attack: 0.0001, decay: 0.001, filter: [['highpass', 1200]] });
  strike(x, sr, b, heavy ? [[1300, 0.6, 0.03], [2100, 0.4, 0.02]] : [[2200, 0.5, 0.015], [3600, 0.35, 0.01]], 0.4 * amp, rng);
}

/** the low pressure of a slammed panel: a dull body thud */
function thudInto(x: Float32Array, sr: number, at: number, rng: Rng, amp: number, freq: number, decay: number): void {
  burst(x, sr, Math.floor(at * sr), decay * 6, amp, rng, { attack: 0.001, decay, filter: [['lowpass', freq], ['lowpass', freq * 1.3]] });
  ring(x, sr, Math.floor(at * sr), freq * 0.6, amp * 0.5, decay * 1.4);
}

/** the body striking something hard: the thump of its mass, the sheet metal crumpling in a run of crackles, the panels ringing low, loose things in it rattling down */
function crash(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 1.2);
    thudInto(x, sr, 0, rng, 1, 60, 0.05);
    let t = 0.004;
    for (let k = 0; k < 16; k++) {
      burst(x, sr, Math.floor(t * sr), rng.range(0.015, 0.05), rng.range(0.25, 0.6) * (1 - k / 18), rng, { attack: 0.0005, decay: 0.01, filter: [['bandpass', rng.range(500, 2600), 1.3]] });
      t += rng.range(0.006, 0.028);
    }
    strike(x, sr, 0, panelModes(1.6, 1.3), 0.45, rng, 0.04);
    rattleInto(x, sr, 0.22, rng, 0.18, 9, 0.4, [1400, 4200]);
    return normalize(saturate(edges(x, sr), 2.4), 0.95);
  };
}

/** steel sheet modes for a panel of a given size (1 = a car door) */
function panelModes(size: number, damp: number): Array<[number, number, number]> {
  const base: Array<[number, number, number]> = [
    [176, 1.0, 0.11], [262, 0.8, 0.09], [409, 0.75, 0.07], [597, 0.55, 0.06], [868, 0.45, 0.045], [1213, 0.33, 0.035], [1702, 0.25, 0.025], [2410, 0.16, 0.018],
  ];
  return base.map(([f, g, d]) => [f / size, g, (d * size) / damp] as [number, number, number]);
}

/** glass rattling in its run */
function rattleInto(x: Float32Array, sr: number, at: number, rng: Rng, amp: number, n: number, spread: number, band: [number, number]): void {
  for (let k = 0; k < n; k++) {
    const t = at + rng.range(0, spread) * (k / n + 0.2);
    burst(x, sr, Math.floor(t * sr), 0.012, amp * rng.range(0.3, 1), rng, { attack: 0.0002, decay: 0.002, filter: [['bandpass', rng.range(band[0], band[1]), 3]] });
  }
}

/** a wire mesh rattling: many tiny high impacts */
function meshInto(x: Float32Array, sr: number, at: number, rng: Rng, amp: number, n: number, spread: number): void {
  for (let k = 0; k < n; k++) {
    const t = at + spread * Math.pow(rng.next(), 1.6);
    strike(x, sr, Math.floor(t * sr), [[rng.range(1800, 3200), 1, 0.012], [rng.range(3600, 6200), 0.6, 0.007]], amp * rng.range(0.2, 1) * Math.exp(-(t - at) / (spread * 0.6)), rng, 0.05);
  }
}

/** a hinge: dry creak (rusty: a long squeal) */
function creakInto(x: Float32Array, sr: number, at: number, len: number, rng: Rng, amp: number, squeal: boolean): void {
  const n = Math.floor(len * sr);
  const a = Math.floor(at * sr);
  let ph = 0;
  const f0 = squeal ? rng.range(900, 1400) : rng.range(160, 260);
  for (let i = 0; i < n && a + i < x.length; i++) {
    const t = i / n;
    // stick-slip: a pulse train whose rate wanders
    const f = f0 * (1 + 0.25 * Math.sin(t * 9 + rng.next() * 0.2) + 0.15 * t);
    ph += f / sr;
    const pulse = ph % 1 < 0.08 ? 1 : 0;
    const env = Math.sin(Math.PI * t) * (0.6 + 0.4 * Math.sin(t * 23));
    x[a + i] += pulse * env * amp * (squeal ? 0.5 : 1);
  }
}

// ------------------------------------------------------------------ recipes

function doorOpen(material: PanelMaterial): Recipe {
  return (sr, rng) => {
    const x = S(sr, material === 'cage' ? 0.7 : 0.6);
    if (material === 'fridge') {
      // the seal lets go with a soft suck, then the shelves clink
      burst(x, sr, 0, 0.09, 0.8, rng, { attack: 0.004, decay: 0.03, filter: [['bandpass', 420, 1.2], ['lowpass', 900]] });
      burst(x, sr, Math.floor(0.03 * sr), 0.05, 0.35, rng, { attack: 0.002, decay: 0.012, filter: [['bandpass', 1500, 2]] });
      strike(x, sr, Math.floor(0.12 * sr), [[2650, 1, 0.08], [3970, 0.5, 0.05], [5300, 0.3, 0.03]], 0.12, rng);
      strike(x, sr, Math.floor(0.16 * sr), [[3100, 1, 0.06], [4400, 0.5, 0.04]], 0.07, rng);
      return normalize(edges(x, sr), 0.6);
    }
    if (material === 'cage') {
      latchInto(x, sr, 0.0, rng, 0.6);
      meshInto(x, sr, 0.03, rng, 0.35, 34, 0.45);
      creakInto(x, sr, 0.05, 0.4, rng, 0.05, false);
      return normalize(edges(x, sr), 0.6);
    }
    // handle pull and latch release, the seal parting, the hinge
    latchInto(x, sr, 0.0, rng, 0.75, material === 'armor');
    burst(x, sr, Math.floor(0.02 * sr), 0.08, 0.35, rng, { attack: 0.004, decay: 0.02, filter: [['lowpass', 500]] });
    strike(x, sr, Math.floor(0.02 * sr), panelModes(material === 'armor' ? 1.6 : 1, material === 'armor' ? 0.8 : 1.4), 0.08, rng);
    creakInto(x, sr, 0.08, 0.35, rng, material === 'rusty' ? 0.09 : 0.025, material === 'rusty');
    return normalize(edges(x, sr), 0.6);
  };
}

function doorClose(material: PanelMaterial): Recipe {
  return (sr, rng) => {
    const x = S(sr, material === 'armor' ? 0.9 : 0.7);
    if (material === 'fridge') {
      // a padded "thup" and the magnetic seal pulling it shut, bottles clink
      thudInto(x, sr, 0, rng, 1.0, 260, 0.025);
      burst(x, sr, Math.floor(0.004 * sr), 0.03, 0.4, rng, { attack: 0.001, decay: 0.006, filter: [['bandpass', 900, 1.5]] });
      for (let k = 0; k < 3; k++) strike(x, sr, Math.floor(rng.range(0.02, 0.08) * sr), [[rng.range(2400, 3400), 1, 0.07], [rng.range(4200, 5200), 0.4, 0.04]], 0.1, rng);
      return normalize(edges(x, sr), 0.85);
    }
    if (material === 'cage') {
      strike(x, sr, 0, [[420, 1, 0.05], [690, 0.7, 0.04], [1130, 0.6, 0.03]], 0.6, rng);
      meshInto(x, sr, 0.0, rng, 0.7, 60, 0.5);
      latchInto(x, sr, 0.015, rng, 0.8);
      return normalize(edges(x, sr), 0.85);
    }
    const armor = material === 'armor';
    const size = armor ? 1.5 : 1;
    // body thud, the panel ringing, the latch, the window rattling in its run
    thudInto(x, sr, 0, rng, 1.0, armor ? 140 : 190, armor ? 0.05 : 0.035);
    burst(x, sr, 0, 0.2, 0.5, rng, { attack: 0.002, decay: 0.05, filter: [['lowpass', 70]] });
    // a stock door is sound-deadened: a short knock, not a bell; rust lets it ring and rattle
    strike(x, sr, 0, panelModes(size, material === 'rusty' ? 0.8 : armor ? 1.1 : 2.6), armor ? 0.5 : 0.3, rng);
    latchInto(x, sr, 0.004, rng, 0.9, armor);
    if (!armor) rattleInto(x, sr, 0.02, rng, material === 'rusty' ? 0.25 : 0.12, material === 'rusty' ? 9 : 5, 0.12, [1400, 3200]);
    if (material === 'rusty') rattleInto(x, sr, 0.03, rng, 0.18, 6, 0.2, [600, 1500]);
    return normalize(saturate(edges(x, sr), 1.4), 0.9);
  };
}

function latchOnly(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.12);
    latchInto(x, sr, 0, rng, 1);
    return normalize(edges(x, sr), 0.5);
  };
}

function bigPanel(open: boolean, size: number): Recipe {
  return (sr, rng) => {
    const x = S(sr, open ? 0.9 : 0.9);
    if (open) {
      // release lever pop, the panel lifting on its springs
      latchInto(x, sr, 0, rng, 0.7, true);
      strike(x, sr, Math.floor(0.01 * sr), panelModes(size * 1.3, 1.2), 0.18, rng);
      creakInto(x, sr, 0.15, 0.55, rng, 0.03, false);
      burst(x, sr, Math.floor(0.6 * sr), 0.15, 0.2, rng, { attack: 0.01, decay: 0.04, filter: [['bandpass', 1800, 2]] });
      return normalize(edges(x, sr), 0.55);
    }
    thudInto(x, sr, 0, rng, 1.0, 150 / size, 0.05);
    burst(x, sr, 0, 0.3, 0.45, rng, { attack: 0.002, decay: 0.07, filter: [['lowpass', 60]] });
    strike(x, sr, 0, panelModes(size * 1.35, 1.1), 0.42, rng);
    latchInto(x, sr, 0.003, rng, 0.9, true);
    rattleInto(x, sr, 0.02, rng, 0.1, 5, 0.15, [700, 1600]);
    return normalize(saturate(edges(x, sr), 1.3), 0.9);
  };
}

/** steel part of mass m (kg) meeting a concrete floor */
function partSetDown(mass: number): Recipe {
  return (sr, rng) => {
    const m = Math.max(0.05, mass);
    const size = Math.cbrt(m); // 1 kg -> 1
    const x = S(sr, 0.35 + 0.35 * Math.min(1, size / 4));
    const f0 = 2600 / size;
    // big castings are heavily damped: the ring grows only with the square root of size
    const ring_ = Math.sqrt(size);
    const modes: Array<[number, number, number]> = [
      [f0, 1, 0.022 * ring_ + 0.006], [f0 * 1.47, 0.7, 0.017 * ring_ + 0.005], [f0 * 2.09, 0.5, 0.013 * ring_ + 0.004], [f0 * 2.83, 0.35, 0.01 * ring_ + 0.003], [f0 * 3.71, 0.22, 0.007 * ring_ + 0.002],
    ].map(([f, g, d]) => [Math.min(f, 9000), g, Math.min(d, 0.12)] as [number, number, number]);
    // the floor thud grows with mass, the ring falls with size
    const thud = Math.min(1, 0.15 + 0.3 * Math.log10(1 + m));
    thudInto(x, sr, 0, rng, thud, Math.max(45, 320 / Math.sqrt(size)), 0.012 + 0.02 * Math.min(1, size / 4));
    strike(x, sr, 0, modes, 0.6 * (1 - 0.5 * Math.min(1, m / 100)), rng, 0.04);
    burst(x, sr, 0, 0.01, 0.35, rng, { attack: 0.0002, decay: 0.002, filter: [['highpass', 1500]] });
    if (m < 4) {
      // small parts bounce once or twice
      let t = rng.range(0.05, 0.09);
      let a = 0.35;
      for (let k = 0; k < 2; k++) {
        strike(x, sr, Math.floor(t * sr), modes, a * 0.6, rng, 0.04);
        t += rng.range(0.03, 0.06) * (1 - 0.3 * k);
        a *= 0.45;
      }
    } else if (m > 60) {
      // heavy: a scrape as it settles
      burst(x, sr, Math.floor(0.04 * sr), 0.18, 0.12, rng, { attack: 0.02, decay: 0.05, filter: [['bandpass', 900, 1.2]] });
    }
    return normalize(saturate(edges(x, sr), 1 + Math.min(1.5, m / 80)), 0.35 + 0.55 * Math.min(1, 0.25 + 0.25 * Math.log10(1 + m)));
  };
}

function partPickup(mass: number): Recipe {
  return (sr, rng) => {
    const m = Math.max(0.05, mass);
    const size = Math.cbrt(m);
    const x = S(sr, 0.28);
    const f0 = 2600 / size;
    // lifted off the floor: a light scrape, a small knock, hands
    burst(x, sr, 0, 0.06, 0.25, rng, { attack: 0.004, decay: 0.015, filter: [['bandpass', Math.min(4000, 1200 + f0 * 0.3), 1]] });
    strike(x, sr, Math.floor(0.015 * sr), [[Math.min(f0, 8000), 1, 0.015 * size + 0.008], [Math.min(f0 * 1.5, 9000), 0.5, 0.01 * size + 0.005]], 0.25, rng);
    burst(x, sr, Math.floor(0.05 * sr), 0.12, 0.1, rng, { attack: 0.01, decay: 0.03, filter: [['bandpass', 2500, 0.8]] });
    if (m > 30) thudInto(x, sr, 0.02, rng, 0.25, 90, 0.03);
    return normalize(edges(x, sr), 0.3 + 0.3 * Math.min(1, m / 50));
  };
}

function partFitted(mass: number, removing: boolean): Recipe {
  return (sr, rng) => {
    const m = Math.max(0.05, mass);
    const size = Math.cbrt(m);
    const x = S(sr, 0.45);
    if (!removing) {
      // seated: a solid clunk, then the last bolt snugged
      thudInto(x, sr, 0, rng, 0.8, Math.max(60, 260 / Math.sqrt(size)), 0.02);
      strike(x, sr, 0, panelModes(Math.max(0.6, size * 0.7), 1.5), 0.3, rng);
      strike(x, sr, Math.floor(0.16 * sr), [[3900, 1, 0.01], [5600, 0.5, 0.006]], 0.4, rng);
      strike(x, sr, Math.floor(0.22 * sr), [[4100, 1, 0.008]], 0.25, rng);
    } else {
      // breaking free: a creak and a knock as it comes away
      creakInto(x, sr, 0, 0.1, rng, 0.12, false);
      thudInto(x, sr, 0.09, rng, 0.5, Math.max(70, 300 / Math.sqrt(size)), 0.015);
      strike(x, sr, Math.floor(0.09 * sr), panelModes(Math.max(0.6, size * 0.7), 1.8), 0.2, rng);
    }
    return normalize(edges(x, sr), 0.75);
  };
}

function keyTurn(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.3);
    burst(x, sr, 0, 0.05, 0.3, rng, { attack: 0.002, decay: 0.012, filter: [['bandpass', 5200, 2]] });
    for (let k = 0; k < 3; k++) {
      const at = Math.floor((0.07 + 0.055 * k + rng.range(-0.005, 0.005)) * sr);
      strike(x, sr, at, [[rng.range(2900, 3400), 1, 0.006], [rng.range(5200, 6000), 0.5, 0.004]], 0.6 - 0.12 * k, rng);
      burst(x, sr, at, 0.003, 0.4, rng, { attack: 0.0001, decay: 0.0006, filter: [['highpass', 2500]] });
    }
    return normalize(edges(x, sr), 0.4);
  };
}

function handbrake(pull: boolean): Recipe {
  return (sr, rng) => {
    const x = S(sr, pull ? 0.45 : 0.3);
    if (pull) {
      // the pawl over the teeth, getting faster and harder as it comes up
      let t = 0;
      for (let k = 0; k < 7; k++) {
        strike(x, sr, Math.floor(t * sr), [[rng.range(2300, 2600), 1, 0.006], [rng.range(4100, 4600), 0.6, 0.004]], 0.45 + 0.07 * k, rng);
        burst(x, sr, Math.floor(t * sr), 0.002, 0.3, rng, { attack: 0.0001, decay: 0.0005, filter: [['highpass', 2000]] });
        t += 0.05 - 0.004 * k;
      }
      thudInto(x, sr, t, rng, 0.25, 220, 0.015);
    } else {
      strike(x, sr, 0, [[3300, 1, 0.005]], 0.4, rng);
      burst(x, sr, Math.floor(0.03 * sr), 0.12, 0.2, rng, { attack: 0.005, decay: 0.02, filter: [['bandpass', 1500, 1.5]] });
      thudInto(x, sr, 0.14, rng, 0.5, 200, 0.018);
      strike(x, sr, Math.floor(0.14 * sr), [[900, 1, 0.03], [1500, 0.6, 0.02]], 0.25, rng);
    }
    return normalize(edges(x, sr), 0.55);
  };
}

function gearShift(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.25);
    // the lever in its gate, then the dog clutch going home in the box
    strike(x, sr, 0, [[1700, 1, 0.01], [2600, 0.6, 0.007]], 0.3, rng);
    burst(x, sr, 0, 0.003, 0.3, rng, { attack: 0.0001, decay: 0.0006, filter: [['highpass', 1500]] });
    const at = Math.floor(rng.range(0.025, 0.04) * sr);
    thudInto(x, sr, at / sr, rng, 0.6, 240, 0.014);
    strike(x, sr, at, [[340, 1, 0.04], [610, 0.7, 0.03], [980, 0.4, 0.02]], 0.35, rng);
    return normalize(edges(x, sr), 0.55);
  };
}

function gearGrind(): Recipe {
  return (sr, rng) => {
    const len = 0.45;
    const x = noise(Math.floor(len * sr), rng);
    biquad(x, sr, 'bandpass', 2400, 1.1);
    const teeth = rng.range(180, 260);
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      const tooth = Math.pow(Math.max(0, Math.sin(2 * Math.PI * teeth * t * (1 + 0.15 * t))), 6);
      const env = Math.min(1, t / 0.01) * Math.exp(-Math.max(0, t - 0.25) / 0.07);
      x[i] = (x[i] * (0.35 + 1.4 * tooth) + 0.5 * tooth * Math.sin(2 * Math.PI * 1150 * t)) * env;
    }
    strike(x, sr, 0, [[1300, 1, 0.08], [2100, 0.7, 0.06]], 0.2, rng);
    return normalize(saturate(edges(x, sr, 1, 20), 1.6), 0.6);
  };
}

function sprayShake(): Recipe {
  return (sr, rng) => {
    // the mixing ball rattling in the can
    const x = S(sr, 0.7);
    for (let k = 0; k < 8; k++) {
      const t = k * 0.085 + rng.range(-0.008, 0.008);
      strike(x, sr, Math.floor(t * sr), [[rng.range(3800, 4300), 1, 0.01], [rng.range(6500, 7200), 0.5, 0.006], [rng.range(1900, 2200), 0.4, 0.02]], 0.5 * (k % 2 ? 0.7 : 1), rng);
    }
    return normalize(edges(x, sr), 0.45);
  };
}

/** a dashboard toggle: the plastic lever snapping over its spring, a tiny contact tick */
function toggleSwitch(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.12);
    burst(x, sr, 0, 0.003, 0.5, rng, { attack: 0.0001, decay: 0.0006, filter: [['highpass', 1500], ['peaking', 3800, 2]] });
    strike(x, sr, 0, [[2600, 1, 0.006], [4300, 0.5, 0.004], [6900, 0.25, 0.003]], 0.45, rng);
    const b = Math.floor(rng.range(0.008, 0.013) * sr);
    strike(x, sr, b, [[1900, 1, 0.009], [3100, 0.5, 0.006]], 0.3, rng);
    burst(x, sr, b, 0.004, 0.25, rng, { attack: 0.0002, decay: 0.001, filter: [['bandpass', 1200, 1.2]] });
    return normalize(edges(x, sr), 0.4);
  };
}

/** a gear selector stepping into its next notch: a detent thock through the console */
function selectorLever(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.18);
    burst(x, sr, 0, 0.012, 0.35, rng, { attack: 0.003, decay: 0.004, filter: [['bandpass', 2200, 1.2]] });
    const at = Math.floor(rng.range(0.012, 0.02) * sr);
    thudInto(x, sr, at / sr, rng, 0.55, 300, 0.01);
    strike(x, sr, at, [[820, 1, 0.022], [1430, 0.6, 0.014], [2500, 0.3, 0.008]], 0.3, rng);
    return normalize(edges(x, sr), 0.45);
  };
}

/** a short original fanfare for the musical horn (five-note bugle call) */
function trumpetHorn(): Recipe {
  return (sr, rng) => {
    const notes: Array<[number, number]> = [
      [392.0, 0.16], [523.25, 0.16], [659.25, 0.16], [783.99, 0.34], [659.25, 0.14], [783.99, 0.6],
    ];
    const total = notes.reduce((a, [, d]) => a + d, 0) + 0.15;
    const x = S(sr, total);
    let t0 = 0;
    for (const [f, d] of notes) {
      const a = Math.floor(t0 * sr);
      const n = Math.floor(d * sr);
      let ph = 0;
      for (let i = 0; i < n && a + i < x.length; i++) {
        const t = i / sr;
        const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t / 0.15);
        ph += (f * vib) / sr;
        // brassy: a saw with its top rolled off by the bell, plus a buzzy reed square
        const saw = 2 * (ph % 1) - 1;
        const sq = ph % 1 < 0.5 ? 1 : -1;
        const env = Math.min(1, t / 0.018) * Math.min(1, (d - t) / 0.03);
        x[a + i] += (0.7 * saw + 0.3 * sq) * env;
      }
      t0 += d;
    }
    biquad(x, sr, 'peaking', 1250, 1.4, 8);
    biquad(x, sr, 'peaking', 2600, 2, 4);
    biquad(x, sr, 'lowpass', 4200, 0.7);
    biquad(x, sr, 'highpass', 250, 0.7);
    void rng;
    return normalize(saturate(edges(x, sr), 1.8), 0.85);
  };
}

// ------------------------------------------------------------------ loops (seamless: whole cycles)

function hornLoop(freqs: number[], loopSec: number, buzz: number, band: [number, number], drive: number): Recipe {
  return (sr) => {
    const n = Math.round(loopSec * sr);
    const x = new Float32Array(n);
    for (const f of freqs) {
      // snap to a whole number of periods in the loop
      const cycles = Math.round(f * loopSec);
      const fs = cycles / (n / sr);
      for (let i = 0; i < n; i++) {
        const ph = (fs * i) / sr;
        const p = ph % 1;
        // a diaphragm horn is close to a pulse wave
        x[i] += p < 0.3 ? 1 : -0.43;
      }
    }
    const am = Math.round(buzz * loopSec) / (n / sr);
    for (let i = 0; i < n; i++) x[i] *= 0.8 + 0.2 * Math.sin((2 * Math.PI * am * i) / sr);
    // the filters must not break the loop: run them over three copies, keep the middle
    const y = new Float32Array(3 * n);
    for (let k = 0; k < 3; k++) y.set(x, k * n);
    biquad(y, sr, 'peaking', band[0], 1.5, 9);
    biquad(y, sr, 'peaking', band[1], 2.5, 5);
    biquad(y, sr, 'lowpass', 5000, 0.7);
    biquad(y, sr, 'highpass', 180, 0.7);
    const out = y.slice(n, 2 * n);
    return normalize(saturate(out, drive), 0.85);
  };
}

/** n seconds of loop built from events placed cyclically (anything spilling over wraps round) */
function cyclic(sr: number, seconds: number, draw: (x: Float32Array) => void): Float32Array {
  const n = Math.floor(seconds * sr);
  const big = new Float32Array(2 * n);
  draw(big);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = big[i] + big[i + n];
  return out;
}

function ratchetLoop(): Recipe {
  return (sr, rng) => {
    const len = 1.4;
    return normalize(
      cyclic(sr, len, (x) => {
        // two strokes: the swing back clicks over the pawl, the pull tightens (a creak, no clicks)
        for (let stroke = 0; stroke < 2; stroke++) {
          const t0 = stroke * 0.7;
          for (let k = 0; k < 6; k++) {
            const t = t0 + 0.04 + k * 0.052 + rng.range(-0.004, 0.004);
            strike(x, sr, Math.floor(t * sr), [[rng.range(3500, 3900), 1, 0.006], [rng.range(5600, 6200), 0.55, 0.004], [rng.range(2100, 2400), 0.3, 0.01]], 0.8, rng, 0.02);
            burst(x, sr, Math.floor(t * sr), 0.002, 0.35, rng, { attack: 0.0001, decay: 0.0004, filter: [['highpass', 2500]] });
          }
          creakInto(x, sr, t0 + 0.42, 0.22, rng, 0.06, false);
        }
      }),
      0.5,
    );
  };
}

function sprayLoop(): Recipe {
  return (sr, rng) => {
    const len = 2.0;
    const n = Math.floor(len * sr);
    const x = noise(3 * n, rng);
    biquad(x, sr, 'highpass', 2200, 0.7);
    biquad(x, sr, 'peaking', 6200, 1.2, 6);
    biquad(x, sr, 'lowpass', 12000, 0.7);
    const out = x.slice(n, 2 * n);
    // the nozzle flutters a little (whole cycles in the loop)
    for (let i = 0; i < n; i++) out[i] *= 0.85 + 0.15 * Math.sin((2 * Math.PI * 7 * i) / n);
    // crossfade the copy's wrap point away
    return normalize(seamless(out, sr), 0.4);
  };
}

function spongeLoop(): Recipe {
  return (sr, rng) => {
    const len = 2.0;
    return normalize(
      cyclic(sr, len, (x) => {
        const n = Math.floor(len * sr);
        // back and forth: wet rubbing swells twice per second
        const rub = noise(n, rng);
        biquad(rub, sr, 'lowpass', 1400, 0.7);
        biquad(rub, sr, 'highpass', 150, 0.7);
        for (let i = 0; i < n; i++) {
          const ph = (i / n) * 4; // four strokes per loop
          rub[i] *= 0.25 + 0.75 * Math.pow(Math.abs(Math.sin(Math.PI * ph)), 1.5);
        }
        mixInto(x, rub, 0, 0.6);
        // squelch: little bubbles popping in the foam
        for (let k = 0; k < 40; k++) {
          const t = rng.range(0, len);
          const f = rng.range(700, 2200);
          ring(x, sr, Math.floor(t * sr), f, rng.range(0.05, 0.2), rng.range(0.003, 0.008));
        }
      }),
      0.45,
    );
  };
}

function pourLoop(liquid: Liquid): Recipe {
  return (sr, rng) => {
    const len = 2.0;
    const p = liquid === 'oil' ? { rate: 3.0, f: [140, 320], stream: 600, splash: 0.15, decay: 0.05 } : liquid === 'fuel' ? { rate: 6.5, f: [260, 650], stream: 1800, splash: 0.4, decay: 0.03 } : { rate: 5.0, f: [200, 520], stream: 1300, splash: 0.3, decay: 0.035 };
    return normalize(
      cyclic(sr, len, (x) => {
        const n = Math.floor(len * sr);
        // the stream into the filler neck
        const s = noise(n, rng);
        biquad(s, sr, 'lowpass', p.stream, 0.7);
        biquad(s, sr, 'highpass', 120, 0.7);
        mixInto(x, s, 0, p.splash);
        // glugs: air going back into the can as rising bubbles (Minnaert resonance)
        let t = 0;
        while (t < len) {
          const a = Math.floor(t * sr);
          const f0 = rng.range(p.f[0], p.f[1]);
          const m = Math.floor(p.decay * 6 * sr);
          let ph = 0;
          for (let i = 0; i < m && a + i < x.length; i++) {
            const tt = i / sr;
            ph += (f0 * (1 + 2.2 * tt / (p.decay * 6))) / sr;
            x[a + i] += Math.sin(2 * Math.PI * ph) * Math.exp(-tt / p.decay) * Math.min(1, tt / 0.002) * 0.9;
          }
          t += (1 / p.rate) * rng.range(0.7, 1.3);
        }
      }),
      0.45,
    );
  };
}

/** make a noise loop wrap cleanly: crossfade its last 50 ms into its start */
function seamless(x: Float32Array, sr: number): Float32Array {
  const F = Math.floor(0.05 * sr);
  const n = x.length - F;
  const out = x.slice(0, n);
  for (let i = 0; i < F; i++) {
    const w = i / F;
    out[i] = out[i] * w + x[n + i] * (1 - w);
  }
  return out;
}

// ------------------------------------------------------------------ the body

function bite(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.22);
    // a crunch: a few dry grains in quick succession, over a soft thud of the jaw
    for (let k = 0; k < 6; k++) {
      const t = 0.004 + k * rng.range(0.008, 0.016);
      burst(x, sr, Math.floor(t * sr), rng.range(0.004, 0.009), rng.range(0.5, 1), rng, { attack: 0.0003, decay: 0.003, filter: [['bandpass', rng.range(1800, 3800), 1.1]] });
    }
    burst(x, sr, 0, 0.05, 0.6, rng, { attack: 0.002, decay: 0.03, filter: [['lowpass', 260]] });
    return normalize(edges(x, sr, 1, 20), 0.8);
  };
}

function wrapper(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.5);
    // plastic crinkle: many tiny bright crackles, thinning out
    for (let k = 0; k < 46; k++) {
      const t = Math.pow(rng.next(), 1.6) * 0.45;
      burst(x, sr, Math.floor(t * sr), rng.range(0.001, 0.004), rng.range(0.2, 1), rng, { attack: 0.0001, decay: 0.0015, filter: [['highpass', 2600], ['peaking', rng.range(4000, 7000), 2]] });
    }
    return normalize(edges(x, sr, 1, 30), 0.6);
  };
}

function canOpen(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.6);
    // the tab's click, then the gas
    strike(x, sr, Math.floor(0.01 * sr), [[rng.range(3200, 3600), 1, 0.008], [rng.range(5200, 5800), 0.5, 0.005]], 0.9, rng);
    const h = noise(Math.floor(0.5 * sr), rng);
    biquad(h, sr, 'highpass', 3000, 0.7);
    biquad(h, sr, 'peaking', 7000, 1.4, 6);
    for (let i = 0; i < h.length; i++) h[i] *= Math.exp(-i / (0.09 * sr)) * Math.min(1, i / (0.004 * sr));
    mixInto(x, h, Math.floor(0.02 * sr), 0.7);
    return normalize(edges(x, sr, 1, 40), 0.75);
  };
}

function capOpen(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.35);
    // the seal's little ticks as the cap turns, a puff
    for (let k = 0; k < 4; k++) strike(x, sr, Math.floor((0.02 + k * 0.045) * sr), [[rng.range(2400, 3000), 0.7, 0.006]], 0.6, rng);
    burst(x, sr, Math.floor(0.2 * sr), 0.08, 0.3, rng, { attack: 0.005, decay: 0.05, filter: [['highpass', 2500]] });
    return normalize(edges(x, sr, 1, 20), 0.6);
  };
}

function pills(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.5);
    // a handful rattling in a plastic tub
    for (let k = 0; k < 14; k++) {
      const t = rng.range(0, 0.32);
      strike(x, sr, Math.floor(t * sr), [[rng.range(2600, 4200), 1, 0.006], [rng.range(5000, 6800), 0.4, 0.004]], rng.range(0.3, 0.8), rng);
    }
    return normalize(edges(x, sr, 1, 30), 0.6);
  };
}

/** one swallow: a low gloop (a falling bubble) over a little noise */
function gulpInto(x: Float32Array, sr: number, at: number, rng: Rng, amp = 1): void {
  const n = Math.floor(0.12 * sr);
  const a = Math.floor(at * sr);
  const f0 = rng.range(260, 340);
  let ph = 0;
  for (let i = 0; i < n && a + i < x.length; i++) {
    const t = i / sr;
    const f = f0 * (1 - 0.45 * (i / n));
    ph += (2 * Math.PI * f) / sr;
    x[a + i] += amp * Math.sin(ph) * Math.exp(-t / 0.04) * Math.min(1, t / 0.004);
  }
  burst(x, sr, a, 0.05, 0.12 * amp, rng, { attack: 0.002, decay: 0.03, filter: [['bandpass', 900, 1]] });
}

function gulp(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.25);
    gulpInto(x, sr, 0.01, rng);
    return normalize(edges(x, sr, 1, 20), 0.7);
  };
}

function hurt(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.35);
    // a dull blow felt in the chest, no voice
    let ph = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      ph += (2 * Math.PI * (70 - 25 * Math.min(1, t / 0.2))) / sr;
      x[i] = Math.sin(ph) * Math.exp(-t / 0.09) * Math.min(1, t / 0.003);
    }
    burst(x, sr, 0, 0.06, 0.35, rng, { attack: 0.001, decay: 0.03, filter: [['lowpass', 500]] });
    return normalize(edges(x, sr, 1, 30), 0.85);
  };
}

function cloth(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.45);
    const n = noise(Math.floor(0.4 * sr), rng);
    biquad(n, sr, 'lowpass', 2200, 0.7);
    biquad(n, sr, 'highpass', 250, 0.7);
    // a swish: up and down, with a strap's buckle at the end
    for (let i = 0; i < n.length; i++) n[i] *= Math.pow(Math.sin((Math.PI * i) / n.length), 2);
    mixInto(x, n, 0, 0.8);
    strike(x, sr, Math.floor(0.38 * sr), [[rng.range(2000, 2600), 0.6, 0.01]], 0.4, rng);
    return normalize(edges(x, sr, 2, 30), 0.55);
  };
}

function glugLoop(): Recipe {
  return (sr, rng) => {
    const len = 1.8;
    return normalize(
      cyclic(sr, len, (x) => {
        // a swallow every 0.45 s, the liquid gurgling into the neck between
        for (let k = 0; k < 4; k++) gulpInto(x, sr, k * 0.45 + rng.range(0, 0.04), rng, rng.range(0.8, 1));
        for (let k = 0; k < 18; k++) ring(x, sr, Math.floor(rng.range(0, len) * sr), rng.range(500, 1300), rng.range(0.04, 0.12), rng.range(0.006, 0.014));
      }),
      0.55,
    );
  };
}

function breathLoop(): Recipe {
  return (sr, rng) => {
    const len = 1.6;
    return normalize(
      cyclic(sr, len, (x) => {
        // out of breath: in and out, twice a loop
        const n = Math.floor(len * sr);
        const b = noise(n, rng);
        biquad(b, sr, 'lowpass', 1500, 0.7);
        biquad(b, sr, 'highpass', 220, 0.7);
        biquad(b, sr, 'peaking', 700, 1.2, 4);
        for (let i = 0; i < n; i++) {
          const ph = (i / n) * 2;
          const k = ph % 1;
          // the out-breath stronger than the in
          b[i] *= (k < 0.45 ? 0.55 * Math.sin((Math.PI * k) / 0.45) : Math.sin((Math.PI * (k - 0.45)) / 0.55)) ** 2;
        }
        mixInto(x, b, 0, 0.7);
      }),
      0.45,
    );
  };
}

function heartLoop(): Recipe {
  return (sr, rng) => {
    const len = 0.85;
    return normalize(
      cyclic(sr, len, (x) => {
        // lub-dub
        for (const [at, amp] of [[0, 1], [0.22, 0.7]] as const) {
          const a = Math.floor(at * sr);
          for (let i = 0; i < Math.floor(0.12 * sr); i++) {
            const t = i / sr;
            x[a + i] += amp * Math.sin(2 * Math.PI * 52 * t) * Math.exp(-t / 0.035) * Math.min(1, t / 0.004);
          }
        }
        void rng;
      }),
      0.6,
    );
  };
}

function peeLoop(): Recipe {
  return (sr, rng) => {
    const len = 2.0;
    const n = Math.floor(len * sr);
    const x = noise(3 * n, rng);
    biquad(x, sr, 'bandpass', 1600, 0.8);
    biquad(x, sr, 'peaking', 3200, 1.5, 4);
    const out = x.slice(n, 2 * n);
    for (let i = 0; i < n; i++) out[i] *= 0.8 + 0.2 * Math.sin((2 * Math.PI * 9 * i) / n);
    return normalize(seamless(out, sr), 0.35);
  };
}

// ------------------------------------------------------------------ catalogue

const SHOT_LEVEL: Record<FoleyShot, number> = {
  door_open: 0.5, door_close: 0.9, latch: 0.5, hood_open: 0.5, hood_close: 0.95, trunk_open: 0.5, trunk_close: 0.85,
  part_pickup: 0.5, part_setdown: 0.8, part_install: 0.75, part_remove: 0.65, key_turn: 0.45, handbrake_pull: 0.6,
  handbrake_release: 0.55, gear_shift: 0.55, gear_grind: 0.6, spray_shake: 0.45, horn_trumpet: 0.42, switch: 0.35, lever: 0.45,
  crash: 1.0,
  bite: 0.55, wrapper: 0.4, can_open: 0.5, cap_open: 0.4, pills: 0.4, gulp: 0.5, hurt: 0.8, cloth: 0.45,
};

const LOOP_LEVEL: Record<FoleyLoop, number> = { ratchet: 0.6, spray: 0.45, sponge: 0.45, pour: 0.5, horn_beep: 0.4, horn_air: 0.36, glug: 0.5, breath: 0.4, heart: 0.5, pee: 0.3 };

function massClass(m: number): number {
  // 0.25, 1, 4, 16, 64, 250 kg classes keep the cache small
  return Math.pow(4, Math.round(Math.log(Math.max(0.1, m)) / Math.log(4)));
}

/** the recipe for a sound and its options (exported for tests and the render harness) */
export function recipe(kind: FoleyShot | FoleyLoop, o: FoleyOpts = {}): Recipe {
  const mat = o.material ?? 'metal';
  const mass = massClass(o.mass ?? 5);
  switch (kind) {
    case 'door_open': return doorOpen(mat);
    case 'door_close': return doorClose(mat);
    case 'latch': return latchOnly();
    case 'hood_open': return bigPanel(true, 1.35);
    case 'hood_close': return bigPanel(false, 1.35);
    case 'trunk_open': return bigPanel(true, 1.1);
    case 'trunk_close': return bigPanel(false, 1.1);
    case 'part_pickup': return partPickup(mass);
    case 'part_setdown': return partSetDown(mass);
    case 'part_install': return partFitted(mass, false);
    case 'part_remove': return partFitted(mass, true);
    case 'key_turn': return keyTurn();
    case 'handbrake_pull': return handbrake(true);
    case 'handbrake_release': return handbrake(false);
    case 'gear_shift': return gearShift();
    case 'gear_grind': return gearGrind();
    case 'spray_shake': return sprayShake();
    case 'horn_trumpet': return trumpetHorn();
    case 'switch': return toggleSwitch();
    case 'lever': return selectorLever();
    case 'crash': return crash();
    case 'bite': return bite();
    case 'wrapper': return wrapper();
    case 'can_open': return canOpen();
    case 'cap_open': return capOpen();
    case 'pills': return pills();
    case 'gulp': return gulp();
    case 'hurt': return hurt();
    case 'cloth': return cloth();
    case 'glug': return glugLoop();
    case 'breath': return breathLoop();
    case 'heart': return heartLoop();
    case 'pee': return peeLoop();
    case 'ratchet': return ratchetLoop();
    case 'spray': return sprayLoop();
    case 'sponge': return spongeLoop();
    case 'pour': return pourLoop(o.liquid ?? 'fuel');
    case 'horn_beep': return hornLoop([420, 500], 0.1, 100, [1100, 2400], 2.2);
    case 'horn_air': return hornLoop([155, 195, 245], 0.2, 25, [520, 1250], 3.0);
  }
}

export const FOLEY_SHOTS: readonly FoleyShot[] = Object.keys(SHOT_LEVEL) as FoleyShot[];
export const FOLEY_LOOPS: readonly FoleyLoop[] = Object.keys(LOOP_LEVEL) as FoleyLoop[];

const VARIANTS = 3;

/** plays the mechanical sounds on an AudioContext (the game's, or an offline one) */
export class Foley {
  readonly ctx: BaseAudioContext;
  readonly out: GainNode;
  private readonly cache = new Map<string, AudioBuffer[]>();
  private readonly loops = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>();
  private readonly rng = new Rng(0xf01e7);

  constructor(ctx: BaseAudioContext, output: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.connect(output);
  }

  private key(kind: string, o: FoleyOpts): string {
    return `${kind}|${o.material ?? ''}|${o.mass !== undefined ? massClass(o.mass) : ''}|${o.liquid ?? ''}`;
  }

  private buffers(kind: FoleyShot | FoleyLoop, o: FoleyOpts, variants: number): AudioBuffer[] {
    const k = this.key(kind, o);
    let list = this.cache.get(k);
    if (!list) {
      list = [];
      const r = recipe(kind, o);
      const sr = this.ctx.sampleRate;
      for (let v = 0; v < variants; v++) {
        let seed = 7 + v * 7919;
        for (const c of k) seed = (seed * 31 + c.charCodeAt(0)) | 0;
        const x = r(sr, new Rng(seed));
        const b = this.ctx.createBuffer(1, x.length, sr);
        b.copyToChannel(x as Float32Array<ArrayBuffer>, 0);
        list.push(b);
      }
      this.cache.set(k, list);
    }
    return list;
  }

  /** render ahead of time (avoids a hitch the first time a sound plays) */
  warm(kinds: ReadonlyArray<FoleyShot | FoleyLoop>, o: FoleyOpts = {}): void {
    for (const k of kinds) this.buffers(k, o, (FOLEY_LOOPS as readonly string[]).includes(k) || k === 'horn_trumpet' ? 1 : VARIANTS);
  }

  private route(src: AudioBufferSourceNode, gain: number, pan?: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    if (pan !== undefined && this.ctx.destination.channelCount > 1) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      src.connect(g).connect(p).connect(this.out);
    } else {
      src.connect(g).connect(this.out);
    }
    return g;
  }

  /** a one-shot */
  play(kind: FoleyShot, o: FoleyOpts = {}, when = 0): void {
    // (a tune is the same every time: one rendering is enough)
    const list = this.buffers(kind, o, kind === 'horn_trumpet' ? 1 : VARIANTS);
    const src = this.ctx.createBufferSource();
    src.buffer = list[Math.floor(this.rng.next() * list.length)];
    // a hair of pitch and level variation so repeats are not identical
    src.playbackRate.value = 1 + 0.03 * (this.rng.next() - 0.5);
    const g = this.route(src, SHOT_LEVEL[kind] * (o.gain ?? 1) * (0.92 + 0.16 * this.rng.next()), o.pan);
    const t = Math.max(this.ctx.currentTime, when);
    src.start(t);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
  }

  /** start or keep a loop going (the ratchet while a part is being fitted, a horn while held, ...) */
  start(kind: FoleyLoop, o: FoleyOpts = {}): void {
    const k = this.key(kind, o);
    const live = this.loops.get(kind);
    const t = this.ctx.currentTime;
    if (live && live.src.buffer && this.cache.get(k)?.includes(live.src.buffer)) {
      live.gain.gain.setTargetAtTime(LOOP_LEVEL[kind] * (o.gain ?? 1), t, 0.02);
      return;
    }
    if (live) this.stop(kind);
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers(kind, o, 1)[0];
    src.loop = true;
    const g = this.route(src, 0, o.pan);
    // horns snap on; the rest ease in
    const attack = kind === 'horn_beep' || kind === 'horn_air' ? 0.006 : 0.03;
    g.gain.setValueAtTime(0, t);
    g.gain.setTargetAtTime(LOOP_LEVEL[kind] * (o.gain ?? 1), t, attack);
    src.start(t, this.rng.next() * src.buffer.duration);
    this.loops.set(kind, { src, gain: g });
  }

  stop(kind: FoleyLoop): void {
    const live = this.loops.get(kind);
    if (!live) return;
    this.loops.delete(kind);
    const t = this.ctx.currentTime;
    const release = kind === 'horn_air' ? 0.09 : kind === 'horn_beep' ? 0.02 : 0.05;
    live.gain.gain.cancelScheduledValues(t);
    live.gain.gain.setTargetAtTime(0, t, release);
    live.src.stop(t + release * 8);
    live.src.onended = () => {
      live.src.disconnect();
      live.gain.disconnect();
    };
  }

  /** horn button: beep and air horn sound while held; the musical horn plays its tune per press */
  horn(kind: 'horn_beep' | 'horn_trumpet' | 'horn_air', down: boolean): void {
    if (kind === 'horn_trumpet') {
      if (down) this.play('horn_trumpet');
      return;
    }
    if (down) this.start(kind);
    else this.stop(kind);
  }

  /** is a loop playing */
  playing(kind: FoleyLoop): boolean {
    return this.loops.has(kind);
  }
}
