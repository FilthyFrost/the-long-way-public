/**
 * Ground shaders (render style v2, specs/art/STYLE.md §4): open terrain, and the road-aligned
 * strip that paints asphalt, markings and shoulders from road coordinates.
 *
 * The ground is painted, not lit: a tone (how the slope stands to the sun, brush marks, cast and
 * cloud shadow) picks one of the biome's three paints, and the light is coloured sky where the
 * ground is shaded and sun where it is open. Near the eye the tone carries brushwork at three
 * sizes; further off it flattens into broad warm and cool patches, contour strokes on slopes and
 * forest masses, and the far land is lifted towards a paler, warmer green.
 *
 * Vertex data (worldBuild.ts): aBiomeW = weight of each palette slot (sums to 1), aGround = (distance
 * from the road centre line, relief above the valley floor, woodland 0…1, unused).
 *
 * An anchored landform (a tower, a butte: worlds of version 2) is told to the paint through the first of
 * those: the paint asks the road distance only whether it is a few metres, no landform stands that near the
 * road, and the distance is never written beyond GROUND_FAR — so a point on a landform adds ON_LANDFORM to
 * it, and the paint reads back how fully a point is one (rtPaintedGround: its flanks are rock from a gentler
 * slope on than the country round them, its gentle top stays what the country is).
 *
 * In a world of version 2 (the materials made with `cover`: RT_COVER) the ground also carries what the flora
 * field's ground cover says of it, to any distance: the rows of the flower fields and of the crops on the
 * terraces' benches, each row in its own colour (aCover = the row coordinate of the vertex and how much stands
 * in a row; the rows' spacing and colours per palette slot: render/style.ts coverUniforms), standing water in
 * the hollows of a marsh, and reed-green instead of sand on a reedy shore. Without it the shaders are, to the
 * letter, what they were.
 */
import { SNOW_FIELD } from './seasonalSnow';
import * as THREE from 'three';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, GLSL_VERTEX_PARS, globals } from './shaderlib';
import { GLSL_PAINT } from './paint';
import { GLSL_SKY_MIRROR, skyMirrorUniforms } from '../env/sky';
import { waterUniforms } from './water';
import { STYLE, coverUniforms } from './style';

/** the road distance of a ground vertex is written no further than this (m) */
export const GROUND_FAR = 2000;
/** … and a vertex that stands on an anchored landform adds this to it (as much of it as the landform has risen: worldBuild.ts groundAttrs) */
export const ON_LANDFORM = 16384;

export const GROUND_PAINT = /* glsl */ `
  ${GLSL_PAINT}
  #ifdef RT_COVER
  ${SNOW_FIELD}
  uniform sampler2D tCover;
  uniform vec4 uCoverMisc[4];
  uniform int uCoverSeed;
  // the core's hash of two whole numbers and a seed (core/math/rng.ts hash2), to the bit
  uint rtHash2(int x, int y, int seed) {
    uint a = (uint(x) * 0x27d4eb2du) ^ (uint(y) * 0x165667b1u) ^ (uint(seed) * 0x9e3779b1u);
    a = (a ^ (a >> 16u)) * 0x7feb352du;
    a = (a ^ (a >> 15u)) * 0x846ca68bu;
    return a ^ (a >> 16u);
  }
  #endif
  // thin strokes following the contours of the land, a pixel or two wide at any distance
  float rtContour(vec3 pos, vec3 n, vec2 w, float dist) {
    float x = rtWorldY(pos) / 2.6 + (rtNoiseAt(w, 96.0).g - 0.5) * 1.6;
    float fw = max(fwidth(x), 1e-4);
    float d = abs(fract(x + 0.5) - 0.5) / fw;
    float line = 1.0 - smoothstep(0.35, 1.1, d);
    float slope = smoothstep(0.03, 0.16, 1.0 - n.y);
    float broken = smoothstep(0.42, 0.58, rtNoiseAt(w * vec2(0.45, 1.0) + 9.0, 64.0).r);
    return line * slope * broken * smoothstep(25.0, 80.0, dist) * (1.0 - smoothstep(0.12, 0.3, fw));
  }
  // Cells (V2, as Painted Valley's paintCells): how far a point is from the edge of the cell it is in, and two numbers
  // that are the cell's own
  // (from the cells texture, one fetch: render/textures.ts cellsTexture, 64 cells to it)
  vec3 rtCells(vec2 x) {
    vec4 t = texture2D(tCells, x / 64.0);
    return vec3(t.r * 0.5, t.g, t.b);
  }
  // The meadow seen from off (V2): clumps of rough grass gathered into masses, and finer dabs — a darker tuft, a fleck
  // of sun — each fading out before its cells shrink below a few pixels (px1, px2: how far a pixel runs in cells)
  vec3 rtMeadowDabs(vec2 w, float dist, float px1, float px2, float massN) {
    vec3 m = vec3(1.0);
    float k1 = smoothstep(9.0, 22.0, dist) * (1.0 - smoothstep(0.22, 0.5, px1));
    if (k1 > 0.0) {
      vec3 t = rtCells(w / 3.2);
      // (gathered into masses where the 27 m brush is: no fetch of its own)
      float mass = smoothstep(-0.08, 0.1, massN);
      m *= mix(vec3(1.0), vec3(0.64, 0.82, 0.9), smoothstep(0.08, 0.2, t.x) * step(t.y, 0.32 * mass + 0.05) * k1);
    }
    float k2 = smoothstep(5.0, 12.0, dist) * (1.0 - smoothstep(0.22, 0.5, px2));
    if (k2 > 0.0) {
      vec3 c = rtCells(w / 0.9);
      float dab = smoothstep(0.1, 0.22, c.x) * k2;
      m *= mix(vec3(1.0), vec3(0.74, 0.86, 0.92), dab * step(0.8, c.y));
      m *= mix(vec3(1.0), vec3(1.22, 1.12, 0.86), dab * step(c.y, 0.14));
    }
    return m;
  }
  // Rock as Painted Valley paints its ranges (V2): facets at four sizes at once — large ones and smaller ones on them,
  // each turned its own way to the light, the joints between them dark; each size fades out before its cells shrink
  // below a few pixels (px: metres a pixel), so a far face keeps its big planes broken by the next size, and a near one
  // has them all. Returns the facets' turn toward or away from the light; val their own tone, joints how much of a joint.
  float rtRockFacets(vec2 fp, float px, out float val, out float joints) {
    float turn = 0.0;
    float wsum = 0.0;
    val = 0.0;
    joints = 0.0;
    for (int i = 0; i < 4; i++) {
      float sz = i == 0 ? 220.0 : i == 1 ? 64.0 : i == 2 ? 19.0 : 5.5;
      float wt = i == 0 ? 1.0 : i == 1 ? 0.7 : i == 2 ? 0.5 : 0.32;
      float k = 1.0 - smoothstep(0.06, 0.16, px / sz);
      if (k <= 0.0) continue;
      vec3 c = rtCells(fp / sz + float(i) * 7.31);
      turn += (c.y - 0.5) * wt * k;
      val += (c.z - 0.5) * wt * k;
      wsum += wt * k;
      // (a joint is a line a pixel or two wide whatever the size of its cells, and broken: rock cracks, it is not tiled)
      float jpx = c.x * sz / max(px, 1e-3);
      float broken = smoothstep(0.35, 0.6, rtNoiseAt(fp * (3.0 / sz) + float(i) * 3.7, 1.0).g);
      joints = max(joints, (1.0 - smoothstep(0.5, 1.6, jpx)) * k * broken * (1.0 - 0.18 * float(i)));
    }
    val /= max(wsum, 0.3);
    return turn * 0.6;
  }
  // the plane a rock face's facets lie on: a wall's stand up it (along its contour and up), a slab's lie on it
  vec2 rtRockPlane(vec2 w, vec3 n, float y, float steep) {
    vec2 fall = n.xz / max(length(n.xz), 1e-3);
    float wallK = smoothstep(0.3, 0.65, steep);
    return mix(w, vec2(dot(w, vec2(-fall.y, fall.x)), y * 1.3), wallK) + rtNoiseAt(w, 300.0).rg * 9.0;
  }
  // flower dabs in drifts: returns coverage, colour in 'c'
  float rtFlowers(RtPal p, vec2 w, float dist, out vec3 c) {
    c = p.fl0;
    float fw = fwidth(w.x) / 0.8;
    if (dist > 60.0) return 0.0;
    vec2 cell = floor(w / 0.8);
    vec4 h = rtHash4(cell + 17.0);
    float drift = smoothstep(0.52, 0.7, rtNoiseAt(w + 300.0, 48.0).a);
    if (h.x > drift * 0.55) return 0.0;
    vec2 f = fract(w / 0.8) - (0.25 + 0.5 * h.yz);
    float r = 0.07 + 0.08 * h.w;
    c = h.y < 0.4 ? p.fl0 : h.y < 0.75 ? p.fl1 : p.fl2;
    return (1.0 - smoothstep(r - fw, r + fw, length(f))) * (1.0 - smoothstep(25.0, 60.0, dist));
  }

  /**
   * Painted open ground, lit. 'shade' is cast and cloud shadow (1 = in the sun).
   * Returns linear radiance; 'albedo' gets the paint for the headlights and the road blend.
   */
  vec3 rtPaintedGround(vec3 pos, vec3 n, vec4 bwIn, vec4 g, float dist, float shade, out vec3 albedo) {
    RtPal p = rtPal(bwIn);
    vec2 w = rtWorldXZ(pos);
    float ad = g.x;
    // woods stop at a treeline on the high massifs; (negative: a mown lawn on a plot of the caller's, how mown)
    #ifdef RT_ALT
    // (a world of version 2: the region's own snow line and tree line, in metres above the sea; the woods end
    // raggedly at their line)
    vec2 lines = uCoverMisc[0].zw * bwIn.x + uCoverMisc[1].zw * bwIn.y + uCoverMisc[2].zw * bwIn.z + uCoverMisc[3].zw * bwIn.w;
    float climateSnow = rtSeasonSnow(vAlt, bwIn);
    // The old snowy region palette was itself white, even on a valley floor below the winter snowline.
    p.deep = mix(p.deep, vec3(0.105, 0.13, 0.084), p.misc.x);
    p.mid = mix(p.mid, vec3(0.26, 0.29, 0.17), p.misc.x);
    p.lit = mix(p.lit, vec3(0.49, 0.48, 0.29), p.misc.x);
    float wood = max(g.z, 0.0) * (1.0 - smoothstep(lines.y - 160.0, lines.y, vAlt + rtNoiseAt(w, 300.0).b * 90.0));
    #else
    float wood = max(g.z, 0.0) * (1.0 - smoothstep(450.0, 850.0, g.y));
    #endif
    float lawn = max(-g.z, 0.0);
    // the verge and ditch beside the road are shaped by the road, not the land: paint them with
    // only a little of the slope, or the ditch reads as a hard cold band along the road
    float rel = mix(0.5, rtSlopeRel(n), mix(0.15, 1.0, smoothstep(6.0, 18.0, ad)));
    // a painter lights the far ranges from the side, whatever the hour: one flank lit, one in shade,
    // so every ridge reads as a form (the light still comes from the sun's side of the view)
    {
      vec3 V = normalize(pos - cameraPosition);
      vec3 side = normalize(vec3(-V.z, 0.0, V.x));
      if (dot(side.xz, uSunDir.xz) < 0.0) side = -side;
      vec3 Ls = normalize(side + vec3(0.0, 0.55, 0.0));
      vec3 nx = normalize(vec3(n.x * 3.2, n.y, n.z * 3.2));
      float relSide = clamp(0.5 + (dot(nx, Ls) - Ls.y) * 1.5, 0.0, 1.0);
      rel = mix(rel, relSide, smoothstep(1200.0, 4500.0, dist) * 0.75);
      // (far off, a painter lays a range in three tones with firm edges between them — shade, half light,
      // light — not in a smooth turning: the form reads, and the broad faces stay broad)
      float relQ = 0.3 + 0.38 * smoothstep(0.44, 0.5, rel) + 0.24 * smoothstep(0.64, 0.7, rel);
      rel = mix(rel, relQ, smoothstep(2200.0, 7000.0, dist) * 0.85);
    }

    // ---- tone: slope to the sun, then brushwork that fades out with distance
    float s6 = rtStrokeAt(w, 6.0) - 0.5;
    float s27 = rtStrokeAt(w + vec2(17.0, 5.0), 27.0) - 0.5;
    float s95 = rtStrokeAt(w + vec2(-41.0, 73.0), 95.0) - 0.5;
    float brush = (s6 * 0.6 * (1.0 - smoothstep(22.0, 55.0, dist))
                + s27 * 0.5 * (1.0 - smoothstep(70.0, 220.0, dist))
                + s95 * 0.42 * (1.0 - smoothstep(260.0, 900.0, dist))) * (1.0 - 0.3 * lawn);
    vec4 nz = rtNoiseAt(w, 640.0);
    float slow = nz.r - 0.5;
    float tone = rel + brush + slow * 0.28 - (1.0 - shade) * 0.22;
    // woods darken the floor under them
    tone -= wood * 0.22;
    albedo = rtPaintTone(p, tone);

    // ---- broad patches: a warmer, lighter green and a cooler, deeper one, with soft edges
    float warm = smoothstep(0.52, 0.64, rtNoiseAt(w + 13.0, 300.0).g);
    float cool = smoothstep(0.52, 0.63, rtNoiseAt(w * vec2(1.0, 0.7) + 71.0, 210.0).b);
    // patches show most in the middle distance, where the brushwork has gone flat
    float mid = 0.75 + 0.35 * smoothstep(40.0, 160.0, dist);
    albedo *= mix(vec3(1.0), p.warm, warm * 0.9 * mid);
    albedo *= mix(vec3(1.0), p.cool, cool * (0.8 - 0.45 * warm) * mid);

    // ---- dry ground: the biome's dryness in patches, and a dusty verge along the road
    float dryField = smoothstep(0.45, 0.7, rtNoiseAt(w + 500.0, 120.0).a + (p.misc.y - 0.5) * 0.9);
    float verge = (1.0 - smoothstep(4.0, 6.0, ad + (nz.g - 0.5) * 3.0)) * 0.4;
    float dryAmt = clamp(max(dryField * (0.35 + 0.5 * p.misc.y), verge) * (1.0 - wood) * (1.0 - 0.75 * lawn), 0.0, 1.0);
    albedo = mix(albedo, p.dry * mix(0.62, 1.12, smoothstep(0.2, 0.8, tone)), dryAmt);
    // (a lawn, mown: a fresher green)
    albedo = mix(albedo, albedo * vec3(0.92, 1.08, 0.8), lawn * 0.45);

    // ---- terraced slopes (a region with terraces, in worlds of version 2): the benches stay what the country
    // is, the risers between them are its bare earth. The benches are cut in the land's own height, a step
    // apart (core/world/operators.ts terrace: level over the first part of each step, the riser in the last),
    // so the paint finds a riser where the height nears the next whole step — also where the land's mesh is
    // too coarse to show one (its finest cells are 8 m, a riser is some 5 m across). Only where the core cuts
    // benches at all: from the road's verge out to a few hundred metres, on ground that really slopes (by the
    // mesh's own faces: a bench's vertex is level and a riser's steep, the face between them is the hillside).
    float tu = rtWorldY(pos) / max(p.terraceStep, 1.0);
    // (never nothing: on level ground the band's two edges would be one, and a step between them no number)
    float tfw = max(fwidth(tu), 1e-4);
    // (how steeply the face climbs, rise over run; nothing here can come out as no number: a zero in every
    // region without terraces must stay a zero)
    vec3 face = cross(dFdx(pos), dFdy(pos));
    float hill = length(face.xz) / max(abs(face.y), 1e-6);
    float riser = (1.0 - smoothstep(0.13 - tfw, 0.13 + tfw, abs(fract(tu - 0.28) - 0.5)))
                * p.terrace * smoothstep(14.0, 34.0, ad) * (1.0 - smoothstep(350.0, 600.0, ad))
                * smoothstep(0.1, 0.2, hill) * (1.0 - smoothstep(0.75, 1.1, hill))
                * (1.0 - smoothstep(0.3, 0.6, tfw)) * (1.0 - wood) * (1.0 - lawn);
    albedo = mix(albedo, p.dry * mix(0.6, 1.05, smoothstep(0.2, 0.8, tone)), riser * 0.85);

    // ---- where the meadow grass stands (near the eye), the ground between the blades is their roots
    float underGrass = (1.0 - smoothstep(45.0, 70.0, dist)) * smoothstep(5.0, 8.0, ad) * p.misc.z * (1.0 - wood) * (1.0 - dryAmt) * (1.0 - riser);
    albedo = mix(albedo, mix(p.deep, p.mid, 0.45 + 0.3 * (s6 + 0.5)), underGrass * 0.75);

    // ---- contour strokes on the slopes, a shade deeper
    float cs = rtContour(pos, n, w, dist);
    albedo = mix(albedo, p.deep * 0.9, cs * 0.42);

    // ---- woods: near, only a darker floor (the trees stand on it); far, painted crown masses
    float far = smoothstep(180.0, 420.0, dist);
    if (wood > 0.01) {
      float crowns = rtStrokeAt(w * 1.7 + 31.0, 36.0) - 0.5 + (rtNoiseAt(w, 22.0).b - 0.5) * 0.9;
      // (desert scrub never closes into a wood: no painted masses there)
      float mass = smoothstep(0.3, 0.55, wood + crowns * 0.35) * (1.0 - 0.85 * p.misc.w);
      float wt = rel * 0.9 + crowns * 0.75 + slow * 0.2 - (1.0 - shade) * 0.25;
      vec3 woods = rtWoodTone(p, wt);
      albedo = mix(albedo, mix(p.f0, p.f1, 0.5), wood * 0.4 * (1.0 - far));
      albedo = mix(albedo, woods, mass * far);
    }

    // ---- rock where it is steep (and in the walls of the mesas)
    float steep = 1.0 - n.y;
    float rock = smoothstep(p.rockStart, p.rockStart + 0.16, steep + (nz.b - 0.5) * 0.14);
    rock = max(rock, smoothstep(26.0, 60.0, g.y) * p.misc.w * 0.85);
    // an anchored landform (a tower, a butte) is rock on its flanks, from a gentler slope on than the country
    // round it; its gentle top and its foot stay what the country is
    float onForm = clamp((g.x - ${GROUND_FAR.toFixed(1)}) / ${(ON_LANDFORM - GROUND_FAR).toFixed(1)}, 0.0, 1.0);
    rock = max(rock, onForm * smoothstep(p.rockStart - 0.12, p.rockStart + 0.04, steep + (nz.b - 0.5) * 0.14));
    #ifdef RT_ALT
    // (version 2) in high country — from some way below the tree line up — any face steeper than about four in
    // five is bare rock, and above the tree line any slope at all; lower down the region's own rule stands (the
    // ranges on a hill country's horizon are its green, not crags)
    float high = smoothstep(lines.y - 1000.0, lines.y - 500.0, vAlt);
    rock = max(rock, smoothstep(0.19, 0.29, steep + (nz.b - 0.5) * 0.1) * high);
    rock = max(rock, smoothstep(0.08, 0.24, steep) * smoothstep(lines.y, lines.y + 260.0, vAlt + (nz.g - 0.5) * 200.0));
    #else
    // high ground is bare where it is at all steep
    rock = max(rock, smoothstep(0.1, 0.28, steep) * smoothstep(380.0, 700.0, g.y + (nz.g - 0.5) * 200.0));
    #endif
    #ifdef RT_ALT
    // (V5) a wet karst's woods hang on its towers and cones to their cliffs: where they stand the rock is theirs, and only
    // the sheer faces are limestone — streaked dark down from where the rain runs off the woods above
    float clingW = texelFetch(tCover, ivec2(5, 0), 0).w * bwIn.x + texelFetch(tCover, ivec2(5, 1), 0).w * bwIn.y
                 + texelFetch(tCover, ivec2(5, 2), 0).w * bwIn.z + texelFetch(tCover, ivec2(5, 3), 0).w * bwIn.w;
    rock *= 1.0 - clingW * smoothstep(0.12, 0.45, wood);
    #else
    float clingW = 0.0;
    #endif
    // (metres a pixel, along the ground and up a wall: for the facets' sizes)
    float pxw = max(fwidth(w.x), fwidth(w.y));
    float pxy = fwidth(rtWorldY(pos)) * 1.3;
    if (rock > 0.01) {
      // facets at four sizes at once (rtRockFacets), on the face's own plane, the joints between them dark
      float fVal;
      float fJoint;
      float pxr = mix(pxw, max(pxw, pxy), smoothstep(0.3, 0.65, steep));
      float fTurn = rtRockFacets(rtRockPlane(w, n, rtWorldY(pos), steep), pxr, fVal, fJoint);
      float farF = smoothstep(1500.0, 6000.0, dist);
      float rt = rel + fTurn * mix(0.85, 0.55, farF) + brush * 0.5 - fJoint * 0.32;
      vec3 rockCol = mix(p.rockShade, p.rockLit, smoothstep(0.38, 0.6, rt));
      // every facet has its own value, in the light or out of it: a wall in shade is still a wall of planes
      rockCol *= 0.9 + 0.36 * fVal - fJoint * 0.16;
      // strata: layers of uneven thickness and tone, bent by a slow noise (mesas and desert ranges)
      float strata = g.y / 23.0 + (rtNoiseAt(w, 400.0).r - 0.5) * 2.5;
      float layer = floor(strata);
      float thick = 0.25 + 0.5 * rtHash(vec2(layer, 3.1));
      float inLayer = step(1.0 - thick, fract(strata));
      rockCol *= mix(1.0, mix(0.66, 1.2, rtHash(vec2(layer, 7.7))), p.misc.w * inLayer);
      // (a wooded karst's cliffs: the rain's dark streaks down them, a pale one where it runs clean)
      if (clingW > 0.01) {
        vec2 sw = vec2(w.x * 0.83 + w.y * 0.56, rtWorldY(pos));
        float streak = rtNoiseAt(vec2(sw.x * 1.5, sw.y * 0.15) + 13.0, 9.0).r * 0.7 + rtNoiseAt(vec2(sw.x, sw.y * 0.05), 3.0).g * 0.3;
        rockCol *= 1.0 - clingW * (0.42 * smoothstep(0.52, 0.78, streak) - 0.12 * smoothstep(0.2, 0.06, streak));
      }
      albedo = mix(albedo, rockCol, rock * (1.0 - wood * far));
    }

    // ---- snow above the snowline (lower in the mountains), sliding off the steepest faces
    #ifdef RT_ALT
    // (version 2: above the region's snow line in metres above the sea, on the gentler faces first — the
    // steeper a face, the higher it must stand to hold snow — and never on the steepest)
    float alt = climateSnow * (1.0 - smoothstep(0.36, 0.75, steep));
    #else
    float snowLine = mix(1900.0, 380.0, p.misc.x);
    float alt = smoothstep(snowLine - 160.0, snowLine + 160.0, g.y + (nz.g - 0.5) * 320.0 + brush * 120.0 * (1.0 - smoothstep(300.0, 1500.0, dist)));
    alt *= 1.0 - smoothstep(mix(0.42, 0.55, p.misc.x), mix(0.7, 0.82, p.misc.x), steep);
    #endif
    #ifdef RT_ALT
    // Even a level, wind-scoured summit exposes mineral soil between the woods and the snowline.
    albedo = mix(albedo, mix(p.rockShade, p.rockLit, rel), smoothstep(lines.y - 90.0, lines.y, vAlt));
    #endif
    albedo = mix(albedo, rtSnowTone(tone + (rel - 0.5) * 0.6), alt);

    #ifdef RT_ALT
    // Broad planes and forked cuts remain legible after the fine rock brush has faded.
    // All marks are anchored in the land. Depth changes their contrast, never their scale.
    float aboveWood = smoothstep(lines.y - 110.0, lines.y, vAlt);
    float snowCountry = max(climateSnow, uWeather.y);
    if (dist > 900.0 && (steep > 0.006 || aboveWood > 0.0)) {
      vec4 lith = texelFetch(tCover, ivec2(7, 0), 0) * bwIn.x + texelFetch(tCover, ivec2(7, 1), 0) * bwIn.y
                + texelFetch(tCover, ivec2(7, 2), 0) * bwIn.z + texelFetch(tCover, ivec2(7, 3), 0) * bwIn.w;
      float reach = smoothstep(900.0, 2300.0, dist);
      vec2 cutUV = vec2(w.x * 0.86 + w.y * 0.51, vAlt);
      cutUV.x += w.y * 0.14 - vAlt * (0.42 - 0.26 * lith.y);
      vec4 warp = rtNoiseAt(w, 940.0);
      vec4 cut = rtNoiseAt(cutUV * vec2(1.0 + 1.4 * lith.y, 0.35 + 1.6 * lith.z) + warp.rg * 145.0, 440.0);
      float cleavage = cut.r + (cut.g - 0.5) * 0.48;
      float edge = max(fwidth(cleavage), 0.024);
      float groove = 1.0 - smoothstep(0.016, 0.016 + edge, abs(cleavage - 0.48));
      float plane = smoothstep(0.42 - edge, 0.42 + edge, cleavage) * 0.6
                  + smoothstep(0.59 - edge, 0.59 + edge, cleavage) * 0.4;
      // (as steep as the country lets rock show: a desert's range is rock wherever it slopes, a wooded country's only
      // its cliffs — a wet karst's cones and a forested range stay green far off: V2)
      float e0 = mix(0.025, 0.5, smoothstep(0.45, 0.85, p.rockStart)) * (1.0 - aboveWood);
      float exposed = smoothstep(e0, e0 + 0.12, steep + (warp.b - 0.5) * 0.06);
      float face = exposed * reach * (1.0 - 0.7 * wood) * (1.0 - clingW * smoothstep(0.1, 0.4, wood));
      vec3 shadeRock = p.rockShade * mix(vec3(0.78, 0.86, 1.0), vec3(0.41, 0.39, 0.43), lith.w);
      vec3 lightRock = mix(p.rockLit, p.rockLit * vec3(1.13, 1.10, 1.04), lith.x + lith.y);
      float key = clamp(0.58 * plane + 0.42 * rel - groove * 0.62, 0.0, 1.0);
      vec3 paint = mix(shadeRock, lightRock, smoothstep(0.2, 0.73, key));
      float ice = alt;
      // Snow collects along one lip of a cut; the opposite lip exposes the dark rock.
      float shelf = smoothstep(0.47, 0.55, cleavage + (rel - 0.5) * 0.28);
      paint = mix(paint, rtSnowTone(0.28 + 0.60 * rel + 0.14 * plane), ice * (0.25 + 0.75 * shelf));
      // Snowy ridges: interpolate one value over anchored triangular planes. A cut has a
      // straight run and a kink at the neighbouring plane, with just a chip on its edge.
      float alpineFace = max(snowCountry, p.misc.x);
      if (alpineFace > 0.01) {
        // (V2: the facets of rtRockFacets, four sizes at once, where the anchored triangles of 260 by 180 m read as a
        // mesh of big flat triangles)
        float aVal;
        float aJoint;
        float facet = clamp(0.5 + rtRockFacets(rtRockPlane(w, n, vAlt, steep), mix(pxw, max(pxw, pxy), smoothstep(0.3, 0.65, steep)), aVal, aJoint), 0.0, 1.0);
        float keyFace = 0.52 * facet + 0.48 * rel - aJoint * 0.12 + (warp.g - 0.5) * 0.025;
        float aa = max(0.014, fwidth(keyFace));
        float sunward = smoothstep(0.50 - aa, 0.50 + aa, keyFace);
        float hollow = 1.0 - smoothstep(0.32 - aa, 0.32 + aa, keyFace);
        vec3 stone = mix(p.rockShade * 0.68, p.rockLit * 0.84, sunward) * (1.0 - hollow * 0.26);
        float ledge = 0.44 - steep + (facet - 0.5) * 0.72 + hollow * 0.09;
        float lip = max(0.012, fwidth(ledge));
        float settled = smoothstep(-lip, lip, ledge);
        vec3 snowPlane = rtSnowTone(mix(0.40, 0.84, sunward));
        paint = mix(paint, mix(stone, snowPlane, settled * snowCountry), alpineFace);
        face = max(face, reach * alpineFace * max(aboveWood, smoothstep(180.0, 520.0, g.y) * (1.0 - wood)));
      }
      albedo = mix(albedo, paint, face * mix(0.83, 1.0, alpineFace));

      // In the middle distance a brush mark stands for a group of crowns: a dark base and a lit shoulder.
      float stand = reach * wood * (1.0 - rock) * (1.0 - alt) * (1.0 - smoothstep(8000.0, 22000.0, dist));
      vec4 tuft = rtNoiseAt(w + warp.rg * 35.0, 105.0);
      float clump = tuft.g + 0.26 * (tuft.r - 0.5);
      float tip = smoothstep(0.52, 0.65, clump);
      vec3 forest = rtWoodTone(p, 0.26 + 0.31 * rel + 0.32 * tip);
      forest = mix(forest, rtSnowTone(rel) * 0.83, snowCountry * tip * 0.80);
      albedo = mix(albedo, forest, stand * 0.9);
    }
    #endif

    #ifdef RT_COVER
    // ---- a marsh: water stands in the hollows of its open ground, the ground round it dark with wet
    float pool = 0.0;
    float wetAmt = dot(vec4(uCoverMisc[0].x, uCoverMisc[1].x, uCoverMisc[2].x, uCoverMisc[3].x), bwIn);
    if (wetAmt > 0.01) {
      float pn = rtNoiseAt(w + 91.0, 46.0).g * 0.65 + rtNoiseAt(w * vec2(1.0, 0.6) + 17.0, 13.0).r * 0.35;
      float level = (1.0 - smoothstep(0.004, 0.02, steep)) * smoothstep(9.0, 16.0, ad) * (1.0 - rock) * (1.0 - wood) * (1.0 - lawn) * (1.0 - alt) * wetAmt;
      pool = smoothstep(0.56, 0.6, pn) * level;
      albedo *= mix(vec3(1.0), vec3(0.7, 0.8, 0.78), smoothstep(0.44, 0.57, pn) * level);
      // (the sky lies on it where the eye skims it; looked down into, it is dark)
      vec3 toEye = normalize(cameraPosition - pos);
      albedo = mix(albedo, mix(vec3(0.03, 0.13, 0.17), vec3(0.4, 0.58, 0.72), pow(1.0 - abs(toEye.y), 3.0)), pool * 0.92);
    }
    // ---- the rows of a region's flowers or crops (the flower fields; the benches of the terraces): each row
    // a band of its own colour, to any distance — what stands in a row near the eye is what is painted far off
    float rowAmt = abs(vCover.y);
    // (how far the row coordinate runs across a pixel: asked for outside the branch)
    float rowW = fwidth(vCover.x);
    if (rowAmt > 0.004) {
      // (the cover is one region's: the one most of the ground here is)
      int si = bwIn.x >= max(bwIn.y, max(bwIn.z, bwIn.w)) ? 0 : (bwIn.y >= max(bwIn.z, bwIn.w) ? 1 : (bwIn.z >= bwIn.w ? 2 : 3));
      vec4 rw = texelFetch(tCover, ivec2(6, si), 0);
      if (rw.x > 0.0) {
        float rfw = max(rowW / rw.x, 1e-4);
        // (a row's edge is ragged where the eye is near enough to see it)
        float pr = vCover.x / rw.x + (rtNoiseAt(w, 7.0).r - 0.5) * 0.14 * (1.0 - smoothstep(0.02, 0.2, rfw));
        float rk = floor(pr);
        float rf = pr - rk;
        float band = clamp(rf / rfw + 0.5, 0.0, 1.0) * clamp((rw.y - rf) / rfw + 0.5, 0.0, 1.0) + clamp(0.5 - (1.0 - rf) / rfw, 0.0, 1.0);
        float h01 = 0.5 + 0.8 * (float((rtHash2(int(rk), 0x6b3, uCoverSeed) >> 8u) & 0xffffu) / 32768.0 - 1.0);
        vec3 hue = texelFetch(tCover, ivec2(int(clamp(floor(h01 * rw.z), 0.0, rw.z - 1.0)), si), 0).rgb;
        // rows thinner than a pixel run together into the field's own colour
        float merge = smoothstep(0.45, 1.2, rfw);
        vec3 rowCol = mix(hue, texelFetch(tCover, ivec2(5, si), 0).rgb, merge);
        // on terraced country the rows keep to the benches: everywhere but the risers' band of the height
        float benches = vCover.y < 0.0 ? p.terrace * smoothstep(0.13 - tfw, 0.13 + tfw, abs(fract(tu - 0.28) - 0.5)) : 1.0;
        // (laid on with the brush: thick here, thin there along a row, as the ground's own paint is)
        float laid = clamp(0.86 + 0.9 * (s27 * 0.55 + s95 * 0.65), 0.5, 1.0);
        float rows = rowAmt * mix(band, rw.y, merge) * laid * benches * (1.0 - rock) * (1.0 - lawn) * (1.0 - wood) * (1.0 - alt) * (1.0 - pool);
        albedo = mix(albedo, rowCol * mix(0.7, 1.12, smoothstep(0.2, 0.8, tone + s27 * 0.4)), min(1.0, rows * 1.15) * mix(1.0, 0.82, smoothstep(250.0, 1500.0, dist)));
      }
    }
    #endif

    // ---- the open meadow seen from off (V2): clumps, tufts and flecks of sun
    {
      float px1 = max(fwidth(w.x), fwidth(w.y)) / 3.2;
      float px2 = px1 * 3.2 / 0.9;
      float open = (1.0 - wood) * (1.0 - rock) * (1.0 - 0.6 * dryAmt) * (1.0 - lawn) * (1.0 - riser) * smoothstep(5.0, 9.0, ad);
      open *= 1.0 - alt;
      if (open > 0.01) albedo *= mix(vec3(1.0), rtMeadowDabs(w, dist, px1, px2, s27), open);
    }
    #ifdef RT_COVER
    {
      // far off, where no flower is drawn, the drifts of them are a dusting of their colour over the green
      int sf = bwIn.x >= max(bwIn.y, max(bwIn.z, bwIn.w)) ? 0 : (bwIn.y >= max(bwIn.z, bwIn.w) ? 1 : (bwIn.z >= bwIn.w ? 2 : 3));
      float famt = texelFetch(tCover, ivec2(6, sf), 0).w * step(45.0, dist) * (1.0 - step(900.0, dist));
      if (famt > 0.01) {
        float drift = smoothstep(0.5, 0.68, rtNoiseAt(w + 300.0, 48.0).a);
        vec4 sp = rtNoiseAt(w * 1.7 + 11.0, 7.0);
        float speck = smoothstep(0.45, 0.62, sp.g + 0.25 * drift);
        float fdust = famt * drift * speck * smoothstep(45.0, 80.0, dist) * (1.0 - smoothstep(300.0, 900.0, dist))
                    * (1.0 - wood) * (1.0 - rock) * (1.0 - dryAmt) * (1.0 - lawn) * (1.0 - clamp(rowAmt * 3.0, 0.0, 1.0)) * (1.0 - pool);
        vec3 dustCol = mix(mix(p.fl0, p.fl1, step(0.5, sp.r)), vec3(0.9, 0.86, 0.78), smoothstep(150.0, 500.0, dist) * 0.35);
        albedo = mix(albedo, dustCol, min(0.7, fdust * 1.1));
      }
    }
    #endif

    // ---- flowers in the meadows
    vec3 flc;
    float fl = rtFlowers(p, w, dist, flc) * p.misc.z * (1.0 - wood) * (1.0 - rock) * (1.0 - dryAmt) * (1.0 - lawn) * (1.0 - riser);
    #ifdef RT_COVER
    // (none of these small drifts where the flowers stand in rows, nor in the water)
    fl *= (1.0 - clamp(rowAmt * 3.0, 0.0, 1.0)) * (1.0 - pool);
    #endif
    albedo = mix(albedo, flc, fl);

    // ---- weather: snow settles on flat ground (painted, not grey), rain darkens
    float snowCover = max(uWeather.y, 0.0);
    float snow = snowCover * smoothstep(0.55, 0.85, n.y + (rtFbm(w, 16.0) - 0.5) * 0.25);
    albedo = mix(albedo, rtSnowTone(tone), clamp(snow, 0.0, 1.0));
    albedo *= 1.0 - 0.22 * uWeather.x * (1.0 - snow);

    // ---- water's edge: a pale beach above the line, wet and dark at it, the bed cooling with depth below
    float wd = g.w;
    if (wd > -3.0) {
      float ragged = (nz.b - 0.5) * 0.5 + s6 * 0.3 * (1.0 - smoothstep(22.0, 55.0, dist));
      float beach = smoothstep(-1.5, -0.3, wd + ragged) * (1.0 - rock);
      vec3 sand = mix(p.dry, vec3(0.56, 0.5, 0.36), 0.55) * mix(0.82, 1.2, smoothstep(0.25, 0.75, tone));
      #ifdef RT_COVER
      // (a reedy shore is no beach: the colour of its reed beds, which stand on it near the eye)
      float reedy = dot(vec4(uCoverMisc[0].y, uCoverMisc[1].y, uCoverMisc[2].y, uCoverMisc[3].y), bwIn);
      sand = mix(sand, vec3(0.3, 0.38, 0.1) * mix(0.62, 1.15, smoothstep(0.2, 0.8, tone + s27 * 0.6)), reedy * 0.9);
      #endif
      // old snow lies on a beach too, but never on the wet strip
      sand = mix(sand, rtSnowTone(tone), clamp(max(snow, alt), 0.0, 1.0) * (1.0 - smoothstep(-0.6, -0.15, wd)));
      albedo = mix(albedo, sand, beach);
      float wetBand = smoothstep(-0.3, -0.03, wd);
      albedo *= mix(vec3(1.0), vec3(0.6, 0.62, 0.66), wetBand);
      float under = smoothstep(0.0, 2.6, wd);
      albedo = mix(albedo, vec3(0.03, 0.14, 0.2), under * 0.9);
      // the lapping edge: a thin pale line that comes and goes along the shore
      float lapAt = wd - 0.04 + sin(uTime * 0.8 + (w.x + w.y) * 0.3) * 0.03 + (rtNoiseAt(w, 7.0).r - 0.5) * 0.08;
      float fw = fwidth(wd) * 1.2 + 0.012;
      float foam = (1.0 - smoothstep(fw, fw * 2.2, abs(lapAt))) * step(0.3, rtNoiseAt(w + uTime * 0.3, 5.0).g);
      albedo = mix(albedo, vec3(0.92, 0.95, 0.96), foam * 0.85 * (1.0 - smoothstep(120.0, 400.0, dist)));
    }

    // ---- the far land is lighter and warmer, the way a painter lays in the distance
    albedo *= mix(vec3(1.0), p.farLift, smoothstep(120.0, 1100.0, dist));

    float open = rtSlopeSun(rel) * shade;
    vec3 col = albedo * rtGroundLight(open);
    col += rtHeadlight(albedo, n, pos);
    return col;
  }
`;

/**
 * The air over the land of a world of version 2 (stage L1): ranges stand layer behind layer, each further one
 * lighter and bluer. The haze is the colour script's (shaderlib.ts rtFog: the air's colour by the hour and the
 * weather); here, from a kilometre and a half out, it no longer thins with the height of what it veils — a far
 * range sits in the air as one shape, its crest as hazed as its foot, so ranges at different distances part by
 * their values — and the nearest range, one to six kilometres off, is laid a shade deeper and richer, standing
 * in front of the paler ones behind it.
 */
export const GROUND_AIR = /* glsl */ `
  vec3 rtLayeredAir(vec3 c, vec3 pos, vec3 cam) {
    float dist = length(pos - cam);
    float nearRange = smoothstep(900.0, 2200.0, dist) * (1.0 - smoothstep(5000.0, 9000.0, dist));
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(c, (vec3(l) + (c - vec3(l)) * 1.2) * 0.86, nearRange);
    // (rtFog thins the haze over ground standing high above the eye: here the ground is let down towards the eye's
    // height for that, ever more with distance, so the haze goes by the distance)
    vec3 p = pos;
    p.y = mix(pos.y, min(pos.y, uFogBase + 250.0), smoothstep(1500.0, 7000.0, dist) * 0.7);
    vec3 o = rtFog(c, p, cam);
    // mist lies at the feet of the ranges, so that one stands clear of the next (as a matte painter lays it in):
    // over the low ground some kilometres out a band of pale air, thinning a few hundred metres up their slopes
    float rise = pos.y - uFogBase + (rtNoiseAt(rtWorldXZ(pos), 5200.0).b - 0.5) * 260.0;
    float feet = smoothstep(2600.0, 8000.0, dist) * (1.0 - smoothstep(40.0, 520.0, rise)) * (1.0 - smoothstep(60000.0, 85000.0, dist));
    vec3 mist = mix(uFogColor, vec3(dot(uFogColor, vec3(0.333))) * 1.12, 0.35);
    // Let front spurs keep their pigment; distant shoulders lose warm light before the horizon disappears.
    float middle = smoothstep(1800.0, 4200.0, dist) * (1.0 - smoothstep(12500.0, 32000.0, dist));
    o = mix(o, c * vec3(0.88, 0.94, 1.02), middle * 0.24);
    o = mix(o, o * vec3(0.89, 0.96, 1.06), smoothstep(7000.0, 26000.0, dist) * (1.0 - smoothstep(65000.0, 87000.0, dist)));
    return mix(o, mist, feet * 0.54);
  }
`;

export const GROUND_VARYINGS = /* glsl */ `
  varying vec4 vBiomeW;
  varying vec4 vGround;
  #ifdef RT_COVER
  varying vec2 vCover;
  #endif
  #ifdef RT_ALT
  varying float vAlt;
  #endif
`;

/**
 * Where a caller draws its own ground over the land in shapes the land's coarse mesh cannot hold (ModCar's proving
 * ground: its hill, its side slope), the land's vertices within this map are held down to the heights it gives, so
 * the mesh, interpolating over metres, never stands through what is drawn there. The map's texels are heights above
 * uClampBase (render space; large: no limit); uClampBox is its rectangle in render space (x0, z0, x1, z1). Off while
 * the box is empty (the default).
 */
export const terrainClamp = {
  uClampBox: { value: new THREE.Vector4(0, 0, 0, 0) },
  uClampBase: { value: 0 },
  tClamp: { value: null as THREE.Texture | null },
};

/** @param cover a world of version 2: the ground carries its flora field's cover and its height above the sea (the geometry has aCover and aAlt) */
export function terrainMaterial(cover = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    defines: cover ? { RT_COVER: '', RT_ALT: '' } : {},
    uniforms: { ...globals, ...terrainClamp, ...coverUniforms },
    vertexShader: /* glsl */ `
      ${GLSL_VERTEX_PARS}
      ${GROUND_VARYINGS}
      attribute vec4 aBiomeW;
      attribute vec4 aGround;
      #ifdef RT_COVER
      attribute vec2 aCover;
      #endif
      #ifdef RT_ALT
      attribute float aAlt;
      #endif
      uniform vec4 uClampBox;
      uniform float uClampBase;
      uniform sampler2D tClamp;
      #include <batching_pars_vertex>
      void main() {
        vBiomeW = aBiomeW;
        vGround = aGround;
        #ifdef RT_COVER
        vCover = aCover;
        #endif
        #ifdef RT_ALT
        vAlt = aAlt;
        #endif
        // (a leaf in the land's batches, scene/terrainBatch.ts, is set where it lies by its own translation)
        #ifdef USE_BATCHING
        vec4 rtWorld = modelMatrix * getBatchingMatrix(getIndirectIndex(gl_DrawID)) * vec4(position, 1.0);
        #else
        vec4 rtWorld = modelMatrix * vec4(position, 1.0);
        #endif
        if (uClampBox.z > uClampBox.x && rtWorld.x > uClampBox.x && rtWorld.x < uClampBox.z && rtWorld.z > uClampBox.y && rtWorld.z < uClampBox.w) {
          rtWorld.y = min(rtWorld.y, uClampBase + texture2D(tClamp, (rtWorld.xz - uClampBox.xy) / (uClampBox.zw - uClampBox.xy)).r);
        }
        vPos = rtWorld.xyz;
        vNormal = normal;
        gl_Position = projectionMatrix * viewMatrix * rtWorld;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      ${GROUND_VARYINGS}
      ${GROUND_PAINT}
      ${GROUND_AIR}
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vNormal);
        float dist = length(vPos - cameraPosition);
        vec3 albedo;
        vec3 col = rtPaintedGround(vPos, n, vBiomeW, vGround, dist, rtShadow(vPos, n), albedo);
        #ifdef RT_ALT
        col = rtLayeredAir(col, vPos, cameraPosition);
        #else
        col = rtFog(col, vPos, cameraPosition);
        #endif
        // far land is already flat-painted: the paint finish leaves it alone
        gl_FragColor = vec4(col, mix(1.0, 0.5, smoothstep(900.0, 1400.0, dist)));
      }`,
  });
}

const v3 = (c: [number, number, number]): THREE.Vector3 => new THREE.Vector3(c[0], c[1], c[2]);

/** @param cover a world of version 2: the ground beside the road carries its flora field's cover and its height above the sea (the geometry has aCover and aAlt) */
export function roadStripMaterial(cover = false): THREE.ShaderMaterial {
  const R = STYLE.road;
  return new THREE.ShaderMaterial({
    defines: cover ? { RT_COVER: '', RT_ALT: '' } : {},
    uniforms: {
      ...globals,
      ...skyMirrorUniforms(),
      ...waterUniforms,
      ...coverUniforms,
      uAsphaltLit: { value: v3(R.asphalt.lit) },
      uAsphaltMid: { value: v3(R.asphalt.mid) },
      uAsphaltDeep: { value: v3(R.asphalt.deep) },
      uPatch: { value: v3(R.patch) },
      uGravel: { value: v3(R.gravel) },
      uPaint: { value: v3(R.paint) },
    },
    vertexShader: /* glsl */ `
      ${GLSL_VERTEX_PARS}
      ${GROUND_VARYINGS}
      attribute vec4 aBiomeW;
      attribute vec4 aGround;
      #ifdef RT_COVER
      attribute vec4 aRoadStyle;
      flat varying vec4 vRoadStyle;
      #endif
      attribute vec4 aRoad;   // x: lateral offset d (m, + right), y: distance along the road (m, wrapped), z: on a bridge 0…1,
                              // w: on the levelled ground of a place 0…1 (negative: an old concrete forecourt)
      #ifdef RT_COVER
      attribute vec2 aCover;
      #endif
      #ifdef RT_ALT
      attribute float aAlt;
      #endif
      varying vec4 vRoad;
      void main() {
        vBiomeW = aBiomeW;
        vGround = aGround;
        vRoad = aRoad;
        #ifdef RT_COVER
        vRoadStyle = aRoadStyle;
        #endif
        #ifdef RT_COVER
        vCover = aCover;
        #endif
        #ifdef RT_ALT
        vAlt = aAlt;
        #endif
        vec4 rtWorld = modelMatrix * vec4(position, 1.0);
        vPos = rtWorld.xyz;
        vNormal = normal;
        gl_Position = projectionMatrix * viewMatrix * rtWorld;
        #include <logdepthbuf_vertex>
        // The strip lies on top of the coarser terrain: pull its depth slightly towards the eye,
        // more with distance, so far-away terrain can never poke through the road.
        float rtDist = length(rtWorld.xyz - cameraPosition);
        #if defined(USE_LOGARITHMIC_DEPTH_BUFFER)
        vFragDepth *= 1.0 - (0.0012 + 0.02 * smoothstep(120.0, 1500.0, rtDist));
        #elif defined(USE_REVERSED_DEPTH_BUFFER)
        // (a reversed depth is near / distance: depth / k is the depth of a point k times as far)
        gl_Position.z /= 1.0 - (0.0012 + 0.02 * smoothstep(120.0, 1500.0, rtDist));
        #endif
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      ${GROUND_VARYINGS}
      ${GROUND_PAINT}
      uniform vec3 uAsphaltLit;
      uniform vec3 uAsphaltMid;
      uniform vec3 uAsphaltDeep;
      uniform vec3 uPatch;
      uniform vec3 uGravel;
      uniform vec3 uPaint;
      uniform float uWaterRain;
      ${GLSL_SKY_MIRROR}
      varying vec4 vRoad;
      #ifdef RT_COVER
      flat varying vec4 vRoadStyle;
      #endif
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vNormal);
        vec2 w = rtWorldXZ(vPos);
        float dist = length(vPos - cameraPosition);
        float ad = abs(vRoad.x);
        float deck = smoothstep(0.3, 0.7, vRoad.z);
        float aa = fwidth(vRoad.x) * 1.5 + 0.004;
        float sh = rtShadow(vPos, n);

        // ---- open ground beside the road
        vec3 groundAlb;
        vec3 ground = rtPaintedGround(vPos, n, vBiomeW, vGround, dist, sh, groundAlb);
        // ---- the ground of a place by the road: packed gravel worn bare by wheels, or an old forecourt
        // of concrete slabs; the grass is coming back from the edges and up through every crack
        float lot = abs(vRoad.w);
        if (lot > 0.003) {
          vec4 ln = rtNoiseAt(w, 9.0);
          float edge = smoothstep(0.3, 0.62, lot + (ln.r - 0.5) * 0.42 + (rtNoiseAt(w, 2.3).g - 0.5) * 0.2);
          float ltone = rtSlopeRel(n) + (rtStrokeAt(w, 5.0) - 0.5) * 0.5 * (1.0 - smoothstep(20.0, 60.0, dist)) + (rtStrokeAt(w + 31.0, 21.0) - 0.5) * 0.36 + 0.3 * sh - (1.0 - sh) * 0.3;
          vec3 lotAlb = mix(uGravel, rtPal(vBiomeW).dry, 0.3) * mix(0.72, 1.14, smoothstep(0.2, 0.8, ltone));
          // where wheels turned in and out, the gravel is paler and smoother
          lotAlb *= 1.0 + 0.1 * smoothstep(0.5, 0.75, rtNoiseAt(w * vec2(0.35, 1.0) + 77.0, 26.0).b);
          float weeds = smoothstep(0.6, 0.72, rtNoiseAt(w + 41.0, 6.5).a + (ln.g - 0.5) * 0.3);
          if (vRoad.w < 0.0) {
            // slabs four metres square, laid with the road: dark joints, weeds in some of them; here and
            // there the concrete has broken up and the gravel under it shows
            vec2 sq = vec2(vRoad.x, vRoad.y) / 4.0;
            vec2 sf = abs(fract(sq) - 0.5);
            float jw = max(fwidth(sq.x), fwidth(sq.y));
            float joint = smoothstep(0.5 - 0.014 - jw, 0.5 - 0.004, max(sf.x, sf.y)) * (1.0 - smoothstep(0.08, 0.25, jw));
            float slabTone = (rtHash(floor(sq) + 5.5) - 0.5) * 0.3;
            vec3 conc = vec3(0.36, 0.35, 0.315) * mix(0.72, 1.14, smoothstep(0.2, 0.8, ltone + slabTone));
            // oil where cars stood, rust where water stood
            conc *= 1.0 - 0.3 * smoothstep(0.66, 0.8, rtNoiseAt(w + 13.0, 7.0).r);
            conc = mix(conc, conc * vec3(1.14, 0.9, 0.7), smoothstep(0.62, 0.8, rtNoiseAt(w + 57.0, 15.0).g) * 0.5);
            float whole = 1.0 - smoothstep(0.6, 0.68, rtNoiseAt(w + 3.0, 34.0).r + (ln.b - 0.5) * 0.15);
            float inJoint = joint * step(0.62, rtNoiseAt(w, 5.0).r);
            lotAlb = mix(lotAlb, mix(conc, conc * 0.5, joint * 0.85), whole);
            weeds = mix(weeds, max(weeds * 0.3, inJoint), whole);
          }
          lotAlb = mix(lotAlb, groundAlb, weeds * 0.85);
          // weather, as on the shoulders
          float lsnow = uWeather.y * smoothstep(0.55, 0.85, n.y + (rtFbm(w, 16.0) - 0.5) * 0.25);
          lotAlb = mix(lotAlb, rtSnowTone(ltone), clamp(lsnow, 0.0, 1.0));
          lotAlb *= 1.0 - 0.3 * uWeather.x * (1.0 - clamp(lsnow, 0.0, 1.0));
          vec3 lotCol = lotAlb * rtGroundLight(rtSlopeSun(rtSlopeRel(n)) * sh) + rtHeadlight(lotAlb, n, vPos);
          ground = mix(ground, lotCol, edge);
          groundAlb = mix(groundAlb, lotAlb, edge);
        }
        if (ad > 5.6) {
          gl_FragColor = vec4(rtFog(ground, vPos, cameraPosition), 1.0);
          return;
        }

        // ---- asphalt, painted by tone like everything else: three greys, brush marks, old repairs
        float near = 1.0 - smoothstep(25.0, 90.0, dist);
        float rel = rtSlopeRel(n);
        // long strokes laid along the road (road coordinates: 2 m across, 16 m along), not round blotches
        float brush = (texture2D(tStrokes, vec2(vRoad.x / 2.5, vRoad.y / 5.0)).r - 0.5) * 0.24 * (1.0 - smoothstep(20.0, 60.0, dist))
                    + (texture2D(tStrokes, vec2(vRoad.x / 8.0 + 0.37, vRoad.y / 32.0)).r - 0.5) * 0.2;
        // sunlit asphalt sits high in its tones (a warm grey); in shade it drops to the cool blue deep
        float tone = rel + brush + (rtFbm(w, 64.0) - 0.5) * 0.2 + 0.34 * sh - (1.0 - sh) * 0.32;
        vec3 asphalt = mix(uAsphaltDeep, uAsphaltMid, smoothstep(0.15, 0.45, tone));
        asphalt = mix(asphalt, uAsphaltLit, smoothstep(0.55, 0.9, tone));
        // broad warm and cool patches, as on the ground: old asphalt is never one grey
        float aw = smoothstep(0.44, 0.6, rtNoiseAt(w + 211.0, 70.0).g);
        float ac = smoothstep(0.6, 0.72, rtNoiseAt(w * vec2(1.0, 0.6) + 97.0, 45.0).b) * 0.7;
        asphalt *= mix(vec3(1.0), vec3(1.14, 1.04, 0.86), aw * 0.8);
        asphalt *= mix(vec3(1.0), vec3(0.88, 0.95, 1.12), ac * (0.8 - 0.5 * aw));
        // old repairs: irregular darker, bluer patches with soft painted edges (no straight seams)
        float rep = rtNoiseAt(w * vec2(1.0, 1.0) + 151.0, 22.0).a + (rtNoiseAt(w + 9.0, 5.0).r - 0.5) * 0.25;
        asphalt = mix(asphalt, uPatch * 1.6, smoothstep(0.66, 0.72, rep) * 0.3);
        // where the asphalt has split (the centre joint, the lane edges) moss and weeds have moved in:
        // soft green seams in short runs, wider where they have spread
        RtPal rp = rtPal(vBiomeW);
        float joint = min(ad, abs(ad - 3.05));
        float spread = rtNoiseAt(w * vec2(1.0, 1.0) + 33.0, 9.0).r;
        float moss = (1.0 - smoothstep(0.04 + 0.22 * spread * spread, 0.1 + 0.32 * spread * spread, joint)) * step(0.6, rtNoise(vec2(vRoad.y / 4.0, 1.0), 1024.0));
        asphalt = mix(asphalt, mix(rp.deep, rp.mid, 0.4 + 0.4 * spread) * 0.9, moss * 0.5 * (0.25 + 0.75 * smoothstep(0.1, 0.6, rp.misc.z)));
        // blown sand (dry country) and old snow (the mountains) lie on the road in drifts
        float drift = smoothstep(0.55, 0.75, rtNoiseAt(w + 71.0, 14.0).g + smoothstep(1.4, 3.2, ad) * 0.25);
        asphalt = mix(asphalt, rp.dry * 1.05, drift * 0.55 * smoothstep(0.4, 0.8, rp.misc.y));
        #ifdef RT_ALT
        asphalt = mix(asphalt, rtSnowTone(tone), drift * 0.75 * rtSeasonSnow(vAlt, vBiomeW));
        #else
        asphalt = mix(asphalt, rtSnowTone(tone), drift * 0.75 * rp.misc.x);
        #endif
        // wheel tracks: slightly darker, smoother bands in each lane
        float track = exp(-pow((abs(ad - 1.65) - 0.75) / 0.28, 2.0));
        asphalt *= 1.0 - 0.08 * track;
        // sand and soil creep in from the pavement edge, never across the lanes
        float creep = smoothstep(2.75, 3.3, ad + (rtFbm(w, 4.0) - 0.5) * 0.9);
        asphalt = mix(asphalt, mix(uGravel, groundAlb, 0.35), creep * 0.55);

        #ifdef RT_COVER
        vec4 treatment = deck > 0.5 ? vec4(3.0,0.45,0.0,3.25) : vRoadStyle;
        float kind = treatment.x;
        float halfRoad = treatment.w;
        float grain = rtNoiseAt(w,1.4).g;
        float lightTone = mix(0.72,1.11,smoothstep(0.23,0.78,tone));
        if (kind < 0.5) asphalt = vec3(0.079,0.093,0.106)*lightTone*(1.0+brush*0.55);
        else if (kind < 1.5) asphalt = mix(asphalt,uPatch*0.95,smoothstep(0.55,0.62,rep)*0.57);
        else if (kind < 2.5) asphalt = mix(vec3(0.175,0.159,0.132),vec3(0.292,0.276,0.223),grain)*lightTone;
        else if (kind < 3.5) {
          float seam = min(abs(fract(vRoad.y/8.0+0.5)-0.5)*8.0,ad);
          asphalt = vec3(0.48,0.465,0.414)*lightTone*(0.91+0.13*grain);
          asphalt *= 1.0-0.48*(1.0-smoothstep(0.025,0.060+aa,seam))*near;
        } else if (kind < 5.5) {
          vec3 earth = kind < 4.5 ? vec3(0.35,0.305,0.242) : vec3(0.386,0.239,0.129);
          asphalt = earth*lightTone*(0.76+0.35*grain+brush*0.45);
          asphalt *= 1.0-0.15*track;
          asphalt = mix(asphalt,rp.mid,0.16*(1.0-smoothstep(0.30,0.85,ad))*spread);
        } else {
          vec2 row = vec2(vRoad.x/0.38,vRoad.y/0.25);
          row.x += 0.5*mod(floor(row.y),2.0);
          vec2 inset = 0.5-abs(fract(row)-0.5);
          float stone = smoothstep(0.018,0.13,min(inset.x,inset.y));
          float value = 0.84+0.26*rtHash(floor(row)+7.0);
          asphalt = vec3(0.332,0.297,0.254)*lightTone*mix(0.89,mix(0.55,value,stone),near);
        }
        #endif
        // ---- markings, mostly worn away
        float wear = rtFbm(w + 91.0, 32.0);
        float dash = step(fract(vRoad.y / 12.0), 0.34);
        float centre = (1.0 - smoothstep(0.055 - aa, 0.075 + aa, ad)) * dash * smoothstep(0.3, 0.5, wear);
        float edge = (1.0 - smoothstep(0.05 - aa, 0.07 + aa, abs(ad - 2.95))) * smoothstep(0.48, 0.62, wear);
        float lineVis = 1.0 - smoothstep(200.0, 700.0, dist) * 0.6;
        #ifdef RT_COVER
        float sharp = step(0.9,treatment.y);
        centre = (1.0-smoothstep(0.055-aa,0.075+aa,ad))*dash*mix(smoothstep(0.34,0.58,wear),1.0,sharp);
        edge = (1.0-smoothstep(0.05-aa,0.07+aa,abs(ad-halfRoad+0.24)))*mix(smoothstep(0.43,0.64,wear),1.0,sharp);
        lineVis *= treatment.y;
        #endif
        asphalt = mix(asphalt, uPaint, max(centre, edge) * 0.85 * lineVis);

        // ---- compose: pavement → gravel shoulder → ground, with ragged painted edges
        float ragged = (rtFbm(w, 4.0) - 0.5) * 0.5 + (rtFbm(w, 1.0) - 0.5) * 0.15;
        float paved = 1.0 - smoothstep(3.2 + ragged - aa, 3.3 + ragged + aa, ad);
        float shoulder = 1.0 - smoothstep(3.8 + ragged * 2.0, 4.7 + ragged * 2.0, ad);
        vec3 gravel = uGravel * mix(0.7, 1.12, smoothstep(0.25, 0.75, tone));
        gravel = mix(gravel, groundAlb, 0.3);
        #ifdef RT_COVER
        paved = 1.0-smoothstep(halfRoad+ragged-aa-0.045,halfRoad+ragged+aa+0.045,ad);
        float vergeKind = treatment.z;
        if (vergeKind == 1.0) shoulder = 1.0-smoothstep(halfRoad,halfRoad+0.18,ad+ragged);
        if (vergeKind == 2.0) gravel *= 1.0-0.26*smoothstep(3.6,4.7,ad);
        if (vergeKind == 3.0) {
          gravel = vec3(0.43,0.40,0.35)*lightTone*(0.85+0.15*grain);
          shoulder = 1.0-smoothstep(halfRoad+0.36,halfRoad+0.45,ad);
        }
        if (vergeKind == 4.0) gravel = mix(gravel,rtSnowTone(tone),smoothstep(3.25,4.23,ad+ragged));
        if (vergeKind == 5.0) {
          gravel = mix(gravel,rp.dry,0.78);
          asphalt = mix(asphalt,rp.dry,0.88*smoothstep(2.15,3.66,ad+(drift-0.35)*1.02));
        }
        #endif
        // a bridge deck is concrete from the lane's edge to the kerb, with a dark joint every few metres
        vec3 concrete = vec3(0.47, 0.46, 0.42) * mix(0.8, 1.12, smoothstep(0.25, 0.75, tone));
        concrete *= 1.0 - 0.3 * (1.0 - smoothstep(0.02, 0.05, abs(fract(vRoad.y / 6.0) - 0.5) * 6.0));
        gravel = mix(gravel, concrete, deck);
        shoulder = max(shoulder, deck);
        vec3 albedo = mix(gravel, asphalt, paved);

        // ---- weather
        vec2 ww = w;
        float snowCover = uWeather.y * mix(1.0, 0.55, paved) + (1.0 - mix(1.0, 0.55, paved)) * smoothstep(0.6, 1.0, uWeather.y) * uWeather.y;
        float snow = snowCover * smoothstep(0.55, 0.85, n.y + (rtFbm(ww, 16.0) - 0.5) * 0.25);
        // once the snow lies, the wheels of whoever came before have pressed two dark tracks into each lane
        float ruts = track * smoothstep(0.3, 0.6, uWeather.y) * (0.7 + 0.3 * rtNoise(vec2(vRoad.y / 7.0, 3.0), 1024.0)) * paved;
        snow *= 1.0 - 0.78 * ruts;
        albedo = mix(albedo, rtSnowTone(tone), clamp(snow, 0.0, 1.0));
        albedo *= 1.0 - 0.3 * ruts * uWeather.y;
        // wet asphalt drinks the light: much darker than dry (the shoulders and the ground less so)
        float wetness = uWeather.x * (1.0 - clamp(snow, 0.0, 1.0));
        albedo *= 1.0 - mix(0.22, 0.46, paved) * wetness;

        vec3 col = albedo * rtGroundLight(rtSlopeSun(rel) * sh);
        vec3 v = normalize(cameraPosition - vPos);
        float wet = wetness * max(paved, deck);
        // ---- puddles: water gathers in the wheel tracks and the low patches once the road is well wet,
        // and stays a while after the rain; each is a little mirror for the sky
        float lowSpot = rtNoiseAt(vec2(vRoad.x * 1.6, vRoad.y * 0.55) + 17.0, 11.0).r * 0.62 + rtNoiseAt(w + 51.0, 31.0).g * 0.38 + track * 0.16;
        float fill = smoothstep(0.35, 1.0, uWeather.x);
        // (a quarter of the road at most: puddles, not a flood)
        float pe = 0.86 - 0.2 * fill;
        float puddle = smoothstep(pe, pe + 0.035, lowSpot + (rtFbm(w, 2.0) - 0.5) * 0.05) * step(0.02, fill) * wet;
        // the film of water: the sky's light lies on it where the eye skims the road
        float nv = max(dot(n, v), 0.0);
        float fres = 0.03 + 0.97 * pow(1.0 - nv, 5.0);
        vec3 up = normalize(mix(n, vec3(0.0, 1.0, 0.0), puddle));
        vec3 rd = reflect(-v, up);
        // (rain breaks the mirror: rings where the drops land)
        float ringAmt = 0.0;
        if (uWaterRain > 0.02 && puddle > 0.01 && dist < 70.0) {
          // (small rings, a hand's width, here and there: not every drop makes one you can see)
          vec2 cell = floor(w / 0.22);
          vec2 f = fract(w / 0.22) - 0.5;
          float hsh = rtHash(cell + 3.3);
          float ph = fract(uTime * (1.1 + hsh) + hsh * 7.0);
          ringAmt = (1.0 - smoothstep(0.04, 0.1, abs(length(f - (vec2(rtHash(cell), rtHash(cell + 9.1)) - 0.5) * 0.4) - ph * 0.4))) * (1.0 - ph) * step(hsh, uWaterRain * 0.45) * (1.0 - smoothstep(18.0, 45.0, dist));
        }
        rd = normalize(rd + vec3(0.0, 0.25 * ringAmt, 0.0));
        vec3 skyR = rtSkyMirror(rd);
        vec3 hv = normalize(v + uSunDir);
        float glint = pow(max(dot(up, hv), 0.0), mix(40.0, 600.0, puddle)) * sh;
        col = mix(col, skyR * 0.85, wet * fres * 0.3);
        col = mix(col, skyR * 0.92, puddle * (0.3 + 0.7 * smoothstep(0.0, 0.6, fres)));
        col += uSunColor * glint * wet * mix(0.5, 2.5, puddle) * uSunVis;
        col += ringAmt * puddle * skyR * 0.5;
        col += rtHeadlight(albedo, n, vPos) * (1.0 + 0.6 * wet);
        // the head lamps in wet asphalt: each a long smear of light down the road towards the eye — the lamp's
        // mirror image drawn out along the view (the water's ripples tilt the mirror up and down far more than
        // sideways): tight across, long along, only where the lamp shines this way
        if (wet > 0.01 && uHeadColor.r + uHeadColor.g + uHeadColor.b > 0.01) {
          vec3 rf = reflect(-v, vec3(0.0, 1.0, 0.0));
          vec3 aside = normalize(cross(uHeadDir, vec3(0.0, 1.0, 0.0)));
          vec3 across = normalize(cross(v, vec3(0.0, 1.0, 0.0)));
          float smear = 0.0;
          for (int k = 0; k < 2; k++) {
            vec3 L = uHeadPos + aside * (k == 0 ? -0.55 : 0.55) - vPos;
            float dl = length(L);
            L /= max(dl, 1e-3);
            vec3 dd = rf - L;
            float sa = dot(dd, across);
            float sb = length(dd - across * sa);
            smear += exp(-sa * sa * 2500.0) * exp(-sb * sb * 22.0) * smoothstep(0.5, 0.95, dot(-L, uHeadDir)) / (1.0 + dl * dl * 0.004);
          }
          // (broken by the water's ripples into a run of brighter and darker bits along it)
          float rip = 0.55 + 0.45 * rtNoiseAt(vec2(vRoad.x * 3.0, vRoad.y * 0.35) + uTime * 0.05, 2.0).r;
          col += uHeadColor * smear * wet * mix(0.5, 1.0, puddle) * 0.55 * rip;
        }
        col = mix(ground, col, shoulder);
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/** Thin lines (overhead wires): unlit, fogged. */
export function wireMaterial(color: THREE.ColorRepresentation = 0x2b2d31): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...globals, uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */ `
      ${GLSL_VERTEX_PARS}
      void main() {
        vec4 rtWorld = modelMatrix * vec4(position, 1.0);
        vPos = rtWorld.xyz;
        vNormal = vec3(0.0, 1.0, 0.0);
        gl_Position = projectionMatrix * viewMatrix * rtWorld;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      uniform vec3 uColor;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 col = uColor * (uSkyColor * 0.8 + uSunColor * 0.12);
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
