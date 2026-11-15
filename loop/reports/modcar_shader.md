# ModCar 渲染子代理（shader）进度

分支 `modcar/shader`，工作树 `D:/公路旅游-wt/shader`。规范：`docs/MODCAR.md` §6，`specs/art/STYLE.md`；画法标准：`specs/art/CAR_LOOK.md`。
已把 `feat/modcar`（d38a702）合进本分支（冲突在 `carMaterials.ts`，主程的房间反射原样保留），主程再合回来应无冲突。

## 已完成

- **模型预览页** `viewer.html` + `src/game/modcar/viewer.ts`（游戏自己的 RenderCore + Environment：天空、云、光、雾、阴影贴图、颜料收尾、描线）。
  - 参数：`glb`、`time`、`weather`、`orbit`、`target`、`sun`、`paint`/`paint2`、`dirt`/`rust`/`wear`、`lights=1|2`、`brake`、`turn=L|R`、`reverse`、`cabin`、`ghost=…`、`ghostpart/ghostat/ghostkind/ghostfocus`（把幽灵件放到车上）、`stage=studio|proving|world`、`merge=1|2`、`repaint=id,色`、`highlight=id|名字`、`debug=ao|mat|normal|env`、`spin`、`fov`、`shot`。
  - `window.__rt`：`ready`、`render()`、`simulate(s)`、`setOrbit()`、`setTarget()`、`setHour()`、`setWeather()`、`setPaint()`、`setLights()`、`telemetry()`（`modelCalls` = 模型主通道绘制次数）。
- 截图组 `modcar_viewer`（76 张）、`modcar_parts`（零件代理的真零件）；`run.mjs` 支持组里写 `"page"`；`vite build` 多页。
- **材质** `src/game/render/carMaterials.ts`：按名字换成 7 族着色器，一辆车一套共享材质（`CarLook`）。
  - 车漆：亮/暗两色赛璐璐 + 画出来的反射五区（硬边、随视角滑动、朝太阳更亮、染车漆色调；迎着低太阳时亮带是金色）+ 侧面“画内倾”+ 太阳斑 + 折线高光 + 菲涅尔边缘 + 朝太阳的侧边暖光边。
  - 铬 / 钢 / 铝（暗带宽度按族：铬上只是一条细线）；橡胶胎侧天光；内饰车厢光；玻璃从里面看是透明的；灯的角色按车上位置（倒车、左右转向）；仪表按 UV 画。
  - 车厢盒、车身高度：`measureCarShape(root)`，`setBodyHeight(h|null)`、`setCabin(box|null|undefined)`。
  - 脏、锈、褪色：uniform + 顶点 `aWear`。
  - **天气**（跟着世界的 `uWeather`）：湿 → 车漆更深、反射更强，胶条橡胶变暗带湿光；近处画水珠（深色珠 + 白点 + 下沿亮），玻璃外面浅色水珠；雪只积在车顶和车顶货物上。房间里（车库）自动不淋雨；别的屋顶 `setShelter(0..1)`。
  - 幽灵三种：深度预通道 = 一层皮；`replace`/准星下的带“透视”孪生（被挡住的部分半强度可见）。高亮：单独网格 / 合并网格 `aPartId`。
- **合批** `src/game/render/carMerge.ts`：`MergedCar`（整棵 holder 树按材质合并并保留：隐藏原件、`updatePart(id, {paint, paint2, dirt, rust, wear})` 只重写那一段顶点、`partAt(hit)` / `pick(ray)` / `boxOf(id)`、`dispose()` 还原）和一次性的 `mergeCarParts()`。测试车 37 → 32 次绘制。
- **测试车** `tools/blender/test/testcar.py`（+ `carkit.py`）→ `public/models/modcar/test/testcar.glb`（+ `testwheel.glb`）：20 个材质名全用到。
- 测试 `harness/sim/carmerge.test.ts`（12 项）。老车截图与改动前逐像素一致。

## 下一步

- 继续对照参考打磨：车漆在阴天/雾里的层次、轮毂近景、玻璃内外层次。
- 远景（50 m+）车的简化：反射带是否该收成一条。

## 问题

- 测试车 GLB 4.3 MB（顶点数多）；真车由车架/零件代理导出。
- 脏锈遮罩的分支在合并网格的零件交界处取导数（非统一分支），目前看不出问题。
