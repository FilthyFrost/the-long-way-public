/**
 * What stands on the proving ground (docs/MODCAR.md §28): the tower and the shed on the apron, the start gantry,
 * the signboards of the sections, the distance boards down the straight, tyre stacks. Their places and sizes are
 * here, for the view to draw (game/modcar/provingView.ts) and for the walker and the vehicles to keep out of
 * (provingSolids): what one sees is what one runs into.
 */
import { Solid, type SolidSource } from '../../world/solids';
import { APRON, BRAKE_U, FEATURES, HILL, KM_U, LOOP, LOOP_CORRIDOR, QUARTER_U, SKIDPAD, SLALOM, START_X, STRAIGHT, TURN, loopAt, type ProvingGround } from './layout';

/** a thing standing on the proving ground */
export interface Prop {
  kind: string;
  x: number;
  z: number;
  /** heading on the plan (rad: along (cos yaw, sin yaw)) */
  yaw: number;
  /** what it says, for a board or a sign */
  text?: string;
  /** the solids it is, relative to its place and heading: boxes (hx along, hz across) or round posts (hz 0) between heights over the ground */
  solids: { x: number; z: number; hx: number; hz: number; y0: number; y1: number }[];
}

/** the control tower on the apron: its middle and half its footprint's side; its height */
export const TOWER = { x: -927, z: -42, half: 3, height: 11.4 } as const;
/** the shed on the apron, its doors to −x (towards the straight): its footprint; its ridge */
export const SHED = { x0: -923, z0: 6, x1: -909, z1: 18, height: 5.6 } as const;
/** the start gantry's posts: either side of the straight at the start line (the −z one on the pad's edge, kept clear) */
export const GANTRY_POST_Z = -(STRAIGHT.half + 1.8);
export const GANTRY_HEIGHT = 7.2;
/** the distance boards stand this far off the straight's middle, on its +z side */
export const BOARD_Z = STRAIGHT.half + 3;

/** a sign's heading so that its face looks along (fx, fz) (its face is its −across side) */
const facing = (fx: number, fz: number): number => Math.atan2(fx, -fz);
const EAST = facing(1, 0);

/** the section's signboards: Chinese big, English small */
export const SIGNS: readonly { id: string; zh: string; en: string; x: number; z: number; yaw: number }[] = (() => {
  const p = { x: 0, z: 0, tx: 0, tz: 0, kappa: 0 };
  loopAt(14, p);
  const right = (d: number): [number, number] => [p.x - p.tz * d, p.z + p.tx * d];
  const [ox, oz] = right(LOOP_CORRIDOR + 2.2);
  return [
    { id: 'accel', zh: '直线加速', en: 'Acceleration', x: START_X - 18, z: STRAIGHT.half + 4.5, yaw: EAST },
    { id: 'brake', zh: '刹车区', en: 'Braking', x: START_X - (BRAKE_U - 60), z: STRAIGHT.half + 4.5, yaw: EAST },
    { id: 'skidpad', zh: '定圆 R30', en: 'Skid pad', x: SKIDPAD.x, z: SKIDPAD.z, yaw: facing(0, 1) },
    { id: 'slalom', zh: '绕桩', en: 'Slalom', x: SLALOM.gateIn + 14, z: SLALOM.z - 8, yaw: EAST },
    { id: 'offroad', zh: '越野路段', en: 'Off-road', x: ox, z: oz, yaw: facing(-p.tx, -p.tz) },
    { id: 'hill', zh: '坡道', en: 'Grade hill', x: HILL.x0 + 4, z: (HILL.ramps[0].z + HILL.ramps[1].z) / 2, yaw: EAST },
  ];
})();

/** the distance boards down the straight: every hundred metres, and the quarter mile and the kilometre */
export const BOARDS: readonly { u: number; text: string; big: boolean }[] = [
  ...Array.from({ length: 10 }, (_, i) => ({ u: (i + 1) * 100, text: String((i + 1) * 100), big: false })),
  { u: QUARTER_U, text: '1/4 英里', big: true },
  { u: KM_U, text: '1 公里', big: true },
];

/** a tyre stack's place round the turning circle (and how many tyres high) */
export function tyreStacks(): { x: number; z: number; n: number }[] {
  const out: { x: number; z: number; n: number }[] = [];
  const r = TURN.r + 2.5;
  for (let a = 30; a <= 330; a += 15) {
    const t = (a * Math.PI) / 180;
    out.push({ x: TURN.x + Math.cos(t) * r, z: TURN.z + Math.sin(t) * r, n: 3 + ((a / 15) % 3) });
  }
  return out;
}

/** where the windsock stands (beyond the turning circle's +z side) */
export const WINDSOCK = { x: TURN.x + 10, z: TURN.z + TURN.r + 9, height: 6.2 } as const;

/** the lamp posts round the apron, lit at dusk */
export const LAMPS: readonly { x: number; z: number }[] = [
  { x: APRON.x0 + 4, z: APRON.z0 + 2 },
  { x: APRON.x0 + 4, z: APRON.z1 - 1.5 },
  { x: APRON.x1 - 3, z: -18 },
  { x: START_X + 6, z: STRAIGHT.half + 2.5 },
];

/** everything that stands on the proving ground */
export function provingProps(): Prop[] {
  const out: Prop[] = [];
  // the tower, its front (and the glazed cab's) looking down the straight
  out.push({ kind: 'tower', x: TOWER.x, z: TOWER.z, yaw: 0, text: '试车场', solids: [{ x: 0, z: 0, hx: TOWER.half, hz: TOWER.half, y0: 0, y1: TOWER.height }] });
  // the shed, its doors to the straight
  const sx = (SHED.x0 + SHED.x1) / 2;
  const sz = (SHED.z0 + SHED.z1) / 2;
  out.push({ kind: 'shed', x: sx, z: sz, yaw: 0, solids: [{ x: 0, z: 0, hx: (SHED.x1 - SHED.x0) / 2, hz: (SHED.z1 - SHED.z0) / 2, y0: 0, y1: SHED.height }] });
  // the gantry over the start line: a post either side, the beam high over the lanes
  out.push({
    kind: 'gantry',
    x: START_X,
    z: 0,
    yaw: 0,
    text: '起点',
    solids: [
      { x: 0, z: STRAIGHT.half + 1.8, hx: 0.36, hz: 0, y0: 0, y1: GANTRY_HEIGHT },
      { x: 0, z: GANTRY_POST_Z, hx: 0.36, hz: 0, y0: 0, y1: GANTRY_HEIGHT },
    ],
  });
  for (const s of SIGNS) out.push({ kind: 'sign', x: s.x, z: s.z, yaw: s.yaw, text: `${s.zh}|${s.en}`, solids: [{ x: 0, z: 0, hx: 1.65, hz: 0.14, y0: 0, y1: 2.95 }] });
  for (const b of BOARDS) {
    const x = START_X - b.u;
    out.push(
      b.big
        ? { kind: 'board', x, z: BOARD_Z + 3.4, yaw: EAST, text: b.text, solids: [{ x: 0, z: 0, hx: 1.35, hz: 0.12, y0: 0, y1: 4.1 }] }
        : { kind: 'board', x, z: BOARD_Z, yaw: EAST, text: b.text, solids: [{ x: 0, z: 0, hx: 0.66, hz: 0.1, y0: 0, y1: 2.25 }] },
    );
  }
  for (const t of tyreStacks()) out.push({ kind: 'tyres', x: t.x, z: t.z, yaw: Math.atan2(t.z - TURN.z, t.x - TURN.x), text: String(t.n), solids: [{ x: 0, z: 0, hx: 0.4, hz: 0, y0: 0, y1: t.n * 0.21 + 0.02 }] });
  out.push({ kind: 'windsock', x: WINDSOCK.x, z: WINDSOCK.z, yaw: 0, solids: [{ x: 0, z: 0, hx: 0.12, hz: 0, y0: 0, y1: WINDSOCK.height }] });
  for (const l of LAMPS) out.push({ kind: 'lamp', x: l.x, z: l.z, yaw: 0, solids: [{ x: 0, z: 0, hx: 0.14, hz: 0, y0: 0, y1: 7 }] });
  // a post at each of the off-road course's features, just before it on the right, its name to the one coming
  const p = { x: 0, z: 0, tx: 0, tz: 0, kappa: 0 };
  for (const f of FEATURES) {
    loopAt(f.s0 - 2, p);
    const d = LOOP_CORRIDOR + 1.2;
    out.push({ kind: 'post', x: p.x - p.tz * d, z: p.z + p.tx * d, yaw: facing(-p.tx, -p.tz), text: f.zh, solids: [{ x: 0, z: 0, hx: 0.08, hz: 0, y0: 0, y1: 1.75 }] });
  }
  // by the shed: drums, a stack of spare cones
  out.push({ kind: 'drums', x: SHED.x0 + 2, z: SHED.z1 + 1.6, yaw: 0, solids: [{ x: 0, z: 0, hx: 0.95, hz: 0.5, y0: 0, y1: 0.95 }] });
  out.push({ kind: 'conestack', x: SHED.x0 - 0.8, z: SHED.z0 - 1.6, yaw: 0, solids: [{ x: 0, z: 0, hx: 0.24, hz: 0, y0: 0, y1: 0.9 }] });
  void LOOP;
  return out;
}

/** the props' solids, in the world, for the walker and the vehicles */
export function provingSolids(ground: ProvingGround, props: readonly Prop[] = provingProps()): SolidSource {
  const list: Solid[] = [];
  for (const p of props) {
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    for (const b of p.solids) {
      // (its place turned with the prop: along (c, s), across (−s, c))
      const x = p.x + b.x * c - b.z * s;
      const z = p.z + b.x * s + b.z * c;
      const g = ground.heightAt(x, z);
      list.push(new Solid().set(x, z, b.hx, b.hz, p.yaw, g + b.y0, g + b.y1, false, `proving:${p.kind}`));
    }
  }
  return {
    solidsNear(x: number, z: number, r: number, out: Solid[]): void {
      for (const so of list) if (Math.abs(so.x - x) < r + so.hx + so.hz && Math.abs(so.z - z) < r + so.hx + so.hz) out.push(so);
    },
  };
}
