# ModCar 声音：做法、接口、加发动机

> 声音子代理 2026-11-16；工坊一批 2026-11-17（发电机音色库 `gen_d1`、拉绳起动、工坊机械声）。发动机用 Engine Simulator 离线录成音色库，运行时按转速和负载交叉混合；机械声全部程序合成。夜里机器静音，全程不外放：录音直接写文件，检查用无头 Chrome 的 OfflineAudioContext。

## 1. 文件

| 位置 | 内容 |
| --- | --- |
| `public/audio/modcar/engines/<id>/` | 九个音色库：八台车用发动机，`on_<rpm>` / `off_<rpm>` 循环、`crank`（起动机空转）、`catch`（着车）、`shutdown`、`stall`、`limiter`（撞断油器）；工坊发电机 `gen_d1`：调速转速附近 2700 / 3000 / 3300 三档的 `on`（带载）/ `off`（轻载运转），`crank`（拉绳）、`catch`、`shutdown`、`stall`，没有 `limiter`（见 §2.1）。每个文件 `.ogg`（Opus）和 `.m4a`（AAC）各一份，`manifest.json` 记转速、负载、循环点、相位、原始响度。合计约 10.6 MB（gen_d1 0.37 MB）。 |
| `src/game/modcar/engineAudio.ts` | `EngineVoice`：运行时发动机声（`TONES` 里每台一行；`pullStart` = 拉绳起动） |
| `src/game/modcar/foley.ts` | `Foley`：门、锁扣、扳手、零件、喷罐、海绵、倒液体、钥匙、喇叭、手刹、挡位；身体（吃喝、药、受伤、背包）；工坊（发电机拉绳 / 开关 / 烧干油，粉碎机空转 / 粉碎中 / 按材质碎一件，计数器，工作台摆工具 / 挥锤 / 锤击 / 做好了，来电 / 断电 / 没电，灯管） |
| `src/game/modcar/synth.ts` | 两者共用的离线合成小工具（不依赖 Web Audio，Node 里也能跑） |
| `src/game/modcar/sound.ts` | `attachModCarSound(audio)`：挂到现有 `AudioEngine` 的同一个 AudioContext 和总线上 |
| `tools/enginesim/` | 音色库的生成工具链（见第 2 节） |
| `harness/audio/` | 无头渲染检查；`harness/sim/modcar-audio.test.ts` 是 Node 侧检查 |
| `public/audio/LICENSES.md` | 来源与许可（Engine Simulator，MIT） |

## 2. 音色库怎么做的

1. **编译录音器**：`node tools/enginesim/prepare.mjs --src <engine-sim 克隆> --out <目录> --build --flex <win_flex> --bison <win_bison>`。只拷贝模拟、脚本编译器和脚本库，打两处补丁（渲染器头文件换空壳；piranha 的 Boost 路径换 std::filesystem），加上我们的 `esim_render.cpp`，用 VS Build Tools 自带的 CMake + Ninja 编译。录音器没有窗口、不碰声卡，按计划文件驱动起动机、点火、油门、测功机，把合成器在电平自动增益之前的信号直接写成 32 位浮点 WAV（另附遥测 CSV）。
2. **发动机脚本**：`tools/enginesim/engines/*.mr`（虚构的 ModCar 发动机，`modcar_lib.mr` 放共用缸盖和各种布局的凸轮轴）。柴油没有压燃：高压缩 + 快燃 + 早点火，滑行是“油门全开、断火”；二冲程是“1+4、2+3 共管的直列四缸”（每根管每转一个排气脉冲，和 180° 二冲程双缸一样）。注意：点火曲线的采样点间距必须小于 1000 rpm（函数的滤波半径），否则点火角塌掉。
3. **录音**：`python -I tools/enginesim/make_banks.py record [id...]`（八台并行约 4 分钟）。每个稳态都用测功机按住转速录 3.4 s，不会熄火；转速档按几何间距（相邻比 1.13，回放变调不超过约 ±6%），并且相邻不超过 750 rpm（高转速的单缸、二冲程、对置六缸在高处改为等距），从怠速到红线以上。`on` = 全油门（测功机吸收功率），`off` = 滑行（汽油机关油门带点火；柴油机断油），怠速档的 `off` 就是怠速。
4. **切库**：`python -I tools/enginesim/make_banks.py build [id...]`（`bank_build.py`）：
   - 按自相关找精确的整数个发动机循环（全负载 1.6 s、滑行 2.0 s），在最吻合的位置下刀并交叉淡化接缝；
   - 循环前后加循环填充（前 64 ms、后 32 ms），解码器不管裁不裁编码延迟、重采样器的边缘都碰不到接缝；
   - 离线叠层：跟着每个排气脉冲起伏的气流噪声（全部发动机）、气门落座的细小“嗒”声（四冲程汽油机）、柴油的敲缸和喷油声、风冷散热片的余振、二冲程的轻负载缺火（ring-ding）和“上管”共振；
   - 每个循环算出发动机循环的相位（按曲轴角折叠成平均循环，相邻档互相关串起来），运行时据此同相起播；
   - 统一到同一响度，原始响度（相对本库全负载最大）记进清单的 `db`；
   - ffmpeg 编码成 Opus 56 kbps 和 AAC 72 kbps，并用解码结果核对接缝。
   需要的路径用环境变量 `MODCAR_ESIM`、`MODCAR_RAW`、`MODCAR_FFMPEG` 指定（默认在 `D:/modcar-scratch/sound/`）。

### 2.1 工坊发电机 `gen_d1`

- **机器**：风冷单缸柴油，418 cc（缸径 86、行程 72 mm），约 19:1，50 Hz 发电机组，调速 3000 rpm（“游车” ±100 rpm 由游戏自己给）。飞轮 8 kg（带拉绳起动盘和风扇）加发电机转子；消声罐直接装在排气口。脚本 `tools/enginesim/engines/gen_d1.mr`（单缸结构照 `eng_mower.mr`，柴油设定照 `eng_i4d.mr` / `eng_d6.mr`：高压缩、快燃、早喷油；“油门”就是调速器的油门齿条，`throttle_gamma` 2 让轻载不那么敏感），冲激响应 `mild_exhaust_0`（单缸的“突突”脉冲清楚、有低频体量；`minimal_muffling_03` 太薄）。
- **录音计划**：`engines.json` 里 `offMode: "light"` 的机器走 `make_banks.py` 的 `make_plan_light`（八台车用发动机的计划逐字节没变，生成后对比过）：
  - 转速档只录 `steps` 2700 / 3000 / 3300；`on` = 齿条全开（粉碎机满负荷，测功机吸收约 54 N·m），`off` = 轻载运转（`offThrottle` 0.2，约 10 N·m，点火开着）——发电机组从不滑行，`off` **不是**断油滑行。3000 的 `off` 记为 `idle`（调速转速、空载）。
  - `crank` = 拉绳：进气全开（柴油没有节气门，每个压缩冲程都“顶”一下），绳子 80 lb·ft、350 rpm，膨胀冲程把它甩到 600 多，平均约 510 rpm，循环 4 个发动机循环（约 0.96 s）；`crankSpeed: "mean"`：转速摆动大，循环长度按平均转速定（中位数会偏）。
  - 起动：**先**用绳子（录音器的起动机）在进气关着时平稳地正转 0.35 s，让测功机接过去，**再**打开齿条点火。高压缩单缸着车会反冲，测功机按当时的转向接管（录音器读到的转速没有符号），接在反冲上就会倒着拖、永远不着——第一次试录就是这样。`catch` 用 0.6 s（`catchRamp`）冲到 3150（`flare` 1.05）再落到 3000。
  - `shutdown`：轻载运转中断油，靠飞轮转停（约 2.3 s，最后几下压缩的闷响）；`stall`：齿条全开（`stallThrottle` 1，调速器拼命加油）仍被拖停（过载，粉碎机卡死）；`limiterTake: false`：没有断油器录音（调速器管着，`TONES` 里 `governed`）。
- **切库**（`bank_build.py`，八台车用发动机的构建结果没变：重建 eng_mower / eng_i4d / eng_2t，清单和仓库里的完全一致）：
  - `LAYERS['gen_d1']`：排气沙哑噪声、风冷散热片余振、喷油敲缸——`lightOff`：轻载的 `off` 也在燃烧，按 idle 档（−7 dB）加，带载反而轻一点（−11 dB）：柴油空载最“咔咔”响，带载更闷更沉；发电机 100 Hz 嗡声（`hum`：两极转子跟曲轴同转，电频 = 曲轴频率，按曲轴阶次 2、4、6、8、12、24 叠，整周期，带载 −19 dB、轻载 −25 dB，随每次点火轻微起伏）。
  - `crank` 层（只有 gen_d1）：Engine Simulator 拉绳只给出很低的压缩闷响（频谱质心 30 Hz），加上随脉冲起伏的进排气“噗”声和气门“嗒”声后质心约 340 Hz。
  - 电平：模拟器里轻载和满载几乎一样响（差 1 dB 以内），真机带载约响 3 dB，所以 `offTrimDb` −8（运行时压缩 0.3 后约 −2.4 dB）；轻载机器的 `idle` 也是轻载运转，同样调；`catch` / `shutdown` / `stall` 起止都在轻载运转上，也按 `offTrimDb` 调，再加 `shotTrimDb` −6.5（声部给一次性声音比循环高 2 dB），这样关机 / 着车接得上循环。
- 检查：`node harness/audio/modcar_render.mjs gen_d1 --loops --no-metrics` 渲染发电机序列（拉一下没着、再拉着车、轻载运转带游车、粉碎机带载（掉速再回）、轻载、关机）、烧干油、两种拉绳 A/B（见 §5），并在 Chrome 里解码检查 7 个循环的接缝。

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
  misfire,                   // 可选 0..1：缺火概率（车况差、加错油熄火前的突突）
  knock,                     // 可选 0..1：连杆敲击（车况很差），负载越大越响
  steam,                     // 可选 0..1：水温红区冒蒸汽
  approach,                  // 可选：车外听者，车朝你开来的速度（m/s，远离为负），多普勒
});
snd.foley.play('door_close', { material: 'fridge' }); // metal / rusty / armor / cage / fridge
snd.foley.play('part_setdown', { mass: 235 });        // 按质量：小件叮当 → 发动机闷响
snd.foley.start('ratchet'); snd.foley.stop('ratchet'); // 装 / 拆进度期间
snd.foley.start('pour', { liquid: 'oil' });            // fuel / water / oil
snd.foley.horn('horn_air', down);                      // horn_beep / horn_trumpet（按一下奏一遍）/ horn_air
snd.foley.play('switch'); snd.foley.play('lever');     // 仪表台开关（灯）/ 挡杆进一格（P-R-N-D）

// 工坊：发电机是另一个声部
const gen = snd.voice();
gen.update({ engineId: 'gen_d1', rpm, load, throttle: load, running, cranking, inside: false, doorsOpen: 1, distance, starterRate: 1, stalled: false });
snd.foley.play('cord_pull');                           // 每拉一下绳（约 0.85 s：拉出、2–3 下压缩闷响、回绳棘爪响、把手回位）
snd.foley.play('gen_switch');                          // 发电机的重型拨动开关：开 / 关
snd.foley.play('gen_cough');                           // 烧干油 / 油不对：几下突突和最后一口气（同时 running = false）
snd.foley.start('recycler_run');                       // 粉碎机空转：电机嗡声、齿轮箱啸叫、刀辊转动的轻响
snd.foley.start('recycler_grind', { gain: work });     // 粉碎中，叠在 recycler_run 上；每帧调用，gain 0..1 跟着工作量
snd.foley.play('shred', { grind: 'metal' });           // 碎一件东西：metal / plastic / organic / cloth / wood（默认 metal）
snd.foley.play('tally');                               // 计数器翻一格（每计 5 个）
snd.foley.play('craft_start');                         // 工作台：摆出工具
snd.foley.play('hammer_swing');                        // 挥锤
snd.foley.play('hammer_hit', { grind: 'wood' });       // 锤在铁砧上的工件：metal 铁砧长鸣 / plastic 闷 / wood 木“哒” / organic、cloth 软垫
snd.foley.play('craft_done');                          // 做好了：明亮的“叮”（两个钟声分音加一点闪光，约 0.85 s）
snd.foley.play('power_on');                            // 来电：接触器“咔嗒”、嗡声升起、灯管跳几下亮（约 1.25 s，尾巴交给下面两个循环）
snd.foley.start('lamp_buzz');                          // 灯管的微弱嗡声
snd.foley.play('power_off'); snd.foley.play('no_power'); // 断电：一声“咔”、嗡声和电机一起落下；没电时按开关：闷闷的一下
```

- **`grind`**（`FoleyOpts.grind`，`'metal' | 'plastic' | 'organic' | 'cloth' | 'wood'`）：`shred` 是被碎的东西，`hammer_hit` 是铁砧上的工件；另起的字段，和门的 `material` 无关。缓存键只在给了 `grind` 时才加这一段（其他声音的键和随机种子不变）。
- **不重复**：一次性声音每次随机挑一个渲染版本，但不会连着两次挑同一个（锤连敲两三下、一件接一件地碎，每下都不一样）；`hammer_hit` 5 个版本，`shred` / `tally` / `cord_pull` 4 个，其余 3 个。
- **`pullStart`**（`EngineTone`，gen_d1 为 true）：拉绳起动。`cranking` 时没有起动机电机声、没有电磁开关“咔、咔”，与电瓶（`starterRate`）无关，`crank` 循环的回放速率跟着 rpm（rpm / 库里的 crank 转速 510，限 0.6–1.3）；绳子本身的声音是 foley 的 `cord_pull`。车用发动机的行为一点没变（`modcar_render.mjs` 的 A/B：运转时两种渲染逐样本相同，差 −115 dB）。
- **发电机的驱动建议**：运转时 rpm = 3000 ± 100（调速器游车，周期 1–2 s），`load` 0.15（空载）… 0.6（粉碎中），**`throttle` 就给 `load`**（调速器的齿条跟着负载走）——这样空载时约 80 % 是轻载循环、粉碎时约 64 % 是带载循环；若给 `0.35 + 0.4 * load`，空载就已混进 42 % 的带载声，带载对比变小。粉碎机开始吃料时 rpm 先掉 120–150 再回来（调速器下垂），这是发电机“接上负载”最像的声音。**`stalled: false`**：关机和烧干油都给它，否则 `load > 0.35` 时会按“憋熄火”放 `stall`；粉碎机卡死拖停才给 `stalled: true`。拉绳：`cranking` 约 0.3–0.6 s、rpm ≈ 450–510；`catch` 只在上一帧还在 `cranking` 时才放，所以着车那一下也要先拉 0.3 s 以上再在 `cranking` 变假的同一帧给 `running: true`（不然循环直接冷启动，没有着车声）。烧干油：最后 0.5 s `misfire` 0 → 0.7、rpm 掉 200 左右，同时 `play('gen_cough')` 并让 `running = false`。机器的 foley 不按距离衰减，离得远时用 `gain` 自己降。
- **电平**（`SHOT_LEVEL` / `LOOP_LEVEL`，K 计权响度：一次性声音取 400 ms 最大，循环取整体）：参照门关上 −18.7、开门 −33、锁扣 −36、钥匙 −36、放下 25 kg 零件 −23、撞击 −11、扳手循环 −30；发电机 4 m 外轻载 −30.6、带载 −28.8（V8 在 3 m 外怠速 −34.8）。新声音：拉绳 −21、发电机开关 −27、烧干油 −24、碎一件 金属 −18…−20 / 塑料 −22 / 木 −24 / 有机 −24 / 布 −29、计数 −38、摆工具 −28、挥锤 −33、锤 金属 −17 / 木 −23 / 塑料 −25 / 有机 −26 / 布 −27、做好了 −22、来电 −24、断电 −27、没电 −35；粉碎机空转 −31.5、粉碎中 −24.7、灯管 −47.5。整个工坊场景（`--workshop`）里最响的是三下锤（−16 瞬时）、粉碎（−18）、门（−19）、“叮”（−19），机器的持续声在 −29 左右。

- 起动机：`cranking && !running` 时播 `crank` 循环 + 合成的起动机电机声（每个压缩冲程拖慢一下）；`starterRate < 0.15`（电瓶没电）时只有电磁开关“咔、咔”；`running` 变真时播 `catch`，循环在它尾巴下淡入。`running` 变假时按情况播 `shutdown` 或 `stall`。
- 建议映射（§3 规则）：车况 c → `misfire = max(0, 0.6 - c) * 0.5`、`knock = max(0, 0.4 - c) * 2.5`；加错燃料熄火前 `misfire ≈ 0.6`；水温红区 → `steam`。车外听者给 `distance`（空气吸收随距离变暗）和 `approach`。
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
5. 不开车、从不滑行的机器（发电机、水泵……）：`offMode: "light"`，再给 `steps`（工作转速附近几档）、`offThrottle`（轻载齿条）、`idleThrottle`、`crankThrottle`、`catchRamp`、`stallThrottle`、`limiterTake: false`、`offTrimDb` / `shotTrimDb`（见 §2.1 和 `engines.json` 的 `_doc`）；`TONES` 里 `governed: true`，手拉起动加 `pullStart: true`；测试里加进 `harness/sim/modcar-audio.test.ts` 的 `MACHINES`，渲染工具里加进 `modcar_render.mjs` 的 `MACHINES`。

## 5. 验证

- `npm test`：`harness/sim/modcar-audio.test.ts` 检查每个清单条目两种格式都在、容器解码长度和清单一致（Ogg granule / MP4 edit list）、循环点在填充之内、转速档覆盖怠速到红线且相邻比 < 1.14（发电机：至少 3 档、没有 `limiter`）、构建时测得的接缝干净、混合数学、所有机械声配方；发电机：调速、拉绳、只有 `gen_d1` 是 `pullStart`、三档两种负载、带载比轻载响 1.5–4 dB、拉绳转速约 400–560；工坊机械声：都在目录里、每个一次性声音（含五种 `grind`）任意种子都有声、在自己的电平上不削波、首尾为零、无直流、时长合乎要求；循环无台阶、无拐点、低频不跳相、首尾无凹陷 / 鼓包、无直流（用故意弄坏的循环验证过这些检查会报）；材质各有颜色、铁砧长鸣而塑料 / 木头很快停、“叮”是两个分音（E6 和上方五度）、来电嗡声升起 / 断电落下、`Foley` 播放器不连续重复同一个渲染、不同 `grind` 分开缓存。
- `node harness/audio/modcar_render.mjs --all`：无头 Chrome 里用真正的 `EngineVoice` / `Foley` 渲染每台发动机的“巡游”（起动 → 怠速 → 轰油 → 一挡拉到断油 → 换挡 → 二挡 → 收油滑行 → 熄火）、慢扫转速、排气与车厢变体、全部机械声，WAV 写到 `D:/modcar-scratch/sound/out/`，打印响度和频谱质心；`--loops` 用 Chrome 自己解码每个循环、循环播放三圈，检查接缝处的二阶差分（0 个咔嗒；点了名就只查点名的库）。发电机不走巡游，走自己的序列，并检查：拉绳听得见、带载更响且音色变了、转停后无声、不削波、拉绳 A/B（`tone: { pullStart: false }` 时会多出 −52 dB 的起动机电机声、电瓶没电时只剩电磁开关的“咔”；`pullStart` 时都没有、没电也照常拉）。`--workshop` 渲染整个工坊场景（发电机在 6 m 外，人在机器旁：两下拉绳、来电、灯、粉碎机、碎三件东西（发电机带载）、计数、做一件东西（三下锤、“叮”）、关门作参照、烧干油、断电、没电时按开关），检查不削波、全停后无声。摘要写进 `loop/metrics/audio_modcar.json`；加 `--no-metrics` 不写。
- 试听台 `harness/audio/listen.html`：发动机列表里有 `gen_d1`（“拉绳”按钮，第二下着车；油门滑块就是负载），机械声里有全部工坊声音。

## 6. 频谱校准

和两段自由许可的真车录音比过长时平均频谱（只用于分析，没进仓库、不随游戏发布）：Wikimedia Commons 上的
“Chevrolet Chevelle - engine and exhaust sound”（CC BY 3.0）和 “Volkswagen Beetle 1300 (1972) - engine and exhaust sound”（CC BY 3.0）。
真车在 0.8–3.2 kHz（排气的“吠”）几乎和低频一样强，Engine Simulator 原声低 15–17 dB。现在按发动机加了 700 Hz 以上的
presence 提升、1.3 kHz 的排气“吠”峰（随排气件加大）、脉冲同步的沙哑噪声和大排量机的低频 body：V8 全负载拉升在这几个频段
原装约 −10 dB、运动 −7.5、侧排 −5、开放歧管 −2（参考录音约 0 dB，是改装排气 + 手持相机）。

## 7. 已知不足

- 没有人耳试听过：电平、叠层比例都按频谱和响度测量定的，第二天需要试听调 `TONES` / `EXHAUSTS` / `LAYERS`（工坊声音调 `SHOT_LEVEL` / `LOOP_LEVEL`）。
- 发电机：模拟器的轻载和满载几乎一样响，带载对比是用 `offTrimDb` 和叠层（敲缸、发电机嗡声）做出来的；拉绳平均转速约 510 rpm（比“400–500”略高，运行时按 rpm 降调）；柴油压燃仍是近似。工坊机械声的接缝检查对粉碎循环里藏在密集碎声下的低频跳相不够敏感（那些分音都是按整周期造的）。
- 柴油和二冲程是近似；Engine Simulator 本身偏暗，亮度主要靠冲激响应和离线叠层。
- 只有两档负载（全负载 / 滑行），半油门是两者混合。
- 车外只做了距离衰减，没有多普勒和左右声像。
