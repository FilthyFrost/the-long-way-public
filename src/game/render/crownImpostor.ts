/** Shader additions for the atlas variant of crownMaterial. Rejoin the regular
 * material before lighting, so palette, snow, shadows, fog and brush size stay shared. */
export const IMPOSTOR_VERTEX = /* glsl */ `
#ifdef CROWN_ATLAS
  uniform vec3 uCard; // radius, bottom, height
  varying vec4 vAtlasFrame; // scaled model X axis (xz), scale of Y, view index
  varying vec3 vDepthAxis;
  void projectCard(mat4 m, inout vec4 w) {
    vec2 towards = normalize(cameraPosition.xz - m[3].xz + vec2(1e-7, 0.0));
    vec2 right = vec2(towards.y, -towards.x);
    float across = length(m[0].xz);
    vec2 local = vec2(dot(towards, m[0].xz), dot(towards, m[2].xz));
    vAtlasFrame = vec4(m[0].xz, length(m[1].xyz), atan(local.x, local.y) * (16.0 / 6.2831853));
    vDepthAxis = vec3(towards.x, 0.0, towards.y) * across * uCard.x;
    w = vec4(m[3].xyz, 1.0);
    w.xz += right * ((uv.x * 2.0 - 1.0) * uCard.x * across);
    w.y += (uv.y * uCard.z + uCard.y) * vAtlasFrame.z;
  }
#endif
`;

export const IMPOSTOR_FRAGMENT = /* glsl */ `
#ifdef CROWN_ATLAS
  uniform sampler2D tNormalAtlas, tPaintAtlas;
  varying vec4 vAtlasFrame;
  varying vec3 vDepthAxis;
  vec2 cell(float k) {
    k = mod(k, 16.0);
    return vec2(mod(k, 4.0), floor(k * 0.25));
  }
  uniform float uAtlasRows;
  void readCard(vec2 uv, bool bare, inout vec3 pos, out vec3 normal, out vec4 crown, out float part) {
    float k = floor(vAtlasFrame.w), t = fract(vAtlasFrame.w);
    vec2 a = (cell(k) + uv) * 0.25, b = (cell(k + 1.0) + uv) * 0.25;
    float offset = bare ? uAtlasRows - 1.0 : 0.0;
    a.y = (a.y + offset) / uAtlasRows;
    b.y = (b.y + offset) / uAtlasRows;
    vec4 hit = mix(texture2D(tNormalAtlas, a), texture2D(tNormalAtlas, b), t);
    if (hit.a < 0.42) discard;
    vec4 paint = mix(texture2D(tPaintAtlas, a), texture2D(tPaintAtlas, b), t) / hit.a;
    vec3 n = hit.xyz / hit.a * 2.0 - 1.0;
    vec2 axis = vAtlasFrame.xy;
    normal = normalize(vec3(axis.x * n.x - axis.y * n.z, n.y * vAtlasFrame.z, axis.y * n.x + axis.x * n.z));
    crown = vec4(paint.a, 0.0, paint.g, 0.0);
    // Categorical channels must not interpolate between bark, berries and flowers.
    vec2 pick = t < 0.5 ? a : b;
    ivec2 pixel = ivec2(pick * vec2(textureSize(tPaintAtlas, 0)));
    part = floor(texelFetch(tPaintAtlas, pixel, 0).b * (255.0 / 32.0) + 0.5);
    if (texelFetch(tNormalAtlas, pixel, 0).a < 0.5) part = floor(paint.b * (255.0 / 32.0) + 0.5);
    pos += vDepthAxis * (2.0 * paint.r - 1.0);
  }
#endif
`;
