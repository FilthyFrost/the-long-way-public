// Under the shared GPU lock: SHOTS_GPU=1 node harness/shots/m5_trees.mjs
// Driving companions: V3_SLICE_OUT=m5-trees V3_SLICE_SIZE=1920x1080 V3_SLICE_HOURS=15.5
// SHOTS_GPU=1 node harness/shots/v3_slice.mjs plains forest desert maple
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';
const out = path.join(ROOT, 'loop/shots/m5-trees/lineup');
fs.mkdirSync(out,{recursive:true});
const { server,url } = await startServer();
try {
  const browser = await launchBrowser();
  try {
    const {page,errors} = await openGame(browser,url+'/modcar.html?shot=1&world=2&seed=7&start=road&time=15.5&weather=clear',{width:1280,height:720});
    const families = await page.evaluate(async () => {
      window.__rt.render();
      window.treeStage = await import('/harness/shots/m5_tree_stage.mjs');
      return window.treeStage.families;
    });
    const rows = [];
    async function shot(names,distance,season) {
      const data = await page.evaluate(([names,distance,season])=>window.treeStage.photograph(names,distance,season),[names,distance,season]);
      const file = [season,distance,...names].join('_')+'.png';
      fs.writeFileSync(path.join(out,file),Buffer.from(data,'base64'));
      rows.push({file,names,distance,season});
    }
    for (const name of families) await shot([name],18,'summer');
    for (const distance of [60,200]) {
      const n = distance===60 ? 2 : 6;
      for (let i=0;i<families.length;i+=n) await shot(families.slice(i,i+n),distance,'summer');
    }
    for (const season of ['autumn','winter']) {
      for (let i=0;i<families.length;i+=2) await shot(families.slice(i,i+2),60,season);
    }
    if (errors.length) throw Error(errors.join('\n'));
    fs.writeFileSync(path.join(out,'rows.json'),JSON.stringify(rows,null,2)+'\n');
    console.log(families.length+' families, '+rows.length+' photographs.');
  } finally { await browser.close(); }
} finally { await server.close(); }
