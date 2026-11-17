/**
 * ModCar sound audition page (harness/audio/listen.html, served by `npm run dev`): every engine,
 * exhaust and cabin option on a toy drivetrain, and every foley sound, for listening and tuning; a
 * scrub pad to rub with the mouse, which drives the scrubbing loops as the game does (every frame a
 * gain and a rate from the tool's speed); the tyres and wrecks, the flat and the bare rim following a
 * speed and a load slider, the rare part's glint a distance one; the roadside places, a container
 * searched by holding a button (the opening, the search until let go), the doors, the pump filled from
 * with a flow and a rate slider. Nothing makes a sound until the Start button is clicked.
 */
import { EngineVoice, bankConfig, loadBank, type BankManifest } from '../../src/game/modcar/engineAudio';
import { FOLEY_LOOPS, Foley, type ContainerMaterial, type FoleyLoop, type FoleyOpts, type FoleyShot, type ScrapeSurface } from '../../src/game/modcar/foley';

bankConfig.baseUrl = '/audio/modcar/engines/';

const ENGINES: Array<[string, string]> = [
  ['eng_mower', '割草机单缸 150'],
  ['eng_single', '单缸 250'],
  ['eng_2t', '二冲程双缸'],
  ['eng_i4', '直列四缸 1.3'],
  ['eng_i4d', '直列四缸柴油 2.4'],
  ['eng_flat6', '水平对置六缸 2.7'],
  ['eng_v8', 'V8 5.0'],
  ['eng_d6', '直六柴油 6.0'],
  ['gen_d1', '发电机 风冷单缸柴油 418（拉绳，调速 3000）'],
];
const RATIOS = [0, 3.5, 2.1, 1.4, 1.0];

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const engineSel = $<HTMLSelectElement>('engine');
for (const [id, name] of ENGINES) engineSel.add(new Option(`${name} (${id})`, id));
engineSel.value = 'eng_i4';

let ctx: AudioContext | null = null;
let voice: EngineVoice | null = null;
let foley: Foley | null = null;
let manifest: BankManifest | null = null;

// toy drivetrain
const car = { rpm: 0, running: false, cranking: false, crankFor: 0, catchAt: 1, gear: 0, throttle: 0, load: 0, shiftUntil: 0, stalled: false, pullUntil: 0, pulls: 0 };
/** the generator: no key, a rope; it holds its speed (the governor hunting a little), the throttle slider is its load */
const isGenerator = (): boolean => engineSel.value === 'gen_d1';
let keyHeld = false;
let pedal = 0;
const keys = new Set<string>();

async function pickEngine(): Promise<void> {
  if (!ctx || !voice) return;
  const id = engineSel.value;
  manifest = (await loadBank(ctx, id)).manifest;
  await voice.load(id);
  $<HTMLInputElement>('rpm').max = String(Math.round(manifest.redlineRpm * 1.1));
}
engineSel.onchange = () => {
  car.running = false;
  car.rpm = 0;
  void pickEngine();
};

$('start').onclick = async () => {
  if (ctx) {
    void ctx.resume();
    return;
  }
  ctx = new AudioContext();
  const comp = ctx.createDynamicsCompressor();
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(comp).connect(ctx.destination);
  voice = new EngineVoice(ctx, master);
  foley = new Foley(ctx, master);
  await pickEngine();
  $('start').textContent = '已开始';
  requestAnimationFrame(frame);
};

$('pull').onclick = () => {
  if (!isGenerator() || car.running) return;
  foley?.play('cord_pull');
  car.pullUntil = performance.now() / 1000 + 0.6;
  car.pulls++;
};
const keyBtn = $('key');
keyBtn.onpointerdown = () => {
  keyHeld = true;
  foley?.play('key_turn');
};
keyBtn.onpointerup = keyBtn.onpointerleave = () => {
  keyHeld = false;
};
$('stop').onclick = () => {
  car.running = false;
  car.stalled = false;
  foley?.play('key_turn');
};
$('stall').onclick = () => {
  car.running = false;
  car.stalled = true;
};

addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyE' || e.code === 'KeyQ') {
    const g = Math.max(0, Math.min(4, car.gear + (e.code === 'KeyE' ? 1 : -1)));
    if (g !== car.gear) {
      if (car.gear > 0 && g > 0) car.rpm *= RATIOS[g] / RATIOS[car.gear];
      car.gear = g;
      car.shiftUntil = performance.now() / 1000 + 0.25;
      $<HTMLSelectElement>('gear').value = String(g);
      foley?.play('gear_shift');
    }
  }
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
$<HTMLSelectElement>('gear').onchange = (e) => {
  car.gear = Number((e.target as HTMLSelectElement).value);
  foley?.play('gear_shift');
};

// foley buttons
const foleyBox = $('foley');
const shotButtons: Array<[string, FoleyShot, FoleyOpts]> = [
  ['开门 原装', 'door_open', { material: 'metal' }], ['关门 原装', 'door_close', { material: 'metal' }],
  ['关门 锈', 'door_close', { material: 'rusty' }], ['关门 装甲', 'door_close', { material: 'armor' }],
  ['开门 铁丝网', 'door_open', { material: 'cage' }], ['关门 铁丝网', 'door_close', { material: 'cage' }],
  ['开门 冰箱门', 'door_open', { material: 'fridge' }], ['关门 冰箱门', 'door_close', { material: 'fridge' }],
  ['锁扣', 'latch', {}], ['开引擎盖', 'hood_open', {}], ['关引擎盖', 'hood_close', {}], ['开尾箱', 'trunk_open', {}], ['关尾箱', 'trunk_close', {}],
  ['拿起 小件', 'part_pickup', { mass: 0.3 }], ['拿起 20 kg', 'part_pickup', { mass: 20 }],
  ['放下 0.3 kg', 'part_setdown', { mass: 0.3 }], ['放下 4 kg', 'part_setdown', { mass: 4 }], ['放下 25 kg', 'part_setdown', { mass: 25 }], ['放下 235 kg', 'part_setdown', { mass: 235 }],
  ['装上', 'part_install', { mass: 10 }], ['拆下', 'part_remove', { mass: 10 }], ['钥匙', 'key_turn', {}],
  ['拉手刹', 'handbrake_pull', {}], ['松手刹', 'handbrake_release', {}], ['换挡', 'gear_shift', {}], ['打齿', 'gear_grind', {}], ['摇喷罐', 'spray_shake', {}],
  ['开关', 'switch', {}], ['挡杆一格', 'lever', {}],
  // the workshop
  ['拉绳', 'cord_pull', {}], ['发电机开关', 'gen_switch', {}], ['烧干油', 'gen_cough', {}],
  ['粉碎 金属', 'shred', { grind: 'metal' }], ['粉碎 塑料', 'shred', { grind: 'plastic' }], ['粉碎 有机', 'shred', { grind: 'organic' }], ['粉碎 布', 'shred', { grind: 'cloth' }], ['粉碎 木头', 'shred', { grind: 'wood' }],
  ['计数', 'tally', {}], ['摆工具', 'craft_start', {}], ['挥锤', 'hammer_swing', {}],
  ['锤 金属', 'hammer_hit', { grind: 'metal' }], ['锤 塑料', 'hammer_hit', { grind: 'plastic' }], ['锤 木头', 'hammer_hit', { grind: 'wood' }], ['锤 布', 'hammer_hit', { grind: 'cloth' }],
  ['做好了', 'craft_done', {}], ['来电', 'power_on', {}], ['断电', 'power_off', {}], ['没电', 'no_power', {}],
  // scrubbing
  ['刮刀起手 玻璃', 'scrape_start', { surface: 'glass' }], ['刮刀起手 漆面', 'scrape_start', { surface: 'metal' }], ['刮刀起手 锈', 'scrape_start', { surface: 'rust' }], ['刮刀起手 泥', 'scrape_start', { surface: 'mud' }],
  ['碎屑落地', 'flake_drop', {}], ['擦干净了（叮）', 'clean_ding', {}], ['除锈完成', 'clean_rust_done', {}], ['整车翻新完成', 'clean_car_done', {}],
  ['工具用坏了', 'tool_worn', {}], ['显示剩余污渍（H）', 'highlight_ping', {}],
  // spray paint
  ['摇喷罐（新）', 'spray_rattle', {}], ['喷漆阀门', 'spray_start', {}], ['喷罐喷干', 'spray_sputter', {}], ['喷漆完成', 'paint_done', {}],
];
for (const [label, kind, opts] of shotButtons) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => foley?.play(kind, opts);
  foleyBox.append(b);
}
foleyBox.append(document.createElement('br'));
const loopButtons: Array<[string, FoleyLoop, FoleyOpts]> = [
  ['扳手（开关）', 'ratchet', {}], ['喷漆（开关）', 'spray', {}], ['海绵（开关）', 'sponge', {}],
  ['加油（开关）', 'pour', { liquid: 'fuel' }], ['加水（开关）', 'pour', { liquid: 'water' }], ['加机油（开关）', 'pour', { liquid: 'oil' }],
  ['粉碎机空转（开关）', 'recycler_run', {}], ['粉碎中（开关）', 'recycler_grind', {}], ['灯管（开关）', 'lamp_buzz', {}],
  // scrubbing (at the rate and gain of the sliders under the scrub pad)
  ['刮玻璃（开关）', 'scrape_glass', {}], ['刮漆面（开关）', 'scrape_metal', {}], ['刮锈（开关）', 'scrape_rust', {}], ['刮泥（开关）', 'scrape_mud', {}],
  ['钢丝刷（开关）', 'brush_wire', {}], ['海绵擦洗（开关）', 'sponge_scrub', {}],
  ['喷漆嘶声（开关）', 'spray_hiss', {}],
];
/** the scrubbing loops switched on by their buttons (they follow the rate and gain sliders) */
const SCRUBS: readonly FoleyLoop[] = ['scrape_glass', 'scrape_metal', 'scrape_rust', 'scrape_mud', 'brush_wire', 'sponge_scrub'];
const scrubOn = new Set<FoleyLoop>();
const sliders = (): FoleyOpts => ({ rate: Number($<HTMLInputElement>('scrubRate').value), gain: Number($<HTMLInputElement>('scrubGain').value) });
for (const [label, kind, opts] of loopButtons) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => {
    if (!foley) return;
    const on = b.classList.toggle('on');
    const scrub = SCRUBS.includes(kind);
    if (on) foley.start(kind, scrub ? { ...opts, ...sliders() } : opts);
    else foley.stop(kind);
    if (scrub && on) scrubOn.add(kind);
    else scrubOn.delete(kind);
  };
  foleyBox.append(b);
}
for (const id of ['scrubRate', 'scrubGain']) {
  $<HTMLInputElement>(id).oninput = () => {
    $('scrubRateV').textContent = Number($<HTMLInputElement>('scrubRate').value).toFixed(2);
    $('scrubGainV').textContent = Number($<HTMLInputElement>('scrubGain').value).toFixed(2);
    // (a loop already playing glides to the new rate and gain: start() again, as the game does every frame)
    for (const k of scrubOn) foley?.start(k, sliders());
  };
}

// the scrub pad: rub it with the mouse; the tool's speed, smoothed over about 60 ms, gives the gain and the rate
const pad = $('scrubPad');
const CATCH: Partial<Record<FoleyLoop, ScrapeSurface>> = { scrape_glass: 'glass', scrape_metal: 'metal', scrape_rust: 'rust', scrape_mud: 'mud', brush_wire: 'rust' };
const DONE: Record<string, FoleyShot> = { scrape_glass: 'clean_ding', scrape_metal: 'clean_ding', scrape_rust: 'clean_rust_done', scrape_mud: 'clean_ding', brush_wire: 'clean_rust_done', sponge_scrub: 'clean_ding' };
const rub = { down: false, kind: 'scrape_metal' as FoleyLoop, x: 0, y: 0, moved: 0, speed: 0, last: 0, still: true, travel: 0, flakeAt: 0 };
pad.onpointerdown = (e) => {
  if (!foley) return;
  pad.setPointerCapture(e.pointerId);
  pad.classList.add('on');
  rub.down = true;
  rub.kind = $<HTMLSelectElement>('scrubTool').value as FoleyLoop;
  rub.x = e.clientX;
  rub.y = e.clientY;
  rub.moved = 0;
  rub.speed = 0;
  rub.still = true;
  rub.last = performance.now() / 1000;
  foley.start(rub.kind, { gain: 0, rate: 0.7 });
  requestAnimationFrame(scrubFrame);
};
pad.onpointermove = (e) => {
  if (!rub.down) return;
  rub.moved += Math.hypot(e.clientX - rub.x, e.clientY - rub.y);
  rub.x = e.clientX;
  rub.y = e.clientY;
};
pad.onpointerup = pad.onpointercancel = () => {
  if (!rub.down) return;
  rub.down = false;
  pad.classList.remove('on');
  foley?.stop(rub.kind);
};
function scrubFrame(nowMs: number): void {
  if (!rub.down || !foley) return;
  requestAnimationFrame(scrubFrame);
  const now = nowMs / 1000;
  const dt = Math.max(1 / 240, Math.min(0.1, now - rub.last));
  rub.last = now;
  // pixels a second, smoothed (the raw mouse speed jitters from frame to frame)
  rub.speed += (rub.moved / dt - rub.speed) * Math.min(1, dt / 0.06);
  rub.travel += rub.moved;
  rub.moved = 0;
  const v = Math.min(1, rub.speed / 1400);
  const gain = Math.pow(v, 0.8);
  const rate = 0.7 + 0.9 * v;
  foley.start(rub.kind, { gain, rate });
  // the blade catches as a stroke begins; bits fall off rust and mud as it goes
  const surface = CATCH[rub.kind];
  if (rub.still && v > 0.08 && surface) foley.play('scrape_start', { surface });
  rub.still = v < 0.04;
  if ((rub.kind === 'scrape_rust' || rub.kind === 'scrape_mud') && v > 0.3 && now > rub.flakeAt) {
    foley.play('flake_drop');
    rub.flakeAt = now + 0.25 + 0.35 * Math.random();
  }
  // rubbed enough: the part is clean
  if ($<HTMLInputElement>('scrubDone').checked && rub.travel > 9000) {
    rub.travel = 0;
    foley.play(DONE[rub.kind]);
  }
  $('scrubStatus').textContent = `${rub.kind}  速度 ${rub.speed.toFixed(0).padStart(5)} px/s  gain ${gain.toFixed(2)}  rate ${rate.toFixed(2)}  已擦 ${rub.travel.toFixed(0)} / 9000 px`;
}
foleyBox.append(document.createElement('br'));
// a spray can as the game plays it: the valve and the hiss while held, stopped on release; run dry: the hiss stopped, the sputter
{
  const spray = document.createElement('button');
  spray.textContent = '按住喷漆（阀门 + 嘶声，松开停）';
  spray.onpointerdown = () => {
    foley?.play('spray_start');
    foley?.start('spray_hiss');
  };
  spray.onpointerup = spray.onpointerleave = () => foley?.stop('spray_hiss');
  const dry = document.createElement('button');
  dry.textContent = '喷着喷着喷干了';
  dry.onclick = () => {
    if (!foley) return;
    foley.play('spray_start');
    foley.start('spray_hiss');
    setTimeout(() => {
      foley?.stop('spray_hiss');
      foley?.play('spray_sputter');
    }, 1500);
  };
  foleyBox.append(spray, dry);
}

// tyres and wrecks by the road: the flat and the bare rim at the speed and load of the sliders (rate 1 at
// 30 km/h, as the game should set it from the wheel), the glint by the distance to the rare part
const roadBox = $('road');
const roadOpts = (kind: FoleyLoop): FoleyOpts =>
  kind === 'rare_glint'
    ? { gain: Math.max(0, Math.min(1, (4 - Number($<HTMLInputElement>('glintDist').value)) / 3.4)) }
    : { rate: Number($<HTMLInputElement>('roadKmh').value) / 30, gain: Number($<HTMLInputElement>('roadGain').value) };
const roadToggles = new Map<FoleyLoop, HTMLButtonElement>();
const roadLoop = (kind: FoleyLoop, on: boolean): void => {
  if (!foley) return;
  roadToggles.get(kind)?.classList.toggle('on', on);
  if (on) foley.start(kind, roadOpts(kind));
  else foley.stop(kind);
};
const roadShots: Array<[string, FoleyShot, FoleyOpts]> = [
  ['爆胎', 'tyre_burst', {}], ['撬开锈死的车门 / 引擎盖', 'wreck_creak', {}],
  ...[1, 2, 3, 4, 5].map((tier): [string, FoleyShot, FoleyOpts] => [`开盖找到 ★${tier}`, 'loot_reveal', { tier }]),
];
for (const [label, kind, opts] of roadShots) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => foley?.play(kind, opts);
  roadBox.append(b);
}
roadBox.append(document.createElement('br'));
for (const [label, kind] of [['瘪胎拍打（开关）', 'flat_flap'], ['钢圈磨地（开关）', 'rim_grind'], ['稀有零件微光（开关）', 'rare_glint']] as const) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => roadLoop(kind, !b.classList.contains('on'));
  roadToggles.set(kind, b);
  roadBox.append(b);
}
// a blowout as the game should play it: the bang, the flap from the next frame on; the tyre coming off: the flap giving way to the rim
{
  const burst = document.createElement('button');
  burst.textContent = '行驶中爆胎（爆，接着瘪胎拍打）';
  burst.onclick = () => {
    foley?.play('tyre_burst');
    roadLoop('rim_grind', false);
    roadLoop('flat_flap', true);
  };
  const off = document.createElement('button');
  off.textContent = '轮胎甩脱（拍打变成钢圈磨地）';
  off.onclick = () => {
    roadLoop('flat_flap', false);
    roadLoop('rim_grind', true);
  };
  roadBox.append(burst, off);
}
const showRoad = (): void => {
  const v = Number($<HTMLInputElement>('roadKmh').value);
  $('roadKmhV').textContent = `${v} km/h · rate ${(v / 30).toFixed(2)}`;
  $('roadGainV').textContent = Number($<HTMLInputElement>('roadGain').value).toFixed(2);
  $('glintDistV').textContent = `${Number($<HTMLInputElement>('glintDist').value).toFixed(1)} m · gain ${(roadOpts('rare_glint').gain ?? 0).toFixed(2)}`;
};
for (const id of ['roadKmh', 'roadGain', 'glintDist']) {
  $<HTMLInputElement>(id).oninput = () => {
    showRoad();
    // (a loop already playing glides to the new rate and gain: start() again, as the game does every frame)
    for (const [kind, b] of roadToggles) if (b.classList.contains('on')) foley?.start(kind, roadOpts(kind));
  };
}
showRoad();

// roadside places: a container searched as the game does it (E held: the opening, then the hands until it is let go),
// nothing in it; the doors; the pump (the trigger held: the run at the flow and rate of the sliders; full: the click; dry)
const placesBox = $('places');
const material = (): ContainerMaterial => $<HTMLSelectElement>('container').value as ContainerMaterial;
const searchRate = (): number => Number($<HTMLInputElement>('searchRate').value);
const pumpOpts = (): FoleyOpts => ({ gain: Number($<HTMLInputElement>('pumpFlow').value), rate: Number($<HTMLInputElement>('pumpRate').value) });
const button = (label: string, box: HTMLElement): HTMLButtonElement => {
  const b = document.createElement('button');
  b.textContent = label;
  box.append(b);
  return b;
};
{
  const search = button('按住搜（开 + 翻找，松开停）', placesBox);
  search.onpointerdown = () => {
    if (!foley) return;
    foley.play('container_open', { material: material() });
    foley.start('rummage', { material: material(), rate: searchRate() });
  };
  search.onpointerup = search.onpointerleave = () => foley?.stop('rummage');
  button('只放开的声音', placesBox).onclick = () => foley?.play('container_open', { material: material() });
  button('搜完：空的', placesBox).onclick = () => foley?.play('container_empty', { material: material() });
  placesBox.append(document.createElement('br'));
  for (const [label, kind] of [['开民居门', 'door_house_open'], ['关民居门', 'door_house_close'], ['开商店门（门铃）', 'door_shop_open'], ['关商店门', 'door_shop_close']] as const) {
    button(label, placesBox).onclick = () => foley?.play(kind);
  }
  placesBox.append(document.createElement('br'));
  button('提起油枪', placesBox).onclick = () => foley?.play('pump_lift');
  const fill = button('按住扳机加油（松开停）', placesBox);
  fill.onpointerdown = () => foley?.start('pump_run', pumpOpts());
  fill.onpointerup = fill.onpointerleave = () => foley?.stop('pump_run');
  button('加满了（跳枪）', placesBox).onclick = () => {
    foley?.stop('pump_run');
    foley?.play('pump_click');
  };
  button('油泵抽干', placesBox).onclick = () => {
    foley?.stop('pump_run');
    foley?.play('pump_dry');
  };
  button('挂回油枪', placesBox).onclick = () => foley?.play('pump_hang');
}
for (const id of ['searchRate', 'pumpFlow', 'pumpRate']) {
  $<HTMLInputElement>(id).oninput = () => {
    $('searchRateV').textContent = searchRate().toFixed(2);
    $('pumpFlowV').textContent = Number($<HTMLInputElement>('pumpFlow').value).toFixed(2);
    $('pumpRateV').textContent = Number($<HTMLInputElement>('pumpRate').value).toFixed(2);
    // (a search or a fill going on glides to the new rate and flow, as the game's every frame)
    if (foley?.playing('rummage')) foley.start('rummage', { material: material(), rate: searchRate() });
    if (foley?.playing('pump_run')) foley.start('pump_run', pumpOpts());
  };
}

for (const [label, kind] of [['喇叭 嘀（按住）', 'horn_beep'], ['喇叭 乐曲', 'horn_trumpet'], ['汽笛（按住）', 'horn_air']] as const) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onpointerdown = () => foley?.horn(kind, true);
  b.onpointerup = b.onpointerleave = () => foley?.horn(kind, false);
  foleyBox.append(b);
}
void FOLEY_LOOPS;

let last = 0;
function frame(nowMs: number): void {
  requestAnimationFrame(frame);
  if (!voice || !manifest) return;
  const now = nowMs / 1000;
  const dt = last ? Math.min(0.05, now - last) : 0;
  last = now;
  const m = manifest;
  const I = m.idleRpm;
  const R = m.redlineRpm;
  const battery = Number($<HTMLInputElement>('battery').value);

  // pedal: keyboard wins over the slider
  const want = keys.has('Space') || keys.has('KeyW') || keys.has('ArrowUp') ? 1 : keys.has('KeyS') || keys.has('ArrowDown') ? 0 : Number($<HTMLInputElement>('throttle').value);
  pedal += (want - pedal) * Math.min(1, dt * 12);
  const shifting = now < car.shiftUntil;
  car.throttle = shifting ? 0 : pedal;

  // key: crank, catch after a while if the battery can turn it fast enough
  if (isGenerator()) {
    // the rope: about 0.6 s at the pull's speed; the second pull catches
    const pulling = now < car.pullUntil && !car.running;
    if (car.cranking && !pulling && car.pulls >= 2 && !car.running) {
      car.running = true;
      car.pulls = 0;
    }
    car.cranking = pulling;
    if (pulling) car.rpm = m.oneshots['crank']?.rpm ?? 500;
    else if (car.running) {
      // governed: 3000 rpm, hunting about 100 either way, drooping a little under load
      car.load = 0.15 + 0.45 * car.throttle;
      car.rpm = I - 120 * (car.load - 0.15) + 70 * Math.sin(now * 4.3) + 25 * Math.sin(now * 11.9);
    } else car.rpm += (0 - car.rpm) * Math.min(1, dt * 3);
    voice.update({ engineId: 'gen_d1', rpm: car.rpm, load: car.load, throttle: car.load, running: car.running, cranking: car.cranking, inside: false, doorsOpen: 1, distance: 4, starterRate: 1, stalled: false });
    $('status').textContent = `gen_d1  rpm ${car.rpm.toFixed(0).padStart(5)}  负载 ${car.load.toFixed(2)}  ${car.running ? '运转' : car.cranking ? '拉绳中' : '停'}`;
    return;
  }
  car.cranking = keyHeld && !car.running && battery > 0.15;
  if (car.cranking) {
    car.crankFor += dt;
    const crankRpm = (m.oneshots['crank']?.rpm ?? 200) * (0.55 + 0.45 * battery);
    car.rpm += (crankRpm - car.rpm) * Math.min(1, dt * 8);
    if (car.crankFor > car.catchAt / Math.max(0.3, battery)) {
      car.running = true;
      car.stalled = false;
    }
  } else {
    car.crankFor = 0;
    car.catchAt = 0.6 + Math.random() * 0.8;
  }

  if (car.running) {
    if ($<HTMLInputElement>('hold').checked) {
      car.rpm = Number($<HTMLInputElement>('rpm').value);
      car.load = car.throttle;
    } else if (car.gear === 0) {
      const target = I + (R * 1.06 - I) * Math.pow(car.throttle, 0.9);
      const tau = target > car.rpm ? 0.16 : 0.4;
      car.rpm += (target - car.rpm) * Math.min(1, dt / tau);
      car.load = 0.08 + 0.15 * car.throttle;
    } else {
      const span = R - I;
      const up = span / [0, 1.6, 2.6, 3.8, 5.2][car.gear];
      const down = up / 1.6;
      car.rpm += (car.throttle > 0.05 ? car.throttle * up - (1 - car.throttle) * down : -down) * dt;
      car.rpm = Math.max(I, car.rpm);
      car.load = car.throttle > 0.05 ? 0.2 + 0.8 * car.throttle : 0;
    }
    // the rev limiter cuts: a quick bounce under the redline
    if (car.rpm >= R) car.rpm = R - 140 * (0.5 + 0.5 * Math.sin(now * 2 * Math.PI * 9));
  } else if (!car.cranking) {
    car.rpm += (0 - car.rpm) * Math.min(1, dt * 3);
  }

  const doors = Number($<HTMLInputElement>('doors').value);
  const ex = $<HTMLSelectElement>('exhaust').value;
  voice.update({
    engineId: engineSel.value,
    exhaustId: ex === 'none' ? null : ex,
    turbo: $<HTMLInputElement>('turbo').checked,
    rpm: car.rpm,
    load: car.load,
    throttle: car.throttle,
    running: car.running,
    cranking: car.cranking,
    inside: $<HTMLInputElement>('inside').checked,
    doorsOpen: doors,
    starterRate: battery,
    stalled: car.stalled,
  });
  const d = voice.debug() as { slots: Array<{ file: string; gain: number; rate: number }>; boost: number };
  $('status').textContent =
    `${engineSel.value}  rpm ${car.rpm.toFixed(0).padStart(5)}  挡 ${car.gear}  油门 ${car.throttle.toFixed(2)}  负载 ${car.load.toFixed(2)}  ` +
    `${car.running ? '运转' : car.cranking ? '打火中' : '熄火'}  增压 ${d.boost.toFixed(2)}\n` +
    d.slots.map((s) => `  ${s.file.padEnd(10)} 增益 ${s.gain.toFixed(3)}  速率 ${s.rate.toFixed(3)}`).join('\n');
}
