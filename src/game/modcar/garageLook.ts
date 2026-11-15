/**
 * The look of the starting garage (docs/MODCAR.md §9, specs/art/STYLE.md): what each shading group
 * of its GLB (tools/blender/garage/_kit.py LOOK) is drawn with.
 *
 * The building is background: painted like the houses by the road (brushwork in the plane of each
 * face, no ink lines). What stands in it — machines, tools, drums, lamps — is drawn like the
 * vehicles: cel tones and the warm dark ink line round it. A group is one mesh whatever its colours:
 * each corner carries its colour (linear, × the piece's own variation) and, in alpha, the baked
 * ambient occlusion (attribute aTintAO). Glass and the lamps that switch keep meshes of their own.
 */
import * as THREE from 'three';
import { glassMaterial } from '../render/materials';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, GLSL_VERTEX_MAIN, GLSL_VERTEX_PARS, globals, ROOM_LAMPS } from '../render/shaderlib';

interface GroupLook {
  /** brushwork in the plane of each face (the building) */
  brush?: number;
  /** inked like a prop */
  ink?: boolean;
  /** strength of the sun's (and the lamps') highlight, 0…1 */
  spec?: number;
  double?: boolean;
  /** lit from within (the bulbs, the charger's lamp, the radio's dial): switched by setGlow */
  glow?: boolean;
}

const GROUPS: Record<string, GroupLook> = {
  bld: { brush: 0.6 },
  bld2: { brush: 0.5, double: true },
  prop: { ink: true, spec: 0.22 },
  shiny: { ink: true, spec: 0.9 },
  prop2: { ink: true, spec: 0.05, double: true },
  bulb: { glow: true },
  led: { glow: true, ink: true },
  dial: { glow: true, ink: true },
  fire: { glow: true },
  lamp_out: { glow: true },
};

/** the glass, as before: its own meshes (sRGB tint, opacity) */
const GLASS: Record<string, [number, number]> = {
  win_glass: [0xc4d8dc, 0.14],
  glass: [0xbfd6dc, 0.22],
  skylight: [0xeef0dc, 0.55],
};

/** the glowing bits that are switched (lamps, the charger's lamp, the radio's dial, the stove's fire, the lamp over the doors) */
export type GlowName = 'bulb' | 'led' | 'dial' | 'fire' | 'lamp_out';
const GLOW_NAMES: readonly string[] = ['bulb', 'led', 'dial', 'fire', 'lamp_out'];

const VERTEX = /* glsl */ `
  ${GLSL_VERTEX_PARS}
  attribute vec4 aTintAO;
  varying vec4 vTintAO;
  void main() {
    vTintAO = aTintAO;
    vec3 transformed = position;
    vec3 objNormal = normal;
    ${GLSL_VERTEX_MAIN}
  }`;

/**
 * Cel light for the garage's groups: the colour from the corner tint, the AO from its alpha (it softens
 * the sky's light most, the sun's and the lamps' less), brushwork for the building, the sun's sheen and
 * the lamps' glints on shiny things, the ink id from the colour alone.
 */
export function garageCelMaterial(o: GroupLook): THREE.ShaderMaterial {
  const defines: Record<string, string> = {};
  if (o.brush) defines.RT_BRUSH = '';
  if (o.ink) defines.RT_INK = '';
  if (o.double) defines.RT_DOUBLE = '';
  return new THREE.ShaderMaterial({
    defines,
    side: o.double ? THREE.DoubleSide : THREE.FrontSide,
    uniforms: {
      ...globals,
      uBrush: { value: o.brush ?? 0 },
      uSpec: { value: o.spec ?? 0 },
      uEmissive: { value: new THREE.Color(0, 0, 0) },
    },
    vertexShader: VERTEX,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      uniform float uBrush;
      uniform float uSpec;
      uniform vec3 uEmissive;
      varying vec4 vTintAO;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vNormal);
        #ifdef RT_DOUBLE
        if (!gl_FrontFacing) n = -n;
        #endif
        vec3 base = vTintAO.rgb;
        float ao = clamp(vTintAO.a, 0.0, 1.0);
        vec3 albedo = base;
        #ifdef RT_BRUSH
        {
          // strokes a hand long and an arm long in the plane of the face, and a slow drift of tone
          vec2 bw = rtWorldXZ(vPos);
          vec2 bq = bw;
          if (abs(n.y) < 0.6) bq = vec2(dot(vPos.xz, normalize(vec2(-n.z, n.x))), rtWorldY(vPos));
          float bd = length(vPos - cameraPosition);
          float marks = (rtStrokeAt(bq, 1.3) - 0.5) * (1.0 - smoothstep(18.0, 50.0, bd)) + (rtStrokeAt(bq + 7.3, 5.0) - 0.5) * 0.8 * (1.0 - smoothstep(60.0, 150.0, bd));
          marks += (rtNoiseAt(bq + 3.1, 14.0).g - 0.5) * 0.5;
          albedo *= 1.0 + uBrush * marks * 0.55;
        }
        #endif
        float sh = rtShadow(vPos, n);
        // the sky's light is what AO takes most of; a crevice still keeps a little of the sun and lamps
        float ndl = dot(n, uSunDir);
        float lit = smoothstep(-0.02, 0.08, ndl) * sh;
        float full = smoothstep(0.42, 0.52, ndl) * sh;
        float aoSky = mix(0.3, 1.0, ao);
        float aoKey = mix(0.55, 1.0, smoothstep(0.1, 0.6, ao));
        vec3 lamps = rtRoomLamps(vPos, n);
        vec3 col = albedo * (rtSkyLight(n, vPos) * aoSky + (uSunColor * (0.3 * lit + 0.1 * full) + lamps) * aoKey);
        vec3 v = normalize(cameraPosition - vPos);
        if (uSpec > 0.0) {
          // the sun's sheen, and for shiny things a glint of each lamp
          vec3 hv = normalize(v + uSunDir);
          col += uSunColor * uSpec * 0.6 * smoothstep(0.88, 0.97, dot(n, hv)) * step(0.0, ndl) * sh * aoKey;
          if (uSpec > 0.5 && uRoomMin.w > 0.5) {
            for (int i = 0; i < ${ROOM_LAMPS}; i++) {
              vec4 lp = uRoomLampP[i];
              if (lp.w <= 0.0) continue;
              vec3 L = lp.xyz - vPos;
              float d = length(L);
              if (d > lp.w * 1.5) continue;
              L /= d;
              float g = smoothstep(0.965, 0.993, dot(n, normalize(v + L)));
              col += uRoomLampC[i].rgb * g * (uSpec - 0.5) * 2.5 / (1.0 + d * d * 0.3) * aoKey;
            }
          }
        }
        col += rtHeadlight(albedo, n, vPos);
        col += uEmissive;
        col = rtFog(col, vPos, cameraPosition);
        float alpha = 1.0;
        #ifdef RT_INK
        // an id from the colour alone (never the AO): neighbouring things of different colours get a line
        alpha = 0.04 + 0.17 * fract(dot(floor(base * 23.0 + 0.5), vec3(0.1031, 0.1137, 0.0973)) * 7.0);
        #endif
        gl_FragColor = vec4(col, alpha);
      }`,
  });
}

/**
 * The workshop floor: an old concrete slab, painted rather than photographed — two greys drifting
 * warm and cool, saw-cut joints, the dark oil stains of years of cars standing in the same place, the
 * worn tracks out to the door, dust gathered along the walls (the baked AO says where), brushwork.
 * Lit as everything indoors is (rtCelAt).
 */
export function garageFloorMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...globals },
    vertexShader: VERTEX,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      varying vec4 vTintAO;
      float stain(vec2 w, vec2 c, vec2 r, float rag) {
        vec2 d = (w - c) / r;
        float e = length(d) + (rtNoiseAt(w * 1.7 + c, 1.3).r - 0.5) * rag;
        return 1.0 - smoothstep(0.55, 1.0, e);
      }
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vNormal);
        vec2 w = rtWorldXZ(vPos);
        float dist = length(vPos - cameraPosition);
        // two greys, drifting
        float slow = rtNoiseAt(w + 11.0, 9.0).r;
        vec3 albedo = mix(vec3(0.255, 0.25, 0.235), vec3(0.3, 0.3, 0.3), smoothstep(0.3, 0.7, slow));
        albedo *= mix(vec3(1.0), vec3(1.05, 1.0, 0.92), smoothstep(0.5, 0.75, rtNoiseAt(w * 0.8 + 3.0, 6.0).g));
        // brushwork in the plane of the floor
        float marks = (rtStrokeAt(w, 1.1) - 0.5) * (1.0 - smoothstep(10.0, 30.0, dist)) + (rtStrokeAt(w + 5.3, 3.4) - 0.5) * 0.8;
        albedo *= 1.0 + marks * 0.16;
        // saw-cut joints: a slab every 3.5 m along, 2.5 m across
        vec2 j = abs(fract((w + vec2(0.0, 1.25)) / vec2(3.5, 2.5)) - 0.5) * vec2(3.5, 2.5);
        float fw = max(fwidth(w.x), fwidth(w.y));
        float joint = 1.0 - smoothstep(0.004 + fw * 0.6, 0.012 + fw * 1.2, min(j.x, j.y));
        albedo *= 1.0 - 0.45 * joint * (1.0 - smoothstep(25.0, 50.0, dist));
        // oil where the cars stand (under an engine bay), by the drums, under the vice, under the lift
        float oil = stain(w, vec2(1.75, -0.25), vec2(0.95, 0.7), 0.6) * 0.75 + stain(w, vec2(-0.9, -0.05), vec2(0.55, 0.45), 0.7) * 0.4;
        oil += stain(w, vec2(5.3, -4.25), vec2(0.8, 0.55), 0.8) * 0.65 + stain(w, vec2(0.95, -4.0), vec2(0.35, 0.3), 0.6) * 0.5;
        oil += stain(w, vec2(-4.4, 3.2), vec2(0.9, 0.6), 0.7) * 0.45;
        oil = clamp(oil, 0.0, 1.0);
        albedo = mix(albedo, albedo * vec3(0.42, 0.42, 0.46), oil);
        // a damp patch round the sink
        float damp = stain(w, vec2(6.3, 4.1), vec2(0.8, 0.6), 0.9);
        albedo *= 1.0 - 0.28 * damp;
        // the tracks out to the door, polished a little darker by the tyres
        float tracks = exp(-pow((abs(w.y + 0.25) - 0.67) / 0.16, 2.0)) * smoothstep(-1.5, 2.0, w.x);
        albedo *= 1.0 - 0.1 * tracks * (0.6 + 0.4 * rtNoiseAt(w * vec2(0.2, 1.0), 4.0).b);
        // dust and grit along the walls and in under things (where the AO is), warm grey
        float ao = clamp(vTintAO.a, 0.0, 1.0);
        albedo = mix(albedo, vec3(0.34, 0.3, 0.25), (1.0 - smoothstep(0.55, 0.95, ao)) * 0.45);
        albedo *= mix(0.55, 1.0, ao);
        float sh = rtShadow(vPos, n);
        vec3 col = rtCelAt(albedo, n, sh, vPos);
        // a faint sheen where the sun falls on the worn tracks and the damp
        vec3 v = normalize(cameraPosition - vPos);
        col += uSunColor * (0.05 * tracks + 0.08 * damp) * pow(max(dot(reflect(-uSunDir, n), v), 0.0), 8.0) * sh;
        col += rtHeadlight(albedo, n, vPos);
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export class GarageLook {
  private readonly byKey = new Map<string, THREE.Material>();
  readonly glows: Partial<Record<GlowName, THREE.ShaderMaterial>> = {};

  /** the material for a GLB material name: a shading group, the floor, or a glass */
  get(name: string): THREE.Material {
    const base = name.replace(/\.\d+$/, '');
    let m = this.byKey.get(base);
    if (m) return m;
    const glass = GLASS[base];
    if (base === 'floor') m = garageFloorMaterial();
    else if (glass) m = glassMaterial(glass[0], glass[1]);
    else {
      const look = GROUPS[base] ?? GROUPS.prop;
      const mat = garageCelMaterial(look);
      if (GLOW_NAMES.includes(base)) this.glows[base as GlowName] = mat;
      m = mat;
    }
    m.name = `garage:${base}`;
    this.byKey.set(base, m);
    return m;
  }

  /** a glowing bit's light (× its own colour; black = off) */
  setGlow(name: GlowName, r: number, g: number, b: number): void {
    const m = this.glows[name];
    if (m) (m.uniforms.uEmissive.value as THREE.Color).setRGB(r, g, b);
  }

  dispose(): void {
    for (const m of this.byKey.values()) m.dispose();
    this.byKey.clear();
  }
}
