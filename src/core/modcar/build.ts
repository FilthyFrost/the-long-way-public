/**
 * Putting vehicles together (docs/MODCAR.md §2): part instances, a frame's factory fit, fitting and taking
 * off parts, and a compact text form of a build for URLs, saves and tests.
 *
 * Any part fits any mount of its category, on any frame; nothing here checks "realism". What a build
 * can actually do is decided by rules.ts and derive.ts.
 */
import { frameDef } from './frames';
import { FACTORY_PAINT } from './palette';
import { hasPart, partDef, PARTS } from './parts';
import { SUB_CATEGORIES, type Build, type FrameDef, type MountDef, type PartDef, type PartInstance } from './types';

let counter = 0;

/** a fresh id for a part instance or a build (unique within the session, readable in logs) */
export function newUid(prefix: string): string {
  counter++;
  return `${prefix}${counter.toString(36)}`;
}

export interface InstanceOpts {
  cond?: number;
  paint?: number;
  dirt?: number;
  rust?: number;
  /** tanks: litres of petrol (or `fuelType`) in it; default empty */
  fuelL?: number;
  fuelType?: 'petrol' | 'diesel' | 'mix2t';
  /** batteries: charge 0…1 (default 0.8) */
  charge?: number;
  /** engines: oil as a share of full (default full); radiators: coolant share (default full) */
  oil?: number;
  coolant?: number;
  tread?: number;
}

/** a new instance of a part, with its fluids where it holds any */
export function newInstance(partId: string, o: InstanceOpts = {}): PartInstance {
  const p = partDef(partId);
  const inst: PartInstance = {
    uid: newUid('p'),
    part: partId,
    cond: o.cond ?? 1,
    paint: o.paint ?? -1,
    dirt: o.dirt ?? 0,
    rust: o.rust ?? 0,
    fluids: {},
    sub: {},
  };
  if (p.engine && p.engine.oilL > 0) inst.fluids.oilL = p.engine.oilL * (o.oil ?? 1);
  if (p.radiator) inst.fluids.coolantL = p.radiator.coolantL * (o.coolant ?? 1);
  if (p.battery) inst.fluids.charge = o.charge ?? 0.8;
  if (p.fuelTank) {
    const l = Math.min(p.fuelTank.litres, o.fuelL ?? 0);
    inst.fluids.fuel = l > 0 ? { [o.fuelType ?? 'petrol']: l } : {};
  }
  if (p.tire) inst.tread = o.tread ?? 1;
  return inst;
}

/** the sub-mounts a part offers: a tyre on a rim that takes one, a turbo on an engine that takes one */
export function subMountsOf(p: PartDef): string[] {
  const out: string[] = [];
  if (p.rim?.tire) out.push('tire');
  if (p.engine?.turbo) out.push('turbo');
  return out;
}

/** the category a sub-mount takes ('tire' → tire, 'turbo' → turbo) */
export function subCategory(sub: string): PartDef['cat'] {
  return sub === 'tire' ? 'tire' : 'turbo';
}

/** can this part sit on that mount? (category only — that is the whole point) */
export function fits(mount: MountDef, p: PartDef): boolean {
  return mount.cat === p.cat;
}

/** every mount of the frame that takes this part */
export function mountsFor(frame: FrameDef, p: PartDef): MountDef[] {
  return frame.mounts.filter((m) => fits(m, p));
}

/** is it a part that goes on another part? (a tyre, a turbo) */
export function isSubPart(p: PartDef): boolean {
  return SUB_CATEGORIES[p.cat] !== undefined;
}

/**
 * Fit an instance to a mount; whatever was there comes off and is returned (a swap).
 * A panel remembers the frame it now has the shape of.
 */
export function fitPart(build: Build, mountId: string, inst: PartInstance): PartInstance | null {
  const frame = frameDef(build.frame);
  const mount = frame.mounts.find((m) => m.id === mountId);
  if (!mount) throw new Error(`frame ${frame.id} has no mount ${mountId}`);
  const p = partDef(inst.part);
  if (!fits(mount, p)) throw new Error(`${p.id} (${p.cat}) does not go on ${mountId} (${mount.cat})`);
  const old = build.parts[mountId] ?? null;
  if (mount.cat === 'door' || mount.cat === 'hood' || mount.cat === 'trunk') inst.shapeOf = frame.id;
  build.parts[mountId] = inst;
  return old;
}

export function removePart(build: Build, mountId: string): PartInstance | null {
  const old = build.parts[mountId] ?? null;
  delete build.parts[mountId];
  return old;
}

/** fit a tyre to a rim or a turbo to an engine; returns what was there */
export function fitSub(parent: PartInstance, sub: string, inst: PartInstance): PartInstance | null {
  const host = partDef(parent.part);
  if (!subMountsOf(host).includes(sub)) throw new Error(`${host.id} has no ${sub} mount`);
  const p = partDef(inst.part);
  if (p.cat !== subCategory(sub)) throw new Error(`${p.id} does not go on a ${sub} mount`);
  const old = parent.sub[sub] ?? null;
  parent.sub[sub] = inst;
  return old;
}

export function removeSub(parent: PartInstance, sub: string): PartInstance | null {
  const old = parent.sub[sub] ?? null;
  delete parent.sub[sub];
  return old;
}

/** the factory part for a mount of a frame (tags stock:<frame>), or null if the frame has none for it */
export function stockPartFor(frame: FrameDef, mount: MountDef): string | null {
  if (frame.bare?.includes(mount.id)) return null;
  const tag = `stock:${frame.id}`;
  const cands = PARTS.filter((p) => p.cat === mount.cat && p.tags?.includes(tag));
  if (!cands.length) return null;
  if (cands.length === 1) return cands[0].id;
  // several factory parts of one category: the rear seats get the bench, a motorhome's rear hubs the dual rims
  if (mount.cat === 'seat') {
    const bench = cands.find((p) => p.id === 'seat_bench');
    const single = cands.find((p) => p.id !== 'seat_bench');
    const rearSeat = mount.id === 'seat_rear' || mount.id === 'seat_dinette';
    return (rearSeat ? bench : single)?.id ?? cands[0].id;
  }
  if (mount.cat === 'rim') {
    const dual = cands.find((p) => p.rim?.dual);
    const single = cands.find((p) => !p.rim?.dual);
    return ((mount.axle === 'rear' ? dual : single) ?? cands[0]).id;
  }
  return cands[0].id;
}

/** the tyre a frame's factory rims wear */
export function stockTireFor(frame: FrameDef): string | null {
  const tag = `stock:${frame.id}`;
  return PARTS.find((p) => p.cat === 'tire' && p.tags?.includes(tag))?.id ?? null;
}

export interface BuildOpts {
  /** share of the tank filled (default 0.6) */
  fuel?: number;
  /** condition of every part (default 1) */
  cond?: number;
  /** leave these mounts empty */
  without?: readonly string[];
  paint?: number;
  paint2?: number;
}

/** a frame with its whole factory fit: the vehicle as it left the works */
export function stockBuild(frameId: string, o: BuildOpts = {}): Build {
  const frame = frameDef(frameId);
  const paints = FACTORY_PAINT[frameId] ?? [0, 1];
  const build: Build = { uid: newUid('b'), frame: frameId, paint: o.paint ?? paints[0], paint2: o.paint2 ?? paints[1], dirt: 0, rust: 0, cond: o.cond ?? 1, parts: {} };
  const tyre = stockTireFor(frame);
  const without = new Set(o.without ?? []);
  for (const m of frame.mounts) {
    if (without.has(m.id)) continue;
    const id = stockPartFor(frame, m);
    if (!id) continue;
    const p = partDef(id);
    const fuelL = p.fuelTank ? p.fuelTank.litres * (o.fuel ?? 0.6) : 0;
    const fuelType = frame.mounts.some((mm) => mm.cat === 'engine') ? stockFuelType(frame) : 'petrol';
    const inst = newInstance(id, { cond: o.cond, fuelL, fuelType });
    if (p.rim?.tire && tyre) fitSub(inst, 'tire', newInstance(tyre, { cond: o.cond }));
    fitPart(build, m.id, inst);
  }
  return build;
}

/** the fuel the factory engine of a frame burns */
function stockFuelType(frame: FrameDef): 'petrol' | 'diesel' | 'mix2t' {
  const eng = frame.mounts.find((m) => m.cat === 'engine');
  const id = eng ? stockPartFor(frame, eng) : null;
  return id ? (partDef(id).engine?.fuel ?? 'petrol') : 'petrol';
}

// ------------------------------------------------------------------ text form

/**
 * "sedan;engine=eng_v8+turbo:turbo_small;hub_FL=rim_cart;seat_driver=seat_toilet;-hood"
 * The first field is a frame id, or "stock:<frame>" to start from its factory fit; then mount=part
 * (+sub:part for a tyre or turbo), or -mount to leave it empty.
 */
export function decodeBuild(text: string, o: BuildOpts = {}): Build {
  const fields = text.split(';').map((f) => f.trim()).filter(Boolean);
  const head = fields.shift() ?? 'stock:sedan';
  const stock = head.startsWith('stock:');
  const frameId = stock ? head.slice(6) : head;
  const build = stock ? stockBuild(frameId, o) : { uid: newUid('b'), frame: frameId, paint: o.paint ?? 0, paint2: o.paint2 ?? 1, dirt: 0, rust: 0, cond: 1, parts: {} };
  frameDef(frameId);
  for (const f of fields) {
    if (f.startsWith('-')) {
      removePart(build, f.slice(1));
      continue;
    }
    const [mountId, rhs] = f.split('=');
    if (!mountId || !rhs) throw new Error(`bad build field "${f}"`);
    const [partId, ...subs] = rhs.split('+');
    if (!hasPart(partId)) throw new Error(`bad build field "${f}": unknown part ${partId}`);
    const p = partDef(partId);
    const inst = newInstance(partId, { fuelL: p.fuelTank ? p.fuelTank.litres * (o.fuel ?? 0.6) : 0, fuelType: guessFuel(build) });
    for (const s of subs) {
      const [sub, subPart] = s.split(':');
      if (subPart === undefined) {
        // a bare "+tyre" keeps the factory tyre: nothing to do
        continue;
      }
      if (subPart) fitSub(inst, sub, newInstance(subPart));
    }
    // a rim given without a tyre keeps the frame's factory tyre unless "+tire:" says none
    if (p.rim?.tire && !subs.some((s) => s.startsWith('tire:'))) {
      const t = stockTireFor(frameDef(frameId));
      if (t) fitSub(inst, 'tire', newInstance(t));
    }
    fitPart(build, mountId, inst);
  }
  return build;
}

function guessFuel(build: Build): 'petrol' | 'diesel' | 'mix2t' {
  const eng = Object.values(build.parts).find((i) => partDef(i.part).engine);
  return eng ? (partDef(eng.part).engine?.fuel ?? 'petrol') : 'petrol';
}

export function encodeBuild(build: Build): string {
  const fields = [build.frame];
  for (const [mount, inst] of Object.entries(build.parts).sort(([a], [b]) => a.localeCompare(b))) {
    let f = `${mount}=${inst.part}`;
    for (const [sub, si] of Object.entries(inst.sub)) f += `+${sub}:${si.part}`;
    fields.push(f);
  }
  return fields.join(';');
}

/** every instance in a build, sub-parts included */
export function* allInstances(build: Build): Generator<{ mount: string; sub: string | null; inst: PartInstance }> {
  for (const [mount, inst] of Object.entries(build.parts)) {
    yield { mount, sub: null, inst };
    for (const [sub, si] of Object.entries(inst.sub)) yield { mount, sub, inst: si };
  }
}
