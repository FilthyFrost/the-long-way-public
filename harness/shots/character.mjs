// Shots of her on her preview page (character.html) in the game's own frame: a list of views, each a clip at a time,
// an orbit, an hour. Pictures go to loop/shots/character/.
//   node harness/shots/character.mjs [set] [--only a,b]      (SHOTS_GPU=1 draws on the GPU: much faster)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const SETS = {
  // the turnaround's three views, and a look from above and in front
  turn: [
    { name: 'front', q: 'pose=bind&orbit=0,4,3.4,0.86&fov=32' },
    { name: 'side', q: 'pose=bind&orbit=90,4,3.4,0.86&fov=32' },
    { name: 'back', q: 'pose=bind&orbit=180,4,3.4,0.86&fov=32' },
    { name: 'three_quarter', q: 'pose=bind&orbit=35,12,2.6,1.0&fov=36' },
  ],
  clips: [
    { name: 'idle', q: 'clip=Idle&t=0.5&orbit=25,6,3.2,0.9&fov=36' },
    { name: 'walk', q: 'clip=Walk&t=0.3&orbit=70,6,3.2,0.9&fov=36' },
    { name: 'run', q: 'clip=Run&t=0.2&orbit=70,6,3.4,0.9&fov=36' },
    { name: 'sprint', q: 'clip=Sprint&t=0.25&orbit=60,6,3.6,0.9&fov=36' },
    { name: 'jump', q: 'clip=Jump_Loop&t=0.2&orbit=40,6,3.4,0.9&fov=36' },
  ],
  act: [
    { name: 'walk', q: 'act=walk&orbit=70,6,3.0,0.9&fov=36' },
    { name: 'run', q: 'act=run&orbit=70,6,3.2,0.9&fov=36' },
    { name: 'strafe', q: 'act=strafe&orbit=20,6,3.0,0.9&fov=36' },
    { name: 'crouch', q: 'act=crouch&orbit=45,10,2.6,0.6&fov=36' },
    { name: 'sit', q: 'act=sit&orbit=60,15,2.2,0.8&fov=36' },
    { name: 'sit_front', q: 'act=sit&orbit=10,20,1.7,0.9&fov=36' },
  ],
  hands: [
    { name: 'relaxed_back', q: 'act=hands&grip=relaxed&orbit=0,20,0.42,1.2&tz=0.3&fov=34' },
    { name: 'relaxed_side', q: 'act=hands&grip=relaxed&orbit=55,10,0.36,1.2&tz=0.3&fov=34' },
    { name: 'open_palm', q: 'act=hands&grip=open&palm=up&orbit=0,40,0.42,1.2&tz=0.3&fov=34' },
    { name: 'fist', q: 'act=hands&grip=fist&orbit=30,15,0.38,1.2&tz=0.3&fov=34' },
    { name: 'bar', q: 'act=hands&grip=bar&orbit=30,15,0.38,1.2&tz=0.3&fov=34' },
    { name: 'pinch', q: 'act=hands&grip=pinch&orbit=40,15,0.36,1.2&tz=0.3&fov=34' },
    { name: 'point', q: 'act=hands&grip=point&orbit=40,15,0.36,1.2&tz=0.3&fov=34' },
    { name: 'fp_view', q: 'act=hands&grip=relaxed&fp=1&orbit=180,-14,0.08,1.48&tz=0.06&fov=68&hz=0.3&hy=1.22' },
  ],
  one: [
    { name: 'relaxed_back', q: 'act=hands&one=1&grip=relaxed&orbit=0,70,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'relaxed_palm', q: 'act=hands&one=1&grip=relaxed&orbit=0,-70,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'relaxed_thumb', q: 'act=hands&one=1&grip=relaxed&orbit=90,5,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'relaxed_pinky', q: 'act=hands&one=1&grip=relaxed&orbit=-90,5,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'relaxed_front', q: 'act=hands&one=1&grip=relaxed&orbit=0,8,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'fist_back', q: 'act=hands&one=1&grip=fist&orbit=0,70,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'fist_palm', q: 'act=hands&one=1&grip=fist&orbit=0,-70,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'fist_thumb', q: 'act=hands&one=1&grip=fist&orbit=90,5,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'fist_pinky', q: 'act=hands&one=1&grip=fist&orbit=-90,5,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'fist_front', q: 'act=hands&one=1&grip=fist&orbit=0,8,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'bar_back', q: 'act=hands&one=1&grip=bar&orbit=0,70,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'bar_palm', q: 'act=hands&one=1&grip=bar&orbit=0,-70,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'bar_thumb', q: 'act=hands&one=1&grip=bar&orbit=90,5,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'bar_pinky', q: 'act=hands&one=1&grip=bar&orbit=-90,5,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'bar_front', q: 'act=hands&one=1&grip=bar&orbit=0,8,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'point_back', q: 'act=hands&one=1&grip=point&orbit=0,70,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'point_palm', q: 'act=hands&one=1&grip=point&orbit=0,-70,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'point_thumb', q: 'act=hands&one=1&grip=point&orbit=90,5,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'point_pinky', q: 'act=hands&one=1&grip=point&orbit=-90,5,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'point_front', q: 'act=hands&one=1&grip=point&orbit=0,8,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'pinch_back', q: 'act=hands&one=1&grip=pinch&orbit=0,70,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'pinch_palm', q: 'act=hands&one=1&grip=pinch&orbit=0,-70,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'pinch_thumb', q: 'act=hands&one=1&grip=pinch&orbit=90,5,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'pinch_pinky', q: 'act=hands&one=1&grip=pinch&orbit=-90,5,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'pinch_front', q: 'act=hands&one=1&grip=pinch&orbit=0,8,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'wheel_back', q: 'act=hands&one=1&grip=wheel&orbit=0,70,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'wheel_palm', q: 'act=hands&one=1&grip=wheel&orbit=0,-70,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'wheel_thumb', q: 'act=hands&one=1&grip=wheel&orbit=90,5,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'wheel_pinky', q: 'act=hands&one=1&grip=wheel&orbit=-90,5,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'wheel_front', q: 'act=hands&one=1&grip=wheel&orbit=0,8,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
  ],
  wear: [
    { name: 'down_front', q: 'act=stand&wear=down,pants_snow,boots,gloves_ski,beanie&orbit=20,6,3.0,0.9&fov=36' },
    { name: 'down_back', q: 'act=stand&wear=down,pants_snow,boots,gloves_ski,beanie,pack_big&orbit=160,8,3.0,0.9&fov=36' },
    { name: 'jacket', q: 'act=stand&wear=jacket,shoes,cap&orbit=30,6,3.0,0.9&fov=36' },
    { name: 'jacket_dress', q: 'act=stand&wear=padded,boots,trapper,gloves&orbit=-30,6,3.0,0.9&fov=36' },
    { name: 'sweater_pants', q: 'act=stand&wear=sweater,pants,shoes,gloves_fingerless,pack&orbit=40,6,3.0,0.9&fov=36' },
    { name: 'down_walk', q: 'act=walk&wear=down,boots,beanie&orbit=70,6,3.0,0.9&fov=36' },
  ],
  // her head as the turnaround draws it (refs/character/turnaround.png): front, her right side, back, three-quarter;
  // a long lens (nearly flat, as a drawing), the frame about 0.42 m tall about the middle of her head
  head: [
    { name: 'front', q: 'pose=bind&orbit=0,2,2.4,1.47&fov=10' },
    { name: 'side', q: 'pose=bind&orbit=-90,2,2.4,1.47&fov=10' },
    { name: 'back', q: 'pose=bind&orbit=180,2,2.4,1.47&fov=10' },
    { name: 'three', q: 'pose=bind&orbit=-35,8,2.4,1.47&fov=10' },
  ],
  // her body's forms, as grey clay without the dress (docs/V3/plan/character-pv.md §16): the whole of her from four
  // sides, then the trunk, an arm, a leg, the knee and the foot near
  anat: [
    { name: 'front', q: 'pose=bind&dress=0&clay=1&orbit=0,2,3.7,0.84&fov=30' },
    { name: 'side', q: 'pose=bind&dress=0&clay=1&orbit=90,2,3.7,0.84&fov=30' },
    { name: 'back', q: 'pose=bind&dress=0&clay=1&orbit=180,2,3.7,0.84&fov=30' },
    { name: 'three', q: 'pose=bind&dress=0&clay=1&orbit=35,6,3.7,0.86&fov=30' },
    { name: 'three_back', q: 'pose=bind&dress=0&clay=1&orbit=145,6,3.7,0.86&fov=30' },
    { name: 'torso_front', q: 'pose=bind&dress=0&clay=1&orbit=0,4,1.5,1.08&fov=30' },
    { name: 'torso_side', q: 'pose=bind&dress=0&clay=1&orbit=90,4,1.5,1.08&fov=30' },
    { name: 'torso_back', q: 'pose=bind&dress=0&clay=1&orbit=180,4,1.5,1.08&fov=30' },
    { name: 'torso_three', q: 'pose=bind&dress=0&clay=1&orbit=40,8,1.5,1.08&fov=30' },
    { name: 'arm_front', q: 'pose=bind&dress=0&clay=1&orbit=15,2,1.15,1.05&tx=0.3&fov=30' },
    { name: 'arm_out', q: 'pose=bind&dress=0&clay=1&orbit=80,2,1.15,1.05&tx=0.3&fov=30' },
    { name: 'arm_back', q: 'pose=bind&dress=0&clay=1&orbit=165,2,1.15,1.05&tx=0.3&fov=30' },
    { name: 'leg_front', q: 'pose=bind&dress=0&clay=1&orbit=10,2,1.8,0.46&tx=0.08&fov=30' },
    { name: 'leg_side', q: 'pose=bind&dress=0&clay=1&orbit=90,2,1.8,0.46&tx=0.08&fov=30' },
    { name: 'leg_back', q: 'pose=bind&dress=0&clay=1&orbit=170,2,1.8,0.46&tx=0.08&fov=30' },
    { name: 'knee', q: 'pose=bind&dress=0&clay=1&orbit=25,4,0.7,0.46&tx=0.08&fov=30' },
    { name: 'foot_side', q: 'pose=bind&dress=0&clay=1&orbit=80,8,0.6,0.07&tx=0.08&tz=0.02&fov=30' },
    { name: 'foot_top', q: 'pose=bind&dress=0&clay=1&orbit=20,55,0.6,0.05&tx=0.08&tz=0.03&fov=30' },
    { name: 'foot_in', q: 'pose=bind&dress=0&clay=1&orbit=-60,25,0.6,0.07&tx=0.08&tz=0.02&fov=30' },
  ],
  // her right hand held out, as grey clay: back, palm, thumb side, little-finger side, front; relaxed and a fist
  handclay: [
    { name: 'back', q: 'act=hands&one=1&grip=relaxed&clay=1&orbit=0,70,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'palm', q: 'act=hands&one=1&grip=relaxed&clay=1&orbit=0,-70,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'thumb', q: 'act=hands&one=1&grip=relaxed&clay=1&orbit=90,5,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'pinky', q: 'act=hands&one=1&grip=relaxed&clay=1&orbit=-90,5,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'open_back', q: 'act=hands&one=1&grip=open&clay=1&orbit=0,70,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'open_palm', q: 'act=hands&one=1&grip=open&clay=1&orbit=0,-70,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'fist_back', q: 'act=hands&one=1&grip=fist&clay=1&orbit=0,70,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'fist_thumb', q: 'act=hands&one=1&grip=fist&clay=1&orbit=90,5,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'fist_front', q: 'act=hands&one=1&grip=fist&clay=1&orbit=0,8,0.26,1.1&tx=-0.2&tz=0.4&fov=34' },
    { name: 'wrist', q: 'act=hands&one=1&grip=relaxed&clay=1&orbit=35,40,0.36,1.1&tx=-0.25&tz=0.33&fov=34' },
  ],
  close: [
    { name: 'face', q: 'pose=bind&orbit=15,4,0.75,1.48&fov=30' },
    { name: 'hand', q: 'pose=bind&orbit=60,-10,0.55,0.9&fov=30' },
    { name: 'feet', q: 'pose=bind&orbit=20,25,0.9,0.1&fov=30' },
    { name: 'dress_front', q: 'pose=bind&orbit=15,4,1.25,1.0&fov=34' },
    { name: 'dress_back', q: 'pose=bind&orbit=180,8,1.25,1.05&fov=34' },
  ],
};

const args = process.argv.slice(2);
const set = args.find((a) => !a.startsWith('--')) ?? 'turn';
const onlyAt = args.indexOf('--only');
const only = onlyAt >= 0 ? new Set(args[onlyAt + 1].split(',')) : null;
const extra = (args.find((a) => a.startsWith('--q=')) ?? '').slice(4);
const outDir = path.join(ROOT, 'loop/shots/character');
fs.mkdirSync(outDir, { recursive: true });

const { server, url } = await startServer();
const browser = await launchBrowser();
let failed = 0;
try {
  for (const shot of SETS[set] ?? []) {
    if (only && !only.has(shot.name)) continue;
    const t0 = Date.now();
    const { page, errors } = await openGame(browser, `${url}/character.html?shot=1&${shot.q}${extra ? `&${extra}` : ''}`, { width: 900, height: 1100 });
    await page.evaluate(() => window.__rt.render());
    const file = path.join(outDir, `${set}_${shot.name}.png`);
    await page.screenshot({ path: file });
    const tel = await page.evaluate(() => window.__rt.telemetry());
    console.log(`${set}/${shot.name}: ${((Date.now() - t0) / 1000).toFixed(1)} s`, JSON.stringify(tel), errors.length ? errors.slice(0, 3).join(' | ') : '');
    if (errors.length) failed++;
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
