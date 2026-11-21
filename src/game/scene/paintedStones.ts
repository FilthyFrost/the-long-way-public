import * as THREE from 'three';
import { PlantBuilder, WHITE } from './vegetation';
import { rockForms } from '../../core/world/rockTables';
import { HABITS, chiselRock } from './chiselRock';

const mineral = 5;
/** (groundModels.ts PART_MINERAL_CHISELLED: not imported, groundModels imports this) */
const chiselled = 6;
const up = new THREE.Vector3(0, 1, 0);
const TAU = 2 * Math.PI;
type Vec = THREE.Vector3;
type Form = typeof rockForms[number];

/** A joint cuts across two adjoining planes; both ends belong to the same solid. */
function seam(b: PlantBuilder, a: Vec, c: Vec, d: Vec, width: number) {
  const side = d.clone().sub(c).normalize().multiplyScalar(width);
  const n = new THREE.Vector3().crossVectors(c.clone().sub(a),side).normalize();
  const lift = n.clone().multiplyScalar(0.002);
  const p = a.clone().add(lift), q = c.clone().add(lift);
  b.tri(p, q, q.clone().add(side), n, mineral, WHITE, 0.44, 0.52, 0.58);
}

function block(b: PlantBuilder, form: Form, seed: number, lod: number, x: number, z: number,
    width: number, height: number, depth: number, turn: number) {
  // (V3: a block of a boulder's, a granite's, a moraine's, a bedded rock's, a fin's or a limestone's is chiselled from a
  // lump, scene/chiselRock.ts — the prisms were crystals; the pebbles of a bar or a scree stay as they were)
  const habit = HABITS[form];
  if (habit && width >= 0.25) {
    // (eighty facets cut are enough for a jagged or a bedded block; a boulder's or a granite's round main block near has
    // twice as many. The far level's one subdivision too: twenty facets cut again read as a crystal)
    const detail = lod === 0 && width > 0.6 && (form === 'boulder' || form === 'granite') ? 2 : 1;
    chiselRock(b, habit, seed, detail, x, z, width, height, depth, turn, habit.facet ? mineral : chiselled, 0.96 + 0.08 * Math.sin(seed * 1.7));
    return;
  }
  // Small clasts need only a broken outline, one roof and a cool flank.
  // They share a padded instanced draw with other patches; a full jointed mesh for
  // every pebble would make the GPU fetch hundreds of invisible vertices per tuft.
  if (lod===2 || width<0.51) {
    const rounded = form === 'cobbles' || form === 'granite';
    const side = lod===2 ? 4 : rounded ? 7 : 5;
    const cap:Vec[]=[],foot:Vec[]=[];
    for(let j=0;j<side;j++){
      const a=turn+TAU*j/side+0.17*Math.sin(seed+j);
      const r=0.85+0.12*Math.cos(seed+2*j);
      const px=Math.cos(a)*width*r,pz=Math.sin(a)*depth*r;
      cap.push(new THREE.Vector3(x+px*0.77,height*(0.48+0.25*Math.sin(a+seed)),z+pz*0.77));
      foot.push(new THREE.Vector3(x+px,-0.25*height,z+pz));
    }
    const roof=new THREE.Vector3(x+0.14*width,height*(rounded ? 0.74 : 0.94),z-0.13*depth);
    for(let j=0;j<side;j++){
      const k=(j+1)%side;
      const n=cap[j].clone().sub(foot[j]).cross(foot[k].clone().sub(foot[j])).normalize();
      b.tri(foot[j],cap[j],foot[k],n,mineral,WHITE,0.63,0.85,0.67);
      b.tri(cap[j],cap[k],foot[k],n,mineral,WHITE,0.87,0.90,0.67);
      b.tri(cap[j],roof,cap[k],up,mineral,WHITE,0.98,1.13,1.00);
    }
    return;
  }
  const layered = form === 'fin' || form === 'strata';
  const n = lod === 2 ? 5 : 7;
  const phase = seed * 1.73;
  const ring: Vec[][] = [[], [], [], []];
  for (let j = 0; j < n; j++) {
    const a = TAU*j/n;
    const angle = a + 0.12*Math.sin(phase+j*3.7);
    const r = 0.92+0.14*Math.sin(phase*2+j*4.3);
    const u = r*Math.cos(angle), v = r*Math.sin(angle);
    const crest = 0.84+0.19*u+0.07*v+0.09*Math.sin(phase+j*3.2);
    // An embedded foot, a chipped shoulder, then the plane left by the last fracture.
    const shoulder = layered ? 0.58 : 0.48;
    const top = layered ? 0.72 : 0.56;
    for (const [k, radius, y, slide] of [[0,0.85,-0.38,0],[1,1.04,0.12,0],
        [2,0.95,shoulder+0.07*u,0.02],[3,top,crest,0.10]]) {
      const px = (u*radius+slide)*width, pz = v*radius*depth;
      ring[k].push(new THREE.Vector3(x+px*Math.cos(turn)+pz*Math.sin(turn), y*height, z+pz*Math.cos(turn)-px*Math.sin(turn)));
    }
  }
  const top = new THREE.Vector3(x+0.11*width, height*(0.96+0.05*Math.sin(phase)), z-0.04*depth);
  for (let j=0;j<n;j++) {
    const next=(j+1)%n;
    for (let k=1;k<=3;k++) {
      const a=ring[k-1][j], c=ring[k][j], d=ring[k-1][next], e=ring[k][next];
      const normal = c.clone().sub(a).cross(d.clone().sub(a)).normalize();
      const value = (k === 1 ? 0.71 : k === 2 ? 0.83 : 0.99) + 0.07*Math.sin(j*2+phase);
      b.tri(a,c,d,normal,mineral,WHITE,value);
      b.tri(c,e,d,normal,mineral,WHITE,value+0.025);
      if (lod===0 && k===3 && (j+seed)%3===0) seam(b,c,d,a,0.026*width);
      if (layered && k===2 && lod!==2) {
        const p=a.clone().lerp(c,0.67), q=d.clone().lerp(e,0.69);
        b.tri(p,q,p.clone().lerp(c,0.12),normal,mineral,WHITE,0.67);
      }
    }
    const a=ring[3][j], c=ring[3][next];
    b.tri(a,top,c,up,mineral,WHITE,1.08,1.12,1.08);
    if(lod===0 && j===seed%n) seam(b,a,top,c,0.019*width);
  }
}

const V = (x: number, y: number, z: number): Vec => new THREE.Vector3(x, y, z);

/** a quad a c d e (round its rim in either sense) as two triangles, a tone a corner, turned to face away from o */
function quad(b: PlantBuilder, o: Vec, a: Vec, c: Vec, d: Vec, e: Vec, ka: number, kc: number, kd: number, ke: number) {
  const n = new THREE.Vector3().crossVectors(c.clone().sub(a), e.clone().sub(a)).normalize();
  if (n.dot(a.clone().sub(o)) < 0) {
    n.negate();
    b.tri(a, e, d, n, mineral, WHITE, ka, ke, kd);
    b.tri(a, d, c, n, mineral, WHITE, ka, kd, kc);
    return;
  }
  b.tri(a, c, d, n, mineral, WHITE, ka, kc, kd);
  b.tri(a, d, e, n, mineral, WHITE, ka, kd, ke);
}

/**
 * One basalt column (V3): a hexagon of circumradius r about (cx, cz) from below the ground to its top about h, the top
 * a plane tilted a little (tilt along phi), its rim chamfered to catch the light (`rim`); a little irregular, as a
 * cooling joint is. Unit space: x and z the stone's radius, y its height.
 */
function hexColumn(b: PlantBuilder, cx: number, cz: number, r: number, h: number, tilt: number, phi: number, turn: number, seed: number, rim: boolean, tone: number) {
  const foot: Vec[] = [], shoulder: Vec[] = [], edge: Vec[] = [], below: Vec[] = [], above: Vec[] = [];
  // (a cross joint part way up a tall one, near: the drum above a little narrower)
  const joint = rim && h > 0.45 ? h * (0.38 + 0.3 * (0.5 + 0.5 * Math.sin(seed * 4.7))) : 0;
  const top = (x: number, z: number) => h + tilt * ((x - cx) * Math.cos(phi) + (z - cz) * Math.sin(phi));
  for (let k = 0; k < 6; k++) {
    const a = turn + (k * Math.PI) / 3 + 0.06 * Math.sin(seed * 3.1 + k * 1.7);
    const rr = r * (0.95 + 0.06 * Math.sin(seed * 2.3 + k * 2.9));
    const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
    const t = top(x, z);
    foot.push(V(x, -0.32, z));
    const nx = cx + Math.cos(a) * rr * (joint ? 0.955 : 1), nz = cz + Math.sin(a) * rr * (joint ? 0.955 : 1);
    if (joint) {
      below.push(V(x, joint, z));
      above.push(V(nx, joint, nz));
    }
    if (rim) {
      shoulder.push(V(nx, t - 0.035, nz));
      edge.push(V(cx + Math.cos(a) * rr * 0.78, t, cz + Math.sin(a) * rr * 0.78));
    } else edge.push(V(x, t, z));
  }
  const upper = rim ? shoulder : edge;
  const o = V(cx, h * 0.5, cz);
  const lit = (1.02 + 0.08 * Math.sin(seed * 5.3)) * tone;
  for (let k = 0; k < 6; k++) {
    const j = (k + 1) % 6;
    // (its sides darker toward the ground, each face a little its own)
    const face = 0.04 * Math.sin(seed + k * 2.2);
    const lo = (0.62 + face) * tone, hi = (0.88 + face) * tone;
    if (joint) {
      const m = (0.62 + 0.26 * (joint / h) + face) * tone;
      quad(b, o, foot[k], foot[j], below[j], below[k], lo, lo, m, m);
      quad(b, o, above[k], above[j], upper[j], upper[k], m + 0.07 * tone, m + 0.07 * tone, hi, hi);
    } else quad(b, o, foot[k], foot[j], upper[j], upper[k], lo, lo, hi, hi);
    if (rim) quad(b, o, shoulder[k], shoulder[j], edge[j], edge[k], (1.0 + face) * tone, (1.0 + face) * tone, lit, lit);
  }
  for (let k = 1; k < 5; k++) b.tri(edge[0], edge[k + 1], edge[k], up, mineral, WHITE, lit, lit, lit);
}

/** a drum of a column fallen and lying on the ground, along yaw: a hexagonal prism on its side, half sunk */
function hexDrum(b: PlantBuilder, cx: number, cz: number, r: number, len: number, yaw: number, seed: number) {
  const ax = Math.cos(yaw), az = Math.sin(yaw);
  const ends: Vec[][] = [[], []];
  for (let e = 0; e < 2; e++) {
    const s = (e - 0.5) * len;
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3 + 0.3 + 0.05 * Math.sin(seed + k);
      // (the cross-section stood up: across the axis and up; the stone's y is its height, so a drum's round is flat)
      const u = Math.cos(a) * r, v = Math.sin(a) * r * 0.55;
      ends[e].push(V(cx + ax * s - az * u, v + 0.02, cz + az * s + ax * u));
    }
  }
  const o = V(cx, 0.02, cz);
  for (let k = 0; k < 6; k++) {
    const j = (k + 1) % 6;
    const y = (ends[0][k].y + ends[0][j].y) * 0.5;
    const t = 0.72 + 0.32 * Math.min(1, Math.max(0, y / (r * 0.55)));
    quad(b, o, ends[0][k], ends[0][j], ends[1][j], ends[1][k], t, t, t, t);
  }
  for (const [e, flip] of [[0, true], [1, false]] as const) {
    const c = ends[e];
    for (let k = 1; k < 5; k++) {
      const n = new THREE.Vector3(ax * (flip ? -1 : 1), 0, az * (flip ? -1 : 1));
      if (flip) b.tri(c[0], c[k], c[k + 1], n, mineral, WHITE, 0.9);
      else b.tri(c[0], c[k + 1], c[k], n, mineral, WHITE, 0.9);
    }
  }
}

/** a hash of a lattice cell, 0 … 1 */
const cellRand = (q: number, s: number, v: number, k: number) => {
  const t = Math.sin(q * 127.1 + s * 311.7 + v * 74.7 + k * 19.19) * 43758.5453;
  return t - Math.floor(t);
};

/**
 * Basalt's columns (V3): a cluster of hexagonal columns on a lattice — the joints of a lava that cooled slowly — in
 * three habits: a dome (the tallest in the middle), a step (high to one side, a cliff's broken edge) and broken stumps
 * with a fallen drum or two. The near level chamfers each rim; the far keeps the inner columns only.
 */
function basaltColumns(b: PlantBuilder, lod: number, variant: number) {
  const R = lod === 2 ? 1 : 2;
  const r = 0.21;
  const turn = 0.7 + variant * 1.3;
  const step = r * Math.sqrt(3);
  const ux = Math.cos(turn + Math.PI / 6) * step, uz = Math.sin(turn + Math.PI / 6) * step;
  const vx = Math.cos(turn + Math.PI / 2) * step, vz = Math.sin(turn + Math.PI / 2) * step;
  const lean = variant * 2.1 + 0.4;
  for (let q = -R; q <= R; q++) for (let s = -R; s <= R; s++) {
    const ring = Math.max(Math.abs(q), Math.abs(s), Math.abs(q + s));
    if (ring > R) continue;
    const k1 = cellRand(q, s, variant, 1);
    if (ring > 0 && k1 > (ring === 1 ? 0.88 : 0.42)) continue;
    const cx = q * ux + s * vx, cz = q * uz + s * vz;
    const along = (cx * Math.cos(lean) + cz * Math.sin(lean)) / (2 * step);
    const k2 = cellRand(q, s, variant, 2) - 0.5;
    const h = variant === 0 ? 1 - 0.3 * ring + 0.34 * k2 : variant === 1 ? 0.6 + 0.36 * along + 0.3 * k2 : 0.22 + 0.36 * (k2 + 0.5);
    hexColumn(b, cx, cz, r * 0.965, Math.max(0.1, h), 0.04 + 0.12 * cellRand(q, s, variant, 3), cellRand(q, s, variant, 4) * TAU, turn, q * 7 + s * 13 + variant, lod === 0 && ring < 2, 0.86 + 0.24 * cellRand(q, s, variant, 5));
  }
  // (fallen drums at the foot, near: the stumps' two, a dome's or a step's one)
  if (lod === 0) for (let i = 0; i < (variant === 2 ? 2 : 1); i++) {
    const a = lean + Math.PI + (i - 0.5) * 1.1;
    hexDrum(b, Math.cos(a) * 0.78, Math.sin(a) * 0.78, r * 0.95, 0.34 + 0.12 * i, a + 1.3 + i, variant * 3 + i);
  }
}

export function paintedStone(b:PlantBuilder, form:Form, lod:number, variant:number) {
  if (form === 'columns') {
    basaltColumns(b, lod, variant);
    return;
  }
  const bar = form==='cobbles', scree=form==='scree';
  const scatter=bar || scree || form==='moraine';
  const stack=form==='karst';
  if (bar) {
    // Alluvial fines between rounded clasts, a shallow lens tapering to exposed ground.
    const center=new THREE.Vector3(0,0.08,0);
    const rim=(j:number)=>{
      const a=TAU*j/10;
      const r=0.97+0.10*Math.cos(3*a+variant);
      return new THREE.Vector3(r*Math.cos(a),-0.08,0.82*r*Math.sin(a));
    };
    // Blue is a material marker in the atlas; red tapers the fines into the underlying bank.
    const gravel=new THREE.Color(1,0.64,0.05);
    for(let j=0;j<10;j++) b.tri(rim(j),center,rim(j+1),up,mineral,gravel,0.02,1,0.02);
  }
  const count=bar ? [23,13,6][lod] : scree ? [10,6,3][lod] : stack ? [5,3,1][lod] : scatter ? 4 : [4,3,1][lod];
  for(let i=0;i<count;i++){
    const seed = 8 + variant*19 + i;
    const a=i*2.39996+0.53*variant;
    const reach=i===0 ? 0 : scatter || stack ? 0.86*Math.sqrt(i/count) : 0.72+0.08*Math.sin(seed);
    const radius = bar ? 0.11+0.13*(1-i/count) : scree ? 0.16+0.22*(1-i/count) :
      stack ? 0.48-0.14*i/count : i===0 ? 0.97 : 0.35-0.12*i/count;
    const height = bar || scree ? 0.44+0.56*(1-i/count) : i===0 ? 1 : stack ? 0.87-0.54*i/count : 0.23+0.09*Math.sin(seed);
    const thin = form==='fin' ? 0.33 : form==='strata' ? 0.50 : 0.8+0.11*Math.sin(seed);
    const angle = form==='fin' || form==='strata' ? 0.08*Math.sin(seed) : a*0.6;
    block(b,form,seed,lod,Math.cos(a)*reach,Math.sin(a)*reach,radius,height,radius*thin,angle);
  }
}
