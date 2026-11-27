// F6 (docs/V3/plan/finish.md §二 5, §十七), in the game: a new game gone down its first hundred kilometres, and the
// record of it — at which kilometre and in which minute of play each chapter's new thing came into the hands, how
// many new things in any twenty minutes, the longest while with none.
//
// A scripted traveller, not a person: it plays the real game — a new game of the newest world, the rougher start —
// with the player's own means wherever the record is about them:
//  - it drives the car down the road for real (a hand that follows its lane at 60 km/h), pulls up at every place;
//  - at a place it opens what opens and takes each thing with the mark on it and the left button (a thing the mark
//    could not be put on is taken by the harness and counted: 够不着), a picture of each new thing as it is found;
//  - the car's own missing parts are fitted by hand at their places, everything else kept is packed into the car
//    (Q held, looking at it); it eats and drinks out of the car when half empty, by the right button.
// What it does not do as a person would: it stands where it looks from without walking there (the walk is paid for
// in time: so many seconds a metre), it pours a can into the tank and fills up at a pump by the harness (the pouring
// and the pumps have their own walkthroughs: modcar_fuel, nd5_fuel), the workshop's start likewise (j5_start,
// f6_start), and it keeps the car it started with — it never takes one of the vehicles it finds.
//   SHOTS_GPU=1 node harness/shots/f6_walk.mjs [seed] [km]
// The record: loop/shots/f6_walk/seed<N>/log.json and record.md; its pictures beside them.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const SEED = Number(process.argv[2] ?? 7);
const KM = Number(process.argv[3] ?? 100);
const out = path.join(ROOT, 'loop/shots/f6_walk', `seed${SEED}`);
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const ok = (cond, why) => (cond ? console.log('ok  ', why) : fail(why));
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');

/** the traveller's own, installed in the page: everything it does goes through the game's test hooks (window.__rt) */
async function install() {
  const g = window.__rt.game;
  const rt = window.__rt;
  const S = await import('/src/core/modcar/schedule.ts');
  const K = await import('/src/core/modcar/kits.ts');
  const I = await import('/src/core/modcar/items.ts');
  const SK = await import('/src/core/modcar/startKit.ts');
  const SP = await import('/src/core/world/spine.ts');
  const B = await import('/src/core/modcar/build.ts');
  const C = await import('/src/core/modcar/crafting.ts');
  const st = new SP.SpineSample();
  const pr = { s: 0, d: 0 };
  const basis = new Float64Array(9);
  const w = (window.__w = { forced: [], t0: 0 });

  // ---- what counts as a new thing: the plan's (with what comes in its box) and the sets' steps
  const news = new Map();
  // (not the buildings' own furnishing — a chair, a shelf, a refrigerator stand in a house from the first kilometre:
  // schedule.ts FURNISHING — nor a set's step of things one has other uses for: a battery, a shovel, a bucket)
  const FURNISHING = new Set(['furniture', 'shelves', 'fridge']);
  for (const e of S.SCHEDULE_V7) {
    if (!e.novelty || FURNISHING.has(e.id)) continue;
    news.set(S.thingKey(e.thing), { what: e.id, chapter: e.chapter ?? 0 });
    for (const c of e.with ?? []) if (!news.has(S.thingKey(c.thing))) news.set(S.thingKey(c.thing), { what: `${e.id}+`, chapter: e.chapter ?? 0 });
  }
  for (const k of K.KITS) k.steps.forEach((stp, i) => !stp.free && stp.things.forEach((t) => !news.has(S.thingKey(t)) && news.set(S.thingKey(t), { what: `kit:${k.id}:${i + 1}`, chapter: 0 })));
  /** the car's own parts down the road: part id → the mounts it goes on */
  const roadMounts = new Map();
  for (const p of SK.roadParts()) roadMounts.set(p.part, [...(roadMounts.get(p.part) ?? []), p.mount]);
  const keyOf = (l) => (l.item ? l.item.item : l.part ? `part:${l.part.part}` : l.tool ? `tool:${l.tool.kind}` : '');
  const heldKey = () => {
    const h = g.player.held;
    return !h ? '' : h.kind === 'item' ? h.item.item : h.kind === 'part' ? `part:${h.inst.part}` : `tool:${h.tool.kind}`;
  };
  const nameOf = (key) => (key.startsWith('part:') ? key.slice(5) : key.startsWith('tool:') ? key : I.hasItem(key) ? I.itemDef(key).name.zh : key);
  w.nameOf = nameOf;
  // (minutes of play: the hours a sleep takes off the clock are no play)
  w.sleptS = 0;
  w.minutes = () => (g.time - w.t0 - w.sleptS) / 60;
  /**
   * Tired, as one would: a sleep in the seat — the engine off, the left button held on nothing of the cab's. (Awake
   * for more than an hour the game brings the wheel round a moment late, and a hand that never sleeps runs off the
   * road in the bends.)
   */
  w.sleep = () => {
    const b = g.body;
    const e0 = b.energy ?? 100;
    if (e0 >= 30) return null;
    if (!g.seated) rt.enter(0);
    const v = g.seated;
    if (!v) return { error: 'no seat' };
    if (v.sys.running) v.sys.stop('');
    const t0 = g.time;
    let sim = 0;
    const run = (secs, left) => {
      g.leftButton = left;
      for (let t = 0; t < secs; t += 1 / 60) g.step(1 / 60, 1);
      sim += secs;
    };
    // (as one would: what is in the hands put by for the while — one sleeps with empty hands —, the eyes up off the
    // wheel and the key: the left button held on any of the cab's own works that)
    const keep = g.player.slots.slice();
    for (let i = 0; i < g.player.slots.length; i++) g.player.slots[i] = null;
    const pitch = g.input.lookPitch;
    g.input.lookPitch = 0.9;
    run(0.5, false);
    const could = g.canSleep() && !g.cockpit.aimed && !g.cockpit.aimedAft;
    run(1.3, true);
    run(6, false);
    for (let i = 0; i < keep.length; i++) g.player.slots[i] = keep[i];
    g.input.lookPitch = pitch;
    const jumped = Math.max(0, g.time - t0 - sim);
    w.sleptS += jumped;
    return { from: Math.round(e0), to: Math.round(b.energy ?? 100), clock: +(jumped / 60).toFixed(1), food: Math.round(b.food), water: Math.round(b.water), could };
  };
  w.km = () => g.roadS / 1000;
  w.car = () => g.vehicles[0];

  // ---- the workshop: the start's parts on, water and petrol in (their own walkthroughs fit and pour them by hand)
  w.garage = () => {
    const v = g.vehicles[0];
    // (the parts as the start has them — a rim with its tyre on it, each as worn as it lies there)
    for (const p of SK.startParts(true)) if (!v.build.parts[p.mount]) B.fitPart(v.build, p.mount, p.inst);
    for (const l of g.loose.list.filter((x) => x.part)) g.loose.remove(l);
    g.changed(v, 'build');
    g.simulate(0.5);
    const rad = v.build.parts.radiator;
    if (rad) rad.fluids.coolantL = Math.max(rad.fluids.coolantL ?? 0, 6);
    let litres = 0;
    for (const l of g.loose.list.filter((x) => x.tool?.kind === 'jerrycan')) {
      litres += l.tool.litres ?? 0;
      l.tool.litres = 0;
    }
    const tank = v.build.parts.fuelTank;
    tank.fluids.fuel = { ...(tank.fluids.fuel ?? {}), petrol: (tank.fluids.fuel?.petrol ?? 0) + litres };
    g.changed(v, 'fluids');
    g.simulate(0.5);
    return { parts: Object.keys(v.build.parts).length, petrol: tank.fluids.fuel.petrol, lying: g.loose.list.map(keyOf) };
  };

  // ---- the road
  w.fuel = () => {
    const d = g.vehicles[0].sys.dash;
    return { litres: d.fuelL, tank: d.tankL };
  };
  w.addFuel = (litres) => {
    const v = g.vehicles[0];
    const tank = v.build.parts.fuelTank;
    const d = v.sys.dash;
    const take = Math.max(0, Math.min(litres, d.tankL - d.fuelL));
    tank.fluids.fuel = { ...(tank.fluids.fuel ?? {}), petrol: (tank.fluids.fuel?.petrol ?? 0) + take };
    g.changed(v, 'fluids');
    return take;
  };
  /** in the seat, the engine running */
  w.board = () => {
    if (!g.seated) rt.enter(0);
    const v = g.seated;
    if (!v) return { error: 'no seat' };
    for (let k = 0; k < 6 && !v.sys.running; k++) rt.crank(1.6);
    return { running: v.sys.running };
  };
  /** down the road to `toS` (m) and pulled up there: a hand that follows the lane */
  w.drive = (toS, want = 60) => {
    const v = g.seated;
    if (!v) return { error: 'not seated' };
    const sp = g.world.spine;
    sp.project(v.sim.px, v.sim.pz, NaN, pr);
    const s0 = pr.s;
    const t0 = g.time;
    const lane = Math.max(1.2, Math.min(2.2, Math.abs(pr.d))) * (pr.d < 0 ? -1 : 1);
    let hint = pr.s;
    const steerTo = () => {
      sp.project(v.sim.px, v.sim.pz, hint, pr);
      hint = pr.s;
      sp.at(pr.s + 14 + Math.abs(v.sim.kmh) * 0.25, st);
      const tx = st.x - Math.sin(st.phi) * lane;
      const tz = st.z + Math.cos(st.phi) * lane;
      v.sim.basis(basis);
      let a = Math.atan2(tz - v.sim.pz, tx - v.sim.px) - Math.atan2(basis[2], basis[0]);
      while (a > Math.PI) a -= 2 * Math.PI;
      while (a < -Math.PI) a += 2 * Math.PI;
      // the road wheels' angle that brings the car to that point (pure pursuit) — and, as a driver does with a worn
      // steering box, the wheel turned through its free play besides (the start's car has some five degrees of it:
      // a small correction would be lost in it), as a share of what the steering gives at this speed
      const want = Math.atan2(2 * v.sim.spec.wheelbase * Math.sin(a), Math.hypot(tx - v.sim.px, tz - v.sim.pz));
      if (Math.abs(want) < 0.0015) return 0;
      const half = (v.sim.mods?.steerPlay ?? 0) * 0.5;
      return Math.max(-1, Math.min(1, (want + Math.sign(want) * half) / Math.max(0.01, v.sim.maxSteerNow)));
    };
    v.sim.setParkBrake(false);
    let top = 0;
    let said = '';
    let mark = pr.s;
    let markT = 0;
    let stuck = false;
    let dry = false;
    let shiftT = -9;
    const toast = () => {
      const e = document.querySelector('.mc-toast');
      return e && e.style.opacity !== '0' ? e.textContent : '';
    };
    for (let t = 0; t < 1500; t += 1 / 60) {
      const steer = steerTo();
      const k = v.sim.kmh;
      const left = toS - pr.s;
      const ms = k / 3.6;
      if (left <= ms * ms / 7 + 6) break;
      // (as one drives: slower into a bend — how far the road turns between ten and forty-five metres ahead)
      sp.at(pr.s + 10, st);
      const p0 = st.phi;
      sp.at(pr.s + 45, st);
      let bend = Math.abs(st.phi - p0);
      if (bend > Math.PI) bend = 2 * Math.PI - bend;
      const go = bend > 0.45 ? Math.min(want, 30) : bend > 0.22 ? Math.min(want, 42) : want;
      g.scripted = { steer, throttle: Math.max(0, Math.min(1, (go - k) * 0.09 + 0.15)), brake: k > go + 6 ? 0.4 : 0, handbrake: 0 };
      g.step(1 / 60, 1);
      // (a manual box: up a gear at two thirds of the red line, down one when the engine labours)
      if (v.sim.manual && t - shiftT > 0.9) {
        const red = v.sim.spec.engine.redline;
        if (v.sim.rpm > red * 0.66 && v.sim.shiftUp()) shiftT = t;
        else if (v.sim.rpm < red * 0.26 && v.sim.gear > 1 && v.sim.shiftDown()) shiftT = t;
      }
      if (k > top) top = k;
      if (!said) {
        const x = toast();
        if (/拖回|扶正|放回/.test(x)) said = x;
      }
      if (!v.sys.running) {
        g.scripted = null;
        if (v.sys.dash.fuelL < 0.2) {
          dry = true;
          break;
        }
        rt.crank(1.6);
        if (!v.sys.running) {
          stuck = true;
          break;
        }
      }
      if (t - markT > 20) {
        if (pr.s - mark < 8) {
          stuck = true;
          break;
        }
        mark = pr.s;
        markT = t;
      }
    }
    const diag = stuck ? { kmh: +v.sim.kmh.toFixed(1), rpm: Math.round(v.sim.rpm), gear: v.sim.gear, selector: v.sim.selector, park: v.sim.parkBrake, running: v.sys.running, fuel: +v.sys.dash.fuelL.toFixed(1), list: !!g.listV, held: heldKey(), seat: g.seatAt ?? null, d: +pr.d.toFixed(1), pitch: +(v.sim.pitch * 57.3).toFixed(1), roll: +(v.sim.roll * 57.3).toFixed(1) } : null;
    for (let t = 0; t < 30 && v.sim.speed > 0.08; t += 1 / 60) {
      g.scripted = { steer: steerTo(), throttle: 0, brake: v.sim.vForward > 0.5 ? 0.5 : 0.2, handbrake: 0 };
      g.step(1 / 60, 1);
    }
    // (a manual box: back to first for the next pulling away)
    if (v.sim.manual) for (let k = 0; k < 6 && v.sim.gear > 1; k++) {
      v.sim.shiftDown();
      g.simulate(0.4);
    }
    g.scripted = null;
    v.sim.setParkBrake(true);
    g.simulate(0.2);
    sp.project(v.sim.px, v.sim.pz, hint, pr);
    return { s: pr.s, went: pr.s - s0, secs: g.time - t0, top, said, stuck, dry, diag, off: Math.abs(pr.d), roll: Math.abs(v.sim.roll) * 57.3 };
  };

  // ---- the places
  w.sites = (from, to) => {
    const list = [];
    g.world.sites.between(from, to, list);
    return list
      .filter((x) => x.s >= from && x.s < to && (x.kind !== 'roadside' || x.containers.length > 0 || x.loose.length > 0 || x.objects.some((o) => o.kind === 'wreck')))
      .sort((a, b) => a.s - b.s)
      .map((x) => ({ id: x.id, s: x.s, kind: x.kind, sort: x.sort, prefab: x.prefab, x: x.x, z: x.z }));
  };
  const liveOf = (id) => [...g.places.live.values()].find((x) => x.site.id === id) ?? null;
  w.laid = (id) => {
    const lp = liveOf(id);
    if (!lp) return false;
    if (lp.site.prefab) {
      const d = g.systems.harness('nd-build', 'drawn').find((x) => x.site === id);
      if (!d || !d.ready) return false;
    }
    return lp.containers.every((pc) => pc.laid) && (g.worldView?.pending ?? 0) <= 0;
  };
  /** a prefab building's doors all open (its rooms and lockers reached) */
  w.openDoors = (id) => {
    const lp = liveOf(id);
    if (!lp?.site.prefab) return 0;
    let n = 0;
    for (const d of g.systems.harness('nd-build', 'doors', id)) if (g.systems.harness('nd-build', 'door', id, true, d.name)) n++;
    g.simulate(0.3);
    return n;
  };
  /** the middle of a thing as drawn (world), for the mark */
  const middle = (l) => {
    l.obj.updateWorldMatrix(true, true);
    const o = g.core.origin;
    let lo = [Infinity, Infinity, Infinity];
    let hi = [-Infinity, -Infinity, -Infinity];
    const v = l.obj.position.clone();
    l.obj.traverse((m) => {
      const geo = m.geometry;
      if (!geo || m.visible === false) return;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const b = geo.boundingBox;
      for (const cx of [b.min.x, b.max.x]) for (const cy of [b.min.y, b.max.y]) for (const cz of [b.min.z, b.max.z]) {
        v.set(cx, cy, cz).applyMatrix4(m.matrixWorld);
        lo = [Math.min(lo[0], v.x), Math.min(lo[1], v.y), Math.min(lo[2], v.z)];
        hi = [Math.max(hi[0], v.x), Math.max(hi[1], v.y), Math.max(hi[2], v.z)];
      }
    });
    return Number.isFinite(lo[0]) ? { x: (lo[0] + hi[0]) / 2 + o.x, y: (lo[1] + hi[1]) / 2 + o.y, z: (lo[2] + hi[2]) / 2 + o.z } : { x: l.x, y: l.y + l.mid, z: l.z };
  };
  /** the walk from where one stood to where one stands now, paid for in time (2.5 m/s, a place's own ground: a minute at most) */
  let was = null;
  const walked = () => {
    const p = g.player.walker;
    const d = was ? Math.hypot(p.x - was.x, p.z - was.z) : 0;
    was = { x: p.x, z: p.z };
    if (d > 0.5) g.simulate(Math.min(60, d / 2.5));
  };
  w.walkFrom = () => {
    const p = g.player.walker;
    was = { x: p.x, z: p.z };
  };
  /** what the mark is on, standing off a point from each side in turn until it is on what is wanted */
  const markOn = (c, wanted, dists = [1.2, 0.9, 1.6]) => {
    const base = Math.atan2(g.player.walker.z - c.z, g.player.walker.x - c.x);
    let m = '';
    for (const dist of dists) for (const turn of [0, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1, Math.PI, 2.8, -2.8]) {
      m = rt.aimPoint(c.x, c.y, c.z, base + turn, dist);
      if (wanted(m)) return m;
    }
    return m;
  };
  /** a place's boxes that open, opened by the left button (one the mark could not find: by the harness, and counted) */
  w.openBoxes = (id) => {
    const lp = liveOf(id);
    if (!lp) return { opened: 0, forced: 0 };
    let opened = 0;
    let forced = 0;
    for (const pc of lp.containers) {
      if (!g.places.opens(pc) || g.places.isOpen(pc.id)) continue;
      const dev = g.devices.find((d) => d.id === `box:${pc.id}`);
      const m = dev ? markOn({ x: dev.x, y: dev.y, z: dev.z }, (x) => x === `device:box:${pc.id}`, [1.5, 1.1]) : '';
      walked();
      if (m === `device:box:${pc.id}`) {
        rt.press();
        g.simulate(0.9);
      }
      if (!g.places.isOpen(pc.id)) {
        g.places.toggle(pc);
        g.simulate(0.6);
        forced++;
        w.forced.push({ what: `box:${pc.c.kind}`, at: lp.site.sort, km: +(lp.site.s / 1000).toFixed(1), mark: m });
      }
      opened++;
    }
    return { opened, forced };
  };
  /** food whose card says it makes one ill (out of date, damp, raw) */
  const ill = (d) => !!d.eat?.effect && String(d.eat.effect).startsWith('sick');
  /** would one take it: a new thing, a part the car lacks, what keeps one going (while the car has not plenty of it), a sheet, a kit */
  const stock = () => {
    const riders = g.cargo.ridersOf(g.vehicles[0]);
    let food = 0;
    let water = 0;
    for (const l of riders) {
      const it = l.item;
      if (!it) continue;
      const d = I.itemDef(it.item);
      const n = it.n ?? 1;
      // (food that makes one ill — out of date, damp — is no stock: one reads its card and keeps it for the worst day)
      if (d.eat && d.eat.food > 0 && !d.tags?.includes('ingredient') && !ill(d)) food += d.eat.food * n;
      if (d.drink && !d.drink.empty && d.drink.liquid === 'water') water += (it.litres ?? d.drink.litres) * 100;
    }
    return { food, water, riders: riders.length };
  };
  w.stock = stock;
  const wanted = (l, have) => {
    const key = keyOf(l);
    if (!key) return false;
    if (news.has(key)) return true;
    if (l.part) {
      const mounts = roadMounts.get(l.part.part) ?? [];
      return mounts.some((m) => !g.vehicles[0].build.parts[m]);
    }
    if (l.tool) return l.tool.kind === 'jerrycan' && (l.tool.fuel ?? 'petrol') === 'petrol' && (l.tool.litres ?? 0) > 0.05;
    const d = I.itemDef(key);
    if (key.startsWith('bp_')) return true;
    if (d.cat === 'med') return true;
    if (d.tags?.includes('ingredient')) return (g.kits.cooking?.got ?? 0) >= 3 && have.riders < 60;
    // (what makes one ill: only with next to nothing else to eat in the car)
    if (d.eat && d.eat.food > 0) return ill(d) ? have.food < 120 : have.food < 900;
    if (d.drink && !d.drink.empty) return have.water < 900;
    if (d.pack) return true;
    if (d.wear) return (d.wear.warmth ?? 0) >= 7;
    return ['nd_tire_kit', 'nd_engine_kit', 'nd_charger', 'nd_battery', 'nd_compass'].includes(key);
  };
  /** the things of a place there are to take: in its boxes (open now) and in plain sight */
  w.things = (id) => {
    const lp = liveOf(id);
    if (!lp) return [];
    const have = stock();
    const outList = [];
    const add = (l, box) => {
      if (!g.loose.list.includes(l)) return;
      const key = keyOf(l);
      outList.push({ uid: l.uid, key, box, want: wanted(l, have), fresh: news.has(key) || (!!l.part && (roadMounts.get(l.part.part) ?? []).length > 0) });
    };
    for (const pc of lp.containers) for (const l of pc.things) add(l, pc.c.kind);
    for (const t of lp.loose.values()) add(t.l, '');
    return outList;
  };
  /** the mark on a thing (standing off it from each side in turn); null: it is gone */
  w.aimThing = (uid) => {
    const l = g.loose.list.find((x) => x.uid === uid);
    if (!l) return null;
    const c = middle(l);
    const m = markOn(c, (x) => x === `loose:${uid}`);
    walked();
    g.simulate(0.15);
    const dev = g.player.target?.kind === 'device' ? g.player.target.device : null;
    return { mark: m, on: m === `loose:${uid}` || (!!dev && dev.loose === l), key: keyOf(l) };
  };
  /** the left button on it (held, for a big thing): into the hands; one the mark was not on is taken by the harness and counted */
  w.pick = (uid, at) => {
    const l = g.loose.list.find((x) => x.uid === uid);
    if (!l) return { held: '' };
    const key = keyOf(l);
    const m = String(g.player.telemetry().target);
    let how = 'press';
    // (the mark on the thing itself, or on the device a system makes of it — a bottle of the water's, a stove: the left button takes it up)
    const dev = g.player.target?.kind === 'device' ? g.player.target.device : null;
    if (m === `loose:${uid}` || (dev && dev.loose === l)) {
      rt.press();
      if (heldKey() !== key) rt.useFor(0.8);
    }
    if (heldKey() !== key && g.loose.list.includes(l)) {
      how = 'harness';
      g.player.takeLoose(l);
      w.forced.push({ what: key, at: at.sort, km: +(at.s / 1000).toFixed(1), mark: m });
    }
    g.simulate(0.7);
    const h = g.player.held;
    return { held: heldKey(), how, note: h ? g.kitNote(h) : null };
  };
  const ZONES = ['trunk', 'rear', 'pass', 'cabin', 'bed'];
  /** what is in the hands, dealt with: a part of the car fitted at its place by hand, petrol into the tank, a sheet learnt, the rest packed into the car */
  w.keep = () => {
    const h = g.player.held;
    if (!h) return { did: 'nothing' };
    const v = g.vehicles[0];
    const key = heldKey();
    if (h.kind === 'part') {
      const mounts = [...(roadMounts.get(h.inst.part) ?? []), ...B.missingMounts(v.build).filter((m) => m.cat === 'radio' && h.inst.part.startsWith('radio')).map((m) => m.id)].filter((m) => !v.build.parts[m]);
      // (fitted by hand at its place: tried from outside, a wait between the tries — its ghost comes in as its model does)
      if (mounts.length) return { did: 'fit', mounts };
    }
    if (h.kind === 'tool' && h.tool.kind === 'jerrycan') {
      const took = w.addFuel(h.tool.litres ?? 0);
      h.tool.litres = Math.max(0, (h.tool.litres ?? 0) - took);
      g.simulate(4 + took * 0.8);
      if ((h.tool.litres ?? 0) < 0.3) {
        // (an empty can: left behind — taken out of the world here, not put down under the car's wheels)
        g.player.held = null;
        return { did: 'poured', litres: took };
      }
    }
    if (h.kind === 'item' && key.startsWith('bp_')) {
      rt.rightFor(1.2);
      g.simulate(0.3);
      if (!g.player.held) return { did: 'learnt', recipe: key };
      g.player.held = null;
      return { did: 'known', recipe: key };
    }
    for (const zone of ZONES) {
      if (rt.aimZone(0, zone, 1.3) === false) continue;
      g.simulate(0.2);
      rt.dropFor(0.8);
      g.simulate(0.3);
      if (!g.player.held) {
        walked();
        return { did: 'packed', zone };
      }
    }
    // (no room in the car: left behind — taken out of the world here, not put down under its wheels)
    g.player.held = null;
    g.simulate(0.2);
    return { did: 'left', why: 'no room in the car' };
  };
  /** the part in the hands held to its place on the car, the left button held: is it on? */
  w.tryFit = (mount, side = 0) => {
    const v = g.vehicles[0];
    if (!g.player.held) return !!v.build.parts[mount];
    rt.aim(0, mount, 1.6, side);
    g.simulate(0.2);
    rt.useFor(1.2);
    if (!v.build.parts[mount]) return false;
    walked();
    g.simulate(3);
    return true;
  };
  /** its place not found by the mark: fitted by the harness, and counted */
  w.forceFit = (mount) => {
    const h = g.player.held;
    const v = g.vehicles[0];
    if (!h || h.kind !== 'part') return { did: 'nothing' };
    const m = String(g.player.telemetry().target);
    B.fitPart(v.build, mount, h.inst);
    g.player.held = null;
    g.changed(v, `on:${mount}`);
    w.forced.push({ what: `fit:${mount}`, at: 'car', km: +w.km().toFixed(1), mark: m });
    g.simulate(3);
    return { did: 'fitted', mount, how: 'harness' };
  };
  /** eat and drink out of the car when half empty, by the right button */
  w.feed = () => {
    const b = g.body;
    const did = { ate: 0, drank: 0, food: b.food, water: b.water };
    const riders = () => g.cargo.ridersOf(g.vehicles[0]);
    for (let k = 0; k < 8 && b.food < 55; k++) {
      // (as one would: what is good first; what makes one ill only when there is nothing else and one is starving)
      const edible = riders().filter((x) => x.item && I.itemDef(x.item.item).eat && I.itemDef(x.item.item).eat.food > 0 && !I.itemDef(x.item.item).tags?.includes('ingredient'));
      const l = edible.find((x) => !ill(I.itemDef(x.item.item))) ?? (b.food < 15 ? edible[0] : undefined);
      if (l && ill(I.itemDef(l.item.item))) did.ill = (did.ill ?? 0) + 1;
      if (!l || !g.player.takeLoose(l)) break;
      const before = b.food;
      for (let j = 0; j < 4 && g.player.held && b.food < 85; j++) rt.rightFor(2.5);
      if (b.food > before) did.ate++;
      if (g.player.held) w.keep();
    }
    for (let k = 0; k < 6 && b.water < 55; k++) {
      const l = riders().find((x) => x.item && I.itemDef(x.item.item).drink && !I.itemDef(x.item.item).drink.empty && (x.item.litres ?? 1) > 0.02);
      if (!l || !g.player.takeLoose(l)) break;
      const before = b.water;
      for (let j = 0; j < 6 && g.player.held && b.water < 90; j++) rt.rightFor(2.0);
      if (b.water > before) did.drank++;
      if (g.player.held) w.keep();
    }
    did.food = b.food;
    did.water = b.water;
    return did;
  };
  /** a filling station with petrol in its pumps: the tank filled (by the harness: nd5_fuel and modcar_fuel fill it by hand) */
  w.pump = (id) => {
    const lp = liveOf(id);
    if (!lp) return 0;
    const port = lp.ports.find((p) => (p.fuel ?? 'petrol') === 'petrol');
    const nd = lp.site.prefab === 'station' ? g.systems.harness('nd-fuel', 'pumps')?.find?.((p) => p.site === id) : null;
    if (!port && !(nd && nd.fuel === 'petrol' && nd.litres > 1)) return 0;
    const took = w.addFuel(60);
    if (took > 0.5) g.simulate(30 + took * 0.5);
    return took;
  };
  w.body = () => ({ hp: g.body.hp, cap: g.body.cap, food: g.body.food, water: g.body.water, energy: g.body.energy, temp: g.body.temp, dead: g.deadT >= 0 });
  w.kits = () => JSON.parse(JSON.stringify(g.kits));
  w.learned = () => [...g.learned];
  w.news = () => [...news].map(([k, v]) => ({ key: k, ...v }));
  w.chapterAt = (km) => C.chapterAt(km);
  w.missing = () => SK.ROAD_MOUNTS.filter((m) => !g.vehicles[0].build.parts[m]).length;
  /** the car's own parts still not on it: for each, where the plan laid it (the place, how far down the road) and whether it lies there now */
  w.missingParts = () => {
    const L = (window.__wL ??= null);
    void L;
    const planner = new S.SitePlanner(g.places.plannedFinds());
    const sites = [];
    g.world.sites.between(0, 14000, sites);
    sites.sort((a, b) => a.s - b.s);
    planner.take(sites.map((x) => ({ id: x.id, s: x.s, kind: x.sort, boxes: x.containers.filter((c) => c.kind !== 'glovebox' && c.kind !== 'boot' && c.kind !== 'fridge' && c.kind !== 'coolbox').length, ground: !x.containers.some((c) => c.kind !== 'glovebox' && c.kind !== 'boot' && c.kind !== 'fridge' && c.kind !== 'coolbox') && x.objects.some((o) => o.kind === 'wreck') })));
    const outList = [];
    for (const x of sites) for (const f of planner.findsAt(x.id)) {
      if (!f.entry.startsWith('start:')) continue;
      const mount = f.entry.slice(6);
      if (g.vehicles[0].build.parts[mount]) continue;
      outList.push({ mount, part: f.thing.part, km: +(x.s / 1000).toFixed(2), at: x.sort, id: x.id, boxes: x.containers.map((c) => c.kind).join(' ') });
    }
    return outList;
  };
  w.whole = () => g.done.has('whole');
  return { news: news.size, road: [...roadMounts.keys()].length };
}

const log = { seed: SEED, km: KM, started: new Date().toISOString(), stops: [], firsts: [], legs: [], problems: [], forced: [], sleeps: [] };
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=7&seed=${SEED}&kit=j5&time=9.2`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const W = (name, ...args) => page.evaluate(({ name, args }) => window.__w[name](...args), { name, args });
  let shots = 0;
  const shot = async (name) => {
    await page.evaluate(async () => {
      const g = window.__rt.game;
      g.ui.showHelp(false);
      for (let i = 0; i < 200 && (g.worldView?.pending ?? 0) > 0; i++) {
        g.worldView.update(g.player.walker.x, g.player.walker.z, 40);
        await new Promise((r) => setTimeout(r, 0));
      }
      for (let i = 0; i < 2; i++) window.__rt.render();
    });
    const f = `${String(++shots).padStart(2, '0')}_${name.replace(/[^a-z0-9_.-]/gi, '_')}.png`;
    await page.screenshot({ path: path.join(out, f) });
    return f;
  };
  await rt('simulate', 1.0);
  const inst = await page.evaluate(install);
  const world = await page.evaluate(() => ({ version: window.__rt.game.world.rules.version, seed: window.__rt.game.params.seed, kit: window.__rt.game.params.kit }));
  ok(world.version === 7 && world.kit === 'j5', `a new game of the world of seed ${world.seed}, version ${world.version}, the rougher start (${inst.news} new things to look out for, ${inst.road} sorts of part down the road)`);

  // ---- the workshop
  const start = await W('garage');
  console.log(`     the workshop's parts on (${start.parts}), ${f1(start.petrol)} L of petrol in; lying about: ${start.lying.join(' ')}`);
  await shot('workshop');
  const door = await rt('useDevice', 'door');
  await rt('simulate', 4);
  let seat = await W('board');
  ok(door === 'device:door' && seat.running, `the doors open, in, the key: it runs (${JSON.stringify(seat)})`);
  await rt('drive', 9, 0.7, 0);
  await rt('drive', 6, 1.0, 0);
  const place = (await rt('telemetry')).place;
  ok(place === 'road', `out onto the road (${place})`);
  await page.evaluate(() => {
    window.__w.t0 = window.__rt.game.time;
  });
  await rt('setView', 'cockpit');
  await shot('out');

  // ---- down the road, place by place
  const seen = new Set();
  let at = await W('km');
  let lastNew = 0;
  let towed = 0;
  let dryRuns = 0;
  const first = async (key, site, what, note, how) => {
    if (seen.has(key)) return;
    seen.add(key);
    const km = site.s / 1000;
    const min = await W('minutes');
    const pic = await shot(`${what.replace(/[:+]/g, '_')}_${km.toFixed(1)}km`);
    log.firsts.push({ key, what, km: +km.toFixed(2), min: +min.toFixed(1), at: site.sort, note: note ?? null, how, pic });
    console.log(`  ★ ${what} (${key}) at ${km.toFixed(1)} km, minute ${min.toFixed(0)}, a ${site.sort}${note ? ` — ${note}` : ''}${how === 'harness' ? ' [taken by the harness]' : ''}`);
    lastNew = min;
  };
  for (let from = at * 1000; from < KM * 1000; ) {
    const sites = await W('sites', from, Math.min(KM * 1000, from + 12_000));
    from = Math.min(KM * 1000, from + 12_000);
    for (const site of sites) {
      // tired: a sleep in the seat first
      const slept = await W('sleep');
      if (slept && !slept.error && slept.to > slept.from) {
        log.sleeps.push({ min: +(await W('minutes')).toFixed(1), ...slept });
        console.log(`  … slept in the seat: energy ${slept.from} → ${slept.to}, the clock ${slept.clock} minutes on; food ${slept.food}, water ${slept.water}`);
        await W('feed');
      } else if (slept?.from !== undefined && slept.to <= slept.from) log.problems.push({ km: +(site.s / 1000).toFixed(1), what: `tired (energy ${slept.from}) and could not sleep` });
      // on to it
      seat = await W('board');
      const leg = await W('drive', site.s);
      if (leg.dry) {
        dryRuns++;
        log.problems.push({ km: +(leg.s / 1000).toFixed(1), what: 'out of petrol on the road: ten litres from the harness' });
        await W('addFuel', 10);
        await W('board');
        Object.assign(leg, await W('drive', site.s));
      }
      if (leg.stuck || leg.said) {
        towed++;
        log.problems.push({ km: +(leg.s / 1000).toFixed(1), what: leg.said ? `said: ${leg.said}` : `stuck: put on down the road by the harness ${JSON.stringify(leg.diag)}` });
        if (leg.stuck) {
          await rt('setView', 'chase');
          await shot(`stuck_${(leg.s / 1000).toFixed(1)}km`);
          await rt('setView', 'cockpit');
          await rt('devGoKm', site.s / 1000, true);
          await W('board');
        }
      }
      log.legs.push({ to: +(site.s / 1000).toFixed(2), went: Math.round(leg.went ?? 0), secs: Math.round(leg.secs ?? 0), top: Math.round(leg.top ?? 0), off: +(leg.off ?? 0).toFixed(1) });
      // out, and the place there
      await rt('exit');
      await W('walkFrom');
      let laid = false;
      for (let k = 0; k < 100 && !laid; k++) {
        await rt('simulate', 0.25);
        laid = await W('laid', site.id);
        if (!laid) await page.waitForTimeout(40);
      }
      const stop = { km: +(site.s / 1000).toFixed(2), kind: site.sort, prefab: site.prefab || undefined, min: +(await W('minutes')).toFixed(1), took: [], left: [], laid };
      if (!laid) log.problems.push({ km: stop.km, what: `the ${site.sort} was not laid out in time` });
      if (site.prefab) await W('openDoors', site.id);
      const boxes = await W('openBoxes', site.id);
      await rt('simulate', 0.4);
      // (twice over: what a set's step put out here as its thing was picked up is found in the same visit only if it lies here already)
      const tried = new Set();
      for (let pass = 0; pass < 2; pass++) {
        const things = (await W('things', site.id)).filter((t) => t.want && !tried.has(t.uid));
        for (const t of things) {
          tried.add(t.uid);
          let aim = await W('aimThing', t.uid);
          if (!aim) continue;
          // (its model not in yet, or the box it lies in still shut — the left button on the box first: looked for once more)
          for (let k = 0; k < 3 && !aim.on; k++) {
            if (aim.mark.startsWith('device:box:')) {
              await rt('press');
              await rt('simulate', 0.9);
            } else await page.waitForTimeout(250);
            aim = await W('aimThing', t.uid);
            if (!aim) break;
          }
          if (!aim) continue;
          const isNew = t.fresh && !seen.has(t.key);
          const got = await W('pick', t.uid, { sort: site.sort, s: site.s });
          if (!got.held) {
            stop.left.push(t.key);
            continue;
          }
          if (isNew) {
            const all = await W('news');
            const n = all.find((x) => x.key === t.key);
            await first(t.key, site, n ? n.what : `car:${t.key.slice(5)}`, got.note, got.how);
          }
          let kept = await W('keep');
          if (kept.did === 'fit') {
            let done = null;
            for (const mount of kept.mounts) {
              for (let k = 0; k < 12 && !done; k++) {
                if (await W('tryFit', mount, [0, 1, -1][k % 3])) done = { did: 'fitted', mount, how: 'hand' };
                else await page.waitForTimeout(200);
              }
              if (done) break;
            }
            kept = done ?? (await W('forceFit', kept.mounts[0]));
          }
          stop.took.push(kept.did === 'fitted' ? `${t.key}→${kept.mount}` : kept.did === 'left' ? `${t.key}(留下)` : t.key);
          if (kept.did === 'left') stop.left.push(t.key);
        }
      }
      const pumped = await W('pump', site.id);
      if (pumped > 0.5) stop.pump = +pumped.toFixed(1);
      const fed = await W('feed');
      const body = await W('body');
      const fuel = await W('fuel');
      Object.assign(stop, { boxes: boxes.opened, food: Math.round(body.food), water: Math.round(body.water), hp: Math.round(body.hp), cap: Math.round(body.cap), fuel: +fuel.litres.toFixed(1), out: +(await W('minutes')).toFixed(1), ate: fed.ate, drank: fed.drank, missing: await W('missing') });
      log.stops.push(stop);
      if (body.dead) {
        log.problems.push({ km: stop.km, what: 'the traveller fell' });
        throw new Error(`the traveller fell at ${stop.km} km`);
      }
      console.log(`  ${stop.km.toFixed(1)} km ${String(site.sort).padEnd(10)} min ${String(Math.round(stop.out)).padStart(3)} · took ${stop.took.length}${stop.left.length ? ` left ${stop.left.length}` : ''} · food ${stop.food} water ${stop.water} life ${stop.hp}/${stop.cap} petrol ${stop.fuel} L${stop.pump ? ` (+${stop.pump} at the pump)` : ''}${stop.missing ? ` · the car lacks ${stop.missing}` : ''}`);
    }
  }
  // the end of the road asked for
  await W('board');
  const last = await W('drive', KM * 1000);
  log.legs.push({ to: KM, went: Math.round(last.went ?? 0), secs: Math.round(last.secs ?? 0), top: Math.round(last.top ?? 0), off: +(last.off ?? 0).toFixed(1) });
  await rt('setView', 'chase');
  await shot('the_end');
  log.forced = await page.evaluate(() => window.__w.forced);
  log.minutes = +(await W('minutes')).toFixed(1);
  log.kits = await W('kits');
  log.learned = await W('learned');
  log.whole = await W('whole');
  log.body = await W('body');
  log.fuel = await W('fuel');
  log.stock = await W('stock');
  log.towed = towed;
  log.dry = dryRuns;

  // ---- the record
  const news = await W('news');
  const lines = [];
  lines.push(`# 实走记录：种子 ${SEED}，新游戏到 ${KM} km`);
  lines.push('');
  lines.push(`脚本在真实游戏里走的（不是真人）。出车库起算 ${f1(log.minutes)} 分钟（不算睡觉跳过的钟点），${log.stops.length} 个地点，平均 ${f1(KM / (log.minutes / 60))} km/小时；困了就在座位上睡，一共睡了 ${log.sleeps.length} 觉。`);
  lines.push('');
  lines.push('| 新东西 | 公里 | 分钟 | 在哪 | 卡片上 |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const f of log.firsts) lines.push(`| ${await W('nameOf', f.key)}（${f.what}） | ${f.km.toFixed(1)} | ${Math.round(f.min)} | ${f.at} | ${f.note ?? ''}${f.how === 'harness' ? ' ※' : ''} |`);
  fs.writeFileSync(path.join(out, 'record.md'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(out, 'log.json'), JSON.stringify(log, null, 1));

  // each chapter's new things within its kilometres (those the road so far should have shown)
  const CH = [0, 0, 12, 30, 50, 75, 105, 140, 190];
  for (const n of news.filter((x) => x.chapter > 0 && CH[x.chapter + 1] <= KM)) {
    const f = log.firsts.find((x) => x.key === n.key);
    ok(!!f && f.km >= CH[n.chapter] - 0.01 && f.km <= CH[n.chapter + 1] + 0.01, `chapter ${n.chapter}: ${n.what} ${f ? `at ${f.km.toFixed(1)} km, minute ${Math.round(f.min)}` : 'never found'} (its kilometres ${CH[n.chapter]}–${CH[n.chapter + 1]})`);
  }
  // the pace: new things in any twenty minutes, the longest while without one
  const mins = log.firsts.filter((f) => !f.what.startsWith('car:')).map((f) => f.min).sort((a, b) => a - b);
  let most = 0;
  for (let i = 0, k = 0; i < mins.length; i++) {
    while (mins[i] - mins[k] > 20) k++;
    most = Math.max(most, i - k + 1);
  }
  const every = log.firsts.map((f) => f.min).sort((a, b) => a - b);
  let gap = every.length ? every[0] : log.minutes;
  for (let i = 1; i < every.length; i++) gap = Math.max(gap, every[i] - every[i - 1]);
  if (every.length) gap = Math.max(gap, log.minutes - every[every.length - 1]);
  log.most20 = most;
  log.longestGapMin = +gap.toFixed(1);
  fs.writeFileSync(path.join(out, 'log.json'), JSON.stringify(log, null, 1));
  console.log(`  ${log.firsts.length} new things in ${f1(log.minutes)} minutes over ${KM} km (${f1(KM / (log.minutes / 60))} km an hour of play): at most ${most} in any twenty minutes, the longest while without one ${f1(gap)} minutes`);
  console.log(`  the mark could not be put on ${log.forced.length} things or boxes (taken by the harness): ${[...new Set(log.forced.map((x) => `${x.what}@${x.at}`))].slice(0, 30).join(', ')}`);
  console.log(`  problems: ${log.problems.length ? log.problems.map((p) => `${p.km} km ${p.what}`).join('; ') : 'none'}`);
  log.missingParts = await W('missingParts');
  if (log.missingParts.length) console.log(`  the car's own parts not on it: ${log.missingParts.map((p) => `${p.mount} (${p.part}) — the plan has it at ${p.km} km, a ${p.at} [${p.boxes}]; that stop: ${JSON.stringify(log.stops.find((x) => Math.abs(x.km - p.km) < 0.02) ?? null)}`).join(' | ')}`);
  fs.writeFileSync(path.join(out, 'log.json'), JSON.stringify(log, null, 1));
  ok(KM < 12 || log.whole, 'the car whole by the end of the first chapter (方糖装齐了)');
  ok(dryRuns === 0, `never out of petrol on the road (${dryRuns})`);
  ok(towed === 0, `never stuck, towed or righted (${towed})`);
  ok(!log.body.dead && log.body.hp > 0, `alive at the end: life ${Math.round(log.body.hp)} of ${Math.round(log.body.cap)}, food ${Math.round(log.body.food)}, water ${Math.round(log.body.water)}`);
  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fs.writeFileSync(path.join(out, 'log.json'), JSON.stringify(log, null, 1));
  fail(e.stack ?? e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `f6_walk: ${bad} FAILED` : 'f6_walk: ok');
process.exit(bad ? 1 : 0);
