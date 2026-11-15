/**
 * The player's URL parameters (read here so the shared params.ts stays as it is):
 *   ?fixture=1                 the on-foot test yard beside the road (src/core/onfoot/testbed.ts)
 *   ?onfoot=door               start on foot, out of the driver's door
 *   ?onfoot=yard:u,v,deg       … standing in the yard at (u, v), facing deg (0 = along the road, 90 = away from it)
 *   ?onfoot=road:s,d,deg       … at distance s along the road, d m right of the centre line, facing deg from the road's heading
 *   ?onfoot=world:x,z,deg      … at a world point, facing deg (0 = +x, 90 = +z)
 *   ?footpitch=deg             look up (+) or down (−) when starting on foot
 */
export interface PlayerParams {
  fixture: boolean;
  onfoot: { at: 'door' | 'yard' | 'road' | 'world'; a: number; b: number; deg: number } | null;
  pitch: number;
}

export function readPlayerParams(search: string = typeof window !== 'undefined' ? window.location.search : ''): PlayerParams {
  const raw = new URLSearchParams(search);
  const get = (k: string): string | null => raw.getAll(k).at(-1) ?? null;
  const fx = get('fixture');
  const of = get('onfoot');
  let onfoot: PlayerParams['onfoot'] = null;
  if (of && of !== '0' && of !== 'false') {
    const m = /^(yard|road|world):(-?[\d.]+),(-?[\d.]+)(?:,(-?[\d.]+))?$/.exec(of);
    if (m) onfoot = { at: m[1] as 'yard' | 'road' | 'world', a: Number(m[2]), b: Number(m[3]), deg: Number(m[4] ?? 0) };
    else onfoot = { at: 'door', a: 0, b: 0, deg: 0 };
  }
  return { fixture: fx !== null && fx !== '0' && fx !== 'false', onfoot, pitch: Number(get('footpitch') ?? 0) || 0 };
}
