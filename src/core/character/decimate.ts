// Fewer triangles where they are not needed (docs/V3/plan/character-pv.md §3).
//
// Garland and Heckbert's quadric error: each vertex carries the sum of the squared distances to the planes of the
// triangles round it; collapsing an edge puts the two ends at the point that keeps that sum smallest, and the
// cheapest collapses go first. Run, as Sp4cerat's well-known simplifier runs it, in sweeps with a rising threshold
// instead of a strict queue: each sweep collapses every edge under the threshold whose collapse flips no triangle.
// Written for this game from the published method. A weight per vertex makes some places dearer to simplify (a
// fingertip, the face, round a joint) so the triangles go where the eye and the bending need them.

export interface DecimateOptions {
  /** triangles to end with (about) */
  target: number;
  /** per vertex: how much dearer to collapse (1 = plain) */
  weight?: ArrayLike<number>;
  /** no edge may grow longer than this (m); keeps limbs bendable */
  maxEdge?: number;
  /** how fast the threshold rises from sweep to sweep (7 is the usual) */
  aggressiveness?: number;
  /** sweeps at most */
  maxIterations?: number;
}

export interface Decimated {
  positions: Float64Array;
  indices: Uint32Array;
  /** for each kept vertex, which input vertex it was */
  source: Int32Array;
}

export function decimate(positions: Float64Array, indices: Uint32Array, o: DecimateOptions): Decimated {
  const nV = positions.length / 3;
  let nT = indices.length / 3;
  const P = new Float64Array(positions);
  const Q = new Float64Array(nV * 10);
  const tv = new Int32Array(indices);
  const terr = new Float64Array(nT * 4);
  const tn = new Float64Array(nT * 3);
  const tdel = new Uint8Array(nT);
  const tdirty = new Uint8Array(nT);
  const tstart = new Int32Array(nV);
  const tcount = new Int32Array(nV);
  const border = new Uint8Array(nV);
  const weight = o.weight;
  const maxEdge2 = o.maxEdge ? o.maxEdge * o.maxEdge : Infinity;
  const aggr = o.aggressiveness ?? 7;
  const maxIt = o.maxIterations ?? 120;

  let refT = new Int32Array(nT * 3 + 16);
  let refV = new Int8Array(nT * 3 + 16);
  let refLen = 0;
  const pushRef = (t: number, v: number) => {
    if (refLen >= refT.length) {
      const nt = new Int32Array(refT.length * 2);
      nt.set(refT);
      refT = nt;
      const nv = new Int8Array(refV.length * 2);
      nv.set(refV);
      refV = nv;
    }
    refT[refLen] = t;
    refV[refLen] = v;
    refLen++;
  };

  const vertexError = (q: number, x: number, y: number, z: number): number =>
    Q[q] * x * x + 2 * Q[q + 1] * x * y + 2 * Q[q + 2] * x * z + 2 * Q[q + 3] * x + Q[q + 4] * y * y + 2 * Q[q + 5] * y * z + 2 * Q[q + 6] * y + Q[q + 7] * z * z + 2 * Q[q + 8] * z + Q[q + 9];

  // the summed quadric of two vertices lives in a scratch slot
  const S = new Float64Array(10);
  const errorOf = (S2: Float64Array, x: number, y: number, z: number): number =>
    S2[0] * x * x + 2 * S2[1] * x * y + 2 * S2[2] * x * z + 2 * S2[3] * x + S2[4] * y * y + 2 * S2[5] * y * z + 2 * S2[6] * y + S2[7] * z * z + 2 * S2[8] * z + S2[9];
  const det3 = (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number): number =>
    a * e * i + c * d * h + b * f * g - c * e * g - a * f * h - b * d * i;
  const out = [0, 0, 0];
  /** the cost of collapsing v1 into v2 and where the vertex goes (in out) */
  const collapseError = (v1: number, v2: number): number => {
    for (let k = 0; k < 10; k++) S[k] = Q[v1 * 10 + k] + Q[v2 * 10 + k];
    const bord = border[v1] & border[v2];
    const det = det3(S[0], S[1], S[2], S[1], S[4], S[5], S[2], S[5], S[7]);
    if (det !== 0 && !bord) {
      out[0] = (-1 / det) * det3(S[1], S[2], S[3], S[4], S[5], S[6], S[5], S[7], S[8]);
      out[1] = (1 / det) * det3(S[0], S[2], S[3], S[1], S[5], S[6], S[2], S[7], S[8]);
      out[2] = (-1 / det) * det3(S[0], S[1], S[3], S[1], S[4], S[6], S[2], S[5], S[8]);
      // the optimum can run off far for a near-flat neighbourhood: keep it near the edge
      const mx = (P[v1 * 3] + P[v2 * 3]) / 2, my = (P[v1 * 3 + 1] + P[v2 * 3 + 1]) / 2, mz = (P[v1 * 3 + 2] + P[v2 * 3 + 2]) / 2;
      const ex = P[v1 * 3] - P[v2 * 3], ey = P[v1 * 3 + 1] - P[v2 * 3 + 1], ez = P[v1 * 3 + 2] - P[v2 * 3 + 2];
      const len2 = ex * ex + ey * ey + ez * ez;
      const ox = out[0] - mx, oy = out[1] - my, oz = out[2] - mz;
      if (ox * ox + oy * oy + oz * oz <= len2) return errorOf(S, out[0], out[1], out[2]);
    }
    const x1 = P[v1 * 3], y1 = P[v1 * 3 + 1], z1 = P[v1 * 3 + 2];
    const x2 = P[v2 * 3], y2 = P[v2 * 3 + 1], z2 = P[v2 * 3 + 2];
    const x3 = (x1 + x2) / 2, y3 = (y1 + y2) / 2, z3 = (z1 + z2) / 2;
    const e1 = errorOf(S, x1, y1, z1), e2 = errorOf(S, x2, y2, z2), e3 = errorOf(S, x3, y3, z3);
    const m = Math.min(e1, e2, e3);
    if (m === e1) { out[0] = x1; out[1] = y1; out[2] = z1; }
    else if (m === e2) { out[0] = x2; out[1] = y2; out[2] = z2; }
    else { out[0] = x3; out[1] = y3; out[2] = z3; }
    return m;
  };

  const faceNormal = (t: number) => {
    const a = tv[t * 3] * 3, b = tv[t * 3 + 1] * 3, c = tv[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    const area = l / 2;
    if (l > 0) { nx /= l; ny /= l; nz /= l; }
    tn[t * 3] = nx; tn[t * 3 + 1] = ny; tn[t * 3 + 2] = nz;
    return area;
  };

  const rebuildRefs = () => {
    tstart.fill(0);
    tcount.fill(0);
    for (let t = 0; t < nT; t++) for (let j = 0; j < 3; j++) tcount[tv[t * 3 + j]]++;
    let s = 0;
    for (let v = 0; v < nV; v++) { tstart[v] = s; s += tcount[v]; tcount[v] = 0; }
    if (refT.length < s) { refT = new Int32Array(s * 2); refV = new Int8Array(s * 2); }
    for (let t = 0; t < nT; t++) {
      for (let j = 0; j < 3; j++) {
        const v = tv[t * 3 + j];
        refT[tstart[v] + tcount[v]] = t;
        refV[tstart[v] + tcount[v]] = j;
        tcount[v]++;
      }
    }
    refLen = s;
  };

  const compact = () => {
    let dst = 0;
    for (let t = 0; t < nT; t++) {
      if (tdel[t]) continue;
      if (dst !== t) {
        tv[dst * 3] = tv[t * 3]; tv[dst * 3 + 1] = tv[t * 3 + 1]; tv[dst * 3 + 2] = tv[t * 3 + 2];
        for (let k = 0; k < 4; k++) terr[dst * 4 + k] = terr[t * 4 + k];
        tn[dst * 3] = tn[t * 3]; tn[dst * 3 + 1] = tn[t * 3 + 1]; tn[dst * 3 + 2] = tn[t * 3 + 2];
      }
      tdel[dst] = 0;
      tdirty[dst] = 0;
      dst++;
    }
    nT = dst;
  };

  // --- start: quadrics, borders, edge errors
  rebuildRefs();
  {
    // a border vertex is on an edge only one triangle uses
    const vcount: number[] = [], vids: number[] = [];
    for (let v = 0; v < nV; v++) {
      vcount.length = 0; vids.length = 0;
      for (let k = 0; k < tcount[v]; k++) {
        const t = refT[tstart[v] + k];
        for (let j = 0; j < 3; j++) {
          const id = tv[t * 3 + j];
          let ofs = 0;
          while (ofs < vcount.length && vids[ofs] !== id) ofs++;
          if (ofs === vcount.length) { vcount.push(1); vids.push(id); }
          else vcount[ofs]++;
        }
      }
      for (let j = 0; j < vcount.length; j++) if (vcount[j] === 1) border[vids[j]] = 1;
    }
  }
  for (let t = 0; t < nT; t++) {
    const area = faceNormal(t);
    const nx = tn[t * 3], ny = tn[t * 3 + 1], nz = tn[t * 3 + 2];
    const a = tv[t * 3];
    const d = -(nx * P[a * 3] + ny * P[a * 3 + 1] + nz * P[a * 3 + 2]);
    let w = Math.max(area, 1e-12);
    if (weight) w *= (weight[tv[t * 3]] + weight[tv[t * 3 + 1]] + weight[tv[t * 3 + 2]]) / 3;
    const q = [nx * nx, nx * ny, nx * nz, nx * d, ny * ny, ny * nz, ny * d, nz * nz, nz * d, d * d];
    for (let j = 0; j < 3; j++) {
      const v = tv[t * 3 + j] * 10;
      for (let k = 0; k < 10; k++) Q[v + k] += q[k] * w;
    }
  }
  const edgeErrors = (t: number) => {
    for (let j = 0; j < 3; j++) terr[t * 4 + j] = collapseError(tv[t * 3 + j], tv[t * 3 + ((j + 1) % 3)]);
    terr[t * 4 + 3] = Math.min(terr[t * 4], terr[t * 4 + 1], terr[t * 4 + 2]);
  };
  for (let t = 0; t < nT; t++) edgeErrors(t);

  // the scale of the errors: plane quadrics are area-weighted, so a threshold must grow with the mesh's scale
  let meanArea = 0;
  for (let t = 0; t < nT; t++) meanArea += faceNormal(t);
  meanArea /= Math.max(1, nT);

  let deleted0 = new Uint8Array(64), deleted1 = new Uint8Array(64);
  const flipped = (px: number, py: number, pz: number, i0: number, i1: number, del: Uint8Array): boolean => {
    for (let k = 0; k < tcount[i0]; k++) {
      const t = refT[tstart[i0] + k];
      if (tdel[t]) continue;
      const s = refV[tstart[i0] + k];
      const id1 = tv[t * 3 + ((s + 1) % 3)], id2 = tv[t * 3 + ((s + 2) % 3)];
      if (id1 === i1 || id2 === i1) { del[k] = 1; continue; }
      let d1x = P[id1 * 3] - px, d1y = P[id1 * 3 + 1] - py, d1z = P[id1 * 3 + 2] - pz;
      let l = Math.hypot(d1x, d1y, d1z) || 1;
      if (l * l > maxEdge2) return true;
      d1x /= l; d1y /= l; d1z /= l;
      let d2x = P[id2 * 3] - px, d2y = P[id2 * 3 + 1] - py, d2z = P[id2 * 3 + 2] - pz;
      l = Math.hypot(d2x, d2y, d2z) || 1;
      if (l * l > maxEdge2) return true;
      d2x /= l; d2y /= l; d2z /= l;
      if (Math.abs(d1x * d2x + d1y * d2y + d1z * d2z) > 0.999) return true;
      let nx = d1y * d2z - d1z * d2y, ny = d1z * d2x - d1x * d2z, nz = d1x * d2y - d1y * d2x;
      l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      del[k] = 0;
      if (nx * tn[t * 3] + ny * tn[t * 3 + 1] + nz * tn[t * 3 + 2] < 0.25) return true;
    }
    return false;
  };
  let deletedTris = 0;
  const updateTriangles = (i0: number, v: number, del: Uint8Array) => {
    for (let k = 0; k < tcount[v]; k++) {
      const t = refT[tstart[v] + k];
      const s = refV[tstart[v] + k];
      if (tdel[t]) continue;
      if (del[k]) { tdel[t] = 1; deletedTris++; continue; }
      tv[t * 3 + s] = i0;
      tdirty[t] = 1;
      faceNormal(t);
      edgeErrors(t);
      pushRef(t, s);
    }
  };

  const startCount = nT;
  for (let it = 0; it < maxIt; it++) {
    if (startCount - deletedTris <= o.target) break;
    if (it % 5 === 0) {
      compact();
      rebuildRefs();
      deletedTris = startCount - nT;
    }
    tdirty.fill(0, 0, nT);
    const threshold = 1e-9 * Math.pow(it + 3, aggr) * meanArea;
    for (let t = 0; t < nT; t++) {
      if (terr[t * 4 + 3] > threshold || tdel[t] || tdirty[t]) continue;
      for (let j = 0; j < 3; j++) {
        if (terr[t * 4 + j] >= threshold) continue;
        const i0 = tv[t * 3 + j], i1 = tv[t * 3 + ((j + 1) % 3)];
        if (border[i0] !== border[i1]) continue;
        collapseError(i0, i1);
        const px = out[0], py = out[1], pz = out[2];
        if (deleted0.length < tcount[i0]) deleted0 = new Uint8Array(tcount[i0] * 2);
        if (deleted1.length < tcount[i1]) deleted1 = new Uint8Array(tcount[i1] * 2);
        deleted0.fill(0, 0, tcount[i0]);
        deleted1.fill(0, 0, tcount[i1]);
        if (flipped(px, py, pz, i0, i1, deleted0)) continue;
        if (flipped(px, py, pz, i1, i0, deleted1)) continue;
        P[i0 * 3] = px; P[i0 * 3 + 1] = py; P[i0 * 3 + 2] = pz;
        for (let k = 0; k < 10; k++) Q[i0 * 10 + k] += Q[i1 * 10 + k];
        const start = refLen;
        updateTriangles(i0, i0, deleted0);
        updateTriangles(i0, i1, deleted1);
        const count = refLen - start;
        if (count <= tcount[i0]) {
          // fits where i0's list was
          for (let k = 0; k < count; k++) { refT[tstart[i0] + k] = refT[start + k]; refV[tstart[i0] + k] = refV[start + k]; }
          refLen = start;
        } else tstart[i0] = start;
        tcount[i0] = count;
        break;
      }
      if (startCount - deletedTris <= o.target) break;
    }
  }
  compact();

  // keep only the vertices still used, in first-use order
  const remap = new Int32Array(nV).fill(-1);
  const source: number[] = [];
  const pos: number[] = [];
  const idx = new Uint32Array(nT * 3);
  for (let t = 0; t < nT; t++) {
    for (let j = 0; j < 3; j++) {
      const v = tv[t * 3 + j];
      if (remap[v] < 0) {
        remap[v] = source.length;
        source.push(v);
        pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      }
      idx[t * 3 + j] = remap[v];
    }
  }
  void vertexError;
  return { positions: new Float64Array(pos), indices: idx, source: new Int32Array(source) };
}
