/**
 * The developer's dials (the bin's world tabs): each a number the game reads while it runs — how hard the rain
 * comes down, how long its drops are, how strong the light is, how tall the hills stand — with what it does in
 * plain words. Moved dials are kept in the browser (they are there again after a reload) and can be copied out,
 * or saved to loop/dev-tune.json through the dev server, to be written into the game for good: each says where
 * in the code its number lives.
 *
 * Two kinds: a dial on a number of the code (a drop's width, a day's length, a biome's hills) writes the number
 * itself; a dial on what the weather or the light comes out as (rain ×1.5) is read every frame by the hook that
 * applies it (devWorld.ts). Terrain dials take effect when the world is made again (a reload).
 */
import { BIOMES } from '../../core/world/biomes';
import { LAND_ODDS, LAND_SIZE } from '../../core/world/landform';
import { PRECIP_DEFS } from '../env/precip';
import { STYLE, styleOf } from '../render/style';

export type DialTab = 'weather' | 'time' | 'look' | 'terrain';
export type DialUnit = 'x' | 'm' | 'deg' | 'ms' | 'min' | 'kmh' | 'pct' | '';

export interface Dial {
  id: string;
  tab: DialTab;
  section: string;
  label: string;
  /** what it does, in plain words (the tooltip) */
  help: string;
  min: number;
  max: number;
  step: number;
  /** the game's own value */
  def: number;
  unit: DialUnit;
  /** where its number lives in the code, to write it in for good */
  code: string;
  /** below 0 it means "as the game has it" (the slider's left end): wetness, snow on the road */
  auto?: boolean;
  /** the world has to be made again for it to show (terrain): applied at the next load */
  regen?: boolean;
  /** terrain: the biome it belongs to */
  biome?: string;
  /** writes the value where the game reads it (dials on a number of the code) */
  apply?: (v: number) => void;
}

const KEY = 'modcar.dev.tune.v1';

/** the dials, their values and the browser's copy of the moved ones */
export class Tune {
  readonly dials: Dial[] = [];
  private readonly byId = new Map<string, Dial>();
  private readonly values = new Map<string, number>();
  private readonly listeners: ((id: string) => void)[] = [];

  constructor() {
    for (const d of makeDials()) {
      this.dials.push(d);
      this.byId.set(d.id, d);
    }
    this.load();
  }

  dial(id: string): Dial | undefined {
    return this.byId.get(id);
  }

  /** the dial's value (its default while it has not been moved) */
  get(id: string): number {
    const v = this.values.get(id);
    if (v !== undefined) return v;
    return this.byId.get(id)?.def ?? 1;
  }

  /** moved from its default? */
  moved(id: string): boolean {
    return this.values.has(id);
  }

  set(id: string, v: number): void {
    const d = this.byId.get(id);
    if (!d || !Number.isFinite(v)) return;
    const c = Math.min(d.max, Math.max(d.min, v));
    if (Math.abs(c - d.def) < 1e-9) this.values.delete(id);
    else this.values.set(id, c);
    d.apply?.(c);
    this.save();
    for (const f of this.listeners) f(id);
  }

  reset(id: string): void {
    const d = this.byId.get(id);
    if (!d) return;
    this.set(id, d.def);
  }

  /** every dial back to the game's own (those of one tab only, given) */
  resetAll(tab?: DialTab): void {
    for (const d of this.dials) if (!tab || d.tab === tab) if (this.values.has(d.id)) this.reset(d.id);
  }

  onChange(f: (id: string) => void): void {
    this.listeners.push(f);
  }

  /** the moved dials (all of them, or one tab's) */
  changed(tab?: DialTab): Dial[] {
    return this.dials.filter((d) => this.values.has(d.id) && (!tab || d.tab === tab));
  }

  /** write every moved dial on a number of the code into it (at the start, before the world is made) */
  applyAll(): void {
    for (const d of this.dials) if (d.apply && this.values.has(d.id)) d.apply(this.get(d.id));
  }

  /** the moved dials as text to read (and as JSON at the end), for writing them into the game */
  export(where: string): { text: string; json: Record<string, unknown> } {
    const list = this.changed();
    const json: Record<string, unknown> = {
      when: new Date().toISOString(),
      where,
      dials: Object.fromEntries(list.map((d) => [d.id, { value: round(this.get(d.id)), default: round(d.def), label: `${tabName(d.tab)} · ${d.section} · ${d.label}`, code: d.code }])),
    };
    const lines = [`开发者面板：调整过的参数（${list.length} 个）`, where, ''];
    let last = '';
    for (const d of list) {
      const head = `【${tabName(d.tab)} · ${d.section}${d.biome ? ` · ${biomeName(d.biome)}` : ''}】`;
      if (head !== last) {
        lines.push(head);
        last = head;
      }
      lines.push(`  ${d.label}：${fmt(d, d.def)} → ${fmt(d, this.get(d.id))}　（${d.code}）`);
    }
    if (!list.length) lines.push('（还没有改过任何参数）');
    lines.push('', 'JSON:', JSON.stringify(json));
    return { text: lines.join('\n'), json };
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const o = JSON.parse(raw) as Record<string, number>;
      for (const [k, v] of Object.entries(o)) {
        const d = this.byId.get(k);
        if (d && typeof v === 'number' && Number.isFinite(v)) this.values.set(k, Math.min(d.max, Math.max(d.min, v)));
      }
    } catch {
      /* a broken copy: start from the game's own */
    }
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(this.values)));
    } catch {
      /* private mode: kept for this page only */
    }
  }
}

const round = (v: number): number => Math.round(v * 10000) / 10000;

export function tabName(t: DialTab): string {
  return t === 'weather' ? '天气' : t === 'time' ? '时间' : t === 'look' ? '画面' : '地形';
}

export function biomeName(id: string): string {
  return BIOMES.find((b) => b.id === id)?.label ?? id;
}

/** a dial's value as it reads: ×1.5, 2.5 m, 58°, 40 分钟, 跟随天气 */
export function fmt(d: Dial, v: number): string {
  if (d.auto && v < 0) return '跟随天气';
  const n = (x: number, k = 2): string => {
    const s = x.toFixed(k);
    return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  };
  switch (d.unit) {
    case 'x':
      return `×${n(v)}`;
    case 'm':
      return `${n(v, v < 1 ? 3 : 1)} m`;
    case 'deg':
      return `${n(v, 0)}°`;
    case 'ms':
      return `${n(v, 1)} m/s`;
    case 'min':
      return `${n(v, 1)} 分钟`;
    case 'kmh':
      return `${n(v, 0)} km/h`;
    case 'pct':
      return `${n(v * 100, 0)}%`;
    default:
      return n(v, 3);
  }
}

// ------------------------------------------------------------------ the dials

function makeDials(): Dial[] {
  const out: Dial[] = [];
  const add = (d: Omit<Dial, 'tab' | 'section'>, tab: DialTab, section: string): void => {
    out.push({ ...d, tab, section });
  };

  // ---------------------------------------------------------------- weather: how much of it
  let tab: DialTab = 'weather';
  let sec = '雨雪有多大';
  const mul = (id: string, label: string, help: string, max = 4, code = ''): void =>
    add({ id, label, help, min: 0, max, step: 0.05, def: 1, unit: 'x', code: code || `core/env/weather.ts manifest() 里 ${id.split('.')[0]} 的大小 × 这个数` }, tab, sec);
  mul('rain.amount', '雨量', '雨下得多大。2 就是平时的两倍猛，0 就是一滴不下。空中的雨丝、挡风玻璃上的雨、路面变湿的速度、雨声都跟着变。先在上面选「下雨」或「雷暴雨」，再拧这个。');
  mul('snow.amount', '雪量', '雪下得多大。越大雪花越密，路上和车顶积雪也积得越快。先选「下雪」或「暴风雪」。');
  mul('hail.amount', '冰雹', '冰雹有多密。只有在「冰雹」天气里才有冰雹。');
  mul('dust.amount', '沙尘', '沙尘暴里空中飞的沙有多浓。只在「沙尘暴」里有。');
  mul('fog.amount', '雾', '雾有多浓。越大越看不远，远处的东西越快变白。');
  mul('cloud.amount', '云量', '天上的云有多少。0 是万里无云，2 是云挤满天。', 2);
  mul('overcast.amount', '阴沉', '云层把阳光挡掉多少。越大白天越暗、越压抑，暴雨天的那种昏暗。', 2);
  mul('lightning.rate', '闪电', '雷暴时闪电劈得有多勤。0 就不打雷，5 就是一直在闪。只有雷暴和冰雹天气才打雷。', 8);

  // (V1b, docs/V3/nodes/V1b-clouds.md: each at its far left follows the place's own sky, core/world/earth/palette.ts skyOf)
  sec = '云的种类';
  const kind = (id: string, label: string, help: string, code: string): void =>
    add({ id, label, help: help + ' 滑到最左是「跟随这个地方」：每个地方按自己的气候和运气配云。', min: -0.05, max: 1, step: 0.01, def: -0.05, unit: 'pct', auto: true, code }, tab, sec);
  kind('clouds.cirrus', '卷云', '最高处（约 9 公里）的丝状云，像干毛笔扫出来的细丝，随高空的风飘得最快。日落后它还会被晚霞照红一阵。', 'env/sky.ts 卷云层 uHigh.x');
  kind('clouds.cirrocumulus', '卷积云（鱼鳞云）', '高处一层细小的鱼鳞点，横着风向排成一行行，成片出现。傍晚被染成暖色时最好看。', 'env/sky.ts 卷积云层 uHigh.y');
  kind('clouds.altocumulus', '高积云（羊群云）', '中层（约 4 公里）一团团圆圆的小云，朝太阳的一面亮、底下暗，一片片出现又散开。', 'env/sky.ts 高积云层 uHigh.z');
  kind('clouds.veil', '高层云薄纱', '一层很薄的灰白色云纱铺满天，太阳透过去变成一团模糊的光。', 'env/sky.ts 薄纱 uHigh.w');
  kind('clouds.waves', '波状云', '风在高处打卷形成的一道道平行的云卷，断断续续。比较少见。', 'env/sky.ts 波状云 uWaves.x');
  kind('clouds.ribbon', '长条云（地震云）', '0 是一道道的波状云，1 是一条横贯天空的长条云（俗称地震云）。要配合上面的「波状云」调大才看得见。', 'env/sky.ts uWaves.w');
  kind('clouds.lens', '荚状云（UFO 云）', '挂在附近最高的山顶上方的透镜状云，几层叠在一起。只在附近有高山时出现。', 'env/environment.ts updateLayers 找最高的山，env/sky.ts uLens');
  kind('clouds.nlc', '夜光云', '极地夏天日落后不久，低空朝太阳那边的一层发蓝光的细丝云。只在黄昏和黎明那一会儿看得到。', 'env/sky.ts uNlc');
  add({ id: 'clouds.cumulus', label: '积云多少', help: '白天那种一大团一大团的积云的多少（这个地方自己的多少再乘这个数）。滑到最左是跟随这个地方。夜里看星星时它会自动变少。', min: -0.05, max: 2, step: 0.01, def: -0.05, unit: 'x', auto: true, code: 'env/environment.ts heapShare' }, tab, sec);

  sec = '风';
  mul('wind.speed', '风力', '风有多大。雨丝被吹得多斜、草和树摆得多厉害、风声多大、云飘多快，都看它。', 4);
  add({ id: 'wind.turn', label: '风向偏转', help: '把风向整体转过去多少度。风从车头方向来时，雨会正面扑向挡风玻璃；从侧面来时雨丝横着飘。', min: -180, max: 180, step: 5, def: 0, unit: 'deg', code: 'core/env/weather.ts manifest() 末尾 out.windDir + 这个角度' }, tab, sec);

  sec = '地面';
  add({ id: 'ground.wet', label: '路面湿度', help: '路面和车身有多湿。滑到最左是「跟随天气」（下雨慢慢变湿、停了慢慢变干）。湿了路面会反光、车身挂水珠、轮胎更滑。', min: -0.05, max: 1, step: 0.01, def: -0.05, unit: 'pct', auto: true, code: 'core/env/weather.ts step() 里的 wetness（湿度）' }, tab, sec);
  add({ id: 'ground.snow', label: '路面积雪', help: '路上和车顶的积雪有多厚。滑到最左是「跟随天气」。积雪会让路变滑、车顶变白。', min: -0.05, max: 1, step: 0.01, def: -0.05, unit: 'pct', auto: true, code: 'core/env/weather.ts step() 里的 snowCover（积雪）' }, tab, sec);

  const R = PRECIP_DEFS.rain;
  sec = '雨丝的样子';
  add({ id: 'rain.count', label: '雨丝数量', help: '同样大的雨，空中看得见多少根雨丝。调大更「密密麻麻」，最多 3 倍（也更吃显卡）。', min: 0.1, max: 3, step: 0.05, def: 1, unit: 'x', code: 'game/env/precip.ts PRECIP_DEFS.rain.count × 这个数' }, tab, sec);
  add({ id: 'rain.width', label: '雨丝粗细', help: '每根雨丝有多粗。调粗更像大颗的雨点，调细更像毛毛雨。', min: 0.003, max: 0.06, step: 0.001, def: R.width, unit: 'm', code: 'game/env/precip.ts PRECIP_DEFS.rain.width', apply: (v) => (PRECIP_DEFS.rain.width = v) }, tab, sec);
  add({ id: 'rain.length', label: '雨丝长短', help: '雨丝拉得多长。车开得越快雨丝本来就越长，这个是整体再加长或缩短。', min: 0.2, max: 3, step: 0.05, def: 1, unit: 'x', code: 'game/env/precip.ts PRECIP_DEFS.rain 的 exposure、minLen、maxLen × 这个数' }, tab, sec);
  add({ id: 'rain.fall', label: '下落速度', help: '雨往下掉得多快。真实的大雨大约 9 米/秒；调大更像倾盆而下，调小像慢镜头。', min: 2, max: 35, step: 0.5, def: R.fall, unit: 'ms', code: 'game/env/precip.ts PRECIP_DEFS.rain.fall', apply: (v) => (PRECIP_DEFS.rain.fall = v) }, tab, sec);
  add({ id: 'rain.drift', label: '被风吹斜', help: '雨丝跟着风走多少。0 是笔直落下，2 是被风横着吹。', min: 0, max: 2.5, step: 0.05, def: R.drift, unit: '', code: 'game/env/precip.ts PRECIP_DEFS.rain.drift', apply: (v) => (PRECIP_DEFS.rain.drift = v) }, tab, sec);
  add({ id: 'rain.alpha', label: '雨丝显眼程度', help: '雨丝有多亮、多白。调大雨更醒目，调小更透明、朦胧。', min: 0.05, max: 1, step: 0.01, def: R.alpha, unit: '', code: 'game/env/precip.ts PRECIP_DEFS.rain.alpha', apply: (v) => (PRECIP_DEFS.rain.alpha = v) }, tab, sec);

  const S = PRECIP_DEFS.snow;
  sec = '雪花的样子';
  add({ id: 'snow.count', label: '雪花数量', help: '同样大的雪，空中看得见多少片雪花，最多 3 倍。', min: 0.1, max: 3, step: 0.05, def: 1, unit: 'x', code: 'game/env/precip.ts PRECIP_DEFS.snow.count × 这个数' }, tab, sec);
  add({ id: 'snow.size', label: '雪花大小', help: '每片雪花有多大。', min: 0.01, max: 0.12, step: 0.002, def: S.width, unit: 'm', code: 'game/env/precip.ts PRECIP_DEFS.snow.width', apply: (v) => (PRECIP_DEFS.snow.width = v) }, tab, sec);
  add({ id: 'snow.fall', label: '飘落速度', help: '雪往下飘得多快。调小是慢悠悠的鹅毛大雪，调大是砸下来的雪。', min: 0.2, max: 8, step: 0.1, def: S.fall, unit: 'ms', code: 'game/env/precip.ts PRECIP_DEFS.snow.fall', apply: (v) => (PRECIP_DEFS.snow.fall = v) }, tab, sec);
  add({ id: 'snow.flutter', label: '飘忽', help: '雪花左右晃动得多厉害。0 是直直落下。', min: 0, max: 0.8, step: 0.01, def: S.flutter, unit: 'm', code: 'game/env/precip.ts PRECIP_DEFS.snow.flutter', apply: (v) => (PRECIP_DEFS.snow.flutter = v) }, tab, sec);

  sec = '雨打在车上';
  add({ id: 'splash.car', label: '车身上的水花', help: '雨点砸在车顶、引擎盖、尾箱上溅起的小水花有多少。0 就关掉。', min: 0, max: 4, step: 0.05, def: 1, unit: 'x', code: 'game/env/splash.ts CAR_RATE × 这个数' }, tab, sec);
  add({ id: 'splash.ground', label: '地上的水花', help: '雨点打在地面、路面上溅起的水花和涟漪有多少。0 就关掉。', min: 0, max: 4, step: 0.05, def: 1, unit: 'x', code: 'game/env/splash.ts GROUND_RATE × 这个数' }, tab, sec);
  add({ id: 'splash.size', label: '水花大小', help: '每朵水花溅得多大、多高。', min: 0.3, max: 3, step: 0.05, def: 1, unit: 'x', code: 'game/env/splash.ts SIZE × 这个数' }, tab, sec);
  add({ id: 'glass.rain', label: '挡风玻璃上的雨', help: '挡风玻璃上挂着、流着的雨水有多少。', min: 0, max: 3, step: 0.05, def: 1, unit: 'x', code: 'game/env/environment.ts glassRain（onGlass × 这个数）' }, tab, sec);
  add({ id: 'wiper.speed', label: '雨刷速度', help: '雨刷刮得多快。', min: 0.3, max: 3, step: 0.05, def: 1, unit: 'x', code: 'game/env/environment.ts wiperRate（雨刷周期 ÷ 这个数）' }, tab, sec);

  sec = '天气的声音';
  const snd = (id: string, label: string, help: string, code: string): void => add({ id, label, help, min: 0, max: 3, step: 0.05, def: 1, unit: 'x', code }, tab, sec);
  snd('sound.rain', '雨声', '车外哗哗的雨声有多大。', 'game/audio.ts weatherGain.rain（rainGain × 这个数）');
  snd('sound.roof', '车顶雨声', '坐在车里时，雨点噼里啪啦打在车顶上的声音有多大。', 'game/audio.ts weatherGain.roof（roofGain × 这个数）');
  snd('sound.hail', '冰雹声', '冰雹砸在车上的声音有多大。', 'game/audio.ts weatherGain.hail（hailGain × 这个数）');
  snd('sound.wind', '风声', '呼呼的风声有多大。', 'game/audio.ts weatherGain.wind（windGain × 这个数）');
  snd('sound.thunder', '雷声', '闪电之后的雷声有多响。', 'game/audio.ts weatherGain.thunder（雷声音量 × 这个数）');

  // ---------------------------------------------------------------- time
  tab = 'time';
  sec = '一天';
  add({ id: 'time.dayLength', label: '一天有多长', help: '现实里过多少分钟，游戏里就过完一整天。默认 40 分钟。清晨、黄昏这些好看的时段本来就走得慢一些，深夜走得快。', min: 2, max: 240, step: 1, def: 40, unit: 'min', code: 'core/env/time.ts DayClock.dayLength（秒 = 分钟 × 60）' }, tab, sec);
  add({ id: 'time.sunHeight', label: '太阳最高能升多高', help: '正午时太阳离地平线有多高。越高影子越短越硬朗；越低一整天都像傍晚，影子长长的。', min: 15, max: 88, step: 1, def: 58, unit: 'deg', code: 'core/env/time.ts DayClock.maxElevation' }, tab, sec);

  // ---------------------------------------------------------------- the look of the picture
  tab = 'look';
  const P = STYLE.pipeline;
  sec = '整体';
  add({ id: 'look.exposure', label: '亮度', help: '整个画面亮一点还是暗一点（在游戏自己按时间算好的亮度上再乘这个数）。', min: 0.3, max: 3, step: 0.02, def: 1, unit: 'x', code: 'game/env/colorScript.ts 算出的 exposure × 这个数' }, tab, sec);
  add({ id: 'look.saturation', label: '颜色鲜艳度', help: '颜色有多浓。0 是黑白照片，1 以上越来越艳。', min: 0, max: 2, step: 0.01, def: P.saturation, unit: '', code: 'specs/art/style.json pipeline.saturation' }, tab, sec);
  add({ id: 'look.knee', label: '高光从哪开始收', help: '画面里多亮的地方开始被「柔化」，免得一片死白。调小整体更柔和、偏灰；调大更亮更冲。', min: 0.2, max: 1.5, step: 0.01, def: P.curve.knee, unit: '', code: 'specs/art/style.json pipeline.curve.knee' }, tab, sec);
  add({ id: 'look.shoulder', label: '高光最多多亮', help: '最亮的地方（天空、反光、灯）最多能亮到什么程度。调大亮部更耀眼。', min: 0.05, max: 1.5, step: 0.01, def: P.curve.shoulder, unit: '', code: 'specs/art/style.json pipeline.curve.shoulder' }, tab, sec);
  add({ id: 'look.vignette', label: '暗角', help: '画面四个角变暗的程度。0 就没有暗角。', min: 0, max: 1, step: 0.01, def: P.vignette, unit: '', code: 'specs/art/style.json pipeline.vignette' }, tab, sec);
  add({ id: 'look.bloom', label: '光晕', help: '亮的东西（太阳、车灯、水面反光）周围那一圈朦胧的光有多强。', min: 0, max: 3, step: 0.02, def: P.bloom.strength, unit: '', code: 'specs/art/style.json pipeline.bloom.strength' }, tab, sec);
  add({ id: 'look.threshold', label: '多亮才有光晕', help: '要多亮的东西才会发出光晕。调小，更多东西会泛光（画面更梦幻）；调大只有最亮的才有。', min: 0, max: 3, step: 0.02, def: P.bloom.threshold, unit: '', code: 'specs/art/style.json pipeline.bloom.threshold' }, tab, sec);
  add({ id: 'look.ink', label: '描边深浅', help: '车和东西轮廓上那圈墨线有多深。0 就没有描边。', min: 0, max: 2, step: 0.02, def: P.ink.strength, unit: '', code: 'specs/art/style.json pipeline.ink.strength' }, tab, sec);
  sec = '光和空气';
  const lm = (id: string, label: string, help: string, code: string, max = 3): void => add({ id, label, help, min: 0, max, step: 0.02, def: 1, unit: 'x', code }, tab, sec);
  lm('look.sun', '阳光强度', '直射阳光有多强。调大亮面更亮、明暗对比更强。', 'specs/art/style.json lightKeys[].sun × 这个数');
  lm('look.sky', '阴影里的亮度', '背光、阴影里有多亮（天空照下来的光）。调小阴影更黑、对比更强；调大更柔和。', 'specs/art/style.json lightKeys[].amb × 这个数');
  lm('look.bounce', '地面反光', '地面把光反弹到车底、物体下方的强度。', 'specs/art/style.json lightKeys[].bounce × 这个数');
  lm('look.fog', '空气感（远处发白）', '远处的山和路被空气「冲淡」的程度。调大更有空气感、远山更淡；调小远处更清楚。', 'specs/art/style.json lightKeys[].haze × 这个数', 5);
  lm('look.shafts', '光束', '太阳低的时候穿过雾气、树缝的那种一道道光柱有多明显。', 'game/env/environment.ts core.shafts × 这个数', 5);
  add({ id: 'look.fov', label: '视野角度', help: '第一人称时一眼能看多宽。调大视野更广（更有速度感），调小像长焦镜头。', min: 40, max: 110, step: 1, def: 75, unit: 'deg', code: 'game/modcar/ModGame.ts 第一人称的 cam.fov' }, tab, sec);
  add({ id: 'look.shake', label: '座椅震动', help: '开车时镜头跟着路面、发动机和颠簸抖动的程度。0 就完全不抖（容易晕车的话调小），2 是加倍。', min: 0, max: 2, step: 0.05, def: 1, unit: 'x', code: 'game/modcar/seatShake.ts SeatShake.scale' }, tab, sec);
  add({ id: 'pad.rumble', label: '手柄震动', help: '手柄的两个马达跟着车震：撞到东西、压到限位块、飞起落地用大马达；路面的颤、发动机的抖、转速撞到断油、刹车抱死用小马达。0 关掉，2 加倍。', min: 0, max: 2, step: 0.05, def: 1, unit: 'x', code: 'game/modcar/pad.ts ModPad.rumble' }, tab, sec);

  // ---------------------------------------------------------------- terrain (by biome; the world made again)
  tab = 'terrain';
  for (const b of BIOMES) {
    const t = (field: keyof typeof b, section: string, label: string, help: string, min: number, max: number, step: number, unit: DialUnit): void =>
      add({ id: `terrain.${b.id}.${String(field)}`, label, help, min, max, step, def: b[field] as number, unit, code: `core/world/biomes.ts BIOMES 里 ${b.id}.${String(field)}`, regen: true, biome: b.id, apply: (v) => ((b as unknown as Record<string, number>)[field as string] = v) }, tab, section);
    t('nearAmp', '路边的地面', '路边起伏多高', '路两边的地面起伏有多高（米）。调大路边就是一个个小土包，调小就是平地。', 0, 40, 0.5, 'm');
    t('nearLen', '路边的地面', '起伏有多宽', '路边那些起伏一个有多宽（米）。小了是密集的小坡，大了是又宽又缓的大坡。', 40, 800, 10, 'm');
    t('detailAmp', '路边的地面', '地面细碎起伏', '地面上那种很碎的小起伏有多高（米），让地面不那么光溜。', 0, 6, 0.1, 'm');
    t('farAmp', '远处的山', '远山多高', '离路远一点的那些山、丘陵有多高（米）。', 0, 1500, 10, 'm');
    t('farLen', '远处的山', '远山多大', '远处的山一座有多大（米）。小了山又多又尖，大了是连绵的大山。', 300, 5000, 50, 'm');
    t('farStart', '远处的山', '山从多远开始', '离路多少米开始长出大山。调小山会贴着路，调大路两边先是一大片开阔地。', 20, 1500, 10, 'm');
    t('massifAmp', '天边的山脉', '天边山脉多高', '地平线上那排最远的大山有多高（米）。调大天边就是巍峨的雪山，调小天边是平的。', 0, 4000, 50, 'm');
    t('turnMax', '路怎么走', '弯有多急', '一个弯道最多拐多少度。调大路更绕更「山路」，调小更顺直。', 10, 120, 1, 'deg');
    t('straightChance', '路怎么走', '直道多不多', '过完一个弯之后接一段直路的机会（0 到 1）。调大直路多，调小一直在拐弯。', 0, 1, 0.01, 'pct');
    t('gradeAmp', '路怎么走', '上下坡多陡', '路的上坡下坡一般有多陡（每米升多少米，0.05 就是 5% 的坡）。', 0, 0.12, 0.002, '');
    t('designKmh', '路怎么走', '路按多快的车速修', '路是照多快的车速设计的。越快弯道半径越大、弯越缓；越慢可以修出很急的发卡弯。', 25, 140, 1, 'kmh');
    const size = LAND_SIZE[b.id];
    const odds = LAND_ODDS[b.id];
    if (size) {
      const sz = (i: number, label: string, help: string, min: number, max: number, step: number, unit: DialUnit): void =>
        add({ id: `terrain.${b.id}.size${i}`, label, help, min, max, step, def: size[i], unit, code: `core/world/landform.ts LAND_SIZE.${b.id}[${i}]`, regen: true, biome: b.id, apply: (v) => (size[i] = v) }, tab, '地形的样子');
      sz(0, '山坡有多斜', '「山坡路」那种一边高一边低的地形，坡有多斜（每米升多少）。', 0, 0.8, 0.01, '');
      sz(1, '山谷两边多高', '「山谷」里路两边的山壁有多高（米）。', 0, 400, 5, 'm');
      sz(2, '山脊两边多深', '「山脊路」两边往下掉得有多深（米）。', 0, 250, 5, 'm');
      if (size[3] > 0) sz(3, '峡谷有多深', '「峡谷」两边岩壁有多高（米）。', 0, 250, 5, 'm');
    }
    if (odds) {
      const names = ['平地', '山坡', '山谷', '山脊', '峡谷'];
      for (let i = 0; i < 5; i++) {
        if (i === 4 && odds[4] <= 0) continue;
        add({ id: `terrain.${b.id}.odds${i}`, label: `${names[i]}出现的机会`, help: `这种地形区里，一段路是「${names[i]}」的机会有多大（各种地形的机会会按比例算，不用加起来等于 1）。`, min: 0, max: 1, step: 0.01, def: odds[i], unit: '', code: `core/world/landform.ts LAND_ODDS.${b.id}[${i}]`, regen: true, biome: b.id, apply: (v) => (odds[i] = v) }, tab, '地形种类有多常见');
      }
    }
    // (the region's painted look: its own entry of the art spec, or the one made from its row of the palette table)
    const st = styleOf(BIOMES.indexOf(b));
    if (st) {
      const where = st === STYLE.biomes[b.id] ? `specs/art/style.json biomes.${b.id}` : `game/scene/palette.ts PALETTES.${b.id}.look`;
      const veg = (field: 'grassGrow' | 'flowerAmount' | 'grassDensity', label: string, help: string): void =>
        add({ id: `terrain.${b.id}.${field}`, label, help, min: 0, max: 1.5, step: 0.01, def: st[field] ?? 0, unit: '', code: `${where}.${field}`, regen: true, biome: b.id, apply: (v) => (st[field] = v) }, tab, '植被');
      veg('grassGrow', '草丛多少', '地上一簇簇的草有多少。');
      veg('grassDensity', '草地铺得多满', '地面被草覆盖得有多满（地面的颜色）。');
      veg('flowerAmount', '野花多少', '草地里的野花有多少。0 就没有花。');
    }
  }
  return out;
}
