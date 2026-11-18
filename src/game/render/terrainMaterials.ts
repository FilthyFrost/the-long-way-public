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
 */
import * as THREE from 'three';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, GLSL_VERTEX_PARS, globals } from './shaderlib';
import { GLSL_PAINT } from './paint';
import { GLSL_SKY_MIRROR, skyMirrorUniforms } from '../env/sky';
import { waterUniforms } from './water';
import { STYLE } from './style';

export const GROUND_PAINT = /* glsl */ `
  ${GLSL_PAINT}
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
    float wood = max(g.z, 0.0) * (1.0 - smoothstep(450.0, 850.0, g.y));
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

    // ---- where the meadow grass stands (near the eye), the ground between the blades is their roots
    float underGrass = (1.0 - smoothstep(45.0, 70.0, dist)) * smoothstep(5.0, 8.0, ad) * p.misc.z * (1.0 - wood) * (1.0 - dryAmt);
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
    // high ground is bare where it is at all steep
    rock = max(rock, smoothstep(0.1, 0.28, steep) * smoothstep(380.0, 700.0, g.y + (nz.g - 0.5) * 200.0));
    if (rock > 0.01) {
      // facets at three sizes, each turned its own way to the light, with dark seams between them;
      // the size follows the distance, so a far face still breaks into a few painted planes
      float fs = dist < 120.0 ? 7.0 : dist < 900.0 ? 40.0 : 160.0;
      vec2 fq = w / fs + rtNoiseAt(w, fs * 4.6).rg * 1.4;
      vec4 fh = rtHash4(floor(fq));
      vec2 fe = abs(fract(fq) - 0.5);
      float farF = smoothstep(1500.0, 6000.0, dist);
      float seam = smoothstep(0.42, 0.5, max(fe.x, fe.y)) * (1.0 - smoothstep(0.6, 1.0, max(fwidth(fq.x), fwidth(fq.y)) * 6.0)) * (1.0 - farF);
      float rt = rel + (fh.x - 0.5) * mix(0.55, 0.18, farF) + brush * 0.5 - seam * 0.3;
      vec3 rockCol = mix(p.rockShade, p.rockLit, smoothstep(0.38, 0.6, rt));
      // every facet has its own value, in the light or out of it: a wall in shade is still a wall of planes
      rockCol *= 0.84 + 0.34 * fh.y - seam * 0.1;
      // strata: layers of uneven thickness and tone, bent by a slow noise (mesas and desert ranges)
      float strata = g.y / 23.0 + (rtNoiseAt(w, 400.0).r - 0.5) * 2.5;
      float layer = floor(strata);
      float thick = 0.25 + 0.5 * rtHash(vec2(layer, 3.1));
      float inLayer = step(1.0 - thick, fract(strata));
      rockCol *= mix(1.0, mix(0.66, 1.2, rtHash(vec2(layer, 7.7))), p.misc.w * inLayer);
      albedo = mix(albedo, rockCol, rock * (1.0 - wood * far));
    }

    // ---- snow above the snowline (lower in the mountains), sliding off the steepest faces
    float snowLine = mix(1900.0, 380.0, p.misc.x);
    float alt = smoothstep(snowLine - 160.0, snowLine + 160.0, g.y + (nz.g - 0.5) * 320.0 + brush * 120.0 * (1.0 - smoothstep(300.0, 1500.0, dist)));
    alt *= 1.0 - smoothstep(mix(0.42, 0.55, p.misc.x), mix(0.7, 0.82, p.misc.x), steep);
    albedo = mix(albedo, rtSnowTone(tone + (rel - 0.5) * 0.6), alt);

    // ---- flowers in the meadows
    vec3 flc;
    float fl = rtFlowers(p, w, dist, flc) * p.misc.z * (1.0 - wood) * (1.0 - rock) * (1.0 - dryAmt) * (1.0 - lawn);
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

export const GROUND_VARYINGS = /* glsl */ `
  varying vec4 vBiomeW;
  varying vec4 vGround;
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

export function terrainMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...globals, ...terrainClamp },
    vertexShader: /* glsl */ `
      ${GLSL_VERTEX_PARS}
      ${GROUND_VARYINGS}
      attribute vec4 aBiomeW;
      attribute vec4 aGround;
      uniform vec4 uClampBox;
      uniform float uClampBase;
      uniform sampler2D tClamp;
      void main() {
        vBiomeW = aBiomeW;
        vGround = aGround;
        vec4 rtWorld = modelMatrix * vec4(position, 1.0);
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
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vNormal);
        float dist = length(vPos - cameraPosition);
        vec3 albedo;
        vec3 col = rtPaintedGround(vPos, n, vBiomeW, vGround, dist, rtShadow(vPos, n), albedo);
        col = rtFog(col, vPos, cameraPosition);
        // far land is already flat-painted: the paint finish leaves it alone
        gl_FragColor = vec4(col, mix(1.0, 0.5, smoothstep(900.0, 1400.0, dist)));
      }`,
  });
}

const v3 = (c: [number, number, number]): THREE.Vector3 => new THREE.Vector3(c[0], c[1], c[2]);

export function roadStripMaterial(): THREE.ShaderMaterial {
  const R = STYLE.road;
  return new THREE.ShaderMaterial({
    uniforms: {
      ...globals,
      ...skyMirrorUniforms(),
      ...waterUniforms,
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
      attribute vec4 aRoad;   // x: lateral offset d (m, + right), y: distance along the road (m, wrapped), z: on a bridge 0…1,
                              // w: on the levelled ground of a place 0…1 (negative: an old concrete forecourt)
      varying vec4 vRoad;
      void main() {
        vBiomeW = aBiomeW;
        vGround = aGround;
        vRoad = aRoad;
        vec4 rtWorld = modelMatrix * vec4(position, 1.0);
        vPos = rtWorld.xyz;
        vNormal = normal;
        gl_Position = projectionMatrix * viewMatrix * rtWorld;
        #include <logdepthbuf_vertex>
        // The strip lies on top of the coarser terrain: pull its depth slightly towards the eye,
        // more with distance, so far-away terrain can never poke through the road.
        float rtDist = length(rtWorld.xyz - cameraPosition);
        vFragDepth *= 1.0 - (0.0012 + 0.02 * smoothstep(120.0, 1500.0, rtDist));
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
        asphalt = mix(asphalt, rtSnowTone(tone), drift * 0.75 * rp.misc.x);
        // wheel tracks: slightly darker, smoother bands in each lane
        float track = exp(-pow((abs(ad - 1.65) - 0.75) / 0.28, 2.0));
        asphalt *= 1.0 - 0.08 * track;
        // sand and soil creep in from the pavement edge, never across the lanes
        float creep = smoothstep(2.75, 3.3, ad + (rtFbm(w, 4.0) - 0.5) * 0.9);
        asphalt = mix(asphalt, mix(uGravel, groundAlb, 0.35), creep * 0.55);

        // ---- markings, mostly worn away
        float wear = rtFbm(w + 91.0, 32.0);
        float dash = step(fract(vRoad.y / 12.0), 0.34);
        float centre = (1.0 - smoothstep(0.055 - aa, 0.075 + aa, ad)) * dash * smoothstep(0.3, 0.5, wear);
        float edge = (1.0 - smoothstep(0.05 - aa, 0.07 + aa, abs(ad - 2.95))) * smoothstep(0.48, 0.62, wear);
        float lineVis = 1.0 - smoothstep(200.0, 700.0, dist) * 0.6;
        asphalt = mix(asphalt, uPaint, max(centre, edge) * 0.85 * lineVis);

        // ---- compose: pavement → gravel shoulder → ground, with ragged painted edges
        float ragged = (rtFbm(w, 4.0) - 0.5) * 0.5 + (rtFbm(w, 1.0) - 0.5) * 0.15;
        float paved = 1.0 - smoothstep(3.2 + ragged - aa, 3.3 + ragged + aa, ad);
        float shoulder = 1.0 - smoothstep(3.8 + ragged * 2.0, 4.7 + ragged * 2.0, ad);
        vec3 gravel = uGravel * mix(0.7, 1.12, smoothstep(0.25, 0.75, tone));
        gravel = mix(gravel, groundAlb, 0.3);
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
