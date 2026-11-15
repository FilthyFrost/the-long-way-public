# ModCar 零件美术（parts 子代理）进度

分支 `modcar/parts`，工作区 `D:/公路旅游-wt/parts`。脚本 `tools/blender/parts/*.py`，产物 `public/models/modcar/parts/<id>.glb`，
几何数据 `src/core/modcar/data/parts_geo.json`（游戏坐标系，脚本生成，勿手改）。
全部重建：`blender -b --factory-startup --python tools/blender/build.py -- parts/all --norender`（约 35 秒；去掉 `--norender` 会出预览图，要几分钟）。
单件：`... -- parts/<组> <id>`（组：engines drivetrain fluids wheels cockpit seats body lamps tools；`--toon` 出赛璐璐+描线预览，`--stats` 列各块三角数）。

## 已完成

- **原厂零件装进车架空间**（按 mounts/*.json 的 space_min/max，轿车和皮卡都量过）：
  散热器含加水口和盖 rad_std 0.40 高、rad_small 0.34 高、都在 z±0.34 内（rad_big 0.50 高，宽度允许超）；
  gb_3/gb_4/gb_5 都在 x[-0.30,0.20]、高 0.22、z±0.13 内（轴心降到 0.108，换挡座变矮，离合拉索/里程表线/倒车开关线改走内侧）；
  tank_std 改成挂在地板下的扁油箱 0.45×0.70×0.13（45 L），加油管从右侧（游戏 +z）伸出，两条箍带吊到地板；
  bat_truck 缩到 ±0.139 长，改成螺柱接线柱；顺手把 eng_i4 空滤盖压到 0.658（轿车舱 0.66）、去掉 eng_single 低于原点的放油螺塞。
  tank_big、tank_drum、rad_big 照约定允许超出。
- bf_stock / br_stock：保险杠背面离车身 4.5 cm（原来 14.5 cm），四个支架缩成藏在杠后面的短桩；两端改成四分之一圆弧，端头朝后、不插进车身。
  深度 0.282 → 0.182，fit_nominal 不变 [0.25, 1.60, 0.22]（轿车里按 fit 再压到 0.52 倍，杠离车身约 2.3 cm）。
- **第二轮评审**：`hood_scoop_overlay`（引擎盖上的进气罩饰件，`paint` 壳、深色进气口朝 +x，底面平在 y=0，原点在底面中心，0.55×0.45×0.09，带 fit_nominal）；
  `exh_side` 改成热棒式侧排：从歧管在地板下往后，过了前轮甩到左侧门槛（−z 0.93 m），沿车门下面往后，镀铬消音筒带开槽隔热罩，前于后轮出喇叭口尾嘴，全部在 y 0.071 以下；
  另出 `exh_side@moto`（摩托用：从缸头前面下到曲轴箱前，再贴着车左侧在脚踏下面往后）——游戏在摩托车架上要选这个变体；
  bat_std/bat_truck 加红黑电瓶线和夹子（红线用 `paint`，跟电瓶盖同色，因为没有固定的红色材质），三个散热器上下水口加胶管和卡箍；包围盒都没变。
- **工具模型** `public/models/modcar/tools/<kind>.glb`（脚本 `tools/blender/parts/tools.py`，`parts/all` 一起出）：jerrycan（X 加强筋、焊缝、三个提手、凸轮盖油嘴）、
  bottle（5 L 玻璃水壶、握持环、带纹盖、夹在瓶颈上的提手）、oilcan（4 L 机油壶、一体提手、带纹盖和出油嘴）、spray（喷漆罐、马口铁封边、阀杯和喷头）、
  sponge（狗骨头形海绵，顶面切出气孔）。原点底部中心，朝向和 loose.ts toolModel 一致，材质只用 toolModel 用的名字，≤ 2k 三角。
- **目录里 86 个非板件零件全部有 GLB**（A、B 两批，加上主程追加的 exh_moto / tank_big / rim_truck19 / tire_truck / gl_foot）；
  另有轮胎 8 种 × 6 个带胎轮毂 = 48 个变体 `<胎>@<毂>.glb`，以及 3 个门样式饰件。共 137 个文件，约 18 MB。
- 校验 `-- parts/verify`：PART 根、材质名、AO、子挂点、EYE、fit_nominal、闭合块有没有里外翻、预算、目录覆盖、轮毂+轮胎每轮三角数，
  以及工具（按 tools.ts 的 ToolKind 查文件、≤ 2k、底面在原点）。当前 0 错误、0 警告；`npx vitest run` 39 个文件全过。
- **gl_foot（摩托脚踩换挡杆，左侧）**：花键轴毂 + 夹紧螺栓、外撇的锻造杆、橡胶脚尖套。1452 三角。
  `gb_moto` 去掉了自带的换挡杆（原来的脚尖套正好在 gl_foot 挂点上，会出现两根杆），只留带油封的花键选挡轴。
- **构建可复现**：AO 改用自己的 BVH 光线投射（固定的余弦分布半球方向，每顶点一个灰度，64 级），不再用 lib 的 Cycles `bake_ao`；
  合并后的网格按位置规范化顶点/面顺序。两次全量重建逐字节相同，GLB 小了约 25%（以前每次重建约 60 个文件"变了"）。
- 散热器鳍片加粗、减少（3–6 m 不再闪烁/摩尔纹）；gb_3 改成铸铁壳（`steel`），和 gb_4/gb_5 一眼能分开。
- 轮胎精简：大胎花纹节距减少（块更大，3–6 m 更好认），卡车轮辐板工位 30→24。所有原厂车轮 ≤ 6k（轿车 5.6k、皮卡 5.9k、摩托 5.6k、房车前轮 5.99k、双轮每轮 5.8k）。
- 精修（已合并过的）：轮胎侧壁字样、铸造飞轮壳、方向盘喇叭圈、gb_moto 细节、摩托发动机、长杆/管子的 AO 采样、更凶的撞角和车顶尖刺。

## 约定（游戏需要知道）

- 根对象 `PART`；子挂点 `M_tire`（`rim_dually` 还有 `M_tire2`）、`M_turbo`、`M_exhaust_out`（V8 还有 `M_exhaust_out2`）；座椅 `EYE`。
- 会动的子网格（原点在转轴上）：`LID`（马桶盖，模型为打开状态，绕局部 Y 转 +94° 合上）、`KNOB_L/KNOB_R`（收音机旋钮，绕 X）、
  `TAPE_DOOR`（卡带门，底边铰链）、`LEVER`（hb_stock 绕局部 Y 拉起 = +25°；hb_drift 向驾驶员拉 = −25°；地板挡杆的原点是地板下的球铰）、
  `KEY`（钥匙，绕 X）、`COVER`（一键启动的翻盖，上边铰链）/ `BUTTON`（沿 +X 按下）、`FLAP_L/FLAP_R`（侧排管防雨盖，绕局部 Y 打开）。
- **gl_foot**：原点在变速轴轴线上；`LEVER` 原点也在那，绕游戏 z 转（和 cockpit.ts 里其它挡杆一样），正角度把脚尖套抬起（升挡方向）；
  脚尖套在前上方约 0.18 m，向左（游戏 −z）伸出；轴头和油封向内 2.5 cm（+z），挂点放在曲轴箱盖/脚踏所在平面即可。
- 车把 `steer_bar` 绕局部 Z（转向头轴）转，原点在转向头顶部；方向盘绕 X（PART 属性 `steer_axis`）。
- 拉伸件 `fit_nominal` = [长, 宽, 高]；原点在贴车身的那个面的中心（前杠向 +X 伸出，后杠向 −X；车顶件站在 z=0；装甲内表面在 y=0，向 +Y 伸出）。
- 排气：原点在进气法兰（前端），向后（−X）延伸。涡轮：原点在涡轮进气法兰，涡轮在 +Z 一侧。变速箱：原点在底部中心，输入端 +X。
- 门样式饰件（板件样式用，不在目录里）：`door_armor_overlay`（fit [1.0, 0.03, 0.5]）、`door_cage_overlay`（fit [0.8, 0.03, 0.42]）、
  `door_fridge_handle`（不拉伸）；都按左侧建，原点在贴门皮的内表面中心，向 +Y 凸出。

## 下一步

- 按主程/车库的反馈继续精修；新零件照现有组的写法加进对应脚本，再跑 `parts/all` + `parts/verify`。

## 问题 / 给主程

- lib 的 `bake_ao`（Cycles）结果跟进程里之前烘过什么有关，不可复现；我在 `parts/_kit.py` 里用 `bake_ao_bvh` + `_canonical` 代替了。
  别的模型脚本想要可复现的话可以搬进 lib（我没改 lib）。
- 座椅眼位按真实坐姿建模（`seat_bucket` 0.90 m 高、后 0.16 m；马桶 1.12 m；沙发 1.06 m），从 `EYE` / parts_geo.json 取值。
- 白边胎白圈用 `ceramic`（MAT_NAMES 里没有白橡胶），建议加 `rubber_white`。购物车轮胶圈用 `rubber`（黑）。
- 预算：原厂车轮全部 ≤ 6k；玩家乱配的组合（白边/雪地/拖拉机胎配 off16、moto18、truck19、双轮毂）最多每轮 6.56k，`parts/verify` 会列出来。
  方向盘 2.1–2.6k、乐曲喇叭 2.5k 超过小件 2k：方向盘是第一人称离得最近的东西，故意留的。
- GLB 未压缩（18 MB），建议导出时开 meshopt/Draco（lib 的 export_glb 归主程）。
- tank_std 的加油管朝右（轿车加油口在右）；皮卡加油口在左（−z），想对上的话皮卡的 fuelTank 挂点可以转 180°（油箱前后对称）。
- 轿车里变速箱前端（x 0.785）离发动机飞轮壳后端（约 1.0）有约 20 cm 空档，是挂点位置决定的，可以挪挂点或挪空间。
- 只是告知：摩托挂点空间里 eng_single 右侧的踢启动脚踏超出 7 cm（z+0.19 对 0.12）；改装用的 V8、水平六缸、房车 D6 放进轿车/皮卡都会超出，
  割草机发动机的竖直曲轴本来就伸到原点下方 6.5 cm。
