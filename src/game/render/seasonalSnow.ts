// The inputs are four climate thresholds (DJF, MAM, JJA, SON) in metres above sea level.
// Mix coverage, not elevations: a neighbour with no seasonal snow must not lift the other snowline.
export const SNOW_FIELD = /* glsl */ `
  uniform vec4 uSeason;
  uniform vec4 uSnowLines[4];
  float rtSeasonSnow(float altitude, vec4 bw) {
    vec4 line = vec4(dot(uSeason, uSnowLines[0]), dot(uSeason, uSnowLines[1]),
                     dot(uSeason, uSnowLines[2]), dot(uSeason, uSnowLines[3]));
    return dot(bw, smoothstep(line - 100.0, line + 100.0, vec4(altitude)));
  }
`;
export const PACKED_SNOW = /* glsl */ `
  uniform vec4 uSeason;
  float rtRootSnow(float pair) {
    float pack = floor(fract(pair) * 262144.0 + 0.5);
    return dot(uSeason, mod(floor(pack / vec4(1.0, 16.0, 256.0, 4096.0)), 16.0) / 15.0);
  }
`;
