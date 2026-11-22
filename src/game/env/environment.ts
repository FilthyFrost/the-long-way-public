/**
 * Environment: turns clock + weather into what you see — light, sky, fog, precipitation,
 * wet glass, lightning — and feeds grip-relevant state back to the world.
 */
import * as THREE from 'three';
import { DayClock, SkyState } from '../../core/env/time';
import { WEATHER_KINDS, WeatherState, WeatherSystem, type WeatherKind } from '../../core/env/weather';
import { fbm1 } from '../../core/math/noise';
import { hash2 } from '../../core/math/rng';
import { BIOMES } from '../../core/world/biomes';
import type { World } from '../../core/world/terrain';
import type { RenderCore } from '../render/core';
import { windscreenUniforms } from '../render/materials';
import { waterUniforms } from '../render/water';
import { globals } from '../render/shaderlib';
import { Look, computeLook } from './colorScript';
import { Precipitation, type PrecipKind } from './precip';
import { skyUniforms } from './sky';
import { Clouds } from './clouds';
import { LightState, STYLE, lightAt, styleOf } from '../render/style';
import type { PlaceSky } from '../../core/world/earth/palette';
import { mistAt, type Mist } from './mist';

export class Environment {
  readonly clock = new DayClock();
  readonly weather: WeatherSystem;
  readonly sky = new SkyState();
  readonly look = new Look();
  /** latest weather */
  state: WeatherState;
  /** wiper cycle position 0…1 (0 = parked) */
  wipePhase = 0;
  /** the seconds a wiper cycle takes now (0 = parked), and how much rain the glass is getting (0…1) */
  wipePeriod = 0;
  glassWet = 0;
  wipersOn = false;
  /** the wiper switch: 'auto' follows the rain on the glass, 'slow' and 'fast' sweep whatever the weather, 'off' parks them (and the rain stays on the glass) */
  wiperMode: 'auto' | 'off' | 'slow' | 'fast' = 'auto';
  /** true when it is dark enough that lights should be on */
  dark = false;
  /** lightning flash level right now, 0…1 */
  flash = 0;
  /** the developer's dials on the weather, after each step and before anything is drawn from it (null: none) */
  tune: ((w: WeatherState) => void) | null = null;
  /** how much rain the glass holds, and how fast the wipers sweep (1 = as designed) */
  glassRain = 1;
  wiperRate = 1;
  readonly precip: Precipitation;
  /** the weather as the dials have it (a copy: the system's own state stays as the schedule makes it) */
  private readonly tuned = new WeatherState();
  private readonly wind = new THREE.Vector3();
  private readonly camVel = new THREE.Vector3();
  private readonly cloudOff = new THREE.Vector2();
  private flashAge = 10;
  private lastFlashSlot = -1;
  private struck = false;
  private readonly amounts: Record<PrecipKind, number> = { rain: 0, snow: 0, hail: 0, dust: 0, leaf: 0, gust: 0 };
  private readonly leafColor = new THREE.Color();
  private stepAcc = 0;
  clouds: Clouds | null = null;
  /** draw the whole cloud cube on the next update (start-up, screenshots) */
  cloudsNow = true;
  /** world position of the camera, for the cloud cube */
  camX = 0;
  camZ = 0;
  /** (V8) the mist of the low ground: what there should be, what there is (eased toward it), when next to ask */
  private readonly mistWant: Mist = { top: 0, soft: 30, density: 0 };
  private readonly mistNow: Mist = { top: 0, soft: 30, density: 0 };
  private mistAsk = 0;
  /** (V8) how far the eye has opened to the dark of a tunnel: 0 day … 1 (slow to open, quick to close: the glare out of
   * the portal, the view coming up out of it) */
  private eyeDark = 0;
  /** screenshot mode: no strip-by-strip cloud updates; prepareShot() draws the whole cube when needed */
  shotMode = false;
  private shotKey = '';
  private lastCover = 0.3;
  private readonly cloudDrift = new THREE.Vector2();
  private readonly moonUp = new THREE.Vector3();
  /** the layers above the heaps (V1b): how far their winds have carried them, the light at their heights */
  private readonly layerDrift = new THREE.Vector4();
  private readonly hiLight = new LightState();
  /** the lenticular stack: where the nearest high peak is (looked for every few seconds), and when it was looked for */
  private readonly lens = { az: 0, el: 0.1, w: 0.08, k: 0, at: -1e9 };
  private readonly lensPt = { h: 0 } as { h: number };
  /** the heaps' base (m) for the place */
  private cloudBase = 1300;
  /**
   * the developer's sky (V1b): amounts forced on the clouds, whatever the place (null: the places' own) — cirrus,
   * cirrocumulus, altocumulus, veil, waves (and ribbon 0/1), lens, nlc, cumulus (a multiplier of the heaps)
   */
  skyTune: Partial<Record<'cirrus' | 'cirrocumulus' | 'altocumulus' | 'veil' | 'waves' | 'ribbon' | 'lens' | 'nlc' | 'cumulus', number>> | null = null;

  constructor(
    private readonly core: RenderCore,
    readonly seed: number,
    opts: { hour?: number; weather?: string; stage?: number } = {},
  ) {
    this.weather = new WeatherSystem(seed);
    this.state = this.weather.state;
    if (opts.hour !== undefined && Number.isFinite(opts.hour)) this.clock.setHour(opts.hour, 0);
    if (opts.weather && (WEATHER_KINDS as readonly string[]).includes(opts.weather)) this.weather.force = opts.weather as WeatherKind;
    if (opts.stage !== undefined && Number.isFinite(opts.stage)) this.weather.stage = opts.stage;
    this.precip = new Precipitation(core.scene, core.quality.density);
    const q = core.quality.msaa >= 4 ? 'high' : core.quality.msaa >= 2 ? 'med' : 'low';
    this.clouds = new Clouds(core.renderer, seed, { size: STYLE.clouds.cubeSize[q], steps: STYLE.clouds.steps[q] });
  }

  /** Screenshot mode: draw the whole cloud cube if the camera, light or cover changed since the last one. */
  prepareShot(): void {
    if (!this.clouds) return;
    const d = globals.uSunDir.value;
    const key = [Math.round(this.camX / 50), Math.round(this.camZ / 50), d.x.toFixed(3), d.y.toFixed(3), d.z.toFixed(3), this.lastCover.toFixed(2), skyUniforms.uSunVis.value.toFixed(2)].join(',');
    if (key === this.shotKey) return;
    this.shotKey = key;
    this.clouds.drawAll(this.camX, this.camZ, this.lastCover, this.cloudDrift.x, this.cloudDrift.y, this.cloudBase, this.towerShare, this.lastTime);
  }

  /**
   * @param time    simulated seconds
   * @param ba,bb,bt biome mix at the player
   * @param camVel  camera velocity in world space
   */
  update(dt: number, time: number, ba: number, bb: number, bt: number, world: World | null, vx: number, vy: number, vz: number): void {
    this.lastTime = time;
    const sky = this.sky;
    this.clock.state(time, sky);

    // weather advances in fixed steps so its slow state is reproducible (from the system's own state: the
    // dials' copy of it is made again each frame)
    let w = this.weather.state;
    this.stepAcc += dt;
    if (dt === 0) w = this.weather.step(0, time, sky.hour, sky.daylight, ba, bb, bt);
    while (this.stepAcc >= 0.25) {
      w = this.weather.step(0.25, time, sky.hour, sky.daylight, ba, bb, bt);
      this.stepAcc -= 0.25;
    }
    if (this.tune) {
      this.tuned.copy(w);
      this.tune(this.tuned);
      w = this.tuned;
    }
    this.state = w;
    if (world) {
      world.wetness = w.wetness;
      world.snowCover = w.snowCover;
    }

    // ---- lightning: at most one flash per slot, decided by a hash so every player sees the same one
    this.flashAge += dt;
    if (w.lightning > 0) {
      const slot = Math.floor(time / 0.8);
      if (slot !== this.lastFlashSlot) {
        this.lastFlashSlot = slot;
        if ((hash2(slot, 0xf1a5, this.seed) & 0xffff) / 65536 < w.lightning * 0.8) this.flashAge = 0;
      }
    }
    if (this.struck) {
      this.struck = false;
      this.flashAge = 0;
      this.lastFlashSlot = Math.floor(time / 0.8) + 7;
    }
    const fa = this.flashAge;
    this.flash = fa < 0.6 ? Math.max(Math.exp(-fa / 0.05), fa > 0.16 ? 0.7 * Math.exp(-(fa - 0.16) / 0.09) : 0) : 0;
    if (fa === 0) {
      // where this one strikes: mostly under the body of the storm, each bolt its own shape
      const hb = hash2(this.lastFlashSlot, 0xb017, this.seed);
      const spread = ((hb & 0xffff) / 65536 - 0.5) * 1.3;
      const toStorm = w.windDir + (w.frontSide < 0 ? Math.PI : 0) + spread;
      skyUniforms.uBolt.value.set(Math.cos(toStorm), Math.sin(toStorm), ((hb >>> 16) & 0xfff) / 37, 0);
    }
    skyUniforms.uBolt.value.w = this.flash;

    // ---- light and sky
    const look = this.look;
    computeLook(sky, w, BIOMES[ba].id, BIOMES[bb].id, bt, look);
    globals.uSunDir.value.copy(look.dir);
    globals.uSunColor.value.copy(look.sun);
    globals.uSkyColor.value.copy(look.amb);
    globals.uBounceColor.value.copy(look.bounce);
    globals.uFogColor.value.copy(look.fog);
    globals.uFogSunColor.value.copy(look.fogSun);
    globals.uFogDensity.value = look.haze;
    {
      // the paints of the country here, for what has no ground of its own (the dark of the far bank in water)
      const ga = styleOf(ba);
      const gb = styleOf(bb);
      globals.uHereGround.value.setRGB(ga.ground.deep[0] + (gb.ground.deep[0] - ga.ground.deep[0]) * bt, ga.ground.deep[1] + (gb.ground.deep[1] - ga.ground.deep[1]) * bt, ga.ground.deep[2] + (gb.ground.deep[2] - ga.ground.deep[2]) * bt);
      globals.uHereForest.value.setRGB(ga.forest[1][0] + (gb.forest[1][0] - ga.forest[1][0]) * bt, ga.forest[1][1] + (gb.forest[1][1] - ga.forest[1][1]) * bt, ga.forest[1][2] + (gb.forest[1][2] - ga.forest[1][2]) * bt);
    }
    // (V8) the eye's own: in a tunnel it opens to the dark over a couple of seconds; out of it the day is a glare that
    // settles in one — the view beyond the portal coming up out of white (a gallery with its windows, half of it)
    {
      let under = 0;
      if (world && world.galleries) {
        const s = world.spine.sAtX(this.camX);
        const g = world.galleries.near(s);
        if (g && s > g.s0 + 4 && s < g.s1 - 4) under = g.kind === 'tunnel' ? 1 : g.kind === 'rock' ? 0.45 : 0.25;
      }
      const rate = under > this.eyeDark ? 1.8 : 0.9;
      this.eyeDark += (under - this.eyeDark) * (dt === 0 ? 1 : 1 - Math.exp(-dt / rate));
    }
    this.core.exposure = look.exposure * (1 + 1.25 * this.eyeDark);
    this.core.placeContrast = look.contrast;
    this.core.placeSaturation = look.saturation;
    this.core.night = sky.night;
    // shafts of light: a low sun, and air with something in it to catch them (mist, the damp after rain, dust)
    {
      const elev = sky.sunElev * (180 / Math.PI);
      // (G7: the place's own air — a wet wood's shows them half the day, a high dry country's hardly at all)
      const low = THREE.MathUtils.smoothstep(elev, 1.5, 7) * (1 - THREE.MathUtils.smoothstep(elev, 22 + 26 * look.shafts, 38 + 30 * look.shafts));
      const air = Math.min(1, look.shafts + w.fog * 1.6 + w.wetness * 0.45 + w.dust * 0.8 + w.murkRain * 0.3);
      this.core.shafts = look.moon > 0.5 ? 0 : 0.5 * low * air * look.sunVis;
      this.core.shaftColor.copy(look.glow).lerp(look.sun, 0.3).multiplyScalar(0.55);
    }
    if (this.flash > 0) {
      globals.uSkyColor.value.r += 0.9 * this.flash;
      globals.uSkyColor.value.g += 1.0 * this.flash;
      globals.uSkyColor.value.b += 1.25 * this.flash;
    }
    // the haze lies on the ground under the camera
    globals.uFogBase.value = this.core.camera.position.y - 2;
    // (V8) the mist on the low ground of a morning (env/mist.ts): asked every half second, eased in and out
    if (world && world.earth) {
      this.mistAsk -= dt;
      if (this.mistAsk <= 0 || dt === 0) {
        this.mistAsk = 0.5;
        mistAt(world, this.camX, this.camZ, sky.hour, this.clock.dayAt(time), w, this.mistWant);
      }
      const k = dt === 0 ? 1 : 1 - Math.exp(-dt / 2.5);
      const want = this.mistWant;
      if (this.mistNow.density <= 1e-5 && want.density > 0) {
        this.mistNow.top = want.top;
        this.mistNow.soft = want.soft;
      }
      if (want.density > 0) {
        this.mistNow.top += (want.top - this.mistNow.top) * k;
        this.mistNow.soft += (want.soft - this.mistNow.soft) * k;
      }
      this.mistNow.density += (want.density - this.mistNow.density) * k;
      const mv = globals.uMist.value;
      mv.set(this.mistNow.top - this.core.origin.y, this.mistNow.soft, this.mistNow.density > 2e-5 ? this.mistNow.density : 0, 0);
      // its top lit by the sun (gold when it is low), its body the sky's cool light
      const ml = globals.uMistLit.value;
      ml.setRGB(look.amb.r * 1.05 + look.sun.r * 0.45, look.amb.g * 1.05 + look.sun.g * 0.45, look.amb.b * 1.05 + look.sun.b * 0.45);
      globals.uMistShade.value.setRGB(look.amb.r * 0.95 + look.bounce.r * 0.25, look.amb.g * 0.95 + look.bounce.g * 0.25, look.amb.b * 0.95 + look.bounce.b * 0.25);
    } else globals.uMist.value.z = 0;
    {
      // the earth's shadow (V1): from the moment the sun touches the horizon its light leaves the low ground and climbs —
      // four hundred metres over the eye one degree down, twelve hundred at two — till only the peaks glow, then none
      const down = Math.max(0, 0.4 - sky.sunElev * (180 / Math.PI));
      const es = globals.uEarthShadow.value;
      if (down > 0 && look.moon < 0.5) es.set(this.core.camera.position.y - 30 + 400 * Math.pow(down, 1.6), 40 + 60 * down);
      else es.set(0, 0);
    }
    globals.uWeather.value.set(w.wetness, w.snowCover, Math.min(1, Math.max(w.rain, w.snow, w.dust)), sky.night);

    skyUniforms.uZenith.value.copy(look.zenith);
    skyUniforms.uMid.value.copy(look.mid);
    skyUniforms.uHorizon.value.copy(look.horizon);
    skyUniforms.uGlow.value.copy(look.glow);
    skyUniforms.uDisc.value.copy(look.glow).multiplyScalar(1.6).add(globals.uSunColor.value);
    skyUniforms.uSunDisc.value.set(sky.sunX, sky.sunY, sky.sunZ);
    skyUniforms.uMoonDir.value.set(sky.moonX, sky.moonY, sky.moonZ);
    skyUniforms.uSunVis.value = look.sunVis * (look.moon > 0.5 ? 0 : 1);
    {
      // twilight (V1): the belt of Venus from a little before sunset to the end of the blue hour (and the same at dawn),
      // as pink as the hour's glow is warm, the earth's shadow under it rising as the sun goes down
      const e = sky.sunElev * (180 / Math.PI);
      const k = THREE.MathUtils.smoothstep(e, -8, -1.5) * (1 - THREE.MathUtils.smoothstep(e, 1.5, 7)) * look.sunVis * (1 - w.overcast);
      const l = (look.horizon.r + look.horizon.g + look.horizon.b) / 3;
      skyUniforms.uBelt.value.set(l * 1.05, l * 0.62, l * 0.74, k);
      skyUniforms.uRise.value = THREE.MathUtils.clamp(0.015 - sky.sunY * 0.9, 0.012, 0.11);
    }
    skyUniforms.uStars.value = look.stars * (1 - Math.min(1, w.cloud * 0.9 + w.fog + w.dust));
    {
      // the night sky (V1): how clear the place's air is, the night's meteors (a shower one night in three, a few
      // strays on the rest), the moon's phase, the stars' turn about the pole through the night
      const na = BIOMES[ba].earth?.palette?.air.night;
      const nb = BIOMES[bb].earth?.palette?.air.night;
      const clarity = (na?.clarity ?? 1) + ((nb?.clarity ?? 1) - (na?.clarity ?? 1)) * bt;
      const night = this.clock.dayAt(time);
      const hm = (hash2(night, 0x5e7e, this.seed) & 0xffff) / 65536;
      const meteors = (hm < 0.34 ? 0.55 + hm * 1.3 : 0.12) * Math.min(1.25, clarity);
      skyUniforms.uNight.value.set(clarity, meteors, sky.moonPhase, ((sky.hour - 21.5) / 24) * Math.PI * 2);
      const hr = hash2(night, 0x7ad1, this.seed);
      skyUniforms.uMeteor.value.set(((hr & 0xffff) / 65536) * Math.PI * 2, 0.5 + (((hr >>> 16) & 0xff) / 255) * 0.6, night % 997);
    }
    this.wind.set(Math.cos(w.windDir) * w.wind, 0, Math.sin(w.windDir) * w.wind);
    globals.uWind.value.set(Math.cos(w.windDir), Math.sin(w.windDir), Math.min(1, w.wind / 18), globals.uWind.value.w + w.wind * dt * 0.6);
    this.cloudOff.x += this.wind.x * dt * 0.0016;
    this.cloudOff.y += this.wind.z * dt * 0.0016;
    // cumulus by day; under a full overcast the deck takes over. An event's own deck arrives as a front
    // from upwind (and leaves downwind), so only fair weather's overcast is laid over the whole sky at once
    const deck = THREE.MathUtils.smoothstep(w.front > 0 ? w.overcastCalm : w.overcast, 0.35, 0.85);
    const upwind = w.frontSide < 0 ? -1 : 1;
    skyUniforms.uStorm.value.set(Math.cos(w.windDir) * upwind, Math.sin(w.windDir) * upwind, w.front, Math.min(1, w.fall * 1.4));
    skyUniforms.uDeck.value.set(deck, w.rain * 0.7, this.cloudOff.x, this.cloudOff.y);
    skyUniforms.uDeckLit.value.copy(look.cloudMid);
    // the far bank of cloud thins out as the deck closes over and is gone in rain, fog and dust
    skyUniforms.uBank.value = 0.85 * (1 - deck) * (1 - Math.min(1, w.rain + w.fog + w.dust + w.snow));
    skyUniforms.uBankLit.value.copy(look.cloudLit);
    skyUniforms.uBankShade.value.copy(look.cloudShade);
    skyUniforms.uDeckShade.value.copy(look.cloudUnder);
    if (this.clouds) {
      this.clouds.setLight({ sunDir: sky.sunY > -0.05 ? globals.uSunDir.value : this.moonUp.set(sky.moonX, Math.max(sky.moonY, 0.1), sky.moonZ), lit: look.cloudLit, mid: look.cloudMid, shade: look.cloudShade, under: look.cloudUnder, haze: look.fog });
      skyUniforms.tClouds.value = this.clouds.texture;
      skyUniforms.uCloudsOn.value = 1;
      this.cloudDrift.x += this.wind.x * dt * 0.9;
      this.cloudDrift.y += this.wind.z * dt * 0.9;
      // fair-weather heaps even on a clear day: the painted sky needs its clouds — but they are the day's heat's, as
      // real cumulus are: few in the cool of the morning, most of an afternoon, melting away after sunset (V1: the
      // night clear for its stars)
      const hr = sky.hour;
      const diurnal = hr < 5 || hr > 21.5 ? 0.18 : hr < 9 ? 0.18 + 0.47 * ((hr - 5) / 4) : hr < 13 ? 0.65 + 0.35 * ((hr - 9) / 4) : hr < 18 ? 1 : 1 - 0.82 * ((hr - 18) / 3.5);
      // (and the place's own: how many heaps its climate makes, thinner when the night's sky is the show: V1b)
      // (a fair night's own clouds thin too where its sky is the show; not a front's, nor rain's)
      const fair = 1 - Math.min(1, w.rain + w.snow + w.overcast * 1.4);
      // (the place's share of heaps rules all a fair sky's cover, the weather's own clouds too)
      const cover = Math.min(1, 0.3 * diurnal * this.heapShare + w.cloud * 0.75 * (1 - 0.7 * this.nightShow * fair) * (1 + (this.heapShare - 1) * fair));
      this.lastCover = cover;
      if (this.shotMode) {
        // drawn in prepareShot()
      } else if (this.cloudsNow) {
        this.clouds.drawAll(this.camX, this.camZ, cover, this.cloudDrift.x, this.cloudDrift.y, this.cloudBase, this.towerShare, time);
        this.cloudsNow = false;
      } else this.clouds.update(this.camX, this.camZ, cover, 600, this.cloudDrift.x, this.cloudDrift.y, this.cloudBase, this.towerShare, time);
    }
    this.updateLayers(dt, sky, w, ba, bb, bt, world);
    // cloud shadows drift with the same wind; they fade as the sky closes over or the light goes
    const cs = globals.uCloudShadow.value;
    cs.x = (cs.x + this.wind.x * dt * 0.9) % 4096;
    cs.y = (cs.y + this.wind.z * dt * 0.9) % 4096;
    // (fair-weather heaps throw their shadows too, as many as there are: V1)
    cs.z = Math.min(1, this.lastCover);
    cs.w = 0.6 * sky.daylight * (1 - w.overcast) * THREE.MathUtils.smoothstep(this.lastCover, 0.05, 0.25);
    skyUniforms.uFlash.value = this.flash;
    skyUniforms.uRainbow.value = w.rainbow * sky.daylight * (sky.sunElev > 0.03 && sky.sunElev < 0.75 ? 1 : 0);
    // (the cold nights and the dry ones have it: by the region's kin)
    const ar = BIOMES[bt < 0.5 ? ba : bb];
    const biomeAurora = ar.earth?.palette?.air.night?.aurora ?? (ar.kin === 'alpine' ? 1 : ar.kin === 'desert' ? 0.4 : 0.12);
    const auroraDrift = THREE.MathUtils.smoothstep(fbm1(time / 500, this.seed + 7, 2), -0.1, 0.35);
    skyUniforms.uAurora.value = sky.night * (1 - Math.min(1, w.cloud * 1.3)) * auroraDrift * biomeAurora;

    // ---- precipitation
    this.camVel.set(vx, vy, vz);
    this.amounts.rain = w.rain;
    this.amounts.snow = w.snow;
    this.amounts.hail = w.hail;
    this.amounts.dust = w.dust;
    // the wind made visible (docs/DESIGN_V2.md §4.5): pale lines in the air from a fresh breeze up, and
    // in green country leaves torn loose — fewer in rain (they are wet and heavy), none over sand or snow
    const green = (BIOMES[ba].kin === 'plains' ? 1 - bt : 0) + (BIOMES[bb].kin === 'plains' ? bt : 0);
    // in the maple hills the leaves are red and gold and come down in any air at all
    const autumn = (BIOMES[ba].id === 'maple' ? 1 - bt : 0) + (BIOMES[bb].id === 'maple' ? bt : 0);
    this.amounts.gust = THREE.MathUtils.smoothstep(w.wind, 7, 15) * (1 - 0.5 * Math.max(w.dust, w.snow));
    this.amounts.leaf = Math.max(THREE.MathUtils.smoothstep(w.wind, 5.5, 13) * green, autumn * (0.22 + 0.5 * THREE.MathUtils.smoothstep(w.wind, 2.5, 9))) * (1 - 0.6 * w.rain);
    this.precip.setLeafColor(this.leafColor.setRGB(0.42 + 0.46 * autumn, 0.56 - 0.2 * autumn, 0.2 - 0.13 * autumn).multiplyScalar(0.9 + 0.5 * sky.daylight));
    this.precip.update(dt, this.amounts, this.wind, this.camVel);

    // ---- windscreen: rain on the glass, wipers run by themselves when it rains
    const onGlass = Math.min(1, (w.rain + w.hail * 0.5 + w.snow * 0.25) * this.glassRain);
    windscreenUniforms.uRain.value = Math.max(onGlass, w.wetness * 0.25 * (w.rain > 0 ? 1 : 0.4));
    waterUniforms.uWaterRain.value = w.rain;
    const mode = this.wiperMode;
    this.wipersOn = mode === 'off' ? false : mode === 'auto' ? onGlass > 0.06 : true;
    const period = (mode === 'fast' ? 0.9 : mode === 'slow' ? 1.6 : THREE.MathUtils.lerp(3.0, 1.15, Math.min(1, onGlass * 1.2))) / Math.max(0.1, this.wiperRate);
    if (this.wipersOn || this.wipePhase > 0) {
      this.wipePhase += dt / period;
      if (this.wipePhase >= 1) this.wipePhase = this.wipersOn ? this.wipePhase - 1 : 0;
    }
    windscreenUniforms.uWipe.value.set(this.wipePhase, this.wipersOn || this.wipePhase > 0 ? period : 0);
    this.wipePeriod = this.wipersOn || this.wipePhase > 0 ? period : 0;
    this.glassWet = onGlass;

    this.dark = sky.daylight < 0.42 || w.overcast > 0.72 || w.fog > 0.5 || w.dust > 0.4 || w.snow > 0.6;
  }

  /** the heaps' share of the fair-weather cover (the place's, less when the night is the show) and how far they tower */
  private heapShare = 1;
  /** how much the night's sky is the show (stars, the Milky Way, an aurora, meteors): the fair weather's own clouds thin for it */
  private nightShow = 0;
  private towerShare = 0;

  /**
   * The clouds above the heaps, and the heaps' own measure (V1b, docs/V3/nodes/V1b-clouds.md). Each place's sky
   * (core/world/earth/palette.ts PlaceSky) — blended across a border —, then as the hour and the weather have it: a
   * sunset's or a sunrise's high and middle clouds the more (they are the canvas of its colours), the night's few
   * where its stars, its Milky Way, its aurora or its meteors are the show, none of them under an overcast or in rain.
   */
  private updateLayers(dt: number, sky: SkyState, w: WeatherState, ba: number, bb: number, bt: number, world: World | null): void {
    const sa = BIOMES[ba].earth?.palette?.air.sky;
    const sb = BIOMES[bb].earth?.palette?.air.sky;
    const mix = (f: (s: PlaceSky) => number, dflt: number): number => {
      const a = sa ? f(sa) : dflt;
      const b = sb ? f(sb) : dflt;
      return a + (b - a) * bt;
    };
    const near = (bt < 0.5 ? sa : sb) ?? sa ?? sb;
    const elev = sky.sunElev * (180 / Math.PI);
    const look = this.look;
    const show = look.stars * (1 - Math.min(1, w.rain + w.snow + w.fog + w.dust));
    this.nightShow = show;
    const golden = THREE.MathUtils.smoothstep(elev, -7, -1) * (1 - THREE.MathUtils.smoothstep(elev, 9, 18));
    const open = Math.max(0, 1 - Math.min(1, w.overcast * 1.25 + w.rain + w.snow + w.fog * 0.8 + w.dust));
    const t = this.skyTune;
    const night = 1 - 0.85 * show;
    const hi = skyUniforms.uHigh.value;
    hi.set(
      (t?.cirrus ?? mix((s) => s.cirrus, 0.12) * (1 + 0.35 * golden) * night) * open,
      (t?.cirrocumulus ?? mix((s) => s.cirrocumulus, 0.03) * (1 + 0.3 * golden) * night) * open,
      (t?.altocumulus ?? mix((s) => s.altocumulus, 0.06) * (1 + 0.25 * golden) * night) * open,
      (t?.veil ?? mix((s) => s.veil, 0.05) * night) * Math.max(open, 0.3),
    );
    const wv = skyUniforms.uWaves.value;
    wv.set((t?.waves ?? mix((s) => s.waves, 0) * night) * open, near?.waveDir ?? 0, near?.waveSpacing ?? 900, t?.ribbon ?? near?.ribbon ?? 0);
    skyUniforms.uNlc.value = (t?.nlc ?? mix((s) => s.nlc, 0)) * THREE.MathUtils.smoothstep(elev, -16, -9) * (1 - THREE.MathUtils.smoothstep(elev, -6, -3)) * open;
    // the heaps: the place's number of them, fewer when the night is the show; their base; their towers
    this.heapShare = (t?.cumulus ?? mix((s) => s.cumulus, 1)) * (1 - 0.6 * show);
    this.cloudBase = mix((s) => s.base, 1300);
    this.towerShare = mix((s) => s.towers, 0);
    // the winds aloft: the high layers' about two and a half times the ground's, the middle ones' one and a half
    const ld = this.layerDrift;
    ld.x += this.wind.x * dt * 2.4;
    ld.y += this.wind.z * dt * 2.4;
    ld.z += this.wind.x * dt * 1.5;
    ld.w += this.wind.z * dt * 1.5;
    skyUniforms.uLayerDrift.value.copy(ld);
    // the light on them by their height: a high cloud still has the sun some minutes after the ground has lost it
    lightAt(Math.min(70, elev + 2.6), !sky.afternoon, this.hiLight);
    skyUniforms.uHighLit.value.copy(look.cloudLit).lerp(this.hiLight.cloudLit.multiplyScalar(look.sunVis * 0.9 + 0.1), golden);
    skyUniforms.uMidLit.value.copy(look.cloudLit);
    skyUniforms.uLayerShade.value.copy(look.cloudShade);
    // a lens over the highest ground in sight, 5 to 16 km off and 600 m or more over the eye (looked for every 4 s)
    const lensAmt = (t?.lens ?? mix((s) => s.lens, 0)) * open * (1 - 0.7 * show);
    const L = this.lens;
    if (lensAmt > 0.01 && world && this.lastTime - L.at > 4) {
      L.at = this.lastTime;
      const camY = this.core.camera.position.y + globals.uOriginOffset.value.y;
      let best = -1e9;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        for (const r of [5000, 8000, 11500, 16000]) {
          const x = this.camX + Math.cos(a) * r;
          const z = this.camZ + Math.sin(a) * r;
          const h = world.heightAt(x, z);
          const rise = (h - camY) / r;
          // (the highest in sight, but low enough over the horizon to be seen through a windscreen: no more than 18°)
          const el = Math.atan((h + 700 - camY) / r);
          if (h - camY > 600 && el < 0.31 && rise > best) {
            best = rise;
            L.az = a;
            L.el = el;
            L.w = Math.atan(2200 / r);
          }
        }
      }
      L.k = best > -1e8 ? 1 : 0;
    }
    if (lensAmt <= 0.01) L.k = 0;
    skyUniforms.uLens.value.set(L.az, L.el, L.w, lensAmt * L.k);
    // (lenses stand in a stable air: few heaps where they are)
    this.heapShare *= 1 - 0.65 * lensAmt * L.k;
  }
  private lastTime = 0;

  /** let one bolt go now (screenshots, tests) */
  strike(): void {
    this.struck = true;
  }

  /** blade angle (rad from parked) for the current wiper phase */
  get wiperAngle(): number {
    return 1 - Math.abs(2 * this.wipePhase - 1);
  }
}
