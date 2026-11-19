# 地形、公路与生态：L 节点调研报告

调研日期 2026-11-18。服务于 `docs/V3/nodes/L-landscape.md`（景观 2.0）。同目录的 `landscape-params.md` 把这里的数字整理成了可直接写进数据的表。

## 0 怎么读这份报告

**目的。** 用户觉得游戏里的地形太平，希望大约每 10 分钟开出一个截然不同、又有地理生态道理的场景。本报告收集真实世界的数字和关系：地形有多大、名路怎么爬山、植被和动物在什么海拔与气候出现、过渡带有多宽，再在第 4 节给出（明确标为建议的）场景配方和旅程顺序。

**方法。**
- 维基百科：用接口成批取回约 500 个条目（498 个）的原文（地形、地点、公路、生物群系、生态区、树种、花、动物、夜间现象），在本机抽出带数字的句子和表格。引用的是条目本身。
- 官方或权威原文：中国交通运输部《公路路线设计规范》JTG D20—2017 英文版、印度道路协会 IRC:52-2019《山区公路》（两份 PDF 都在本机提取了文字）、美国国家公园管理局（NPS）萤火虫页、美国环保署（EPA）能见度页、维基百科坐标与海拔。
- 搜索引擎摘要：少数数字只来自搜索结果对网页的摘要，没有逐页打开核对，标 †。
- 联合国教科文组织（UNESCO）世界遗产页和美国地质调查局（USGS）沙丘页拒绝了自动访问（403），没有用上。

**标记。**
- `[A3]` 这类编号：引文出处，每节末尾有编号清单。
- †：搜索摘要来源，用前最好复核。
- ≈算：本报告根据所引数据推算的数。
- 【综合】：本报告把多条来源归纳在一起的描述，比如沿路的地形–生态序列。
- 【建议】：给游戏的设计建议，不是事实。第 4 节整节都是建议。

**覆盖了什么，没覆盖什么。** 这是一份有代表性的选集：约 50 类地形（分 11 组）、46 条公路（第 2 节逐条写，其中约 10 条较简短）、WWF 的 14 个陆地生物群系、9 组山地垂直带谱、84 个树种、24 种花与地被、41 种鸟兽鱼、十几种夜间现象。它不是“地球上全部地形”，也没有覆盖海洋、洞穴内部、城市景观、农业景观的细节；热带非洲和南美的公路生态、热带河鱼、昆虫多样性只碰到皮毛。没查到的东西列在第 6 节。

**最要紧的三条（详见第 4 节）。**
1. 尺度。真实的“壮阔”来自路旁 1–5 km 内 900–1,600 m 的高差：优胜美地谷底约 1.6 km 宽、两壁 914–1,067 m [A21]；松恩峡湾内段两岸山高约 1,600 m [A32]；贡嘎山从大渡河谷到峰顶 29 km 内高差 6,400 m [A31a]。驾驶员看墙顶的仰角是 30–60°。而 30–100 km 外的大雪山只占 1–5° 的仰角（≈算，见 4.3），层次感来自几道山脊的间距加上空气透视让对比度按指数衰减 [C5]。
2. 爬山的路是“叠弯 + 长缓坡”。规范的发卡弯半径只有 14–40 m，弯上纵坡 2.5–4.5%，两弯之间至少 60–200 m [B97][B98]；名路整段平均 7–8%（Stelvio 北坡 48 个弯，平均约 7.4%，每弯约升 38 m ≈算 [B5][B6]†）。一组 6–20 个弯就能爬 300–800 m，组与组之间放长缓坡，既壮观又不会一路紧张。
3. 生态有规则可循。林线在 30°N–20°S 之间大致恒定在 3,500–4,000 m，往北每 1° 纬度降 75–130 m，海洋性气候再低几百米、大陆内部高几百米；雪线比林线高 300–1,000 m；气温每升 1 km 降约 6.5 °C [C2][C3][C1]。带谱的顺序（阔叶 → 混交 → 暗针叶 → 落叶松、石松、桦的矮曲林 → 高山草甸 → 碎石与雪）在各大山系都相似，只是高度不同。

---

## 1 地形地貌

每组一张表。“怎么形成”一栏取自同类地形的维基百科条目（表中对应编号，以及本节来源末尾的 [A109]–[A122]）；“尺度”一栏每个数字都带出处；“气候与植被”一栏有编号的是来源，没有编号的是【综合】；“在路上看起来”一栏全是【综合】。更紧凑的数字表见 `landscape-params.md` 的 P1。

### 1.1 山地

| 地形 | 怎么形成 | 尺度 | 实例 | 常见气候与植被 | 在路上看起来【综合】 |
|---|---|---|---|---|---|
| 褶皱山 · 阿尔卑斯型（fold mountains） | 板块挤压使岩层褶皱、逆冲，冰川再雕刻 | 阿尔卑斯长 1,200 km、宽 250 km，最高 4,810 m [A1]；大北壁 450–1,500 m [A2]；角峰坡 45–60° [A3]；扎格罗斯长 1,600 km、宽 240 km [A4]，褶皱波长约 10 km†、背斜常长 100 km 以上† [A5][A6] | 阿尔卑斯、扎格罗斯 | 从阔叶林到冰雪的完整带谱（第 3.3 节） | 路沿纵谷走，靠垭口或横切峡谷翻越；平行山脊一层层排开 |
| 侏罗型褶皱山（Jura） | 较缓的褶皱，背斜成岭、向斜成谷 | 最高 1,720 m [A7] | 侏罗山 | 温带森林与草场 | 平行长岭，起伏温和 |
| 层状火山（stratovolcano） | 熔岩与火山灰交替堆积成陡锥 | 富士山 3,776 m，火口直径 780 m、深 240 m，东京晴天可见 [A8] | 富士山、乞力马扎罗 | 随海拔变化；山顶寒冷 | 平原上孤立的完美锥体，几十到一百公里外就能看见 |
| 火山渣锥（cinder cone） | 气体丰富的岩浆喷出碎屑，堆在火口周围 | 坡 30–40°，底近圆 [A9]；高几十到几百米，很少超过约 300 m†；帕里库廷 424 m† [A10] | 冰岛、墨西哥 | 多在火山区，植被稀 | 熔岩原上一串规整的小锥 |
| 盾状火山（shield） | 流动性大的玄武岩一层层铺开 | 墨西哥 Michoacán 平均高 340 m、宽 4.1 km、坡 9.4°；加州/俄勒冈直径 5–6 km、高 460–610 m [A11] | 夏威夷、冰岛 | — | 宽而缓的穹，几乎感觉不到在爬山 |
| 破火山口（caldera） | 岩浆房掏空后顶部塌陷 | Crater Lake 8 × 9.7 km，火口缘 2,130–2,440 m，湖深 594 m [A12] | Crater Lake | 针叶林、冬季大雪 | 绕火口缘的环路，一侧是深蓝湖面 |
| 玛珥 · 凝灰岩环（maar） | 岩浆遇水爆炸形成浅而宽的火口 | 直径 20–3,000 m、深 5–200 m [A13]；Hverfjall 直径约 1 km [A14] | 艾费尔、冰岛 | — | 低矮环形土丘，常有火口湖 |
| 断块山 · 地垒地堑（horst, graben） | 地壳拉张，断块一升一降 | 盆岭区山与盆各长 50–200 km、宽 20–30 km，高差 1–3 km†，约 400 列山† [A16][A17]；Canigó 山块 7 km 内升高 2,000 m 以上 [A15]；内华达山脉从中央谷地约 150 m 向东缓升，80–120 km 后到达 4,267 m 以上的主脊，山脉宽 80–130 km [A18] | 美国盆岭区、内华达山脉 | 半干旱，山上有林、盆地是荒漠 | 长直路横穿平坦盆地，再越过一道山，如此反复 |
| 花岗岩巨壁与穹丘（domes） | 深成岩出露后层层剥落 | El Capitan 壁高约 914 m [A19]；Half Dome 顶 2,696 m，从谷底徒步要升约 1,460 m [A20] | 优胜美地 | 混交针叶林 | 谷口的“门”：两侧巨壁夹住视线 |

### 1.2 冰川地貌

| 地形 | 怎么形成 | 尺度 | 实例 | 气候与植被 | 在路上看起来【综合】 |
|---|---|---|---|---|---|
| U 形谷（U-shaped valley） | 冰川把河谷刨宽刨深 | 优胜美地谷长 12 km、宽约 1.6 km，壁高 914–1,067 m [A21]；劳特布伦嫩壁高可达 1,000 m，谷壁长 8 km [A22]；Glen Coe 长 12.5 km、谷底不到 700 m 宽 [A23]；因河谷两侧肩台只高出谷底 100–200 m [A24]；谷底冰蚀湖可深 453–514 m [A25] | 优胜美地、劳特布伦嫩、Glen Coe | 谷底草甸与河滩，谷壁下部森林、上部岩壁 | 平坦谷底的缓路，两侧墙仰角 30–60°，瀑布挂在墙上 |
| 悬谷与瀑布（hanging valley） | 支流冰川刨得浅，主谷刨得深，支谷“悬”在半空 | 优胜美地瀑布总落差 739 m [A21]；Staubbach 297 m [A22]；华严瀑布 97 m [A106] | 同上 | — | 墙上的白线，雨后更多 |
| 冰斗 · 刃脊 · 角峰（cirque, arête, horn） | 冰川在山腰挖出圈椅状洼地；两侧挖深后剩下锋利山脊和尖峰 | 冰斗三面以上是峭壁，靠近粒雪线 [A26]；刃脊夹在两条平行 U 谷之间 [A27]；角峰坡 45–60° [A3]；马特洪峰 4,478 m [A28] | 阿尔卑斯 | 高山带以上 | 垭口附近抬头可见的尖峰与锯齿山脊 |
| 冰碛垄（moraine） | 冰川推挤、堆积的碎石垄 | 侧碛高出谷底可达 140 m、长可达 3 km，外坡 29–36°（近冰处可达 80°）；de Geer 碛高 ≤ 5 m、宽 10–50 m；搓板碛高 1–2 m、间距约 100 m [A29] | 冰川谷 | 碛垄上先长先锋灌木 | 冰川末端的灰色长堤，路常从堤上翻过 |
| 冰川（glacier） | 积雪压实成冰，在重力下流动 | 冰厚 ≥ 30 m 才开始流动；流速典型约 1 m/天；裂隙多不到 46 m 深 [A30]；海螺沟冰瀑高 1,080 m、宽 500–1,100 m，冰舌长 5.7 km、末端 2,980 m，伸进峨眉冷杉林 5.3 km [A31] | 海螺沟、哥伦比亚冰原 | 冰舌两侧可以是茂密针叶林 | 从路上看到的冰舌与冰瀑，蓝白色 |
| 峡湾（fjord） | 冰川刨出的深谷被海水淹没 | 松恩峡湾长 205 km、宽 4.5–6 km、最深 1,308 m，约 100 km 长的一段深过 1,000 m；口部门槛约 100 m；两岸山外段约 500 m、内段约 1,600 m [A32]；盖朗厄尔峡湾长 15 km、宽 1.5 km，岩壁几乎直接从水里立起 [A33]；挪威约 1,200 条峡湾 [A34] | 挪威、新西兰峡湾地区 | 湿润，岸边落叶与针叶林、上部高山 | 沿山腰的阳台路，下方是深色海水 |
| 鼓丘（drumlin） | 冰川底部塑造的流线形小丘 | 长 250–1,000 m、宽 120–300 m；冰岛一组高 5–10 m [A35] | 北美、欧洲冰碛平原 | 草场、农田 | 成群的低矮鲸背丘，适合“起伏丘陵” |
| 蛇形丘（esker） | 冰下河道沉积的蜿蜒长垄 | 高 15–27 m，可长达 200 km [A36] | 爱尔兰 | 常有松林 | 路沿着垄顶走，两侧是湖和沼泽 |

### 1.3 丘陵、高原与台地

| 地形 | 怎么形成 | 尺度 | 实例 | 气候与植被 | 在路上看起来【综合】 |
|---|---|---|---|---|---|
| 岛山（inselberg） | 周围岩石被侵蚀掉后剩下的坚硬岩体 | 乌鲁鲁高出平原 348 m、周长 9.4 km，Kata Tjuta 在 25 km 外 [A37]；Monadnock 高出周围约 610 m [A38] | 乌鲁鲁 | 干旱、半干旱 | 平原尽头几十公里外就能看到的孤丘 |
| 高原（plateau） | 大面积抬升而少褶皱 | 青藏内部 4,000–5,000 m 以上，北缘陡降到塔里木盆地 1,000–1,400 m，东西 2,500 km、南北 1,000 km [A39]；科罗拉多高原 1,500–3,350 m [A40]；黄土高原多在 1,250–2,000 m [A41] | 青藏、科罗拉多、黄土 | 青藏多高寒草甸、草原 | 爬上边缘后长时间的平坦与辽阔 |
| 黄土（loess） | 风积粉尘，能直立成崖 | 黄土厚 100–300 m；黄土高原 635,000 km² [A42]；年均温 8–14 °C [A41]；黄土能形成直立的崖 [A43] | 黄土高原 | 温带季风边缘，植被稀 | 千沟万壑、直立土崖、窑洞 |
| 桌状山 · 孤丘 · 平顶山（mesa, butte, tepui） | 顶部坚硬岩层保护下的残留台地 | 纪念碑谷最大孤丘高出谷底 305 m，谷底海拔 1,524–1,829 m [A44]；平顶山崖高可达 1,000 m，海拔 1,000–3,000 m [A45]；罗赖马顶面长 10 km、宽 5 km，山脚雨林树高 25–45 m [A46] | 纪念碑谷、委内瑞拉平顶山 | 荒漠或热带雨林 | 长直路通向一排红色孤丘 |
| 单面山（cuesta） | 倾斜岩层一面缓坡、一面陡崖 | 例：倾角 7.6 m/km [A47] | 尼亚加拉陡崖 | — | 一侧缓缓升起，另一侧突然断成崖 |

### 1.4 平原与谷地

| 地形 | 怎么形成 | 尺度 | 实例 | 气候与植被 | 在路上看起来【综合】 |
|---|---|---|---|---|---|
| 冲积平原 · 泛滥平原 | 河流泛滥沉积 | 起伏很小、持续微倾 [A48]；一般每 1–2 年漫滩一次 [A49] | 大河中下游 | 农田、河岸林、湿地 | 远处地平线上有山时最好看 |
| 草原 · 山间盆地（steppe） | 半干旱，草本为主 | 草与灌木为主 [A50]；巴音布鲁克盆底 1,500–2,500 m、东西 270 km、南北 136 km，四周山 > 3,000 m，有高寒草甸与沼泽 [A51] | 呼伦贝尔、巴音布鲁克 | 草甸草原 | 一望无际、云影在草上移动 |
| V 形谷 · 峡谷（canyon, gorge） | 河流下切快于两侧坡面后退 | 虎跳峡长约 15 km、最窄 25 m，江面到峰顶约 3,790 m，峭壁 2,000 m [A52]；雅鲁藏布大峡谷平均深 2,268 m、最深 6,009 m [A53]；大峡谷长 446 km、宽可达 29 km、深 > 1,857 m [A54]；太鲁阁国家公园 44.7% 的面积坡度超过 55% [A55] | 虎跳峡、太鲁阁 | 峡谷底部常比山上暖湿 | 路凿在峭壁上，一侧墙、一侧空 |
| 裂谷（rift valley） | 板块张裂，中间下陷 | 东非裂谷每年张开 8–9 mm [A56]；贝加尔湖是裂谷湖 [A57]（宽度本次未查到） | 东非、贝加尔 | — | 宽阔谷底两侧是长长的断崖 |

### 1.5 喀斯特

| 地形 | 怎么形成 | 尺度 | 实例 | 气候与植被 | 在路上看起来【综合】 |
|---|---|---|---|---|---|
| 峰林 · 峰丛（tower and cone karst） | 石灰岩被雨水溶蚀；峰丛在缓慢抬升与侵蚀中演化成峰林 | 漓江峰林中央盆地高 30–80 m，近峰丛处可达 300 m；江面从桂林 141 m 降到阳朔 103 m；漓江长 164 km [A58][A59] | 桂林–阳朔、万峰林 [A64] | 亚热带季风，高温多雨 [A59] | 江边平地上一座座独立石峰，远处层层叠叠变淡 |
| 砂岩峰林（Wulingyuan） | 石英砂岩沿节理被切割 | 3,000 多根石柱，许多超过 200 m；保护区 26,400 ha [A60] | 张家界 | 森林覆盖高 | 雾中的石柱森林 |
| 天坑 · 漏斗 · 坡立谷 | 洞穴塌陷；溶蚀洼地连成平底大盆 | 天坑深、宽一般 > 250 m [A61]；坡立谷 5–400 km²，Livanjsko 长 60 km、宽 7 km，雨季常成湖 [A62] | 武隆 [A63]、巴尔干 | — | 山间突然出现的平底田野 |
| 丹霞（Danxia） | 红色砂砾岩的陡崖与方山 | 中国丹霞世界遗产 82,151 ha [A107] | 中国东南 | 亚热带常绿林 | 红崖与绿林对比 |

### 1.6 荒漠

| 地形 | 怎么形成 | 尺度 | 实例 | 气候与植被 | 在路上看起来【综合】 |
|---|---|---|---|---|---|
| 沙丘（dunes） | 风搬运沙粒，在背风坡滑落 | 新月丘高 9–30 m、底宽约 370 m，落沙坡 30–35°，年移 1–100 m [A66]；鲁卜哈利纵丘近 200 km 长、> 300 m 高 [A65]，沙丘高可达 250 m [A67]；巴丹吉林星状丘可达 500 m [A65]，一般 200–300 m [A70]，必鲁图峰高出周围约 450 m [A69]；纳米布许多 > 200 m，最高约 325 m [A68]；塔克拉玛干新月丘脊距 > 3 km [A65]，金字塔形沙丘高约 300 m [A71]；世界最高约 1,230 m [A65] | 纳米布、巴丹吉林、塔克拉玛干 | 年降水：巴丹吉林 50–60 mm、年均 7–8 °C [A70]；塔克拉玛干 < 100 mm、蒸发 2,500–3,400 mm [A71] | 远处起伏的金色波浪，近处光滑的沙脊与锋利阴影线 |
| 砾漠（reg） | 细粒被风吹走，留下砾石铺面 | 多在冲积扇顶、低坡 [A72] | 撒哈拉、戈壁 | 极干 | 黑色平坦砾石原，天地之间只有路 |
| 干盐湖 · 盐滩（playa, salt flat） | 内流湖蒸干 | 乌尤尼 10,582 km²、海拔 3,663 m、平均 126 × 84 km [A73]；邦纳维尔 19 × 8 km，中心盐壳约 1.5 m [A74]；茶卡盐湖 3,059 m [A75] | 乌尤尼、茶卡 | 高原或盆地荒漠 | 镜面般白色平地，雨季映天 |
| 劣地（badlands） | 软岩被密集冲沟切割 | 坡陡、少植被，沟网密度 48–464 km/km² [A76]；美国劣地国家公园最高 1,018 m [A77] | 南达科他 | 半干旱 | 彩色条纹的锯齿状小丘 |
| 雅丹（yardang） | 风蚀把软沉积切成与风向平行的长垄 | 中型高几米、长 10–15 m；巨型长几公里、高几百米 [A78]；卢特沙漠垄长 > 150 km、高可达 75 m，地表最高温 70.7 °C [A79]；中国雅丹土墩多 10–30 m [A80] | 卢特、敦煌 | 极干 | 像舰队一样排列的土墩，“魔鬼城” |

### 1.7 海岸

| 地形 | 怎么形成 | 尺度 | 实例 | 气候与植被 | 在路上看起来【综合】 |
|---|---|---|---|---|---|
| 海崖（sea cliff） | 波浪掏蚀崖脚，上部崩落 | 莫赫断崖连绵 14 km，高 120–214 m [A81]；埃特雷塔崖高可达 90 m，针石 70 m [A82]；大苏尔背后的圣卢西亚山脉 > 1,760 m [A108] | 莫赫、大苏尔 | 海洋性或地中海气候 | 路在崖顶或崖腰，海在下方几十到几百米 |
| 海蚀柱与海蚀拱（stack, arch） | 岬角被打穿成拱，拱顶塌落成柱 | 十二门徒柱高可达 50 m，2005 年一根倒塌后剩 8 根 [A83]；鲍尔斯金字塔 562 m [A84]；仙人桥跨度约 122 m [A85] | 大洋路 | — | 海面上排成一列的石柱 |
| 海滩（beach） | 波浪堆积沙砾 | 最长的 100–240 km [A86] | — | — | 长长的弧形沙岸，路沿沙丘后侧走 |
| 里亚式海岸（ria） | 河谷被海水淹没，呈漏斗形、树枝状 [A87] | — | 西班牙加利西亚，岸上多松树和桉树 [A88] | 湿润 | 一湾接一湾，路绕着湾头转 |
| 三角洲（delta） | 河流入海沉积，常呈三角形 [A89] | — | — | 湿地 | 平坦、水网 |
| 障壁岛（barrier island） | 与海岸平行的狭长沙岛 | 外滩群岛约 322 km [A90]；帕德雷岛 182 km [A91] | 北卡外滩 | — | 两侧都是水的细长路 |
| 礁岛岩岸（skerries） | 冰川打磨过的低矮岩礁 | 大西洋海滨公路 8.3 km 跨 8 座桥，最长 260 m、桥下净空最高 23 m（见 2.1） | 挪威西海岸、罗弗敦 | 无树、强风 | 桥在海上起伏 |

### 1.8 火山原与玄武岩

| 地形 | 怎么形成 | 尺度 | 实例 | 气候与植被 | 在路上看起来【综合】 |
|---|---|---|---|---|---|
| 熔岩原 · 裂隙火山（lava field） | 裂隙喷发出大片玄武岩 | 1783 年拉基裂隙喷出 14 km³ 玄武岩，熔岩喷泉高 800–1,400 m [A92] | 冰岛 | 苔藓、地衣慢慢覆盖 | 黑色或灰绿色起伏乱石原，路像一条细线 |
| 柱状节理（columnar basalt） | 厚层熔岩冷却收缩成多边形柱 | 柱高可达 30 m、柱径几厘米到 3 m；层云峡连续 24 km；魔鬼塔高 382 m [A93]；巨人堤柱高约 12 m [A94] | 巨人堤、层云峡 | — | 峡谷两侧的“管风琴”岩壁 |

### 1.9 冰缘与苔原

| 地形 | 怎么形成 | 尺度 | 实例 | 气候与植被 | 在路上看起来【综合】 |
|---|---|---|---|---|---|
| 冰核丘（pingo） | 永冻土中冰体膨胀顶起的小丘 | 高 3–70 m、直径 30–1,000 m [A95] | 加拿大、阿拉斯加 | 苔原 | 平坦苔原上的圆丘 |
| 构造土（patterned ground） | 反复冻融把石块排成多边形或条纹 | 条纹出现在 2–7° 的坡上 [A96] | 极地、高山 | — | 地面的网纹 |
| 苔原（tundra） | 寒冷、生长季短，树长不起来 | 北极年降水只有 150–250 mm；植被是矮灌木、莎草、禾草、苔藓、地衣 [A97]；海拔每升约 100 m 气温降约 1 °C [A98] | 北极、高山 | 最暖月 0–10 °C（柯本 ET，见 3.1） | 低矮、开阔、风大，颜色随季节变化强烈 |

### 1.10 湖区与湿地

| 地形 | 怎么形成 | 尺度 | 实例 | 气候与植被 | 在路上看起来【综合】 |
|---|---|---|---|---|---|
| 湖区（lake district） | 冰川挖出的洼地积水 | 英格兰湖区最高 978 m；Seathwaite 年降水 3,300 mm，Keswick 1,470 mm [A99]；喀纳斯湖面 1,374 m、长 24 km、宽约 1.9 km、深 188.5 m，雪线约 2,850 m，稳定积雪约 200 天 [A100]；青海湖面 3,260 m、面积 4,200–4,500 km² [A101] | 英格兰湖区、喀纳斯 | 湿润，湖岸林 | 路绕湖岸，水面倒映山 |
| 湿地（wetland） | 地下水位高、常年或季节性积水 | 威尔士、苏格兰、爱尔兰西部湿地年降水约 1,500 mm [A102] | 巴音布鲁克 [A51] | 沼泽草甸 | 水鸟群、芦苇与水面交错 |

### 1.11 河流形态

| 地形 | 怎么形成 | 尺度 | 实例 | 气候与植被 | 在路上看起来【综合】 |
|---|---|---|---|---|---|
| 曲流（meander） | 外岸侵蚀、内岸堆积 | 曲流波长 = 满槽河宽的 10–14 倍（平均 11 倍）；弯顶半径 = 河宽的 2–3 倍；曲流带宽 = 河宽的 15–18 倍 [A103] | 巴音布鲁克开都河 | 平原、盆地 | 从高处看到的银色蛇行，需要居高临下才看得清 |
| 辫状河（braided river） | 泥沙多、坡陡，分成许多交织的汊道 | 比曲流河陡，汊道与沙洲常在洪水中改变 [A104]；Waimakariri 长 151 km，上游是宽阔砾石滩 [A105] | 新西兰南岛 | 冰川融水河 | 宽阔灰白砾石滩上的几股浅水 |

### 第 1 节来源

- [A1] Alps — https://en.wikipedia.org/wiki/Alps
- [A2] Cliff — https://en.wikipedia.org/wiki/Cliff
- [A3] Pyramidal peak — https://en.wikipedia.org/wiki/Pyramidal_peak
- [A4] Zagros Mountains — https://en.wikipedia.org/wiki/Zagros_Mountains
- [A5] † EGU 2010 会议摘要 EGU2010-6462（扎格罗斯褶皱波长）— https://meetingorganizer.copernicus.org/EGU2010/EGU2010-6462.pdf
- [A6] † GEO ExPro 关于扎格罗斯背斜的文章 — https://geoexpro.com/?p=44994
- [A7] Jura Mountains — https://en.wikipedia.org/wiki/Jura_Mountains
- [A8] Mount Fuji — https://en.wikipedia.org/wiki/Mount_Fuji
- [A9] Cinder cone — https://en.wikipedia.org/wiki/Cinder_cone
- [A10] † USGS Volcano Hazards Program 词汇表：cinder cone — https://volcanoes.usgs.gov/vsc/glossary/cinder_cone.html
- [A11] Shield volcano — https://en.wikipedia.org/wiki/Shield_volcano
- [A12] Crater Lake — https://en.wikipedia.org/wiki/Crater_Lake
- [A13] Maar — https://en.wikipedia.org/wiki/Maar
- [A14] Hverfjall — https://en.wikipedia.org/wiki/Hverfjall
- [A15] Horst (geology) — https://en.wikipedia.org/wiki/Horst_%28geology%29
- [A16] † EBSCO Research Starters: Basin and Range Province — https://www.ebsco.com/research-starters/geology/basin-and-range-province
- [A17] † Geology of California（LibreTexts）8.01 Basin and Range — https://geo.libretexts.org/Sandboxes/ajones124_at_sierracollege.edu/Geology_of_California_(DRAFT)/08%3A_Basin_and_Range/8.01%3A_Regional_Extent_and_Overview_of_the_Basin_and_Range
- [A18] Sierra Nevada — https://en.wikipedia.org/wiki/Sierra_Nevada
- [A19] El Capitan — https://en.wikipedia.org/wiki/El_Capitan
- [A20] Half Dome — https://en.wikipedia.org/wiki/Half_Dome
- [A21] Yosemite Valley — https://en.wikipedia.org/wiki/Yosemite_Valley
- [A22] Lauterbrunnen — https://en.wikipedia.org/wiki/Lauterbrunnen
- [A23] Glen Coe — https://en.wikipedia.org/wiki/Glen_Coe
- [A24] Valley — https://en.wikipedia.org/wiki/Valley
- [A25] U-shaped valley — https://en.wikipedia.org/wiki/U-shaped_valley
- [A26] Cirque — https://en.wikipedia.org/wiki/Cirque
- [A27] Arête — https://en.wikipedia.org/wiki/Ar%C3%AAte
- [A28] Matterhorn — https://en.wikipedia.org/wiki/Matterhorn
- [A29] Moraine — https://en.wikipedia.org/wiki/Moraine
- [A30] Glacier — https://en.wikipedia.org/wiki/Glacier
- [A31] 海螺沟（中文维基）— https://zh.wikipedia.org/wiki/海螺沟
- [A31a] 贡嘎山（中文维基）— https://zh.wikipedia.org/wiki/贡嘎山
- [A32] Sognefjord — https://en.wikipedia.org/wiki/Sognefjord
- [A33] Geirangerfjord — https://en.wikipedia.org/wiki/Geirangerfjord
- [A34] Fjord — https://en.wikipedia.org/wiki/Fjord
- [A35] Drumlin — https://en.wikipedia.org/wiki/Drumlin
- [A36] Esker — https://en.wikipedia.org/wiki/Esker
- [A37] Uluru — https://en.wikipedia.org/wiki/Uluru
- [A38] Inselberg — https://en.wikipedia.org/wiki/Inselberg
- [A39] Tibetan Plateau — https://en.wikipedia.org/wiki/Tibetan_Plateau
- [A40] Colorado Plateau — https://en.wikipedia.org/wiki/Colorado_Plateau
- [A41] 黄土高原（中文维基）— https://zh.wikipedia.org/wiki/黄土高原
- [A42] Loess Plateau — https://en.wikipedia.org/wiki/Loess_Plateau
- [A43] Loess — https://en.wikipedia.org/wiki/Loess
- [A44] Monument Valley — https://en.wikipedia.org/wiki/Monument_Valley
- [A45] Tepui — https://en.wikipedia.org/wiki/Tepui
- [A46] Mount Roraima — https://en.wikipedia.org/wiki/Mount_Roraima
- [A47] Cuesta — https://en.wikipedia.org/wiki/Cuesta
- [A48] Alluvial plain — https://en.wikipedia.org/wiki/Alluvial_plain
- [A49] Floodplain — https://en.wikipedia.org/wiki/Floodplain
- [A50] Steppe — https://en.wikipedia.org/wiki/Steppe
- [A51] 巴音布鲁克草原（中文维基）— https://zh.wikipedia.org/wiki/巴音布鲁克草原
- [A52] Tiger Leaping Gorge — https://en.wikipedia.org/wiki/Tiger_Leaping_Gorge
- [A53] Yarlung Tsangpo Grand Canyon — https://en.wikipedia.org/wiki/Yarlung_Tsangpo_Grand_Canyon
- [A54] Grand Canyon — https://en.wikipedia.org/wiki/Grand_Canyon
- [A55] 太魯閣國家公園（中文维基）— https://zh.wikipedia.org/wiki/太魯閣國家公園
- [A56] East African Rift — https://en.wikipedia.org/wiki/East_African_Rift
- [A57] Rift valley — https://en.wikipedia.org/wiki/Rift_valley
- [A58] Li River — https://en.wikipedia.org/wiki/Li_River
- [A59] 漓江（中文维基）— https://zh.wikipedia.org/wiki/漓江
- [A60] Wulingyuan — https://en.wikipedia.org/wiki/Wulingyuan
- [A61] Sinkhole — https://en.wikipedia.org/wiki/Sinkhole
- [A62] Polje — https://en.wikipedia.org/wiki/Polje
- [A63] Wulong Karst — https://en.wikipedia.org/wiki/Wulong_Karst
- [A64] 万峰林（中文维基）— https://zh.wikipedia.org/wiki/万峰林
- [A65] Dune — https://en.wikipedia.org/wiki/Dune
- [A66] Barchan — https://en.wikipedia.org/wiki/Barchan
- [A67] Rub' al Khali — https://en.wikipedia.org/wiki/Rub%27_al_Khali
- [A68] Sossusvlei — https://en.wikipedia.org/wiki/Sossusvlei
- [A69] Badain Jaran Desert — https://en.wikipedia.org/wiki/Badain_Jaran_Desert
- [A70] 巴丹吉林沙漠（中文维基）— https://zh.wikipedia.org/wiki/巴丹吉林沙漠
- [A71] 塔克拉玛干沙漠（中文维基）— https://zh.wikipedia.org/wiki/塔克拉玛干沙漠
- [A72] Desert pavement — https://en.wikipedia.org/wiki/Desert_pavement
- [A73] Salar de Uyuni — https://en.wikipedia.org/wiki/Salar_de_Uyuni
- [A74] Bonneville Salt Flats — https://en.wikipedia.org/wiki/Bonneville_Salt_Flats
- [A75] 茶卡盐湖（中文维基）— https://zh.wikipedia.org/wiki/茶卡盐湖
- [A76] Badlands — https://en.wikipedia.org/wiki/Badlands
- [A77] Badlands National Park — https://en.wikipedia.org/wiki/Badlands_National_Park
- [A78] Yardang — https://en.wikipedia.org/wiki/Yardang
- [A79] Lut Desert — https://en.wikipedia.org/wiki/Lut_Desert
- [A80] 雅丹地貌（中文维基）— https://zh.wikipedia.org/wiki/雅丹地貌
- [A81] Cliffs of Moher — https://en.wikipedia.org/wiki/Cliffs_of_Moher
- [A82] Étretat — https://en.wikipedia.org/wiki/%C3%89tretat
- [A83] The Twelve Apostles (Victoria) — https://en.wikipedia.org/wiki/The_Twelve_Apostles_%28Victoria%29
- [A84] Stack (geology) — https://en.wikipedia.org/wiki/Stack_%28geology%29
- [A85] Natural arch — https://en.wikipedia.org/wiki/Natural_arch
- [A86] Beach — https://en.wikipedia.org/wiki/Beach
- [A87] Ria — https://en.wikipedia.org/wiki/Ria
- [A88] Rías Baixas — https://en.wikipedia.org/wiki/R%C3%ADas_Baixas
- [A89] River delta — https://en.wikipedia.org/wiki/River_delta
- [A90] Outer Banks — https://en.wikipedia.org/wiki/Outer_Banks
- [A91] Barrier island — https://en.wikipedia.org/wiki/Barrier_island
- [A92] Laki — https://en.wikipedia.org/wiki/Laki
- [A93] Columnar jointing — https://en.wikipedia.org/wiki/Columnar_jointing
- [A94] Giant's Causeway — https://en.wikipedia.org/wiki/Giant%27s_Causeway
- [A95] Pingo — https://en.wikipedia.org/wiki/Pingo
- [A96] Patterned ground — https://en.wikipedia.org/wiki/Patterned_ground
- [A97] Tundra — https://en.wikipedia.org/wiki/Tundra
- [A98] Periglaciation — https://en.wikipedia.org/wiki/Periglaciation
- [A99] Lake District — https://en.wikipedia.org/wiki/Lake_District
- [A100] 喀纳斯湖（中文维基）— https://zh.wikipedia.org/wiki/喀纳斯湖
- [A101] 青海湖（中文维基）— https://zh.wikipedia.org/wiki/青海湖
- [A102] Wetland — https://en.wikipedia.org/wiki/Wetland
- [A103] Meander — https://en.wikipedia.org/wiki/Meander
- [A104] Braided river — https://en.wikipedia.org/wiki/Braided_river
- [A105] Waimakariri River — https://en.wikipedia.org/wiki/Waimakariri_River
- [A106] Nikkō National Park — https://en.wikipedia.org/wiki/Nikk%C5%8D_National_Park
- [A107] Danxia landform — https://en.wikipedia.org/wiki/Danxia_landform
- [A108] Big Sur — https://en.wikipedia.org/wiki/Big_Sur
- 地形定义条目（“怎么形成”一栏另参照）：
- [A109] Fold mountains — https://en.wikipedia.org/wiki/Fold_mountains
- [A110] Stratovolcano — https://en.wikipedia.org/wiki/Stratovolcano
- [A111] Graben — https://en.wikipedia.org/wiki/Graben
- [A112] Dome (geology) — https://en.wikipedia.org/wiki/Dome_%28geology%29
- [A113] Plateau — https://en.wikipedia.org/wiki/Plateau
- [A114] Mesa — https://en.wikipedia.org/wiki/Mesa
- [A115] Butte — https://en.wikipedia.org/wiki/Butte
- [A116] Canyon — https://en.wikipedia.org/wiki/Canyon
- [A117] Karst — https://en.wikipedia.org/wiki/Karst
- [A118] Tower karst — https://en.wikipedia.org/wiki/Tower_karst
- [A119] Playa — https://en.wikipedia.org/wiki/Playa
- [A120] Lava field — https://en.wikipedia.org/wiki/Lava_field
- [A121] Waterfall — https://en.wikipedia.org/wiki/Waterfall
- [A122] Escarpment — https://en.wikipedia.org/wiki/Escarpment

---

## 2 世界景观公路

下面写了 46 条路（欧洲 12、北美 10、大洋洲与太平洋 3、亚洲 14、非洲 4、南美 3），其中约 10 条是简短条目；`landscape-params.md` 的 P5 是同样 46 条路的总表。每条路的“序列”是【综合】：把路的条目、所在国家公园或生态区的资料、第 3 节的带谱拼在一起。没有查到的项写“未查到”，不填猜测。照片一栏给维基共享资源（Wikimedia Commons）的文件页；已下载的照片在 `refs/photos/`（见第 5 节）。

### 2.1 欧洲

**Trollstigen（挪威，郡道 63，Åndalsnes–Valldal）**
- 数据：坡度 10%，11 个发卡弯爬上陡峭山壁；垭口约 850 m；700 m 处有停车场和几座观景台俯瞰弯道与 Stigfossen 瀑布；车长 12.4 m 以上禁行 [B1]。
- 季节：晚秋到冬季封闭；例如 1998 年 5/15 开、10/15 因雪关，2016 年 5/25 开、11/3 因雪关，2009 年因雪崩 10/23 关 [B1]。
- 序列【综合】：Isterdalen 谷底农田（U 形谷的谷头，[A25] 有该处照片）→ 谷头峭壁上叠弯、瀑布 → 700 m 观景台 → 高山高原；东侧高山属 Reinheimen 国家公园 [B1]。
- 风景构成【综合】：从观景台俯看整组弯道，是“叠弯从上看”的典型。
- 照片：https://commons.wikimedia.org/wiki/File:DSC07845-Panorama.jpg（CC BY-SA 4.0）

**大西洋海滨公路（Atlantic Ocean Road，挪威 Rv64）**
- 数据：长 8.3 km，路宽 6.5 m，最大坡度 8%；建在一串小岛和礁石上，靠堤道、高架和 8 座桥相连，其中 Storseisundet 桥长 260 m、桥下净空 23 m，其余桥 52–293 m 长、净空 3–10 m；北面是没有遮挡的挪威海 Hustadvika，南面是峡湾 [B2]。
- 序列【综合】：大陆 → 礁岛 → 桥 → 礁岛 → 观景点（Flatskjæret）→ 大陆，全程开阔。
- 植被、动物：条目未写；属无树礁岸（见 1.7）。
- 照片：https://commons.wikimedia.org/wiki/File:Atlantic_Ocean_Road.jpg（CC BY 3.0）

**罗弗敦群岛（E10）**
- 数据：E10 从罗弗敦尖端的 Å 到瑞典吕勒奥，全长 880 km；2007 年底挪威境内 18 座隧道，共 20.4 km；Lofast 新路取代了轮渡 [B4]。
- 自然：山不到 1,200 m，却有阿尔卑斯式的山脊、山峰和冰川；夏季有极昼；陡坡多雪、会雪崩；最高温纪录 30.4 °C [B3]。
- 植被：没有原生针叶林，只有小片私人云杉人工林 [B3]。
- 动物：海雕和鸬鹚密度高，还有成百万只海鸟，包括海鹦；西北沿海 27,000 ha 水域是重要鸟区（越冬的普通绒鸭和黄嘴潜鸟）[B3]。
- 风景构成【综合】：海平面直接升起的尖峰、跨岛桥、渔村，开阔为主，隧道把段落切开。

**Stelvio 山口（意大利 SS38）**
- 数据：垭口 2,757 m，东阿尔卑斯最高的铺装山口；北侧（Prad 起）28 km、48 个编号的发卡弯，多数很紧；南侧（Bormio 起）22 km、34 个较舒展的发卡弯，下段有 6 座隧道；附近 3,450 m 的冰川平时全年可滑雪 [B5]。骑行数据：北坡 24–25 km、升约 1,780–1,840 m、平均 7.3–7.6%、最陡 11–16%（各源不一）† [B6][B7][B8]。
- 序列【综合】：谷地农田 → 云杉、落叶松林（欧洲落叶松多在 1,000–2,000 m [C60]）→ 林线（东阿尔卑斯约 1,750 m [C2]）→ 高山草甸 → 碎石、残雪 → 垭口 → 远处冰川。
- 照片：https://commons.wikimedia.org/wiki/File:Stelvio_Pass_Bolzano_side_1.jpg（CC BY-SA 4.0）

**大格洛克纳高山公路（Grossglockner，奥地利）**
- 数据：奥地利最高的铺装山口路；从 Salzach 河谷的 Bruck 经 Ferleiten 收费站，以编号发卡弯爬到 Hochtor 山口 2,504 m；Fuscher Törl 2,428 m 有 1.5 km 支路到 2,571 m 的 Edelweißspitze 观景点；南侧支路到 2,369 m 的观景中心，可看 Pasterze 冰川与大格洛克纳峰 [B9]。全长 48 km（Fusch–Heiligenblut）、36 个弯、最陡 12%，通常 5 月初到 11 月初开放† [B10]。
- 植被：林线一带长瑞士石松，往上是高山玫瑰和特有的虎耳草，到约 2,800 m 的冰雪带 [B11]。
- 动物：岩羚羊、阿尔卑斯羱羊、马鹿、兀鹫、金雕 [B11]。
- 序列【综合】：河谷 → 针叶林 → 石松林线 → 高山玫瑰灌丛 → 高山草甸 → 碎石与冰川视野。

**Furka 山口（瑞士 19 号路）**
- 数据：2,429 m；西侧垭口附近的 Belvédère 酒店旁可步行到罗讷冰川冰洞，冰川每年移动 30–40 m，100 m 长的冰洞每年要重凿 [B12]。
- 风景构成【综合】：从对面 Grimsel 山口路能看到整组发卡弯挂在谷壁上。
- 照片：https://commons.wikimedia.org/wiki/File:Furkapass_westside.jpg（CC BY 2.5）

**Transfăgărășan（罗马尼亚 DN7C）**
- 数据：全长 151 km，翻越喀尔巴阡山段 90 km，在 Bâlea 湖到达 2,042 m，是罗马尼亚第二高的铺装路；有陡的发卡弯、长 S 弯和急下坡；近最高点的 Bâlea 隧道长 884 m；通常 10 月底到 6 月底因雪封闭 [B13]。
- 序列【综合】：山麓森林 → 冰斗湖与瀑布（Bâlea）→ 隧道 → 另一侧下山。

**A82 与 Glen Coe（苏格兰）**
- 数据：A82 长 269 km（Glasgow–Inverness）；穿过高沼地，最高点 348 m 在 Beinn Chaorach 附近，然后沿 Glen Coe 山口下行，经过“三水汇”瀑布 [B14]。Glen Coe 是 U 形谷，长约 12.5 km，谷底不到 700 m 宽，在“Glen Coe 山口”处骤然收窄 [B15]。
- 风景构成：官方评估称其“高山口与疏林河谷之间突然的转换”是特点之一 [B15]。
- 动物：山顶有雪鹀、雷鸟，也有鵟和金雕；高处是 Lochaber 最好的高山与亚高山植物生境之一 [B15]。
- 植被背景：苏格兰林线只有约 500 m（强海洋性）[C2]；帚石南 7–9 月开花 [C96]。
- 序列【综合】：湖岸林路 → 拉诺赫高沼（开阔）→ Glen Coe 两壁夹峙（封闭）→ 林地河谷。

**阿马尔菲海岸路（意大利 SS163）**
- 数据：长 50.36 km；大部分路段凿在海崖侧壁上，下望第勒尼安海、上望崖壁 [B16]。
- 植被背景：地中海硬叶林与灌丛（冬青栎、伞松、柏等，见 3.1）。

**冰岛 1 号环岛公路**
- 数据：约 1,309 km（条目信息框）；沿途有 Seljalandsfoss、Skógafoss 瀑布、Dyrhólaey 海崖、Jökulsárlón 冰河湖、Mývatn 湖、Dettifoss、Goðafoss；各地都有高海拔山口，坡陡弯急；南部冰川冲积平原和东部峡湾还有 26 座单车道桥；隧道（如 7.4 km 的 Vaðlaheiðargöng）减少了冬季封路 [B17]。
- 火山：1783 年拉基裂隙喷出 14 km³ 玄武岩 [B18]。
- 花：努特卡羽扇豆在冰岛路边和草地自播成片，蓝紫色、高可达 60 cm [B19]。
- 序列【综合】：冰川冲积平原（砾石、辫状河）→ 瀑布崖 → 熔岩原 → 峡湾山口 → 湖与地热区。

**Bealach na Bà 与 Dark Hedges（简）**
- Bealach na Bà（苏格兰）：从海平面的 Applecross 约 6 km 升到 630 m，坡度接近 20%，发卡弯很紧，是英国爬升最大的道路，山顶属苔原气候 ET [B92]。
- Dark Hedges（北爱尔兰）：约 1775 年种下的 150 多株欧洲水青冈，约 250 岁，树冠在路上方交织成 6–10 m 宽、约 150 m 长的树隧；2017 年起禁车以保护根系 [B93]。照片：https://commons.wikimedia.org/wiki/File:Dark_Hedges_near_Armoy,_Co_Antrim_(cropped).jpg（CC BY-SA 2.0）

### 2.2 北美

**大苏尔海岸与 1 号公路（加州）**
- 数据：Bixby 桥长 218 m、宽 7.3 m、桥下净空 79 m，主跨 110 m [B21]。
- 气候：夏季约 610 m 以下常有雾；海岸灌丛下的雾滴可达年降水的 50%；圣卢西亚山脉高过 1,760 m，海拔升高雨量大增，而山的雨影一侧雨量骤减 [B20]。
- 植被：低处和峡谷里有红杉，这里是红杉分布的南界；雨影一侧森林消失，变成开阔的橡树林地，再变成耐火的加州丛林 [B20]。
- 序列【综合】：海雾带的海岸草地与灌丛 → 峡谷红杉 → 崖顶路与桥 → 内侧山脊橡树林 → 丛林。
- 照片：https://commons.wikimedia.org/wiki/File:Bixby_Creek_Bridge,_California,_USA_-_May_2013.jpg（CC BY-SA 3.0）

**Going-to-the-Sun Road（蒙大拿，冰川国家公园）**
- 数据：全长 80 km（50 mi）† [B23]；穿过大陆分水岭的 Logan Pass，海拔 2,026 m；低处限速 72 km/h、陡峭蜿蜒的高山段 40 km/h；Avalanche Creek 到 Rising Sun 之间禁止长 6.4 m、宽 2.4 m 以上的车；东侧因大雪和晚冬雪崩毁坏护栏，护栏很少 [B22]。2026 年 6 月 22 日全线通车† [B23]。
- 植被：公园西南部有最东端的北美乔柏–异叶铁杉林；西部、西北部以云杉和冷杉为主；分水岭以东是松、云杉、冷杉与草原的混合；西部落叶松秋天落叶 [B24]。熊草（Xerophyllum tenax）在公园常见，有时多年才开一次 [C99]。
- 动物：Hidden Lake 一带常见雪羊（条目首图）[B24]。
- 序列【综合】：西侧湖与红雪松–铁杉林 → 云杉冷杉 → 冰川谷壁上的阳台路 → Logan Pass 高山草甸 → 东侧松林与草原。
- 照片：https://commons.wikimedia.org/wiki/File:Going-to-the-Sun_Road_-_Glacier_National_Park.jpg（CC BY-SA 4.0）

**冰原大道（Icefields Parkway，艾伯塔 93 号）**
- 数据：227 km 的景观路，平行于大陆分水岭，穿过班夫与贾斯珀国家公园，连接路易斯湖与贾斯珀；设计时尽量减少坡度与发卡弯；路旁就是 Athabasca 冰川 [B25]。官方冬季页：路易斯湖路口距贾斯珀 228 km† [B26]。
- 植被：班夫林线约 2,300 m；山地带以扭叶松为主，夹恩氏云杉、柳、颤杨、少量花旗松和道格拉斯槭；亚高山带以恩氏云杉为主，也有扭叶松和亚高山冷杉 [B27]。
- 序列【综合】：宽阔冰川谷底的森林与河滩 → 冰碛与冰川湖 → 山口（林线附近草甸）→ 冰原 → 另一条冰川谷。
- 风景构成【综合】：长距离开阔谷地，两侧墙 1,000–1,500 m，几乎没有封闭段，节奏靠湖、冰川和观景点。
- 照片：https://commons.wikimedia.org/wiki/File:Icefields_Parkway_from_an_elevated_viewpoint,_Jasper_National_Park,_Alberta,_Canada.jpg（CC BY 4.0）

**巨人大道（Avenue of the Giants，加州 254 号）**
- 数据：长 50.8 km，穿过 Humboldt Redwoods 州立公园，红杉高耸在路两侧 [B28]。
- 植被：河漫滩上几乎是纯红杉林，坡上混有花旗松；全世界已知 137 棵超过 107 m 的树中有 100 多棵在这座公园 [B29]。红杉多长在离海 1.5–3 km 以上、但不超过 80 km 的地方；林下有越橘和雪果；Fern Canyon 15 m 深的沟壁上长满铁线蕨、鹿蕨、水龙骨、甘草蕨和剑蕨 [B30]。
- 风景构成【综合】：树干几米外就是路肩，冠层在 60–100 m 高处合拢，路面几乎没有天空；河边草滩偶尔打开视野。这是“巨树隧道”的原型。
- 照片：https://commons.wikimedia.org/wiki/File:AVENUE_OF_THE_GIANTS,_OLD_HIGHWAY_101,_ROAD_VIEW_1.5_MILES_NORTH_OF_MIRANDA._HUMBOLDT_COUNTY,_CALIFORNIA._LOOKING_N._-_Redwood_National_and_State_Parks_Roads,_California_coast_from_HAER_CA-269-69_(CT).tif（公有领域）

**蓝岭公园路（Blue Ridge Parkway，弗吉尼亚–北卡）**
- 数据：长 755 km（469 mi）；跨过 168 座桥、6 座高架；沿途频繁的路边停车点与观景台；最高点 1,845 m（Richland Balsam，MP 431）；冬季不养护，高段和隧道段晚秋到早春常封 [B31]。隧道 26 座（只有 1 座在弗吉尼亚）† [B32]。
- 植被：低处栎、山核桃、北美鹅掌楸，中段七叶树和白蜡，最高处冷杉与云杉；北卡境内有自导步道穿过残存的云杉–冷杉林 [B31]；生态区资料：250–1,350 m 是落叶栎林，以上是云杉–冷杉林 [C27]。
- 花：MP 154.5 的 Smart View 以 5 月初的狗木花闻名 [B31]。
- 夜：公园路连接谢南多厄国家公园与大雾山国家公园，南端就在大雾山国家公园边界 [B31]；那里有同步萤（见 3.2）。
- 风景构成【综合】：沿山脊的林中路，每隔几公里在观景台打开，看到一层层变蓝变淡的山脊（照片见第 5 节）。

**Trail Ridge Road 与 Beartooth Highway（落基山高原路）**
- Trail Ridge Road（科罗拉多）：长 77 km，最高 3,713 m，是北美最高的连续铺装公路；1932 年建成时最大坡度 7%（旧路达 16%）；高段约 10 月到 5 月封闭 [B33]。公园生态带：山地带上限约 2,743–2,896 m，亚高山带到约 3,353–3,475 m，以上是高山苔原，占公园三分之一† [B35]。
- Beartooth Highway（蒙大拿–怀俄明）：长 110 km，在 3,337 m 的 Beartooth 山口越顶；沿蒙大拿–怀俄明边界以一连串之字形和发卡弯爬升，顶部铺开成宽阔高原，沿途湖泊众多 [B34]。
- 序列【综合】：山地松林与颤杨 → 亚高山云杉冷杉（林线矮曲林）→ 开阔苔原高原、冰斗湖 → 下山。

**Tioga 山口（加州 120 号，优胜美地）**
- 数据：3,031 m，加州最高的公路山口；通常 10 月底到次年 5 月底因雪封闭，大雪年 10 月初就封、可封到 7 月底；西南不到 11 km 是 Tuolumne 草甸；有猛禽、旱獭、短尾猫，偶见大角羊 [B37]。
- 植被背景：优胜美地林线西侧 3,200 m、东侧 3,600 m [C2]。

**道尔顿公路（阿拉斯加）**
- 数据：长 666 km（Livengood–Deadhorse）；在 Atigun 山口 1,444 m 越过布鲁克斯山脉；修路曾使永冻土融化；有驯鹿和驼鹿；北冰洋端的 Deadhorse 外围可见北极熊 [B36]。
- 序列【综合】：北方针叶林 → 森林–苔原过渡带（北美西北部平均约 145 km 宽 [C2]）→ 山口 → 北坡苔原。
- 照片（苔原与布鲁克斯山脉）：https://commons.wikimedia.org/wiki/File:Midnight_sun_in_the_Brooks_Range_(51358523439).jpg（公有领域）

**Cabot Trail（加拿大新斯科舍，简）**：环线 298 km；北段穿过布雷顿角高地，被认为是该省最美的地区之一；西南段经 Margaree 河谷、沿 Bras d'Or 湖 [B94]。

### 2.3 大洋洲与太平洋

**大洋路（Great Ocean Road，澳大利亚维州 B100）**
- 数据：长 240 km；穿过雨林，也沿着石灰岩和砂岩的海滩与海崖；Port Campbell 一带有 Loch Ard Gorge、London Bridge 和十二门徒等岩石；靠近 Torquay 的一段紧贴海岸、海侧是陡崖；1962、1964 年曾因林火封闭 [B38]。十二门徒是高达 50 m 的石灰岩海蚀柱，2005 年一根倒塌后剩 8 根 [A83]。
- 雨林：大洋路穿过的 Otway 山脉属大奥特威国家公园（103,185 ha），最高点 Mount Cowley 670 m，每年都会下雪；香桃木水青冈受真菌病害 [B39]。王桉高 70–114 m [C66]，软树蕨一般 5 m 高、分布到 1,000 m [C67]。
- 序列【综合】：沙滩海岸 → 崖上路 → 内陆 Otway 雨林（树蕨、王桉）→ 再回海岸的海蚀柱群。

**米尔福德公路（新西兰 SH94，Te Anau–Milford Sound）**
- 数据：SH94 全长 254.4 km（Gore–Milford），最高 945 m（Homer 隧道东口），是新西兰第三高的公路；分水岭 The Divide 只有 532 m；途经镜湖、“消失的山”大道、Gunn 湖、The Chasm；雪崩区禁止停车，冬季常封，雪天必须带雪链 [B40]。Homer 隧道长 1,270 m，以约 1:10 的坡度向西下行，隧道壁是不衬砌的花岗岩 [B41]。
- 植被：峡谷陡坡上的密林主要是银假山毛榉和山假山毛榉，也有罗汉松类；林下多冠蕨，地面满是苔藓和地钱；冰川退后留下陡壁 U 形谷，15 条峡湾有的深入内陆 40 km [B42]。峡湾地区林线约 950 m [C2]。
- 动物：啄羊鹦鹉在高山脊上的假山毛榉林繁殖 [C110]。
- 序列【综合】：湖与草地 → 假山毛榉林 → U 谷（墙越来越近）→ 隧道 → 下到峡湾。
- 照片（隧道西口望出）：https://commons.wikimedia.org/wiki/File:Homer_Saddle_LookingWest.jpg（公有领域）

**哈纳公路（Hāna Highway，夏威夷茂宜岛）**
- 数据：长 104 km；Kahului 到 Hana 直线只有 84 km，却要开约 2.5 小时：约 620 个弯、59 座桥（46 座单车道），几乎全程在热带雨林中 [B43]。
- 序列【综合】：甘蔗平原 → 雨林海岸峡谷，一弯一桥一瀑布的密集节奏。
- 推算（≈算）：平均每 135 m 一个弯、每 1.4 km 一座桥。

### 2.4 亚洲

**喀喇昆仑公路（中国–巴基斯坦）**
- 数据：长 1,300 km（巴基斯坦 887、中国 413）；最高 4,714 m，靠近红其拉甫山口 [B44]，山口 4,693 m [B45]；2010 年滑坡堵江形成 Attabad 湖，淹没 20 km 以上的公路，后来改线新建 24 km 的桥隧 [B44]。
- 自然：罕萨谷有数座超过 7,000 m 的高峰 [B46]；雪豹在 3,000–4,500 m 的崖脊活动 [C119]，岩羊在 2,200–5,500 m [C118]。
- 序列【综合】：印度河谷灌丛 → 罕萨谷绿洲 → 帕苏尖峰群下的谷底路 → 高原山口。
- 照片：https://commons.wikimedia.org/wiki/File:Passu_Cones_(Karakoram_Highway_view).jpg（CC BY-SA 4.0）

**独库公路（新疆 G217 独山子–库车段）**
- 数据：长 562 km，平均海拔 2,500 m，翻越 4 个常年积雪的达坂，跨 5 条河；最初建有 3 条高山隧道、2 座防雪走廊；哈希勒根达坂 3,390 m、玉希莫勒盖达坂 3,428 m、铁力买提（铁里买德）达坂 3,700 m、拉尔墩达坂 2,700 m；某达坂北侧 15.5 km 路段年降水 800 mm 以上，10/15 到次年 5/10 为稳定积雪期，坡上积雪 2–5 m，这是 10 月中到次年 5 月不能通车的根本原因 [B47]。英文条目：穿过巴音布鲁克草原自然保护区，几个达坂已改用隧道 [B48]。
- 带谱（天山北坡）：山地草原 → 山地草甸草原 → 针叶林 → 高山草原 → 高山垫状植物 → 积雪；年降水北坡多在 500 mm 以上，西段中山森林带最多 [B49]。针叶林主要是雪岭云杉，长在 1,500–2,700/3,200 m 的阴坡 [C78]。
- 序列【综合】：准噶尔盆地边缘荒漠 → 山地草原 → 雪岭云杉峡谷 → 达坂（2–5 m 雪墙）→ 巴音布鲁克高寒草甸与曲流（天鹅）→ 南坡干旱峡谷 → 库车。

**川藏线（G318 成都–拉萨段）**
- 数据：G318 全长 5,476 km（上海人民广场–樟木中尼友谊桥）；川藏段跨越高山口、河谷峡谷、森林、草原与高山，许多路段改线或以隧道桥梁绕开高山口和滑坡坡面（如通麦）[B51]。中文条目：通麦天险长约 17 km、海拔约 2,400 m，上方高山、下方深谷，常塌方泥石流，现已建桥隧；东段从新都桥经雅江、理塘到海子山，翻越高尔寺山、剪子弯山、卡子拉山、脱洛拉卡山四座 4,000 m 以上的山 [B50]。南线约 2,140–2,150 km、约 14 座 4,000 m 以上垭口†；折多山 4,298 m†；东达山 5,130 m† [B52][B53]（论坛与攻略，非权威）。
- 沿线：然乌湖 3,850 m、22 km²、年均 8.5 °C、年降水 849.7 mm，由滑坡泥石流堵塞形成，318 国道经其东岸 [B54]；米堆冰川由两条冰瀑汇成，冰瀑间有原始森林，末端约 2,400 m（中文维基称世界海拔最低的高山冰川，未见其他来源核对）[B55]。
- 带谱背景：东喜马拉雅亚高山针叶林 3,000–4,000 m、高山灌丛草甸 4,000–5,500 m（第 3.3 节）；从成都按坐标算到贡嘎山 241 km（≈算），仰角只有约 0.6°（4.3 节）。
- 序列【综合】：成都平原 → 亚热带河谷 → 折多山垭口草甸 → 高原牧场（理塘一带）→ 怒江峡谷与 72 拐 → 然乌湖、米堆冰川与冷杉林 → 林芝森林。

**天门山通天大道（湖南张家界）**
- 数据：盘山公路全长 10.77 km [B56]，99 个弯，通往天门洞 [B57]；天门洞高 131.5 m、宽 57 m、深 60 m；主峰 1,518.6 m [B56]。公路从约 200 m 升到约 1,300 m、冬季冰雪时关闭† [B58]。
- 推算（≈算）：平均每 108 m 一个弯，每弯约升 11 m（“弯”包括 S 弯）。
- 背景：附近的武陵源有 3,000 多根石英砂岩石柱，许多超过 200 m [A60]。

**中横公路与台 14 甲线（台湾）**
- 数据：中横主线（台 8 线）长 187.797 km，主线最高点大禹岭 2,565 m；太鲁阁到天祥约 20 km 穿过悬崖峭壁和坚硬的大理石，桥梁隧道特别多，是中横最主要的景观；2024 年花莲地震造成东段多处坍方 [B59]。谷关到梨山段因地震台风损坏长期只供当地居民通行 [B62]。台 14 甲线（雾社–大禹岭）长 41.733 km，最高点武岭 3,275 m；翠峰以上积雪时管制，只有加挂雪链或四驱车可行 [B60]。
- 植被与气候：太鲁阁沿立雾溪而上，年均温从海拔 100 m 的 23 °C 降到 3,000 m 合欢山一带的 7 °C；园区 44.7% 面积坡度超过 55% [A55]；英文条目称中横公路从亚洲热带落叶林一直到高山松林与雪松林 [B62]；合欢山春夏有玉山箭竹草原和玉山杜鹃、红毛杜鹃花丛 [B61]。
- 序列【综合】：花莲海岸 → 太鲁阁大理石峡谷（阳台路、隧道）→ 天祥 → 温带阔叶林 → 铁杉冷杉林 → 合欢山箭竹草原与杜鹃 → 武岭。
- 照片：https://commons.wikimedia.org/wiki/File:Taiwan_2009_HuaLien_Taroko_Gorge_Biking_PB160057.jpg（CC BY-SA 3.0）

**立山黑部阿尔卑斯路线（日本）**
- 数据：1971 年开通，全长 37 km，高差达 1,975 m；三条线路在隧道中运行以防雪；“雪之大谷”雪墙 4 月中到 6 月可见，高 15–20 m [B63]。
- 照片：https://commons.wikimedia.org/wiki/File:Tateyama_Toll_Road_and_Yuki-no-otani.jpg（CC BY-SA 4.0）

**北海道：美瑛、富良野与知床**
- 美瑛：面积 676.78 km²，70% 林业、15% 农业；“拼布之路”夏绿冬白，田间有广告里出名的孤树（含一组栎树）；“全景之路”上有四季彩之丘花园（薰衣草等）[B64]。富良野以薰衣草田闻名，市域约 70% 为山林 [B65]。
- 知床横断道路（国道 334）：国道全长 123.3 km（罗臼–美幌）[B66]；知床山口 738 m，约 11 月初到 4 月下旬封闭† [B67]。知床国家公园有日本最多的棕熊；森林是温带与亚高山混交林，主要树种是库页冷杉、岳桦、蒙古栎；森林上限以上是密不透风的偃松丛 [B68]。
- 序列【综合】：丘陵农田花田 → 落叶阔叶林 → 针阔混交林 → 偃松灌丛的山口 → 海岸（冬季有流冰、虎头海雕 [C108]）。

**伊吕波坂（日光）**
- 数据：两条单行道共 48 个弯（上行 20、下行 28），连接日光市区与中禅寺湖，全长约 15.8 km、升降约 440 m（另一来源称从约 600 m 到约 1,270 m）† [B69]；红叶上部 10 月中、下部 10 月底到 11 月初† [B70]。
- 终点：男体山 2,486 m 高耸在中禅寺湖上，华严瀑布 97 m [B96]。

**西南喀斯特山路：晴隆二十四道拐与 Mã Pí Lèng**
- 二十四道拐（贵州晴隆）：从山脚到关口直线约 350 m、垂直约 250 m，在约 60° 的斜坡上以 S 形盘旋，全程约 4 km、24 道弯，1936 年通车† [B71][B72]。（60° 应指山坡整体倾角，按路长算的平均纵坡约 6% ≈算。）
- Mã Pí Lèng 山口（越南河江，4C 号公路）：约 1,500 m，在同文喀斯特高原上；路沿崖壁开凿，俯看 Nho Quế 河峡谷与 Tú Sản 峡谷 [B73]。照片：https://commons.wikimedia.org/wiki/File:Ma_Pi_Leng_Pass_winding_road_Ha_Giang_Vietnam.jpg（CC BY 2.0）

**列城–马纳利公路（印度）**
- 数据：长 428 km，平均海拔 4,000 m 以上，最高 5,328 m（Taglang La）；Gata loops 在 4,190 m 处以 21 个发卡弯爬升约 500 m；穿过 Atal 隧道后进入雨影里的 Chandra 河谷，绿色逐渐消失；过去冬季 Rohtang 以北封闭 [B74]。Rohtang 山口 3,978 m，冬季大雪封路 [B75]。
- 推算（≈算）：Gata loops 每弯约升 24 m。
- 序列【综合】：湿润的 Kullu 谷针叶林 → Rohtang 草坡与叠弯 → 雨影荒原 → 高原。
- 照片（Rohtang 山口路的叠弯与河谷）：https://commons.wikimedia.org/wiki/File:Kullu_Valley_from_Rohtang_Pass,_India.jpg（CC BY 4.0）

**帕米尔公路（M41，塔吉克斯坦–吉尔吉斯斯坦）**
- 数据：长 1,252 km；经 4,655 m 的 Ak-Baital 山口和喀拉湖，是世界第二高的国际公路；除吉尔吉斯段和杜尚别附近外，大多被侵蚀、地震、滑坡和雪崩严重损坏 [B76]。
- 序列【综合】：河谷绿洲 → 峡谷 → 高原荒漠与盐湖。

**海云关（越南，简）**：旧 1 号公路翻山处 496 m，南侧是 1,172 m 的海云山；名字指从海上升起、降低能见度的雾 [B95]。

### 2.5 非洲

**查普曼峰公路（Chapman's Peak Drive，开普敦）**
- 数据：长约 9 km、114 个弯，沿查普曼峰（593 m）的岩岸† [B78]；路凿在崖面上，1990 年代落石致死后封闭重建，2008 年又因风险封闭数月 [B77]。
- 植被：开普硬叶灌丛（fynbos）分低地（300 m 以下）与山地两类，沿海岸 100–200 km 宽的带分布，占开普植物区面积一半、物种 80% [B79]；帝王花高 0.35–2 m、花粉红 [C103]。
- 照片：https://commons.wikimedia.org/wiki/File:Chapmans_Peak_Drive_2.jpg（CC BY-SA 4.0）

**Sani 山口（南非–莱索托）**
- 数据：从 1,544 m 爬升 1,332 m 到 2,876 m；砾石路坡度达 1:3，冬季可能有冰雪；穿越南部非洲大陡崖最高的德拉肯斯堡（3,000 m 以上）[B80]。
- 照片：https://commons.wikimedia.org/wiki/File:Sani_Pass_heading_into_Lesotho.jpg（CC BY 2.0）

**猴面包树大道（马达加斯加 RN8）**
- 数据：Morondava 到 Belon'i Tsiribihina 的土路旁，一段 260 m 长的路边有 20–25 株格氏猴面包树，附近 4 ha 的稻田和草地里还有约 25 株；它们是曾经茂密热带森林的遗存；西北 7 km 有两株缠绕的“恋人猴面包树”（Adansonia za）[B81]。格氏猴面包树高 25–30 m，树冠平顶、主枝水平 [B82]。
- 生态区：马达加斯加干旱落叶林，海拔 0–600 m，Aw 气候，落叶冠层高 10–15 m，猴面包树和罗望子最高 [B83]；环尾狐猴栖于落叶林、干灌丛和河岸林 [C130]。
- 照片：https://commons.wikimedia.org/wiki/File:Avenue_of_the_Baobabs_at_Sunset.jpg（CC BY-SA 3.0）

**Tizi n'Tichka（摩洛哥 N9，高阿特拉斯）**
- 数据：路牌写 2,260 m，GPS 测得约 2,205 m；北非最高的主要山口；11 月到 3 月常降雪，但全年阳光强 [B84]。

### 2.6 南美

**南方大道（Carretera Austral，智利 7 号）**
- 数据：从 Puerto Montt 向南约 1,240 km 到 Villa O'Higgins，需 3 段轮渡，起初几乎全是土路、正逐步铺装；沿线是密林、峡湾、冰川、水道和陡山，经过 General Carrera 湖 [B85]。
- 植被：瓦尔迪维亚温带林年降水从北缘 1,000 mm 到南部 6,000 mm 以上，林线从北部（35°S）约 2,400 m 降到南部 1,000 m，有落叶假山毛榉林 [B86]；麦哲伦亚极地林年均 3–6 °C，西侧年降水 4,000 mm、东侧只有 450 mm [B87]。
- 序列【综合】：火山湖与雨林 → 峡湾海岸 → 冰川谷与冰湖 → 假山毛榉林线 → 东侧干草原（雨影）。

**40 号国道（Ruta 40，阿根廷）**
- 数据：约 5,194 km，与安第斯山平行，最高点 5,000 m 在 Abra del Acay [B88]。

**永加斯路（Yungas Road，玻利维亚）**
- 数据：64 km，连接拉巴斯与永加斯地区；陡坡与悬崖加上常见的雨、雾、滑坡和瀑布，被认为是世界上最危险的路；1990 年代后被双车道沥青的 3 号公路取代 [B89]。
- 生态：玻利维亚永加斯生态区海拔 400–3,500 m，是亚马孙湿润林与中安第斯普纳之间的过渡带 [B90]；普纳 3,200–6,600 m，年降水 250–500 mm [B91]。
- 序列【综合】：普纳高原（草、Polylepis）→ 垭口 → 云雾林（附生植物、苔藓）→ 山地雨林瀑布 → 低地。

### 2.7 这些路的共同规律【综合】

- 坡度：名路的平均坡多在 6–8%，最陡段 10–16%；规范把发卡弯上的纵坡压到 2.5–4.5%，两弯之间留 60–200 m（2.1 节与 [B97][B98]）。
- 季节：山口路大多 10–11 月到次年 5–6 月封闭（Trollstigen、Transfăgărășan、独库、Trail Ridge、Tioga、知床、Going-to-the-Sun）；春天的雪墙（立山 15–20 m，独库坡上 2–5 m）就是这种封路季的产物。
- 开阔与封闭的节奏：哈纳公路平均每 135 m 一个弯、每 1.4 km 一座桥；蓝岭公园路平均每 4.5 km 一座桥、每 29 km 一条隧道（≈算），林中路由频繁的观景台打开；大西洋海滨公路 8.3 km 内 8 座桥，全程开阔；Glen Coe 的特点正是“开阔高沼 → 峡谷 → 疏林河谷”的突然转换。没有找到量化“开阔–封闭”交替的研究，4.3 节的数字是建议。
- 地理顺序：几乎每条山路都在重复同一条带谱（谷地农田或森林 → 针叶林 → 林线矮曲林 → 高山草甸 → 碎石冰雪），海岸路在“海雾带—崖顶—雨影”之间切换，跨越山脉时迎风坡湿、背风坡干（大苏尔、列城–马纳利、南方大道、天山）。

### 第 2 节来源

- [B1] Trollstigen — https://en.wikipedia.org/wiki/Trollstigen
- [B2] Atlantic Ocean Road — https://en.wikipedia.org/wiki/Atlantic_Ocean_Road
- [B3] Lofoten — https://en.wikipedia.org/wiki/Lofoten
- [B4] European route E10 — https://en.wikipedia.org/wiki/European_route_E10
- [B5] Stelvio Pass — https://en.wikipedia.org/wiki/Stelvio_Pass
- [B6] † BikeRaceInfo：Stelvio — https://bikeraceinfo.com/kom/europe/kom-italy-stelvio.html
- [B7] † cols-cyclisme：Passo dello Stelvio depuis Prato — https://en.cols-cyclisme.com/massif-de-l-ortles/italie/passo-dello-stelvio-depuis-prato-c360.htm
- [B8] † road.cc：Climbing the 2758m Passo dello Stelvio — https://road.cc/content/feature/227754-road-trip-climbing-2758m-passo-dello-stelvio
- [B9] Grossglockner High Alpine Road — https://en.wikipedia.org/wiki/Grossglockner_High_Alpine_Road
- [B10] † 奥地利国家旅游局：Großglockner Hochalpenstraße — https://www.austria.info/de-at/locations/grossglockner-hochalpenstrasse/
- [B11] Hohe Tauern National Park — https://en.wikipedia.org/wiki/Hohe_Tauern_National_Park
- [B12] Furka Pass — https://en.wikipedia.org/wiki/Furka_Pass
- [B13] Transfăgărășan — https://en.wikipedia.org/wiki/Transf%C4%83g%C4%83r%C4%83%C8%99an
- [B14] A82 road — https://en.wikipedia.org/wiki/A82_road
- [B15] Glen Coe — https://en.wikipedia.org/wiki/Glen_Coe
- [B16] Strada statale 163 Amalfitana — https://en.wikipedia.org/wiki/Strada_statale_163_Amalfitana
- [B17] Route 1 (Iceland) — https://en.wikipedia.org/wiki/Route_1_%28Iceland%29
- [B18] Laki — https://en.wikipedia.org/wiki/Laki
- [B19] Lupinus nootkatensis — https://en.wikipedia.org/wiki/Lupinus_nootkatensis
- [B20] Big Sur — https://en.wikipedia.org/wiki/Big_Sur
- [B21] Bixby Bridge — https://en.wikipedia.org/wiki/Bixby_Bridge
- [B22] Going-to-the-Sun Road — https://en.wikipedia.org/wiki/Going-to-the-Sun_Road
- [B23] † NPS 新闻稿：Going-to-the-Sun Road open for the 2026 season — https://www.nps.gov/glac/learn/news/going-to-the-sun-road-open-for-the-2026-season.htm
- [B24] Glacier National Park (U.S.) — https://en.wikipedia.org/wiki/Glacier_National_Park_%28U.S.%29
- [B25] Alberta Highway 93 — https://en.wikipedia.org/wiki/Alberta_Highway_93
- [B26] † Parks Canada：Icefields Parkway 冬季安全 — https://parks.canada.ca/pn-np/ab/jasper/activ/experience/hiver-winter/pcghiver-ipwinter/pcg-securite-safety-ip
- [B27] Banff National Park — https://en.wikipedia.org/wiki/Banff_National_Park
- [B28] Avenue of the Giants — https://en.wikipedia.org/wiki/Avenue_of_the_Giants
- [B29] Humboldt Redwoods State Park — https://en.wikipedia.org/wiki/Humboldt_Redwoods_State_Park
- [B30] Redwood National and State Parks — https://en.wikipedia.org/wiki/Redwood_National_and_State_Parks
- [B31] Blue Ridge Parkway — https://en.wikipedia.org/wiki/Blue_Ridge_Parkway
- [B32] † Britannica：Blue Ridge Parkway — https://www.britannica.com/topic/Blue-Ridge-Parkway
- [B33] Trail Ridge Road — https://en.wikipedia.org/wiki/Trail_Ridge_Road
- [B34] Beartooth Highway — https://en.wikipedia.org/wiki/Beartooth_Highway
- [B35] † NPS 落基山国家公园：Natural Features & Ecosystems — https://www.nps.gov/romo/learn/nature/naturalfeaturesandecosystems.htm ；† NPS 公园统计 — https://www.nps.gov/romo/learn/management/statistics.htm ；† USGS 落基山国家公园生态 — https://www.usgs.gov/geology-and-ecology-of-national-parks/ecology-rocky-mountain-national-park
- [B36] Dalton Highway — https://en.wikipedia.org/wiki/Dalton_Highway
- [B37] Tioga Pass — https://en.wikipedia.org/wiki/Tioga_Pass
- [B38] Great Ocean Road — https://en.wikipedia.org/wiki/Great_Ocean_Road
- [B39] Great Otway National Park — https://en.wikipedia.org/wiki/Great_Otway_National_Park
- [B40] State Highway 94 (New Zealand) — https://en.wikipedia.org/wiki/State_Highway_94_%28New_Zealand%29
- [B41] Homer Tunnel — https://en.wikipedia.org/wiki/Homer_Tunnel
- [B42] Fiordland National Park — https://en.wikipedia.org/wiki/Fiordland_National_Park
- [B43] Hāna Highway — https://en.wikipedia.org/wiki/H%C4%81na_Highway
- [B44] Karakoram Highway — https://en.wikipedia.org/wiki/Karakoram_Highway
- [B45] Khunjerab Pass — https://en.wikipedia.org/wiki/Khunjerab_Pass
- [B46] Hunza Valley — https://en.wikipedia.org/wiki/Hunza_Valley
- [B47] 217国道（中文维基，含独库公路）— https://zh.wikipedia.org/wiki/217国道
- [B48] China National Highway 217 — https://en.wikipedia.org/wiki/China_National_Highway_217
- [B49] 天山山脉（中文维基）— https://zh.wikipedia.org/wiki/天山山脉
- [B50] 川藏公路（中文维基）— https://zh.wikipedia.org/wiki/川藏公路
- [B51] China National Highway 318 — https://en.wikipedia.org/wiki/China_National_Highway_318
- [B52] † 汽车之家问答（川藏南线里程与垭口）— https://www.autohome.com.cn/ask/26664520.html
- [B53] † 哔哩哔哩专栏（川藏线骑行攻略）— https://www.bilibili.com/read/cv25708255
- [B54] 然乌湖（中文维基）— https://zh.wikipedia.org/wiki/然乌湖
- [B55] 米堆冰川（中文维基）— https://zh.wikipedia.org/wiki/米堆冰川
- [B56] 天门山（中文维基）— https://zh.wikipedia.org/wiki/天门山
- [B57] Tianmen Mountain — https://en.wikipedia.org/wiki/Tianmen_Mountain
- [B58] † 永安旅游：Tianmen Mountain Heaven-Linking Avenue — https://www.wingontravel.com/discovery/scenic-tianmen-mountain-heaven-linking-avenue-13277623
- [B59] 中橫公路（中文维基）— https://zh.wikipedia.org/wiki/中橫公路
- [B60] 台14線（中文维基，含台 14 甲线）— https://zh.wikipedia.org/wiki/台14線
- [B61] 合歡山（中文维基）— https://zh.wikipedia.org/wiki/合歡山
- [B62] Central Cross-Island Highway — https://en.wikipedia.org/wiki/Central_Cross-Island_Highway ；Taroko National Park — https://en.wikipedia.org/wiki/Taroko_National_Park
- [B63] Tateyama Kurobe Alpine Route — https://en.wikipedia.org/wiki/Tateyama_Kurobe_Alpine_Route
- [B64] Biei — https://en.wikipedia.org/wiki/Biei
- [B65] Furano, Hokkaido — https://en.wikipedia.org/wiki/Furano,_Hokkaido
- [B66] Japan National Route 334 — https://en.wikipedia.org/wiki/Japan_National_Route_334
- [B67] † Visit Hokkaido：Shiretoko Pass — https://www.visit-hokkaido.jp/en/spot/detail_10401.html
- [B68] Shiretoko National Park — https://en.wikipedia.org/wiki/Shiretoko_National_Park
- [B69] † GLTJP：Irohazaka Winding Road — https://www.gltjp.com/en/directory/item/15123/
- [B70] † FUN! JAPAN：Irohazaka 红叶 — https://fun-japan.jp/en/articles/2209
- [B71] † 新华网（二十四道拐）— https://www.xinhuanet.com/20250523/b4e6f53d761c4f96adc87752bde65a0c/c.html
- [B72] † 光明网（二十四道拐）— https://m.gmw.cn/2026-10/03/content_1304571304.htm
- [B73] Mã Pí Lèng Pass — https://en.wikipedia.org/wiki/M%C3%A3_P%C3%AD_L%C3%A8ng_Pass
- [B74] Leh–Manali Highway — https://en.wikipedia.org/wiki/Leh%E2%80%93Manali_Highway
- [B75] Rohtang Pass — https://en.wikipedia.org/wiki/Rohtang_Pass
- [B76] M41 highway（Pamir Highway）— https://en.wikipedia.org/wiki/M41_highway
- [B77] Chapman's Peak — https://en.wikipedia.org/wiki/Chapman%27s_Peak
- [B78] † Chapman's Peak Drive 官网 — https://www.chapmanspeakdrive.co.za/the-drive/
- [B79] Fynbos — https://en.wikipedia.org/wiki/Fynbos
- [B80] Sani Pass — https://en.wikipedia.org/wiki/Sani_Pass
- [B81] Avenue of the Baobabs — https://en.wikipedia.org/wiki/Avenue_of_the_Baobabs
- [B82] Adansonia grandidieri — https://en.wikipedia.org/wiki/Adansonia_grandidieri
- [B83] Madagascar dry deciduous forests — https://en.wikipedia.org/wiki/Madagascar_dry_deciduous_forests
- [B84] Tizi n'Tichka — https://en.wikipedia.org/wiki/Tizi_n%27Tichka
- [B85] Carretera Austral — https://en.wikipedia.org/wiki/Carretera_Austral
- [B86] Valdivian temperate forests — https://en.wikipedia.org/wiki/Valdivian_temperate_forests
- [B87] Magellanic subpolar forests — https://en.wikipedia.org/wiki/Magellanic_subpolar_forests
- [B88] National Route 40 (Argentina) — https://en.wikipedia.org/wiki/National_Route_40_%28Argentina%29
- [B89] Yungas Road — https://en.wikipedia.org/wiki/Yungas_Road
- [B90] Bolivian Yungas — https://en.wikipedia.org/wiki/Bolivian_Yungas
- [B91] Central Andean puna — https://en.wikipedia.org/wiki/Central_Andean_puna
- [B92] Bealach na Bà — https://en.wikipedia.org/wiki/Bealach_na_B%C3%A0
- [B93] Dark Hedges — https://en.wikipedia.org/wiki/Dark_Hedges
- [B94] Cabot Trail — https://en.wikipedia.org/wiki/Cabot_Trail
- [B95] Hải Vân Pass — https://en.wikipedia.org/wiki/H%E1%BA%A3i_V%C3%A2n_Pass
- [B96] Nikkō National Park — https://en.wikipedia.org/wiki/Nikk%C5%8D_National_Park
- [B97] 交通运输部《公路路线设计规范》JTG D20—2017（英文版）— https://xxgk.mot.gov.cn/2020/jigou/glj/202107/P020210706517905491391.pdf
- [B98] Indian Roads Congress, IRC:52-2019 Recommendations about the Alignment Survey and Geometric Design of Hill Roads — https://law.resource.org/pub/in/bis/irc/irc.gov.in.052.2019.pdf

---

## 3 生态

### 3.1 十四个陆地生物群系（WWF 分类）

WWF 把陆地分成 14 个生物群系；按温度和降水两个轴划分生物群系的做法见 [C8]。柯本气候分类的数字门槛：热带气候各月均温 ≥ 18 °C；温带（C）最冷月在 0 °C（或 −3 °C）与 18 °C 之间且至少一个月 > 10 °C；寒温带（D）最冷月更低；苔原 ET 最暖月 0–10 °C [C7][C86]。每个群系下列出代表乔木（高度、冠形）、林下、花、昆虫、鸟和鱼；完整的树种表见 `landscape-params.md` 的 P9。冠形写“建模建议”的不是来源原话。

**1 热带亚热带湿润阔叶林（含热带雨林）**
- 气候：年降水 > 2,000 mm，全年温差小 [C11]；典型 1,750–3,000 mm；按一种常用的热带生态系统分类，真正的热带雨林年降水 > 2 m、年均温 > 24 °C [C12]。西双版纳年均温 18.6–22.9 °C，有热带雨林、季雨林、山地常绿阔叶林等 [C253]。
- 结构：冠层之上有零星突出树，高 45–55 m，少数种 70–80 m [C12]。
- 乔木：娑罗双属（Shorea），已知最高的热带被子植物 100.8 m，沙巴另有 5 种超过 80 m [C231]；吉贝（Ceiba pentandra）高 60 m，有板根，4–6 根粗枝组成可宽达 60 m 的树冠 [C230]；孟加拉榕（Ficus benghalensis）高 30 m，树冠直径通常大于树高 [C232]；夏威夷的多形铁心木 20–25 m，在沼泽和新熔岩上则长成匍匐灌木 [C233]。
- 鸟：犀鸟，吃果子的种多在森林 [C131]。
- 鱼：喜马拉雅急流里的金色结鱼 [C147]；红树林泥滩的弹涂鱼 [C149]。
- 夜：东南亚红树林里的同步萤（3.2）。

**2 热带亚热带干旱阔叶林**
- 气候：旱季落叶，多分布在 10–20°N 和 10–20°S 两条带 [C13]。
- 结构：落叶后冠层打开，林下灌丛浓密 [C13]；马达加斯加干旱落叶林冠层 10–15 m，海拔 0–600 m [B83]。
- 乔木：柚木（条目举例）[C13]；格氏猴面包树 25–30 m，平顶，主枝水平 [B82]；非洲猴面包树 5–25 m，干径可达 10–14 m [C234]。
- 动物：环尾狐猴（落叶林、干灌丛、河岸林）[C130]。

**3 热带亚热带针叶林**
- 主要在北美和中美；冠层郁闭，林下光少、灌木少 [C14]。
- 同类景观：喜马拉雅亚热带松林以长叶松为主，在 1,000–2,000 m [C39]。

**4 温带阔叶与混交林**
- 气候：降水多在 600 mm 以上，常 > 1,500 mm [C15]。
- 结构：冠层 30–60 m；冠层下有比它矮 9–15 m 的亚冠层，再下是灌木层 [C15]。
- 乔木：欧洲水青冈一般 25–35 m（最高 50 m），开阔处干短、低枝多，树皮光滑银灰 [C61]；夏栎一般 20 m（可达 40 m）[C62]；日本水青冈 35 m，圆冠、低处粗枝、树皮浅灰白 [C204]；鸡爪槭 6–10 m、冠宽 4.5–10 m，是林下树，形态从直立到下垂 [C205]；糖槭 25–35 m [C248]；北美鹅掌楸可超过 50 m，塔形冠，25–30 m 以下无枝 [C247]；榉树 30 m，短干分出许多斜展枝，形成宽圆顶 [C207]；樟 20–30 m，日本有 5 株胸围超过 20 m 的古樟 [C206]。
- 林下与花：英国古老林地里，蓝铃花开成蓝紫色花毯 [C97]；日本林缘的石蒜 8 月底到 9 月初先花后叶 [C98]。
- 昆虫：源氏萤和平家萤（3.2）；暮蝉在清晨和黄昏鸣叫 [C173]。
- 鸟：灰林鸮、长尾林鸮、横斑林鸮（郁闭林）[C169][C170][C171]。
- 鱼：山溪和大湖的褐鳟 [C138]；日本河里的香鱼，冬季在沿海 [C140]。

**5 温带针叶林（含温带雨林）**
- 气候：沿海冬暖多雨，或内陆偏干的山地；结构简单，多为冠层与林下两层 [C16]。温带雨林年降水 > 1,400 mm，冠层针叶树可高达 100 m 以上；屋久岛年降水 4,000–10,000 mm [C17]。
- 乔木：北美红杉一般 60–100 m，有记录可到 116 m，胸径可达 8.9 m [C63]；巨杉 50–85 m，干径 6–8 m，林分在 1,400–2,150 m [C64]；花旗松 20–100 m [C65]；北美乔柏 45–70 m [C182]；异叶铁杉 50–70 m [C183]；北美云杉可超过 100 m [C184]；日本柳杉可达 60 m [C202]；日本扁柏 35 m [C203]；雪松 40–50 m，锥形冠、枝平展、小枝下垂，生于 1,500–3,200 m [C217]。
- 林下：红杉林的越橘、雪果和蕨墙 [B30]。
- 动物：海岸、大湖与河流边的白头海雕 [C136]；鲑鱼洄游时聚到溪边的灰熊 [C129]；红鲑 [C139]。

**6 北方针叶林（泰加林）**
- 气候：年均温一般 −5…5 °C，年降水 200–750 mm（局部 1,000 mm）[C18]；东西伯利亚泰加林极端温度 40 °C 到 −65 °C，年降水 200–600 mm [C83]；大兴安岭一带属冬干的亚北极气候 Dwc，只有 1–3 个月均温超过 10 °C [C84]。阿尔山年均温 −3.2 °C、年降水 449 mm，处在森林与草原的过渡带，有亚洲最大的樟子松原始林 [C85]。
- 结构：以松和云杉为主，东部混有西伯利亚云杉和西伯利亚落叶松 [C82]；北极林线附近是开阔的“地衣疏林”，地面铺着石蕊地衣 [C2]。
- 乔木：欧洲云杉 35–55 m [C59]；欧洲赤松 ≤ 35 m（好地方 > 45 m），北方从海平面到 1,000 m、南方是 1,200–2,600 m 的山地树 [C193]；新疆落叶松 20–50 m，幼时锥形、老时宽，侧枝下垂 [C194]；兴安落叶松 10–30 m，宽锥形 [C195]；西伯利亚云杉 15–35 m，锥形、小枝下垂 [C196]；西伯利亚冷杉 30–35 m，锥形 [C197]；垂枝桦 15–25 m，干细 [C191]；毛桦 10–20 m，冠细 [C192]；白云杉幼时窄锥、老时柱形带锥顶 [C199]；黑云杉 5–15 m，窄尖冠 [C200]；美洲颤杨 15–18 m [C187]。
- 林下：越橘类（蔓越橘、欧洲越橘）[C83]；柳兰，洋红色，0.5–2 m [C101]。
- 动物：驼鹿、驯鹿 [C128]。
- 鱼：白斑狗鱼、河鲈 [C144][C145]；北极茴鱼 [C148]；哲罗鲑（传说喀纳斯湖有巨型哲罗鲑）[C143]。

**7 温带草原、稀树草原与灌丛**
- 以草和灌木为主；湿润一侧是高草草原，欧亚草原西北部和潘帕斯土壤肥沃 [C19][C254]。
- 天山 1,100–2,700 m 的草原以羊茅和针茅为主 [C79]；巴塔哥尼亚草原夏季白天 24–31 °C、夜里 6–15 °C [C90]。
- 鸟：云雀在欧亚大陆繁殖 [C133]；丹顶鹤在湿草地与浅河觅食，越冬在长江中下游 [C114]；大天鹅迁徙时飞行高度 50–200 m [C115]。

**8 热带亚热带草原（萨瓦纳）**
- 气候：年降水 500–1,270 mm，集中在 6–8 个月，其余为旱季 [C20]；另一条目给 900–1,500 mm 或 250–1,500 mm，且常不稳定 [C21]。
- 结构：冠层开阔，阳光下是连续的草层 [C20]。
- 乔木：伞刺金合欢可高 21 m，树冠伞形开展 [C235]；猴面包树（见第 2 类）。
- 鸟：织布鸟（撒哈拉以南非洲）[C132]。

**9 水淹草地与稀树草原**
- 季节性淹水的大湿地群，对迁徙鸟类很重要 [C22]。

**10 山地草地与灌丛**
- 植物可长到 4,500–4,600 m [C23]。包括：安第斯帕拉莫（3,000–3,500 m 起到 5,000 m 雪线 [C31]；亚帕拉莫 3,000–3,500 m 是森林与草地的过渡；超帕拉莫 4,500–4,800 m [C30]）、中安第斯普纳（3,200–6,600 m，年降水 250–500 mm，低处有 Polylepis [C32]）、东非高山荒原（3,500 m 以上，3,500–4,500 m 有高达 8 m 的巨型千里光和半边莲，4,500 m 以上是垫状植物，到约 5,000 m 为止 [C35]）、青藏高原高山灌丛草甸（4,000 m 以上，西部寒冷高山草原、东部湿草甸 [C93]）、东喜马拉雅高山灌丛草甸（4,000–5,500 m，林线附近是杜鹃矮曲林 [C42]）。
- 树与灌木：Polylepis 多扭曲，个别 15–20 m，P. tarapacana 可到 4,800 m [C226]；树石南在非洲山地 3,000–4,000 m 的林线以上成灌丛 [C229]。
- 花：绿绒蒿多为蓝花 [C104]；风毛菊（雪莲）花头白到紫、被绒毛 [C105]；雪绒花 [C94]。
- 动物：牦牛（3,000–5,000 m 牧场）[C120]、藏羚羊（3,250–5,500 m）[C121]、岩羊（2,200–5,500 m）[C118]、雪豹（3,000–4,500 m，冬降到 1,200–2,000 m）[C119]、斑头雁（中亚高原湖）[C116]、安第斯神鹫（到 5,000 m）[C112]、胡兀鹫（多在 2,000 m 以上）[C111]。
- 鱼：裂腹鱼属（高原河湖）[C141]；青海湖裸鲤只在青海湖及其支流 [C142]。

**11 苔原**
- 北极年降水 150–250 mm；植被是矮灌木、莎草、禾草、苔藓和地衣 [C24]；最暖月 0–10 °C（ET）[C86]。
- 花：仙女木，8 片乳白花瓣 [C102]。
- 动物：雷鸟（岩坡与苔原）[C134]；驯鹿 [C128]。
- 鱼：北极红点鲑，北极–亚北极海岸和高山湖，多在 3 m 以内的浅水 [C137]。

**12 地中海森林、林地与灌丛**
- 夏干冬雨；硬叶植物叶小、色深、有蜡层；地中海和加州的栎类与混交硬叶林、西南澳的桉树林、智利中部的假山毛榉林 [C25]。
- 乔木：冬青栎 21–28 m，开阔处冠宽如高，老树枝梢下垂 [C236]；栓皮栎 10–15 m，树冠从 2–3 m 起分枝、宽展、分成几团圆冠 [C237]；意大利石松 12–20 m，幼时球形、中年伞形、老时宽平冠 > 8 m [C238]；地中海柏木 35 m，野生锥形，栽培的多为窄柱，宽不到高的十分之一 [C239]。
- 开普硬叶灌丛与帝王花见 2.5 节。

**13 荒漠与干旱灌丛**
- 多数年降水 < 250 mm，蒸发大于降水，昼夜温差大，以木本灌丛为主 [C26]；撒哈拉多数地方 < 100 mm [C89]。
- 植物：约书亚树 ≤ 15 m，长在莫哈韦 400–1,800 m [C240]；巨人柱 3–16 m [C241]；梭梭 2–8 m，长在沙地和沙丘上，到 1,600 m [C242]；胡杨约 15 m、胸围 2.5 m [C243]。

**14 红树林**
- 真红树约 70 种、20 属；呼吸根一般高 30 cm，个别种 > 3 m [C28]。美洲红树最高 24 m、常见 6 m [C244]；白骨壤 3–10 m（热带可到 14 m），呼吸根约 20 cm [C245]。

**补充：云雾林。** 多在 25°N–25°S，海拔约 500–4,000 m，年均温 8–20 °C，年降水 500–10,000 mm [C29]。

### 3.2 萤火虫与其他夜光生物

| 种 | 地区 | 月份 | 时间 | 生境 | 行为 | 来源 |
|---|---|---|---|---|---|---|
| 同步萤 Photinus carolinus | 美国大雾山（Elkmont） | 盛期 5 月第 3 周到 6 月第 3 周，持续 2–3 周 | 约 21:30 天全黑后 | 树龄 65 年以上的阔叶林、山谷，427–1,829 m | 5–8 闪后黑 8 秒，全群同步 | [C152][C153] |
| 北美常见萤 Photinus pyralis | 北美东部 | 夏 | 黄昏 | 草甸、田野、湿地、峡谷、密林，各阶段都要湿润 | 成虫闪光，蛹也微光 | [C154] |
| 源氏萤 Nipponoluciola cruciata | 日本 | 成虫 5–7 月；观赏多在 5 月上旬到 6 月下旬† | 晚上 8 点前后最盛† | 小水沟、溪流（泥或卵石底），幼虫水生 | 成虫发光飞行约一周† | [C155][C156][C157] |
| 平家萤 Aquatica lateralis | 日本 | 4–11 月，6–8 月最多 | 夜 | 稻田（幼虫） | 雄虫飞行闪光，雌虫在 5–10 cm 外回应 | [C158] |
| 欧洲萤 Lampyris noctiluca | 欧洲 | 6–8 月 | 夜，雌虫每晚亮约 2 小时 | 开阔处；白天藏在落叶或土里 | 雌虫不飞，持续发光 | [C159] |
| 同步萤 Pteroptyx | 马来西亚、泰国、菲律宾、香港 | — | 夜 | 河岸红树林的“萤火树” | 同步闪光 | [C160][C151] |
| 新西兰萤火虫 Arachnocampa luminosa | 新西兰 | 全年（幼虫期） | 黑暗处 | 洞穴与潮湿河岸 | 蕈蚊幼虫垂丝捕食摇蚊 | [C161][C162] |
| 狐火（发光真菌） | 各地 | 湿季 | 夜 | 腐木 | 蓝绿微光 | [C163] |

萤火虫在 10 °C（50 °F）以下不太活跃 [C152]。大雾山国家公园有 19 种萤火虫，全世界已描述 2,000 多种 [C152]。

### 3.3 山地垂直带谱

带谱在各山系顺序相似，高度随纬度和大陆性变化；生态学通常把它分成山麓、山地、亚高山、高山、亚冰雪带等 [C4]。林线是最关键的边界，它把山地带与高山带分开，在林线附近树木常稀疏、矮小、被风扭曲成矮曲林 [C4]。

**阿尔卑斯（约 46°N）**
- 落叶阔叶（栎、水青冈、白蜡、欧亚槭）的上限：北坡约 1,200 m，南坡常到 1,500 m，有时 1,700 m [C54]。
- 欧洲银冷杉在 300–1,700 m（主要 500 m 以上），要求年降水 > 1,000 mm [C56]；欧洲落叶松多在 1,000–2,000 m，可到 2,400 m 的林线 [C60]；瑞士石松 1,200–2,300 m [C57]。
- 林线：东阿尔卑斯 1,750 m，瑞士阿尔卑斯 2,200 m，皮埃蒙特 2,100 m [C2]；林线一带常见瑞士石松 [B11]。
- 林线以上：先是欧洲山松带（亚种 mugo 是 1–4 m 的多干灌木 [C58]），再是高山玫瑰（酸性土 R. ferrugineum，碱性土 R. hirsutum）[C54]；高山玫瑰整个夏季开粉红钟形花、高 ≤ 1.5 m [C95]。
- 高山草甸：40 种龙胆在 1,500–2,400 m，早春开花 [C54]。
- 冰雪：高地陶恩约 2,800 m 进入冰雪带 [B11]；阿尔卑斯雪线略低于 3,000 m [C3]。
- 生态区：从低坡一直到 4,809 m 的勃朗峰 [C55]。

**落基山**
- 科罗拉多（约 40°N）：山地带上界约 2,743–2,896 m，亚高山带到约 3,353–3,475 m，以上是高山苔原† [B35]；林线西南坡 3,550 m、东北坡 3,250 m [C2]；林线矮曲林以狐尾松为主 [C49]。
- 林线随纬度：从新墨西哥的约 3,660 m 降到育空附近的约 760 m [C48]。
- 加拿大（约 51°N）：林线 2,300–2,400 m [B27][C2]；山地带扭叶松为主，亚高山带恩氏云杉、亚高山冷杉 [B27]。北落基山生态区（加拿大部分）年均温 3.5–5.5 °C，谷地年降水 500–800 mm，高处 > 1,000 mm [C50]。
- 同纬度的大峡谷：下索诺兰带从河面到 1,067 m，上索诺兰带 1,067–2,134 m，西黄松林 1,981–2,499 m [C52]。内华达山脉下山地林（西黄松、杰弗里松）西坡 762–2,134 m、东坡 2,134–2,743 m [C51]。

**东喜马拉雅与横断山（约 27–30°N）**
- 亚热带阔叶林（娑罗树、诃子、羊蹄甲、木荷、栲）在 1,000 m 以下，往上转为亚热带松林 [C38]；松林（长叶松）在 1,000–2,000 m [C39]。
- 温带阔叶林 2,000–3,000 m：坎氏槭、核桃、尼泊尔桤木、西南桦、糙皮桦、西藏红杉、云南铁杉、麦吊云杉等 [C40]。
- 亚高山针叶林 3,000–4,000 m；东喜马拉雅受孟加拉湾季风滋润，林线 4,500 m，西喜马拉雅只有 3,000 m [C41]；西喜马拉雅亚高山针叶带在 3,000–3,500 m [C43]。
- 高山灌丛草甸 4,000–5,500 m，林线附近是杜鹃矮曲林；5,500 m 以上为永久冰雪 [C42]。
- 喜马拉雅已知最高的树是藏东南 4,900 m 的大果圆柏 [C37]；昆布林线 4,200 m [C2]；糙皮桦可长到 4,500 m [C219]；乔松 1,800–4,300 m [C218]。
- 横断山亚高山针叶林可到 4,000 m 以上，直到林线，林线以上是藏东南灌丛草甸 [C44]。
- 贡嘎山东坡：从大渡河谷到峰顶水平 29 km、高差 6,400 m，带谱完整 [C45]；文献划为 7–8 个带；采样点：落叶阔叶林约 2,343 m、针阔混交林约 2,780 m、以峨眉冷杉为主的暗针叶林约 3,160 m；冷杉与云杉花粉指示 2,700–3,700 m 的暗针叶林与林线；峨眉冷杉在 3,550 m 以上生长明显受限† [C46]。海螺沟冰舌伸进峨眉冷杉林带 5.3 km，末端 2,980 m [A31]。

**热带安第斯**
- 云雾林：玻利维亚永加斯 400–3,500 m [C33]。
- 林线：秘鲁东坡 3,900 m；玻利维亚西科迪勒拉 5,200 m（Polylepis tarapacana，世界最高林线），东科迪勒拉 4,100 m [C2]。
- 北段（湿）：帕拉莫从 3,000–3,500 m 到 5,000 m 雪线 [C31]。
- 中段（干）：普纳 3,200–6,600 m [C32]。
- 雪线见 3.4。

**乞力马扎罗（3°S）**
- 坡麓：北、西坡是金合欢稀树草原（金合欢、风车子、榄仁、扁担杆），南、东坡多已开垦 [C36]。
- 1,000–1,800 m：咖啡与家园农林 [C36]。
- 山地林：南坡先是 Ocotea usambarensis、蕨类与附生植物；往上是云雾林，有罗汉松（Podocarpus latifolius）、苦苏（Hagenia abyssinica）和树状石南，以及靠雾生长的苔藓；北坡干燥，按海拔依次是油橄榄、Croton–Calodendrum、Cassipourea、刺柏林 [C36]。2,000–2,300 m 的森林带降水最多（部分超过 3,000 mm）[C36]。
- 林线 3,100 m；石南灌丛到 3,900 m [C2]；3,100–3,900 m 是石南灌丛与荒原，往上蜡菊到 4,500 m [C36]。
- 巨型千里光（Dendrosenecio kilimanjari）长在 4,000 m 以下 [C228]；东非高山荒原 3,500–4,500 m 的巨型千里光和半边莲高可达 8 m [C35]。
- 东非山地林：高山竹 2,400–3,000 m（肯尼亚山到 3,500 m）[C34]；苦苏多在 2,000–3,000 m、年降水 1,000–1,500 mm 处 [C227]。

**日本本州中部（约 36°N）**
- 常绿阔叶（照叶林）到约 700–750 m；水青冈落叶林约 700–1,600 m；亚高山针叶林（大白时冷杉、维氏冷杉）约 1,600–2,500 m；2,500 m 以上是偃松矮曲林与高山草甸† [C68]；《日本植物志》条目称中部的落叶林在 1,000 m 以上† [C69]；环境省中部地区图表显示亚高山带约 1,500–2,500 m†，奥日光的亚高山带从约 1,475 m（汤之湖）开始、高山带从约 2,400 m（白根山）开始† [C70]。
- 太平洋侧东北部日本水青冈可到 1,400 m [C71]；日本海侧落叶林区平均海拔 523 m，个别山峰伸入本州高山针叶林 [C72]；太平洋侧低地是照叶林，内陆是栎林 [C73]。
- 维氏冷杉 25–30 m，窄锥形，生于 1,500–2,800 m [C214]；偃松是 1–6 m 的匍匐灌木，单丛直径可达 25–30 m [C213]；岳桦 20 m [C212]。
- 北海道针叶带上到约 1,500 m [C74]；知床森林上限以上是偃松丛 [B68]。
- 注意：维基百科林线表把日本阿尔卑斯林线列为 2,900 m [C2]，与上面的 2,500 m 不一致，可能是把偃松矮曲林计入“树”的结果。

**长白山（约 42°N）**
- 从河谷到主峰依次是温带阔叶林 → 长白美人松等针叶林 → 低矮匍匐的岳桦 → 高山草甸 → 苔藓地衣 → 裸岩与火山灰 → 积雪与冰川 [C77]。
- 数字：暗针叶带 1,100–1,900 m [C76]；岳桦与落叶松 1,700–2,000 m，2,000 m 以上为苔原 [C75]。
- 气候：年均温 3–7 °C；年降水 600 mm 以上，高处超过 1,400 mm；积雪期 11 月到次年 4 月 [C77]。

**天山北坡（约 43°N，干旱大陆性）**
- 山地草原 → 山地草甸草原 → 针叶林 → 高山草原（草甸）→ 高山垫状植物 → 积雪 [B49]。
- 针叶林在阴坡 1,500 m（以下太干）到 2,700–3,200 m（以上太冷），低处混有颤杨 [C78]；雪岭云杉 40–50 m，窄锥形、枝平展、小枝有时下垂，生于 1,200–3,500 m [C216]。
- 冰雪带 3,800–4,200 m 以上；天山约有 7,000 条现代冰川，面积约 1 万 km²；干旱低山带在 1,300–1,500 m 以下，年降水 200–400 mm（南坡更干）[B49]。冬季常有逆温（10 月到次年 4 月）[B49]。
- 天山山地草原 1,100–2,700 m 以羊茅、针茅为主 [C79]；低坡有野核桃和野苹果林 [C80]。

**台湾（约 23–24°N）**
- 低地与沿海是厚壳桂–栲的常绿阔叶林，夹马尾松；最高处是台湾铁杉、台湾云杉、台湾冷杉 [C81]。
- 太鲁阁年均温从 100 m 的 23 °C 降到 3,000 m 的 7 °C [A55]；玉山林线 3,600 m [C2]；合欢山高处是玉山箭竹草原和杜鹃花丛 [B61]。

### 3.4 林线、雪线与温度递减

- 温度递减：国际标准大气 6.5 °C/km；干空气绝热 9.8 °C/km [C1]；喜马拉雅每升 300 m 降 2.0 °C [C37]；太鲁阁 100 m → 3,000 m 降 16 °C（≈5.5 °C/km ≈算，[A55]）；大雾山山顶比谷地日高温低 5.6–7.2 °C（高差约 1,036 m）[C53]。上升 100 m 大致相当于向极地移动 80 km [C10]。
- 林线：30°N–20°S 之间大致恒定在 3,500–4,000 m；70→50°N 每向南 1° 纬度升 75 m，50→30°N 每 1° 升 130 m [C2]。林线的温度阈值是生长季平均气温约 6 °C（只计日均温 > 0.9 °C 的日子），至少要 94 天 [C2]；另一说法是月均土温不超过 10 °C、年均土温约 6.7 °C 的高度 [C4]。林线比永久雪线低 300–1,000 m，大致平行 [C2]。
- 大陆性与海洋性：同纬度下，海洋性气候让夏季凉、林线低（苏格兰 57°N 只有 500 m；挪威南部内陆 1,100 m、近海 500–600 m），大陆内部高（加拿大落基山 51°N 2,400 m；落基山国家公园 40°N 3,250–3,550 m）；岛屿也可能因缺少耐寒树种而偏低（夏威夷 3,000 m）[C2]。
- 雪线：赤道附近约 4,500 m；往回归线方向先升高，喜马拉雅可达 5,700 m；北半球最高的雪线在青藏西部的 Nganglong Kangri，6,200 m；出了热带随纬度下降，阿尔卑斯略低于 3,000 m，到极地冰盖降到海平面；近海比内陆低，因为冬雪多、夏季凉 [C3]。安第斯：热带段 4,500–4,800 m，秘鲁南部到智利北部的干旱山地 4,800–5,200 m（到约 30°S），32°S 4,500 m，40°S 2,000 m，50°S 500 m，55°S 300 m [C47]。
- 完整的林线表与规则见 `landscape-params.md` P6。

### 3.5 生态过渡带：什么接着什么，过渡有多宽

- **沿海拔。** 顺序见 3.3。林线很少是一条线，而是一条过渡带：郁闭林 → 稀疏矮小、被风扭曲的矮曲林 → 高山 [C2][C4]。贡嘎山峨眉冷杉 3,550 m 以上生长受限，林线带在约 3,700 m [C46]，即过渡带约 150–200 m 高差；按路的平均坡度 7% 换算，相当于沿路 2–3 km（≈算）。背风沟积雪能让林线局部低 400 m [C2]。矮曲林所在的雪堆积带常有越橘、石楠类等小灌木 [C11a]。
- **沿纬度。** 北美西北部的北极森林–苔原过渡带平均约 145 km 宽，由西向东变宽；带内分两部分：散生矮曲林夹在苔原中的“森林–苔原”，和开阔的“地衣疏林” [C2]。生态过渡带可以窄（田与林之间），也可以是区域性的（森林与草原之间），例如泰国–马来半岛的克拉过渡带在 11–13°N 之间 [C9]。
- **海拔与纬度的换算。** 上升 100 m ≈ 向极地 80 km [C10]：山上几百米的过渡，相当于平地上几百公里的变化，所以山路上的生态变化快得多。
- **沿湿度（雨影）。** 大苏尔：迎海的峡谷有红杉，过了山脊雨影里森林消失，变成开阔的橡树林地，再变成丛林 [B20]。列城–马纳利：过了 Atal 隧道进入雨影里的 Chandra 河谷，绿色逐渐消失 [B74]。智利麦哲伦亚极地林西侧年降水 4,000 mm、东侧 450 mm [B87]。天山北坡年降水 > 500 mm，南坡低山只有 100–150 mm [B49]。
- **离海距离。** 红杉多长在离海 1.5–3 km 以外，但从不超过离海 80 km [B30]；近海的林线和雪线都更低 [C2][C3]；北加州海岸草地多在 305 m 以下的海岸阶地，海岸灌丛在 457 m 以下 [C87]。
- **森林与草原。** 阿尔山处在四大草原交汇处，属森林与草原的过渡带，森林覆盖率超过八成 [C85]；开阔的桉树疏林冠层覆盖只有 10–30% [C88]；萨瓦纳是开阔冠层下的连续草层 [C20]。
- **过渡的“厚度”给游戏的含义【综合】：** 海拔上的过渡以一两百米计（沿路几公里）；雨影的干湿转换可以在一道山脊、十几公里内完成；纬度上的过渡以百公里计，在一段 10 分钟的路程里看不出来，只能靠“翻山”或“下海岸”这类地形事件来切换。

### 第 3 节来源

- [C1] Lapse rate — https://en.wikipedia.org/wiki/Lapse_rate
- [C2] Tree line — https://en.wikipedia.org/wiki/Tree_line
- [C3] Snow line — https://en.wikipedia.org/wiki/Snow_line
- [C4] Altitudinal zonation — https://en.wikipedia.org/wiki/Altitudinal_zonation
- [C5] Visibility — https://en.wikipedia.org/wiki/Visibility
- [C6] Horizon — https://en.wikipedia.org/wiki/Horizon
- [C7] Köppen climate classification — https://en.wikipedia.org/wiki/K%C3%B6ppen_climate_classification
- [C8] Biome — https://en.wikipedia.org/wiki/Biome
- [C9] Ecotone — https://en.wikipedia.org/wiki/Ecotone
- [C10] Alpine tundra — https://en.wikipedia.org/wiki/Alpine_tundra
- [C11] Tropical and subtropical moist broadleaf forests — https://en.wikipedia.org/wiki/Tropical_and_subtropical_moist_broadleaf_forests
- [C11a] Krummholz — https://en.wikipedia.org/wiki/Krummholz
- [C12] Tropical rainforest — https://en.wikipedia.org/wiki/Tropical_rainforest
- [C13] Tropical and subtropical dry broadleaf forests — https://en.wikipedia.org/wiki/Tropical_and_subtropical_dry_broadleaf_forests
- [C14] Tropical and subtropical coniferous forests — https://en.wikipedia.org/wiki/Tropical_and_subtropical_coniferous_forests
- [C15] Temperate broadleaf and mixed forests — https://en.wikipedia.org/wiki/Temperate_broadleaf_and_mixed_forests
- [C16] Temperate coniferous forest — https://en.wikipedia.org/wiki/Temperate_coniferous_forest
- [C17] Temperate rainforest — https://en.wikipedia.org/wiki/Temperate_rainforest
- [C18] Taiga — https://en.wikipedia.org/wiki/Taiga
- [C19] Temperate grasslands, savannas, and shrublands — https://en.wikipedia.org/wiki/Temperate_grasslands,_savannas,_and_shrublands
- [C20] Savanna — https://en.wikipedia.org/wiki/Savanna
- [C21] Tropical and subtropical grasslands, savannas, and shrublands — https://en.wikipedia.org/wiki/Tropical_and_subtropical_grasslands,_savannas,_and_shrublands
- [C22] Flooded grasslands and savannas — https://en.wikipedia.org/wiki/Flooded_grasslands_and_savannas
- [C23] Montane grasslands and shrublands — https://en.wikipedia.org/wiki/Montane_grasslands_and_shrublands
- [C24] Tundra — https://en.wikipedia.org/wiki/Tundra
- [C25] Mediterranean forests, woodlands, and scrub — https://en.wikipedia.org/wiki/Mediterranean_forests,_woodlands,_and_scrub
- [C26] Deserts and xeric shrublands — https://en.wikipedia.org/wiki/Deserts_and_xeric_shrublands
- [C27] Appalachian–Blue Ridge forests — https://en.wikipedia.org/wiki/Appalachian%E2%80%93Blue_Ridge_forests
- [C28] Mangrove — https://en.wikipedia.org/wiki/Mangrove
- [C29] Cloud forest — https://en.wikipedia.org/wiki/Cloud_forest
- [C30] Páramo — https://en.wikipedia.org/wiki/P%C3%A1ramo
- [C31] Northern Andean páramo — https://en.wikipedia.org/wiki/Northern_Andean_p%C3%A1ramo
- [C32] Central Andean puna — https://en.wikipedia.org/wiki/Central_Andean_puna
- [C33] Bolivian Yungas — https://en.wikipedia.org/wiki/Bolivian_Yungas
- [C34] East African montane forests — https://en.wikipedia.org/wiki/East_African_montane_forests
- [C35] East African montane moorlands — https://en.wikipedia.org/wiki/East_African_montane_moorlands
- [C36] Mount Kilimanjaro — https://en.wikipedia.org/wiki/Mount_Kilimanjaro
- [C37] Himalayas — https://en.wikipedia.org/wiki/Himalayas
- [C38] Himalayan subtropical broadleaf forests — https://en.wikipedia.org/wiki/Himalayan_subtropical_broadleaf_forests
- [C39] Himalayan subtropical pine forests — https://en.wikipedia.org/wiki/Himalayan_subtropical_pine_forests
- [C40] Eastern Himalayan broadleaf forests — https://en.wikipedia.org/wiki/Eastern_Himalayan_broadleaf_forests
- [C41] Eastern Himalayan subalpine conifer forests — https://en.wikipedia.org/wiki/Eastern_Himalayan_subalpine_conifer_forests
- [C42] Eastern Himalayan alpine shrub and meadows — https://en.wikipedia.org/wiki/Eastern_Himalayan_alpine_shrub_and_meadows
- [C43] Western Himalayan subalpine conifer forests — https://en.wikipedia.org/wiki/Western_Himalayan_subalpine_conifer_forests
- [C44] Hengduan Mountains subalpine conifer forests — https://en.wikipedia.org/wiki/Hengduan_Mountains_subalpine_conifer_forests
- [C45] 贡嘎山（中文维基）— https://zh.wikipedia.org/wiki/贡嘎山
- [C46] † 贡嘎山东坡植被带文献（检索摘要）：Chinese Science Bulletin 2012 花粉研究 — https://link.springer.com/article/10.1007/s11434-012-5236-6 ；《生物多样性》2004 年 12(2) — https://www.biodiversity-science.net/EN/Y2004/V12/I2/237 ；《生态学报》土壤动物研究 — https://www.ecologica.cn/stxb/article/pdf/stxb201305311258 ；PMC 文章 — https://pmc.ncbi.nlm.nih.gov/articles/PMC3445534
- [C47] Andes — https://en.wikipedia.org/wiki/Andes
- [C48] Rocky Mountains — https://en.wikipedia.org/wiki/Rocky_Mountains
- [C49] Colorado Rockies forests — https://en.wikipedia.org/wiki/Colorado_Rockies_forests
- [C50] North Central Rockies forests — https://en.wikipedia.org/wiki/North_Central_Rockies_forests
- [C51] Sierra Nevada — https://en.wikipedia.org/wiki/Sierra_Nevada
- [C52] Grand Canyon — https://en.wikipedia.org/wiki/Grand_Canyon
- [C53] Great Smoky Mountains — https://en.wikipedia.org/wiki/Great_Smoky_Mountains
- [C54] Alps — https://en.wikipedia.org/wiki/Alps
- [C55] Alps conifer and mixed forests — https://en.wikipedia.org/wiki/Alps_conifer_and_mixed_forests
- [C56] Abies alba — https://en.wikipedia.org/wiki/Abies_alba
- [C57] Pinus cembra — https://en.wikipedia.org/wiki/Pinus_cembra
- [C58] Pinus mugo — https://en.wikipedia.org/wiki/Pinus_mugo
- [C59] Picea abies — https://en.wikipedia.org/wiki/Picea_abies
- [C60] Larix decidua — https://en.wikipedia.org/wiki/Larix_decidua
- [C61] Fagus sylvatica — https://en.wikipedia.org/wiki/Fagus_sylvatica
- [C62] Quercus robur — https://en.wikipedia.org/wiki/Quercus_robur
- [C63] Sequoia sempervirens — https://en.wikipedia.org/wiki/Sequoia_sempervirens
- [C64] Sequoiadendron giganteum — https://en.wikipedia.org/wiki/Sequoiadendron_giganteum
- [C65] Douglas fir — https://en.wikipedia.org/wiki/Douglas_fir
- [C66] Eucalyptus regnans — https://en.wikipedia.org/wiki/Eucalyptus_regnans
- [C67] Dicksonia antarctica — https://en.wikipedia.org/wiki/Dicksonia_antarctica
- [C68] † 横滨国立大学：A Vegetation Ecological View of the Japanese Archipelago — https://ynu.repo.nii.ac.jp/record/5264/files/biest111085.pdf
- [C69] † Flora of Japan — https://en.wikipedia.org/wiki/Flora_of_Japan
- [C70] † 环境省资料（中部植被带）— https://www.env.go.jp/content/900492593.pdf ；† 国土交通省多语种解说（奥日光）— https://www.mlit.go.jp/tagengo-db/common/001563583.pdf
- [C71] Taiheiyo montane deciduous forests — https://en.wikipedia.org/wiki/Taiheiyo_montane_deciduous_forests
- [C72] Nihonkai montane deciduous forests — https://en.wikipedia.org/wiki/Nihonkai_montane_deciduous_forests
- [C73] Taiheiyo evergreen forests — https://en.wikipedia.org/wiki/Taiheiyo_evergreen_forests
- [C74] Hokkaidō montane conifer forests — https://en.wikipedia.org/wiki/Hokkaid%C5%8D_montane_conifer_forests
- [C75] Changbai Mountains — https://en.wikipedia.org/wiki/Changbai_Mountains
- [C76] Changbai Mountains mixed forests — https://en.wikipedia.org/wiki/Changbai_Mountains_mixed_forests
- [C77] 长白山（中文维基）— https://zh.wikipedia.org/wiki/长白山
- [C78] Tian Shan montane conifer forests — https://en.wikipedia.org/wiki/Tian_Shan_montane_conifer_forests
- [C79] Tian Shan montane steppe and meadows — https://en.wikipedia.org/wiki/Tian_Shan_montane_steppe_and_meadows
- [C80] Tian Shan — https://en.wikipedia.org/wiki/Tian_Shan
- [C81] Taiwan subtropical evergreen forests — https://en.wikipedia.org/wiki/Taiwan_subtropical_evergreen_forests
- [C82] Scandinavian and Russian taiga — https://en.wikipedia.org/wiki/Scandinavian_and_Russian_taiga
- [C83] East Siberian taiga — https://en.wikipedia.org/wiki/East_Siberian_taiga
- [C84] Da Hinggan–Dzhagdy Mountains conifer forests — https://en.wikipedia.org/wiki/Da_Hinggan%E2%80%93Dzhagdy_Mountains_conifer_forests
- [C85] 阿尔山市（中文维基）— https://zh.wikipedia.org/wiki/阿尔山市
- [C86] Kalaallit Nunaat high arctic tundra — https://en.wikipedia.org/wiki/Kalaallit_Nunaat_high_arctic_tundra
- [C87] Northern California coastal forests — https://en.wikipedia.org/wiki/Northern_California_coastal_forests
- [C88] Southeast Australia temperate forests — https://en.wikipedia.org/wiki/Southeast_Australia_temperate_forests
- [C89] Sahara Desert (ecoregion) — https://en.wikipedia.org/wiki/Sahara_Desert_%28ecoregion%29
- [C90] Patagonian Desert — https://en.wikipedia.org/wiki/Patagonian_Desert
- [C93] Tibetan Plateau alpine shrublands and meadows — https://en.wikipedia.org/wiki/Tibetan_Plateau_alpine_shrublands_and_meadows
- [C94] Edelweiss — https://en.wikipedia.org/wiki/Edelweiss
- [C95] Rhododendron ferrugineum — https://en.wikipedia.org/wiki/Rhododendron_ferrugineum
- [C96] Calluna — https://en.wikipedia.org/wiki/Calluna
- [C97] Hyacinthoides non-scripta — https://en.wikipedia.org/wiki/Hyacinthoides_non-scripta
- [C98] Lycoris radiata — https://en.wikipedia.org/wiki/Lycoris_radiata
- [C99] Xerophyllum tenax — https://en.wikipedia.org/wiki/Xerophyllum_tenax
- [C101] Chamaenerion angustifolium — https://en.wikipedia.org/wiki/Chamaenerion_angustifolium
- [C102] Dryas octopetala — https://en.wikipedia.org/wiki/Dryas_octopetala
- [C103] Protea cynaroides — https://en.wikipedia.org/wiki/Protea_cynaroides
- [C104] Meconopsis — https://en.wikipedia.org/wiki/Meconopsis
- [C105] Saussurea — https://en.wikipedia.org/wiki/Saussurea
- [C108] Steller's sea eagle — https://en.wikipedia.org/wiki/Steller%27s_sea_eagle
- [C110] Kea — https://en.wikipedia.org/wiki/Kea
- [C111] Bearded vulture — https://en.wikipedia.org/wiki/Bearded_vulture
- [C112] Andean condor — https://en.wikipedia.org/wiki/Andean_condor
- [C114] Red-crowned crane — https://en.wikipedia.org/wiki/Red-crowned_crane
- [C115] Whooper swan — https://en.wikipedia.org/wiki/Whooper_swan
- [C116] Bar-headed goose — https://en.wikipedia.org/wiki/Bar-headed_goose
- [C118] Bharal — https://en.wikipedia.org/wiki/Bharal
- [C119] Snow leopard — https://en.wikipedia.org/wiki/Snow_leopard
- [C120] Yak — https://en.wikipedia.org/wiki/Yak
- [C121] Tibetan antelope — https://en.wikipedia.org/wiki/Tibetan_antelope
- [C128] Moose — https://en.wikipedia.org/wiki/Moose ；Reindeer — https://en.wikipedia.org/wiki/Reindeer
- [C129] Grizzly bear — https://en.wikipedia.org/wiki/Grizzly_bear
- [C130] Ring-tailed lemur — https://en.wikipedia.org/wiki/Ring-tailed_lemur
- [C131] Hornbill — https://en.wikipedia.org/wiki/Hornbill
- [C132] Ploceidae（织布鸟）— https://en.wikipedia.org/wiki/Ploceidae
- [C133] Eurasian skylark — https://en.wikipedia.org/wiki/Eurasian_skylark
- [C134] Lagopus（雷鸟）— https://en.wikipedia.org/wiki/Lagopus
- [C136] Bald eagle — https://en.wikipedia.org/wiki/Bald_eagle
- [C137] Arctic char — https://en.wikipedia.org/wiki/Arctic_char
- [C138] Brown trout — https://en.wikipedia.org/wiki/Brown_trout
- [C139] Sockeye salmon — https://en.wikipedia.org/wiki/Sockeye_salmon
- [C140] Ayu sweetfish — https://en.wikipedia.org/wiki/Ayu_sweetfish
- [C141] Schizothorax — https://en.wikipedia.org/wiki/Schizothorax
- [C142] Schizopygopsis przewalskii（青海湖裸鲤）— https://en.wikipedia.org/wiki/Schizopygopsis_przewalskii
- [C143] Hucho taimen — https://en.wikipedia.org/wiki/Hucho_taimen
- [C144] Northern pike — https://en.wikipedia.org/wiki/Northern_pike
- [C145] European perch — https://en.wikipedia.org/wiki/European_perch
- [C147] Tor putitora（金色结鱼）— https://en.wikipedia.org/wiki/Tor_putitora
- [C148] Arctic grayling — https://en.wikipedia.org/wiki/Arctic_grayling
- [C149] Mudskipper — https://en.wikipedia.org/wiki/Mudskipper
- [C151] Firefly — https://en.wikipedia.org/wiki/Firefly
- [C152] NPS 大雾山国家公园：Fireflies — https://www.nps.gov/grsm/learn/nature/fireflies.htm
- [C153] Photinus carolinus — https://en.wikipedia.org/wiki/Photinus_carolinus
- [C154] Photinus pyralis — https://en.wikipedia.org/wiki/Photinus_pyralis
- [C155] Nipponoluciola cruciata（源氏萤）— https://en.wikipedia.org/wiki/Nipponoluciola_cruciata
- [C156] † Weathernews：萤火虫发光的时期与时间 — https://weathernews.jp/news/202605/130061/
- [C157] † Precious.jp：萤火虫祭的时期与时间 — https://precious.jp/articles/-/54797
- [C158] Aquatica lateralis（平家萤）— https://en.wikipedia.org/wiki/Aquatica_lateralis
- [C159] Lampyris noctiluca — https://en.wikipedia.org/wiki/Lampyris_noctiluca
- [C160] Pteroptyx — https://en.wikipedia.org/wiki/Pteroptyx
- [C161] Arachnocampa luminosa — https://en.wikipedia.org/wiki/Arachnocampa_luminosa
- [C162] Glowworm — https://en.wikipedia.org/wiki/Glowworm
- [C163] Foxfire — https://en.wikipedia.org/wiki/Foxfire
- [C169] Tawny owl — https://en.wikipedia.org/wiki/Tawny_owl
- [C170] Ural owl — https://en.wikipedia.org/wiki/Ural_owl
- [C171] Barred owl — https://en.wikipedia.org/wiki/Barred_owl
- [C173] Tanna japonensis（暮蝉）— https://en.wikipedia.org/wiki/Tanna_japonensis
- [C182] Thuja plicata — https://en.wikipedia.org/wiki/Thuja_plicata
- [C183] Tsuga heterophylla — https://en.wikipedia.org/wiki/Tsuga_heterophylla
- [C184] Picea sitchensis — https://en.wikipedia.org/wiki/Picea_sitchensis
- [C187] Populus tremuloides — https://en.wikipedia.org/wiki/Populus_tremuloides
- [C191] Betula pendula — https://en.wikipedia.org/wiki/Betula_pendula
- [C192] Betula pubescens — https://en.wikipedia.org/wiki/Betula_pubescens
- [C193] Pinus sylvestris — https://en.wikipedia.org/wiki/Pinus_sylvestris
- [C194] Larix sibirica — https://en.wikipedia.org/wiki/Larix_sibirica
- [C195] Larix gmelinii — https://en.wikipedia.org/wiki/Larix_gmelinii
- [C196] Picea obovata — https://en.wikipedia.org/wiki/Picea_obovata
- [C197] Abies sibirica — https://en.wikipedia.org/wiki/Abies_sibirica
- [C199] Picea glauca — https://en.wikipedia.org/wiki/Picea_glauca
- [C200] Picea mariana — https://en.wikipedia.org/wiki/Picea_mariana
- [C202] Cryptomeria — https://en.wikipedia.org/wiki/Cryptomeria
- [C203] Chamaecyparis obtusa — https://en.wikipedia.org/wiki/Chamaecyparis_obtusa
- [C204] Fagus crenata — https://en.wikipedia.org/wiki/Fagus_crenata
- [C205] Acer palmatum — https://en.wikipedia.org/wiki/Acer_palmatum
- [C206] Camphora officinarum（樟）— https://en.wikipedia.org/wiki/Camphora_officinarum
- [C207] Zelkova serrata — https://en.wikipedia.org/wiki/Zelkova_serrata
- [C212] Betula ermanii — https://en.wikipedia.org/wiki/Betula_ermanii
- [C213] Pinus pumila — https://en.wikipedia.org/wiki/Pinus_pumila
- [C214] Abies veitchii — https://en.wikipedia.org/wiki/Abies_veitchii
- [C216] Picea schrenkiana — https://en.wikipedia.org/wiki/Picea_schrenkiana
- [C217] Cedrus deodara — https://en.wikipedia.org/wiki/Cedrus_deodara
- [C218] Pinus wallichiana — https://en.wikipedia.org/wiki/Pinus_wallichiana
- [C219] Betula utilis — https://en.wikipedia.org/wiki/Betula_utilis
- [C226] Polylepis — https://en.wikipedia.org/wiki/Polylepis
- [C227] Hagenia — https://en.wikipedia.org/wiki/Hagenia
- [C228] Dendrosenecio kilimanjari — https://en.wikipedia.org/wiki/Dendrosenecio_kilimanjari
- [C229] Erica arborea — https://en.wikipedia.org/wiki/Erica_arborea
- [C230] Ceiba pentandra — https://en.wikipedia.org/wiki/Ceiba_pentandra
- [C231] Shorea — https://en.wikipedia.org/wiki/Shorea
- [C232] Ficus benghalensis — https://en.wikipedia.org/wiki/Ficus_benghalensis
- [C233] Metrosideros polymorpha — https://en.wikipedia.org/wiki/Metrosideros_polymorpha
- [C234] Adansonia digitata — https://en.wikipedia.org/wiki/Adansonia_digitata
- [C235] Vachellia tortilis — https://en.wikipedia.org/wiki/Vachellia_tortilis
- [C236] Quercus ilex — https://en.wikipedia.org/wiki/Quercus_ilex
- [C237] Quercus suber — https://en.wikipedia.org/wiki/Quercus_suber
- [C238] Pinus pinea — https://en.wikipedia.org/wiki/Pinus_pinea
- [C239] Cupressus sempervirens — https://en.wikipedia.org/wiki/Cupressus_sempervirens
- [C240] Yucca brevifolia — https://en.wikipedia.org/wiki/Yucca_brevifolia
- [C241] Saguaro — https://en.wikipedia.org/wiki/Saguaro
- [C242] Haloxylon ammodendron — https://en.wikipedia.org/wiki/Haloxylon_ammodendron
- [C243] Populus euphratica — https://en.wikipedia.org/wiki/Populus_euphratica
- [C244] Rhizophora mangle — https://en.wikipedia.org/wiki/Rhizophora_mangle
- [C245] Avicennia marina — https://en.wikipedia.org/wiki/Avicennia_marina
- [C247] Liriodendron tulipifera — https://en.wikipedia.org/wiki/Liriodendron_tulipifera
- [C248] Acer saccharum — https://en.wikipedia.org/wiki/Acer_saccharum
- [C253] 西双版纳傣族自治州（中文维基）— https://zh.wikipedia.org/wiki/西双版纳傣族自治州
- [C254] Steppe — https://en.wikipedia.org/wiki/Steppe

（编号有空缺是因为整理时合并了重复条目；树种的完整清单与链接见 `landscape-params.md` 文末。）

---

## 4 给游戏的综合【本节全部是建议】

本节把前三节的事实变成生成器可以用的配方。凡是写了出处编号的，是依据；没有编号的数字是建议值。可直接抄成数据的版本在 `landscape-params.md` 的 P2e、P3、P4f、P6c、P13、P14。

### 4.1 场景原型目录（20 个）

“开阔率”指沿路视线在 150 m 内没有被地形或树冠挡住的比例，对应 L 节点探针里的“遮蔽”。

1. **冰川大 U 谷 · 谷底缓路。** 谷底 0.7–2 km，两壁高 900–1,600 m，谷长 10–15 km，悬谷瀑布 100–700 m 挂在壁上 [A21][A22][A23]。路沿谷底，坡 0–3%，弯半径 ≥ 200 m。谷底草甸和砾石河滩，下壁针叶林到林线，上壁岩石、冰斗和残雪。开阔率 70–90%，从路上看墙顶仰角 30–60°（≈算，P3）。晨雾、阳光斜扫谷壁。河声、瀑布声、高空金雕。范例：优胜美地、劳特布伦嫩、Glen Coe、米尔福德、冰原大道。
2. **垭口叠弯。** 一组 6–20 个发卡弯爬 300–800 m；弯内径 15–25 m、弯顶纵坡 ≤ 4%，弯间直段 120–500 m、坡 6–9%（依据 [B97][B98] 与 Stelvio、天门山、二十四道拐的推算，P4f）。云杉落叶松林 → 林线矮曲林 → 高山草甸 → 碎石残雪。林中开阔率约 30%，林线以上 90%；从弯顶能俯看下面的整组弯（Trollstigen、Stelvio、Rohtang 的照片正是这种视角）。气温每升 1 km 降约 6.5 °C [C1]，垭口风大、云低。旱獭、山鸦。
3. **峡谷阳台路。** 一侧墙高 300–1,000 m，另一侧下落 100–500 m 到江面，江宽 25–300 m [A52][A55]。坡 2–6%，有隧道、明洞、半隧道（太鲁阁到天祥 20 km 桥隧特别多 [B59]）。崖缝灌木与悬垂植物，谷底阔叶林。开阔率 50%（一侧全开），峡谷阴影里一线天光。江声回响。范例：太鲁阁、Mã Pí Lèng、Going-to-the-Sun 的崖壁段。
4. **海岸悬崖路。** 路高出海面 50–600 m，崖 50–200 m，海蚀柱 20–60 m [A81][A83]。坡 3–8%，沿等高线多弯（查普曼峰 9 km 约 114 弯† [B78]）。海岸草甸或硬叶灌丛，峡谷里藏着红杉或雨林 [B20]。开阔率 80%。夏季海雾带在约 610 m 以下 [B20]。浪声、海鸟。范例：大苏尔、阿马尔菲、查普曼峰、大洋路、海云关。
5. **礁岛跨海桥。** 低矮礁岛，桥长 50–260 m、桥下净空 3–23 m，8 km 内 8 座桥 [B2]。无树。开阔率 100%。风暴浪、长日照。海鸥、海雕 [B3]。范例：大西洋海滨公路、罗弗敦。
6. **巨树隧道。** 平坦河谷或低丘。树干离路肩 2–8 m，冠层在路面上方合拢：红杉 60–100 m [C63]，或水青冈树隧宽 6–10 m [B93]。林下蕨类、越橘 [B30]。开阔率 5–15%。雾与光束；夜里月光从冠隙漏下、林缘有萤火（4.4）。滴水声、鸮。范例：巨人大道、Dark Hedges、Otway 雨林、哈纳公路。
7. **桦与落叶松的北方林 + 远山。** 起伏 20–100 m；远处雪山在 30–80 km 外、仰角 1–3°（P2d）。长直路、缓弯。落叶松 20–30 m 锥形、桦 15–25 m 细干、松；林间沼泽与小湖 [C194][C191]。开阔率 40–70%。冬雪、秋天整片金黄、低太阳。鹤、天鹅。范例：阿尔山、大兴安岭、喀纳斯、道尔顿公路南段。这也最接近用户参考图里“雪中桦树路”的气质。
8. **湖区。** 湖长 1–25 km，周围丘峰 300–1,000 m [A99][A100]。路沿湖岸，坡 ≤ 5%。湖岸林与草地。开阔率 60–80%。湖面晨雾、多雨（英格兰湖区年降水 1,470–3,300 mm [A99]）。水鸟、涟漪。范例：英格兰湖区、喀纳斯、中禅寺湖、新西兰 Gunn 湖。
9. **花海丘陵。** 起伏 5–50 m（冰岛一组鼓丘高 5–10 m [A35]，其余为建议），视距 5–30 km。路跟着丘背，坡 ≤ 6%。薰衣草、羽扇豆、油菜，零星孤树 [B64][B19]。开阔率 90%。花期限定（薰衣草夏季、羽扇豆初夏）。蜂、云雀。范例：美瑛、富良野、冰岛。
10. **苔原高原。** 海拔 3,000–3,700 m（Beartooth 3,337 m、Trail Ridge 3,713 m [B34][B33]）或北极；高原面起伏 20–150 m，多冰斗湖。长直路，在边缘用之字形上下 [B34]。矮灌、垫状植物、地衣。开阔率 100%。大风、骤雪、云影。雷鸟、旱獭。范例：Beartooth、Trail Ridge、道尔顿北段、帕米尔、青藏公路。
11. **喀斯特河谷。** 峰林 30–300 m [A58]，江宽 100–300 m。沿江缓路。竹林、稻田、亚热带常绿林。开阔率 70%。薄雾、季风雨 [A59]。水牛、竹筏、鸟鸣。范例：桂林–阳朔、河江、万峰林。
12. **荒漠桌山。** 孤丘、桌山高出平原 100–305 m [A44]。长直路通向孤丘。稀疏灌丛、砾漠。开阔率 100%。强日照、红岩长影。风与寂静。范例：纪念碑谷、科罗拉多高原。
13. **沙海边缘。** 沙丘 20–300 m，落沙坡 30–35°，脊距 0.5–3 km [A65][A66]。路沿沙海边缘或丘间谷地。梭梭、胡杨（近河）[C242][C243]。开阔率 100%。热浪、沙尘、夜里星空。范例：纳米布、塔克拉玛干、巴丹吉林。
14. **萨瓦纳大道。** 平原上的土路，两侧是平顶的猴面包树（25–30 m [B82]）与伞形金合欢 [C235]，地面是连续草层 [C20]。开阔率 90%。干季金黄、日落剪影。织布鸟群 [C132]。范例：猴面包树大道。
15. **火山熔岩原。** 玄武岩熔岩流，火山渣锥 50–300 m、坡 30–40° [A9]，裂隙火口排成一线 [A92]。长直路穿过熔岩。苔藓、地衣，路边羽扇豆 [B19]。开阔率 100%。阴雨、低云。范例：冰岛环岛公路。
16. **高山草甸盆地与曲流。** 盆底平坦，海拔 1,500–2,500 m，四周山 > 3,000 m，曲流河与沼泽 [A51]；曲流波长约为河宽的 11 倍 [A103]。路平直，在盆缘爬升。开阔率 100%。夏季午后对流云。天鹅、云雀。范例：独库公路上的巴音布鲁克。
17. **雪墙垭口（春季）。** 雪墙 5–20 m（立山 15–20 m [B63]，独库 2–5 m [B47]），单车道或窄双车道。只剩头顶一条天空。强反光、蓝色阴影、融水滴落。
18. **云雾林下山。** 从普纳或帕拉莫的垭口下到 1,000–2,000 m [C32][C33]。长下坡 5–9%、多弯。附生植物、苔藓、树蕨、瀑布。开阔率 20–40%。雾、细雨。范例：永加斯路、乞力马扎罗林带。
19. **热带海岸雨林弯道。** 陡坡深沟；平均每 135 m 一弯、每 1.4 km 一座桥（哈纳公路 ≈算 [B43]）。雨林与瀑布。开阔率 20–40%。阵雨与彩虹。范例：哈纳公路。
20. **雨影荒原河谷。** 过了山口，绿色退去，只剩裸露碎石坡、冲积扇和河边绿洲 [B74]。沿河谷。开阔率 90%。干冷、强光。风与河声。范例：列城–马纳利北段、罕萨。

### 4.2 旅程序列（10 组）

速度按 60–70 km/h，10 分钟约 10–12 km；发卡弯段按 25–35 km/h 估算。每组都遵守一个地理理由。

| 序列 | 场景与长度（km） | 总长 · 时长（≈算） | 地理理由 |
|---|---|---|---|
| A 翻越阿尔卑斯 | 山前湖区 12 → 冰川 U 谷 14 → 垭口叠弯 10（升约 900 m）→ 垭口草甸与残雪 5 → 南坡落叶松–云杉林下山 12 → 南麓湖与栗林 12 | 65 km · 约 70 分钟 | 北坡阔叶上限约 1,200 m、南坡 1,500–1,700 m [C54]；林线 1,750–2,200 m [C2]；雪线略低于 3,000 m [C3] |
| B 太平洋海岸 | 红杉巨树隧道 12 → 雾带海岸草地 8 → 海岸悬崖路 15 → 雨影橡树林与丛林 10 → 翻山到高山草甸 12 → 东坡荒漠 12 | 69 km · 约 65 分钟 | 红杉只在距海 80 km 内 [B30]；大苏尔的雨影序列 [B20]；内华达东坡更干、林带更高 [C51] |
| C 天山独库 | 盆地荒漠绿洲 10 → 山地草原 8 → 雪岭云杉峡谷 12 → 达坂雪墙 6 → 巴音布鲁克草甸与曲流 15 → 南坡干旱峡谷 10 | 61 km · 约 60 分钟 | 北坡带谱 [B49]；云杉林 1,500–2,700/3,200 m [C78]；10 月中到次年 5 月封路 [B47] |
| D 川西入藏 | 平原远望雪山 10 → 亚热带峡谷 12 → 4,000 m 垭口草甸 8 → 高原牧场 12 → 冷杉林与冰川 10 → 72 拐下切峡谷 8 | 60 km · 约 60 分钟 | 贡嘎东坡带谱 [C45][C46]；东喜马拉雅带谱 [C41][C42]；冰舌伸进冷杉林 [A31] |
| E 日本山水 | 水青冈溪谷（夜有源氏萤）10 → 叠弯坂道 8 → 高原湖与瀑布 8 → 亚高山冷杉与岳桦 8 → 雪墙 5 → 花田丘陵 12 | 51 km · 约 55 分钟 | 本州中部带谱 [C68]；伊吕波坂 48 弯 [B69]；立山雪墙 [B63]；美瑛花田 [B64] |
| F 峡湾北国 | 农场谷地 8 → Trollstigen 式叠弯 6 → 高山高原湖与雪斑 10 → 峡湾山腰路 12 → 礁岛跨海桥 8 → 海上尖峰群岛 12 | 56 km · 约 55 分钟 | 挪威南部林线 1,100 m、近海 500–600 m [C2]；峡湾两岸山 500–1,600 m [A32] |
| G 巴塔哥尼亚 | 雨林与火山湖 12 → 峡湾海岸 12 → 冰川谷与冰湖 10 → 假山毛榉林线 6 → 东侧干草原 15 | 55 km · 约 50 分钟 | 西 4,000 mm、东 450 mm [B87]；林线南部约 1,000 m [B86] |
| H 苏格兰高地 | 湖岸林路 12 → 拉诺赫高沼 10 → Glen Coe U 谷 8 → 海湾林地河谷 10 → 长湖 12 | 52 km · 约 48 分钟 | “高山口与疏林河谷之间突然的转换” [B15]；林线约 500 m [C2] |
| I 热带高山下坡 | 普纳高原 10 → 垭口 5 → 云雾林长下坡 15 → 山地雨林瀑布 10 → 低地热带 10 | 50 km · 约 50 分钟 | 普纳 3,200 m 以上 [C32]；永加斯 400–3,500 m [C33] |
| J 喀斯特之南 | 高原峰丛 10 → 叠弯（二十四道拐式）5 → 峰林河谷 12 → 森林–村寨–梯田 10 → 亚热带常绿林萤火 10 | 47 km · 约 50 分钟 | 哈尼梯田：2,000 m 以上是森林，村寨在 1,400–2,000 m，下方是梯田 [D1]；漓江峰林 [A58] |

序列之间的衔接也要讲道理：例如 A 的南麓湖区可以接 B 风格的海岸；D 的高原可以接 C 的盆地草原；任何“翻过山”的衔接都伴随迎风坡湿、背风坡干的切换（3.5）。

### 4.3 生成用的数字

**(1) 远景层次。** 来自城市的名山远眺（P2d，≈算）：伯尔尼看 29 km 外的前山仰角约 3.1°，看 60 km 外的少女峰约 3.2°；成都看 122 km 外的四姑娘山约 2.2°、241 km 外的贡嘎约 0.6°；东京看 95 km 外的富士山约 1.8°；大吉岭看 75 km 外的干城章嘉约 4.7°。也就是说远方巨峰只占 0.5–5° 的仰角，近处谷壁才占 20–60°。地平线距离约 3.57·√h km（h 为眼高，m），d km 外的物体因地球曲率下沉约 d²/(2R)，R = 6,371 km [C6]；驾驶员眼高 1.4 m 时地平线只在约 4.2 km 外（≈算），远山能露出来全靠它们自身的高度。远山层层变淡来自对比度随距离指数衰减 C = C₀·exp(−3.912·d/V) [C5]：视程 50 km 时，10 km 外的山脊只剩约 46% 的对比，20 km 约 21%，40 km 约 4%（P2c）。美国东部国家公园过去视程约 145 km、现在 24–40 km，西部过去约 225 km、现在 56–145 km [D2]；大峡谷冬季平均可达 257 km [A54]。建议分五层：近丘/谷壁 0.3–2 km、前山 3–10 km、主脉 15–35 km、高山 40–80 km、巨峰 80–250 km（只在晴好日可见），各层的仰角和对比见 P2e。大气透视的颜色：湿润地区远山偏蓝灰（大雾山照片），干冷高原远山清楚、对比强。

**(2) 谷宽与墙高。** 窄 U 谷谷底 0.5–1 km、墙 900–1,100 m（劳特布伦嫩、Glen Coe）；宽冰川谷谷底 1.5–5 km、墙 1,000–1,600 m（优胜美地、冰原大道）；峡湾水面 1.5–6 km、两岸 500–1,600 m（盖朗厄尔、松恩）；峡谷江宽 25–300 m、两壁 1,000–3,800 m（虎跳峡）（P3）。这些值正好落在 L 节点“谷底一两百米宽、两侧山壁一千米以上”的目标附近，只是真实 U 谷底更宽，可按 0.3–2 km 取。

**(3) 山脊间距。** 扎格罗斯褶皱带波长约 10 km、背斜长 100 km 以上† [A5][A6]；盆岭区山与盆各宽 20–30 km† [A16]。没有查到阿巴拉契亚岭谷区的量化间距。建议：褶皱山区平行山脊间距 5–12 km，断块山区山–盆交替 20–30 km，近处支脊间距 1–3 km。

**(4) 开阔与封闭的交替。** 没有找到量化研究。可参考的实测（≈算）：哈纳公路每 135 m 一弯、每 1.4 km 一桥 [B43]；蓝岭公园路每 4.5 km 一座桥、每 29 km 一条隧道，沿途观景台频繁 [B31][B32]；巨人大道 50 km 几乎全程封闭 [B28]；冰原大道 228 km 几乎全程开阔 [B25]。建议：每个 10 分钟场景内部再分 2–4 段，开阔段与封闭段长度比在 1:3 到 3:1 之间按场景类型取（P13 的开阔率）；林中路每 2–5 km 给一个 0.3–1 km 的开口（湖、草甸、观景台、桥）。

**(5) 发卡弯几何。** 规范：内侧半径 ≥ 14 m（IRC），圆曲线半径 15–40 m（JTG，按设计速度 20–40 km/h）；弯上纵坡 ≤ 2.5%（IRC）或 3.5–4.5%（JTG）；超高 6–10%；弯间距离 ≥ 60 m（IRC）或 100–200 m（JTG）[B97][B98]。实测：Stelvio 北坡 48 弯、每弯约升 38 m、平均弯间约 500 m；Gata loops 21 弯升约 500 m（每弯约 24 m）；天门山 99 弯、平均弯间约 108 m、每弯约 11 m；二十四道拐 24 弯、约 160 m 一段、每弯约 10 m（P4f，≈算）。建议值见 P4f。

**(6) 纵坡分布。** 规范上限：40 km/h 的路最大 7%，30 km/h 8%，20 km/h 9%；7% 的坡最长 500 m（40 km/h）到 600 m（20 km/h），之后要插入 ≤ 3% 的缓坡；海拔 3,000–4,000 m 再减 1%，4,000–5,000 m 减 2% [B97]。IRC：控制坡 5–6%，例外坡 7–8% 每段不超过 100 m，2 km 内累计升降不超过 100–120 m [B98]。名路：Stelvio 平均 7.3–7.6%† [B6]、Trail Ridge 最大 7% [B33]、Trollstigen 10% [B1]、大格洛克纳最陡 12%† [B10]。建议全程分布：≤ 3% 占 70%，3–6% 占 20%，6–9% 占 8%，9–12% 的短陡段 ≤ 2%；陡段集中在“垭口叠弯”和“峡谷阳台路”两类场景里。

**(7) 林线与雪线。** 林线 ≈ 3,750 m（|纬度| ≤ 30°），30–50° 之间每度降 130 m，50–70° 之间每度降 75 m [C2]；海洋性气候再降 300–600 m，大陆内部升 500–1,000 m（依据 P6b 的对比）；向阳坡比阴坡高约 300 m（落基山国家公园 3,550 m 对 3,250 m [C2]）。雪线 ≈ 林线 + 300–1,000 m [C2]；干旱高原取上限（安第斯干旱段 4,800–5,200 m [C47]），湿润海洋性取下限。温度：6.5 °C/km [C1]。林线下 150–300 m 开始让树变稀变矮，林线以上 100–300 m 是矮曲林与灌丛（3.5）。

**(8) 森林高度与密度。** 冠层高度：热带雨林冠层之上的突出树 45–55 m（偶尔 70–80 m）[C12]；温带阔叶林 30–60 m [C15]；温带雨林针叶 60–100 m 以上 [C17][C63]；泰加林 15–35 m [C59][C193][C196]；马达加斯加干旱林 10–15 m [B83]；石灰岩低地林 15–20 m（好地方 30–35 m）[D3]；林线矮曲林 1–3 m（扭叶松 [C186]）或 1–4 m（山松 [C58]）。密度：没有查到株数/公顷的可靠数字；冠层覆盖可参考开阔桉树疏林 10–30% [C88]，萨瓦纳是开阔冠层下的连续草层 [C20]，郁闭林则冠层连续。

### 4.4 温馨的夜

- **月光与星光。** 满月晴夜 0.05–0.3 lx，上弦月 0.01 lx，无月晴夜 0.002 lx，阴天星光 0.0001 lx [D4]。暗适应后视觉偏向蓝端 [D5]：月夜画面应偏蓝、低饱和，而不是简单调暗。远离城市的地方能看到银河与气辉（暗夜等级的高端）[D6]。
- **萤火虫（只在对的地方和时间出现）。** 温暖季节、林缘、溪流和稻田、无路灯处、10 °C 以上 [C152]。日本：源氏萤在 5 月底到 6 月、溪流边、晚上 8 点前后† [C155][C156]；平家萤在稻田、6–8 月 [C158]。北美阿巴拉契亚：同步萤在 5 月下旬到 6 月中旬、老阔叶林山谷、21:30 以后，5–8 闪停 8 秒 [C152]。欧洲：雌萤在 6–8 月的开阔草地里静静发光约 2 小时 [C159]。东南亚：红树林河岸的“萤火树” [C160]。高山带、荒漠、冬季和 10 °C 以下不出现。
- **其他微光。** 新西兰式萤火虫在洞穴与潮湿河岸全年可见 [C161]；腐木上的狐火，蓝绿色 [C163]；满月前后瀑布雨雾里的月虹，在日落后或日出前 2–3 小时 [D7]；高纬冬夜的极光 [D8]。
- **声音。** 春季池塘与暖雨夜的蛙鸣（春雨蛙北方 3–6 月 [D9]；日本河鹿蛙在山溪石上鸣叫，4–8 月产卵 [D10]）；森林里的鸮（灰林鸮、长尾林鸮；横斑林鸮多在郁闭林，冬末春初叫得最多 [C169][C170][C171]）；开阔地边缘的夜鹰 [D11]；日本黄昏的暮蝉 [C173]。
- **夜里开的花。** 月见草傍晚不到一分钟就开 [D12]；月光花傍晚开、到清晨露水时才合 [D13]；昙花夜开、天亮前凋 [D14]；夜香树 [D15]。适合放在村落边、林缘空地。
- **怎样温馨而不吓人。** 用户的参考图是巨树下的夜路：建议让萤火只出现在开阔的林缘、溪边和路肩，冠层留出月光的空隙，配蛙鸣和溪水声，不用突然的鸟叫和全黑的林段；巨树林段夜里的遮蔽率可以比白天略低一点（多给几处月光空地）。

### 第 4 节来源

本节大多引用前三节的编号（A、B、C）。新增：

- [D1] 红河哈尼梯田（中文维基）— https://zh.wikipedia.org/wiki/红河哈尼梯田
- [D2] 美国环保署（EPA）：Basic Information about Visibility — https://www.epa.gov/visibility/basic-information-about-visibility
- [D3] South China–Vietnam subtropical evergreen forests — https://en.wikipedia.org/wiki/South_China%E2%80%93Vietnam_subtropical_evergreen_forests
- [D4] Lux — https://en.wikipedia.org/wiki/Lux
- [D5] Purkinje effect — https://en.wikipedia.org/wiki/Purkinje_effect
- [D6] Bortle scale — https://en.wikipedia.org/wiki/Bortle_scale
- [D7] Moonbow — https://en.wikipedia.org/wiki/Moonbow
- [D8] Aurora — https://en.wikipedia.org/wiki/Aurora
- [D9] Spring peeper — https://en.wikipedia.org/wiki/Spring_peeper
- [D10] Kajika frog — https://en.wikipedia.org/wiki/Kajika_frog
- [D11] Nightjar — https://en.wikipedia.org/wiki/Nightjar
- [D12] Oenothera — https://en.wikipedia.org/wiki/Oenothera
- [D13] Ipomoea alba — https://en.wikipedia.org/wiki/Ipomoea_alba
- [D14] Epiphyllum oxypetalum — https://en.wikipedia.org/wiki/Epiphyllum_oxypetalum
- [D15] Cestrum nocturnum — https://en.wikipedia.org/wiki/Cestrum_nocturnum
- [C186] Pinus contorta — https://en.wikipedia.org/wiki/Pinus_contorta

---

## 5 参考照片

29 张维基共享资源上的自由授权照片，取 1280 px 宽的缩略图（原图更小的取原尺寸），放在本机仓库的
`refs/landscape-photos/`（约 10 MB，不进版本库；照片被删掉时可以从下表的来源页重新下载），
同目录的 `manifest.md` 列出每张的文件名、内容、来源页、作者和授权。转载时要按授权署名。

| 文件 | 内容 | 授权 | 来源页 |
|---|---|---|---|
| trollstigen-hairpins-from-viewpoint.jpg | Trollstigen 叠弯（从观景台俯看） | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:DSC07845-Panorama.jpg |
| stelvio-pass-eastern-ramp-hairpins.jpg | Stelvio 东坡叠弯 | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Stelvio_Pass_Bolzano_side_1.jpg |
| furka-pass-hairpins-from-grimsel-road.jpg | Furka 山口叠弯（从 Grimsel 路看） | CC BY 2.5 | https://commons.wikimedia.org/wiki/File:Furkapass_westside.jpg |
| sani-pass-switchbacks-from-rim.jpg | Sani 山口砾石叠弯 | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Sani_Pass_heading_into_Lesotho.jpg |
| kullu-valley-from-rohtang-pass.jpg | Rohtang 山口路叠弯与河谷 | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Kullu_Valley_from_Rohtang_Pass,_India.jpg |
| going-to-the-sun-road-glacial-valley.jpg | 冰川谷壁上的阳台路 | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Going-to-the-Sun_Road_-_Glacier_National_Park.jpg |
| icefields-parkway-glacial-valley.jpg | 冰原大道穿过林木冰川谷 | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Icefields_Parkway_from_an_elevated_viewpoint,_Jasper_National_Park,_Alberta,_Canada.jpg |
| yosemite-valley-from-tunnel-view-road.jpg | 优胜美地谷（隧道观景点） | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Tunnel_View,_Yosemite_Valley,_Yosemite_NP_-_Diliff.jpg |
| lauterbrunnen-u-valley-waterfalls.jpg | 劳特布伦嫩 U 谷与瀑布 | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:1_lauterbrunnen_valley_wengen_2022.jpg |
| milford-road-west-from-homer-tunnel.jpg | 米尔福德公路：隧道西口望冰川谷 | 公有领域 | https://commons.wikimedia.org/wiki/File:Homer_Saddle_LookingWest.jpg |
| big-sur-bixby-bridge-coast-road.jpg | 大苏尔与 Bixby 桥 | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Bixby_Creek_Bridge,_California,_USA_-_May_2013.jpg |
| chapmans-peak-drive-cliff-road.jpg | 查普曼峰崖壁路 | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Chapmans_Peak_Drive_2.jpg |
| atlantic-ocean-road-storseisundet-bridge.jpg | 大西洋海滨公路 Storseisundet 桥 | CC BY 3.0 | https://commons.wikimedia.org/wiki/File:Atlantic_Ocean_Road.jpg |
| avenue-of-the-giants-redwood-road.jpg | 巨人大道红杉林中的路 | 公有领域 | 见 2.2 节链接 |
| dark-hedges-beech-tree-tunnel.jpg | Dark Hedges 水青冈树隧 | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Dark_Hedges_near_Armoy,_Co_Antrim_(cropped).jpg |
| avenue-of-the-baobabs-sunset.jpg | 猴面包树大道 | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Avenue_of_the_Baobabs_at_Sunset.jpg |
| li-river-tower-karst-yangshuo.jpg | 漓江峰林 | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:1_li_jiang_guilin_yangshuo_2011.jpg |
| ma-pi-leng-pass-karst-gorge-road.jpg | Mã Pí Lèng 喀斯特峡谷路 | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Ma_Pi_Leng_Pass_winding_road_Ha_Giang_Vietnam.jpg |
| taroko-gorge-cross-island-highway.jpg | 太鲁阁峡谷中的中横公路 | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Taiwan_2009_HuaLien_Taroko_Gorge_Biking_PB160057.jpg |
| yuki-no-otani-snow-walls.jpg | 立山雪之大谷雪墙 | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Tateyama_Toll_Road_and_Yuki-no-otani.jpg |
| karakoram-highway-passu-cones.jpg | 喀喇昆仑公路与帕苏尖峰 | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Passu_Cones_(Karakoram_Highway_view).jpg |
| dalton-highway-brooks-range-tundra.jpg | 道尔顿公路旁的苔原与布鲁克斯山脉（画面中无路） | 公有领域 | https://commons.wikimedia.org/wiki/File:Midnight_sun_in_the_Brooks_Range_(51358523439).jpg |
| great-smoky-mountains-layered-ridges.jpg | 大雾山层层山脊（空气透视） | 公有领域 | https://commons.wikimedia.org/wiki/File:Clifftops4-7-07.jpg |
| iceland-lupin-field.jpg | 冰岛羽扇豆花田 | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Lupinus_nootkatensis_-_Iceland_20070706b.jpg |
| hulunbuir-grassland-steppe.jpg | 呼伦贝尔草原 | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Hulunbuir_Grasslands,_Inner_Mongolia_-_9758734754.jpg |
| tian-shan-alpine-meadows.jpg | 天山高山草甸与雪峰 | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Alpine_meadows_and_snow-covered_peaks_in_Khan_Tengri_Nature_Park,_Tien_Shan.jpg |
| monument-valley-buttes.jpg | 纪念碑谷孤丘 | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Monument_Valley,_Utah,_USA_(23611451292).jpg |
| hailuogou-glacier-and-fir-forest.jpg | 海螺沟冰川与冷杉林 | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:HailuogouGlacierPanorama.jpg |
| laki-fissure-lava-field.jpg | 拉基裂隙火口与熔岩原 | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Laki_fissure_(3).jpg |

计划中的第 30 张（美瑛丘陵农田）下载时服务器一直返回“请求过多”，只保留链接：https://commons.wikimedia.org/wiki/File:Biei_Hokkaido.jpg（CC BY-SA 3.0）。

---

## 6 没找到的、局限与建议的后续

- **被拒绝访问的权威页。** UNESCO 世界遗产页（西挪威峡湾、中国南方喀斯特）和 USGS《沙漠》沙丘类型页都返回 403；落基山国家公园生态页的旧地址 404，只用到了搜索摘要（†）。峡湾和喀斯特的数字改用了维基百科条目。
- **只有搜索摘要（†）的数字。** Stelvio 的骑行数据、大格洛克纳的 48 km / 36 弯 / 12%、Chapman's Peak 的 114 弯、知床山口的封路月份、伊吕波坂的长度与高差、天门山的 200 → 1,300 m、二十四道拐的尺寸、川藏南线的里程与垭口海拔、盆岭区和扎格罗斯的间距、日本本州的带谱高度、贡嘎山的带谱样点、源氏萤的观赏时刻。用到关键处之前最好打开原页核对。
- **没找到可靠数字的。** 阿巴拉契亚岭谷区的山脊间距；裂谷宽度；开阔与封闭交替的量化研究（第 4.3 节给的是建议）；各群系的树木株数/公顷；萤火虫密度；多数公路的逐段纵坡分布；热带河流的鱼类组成；Furka、Transfăgărășan 的发卡弯数；Ruta 40、Tizi n'Tichka、Sani 的植被。
- **来源质量差异。** 川藏南线的里程和垭口只来自论坛与攻略；中国部分路线主要依据中文维基百科；米堆冰川“世界海拔最低”的说法未见其他来源。
- **数据之间的不一致。** 贡嘎山海拔：英文维基信息框 7,509 m，“横断山脉”条目 7,556 m。冰原大道长度：维基 227 km，官方冬季页 228 km，常见说法 232 km。日本阿尔卑斯林线：林线表 2,900 m，日本植被带文献 2,500 m。成都到贡嘎：中文维基称约 200 km，按坐标算 241 km。
- **照片。** 29 张已下载，美瑛一张因 429 失败。照片在本机的 `refs/landscape-photos/`，不进版本库。
- **后续建议。** L1 做“天际线仰角”和“山脊层数”探针时，可以拿 P2d 与 P3 的真实仰角作对照区间；L2 选树种时，P9 的冠形一栏里“【建议】”的部分最好对照照片再定；L4 的旅程序列可以先从 4.2 的 A、C、E 三组试起，因为它们的带谱数据最完整。

### 本次检索的请求数

- 维基百科与维基共享资源接口 18 次：14 批取回 498 个条目的原文，2 次取坐标，2 次连通性测试。
- 网页抓取 8 次：成功 4 次（NPS 萤火虫、EPA 能见度、IRC:52-2019 PDF、JTG D20—2017 PDF；两个 PDF 在本机用 pdftotext 提取），失败 4 次（UNESCO 两页 403、USGS 沙丘页 403、NPS 落基山旧页 404）。
- 网络搜索 20 次。
- 合计 46 次研究性请求。照片另用维基共享资源接口 9 次（1 次批量元数据、8 次搜索），图片下载 29 张成功、1 张失败。
