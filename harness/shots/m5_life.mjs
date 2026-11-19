import fs from 'node:fs';
import path from 'node:path';
import { ROOT, ON_GPU, startServer, launchBrowser } from './lib.mjs';

if (!ON_GPU) throw Error('Run with SHOTS_GPU=1 and the shared GPU lock.');
const out=path.join(ROOT,'loop/shots/m5-life');
fs.mkdirSync(out,{recursive:true});
const scenes=[
  ['birds','terraces','燕类',14],
  ['raptor','plains','南方凤头卡拉鹰',14,'patagonian-steppe'],
  ['waterbird','lakes','苔原天鹅',14,'arctic-tundra'],
  ['butterflies','flower_fields','斑蝶类',14],
  ['dragonflies','forest','蜻蜓',14],
  ['fireflies','forest','萤火虫',21,'appalachian'],
  ['snow-pass','alpine','',23],
];
const {server,url}=await startServer();
let browser;
try {
  browser=await launchBrowser();
  for(const [id,biome,species,hour,preview] of scenes){
    if(process.argv.length>2&&!process.argv.slice(2).includes(id)) continue;
    const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
    // Before the 25 landscapes are integrated, register the photographed survey ID in
    // the normal region registry, with that profile's June climate on the base terrain.
    if(preview) await page.route('**/modcar.html?*',async route=>{
      const response=await route.fetch(),html=await response.text();
      const bootstrap=`<script type="module">
        import { registerRegion, regionById, BIOME_INDEX } from '/src/core/world/biomes.ts';
        import { ECO_PROFILES } from '/src/core/world/data/ecoProfiles.ts';
        const p=ECO_PROFILES.find(p=>p.id===${JSON.stringify(preview)});
        if(!(p.id in BIOME_INDEX)) registerRegion({...regionById(${JSON.stringify(biome)}),id:p.id,label:p.name,tempDay:p.climate.highC[5],tempNight:p.climate.lowC[5]});
        await import('/src/game/modcar/entry.ts');
      </script>`;
      await route.fulfill({response,body:html.replace(/<script type="module" src="\/@vite\/client"><\/script>/g,'').replace('<script type="module" src="/src/game/modcar/entry.ts"></script>',bootstrap)});
    });
    await page.goto(url+'/modcar.html?shot=1&world=2&seed=7&start=road&build=stock:pickup&biome='+(preview??biome)+'&s=550&time='+hour+'&weather=clear');
    await page.waitForFunction(()=>window.__rt?.ready,null,{timeout:180000});
    const result=await page.evaluate(async ({id,species,preview,biome})=>{
      const rt=window.__rt,g=rt.game,w=g.world,sys=g.systems.get('life'),core=g.core;
      const {TerrainPoint}=await import('/src/core/world/terrain.ts');
      const {SpineSample}=await import('/src/core/world/spine.ts');
      const {BIOMES}=await import('/src/core/world/biomes.ts');
      const tp=new TerrainPoint(), sp=new SpineSample(), cam=core.camera,o=core.origin;
      g.ui.root.style.visibility='hidden';
      sys.show(species);
      if(biome==='flower_fields') {
        // The journey begins in June. Monarch-like butterflies occur here in July and August.
        const saved=g.clock.snapshot(); g.clock.restore({...saved,day:30});
      }
      const water=id==='waterbird'||id==='dragonflies';
      let ready=false,waterSpot;
      if(water) for(let k=0;k<650;k++){
        const f=w.water.feature(k);
        if(f?.kind!=='lake'||f.frozen>.2) continue;
        w.shape(f.cx,f.cz,tp);
        if(BIOMES[tp.bt>=.5?tp.bb:tp.ba].id!==(preview??biome)) continue;
        waterSpot=f;break;
      }
      let found=false, n=0,meta={};
      for(let attempt=0;attempt<65;attempt++){
        let s=550+attempt*245;
        if(waterSpot) s=waterSpot.s;
        w.spine.at(s,sp);
        let x=sp.x-Math.sin(sp.phi)*24,z=sp.z+Math.cos(sp.phi)*24;
        if(waterSpot) {
          const off=attempt%6*.12;
          x=waterSpot.cx+waterSpot.az*waterSpot.b*off;z=waterSpot.cz-waterSpot.ax*waterSpot.b*off;
        }
        w.shape(x,z,tp);
        if(BIOMES[tp.bt>=.5?tp.bb:tp.ba].id!==(preview??biome)) continue;
        if(!ready || attempt%5===0) {rt.devGoKm(s/1000,true);rt.simulate(.15);ready=true;}
        cam.position.set(x-o.x,Math.max(tp.wl,tp.h)+2-o.y,z-o.z);
        for(let i=0;i<105;i++) sys.lateUpdate(1/60,g);
        const mesh=sys.paint.root.children.find(m=>m.name===species);
        n=mesh?.visible?mesh.count:0;
        if(id==='snow-pass'){
          if(sys.count) throw Error('Unexpected active wildlife at night');
          rt.setView('cockpit'); g.render();found=true;break;
        }
        if(!n) continue;
        // Photograph a live instance at its current pose. Its size and placement are untouched.
        const m=mesh.instanceMatrix.array;
        const tx=m[12],ty=m[13],tz=m[14];
        const distance=id==='dragonflies'?.49:id==='butterflies'?.45:id==='fireflies'?3:id==='birds'?3.6:id==='waterbird'?3.8:4;
        const rise=id==='birds'?-distance*.22:id==='raptor'?distance*.45:id==='dragonflies'?distance*.82:distance*.32;
        const lateral=Math.atan2(m[8],m[10])+(id==='raptor'||water?1.12:1.35);
        cam.position.set(tx+distance*Math.sin(lateral),ty+rise,tz+distance*Math.cos(lateral));
        cam.lookAt(tx,ty,tz);cam.updateMatrixWorld();
        g.worldView.update(x,z,1e9);
        g.render();
        meta={species,preview,temp:g.env.state.temp,month:sys.month,region:sys.region?.id,terrain:biome,x:tx+o.x,y:ty+o.y,z:tz+o.z};
        found=true;break;
      }
      if(!found) throw Error('Missing '+id+' '+JSON.stringify({biome,waterSpot:!!waterSpot,region:sys.region?.id,month:sys.month,temp:g.env.state.temp,near:sys.count}));
      return {...meta,id,n,view:[cam.position.x,cam.position.y,cam.position.z]};
    },{id,species,preview,biome});
    await page.screenshot({path:path.join(out,id+'.png')});
    fs.writeFileSync(path.join(out,id+'.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result));
    if(errors.length) throw Error(errors.slice(0,4).join('\n'));
    if(id==='birds') {
      const timing=await page.evaluate(async()=>{
        const rt=window.__rt,g=rt.game,sys=g.systems.get('life');
        rt.setView('cockpit');sys.show();rt.simulate(.25);
        g.worldView.update(g.seated.sim.px,g.seated.sim.pz,1e9);
        const gl=g.core.renderer.getContext(), ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
        const renderer=gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
        if(!renderer.includes('5060')) throw Error(renderer);
        const cam=g.core.camera, cx=cam.position.x,cz=cam.position.z;
        let n=0;const cpu=[];
        for(let i=0;i<950;i++){
          cam.position.x=cx+i*.22;
          const t=performance.now();sys.lateUpdate(1/60,g);if(i>100)cpu.push(performance.now()-t);
          n=Math.max(n,sys.count);
        }
        cam.position.x=cx;cam.position.z=cz;
        for(let i=0;i<100;i++)sys.lateUpdate(1/60,g);
        g.render();gl.finish();
        const start=performance.now();
        for(let i=0;i<16;i++) {g.render();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));}
        const frame=(performance.now()-start)/16;
        const mesh=sys.paint.root.children.find(m=>m.visible && m.count>0);
        if(!mesh) throw Error('No birds or insects in driving benchmark');
        const root=sys.paint.root, drawParent=root.parent;
        const scene=new g.core.scene.constructor();scene.add(root);
        const r=g.core.renderer,clear=r.autoClear;r.autoClear=false;
        // Batch identical draws into one query; no clears or postprocessing in this attribution.
        const loops=120;
        let gpu=null;
        try {
          r.render(scene,cam);gl.finish();
          if(ext) {
            const q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);
            for(let i=0;i<loops;i++)r.render(scene,cam);
            gl.endQuery(ext.TIME_ELAPSED_EXT);
            for(let i=0;i<200&&!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);i++)await new Promise(res=>setTimeout(res,10));
            if(!gl.getParameter(ext.GPU_DISJOINT_EXT)&&gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))
              gpu=gl.getQueryParameter(q,gl.QUERY_RESULT)/loops/1e6;
            gl.deleteQuery(q);
          }
          const start=performance.now();
          for(let i=0;i<loops;i++)r.render(scene,cam);
          gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
          const draw=(performance.now()-start)/loops;
          cpu.sort((a,b)=>a-b);
          return {renderer,frame,cpuMean:cpu.reduce((a,b)=>a+b,0)/cpu.length,cpuP95:cpu[Math.floor(cpu.length*.95)],cpuMax:cpu.at(-1),gpu,draw,n,instances:sys.count,viewport:[innerWidth,innerHeight],buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight]};
        } finally { r.autoClear=clear;drawParent.add(root); }
      });
      fs.writeFileSync(path.join(out,'timing.json'),JSON.stringify(timing,null,2));console.log(timing);
      if(timing.cpuP95>.5 || timing.gpu===null || timing.gpu>.5) throw Error('Life exceeded its frame budget or GPU query unavailable');
    }
    await page.close();
  }
} finally { await browser?.close();await server.close(); }
