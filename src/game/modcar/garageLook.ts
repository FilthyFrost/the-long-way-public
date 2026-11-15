/**
 * The look of the starting garage (docs/MODCAR.md §9, specs/art/STYLE.md): what each material name
 * in its GLB (tools/blender/garage/_kit.py MATS) is drawn with.
 *
 * The building is background: painted like the houses by the road (brushwork in the plane of each
 * face, no ink lines). What stands in it — machines, tools, drums, lamps — is drawn like the
 * vehicles: cel tones and the warm dark ink line round it. Vertex colours carry the baked ambient
 * occlusion (× a per-board tint on the building). Colours are sRGB hex, as a colour picker shows them.
 */
import * as THREE from 'three';
import { glassMaterial, surfaceMaterial } from '../render/materials';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, GLSL_VERTEX_MAIN, GLSL_VERTEX_PARS, globals } from '../render/shaderlib';

interface Look {
  color: number;
  spec?: number;
  /** brushwork (the building) */
  brush?: number;
  /** inked like a prop (default: props yes, building no) */
  ink?: boolean;
  emissive?: number;
  double?: boolean;
  /** glass: opacity */
  glass?: number;
}

/** the building: painted, no ink */
const BUILDING: Record<string, Look> = {
  floor: { color: 0x9c978d, brush: 0.55 },
  plinth: { color: 0xa9a59b, brush: 0.7 },
  timber: { color: 0x74503a, brush: 0.45 },
  boards: { color: 0xa47a52, brush: 0.6 },
  siding: { color: 0x9b3d2e, brush: 0.75 },
  g_trim: { color: 0xe8dec6, brush: 0.4 },
  tin_out: { color: 0x6a6d70, brush: 0.55, spec: 0.25, double: true },
  tin_in: { color: 0xb9bcbc, brush: 0.5, double: true },
  plaster: { color: 0xe2d8c0, brush: 0.7 },
  apron: { color: 0xa6a298, brush: 0.7 },
  skylight: { color: 0xeef0dc, glass: 0.55 },
  win_glass: { color: 0xc4d8dc, glass: 0.14 },
};

/** what stands in it: inked cel (the vehicles' names keep the vehicles' colours) */
const PROPS: Record<string, Look> = {
  steel: { color: 0x7a7f86, spec: 0.35 },
  chrome: { color: 0xe4e8ec, spec: 0.9 },
  alu: { color: 0xb4b8bc, spec: 0.45 },
  rubber: { color: 0x2a2a2e, spec: 0.05 },
  trim: { color: 0x2a2b2e, spec: 0.15 },
  wood: { color: 0xb08250, spec: 0.08 },
  wood_dark: { color: 0x6a4630, spec: 0.06 },
  rust: { color: 0x8a4a26, spec: 0.05 },
  fabric: { color: 0x7a5a44 },
  leather: { color: 0x5a3424, spec: 0.2 },
  ceramic: { color: 0xf3f2ec, spec: 0.7 },
  emit: { color: 0xfff0d0, emissive: 0xfff0d0 },
  bulb: { color: 0xfff1d6, emissive: 0x000000 },
  led: { color: 0x6a4a20, emissive: 0x000000 },
  dial: { color: 0x8a7a5a, emissive: 0x000000 },
  p_red: { color: 0xb93a2d, spec: 0.3 },
  p_green: { color: 0x4d7a5c, spec: 0.3 },
  p_blue: { color: 0x41678a, spec: 0.3 },
  p_yellow: { color: 0xe0b03c, spec: 0.3 },
  p_cream: { color: 0xe9dfc6, spec: 0.3 },
  p_teal: { color: 0x3e8e87, spec: 0.3 },
  p_orange: { color: 0xd8742e, spec: 0.3 },
  p_black: { color: 0x2a2a2e, spec: 0.15 },
  enamel: { color: 0xf3efe4, spec: 0.5, double: true },
  brass: { color: 0xc8a050, spec: 0.7 },
  cardboard: { color: 0xb88c5c },
  paper: { color: 0xefe9da },
  canvas: { color: 0xab9d7c, double: true },
  rope: { color: 0xc4a474 },
  chalk: { color: 0x2e3c36 },
  leaf: { color: 0x5c8e3a, double: true },
  leaf_dark: { color: 0x2f5c32, double: true },
  pot: { color: 0xbc6640 },
  soil: { color: 0x3c2c20 },
  water: { color: 0x4a6a70, spec: 0.8 },
  pegboard: { color: 0xbc9a6c },
  glass: { color: 0xbfd6dc, glass: 0.22 },
  // white paint wearing per-object tints in its vertex colours (cans, labels, posters): many colours, one draw
  tinted: { color: 0xf4f1ea, spec: 0.35 },
  tinted_matte: { color: 0xf4f1ea, spec: 0.0 },
  galv: { color: 0xb2b7b8, spec: 0.45 },
  cloth: { color: 0xc8bea8, double: true },
};

/** the glowing bits that are switched (lamps, the charger's lamp, the radio's dial) */
export type GlowName = 'bulb' | 'led' | 'dial';

/**
 * The workshop floor: an old concrete slab, painted rather than photographed — two greys drifting
 * warm and cool, saw-cut joints, the dark oil stains of years of cars standing in the same place, the
 * worn tracks out to the door, dust gathered along the walls (the baked AO says where), brushwork.
 * Lit as everything indoors is (rtCelAt).
 */
export function garageFloorMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    uniforms: { ...globals },
    vertexShader: /* glsl */ `
      ${GLSL_VERTEX_PARS}
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec3 transformed = position;
        vec3 objNormal = normal;
        ${GLSL_VERTEX_MAIN}
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      varying vec3 vColor;
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
        // oil where the cars stand (under an engine bay), by the drums, under the vice
        float oil = stain(w, vec2(1.75, 0.0), vec2(0.95, 0.7), 0.6) * 0.75 + stain(w, vec2(-0.9, 0.2), vec2(0.55, 0.45), 0.7) * 0.4;
        oil += stain(w, vec2(5.3, -4.25), vec2(0.8, 0.55), 0.8) * 0.65 + stain(w, vec2(0.95, -4.0), vec2(0.35, 0.3), 0.6) * 0.5;
        oil += stain(w, vec2(-5.8, 4.0), vec2(0.7, 0.5), 0.7) * 0.5;
        oil = clamp(oil, 0.0, 1.0);
        albedo = mix(albedo, albedo * vec3(0.42, 0.42, 0.46), oil);
        // the tracks out to the door, polished a little darker by the tyres
        float tracks = exp(-pow((abs(w.y) - 0.67) / 0.16, 2.0)) * smoothstep(-1.5, 2.0, w.x);
        albedo *= 1.0 - 0.1 * tracks * (0.6 + 0.4 * rtNoiseAt(w * vec2(0.2, 1.0), 4.0).b);
        // dust and grit along the walls and in under things (where the AO is), warm grey
        float ao = clamp(dot(vColor, vec3(0.333)), 0.0, 1.0);
        albedo = mix(albedo, vec3(0.34, 0.3, 0.25), (1.0 - smoothstep(0.55, 0.95, ao)) * 0.45);
        albedo *= mix(0.55, 1.0, ao);
        float sh = rtShadow(vPos, n);
        vec3 col = rtCelAt(albedo, n, sh, vPos);
        // a faint sheen where the sun falls on the worn tracks
        vec3 v = normalize(cameraPosition - vPos);
        col += uSunColor * 0.05 * tracks * pow(max(dot(reflect(-uSunDir, n), v), 0.0), 8.0) * sh;
        col += rtHeadlight(albedo, n, vPos);
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export class GarageLook {
  private readonly byKey = new Map<string, THREE.Material>();
  readonly glows: Partial<Record<GlowName, THREE.ShaderMaterial>> = {};

  /** the material for a GLB material name (vertexColors: the mesh has baked AO) */
  get(name: string, vertexColors: boolean): THREE.Material {
    const base = name.replace(/\.\d+$/, '');
    const key = `${base}|${vertexColors ? 1 : 0}`;
    let m = this.byKey.get(key);
    if (m) return m;
    const b = BUILDING[base];
    const p = PROPS[base];
    const look = b ?? p ?? { color: 0x8a8a8a };
    if (base === 'floor') m = garageFloorMaterial();
    else if (look.glass !== undefined) m = glassMaterial(look.color, look.glass);
    else {
      const mat = surfaceMaterial({
        color: look.color,
        spec: look.spec ?? (b ? 0 : 0.2),
        brush: look.brush,
        ink: look.ink ?? !b,
        inkBase: true,
        vertexColors,
        emissive: look.emissive,
        side: look.double ? THREE.DoubleSide : THREE.FrontSide,
      });
      if (base === 'bulb' || base === 'led' || base === 'dial') this.glows[base] = mat;
      m = mat;
    }
    m.name = `garage:${base}`;
    this.byKey.set(key, m);
    return m;
  }

  /** a glowing bit's light (linear colour × strength; black = off) */
  setGlow(name: GlowName, r: number, g: number, b: number): void {
    const m = this.glows[name];
    if (m) (m.uniforms.uEmissive.value as THREE.Color).setRGB(r, g, b);
  }

  dispose(): void {
    for (const m of this.byKey.values()) m.dispose();
    this.byKey.clear();
  }
}
