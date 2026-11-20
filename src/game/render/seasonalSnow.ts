// The inputs are four climate thresholds (DJF, MAM, JJA, SON) in metres above sea level.
// Mix coverage, not elevations: a neighbour with no seasonal snow must not lift the other snowline.
export const SNOW_FIELD = /* glsl */ `
  uniform vec4 uSnowLines[4];
  float rtSeasonSnow(float altitude, vec4 bw) {
    vec4 line = vec4(uSnowLines[0].x, uSnowLines[1].x, uSnowLines[2].x, uSnowLines[3].x);
    return dot(bw, smoothstep(line - 100.0, line + 100.0, vec4(altitude)));
  }
`;
export const PACKED_SNOW = /* glsl */ `
  float rtRootSnow(float pair) {
    return mod(floor(fract(pair) * 65536.0 + 0.5), 256.0) / 255.0;
  }
`;
