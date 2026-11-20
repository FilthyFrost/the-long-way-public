// Months are characteristics of a landscape. A date is never read from the journey clock.
const months: Readonly<Record<string, number>> = {
  plains: 6, forest: 7, alpine: 1, maple: 10, lakes: 1, wetland: 1,
  desert: 3, red_canyon: 4, terraces: 5, flower_fields: 9, bamboo_sea: 6, karst_peaks: 6,
  'central-alps': 1, 'sierra-high': 1, 'rocky-pass': 1, 'shenandoah-farm': 6,
  'fog-redwood': 7, 'alaska-taiga': 8, 'arctic-tundra': 7, 'fiordland': 1,
  'sierra-valley': 7, 'sur-coast': 6, 'prairie-badlands': 7, 'norway-fjord': 7,
  'amalfi-terrace': 5, 'hani-paddy': 5, 'ifugao-paddy': 5, lowveld: 2,
  'cape-fynbos': 9, 'otway-coast': 1, 'otway-forest': 2, 'wet-tropics': 2,
  'patagonian-steppe': 1, 'andes-rainforest': 1, 'cal-oak': 4, 'mesa-woodland': 4,
  'rocky-foothill': 6, 'front-prairie': 6, 'sanjuan-montane': 7, 'blue-meadow': 9,
  'alaska-braid': 7, 'sky-oak': 4, 'sky-pine': 7, 'alps-orchard': 5,
  'alps-larch': 10, 'fjord-orchard': 5, 'fjord-heath': 8, 'lattari-coppice': 10,
  'lattari-pasture': 5, 'south-china-paddy': 5, 'ifugao-grove': 6, 'cordillera-pine': 4,
  'sabie-gallery': 2, 'basalt-savanna': 2, 'cape-dune': 9, 'cape-forest': 10,
  'otway-pasture': 10, 'eglinton-grass': 1, 'homer-alpine': 1, 'daintree-tidal': 2,
  'daintree-beach': 2, 'andean-parkland': 1,
  'karst-river': 6, 'redrock': 4, 'sonoran': 3, 'appalachian': 10,
};
export function sceneMonth(id: string): number { return months[id] ?? 6; }

/** Shortest arc between two seasonal signatures; December to January crosses New Year. */
export function sceneMonthAt(a: string, b: string, t: number): number {
  const start = sceneMonth(a), end = sceneMonth(b);
  let delta = end - start;
  if (delta > 6) delta -= 12;
  if (delta < -6) delta += 12;
  return ((start - 1 + delta * t + 12) % 12) + 1;
}
export function localMonth(a: string, b: string, t: number): number {
  return (Math.round(sceneMonthAt(a, b, t)) - 1) % 12 + 1;
}
