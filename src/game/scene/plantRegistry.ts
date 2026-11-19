/**
 * The plant registry of the render side (docs/V3/nodes/W2-flora.md): for every family of model the plant
 * catalogue names (core/world/plants.ts `PlantDef.model`), the model it is drawn with near, the low model it is
 * drawn with far off, the draw it goes in, the shadow it throws, and how a plant's size and colours are put on
 * it. To draw a new family: build its model (plantModels.ts) and add a row to FAMILIES.
 *
 * How twenty and more kinds are drawn without a draw call each. Every model lies in ONE texture, the atlas:
 * four texels to a vertex (place and part; leaf-card coordinates, card flag and the height the wind takes hold
 * at; the normal; the colour). A scatter tile draws its trees as one instanced draw and its shrubs and ground
 * plants as another; each instance says where its model begins in the atlas and how many vertices it has, and
 * the vertex shader (render/floraMaterial.ts) fetches its vertex from there, by its number. So a tile costs
 * the same one or two draws whether it holds two kinds or twelve, each tile is still culled as a whole, and
 * the plants are still instanced by the hardware. Every instance is drawn with as many vertices as the
 * largest model in its draw: the vertices a smaller model does not have fall on one point and are thrown
 * out before they are rasterised.
 *
 * (Why not the other two ways. Pools of instances per kind across tiles draw each kind once, but give up the
 * culling of tiles — everything within 780 m would be sent every frame, two to three times the triangles —
 * or buy it back with sectors, kinds × sectors draws. three's BatchedMesh counts as one call, but that call is
 * a multi-draw of one draw per instance, which the browser's GL layer walks one by one for thousands of
 * plants, and needs an extension not every browser has.)
 *
 * DOM-free: the atlas is plain numbers until `texture` is asked for.
 */
import * as THREE from 'three';
import { PLANTS, type PlantDef } from '../../core/world/plants';
import { PART_LEAF, PART_ROCK, buildPlantModels } from './plantModels';
import { buildPlants } from './vegetation';

/** which draw of a tile a plant goes in: the trees, or the shrubs and what lies on the ground */
export type PlantClass = 'tree' | 'small';

export interface PlantFamily {
  /**
   * The model drawn near (a name of the atlas), the one drawn far off (absent: not drawn beyond the near ring),
   * and for a tree the one drawn furthest off, where it is a few pixels
   */
  near: string;
  far?: string;
  tiny?: string;
  cls: PlantClass;
  /** the height and the radius of the near model that a plant's height and crown are measured against (m) */
  h: number;
  r: number;
  /** the same of its far model (absent: as the near model's), and of its furthest */
  farH?: number;
  farR?: number;
  tinyH?: number;
  tinyR?: number;
  /** the radius of the soft disc it throws on the ground where no shadow map is drawn, at the model's own size (0: none) */
  shadow: number;
  /** what the second colour paints when the plant gives none (0xRRGGBB): bark, a cane, a flower */
  accent?: number;
  /** it lies with the ground it stands on (shrubs, stones, logs); absent: it stands plumb, sunk by the slope under its foot */
  lies?: boolean;
  /** sunk this far into the ground (m) */
  sink?: number;
  /**
   * How it is turned: 'row' along the rows of its field (the x axis: such a plant is its cell's rows, drawn at
   * the model's own measure across whatever its size, and moved onto the field's rows where its region has
   * them), 'sun' towards noon (+z); absent: its own turn
   */
  turn?: 'row' | 'sun';
  /** its lean out of plumb (rad) */
  lean?: number;
}

/** the families the regions' flora tables name (core/world/floraTables.ts through plants.ts) */
export const FAMILIES: Readonly<Record<string, PlantFamily>> = {
  // ---- the first renderer's templates (vegetation.ts)
  broadleaf: { near: 'broadleaf', far: 'broadleafFar', tiny: 'broadleafTiny', tinyH: 5.8, tinyR: 2.9, cls: 'tree', h: 5.6, r: 2.9, farH: 5.8, farR: 3.0, shadow: 1.9, sink: 0.12, lean: 0.05 },
  broadleaf2: { near: 'broadleaf2', far: 'broadleafFar', tiny: 'broadleafTiny', tinyH: 5.8, tinyR: 2.9, cls: 'tree', h: 6.5, r: 2.8, farH: 5.8, farR: 3.0, shadow: 1.8, sink: 0.12, lean: 0.05 },
  broadleaf3: { near: 'broadleaf3', far: 'broadleafFar', tiny: 'broadleafTiny', tinyH: 5.8, tinyR: 2.9, cls: 'tree', h: 5.2, r: 3.3, farH: 5.8, farR: 3.0, shadow: 2.4, sink: 0.12, lean: 0.05 },
  conifer: { near: 'conifer', far: 'coniferFar', tiny: 'coniferTiny', tinyH: 6.4, tinyR: 1.5, cls: 'tree', h: 6.4, r: 1.9, farH: 6.4, farR: 1.75, shadow: 1.5, sink: 0.15, lean: 0.04 },
  conifer2: { near: 'conifer2', far: 'coniferFar', tiny: 'coniferTiny', tinyH: 6.4, tinyR: 1.5, cls: 'tree', h: 7.9, r: 1.5, farH: 6.4, farR: 1.75, shadow: 1.3, sink: 0.15, lean: 0.03 },
  bush: { near: 'bush', far: 'bushFar', cls: 'small', h: 1.45, r: 1.1, farH: 1.6, farR: 1.25, shadow: 0.8, lies: true, sink: 0.05 },
  cactus: { near: 'cactus', far: 'cactusFar', tiny: 'cactusTiny', tinyH: 3.05, tinyR: 0.68, cls: 'tree', h: 3.2, r: 0.7, shadow: 0.5, sink: 0.05, lean: 0.03 },
  rock: { near: 'rock', cls: 'small', h: 0.63, r: 0.62, shadow: 0.6, lies: true, sink: 0.04 },
  // ---- the new trees
  birch: { near: 'birch', far: 'birchFar', tiny: 'birchTiny', tinyH: 7.4, tinyR: 2.1, cls: 'tree', h: 7.3, r: 1.75, farR: 2.0, shadow: 1.3, accent: 0xe9e6dc, sink: 0.05, lean: 0.05 },
  poplar: { near: 'poplar', far: 'poplarFar', tiny: 'poplarTiny', tinyH: 8.4, tinyR: 1.85, cls: 'tree', h: 9.0, r: 1.65, farH: 7.8, farR: 1.85, shadow: 1.1, sink: 0.12, lean: 0.03 },
  willow: { near: 'willow', far: 'willowFar', tiny: 'willowTiny', tinyH: 7.2, tinyR: 3.2, cls: 'tree', h: 6.5, r: 3.2, farH: 7.0, farR: 3.4, shadow: 2.6, accent: 0x6e5a40, sink: 0.05, lean: 0.04 },
  juniper: { near: 'juniper', far: 'juniperFar', tiny: 'juniperTiny', tinyH: 3.6, tinyR: 1.95, cls: 'tree', h: 3.5, r: 1.75, farH: 3.8, farR: 1.95, shadow: 1.2, accent: 0x7a6248, sink: 0.05, lean: 0.04 },
  bamboo: { near: 'bamboo', far: 'bambooFar', tiny: 'bambooTiny', tinyH: 9.6, tinyR: 3.0, cls: 'tree', h: 9.3, r: 3.0, farH: 9.6, shadow: 1.6, accent: 0x9fcf6a, sink: 0.05, lean: 0.02 },
  fruit_tree: { near: 'fruit_tree', far: 'broadleafFar', tiny: 'broadleafTiny', tinyH: 5.8, tinyR: 2.9, cls: 'tree', h: 5.0, r: 2.5, farH: 5.8, farR: 3.0, shadow: 1.6, accent: 0xd8483a, sink: 0.1, lean: 0.05 },
  baobab: { near: 'baobab', far: 'baobabFar', tiny: 'baobabTiny', tinyH: 9.0, tinyR: 3.3, cls: 'tree', h: 8.2, r: 3.6, farH: 8.6, farR: 3.2, shadow: 2.4, accent: 0x8a7a66, sink: 0.05 },
  // ---- the new shrubs
  berry_bush: { near: 'berry_bush', far: 'bushFar', cls: 'small', h: 1.3, r: 1.1, farH: 1.6, farR: 1.25, shadow: 0.8, accent: 0xc2334a, lies: true, sink: 0.05 },
  tea_bush: { near: 'tea_bush', far: 'teaFar', cls: 'small', h: 0.9, r: 0.8, shadow: 0, lies: true, sink: 0.03, turn: 'row' },
  sage: { near: 'sage', far: 'bushFar', cls: 'small', h: 0.9, r: 0.85, farH: 1.6, farR: 1.25, shadow: 0.5, accent: 0x8a84b0, lies: true, sink: 0.04 },
  agave: { near: 'agave', cls: 'small', h: 1.06, r: 1.0, shadow: 0.5, lies: true, sink: 0.03 },
  prickly_pear: { near: 'prickly_pear', cls: 'small', h: 1.0, r: 0.75, shadow: 0.5, accent: 0xd0406a, lies: true, sink: 0.03 },
  // (a plant of reeds, of sunflowers or of tall grass is a patch of several: its radius here is the patch's own measure)
  reed: { near: 'reed', far: 'reedFar', cls: 'small', h: 2.6, r: 1.0, farH: 2.1, shadow: 0, accent: 0xcbb890, lies: true, sink: 0.02 },
  fern: { near: 'fern', cls: 'small', h: 0.8, r: 0.95, shadow: 0, lies: true, sink: 0.02 },
  vine: { near: 'vine', far: 'bushFar', cls: 'small', h: 1.6, r: 1.4, farH: 1.6, farR: 1.25, shadow: 0.8, accent: 0x5a2a6a, lies: true, sink: 0.04 },
  sunflower: { near: 'sunflower', far: 'sunflowerFar', cls: 'small', h: 2.1, r: 0.5, shadow: 0, accent: 0xf2c23c, lies: true, sink: 0.02, turn: 'sun' },
  tall_grass: { near: 'tall_grass', far: 'reedFar', cls: 'small', h: 1.75, r: 0.7, farH: 2.1, farR: 1.2, shadow: 0, accent: 0xc8b46a, lies: true, sink: 0.02 },
  // ---- what lies on the ground
  boulder: { near: 'boulder', cls: 'small', h: 1.3, r: 1.6, shadow: 1.2, lies: true, sink: 0.1 },
  log: { near: 'log', cls: 'small', h: 0.46, r: 1.6, shadow: 0, lies: true, sink: 0.03 },
  stump: { near: 'stump', cls: 'small', h: 0.5, r: 0.42, shadow: 0, lies: true, sink: 0.03 },
  flower_clump: { near: 'flower_clump', cls: 'small', h: 0.45, r: 0.5, shadow: 0, accent: 0xf2c84b, lies: true, sink: 0.01 },
};

/** how much a model gives to the wind against a tree (absent: 1); nothing of stone or dead wood moves */
const SWAY: Readonly<Record<string, number>> = {
  conifer: 0.6, conifer2: 0.6, coniferFar: 0.6, rock: 0, boulder: 0, log: 0, stump: 0, cactus: 0.5, cactusFar: 0.5, baobab: 0.5, baobabFar: 0.5,
  reed: 9, reedFar: 9, tall_grass: 9, sunflower: 2.5, sunflowerFar: 2.5, flower_clump: 30, fern: 12, agave: 0, prickly_pear: 0, bamboo: 1.5, bambooFar: 1.5, tea_bush: 0.3, teaFar: 0.3,
  coniferTiny: 0.6, cactusTiny: 0.5, baobabTiny: 0.5, bambooTiny: 1.5,
};

/**
 * The foliage of every small plant is painted this much of a tone lighter than a tree's would be. A crown's four
 * tones go down to the deep dark of its inside, and under a tree's shadow all of it does; a shrub or a tuft
 * that did the same would stand as a dark lump in grass that stays light in the same shade (grass and ground
 * are painted by other rules: render/materials.ts). So low plants keep to the lighter three.
 */
const SMALL_LIFT = 0.12;

/** texels to a row of the atlas, and to a vertex */
export const ATLAS_WIDTH = 1024;
const PER_VERTEX = 4;
/** vertices to a row */
export const ATLAS_ROW = ATLAS_WIDTH / PER_VERTEX;

export interface AtlasModel {
  /** its first vertex in the atlas, and how many it has */
  first: number;
  count: number;
}

/** every model in one sheet of numbers (four texels of four floats to a vertex), and where each begins */
export class PlantAtlas {
  readonly models: Record<string, AtlasModel> = {};
  readonly data: Float32Array;
  readonly rows: number;
  private tex: THREE.DataTexture | null = null;

  /**
   * @param forcedPart models all of whose vertices are one part, whatever they say (the stones)
   * @param lift models whose foliage is painted lighter by this much of a tone (see SMALL_LIFT)
   */
  constructor(geometries: Readonly<Record<string, THREE.BufferGeometry>>, forcedPart: Readonly<Record<string, number>> = {}, lift: Readonly<Record<string, number>> = {}) {
    let total = 0;
    for (const g of Object.values(geometries)) total += g.getAttribute('position').count;
    this.rows = Math.ceil(total / ATLAS_ROW);
    this.data = new Float32Array(this.rows * ATLAS_WIDTH * 4);
    const d = this.data;
    let v = 0;
    for (const [name, g] of Object.entries(geometries)) {
      const pos = g.getAttribute('position');
      const nrm = g.getAttribute('normal');
      const col = g.getAttribute('color');
      const uv = g.getAttribute('uv');
      const leaf = g.getAttribute('aLeaf');
      const card = g.getAttribute('aCard');
      // (a triangle's three vertices must lie in one draw: models hold whole triangles)
      if (pos.count % 3 !== 0) throw new Error(`the model ${name} does not hold whole triangles`);
      this.models[name] = { first: v, count: pos.count };
      const sway = Math.sqrt(SWAY[name] ?? 1);
      const lighter = lift[name] ?? 0;
      for (let i = 0; i < pos.count; i++, v++) {
        const o = v * PER_VERTEX * 4;
        const y = pos.getY(i);
        const isCard = card ? card.getX(i) : 0;
        const part = forcedPart[name] ?? (leaf ? leaf.getX(i) : 0);
        d[o] = pos.getX(i);
        d[o + 1] = y;
        d[o + 2] = pos.getZ(i);
        d[o + 3] = part;
        d[o + 4] = uv ? uv.getX(i) : 0;
        d[o + 5] = uv ? uv.getY(i) : 0;
        d[o + 6] = isCard;
        // the height the wind takes hold at (m, at the model's own size): its own height, more for what gives
        // readily; a willow's hanging leaves swing most at their free lower ends
        d[o + 7] = name.startsWith('willow') && isCard > 0.5 && y < 3.7 ? 4.2 + (3.7 - y) * 1.5 : Math.max(0, y) * sway;
        d[o + 8] = nrm.getX(i);
        d[o + 9] = nrm.getY(i);
        d[o + 10] = nrm.getZ(i);
        // (foliage carries its tone as its colour's lightness: the lift is added there)
        const up = part === PART_LEAF ? lighter : 0;
        d[o + 12] = (col ? col.getX(i) : 1) + up;
        d[o + 13] = (col ? col.getY(i) : 1) + up;
        d[o + 14] = (col ? col.getZ(i) : 1) + up;
      }
    }
  }

  /** the atlas as a texture (made when first asked for) */
  get texture(): THREE.DataTexture {
    if (!this.tex) {
      const t = new THREE.DataTexture(this.data, ATLAS_WIDTH, this.rows, THREE.RGBAFormat, THREE.FloatType);
      t.minFilter = t.magFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.colorSpace = THREE.NoColorSpace;
      t.needsUpdate = true;
      this.tex = t;
    }
    return this.tex;
  }
}

/** how one plant of the catalogue is drawn (PlantRegistry.draws, by the plant's index in PLANTS) */
export interface PlantDraw {
  /** false: not drawn here — a ground plant that is picked (the next node draws those near the player), or a family without a row */
  drawn: boolean;
  family: PlantFamily;
  cls: PlantClass;
  near: AtlasModel;
  far: AtlasModel | null;
  tiny: AtlasModel | null;
  /** the scale across and up of a plant of size 1: near, far and furthest */
  kx: number;
  ky: number;
  fkx: number;
  fky: number;
  tkx: number;
  tky: number;
  /** its first colour as 0xRRGGBB (−1: its region's palette paints it), and its second */
  tintA: number;
  tintB: number;
  /** its second colour is one of its region's flower colours (a plant of flowers with no colours of its own) */
  regionAccent: boolean;
  /** 4: it keeps its leaves (dark among autumn woods, snow lies on it in snow country) */
  evergreen: number;
  /** it shows what it bears on itself (fruit in the crown, berries): on the ones that do bear */
  showsFruit: boolean;
}

const NO_MODEL: AtlasModel = { first: 0, count: 0 };

export class PlantRegistry {
  readonly atlas: PlantAtlas;
  /** by index in PLANTS */
  readonly draws: PlantDraw[];

  constructor() {
    const old = buildPlants();
    const { broadleaf, broadleaf2, broadleaf3, broadleafFar, conifer, conifer2, coniferFar, bush, bushFar, cactus } = old;
    const lift: Record<string, number> = {};
    for (const f of Object.values(FAMILIES)) {
      if (f.cls !== 'small') continue;
      lift[f.near] = SMALL_LIFT;
      if (f.far) lift[f.far] = SMALL_LIFT;
    }
    this.atlas = new PlantAtlas({ broadleaf, broadleaf2, broadleaf3, broadleafFar, conifer, conifer2, coniferFar, bush, bushFar, cactus, ...buildPlantModels() }, { rock: PART_ROCK, boulder: PART_ROCK }, lift);
    for (const g of Object.values(old)) g.dispose();
    this.draws = PLANTS.map((p) => this.drawOf(p));
  }

  private drawOf(p: PlantDef): PlantDraw {
    const f = FAMILIES[p.model];
    // (what is picked from the ground is the forager's to draw, near the player: node W3)
    const drawn = f !== undefined && !(p.layer === 'ground' && p.bears !== undefined);
    const fam = f ?? FAMILIES.bush;
    const near = this.atlas.models[fam.near];
    const far = fam.far ? this.atlas.models[fam.far] : null;
    const tiny = fam.tiny ? this.atlas.models[fam.tiny] : null;
    if (!near || (fam.far && !far) || (fam.tiny && !tiny)) throw new Error(`the plant registry names a model the atlas does not hold (${fam.near}, ${fam.far ?? '-'}, ${fam.tiny ?? '-'})`);
    return {
      drawn,
      family: fam,
      cls: fam.cls,
      near: drawn ? near : NO_MODEL,
      far: drawn ? far : null,
      tiny: drawn ? tiny : null,
      kx: p.crown / fam.r,
      ky: p.height / fam.h,
      fkx: p.crown / (fam.farR ?? fam.r),
      fky: p.height / (fam.farH ?? fam.h),
      tkx: p.crown / (fam.tinyR ?? fam.farR ?? fam.r),
      tky: p.height / (fam.tinyH ?? fam.farH ?? fam.h),
      tintA: p.tint ? p.tint[0] : -1,
      tintB: p.tint ? p.tint[1] : (fam.accent ?? 0x5a4a3c),
      regionAccent: !p.tint && p.model === 'flower_clump',
      evergreen: p.evergreen ? 4 : 0,
      showsFruit: p.bears !== undefined && p.bears.where === 'on',
    };
  }
}

let shared: PlantRegistry | null = null;

/** the one registry (its models are built when it is first asked for: a world of version 1 never does) */
export function plantRegistry(): PlantRegistry {
  return (shared ??= new PlantRegistry());
}
