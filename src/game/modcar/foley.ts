/**
 * ModCar mechanical sounds, all synthesized (no recordings): doors and panels by material,
 * latches, the ratchet wrench while a part goes on or comes off, parts picked up and set down by
 * mass, spray can, sponge, pouring fuel / water / oil, the key, three horns, the handbrake, gear
 * changes and a grind; the body (eating, drinking, medicine); the workshop (the generator's rope,
 * switch and last splutter, the recycler running, grinding and shredding things by material, its
 * counter, the crafting bench and its hammer, the power and the lamps); scrubbing (a scraper blade
 * on grimy glass, painted metal, rust and mud, a wire brush, a wet sponge, the blade's catch as a
 * stroke begins, flakes falling, the chimes of a part come clean, of its rust gone and of a whole
 * vehicle restored, a tool worn out, the dirt shown); spray paint (the can shaken, its valve opening,
 * the hiss, a can running dry, a part come to its new colour); tyres and wrecks (a blowout, driving on
 * a flat, a bare rim on the road, a rusted wreck's panel forced open, the find under its bonnet,
 * something rare glinting nearby); the roadside places (a container searched by hand, by what it is
 * and holds: its door, lid or zip, the search, nothing in it; a house's door and a shop's with its
 * bell; a filling station's pump: the nozzle lifted and hung back, the pump running, its shut-off,
 * running dry); the tyres on the road by the surface under them (rolling on dry and wet asphalt,
 * gravel, dirt, grass, sand, snow and ice, brighter as they go faster; sliding on each: the asphalt's
 * squeal, the gravel sprayed, the turf torn, the ice's hiss), each loop with its own low-pass when
 * asked (FoleyOpts.cutoff: heard from a closed cabin). Each sound is a recipe that renders a short
 * Float32Array (synth.ts); the player caches a few variations of each and plays them on the game's
 * AudioContext.
 */
import { Rng, biquad, burst, edges, mixInto, noise, normalize, ring, saturate, strike, type BiquadKind } from './synth';

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
  | 'cloth'
  // the workshop: the generator, the recycler, the crafting bench, the power
  /** the generator's recoil starter pulled hard: the rope zipping out over 2-3 compressions, rewinding with its pawls rattling (~0.85 s) */
  | 'cord_pull'
  /** the generator's heavy toggle switch on its steel panel: a solid clack */
  | 'gen_switch'
  /** the generator running dry: a few sputters and a last wheeze (the bank's shutdown goes under it) */
  | 'gen_cough'
  /** one thing ground up in the recycler: crunching, tearing, snapping, bits pinging off the rotors (by `grind`) */
  | 'shred'
  /** the recycler's counter drum flipping over (every 5 units counted) */
  | 'tally'
  /** tools picked up and set out on the bench: a short metallic shuffle */
  | 'craft_start'
  /** the hammer's swing: a short whoosh */
  | 'hammer_swing'
  /** the hammer striking the work on the anvil plate (`grind` = the work: metal rings, plastic knocks, wood thocks) */
  | 'hammer_hit'
  /** the new thing finished: a bright "ding" (~0.8 s) */
  | 'craft_done'
  /** the power coming on: a contactor clunk, the hum rising, the lamps flickering on (~1.2 s) */
  | 'power_on'
  /** the power going off: a click and the hum dying away */
  | 'power_off'
  /** a switch thrown with no power: a dull dead click */
  | 'no_power'
  // scrubbing: dirt, rust and the cleaning tools
  /** the blade catching on the surface as a stroke begins (~0.09 s, by `surface`) */
  | 'scrape_start'
  /** bits of dirt or rust landing on the floor: a few faint ticks over ~0.3 s (very quiet, played often) */
  | 'flake_drop'
  /** a part has come clean: a bright little bell and a glint (~0.85 s), the reward */
  | 'clean_ding'
  /** rust brushed off a part: a warmer two-note chime (~1 s) */
  | 'clean_rust_done'
  /** the whole vehicle restored: a rising arpeggio of bells blooming into a chord, sparkling (~2.2 s) */
  | 'clean_car_done'
  /** a cleaning tool worn out (a sponge torn, a blade blunt, bristles gone): a dull tearing crunch (~0.3 s) */
  | 'tool_worn'
  /** the dirt that is left shown (H): a soft sonar ping with a shimmer (~0.6 s) */
  | 'highlight_ping'
  // spray paint (`spray_shake` above is the older shake, kept as it was)
  /** shaking a spray can before its first use: the mixing ball clacking five to seven times, the tin ringing short (~0.8 s) */
  | 'spray_rattle'
  /** the valve opening as the button goes down: a tick and a short pssht, handing over to spray_hiss (~0.16 s) */
  | 'spray_start'
  /** a can running dry: the hiss coughing and spitting out to nothing (~0.7 s) */
  | 'spray_sputter'
  /** a part has reached the can's colour: a soft two-note glossy shimmer (~0.6 s) */
  | 'paint_done'
  // tyres and wrecks
  /** a tyre blowing out under the moving car, heard from the seat: a heavy bang, the air roaring out, the rubber slapping (~0.9 s) */
  | 'tyre_burst'
  /** a rusted wreck's door or bonnet forced open the first time: a long groan, the rust letting go with a crack (~1 s) */
  | 'wreck_creak'
  /** a wreck's bonnet up on something good: a short warm sting, fuller with `tier` (1-5) */
  | 'loot_reveal'
  // roadside places: containers searched by hand (by `material`), a house's and a shop's door, a filling station's pump
  /** the start of a search (E pressed on a container), by `material`: a cupboard door's catch and hinge, a crate's lid prised up on its nails, a toolbox's clasps or a steel drawer, a bag's zip, a shop's packets shuffled (~0.4-0.9 s) */
  | 'container_open'
  /** nothing in it: a hollow knock on the bare inside, the drawer pushed back, a bag patted flat (~0.3-0.45 s, by `material`) */
  | 'container_empty'
  /** a house's wooden door opened: the lever handle and the latch, the door off its stop, the hinges (unoiled, dry or quiet by turns) (~1 s) */
  | 'door_house_open'
  /** a house's wooden door pulled shut: the air before it, the heavy thud into the frame, the latch snapping home (~0.8 s) */
  | 'door_house_close'
  /** a shop's glass-and-aluminium door pushed open: the push bar's clack, the glass shivering, the little bell over the door (two soft notes, B6 and G6) (~1.15 s) */
  | 'door_shop_open'
  /** the shop's door drawn shut by its closer: a hydraulic sigh, the seal's padded thup, the latch's click, the glass shivering (~0.7 s) */
  | 'door_shop_close'
  /** a pump's nozzle lifted off its hook: a clack, the switch lever flipping up, the hose dragging (~0.38 s) */
  | 'pump_lift'
  /** the nozzle hung back: a clunk into the holster, the lever pushed down, the hose swinging (~0.48 s) */
  | 'pump_hang'
  /** the nozzle's automatic shut-off as the tank or the can is full: a hard click, a last spit (~0.22 s) */
  | 'pump_click'
  /** the pump running dry: the motor labouring, fuel and air spluttering, a gurgle, the motor cut and winding down (~1.6 s) */
  | 'pump_dry';

export type FoleyLoop =
  | 'ratchet'
  | 'spray'
  | 'sponge'
  | 'pour'
  | 'horn_beep'
  | 'horn_air'
  | 'glug'
  | 'breath'
  | 'heart'
  | 'pee'
  /** the recycler running empty: its motor's hum, the gearbox whine, the rotors turning with a light rattle */
  | 'recycler_run'
  /** something being ground (over recycler_run, faded with the work): dense crunching over a straining motor */
  | 'recycler_grind'
  /** the workshop's fluorescent tubes humming, very quietly */
  | 'lamp_buzz'
  // scrubbing (each driven every frame: gain with how hard and fast the tool moves, rate with the stroke's speed)
  /** a scraper blade over a window caked in dried grime: a wavering stick-slip squeal over gritty crunching */
  | 'scrape_glass'
  /** the blade over painted sheet metal with grime on it: a dry rasp, the panel ringing faintly */
  | 'scrape_metal'
  /** rust scale and crust breaking off under the blade: dense crackling, flakes popping, a low scrape */
  | 'scrape_rust'
  /** soft damp dirt pushed off: a muffled smear, wet clumps */
  | 'scrape_mud'
  /** a steel wire brush scrubbing metal: dense high scratching, a metallic sheen, a slight back-and-forth swell */
  | 'brush_wire'
  /** a wet sponge scrubbed over a panel: squelches, foam crackling, a wet squeak now and then (richer than `sponge`) */
  | 'sponge_scrub'
  /** a spray can held open: a steady pressurised hiss, the paint fizzing (the older `spray` is kept as it was) */
  | 'spray_hiss'
  /** driving on a flat tyre: the rubber thwacking the road and the arch, a rumble (rate from the wheel's speed, 0.25-3.5) */
  | 'flat_flap'
  /** a bare rim on the road: steel grinding on asphalt, sparks, the bent rim knocking (rate from the wheel's speed, 0.25-3.5) */
  | 'rim_grind'
  /** something rare lying near: a very faint high shimmer (gain from how near it is) */
  | 'rare_glint'
  /** hands going through a container while E is held (by `material`); rate 1 a calm search */
  | 'rummage'
  /** an old pump running: its motor humming in the dispenser, the meter whirring, fuel rushing through the hose (gain with the flow, rate 0.8-1.2) */
  | 'pump_run'
  // tyres on the road, by the surface under them: each driven every frame for the surfaces the wheels are on. Rolling: gain
  // from the speed, rate from it too (1 about 50 km/h; 0.1-3, a crawl to 150 km/h, the sound brighter and busier as it goes
  // faster, part of the way: RATE_SPAN). Sliding: gain from how hard the tyres slide, rate from how fast (0.5-2)
  /** rolling on dry asphalt: a smooth, broadband tyre roar round 850 Hz with the tread's faint whine in it, the drone through the body under it; the steady bed under everything */
  | 'roll_asphalt'
  /** rolling on wet asphalt (mixed over roll_asphalt by how wet the road is): the water's hiss off the tread, the spray sizzling, droplets drumming in the arch, the water swishing under it */
  | 'roll_wet'
  /** rolling on loose gravel: stones crunching and popping under the tread, pebbles flicked into the arch ticking now and then; clearly granular */
  | 'roll_gravel'
  /** rolling on packed dirt: a soft low rumble with grit in it, a small stone now and then */
  | 'roll_dirt'
  /** rolling on grass: the soft swish of the blades, tuft after tuft, over a low thrum of the turf; quieter than gravel */
  | 'roll_grass'
  /** rolling in sand: a heavy, dull, soft rumble, the grains hissing off the tread, sand pattering in the arches in flurries */
  | 'roll_sand'
  /** rolling on packed snow: dense crunching and the squeak cold snow gives as it packs */
  | 'roll_snow'
  /** rolling on ice: very quiet: a thin hum, a faint crackle now and then, once in a while the ice's ringing "pew" somewhere off */
  | 'roll_ice'
  /** sliding on dry asphalt: the tyre's squeal (a wavering tone near 1 kHz, its pitch wandering a little, a second tyre beating with it) over the rubber's rough scrub */
  | 'skid_asphalt'
  /** sliding on gravel: a harsh crunching rush, stones sprayed against the arches and the sills in barrages */
  | 'skid_gravel'
  /** sliding on packed dirt: a gritty scrub, the crust crumbling, dirt spattering on the arch */
  | 'skid_dirt'
  /** sliding on grass: the turf ripping, a wet swish of the blades, the earth squelching, clods thrown */
  | 'skid_grass'
  /** sliding in sand: a soft hissing slide, the sand pushed aside in a whoosh and sprayed pattering on the arches */
  | 'skid_sand'
  /** sliding on packed snow: squeaks in quick runs over a crunching slide, the snow sprayed off hissing */
  | 'skid_snow'
  /** sliding on ice: a hissing scrape, frost crackling off, almost no squeal */
  | 'skid_ice';

/** door / panel materials: door_stock, door_rusty, door_armor, door_cage, door_fridge */
export type PanelMaterial = 'metal' | 'rusty' | 'armor' | 'cage' | 'fridge';
export type Liquid = 'fuel' | 'water' | 'oil';
/** what a thing is mostly made of, for the recycler's shred and the bench's hammer */
export type GrindMaterial = 'metal' | 'plastic' | 'organic' | 'cloth' | 'wood';
/** what a scraper blade bites into as a stroke begins (scrape_start) */
export type ScrapeSurface = 'glass' | 'metal' | 'rust' | 'mud';
/** what a container searched by hand is (rummage, container_open, container_empty): a cupboard, a wardrobe or a desk's drawers (wood), a crate, a toolbox, a filing cabinet, a garage shelf or a drum (metal), clothes or a bag (cloth), a shop's shelf of packets and tins (card) */
export type ContainerMaterial = 'wood' | 'crate' | 'metal' | 'cloth' | 'card';

export interface FoleyOpts {
  /** a door's or a panel's (door_*, hood, trunk; default metal), or a container's (rummage, container_open, container_empty; default wood) */
  material?: PanelMaterial | ContainerMaterial;
  /** kg, for parts picked up / set down / installed */
  mass?: number;
  liquid?: Liquid;
  /** shred: what is ground up; hammer_hit: the work on the anvil (default metal) */
  grind?: GrindMaterial;
  /** scrape_start: what the blade bites into (default metal) */
  surface?: ScrapeSurface;
  /** loot_reveal: how good the find is, 1-5 (default 3; 1-2 a small sting, 4-5 a fuller, golden one) */
  tier?: number;
  /** linear gain on top of the sound's own level */
  gain?: number;
  /** loops: playback rate (about 0.6..1.8, kept to 0.5..2; default 1), glided to like the gain on every start(): a scrub follows its stroke's speed with it (the glass scrape half way, see loopPlaybackRate); a rolling tyre's 0.1..3 (rate 1 about 50 km/h, see RATE_RANGE) */
  rate?: number;
  /**
   * loops: a low-pass on this loop alone (Hz: the tyres heard from inside a closed cabin, say), glided
   * to like the gain and the rate on every start(). Not given, a loop plays as it always has, through
   * no filter (and one given a cutoff before opens its low-pass right up). Kept to 10 Hz .. the Nyquist
   * frequency; a Butterworth slope, 3 dB down at the cutoff and 12 dB an octave past it.
   */
  cutoff?: number;
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

// ------------------------------------------------------------------ the workshop

/**
 * Noise (or anything) through a band-pass whose centre moves: a Chamberlin state-variable filter
 * retuned every sample, for whirrs and whooshes. f(t) in Hz (kept under sr / 7, where it is stable).
 */
function sweptBand(x: Float32Array, sr: number, f: (t: number) => number, q: number): Float32Array {
  const out = new Float32Array(x.length);
  const damp = 1 / Math.max(0.5, q);
  let lp = 0;
  let bp = 0;
  for (let i = 0; i < x.length; i++) {
    const k = 2 * Math.sin((Math.PI * Math.min(sr / 7, Math.max(20, f(i / sr)))) / sr);
    const hp = x[i] - lp - damp * bp;
    bp += k * hp;
    lp += k * bp;
    out[i] = bp;
  }
  return out;
}

/** n samples of filtered noise that wrap cleanly: filtered over three copies, the middle kept */
function loopNoise(n: number, sr: number, rng: Rng, filters: Array<[BiquadKind, number, number?]>): Float32Array {
  const one = noise(n, rng);
  const y = new Float32Array(3 * n);
  for (let k = 0; k < 3; k++) y.set(one, k * n);
  for (const [kind, f, q] of filters) biquad(y, sr, kind, f, q ?? 0.707);
  return y.slice(n, 2 * n);
}

/** the nearest frequency that fits a whole number of cycles into n samples (seamless loops) */
function snapHz(f: number, n: number, sr: number): number {
  return (Math.max(1, Math.round((f * n) / sr)) * sr) / n;
}

/** a steady partial of frequency f added into x[0, n) (snapped by the caller for loops) */
function toneInto(x: Float32Array, sr: number, f: number, amp: number, rng: Rng, n = x.length, am?: (i: number) => number): void {
  const w = (2 * Math.PI * f) / sr;
  const ph = rng.range(0, 6.283);
  for (let i = 0; i < n; i++) x[i] += amp * Math.sin(w * i + ph) * (am ? am(i) : 1);
}

/**
 * The 50 Hz family: mains hum, mostly at twice the line frequency and its overtones, a little at
 * 50 Hz itself, under an envelope (seconds from `at`) and an optional pitch factor (motors slowing).
 */
function humInto(x: Float32Array, sr: number, at: number, len: number, env: (t: number) => number, rng: Rng, pitch?: (t: number) => number): void {
  const a = Math.floor(at * sr);
  const n = Math.min(x.length - a, Math.floor(len * sr));
  for (const [f, g] of [[50, 0.14], [100, 1], [200, 0.5], [300, 0.34], [400, 0.17], [500, 0.08], [600, 0.08], [800, 0.04]] as const) {
    let ph = rng.range(0, 6.283);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      ph += (2 * Math.PI * f * (pitch ? pitch(t) : 1)) / sr;
      x[a + i] += g * Math.sin(ph) * env(t);
    }
  }
}

/** a buzz: 100 Hz rich in overtones (a fluorescent tube striking, a ballast), under an envelope */
function buzzInto(x: Float32Array, sr: number, at: number, len: number, amp: number, rng: Rng): void {
  const a = Math.floor(at * sr);
  const n = Math.min(x.length - a, Math.floor(len * sr));
  for (let h = 1; h <= 16; h++) {
    const w = (2 * Math.PI * 100 * h) / sr;
    const g = amp / Math.pow(h, 0.85);
    const ph = rng.range(0, 6.283);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      x[a + i] += g * Math.sin(w * i + ph) * Math.sin(Math.PI * t) * (0.6 + 0.4 * Math.sin(37 * t));
    }
  }
}

/** a pitch-dropping blip: a bubble or a wet squelch */
function plipInto(x: Float32Array, sr: number, at: number, f0: number, amp: number, decay: number, drop: number): void {
  const a = Math.floor(at * sr);
  const n = Math.min(x.length - a, Math.floor(decay * 6 * sr));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (2 * Math.PI * f0 * (1 - drop * Math.min(1, t / (decay * 3)))) / sr;
    x[a + i] += amp * Math.sin(ph) * Math.exp(-t / decay) * Math.min(1, t / 0.0015);
  }
}

/** the inharmonic modes of a struck steel lump around f0 */
function metalModes(f0: number, decay: number): Array<[number, number, number]> {
  return [[f0, 1, decay], [f0 * 1.58, 0.7, decay * 0.75], [f0 * 2.33, 0.5, decay * 0.55], [f0 * 3.17, 0.35, decay * 0.4], [f0 * 4.1, 0.2, decay * 0.3]];
}

/** a recoil starter pulled hard: the rope zipping out through its guide, checked by each compression, then wound back in */
function cordPull(): Recipe {
  return (sr, rng) => {
    const pull = rng.range(0.43, 0.48);
    const x = S(sr, 0.92);
    // the rope's speed (0..1): snatched up in a few hundredths, checked hard at each compression
    const knocks = [0.075 + rng.range(-0.01, 0.01), 0.205 + rng.range(-0.015, 0.015), 0.34 + rng.range(-0.02, 0.02)];
    const speed = (t: number): number => {
      if (t < 0 || t > pull + 0.04) return 0;
      let v = Math.min(1, t / 0.05) * (t > pull ? Math.max(0, 1 - (t - pull) / 0.04) : 1);
      for (const k of knocks) {
        const d = t - k - 0.004;
        v *= 1 - 0.55 * Math.exp(-(d * d) / (2 * 0.017 * 0.017));
      }
      return v;
    };
    // the zip: the braid over the guide, a whirr rising with the speed and fluttering with the weave
    const n = Math.floor((pull + 0.05) * sr);
    const zip = sweptBand(noise(n, rng), sr, (t) => 400 + 1900 * speed(t), 2.6);
    biquad(zip, sr, 'lowpass', 3000, 0.7);
    biquad(zip, sr, 'highpass', 150, 0.7);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const v = speed(i / sr);
      ph += (90 + 260 * v) / sr;
      zip[i] *= Math.pow(v, 1.3) * (0.6 + 0.4 * Math.abs(Math.sin(Math.PI * ph)));
    }
    mixInto(x, zip, 0, 0.9);
    // air off the spinning cup
    const air = noise(n, rng);
    biquad(air, sr, 'bandpass', 4000, 0.7);
    for (let i = 0; i < n; i++) air[i] *= Math.pow(speed(i / sr), 2) * 0.06;
    mixInto(x, air, 0, 1);
    // the pawls catch the starter cup
    strike(x, sr, 0, [[rng.range(2600, 3000), 1, 0.006], [rng.range(4300, 4900), 0.5, 0.004]], 0.35, rng);
    burst(x, sr, 0, 0.003, 0.3, rng, { attack: 0.0001, decay: 0.0006, filter: [['highpass', 2000]] });
    // each compression: a dull knock back up the rope and through the crankcase
    knocks.forEach((k, j) => {
      const a = 0.8 - 0.15 * j;
      thudInto(x, sr, k, rng, a, 120, 0.018);
      strike(x, sr, Math.floor(k * sr), [[rng.range(260, 320), 1, 0.03], [rng.range(520, 640), 0.5, 0.02], [rng.range(1100, 1400), 0.2, 0.01]], 0.35 * a, rng);
    });
    // let go: the spring winds it back in, the cup spinning down, its pawls rattling
    const r0 = pull + 0.02;
    const rl = 0.3;
    const rn = Math.floor(rl * sr);
    const back = sweptBand(noise(rn, rng), sr, (t) => 1700 - 3000 * t, 2.5);
    for (let i = 0; i < rn; i++) {
      const t = i / sr;
      back[i] *= Math.min(1, t / 0.02) * Math.max(0, 1 - t / rl) * 0.45;
    }
    mixInto(x, back, Math.floor(r0 * sr), 1);
    let gap = 0.014;
    for (let t = r0 + 0.01; t < r0 + rl - 0.02; t += gap * rng.range(0.8, 1.2)) {
      strike(x, sr, Math.floor(t * sr), [[rng.range(3200, 4200), 1, 0.003], [rng.range(5500, 6800), 0.5, 0.002]], 0.18 * rng.range(0.5, 1), rng);
      gap *= 1.09;
    }
    // the plastic handle knocks home against the guide
    const home = r0 + rl + 0.005;
    burst(x, sr, Math.floor(home * sr), 0.003, 0.35, rng, { attack: 0.0001, decay: 0.0006, filter: [['bandpass', 2200, 1]] });
    strike(x, sr, Math.floor(home * sr), [[rng.range(650, 800), 1, 0.008], [rng.range(1300, 1550), 0.5, 0.005], [rng.range(2300, 2700), 0.25, 0.003]], 0.4, rng);
    thudInto(x, sr, home, rng, 0.35, 260, 0.008);
    return normalize(saturate(edges(x, sr, 1, 20), 1.3), 0.8);
  };
}

/** a heavy toggle on a steel panel: the lever over its spring, slammed on its stop, the panel ringing a moment */
function genSwitch(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.3);
    burst(x, sr, 0, 0.003, 0.6, rng, { attack: 0.0001, decay: 0.0005, filter: [['highpass', 2200], ['peaking', 4500, 2]] });
    strike(x, sr, 0, [[rng.range(3300, 3700), 1, 0.005], [rng.range(5200, 5800), 0.5, 0.003]], 0.35, rng);
    const b = Math.floor(rng.range(0.006, 0.01) * sr);
    burst(x, sr, b, 0.005, 0.9, rng, { attack: 0.0001, decay: 0.0012, filter: [['highpass', 700], ['peaking', 2400, 1.5]] });
    strike(x, sr, b, [[rng.range(1150, 1300), 1, 0.018], [rng.range(1850, 2050), 0.7, 0.012], [rng.range(2900, 3200), 0.4, 0.007]], 0.6, rng);
    thudInto(x, sr, b / sr, rng, 0.5, 190, 0.012);
    strike(x, sr, b, panelModes(0.42, 2.2), 0.12, rng);
    return normalize(saturate(edges(x, sr, 1, 20), 1.4), 0.75);
  };
}

/** running dry: the last starved firings, each weaker and later, then a last wheeze of air through it */
function genCough(): Recipe {
  return (sr, rng) => {
    const count = 3 + Math.floor(rng.next() * 3);
    const times: number[] = [];
    for (let k = 0, t = 0; k < count; k++) {
      times.push(t);
      t += rng.range(0.12, 0.19) * (1 + 0.45 * k);
    }
    const w0 = times[count - 1] + rng.range(0.12, 0.16);
    const wl = 0.42;
    const x = S(sr, w0 + wl + 0.05);
    let a = 1;
    for (const t of times) {
      const at = Math.floor(t * sr);
      // the puff out of the muffler, the weak firing's crack and the injector's knock, the suck back
      burst(x, sr, at, 0.12, a, rng, { attack: 0.002, decay: 0.03, filter: [['lowpass', 700], ['peaking', 260, 1.2]] });
      burst(x, sr, at, 0.012, 0.45 * a, rng, { attack: 0.0003, decay: 0.003, filter: [['bandpass', 1500, 0.9]] });
      strike(x, sr, at, [[rng.range(1300, 1600), 1, 0.006], [rng.range(2300, 2700), 0.6, 0.004]], 0.25 * a, rng);
      thudInto(x, sr, t, rng, 0.45 * a, 90, 0.02);
      burst(x, sr, at + Math.floor(0.07 * sr), 0.07, 0.12 * a, rng, { attack: 0.02, decay: 0.02, filter: [['bandpass', 900, 1.5]] });
      a *= rng.range(0.62, 0.78);
    }
    // the last wheeze: air pumped through with no fuel, falling as it slows
    const wn = Math.floor(wl * sr);
    const wz = sweptBand(noise(wn, rng), sr, (t) => 1050 - 1500 * t, 3);
    biquad(wz, sr, 'lowpass', 2200, 0.7);
    for (let i = 0; i < wn; i++) wz[i] *= Math.pow(Math.sin((Math.PI * i) / wn), 1.5) * 0.6;
    mixInto(x, wz, Math.floor(w0 * sr), 1);
    return normalize(saturate(edges(x, sr, 1, 30), 1.6), 0.8);
  };
}

/** one thing between the recycler's rotors: it drops on the knives, is bitten into faster and faster, thins out; by what it is made of */
function shred(m: GrindMaterial): Recipe {
  return (sr, rng) => {
    const len = 1.35;
    const x = S(sr, len);
    const at = (t: number): number => Math.floor(t * sr);
    // how busy the knives are with it
    const dens = (t: number): number => Math.min(1, t / 0.08) * Math.exp(-Math.max(0, t - 0.55) / 0.3);
    // events at a mean rate per second, thinned by the density
    const events = (rate: number, fn: (t: number, d: number) => void): void => {
      for (let t = 0.01 - Math.log(1 - rng.next()) / rate; t < len - 0.06; t -= Math.log(1 - rng.next()) / rate) {
        const d = dens(t);
        if (rng.next() < d) fn(t, d);
      }
    };
    // the rotors labouring under it: a low rumble with the bites
    const body = noise(x.length, rng);
    biquad(body, sr, 'lowpass', m === 'cloth' ? 260 : 420, 0.7);
    biquad(body, sr, 'highpass', 60, 0.7);
    for (let i = 0; i < body.length; i++) body[i] *= dens(i / sr) * (0.7 + 0.3 * Math.sin((2 * Math.PI * 8.5 * i) / sr));
    mixInto(x, body, 0, m === 'organic' ? 0.5 : 0.35);
    thudInto(x, sr, 0, rng, m === 'metal' ? 0.6 : m === 'cloth' ? 0.35 : 0.5, m === 'metal' ? 140 : 110, 0.02);
    // bits flung off the rotors against the housing
    const pings = (count: number, band: [number, number], decay: number, amp: number): void => {
      for (let k = 0; k < count; k++) strike(x, sr, at(rng.range(0.2, len - 0.15)), [[rng.range(band[0], band[1]), 1, decay], [rng.range(band[0], band[1]) * 1.48, 0.4, decay * 0.6]], amp * rng.range(0.5, 1), rng);
    };
    if (m === 'metal') {
      // dense steel crunch, clanks, a screech of torn sheet, bits pinging
      events(90, (t, d) => burst(x, sr, at(t), rng.range(0.004, 0.02), 0.5 * d * rng.range(0.4, 1), rng, { attack: 0.0003, decay: 0.003, filter: [['bandpass', rng.range(1500, 5000), 1.5]] }));
      events(14, (t, d) => strike(x, sr, at(t), metalModes(rng.range(500, 1500), rng.range(0.025, 0.05)), 0.55 * d * rng.range(0.5, 1), rng, 0.03));
      const squeals = 1 + Math.floor(rng.next() * 2);
      for (let k = 0; k < squeals; k++) {
        const s0 = rng.range(0.15, 0.6);
        const sl = rng.range(0.18, 0.4);
        const n = Math.floor(sl * sr);
        const f0 = rng.range(2200, 3600);
        let ph = 0;
        let drift = 0;
        for (let i = 0; i < n && at(s0) + i < x.length; i++) {
          const t = i / n;
          drift += (rng.next() - 0.5) * 0.004 - drift * 0.002;
          ph += (f0 * (1 + drift + 0.04 * t)) / sr;
          // stick-slip: the squeal catches and lets go
          const grip = 0.55 + 0.45 * Math.sin(2 * Math.PI * 23 * t + 3 * Math.sin(2 * Math.PI * 7 * t));
          x[at(s0) + i] += 0.16 * Math.sin(2 * Math.PI * ph) * grip * Math.sin(Math.PI * t) * dens(s0 + t * sl);
        }
      }
      pings(5, [4500, 7500], 0.02, 0.2);
    } else if (m === 'plastic') {
      // sharp cracks, hollow knocks of the casing, a dry crunch, a few chips ticking
      events(70, (t, d) => burst(x, sr, at(t), rng.range(0.002, 0.006), 0.7 * d * rng.range(0.4, 1), rng, { attack: 0.0001, decay: 0.0012, filter: [['highpass', 1800], ['peaking', rng.range(3000, 6000), 2]] }));
      events(16, (t, d) => {
        const f0 = rng.range(700, 1400);
        strike(x, sr, at(t), [[f0, 1, 0.012], [f0 * 1.72, 0.6, 0.008], [f0 * 2.6, 0.3, 0.005]], 0.4 * d, rng, 0.04);
      });
      events(60, (t, d) => burst(x, sr, at(t), rng.range(0.005, 0.015), 0.3 * d, rng, { attack: 0.0005, decay: 0.004, filter: [['bandpass', rng.range(1000, 3000), 1.3]] }));
      pings(4, [2500, 4000], 0.005, 0.15);
    } else if (m === 'organic') {
      // a wet crunch: low dull crunches, squelches, slaps of the mush
      events(80, (t, d) => burst(x, sr, at(t), rng.range(0.006, 0.025), 0.55 * d * rng.range(0.4, 1), rng, { attack: 0.0008, decay: 0.006, filter: [['bandpass', rng.range(250, 1100), 1.2], ['lowpass', 2500]] }));
      events(34, (t, d) => plipInto(x, sr, t, rng.range(350, 900), 0.35 * d * rng.range(0.5, 1), rng.range(0.008, 0.018), 0.5));
      events(14, (t, d) => burst(x, sr, at(t), 0.03, 0.4 * d, rng, { attack: 0.001, decay: 0.008, filter: [['lowpass', 450], ['lowpass', 600]] }));
    } else if (m === 'cloth') {
      // tearing: rips of fibres parting one after another (gaps between), soft bundles thumping, a little swish
      const tears = 3 + Math.floor(rng.next() * 2);
      for (let k = 0, t0 = rng.range(0.03, 0.08); k < tears && t0 < len - 0.3; k++) {
        const tl = rng.range(0.1, 0.28);
        const rate = rng.range(160, 320);
        const g = rng.range(0.6, 1);
        for (let t = t0; t < t0 + tl; t += (1 / rate) * rng.range(0.4, 1.6)) {
          const u = (t - t0) / tl;
          // a rip starts hard and frays out
          burst(x, sr, at(t), 0.0015, 0.5 * g * Math.pow(1 - u, 0.6) * Math.min(1, u * 12) * rng.range(0.2, 1), rng, { attack: 0.0001, decay: 0.0005, filter: [['bandpass', rng.range(1500, 5000), 1.1]] });
        }
        t0 += tl + rng.range(0.06, 0.16);
      }
      events(10, (t, d) => burst(x, sr, at(t), 0.04, 0.35 * d, rng, { attack: 0.004, decay: 0.012, filter: [['lowpass', 220]] }));
      const sw = noise(x.length, rng);
      biquad(sw, sr, 'bandpass', 900, 0.8);
      for (let i = 0; i < sw.length; i++) sw[i] *= dens(i / sr) * 0.06;
      mixInto(x, sw, 0, 1);
    } else {
      // wood: big snaps with the woody body of the piece, fibrous crunching, splinters ticking
      events(10, (t, d) => {
        burst(x, sr, at(t), rng.range(0.004, 0.01), 0.9 * d, rng, { attack: 0.0001, decay: 0.0015, filter: [['highpass', 900]] });
        const f0 = rng.range(300, 800);
        strike(x, sr, at(t), [[f0, 1, 0.02], [f0 * 2.1, 0.6, 0.012], [f0 * 3.4, 0.3, 0.007]], 0.45 * d, rng, 0.05);
      });
      events(70, (t, d) => burst(x, sr, at(t), rng.range(0.004, 0.015), 0.35 * d * rng.range(0.4, 1), rng, { attack: 0.0004, decay: 0.003, filter: [['bandpass', rng.range(700, 2500), 1.2]] }));
      pings(6, [2500, 5000], 0.004, 0.12);
    }
    return normalize(saturate(edges(x, sr, 1, 40), m === 'organic' || m === 'cloth' ? 1.15 : 1.5), 0.85);
  };
}

/** the counter's number drum flipping over: a tiny detent tick, the drum settling */
function tally(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.07);
    strike(x, sr, 0, [[rng.range(4300, 5000), 1, 0.0025], [rng.range(7000, 7800), 0.5, 0.0016]], 0.5, rng);
    burst(x, sr, 0, 0.0015, 0.3, rng, { attack: 0.0001, decay: 0.0003, filter: [['highpass', 3500]] });
    const b = Math.floor(rng.range(0.009, 0.015) * sr);
    strike(x, sr, b, [[rng.range(2600, 3100), 1, 0.004], [rng.range(4200, 4700), 0.4, 0.0025]], 0.3, rng);
    return normalize(edges(x, sr, 0.5, 10), 0.4);
  };
}

/** tools picked up and laid out on the bench: steel clinking on wood, a scrape, the rest shifting in their tray */
function craftStart(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.8);
    const count = 4 + Math.floor(rng.next() * 2);
    let t = 0.01;
    for (let k = 0; k < count; k++) {
      const a = Math.floor(t * sr);
      const f0 = rng.range(1400, 3200);
      strike(x, sr, a, [[f0, 1, rng.range(0.015, 0.04)], [f0 * 1.51, 0.6, 0.012], [f0 * 2.23, 0.35, 0.008]], rng.range(0.35, 0.6), rng, 0.03);
      thudInto(x, sr, t, rng, rng.range(0.2, 0.35), rng.range(220, 320), 0.008);
      burst(x, sr, a, 0.002, 0.25, rng, { attack: 0.0001, decay: 0.0005, filter: [['highpass', 1800]] });
      if (rng.next() < 0.6) burst(x, sr, a + Math.floor(0.01 * sr), rng.range(0.04, 0.08), 0.08, rng, { attack: 0.01, decay: 0.02, filter: [['bandpass', rng.range(2500, 4000), 1.5]] });
      t += rng.range(0.1, 0.17);
    }
    meshInto(x, sr, 0.02, rng, 0.12, 10, t);
    return normalize(edges(x, sr, 1, 30), 0.55);
  };
}

/** the hammer swung down: air past its head, rising as it comes round, gone at the strike */
function hammerSwing(): Recipe {
  return (sr, rng) => {
    const len = 0.3;
    const n = Math.floor(len * sr);
    const peak = rng.range(0.17, 0.21);
    const env = (t: number): number => Math.exp(-((t - peak) * (t - peak)) / (2 * 0.055 * 0.055));
    const w = sweptBand(noise(n, rng), sr, (t) => 260 + 700 * env(t) * (t < peak ? 1 : 0.8), 1.3);
    biquad(w, sr, 'lowpass', 1400, 0.7);
    biquad(w, sr, 'lowpass', 1800, 0.7);
    biquad(w, sr, 'highpass', 120, 0.7);
    for (let i = 0; i < n; i++) w[i] *= Math.pow(env(i / sr), 1.5);
    const x = S(sr, len + 0.02);
    mixInto(x, w, 0, 1);
    return normalize(edges(x, sr, 2, 20), 0.5);
  };
}

/** the hammer on the work on the anvil plate: metal rings out, plastic knocks dull, wood thocks, the soft stuff thumps */
function hammerHit(m: GrindMaterial): Recipe {
  return (sr, rng) => {
    if (m === 'metal') {
      const x = S(sr, 1.2);
      // the face meets the work: a hard click, then the plate's far-from-harmonic partials and the work's own
      burst(x, sr, 0, 0.002, 0.9, rng, { attack: 0.0001, decay: 0.0004, filter: [['highpass', 2500]] });
      const f0 = rng.range(980, 1100);
      strike(x, sr, 0, [[f0, 1, 0.42], [f0 * 2.27, 0.55, 0.26], [f0 * 3.49, 0.4, 0.16], [f0 * 4.78, 0.25, 0.1], [f0 * 6.12, 0.15, 0.06]], 0.6, rng, 0.01);
      strike(x, sr, 0, [[rng.range(2500, 3300), 1, 0.05], [rng.range(4200, 5200), 0.5, 0.03]], 0.3, rng);
      thudInto(x, sr, 0, rng, 0.35, 160, 0.008);
      // (it rings a second: its peak sits lower than the short knocks', so it is not that much louder)
      return normalize(saturate(edges(x, sr, 0.5, 80), 1.3), 0.36);
    }
    if (m === 'plastic') {
      const x = S(sr, 0.3);
      burst(x, sr, 0, 0.003, 0.5, rng, { attack: 0.0001, decay: 0.0008, filter: [['bandpass', 2200, 1]] });
      const f0 = rng.range(600, 900);
      strike(x, sr, 0, [[f0, 1, 0.016], [f0 * 1.7, 0.6, 0.01], [f0 * 2.6, 0.3, 0.006]], 0.5, rng, 0.04);
      thudInto(x, sr, 0, rng, 0.7, 240, 0.012);
      return normalize(saturate(edges(x, sr, 0.5, 30), 1.3), 0.8);
    }
    if (m === 'wood') {
      const x = S(sr, 0.4);
      burst(x, sr, 0, 0.003, 0.6, rng, { attack: 0.0001, decay: 0.0006, filter: [['highpass', 1500]] });
      const f0 = rng.range(380, 520);
      strike(x, sr, 0, [[f0, 1, 0.026], [f0 * 1.93, 0.55, 0.015], [f0 * 2.81, 0.35, 0.01], [f0 * 4.3, 0.15, 0.006]], 0.6, rng, 0.03);
      thudInto(x, sr, 0, rng, 0.45, 180, 0.012);
      return normalize(saturate(edges(x, sr, 0.5, 30), 1.2), 0.8);
    }
    // organic, cloth: a soft padded thump on the plate
    const x = S(sr, 0.25);
    burst(x, sr, 0, 0.08, 1, rng, { attack: 0.002, decay: 0.018, filter: [['lowpass', m === 'cloth' ? 180 : 240], ['lowpass', m === 'cloth' ? 240 : 320]] });
    ring(x, sr, 0, m === 'cloth' ? 95 : 130, 0.35, 0.014);
    burst(x, sr, 0, 0.03, 0.3, rng, { attack: 0.002, decay: 0.008, filter: [['bandpass', m === 'cloth' ? 700 : 1100, 1]] });
    if (m === 'organic') plipInto(x, sr, 0.004, rng.range(600, 900), 0.25, 0.012, 0.4);
    return normalize(edges(x, sr, 0.5, 30), 0.75);
  };
}

/** the new thing done: a small bell struck once (two partials, each a slowly beating pair) and a little sparkle over it */
function craftDone(): Recipe {
  return (sr, rng) => {
    const len = 0.85;
    const x = S(sr, len);
    const partial = (f: number, amp: number, decay: number, beat: number): void => {
      const p1 = rng.range(0, 6.283);
      const p2 = rng.range(0, 6.283);
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        const e = amp * Math.exp(-t / decay) * Math.min(1, t / 0.0015);
        x[i] += e * (0.62 * Math.sin(2 * Math.PI * f * t + p1) + 0.38 * Math.sin(2 * Math.PI * (f + beat) * t + p2));
      }
    };
    const f1 = 1318.5;
    partial(f1, 1, 0.32, 3.1);
    partial(f1 * 1.5, 0.7, 0.2, 4.4);
    partial(f1 * 4.2, 0.1, 0.05, 7);
    burst(x, sr, 0, 0.002, 0.15, rng, { attack: 0.0001, decay: 0.0004, filter: [['highpass', 4000]] });
    for (let k = 0; k < 6; k++) ring(x, sr, Math.floor(rng.range(0.02, 0.32) * sr), rng.range(5200, 8200), rng.range(0.02, 0.05), rng.range(0.015, 0.035));
    for (let i = Math.floor(0.6 * sr); i < x.length; i++) x[i] *= Math.max(0, 1 - (i / sr - 0.6) / 0.25);
    return normalize(edges(x, sr, 0.5, 20), 0.7);
  };
}

/** the power coming on: the contactor pulls in, the hum rises with the load, the motors spin up, the tubes tick and strike */
function powerOn(): Recipe {
  return (sr, rng) => {
    const len = 1.25;
    const x = S(sr, len);
    thudInto(x, sr, 0, rng, 0.8, 150, 0.02);
    strike(x, sr, 0, [[rng.range(1050, 1200), 1, 0.02], [rng.range(1700, 1900), 0.6, 0.014], [rng.range(2800, 3200), 0.3, 0.007]], 0.5, rng);
    burst(x, sr, 0, 0.004, 0.5, rng, { attack: 0.0001, decay: 0.0008, filter: [['highpass', 1200]] });
    // (it hands over to the loops at the end: lamp_buzz, recycler_run)
    const tail = (t: number): number => (t > 1.0 ? Math.max(0, 1 - (t - 1.0) / 0.22) : 1);
    humInto(x, sr, 0.02, len - 0.02, (t) => 0.3 * (1 - Math.exp(-t / 0.25)) * tail(t), rng);
    const wn = Math.floor((len - 0.05) * sr);
    const whir = new Float32Array(wn);
    let ph = 0;
    for (let i = 0; i < wn; i++) {
      const t = i / sr;
      ph += (2 * Math.PI * (180 + 520 * (1 - Math.exp(-t / 0.35)))) / sr;
      whir[i] = Math.sin(ph) * 0.05 * Math.min(1, t / 0.3) * tail(t + 0.05);
    }
    mixInto(x, whir, Math.floor(0.05 * sr), 1);
    for (const tk of [rng.range(0.25, 0.35), rng.range(0.45, 0.6), rng.range(0.65, 0.8), rng.range(0.85, 0.95)]) {
      strike(x, sr, Math.floor(tk * sr), [[rng.range(3800, 4600), 1, 0.003], [rng.range(6000, 7000), 0.5, 0.002]], 0.3, rng);
      buzzInto(x, sr, tk + 0.01, rng.range(0.04, 0.09), 0.08, rng);
    }
    return normalize(saturate(edges(x, sr, 1, 30), 1.2), 0.8);
  };
}

/** the power going off: the contactor drops out with a click, the hum dies away, the motors wind down */
function powerOff(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.9);
    strike(x, sr, 0, [[rng.range(1500, 1800), 1, 0.012], [rng.range(2600, 3000), 0.5, 0.007]], 0.5, rng);
    burst(x, sr, 0, 0.003, 0.45, rng, { attack: 0.0001, decay: 0.0006, filter: [['highpass', 1500]] });
    thudInto(x, sr, 0.004, rng, 0.35, 220, 0.01);
    humInto(x, sr, 0.003, 0.85, (t) => 0.3 * Math.exp(-t / 0.12), rng, (t) => 1 - 0.05 * Math.min(1, t / 0.5));
    const wn = Math.floor(0.8 * sr);
    const whir = new Float32Array(wn);
    let ph = 0;
    for (let i = 0; i < wn; i++) {
      const t = i / sr;
      ph += (2 * Math.PI * (700 * Math.exp(-t / 0.35) + 60)) / sr;
      whir[i] = Math.sin(ph) * 0.05 * Math.exp(-t / 0.22);
    }
    mixInto(x, whir, Math.floor(0.01 * sr), 1);
    return normalize(edges(x, sr, 1, 30), 0.65);
  };
}

/** a switch thrown on a dead circuit: a muffled click and nothing */
function noPower(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.14);
    burst(x, sr, 0, 0.003, 0.5, rng, { attack: 0.0001, decay: 0.0007, filter: [['bandpass', 1400, 1.2], ['lowpass', 2600]] });
    const b = Math.floor(rng.range(0.006, 0.01) * sr);
    thudInto(x, sr, b / sr, rng, 0.6, 260, 0.008);
    strike(x, sr, b, [[rng.range(700, 820), 1, 0.012], [rng.range(1150, 1300), 0.5, 0.008]], 0.3, rng);
    return normalize(edges(x, sr, 0.5, 10), 0.45);
  };
}

/**
 * The recycler running empty: its induction motor (mains hum, the rotor at 48.5 Hz), the gearbox
 * (19 teeth on the motor, 23 on the slower shaft at a third of its speed), the rotors turning
 * twice a second with their knives swishing past the comb and loose bits rattling. Seamless.
 */
/** take the mean out of a loop (it stays seamless) */
function centre(x: Float32Array): Float32Array {
  let m = 0;
  for (const v of x) m += v;
  m /= Math.max(1, x.length);
  for (let i = 0; i < x.length; i++) x[i] -= m;
  return x;
}

function recyclerRun(): Recipe {
  return (sr, rng) => {
    const len = 2.0;
    const n = Math.floor(len * sr);
    return normalize(
      centre(cyclic(sr, len, (x) => {
        for (const [f, a] of [[100, 1], [200, 0.45], [300, 0.28], [400, 0.12], [600, 0.06], [48.5, 0.22], [97, 0.1], [1164, 0.035]] as const) toneInto(x, sr, snapHz(f, n, sr), a, rng, n);
        const shaft2 = snapHz(48.5 / 3, n, sr);
        const am = (i: number): number => 0.75 + 0.25 * Math.sin((2 * Math.PI * shaft2 * i) / sr);
        toneInto(x, sr, snapHz(48.5 * 19, n, sr), 0.13, rng, n, am);
        toneInto(x, sr, snapHz(48.5 * 38, n, sr), 0.04, rng, n, am);
        toneInto(x, sr, snapHz((48.5 / 3) * 23, n, sr), 0.08, rng, n);
        // the knives past the comb: 8 a turn, two turns a second
        const sw = loopNoise(n, sr, rng, [['bandpass', 1800, 0.9]]);
        for (let i = 0; i < n; i++) x[i] += 0.18 * sw[i] * Math.pow(0.5 + 0.5 * Math.sin((2 * Math.PI * 16 * i) / n), 3);
        // loose bits rattling in the housing, every half turn much the same
        for (let k = 0; k < 18; k++) strike(x, sr, Math.floor(rng.range(0, len) * sr), [[rng.range(1800, 3800), 1, 0.006], [rng.range(4000, 6000), 0.4, 0.004]], rng.range(0.04, 0.12), rng, 0.05);
      })),
      0.5,
    );
  };
}

/**
 * Something being ground (played over recycler_run, faded with the work): the motor straining (the
 * hum heavier, its odd overtones up, growling at its slip, the gear whine pulled down) under dense
 * crunching, the knives taking a bite every eighth of a second. Seamless.
 */
function recyclerGrind(): Recipe {
  return (sr, rng) => {
    const len = 2.4;
    const n = Math.floor(len * sr);
    const x = cyclic(sr, len, (y) => {
      const gw = (2 * Math.PI * snapHz(7, n, sr)) / sr;
      const growl = (i: number): number => 0.7 + 0.3 * Math.sin(gw * i);
      for (const [f, a] of [[100, 0.8], [150, 0.25], [250, 0.2], [300, 0.35], [500, 0.12], [700, 0.06]] as const) toneInto(y, sr, snapHz(f, n, sr), a, rng, n, growl);
      toneInto(y, sr, snapHz(46.5 * 19, n, sr), 0.1, rng, n, growl);
      // the work: low chunks thumping, a crunch in every bite, cracks and the odd clank
      const bites = Math.round(len * 8);
      for (let k = 0; k < bites; k++) {
        const t0 = (k / bites) * len + rng.range(-0.01, 0.01);
        const g = rng.range(0.5, 1);
        thudInto(y, sr, t0 + len * (t0 < 0 ? 1 : 0), rng, 0.25 * g, rng.range(90, 140), 0.012);
        for (let j = 0; j < 7; j++) {
          const t = t0 + rng.range(0, 0.1);
          burst(y, sr, Math.floor((t < 0 ? t + len : t) * sr), rng.range(0.004, 0.02), 0.45 * g * rng.range(0.3, 1), rng, { attack: 0.0004, decay: 0.004, filter: [['bandpass', rng.range(600, 4500), 1.3]] });
        }
      }
      for (let k = 0; k < 26; k++) burst(y, sr, Math.floor(rng.range(0, len) * sr), rng.range(0.002, 0.006), rng.range(0.3, 0.6), rng, { attack: 0.0001, decay: 0.0012, filter: [['highpass', 1500]] });
      for (let k = 0; k < 4; k++) strike(y, sr, Math.floor(rng.range(0, len) * sr), metalModes(rng.range(600, 1400), 0.03), rng.range(0.15, 0.3), rng, 0.03);
      const rub = loopNoise(n, sr, rng, [['lowpass', 500], ['highpass', 70]]);
      mixInto(y, rub, 0, 0.5);
    });
    return normalize(centre(saturate(x, 1.3)), 0.6);
  };
}

/** the workshop's fluorescent tubes: the ballasts' 100 Hz buzz rich in overtones, a faint sizzle of the arcs. Seamless (a second, whole cycles) */
function lampBuzz(): Recipe {
  return (sr, rng) => {
    const len = 1.0;
    const n = Math.floor(len * sr);
    const x = new Float32Array(n);
    toneInto(x, sr, snapHz(50, n, sr), 0.2, rng, n);
    for (let h = 1; h <= 18; h++) toneInto(x, sr, snapHz(100 * h, n, sr), (h % 2 ? 1 : 0.7) / Math.pow(h, 1.1), rng, n);
    const s = loopNoise(n, sr, rng, [['bandpass', 4500, 1]]);
    for (let i = 0; i < n; i++) x[i] += 0.08 * s[i] * (0.5 + 0.5 * Math.sin((2 * Math.PI * snapHz(100, n, sr) * i) / sr));
    return normalize(x, 0.35);
  };
}

// ------------------------------------------------------------------ scrubbing: dirt, rust and the cleaning tools

/** filters run over a loop as the loop it is (two turns, the second kept: it starts from where the first ended), so it wraps as cleanly after as before */
function loopFilter(x: Float32Array, sr: number, filters: ReadonlyArray<readonly [BiquadKind, number, number?, number?]>): Float32Array {
  const n = x.length;
  const y = new Float32Array(2 * n);
  y.set(x, 0);
  y.set(x, n);
  for (const [kind, f, q, g] of filters) biquad(y, sr, kind, f, q ?? 0.707, g ?? 0);
  return y.slice(n);
}

/** a slow random curve round a loop (u = 0..1 of it): k values between lo and hi eased into one another, the last back into the first */
function wander(rng: Rng, k: number, lo: number, hi: number): (u: number) => number {
  const v = Array.from({ length: k }, () => rng.range(lo, hi));
  return (u) => {
    const p = (u - Math.floor(u)) * k;
    const i = Math.floor(p);
    const f = p - i;
    return v[i % k] + (v[(i + 1) % k] - v[i % k]) * f * f * (3 - 2 * f);
  };
}

/** events at a mean rate (per second) over len seconds, thinned by a density d(t) in 0..1 */
function scatter(rng: Rng, len: number, rate: number, d: (t: number) => number, fn: (t: number, d: number) => void): void {
  for (let t = -Math.log(1 - rng.next()) / rate; t < len; t -= Math.log(1 - rng.next()) / rate) {
    const v = d(t);
    if (rng.next() < v) fn(t, v);
  }
}

/** a size from a power law, lo..1: most specks tiny, the odd big one, as things crack and break */
const powerLaw = (rng: Rng, lo: number, alpha: number): number => Math.min(1, lo * Math.pow(1 - rng.next(), -1 / alpha));

/** a speck of grit: a fraction of a millisecond of raw noise, its colour left to the filters of the bus it goes into */
function grainInto(x: Float32Array, sr: number, at: number, amp: number, decay: number, rng: Rng, attack = 0.0001): void {
  const a = Math.max(0, Math.floor(at * sr));
  const na = Math.max(1, Math.round(attack * sr));
  const n = Math.min(x.length - a, na + Math.ceil(decay * 5 * sr));
  const k = Math.exp(-1 / (decay * sr));
  let e = amp;
  for (let i = 0; i < n; i++) {
    const env = i < na ? (amp * (i + 1)) / na : (e *= k);
    x[a + i] += env * (rng.next() * 2 - 1);
  }
}

/**
 * A stick-slip squeal: an edge catching and slipping on a smooth surface many hundred times a
 * second. A tone near f0 whose every cycle is a little longer or shorter than the last (friction
 * never quite repeats), wavering and drifting, its overtones rolled off by `bright`, the grip
 * catching and letting go, perhaps flipping to another mode part way (`flip`: [when 0..1, ratio]);
 * len seconds from `at`, eased in and out.
 */
function squealInto(x: Float32Array, sr: number, at: number, len: number, f0: number, amp: number, rng: Rng, o: { bright?: number; waver?: number; glide?: number; grip?: number; jitter?: number; flip?: [number, number] } = {}): void {
  const a = Math.max(0, Math.floor(at * sr));
  const n = Math.min(x.length - a, Math.floor(len * sr));
  if (n <= 2) return;
  const b = o.bright ?? 0.6;
  const h1 = 0.5 * b;
  const h2 = 0.28 * b * b;
  const h3 = 0.14 * b * b * b;
  const waver = o.waver ?? 0.03;
  const glide = (o.glide ?? 0.05) * (rng.next() * 2 - 1);
  const grip = o.grip ?? 0.4;
  const jit = o.jitter ?? 0.012;
  const vf = rng.range(4, 8);
  const vp = rng.range(0, 6.283);
  const gf = rng.range(8, 20);
  const gp = rng.range(0, 6.283);
  const ease = Math.max(1, Math.floor(Math.min(0.012, len / 4) * sr));
  let ph = rng.next();
  let cyc = Math.floor(ph);
  let j = 0;
  let drift = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const u = i / n;
    drift += (rng.next() - 0.5) * 0.002 - drift * 0.001;
    const step = o.flip && u >= o.flip[0] ? o.flip[1] : 1;
    ph += (f0 * step * (1 + waver * Math.sin(2 * Math.PI * vf * t + vp) + drift + j) * (1 + glide * u)) / sr;
    if (ph - cyc >= 1) {
      cyc = Math.floor(ph);
      j = rng.gauss() * jit;
    }
    // (the overtones from the one sine and cosine)
    const sp = Math.sin(2 * Math.PI * ph);
    const cp = Math.cos(2 * Math.PI * ph);
    const s2 = 2 * sp * cp;
    const s = sp + h1 * s2 + h2 * sp * (3 - 4 * sp * sp) + h3 * 2 * s2 * (1 - 2 * sp * sp);
    const g = 1 - grip * (0.5 + 0.5 * Math.sin(2 * Math.PI * gf * t + gp + 1.7 * Math.sin(2 * Math.PI * gf * 0.31 * t)));
    const e = Math.min(1, i / ease, (n - 1 - i) / ease) * Math.pow(Math.sin(Math.PI * u), 0.35);
    x[a + i] += amp * s * g * e;
  }
}

/** back and forth: k strokes of a little different lengths round a loop; where each starts, its level, and for a time which one it is in and how far through */
function strokes(rng: Rng, k: number, len: number): { at: (t: number) => { u: number; i: number }; amp: number[]; starts: number[] } {
  const w = Array.from({ length: k }, () => rng.range(0.8, 1.25));
  const tot = w.reduce((a, b) => a + b, 0);
  const starts: number[] = [];
  let acc = 0;
  for (const v of w) {
    starts.push((acc / tot) * len);
    acc += v;
  }
  const amp = w.map(() => rng.range(0.75, 1));
  return {
    amp,
    starts,
    at: (t) => {
      const tt = ((t % len) + len) % len;
      let i = k - 1;
      while (i > 0 && starts[i] > tt) i--;
      const end = i + 1 < k ? starts[i + 1] : len;
      return { u: (tt - starts[i]) / (end - starts[i]), i };
    },
  };
}

const rmsOf = (x: Float32Array): number => {
  let s = 0;
  for (const v of x) s += v * v;
  return Math.sqrt(s / Math.max(1, x.length)) || 1;
};

/** soft-limit a crackling bus so its rare big cracks stand no more than crestDb above its rms: it keeps its bite, the loop its level */
function tame(x: Float32Array, crestDb: number): Float32Array {
  const lim = rmsOf(x) * Math.pow(10, crestDb / 20);
  for (let i = 0; i < x.length; i++) x[i] = lim * Math.tanh(x[i] / lim);
  return x;
}

/** turn a seamless loop round so its wrap falls on an ordinary moment (the game starts it anywhere; this keeps a crust breaking from sitting right on the seam) */
function settle(x: Float32Array, sr: number): Float32Array {
  const n = x.length;
  const w = Math.floor(0.05 * sr);
  const lv: Array<[number, number]> = [];
  for (let j = 0; (j + 1) * w <= n; j++) {
    let e = 0;
    for (let i = j * w; i < (j + 1) * w; i++) e += x[i] * x[i];
    lv.push([e, j]);
  }
  lv.sort((p, q) => p[0] - q[0]);
  const at = lv[lv.length >> 1][1] * w + (w >> 1);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = x[(i + at) % n];
  return out;
}

/** a loop's events drawn over twice its length, the second half (the tails) folded back onto the first */
function fold(b: Float32Array): Float32Array {
  const n = b.length >> 1;
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = b[i] + b[i + n];
  return y;
}

/**
 * A scraper blade over a window caked in dried grime: where there is crust, grit crackles under the
 * edge and patches of it give way in little crunches; where the glass shows through, the blade
 * chatters on it and squeals, a wavering, slightly whistly tone round 2 kHz in catches of a few
 * hundredths to half a second, now and then flipping up or down a step. Seamless.
 */
function scrapeGlass(): Recipe {
  return (sr, rng) => {
    const len = 3.6;
    const n = Math.floor(len * sr);
    const crust = wander(rng, 16, 0, 1);
    const press = wander(rng, 7, 0.6, 1);
    const thick = (t: number): number => Math.pow(crust(t / len), 1.6);
    const grit = cyclic(sr, len, (x) => {
      scatter(rng, len, 1100, (t) => 0.06 + 0.94 * thick(t) * press(t / len), (t, d) => grainInto(x, sr, t, powerLaw(rng, 0.15, 2) * (0.4 + 0.6 * d), rng.range(0.0001, 0.0006), rng));
      // a patch of crust giving way: a little crunch
      scatter(rng, len, 11, thick, (t) => {
        const m = 8 + Math.floor(rng.next() * 16);
        const g = rng.range(0.5, 1);
        const span = rng.range(0.015, 0.045);
        for (let k = 0; k < m; k++) grainInto(x, sr, t + span * Math.pow(rng.next(), 1.3), g * rng.range(0.4, 1.2), rng.range(0.0002, 0.001), rng);
      });
    });
    const crunch = tame(loopFilter(grit, sr, [['highpass', 1900, 0.7], ['highpass', 1900, 0.7], ['peaking', 4400, 0.9, 4], ['lowpass', 8000, 0.7], ['lowpass', 9000, 0.7]]), 14);
    // the squeal: louder where the glass is clean, never the same catch twice
    const squeal = cyclic(sr, len, (x) => {
      let t = rng.range(0, 0.05);
      while (t < len) {
        const dur = rng.range(0.08, 0.55);
        const r = rng.next();
        const mode = r < 0.62 ? 1 : r < 0.78 ? 1.19 : r < 0.9 ? 0.86 : 1.33;
        squealInto(x, sr, t, dur, 2100 * mode * rng.range(0.96, 1.04), rng.range(0.55, 1) * (1 - 0.4 * thick(t + dur / 2)), rng, {
          bright: rng.range(0.25, 0.55), waver: rng.range(0.01, 0.035), glide: 0.08, grip: rng.range(0.1, 0.45),
          flip: rng.next() < 0.3 ? [rng.range(0.3, 0.7), rng.next() < 0.5 ? 1.19 : 0.84] : undefined,
        });
        t += dur + rng.range(0.02, 0.15) * (0.3 + thick(t));
      }
    });
    // the edge hissing faintly on the glass, and its drag as it is pressed on: a little body under it all
    const bed = loopNoise(n, sr, rng, [['bandpass', 3200, 0.6], ['highpass', 1500, 0.7]]);
    const drag = loopNoise(n, sr, rng, [['bandpass', 750, 0.8]]);
    const [rc, rs, rb, rd] = [rmsOf(crunch), rmsOf(squeal), rmsOf(bed), rmsOf(drag)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      out[i] = crunch[i] / rc + (1.1 * squeal[i]) / rs + (0.15 * bed[i] * press(u)) / rb + (0.2 * drag[i] * press(u) * (0.5 + 0.5 * thick(u * len))) / rd;
    }
    return normalize(settle(centre(loopFilter(out, sr, [['lowpass', 12000, 0.7]])), sr), 0.5);
  };
}

/**
 * The blade over painted sheet metal with grime on it: a dry rasp, the edge catching and slipping
 * fifty to eighty-five times a second, each catch a spray of grit focused in 2-6 kHz, now biting
 * harder, now skipping a ridge; harder specks scratching through, the panel answering faintly in
 * its lowest modes and knocking now and then as the blade judders. Seamless.
 */
function scrapeMetal(): Recipe {
  return (sr, rng) => {
    const len = 3.4;
    const n = Math.floor(len * sr);
    const press = wander(rng, 9, 0.55, 1);
    const grime = wander(rng, 15, 0.12, 1);
    const chat = wander(rng, 6, 50, 85);
    const raw = cyclic(sr, len, (x) => {
      for (let t = 0; t < len; ) {
        const T = rng.range(0.75, 1.3) / chat(t / len);
        const r = rng.next();
        if (r < 0.035) {
          // skipping over a ridge: a few catches missed
          t += T * rng.range(2, 5);
          continue;
        }
        const bite = r > 0.95 ? 1.8 : 1;
        const d = press(t / len) * grime(t / len);
        const m = 4 + Math.floor(rng.range(6, 26) * d * bite);
        const g = rng.range(0.55, 1) * (0.5 + 0.5 * d) * Math.sqrt(bite);
        for (let k = 0; k < m; k++) grainInto(x, sr, t + 0.55 * T * Math.pow(rng.next(), 1.6), g * powerLaw(rng, 0.25, 2.5), rng.range(0.0001, 0.0005), rng);
        t += T;
      }
      // (between the catches it still drags a little grit)
      scatter(rng, len, 900, (t) => 0.3 + 0.7 * press(t / len) * grime(t / len), (t) => grainInto(x, sr, t, 0.3 * powerLaw(rng, 0.25, 2.5), rng.range(0.0001, 0.0004), rng));
    });
    const rasp = tame(loopFilter(raw, sr, [['highpass', 1800, 0.7], ['highpass', 1800, 0.7], ['peaking', 3800, 0.8, 5], ['lowpass', 6500, 0.7], ['lowpass', 7000, 0.7]]), 12);
    const scratch = cyclic(sr, len, (x) => scatter(rng, len, 110, (t) => grime(t / len), (t) => grainInto(x, sr, t, powerLaw(rng, 0.5, 2), rng.range(0.00008, 0.00025), rng)));
    const scr = tame(loopFilter(scratch, sr, [['highpass', 2600, 0.7], ['peaking', 5200, 1, 4], ['lowpass', 9000, 0.7]]), 12);
    // the panel's lowest modes rung by all of it (the grit unfiltered reaches them), faintly
    const panel = new Float32Array(n);
    for (const [f, g, d] of panelModes(1.15, 1.4).slice(0, 5)) mixInto(panel, loopFilter(raw, sr, [['bandpass', f, Math.PI * f * d]]), 0, g);
    const knocks = cyclic(sr, len, (x) => scatter(rng, len, 1.6, (t) => press(t / len), (t) => strike(x, sr, Math.floor(t * sr), panelModes(1.15, 2.2), rng.range(0.4, 1), rng, 0.03)));
    const drag = loopNoise(n, sr, rng, [['bandpass', 900, 0.8]]);
    const [ra, rs, rp, rk, rd] = [rmsOf(rasp), rmsOf(scr), rmsOf(panel), rmsOf(knocks), rmsOf(drag)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      out[i] = rasp[i] / ra + (0.45 * scr[i]) / rs + (0.12 * panel[i]) / rp + (0.06 * knocks[i]) / rk + (0.16 * drag[i] * press(u) * grime(u)) / rd;
    }
    return normalize(settle(centre(loopFilter(out, sr, [['lowpass', 12000, 0.7]])), sr), 0.5);
  };
}

/**
 * Rust scale and thick crust breaking off under the blade: dense crackling in runs (most cracks
 * tiny, the odd big one), brittle flakes popping off with a tick and sometimes tumbling, and under it
 * the steel ground in a low, juddering scrape. Rougher and harder than the painted metal. Seamless.
 */
function scrapeRust(): Recipe {
  return (sr, rng) => {
    const len = 3.3;
    const n = Math.floor(len * sr);
    const scale = wander(rng, 12, 0.3, 1);
    const press = wander(rng, 8, 0.6, 1);
    const judder = wander(rng, Math.round(len * 36), 0.15, 1);
    // the runs of cracks, each in one of four colours
    const bus = [0, 1, 2, 3].map(() => new Float32Array(2 * n));
    scatter(rng, len, 140, (t) => scale(t / len), (t) => {
      const b = bus[Math.floor(rng.next() * 4)];
      const m = 2 + Math.floor(powerLaw(rng, 0.1, 1.3) * 10);
      const g = powerLaw(rng, 0.2, 1.8);
      for (let k = 0, tt = t; k < m; k++) {
        grainInto(b, sr, tt, g * rng.range(0.35, 1), rng.range(0.00005, 0.0004), rng);
        tt -= Math.log(1 - rng.next()) * 0.0018;
      }
    });
    const [b0, b1, b2, b3] = bus.map(fold);
    const crackle = new Float32Array(n);
    mixInto(crackle, loopFilter(b0, sr, [['bandpass', 1500, 1.2]]), 0, 1.6);
    mixInto(crackle, loopFilter(b1, sr, [['bandpass', 2800, 1.2]]), 0, 1.3);
    mixInto(crackle, loopFilter(b2, sr, [['bandpass', 4800, 1.1]]), 0, 1);
    mixInto(crackle, loopFilter(b3, sr, [['highpass', 2000, 0.7], ['lowpass', 8000, 0.7]]), 0, 0.7);
    tame(crackle, 12);
    const pops = cyclic(sr, len, (x) => {
      scatter(rng, len, 12, (t) => scale(t / len), (t) => {
        // a flake snapping off: a brittle tick, sometimes the panel thumped, sometimes the bits tumbling away
        const f = rng.range(1200, 3200);
        const d = rng.range(0.002, 0.005);
        const a = powerLaw(rng, 0.35, 2);
        strike(x, sr, Math.floor(t * sr), [[f, 1, d], [f * 1.53, 0.6, d * 0.7], [f * 2.37, 0.35, d * 0.5]], 0.5 * a, rng, 0.04);
        grainInto(x, sr, t, 0.8 * a, 0.0003, rng);
        if (rng.next() < 0.3) thudInto(x, sr, t, rng, 0.25 * a, rng.range(140, 200), 0.006);
        if (rng.next() < 0.4) for (let k = 0; k < 2 + Math.floor(rng.next() * 2); k++) strike(x, sr, Math.floor((t + rng.range(0.01, 0.045)) * sr), [[rng.range(4000, 7000), 1, 0.0007]], 0.25 * a * rng.range(0.3, 1), rng);
      });
    });
    tame(pops, 14);
    const low = loopNoise(n, sr, rng, [['bandpass', 550, 0.8], ['lowpass', 1600, 0.7]]);
    const grind = loopNoise(n, sr, rng, [['bandpass', 1600, 0.8]]);
    const [rc, rp, rl, rg] = [rmsOf(crackle), rmsOf(pops), rmsOf(low), rmsOf(grind)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const j = judder(u);
      out[i] = crackle[i] / rc + (0.7 * pops[i]) / rp + (0.55 * low[i] * press(u) * j) / rl + (0.3 * grind[i] * j * scale(u)) / rg;
    }
    return normalize(settle(centre(loopFilter(saturate(normalize(out, 1), 1.4), sr, [['lowpass', 11000, 0.7]])), sr), 0.5);
  };
}

/**
 * Soft damp dirt pushed off: a muffled smear (the blade's face through the mud, mostly below a
 * kilohertz and a half), wet clumps thumping off, squelches, a smack and a suck as it lets go.
 * Seamless.
 */
function scrapeMud(): Recipe {
  return (sr, rng) => {
    const len = 3.4;
    const n = Math.floor(len * sr);
    const press = wander(rng, 9, 0.45, 1);
    const smear = wander(rng, Math.round(len * 9), 0.3, 1);
    const wet = wander(rng, 10, 0.3, 1);
    const ev = cyclic(sr, len, (x) => {
      scatter(rng, len, 7, (t) => press(t / len), (t) => burst(x, sr, Math.floor(t * sr), rng.range(0.02, 0.06), rng.range(0.4, 0.9), rng, { attack: rng.range(0.002, 0.006), decay: rng.range(0.008, 0.02), filter: [['lowpass', rng.range(350, 700)], ['lowpass', 900]] }));
      scatter(rng, len, 18, (t) => wet(t / len), (t) => plipInto(x, sr, t, rng.range(250, 700), rng.range(0.1, 0.35), rng.range(0.006, 0.014), rng.range(0.3, 0.6)));
      // the mud letting go: a wet smack falling in pitch
      scatter(rng, len, 3, (t) => wet(t / len), (t) => {
        const m = Math.floor(rng.range(0.03, 0.06) * sr);
        const f0 = rng.range(800, 1200);
        const sm = sweptBand(noise(m, rng), sr, (tt) => f0 - 9000 * tt, 3);
        for (let i = 0; i < m; i++) sm[i] *= Math.min(1, i / (0.003 * sr)) * Math.exp(-i / (0.012 * sr));
        mixInto(x, sm, Math.floor(t * sr), 0.5);
      });
      scatter(rng, len, 60, (t) => press(t / len), (t) => grainInto(x, sr, t, 0.15 * rng.range(0.3, 1), rng.range(0.0005, 0.002), rng));
    });
    tame(ev, 14);
    const body = loopFilter(noise(n, rng), sr, [['lowpass', 700, 0.7], ['highpass', 80, 0.7], ['peaking', 300, 1, 4]]);
    const [re, rb] = [rmsOf(ev), rmsOf(body)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      out[i] = ev[i] / re + (0.85 * body[i] * press(u) * smear(u)) / rb;
    }
    return normalize(settle(centre(loopFilter(out, sr, [['lowpass', 1500, 0.7], ['lowpass', 2200, 0.7]])), sr), 0.5);
  };
}

/**
 * A steel wire brush scrubbed over metal: bristle tips flicking over it by the thousand (tiny sharp
 * ticks, the odd one standing out), the wires catching on pits and scale so it rasps rather than
 * hisses, single wires scratching in little chirps, the wires ringing a metallic sheen above 4 kHz,
 * the brush's back thrumming; back and forth, seven strokes a loop never quite equal, swelling a
 * little in each and flicking over where it turns. Seamless.
 */
function brushWire(): Recipe {
  return (sr, rng) => {
    const len = 3.2;
    const n = Math.floor(len * sr);
    const st = strokes(rng, 7, len);
    const swell = (t: number): number => {
      const { u, i } = st.at(t);
      return (0.55 + 0.45 * Math.pow(Math.sin(Math.PI * u), 0.6)) * st.amp[i];
    };
    // the bristles catching: a rough, irregular flutter of 20-80 Hz
    const catchy = wander(rng, Math.round(len * 140), 0, 1);
    const rough = (u: number): number => 0.12 + 0.88 * catchy(u) ** 2;
    const ticks = new Float32Array(2 * n);
    const tick = (t: number, v: number): void => {
      const a = Math.floor(t * sr);
      ticks[a] += v;
      ticks[a + 1] -= 0.6 * v;
    };
    scatter(rng, len, 2000, swell, (t) => tick(t, powerLaw(rng, 0.1, 1.6) * (rng.next() < 0.5 ? -1 : 1)));
    for (const t0 of st.starts) for (let j = 0; j < 40; j++) tick(t0 + 0.015 * rng.next(), powerLaw(rng, 0.3, 1.5) * (rng.next() < 0.5 ? -1 : 1));
    const tk = fold(ticks);
    const sharp = loopFilter(tk, sr, [['highpass', 2200, 0.7], ['highpass', 2200, 0.7], ['peaking', 4800, 0.9, 4], ['lowpass', 8500, 0.7], ['lowpass', 9500, 0.7]]);
    // the wires ringing, each tick through their modes
    const sheen = new Float32Array(n);
    for (const [f, d] of [[4250, 0.006], [5350, 0.005], [6450, 0.0045], [7600, 0.004], [8700, 0.0035]] as const) mixInto(sheen, loopFilter(tk, sr, [['bandpass', f, Math.PI * f * d]]), 0, 1);
    const scr = cyclic(sr, len, (x) => scatter(rng, len, 30, swell, (t) => squealInto(x, sr, t, rng.range(0.006, 0.025), rng.range(3400, 6500), rng.range(0.3, 1), rng, { bright: 0.25, waver: 0.06, glide: 0.25, grip: 0.6, jitter: 0.03 })));
    const sand = loopFilter(cyclic(sr, len, (x) => scatter(rng, len, 1500, swell, (t) => grainInto(x, sr, t, powerLaw(rng, 0.2, 2.5), rng.range(0.00015, 0.0005), rng))), sr, [['bandpass', 3800, 0.8], ['lowpass', 8000, 0.7]]);
    const thrum = loopNoise(n, sr, rng, [['bandpass', 1000, 0.7]]);
    const [r1, r2, r3, r4, r5] = [rmsOf(sharp), rmsOf(sheen), rmsOf(scr), rmsOf(sand), rmsOf(thrum)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      out[i] = (sharp[i] / r1 + (0.35 * sheen[i]) / r2 + (0.5 * sand[i]) / r4) * rough(u) + (0.3 * scr[i]) / r3 + (0.16 * thrum[i] * swell(u * len)) / r5;
    }
    return normalize(settle(centre(loopFilter(tame(out, 13), sr, [['lowpass', 11000, 0.7]])), sr), 0.5);
  };
}

/**
 * A wet sponge scrubbed over a panel (richer than `sponge`, which other things use): the soft swish
 * of it back and forth (six strokes a loop), the foam fizzing and crackling with bubbles in it,
 * water squelched out where it turns, now and then a wet squeak of friction on the paint, a drip.
 * Seamless.
 */
function spongeScrub(): Recipe {
  return (sr, rng) => {
    const len = 3.6;
    const n = Math.floor(len * sr);
    const st = strokes(rng, 6, len);
    const swell = (t: number): number => {
      const { u, i } = st.at(t);
      return (0.3 + 0.7 * Math.pow(Math.sin(Math.PI * u), 1.1)) * st.amp[i];
    };
    const foam = wander(rng, 9, 0.4, 1);
    // the foam: tiny bubbles bursting all the time, more under the sponge's pressure
    const fizz = cyclic(sr, len, (x) => scatter(rng, len, 1400, (t) => (0.3 + 0.7 * swell(t)) * foam(t / len), (t) => ring(x, sr, Math.floor(t * sr), rng.range(2200, 7000), powerLaw(rng, 0.15, 2), rng.range(0.0003, 0.001), rng.range(0, 6.283))));
    const wet = cyclic(sr, len, (x) => {
      scatter(rng, len, 40, (t) => foam(t / len), (t) => plipInto(x, sr, t, rng.range(600, 2000), rng.range(0.3, 1), rng.range(0.003, 0.007), -rng.range(0.1, 0.4)));
      for (const t0 of st.starts) {
        // where it turns: water squelched out of it, a gurgle falling in pitch
        const m = Math.floor(rng.range(0.08, 0.14) * sr);
        const f0 = rng.range(1000, 1300);
        const sq = sweptBand(noise(m, rng), sr, (tt) => f0 - 5500 * tt, 3);
        for (let i = 0; i < m; i++) sq[i] *= Math.min(1, i / (0.01 * sr)) * Math.exp(-i / (0.035 * sr)) * (0.6 + 0.4 * Math.sin((2 * Math.PI * 45 * i) / sr));
        mixInto(x, sq, Math.floor(t0 * sr), 1.2);
        for (let j = 0; j < 4 + Math.floor(rng.next() * 4); j++) plipInto(x, sr, t0 + rng.range(0, 0.09), rng.range(300, 1000), rng.range(0.5, 1), rng.range(0.006, 0.014), rng.range(0.2, 0.5));
      }
      // a wet squeak of friction, a drip
      scatter(rng, len, 1.5, (t) => swell(t), (t) => squealInto(x, sr, t, rng.range(0.05, 0.14), rng.range(600, 1200), rng.range(0.6, 1), rng, { bright: 0.5, waver: 0.05, glide: 0.2, grip: 0.6 }));
      scatter(rng, len, 1.5, () => 1, (t) => plipInto(x, sr, t, rng.range(1400, 2800), rng.range(0.3, 0.6), rng.range(0.003, 0.005), -0.15));
    });
    const rub = loopFilter(noise(n, rng), sr, [['lowpass', 1300, 0.7], ['highpass', 200, 0.7], ['peaking', 550, 1, 3]]);
    const tex = wander(rng, Math.round(len * 30), 0.5, 1);
    const [rf, rw, rr] = [rmsOf(fizz), rmsOf(wet), rmsOf(rub)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = (i / n) * len;
      out[i] = (0.55 * rub[i] * Math.pow(swell(t), 1.4) * tex(i / n)) / rr + (0.5 * fizz[i]) / rf + wet[i] / rw;
    }
    return normalize(settle(centre(loopFilter(out, sr, [['lowpass', 12000, 0.7]])), sr), 0.45);
  };
}

/** the blade catching on the surface as a stroke begins (~0.09 s), by what it bites into; the four about as loud as one another */
function scrapeStart(s: ScrapeSurface): Recipe {
  return (sr, rng) => {
    const x = S(sr, s === 'mud' ? 0.11 : 0.09);
    if (s === 'glass') {
      // the edge tapping onto the pane, a little grit, the first squeak as it bites
      strike(x, sr, 0, [[rng.range(4300, 5200), 1, 0.003], [rng.range(6600, 7600), 0.45, 0.002], [rng.range(2600, 3100), 0.3, 0.004]], 0.5, rng);
      burst(x, sr, 0, 0.002, 0.3, rng, { attack: 0.0001, decay: 0.0004, filter: [['highpass', 2500], ['lowpass', 9000]] });
      const grit = S(sr, 0.04);
      for (let k = 0; k < 8; k++) burst(grit, sr, Math.floor(rng.range(0.003, 0.03) * sr), 0.002, rng.range(0.1, 0.3), rng, { attack: 0.0001, decay: 0.0005, filter: [['highpass', 2200], ['lowpass', 9000]] });
      mixInto(x, biquad(grit, sr, 'peaking', 4800, 1, 4), 0);
      squealInto(x, sr, rng.range(0.008, 0.014), rng.range(0.03, 0.05), rng.range(2000, 2300), 0.2, rng, { bright: 0.3, waver: 0.02, glide: 0.12, grip: 0.3 });
      return normalize(edges(x, sr, 0.5, 20), 0.55);
    }
    if (s === 'rust') {
      // a crust cracking as the edge bites into it: a run of cracks and a pop, the panel thumped
      for (let k = 0, t = 0.002; k < 12; k++) {
        burst(x, sr, Math.floor(t * sr), rng.range(0.0015, 0.004), rng.range(0.3, 1) * (1 - k / 14), rng, { attack: 0.0001, decay: rng.range(0.0003, 0.001), filter: [['bandpass', rng.range(1200, 6000), 1.2]] });
        t += rng.range(0.001, 0.005);
      }
      const f = rng.range(1500, 2600);
      strike(x, sr, Math.floor(0.004 * sr), [[f, 1, 0.005], [f * 1.6, 0.5, 0.003], [f * 2.4, 0.3, 0.002]], 0.6, rng);
      thudInto(x, sr, 0.003, rng, 0.3, 150, 0.008);
      return normalize(edges(x, sr, 0.5, 20), 0.75);
    }
    if (s === 'mud') {
      // a soft wet "puh" as the blade meets the dirt
      burst(x, sr, 0, 0.06, 1, rng, { attack: 0.004, decay: 0.018, filter: [['lowpass', 500], ['lowpass', 700]] });
      plipInto(x, sr, 0.006, rng.range(300, 480), 0.35, 0.01, 0.4);
      burst(x, sr, Math.floor(0.004 * sr), 0.02, 0.12, rng, { attack: 0.002, decay: 0.005, filter: [['bandpass', 1000, 1.5]] });
      return normalize(edges(x, sr, 0.5, 20), 0.6);
    }
    // painted metal: a dry scuff as the edge catches, a tick, the panel barely tapped
    const scuff = S(sr, 0.05);
    burst(scuff, sr, 0, 0.05, 0.8, rng, { attack: 0.003, decay: 0.012, filter: [['highpass', 1500], ['lowpass', 7000], ['lowpass', 8000]] });
    mixInto(x, biquad(scuff, sr, 'peaking', 3500, 0.8, 6), 0);
    strike(x, sr, 0, [[rng.range(3600, 4400), 1, 0.004], [rng.range(5800, 6600), 0.5, 0.003]], 0.45, rng);
    strike(x, sr, 0, panelModes(1.3, 6), 0.03, rng);
    for (let k = 0; k < 6; k++) burst(x, sr, Math.floor(rng.range(0.004, 0.035) * sr), 0.0015, rng.range(0.15, 0.4), rng, { attack: 0.0001, decay: 0.0004, filter: [['highpass', 2500], ['lowpass', 8000]] });
    return normalize(edges(x, sr, 0.5, 20), 0.65);
  };
}

/** bits of dirt or rust landing on the floor: a few faint ticks and crumbs spread over about 0.3 s, never twice the same */
function flakeDrop(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.38);
    const count = 3 + Math.floor(rng.next() * 5);
    // (most land together, the rest trickle after them)
    const times = Array.from({ length: count }, () => 0.004 + 0.3 * Math.pow(rng.next(), 1.5)).sort((p, q) => p - q);
    for (const t of times) {
      const a = rng.range(0.35, 1) * (1 - 0.45 * (t / 0.3));
      if (rng.next() < 0.6) {
        // a hard flake on the concrete: a tiny bright tick, maybe a bounce
        const f = rng.range(3500, 7000);
        const d = rng.range(0.0008, 0.002);
        strike(x, sr, Math.floor(t * sr), [[f, 1, d], [f * 1.5, 0.4, d * 0.6]], a, rng, 0.05);
        if (rng.next() < 0.5) strike(x, sr, Math.floor((t + rng.range(0.01, 0.03)) * sr), [[f * rng.range(0.95, 1.05), 1, d * 0.8]], 0.3 * a, rng);
      } else {
        // a crumb of dirt: a soft dull tick
        burst(x, sr, Math.floor(t * sr), 0.003, 0.6 * a, rng, { attack: 0.0002, decay: 0.0007, filter: [['bandpass', rng.range(1500, 3000), 1]] });
      }
    }
    biquad(x, sr, 'lowpass', 9000, 0.7);
    return normalize(edges(x, sr, 0.5, 20), 0.4);
  };
}

/** a bell partial as a slowly beating pair (two strikes a hair apart in pitch, starting together; `depth` of the second) from `at`; at `phase` if given, else a random one */
function bellInto(x: Float32Array, sr: number, at: number, f: number, amp: number, decay: number, beat: number, rng: Rng, attack = 0.0015, depth = 0.38, phase?: number): void {
  const a = Math.max(0, Math.floor(at * sr));
  const n = Math.min(x.length - a, Math.ceil(decay * 8 * sr));
  const p1 = phase ?? rng.range(0, 6.283);
  const p2 = phase ?? p1 + rng.range(-0.3, 0.3);
  // two phasors turned a step each sample (no sine to work out per sample: the fanfare has dozens of these)
  const c1 = Math.cos((2 * Math.PI * f) / sr);
  const s1 = Math.sin((2 * Math.PI * f) / sr);
  const c2 = Math.cos((2 * Math.PI * (f + beat)) / sr);
  const s2 = Math.sin((2 * Math.PI * (f + beat)) / sr);
  let u1 = Math.cos(p1);
  let v1 = Math.sin(p1);
  let u2 = Math.cos(p2);
  let v2 = Math.sin(p2);
  const k = Math.exp(-1 / (decay * sr));
  const na = Math.max(1, attack * sr);
  let e = amp;
  for (let i = 0; i < n; i++) {
    x[a + i] += e * Math.min(1, i / na) * ((1 - depth) * v1 + depth * v2);
    const t1 = u1 * c1 - v1 * s1;
    v1 = v1 * c1 + u1 * s1;
    u1 = t1;
    const t2 = u2 * c2 - v2 * s2;
    v2 = v2 * c2 + u2 * s2;
    u2 = t2;
    e *= k;
  }
}

/** a clean bell struck once: harmonic partials (a tuned bar), beating gently (at `beats` Hz, the same bell every time; else a little different every time) */
function chimeInto(x: Float32Array, sr: number, at: number, f: number, amp: number, rng: Rng, decay = 0.32, bright = 1, beats?: readonly [number, number, number]): void {
  // (given its beats its phases are fixed too: peak normalisation then gives every rendering the same level)
  const ph = beats ? 0 : undefined;
  bellInto(x, sr, at, f, amp, decay, beats ? beats[0] : rng.range(1.8, 2.8), rng, 0.0015, 0.2, ph);
  bellInto(x, sr, at, f * 2, 0.42 * amp * bright, decay * 0.5, beats ? beats[1] : rng.range(3, 4.5), rng, 0.0015, 0.3, ph);
  bellInto(x, sr, at, f * 3, 0.13 * amp * bright, decay * 0.22, beats ? beats[2] : rng.range(4.5, 6), rng, 0.0015, 0.3, ph);
  bellInto(x, sr, at, f * 4.17, 0.05 * amp * bright, decay * 0.08, 0, rng, 0.0015, 0.38, ph);
}

/** light glinting off something clean: a quick run of tiny pings up the bell's own overtones */
function glintInto(x: Float32Array, sr: number, at: number, f: number, amp: number, rng: Rng, steps = [4, 5, 6, 8, 10, 12]): void {
  let t = at;
  steps.forEach((h, k) => {
    ring(x, sr, Math.floor(t * sr), f * h * (1 + 0.002 * rng.gauss()), amp * (1 - 0.1 * k) * rng.range(0.7, 1), rng.range(0.025, 0.05), rng.range(0, 6.283));
    t += rng.range(0.014, 0.022);
  });
}

/**
 * THE reward: a part has come clean. A small bright bell (D6, its octave and twelfth, beating
 * gently), a soft bloom an octave under it, and a glint of light running up its overtones (~0.85 s).
 * Heard every few seconds while working, so: no hard click, nothing shrill, the same bell every time
 * (only the glint and a few sparkles differ between its renderings).
 */
function cleanDing(): Recipe {
  return (sr, rng) => {
    const len = 0.85;
    const x = S(sr, len);
    const f = 1174.66;
    burst(x, sr, 0, 0.002, 0.06, rng, { attack: 0.0002, decay: 0.0004, filter: [['highpass', 3000]] });
    chimeInto(x, sr, 0, f, 1, rng, 0.3, 1, [2.2, 3.7, 5.2]);
    // the bloom: body, so it is a ding and not a beep
    bellInto(x, sr, 0, f / 2, 0.14, 0.32, 1.1, rng, 0.006, 0.38, 0);
    glintInto(x, sr, rng.range(0.02, 0.035), f, 0.08, rng);
    for (let k = 0; k < 3; k++) ring(x, sr, Math.floor(rng.range(0.16, 0.42) * sr), f * [5, 6, 8, 10][Math.floor(rng.next() * 4)], 0.02, rng.range(0.03, 0.05), rng.range(0, 6.283));
    for (let i = Math.floor(0.62 * sr); i < x.length; i++) x[i] *= Math.max(0, 1 - (i / sr - 0.62) / 0.23);
    return normalize(edges(x, sr, 0.5, 20), 0.7);
  };
}

/** rust brushed off a part: a warmer two-note chime (G5, then D6 a fifth above, where the ding sits), a vibraphone's round tone with its slow tremolo (~1 s) */
function cleanRustDone(): Recipe {
  return (sr, rng) => {
    const len = 1.0;
    const x = S(sr, len);
    const note = (at: number, f: number, amp: number): void => {
      bellInto(x, sr, at, f, amp, 0.4, 1.3, rng, 0.003, 0.38, 0);
      bellInto(x, sr, at, f * 4, 0.12 * amp, 0.05, 2.6, rng, 0.002, 0.38, 0);
      bellInto(x, sr, at, f * 2, 0.08 * amp, 0.12, 2, rng, 0.003, 0.38, 0);
    };
    note(0, 783.99, 0.85);
    note(0.13, 1174.66, 1);
    for (let i = 0; i < x.length; i++) x[i] *= 1 - 0.16 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 5.2 * (i / sr) - 1.2));
    for (let i = Math.floor(0.75 * sr); i < x.length; i++) x[i] *= Math.max(0, 1 - (i / sr - 0.75) / 0.25);
    return normalize(edges(x, sr, 1, 20), 0.7);
  };
}

/** the whole vehicle restored: G major rising in bells, the chord blooming over a warm pad and a soft low hit, sparkle all over it (~2.2 s) */
function cleanCarDone(): Recipe {
  return (sr, rng) => {
    const len = 2.2;
    const x = S(sr, len);
    const G5 = 783.99;
    const notes = [G5, 987.77, 1174.66, 1567.98];
    notes.forEach((f, k) => chimeInto(x, sr, k * 0.1, f, 0.7 + 0.1 * k, rng, 0.35));
    const t1 = 0.42;
    for (const f of notes) chimeInto(x, sr, t1, f, 0.45, rng, 0.8, 0.8);
    // the pad: a soft chord swelling under the bells (each partial a pair half a percent apart) and dying away
    for (const [f, a] of [[392, 0.14], [587.33, 0.1], [783.99, 0.08], [987.77, 0.06]] as const) {
      for (const [h, g] of [[1, 1], [2, 0.3], [3, 0.12]] as const) bellInto(x, sr, t1 - 0.04, f * h, a * g, 0.9, f * h * 0.005, rng, 0.12, 0.5);
    }
    // the low hit: weight under the chord, a G two octaves down
    const lo = Math.floor(t1 * sr);
    for (let i = 0; lo + i < x.length && i < sr; i++) {
      const t = i / sr;
      x[lo + i] += 0.35 * Math.sin(2 * Math.PI * 196 * t) * Math.exp(-t / 0.22) * Math.min(1, t / 0.004);
    }
    thudInto(x, sr, t1, rng, 0.2, 120, 0.02);
    for (let k = 0; k < 34; k++) {
      const t = 0.32 + 1.3 * Math.pow(rng.next(), 1.6);
      ring(x, sr, Math.floor(t * sr), G5 * [5, 6, 8, 10, 12, 15][Math.floor(rng.next() * 6)] * (1 + 0.002 * rng.gauss()), 0.035 * (1 - 0.5 * ((t - 0.32) / 1.3)) * rng.range(0.4, 1), rng.range(0.03, 0.07), rng.range(0, 6.283));
    }
    for (let i = Math.floor(1.75 * sr); i < x.length; i++) x[i] *= Math.max(0, 1 - (i / sr - 1.75) / 0.45);
    return normalize(edges(x, sr, 1, 30), 0.8);
  };
}

/** a cleaning tool worn out (a sponge torn, a blade blunt, bristles gone): a strain, a dull tearing crunch, a last soft thump (~0.3 s) */
function toolWorn(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.32);
    creakInto(x, sr, 0, 0.06, rng, 0.06, false);
    // the tear: fibres and bits giving way one after another, fraying out
    const t0 = 0.035;
    const tl = rng.range(0.1, 0.14);
    for (let t = t0; t < t0 + tl; t += rng.range(0.0015, 0.005)) {
      const u = (t - t0) / tl;
      burst(x, sr, Math.floor(t * sr), 0.002, 0.55 * Math.pow(1 - u, 0.7) * rng.range(0.3, 1), rng, { attack: 0.0001, decay: 0.0006, filter: [['bandpass', rng.range(800, 2800), 1.1]] });
    }
    // the dull crack of it giving up
    burst(x, sr, Math.floor(0.045 * sr), 0.004, 0.45, rng, { attack: 0.0001, decay: 0.001, filter: [['lowpass', 2500]] });
    const f = rng.range(500, 850);
    strike(x, sr, Math.floor(0.045 * sr), [[f, 1, 0.012], [f * 1.7, 0.5, 0.008], [f * 2.6, 0.25, 0.005]], 0.3, rng, 0.04);
    thudInto(x, sr, 0.17, rng, 0.4, 180, 0.015);
    biquad(x, sr, 'lowpass', 3500, 0.7);
    biquad(x, sr, 'lowpass', 4500, 0.7);
    return normalize(edges(x, sr, 0.5, 30), 0.8);
  };
}

/** H, to show the dirt that is left: a soft sonar ping (A5, sliding up onto its pitch), two duller returns, a gentle shimmer of air (~0.6 s) */
function highlightPing(): Recipe {
  return (sr, rng) => {
    const len = 0.6;
    const x = S(sr, len);
    const p = S(sr, len);
    const f = 880;
    let ph = 0;
    for (let i = 0; i < p.length; i++) {
      const t = i / sr;
      ph += (2 * Math.PI * f * (1 - 0.035 * Math.exp(-t / 0.012))) / sr;
      p[i] = (Math.sin(ph) + 0.15 * Math.sin(2 * ph) * Math.exp(-t / 0.05)) * Math.exp(-t / 0.11) * Math.min(1, t / 0.004);
    }
    mixInto(x, p, 0, 1);
    const echo = biquad(Float32Array.from(p), sr, 'lowpass', 2200, 0.7);
    mixInto(x, echo, Math.floor(0.13 * sr), 0.3);
    mixInto(x, echo, Math.floor(0.26 * sr), 0.12);
    bellInto(x, sr, 0.01, f * 4, 0.05, 0.2, 5, rng, 0.02);
    const air = noise(Math.floor(0.4 * sr), rng);
    biquad(air, sr, 'bandpass', 6500, 3);
    for (let i = 0; i < air.length; i++) {
      const t = i / air.length;
      air[i] *= Math.pow(Math.sin(Math.PI * t), 2) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 9 * (i / sr)));
    }
    mixInto(x, air, Math.floor(0.02 * sr), 0.06);
    for (let i = Math.floor(0.45 * sr); i < x.length; i++) x[i] *= Math.max(0, 1 - (i / sr - 0.45) / 0.15);
    return normalize(edges(x, sr, 0.5, 20), 0.6);
  };
}

// ------------------------------------------------------------------ spray paint: the can shaken, its valve, the hiss, running dry, the coat done

/** the jet of an aerosol: broadband, its weight round 5 kHz, a little body under it (a shot's worth: filtered from silence) */
function jetNoise(n: number, sr: number, rng: Rng): Float32Array {
  const x = noise(n, rng);
  biquad(x, sr, 'highpass', 700, 0.5);
  biquad(x, sr, 'peaking', 5000, 0.5, 4);
  biquad(x, sr, 'lowpass', 11000, 0.7);
  return x;
}

/**
 * A spray can held open: the propellant's jet hissing out of the nozzle (broadband, weighted round
 * 5 kHz, a little body), the paint fizzing as it atomises (fine crackle), the plume's softer rush,
 * the can's tin ringing faintly with it; steady, as a pressurised can is, only its turbulence
 * wandering a little. Seamless.
 */
function sprayHiss(): Recipe {
  return (sr, rng) => {
    const len = 3.2;
    const n = Math.floor(len * sr);
    const jet = loopFilter(noise(n, rng), sr, [['highpass', 700, 0.5], ['peaking', 5000, 0.5, 4], ['lowpass', 11000, 0.7], ['lowpass', 13000, 0.7]]);
    const plume = loopFilter(noise(n, rng), sr, [['bandpass', 1300, 0.8]]);
    // the paint atomising: a fine fizz of tiny crackles, thicker and thinner
    const thick = wander(rng, 10, 0.6, 1);
    const fizz = loopFilter(cyclic(sr, len, (x) => scatter(rng, len, 2200, (t) => thick(t / len), (t) => grainInto(x, sr, t, powerLaw(rng, 0.15, 1.8), rng.range(0.00005, 0.0002), rng))), sr, [['highpass', 3000, 0.7], ['lowpass', 11000, 0.7]]);
    tame(fizz, 12);
    // the can's tin, rung faintly by the flow through it
    const tin = new Float32Array(n);
    for (const [f, g] of [[1850, 1], [2950, 0.7], [4150, 0.5]] as const) mixInto(tin, loopFilter(jet, sr, [['bandpass', f, 40]]), 0, g);
    // its turbulence: a small, irregular flutter, and a slower drift
    const flutter = wander(rng, Math.round(len * 14), -1, 1);
    const drift = wander(rng, 8, -1, 1);
    const [rj, rp, rf, rt] = [rmsOf(jet), rmsOf(plume), rmsOf(fizz), rmsOf(tin)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      out[i] = (jet[i] / rj + (0.28 * plume[i]) / rp + (0.55 * fizz[i]) / rf + (0.12 * tin[i]) / rt) * (1 + 0.07 * flutter(u) + 0.05 * drift(u));
    }
    return normalize(settle(centre(out), sr), 0.45);
  };
}

/** the valve opening as the button goes down: the actuator's tick, a pssht as the propellant rushes in, a spit or two, then handing over to the hiss (~0.16 s) */
function sprayStart(): Recipe {
  return (sr, rng) => {
    const len = 0.16;
    const x = S(sr, len);
    // the actuator going down
    strike(x, sr, 0, [[rng.range(2400, 3000), 1, 0.004], [rng.range(4200, 5000), 0.5, 0.003]], 0.25, rng);
    burst(x, sr, 0, 0.002, 0.2, rng, { attack: 0.0001, decay: 0.0004, filter: [['highpass', 2000], ['lowpass', 9000]] });
    // the rush: a little over the hiss it becomes, sputtering in the first few hundredths, then handing over
    const a = Math.floor(0.006 * sr);
    const m = x.length - a;
    const h = jetNoise(m, sr, rng);
    const gaps: Array<[number, number]> = [];
    // (in its first few hundredths, before the hiss easing in under it fills them)
    for (let k = 0, t = rng.range(0.008, 0.013); k < 2 + Math.floor(rng.next() * 3) && t < 0.045; k++) {
      const d = rng.range(0.003, 0.007);
      gaps.push([t, t + d]);
      t += d + rng.range(0.004, 0.012);
    }
    for (let i = 0; i < m; i++) {
      const t = i / sr;
      // (the rush over a sustain that, with the hiss easing in under it, holds the level the hiss settles at)
      let e = Math.min(1, t / 0.004) * (0.55 + 1.05 * Math.exp(-t / 0.02));
      for (const [g0, g1] of gaps) if (t >= g0 && t < g1) e *= 0.15 + 0.85 * Math.abs(Math.cos((Math.PI * (t - g0)) / (g1 - g0)));
      if (t > 0.08) e *= Math.exp(-(t - 0.08) / 0.025);
      h[i] *= e;
    }
    mixInto(x, h, a, 1);
    // the spits: paint and air through together
    for (const [g0] of gaps) if (rng.next() < 0.7) burst(x, sr, a + Math.floor((g0 + 0.002) * sr), rng.range(0.003, 0.006), 0.6, rng, { attack: 0.0002, decay: 0.0015, filter: [['bandpass', rng.range(1200, 3000), 1.2]] });
    // the propellant's soft low puff as it expands
    burst(x, sr, a, 0.03, 0.25, rng, { attack: 0.002, decay: 0.01, filter: [['lowpass', 900], ['lowpass', 1200]] });
    return normalize(edges(x, sr, 0.5, 15), 0.6);
  };
}

/** a can running dry: the hiss weakening, coughing and spitting in fits, darker each time, a last weak puff and nothing (~0.7 s) */
function spraySputter(): Recipe {
  return (sr, rng) => {
    const len = 0.75;
    const x = S(sr, len);
    const n = x.length;
    const bright = jetNoise(n, sr, rng);
    const dark = Float32Array.from(bright);
    biquad(dark, sr, 'lowpass', 2500, 0.7);
    biquad(dark, sr, 'lowpass', 3000, 0.7);
    // the fits: [start, length, level, brightness]
    const fits: Array<[number, number, number, number]> = [[0, rng.range(0.08, 0.12), 0.75, 1]];
    let t = fits[0][1] + rng.range(0.015, 0.035);
    let lvl = 0.9;
    while (t < 0.46) {
      const d = rng.range(0.025, 0.07);
      fits.push([t, d, lvl * rng.range(0.75, 1), Math.max(0, 1 - t / 0.5)]);
      t += d + rng.range(0.015, 0.06) * (1 + t);
      lvl *= rng.range(0.72, 0.85);
    }
    // the last puff: gas alone, weak and dull, done by two thirds of a second
    fits.push([Math.min(0.56, t + rng.range(0.02, 0.05)), rng.range(0.07, 0.1), 0.18, 0]);
    for (let i = 0; i < n; i++) {
      const tt = i / sr;
      let e = 0;
      let b = 0;
      for (const [f0, d, l, br] of fits) {
        if (tt < f0 || tt > f0 + d + 0.03) continue;
        const u = (tt - f0) / d;
        // each fit: a fast catch, held, let go
        const env = Math.min(1, (tt - f0) / 0.003) * (u < 1 ? 1 - 0.3 * u : Math.exp(-(tt - f0 - d) / 0.008));
        if (l * env > e) {
          e = l * env;
          b = br;
        }
      }
      // the first fit still hisses steadily, only weakening; the rest flutter as they cough
      x[i] = e * (b * bright[i] + (1 - b) * dark[i] * 1.6) * (1 + 0.25 * Math.sin(2 * Math.PI * 37 * tt + 3 * Math.sin(2 * Math.PI * 9 * tt)));
    }
    // paint spitting out with the gas: little splats and crackles in the fits
    for (const [f0, d, l] of fits.slice(1)) {
      if (rng.next() < 0.75) {
        const at = f0 + rng.range(0, d);
        burst(x, sr, Math.floor(at * sr), rng.range(0.004, 0.01), 0.5 * l, rng, { attack: 0.0003, decay: 0.002, filter: [['bandpass', rng.range(800, 1600), 1.4]] });
        for (let k = 0; k < 3 + Math.floor(rng.next() * 5); k++) grainInto(x, sr, at + rng.range(0, 0.015), 0.5 * l * rng.range(0.3, 1), rng.range(0.0001, 0.0004), rng);
      }
    }
    return normalize(edges(x, sr, 0.5, 30), 0.6);
  };
}

/** the shell modes of a spray can's thin tin (65 mm across, 20 cm tall): each its weight and ring, short with the paint in it */
const CAN_MODES: ReadonlyArray<readonly [number, number, number]> = [[1180, 0.6, 0.016], [1720, 1, 0.014], [2380, 0.8, 0.012], [3150, 0.6, 0.01], [4060, 0.4, 0.008], [5240, 0.25, 0.006]];

/**
 * Shaking a spray can before its first use: the mixing ball clacking end to end, five to seven
 * times as a hand shakes it (never quite evenly), each clack a hard knock that bounces once or twice
 * ("kl-lack"), the tin ringing short round it with the paint damping it, the paint sloshing (~0.8 s)
 */
function sprayRattle(): Recipe {
  return (sr, rng) => {
    const len = 0.85;
    const x = S(sr, len);
    const count = 5 + Math.floor(rng.next() * 3);
    // the hand: a little slower to start, then brisk
    const gap = 0.7 / count;
    let t = rng.range(0.005, 0.02);
    for (let k = 0; k < count; k++) {
      // up against the valve cup (harder, brighter), down on the domed bottom through the paint (duller)
      const top = k % 2 === 0;
      const a = (top ? 1 : 0.75) * rng.range(0.75, 1) * (k === count - 1 ? 0.8 : 1);
      // the knock and its bounces (the ball coming to rest against the end in a few hundredths)
      let bt = 0;
      let ba = a;
      const bounces = 1 + Math.floor(rng.next() * 3);
      for (let j = 0; j <= bounces; j++) {
        const at = Math.floor((t + bt) * sr);
        burst(x, sr, at, 0.003, 0.7 * ba, rng, { attack: 0.0001, decay: 0.0007, filter: [['bandpass', rng.range(2500, 5500), 0.9], ['lowpass', 11000]] });
        strike(x, sr, at, [[rng.range(6000, 8500), 1, 0.001]], 0.2 * ba, rng);
        strike(x, sr, at, CAN_MODES.map(([f, g, d], i) => [f * rng.range(0.96, 1.04), g * rng.range(0.4, 1.2) * (top ? 1 : 1.25 - 0.12 * i), d * (top ? 1 : 0.7)] as [number, number, number]), 0.3 * ba, rng, 0.015);
        bt += rng.range(0.006, 0.016) * (1 - 0.25 * j);
        ba *= rng.range(0.25, 0.45);
      }
      // the paint sloshing after it
      burst(x, sr, Math.floor((t + 0.01) * sr), rng.range(0.05, 0.08), 0.08 * a, rng, { attack: 0.015, decay: 0.025, filter: [['lowpass', 800], ['highpass', 200]] });
      t += gap * rng.range(0.82, 1.18) * (k === 0 ? 1.15 : 1);
    }
    return normalize(edges(x, sr, 0.5, 30), 0.6);
  };
}

/**
 * A part has reached the can's colour: a soft glossy shimmer, two pure notes swelling in a major
 * third apart (G6, then B6: the key of the cleaning chimes, above the ding), light sliding over the
 * new coat, a few glints (~0.6 s). Softer than the ding, no strike: a coat drying to a shine.
 */
function paintDone(): Recipe {
  return (sr, rng) => {
    const len = 0.62;
    const x = S(sr, len);
    const G6 = 1567.98;
    const B6 = 1975.53;
    // (the notes the same every time, phases fixed: only the sheen and the glints differ)
    bellInto(x, sr, 0, G6, 0.8, 0.2, 3.5, rng, 0.02, 0.25, 0);
    bellInto(x, sr, 0, G6 * 2, 0.1, 0.07, 0, rng, 0.015, 0.38, 0);
    bellInto(x, sr, 0.085, B6, 1, 0.24, 4.2, rng, 0.02, 0.25, 0);
    bellInto(x, sr, 0.085, B6 * 2, 0.08, 0.07, 0, rng, 0.015, 0.38, 0);
    // the sheen: a breath of air sliding up over the gloss
    const m = Math.floor(0.3 * sr);
    const sw = sweptBand(noise(m, rng), sr, (tt) => 2500 + 6500 * Math.min(1, tt / 0.3), 4);
    for (let i = 0; i < m; i++) sw[i] *= Math.pow(Math.sin((Math.PI * i) / m), 2);
    mixInto(x, sw, Math.floor(rng.range(0.03, 0.05) * sr), 0.15);
    // glints
    let gt = rng.range(0.09, 0.12);
    for (const h of [3, 4, 5, 6]) {
      ring(x, sr, Math.floor(gt * sr), G6 * h * (1 + 0.002 * rng.gauss()), rng.range(0.03, 0.05) * (1 - 0.12 * (h - 3)), rng.range(0.025, 0.045), rng.range(0, 6.283));
      gt += rng.range(0.022, 0.034);
    }
    for (let i = Math.floor(0.45 * sr); i < x.length; i++) x[i] *= Math.max(0, 1 - (i / sr - 0.45) / 0.17);
    return normalize(edges(x, sr, 1, 20), 0.6);
  };
}

// ------------------------------------------------------------------ tyres and wrecks: a blowout, a flat, a bare rim, a wreck forced open, the find, something rare near

/** pink noise (3 dB an octave down, Kellet's sum of one-pole filters): the same shape at any playback rate, only its ends moving */
function pinkInto(w: Float32Array): Float32Array {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < w.length; i++) {
    const x = w[i];
    b0 = 0.99886 * b0 + x * 0.0555179;
    b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856;
    b4 = 0.55 * b4 + x * 0.5329522;
    b5 = -0.7616 * b5 - x * 0.016898;
    w[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
    b6 = x * 0.115926;
  }
  return w;
}
const pink = (n: number, rng: Rng): Float32Array => pinkInto(noise(n, rng));
/** n samples of pink noise that wrap: made over two turns of the same white noise, the second kept */
function loopPink(n: number, rng: Rng): Float32Array {
  const w = noise(n, rng);
  const y = new Float32Array(2 * n);
  y.set(w, 0);
  y.set(w, n);
  return pinkInto(y).slice(n);
}
/** a pink burst added into x at `at` s: attack, then an exponential decay */
function pinkBurstInto(x: Float32Array, sr: number, at: number, len: number, amp: number, attack: number, decay: number, rng: Rng, filters: Array<[BiquadKind, number, number?]> = []): void {
  const n = Math.max(1, Math.floor(len * sr));
  const b = pink(n, rng);
  for (const [kind, f, q] of filters) biquad(b, sr, kind, f, q ?? 0.707);
  const na = Math.max(1, Math.floor(attack * sr));
  for (let i = 0; i < n; i++) b[i] *= i < na ? i / na : Math.exp(-(i - na) / (decay * sr));
  mixInto(x, b, Math.floor(at * sr), amp);
}

/**
 * A tyre blowing out under a moving car, heard from the seat: the bang (a hard pressure crack and
 * the car's body booming with it), the air roaring out of the split for half a second, falling as the
 * pressure goes, the torn rubber slapping the road and the arch, bits of it rattling in the arch (~0.9 s)
 */
function tyreBurst(): Recipe {
  return (sr, rng) => {
    const len = 0.9;
    const x = S(sr, len);
    // the crack: an N-wave of the pressure released at once, and the broadband of it
    const a = 0;
    const up = Math.max(2, Math.floor(rng.range(0.0003, 0.0005) * sr));
    const down = Math.floor(up * rng.range(1.3, 1.8));
    for (let i = 0; i < up; i++) x[a + i] += 1.6 * Math.sin((Math.PI * i) / up);
    for (let i = 0; i < down; i++) x[a + up + i] -= 1.1 * Math.sin((Math.PI * i) / down);
    burst(x, sr, a, 0.02, 2.2, rng, { attack: 0.0001, decay: rng.range(0.004, 0.008), filter: [['highpass', 300], ['lowpass', 11000]] });
    // the rubber splitting open after it: a quick tearing crackle
    for (let k = 0, t = rng.range(0.008, 0.015); k < 20 + Math.floor(rng.next() * 20); k++) {
      grainInto(x, sr, t, 0.5 * rng.range(0.3, 1) * (1 - k / 45), rng.range(0.0001, 0.0004), rng);
      t += rng.range(0.0003, 0.0012);
    }
    // the body booming from under the arch
    thudInto(x, sr, 0, rng, 1.2, rng.range(70, 90), 0.05);
    ring(x, sr, 0, rng.range(48, 56), 0.45, 0.09);
    strike(x, sr, 0, panelModes(1.6, 1.2), 0.3, rng, 0.04);
    // the air roaring out, falling as the pressure goes
    const m = Math.floor(rng.range(0.5, 0.6) * sr);
    const f0 = rng.range(5000, 6500);
    const air = sweptBand(noise(m, rng), sr, (t) => 900 + (f0 - 900) * Math.exp(-t / 0.15), 0.9);
    const fl = wander(rng, Math.round((m / sr) * 60), 0.55, 1);
    for (let i = 0; i < m; i++) {
      const t = i / sr;
      air[i] *= Math.min(1, t / 0.003) * Math.exp(-t / rng.range(0.13, 0.17)) * fl(i / m);
    }
    mixInto(x, air, Math.floor(0.004 * sr), 0.65);
    // the torn rubber slapping the road and the arch, once or twice, then flapping smaller
    let st = rng.range(0.045, 0.08);
    for (let k = 0; k < 2 + Math.floor(rng.next() * 3); k++) {
      const g = k === 0 ? 1 : rng.range(0.25, 0.55) / k;
      pinkBurstInto(x, sr, st, 0.06, 0.9 * g, 0.001, rng.range(0.012, 0.02), rng, [['lowpass', 1800], ['highpass', 60]]);
      thudInto(x, sr, st, rng, 0.35 * g, rng.range(100, 140), 0.012);
      st += rng.range(0.07, 0.14);
    }
    // bits of it rattling in the arch
    for (let k = 0; k < 4 + Math.floor(rng.next() * 4); k++) strike(x, sr, Math.floor(rng.range(0.03, 0.35) * sr), [[rng.range(900, 2400), 1, 0.006], [rng.range(2500, 4500), 0.5, 0.004]], 0.08 * rng.range(0.4, 1), rng);
    // heard from the seat: the body dulls its top
    biquad(x, sr, 'lowpass', 9000, 0.7);
    return normalize(saturate(edges(x, sr, 0.3, 40), 1.8), 0.95);
  };
}

/**
 * Driving on a flat tyre: once a sixth of a second at rate 1 (about 30 km/h) the collapsed part of
 * it comes round and thwacks the road, and the loose rubber flaps against the arch just after; a
 * rumble of the deflated tyre under it, swelling with each turn. Made of pink noise, which keeps its
 * shape however fast it is played: from rate 0.3 to 3 the slaps keep their character, only their
 * pace and length change. Seamless: eighteen slaps in three seconds.
 */
function flatFlap(): Recipe {
  return (sr, rng) => {
    const slaps = 18;
    const T = 1 / 6;
    const len = slaps * T;
    const n = Math.floor(len * sr);
    const events = cyclic(sr, len, (x) => {
      // (half a turn into the loop: its wrap falls between two slaps, the rubber in the air)
      for (let k = 0; k < slaps; k++) {
        const t = (k + 0.5) * T + rng.range(-0.002, 0.002);
        const a = rng.range(0.85, 1.15) * (rng.next() < 0.1 ? 1.3 : 1);
        // the thwack on the road: a slap and the rubber's body, a thump through the wheel
        burst(x, sr, Math.floor(t * sr), 0.002, 0.45 * a, rng, { attack: 0.0001, decay: 0.0006, filter: [['highpass', 500], ['lowpass', 6000]] });
        pinkBurstInto(x, sr, t, 0.1, a, 0.001, rng.range(0.018, 0.028), rng, [['highpass', 60], ['lowpass', 5000]]);
        thudInto(x, sr, t, rng, 0.45 * a, rng.range(90, 130), 0.012);
        // the loose rubber flapping on the arch just after (sometimes not, sometimes twice)
        const r = rng.next();
        if (r > 0.15) {
          const ft = t + T * rng.range(0.35, 0.45);
          pinkBurstInto(x, sr, ft, 0.05, 0.35 * a, 0.001, rng.range(0.008, 0.012), rng, [['highpass', 300], ['lowpass', 5000]]);
          if (r > 0.85) pinkBurstInto(x, sr, ft + rng.range(0.018, 0.03), 0.04, 0.18 * a, 0.001, 0.008, rng, [['highpass', 300], ['lowpass', 5000]]);
        }
      }
    });
    tame(events, 15);
    // the deflated tyre rolling: a rumble swelling at each turn, and its sidewall scrubbing
    const rumble = loopFilter(loopPink(n, rng), sr, [['lowpass', 350, 0.7], ['highpass', 30, 0.7]]);
    const scrub = loopFilter(loopPink(n, rng), sr, [['bandpass', 700, 0.7]]);
    const [re, rr, rs] = [rmsOf(events), rmsOf(rumble), rmsOf(scrub)];
    const out = new Float32Array(n);
    // (the swell from each slap on, counted in samples: no stray step where a float lands a hair short of a turn)
    const per = Math.round(sr * T);
    for (let i = 0; i < n; i++) {
      const ph = ((i + (per >> 1)) % per) / per;
      const turn = 0.6 + 0.4 * Math.exp(-ph / 0.25);
      out[i] = events[i] / re + (0.35 * rumble[i] * turn) / rr + (0.12 * scrub[i] * turn) / rs;
    }
    // (nothing high enough to fold back when played three times as fast)
    return normalize(centre(loopFilter(out, sr, [['lowpass', 6000, 0.7], ['lowpass', 6500, 0.7], ['highpass', 30, 0.7]])), 0.5);
  };
}

/**
 * A bare rim on the road: steel grinding on asphalt (a harsh, rough grind, the flange squealing now
 * and then), sparks and grit crackling, the rim knocking once a turn where it is bent, a roar through
 * the hub. Seamless.
 */
function rimGrind(): Recipe {
  return (sr, rng) => {
    const turns = 20;
    const T = 1 / 6;
    const len = turns * T;
    const n = Math.floor(len * sr);
    // the grind rasps: the rim catching and skidding on the stones, fifty to a hundred and fifty times a second
    const rough = wander(rng, Math.round(len * 90), 0, 1);
    const rough2 = wander(rng, Math.round(len * 260), 0.3, 1);
    const press = wander(rng, 9, 0.7, 1);
    const grind = loopFilter(noise(n, rng), sr, [['bandpass', 1800, 0.6], ['peaking', 3200, 1, 5], ['lowpass', 6000, 0.7]]);
    const grit = loopFilter(cyclic(sr, len, (x) => scatter(rng, len, 2500, (t) => press(t / len), (t) => grainInto(x, sr, t, powerLaw(rng, 0.2, 2), rng.range(0.00008, 0.0003), rng))), sr, [['highpass', 2500, 0.7], ['lowpass', 6000, 0.7]]);
    tame(grit, 13);
    // sparks: bigger, brighter specks flying off
    const sparks = loopFilter(cyclic(sr, len, (x) => scatter(rng, len, 260, (t) => press(t / len), (t) => grainInto(x, sr, t, powerLaw(rng, 0.3, 1.6), rng.range(0.0002, 0.0006), rng))), sr, [['bandpass', 4200, 0.9], ['lowpass', 6000, 0.7]]);
    tame(sparks, 14);
    const ev = cyclic(sr, len, (x) => {
      // the flange squealing on the road now and then
      scatter(rng, len, 2.2, (t) => press(t / len), (t) => squealInto(x, sr, t, rng.range(0.08, 0.3), rng.range(1800, 3000), rng.range(0.5, 1), rng, { bright: 0.7, waver: 0.03, glide: 0.1, grip: 0.5, jitter: 0.02 }));
      // the knock of the bent rim, once a turn
      for (let k = 0; k < turns; k++) strike(x, sr, Math.floor((k * T + rng.range(-0.003, 0.003)) * sr), metalModes(rng.range(450, 700), 0.025), rng.range(0.5, 1), rng, 0.03);
    });
    const roar = loopFilter(noise(n, rng), sr, [['lowpass', 250, 0.7], ['highpass', 35, 0.7]]);
    const [rg, rk, re, rr, rs] = [rmsOf(grind), rmsOf(grit), rmsOf(ev), rmsOf(roar), rmsOf(sparks)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const ph = ((i / sr) % T) / T;
      const turn = 0.8 + 0.2 * Math.cos(2 * Math.PI * ph);
      out[i] = ((grind[i] / rg) * (0.1 + 0.9 * rough(u) ** 2) * rough2(u) + (0.7 * grit[i]) / rk + (0.55 * sparks[i]) / rs) * press(u) * turn + (0.35 * ev[i]) / re + (0.4 * roar[i]) / rr;
    }
    return normalize(settle(centre(loopFilter(saturate(normalize(out, 1), 1.3), sr, [['lowpass', 6500, 0.7]])), sr), 0.5);
  };
}

/**
 * A rusted wreck's door or bonnet forced open: the seized hinge groaning low under the strain,
 * grinding, then the rust letting go with a crack (the panel jumping free and ringing, flakes
 * falling), the hinge groaning on higher as it swings (~1 s)
 */
function wreckCreak(): Recipe {
  return (sr, rng) => {
    const len = rng.range(0.95, 1.15);
    const x = S(sr, len);
    const crack = rng.range(0.3, 0.42);
    // the strain: a low groan building, the rust grinding in the hinge
    squealInto(x, sr, 0.01, crack, rng.range(110, 170), 0.5, rng, { bright: 0.95, waver: 0.06, glide: 0.25, grip: 0.65, jitter: 0.04 });
    for (let i = 0; i < Math.floor(crack * sr); i++) x[i] *= Math.min(1, (i / sr / crack) * 1.4);
    creakInto(x, sr, 0.02, crack - 0.02, rng, 0.25, false);
    // the crack: the rust letting go, the panel jumping free and ringing, a ping of the hinge pin
    const c = Math.floor(crack * sr);
    burst(x, sr, c, 0.004, 1.4, rng, { attack: 0.0001, decay: 0.0009, filter: [['highpass', 500], ['lowpass', 10000]] });
    strike(x, sr, c, panelModes(1.2, 1.0), 0.55, rng, 0.03);
    strike(x, sr, c, metalModes(rng.range(900, 1500), 0.05), 0.3, rng, 0.03);
    thudInto(x, sr, crack, rng, 0.5, 120, 0.015);
    // flakes of rust falling off it
    for (let k = 0; k < 6 + Math.floor(rng.next() * 6); k++) {
      const t = crack + 0.02 + 0.35 * Math.pow(rng.next(), 1.4);
      strike(x, sr, Math.floor(t * sr), [[rng.range(3500, 7000), 1, rng.range(0.0008, 0.0018)]], 0.12 * rng.range(0.3, 1), rng);
    }
    // the swing: the hinge groaning on, higher, as it goes
    const sw = crack + rng.range(0.02, 0.05);
    squealInto(x, sr, sw, len - sw - 0.04, rng.range(260, 420), 0.35, rng, { bright: 0.75, waver: 0.05, glide: 0.3, grip: 0.4, jitter: 0.025 });
    creakInto(x, sr, sw, Math.min(0.45, len - sw - 0.05), rng, 0.08, true);
    return normalize(saturate(edges(x, sr, 1, 60), 1.3), 0.8);
  };
}

const NOTE = { G4: 392, G5: 783.99, B5: 987.77, D6: 1174.66, G6: 1567.98, A6: 1760, B6: 1975.53, D7: 2349.32, E7: 2637.02, G7: 3135.96 };

/** a sting's note: a warm bell (harmonic partials, gently beating), the same every time */
function stingNote(x: Float32Array, sr: number, at: number, f: number, amp: number, rng: Rng, decay = 0.32): void {
  bellInto(x, sr, at, f, amp, decay, 2.4, rng, 0.0025, 0.22, 0);
  bellInto(x, sr, at, f * 2, 0.32 * amp, decay * 0.45, 3.6, rng, 0.002, 0.3, 0);
  bellInto(x, sr, at, f * 3, 0.1 * amp, decay * 0.2, 5, rng, 0.002, 0.3, 0);
}

/**
 * A wreck's bonnet up on something good: a short warm sting rising in G major. Tier 1-2 two notes
 * (D6, G6), tier 3 three (B5, D6, G6) over a soft pad, tier 4-5 a fourth higher still (B6), a golden
 * low bloom and a tail of shimmer (5 the longest, a last D7 glint) (~0.6-0.95 s)
 */
function lootReveal(tier: number): Recipe {
  return (sr, rng) => {
    const t = tierOf(tier);
    const golden = t >= 4;
    const len = t <= 2 ? 0.6 : t === 3 ? 0.72 : t === 4 ? 0.85 : 0.95;
    const x = S(sr, len);
    const notes = t <= 2 ? [NOTE.D6, NOTE.G6] : golden ? [NOTE.B5, NOTE.D6, NOTE.G6, NOTE.B6] : [NOTE.B5, NOTE.D6, NOTE.G6];
    const step = 0.07;
    notes.forEach((f, k) => stingNote(x, sr, k * step, f, 0.7 + (0.3 * k) / Math.max(1, notes.length - 1), rng, k === notes.length - 1 ? 0.38 : 0.22));
    const last = (notes.length - 1) * step;
    // the pad under the last note: warmth (a sine pair a hair apart, swelling in)
    if (t >= 2) for (const [f, a] of (golden ? [[NOTE.G5, 0.16], [NOTE.B5, 0.1], [NOTE.D6, 0.08]] : [[NOTE.G5, 0.12], [NOTE.D6, 0.06]]) as Array<[number, number]>) bellInto(x, sr, last - 0.02, f, a, 0.35, f * 0.004, rng, 0.04, 0.5, 0);
    if (golden) {
      // the golden bloom: a low G under it all
      bellInto(x, sr, last, NOTE.G4, t === 5 ? 0.22 : 0.16, 0.3, 0.8, rng, 0.03, 0.3, 0);
      // and the shimmer tail: glints up the pentatonic, thinning out
      const pent = [NOTE.G6, NOTE.A6, NOTE.B6, NOTE.D7, NOTE.E7, NOTE.G7];
      const count = t === 5 ? 14 : 9;
      for (let k = 0; k < count; k++) {
        const gt = last + 0.04 + (t === 5 ? 0.6 : 0.45) * Math.pow(k / count, 1.2) + rng.range(0, 0.02);
        bellInto(x, sr, gt, pent[Math.floor(rng.next() * pent.length)] * 2, 0.05 * (1 - (0.6 * k) / count), rng.range(0.05, 0.1), 0, rng, 0.003, 0.38, 0);
      }
      if (t === 5) bellInto(x, sr, last + 0.18, NOTE.D7, 0.18, 0.2, 3, rng, 0.004, 0.3, 0);
    }
    for (let i = Math.floor((len - 0.18) * sr); i < x.length; i++) x[i] *= Math.max(0, 1 - (i / sr - (len - 0.18)) / 0.18);
    // fuller with the tier: a small find is quieter than a golden one
    return normalize(edges(x, sr, 1, 20), [0.5, 0.56, 0.62, 0.68, 0.72][t - 1]);
  };
}

/**
 * Something rare lying near (a 4 or 5 star part): a very faint high shimmer, soft glints on the G
 * major pentatonic two octaves up drifting in and out, fine sparkle dust, a breath of air. Nothing
 * sharp, nothing that clashes; a few metres off it is gone (the game's gain). Seamless.
 */
function rareGlint(): Recipe {
  return (sr, rng) => {
    const len = 3.8;
    const n = Math.floor(len * sr);
    const pent = [NOTE.G6, NOTE.A6, NOTE.B6, NOTE.D7, NOTE.E7, NOTE.G7];
    const ev = cyclic(sr, len, (x) => {
      scatter(rng, len, 4, () => 1, (t) => {
        const f = pent[Math.floor(rng.next() * pent.length)];
        const a = powerLaw(rng, 0.25, 1.6);
        bellInto(x, sr, t, f, a, rng.range(0.06, 0.16), rng.range(3, 6), rng, rng.range(0.005, 0.01), 0.3);
        bellInto(x, sr, t, f * 2, 0.2 * a, rng.range(0.03, 0.06), 0, rng, 0.004, 0.38);
      });
      scatter(rng, len, 22, () => 1, (t) => ring(x, sr, Math.floor(t * sr), rng.range(6000, 10000), 0.1 * rng.range(0.2, 1), rng.range(0.003, 0.008), rng.range(0, 6.283)));
    });
    const breath = wander(rng, 7, 0.3, 1);
    const air = loopFilter(noise(n, rng), sr, [['bandpass', 7000, 2]]);
    const [re, ra] = [rmsOf(ev), rmsOf(air)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = ev[i] / re + (0.18 * air[i] * breath(i / n)) / ra;
    return normalize(settle(centre(loopFilter(out, sr, [['lowpass', 12000, 0.7]])), sr), 0.4);
  };
}

// ------------------------------------------------------------------ roadside places: containers searched by hand, a house's and a shop's door, a filling station's pump

const CONTAINERS: readonly string[] = ['wood', 'crate', 'metal', 'cloth', 'card'];

/** a container's material from FoleyOpts.material: a container's, else (a door's, or none) a wooden cupboard's */
function containerOf(m: FoleyOpts['material']): ContainerMaterial {
  return m !== undefined && CONTAINERS.includes(m) ? (m as ContainerMaterial) : 'wood';
}

/** the strongly damped, inharmonic modes of a piece of wood knocked (a shelf, a drawer's side, a board) round f0 */
function woodModes(f0: number, decay: number): Array<[number, number, number]> {
  return [[f0, 1, decay], [f0 * 2.26, 0.55, decay * 0.6], [f0 * 3.71, 0.32, decay * 0.42], [f0 * 5.3, 0.16, decay * 0.3]];
}

/** a food tin's thin shell, damped by what is in it (scaled by its size) */
function tinModes(size: number): Array<[number, number, number]> {
  return [[1240, 1, 0.012], [1810, 0.75, 0.01], [2530, 0.6, 0.008], [3370, 0.4, 0.006], [4420, 0.25, 0.005]].map(([f, g, d]) => [f / size, g, d * size] as [number, number, number]);
}

/** something set down or knocked inside a container: the touch (a click of noise round `touch` Hz) and the ringing of what was struck */
function knockInto(x: Float32Array, sr: number, at: number, amp: number, rng: Rng, modes: ReadonlyArray<readonly [number, number, number]>, touch: number): void {
  const a = Math.max(0, Math.floor(at * sr));
  burst(x, sr, a, 0.003, 0.45 * amp, rng, { attack: 0.0001, decay: 0.0006, filter: [['bandpass', touch, 1.2]] });
  strike(x, sr, a, modes, amp, rng, 0.03);
}

/** something slid or rubbed for len s from `at`: noise between lo and hi Hz, swelling in and out, roughened (`rough` 0..1) by its grain catching */
function rubInto(x: Float32Array, sr: number, at: number, len: number, amp: number, rng: Rng, lo: number, hi: number, rough = 0.5): void {
  const n = Math.max(2, Math.floor(len * sr));
  const b = noise(n, rng);
  biquad(b, sr, 'highpass', lo, 0.7);
  biquad(b, sr, 'lowpass', hi, 0.7);
  // its grain: the level catching and letting go, the faster the rougher
  const g = wander(rng, Math.max(3, Math.round(len * (40 + 160 * rough))), 1 - 0.9 * rough, 1);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    b[i] *= Math.pow(Math.sin(Math.PI * u), 0.8) * g(u);
  }
  mixInto(x, b, Math.floor(at * sr), amp);
}

/** a crackle for len s from `at` (paper, a wrapper, straw): grains at `rate` a second, swelling in and out, coloured between lo and hi Hz */
function crackleInto(x: Float32Array, sr: number, at: number, len: number, amp: number, rate: number, rng: Rng, lo: number, hi: number): void {
  const b = new Float32Array(Math.max(2, Math.floor((len + 0.01) * sr)));
  scatter(rng, len, rate, (t) => Math.sqrt(Math.sin(Math.PI * Math.min(1, t / len))), (t) => grainInto(b, sr, t, powerLaw(rng, 0.2, 1.8), rng.range(0.0001, 0.0006), rng));
  biquad(b, sr, 'highpass', lo, 0.7);
  biquad(b, sr, 'lowpass', hi, 0.7);
  mixInto(x, b, Math.floor(at * sr), amp);
}

/** small hard things shaken together (screws in a tray, pasta in its box): `count` tiny clicks over len s, ringing a little if `ringy` (s) */
function jingleInto(x: Float32Array, sr: number, at: number, len: number, amp: number, count: number, rng: Rng, lo: number, hi: number, ringy = 0): void {
  for (let k = 0; k < count; k++) {
    const t = at + len * Math.pow(rng.next(), 0.8);
    const f = rng.range(lo, hi);
    if (ringy > 0) strike(x, sr, Math.floor(t * sr), [[f, 1, ringy], [f * 1.6, 0.4, ringy * 0.6]], amp * rng.range(0.3, 1), rng, 0.05);
    else burst(x, sr, Math.floor(t * sr), 0.002, amp * rng.range(0.3, 1), rng, { attack: 0.0001, decay: 0.0004, filter: [['bandpass', f, 2]] });
  }
}

/** one move of a hand searching a container (a thing picked up, slid, shuffled, knocked), from `at` at strength a, by what the container holds */
function gestureInto(x: Float32Array, sr: number, at: number, a: number, m: ContainerMaterial, rng: Rng): void {
  const r = rng.next();
  if (m === 'wood') {
    // a cupboard or a desk: things lifted and set down on its shelves, slid, papers, the odd jar
    if (r < 0.35) {
      knockInto(x, sr, at, 0.6 * a, rng, woodModes(rng.range(380, 820), rng.range(0.008, 0.016)), rng.range(1500, 3500));
      if (rng.next() < 0.5) knockInto(x, sr, at + rng.range(0.04, 0.1), 0.25 * a, rng, woodModes(rng.range(380, 820), 0.01), 2500);
    } else if (r < 0.6) {
      const d = rng.range(0.08, 0.22);
      rubInto(x, sr, at, d, 0.35 * a, rng, 500, 2600, 0.6);
      knockInto(x, sr, at + d * 0.9, 0.2 * a, rng, woodModes(rng.range(450, 900), 0.008), 2000);
    } else if (r < 0.8) {
      const d = rng.range(0.1, 0.25);
      crackleInto(x, sr, at, d, 0.5 * a, 900, rng, 1500, 7000);
      rubInto(x, sr, at, d, 0.15 * a, rng, 1500, 6000, 0.4);
    } else if (r < 0.92) {
      // the hand bumping the cupboard's side: the box itself, low
      thudInto(x, sr, at, rng, 0.15 * a, rng.range(150, 230), 0.012);
      strike(x, sr, Math.floor(at * sr), woodModes(rng.range(200, 320), 0.02), 0.35 * a, rng);
    } else {
      const f = rng.range(1800, 3200);
      knockInto(x, sr, at, 0.35 * a, rng, [[f, 1, 0.03], [f * 2.7, 0.4, 0.015], [f * 5.1, 0.15, 0.008]], 5000);
    }
  } else if (m === 'crate') {
    // a crate: heavier things shifted on rough boards, straw or wood wool, a bottle
    if (r < 0.35) {
      knockInto(x, sr, at, 0.6 * a, rng, woodModes(rng.range(230, 480), 0.014), rng.range(1000, 2500));
      thudInto(x, sr, at, rng, 0.12 * a, rng.range(110, 160), 0.015);
    } else if (r < 0.6) {
      const d = rng.range(0.15, 0.35);
      crackleInto(x, sr, at, d, 0.8 * a, 1400, rng, 1200, 6500);
      rubInto(x, sr, at, d, 0.2 * a, rng, 300, 2500, 0.8);
    } else if (r < 0.85) {
      rubInto(x, sr, at, rng.range(0.1, 0.25), 0.45 * a, rng, 400, 2200, 0.9);
    } else {
      const f = rng.range(1500, 2600);
      knockInto(x, sr, at, 0.35 * a, rng, [[f, 1, 0.03], [f * 2.6, 0.45, 0.014], [f * 4.9, 0.15, 0.007]], 4500);
    }
  } else if (m === 'metal') {
    // a toolbox, a cabinet, a shelf: tools clinking, screws rattling, a tool slid in its tray, the steel box ringing
    if (r < 0.35) {
      knockInto(x, sr, at, 0.5 * a, rng, metalModes(rng.range(1100, 2600), rng.range(0.02, 0.05)), 4000);
      if (rng.next() < 0.6) knockInto(x, sr, at + rng.range(0.03, 0.09), 0.3 * a, rng, metalModes(rng.range(1100, 2600), 0.03), 4000);
    } else if (r < 0.55) {
      jingleInto(x, sr, at, rng.range(0.05, 0.12), 0.35 * a, 6 + Math.floor(rng.next() * 8), rng, 2500, 6500, 0.004);
    } else if (r < 0.75) {
      rubInto(x, sr, at, rng.range(0.08, 0.2), 0.3 * a, rng, 1500, 6000, 0.7);
    } else {
      strike(x, sr, Math.floor(at * sr), panelModes(rng.range(0.45, 0.7), 2.5), 0.12 * a, rng);
      thudInto(x, sr, at, rng, 0.15 * a, 220, 0.012);
      knockInto(x, sr, at, 0.3 * a, rng, metalModes(rng.range(600, 1000), 0.03), 3000);
    }
  } else if (m === 'cloth') {
    // clothes or a bag: fabric pushed aside, hangers clicking along their rail, nylon crumpled, a buckle
    if (r < 0.45) {
      rubInto(x, sr, at, rng.range(0.15, 0.4), 0.6 * a, rng, 200, 2600, 0.15);
    } else if (r < 0.7) {
      let t = at;
      for (let k = 0; k < 1 + Math.floor(rng.next() * 3); k++) {
        knockInto(x, sr, t, 0.3 * a, rng, woodModes(rng.range(900, 1600), 0.006), 3000);
        t += rng.range(0.03, 0.07);
      }
      rubInto(x, sr, at, rng.range(0.05, 0.1), 0.15 * a, rng, 2000, 7000, 0.8);
    } else if (r < 0.85) {
      const d = rng.range(0.1, 0.25);
      crackleInto(x, sr, at, d, 0.35 * a, 600, rng, 1500, 6000);
      rubInto(x, sr, at, d, 0.25 * a, rng, 400, 3000, 0.3);
    } else {
      const f = rng.range(2600, 4200);
      knockInto(x, sr, at, 0.25 * a, rng, [[f, 1, 0.012], [f * 1.7, 0.4, 0.007]], 5000);
    }
  } else {
    // a shop's shelf: packets slid and knocked, wrappers crinkled, tins knocking together, a box with something in it
    if (r < 0.35) {
      const d = rng.range(0.08, 0.2);
      rubInto(x, sr, at, d, 0.45 * a, rng, 1200, 6000, 0.5);
      knockInto(x, sr, at + d * 0.9, 0.35 * a, rng, woodModes(rng.range(450, 900), 0.006), 2500);
    } else if (r < 0.55) {
      crackleInto(x, sr, at, rng.range(0.08, 0.2), 0.45 * a, 1500, rng, 2500, 8000);
    } else if (r < 0.8) {
      const s = rng.range(0.85, 1.2);
      knockInto(x, sr, at, 0.45 * a, rng, tinModes(s), 4000);
      if (rng.next() < 0.6) knockInto(x, sr, at + rng.range(0.02, 0.06), 0.3 * a, rng, tinModes(s * rng.range(0.95, 1.08)), 4000);
    } else {
      const d = rng.range(0.08, 0.16);
      jingleInto(x, sr, at, d, 0.3 * a, 14 + Math.floor(rng.next() * 14), rng, 2000, 6000);
      rubInto(x, sr, at, d, 0.15 * a, rng, 1200, 5000, 0.5);
    }
  }
}

/** the hand brushing over what is in the container all the time under its moves (a pause between two is never dead): [its band, how much of it] */
const RUMMAGE_BED: Record<ContainerMaterial, [Array<[BiquadKind, number, number?, number?]>, number]> = {
  wood: [[['bandpass', 1400, 0.7]], 0.55],
  crate: [[['bandpass', 2200, 0.6]], 0.6],
  metal: [[['bandpass', 3000, 0.8]], 0.55],
  cloth: [[['lowpass', 1600, 0.7], ['highpass', 180, 0.7]], 0.55],
  card: [[['bandpass', 3500, 0.7]], 0.55],
};
/** each container's loop peak, so that at the one level they sit about as loud as one another */
const RUMMAGE_PEAK: Record<ContainerMaterial, number> = { wood: 0.575, crate: 0.5, metal: 0.37, cloth: 0.28, card: 0.41 };

/**
 * Hands going through a container while E is held: a calm search (rate 1), a thing moved about three
 * times a second (never quite evenly, now and then two at once), a little lighter or busier by turns,
 * the hand brushing over what is there all the time; by what the container is and holds: a cupboard or a desk (`wood`: things knocked and slid on
 * its shelves, papers, a jar), a crate (heavier things shifted on rough boards, straw), a toolbox or a
 * cabinet (`metal`: spanners clinking, screws rattling, the steel box ringing), clothes or a bag
 * (`cloth`: fabric swishing, hangers clicking along their rail, a buckle), a shop's shelf (`card`:
 * packets slid and crinkled, tins knocking, a box with something rattling in it). Seamless.
 */
function rummage(m: ContainerMaterial): Recipe {
  return (sr, rng) => {
    const len = 3.4;
    const n = Math.floor(len * sr);
    // (a move every third of a second or so, not at random: a search of 0.8 s started anywhere in the loop has two or three in it)
    const busy = wander(rng, 8, 0.6, 1);
    const moves = Math.round(len * 3);
    const ev = tame(cyclic(sr, len, (x) => {
      for (let k = 0; k < moves; k++) {
        const t = ((k + 0.5 + rng.range(-0.22, 0.22)) * len) / moves;
        const d = busy(t / len);
        gestureInto(x, sr, t, d * rng.range(0.7, 1), m, rng);
        if (rng.next() < 0.15) gestureInto(x, sr, t + rng.range(0.08, 0.15), 0.6 * d * rng.range(0.7, 1), m, rng);
      }
    }), 14);
    const [bands, amount] = RUMMAGE_BED[m];
    const bed = loopFilter(noise(n, rng), sr, bands);
    const tex = wander(rng, Math.round(len * 18), 0.45, 1);
    const [re, rb] = [rmsOf(ev), rmsOf(bed)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = ev[i] / re + (amount * bed[i] * busy(i / n) * tex(i / n)) / rb;
    return normalize(settle(centre(loopFilter(out, sr, [['highpass', 50, 0.7], ['lowpass', 11000, 0.7]])), sr), RUMMAGE_PEAK[m]);
  };
}

/** each container's opening and its empty knock: their peaks, so that they sit where they should against one another */
const OPEN_PEAK: Record<ContainerMaterial, number> = { wood: 0.75, crate: 0.4, metal: 0.55, cloth: 0.25, card: 0.32 };
const EMPTY_PEAK: Record<ContainerMaterial, number> = { wood: 0.53, crate: 0.5, metal: 0.39, cloth: 0.29, card: 0.55 };

/**
 * The start of a search (E pressed on a container), by what it is: a cupboard door's magnetic catch,
 * the door swinging out on a small dry hinge, perhaps knocking the next one (`wood`); a crate's lid
 * prised up, its nails squealing out of the wood, a crack, the lid set down against the side
 * (`crate`); a toolbox's two clasps snapped and its lid falling back on its stay, or a steel drawer
 * rolling out on its runners to its stop (`metal`, either); a bag's zip (`cloth`); the packets on a
 * shop's shelf shuffled, a wrapper, a tin (`card`) (~0.4-0.9 s)
 */
function containerOpen(m: ContainerMaterial): Recipe {
  return (sr, rng) => {
    if (m === 'crate') {
      const x = S(sr, 0.9);
      // the first nail squealing out under the bar, the wood creaking with it
      const f = rng.range(700, 1100);
      squealInto(x, sr, 0, rng.range(0.14, 0.22), f, 0.35, rng, { bright: 0.65, waver: 0.04, glide: 0.35, grip: 0.6, jitter: 0.03 });
      creakInto(x, sr, 0, 0.2, rng, 0.08, false);
      // the board giving with a crack, the second nail
      const c = rng.range(0.18, 0.24);
      for (let k = 0, t = c; k < 6; k++, t += rng.range(0.002, 0.008)) burst(x, sr, Math.floor(t * sr), rng.range(0.002, 0.006), rng.range(0.3, 0.8) * (1 - k / 8), rng, { attack: 0.0001, decay: 0.001, filter: [['bandpass', rng.range(900, 3500), 1.2]] });
      knockInto(x, sr, c, 0.5, rng, woodModes(rng.range(260, 420), 0.012), 1500);
      squealInto(x, sr, c + rng.range(0.06, 0.1), rng.range(0.1, 0.16), f * rng.range(0.85, 1.15), 0.25, rng, { bright: 0.6, waver: 0.05, glide: 0.4, grip: 0.6, jitter: 0.03 });
      // the lid lifted off and set down against the side: a heavy wooden knock, the loose lid rocking
      const d = rng.range(0.6, 0.68);
      thudInto(x, sr, d, rng, 0.6, rng.range(110, 150), 0.02);
      knockInto(x, sr, d, 0.8, rng, woodModes(rng.range(170, 260), 0.02), 1200);
      knockInto(x, sr, d + rng.range(0.05, 0.08), 0.25, rng, woodModes(rng.range(200, 300), 0.015), 1500);
      return normalize(saturate(edges(x, sr, 0.5, 30), 1.2), OPEN_PEAK[m]);
    }
    if (m === 'metal') {
      const x = S(sr, 0.55);
      if (rng.next() < 0.5) {
        // a toolbox: its two clasps snapped open, the lid swung up on a dry hinge and back against its stay
        for (const t of [0, rng.range(0.06, 0.1)]) {
          burst(x, sr, Math.floor(t * sr), 0.003, 0.4, rng, { attack: 0.0001, decay: 0.0006, filter: [['highpass', 1500]] });
          strike(x, sr, Math.floor(t * sr), [[rng.range(2300, 2900), 1, 0.01], [rng.range(3800, 4600), 0.5, 0.006], [rng.range(1300, 1700), 0.3, 0.03]], 0.5, rng);
        }
        creakInto(x, sr, 0.14, 0.15, rng, 0.02, false);
        const s = rng.range(0.3, 0.38);
        knockInto(x, sr, s, 0.7, rng, metalModes(rng.range(450, 750), 0.035), 3000);
        strike(x, sr, Math.floor(s * sr), panelModes(0.55, 2.2), 0.12, rng);
        thudInto(x, sr, s, rng, 0.2, 240, 0.012);
      } else {
        // a steel drawer rolling out on its ball runners to its stop, what is in it shifting
        const d = rng.range(0.18, 0.28);
        rubInto(x, sr, 0, d, 0.35, rng, 900, 4500, 0.95);
        jingleInto(x, sr, 0, d, 0.15, 30, rng, 2500, 6000);
        knockInto(x, sr, d, 0.8, rng, metalModes(rng.range(600, 950), 0.03), 2500);
        strike(x, sr, Math.floor(d * sr), panelModes(0.6, 2.5), 0.15, rng);
        for (let k = 0; k < 2 + Math.floor(rng.next() * 2); k++) knockInto(x, sr, d + rng.range(0.01, 0.08), 0.25, rng, metalModes(rng.range(1400, 2800), 0.02), 4000);
      }
      return normalize(edges(x, sr, 0.5, 30), OPEN_PEAK[m]);
    }
    if (m === 'cloth') {
      // a bag's zip: the slider over the teeth, quickening then easing, the fabric pulled with it, the pull's tag at the end
      const zl = rng.range(0.22, 0.38);
      const x = S(sr, zl + 0.14);
      for (let t = 0.01; t < zl; ) {
        const u = t / zl;
        burst(x, sr, Math.floor(t * sr), 0.0012, 0.35 * Math.sqrt(Math.sin(Math.PI * u)) * rng.range(0.6, 1), rng, { attack: 0.00005, decay: 0.00025, filter: [['bandpass', rng.range(2800, 5500), 2.5]] });
        t += rng.range(0.85, 1.15) / (250 + 450 * Math.pow(Math.sin(Math.PI * u), 0.7));
      }
      rubInto(x, sr, 0, zl + 0.08, 0.25, rng, 250, 3000, 0.2);
      knockInto(x, sr, zl + 0.01, 0.2, rng, [[rng.range(3000, 4200), 1, 0.006]], 6000);
      return normalize(edges(x, sr, 0.5, 30), OPEN_PEAK[m]);
    }
    if (m === 'card') {
      // the packets on the shelf shuffled: two or three slid and knocked, a wrapper crinkling, a tin touched
      const x = S(sr, 0.42);
      let t = 0;
      for (let k = 0; k < 2 + Math.floor(rng.next() * 2); k++) {
        const d = rng.range(0.08, 0.14);
        rubInto(x, sr, t, d, 0.5, rng, 1200, 6000, 0.5);
        knockInto(x, sr, t + d * 0.9, 0.35, rng, woodModes(rng.range(450, 800), 0.006), 2500);
        t += rng.range(0.06, 0.1);
      }
      crackleInto(x, sr, rng.range(0.05, 0.15), rng.range(0.1, 0.18), 0.35, 2000, rng, 2500, 8000);
      knockInto(x, sr, rng.range(0.1, 0.25), 0.3, rng, tinModes(rng.range(0.85, 1.2)), 4000);
      return normalize(edges(x, sr, 0.5, 30), OPEN_PEAK[m]);
    }
    // a cupboard door: its magnetic catch letting go, the door swinging out on a small dry hinge (squeaking sometimes), the next door knocked now and then
    const x = S(sr, 0.55);
    knockInto(x, sr, 0, 0.5, rng, woodModes(rng.range(700, 1000), 0.006), 2500);
    strike(x, sr, 0, [[rng.range(2800, 3600), 1, 0.004]], 0.2, rng);
    thudInto(x, sr, 0.002, rng, 0.15, rng.range(260, 340), 0.01);
    rubInto(x, sr, 0.02, rng.range(0.25, 0.35), 0.12, rng, 150, 700, 0.1);
    creakInto(x, sr, rng.range(0.05, 0.09), rng.range(0.15, 0.22), rng, rng.range(0.02, 0.03), false);
    if (rng.next() < 0.35) squealInto(x, sr, 0.06, rng.range(0.08, 0.15), rng.range(1100, 1700), 0.03, rng, { bright: 0.5, waver: 0.05, glide: 0.2, grip: 0.5 });
    knockInto(x, sr, rng.range(0.3, 0.42), rng.range(0.18, 0.26), rng, woodModes(rng.range(350, 550), 0.01), 1800);
    return normalize(edges(x, sr, 0.5, 30), OPEN_PEAK[m]);
  };
}

/**
 * Nothing in it: a short dry sound, by what it is. A knuckle's hollow knock on the bare drawer and the
 * drawer pushed back shut (`wood`); two hollow knocks on the empty crate's bottom (`crate`); the empty
 * steel box bonking, the drawer rolled back to its clack (`metal`); the empty bag patted flat
 * (`cloth`); a palm on the bare shelf, a scuff (`card`) (~0.3-0.45 s)
 */
function containerEmpty(m: ContainerMaterial): Recipe {
  return (sr, rng) => {
    if (m === 'crate') {
      const x = S(sr, 0.36);
      for (const t of [0, rng.range(0.1, 0.14)]) {
        knockInto(x, sr, t, t === 0 ? 0.8 : 0.6, rng, woodModes(rng.range(170, 260), 0.025), 900);
        ring(x, sr, Math.floor(t * sr), rng.range(110, 150), 0.25, 0.035);
      }
      return normalize(edges(x, sr, 0.5, 30), EMPTY_PEAK[m]);
    }
    if (m === 'metal') {
      const x = S(sr, 0.45);
      knockInto(x, sr, 0, 0.6, rng, metalModes(rng.range(380, 620), 0.04), 1800);
      strike(x, sr, 0, panelModes(0.5, 2), 0.2, rng);
      const d = rng.range(0.13, 0.17);
      rubInto(x, sr, d, 0.12, 0.25, rng, 900, 4500, 0.95);
      knockInto(x, sr, d + 0.12, 0.5, rng, metalModes(rng.range(650, 900), 0.025), 2500);
      return normalize(edges(x, sr, 0.5, 30), EMPTY_PEAK[m]);
    }
    if (m === 'cloth') {
      const x = S(sr, 0.36);
      thudInto(x, sr, 0, rng, 0.6, rng.range(180, 280), 0.012);
      rubInto(x, sr, 0, 0.2, 0.4, rng, 250, 2500, 0.2);
      thudInto(x, sr, rng.range(0.12, 0.18), rng, 0.4, rng.range(180, 280), 0.012);
      return normalize(edges(x, sr, 0.5, 30), EMPTY_PEAK[m]);
    }
    if (m === 'card') {
      const x = S(sr, 0.3);
      const f = rng.range(380, 520);
      knockInto(x, sr, 0, 0.6, rng, [[f, 1, 0.03], [f * 2.4, 0.5, 0.02], [f * 4.1, 0.25, 0.012]], 1000);
      thudInto(x, sr, 0, rng, 0.3, 220, 0.01);
      rubInto(x, sr, 0.04, 0.12, 0.2, rng, 1500, 6000, 0.5);
      return normalize(edges(x, sr, 0.5, 30), EMPTY_PEAK[m]);
    }
    // a knuckle on the bare drawer (once or twice), its hollow, then the drawer pushed back shut
    const x = S(sr, 0.45);
    const raps = rng.next() < 0.5 ? [0] : [0, rng.range(0.08, 0.11)];
    for (const t of raps) {
      knockInto(x, sr, t, t === 0 ? 0.7 : 0.5, rng, woodModes(rng.range(240, 360), 0.018), 1200);
      ring(x, sr, Math.floor(t * sr), rng.range(150, 210), 0.25, 0.03);
    }
    const p = raps[raps.length - 1] + rng.range(0.1, 0.13);
    const d = rng.range(0.1, 0.15);
    rubInto(x, sr, p, d, 0.25, rng, 400, 1800, 0.5);
    thudInto(x, sr, p + d, rng, 0.35, 180, 0.012);
    knockInto(x, sr, p + d, 0.35, rng, woodModes(rng.range(300, 450), 0.012), 1500);
    return normalize(edges(x, sr, 0.5, 30), EMPTY_PEAK[m]);
  };
}

/**
 * A house's wooden door opened: the lever handle pressed down on its spring (a brass click), the
 * latch drawn back in the lock, the door coming off its stop with a soft wooden knock, the air drawn
 * after it, and the hinges: unoiled and squealing long, or dry and creaking, or hardly a sound (~1 s)
 */
function doorHouseOpen(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 1.05);
    const hinge = rng.next();
    strike(x, sr, 0, [[rng.range(1800, 2200), 1, 0.01], [rng.range(3000, 3500), 0.5, 0.007], [rng.range(4700, 5300), 0.25, 0.004]], 0.25, rng);
    burst(x, sr, 0, 0.004, 0.25, rng, { attack: 0.0001, decay: 0.0007, filter: [['highpass', 1500]] });
    const bolt = rng.range(0.03, 0.05);
    latchInto(x, sr, bolt, rng, 0.35, true);
    const off = bolt + rng.range(0.04, 0.07);
    thudInto(x, sr, off, rng, 0.3, rng.range(160, 220), 0.012);
    strike(x, sr, Math.floor(off * sr), woodModes(rng.range(150, 210), 0.025), 0.22, rng);
    rubInto(x, sr, off, rng.range(0.4, 0.6), 0.1, rng, 80, 500, 0.05);
    const h0 = off + rng.range(0.02, 0.06);
    if (hinge < 0.3) squealInto(x, sr, h0, rng.range(0.4, 0.62), rng.range(520, 880), 0.1, rng, { bright: 0.7, waver: 0.06, glide: 0.3, grip: 0.55, jitter: 0.03 });
    // (a creak is a sparse train of slips: it takes a good deal more amplitude than a squeal to be heard as well)
    else if (hinge < 0.65) creakInto(x, sr, h0, rng.range(0.22, 0.38), rng, rng.range(0.12, 0.18), false);
    else creakInto(x, sr, h0, 0.15, rng, 0.02, false);
    return normalize(edges(x, sr, 0.5, 40), 0.6);
  };
}

/** a house's wooden door pulled shut: the air pushed before it, the heavy thud of the door into its frame, the latch bolt snapping home, the door settling, its handle and the letterbox shivering (~0.8 s) */
function doorHouseClose(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.8);
    const hit = rng.range(0.05, 0.07);
    rubInto(x, sr, 0, hit + 0.01, 0.15, rng, 60, 400, 0.05);
    thudInto(x, sr, hit, rng, 1.0, rng.range(110, 150), 0.03);
    burst(x, sr, Math.floor(hit * sr), 0.2, 0.45, rng, { attack: 0.002, decay: 0.04, filter: [['lowpass', 80]] });
    strike(x, sr, Math.floor(hit * sr), woodModes(rng.range(95, 130), 0.045), 0.45, rng);
    strike(x, sr, Math.floor(hit * sr), woodModes(rng.range(330, 470), 0.02), 0.2, rng);
    latchInto(x, sr, hit + rng.range(0.004, 0.01), rng, 0.75, true);
    rattleInto(x, sr, hit + 0.02, rng, 0.07, 5, 0.12, [900, 2400]);
    return normalize(saturate(edges(x, sr, 0.5, 30), 1.3), 0.9);
  };
}

/** the shop's little bell over the door: two small bells on a spring, B6 knocked by the opening door, then G6 as it swings back, soft and round (a slow strike, few overtones), bobbing a little after; the same every time, in G major with the chimes */
function shopBellInto(x: Float32Array, sr: number, at: number, amp: number, rng: Rng): void {
  const note = (t: number, f: number, a: number, beat: number): void => {
    bellInto(x, sr, t, f, a, 0.42, beat, rng, 0.004, 0.25, 0);
    bellInto(x, sr, t, f * 2, 0.22 * a, 0.16, beat * 1.6, rng, 0.003, 0.3, 0);
    bellInto(x, sr, t, f * 3, 0.06 * a, 0.07, 0, rng, 0.003, 0.3, 0);
  };
  note(at, NOTE.B6, amp, 2.3);
  note(at + 0.13, NOTE.G6, 0.85 * amp, 1.9);
  note(at + 0.3, NOTE.B6, 0.22 * amp, 2.3);
  note(at + 0.42, NOTE.G6, 0.12 * amp, 1.9);
}

/** the shop's bell, how loud against the door's clack under it */
const SHOP_BELL = 0.12;

/**
 * A shop's glass-and-aluminium door pushed open: the push bar's hollow clack, the latch letting go,
 * the glass shivering in its frame, the closer's arm stiffening with a soft hydraulic sigh, and the
 * little bell over the door (two soft notes). The door is a little different every time, the bell the
 * same (played at its own pitch and level, like the chimes) (~1.15 s)
 */
function doorShopOpen(): Recipe {
  return (sr, rng) => {
    const len = 1.15;
    const x = S(sr, len);
    const f = rng.range(850, 1150);
    strike(x, sr, 0, [[f, 1, 0.014], [f * 2.76, 0.5, 0.009], [f * 5.4, 0.22, 0.005]], 0.4, rng);
    burst(x, sr, 0, 0.003, 0.3, rng, { attack: 0.0001, decay: 0.0006, filter: [['highpass', 1800]] });
    latchInto(x, sr, rng.range(0.008, 0.014), rng, 0.3, false);
    rattleInto(x, sr, 0.012, rng, 0.05, 4, 0.06, [2600, 5200]);
    strike(x, sr, Math.floor(0.01 * sr), [[rng.range(2900, 3600), 1, 0.02], [rng.range(5000, 6200), 0.45, 0.012]], 0.04, rng);
    const sigh = sweptBand(noise(Math.floor(0.35 * sr), rng), sr, (t) => 350 + 500 * t, 1.2);
    for (let i = 0; i < sigh.length; i++) sigh[i] *= Math.pow(Math.sin((Math.PI * i) / sigh.length), 1.5);
    mixInto(x, sigh, Math.floor(0.03 * sr), 0.05);
    // (the door to its own peak, then the bell on it at a fixed level: every rendering's bell as loud)
    normalize(x, 0.45);
    shopBellInto(x, sr, rng.range(0.06, 0.09), SHOP_BELL, rng);
    for (let i = Math.floor((len - 0.2) * sr); i < x.length; i++) x[i] *= Math.max(0, 1 - (i / sr - (len - 0.2)) / 0.2);
    return edges(x, sr, 0.5, 20);
  };
}

/** the shop's door drawn shut by its closer: a soft hydraulic sigh as it comes round, the rubber seal meeting the frame (a padded thup), the aluminium frame knocked, the latch's light click, the glass shivering a moment (~0.7 s) */
function doorShopClose(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.7);
    const hit = rng.range(0.14, 0.18);
    const sigh = sweptBand(noise(Math.floor((hit + 0.02) * sr), rng), sr, (t) => 800 - 1800 * t, 1.2);
    for (let i = 0; i < sigh.length; i++) sigh[i] *= Math.pow(Math.sin((Math.PI * i) / sigh.length), 1.2);
    mixInto(x, sigh, 0, 0.08);
    thudInto(x, sr, hit, rng, 0.9, rng.range(150, 210), 0.018);
    const f = rng.range(520, 680);
    strike(x, sr, Math.floor(hit * sr), [[f, 1, 0.025], [f * 2.31, 0.5, 0.016], [f * 4.2, 0.25, 0.009]], 0.3, rng);
    latchInto(x, sr, hit + rng.range(0.004, 0.009), rng, 0.4, false);
    rattleInto(x, sr, hit + 0.008, rng, 0.06, 5, 0.09, [2500, 5500]);
    strike(x, sr, Math.floor((hit + 0.004) * sr), [[rng.range(3000, 3800), 1, 0.025], [rng.range(5200, 6400), 0.45, 0.015]], 0.05, rng);
    return normalize(saturate(edges(x, sr, 0.5, 30), 1.2), 0.85);
  };
}

/** a pump's nozzle lifted off its hook: its alloy body knocked off the holster, the switch lever under it flipping up to its stop (the pump on), the hose dragged after it (~0.38 s) */
function pumpLift(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.38);
    knockInto(x, sr, 0, 0.55, rng, metalModes(rng.range(750, 1050), 0.02), 3500);
    const up = rng.range(0.035, 0.06);
    burst(x, sr, Math.floor(up * sr), 0.003, 0.45, rng, { attack: 0.0001, decay: 0.0006, filter: [['highpass', 1500]] });
    strike(x, sr, Math.floor(up * sr), [[rng.range(2300, 2800), 1, 0.008], [rng.range(3800, 4400), 0.5, 0.005]], 0.45, rng);
    strike(x, sr, Math.floor((up + rng.range(0.008, 0.012)) * sr), [[rng.range(1200, 1500), 1, 0.012], [rng.range(2000, 2400), 0.4, 0.008]], 0.3, rng);
    rubInto(x, sr, 0.02, rng.range(0.2, 0.3), 0.18, rng, 120, 900, 0.3);
    return normalize(edges(x, sr, 0.5, 30), 0.55);
  };
}

/** the nozzle hung back: dropped into its holster with a clunk (the dispenser's panel ringing a moment), the switch lever pushed down (the pump off), the hose swinging against the dispenser (~0.48 s) */
function pumpHang(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.48);
    thudInto(x, sr, 0, rng, 0.55, rng.range(230, 290), 0.014);
    knockInto(x, sr, 0, 0.6, rng, metalModes(rng.range(480, 720), 0.03), 2500);
    strike(x, sr, 0, panelModes(0.85, 3), 0.08, rng);
    const down = rng.range(0.02, 0.04);
    burst(x, sr, Math.floor(down * sr), 0.003, 0.4, rng, { attack: 0.0001, decay: 0.0006, filter: [['highpass', 1500]] });
    strike(x, sr, Math.floor(down * sr), [[rng.range(1700, 2000), 1, 0.01], [rng.range(2900, 3300), 0.5, 0.007]], 0.4, rng);
    const sw = rng.range(0.2, 0.3);
    thudInto(x, sr, sw, rng, 0.18, rng.range(150, 200), 0.012);
    rubInto(x, sr, sw - 0.02, 0.1, 0.08, rng, 120, 800, 0.3);
    return normalize(edges(x, sr, 0.5, 30), 0.7);
  };
}

/** the nozzle's automatic shut-off as the tank or the can is full: the trigger snapping free with a hard click, the lever hitting its guard, the flow cut with a last spit (~0.22 s) */
function pumpClick(): Recipe {
  return (sr, rng) => {
    const x = S(sr, 0.22);
    burst(x, sr, 0, 0.003, 0.7, rng, { attack: 0.0001, decay: 0.0006, filter: [['highpass', 1600]] });
    strike(x, sr, 0, [[rng.range(2700, 3200), 1, 0.008], [rng.range(4300, 5000), 0.55, 0.005], [rng.range(1500, 1800), 0.4, 0.012]], 0.6, rng);
    const g = Math.floor(rng.range(0.006, 0.01) * sr);
    strike(x, sr, g, [[rng.range(900, 1100), 1, 0.015], [rng.range(1700, 2000), 0.5, 0.01]], 0.35, rng);
    thudInto(x, sr, g / sr, rng, 0.25, 320, 0.008);
    burst(x, sr, Math.floor(0.012 * sr), 0.05, 0.12, rng, { attack: 0.002, decay: 0.012, filter: [['bandpass', rng.range(900, 1800), 1.2]] });
    plipInto(x, sr, rng.range(0.02, 0.035), rng.range(700, 1100), 0.1, 0.006, -0.3);
    return normalize(edges(x, sr, 0.3, 20), 0.5);
  };
}

/**
 * An old pump running: its induction motor humming in the dispenser (the mains hum, the vane pump's
 * pulses six a turn of its 24 Hz rotor, a bearing's whine), the meter's counter wheels whirring with a
 * tick each tenth of a litre, and the fuel rushing through the hose and the nozzle, gurgling into the
 * filler neck. Seamless (whole cycles of every tone in the loop).
 */
function pumpRun(): Recipe {
  return (sr, rng) => {
    const len = 2.6;
    const n = Math.floor(len * sr);
    const rot = snapHz(24.2, n, sr);
    const motor = new Float32Array(n);
    for (const [f, a] of [[100, 1], [200, 0.45], [300, 0.22], [400, 0.1], [50, 0.12]] as const) toneInto(motor, sr, snapHz(f, n, sr), a, rng, n);
    const pulse = (i: number): number => 0.65 + 0.35 * Math.sin((2 * Math.PI * rot * i) / sr);
    for (const [h, a] of [[6, 0.8], [12, 0.35], [18, 0.15]] as const) toneInto(motor, sr, rot * h, a, rng, n, pulse);
    const whine = wander(rng, 6, 0.5, 1);
    toneInto(motor, sr, snapHz(1180, n, sr), 0.06, rng, n, (i) => whine(i / n));
    const ticks = Math.round(len / 0.16);
    const meter = cyclic(sr, len, (y) => {
      for (let k = 0; k < ticks; k++) strike(y, sr, Math.floor(((k * len) / ticks) * sr), [[rng.range(1700, 2100), 1, 0.004], [rng.range(3200, 3700), 0.4, 0.003]], rng.range(0.7, 1), rng, 0.02);
    });
    const whirr = loopFilter(noise(n, rng), sr, [['bandpass', 700, 4]]);
    const rush = loopFilter(noise(n, rng), sr, [['bandpass', 750, 0.5], ['peaking', 2200, 1, 4], ['lowpass', 5000, 0.7]]);
    const flutter = wander(rng, Math.round(len * 22), 0.7, 1);
    const glugs = cyclic(sr, len, (y) => scatter(rng, len, 10, () => 1, (t) => plipInto(y, sr, t, rng.range(500, 1300), powerLaw(rng, 0.3, 1.8), rng.range(0.004, 0.009), -rng.range(0.15, 0.45))));
    const [rm, rt, rw, rr, rg] = [rmsOf(motor), rmsOf(meter), rmsOf(whirr), rmsOf(rush), rmsOf(glugs)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = (0.55 * motor[i]) / rm + (0.08 * meter[i]) / rt + (0.06 * whirr[i]) / rw + (0.6 * rush[i] * flutter(i / n)) / rr + (0.25 * glugs[i]) / rg;
    // (to its rms, not its peak: where the motor's steady partials happen to peak together is luck, and with it the level)
    const y = settle(centre(loopFilter(out, sr, [['lowpass', 9000, 0.7]])), sr);
    const k = 0.1 / rmsOf(y);
    for (let i = 0; i < n; i++) y[i] *= k;
    return y;
  };
}

/**
 * The pump running dry: the motor labouring and hunting as it draws air, its vanes knocking unevenly,
 * fuel and air spluttering through the hose, a gurgle as the last of it goes; then the motor cut out by
 * its relay (a click), the hum gone at once, the rotor winding down (~1.6 s)
 */
function pumpDry(): Recipe {
  return (sr, rng) => {
    const len = 1.6;
    const x = S(sr, len);
    const cut = rng.range(0.9, 1.0);
    const hunt = wander(rng, 12, 0.94, 1.04);
    const env = (t: number): number => (t < cut ? Math.min(1, t / 0.02) * (0.8 + 0.3 * (t / cut)) : Math.exp(-(t - cut) / 0.02));
    humInto(x, sr, 0, len, (t) => 0.1 * env(t), rng, (t) => hunt(t / len));
    const rough = wander(rng, 30, 0.4, 1);
    let ph = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      const spin = t < cut ? hunt(t / len) : hunt(cut / len) * Math.exp(-(t - cut) / 0.3);
      ph += (2 * Math.PI * 24.2 * spin) / sr;
      const amp = (t < cut ? 0.12 * (0.6 + 0.4 * rough(t / len)) : 0.12 * Math.exp(-(t - cut) / 0.25)) * Math.min(1, t / 0.02);
      x[i] += amp * (Math.sin(6 * ph) + 0.4 * Math.sin(12 * ph)) * (0.65 + 0.35 * Math.sin(ph));
    }
    for (let t = 0.04; t < cut - 0.05; t += rng.range(0.04, 0.14)) burst(x, sr, Math.floor(t * sr), rng.range(0.02, 0.06), rng.range(0.25, 0.6), rng, { attack: 0.002, decay: 0.012, filter: [['bandpass', rng.range(600, 1800), 1]] });
    for (let k = 0; k < 8 + Math.floor(rng.next() * 5); k++) plipInto(x, sr, rng.range(0.35, cut - 0.03), rng.range(280, 800), rng.range(0.25, 0.6), rng.range(0.008, 0.016), rng.range(0.25, 0.5));
    strike(x, sr, Math.floor(cut * sr), [[rng.range(2100, 2500), 1, 0.006], [rng.range(3600, 4100), 0.5, 0.004]], 0.35, rng);
    burst(x, sr, Math.floor(cut * sr), 0.003, 0.25, rng, { attack: 0.0001, decay: 0.0006, filter: [['highpass', 1500]] });
    return normalize(saturate(edges(x, sr, 0.5, 40), 1.3), 0.6);
  };
}

// ------------------------------------------------------------------ tyres on the road: rolling and sliding, by the surface under them

/** a road tyre's turns a second at rate 1: 50 km/h on a wheel 0.64 m across */
const TYRE_TURN_HZ = 6.9;

/** scale a loop to an rms (a steady loop's level is its rms: where its loudest speck falls is luck) */
function toRms(x: Float32Array, r: number): Float32Array {
  const k = r / rmsOf(x);
  for (let i = 0; i < x.length; i++) x[i] *= k;
  return x;
}

/** the largest magnitude in a buffer (1 if silent): sparse events are set against a bed by their peaks, not their rms */
const peakOf = (x: Float32Array): number => {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  return m || 1;
};

/**
 * turn a tyre loop round so its wrap falls on an ordinary moment and, in it, on the quietest
 * millisecond of its specks (a seamless loop wraps cleanly anywhere; a grain just starting on the
 * wrap would only look like a splice to a check, and an ordinary wrap keeps the loop's first moment
 * like any other wherever the game starts it)
 */
function settleTyre(x: Float32Array, sr: number): Float32Array {
  const n = x.length;
  const w = Math.floor(0.05 * sr);
  const lv: Array<[number, number]> = [];
  for (let j = 0; (j + 1) * w <= n; j++) {
    let e = 0;
    for (let i = j * w; i < (j + 1) * w; i++) e += x[i] * x[i];
    lv.push([e, j]);
  }
  lv.sort((p, q) => p[0] - q[0]);
  const a = lv[lv.length >> 1][1] * w;
  const m = Math.max(2, Math.floor(0.001 * sr));
  const hop = Math.max(1, m >> 2);
  let best = Infinity;
  let at = a + (w >> 1);
  for (let o = a + m; o + 2 * m <= a + w; o += hop) {
    let e = 0;
    for (let i = o; i < o + m; i++) e += (x[i] - x[i - 1]) ** 2;
    if (e < best) {
      best = e;
      at = o + (m >> 1);
    }
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = x[(i + at) % n];
  return out;
}

/** a tyre loop's last steps: the odd big speck tamed, its top rolled off from lp Hz (nothing to fold back at the fastest rate), the mean taken out, its wrap turned to an ordinary, quiet moment, set to its rms */
function tyreFinish(out: Float32Array, sr: number, lp: number): Float32Array {
  return toRms(settleTyre(centre(loopFilter(tame(out, 18), sr, [['lowpass', lp, 0.7], ['lowpass', lp * 1.12, 0.7]])), sr), 0.1);
}

/**
 * The phase (in cycles) of a tone running round a loop, its frequency f0 times fm[i] at every sample
 * (a periodic curve: its end runs on into its start), its pitch taken a hair up or down so that it
 * turns a whole number of cycles in the loop: a tone and its overtones drawn from it wrap without a seam.
 */
function loopPhase(sr: number, f0: number, fm: Float64Array): Float64Array {
  const n = fm.length;
  let tot = 0;
  for (let i = 0; i < n; i++) tot += (f0 * fm[i]) / sr;
  const k = (Math.max(1, Math.round(tot)) / tot) * (f0 / sr);
  const ph = new Float64Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    ph[i] = p;
    p += fm[i] * k;
  }
  return ph;
}

/** a curve round a loop (u = 0..1) holding one of `values` a while, k holds of a little different lengths, gliding into the next over the last `glide` (of the loop) of each, the last into the first */
function holds(rng: Rng, k: number, values: readonly number[], glide: number): (u: number) => number {
  const v = Array.from({ length: k }, () => values[Math.floor(rng.next() * values.length)]);
  const w = Array.from({ length: k }, () => rng.range(0.6, 1.4));
  const tot = w.reduce((a, b) => a + b, 0);
  const starts: number[] = [];
  let acc = 0;
  for (const x of w) {
    starts.push(acc / tot);
    acc += x;
  }
  return (u) => {
    const uu = u - Math.floor(u);
    let i = k - 1;
    while (i > 0 && starts[i] > uu) i--;
    const left = (i + 1 < k ? starts[i + 1] : 1) - uu;
    if (left >= glide) return v[i];
    const f = 1 - left / glide;
    return v[i] + (v[(i + 1) % k] - v[i]) * f * f * (3 - 2 * f);
  };
}

/** a bus of grains and its colour: the filters it goes through, its weight in the mix */
type GrainColour = readonly [ReadonlyArray<readonly [BiquadKind, number, number?, number?]>, number];

/**
 * Loose stuff crushed under a tread (stones grinding on one another, a crust breaking, snow's crystals
 * giving way): runs of sharp specks, `rate` runs a second thinned by the density d(t) (0..1), each run a
 * few specks to `most` more a millisecond or two apart (most runs small, the odd big one), each run in
 * one of the colours; the whole tamed so its biggest stands no more than crestDb over it. len s, seamless.
 */
function crunchLoop(sr: number, len: number, rng: Rng, rate: number, d: (t: number) => number, colours: readonly GrainColour[], o: { gap?: number; most?: number; decay?: readonly [number, number]; crestDb?: number } = {}): Float32Array {
  const n = Math.floor(len * sr);
  const bus = colours.map(() => new Float32Array(2 * n));
  const gap = o.gap ?? 0.0018;
  const most = o.most ?? 10;
  const [d0, d1] = o.decay ?? [0.00005, 0.0004];
  scatter(rng, len, rate, d, (t, v) => {
    const b = bus[Math.floor(rng.next() * bus.length)];
    const m = 1 + Math.floor(powerLaw(rng, 0.1, 1.3) * most);
    const g = powerLaw(rng, 0.2, 1.8) * (0.4 + 0.6 * v);
    for (let k = 0, tt = t; k < m; k++) {
      grainInto(b, sr, tt, g * rng.range(0.35, 1), rng.range(d0, d1), rng);
      tt -= Math.log(1 - rng.next()) * gap;
    }
  });
  const out = new Float32Array(n);
  bus.forEach((b, k) => mixInto(out, loopFilter(fold(b), sr, colours[k][0]), 0, colours[k][1]));
  return tame(out, o.crestDb ?? 13);
}

/**
 * Something flicked up into the wheel arch (a pebble, a clod, a lump of ice): a sharp tick on its
 * plastic liner, or (`steel` of the time) on bare steel, ringing a little; now and then it bounces once
 * more. At `at` s, strength a.
 */
function archInto(x: Float32Array, sr: number, at: number, a: number, rng: Rng, steel = 0.25): void {
  const hit = (t: number, g: number): void => {
    const s = Math.floor(t * sr);
    if (rng.next() < steel) strike(x, sr, s, metalModes(rng.range(1700, 3400), rng.range(0.003, 0.007)), 0.45 * g, rng, 0.04);
    else {
      const f = rng.range(900, 2300);
      const dd = rng.range(0.0008, 0.002);
      strike(x, sr, s, [[f, 1, dd], [f * 1.87, 0.5, dd * 0.6], [f * 3.05, 0.25, dd * 0.4]], 0.6 * g, rng, 0.05);
    }
    grainInto(x, sr, t, g, rng.range(0.0001, 0.0003), rng);
  };
  hit(at, a);
  if (rng.next() < 0.3) hit(at + rng.range(0.006, 0.025), a * rng.range(0.2, 0.45));
}

/** a flurry of fine stuff thrown up against the arch (sand, snow, grit): `count` specks over len s from `at`, thickest at first */
function patterInto(x: Float32Array, sr: number, at: number, len: number, a: number, count: number, rng: Rng): void {
  for (let k = 0; k < count; k++) grainInto(x, sr, at + len * Math.pow(rng.next(), 1.6), a * powerLaw(rng, 0.25, 2.2), rng.range(0.00008, 0.0003), rng);
}

/** an envelope round a loop of len s, its mean 1: soft swells (a sine squared each, `rate` a second, lo..hi s long, of power-law strengths) over a floor */
function swells(sr: number, len: number, rng: Rng, rate: number, lo: number, hi: number, floor: number): Float32Array {
  const e = cyclic(sr, len, (x) =>
    scatter(rng, len, rate, () => 1, (t) => {
      const a = Math.floor(t * sr);
      const m = Math.floor(rng.range(lo, hi) * sr);
      const g = powerLaw(rng, 0.3, 2);
      for (let i = 0; i < m && a + i < x.length; i++) x[a + i] += g * Math.sin((Math.PI * i) / m) ** 2;
    }),
  );
  let mean = 0;
  for (const v of e) mean += v;
  mean /= Math.max(1, e.length);
  for (let i = 0; i < e.length; i++) e[i] = floor + ((1 - floor) * e[i]) / mean;
  return e;
}

/**
 * A tyre's tread going round a loop of n samples, `turns` turns: `blocks` blocks a turn of three
 * pitches in runs (a pattern is sequenced so that it does not whine on one note), each striking the
 * road as it comes round, a little harder or softer with the road (`rough`); the clicks alone, their
 * colour left to the filters they go through.
 */
function treadClicks(n: number, turns: number, blocks: number, rng: Rng, rough: number): Float32Array {
  const pitch: number[] = [];
  while (pitch.length < blocks) {
    const p = [0.82, 1, 1.18][Math.floor(rng.next() * 3)];
    for (let k = 1 + Math.floor(rng.next() * 4); k > 0 && pitch.length < blocks; k--) pitch.push(p);
  }
  const tot = pitch.reduce((a, b) => a + b, 0);
  const x = new Float32Array(n);
  const per = n / turns;
  for (let r = 0; r < turns; r++) {
    let acc = 0;
    for (const p of pitch) {
      const at = (r + acc / tot) * per;
      const i = Math.floor(at);
      const f = at - i;
      const v = 1 + 0.5 * rough * rng.gauss();
      // (split between the two samples it falls between: the same click wherever it lands)
      x[i % n] += v * (1 - f);
      x[(i + 1) % n] += v * f;
      acc += p;
    }
  }
  return x;
}

/** ice cracking somewhere off: the crack's sound running through the sheet highs first (a thin chirp falling from a few kHz to a few hundred Hz), a tick where it broke */
function pewInto(x: Float32Array, sr: number, at: number, amp: number, rng: Rng): void {
  const a = Math.max(0, Math.floor(at * sr));
  const len = rng.range(0.05, 0.11);
  const m = Math.min(x.length - a, Math.floor(len * sr));
  const f1 = rng.range(2800, 4200);
  const f2 = rng.range(450, 750);
  const tau = len / rng.range(2.5, 4);
  let ph = 0;
  for (let i = 0; i < m; i++) {
    const t = i / sr;
    ph += (f2 + (f1 - f2) * Math.exp(-t / tau)) / sr;
    x[a + i] += amp * Math.sin(2 * Math.PI * ph) * Math.min(1, t / 0.002) * Math.exp(-t / (0.35 * len));
  }
  grainInto(x, sr, at, 0.6 * amp, 0.0002, rng);
}

/**
 * Rolling on dry asphalt (rate 1 about 50 km/h): the tyre's roar, broadband and smooth (the tread's air
 * pumped out of its grooves and its blocks meeting the road, weighted round 900 Hz), the drone it sends
 * through the wheel and the body, the air in the tyre ringing faintly (its cavity, near 220 Hz), the
 * tread's faint whine (64 blocks a turn in three pitches), a fine sizzle of the stone in the asphalt;
 * breathing a little with the road and once a turn. The steady bed under everything. Seamless (29
 * turns of the wheel).
 */
function rollAsphalt(): Recipe {
  return (sr, rng) => {
    const turns = 29;
    const len = turns / TYRE_TURN_HZ;
    const n = Math.floor(len * sr);
    const road = wander(rng, 9, 0.82, 1.12);
    const grain = wander(rng, Math.round(len * 5), 0.85, 1.15);
    const roar = loopFilter(loopPink(n, rng), sr, [['highpass', 160, 0.6], ['peaking', 900, 0.8, 6], ['lowpass', 2600, 0.6]]);
    const drone = loopFilter(loopPink(n, rng), sr, [['lowpass', 240, 0.7], ['lowpass', 300, 0.7], ['highpass', 45, 0.7]]);
    const cavity = loopFilter(noise(n, rng), sr, [['bandpass', 222, 14]]);
    const tread = loopFilter(treadClicks(n, turns, 64, rng, 0.25), sr, [['highpass', 300, 0.7], ['lowpass', 1300, 0.7], ['peaking', 460, 2, 6]]);
    const sizzle = loopFilter(cyclic(sr, len, (x) => scatter(rng, len, 1800, () => 1, (t) => grainInto(x, sr, t, powerLaw(rng, 0.3, 3), rng.range(0.00006, 0.0002), rng))), sr, [['highpass', 2000, 0.7], ['lowpass', 6500, 0.7]]);
    const [ra, rd, rc, rt, rs] = [rmsOf(roar), rmsOf(drone), rmsOf(cavity), rmsOf(tread), rmsOf(sizzle)];
    const out = new Float32Array(n);
    const w = (2 * Math.PI * turns) / n;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const swell = road(u) * (1 + 0.03 * Math.cos(w * i));
      out[i] = (roar[i] / ra) * swell * grain(u) + (0.55 * drone[i] * road(u)) / rd + (0.12 * cavity[i]) / rc + (0.3 * tread[i] * grain(u)) / rt + (0.06 * sizzle[i]) / rs;
    }
    return tyreFinish(out, sr, 7500);
  };
}

/**
 * Rolling on wet asphalt (played over roll_asphalt, by how wet it is): the water squeezed out of the
 * tread's grooves and thrown off it in a steady hiss, the spray sizzling and fizzing off the tread,
 * droplets drumming on the arch's liner, the film of water swishing under the tyre, deeper and
 * shallower by turns. Seamless.
 */
function rollWet(): Recipe {
  return (sr, rng) => {
    const len = 4.4;
    const n = Math.floor(len * sr);
    const depth = wander(rng, 10, 0.55, 1);
    const flutter = wander(rng, Math.round(len * 24), 0.8, 1.2);
    const hiss = loopFilter(noise(n, rng), sr, [['highpass', 1000, 0.6], ['peaking', 3600, 0.7, 6], ['lowpass', 8000, 0.7], ['lowpass', 9000, 0.7]]);
    const sizzle = tame(loopFilter(cyclic(sr, len, (x) => scatter(rng, len, 3200, (t) => depth(t / len), (t) => grainInto(x, sr, t, powerLaw(rng, 0.15, 1.8), rng.range(0.00005, 0.00025), rng))), sr, [['highpass', 2600, 0.7], ['lowpass', 8500, 0.7]]), 12);
    const drops = tame(
      loopFilter(
        cyclic(sr, len, (x) =>
          scatter(rng, len, 70, (t) => depth(t / len), (t) => {
            ring(x, sr, Math.floor(t * sr), rng.range(1400, 4200), powerLaw(rng, 0.3, 2), rng.range(0.0005, 0.0018), rng.range(0, 6.283));
            grainInto(x, sr, t, 0.5 * powerLaw(rng, 0.3, 2), 0.0002, rng);
          }),
        ),
        sr,
        [['highpass', 900, 0.7], ['lowpass', 8000, 0.7]],
      ),
      14,
    );
    const swish = loopFilter(loopPink(n, rng), sr, [['bandpass', 600, 0.6], ['lowpass', 2000, 0.7]]);
    const [rh, rz, rp, rw] = [rmsOf(hiss), rmsOf(sizzle), rmsOf(drops), rmsOf(swish)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const d = depth(u);
      out[i] = (hiss[i] / rh) * flutter(u) * Math.sqrt(d) + (0.5 * sizzle[i]) / rz + (0.3 * drops[i]) / rp + (0.45 * swish[i] * d) / rw;
    }
    return tyreFinish(out, sr, 8500);
  };
}

/**
 * Rolling on loose gravel: the stones crunching and grinding against one another under the tread (runs
 * of sharp specks in four colours), stones popping out from under it (a click and the stone's short
 * ring), pebbles flicked into the arch ticking on its liner now and then (on bare steel now and then,
 * sometimes bouncing), the tyre rumbling over the loose bed and crushing it. Clearly granular. Seamless.
 */
function rollGravel(): Recipe {
  return (sr, rng) => {
    const len = 4.6;
    const n = Math.floor(len * sr);
    const bed = wander(rng, 11, 0.55, 1);
    const rough = wander(rng, Math.round(len * 60), 0.35, 1);
    const crunch = crunchLoop(sr, len, rng, 220, (t) => bed(t / len), [
      [[['bandpass', 1000, 1.1]], 1.3],
      [[['bandpass', 1900, 1.1]], 1.2],
      [[['bandpass', 3300, 1.1]], 1],
      [[['highpass', 2400, 0.7], ['lowpass', 7000, 0.7]], 0.7],
    ]);
    const pops = tame(
      cyclic(sr, len, (x) =>
        scatter(rng, len, 38, (t) => bed(t / len), (t) => {
          const f = rng.range(1800, 4600);
          const d = rng.range(0.0006, 0.0018);
          const a = powerLaw(rng, 0.3, 2);
          strike(x, sr, Math.floor(t * sr), [[f, 1, d], [f * 1.71, 0.55, d * 0.7], [f * 2.63, 0.3, d * 0.5]], 0.6 * a, rng, 0.05);
          grainInto(x, sr, t, a, rng.range(0.0001, 0.0003), rng);
        }),
      ),
      15,
    );
    const arch = tame(cyclic(sr, len, (x) => scatter(rng, len, 3.5, () => 1, (t) => archInto(x, sr, t, powerLaw(rng, 0.35, 2), rng, 0.25))), 16);
    const rumble = loopFilter(loopPink(n, rng), sr, [['lowpass', 300, 0.7], ['lowpass', 380, 0.7], ['highpass', 40, 0.7]]);
    const crush = loopFilter(noise(n, rng), sr, [['bandpass', 650, 0.8]]);
    const [rc, rp, ra, rr, rk] = [rmsOf(crunch), rmsOf(pops), rmsOf(arch), rmsOf(rumble), rmsOf(crush)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      out[i] = crunch[i] / rc + (0.7 * pops[i]) / rp + (0.5 * arch[i]) / ra + (0.55 * rumble[i] * (0.6 + 0.4 * rough(u))) / rr + (0.35 * crush[i] * rough(u) * bed(u)) / rk;
    }
    return tyreFinish(out, sr, 8000);
  };
}

/**
 * Rolling on packed dirt: a soft low rumble (the tyre over a firm, uneven floor, its little bumps), the
 * tread's softer hush on it, grit crackling in it, a small stone now and then, a speck of grit in the
 * arch. Darker and smoother than gravel. Seamless.
 */
function rollDirt(): Recipe {
  return (sr, rng) => {
    const len = 4.3;
    const n = Math.floor(len * sr);
    const bumps = wander(rng, Math.round(len * 7), 0.55, 1);
    const firm = wander(rng, 8, 0.7, 1);
    const rumble = loopFilter(loopPink(n, rng), sr, [['lowpass', 380, 0.7], ['lowpass', 450, 0.7], ['highpass', 35, 0.7], ['peaking', 110, 1, 3]]);
    const hush = loopFilter(loopPink(n, rng), sr, [['bandpass', 550, 0.7], ['lowpass', 1800, 0.7]]);
    const grit = crunchLoop(sr, len, rng, 260, (t) => firm(t / len), [[[['bandpass', 1600, 0.9]], 1], [[['bandpass', 2800, 0.9]], 0.8]], { most: 4, crestDb: 12 });
    const stones = tame(
      cyclic(sr, len, (x) => {
        scatter(rng, len, 5, () => 1, (t) => {
          const f = rng.range(1300, 3000);
          const d = rng.range(0.001, 0.002);
          strike(x, sr, Math.floor(t * sr), [[f, 1, d], [f * 1.6, 0.5, d * 0.7]], 0.5 * powerLaw(rng, 0.35, 2), rng, 0.05);
          thudInto(x, sr, t, rng, 0.2, rng.range(120, 200), 0.006);
        });
        scatter(rng, len, 1.2, () => 1, (t) => archInto(x, sr, t, 0.5 * powerLaw(rng, 0.35, 2), rng, 0.15));
      }),
      15,
    );
    const [rr, rh, rg, rs] = [rmsOf(rumble), rmsOf(hush), rmsOf(grit), rmsOf(stones)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      out[i] = (rumble[i] * bumps(u)) / rr + (0.45 * hush[i] * firm(u)) / rh + (0.33 * grit[i]) / rg + (0.3 * stones[i]) / rs;
    }
    return tyreFinish(out, sr, 6500);
  };
}

/**
 * Rolling on grass: the soft swish of the blades brushing the tread, the sidewalls and the underside,
 * tuft after tuft, now thicker, now thinner; blades flicking off; under it the tyre's own muffled hush
 * and a low thrum of the turf giving; a stalk snapping now and then. Quieter than gravel. Seamless.
 */
function rollGrass(): Recipe {
  return (sr, rng) => {
    const len = 4.5;
    const n = Math.floor(len * sr);
    const thick = wander(rng, 10, 0.5, 1);
    const tufts = swells(sr, len, rng, 22, 0.05, 0.18, 0.35);
    const tufts2 = swells(sr, len, rng, 14, 0.08, 0.25, 0.4);
    const swishHi = loopFilter(noise(n, rng), sr, [['highpass', 1500, 0.6], ['peaking', 3800, 0.8, 4], ['lowpass', 7500, 0.7]]);
    const swishLo = loopFilter(noise(n, rng), sr, [['bandpass', 1200, 0.7]]);
    const flick = loopFilter(cyclic(sr, len, (x) => scatter(rng, len, 500, (t) => thick(t / len), (t) => grainInto(x, sr, t, powerLaw(rng, 0.2, 2), rng.range(0.00005, 0.00015), rng))), sr, [['highpass', 3000, 0.7], ['lowpass', 8000, 0.7]]);
    const hush = loopFilter(loopPink(n, rng), sr, [['bandpass', 550, 0.7]]);
    const thrum = loopFilter(loopPink(n, rng), sr, [['lowpass', 160, 0.7], ['lowpass', 200, 0.7], ['highpass', 30, 0.7]]);
    const give = wander(rng, Math.round(len * 5), 0.6, 1);
    const snaps = cyclic(sr, len, (x) =>
      scatter(rng, len, 1.5, () => 1, (t) => {
        grainInto(x, sr, t, 1, 0.00015, rng);
        strike(x, sr, Math.floor(t * sr), [[rng.range(2200, 4200), 1, 0.0012]], 0.4, rng);
      }),
    );
    const [rh, rl, rf, ru, rt] = [rmsOf(swishHi), rmsOf(swishLo), rmsOf(flick), rmsOf(hush), rmsOf(thrum)];
    // (a snap stands about as high as the swishing's own rms: heard, not a crack)
    const ks = 1.2 / peakOf(snaps);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      out[i] = (swishHi[i] * tufts[i] * thick(u)) / rh + (0.5 * swishLo[i] * tufts2[i]) / rl + (0.25 * flick[i]) / rf + (0.3 * hush[i] * give(u)) / ru + (0.65 * thrum[i] * give(u)) / rt + ks * snaps[i];
    }
    return tyreFinish(out, sr, 8000);
  };
}

/**
 * Rolling in sand: heavy, dull and soft: the tyre sunk in and ploughing it (a deep, muffled rumble,
 * surging as it digs in and climbs), the grains streaming off the tread in a soft hiss, sand thrown up
 * pattering on the arches in flurries. Seamless.
 */
function rollSand(): Recipe {
  return (sr, rng) => {
    const len = 4.4;
    const n = Math.floor(len * sr);
    const surge = wander(rng, 9, 0.6, 1);
    const plough = loopFilter(loopPink(n, rng), sr, [['lowpass', 220, 0.7], ['lowpass', 280, 0.7], ['highpass', 28, 0.7]]);
    const body = loopFilter(loopPink(n, rng), sr, [['bandpass', 420, 0.8]]);
    const hiss = loopFilter(cyclic(sr, len, (x) => scatter(rng, len, 5000, (t) => surge(t / len), (t) => grainInto(x, sr, t, powerLaw(rng, 0.3, 3), rng.range(0.00004, 0.00012), rng))), sr, [['highpass', 2200, 0.7], ['lowpass', 7000, 0.7]]);
    const patter = tame(loopFilter(cyclic(sr, len, (x) => scatter(rng, len, 5, () => 1, (t) => patterInto(x, sr, t, rng.range(0.05, 0.15), powerLaw(rng, 0.4, 2), 25 + Math.floor(rng.next() * 40), rng))), sr, [['bandpass', 3800, 1], ['lowpass', 8000, 0.7]]), 14);
    const [rp, rb, rh, rt] = [rmsOf(plough), rmsOf(body), rmsOf(hiss), rmsOf(patter)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const s = surge(u);
      out[i] = (plough[i] * s) / rp + (0.3 * body[i]) / rb + (0.3 * hiss[i] * s) / rh + (0.32 * patter[i]) / rt;
    }
    return tyreFinish(out, sr, 7000);
  };
}

/**
 * Rolling on packed snow: dense crunching (its crystals crushed under the tread in little runs, the
 * snow packing hissing between them), the squeak cold snow gives as it packs (short creaking squeals
 * round 1.3-2.8 kHz, now one, now a run of them), a soft low thud of the tyre on it, snow flicked off
 * the tread hissing faintly. Seamless.
 */
function rollSnow(): Recipe {
  return (sr, rng) => {
    const len = 4.6;
    const n = Math.floor(len * sr);
    const pack = wander(rng, 11, 0.55, 1);
    const crunch = crunchLoop(sr, len, rng, 280, (t) => pack(t / len), [
      [[['bandpass', 1500, 1]], 1.1],
      [[['bandpass', 2700, 1]], 1],
      [[['bandpass', 4300, 1]], 0.8],
      [[['highpass', 3000, 0.7], ['lowpass', 7500, 0.7]], 0.5],
    ], { gap: 0.0012, most: 10, crestDb: 12 });
    const squeak = cyclic(sr, len, (x) =>
      scatter(rng, len, 12, (t) => pack(t / len), (t) => squealInto(x, sr, t, rng.range(0.02, 0.09), rng.range(1300, 2800), rng.range(0.4, 1), rng, { bright: rng.range(0.5, 0.85), waver: 0.06, glide: 0.3, grip: 0.65, jitter: 0.045 })),
    );
    // the snow packing between the runs: a fine, fast-fluttering hiss of compaction
    const packing = loopFilter(noise(n, rng), sr, [['bandpass', 1900, 0.7], ['lowpass', 6000, 0.7]]);
    const flutter = wander(rng, Math.round(len * 90), 0.15, 1);
    const low = loopFilter(loopPink(n, rng), sr, [['lowpass', 230, 0.7], ['highpass', 40, 0.7]]);
    const flick = loopFilter(noise(n, rng), sr, [['highpass', 2500, 0.7], ['lowpass', 7000, 0.7]]);
    const press = wander(rng, Math.round(len * 6), 0.6, 1);
    const [rc, rq, rk, rl, rf] = [rmsOf(crunch), rmsOf(squeak), rmsOf(packing), rmsOf(low), rmsOf(flick)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      out[i] = crunch[i] / rc + (0.5 * squeak[i]) / rq + (0.3 * packing[i] * flutter(u) * pack(u)) / rk + (0.4 * low[i] * press(u)) / rl + (0.08 * flick[i]) / rf;
    }
    return tyreFinish(out, sr, 8500);
  };
}

/**
 * Rolling on ice: very quiet. The tyre's thin hum on the smooth ice (the tread's note cleaner than on
 * asphalt, the air it pumps hushing, the air in the tyre ringing), a faint hiss of frost, now and then
 * a faint crackle of rime breaking, and once in a while the ice answering somewhere off with a thin
 * ringing "pew" (a crack's sound running through the sheet, its highs first). Seamless (33 turns of
 * the wheel).
 */
function rollIce(): Recipe {
  return (sr, rng) => {
    const turns = 33;
    const len = turns / TYRE_TURN_HZ;
    const n = Math.floor(len * sr);
    const tread = loopFilter(treadClicks(n, turns, 64, rng, 0.3), sr, [['bandpass', 470, 1.6], ['bandpass', 470, 1.6]]);
    const air = loopFilter(loopPink(n, rng), sr, [['bandpass', 900, 0.9], ['lowpass', 2500, 0.7]]);
    const cavity = loopFilter(noise(n, rng), sr, [['bandpass', 230, 10]]);
    const low = loopFilter(loopPink(n, rng), sr, [['lowpass', 180, 0.7], ['highpass', 40, 0.7]]);
    const frost = loopFilter(noise(n, rng), sr, [['highpass', 3000, 0.7], ['lowpass', 7000, 0.7]]);
    const crackle = loopFilter(
      cyclic(sr, len, (x) =>
        scatter(rng, len, 2.2, () => 1, (t) => {
          for (let k = 2 + Math.floor(rng.next() * 5); k > 0; k--) grainInto(x, sr, t + rng.range(0, 0.02), powerLaw(rng, 0.3, 2), rng.range(0.00005, 0.0002), rng);
        }),
      ),
      sr,
      [['bandpass', 4500, 1]],
    );
    const pews = cyclic(sr, len, (x) => scatter(rng, len, 0.35, () => 1, (t) => pewInto(x, sr, t, rng.range(0.4, 1), rng)));
    const [rt, ra, rc, rl, rf] = [rmsOf(tread), rmsOf(air), rmsOf(cavity), rmsOf(low), rmsOf(frost)];
    // (the crackles and the pews faint: their peaks about the hum's rms, heard only because nothing else is up there)
    const [kc, kp] = [1 / peakOf(crackle), 0.9 / peakOf(pews)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = (0.6 * tread[i]) / rt + (0.5 * air[i]) / ra + (0.35 * cavity[i]) / rc + (0.3 * low[i]) / rl + (0.06 * frost[i]) / rf + kc * crackle[i] + kp * pews[i];
    return tyreFinish(out, sr, 8000);
  };
}

/**
 * A tyre sliding on dry asphalt: its squeal, the tread's blocks catching and slipping on the stone some
 * thousand times a second (a tone near 1 kHz with its overtones, brighter as it bites, wavering, its
 * pitch wandering a little and now and then stepping to another note as the slide changes), a second
 * tyre squealing with it a little apart (the two beat), the rubber scrubbing under them in a rough rasp,
 * the carcass rumbling. Seamless: every tone turns a whole number of cycles in the loop.
 */
function skidAsphalt(): Recipe {
  return (sr, rng) => {
    const len = 4.2;
    const n = Math.floor(len * sr);
    const notes = holds(rng, 7, [1, 1, 1, 1.08, 0.93, 1.04], 0.05 / len);
    const drift = wander(rng, 9, 0.965, 1.035);
    const warble = wander(rng, Math.round(len * 14), -1, 1);
    const jitter = wander(rng, Math.round(len * 320), -1, 1);
    const wv = (2 * Math.PI * snapHz(rng.range(5.5, 7.5), n, sr)) / sr;
    const p1 = rng.range(0, 6.283);
    const fm = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      fm[i] = notes(u) * drift(u) * (1 + 0.012 * Math.sin(wv * i + p1) + 0.012 * warble(u) + 0.007 * jitter(u));
    }
    const f0 = rng.range(950, 1150);
    const ph1 = loopPhase(sr, f0, fm);
    const apart = wander(rng, 7, 1.045, 1.07);
    for (let i = 0; i < n; i++) fm[i] *= apart(i / n);
    const ph2 = loopPhase(sr, f0, fm);
    const grip = wander(rng, Math.round(len * 26), 0.55, 1);
    const grip2 = wander(rng, Math.round(len * 22), 0.5, 1);
    const body = wander(rng, 8, 0.65, 1);
    const second = wander(rng, 6, 0, 1);
    const q = Array.from({ length: 6 }, () => rng.range(0, 6.283));
    const tone = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const a = 2 * Math.PI * ph1[i];
      const b = 2 * Math.PI * ph2[i];
      const g = grip(u);
      const s1 = Math.sin(a) + g * (0.45 * Math.sin(2 * a + q[0]) + 0.2 * Math.sin(3 * a + q[1]) + 0.08 * Math.sin(4 * a + q[2]));
      const s2 = Math.sin(b) + 0.35 * Math.sin(2 * b + q[3]) + 0.12 * Math.sin(3 * b + q[4]);
      tone[i] = s1 * g * body(u) + 0.55 * s2 * Math.pow(second(u), 1.5) * grip2(u);
    }
    const rasp = loopFilter(noise(n, rng), sr, [['bandpass', 1600, 0.5], ['lowpass', 5500, 0.7]]);
    const rough = wander(rng, Math.round(len * 90), 0.3, 1);
    const rumble = loopFilter(loopPink(n, rng), sr, [['lowpass', 260, 0.7], ['highpass', 45, 0.7]]);
    const [rt, rr, rb] = [rmsOf(tone), rmsOf(rasp), rmsOf(rumble)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = tone[i] / rt + (0.3 * rasp[i] * rough(i / n)) / rr + (0.22 * rumble[i]) / rb;
    return tyreFinish(out, sr, 9000);
  };
}

/**
 * A slide on gravel: the stones scattered and sprayed: a harsh, crunching rush as the tread ploughs
 * through them (denser and rougher than rolling), stones sprayed against the arches and the sills in
 * barrages, bigger ones knocking, the loose gravel pouring away in a hiss, the slide's low rumble.
 * Seamless.
 */
function skidGravel(): Recipe {
  return (sr, rng) => {
    const len = 4.4;
    const n = Math.floor(len * sr);
    const dig = wander(rng, 12, 0.55, 1);
    const crunch = crunchLoop(sr, len, rng, 520, (t) => dig(t / len), [
      [[['bandpass', 900, 1]], 1.2],
      [[['bandpass', 1800, 1]], 1.2],
      [[['bandpass', 3200, 1]], 1],
      [[['highpass', 2600, 0.7], ['lowpass', 7500, 0.7]], 0.8],
    ], { most: 14, crestDb: 12 });
    const spray = tame(
      cyclic(sr, len, (x) =>
        scatter(rng, len, 3.5, (t) => dig(t / len), (t, v) => {
          // a barrage: a fistful of stones against the arch and the sill
          const m = 5 + Math.floor(rng.next() * 14);
          const span = rng.range(0.05, 0.2);
          for (let k = 0; k < m; k++) archInto(x, sr, t + span * Math.pow(rng.next(), 1.4), v * powerLaw(rng, 0.25, 2), rng, 0.3);
        }),
      ),
      15,
    );
    const knocks = tame(
      cyclic(sr, len, (x) =>
        scatter(rng, len, 2.5, () => 1, (t) => {
          thudInto(x, sr, t, rng, 0.4, rng.range(150, 260), 0.008);
          strike(x, sr, Math.floor(t * sr), woodModes(rng.range(700, 1300), 0.004), 0.5, rng);
        }),
      ),
      15,
    );
    const pour = loopFilter(noise(n, rng), sr, [['bandpass', 2000, 0.5], ['lowpass', 7000, 0.7]]);
    const rough = wander(rng, Math.round(len * 70), 0.3, 1);
    const low = loopFilter(loopPink(n, rng), sr, [['lowpass', 260, 0.7], ['highpass', 35, 0.7]]);
    const [rc, rs, rk, rp, rl] = [rmsOf(crunch), rmsOf(spray), rmsOf(knocks), rmsOf(pour), rmsOf(low)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      out[i] = crunch[i] / rc + (0.6 * spray[i]) / rs + (0.3 * knocks[i]) / rk + (0.5 * pour[i] * rough(u) * dig(u)) / rp + (0.4 * low[i]) / rl;
    }
    return tyreFinish(out, sr, 9000);
  };
}

/**
 * A slide on packed dirt: a gritty scrub (the tread scraping and tearing the crust: a rough broadband
 * rasp, mostly 300 Hz - 3 kHz), grit crackling in it, the crust breaking up in crumbles, dirt sprayed in
 * soft spatters against the arch, a small stone ticking. Seamless.
 */
function skidDirt(): Recipe {
  return (sr, rng) => {
    const len = 4.3;
    const n = Math.floor(len * sr);
    const dig = wander(rng, 10, 0.55, 1);
    const rough = wander(rng, Math.round(len * 70), 0.25, 1);
    const scrub = loopFilter(noise(n, rng), sr, [['bandpass', 1000, 0.5], ['peaking', 2200, 1, 3], ['lowpass', 5000, 0.7]]);
    const grit = crunchLoop(sr, len, rng, 300, (t) => dig(t / len), [[[['bandpass', 1500, 1]], 1], [[['bandpass', 2800, 1]], 0.9], [[['highpass', 3000, 0.7], ['lowpass', 6500, 0.7]], 0.6]], { most: 6 });
    const ev = tame(
      cyclic(sr, len, (x) => {
        // the crust crumbling
        scatter(rng, len, 30, (t) => dig(t / len), (t) => pinkBurstInto(x, sr, t, 0.03, powerLaw(rng, 0.3, 2), 0.001, 0.006, rng, [['bandpass', rng.range(500, 1800), 1.2]]));
        // dirt spattering on the arch: a soft "pff" and the grit in it
        scatter(rng, len, 5, () => 1, (t) => {
          const a = powerLaw(rng, 0.4, 2);
          pinkBurstInto(x, sr, t, 0.08, 0.6 * a, 0.004, 0.02, rng, [['lowpass', 2500], ['highpass', 300]]);
          patterInto(x, sr, t, 0.06, 0.4 * a, 8 + Math.floor(rng.next() * 10), rng);
        });
        scatter(rng, len, 3, () => 1, (t) => archInto(x, sr, t, 0.6 * powerLaw(rng, 0.35, 2), rng, 0.2));
      }),
      15,
    );
    const low = loopFilter(loopPink(n, rng), sr, [['lowpass', 240, 0.7], ['highpass', 35, 0.7]]);
    const [rs, rg, re, rl] = [rmsOf(scrub), rmsOf(grit), rmsOf(ev), rmsOf(low)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      out[i] = (scrub[i] * rough(u) * dig(u)) / rs + (0.5 * grit[i]) / rg + (0.55 * ev[i]) / re + (0.4 * low[i]) / rl;
    }
    return tyreFinish(out, sr, 8000);
  };
}

/**
 * A slide on grass: the turf torn up under the tread: a ripping (fibres and roots snapping in quick runs,
 * quicker as the sod tears), a wet swish of the blades over the rubber, the wet earth squishing, clods
 * of it thrown against the arch, the slide's low rumble. Seamless.
 */
function skidGrass(): Recipe {
  return (sr, rng) => {
    const len = 4.3;
    const n = Math.floor(len * sr);
    const tear = wander(rng, 10, 0.5, 1);
    const colours: GrainColour[] = [[[['bandpass', 1200, 1]], 1], [[['bandpass', 2400, 1]], 0.9], [[['highpass', 3500, 0.7], ['lowpass', 8000, 0.7]], 0.6]];
    const bus = colours.map(() => new Float32Array(2 * n));
    scatter(rng, len, 9, (t) => tear(t / len), (t, v) => {
      // a rip: fibres snapping one after another, quicker and quicker
      const b = bus[Math.floor(rng.next() * bus.length)];
      const m = 15 + Math.floor(rng.next() * 45);
      const span = rng.range(0.04, 0.15);
      const g = v * rng.range(0.5, 1);
      for (let k = 0; k < m; k++) grainInto(b, sr, t + span * Math.sqrt(k / m), g * powerLaw(rng, 0.3, 2), rng.range(0.00005, 0.0003), rng);
    });
    const rip = new Float32Array(n);
    bus.forEach((b, k) => mixInto(rip, loopFilter(fold(b), sr, colours[k][0]), 0, colours[k][1]));
    tame(rip, 13);
    const sw = swells(sr, len, rng, 10, 0.08, 0.3, 0.4);
    const swish = loopFilter(noise(n, rng), sr, [['highpass', 1400, 0.6], ['peaking', 3200, 0.8, 4], ['lowpass', 7000, 0.7]]);
    const wet = tame(
      cyclic(sr, len, (x) => {
        // the wet earth squished: a short smack of noise falling in pitch
        scatter(rng, len, 9, () => 1, (t) => {
          const m = Math.floor(rng.range(0.025, 0.06) * sr);
          const f0 = rng.range(900, 1600);
          const sq = sweptBand(noise(m, rng), sr, (tt) => f0 * (1 - 8 * tt), 2.5);
          const a = rng.range(0.3, 1);
          for (let i = 0; i < m; i++) sq[i] *= a * Math.min(1, i / (0.003 * sr)) * Math.exp(-i / (0.012 * sr));
          mixInto(x, sq, Math.floor(t * sr), 1);
        });
        scatter(rng, len, 3, () => 1, (t) => {
          pinkBurstInto(x, sr, t, 0.06, 0.8, 0.002, 0.015, rng, [['lowpass', 700], ['highpass', 80]]);
          thudInto(x, sr, t, rng, 0.25, rng.range(110, 170), 0.01);
        });
      }),
      14,
    );
    const low = loopFilter(loopPink(n, rng), sr, [['lowpass', 220, 0.7], ['highpass', 35, 0.7]]);
    const [rr, rs, rw, rl] = [rmsOf(rip), rmsOf(swish), rmsOf(wet), rmsOf(low)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = rip[i] / rr + (0.7 * swish[i] * sw[i]) / rs + (0.4 * wet[i]) / rw + (0.35 * low[i]) / rl;
    return tyreFinish(out, sr, 8000);
  };
}

/**
 * A slide in sand: a soft hissing (the grains streaming and sliding over one another: a fine, dense
 * hiss), the whoosh of sand pushed aside in a wave, sand sprayed up pattering hard on the arches and the
 * sills, a soft low rumble. Seamless.
 */
function skidSand(): Recipe {
  return (sr, rng) => {
    const len = 4.4;
    const n = Math.floor(len * sr);
    const surge = wander(rng, 10, 0.55, 1);
    const surge2 = wander(rng, Math.round(len * 4), 0.5, 1);
    const hiss = loopFilter(cyclic(sr, len, (x) => scatter(rng, len, 9000, (t) => surge(t / len), (t) => grainInto(x, sr, t, powerLaw(rng, 0.3, 3), rng.range(0.00004, 0.00012), rng))), sr, [['highpass', 1800, 0.7], ['lowpass', 7500, 0.7]]);
    const whoosh = loopFilter(loopPink(n, rng), sr, [['bandpass', 600, 0.5]]);
    const spray = tame(loopFilter(cyclic(sr, len, (x) => scatter(rng, len, 7, () => 1, (t) => patterInto(x, sr, t, rng.range(0.08, 0.25), powerLaw(rng, 0.4, 2), 40 + Math.floor(rng.next() * 60), rng))), sr, [['bandpass', 3500, 0.8], ['lowpass', 8000, 0.7]]), 14);
    const low = loopFilter(loopPink(n, rng), sr, [['lowpass', 200, 0.7], ['highpass', 30, 0.7]]);
    const [rh, rw, rs, rl] = [rmsOf(hiss), rmsOf(whoosh), rmsOf(spray), rmsOf(low)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      out[i] = (hiss[i] * surge(u)) / rh + (0.6 * whoosh[i] * surge2(u)) / rw + (0.55 * spray[i]) / rs + (0.35 * low[i]) / rl;
    }
    return tyreFinish(out, sr, 8000);
  };
}

/**
 * A slide on packed snow: the snow squeaking under the sliding tread (squeals of 1.1-2.4 kHz, longer
 * and more often than rolling, now in quick runs), crunching, snow sprayed off in a soft hiss, a low
 * rumble. Seamless.
 */
function skidSnow(): Recipe {
  return (sr, rng) => {
    const len = 4.4;
    const n = Math.floor(len * sr);
    const pack = wander(rng, 10, 0.5, 1);
    const squeak = cyclic(sr, len, (x) =>
      scatter(rng, len, 12, (t) => pack(t / len), (t) => squealInto(x, sr, t, rng.range(0.04, 0.16), rng.range(1100, 2400), rng.range(0.5, 1), rng, { bright: rng.range(0.45, 0.8), waver: 0.05, glide: 0.25, grip: 0.55, jitter: 0.03 })),
    );
    const crunch = crunchLoop(sr, len, rng, 260, (t) => pack(t / len), [
      [[['bandpass', 1500, 1]], 1.1],
      [[['bandpass', 2700, 1]], 1],
      [[['highpass', 3200, 0.7], ['lowpass', 7500, 0.7]], 0.6],
    ], { gap: 0.0012, most: 12, crestDb: 12 });
    const sp = swells(sr, len, rng, 6, 0.15, 0.5, 0.5);
    const spray = loopFilter(noise(n, rng), sr, [['highpass', 1600, 0.7], ['lowpass', 6500, 0.7]]);
    const low = loopFilter(loopPink(n, rng), sr, [['lowpass', 220, 0.7], ['highpass', 35, 0.7]]);
    const [rq, rc, rs, rl] = [rmsOf(squeak), rmsOf(crunch), rmsOf(spray), rmsOf(low)];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = squeak[i] / rq + (0.75 * crunch[i]) / rc + (0.4 * spray[i] * sp[i]) / rs + (0.3 * low[i]) / rl;
    return tyreFinish(out, sr, 8500);
  };
}

/**
 * A slide on ice: a hissing scrape (the rubber gliding over the polished ice: a smooth broadband hiss,
 * 1.5-6 kHz, a little rough where the tread drags), frost and ice crystals scraped off crackling faintly,
 * almost no squeal (the faintest, rarely), a faint low hum. Seamless.
 */
function skidIce(): Recipe {
  return (sr, rng) => {
    const len = 4.3;
    const n = Math.floor(len * sr);
    const flutter = wander(rng, Math.round(len * 20), 0.85, 1.15);
    const rough = wander(rng, Math.round(len * 50), 0.2, 1);
    const hiss = loopFilter(noise(n, rng), sr, [['highpass', 1200, 0.7], ['peaking', 3600, 0.8, 4], ['lowpass', 7500, 0.7]]);
    const rasp = loopFilter(noise(n, rng), sr, [['bandpass', 1400, 0.8]]);
    const frost = crunchLoop(sr, len, rng, 120, () => 1, [[[['highpass', 3500, 0.7], ['lowpass', 8000, 0.7]], 1], [[['bandpass', 2500, 1]], 0.6]], { most: 4, crestDb: 12 });
    const squeak = cyclic(sr, len, (x) => scatter(rng, len, 0.6, () => 1, (t) => squealInto(x, sr, t, rng.range(0.06, 0.2), rng.range(1800, 2600), rng.range(0.5, 1), rng, { bright: 0.4, waver: 0.04, glide: 0.2, grip: 0.5 })));
    const low = loopFilter(loopPink(n, rng), sr, [['lowpass', 200, 0.7], ['highpass', 40, 0.7]]);
    const [rh, rr, rf, rl] = [rmsOf(hiss), rmsOf(rasp), rmsOf(frost), rmsOf(low)];
    // (the squeal barely there: its peak a third of the hiss's rms)
    const kq = 0.35 / peakOf(squeak);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      out[i] = (hiss[i] * flutter(u)) / rh + (0.35 * rasp[i] * rough(u)) / rr + (0.3 * frost[i]) / rf + kq * squeak[i] + (0.2 * low[i]) / rl;
    }
    return tyreFinish(out, sr, 8000);
  };
}

// ------------------------------------------------------------------ catalogue

const SHOT_LEVEL: Record<FoleyShot, number> = {
  door_open: 0.5, door_close: 0.9, latch: 0.5, hood_open: 0.5, hood_close: 0.95, trunk_open: 0.5, trunk_close: 0.85,
  part_pickup: 0.5, part_setdown: 0.8, part_install: 0.75, part_remove: 0.65, key_turn: 0.45, handbrake_pull: 0.6,
  handbrake_release: 0.55, gear_shift: 0.55, gear_grind: 0.6, spray_shake: 0.45, horn_trumpet: 0.42, switch: 0.35, lever: 0.45,
  crash: 1.0,
  bite: 0.55, wrapper: 0.4, can_open: 0.5, cap_open: 0.4, pills: 0.4, gulp: 0.5, hurt: 0.8, cloth: 0.45,
  // the workshop
  // (set against the doors, the ratchet and the engines: K-weighted loudness at these levels, momentary max, the
  // door slam -19 LUFS, a 25 kg part set down -23, the generator at 4 m -31 running light; see docs/MODCAR_AUDIO.md)
  cord_pull: 0.31, gen_switch: 0.5, gen_cough: 0.39, shred: 0.36, tally: 0.44, craft_start: 0.35, hammer_swing: 0.35, hammer_hit: 0.9, craft_done: 0.33,
  power_on: 0.28, power_off: 0.55, no_power: 0.6,
  // scrubbing (the catch and the chimes over a scrub loop at full gain: the catch a touch under it, the
  // ding -22.5 like the bench's, the fanfare -20.5, the flakes falling far under it at -44)
  scrape_start: 0.63, flake_drop: 0.35, clean_ding: 0.34, clean_rust_done: 0.29, clean_car_done: 0.37, tool_worn: 0.7, highlight_ping: 0.3,
  // spray paint (the valve's pssht set against spray_hiss easing in under it: a few dB over it, then the hiss's own level;
  // the sputter going on from it a little weaker; the shake a little under it; the coat done a little under the ding)
  spray_rattle: 0.42, spray_start: 0.17, spray_sputter: 0.13, paint_done: 0.27,
  // tyres and wrecks (the blowout a little under the crash, far over a door; the wreck forced open a little under a
  // door; the find a little over paint_done, a golden one over the ding, under the fanfare)
  tyre_burst: 0.89, wreck_creak: 0.35, loot_reveal: 0.36,
  // roadside places (a container opened about as loud as a car door opened, its search under it like the sponge; a
  // house door a little under a car door, the shop's bell gentle; the pump's click like a latch, its run under an idle)
  container_open: 0.5, container_empty: 0.5, door_house_open: 0.29, door_house_close: 0.8, door_shop_open: 0.5, door_shop_close: 0.69,
  pump_lift: 0.42, pump_hang: 0.45, pump_click: 0.4, pump_dry: 0.114,
};

const LOOP_LEVEL: Record<FoleyLoop, number> = {
  ratchet: 0.6, spray: 0.45, sponge: 0.45, pour: 0.5, horn_beep: 0.4, horn_air: 0.36, glug: 0.5, breath: 0.4, heart: 0.5, pee: 0.3,
  recycler_run: 0.17, recycler_grind: 0.23, lamp_buzz: 0.03,
  // (at gain 1 the scrapes and the brush about as loud as the ratchet, -30 LUFS, rust a touch harder, mud and the sponge softer)
  scrape_glass: 0.29, scrape_metal: 0.39, scrape_rust: 0.32, scrape_mud: 0.36, brush_wire: 0.29, sponge_scrub: 0.38,
  spray_hiss: 0.27,
  // (the flap about as loud as the scrapes at gain 1, the bare rim louder, the glint very faint)
  flat_flap: 0.56, rim_grind: 0.56, rare_glint: 0.085,
  // (the search about as loud as the scrapes and the sponge at gain 1, the pump at full flow under an engine's idle)
  rummage: 0.4, pump_run: 0.116,
  // tyres on the road (gain 1, rate 1: 50 km/h, or a full slide): rolling, the asphalt the bed under it all at -36 LUFS (6 dB under
  // a scrape, under an engine pulling), gravel the loudest roll (-32), snow -34, dirt and sand with the asphalt, wet asphalt's water
  // -35 over it, grass far under gravel (-40), ice very quiet (-45); sliding, the asphalt's squeal -28 (over every roll, under the
  // bare rim), gravel's -28.5, dirt -30, snow -30.5, sand -31, grass -32, ice -34
  roll_asphalt: 0.165, roll_wet: 0.13, roll_gravel: 0.2, roll_dirt: 0.18, roll_grass: 0.083, roll_sand: 0.185, roll_snow: 0.153, roll_ice: 0.06,
  skid_asphalt: 0.375, skid_gravel: 0.3, skid_dirt: 0.27, skid_grass: 0.195, skid_sand: 0.22, skid_snow: 0.233, skid_ice: 0.145,
};

/**
 * more renderings of the sounds that come in quick runs (a hammer struck 1-3 times, things shredded one
 * after another, the counter, strokes begun, bits falling); one of a tune (the chimes that are the same
 * every time; the ding has a few, only its glint different)
 */
const SHOT_VARIANTS: Partial<Record<FoleyShot, number>> = { hammer_hit: 5, shred: 4, tally: 4, cord_pull: 4, scrape_start: 4, flake_drop: 8, clean_rust_done: 1, clean_car_done: 1, highlight_ping: 1, loot_reveal: 1, container_open: 4, door_house_open: 4 };

/** the chimes are tuned: they play at their own pitch and level every time (detuned by a percent or so they would be out of tune with one another, and with themselves) */
const TUNED: ReadonlySet<string> = new Set<FoleyShot>(['clean_ding', 'clean_rust_done', 'clean_car_done', 'highlight_ping', 'paint_done', 'loot_reveal', 'door_shop_open']);

/** the sounds of a container searched: their material is a container's, always in their key (none is a wooden cupboard's) */
const CONTAINER_KINDS: ReadonlySet<string> = new Set<FoleyShot | FoleyLoop>(['rummage', 'container_open', 'container_empty']);

const PANELS: readonly string[] = ['metal', 'rusty', 'armor', 'cage', 'fridge'];

/** a door's material from FoleyOpts.material: a panel's, else (a container's, or none) the stock steel door's */
function panelOf(m: FoleyOpts['material']): PanelMaterial {
  return m !== undefined && PANELS.includes(m) ? (m as PanelMaterial) : 'metal';
}

/** loot_reveal's tier as a whole 1..5 (3 for anything that is not a number) */
function tierOf(t: number | undefined): number {
  return t !== undefined && Number.isFinite(t) ? Math.min(5, Math.max(1, Math.round(t))) : 3;
}

function massClass(m: number): number {
  // 0.25, 1, 4, 16, 64, 250 kg classes keep the cache small
  return Math.pow(4, Math.round(Math.log(Math.max(0.1, m)) / Math.log(4)));
}

/** the recipe for a sound and its options (exported for tests and the render harness) */
export function recipe(kind: FoleyShot | FoleyLoop, o: FoleyOpts = {}): Recipe {
  const mat = panelOf(o.material);
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
    case 'cord_pull': return cordPull();
    case 'gen_switch': return genSwitch();
    case 'gen_cough': return genCough();
    case 'shred': return shred(o.grind ?? 'metal');
    case 'tally': return tally();
    case 'craft_start': return craftStart();
    case 'hammer_swing': return hammerSwing();
    case 'hammer_hit': return hammerHit(o.grind ?? 'metal');
    case 'craft_done': return craftDone();
    case 'power_on': return powerOn();
    case 'power_off': return powerOff();
    case 'no_power': return noPower();
    case 'scrape_start': return scrapeStart(o.surface ?? 'metal');
    case 'flake_drop': return flakeDrop();
    case 'clean_ding': return cleanDing();
    case 'clean_rust_done': return cleanRustDone();
    case 'clean_car_done': return cleanCarDone();
    case 'tool_worn': return toolWorn();
    case 'highlight_ping': return highlightPing();
    case 'spray_rattle': return sprayRattle();
    case 'spray_start': return sprayStart();
    case 'spray_sputter': return spraySputter();
    case 'paint_done': return paintDone();
    case 'tyre_burst': return tyreBurst();
    case 'wreck_creak': return wreckCreak();
    case 'loot_reveal': return lootReveal(tierOf(o.tier));
    case 'container_open': return containerOpen(containerOf(o.material));
    case 'container_empty': return containerEmpty(containerOf(o.material));
    case 'door_house_open': return doorHouseOpen();
    case 'door_house_close': return doorHouseClose();
    case 'door_shop_open': return doorShopOpen();
    case 'door_shop_close': return doorShopClose();
    case 'pump_lift': return pumpLift();
    case 'pump_hang': return pumpHang();
    case 'pump_click': return pumpClick();
    case 'pump_dry': return pumpDry();
    case 'recycler_run': return recyclerRun();
    case 'recycler_grind': return recyclerGrind();
    case 'lamp_buzz': return lampBuzz();
    case 'scrape_glass': return scrapeGlass();
    case 'scrape_metal': return scrapeMetal();
    case 'scrape_rust': return scrapeRust();
    case 'scrape_mud': return scrapeMud();
    case 'brush_wire': return brushWire();
    case 'sponge_scrub': return spongeScrub();
    case 'spray_hiss': return sprayHiss();
    case 'flat_flap': return flatFlap();
    case 'rim_grind': return rimGrind();
    case 'rare_glint': return rareGlint();
    case 'rummage': return rummage(containerOf(o.material));
    case 'pump_run': return pumpRun();
    case 'roll_asphalt': return rollAsphalt();
    case 'roll_wet': return rollWet();
    case 'roll_gravel': return rollGravel();
    case 'roll_dirt': return rollDirt();
    case 'roll_grass': return rollGrass();
    case 'roll_sand': return rollSand();
    case 'roll_snow': return rollSnow();
    case 'roll_ice': return rollIce();
    case 'skid_asphalt': return skidAsphalt();
    case 'skid_gravel': return skidGravel();
    case 'skid_dirt': return skidDirt();
    case 'skid_grass': return skidGrass();
    case 'skid_sand': return skidSand();
    case 'skid_snow': return skidSnow();
    case 'skid_ice': return skidIce();
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

/** the level a sound plays at (before FoleyOpts.gain and the small per-play variation), for tests and the harness */
export function foleyLevel(kind: FoleyShot | FoleyLoop): number {
  return (SHOT_LEVEL as Record<string, number>)[kind] ?? (LOOP_LEVEL as Record<string, number>)[kind] ?? 0;
}

const VARIANTS = 3;

/**
 * How far a loop's pitch follows the rate it is given (1, all the way, if not here). The glass
 * scrape's squeal is a tone, and a tone swept more than an octave by every stroke is a slide
 * whistle: half way, it still rises with a fast stroke as a squeak does, by a fifth at most.
 * The tyres on the road follow their speed part of the way: a tyre's roar stays round the same
 * pitch from 30 to 120 km/h, only brighter, and gravel crushed slowly still crunches, not thuds (so
 * a crawl, rate 0.15, plays them about an octave down and 120 km/h, 2.4, about one up); the
 * asphalt's squeal hardly moves (about a fifth from the slowest slide to the fastest).
 */
const RATE_SPAN: Partial<Record<FoleyLoop, number>> = {
  scrape_glass: 0.5, rim_grind: 0.5,
  roll_asphalt: 0.55, roll_wet: 0.5, roll_gravel: 0.6, roll_dirt: 0.55, roll_grass: 0.55, roll_sand: 0.5, roll_snow: 0.55, roll_ice: 0.55,
  skid_asphalt: 0.3, skid_gravel: 0.6, skid_dirt: 0.6, skid_grass: 0.6, skid_sand: 0.5, skid_snow: 0.4, skid_ice: 0.5,
};

/** the rates a loop takes (0.5..2 if not here): a wheel's from walking pace to a hundred, for the tyres' (the bare rim's grind follows half way); a rolling tyre's from a crawl to 150 km/h (rate 1 about 50) */
const RATE_RANGE: Partial<Record<FoleyLoop, readonly [number, number]>> = {
  flat_flap: [0.25, 3.5], rim_grind: [0.25, 3.5],
  roll_asphalt: [0.1, 3], roll_wet: [0.1, 3], roll_gravel: [0.1, 3], roll_dirt: [0.1, 3], roll_grass: [0.1, 3], roll_sand: [0.1, 3], roll_snow: [0.1, 3], roll_ice: [0.1, 3],
};

/** the playback rate a loop plays at for the rate asked (FoleyOpts.rate): kept to its range, then followed as far as the loop's span (exported for tests and the harness) */
export function loopPlaybackRate(kind: FoleyLoop, rate: number | undefined): number {
  const [lo, hi] = RATE_RANGE[kind] ?? [0.5, 2];
  const r = rate !== undefined && Number.isFinite(rate) ? Math.min(hi, Math.max(lo, rate)) : 1;
  return 1 + (RATE_SPAN[kind] ?? 1) * (r - 1);
}

/** a loop's own low-pass (FoleyOpts.cutoff): its Q, in dB as a Web Audio low-pass reads it (−3.01 dB is 1/√2: Butterworth, flat up to its corner, no bump), and how fast it glides to a new cutoff (s: a door shut muffles it in about a tenth of a second) */
const CUTOFF_Q_DB = -3.0103;
const CUTOFF_GLIDE = 0.05;

/** the cutoff (Hz) a loop is muffled to for the cutoff asked (FoleyOpts.cutoff): kept to 10 Hz .. the Nyquist frequency; none (not given, or not a number) is no low-pass (exported for tests and the harness) */
export function loopCutoff(sampleRate: number, cutoff: number | undefined): number | undefined {
  return cutoff !== undefined && Number.isFinite(cutoff) ? Math.min(sampleRate / 2, Math.max(10, cutoff)) : undefined;
}

/** a loop playing: its source, its gain, and its low-pass between them once it has been given a cutoff */
interface LiveLoop {
  src: AudioBufferSourceNode;
  gain: GainNode;
  filter?: BiquadFilterNode;
}

/** plays the mechanical sounds on an AudioContext (the game's, or an offline one) */
export class Foley {
  readonly ctx: BaseAudioContext;
  readonly out: GainNode;
  private readonly cache = new Map<string, AudioBuffer[]>();
  private readonly loops = new Map<string, LiveLoop>();
  private readonly rng = new Rng(0xf01e7);
  /** the rendering each one-shot played last (the next one is never the same) */
  private readonly lastPick = new Map<string, number>();

  constructor(ctx: BaseAudioContext, output: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.connect(output);
  }

  private key(kind: string, o: FoleyOpts): string {
    // (the grind only when given: the other sounds keep their keys, and with them their seeds; the surface
    // likewise, and only for the blade's catch (the tier only for the find's sting, always: no tier is the middle one): each scrub loop is a kind of its own whatever it is given;
    // the gain and the rate are how it is played, never another rendering; a container's material always, resolved:
    // none is a wooden cupboard's)
    return `${kind}|${CONTAINER_KINDS.has(kind) ? containerOf(o.material) : (o.material ?? '')}|${o.mass !== undefined ? massClass(o.mass) : ''}|${o.liquid ?? ''}${o.grind ? `|${o.grind}` : ''}${o.surface && kind === 'scrape_start' ? `|${o.surface}` : ''}${kind === 'loot_reveal' ? `|t${tierOf(o.tier)}` : ''}`;
  }

  /** how many renderings of a one-shot to keep (a tune is the same every time: one is enough) */
  private variants(kind: FoleyShot | FoleyLoop): number {
    if ((FOLEY_LOOPS as readonly string[]).includes(kind) || kind === 'horn_trumpet') return 1;
    return SHOT_VARIANTS[kind as FoleyShot] ?? VARIANTS;
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
    for (const k of kinds) this.buffers(k, o, this.variants(k));
  }

  private route(src: AudioBufferSourceNode, gain: number, pan?: number, filter?: BiquadFilterNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    // (a loop given a cutoff goes through its own low-pass first)
    const from: AudioNode = filter ? src.connect(filter) : src;
    if (pan !== undefined && this.ctx.destination.channelCount > 1) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      from.connect(g).connect(p).connect(this.out);
    } else {
      from.connect(g).connect(this.out);
    }
    return g;
  }

  /** a loop's own low-pass at f Hz from t (FoleyOpts.cutoff) */
  private lowpass(f: number, t: number): BiquadFilterNode {
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = CUTOFF_Q_DB;
    lp.frequency.setValueAtTime(f, t);
    return lp;
  }

  /**
   * glide a playing loop's low-pass to a cutoff, or (none given) open to the Nyquist frequency, where it
   * passes everything; a loop playing without one is given one first, open, between its source and its
   * gain (the new path made before the old one is let go: no gap in the sound)
   */
  private cutoffTo(live: LiveLoop, cutoff: number | undefined, t: number): void {
    const open = this.ctx.sampleRate / 2;
    if (!live.filter) {
      const lp = this.lowpass(open, t);
      lp.connect(live.gain);
      live.src.connect(lp);
      live.src.disconnect(live.gain);
      live.filter = lp;
    }
    live.filter.frequency.setTargetAtTime(cutoff ?? open, t, CUTOFF_GLIDE);
  }

  /** a one-shot */
  play(kind: FoleyShot, o: FoleyOpts = {}, when = 0): void {
    const list = this.buffers(kind, o, this.variants(kind));
    const src = this.ctx.createBufferSource();
    // never the same rendering twice running (the hammer struck again, the next thing shredded)
    const k = this.key(kind, o);
    let pick = Math.floor(this.rng.next() * list.length);
    if (list.length > 1 && pick === this.lastPick.get(k)) pick = (pick + 1 + Math.floor(this.rng.next() * (list.length - 1))) % list.length;
    this.lastPick.set(k, pick);
    src.buffer = list[pick];
    // a hair of pitch and level variation so repeats are not identical (not for the chimes: they are tuned)
    const detune = 1 + 0.03 * (this.rng.next() - 0.5);
    const vary = 0.92 + 0.16 * this.rng.next();
    const tuned = TUNED.has(kind);
    src.playbackRate.value = tuned ? 1 : detune;
    const g = this.route(src, SHOT_LEVEL[kind] * (o.gain ?? 1) * (tuned ? 1 : vary), o.pan);
    const t = Math.max(this.ctx.currentTime, when);
    src.start(t);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
  }

  /**
   * start or keep a loop going (the ratchet while a part is being fitted, a horn while held, a scrub
   * while the tool moves, a tyre while it rolls, ...); called again while it plays, its level, its rate
   * and its cutoff glide to the new gain, rate and cutoff (a scrub calls this every frame with the
   * stroke's speed: it never restarts for that)
   */
  start(kind: FoleyLoop, o: FoleyOpts = {}): void {
    const k = this.key(kind, o);
    const live = this.loops.get(kind);
    const t = this.ctx.currentTime;
    const rate = loopPlaybackRate(kind, o.rate);
    const cutoff = loopCutoff(this.ctx.sampleRate, o.cutoff);
    if (live && live.src.buffer && this.cache.get(k)?.includes(live.src.buffer)) {
      live.gain.gain.setTargetAtTime(LOOP_LEVEL[kind] * (o.gain ?? 1), t, 0.02);
      // (the pitch slides, it does not step: a step in playback rate is heard as a jump)
      live.src.playbackRate.setTargetAtTime(rate, t, 0.03);
      // (and the muffling with them; a loop never given a cutoff is left as it is)
      if (cutoff !== undefined || live.filter) this.cutoffTo(live, cutoff, t);
      return;
    }
    if (live) this.stop(kind);
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers(kind, o, 1)[0];
    src.loop = true;
    src.playbackRate.setValueAtTime(rate, t);
    const filter = cutoff !== undefined ? this.lowpass(cutoff, t) : undefined;
    const g = this.route(src, 0, o.pan, filter);
    // horns snap on; the rest ease in
    const attack = kind === 'horn_beep' || kind === 'horn_air' ? 0.006 : 0.03;
    g.gain.setValueAtTime(0, t);
    g.gain.setTargetAtTime(LOOP_LEVEL[kind] * (o.gain ?? 1), t, attack);
    src.start(t, this.rng.next() * src.buffer.duration);
    this.loops.set(kind, { src, gain: g, filter });
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
    // (everything let go once it has rung out: its low-pass too, if it had one)
    live.src.onended = () => {
      live.src.disconnect();
      live.gain.disconnect();
      live.filter?.disconnect();
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
