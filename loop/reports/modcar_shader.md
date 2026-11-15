# ModCar 渲染子代理（shader）进度

分支 `modcar/shader`，工作树 `D:/公路旅游-wt/shader`。规范：`docs/MODCAR.md` §6，`specs/art/STYLE.md`。

## 已完成

- **模型预览页** `viewer.html` + `src/game/modcar/viewer.ts`：用游戏自己的 RenderCore + Environment（天空、云、光、雾、阴影贴图、颜料收尾、描线）显示一个 GLB。
  - 参数：`glb=frames/sedan`（或完整路径）、`time`、`weather`、`orbit=偏航,俯角,距离,注视高度`（与游戏环绕机位同义）、`target=x,y,z`、`sun=度`（把模型转到太阳在它的这个方位）、`paint` / `paint2`、`dirt` / `rust` / `wear`、`lights=1|2`、`brake=1`、`turn=L|R`、`ghost=empty|replace|blocked`、`stage=studio|proving`、`spin=1`、`fov`、`shot=1`。
  - `window.__rt`：`ready`、`render()`、`simulate(s)`、`setOrbit()`、`setTarget()`、`setHour()`、`setWeather()`、`setPaint()`、`setLights()`、`telemetry()`（含 `modelCalls` 模型本身的绘制次数、`modelTriangles`、`materials`、`unknownMaterials`）。
  - 实时模式：拖动环绕、滚轮远近、L 车灯、B 刹车灯、G 幽灵、P 换漆、D 脏、R 锈、T 时间、空格 转台。
- 截图组 `harness/shots/sets/modcar_viewer.json`（31 张）；`run.mjs` 支持组里写 `"page": "viewer.html"`。
- `vite build` 两个页面（`build.rolldownOptions.input`，Vite 8 里 `rollupOptions` 已是旧名）。
- **测试车** `tools/blender/test/testcar.py`（+ 自己的几何工具 `tools/blender/test/carkit.py`）→ `public/models/modcar/test/testcar.glb`：参数曲面车身（V 形板缝、轮拱、内蒙皮）、上部车舱（内嵌玻璃 + 胶条）、镀铬保险杠/格栅、带反射杯的圆灯、尾灯组、后视镜、轮毂轮胎、内饰（座椅、仪表台、仪表、方向盘）、车顶架上绑一个马桶；**20 个约定材质名全部用到**；AO 烘进顶点色（车轮单独烘，转起来不带暗斑）。8.5 万三角形。
- `src/game/render/carMaterials.ts` 第 0 版：按名字换材质的接口（`applyCarMaterials` / `CarLook` / `ghostMaterial` / `applyGhost`）已定，着色暂时是现有赛璐璐。

## 下一步

- 真正的车漆着色器（亮/暗两色赛璐璐 + 两条硬边地平线反射带 + 小太阳高光 + 菲涅尔边缘光；颜色走 uniform 和顶点属性 `aPaint`）。
- 铬、钢、铝、橡胶、玻璃、灯罩（开/关/刹车）、内饰、陶瓷、锈；脏/锈/磨损遮罩；幽灵；高亮；合批工具与 ≤ 40 次绘制验证。
- `specs/art/CAR_LOOK.md`。

## 问题

- 无。
