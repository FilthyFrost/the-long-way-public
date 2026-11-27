/**
 * The workshop's power and its machines (docs/MODCAR.md §14), as Arctic Drive has them, in our own models
 * (tools/blender/machines): an old diesel generator outside by the door — pulled into life with its starter
 * rope, filled from a jerrycan the way a vehicle is (and drawn back from the same way) — powers the workshop's
 * lamps, the battery charger, the recycler and the crafting bench through a cable one can see, along the wall
 * and over the door. A thing held up to the recycler goes into its hopper with E (or is put down into it): it
 * glides over the mouth, is ground down between the rotors, and what it gives is counted up over the machine.
 * The bench opens its list (craftUi.ts) — what one has learnt to make, from the blueprints found down the road
 * (docs/V3/plan/finish.md §六 2), the same at every bench; making one takes its whole cost and the hammer's blows on
 * the anvil plate, the new thing there a second after the last.
 *
 * The rules are src/core/modcar/workshop.ts and crafting.ts; this is the scene, the hands-on use and the sound.
 */
import * as THREE from 'three';
import { fitSub, newInstance } from '../../core/modcar/build';
import { canAfford, costTotal, hits, itemSalvage, partSalvage, recipeDef, RECIPES, recipeOpen, shortOf, spend, toolSalvage, type Cost, type Makes, type Recipe, type Stock } from '../../core/modcar/crafting';
import { itemDef, itemPaint, MATERIAL_IDS, MATERIALS, newItem } from '../../core/modcar/items';
import { partDef } from '../../core/modcar/parts';
import { newTool, SCRAPERS, tankLitres, toolName } from '../../core/modcar/tools';
import type { Text } from '../../core/modcar/types';
import { BLOW_S, CRAFT, flushIngests, GARAGE_GENERATOR, generatorFuel, generatorLeft, ingestPose, newGenerator, newIngest, pullCord, RECYCLE, stepGenerator, stepIngests, stopGenerator, type GeneratorSpec, type GeneratorState, type Ingest } from '../../core/modcar/workshop';
import { applyGhost, type CarLook } from '../render/carMaterials';
import { LAYER_SHADOW_FAR, LAYER_SHADOW_NEAR } from '../render/shadow';
import { cloneModel, machineGlb, toolGlb } from './assets';
import { CraftUi, materialIcon, type CraftRow } from './craftUi';
import { buildSmoke } from './garageSmoke';
import type { GarageDevice } from './garageStub';
import { fuelBar, salvageText, type ItemCard } from './itemInfo';
import { partLook, toolLook, type LooseThings } from './loose';
import { applyMaterials, CarMaterials, type LookOf } from './materials';
import { heldName, type Held, type TankPort } from './player';
import type { ModUI } from './ui';

const text = (zh: string, en: string): Text => ({ zh, en });

/** where a machine stands: its front faces `heading` (0 = +x, π/2 = +z, as the walker's) */
export interface MachineSpot {
  x: number;
  z: number;
  heading: number;
}

export interface WorkshopPlan {
  generator: MachineSpot;
  recycler: MachineSpot;
  bench: MachineSpot;
  spec: GeneratorSpec;
  /** the cable's way (world): from the generator's socket along these to the lamps' switch box, from there on to each machine's socket */
  cable: { toBox: [number, number, number][]; box: [number, number, number]; toRecycler: [number, number, number][]; toBench: [number, number, number][] };
}

/** the starting workshop: the generator outside to the right of the doors (seen from the yard), the recycler inside before the drums, the bench along the wall by the doors */
export const WORKSHOP_PLAN: WorkshopPlan = {
  generator: { x: 7.5, z: -3.75, heading: 0 },
  recycler: { x: 5.2, z: -3.1, heading: Math.PI },
  bench: { x: 6.56, z: 3.25, heading: Math.PI },
  spec: GARAGE_GENERATOR,
  cable: {
    // down to the ground, along the foot of the wall and through it, up to the switch box by the doors
    toBox: [
      [7.62, 0.03, -3.5],
      [7.16, 0.03, -3.42],
      [6.95, 0.12, -3.42],
      [6.94, 1.1, -3.4],
    ],
    box: [6.93, 1.28, -3.38],
    // down again and along the floor to the recycler's motor
    toRecycler: [
      [6.94, 0.04, -3.46],
      [6.2, 0.02, -3.7],
      [5.55, 0.02, -3.72],
    ],
    // up under the eaves, over the doors and down behind the bench
    toBench: [
      [6.94, 1.6, -3.36],
      [6.94, 3.62, -3.3],
      [6.94, 3.74, -2.4],
      [6.94, 3.74, 2.42],
      [6.94, 3.62, 3.9],
      [6.93, 1.6, 3.94],
    ],
  },
};

/** what the game gives the workshop */
export interface WorkshopHost {
  /** where the models hang: the garage's root (its frame is the world's) */
  readonly root: THREE.Object3D;
  readonly loose: LooseThings;
  readonly ui: ModUI;
  readonly stock: Stock;
  /** what one has learnt to make (the game's: the same at every bench) */
  readonly learned: ReadonlySet<string>;
  readonly origin: { x: number; y: number; z: number };
  readonly camera: THREE.PerspectiveCamera;
  /** the ground or floor height at (x, z) (world) */
  groundAt(x: number, z: number): number;
  /** keep the walker out of a box (world, turned by yaw), and let things lie on a surface */
  addSolid(x: number, z: number, hx: number, hz: number, yaw: number, y0: number, y1: number): void;
  addSurface(x0: number, x1: number, z0: number, z1: number, y: number): void;
  sound(name: string, gain?: number): void;
  /** a loop kept going this frame */
  loop(name: string, gain?: number): void;
  /** materials came in or went out */
  stockChanged(delta: Cost): void;
  /** the bench has the view and the mouse (or gives them back) */
  benchMode(on: boolean): void;
  /** the generator's own engine, heard from where one stands (null: silent) */
  genSound(s: { running: boolean; cranking: boolean; rpm: number; load: number; at: THREE.Vector3; stalled?: boolean } | null): void;
  /** sparks at a point (world) */
  sparks(x: number, y: number, z: number, n: number): void;
  /** the picture of a thing for the recipes' list (null while it is drawn) */
  iconOf(h: NonNullable<Held>): string | null;
  /** the card of a thing, for the recipe's details */
  cardOf(h: NonNullable<Held>): ItemCard;
  /** a thing was made at the bench (the tutorial's step) */
  crafted(recipe: string): void;
  /** a thing went into the recycler (the start's board counts its junk: docs/V3/plan/growth.md §一 1) */
  recycled?(h: NonNullable<Held>): void;
  /** why a thing must not go into the recycler (a part the project car still has to have), or null */
  keep?(h: NonNullable<Held>): Text | null;
  /** why, or what happened, in a few words over the hotbar for a moment (the player's flashWhy: docs/V3/plan/prompts.md §五) */
  flash(words: string): void;
}

/** what is kept of the workshop in the save */
export interface WorkshopSave {
  gen: GeneratorState;
  /** the generator's tank cap off */
  cap?: boolean;
  /** a thing being made when the game was saved: it is there when it is read back */
  job?: string;
}

const MOVERS = new Set(['CORD', 'SWITCH', 'LAMP', 'CAP', 'NEEDLE', 'ROTOR_A', 'ROTOR_B']);

/** what is made of wood, cane or canvas: the hammer on it sounds so */
const SOFT_MADE = new Set(['cot', 'creel', 'wall_shelf', 'rod_swift', 'rod_pro', 'rod_sea', 'rod_heron']);

/** the machines' paint (sRGB): the generator mustard over dark green, the recycler bottle green with safety yellow, the bench's steel blue-grey with a green vice */
const LOOKS: Record<'generator' | 'recycler' | 'bench', LookOf> = {
  generator: { paint: 0xd9a83a, paint2: 0x4b5d52, dirt: 0.35, rust: 0.12 },
  recycler: { paint: 0x3a6b4a, paint2: 0xd9a83a, dirt: 0.3, rust: 0.08 },
  bench: { paint: 0x3e4f5c, paint2: 0x6f8a78, dirt: 0.25, rust: 0.05 },
};

/** one machine in the scene: its root at its spot, its moving pieces and markers by name */
class Machine {
  readonly root = new THREE.Group();
  readonly movers = new Map<string, THREE.Object3D>();
  readonly rest = new Map<string, { p: THREE.Vector3; q: THREE.Quaternion }>();
  readonly marks = new Map<string, THREE.Object3D>();
  look: CarLook | null = null;
  ready: Promise<void>;
  /** its model's size and middle (its own frame), measured when in */
  readonly box = new THREE.Box3();

  constructor(
    readonly id: 'generator' | 'recycler' | 'bench',
    readonly spot: MachineSpot,
    y: number,
    parent: THREE.Object3D,
    mats: CarMaterials,
    standIn: () => THREE.Object3D,
  ) {
    this.root.name = `ws:${id}`;
    this.root.position.set(spot.x, y, spot.z);
    this.root.rotation.y = -spot.heading;
    parent.add(this.root);
    // (the bench's model is the workbench's)
    this.ready = machineGlb(id === 'bench' ? 'workbench' : id).then((m) => {
      const obj = m ? cloneModel(m) : standIn();
      this.look = mats.look(`ws:${id}`, LOOKS[id]);
      applyMaterials(obj, this.look);
      this.root.add(obj);
      obj.updateMatrixWorld(true);
      this.box.setFromObject(obj);
      // (the box in its own frame: the root's turn undone)
      this.box.applyMatrix4(this.root.matrixWorld.clone().invert());
      obj.traverse((o) => {
        if (/^M_/.test(o.name)) this.marks.set(o.name, o);
        else if (MOVERS.has(o.name)) {
          this.movers.set(o.name, o);
          this.rest.set(o.name, { p: o.position.clone(), q: o.quaternion.clone() });
        }
      });
    });
  }

  /** a marker's place (render space); `fallback` in the machine's own frame if the model has none */
  mark(name: string, out: THREE.Vector3, fallback: [number, number, number]): THREE.Vector3 {
    const o = this.marks.get(name);
    if (o) return o.getWorldPosition(out);
    this.root.updateMatrixWorld(true);
    return this.root.localToWorld(out.set(fallback[0], fallback[1], fallback[2]));
  }

  /** the emissive bits (the lamp's lens): lit or not */
  setLamp(on: number): void {
    for (const m of this.look?.materials ?? []) if (m.userData.carName === 'emit' && m.uniforms.uLamp) m.uniforms.uLamp.value = 0.06 + 2.2 * on;
  }
}

/** a stand-in while a machine's model is not there yet: a box of about its size, with its markers */
function standIn(size: [number, number, number], marks: Record<string, [number, number, number]>): () => THREE.Object3D {
  return () => {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial();
    mat.name = 'paint';
    const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
    m.position.y = size[1] / 2;
    g.add(m);
    for (const [name, p] of Object.entries(marks)) {
      const o = new THREE.Object3D();
      o.name = name;
      o.position.set(p[0], p[1], p[2]);
      g.add(o);
    }
    return g;
  };
}

/** a heap of tube along the points, sagging a little between them (a cable on clips) */
function cableMesh(points: THREE.Vector3[], radius = 0.011): THREE.Mesh {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = a.distanceTo(b);
    const n = Math.max(2, Math.ceil(len / 0.15));
    // (a span along a wall or the floor sags by a little of its length; one hanging down does not)
    const level = Math.abs(a.y - b.y) < 0.3 * Math.hypot(a.x - b.x, a.z - b.z);
    const sag = level ? Math.min(0.06, len * 0.02) : 0;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const p = a.clone().lerp(b, t);
      p.y -= sag * 4 * t * (1 - t);
      pts.push(p);
    }
  }
  pts.push(points[points.length - 1].clone());
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const geo = new THREE.TubeGeometry(curve, Math.max(8, pts.length * 2), radius, 6, false);
  const mat = new THREE.MeshStandardMaterial();
  mat.name = 'rubber';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ws:cable';
  return mesh;
}

/** a thing going into the recycler: the rule's part, its model, where it left the hands */
interface InGoing {
  core: Ingest;
  obj: THREE.Object3D | null;
  owner: string;
  from: THREE.Vector3;
  seed: number;
  grind: 'metal' | 'plastic' | 'organic' | 'cloth' | 'wood';
  shredded: boolean;
}

/** the count floating over the recycler ("+20 废料"), one per material while things go in */
interface Tally {
  mat: (typeof MATERIAL_IDS)[number];
  n: number;
  el: HTMLDivElement;
  /** since the last unit came in (s) */
  idle: number;
  pop: number;
}

/** how far over the thing the hammer's rings float (m): the thing shows under them, the head lands on it */
const BUBBLE_LIFT = 0.075;

/** what is being made at the bench */
interface Job {
  recipe: Recipe;
  hits: number;
  /** the blows struck, and the bubbles still to strike (their points on the ghost, render space) */
  struck: number;
  bubbles: { at: THREE.Vector3; el: HTMLButtonElement; done: boolean }[];
  ghost: THREE.Object3D | null;
  /** the blow under way: which bubble, how far (s); −1 none */
  blow: number;
  blowT: number;
  /** after the last blow (s); −1 still striking */
  finish: number;
  /** the thing is there */
  given: boolean;
}

const BUBBLE_CSS = `
.mc-blow { position: absolute; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; border: 3px solid var(--ink, #17120f); background: rgba(246,242,234,0.62); box-shadow: 0 3px 0 var(--ink, #17120f), 0 0 0 5px rgba(120,220,255,0.35); cursor: pointer; display: flex; align-items: center; justify-content: center; pointer-events: auto; animation: mc-blow-in 0.25s ease-out; z-index: 6; }
.mc-blow svg { width: 26px; height: 26px; }
.mc-blow:hover { background: #e9c14a; }
.mc-blow.done { animation: mc-blow-pop 0.28s ease-out forwards; pointer-events: none; }
@keyframes mc-blow-in { from { transform: scale(0.3); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes mc-blow-pop { 0% { transform: scale(1); opacity: 1; } 60% { transform: scale(1.5); opacity: 0.8; } 100% { transform: scale(1.8); opacity: 0; } }
.mc-tally { position: absolute; transform: translate(-50%, -100%); font: 800 34px var(--key-font, sans-serif); color: #fff; text-shadow: 0 3px 0 rgba(23,18,15,0.9), 0 0 12px rgba(0,0,0,0.5); white-space: nowrap; pointer-events: none; z-index: 3; display: flex; align-items: center; gap: 6px; }
.mc-tally svg { width: 32px; height: 32px; }
.mc-tally.pop { animation: mc-tally-pop 0.22s ease-out; }
@keyframes mc-tally-pop { 0% { transform: translate(-50%, -100%) scale(1.25); } 100% { transform: translate(-50%, -100%) scale(1); } }
`;

const HAMMER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="#17120f" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><path d="M4 9l5-5 4 4-5 5z" fill="#c9cdd2"/><path d="M10.5 10.5l9 9" /></svg>';

/** what a thing would be, as held (for its picture, its card and its model) */
export function heldOfMakes(m: Makes): NonNullable<Held> {
  if (m.kind === 'tool') return { kind: 'tool', tool: newTool(m.tool, { ...(m.tier ? { tier: m.tier } : {}), ...(m.fuel ? { fuel: m.fuel, litres: 0 } : {}), ...(m.colour !== undefined ? { colour: m.colour } : {}) }) };
  if (m.kind === 'item') return { kind: 'item', item: newItem(m.item) };
  const inst = newInstance(m.part, { charge: 1 });
  if (m.tire) fitSub(inst, 'tire', newInstance(m.tire));
  return { kind: 'part', inst };
}

/** what a thing gives in the recycler */
export function salvageOfHeld(h: NonNullable<Held>): Cost {
  return h.kind === 'part' ? partSalvage(h.inst) : h.kind === 'tool' ? toolSalvage(h.tool) : itemSalvage(h.item);
}

/** what grinding it sounds like */
function grindOf(h: NonNullable<Held>): InGoing['grind'] {
  if (h.kind === 'item') {
    const d = itemDef(h.item.item);
    if (d.cat === 'food' || d.cat === 'drink' || d.cat === 'med') return 'organic';
    if (d.cat === 'wear' || d.cat === 'pack') return 'cloth';
    if (d.model.includes('chair') || d.model.includes('stool')) return 'wood';
    return d.salvage.scrap ? 'metal' : 'plastic';
  }
  if (h.kind === 'tool') return h.tool.kind === 'sponge' ? 'organic' : h.tool.kind === 'scraper' && h.tool.tier === 1 ? 'plastic' : 'metal';
  return 'metal';
}

export class Workshop {
  readonly devices: GarageDevice[] = [];
  readonly tanks: TankPort[] = [];
  readonly gen: GeneratorState;
  private readonly spec: GeneratorSpec;
  private readonly mats = new CarMaterials();
  private readonly gm: Machine;
  private readonly rm: Machine;
  private readonly bm: Machine;
  private readonly cable: THREE.Mesh[] = [];
  private readonly smoke: THREE.Mesh;
  private time = 0;
  // the starter rope: how far the hold has pulled it (0 … 1), whether it was held this frame, and it running back
  private pullP = 0;
  private pullHeld = false;
  private cordBack = 0;
  /** turning over without catching (s left): the engine heard cranking */
  private crankT = 0;
  private switchB = 0;
  private needleB = -1;
  private shake = 0;
  /** the governor's dip as a load comes on (rpm), and whether something was being ground last frame */
  private dip = 0;
  private wasGrinding = false;
  /** where one stands (render space), for how loud the machines are */
  private readonly ear = new THREE.Vector3();
  // the recycler
  private readonly going: InGoing[] = [];
  private readonly tallies: Tally[] = [];
  private rotorW = 0;
  private rotorA = 0;
  private nIn = 0;
  // the bench
  private readonly ui: CraftUi;
  private job: Job | null = null;
  private hammer: THREE.Object3D | null = null;
  private hammerHeld = false;
  /** the bench's view: open (the list or the blows), and how far the camera has gone over to it */
  open = false;
  private hud: HTMLDivElement;
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private readonly v4 = new THREE.Vector3();
  private readonly q1 = new THREE.Quaternion();
  private readonly ray = new THREE.Ray();
  private readonly hb = new THREE.Box3();

  constructor(
    private readonly host: WorkshopHost,
    private readonly plan: WorkshopPlan = WORKSHOP_PLAN,
    save?: WorkshopSave,
  ) {
    this.spec = plan.spec;
    // (a new game: the power is off, with a little diesel in the tank)
    this.gen = save?.gen ? { ...newGenerator(plan.spec), ...save.gen, tank: { capacity: plan.spec.tankL, fuel: { ...(save.gen.tank?.fuel ?? {}) } } } : newGenerator(plan.spec, 3, 'diesel');
    const ground = (s: MachineSpot): number => host.groundAt(s.x, s.z);
    const g = plan.generator;
    const r = plan.recycler;
    const b = plan.bench;
    this.gm = new Machine('generator', g, ground(g), host.root, this.mats, standIn([0.55, 0.62, 0.78], { M_cord_exit: [0.27, 0.28, -0.18], M_exhaust_out: [-0.2, 0.55, -0.3], M_socket: [0.27, 0.3, 0.25], M_filler: [0.1, 0.62, -0.1] }));
    this.rm = new Machine('recycler', r, ground(r), host.root, this.mats, standIn([0.85, 1.15, 0.95], { M_intake: [0, 1.15, 0], M_grind: [0, 0.85, 0], M_socket: [0, 0.45, 0.48] }));
    this.bm = new Machine('bench', b, ground(b), host.root, this.mats, standIn([0.75, 0.92, 1.6], { M_craft: [0.05, 0.92, 0], M_eye: [0.67, 1.47, 0], M_socket: [-0.3, 1.6, -0.6] }));
    // the walker keeps out of them; the bench's top and the hopper's rotors take what is put on them
    host.addSolid(g.x, g.z, 0.3, 0.41, -g.heading, 0, 0.66);
    host.addSolid(r.x, r.z, 0.45, 0.5, -r.heading, 0, 1.15);
    host.addSolid(b.x, b.z, 0.4, 0.82, -b.heading, 0, 0.92);
    this.surfaces();
    this.smoke = buildSmoke({ x: 0, y: 0, z: 0 }, { puffs: 16, life: 2.2, rise: 1.1, size: 0.16, dark: 0.8 });
    (this.smoke.material as THREE.ShaderMaterial).uniforms.uAlpha.value = 0;
    host.root.add(this.smoke);
    void Promise.all([this.gm.ready, this.rm.ready, this.bm.ready]).then(() => {
      this.placeSmoke();
      this.layCable();
      this.surfaces();
      if (save?.job) this.giveMade(recipeDef(save.job));
    });
    this.makeDevices();
    this.ui = new CraftUi(host.ui.root, {
      rows: () => this.rows(),
      stock: () => this.host.stock,
      craft: (id) => this.craft(id),
      close: () => this.closeBench(),
    });
    if (!document.getElementById('mc-ws-css')) {
      const st = document.createElement('style');
      st.id = 'mc-ws-css';
      st.textContent = BUBBLE_CSS;
      document.head.appendChild(st);
    }
    this.hud = document.createElement('div');
    this.hud.className = 'mc-ws';
    this.hud.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:3';
    host.ui.root.appendChild(this.hud);
    if (save?.cap) this.capOpen = true;
  }

  /** there is power: the generator runs */
  get power(): boolean {
    return this.gen.on;
  }

  /** the bench is making something (its blows) */
  get crafting(): boolean {
    return !!this.job;
  }

  /** (x, z) is under one of the machines or right before it (things are not laid out there at the start) */
  occupies(x: number, z: number): boolean {
    for (const s of [this.plan.generator, this.plan.recycler, this.plan.bench]) if (Math.hypot(x - s.x, z - s.z) < 1.25) return true;
    return false;
  }

  // ------------------------------------------------------------------ the scene

  private surfaces(): void {
    const b = this.plan.bench;
    const r = this.plan.recycler;
    // (the bench's top, the plate let into it; the rotors at the bottom of the hopper)
    const top = this.bm.marks.get('M_craft') ? this.worldOf(this.bm.mark('M_craft', this.v1, [0, 0.92, 0])).y : this.host.groundAt(b.x, b.z) + 0.92;
    this.host.addSurface(b.x - 0.37, b.x + 0.37, b.z - 0.8, b.z + 0.8, top);
    const grind = this.worldOf(this.rm.mark('M_grind', this.v1, [0, 0.85, 0])).y;
    this.host.addSurface(r.x - 0.16, r.x + 0.16, r.z - 0.26, r.z + 0.26, grind);
  }

  /** a render-space point as world */
  private worldOf(p: THREE.Vector3): THREE.Vector3 {
    const o = this.host.origin;
    return p.set(p.x + o.x, p.y + o.y, p.z + o.z);
  }

  /** render space → the garage root's own frame (where the smoke and the cable hang) */
  private rootLocal(p: THREE.Vector3): THREE.Vector3 {
    this.host.root.updateMatrixWorld(true);
    return this.host.root.worldToLocal(p);
  }

  private placeSmoke(): void {
    const p = this.rootLocal(this.gm.mark('M_exhaust_out', this.v1, [-0.2, 0.55, -0.3]));
    (this.smoke.material as THREE.ShaderMaterial).uniforms.uSmokeAt.value.copy(p);
  }

  /** the cable: generator → switch box → the recycler, and on over the doors to the bench */
  private layCable(): void {
    for (const c of this.cable) {
      c.removeFromParent();
      c.geometry.dispose();
    }
    this.cable.length = 0;
    const P = (a: [number, number, number]): THREE.Vector3 => new THREE.Vector3(a[0], a[1], a[2]);
    const local = (p: THREE.Vector3): THREE.Vector3 => this.rootLocal(p.clone());
    const gs = local(this.gm.mark('M_socket', this.v1, [0.27, 0.3, 0.25]));
    const rs = local(this.rm.mark('M_socket', this.v1, [0, 0.45, 0.48]));
    const bs = local(this.bm.mark('M_socket', this.v1, [-0.3, 1.6, -0.6]));
    const c = this.plan.cable;
    // (the garage root's frame is the world's)
    const runs = [
      [gs, ...c.toBox.map(P), P(c.box)],
      [P(c.box), ...c.toRecycler.map(P), rs],
      [P(c.box), ...c.toBench.map(P), bs],
    ];
    const look = this.mats.look('ws:cable', { paint: 0x222222, paint2: 0x222222 });
    for (const pts of runs) {
      const m = cableMesh(pts);
      applyMaterials(m, look);
      this.host.root.add(m);
      this.cable.push(m);
    }
  }

  // ------------------------------------------------------------------ the devices

  /** the tank's cap */
  capOpen = false;

  private makeDevices(): void {
    const self = this;
    const gm = this.gm;
    const at = (m: Machine, mark: string, fb: [number, number, number]): THREE.Vector3 => this.worldOf(m.mark(mark, new THREE.Vector3(), fb));
    // the generator's rope: held down, a pull; running, E stops it
    const cordAt = (): THREE.Vector3 => at(gm, 'M_cord_exit', [0.27, 0.28, -0.18]);
    this.devices.push({
      id: 'gen_cord',
      get x() {
        return cordAt().x;
      },
      get y() {
        return cordAt().y;
      },
      get z() {
        return cordAt().z;
      },
      radius: 0.2,
      get word(): Text {
        return self.gen.on ? text('关掉发电机', 'Stop the generator') : text('拉启动绳', 'Pull the starter rope');
      },
      // (its tank empty: pulling would do nothing — said when pressed)
      get why(): Text | null {
        return !self.gen.on && generatorFuel(self.gen).empty ? text('没油了', 'No fuel') : null;
      },
      get holdS() {
        return self.gen.on ? undefined : 0.6;
      },
      get card() {
        return self.genCard();
      },
      holding: (p) => {
        this.pullP = p;
        this.pullHeld = true;
      },
      use: () => (this.gen.on ? this.stop() : this.pull()),
    });
    // its switch: off (and a click when it is off already)
    const swAt = (): THREE.Vector3 => {
      const sw = gm.movers.get('SWITCH');
      return sw ? this.worldOf(sw.getWorldPosition(new THREE.Vector3())) : at(gm, 'M_socket', [0.27, 0.4, 0.2]);
    };
    this.devices.push({
      id: 'gen_switch',
      get x() {
        return swAt().x;
      },
      get y() {
        return swAt().y;
      },
      get z() {
        return swAt().z;
      },
      radius: 0.12,
      get word(): Text {
        return self.gen.on ? text('关掉发电机', 'Stop the generator') : text('开关', 'Switch');
      },
      get why(): Text | null {
        return self.gen.on ? null : text('先拉启动绳', 'Pull the rope first');
      },
      get card() {
        return self.genCard();
      },
      use: () => {
        if (this.gen.on) this.stop();
        else this.host.sound('gen_switch', 0.6);
      },
    });
    // the recycler: a thing held up to it goes in
    const mouth = (): THREE.Vector3 => at(this.rm, 'M_intake', [0, 1.15, 0]);
    this.devices.push({
      id: 'recycler',
      get x() {
        return mouth().x;
      },
      get y() {
        return mouth().y;
      },
      get z() {
        return mouth().z;
      },
      radius: 0.42,
      get word(): Text {
        return text('回收', 'Recycle');
      },
      // (empty hands: nothing to put in — said when pressed)
      get why(): Text | null {
        return self.power ? text('拿着东西来回收', 'Bring something') : text('没电', 'No power');
      },
      get card() {
        return self.recyclerCard();
      },
      take: (h) => {
        const y = salvageOfHeld(h);
        const s = salvageText(y);
        if (!s) return { ok: false, word: text('回收不了', 'That cannot be recycled') };
        const keep = this.host.keep?.(h);
        if (keep) return { ok: false, word: keep };
        if (!this.power) return { ok: false, word: text('没电', 'No power') };
        // (a thing with things in it goes in with them: what they give is counted in, and said)
        const inside = h.kind === 'item' ? (h.item.inside?.length ?? 0) : 0;
        void inside;
        return { ok: true, word: text(`回收 <b>${heldName(h)}</b>`, `Recycle the ${heldName(h)}`) };
      },
      useWith: (h) => this.recycle(h),
      use: () => {
        if (!this.power) this.host.sound('no_power', 0.7);
      },
    });
    // the bench
    const benchAt = (): THREE.Vector3 => at(this.bm, 'M_craft', [0.05, 0.92, 0]).add(this.v3.set(0, 0.12, 0));
    this.devices.push({
      id: 'bench',
      get x() {
        return benchAt().x;
      },
      get y() {
        return benchAt().y;
      },
      get z() {
        return benchAt().z;
      },
      radius: 0.5,
      get word(): Text {
        return text('打开工作台', 'Open the workbench');
      },
      get why(): Text | null {
        return self.power ? null : text('没电', 'No power');
      },
      get card() {
        return self.benchCard();
      },
      use: () => {
        if (!this.power) {
          this.host.sound('no_power', 0.7);
          return;
        }
        this.openBench();
      },
    });
    // the generator's tank: its cap, and a jerrycan held to it
    const fillAt = (): THREE.Vector3 => gm.mark('M_filler', new THREE.Vector3(), [0.1, 0.62, -0.1]);
    const port: TankPort = {
      id: 'generator',
      tank: this.gen.tank,
      name: '发电机的油箱',
      get open() {
        return self.capOpen;
      },
      set open(v: boolean) {
        self.capOpen = v;
      },
      hit: (ray, reach) => {
        const c = fillAt();
        this.hb.setFromCenterAndSize(c, this.v2.set(0.14, 0.12, 0.14));
        const p = ray.intersectBox(this.hb, this.v3);
        if (!p) return null;
        const d = p.distanceTo(ray.origin);
        return d <= reach ? d : null;
      },
      mouth: (m, out) => {
        m.copy(fillAt());
        out.set(0, 1, 0);
        return true;
      },
      get card() {
        return self.genCard();
      },
      changed: () => {
        this.needleB = -1;
      },
    };
    this.tanks.push(port);
  }

  // ------------------------------------------------------------------ the generator

  private pull(): void {
    const r = pullCord(this.gen, Math.random());
    this.host.sound('cord_pull');
    this.cordBack = 0.25;
    if (r === 'caught') {
      this.host.sound('power_on');
      this.host.ui.say('来电了', 2);
    } else if (r === 'cough') {
      this.crankT = 0.5;
      this.host.sound('gen_cough');
      const f = generatorFuel(this.gen);
      this.host.flash(f.why?.zh ?? '着不了');
    } else {
      this.crankT = 0.5;
      this.host.flash(generatorFuel(this.gen).empty ? '没油了' : '没着');
    }
  }

  private stop(): void {
    stopGenerator(this.gen);
    this.host.sound('gen_switch');
    this.host.sound('power_off');
    this.host.ui.say('停电了', 2);
  }

  private genCard(): ItemCard {
    const g = this.gen;
    const f = generatorFuel(g);
    const left = generatorLeft(g, this.spec);
    const card: ItemCard = {
      key: 'ws:generator',
      icon: 'device',
      cat: '车库设备',
      name: '旧发电机',
      stars: 1,
      badges: [],
      blurb: '门外的老柴油发电机，给车库供电。',
      rows: [
        { value: g.on ? '在转' : '停着', label: '现在', tone: g.on ? 'good' : undefined },
        ...(f.runs ? [{ value: left >= 3600 ? `${(left / 3600).toFixed(1)} 小时` : `${Math.round(left / 60)} 分钟`, label: g.on ? '还能转' : '油够转' }] : []),
        { value: `${(this.spec.burn * 60).toFixed(2)} L/分钟`, label: '耗油' },
      ],
      bars: [fuelBar('油箱', g.tank.fuel, g.tank.capacity)],
      notes: [],
      foot: {},
    };
    if (f.why && !g.on) card.notes.push({ text: f.why.zh, tone: 'warn' });
    if (f.runs && f.burnK > 1) card.notes.push({ text: '油里混了汽油：费油', tone: 'warn' });
    if (this.capOpen) card.notes.push({ text: '油箱盖开着', tone: 'info' });
    return card;
  }

  private recyclerCard(): ItemCard {
    const s = this.host.stock;
    return {
      key: 'ws:recycler',
      icon: 'device',
      cat: '车库设备',
      name: '回收台',
      stars: 0,
      badges: [],
      blurb: '把东西绞碎，换成材料。',
      rows: [
        { value: this.power ? '有电' : '没电', label: '现在', tone: this.power ? 'good' : 'bad' },
        ...MATERIAL_IDS.map((m) => ({ value: String(s[m]), label: MATERIALS[m].name.zh })),
        ...(this.going.length ? [{ value: `${this.going.length} 件`, label: '正在绞' }] : []),
      ],
      bars: [],
      notes: this.power ? [] : [{ text: '没电', tone: 'warn' }],
      foot: {},
    };
  }

  private benchCard(): ItemCard {
    const s = this.host.stock;
    return {
      key: 'ws:bench',
      icon: 'device',
      cat: '车库设备',
      name: '工作台',
      stars: 0,
      badges: [],
      blurb: '学会做的东西，在这里用材料做出来。',
      rows: [{ value: this.power ? '有电' : '没电', label: '现在', tone: this.power ? 'good' : 'bad' }, ...MATERIAL_IDS.map((m) => ({ value: String(s[m]), label: MATERIALS[m].name.zh }))],
      bars: [],
      notes: this.power ? [] : [{ text: '没电', tone: 'warn' }],
      foot: {},
    };
  }

  // ------------------------------------------------------------------ the recycler

  /**
   * A thing into the hopper (from the hands, or put down into it). What it gives is settled here, as it goes
   * in: a stack gives its kind's for every one of it, a thing that holds things what is in it as well
   * (items.ts salvageOf), counted up over the one grinding however many there are.
   */
  recycle(h: NonNullable<Held>, from?: THREE.Vector3): void {
    const y = salvageOfHeld(h);
    this.host.recycled?.(h);
    const n = ++this.nIn;
    const owner = `ws:in:${n}`;
    const cam = this.host.camera;
    const start = from?.clone() ?? cam.getWorldPosition(new THREE.Vector3()).add(this.v1.set(0, -0.25, -0.55).applyQuaternion(cam.quaternion));
    const g: InGoing = { core: newIngest(y), obj: null, owner, from: start, seed: Math.random() * 10, grind: grindOf(h), shredded: false };
    this.going.push(g);
    this.host.sound('putdown', 2);
    // its model, as it would lie
    void this.host.loose.objectFor(h).then((obj) => {
      if (!this.going.includes(g)) return;
      // (an item in its own colours: a jacket's tint, not only its kind's)
      const look = this.mats.look(owner, h.kind === 'part' ? partLook(h.inst) : h.kind === 'tool' ? toolLook(h.tool) : itemPaint(h.item));
      applyMaterials(obj, look);
      // (anything big is made to fit the hopper's mouth)
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(this.v2);
      const k = Math.min(1, 0.5 / Math.max(0.05, size.x, size.y, size.z));
      const c = box.getCenter(this.v3);
      const wrap = new THREE.Group();
      obj.position.sub(c);
      wrap.add(obj);
      wrap.userData.k = k;
      obj.traverse((o) => {
        o.layers.disable(LAYER_SHADOW_FAR);
        o.layers.disable(LAYER_SHADOW_NEAR);
      });
      this.host.root.add(wrap);
      g.obj = wrap;
      this.poseIngest(g);
    });
  }

  private poseIngest(g: InGoing): void {
    if (!g.obj) return;
    const p = ingestPose(g.core.t, g.seed);
    const mouth = this.rm.mark('M_intake', this.v1, [0, 1.15, 0]);
    const at = this.v2.copy(g.from).lerp(mouth, p.toMouth);
    at.y = g.core.t < RECYCLE.glide ? g.from.y + (mouth.y - p.down + 0.12 - g.from.y) * p.toMouth : mouth.y - p.down;
    at.x += p.wobble;
    this.rootLocal(at);
    g.obj.position.copy(at);
    const k = g.obj.userData.k as number;
    g.obj.scale.setScalar(k * p.scale);
    g.obj.rotation.set(p.tilt, g.seed + g.core.t * 0.6, -p.tilt * 0.7);
  }

  private stepRecycler(dt: number): void {
    const powered = this.power;
    const r = stepIngests(
      this.going.map((g) => g.core),
      dt,
      powered,
    );
    // the counts over the machine
    for (const m of MATERIAL_IDS) {
      const n = r.add[m] ?? 0;
      if (n <= 0) continue;
      let t = this.tallies.find((x) => x.mat === m);
      if (!t) {
        const el = document.createElement('div');
        el.className = 'mc-tally';
        this.hud.appendChild(el);
        t = { mat: m, n: 0, el, idle: 0, pop: 0 };
        this.tallies.push(t);
      }
      const before = Math.floor(t.n / RECYCLE.tallyStep);
      t.n += n;
      t.idle = 0;
      if (Math.floor(t.n / RECYCLE.tallyStep) > before || t.n < RECYCLE.tallyStep) {
        t.el.classList.remove('pop');
        void t.el.offsetWidth;
        t.el.classList.add('pop');
        this.host.sound('tally', 0.5 * this.near(this.rm));
      }
      t.el.innerHTML = `${materialIcon(m)}<span>+${t.n} ${MATERIALS[m].name.zh}</span>`;
      this.host.stock[m] += n;
    }
    if (costTotal(r.add) > 0) this.host.stockChanged(r.add);
    for (const g of [...this.going]) {
      // the grinding starts: its own crunch
      if (powered && !g.shredded && g.core.t >= RECYCLE.glide) {
        g.shredded = true;
        this.host.sound(`shred_${g.grind}`, this.near(this.rm));
      }
      this.poseIngest(g);
      if (r.done.includes(g.core)) {
        this.going.splice(this.going.indexOf(g), 1);
        if (g.obj) {
          g.obj.removeFromParent();
          g.obj.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh) mesh.geometry?.dispose?.();
          });
        }
        this.mats.drop(g.owner);
      }
    }
    // things put down into the hopper go in too (with the power on)
    if (powered) {
      const m = this.worldOf(this.rm.mark('M_intake', this.v1, [0, 1.15, 0]));
      const gr = this.worldOf(this.rm.mark('M_grind', this.v2, [0, 0.85, 0]));
      for (const l of [...this.host.loose.list]) {
        if (l.riding || Math.abs(l.x - m.x) > 0.3 || Math.abs(l.z - m.z) > 0.36 || l.y < gr.y - 0.25 || l.y > m.y + 0.3) continue;
        const h: NonNullable<Held> = l.part ? { kind: 'part', inst: l.part } : l.tool ? { kind: 'tool', tool: l.tool } : { kind: 'item', item: l.item! };
        if (!salvageText(salvageOfHeld(h))) continue;
        const from = new THREE.Vector3(l.x - this.host.origin.x, l.y - this.host.origin.y + 0.1, l.z - this.host.origin.z);
        this.host.loose.remove(l);
        this.recycle(h, from);
      }
    }
    // the rotors: idling with the power on, fast while something is ground
    const grinding = this.going.some((g) => g.core.t >= RECYCLE.glide);
    const want = powered ? (grinding ? 11 : 2.6) : 0;
    this.rotorW += (want - this.rotorW) * Math.min(1, dt * 3);
    this.rotorA += this.rotorW * dt;
    const ra = this.rm.movers.get('ROTOR_A');
    const rb = this.rm.movers.get('ROTOR_B');
    const restA = this.rm.rest.get('ROTOR_A');
    const restB = this.rm.rest.get('ROTOR_B');
    if (ra && restA) ra.quaternion.copy(restA.q).multiply(this.q1.setFromAxisAngle(this.v3.set(0, 0, 1), this.rotorA));
    if (rb && restB) rb.quaternion.copy(restB.q).multiply(this.q1.setFromAxisAngle(this.v3.set(0, 0, 1), -this.rotorA * 1.07));
    this.rm.setLamp(powered ? 1 : 0);
    const near = this.near(this.rm);
    if (powered && near > 0.03) this.host.loop('recycler_run', near);
    if (grinding && near > 0.03) this.host.loop('recycler_grind', near);
    // the counts linger, then rise and fade
    for (const t of [...this.tallies]) {
      t.idle += dt;
      const busy = this.going.length > 0;
      if (busy) t.idle = Math.min(t.idle, 0.2);
      const life = 1.4;
      const fade = Math.max(0, Math.min(1, (t.idle - life) / 0.45));
      t.el.style.opacity = (1 - fade).toFixed(2);
      t.pop = fade * 40;
      if (fade >= 1) {
        t.el.remove();
        this.tallies.splice(this.tallies.indexOf(t), 1);
      }
    }
    if (this.tallies.length) {
      const p = this.rm.mark('M_intake', this.v1, [0, 1.15, 0]).add(this.v2.set(0, 0.42, 0));
      this.tallies.forEach((t, i) => this.placeLabel(t.el, p, -t.pop - i * 44, 150 + i * 44));
    }
  }

  /** how loud a machine's sound is from where one stands: full within a couple of metres, falling off beyond */
  private near(m: Machine): number {
    const d = this.ear.distanceTo(m.root.position.clone().applyMatrix4(this.host.root.matrixWorld));
    return 1 / (1 + Math.max(0, d - 1.5) ** 2 / 9);
  }

  /** a label at a point of the scene (render space), raised by dy screen px */
  private placeLabel(el: HTMLElement, p: THREE.Vector3, dy: number, minTop = 0): void {
    const cam = this.host.camera;
    const s = this.host.ui.hudScale;
    const q = this.v3.copy(p).project(cam);
    const behind = q.z > 1;
    el.style.display = behind ? 'none' : '';
    el.style.left = `${(((q.x + 1) / 2) * window.innerWidth) / s}px`;
    el.style.top = `${Math.max(minTop, (((1 - q.y) / 2) * window.innerHeight) / s + dy)}px`;
  }

  // ------------------------------------------------------------------ the bench

  /** what the bench's list has: what one knows how to make, and nothing that is still to be learnt */
  private rows(): CraftRow[] {
    return RECIPES.filter((r) => recipeOpen(r, this.host.learned)).map((r) => {
      const h = heldOfMakes(r.makes);
      return { recipe: r, open: true, name: this.nameOf(r.makes), icon: this.host.iconOf(h), card: this.host.cardOf(h), hits: hits(r.cost) };
    });
  }

  private nameOf(m: Makes): string {
    if (m.kind === 'tool') return m.tool === 'scraper' ? SCRAPERS[m.tier ?? 1].name.zh : toolName(newTool(m.tool, { litres: 0, ...(m.tier ? { tier: m.tier } : {}), ...(m.colour !== undefined ? { colour: m.colour } : {}) }));
    if (m.kind === 'item') return itemDef(m.item).name.zh;
    return m.tire ? `${partDef(m.part).name.zh} + ${partDef(m.tire).name.zh}` : partDef(m.part).name.zh;
  }

  openBench(): void {
    if (this.open) return;
    this.open = true;
    this.host.benchMode(true);
    this.ui.show();
    this.host.sound('craft_start', 0.6);
  }

  closeBench(): void {
    if (!this.open || this.job) return;
    this.open = false;
    this.ui.hide();
    this.host.benchMode(false);
  }

  /** where the camera sits at the bench, and what it looks at (render space) */
  benchView(eye: THREE.Vector3, at: THREE.Vector3): void {
    this.bm.mark('M_eye', eye, [0.67, 1.47, 0]);
    this.bm.mark('M_craft', at, [0.05, 0.92, 0]);
    at.y += 0.06;
  }

  /** "make it": the whole cost taken now, then the blows */
  private craft(id: string): void {
    if (this.job) return;
    const r = recipeDef(id);
    if (!recipeOpen(r, this.host.learned)) return;
    const s = this.host.stock;
    const short = shortOf(s, r.cost);
    if (short) {
      this.host.flash(`还差 ${short.n} ${MATERIALS[short.mat].name.zh}`);
      return;
    }
    spend(s, r.cost);
    const delta: Cost = {};
    for (const m of MATERIAL_IDS) if (r.cost[m]) delta[m] = -(r.cost[m] ?? 0);
    this.host.stockChanged(delta);
    this.ui.hide();
    const n = hits(r.cost);
    this.job = { recipe: r, hits: n, struck: 0, bubbles: [], ghost: null, blow: -1, blowT: 0, finish: -1, given: false };
    const job = this.job;
    this.host.sound('craft_start', 0.8);
    // the places to strike: along the plate at once, onto the ghost's top when its model is in
    const plate = this.bm.mark('M_craft', new THREE.Vector3(), [0.05, 0.92, 0]);
    const side = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.plan.bench.heading);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * 0.24;
      const p = plate.clone().addScaledVector(side, t);
      p.y += 0.05;
      const el = document.createElement('button');
      el.className = 'mc-blow';
      el.innerHTML = HAMMER_ICON;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.strike(i);
      });
      this.hud.appendChild(el);
      job.bubbles.push({ at: p, el, done: false });
    }
    // the ghost of the thing on the plate
    const h = heldOfMakes(r.makes);
    void this.host.loose.objectFor(h).then((obj) => {
      if (this.job !== job || job.given) return;
      applyGhost(obj, 'empty', true);
      const g = new THREE.Group();
      g.add(obj);
      const at = this.rootLocal(this.bm.mark('M_craft', this.v1, [0.05, 0.92, 0]));
      g.position.copy(at);
      g.rotation.y = -this.plan.bench.heading + Math.PI / 2;
      this.host.root.add(g);
      job.ghost = g;
      g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g);
      const size = box.getSize(this.v2);
      const c = box.getCenter(this.v3);
      const along = size.x >= size.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      // (spread over most of its length, never closer than a hand's width: a small thing still has room for three)
      const len = Math.max(size.x, size.z, 0.4);
      job.bubbles.forEach((b, i) => {
        if (b.done) return;
        const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * 0.6;
        b.at.copy(c).addScaledVector(along, t * len);
        b.at.y = box.max.y + BUBBLE_LIFT;
      });
    });
  }

  /** strike a bubble (or, -1, the next one left) */
  strike(i = -1): void {
    const j = this.job;
    if (!j || j.blow >= 0 || j.finish >= 0) return;
    const k = i >= 0 ? i : j.bubbles.findIndex((b) => !b.done);
    const b = j.bubbles[k];
    if (!b || b.done) return;
    j.blow = k;
    j.blowT = 0;
    this.host.sound('hammer_swing', 0.7);
  }

  /** a key while the bench is open (true: used) */
  key(code: string): boolean {
    if (!this.open) return false;
    if (this.job) {
      if (code === 'KeyE' || code === 'Space' || code === 'Enter') {
        this.strike();
        return true;
      }
      return code === 'Escape';
    }
    if (code === 'Escape' || code === 'KeyE' || code === 'Tab') {
      this.closeBench();
      return true;
    }
    return this.ui.key(code);
  }

  private stepBench(dt: number): void {
    this.bm.setLamp(this.power ? 1 : 0);
    this.ui.update(dt);
    const j = this.job;
    if (!j) {
      if (this.hammer) this.hammer.visible = false;
      return;
    }
    for (const b of j.bubbles) if (!b.done) this.placeLabel(b.el, b.at, 0);
    this.stepHammer(dt, j);
    if (j.finish >= 0) {
      j.finish += dt;
      if (j.finish >= CRAFT.completion && !j.given) {
        j.given = true;
        this.giveMade(j.recipe);
        j.ghost?.removeFromParent();
        j.ghost = null;
      }
      if (j.finish >= CRAFT.completion + 0.7) {
        for (const b of j.bubbles) b.el.remove();
        this.job = null;
        this.open = false;
        this.host.benchMode(false);
      }
    }
  }

  /** the hammer: up over 0.3 s, down onto the bubble in 0.1, back in 0.22 */
  private stepHammer(dt: number, j: Job): void {
    if (!this.hammer && !this.hammerHeld) {
      this.hammerHeld = true;
      void toolGlb('claw_hammer').then((m) => {
        const g = new THREE.Group();
        let obj: THREE.Object3D;
        if (m) obj = cloneModel(m);
        else {
          obj = new THREE.Group();
          const mh = new THREE.MeshStandardMaterial();
          mh.name = 'wood';
          const handle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.03), mh);
          handle.position.x = 0.15;
          const ms = new THREE.MeshStandardMaterial();
          ms.name = 'steel';
          const head = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.12), ms);
          head.position.x = 0.31;
          obj.add(handle, head);
        }
        applyMaterials(obj, this.mats.look('ws:hammer', { paint: 0x9e3b2f, paint2: 0x2f3236 }));
        obj.traverse((o) => {
          o.layers.disable(LAYER_SHADOW_FAR);
          o.layers.disable(LAYER_SHADOW_NEAR);
          o.frustumCulled = false;
        });
        g.add(obj);
        this.host.root.add(g);
        this.hammer = g;
      });
    }
    const hm = this.hammer;
    if (hm) hm.visible = true;
    const cam = this.host.camera;
    // rest: low on the right of the view, the head up
    const rest = this.v1.set(0.24, -0.2, -0.5).applyQuaternion(cam.quaternion).add(cam.position);
    let pos = rest.clone();
    let lift = 0;
    if (j.blow >= 0) {
      j.blowT += dt;
      const b = j.bubbles[j.blow];
      const t = j.blowT;
      const up = this.v2.set(0.2, 0.08, -0.42).applyQuaternion(cam.quaternion).add(cam.position);
      // (the head lands on the thing under the bubble: the hammer a little back towards the eye from it)
      const on = this.v4.copy(b.at);
      on.y -= BUBBLE_LIFT;
      const hit = this.v3.copy(on).add(new THREE.Vector3().subVectors(cam.position, on).normalize().multiplyScalar(0.05));
      if (t < CRAFT.windup) {
        const k = t / CRAFT.windup;
        pos = rest.clone().lerp(up, k * k * (3 - 2 * k));
        lift = k;
      } else if (t < CRAFT.windup + CRAFT.impact) {
        const k = (t - CRAFT.windup) / CRAFT.impact;
        pos = up.clone().lerp(hit, k * k);
        lift = 1 - k * 1.6;
      } else {
        if (!b.done) {
          b.done = true;
          b.el.classList.add('done');
          j.struck++;
          this.shake = 1;
          const w = this.worldOf(b.at.clone());
          w.y -= BUBBLE_LIFT;
          this.host.sparks(w.x, w.y, w.z, 14);
          const mat = j.recipe.makes.kind === 'tool' && j.recipe.makes.tool === 'scraper' && (j.recipe.makes.tier ?? 1) === 1 ? 'plastic' : SOFT_MADE.has(j.recipe.id) ? 'wood' : 'metal';
          this.host.sound(`hammer_hit_${mat}`);
          if (j.struck >= j.hits) j.finish = 0;
        }
        const k = Math.min(1, (t - CRAFT.windup - CRAFT.impact) / CRAFT.recovery);
        pos = hit.clone().lerp(rest, k * k * (3 - 2 * k));
        lift = -0.6 * (1 - k);
        if (t >= BLOW_S) j.blow = -1;
      }
    }
    if (!hm) return;
    this.rootLocal(pos);
    hm.position.copy(pos);
    hm.quaternion.copy(cam.quaternion).multiply(this.q1.setFromEuler(new THREE.Euler(0.3, Math.PI / 2 + 0.4, 0.9 + 1.1 * lift)));
  }

  /** the thing made, on the bench's plate */
  private giveMade(r: Recipe): void {
    const h = heldOfMakes(r.makes);
    const p = this.worldOf(this.bm.mark('M_craft', this.v1, [0.05, 0.92, 0]));
    const yaw = -this.plan.bench.heading + Math.PI / 2;
    // (its lowest point on the plate, whatever its model's origin)
    const L = this.host.loose;
    L.seat(h.kind === 'part' ? L.addPart(h.inst, p.x, p.y + 0.05, p.z, yaw) : h.kind === 'tool' ? L.addTool(h.tool, p.x, p.y + 0.05, p.z, yaw) : L.addItem(h.item, p.x, p.y + 0.05, p.z, yaw), p.y);
    this.host.sound('craft_done');
    this.host.sparks(p.x, p.y + 0.1, p.z, 24);
    this.host.ui.say(`做好了：${this.nameOf(r.makes)}`, 2.6);
    this.host.crafted(r.id);
  }

  // ------------------------------------------------------------------ every frame

  update(dt: number, eye: THREE.Vector3): void {
    this.time += dt;
    const o = this.host.origin;
    this.ear.set(eye.x - o.x, eye.y - o.y, eye.z - o.z);
    // the generator
    const was = this.gen.on;
    const ev = stepGenerator(this.gen, this.spec, dt);
    if (ev === 'dry') {
      this.host.sound('gen_cough');
      this.host.sound('power_off');
      this.host.ui.say('发电机没油了，车库停电了。', 3);
    } else if (ev === 'choked') {
      this.host.sound('gen_cough');
      this.host.ui.say('发电机熄火了', 2.4);
    }
    void was;
    this.stepGenerator(dt, eye);
    this.stepRecycler(dt);
    this.stepBench(dt);
    this.shake = Math.max(0, this.shake - dt * 5);
    this.pullHeld = false;
  }

  /** the shake of a blow (0 … 1) for the camera at the bench */
  get blowShake(): number {
    return this.shake;
  }

  private stepGenerator(dt: number, eye: THREE.Vector3): void {
    const gm = this.gm;
    const on = this.gen.on;
    // the rope: out while held, back again when let go (or the pull is done)
    const cord = gm.movers.get('CORD');
    const cr = gm.rest.get('CORD');
    if (!this.pullHeld) this.pullP = Math.max(0, this.pullP - dt / 0.25);
    if (this.cordBack > 0) this.cordBack -= dt;
    const out = this.pullHeld ? Math.pow(this.pullP, 1.6) : this.pullP;
    if (cord && cr) cord.position.copy(cr.p).add(this.v1.set(0.45 * out, 0.06 * out, 0));
    // pulling turns it over
    if (this.pullHeld && this.pullP > 0.3) this.crankT = Math.max(this.crankT, 0.1);
    this.crankT = Math.max(0, this.crankT - dt);
    // the switch, the lamp, the needle, the cap
    this.switchB += ((on ? 1 : 0) - this.switchB) * Math.min(1, dt * 14);
    const sw = gm.movers.get('SWITCH');
    const sr = gm.rest.get('SWITCH');
    if (sw && sr) sw.quaternion.copy(sr.q).multiply(this.q1.setFromAxisAngle(this.v3.set(0, 0, 1), (this.switchB - 0.5) * 1.0));
    gm.setLamp(on ? 1 : 0);
    const fill = tankLitres(this.gen.tank) / this.gen.tank.capacity;
    this.needleB = this.needleB < 0 ? fill : this.needleB + (fill - this.needleB) * Math.min(1, dt * 4);
    const nd = gm.movers.get('NEEDLE');
    const nr = gm.rest.get('NEEDLE');
    if (nd && nr) nd.quaternion.copy(nr.q).multiply(this.q1.setFromAxisAngle(this.v3.set(0, 1, 0), ((-60 + 120 * this.needleB) * Math.PI) / 180));
    const cap = gm.movers.get('CAP');
    const cpr = gm.rest.get('CAP');
    if (cap && cpr) {
      if (this.capOpen) {
        cap.position.copy(cpr.p).add(this.v1.set(0, 0.0075, 0.075));
        cap.quaternion.copy(cpr.q).multiply(this.q1.setFromAxisAngle(this.v3.set(1, 0, 0), Math.PI / 2));
      } else {
        cap.position.copy(cpr.p);
        cap.quaternion.copy(cpr.q);
      }
    }
    // running: it shakes, it smokes, it is heard
    const sp = this.plan.generator;
    const base = this.host.groundAt(sp.x, sp.z);
    if (on) {
      const t = this.time;
      gm.root.position.set(sp.x + 0.0012 * Math.sin(t * 157), base + 0.0015 * Math.abs(Math.sin(t * 78.5)), sp.z + 0.001 * Math.sin(t * 113 + 1));
      gm.root.rotation.set(0.004 * Math.sin(t * 37), -sp.heading, 0.003 * Math.sin(t * 41 + 0.7));
    } else {
      gm.root.position.set(sp.x, base, sp.z);
      gm.root.rotation.set(0, -sp.heading, 0);
    }
    // (from inside the workshop the generator is round the corner of the wall: its smoke is not drawn
    // through the wall)
    const inside = eye.x < this.plan.generator.x - 0.45 && Math.abs(eye.z) < 5.1;
    const sm = (this.smoke.material as THREE.ShaderMaterial).uniforms.uAlpha;
    sm.value += ((on && !inside ? 1 : 0) - sm.value) * Math.min(1, dt * (on && !inside ? 2 : inside ? 20 : 0.8));
    this.smoke.visible = sm.value > 0.01;
    const at = gm.mark('M_exhaust_out', this.v2, [-0.2, 0.55, -0.3]);
    const grinding = this.going.some((g) => g.core.t >= RECYCLE.glide);
    if (grinding && !this.wasGrinding) this.dip = 140;
    this.wasGrinding = grinding;
    this.dip *= Math.exp(-dt * 3);
    const load = grinding ? 0.6 : this.job ? 0.3 : 0.15;
    if (on || this.crankT > 0) this.host.genSound({ running: on, cranking: !on && this.crankT > 0, rpm: on ? 3000 + 60 * Math.sin(this.time * 1.3) - this.dip : 450, load, at });
    else this.host.genSound(null);
  }

  // ------------------------------------------------------------------ the save

  snapshot(): WorkshopSave {
    // (what is half way into the recycler counted at once)
    if (this.going.length) {
      const rest = this.host.stock;
      flushIngests(
        this.going.map((g) => g.core),
        rest,
      );
      for (const g of this.going) {
        g.obj?.removeFromParent();
        this.mats.drop(g.owner);
      }
      this.going.length = 0;
    }
    return { gen: JSON.parse(JSON.stringify(this.gen)) as GeneratorState, ...(this.capOpen ? { cap: true } : {}), ...(this.job && !this.job.given ? { job: this.job.recipe.id } : {}) };
  }

  /** the things lying in the recycler's hopper (waiting for the power) */
  private inHopper(): number {
    const m = this.worldOf(this.rm.mark('M_intake', this.v1, [0, 1.15, 0]));
    const gr = this.worldOf(this.rm.mark('M_grind', this.v2, [0, 0.85, 0]));
    return this.host.loose.list.filter((l) => !l.riding && Math.abs(l.x - m.x) <= 0.3 && Math.abs(l.z - m.z) <= 0.36 && l.y >= gr.y - 0.25 && l.y <= m.y + 0.3).length;
  }

  telemetry(): Record<string, unknown> {
    return {
      power: this.power,
      inHopper: this.inHopper(),
      gen: { on: this.gen.on, litres: Math.round(tankLitres(this.gen.tank) * 100) / 100, fuel: this.gen.tank.fuel, pulls: this.gen.pulls, cold: Math.round(this.gen.cold * 100) / 100, cap: this.capOpen },
      going: this.going.length,
      bench: { open: this.open, job: this.job?.recipe.id ?? null, struck: this.job?.struck ?? 0, hits: this.job?.hits ?? 0, finish: this.job?.finish ?? -1 },
      loaded: { generator: this.gm.marks.size > 0, recycler: this.rm.marks.size > 0, bench: this.bm.marks.size > 0 },
    };
  }

  /** the machines' models are in */
  get ready(): Promise<void> {
    return Promise.all([this.gm.ready, this.rm.ready, this.bm.ready]).then(() => undefined);
  }

  /** can the materials pay for a recipe (the probe) */
  affords(id: string): boolean {
    return canAfford(this.host.stock, recipeDef(id).cost);
  }

  /** the materials' frame for the machines' looks (dust is measured up from their own ground) */
  frame(): void {
    for (const m of [this.gm, this.rm, this.bm]) {
      m.root.updateMatrixWorld(true);
      this.mats.setFrameOf(`ws:${m.id}`, m.root.matrixWorld);
    }
  }

  dispose(): void {
    for (const m of [this.gm, this.rm, this.bm]) m.root.removeFromParent();
    for (const c of this.cable) c.removeFromParent();
    this.smoke.removeFromParent();
    this.hammer?.removeFromParent();
    this.hud.remove();
    this.ui.dispose();
    this.mats.dispose();
  }
}
