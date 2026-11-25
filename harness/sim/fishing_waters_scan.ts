/**
 * Which lakes the game's own world (ModCar's: src/game/modcar/seamless.ts modcarWorld, the yard, the proving ground
 * and the roadside places as the game deals them) lays by its road, in what country, and which have a jetty to fish
 * from: the list the fishing module's ten waters are chosen from (docs/V3/plan/fishing.md).
 * Run: npx tsx harness/sim/fishing_waters_scan.ts [seed] [slots]
 */
import { modcarWorld } from '../../src/game/modcar/seamless';

const seed = Number(process.argv[2] ?? 20261113);
const slots = Number(process.argv[3] ?? 320);
const { world } = modcarWorld(seed, { chapterScale: 1, startBiome: 'plains', worldVersion: 5 });
const earth = world.earth;
let n = 0;
for (let k = 0; k < slots; k++) {
  world.sites.ensure(k);
  for (const site of world.sites.sitesOf(k)) {
    const o = site.objects.find((q) => q.kind === 'jetty');
    if (!o) continue;
    n++;
    const f = world.water.feature(k) ?? world.water.feature(k - 1) ?? world.water.feature(k + 1);
    const sc = earth?.placeAt(site.s);
    const look = sc?.look;
    console.log(
      [
        `k${k}`,
        site.id,
        site.kind,
        `${(site.s / 1000).toFixed(1)}km`,
        `jetty len${o.w.toFixed(0)} at ${o.x.toFixed(0)},${o.z.toFixed(0)} y${o.y.toFixed(1)} yaw${o.yaw.toFixed(2)}`,
        f && f.kind === 'lake' ? `lake ${(2 * f.a).toFixed(0)}x${(2 * f.b).toFixed(0)}m d${f.depth.toFixed(1)}${f.frozen > 0.5 ? ' ICE' : ''}` : f ? f.kind : 'no feature',
        sc ? sc.name : '-',
        look ? `${look.efg.code} ${look.efg.zh}` : '',
        look?.water ? `水:${look.water.zh}` : '',
        look ? look.landform.zh : '',
        sc ? `m${sc.macro.month} t${sc.macro.tSea.toFixed(0)} w${sc.macro.wet.toFixed(2)}` : '',
      ].join(' | '),
    );
  }
}
console.log(`seed ${seed}: ${n} jetties in ${slots} slots`);
