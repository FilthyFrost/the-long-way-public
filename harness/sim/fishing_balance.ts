/**
 * The ladder's pace (docs/V3/nodes/F2-fishing-lite.md §10): a shopping auto-angler with a usual player's hands
 * fishes through the ten waters (each a round lake here), selling, buying bait, rods, tackle and licences and moving
 * on as a player would. Prints when it reaches each water, what an hour there brings, and how long it waits.
 * Run: npx tsx harness/sim/fishing_balance.ts [hours]
 */
import { AutoAngler } from '../../src/core/v3/fishing/lite/autoplay';
import { FISH } from '../../src/core/v3/fishing/lite/fish';
import { Pond, roundLake } from '../../src/core/v3/fishing/lite/pond';
import { Angler, clockOf, newSave, skyMoment } from '../../src/core/v3/fishing/lite/progress';
import { dice } from '../../src/core/v3/fishing/lite/rules';
import { Session } from '../../src/core/v3/fishing/lite/session';
import { SPOTS } from '../../src/core/v3/fishing/lite/spots';
import type { Conditions } from '../../src/core/v3/fishing/lite/types';

const hours = Number(process.argv[2] ?? 30);
const angler = new Angler(newSave());
const dt = 1 / 15;
let spot = -1;
let pond: Pond | null = null;
let session: Session | null = null;
let auto: AutoAngler | null = null;
const arrive: number[] = [];
const per: { t: number; catches: number; coins0: number; sold: number; waits: number; waitN: number; tiers: number[] }[] = [];
let waitStart = -1;

for (let t = 0; t < hours * 3600; t += dt) {
  const { day, hour } = clockOf(t);
  if (angler.s.spot !== spot) {
    spot = angler.s.spot;
    arrive[spot] = t / 3600;
    pond = new Pond(spot, roundLake(55, 5));
    pond.stock(day);
    session = new Session(pond, { rig: () => angler.rig(), level: () => angler.level }, spot + 1);
    auto = new AutoAngler(session, angler, spot * 13 + 5);
    auto.shops = true;
    per[spot] = { t: 0, catches: 0, coins0: angler.s.stats.sold, sold: 0, waits: 0, waitN: 0, tiers: [0, 0, 0, 0, 0, 0] };
  }
  const hr = Math.floor(t / 60);
  const rain = dice(hr, 7, 0x2a) < 0.2;
  const c: Conditions = { day, hour, rain, clear: !rain, fog: hour > 5 && hour < 8 && dice(day, 3) < 0.4, storm: false, snow: false, events: new Set() };
  const sky = skyMoment(spot, day, hour, (id) => angler.found(id));
  pond!.step(dt, t, day, session!.float.wet ? session!.float : null, { active: sky });
  const before = session!.phase;
  session!.step(dt, c);
  if (before !== 'wait' && session!.phase === 'wait') waitStart = t;
  if (before === 'wait' && session!.phase === 'fight' && waitStart >= 0) {
    per[spot].waits += t - waitStart;
    per[spot].waitN++;
  }
  const card = auto!.step(dt, c, t);
  per[spot].t += dt;
  if (card) {
    per[spot].catches++;
    per[spot].tiers[FISH[card.fish].tier]++;
  }
  per[spot].sold = angler.s.stats.sold - per[spot].coins0;
}

console.log(`after ${hours} h: level ${angler.level}, coins ${angler.s.coins}, species ${angler.species()}, rods ${angler.s.rods.length}, tackle ${JSON.stringify(angler.s.tackle)}`);
for (let i = 0; i < per.length; i++) {
  const p = per[i];
  if (!p) continue;
  const h = p.t / 3600;
  console.log(
    `${String(i).padStart(2)} ${SPOTS[i].zh.padEnd(5)} at ${arrive[i].toFixed(2)} h, stayed ${h.toFixed(2)} h: ${(p.catches / h).toFixed(0)} fish/h, ${(p.sold / h).toFixed(0)} coins/h, wait ${(p.waits / Math.max(1, p.waitN)).toFixed(1)} s, tiers ${p.tiers.join('/')}, found ${angler.speciesOf(i)}/10`,
  );
}
