# ModCar 摩托车架「燕子」（moto）进度

分支 `modcar/moto`。脚本：`tools/blender/frames/moto.py`（尺寸表、转向/悬挂几何、共用点位）、`_moto_kit.py`（弯管、平行移动框架管、焊缝、带孔圆角板、冲压面板、螺栓、弹簧、按尺寸定段数）、`_moto_frame.py`（BODY）、`_moto_fork.py`（FORK / FORK_LOWER / 仪表）、`_moto_rear.py`（平叉 / 减震 / 侧撑）、`_moto_build.py`（组装、挂点、UV、AO、JSON、导出、预览、试装、运动检查）。

重建：`blender -b --factory-startup --python tools/blender/build.py -- frames/moto [--quick] [--no-preview] [--parts]`
检查：`--fit`（原装件试装，Workbench）、`--review [--parts]`（特写）、`--motion`（满舵 32°、后悬挂压缩 9°、侧撑收起）。预览在 `D:/modcar-scratch/moto/`。

## 已完成
- GLB `public/models/modcar/frames/moto.glb`（39,961 三角形 ≤ 40k）+ 实测挂点 `src/core/modcar/data/mounts/moto.json`（含 `rig`：前叉转轴/FORK_LOWER 滑轴/平叉转轴与长度/减震上下眼/侧撑折叠轴与角度与脚位）。
- 物体：BODY；FORK（原点在转向轴上、上三星板顶面，无自身旋转）→ 子物体 FORK_LOWER（原点在前轴，随前悬挂沿叉管滑动）、N_speed、N_rpm；SWINGARM（原点在平叉轴）→ 子物体 SHOCK_LOWER_L/R；SHOCK_UPPER_L/R（车架上）；STAND（侧撑，按放下状态建模）。挂点 steering/headlight/mirror_L/R/ignition/horn 是 FORK 的子物体（JSON `"on": "FORK"`），hub_F/bumperFront 在 FORK_LOWER 上，hub_R 在 SWINGARM 上。
- 车架：双摇篮整根弯管（下管→摇篮→后立管→座管→尾环），头管（轴承杯、限位块、方向锁），主梁，横管，后撑与减震上座，焊缝，头管加强板，发动机前/后吊板与缸头拉杆，油箱前橡胶座轴与后托片，点火线圈与高压线座，线束，电瓶托与橡胶带，平叉轴座与轴螺栓，脚踏挂板 + 折叠脚踏，后刹踏板，换挡踏板轴座（gl_foot 挂点），侧撑耳，后挡泥板，侧盖（虚构燕子徽），牌照与支架，尾灯支架，镀铬扶手，后座脚踏，后转向灯。
- 前叉：上下三星板（夹紧螺栓）、转向柱、灯耳护管 + 前转向灯、镀铬内管；FORK_LOWER：铝外管 + 轴夹、前挡泥板 + 支架、刹车盘 + 卡钳 + 油管、码表齿轮箱 + 软轴。仪表：速度表 + 转速表（gauge 表盘有 UV，游戏里画出 240° 刻度与红区；指针 −240° 满量程），指示灯在表盘下部，点火开关在两表之间。
- 平叉：椭圆管、轴板 + 调链器、轴与隔套、后链轮、链条（接变速箱的链段）、链罩、鼓刹底板 + 凸轮臂 + 扭力臂 + 拉杆。
- AO：自己的 BVH 射线（不让玻璃/灯罩遮挡，埋在别的零件里的管端不把整根管染黑），写入 `Col`。
- 法线：全部外翻检查（背面剔除渲染），修正了挡泥板、链罩、表壳、减震的轮廓方向。
- 游戏内截图（modcar_road moto_side / moto_cockpit、frames_drive moto）正常；`npm run check`、`npm test` 通过。

## 下一步
- 打磨：后挡泥板前端收口、油箱座、链条滑块、散热器挂点位置；再看游戏内各视角。

## 问题 / 给主程
- `assets.ts` 的 `mergeRigid` 会把 FORK / FORK_LOWER / SWINGARM / STAND / SHOCK_* 合进静态网格：需加进 RIGID（和 carView 的 MOVES），再按 JSON `rig` 驱动。
- 转向挂点在叉管平面上（转向轴前 35 mm，原装车把的镀铬帽正好落在叉管上）：把车把挂到 FORK 下，不要再绕它自己的原点转。
- 喇叭在 FORK 右侧下三星板下方（中间的挡泥板与下三星板之间放不下）。
- 散热器挂点：这台车前面没有地方放 0.42 × 0.47 m 的散热器，装上必然和下管/排气打架（属于“胡来”组合）。
