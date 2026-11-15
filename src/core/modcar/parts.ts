/**
 * Every ModCar part (docs/MODCAR.md §2.3). Plain data: what each part is, what it weighs and what it does
 * to the vehicle. Any part fits any mount of its category on any frame; `tags` mark the factory fit of each
 * frame (stock:<frame>) and the fun ones (meme, apoc).
 *
 * Grip arrays follow the ground surfaces of src/core/world/ground.ts:
 * asphalt, gravel, dirt, grass, sand, snow, ice.
 */
import type { Category, PartDef } from './types';

const P = (d: PartDef): PartDef => d;

// ------------------------------------------------------------------ engines

const ENGINES: PartDef[] = [
  P({
    id: 'eng_mower',
    cat: 'engine',
    name: { zh: '割草机单缸', en: 'Lawnmower single' },
    mass: 22,
    carry: 'medium',
    tags: ['meme'],
    engine: {
      curve: [
        [1200, 9],
        [2000, 11.5],
        [2800, 12.3],
        [3400, 12],
        [3600, 11.6],
        [3800, 0],
      ],
      idle: 1200,
      redline: 3600,
      brakeNm: 2,
      fuel: 'petrol',
      cooling: 'air',
      lPerKWh: 1.6,
      idleLph: 0.8,
      cylinders: 1,
      layout: 'single',
      oilL: 0.6,
      heat: 0.9,
      selfCoolKw: 6,
      turbo: false,
      sound: 'mower',
    },
  }),
  P({
    id: 'eng_single',
    cat: 'engine',
    name: { zh: '单缸 250', en: 'Single 250' },
    mass: 32,
    carry: 'medium',
    tags: ['stock:moto'],
    engine: {
      curve: [
        [1300, 12],
        [3000, 17],
        [5000, 20],
        [6500, 21],
        [8000, 19],
        [9000, 16],
        [9400, 0],
      ],
      idle: 1300,
      redline: 9000,
      brakeNm: 4,
      fuel: 'petrol',
      cooling: 'air',
      lPerKWh: 1.35,
      idleLph: 0.9,
      cylinders: 1,
      layout: 'single',
      oilL: 1.4,
      heat: 1.0,
      selfCoolKw: 14,
      turbo: false,
      sound: 'single',
    },
  }),
  P({
    id: 'eng_2t',
    cat: 'engine',
    name: { zh: '二冲程双缸', en: 'Two-stroke twin' },
    mass: 38,
    carry: 'medium',
    tags: ['meme'],
    engine: {
      curve: [
        [1500, 8],
        [3500, 14],
        [5500, 22],
        [7000, 29],
        [8000, 30],
        [9000, 26],
        [9500, 22],
        [9900, 0],
      ],
      idle: 1500,
      redline: 9500,
      brakeNm: 3,
      fuel: 'mix2t',
      cooling: 'air',
      lPerKWh: 1.9,
      idleLph: 1.2,
      cylinders: 2,
      layout: 'twin',
      oilL: 0,
      heat: 1.1,
      selfCoolKw: 22,
      turbo: false,
      sound: '2t',
    },
  }),
  P({
    id: 'eng_i4',
    cat: 'engine',
    name: { zh: '直列四缸 1.3', en: 'Inline-four 1.3' },
    mass: 115,
    carry: 'large',
    installS: 3,
    tags: ['stock:sedan'],
    engine: {
      curve: [
        [800, 55],
        [1500, 70],
        [2500, 82],
        [3400, 88],
        [4500, 84],
        [5600, 75],
        [6200, 64],
        [6500, 0],
      ],
      idle: 850,
      redline: 6200,
      brakeNm: 16,
      fuel: 'petrol',
      cooling: 'water',
      lPerKWh: 1.55,
      idleLph: 2.4,
      cylinders: 4,
      layout: 'inline',
      oilL: 3.5,
      heat: 0.95,
      turbo: true,
      sound: 'i4',
    },
  }),
  P({
    id: 'eng_i4d',
    cat: 'engine',
    name: { zh: '直列四缸柴油 2.4', en: 'Diesel four 2.4' },
    mass: 185,
    carry: 'large',
    installS: 3.2,
    tags: ['stock:pickup'],
    engine: {
      curve: [
        [700, 120],
        [1200, 150],
        [1800, 172],
        [2200, 180],
        [3000, 170],
        [3800, 150],
        [4400, 125],
        [4600, 0],
      ],
      idle: 750,
      redline: 4400,
      brakeNm: 28,
      fuel: 'diesel',
      cooling: 'water',
      lPerKWh: 1.2,
      idleLph: 2.2,
      cylinders: 4,
      layout: 'inline',
      oilL: 5.5,
      heat: 0.9,
      turbo: true,
      sound: 'i4d',
    },
  }),
  P({
    id: 'eng_flat6',
    cat: 'engine',
    name: { zh: '水平对置六缸 2.7', en: 'Flat-six 2.7' },
    mass: 160,
    carry: 'large',
    installS: 3,
    engine: {
      curve: [
        [900, 140],
        [2000, 185],
        [3500, 212],
        [5000, 225],
        [6000, 195],
        [6800, 170],
        [7200, 150],
        [7500, 0],
      ],
      idle: 950,
      redline: 7200,
      brakeNm: 22,
      fuel: 'petrol',
      cooling: 'air',
      lPerKWh: 1.5,
      idleLph: 3.2,
      cylinders: 6,
      layout: 'flat',
      oilL: 9,
      heat: 1.0,
      selfCoolKw: 150,
      turbo: true,
      sound: 'flat6',
    },
  }),
  P({
    id: 'eng_v8',
    cat: 'engine',
    name: { zh: 'V8 5.0', en: 'V8 5.0' },
    mass: 235,
    carry: 'large',
    installS: 3.6,
    engine: {
      curve: [
        [700, 280],
        [1500, 340],
        [2500, 385],
        [3600, 400],
        [4500, 385],
        [5200, 350],
        [6000, 290],
        [6300, 0],
      ],
      idle: 700,
      redline: 6000,
      brakeNm: 45,
      fuel: 'petrol',
      cooling: 'water',
      lPerKWh: 1.75,
      idleLph: 5,
      cylinders: 8,
      layout: 'v',
      oilL: 6,
      heat: 1.0,
      turbo: true,
      sound: 'v8',
    },
  }),
  P({
    id: 'eng_d6',
    cat: 'engine',
    name: { zh: '大柴油直六 6.0', en: 'Big diesel six 6.0' },
    mass: 470,
    carry: 'large',
    installS: 4.5,
    tags: ['stock:rv'],
    engine: {
      curve: [
        [600, 450],
        [1000, 620],
        [1500, 700],
        [2000, 660],
        [2500, 575],
        [2800, 500],
        [3000, 0],
      ],
      idle: 650,
      redline: 2800,
      brakeNm: 80,
      fuel: 'diesel',
      cooling: 'water',
      lPerKWh: 1.15,
      idleLph: 4,
      cylinders: 6,
      layout: 'inline',
      oilL: 18,
      heat: 0.9,
      turbo: true,
      sound: 'd6',
    },
  }),
];

// ------------------------------------------------------------------ drivetrain and fluids

const DRIVETRAIN: PartDef[] = [
  P({ id: 'gb_3', cat: 'gearbox', name: { zh: '三速变速箱', en: 'Three-speed gearbox' }, mass: 35, carry: 'medium', gearbox: { ratios: [3.0, 1.6, 1.0], reverse: 3.2, shiftTime: 0.4, efficiency: 0.9 } }),
  P({ id: 'gb_4', cat: 'gearbox', name: { zh: '四速变速箱', en: 'Four-speed gearbox' }, mass: 40, carry: 'medium', tags: ['stock:sedan', 'stock:pickup', 'stock:rv'], gearbox: { ratios: [3.67, 2.1, 1.36, 1.0], reverse: 3.5, shiftTime: 0.32, efficiency: 0.9 } }),
  P({ id: 'gb_5', cat: 'gearbox', name: { zh: '五速近比变速箱', en: 'Close-ratio five-speed' }, mass: 45, carry: 'medium', gearbox: { ratios: [3.25, 2.05, 1.45, 1.12, 0.9], reverse: 3.4, shiftTime: 0.25, efficiency: 0.91 } }),
  P({ id: 'gb_moto', cat: 'gearbox', name: { zh: '摩托五速', en: 'Motorcycle five-speed' }, mass: 12, carry: 'medium', tags: ['stock:moto'], gearbox: { ratios: [2.6, 1.8, 1.4, 1.15, 0.96], reverse: 0, shiftTime: 0.12, efficiency: 0.92 } }),
  P({ id: 'rad_small', cat: 'radiator', name: { zh: '小水箱', en: 'Small radiator' }, mass: 5, carry: 'medium', radiator: { coolKw: 40, coolantL: 3 } }),
  P({ id: 'rad_std', cat: 'radiator', name: { zh: '水箱', en: 'Radiator' }, mass: 8, carry: 'medium', tags: ['stock:sedan', 'stock:pickup'], radiator: { coolKw: 75, coolantL: 5 } }),
  P({ id: 'rad_big', cat: 'radiator', name: { zh: '加大水箱', en: 'Big radiator' }, mass: 13, carry: 'medium', tags: ['stock:rv'], radiator: { coolKw: 140, coolantL: 9 } }),
  P({ id: 'bat_moto', cat: 'battery', name: { zh: '摩托电瓶', en: 'Motorcycle battery' }, mass: 3, carry: 'small', tags: ['stock:moto'], battery: { kWh: 0.15 } }),
  P({ id: 'bat_std', cat: 'battery', name: { zh: '电瓶', en: 'Battery' }, mass: 14, carry: 'medium', tags: ['stock:sedan', 'stock:pickup'], battery: { kWh: 0.6 } }),
  P({ id: 'bat_truck', cat: 'battery', name: { zh: '大电瓶', en: 'Truck battery' }, mass: 26, carry: 'medium', tags: ['stock:rv'], battery: { kWh: 1.2 } }),
  P({ id: 'tank_moto', cat: 'fuelTank', name: { zh: '摩托油箱', en: 'Motorcycle tank' }, mass: 5, carry: 'medium', tags: ['stock:moto'], fuelTank: { litres: 13 } }),
  P({ id: 'tank_std', cat: 'fuelTank', name: { zh: '油箱', en: 'Fuel tank' }, mass: 9, carry: 'medium', tags: ['stock:sedan', 'stock:pickup'], fuelTank: { litres: 45 } }),
  P({ id: 'tank_big', cat: 'fuelTank', name: { zh: '大油箱', en: 'Big fuel tank' }, mass: 16, carry: 'large', tags: ['stock:rv'], fuelTank: { litres: 90 } }),
  P({ id: 'tank_drum', cat: 'fuelTank', name: { zh: '汽油桶', en: 'Oil-drum tank' }, mass: 18, carry: 'large', tags: ['meme', 'apoc'], fuelTank: { litres: 200 } }),
  P({ id: 'exh_stock', cat: 'exhaust', name: { zh: '原装排气', en: 'Stock exhaust' }, mass: 9, carry: 'medium', tags: ['stock:sedan', 'stock:pickup', 'stock:rv'], exhaust: { torque: 1.0, loud: 1.0 } }),
  P({ id: 'exh_sport', cat: 'exhaust', name: { zh: '运动排气', en: 'Sport exhaust' }, mass: 8, carry: 'medium', exhaust: { torque: 1.05, loud: 1.6 } }),
  P({ id: 'exh_side', cat: 'exhaust', name: { zh: '侧排管', en: 'Side stacks' }, mass: 10, carry: 'medium', tags: ['apoc'], exhaust: { torque: 1.08, loud: 2.4 } }),
  P({ id: 'exh_moto', cat: 'exhaust', name: { zh: '摩托排气', en: 'Motorcycle exhaust' }, mass: 4, carry: 'medium', tags: ['stock:moto'], exhaust: { torque: 1.0, loud: 1.2 } }),
  P({ id: 'turbo_small', cat: 'turbo', name: { zh: '小涡轮', en: 'Small turbo' }, mass: 8, carry: 'small', turbo: { boost: 1.28, spoolRpm: 2600, lag: 0.7 } }),
];

// ------------------------------------------------------------------ wheels

const NO_TYRE_GRIP = [0.35, 0.4, 0.42, 0.35, 0.3, 0.25, 0.12];

const WHEELS: PartDef[] = [
  P({ id: 'rim_steel13', cat: 'rim', name: { zh: '钢圈 13 寸', en: 'Steel rim 13"' }, mass: 7, carry: 'medium', tags: ['stock:sedan'], rim: { radius: 0.165, width: 0.13, tire: true, grip: NO_TYRE_GRIP, rr: 3 } }),
  P({ id: 'rim_alloy15', cat: 'rim', name: { zh: '铝圈 15 寸', en: 'Alloy rim 15"' }, mass: 6, carry: 'medium', rim: { radius: 0.19, width: 0.17, tire: true, grip: NO_TYRE_GRIP, rr: 3 } }),
  P({ id: 'rim_off16', cat: 'rim', name: { zh: '越野钢圈 16 寸', en: 'Off-road rim 16"' }, mass: 11, carry: 'medium', tags: ['stock:pickup'], rim: { radius: 0.203, width: 0.2, tire: true, grip: NO_TYRE_GRIP, rr: 3 } }),
  P({ id: 'rim_moto18', cat: 'rim', name: { zh: '摩托辐条圈 18 寸', en: 'Spoked motorcycle rim 18"' }, mass: 4, carry: 'medium', tags: ['stock:moto'], rim: { radius: 0.229, width: 0.07, tire: true, grip: NO_TYRE_GRIP, rr: 3 } }),
  P({ id: 'rim_truck19', cat: 'rim', name: { zh: '卡车钢圈 19.5 寸', en: 'Truck rim 19.5"' }, mass: 16, carry: 'medium', tags: ['stock:rv'], rim: { radius: 0.25, width: 0.2, tire: true, grip: NO_TYRE_GRIP, rr: 3 } }),
  P({ id: 'rim_dually', cat: 'rim', name: { zh: '双轮钢圈', en: 'Dual rear rims' }, mass: 32, carry: 'large', tags: ['stock:rv'], rim: { radius: 0.25, width: 0.42, tire: true, grip: NO_TYRE_GRIP, rr: 3, dual: true } }),
  P({ id: 'rim_cart', cat: 'rim', name: { zh: '购物车轮', en: 'Shopping-trolley wheel' }, mass: 0.6, carry: 'small', tags: ['meme'], rim: { radius: 0.065, width: 0.04, tire: false, grip: [0.55, 0.45, 0.4, 0.3, 0.2, 0.3, 0.3], rr: 2.2 } }),
  P({ id: 'tire_road', cat: 'tire', name: { zh: '公路胎', en: 'Road tyre' }, mass: 8, carry: 'medium', tags: ['stock:sedan'], tire: { sidewall: 0.12, width: 0.155, grip: [1.0, 0.92, 0.92, 0.85, 0.8, 0.85, 0.9], rr: 1.0, wear: 0.03, noise: 1.0 } }),
  P({ id: 'tire_whitewall', cat: 'tire', name: { zh: '白边胎', en: 'Whitewall tyre' }, mass: 8, carry: 'medium', tire: { sidewall: 0.12, width: 0.16, grip: [0.98, 0.9, 0.9, 0.83, 0.78, 0.83, 0.88], rr: 1.0, wear: 0.03, noise: 1.0 } }),
  P({ id: 'tire_offroad', cat: 'tire', name: { zh: '越野胎', en: 'Off-road tyre' }, mass: 13, carry: 'medium', tags: ['stock:pickup'], tire: { sidewall: 0.14, width: 0.235, grip: [0.94, 1.12, 1.15, 1.22, 1.15, 1.08, 0.92], rr: 1.12, wear: 0.035, noise: 1.6 } }),
  P({ id: 'tire_snow', cat: 'tire', name: { zh: '雪地胎', en: 'Snow tyre' }, mass: 9, carry: 'medium', tire: { sidewall: 0.12, width: 0.175, grip: [0.94, 1.0, 1.0, 1.0, 0.95, 1.45, 1.6], rr: 1.06, wear: 0.04, noise: 1.3 } }),
  P({ id: 'tire_slick', cat: 'tire', name: { zh: '光头赛车胎', en: 'Racing slick' }, mass: 9, carry: 'medium', tire: { sidewall: 0.09, width: 0.225, grip: [1.28, 0.75, 0.7, 0.55, 0.6, 0.45, 0.6], rr: 0.92, wear: 0.08, noise: 0.8 } }),
  P({ id: 'tire_tractor', cat: 'tire', name: { zh: '拖拉机胎', en: 'Tractor tyre' }, mass: 38, carry: 'large', tags: ['meme', 'apoc'], tire: { sidewall: 0.3, width: 0.32, grip: [0.68, 1.15, 1.25, 1.55, 1.35, 1.2, 0.7], rr: 1.45, wear: 0.02, noise: 2.4 } }),
  P({ id: 'tire_moto', cat: 'tire', name: { zh: '摩托胎', en: 'Motorcycle tyre' }, mass: 3, carry: 'medium', tags: ['stock:moto'], tire: { sidewall: 0.08, width: 0.1, grip: [1.05, 0.9, 0.88, 0.8, 0.75, 0.8, 0.85], rr: 0.85, wear: 0.04, noise: 0.7 } }),
  P({ id: 'tire_truck', cat: 'tire', name: { zh: '卡车胎', en: 'Truck tyre' }, mass: 16, carry: 'medium', tags: ['stock:rv'], tire: { sidewall: 0.14, width: 0.215, grip: [0.97, 1.0, 1.0, 0.95, 0.9, 0.92, 0.9], rr: 1.02, wear: 0.02, noise: 1.2 } }),
];

// ------------------------------------------------------------------ the cab

const CAB: PartDef[] = [
  P({ id: 'steer_std', cat: 'steering', name: { zh: '方向盘', en: 'Steering wheel' }, mass: 3, carry: 'small', tags: ['stock:sedan', 'stock:pickup', 'stock:rv'], steering: { ratio: 16, playDeg: 1.5, rate: 1 } }),
  P({ id: 'steer_bad', cat: 'steering', name: { zh: '破方向盘', en: 'Worn steering wheel' }, mass: 3, carry: 'small', steering: { ratio: 18, playDeg: 8, rate: 0.85 } }),
  P({ id: 'steer_sport', cat: 'steering', name: { zh: '运动方向盘', en: 'Sport steering wheel' }, mass: 2, carry: 'small', steering: { ratio: 12, playDeg: 0.3, rate: 1.25 } }),
  P({ id: 'steer_bar', cat: 'steering', name: { zh: '车把', en: 'Handlebar' }, mass: 3, carry: 'small', tags: ['stock:moto'], steering: { ratio: 1, playDeg: 0.5, rate: 1.35, bar: true } }),
  P({ id: 'steer_ship', cat: 'steering', name: { zh: '船舵', en: "Ship's wheel" }, mass: 9, carry: 'medium', tags: ['meme'], steering: { ratio: 28, playDeg: 3, rate: 0.55 } }),
  P({ id: 'seat_bucket', cat: 'seat', name: { zh: '座椅', en: 'Bucket seat' }, mass: 16, carry: 'medium', tags: ['stock:sedan', 'stock:pickup', 'stock:rv'], seat: { eyeUp: 0.9, eyeBack: 0.16, comfort: 0.6 } }),
  P({ id: 'seat_bench', cat: 'seat', name: { zh: '长条座椅', en: 'Bench seat' }, mass: 24, carry: 'large', tags: ['stock:sedan', 'stock:rv'], seat: { eyeUp: 0.88, eyeBack: 0.16, comfort: 0.55 } }),
  P({ id: 'seat_race', cat: 'seat', name: { zh: '赛车座椅', en: 'Racing seat' }, mass: 9, carry: 'medium', seat: { eyeUp: 0.84, eyeBack: 0.2, comfort: 0.5 } }),
  P({ id: 'seat_toilet', cat: 'seat', name: { zh: '马桶', en: 'Toilet' }, mass: 28, carry: 'large', tags: ['meme'], seat: { eyeUp: 1.06, eyeBack: 0.05, comfort: 0.3 } }),
  P({ id: 'seat_armchair', cat: 'seat', name: { zh: '单人沙发', en: 'Armchair' }, mass: 30, carry: 'large', tags: ['meme'], seat: { eyeUp: 0.94, eyeBack: 0.2, comfort: 0.95 } }),
  P({ id: 'seat_office', cat: 'seat', name: { zh: '办公椅', en: 'Office chair' }, mass: 14, carry: 'medium', tags: ['meme'], seat: { eyeUp: 1.02, eyeBack: 0.12, comfort: 0.7, swivel: true } }),
  P({ id: 'seat_saddle', cat: 'seat', name: { zh: '摩托坐垫', en: 'Motorcycle saddle' }, mass: 3, carry: 'small', tags: ['stock:moto'], seat: { eyeUp: 0.86, eyeBack: 0.05, comfort: 0.4 } }),
  P({ id: 'seat_crate', cat: 'seat', name: { zh: '木箱', en: 'Wooden crate' }, mass: 6, carry: 'medium', tags: ['meme'], seat: { eyeUp: 0.96, eyeBack: 0.05, comfort: 0.15 } }),
  P({ id: 'radio_old', cat: 'radio', name: { zh: '老式收音机', en: 'Old radio' }, mass: 1.5, carry: 'small', tags: ['stock:sedan', 'stock:pickup'], radio: { tape: false, watts: 8 } }),
  P({ id: 'radio_tape', cat: 'radio', name: { zh: '卡带机', en: 'Tape deck' }, mass: 2, carry: 'small', tags: ['stock:rv'], radio: { tape: true, watts: 12 } }),
  P({ id: 'hb_stock', cat: 'handbrake', name: { zh: '手刹', en: 'Handbrake' }, mass: 2, carry: 'small', tags: ['stock:sedan', 'stock:pickup', 'stock:rv'], handbrake: { strength: 1 } }),
  P({ id: 'hb_drift', cat: 'handbrake', name: { zh: '漂移长杆手刹', en: 'Drift handbrake' }, mass: 3, carry: 'small', handbrake: { strength: 1.6 } }),
  P({ id: 'gl_stock', cat: 'gearLever', name: { zh: '挡杆', en: 'Gear lever' }, mass: 1, carry: 'small', tags: ['stock:sedan', 'stock:pickup', 'stock:rv', 'stock:moto'], gearLever: { shift: 1 } }),
  P({ id: 'gl_short', cat: 'gearLever', name: { zh: '短行程挡杆', en: 'Short shifter' }, mass: 1, carry: 'small', gearLever: { shift: 0.7 } }),
  P({ id: 'ign_key', cat: 'ignition', name: { zh: '钥匙点火开关', en: 'Key ignition' }, mass: 0.3, carry: 'small', tags: ['stock:sedan', 'stock:pickup', 'stock:rv', 'stock:moto'], ignition: { kind: 'key' } }),
  P({ id: 'ign_button', cat: 'ignition', name: { zh: '一键启动', en: 'Start button' }, mass: 0.3, carry: 'small', ignition: { kind: 'button' } }),
  P({ id: 'horn_beep', cat: 'horn', name: { zh: '喇叭', en: 'Horn' }, mass: 0.8, carry: 'small', tags: ['stock:sedan', 'stock:pickup', 'stock:moto'], horn: { sound: 'beep' } }),
  P({ id: 'horn_trumpet', cat: 'horn', name: { zh: '乐曲喇叭', en: 'Musical horn' }, mass: 1.5, carry: 'small', tags: ['meme'], horn: { sound: 'trumpet' } }),
  P({ id: 'horn_air', cat: 'horn', name: { zh: '汽笛', en: 'Air horn' }, mass: 3, carry: 'small', tags: ['stock:rv'], horn: { sound: 'air' } }),
];

// ------------------------------------------------------------------ the body

const BODY: PartDef[] = [
  P({ id: 'door_stock', cat: 'door', name: { zh: '车门', en: 'Door' }, mass: 22, carry: 'large', installS: 1.8, tags: ['stock:sedan', 'stock:pickup', 'stock:rv'], panel: { style: 'stock', armor: 0.1, drag: 0, window: true } }),
  P({ id: 'door_rusty', cat: 'door', name: { zh: '锈补丁车门', en: 'Patched rusty door' }, mass: 24, carry: 'large', installS: 1.8, tags: ['apoc'], panel: { style: 'rusty', armor: 0.05, drag: 0.01, window: true } }),
  P({ id: 'door_armor', cat: 'door', name: { zh: '装甲车门', en: 'Armoured door' }, mass: 48, carry: 'large', installS: 2.4, tags: ['apoc'], panel: { style: 'armor', armor: 0.6, drag: 0.02, window: true } }),
  P({ id: 'door_cage', cat: 'door', name: { zh: '铁丝网车门', en: 'Wire-cage door' }, mass: 18, carry: 'large', installS: 1.8, tags: ['apoc'], panel: { style: 'cage', armor: 0.2, drag: 0.03, window: false } }),
  P({ id: 'door_fridge', cat: 'door', name: { zh: '冰箱门', en: 'Fridge door' }, mass: 30, carry: 'large', installS: 2, tags: ['meme'], panel: { style: 'fridge', armor: 0.3, drag: 0.02, window: false } }),
  P({ id: 'hood_stock', cat: 'hood', name: { zh: '引擎盖', en: 'Bonnet' }, mass: 14, carry: 'large', installS: 1.6, tags: ['stock:sedan', 'stock:pickup', 'stock:rv'], panel: { style: 'stock', armor: 0.1, drag: 0, window: false } }),
  P({ id: 'hood_scoop', cat: 'hood', name: { zh: '进气口引擎盖', en: 'Scoop bonnet' }, mass: 15, carry: 'large', installS: 1.6, panel: { style: 'stock', armor: 0.1, drag: 0.03, window: false, cooling: 0.15 } }),
  P({ id: 'hood_armor', cat: 'hood', name: { zh: '装甲引擎盖', en: 'Armoured bonnet' }, mass: 30, carry: 'large', installS: 2.2, tags: ['apoc'], panel: { style: 'armor', armor: 0.6, drag: 0.02, window: false } }),
  P({ id: 'trunk_stock', cat: 'trunk', name: { zh: '尾箱盖', en: 'Boot lid' }, mass: 10, carry: 'large', installS: 1.4, tags: ['stock:sedan', 'stock:pickup', 'stock:rv'], panel: { style: 'stock', armor: 0.1, drag: 0, window: false } }),
  P({ id: 'trunk_armor', cat: 'trunk', name: { zh: '装甲尾箱盖', en: 'Armoured boot lid' }, mass: 24, carry: 'large', installS: 2, tags: ['apoc'], panel: { style: 'armor', armor: 0.6, drag: 0.02, window: false } }),
  P({ id: 'bf_stock', cat: 'bumperFront', name: { zh: '前保险杠', en: 'Front bumper' }, mass: 9, carry: 'large', stretch: true, tags: ['stock:sedan', 'stock:pickup', 'stock:rv'], bumper: { ram: 0.2, drag: 0 } }),
  P({ id: 'bf_bullbar', cat: 'bumperFront', name: { zh: '防撞杠', en: 'Bull bar' }, mass: 22, carry: 'large', stretch: true, tags: ['apoc'], bumper: { ram: 0.55, drag: 0.05 } }),
  P({ id: 'bf_ram', cat: 'bumperFront', name: { zh: '尖刺撞角', en: 'Spiked ram' }, mass: 38, carry: 'large', stretch: true, installS: 2.6, tags: ['apoc'], bumper: { ram: 0.85, drag: 0.08 } }),
  P({ id: 'bf_plow', cat: 'bumperFront', name: { zh: '推雪铲', en: 'Snow plough' }, mass: 65, carry: 'large', stretch: true, installS: 3, tags: ['apoc'], bumper: { ram: 0.7, drag: 0.25, plow: true } }),
  P({ id: 'br_stock', cat: 'bumperRear', name: { zh: '后保险杠', en: 'Rear bumper' }, mass: 8, carry: 'large', stretch: true, tags: ['stock:sedan', 'stock:pickup', 'stock:rv'], bumper: { ram: 0.2, drag: 0 } }),
  P({ id: 'br_spikes', cat: 'bumperRear', name: { zh: '尖刺后杠', en: 'Spiked rear bar' }, mass: 20, carry: 'large', stretch: true, tags: ['apoc'], bumper: { ram: 0.6, drag: 0.05 } }),
  P({ id: 'hl_round', cat: 'headlight', name: { zh: '圆大灯', en: 'Round headlamp' }, mass: 1.5, carry: 'small', tags: ['stock:sedan', 'stock:moto'], lamp: { light: 1, reach: 1, watts: 55 } }),
  P({ id: 'hl_square', cat: 'headlight', name: { zh: '方大灯', en: 'Square headlamp' }, mass: 1.8, carry: 'small', tags: ['stock:pickup', 'stock:rv'], lamp: { light: 1.1, reach: 1.05, watts: 60 } }),
  P({ id: 'hl_spot', cat: 'headlight', name: { zh: '大射灯', en: 'Spotlight' }, mass: 4, carry: 'small', tags: ['apoc'], lamp: { light: 1.8, reach: 1.6, watts: 100 } }),
  P({ id: 'tl_stock', cat: 'taillight', name: { zh: '尾灯', en: 'Tail lamp' }, mass: 0.8, carry: 'small', tags: ['stock:sedan', 'stock:pickup', 'stock:rv'], lamp: { light: 1, reach: 1, watts: 21 } }),
  P({ id: 'tl_round', cat: 'taillight', name: { zh: '圆尾灯', en: 'Round tail lamp' }, mass: 0.7, carry: 'small', tags: ['stock:moto'], lamp: { light: 1, reach: 1, watts: 21 } }),
  P({ id: 'mir_stock', cat: 'mirror', name: { zh: '后视镜', en: 'Mirror' }, mass: 0.8, carry: 'small', tags: ['stock:sedan', 'stock:pickup', 'stock:moto'], mirror: { size: 1 } }),
  P({ id: 'mir_truck', cat: 'mirror', name: { zh: '卡车大镜', en: 'Truck mirror' }, mass: 2.5, carry: 'small', tags: ['stock:rv'], mirror: { size: 1.8 } }),
  P({ id: 'roof_rack', cat: 'roof', name: { zh: '行李架', en: 'Roof rack' }, mass: 18, carry: 'large', stretch: true, roof: { drag: 0.12 } }),
  P({ id: 'roof_lightbar', cat: 'roof', name: { zh: '车顶灯排', en: 'Light bar' }, mass: 9, carry: 'large', stretch: true, tags: ['apoc'], roof: { drag: 0.06, lightW: 200 } }),
  P({ id: 'roof_solar', cat: 'roof', name: { zh: '太阳能板', en: 'Solar panel' }, mass: 20, carry: 'large', stretch: true, tags: ['stock:rv'], roof: { drag: 0.05, solarW: 250 } }),
  P({ id: 'roof_spikes', cat: 'roof', name: { zh: '车顶尖刺', en: 'Roof spikes' }, mass: 25, carry: 'large', stretch: true, tags: ['apoc'], roof: { drag: 0.08, ram: 0.3 } }),
  P({ id: 'arm_plates', cat: 'armor', name: { zh: '钢板装甲', en: 'Steel plates' }, mass: 60, carry: 'large', stretch: true, installS: 2.8, tags: ['apoc'], armor: { armor: 0.6, drag: 0.02 } }),
  P({ id: 'arm_planks', cat: 'armor', name: { zh: '木板装甲', en: 'Plank armour' }, mass: 25, carry: 'large', stretch: true, installS: 2.2, tags: ['apoc'], armor: { armor: 0.3, drag: 0.03 } }),
];

export const PARTS: readonly PartDef[] = [...ENGINES, ...DRIVETRAIN, ...WHEELS, ...CAB, ...BODY];

const BY_ID = new Map(PARTS.map((p) => [p.id, p]));

export function partDef(id: string): PartDef {
  const p = BY_ID.get(id);
  if (!p) throw new Error(`unknown ModCar part "${id}"`);
  return p;
}

export function hasPart(id: string): boolean {
  return BY_ID.has(id);
}

export function partsOf(cat: Category): PartDef[] {
  return PARTS.filter((p) => p.cat === cat);
}

/** seconds it takes to fit or take off a part (by how it is carried unless the part says) */
export function installSeconds(p: PartDef): number {
  return p.installS ?? (p.carry === 'small' ? 0.5 : p.carry === 'medium' ? 1.2 : 2.2);
}
