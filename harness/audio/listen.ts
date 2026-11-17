/**
 * ModCar sound audition page (harness/audio/listen.html, served by `npm run dev`): every engine,
 * exhaust and cabin option on a toy drivetrain, and every foley sound, for listening and tuning.
 * Nothing makes a sound until the Start button is clicked.
 */
import { EngineVoice, bankConfig, loadBank, type BankManifest } from '../../src/game/modcar/engineAudio';
import { FOLEY_LOOPS, Foley, type FoleyLoop, type FoleyOpts, type FoleyShot } from '../../src/game/modcar/foley';

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
];
for (const [label, kind, opts] of loopButtons) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => {
    if (!foley) return;
    const on = b.classList.toggle('on');
    if (on) foley.start(kind, opts);
    else foley.stop(kind);
  };
  foleyBox.append(b);
}
foleyBox.append(document.createElement('br'));
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
