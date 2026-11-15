# 车辆系统对标调研：Drive Beyond Horizons · Arctic Drive · Pacific Drive

> 调研日 2026-11-14，只用网页检索与抓取（商店页、Steam 新闻 API、Steam 评测与讨论区、官方/粉丝 wiki、媒体评测）。每条事实后附出处。**未核实** = 只有一个粉丝/非官方来源、玩家帖子或搜索摘要。只记机制与数字，不抄任何文字、名称、美术、声音或代码。
> 与 `refs/research/vehicles.md`（Nomad Drive、OUTBOUND、Arctic Drive 的第一轮笔记）互补；本篇只管“车本身”：启动与驾驶、手感、部件、磨损与修理、油电水、怪癖、口碑。
> 抓取受限（已跳过，没有绕过）：gamespot.com、tvtropes.org、topgear.com 返回 403；pcgamer.com、techradar.com、gamesradar.com 只返回标题；Steam appreviews JSON 跳转首页（改用 steamcommunity 评测页）。

## 1. Drive Beyond Horizons（Steam 2625420，Tacty Studio / Santor Games）

2025-03-24 抢先体验，单人或 4 人合作，程序生成的沙漠公路；英文评测 7,325 条，76% 好评（近期 71%）。[商店页](https://store.steampowered.com/app/2625420/Drive_Beyond_Horizons/)

**启动与驾驶**
- 要开走，车上必须装齐：发动机、散热器、电瓶、座椅、点火器、挡杆、带胎的车轮，油箱里还得是对的燃料。开局车库里那辆车缺很多件，要在屋里找。[wiki：入门](https://wiki.drivebeyondhorizons.com/article/getting-started)
- 整辆车用鼠标拼装：左键抓取并装上，右键拆下，按住中键把零件倒过来放掉里面的液体，按住往上拖开引擎盖。（同上）
- **每一个操纵件都是实物零件**：没电瓶就什么都不亮、打不着；没点火器打不着；没座椅不能开；没油门踏板打不着或不走；没挡杆不能换挡（停在 1 挡、不能倒车）；没刹车踏板停不下；没方向盘只能直行；没离合踏板能开但换挡打齿。[wiki：故障排查](https://wiki.drivebeyondhorizons.com/article/troubleshooting)、[wiki：零件](https://wiki.drivebeyondhorizons.com/categorie/pieces)
- 手刹是可选装的独立零件，用来漂移；“改装更新”（约 2026-10-19）加入了改装手刹与挡杆。[新闻 API](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=2625420&count=30&maxlength=6000)
- 2025-07 补丁：鼠标滚轮前后调座椅和方向盘位置并保存。（同上）
- 设置里有方向盘灵敏度（默认 1）、“把车翻过来”（N）、喇叭（H）；难度 Chill / Normal / Challenging。[wiki：选项](https://wiki.drivebeyondhorizons.com/article/options)
- **未核实**：“打着了但不走”是最常见的求助帖，原因多是缺挡杆或踏板、“重量影响车辆”选项、电瓶太弱；有玩家推测要约 65% 电量才打得着。[讨论 1](https://steamcommunity.com/app/2625420/discussions/0/614286608894565025)、[讨论 2](https://steamcommunity.com/app/2625420/discussions/0/604151733808019364)

**手感**
- 物理用的是第三方载具插件，开发者自己说不适合游戏的尺度，计划换引擎自带的载具物理；不模拟空气动力。[新闻 API](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=2625420&count=30&maxlength=6000)（Q&A，约 2026-07-21）
- 开发者的操控解释全靠**重心**：低 = 侧倾少；高 = 头重脚轻易翻；前移 = 推头，后移 = 甩尾。第一辆换新物理的车改前驱、加到 900 kg、降极速、重心前移并降低。（同上）
- 改装更新重做物理，让车尾“更自然地”滑出去。（同上）
- 发动机声分三层（发动机、排气、进气），按转速、油门和负载混合。（同上，开发日志）
- 装齐车门和车窗外面的噪音会变小；排气“回火”比例可以用滚轮调。[wiki：零件](https://wiki.drivebeyondhorizons.com/categorie/pieces)
- 每件东西有重量（kg），每个容器有容量（L）。车重与油箱：C18 451 kg / 47 L，Golf 442 kg / 40 L，P-51 1,050 kg / 47 L，Peak 1,380 kg / 45 L，Poyopa 778 kg / 45 L，Tomahawk 1,700 kg / 60 L。[wiki：机制](https://wiki.drivebeyondhorizons.com/categorie/mecaniques)、[wiki：车辆](https://wiki.drivebeyondhorizons.com/categorie/vehicules)
- **未核实**：评测说开起来“慢、有氛围”，“物理有时行有时不行”。[差评页](https://steamcommunity.com/app/2625420/negativereviews/?browsefilter=toprated)

**部件**
- wiki 列 55 种零件：动力（发动机、涡轮、散热器、电瓶、点火器、油箱、挡杆、喇叭）、车身（保险杠、车门、车窗、引擎盖、后备箱盖、尾门、格栅、后视镜、油箱盖）、内饰（座椅、安全带、方向盘、踏板、手刹、仪表台、收音机、车内灯）、灯（大灯、尾灯、转向灯、灯泡）、车轮（轮、胎、轮毂盖）。一辆车平均约 60 个可单独拆的零件，零件跨车通用。[wiki：零件](https://wiki.drivebeyondhorizons.com/categorie/pieces)、[wiki：车辆](https://wiki.drivebeyondhorizons.com/categorie/vehicules)
- 发动机表：直四汽油 110 kg、极速 105 / 115 km/h（带涡轮）、怠速/满负荷油耗 0.43 / 1.2；V8 200 kg、140 / 155 km/h、0.78 / 3.1；水平六缸 250 kg、180 / 215 km/h；直六 212 km/h；柴油直四 480 kg。汽油机可以装进柴油车，前提是把油箱放干换汽油。涡轮约 +20 km/h。[wiki：发动机](https://wiki.drivebeyondhorizons.com/article/engine)
- “车库更新”（2026-03-24）：举升机调车高、轮径、外倾、悬挂行程/硬度/阻尼和重心（预设可在创意工坊分享）；喷漆机；电瓶充电器；换胎机；跨存档的零件仓库。“改装更新”：8 套外观改装件、新轮毂与轮胎，约 800 种组合。[新闻 API](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=2625420&count=30&maxlength=6000)
- 车有干净 / 脏 / 锈三种状态，用海绵和刷子清洗、可以喷漆；把一辆车恢复成全原厂零件解锁“修复者”成就。（同上）

**磨损、损坏、修理**
- 轮胎 4 个耐久档，每档约 10 km。[wiki：零件](https://wiki.drivebeyondhorizons.com/categorie/pieces)
- 轮胎各自带摩擦参数，不再用整车默认值（约 2026-06-05 补丁）。[新闻 API](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=2625420&count=30&maxlength=6000)
- 官方页面没有撞击损坏或磨损模型，修车基本就是换件。[wiki：机制](https://wiki.drivebeyondhorizons.com/categorie/mecaniques)
- 多人里，满电的电瓶可以用来“搭电”救起倒地的队友。（同上）

**油、电、水**
- 油箱约 45 L；燃料不对或混了别的液体会掉速，但少量杂质还能跑；加油口通常在车尾。[wiki：故障排查](https://wiki.drivebeyondhorizons.com/article/troubleshooting)
- 没有散热器，发动机很快过热熄火；散热器灌什么液体都行，推荐水。发动机少量机油就能打着，加满才跑得最好。（同上）
- 燃料是实体液体：油箱盖开着只在坡上漏，漏速和油量有关。[新闻 API](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=2625420&count=30&maxlength=6000)
- 仪表有油量、机油、车速、水温表（[FileHorse](https://www.filehorse.com/download-drive-beyond-horizons)，未核实）。

**口碑**
- 夸：零件混搭和互换。骂：为一个零件找半天（“花 6 小时找副驾那面后视镜”）；改装浅（发动机升级不过是喇叭和涡轮）；开远了除了脚下这辆车其他都重置（后来车库更新回应）；性能、崩溃、联机 bug 反复出现。[好评页](https://steamcommunity.com/app/2625420/reviews/?browsefilter=toprated)、[差评页](https://steamcommunity.com/app/2625420/negativereviews/?browsefilter=toprated)

## 2. Arctic Drive（Steam 4009490，PlayTogether Studio + Pebbles Games，Bonus Stage 发行）

试玩版 2026-10-07/08，抢先体验 2026-11-25，1–4 人在线合作，有语音。还没有正式评测；试玩版是 Next Fest 第 47 多人玩，愿望单与试玩玩家各过 10 万（2026-11-07）。[商店页](https://store.steampowered.com/app/4009490/)、[Games Press](https://www.gamespress.com/Arctic-Drive-free-demo-out-now-on-Steam)、[新闻 API](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=4009490&count=30&maxlength=6000)

**启动与驾驶**
- 开局一辆“破旧的” 1978 年四缸小车；之后有皮卡（后改四驱）与两座小车。皮卡是“一块一块”做出来的，加了喇叭和货斗箱。[新闻 API](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=4009490&count=30&maxlength=6000)
- **挡风玻璃结霜要用手刮**，第三人称的结霜覆盖与刮掉的量一致（试玩 v0.18.0）。方向盘有手部摆放动画（各车都修过）。（同上）
- 分工：一人开车、一人导航、一人在后面看货。[商店页](https://store.steampowered.com/app/4009490/)
- 官方来源**没有**提到点火、变速箱类型和手刹的具体做法；第一轮笔记里的试玩反馈称“平地不拉手刹会溜车，像杂务”（见 `vehicles.md` §3）。

**手感**
- 卖点：“冰上一个急弯就能结束整趟旅程”；载重增加油耗；急弯会把货甩一地。[商店页](https://store.steampowered.com/app/4009490/)
- 宣传称真实物理让“每块冰、每个雪堆、每个坡都危险”，有物理驱动的撞车系统。[CGM](https://cogconnected.com/2026/02/arctic-drive-just-dropped-a-brand-new-gameplay-trailer/)
- 雪：车轮压出真的车辙；雪堆能挡路但能冲过去（开发日志 #3）。补丁调过悬挂硬度、“轮胎平衡让路感更真实”（2026-06），改善了“在路上的滑与刹”（2026-08）。每个零件有重量。[新闻 API](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=4009490&count=30&maxlength=6000)
- 暴风雪和白茫茫会让路看不见；路在群系之间变窄变宽。[商店页](https://store.steampowered.com/app/4009490/)

**部件、损坏、修理**
- 零件是螺栓装上去的，撞了会变形、会掉；车架会弯（“完整模拟”的损坏）。[商店页](https://store.steampowered.com/app/4009490/)
- 空箱、坏零件和废料在**发电机供电**的回收机和工作台上变成材料，官方说这是“停下来过夜的理由”。（同上）
- 零件可以用锤子手工做，图纸在研究台解锁；可做更好的轮胎和修理包；修理包 1–3 级；有“紧急修理”的屏幕提示；拖车车轮有 2、3 级；发动机有扭矩、极速、油耗三项数值。[新闻 API](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=4009490&count=30&maxlength=6000)、[Games Press](https://www.gamespress.com/Arctic-Drive-free-demo-out-now-on-Steam)
- 货物是实物：“抬得起就装得上”，油桶放后备箱，箱子放后座。[商店页](https://store.steampowered.com/app/4009490/)

**油、电、水**
- 油桶在加油站和野外找，也能做 20 L 的油桶；0.9.4 起废车里的油更少。发电机和拖车耗油，挂着拖车会多耗一点，在拖车工作台上做东西也烧油。[新闻 API](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=4009490&count=30&maxlength=6000)
- **散热器装的是水，空着开会有警告**（v0.19.2）；用电的零件重新平衡过（v0.13.12），有用电预算；发动机开着能取暖、防失温。（同上）
- 拖车和房车成为“轮子上的基地”：暖气、电、制作台、灶台。（同上）

**试玩期暴露的问题**（补丁说明）：出生点找不到路（加了围栏）、购物车卡进车里、拖车难挂、座椅和手的位置不对；讨论区有“卡在石头里”“快捷键”帖。[新闻 API](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=4009490&count=30&maxlength=6000)、[讨论区](https://steamcommunity.com/app/4009490/discussions/)

## 3. Pacific Drive（Steam 1458140，Ironwood Studios，2024-02-22）

14,453 条评测 82% 好评。[商店页](https://store.steampowered.com/app/1458140/)

**启动与驾驶：一套“仪式”**
- 第一人称；启动 = 看着点火开关拧钥匙，再看着挡杆从 P 推到 D；不挂 P 车会顺坡溜走，开着不熄火浪费油。[Game Informer](https://gameinformer.com/opinion/2024/02/29/im-learning-how-to-drive-and-pacific-drive-is-helping)
- 上下车的“仪式”：点车门、点钥匙、点挡杆进 D，下车时推上驻车制动；雨刷和大灯都要手动开。[Aftermath](https://aftermath.site/pacific-drive-star-trucker-buttons-steam)；点火、手刹、大灯、雨刷都“由玩家手动操作”。[GGRecon](https://www.ggrecon.com/reviews/pacific-drive-review/)
- 挡杆是自动挡，只有 P 和 D（**未核实**：TV Tropes 的搜索摘要，原页 403）。
- 手刹（用于行驶中的那种）是做出来的升级件，安装时有半透明指引线连到每只车轮。[Game Informer](https://gameinformer.com/opinion/2024/02/29/im-learning-how-to-drive-and-pacific-drive-is-helping)
- **开发者 AMA（2026 夏）**：驻车制动最初放在方向盘左侧，只是为了“防止车顺坡溜走”，结果成了“最有代表性的涌现叙事方式之一”，以至于“我们改了整个叙事的性质”；设计师：“我们自己也经常忘，所以做了一个自动驻车的升级件！”[新闻 API](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1458140&count=40&maxlength=6000)
- 自动驻车件装在座椅架上：下车时自动拉上、上车时自动放下，每次耗 0.05 kW。[wiki](https://pacificdrive.wiki/view/The_Auto_Parker)
- 无障碍选项：简易点火（按一下代替按住）、简易挡杆（按一下代替按住）、“必须在 P 挡才能点火”、装着的零件也能直接换；v1.9.4（2025-07-14）移到全局无障碍菜单。[wiki：预设](https://pacificdrive.wiki/view/Gameplay_Presets)
- **未核实**：简易挡杆解决了“卡在 P 挡”的问题；键盘转向一度不能改键。[讨论区](https://steamcommunity.com/app/1458140/discussions/0/4309453072031118442)

**手感**
- 初始旅行车“突突的”“开起来像有一吨重”；风暴逼近时越野冲向出口更显笨拙。[GGRecon](https://www.ggrecon.com/reviews/pacific-drive-review/)；初始车“勉强到 40 英里/时”。[Game8](https://game8.co/articles/reviews/pacific-drive-review)
- 化油器发动机（128 马力、18 MPG、400 耐久）+ 全地形胎约 110 km/h，0–100 约 17 s。[wiki](https://pacificdrive.wiki/view/Carbureted_Engine)
- 玩家：“感觉得到抓地的丢失、颠簸怎么影响操控”，车“不像塑料玩具”，高速刹车手感不对。[好评页](https://steamcommunity.com/app/1458140/reviews/?browsefilter=toprated)
- **一只胎气不足整辆车就明显跑偏**，经常冲出路面。[GamingTrend](https://gamingtrend.com/feature/reviews/pacific-drive-review-steering-the-genre-in-a-different-direction/)
- 可调的地形设置：越野严重度、泥地严重度、涉水严重度、**扎胎严重度**、湿路抓地、发动机功率与操控（0.05–5×）。[wiki：预设](https://pacificdrive.wiki/view/Gameplay_Presets)
- **未核实**：四只胎和备胎不一致时，在滑或陡的地面上会难以预料。[KosGames](https://kosgames.com/pacific-drive-pro-tips-for-the-new-driver-53274/)

**部件**
- 19–20 个槽位：车架 1（固定）；面板 5（引擎盖、前左右、后左右）；车门 5（驾驶、副驾、后左右、尾门）；保险杠 2；大灯 2；轮胎 4（备胎、夏季、越野、全地形、防扎、桨叶、强抓地）；发动机 1（化油器、轻涡轮等）。面板与车门有多种材质。[wiki：车](https://pacificdrive.wiki/view/Car)
- 8 个扩展架（侧 4、座椅 2、车顶 2）：油箱、电瓶、储物、射灯、风机、太阳能板、后座油箱、自动驻车……油箱和电瓶按固定顺序消耗，车内原装的最后用。（同上）
- 后座油箱容量 25，“约为原装油箱的一半”；铅酸电瓶容量 30。[wiki](https://pacificdrive.wiki/view/Backseat_Tank)、[wiki](https://pacificdrive.wiki/view/Lead-Acid_Battery)

**磨损、损坏、修理：每个部件有“状态名”**
- 电瓶：氧化、短路、鼓包；油箱：漏、锈；灯：烧坏、砸碎、老化；车轮：胎面磨光、爆胎、**瘪胎**、轮子松动；发动机：坏了、火花塞短路、疲劳、**气缸垫烧了**（油耗暴涨）；车窗：裂；通用：快坏了、脆、不可靠、湿、带电。[wiki：状态](https://pacificdrive.wiki/view/Category:Status)、[wiki](https://pacificdrive.wiki/view/Blown_Gasket)
- 修理消耗品各管一类状态：修补腻子 +40 耐久、5 次；密封包 +25，修裂、瘪、漏、氧化；机械包修松动；电工包修短路。[wiki](https://pacificdrive.wiki/view/Repair_Putty)、[wiki](https://pacificdrive.wiki/view/Sealing_Kit)、[wiki](https://pacificdrive.wiki/view/Loose_Wheel)、[wiki](https://pacificdrive.wiki/view/Shorted)
- 损坏来源：树刮掉车门、异常风暴剥掉门窗、**忘拉手刹溜坡**是常见原因；一块凸起的地面能把发动机撞坏。[GGRecon](https://www.ggrecon.com/reviews/pacific-drive-review/)、[Game8](https://game8.co/articles/reviews/pacific-drive-review)
- 车库有加油泵、充电站、修补台、工作台，可做一个自动修车的维修站。[wiki](https://pacificdrive.wiki/view/Auto_Shop)
- 设置里可分别调撞击、辐射、爆炸、电、酸伤害，开关“装着的零件不会坏”“成功一趟后免费修好”。[wiki：预设](https://pacificdrive.wiki/view/Gameplay_Presets)

**油、电**
- 可以用油桶从残车和油桶里抽油，或去加油站；车库油泵无限、外面的有限（**未核实**：GameSpot 403，KosGames 摘要）。[KosGames](https://kosgames.com/pacific-drive-pro-tips-for-the-new-driver-53274/)
- 电瓶供大灯和特殊能力；**忘了关灯没有提示音**，可能带着没电的电瓶出发（未核实，同上）。1.11.0（2025-10）把充电从 2 kW/s 降到 0.65 kW/s。[新闻 API](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1458140&count=40&maxlength=6000)
- 设置：电耗倍率、油耗倍率、无限油、无限大灯、回车库自动补满。[wiki：预设](https://pacificdrive.wiki/view/Gameplay_Presets)

**怪癖（quirks）**
- 句式：“当〔部件〕〔动作〕时，〔部件〕〔行为〕”；触发有雨刷/大灯/收音机开关、转向、加速、刹车、P↔D；有的怪癖会让油表电表说谎；随时间、损坏和接触异象慢慢长出来。[wiki](https://pacificdrive.wiki/view/Quirks)
- 诊断：修补台上的四栏猜谜，每次 8 次机会，猜错告诉你对了几栏；治好要花修理包，也可以选择留着。推荐做法：停车一次只动一个操纵件，再去车库后面的试车道。（同上）
- 设置：怪癖“无 / 宽容 / 默认 / 很多”、免费提示、固定怪癖。v1.9.4 起仪表上有怪癖灯，按严重程度黄 → 红。[wiki：预设](https://pacificdrive.wiki/view/Gameplay_Presets)
- 例子：倒车时车门打开；关灯时电瓶掉得更快；挂 P 时右前门打开；按喇叭开侧门；开后备箱时喇叭响。（Steam 评测、TechRadar 摘要、GamingTrend、Game8）
- 灵感来自一档讲修车的电台节目。（AMA，新闻 API）

**口碑**
- 夸：车是“体验的中心”，手动仪式让人“投入得多”，车里“温暖、安全”。（Steam 高赞评测、Game Informer、Aftermath）
- 骂：“一直在伺候一辆脆得让人抓狂的车”；“左前轮第四次松了”；“修车保养的时间长得离谱”；“每开 10 秒就得下车”；熄火—拉手刹—下车的流程重复；怪癖“烦大于有趣”；**轮胎太容易坏**，有人得关掉车辆损坏才能推进；后期刷材料、菜单太多。[差评页](https://steamcommunity.com/app/1458140/negativereviews/?browsefilter=toprated)、[GamingTrend](https://gamingtrend.com/feature/reviews/pacific-drive-review-steering-the-genre-in-a-different-direction/)
- 补丁的方向：1.4.0（2024-03）车库门按钮、失败惩罚拆成独立选项；1.7.1“Drive Your Way”（2024-09-16）7 个预设、约 50 个设置；1.9.1 中途存档；1.9.4 全局点火/挡杆无障碍；1.11.0 充电削弱。[新闻 API](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1458140&count=40&maxlength=6000)

## 4. 三款的共同结论（给设计用）

1. **手动仪式是这类游戏的灵魂，也是最大的差评源**：Pacific Drive 的驻车制动制造了故事，又被开发者自己做成可以自动化的升级件，最后变成全局开关。→ 我们做“能操作、不必须”，默认轻松，拟真是选项（`docs/VEHICLE_SYSTEMS.md` §2）。
2. **每个操纵件都是实物**（DBH）让“修好一辆车”成了好教程，但“打着了不走”是最常见的困惑。→ 点火自检必须说人话（DESIGN_V2 5.6 的做法被这条再次证实）。
3. **状态要有名字、有对应的修法**（Pacific Drive）。→ 每个部件一个车况数 + 少数几个有名字的状态（瘪胎、开锅、蹒跚、电瓶没电），每个状态一句话、一种修法。
4. **轮胎太脆、零件老坏 = 杂务**（Pacific Drive 差评最多的一类）。→ 扎胎是两三个小时一次的合作小事件，不是每 10 分钟。
5. **一只瘪胎让整车跑偏**（Pacific Drive）——反馈很强。→ 我们保留跑偏，但量要让人开得到路边。
6. **雪地与冷是车的身份**（Arctic Drive）：刮霜、车辙、开着发动机取暖、散热器缺水警告。→ 冷启动多打几下、预热器、暖风耗电，都进车况系统。
7. **重量与载货影响油耗和操控**（Arctic Drive、DBH）。→ 过热测试用 +35% 载重作为“像拖挂一样”的工况。
8. **难度做成开关和倍率，而不是改基础游戏**（Pacific Drive 1.7.1 之后的路线）。→ `hazardScale`、`assist`、油耗/电耗都留成单一参数。
