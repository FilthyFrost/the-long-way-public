// What of the cab's instruments the driver sees from her seat (src/game/modcar/cluster.ts CLUSTERS: each cluster placed
// from her eye at its sitting height, seen through the wheel's upper opening as Nomad Drive's are). For each frame, rays
// from the eye, looking ahead, to points on the faces — over each big dial's scale, each fuel and coolant gauge, each
// lamp and the display's rows — and what each meets first: the wheel (its rim, spokes, horn ring and hub), the frame's
// model (its dash), her body, the binnacle's own shell. Asserted: the speedometer and the rev counter no more than 15 %
// hidden (Nomad Drive's rim crosses the tops of its big dials), the fuel and coolant gauges and every lamp clear of
// the wheel, the dash and her (the binnacle's own cup lips may take the rim of a little dial seen from the side), the
// display at most one point of its 35 hidden (a corner of its top row under a horn ring), and nothing of the frame's
// own model left in the binnacle's wells. No pictures (nd_cluster.mjs takes them).
//   SHOTS_GPU=1 node harness/shots/nd_cluster_sight.mjs [frame ...]
import { launchBrowser, openGame, startServer } from './lib.mjs';

const ALL = ['sedan', 'wagon', 'pickup', 'goat', 'rhino', 'buffalo', 'van', 'turtle', 'elephant', 'camel', 'rv', 'snail', 'fox', 'moto'];
const FRAMES = process.argv.length > 2 ? process.argv.slice(2) : ALL;
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const ok = (cond, why) => {
  if (cond) console.log('ok  ', why);
  else {
    bad++;
    console.log('FAIL', why);
  }
};

/** in the page: seated, looking ahead; what of each element is hidden from the eye, and by what */
const SIGHT = async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const g = window.__rt.game;
  g.ui.showHelp(false);
  if (!g.seated) g.enter(g.vehicles[0]);
  window.__rt.setView('cockpit');
  for (let t = 0; t < 1.5; t += 1 / 60) {
    g.input.lookYaw = 0;
    g.input.lookPitch = 0;
    g.step(1 / 60, 1);
  }
  const v = g.seated;
  const c = v.view.cluster;
  if (!c) return null;
  // (the vehicle's model left unmerged: the binnacle's shell, the frame's model and the wheel told apart)
  v.view.unmerge();
  v.view.mergeDirty = false;
  g.render();
  const V = THREE.Vector3;
  const cam = g.core.camera;
  cam.updateMatrixWorld();
  const eye = cam.getWorldPosition(new V());
  c.group.updateWorldMatrix(true, true);
  const M = c.group.children[0].matrixWorld;
  const toLocal = M.clone().invert();
  const l = c.layout;
  // the triangles near the line from the eye to the faces
  const lo = eye.clone();
  const hi = eye.clone();
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const p = new V((sx * l.w) / 2 + sx * 2, (sy * l.h) / 2 + sy * 2, 0).applyMatrix4(M);
      lo.min(p);
      hi.max(p);
    }
  lo.subScalar(0.03);
  hi.addScalar(0.03);
  const frameObj = v.view.frameObj;
  const kindOf = (o) => {
    if (o.isSkinnedMesh || /^player/.test(o.name)) return 'body';
    for (let p = o; p; p = p.parent) {
      if (p === c.shell) return 'shell';
      if (p === frameObj) return 'frame';
    }
    return 'wheel';
  };
  const tris = [];
  const take = (o) => {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.every((m) => m.transparent || m.visible === false)) return;
    const pos = o.geometry.getAttribute('position');
    if (!pos) return;
    const ix = o.geometry.getIndex();
    const n = ix ? ix.count : pos.count;
    const kind = kindOf(o);
    const skinned = !!o.isSkinnedMesh;
    const vp = (i) => (skinned ? o.getVertexPosition(i, new V()) : new V().fromBufferAttribute(pos, i)).applyMatrix4(o.matrixWorld);
    for (let k = 0; k + 2 < n; k += 3) {
      const a = vp(ix ? ix.getX(k) : k);
      const b = vp(ix ? ix.getX(k + 1) : k + 1);
      const d = vp(ix ? ix.getX(k + 2) : k + 2);
      if (Math.max(a.x, b.x, d.x) < lo.x || Math.min(a.x, b.x, d.x) > hi.x) continue;
      if (Math.max(a.y, b.y, d.y) < lo.y || Math.min(a.y, b.y, d.y) > hi.y) continue;
      if (Math.max(a.z, b.z, d.z) < lo.z || Math.min(a.z, b.z, d.z) > hi.z) continue;
      tris.push([a, b, d, kind]);
    }
  };
  const walk = (o) => {
    if (!o.visible || o === c.group) return;
    if (o.isMesh && o.layers.test(cam.layers)) take(o);
    for (const ch of o.children) walk(ch);
  };
  g.core.scene.updateMatrixWorld(true);
  for (const ch of g.core.scene.children) if (ch === v.view.root || ch.getObjectByProperty?.('isSkinnedMesh', true)) walk(ch);
  const e1 = new V();
  const e2 = new V();
  const p = new V();
  const q = new V();
  const s = new V();
  // what a ray from the eye meets first before the face (null: nothing)
  const first = (d, maxT) => {
    let best = Infinity;
    let kind = null;
    for (const tr of tris) {
      e1.subVectors(tr[1], tr[0]);
      e2.subVectors(tr[2], tr[0]);
      p.crossVectors(d, e2);
      const det = e1.dot(p);
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det;
      s.subVectors(eye, tr[0]);
      const u = s.dot(p) * inv;
      if (u < 0 || u > 1) continue;
      q.crossVectors(s, e1);
      const w = d.dot(q) * inv;
      if (w < 0 || u + w > 1) continue;
      const t = e2.dot(q) * inv;
      // (her body is drawn see-through round the eye: what of it is nearer than her hands does not hide)
      if (t > 0.16 && t < maxT && !(t < 0.36 && tr[3] === 'body') && t < best) {
        best = t;
        kind = tr[3];
      }
    }
    return kind;
  };
  const test = (pts) => {
    const by = {};
    let hidden = 0;
    for (const [x, y] of pts) {
      const w = new V(x, y, 0.05).applyMatrix4(M);
      const d = w.clone().sub(eye);
      const dist = d.length();
      const k = first(d.normalize(), dist - 0.0008);
      if (k) {
        hidden++;
        by[k] = (by[k] ?? 0) + 1;
      }
    }
    return { h: hidden / pts.length, by, n: pts.length };
  };
  // a dial's face over its scale's sweep, a quarter dial's square, a lamp's symbol, the display's rows
  const round = (d) => {
    const pts = [];
    for (let rr = 0.25; rr <= 0.95; rr += 0.175) for (let a = -135; a <= 135; a += 22.5) pts.push([d.x + Math.sin((a * Math.PI) / 180) * d.r * rr, d.y + Math.cos((a * Math.PI) / 180) * d.r * rr]);
    return pts;
  };
  const out = { big: {}, small: {}, lamps: {}, screens: {} };
  for (const d of l.big) out.big[d.kind] = test(round(d));
  for (const d of l.small) {
    if (d.form !== 'quarter') {
      out.small[d.kind] = test(round(d));
      continue;
    }
    const pts = [];
    for (let rr = 0.3; rr <= 1.0; rr += 0.23) for (let a = -90; a <= 0; a += 15) pts.push([d.x + Math.sin((a * Math.PI) / 180) * d.r * rr, d.y + Math.cos((a * Math.PI) / 180) * d.r * rr]);
    out.small[d.kind] = test(pts);
  }
  for (const lp of l.lamps) {
    const r = lp.s * 0.35;
    out.lamps[lp.id] = test([[lp.x, lp.y], [lp.x - r, lp.y], [lp.x + r, lp.y], [lp.x, lp.y - r], [lp.x, lp.y + r]]);
  }
  for (const sc of l.screens) {
    const pts = [];
    for (let i = 0; i <= 6; i++) for (const fy of [0.12, 0.3, 0.5, 0.7, 0.88]) pts.push([sc.x - sc.w / 2 + sc.w * (0.05 + (0.9 * i) / 6), sc.y - sc.h / 2 + sc.h * fy]);
    out.screens[sc.kind] = test(pts);
  }
  // what of the frame's own model is left in the wells: short rays out of their floors, as far as the fascia
  frameObj.updateMatrixWorld(true);
  const ftris = [];
  frameObj.traverse((o) => {
    if (!o.isMesh || !o.visible || /^(N_|cluster)/.test(o.name)) return;
    for (let pp = o; pp; pp = pp.parent) if (pp === c.group || pp === c.shell) return;
    const pos = o.geometry.getAttribute('position');
    const ix = o.geometry.getIndex();
    const n = ix ? ix.count : pos.count;
    const toC = toLocal.clone().multiply(o.matrixWorld);
    for (let k = 0; k + 2 < n; k += 3) {
      const t3 = [0, 1, 2].map((j) => new V().fromBufferAttribute(pos, ix ? ix.getX(k + j) : k + j).applyMatrix4(toC));
      if (Math.max(t3[0].z, t3[1].z, t3[2].z) < 0 || Math.min(t3[0].z, t3[1].z, t3[2].z) > 2.2) continue;
      if (Math.max(t3[0].x, t3[1].x, t3[2].x) < -l.w / 2 || Math.min(t3[0].x, t3[1].x, t3[2].x) > l.w / 2) continue;
      if (Math.max(t3[0].y, t3[1].y, t3[2].y) < -l.h / 2 || Math.min(t3[0].y, t3[1].y, t3[2].y) > l.h / 2) continue;
      ftris.push(t3);
    }
  });
  const ray = new THREE.Ray();
  const hp = new V();
  let left = 0;
  for (const w of l.wells)
    for (let x = w.x - w.w / 2; x <= w.x + w.w / 2; x += 0.8)
      for (let y = w.y - w.h / 2; y <= w.y + w.h / 2; y += 0.8) {
        if (w.round ? Math.hypot(x - w.x, y - w.y) > w.w / 2 - 0.2 : Math.abs(x - w.x) > w.w / 2 - 0.2 || Math.abs(y - w.y) > w.h / 2 - 0.2) continue;
        ray.origin.set(x, y, 0.03);
        ray.direction.set(0, 0, 1);
        if (ftris.some((t3) => ray.intersectTriangle(t3[0], t3[1], t3[2], false, hp) && hp.z < 2.15)) left++;
      }
  return { style: c.spec.style, out, left };
};

const pc = (x) => `${Math.round(x.h * 100)} %${x.h > 0 ? ` (${Object.entries(x.by).map(([k, n]) => `${k} ${n}`).join(', ')})` : ''}`;
try {
  for (const frame of FRAMES) {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:${frame}&s=600&time=11&weather=clear`, { width: 1280, height: 720 });
    const r = await page.evaluate(SIGHT);
    if (!r) {
      ok(false, `${frame}: a cluster in the cab`);
      await page.close();
      continue;
    }
    const { out } = r;
    for (const [kind, x] of Object.entries(out.big)) ok(x.h <= 0.15, `${frame}: the ${kind === 'speed' ? 'speedometer' : 'rev counter'} hidden ${pc(x)} (15 % at the most)`);
    for (const [kind, x] of Object.entries(out.small)) {
      const lip = x.by.shell ?? 0;
      ok(Math.round(x.h * x.n) === lip && lip / x.n <= 0.08, `${frame}: the ${kind === 'fuel' ? 'fuel' : 'coolant'} gauge hidden ${pc(x)} (nothing but the rim of its face under its own cup's lip)`);
    }
    const hidLamps = Object.entries(out.lamps).filter(([, x]) => x.h > 0);
    ok(!hidLamps.length, `${frame}: every lamp in sight${hidLamps.length ? ` — ${hidLamps.map(([id, x]) => `${id} ${pc(x)}`).join('; ')}` : ''}`);
    for (const [kind, x] of Object.entries(out.screens)) ok(x.h <= 1 / 35 + 1e-9, `${frame}: the ${kind === 'tft' ? 'display' : `${kind} screen`} hidden ${pc(x)} (one point of its 35 at the most)`);
    ok(r.left === 0, `${frame}: nothing of the frame's own model in the binnacle's wells (${r.left} points)`);
    ok(!errors.length, `${frame}: no errors on the page${errors.length ? ` — ${errors.slice(0, 2).join(' | ')}` : ''}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `FAIL ${bad}` : 'EXIT ok');
process.exit(bad ? 1 : 0);
