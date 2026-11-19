// The inputs are four climate thresholds (DJF, MAM, JJA, SON) in metres above sea level.
// Mix coverage, not elevations: a neighbour with no seasonal snow must not lift the other snowline.
export const SNOW_FIELD = /* glsl */ `
  uniform vec4 uSeason;
  uniform vec4 uSnowLines[4];
  float rtSeasonSnow(float altitude, vec4 bw) {
    vec4 h = vec4(altitude);
    if (bw.x > 0.9999) return dot(uSeason, smoothstep(uSnowLines[0] - 100.0, uSnowLines[0] + 100.0, h));
    if (bw.y > 0.9999) return dot(uSeason, smoothstep(uSnowLines[1] - 100.0, uSnowLines[1] + 100.0, h));
    if (bw.z > 0.9999) return dot(uSeason, smoothstep(uSnowLines[2] - 100.0, uSnowLines[2] + 100.0, h));
    if (bw.w > 0.9999) return dot(uSeason, smoothstep(uSnowLines[3] - 100.0, uSnowLines[3] + 100.0, h));
    return dot(uSeason,
      smoothstep(uSnowLines[0] - 100.0, uSnowLines[0] + 100.0, h) * bw.x +
      smoothstep(uSnowLines[1] - 100.0, uSnowLines[1] + 100.0, h) * bw.y +
      smoothstep(uSnowLines[2] - 100.0, uSnowLines[2] + 100.0, h) * bw.z +
      smoothstep(uSnowLines[3] - 100.0, uSnowLines[3] + 100.0, h) * bw.w);
  }
`;
export const PACKED_SNOW = /* glsl */ `
  uniform vec4 uSeason;
  float rtRootSnow(float pair) {
    float pack = floor(fract(pair) * 262144.0 + 0.5);
    return dot(uSeason, mod(floor(pack / vec4(1.0, 16.0, 256.0, 4096.0)), 16.0) / 15.0);
  }
`;
