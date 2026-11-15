# ModCar 物理线（physics 子代理）进度

分支 `modcar/physics`，工作树 `D:/公路旅游-wt/physics`。字段与含义见 `docs/MODCAR.md` §4「物理实现说明」。

## 已完成
- 旧四辆车逐位不变：`harness/sim/modcar_legacy.test.ts`（8 个场景 × 4 辆车的全状态哈希，录自未改的物理）；`npm run measure driving` 的结果与改前完全一致，judge 无新失败。
- 轮子：`AxleSpec.wheelRadius`（每轴轮径）、`SimMods.radiusOffset`（每轮尺寸：角升降、滚动半径、传动、左右差往小轮跑偏）、`SimMods.wheelFit`（轮胎 / 光钢圈 / 空轮毂）。
- 单辙车 `spec.balance`：双射线站姿 + 骑手扶正 + 弯中侧倾力矩由压弯承担；`sim.lean`、`leanPivotY`、`wheelie`；翘头自然出现，猛磕会倒。
- 缺件 `spec.absent`：发动机 / 变速箱 / 转向 / 手刹。
- 换件不弹车：`applySpec` 与换轮“重新落座”（停车 0.29 → 0.62 m 竖直速度 0）；挡位数变少自动钳挡。
- 载重：`src/core/vehicle/rescale.ts`（同一套弹簧减振防倾杆、胎侧串联），`AxleSpec.rideComp`（加重真的沉），`AxleSpec.tyreLoad`（加重推头、超载更早滑）。
- 极端组合：车身盒近地即参与接触、随深度变硬、深处按速度止住；车身盒包住重心；惯量下限；NaN 偏移保护。5000 台 × 60 s、1000 台行驶中换件：零失败，车身入地最深 0.15 m。
- 测量 `harness/sim/modcar/feel.ts`（每车 0.1–0.3 s）；测试 `modcar_{legacy,moto,wheels,parts,fuzz,feel}.test.ts`，全套 `npm test` 约 40 s。

## 下一步
- 主程接入：derive.ts 已在用 radiusOffset / wheelFit / balance / absent / rescaleSuspension（rideComp、tyreLoad 随 rescale 自动带上）；还可用 `feel.scrape`（火花）、`feel.rim`（钢圈磨地声）、`sim.wheelie`。

## 问题 / 注意
- 后驱车空一个前轮、给油时对角线承重让后轮驱动不对称，可能偏向另一侧（滑行时偏向空轮毂）。旧模型“每个驱动轮各自封顶”，没改。
- `autoHold`（停稳自动刹住）不管手刹；“没手刹会溜”要在下车/熄火时关掉它。
- 摩托前刹极强 + 重心很高时急刹会翻过车把（主程的车架数值下不会发生），没有拦。
