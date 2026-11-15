/**
 * The vehicle's repair and modification places as things to look at and use on foot
 * (docs/VEHICLE_SYSTEMS.md §7.3): each wheel, the bonnet's engine / radiator / battery / cold kit,
 * the suspension and the brakes at the front arches, the option mounts, the spare carrier.
 * What E does at each is decided by core/vehicle/systems/places.ts; here it becomes a hold that
 * runs for the operation's duration (the ring fills), then the operation is applied with what
 * the player actually holds (CarrierStores over hands and backpack; what fits nowhere is put down).
 */
import { bodyToWorld } from '../../core/onfoot/vehicle';
import type { Actor, Interactable, InteractSource, Vec3 } from '../../core/interact/interact';
import { applyOp, CarrierStores, placeAction, PLACES, type OpRequest, type PlaceAction, type PlaceId } from '../../core/vehicle/systems';
import type { Site } from '../../core/world/sites';
import type { Game } from '../game';

/** a workbench this near the vehicle makes repairs full (m) */
export const WORKBENCH_REACH = 6;

class PlaceUse implements Interactable {
  readonly hold = 0;
  readonly radius: number;
  private readonly b = new Float64Array(9);
  private readonly local = { x: 0, y: 0, z: 0 };
  private act0: PlaceAction | null = null;
  private t = 0;
  private lastT = -1;

  constructor(
    readonly places: CarPlaces,
    readonly place: PlaceId,
  ) {
    this.radius = place.startsWith('wheel') ? 0.3 : 0.18;
  }

  get game(): Game {
    return this.places.game;
  }
  get id(): string {
    return `${this.game.sim.spec.id}:${this.place}`;
  }
  get through(): string {
    return this.game.sim.spec.id;
  }

  aim(out: Vec3): void {
    const sim = this.game.sim;
    const bd = sim.spec.body;
    const hl = bd.halfLength;
    const hw = bd.halfWidth;
    const front = bd.centerX + hl;
    const deck = (bd.bottom + bd.top) * 0.45;
    let x = 0;
    let y = deck;
    let z = 0;
    switch (this.place) {
      case 'wheel0':
      case 'wheel1':
      case 'wheel2':
      case 'wheel3': {
        const i = Number(this.place[5]);
        sim.wheelLocal(i, this.local);
        x = this.local.x;
        y = this.local.y;
        z = this.local.z + Math.sign(this.local.z) * 0.12;
        break;
      }
      // under the bonnet: the engine in the middle, the radiator at the nose, the battery and the cold kit to the sides
      case 'engine':
        x = front - 0.55;
        break;
      case 'cooling':
        x = front - 0.15;
        break;
      case 'battery':
        x = front - 0.45;
        z = hw * 0.55;
        break;
      case 'heater':
        x = front - 0.45;
        z = -hw * 0.55;
        break;
      // the front wheel arches: suspension on the left, brakes on the right
      case 'suspension':
      case 'brakes': {
        sim.wheelLocal(this.place === 'suspension' ? 0 : 1, this.local);
        x = this.local.x;
        y = this.local.y + sim.spec.wheelRadius + 0.12;
        z = this.local.z;
        break;
      }
      case 'optA':
        x = bd.centerX - hl;
        y = deck * 0.6;
        break;
      case 'optB':
        x = front;
        y = deck * 0.5;
        z = hw * 0.6;
        break;
      case 'spare':
        x = bd.centerX - hl;
        y = deck;
        z = -hw * 0.6;
        break;
    }
    bodyToWorld(sim, this.b, x, y, z, out);
  }

  private action(a: Actor): PlaceAction {
    const p = this.places;
    return placeAction(this.game.systems, this.place, {
      inv: new CarrierStores([a], [this.game.systems.kit]),
      hands: a.hands,
      people: 1,
      workbench: p.workbenchNear(),
      bonnetOpen: p.bonnetOpen(),
    });
  }

  prompt(a: Actor): string | null {
    // nothing to do with the car's insides while it rolls (a word would only distract)
    if (this.game.sim.kmh > 1) return null;
    return this.action(a).word;
  }

  act(_a: Actor): boolean {
    return false;
  }

  /** held: the ring fills over the operation's duration, then it is done (the plan is settled when E goes down) */
  channel(a: Actor, dt: number): boolean {
    const now = this.game.time;
    if (this.lastT < 0 || now - this.lastT > 0.25) {
      this.act0 = this.action(a);
      this.t = 0;
    }
    this.lastT = now;
    const act = this.act0;
    if (!act || !act.ok || !act.req) {
      this.lastT = -1;
      return false;
    }
    this.t += dt;
    if (this.t < act.seconds) return true;
    this.places.apply(a, act.req);
    this.lastT = -1;
    this.act0 = null;
    return false;
  }

  progress(_a: Actor): number {
    const act = this.act0;
    return act && act.seconds > 0 ? Math.min(1, this.t / act.seconds) : 0;
  }
}

/** the places on the player's vehicle, offered while one is on foot near it */
export class CarPlaces implements InteractSource {
  private readonly uses: PlaceUse[];
  private readonly sites: Site[] = [];
  /** operations done here (telemetry, tests) */
  done = 0;

  constructor(readonly game: Game) {
    this.uses = PLACES.map((p) => new PlaceUse(this, p));
  }

  /** the bonnet is up; a vehicle with no bonnet mover has its insides always reachable */
  bonnetOpen(): boolean {
    const v = this.game.view;
    for (const name of Object.keys(v.parts.movers)) if (/bonnet|hood/i.test(name)) return (v.moverState[name] ?? 0) > 0.5;
    return true;
  }

  /** a workbench stands within reach of the vehicle (a garage, some camps) */
  workbenchNear(): boolean {
    const w = this.game.world;
    if (!w) return false;
    const sim = this.game.sim;
    const s = w.spine.sAtX(sim.px);
    this.sites.length = 0;
    for (const site of w.sites.between(s - 60, s + 60, this.sites))
      for (const o of site.objects) if (o.kind === 'workbench' && Math.hypot(o.x - sim.px, o.z - sim.pz) <= WORKBENCH_REACH) return true;
    return false;
  }

  /** do it with what the actor holds; what fits nowhere is put down at their feet */
  apply(a: Actor, req: OpRequest): boolean {
    const p = this.game.player;
    // the vehicle's own kit (jack, wrench, whatever was stowed) is at hand too
    const inv = new CarrierStores([a], [this.game.systems.kit], (it) => {
      p.loose.add(it.id, 1, a.eye.x + Math.cos(a.heading) * 0.6, a.eye.y - 1.5, a.eye.z + Math.sin(a.heading) * 0.6, a.heading, p.id, it.litres ?? (it.flat ? 1 : 0), undefined, it.cond);
    });
    const r = applyOp(this.game.systems, req, { inv, people: 1, handsFree: a.hands.empty });
    if (r.ok) this.done++;
    return r.ok;
  }

  interactablesNear(x: number, z: number, r: number, out: Interactable[]): void {
    const p = this.game.player;
    if (!p.onFoot) return;
    const sim = this.game.sim;
    const reach = r + sim.spec.body.halfLength + 1;
    if ((sim.px - x) ** 2 + (sim.pz - z) ** 2 > reach * reach) return;
    for (const u of this.uses) out.push(u);
  }
}
