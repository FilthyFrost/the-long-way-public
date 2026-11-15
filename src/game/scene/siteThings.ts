/**
 * Hands the things of the places by the road to the player's world as they come near: what
 * cannot be walked through, the containers to search, what lies in plain sight, the petrol left
 * in tanks (core/world/sites.ts describes them; the player base's registries hold their state).
 *
 * A place is handed over once, the first time the player comes within a few hundred metres, and
 * never taken back: what was opened stays open and what was taken stays taken for as long as the
 * journey lasts.
 */
import { item } from '../../core/items/catalog';
import { hash2 } from '../../core/math/rng';
import type { Site } from '../../core/world/sites';
import type { World } from '../../core/world/terrain';
import type { Player } from '../player/player';

/** places are handed over when this near (m) */
const NEAR = 420;

export class SiteThings {
  private readonly known = new Set<string>();
  private readonly list: Site[] = [];
  private x = NaN;
  private z = NaN;
  /** how much has been handed over so far (telemetry) */
  sites = 0;
  containers = 0;
  loose = 0;
  fuel = 0;

  constructor(
    private readonly world: World,
    private readonly player: Player,
  ) {
    // walls, pumps, wrecks, posts: the plan itself answers for what stands where
    player.solids.add(world.sites);
    // … and the road for its guard rails
    player.solids.add(world.furniture);
  }

  /** a car has shoved one of a site's things: the containers that are those things go with them */
  moved(site: Site): void {
    for (const c of site.containers) {
      if (c.obj < 0) continue;
      const have = this.player.containers.get(c.id);
      if (!have) continue;
      have.def.x = c.x;
      have.def.y = c.y;
      have.def.z = c.z;
      have.def.heading = c.yaw;
    }
  }

  /** @param px, pz where the player is (on foot or at the wheel) */
  update(px: number, pz: number): void {
    if (Math.hypot(px - this.x, pz - this.z) < 30) return;
    this.x = px;
    this.z = pz;
    const s = this.world.spine.sAtX(px);
    const p = this.player;
    this.list.length = 0;
    for (const site of this.world.sites.between(s - 800, s + 800, this.list)) {
      if (this.known.has(site.id) || Math.hypot(site.x - px, site.z - pz) > NEAR + site.reach) continue;
      this.known.add(site.id);
      this.sites++;
      for (const c of site.containers) {
        // (never a solid of its own: the place already offers the crate's box, tagged by its kind so a car
        // can tell a crate it may push aside from a wall)
        p.containers.add({ id: c.id, kind: c.kind, x: c.x, y: c.y, z: c.z, heading: c.yaw, seed: c.seed, hx: c.hx, h: c.h, hz: c.hz, shelf: c.shelf, solid: false });
        this.containers++;
      }
      for (const l of site.loose) {
        // a can found lying about has a little left in it, seldom much
        const holds = item(l.item).holds;
        const fill = holds ? Math.round(holds.litres * 0.45 * ((hash2(site.seed, this.loose, 0xf111) & 0xff) / 255) ** 2 * 10) / 10 : 0;
        p.loose.add(l.item, l.n, l.x, l.y, l.z, l.yaw, site.id, fill, l.id);
        this.loose++;
      }
      for (const f of site.fuel) {
        p.fuel.add(f.id, f.from, f.x, f.y, f.z, f.litres);
        this.fuel++;
      }
    }
  }
}
