#!/usr/bin/env bash
# Download the 29 Wikimedia Commons study photos into refs/landscape-photos/.
# They stay gitignored; this script only reconstructs a local study folder.
# Honour each file's author and licence in
# docs/V3/research/landscape-photos-manifest.md (and the Commons source page).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-"$ROOT/refs/landscape-photos"}"
MANIFEST="$ROOT/docs/V3/research/landscape-photos-manifest.md"
mkdir -p "$DEST"
cp -n -- "$MANIFEST" "$DEST/manifest.md"

# file<TAB>commons File: name  (29 rows; Biei was never downloaded, listed only in the manifest)
while IFS=$'\t' read -r out wiki; do
  [ -n "${out:-}" ] || continue
  url="https://commons.wikimedia.org/wiki/Special:FilePath/${wiki}?width=1280"
  if [ -f "$DEST/$out" ]; then
    echo "exists $out"
    continue
  fi
  echo "fetch $out"
  # Wikimedia asks for a descriptive UA; if the server answers 429, wait and retry yourself.
  curl -fsSL --retry 2 --retry-delay 5 \
    -A "the-long-way-public landscape study (local rebuild; see docs/V3/research/landscape-photos-manifest.md)" \
    -o "$DEST/$out" "$url"
done << 'ROWS'
trollstigen-hairpins-from-viewpoint.jpg	DSC07845-Panorama.jpg
stelvio-pass-eastern-ramp-hairpins.jpg	Stelvio_Pass_Bolzano_side_1.jpg
furka-pass-hairpins-from-grimsel-road.jpg	Furkapass_westside.jpg
sani-pass-switchbacks-from-rim.jpg	Sani_Pass_heading_into_Lesotho.jpg
going-to-the-sun-road-glacial-valley.jpg	Going-to-the-Sun_Road_-_Glacier_National_Park.jpg
icefields-parkway-glacial-valley.jpg	Icefields_Parkway_from_an_elevated_viewpoint,_Jasper_National_Park,_Alberta,_Canada.jpg
yosemite-valley-from-tunnel-view-road.jpg	Tunnel_View,_Yosemite_Valley,_Yosemite_NP_-_Diliff.jpg
lauterbrunnen-u-valley-waterfalls.jpg	1_lauterbrunnen_valley_wengen_2022.jpg
milford-road-west-from-homer-tunnel.jpg	Homer_Saddle_LookingWest.jpg
big-sur-bixby-bridge-coast-road.jpg	Bixby_Creek_Bridge,_California,_USA_-_May_2013.jpg
chapmans-peak-drive-cliff-road.jpg	Chapmans_Peak_Drive_2.jpg
atlantic-ocean-road-storseisundet-bridge.jpg	Atlantic_Ocean_Road.jpg
avenue-of-the-giants-redwood-road.jpg	AVENUE_OF_THE_GIANTS,_OLD_HIGHWAY_101,_ROAD_VIEW_1.5_MILES_NORTH_OF_MIRANDA._HUMBOLDT_COUNTY,_CALIFORNIA._LOOKING_N._-_Redwood_National_and_State_Parks_Roads,_California_coast_from_HAER_CA-269-69_(CT).tif
dark-hedges-beech-tree-tunnel.jpg	Dark_Hedges_near_Armoy,_Co_Antrim_(cropped).jpg
avenue-of-the-baobabs-sunset.jpg	Avenue_of_the_Baobabs_at_Sunset.jpg
li-river-tower-karst-yangshuo.jpg	1_li_jiang_guilin_yangshuo_2011.jpg
ma-pi-leng-pass-karst-gorge-road.jpg	Ma_Pi_Leng_Pass_winding_road_Ha_Giang_Vietnam.jpg
taroko-gorge-cross-island-highway.jpg	Taiwan_2009_HuaLien_Taroko_Gorge_Biking_PB160057.jpg
yuki-no-otani-snow-walls.jpg	Tateyama_Toll_Road_and_Yuki-no-otani.jpg
karakoram-highway-passu-cones.jpg	Passu_Cones_(Karakoram_Highway_view).jpg
dalton-highway-brooks-range-tundra.jpg	Midnight_sun_in_the_Brooks_Range_(51358523439).jpg
kullu-valley-from-rohtang-pass.jpg	Kullu_Valley_from_Rohtang_Pass,_India.jpg
great-smoky-mountains-layered-ridges.jpg	Clifftops4-7-07.jpg
iceland-lupin-field.jpg	Lupinus_nootkatensis_-_Iceland_20070706b.jpg
hulunbuir-grassland-steppe.jpg	Hulunbuir_Grasslands,_Inner_Mongolia_-_9758734754.jpg
tian-shan-alpine-meadows.jpg	Alpine_meadows_and_snow-covered_peaks_in_Khan_Tengri_Nature_Park,_Tien_Shan.jpg
monument-valley-buttes.jpg	Monument_Valley,_Utah,_USA_(23611451292).jpg
hailuogou-glacier-and-fir-forest.jpg	HailuogouGlacierPanorama.jpg
laki-fissure-lava-field.jpg	Laki_fissure_(3).jpg
ROWS

echo "Done. Photos are for local study only; keep them out of git."
echo "One planned photo (Biei patchwork hills) is not in this list; see the manifest (HTTP 429 at the time)."
