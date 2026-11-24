# ND 接入状态（合并时先看这里）

分支 `nd/remake`（`D:/公路旅游-wt/nd-remake`），从 `feat/v3` 的 `e71ce9f` 拉出，只在本地提交。

## 改到的公共文件（都是只加不改，世界不开 `?nd=` 时和原来一模一样）

| 文件 | 加了什么 | 为什么 |
|---|---|---|
| `src/core/world/terrain.ts` | `WorldOptions.prefabs` | 世界生成时要不要铺预制建筑（`?nd=cabin`、`?nd=all`） |
| `src/core/world/prefabs.ts`（新） | 建筑卡的登记表、`prefabsAsked` | 各个 ND 模块把建筑卡登记进来，世界按卡铺 |
| `src/core/world/sites.ts` | 地点种类 `prefab`、`Site.prefab`、预制建筑的队列 | 只有开了 `prefabs` 才会用到；参考世界的测试不变 |
| `src/core/modcar/loot.ts` | 不带点的物品 id 原样认 | 建筑卡里摆的是 ModCar 自己的物品 |
| `src/game/modcar/seamless.ts` | `ModcarWorldChoice` 带上 `prefabs` | 把地址参数传进世界 |
| `src/game/scene/siteBuild.ts` | `case 'prefab'` 不画 | 建筑由登记它的系统自己画 |
| `src/game/modcar/kernel/context.ts` | `addSolids`、`heldThing`、`lookZoom`、`grimeCast`/`scrubStroke`/`scrubEnd` | 系统要挡人挡车的门、手里东西的姿势、相机拉近、打磨机磨车身；ModGame 原本就有同名成员的直接声明 |
| `src/game/modcar/ModGame.ts` | `addSolids()`、`lookZoom`（步行视角按它缩小视场角） | 同上 |
| `src/game/modcar/player.ts` | `HandsUse` 和 `player.hands`：系统认领手里的东西，先问它左键、滚轮、F 和右侧提示 | 相机（右键举起、左键快门、滚轮变焦）、照片（右键拿到眼前）、打磨机（左键开机） |
| `src/game/modcar/held.ts` | `lift`、`handTurn`、`liftTurn`、`hang()`、`model`、`pinFor()` | 举到眼前、相机镜头朝前拿、照片正对着看、出片口挂照片、打磨机贴在车身上 |
| `src/game/modcar/loose.ts` | `keepApart(uid, on)` | 有会动部件的东西（咖啡机盖、冰箱门、照片）不并进合批 |
| `src/game/render/core.ts` | `afterFrame`：下一帧画完后调一次 | 快门：从刚画好的画面里裁出照片 |
| `harness/sim/v3/fakeGame.ts` | 上面这些成员的空实现 | 测试用的假游戏 |
| `src/game/modcar/player.ts`（喝东西那一处） | 喝到的液体先看这件东西自己装的是什么（`ItemState.liquid`），没有再用它这一类的 | 水桶能装啤酒、杯子能接雨水；原来的饮料都没有这个字段，行为不变 |
| `src/core/modcar/items.ts` | 液体多了 `milk`；`eat.water`（吃下去也解渴）；`heal.cure`（能治吃坏的肚子） | 原版的牛奶、多汁的水果、药片和急救包；原有的东西都没有这些字段 |
| `src/core/modcar/vitals.ts` | 喝牛奶（每升 24 饱腹 + 10 解渴）、`cure()` 去掉“闹肚子” | 同上 |
| `src/game/modcar/ModGame.ts`（吃东西那一处） | 吃的东西有 `water` 就按喝了那么多水算；药有 `cure` 就治肚子 | 同上 |
| `src/game/modcar/itemInfo.ts`、`player.ts`（快捷栏的条） | 卡片和快捷栏按容器里实际装的液体显示（水桶装啤酒就写啤酒）；吃的东西写出解渴多少；药写能治肚子 | 同上 |
| `src/game/render/shaderlib.ts` | 车灯光束多了两个参数 `uHeadCone`（光锥）`uHeadReach`（照多远），默认值就是原来写死的数 | 手电要能聚光；车灯照旧 |
| `src/core/modcar/types.ts` | 零件和车身多了 `polish`（抛光去掉的褪色，0…1） | 抛光机 |
| `src/game/modcar/carView.ts` | 漆面褪色乘上 `1 − polish`（四处一样的改法） | 同上；没抛光过的车和原来一模一样 |
| `src/game/modcar/kernel/context.ts` | `audio`（只声明，ModGame 本来就有） | ND 自己合成的声音走游戏的总音量 |
| `src/core/onfoot/walker.ts` | `loadShare`、`loadRun`（手里的东西要求的速度比例、能不能跑）；`hold()`（坐着时脚固定、视线降到坐姿高度） | 原版家具搬着不减速；坐椅子沙发。默认值下走路和原来一样 |
| `src/core/modcar/items.ts` | 物品多了可选的 `carryWalk`（拿着它走多快、能不能跑） | 同上；原来的东西都没有这个字段 |
| `src/game/modcar/player.ts` | `pin`（系统把人固定在座位上：脚的位置、视线高度、提示、起身进度圈）；`keyNotes`（系统给手里任何东西加一行右侧提示）；按 `carryWalk` 设走路速度 | 坐下；"R 摆放"的提示 |
| `src/game/modcar/cockpit.ts` | `CockpitUse` 和 `uses`：系统接管驾驶室里某个控件的提示、按键、滚轮；`wheel()` | 卡带机：放磁带、退磁带、音量 |
| `src/game/modcar/ModGame.ts`（滚轮和收音机） | 坐着时滚轮先问驾驶室；`radioLevel`：系统给每台车载收音机的音量乘一个比例（0 就不出声） | 音量旋钮；磁带在卡座里时电台不响 |
| `src/game/modcar/kernel/context.ts` | `input`（视角的转向和俯仰）、`radioLevel`、`cockpit`（只声明，ModGame 本来就有） | 坐着时限制转头；卡带机 |
| `src/core/modcar/cargo.ts` | 每辆有驾驶室的车（狐除外）多了"仪表台"放东西的地方（`dash`，只放小东西，2 厘米一格对齐）；区域可以写 `glassOver`（上面的玻璃不算台面）和 `grid` | 摇头娃娃摆在仪表台上 |
| `src/game/modcar/cargo.ts` | `wallRules`：系统决定自己的东西能不能挂墙；`glassOver` 的区域画高度图时不画玻璃；对准时按区域自己的格子对齐 | 原版的车厢墙规则（吊柜能挂）；仪表台 |
| `tools/blender/parts/cockpit.py`、`public/models/modcar/parts/radio_tape.glb`、`src/core/modcar/data/parts_geo.json` | 卡带机窗口里的磁带单独成一个节点 `N_cassette` | 没放磁带时看不见，放进去时滑进去 |
| `harness/sim/v3/fakeGame.ts` | `input`、`radioLevel`、`cockpit` 的空实现 | 测试用的假游戏 |
| `src/game/modcar/ModGame.ts`（声音那一处） | 新的声音名 `pour_water`：倒水的循环声 | 原来的 `pour` 按手里的工具选液体，拿着水桶倒水时会变成汽油声 |
| `src/game/modcar/kernel/context.ts` | `input` 多声明了 `walk`（前后左右推了多少）和 `isDown(code)`（只声明，ModGame 本来就有） | 爬梯子：往前推着走才抓住，空格松手 |
| `harness/sim/v3/fakeGame.ts` | `input.walk`、`input.isDown` 的空实现 | 测试用的假游戏 |
| `src/core/world/sites.ts` | `Site.flat`、`Sites.padFlat`；预制建筑的地板放在它平整地面在正面中间的高度（原来是四个角里最高的那个） | 只对预制地点（开了 `?nd=`）：地面在整块地上一样平，楼梯第一级、集装箱的地板、门槛离地都一样高；原来顺着公路的坡和往外的落差铺，一头会比地板低出一截 |
| `src/core/world/terrain.ts` | 平整地面有 `padFlat` 时整块平在这个高度，从路边起 2 米过渡到路面 | 同上；没有预制地点的世界一模一样 |
| `tools/blender/parts/_kit.py` | `mover(..., rot_z=None)`：会动的部件可以有自己转过的坐标系，模型还在原处 | 转了 16.4° 的第二台风机，叶轮要绕它自己的轴转 |
| `src/core/world/prefabs.ts` | `PrefabWreck`、`PrefabCard.wrecks`：建筑卡可以带几辆路边的废车 | ND7 的废车地点用游戏自己的废车（能拆、能翻、能抽油） |
| `src/core/world/sites.ts` | 铺预制地点时把卡上的废车照路边废车的做法放下（`putIn` + `wreck()`）；废车尺寸挪进 `WRECK_SIZE` 表（`wreckSize` 读它，掷出来的和原来一样） | 同上；卡上没有废车时什么都不变 |

## ND 自己的东西（不碰公共文件）

- 规则（纯逻辑、有测试）：`src/core/v3/nd/`（物品表、建筑卡、相机、咖啡机、花盆、打磨机、煎东西、水）
- 游戏模块（游戏自动找到）：`src/game/modcar/v3/nd-build`（建筑；ND5 起还管灯罩发光、霓虹光晕、地上的光圈、储物柜关着拿不到，并告诉 `nd-fuel` 哪栋画出来了）、`nd-fuel`（加油机和油枪）、`nd-home`（家具门和抽屉）、`nd-camera`、`nd-coffee`、`nd-garden`、`nd-grinder`、`nd-cook`（炉子和锅）、`nd-water`（倒水、水泵、接雨）、`nd-light`、`nd-dig`、`nd-kit`、`nd-place`（R 摆放）、`nd-tape`（磁带和卡带机）、`nd-collect`（摇头娃娃、车牌、相框、车厢墙）
- 共用小工具：`src/game/modcar/nd/kit.ts`、`src/game/modcar/nd/vessel.ts`（容器）、`nd/fire.ts`（篝火的火苗）、`nd/glow.ts`（光晕和地上的光圈）
- 模型脚本：`tools/blender/nd/`（建筑：木屋、水泵；ND5 的营地 `camp.py`、加油站 `station.py`、旅馆 `motel.py`、公社 `commune.py`、开局小屋 `starter.py`，木房子的通用做法 `_house.py`）、`tools/blender/items/nd_home2.py`（ND5 的九件家具）、`nd_fuel.py`（油枪）、`tools/blender/items/nd_home.py`（家具）、`tools/blender/items/nd_things.py`（物品）、`nd_kitchen.py`（炉子、锅、肉）、`nd_water.py`（储水罐、水桶、手压水泵）
- 实机截图脚本：`harness/shots/nd1_*.mjs`，截图在 `loop/shots/nd1/`；ND5 的是 `nd5_*.mjs`（`nd5_fuel`、`nd5_motel`、`nd5_houses` 带检查，失败时退出码非零），截图在 `loop/shots/nd5/`；ND6 的是 `nd6_places.mjs`（八处地点逐个走、爬、开门，带检查）、`nd6_watertower.mjs`（爬梯子）、`nd6_perf.mjs`，截图在 `loop/shots/nd6/`
- ND7 加的：`nd-build` 的翻转门（绕水平合页翻：信箱的前门、顶盖，以后的活板门）、转的东西自己的阵风和快慢（风车）；建筑卡的废车（`_nd.py` 的 `Card.wreck`）；模型脚本 `tools/blender/nd/minors.py`（公交站、厕所、信箱、风车、草垛、十字架、三种废车地点）；实机检查 `harness/shots/nd7_places.mjs`、性能 `nd7_perf.mjs`，截图在 `loop/shots/nd7/`
- ND6 加的：爬梯子的模块 `nd-climb`（规则 `src/core/v3/nd/climb.ts`，测试 `harness/sim/nd_climb.test.ts`）；`nd-build` 多了转的东西（屋顶风扇、跟着风转的叶轮）、滑开的盖子、门的开关时间和材质的声音、两扇门共用一格、斜着的格子、日光灯和航标灯、探照灯的光圈；模型脚本 `tools/blender/nd/` 的水塔、瞭望塔、墓地、集装箱场、电台、三个工厂、风电场，共用的道具（集装箱、铁梯、平台、栏杆、铁丝网、铁塔、天线、货架、油罐、砖墙、楼板、卷帘门）在 `_props.py`

## 里程碑

- **ND0**（`f90daac`）：预制建筑开关、木屋第一版模型和建筑卡、门和灯
- **ND1**：木屋全套家具（能开门开抽屉、冰箱能装东西），相机、咖啡机、花盆、打磨机四件的模型和完整用法；测试 2386 个全过
- **ND2**（`d81e9d6`）：照片、咖啡、种植、冰箱、炉灶、水桶接雨和手压泵、吃喝和药
- **ND3**（`b4e690d`）：手电、打磨机和抛光机、铲子和探测器、宝箱钥匙和锁、撬棍、指南针、修理包、充电器
- **ND4**：搬家具不减速、车里的大件按住拿起、R 摆放、椅子沙发能坐；13 盘磁带和卡带机；四个摇头娃娃（仪表台）；车牌；相框；车厢墙的原版规则；木头手模；宝箱第一次打开先发摇头娃娃和磁带；贴在家具上的照片跟着家具走。新模块 `nd-place`、`nd-tape`、`nd-collect`（`nd-home/sit.ts` 坐下），规则在 `src/core/v3/nd/` 的 `place`、`tapes`、`bobble`、`plates`，模型 `tools/blender/items/nd_collect.py`
- **ND7**：九处小地点：公交站（候车亭、长椅、站牌、垃圾桶）、两间茅房（门开 110°、卡 25%，第一间总有能拿走的马桶）、一排 8 个信箱（前门和顶盖绕水平合页翻开、卡 25%、关着拿不到）、小木风车（16 片叶的轮子跟着风转，满风每分钟 80 转）、10 个草捆、10 个木十字架、三种废车地点（游戏自己的能拆的废车横在路边，周围摆东西）；原版的停车点从来不刷，不做。改到的公共文件见上表最后两行
- **ND6**：八处大地点：能爬的水塔（带护笼的铁梯到 10.81 米的走道）、瞭望塔（三段楼梯、走道、小屋）、墓地（8 座墓的石盖滑开）、集装箱场（8 个集装箱 16 扇门，一个叠着、几个斜着，探照灯）、电台（外墙铁梯上楼顶、32 米铁塔和天线、23 扇储物柜门、电箱、日光灯、塔顶红灯）、三个工厂（装卸台上的大厂房和它的三段铁梯、走廊、夹层、楼顶风扇；仓库和它的货架、外墙铁梯；三层厂房的折返楼梯）、风电场（两台风机，274 级螺旋梯爬到机舱，叶轮跟着风转）；ND5 的门换成原版的开关时间；预制地点的平整地面改成整块一样平。改到的公共文件见上表最后五行
- **ND5**：五栋大建筑：营地（四顶帐篷、能点的篝火）、加油站（店、修车间、旧仓库、雨棚、一台加油机、霓虹招牌）、汽车旅馆（8 间客房、前台、16 扇储物柜门、电箱）、公社民房（四栋，一栋两层）、开局小屋（两层、阁楼、车库）；九件新家具；原版的油枪加油（新模块 `nd-fuel`，规则 `src/core/v3/nd/fuel.ts`）；灯按开关一盏盏管、按钟点亮、霓虹闪亮、开局亮几盏；每扇门自己的锁卡几率、悬空的柜门、门后的格子。这一阶段公共文件一个没动；测试 `harness/sim/nd_places.test.ts`
- **ND9**（接入包，2026-11-24，主版本 v3/nd9）：25 种建筑进了地点的骰子，只在第 6 版世界（新游戏的世界；第 5 版及以前的存档世界一点不变）。骰子在挑到我们的加油站、民房、营地式路边歇脚处、猎人小屋时，按比例换成 ND 的（加油站 55%、民房 40%、营地 80%、猎人小屋 30%；修车铺、商店、码头、瞭望台、灯塔从不换），第二处地点是歇脚处或猎人小屋时 65% 换成 ND 的小地点，空着的段 30% 放一个 ND 小地点；权重在 `core/world/prefabs.ts` 的 `PREFAB_DICE`。骰子放的建筑：正面离平整地面起点至少 2.2 米（整块都平），大地点（民房类、加油站、营地、工厂类）一头多一块院子给发现的车停，里面有给日程东西用的箱子（`core/v3/nd/cards.ts` 的 `ND_BOXES`，箱子自己不刷东西，它那个点的 ND 原物不放）；ND 自己刷出来的新玩意儿等日程的第一件出了才有（`schedule.ts` 的 `heldBackUntil`）；`?nd=` 的试验场照旧。测试 `harness/sim/nd9_world.test.ts`，实机 `harness/shots/nd9_world.mjs`，性能 `harness/shots/nd9_perf.mjs`（25 种各一处）。公共文件改动：`rules.ts`（第 6 版）、`terrain.ts`（第 6 版用第 5 版的地球路）、`sites.ts`（骰子、`layCard`、`SiteContainer.plan`）、`prefabs.ts`（`PrefabBox`、`yard`、`PREFAB_DICE`）、`loot.ts`（`ownRoll`）、`schedule.ts`、`places.ts`、`game/modcar/wrecks.ts`（预制建筑按占地和矮的实体让车）、`save.ts`、`ModGame.ts`（新游戏默认第 6 版）。
