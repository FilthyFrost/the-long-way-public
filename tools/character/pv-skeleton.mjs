// Reads Painted Valley's starter man (CC0) and prints its rest skeleton: each joint's parent, local translation,
// local rotation and world position, so our generated skeleton can share its rest frames (and its clips).
import fs from 'node:fs';
import * as THREE from 'three';
const file = process.argv[2];
const b = fs.readFileSync(file);
const len = b.readUInt32LE(12);
const json = JSON.parse(b.slice(20, 20 + len).toString());
const nodes = json.nodes;
const parent = new Array(nodes.length).fill(-1);
nodes.forEach((n, i) => (n.children || []).forEach((c) => (parent[c] = i)));
const objs = nodes.map((n) => {
  const o = new THREE.Object3D();
  o.name = n.name || '';
  if (n.translation) o.position.fromArray(n.translation);
  if (n.rotation) o.quaternion.fromArray(n.rotation);
  if (n.scale) o.scale.fromArray(n.scale);
  if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
  return o;
});
objs.forEach((o, i) => { if (parent[i] >= 0) objs[parent[i]].add(o); });
objs.forEach((o, i) => { if (parent[i] < 0) o.updateMatrixWorld(true); });
const want = process.argv[3] === 'all' ? null : new Set((json.skins?.[0]?.joints ?? []).map((j) => j));
const e = new THREE.Euler();
const p = new THREE.Vector3();
const q = new THREE.Quaternion();
const out = [];
nodes.forEach((n, i) => {
  if (want && !want.has(i)) return;
  const o = objs[i];
  o.getWorldPosition(p); o.getWorldQuaternion(q);
  out.push({ name: o.name, parent: parent[i] >= 0 ? nodes[parent[i]].name : null,
    t: o.position.toArray().map((v) => +v.toFixed(4)), r: o.quaternion.toArray().map((v) => +v.toFixed(4)),
    s: o.scale.toArray().map((v) => +v.toFixed(3)),
    world: p.toArray().map((v) => +v.toFixed(4)), worldQ: q.toArray().map((v) => +v.toFixed(4)) });
});
if (process.argv[4] === 'json') console.log(JSON.stringify(out));
else for (const j of out) console.log(j.name.padEnd(20), (j.parent ?? '-').padEnd(16), 'T', JSON.stringify(j.t).padEnd(28), 'R', JSON.stringify(j.r).padEnd(34), 'W', JSON.stringify(j.world), j.s.join(',') !== '1,1,1' ? 'S ' + j.s : '');
