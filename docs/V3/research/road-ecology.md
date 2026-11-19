# 公路生态：从车窗所见到可生成的样带

34 条路线分布在七大洲，其中 32 条道路或观景区域用于最初 25 个原型；冰岛苔原熔岩路与南极后勤路另列为对照。每段挑一个可复算的气候点，路面高度、树冠所在坡位和远山分开记。[原型数据](../../../src/core/world/data/ecoProfiles.ts) · [一页摘要](road-ecology-SUMMARY.md) · [模型清单](model-wishlist.md) · [29 个中间生境与现实距离](road-ecotones.md)

## 数字怎么读

- **格点气候。** 逐日下载 NASA POWER / MERRA-2 的日最高、日最低、订正降水和陆地积雪覆盖比例 FRSNO。取 2001-01-01 至 2020-12-31 共 7305 日；每个日历月的高低温分别对该月所有日值取平均，降水按每年该月累计后取 20 年平均。保留一位小数。每张卡末尾的链接可下载同一坐标和时段。格点尺度约半度，海岸混合陆海，山地平均高度可能比谷底高近千米。此表用于比较季节周期，无法代表垭口气象站或一条路的全线。[NASA POWER 日数据说明](https://power.larc.nasa.gov/docs/services/api/temporal/daily/)
- **雪。** 表中雪盖为格点陆地表面被雪覆盖的比例，逐日数值按同一历月取均值，取三位小数。卡内的路段雪季是区域资料和地形的综合判断；在海滨、干热扇面和低谷出现明显尺度错配时，TS 的 `terrain-estimate` 给出局部场景先验，`grid-area-fraction` 保留格点面积比例。二者都不能解释为树冠已覆盖的面积。罗斯岛雪盖缺测保留空缺。
- **林线及雪线。** 卡内依次写 12–2、3–5、6–8、9–11 月。林线按生态高度近似，在这些季度保持恒定。雪线是可见季节积雪下缘的制作参考，迎风、雪崩与阴坡须改变其形状；这里没有测算冰川平衡线。破折号表示该路景无可用阈值，不能当作海拔零。生境、岩壁和土地利用先于海拔筛选。
- **证据层次。** 每条的地点资料用于核对公路、地貌、区域植被或动物记录；相邻区域的植物调查标为参考。取整的路段海拔是选景范围，未经全线 GPS 复测。下文的高度带边界、选用花期/昆虫窗口、林雪线、岩石配比和行车过渡宽度属于可调样带；除特别引证外，不声称当地已有逐月物候调查。空花表表示待补，空树表还须看待建冠层。树种拉丁名用于辨形，属级条目保留到属级。
- **路况。** 公园、季节道路和科研道路的开放条件可能变化。这里记录景观，不提供通行安排。

## 北美洲

### 优胜美地 Tioga Road

美国加州，Tenaya Lake–Tuolumne Meadows–Tioga Pass。选段海拔约2480–3030米。由 Tenaya 一带圆顶状山体驶入平整草甸，近山口冰斗与湖泊夹路；营地与季节性服务点稀疏。

通车日期受当年清雪影响。高山带的典型起点采用 NPS 优胜美地约2900米的概数，林岛位置还受风、基质与坡向限制。

**天气与积雪。** 午后对流，融雪沿草甸汇流。高处约11–5月常见积雪，春开路年际变化大。样点 37.87°, -119.37°，格点平均高度 2555 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 0.5 | 0.3 | 2.7 | 6.8 | 13.2 | 19.7 | 24.5 | 24.1 | 20.4 | 14.1 | 6.5 | 0.4 |
| 平均日低 °C | -9.9 | -10 | -8.3 | -5 | -0.4 | 4.2 | 9.3 | 8.3 | 4.5 | -0.3 | -4.9 | -9.8 |
| 月降水 mm | 103.1 | 100.6 | 90 | 56.1 | 37.1 | 11.5 | 14.1 | 9.2 | 8.8 | 37.6 | 61.2 | 118 |
| 格点雪盖 0–1 | 0.696 | 0.68 | 0.57 | 0.252 | 0.024 | 0.001 | 0 | 0 | 0.001 | 0.035 | 0.167 | 0.59 |

**内华达高山草甸 · 车窗可见的植被带。**

- 1800–2650 m，山地针叶林；雪花草限林下。树形候选 洋松（Pinus jeffreyi）、红冷杉（Abies magnifica）。灌层见熊果灌丛。地面为林下针叶毡。雪花草（深红，5、6、7 月）。
- 2650–2900 m，林岛与湿草甸镶嵌。树形候选 扭叶松（Pinus contorta）、西部白松（Pinus monticola）。灌层见矮柳。地面为莎草、岩面地衣。沼泽金盏草类（白，6、7、8 月）。
- 2900–3700 m，林线以上的远景岩坡。灌层见矮柳。地面为垫状草本、裸岩。高山福禄考（淡粉，7、8 月）。

林线 2900/2900/2900/2900 m；季节雪缘 1500/2300/3400/2900 m。

**岩石与生灵。** 灰白花岗岩见磨圆穹丘；灰褐冰碛见混粒石垄。克拉克星鸦在高处松冠，山蓝鸲在草甸边缘。骡鹿；碎石间可见旱獭。昆虫窗口：熊蜂（6、7、8 月，白天，融雪花带）；斑蝶类（7、8 月，白天，有蜜源的林间空地）。

资料：[Tuolumne Meadows (U.S. National Park Service)](https://www.nps.gov/places/000/tuolumne-meadows.htm) · [Plants - Yosemite National Park (U.S. National Park Service)](https://home.nps.gov/yose/learn/nature/plants.htm) · [Where to See Wildflowers - Yosemite National Park (U.S. National Park Service)](https://www.nps.gov/yose/learn/nature/wildflowerviewing.htm) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-119.37&latitude=37.87&start=20010101&end=20201231&format=JSON)

### 优胜美地 Valley Loop（Northside / Southside Drive）

美国加州，El Capitan Meadow–谷东端。选段海拔约1200–1250米。沿 Merced 河缓弯，白色巨壁突然从黑栎草甸后升起。谷底有桥与游客设施；春季水帘更宽。

**天气与积雪。** 谷底晨雾，冬季雨雪交替，融雪期瀑布增宽。约12–3月间歇有雪，雨雪界会扫过谷底。样点 37.74°, -119.58°，格点平均高度 2126 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 3.9 | 3.9 | 6.2 | 10 | 15.6 | 22.2 | 27 | 26.4 | 23 | 17 | 10 | 3.8 |
| 平均日低 °C | -6.3 | -6.5 | -4.8 | -2.1 | 2 | 6.7 | 11.6 | 10.7 | 7.2 | 2.5 | -1.8 | -6.3 |
| 月降水 mm | 115.9 | 110.4 | 97.7 | 61.5 | 34.7 | 7.8 | 8.1 | 5.9 | 6.1 | 38.7 | 60.9 | 125.1 |
| 格点雪盖 0–1 | 0.518 | 0.484 | 0.408 | 0.158 | 0.017 | 0 | 0 | 0 | 0 | 0.023 | 0.087 | 0.43 |

**内华达花岗岩谷底 · 车窗可见的植被带。**

- 1100–1800 m，河阶与林缘，季淹草甸留空。树形候选 黑栎（Quercus kelloggii）、西黄松（Pinus ponderosa）。灌层见熊果灌丛。地面为莎草、草甸禾草。加州罂粟（橙，4、5、6 月）。

林线 —/—/—/— m；季节雪缘 1200/1900/—/2300 m。

**岩石与生灵。** 灰白花岗岩见剥片巨壁；灰褐冲积砾见河滩圆石。暗冠蓝鸦在林缘枝头，美洲河乌在急流石上。黑尾鹿在草甸边缘；黑熊低频。昆虫窗口：熊蜂（4、5、6、7、8、9 月，白天，晴暖草甸）；蜻蜓（6、7、8、9 月，白天，池塘静水）。

资料：[Merced Wild & Scenic River Management Plan](https://www.nps.gov/yose/learn/management/upload/Volume-2A_MRP-FEIS_FULL_508.pdf) · [Plants - Yosemite National Park (U.S. National Park Service)](https://home.nps.gov/yose/learn/nature/plants.htm) · [Where to See Wildflowers - Yosemite National Park (U.S. National Park Service)](https://www.nps.gov/yose/learn/nature/wildflowerviewing.htm) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-119.58&latitude=37.74&start=20010101&end=20201231&format=JSON)

### 加州 Avenue of the Giants

美国加州，沿 Eel River 的洪泛河阶。选段海拔约30–150米。平坦河阶托起红杉巨柱；走出树隧的天窗正好在河边。小镇与旧公路聚落顺河排列。

**天气与积雪。** 冬雨夏雾，河漫滩透光处草层较厚。山谷通常无持续雪季；勿将周围山地格点的积雪套入巨树林。样点 40.32°, -123.92°，格点平均高度 665 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 9.8 | 10.3 | 11.7 | 13.9 | 18 | 23.2 | 29.4 | 29.7 | 27.3 | 21.3 | 13.5 | 9.1 |
| 平均日低 °C | 2.2 | 2 | 2.8 | 3.9 | 6.8 | 9.1 | 12.5 | 12.6 | 11.1 | 7.7 | 4 | 1.8 |
| 月降水 mm | 205 | 186.4 | 191.1 | 100.4 | 48.4 | 19.2 | 3.4 | 3.3 | 17 | 78.6 | 146.8 | 279.6 |
| 格点雪盖 0–1 | 0.042 | 0.031 | 0.021 | 0.004 | 0 | 0 | 0 | 0 | 0 | 0.001 | 0.01 | 0.035 |

**海雾红杉河谷 · 车窗可见的植被带。**

- 0–500 m，河漫滩与湿润沟谷；巨干留明显空隙。树形候选 海岸红杉（Sequoia sempervirens）。灌层见越橘。地面为剑蕨、红杉酢浆草。红杉酢浆草（白/淡粉，3、4、5、6 月）。

林线 —/—/—/— m；季节雪缘 —/—/—/— m。当地需补的树形有花旗松 Pseudotsuga menziesii。

**岩石与生灵。** 灰褐冲积砾见河滩圆石；灰褐砂岩见河谷露头。冬鹪鹩近缘的太平洋鹪鹩在倒木根盘，暗冠蓝鸦在林缘。黑尾鹿；封闭林内目击率低。昆虫窗口：熊蜂（3、4、5、6、7、8、9 月，白天，林缘开花灌木）；蜻蜓（6、7、8、9 月，白天，河湾静水）。

资料：[MDSP RTMP 03_26_13 NO MAPS.indd](https://www.parks.ca.gov/pages/1324/files/Final%20Draft.FINAL.sm.pdf) · [Section I NATURAL HISTORY OF THE COAST REDWOODS](https://learning.parks.ca.gov/wp-content/uploads/2025/05/02-RedwoodEd-secinathistory.pdf) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-123.92&latitude=40.32&start=20010101&end=20201231&format=JSON)

### 加州一号公路 Big Sur

美国加州，Bixby Creek–Big Sur River。选段海拔约0–250米。Bixby 拱桥跨溪切出的窄口；从海风矮灌丛拐进 Pfeiffer 湿沟才见红杉。零散牧地与旅舍贴谷底。

湿沟原型可重用的只有红杉海雾带；崖头和南向灌坡维持开阔。

**天气与积雪。** 夏季海雾贴崖，冬雨后溪涨和塌方；冬雨夏雾，河漫滩透光处草层较厚。低海崖通常无持续雪季。样点 36.24°, -121.77°，格点平均高度 94 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 13.7 | 13.4 | 13.7 | 13.8 | 14.5 | 15.5 | 16.5 | 17.3 | 17.9 | 17.4 | 15.6 | 13.8 |
| 平均日低 °C | 11 | 10.7 | 10.8 | 10.7 | 11.4 | 12.3 | 13.5 | 14.2 | 14.5 | 13.9 | 12.6 | 11.3 |
| 月降水 mm | 78.7 | 78.3 | 60.4 | 29.2 | 12.8 | 3.6 | 1.2 | 1.7 | 4.3 | 21 | 40.2 | 94.1 |
| 格点雪盖 0–1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

**加州地中海型海崖 · 车窗可见的植被带。**

- 0–150 m，崖缘风剪灌丛；橡树限避风凹地。树形候选 海岸栎（Quercus agrifolia）。灌层见海岸鼠尾草。地面为草甸禾草、裸岩。加州罂粟（橙，3、4、5 月）。
- 150–650 m，向海旱坡；下切到常流湿沟时切红杉原型。树形候选 海岸栎（Quercus agrifolia）。灌层见熊果灌丛、加州丁香。地面为硬叶灌丛落叶。加州丁香（蓝/白，3、4、5 月）。

林线 —/—/—/— m；季节雪缘 —/—/—/— m。

**岩石与生灵。** 灰白花岗岩见崖面坡脚块；灰褐变质岩见片状崩壁。褐鹈鹕在海浪上方，美洲河乌在入海溪。黑尾鹿栖灌丛，海面偶见鲸。昆虫窗口：粉蝶类（3、4、5、6、7、8、9 月，白天，晴天向阳灌坡）；野蜂（3、4、5、6、7、8 月，白天，鼠尾草花）。

**海雾红杉河谷 · 车窗可见的植被带。**

- 0–500 m，河漫滩与湿润沟谷；巨干留明显空隙。树形候选 海岸红杉（Sequoia sempervirens）。灌层见越橘。地面为剑蕨、红杉酢浆草。红杉酢浆草（白/淡粉，3、4、5、6 月）。

林线 —/—/—/— m；季节雪缘 —/—/—/— m。当地需补的树形有花旗松 Pseudotsuga menziesii。

**岩石与生灵。** 灰褐冲积砾见河滩圆石；灰褐砂岩见河谷露头。冬鹪鹩近缘的太平洋鹪鹩在倒木根盘，暗冠蓝鸦在林缘。黑尾鹿；封闭林内目击率低。昆虫窗口：熊蜂（3、4、5、6、7、8、9 月，白天，林缘开花灌木）；蜻蜓（6、7、8、9 月，白天，河湾静水）。

资料：[ABOUT Pfeiffer Big Sur State Park | California State Parks](https://www.parks.ca.gov/?page_id=29831&pubDate=20250511) · [Section I NATURAL HISTORY OF THE COAST REDWOODS](https://learning.parks.ca.gov/wp-content/uploads/2025/05/02-RedwoodEd-secinathistory.pdf) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-121.77&latitude=36.24&start=20010101&end=20201231&format=JSON)

### 科罗拉多 Trail Ridge Road

美国科罗拉多，Beaver Meadows–Fall River Pass。选段海拔约2450–3713米。封闭针叶树冠逐渐碎成偏冠树岛，最后看见连续天际线。冰斗、风剪平顶与大块石之间只有季节性游客设施。

**天气与积雪。** 高处夏季亦遇雷雨，垭口冬季吹雪。高处约10–6月，风口有裸露斑。样点 40.4°, -105.75°，格点平均高度 2670 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | -2.5 | -2.2 | 2.9 | 8 | 13.9 | 21.8 | 25.5 | 23.9 | 19.7 | 11.2 | 4 | -2.5 |
| 平均日低 °C | -11.8 | -12.1 | -8.7 | -4.9 | -0.5 | 4.9 | 9.1 | 8.1 | 3.9 | -2 | -6.7 | -11.7 |
| 月降水 mm | 34 | 38.7 | 47 | 64.5 | 68.3 | 43.9 | 53.6 | 44.3 | 41.7 | 43.4 | 35 | 36.7 |
| 格点雪盖 0–1 | 0.563 | 0.591 | 0.426 | 0.167 | 0.048 | 0.002 | 0 | 0 | 0.004 | 0.06 | 0.187 | 0.467 |

**落基山林线公路 · 车窗可见的植被带。**

- 2350–2850 m，谷底草坡，杨树沿水分集中的沟。树形候选 西黄松（Pinus ponderosa）、美洲山杨（Populus tremuloides）。灌层见矮柳。地面为草甸禾草、林下针叶毡。科罗拉多蓝耧斗菜（蓝白，6、7、8 月）。
- 2850–3450 m，高处树冠受风倾斜。树形候选 恩氏云杉（Picea engelmannii）、亚高山冷杉（Abies lasiocarpa）。灌层见矮柳。地面为越橘地毯、莎草。科罗拉多蓝耧斗菜（蓝白，6、7、8 月）。
- 3450–4000 m，冰缘地和碎石，花限融雪后土袋。灌层见矮柳。地面为垫状草本、岩面地衣。高山勿忘草（天蓝，6、7、8 月）。

林线 3450/3450/3450/3450 m；季节雪缘 2200/2750/3800/3100 m。

**岩石与生灵。** 灰白花岗岩见块海与冰斗；灰褐片麻岩见条带崖面。白尾雷鸟在无树岩坡，克拉克星鸦在林线上缘。夏季碎石坡旱獭，草甸马鹿。昆虫窗口：熊蜂（6、7、8 月，白天，林线花甸）；灰蝶类（6、7、8 月，白天，避风的石间花丛）。

资料：[Wildlife Viewing in Rocky Mountain National Park (U.S. National Park Service)](https://www.nps.gov/thingstodo/wildlife-viewing-in-rocky-mountain-national-park.htm) · [Alpine Tundra Ecosystem - Rocky Mountain National Park (U.S. National Park Service)](https://home.nps.gov/romo/learn/nature/alpine_tundra_ecosystem.htm) · [Blue & Purple Wildflowers - Rocky Mountain National Park (U.S. National Park Service)](https://home.nps.gov/romo/learn/nature/blue_purple.htm) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-105.75&latitude=40.4&start=20010101&end=20201231&format=JSON)

### 落基山 Bear Lake Road

美国科罗拉多，Moraine Park 路口–Bear Lake。选段海拔约2450–2888米。路先贴宽阔冲积草甸，后升入冰碛林；终点是林间湖。河岸柳丛常比邻近干坡更高，近湖多步道设施。

**天气与积雪。** 高处夏季亦遇雷雨，垭口冬季吹雪。约11–5月，湖边背阴地较迟融。样点 40.32°, -105.64°，格点平均高度 2670 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | -2.5 | -2.2 | 2.9 | 8 | 13.9 | 21.8 | 25.5 | 23.9 | 19.7 | 11.2 | 4 | -2.5 |
| 平均日低 °C | -11.8 | -12.1 | -8.7 | -4.9 | -0.5 | 4.9 | 9.1 | 8.1 | 3.9 | -2 | -6.7 | -11.7 |
| 月降水 mm | 34 | 38.7 | 47 | 64.5 | 68.3 | 43.9 | 53.6 | 44.3 | 41.7 | 43.4 | 35 | 36.7 |
| 格点雪盖 0–1 | 0.563 | 0.591 | 0.426 | 0.167 | 0.048 | 0.002 | 0 | 0 | 0.004 | 0.06 | 0.187 | 0.467 |

**落基山林线公路 · 车窗可见的植被带。**

- 2350–2850 m，谷底草坡，杨树沿水分集中的沟。树形候选 西黄松（Pinus ponderosa）、美洲山杨（Populus tremuloides）。灌层见矮柳。地面为草甸禾草、林下针叶毡。科罗拉多蓝耧斗菜（蓝白，6、7、8 月）。
- 2850–3450 m，高处树冠受风倾斜。树形候选 恩氏云杉（Picea engelmannii）、亚高山冷杉（Abies lasiocarpa）。灌层见矮柳。地面为越橘地毯、莎草。科罗拉多蓝耧斗菜（蓝白，6、7、8 月）。

林线 3450/3450/3450/3450 m；季节雪缘 2200/2750/3800/3100 m。

**岩石与生灵。** 灰白花岗岩见块海与冰斗；灰褐片麻岩见条带崖面。白尾雷鸟在无树岩坡，克拉克星鸦在林线上缘。夏季碎石坡旱獭，草甸马鹿。昆虫窗口：熊蜂（6、7、8 月，白天，林线花甸）；灰蝶类（6、7、8 月，白天，避风的石间花丛）。

资料：[List of Distances and Elevations Inside Rocky Mountain National Park - Rocky Mountain National Park (U.S. National Park Service)](https://www.nps.gov/romo/planyourvisit/distances-and-elevations.htm) · [Alpine Tundra Ecosystem - Rocky Mountain National Park (U.S. National Park Service)](https://home.nps.gov/romo/learn/nature/alpine_tundra_ecosystem.htm) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-105.64&latitude=40.32&start=20010101&end=20201231&format=JSON)

### 犹他 Arches Scenic Drive

美国犹他，园入口–Devils Garden。选段海拔约1200–1600米。道路从入口沿崖抬升，砂岩鳍列挡住地平线；岩拱与窗洞仅在连续砂岩体。季流沟、稀疏停车湾。

**天气与积雪。** 午后热浪，短时强雨灌入干沟。约12–2月风暴后短时，裸岩向阳面先化。样点 38.7°, -109.57°，格点平均高度 1819 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 4 | 6.3 | 12.1 | 16.6 | 22.5 | 30.2 | 33.2 | 30.8 | 26.3 | 18 | 10.7 | 3.8 |
| 平均日低 °C | -5.9 | -4.5 | -1.1 | 1.8 | 7 | 13.2 | 17.8 | 16.3 | 11.7 | 4.3 | -1.2 | -5.8 |
| 月降水 mm | 22.6 | 22.7 | 23.6 | 21.8 | 22.7 | 11.6 | 31.1 | 30.9 | 33.8 | 31.2 | 21.1 | 27.3 |
| 格点雪盖 0–1 | 0.152 | 0.076 | 0.028 | 0.004 | 0.001 | 0 | 0 | 0 | 0 | 0.003 | 0.024 | 0.141 |

**科罗拉多高原红岩 · 车窗可见的植被带。**

- 1100–2000 m，树限节理土袋，裸砂岩禁树。树形候选 犹他刺柏（Juniperus osteosperma）、矮松（Pinus edulis）。灌层见黑刷灌木。地面为生物结皮、丛生旱草。沙漠锦葵（橙，4、5、6 月）。

林线 —/—/—/— m；季节雪缘 —/—/—/— m。

**岩石与生灵。** 赤红砂岩见直立岩鳍；赭红砂岩见层状台阶。渡鸦在台地上升气流，灌丛鸦在圆柏林。骡鹿清晨近沟，日间空旷岩面少见大型兽。昆虫窗口：野蜂（3、4、5、6 月，白天，雨后草花）；粉蝶类（4、5、6、7、8、9 月，白天，沟底花带）。

资料：[Biophysical Description of Arches National Park (U.S. National Park Service)](https://www.nps.gov/im/ncpn/bpd-arch.htm) · [Island in the Sky - Canyonlands National Park (U.S. National Park Service)](https://home.nps.gov/cany/planyourvisit/islandinthesky.htm) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-109.57&latitude=38.7&start=20010101&end=20201231&format=JSON)
### 峡谷地 Island in the Sky

美国犹他，峡谷地 Island in the Sky 台顶–Grand View Point。选段海拔约1750–1900米。车多数时候留在桌面，走近边缘才看见绿河与科罗拉多河切出的层层平台。短草、矮松和圆柏散在土袋，停车点远离谷底。

**天气与积雪。** 午后热浪，短时强雨灌入干沟。约12–3月间歇，阴影岩架留雪。样点 38.38°, -109.86°，格点平均高度 1536 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 5.3 | 8.3 | 14.3 | 18.8 | 24.7 | 32.3 | 35.3 | 33 | 28.2 | 19.9 | 12 | 5.1 |
| 平均日低 °C | -4.4 | -3 | 0.2 | 3.4 | 8.8 | 15 | 19.9 | 18.3 | 13.3 | 5.7 | -0.2 | -4.3 |
| 月降水 mm | 16 | 16.3 | 17.2 | 16 | 17.3 | 10.1 | 24.8 | 24 | 26.8 | 26.5 | 16.1 | 19 |
| 格点雪盖 0–1 | 0.053 | 0.03 | 0.009 | 0.001 | 0 | 0 | 0 | 0 | 0 | 0.001 | 0.011 | 0.062 |

**科罗拉多高原红岩 · 车窗可见的植被带。**

- 1100–2000 m，树限节理土袋，裸砂岩禁树。树形候选 犹他刺柏（Juniperus osteosperma）、矮松（Pinus edulis）。灌层见黑刷灌木。地面为生物结皮、丛生旱草。沙漠锦葵（橙，4、5、6 月）。

林线 —/—/—/— m；季节雪缘 —/—/—/— m。

**岩石与生灵。** 赤红砂岩见直立岩鳍；赭红砂岩见层状台阶。渡鸦在台地上升气流，灌丛鸦在圆柏林。骡鹿清晨近沟，日间空旷岩面少见大型兽。昆虫窗口：野蜂（3、4、5、6 月，白天，雨后草花）；粉蝶类（4、5、6、7、8、9 月，白天，沟底花带）。

资料：[Island in the Sky - Canyonlands National Park (U.S. National Park Service)](https://home.nps.gov/cany/planyourvisit/islandinthesky.htm) · [Biophysical Description of Arches National Park (U.S. National Park Service)](https://www.nps.gov/im/ncpn/bpd-arch.htm) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-109.86&latitude=38.38&start=20010101&end=20201231&format=JSON)

### 阿巴拉契亚 Blue Ridge Parkway

美国北卡，Asheville–Craggy Gardens。选段海拔约600–1700米。脊线弯道连续打开蓝灰山层，迎风处出现杜鹃灌丛；低处沟谷湿、阔叶林封顶，高处进入云雾。石砌眺望台、修剪路肩。

杜鹃与山月桂分海拔相继开放；年度花讯能进一步缩短窗口。萤火虫条件只给普通种群，齐闪现象须有独立地点记录。

**天气与积雪。** 春暖时下坡先展叶，夏季山脊雾，秋霜后落叶。高段约11–3月间歇覆雪，山下更短。样点 35.5°, -82.8°，格点平均高度 738 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 7 | 8.9 | 13.6 | 18.9 | 22.9 | 27.1 | 29 | 28.9 | 25.8 | 20 | 14 | 9 |
| 平均日低 °C | -3.2 | -1.8 | 2 | 6.6 | 11.6 | 15.9 | 17.7 | 17.3 | 13.9 | 7.9 | 2.1 | -0.9 |
| 月降水 mm | 99 | 98.4 | 105.5 | 112.9 | 119.7 | 117.1 | 135.2 | 119.2 | 116.9 | 97.8 | 102.2 | 124.3 |
| 格点雪盖 0–1 | 0.034 | 0.054 | 0.012 | 0.001 | 0 | 0 | 0 | 0 | 0 | 0 | 0.009 | 0.039 |

**阿巴拉契亚阔叶山脊 · 车窗可见的植被带。**

- 150–1350 m，橡树林冠；湿沟槭与春季短命花。树形候选 北美红栎（Quercus rubra）、糖槭（Acer saccharum）。灌层见山月桂、杜鹃。地面为林下落叶、地蕨。延龄草（白，4、5 月）。
- 1350–1850 m，限南阿巴拉契亚高峰；仙纳度的公路达不到此带；1350–1500 m仍可保留阔叶林镶嵌，冷杉限最高峰。树形候选 红云杉（Picea rubens）、弗氏冷杉（Abies fraseri）。灌层见杜鹃。地面为苔藓、林下针叶毡。卡托巴杜鹃（紫粉，5、6 月）。

林线 —/—/—/— m；季节雪缘 —/—/—/— m。

**岩石与生灵。** 灰褐片麻岩见条带崖面；灰色变质岩见破碎山脊。红眼莺雀在阔叶树冠，绯红丽唐纳雀在成熟林。白尾鹿，林缘黑熊低频。昆虫窗口：萤火虫（6、7 月，夜间，温暖湿夜的草甸林缘）；蝉（7、8、9 月，白天，阔叶树冠高温时）；熊蜂（4、5、6、7、8、9 月，白天，杜鹃及草花）。

资料：[Wildflowers - Blue Ridge Parkway (U.S. National Park Service)](https://home.nps.gov/blri/learn/nature/wildflowers.htm) · [Synchronous Fireflies - Great Smoky Mountains National Park (U.S. National Park Service)](https://www.nps.gov/grsm/learn/nature/fireflies.htm?unit=m) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-82.8&latitude=35.5&start=20010101&end=20201231&format=JSON)

### 仙纳度 Skyline Drive

美国弗吉尼亚，Front Royal–Big Meadows。选段海拔约200–1100米。沿山脊一侧看 Shenandoah 河谷，一侧看起伏林海；Big Meadows 草地和林缘留出长视距。谷外有田块，脊顶林间设眺望湾。

行车段不达南阿巴拉契亚云杉–冷杉带，Big Meadows 也不能套林冠。

**天气与积雪。** 春暖时下坡先展叶，夏季山脊雾，秋霜后落叶。约12–3月间歇，冻雨亦常影响山脊。样点 38.54°, -78.35°，格点平均高度 208 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 5.2 | 7.1 | 12.5 | 19.1 | 24.2 | 29.2 | 31.9 | 31.3 | 27.3 | 20.2 | 13.4 | 7.3 |
| 平均日低 °C | -4.4 | -3.7 | 0.2 | 6 | 11.9 | 16.7 | 19.2 | 18.4 | 14.5 | 8 | 1.9 | -2.1 |
| 月降水 mm | 60.5 | 64.6 | 77.4 | 90.9 | 115.9 | 112.6 | 106.7 | 100 | 106.4 | 89.6 | 78 | 81.2 |
| 格点雪盖 0–1 | 0.067 | 0.113 | 0.032 | 0.003 | 0 | 0 | 0 | 0 | 0 | 0.002 | 0.009 | 0.077 |

**阿巴拉契亚阔叶山脊 · 车窗可见的植被带。**

- 150–1350 m，橡树林冠；湿沟槭与春季短命花。树形候选 北美红栎（Quercus rubra）、糖槭（Acer saccharum）。灌层见山月桂、杜鹃。地面为林下落叶、地蕨。延龄草（白，4、5 月）。

林线 —/—/—/— m；季节雪缘 —/—/—/— m。

**岩石与生灵。** 灰褐片麻岩见条带崖面；灰色变质岩见破碎山脊。红眼莺雀在阔叶树冠，绯红丽唐纳雀在成熟林。白尾鹿，林缘黑熊低频。昆虫窗口：萤火虫（6、7 月，夜间，温暖湿夜的草甸林缘）；蝉（7、8、9 月，白天，阔叶树冠高温时）；熊蜂（4、5、6、7、8、9 月，白天，杜鹃及草花）。

资料：[Wildflowers - Shenandoah National Park (U.S. National Park Service)](https://www.nps.gov/shen/learn/nature/wildflowers.htm) · [Wildflowers - Blue Ridge Parkway (U.S. National Park Service)](https://home.nps.gov/blri/learn/nature/wildflowers.htm) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-78.35&latitude=38.54&start=20010101&end=20201231&format=JSON)

### 阿拉斯加 Dalton Highway

美国阿拉斯加，Coldfoot–Atigun Pass–北坡。选段海拔约0–1444米（含延至沿海平原的地形）。南侧云杉稀落，越口后矮灌、棉花莎草和季节融水池取代乔木。伴随管线、料场与稀少营地；管线不必紧贴每个弯。

**天气与积雪。** 极端大陆性冬季；夏季沼泽蚊群；长冬吹雪，夏季低云，融冰形成浅塘。北坡约9–5月，雪被受风再分配。样点 68.78°, -148.83°，格点平均高度 556 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | -20.8 | -18.1 | -15.6 | -6.3 | 3.4 | 12.5 | 14.2 | 10.6 | 4 | -6.4 | -15.8 | -19.1 |
| 平均日低 °C | -26.5 | -24.8 | -24.8 | -15.6 | -4.4 | 4.7 | 6.8 | 3.3 | -2.5 | -11.9 | -20.9 | -24.5 |
| 月降水 mm | 19.9 | 22.2 | 19.3 | 23.8 | 43.3 | 66.8 | 96.8 | 91.1 | 64 | 39.4 | 26.9 | 21.5 |
| 格点雪盖 0–1 | 1 | 1 | 1 | 0.999 | 0.509 | 0.016 | 0.003 | 0.023 | 0.227 | 0.759 | 0.988 | 0.999 |

**阿拉斯加内陆泰加林 · 车窗可见的植被带。**

- 100–850 m，低洼冷土黑云杉矮且稀，排水河阶白云杉较高。树形候选 黑云杉（Picea mariana）、白云杉（Picea glauca）、白桦类（Betula neoalaskana）。灌层见矮柳、越橘。地面为苔藓、岩面地衣。柳兰（玫红，6、7、8 月）。

林线 850/850/850/850 m；季节雪缘 100/450/1800/850 m。

**岩石与生灵。** 灰褐冲积砾见河滩圆石；灰褐冰碛见混粒石垄。灰噪鸦在针叶枝间，黑顶山雀在林缘。驼鹿沿柳丛活动；林内可见度低。昆虫窗口：蚊（5、6、7、8 月，白天，沼地静水）；蜻蜓（6、7、8 月，白天，林间池塘）。

**布鲁克斯北坡苔原 · 车窗可见的植被带。**

- 0–1450 m，湿地莎草，排水脊与碎石处低矮垫丛。灌层见矮柳、矮桦。地面为莎草、棉花莎草、岩面地衣。仙女木（白，6、7 月）。

林线 —/—/—/— m；季节雪缘 0/0/1300/400 m。

**岩石与生灵。** 灰褐冰碛见混粒石垄；灰色碎岩见冻融多边形。柳雷鸟在矮柳，苔原天鹅在平原池塘。驯鹿迁徙，麝牛在北坡局部。昆虫窗口：蚊（6、7、8 月，白天，融水池背风处）；熊蜂（6、7 月，白天，开花矮灌）。
资料：[Artist in Residence - Dalton Highway | Bureau of Land Management](https://www.blm.gov/get-involved/artist-in-residence/air-sites/dalton-highway) · [Dalton Highway - Frequently Asked Questions | Bureau of Land Management](https://www.blm.gov/learn/interpretive-centers/arctic-interagency-visitor-center/frequently-asked-questions) · [The Dalton Highway Visitor Guide](https://www.blm.gov/sites/default/files/docs/2022-04/AK-Dalton_Highway_Visitor_Guide_2022.pdf) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-148.83&latitude=68.78&start=20010101&end=20201231&format=JSON)

### 阿拉斯加 Parks Highway

美国阿拉斯加，George Parks Highway 的 Denali 入口河谷。选段海拔约450–700米。Nenana 河谷灰砾岸对着黑云杉沼地，林隙露出阿拉斯加山脉。入口有旅店、桥与铁路走廊，路旁并非连续雪山。

**天气与积雪。** 极端大陆性冬季；夏季沼泽蚊群。约10–4月为主要雪季。样点 63.72°, -148.88°，格点平均高度 1108 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | -15.4 | -12.1 | -9.2 | -2.4 | 4.2 | 11.1 | 12.8 | 10.7 | 4.8 | -3.6 | -12.6 | -13.9 |
| 平均日低 °C | -21.4 | -19.6 | -19.2 | -10.8 | -2.1 | 4.2 | 6.3 | 4.5 | -1 | -9.6 | -18.2 | -19.6 |
| 月降水 mm | 40.4 | 36 | 37.6 | 45.7 | 72.1 | 147.8 | 160.6 | 143.6 | 111.2 | 70.2 | 52.5 | 44.8 |
| 格点雪盖 0–1 | 1 | 1 | 1 | 0.983 | 0.511 | 0.007 | 0.001 | 0.002 | 0.141 | 0.759 | 0.987 | 0.998 |

**阿拉斯加内陆泰加林 · 车窗可见的植被带。**

- 100–850 m，低洼冷土黑云杉矮且稀，排水河阶白云杉较高。树形候选 黑云杉（Picea mariana）、白云杉（Picea glauca）、白桦类（Betula neoalaskana）。灌层见矮柳、越橘。地面为苔藓、岩面地衣。柳兰（玫红，6、7、8 月）。

林线 850/850/850/850 m；季节雪缘 100/450/1800/850 m。

**岩石与生灵。** 灰褐冲积砾见河滩圆石；灰褐冰碛见混粒石垄。灰噪鸦在针叶枝间，黑顶山雀在林缘。驼鹿沿柳丛活动；林内可见度低。昆虫窗口：蚊（5、6、7、8 月，白天，沼地静水）；蜻蜓（6、7、8 月，白天，林间池塘）。

资料：[Monitoring Natural Resources in Denali National Park and Preserve (U.S. National Park Service)](https://www.nps.gov/im/cakn/dena.htm) · [An Ecological Overview of Denali National Park and Preserve (U.S. National Park Service)](https://www.nps.gov/articles/aps-v5-i1-c2.htm) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-148.88&latitude=63.72&start=20010101&end=20201231&format=JSON)

### 亚利桑那 Cactus Forest Drive

美国亚利桑那，图森东区 Rincon 山前环路。选段海拔约800–1000米。巨柱仙人掌与庇护豆科树疏散共生；山前沟渠平时多干，夏雨后有径流。路铺装，园区外缘接图森。

图森东区以变质岩山基为近景；西区火山岩条目不参与此路段抽取。

**天气与积雪。** 夏季季风雷阵雨，冬春降水决定草花多少。冬季偶雪，扇面无持续积雪。样点 32.18°, -110.73°，格点平均高度 1262 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 16.1 | 17.5 | 21.6 | 25.6 | 30.5 | 36.2 | 33.9 | 33.3 | 31.8 | 27.2 | 21.2 | 15.7 |
| 平均日低 °C | 1.8 | 2.7 | 5.6 | 8.5 | 13 | 19 | 21.2 | 20.6 | 17.8 | 12.1 | 6.3 | 1.6 |
| 月降水 mm | 24.4 | 21.2 | 14 | 7.4 | 4.2 | 9.4 | 82.3 | 65.3 | 40.6 | 14.9 | 15.6 | 25.1 |
| 格点雪盖 0–1 | 0.001 | 0.001 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

**索诺兰柱仙人掌冲积扇 · 车窗可见的植被带。**

- 600–1300 m，巨柱为树形多肉；幼株在庇护树下，冲沟内豆科乔木需独立模型。树形候选 巨柱仙人掌（Carnegiea gigantea）。灌层见杂酚油灌木、帕洛维德幼树。地面为丛生旱草、裸砾。巨柱仙人掌（白，4、5、6 月）。

林线 —/—/—/— m；季节雪缘 —/—/—/— m。当地需补的树形有帕洛维德树 Parkinsonia microphylla、牧豆树 Prosopis velutina。

**岩石与生灵。** 灰褐片麻岩见东区山前棱石；灰褐冲积砾见河滩圆石。吉拉啄木鸟在柱仙人掌洞，白翅哀鸽在冠顶花果。领西猯群在清晨穿灌丛。昆虫窗口：野蜂（3、4、5、6 月，白天，柱仙人掌花与灌木）；蝉（6、7、8 月，白天，热天豆科树上）。

资料：[Saguaro - Saguaro National Park (U.S. National Park Service)](https://www.nps.gov/sagu/learn/nature/saguaro.htm?pubDate=20250808) · [Saguaro Cactus: Sentinel of the Southwest (U.S. National Park Service)](https://www.nps.gov/articles/saguaro-cactus-facts.htm) · [Geology - Saguaro National Park (U.S. National Park Service)](https://www.nps.gov/sagu/learn/nature/geology.htm) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-110.73&latitude=32.18&start=20010101&end=20201231&format=JSON)

### 亚利桑那 Bajada Loop Drive

美国亚利桑那，图森西区 Tucson Mountains。选段海拔约700–850米。低矮火山山脊前的砾质扇，未铺装环路从巨柱之间穿过；雨水顺浅沟而下，远处山体低于东区 Rincon。

西区山体以古火山复合体为背景；砾扇近景与东区相似，山体材质不同。

**天气与积雪。** 夏季季风雷阵雨，冬春降水决定草花多少。冬季偶雪，无固定雪季。样点 32.28°, -111.2°，格点平均高度 738 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 19 | 20.2 | 24.5 | 28.6 | 33.6 | 39.5 | 38.1 | 37.3 | 35.7 | 30.6 | 24.4 | 18.5 |
| 平均日低 °C | 5 | 5.8 | 8.6 | 11.7 | 16.2 | 22.1 | 25 | 24.3 | 21.6 | 15.6 | 10.1 | 4.9 |
| 月降水 mm | 27 | 23.5 | 15.4 | 8 | 4.7 | 6 | 63.1 | 52.4 | 30.8 | 14.6 | 15 | 28.2 |
| 格点雪盖 0–1 | 0.001 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

**索诺兰柱仙人掌冲积扇 · 车窗可见的植被带。**

- 600–1300 m，巨柱为树形多肉；幼株在庇护树下，冲沟内豆科乔木需独立模型。树形候选 巨柱仙人掌（Carnegiea gigantea）。灌层见杂酚油灌木、帕洛维德幼树。地面为丛生旱草、裸砾。巨柱仙人掌（白，4、5、6 月）。

林线 —/—/—/— m；季节雪缘 —/—/—/— m。当地需补的树形有帕洛维德树 Parkinsonia microphylla、牧豆树 Prosopis velutina。

**岩石与生灵。** 棕灰火山岩见西区山前棱石；灰褐冲积砾见河滩圆石。吉拉啄木鸟在柱仙人掌洞，白翅哀鸽在冠顶花果。领西猯群在清晨穿灌丛。昆虫窗口：野蜂（3、4、5、6 月，白天，柱仙人掌花与灌木）；蝉（6、7、8 月，白天，热天豆科树上）。

资料：[Accessibility - Saguaro National Park (U.S. National Park Service)](https://home.nps.gov/sagu/planyourvisit/accessibility.htm) · [Saguaro Cactus: Sentinel of the Southwest (U.S. National Park Service)](https://www.nps.gov/articles/saguaro-cactus-facts.htm) · [Geology - Saguaro National Park (U.S. National Park Service)](https://www.nps.gov/sagu/learn/nature/geology.htm) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-111.2&latitude=32.28&start=20010101&end=20201231&format=JSON)

### 南达科他 Badlands Loop Road

美国南达科他，SD-240 东入口–Pinnacles。选段海拔约700–1000米。彩条状脊从草原边界裸露；路一转又回到平草台。短暂径流冲出深沟，风车与围栏限园外牧地。

**天气与积雪。** 夏季雷阵雨后泥坡鲜亮，冬季暴风雪。约11–3月，开阔地吹雪明显。样点 43.78°, -102.04°，格点平均高度 755 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 2.6 | 3.4 | 10.7 | 16.2 | 22.1 | 29.3 | 33.9 | 31.8 | 26.3 | 16.4 | 9.3 | 2.4 |
| 平均日低 °C | -7.8 | -8 | -3.1 | 1.5 | 7.6 | 14.1 | 18.5 | 16.8 | 11.5 | 3.4 | -2.2 | -6.7 |
| 月降水 mm | 7.9 | 12.7 | 22.8 | 47.7 | 76.7 | 71.3 | 50.6 | 45.3 | 35.3 | 34.8 | 11.5 | 10.6 |
| 格点雪盖 0–1 | 0.077 | 0.082 | 0.042 | 0.025 | 0.002 | 0 | 0 | 0 | 0 | 0.02 | 0.033 | 0.088 |

**混合草原与劣地 · 车窗可见的植被带。**

- 600–1050 m，树限常湿沟底；路边干台顶和泥岩壁皆无树。树形候选 三角叶杨（Populus deltoides）。灌层见蒿灌丛。地面为混合草原禾草、裸土。草原锥花（黄，6、7、8 月）。

林线 —/—/—/— m；季节雪缘 —/—/—/— m。

**岩石与生灵。** 粉灰泥岩见水平彩带沟脊；灰黄砂岩见层状台阶。西草地鹨在草原鸣唱，黑嘴喜鹊在沟底灌丛。野牛在草场；草原犬鼠居短草洞群。昆虫窗口：草蜢（6、7、8、9 月，白天，干草茎）；野蜂（5、6、7、8、9 月，白天，杂色草花带）。
资料：[Badlands Mixed-grass Prairies (U.S. National Park Service)](https://home.nps.gov/articles/000/prairie-ecology-badl.htm) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-102.04&latitude=43.78&start=20010101&end=20201231&format=JSON)

## 欧洲

### 意大利 SS38 斯泰尔维奥山口

意大利南蒂罗尔，Prato allo Stelvio–山口。选段海拔约910–2758米。由村边果园和山谷针叶林升到无树牧坡，最后在碎石墙下密集折返。融水下泄，雪峰在弯间反复显隐。

**天气与积雪。** 夏季垭口亦可能飞雪，背阴槽积雪迟化。上段约10–6月，峰位高于公路。样点 46.53°, 10.45°，格点平均高度 1968 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | -4.2 | -3.2 | 0.5 | 5.8 | 10.7 | 15.2 | 17.1 | 16.7 | 13 | 8.6 | 1.9 | -3 |
| 平均日低 °C | -13.4 | -13 | -8.7 | -3.1 | 1 | 5.1 | 6.9 | 6.8 | 2.9 | -0.6 | -5.4 | -11.5 |
| 月降水 mm | 40.5 | 38.5 | 49.3 | 68.8 | 103.4 | 114 | 118.7 | 130.9 | 90.9 | 87.8 | 85.8 | 51.2 |
| 格点雪盖 0–1 | 0.875 | 0.882 | 0.653 | 0.202 | 0.034 | 0.005 | 0.001 | 0.002 | 0.017 | 0.07 | 0.323 | 0.72 |

**中阿尔卑斯落叶松山口 · 车窗可见的植被带。**

- 850–1650 m，避开开垦草场。树形候选 欧洲云杉（Picea abies）。灌层见越橘。地面为草甸禾草、林下针叶毡。草甸毛茛（黄，5、6、7 月）。
- 1650–2200 m，上缘疏林；落叶松秋黄冬裸。树形候选 欧洲落叶松（Larix decidua）、瑞士五针松（Pinus cembra）。灌层见高山杜鹃。地面为越橘地毯、草甸禾草。锈叶杜鹃（玫红，6、7、8 月）。
- 2200–3200 m，碎石坡仅在稳固土袋有花。地面为垫状草本、裸岩。高山龙胆（深蓝，6、7、8 月）。

林线 2200/2200/2200/2200 m；季节雪缘 900/1700/3000/2200 m。

**岩石与生灵。** 灰褐片麻岩见条带崖面；灰色碎岩见陡坡碎石扇。黄嘴山鸦在垭口乘风，岩鹨在石堆。旱獭草坡洞口警戒，岩羚在陡壁。昆虫窗口：熊蜂（6、7、8、9 月，白天，高山牧坡花丛）；粉蝶类（6、7、8 月，白天，避风向阳草甸）。

资料：[Gli animali e le piante del Parco Nazionale dello Stelvio](https://www.parconazionale-stelvio.it/it/il-parco-nazionale/flora-e-fauna.html) · [Microsoft Word - 2441_3647_3_R01_Rev1_Rapporto ambientale_EC](https://lombardia.stelviopark.it/wp-content/uploads/2019/05/PP_VAS_Rapporto-Ambientale.pdf) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=10.45&latitude=46.53&start=20010101&end=20201231&format=JSON)

### 奥地利 Großglockner Hochalpenstraße

奥地利，Ferleiten–Hochtor 主线。选段海拔约1150–2504（Edelweißspitze 支路2571）米。高山牧场起步，石质护栏把车带过无树隘口。通往 Kaiser-Franz-Josefs-Höhe 的支路才展开 Pasterze 冰舌视野；融水溪位于下方。

山谷低处林地与高牧场都可能比山口暖湿；这里的岩性配方只作变质山体的示例，不代表每面山崖。

**天气与积雪。** 夏季垭口亦可能飞雪，背阴槽积雪迟化。高段约10–5月，阴坡六月仍有斑雪。样点 47.08°, 12.84°，格点平均高度 1697 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | -3.3 | -2.6 | 1.6 | 7.4 | 12.2 | 16.3 | 18 | 17.6 | 13.3 | 9.1 | 2.8 | -1.9 |
| 平均日低 °C | -11.7 | -11.3 | -7.2 | -2.2 | 2 | 6.1 | 7.8 | 7.8 | 3.8 | 0.3 | -4 | -9.4 |
| 月降水 mm | 58.9 | 54.8 | 70.6 | 82 | 126.7 | 151.1 | 167.6 | 175.1 | 125.7 | 105.7 | 95.7 | 69.6 |
| 格点雪盖 0–1 | 0.837 | 0.836 | 0.544 | 0.151 | 0.025 | 0.005 | 0.001 | 0.003 | 0.025 | 0.086 | 0.27 | 0.607 |

**中阿尔卑斯落叶松山口 · 车窗可见的植被带。**

- 850–1650 m，避开开垦草场。树形候选 欧洲云杉（Picea abies）。灌层见越橘。地面为草甸禾草、林下针叶毡。草甸毛茛（黄，5、6、7 月）。
- 1650–2200 m，上缘疏林；落叶松秋黄冬裸。树形候选 欧洲落叶松（Larix decidua）、瑞士五针松（Pinus cembra）。灌层见高山杜鹃。地面为越橘地毯、草甸禾草。锈叶杜鹃（玫红，6、7、8 月）。
- 2200–3200 m，碎石坡仅在稳固土袋有花。地面为垫状草本、裸岩。高山龙胆（深蓝，6、7、8 月）。

林线 2200/2200/2200/2200 m；季节雪缘 900/1700/3000/2200 m。

**岩石与生灵。** 灰褐片麻岩见条带崖面；灰色碎岩见陡坡碎石扇。黄嘴山鸦在垭口乘风，岩鹨在石堆。旱獭草坡洞口警戒，岩羚在陡壁。昆虫窗口：熊蜂（6、7、8、9 月，白天，高山牧坡花丛）；粉蝶类（6、7、8 月，白天，避风向阳草甸）。

资料：[FAQ – Grossglockner High Alpine Road](https://www.grossglockner.at/en/for-your-visit/FAQ) · [FAQ – Grossglockner High Alpine Road](https://www.grossglockner.at/en/for-your-visit/FAQ) · [Microsoft Word - 2441_3647_3_R01_Rev1_Rapporto ambientale_EC](https://lombardia.stelviopark.it/wp-content/uploads/2019/05/PP_VAS_Rapporto-Ambientale.pdf) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=12.84&latitude=47.08&start=20010101&end=20201231&format=JSON)

### 挪威 Fv63 Geiranger–Ørnesvingen

挪威，Geiranger 码头–Ørnesvingen。选段海拔海面–约620米。从深色峡湾边村舍折返上崖，弯道外侧见瀑布与水面。小片草场只在可耕台地；此段不达高原永久无林带。

**天气与积雪。** 西风带来阵雨，背风洼地春夏仍有残雪。低岸冬雪时断时续，上段约11–4月。样点 62.12°, 7.16°，格点平均高度 825 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | -4.9 | -4.3 | -2.2 | 1.2 | 5.9 | 10 | 13.9 | 13.2 | 8.9 | 3.3 | -1.7 | -4.1 |
| 平均日低 °C | -9.7 | -10.2 | -9.1 | -4.8 | -0.5 | 3.8 | 7.1 | 6.8 | 3.3 | -1.8 | -6.2 | -8.8 |
| 月降水 mm | 231.6 | 186.1 | 184.5 | 133.6 | 129.8 | 145.1 | 165 | 185.5 | 223.5 | 189 | 221.5 | 253.3 |
| 格点雪盖 0–1 | 0.927 | 0.96 | 0.955 | 0.806 | 0.455 | 0.289 | 0.048 | 0.004 | 0.059 | 0.314 | 0.671 | 0.862 |

**西挪威峡湾雪路 · 车窗可见的植被带。**

- 0–450 m，码头与牧草地仅田界长树。树形候选 欧洲白桦（Betula pubescens）、欧洲赤松（Pinus sylvestris）。灌层见越橘。地面为草甸禾草、苔藓。柳兰（玫红，6、7、8 月）。
- 450–850 m，风口林线上下起伏。树形候选 山地桦（Betula pubescens subsp. czerepanovii）。灌层见矮柳。地面为越橘地毯、岩面地衣。石南（紫粉，7、8、9 月）。

林线 850/850/850/850 m；季节雪缘 200/500/1350/950 m。

**岩石与生灵。** 灰褐片麻岩见条带崖面；灰褐冰碛见混粒石垄。河乌在瀑布溪石，草地鹨在高地草坡。谷地有鹿；裸岩平台不设固定动物群。昆虫窗口：熊蜂（5、6、7、8 月，白天，低地野花与石南）；蚊（6、7、8 月，白天，背风湿洼）。

资料：[Ørnesvingen | Nasjonale turistveger](https://www.nasjonaleturistveger.no/no/turistvegene/geiranger-trollstigen/ornesvingen/) · [World Heritage Scanned Nomination](https://whc.unesco.org/uploads/nominations/1195.pdf) · [Elevational treeline and forest line dynamics in Norwegian mountain areas – a review](https://link.springer.com/article/10.1007/s10980-018-0670-8) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=7.16&latitude=62.12&start=20010101&end=20201231&format=JSON)

### 挪威 Aurlandsfjellet

挪威，Aurlandsvangen–Stegastein–高原–Lærdal。选段海拔海面–1306米。先俯看峡湾，再进入无树风蚀高地；溪流藏在融雪槽里。村居离开岸边后逐渐消失，路面仍可能夹在雪墙中。

**天气与积雪。** 西风带来阵雨，背风洼地春夏仍有残雪。高地约10–6月有雪，背风槽盛夏可有残雪。样点 60.93°, 7.27°，格点平均高度 1119 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | -6.6 | -5.8 | -3.3 | -0.6 | 2.5 | 8.8 | 13.1 | 12 | 7.6 | 1.7 | -3.3 | -5.7 |
| 平均日低 °C | -11.8 | -12.1 | -10.7 | -6.7 | -2.4 | 2.8 | 6.3 | 5.7 | 2.2 | -3.2 | -8.2 | -10.6 |
| 月降水 mm | 174 | 124.5 | 127.1 | 106.2 | 116.2 | 137.6 | 169 | 172.6 | 175.3 | 164.6 | 169 | 182.3 |
| 格点雪盖 0–1 | 1 | 1 | 1 | 0.997 | 0.784 | 0.23 | 0.011 | 0.002 | 0.054 | 0.424 | 0.885 | 0.996 |

**西挪威峡湾雪路 · 车窗可见的植被带。**

- 0–450 m，码头与牧草地仅田界长树。树形候选 欧洲白桦（Betula pubescens）、欧洲赤松（Pinus sylvestris）。灌层见越橘。地面为草甸禾草、苔藓。柳兰（玫红，6、7、8 月）。
- 450–850 m，风口林线上下起伏。树形候选 山地桦（Betula pubescens subsp. czerepanovii）。灌层见矮柳。地面为越橘地毯、岩面地衣。石南（紫粉，7、8、9 月）。
- 850–1400 m，浅槽积雪，凸脊露岩。灌层见矮柳。地面为莎草、岩面地衣。虎耳草类（白，6、7、8 月）。

林线 850/850/850/850 m；季节雪缘 200/500/1350/950 m。

**岩石与生灵。** 灰褐片麻岩见条带崖面；灰褐冰碛见混粒石垄。河乌在瀑布溪石，草地鹨在高地草坡。谷地有鹿；裸岩平台不设固定动物群。昆虫窗口：熊蜂（5、6、7、8 月，白天，低地野花与石南）；蚊（6、7、8 月，白天，背风湿洼）。

资料：[Aurlandsfjellet | Nasjonale turistveger](https://www.nasjonaleturistveger.no/en/routes/aurlandsfjellet/) · [Elevational treeline and forest line dynamics in Norwegian mountain areas – a review](https://link.springer.com/article/10.1007/s10980-018-0670-8) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=7.27&latitude=60.93&start=20010101&end=20201231&format=JSON)

### 意大利 SS163 阿马尔菲海岸

意大利坎帕尼亚，Positano–Amalfi。选段海拔近海面–约220米。海侧是直落的岩崖，山侧是柠檬梯园、棚架和石墙；阴沟下切到海边小镇。绕过岬角时下一个聚落才出现。

**天气与积雪。** 夏干冬雨，挡墙沟渠承接阵雨。海滨无持续雪季。样点 40.64°, 14.6°，格点平均高度 28 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 13.2 | 12.9 | 14.2 | 16.3 | 19.7 | 23.6 | 26.3 | 26.8 | 24.4 | 21.4 | 18.2 | 14.9 |
| 平均日低 °C | 11.1 | 10.7 | 11.9 | 14.1 | 17.5 | 21.5 | 24.3 | 24.8 | 22.3 | 19.3 | 16 | 12.7 |
| 月降水 mm | 101.7 | 81.5 | 74.5 | 56.6 | 40.7 | 30.1 | 20.9 | 24.4 | 76.8 | 87.8 | 130.4 | 100.6 |
| 格点雪盖 0–1 | 0.001 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

**地中海柠檬梯园 · 车窗可见的植被带。**

- 0–450 m，橄榄只在田园与弃耕地；种植柠檬另建模型。树形候选 地中海冬青栎（Quercus ilex）、油橄榄（Olea europaea）。灌层见桃金娘、岩蔷薇。地面为硬叶灌丛落叶、裸岩。岩蔷薇（粉/白，3、4、5、6 月）。

林线 —/—/—/— m；季节雪缘 —/—/—/— m。当地需补的树形有柠檬 Citrus × limon。

**岩石与生灵。** 乳灰石灰岩见层裂海崖；灰白崩积石见坡脚棱石。雨燕在村舍屋檐上空，蓝矶鸫在崖壁。陆生大型兽目击少，村缘可见家畜。昆虫窗口：蝉（6、7、8、9 月，白天，暖坡树冠）；野蜂（3、4、5、6、7、8 月，白天，果园花与岩蔷薇）。

资料：[Costiera Amalfitana - UNESCO World Heritage Centre](https://whc.unesco.org/en/list/830/) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=14.6&latitude=40.64&start=20010101&end=20201231&format=JSON)

### 冰岛一号公路 Eldhraun 熔岩原

冰岛南部，Kirkjubæjarklaustur 西侧低地，选景约30–100 m。1783–84 年拉基裂隙喷发的玄武质熔岩流在这里凝固。大片起伏的黑灰表面覆盖灰绿绒毛苔（Racomitrium lanuginosum），雨后颜色加深，凸起仍可见熔岩棱。旁侧老农田与季流水沟留在土层较厚的低地。邻近 Landbrotshólar 的无根锥属于另一处熔岩历史，不能把所有小丘都画成 1783 年的喷口。[Katla 地质公园地质图](https://www.south.is/static/files/Kortogfl/2023-25/katla-geopark_2025-597x480mm_web.pdf) · [Landbrotshólar](https://www.katlageopark.is/jardvaetti/jardfraedi/landbrotsholar/)

熔岩段无连续树冠；黑色岩缝到淡绿苔垫构成主要分带，农田侧才出现连续禾草。湿沟春夏可观察昆虫，苔原花地可有蛾类访花；本路段优势野花、花色与逐月昆虫名录待核，保留为空。区域草地可参考金斑鸻，大型动物取牧地绵羊，避免在苔垫上生成兽群。低地无适用林线和常年雪线，约11–4月阵雪与融雪交替。样点 63.73°, −18.24°，格点平均高度 121 m。[国家公园区域生态资料](https://www.vatnajokulsthjodgardur.is/en/nature--history/biome) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-18.24&latitude=63.73&start=20010101&end=20201231&format=JSON)

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 3.2 | 3.3 | 3.5 | 5 | 7.3 | 10.1 | 11.8 | 11.7 | 9.6 | 6.5 | 4.4 | 3.4 |
| 平均日低 °C | 0.1 | 0 | 0.3 | 2 | 4.2 | 7.1 | 8.9 | 8.8 | 6.8 | 3.9 | 1.6 | 0.2 |
| 月降水 mm | 221.4 | 205.3 | 193.4 | 154.2 | 108.9 | 106.4 | 129.9 | 150.8 | 202.2 | 214.7 | 197.1 | 222.3 |
| 格点雪盖 0–1 | 0.335 | 0.358 | 0.324 | 0.176 | 0.022 | 0 | 0 | 0 | 0.003 | 0.044 | 0.161 | 0.297 |

## 亚洲

### 中国云南元阳多依树梯田公路

中国云南，元阳新街–多依树观景区。选段海拔约1450–1950米。村寨位于山头水源林与坡面田之间；沟渠将水沿等高线送到稻田。放水时田面连成镜面，播种后则变绿。鸭、鱼、鳝属于耕作水系。

**天气与积雪。** 冬春云海与蓄水反光，雨季水渠溢流。样段一般无持续雪季，冷空气可带霜。样点 23.09°, 102.8°，格点平均高度 1379 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 17.9 | 21.1 | 24.8 | 27.5 | 28.5 | 27.8 | 26.9 | 26.9 | 26 | 23.7 | 20.9 | 17.8 |
| 平均日低 °C | 6.9 | 8.8 | 12 | 15.3 | 17.4 | 18.9 | 18.8 | 18.4 | 17 | 14.4 | 10.5 | 7.2 |
| 月降水 mm | 37.3 | 17.7 | 34.2 | 74.6 | 144.4 | 196.5 | 266.3 | 254.6 | 142.5 | 99.5 | 45.5 | 24.5 |
| 格点雪盖 0–1 | 0.001 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

**哀牢山灌溉梯田 · 车窗可见的植被带。**

- 800–1650 m，人工灌水田面无树；花期随海拔与品种。地面为水稻、田埂莎草。稻花（乳白，7、8、9 月）。
- 1650–2100 m，山头涵养林；上部也有村田，须有土地利用掩膜。树形候选 常绿栎类（Quercus spp.）。灌层见林缘灌丛。地面为地蕨、林下落叶。花种与花期待核。

林线 —/—/—/— m；季节雪缘 —/—/—/— m。

**岩石与生灵。** 灰褐风化岩见田埂碎块；赭色坡积土见夯实梯坎。白鹭在浅水稻田，燕类在村舍田上。水牛活动限耕作区，鸭群游田。昆虫窗口：蜻蜓（5、6、7、8、9、10 月，白天，缓流水渠）；粉蝶类（3、4、5、6、7、8、9、10 月，白天，未喷药田界）。

资料：[Cultural Landscape of Honghe Hani Rice Terraces - UNESCO World Heritage Centre](https://whc.unesco.org/en/list/1111/) · [FBC-08020-CUIBaoshan 351..359](https://jf2.hep.com.cn/a62e4b6841424df8a54ab4e4333b334b.pdf?response-content-disposition=attachment%3B+filename%3D%22Vertical+characteristics+of+the+Hani+terrace%0Apaddyfield+ecosystem+in+Yunnan%2C+China.pdf%22) · [Analysis of the landscape pattern and aesthetic characteristics of the Hani terraced fields](https://www.dlyj.ac.cn/EN/10.11821/yj2006040008) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=102.8&latitude=23.09&start=20010101&end=20201231&format=JSON)

### 菲律宾 Banaue–Bontoc 山路巴纳韦段

菲律宾吕宋，Banaue 镇–山腰观景段。选段海拔约1100–1600米。梯田侧壁随山谷转折，山顶 muyong 林蓄水，灌渠串联田面与村舍。本段观察的是巴纳韦地区，世界遗产另有明确分区。

Poitan 村林分研究记录了 Pinus kesiya、外来大叶桃花心木 Swietenia macrophylla 等不同群落；该调查仅覆盖当地样地，原型不把引入树扩散到整个群岛。

**天气与积雪。** 湿季低云压山，灌溉水源在田顶林地。无固定雪季。样点 16.94°, 121.06°，格点平均高度 693 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 24 | 25.7 | 28.4 | 31.3 | 30.7 | 29.1 | 28 | 27.8 | 27.6 | 26.7 | 25.6 | 24.3 |
| 平均日低 °C | 16.4 | 16.7 | 17.9 | 19.8 | 21.3 | 21.3 | 21 | 21.1 | 20.7 | 19.6 | 19.2 | 17.8 |
| 月降水 mm | 76 | 68.2 | 76.6 | 78.5 | 227.7 | 283.9 | 385.2 | 424.6 | 322.1 | 316.9 | 285.5 | 264.1 |
| 格点雪盖 0–1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

**吕宋山地水田 · 车窗可见的植被带。**

- 850–1600 m，一期稻物候由地方品种决定；耕田禁树。地面为水稻、田埂莎草。稻花（乳白，4、5、6、7 月）。
- 1600–2000 m，muyong 林地；保留天然林与人工次生林差别；Poitan 调查见本地及引入树种混生，沿线优势种待核。树形候选 本地混交阔叶林（多种属）。灌层见林缘灌丛。地面为地蕨、林下落叶。花种与花期待核。

林线 —/—/—/— m；季节雪缘 —/—/—/— m。

**岩石与生灵。** 灰褐风化岩见田埂碎块；赭色坡积土见夯实梯坎。秧鸡在田边密草，白鹭在浅水稻田。水牛限村田；林中大型兽资料不足。昆虫窗口：蜻蜓（1、2、3、4、5、6、7、8、9、10、11、12 月，白天，有水田面）；粉蝶类（1、2、3、4、5、6、7、8、9、10、11、12 月，白天，有花的田坎）。
资料：[Rice Terraces of the Philippine Cordilleras - UNESCO World Heritage Centre](https://whc.unesco.org/en/list/722/) · [Threat of Potential Bioinvasion in a Natural Forest in Poitan, Banaue, Ifugao, Cordillera Administrative Region | Philippine Journal of Science](https://philjournalsci.dost.gov.ph/threat-of-potential-bioinvasion-in-a-natural-forest-in-poitan-banaue-ifugao-cordillera-administrative-region/) · [Buff-banded Rail (Gallirallus philippensis) – Rice Today](https://ricetoday.irri.org/buff-banded-rail-gallirallus-philippensis/) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=121.06&latitude=16.94&start=20010101&end=20201231&format=JSON)

### 中国广西阳朔十里画廊

中国广西，阳朔–高田。选段海拔约100–160米。车在遇龙河及支流的低平农地间移动；塔状峰林始终高出路面。竹带贴水、田与村屋占平地，峰顶植被离路很远。

桂林岩溶石山样地的草本包括 Carex tristachya 与 Ophiopogon japonicus，可取深绿窄叶束为近景；峰顶不可复制河漫滩的竹与稻。

**天气与积雪。** 梅雨期涨水，雾沿低地留出几层峰影。河谷一般无持续雪季。样点 24.73°, 110.49°，格点平均高度 358 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 14.5 | 17.9 | 21.5 | 25.5 | 28.1 | 29.3 | 30.2 | 30.2 | 28.8 | 25.5 | 21.1 | 15.7 |
| 平均日低 °C | 3.5 | 6.6 | 10.8 | 15.5 | 19.5 | 22.5 | 23.4 | 23.1 | 20.4 | 15.4 | 10.1 | 4.3 |
| 月降水 mm | 71.2 | 63.8 | 135 | 177.9 | 290.8 | 359.3 | 207.3 | 169.9 | 98.9 | 56.4 | 81.1 | 50.7 |
| 格点雪盖 0–1 | 0.015 | 0.01 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.004 |

**桂北峰林河谷 · 车窗可见的植被带。**

- 80–180 m，人工田、竹带与河滩分开；油菜仅轮作田。树形候选 江边竹类（Bambusa spp.）。灌层见河岸灌丛。地面为水稻、田埂莎草。油菜（黄，2、3 月）。
- 180–550 m，根系沿石灰岩缝，直壁留白。树形候选 常绿栎类（Quercus spp.）。灌层见石山灌丛。地面为地蕨、裸岩。花种与花期待核。

林线 —/—/—/— m；季节雪缘 —/—/—/— m。

**岩石与生灵。** 青灰石灰岩见竖沟孤峰；灰褐冲积砾见河滩圆石。白鹭在浅水岸边，翠鸟在溪岸低枝。村旁水牛，岩峰大型兽资料不足。昆虫窗口：蜻蜓（4、5、6、7、8、9、10 月，白天，江岸静水湾）；蝉（6、7、8、9 月，白天，村边树冠）。

资料：[South China Karst - UNESCO World Heritage Centre](https://whc.unesco.org/en/list/1248/) · [Acta Bot. Boreal.-Occident. Sin.](https://ir.xtbg.ac.cn/bitstream/353005/9640/1/%E6%A1%82%E6%9E%97%E5%B2%A9%E6%BA%B6%E7%9F%B3%E5%B1%B1_%E9%A3%8E%E6%B0%B4%E6%9E%97_%E6%A4%8D%E7%89%A9%E7%BE%A4%E8%90%BD%E6%95%B0%E9%87%8F%E5%88%86%E7%B1%BB%E4%B8%8E%E6%8E%92%E5%BA%8F_%E9%BB%84%E5%85%B6%E6%88%90.pdf) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=110.49&latitude=24.73&start=20010101&end=20201231&format=JSON)

## 非洲

### 南非克鲁格 H4-1 萨比河道

南非，Skukuza–Lower Sabie。选段海拔约150–300米。在萨比河宽阔河阶上开车；较高的河岸无花果树与外侧干燥刺灌分界清楚。营地、桥与水边观察点集中，草原上不铺设农田。

Lower Sabie 一端有玄武岩土上的瘤刺金合欢与马鲁拉稀树草原，营地河岸可见 Ficus sycomorus。两者相距很近，树冠尺度不同。

**天气与积雪。** 南半球夏雨发草，旱季动物靠近河道。无固定雪季。样点 -24.99°, 31.8°，格点平均高度 256 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 33.4 | 33.4 | 32.5 | 30.2 | 29 | 26.8 | 26.6 | 29.1 | 31.6 | 32.8 | 33.3 | 33.8 |
| 平均日低 °C | 20.9 | 21 | 20.1 | 17.8 | 15.2 | 12.8 | 12.3 | 14 | 16.1 | 17.8 | 19.2 | 20.5 |
| 月降水 mm | 122.5 | 84.7 | 84 | 48.3 | 12.7 | 7.8 | 8.1 | 8.3 | 18.1 | 45.8 | 84 | 110.7 |
| 格点雪盖 0–1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

**南非低地稀树草原 · 车窗可见的植被带。**

- 150–550 m，玄武岩台地可见瘤刺金合欢与马鲁拉树；成荫的河岸无花果单列资产。树形候选 瘤刺金合欢（Senegalia nigrescens）。灌层见刺灌丛。地面为高秆草、裸土。地被芦荟类（橙红，5、6、7、8 月）。

林线 —/—/—/— m；季节雪缘 —/—/—/— m。当地需补的树形有河岸无花果 Ficus sycomorus、马鲁拉树 Sclerocarya birrea。

**岩石与生灵。** 浅灰花岗岩见西段圆蚀巨石；暗灰玄武岩见东段低坡碎块；灰褐冲积砾见河滩圆石。非洲渔雕在沿河高枝，织布鸟在营地河岸树。象、黑斑羚；河马限永久水面。昆虫窗口：蜣螂（1、2、3、11、12 月，白天，降雨后动物粪旁）；蜻蜓（1、2、3、4、10、11、12 月，白天，萨比河边静水）。

资料：[Birds – Kruger National Park – SANParks](https://www.sanparks.org/parks/kruger/explore/fauna-flora/birds) · [Lower Sabie Rest Camp – Kruger National Park – SANParks](https://www.sanparks.org/parks/kruger/camps/main-rest-camps/lower-sabie) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=31.8&latitude=-24.99&start=20010101&end=20201231&format=JSON)

### 南非 Chapman's Peak Drive

南非开普半岛，Hout Bay–Noordhoek。选段海拔海面–约160米。浅灰花岗岩之上压着石英砂岩；盘山路恰好让两层在近景出现。硬叶灌丛延到防落石棚边，远处港湾和大西洋接入视野。

**天气与积雪。** 西南冬雨，夏季风侵，盐雾压低枝梢。海崖无持续雪季。样点 -34.08°, 18.37°，格点平均高度 19 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 21.8 | 22.1 | 21.1 | 19.6 | 18.1 | 16.5 | 15.9 | 15.7 | 16.5 | 17.9 | 19.2 | 20.8 |
| 平均日低 °C | 18.5 | 18.7 | 17.8 | 16.2 | 15.2 | 13.8 | 13.1 | 13 | 13.6 | 14.7 | 15.8 | 17.5 |
| 月降水 mm | 13.6 | 9.3 | 17 | 37.3 | 50.9 | 90.8 | 81.1 | 76.4 | 39.9 | 30.9 | 29.7 | 11.7 |
| 格点雪盖 0–1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

**开普硬叶灌丛海崖 · 车窗可见的植被带。**

- 0–650 m，保留低灌连片，花窗仅冬花型样板。灌层见山龙眼、帚状欧石南。地面为灯芯草状帚草、裸岩。糖山龙眼（乳白/粉，5、6、7、8、9 月）。

林线 —/—/—/— m；季节雪缘 —/—/—/— m。

**岩石与生灵。** 灰黄石英砂岩见垂直层崖；浅灰花岗岩见圆蚀巨石。开普糖鸟在山龙眼花冠，太阳鸟在细枝花丛。岩蹄兔有条件出现在崖隙。昆虫窗口：野蜂（7、8、9、10、11 月，白天，硬叶灌丛花头）；粉蝶类（8、9、10、11、12 月，白天，晴暖背风坡）。

资料：[Chapman’s Peak – Table Mountain National Park – SANParks](https://www.sanparks.org/parks/table-mountain/explore/heritage/chapmans-peak) · [Protea repens | PlantZAfrica](https://pza.sanbi.org/protea-repens) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=18.37&latitude=-34.08&start=20010101&end=20201231&format=JSON)

## 大洋洲

### 澳大利亚 Great Ocean Road 坎贝尔港段

澳大利亚维多利亚，Princetown–Port Campbell。选段海拔约0–120米。海柱和拱门从浪中分离，崖顶矮灌与公路内陆侧牧场相接；潮汐与风浪决定能看见多少柱脚。公路本身并非全程直贴海柱。

**天气与积雪。** 海风常年，风暴浪咬蚀崖足。海岸无持续雪季。样点 -38.62°, 143°，格点平均高度 97 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 23.8 | 23.5 | 22.1 | 19 | 15.6 | 13.1 | 12.4 | 12.9 | 14.7 | 17.1 | 19.8 | 21.6 |
| 平均日低 °C | 13.5 | 14 | 13.3 | 11.5 | 10 | 8.3 | 7.7 | 7.7 | 8.4 | 9.3 | 10.8 | 12 |
| 月降水 mm | 42.5 | 40.5 | 47.6 | 58.5 | 72.4 | 84.1 | 92.4 | 97.7 | 79.2 | 65.8 | 63.3 | 55.9 |
| 格点雪盖 0–1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

**维州石灰岩海蚀岸 · 车窗可见的植被带。**

- 0–180 m，崖口风切低矮，海柱无树林。灌层见滨海茶树灌木、盐生矮灌。地面为滨海丛草、裸岩。滨海雏菊类（白，1、2、3、10、11、12 月）。

林线 —/—/—/— m；季节雪缘 —/—/—/— m。

**岩石与生灵。** 蜜黄石灰岩见海柱与拱；灰黄海砂见湾底沙坪。短尾鹱在近海归巢，银鸥在岸边。草地袋鼠低频；鲸远海偶见。昆虫窗口：野蜂（1、2、3、9、10、11、12 月，白天，沿海灌丛花）；粉蝶类（1、2、3、10、11、12 月，白天，内陆草坡）。
资料：[Port Campbell National Park and Bay of Islands Coastal Park](https://www.parks.vic.gov.au/-/media/project/pv/main/parks/documents/visitor-guides-and-publications/port-campbell-national-park/port-campbell-national-park-and-bay-of-islands-coastal-park-visitor-guide.pdf?rev=628d1bb9c3644837b19a52571bb97c63) · [Port Campbell National Park](https://www.parks.vic.gov.au/-/media/project/pv/main/parks/documents/visitor-guides-and-publications/port-campbell-national-park/port-campbell-national-park-and-bay-of-islands-coastal-park-visitor-guide.pdf) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=143&latitude=-38.62&start=20010101&end=20201231&format=JSON)

### 澳大利亚奥特韦 Turtons Track

澳大利亚维多利亚，Beech Forest–Tanybryn 一带。选段海拔约300–600米。窄路穿过湿林，树蕨巨羽在较低层盖住沟溪；保护良好的背阴沟更易见南方山毛榉。山脊上湿桉林打开，边缘有林业道路。

**天气与积雪。** 冬季林雨，背阴沟蕨类常湿。冈顶偶有冬雪，林沟无稳定雪季。样点 -38.62°, 143.58°，格点平均高度 121 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 23.6 | 23.1 | 21.8 | 18.7 | 15.4 | 13 | 12.2 | 12.8 | 14.7 | 16.9 | 19.5 | 21.5 |
| 平均日低 °C | 14 | 14.5 | 13.7 | 11.9 | 10 | 8.3 | 7.6 | 7.5 | 8.3 | 9.3 | 11 | 12.3 |
| 月降水 mm | 43.9 | 44 | 45.4 | 59.7 | 65 | 76.1 | 79.9 | 85.8 | 71.6 | 62.9 | 64.1 | 50.6 |
| 格点雪盖 0–1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

**奥特韦湿沟桉林 · 车窗可见的植被带。**

- 100–650 m，桉树限湿林天窗，闭合雨林沟以南方山毛榉和树蕨为主（Nothofagus cunninghamii）。树形候选 山灰桉（Eucalyptus regnans）、软树蕨（Dicksonia antarctica）。灌层见湿林灌木。地面为地蕨、苔藓。山铁线莲（乳白，8、9、10、11 月）。

林线 —/—/—/— m；季节雪缘 —/—/—/— m。当地需补的树形有南方山毛榉 Nothofagaceae、黑木相思 Acacia melanoxylon。

**岩石与生灵。** 灰褐砂岩见河谷露头；灰色泥岩见沟侧薄层。深红玫瑰鹦鹉在树冠，黄色知更鸲类在林下低枝。小袋鼠在灌丛，林荫降低能见度。昆虫窗口：蝉（1、2、3、11、12 月，白天，暖日桉树冠）；野蜂（1、2、3、9、10、11、12 月，白天，湿林边缘花丛）。

资料：[Wet Forest and Rainforest](https://www.parks.vic.gov.au/-/media/project/pv/main/parks/documents/get-into-nature/conservation-and-science/caps/great-otways-conservation-action-plan-cap.pdf?hash=4B01E6F94DDAFE1D72BBA0BEF8CC31A34DBF00B5&la=en) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=143.58&latitude=-38.62&start=20010101&end=20201231&format=JSON)

### 新西兰 SH94 Milford Road

新西兰南岛，Te Anau–Homer Tunnel–Piopiotahi。选段海拔海面–约945（隧道东口）米。Eglinton 谷地的红山毛榉林与开阔草湿地交替；过 Lake Gunn 银山毛榉矮化，雪崩槽中见先锋灌木。隧道后急转下坡，峡湾西侧多瀑布。

红山毛榉 Fuscospora fusca 形成谷底高冠，银山毛榉 Lophozonia menziesii 在严酷地段缩矮；银山毛榉与欧洲水青冈的干形、分枝和叶片不同。

**天气与积雪。** 西侧多雨瀑布多，东侧雨影见草地。山口约6–10月，海边少积；峡湾与山口须分开。样点 -44.91°, 168.08°，格点平均高度 891 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 15.1 | 15.2 | 13.6 | 10.4 | 7 | 4.2 | 3.6 | 5.3 | 7.2 | 9.1 | 11.5 | 13.9 |
| 平均日低 °C | 5.8 | 5.9 | 4.8 | 2.9 | 1.2 | -0.9 | -1.5 | -0.8 | 0.1 | 0.9 | 2.6 | 4.7 |
| 月降水 mm | 159.8 | 133.1 | 133.2 | 133.1 | 155.6 | 133 | 132.3 | 120.3 | 147.8 | 158.7 | 141.4 | 159.2 |
| 格点雪盖 0–1 | 0 | 0 | 0.001 | 0.005 | 0.034 | 0.1 | 0.11 | 0.061 | 0.033 | 0.011 | 0.006 | 0.001 |

**南岛山毛榉冰川谷 · 车窗可见的植被带。**

- 0–700 m，湿侧林下树蕨；冠层南方山毛榉需独立模型；红山毛榉 Fuscospora fusca、银山毛榉 Lophozonia menziesii。树形候选 树蕨类（Cyathea smithii）。灌层见倒挂金钟类。地面为地蕨、苔藓。本地倒挂金钟（绿紫，8、9、10、11、12 月）。
- 700–1000 m，山林上缘银山毛榉矮化；雪崩槽可低于林线。灌层见矮生灌木。地面为苔藓、丛生雪草。花种与花期待核。
- 1000–1600 m，隧道口夏季融雪后见大白花。灌层见矮生灌木。地面为丛生雪草、裸岩。库克山毛茛（白，1、11、12 月）。

林线 1000/1000/1000/1000 m；季节雪缘 1600/1150/650/850 m。当地需补的树形有南方山毛榉 Nothofagaceae、泪柏 Dacrydium cupressinum。

**岩石与生灵。** 灰色深成岩见冰蚀峭壁；灰褐冰碛见混粒石垄。啄羊鹦鹉在隧道口岩石，新西兰扇尾鹟在溪谷林缘。峡湾海豹限水边，山口无大型原生陆兽。昆虫窗口：沙蝇（1、2、3、4、10、11、12 月，白天，流动淡水附近背风处）；蛾类（1、2、3、11、12 月，夜间，温暖林缘）。

资料：[Nature and conservation](https://www.doc.govt.nz/parks-and-recreation/places-to-go/fiordland/places/fiordland-national-park/places-to-go/milford-road-milford-sound-area/nature-and-history/) · [Potential conservation](https://www.doc.govt.nz/documents/science-and-technical/drds248.pdf) · [Routeburn Track](https://www.doc.govt.nz/routeburntrack?parkId=e4e9e470-d0ba-47ab-91e2-18f1e9d69398&region=Fiordland) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=168.08&latitude=-44.91&start=20010101&end=20201231&format=JSON)

### 澳大利亚 Cape Tribulation Road

澳大利亚昆士兰，Daintree 渡口–Cape Tribulation。选段海拔海面–约240米。淡水沼林、扇棕、潮沟红树林相距很短；沿海低脊转过可见珊瑚海。渡口、散居点与步道穿林，不把椰子园铺满原生雨林。

**天气与积雪。** 南半球湿季暴雨，低地溪流迅速涨水。无雪季。样点 -16.17°, 145.42°，格点平均高度 44 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 28.6 | 28.8 | 28.1 | 27 | 25.6 | 24.5 | 23.8 | 24.1 | 25 | 26.1 | 27.3 | 28.5 |
| 平均日低 °C | 26.9 | 27 | 26.6 | 25.5 | 24.1 | 22.8 | 22.1 | 22.2 | 23 | 24.1 | 25.3 | 26.5 |
| 月降水 mm | 366.6 | 378.2 | 429 | 186 | 77.5 | 53.5 | 36.9 | 25.2 | 26.8 | 50.1 | 69.5 | 183.9 |
| 格点雪盖 0–1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

**昆士兰低地热带雨林 · 车窗可见的植被带。**

- 0–250 m，低地淡水沼林与高燥雨林区别；潮沟红树林单列。树形候选 澳洲扇棕（Licuala ramsayi）、板根阔叶树（多种属）。灌层见林缘灌丛。地面为地蕨、林下落叶。花种与花期待核。

林线 —/—/—/— m；季节雪缘 —/—/—/— m。当地需补的树形有潮间带红树 Rhizophora spp.。

**岩石与生灵。** 灰褐变质岩见片状崩壁；灰褐冲积砾见河滩圆石。南方鹤鸵在有落果的密林，果鸠在上层树冠。鹤鸵偶见；鳄限潮汐水域。昆虫窗口：凤蝶类（1、2、3、4、5、6、7、8、9、10、11、12 月，白天，雨林天窗）；蝉（1、2、3、4、11、12 月，白天，低地湿林）。

资料：[Daintree National Park (CYPAL) | Parks and forests | Department of the Environment, Tourism, Science and Innovation](https://parks.qld.gov.au/parks/daintree) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=145.42&latitude=-16.17&start=20010101&end=20201231&format=JSON)

## 南美洲

### 阿根廷 RP23 查尔滕入口

阿根廷圣克鲁斯，RP23 东段–El Chaltén。选段海拔约200–500米。沿 Lago Viedma 北侧向西，干草坡与灰白融水交替，Fitz Roy 锯齿状峰群逐渐抬高。到镇边才出现较连贯林地，路东牧栏随风起伏。

**天气与积雪。** 西风强，湖东干燥，冬季霜雪。约5–9月间歇，雪峰与草原路面分开。样点 -49.35°, -72.7°，格点平均高度 699 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 13.3 | 13.7 | 11.3 | 8.2 | 4.2 | 0.7 | 0.2 | 2.1 | 5.7 | 8.3 | 10.3 | 12.3 |
| 平均日低 °C | 4.2 | 4.2 | 3 | 0.8 | -2 | -5.3 | -6.3 | -4.5 | -1.6 | 0.1 | 1.7 | 3.3 |
| 月降水 mm | 29.1 | 27.2 | 33.8 | 36.2 | 46.5 | 41.6 | 35.3 | 36.2 | 23.7 | 29.1 | 29.7 | 32.9 |
| 格点雪盖 0–1 | 0.002 | 0.002 | 0.004 | 0.02 | 0.122 | 0.398 | 0.509 | 0.346 | 0.084 | 0.013 | 0.007 | 0.003 |

**安第斯雨影丛草原 · 车窗可见的植被带。**
- 150–900 m，风影侧小灌木，远离河道无树。灌层见刺小檗类、贴地小灌木。地面为丛生旱草、裸砾。巴塔哥尼亚小檗（黄，10、11、12 月）。

林线 —/—/—/— m；季节雪缘 —/—/—/— m。

**岩石与生灵。** 灰褐冰碛见混粒石垄；灰褐冲积砾见河滩圆石。小美洲鸵在开阔草坡，南方凤头卡拉鹰在栅柱。原驼小群；牧场绵羊限围栏。昆虫窗口：野蜂（1、2、11、12 月，白天，风影内矮灌花）；粉蝶类（1、2、3、11、12 月，白天，有草花的河阶）。

资料：[Horarios / Cómo llegar | Argentina.gob.ar](https://www.argentina.gob.ar/parquesnacionales/patagonia-austral/parque-nacional-los-glaciares/horarios-como-llegar-0) · [Biodiversidad | Argentina.gob.ar](https://www.argentina.gob.ar/parquesnacionales/patagonia-austral/parque-nacional-los-glaciares/biodiversidad) · [Ficha del área protegida | Argentina.gob.ar](https://www.argentina.gob.ar/node/283790) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-72.7&latitude=-49.35&start=20010101&end=20201231&format=JSON)

### 阿根廷 RN40 拉莱奥纳段

阿根廷圣克鲁斯，RN40 的 La Leona 河谷。选段海拔约180–450米。蓝绿色融水河带将黄褐色硬丛草地割开。沿河有旧旅站与牧场，低草和稀疏栅柱显出侧风；无连续乔木带。

**天气与积雪。** 西风强，湖东干燥，冬季霜雪。约5–9月霜雪，裸砾风口留雪短。样点 -49.79°, -72.04°，格点平均高度 544 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 15.2 | 15.4 | 12.9 | 9.3 | 4.8 | 0.7 | 0.2 | 2.8 | 7.1 | 10 | 12.1 | 14.1 |
| 平均日低 °C | 4.7 | 4.6 | 3.2 | 0.9 | -1.8 | -5.1 | -6.4 | -4.1 | -1.3 | 0.1 | 2.1 | 3.8 |
| 月降水 mm | 39.8 | 36.9 | 44.1 | 42.8 | 49 | 42 | 38.9 | 38.7 | 29.7 | 31 | 33.1 | 41.3 |
| 格点雪盖 0–1 | 0 | 0 | 0.002 | 0.006 | 0.085 | 0.376 | 0.566 | 0.299 | 0.025 | 0.005 | 0.001 | 0 |

**安第斯雨影丛草原 · 车窗可见的植被带。**

- 150–900 m，风影侧小灌木，远离河道无树。灌层见刺小檗类、贴地小灌木。地面为丛生旱草、裸砾。巴塔哥尼亚小檗（黄，10、11、12 月）。

林线 —/—/—/— m；季节雪缘 —/—/—/— m。

**岩石与生灵。** 灰褐冰碛见混粒石垄；灰褐冲积砾见河滩圆石。小美洲鸵在开阔草坡，南方凤头卡拉鹰在栅柱。原驼小群；牧场绵羊限围栏。昆虫窗口：野蜂（1、2、11、12 月，白天，风影内矮灌花）；粉蝶类（1、2、3、11、12 月，白天，有草花的河阶）。

资料：[Ficha del área protegida | Argentina.gob.ar](https://www.argentina.gob.ar/parquesnacionales/patagonia-austral/parque-nacional-monte-leon/ficha-del-area-protegida) · [Tres Lagos](https://turismo.santacruz.gob.ar/donde-ir/tres-lagos) · [Ficha del área protegida | Argentina.gob.ar](https://www.argentina.gob.ar/node/283790) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-72.04&latitude=-49.79&start=20010101&end=20201231&format=JSON)

### 智利 Carretera Austral 凯乌拉特段

智利艾森，Ruta 7 的 Queulat 公园段。选段海拔近海面–约500米。路线由峡湾边向湿林肩部爬升；悬冰川与冰瀑在侧谷，须到观景点才展开。南方山毛榉、树下苔蕨、入湖的冰川溪同框；谷口零散聚落。

CONAF 将 lenga（Nothofagus pumilio）与 coigüe de Magallanes（N. betuloides）列于安第斯巴塔哥尼亚森林，将 N. nitida、Laureliopsis philippiana、Drimys winteri 列于常绿林。

**天气与积雪。** 安第斯迎风坡多雨，悬冰川下汇成湖泊。高处约5–10月，潮湿谷底冬季多雨夹雪。样点 -44.47°, -72.54°，格点平均高度 677 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | 14.3 | 15.4 | 12.8 | 9.7 | 7 | 4 | 3.5 | 4.7 | 7.1 | 9.1 | 11.1 | 13 |
| 平均日低 °C | 6 | 6.3 | 5 | 3.1 | 1.6 | -0.3 | -1 | -0.3 | 0.7 | 1.8 | 3.1 | 5 |
| 月降水 mm | 94.6 | 78.8 | 106.6 | 115.5 | 153.6 | 173.7 | 133.4 | 135.8 | 85.6 | 125 | 125.5 | 105 |
| 格点雪盖 0–1 | 0 | 0 | 0.001 | 0.005 | 0.042 | 0.128 | 0.173 | 0.092 | 0.025 | 0.011 | 0.005 | 0.001 |

**巴塔哥尼亚温带雨林 · 车窗可见的植被带。**

- 0–700 m，常绿南方山毛榉林；需要本土冠层模型；常绿 Nothofagus betuloides、N. nitida。地面为地蕨、苔藓。智利火树（猩红，1、10、11、12 月）。
- 700–1100 m，高处落叶南方山毛榉，湿地开窗；Nothofagus pumilio。灌层见刺小檗类。地面为林下落叶、苔藓。花种与花期待核。
- 1100–1900 m，冰川磨光岩壁，雪崩廊道下限另算。地面为裸岩、垫状草本。花种与花期待核。

林线 1100/1100/1100/1100 m；季节雪缘 1600/1100/550/900 m。当地需补的树形有南方山毛榉 Nothofagaceae、智利火树 Embothrium coccineum。

**岩石与生灵。** 灰色深成岩见冰蚀峭壁；灰褐冰碛见混粒石垄。麦哲伦啄木鸟在老林枯干，查考窜鸟在浓密林下。普度鹿隐蔽，避免稳定刷出。昆虫窗口：熊蜂（1、2、3、11、12 月，白天，林缘花木）；蛾类（1、2、3、11、12 月，夜间，湿润林窗）。

资料：[Parque Nacional Queulat - CONAF](https://www.conaf.cl/parque_nacionales/parque-nacional-queulat/) · [Ficha del área protegida | Argentina.gob.ar](https://www.argentina.gob.ar/node/283790) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=-72.54&latitude=-44.47&start=20010101&end=20201231&format=JSON)

## 南极洲

### 南极洲 Ross Island 麦克默多–斯科特基地后勤路

南极洲罗斯岛，Hut Point Peninsula 两基地间作业路。基地近海面，翻越低鞍部；路面最高值待核。仅为科研后勤车辆参照。黑褐火山碎岩、风吹雪舌、罗斯海海冰与远处 Erebus 同框；Pram Point 基地约10米。无乔灌草本或野花；避风裸石微生境可保留地衣，覆盖待核。南极贼鸥在南半球夏季活动，威德尔海豹限海冰，陆路不设兽群；不生成蝶、蜂、蝉、蜻蜓或萤火虫。

**天气与积雪。** 风吹雪与低能见度可迅速遮去道路轮廓。全年可能有雪；夏季裸露砾石与吹雪带并存，本站格点雪盖缺测。样点 -77.85°, 166.72°，格点平均高度 140 m。

| 月份 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 平均日高 °C | -5.4 | -12.3 | -22 | -26.2 | -26.1 | -27.6 | -30.3 | -29.4 | -27.5 | -20.7 | -12.4 | -5.7 |
| 平均日低 °C | -10 | -17.5 | -27.3 | -31.2 | -31.3 | -32.7 | -35.5 | -34.8 | -33.2 | -26.8 | -18.1 | -10.3 |
| 月降水 mm | 12.8 | 12.2 | 9.2 | 11.9 | 9.7 | 10.3 | 7.2 | 11 | 9.8 | 8.8 | 6.8 | 11.4 |
| 格点雪盖 0–1 | — | — | — | — | — | — | — | — | — | — | — | — |

林线不适用；季节性雪缘受风和裸岩控制，固定高度缺测。野花和树木条目为空。基地以外陆地保留裸岩粗糙面，大型动物仅在海冰与水缘出现。

资料：[Scott Base | Antarctica New Zealand](https://www.antarcticanz.govt.nz/scott-base) · [The USAP Portal: Science and Support in Antarctica - 2026-2027 Science Planning Summary](https://www.usap.gov/sciencesupport/scienceplanningsummaries/2026_2027/results.cfm?ID=2761&formAction=detail) · [UTILITIES INFRASTRUCTURE DESIGN](https://future.usap.gov/itc-general-2/90-Basis-of-Design.pdf) · [逐日气候原数](https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,FRSNO&community=AG&longitude=166.72&latitude=-77.85&start=20010101&end=20201231&format=JSON)

## 水下生境与路边可见度

- 元阳的鱼、鳝和鸭与灌水稻田的生产制度相连。蓄水浅田可用小水纹，收割后的干田关闭水生动物；该组合不自动复制到吕宋所有田块。[联合国教科文组织：哈尼梯田](https://whc.unesco.org/en/list/1111/)
- 阿拉斯加 Denali 的冰川浑水与清澈支流相距不远；在清溪和湖泊更适合表现北极茴鱼，主河的灰白悬沙会遮住水下鱼形。[国家公园：水体与鱼类](https://home.nps.gov/dena/planyourvisit/fishing.htm)
- 优胜美地上游的许多高山湖原本无鱼，历史引种改变了部分湖泊。在没有本湖记录时，可用石底、倒影和水面昆虫表达清澈。[国家公园：优胜美地鱼类](https://home.nps.gov/yose/learn/nature/fish.htm)
- 新西兰长鳍鳗（Anguilla dieffenbachii）可作为阴湿溪岸的区域参考。鱼身贴着河岸、倒木或块石隐藏，峡湾开阔咸水面使用另一套动物候选。Milford 单个沟溪的占据记录仍待核。[DOC：新西兰淡水鳗](https://www.doc.govt.nz/nature/native-animals/freshwater-fish/eels/)

## 下游使用时的判读顺序

先选地理上能接续的路线，再以海拔划带，最后以地表和季节决定该带中究竟能出现什么。河谷的杨树候选权重即使是 1，干台地的树密度仍应为 0；密林原型中树表为空且列有待建树冠时，则应等待对应资产。计算积雪时先区分冬季落叶、常绿承雪和风蚀裸脊；夏季雪槽旁可有正在开花的草坡。花和传粉昆虫分别匹配月份与生境，只有交集里才有访花。表内距离描述旅途节奏，未测量真实公路生态交界的宽度。
