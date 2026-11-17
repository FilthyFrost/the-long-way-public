/**
 * ModCar's own drawing of the places by the road (docs/MODCAR.md §20): the things standing at them — pumps,
 * canopies, counters, shelves, cupboards, beds, tool chests, drums, crates … — as our models (tools/blender/places,
 * the same pipeline and look as the parts, the items and the machines), in place of the old game's drawing
 * (game/scene/siteBuild.ts): WorldView.skipObject leaves out what is drawn here. Each place's models are merged
 * into one mesh per material (render/carMerge.ts: every thing keeps its own two colours and its wear in its
 * vertices), so a filling station costs a handful of draw calls; they are there within reach and dropped beyond.
 *
 * Model frame (tools/blender/places): front towards +X, the width (a site object's w) along Y, the depth (d) along
 * X, standing on z = 0 — so in the site object's own frame (x along w, z across d, its front at −z) a model turns
 * a quarter round Y and is scaled to the object's exact size.
 */
import * as THREE from 'three';
import { hash2 } from '../../core/math/rng';
import type { Site, SiteObject } from '../../core/world/sites';
import type { World } from '../../core/world/terrain';
import { mergeCarParts, type MergePart } from '../render/carMerge';
import type { RenderCore } from '../render/core';
import { cloneModel, placeGlb, type Model } from './assets';
import { applyMaterials, CarMaterials } from './materials';

/** the places' models within this of a place (m); dropped beyond FAR */
const NEAR = 420;
const FAR = 560;
const CHECK_EVERY = 0.6;

/** the models there are (public/models/modcar/places/<name>.glb): the ones that load are drawn here */
export const PLACE_MODELS = [
  'canopy',
  'canopy_s',
  'pump',
  'signpole',
  'lid',
  'icebox',
  'counter',
  'shelf',
  'shelf_garage',
  'drum',
  'tyres',
  'tyres_low',
  'toolbox',
  'cupboard',
  'cupboard_s',
  'wardrobe',
  'bed',
  'ktable',
  'table',
  'bench',
  'woodpile',
  'line',
  'patch',
  'mailbox',
  'trough',
  'fence',
  'lift',
  'workbench_old',
  'rack',
  'barrel',
  'crate',
  'shelter',
  'firering',
  'log',
  'tent',
  'bag',
  'tacklebox',
  'boat',
  'stand',
  'scope',
  'rail',
  'pipes',
  'silo',
  'tank',
  'caravan',
  'trolley',
  'board',
  'desk',
  'cabinet',
] as const;

/** the model a site's object is drawn with ('' none of ours), and how (one, or a module repeated along its length) */
export function placeModelOf(o: SiteObject, site: Site): { name: string; repeat: number } | null {
  switch (o.kind) {
    case 'canopy':
      return { name: o.w >= 10.2 ? 'canopy' : 'canopy_s', repeat: 0 };
    case 'shelf':
      return { name: site.kind === 'garage' ? 'shelf_garage' : 'shelf', repeat: 0 };
    case 'tyres':
      return { name: o.h > 0.74 ? 'tyres' : 'tyres_low', repeat: 0 };
    case 'cupboard':
      return { name: o.w >= 1.7 ? 'cupboard' : 'cupboard_s', repeat: 0 };
    case 'workbench':
      // (a roadside garage's bench is the workshop's working one: ModGame.makeRoadWorkshop)
      return site.kind === 'garage' ? null : { name: 'workbench_old', repeat: 0 };
    case 'fence':
      return { name: 'fence', repeat: 2.0 };
    case 'rail':
      return { name: 'rail', repeat: 2.0 };
    case 'pump':
    case 'signpole':
    case 'lid':
    case 'icebox':
    case 'counter':
    case 'drum':
    case 'toolbox':
    case 'wardrobe':
    case 'bed':
    case 'ktable':
    case 'table':
    case 'bench':
    case 'woodpile':
    case 'line':
    case 'patch':
    case 'mailbox':
    case 'trough':
    case 'lift':
    case 'rack':
    case 'barrel':
    case 'crate':
    case 'shelter':
    case 'firering':
    case 'log':
    case 'tent':
    case 'bag':
    case 'tacklebox':
    case 'boat':
    case 'stand':
    case 'scope':
    case 'pipes':
    case 'silo':
    case 'tank':
    case 'caravan':
    case 'trolley':
    case 'board':
    case 'desk':
    case 'cabinet':
      return { name: o.kind, repeat: 0 };
    default:
      return null;
  }
}

/** colours (sRGB) the things of a place come in: muted, warm, a little faded — the palette of specs/art/STYLE.md */
const PAINTS: Record<string, readonly [number, number][]> = {
  // a filling station's brand: its pumps, its canopy's fascia, its sign
  brand: [
    [0xc8323a, 0xf4efe2],
    [0x2e4a6b, 0xf0c23c],
    [0x3e8e87, 0xf4efe2],
    [0xe07b39, 0x2f3236],
    [0x557a46, 0xf0c23c],
  ],
  // furniture painted at home
  home: [
    [0xede3c8, 0x8a6a48],
    [0xa9d3b5, 0xede3c8],
    [0x7fb3d5, 0xf4efe2],
    [0xd4a53b, 0x5a3a2b],
    [0xb9915f, 0xede3c8],
    [0xe8a3a8, 0xf4efe2],
  ],
  // what a workshop paints its things
  works: [
    [0xb5402c, 0x2f3236],
    [0x2e4a6b, 0x6f7a82],
    [0x557a46, 0x2f3236],
    [0xd4a53b, 0x2f3236],
  ],
  // oil drums and barrels
  drum: [
    [0x2e4a6b, 0x6f7a82],
    [0xc8323a, 0x6f7a82],
    [0x557a46, 0x6f7a82],
    [0xd4a53b, 0x6f7a82],
    [0x3e8e87, 0x6f7a82],
  ],
  plain: [[0xb9915f, 0x6f7a82]],
};

const PALETTE_OF: Partial<Record<string, keyof typeof PAINTS>> = {
  pump: 'brand',
  canopy: 'brand',
  canopy_s: 'brand',
  signpole: 'brand',
  icebox: 'brand',
  board: 'brand',
  cupboard: 'home',
  cupboard_s: 'home',
  wardrobe: 'home',
  bed: 'home',
  ktable: 'home',
  table: 'home',
  bench: 'home',
  mailbox: 'home',
  desk: 'home',
  caravan: 'home',
  boat: 'home',
  toolbox: 'works',
  lift: 'works',
  rack: 'works',
  shelf_garage: 'works',
  workbench_old: 'works',
  cabinet: 'works',
  trolley: 'works',
  drum: 'drum',
  barrel: 'drum',
  tank: 'drum',
  silo: 'drum',
};

/** how worn a place's things are: dust over everything, rust on what is left out in the weather */
function wearOf(name: string, outside: boolean, k: number): { dirt: number; rust: number; wear: number; crust: number } {
  const metal = /drum|barrel|tank|silo|pump|canopy|signpole|lid|lift|rack|toolbox|trolley|pipes|rail|scope|shelf_garage/.test(name);
  return { dirt: 0.25 + 0.35 * k, rust: metal ? (outside ? 0.25 + 0.35 * k : 0.1 + 0.2 * k) : 0.02, wear: 0.2 + 0.4 * k, crust: outside ? 0.08 * k : 0 };
}

/** a place drawn: its root (at its anchor) and its merged models */
interface Drawn {
  site: Site;
  root: THREE.Group;
  merged: THREE.Group | null;
  look: import('../render/carMaterials').CarLook | null;
}

const E = new THREE.Euler();
const Q = new THREE.Quaternion();
const QTURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
const S = new THREE.Vector3();
const P = new THREE.Vector3();
const MO = new THREE.Matrix4();

export class SiteArt {
  private readonly models = new Map<string, Model | null>();
  private readonly drawn = new Map<string, Drawn>();
  private readonly mats = new CarMaterials();
  private readonly sites: Site[] = [];
  private checkT = 0;
  ready: Promise<void>;

  constructor(private readonly core: RenderCore) {
    this.ready = Promise.all(
      PLACE_MODELS.map((n) =>
        placeGlb(n).then((m) => {
          this.models.set(n, m);
        }),
      ),
    ).then(() => undefined);
  }

  /** is this object drawn here (its model loaded)? (WorldView.skipObject leaves it out then) */
  draws(o: SiteObject, site: Site): boolean {
    const m = placeModelOf(o, site);
    return !!m && !!this.models.get(m.name);
  }

  /** how many of the models loaded (the probes') */
  get loaded(): number {
    let n = 0;
    for (const m of this.models.values()) if (m) n++;
    return n;
  }

  /** every frame: the places within reach drawn, the ones far behind dropped */
  update(dt: number, world: World | null, x: number, z: number): void {
    // (the floating origin: every root at its place)
    for (const d of this.drawn.values()) {
      this.core.place(d.root, d.site.x, d.site.y, d.site.z);
      // (the dirt's height and patterns are in the place's own frame)
      if (d.look) {
        d.root.updateMatrixWorld();
        d.look.setCarFrame(d.root.matrixWorld);
      }
    }
    if (!world || (this.checkT -= dt) > 0) return;
    this.checkT = CHECK_EVERY;
    const s = world.spine.sAtX(x);
    this.sites.length = 0;
    world.sites.between(s - FAR - 200, s + FAR + 200, this.sites);
    for (const site of this.sites) {
      if (this.drawn.has(site.id)) continue;
      if (Math.hypot(site.x - x, site.z - z) - site.reach > NEAR) continue;
      this.draw(site);
    }
    for (const [id, d] of [...this.drawn]) {
      if (Math.hypot(d.site.x - x, d.site.z - z) - d.site.reach > FAR) this.drop(id, d);
    }
  }

  /** a place's things as our models, merged */
  private draw(site: Site): void {
    const root = new THREE.Group();
    root.name = `siteart:${site.id}`;
    this.core.scene.add(root);
    this.core.place(root, site.x, site.y, site.z);
    const parts: MergePart[] = [];
    const holders: THREE.Object3D[] = [];
    for (let i = 0; i < site.objects.length; i++) {
      const o = site.objects[i];
      const pm = placeModelOf(o, site);
      const model = pm ? this.models.get(pm.name) : null;
      if (!pm || !model) continue;
      const k = (hash2(site.seed, i, 0x5a17) & 0xffff) / 65536;
      const list = PAINTS[PALETTE_OF[pm.name] ?? 'plain'];
      // (a filling station's things are all its brand's colours; the rest, each its own)
      const pick = PALETTE_OF[pm.name] === 'brand' ? list[(site.seed >>> 3) % list.length] : list[Math.floor(k * list.length) % list.length];
      const outside = !site.objects.some((b) => b.kind === 'building' && inside(b, o));
      const wear = wearOf(pm.name, outside, k);
      // the object's frame: at its place (relative to the anchor), turned and leaning as the site has it
      E.set(o.roll, -o.yaw, o.pitch, 'YZX');
      Q.setFromEuler(E);
      const size = model.box.getSize(new THREE.Vector3());
      const n = pm.repeat > 0 ? Math.max(1, Math.round(o.w / pm.repeat)) : 1;
      for (let j = 0; j < n; j++) {
        const holder = cloneModel(model);
        // (its width along the object's length: a quarter turn; its exact size)
        const along = pm.repeat > 0 ? o.w / n : o.w;
        S.set(size.x > 1e-3 ? o.d / size.x : 1, size.y > 1e-3 ? o.h / size.y : 1, size.z > 1e-3 ? along / size.z : 1);
        // (model axes: x depth, y up, z width; turned a quarter: its z along the object's x)
        const off = pm.repeat > 0 ? -o.w / 2 + along * (j + 0.5) : 0;
        P.set(off, 0, 0).applyQuaternion(Q).add(new THREE.Vector3(o.x - site.x, o.y - site.y, o.z - site.z));
        MO.compose(P, Q.clone().multiply(QTURN), S);
        holder.applyMatrix4(MO);
        root.add(holder);
        holders.push(holder);
        parts.push({ object: holder, paint: pick[0], paint2: pick[1], dirt: wear.dirt, rust: wear.rust, wear: wear.wear, crust: wear.crust });
      }
    }
    let merged: THREE.Group | null = null;
    let look: Drawn['look'] = null;
    if (parts.length) {
      root.updateMatrixWorld(true);
      merged = mergeCarParts(parts, root);
      for (const h of holders) h.removeFromParent();
      look = this.mats.look(`site:${site.id}`, { paint: 0xffffff, paint2: 0xffffff });
      applyMaterials(merged, look, true);
      root.add(merged);
      root.updateMatrixWorld(true);
      look.setCarFrame(root.matrixWorld);
    }
    this.drawn.set(site.id, { site, root, merged, look });
  }

  private drop(id: string, d: Drawn): void {
    d.root.removeFromParent();
    d.merged?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.mats.drop(`site:${id}`);
    this.drawn.delete(id);
  }

  /** the places drawn now (the probes') */
  telemetry(): { drawn: number; loaded: number } {
    return { drawn: this.drawn.size, loaded: this.loaded };
  }
}

/** is the object inside the building (its footprint)? */
function inside(b: SiteObject, o: SiteObject): boolean {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  const u = (o.x - b.x) * c + (o.z - b.z) * s;
  const v = -(o.x - b.x) * s + (o.z - b.z) * c;
  return Math.abs(u) < b.w / 2 && Math.abs(v) < b.d / 2;
}

