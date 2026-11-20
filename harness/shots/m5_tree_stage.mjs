// Browser-side review fixture. The production frame (including paint and grade), sun,
// leaf texture, growth, instance attributes and metre scale are shared with the road.
import * as T from 'three';
import { crownSpecies, growSpeciesModel } from '../../src/game/scene/crowns/species';
import { CROWN_PAINT } from '../../src/game/scene/crowns/palette';
import { crownMaterial } from '../../src/game/render/crownMaterial';
import { globals } from '../../src/game/render/shaderlib';
import { CROWN_NEAR, CROWN_MID, SHRUB_NEAR, SHRUB_MID } from '../../src/game/scene/crowns/crownView';

export const families = [...crownSpecies().keys()];
const material = crownMaterial();
export function photograph(names, distance, season, comparison = false) {
  const g = window.__rt.game;
  const scene = new T.Scene();
  scene.background = new T.Color(0xc8dfde);
  const portrait = season==='bearing' || season==='dormant';
  let month = 7;
  if (portrait) {
    const day = {fruit_tree:255,lemon:40,mesquite:207,chilean_firebush:320,cactus:151,saguaro:151}[names[0]];
    month = Math.floor(((season==='bearing'?day:(day+182)%365)/365)*12)+1;
  }
  const snowy = season === 'winter';
  globals.uWeather.value.y = snowy ? 0.9 : 0;
  globals.uShadowParams.value.x = 0;
  const floor = new T.Mesh(new T.PlaneGeometry(1400,1400),new T.MeshBasicMaterial({color:snowy ? 0xdce6e1 : 0x9dad83}));
  floor.rotation.x = -Math.PI/2;
  scene.add(floor);
  const row = [];
  let width = 0, height = 0;
  for (const name of names) {
    const s = crownSpecies().get(name);
    const paint = CROWN_PAINT[name];
    const bare = snowy && (paint?.autumn !== undefined || name.startsWith('broadleaf'));
    const near = s.def.small ? SHRUB_NEAR : CROWN_NEAR, mid = s.def.small ? SHRUB_MID : CROWN_MID;
    const level = distance < near ? 0 : distance < mid ? 1 : 2;
    for (const [variant, shapes] of s.models.entries()) {
      if (portrait && variant>0) continue;
      const v = s.def.variants[variant];
      const model = bare ? growSpeciesModel(v.grow,v.seed,level,true) : shapes[level];
      const geometry = model.geometry.clone();
      const leaf = season === 'autumn' ? paint?.autumn ?? paint?.leaf : paint?.leaf;
      geometry.setAttribute('aFade',new T.InstancedBufferAttribute(new Float32Array([1,0,0,0]),4));
      geometry.setAttribute('aLook',new T.InstancedBufferAttribute(new Float32Array([month/128, name==='fruit_tree'||name==='lemon'?2:0,leaf ?? -1,name==='fruit_tree'?0xb85031:paint?.bark ?? 0x755f4c]),4));
      geometry.setAttribute('aTree',new T.InstancedBufferAttribute(new Float32Array([0.56,s.def.sway,s.def.bark==='accent'?1:0,1]),4));
      const mesh = new T.InstancedMesh(geometry,material,1);
      const radius = Math.max(...shapes.map(m=>m.radius));
      width += radius+0.7;
      row.push({ mesh,x:width });
      width += radius+0.7;
      height = Math.max(height,model.height);
      scene.add(mesh);
      if (bare) model.geometry.dispose();
    }
  }
  for (const {mesh,x} of row) mesh.position.x=x-width/2;
  const camera = g.core.camera.clone();
  // One family per near portrait, grouped families downrange at the driving field of view.
  camera.fov = distance<40 ? 2*Math.atan(Math.max(height*0.65,width*0.54/camera.aspect)/distance)*180/Math.PI : 55;
  if (comparison) camera.fov = distance < 40 ? 55 : 35;
  const eye = comparison ? 4.2 : height*0.44;
  camera.position.set(0,eye,distance);
  camera.lookAt(0,eye,0);
  if (portrait && distance < 10) {
    camera.fov=36;
    camera.position.set(0,height*0.66,distance);
    camera.lookAt(0,height*0.66,0);
  }
  camera.updateProjectionMatrix();
  g.core.frame.render(scene,camera,0);
  const img = g.core.renderer.domElement.toDataURL('image/png');
  for (const {mesh} of row) { mesh.geometry.dispose(); mesh.dispose(); }
  floor.geometry.dispose(); floor.material.dispose();
  return img.slice(img.indexOf(',')+1);
}
