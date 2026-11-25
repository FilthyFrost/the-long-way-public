/**
 * The fishing module's words in the game's progression (docs/V3/plan/fishing.md): the field of the compendium the
 * fish are kept in. Pure data: nothing here touches the page.
 *
 * Fishing has no skill, no levels and no experience (the user's word, 2026-11-24): only the rods, the baits and the
 * fish differ, and the twitch, the live bait and the rarity's colour in the rings far out are there from the first
 * cast. A save from before keeps the experience it had under "fishing" in the progress slice; nothing reads it.
 */
export const FISH_DOMAIN = 'fish';
