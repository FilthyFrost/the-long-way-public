import * as T from 'three';
import { CELL_COUNT, GROUP_LIMIT, type Animal } from '../../../../core/v3/life/rules';

type V = [number, number, number];
const pos: number[] = [], rgb: number[] = [], wing: number[] = [];
const paint = new T.Color();
function face(a: V, b: V, c: V, color: number, hinged = 0, shade = 1): void {
  paint.setHex(color).multiplyScalar(shade);
  for (const v of [a,b,c]) { pos.push(...v); rgb.push(paint.r,paint.g,paint.b); wing.push(hinged); }
}
// Sectioned volumes keep the warm belly and cooler back as separate paint shapes.
function oval(x:number,y:number,z:number,w:number,h:number,l:number,top:number,belly:number):void {
  const ring = (i:number,j:number):V => {
    const t=i*Math.PI/4, u=j*Math.PI/4;
    return [x+w*Math.sin(t)*Math.cos(u),y+h*Math.sin(t)*Math.sin(u),z+l*Math.cos(t)];
  };
  for(let i=0;i<4;i++) for(let j=0;j<8;j++) {
    const a=ring(i,j), b=ring(i+1,j), c=ring(i+1,j+1), d=ring(i,j+1);
    const col=j<4?top:belly, shade=j===1||j===2?1:.86;
    if(i<3) face(a,b,c,col,0,shade);
    if(i>0) face(a,c,d,col,0,shade);
  }
}
function sculpt(a: Animal): T.BufferGeometry {
  pos.length=rgb.length=wing.length=0;
  const f=a.form, b=a.back, p=a.breast, d=a.tips;
  const insect=['bee','dragonfly','firefly','butterfly','moth'].includes(f);
  if(insect) {
    const thin=f==='dragonfly', bee=f==='bee';
    oval(0,0,0,thin?.022:bee?.14:.045,thin?.025:bee?.13:.05,thin?.40:.24,b,p);
    oval(0,.02,.18,bee?.12:.05,bee?.11:.05,.08,p,b);
    if(bee) oval(0,0,-.09,.135,.123,.055,p,p);
    if(f==='firefly') {
      oval(0,0,-.21,.10,.08,.11,d,d);
      face([-1,-1,0],[1,-1,0],[1,1,0],d,2);
      face([-1,-1,0],[1,1,0],[-1,1,0],d,2);
    }
    for(const s of [-1,1]) {
      const root:V=[s*.025,.02,.04], fore:V=[s*.49,.035,thin?.11:.33], edge:V=[s*.43,.03,thin?.04:.04];
      const hind:V=[s*(thin?.44:.31),.025,thin?-.12:-.25], mid:V=[s*.30,.03,.08];
      face(root,fore,mid,thin||bee?d:b,1); face(mid,fore,edge,d,1);
      face(root,mid,edge,thin?d:b,1);
      face(root,[s*.33,.025,thin?-.06:-.03],hind,thin||bee?d:p,1);
      if(f==='butterfly') {
        for (let i=0;i<3;i++) {
          const x=.37+.028*i,z=.11+.062*i;
          face([s*x,.039,z],[s*(x+.016),.039,z+.011],[s*(x+.012),.039,z-.009],0xffe4ba,1);
          face(root,[s*(x-.05),.039,z],[s*(x-.042),.039,z+.008],d,1);
        }
      }
      if(f==='butterfly') face([s*.07,.03,-.06],hind,[s*.20,.03,-.27],b,1);
    }
  } else {
    const big=f==='raptor'||f==='pelican', water=f==='egret'||f==='swan';
    const swift=f==='swift', compact=f==='song'||f==='crow';
    const longBill=f==='pelican'||f==='egret'||a.name==='翠鸟';
    oval(0,.015,0,compact?.096:.077,.082,.205,b,p);
    const neck=water?.18:0;
    if(water) {
      oval(0,.088,.12,.041,.13,.050,p,p);
      oval(0,.18,.12,.034,.063,.050,p,p);
    }
    oval(0,.093+neck,.147,.071,.070,.079,big||water?p:b,p);
    const bill:V=[0,.077+neck,longBill?.39:.269];
    face([-.03,.085+neck,.197],[.03,.085+neck,.197],bill,f==='swan'?0x393637:water?0xc39b57:0x554b43);
    face([-.03,.085+neck,.197],[0,.054+neck,.20],bill,0x79644b);
    face([.03,.085+neck,.197],[0,.054+neck,.20],bill,0x79644b);
    for(const s of [-1,1]) {
      oval(s*.061,.103+neck,.177,.011,.011,.012,0x242a32,0x242a32);
      const tail:V=[s*(swift?.065:.08),.015,swift?-.36:compact?-.34:-.26];
      face([0,.035,-.12],[s*.04,.02,-.12],tail,d);
      face([0,.035,-.12],tail,[0,.022,swift?-.23:-.30],b);
      const shoulder:V=[s*.043,.048,.070], wrist:V=[s*.27,.074,swift?.08:.11];
      const inner:V=[s*.25,.045,big?-.12:-.067], hip:V=[s*.055,.033,-.14];
      face(shoulder,wrist,inner,b,1); face(shoulder,inner,hip,p,1);
      const tip:V=[s*.51,.042,swift?-.22:big?.013:-.10];
      if(big) {
        const band:V=[s*.34,.060,.08];
        face(wrist,band,[s*.30,.054,-.10],a.form==='raptor'?0xb5a48a:b,1);
        for(let k=0;k<4;k++) {
          const u=.18+k*.047;
          face([s*u,.060,.035],[s*(u+.018),.055,-.14],[s*(u+.048),.055,-.132],b,1,.76+k*.055);
        }
      }
      face(wrist,tip,inner,d,1);
      if(big||f==='crow') for(let k=0;k<4;k++) {
        face(inner,[s*(.49-.024*k),.04,-.018-.038*k],[s*(.455-.022*k),.04,-.019-.032*k],d,1);
      }
      if(water||compact) {
        const foot:V=[s*.036,water&&f!=='swan'?-.26:-.08,-.018];
        face([s*.032,-.028,0],[s*.048,-.03,-.005],foot,0x514b44);
        face(foot,[foot[0],foot[1]+.012,foot[2]],[foot[0],foot[1],.022],0x615548);
      }
    }
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  g.setAttribute('color',new T.Float32BufferAttribute(rgb,3));
  g.setAttribute('hinge',new T.Float32BufferAttribute(wing,1));
  return g;
}

export class PaintedAnimals {
  readonly root=new T.Group();
  readonly batches=new Map<Animal,T.InstancedMesh>();
  private readonly time={value:0};
  private readonly light={value:1};
  private readonly materials:T.ShaderMaterial[]=[];
  prepare(a:Animal):void {
    if(this.batches.has(a)) return;
    const glow=a.form==='firefly';
    const mat=new T.ShaderMaterial({transparent:glow,depthWrite:!glow,vertexColors:true,side:T.DoubleSide,uniforms:{t:this.time,light:this.light},
      vertexShader:`
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float hinge;
        uniform float t; uniform float light;
        varying vec3 ink; varying vec2 halo; varying float power;
        void main(){
          halo=vec2(0.); power=-1.;
          vec3 v=position;
          float fly=instanceMatrix[0].w, phase=instanceMatrix[1].w, rate=instanceMatrix[2].w;
          if(hinge>.5){
            float a=sin(t*.001*rate+phase)*fly+.12;
            float width=abs(v.x);
            v.y+=sin(a)*width;
            v.x*=cos(a)*(.14+.86*min(1.,fly*6.));
            v.z-=width*.48*(1.-min(1.,fly*6.));
          }
          ink=color*light*.001;
          ${glow?'float pulse=pow(.5+.5*sin(t*.0021+phase+sin(t*.0007+phase)),3.); ink+=vec3(2.1,2.55,.48)*pulse*smoothstep(.10,.22,-v.z);':''}
          gl_Position=projectionMatrix*modelViewMatrix*vec4(mat3(instanceMatrix)*v+instanceMatrix[3].xyz,1.);
          ${glow?`if(hinge>1.5){
            vec4 eye=modelViewMatrix*vec4(instanceMatrix[3].xyz,1.);
            eye.xy+=position.xy*.072;
            gl_Position=projectionMatrix*eye;
            halo=position.xy;
            power=pow(.5+.5*sin(t*.0021+phase+sin(t*.0007+phase)),2.);
          }`:''}
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader:`
        #include <common>
        #include <logdepthbuf_pars_fragment>
        varying vec3 ink; varying vec2 halo; varying float power;
        void main(){
          #include <logdepthbuf_fragment>
          gl_FragColor=vec4(ink,1.);
          ${glow?`if(power>=0.){
            float radius=length(halo);
            if(radius>=1.)discard;
            float core=exp(-radius*radius*65.);
            float aura=exp(-radius*radius*4.5);
            gl_FragColor=vec4(vec3(1.35,1.65,.38)+core*vec3(1.1,1.0,.45),power*(core*.95+aura*.33));
          }`:''}
        }`,
    });
    const mesh=new T.InstancedMesh(sculpt(a),mat,CELL_COUNT*GROUP_LIMIT);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.count=0; mesh.frustumCulled=false; mesh.name=a.name;
    this.root.add(mesh); this.batches.set(a,mesh); this.materials.push(mat);
  }
  begin(time:number,daylight:number):void {
    this.time.value=time; this.light.value=220+Math.round(daylight*930);
    for(let i=0;i<this.root.children.length;i++) (this.root.children[i] as T.InstancedMesh).count=0;
  }
  add(a:Animal,x:number,y:number,z:number,yaw:number,bank:number,fly:number,phase:number):void {
    const mesh=this.batches.get(a)!;
    const i=mesh.count++*16, m=mesh.instanceMatrix.array;
    const s=a.span, c=Math.cos(yaw)*s, n=Math.sin(yaw)*s, cb=Math.cos(bank), sb=Math.sin(bank);
    m[i]=c*cb;m[i+1]=s*sb;m[i+2]=-n*cb;m[i+3]=fly;
    m[i+4]=-c*sb;m[i+5]=s*cb;m[i+6]=n*sb;m[i+7]=phase;
    m[i+8]=n;m[i+9]=0;m[i+10]=c;m[i+11]=Math.min(85,10/Math.sqrt(s));
    m[i+12]=x;m[i+13]=y;m[i+14]=z;m[i+15]=1;
  }
  end():void {
    for(let i=0;i<this.root.children.length;i++) {
      const mesh=this.root.children[i] as T.InstancedMesh;
      mesh.visible=mesh.count>0;
      if(mesh.visible) mesh.instanceMatrix.needsUpdate=true;
    }
  }
  dispose():void {
    this.root.removeFromParent();
    for(const mesh of this.batches.values()) {mesh.geometry.dispose();mesh.dispose();}
    for(const m of this.materials) m.dispose();
    this.root.clear();this.batches.clear();
  }
}
