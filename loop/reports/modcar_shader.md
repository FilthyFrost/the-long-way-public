# ModCar 渲染子代理（shader）进度

分支 `modcar/shader`，工作树 `D:/公路旅游-wt/shader`。规范：`docs/MODCAR.md` §6，`specs/art/STYLE.md`；画法标准：`specs/art/CAR_LOOK.md`。

## 已完成

- **模型预览页** `viewer.html` + `src/game/modcar/viewer.ts`（游戏自己的 RenderCore + Environment：天空、云、光、雾、阴影贴图、颜料收尾、描线）。
  - 参数：`glb`、`time`、`weather`、`orbit`（同游戏环绕机位）、`target`、`sun`、`paint`/`paint2`、`dirt`/`rust`/`wear`、`lights=1|2`、`brake`、`turn=L|R`、`reverse`、`cabin`、`ghost=empty|replace|blocked`、`stage=studio|proving|world`（`world` 停在真实公路上）、`merge=1|2`、`highlight=id|名字`、`debug=ao|mat|normal|env`、`spin`、`fov`、`shot`。
  - `window.__rt`：`ready`、`render()`、`simulate(s)`、`setOrbit()`、`setTarget()`、`setHour()`、`setWeather()`、`setPaint()`、`setLights()`、`telemetry()`（`modelCalls` = 模型主通道绘制次数）。
- 截图组 `modcar_viewer`（50+ 张）；`run.mjs` 支持组里写 `"page"`；`vite build` 两页。
- **材质** `src/game/render/carMaterials.ts`：按名字换成 7 族着色器（PAINT / METAL / MATTE / GLASS / LENS / GAUGE / EMIT），一辆车一套共享材质。
  - 车漆：亮/暗两色赛璐璐（暗色单独调、更饱和）+ 画出来的反射五区（开阔天空 / 亮带 / 地平线细线 / 暗带 / 地面，硬边、随视角滑动、朝太阳更亮、染车漆色调）+ 侧面按车身高度“画内倾”+ 太阳斑 + 折线高光 + 菲涅尔边缘 + 天空自己的云；AO 挡住缝里的太阳（板缝读得出）。
  - 铬（纯反射带）、钢、铝；橡胶、饰条、布、皮、木、内饰塑料（车厢光照）；陶瓷；锈铁；玻璃（深色、斜条纹、从里面看是透明的、保留描线遮罩）；灯罩（关：看得见反射杯；开：泛光；灯的角色按车上位置：倒车灯、左右转向灯分开）；仪表（按 UV 画表盘、夜里背光）；自发光。
  - 车厢盒（从座椅/布/仪表量出来）：里面的金属映出车厢而不是天空。
  - 脏（泥边 + 尘 + 雨痕）、锈（大块 + 两档锈色 + 起泡边）、褪色：uniform + 顶点属性 `aWear`。
  - 幽灵三种（深度预通道 = 一层皮；MIN 混合保留描线 id；不投影）；高亮（单独网格 / 合并网格里的 `aPartId`）。
  - 调试视图：AO、材质、法线、反射分区。
- **合批** `src/game/render/carMerge.ts`：静态零件按材质合并，`aPaint`/`aWear`/`aPartId` 进顶点。测试车原样 37 次绘制，合批 32 次（两辆整车合进同一组网格仍 32 次）。
- **测试车** `tools/blender/test/testcar.py`（+ `carkit.py`）→ `public/models/modcar/test/testcar.glb`（+ `testwheel.glb`）：20 个材质名全用到，8.5 万三角形。
- 老车截图与改动前逐像素一致（没有改任何共享着色器）。

## 下一步

- 雾、黄昏、清晨、阴天、雨天下的车；远景（50 m+）。
- 轮胎胎侧、轮毂、陶瓷、灯罩近景再打磨；`wear` 褪色单测。
- 给主程的接入说明（报告里）。

## 问题

- 测试车 GLB 4.3 MB（顶点色按 float 导出）；真车由车架/零件代理导出，体积看他们的设置。
