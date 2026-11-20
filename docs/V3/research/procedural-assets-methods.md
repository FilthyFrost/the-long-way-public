# 公路旁的一棵树怎样一眼认出来

**Painted Valley 程序化资产制作研究 · 游戏内生成与 Blender 脚本样片共用**

先做一棵成熟挪威云杉和一棵成熟西黄松。在驾驶位把两棵树关掉贴图、涂黑，云杉仍应读出尖梢和层层下垂的枝帘，西黄松应露出高干和分开的冠团。再开颜色、日照和风。若这时才分得清，优先回去改枝架。这个实验也适用于鱼的体形、鸟的翅尾、岩石的节理。**停车能认种，开车能认形，成林仍有完整的明暗**，是本项目样片的三个观察尺度。

项目已有四档树冠、暗芯与叶卡、冠图集、程序化地被和岩块。下文提出的几何、参数和镜头属于样片设计；引用游戏团队发言时单独标明。先沿用样板段的驾驶视角、15:30 与 18:48 双时段、1080p 与 60 帧目标，让两条制作路线面对同一道题。[美术规格](../../../specs/art/STYLE.md) · [公路样板段](../nodes/L-landscape.md) · [树冠图集](../../../src/game/scene/crowns/crownAtlas.ts) · [现有岩石形体](../../../src/game/scene/paintedStones.ts)

## 一、从动画背景到可绕行的场景

| 一手资料 | 作者实际公开了什么 | 可用于我们的判断 |
|---|---|---|
| [《原神》制作人 GDC 演讲](https://www.gdcvault.com/play/1027539/-Genshin-Impact-Crafting-an) | 动画风格的选择、美术支柱、角色与场景的设计流程 | 先把地区的剪影、色组和地标画成一张远景，再拆成部件。观察璃月时，先看隔着峡谷还能读到哪些山脊和树冠。 |
| [《异环》Hotta 与 Epic 的访谈](https://www.unrealengine.com/developer-interviews/crafting-the-urban-open-world-of-nte-neverness-to-everness-with-ue5-across-pc-playstation-5-and-mobile) | 团队以街区层次、昼夜照明和跨平台一致性为目标，并说明移动端如何组织批次和剔除。 | 同一辆车转过弯，树的亮面、车身的反光、落在路面的影子要属于同一个时刻。完成度也看运动中的连续性。 |
| [《幻塔》Hotta 与 Epic 的访谈](https://www.unrealengine.com/developer-interviews/tower-of-fantasy-leverages-unreal-engine-to-bring-open-world-action-to-mobile-pc-and-playstation?lang=en) | 镜都的材质设计同时服务两套视觉母题；团队为移动端分别管控面数、提交和内存。 | 一个地区可共用材质语言；一棵英雄树与一千棵林木要分别验证成本。 |
| [《旷野之息》任天堂 GDC 演讲](https://www.gdcvault.com/play/1024562/Change-and-Constant-Breaking-Conventions-with-The-Legend-of-Zelda-Breath-of-the-Wild) | 导演、美术总监与技术总监讲述开放世界设计。 | **画面观察**：轮廓清晰的树冠、随风成片运动的草和背光时仍能辨认的动物，是驾驶场景也能借用的层次。下文的 Unity 草是独立作者复现。 |
| [吉卜力《幽灵公主》官方剧照](https://www.ghibli.jp/works/mononoke/) | 成片中的森林、树干、岩面与雾。 | 用取色或灰度缩略图看：近景树干有局部断笔，远林经常只剩成片冷色；天空的亮缝也参与构图。 |

这些商业游戏的公开资料能支持美术方向与部分生产决策。下列球面法线、叶卡拼法、草叶和石面配方的证据来自有步骤图或实现的作者，不据成片反推某游戏的私有着色器。

### 叶片怎样合成一团明暗

1. **先画冠团与空隙。** 在侧面草图上定三类形状：能从数十米外看见的大冠团、连到粗枝的暗芯、能透出天空的缺口。沿暗芯表面放弧形叶簇卡；少数偏转、超出边界的叶簇打破轮廓。卡内几笔构成一束叶，相邻卡沿枝的生长方向排列。若绕行时出现一串交叉十字，增加冠团的纵深并错开卡的角度。[Kids With Sticks 的 UE4 树丛分解](https://kidswithsticks.com/creating-stylized-art-inspired-by-ghibli-using-unreal-engine-4/)
2. **分开几何朝向与受光朝向。** 每张卡依然朝不同方向撑出体积，受光法线从包住该叶团的光滑椭球取样。游戏内可求椭球隐式面的梯度；Blender 可从代理网格按最近面插值传递自定义角法线。多团大橡树分别取各团法线，再少量混入整冠方向。整棵只采一个球会抹平枝间暗缝。双面卡要分别看正反面、背对太阳绕半圈，排查背面法线意外翻转形成的黑卡。[作者的法线对照图](https://kidswithsticks.com/creating-stylized-art-inspired-by-ghibli-using-unreal-engine-4/) · [Blender Data Transfer](https://docs.blender.org/manual/en/3.0/modeling/modifiers/modify/data_transfer.html)
3. **先铺局部色，再按太阳方向选色阶。** 根部和团内保留冷暗底；侧光用中间色，最暖最亮的一档只在迎光的冠顶破开。明暗阈值留很窄的柔化带，太阳移动时色面能安静地滑过。背光薄叶用受光方向、视线和叶缘遮罩加少量暖透色，内芯继续遮挡。树皮和石头维持粗糙的大色面。项目的背景用色块边缘和空气透视分层，车与人物保留已有描线；给每片叶描黑线会在行车时结成黑网。[项目配色与后处理](../../../specs/art/STYLE.md) · [UE4 高度遮罩和动态光照实验](https://kidswithsticks.com/creating-stylized-art-inspired-by-ghibli-using-unreal-engine-4/)
4. **草、石与天空共用一个光源。** 草根接地面的笔触色，草尖接日光；岩面保留完整的冷阴面；云先设计迎光的硬边和大块带色底面，再给远层云降低对比。让一片低频云影跨过岩壁、草地和道路，检查色阶是否一起移动。近景笔触以世界或物体尺度固定，远处收掉高频；转动相机时画布纹理不应在树皮上游走。Blender 样片可沿表面分布宽笔触，把笔触方向顺着枝、岩层或坡向梳理；导出时只留下驾驶距离还能看见的笔触。[Blender Studio Brushstroke Tools 图例](https://studio.blender.org/tools/addons/brushstroke_tools) · [Unity 草根尖配色与风](https://danielilett.com/2021-08-24-tut5-17-stylised-grass/)

取天空样片时可把云群简化成一块平底、几处凸起的体积，再把受光面合并为两三块大形。先从驾驶位评估云缘和山脊的明度差，再决定是否值得保留体积。Blender 教程可对照建形，Unreal Fest 演示可对照整景风格化的结果。[Blender 程序化吉卜力云](https://www.youtube.com/watch?v=jA1xNUIiPgg) · [Unreal Fest 的 UEFN 风格化演示](https://dev.epicgames.com/community/learning/talks-and-demos/W7LR/unreal-engine-fortnite-stylization-in-uefn-unreal-fest-2023)

## 二、按物种生成树，而后生成林

**同一物种表驱动两种建模工具。** 对每种植物先选真实地区和生长阶段，收一张全株侧影、一张冬季枝架或裸干、一张叶序与末梢近照。记录高宽比、最低活枝的相对高度、主轴数、枝轮间距、枝条出干角与末端走向、冠内透空、树皮的大色差。每项分“识别所必需”和“可随种子变动”。例如幼松也可能是尖塔；成熟、孤生的松和林内受挤的同种松应当是两套有联系的生长条件。程序每次抽一组相互兼容的参数，保留种子与年龄，供叶盛、落叶和 LOD 共用。[Weber–Penn 参数树原文](https://doi.org/10.1145/218380.218427) · [位置对植物器官形态的控制](https://www.algorithmicbotany.org/papers/positional.sig2001.html)

| 方法 | 具体步骤与适用资产 | 失败征象与修正 |
|---|---|---|
| Weber–Penn 分级参数 | 父枝曲线按弧长放子枝；按级别及在父枝上的位置控制长度、半径、锥度、旋转角、下弯和分叉。以冠形包络限制长度。适合有明显主导梢和枝层的针叶树。游戏内沿曲线扫截面；Blender 用曲线半径、锥度和实例化末梢，Sapling 有现成的参数范例。 | 每级都抽独立角度容易长成海胆。先锁骨干，末级再加较小扰动；顶端优势越强，侧轴越短、主轴越连续。[论文图版](https://courses.cs.duke.edu/cps124/fall01/resources/p119-weber.pdf) · [Sapling 手册](https://docs.blender.org/manual/en/3.4/addons/add_curve/sapling.html) |
| 空间占据法（space colonization） | 在目标冠体内布吸引点，每个点归给影响半径内最近的枝节点。节点沿所属点的单位方向之和长一节，移除已接近新枝的点，再迭代。圆冠与偏冠老树可先手定几根粗枝，再让细枝填各自的冠团。 | 均匀实心椭球容易填光所有天窗。把冠团间的缺口留成无吸引点区域；比较步长、影响半径、移除半径与冠宽的比例。无有效点或达到枝数上限就停止。[Runions 等，算法及实例](https://algorithmicbotany.org/papers/colonization.egwnp2007.pdf) |
| 参数 L 系统 | 用“芽→带节间的轴＋侧芽”反复重写，解释器用栈回到分叉位置；随枝序、年龄和轴上位置改变长度与分叉。对生芽成对、互生芽交替、轮生芽成圈，旋转次序可检查。适合重复羽片、花序和规则枝轮。 | 固定递归深度会造出比例完全相同的分形。保留顶芽，限制侧芽成活率、终止年龄和生长空间；按物种设置叶序，向日葵花盘的螺旋排布不通用于所有树。[《植物的算法之美》第一、四章](https://algorithmicbotany.org/papers/abop/abop.pdf) |
| 艺术家可控的父子生成器 | 分别编辑干、一级枝、枝端、叶团；把曲线的横轴定为父枝上的相对位置。借鉴 SpeedTree 生产方式，先比较少量可复用变体的主形，再填树皮或小枝。Blender 的局部改枝和代码侧的控制点覆盖都保留回到同一骨架的途径。 | 随机量调大并不能补救错误的枝序。一次只调一个有视觉意义的参数，输出相同视角的变体接触表。[Unity 团队的树木生产分解](https://unity.com/blog/industry/book-of-the-dead-photogrammetry-assets-trees-vfx) · [Blender 实例节点](https://docs.blender.org/manual/en/5.0/modeling/geometry_nodes/instances/instance_on_points.html) |

### 物种剪影表

下表以具体代表种校准家族。轮生是枝的排列描述；针叶怎样着生属于另一尺度。近景可补针束、球果和芽，远景应靠轮廓保住区别。角度先从当地侧照量，早春、积雪和林内枯枝另作状态。

| 代表种 | 首先生成的形 | 停车近看与容易画错的地方 |
|---|---|---|
| 挪威云杉 *Picea abies* | 贯穿冠顶的主轴，侧枝自下而上渐短，成熟树的细枝垂成帘，边缘有层间漏光 | 下垂球果仅放有果枝。把每层做成实心圆裙会抹掉枝端的垂向节奏。[俄州大图鉴](https://landscapeplants.oregonstate.edu/plants/picea-abies) |
| 白冷杉 *Abies concolor* | 保留清楚的塔形和由主轴伸出的水平枝台，枝面叠层；与云杉并列检查末梢方向 | 针叶偏灰蓝，有向上弯的轮廓；成树上部球果直立。青蓝调是近看辅助线索。[俄州大图鉴](https://landscapeplants.oregonstate.edu/plants/abies-concolor) |
| 西黄松 *Pinus ponderosa* | 成熟林木下部露干，上层刚劲大枝托起分开的针叶束团，空隙从外沿深入树冠 | 老树干的大块橙褐皮板，年轻树皮色较深。稀疏树顶仍应有明确的枝条承重。[俄州大图鉴](https://landscapeplants.oregonstate.edu/plants/pinus-ponderosa) |
| 白栎 *Quercus alba* | 空旷处粗干分出多根扭转的长骨架，宽而展开，团块和天窗尺度不一 | 低枝横展后再向上；林内可提高第一活枝。近景用圆裂片提示白栎。[北卡州大图鉴](https://plants.ces.ncsu.edu/plants/quercus-alba/) |
| 纸皮桦 *Betula papyrifera* | 纤长分出的轴支撑较轻的冠，单株或少干成簇；给天空留细缝 | 成干浅色、横向皮孔和局部剥离；幼干较深。缩小时保留干的明暗节奏。[北卡州大图鉴](https://plants.ces.ncsu.edu/plants/betula-papyrifera/) |
| 美洲山毛榉 *Fagus grandifolia* | 低处分出较长、平展的侧枝，枝端形成薄而连续的叶层，老树冠宽 | 光滑银灰干和细长尖芽在冬景仍可识别；皮面保留柔和的大调子。[北卡州大图鉴](https://plants.ces.ncsu.edu/plants/fagus-grandifolia/) |
| 糖枫 *Acer saccharum* | 幼年偏卵形，成熟冠扩展；末级按对生芽构造分叉 | 走近可见掌状裂叶，秋色按枝团成片变化。冬枝和夏季绿冠也要可读。[北卡州大图鉴](https://plants.ces.ncsu.edu/plants/acer-saccharum/) |
| 棕榈 | 羽叶型从顶芽放射出长弧叶轴，两侧排小叶；扇叶型先立长叶柄，末端撑开有放射折线的扇面 | 树不靠侧生木枝撑冠。侧拍时保留扇面裂隙或羽叶垂梢；枯叶裙随种与养护状态改变。[墨西哥扇棕图鉴](https://plants.ces.ncsu.edu/plants/washingtonia-robusta/) |
| 巨柱仙人掌 *Carnegiea gigantea* 与仙人掌属 *Opuntia* | 巨柱由纵肋圆柱和弯头托起的直立侧臂构成，幼株可无臂；仙人掌梨沿上节边缘长新扁掌，节与节的收窄点必须清楚 | 成熟果、花依附对应器官。远处留臂间天窗或扁掌叠接；把细刺收进亮边。两个属各用一套骨架。[索诺兰仙人掌实拍](https://home.nps.gov/sagu/learn/nature/cacti-and-desert-succulents.htm) |

### 从近树到远林

从同一骨架派生三级：近级留树干分叉、树冠深度、可穿视的缝；中级合并同枝叶簇、去掉亚像素细枝，以少数较大的卡保住外沿；远级烘焙树的方向图集。项目已有绕竖轴的冠图集着色路径，先在高架桥俯瞰、山道仰视时检查误差，再决定是否值得加俯仰角。八面体映射把观察方向铺到二维贴图，采相邻方向按权重混合；只会从地面以上观看时可选半球。遮罩、物体空间法线及可选深度一同烘焙，重建时转回实例朝向并用当前太阳着色。阴天与夕照切换可查出把固定太阳烤进底色的错误。[项目冠图集着色路径](../../../src/game/render/crownImpostor.ts) · [Epic Impostor Baker 的整球、半球及三帧混合](https://dev.epicgames.com/documentation/en-us/unreal-engine/impostor-baker-plugin-in-unreal-engine)

换级由**投影冠高**控制，进入与离开阈值错开，窄过渡区用互补抖动掩码分别保留旧、新几何的像素。两级必须共用树根、冠宽、季相与风相位。连拍驶近、驶离、横移三次，查双轮廓、光秃一帧、树根滑动以及影子跳档。图集卡片会增加片元开销，崎岖地形的近距离侧绕还会暴露错误视差，低多边形实体在这些镜头中往往更稳。[Epic 的替身视角分布与运行成本比较](https://dev.epicgames.com/documentation/en-us/unreal-engine/impostor-baker-plugin-in-unreal-engine)

## 三、一块岩石先要像当地的石头

**默认从少数有方向的大面开始。** 游戏内可取不规则凸包，沿选定的节理方向切去几角，在面内作低频位移，保留主要棱和接地面。让轮廓包含一个最大面和不同尺度的次面；每个三角形都给随机颜色会把地质结构打散。Blender 可用同一组切平面指导布尔和倒角，烘焙或赋顶点色时沿大面画冷暖。风化首先作用在凸棱，窄倒角只选一部分边；如果每条棱都发白，转到阴影里仍像金属折纸。Gen Amos 的分解有从大形到小形、苔面与地面衔接的过程，可用中性灰灯复核体块。[岩石作者分解](https://gamesartist.co.uk/stylized-rock-study/)

| 公路上看见什么 | 生成、着色和摆放 |
|---|---|
| 玄武岩柱崖 | 在共同断面上生成不规则多边形分区并沿冷却节理方向延伸，各柱错高，破断面处另放倒塌段。少量柱壁受暖侧光，其余并成冷灰面。近看有共享节理，远看有整面崖壁。[Devils Postpile 地质图](https://www.nps.gov/articles/nps-geodiversity-atlas-devils-postpile-national-monument-california.htm) |
| 犹他砂岩鳍、拱和层状碎块 | 长平行裂隙控制鳍的间距和方向，层理跨过同一出露面延续。复杂穿孔可用隐式体或有符号距离场（SDF），把拱洞从大岩体中减去再抽取表面，离线简化为可实例化网格。过强的平滑并集会把节理融化。原论文用体材料与隐式表面组合；这里的 SDF 切洞是项目实现选择。[Arches 国家公园地质](https://www.nps.gov/articles/nps-geodiversity-atlas-arches-national-park-utah.htm) · [Peytavie 等的岩拱与碎石生成](https://perso.liris.cnrs.fr/apeytavi/website/publication/hal-00463263/) |
| 花岗岩圆顶、坡脚崩积块与河卵石 | 圆顶保留大尺度剥离曲面；坡脚角砾按上方母岩方向断裂，部分埋入坡面。搬运磨圆的河床砾石另设较圆的轮廓和湿水线。色斑顺体面，烟灰、赭、蓝灰等色从地区岩谱取。[本项目公路地貌与岩谱](road-ecology.md) |
| 苔、地衣、雪帽 | 用世界向上的面法线、凹部、湿度、阴蔽与扰动合成苔斑；湿暖条件先过地区筛选。雪帽另读季节、海拔与背风积雪条件，受重力落在可承雪的面上，陡壁露出母岩。近景用极薄壳或边缘破碎的色面，远景只保留积雪大形。两块同形石转动后，层理随石转，积雪仍认世界向上。[岩石项目分解](https://gamesartist.co.uk/stylized-rock-study/) · [项目季节积雪](../../../src/game/render/seasonalSnow.ts) |

## 四、小植物和采集物要长在自己的位置

**器官 → 单株 → 斑块**三种尺度分别控制。近看能辨花冠和菌盖，路肩掠过时看得出植株高度、花序方向与斑块边缘，车道另一侧只需保留地表色块。以植株基点给整株一个相位，茎底固定，沿弧长增加摆幅；大风先过整片草坡，局部枝叶再有相位差。这样在逆光行车中仍能看见风场方向。[Deussen 等，生态分布与近似实例化](https://algorithmicbotany.org/papers/ecosys.sig98.html) · [《Crysis》团队的主弯曲与细部风动画](https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-16-vegetation-procedural-animation-and-shading-crysis)

| 类别 | 游戏内几何与 Blender 脚本可共用的构造 | 识别线索与取舍 |
|---|---|---|
| 灌木、可采浆果 | 从根颈放多根短主轴，各自拱出，用较扁的叶团遮住部分枝；果串按当地物种长在叶腋或枝端，留出能看见着生点的开口。 | 黑莓用长拱蔓与聚合果，越橘用木质矮枝和小圆果。停车距离才显示果粒分瓣。同一株由青果到成熟仅换果实状态。[区域采集与宿主](animals-crops.md) |
| 草、莎草、芦苇 | 草簇用根部收束、尖端弯曲的折带；莎草作有体量的基部和向外拱垂的叶束；芦苇另加高而有节的秆、侧生叶和顶生圆锥花序。片内共享根尖渐变，整簇随阵风弯。 | 岸边的高秆应穿出远处草面。按距离先删纤细穗毛，再合并整簇。Unity 教程的曲线、分段与风权重可借鉴，WebGL2 用预制折带实例，避开其几何着色器与曲面细分依赖。[Daniel Ilett 的 Unity 实现](https://danielilett.com/2021-08-24-tut5-17-stylised-grass/) · [《对马岛之魂》草地 GDC 视频](https://www.youtube.com/watch?v=Ibe1JBF5i5Y) |
| 花、花序 | 先分独花、头状花序、穗状花序。波斯菊从一个花托围出舌状花和对比强的盘心；直立花穗按轴从下到上分配间距、大小与朝向。密花盘可按螺旋排原基，只给外缘与近看部分保留独立几何。 | 并排比较野花的侧视高度和顶视花心。若十种花都成了同样的彩色星星，先修叶序、花梗和花序外形。[Prusinkiewicz 等，密集花序的生长图解](https://algorithmicbotany.org/papers/inflorescence.sig16.html) |
| 蕨 | 从根茎抽弯曲叶轴，两侧成列长羽片，按离基部距离控制羽片长度；先从照片辨单羽、二回羽状或整叶，幼叶另用卷曲的新轴。 | 保住整片蕨叶外轮廓和羽片的锯齿状空隙，远级合到一张裁形卡。树蕨还需独立树干和顶端放射冠。[L 系统器官生成图版](https://algorithmicbotany.org/papers/abop/abop.pdf) |
| 蘑菇与木生菌 | 菌柄用弯轴扫截面，菌盖用可不对称的径向剖面。牛肝菌保厚盖与管孔面，羊肚菌保蜂窝状凹坑与纵长轮廓，平菇用侧生扇盖在枯木上叠瓦。 | 停车近看再画盖底；模型着生位置和菌褶、管孔差异比换颜色更有效。采集状态与宿主来自地区数据，外观用作游戏辨识。[美国林务局大型真菌图谱](https://research.fs.usda.gov/treesearch/38089) · [Blender 菌类程序建模演示](https://www.youtube.com/watch?v=bEeqjZ9xWwE) |
| 仙人掌与多肉地被 | 巨柱沿骨架扫有纵肋的截面；扁掌沿边缘的刺座发新掌。匍匐多肉先铺贴地茎，节上对生肉质叶，花和果维持真实相对尺寸。 | 道路上巨柱靠臂、扁掌靠节；风只带动软组织和周围草，主柱应稳定。近景花果单独占一个清晰色块。[NPS 野外照片](https://home.nps.gov/sagu/learn/nature/cacti-and-desert-succulents.htm) |

**斑块的生成顺序。** 先以生态档案、海拔带、季节、水体类型和宿主排除不相容物种，再用同一片坡的湿度、坡向、冠层、扰动史决定候选斑块。斑内用带最小间距的采样抑制互穿，同时保留草丛根部、菌圈或克隆蔓生的局部聚集。种子取世界格坐标与物种 ID；相邻地块读同一批跨界斑块。最后才附着花果、叠风、换远级。生态掩码也管地表着色，否则删掉花模型后，远景仍会留下不该有的花色。[生态系统建模论文](https://algorithmicbotany.org/papers/ecosys.sig98.html) · [本项目的生态档案](../../../src/core/world/data/ecoProfiles.ts)

## 五、鸟、鱼、昆虫怎样在运动中认种

先把身体中轴、喙或吻部、翼尖或尾叉的比例做成侧面和顶面剪影，再绑定运动。驾驶窗里最先被看见的是运动方向、停顿与剪影，停车后才看得到细花纹。下列像素数是**样片分镜起点**，按实际画面量投影长度，无通用硬阈值：约 8 像素只判断运动类群；约 24 像素检查翅尾、背线或摆幅；约 80 像素再要求看清喙形、鳍位、翅斑等种级线索。在 8 像素的鱼影上承诺区分同属鱼种没有可靠依据。

| 类别 | 模型、材质和动画 | 留意镜头里什么会露馅 |
|---|---|---|
| 鸟 | 躯干取有胸深、背线和收细尾部的截面，肩、腕、翼尖分段并固定铰点。大蓝鹭用后伸长腿、折颈、宽翼和深而慢的拍击；家燕保留尖长翼、成鸟叉尾、急转与滑翔。单只巡航可用相位控制肩的拍击、腕的折叠、翼尖略滞后；起飞与落栖另做姿势。覆羽合成暖亮与冷暗两三片。 | 若整翼绕身体中心如螺旋桨旋转，转侧面就穿胸。低空燕与停在浅水里的鹭用不同的飞行与停栖空间。[康奈尔大蓝鹭照片与视频](https://www.allaboutbirds.org/guide/Great_Blue_Heron/id) · [家燕](https://www.allaboutbirds.org/guide/Barn_Swallow/id) |
| 鱼 | 以背高和腹线不同的截面沿中轴放样，保留吻部、尾柄收窄、尾鳍与背鳍位置。虹鳟近景加脂鳍、斑点与侧带；俯视时先保住背宽和尾形。摆尾用从前往后传播的横向波，头部权重很小，向尾柄递增；实例相位各异。胸鳍可小幅修正转向。 | 整条鱼左右刚体摇会像浮标。鱼头相对稳定；鱼群转弯先改朝向再加摆幅。河流、湖泊和海水用各自鱼表，并检查水面折射后还剩什么线索。[阿拉斯加渔猎部虹鳟图鉴](https://www.adfg.alaska.gov/static/education/wns/rainbow_trout.pdf) · [Godot 鱼群顶点动画图解](https://docs.godotengine.org/en/stable/tutorials/performance/vertex_animation/animating_thousands_of_fish.html) |
| 昆虫 | 蝴蝶以胸部为翼根，前后翅保持轮廓差异，翼尖容许弯曲，闭合与张开有节奏差。蜻蜓突出长腹和两对窄翼，飞行用悬停、短冲和停栖；蜂类强调厚胸、访花降落与折返。萤火虫的夜景重点是局部闪烁，近处才补身体。不同种、性别和行为的闪光有差异，强度不能全场同步。 | 远处翅膀亚像素高速翻转会闪白。先合并透明翼的细脉和高频高光，再保留飞行轨迹与间歇。蝴蝶起飞参考高速影片中的柔性翅形，动作幅度与频率应取目标物种而非套用别种。[蝶翼拍合实验与高速视频附件](https://pmc.ncbi.nlm.nih.gov/articles/PMC7879755/) · [样板地区的昆虫时段](road-ecology.md) |

**解析形变与 VAT 的分工。** 持续滑翔、摆尾和驻足扇翅这类低自由度动作，实例共享网格，在顶点属性保存部位、沿轴权重或转轴，实例只传相位、速率、朝向。复杂落栖或蝶翼折皱可由 Blender 脚本驱动少量骨骼，逐帧把固定拓扑的顶点偏移和必要的法线烘成 VAT（顶点动画纹理）；顶点身份和帧序必须跨导出保持一致，用专用查表坐标，数值纹理走线性数据路径，循环边界和阴影通道应用同一变形。例：512 顶点 × 32 帧 × 8 字节的 RGBA16F 位置纹理为 128 KiB，若另用相同格式存法线则翻倍，未计对齐或填充。大量实例共享这份贴图；不同拓扑各自算内存。[SideFX VAT 文档](https://www.sidefx.com/docs/houdini/nodes/out/labs--vertex_animation_textures-3.0.html)

**群体路径与个体拍翅分开。** Reynolds 的分离、对齐、聚合决定速度；河岸限域、离开障碍、落栖或追花另作行为。少量动物可由 CPU 用空间格查邻居，按固定步更新，画面帧间插值；再给每只个体自己的拍翅相位。three.js 的开源示例 用纹理保存群鸟的位置和速度，适合研究数据流；邻居扫描范围、纹理分辨率与浮点渲染目标成本必须实测。独居鹭、停在宿主上的昆虫不需要群聚规则。[Reynolds 原始论文](https://red3d.com/cwr/papers/1987/boids.html) · [three.js 群鸟源码](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_gpgpu_birds.html)

## 六、WebGL2 性能预算用驾驶镜头验证

| 遇到的瓶颈 | 可实施的方法及代价 | 如何验证 |
|---|---|---|
| CPU 提交和实例更新 | 以地块、网格、材质、LOD 分组实例。静态植物只在地块进出时上传，风走共享时间；少量种内变化传色组、相位和比例。给批次计算包含风摆幅的包围体。在 three.js，普通 InstancedMesh 的包围球代表整批；一整片森林合一个批次会使剔除过粗。BatchedMesh 提供逐对象视锥剔除，管理成本另测。 | 同一路线比较固定总棵数、不同块长时的提交次数、CPU 帧时和可见实例数。转身背对森林时提交应明显减少。[InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) · [BatchedMesh](https://threejs.org/docs/pages/BatchedMesh) |
| GPU 剔除与转移数据 | 先 CPU 做地块级视锥、距离和投影尺寸筛选。WebGL2 可在顶点阶段根据实例边界让整株移出裁剪体积，可省光栅和片元，但已提交的实例仍运行顶点着色。遮挡查询可按大块延迟取回，保守复用上帧结果；即时读回可能造成 CPU/GPU 等待。WebGL2 核心没有桌面 compute＋间接绘制的整套 GPU 压缩提交机制。《异环》的 UE 管线提供参照，移植时先测视锥剔除后的剩余成本。 | 用开阔草坡和遮挡严重的林道分别测；若查询等待或每株判定比省下的片元更贵，调粗粒度。[MDN WebGL 最佳实践](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) · [WebGL 查询机制](https://developer.mozilla.org/en-US/docs/Web/API/WebGLQuery) |
| 叶卡填充率与颜色闪烁 | 卡边贴着叶团裁形，去掉大片透明角，实体暗芯挡住深层；不透明和 alpha-test 通道分别统计。裁形多花几个三角形，通常可减少无效屏幕面积。按同一 alphaTest 阈值测各 mip 的覆盖率，并给图集留扩边，避免远级树冠秃掉或串色。透明混合留给确实需要多层透射的物体，优先缩小近镜头半透明层数。 | 锁相机，依次关闭树冠内层、减半绘制分辨率、关闭阴影、换简单片元材质。观察 GPU 毫秒的变化，区分顶点、阴影和片元成本。alpha discard 之前的采样仍有成本。[带图的 alpha mip 对比](https://lisyarus.github.io/blog/posts/exploring-ways-to-mipmap-alpha-tested-textures.html) |
| 远景图集与影子 | 多方向图集可省顶点，同时增加纹理读数、显存和卡片重叠。先限制阴影投射范围和远级阴影频率；阴影使用与颜色相容的遮罩、枯叶状态和风相位。远林沿天际线保留少数英雄树撑出层次。 | 在太阳低、逆光和雪季各量一次树冠覆盖率、影档切换与闪烁。树静止也要做相机绕行录像。[Epic 替身比较](https://dev.epicgames.com/documentation/en-us/unreal-engine/impostor-baker-plugin-in-unreal-engine) |
| 测量本身 | 1080p、固定视角与路线、相同天气和阴影；预热后分开记 CPU 帧时、GPU 帧时、P50/P95、提交数、三角数和纹理字节。WebGL2 上有 EXT_disjoint_timer_query_webgl2 时异步读 GPU 查询，丢弃 disjoint 样本；不可用时注明 GPU 毫秒缺测。60 fps 整帧预算约 16.67 ms，植物与动物共享其一部分。 | 截图看轮廓，视频看换级，采样统计看成本。用静置、林下高速掠过和转弯进入开阔地三段，记录最差路段和加载尖峰。[MDN 计时扩展](https://developer.mozilla.org/en-US/docs/Web/API/EXT_disjoint_timer_query) · [样板段验收口径](../nodes/L-landscape.md) |

## 七、给两条制作路线的同题样片

| 样片 | 游戏内程序生成 | Blender 脚本生成 | 玩家并排看什么 |
|---|---|---|---|
| 云杉、西黄松，各含一个年龄变体 | 从有级别的枝架扫出树干，在真实枝末建冠团，复用现有树冠材质 | 相同树高、最低活枝位置和粗枝草图，曲线生成枝层，代理体传法线；导出几何、色组及法线到同一游戏材质 | 无贴图侧影认种；迎光、逆光、从树下看和 180° 绕行；驶过换级点时哪个版本先失去冠内空隙 |
| 潮湿林缘及本地母岩 | 选当地一株蕨、一组有宿主的菌和一块半埋岩，按当地分布组合；用少量面和色块讲清器官 | 相同尺寸、成熟状态、坡向和枯木位置，叶轴实例化、菌盖剖面旋转、岩面切削；将笔触、遮罩与风权重导出 | 停车近看能否从侧面辨出蕨、菌与母岩；开车掠过时它们能否聚成完整色块而不闪烁 |
| 家燕、虹鳟、访花蝶，分各自栖息地展示 | 肩腕、鱼尾和翅根分别用解析形变；个体共享网格 | 用相同剪影和关键姿态脚本摆骨，比较导出顶点权重与短片段 VAT | 先看静帧，再看同速度的循环与转弯。蝶翼会不会穿胸、鳟鱼头会不会甩动、燕子滑翔时能否认出叉尾 |

两版使用同样镜头焦距、物体世界尺寸、实例密度、太阳方向、雾、调色和后处理，**都送入游戏最终画面**。Blender 的工作室渲染仅用于定位建模问题。另存灰度、剪影和正常色彩三套对照，匿名打乱 A/B。先问“你看见的是什么，靠什么认出”，再问更喜欢哪版；把答错的种、首次可辨距离、换级闪动位置、每帧成本和离线烘焙占用放在同一页。样片可混用两种方法，硬枝、静态烘焙与实时拍翅分别选合适的制作成本。

### 每类首选图像与视频

| 类别 | 参考链接 |
|---|---|
| 整景、天空与远山 | [吉卜力官方剧照](https://www.ghibli.jp/works/mononoke/) · [《异环》引擎团队视频](https://www.youtube.com/watch?v=eXAOQqAWk5s) |
| 树、灌木、叶卡 | [叶团法线前后对照](https://kidswithsticks.com/creating-stylized-art-inspired-by-ghibli-using-unreal-engine-4/) · [参数树图版](https://courses.cs.duke.edu/cps124/fall01/resources/p119-weber.pdf) |
| 岩石、苔面 | [Gen Amos 绘制分解](https://gamesartist.co.uk/stylized-rock-study/) · [柱状节理实拍](https://www.nps.gov/places/devilspostpile.htm) |
| 草、花、蕨 | [草坡实机与几何分解](https://www.youtube.com/watch?v=Ibe1JBF5i5Y) · [花序图版](https://algorithmicbotany.org/papers/inflorescence.sig16.html) · [蕨叶节点演示](https://www.youtube.com/watch?v=ZDHZVYaiBlM) |
| 仙人掌、采集菌 | [索诺兰仙人掌](https://home.nps.gov/sagu/learn/nature/cacti-and-desert-succulents.htm) · [菌盖、菌褶及宿主图谱](https://research.fs.usda.gov/treesearch/38089) |
| 鸟 | [家燕飞行图集](https://www.allaboutbirds.org/guide/Barn_Swallow/photo-gallery) · [大蓝鹭的站姿与飞姿](https://www.allaboutbirds.org/guide/Great_Blue_Heron/id) |
| 鱼 | [虹鳟外形图](https://www.adfg.alaska.gov/static/education/wns/rainbow_trout.pdf) · [鱼体摆动分步演示](https://docs.godotengine.org/en/stable/tutorials/performance/vertex_animation/animating_thousands_of_fish.html) |
| 昆虫 | [蝴蝶起飞高速摄影及原始数据](https://datadryad.org/dataset/doi%3A10.5061/dryad.4j0zpc87v) |
