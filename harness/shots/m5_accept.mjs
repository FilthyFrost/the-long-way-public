// SHOTS_GPU=1 node harness/shots/m5_accept.mjs. Owns the shared GPU lock for the drive.
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, ON_GPU, launchBrowser, openGame, startServer } from './lib.mjs';
if (!ON_GPU) throw Error('SHOTS_GPU=1 is required');
const lock='D:/modcar-scratch/gpu-lock';
const out=path.join(ROOT,'loop/shots/m5-accept');
const seed=Number(process.env.M5_SEED||7);
const distance=Number(process.env.M5_KM||150)*1000;
const report={seed,distance,shots:[],recoveries:[],errors:[],chapters:[],status:'running'};
const frames=[];
const persist=()=>fs.writeFile(path.join(out,'summary.json'),JSON.stringify(report,null,2));
function figures(samples) {
  if (!samples.length) return null;
  const sorted=samples.map(p=>p.ms).sort((a,b)=>a-b);
  let sum=0, head=0, worst={ms:0,km:0};
  for(let i=0;i<samples.length;i++){
    sum+=samples[i].ms;
    while(head<i && sum-samples[head].ms>=1000) sum-=samples[head++].ms;
    const mean=sum/(i-head+1);
    if(sum>=1000 && mean>worst.ms) worst={ms:mean,km:samples[head].s/1000};
  }
  return {count:sorted.length,mean:sorted.reduce((a,b)=>a+b,0)/sorted.length,p95:sorted[Math.ceil(sorted.length*.95)-1],p99:sorted[Math.ceil(sorted.length*.99)-1],max:sorted.at(-1),worstSecond:worst};
}
async function sheet(browser){
  const page=await browser.newPage();
  const imgs=[];
  for(const s of report.shots) imgs.push({title:s.caption,url:'data:image/jpeg;base64,'+(await fs.readFile(path.join(out,s.file))).toString('base64')});
  const bytes=await page.evaluate(async(items)=>{
    const c=document.createElement('canvas'); c.width=1200;c.height=260*Math.ceil(items.length/3);
    const ctx=c.getContext('2d');ctx.fillStyle='#292929';ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle='white';ctx.font='16px sans-serif';
    for(const [i,item] of items.entries()){const img=new Image();img.src=item.url;await img.decode();const x=i%3*400,y=Math.floor(i/3)*260;ctx.drawImage(img,x,y,400,225);ctx.fillText(item.title,x+6,y+248,388);}
    return c.toDataURL('image/jpeg',.87).split(',')[1];
  },imgs);
  await fs.writeFile(path.join(out,'contact.jpg'),Buffer.from(bytes,'base64'));await page.close();
}
await fs.mkdir(out,{recursive:true});
for(;;){try{await fs.mkdir(lock);break;}catch(e){if(e.code!=='EEXIST')throw e;await new Promise(r=>setTimeout(r,5000));}}
let browser,server;
try {
  const host=await startServer();server=host.server;browser=await launchBrowser();
  const {page,errors}=await openGame(browser,host.url+'/modcar.html?shot=1&world=2&seed='+seed+'&start=road&build=stock:pickup&s=100&time=15.5&weather=clear',{width:1920,height:1080});
  report.errors=errors;
  const info=await page.evaluate(async distance=>{
    const rt=window.__rt,g=rt.game,world=g.world,cam=g.core.camera;
    const gl=g.core.renderer.getContext(), ext=gl.getExtension('WEBGL_debug_renderer_info');
    const gpu=ext&&gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    if(!/NVIDIA|AMD|Radeon|Intel/i.test(gpu)||/SwiftShader|llvmpipe/i.test(gpu))throw Error('Hardware GPU required: '+gpu);
    if(world.rules.version!==2)throw Error('Expected v2');
    if(!g.seated)g.enter(g.focus,'driver');
    g.ui.root.style.visibility='hidden';rt.setView('cockpit');
    const [{RobotDriver},{roadStyleAt,Pavement},{WORLD_REV}]=await Promise.all([import('/src/core/driver/robot.ts'),import('/src/core/world/roadStyles.ts'),import('/src/core/world/rules.ts')]);
    const robot=new RobotDriver({lane:.7,cruise:80/3.6,latG:.20});
    const sim=g.seated.sim; sim.setParkBrake(false);
    const initial={s:0,d:0};world.spine.project(sim.px,sim.pz,NaN,initial);robot.s=initial.s;
    const regions=rt.devRegions(),plan=world.spine.plan,chapters=[];
    let end=initial.s+distance;
    // Preserve the requested distance when it already represents every region.
    // A larger registry can require following subsequent chapters to reach them.
    if (distance >= 150000) {
      const covered=new Set();
      for(let i=0; i<2000; i++){
        covered.add(plan.biomeOf(i));
        if(plan.starts[i+1]>=end && covered.size===world.rules.regionCount) {
          if (end>initial.s+distance) end=plan.starts[i+1];
          break;
        }
        if(plan.starts[i+1]>=end) end=plan.starts[i+1]+1;
        if(i===1999) throw Error('Dealer did not reach all registered regions in 2000 chapters');
      }
    }
    for(let i=0;plan.starts[i]<end;i++){
      const id=regions[plan.biomeOf(i)].id,start=Math.max(initial.s,plan.starts[i]),finish=Math.min(end,plan.starts[i+1]);
      if(finish>start)chapters.push({id,start,finish,index:i,km:(finish-start)/1000,minutes80:(finish-start)*.00075,borderWidth:plan.transitionAt(i)});
    }
    const names=Object.fromEntries(Object.entries(Pavement).map(([k,v])=>[v,k]));
    const life=g.systems.get('life'),seen=chapters.map(()=>new Map()),pixel=new Uint8Array(4);
    const pos=cam.position.clone(),surfaces=chapters.map(()=>new Set());
    let progress=robot.s,stalled=0,ticks=0,chapter=0;
    // Record only actual animal submissions with their centres in the cockpit frustum.
    // The colony cell and member index survive instancing and repeated sightings.
    const draw=life.draw.bind(life),add=life.paint.add.bind(life.paint);let group,member,observe=false;
    life.draw=function(colony,...args){group=colony;member=0;return draw(colony,...args)};
    life.paint.add=function(animal,x,y,z,...args){
      if(observe){pos.set(x,y,z).project(cam);if(Math.abs(pos.x)<1&&Math.abs(pos.y)<1&&Math.abs(pos.z)<1){
        const insect=['bee','dragonfly','butterfly','firefly','moth'].includes(animal.form);
        seen[chapter].set([group.cx,group.cz,animal.name,member].join('/'),insect?'insects':'birds');
      }}member++;return add(animal,x,y,z,...args);
    };
    window.driveUntil=(target,hour)=>{
      const values=[],recoveries=[];
      for(let i=0;i<360 && robot.s<target;i++){
        const start=performance.now();
        g.env.clock.setHour(hour,g.time);
        const dt=1/60;
        g.scripted=robot.update(dt,sim,world.spine);
        observe= ticks++%15===0;
        g.step(dt,1);g.render();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
        values.push({s:robot.s,ms:performance.now()-start});
        while(chapter+1<chapters.length&&robot.s>=chapters[chapter].finish)chapter++;
        surfaces[chapter].add(names[roadStyleAt(world,robot.s).pavement]);
        if(robot.s>progress+2){progress=robot.s;stalled=0;}else if(++stalled>900){
          const from=robot.s,to=Math.min(target,Math.max(from,progress)+5);
          rt.devGoKm(to/1000,true);g.devRepair();sim.setParkBrake(false);
          robot.s=to;progress=to;stalled=0;recoveries.push({from,to,reason:'15 s without 2 m forward progress'});
        }
      }
      return {values,recoveries,s:robot.s,pending:rt.worldPending(),error:rt.lastError||null};
    };
    window.driveCounts=()=>seen.map((m,i)=>({birds:[...m.values()].filter(v=>v==='birds').length,insects:[...m.values()].filter(v=>v==='insects').length,surfaces:[...surfaces[i]]}));
    return {chapters,gpu,revision:WORLD_REV,start:initial.s,end,available:regions.map(r=>r.id)};
  },distance);
  Object.assign(report,info);await persist();
  const stops=[],night=new Set();
  for(const [i,c] of report.chapters.entries()){
    if(i)stops.push({s:c.start,label:report.chapters[i-1].id+' to '+c.id,hour:15.5});
    const mid=(c.start+c.finish)/2;
    stops.push({s:mid,label:c.id,hour:15.5});
    if(night.size<2&&!night.has(c.id)){night.add(c.id);stops.push({s:mid+Math.min(350,(c.finish-mid)*.5),label:c.id,hour:22});}
  }
  stops.push({s:info.end,label:'finish',hour:15.5});
  let s=info.start,lastLog=0;
  for(const stop of stops){
    while(s<stop.s){
      const part=await page.evaluate(([t,h])=>window.driveUntil(t,h),[stop.s,stop.hour]);
      frames.push(...part.values);report.recoveries.push(...part.recoveries);s=part.s;
      if(part.error&&!errors.includes(part.error))errors.push(part.error);
      if(report.recoveries.length>100)throw Error('Robot exceeded recovery limit at '+s);
      if(s-lastLog>1000){report.completedKm=(s-info.start)/1000;await persist();console.log(report.completedKm.toFixed(1)+' km');lastLog=s;}
    }
    const file=String(report.shots.length+1).padStart(2,'0')+'_'+stop.label.replaceAll(' ','_')+'_'+stop.hour+'.jpg';
    await page.screenshot({path:path.join(out,file),quality:90});
    report.shots.push({file,s,hour:stop.hour,caption:stop.label+' · '+(s/1000).toFixed(2)+' km · '+(stop.hour===22?'22:00':'15:30')});
    await persist();
  }
  const counts=await page.evaluate(()=>window.driveCounts());
  for(const [i,c] of report.chapters.entries()){
    Object.assign(c,counts[i],{frames:figures(frames.filter(f=>f.s>=c.start&&f.s<c.finish))});
    if(i)c.transitionFrames=figures(frames.filter(f=>Math.abs(f.s-c.start)<=c.borderWidth/2));
  }
  report.completedKm=(s-info.start)/1000;report.frames=figures(frames);
  report.unvisited=info.available.filter(id=>!report.chapters.some(c=>c.id===id));
  await sheet(browser);report.status='complete';await persist();console.log(JSON.stringify(report.frames));
} catch(e){report.status='failed';report.failure=String(e);await persist();throw e;}
finally{try{await browser?.close();await server?.close();}finally{await fs.rmdir(lock);}}
