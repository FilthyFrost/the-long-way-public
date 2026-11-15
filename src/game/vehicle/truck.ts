/**
 * T0 — the open-top utility truck, built from coloured primitives.
 * Model space = vehicle body frame: +x forward, +y up, +z right, origin at the centre of gravity.
 *
 * The cab is modelled for the driver's eye first: windscreen frame, dash, wheel, gauges, mirror
 * and a hanging charm are the foreground of almost every frame of the game.
 */
import * as THREE from 'three';
import type { VehicleSpec } from '../../core/vehicle/spec';
import { maskPreservingBlend, mirrorMaterial, surfaceMaterial, windscreenMaterial } from '../render/materials';
import { ModelBuilder } from './builder';
import { dialTexture, facing, PoseMesh, turnAbout, WheelHubs, type PosedPart, type Reach, type VehicleParts } from './kit';
import { ACCENT, CabParts } from './cabkit';
import { DashPanel } from './dash';
import * as P from './props';

export { SPEEDO, type VehicleParts } from './kit';

const PAINT = 0x7db4a6;
const PAINT_DARK = 0x5f9388;
const CREAM = 0xe8dec4;
const DARK = 0x393d45;
/** the dash is painted metal in the body colour, as on old working trucks */
const DASH = 0x6aa596;
const BINNACLE = 0x356c66;
const RUBBER = 0x232529;
const SEAT = 0xa3744f;
const WOOD = 0xb48d5e;
const METAL = 0x8e969b;
const RUST = 0x9a5d3e;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export function buildTruck(spec: VehicleSpec): VehicleParts {
  const H = (h: number): number => h - spec.cgHeight;
  const root = new THREE.Group();
  root.name = spec.id;
  const eyeZ = spec.eye.z;

  // ------------------------------------------------------------------ body shell (one draw call)
  const b = new ModelBuilder();
  b.span(-1.5, 1.55, H(0.3), H(0.42), -0.58, 0.58, DARK); // underbody
  // load bed
  b.span(-1.56, 0.15, H(0.58), H(0.64), -0.68, 0.68, WOOD);
  for (let i = 0; i < 6; i++) b.span(-1.5 + i * 0.27, -1.5 + i * 0.27 + 0.02, H(0.64), H(0.645), -0.66, 0.66, 0x8f6d45); // plank seams
  b.span(-1.56, 0.15, H(0.64), H(0.94), -0.7, -0.66, PAINT);
  b.span(-1.56, 0.15, H(0.64), H(0.94), 0.66, 0.7, PAINT);
  b.span(-1.56, 0.15, H(0.92), H(0.955), -0.715, -0.645, PAINT_DARK); // top rails
  b.span(-1.56, 0.15, H(0.92), H(0.955), 0.645, 0.715, PAINT_DARK);
  b.span(-1.6, -1.56, H(0.64), H(0.94), -0.7, 0.7, PAINT_DARK); // tailgate
  b.span(-1.605, -1.6, H(0.72), H(0.86), -0.5, 0.5, RUST);
  b.span(0.13, 0.19, H(0.64), H(1.06), -0.7, 0.7, PAINT); // headboard
  // cab tub
  b.span(0.19, 1.58, H(0.42), H(0.47), -0.68, 0.68, DARK);
  // the tub's sides round the half doors (the doors themselves ride in the body mesh, posed)
  const DOOR = { x0: 0.3, x1: 0.98, h0: 0.62 };
  for (const s of [-1, 1]) {
    const z0 = s * 0.655;
    const z1 = s * 0.7;
    b.span(0.19, 1.6, H(0.42), H(DOOR.h0), z0, z1, PAINT);
    b.span(0.19, DOOR.x0, H(DOOR.h0), H(0.98), z0, z1, PAINT);
    b.span(DOOR.x1, 1.6, H(DOOR.h0), H(0.98), z0, z1, PAINT);
    b.span(0.19, DOOR.x0, H(0.96), H(0.995), s * 0.64, s * 0.715, PAINT_DARK); // top rails (arm rests)
    b.span(DOOR.x1, 1.6, H(0.96), H(0.995), s * 0.64, s * 0.715, PAINT_DARK);
  }
  b.span(1.56, 1.62, H(0.42), H(1.0), -0.7, 0.7, PAINT); // nose
  b.span(1.62, 1.628, H(0.66), H(0.78), -0.7, 0.7, CREAM); // nose stripe
  b.span(1.62, 1.7, H(0.36), H(0.47), -0.68, 0.68, DARK); // bumper
  b.span(-1.66, -1.6, H(0.4), H(0.5), -0.66, 0.66, DARK); // rear bumper
  // wheel arches (dark lips over each wheel)
  const a = spec.wheelbase * (1 - spec.weightFront);
  const rb = spec.wheelbase * spec.weightFront;
  for (const wx of [a, -rb]) {
    for (const s of [-1, 1]) b.span(wx - 0.36, wx + 0.36, H(0.56), H(0.6), s * 0.6, s * 0.72, DARK);
  }
  // dashboard, binnacle, glove shelf
  b.span(1.2, 1.56, H(0.9), H(1.03), -0.655, 0.655, DASH);
  b.span(1.14, 1.24, H(0.985), H(1.155), eyeZ - 0.2, eyeZ + 0.2, BINNACLE);
  b.span(1.16, 1.24, H(0.86), H(0.92), 0.05, 0.6, 0x4d7c71);
  // bench seat
  // (the bench's cushion tilts forward over the engine: posed below)
  b.span(0.42, 0.84, H(0.6), H(0.605), -0.5, 0.5, 0x4a5058); // the engine's cover under the cushion
  b.span(0.5, 0.76, H(0.605), H(0.63), -0.25, 0.2, 0x8c3b30);
  b.span(0.66, 0.84, H(0.605), H(0.66), -0.48, -0.3, DARK); // battery
  b.span(0.68, 0.82, H(0.66), H(0.665), -0.46, -0.32, 0xb9523f);
  b.span(0.42, 0.58, H(0.605), H(0.64), 0.28, 0.44, 0x3f4650); // radiator
  b.span(0.42, 0.58, H(0.605), H(0.63), -0.46, -0.3, 0x6a7471); // the cold kit
  b.box(0.3, H(0.96), 0, 0.12, 0.5, 1.24, SEAT, { rz: -0.12 });
  b.span(0.36, 0.88, H(0.47), H(0.6), -0.6, 0.6, DARK);
  // windscreen frame
  for (const s of [-1, 1]) b.bar(1.575, H(1.0), s * 0.675, 1.365, H(1.62), s * 0.655, 0.05, PAINT);
  b.bar(1.365, H(1.62), -0.68, 1.365, H(1.62), 0.68, 0.055, PAINT);
  b.bar(1.575, H(1.015), -0.68, 1.575, H(1.015), 0.68, 0.04, PAINT_DARK);
  // roll bar behind the seat
  for (const s of [-1, 1]) b.bar(0.2, H(0.98), s * 0.66, 0.2, H(1.66), s * 0.6, 0.055, DARK);
  b.bar(0.2, H(1.66), -0.62, 0.2, H(1.66), 0.62, 0.055, DARK);
  // mirrors
  for (const s of [-1, 1]) {
    b.bar(1.5, H(1.2), s * 0.69, 1.47, H(1.3), s * 0.88, 0.02, DARK);
    b.box(1.47, H(1.32), s * 0.9, 0.035, 0.16, 0.11, DARK);
  }
  b.box(1.335, H(1.515), 0, 0.03, 0.07, 0.24, DARK); // centre mirror housing
  b.bar(1.365, H(1.6), 0, 1.34, H(1.53), 0, 0.016, DARK);
  // controls
  // steering column
  const tilt = (38 * Math.PI) / 180;
  const wheelC = new THREE.Vector3(1.09, H(1.035), eyeZ);
  b.bar(wheelC.x, wheelC.y, wheelC.z, wheelC.x + 0.34 * Math.cos(tilt), wheelC.y - 0.34 * Math.sin(tilt), wheelC.z, 0.045, DARK);
  // a lived-in cab: a road map, a little plant, a flask, a blanket — small things that make it home
  const jump = new ModelBuilder(); // things on the dash and in the bed that hop on a bump
  jump.box(1.37, H(1.036), 0.2, 0.27, 0.008, 0.2, 0xeadfc4, { ry: 0.25 });
  jump.box(1.37, H(1.041), 0.2, 0.2, 0.004, 0.012, 0xc9533e, { ry: 0.6 });
  jump.box(1.41, H(1.041), 0.15, 0.06, 0.004, 0.05, 0x7fa6b8, { ry: 0.25 });
  jump.cyl(1.44, H(1.065), -0.02, 0.045, 0.07, 0xb5633f, { segments: 8, radiusTop: 0.055 });
  jump.sphere(1.44, H(1.13), -0.02, 0.05, 0x6fae5e, 1);
  jump.sphere(1.47, H(1.15), 0.01, 0.035, 0x82bb66, 0);
  jump.sphere(1.42, H(1.16), -0.05, 0.03, 0x5c9a58, 0);
  b.cyl(0.99, H(0.59), 0.32, 0.04, 0.22, 0x4f7d6d, { segments: 8 });
  b.cyl(0.99, H(0.715), 0.32, 0.034, 0.03, 0xe9dfc4, { segments: 8 });
  b.box(0.62, H(0.745), 0.34, 0.36, 0.05, 0.42, 0xb9523f);
  b.box(0.62, H(0.773), 0.34, 0.37, 0.008, 0.1, 0xe6d9b8);
  b.box(0.62, H(0.773), 0.2, 0.37, 0.008, 0.03, 0xe6d9b8);
  b.box(1.158, H(0.89), 0.5, 0.004, 0.035, 0.07, 0xd8a03f); // stickers on the shelf
  b.box(1.158, H(0.885), 0.4, 0.004, 0.04, 0.04, 0x6f9fb5);
  // worn edges catch the light: a paler strip along the top of the dash and the door rails
  b.span(1.2, 1.215, H(1.03), H(1.034), -0.655, 0.655, 0xa9d1c4);
  // cargo: gives the bed some life and a sense of setting out
  jump.box(-0.95, H(0.85), -0.28, 0.5, 0.42, 0.46, 0x8b6b46);
  jump.box(-0.95, H(1.065), -0.28, 0.52, 0.02, 0.48, 0x7a5c3b);
  jump.box(-0.32, H(0.78), 0.36, 0.34, 0.28, 0.42, 0x6f7d5b);
  b.box(-1.32, H(0.86), 0.42, 0.18, 0.44, 0.32, 0xb4533b);
  b.cyl(-1.32, H(1.1), 0.42, 0.03, 0.05, DARK);
  b.cyl(-0.42, H(0.75), -0.42, 0.11, 0.62, 0xcbb88c, { rz: Math.PI / 2 });
  b.cyl(-1.28, H(0.7), -0.36, 0.25, 0.13, RUBBER, { segments: 16 }); // spare tyre lying flat
  b.cyl(-1.28, H(0.705), -0.36, 0.15, 0.135, CREAM, { segments: 12 });
  // ------------------------------------------------------------------ things to operate (their meaning is in controls.ts)
  const cp = new CabParts(H);
  const DRIVER: Reach[] = ['driver'];
  const FRONT: Reach[] = ['driver', 'passenger'];
  const parts: PosedPart[] = [];
  {
    // the key, the light and wiper knobs, the hazard button on the dash face beside the binnacle
    cp.key(b, new THREE.Vector3(1.195, H(0.95), -0.04), new THREE.Vector3(-1, 0, 0), DRIVER);
    cp.knob('lights', new THREE.Vector3(1.195, H(0.96), -0.6), DRIVER, 4);
    cp.knob('wipers', new THREE.Vector3(1.195, H(0.96), 0.0 + 0.06), DRIVER, 4);
    cp.button('hazard', new THREE.Vector3(1.195, H(0.985), 0.16), FRONT, 0xb9523f);
    // the gear stick on the floor and the handbrake beside it
    cp.stick('selector', new THREE.Vector3(0.99, H(0.47), 0.06), new THREE.Vector3(0.94, H(0.8), 0.06), -0.22, 0.22, FRONT, METAL);
    cp.handbrake(b, new THREE.Vector3(1.1, H(0.5), 0.16), new THREE.Vector3(0.92, H(0.62), 0.16), DRIVER);
    cp.point('horn', 1.09, H(1.035), eyeZ, 0.05, DRIVER);
    // the radio buddy rides on the dash top, turned to the driver
    cp.radioBuddy(b, P.place(1.42, H(1.034), 0.46, Math.atan2(0.46 - eyeZ, spec.eye.x - 1.42)), FRONT);
    // the glove shelf gets a lid
    cp.lid('glovebox', new THREE.Vector3(1.155, H(0.86), 0.05), new THREE.Vector3(1.16, H(0.92), 0.6), ['passenger'], 0x4d7c71, Math.PI / 2);
  }
  // the half doors: hinged at the front, open outward
  for (const s of [-1, 1]) {
    const L = s < 0 ? 'L' : 'R';
    const door = `door${L}`;
    const d = new ModelBuilder();
    d.span(DOOR.x0 + 0.004, DOOR.x1 - 0.004, H(DOOR.h0) + 0.004, H(0.98), s * 0.655, s * 0.7, PAINT);
    d.span(DOOR.x0 + 0.004, DOOR.x1 - 0.004, H(0.96), H(0.995), s * 0.64, s * 0.715, PAINT_DARK);
    d.box(DOOR.x0 + 0.12, H(0.9), s * 0.712, 0.12, 0.025, 0.025, ACCENT); // the outside handle
    d.box(DOOR.x0 + 0.12, H(0.9), s * 0.64, 0.1, 0.025, 0.025, ACCENT); // the pull inside
    d.span(DOOR.x0 + 0.08, DOOR.x1 - 0.12, H(0.68), H(0.84), s * 0.652, s * 0.655, PAINT_DARK); // a pocket
    const hinge = (t: number): THREE.Matrix4 => turnAbout(DOOR.x1, 0, s * 0.7, Y_AXIS, s * 70 * (Math.PI / 180) * t);
    parts.push({ mover: door, geo: d.build(), pose: hinge });
    cp.point(door, DOOR.x0 + 0.12, H(0.9), s * 0.62, 0.06, s < 0 ? DRIVER : ['passenger']);
    cp.point(`${door}@out`, DOOR.x0 + 0.12, H(0.9), s * 0.75, 0.07, ['outside']);
    cp.movers.push([door, '车门']);
  }
  {
    // the bench's cushion: it tilts forward to show the engine underneath (the truck's bonnet)
    const c = new ModelBuilder();
    c.span(0.36, 0.88, H(0.6), H(0.72), -0.62, 0.62, SEAT);
    c.span(0.86, 0.88, H(0.63), H(0.69), -0.1, 0.1, ACCENT); // the catch
    parts.push({ mover: 'bonnet', geo: c.build(), pose: (t) => turnAbout(0.88, H(0.6), 0, Z_AXIS, -1.2 * t) });
    cp.point('bonnet@out', 0.86, H(0.72), -0.56, 0.1, ['outside'], 'doorL');
    cp.movers.push(['bonnet', '座下机舱']);
  }
  const bodyPM = new PoseMesh(b.build(), [...parts, ...cp.room, ...cp.hood], surfaceMaterial({ vertexColors: true, flat: true, spec: 0.12, ink: true }), 'body');
  const body = bodyPM.mesh;
  root.add(body);
  const jumpers = new THREE.Group();
  jumpers.name = 'jumpers';
  const jumpMesh = new THREE.Mesh(jump.build(), body.material);
  jumpMesh.name = 'jumpers';
  jumpers.add(jumpMesh);
  root.add(jumpers);
  const movers: VehicleParts['movers'] = {};
  for (const [m, label] of cp.movers) movers[m] = { label, set: (t) => bodyPM.set(m, Math.min(1, Math.max(0, t))) };

  // ------------------------------------------------------------------ glass
  const gp = new Float32Array([1.585, H(1.03), -0.655, 1.585, H(1.03), 0.655, 1.372, H(1.6), 0.64, 1.372, H(1.6), -0.64]);
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.BufferAttribute(gp, 3));
  gg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  gg.setIndex([0, 1, 2, 0, 2, 3]);
  gg.computeVertexNormals();
  const windscreen = new THREE.Mesh(gg, windscreenMaterial(0xc4dade, 0.1));
  windscreen.name = 'windscreen';
  windscreen.renderOrder = 10;
  root.add(windscreen);

  // mirror faces: pale sky tone until real reflections arrive
  const mirrorMat = mirrorMaterial();
  const mg = new THREE.PlaneGeometry(0.1, 0.15);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(mg, mirrorMat);
    m.position.set(1.451, H(1.32), s * 0.9);
    m.rotation.y = -Math.PI / 2 + s * 0.25;
    root.add(m);
  }
  const cm = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.06), mirrorMat);
  cm.position.set(1.319, H(1.515), 0);
  cm.rotation.y = -Math.PI / 2;
  root.add(cm);

  // ------------------------------------------------------------------ lights
  const headlights = surfaceMaterial({ color: 0xf2ead2, emissive: 0xffe2a8, emissiveIntensity: 0.0 });
  const hg = new THREE.CylinderGeometry(0.085, 0.085, 0.03, 16);
  hg.rotateZ(Math.PI / 2);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(hg, headlights);
    m.position.set(1.636, H(0.86), s * 0.47);
    root.add(m);
  }
  const taillights = surfaceMaterial({ color: 0x8c2f25, emissive: 0xff3a22, emissiveIntensity: 0.0 });
  const tg = new THREE.BoxGeometry(0.02, 0.1, 0.1);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(tg, taillights);
    m.position.set(-1.612, H(0.8), s * 0.6);
    root.add(m);
  }

  // ------------------------------------------------------------------ wheels
  const wb = new ModelBuilder();
  const r = spec.wheelRadius;
  wb.cyl(0, 0, 0, r, 0.15, RUBBER, { rx: Math.PI / 2, segments: 20 });
  wb.cyl(0, 0, 0, r * 0.62, 0.156, CREAM, { rx: Math.PI / 2, segments: 16 });
  wb.cyl(0, 0, 0, r * 0.2, 0.18, METAL, { rx: Math.PI / 2, segments: 8 });
  for (let i = 0; i < 5; i++) {
    const an = (i / 5) * Math.PI * 2;
    wb.cyl(Math.cos(an) * r * 0.38, Math.sin(an) * r * 0.38, 0, 0.016, 0.165, DARK, { rx: Math.PI / 2, segments: 6 });
  }
  const wheelGeo = wb.build();
  const wheelMat = surfaceMaterial({ vertexColors: true, ink: true });
  const wheels: VehicleParts['wheels'] = [];
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    const spin = new THREE.Group();
    spin.add(new THREE.Mesh(wheelGeo, wheelMat));
    pivot.add(spin);
    root.add(pivot);
    wheels.push({ pivot, spin });
  }

  // ------------------------------------------------------------------ steering wheel
  const column = new THREE.Group();
  column.position.copy(wheelC);
  column.quaternion.copy(facing(new THREE.Vector3(-Math.cos(tilt), Math.sin(tilt), 0)));
  const steeringWheel = new THREE.Group();
  const sb = new ModelBuilder();
  const WHEEL = 0x7a5640; // a bakelite wheel, warm brown
  sb.torus(0, 0, 0, 0.175, 0.014, WHEEL);
  sb.cyl(0, 0, 0.005, 0.04, 0.035, DASH, { rx: Math.PI / 2, segments: 10 });
  sb.bar(-0.17, 0, 0, 0.17, 0, 0, 0.022, WHEEL);
  sb.bar(0, 0, 0, 0, -0.17, 0, 0.022, WHEEL);
  sb.box(0, 0.178, 0, 0.03, 0.012, 0.03, CREAM); // top-centre marker: makes rotation readable
  steeringWheel.add(new THREE.Mesh(sb.build(), surfaceMaterial({ vertexColors: true, ink: true })));
  column.add(steeringWheel);
  root.add(column);

  // ------------------------------------------------------------------ gauges
  const dialGlow = surfaceMaterial({ map: dialTexture(), mapEmissive: 0.0, fog: false });
  const cluster = new THREE.Group();
  const lookBack = new THREE.Vector3(-Math.cos(0.22), Math.sin(0.22), 0);
  cluster.position.set(1.138, H(1.075), eyeZ);
  cluster.quaternion.copy(facing(lookBack));
  const dial = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), dialGlow);
  cluster.add(dial);
  const needleGeo = new THREE.BoxGeometry(0.006, 0.058, 0.003);
  needleGeo.translate(0, 0.022, 0);
  const needleMat = surfaceMaterial({ color: 0xc9462f, emissive: 0xc9462f, emissiveIntensity: 0.15, fog: false });
  const speedNeedle = new THREE.Group();
  speedNeedle.position.set(-0.0704, 0, 0.004); // dial centre: (150 - 256) / 512 * 0.34
  speedNeedle.add(new THREE.Mesh(needleGeo, needleMat));
  cluster.add(speedNeedle);
  const fuelNeedle = new THREE.Group();
  fuelNeedle.position.set(0.0863, -0.008, 0.004);
  const fn = new THREE.Mesh(needleGeo, needleMat);
  fn.scale.set(1, 0.75, 1);
  fuelNeedle.add(fn);
  cluster.add(fuelNeedle);
  root.add(cluster);
  // the live strip (rev counter, temperature, battery, lamps, P R N D) on top of the binnacle, over the rim
  const dashPanel = new DashPanel(cluster, { pos: new THREE.Vector3(0.0, 0.135, 0.004), tiltBack: 0.0, width: 0.34, redline: spec.engine.redline });
  dashPanel.mesh.quaternion.identity();

  // ------------------------------------------------------------------ wipers (parked; animated with the weather)
  const wipers: THREE.Group[] = [];
  const wiperMat = surfaceMaterial({ color: DARK, ink: true });
  const glassN = new THREE.Vector3(-(1.6 - 1.03), -(1.585 - 1.372), 0).normalize(); // points into the cab
  for (const z of [-0.3, 0.32]) {
    const g = new THREE.Group();
    g.position.set(1.578, H(1.045), z);
    g.quaternion.copy(facing(glassN));
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.012, 0.008), wiperMat);
    arm.position.set(0.2, 0.012, 0.012);
    g.add(arm);
    root.add(g);
    wipers.push(g);
  }

  // ------------------------------------------------------------------ charm on the mirror
  const charm = new THREE.Group();
  charm.position.set(1.325, H(1.478), 0.05);
  const cb = new ModelBuilder();
  cb.bar(0, 0, 0, 0, -0.085, 0, 0.004, 0x40362c);
  cb.sphere(0, -0.1, 0, 0.02, 0xd3553e, 1);
  cb.cyl(0, -0.128, 0, 0.004, 0.035, 0xe9d7a5, { segments: 5, radiusTop: 0.016 });
  charm.add(new THREE.Mesh(cb.build(), surfaceMaterial({ vertexColors: true, flat: true, ink: true })));
  root.add(charm);

  return {
    root,
    wheels,
    steeringWheel,
    speedNeedle,
    fuelNeedle,
    charm,
    wipers,
    windscreen,
    headlights,
    taillights,
    dialGlow,
    views: {
      passenger: { x: spec.eye.x, y: spec.eye.y, z: -spec.eye.z, yaw: 0, pitch: 0, label: '副驾', seat: true },
      bedLeft: { x: -0.6, y: H(1.62), z: -0.42, yaw: 0, pitch: 0, label: '货斗长凳（左）', seat: true },
      bedRight: { x: -0.6, y: H(1.62), z: 0.42, yaw: 0, pitch: 0, label: '货斗长凳（右）', seat: true },
    },
    slots: [],
    movers,
    controls: cp.controls,
    dashPanel,
    jumpers,
    glovebox: { x: 1.1, y: H(0.86), z: 0.33, hx: 0.05, h: 0.05, hz: 0.24 },
    // under the bench's cushion
    bay: { engine: { x: 0.63, y: H(0.63), z: -0.03 }, cooling: { x: 0.5, y: H(0.61), z: 0.35 }, battery: { x: 0.75, y: H(0.61), z: -0.38 }, heater: { x: 0.5, y: H(0.61), z: -0.38 } },
    hubs: new WheelHubs(root, spec, body.material as THREE.Material),
    beam: { x: 1.75, y: 0.3 },
    footprint: { length: 4.3, width: 2.5 },
    chase: { dist: 6.4, height: 2.3, look: 0.7 },
    enclosed: 0,
  };
}

/** Soft dark patch under a vehicle until real cast shadows exist. */
export function buildBlobShadow(length: number, width: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: 0.5 } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uStrength;
      varying vec2 vUv;
      void main() {
        #include <logdepthbuf_fragment>
        vec2 d = (vUv - 0.5) * 2.0;
        float a = 1.0 - smoothstep(0.45, 1.0, length(d));
        gl_FragColor = vec4(0.05, 0.07, 0.12, a * uStrength);
      }`,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  maskPreservingBlend(mat);
  const geo = new THREE.PlaneGeometry(length, width);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  return m;
}
