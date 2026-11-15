# ModCar 渲染子代理（shader）进度

分支 `modcar/shader`，工作树 `D:/公路旅游-wt/shader`。规范：`docs/MODCAR.md` §6，`specs/art/STYLE.md`；画法标准：`specs/art/CAR_LOOK.md`。
本分支已多次合入 `feat/modcar`（最近 e3e922c），主程合回来应无冲突。

## 已完成

- **模型预览页** `viewer.html` + `src/game/modcar/viewer.ts`（游戏自己的 RenderCore + Environment）。
  - 参数：`glb`、`time`、`weather`、`orbit`、`target`、`sun`、`paint`/`paint2`、`dirt`/`rust`/`wear`、`lights=1|2`、`brake`、`turn=L|R`、`reverse`、`cabin`、`ghost=…`、`ghostpart/ghostat/ghostkind/ghostfocus`、`stage=studio|proving|world`、`merge=1|2`、`repaint=id,色`、`highlight=id|名字`、`debug=ao|mat|normal|env`、`spin`、`fov`、`shot`。
  - `window.__rt`：`ready`、`render()`、`simulate(s)`、`setOrbit()`、`setTarget()`、`setHour()`、`setWeather()`、`setPaint()`、`setLights()`、`telemetry()`（`modelCalls` = 模型主通道绘制次数）。
- 截图组 `modcar_viewer`（80 张，含真轿车车架、逆光、雨、雪）、`modcar_parts`（16 个真零件）；`run.mjs` 支持组里写 `"page"`；`vite build` 多页。
- **材质** `src/game/render/carMaterials.ts`：按名字换成 7 族着色器，一辆车一套共享材质（`CarLook`）。
  - 车漆：亮/暗两色赛璐璐 + 画出来的反射五区（硬边、随视角滑动、朝太阳更亮、染车漆色调；迎着低太阳是金色）+ 侧面“画内倾”+ 远处一排树冠（只在大平面上）+ 太阳斑 + 折线高光 + 菲涅尔边缘 + 侧边暖光边。
  - 铬 / 钢 / 铝；平的镜面（后视镜）不画黑带、加两道淡斜条纹；橡胶胎侧天光；内饰车厢光；玻璃从里面看是透明的；灯的角色按车上位置；仪表按 UV 画。
  - `measureCarShape(root)`，`setBodyHeight(h|null)`、`setCabin(box|null|undefined)`。
  - 脏、锈、褪色：uniform + 顶点 `aWear`。
  - **天气**（世界的 `uWeather`）：湿 → 车漆更深、反射更强、胶条变暗带湿光；近处水珠（深色珠 + 白点 + 下沿亮），玻璃外浅色水珠；雪积在车顶和车顶货物上。房间里（车库）自动不淋雨；别处 `setShelter(0..1)`。
  - 幽灵三种（一层皮 + 被挡部分透视）。**高亮**：正面只加 0.05、不压暗；掠射角亮边 + 硬折角亮线 + 外轮廓青白亮线（`frame.ts` 的 `inkAt`：被看着的零件把 id 写到所有 id 下面的 0.006…0.032）。
- **合批** `src/game/render/carMerge.ts`：`MergedCar`（隐藏原件、`updatePart` 只重写那一段顶点、`partAt` / `pick` / `boxOf`、`dispose`）和 `mergeCarParts()`。测试车 37 → 32 次绘制。
- **测试车** `tools/blender/test/testcar.py`（+ `carkit.py`）→ `public/models/modcar/test/testcar.glb`（+ `testwheel.glb`）。
- 测试 `harness/sim/carmerge.test.ts`（12 项）。老车世界 / 天气截图与 `frame.ts` 改动前逐像素一致。

## 美术评审（3.15/5）后的修改

1. **玻璃**：先是映着天的镜子（菲涅尔 0.24→1），正对着约 0.55 透过；从外面看车厢的描线约 40%（车厢 id 挤进自己的一段 0.206…0.228，车的 id 收到 0.04…0.19）；雨天从车里也看得见外表面的水珠。
2. **黄昏亮带**：至少保留 70% 车漆色调，只在太阳方位 ±30° 内放开。
3. **描线碎裂**：`frame.ts` 一像素细的东西（门缝、草叶、裂缝、MSAA 发丝）不描线，线的浓淡按两边 id 差；帧最后加 SMAA（中/高画质，1600×900 约 0.05 ms）；铬上极细的圆条把反射带平均掉。格栅闪烁主要是几何摩尔纹，需要远处的低模格栅。
4. **车厢阴影台阶**：车厢里阴影查找按光掠过的角度往外推（坡度偏移）。
5. **幽灵透视**：被挡部分 1/4 亮度、MAX 混合不叠加，远处车轮不再浮在引擎盖上。
6. **湿路夜里**：车头灯在湿沥青里两道长长的倒影（路面着色器里一小段，光斑不变）。

## 下一步（可选）

- 车轮高速转动时的动态模糊（现在辐条会频闪）。
- 边角掉漆（需要烘焙凸边曲率）。

## 问题

- 车前细草叶的“+”号墨点：一像素细不描线之后大多没了（深度规则试过，会丢老车灯罩轮廓，已撤回）。
- 测试车 GLB 4.3 MB；真车由车架/零件代理导出。
