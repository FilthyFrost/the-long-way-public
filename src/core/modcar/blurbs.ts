/**
 * What the item cards say about each thing (docs/MODCAR.md §5.5): its grade in stars (1 a makeshift, 2 an
 * ordinary factory part, 3 a good one, 4 a strong one, 5 the best of its kind) and one line about it.
 * Vehicles and the workshop's machines have a line but no stars.
 */
import type { ToolKind } from './tools';

export interface Blurb {
  stars: number;
  zh: string;
}

const b = (stars: number, zh: string): Blurb => ({ stars, zh });

export const PART_BLURB: Record<string, Blurb> = {
  // engines
  eng_mower: b(1, '从割草机上拆下来的，拉一下绳就着。拿它开车？勇气可嘉。'),
  eng_single: b(2, '摩托上的老单缸，嗓门大，脾气好，修起来不费劲。'),
  eng_2t: b(2, '二冲程双缸，转速高，冒蓝烟，只喝混合油。'),
  eng_i4: b(2, '「方糖」原装的小四缸，不快，但省油、耐用、好伺候。'),
  eng_i4d: b(3, '柴油直四，低转扭矩足，拉货爬坡全靠它。'),
  eng_flat6: b(4, '风冷水平对置六缸，转得欢、叫得脆，不用水箱。'),
  eng_v8: b(5, '五升 V8，一脚油门地动山摇，油箱见底也快。'),
  eng_d6: b(4, '房车的大柴油直六，七百牛米，拉得动一座房子。'),
  eng_i3: b(2, 'K 车的小三缸，六百六十毫升，嗡嗡地转，省油，就是没什么劲。'),
  eng_boxer4: b(2, '老面包车、甲壳虫的风冷对置四缸，哒哒哒地响，不用水箱，转不高。'),
  eng_i4tc: b(4, '双顶置凸轮、十六气门，越往上转越来劲，七千多转还在叫。'),
  eng_i6: b(4, '直列六缸，平顺得像丝绸，三升排量，什么时候踩都有劲。'),
  eng_v6: b(3, 'V6 三升，比直六冲一点、短一点，小机舱也塞得进。'),
  eng_v12: b(5, 'V12 五升半，十二个缸一起唱，又长又重又费油，谁也追不上。'),
  eng_d1: b(1, '手扶拖拉机上的单缸柴油机，大飞轮咚咚咚地转，顶天两千转，慢得像走路。'),
  eng_i6d: b(3, '老式柴油直六，四升二，噪音大、冒黑烟，扭矩又厚又宽。'),
  eng_moto4: b(4, '跑车摩托的四缸，一万三千多转，尖叫着往上冲，低转没劲。'),
  eng_vtwin: b(3, '巡航摩托的 V 型双缸，突突突地抖，低转扭矩足。'),
  // drivetrain
  gb_3: b(1, '只有三个挡，挡挡都长，能开就行。'),
  gb_4: b(2, '普普通通的四速箱，老车都是它。'),
  gb_5: b(4, '五个挡排得紧凑，换挡快，跑山路最舒服。'),
  gb_moto: b(3, '摩托的五速箱，脚一踩咔哒一声就上去了。'),
  rad_small: b(1, '小号水箱，散热一般，夏天爬坡要盯着水温。'),
  rad_std: b(2, '普通水箱，日常够用。记得常加水。'),
  rad_big: b(4, '加大水箱，大马力的发动机也压得住。'),
  bat_moto: b(1, '摩托用的小电瓶，打火够用，别指望它带音响。'),
  bat_std: b(2, '普通电瓶，没有它车子打不着火。'),
  bat_truck: b(4, '大电瓶，电多，打火有劲，开着灯也不慌。'),
  tank_moto: b(2, '摩托油箱，装得不多，一路都在找加油站。'),
  tank_std: b(2, '普通油箱，四十五升，够跑一阵子。'),
  tank_big: b(4, '大油箱，九十升，一箱油开到天边。'),
  tank_drum: b(3, '一个两百升的汽油桶直接当油箱。别问安不安全。'),
  exh_stock: b(2, '原装排气，安静本分。'),
  exh_sport: b(3, '运动排气，声音更好听，劲也大一点。'),
  exh_side: b(3, '从车身侧面伸出来的排气管，吵得邻居想报警。'),
  exh_moto: b(2, '摩托排气，突突突的那种。'),
  turbo_small: b(3, '小涡轮，转速上来以后推着你走，要稍微等它一下。'),
  turbo_mid: b(4, '中号涡轮，比小的推得猛，要等转速再高一点才醒。'),
  turbo_big: b(5, '大涡轮，三千六百转以下像没装，一过就像被人从后面踹了一脚。'),
  // wheels
  rim_steel13: b(2, '十三寸钢圈，朴实无华，磕了敲一敲还能用。'),
  rim_alloy15: b(4, '十五寸铝圈，又轻又好看，配宽一点的胎。'),
  rim_off16: b(3, '越野钢圈，厚实，扛得住烂路。'),
  rim_moto18: b(3, '摩托辐条圈，十八寸，老派又好看。'),
  rim_truck19: b(3, '卡车钢圈，又大又沉。'),
  rim_dually: b(4, '双轮钢圈，一边两条胎，扛重全靠它。'),
  rim_cart: b(1, '超市购物车的小轮子。能转，就是不太像话。'),
  tire_road: b(2, '普通公路胎，柏油路上最稳。'),
  tire_whitewall: b(3, '白边胎，复古好看，抓地和公路胎差不多。'),
  tire_offroad: b(4, '越野胎，花纹深，泥地沙地都啃得动。'),
  tire_snow: b(4, '雪地胎，冰雪路面上抓得死死的。'),
  tire_slick: b(5, '光头赛车胎，柏油路上黏得像胶水，一下雨就完蛋。'),
  tire_tractor: b(3, '拖拉机的大胎，泥地里所向披靡，上了公路晃得厉害。'),
  tire_moto: b(3, '摩托胎，窄窄一条，压弯全靠它。'),
  tire_truck: b(3, '卡车胎，耐磨，扛重。'),
  tire_eco: b(2, '省油胎，滚起来轻，跑得远，抓地差一点，下雨天小心。'),
  tire_sport: b(4, '运动胎，干燥柏油路上抓得死死的，过弯有底气；磨得快，上了土路就不行。'),
  tire_at: b(3, '全地形胎，公路越野都能凑合，哪儿都不算最好，哪儿也不会太差。'),
  tire_mud: b(3, '泥地胎，大花纹啃得动烂泥和草地；上了柏油路嗡嗡响，刹车也长。'),
  tire_studded: b(3, '钉胎，胎面上镶着钢钉，冰面上照样抓得住，柏油路上咔咔响。'),
  tire_moto_off: b(3, '越野摩托胎，一颗颗大胶粒，土路、草地上抓得住，柏油路上发飘。'),
  // the axles
  susp_stock: b(2, '原厂的弹簧和减震，软硬适中，什么路都凑合。'),
  susp_soft: b(1, '老车上拆下来的软弹簧，过坑舒服，过弯像坐船。'),
  susp_sport: b(4, '短行程硬弹簧配粗防倾杆，车身压低，过弯稳稳贴着地。'),
  susp_lift: b(3, '长行程加高悬挂，车身抬起十厘米，坑洼石头随便过，过弯有点飘。'),
  susp_leaf: b(3, '载重用的加厚钢板弹簧，空车颠，拉满货正好。'),
  brakes_drum: b(1, '老式鼓刹，刹得住，就是软一点。'),
  brakes_disc: b(2, '实心盘配单活塞卡钳，日常够用。'),
  brakes_vented: b(3, '通风刹车盘，比实心盘有劲，连踩几脚也不软。'),
  brakes_sport: b(4, '打孔盘配四活塞红卡钳，一脚下去像撞上一堵墙。'),
  brakes_moto: b(2, '摩托车的碟刹，一个卡钳一张盘。'),
  diff_open: b(2, '普通差速器，转弯顺滑；一个轮子打滑，劲就全跑那边去了。'),
  diff_lsd: b(4, '限滑差速器：打滑的那边少分劲，抓地的那边多分，出弯给油不怕。'),
  diff_locked: b(3, '左右轮锁在一起，烂泥地里谁也拦不住；铺装路上转弯就拧巴。'),
  // the cab
  steer_std: b(2, '普通方向盘，转起来不轻不重。'),
  steer_bad: b(1, '松松垮垮的旧方向盘，打了半天车头才动。'),
  steer_sport: b(4, '小直径的运动方向盘，指哪打哪。'),
  steer_bar: b(3, '摩托车把，一歪就转弯。'),
  steer_ship: b(1, '一个船舵。转好几圈车才拐过来，船长的浪漫。'),
  seat_bucket: b(2, '普通座椅，坐着还行。'),
  seat_bench: b(2, '长条座椅，挤一挤能坐三个人。'),
  seat_race: b(4, '赛车座椅，包得紧紧的，坐久了腰疼。'),
  seat_toilet: b(1, '一个马桶。能坐，别多想。'),
  seat_armchair: b(3, '把单人沙发搬上了车，史上最舒服的驾驶位。'),
  seat_office: b(2, '办公椅，还能转。开车的时候最好别转。'),
  seat_saddle: b(2, '摩托坐垫，薄薄一层。'),
  seat_crate: b(1, '一个木箱。硌屁股。'),
  radio_old: b(2, '老式收音机，沙沙的电台声，开长途的好伙伴。'),
  radio_tape: b(3, '卡带机，声音更大，还能放磁带。'),
  hb_stock: b(2, '普通手刹，停车别忘了拉。'),
  hb_drift: b(4, '漂移用的长杆手刹，一拉到底，车尾就甩出去了。'),
  gl_stock: b(2, '普通挡杆。'),
  gl_foot: b(2, '摩托的脚踩换挡杆。'),
  gl_short: b(4, '短行程挡杆，换挡又快又干脆。'),
  ign_key: b(2, '钥匙点火，拧到底，听它咳嗽两声再着。'),
  ign_button: b(4, '一键启动，按一下就着，未来感十足。'),
  horn_beep: b(2, '普通喇叭，滴滴。'),
  horn_trumpet: b(3, '会放曲子的喇叭，按一下全街都回头。'),
  horn_air: b(4, '大汽笛，房车的嗓门，吓飞一街的鸟。'),
  // the body
  door_stock: b(2, '普通车门，带玻璃窗。'),
  door_rusty: b(1, '打满补丁的锈车门，还能关上就不错了。'),
  door_armor: b(4, '装甲车门，又厚又沉，挡得住大部分东西。'),
  door_cage: b(3, '铁丝网车门，通风良好，下雨就惨了。'),
  door_fridge: b(2, '一扇冰箱门。关上的时候会不会亮灯？'),
  hood_stock: b(2, '普通引擎盖。'),
  hood_scoop: b(4, '带进气口的引擎盖，让发动机凉快一点。'),
  hood_armor: b(4, '装甲引擎盖，撞了也不怕。'),
  trunk_stock: b(2, '普通尾箱盖。'),
  trunk_armor: b(4, '装甲尾箱盖。'),
  bf_stock: b(2, '原装前保险杠。'),
  bf_bullbar: b(3, '防撞杠，撞个树桩不在话下。'),
  bf_ram: b(4, '尖刺撞角，末日开路专用。'),
  bf_plow: b(4, '推雪铲，前面有什么推什么，就是有点沉。'),
  br_stock: b(2, '原装后保险杠。'),
  br_spikes: b(3, '尖刺后杠，谁追尾谁倒霉。'),
  hl_round: b(2, '圆形大灯，老车的眼睛。'),
  hl_square: b(2, '方形大灯，比圆的亮一点点。'),
  hl_spot: b(4, '大射灯，夜里照得跟白天一样，就是费电。'),
  tl_stock: b(2, '普通尾灯。'),
  tl_round: b(2, '摩托的圆尾灯。'),
  mir_stock: b(2, '普通后视镜。'),
  mir_truck: b(3, '卡车大镜子，后面看得清清楚楚。'),
  roof_rack: b(3, '车顶行李架，能多绑点东西。'),
  roof_lightbar: b(4, '车顶灯排，夜里像一座会跑的灯塔。'),
  roof_solar: b(5, '太阳能板，停着也能慢慢给电瓶充电。'),
  roof_spikes: b(3, '车顶尖刺，看着就不好惹。'),
  arm_plates: b(4, '钢板装甲，沉，但是真结实。'),
  arm_planks: b(2, '木板钉成的装甲，聊胜于无。'),
};

export const TOOL_BLURB: Record<ToolKind, Blurb> = {
  jerrycan: b(2, '备用油桶，荒郊野外的救命稻草。'),
  bottle: b(2, '一壶清水，水箱缺水的时候倒进去。'),
  oilcan: b(2, '机油壶。发动机缺了机油会抱死，常看看。'),
  spray: b(2, '一罐喷漆，一罐一个颜色。对着车身、车门、引擎盖按住左键，三秒钟换一个颜色。'),
  sponge: b(1, '一块海绵，按住左键擦：浮灰和泥点一下就掉，留下一道湿亮的痕迹。擦多了会磨坏。'),
  scraper: b(1, '清理铲：按住左键刮，刮掉车窗上、车身上糊死的泥壳，来回两三遍。'),
  brush: b(2, '钢丝刷：刮掉泥壳以后露出来的锈斑，用它刷到见金属。'),
};

/** the spray cans' own lines (by size) */
export const SPRAY_BLURB: Record<1 | 2 | 3, Blurb> = {
  1: b(1, '一小罐喷漆，摇起来哗啦响。剩得不多，喷一两个部件就见底了。'),
  2: b(2, '一罐喷漆，一罐一个颜色。对着车身、车门、引擎盖按住左键，三秒钟换一个颜色。'),
  3: b(4, '一大罐喷漆，喷得又快又匀，够把好几辆车从头到尾喷一遍。'),
};

/** the scrapers' own lines (by tier) */
export const SCRAPER_BLURB: Record<1 | 2 | 3, Blurb> = {
  1: b(1, '塑料的清理铲，刀口十厘米。刮得慢，但不伤漆。'),
  2: b(3, '不锈钢刀口二十二厘米，一铲下去一大片。'),
  3: b(5, '黄铜刀口二十五厘米，刮得又快又干净，拿在手上都有面子。'),
};

export const FRAME_BLURB: Record<string, string> = {
  sedan: '方方正正的老轿车，在谷仓里睡了一个冬天。',
  pickup: '老皮卡，皮实能拉，后斗里什么都装得下。',
  moto: '轻巧的老摩托，钻小路最快。',
  rv: '一整座带轮子的房子，又大又慢，烧柴油。',
  van: '方头方脑的老面包车，风冷发动机在屁股后面，突突地慢慢跑，一家人连铺盖卷都装得下。',
  goat: '老越野车，四个轮子都有劲，泥坑、碎石坡都爬得上去；V6 在车头闷闷地吼，油也喝得凶。',
  wagon: '长长的老旅行车，后排放倒能躺两个人，车顶还有行李架，六缸又顺又安静，跑长途最舒服。',
  fox: '矮矮的小跑车，只有两个座，大灯平时藏在车头里；弯道里你想去哪儿，它就跟着你去哪儿。',
};

/** the workshop's machines: what each is called and what it is for */
export const DEVICE_BLURB: Record<string, { name: string; zh: string }> = {
  door: { name: '大门按钮', zh: '按一下，两扇大门慢慢滑开；再按一下关上。' },
  lights: { name: '灯开关', zh: '车库顶上那几盏灯。' },
  charger: { name: '电瓶充电器', zh: '把电瓶放到托盘上，慢慢充满。' },
  lift: { name: '举升机', zh: '车停到两根立柱中间，就能把它举起来，底下的零件好拆。' },
  tyrechanger: { name: '换胎机', zh: '把车轮放上转台，再拿一条轮胎来，就能换胎。' },
  radio: { name: '收音机', zh: '车库的老收音机，干活的时候听点歌。' },
  sink: { name: '水龙头', zh: '在这里把水壶灌满，或者把海绵打湿。' },
  paintbooth: { name: '喷枪', zh: '整车喷漆，一次喷一种颜色。' },
};
