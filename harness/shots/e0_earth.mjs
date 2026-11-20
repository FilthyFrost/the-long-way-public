// Milestone E0 (docs/V3/nodes/E0-earth-rules.md): the journey sheet — the emergent Earth's places as the director
// lays them for a few seeds, each a card (its name, what it is, its belts up the slopes, its rock's colours, its
// water, its month, the moment the road is laid to show) with a painted postcard drawn from its data alone (not
// the game's picture: the world draws them from E1), and each journey's profile over 400 km.
//
//   node harness/shots/e0_earth.mjs                → loop/shots/e0_earth/sheet.html and its pictures
//   SEEDS=7,2026 node harness/shots/e0_earth.mjs    → other journeys
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/e0_earth');
fs.mkdirSync(out, { recursive: true });
const SEEDS = (process.env.SEEDS ?? '7,2331,2026').split(',').map(Number);
const N = 80;

const { server } = await startServer();
let html = '';
const sections = [];
try {
  const D = await server.ssrLoadModule('/src/core/earth/director.ts');
  const C = await server.ssrLoadModule('/src/core/earth/climate.ts');
  const L = await server.ssrLoadModule('/src/core/earth/look.ts');
  const R = await server.ssrLoadModule('/src/core/earth/rocks.ts');
  const K = await server.ssrLoadModule('/src/core/earth/kinds.ts');

  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
  const VEG = { deepgreen: '#2f5f3e', green: '#4f8f45', fresh: '#93c35a', teal: '#3e7d76', olive: '#8d9150', grey: '#a3ab94', gold: '#d9b45e', autumn: '#c96a3e', blossom: '#f0b9c8', brown: '#8a6a4a', white: '#eef3f6', purple: '#9a7cbc', none: '#c9c2b0' };
  const SKY = (m, look) => {
    if (look.sig.snow) return ['#cfdbe6', '#eef2f4'];
    const t = C.warmthAt(m, m.base);
    const w = C.wetnessAt(m, m.base);
    if (w < 0.18) return t > 12 ? ['#e9c89a', '#f6e6c8'] : ['#c9cfd6', '#ece6da'];
    if (look.efg.weather?.fog > 0.45) return ['#b8c6c8', '#e2e8e4'];
    if (t > 20) return ['#7fb6c8', '#d8ecdf'];
    return ['#8fb4d8', '#e4eef2'];
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /** the far land's shape, by its silhouette (viewBox 160 × 100, the horizon at 64) */
  function far(sil, lit, shade, snow, rnd) {
    const y0 = 64;
    const p = [];
    const poly = (pts, fill) => p.push(`<polygon points="${pts.map((q) => q.join(',')).join(' ')}" fill="${fill}"/>`);
    const r = () => rnd();
    switch (sil) {
      case 'rolling': p.push(`<path d="M0 ${y0} C30 ${y0 - 14} 50 ${y0 - 14} 80 ${y0 - 6} S130 ${y0 - 18} 160 ${y0 - 8} L160 ${y0} Z" fill="${shade}"/>`); break;
      case 'dunes': for (let i = 0; i < 4; i++) { const x = i * 44 - 8 + r() * 10; poly([[x, y0], [x + 26, y0 - 12 - r() * 8], [x + 34, y0]], i % 2 ? lit : shade); } break;
      case 'towers': for (let i = 0; i < 7; i++) { const x = 6 + i * 22 + r() * 8; const h = 22 + r() * 22; p.push(`<rect x="${x}" y="${y0 - h}" width="${9 + r() * 6}" height="${h}" rx="5" fill="${i % 2 ? shade : lit}"/>`); } break;
      case 'tables': for (let i = 0; i < 3; i++) { const x = 8 + i * 52 + r() * 8; const h = 14 + r() * 12; const w = 26 + r() * 14; poly([[x, y0], [x + 4, y0 - h], [x + w - 4, y0 - h], [x + w, y0]], i === 1 ? lit : shade); } break;
      case 'cones': for (let i = 0; i < 3; i++) { const x = 10 + i * 50 + r() * 10; const h = 14 + r() * 16; poly([[x, y0], [x + 18, y0 - h], [x + 26, y0 - h], [x + 44, y0]], i === 1 ? shade : lit); } break;
      case 'ridges': for (let i = 0; i < 6; i++) { const x = i * 28 + r() * 6; poly([[x, y0], [x + 20, y0 - 6 - r() * 6], [x + 26, y0]], shade); } break;
      case 'cliffs': poly([[0, y0], [0, y0 - 34], [56, y0 - 30], [64, y0]], shade); poly([[0, y0 - 34], [56, y0 - 30], [52, y0 - 26], [0, y0 - 29]], lit); break;
      case 'valley': poly([[0, y0 - 40], [62, y0], [0, y0]], shade); poly([[160, y0 - 44], [98, y0], [160, y0]], lit); break;
      case 'canyon': poly([[0, y0 - 30], [58, y0 - 30], [70, y0], [0, y0]], lit); poly([[160, y0 - 30], [100, y0 - 30], [90, y0], [160, y0]], shade); for (let k = 1; k < 4; k++) p.push(`<line x1="0" x2="58" y1="${y0 - 30 + k * 7}" y2="${y0 - 30 + k * 7}" stroke="${shade}" stroke-width="1.2" opacity="0.6"/>`); break;
      case 'peaks': {
        const pts = [[0, y0]];
        for (let i = 0; i <= 8; i++) pts.push([i * 20, y0 - (i % 2 ? 40 + r() * 14 : 18 + r() * 12)]);
        pts.push([160, y0]);
        poly(pts, shade);
        if (snow) for (let i = 1; i <= 8; i += 2) { const [x, y] = pts[i + 1]; poly([[x - 7, y + 9], [x, y], [x + 7, y + 9]], '#f4f7fa'); }
        break;
      }
      case 'domes': for (let i = 0; i < 3; i++) { const x = 18 + i * 52 + r() * 10; const w = 16 + r() * 10; p.push(`<ellipse cx="${x}" cy="${y0}" rx="${w}" ry="${12 + r() * 12}" fill="${i === 1 ? lit : shade}"/>`); } break;
      case 'mirror': break;
      default: p.push(`<line x1="0" x2="160" y1="${y0 - 1}" y2="${y0 - 1}" stroke="${shade}" stroke-width="1.5" opacity="0.5"/>`);
    }
    return p.join('');
  }

  /** the near ground: its vegetation, by structure and hue, on the rock's ground colour */
  function near(look, ground, rnd) {
    const v = VEG[look.sig.veg] ?? VEG.none;
    const s = look.sig.struct;
    const p = [`<rect x="0" y="64" width="160" height="36" fill="${ground}"/>`];
    const r = () => rnd();
    const blob = (x, y, rr, c) => p.push(`<circle cx="${x}" cy="${y}" r="${rr}" fill="${c}"/>`);
    if (s === 'closed_forest') { for (let x = -4; x < 166; x += 7) blob(x + r() * 3, 66 + r() * 3, 7 + r() * 3, v); p.push(`<rect x="0" y="70" width="160" height="30" fill="${v}"/>`); }
    else if (s === 'open_forest' || s === 'woodland') { p.push(`<rect x="0" y="72" width="160" height="28" fill="${v}" opacity="0.55"/>`); for (let i = 0; i < (s === 'woodland' ? 7 : 11); i++) { const x = 6 + r() * 150; const y = 72 + r() * 18; p.push(`<rect x="${x - 0.8}" y="${y}" width="1.6" height="7" fill="#5b4636"/>`); blob(x, y, 5 + r() * 3, v); } }
    else if (s === 'savanna') { p.push(`<rect x="0" y="70" width="160" height="30" fill="${v}" opacity="0.8"/>`); for (let i = 0; i < 4; i++) { const x = 12 + r() * 140; const y = 70 + r() * 10; p.push(`<rect x="${x - 0.7}" y="${y}" width="1.4" height="8" fill="#5b4636"/><ellipse cx="${x}" cy="${y}" rx="9" ry="2.6" fill="${VEG.olive}"/>`); } }
    else if (s === 'shrubland') { p.push(`<rect x="0" y="74" width="160" height="26" fill="${v}" opacity="0.45"/>`); for (let i = 0; i < 26; i++) blob(r() * 160, 70 + r() * 28, 2 + r() * 2, v); }
    else if (s === 'grassland' || s === 'tundra') { p.push(`<rect x="0" y="68" width="160" height="32" fill="${v}" opacity="${s === 'tundra' ? 0.7 : 0.9}"/>`); if (look.efg.flowers?.length) for (let i = 0; i < 30; i++) blob(r() * 160, 74 + r() * 24, 0.9, ['#f6e27a', '#f2a6c0', '#ffffff', '#b9a0e0'][i % 4]); }
    else if (s === 'farmland') { for (let k = 0; k < 6; k++) p.push(`<polygon points="${80 - 4 - k * 2},64 ${80 + 4 + k * 2},64 ${k * 34 - 40 + 30},100 ${k * 34 - 40},100" fill="${k % 2 ? v : ground}" opacity="0.9"/>`); }
    else if (s === 'wetland') { p.push(`<rect x="0" y="68" width="160" height="32" fill="${v}" opacity="0.75"/>`); for (let i = 0; i < 5; i++) p.push(`<ellipse cx="${r() * 160}" cy="${76 + r() * 20}" rx="${10 + r() * 10}" ry="2" fill="#86b4c6"/>`); }
    else if (s === 'desert') { for (let i = 0; i < 10; i++) blob(r() * 160, 70 + r() * 28, 1.2 + r(), VEG.grey); }
    else if (s === 'ice') p.push(`<rect x="0" y="64" width="160" height="36" fill="#eef4f8"/>`);
    else if (s === 'bare') for (let i = 0; i < 14; i++) blob(r() * 160, 70 + r() * 28, 1 + r() * 1.5, '#7f7a72');
    return p.join('');
  }

  function water(kind) {
    switch (kind) {
      case 'coast': return `<rect x="0" y="58" width="160" height="10" fill="#4f93b4"/><rect x="0" y="58" width="160" height="1.5" fill="#a9d4e4"/>`;
      case 'lake': return `<ellipse cx="96" cy="70" rx="56" ry="5" fill="#5fa3bf"/>`;
      case 'river': return `<path d="M70 64 C 90 72, 40 80, 86 100" stroke="#64a8c4" stroke-width="5" fill="none"/>`;
      case 'wetland': return `<ellipse cx="60" cy="80" rx="34" ry="3" fill="#78aec0"/>`;
      case 'salt': return `<rect x="0" y="64" width="160" height="16" fill="#f4f1ea"/><rect x="0" y="64" width="160" height="2" fill="#ffffff"/>`;
      case 'oasis': return `<ellipse cx="80" cy="74" rx="18" ry="3.5" fill="#5fa3bf"/><circle cx="66" cy="70" r="4" fill="${VEG.deepgreen}"/><circle cx="96" cy="70" r="4" fill="${VEG.deepgreen}"/>`;
      default: return '';
    }
  }

  function postcard(sc, seed) {
    const m = sc.macro;
    const look = sc.look;
    const rk = R.rock(m.rock);
    let st = (seed * 7919 + sc.index * 104729) >>> 0;
    const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 4294967296);
    const [s0, s1] = SKY(m, look);
    const top = look.belts[look.belts.length - 1];
    const snow = look.sig.snow || top?.code === 'T6.1' || top?.code === 'T6.2';
    return `<svg viewBox="0 0 160 100" class="pc"><defs><linearGradient id="g${seed}_${sc.index}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s0}"/><stop offset="1" stop-color="${s1}"/></linearGradient></defs><rect width="160" height="100" fill="url(#g${seed}_${sc.index})"/>${far(look.landform.silhouette, hex(rk.lit), hex(rk.shade), snow, rnd)}${near(look, hex(rk.ground), rnd)}${water(m.water)}</svg>`;
  }

  const zh = (e) => e.zh.replace(/（.*?）/g, '');
  function card(sc, seed) {
    const m = sc.macro;
    const look = sc.look;
    const rk = R.rock(m.rock);
    const t = C.warmthAt(m, m.base);
    const belts = look.belts.map((b, k) => `<span class="belt">${['路边', '坡上', '山顶'][Math.min(k, 2)]} ${esc(zh(b))}</span>`).join('<span class="arrow">›</span>');
    const season = K.SEASON_ZH[C.seasonOf(m.tSea, m.wet, m.cont)];
    return `<div class="card">${postcard(sc, seed)}<div class="meta">
      <div class="km">#${sc.index + 1} · ${(sc.s0 / 1000).toFixed(0)} km · ${esc(D.MOVE_ZH[sc.move])}</div>
      <div class="name">${esc(sc.name)}${look.sig.snow ? ' <span class="snow">雪</span>' : ''}</div>
      <div class="tag">${esc(sc.tag)}</div>
      <div class="moment">“${esc(sc.moment)}”</div>
      <div class="facts">海拔 ${Math.round(m.base)} m · 起伏 ${Math.round(m.relief)} m · 年均 ${t.toFixed(0)}° · ${m.month} 月 · ${esc(season)}</div>
      <div class="belts">${belts}</div>
      <div class="sw"><i style="background:${hex(rk.lit)}"></i><i style="background:${hex(rk.shade)}"></i><i style="background:${hex(rk.ground)}"></i><span>${esc(rk.zh)}</span>${look.water ? `<span class="wat">${esc(zh(look.water))}</span>` : ''}</div>
    </div></div>`;
  }

  function stats(scenes) {
    const eco = new Set(scenes.map((s) => s.look.efg.code));
    const seen = new Set();
    for (const s of scenes) { seen.add(s.look.efg.code); for (const b of s.look.belts) seen.add(b.code); if (s.look.water) seen.add(s.look.water.code); }
    const forms = new Set(scenes.map((s) => s.look.landform.id));
    let alike = 0;
    for (let k = 1; k < scenes.length; k++) if (L.distance(scenes[k - 1].look.sig, scenes[k].look.sig) < 0.25) alike++;
    const ts = scenes.map((s) => C.warmthAt(s.macro, s.macro.base));
    const hs = scenes.map((s) => s.macro.base);
    return { eco: eco.size, seen: seen.size, forms: forms.size, alike, tMin: Math.min(...ts), tMax: Math.max(...ts), hMax: Math.max(...hs) };
  }

  function profile(scenes, seed) {
    const W = 400;
    const H = 128;
    const hMax = 4500;
    const x = (s) => (s / (N * 5000)) * W;
    const y = (h) => H - 26 - (h / hMax) * (H - 38);
    let bands = '';
    let line = '';
    for (const s of scenes) {
      const c = VEG[s.look.sig.veg] ?? VEG.none;
      const rk = R.rock(s.macro.rock);
      bands += `<rect x="${x(s.s0)}" y="${H - 22}" width="${x(s.s1) - x(s.s0) + 0.3}" height="6" fill="${c}"/><rect x="${x(s.s0)}" y="${H - 15}" width="${x(s.s1) - x(s.s0) + 0.3}" height="5" fill="${hex(rk.ground)}"/>`;
    }
    const j = journeys.get(seed);
    for (let s = 0; s <= N * 5000; s += 1000) {
      const m = j.macroAt(Math.min(s, N * 5000 - 1));
      line += `${s === 0 ? 'M' : 'L'}${x(s).toFixed(1)} ${y(m.base).toFixed(1)} `;
    }
    let ticks = '';
    for (let km = 0; km <= 400; km += 100) ticks += `<text x="${x(km * 1000)}" y="${H}" font-size="7" fill="#7a7466" text-anchor="${km === 0 ? 'start' : km === 400 ? 'end' : 'middle'}">${km} km</text>`;
    return `<svg viewBox="0 0 ${W} ${H + 2}" class="prof"><path d="${line} L${W} ${H - 24} L0 ${H - 24} Z" fill="#d9d2c0" opacity="0.6"/><path d="${line}" stroke="#6a5f4c" stroke-width="1.4" fill="none"/>${bands}${ticks}<text x="2" y="9" font-size="7" fill="#7a7466">海拔（最高 4500 m）· 下面两条：植被色、岩土色</text></svg>`;
  }

  const journeys = new Map();
  const all = new Map();
  for (const seed of SEEDS) {
    const j = new D.EarthJourney(seed);
    j.sceneAt((N - 1) * 5000 + 1);
    journeys.set(seed, j);
    all.set(seed, j.scenes.slice(0, N));
  }

  const css = `
  *{box-sizing:border-box} body{margin:0;background:#f4efe4;color:#3b352b;font-family:"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif;width:430px}
  section{padding:14px 12px 10px} h1{font-size:21px;margin:2px 0 4px} h2{font-size:16px;margin:12px 0 4px} .sub{font-size:12.5px;color:#7a7060;margin:0 0 6px;line-height:1.45}
  .chips{display:flex;flex-wrap:wrap;gap:5px;margin:4px 0 6px} .chip{background:#fffaf0;border:1px solid #e3d9c4;border-radius:10px;padding:2px 8px;font-size:12px}
  .prof{width:100%;display:block;background:#fffaf2;border:1px solid #e3d9c4;border-radius:8px}
  .card{display:flex;gap:9px;background:#fffaf2;border:1px solid #e6dcc8;border-radius:10px;padding:7px;margin:7px 0}
  .pc{width:132px;height:83px;flex:none;border-radius:6px}
  .meta{min-width:0;flex:1} .km{font-size:10.5px;color:#9a8f7a} .name{font-size:19px;font-weight:700;letter-spacing:1px;line-height:1.2} .snow{font-size:11px;background:#e6eef5;color:#5b7690;border-radius:6px;padding:0 4px;vertical-align:middle}
  .tag{font-size:12px;color:#5e5546;margin:1px 0 2px} .moment{font-size:12px;color:#8a5a2b;margin-bottom:2px}
  .facts{font-size:10.5px;color:#8a8070} .belts{font-size:10.5px;color:#4f6a4a;margin-top:2px} .arrow{color:#b3a78f;margin:0 2px}
  .sw{display:flex;align-items:center;gap:3px;margin-top:3px;font-size:10.5px;color:#8a8070} .sw i{display:inline-block;width:12px;height:12px;border-radius:3px;border:1px solid rgba(0,0,0,.08)} .sw span{margin-left:3px} .wat{color:#3f7f9a}
  .note{font-size:11px;color:#9a8f7a;margin-top:6px;line-height:1.4}`;

  let body = `<section id="overview"><h1>涌现地球 · 旅程样张</h1><p class="sub">E0 规则产出：只靠一个随机种子生成整条公路。每 5 km 一个地方（60 km/h 约 5 分钟）。每张卡左边的小画是按这个地方的数据自动画的示意，不是游戏截图；游戏里的样子从 E1 开始。</p>`;
  for (const seed of SEEDS) {
    const st = stats(all.get(seed));
    body += `<h2>种子 ${seed} · 前 400 km（${N} 个地方）</h2><div class="chips"><span class="chip">路边生态系统 ${st.eco} 种</span><span class="chip">连坡上和水边 ${st.seen} 种</span><span class="chip">地貌 ${st.forms} 种</span><span class="chip">和上一处太像 ${st.alike}/${N - 1}</span><span class="chip">年均 ${st.tMin.toFixed(0)}° ~ ${st.tMax.toFixed(0)}°</span><span class="chip">最高 ${Math.round(st.hMax)} m</span></div>${profile(all.get(seed), seed)}`;
  }
  body += `<p class="note">规则：IUCN 生态功能类型卡 70 张、地貌 55 种、岩石 18 种；温度按海拔递减（每千米 6.5°），迎风坡多雨、背风坡干；林线按生长季均温 6.4°，没有一个月化冻的地方才是冰盖；公路只翻到雪线以下，冰川在山顶看得见。</p></section>`;
  sections.push('overview');

  // the places: the first hour of each, and the stretches worth a look
  const RANGES = (process.env.RANGES ?? `${SEEDS[0]}:0-11;${SEEDS[1] ?? SEEDS[0]}:24-33;${SEEDS[0]}:21-32;${SEEDS[2] ?? SEEDS[0]}:0-11`).split(';').map((x) => { const [s, r] = x.split(':'); const [a, b] = r.split('-').map(Number); return { seed: Number(s), a, b }; });
  RANGES.forEach((rg, k) => {
    const sc = all.get(rg.seed) ?? (() => { const j = new D.EarthJourney(rg.seed); j.sceneAt((N - 1) * 5000 + 1); journeys.set(rg.seed, j); all.set(rg.seed, j.scenes.slice(0, N)); return all.get(rg.seed); })();
    const id = `r${k}`;
    body += `<section id="${id}"><h2>种子 ${rg.seed} · 第 ${rg.a + 1}–${rg.b + 1} 个地方（${rg.a * 5}–${(rg.b + 1) * 5} km）</h2>${sc.slice(rg.a, rg.b + 1).map((s) => card(s, rg.seed)).join('')}</section>`;
    sections.push(id);
  });
  // every place of the first journey, for reading on a screen
  body += `<section id="all"><h2>种子 ${SEEDS[0]} · 全部 ${N} 个地方</h2>${all.get(SEEDS[0]).map((s) => card(s, SEEDS[0])).join('')}</section>`;
  html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=430"><title>涌现地球 · 旅程样张</title><style>${css}</style></head><body>${body}</body></html>`;
  fs.writeFileSync(path.join(out, 'sheet.html'), html);
  console.log('sheet:', path.join(out, 'sheet.html'));
} finally {
  await server.close();
}

const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
  await page.goto('file:///' + path.join(out, 'sheet.html').replace(/\\/g, '/'));
  for (const id of sections) {
    const file = path.join(out, `${id}.png`);
    await page.locator(`#${id}`).screenshot({ path: file });
    console.log('picture:', file);
  }
} finally {
  await browser.close();
}
