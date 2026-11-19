import * as THREE from 'three';
import { PlantBuilder, WHITE } from './vegetation';
import { rockForms } from '../../core/world/rockTables';

const mineral = 5;
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
  const joint = form === 'columns';
  const layered = form === 'fin' || form === 'strata';
  const n = joint ? 6 : lod === 2 ? 5 : 7;
  const phase = seed * 1.73;
  const ring: Vec[][] = [[], [], [], []];
  for (let j = 0; j < n; j++) {
    const a = TAU*j/n;
    const angle = a + (joint ? 0 : 0.12*Math.sin(phase+j*3.7));
    const r = joint ? 1 : 0.92+0.14*Math.sin(phase*2+j*4.3);
    const u = r*Math.cos(angle), v = r*Math.sin(angle);
    const crest = 0.84+0.19*u+0.07*v+0.09*Math.sin(phase+j*3.2);
    // An embedded foot, a chipped shoulder, then the plane left by the last fracture.
    const shoulder = joint ? 0.85 : layered ? 0.58 : 0.48;
    const top = joint ? 0.90 : layered ? 0.72 : 0.56;
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

export function paintedStone(b:PlantBuilder, form:Form, lod:number, variant:number) {
  const bar = form==='cobbles', scree=form==='scree';
  const scatter=bar || scree || form==='moraine';
  const stack=form==='columns' || form==='karst';
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
  const count=bar ? [23,13,6][lod] : scree ? [12,7,4][lod] : stack ? [5,4,2][lod] : scatter ? 4 : [4,3,1][lod];
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
