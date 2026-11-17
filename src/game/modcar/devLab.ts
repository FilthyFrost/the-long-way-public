/**
 * The handling lab, a tab of the developer's panel (docs/MODCAR.md §21): the vehicle at hand measured on the lab's
 * level asphalt (src/core/modcar/lab: acceleration, top speed, braking, cornering, roll, climbing, fuel, how it
 * answers the wheel, the handbrake, a launch with one side on ice, and what each part is), a part tried on it in
 * place of what it has (every mount of its kind: a tyre on every rim) with each figure before and after, and every
 * part of a kind tried in turn with the figure it moves most — the rule being that every part moves one by 10 %.
 * The vehicle in the world is not touched: a copy of its build is measured.
 */
import { fitPart, fitSub, mountsFor, newInstance } from '../../core/modcar/build';
import { CAT_LABEL, frameDef } from '../../core/modcar/frames';
import { changes, EXEMPT_CATS, FIGURES, figuresOf, JUDGED, type Figures } from '../../core/modcar/lab/figures';
import { PARTS, partDef } from '../../core/modcar/parts';
import type { Build, Category } from '../../core/modcar/types';

/** what the lab needs of the game */
export interface LabHost {
  /** the vehicle sat in, else the one in focus (its build, its name) */
  devLabVehicle(): { build: Build; name: string } | null;
}

export const LAB_CSS = `
.mc-dev .lab-t { width: 100%; border-collapse: collapse; font-size: 12.5px; font-variant-numeric: tabular-nums; margin: 4px 0 8px; }
.mc-dev .lab-t td { padding: 2px 4px; border-bottom: 1px solid rgba(255,255,255,0.07); white-space: nowrap; }
.mc-dev .lab-t td.n { color: #c9c6c0; }
.mc-dev .lab-t td.v { text-align: right; }
.mc-dev .lab-t td.c { text-align: right; min-width: 52px; }
.mc-dev .lab-t tr.lab-big td.c { font-weight: 700; }
.mc-dev .lab-t .good { color: #a6ea92; }
.mc-dev .lab-t .bad { color: #ff9a7e; }
.mc-dev .lab-t tr.miss td { color: #ff9a7e; }
.mc-dev select { font: inherit; font-size: 13px; padding: 4px 6px; border-radius: 7px; border: 1.5px solid rgba(239,230,211,0.35); background: rgba(0,0,0,0.35); color: #fff; max-width: 100%; }
.mc-dev select option { color: #17120f; }
`;

/** a figure as it reads: its value and unit (— where it means nothing) */
function show(key: keyof Figures, f: Figures): string {
  const v = f[key] as number;
  if (typeof v !== 'number' || !Number.isFinite(v)) return key === 'accelS' ? '到不了' : '—';
  const n = (d: number): string => v.toFixed(d);
  switch (key) {
    case 'accelS': return `${n(1)} s${f.accelKind === '0-60' ? '（0–60）' : ''}`;
    case 't60to100':
    case 'steerT63':
    case 'splitS':
    case 'shiftS': return `${n(2)} s`;
    case 'topKmh': return `${n(0)} km/h`;
    case 'brake100m': return `${n(1)} m`;
    case 'maxLatG': return `${n(2)} g`;
    case 'rollDegPerG':
    case 'understeerDegPerG': return `${n(1)} °/g`;
    case 'gradeGravelPct': return `${n(0)} %`;
    case 'fuel90': return `${n(1)} L/100km`;
    case 'steerYaw': return `${n(1)} °/s`;
    case 'hbSlip': return `${n(0)}°`;
    case 'eyeY':
    case 'clearance': return `${(v * 100).toFixed(0)} cm`;
    case 'mass': return `${n(0)} kg`;
    case 'tankL': return `${n(0)} L`;
    case 'coolKw': return `${n(0)} kW`;
    case 'batteryKWh': return `${n(2)} kWh`;
    case 'cdA': return `${n(2)} m²`;
    case 'roofLightW':
    case 'solarW': return `${n(0)} W`;
    case 'lampReach': return `${n(0)} m`;
    case 'tyreLife': return `${n(0)} km`;
    default: return n(2);
  }
}

/** a change as it reads (+12 %, 能/不能), and whether it is for the better */
function delta(key: keyof Figures, c: number): { text: string; good: boolean | null } {
  const higher = FIGURES.find((x) => x.key === key)?.higher ?? true;
  if (c === Infinity) return { text: '能/不能', good: null };
  if (!Number.isFinite(c) || Math.abs(c) < 0.005) return { text: '', good: null };
  return { text: `${c > 0 ? '+' : '−'}${Math.abs(c * 100).toFixed(0)}%`, good: c > 0 === higher };
}

/** a copy of a build with a part in place of what it has on every mount of its kind (a tyre on every rim; a turbo on the engine); null where it goes nowhere */
export function tried(build: Build, partId: string): Build | null {
  const b = structuredClone(build);
  const p = partDef(partId);
  const frame = frameDef(b.frame);
  if (p.cat === 'tire') {
    let any = false;
    for (const m of frame.mounts) {
      const inst = b.parts[m.id];
      if (inst && partDef(inst.part).rim?.tire) {
        fitSub(inst, 'tire', newInstance(partId));
        any = true;
      }
    }
    return any ? b : null;
  }
  if (p.cat === 'turbo') {
    const eng = frame.mounts.find((m) => m.cat === 'engine');
    const inst = eng ? b.parts[eng.id] : undefined;
    if (!inst || !partDef(inst.part).engine?.turbo) return null;
    fitSub(inst, 'turbo', newInstance(partId));
    return b;
  }
  const mounts = mountsFor(frame, p).filter((m) => p.cat !== 'seat' || m.driver);
  if (!mounts.length) return null;
  for (const m of mounts) {
    const was = b.parts[m.id];
    const inst = newInstance(partId, { fuelL: 20 });
    // (a wheel keeps the tyre that was on the old one)
    if (was?.sub.tire && p.rim?.tire) fitSub(inst, 'tire', was.sub.tire);
    fitPart(b, m.id, inst);
  }
  return b;
}

/** the figure a part moves most (by its size: a part that makes the vehicle able or unable to do something, the most) */
export function biggest(ch: Record<string, number>): { key: keyof Figures; c: number } | null {
  let best: { key: keyof Figures; c: number } | null = null;
  let mag = 0;
  for (const key of JUDGED) {
    const c = ch[key];
    const m = c === Infinity ? 9 : Number.isFinite(c) ? Math.abs(c) : 0;
    if (m > mag) {
      mag = m;
      best = { key, c };
    }
  }
  return best;
}

const pause = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

export class LabPane {
  private body!: HTMLElement;
  private head!: HTMLElement;
  private out!: HTMLElement;
  private msg!: HTMLElement;
  private cat!: HTMLSelectElement;
  private part!: HTMLSelectElement;
  private frame = '';
  private busy = false;

  constructor(private readonly host: LabHost) {}

  build(pane: HTMLElement): void {
    const body = document.createElement('div');
    body.className = 'body';
    pane.appendChild(body);
    this.body = body;
    body.innerHTML = `<h5>手感实验室</h5><div class="note">在一块平坦的柏油试车场上测你面前这辆车（复制一份来测，路上那辆不动）。换一个零件，至少要有一项数变化 10% 以上。</div>
<div class="where lab-veh"></div>
<div class="btns" style="margin:8px 0 4px"><button class="go" data-act="measure">量这辆车</button></div>
<h5>试装零件</h5>
<div class="row"><select class="lab-cat"></select><select class="lab-part"></select></div>
<div class="btns two" style="margin:6px 0 4px"><button data-act="try">试装对比</button><button data-act="all">这一类全试一遍</button></div>
<div class="msg"></div>
<div class="lab-out"></div>`;
    this.head = body.querySelector('.lab-veh') as HTMLElement;
    this.out = body.querySelector('.lab-out') as HTMLElement;
    this.msg = body.querySelector('.msg') as HTMLElement;
    this.cat = body.querySelector('.lab-cat') as HTMLSelectElement;
    this.part = body.querySelector('.lab-part') as HTMLSelectElement;
    this.cat.addEventListener('change', () => this.fillParts());
    body.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.act;
      if (act === 'measure') void this.measure();
      if (act === 'try') void this.tryOne();
      if (act === 'all') void this.tryAll();
    });
    this.tick();
  }

  /** the vehicle at hand shown (a few times a second while the tab shows) */
  tick(): void {
    if (!this.head) return;
    const v = this.host.devLabVehicle();
    const eng = v ? Object.values(v.build.parts).find((i) => partDef(i.part).cat === 'engine') : undefined;
    this.head.textContent = v ? `${v.name}（${eng ? partDef(eng.part).name.zh : '没有发动机'}）` : '身边没有车：坐进一辆车，或者走到车旁边。';
    if (v && v.build.frame !== this.frame) {
      this.frame = v.build.frame;
      this.fillCats(v.build);
    }
  }

  /** the kinds of part this frame has a place for (and a tyre, a turbo), as the cards name them */
  private fillCats(b: Build): void {
    const frame = frameDef(b.frame);
    const cats = new Set<Category>();
    for (const m of frame.mounts) if (!EXEMPT_CATS.has(m.cat)) cats.add(m.cat);
    if ([...cats].includes('rim')) cats.add('tire');
    if (frame.mounts.some((m) => m.cat === 'engine')) cats.add('turbo');
    const order = PARTS.map((p) => p.cat).filter((c, i, a) => a.indexOf(c) === i && cats.has(c));
    this.cat.innerHTML = order.map((c) => `<option value="${c}">${CAT_LABEL[c]?.zh ?? c}</option>`).join('');
    this.fillParts();
  }

  private fillParts(): void {
    const c = this.cat.value as Category;
    this.part.innerHTML = PARTS.filter((p) => p.cat === c).map((p) => `<option value="${p.id}">${p.name.zh}</option>`).join('');
  }

  private say(text: string, bad = false): void {
    this.msg.textContent = text;
    this.msg.classList.toggle('bad', bad);
  }

  private async measure(): Promise<void> {
    const v = this.host.devLabVehicle();
    if (!v || this.busy) return;
    this.busy = true;
    this.say('测量中……');
    await pause();
    const t0 = performance.now();
    const f = figuresOf(structuredClone(v.build));
    this.out.innerHTML = `<table class="lab-t">${FIGURES.map((x) => `<tr><td class="n">${x.zh}</td><td class="v">${show(x.key, f)}</td></tr>`).join('')}</table>`;
    this.say(`量完了（${((performance.now() - t0) / 1000).toFixed(1)} 秒）。`);
    this.busy = false;
  }

  private async tryOne(): Promise<void> {
    const v = this.host.devLabVehicle();
    if (!v || this.busy) return;
    const b = tried(v.build, this.part.value);
    if (!b) {
      this.say('这辆车上没有地方装它（轮胎要装在轮毂上，涡轮要装在能带涡轮的发动机上）。', true);
      return;
    }
    this.busy = true;
    this.say('测量中……');
    await pause();
    const before = figuresOf(structuredClone(v.build));
    await pause();
    const after = figuresOf(b);
    const ch = changes(before, after);
    const top = biggest(ch);
    const rows = FIGURES.map((x) => {
      const d = delta(x.key, ch[x.key]);
      const big = Math.abs(ch[x.key]) >= 0.1 || ch[x.key] === Infinity;
      return `<tr class="${big ? 'lab-big' : ''}"><td class="n">${x.zh}</td><td class="v">${show(x.key, before)}</td><td class="v">${show(x.key, after)}</td><td class="c ${d.good === null ? '' : d.good ? 'good' : 'bad'}">${d.text}</td></tr>`;
    });
    this.out.innerHTML = `<table class="lab-t"><tr><td class="n"></td><td class="v">现在</td><td class="v">换上</td><td class="c"></td></tr>${rows.join('')}</table>`;
    const pass = top && (top.c === Infinity || Math.abs(top.c) >= 0.1);
    const name = partDef(this.part.value).name.zh;
    this.say(top ? `${name}：变化最大的是「${FIGURES.find((x) => x.key === top.key)?.zh}」${delta(top.key, top.c).text}${pass ? '' : '，不到 10%'}。` : `${name}：什么都没变。`, !pass);
    this.busy = false;
  }

  private async tryAll(): Promise<void> {
    const v = this.host.devLabVehicle();
    if (!v || this.busy) return;
    this.busy = true;
    const c = this.cat.value as Category;
    const list = PARTS.filter((p) => p.cat === c);
    this.say('测量中……');
    await pause();
    const before = figuresOf(structuredClone(v.build));
    const rows: { name: string; text: string; pass: boolean; mag: number }[] = [];
    for (const p of list) {
      this.say(`测量中……${rows.length + 1} / ${list.length}`);
      await pause();
      const b = tried(v.build, p.id);
      if (!b) {
        rows.push({ name: p.name.zh, text: '装不上', pass: true, mag: -1 });
        continue;
      }
      const top = biggest(changes(before, figuresOf(b)));
      const mag = top ? (top.c === Infinity ? 9 : Math.abs(top.c)) : 0;
      rows.push({ name: p.name.zh, text: top ? `${FIGURES.find((x) => x.key === top.key)?.zh} ${delta(top.key, top.c).text}` : '没变', pass: mag >= 0.1, mag });
    }
    rows.sort((a, b) => b.mag - a.mag);
    this.out.innerHTML = `<table class="lab-t">${rows.map((r) => `<tr class="${r.pass ? '' : 'miss'}"><td class="n">${r.name}</td><td class="c">${r.text}</td></tr>`).join('')}</table>`;
    const miss = rows.filter((r) => !r.pass);
    this.say(miss.length ? `${miss.length} 个零件变化不到 10%（红色的：多半是这辆车原来就装着的）。` : `${list.length} 个都至少有一项变化 10% 以上。`, miss.length > 0);
    this.busy = false;
  }
}
