# 公路生态过渡与现实路段长度

在[原有公路样带](road-ecology.md)之间补入 29 种沿路能辨认的中间生境。加上原有 25 型，共 54 型。区域在各自能够陆路接续的地理组内转换。

**两个距离的含义。** `typicalStretchKm: [短, 长]` 是样本路线内，这种景观能主导车窗的现实连续路程估计，单位 km；一段潮林可能只有几百米，同一路线上的内陆林可延续几十公里。范围按所列道路的生境尺度取整，属编目估值，未经逐米 GPS 或全球样本分位数验证。新表中的 `widthM` 则是游戏内两种景观重叠所用的行车距离，单位 m，已经考虑压缩。长走廊不应把台地与雪峰直接拼在一起。坡度约 7% 时，垂直高差 150–200 m 的林线带沿路约长 2–3 km；潮沟横穿路面时可以短得多。[生态过渡依据 §3.5](landscape-research.md#35-生态过渡带什么接着什么过渡有多宽)

**实路尺度核对。** RP41 从 El Chaltén 沿 Río de las Vueltas 到 Lago del Desierto 共约37 km，其间可见开放谷地、ñire 和 lenga 林。本表给疏林草甸 2–22 km 的范围，只计其中一段；在 Lærdal 到 Aurland 的约47 km 景观路，低地果园与无树高地也分别取较短子段。[阿根廷国家公园](https://www.argentina.gob.ar/parquesnacionales/patagonia-austral/parque-nacional-los-glaciares/actividades) · [挪威景观公路](https://www.nasjonaleturistveger.no/en/routes/aurlandsfjellet/)

**读图示例。** 犹他 La Sal Mountain Loop 在同一条汽车路上从红岩爬到高山森林，途中经过矮松、刺柏、甘贝尔栎、黄松、山杨和云杉冷杉。已有 `redrock` 与 `rocky-pass` 由此可直接连接，终点落在后者的森林带。若希望把行程拉长，中途也可独立选择台地疏林与山地针叶林。[La Sal Lookout](https://moab.travel/listing/experiences/la-sal-lookout-point) · [Moab 观景公路](https://www.discovermoab.com/blog/post/scenic-drives-in-moab-utah/)

**气候与物种精度。** 下列各行均重新提取所在坐标的 2001–2020 年 7305 天 NASA POWER 数据（原数链接含坐标和时段）。TS 按日历月保存日高、日低、月降水、陆地雪盖均值。公里级的小生境可能恰在同一个气候格点，局部差异取决于海拔带、坡向、潮水、风或人工管理。鸟虫是适合本地生境的候选，活动与花期月份仍属区域估计；待核花种保留空表。[逐日数据说明](https://power.larc.nasa.gov/docs/services/api/temporal/daily/)

## 新增的中间生境

| 原型与实路 | 连续景观 km | 车窗内的分界 | 资料 |
|---|---:|---|---|
| **加州山麓栎林草坡**（`cal-oak`） · CA-140 Mariposa–El Portal；Big Sur 河谷近岸栎林 | 4–25 | 蓝栎偏内陆，海岸栎在沿海样区；冠下光隙保留连续草面 | [地区依据](https://www.nps.gov/yose/learn/nature/plants.htm) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-119.96&latitude=37.61&start=20010101&end=20201231&format=JSON) |
| **科罗拉多台地矮松刺柏疏林**（`mesa-woodland`） · US-160 Cortez–Mancos；Mesa Verde 入口台地公路 | 4–22 | 路沿覆土桌面爬升，灌木在岩缝间聚集 | [地区依据](https://irma.nps.gov/DataStore/FileSource/Get/2289995?filename=MEVE_Park-Entrance-Road-Corridor_CLIParkReport_main.pdf) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-108.48&latitude=37.24&start=20010101&end=20201231&format=JSON) |
| **南落基山东麓松林河峡**（`rocky-foothill`） · US-34 Big Thompson Canyon；US-36 Lyons–Estes Park | 4–32 | 松在干燥岩肩，杨限常湿水线 | [地区依据](https://home.nps.gov/romo/planyourvisit/directions.htm) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-105.31&latitude=40.42&start=20010101&end=20201231&format=JSON) |
| **大平原西缘短草台地**（`front-prairie`） · US-85 科罗拉多北部平原；SD-240 Wall 草原边缘 | 15–100 | 草连续而低，沟渠以外不放乔木 | [地区依据](https://www.fs.usda.gov/rm/pubs/rmrs_gtr017.pdf) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-104.9&latitude=40.67&start=20010101&end=20201231&format=JSON) |
| **圣胡安山地黄松与山杨林**（`sanjuan-montane`） · US-160 Mancos–Durango；US-550 Durango–Coal Bank Pass | 6–40 | 干坡松林逐渐混入山杨，高处凉湿沟换针叶 | [地区依据](https://www.colorado.com/byways/san-juan-skyway) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-107.94&latitude=37.3&start=20010101&end=20201231&format=JSON) |
| **蓝岭脊顶草甸**（`blue-meadow`） · Skyline Drive Big Meadows | 0.3–1.5 | Big Meadows 的开放面由湿度与持续管理维持；高草中不布成熟林 | [地区依据](https://www.nps.gov/shen/learn/nature/wildflowers.htm) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-78.44&latitude=38.52&start=20010101&end=20201231&format=JSON) |
| **仙纳度河谷牧地与树篱**（`shenandoah-farm`） · US-211 Thornton Gap–Luray | 3–25 | 保留牧草、树篱、谷底河道三条边界 | [地区依据](https://irma.nps.gov/DataStore/FileSource/Get/2188744?filename=SHEN_Headquarters_CLI+Update+Park+Report_2025.pdf) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-78.46&latitude=38.67&start=20010101&end=20201231&format=JSON) |
| **阿拉斯加辫状河河阶柳丛**（`alaska-braid`） · Dalton Highway Dietrich 河谷至 Brooks Range | 2–24 | 乔木状柳只在稳定背风河阶；活跃砾洲裸露 | [地区依据](https://eplanning.blm.gov/public_projects/35315/200040776/20039518/250045713/Central%20Yukon%20RMP%20WSR%20Inventory%20Report.pdf) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-150.18&latitude=67.29&start=20010101&end=20201231&format=JSON) |
| **索诺兰天空岛栎林**（`sky-oak`） · Catalina Highway Molino Basin–Windy Point | 2–11 | 南向坡可有干草与稀栎，北向沟冠层较密 | [地区依据](https://www.fs.usda.gov/sites/nfs/files/legacy-media/coronado/Mt%20Lemmon%20ROG.pdf) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-110.71&latitude=32.34&start=20010101&end=20201231&format=JSON) |
| **圣卡塔利娜山顶黄松林**（`sky-pine`） · Catalina Highway Summerhaven 高段 | 3–13 | 松林上升到冷湿沟时混入冷杉，本山顶低于气候林线 | [地区依据](https://www.fs.usda.gov/sites/nfs/files/legacy-media/coronado/Mt%20Lemmon%20ROG.pdf) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-110.74&latitude=32.42&start=20010101&end=20201231&format=JSON) |
| **南蒂罗尔灌溉果园谷地**（`alps-orchard`） · SS38 上文施高谷地 Prato allo Stelvio | 2–14 | 修剪低冠行列只在灌溉农地，山壁不种果树 | [地区依据](https://www.vinschgau.net/media/d28e0dda-e214-4bf8-add0-cda525708b7d/fuer-online-image-und-informationsbroschuere-de-137-x-205-21-03-2020.pdf) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=10.58&latitude=46.62&start=20010101&end=20201231&format=JSON) |
| **阿尔卑斯疏落叶松牧场**（`alps-larch`） · SS38 Trafoi–Franzenshöhe | 2–12 | 落叶松在疏牧场中向上变矮，冬季落针 | [地区依据](https://lombardia.stelviopark.it/wp-content/uploads/2018/05/PP_Documento_illustrativo_Piano_20180331.pdf) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=10.51&latitude=46.53&start=20010101&end=20201231&format=JSON) |
| **松恩峡湾河口果田**（`fjord-orchard`） · Aurlandsfjellet 的 Lærdal 谷口 | 1–10 | 温和谷底种果蔬，水岸与陡壁留空 | [地区依据](https://en.sognefjord.no/fjord-villages/laerdal/get-inspired-in-laerdal/) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=7.47&latitude=61.09&start=20010101&end=20201231&format=JSON) |
| **西挪威高地石南雪槽**（`fjord-heath`） · Fv5627 Aurlandsfjellet 山顶段 | 4–20 | 背风雪槽长莎草，迎风裸脊仅地衣 | [地区依据](https://www.nasjonaleturistveger.no/en/routes/aurlandsfjellet/) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=7.33&latitude=60.94&start=20010101&end=20201231&format=JSON) |
| **拉塔里山栗林谷肩**（`lattari-coppice`） · SS366 Amalfi–Agerola | 1–8 | 避风山肩的薪炭林和栗树林，薄土崖缘保留矮灌 | [地区依据](https://parcoregionaledeimontilattari.it/index.php?action=index&p=328) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=14.55&latitude=40.66&start=20010101&end=20201231&format=JSON) |
| **阿杰罗拉高台牧地**（`lattari-pasture`） · SS366 Agerola 高台村道 | 1–6 | Agerola 台地牧场，树只在村边田界 | [地区依据](https://www.comune.agerola.na.it/vivere_il_comune/attivita/attivita_produttiva_13.html) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=14.54&latitude=40.64&start=20010101&end=20201231&format=JSON) |
| **华南冲积盆地水田**（`south-china-paddy`） · 阳朔高田遇龙河盆地；元阳红河谷地的水田段 | 2–18 | 宽谷平田沿河汲水，隔开种植田与天然河岸 | [地区依据](https://www.fao.org/giahs/around-the-world/detail/china-hani-rice-terraces/en) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=110.47&latitude=24.74&start=20010101&end=20201231&format=JSON) |
| **伊富高村寨水源林**（`ifugao-grove`） · Banaue–Bontoc 山路 Poitan 一带支路 | 0.5–4 | muyong 林紧接梯田灌渠源头；Poitan 引入树只在栽植地出现 | [地区依据](https://philjournalsci.dost.gov.ph/threat-of-potential-bioinvasion-in-a-natural-forest-in-poitan-banaue-ifugao-cordillera-administrative-region/) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=121.06&latitude=16.92&start=20010101&end=20201231&format=JSON) |
| **吕宋科迪勒拉山脊松林**（`cordillera-pine`） · Banaue 周边 Poitan 与吕宋中部山地的阳坡松林段 | 2–12 | 科迪勒拉阳坡松林，阴湿山凹保留阔叶；不把云雾林山顶刷成纯松林 | [地区依据](https://philjournalsci.dost.gov.ph/threat-of-potential-bioinvasion-in-a-natural-forest-in-poitan-banaue-ifugao-cordillera-administrative-region/) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=121.01&latitude=17.04&start=20010101&end=20201231&format=JSON) |
| **萨比河岸无花果林**（`sabie-gallery`） · H4-1 Skukuza 河阶与 Lower Sabie | 0.5–7 | 沿永久河道成窄带；通用阔叶冠仅占位，需制作本地大树形 | [地区依据](https://www.sanparks.org/parks/kruger/camps/main-rest-camps/lower-sabie) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=31.59&latitude=-24.99&start=20010101&end=20201231&format=JSON) |
| **克鲁格玄武土长草台地**（`basalt-savanna`） · H10 Lower Sabie–Tshokwane | 6–42 | 基性岩台地草层连续；马鲁拉与瘤刺树疏立，河道处才出现浓荫 | [地区依据](https://www.sanparks.org/parks/kruger/camps/main-rest-camps/lower-sabie) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=31.93&latitude=-25.11&start=20010101&end=20201231&format=JSON) |
| **开普滨海沙丘灌丛**（`cape-dune`） · Noordhoek 海滨村道与 Chapman's Peak 南端 | 0.5–5 | 沙丘顶风剪平，活跃沙面留白，成熟灌丛仅在稳定沙垄 | [地区依据](https://resource.capetown.gov.za/documentcentre/Documents/Bylaws%20and%20policies/Cape-Town-Biodiversity-Spatial-Plan.pdf) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=18.37&latitude=-34.11&start=20010101&end=20201231&format=JSON) |
| **半岛避风沟谷原生林**（`cape-forest`） · M63 Hout Bay–Constantia Nek、Orange Kloof 谷缘 | 0.3–4 | 湿润避火沟容下闭合林冠；仅沿公路可见林缘，保护区内部不设通车 | [地区依据](https://www.sanparks.org/parks/table-mountain/explore/fauna-flora/vegetation) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=18.4&latitude=-34&start=20010101&end=20201231&format=JSON) |
| **奥特韦高地牧场**（`otway-pasture`） · C159 Lavers Hill–Beech Forest | 2–16 | 已清垦高原牧场上留少量桉树与防风带，湿沟林冠继续 | [地区依据](https://www.colacotway.vic.gov.au/files/assets/public/trimfiles/council-and-the-shire/small-town-community-groups/lavers_hill_master-plan-2006.pdf) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=143.52&latitude=-38.63&start=20010101&end=20201231&format=JSON) |
| **埃格林顿谷原生草甸湿地**（`eglinton-grass`） · SH94 Eglinton Valley–Mirror Lakes | 2–18 | 谷底原生草地、静水湿地与红山毛榉林岛交错 | [地区依据](https://www.doc.govt.nz/Documents/science-and-technical/sap263-3.pdf) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=168.01&latitude=-44.97&start=20010101&end=20201231&format=JSON) |
| **霍默隧道雪崩槽**（`homer-alpine`） · SH94 Homer Tunnel 两侧上坡 | 1–7 | 低于林线也可能因雪崩无树；溪边花坪不进入活动碎石面 | [地区依据](https://www.doc.govt.nz/parks-and-recreation/places-to-go/fiordland/places/fiordland-national-park/places-to-go/milford-road-milford-sound-area/nature-and-history/) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=167.99&latitude=-44.76&start=20010101&end=20201231&format=JSON) |
| **丹翠潮间红树林**（`daintree-tidal`） · Cape Tribulation Road，Noah Creek 潮沟 | 0.1–1.5 | 潮差而非海拔独立决定红树界；红树支柱根需地方模型 | [地区依据](https://parks.qld.gov.au/parks/daintree/journeys/madja-boardwalk) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=145.43&latitude=-16.22&start=20010101&end=20201231&format=JSON) |
| **丹翠海滩背缘林**（`daintree-beach`） · Cape Tribulation Road–Kulki 海滨支路 | 0.2–2 | 海滩背缘透光林；高潮线外缘留沙面和马鞍藤 | [地区依据](https://parks.qld.gov.au/parks/daintree/journeys/kulki-boardwalk) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=145.46&latitude=-16.08&start=20010101&end=20201231&format=JSON) |
| **巴塔哥尼亚雨影疏林草甸**（`andean-parkland`） · RP41 El Chaltén–Río de las Vueltas | 2–22 | 洼地和避风肩残留矮曲 ñire，土层浅的东向台地退为丛草原 | [地区依据](https://www.argentina.gob.ar/parquesnacionales/patagonia-austral/parque-nacional-los-glaciares/actividades) · [气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-72.88&latitude=-49.32&start=20010101&end=20201231&format=JSON) |

## 原有原型的现实连续长度

在窄谷里多个短距离开合可共同组成一次 5–10 分钟的体验；在大片苔原里需要改用河道、起伏或视野来维持变化。原始路线出处及局部海拔见[逐路资料](road-ecology.md)。

| 原型 | 连续景观 km | 参照路段 |
|---|---:|---|
| 内华达花岗岩谷底（`sierra-valley`） | 4–15 | 优胜美地 Valley Loop（Northside / Southside Drive） |
| 内华达高山草甸（`sierra-high`） | 8–40 | 优胜美地 Tioga Road |
| 海雾红杉河谷（`fog-redwood`） | 3–25 | 加州 Avenue of the Giants、加州一号公路 Big Sur |
| 加州地中海型海崖（`sur-coast`） | 5–50 | 加州一号公路 Big Sur |
| 落基山林线公路（`rocky-pass`） | 6–30 | 科罗拉多 Trail Ridge Road、落基山 Bear Lake Road |
| 科罗拉多高原红岩（`redrock`） | 6–45 | 犹他 Arches Scenic Drive、峡谷地 Island in the Sky |
| 阿巴拉契亚阔叶山脊（`appalachian`） | 10–65 | 阿巴拉契亚 Blue Ridge Parkway、仙纳度 Skyline Drive |
| 布鲁克斯北坡苔原（`arctic-tundra`） | 35–180 | 阿拉斯加 Dalton Highway |
| 阿拉斯加内陆泰加林（`alaska-taiga`） | 20–130 | 阿拉斯加 Dalton Highway、阿拉斯加 Parks Highway |
| 索诺兰柱仙人掌冲积扇（`sonoran`） | 5–20 | 亚利桑那 Cactus Forest Drive、亚利桑那 Bajada Loop Drive |
| 混合草原与劣地（`prairie-badlands`） | 6–38 | 南达科他 Badlands Loop Road |
| 中阿尔卑斯落叶松山口（`central-alps`） | 4–25 | 意大利 SS38 斯泰尔维奥山口、奥地利 Großglockner Hochalpenstraße |
| 西挪威峡湾雪路（`norway-fjord`） | 3–32 | 挪威 Fv63 Geiranger–Ørnesvingen、挪威 Aurlandsfjellet |
| 地中海柠檬梯园（`amalfi-terrace`） | 2–25 | 意大利 SS163 阿马尔菲海岸 |
| 哀牢山灌溉梯田（`hani-paddy`） | 2–18 | 中国云南元阳多依树梯田公路 |
| 吕宋山地水田（`ifugao-paddy`） | 2–12 | 菲律宾 Banaue–Bontoc 山路巴纳韦段 |
| 桂北峰林河谷（`karst-river`） | 3–22 | 中国广西阳朔十里画廊 |
| 南非低地稀树草原（`lowveld`） | 8–55 | 南非克鲁格 H4-1 萨比河道 |
| 开普硬叶灌丛海崖（`cape-fynbos`） | 2–9 | 南非 Chapman's Peak Drive |
| 维州石灰岩海蚀岸（`otway-coast`） | 4–30 | 澳大利亚 Great Ocean Road 坎贝尔港段 |
| 奥特韦湿沟桉林（`otway-forest`） | 4–22 | 澳大利亚奥特韦 Turtons Track |
| 南岛山毛榉冰川谷（`fiordland`） | 5–45 | 新西兰 SH94 Milford Road |
| 昆士兰低地热带雨林（`wet-tropics`） | 4–33 | 澳大利亚 Cape Tribulation Road |
| 安第斯雨影丛草原（`patagonian-steppe`） | 25–140 | 阿根廷 RP23 查尔滕入口、阿根廷 RN40 拉莱奥纳段 |
| 巴塔哥尼亚温带雨林（`andes-rainforest`） | 8–70 | 智利 Carretera Austral 凯乌拉特段 |

## 取样与使用限制

- 大平原的草地可连行几十至上百公里，进入州道旁的劣地边缘后，行车视野会在短得多的距离内交替打开、被泥岩陡壁遮住。跨路例子表达同一区域地理梯度；科罗拉多北部与南达科他的参照段本身相距很远。
- 本表将原型作为区域性的生境模板。同一类型可以在多条实路被观测到，每一对连接都有各自的实路证据。串联多个连接仍应维持一个地理背景，不应把一个样带中的村舍、地标和特有种换成另一个样带的。
- H4-1 沿河道路反复接近、离开河岸高林；丹翠和开普的道路常沿生境边界。短范围对应驾驶员看得见该生境的距离，护林区内部、水面与栈道不参与汽车里程。
- 既有海拔原型仍完整保留。新型从其中拆出可独立持续一段路的生境，比如林内的蓝岭大草甸、Homer 雪崩槽和山头水源林。两相邻生境之间有些组成重叠，模型替换应连续进行。
