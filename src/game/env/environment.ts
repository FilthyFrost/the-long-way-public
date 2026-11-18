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
import { BIOME_STYLES, STYLE } from '../render/style';

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
  /** screenshot mode: no strip-by-strip cloud updates; prepareShot() draws the whole cube when needed */
  shotMode = false;
  private shotKey = '';
  private lastCover = 0.3;
  private readonly cloudDrift = new THREE.Vector2();
  private readonly moonUp = new THREE.Vector3();

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
    this.clouds.drawAll(this.camX, this.camZ, this.lastCover, this.cloudDrift.x, this.cloudDrift.y);
  }

  /**
   * @param time    simulated seconds
   * @param ba,bb,bt biome mix at the player
   * @param camVel  camera velocity in world space
   */
  update(dt: number, time: number, ba: number, bb: number, bt: number, world: World | null, vx: number, vy: number, vz: number): void {
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
      const ga = BIOME_STYLES[ba];
      const gb = BIOME_STYLES[bb];
      globals.uHereGround.value.setRGB(ga.ground.deep[0] + (gb.ground.deep[0] - ga.ground.deep[0]) * bt, ga.ground.deep[1] + (gb.ground.deep[1] - ga.ground.deep[1]) * bt, ga.ground.deep[2] + (gb.ground.deep[2] - ga.ground.deep[2]) * bt);
      globals.uHereForest.value.setRGB(ga.forest[1][0] + (gb.forest[1][0] - ga.forest[1][0]) * bt, ga.forest[1][1] + (gb.forest[1][1] - ga.forest[1][1]) * bt, ga.forest[1][2] + (gb.forest[1][2] - ga.forest[1][2]) * bt);
    }
    this.core.exposure = look.exposure;
    // shafts of light: a low sun, and air with something in it to catch them (mist, the damp after rain, dust)
    {
      const elev = sky.sunElev * (180 / Math.PI);
      const low = THREE.MathUtils.smoothstep(elev, 1.5, 7) * (1 - THREE.MathUtils.smoothstep(elev, 26, 42));
      const air = Math.min(1, 0.35 + w.fog * 1.6 + w.wetness * 0.45 + w.dust * 0.8 + w.murkRain * 0.3);
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
    globals.uWeather.value.set(w.wetness, w.snowCover, Math.min(1, Math.max(w.rain, w.snow, w.dust)), sky.night);

    skyUniforms.uZenith.value.copy(look.zenith);
    skyUniforms.uMid.value.copy(look.mid);
    skyUniforms.uHorizon.value.copy(look.horizon);
    skyUniforms.uGlow.value.copy(look.glow);
    skyUniforms.uDisc.value.copy(look.glow).multiplyScalar(1.6).add(globals.uSunColor.value);
    skyUniforms.uSunDisc.value.set(sky.sunX, sky.sunY, sky.sunZ);
    skyUniforms.uMoonDir.value.set(sky.moonX, sky.moonY, sky.moonZ);
    skyUniforms.uSunVis.value = look.sunVis * (look.moon > 0.5 ? 0 : 1);
    skyUniforms.uStars.value = look.stars * (1 - Math.min(1, w.cloud * 0.9 + w.fog + w.dust));
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
      // fair-weather heaps even on a clear day: the painted sky needs its clouds
      const cover = Math.min(1, 0.3 + w.cloud * 0.75);
      this.lastCover = cover;
      if (this.shotMode) {
        // drawn in prepareShot()
      } else if (this.cloudsNow) {
        this.clouds.drawAll(this.camX, this.camZ, cover, this.cloudDrift.x, this.cloudDrift.y);
        this.cloudsNow = false;
      } else this.clouds.update(this.camX, this.camZ, cover, 600, this.cloudDrift.x, this.cloudDrift.y);
    }
    // cloud shadows drift with the same wind; they fade as the sky closes over or the light goes
    const cs = globals.uCloudShadow.value;
    cs.x = (cs.x + this.wind.x * dt * 0.9) % 4096;
    cs.y = (cs.y + this.wind.z * dt * 0.9) % 4096;
    cs.z = Math.min(1, w.cloud);
    cs.w = 0.55 * sky.daylight * (1 - w.overcast) * THREE.MathUtils.smoothstep(w.cloud, 0.08, 0.3);
    skyUniforms.uFlash.value = this.flash;
    skyUniforms.uRainbow.value = w.rainbow * sky.daylight * (sky.sunElev > 0.03 && sky.sunElev < 0.75 ? 1 : 0);
    const biomeAurora = BIOMES[bt < 0.5 ? ba : bb].id === 'alpine' ? 1 : BIOMES[bt < 0.5 ? ba : bb].id === 'desert' ? 0.4 : 0.12;
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

  /** let one bolt go now (screenshots, tests) */
  strike(): void {
    this.struck = true;
  }

  /** blade angle (rad from parked) for the current wiper phase */
  get wiperAngle(): number {
    return 1 - Math.abs(2 * this.wipePhase - 1);
  }
}
