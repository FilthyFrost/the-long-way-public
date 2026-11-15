> **换电脑继续开发：** 请先读 [`docs/MIGRATION.zh.md`](docs/MIGRATION.zh.md) 和 [`docs/handoff/HANDOFF.md`](docs/handoff/HANDOFF.md)。本快照对应原私有仓 `dev/m1` 提交 `d8fd175`。第三方参考图不在本仓库，来源见 [`refs/REFERENCE_MANIFEST.md`](refs/REFERENCE_MANIFEST.md)。未合入的工作在 [`wip/`](wip/README.md)。

# 公路旅行（暂名）

1–4 人合作的第一人称公路旅行生存游戏原型。技术栈：HTML5 + Three.js + TypeScript + Vite（浏览器网页游戏）。

完整方案在 Claude Docs 文档「后末日公路旅行游戏 · 方案 v0.1」，本地摘要见 [`docs/PLAN.md`](docs/PLAN.md)，自主迭代规程见 [`loop/LOOP.md`](loop/LOOP.md)。

## 运行

```bash
npm install
npm run dev        # 打开 http://127.0.0.1:5173 —— 车库开局（ModCar 模块化车辆）
```

**开局**：你站在一间老木头车库里，「方糖」轿车缺电瓶、两个车轮和发动机，油箱也是空的。左上角的清单一步步带你走，屏幕上的小菱形指着下一样东西：
1. 从工作台拿电瓶，走近车，能装的地方会亮起青白色的幽灵；对准它按住 E 装上。
2. 照样装好车轮和发动机。
3. 拿汽油桶对准油箱盖，按住左键加油。
4. 按门边的按钮打开大门。
5. 坐进驾驶座，按住 K 打火，松开手刹开出去，就上路了。

F1 随时打开按键卡。

| 走路时 | 按键 |
| --- | --- |
| 走动 / 环顾 / 跑 / 跳 | W A S D、鼠标、Shift、空格 |
| 拿起看着的东西；对准幽灵**按住**装上（已有零件就是替换，旧的到手上） | E 或左键 |
| 拆下看着的零件 | 按住右键 或 按住 F |
| 放下手上的东西 | 按住 G |
| 开 / 关车门、引擎盖、尾箱；看着车身 = 上车 | E |
| 加油 / 加水 / 加机油（拿着油桶、水壶、机油壶对准油箱盖、水箱、发动机） | 按住左键 |
| 喷漆 / 擦洗（拿着喷罐、海绵对准零件或车身；滚轮换颜色） | 按住左键 |

| 开车时 | 按键 |
| --- | --- |
| 油门 / 刹车（停稳后倒车）· 转向 | W / S · A / D |
| 打火（按住）/ 熄火 | K |
| 手刹：按住拉；停稳时长按锁住，再按一下松开 | 空格 |
| 挡杆 P R N D（手动挡时加 / 减挡）· 手动挡切换 | Q / Z · M |
| 车灯（关 → 近光 → 远光）· 喇叭 · 双闪 | L · H · B |
| 直接扳手刹杆、拨挡杆、拧钥匙、开收音机、按喇叭、开车门 | 鼠标对准 + 左键 |
| 下车 · 驾驶座 / 车外视角 · 翻车扶正 | E · C · R |
| 按键卡 · 辅助开关（默认硬核：手刹要自己松；可开“踩油门自动松手刹”等） | F1 · F2 |

ModCar 的网址参数：
- `?start=road`：直接在公路上开（默认 `garage`，车库开局）。
- `?build=stock:pickup`：开哪台车，可选 `stock:sedan`、`stock:pickup`、`stock:moto`、`stock:rv`，后面可以接零件，例如 `stock:sedan;engine=eng_v8+turbo:turbo_small;seat_driver=seat_toilet;-hood`（网址里 `+` 要写成 `%2B`）。
- `?project=full`：车库里的车已经装好。
- `?view=orbit` 或 `?view=chase`：视角。
- 其余的 `seed / s / time / weather / quality` 等参数和下面的经典版共用。

相关文档：车辆系统 [`docs/MODCAR.md`](docs/MODCAR.md)，声音 [`docs/MODCAR_AUDIO.md`](docs/MODCAR_AUDIO.md)，车的画法 [`specs/art/CAR_LOOK.md`](specs/art/CAR_LOOK.md)。

### 经典版（classic.html）

ModCar 之前的版本还在：四台固定的车、房车起居、开营。打开 http://127.0.0.1:5173/classic.html，按键如下。

| 操作 | 按键 |
| --- | --- |
| 油门 / 刹车（停稳后倒车） | W / S 或 ↑ / ↓ |
| 转向 | A / D 或 ← / → |
| 手刹 | 空格 |
| 环顾 | 点击画面后移动鼠标 |
| 视角（驾驶座 / 追尾） | C |
| 车灯（默认随天色自动） | L |
| 翻车后扶正 | R |
| 自动驾驶 | P |
| 起身 / 坐下（房车里起身后 W A S D 走动、鼠标转身；0.9 m 内有座位就坐下） | E |
| 直接换到第 n 个座位（1 = 驾驶座） | 1–9 |
| 开营 / 收营（停稳后：门和遮阳棚打开） | O |
| 数据显示 | F3 |

驾驶座上没人、也没开自动驾驶时，车不给油并轻踩刹车。

**下车步行**（docs/DESIGN_V2.md 第 6 章）：停稳后在小货车里按 E 从最近的车门下车（房车先按 E 起身，走到门口再按 E）。同一组键在步行时意思不同：

| 步行时 | 按键 |
| --- | --- |
| 走 / 转身 | W A S D、鼠标 |
| 跑 | 按住 Shift |
| 蹲下 / 站起（车里是“视角”） | C |
| 跳（车里是“手刹”） | 空格 |
| 用：准星下的一个词就是 E 会做的事——拿、抬、打开（按住 1.5 秒）、全拿（按住）、放进、抽油（按住）、加油（按住）、上车 | E（按一下或按住，进度圈满了才算，松手就取消） |
| 放下手上的东西 | 按住 G |
| 背包 | Tab |
| 1–9、P 在步行时不起作用（不会把人“传送”回座位、不会让车自己开走） | |

小件进背包（12 格，同类叠 10 个），中件拿在手上（右下角），大件双手抬着（1.2 m/s，挡住一部分视线）。

手柄：左摇杆转向，RT 油门，LT 刹车，A 手刹，右摇杆环顾。声音在第一次点击或按键后开始。

### 网址参数

`?seed=7` 世界种子 · `?s=3000` 起始里程（米）· `?time=18.6` 钟点 · `?weather=storm`（clear / cloudy / overcast / fog / rain / storm / hail / snow / blizzard / sandstorm）· `?biome=desert` 起始群系 · `?chapter=0.2` 群系长度倍率 · `?quality=low|med|high` · `?view=chase` · `?auto=1` 自动驾驶 · `?scene=proving` 测试场。

车辆：`?vehicle=rv`（`truck` / `van` / `offroad` / `rv`，或 `t0_truck` … `t3_rv`）· `?seat=dinette1` 坐到某个座位或机位（房车：`passenger`、`dinette1…4`、`sofa`、`bunkLow`、`bunkHigh`、`deck1`、`deck2`；拍照机位 `roomFront`、`roomRear`、`galley`、`overDash`；面包车：`passenger`、`rearLeft`、`rearRight`、`tailgate`，机位 `room`、`roomRear`、`galley`；越野车：`passenger`、`rearLeft`、`rearRight`、`tent`，机位 `room`、`tailgate`）· `?view=orbit&orbit=35,12,12,1.3` 绕车外观机位（方位角°、俯角°、距离 m、注视高度 m；0° 在车头正前，90° 在右侧）· `?cutaway=1` 剖面（去掉右侧外壁、右侧玻璃、车顶）· `?camp=1` 开营（房车：门、遮阳棚；面包车：尾门、侧滑门；越野车：尾门、抽屉厨房、车顶帐）· `?slots=all|none|default`（或逗号分隔的槽位 id）· `?cabinlight=1|0` 车内灯（不设 = 天黑自动开）。

步行调试：`?fixture=1` 在车前的路面上摆一个测试院子（墙、台阶、平台、木箱、工具箱、油罐、各种大小的东西）· `?onfoot=door` 一开始就下车 · `?onfoot=yard:u,v,度` 站在院子里（u 沿路、v 向右）· `?onfoot=road:s,d,度` 站在里程 s、路中线右侧 d 米处 · `?onfoot=world:x,z,度` · `?footpitch=-10` 抬头 / 低头（度）。

天气调试：`?weather=storm&wstage=0.4` 指定强制天气处在三幕的哪一步（0–1 酝酿、1–2 高潮、2–3 余韵）。哪里有湖、河、桥：`npx tsx harness/sim/water.ts list <种子> [群系长度倍率] [起始群系]`。

## 开发循环

```bash
npm run check                      # 类型检查
npm test                           # Node 仿真门禁（车辆、道路、天气、声音、过渡）
npm run measure                    # 写 loop/metrics/*.json
node harness/shots/run.mjs         # 无头 Chrome 截图矩阵 → loop/shots/（组：driving、world、sky、style、water、land、weather、vehicles、onfoot）
python3 harness/judge/image_metrics.py sky
npm run judge                      # 对照 specs/ 打印结果、更新 loop/scoreboard.json
npm run build                      # 生产构建 → dist/
```

目录：`src/core` 纯 TypeScript 模拟核心（不依赖 three 和 DOM）· `src/game` 浏览器运行时 · `harness` 测试与测量 · `specs` 规格卡 · `loop` 循环协议、待办、记分板、报告。
