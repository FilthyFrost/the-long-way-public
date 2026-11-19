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
