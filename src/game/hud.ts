/** Minimal DOM overlay: a start hint and a small telemetry line (F3). The real gauges are in the cab. */
export class Hud {
  private readonly line: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private frames = 0;
  private acc = 0;
  private fps = 0;
  visible = true;

  constructor(show: boolean) {
    this.visible = show;
    const style = document.createElement('style');
    style.textContent = `
      .rt-line { position: fixed; left: 12px; bottom: 10px; font: 12px/1.4 ui-monospace, Menlo, Consolas, monospace;
        color: #f3ead6; text-shadow: 0 1px 2px #0009; pointer-events: none; white-space: pre; opacity: .85; }
      .rt-hint { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 18px 26px; border-radius: 14px;
        background: #1b1f25cc; color: #f3ead6; font: 15px/1.7 system-ui, "PingFang SC", "Microsoft YaHei", sans-serif; text-align: center;
        pointer-events: none; transition: opacity .6s; letter-spacing: .02em; }
      .rt-hint b { color: #ffd9a0; font-weight: 600; }`;
    document.head.appendChild(style);
    this.line = document.createElement('div');
    this.line.className = 'rt-line';
    this.hint = document.createElement('div');
    this.hint.className = 'rt-hint';
    this.hint.innerHTML =
      '点击画面开始<br><b>W A S D</b> 驾驶 · <b>空格</b> 手刹（停车时按住再松开 = 拉上） · <b>鼠标</b> 环顾<br><b>Q / Z</b> 挡杆 P R N D · <b>M</b> 手动挡（Q 加挡 Z 减挡） · <b>K</b> 钥匙（按住打火） · <b>H</b> 喇叭 · <b>V</b> 雨刷 · <b>B</b> 双闪<br><b>C</b> 视角 · <b>L</b> 车灯 · <b>R</b> 扶正 · <b>P</b> 自动驾驶 · <b>F3</b> 数据<br><b>E</b> 起身 / 坐下（房车里可以走动） · <b>1–9</b> 换座位 · <b>O</b> 开营' +
      '<br>停稳后 <b>E</b> 下车 · <b>Shift</b> 跑 · <b>C</b> 蹲 · <b>E</b> 拿 / 用 · 按住 <b>G</b> 放下 · <b>Tab</b> 背包'; // player
    document.body.append(this.line, this.hint);
    if (!show) {
      this.line.style.display = 'none';
      this.hint.style.display = 'none';
    }
  }

  dismissHint(): void {
    this.hint.style.opacity = '0';
  }

  toggle(): void {
    this.visible = !this.visible;
    this.line.style.display = this.visible ? '' : 'none';
  }

  update(dt: number, text: () => string): void {
    this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.fps = this.frames / this.acc;
      this.frames = 0;
      this.acc = 0;
      if (this.visible) this.line.textContent = `${this.fps.toFixed(0)} fps  ${text()}`;
    }
  }
}
