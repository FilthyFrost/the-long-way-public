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
import { buildingKit, coatOf, KIT_PIECES, kitSeed, SIGN_INK } from './buildingKit';
import type { Doors } from './doors';
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
  'signpole_m',
  'signpole_s',
  'lid',
  'icebox',
  'counter',
  'shelf',
  'shelf_shop',
  'shelf_mid',
  'shelf_garage',
  'shelf_garage_s',
  'drum',
  'tyres',
  'tyres_low',
  'toolbox',
  'toolbox_top',
  'cupboard',
  'cupboard_s',
  'wardrobe',
  'bed',
  'ktable',
  'table',
  'bench',
  'bench_plain',
  'woodpile',
  'woodpile_s',
  'line',
  'patch',
  'mailbox',
  'trough',
  'fence',
  'fence_b',
  'fence_post',
  'lift',
  'workbench_old',
  'workbench_old_s',
  'rack_dry',
  'rack_dry_t',
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
  'rail_post',
  'pipes',
  'pipes_s',
  'jetty_deck',
  'jetty_deck_b',
  'jetty_end',
  'icehole',
  'silo',
  'tank',
  'caravan',
  'trolley',
  'board',
  'desk',
  'cabinet',
] as const;

/**
 * How a site's object is drawn: one model, or a module repeated along its length (a variant every third one, the
 * last one another, a cap at the far end), scaled to the object's size — its height kept where the model has its own
 * (a jetty's deck stands on posts down into whatever water there is), lifted or lowered by `dy`.
 */
export interface PlaceModel {
  name: string;
  repeat: number;
  alt?: string;
  last?: string;
  end?: string;
  keepH?: boolean;
  dy?: number;
}

/** the model a site's object is drawn with (null: none of ours) */
export function placeModelOf(o: SiteObject, site: Site): PlaceModel | null {
  switch (o.kind) {
    case 'canopy':
      return { name: o.w >= 10.2 ? 'canopy' : 'canopy_s', repeat: 0 };
    case 'shelf':
      // a workshop's tall steel ones, a shop's island and its wall shelves, a kiosk's
      if (o.h >= 1.95) return { name: o.w >= 2.3 ? 'shelf_garage' : 'shelf_garage_s', repeat: 0 };
      if (o.h <= 1.6) return { name: 'shelf_mid', repeat: 0 };
      return { name: site.kind === 'shop' ? 'shelf_shop' : 'shelf', repeat: 0 };
    case 'tyres':
      return { name: o.h > 0.74 ? 'tyres' : 'tyres_low', repeat: 0 };
    case 'cupboard':
      return { name: o.w >= 1.7 ? 'cupboard' : 'cupboard_s', repeat: 0 };
    case 'toolbox':
      // (a tool chest standing on a bench is the low one)
      return { name: o.h < 0.46 ? 'toolbox_top' : 'toolbox', repeat: 0 };
    case 'signpole':
      return { name: o.h >= 7.3 ? 'signpole' : o.h >= 5.8 ? 'signpole_m' : 'signpole_s', repeat: 0 };
    case 'woodpile':
      return { name: o.w < 2.3 ? 'woodpile_s' : 'woodpile', repeat: 0 };
    case 'pipes':
      return { name: o.w < 7.5 ? 'pipes_s' : 'pipes', repeat: 0 };
    case 'rack':
      // (the racks by the water and at the hide are for drying nets and game)
      return { name: o.h > 2.1 ? 'rack_dry_t' : 'rack_dry', repeat: 0 };
    case 'bench':
      return { name: (Math.round(o.x * 3) ^ Math.round(o.z * 3)) & 1 ? 'bench' : 'bench_plain', repeat: 0 };
    case 'workbench':
      // (a roadside garage's bench is the workshop's working one: ModGame.makeRoadWorkshop)
      return site.kind === 'garage' ? null : { name: o.w >= 2.4 ? 'workbench_old' : 'workbench_old_s', repeat: 0 };
    case 'fence':
      return { name: 'fence', repeat: 2.0, alt: 'fence_b', end: 'fence_post' };
    case 'rail':
      return { name: 'rail', repeat: 2.0, end: 'rail_post' };
    case 'jetty':
      // (the deck's top where the site has it: the modules' is 0.25 m over their origin)
      return { name: 'jetty_deck', repeat: 2.0, alt: 'jetty_deck_b', last: 'jetty_end', keepH: true, dy: -0.25 };
    case 'pump':
    case 'lid':
    case 'icebox':
    case 'counter':
    case 'drum':
    case 'wardrobe':
    case 'bed':
    case 'ktable':
    case 'table':
    case 'line':
    case 'patch':
    case 'mailbox':
    case 'trough':
    case 'lift':
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
    case 'silo':
    case 'tank':
    case 'caravan':
    case 'trolley':
    case 'board':
    case 'desk':
    case 'cabinet':
    case 'icehole':
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
  // a camper's canvas
  camp: [
    [0xe07b39, 0x2f3236],
    [0x557a46, 0xede3c8],
    [0x2e4a6b, 0xf0c23c],
    [0xc8323a, 0xede3c8],
    [0xd4a53b, 0x5a3a2b],
  ],
  plain: [[0xb9915f, 0x6f7a82]],
};

const PALETTE_OF: Partial<Record<string, keyof typeof PAINTS>> = {
  pump: 'brand',
  canopy: 'brand',
  canopy_s: 'brand',
  signpole: 'brand',
  signpole_m: 'brand',
  signpole_s: 'brand',
  icebox: 'brand',
  board: 'brand',
  cupboard: 'home',
  cupboard_s: 'home',
  wardrobe: 'home',
  bed: 'home',
  ktable: 'home',
  table: 'home',
  bench: 'home',
  bench_plain: 'home',
  mailbox: 'home',
  desk: 'home',
  caravan: 'home',
  boat: 'home',
  tent: 'camp',
  bag: 'camp',
  tacklebox: 'camp',
  toolbox: 'works',
  toolbox_top: 'works',
  lift: 'works',
  shelf_garage: 'works',
  shelf_garage_s: 'works',
  workbench_old: 'works',
  workbench_old_s: 'works',
  cabinet: 'works',
  trolley: 'works',
  drum: 'drum',
  barrel: 'drum',
  tank: 'drum',
  silo: 'drum',
};

/** how worn a place's things are: dust over everything, rust on what is left out in the weather */
function wearOf(name: string, outside: boolean, k: number): { dirt: number; rust: number; wear: number; crust: number } {
  const metal = /drum|barrel|tank|silo|pump|canopy|signpole|lid|lift|toolbox|trolley|pipes|rail|scope|shelf_garage/.test(name);
  // (indoors only dust: what stands out in the weather is dirtier, and rusts)
  return { dirt: outside ? 0.25 + 0.35 * k : 0.08 + 0.2 * k, rust: metal ? (outside ? 0.25 + 0.35 * k : 0.1 + 0.2 * k) : 0.02, wear: outside ? 0.2 + 0.4 * k : 0.15 + 0.3 * k, crust: outside ? 0.08 * k : 0 };
}

/**
 * A container's moving piece (a cupboard's door, a drawer, a crate's lid: the models' movers, tools/blender/places),
 * drawn on its own: swung or slid open while it is searched, and left open once it has been
 */
interface Mover {
  obj: THREE.Object3D;
  slide: boolean;
  /** the local axis it turns about or slides along (as placed: scaled with the thing) */
  axis: THREE.Vector3;
  /** how far: radians for a hinge, metres for a slide */
  open: number;
  q0: THREE.Quaternion;
  p0: THREE.Vector3;
  t: number;
  target: number;
}

/** the gloss of a place's painted things against a car's (plaster, painted wood, old enamel) */
export const PLACE_GLOSS = 0.22;

/** how long a door or a drawer takes to open (s) */
const OPEN_S = 0.45;

/** a place drawn: its root (at its anchor), its merged models, its containers' moving pieces */
interface Drawn {
  site: Site;
  root: THREE.Group;
  merged: THREE.Group | null;
  look: import('../render/carMaterials').CarLook | null;
  movers: Map<string, Mover[]>;
  /** the moving pieces' own looks (their dirt laid out in the place's frame like the merged ones') */
  moverLooks: import('../render/carMaterials').CarLook[];
}

const E = new THREE.Euler();
const Q = new THREE.Quaternion();
const QTURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
const S = new THREE.Vector3();
const P = new THREE.Vector3();
const MO = new THREE.Matrix4();

export class SiteArt {
  private readonly models = new Map<string, Model | null>();
  /** the building kit's pieces (kit/<name>): the buildings are ours once every one of them is in */
  private readonly kit = new Map<string, Model | null>();
  private kitAll = false;
  /** the buildings' doors (doors.ts): hung as a place is drawn, taken down as it is dropped */
  doors: Doors | null = null;
  private readonly drawn = new Map<string, Drawn>();
  private readonly mats = new CarMaterials();
  private readonly sites: Site[] = [];
  private checkT = 0;
  ready: Promise<void>;

  constructor(
    private readonly core: RenderCore,
    /** has this container been searched? (places.ts: it is drawn open) */
    private readonly searched: (id: string) => boolean = () => false,
  ) {
    this.ready = Promise.all([
      ...PLACE_MODELS.map((n) =>
        placeGlb(n).then((m) => {
          this.models.set(n, m);
        }),
      ),
      ...KIT_PIECES.map((n) =>
        placeGlb(`kit/${n}`).then((m) => {
          this.kit.set(n, m);
        }),
      ),
    ]).then(() => {
      this.kitAll = KIT_PIECES.every((n) => !!this.kit.get(n));
    });
  }

  /** a kit piece's model (the doors' leaves), null while it is not there */
  kitModel(name: string): Model | null {
    return this.kit.get(name.replace(/^kit\//, '')) ?? null;
  }

  /** is this object drawn here (its models loaded)? (WorldView.skipObject leaves it out then) */
  draws(o: SiteObject, site: Site): boolean {
    if (o.kind === 'building') return this.kitAll && !!o.b;
    const m = placeModelOf(o, site);
    return !!m && [m.name, m.alt, m.last, m.end].every((n) => !n || !!this.models.get(n));
  }

  /** how many of the models loaded (the probes') */
  get loaded(): number {
    let n = 0;
    for (const m of this.models.values()) if (m) n++;
    return n;
  }

  /** a container's doors, drawers or lid opening (it is being searched) */
  open(id: string): void {
    for (const d of this.drawn.values()) for (const m of d.movers.get(id) ?? []) m.target = 1;
  }

  /** every frame: the places within reach drawn, the ones far behind dropped */
  update(dt: number, world: World | null, x: number, z: number): void {
    // (the floating origin: every root at its place)
    for (const d of this.drawn.values()) {
      for (const list of d.movers.values()) {
        for (const m of list) {
          if (m.t === m.target) continue;
          m.t = m.target > m.t ? Math.min(m.target, m.t + dt / OPEN_S) : Math.max(m.target, m.t - dt / OPEN_S);
          pose(m);
        }
      }
      this.core.place(d.root, d.site.x, d.site.y, d.site.z);
      // (the dirt's height and patterns are in the place's own frame)
      if (d.look || d.moverLooks.length) {
        d.root.updateMatrixWorld();
        d.look?.setCarFrame(d.root.matrixWorld);
        for (const l of d.moverLooks) l.setCarFrame(d.root.matrixWorld);
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
    // (the containers' moving pieces stay out of the merge: they open)
    const containerOf = new Map(site.containers.filter((c) => c.obj >= 0).map((c) => [c.obj, c.id]));
    const moving = new Set<THREE.Object3D>();
    const pending: { id: string; obj: THREE.Object3D; look: { paint: number; paint2: number; dirt: number; rust: number; wear: number; crust: number } }[] = [];
    for (let i = 0; i < site.objects.length; i++) {
      const o = site.objects[i];
      if (o.kind === 'building' && o.b && this.kitAll) {
        this.building(site, o, i, root, holders, parts);
        continue;
      }
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
      const n = pm.repeat > 0 ? Math.max(1, Math.round(o.w / pm.repeat)) : 1;
      const along = pm.repeat > 0 ? o.w / n : o.w;
      const put = (m: Model, off: number, len: number | null): void => {
        const holder = cloneModel(m);
        const size = nominalOf(m);
        // (its width along the object's length: a quarter turn; its exact size — a cap keeps its own width)
        S.set(size.x > 1e-3 ? o.d / size.x : 1, pm.keepH || size.y <= 1e-3 ? 1 : o.h / size.y, len !== null && size.z > 1e-3 ? len / size.z : 1);
        // (model axes: x depth, y up, z width; turned a quarter: its z along the object's x)
        P.set(off, pm.dy ?? 0, 0).applyQuaternion(Q).add(new THREE.Vector3(o.x - site.x, o.y - site.y, o.z - site.z));
        MO.compose(P, Q.clone().multiply(QTURN), S);
        holder.applyMatrix4(MO);
        root.add(holder);
        holders.push(holder);
        parts.push({ object: holder, paint: pick[0], paint2: pick[1], dirt: wear.dirt, rust: wear.rust, wear: wear.wear, crust: wear.crust });
        const cid = containerOf.get(i);
        if (cid) {
          holder.traverse((x) => {
            const mv = x.userData?.move;
            if (mv !== 'hinge' && mv !== 'slide') return;
            moving.add(x);
            pending.push({ id: cid, obj: x, look: { paint: pick[0], paint2: pick[1], ...wear } });
          });
        }
      };
      for (let j = 0; j < n; j++) {
        // (a variant every third module, picked from the place's seed; the last one its own)
        const alt = pm.alt && (hash2(site.seed, i * 31 + j, 0xa17) & 3) === 0 ? this.models.get(pm.alt) : null;
        const last = pm.last && n > 1 && j === n - 1 ? this.models.get(pm.last) : null;
        put(last ?? alt ?? model, pm.repeat > 0 ? -o.w / 2 + along * (j + 0.5) : 0, along);
      }
      const cap = pm.end ? this.models.get(pm.end) : null;
      if (cap) put(cap, o.w / 2, null);
    }
    let merged: THREE.Group | null = null;
    let look: Drawn['look'] = null;
    const movers = new Map<string, Mover[]>();
    const moverLooks: Drawn['moverLooks'] = [];
    if (parts.length) {
      root.updateMatrixWorld(true);
      merged = mergeCarParts(parts, root, { skip: (o) => moving.has(o) });
      // the moving pieces drawn on their own, at their place (closed, or open if it was searched)
      for (const p of pending) {
        root.attach(p.obj);
        const ud = p.obj.userData as { move: string; axis?: string; open?: number };
        const slide = ud.move === 'slide';
        const axis = new THREE.Vector3(ud.axis === 'x' ? 1 : 0, ud.axis === 'y' || !ud.axis ? 1 : 0, ud.axis === 'z' ? 1 : 0);
        const m: Mover = { obj: p.obj, slide, axis, open: slide ? (ud.open ?? 0.3) : ((ud.open ?? 90) * Math.PI) / 180, q0: p.obj.quaternion.clone(), p0: p.obj.position.clone(), t: 0, target: 0 };
        if (this.searched(p.id)) m.t = m.target = 1;
        pose(m);
        const owner = `site:${site.id}:${p.id}`;
        const ml = this.mats.look(owner, { ...p.look, matte: PLACE_GLOSS });
        if (!moverLooks.includes(ml)) moverLooks.push(ml);
        applyMaterials(p.obj, ml);
        let list = movers.get(p.id);
        if (!list) movers.set(p.id, (list = []));
        list.push(m);
      }
      for (const h of holders) h.removeFromParent();
      // (plaster, painted wood and old enamel: not a car's clear coat)
      look = this.mats.look(`site:${site.id}`, { paint: 0xffffff, paint2: 0xffffff, matte: PLACE_GLOSS });
      applyMaterials(merged, look, true);
      root.add(merged);
      root.updateMatrixWorld(true);
      look.setCarFrame(root.matrixWorld);
    }
    root.updateMatrixWorld(true);
    for (const l of moverLooks) l.setCarFrame(root.matrixWorld);
    this.drawn.set(site.id, { site, root, merged, look, movers, moverLooks });
    // (its doors hung in the doorways the walls leave)
    this.doors?.come(site);
  }

  /** a building as the kit's pieces (buildingKit.ts), in the place's frame: its walls its colours, its sign the place's */
  private building(site: Site, o: SiteObject, i: number, root: THREE.Group, holders: THREE.Object3D[], parts: MergePart[]): void {
    const coat = coatOf(o);
    const k = (hash2(site.seed, i, 0x5a17) & 0xffff) / 65536;
    const wear = { dirt: 0.2 + 0.3 * k, rust: 0.25 + 0.3 * k, wear: 0.25 + 0.3 * k, crust: 0.05 * k };
    E.set(o.roll, -o.yaw, o.pitch, 'YZX');
    Q.setFromEuler(E);
    MO.compose(P.set(o.x - site.x, o.y - site.y, o.z - site.z), Q, S.set(1, 1, 1));
    for (const pc of buildingKit(o, kitSeed(site.seed, i)).pieces) {
      const m = this.kit.get(pc.name);
      if (!m) continue;
      const holder = cloneModel(m);
      holder.matrixAutoUpdate = false;
      holder.matrix.copy(MO).multiply(pc.m);
      root.add(holder);
      holders.push(holder);
      parts.push({ object: holder, paint: pc.sign ? coat.accent : coat.wall, paint2: pc.sign ? SIGN_INK : coat.trim, ...wear });
    }
  }

  private drop(id: string, d: Drawn): void {
    this.doors?.go(d.site);
    d.root.removeFromParent();
    d.merged?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.mats.drop(`site:${id}`);
    for (const cid of d.movers.keys()) this.mats.drop(`site:${id}:${cid}`);
    this.drawn.delete(id);
  }

  /** the places drawn now (the probes'): and of the containers' moving pieces, how many and how many open */
  telemetry(): { drawn: number; loaded: number; movers: number; open: number } {
    let movers = 0;
    let open = 0;
    for (const d of this.drawn.values()) {
      for (const list of d.movers.values()) {
        movers += list.length;
        open += list.filter((m) => m.t > 0.99).length;
      }
    }
    return { drawn: this.drawn.size, loaded: this.loaded, movers, open };
  }

  /** how open a container's pieces are (0 … 1; −1: it has none drawn) */
  openOf(id: string): number {
    for (const d of this.drawn.values()) {
      const list = d.movers.get(id);
      if (list?.length) return Math.min(...list.map((m) => m.t));
    }
    return -1;
  }
}

const PQ = new THREE.Quaternion();
const PV = new THREE.Vector3();

/** a moving piece where it is now: turned about its hinge or slid out along its runners, eased */
function pose(m: Mover): void {
  const e = m.t * m.t * (3 - 2 * m.t);
  if (m.slide) {
    PV.copy(m.axis).multiply(m.obj.scale).applyQuaternion(m.q0).multiplyScalar(m.open * e);
    m.obj.position.copy(m.p0).add(PV);
  } else m.obj.quaternion.copy(m.q0).multiply(PQ.setFromAxisAngle(m.axis, m.open * e));
}

/**
 * The size a model was made to (x its depth, y its height, z its width): what its PART says (tools/blender/places:
 * some reach out of their box on purpose — a bed's headboard, a stand's stairs), else its bounds
 */
function nominalOf(m: Model): THREE.Vector3 {
  const s = m.scene.getObjectByName('PART')?.userData?.size as number[] | undefined;
  if (s && s.length === 3) return new THREE.Vector3(s[1], s[2], s[0]);
  return m.box.getSize(new THREE.Vector3());
}

/** is the object inside the building (its footprint)? */
function inside(b: SiteObject, o: SiteObject): boolean {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  const u = (o.x - b.x) * c + (o.z - b.z) * s;
  const v = -(o.x - b.x) * s + (o.z - b.z) * c;
  return Math.abs(u) < b.w / 2 && Math.abs(v) < b.d / 2;
}

