/** Crown colours in sRGB, and atlas relatives used outside the crown view's range.
 * Negative leaf tint lets the region's own painted bands come through. */
interface Paint {
  atlas: string;
  leaf: number;
  bark: number;
  autumn?: number;
}
function paint(atlas: string, leaf: number, bark: number, autumn?: number): Paint {
  return { atlas, leaf, bark, autumn };
}
export const CROWN_PAINT: Readonly<Record<string,Paint>> = {
  broadleaf: paint('broadleaf',-1,0x6e5949,0xb18547),
  broadleaf2: paint('broadleaf2',-1,0x746556,0xd6ad53),
  broadleaf3: paint('broadleaf3',-1,0x736456,0xd2a44d),
  bush: paint('bush',-1,0x746454,0xb6924d),
  oak: paint('broadleaf',-1,0x645342,0xae6f37),
  linden: paint('broadleaf2',-1,0x766452,0xdcb954),
  ash: paint('broadleaf3',-1,0x898677,0xc8ad54),
  beech: paint('broadleaf2',0x77a45a,0x96948c,0xb87c46),
  maple: paint('broadleaf',0x81ad60,0x77665a,0xce5637),
  chestnut: paint('broadleaf',0x769951,0x715849,0xc29942),
  giant_broadleaf: paint('broadleaf3',-1,0x766458),
  camphor: paint('broadleaf2',0x63975f,0x6e5949),
  birch: paint('birch',0x9fc572,0xe4dfcc,0xe0bc53),
  poplar: paint('poplar',-1,0x857b67,0xe4bd56),
  aspen: paint('birch',0x96b978,0xd5d1ba,0xf1c350),
  desert_poplar: paint('broadleaf3',0x94ab72,0x8a7864,0xdfac43),
  willow: paint('willow',0xa0b977,0x705a40,0xcbb76c),
  olive: paint('broadleaf3',0x9da987,0x82776a),
  eucalyptus: paint('broadleaf2',0x93ac97,0xc3b6a3),
  acacia: paint('broadleaf3',0x98a862,0x7f6853,0xbca160),
  baobab: paint('baobab',0x86a265,0xa7927c,0xbba450),
  spruce: paint('conifer',0x517f67,0x746254),
  pine: paint('conifer2',0x709463,0x947453),
  redwood: paint('conifer',0x527d60,0xa05e45),
  fir: paint('conifer',0x5a846d,0x898175),
  larch: paint('conifer',0x98b565,0x826f58,0xe6b947),
  cedar: paint('conifer2',0x668b7c,0x796658),
  dwarf_pine: paint('juniper',0x77935c,0x89735b),
  cypress: paint('conifer',0x597957,0x81735e),
  stone_pine: paint('conifer2',0x768e5c,0x917058),
  juniper: paint('juniper',0x779075,0x8a7460),
  rhododendron: paint('bush',0x738f60,0x766453),
  coconut_palm: paint('poplar',0x82a651,0xb49772),
  fan_palm: paint('poplar',0x799866,0x8d775e),
  tree_fern: paint('broadleaf',0x78a260,0x665647),
  saguaro: paint('cactus',0x82a588,0x829b78),
  cactus: paint('cactus',0x82a588,0x829b78),
  joshua_tree: paint('juniper',0x98a982,0x87735f),
  bamboo: paint('bamboo',0x8bb067,0x88955e),
  fruit_tree: paint('fruit_tree',-1,0x78624b,0xc3a357),
};

export function paintedFamily(id: string, model: string): string {
  if (id === 'chestnut_tree') return 'chestnut';
  return CROWN_PAINT[id] ? id : model;
}
