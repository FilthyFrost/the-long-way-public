// The ModCar sounds in the game (muted Chrome: nothing reaches a speaker): start the audio, drive, rev,
// fit a part in the garage, and report what the engine voice says it is doing and any page errors.
//   node harness/shots/modcar_audio_probe.mjs
import { launchBrowser, openGame, startServer } from './lib.mjs';

const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
try {
  // real time (the main loop runs; the audio clock moves with it): idle, full throttle, lift off
  for (const q of ['start=road&build=stock:sedan&seed=7&s=3180', 'start=road&build=stock:moto%3Bengine%3Deng_v8%3Bexhaust%3Dexh_side&seed=7&s=3180']) {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?${q}`, { width: 640, height: 360 });
    const out = await page.evaluate(async () => {
      const rt = window.__rt;
      const g = rt.game;
      g.audio.start();
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const sample = () => {
        const d = g.voice?.debug?.();
        const v = g.seated;
        return { rpm: Math.round(v?.sim.rpm ?? 0), kmh: Math.round(v?.sim.kmh ?? 0), top: d ? [...d.slots].sort((a, b) => b.gain - a.gain).slice(0, 3).map((x) => `${x.file}:${x.gain.toFixed(3)}`) : null };
      };
      const res = {};
      await wait(2500);
      res.idle = sample();
      g.seated.sim.setParkBrake(false);
      g.scripted = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
      await wait(3000);
      res.full = sample();
      g.scripted = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
      await wait(1200);
      res.overrun = sample();
      g.scripted = null;
      // the radio, if the build has one: switch it on, listen, change station
      if (g.seated.sys.hasPart('radio')) {
        const level = async () => {
          const an = g.audio.context.createAnalyser();
          an.fftSize = 2048;
          g.radio.out.connect(an);
          await wait(250);
          const buf = new Float32Array(an.fftSize);
          an.getFloatTimeDomainData(buf);
          g.radio.out.disconnect(an);
          return Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
        };
        g.seated.radioOn = true;
        await wait(1500);
        res.radio = { song: g.radio?.songNow, gain: +(g.radio?.out.gain.value ?? 0).toFixed(3), rms: +(await level()).toFixed(4) };
        g.seated.radioSong = 2;
        await wait(1200);
        res.radio2 = { song: g.radio?.songNow, rms: +(await level()).toFixed(4) };
        g.seated.radioOn = false;
        await wait(600);
        res.radioOff = { song: g.radio?.songNow, rms: +(await level()).toFixed(4) };
      }
      res.ctx = g.audio.context?.state;
      return res;
    });
    console.log(q);
    console.log('  ctx', out.ctx);
    for (const k of ['idle', 'full', 'overrun', 'radio', 'radio2', 'radioOff']) if (out[k]) console.log(`  ${k.padEnd(8)}`, JSON.stringify(out[k]));
    if (out.radio && !(out.radio.rms > 0.005 && out.radio2.song === 2 && out.radioOff.rms < out.radio.rms / 4)) {
      bad++;
      console.log('  the radio is not heard as it should be');
    }
    if (errors.length) {
      bad++;
      console.log('  errors', errors.slice(0, 4));
    }
    await page.close();
  }
  // the garage: a fit with the wrench, a door
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1`, { width: 640, height: 360 });
  const r = await page.evaluate(async () => {
    const rt = window.__rt;
    const g = rt.game;
    g.audio.start();
    await new Promise((res) => setTimeout(res, 300));
    rt.pickUp('bat_std');
    rt.aim(0, 'battery', 1.4);
    rt.useFor(1.6);
    return { loops: [...g.loopsOn], foley: !!g.foley, held: rt.telemetry().held };
  });
  console.log('garage', JSON.stringify(r));
  if (errors.length) {
    bad++;
    console.log('  errors', errors.slice(0, 4));
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(bad ? 1 : 0);
