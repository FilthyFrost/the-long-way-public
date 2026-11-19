# 路旁动物、作物与可采食物

54 个生态原型共用一份[纯数据字典](../../../src/core/world/data/ecoFauna.ts)。每个原型选取可在车窗或沿路水边表现的代表动物；种名相同的鱼在不同半球可有不同季节。动物先作景：阿拉斯加驼鹿在柳岸，克鲁格河马在水里，家水牛在蓄水稻田。作物属于经营田块，野食另有生境与月份。

**观测尺度。** 海拔带对应 [生态原型](../../../src/core/world/data/ecoProfiles.ts)；同一带内再取林缘、裸崖、农田或水边。下表数量是单幅车窗画面的建议范围，大群只显示一部分。月份是地方日历的可见／活跃窗口，晨昏随当地日照变化。它们是调度估值，不是各条公路逐小时的普查。实测警戒距离、开始逃离时的距离和逃离后走了多远是三个不同量：黄腹旱獭研究对 308 个体作了 1,052 次逃离起始距离观测，并记录起始距离、姿态、坡向及洞口距离。不同种群习惯化程度差别很大，缺少本路数据时只给“退入灌丛／列队过路／聚拢护幼”等反应，不捏造固定米数。公园的观赏距离属于游客管理规则。[旱獭实地研究](https://blumsteinlab.eeb.ucla.edu/wp-content/uploads/sites/104/2023/06/Blumstein_etal_2023_AnimBehav.pdf) · [国家公园野生动物观赏说明](https://www.nps.gov/grsm/learn/news/great-smoky-mountains-national-park-reminds-visitors-to-view-elk-and-black-bears-safely-this-fall.htm)

**利用状态。** “区域有猎用记录／区域渔业对象”是生物资源背景，不等于当前道路可猎、可捕或可采；保护区、禁渔水体、当地所有权和传统权利各有边界。表内季节服务于看见生物。例：阿拉斯加有驯鹿与驼鹿的受管理狩猎，Fiordland 的马鹿、岩羚是引入兽，Kruger 的园内野生动物和 Milford 海洋保护区内的鱼只作为场景参照。骆驼、牦牛与野化马群未取得这批样段的可靠日常目击依据；这里的马跟随牧场或有记录的牧道。[阿拉斯加猎物名录](https://www.adfg.alaska.gov/index.cfm?adfg=hunting..species) · [Fiordland 引入兽管理](https://www.doc.govt.nz/parks-and-recreation/things-to-do/hunting/where-to-hunt/fiordland/fiordland-hunting/what-to-hunt/) · [峡湾保护区](https://www.doc.govt.nz/globalassets/documents/conservation/marine-and-coastal/marine-protected-areas/fiordland-marine-reserves.pdf) · [Kruger 哺乳动物](https://www.sanparks.org/parks/kruger/explore/fauna-flora/mammals)

## 逐原型放置表

动物后的数字为可用海拔范围；所有鱼还须满足实际水体类型和连通性。空项表示本次没有可推荐的当地条目，或该地根本没有这种水体和土地利用。各行资料为路线或其区域佐证；人工窗口与物种行为的详细条件见下方共用表。

### 内华达花岗岩谷底 · `sierra-valley`

骡鹿（1100–1800 m，林缘）；美洲黑熊（1100–1800 m，林缘）；郊狼（1100–1800 m，灌丛）。

水中：河溪·虹鳟。田园：—。野食：栎实、黑莓类。河岸有水，公园谷底草甸不种田。[区域资料 1](https://www.nps.gov/places/000/tuolumne-meadows.htm) · [区域资料 2](https://www.nps.gov/yose/learn/nature/fish.htm) · [区域资料 3](https://www.fs.usda.gov/psw/publications/documents/psw_gtr214/psw_gtr214.pdf)

### 内华达高山草甸 · `sierra-high`

黄腹旱獭（2650–3700 m，碎石）；骡鹿（1800–2900 m，林缘）；美洲黑熊（1800–2900 m，林缘）。

水中：河溪·虹鳟、湖泊·引入的鳟类。田园：—。野食：—。高山花甸与裸岩不设作物，许多冰湖天然无鱼。[区域资料 1](https://www.nps.gov/places/000/tuolumne-meadows.htm) · [区域资料 2](https://www.nps.gov/yose/learn/nature/fish.htm) · [区域资料 3](https://blumsteinlab.eeb.ucla.edu/wp-content/uploads/sites/104/2023/06/Blumstein_etal_2023_AnimBehav.pdf)

### 海雾红杉河谷 · `fog-redwood`

哥伦比亚黑尾鹿（0–500 m，林缘）；美洲黑熊（0–500 m，林缘）。

水中：河溪·奇努克鲑、河溪·硬头型虹鳟。田园：—。野食：常绿越橘。鲑鱼只在 Eel River 主支流；高冠内无耕地。[区域资料 1](https://dbw.parks.ca.gov/pages/425/files/HumboldtRedwoodsSP_InfoSheet_8.5x14_051326_FINAL.pdf) · [区域资料 2](https://www.fs.usda.gov/psw/publications/documents/psw_gtr214/psw_gtr214.pdf)

### 加州地中海型海崖 · `sur-coast`

哥伦比亚黑尾鹿（0–650 m，林缘）；南方海獭（0–150 m，海岸）；港海豹（0–150 m，海岸）。

水中：河溪·硬头型虹鳟、近海·太平洋岩鱼类。田园：—。野食：栎实、巨藻。海獭和海豹只见于海面或岸礁，林中没有海兽。[区域资料 1](https://parks.ca.gov/?page_id=579) · [区域资料 2](https://dbw.parks.ca.gov/pages/425/files/HumboldtRedwoodsSP_InfoSheet_8.5x14_051326_FINAL.pdf) · [区域资料 3](https://www.fs.usda.gov/psw/publications/documents/psw_gtr214/psw_gtr214.pdf)

### 落基山林线公路 · `rocky-pass`

马鹿（北美）（2350–3450 m，开阔草地）；驼鹿（2350–3450 m，湿地）；黄腹旱獭（3450–4000 m，碎石）；大角羊（2850–4000 m，崖壁）。

水中：湖泊·割喉鳟、河溪·褐鳟。田园：—。野食：桤叶唐棣果。山口裸石无农作，湖泊须有本湖鱼类记录。[区域资料 1](https://www.nps.gov/thingstodo/wildlife-viewing-in-rocky-mountain-national-park.htm) · [区域资料 2](https://www.nps.gov/thingstodo/fishing-in-rmnp.htm) · [区域资料 3](https://www.fs.usda.gov/nsl/Handbook%20on%20Seeds%20of%20Browse-Shrubs%20and%20Forbs.pdf)

### 科罗拉多高原红岩 · `redrock`

大角羊（1100–2000 m，崖壁）；骡鹿（1100–2000 m，林缘）；郊狼（1100–2000 m，灌丛）。

水中：河溪·宽唇亚口鱼。田园：—。野食：矮松松子、仙人掌梨果。水只在峡底常流大河；岩鳍顶部没有鱼池。[区域资料 1](https://www.nps.gov/cany/learn/nature/rivers.htm) · [区域资料 2](https://www.nps.gov/cany/learn/nature/fish.htm) · [区域资料 3](https://www.nps.gov/sagu/learn/nature/mesquites.htm)

### 阿巴拉契亚阔叶山脊 · `appalachian`

白尾鹿（150–1350 m，林缘）；美洲黑熊（150–1850 m，林缘）；赤狐（150–1350 m，林缘）。

水中：河溪·溪红点鲑。田园：—。野食：黑莓类、羊肚菌类。州界山脊沿线是林；林间春菌需点位记录。[区域资料 1](https://home.nps.gov/shen/learn/nature/upload/508_SHEN_SpeciesChecklist_Mammals.pdf) · [区域资料 2](https://www.nps.gov/shen/planyourvisit/fishing.htm) · [区域资料 3](https://www.poison.org/articles/wild-mushroom-warning)

### 布鲁克斯北坡苔原 · `arctic-tundra`

北美驯鹿（0–1450 m，苔原）；麝牛（0–1450 m，苔原）；棕熊（0–1450 m，河岸）。

水中：河溪·北极茴鱼、湖泊·北极红点鲑、河溪·花羔红点鲑。田园：—。野食：云莓、阿拉斯加笃斯越橘。夏季融水塘非一律有鱼；积雪苔原不安排耕地。[区域资料 1](https://www.blm.gov/sites/blm.gov/files/documents/files/PublicRoom_Alaska_DaltonHwy_VisitorGuide-web.pdf) · [区域资料 2](https://www.adfg.alaska.gov/sf/FishingReports/index.cfm?ADFG=R3.summary&Area_key=25&RecordID=86) · [区域资料 3](https://www.uaf.edu/anlc/docs/YK_Ethnobotany.pdf)

### 阿拉斯加内陆泰加林 · `alaska-taiga`

驼鹿（100–850 m，湿地）；美洲黑熊（100–850 m，林缘）；北美驯鹿（100–850 m，苔原）。

水中：河溪·北极茴鱼。田园：—。野食：阿拉斯加笃斯越橘、越橘红果。冷湿土针叶林少耕地；驼鹿偏河岸柳带。[区域资料 1](https://www.blm.gov/sites/blm.gov/files/documents/files/PublicRoom_Alaska_DaltonHwy_VisitorGuide-web.pdf) · [区域资料 2](https://www.adfg.alaska.gov/sf/FishingReports/index.cfm?ADFG=R3.summary&Area_key=25&RecordID=86) · [区域资料 3](https://www.uaf.edu/anlc/docs/YK_Ethnobotany.pdf) · [区域资料 4](https://www.adfg.alaska.gov/index.cfm?adfg=hunting..species)

### 索诺兰柱仙人掌冲积扇 · `sonoran`

领西猯（600–1300 m，灌丛）；骡鹿（600–1300 m，林缘）；郊狼（600–1300 m，灌丛）。

水中：—。田园：—。野食：仙人掌梨果、巨柱仙人掌果、牧豆树荚。干河沟雨后短流没有常驻鱼；农田不置于公园仙人掌扇。[区域资料 1](https://www.nps.gov/sagu/learn/nature/javelina.htm) · [区域资料 2](https://www.nps.gov/sagu/learn/nature/mesquites.htm)

### 混合草原与劣地 · `prairie-badlands`

美洲野牛（600–1050 m，开阔草地）；叉角羚（600–1050 m，开阔草地）；大角羊（600–1050 m，崖壁）；黑尾草原犬鼠（600–1050 m，开阔草地）。

水中：—。田园：—。野食：野蔷薇果。公园开阔草地不当作麦田；干沟无常驻鱼。[区域资料 1](https://home.nps.gov/thingstodo/badl-wildlife-viewing.htm)

### 中阿尔卑斯落叶松山口 · `central-alps`

阿尔卑斯岩羚（1650–3200 m，崖壁）；阿尔卑斯旱獭（1650–3200 m，开阔草地）；家牛（850–2200 m，耕牧地，6–9月）；家山羊（850–2200 m，耕牧地，6–9月）。

水中：河溪·欧洲褐鳟类群、湖泊·高山红点鲑类。田园：牧草干草。野食：欧洲越橘、美味牛肝菌复合群。农草限低带农地或可刈牧场，高带为季牧。[区域资料 1](https://lombardia.stelviopark.it/itinerario/le-valli-camune/) · [区域资料 2](https://lombardia.stelviopark.it/wp-content/uploads/2019/05/PP_VAS_Studio_di_incidenza.pdf)

### 西挪威峡湾雪路 · `norway-fjord`

欧洲马鹿（0–850 m，林缘）；家绵羊（0–850 m，耕牧地，5–9月）；港海豹（0–450 m，海岸）。

水中：峡湾·大西洋鳕、河口·海鳟。田园：苹果。野食：欧洲越橘、云莓。果树只在低海拔避风耕地，云莓只在高处湿地。[区域资料 1](https://www.visitnorway.com/things-to-do/nature-attractions/fjords/the-fjords-explained/) · [区域资料 2](https://www.visitnorway.com/things-to-do/food-and-drink/fruit-and-berries/?alphaend=f&alphastart=a&listingTag=284&skip=0&sort=rankTitle) · [区域资料 3](https://en.sognefjord.no/fjord-villages/laerdal/get-inspired-in-laerdal/)

### 地中海柠檬梯园 · `amalfi-terrace`

家山羊（0–450 m，耕牧地）；家牛（0–450 m，耕牧地）。
水中：近海·金头鲷。田园：阿马尔菲柠檬、油橄榄。野食：—。家畜限有栏村田；岸外浅海可见鱼。[区域资料 1](https://whc.unesco.org/en/list/830/) · [区域资料 2](https://www.qualigeo.eu/prodotto-qualigeo/limone-costa-damalfi-igp/)

### 哀牢山灌溉梯田 · `hani-paddy`

家水牛（800–1650 m，耕牧地）；家鸭（800–1650 m，耕牧地）；圈养家猪（1650–2100 m，耕牧地）。

水中：养殖稻田·鲤。田园：哈尼红米。野食：食用竹种嫩笋、荠菜。水牛和鸭限有农人的田块，猪限村舍。[区域资料 1](https://whc.unesco.org/en/list/1111) · [区域资料 2](https://whc.unesco.org/en/list/1111/)

### 吕宋山地水田 · `ifugao-paddy`

家水牛（850–1600 m，耕牧地）；圈养家猪（850–2000 m，耕牧地）；家鸭（850–1600 m，耕牧地）。

水中：养殖稻田·养殖罗非鱼类。田园：伊富高传统一期稻、甘薯。野食：—。鱼坑是管理水体；旱作甘薯与湿田分开。[区域资料 1](https://www.fao.org/giahs/giahs-around-the-world/philippines-ifugao-rice-terraces-system/en) · [区域资料 2](https://www.fao.org/fileadmin/templates/giahs/PDF/Ifugao_Rice_Terraces.pdf) · [区域资料 3](https://books.irri.org/HRP-Phase-II-VCA-Report-2020.pdf)

### 桂北峰林河谷 · `karst-river`

家水牛（80–180 m，耕牧地）；家鸭（80–180 m，耕牧地）。

水中：河溪·鲤科鱼类。田园：华南水稻、油菜。野食：食用竹种嫩笋、荠菜。水田与竹林在谷底；岩顶不放农产。[区域资料 1](https://whc.unesco.org/en/list/1248/)

### 南非低地稀树草原 · `lowveld`

非洲草原象（150–550 m，稀树草原）；黑斑羚（150–550 m，稀树草原）；平原斑马（150–550 m，稀树草原）；河马（150–550 m，水缘）。

水中：河溪·莫桑比克口孵非鲫、河溪·非洲尖齿胡鲶。田园：—。野食：马鲁拉果。河马与鱼限常年水域，国家公园无农田。[区域资料 1](https://www.sanparks.org/parks/kruger/explore/fauna-flora/mammals) · [区域资料 2](https://www.sanparks.org/wp-content/uploads/2024/09/KNP-Concessions-Operations-Manual-Version-2-2.pdf) · [区域资料 3](https://pza.sanbi.org/sclerocarya-birrea)

### 开普硬叶灌丛海崖 · `cape-fynbos`

南非狒狒（0–650 m，灌丛）；岩蹄兔（0–650 m，崖壁）。

水中：近海·开普海鲷类。田园：—。野食：开普食用番杏果。海鱼限崖下海域，沿海灌丛不铺作物。[区域资料 1](https://www.sanparks.org/parks/table-mountain/explore/fauna-flora/mammals) · [区域资料 2](https://pza.sanbi.org/carpobrotus-edulis) · [区域资料 3](https://www.sanparks.org/wp-content/uploads/2026/02/Table_mountain_draft_management_plan.pdf)

### 维州石灰岩海蚀岸 · `otway-coast`

东部灰大袋鼠（0–180 m，开阔草地）；沼泽沙袋鼠（0–180 m，林缘）。

水中：近海·澳洲鲑属鱼类、河口·黄眼鲻。田园：冷凉季牧草。野食：—。牧地限内陆开垦面，河口与近海鱼群分开。[区域资料 1](https://www.parks.vic.gov.au/-/media/project/pv/main/parks/documents/visitor-guides-and-publications/port-campbell-national-park/port-campbell-national-park-and-bay-of-islands-coastal-park-visitor-guide.pdf?rev=628d1bb9c3644837b19a52571bb97c63) · [区域资料 2](https://vfa.vic.gov.au/recreational-fishing/fishing-locations/inland-angling-guide/areas/otway/otway-angling-waters) · [区域资料 3](https://www.colacotway.vic.gov.au/files/assets/public/trimfiles/council-and-the-shire/small-town-community-groups/lavers_hill_master-plan-2006.pdf)

### 奥特韦湿沟桉林 · `otway-forest`

沼泽沙袋鼠（100–650 m，林缘）；考拉（100–650 m，林内）。

水中：河溪·澳洲短鳍鳗。田园：—。野食：澳洲原生悬钩子。考拉限合适的桉树林；湿沟闭冠雨林勿放牧场。[区域资料 1](https://www.parks.vic.gov.au/-/media/project/pv/main/parks/documents/get-into-nature/conservation-and-science/caps/great-otways-conservation-action-plan-cap.pdf?hash=4B01E6F94DDAFE1D72BBA0BEF8CC31A34DBF00B5&la=en) · [区域资料 2](https://www.anbg.gov.au/aborig.s.e.aust/rubus-parvifolius.html) · [区域资料 3](https://vfa.vic.gov.au/recreational-fishing/fishing-locations/inland-angling-guide/areas/otway/otway-angling-waters)

### 南岛山毛榉冰川谷 · `fiordland`

引入新西兰的马鹿（0–1000 m，林缘）；新西兰毛皮海狮（0–700 m，海岸）。

水中：河溪·褐鳟、湖泊·引入虹鳟、峡湾·新西兰蓝鳕。田园：—。野食：—。海豹和蓝鳕留在终点峡湾；上段内陆草地不放海兽。[区域资料 1](https://www.doc.govt.nz/parks-and-recreation/things-to-do/hunting/where-to-hunt/fiordland/fiordland-hunting/what-to-hunt/) · [区域资料 2](https://www.doc.govt.nz/globalassets/documents/conservation/marine-and-coastal/marine-protected-areas/fiordland-marine-reserves.pdf) · [区域资料 3](https://www.fishandgame.org.nz/assets/Fishing/Fishing-Licences-Regulations/Fishing-Regulations/2025-South-Island-Fishing-Regulations.pdf)

### 昆士兰低地热带雨林 · `wet-tropics`

南方鹤鸵（0–250 m，林缘）；麝袋鼠（0–250 m，林内）；湾鳄（0–250 m，水缘）。

水中：河溪·丛林汤鲤、河口·尖吻鲈。田园：—。野食：—。鳄限低地水边。可食果与毒果需当地资料，不设任意落果可采。[区域资料 1](https://parks.qld.gov.au/parks/daintree/journeys/jindalba-circuit-track) · [区域资料 2](https://parks.qld.gov.au/parks/daintree/things-to-do) · [区域资料 3](https://parks.qld.gov.au/parks/daintree/about/culture)

### 安第斯雨影丛草原 · `patagonian-steppe`

原驼（150–900 m，开阔草地）；安第斯狐（150–900 m，灌丛）；家绵羊（150–900 m，耕牧地）；家马（150–900 m，耕牧地）。

水中：河溪·引入褐鳟、湖泊·引入虹鳟。田园：—。野食：—。家畜限牧场，公路野生原驼与羊分群；风蚀地不播田。[区域资料 1](https://www.argentina.gob.ar/parquesnacionales/patagonia-austral/parque-nacional-los-glaciares/biodiversidad) · [区域资料 2](https://www.argentina.gob.ar/parquesnacionales/patagonia-austral/parque-nacional-los-glaciares/actividades) · [区域资料 3](https://www.argentina.gob.ar/parquesnacionales/patagonia-austral/parque-nacional-los-glaciares/alojamiento)

### 巴塔哥尼亚温带雨林 · `andes-rainforest`

南美普度鹿（0–700 m，林内）；安第斯狐（0–1100 m，灌丛）。

水中：河溪·引入褐鳟、湖泊·引入虹鳟。田园：—。野食：卡拉法特小檗果。草果限有日照的下部林缘，厚冰与密林不设农地。[区域资料 1](https://www.conaf.cl/parque_nacionales/parque-nacional-queulat/) · [区域资料 2](https://biblioteca.inia.cl/server/api/core/bitstreams/9fa904bc-4585-4f9b-8b1e-f70bc5d722fe/content) · [区域资料 3](https://www.argentina.gob.ar/parquesnacionales/patagonia-austral/parque-nacional-los-glaciares/actividades)

### 加州山麓栎林草坡 · `cal-oak`

骡鹿（150–1100 m，林缘）；哥伦比亚黑尾鹿（150–1100 m，林缘）；家牛（150–1100 m，耕牧地）。

水中：河溪·虹鳟。田园：牧草干草。野食：栎实。海岸亚种与内陆骡鹿按子地区择一；家牛限已开垦牧地。[区域资料 1](https://www.nps.gov/yose/learn/nature/plants.htm) · [区域资料 2](https://www.fs.usda.gov/psw/publications/documents/psw_gtr214/psw_gtr214.pdf) · [区域资料 3](https://www.nps.gov/yose/learn/nature/fish.htm) · [区域资料 4](https://www.nps.gov/places/000/tuolumne-meadows.htm)

### 科罗拉多台地矮松刺柏疏林 · `mesa-woodland`

骡鹿（1500–2450 m，林缘）；郊狼（1500–2450 m，灌丛）。

水中：—。田园：—。野食：矮松松子、仙人掌梨果。无常年水域与耕地的台顶不放鱼和作物。[区域资料 1](https://irma.nps.gov/DataStore/FileSource/Get/2289995?filename=MEVE_Park-Entrance-Road-Corridor_CLIParkReport_main.pdf) · [区域资料 2](https://www.nps.gov/cany/learn/nature/fish.htm)

### 南落基山东麓松林河峡 · `rocky-foothill`

大角羊（1450–2500 m，崖壁）；骡鹿（1450–2500 m，林缘）；马鹿（北美）（1450–2500 m，开阔草地）。

水中：河溪·褐鳟。田园：—。野食：桤叶唐棣果。松岩峡谷与河流相伴，狭谷内部无田。[区域资料 1](https://home.nps.gov/romo/planyourvisit/directions.htm) · [区域资料 2](https://www.nps.gov/thingstodo/wildlife-viewing-in-rocky-mountain-national-park.htm) · [区域资料 3](https://www.fs.usda.gov/nsl/Handbook%20on%20Seeds%20of%20Browse-Shrubs%20and%20Forbs.pdf)

### 大平原西缘短草台地 · `front-prairie`

叉角羚（800–1750 m，开阔草地）；黑尾草原犬鼠（800–1750 m，开阔草地）；家牛（800–1750 m，耕牧地）。

水中：—。田园：冬小麦、牧草干草。野食：—。小麦仅在短草原外已耕地；开阔干台地无常驻鱼。[区域资料 1](https://www.fs.usda.gov/rm/pubs/rmrs_gtr017.pdf) · [区域资料 2](https://www.nass.usda.gov/Statistics_by_State/Colorado/Publications/Annual_Statistical_Bulletin/Bulletin2024.pdf)

### 圣胡安山地黄松与山杨林 · `sanjuan-montane`

马鹿（北美）（1900–3100 m，开阔草地）；骡鹿（1900–3100 m，林缘）；美洲黑熊（1900–3100 m，林缘）。
水中：河溪·褐鳟。田园：—。野食：桤叶唐棣果。山杨谷缘适合鹿穿越，常流河与坡地分开。[区域资料 1](https://www.colorado.com/byways/san-juan-skyway) · [区域资料 2](https://www.nps.gov/thingstodo/wildlife-viewing-in-rocky-mountain-national-park.htm) · [区域资料 3](https://www.fs.usda.gov/nsl/Handbook%20on%20Seeds%20of%20Browse-Shrubs%20and%20Forbs.pdf)

### 蓝岭脊顶草甸 · `blue-meadow`

白尾鹿（960–1120 m，林缘）；美洲黑熊（960–1120 m，林缘）；赤狐（960–1120 m，林缘）。

水中：—。田园：—。野食：黑莓类。Big Meadows 是林间受管理的野生草甸；无常年渔场与农田。[区域资料 1](https://irmadev.nps.gov/DataStore/Reference/Profile/2188740) · [区域资料 2](https://home.nps.gov/shen/learn/nature/upload/508_SHEN_SpeciesChecklist_Mammals.pdf)

### 仙纳度河谷牧地与树篱 · `shenandoah-farm`

白尾鹿（180–420 m，林缘）；家牛（180–420 m，耕牧地）；家马（180–420 m，耕牧地）。

水中：河溪·小口黑鲈。田园：玉米、牧草干草。野食：美洲黑核桃、黑莓类、野蔷薇果。木栏、谷底大河与树篱分别限制出现位置。[区域资料 1](https://irma.nps.gov/DataStore/FileSource/Get/2188744?filename=SHEN_Headquarters_CLI+Update+Park+Report_2025.pdf) · [区域资料 2](https://www.nps.gov/shen/planyourvisit/fishing.htm)

### 阿拉斯加辫状河河阶柳丛 · `alaska-braid`

驼鹿（220–900 m，湿地）；北美驯鹿（220–900 m，苔原）；棕熊（220–900 m，河岸）。

水中：河溪·北极茴鱼、河溪·花羔红点鲑。田园：—。野食：阿拉斯加笃斯越橘。新砾洲裸露；越橘在稳定河阶湿洼。[区域资料 1](https://www.blm.gov/sites/blm.gov/files/documents/files/PublicRoom_Alaska_DaltonHwy_VisitorGuide-web.pdf) · [区域资料 2](https://www.adfg.alaska.gov/sf/FishingReports/index.cfm?ADFG=R3.summary&Area_key=25&RecordID=86) · [区域资料 3](https://www.uaf.edu/anlc/docs/YK_Ethnobotany.pdf)

### 索诺兰天空岛栎林 · `sky-oak`

领西猯（1250–2100 m，灌丛）；骡鹿（1250–2100 m，林缘）；郊狼（1250–2100 m，灌丛）。

水中：—。田园：—。野食：栎实。间歇水沟无默认鱼；不将高山松林物种放入下部栎林。[区域资料 1](https://www.fs.usda.gov/sites/nfs/files/legacy-media/coronado/Mt%20Lemmon%20ROG.pdf) · [区域资料 2](https://www.nps.gov/sagu/learn/nature/javelina.htm)

### 圣卡塔利娜山顶黄松林 · `sky-pine`

骡鹿（2050–2790 m，林缘）；美洲黑熊（2050–2790 m，林缘）。

水中：湖泊·管理型放流鱼（支路独立点位）。田园：—。野食：—。Rose Canyon 是管理型蓄水湖，春至秋有人工放鱼；此点不外推至干山沟。天然山顶林不设作物。[Coronado 国家森林资料](https://www.fs.usda.gov/sites/nfs/files/r03/coronado/publication/REFI-Campground-Related-Granger-Thye-Concession-Overview-Document.pdf)。[区域资料 1](https://www.fs.usda.gov/sites/nfs/files/legacy-media/coronado/Mt%20Lemmon%20ROG.pdf) · [区域资料 2](https://www.nps.gov/sagu/learn/nature/javelina.htm)

### 南蒂罗尔灌溉果园谷地 · `alps-orchard`

欧洲马鹿（650–1050 m，林缘）；家牛（650–1050 m，耕牧地）。

水中：河溪·欧洲褐鳟类群。田园：苹果、牧草干草。野食：欧洲榛子。鹿晨昏从林缘进入果园；成行苹果属于农产。[区域资料 1](https://www.vinschgau.net/media/d28e0dda-e214-4bf8-add0-cda525708b7d/fuer-online-image-und-informationsbroschuere-de-137-x-205-21-03-2020.pdf) · [区域资料 2](https://lombardia.stelviopark.it/itinerario/le-valli-camune/) · [区域资料 3](https://eur-lex.europa.eu/legal-content/EN/TXT/?qid=1784849677493&uri=CELEX%3A52003XC0208%2803%29)

### 阿尔卑斯疏落叶松牧场 · `alps-larch`

阿尔卑斯岩羚（1450–2250 m，崖壁）；阿尔卑斯旱獭（1450–2250 m，开阔草地）；家牛（1450–2250 m，耕牧地，6–9月）；家山羊（1450–2250 m，耕牧地，6–9月）。

水中：河溪·欧洲褐鳟类群。田园：牧草干草。野食：欧洲越橘、美味牛肝菌复合群。以季牧为主，可刈低坡产草，山口石坡不种粮。[区域资料 1](https://lombardia.stelviopark.it/wp-content/uploads/2018/05/PP_Documento_illustrativo_Piano_20180331.pdf) · [区域资料 2](https://lombardia.stelviopark.it/itinerario/le-valli-camune/) · [区域资料 3](https://lombardia.stelviopark.it/wp-content/uploads/2019/05/PP_VAS_Studio_di_incidenza.pdf)

### 松恩峡湾河口果田 · `fjord-orchard`

欧洲马鹿（0–180 m，林缘）；家绵羊（0–180 m，耕牧地）；港海豹（0–180 m，海岸）。

水中：河口·海鳟、峡湾·大西洋鳕。田园：苹果、甜樱桃、马铃薯。野食：—。岸边湿地与栽培果物分开；海豹仅水边。[区域资料 1](https://en.sognefjord.no/fjord-villages/laerdal/get-inspired-in-laerdal/) · [区域资料 2](https://www.visitnorway.com/things-to-do/nature-attractions/fjords/the-fjords-explained/) · [区域资料 3](https://www.visitnorway.com/things-to-do/food-and-drink/fruit-and-berries/?alphaend=f&alphastart=a&listingTag=284&skip=0&sort=rankTitle)

### 西挪威高地石南雪槽 · `fjord-heath`

家绵羊（850–1400 m，耕牧地，6–9月）。

水中：湖泊·高山红点鲑类。田园：—。野食：云莓、欧洲越橘。仅已知有鱼的山湖；冬季高地羊群撤走。[区域资料 1](https://www.nasjonaleturistveger.no/en/routes/aurlandsfjellet/) · [区域资料 2](https://www.miljodirektoratet.no/globalassets/publikasjoner/m81/m81.pdf) · [区域资料 3](https://www.visitnorway.com/things-to-do/food-and-drink/fruit-and-berries/?alphaend=f&alphastart=a&listingTag=284&skip=0&sort=rankTitle)

### 拉塔里山栗林谷肩 · `lattari-coppice`

赤狐（350–950 m，林缘）；家山羊（350–950 m，耕牧地）。

水中：—。田园：甜栗。野食：欧洲甜栗、欧洲熊葱。传统栗林保留果林与薪炭林差别；点位溪鱼待核。[区域资料 1](https://parcoregionaledeimontilattari.it/index.php?action=index&p=328) · [区域资料 2](https://vigilanses.anses.fr/sites/default/files/VigilAnsesN20_November2023_Autumncrocus.pdf) · [区域资料 3](https://vigilanses.anses.fr/sites/default/files/VigilAnsesN8_Confusionplants.pdf)

### 阿杰罗拉高台牧地 · `lattari-pasture`

家牛（550–850 m，耕牧地）；家山羊（550–850 m，耕牧地）；家绵羊（550–850 m，耕牧地）。

水中：—。田园：高台牧草、甜栗。野食：欧洲甜栗。台地奶牛与果林在围栏两侧；水槽不生野鱼。[区域资料 1](https://www.comune.agerola.na.it/vivere_il_comune/attivita/attivita_produttiva_13.html) · [区域资料 2](https://www.qualigeo.eu/prodotto-qualigeo/limone-costa-damalfi-igp/) · [区域资料 3](https://vigilanses.anses.fr/sites/default/files/VigilAnsesN8_Confusionplants.pdf)

### 华南冲积盆地水田 · `south-china-paddy`

家水牛（80–650 m，耕牧地）；家鸭（80–650 m，耕牧地）。

水中：河溪·鲤科鱼类、养殖稻田·鲤。田园：华南水稻。野食：荠菜。鲤只放入有稻鱼管理记录的田块；河里另配当地鱼。[区域资料 1](https://whc.unesco.org/en/list/1111) · [区域资料 2](https://www.fao.org/giahs/around-the-world/detail/china-hani-rice-terraces/en)

### 伊富高村寨水源林 · `ifugao-grove`

圈养家猪（1150–1850 m，耕牧地）；家水牛（1150–1850 m，耕牧地）。

水中：养殖稻田·养殖罗非鱼类。田园：甘薯。野食：—。农家动物与鱼坑仅在林田界外。水源林内部不养猪和鱼。[区域资料 1](https://www.fao.org/giahs/giahs-around-the-world/philippines-ifugao-rice-terraces-system/en) · [区域资料 2](https://www.fao.org/fileadmin/templates/giahs/PDF/Ifugao_Rice_Terraces.pdf)

### 吕宋科迪勒拉山脊松林 · `cordillera-pine`

家牛（1100–2200 m，耕牧地）；家山羊（1100–2200 m，耕牧地）。

水中：—。田园：—。野食：—。仅有人经营的邻接坡村放家畜；阳坡松林未核实大型野兽常见记录。[区域资料 1](https://philjournalsci.dost.gov.ph/threat-of-potential-bioinvasion-in-a-natural-forest-in-poitan-banaue-ifugao-cordillera-administrative-region/) · [区域资料 2](https://www.fao.org/fileadmin/templates/giahs/PDF/Ifugao_Rice_Terraces.pdf)

### 萨比河岸无花果林 · `sabie-gallery`

河马（150–350 m，水缘）；非洲草原象（150–350 m，稀树草原）；黑斑羚（150–350 m，稀树草原）。

水中：河溪·非洲尖齿胡鲶、河溪·莫桑比克口孵非鲫。田园：—。野食：—。无花果为动物食源；园内无田和玩家可采的默认果物。[区域资料 1](https://www.sanparks.org/parks/kruger/camps/main-rest-camps/lower-sabie) · [区域资料 2](https://www.sanparks.org/parks/kruger/explore/fauna-flora/mammals) · [区域资料 3](https://www.sanparks.org/wp-content/uploads/2024/09/KNP-Concessions-Operations-Manual-Version-2-2.pdf)

### 克鲁格玄武土长草台地 · `basalt-savanna`

平原斑马（150–500 m，稀树草原）；非洲草原象（150–500 m，稀树草原）；黑斑羚（150–500 m，稀树草原）。

水中：—。田园：—。野食：马鲁拉果。离开永久河道后不要生成河马或鱼；国家公园无耕地。[区域资料 1](https://www.sanparks.org/parks/kruger/camps/main-rest-camps/lower-sabie) · [区域资料 2](https://www.sanparks.org/parks/kruger/explore/fauna-flora/mammals) · [区域资料 3](https://pza.sanbi.org/sclerocarya-birrea)

### 开普滨海沙丘灌丛 · `cape-dune`

南非狒狒（0–100 m，灌丛）；岩蹄兔（0–100 m，崖壁）。
水中：近海·开普海鲷类。田园：—。野食：开普食用番杏果。岩蹄兔局限有岩隙的边界；活沙顶不放果丛。[区域资料 1](https://resource.capetown.gov.za/documentcentre/Documents/Bylaws%20and%20policies/Cape-Town-Biodiversity-Spatial-Plan.pdf) · [区域资料 2](https://www.sanparks.org/parks/table-mountain/explore/fauna-flora/mammals) · [区域资料 3](https://pza.sanbi.org/carpobrotus-edulis)

### 半岛避风沟谷原生林 · `cape-forest`

南非狒狒（80–480 m，灌丛）。

水中：—。田园：—。野食：—。湿谷稀少目击不硬填鼠鹿，保护林不放作物或野食；溪鱼待核。[区域资料 1](https://www.sanparks.org/parks/table-mountain/explore/fauna-flora/vegetation) · [区域资料 2](https://www.sanparks.org/parks/table-mountain/explore/fauna-flora/mammals)

### 奥特韦高地牧场 · `otway-pasture`

家牛（120–600 m，耕牧地）；东部灰大袋鼠（120–600 m，开阔草地）；沼泽沙袋鼠（120–600 m，林缘）。

水中：河溪·澳洲短鳍鳗。田园：冷凉季牧草。野食：澳洲原生悬钩子、引入黑莓。小袋鼠沿围栏与湿沟移动，农田上的干草卷为牧场道具。[区域资料 1](https://www.colacotway.vic.gov.au/files/assets/public/trimfiles/council-and-the-shire/small-town-community-groups/lavers_hill_master-plan-2006.pdf) · [区域资料 2](https://www.anbg.gov.au/aborig.s.e.aust/rubus-parvifolius.html) · [区域资料 3](https://vfa.vic.gov.au/recreational-fishing/fishing-locations/inland-angling-guide/areas/otway/otway-angling-waters)

### 埃格林顿谷原生草甸湿地 · `eglinton-grass`

引入新西兰的马鹿（250–480 m，林缘）。

水中：河溪·褐鳟、湖泊·引入虹鳟。田园：—。野食：—。这里是谷底原生草湿地；湖鱼只在连通大湖，Mirror Lakes 自身待核。[区域资料 1](https://www.doc.govt.nz/Documents/science-and-technical/sap263-3.pdf) · [区域资料 2](https://www.fishandgame.org.nz/assets/Fishing/Fishing-Licences-Regulations/Fishing-Regulations/2025-South-Island-Fishing-Regulations.pdf) · [区域资料 3](https://www.doc.govt.nz/parks-and-recreation/things-to-do/hunting/where-to-hunt/fiordland/fiordland-hunting/what-to-hunt/)

### 霍默隧道雪崩槽 · `homer-alpine`

阿尔卑斯岩羚（720–1500 m，崖壁）；引入新西兰的马鹿（720–1500 m，林缘）。

水中：—。田园：—。野食：—。岩羚为引入种且受控制，偶见；鹿限低处林缘。雪崩槽不生成鱼、耕作或食物。[区域资料 1](https://www.doc.govt.nz/parks-and-recreation/things-to-do/hunting/where-to-hunt/fiordland/fiordland-hunting/what-to-hunt/) · [区域资料 2](https://dxcprod.doc.govt.nz/parks-and-recreation/places-to-go/fiordland/places/fiordland-national-park/places-to-go/milford-road-milford-sound-area/nature-and-history/)

### 丹翠潮间红树林 · `daintree-tidal`

湾鳄（0–12 m，水缘）；南方鹤鸵（0–12 m，林缘）。

水中：河口·尖吻鲈。田园：—。野食：—。鹤鸵限淡水林交界；红树林潮果缺少采食核验。[区域资料 1](https://parks.qld.gov.au/parks/daintree/journeys/madja-boardwalk) · [区域资料 2](https://parks.qld.gov.au/parks/daintree/visiting-safely)

### 丹翠海滩背缘林 · `daintree-beach`

南方鹤鸵（0–45 m，林缘）；湾鳄（0–45 m，水缘）。

水中：河口·尖吻鲈。田园：—。野食：—。鳄与尖吻鲈只在相邻河口；开放沙滩近海鱼种待核，禁把潮河套到全岸。[区域资料 1](https://parks.qld.gov.au/parks/daintree/journeys/kulki-boardwalk) · [区域资料 2](https://parks.qld.gov.au/parks/daintree/things-to-do) · [区域资料 3](https://parks.qld.gov.au/parks/daintree/visiting-safely)

### 巴塔哥尼亚雨影疏林草甸 · `andean-parkland`

原驼（250–800 m，开阔草地）；安第斯狐（250–800 m，灌丛）；家马（250–800 m，耕牧地）。

水中：河溪·引入褐鳟、湖泊·引入虹鳟。田园：—。野食：卡拉法特小檗果。马限牧场或有人使用的牧道；莓丛在有土的避风谷肩。[区域资料 1](https://www.argentina.gob.ar/parquesnacionales/patagonia-austral/parque-nacional-los-glaciares/actividades) · [区域资料 2](https://biblioteca.inia.cl/server/api/core/bitstreams/9fa904bc-4585-4f9b-8b1e-f70bc5d722fe/content)

**惊逃距离的实测例子。** 犹他州 Antelope Island 的骡鹿受徒步者惊扰后平均移动约115米，受骑车者惊扰后约150米；这是逃离后移动的路程。当地植被、步道暴露和人流习惯化都会改变反应，不能将这两个数写成优胜美地所有鹿的触发半径。[研究综述与原研究引文](https://wdfw.wa.gov/sites/default/files/2024-01/recreation-and-wildlife-washington-considerations-conservation-finalreduced-1-3-24.pdf)

## 动物行为与风险

| 动物 | 同屏／社会结构 | 观察时段 | 路边动作 | 徒步风险 | 用途记录 |
|---|---|---|---|---|---|
| 骡鹿（Odocoileus hemionus） | 1–6，母幼小群；雄鹿常分开 | 全年，晨昏 | 沿林缘啃枝，车近时停看，可能连续横穿 | 带幼或发情时可踢撞 | 区域有猎用记录 |
| 哥伦比亚黑尾鹿（Odocoileus hemionus columbianus） | 1–5，母幼小群 | 全年，晨昏 | 由背风林缘进入草地，受惊跳回林中 | 蹄击 | 区域有猎用记录 |
| 美洲黑熊（Ursus americanus） | 1–3，通常独居，母带幼例外 | 4–11月，随条件变化 | 沿莓丛翻找，偶尔穿路；食物源改变活动时段 | 近距离及有幼崽时危险 | 区域有猎用记录 |
| 黄腹旱獭（Marmota flaviventris） | 1–5，群居但同屏只见少数 | 5–9月，日间 | 岩顶晒太阳，示警后钻入石缝 | 通常避人 | 利用情况待核 |
| 马鹿（北美）（Cervus canadensis） | 2–18，母幼群；秋季雄鹿伴群 | 全年，晨昏 | 低头啃草，头只过路后后续个体跟上 | 发情或护幼时冲撞 | 区域有猎用记录 |
| 驼鹿（Alces alces） | 1–3，多独居或母幼 | 全年，晨昏 | 在浅水吃柳枝，可能突然上路 | 可冲近踢击 | 区域有猎用记录 |
| 大角羊（Ovis canadensis） | 2–10，母群与雄群常分开 | 全年，日间 | 沿石壁横切，在开阔陡坡停立 | 近距离顶撞 | 区域有猎用记录 |
| 白尾鹿（Odocoileus virginianus） | 1–7，家族小群 | 全年，晨昏 | 进草甸采食，车辆惊起后可能有后续个体 | 受惊踢击 | 区域有猎用记录 |
| 赤狐（Vulpes vulpes） | 1–2，多单独活动 | 全年，晨昏 | 沿草缘嗅探，发现人迅速退入遮蔽 | 通常避人 | 利用情况待核 |
| 郊狼（Canis latrans） | 1–3，单只或家庭组 | 全年，晨昏 | 在空旷处小跑，过路后回头观察 | 通常避人 | 利用情况待核 |
| 北美驯鹿（Rangifer tarandus） | 3–24，迁移可有远超此值的大群 | 全年，随条件变化 | 跟随领头个体过路，后队可停步徘徊 | 蹄角冲撞 | 区域有猎用记录 |
| 麝牛（Ovibos moschatus） | 3–12，群居，遇扰可聚拢 | 全年，日间 | 在开阔坡地缓行，受扰时围护幼兽 | 可快速冲撞 | 区域有猎用记录 |
| 棕熊（Ursus arctos） | 1–3，多独居或母幼 | 5–10月，随条件变化 | 沿河翻石或在莓坡移动 | 遭遇或护幼危险 | 区域有猎用记录 |
| 领西猯（Dicotyles tajacu） | 3–12，家族群 | 全年，晨昏 | 成串穿越荒漠公路，热天多避开午间 | 受逼迫时可能咬伤 | 区域有猎用记录 |
| 美洲野牛（Bison bison） | 3–25，群体可远大于同屏数 | 全年，日间 | 低头啃草、卧尘，偶尔沿公路移动 | 可突然冲撞 | 利用情况待核 |
| 叉角羚（Antilocapra americana） | 2–12，小群，冬群更大 | 全年，日间 | 开阔地远望，受扰快速横移 | 通常避人 | 区域有猎用记录 |
| 黑尾草原犬鼠（Cynomys ludovicianus） | 2–8，洞群分家庭，分散可见 | 3–11月，日间 | 洞口直立、警叫后退入洞穴 | 通常避人 | 利用情况待核 |
| 阿尔卑斯岩羚（Rupicapra rupicapra） | 1–8，母幼同群，雄兽可独行 | 全年，日间 | 在险坡和草坡之间移动，受扰上攀 | 通常避人 | 区域有猎用记录 |
| 阿尔卑斯旱獭（Marmota marmota） | 1–5，家庭洞群 | 5–9月，日间 | 晒背、啃草、警哨后入洞 | 通常避人 | 利用情况待核 |
| 欧洲马鹿（Cervus elaphus） | 1–10，母幼小群，雄兽季节性入群 | 全年，晨昏 | 林内卧息，晨昏出林缘吃草 | 发情雄鹿危险 | 区域有猎用记录 |
| 家牛（Bos taurus） | 2–20，牧群，场地决定规模 | 全年，日间 | 顺围栏放牧，牛道口才有过路队列 | 护犊及公牛危险 | 家养 |
| 家山羊（Capra hircus） | 2–12，放牧小群 | 全年，日间 | 沿牧道攀坡啃枝，停看过车 | 可顶撞 | 家养 |
| 家绵羊（Ovis aries） | 4–24，群随领头羊 | 全年，日间 | 草场低头啃草，放牧道口成群过路 | 公羊可冲撞 | 家养 |
| 圈养家猪（Sus scrofa domesticus） | 1–6，农户小群 | 全年，日间 | 在村舍圈栏或有看管的院内拱土 | 大猪可咬撞 | 家养 |
| 家水牛（Bubalus bubalis） | 1–5，农户看管，少数母幼 | 全年，日间 | 下田缓行、浅水浸泡，田埂道上跟随农人 | 角与体重有危险 | 家养 |
| 非洲草原象（Loxodonta africana） | 1–12，母系群；成年公象也可独行 | 全年，随条件变化 | 列队去水边，幼象常居群中 | 极高，可突然冲撞 | 利用情况待核 |
| 黑斑羚（Aepyceros melampus） | 3–20，雌幼群与雄群 | 全年，晨昏 | 草林交界取食，遇扰连续跃过开地 | 通常避人 | 区域有猎用记录 |
| 平原斑马（Equus quagga） | 3–12，家族群也可汇合 | 全年，日间 | 开阔地边走边食，队列过路 | 踢咬危险 | 利用情况待核 |
| 河马（Hippopotamus amphibius） | 1–10，白天在永久水域聚集 | 全年，随条件变化 | 白天露鼻脊，入夜离水去草地 | 水岸与上岸路径危险极高 | 利用情况待核 |
| 南非狒狒（Papio ursinus） | 3–15，群体分散移动 | 全年，日间 | 沿崖脚或林缘行进，可能好奇停留 | 近距离可咬伤 | 利用情况待核 |
| 岩蹄兔（Procavia capensis） | 1–8，岩隙附近群居 | 全年，日间 | 在受光岩上晒背，受扰钻缝 | 通常避人 | 利用情况待核 |
| 东部灰大袋鼠（Macropus giganteus） | 1–9，松散群体 | 全年，晨昏 | 清晨黄昏吃草，跨栏后可能跳上车道 | 近距离可踢击 | 利用情况待核 |
| 沼泽沙袋鼠（Wallabia bicolor） | 1–2，多单独或带幼 | 全年，晨昏 | 短暂走出密灌，急转退回林内 | 通常避人 | 利用情况待核 |
| 考拉（Phascolarctos cinereus） | 1–2，常单独 | 全年，随条件变化 | 白天多静卧桉树，傍晚换树 | 爪与咬伤 | 观景／保护对象 |
| 引入新西兰的马鹿（Cervus elaphus） | 1–6，小群或独行 | 全年，晨昏 | 湿林边缘短暂进草地，受扰隐入林中 | 发情时危险 | 区域有猎用记录 |
| 新西兰毛皮海狮（Arctocephalus forsteri） | 1–8，小群上岸休息 | 全年，随条件变化 | 在峡湾岸岩休息、入水，通常远离公路 | 可咬伤 | 观景／保护对象 |
| 南方鹤鸵（Casuarius casuarius） | 1–3，成鸟多独行，雄鸟可带雏 | 全年，日间 | 沿落果树下走动，跨越密林间道路 | 足爪危险 | 观景／保护对象 |
| 麝袋鼠（Hypsiprymnodon moschatus） | 1–2，多独行 | 全年，日间 | 在落叶层觅果，遇扰没入密叶 | 通常避人 | 观景／保护对象 |
| 湾鳄（Crocodylus porosus） | 1–2，多单独 | 全年，随条件变化 | 泥岸晒背或水面静伏，不让它走进高地林 | 水边危险极高 | 观景／保护对象 |
| 原驼（Lama guanicoe） | 2–12，家庭群或雄群 | 全年，日间 | 沿风吹草坡采食，部分个体在路肩停看 | 可踢撞 | 利用情况待核 |
| 安第斯狐（Lycalopex culpaeus） | 1–2，常单独活动 | 全年，晨昏 | 在稀灌间移动或短暂横穿碎石道 | 通常避人 | 利用情况待核 |
| 南美普度鹿（Pudu puda） | 1–2，多独居，林下难见 | 全年，晨昏 | 穿过蕨层后迅速消失，低频 | 通常避人 | 观景／保护对象 |
| 南方海獭（Enhydra lutris nereis） | 1–6，海面休息时可成筏 | 全年，日间 | 在海藻床内仰浮，限远景 | 近距离可能咬伤 | 观景／保护对象 |
| 港海豹（Phoca vitulina） | 1–10，滩上小群 | 全年，随条件变化 | 退潮时在岩滩卧休，回水游走 | 可咬伤 | 观景／保护对象 |
| 家马（Equus caballus） | 1–8，牧场群或有人管理的小队 | 全年，日间 | 在围栏内放牧或沿骑乘牧道行进 | 可踢咬 | 家养 |
| 家鸭（Anas platyrhynchos domesticus） | 3–16，沿田界成小群 | 全年，日间 | 在水田浅水觅食，田埂间列队 | 通常回避人 | 家养 |

## 鱼与水体

水清、距离近时才需要画鱼身；急流浑水可以只留水纹。下表的窗口指表现游动或近岸活动的季节，水体有鱼记录才启用。[Denali 清溪与冰川浑水](https://home.nps.gov/dena/planyourvisit/fishing.htm) · [优胜美地高湖历史放流](https://www.nps.gov/yose/learn/nature/fish.htm) · [奥特韦水体逐项记录](https://vfa.vic.gov.au/recreational-fishing/fishing-locations/inland-angling-guide/areas/otway/otway-angling-waters)

| 鱼 | 水体与限制 | 当地季节／时段 | 利用 |
|---|---|---|---|
| 虹鳟（Oncorhynchus mykiss） | 河溪，Merced、Tuolumne 已记录的冷水河段，急流后的深槽 | 4–10月，晨昏 | 区域渔业对象 |
| 引入的鳟类（Oncorhynchus / Salvelinus spp.） | 湖泊，仅已有放流/鱼类记录的高山湖；部分天然无鱼 | 6–9月，晨昏 | 区域渔业对象 |
| 奇努克鲑（Oncorhynchus tshawytscha） | 河溪，Eel River 秋冬有洄游；需河海连通 | 10–1月，随条件变化 | 区域渔业对象 |
| 硬头型虹鳟（Oncorhynchus mykiss） | 河溪，沿岸有通海路径的常流溪，冬雨后水量较大 | 11–3月，随条件变化 | 区域渔业对象 |
| 太平洋岩鱼类（Sebastes spp.） | 近海，近岸礁和海藻林，物种待当地调查 | 全年，日间 | 区域渔业对象 |
| 割喉鳟（Oncorhynchus clarkii complex） | 湖泊，经确认有鱼的落基山冷湖，部分水体恢复本地谱系 | 6–9月，晨昏 | 区域渔业对象 |
| 褐鳟（Salmo trutta） | 河溪，较宽冷凉河流，浅滩与深潭交替 | 4–10月，晨昏 | 区域渔业对象 |
| 宽唇亚口鱼（Catostomus latipinnis） | 河溪，科罗拉多河、格林河的主河道；台顶临时池不投放 | 4–10月，随条件变化 | 利用情况待核 |
| 溪红点鲑（Salvelinus fontinalis） | 河溪，阿巴拉契亚清凉支流；不能移入夏季温暖田沟 | 4–10月，晨昏 | 区域渔业对象 |
| 小口黑鲈（Micropterus dolomieu） | 河溪，仙纳度谷内温暖大河 | 5–9月，晨昏 | 区域渔业对象 |
| 北极茴鱼（Thymallus arcticus） | 河溪，清澈支流而非高浑浊冰川水 | 6–9月，日间 | 区域渔业对象 |
| 北极红点鲑（Salvelinus alpinus） | 湖泊，有连通与调查记录的北坡冷湖 | 6–9月，随条件变化 | 区域渔业对象 |
| 花羔红点鲑（Salvelinus malma） | 河溪，已记录的北坡深槽与通海水道 | 7–9月，随条件变化 | 区域渔业对象 |
| 欧洲褐鳟类群（Salmo trutta complex） | 河溪，有常流的阿尔卑斯冷溪，地方谱系不可随意互换 | 4–10月，晨昏 | 区域渔业对象 |
| 高山红点鲑类（Salvelinus spp.） | 湖泊，仅有红点鲑记录的欧洲冷水山湖；不同山系分别核对物种 | 6–9月，晨昏 | 区域渔业对象 |
| 大西洋鳕（Gadus morhua） | 峡湾，咸水峡湾岩底，淡水融雪池不适用 | 全年，随条件变化 | 区域渔业对象 |
| 海鳟（Salmo trutta） | 河口，峡湾与河口连通地带 | 4–10月，随条件变化 | 区域渔业对象 |
| 金头鲷（Sparus aurata） | 近海，地中海岩岸旁沙底海湾 | 4–11月，日间 | 区域渔业对象 |
| 鲤（Cyprinus carpio） | 养殖稻田，养鱼稻田、鱼沟与鱼坑；人工水管理 | 5–10月，日间 | 养殖 |
| 养殖罗非鱼类（Oreochromis spp.） | 养殖稻田，伊富高已利用的田间鱼坑或连通池；鱼坑可在收割后保水 | 全年，日间 | 养殖 |
| 鲤科鱼类（Cyprinidae） | 河溪，桂北常流水河段，对单个点位保留到科 | 4–10月，日间 | 区域渔业对象 |
| 非洲尖齿胡鲶（Clarias gariepinus） | 河溪，萨比河缓潭与连通水池，低光活动 | 全年，夜间 | 区域渔业对象 |
| 莫桑比克口孵非鲫（Oreochromis mossambicus） | 河溪，低地暖水河岸缓水 | 9–4月，日间 | 区域渔业对象 |
| 开普海鲷类（Pachymetopon blochii） | 近海，藻林与沿岸礁体 | 全年，日间 | 区域渔业对象 |
| 黄眼鲻（Aldrichetta forsteri） | 河口，维州河口浅滩与咸淡水交汇 | 全年，日间 | 区域渔业对象 |
| 澳洲鲑属鱼类（Arripis spp.） | 近海，开阔冲浪岸；与鲑科不同 | 全年，日间 | 区域渔业对象 |
| 澳洲短鳍鳗（Anguilla australis） | 河溪，有通海路径的温带溪流、深潭 | 10–4月，夜间 | 区域渔业对象 |
| 褐鳟（Salmo trutta） | 河溪，埃格林顿常流段；在南岛属引入种 | 10–4月，晨昏 | 区域渔业对象 |
| 引入虹鳟（Oncorhynchus mykiss） | 湖泊，有放流记录的大湖如 Te Anau | 10–4月，晨昏 | 区域渔业对象 |
| 新西兰蓝鳕（Parapercis colias） | 峡湾，峡湾岩礁底；保护区仅作观景 | 全年，日间 | 区域渔业对象 |
| 丛林汤鲤（Kuhlia rupestris） | 河溪，低地雨林的连海清溪 | 全年，日间 | 区域渔业对象 |
| 尖吻鲈（Lates calcarifer） | 河口，丹翠潮河与红树水道 | 10–4月，晨昏 | 区域渔业对象 |
| 引入褐鳟（Salmo trutta） | 河溪，有连通冷水的巴塔哥尼亚河段 | 11–4月，晨昏 | 区域渔业对象 |
| 引入虹鳟（Oncorhynchus mykiss） | 湖泊，有调查记录的冰川湖近岸 | 11–4月，晨昏 | 区域渔业对象 |

## 农田和果园

多年生果园只列采收，牧草的“播”是补播窗口。水稻因村寨、海拔、种源和单双季制度而变；两次不同的稻季应由农事日历驱动。[FAO 伊富高系统](https://www.fao.org/giahs/giahs-around-the-world/philippines-ifugao-rice-terraces-system/en) · [哈尼梯田](https://whc.unesco.org/en/list/1111) · [USDA 播收历](https://www.nass.usda.gov/Statistics_by_State/Colorado/Publications/Annual_Statistical_Bulletin/Bulletin2024.pdf) · [阿马尔菲柠檬资料](https://www.qualigeo.eu/prodotto-qualigeo/limone-costa-damalfi-igp/)

| 农产 | 地块 | 播／栽 | 收获 | 车窗外观 |
|---|---|---|---|---|
| 牧草干草 | 多年生牧地与割草场 | 3–5月 | 6–9月 | 青绿连续草面，刈后留条带、草卷；春播仅用于补播 |
| 冬小麦 | 北美平原耕田 | 9–10月 | 6–8月 | 秋出细苗，夏季金黄短穗，收后留浅茬 |
| 玉米 | 仙纳度河谷农场 | 4–5月 | 9–11月 | 等行深绿高秆、秋季褐穗，饲料青贮可提前 |
| 苹果 | 南蒂罗尔灌溉果园 | 多年生 | 8–11月 | 多年生矮冠支架列，春白粉花，秋果成行 |
| 苹果 | 西挪威峡湾果园 | 多年生 | 8–10月 | 避风河阶低果树与行间草，晚春白花 |
| 甜樱桃 | 挪威向阳果田 | 多年生 | 7–8月 | 整枝果冠、初夏珠形果，背阴高地没有 |
| 马铃薯 | Lærdal 谷底田块 | 4–6月 | 8–10月 | 长直垄和浅绿矮冠，秋挖后露棕土 |
| 阿马尔菲柠檬 | 崖边梯园 | 多年生 | 2–10月 | 多年生低棚架与石挡墙，黄果藏于浓绿冠间 |
| 油橄榄 | 意大利向阳坡梯田 | 多年生 | 10–12月 | 多年生银灰小冠，坡地不连续 |
| 甜栗 | 意大利山地果林 | 多年生 | 9–11月 | 多年生树干，秋天地上栗苞；经营果林与薪炭萌生林分开 |
| 哈尼红米 | 云南季风梯田 | 4–6月 | 9–10月 | 春季整田插秧，夏季整片变绿，秋收后部分田蓄水 |
| 伊富高传统一期稻 | 吕宋高地梯田 | 12–3月 | 6–8月 | 冬季育苗或插秧，初夏渐金，传统品种和村落作历有差异 |
| 华南水稻 | 桂北灌溉田 | 3–5月 | 7–10月 | 一期或双季依村地而定，此窗只作首季播种与各地成熟范围 |
| 油菜 | 桂北冬季轮作田 | 10–11月 | 3–5月 | 稻茬后播种，早春黄色齐开，成熟成细角果 |
| 冷凉季牧草 | 澳洲南部或巴塔哥尼亚已耕牧地 | 3–5月 | 11–2月 | 多年生草地按需补播；初夏刈割留浅条纹，年际灵活 |
| 甘薯 | 伊富高村边坡耕地 | 4–8月 | 8–12月 | 匍匐藤覆盖旱垄；各村可分批栽种，勿种进蓄水稻田 |
| 高台牧草 | 阿杰罗拉刈草与奶牛牧场 | 3–5月 | 5–9月 | 多年草地春季补播，夏季分批刈割，干草堆近村 |

## 野食及有毒混淆项

本表为美术与目录映射资料。颜色、气味、帽形和简化模型都不能鉴别现实中的可食物种。已知混淆例如熊葱与秋水仙、甜栗与七叶树、葡萄与商陆、真羊肚菌与假羊肚菌。未给出相似物的条目仍须核定种，空缺不代表无毒风险。[ANSES 误采记录](https://vigilanses.anses.fr/sites/default/files/VigilAnsesN20_November2023_Autumncrocus.pdf) · [栗实误捡](https://vigilanses.anses.fr/sites/default/files/VigilAnsesN8_Confusionplants.pdf) · [商陆与葡萄](https://www.poison.org/articles/pokeberries-and-grapes-look-alike) · [毒物中心的野菌说明](https://www.poison.org/articles/wild-mushroom-warning)

| 野食候选 | 已有 ID／缺项 | 当地季节和生境 | 分类或毒性边界 |
|---|---|---|---|
| 栎实（Quercus spp.） | 缺专项 | 9–11月，温带栎林成熟果实 | 传统利用通常需要处理；只标种属明确的栎树 |
| 常绿越橘（Vaccinium ovatum） | 缺专项 | 8–11月，加州海岸林缘湿灌丛 | 保留叶、果、灌木物种身份，不能把任意紫果当越橘 |
| 欧洲越橘（Vaccinium myrtillus） | 缺专项 | 7–9月，欧洲山地酸性林下 | 游戏 blueberry 只可作形态近似 |
| 阿拉斯加笃斯越橘（Vaccinium uliginosum） | `blueberry` | 7–9月，北方湿酸灌丛 | 北美类叶升麻 Actaea rubra 果不可食，颜色不能判定 |
| 云莓（Rubus chamaemorus） | `cloudberry` | 7–9月，寒凉泥炭洼地 | 低海拔热湿稻田排除 |
| 越橘红果（Vaccinium vitis-idaea） | 缺专项 | 8–10月，北方疏林与苔原土丘 | 不同于蔓越莓；不可把同色毒果并入 |
| 矮松松子（Pinus edulis） | `pine_nut` | 9–10月，美国西南矮松成熟球果 | 不是任意针叶树都会出同样可食种仁 |
| 仙人掌梨果（Opuntia spp.） | `cactus_fruit` | 7–9月，索诺兰或西南背风干坡 | 只给扁平茎节的仙人掌梨；巨柱果实另列 |
| 巨柱仙人掌果（Carnegiea gigantea） | 缺专项 | 6–7月，索诺兰巨柱冠端 | 与仙人掌梨分物种、结实部位与文化采收情境 |
| 牧豆树荚（Prosopis / Neltuma spp.） | 缺专项 | 6–8月，索诺兰干河沟及冲积扇 | 只绑定地方牧豆树；其他豆荚不可泛用 |
| 黑莓类（Rubus spp.） | `wild_berry` | 7–9月，北半球温带林缘或旧田界 | 美洲商陆果有毒；不可用浆果颜色识别 |
| 引入黑莓（Rubus fruticosus agg.） | `wild_berry` | 1–3月，南半球温带扰动边缘 | 新西兰 tutu 有毒；保护地及喷药路段不设采集 |
| 野蔷薇果（Rosa spp.） | `rose_hip` | 8–10月，北温带林缘和田篱 | 只绑定已确认蔷薇株 |
| 欧洲甜栗（Castanea sativa） | `chestnut` | 9–11月，栗林与旧果园 | 有毒七叶树果常被误捡，勿用简化外观判断 |
| 美洲黑核桃（Juglans nigra） | `walnut` | 9–10月，美东肥沃低地、农田边树 | 不可笼统赋给所有中高海拔森林 |
| 羊肚菌类（Morchella spp.） | `morel` | 4–6月，有当地记录的温带春季林地 | 鹿花菌等假羊肚菌可致中毒；游戏外形不能鉴别 |
| 美味牛肝菌复合群（Boletus edulis complex） | `porcini` | 7–10月，有宿主松、云杉或阔叶的欧洲林地 | 牛肝菌类含有毒种；不能把管孔作为可食判据 |
| 欧洲熊葱（Allium ursinum） | `wild_garlic` | 3–5月，欧洲阴湿落叶林 | 秋水仙或铃兰可误采；气味不能单独保证安全 |
| 食用竹种嫩笋（Bambusoideae） | `bamboo_shoot` | 3–6月，东亚村旁明确栽培竹丛 | 物种与处理要求不同，生笋不能作为通用即食物 |
| 荠菜（Capsella bursa-pastoris） | `shepherds_purse` | 2–4月，东亚温和季节的农田边 | 路边杂草图标不承担鉴别 |
| 马鲁拉果（Sclerocarya birrea） | 缺专项 | 1–3月，南非低地稀树草原成树下 | 结果母树与成熟季限定；与欧洲核果分开 |
| 开普食用番杏果（Carpobrotus edulis） | 缺专项 | 1–5月，开普沙丘、海岸硬叶灌丛边 | 只列已确认种的果实 |
| 卡拉法特小檗果（Berberis microphylla） | 缺专项 | 12–3月，巴塔哥尼亚林缘避风灌丛 | 只绑定已确认小檗；不以紫黑色替代物种鉴定 |
| 巨藻（Macrocystis pyrifera） | `kelp` | 全年，太平洋加州岩岸藻林 | 水质与保护范围另核；上岸腐烂海藻不作食物 |
| 澳洲原生悬钩子（Rubus parvifolius） | 缺专项 | 12–3月，澳洲东南部湿林缘 | 不能给丹翠所有红色林果套用同一资产 |
| 桤叶唐棣果（Amelanchier alnifolia） | 缺专项 | 7–9月，北美山地林缘 | 林果需锁定物种，不能只按紫色外观 |
| 欧洲榛子（Corylus avellana） | 缺专项 | 8–10月，欧洲低山次生林与田篱 | 仅成熟坚果，榛灌与其他灌丛不等价 |

## 初次审计时的 80 种采集物

从 [FORAGE_KINDS](../../../src/core/v3/forage/kinds.ts) 枚举 80 行，再按核心已注册地区和 [FLORA 表](../../../src/core/world/floraTables.ts) 展开 `floraTableOf` 的树、灌、地被，读取 [植物](../../../src/core/world/plants.ts) 的 `bears.forage`。下表记录修订前核心规则能够引用的地区；概率、冠层、水体等条件仍会进一步筛掉候选，未注册的预留地区名不在此表内。它与新建的 54 个生态档案是两套键。已核到的明确风险包括盐岸规则没有盐度门槛、`wild_rice` 混用栽培稻、`cordyceps` 与 `snow_lotus` 被泛高山条件放大。海带虽挂在 `lakes` 表，实际 strand 有 SEA 掩码，不能据表名断言淡水湖里已生成海带。[水体与采集生境规则](../../../src/core/world/floraForage.ts)

| 已有物品 | 当前承载地区 | 复核结论／使用边界 |
|---|---|---|
| 牛肝菌（`porcini`） | alpine、forest、maple | 限有本地宿主树的森林，禁裸露垭口 |
| 鸡油菌（`chanterelle`） | plains、forest、maple | 需本地鸡油菌种群与宿主；草场中央不合适 |
| 松茸（`matsutake`） | alpine、forest | 同名复合群跨洲分种，年老松林不能单独证明有松茸 |
| 羊肚菌（`morel`） | plains、maple、flower_fields | 现有雨后条件应叠春季与林缘历史 |
| 松露（`truffle`） | plains、forest、maple | 黑松露偏特定宿主和土壤，普通湿平原阔叶林过宽 |
| 灵芝（`reishi`） | forest、bamboo_sea、karst_peaks | 药用记录；不列道路普通即食菌 |
| 平菇（`oyster_mushroom`） | forest、lakes、maple、wetland、bamboo_sea | 木腐基质优先，不能只检查地面湿度 |
| 猴头菇（`lions_mane`） | forest、maple | 老阔叶干和枯木；需宿主检测 |
| 竹荪（`bamboo_fungus`） | terraces、bamboo_sea | 高温高湿与本地记录；并非所有稻梯田 |
| 夜光菇（`glow_mushroom`） | forest、bamboo_sea | 发光不是可食属性；留作幻想或观景，食物映射关闭 |
| 毒蝇伞（`fly_agaric`） | plains、alpine、forest、maple | 有毒；与鸡油菌作为双胞胎是游戏设定 |
| 鹅膏（`death_cap`） | plains、forest、lakes、maple | 有毒；与平菇绑定不是现实鉴别；致命鹅膏不要作为补充食物 |
| 野莓（`wild_berry`） | plains、lakes | 可映射已确认 Rubus 属当地种，不能代表全部红果 |
| 蓝莓（`blueberry`） | alpine、forest | 现有冷林条目可容纳本地越橘；欧洲越橘建议保留独立分类 |
| 蔓越莓（`cranberry`） | lakes、wetland | 只在适宜酸性泥炭湿地；普通湖滨并不充分 |
| 云莓（`cloudberry`） | alpine | 北方泥炭洼地；不能泛放热带高山或阿尔卑斯所有山口 |
| 野葡萄（`wild_grape`） | maple、karst_peaks | 指定本地 Vitis 与成熟季；商陆紫果有毒 |
| 野番茄（`wild_tomato`） | plains、terraces | 旧菜圃逸生，不给野生山林或全部梯田 |
| 野苹果（`wild_apple`） | plains、flower_fields | 旧果园实生树可用；生产果园与野生采集区分开 |
| 柿子（`persimmon`） | maple、terraces | 指定美洲柿或亚洲栽培柿，不能互换 |
| 樱桃（`cherry`） | flower_fields | 峡湾果园有实据，flower_fields 单入口遗漏人工果园 |
| 仙人掌果（`cactus_fruit`） | desert、red_canyon | 仙人掌梨正确；与巨柱仙人掌果须分开 |
| 沙棘（`sea_buckthorn`） | red_canyon | 旧红峡谷条目不能迁到犹他红砂岩；当地自然群落缺证 |
| 猴面包果（`baobab_fruit`） | 核心表未命中 | 已登记；当前核心表未见可达承载植物规则。Lower Sabie 的营地个体不代表整片稀树草原 |
| 蒲公英（`dandelion`） | plains、lakes、maple、flower_fields、terraces | 限已确认种与受扰草地；不铺原生苔原 |
| 荠菜（`shepherds_purse`） | plains、flower_fields、terraces、karst_peaks | 温凉季田边；桂北水稻田埂可用 |
| 蕨菜（`fiddlehead`） | forest、maple、terraces、bamboo_sea、karst_peaks | 必须定到可食当地种；树蕨和所有卷叶蕨并非通用食材 |
| 野葱（`wild_scallion`） | plains、lakes、maple、karst_peaks | 定到当地葱属；不得以草叶形判定可食 |
| 水芹（`watercress`） | plains、forest、lakes、wetland、karst_peaks | 中名水芹和英文 watercress 通常指不同科的植物，先分清 Oenanthe javanica 与 Nasturtium officinale |
| 马齿苋（`purslane`） | plains、desert、terraces、red_canyon | 暖季农田扰动地较合适；不要铺满无水红岩 |
| 荨麻（`nettle`） | plains、forest、lakes、maple、wetland | 耕地边、湿林缘；只绑定当地确认种 |
| 竹笋（`bamboo_shoot`） | terraces、bamboo_sea、karst_peaks | 限已核食用竹和处理条件；稻田没有竹丛就不出笋 |
| 海蓬子（`samphire`） | lakes | saltShore 缺水体种类/盐度门槛，淡水湖岸有误放风险 |
| 苔原地衣（`reindeer_moss`） | alpine | 地衣先作驯鹿食源和地被，不能通用归为人食野菜 |
| 野山药（`wild_yam`） | bamboo_sea、karst_peaks | 不同薯蓣属种的可食性不同；只凭喀斯特基质不足 |
| 莲藕（`lotus_root`） | lakes、terraces、wetland | 真实莲塘或栽培浅水种植带；寒冷山湖不放莲藕 |
| 牛蒡（`burdock`） | plains、forest、lakes、maple、wetland | 受扰肥沃土与村缘；避开高山原生林 |
| 土豆（`potato`） | plains、flower_fields、terraces | 已有目录；绑定耕地或旧菜园，Lærdal 是明确产地 |
| 人参（`ginseng`） | alpine、forest、maple | 美国参和亚洲参需分种。仅按 alpine 标签可误置到雪线碎石 |
| 龙舌兰芯（`agave_heart`） | desert、red_canyon | 美洲暖干坡具局部依据；不是每条红岩公路的野生粮食 |
| 香菜（`coriander`） | terraces、karst_peaks | 园圃栽培，天然石峰顶不放 |
| 薄荷（`mint`） | plains、alpine、forest、lakes、wetland、bamboo_sea | 定当地薄荷属与湿岸；干燥高山面不通用 |
| 鼠尾草（`sage`） | desert、red_canyon | 荒漠蒿属 sagebrush 与可食鼠尾草 Salvia 不同 |
| 野蒜（`wild_garlic`） | plains、forest、maple、bamboo_sea | 欧洲熊葱在湿林；竹海不因阴湿就有同一种。秋水仙、铃兰为风险 |
| 花椒（`sichuan_pepper`） | terraces、karst_peaks | 确认花椒属种与栽培点，峰林不自动等同花椒园 |
| 辣椒（`chili`） | desert、terraces、karst_peaks | 村宅菜园或弃耕地；天然荒漠空地排除 |
| 紫苏（`perilla`） | terraces、bamboo_sea | 栽培与逸生带；不是全部梯田之野菜 |
| 百里香（`thyme`） | plains、desert、maple、red_canyon、karst_peaks | 欧亚百里香不该按红岩自动出现在美国西南 |
| 松针（`pine_needle`） | alpine、forest、red_canyon | 资源与物种需区分；不能用 conifer 家族决定食用 |
| 栗子（`chestnut`） | maple | 本次新增真实意大利栗林对照，原 maple 标签过窄 |
| 核桃（`walnut`） | maple | 仙纳度田边可有黑核桃；需可见成树才掉果 |
| 松子（`pine_nut`） | alpine、forest、red_canyon | 科罗拉多高原矮松球果有据；高山冷杉/云杉不应产松子 |
| 野稻（`wild_rice`） | terraces、wetland、karst_peaks | 北美商品 wild rice 常指 Zizania，云南和吕宋稻田作物是 Oryza sativa，不能直接代替 |
| 葵花籽（`sunflower_seed`） | flower_fields | 农田或已确认的野生向日葵种，普通花田不充足 |
| 高粱（`sorghum`） | desert | 旱作粮田限定；低地国家公园自然高草不是种植高粱 |
| 洋甘菊（`chamomile`） | plains、lakes、flower_fields | 需确认为药用洋甘菊等具体种，不能从任意白菊取 |
| 茉莉（`jasmine`） | flower_fields | 栽培花用种与庭园；避免把所有香白花做茶 |
| 野菊（`wild_chrysanthemum`） | plains、maple、terraces、karst_peaks | 只留本地明确物种与花期 |
| 玫瑰果（`rose_hip`） | plains、maple、flower_fields | 真蔷薇株结果后可对应；不得泛指红浆果 |
| 茶叶（`tea_leaf`） | terraces、bamboo_sea、karst_peaks | 茶园与野茶树分开，水稻梯田、竹林并不必然产茶 |
| 艾草（`mugwort`） | plains、lakes、maple、terraces、wetland | 蒿属种与传统用途各异，不作普遍食材 |
| 金盏花（`calendula`） | plains、flower_fields、terraces | 欧洲栽培或逸生；原生花甸无凭据 |
| 雪莲（`snow_lotus`） | alpine | 泛 alpine 可能误放至落基山、南岛或阿尔卑斯；地域未覆盖，禁套用 |
| 冬虫夏草（`cordyceps`） | alpine | 高山草甸不能代替青藏高原虫草的专性宿主与分布 |
| 紫锥菊（`echinacea`） | plains、flower_fields | 北美原生与栽培记录分开，全球花田不通用 |
| 海带（`kelp`） | lakes | strand 当前限定海水。lakes 标签并不证明淡水生海带；仍需岩岸与区域藻种 |
| 蛤蜊（`clam`） | lakes | 当前 strand 限海水；蛤与淡水蚌不能用同一物种 |
| 贻贝（`mussel`） | lakes | 当前 seaRock 限海水；若加淡水蚌应另列 |
| 螃蟹（`crab`） | lakes | 当前 strand 限海水；稻田蟹需独立淡水种与养殖记录 |
| 菱角（`water_chestnut`） | lakes、wetland | 旧图鉴描述有角的菱属水生果实（Trapa）。英文应为 water caltrop。荸荠（Eleocharis dulcis）是莎草科球茎，另属另一种作物 |
| 燧石（`flint`） | desert、alpine、maple、red_canyon | 矿材；基岩成分与沉积搬运控制燧石 |
| 黏土（`clay`） | plains、lakes、terraces、wetland、red_canyon、karst_peaks | 矿材；河岸有细粒沉积才生成 |
| 盐（`salt`） | desert、lakes | 盐度与闭流蒸发条件需要显式筛选，普通淡水岸不生成 |
| 松脂（`resin`） | alpine、forest | 树脂资源；仅相应产脂宿主 |
| 蜂蜡与蜂蜜（`honeycomb`） | plains、flower_fields | 野生蜂巢或养蜂场；开花并不代表每处有巢 |
| 芦苇（`reed`） | plains、desert、forest、lakes、flower_fields、terraces、wetland、bamboo_sea、red_canyon、karst_peaks | 水缘材料；不同地区芦苇种群与水文条件待核 |
| 竹子（`bamboo_cane`） | terraces、bamboo_sea、karst_peaks | 竹材；须有实际竹丛 |
| 纤维草（`fibre_grass`） | plains、desert、red_canyon | 资源标签；按区域指定纤维植物 |
| 硫磺（`sulphur`） | desert | 荒漠岩坡并不自动有自然硫，应限特定地质作用 |
| 硝石（`saltpetre`） | red_canyon、karst_peaks | 需硝盐形成条件，普通石灰峰和红崖不足 |

## 采集表修订后

54 个档案按地点记录向植物表提供宿主与物品，已实装的 12 个地区沿用路线对照。原有 80 个物品 ID 和索引保留，新增的 9 个物品排在其后。稻谷沿用存档键 `wild_rice`，物品和对应菜名均指亚洲栽培稻（Oryza sativa）。菱角保留旧物品的带角果实造型，豆瓣菜采用 Nasturtium officinale。荸荠资料见[香港湿地公园](https://www.wetlandpark.gov.hk/en/biodiversity/beauty-of-wetlands/wildlife/eleocharis-dulcis)。

天山雪莲与冬虫夏草只保留旧物品，54 个档案均不生成。裸露高山不继承云莓、地衣食物或泛松子。沙漠蒿丛和普通蕨丛各自保留植被身份。木腐菌、特殊地质资源、未核实药草和果园物品须有相应产地或基质记录才可恢复。加州南瓜灯菇与鸡油菌有真实的混淆记录，其旧物品保留中毒效果；当前路线没有已核实的木生采集点。[加州大学橡树病虫图鉴](https://ucanr.edu/sites/default/files/2022-03/365212.pdf)

已有模型可承载橡实、常绿越橘、欧洲越橘、越橘红果、巨柱仙人掌果、卡拉法特小檗果、澳洲原生悬钩子、桤叶唐棣和欧洲榛子。仍需模型的三项为牧豆树及长豆荚、马鲁拉果树及圆果、贴地多肉的开普食用番杏及果实。蒂阿瑙湖滨有引入黑莓和豆瓣菜的实地清单，局部有水的道路边缘与开阔原生草甸各自取样。[蒂阿瑙湖岸植物名录](https://www.nzpcn.org.nz/publications/plant-lists/lists/te-anau-ed-lake-shores-and-islans-b9/)

表中的月份继续记录实地产期。游戏采集时钟提供时刻、雨后时长和潮位，暂不能逐月判定成熟。农田位置采用缓坡、近路、淡水浅滩等已有生境信号估算，缺少地块边界与土壤类型的精度。
