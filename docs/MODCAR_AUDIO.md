# ModCar 声音：做法、接口、加发动机

> 声音子代理 2026-11-16。发动机用 Engine Simulator 离线录成音色库，运行时按转速和负载交叉混合；机械声全部程序合成。夜里机器静音，全程不外放：录音直接写文件，检查用无头 Chrome 的 OfflineAudioContext。

## 1. 文件

| 位置 | 内容 |
| --- | --- |
| `public/audio/modcar/engines/<id>/` | 八台发动机的音色库：`on_<rpm>` / `off_<rpm>` 循环、`crank`（起动机空转）、`catch`（着车）、`shutdown`、`stall`、`limiter`（撞断油器）；每个文件 `.ogg`（Opus）和 `.m4a`（AAC）各一份，`manifest.json` 记转速、负载、循环点、相位、原始响度。合计约 10 MB。 |
| `src/game/modcar/engineAudio.ts` | `EngineVoice`：运行时发动机声 |
| `src/game/modcar/foley.ts` | `Foley`：门、锁扣、扳手、零件、喷罐、海绵、倒液体、钥匙、喇叭、手刹、挡位 |
| `src/game/modcar/synth.ts` | 两者共用的离线合成小工具（不依赖 Web Audio，Node 里也能跑） |
| `src/game/modcar/sound.ts` | `attachModCarSound(audio)`：挂到现有 `AudioEngine` 的同一个 AudioContext 和总线上 |
| `tools/enginesim/` | 音色库的生成工具链（见第 2 节） |
| `harness/audio/` | 无头渲染检查；`harness/sim/modcar-audio.test.ts` 是 Node 侧检查 |
| `public/audio/LICENSES.md` | 来源与许可（Engine Simulator，MIT） |

## 2. 音色库怎么做的

1. **编译录音器**：`node tools/enginesim/prepare.mjs --src <engine-sim 克隆> --out <目录> --build --flex <win_flex> --bison <win_bison>`。只拷贝模拟、脚本编译器和脚本库，打两处补丁（渲染器头文件换空壳；piranha 的 Boost 路径换 std::filesystem），加上我们的 `esim_render.cpp`，用 VS Build Tools 自带的 CMake + Ninja 编译。录音器没有窗口、不碰声卡，按计划文件驱动起动机、点火、油门、测功机，把合成器在电平自动增益之前的信号直接写成 32 位浮点 WAV（另附遥测 CSV）。
2. **发动机脚本**：`tools/enginesim/engines/*.mr`（虚构的 ModCar 发动机，`modcar_lib.mr` 放共用缸盖和各种布局的凸轮轴）。柴油没有压燃：高压缩 + 快燃 + 早点火，滑行是“油门全开、断火”；二冲程是“1+4、2+3 共管的直列四缸”（每根管每转一个排气脉冲，和 180° 二冲程双缸一样）。注意：点火曲线的采样点间距必须小于 1000 rpm（函数的滤波半径），否则点火角塌掉。
3. **录音**：`python -I tools/enginesim/make_banks.py record [id...]`（八台并行约 4 分钟）。每个稳态都用测功机按住转速录 3.4 s，不会熄火；转速档按几何间距（相邻比 1.13，回放变调不超过约 ±6%），从怠速到红线以上。`on` = 全油门（测功机吸收功率），`off` = 滑行（汽油机关油门带点火；柴油机断油），怠速档的 `off` 就是怠速。
4. **切库**：`python -I tools/enginesim/make_banks.py build [id...]`（`bank_build.py`）：
   - 按自相关找精确的整数个发动机循环（全负载 1.6 s、滑行 2.0 s），在最吻合的位置下刀并交叉淡化接缝；
   - 循环前后加循环填充（前 64 ms、后 32 ms），解码器不管裁不裁编码延迟、重采样器的边缘都碰不到接缝；
   - 离线叠层：跟着每个排气脉冲起伏的气流噪声（全部发动机）、气门落座的细小“嗒”声（四冲程汽油机）、柴油的敲缸和喷油声、风冷散热片的余振、二冲程的轻负载缺火（ring-ding）和“上管”共振；
   - 每个循环算出发动机循环的相位（按曲轴角折叠成平均循环，相邻档互相关串起来），运行时据此同相起播；
   - 统一到同一响度，原始响度（相对本库全负载最大）记进清单的 `db`；
   - ffmpeg 编码成 Opus 56 kbps 和 AAC 72 kbps，并用解码结果核对接缝。
   需要的路径用环境变量 `MODCAR_ESIM`、`MODCAR_RAW`、`MODCAR_FFMPEG` 指定（默认在 `D:/modcar-scratch/sound/`）。

## 3. 运行时接口

```ts
import { attachModCarSound } from './modcar/sound';
// AudioEngine.start() 在用户手势里跑过之后：
const snd = attachModCarSound(game.audio)!;          // { engine, foley, voice() }
// 每帧：
snd.engine.update({
  engineId: 'eng_v8',        // 没装发动机传 null
  exhaustId: 'exh_sport',    // exh_stock / exh_sport / exh_side；null = 没装排气（开放歧管）；不传 = 原装
  turbo: true,               // 装了 turbo_small
  rpm, load, throttle,       // load 0..1 = 要求的扭矩比例；throttle 0..1 = 油门踏板
  running, cranking,         // 自己在转 / 起动机在转
  inside: true,              // 听者在车厢里
  doorsOpen: 0.5,            // 车厢对外开放程度：开门、缺门、没顶 0..1
  starterRate: battery,      // 可选：电瓶强弱 0..1（弱电瓶转得慢）
  boost,                     // 可选：物理算了增压就传 0..1，否则声音自己按转速和油门带迟滞地涨
  distance,                  // 可选：车外听者距离（m）
  stalled,                   // 可选：这次熄火是不是憋熄（否则按转速和负载猜）
});
snd.foley.play('door_close', { material: 'fridge' }); // metal / rusty / armor / cage / fridge
snd.foley.play('part_setdown', { mass: 235 });        // 按质量：小件叮当 → 发动机闷响
snd.foley.start('ratchet'); snd.foley.stop('ratchet'); // 装 / 拆进度期间
snd.foley.start('pour', { liquid: 'oil' });            // fuel / water / oil
snd.foley.horn('horn_air', down);                      // horn_beep / horn_trumpet（按一下奏一遍）/ horn_air
```

- 起动机：`cranking && !running` 时播 `crank` 循环 + 合成的起动机电机声（每个压缩冲程拖慢一下）；`running` 变真时播 `catch`，循环在它尾巴下淡入。`running` 变假时按情况播 `shutdown` 或 `stall`。
- 混合：每个负载取转速两侧最近的两个循环，按对数距离交叉混合，回放速率 = rpm / 循环转速（精确跟转速）；两个循环同相起播，混合权重按清单里的相似度（`coh`）保持总功率。全负载与滑行按 `loadMix(throttle, load)` 混合。
- 断油器：接近红线且油门大时淡入录下来的 `limiter`（调速器发动机——割草机和两台柴油机——不弹跳）。
- 叠层：进气轰鸣、风扇 / 齿轮啸叫（flat6、柴油）、涡轮啸叫与泄压阀、收油回火（几声大的，或者——排气越响越常见——一串细碎的噼啪）、排气件改变响度与明亮度并叠加脉冲同步的沙哑噪声、车厢关着时低通 + 约 105 Hz 的共鸣（点火频率经过时“嗡”一下）、开门/缺门时外部声回来。
- 其他车：`snd.voice()` 再要一个 `EngineVoice`；想要方位感就在它和总线之间接一个 PannerNode（构造函数第二个参数是任意 AudioNode）。
- 预加载：`loadBank(ctx, id)` 提前解码（每台约 0.4 s、约 16 MB 内存），没加载完之前那台车是静音的。
- 试听台：`npm run dev` 后打开 `http://127.0.0.1:5173/harness/audio/listen.html`（点“开始”才出声）。
- 旧引擎合成：用 ModCar 时给旧 `AudioEngine.update` 传 `engineOn: false, cranking: false`（风、路、天气、悬挂照旧），或把那两路增益置 0。

## 4. 加一台发动机

1. 在 `tools/enginesim/engines/` 写 `eng_xxx.mr`（照现有的抄：缸径行程、曲轴、连杆轴颈角度与点火顺序、凸轮、进排气、点火曲线），`main` 里只 `set_engine(...)`。
2. 在 `tools/enginesim/engines.json` 加一行：缸数、怠速、库顶转速（略高于红线）、红线、断油转速、松起动机的转速、着车冲高比例、滑行方式。
3. 如需离线叠层，在 `bank_build.py` 的 `LAYERS` 里加；在 `engineAudio.ts` 的 `TONES` 里加一行响度、压缩、进气、回火、起动机参数（不加用默认值）。
4. `python -I tools/enginesim/make_banks.py all eng_xxx`，然后 `npm test` 和 `node harness/audio/modcar_render.mjs eng_xxx --loops`。

## 5. 验证

- `npm test`：`harness/sim/modcar-audio.test.ts` 检查每个清单条目两种格式都在、容器解码长度和清单一致（Ogg granule / MP4 edit list）、循环点在填充之内、转速档覆盖怠速到红线且相邻比 < 1.14、构建时测得的接缝干净、混合数学、所有机械声配方。
- `node harness/audio/modcar_render.mjs --all`：无头 Chrome 里用真正的 `EngineVoice` / `Foley` 渲染每台发动机的“巡游”（起动 → 怠速 → 轰油 → 一挡拉到断油 → 换挡 → 二挡 → 收油滑行 → 熄火）、慢扫转速、排气与车厢变体、全部机械声，WAV 写到 `D:/modcar-scratch/sound/out/`，打印响度和频谱质心；`--loops` 用 Chrome 自己解码每个循环、循环播放三圈，检查接缝处的二阶差分（0 个咔嗒）。摘要写进 `loop/metrics/audio_modcar.json`。

## 6. 已知不足

- 没有人耳试听过：电平、叠层比例都按频谱和响度测量定的，第二天需要试听调 `TONES` / `EXHAUSTS` / `LAYERS`。
- 柴油和二冲程是近似；Engine Simulator 本身偏暗，亮度主要靠冲激响应和离线叠层。
- 只有两档负载（全负载 / 滑行），半油门是两者混合。
- 车外只做了距离衰减，没有多普勒和左右声像。
