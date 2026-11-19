/** Forms without a branching cloud of leaves: solids of revolution and folded, tapered blades.
 * A blade has its own outline, so it takes the crown's palette without the broadleaf cutout. */
import { Vector3 } from 'three';
import { mulberry } from '../vegetation';
import { Out, type CrownModel } from './grow';

export type Special = 'coconut_palm' | 'fan_palm' | 'tree_fern' | 'bamboo' | 'joshua_tree' | 'saguaro';
const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
const radial = (a: number, r: number, y: number) => v(Math.cos(a)*r, y, Math.sin(a)*r);
const tau = Math.PI*2;

export function growSpecial(form: Special, seed: number, level: number): CrownModel {
  const out = new Out();
  const rand = mulberry(seed);
  const offset = rand()*tau;
  const h = (0.9 + rand()*0.2) * ({ coconut_palm: 11, fan_palm: 8, tree_fern: 4, bamboo: 11, joshua_tree: 5, saguaro: 6 }[form]);
  const detail = [1, 0.32, 0.18][level];
  const sides = [12, 7, 5][level];
  function vertex(p: Vector3, n: Vector3, part: number, tone: number, u = 0.5) {
    return out.vertex(p.x,p.y,p.z,n.x,n.y,n.z,u,p.y,tone,0.5,0.8,p.y,part);
  }
  // Horizontal rings follow ascending axes, including the rounded elbow of a cactus arm.
  function tube(axis: (t: number)=>Vector3, radius: (t: number)=>number, rows: number, part = 0, ribs = false) {
    const count = ribs ? sides*2 : sides;
    const first = out.part.length;
    for (let j=0; j<=rows; j++) {
      const t = j/rows, p = axis(t);
      for (let i=0; i<count; i++) {
        const n = radial(tau*i/count,1,0);
        const r = radius(t) * (ribs && i%2 ? 0.88 : 1);
        vertex(p.clone().addScaledVector(n,r),n,part,i%2 ? 0.35 : 0.7,i/count);
        if (!j) continue;
        const a = first+(j-1)*count+i, b = first+(j-1)*count+(i+1)%count;
        out.idx.push(a,a+count,b,b,a+count,b+count);
      }
    }
  }
  function blade(root: Vector3, end: Vector3, width: number, lift: number, tone: number) {
    const dir = end.clone().sub(root);
    const side = v(-dir.z,0,dir.x).normalize().multiplyScalar(width);
    const mid = root.clone().lerp(end,0.48);
    mid.y += lift;
    const n = v(dir.x,Math.max(0.3,dir.length()),dir.z).normalize();
    const first = vertex(root,n,3,tone);
    vertex(mid.clone().add(side),n,3,tone-0.15);
    mid.y += width*0.45;
    vertex(mid,n,3,tone+0.12);
    mid.y -= width*0.45;
    vertex(mid.clone().sub(side),n,3,tone);
    vertex(end,n,3,tone);
    out.idx.push(first,first+1,first+2,first,first+2,first+3,first+1,first+4,first+2,first+2,first+4,first+3);
  }

  if (form === 'saguaro') {
    const stem = (t: number) => v(0,h*t,0);
    const taper = (t: number) => Math.sqrt(Math.max(0.0001, 1-Math.pow(t,16)));
    tube(stem,t=>0.42*taper(t),[24,12,7][level],3,true);
    const arms = 2 + Math.floor(rand()*3);
    for (let i=0; i<arms; i++) {
      const a = offset + tau*i/arms;
      const start = h*(0.25 + rand()*0.25), rise = h*(0.23+rand()*0.18), reach = 0.85+rand()*0.32;
      tube(t=>radial(a, reach*Math.sin(Math.min(1,t*1.9)*Math.PI/2), start+rise*t*t),
        t=>0.25*taper(t),[18,8,5][level],3,true);
    }
  } else if (form === 'joshua_tree') {
    const tip = radial(offset,0.28,h*0.65);
    tube(t=>tip.clone().multiplyScalar(t),t=>0.36-0.16*t,[12,6,3][level]);
    for (let i=0; i<6; i++) {
      const a = offset+i*2.39996;
      const start = tip.clone().multiplyScalar(0.46+i*0.09);
      const end = start.clone().add(radial(a,0.9+rand()*0.85,1.5+rand()*1.4));
      tube(t=>start.clone().lerp(end,t).add(radial(a,Math.sin(t*Math.PI)*0.38,0)),t=>0.19-0.09*t,[9,4,2][level]);
      const n = Math.round(36*detail);
      for (let j=0; j<n; j++) {
        const up = 1-(j+0.5)*1.65/n;
        blade(end,end.clone().add(radial(j*2.4+a,Math.sqrt(1-up*up)*0.82,up*0.86)),0.10/detail**0.4,0.03,0.65+up*0.15);
      }
    }
  } else if (form === 'bamboo') {
    for (let i=0; i<5; i++) {
      const a = offset + i*2.39996, height = h*(0.76+rand()*0.24);
      const axis = (t: number) => radial(a,0.28+i*0.08+1.2*t*t,height*t);
      tube(axis,t=>0.105-0.065*t,[18,12,10][level],3);
      for (let j=1; j<11; j++) {
        const t = j/11;
        if (level===0) tube(u=>axis(t+u*0.007),u=>(0.115-0.065*t)*(1+0.12*Math.sin(Math.PI*u)),2,3);
        if (j<4) continue;
        const dir = a+j*2.4;
        const from = axis(t), to = from.clone().add(radial(dir,1.8*(1-t*0.6),0.7));
        blade(from,to,0.025,0.18,0.38);
        const pairs = Math.round(6*detail);
        for (let k=0; k<pairs; k++) {
          const at = from.clone().lerp(to,(k+1)/pairs);
          for (const sign of [-1,1]) blade(at,at.clone().add(radial(dir+sign*0.75,0.65,-0.26)),0.09/detail**0.4,0.08,0.55);
        }
      }
    }
  } else {
    const coconut = form==='coconut_palm', fern = form==='tree_fern';
    const axis = (t: number) => radial(offset, (coconut ? 2.1 : 0.24)*t*t,h*t);
    tube(axis,t=>(fern ? 0.31 : 0.27)*(1.25-0.35*t),[18,8,5][level]);
    const at = axis(1);
    for (let i=0; i<(fern ? 13 : 15); i++) {
      const a = offset + i*2.39996;
      const len = (fern ? 2.6 : coconut ? 4.7 : 3.1)*(0.83+0.25*rand());
      const rise = len*(0.58+0.5*rand()), fall = len*((coconut ? 0.86 : 0.48)+0.65*(i%4)/3);
      const frond = (t: number) => at.clone().add(radial(a,len*t,rise*t-fall*t*t));
      const steps = [5,2,1][level];
      for (let j=0; j<steps; j++) blade(frond(j/steps),frond((j+1)/steps),0.044,0,0.5);
      if (form==='fan_palm') {
        const hub = frond(0.55), rays = [14,5,3][level];
        for (let j=0; j<=rays; j++) {
          const angle = (j/rays-0.5)*2.15;
          // The basal half is a folded web; only the outer fingers divide.
          if (j < rays) {
            const next = angle + 2.15/rays;
            const fold = (theta: number) => hub.clone().add(radial(a+theta,len*0.46,0.47+Math.cos(theta)*0.43));
            const n = radial(a+angle,0.4,0.92);
            const first = vertex(hub,n,3,0.48);
            vertex(fold(angle),n,3,0.61);
            vertex(fold(next),n,3,0.42);
            out.idx.push(first,first+1,first+2);
          }
          blade(hub,hub.clone().add(radial(a+angle,len*0.59,0.4+Math.cos(angle)*0.7)),len*0.77/rays,0.2,0.5+j%2*0.17);
        }
      } else {
        const pairs = Math.round((fern ? 16 : 14)*detail);
        for (let j=0; j<pairs; j++) {
          const t = (j+0.6)/pairs, root = frond(t);
          const span = len*(0.10+0.22*Math.sin(Math.PI*t)**0.6);
          for (const sign of [-1,1]) {
            const end = root.clone().add(radial(a+sign*(fern ? 1.14 : 1.25),span,-span*(fern ? 0.20 : 0.58)));
            blade(root,end,len*(fern ? 0.029 : 0.024)/detail,span*0.17,0.42+0.25*t);
          }
        }
      }
    }
  }
  return {geometry:out.geometry(),height:out.top,radius:out.reach,crownY:h*0.73,triangles:out.idx.length/3,vertices:out.part.length};
}
