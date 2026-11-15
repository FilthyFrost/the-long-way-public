/**
 * One vehicle's robot-traveller figures as JSON on stdout (measure.ts runs the four vehicles side by
 * side in child processes: 3 × 550 km each takes a while).
 *   npx tsx harness/sim/economy.ts <vehicle id> [stretches]
 */
import { VEHICLES } from '../../src/core/vehicle/spec';
import { collectEconomyMetrics } from './traveller';

const id = process.argv[2];
const spec = VEHICLES[id];
if (!spec) throw new Error(`no vehicle ${id}`);
process.stdout.write(JSON.stringify(collectEconomyMetrics(spec, Number(process.argv[3] ?? 50))) + '\n');
