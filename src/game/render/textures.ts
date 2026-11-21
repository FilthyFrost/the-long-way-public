/**
 * Procedural textures shared by every painted material: a tiling smooth noise with four
 * different fields, and a sheet of brush marks (broad soft patches, short strokes, small dabs).
 */
import * as THREE from 'three';

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tiling value-noise fbm, four independent fields (RGBA), 0..1 around 0.5. */
export function noiseTexture(size = 256, seed = 7): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const fields: number[][] = [];
  for (let c = 0; c < 4; c++) {
    const rnd = mulberry(seed * 31 + c * 977);
    const f = new Array<number>(size * size).fill(0);
    let norm = 0;
    let amp = 0.55;
    for (let cells = 4; cells <= 64; cells *= 2) {
      const lat = new Float32Array(cells * cells);
      for (let i = 0; i < lat.length; i++) lat[i] = rnd();
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const px = (x / size) * cells;
          const py = (y / size) * cells;
          const ix = Math.floor(px);
          const iy = Math.floor(py);
          let fx = px - ix;
          let fy = py - iy;
          fx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
          fy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
          const x0 = ix % cells;
          const y0 = iy % cells;
          const x1 = (ix + 1) % cells;
          const y1 = (iy + 1) % cells;
          const a = lat[x0 + y0 * cells];
          const b = lat[x1 + y0 * cells];
          const cc = lat[x0 + y1 * cells];
          const d = lat[x1 + y1 * cells];
          f[x + y * size] += amp * (a + (b - a) * fx + (cc - a) * fy + (a - b - cc + d) * fx * fy);
        }
      }
      norm += amp;
      amp *= 0.5;
    }
    for (let i = 0; i < f.length; i++) f[i] /= norm;
    // stretch to use the full 0..1 range around 0.5
    let lo = 1;
    let hi = 0;
    for (const v of f) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    for (let i = 0; i < f.length; i++) f[i] = (f[i] - lo) / Math.max(1e-6, hi - lo);
    fields.push(f);
  }
  for (let i = 0; i < size * size; i++) for (let c = 0; c < 4; c++) data[i * 4 + c] = Math.round(fields[c][i] * 255);
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * Brushwork that repeats: red is tone (0.5 = none), lighter and darker marks at three sizes;
 * blue marks pebbles. Drawn into a canvas, every mark wrapped around the edges so it tiles.
 */
export function strokesTexture(size = 512): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const rnd = mulberry(8128);
  g.fillStyle = 'rgb(128,0,0)';
  g.fillRect(0, 0, size, size);
  const mark = (x: number, y: number, rx: number, ry: number, turn: number, style: string): void => {
    g.fillStyle = style;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const cx = x + ox;
        const cy = y + oy;
        const r = rx + ry;
        if (cx < -r || cx > size + r || cy < -r || cy > size + r) continue;
        g.beginPath();
        g.ellipse(cx, cy, rx, ry, turn, 0, Math.PI * 2);
        g.fill();
      }
    }
  };
  for (let i = 0; i < 64; i++) mark(rnd() * size, rnd() * size, 24 + rnd() * 46, 11 + rnd() * 20, rnd() * Math.PI, `rgba(${rnd() < 0.5 ? 84 : 174},0,0,0.5)`);
  for (let i = 0; i < 440; i++) {
    const tone = rnd() < 0.52 ? 38 + rnd() * 60 : 160 + rnd() * 82;
    mark(rnd() * size, rnd() * size, 6 + rnd() * 16, 2 + rnd() * 4, rnd() * Math.PI, `rgba(${Math.round(tone)},0,0,0.85)`);
  }
  for (let i = 0; i < 950; i++) {
    const tone = rnd() < 0.5 ? 30 + rnd() * 60 : 168 + rnd() * 86;
    mark(rnd() * size, rnd() * size, 2 + rnd() * 4, 1 + rnd() * 2, rnd() * Math.PI, `rgb(${Math.round(tone)},0,0)`);
  }
  g.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 10; k++) {
    const cx = rnd() * size;
    const cy = rnd() * size;
    const n = 2 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) mark(cx + (rnd() - 0.5) * 90, cy + (rnd() - 0.5) * 90, 4 + rnd() * 9, 3 + rnd() * 5, rnd() * Math.PI, 'rgb(0,0,255)');
  }
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** The same round dabs feed the close spray texture and its reduced atlas footprint. */
export function leafDabs(dab: (x: number, y: number, rx: number, ry: number, turn: number, red: number) => void): void {
  const rnd = mulberry(77);
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * 104;
    const r = (10 + 12 * rnd()) * (1.15 - 0.45 * d / 104);
    const turn = rnd() * Math.PI;
    const red = 130 + Math.floor(rnd() * 125);
    dab(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, r, r * (0.72 + 0.26 * rnd()), turn, red);
  }
}

/**
 * A spray of leaves as round brush dabs, white on black: red = how light each dab is painted,
 * green = coverage. Round, not pointed: after the paint finish a pointed leaf turns into a square.
 */
export function leafTexture(size = 256): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  const s = size / 256;
  leafDabs((x, y, rx, ry, turn, red) => {
    g.fillStyle = `rgb(${red},255,0)`;
    g.beginPath();
    g.ellipse(x * s, y * s, rx * s, ry * s, turn, 0, Math.PI * 2);
    g.fill();
  });
  const t = new THREE.CanvasTexture(canvas);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/**
 * Far woods as a painter dabs them in: four strips of tree masses (u: 4 variants side by side),
 * crowns as round dabs with a dark underside. Red = how lit (0 deep … 1 sunlit top), green = coverage.
 */
export function woodsTexture(width = 1024, height = 256): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, width, height);
  const rnd = mulberry(4242);
  const cell = width / 4;
  for (let v = 0; v < 4; v++) {
    const x0 = v * cell;
    // crowns from the back row to the front: each a dark disc, a mid disc a little higher, a lit cap on top
    const n = 7 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const cx = x0 + cell * (0.12 + 0.76 * rnd());
      const r = cell * (0.1 + 0.08 * rnd());
      const top = height * (0.12 + 0.3 * rnd());
      const cy = top + r;
      const body = (tone: number, dx: number, dy: number, rr: number): void => {
        g.fillStyle = `rgb(${Math.round(tone * 255)},255,0)`;
        g.beginPath();
        g.ellipse(cx + dx, cy + dy, rr, rr * 1.05, 0, 0, Math.PI * 2);
        g.fill();
      };
      // a crown in three tones, and below it more crowns of the row behind, down to the ground: no straight edges
      for (let k = 1; cy + k * r * 0.9 < height + r; k++) body(0.08 + 0.06 * rnd(), (rnd() - 0.5) * r * 0.8, k * r * 0.9, r * (0.95 + 0.2 * rnd()));
      body(0.12, 0, r * 0.25, r * 1.0);
      body(0.42, -r * 0.12, -r * 0.08, r * 0.78);
      body(0.75, -r * 0.2, -r * 0.32, r * 0.46);
      // dabs along the rim break the outline into leaves
      for (let k = 0; k < 9; k++) {
        const a = -Math.PI * (0.1 + 0.8 * rnd());
        const rr = r * (0.16 + 0.12 * rnd());
        body(a < -Math.PI / 2 ? 0.55 : 0.85, Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92, rr);
      }
    }
  }
  const t = new THREE.CanvasTexture(canvas);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/**
 * Cells (V2): a tiling Voronoi of n by n cells, each point's distance to its cell's edge (R: the gap between the nearest
 * and the next seed, in cells, times two) and two numbers that are its cell's own (G, B) — what the ground's clumps and
 * the rock's facets are drawn from (render/terrainMaterials.ts rtCells) with one fetch, and (A) its distance to its own
 * seed in cells times two (the clouds' rounded puffs, env/sky.ts). Seeds stay within the middle
 * of their cells, so the nearest is always among the eight about a point's own.
 */
export function cellsTexture(size = 1024, cells = 64, seed = 11): THREE.DataTexture {
  const rnd = mulberry(seed);
  const sx = new Float32Array(cells * cells);
  const sy = new Float32Array(cells * cells);
  const ra = new Uint8Array(cells * cells);
  const rb = new Uint8Array(cells * cells);
  for (let i = 0; i < cells * cells; i++) {
    sx[i] = 0.15 + 0.7 * rnd();
    sy[i] = 0.15 + 0.7 * rnd();
    ra[i] = Math.floor(rnd() * 256);
    rb[i] = Math.floor(rnd() * 256);
  }
  const data = new Uint8Array(size * size * 4);
  const per = size / cells;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / per;
      const py = (y + 0.5) / per;
      const ix = Math.floor(px);
      const iy = Math.floor(py);
      let d1 = 9;
      let d2 = 9;
      let id = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const cx = (((ix + i) % cells) + cells) % cells;
          const cy = (((iy + j) % cells) + cells) % cells;
          const k = cy * cells + cx;
          const dx = ix + i + sx[k] - px;
          const dy = iy + j + sy[k] - py;
          const d = dx * dx + dy * dy;
          if (d < d1) {
            d2 = d1;
            d1 = d;
            id = k;
          } else if (d < d2) d2 = d;
        }
      }
      const o = (y * size + x) * 4;
      data[o] = Math.min(255, Math.round((Math.sqrt(d2) - Math.sqrt(d1)) * 2 * 255));
      data[o + 1] = ra[id];
      data[o + 2] = rb[id];
      data[o + 3] = Math.min(255, Math.round(Math.sqrt(d1) * 2 * 255));
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

let shared: { noise: THREE.DataTexture; strokes: THREE.Texture; leaf: THREE.Texture; woods: THREE.Texture; cells: THREE.DataTexture } | null = null;

/** the shared textures, made on first use (outside a browser — headless tools — the canvas ones are blank) */
export function sharedTextures(): { noise: THREE.DataTexture; strokes: THREE.Texture; leaf: THREE.Texture; woods: THREE.Texture; cells: THREE.DataTexture } {
  if (!shared) {
    const canvas = typeof document !== 'undefined';
    const blank = (): THREE.Texture => new THREE.DataTexture(new Uint8Array([128, 255, 0, 255]), 1, 1);
    shared = { noise: noiseTexture(canvas ? 256 : 4), strokes: canvas ? strokesTexture() : blank(), leaf: canvas ? leafTexture() : blank(), woods: canvas ? woodsTexture() : blank(), cells: cellsTexture(canvas ? 1024 : 4, canvas ? 64 : 1) };
  }
  return shared;
}
