import * as THREE from 'three';
import { plants, blossoms } from '../../core/world/groundTables';
import { rockForms } from '../../core/world/rockTables';
import { PlantBuilder, WHITE } from './vegetation';

const V = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
const up = V(0,1,0);
const golden = 2.399963;
export const PART_MINERAL = 5;
const partLeaf=1, partPetal=2, partMineral=PART_MINERAL;
const brown=new THREE.Color(0x785b48);
const polar=(a:number,r:number,y:number)=>V(Math.cos(a)*r,y,Math.sin(a)*r);

// A folded brushstroke. The two sides carry different values so that a fern pinna,
// a blade and a petal all keep their central fold in the afternoon light.
function stroke(b:PlantBuilder, root:THREE.Vector3, tip:THREE.Vector3, width:number, arch:number, part=partLeaf, paint=WHITE) {
  const axis=tip.clone().sub(root);
  const side=V(-axis.z,0,axis.x);
  if (side.lengthSq()<0.000001) side.set(1,0,0);
  side.normalize().multiplyScalar(width);
  const mid=root.clone().lerp(tip,0.55);
  mid.y+=arch;
  const left=mid.clone().add(side), right=mid.clone().sub(side);
  const ridge=mid.clone(); ridge.y+=width*0.32;
  b.tri(root,left,ridge,up,part,paint,0.65,0.86,1.05);
  b.tri(left,tip,ridge,up,part,paint,0.86,1.08,1.05);
  b.tri(root,ridge,right,up,part,paint,0.65,0.93,0.75);
  b.tri(right,ridge,tip,up,part,paint,0.75,0.93,1.08);
}

function lump(b:PlantBuilder,c:THREE.Vector3,r:number,h:number,z:number,part:number,detail:number,angle=0) {
  const g=detail===2 ? new THREE.OctahedronGeometry(1) : new THREE.IcosahedronGeometry(1);
  const m=new THREE.Matrix4().compose(c,new THREE.Quaternion().setFromAxisAngle(up,angle),V(r,h,z));
  b.solid(g,m,WHITE,part,(p)=>0.88+0.1*Math.sin(p.y*4+p.x*1.8));
  g.dispose();
}

function stone(b:PlantBuilder, form:string,lod:number) {
  const bank=form==='cobbles', loose=bank || form==='scree', columns=form==='columns', fins=form==='fin', karst=form==='karst';
  const count=loose ? [9,5,3][lod] : columns || karst ? [5,3,2][lod] : form==='moraine' ? [4,3,2][lod] : 1;
  for(let i=0;i<count;i++){
    const a=i*golden, offset=i===0 ? 0 : 0.25+0.42*i/count;
    const c=polar(a,offset,0);
    const r=(loose ? 0.29 : count===1 ? 1 : 0.59)*(1-0.4*i/count);
    const h=(1-0.52*i/count)*(loose ? 0.9 : 1);
    if (bank || form==='granite' || form==='moraine' || form==='boulder' || form==='scree'){
      c.y=h*0.24;
      lump(b,c,r,h*0.75,r*(bank ? 0.7 : 0.86),partMineral,lod,a+0.32);
      continue;
    }
    const strata=form==='strata';
    const sides=columns ? 6 : karst ? 7 : 5;
    const levels=lod===0 ? [0,0.34,0.41,0.7,0.76,1] : [0,0.68,1];
    const ring=(t:number,j:number)=>{
      const angle=j*2*Math.PI/sides+(columns ? 0 : 0.17);
      const ledge=columns ? 1-0.06*t : (1-0.32*t)*(t===0.34 || t===0.7 ? 0.87 : 1);
      return V(c.x+Math.cos(angle)*r*ledge+t*0.07, -0.18+t*(h+0.18)+0.04*Math.sin(j*3.2)*t,
        c.z+Math.sin(angle)*r*ledge*(fins || strata ? 0.38 : 0.9));
    };
    for(let j=0;j<sides;j++){
      for(let k=1;k<levels.length;k++){
        const p=ring(levels[k-1],j), q=ring(levels[k-1],j+1), t=ring(levels[k],j), u=ring(levels[k],j+1);
        const n=t.clone().sub(p).cross(q.clone().sub(p)).normalize();
        const value=columns ? 0.95 : 0.77+0.2*(k%2);
        b.tri(p,t,q,n,partMineral,WHITE,value); b.tri(t,u,q,n,partMineral,WHITE,value);
      }
      b.tri(ring(1,j),c.clone().add(V(0,h+0.05,0)),ring(1,j+1),up,partMineral,WHITE,1.07);
    }
  }
}

function fronds(b:PlantBuilder,lod:number) {
  const stems=[7,5,3][lod],pairs=[6,3,1][lod];
  for(let j=0;j<stems;j++){
    const a=j*golden,r=0.75+0.25*Math.cos(j*2);
    const at=(t:number)=>polar(a,r*t,Math.sin(t*2.05)*(0.8+0.13*Math.sin(j)));
    stroke(b,V(),at(1),0.016,0.16);
    for(let k=1;k<=pairs;k++){
      const t=k/(pairs+1),origin=at(t),len=0.25*Math.sin(Math.PI*t)**0.65;
      for(const side of [-1,1]) stroke(b,origin,at(Math.min(1,t+0.16)).add(polar(a+side*1.26,len,-0.035)),0.031+0.014*lod,0.02);
    }
  }
}

function tuft(b:PlantBuilder,form:string,lod:number){
  const rice=form==='rice', n=[13,8,4][lod], stools=rice ? [6,4,2][lod] : 1;
  for(let s=0;s<stools;s++){
    const foot=rice ? V((s%3-1)*0.60,0,(Math.floor(s/3)-0.5)*0.8) : V();
    for(let j=0;j<n;j++){
      const a=j*golden+s, droop=form==='tussock' ? 0.38 : 0.16;
      const t=foot.clone().add(polar(a,(rice ? 0.22 : 0.85)*(0.65+0.32*Math.cos(j)),0.59+0.24*Math.sin(j)));
      stroke(b,foot,t,form==='sedge' ? 0.045 : 0.028, droop);
      if(j%4===0 && form!=='tussock'){
        const stalk=foot.clone().add(polar(a,0.14,1));
        stroke(b,foot,stalk,0.015,0.02);
        stroke(b,stalk,stalk.clone().add(polar(a,0.12,rice ? -0.14 : 0.09)),0.026,0.02,partPetal);
      }
    }
  }
}

function shrub(b:PlantBuilder,form:string,lod:number){
  const sparse=form==='creosote'||form==='thorn',n=[8,5,3][lod];
  const layer=form==='broad' || form==='maritime', spread=form==='dwarf' ? 0.86 : 0.68;
  for(let j=0;j<n;j++){
    const a=j*golden, root=polar(a,0.10,0), t=polar(a,spread*(0.5+0.5*j/n),0.40+0.4*(1-j/n));
    stroke(b,root,t,0.018,0.05,0,brown);
    for(let k=0;k<(sparse?3:2);k++){
      const tip=t.clone().add(polar(a+(k-1)*1.4,0.26,0.15-0.07*k));
      stroke(b,t,tip,0.012,0,0,brown);
      lump(b,tip,sparse?0.11:0.29,layer?0.11:sparse?0.12:0.2,sparse?0.075:0.23,partLeaf,lod,a);
      if(lod===0) stroke(b,tip,tip.clone().add(polar(a+0.45,0.21,0.07)),form==='sage'?0.035:0.065,0.03);
    }
  }
}

function flowers(b:PlantBuilder, form:string,lod:number){
  const spike=form==='spike'||form==='tube', n=[5,3,2][lod];
  for(let j=0;j<n;j++){
    const a=j*golden,foot=polar(a,0.55*j/n,0),tip=foot.clone().add(polar(a,0.12,0.68+0.25*Math.cos(j)));
    stroke(b,foot,tip,0.02,0.025);
    stroke(b,foot,foot.clone().add(polar(a+1,0.28,0.34)),0.11,0.03);
    if(spike || form==='cluster'){
      for(let k=0;k<(lod===0?7:3);k++){
        const c=tip.clone().add(polar(k*golden,spike?0.066:0.14,spike?-0.044*k:-0.032*(k%3)));
        lump(b,c,spike?0.075:0.12,0.075,0.08,partPetal,2);
      }
    } else {
      const petals=form==='cup'?4:form==='woodflower'?3:form==='daisy'?8:5;
      for(let k=0;k<petals;k++) {
        const ang=a+2*Math.PI*k/petals;
        stroke(b,tip,tip.clone().add(polar(ang,0.18,form==='cup'?0.13:0.035)),form==='daisy'?0.044:0.083,0.032,partPetal);
      }
      lump(b,tip,0.048,0.034,0.048,0,2);
    }
  }
}

function mat(b:PlantBuilder,form:string,lod:number){
  const n=[16,8,3][lod];
  for(let j=0;j<n;j++){
    const a=j*golden,c=polar(a,0.78*Math.sqrt(j/n),0.13+0.08*Math.cos(j));
    if(form==='needles'||form==='litter'||form==='clover'){
      stroke(b,c,c.clone().add(polar(a+1.2,0.38,0.35)),form==='needles'?0.016:0.12,0.24,partLeaf);
    } else lump(b,c,0.32,form==='cushion'?0.75:0.42,0.28,partLeaf,lod,a);
  }
}

export function groundModels(): Record<string,THREE.BufferGeometry> {
  const result:Record<string,THREE.BufferGeometry>={};
  const b=new PlantBuilder();
  const flora=new Set([...plants.values(),...blossoms.values()].map(g=>g.form));
  for (const form of [...flora,...rockForms]) for(let lod=0;lod<3;lod++){
    if(!flora.has(form)) stone(b,form,lod);
    else if(form==='fern') fronds(b,lod);
    else if(['rice','sedge','grass','tussock','broom'].includes(form)) tuft(b,form,lod);
    else if(['cup','star','cluster','woodflower','spike','tube','daisy'].includes(form)) flowers(b,form,lod);
    else if(['crust','moss','lichen','cushion','clover','litter','needles'].includes(form)) mat(b,form,lod);
    else shrub(b,form,lod);
    result['ground_'+form+lod]=b.build();
  }
  return result;
}
