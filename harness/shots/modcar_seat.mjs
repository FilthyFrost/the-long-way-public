// The first-person feel (docs/MODCAR.md §23), in the game:
//  1. a pickup driven over the desert's sand: a cloud of dust behind it, its tyres heard on sand;
//  2. on the asphalt road beside it: no dust, the seat's shake a fine buzz, the tyres heard on asphalt, muffled by the cab;
//  3. the sand wet through: no dust off it either;
//  4. over the plains' grass: the seat shaking much harder than on the road, the tyres heard on grass;
//  5. at idle: a single-cylinder motorcycle shakes more than the six of the camper.
// (what the tyres would sound like is read off the telemetry: the probe never starts the sound)
//   SHOTS_GPU=1 node harness/shots/modcar_seat.mjs
import { launchBrowser, startServer } from './lib.mjs';

const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const shot = async (name) => {
    await page.evaluate(async () => {
      const g = window.__rt.game;
      g.ui.showHelp(false);
      await Promise.all(g.vehicles.map((v) => v.view.settled()));
      for (let i = 0; i < 3; i++) window.__rt.render();
    });
    await page.screenshot({ path: `loop/shots/modcar_seat_${name}.png` });
  };
  await page.goto(`${url}/modcar.html?new=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 240000 });
  await rt('setHour', 11);
  await rt('setWeather', 'clear');
  await rt('devDial', 'ground.wet', 0);
  const builds = await rt('builds');
  const vi = builds.findIndex((b) => b.startsWith('pickup') || b.startsWith('stock:pickup'));
  await rt('setBuild', vi, 'stock:pickup');
  await rt('setOrbit', 0, 10, 6, 0.8, vi);
  console.log(await rt('devGo', 'desert', true));
  for (let k = 0; k < 20; k++) await rt('simulate', 0.25);
  // where the road is: the vehicle stands on its verge facing down it
  const road = await page.evaluate((i) => {
    const v = window.__rt.game.vehicles[i];
    const b = new Float64Array(9);
    v.sim.basis(b);
    const l = Math.hypot(b[0], b[2]);
    return { x: v.sim.px, z: v.sim.pz, fx: b[0] / l, fz: b[2] / l, yaw: -Math.atan2(b[2], b[0]) };
  }, vi);
  // drive a while, then a couple of seconds more reading how it feels (the seat's shake, the dust, what the wheels are on)
  const feel = async (secs, throttle) => {
    const out = { road: 0, engine: 0, live: 0, kmh: 0, surfaces: [], tyres: [] };
    const t0 = (await rt('telemetry')).dust.thrown;
    const seen = new Set();
    for (let t = 0; t < secs; t += 0.25) {
      const d = await rt('drive', 0.25, throttle, 0, 0);
      const tl = await rt('telemetry');
      out.road = Math.max(out.road, tl.shake.road);
      out.engine = Math.max(out.engine, tl.shake.engine);
      out.live = Math.max(out.live, tl.dust.live);
      out.kmh = d?.kmh ?? 0;
      out.tyres = tl.tyres;
      for (const s of await page.evaluate(() => window.__rt.game.seated.sim.wheels.filter((w) => w.contact).map((w) => w.surface))) seen.add(s);
    }
    out.thrown = (await rt('telemetry')).dust.thrown - t0;
    out.surfaces = [...seen];
    return out;
  };
  const SAND = 4;
  const ASPHALT = 0;

  // 1. out on the sand, thirty metres off the road, along it
  await rt('placeVehicle', vi, road.x - road.fz * 30, road.z + road.fx * 30, road.yaw);
  await rt('enter', vi);
  await rt('setView', 'cockpit');
  await rt('crank', 2.0);
  await rt('drive', 5, 1, 0, 0);
  const sand = await feel(2.5, 1);
  console.log('sand', JSON.stringify(sand));
  if (!sand.surfaces.includes(SAND)) fail(`the wheels were not on sand (${sand.surfaces})`);
  if (sand.live < 30) fail(`hardly any dust behind it on the sand (${sand.live} puffs)`);
  if (!sand.tyres.some((t) => t.startsWith('roll_sand'))) fail(`the tyres are not heard on the sand (${sand.tyres})`);
  await rt('setOrbit', 200, 9, 12, 1.0, vi);
  await shot('sand_cloud');
  await rt('setView', 'cockpit');

  // 2. on the road: the lane's middle, a metre in from where it stood
  await rt('placeVehicle', vi, road.x + road.fz * 1.0, road.z - road.fx * 1.0, road.yaw);
  await rt('drive', 4, 0.6, 0, 0);
  const tar = await feel(2.5, 0.6);
  console.log('asphalt', JSON.stringify(tar));
  if (tar.surfaces.some((s) => s !== ASPHALT)) console.log('(a wheel off the asphalt:', tar.surfaces, ')');
  else if (tar.thrown > 0) fail(`dust came off the asphalt (${tar.thrown} puffs)`);
  if (!(tar.road > 0)) fail('the seat does not buzz at all on the road');
  if (!tar.tyres.some((t) => /^roll_asphalt:[\d.]+@1200$/.test(t))) fail(`the tyres are not heard on the asphalt through a shut cab (${tar.tyres})`);

  // 3. the sand wet through
  await rt('devDial', 'ground.wet', 1);
  await rt('simulate', 0.5);
  await rt('placeVehicle', vi, road.x - road.fz * 30, road.z + road.fx * 30, road.yaw);
  await rt('drive', 4, 0.6, 0, 0);
  const wet = await feel(2.5, 0.6);
  console.log('wet sand', JSON.stringify(wet));
  if (wet.thrown > 0) fail(`dust came off wet sand (${wet.thrown} puffs)`);
  await rt('devDial', 'ground.wet', 0);
  await rt('simulate', 0.5);

  // 4. over the plains' grass, thirty metres off the road
  await rt('drive', 1, 0, 0, 1);
  await rt('setOrbit', 0, 10, 6, 0.8, vi);
  console.log(await rt('devGo', 'plains', true));
  for (let k = 0; k < 20; k++) await rt('simulate', 0.25);
  const plain = await page.evaluate((i) => {
    const v = window.__rt.game.vehicles[i];
    const b = new Float64Array(9);
    v.sim.basis(b);
    const l = Math.hypot(b[0], b[2]);
    return { x: v.sim.px, z: v.sim.pz, fx: b[0] / l, fz: b[2] / l, yaw: -Math.atan2(b[2], b[0]) };
  }, vi);
  await rt('placeVehicle', vi, plain.x - plain.fz * 30, plain.z + plain.fx * 30, plain.yaw);
  await rt('enter', vi);
  await rt('setView', 'cockpit');
  await rt('crank', 2.0);
  await rt('drive', 5, 0.8, 0, 0);
  const grass = await feel(2.5, 0.8);
  console.log('grass', JSON.stringify(grass));
  if (!grass.surfaces.includes(3)) console.log('(not on grass:', grass.surfaces, ')');
  else if (!(grass.road > tar.road * 1.5)) fail(`the seat shook no harder over grass than on the road (${grass.road} vs ${tar.road})`);
  if (grass.surfaces.includes(3) && !grass.tyres.some((t) => t.startsWith('roll_grass'))) fail(`the tyres are not heard on the grass (${grass.tyres})`);

  // 5. the engine at idle: a single's cab shakes more than a six's (the motorcycle against the van)
  await rt('drive', 1, 0, 0, 1);
  const idleOf = async (i, frame) => {
    await rt('exit');
    await rt('setBuild', i, `stock:${frame}`);
    await rt('placeVehicle', i, plain.x + plain.fx * 15 + plain.fz * 1.0, plain.z + plain.fz * 15 - plain.fx * 1.0, plain.yaw);
    await rt('enter', i);
    await rt('setView', 'cockpit');
    await rt('crank', 2.5);
    let e = 0;
    for (let k = 0; k < 6; k++) {
      await rt('drive', 0.2, 0, 0, 1);
      e = Math.max(e, (await rt('telemetry')).shake.engine);
    }
    return e;
  };
  const mi = builds.findIndex((b) => b.startsWith('moto') || b.startsWith('stock:moto'));
  const ri = builds.findIndex((b) => b.startsWith('rv') || b.startsWith('stock:rv'));
  const single = await idleOf(mi, 'moto');
  const six = await idleOf(ri, 'rv');
  console.log('idle shake', JSON.stringify({ single, six }));
  if (!(single > six * 3)) fail(`a single at idle shakes no more than a six (${single} vs ${six})`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
} catch (e) {
  fail(String(e?.stack ?? e));
} finally {
  await browser.close();
  server.close();
}
console.log(bad ? `modcar_seat: ${bad} FAILED` : 'modcar_seat: ok');
process.exit(bad ? 1 : 0);
