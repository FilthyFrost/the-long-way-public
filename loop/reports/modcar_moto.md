# ModCar 摩托车架「燕子」（moto）进度

分支 `modcar/moto`，脚本 `tools/blender/frames/moto.py`（尺寸表与转向/悬挂几何）+ `_moto_kit.py`（弯管、焊缝、带孔圆角板、螺栓、弹簧）+ `_moto_frame.py`（车身 BODY）+ `_moto_fork.py`（前叉 FORK / FORK_LOWER、仪表）+ `_moto_rear.py`（平叉、后减震、侧撑）+ `_moto_build.py`（组装、挂点、JSON、AO、导出、预览）。

重建：`blender -b --factory-startup --python tools/blender/build.py -- frames/moto [--quick] [--no-preview] [--parts] [--fit]`

## 已完成
- 第一版可加载：`public/models/modcar/frames/moto.glb` + `src/core/modcar/data/mounts/moto.json`（实测挂点，替换占位表；`rig` 块给出前叉转轴、FORK_LOWER 滑动轴、平叉转轴与长度、减震上下眼、侧撑折叠轴与角度）。
- 结构：双摇篮钢管车架（头管、主梁、两根“下管→摇篮→后立管→座管→尾环”的整根弯管）、横管、后撑、焊缝、头管加强板、发动机吊板与缸头拉杆、油箱前后支座、点火线圈、线束、电瓶托与橡胶带、平叉轴座、脚踏挂板与脚踏、后刹踏板、换挡踏板轴座（gl_foot 挂点）、侧撑耳、后挡泥板、侧盖（带虚构燕子徽）、牌照架、扶手、后座脚踏、后转向灯。
- 前叉：上下三星板、转向柱与轴承、灯耳护管（paint_b）、镀铬内管、前转向灯；FORK_LOWER：铝外管与轴夹、前挡泥板与支架、刹车盘与卡钳、油管、码表软轴。仪表：速度表 + 转速表（gauge 表盘带 UV，指针 N_speed / N_rpm）、指示灯座。
- 后部：平叉（椭圆管、轴板与调链器、链轮、链条、链罩、鼓刹底板与凸轮臂、扭力臂、刹车拉杆）；减震分 SHOCK_UPPER_*（车架）与 SHOCK_LOWER_*（平叉的子物体）。
- 原装件试装（`--fit`）：油箱坐在主梁上、坐垫在座管上、发动机在摇篮里、车把在上三星板上、大灯挂在灯耳上。
- `npm run check`、`npm test` 通过。

## 下一步
- 三角形 48k → ≤ 40k（预算）；继续打磨（倒角、焊缝、线缆走向、侧盖造型、细节）。
- 游戏内截图核对（modcar_road、frames_drive），骑手视角。

## 问题 / 给主程
- 加载时 `assets.ts` 的 `mergeRigid` 会把 FORK / SWINGARM / STAND / SHOCK_* 合进静态网格：需把这些名字加进 RIGID（和 carView 的 MOVES）。
- 喇叭挂在前叉右侧下三星板下（前挡泥板与下三星板之间放不下）。
