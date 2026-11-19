import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';
import path from 'node:path';
import { ROOT, ON_GPU, launchBrowser, openGame, startServer } from './lib.mjs';

const stage = process.argv[2];
if (!['before','after'].includes(stage) || !ON_GPU) throw Error('Run with SHOTS_GPU=1 and before or after');
const out = path.join(ROOT, 'loop/shots/m5-ground', 'rev9', stage);
fs.mkdirSync(out, { recursive: true });
// Load precisely the pre-change render path for paired pictures, without changing the worktree.
async function baselineServer() {
  const files=new Set(['src/core/world/rules.ts','src/game/modcar/ModGame.ts','src/game/render/floraMaterial.ts',
    'src/game/scene/floraScatter.ts','src/game/scene/plantRegistry.ts','src/game/scene/worldBuild.ts','src/game/scene/worldView.ts']);
  const server=await createServer({root:ROOT,logLevel:'error',server:{host:'127.0.0.1',port:5199,hmr:false},
    plugins:[{name:'m5-ground-baseline',enforce:'pre',load(id){
      const rel=path.relative(ROOT,id).split(path.sep).join('/');
      if(files.has(rel))return execFileSync('git',['show','63e7fe8:'+rel],{cwd:ROOT,encoding:'utf8',maxBuffer:4e6});
    }}]});
  await server.listen();
  return {server,url:'http://127.0.0.1:'+server.httpServer.address().port};
}
const {server,url} = stage==='before' ? await baselineServer() : await startServer();
const browser = await launchBrowser();
const records = [];
try {
  for (const region of ['lakes','forest','alpine','red_canyon','desert','river','terraces','maple']) {
    const biome = region==='river' ? 'plains' : region;
    const {page,errors} = await openGame(browser, url+'/modcar.html?shot=1&world=2&seed=7&start=road&build=stock:pickup&s=1200&time=15.5&weather=clear&biome='+biome,{width:1920,height:1080});
    const site = await page.evaluate(async (region) => {
      const rt=window.__rt, g=rt.game;
      if (!g.seated) g.enter(g.focus,'driver');
      rt.devGoKm(1.2,true);
      g.ui.root.style.visibility='hidden';
      rt.setHour(15.5);
      rt.setView('cockpit');
      rt.look(0,0);
      const v=g.seated;
      g.simulate(0.15);
      const {groundField}=await import('/src/core/world/groundField.ts');
      const {SpineSample}=await import('/src/core/world/spine.ts');
      const field=groundField(g.world),st=new SpineSample(),projection={s:0,d:0};
      g.world.spine.project(v.sim.px,v.sim.pz,NaN,projection);
      const target=({lakes:'fern',forest:'sedge',alpine:'cushion',red_canyon:'fin',desert:'creosote',river:'cobbles',terraces:'rice',maple:'litter'})[region];
      let chapter=rt.devJourney(1)[0];
      let found;
      const rocks=['fin','cobbles'].includes(target);
      const seen=new Set();
      if (region==='river') {
        for(let a=0;a<8 && !found;a++){
          const slot=g.world.rules.slot;
          for(let k=Math.ceil(chapter.start/slot);k*slot<chapter.start+chapter.length-500 && !found;k++){
            const f=g.world.water.feature(k);
            if(f?.kind!=='river')continue;
            for(const dx of [-64,0,64]) for(const dz of [-90,-45,45,90]){
              const tile=field.tile(Math.floor((f.x0+dx)/128),Math.floor((f.z0+dz)/128),true);
              found ??=tile.find(c=>c.form==='cobbles' && g.world.eco.at(c.x,c.z,{}).waterKind===2);
            }
          }
          if(!found){rt.devGoRegion('plains',true);g.simulate(0.15);chapter=rt.devJourney(1)[0];}
        }
      }
      for(let chapterTry=0;chapterTry<5 && !found;chapterTry++) {
      outer: for(let ds=0;!found && ds<chapter.length-2000;ds+=400) {
        g.world.spine.at(chapter.start+1000+ds,st);
        for(const d of [24,-24,96,-96,230,-230,450,-450,850,-850,1400,-1400]){
          const x=st.x-Math.sin(st.phi)*d,z=st.z+Math.cos(st.phi)*d;
          const tx=Math.floor(x/128),tz=Math.floor(z/128),key=tx+','+tz;
          if(seen.has(key))continue;
          seen.add(key);
          const clumps=field.tile(tx,tz,rocks);
          found=clumps.find(c=>c.form===target);
          if(found)break outer;
        }
      }
      if(!found){rt.devGoRegion(region,true);g.simulate(0.15);chapter=rt.devJourney(1)[0];}
      }
      if(!found)throw Error('No '+target+' found in '+region);
      {
        g.world.spine.project(found.x,found.z,NaN,projection);
        rt.devGoKm(projection.s/1000,true);
        g.simulate(0.15);
      }
      const x0=v.sim.px,z0=v.sim.pz;
      g.worldView.update(x0,z0,1e9);
      rt.render();
      const reach=found.form==='fin'?8:found.form==='creosote'?4.5:3.4;
      // Face the subject along the contour so the slope does not hide it from walking height.
      let view=0, delta=Infinity;
      for(let i=0;i<12;i++){
        const a=i*Math.PI/6,e=g.world.eco.at(found.x-reach*Math.cos(a),found.z-reach*Math.sin(a),{});
        if(e.flags)continue;
        const cost=Math.abs(e.h-found.y)+0.04*Math.abs(a-Math.atan2(found.z-z0,found.x-x0));
        if(cost<delta){delta=cost;view=a;}
      }
      return {x:found.x,z:found.z,heading:view,reach,name:found.name,form:found.form};
    },region);
    const times=await page.evaluate(()=>{
      const rt=window.__rt,gl=rt.game.core.renderer.getContext(),px=new Uint8Array(4),ms=[];
      for(let i=0;i<64;i++){const t=performance.now();rt.render();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);if(i>=12)ms.push(performance.now()-t);}
      ms.sort((a,b)=>a-b);
      return {median:ms[26],p95:ms[49],max:ms[51]};
    });
    await page.screenshot({path:path.join(out,region+'_drive.png')});
    await page.evaluate(site=>{
      const rt=window.__rt,g=rt.game;
      g.getOut();
      if(g.seated)throw Error('still seated');
      g.player.walker.place(site.x-site.reach*Math.cos(site.heading),site.z-site.reach*Math.sin(site.heading),site.heading);
      rt.look(site.heading,-0.35);
      g.simulate(0.18);
      g.worldView.update(g.player.walker.x,g.player.walker.z,1e9);
      rt.render();
    },site);
    await page.screenshot({path:path.join(out,region+'_foot.png')});
    records.push({region,site,times});
    fs.writeFileSync(path.join(out,'shots.json'),JSON.stringify(records,null,2));
    console.log(region,JSON.stringify(times));
    if(errors.length)throw Error(errors.join('\n'));
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
