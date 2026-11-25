/**
 * Win rates and fight lengths of the three robot anglers against a fish of each rarity on its water's own rod, and a
 * lord on the next water's rod (docs/V3/plan/fishing-fight.md §3). Run: npx tsx harness/sim/fishing_calibrate.ts [fights]
 */
import { fightParams } from '../../src/core/v3/fishing/lite/fight';
import { ROBOTS, robotFight } from '../../src/core/v3/fishing/lite/robot';
import { TIERS, type Temper } from '../../src/core/v3/fishing/lite/types';

const n = Number(process.argv[2] ?? 300);
const tempers: Temper[] = ['steady', 'runner', 'jumper', 'diver', 'brute', 'trick'];
// [name, tier, strength over the rod's power]
const rows: [string, number, number][] = [
  ['common', 0, 0.3],
  ['uncommon', 1, 0.56],
  ['rare', 2, 0.82],
  ['epic', 3, 1.12],
  ['lord', 4, 1.6],
  ['celestial', 5, 1.38],
  ['lord, next rod', 4, 1.0],
];
for (const robot of ROBOTS) {
  console.log(`\n== ${robot.name}`);
  for (const [name, tier, ratio] of rows) {
    const ends: Record<string, number> = {};
    let won = 0;
    let tWon = 0;
    let rounds = 0;
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const temper = tempers[i % tempers.length];
      const q = 0.2 + 0.6 * ((i * 0.618) % 1);
      const p = fightParams({ ratio, pool: TIERS[tier].stamina * (0.75 + 0.5 * q), temper, tier, feel: 0.7, cast: 20, line: 0, reel: 0 });
      const s = robotFight(p, 10 + (i % 9), 1000 + i * 7919, robot);
      ends[s.end] = (ends[s.end] ?? 0) + 1;
      if (s.end === 'landed') {
        won++;
        tWon += s.t;
        rounds += s.rounds;
      }
      peak += s.peak;
    }
    const parts = Object.entries(ends).map(([k, v]) => `${k} ${((100 * v) / n).toFixed(0)}%`).join(', ');
    console.log(`${name.padEnd(15)} r ${ratio.toFixed(2)}: win ${((100 * won) / n).toFixed(1).padStart(5)}%  mean ${(won ? tWon / won : 0).toFixed(1).padStart(5)} s  rounds ${(won ? rounds / won : 0).toFixed(1)}  peak ${(peak / n).toFixed(2)}  [${parts}]`);
  }
}
