# ModCar 零件美术（parts 子代理）进度

分支 `modcar/parts`，工作区 `D:/公路旅游-wt/parts`。脚本 `tools/blender/parts/*.py`，产物 `public/models/modcar/parts/<id>.glb`，
几何数据 `src/core/modcar/data/parts_geo.json`（游戏坐标系，脚本生成，勿手改）。

## 已完成

- 工具：`tools/blender/parts/_kit.py`（零件工具包：bmesh 基本体、车削/扫掠/极坐标盘（轮毂开窗）/褶皱软包/软垫、
  倒角→锐边→合并→加权法线→AO 烘焙→导出流水线、parts_geo.json 加锁合并写入、EEVEE 预览）。
- 第一批可集成：`eng_i4`（12.4k 三角）、`rim_steel13`（2.5k）+ `tire_road`（3.6k，含 6 个轮毂尺寸变体
  `tire_road@<rim>.glb`）、`seat_bucket`（3.5k，EYE）、`steer_std`（2.3k）、`bat_std`（1.6k）。

## 约定（游戏需要知道）

- 根对象 `PART`（静态几何全部合并，按材质名分槽）；子挂点空物体 `M_tire`、`M_turbo`、`M_exhaust_out`；座椅 `EYE`。
- 轮毂/轮胎：原点在轮心，轴沿 Blender Y，外侧朝 +Y（左侧），`M_tire` 在轮心。轮胎变体文件 `<胎>@<毂>.glb`，
  内径 = 轮毂半径；`<胎>.glb` 等于 13 寸变体。
- `fit_nominal` = [长, 宽, 高]（米）。
- 涡轮：原点在涡轮进气法兰中心，涡轮在其 +Z 一侧；`M_turbo` 的局部 +Z = 法兰法线。`M_exhaust_out` 局部 +X = 排气流出方向。
- 方向盘绕 X 转（PART 上 `steer_axis = 'X'`）。

## 下一步

A 批其余：发动机 eng_i4d / eng_v8 / eng_mower、gb_4、rad_std、tank_std / tank_drum、exh_stock / exh_side、turbo_small、
rim_off16 / rim_alloy15 / rim_cart、其余轮胎、steer_ship、其余座椅、保险杠、灯、镜、车顶、装甲、小件。之后 B 批。

## 问题 / 给主程

- 座椅眼位按真实坐姿建模：`seat_bucket` 眼位 = 挂点上方 0.90 m、后方 0.16 m（parts.ts 里是 0.72 / 0.05），
  游戏若从 `EYE`（或 parts_geo.json 的 `eye`）取值则无需改。
- 白边胎的白圈暂用材质 `ceramic`（MAT_NAMES 里没有白橡胶），建议加 `rubber_white`。
- GLB 未压缩（带法线 + 顶点色），单件 50–600 KB；整套建议导出时开 meshopt/Draco（lib 的 export_glb 归主程）。
