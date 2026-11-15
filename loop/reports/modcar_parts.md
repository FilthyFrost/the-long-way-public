# ModCar 零件美术（parts 子代理）进度

分支 `modcar/parts`，工作区 `D:/公路旅游-wt/parts`。脚本 `tools/blender/parts/*.py`，产物 `public/models/modcar/parts/<id>.glb`，
几何数据 `src/core/modcar/data/parts_geo.json`（游戏坐标系，脚本生成，勿手改）。
全部重建：`blender -b --factory-startup --python tools/blender/build.py -- parts/all`（约 3 分钟；`--norender` 不出预览）。

## 已完成

- 校验：`blender -b --factory-startup --python tools/blender/build.py -- parts/verify`（PART 根、材质名、AO、子挂点、EYE、fit_nominal、预算、目录覆盖）。
- 工具：`_kit.py`（bmesh 基本体、车削/闭合截面车削、扫掠、放样、极坐标盘（轮毂开窗、辐条）、褶皱软包、软垫；
  倒角→锐边→合并→加权法线→AO 烘焙→导出；parts_geo.json 加锁合并；EEVEE 预览），`sheet.py`（预览拼图，系统 Python + Pillow），`all.py`。
- **A 批全部完成（38 件）**：发动机 eng_i4 / eng_i4d / eng_v8 / eng_mower，turbo_small，gb_4，rad_std，bat_std，tank_std / tank_drum，
  exh_stock / exh_side，rim_steel13 / rim_alloy15 / rim_off16 / rim_cart，tire_road / tire_offroad / tire_tractor / tire_slick（另 4 种胎也已生成），
  steer_std / steer_ship，seat_bucket / seat_bench / seat_toilet / seat_armchair，bf_stock / bf_bullbar / bf_ram / br_stock，
  hl_round / hl_square / tl_stock，mir_stock，roof_rack / roof_spikes，arm_plates，horn_beep，radio_old，hb_stock，gl_stock，ign_key。
- 轮胎 8 种 × 6 个带胎轮毂 = 48 个变体 `<胎>@<毂>.glb`。

## 约定（游戏需要知道）

- 根对象 `PART`；子挂点 `M_tire`（`rim_dually` 还有 `M_tire2`）、`M_turbo`、`M_exhaust_out`（V8 还有 `M_exhaust_out2`）；座椅 `EYE`。
- 会动的子网格（原点在转轴上）：`LID`（马桶盖，模型为打开状态，绕局部 Y 转 +94° 合上）、`KNOB_L/KNOB_R`（收音机旋钮，绕 X）、
  `TAPE_DOOR`（卡带门，底边铰链）、`LEVER`（hb_stock 绕局部 Y 拉起 = +25°；hb_drift 向驾驶员拉 = −25°；挡杆的原点是地板下的球铰）、
  `KEY`（钥匙，绕 X）、`COVER`（一键启动的翻盖，上边铰链）/ `BUTTON`（沿 +X 按下）、`FLAP_L/FLAP_R`（侧排管防雨盖，绕局部 Y 打开）。
- 车把 `steer_bar` 绕局部 Z（转向头轴）转，原点在转向头顶部；方向盘绕 X（PART 属性 `steer_axis`）。
- 拉伸件 `fit_nominal` = [长, 宽, 高]；原点在贴车身的那个面的中心（前杠向 +X 伸出，后杠向 −X；车顶件站在 z=0；装甲内表面在 y=0，向 +Y 伸出）。
- 排气：原点在进气法兰（前端），向后（−X）延伸。涡轮：原点在涡轮进气法兰，涡轮在 +Z 一侧。
- 变速箱：原点在底部中心（尾部橡胶支座在 z=0），输入端 +X。

## 下一步

- **B 批全部完成**（含主程追加的 exh_moto、tank_big、rim_truck19、tire_truck）：目录里 85 个非板件零件全部有 GLB；
  `parts/verify` 复查 133 个文件（85 件 + 48 个轮胎变体）0 错误。
- 精修：轮胎侧壁通用字样（光头胎为奶白字）、发动机尾部改成铸造飞轮壳、方向盘加镀铬喇叭圈、gb_moto 细节、
  修了 6 处里外翻的面；构建时自动检查闭合块的有向体积（WARN inside-out），`--toon` 出赛璐璐+描线预览。
- 门的样式饰件（不在目录里，给板件样式用）：`door_armor_overlay`（fit [1.0, 0.03, 0.5]）、`door_cage_overlay`
  （fit [0.8, 0.03, 0.42]，罩窗洞）、`door_fridge_handle`（冰箱把手 + 铭牌，不拉伸）；都按左侧建，原点在贴门皮的内表面中心，向 +Y 凸出。

## 问题 / 给主程

- 座椅眼位按真实坐姿建模（`seat_bucket` 0.90 m 高、后 0.16 m；马桶 1.12 m；沙发 1.06 m），从 `EYE` / parts_geo.json 取值。
- 白边胎白圈用 `ceramic`（MAT_NAMES 里没有白橡胶），建议加 `rubber_white`。购物车轮胶圈用 `rubber`（黑）。
- 预算：车轮（毂+胎）≤ 6k；`rim_off16`+越野胎 6.1k、拖拉机胎 3.6k（配 13 寸毂约 6k）。船舵 2.5k、马桶 2.8k（小件略超 2k）。
- GLB 未压缩，建议导出时开 meshopt/Draco（lib 的 export_glb 归主程）。
