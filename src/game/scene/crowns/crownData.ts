/**
 * What a scatter tile hands the painted crowns (scene/crowns/crownView.ts) for each of its trees: the layout of
 * the numbers, and what the scatter asks of the crowns while it builds a tile (scene/floraScatter.ts). Kept
 * apart, with no imports, so that the scatter stays DOM-free and light.
 *
 * A tree is CROWN_STRIDE numbers:
 *   0 1 2  where its foot is (world, m)       3  its turn (rad)
 *   4 5    its scale across and up            6  its species (CrownLookup.speciesOf)   7  its variant
 *   8 … 11 its look (render/crownMaterial.ts aLook)
 *   12     its own number 0 … 1               13 1: it stands inside a thick wood
 *   14 15  its crown's radius and its height (m, as set)
 */
export const CROWN_STRIDE = 16;

/** what the scatter asks of the crowns */
export interface CrownLookup {
  /** the species a family of model is drawn as (−1: none: the atlas draws it) */
  speciesOf(family: string): number;
  /** a species' measure at the size it is grown (m), and whether it is a shrub */
  measure(species: number): { height: number; radius: number; small: boolean };
  /** how many variants a species has */
  variants(species: number): number;
}

/**
 * The ground field's forms (core/world/groundTables.ts) the plant toolkit grows, by form: drawn by the crowns as
 * the trees are, a tile of them set out once (docs/V3/nodes/P2-B-kit-ground.md). The forms not here (the mats of
 * moss, needles and litter, the stones, the rice) stay the plant atlas's.
 */
export const GROUND_KIT: Readonly<Record<string, string>> = {
  grass: 'tuft_meadow', tussock: 'tuft_tussock', sedge: 'tuft_needle', broom: 'shrub_heather', fern: 'fern',
  shrub: 'shrub_round', broad: 'shrub_round', dwarf: 'shrub_heather', berry: 'shrub_round', maritime: 'shrub_round',
  sage: 'shrub_sage', creosote: 'shrub_sage', thorn: 'shrub_sage',
  cup: 'flower_poppy', daisy: 'flower_daisy', star: 'flower_daisy', woodflower: 'flower_daisy', spike: 'flower_lupin', tube: 'flower_tulip', cluster: 'shrub_protea',
  // (docs/V3/nodes/R5-ground.md)
  spinifex: 'tuft_spinifex', tall: 'tuft_tall', cushion: 'shrub_cushion', saltbush: 'shrub_saltbush', bigleaf: 'herb_bigleaf',
};
/** a ground plant's species: its kind's, apart from the trees' families */
export const groundFamily = (kind: string): string => `g:${kind}`;
/** variants of a ground plant (few: it is small, and a tile holds hundreds) */
export const GROUND_VARIANTS = 3;
/** the toolkit kind a species of the ground is, or undefined */
export const groundKind = (family: string): string | undefined => (family.startsWith('g:') ? family.slice(2) : undefined);
