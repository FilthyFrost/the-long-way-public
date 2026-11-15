# 创作玩法 · 建造 · 解锁进度：对标调研笔记

> 调研日 2026-11-14，仅网页检索。数字只写查到出处的；**未核实** = 没找到可靠出处或来源互相矛盾；**提案** = 我方建议值，不是任何游戏的事实。Fandom 系 wiki、Zelda Wiki、Stardew Wiki 等拒绝自动抓取（见文末）；标“搜索摘要”的条目只看到搜索引擎对该页的转述，没读到原页，已逐条注明。

## 0. 一页结论

| 主题 | 基座 | 嫁接 |
| --- | --- | --- |
| 1 乐器 | Sea of Thieves shanties（一键加入伴奏） | Sky / Genshin 键格、TLOU2 和弦轮、Rust MIDI、AC town tune |
| 2 电台 | Euro Truck Simulator 2（本地文件＋流地址） | GTA V Self Radio 的 Radio 模式、K.K. Slider 收藏、主播开关 |
| 3 绘画 | Eastshade 取景成画 ＋ AC custom design | Chicory 限色低分辨率、Webfishing 粉笔 |
| 4 解锁 | Dredge relic（路线自由、发放顺序固定）＋ Raft Receiver | Subnautica 3 碎片、Outbound 三选一、Raft Research Table |
| 5 家 | RDR2 camp ledger（固定短清单） | Stardew bundle、Valheim comfort、Death Stranding 捐料与 likes、AC 房贷 |
| 6 服装 | Zelda BotW（三槽 × 等级） | Kochi Dye Shop、AC 32×32 图案、Winter Burrow 织毛衣 |

## 1. 可演奏乐器 / 合奏

**Sea of Thieves shanties** — 拿出乐器，按住次要互动键开轮盘选曲，不选则随机。第一个演奏的人是 lead，奏主旋律；之后任何人拿出任意乐器都自动成为 backing，音符明显更少。乐器 4 种（Concertina、Hurdy-gurdy、Drum、Banjo）；wiki 列 19 首，其中 9 首默认拥有，其余靠任务、Commendation、Tall Tale 解锁（另一攻略站称 25 首，未核实）。喝了 Grog 会走调，水下变声，还能安抚蛇。妙处：零技巧、零失败，一个键就进合奏。各端如何对拍未找到开发者说明（未核实）。来源：[Shanty](https://seaofthieves.wiki.gg/wiki/Shanty)、[Instruments](https://seaofthieves.wiki.gg/wiki/Instruments)、[称 25 首的攻略](https://www.gfinityesports.com/article/sea-of-thieves-instruments-shanties)

**Sky / Genshin 键格** — Sky 的乐器是 15 键网格（3 行 × 5 列，第三方工具记作 A1–C5）；调性自动跟随所在场景的背景音乐，选了乐谱则跟乐谱，所以陌生人乱弹也和谐（官方出处与谱面引导细节未核实）。Genshin Windsong Lyre 是 21 个音（C3–B5，只有自然音），键盘三行七键 Q–U / A–J / Z–M，可同时按出和音但不能延音，联机时别人听得到，现售 150,000 Mora。来源：[Sky Studio](https://apps.apple.com/app/id1522241329)、[Music Key（搜索摘要）](https://sky-children-of-the-light.fandom.com/wiki/Music_Key)、[Codashop](https://news.codashop.com/hk/genshin-impact-windsong-lyre-guide/)、[TouchTapPlay（联机可听见，搜索摘要）](https://www.touchtapplay.com/genshin-impact-lyre-songs/)

**The Last of Us Part II guitar** — 左摇杆在和弦轮上“高亮”和弦（高亮不等于确认，视线不用离开画面）；触摸板分成 6 个弦区，横扫是扫弦，点单区是拨单音。原型用《Take On Me》的 5 个和弦搭成。设计上明确拒绝 QTE 和节奏游戏：只管和弦进行，速度、拍号、风格都归玩家；弹错照样出声；目标是“新手乱扫也好听”。录了数百个单音采样。每轮和弦数未核实。来源：[Game Developer](https://www.gamedeveloper.com/design/how-naughty-dog-prototyped-the-interactive-guitar-in-i-the-last-of-us-part-ii-i-)、[PlayStation Blog](https://blog.playstation.com/?p=357243)

**Rust Instruments DLC** — 10 件废品乐器（Wheelbarrow Piano、Junkyard Drum Kit、Pan Flute 等），2019-12-05 上线，10 美元；没买的人也能弹。7 个自然音默认绑小键盘 1–7，可改键，加升半音与八度修饰键后“部分乐器超过 20 个音”。MIDI：官方原话是插上设备即可“实时演奏大多数乐器”，默认关闭，需在选项里打开；钢琴音域最宽，鼓有 14 个音位。还能把 .mid 放进 instruments 文件夹，用 `instruments.playrecording 文件名` 自动演奏。造价例：钢琴 200 木＋100 金属碎片。来源：[官方博客](https://rust.facepunch.com/blog/instrument-pack-dlc)、[官方 wiki](https://wiki.facepunch.com/rust/Instruments)、[Rustafied](https://www.rustafied.com/updates/2019/11/21/lets-rock)

**Animal Crossing town tune** — 1–16 个音的小旋律，音高 G3–E5 自然音，外加随机音、延音、休止；之后在整点报时、进出门（加速版）、第一次与每个角色对话（各自变奏）时到处响起，村民高兴时还会唱。创作量极小，回报遍布全世界。来源：[Nookipedia](https://www.nookipedia.com/wiki/Tune)

**补充** — Webfishing guitar：点品格定指型，可存 9 个和弦形，按住左键左右拖动就是下扫、上扫，也能键盘指弹。FFXIV Performance：C3–C6 共 37 个半音、24 种乐器；Ensemble Mode 用 ready check（15 秒）加节拍器起拍，并以“增加延迟”换全队同步——网络延迟的现成解法。来源：[xboxplay](https://xboxplay.games/webfishing/how-to-play-the-guitar-in-webfishing-58613)、[FFXIV wiki](https://ffxiv.consolegameswiki.com/wiki/Performance_Actions)

### 推荐移植

基座 Sea of Thieves：曲目模式同时解决“不会乐器”和网络延迟（各端按共享时钟播放预制分轨，不传实时音符）。嫁接键格做自由弹奏、TLOU2 和弦轮做吉他、Rust 的 MIDI 做进阶、town tune 做车喇叭。以下均为提案：

1. 每件乐器两种模式：**合奏**（第一人选曲主奏，其余人按一下加入伴奏）与**自由**。
2. 自由模式 15 键（3×5，键盘 QWERT / ASDFG / ZXCVB），默认锁在电台或环境音乐的调上。
3. 吉他：6 和弦轮 × 2 页，鼠标按住拖过 6 根弦扫弦，弹错照响。
4. 自由模式的远端音符统一延后约 120 ms 并吸附到八分音符。
5. 曲库首发 8 首：3 首随乐器赠送，5 首是路上的乐谱收藏。
6. Web MIDI 可用时把音符映射到最近的调内音；Safari 不支持，退回键盘。
7. 搞笑层：饿或冷时轻微走调；喇叭是 16 格 town tune；动物会围观。

## 2. 电台 / 共享音乐

**Euro Truck Simulator 2** — 两条路并存：把 MP3 放进“文档/Euro Truck Simulator 2/music”，车内播放器直接出现；网络电台是游戏文档目录下 `live_streams.sii` 里一行一个 `stream_data[]: "流地址|台名"`，另有在线更新的台表。R 键打开，标签页切换。1.60（2026-05-27）新增 Game Radio：5 个自带电台、显示歌名的小组件、给主播的免版权 Streamer Mode（据第三方补丁汇总）。妙处：玩家已有的音乐库就是内容。来源：[Gamepressure](https://www.gamepressure.com/eurotrucksimulator2/radio-and-music-player/z34618)、[patched.gg](https://patched.gg/games/euro-truck-simulator-2/160-update-game-radio)

**GTA V Self Radio** — 把非 DRM 的 MP3 / WMA / M4A 或其快捷方式放进 User Music 文件夹，设置里 Quick 或 Full Scan；三种模式 Sequential、Shuffle、Radio——Radio 会在歌曲间插入广告和 DJ 串词，私人歌单于是听起来像游戏世界里的电台。来源：[Rockstar 支持页（抓取超时，据搜索摘要）](https://support.rockstargames.com/articles/5L6IP5RzI8kQXyXCddPO2Z/how-to-play-custom-music-on-the-self-radio-station-in-gtav-and-gta-online-on-pc)

**Animal Crossing K.K. Slider** — 歌是收藏品：首发 98 首，2.0 后 110 首。周六晚现场点歌得 aircheck；标准曲在 Nook Shopping 卖 3,200 Bells；Animal City、Drivin'、Farewell 三首只能靠准确报出歌名点到。唱片放进音响家具播放，每首有独立封面可陈列。来源：[Nookipedia](https://nookipedia.com/wiki/K.K._Slider_song)

**Death Stranding** — 一代只能在 Private Room 的播放器里听已解锁的歌，歌随剧情出现后才解锁；路上的音乐何时响起由游戏决定——稀缺造就“音乐时刻”。二代才给随身播放器：完成 Order No. 11 后解锁，可建 3 个歌单，只要身在 Chiral Network 内就持续播放，任务音乐响起时淡出让位（另有来源称共 53 首，未核实）。来源：[Shacknews](https://shacknews.com/article/114886/how-to-play-music-youve-unlocked-in-death-stranding)、[Beebom](https://beebom.com/death-stranding-2-how-to-unlock-music-player/)

**实体音响** — Lethal Company boombox：商店 60 credits，放内置合成器曲目，电池 5 分 40 秒，音乐可用来引开怪物或纯粹在船上跳舞；自定义歌曲只能靠 mod 且全队都得装（据攻略摘要）。Rust Voice Props：Boom Box 播磁带（10 / 20 / 30 秒）和网络电台流，台表由服主用 `BoomBox.ServerUrlList` 追加，官方提醒主播在选项里关掉 Internet Audio Streams 以免 DMCA，Connected Speaker 可转播到全基地。Jalopy 的收音机机制未核实。来源：[Game8](https://game8.co/games/Lethal-Company/archives/438952)、[Rust 官方博客](https://rust.facepunch.com/blog/wounding-and-voice-props)

**浏览器可行性（已核实）**

- 本地文件：`decodeAudioData()` 解码 `fetch` 或 `FileReader` 得到的 ArrayBuffer，只收完整文件，自动重采样；2021-04 起各浏览器可用。[MDN](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData)
- 发给同伴：`createMediaStreamDestination()` 把 Web Audio 输出变成 MediaStream，可经 RTCPeerConnection 发给远端或录制；同样 2021-04 起可用。[MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaStreamDestination)
- Web MIDI：Chrome 43、Edge 79、Firefox 108 支持，Safari 不支持；Chrome 124 起整个 API 都要权限弹窗。[Chrome 博客](https://developer.chrome.com/blog/web-midi-permission-prompt)
- `getDisplayMedia` 音频：仅 Chromium 系（Chrome 74+）；Windows / ChromeOS 共享整屏可抓系统声音，Linux / macOS 只能抓标签页声音；Firefox、Safari 不支持。需 HTTPS 和用户手势，请求了也可能没有音轨。[MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)、[兼容性数据](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/MediaDevices.json)
- `getUserMedia` 音轨可设 `echoCancellation`、`noiseSuppression`、`autoGainControl`、`channelCount` 约束。[MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints)

### 推荐移植

基座 ETS2（零内容成本）；嫁接 GTA V 的 Radio 模式、K.K. Slider 的收藏、实体音响的位置感、Death Stranding 的音乐时刻、Rust 与 ETS2 的主播开关。以下均为提案：

1. 收音机槽三路音源：**自带磁带**（免版权，首发 12 盘，每个阶段地点可掉 1 盘，封面可挂车里）、**我的磁带**（选本地文件）、**Line-in 直播**。
2. 我的磁带：本机解码播放，同一路信号经 MediaStream 用 WebRTC 发给另外 1–3 人；文件不上传、不落盘。
3. Line-in：首选 `getUserMedia` 选虚拟声卡（DAW 输出），关掉回声消除、降噪、自动增益；没装虚拟声卡时，Chromium 可退而共享标签页或系统声音，Firefox、Safari 没有这条退路。音质与延迟需实测。
4. 点歌：每人队列里最多 1 首，切歌需过半同意。
5. 音源是仪表台上的一个定位声源，下车后变闷。
6. 每阶段最多 1 个音乐时刻：翻过垭口或抵达地点时自动推一盘磁带。
7. 一键主播模式：只播自带磁带。

## 3. 绘画 / 视觉创作

**Eastshade** — 在背包里选一块画布，用鼠标框出屏幕上要画的范围，按 E，画就出现在画架上；本质是“记录了取景内容的截图”，任务据此检查画里有没有某物、某地、某时段。画布要买，或用布料和木板自制；每幅画消耗 1 点 inspiration，靠发现新地点、完成任务、读书、喝茶补充——开发者用它替换了不断下降的生存条，因为后者惩罚“慢下来看风景”。NPC 委托不论构图一律接受，可同时开的委托数有上限。批评：没有“画得好不好”的度量，稀缺压制了随手画。来源：[bit-tech](https://bit-tech.net/reviews/gaming/pc/eastshade-review/1/)、[80.lv](https://80.lv/articles/eastshade-developing-a-game-about-art)、[评论文章](https://heterogenoustasks.wordpress.com/2019/05/15/eastshade-fantasy-without-crisis/)、[开发者访谈（搜索摘要）](https://www.gamerevolution.com/originals/494703-eastshade-developer-interview-danny-weinbaum)

**Animal Crossing custom designs** — 32×32 像素，每幅最多 15 色加透明；New Horizons 有 14 套预设调色板和完整 HSV 取色；1.9.0 起全岛共用 90 普通＋90 pro 槽位，Pro Editor 要 800 Nook Miles。关键在“到处能用”：衣服、伞、扇子、旗、立牌、地毯、墙纸、画、地面、家具改色；摆进 Able Sisters 后村民会穿；可上传 130 幅分享。来源：[Nookipedia](https://nookipedia.com/wiki/Custom_design)

**Chicory** — 颜料是数据不是位图：屏幕切成约 12×12 像素的格子，每格只存 0（未涂）或 1–4（该区域 4 种颜色之一），不混色；多人可同时在任何位置涂；要求每秒 60 次稳定更新；边缘用 Marching Squares 画成圆润色块。低分辨率加限色 = 便宜、好看、易同步。来源：[Game Developer](https://gamedeveloper.com/design/how-painting-works-in-chicory-a-colorful-tale)

**其他** — Passpartout 2：起手只有画架、圆刷、基础调色板，之后买蜡笔、粉彩、喷罐和方、圆、心形画纸；画架和售卖桌可摆在镇上任何地方，路人按一套不公开的规则点评并决定买不买；委托都带一个小故事，开发者说“小框架比无限自由更能激发创作”。SuchArt 未见官方联机（未核实）。Webfishing 粉笔：直接画在多人大厅的地面上（售价与可见范围未核实）。浏览器先例：Magma 同一画布免费 30 人、付费 50 人并显示实时光标；Drawpile 开源，有走 WebSocket 的网页端。`PointerEvent.pressure` 取值 0–1（鼠标按下固定 0.5），2020-07 起各浏览器可用，数位板压感可直接读。来源：[LadiesGamers](https://ladiesgamers.com/passpartout-2-the-lost-artist-review/)、[Game Developer](https://www.gamedeveloper.com/design/-i-passpartout-2-the-lost-artist-i-helped-its-developers-reignite-a-love-for-art)、[PC Gamer 转载（搜索摘要）](https://www.magzter.com/stories/puzzle-gaming/PC-Gamer/REEL-GOOD)、[Magma（搜索摘要）](https://www.magma.com/pricing)、[Drawpile（搜索摘要）](https://docs.drawpile.net/help/server/websocket)、[MDN](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/pressure)

### 推荐移植

基座 Eastshade 的取景成画（零绘画技巧，且与相机共用“取景＋元数据”）加 AC custom design 的“小画布、到处展示”；嫁接 Chicory 的限色低分辨率、Webfishing 粉笔、Eastshade 委托。以下均为提案：

1. 画布是工作台制品：2 木板＋1 布；三种尺寸 64×64、128×96、256×192。
2. **写生**：框选视野，引擎按当前 16 色调色板生成低分辨率画；耗 1 点灵感，每发现一个新地标得 1 点，上限 5。
3. **手绘**：鼠标或数位板，3 档笔粗；笔画以线段消息广播（每秒不超过 30 条），别人看着画架上的画一笔笔出现；不耗灵感。
4. 颜料是收藏：每种地貌出 1–2 种，共 16 色。
5. 展示位固定：车内 4 个画框、1 个画架、车身 1 块 128×128 涂装、衣服 32×32 徽章。
6. 地点 NPC 委托“画里要有湖和黄昏”，用取景元数据判定，奖励颜料或蓝图。

## 4. 蓝图 / 解锁进度

**Raft** — 主线靠一台 Receiver 加 3 根 Antenna：Receiver 蓝图从漂来的桶里捞到，在 Research Table 学会后制作（8 Planks、6 Plastic、4 Scrap、2 Circuit Board）；每根天线 4 Scrap＋1 Circuit Board，须各占一格地基、彼此及与 Receiver 至少隔一格、头顶无遮挡；装上 Battery 后屏幕上的光点指向第一站 Radio Tower，之后靠在各站找到的四位码指向下一站，各站另给新蓝图。Research Table：每种材料放进去研究一次（被消耗），某配方的原料全都研究过就解锁——1 皮＋1 羊毛即可解开三件皮甲（据攻略摘要）。各地点完整蓝图清单未核实。来源：[天线攻略](https://www.ludo.guide/guide/raft/radio-tower/crafting-receiver-antennas)、[Receiver 蓝图（搜索摘要）](https://raft.fandom.com/wiki/Blueprint:_Receiver)、[Research Table 攻略（搜索摘要）](https://primagames.com/tips/how-to-use-the-research-table-in-raft)、[Game Rant](https://gamerant.com/raft-blueprints-guide/)

**Subnautica** — 扫描残骸碎片攒蓝图：Seamoth 3 片、Prawn Suit 4 片、Cyclops 9 片（船体、引擎、舰桥各 3 片，每凑齐一组进度＋33%）；解锁后再扫碎片给 2 个 Titanium（Cyclops 片数与此条据搜索摘要）。升级槽：Seamoth 4、Prawn Suit 4＋2 个机械臂槽、Cyclops 6；深度模块把极限从 200 / 900 / 500 m 提到 900 / 1700 / 1700 m。救生舱电台修好后陆续来讯，触发条件各异（时间、到过某区、造了某物）并带间隔，把玩家引向有关键碎片的地点（社区资料，未见官方出处）。来源：[wikily](https://wikily.gg/subnautica/vehicles)、[ConsolePulse](https://consolepulse.com/multiplatform/subnautica/guides/subnautica-vehicles-guide-seamoth-prawn-suit-cyclops)、[Steam 讨论](https://steamcommunity.com/app/264710/discussions/0/4358997482563482860)

**Animal Crossing DIY** — 来源多而每日限量：海滩漂流瓶每天 1 个；村民在家做手工时搭话可得配方，每天最多 3 个（95% 与其性格相关）；另有气球、商店、Nook Miles、季节与节日、钓到垃圾或攒够某物后自动领悟。来源：[Nookipedia](https://nookipedia.com/wiki/DIY_recipe)

**Dredge** — 两层。其一：5 个区域各有 1 件 relic，交给 Collector 后按**交付数量**发能力——第 1 件 Haste、第 2 件 Manifest、第 3 件 Banish、第 4 件 Atrophy、第 5 件结局；先去哪个区域随玩家。其二：Research Parts（疏浚、商人 350 美元、任务、沉船）在任意码头研究鱼竿、引擎、蟹笼、拖网，研究完才上架；本体全部装备共需 62 个。来源：[Relic](https://dredge.wiki.gg/wiki/Relic)、[Research Part](https://dredge.wiki.gg/wiki/Research_Part)

**Outbound**（2026-05-11 发售，最接近的竞品）— 捡垃圾 → Recycler 出 Download Voucher → signal tower 每次给 2–3 张蓝图选 1 张（首座免费，之后每张 1 券），没选的回池；少数关键配方固定在特定地点。评测（部分据搜索摘要）：共享一辆车的联机最好玩；长途驾驶拖沓，停车采集打断节奏，一人开车一人采集时才顺。来源：[allthings.how](https://allthings.how/outbound-crafting-explained-blueprints-vouchers-and-van-workstations/)、[player2](https://www.player2.net.au/2026/06/outbound-review-base-building-that-comes-with-you/)

**其他** — Zelda BotW：Great Plateau 四座神庙各给 1 个 rune（Remote Bomb、Magnesis、Cryonis、Stasis），四座全通才能离开；每个能力都让同一片地形多一种读法（开发者访谈未能抓取）。7 Days to Die：Alpha 21 起 Learn by Reading，23 项制作技能对应 23 种杂志，读一本涨对应技能，到一定等级解锁配方与品质档，部分技能 100 级；每级所需本数未核实。来源：[Wikipedia](https://en.wikipedia.org/wiki/Great_Plateau)、[7DTD wiki](https://7daystodie.wiki.gg/wiki/Learn_by_Reading)

### 推荐移植

基座 Dredge 的“路线自由、发放顺序固定”（内容可线性制作，玩家仍有选择）加 Raft Receiver 作为“下一站在哪”的车内实体；嫁接 Subnautica 3 碎片、Outbound 三选一、Raft Research Table、AC 的每日限量。以下均为提案：

1. 阶段终点按**到达次序**发主礼（第 N 站必给第 N 件），去哪一站由玩家选。
2. 奇数站给成品套装，偶数站给蓝图；蓝图拆成 3 片，2 片在途中，第 3 片必在终点。
3. 车载电台即 Receiver：1 根天线只显示 1 个目的地，2 根可二选一，3 根额外显示沿途发现点。
4. 沿途中继塔：1 张券从 3 张副蓝图里选 1，未选回池；副蓝图池 40 张。
5. 工作台：每种新材料投入 1 个，凡原料全部“见过”的配方自动显形。
6. NPC 每天最多教 3 个配方；每晚营地有 1 个漂流瓶式随机配方。
7. 主礼 12 件、约 5 小时铺完，之后转入副蓝图与收藏。

## 5. 有约束的家

**Outbound** — “在车里和车顶上”用模块件建造，可折叠以便行驶；能源来自太阳、风、水，受天气影响；最多 4 人联机，共用一辆车、仓库和建造权限（后半句据搜索摘要）。评测最夸“在车顶盖出一栋房子”；Steam 好评率 73%（1,893 条）。功率数值未核实。来源：[Steam](https://store.steampowered.com/app/2681030/Outbound/)、[Game8](https://game8.co/articles/reviews/outbound-gameplay-and-story-info)

**Valheim comfort** — Rested 时长 = 7 分钟＋每点 comfort 1 分钟；家具只在 10 m 内生效，**每个类别只算最高的一件**（火、床、座椅、桌、地毯、旗帜、灯、浴缸等），堆同类没用，必须种类齐全；上限 22（加两件季节装饰 24），即 29 / 31 分钟。Rested：生命回复＋50%、耐力回复＋100%、技能经验＋50%；需在火堆范围内安静休息 20 秒，露天只有 1 点 comfort。把“像不像家”换算成出门后的实际好处。来源：[space-node 指南](https://space-node.net/blog/valheim-comfort-guide-1-0-2026)

**RDR2 camp ledger** — 第二章解锁，先往捐款箱捐钱才能买。固定清单 16 项：Lodging 三档 $220（其他成员捐得更多）、$325（解锁快速旅行）、$300；弹药 $60 / $90 / $110；食物 $30 / $45 / $55；药品 $30 / $50 / $75；Leather Working Tools $225（解锁背包制作）；Chicken Coop $175；Horse Station $300；Boat $360（另一站称 $450）。逐项相加约 $2,450。清单短，每项有看得见的营地变化和一个功能。来源：[rdr2.org](https://www.rdr2.org/guides/camp-upgrades-guide/)

**Death Stranding** — Auto-Paver 要 Chiral Crystals、Metals、Ceramics 三种料，可分次捐、捐多少算多少，凑齐自动铺路；联网时别人的投入算进同一台并有通知；建筑会被 timefall 侵蚀。Likes 只有正向、没有踩（据搜索摘要）；小岛原话“给 like 就是给无条件的爱”，团队曾主张改成积分被他否决。一代每台用料未核实；二代攻略列一台需 Chiral Crystals 1,000、Metals 500、Ceramics 800，另有攻略称 45 m 桥需 800 Metals（后者据搜索摘要）。来源：[Push Square](https://pushsquare.com/guides/death-stranding-how-to-build-roads)、[Game Informer](https://gameinformer.com/2019/09/16/likes-in-death-stranding-are-unconditional-love-not-currency)、[Game8 二代铺路](https://game8.co/games/Death-Stranding-2-On-the-Beach/archives/532915)、[GamingBolt](https://gamingbolt.com/death-stranding-2-guide-how-to-build-structures-and-farm-materials)

**Animal Crossing 房贷** — 5,000 Nook Miles 的帐篷 → 98,000 → 198,000 → 348,000 → 548,000 → 758,000 → 1,248,000 → 2,498,000 Bells（七笔合计 5,696,000）；房间 4×4 → 6×6 → 8×8 → 加三间 6×6 → 二楼与地下室 10×6；储物 80 → 1,600 格，之后六次扩容到 9,000 格。还清后外观改造免费。每一笔都对应一个看得见的空间变化。来源：[Nookipedia](https://nookipedia.com/wiki/Loan)

**Stardew Valley Community Center** — 6 个房间 30 个 bundle；每个 bundle 是一组主题物品，整间交齐当晚 Junimo 过场给大奖：Crafts Room 修桥通 Quarry，Pantry 修好 Greenhouse，Fish Tank 移走闪光巨石，Boiler Room 修好 Minecart，Vault（2,500 / 5,000 / 10,000 / 25,000 g 四档）修好巴士通沙漠。Bulletin Board 奖励未核实。来源：[官方 wiki（拒绝抓取，据搜索摘要）](https://stardewvalleywiki.com/Bundles)

### 推荐移植

基座 RDR2 ledger（短清单、固定位置、每项一个功能）——正好等于“固定槽位”；用 Stardew bundle 的形式收料，用 Death Stranding 的方式多人分摊，用 Valheim comfort 给“像家”一个数值回报，用 AC 房贷做长线。以下均为提案：

1. 首辆车 8 个槽：灶台、冰箱、储物、床、工作台、收音机、缝纫机、娱乐位；每槽 3 档。
2. 每档是车内账本上的一个 bundle：3–4 种材料；任何人随时投任意数量，账本记名。
3. 完成时全员过场，该槽模型换新；队友可对贡献点赞（只有赞）。
4. Comfort：每个已建类别＋1（三档＋2），装饰类（地毯、灯、植物、画、照片）各＋1，同类只算最高，上限 12。
5. 在车里坐或躺 20 秒得“安逸”：时长 5 分钟＋comfort × 1 分钟，饥饿与体温消耗 −20%。
6. 换车是三笔无息无期限“贷款”（小车 → 越野车 → 房车），槽位 8 → 10 → 12。
7. 不做电力系统；改装只留发动机、散热、轮胎。

## 6. 服装 / 缝纫

**Zelda BotW** — 头、身、腿三件；Cold Resistance 最高 2 级，Warm Doublet 提供低档御寒，Hebra 和 Gerudo Highlands 要 2 级——靠多件叠加，或吃辣味料理代替；Snowquill 整套升到 2 级附带 Unfreezable 套装效果。Kochi Dye Shop：20 Rupees＋5 个同色素材，把当前整套染成该色（Zelda Wiki 列 15 种染料，含续作）。衣服既是进新区域的“钥匙”，又是搭配游戏。来源（wiki 拒绝抓取，据搜索摘要）：[Cold Resistance](https://zeldawiki.wiki/wiki/Cold_Resistance)、[Dye](https://zeldadungeon.net/wiki/Dye)

**Animal Crossing Able Sisters** — 每天各上架 1 件：连衣裙、上衣、下装、鞋、饰品、帽子，外加 8 个预制图案和 2 套整装；试衣间可试穿并购买，包括没摆出来的款式；所见价格 560–6,720 Bells。玩家的 custom design 挂在店里，村民会穿。纯表达，没有数值。来源：[Nookipedia](https://nookipedia.com/wiki/Able_Sisters)

**其他** — Winter Burrow：小老鼠在扶手椅上织毛衣，毛皮纺成毛线，织出的帽子、外套、毛衣、裤子穿着即被动御寒；体温归零是昏倒后在家醒来而不是死亡（据攻略摘要；具体数值未核实）。7 Days to Die 1.0 把零散衣物换成带套装效果的 armor set；套数与温度是否仍起作用，来源互相矛盾（未核实）。Outbound 的 Sewing Table（5 Fiber）做布制品并解锁背包与储物升级。来源：[PC Gamer](https://www.pcgamer.com/games/survival-crafting/in-this-cozy-survival-game-youre-a-mouse-who-knits-tiny-wool-sweaters-bakes-pies-for-his-friends-lives-in-a-furnished-tree-trunk-and-i-cant-even-go-on-because-its-so-darn-cute)、[7d2d wiki](https://wiki.7d2d.net/basics/armor-and-clothing-system.html)、[allthings.how](https://allthings.how/outbound-crafting-explained-blueprints-vouchers-and-van-workstations/)

### 推荐移植

基座 BotW：三槽、每件 1 级、极端区域要 2 级、料理可顶 1 级、染色便宜。嫁接 AC 的 32×32 图案与“挂出来给人看”、Winter Burrow 的“坐着织”和温和失败。以下均为提案：

1. 三槽（头 / 身 / 腿）；每件带 0–1 级御寒、防暑或防雨之一。
2. 区域需求 0 / 1 / 2 级；差 1 级时对应消耗 × 2，不直接掉血；归零是昏倒后在车里醒来。
3. 热汤等料理临时＋1 级 5 分钟，把做饭和穿衣连起来。
4. 缝纫机首发 6 套 × 3 件 = 18 件，每件 3–5 份布、皮或线；乘客在行驶中可缝，30–60 秒一件。
5. 染色：5 个同色材料染一整套，首发 12 色，颜料与绘画共用。
6. 外套背面 1 个 32×32 徽章位；车内 1 个衣架展示位。

## 附：未能直接抓取的来源

- 返回 402：Fandom 系 wiki（Sky、Raft、Subnautica、Death Stranding、Eastshade）。
- 返回 401 / 403：raft.wiki.gg、zeldawiki.wiki、zeldadungeon.net、stardewvalleywiki.com、techraptor、shockbyte、gamerevolution。
- 正文被截断或超时：PC Gamer 多篇、Rockstar 支持页。
- 没有绕过任何校验；上述条目只引用了搜索引擎返回的摘要，用到数字前建议在游戏内或原页面复核。
