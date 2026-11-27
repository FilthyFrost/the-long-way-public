// F12 (docs/V3/plan/finish.md §十四), in the game as a player has it (a kept game: no ?shot) — the game's shell:
//  - the title: 新游戏, 读取, 设置, 按键, 制作人员;
//  - the new game's card: which of three places, her skin (five) and her helmet (six), how hard, the journey's number;
//    begun into the second place as chosen — the page opens again on it, in that world, at that difficulty, she in
//    those colours, and no title over it;
//  - the game kept: its place's card (the day, the car, how hard, a picture of where one was);
//  - the pause: 存档并回主界面; the page of kept games shows the three, the one gone on with marked;
//  - a second game into the first place: the first game stays in its own; 读取 goes back to it, straight in;
//  - a game out to a file's text and in again into the third place; that place emptied (删除, twice);
//  - a night's older copies: the save garbled, the page opened again goes on from the newer copy and says so;
//  - the settings: the view's width, the mouse's up and down, the seat's shake;
//  - one's own death card: 回主界面.
//   SHOTS_GPU=1 node harness/shots/f12_shell.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/f12_shell');
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
  const { page, errors } = await openGame(browser, `${url}/modcar.html?menu=1&world=7`, { width: 1280, height: 720 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const shot = async (f) => {
    await page.screenshot({ path: path.join(out, f) });
    console.log('shot', f);
  };
  /** the page opening again (a new game, another kept game, back to the title): done by `act`, waited for */
  const reopened = async (act) => {
    await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 180_000 }), act()]);
    await page.waitForFunction(() => window.__rt && window.__rt.ready === true, null, { timeout: 180_000 });
    await page.waitForTimeout(600);
  };
  const state = () =>
    ev(async () => {
      const g = window.__rt.game;
      const S = await import('/src/game/modcar/slots.ts');
      return { slot: S.activeSlot(), has: [0, 1, 2].map((i) => S.slotHasSave(i)), seed: g.params.seed, world: g.params.world, difficulty: g.difficulty, look: g.look, menu: g.menu.isOpen ? g.menu.modeNow : '', played: g.played, playS: Math.round(g.playS) };
    });

  // ---- 1. the title
  const t0 = await ev(() => {
    const has = (a) => !!document.querySelector(`.mc-menu [data-act=${a}]`);
    return { open: window.__rt.game.menu.isOpen, mode: window.__rt.game.menu.modeNow, resume: has('resume'), neu: has('new'), load: has('load'), settings: has('settings'), keys: has('keys'), credits: has('credits'), boot: !!document.getElementById('boot') };
  });
  ok(t0.open && t0.mode === 'title' && !t0.resume && t0.neu && t0.load && t0.settings && t0.keys && t0.credits && !t0.boot, `the title over a game not begun: 新游戏, 读取, 设置, 按键, 制作人员 — no 继续; the page's own "loading" gone (${JSON.stringify(t0)})`);
  await shot('01_title.png');
  await page.click('.mc-menu [data-act=credits]');
  const cr = await ev(() => document.querySelector('.mc-menu .credits')?.textContent ?? '');
  ok(cr.includes('Painted Valley') && cr.includes('CC0') && cr.includes('Engine Simulator') && cr.includes('three.js'), 'the makers\' page names what is others\': the way of painting, the clips, the engines\' recorder, the renderer');
  await shot('02_credits.png');

  // ---- 2. the new game's card
  await page.click('.mc-menu [data-act=new]');
  const card0 = await ev(() => ({ places: document.querySelectorAll('.mc-menu [data-place]').length, on: document.querySelector('.mc-menu .place.on')?.getAttribute('data-place'), skins: document.querySelectorAll('.mc-menu [data-skin]').length, helmets: document.querySelectorAll('.mc-menu [data-helmet]').length, diffs: document.querySelectorAll('.mc-menu [data-diff]').length, trip: !!document.querySelector('.mc-menu [data-text=trip]'), warn: !!document.querySelector('.mc-menu .warn') }));
  ok(card0.places === 3 && card0.on === '0' && card0.skins === 5 && card0.helmets === 6 && card0.diffs === 3 && card0.trip && !card0.warn, `the new game's card: three places (the first, empty, chosen), five skins, six helmets, three difficulties, the journey's number (${JSON.stringify(card0)})`);
  await page.click('.mc-menu [data-place="1"]');
  await page.click('.mc-menu [data-skin="3"]');
  await page.click('.mc-menu [data-helmet="4"]');
  await page.click('.mc-menu [data-diff=hard]');
  await page.fill('.mc-menu [data-text=trip]', '12345');
  await shot('03_new_game.png');
  await reopened(() => page.click('.mc-menu [data-act=begin]'));
  const s1 = await state();
  ok(s1.slot === 1 && s1.seed === 12345 && s1.world === 7 && s1.difficulty === 'hard' && s1.look.skin === 3 && s1.look.helmet === 4 && s1.menu === '' && s1.played, `开始: the page opened again on the second place — journey 12345 of a world of version 7, hard, she as chosen, no title over it (${JSON.stringify(s1)})`);
  const her = await ev(async () => {
    const g = window.__rt.game;
    const L = await import('/src/game/character/looks.ts');
    for (let i = 0; i < 200 && !g.her.ready; i++) await new Promise((r) => setTimeout(r, 100));
    if (!g.her.ready) return { ready: false };
    const u = g.her.rig.skin.uniforms.uLit.value;
    const a = g.her.rig.arms.l.material.uniforms.uLit.value;
    const h = g.her.rig.helmet?.material.uniforms;
    const near = (c, d) => Math.abs(c.r - d.r) + Math.abs(c.g - d.g) + Math.abs(c.b - d.b) < 1e-4;
    return { ready: true, skin: near(u, L.SKINS[3].paint.lit), arms: near(a, L.SKINS[3].paint.lit), helmet: h ? near(h.uShellLit.value, L.HELMETS[4].shellLit) && near(h.uStripe.value, L.HELMETS[4].stripe) : null };
  });
  ok(her.ready && her.skin && her.arms && her.helmet !== false, `she is drawn in them: her skin, her arms' own, her helmet's shell and stripe (${JSON.stringify(her)})`);

  // ---- 3. the game kept: its place's card
  await page.waitForTimeout(2500);
  const kept = await ev(async () => {
    const g = window.__rt.game;
    const S = await import('/src/game/modcar/slots.ts');
    g.save();
    await new Promise((r) => setTimeout(r, 400));
    const m = S.slotMeta(1);
    return { has: S.slotHasSave(1), first: S.slotHasSave(0), key: !!localStorage.getItem('modcar.save.v1.s2'), meta: m ? { ...m, shot: m.shot ? `${m.shot.slice(0, 22)}… (${m.shot.length})` : null } : null };
  });
  ok(kept.has && kept.key && !kept.first && !!kept.meta && kept.meta.day === 1 && kept.meta.difficulty === '艰苦' && !!kept.meta.car && !!kept.meta.shot && kept.meta.shot.startsWith('data:image/jpeg'), `kept: the second place has the game (the first none), its card the day, the car, how hard and a picture (${JSON.stringify(kept)})`);

  // ---- 4. the pause: 存档并回主界面; the page of kept games
  await ev(() => window.__rt.menu('pause'));
  const p0 = await ev(() => ({ title: !!document.querySelector('.mc-menu [data-act=title]'), neu: !!document.querySelector('.mc-menu [data-act=new]'), resume: !!document.querySelector('.mc-menu [data-act=resume]') }));
  ok(p0.title && !p0.neu && p0.resume, `the pause: 继续 and 存档并回主界面 (a new game is the title's) (${JSON.stringify(p0)})`);
  await shot('04_pause.png');
  await reopened(() => page.click('.mc-menu [data-act=title]'));
  // (the harness's page shows no title by itself once its address has lost ?menu=1: asked for)
  await ev(() => window.__rt.menu('title'));
  const t1 = await ev(() => ({ resume: document.querySelector('.mc-menu [data-act=resume]')?.textContent ?? '', seed: window.__rt.game.params.seed }));
  ok(t1.resume.includes('继续游戏') && t1.resume.includes('艰苦') && t1.seed === 12345, `back at the title, the game kept: 继续游戏 with its line (${JSON.stringify(t1)})`);
  await page.click('.mc-menu [data-act=load]');
  const l0 = await ev(() => [...document.querySelectorAll('.mc-menu .game')].map((g) => ({ on: g.classList.contains('on'), text: g.querySelector('.txt')?.textContent ?? '', pic: (g.querySelector('.pic')?.getAttribute('style') ?? '').includes('data:image'), acts: [...g.querySelectorAll('.do span')].map((s) => s.textContent) })));
  ok(l0.length === 3 && l0[1].on && l0[1].pic && l0[1].text.includes('现在这个') && l0[1].acts.join('') === '继续导出导入删除' && l0[0].text.includes('空的') && l0[0].acts.join('') === '导入' && l0[2].text.includes('空的'), `读取: the three places — the second the one gone on with, its picture and its line; the others empty (${JSON.stringify(l0.map((g) => g.text))})`);
  await shot('05_load.png');

  // ---- 5. a second game into the first place; the first game stays
  await page.click('.mc-menu [data-act=new]');
  const card1 = await ev(() => ({ on: document.querySelector('.mc-menu .place.on')?.getAttribute('data-place'), warn: !!document.querySelector('.mc-menu .warn') }));
  ok(card1.on === '0' && !card1.warn, `a new game's place is the first empty one by itself (${JSON.stringify(card1)})`);
  await page.click('.mc-menu [data-place="1"]');
  const warned = await ev(() => document.querySelector('.mc-menu .warn')?.textContent ?? '');
  ok(warned.includes('清掉'), `a place with a game in it chosen: said that it will be cleared (${warned})`);
  await page.click('.mc-menu [data-place="0"]');
  await reopened(() => page.click('.mc-menu [data-act=begin]'));
  await page.waitForTimeout(1500);
  await ev(() => window.__rt.game.save());
  const s2 = await state();
  ok(s2.slot === 0 && s2.has[0] && s2.has[1] && s2.difficulty === 'normal' && s2.look.skin === 0 && s2.seed !== 12345, `a second game begun into the first place (she as she was made, the normal difficulty, a journey of its own): both places have their games (${JSON.stringify(s2)})`);
  // 读取 the second place again: straight into it
  await ev(() => window.__rt.menu('title', 'load'));
  await reopened(() => page.click('.mc-menu [data-load="1"]'));
  const s3 = await state();
  ok(s3.slot === 1 && s3.seed === 12345 && s3.difficulty === 'hard' && s3.menu === '' && s3.played, `读取 on the second place: the page opened again straight into that game (${JSON.stringify(s3)})`);

  // ---- 6. out to a file's text and in again; a place emptied
  const moved = await ev(async () => {
    const S = await import('/src/game/modcar/slots.ts');
    const text = S.exportSlot(1);
    const bad = S.importSlot(2, '{"not":"a save"}');
    const why = text ? S.importSlot(2, text) : 'nothing to hand out';
    return { bytes: text?.length ?? 0, kind: text ? JSON.parse(text).kind : '', bad, why, has: [0, 1, 2].map((i) => S.slotHasSave(i)), meta: !!S.slotMeta(2) };
  });
  ok(moved.bytes > 1000 && moved.kind === 'the-long-way-save' && moved.bad === '这不是一个存档文件' && moved.why === null && moved.has.every(Boolean) && moved.meta, `the second place's game as a file's text (${moved.bytes} characters) read into the third: three games; what is no save is refused (${JSON.stringify(moved)})`);
  await ev(() => window.__rt.menu('title', 'load'));
  await page.click('.mc-menu [data-del="2"]');
  const armed = await ev(() => ({ text: document.querySelector('.mc-menu [data-del="2"]')?.textContent ?? '', has: !!localStorage.getItem('modcar.save.v1.s3') }));
  await page.click('.mc-menu [data-del="2"]');
  const gone = await ev(() => ({ has: !!localStorage.getItem('modcar.save.v1.s3'), cards: [...document.querySelectorAll('.mc-menu .game .txt')].map((t) => t.textContent), note: document.querySelector('.mc-menu .note')?.textContent ?? '' }));
  ok(armed.text === '再点一次删除' && armed.has && !gone.has && gone.cards[2].includes('空的') && gone.note.includes('清空'), `删除 asks once more, then the third place is empty (${JSON.stringify({ armed, gone })})`);

  // ---- 7. a night's older copies: the save garbled, the newer copy read
  const backup = await ev(async () => {
    const g = window.__rt.game;
    const S = await import('/src/game/modcar/slots.ts');
    g.menu.close();
    g.play();
    g.save();
    S.rotateBackups();
    g.save();
    S.rotateBackups();
    const both = !!localStorage.getItem(S.backupKeyOf(1)) && !!localStorage.getItem(S.backupKeyOf(2));
    g.saveOff = true;
    localStorage.setItem(S.saveKeyOf(), '{"v":1,"vehicles":[{"cut short');
    return { both };
  });
  await reopened(() => ev(() => location.reload()));
  const s4 = await state();
  const said = await ev(async () => {
    for (let i = 0; i < 40; i++) {
      if (document.body.innerText.includes('备份')) return true;
      await new Promise((r) => setTimeout(r, 150));
    }
    return false;
  });
  ok(backup.both && s4.slot === 1 && s4.seed === 12345 && s4.difficulty === 'hard' && s4.has[1] && said, `two older copies after two nights; the save cut short: the page goes on from the newer copy (journey 12345, hard) and says so (${JSON.stringify({ backup, s4, said })})`);

  // ---- 8. the settings
  const set = await ev(async () => {
    const g = window.__rt.game;
    g.play();
    await new Promise((r) => setTimeout(r, 300));
    const fov0 = g.core.camera.fov;
    const host = g.menuHost();
    host.setSettings({ ...host.settings(), fov: 12, invertY: true, shake: 0.5 });
    await new Promise((r) => setTimeout(r, 300));
    const fov1 = g.core.camera.fov;
    const p0 = g.input.lookPitch;
    g.input.turn(0, 40);
    const down = g.input.lookPitch - p0;
    const kept = JSON.parse(localStorage.getItem('modcar.settings'));
    host.setSettings({ ...host.settings(), fov: 0, invertY: false, shake: 1 });
    g.input.lookPitch = p0;
    g.input.turn(0, 40);
    const up = g.input.lookPitch - p0;
    g.input.lookPitch = p0;
    window.__rt.menu('title', 'settings');
    const rows = [...document.querySelectorAll('.mc-menu .card .row label')].map((l) => l.textContent);
    return { fov0: +fov0.toFixed(1), fov1: +fov1.toFixed(1), down: +down.toFixed(3), up: +up.toFixed(3), kept: { fov: kept.fov, invertY: kept.invertY, shake: kept.shake }, rows };
  });
  ok(Math.abs(set.fov1 - set.fov0 - 12) < 0.6 && set.down > 0 && set.up < 0 && set.kept.fov === 12 && set.kept.invertY === true && set.kept.shake === 0.5 && ['视野', '镜头晃动', '鼠标上下反转', '全屏'].every((r) => set.rows.includes(r)), `the settings: the view twelve degrees wider, the mouse's up and down turned over, the seat's shake halved — kept in the browser; their rows on the page (${JSON.stringify(set)})`);
  await shot('06_settings.png');

  // ---- 9. one's own death card
  const dead = await ev(async () => {
    const g = window.__rt.game;
    g.menu.close();
    g.play();
    g.player.slots.fill(null);
    g.body.life = 0;
    g.body.dead = true;
    for (let i = 0; i < 60 && !g.death?.open; i++) await new Promise((r) => setTimeout(r, 100));
    return { open: !!g.death?.open, title: document.querySelector('.mc-death h2')?.textContent ?? '', alt: document.querySelector('.mc-death button.alt')?.textContent ?? '' };
  });
  ok(dead.open && dead.title === '你倒下了' && dead.alt.includes('回主界面'), `fallen: 你倒下了 — the points to go on from, and 回主界面 (${JSON.stringify(dead)})`);
  await shot('07_fallen.png');

  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  const real = errors.filter((e) => !/favicon|net::ERR_ABORTED/.test(e));
  if (real.length) fail(`page errors: ${real.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `f12_shell: ${bad} FAILED` : 'f12_shell: ok');
process.exit(bad ? 1 : 0);
