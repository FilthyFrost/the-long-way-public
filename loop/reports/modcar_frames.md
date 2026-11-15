# ModCar 车架美术（frames）进度

负责：四个车架的 Blender 脚本（轿车 → 皮卡 → 摩托 → 房车）。工作树 `D:/公路旅游-wt/frames`，分支 `modcar/frames`。

## 已完成
- 建模工具 `tools/blender/frames/_kit.py`：精确 SDF 曲面（倒圆交集 = 所有过渡 G1、法线精确）+ 近似参数化（loft）+ 约束 Delaunay 剖分修剪区域 + 卷边/翻边/包边 + 扫掠、车削、倒角盒。`_preview.py`：EEVEE 动漫地平线天空 / 斑马纹 / Workbench 预览。
- 轿车「方糖」第一版（`frames/sedan.py` + `_sedan_ext.py` 外壳、`_sedan_inner.py` 内部、`_sedan_build.py` 组装导出）：
  - 外壳：方正三厢、圆角平面转角、肩线硬折、圆轮拱卷边、4–5 mm 门缝/盖缝（双侧卷边 + 翻边）、后门绕轮拱缺口、前门三角窗、后门固定小窗、B 柱、雨槽镀铬、腰线镀铬、风挡/后窗胶条 + 镀铬饰条、门把手、钥匙孔、圆灯坑（灯碗 + 调光螺钉座）、横条格栅 + 中间镀铬条 + 小徽章（无品牌）、尾灯凹槽、牌照凹槽 + 牌照灯、右后油箱盖（FUEL_CAP，带加油口）、引擎盖/尾箱盖内骨架。
  - 发动机舱、尾箱、门框结构；UNDER：底板/中通道、纵梁、前横梁、前双叉臂 + 螺旋弹簧 + 减震、后桥 + 差速器 + 拖曳臂、四轮刹车盘 + 卡钳 + 轮毂法兰（螺栓）、传动轴、轮拱内衬、加油管。
  - INTERIOR：仪表台（软顶 + 仪表罩眉 + 喷漆面板 + 木纹条）、两大两小仪表（镀铬圈、刻度、指针 N_speed/N_rpm/N_fuel/N_temp）、出风口、收音机槽、暖风推杆、手套箱、转向柱罩、三踏板、地毯 + 中通道、门内饰板（扶手、摇窗把手、镀铬线）、顶棚、座椅滑轨、后视镜、遮阳板。
  - 36 个挂点（含属性），面板 P_door_FL/FR/RL/RR、P_hood、P_trunk（原点在铰链），PG_door_*（门玻璃，门的子物体），WIPER_L/R，FUEL_CAP。
  - 导出：`public/models/modcar/frames/sedan.glb`、`src/core/modcar/data/mounts/sedan.json`（含 panels / needles / wipers / eye_default / bbox / triangles）。三角形 79 894（≤ 80k）。AO 已烘进 `Col`。

## 下一步
- 轿车打磨：发动机舱侧壁让开轮拱（现在 y=0.60 与车轮空间相交）、A/B/C 柱内饰、驾驶视角细节、尾灯凹槽底板、保险杠支架造型。
- 皮卡「骡子」→ 房车「鲸鱼」→ 摩托「燕子」（摩托可交给第二个代理）。

## 问题 / 需要主程知道
- `tools/blender/lib/__pycache__`、`tools/blender/test/__pycache__` 被提交进了仓库，每次跑 Blender 都会改；建议从仓库删掉并忽略。我这边标了 assume-unchanged，没有动它们。
- GLB 约 3.9 MB（无压缩）。如需更小可在导出时开 meshopt/Draco（游戏要配解码器）。
