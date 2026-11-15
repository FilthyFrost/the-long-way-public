# ModCar 物理线（physics 子代理）进度

分支 `modcar/physics`，工作树 `D:/公路旅游-wt/physics`。规范见 `docs/MODCAR.md` §4「物理实现说明」。

## 已完成
- 旧四辆车逐位不变的门禁：`harness/sim/modcar_legacy.test.ts`（8 个场景 × 4 辆车的全状态哈希，录自未改动的物理）。
- 每轴轮半径 `AxleSpec.wheelRadius`；每轮尺寸 `SimMods.radiusOffset`（角抬升/下沉、滚动半径、传动比、左右差往小轮跑偏）；`SimMods.wheelFit`（轮胎 / 光钢圈 / 空轮毂）。
- 单辙车 `spec.balance`：双射线站姿 + 骑手扶正 + 弯中侧倾力矩由“压弯”承担，`sim.lean` 给渲染；翘头自然出现。
- 缺件 `spec.absent`：发动机 / 变速箱 / 转向 / 手刹。
- 换件不弹车：`applySpec` 与换轮在原地重新落座（0.29 → 0.62 m 停车换装无冲击）。
- 悬挂重算 `src/core/vehicle/rescale.ts`（同一根弹簧、减振、防倾杆；高胎侧串联变软；超载下沉）。`AxleSpec.rideComp` 让加重真的“沉”。
- 极端组合：小轮车身落地时车身盒参与接触（不再穿地）；reset 可带地面。
- 手感测量 `harness/sim/modcar/feel.ts`；测试 `modcar_{legacy,moto,wheels,parts,fuzz,feel}.test.ts`。

## 下一步
- 主程接入 derive.ts（见报告“主程要做的”）；按需要调参（摩托车把、刹车分配）。

## 问题 / 注意
- 后驱车空一个前轮、给油时，对角线承重使后轮驱动不对称，可能反而偏向另一侧（滑行时偏向空轮毂一侧）。这是“每个驱动轮各自封顶”的旧模型带来的，未改。
