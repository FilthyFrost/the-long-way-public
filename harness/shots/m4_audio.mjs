// Milestone M4, the sound archive in the game (docs/V3/nodes/M4-audio.md), through a muted Chrome (nothing reaches a
// speaker: what plays is read back from the game, and the developer's tab 声音 is pictured):
//   1. the archive answers: its table of cues, its recordings coming in
//   2. out of the car: its door and the seat from the archive; walking off: footfalls on what is underfoot
//   3. a thing picked up and set down, by its weight, from the archive
//   4. the radio: a station of the archive's songs on air, streamed, its name and song on the dial; another station
//   5. the country's beds by day and by night; a storm's rain and wind from the archive (the synthesized rain silent); thunder
//   6. ?archive=0: the game's own synthesized sounds, as before (the radio's own song, no footsteps)
//   SHOTS_GPU=1 node harness/shots/m4_audio.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/m4_audio');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const ok = (cond, why) => (cond ? console.log('ok  ', why) : fail(why));
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const status = () => page.evaluate(() => window.__rt.game.soundStatus());
  const played = async (re) => Object.entries((await status()).played).filter(([k]) => re.test(k)).reduce((n, [, v]) => n + v, 0);
  // (real time goes by for the audio: the frames are stepped by hand meanwhile)
  const live = async (seconds) => {
    for (let t = 0; t < seconds; t += 0.25) {
      await rt('simulate', 0.25);
      await page.waitForTimeout(250);
    }
  };
  const shot = async (name) => {
    await page.evaluate(async () => {
      const g = window.__rt.game;
      g.ui.showHelp(false);
      for (let i = 0; i < 300 && (g.worldView?.pending ?? 0) > 0; i++) {
        g.worldView.update(g.player.walker.x, g.player.walker.z, 40);
        await new Promise((r) => setTimeout(r, 0));
      }
      for (let i = 0; i < 2; i++) window.__rt.render();
    });
    await page.screenshot({ path: path.join(out, `${name}.png`) });
  };
  await page.goto(`${url}/modcar.html?new=1&shot=1&world=2&start=road&build=stock:sedan`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 240000 });
  await rt('setHour', 11);
  await rt('setWeather', 'clear');

  // ---- 1. the archive answers, its recordings come in
  await page.evaluate(() => window.__rt.game.audio.start());
  await rt('simulate', 0.1);
  // (the recordings fetched first: the car's body, things in the hands, the feet; a few seconds in play, longer here)
  await page.waitForFunction(() => window.__rt.game.soundStatus().decoded >= 200, null, { timeout: 120000 }).catch(() => null);
  const s0 = await status();
  ok(s0.live && s0.on && s0.cues >= 80, `the archive answers (${s0.cues} cues)`);
  ok(s0.decoded >= 200 && s0.failed === 0, `its recordings come in (${s0.decoded} decoded, ${s0.failed} failed)`);

  // ---- 2. out of the car, and walking off
  const seated = await page.evaluate(() => !!window.__rt.game.seated);
  if (!seated) await rt('enter', 0);
  const d0 = await played(/^door_close$/);
  const o0 = await played(/^car_getout$/);
  await rt('exit');
  ok((await played(/^door_close$/)) > d0, 'getting out: the car door shuts, recorded');
  ok((await played(/^car_getout$/)) > o0, 'getting out: the seat, recorded');
  // (along the road past the car, then off it across the verge)
  const footing = (await status()).footing;
  const st0 = await played(/^step:/);
  await page.keyboard.down('KeyW');
  await live(2);
  await page.keyboard.up('KeyW');
  const onRoad = (await played(/^step:/)) - st0;
  await page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.vehicles[0];
    const h = g.input.lookYaw;
    const w = g.player.walker;
    // (the road's way is the way one looks after getting out: off it at a right angle, the far side from the car)
    const side = Math.cos(h + Math.PI / 2) * (v.sim.px - w.x) + Math.sin(h + Math.PI / 2) * (v.sim.pz - w.z) > 0 ? -1 : 1;
    const away = g.input.lookYaw + (side * Math.PI) / 2;
    window.__rt.stand(w.x + Math.cos(away) * 7, w.z + Math.sin(away) * 7, away, 0);
  });
  const st1 = await played(/^step:/);
  const footing1 = (await status()).footing;
  await page.keyboard.down('KeyW');
  await live(2);
  await page.keyboard.up('KeyW');
  const offRoad = (await played(/^step:/)) - st1;
  const footing2 = (await status()).footing;
  ok(onRoad >= 3 && offRoad >= 3, `walking: ${onRoad} footfalls on ${footing}, then ${offRoad} off the road (${footing1} → ${footing2})`);
  ok(footing === 'concrete' && footing2 !== 'concrete', 'the road hard underfoot, the verge not');
  await shot('1_on_foot');
  // a jump: its push off and its landing
  const j0 = await played(/^(jump|land)/);
  await page.keyboard.down('Space');
  await live(0.5);
  await page.keyboard.up('Space');
  await live(1);
  ok((await played(/^(jump|land)/)) >= j0 + 2, 'a jump: its push off and its landing, recorded');

  // ---- 3. things picked up and set down, by their weight
  const p0 = await played(/^part_(pickup|setdown):/);
  await page.evaluate(() => {
    const g = window.__rt.game;
    g.sound('pickup', 0.4);
    g.sound('putdown', 6);
    g.sound('pickup', 30);
  });
  const st = await status();
  ok((await played(/^part_(pickup|setdown):/)) >= p0 + 3 && st.played['part_pickup:light'] && st.played['part_setdown:medium'] && st.played['part_pickup:heavy'], 'things picked up and set down by their weight, recorded (light, medium, heavy)');

  // ---- 4. the radio
  await rt('enter', 0);
  await page.evaluate(() => {
    const v = window.__rt.game.seated;
    v.radioOn = true;
    v.radioSong = 2;
  });
  await live(4);
  const r1 = (await status()).radio;
  const table = await page.evaluate(() => fetch('/audio-archive/__cues.json').then((r) => r.json()));
  const of = (i, song) => table.stations[i].songs.some((s) => s.file.endsWith(song));
  ok(r1?.mode === 'archive' && r1.station === 2 && of(2, r1.song), `the radio on: station 3's song (${r1?.song})`);
  ok(r1 && r1.at > 0.5 && !r1.paused, `streaming, on air (${r1?.at.toFixed(1)} s in)`);
  const label = (await status()).station;
  ok(/公路摇滚 · ./.test(label), `the dial says the station and what is on (「${label}」)`);
  await rt('devTab', 'sound');
  await live(0.5);
  await shot('2_radio');
  await page.evaluate(() => {
    window.__rt.game.seated.radioSong = 1;
  });
  await live(3);
  const r2 = (await status()).radio;
  ok(r2?.mode === 'archive' && r2.station === 1 && of(1, r2.song) && r2.at > 0, `another station: the classical one's song (${r2?.song})`);
  await page.evaluate(() => {
    window.__rt.game.seated.radioOn = false;
  });
  await live(0.5);
  ok((await status()).radio?.mode === 'off', 'the radio off');
  await rt('exit');

  // ---- 5. the country by day and by night; a storm
  await live(4);
  const day = (await status()).beds;
  const dayOn = Object.entries(day).filter(([k, b]) => /^bed:day/.test(k) && b.playing && b.gain > 1e-4);
  ok(dayOn.length > 0, `by day, the country's bed (${dayOn.map(([k, b]) => `${k} ${(20 * Math.log10(b.gain)).toFixed(0)} dB`).join(', ')})`);
  const rms = await page.evaluate(() => window.__rt.game.audio.rms());
  ok(rms > 1e-4, `heard on the output (RMS ${rms.toFixed(5)})`);
  await rt('setWeather', 'storm');
  await live(5);
  const storm = await status();
  const rain = storm.beds['bed:rain_heavy'] ?? storm.beds['bed:rain_light'];
  ok(rain?.playing && rain.gain > 1e-4, `a storm: the rain from the archive (heavy ${storm.beds['bed:rain_heavy']?.gain.toFixed(4)}, light ${storm.beds['bed:rain_light']?.gain.toFixed(4)})`);
  ok(await page.evaluate(() => window.__rt.game.audio.replaced.rain === true), 'the synthesized rain silent meanwhile');
  const windy = Object.entries(storm.beds).filter(([k, b]) => /wind|blizzard/.test(k) && b.gain > 1e-4);
  ok(windy.length > 0, `and its wind (${windy.map(([k]) => k).join(', ')})`);
  await page.evaluate(() => window.__rt.game.soundTest('thunder'));
  await live(2);
  await page.evaluate(() => window.__rt.game.soundTest('thunder'));
  await live(0.5);
  ok((await status()).thunders >= 1, `thunder rolled (${(await status()).thunders})`);
  await shot('3_storm');
  await rt('setWeather', 'clear');
  await rt('setHour', 23);
  await live(5);
  const night = (await status()).beds;
  const nightOn = Object.entries(night).filter(([k, b]) => /^bed:night/.test(k) && b.playing && b.gain > 1e-4);
  ok(nightOn.length > 0, `by night, the country's night (${nightOn.map(([k]) => k).join(', ')})`);
  await shot('4_night');
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);

  // ---- 6. without the archive: the game's own sounds
  const page2 = await ctx.newPage();
  const errors2 = [];
  page2.on('pageerror', (e) => errors2.push(String(e)));
  await page2.goto(`${url}/modcar.html?new=1&shot=1&world=2&start=road&build=stock:sedan&archive=0`, { waitUntil: 'domcontentloaded' });
  await page2.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 240000 });
  await page2.evaluate(() => window.__rt.game.audio.start());
  await page2.evaluate(() => window.__rt.simulate(0.2));
  await page2.waitForTimeout(1500);
  await page2.evaluate(() => {
    const g = window.__rt.game;
    if (!g.seated) window.__rt.enter(0);
    g.seated.radioOn = true;
    g.seated.radioSong = 0;
    window.__rt.simulate(0.5);
  });
  const s2 = await page2.evaluate(() => window.__rt.game.soundStatus());
  ok(!s2.live && s2.radio?.mode === 'synth' && Object.keys(s2.played).length === 0, `?archive=0: the game's own sounds (the radio's own song: ${s2.radio?.song})`);
  if (errors2.length) fail(`page errors without the archive: ${errors2.slice(0, 3).join(' | ')}`);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `${bad} FAILED` : 'all passed');
process.exit(bad ? 1 : 0);
