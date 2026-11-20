/**
 * The toolkit's plants painted (docs/V3/nodes/P2-flora.md): the crowns' material (render/crownMaterial.ts) with
 * the toolkit's foliage atlas (atlas.ts) in place of the world's one spray, and its coverage's blur read at the
 * atlas's own size; and the same all black, for the silhouette test (can a kind be told by its outline alone?).
 * Browser-only (the atlas is painted on a canvas).
 */
import * as THREE from 'three';
import { crownMaterial } from '../../render/crownMaterial';
import { FLORA_ATLAS_PX, floraAtlas } from './atlas';

let material: THREE.ShaderMaterial | null = null;
let silhouette: THREE.ShaderMaterial | null = null;

/** the crowns' material reading the toolkit's atlas */
export function floraMaterial(): THREE.ShaderMaterial {
  if (material) return material;
  const m = crownMaterial();
  m.uniforms.tLeaf = { value: floraAtlas() };
  // (the leaf cover's blur is reckoned in texels of a 256 px picture: the atlas is bigger)
  const was = m.fragmentShader;
  m.fragmentShader = was.replace('dFdx(uv * 256.0)', `dFdx(uv * ${FLORA_ATLAS_PX.toFixed(1)})`).replace('dFdy(uv * 256.0)', `dFdy(uv * ${FLORA_ATLAS_PX.toFixed(1)})`);
  if (m.fragmentShader === was) throw new Error('flora: the leaf cover reads otherwise now (render/materials.ts rtLeafCover)');
  brighten(m);
  material = m;
  return m;
}

/**
 * A bright plant (aTree.z + 2: a cherry in blossom, grass, flowers) keeps its tones light: its shade a soft one,
 * as a painter shades a blossom cloud or a sunlit tussock, not the deep blue-green of a crown's inside.
 */
function brighten(m: THREE.ShaderMaterial): void {
  const swap = (shader: 'vertexShader' | 'fragmentShader', a: string, b: string, all = false): void => {
    if (!m[shader].includes(a)) throw new Error(`flora: the crowns material reads otherwise now (${a.slice(0, 40)})`);
    m[shader] = all ? m[shader].split(a).join(b) : m[shader].replace(a, b);
  };
  swap('vertexShader', 'varying float vBark;', 'varying float vBark;\n      varying float vBright;');
  swap('fragmentShader', 'varying float vBark;', 'varying float vBark;\n      varying float vBright;');
  swap('vertexShader', 'vBark = aTree.z;', 'vBark = mod(aTree.z, 2.0);\n        vBright = step(1.5, aTree.z);');
  swap('fragmentShader', 'albedo = crownTone(p, tone);', 'albedo = crownTone(p, mix(tone, 0.5 + 0.5 * tone, vBright));');
  swap('fragmentShader', 'albedo = crownTone(p, min(tone, 0.7));', 'albedo = crownTone(p, mix(min(tone, 0.7), 0.42 + 0.4 * tone, vBright));');
  swap('fragmentShader', 'albedo = vPart > 3.5 ? rtTintTone(vTint2, tone) : crownTone(p, tone);', 'float bt = mix(tone, 0.5 + 0.5 * tone, vBright);\n          albedo = vPart > 3.5 ? rtTintTone(vTint2, bt) : crownTone(p, bt);');
}

/** every mark black: the silhouette test */
export function floraSilhouette(): THREE.ShaderMaterial {
  if (silhouette) return silhouette;
  const m = crownMaterial();
  m.uniforms.tLeaf = floraMaterial().uniforms.tLeaf;
  m.vertexShader = floraMaterial().vertexShader;
  m.fragmentShader = floraMaterial().fragmentShader;
  const end = 'gl_FragColor = vec4(col, alpha);';
  if (!m.fragmentShader.includes(end)) throw new Error('flora: the crowns material ends otherwise now');
  m.fragmentShader = m.fragmentShader.replace(end, 'gl_FragColor = vec4(vec3(0.012), alpha);');
  silhouette = m;
  return m;
}

// (the plants' shadow caster: shadowCards.ts, DOM-free for the crowns' growth worker)
export { shadowCaster } from './shadowCards';
