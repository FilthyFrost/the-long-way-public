/**
 * The proving ground's tab of the developer's panel (docs/MODCAR.md §28): to a section of it at a click, with the
 * vehicle at hand (set down at its start); the robot at the wheel or not; the live curves on screen or not; and
 * two builds run on a section back to back — A (the vehicle as it is, or as it was when A was noted) and B (A with
 * a part tried, or the vehicle as it is now) — A against B when both are done; the runs so far.
 */
import { CAT_LABEL, frameDef } from '../../core/modcar/frames';
import { EXEMPT_CATS } from '../../core/modcar/lab/figures';
import { SECTIONS, type SectionId } from '../../core/modcar/proving/layout';
import { PARTS, partDef } from '../../core/modcar/parts';
import type { Build, Category } from '../../core/modcar/types';
import { tried } from './devLab';
import type { ProvingHud } from './provingHud';
import type { ProvingSession } from './provingSession';

/** what the tab needs of the game */
export interface ProvingPaneHost {
  devLabVehicle(): { build: Build; name: string } | null;
  provingSession(): ProvingSession | null;
  provingHud(): ProvingHud | null;
}

export const PROVING_CSS = `
.mc-dev .pg-go { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin: 8px 0 6px; }
.mc-dev .pg-go button { padding: 7px 4px; }
.mc-dev .pg-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 6px 0; font-size: 13px; }
.mc-dev .pg-row label { display: flex; align-items: center; gap: 5px; cursor: pointer; }
.mc-dev .pg-row .tx { color: #c9c6c0; }
.mc-dev .pg-row b { font-weight: 700; }
.mc-dev .pg-hist { margin-top: 6px; font-size: 12.5px; line-height: 1.5; }
.mc-dev .pg-hist div { padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.07); }
.mc-dev .pg-hist div i { font-style: normal; color: #c9c6c0; margin-right: 6px; }
.mc-dev .pg-hist div.bad { color: #ff9a7e; }
`;

export class ProvingPane {
  private body!: HTMLElement;
  private veh!: HTMLElement;
  private msg!: HTMLElement;
  private out!: HTMLElement;
  private hist!: HTMLElement;
  private aText!: HTMLElement;
  private robot!: HTMLInputElement;
  private hudBox!: HTMLInputElement;
  private sec!: HTMLSelectElement;
  private cat!: HTMLSelectElement;
  private part!: HTMLSelectElement;
  private slalom!: HTMLSelectElement;
  private ramp!: HTMLSelectElement;
  private frame = '';
  /** A noted (a copy of the build as it was), else null: A is the vehicle as it is when the runs start */
  private noted: Build | null = null;
  private lastHist = '';
  private lastOut = '';

  constructor(private readonly host: ProvingPaneHost) {}

  build(pane: HTMLElement): void {
    const body = document.createElement('div');
    body.className = 'body';
    pane.appendChild(body);
    this.body = body;
    body.innerHTML = `<h5>试车场</h5><div class="note">在车库后面一公里。点一段路，连人带车过去停在它的起点；开过起点线计时自己开始，右上角是实时曲线，跑完给出这一段测到的数。</div>
<div class="where pg-veh"></div>
<div class="pg-go">${SECTIONS.map((s) => `<button data-go="${s.id}" data-tip="${s.help}">${s.zh}</button>`).join('')}</div>
<div class="pg-row"><label><input type="checkbox" class="pg-robot" /> 自动驾驶</label><span class="tx">机器人每次开法都一样，好对比</span></div>
<div class="pg-row"><span class="tx">绕桩</span><select class="pg-slalom"><option value="0" selected>贴着极限开</option>${[35, 40, 45, 50, 55, 60, 70].map((k) => `<option value="${k}">定速 ${k} km/h</option>`).join('')}</select><span class="tx">坡道</span><select class="pg-ramp"><option value="0">20%</option><option value="1" selected>30%</option><option value="2">40%</option></select></div>
<div class="pg-row"><label><input type="checkbox" class="pg-hud" checked /> 显示右上角的曲线</label></div>
<div class="btns" style="margin:4px 0 8px"><button data-act="stop">停下（松开方向盘）</button></div>
<h5>两套配置连跑对比</h5>
<div class="note">同一段路先跑 A 再跑 B，每次都停回起点、刹车先冷却；跑完车换回原来的样子。A 是车现在的样子（或者先「记下 A」再自己改装）；B 是在 A 上换一个零件，或者改装后车上的样子。</div>
<div class="pg-row"><span class="tx">路段</span><select class="pg-sec">${SECTIONS.map((s) => `<option value="${s.id}">${s.zh}</option>`).join('')}</select></div>
<div class="pg-row"><span class="tx">A</span><b class="pg-a">车现在的样子</b><button data-act="noteA">记下 A</button><button data-act="forgetA">不记了</button></div>
<div class="pg-row"><span class="tx">B</span><select class="lab-cat"></select><select class="lab-part"></select></div>
<div class="btns two" style="margin:6px 0 4px"><button class="go" data-act="ab">连跑 A、B</button><button data-act="stop">停下</button></div>
<div class="msg"></div>
<div class="pg-out"></div>
<h5>跑过的</h5>
<div class="pg-hist"></div>`;
    this.veh = body.querySelector('.pg-veh')!;
    this.msg = body.querySelector('.msg')!;
    this.out = body.querySelector('.pg-out')!;
    this.hist = body.querySelector('.pg-hist')!;
    this.aText = body.querySelector('.pg-a')!;
    this.robot = body.querySelector('.pg-robot')!;
    this.hudBox = body.querySelector('.pg-hud')!;
    this.sec = body.querySelector('.pg-sec')!;
    this.cat = body.querySelector('.lab-cat')!;
    this.part = body.querySelector('.lab-part')!;
    this.slalom = body.querySelector('.pg-slalom')!;
    this.ramp = body.querySelector('.pg-ramp')!;
    this.cat.addEventListener('change', () => this.fillParts());
    this.hudBox.addEventListener('change', () => {
      const h = this.host.provingHud();
      if (h) h.enabled = this.hudBox.checked;
    });
    const opts = (): void => {
      const s = this.host.provingSession();
      if (!s) return;
      s.robotOpts.slalomKmh = Number(this.slalom.value);
      s.robotOpts.ramp = Number(this.ramp.value);
    };
    this.slalom.addEventListener('change', opts);
    this.ramp.addEventListener('change', opts);
    body.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.go) this.go(b.dataset.go as SectionId);
      const act = b.dataset.act;
      if (act === 'stop') this.stop();
      if (act === 'noteA') this.noteA();
      if (act === 'forgetA') {
        this.noted = null;
        this.say('A 就是车现在的样子。');
      }
      if (act === 'ab') this.ab();
    });
    this.tick();
  }

  private say(text: string, bad = false): void {
    this.msg.textContent = text;
    this.msg.classList.toggle('bad', bad);
  }

  private go(id: SectionId): void {
    const s = this.host.provingSession();
    if (!s) return this.say('这里没有试车场（只在有世界的开局里有）。', true);
    s.robotOpts.slalomKmh = Number(this.slalom.value);
    s.robotOpts.ramp = Number(this.ramp.value);
    s.go(id, this.robot.checked);
    this.sec.value = id;
    this.say(this.robot.checked ? `去「${SECTIONS.find((x) => x.id === id)?.zh}」，机器人来开。` : `去「${SECTIONS.find((x) => x.id === id)?.zh}」：${SECTIONS.find((x) => x.id === id)?.help}`);
  }

  private stop(): void {
    this.host.provingSession()?.stopAll();
    this.say('停下了。');
  }

  private noteA(): void {
    const v = this.host.devLabVehicle();
    if (!v) return this.say('先坐进一辆车，或者走到车旁边。', true);
    this.noted = structuredClone(v.build);
    this.say('记下了 A。现在可以改装（换零件），B 选「车上现在的样子」。');
  }

  private ab(): void {
    const s = this.host.provingSession();
    const v = this.host.devLabVehicle();
    if (!s) return this.say('这里没有试车场。', true);
    if (!v) return this.say('先坐进一辆车，或者走到车旁边。', true);
    const a = this.noted ? { build: this.noted, what: '记下的 A' } : { build: structuredClone(v.build), what: '车现在的样子' };
    let b: { build: Build; what: string } | null = null;
    if (this.part.value === 'now') {
      if (!this.noted) return this.say('先「记下 A」，改装以后再用「车上现在的样子」当 B。', true);
      b = { build: structuredClone(v.build), what: '改装后车上的样子' };
    } else {
      const t = tried(a.build, this.part.value);
      if (!t) return this.say('这辆车上没有地方装它。', true);
      b = { build: t, what: `换上${partDef(this.part.value).name.zh}` };
    }
    s.robotOpts.slalomKmh = Number(this.slalom.value);
    s.robotOpts.ramp = Number(this.ramp.value);
    const why = s.compare(this.sec.value as SectionId, a, b, this.robot.checked);
    if (why) return this.say(why, true);
    this.say(`${SECTIONS.find((x) => x.id === this.sec.value)?.zh}：先跑 A（${a.what}），再跑 B（${b.what}）${this.robot.checked ? '，机器人来开' : '，你来开'}。`);
  }

  /** the kinds of part this frame has a place for, as the lab lists them; B can also be the vehicle as it is now */
  private fillCats(b: Build): void {
    const frame = frameDef(b.frame);
    const cats = new Set<Category>();
    for (const m of frame.mounts) if (!EXEMPT_CATS.has(m.cat)) cats.add(m.cat);
    if ([...cats].includes('rim')) cats.add('tire');
    if (frame.mounts.some((m) => m.cat === 'engine')) cats.add('turbo');
    const order = PARTS.map((p) => p.cat).filter((c, i, a) => a.indexOf(c) === i && cats.has(c));
    this.cat.innerHTML = `<option value="now">车上现在的样子</option>${order.map((c) => `<option value="${c}">${CAT_LABEL[c]?.zh ?? c}</option>`).join('')}`;
    this.cat.value = order.includes('tire') ? 'tire' : order[0];
    this.fillParts();
  }

  private fillParts(): void {
    const c = this.cat.value;
    if (c === 'now') {
      this.part.innerHTML = '<option value="now">（记下 A 以后改装的）</option>';
      return;
    }
    this.part.innerHTML = PARTS.filter((p) => p.cat === c).map((p) => `<option value="${p.id}">${p.name.zh}</option>`).join('');
  }

  /** the live bits (a few times a second while the tab shows) */
  tick(): void {
    if (!this.body) return;
    const v = this.host.devLabVehicle();
    const s = this.host.provingSession();
    this.veh.textContent = v ? `${v.name}${s?.vehicle ? '（在试车场上）' : ''}` : '身边没有车：坐进一辆车，或者走到车旁边。';
    if (v && v.build.frame !== this.frame) {
      this.frame = v.build.frame;
      this.fillCats(v.build);
    }
    this.aText.textContent = this.noted ? '记下的样子' : '车现在的样子';
    if (!s) return;
    // the comparison
    const ab = s.ab;
    let out = '';
    if (ab) {
      const st = ab.i < 2 ? `正在跑 ${ab.legs[ab.i].label}（${ab.legs[ab.i].what}）` : ab.why ? `没跑完：${ab.why}` : '跑完了';
      const rows = s.rows();
      out = `<div class="where">${SECTIONS.find((x) => x.id === ab.section)?.zh} · ${st}</div>${
        rows.length
          ? `<table class="lab-t"><tr><td class="n"></td><td class="v">A</td><td class="v">B</td><td class="c"></td></tr>${rows
              .map((r) => `<tr><td class="n">${r.zh}</td><td class="v">${r.a}</td><td class="v">${r.b}</td><td class="c ${r.better === null ? '' : r.better ? 'good' : 'bad'}">${r.delta}</td></tr>`)
              .join('')}</table>`
          : ab.legs
              .filter((l) => l.result)
              .map((l) => `<div class="note">${l.label}：${l.result!.line}</div>`)
              .join('')
      }`;
    }
    if (out !== this.lastOut) {
      this.lastOut = out;
      this.out.innerHTML = out;
    }
    const list = s.runs.results.slice(-8).reverse();
    const hist = list.length ? list.map((r) => `<div class="${r.ok ? '' : 'bad'}"><i>${SECTIONS.find((x) => x.id === r.section)?.zh}</i>${r.line}</div>`).join('') : '<div class="note">还没有跑过。</div>';
    if (hist !== this.lastHist) {
      this.lastHist = hist;
      this.hist.innerHTML = hist;
    }
  }
}
