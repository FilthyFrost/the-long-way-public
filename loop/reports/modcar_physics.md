# ModCar 物理线（physics 子代理）进度

分支 `modcar/physics`，工作树 `D:/公路旅游-wt/physics`。字段与确切含义见 `docs/MODCAR.md` §4「物理实现说明」。

## 已完成
- 旧四辆车逐位不变：`harness/sim/modcar_legacy.test.ts`（8 个场景 × 4 辆车的全状态哈希，录自未改的物理，node v24.16.0）；`npm run measure driving` 与改前完全一致，economy（T0）28 项一致，judge 676/693（其余 17 项本来就没测），无新失败。
- 轮子：`AxleSpec.wheelRadius`、`SimMods.radiusOffset`（角升降、滚动半径/传动、左右差往小轮跑偏）、`SimMods.wheelFit`（轮胎 / 光钢圈 / 空轮毂刮地）、`spec.emptyHubRadius`。`radiusDrop` 仍只表示爆胎（只能 ≥ 0）。
- 单辙车 `spec.balance`：双射线站姿、骑手扶正、压弯承担侧倾力矩；`sim.lean`（受抓地限制）、`leanPivotY`、`wheelie`；翘头自然出现；猛磕会倒，倒了就躺着直到 `reset()`。
- 缺件 `spec.absent`：发动机 / 变速箱 / 转向 / 手刹（`NO_ENGINE` 占位）。
- 换件：`applySpec` 与换轮原地重新落座，不弹车（停车 0.29 → 0.62 m 竖直速度 0）；挡位数变少自动钳挡。
- 载重：`src/core/vehicle/rescale.ts`；`AxleSpec.rideComp`（加重下沉）、`AxleSpec.tyreLoad`（加重推头、超载更早滑，幂律）。
- 极端组合护栏（只对衍生 spec）：车身盒近地参与接触、底面/顶面加点、随深度变硬、阻尼按有效质量、同时着地的点一起解、包住重心；惯量下限；外倾过大掉抓地；NaN 偏移保护；`reset(…, ground)`。
- 测量 `harness/sim/modcar/feel.ts`（每车 0.1–0.3 s，含不足转向梯度）；测试 `modcar_{legacy,moto,wheels,parts,feel,fuzz,fuzz2,fuzz_harsh}.test.ts`，全套 `npm test` 约 30 s。
- 额外压测（不进默认测试）：5000 台 × 60 s、3000 台 × 45 s、6 × 500 台陡坡 + 撞墙、1000 次行驶中换件、300 次跨车架/旧车换 spec：零失败。

## 主程接入要点
- derive 用“平均轮径”写法时给 `emptyHubRadius`（如 0.45 × 车架轮径）。
- 摩托 V8 抬头余量很薄：后胎有效 μ 要 ≳ b/h（现数值约 0.90 对 1.0）；建议摩托胎抓地上调或单辙车不吃窄胎折扣。
- 可用 `feel.scrape`（火花）、`feel.rim`（钢圈声）、`sim.wheelie`；ModCar 出生用 `reset(x, y, z, yaw, ground)`。
- “没手刹会溜”要在下车/熄火时关掉 `autoHold`。

## 已知不足
- 驱动轮各自封顶（旧模型，像锁止差速）：后驱空一个前轮给油时可能偏向另一侧（滑行时偏向空轮毂）。
- 急刹翻车把（endo）不拦；摩托物理车身不倾斜（脚踏/整流罩擦地不模拟）；外倾推力不模拟。
- 撞墙沿用旧算法：极端车 100 km/h 以上正撞会与墙重叠约一步行程（最深约 0.35 m），但不会穿过去。
