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
// Rings perpendicular to the neck centreline give a continuous throat and nape in profile.
function neckTube(rows: readonly [number,number,number][], color:number, shadow:number):void {
  function vertex(i:number,j:number):V {
    const [z,y,r]=rows[i], prev=rows[Math.max(0,i-1)], next=rows[Math.min(rows.length-1,i+1)];
    const dz=next[0]-prev[0], dy=next[1]-prev[1], len=Math.hypot(dz,dy)||1;
    const u=j*Math.PI/5;
    return [r*Math.cos(u),y-r*Math.sin(u)*dz/len,z+r*Math.sin(u)*dy/len];
  }
  for(let i=1;i<rows.length;i++) for(let j=0;j<10;j++){
    const a=vertex(i-1,j), b=vertex(i,j), c=vertex(i,j+1), d=vertex(i-1,j+1);
    const ink=j>5?shadow:color; face(a,b,c,ink); face(a,c,d,ink);
  }
}
function waterfowl(a:Animal):void {
  const swan=a.form==='swan',teal=a.name==='绿翅鸭',mallard=a.name==='绿头鸭';
  const back=swan?0xf3eddd:a.back, flank=swan?0xd7cbbb:a.breast;
  oval(0,.025,-.02,.117,.102,.32,back,flank);
  oval(0,.056,.14,.105,.107,.16,swan?0xefead9:flank,flank);
  const headY=swan?.32:.188,headZ=swan?.225:.216;
  if(swan) neckTube([[.13,.064,.092],[.18,.115,.069],[.202,.168,.05],[.185,.218,.039],
    [.165,.261,.032],[.172,.302,.031],[.195,.321,.031],[.22,.323,.029]],0xf7f1e1,0xddd4c1);
  else {
    oval(0,.139,.173,.054,.069,.063,mallard?0x395e4b:a.tips,flank);
    if(mallard)oval(0,.129,.173,.058,.012,.058,0xf5efd5,0xe2ddcb);
  }
  oval(0,headY,headZ,swan?.041:.058,swan?.039:.057,swan?.064:.071,swan?0xf7f1de:a.tips,swan?0xe6dcce:a.tips);
  const bill=swan?0x454349:mallard?0xc9af59:0x514c4d;
  oval(0,headY-.013,headZ+.076,swan?.024:.034,.014,.051,bill,bill);
  for(const s of [-1,1]){
    if(teal) oval(s*.052,headY+.007,headZ-.013,.009,.022,.042,0x3b6d56,0x3b6d56);
    oval(s*(swan?.038:.052),headY+.012,headZ+.022,.006,.006,.007,0x2e3031,0x2e3031);
    // Three nested rows of scapulars, arched above the back, taper to a point behind the rump.
    const edge:V[]=[[s*.055,.108,.155],[s*.097,.127,.087],[s*.108,.137,-.025],
      [s*.08,.126,-.15],[s*.038,.131,-.286],[s*.065,.086,-.222],[s*.121,.053,-.111],[s*.119,.056,.057]];
    const mid:V=[s*.104,.114,-.04];
    for(let j=0;j<edge.length;j++)face(mid,edge[j],edge[(j+1)%edge.length],swan?(j<4?0xfcf4df:0xe1d7c4):back);
    for(let k=0;k<4;k++){
      const z=-.042-k*.036;
      face([s*.112,.098,z],[s*.105,.077,z-.071],[s*.075,.104,z-.107],swan?0xeee6d3:(k===0?0x446674:0x6b6358));
    }
    face([s*.055,.087,-.20],[s*.033,.097,-.35],[0,.083,-.29],back);
    // Flight wings lie inside the folded scapulars until take-off.
    face([s*.04,.065,.09],[s*.31,.07,.065],[s*.25,.05,-.13],back,1);
    face([s*.31,.07,.065],[s*.49,.035,-.035],[s*.25,.05,-.13],swan?0xe9e3d7:0x4d4849,1);
  }
}
function soaringBird(a:Animal):void {
  oval(0,.008,-.003,.076,.075,.189,a.back,a.breast);
  oval(0,.051,.168,.047,.053,.064,a.back,a.breast);
  oval(0,.037,.22,.023,.021,.032,0x9f885e,0x686052);
  face([-.012,.044,.239],[.014,.044,.239],[0,.007,.249],0x524c46);
  for(const s of [-1,1]) {
    oval(s*.041,.061,.185,.006,.006,.007,0x272934,0x272934);
    // Broad arm, pale underwing coverts and a dark trailing edge; fingers have actual gaps.
    const strips=[[.035,.082,-.155],[.155,.105,-.164],[.30,.09,-.138],[.385,.051,-.089]];
    for(let k=1;k<strips.length;k++){
      const [x0,f0,b0]=strips[k-1],[x1,f1,b1]=strips[k];
      const band=(t:number,h:number,c:number)=>{
        const y=.021+h;
        const lf:V=[s*x0,y,f0],rf:V=[s*x1,y,f1],lb:V=[s*x0,y,b0+(f0-b0)*t],rb:V=[s*x1,y,b1+(f1-b1)*t];
        face(lf,rf,rb,c,1);face(lf,rb,lb,c,1);
      };
      band(0,0,a.tips);band(.22,.004,a.back);band(.24,-.004,k===1?a.breast:0xc6ae85);
    }
    for(let k=0;k<6;k++){
      const x=.353-k*.010, z=.067-k*.028, tipX=.53-k*.012,tipZ=.054-k*.045;
      face([s*x,.021,z],[s*tipX,.037,tipZ],[s*(tipX-.034),.033,tipZ-.018],a.tips,1);
      face([s*x,.021,z],[s*(tipX-.034),.033,tipZ-.018],[s*(x-.012),.02,z-.04],a.tips,1);
    }
    for(let k=0;k<4;k++){
      const angle=(k+.15)*.105, ex=Math.sin(angle)*.23,ez=-.145-Math.cos(angle)*.23;
      face([0,.018,-.119],[s*ex,.022,ez],[s*(ex+.029),.02,ez+.011],a.name==='红尾鵟'?0xb16f4a:a.back);
    }
  }
}
function butterfly(a:Animal):void {
  oval(0,0,.005,.020,.024,.159,0x51483c,0x655344);
  oval(0,.013,.146,.029,.029,.038,0x4e493e,0x655344);
  const rim:V[]=[[.027,.003,.115],[.19,.035,.266],[.365,.048,.314],[.46,.057,.276],
    [.49,.051,.174],[.451,.037,.072],[.337,.021,-.007],[.408,.018,-.086],
    [.368,.011,-.196],[.284,.007,-.248],[.175,.010,-.232],[.047,.012,-.121]];
  for(const side of [-1,1]) {
    const joint:V=[side*.027,.013,0];
    for(let k=0;k<rim.length;k++){
      const v=rim[k],w=rim[(k+1)%rim.length];
      const outer:V=[side*v[0],v[1],v[2]],end:V=[side*w[0],w[1],w[2]];
      const cut=(p:V):V=>[joint[0]+(p[0]-joint[0])*.82,p[1]+.005,p[2]*.81];
      const r=cut(outer),q=cut(end);
      face(joint,r,q,k<7?a.back:a.breast,1,1-(k%3)*.025);
      face(r,outer,end,a.tips,1);face(r,end,q,a.tips,1);
      if(k>1 && k<10){
        const vein:V=[r[0]+side*.009,r[1]+.004,r[2]+.006];
        face(joint,r,vein,a.tips,1);
        const x=(outer[0]+r[0])*.5,y=r[1]+.006,z=(outer[2]+r[2])*.5;
        face([x,y,z+.012],[x+side*.008,y,z],[x,y,z-.011],0xffe9b6,1);
      }
    }
    face([0,.023,.154],[side*.008,.022,.162],[side*.067,.047,.245],a.tips);
  }
}
function sculpt(a: Animal): T.BufferGeometry {
  pos.length=rgb.length=wing.length=0;
  const f=a.form, b=a.back, p=a.breast, d=a.tips;
  const insect=['bee','dragonfly','firefly','butterfly','moth'].includes(f);
  if(f==='swan'||f==='duck') waterfowl(a);
  else if(f==='raptor') soaringBird(a);
  else if(f==='butterfly') butterfly(a);
  else if(insect) {
    const thin=f==='dragonfly', bee=f==='bee';
    oval(0,0,0,thin?.022:bee?.14:.045,thin?.025:bee?.13:.05,thin?.40:.24,b,p);
    oval(0,.02,.18,bee?.12:.05,bee?.11:.05,.08,p,b);
    if(bee) oval(0,0,-.09,.135,.123,.055,p,p);
    if(f==='firefly') {
      pos.length=rgb.length=wing.length=0;
      oval(0,0,-.21,.10,.08,.11,d,d);
      face([-1,-1,0],[1,-1,0],[1,1,0],d,2);
      face([-1,-1,0],[1,1,0],[-1,1,0],d,2);
    }
    if(f!=='firefly') for(const s of [-1,1]) {
      const root:V=[s*.025,.02,.04], fore:V=[s*.49,.035,thin?.11:.33], edge:V=[s*.43,.03,thin?.04:.04];
      const hind:V=[s*(thin?.44:.31),.025,thin?-.12:-.25], mid:V=[s*.30,.03,.08];
      face(root,fore,mid,thin||bee?d:b,1); face(mid,fore,edge,d,1);
      face(root,mid,edge,thin?d:b,1);
      face(root,[s*.33,.025,thin?-.06:-.03],hind,thin||bee?d:p,1);

    }
  } else {
    const big=f==='pelican', water=f==='egret';
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
    face([-.03,.085+neck,.197],[.03,.085+neck,.197],bill,water?0xc39b57:0x554b43);
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
        const foot:V=[s*.036,water?-.26:-.08,-.018];
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
  private readonly emission={value:1000};
  private readonly materials:T.ShaderMaterial[]=[];
  prepare(a:Animal):void {
    if(this.batches.has(a)) return;
    const glow=a.form==='firefly';
    const mat=new T.ShaderMaterial({transparent:glow,depthWrite:!glow,vertexColors:true,side:T.DoubleSide,uniforms:{t:this.time,light:this.light,gain:this.emission},
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
          ${a.name==='粉蝶类'?'if(hinge>.5 && phase>3.8) ink*=vec3(1.,.92,.39);':''}
          ${glow?'float pulse=pow(.5+.5*sin(t*.0021+phase+sin(t*.0007+phase)),3.); ink+=vec3(2.1,2.55,.48)*pulse*smoothstep(.10,.22,-v.z);':''}
          vec4 anchorEye=modelViewMatrix*vec4(instanceMatrix[3].xyz,1.);
          float readScale=${a.motion==='flock'?'clamp(1.+(-anchorEye.z-10.)*.042,1.,4.25)':'1.'};
          gl_Position=projectionMatrix*(anchorEye+modelViewMatrix*vec4(mat3(instanceMatrix)*v*readScale,0.));
          ${glow?`if(hinge>1.5){
            vec4 eye=modelViewMatrix*vec4(instanceMatrix[3].xyz,1.);
            eye.xy+=position.xy*clamp(.20-eye.z*.013,.20,.78);
            gl_Position=projectionMatrix*eye;
            halo=position.xy;
            power=smoothstep(-.75,.55,sin(t*(.00098+.00019*sin(phase))+phase+sin(t*.00028+phase)*.5));
          }`:''}
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader:`
        #include <common>
        #include <logdepthbuf_pars_fragment>
        varying vec3 ink; varying vec2 halo; varying float power;
        uniform float gain;
        void main(){
          #include <logdepthbuf_fragment>
          gl_FragColor=vec4(ink,1.);
          ${glow?`if(power>=0.){
            float radius=length(halo);
            if(radius>=1.)discard;
            float core=exp(-radius*radius*29.);
            float aura=exp(-radius*radius*4.5);
            vec3 emission=(vec3(.9,1.38,.21)*aura+vec3(8.9,9.4,2.1)*core)*gain*.001;
            gl_FragColor=vec4(emission,power*(.88*core+.52*aura)*(1.-smoothstep(.80,1.,radius)));
          }`:''}
        }`,
    });
    const mesh=new T.InstancedMesh(sculpt(a),mat,CELL_COUNT*GROUP_LIMIT);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.count=0; mesh.frustumCulled=false; mesh.name=a.name;
    this.root.add(mesh); this.batches.set(a,mesh); this.materials.push(mat);
  }
  begin(time:number,daylight:number,exposure:number):void {
    this.emission.value=Math.round(1000/Math.max(.5,exposure));
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
