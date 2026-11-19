import { hash32, hash2 } from '../../../../core/math/rng';
import { TerrainPoint, type World } from '../../../../core/world/terrain';
import { BIOMES } from '../../../../core/world/biomes';
import { Ecotope } from '../../../../core/world/ecotope';
import { Cover, FloraCell } from '../../../../core/world/flora';
import { PLANTS } from '../../../../core/world/plants';
import { appOf } from '../../../../core/v3/appliances/appliances';
import { anchor, animals, cellHash, CELL_BIRD, CELL_COUNT, CELL_INSECT, GROUP_LIMIT, inSeason, isDay,
  journeyMonth, localHabitat, profileFor, ringCell, sheltered, suits, type Animal, type Habitat } from '../../../../core/v3/life/rules';
import type { EcoProfile } from '../../../../core/world/data/ecoProfiles';
import { makePole, polePosition } from '../../../scene/worldBuild';
import type { GameContext } from '../../kernel/context';
import { PaintedAnimals } from './models';

class Colony {
  cx=Infinity; cz=Infinity; stamp=-1;
  visible=false;
  animal:Animal|null=null; profile:EcoProfile|undefined;
  x=0;y=0;z=0; endX=0;endY=0;endZ=0;
  phase=0; count=0; flee=0;
  // Positions and velocities of the small flock relative to its circling centre.
  readonly flock=new Float32Array(GROUP_LIMIT*4);
}

export class Life {
  readonly id='life';
  readonly budget={cpuMs:.5};
  private readonly colonies=Array.from({length:2*CELL_COUNT},()=>new Colony());
  readonly paint=new PaintedAnimals();
  private readonly t=new TerrainPoint();
  private readonly e=new Ecotope();
  private readonly f=new FloraCell();
  private readonly cover=new Cover();
  private readonly sites:import('../../../../core/world/sites').Site[]=[];
  private readonly pole=makePole();
  private readonly nextPole=makePole();
  private readonly h:Habitat={wood:false,flowers:false,wet:false,depth:0,kind:0,nearWater:0,moisture:0,lamp:false,field:false,ridge:false};
  private seedWorld:World|null=null;
  private serial=0;
  private scan=0;
  private viewX=Infinity;
  private viewZ=Infinity;
  private elapsedUs=0;
  count=0; month=6;
  region:EcoProfile|undefined;
  focus='';
  show(name=''):void {this.focus=name;this.serial++; }
  init(ctx:GameContext):void {
    // Prepare all shared meshes once; entering a new region only changes instance data.
    for(const a of Object.values(animals)) this.paint.prepare(a);
    this.paint.root.name='Scenery birds and insects';
    ctx.core.scene?.add(this.paint.root);
  }
  private choose(g:Colony,cx:number,cz:number,layer:number,ctx:GameContext,stamp:number):void {
    const w=ctx.world!;
    const hash=cellHash(cx,cz,w.seed,layer), size=layer?CELL_INSECT:CELL_BIRD;
    const x=anchor(cx,size,hash32(hash)), z=anchor(cz,size,hash32(~hash));
    g.cx=cx;g.cz=cz;g.stamp=stamp;g.animal=null;
    w.shape(x,z,this.t);
    const t=this.t, eco=w.eco!, flora=w.flora!, h=this.h;
    const p=profileFor(BIOMES[t.bt>=.5?t.bb:t.ba].id);
    if(!p || t.zone || t.plot>.4 || t.bridge>.05 || t.frozen>.2) return;
    const e=eco.at(x,z,this.e);
    const f=this.f;
    h.wet=t.wkind!==0 && t.wl>t.bed;
    h.depth=t.wl-t.bed;h.kind=h.wet?t.wkind:e.waterKind;
    h.nearWater=h.wet?0:e.waterDist;
    h.field=e.canopy<.68 && t.site<.2 && !h.wet;
    h.wood=t.site<.2 && (e.canopy>.24 || e.moisture>.55);
    h.ridge=h.field && (e.relief>1 || Math.abs(t.d)>20);
    h.moisture=e.moisture;
    h.flowers=t.site<.2 && !h.wet && flora.cover(x,z,this.cover,t.h).flowers>.022;
    h.lamp=false;
    g.x=x;g.y=h.wet?t.wl:t.h;g.z=z;
    const list=layer?p.insects:p.birds;
    if(!layer && !this.focus && (hash%4!==0)) return;
    for(let j=0;j<list.length;j++) {
      const entry=list[(j+(hash>>>8))%list.length];
      const n=entry.name;
      const a=animals[n];
      if(!a || (this.focus && n!==this.focus) || !inSeason(p,n,this.month,ctx.clock.hour,ctx.env.state)) continue;
      if(a.motion==='lamp') {
        for(const light of ctx.loose.list) {
          if(!light.item || light.shut || light.riding || (light.item.item!=='junk_lamp' && light.item.item!=='junk_solar_lamp') || !appOf(light.item).on) continue;
          if(Math.floor(light.x/size)===cx && Math.floor(light.z/size)===cz) {
            g.x=light.x;g.y=light.y+.3;g.z=light.z;h.lamp=true;break;
          }
        }
      }
      if(!suits(a,h) || !localHabitat(entry.habitat,h)) continue;
      if(a.motion==='perch') {
        let found=false;
        if(t.site>.02 || Math.abs(t.d)<48) {
          this.sites.length=0;
          w.sites.between(t.s-52,t.s+52,this.sites);
          for(const site of this.sites) for(const fence of site.objects) {
            if(fence.kind!=='fence' || Math.abs(fence.roll)>.1 || Math.abs(fence.x-x)+Math.abs(fence.z-z)>25) continue;
            g.x=fence.x;g.y=fence.y+fence.h;g.z=fence.z;found=true;break;
          }
        }
        if(!found && Math.abs(t.d)<21 && t.s>0) {
          const k=Math.floor(t.s/(24*w.spine.ds));
          polePosition(w,k,this.pole);polePosition(w,k+1,this.nextPole);
          const pick=(hash2(k,0x31e,w.seed)>>>8)&255;
          if(this.pole.state<2 && this.nextPole.state<2 && pick>=56) {
            g.x=(this.pole.tx+this.nextPole.tx)*.5;
            g.z=(this.pole.tz+this.nextPole.tz)*.5;
            g.y=(this.pole.ty+this.nextPole.ty)*.5-.42-(pick>232?5.2:1.1);
            found=true;
          }
        }
        if(!found) {
          for(let k=0;k<9;k++) {
            if(!flora.cell(k%2?1:0,Math.floor(x/8)+k%3-1,Math.floor(z/8)+Math.floor(k/3)-1,f)) continue;
            g.x=f.x;g.z=f.z;g.y=f.y+PLANTS[f.plant].height*f.size*.76;found=true;break;
          }
        }
        if(!found && a.site!=='field') continue;
        if(!found) g.y+=.25;
        g.endX=g.x;g.endY=g.y;g.endZ=g.z;
        for(let k=0;k<6;k++) {
          if(!flora.cell(1,Math.floor(g.x/8)+k%3-1,Math.floor(g.z/8)+1+Math.floor(k/3),f)) continue;
          g.endX=f.x;g.endY=f.y+PLANTS[f.plant].height*f.size*.83;g.endZ=f.z;break;
        }
      }
      if(a.motion==='soar'||a.motion==='flock') g.y+=a.motion==='soar'?23:10;
      if(a.motion==='wade') g.y=t.bed+.26*a.span;
      if(a.motion==='nectar') g.y+=Math.max(.27,this.cover.height+.1);
      if(a.motion==='glow') g.y+=.7;
      if(a.motion==='dart') g.y+=.22;
      g.profile=p;g.animal=a;g.phase=(hash>>>10)*.00000148;g.flee=0;
      g.count=a.motion==='flock'?4+hash%4:a.motion==='glow'?4:layer && a.motion!=='lamp'?2:1;
      for(let i=0;i<g.count;i++) {
        const v=i*4;
        g.flock[v]=(i%3-1)*1.7;g.flock[v+1]=Math.floor(i/3)*1.6;
        g.flock[v+2]=g.flock[v+3]=0;
      }
      return;
    }
  }
  lateUpdate(dt:number,ctx:GameContext):void {
    const w=ctx.world;
    if(!w || w.rules.version<2 || !ctx.core.camera || sheltered(ctx.env.state)) {
      this.paint.root.visible=false;this.count=0;return;
    }
    if(this.seedWorld!==w){this.seedWorld=w;this.viewX=Infinity;this.serial++;}
    this.elapsedUs=(this.elapsedUs+Math.round(Math.min(dt,.1)*1e6))%900000000;
    const o=ctx.core.origin, pos=ctx.core.camera.position;
    const vx=pos.x+o.x, vz=pos.z+o.z;
    this.paint.root.visible=true;
    this.month=journeyMonth(ctx.clock.day);
    const weather=ctx.env.state;
    const insects=weather.temp>=9 && weather.wind<=9 && weather.snowCover<=.35 && weather.rain<=.18;
    const stamp=this.serial*128+this.month*8+Number(isDay(ctx.clock.hour))*4+Number(insects)*2+Number(weather.temp>=14);
    this.paint.begin(Math.floor(this.elapsedUs/1000),ctx.env.sky.daylight);
    if(Math.abs(vx-this.viewX)+Math.abs(vz-this.viewZ)>6) {
      this.viewX=vx;this.viewZ=vz;
      w.shape(vx,vz,this.t);
      this.region=profileFor(BIOMES[this.t.bt>=.5?this.t.bb:this.t.ba].id);
    }
    // Service one vacant cell per frame; culled slots never linger after a teleport.
    let spent=false;
    this.count=0;
    for(let k=0;k<this.colonies.length;k++) {
      const i=(this.scan+k)%this.colonies.length,g=this.colonies[i];
      g.visible=false;
      const layer=i%2,slot=i>>1,size=layer?CELL_INSECT:CELL_BIRD;
      const cx=ringCell(Math.floor(vx/size),slot%5), cz=ringCell(Math.floor(vz/size),Math.floor(slot/5));
      if(g.cx!==cx || g.cz!==cz || g.stamp!==stamp || (i===this.scan && !isDay(ctx.clock.hour) && layer)) {
        if(spent) continue;
        this.choose(g,cx,cz,layer,ctx,stamp);spent=true;
      }
      const a=g.animal;if(!a) continue;
      const dx=g.x-vx,dz=g.z-vz;
      if(dx*dx+dz*dz>(layer?20*20:83*83)) continue;
      const player=ctx.seated?.sim, walk=ctx.player.walker;
      const sx=g.x-(player?player.px:walk.x),sz=g.z-(player?player.pz:walk.z);
      const near=sx*sx+sz*sz<55;
      g.flee=Math.max(0,Math.min(1,g.flee+(near?1.4:-.32)*dt));
      g.visible=true;
      this.draw(g,a,dt,o.x,o.y,o.z);
      this.count+=g.count;
    }
    this.scan=(this.scan+1)%this.colonies.length;
    this.paint.end();
  }
  private draw(g:Colony,a:Animal,dt:number,ox:number,oy:number,oz:number):void {
    const t=this.elapsedUs*1e-6, m=a.motion;
    for(let i=0;i<g.count;i++) {
      const phase=g.phase+i*2.4, u=t+phase;
      let x=g.x,y=g.y,z=g.z,yaw=phase,bank=0,fly=.72;
      if(m==='soar'||m==='flock') {
        const turn=t*(m==='soar'?.19:.45)+g.phase, r=m==='soar'?14:8;
        x+=r*Math.cos(turn);z+=r*Math.sin(turn);y+=1.3*Math.sin(turn*.8);
        yaw=-turn;bank=.25;fly=m==='soar'?.17:.60;
        if(m==='flock') {
          const v=4*i, b=g.flock, fx=b[v],fz=b[v+1];
          let ax=((i%3-1)*1.8-fx)*.9, az=(Math.floor(i/3)*1.6-fz)*.9;
          for(let j=0;j<g.count;j++) if(i!==j) {
            const n=j*4, dx=fx-b[n],dz=fz-b[n+1],d2=dx*dx+dz*dz;
            if(d2<3) {ax+=dx/(.25+d2);az+=dz/(.25+d2);}
            ax+=(b[n+2]-b[v+2])*.035;az+=(b[n+3]-b[v+3])*.035;
          }
          const step=Math.min(dt,.08);
          b[v+2]+=(ax+Math.sin(u)-b[v+2])*step;b[v+3]+=(az+Math.cos(u)-b[v+3])*step;
          b[v]+=b[v+2]*step;b[v+1]+=b[v+3]*step;
          x+=fx*Math.cos(yaw)+fz*Math.sin(yaw);z+=fz*Math.cos(yaw)-fx*Math.sin(yaw);
          y+=.35*Math.sin(u*.9);
        }
      } else if(m==='perch') {
        const f=Math.max(0,Math.min(1,Math.sin(u*.32)*3+.5));
        x+=(g.endX-x)*f;z+=(g.endZ-z)*f;y+=(g.endY-y)*f+4*f*(1-f)*1.3+.09*a.span;
        fly=f>.001 && f<.999?.85:0;
        yaw=Math.atan2(g.endX-g.x,g.endZ-g.z)+(Math.cos(u*.32)<0?Math.PI:0);
      } else if(m==='wade'||m==='swim') {
        yaw+=.14*Math.sin(u*.53);y+=.012*Math.sin(u*1.2);fly=0;
      } else {
        const speed=m==='dart'?Math.tanh(3*Math.sin(u*1.4)):Math.sin(u*1.8);
        const r=m==='glow'?1.25:m==='lamp'?.28:.42;
        x+=r*speed+Math.sin(phase)*r;z+=r*Math.cos(u*1.4);y+=r*(.38+.32*Math.sin(u*2.4));
        yaw=Math.atan2(Math.cos(u*1.8),-Math.sin(u*1.4));
        fly=a.form==='dragonfly'?.22:.94;
      }
      if((m==='perch'||m==='wade'||m==='swim') && g.flee>0) {
        x+=g.flee*4*Math.sin(phase);z+=g.flee*4*Math.cos(phase);y+=g.flee*2.8;
        fly=Math.max(fly,g.flee*.88);yaw=phase;
      }
      this.paint.add(a,x-ox,y-oy,z-oz,yaw,bank,fly,phase);
    }
  }
  telemetry():Record<string,unknown>{
    return {count:this.count,region:this.region?.name,month:this.month,
      groups:this.colonies.filter(c=>c.visible && this.count).map(c=>({name:c.animal!.name,x:c.x,y:c.y,z:c.z}))};
  }
  dispose():void {this.paint.dispose();}
}
