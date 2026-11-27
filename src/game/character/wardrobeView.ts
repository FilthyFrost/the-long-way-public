// What she wears, drawn (docs/V3/plan/character-pv.md §7): each pattern's mesh (core/character/wardrobe.ts, grown by
// the build) skinned to her bones, shown when the game says she wears it, in its item's two colours. What it covers of
// her is not drawn (her skin by region, her hair under a hat), the nightdress comes off under other clothes (a jacket
// takes all of it, trousers the skirt and what is under it: no layer shows through another), boots raise her by their
// soles, and in first person the finer sleeves and gloves are drawn instead of the coarse ones.

import * as THREE from 'three';
import { PATTERNS, type Pattern, REGIONS, type Slot } from '../../core/character/wardrobe';
import type { GarmentMesh } from '../../core/character/dress';
import { LAYER_SHADOW_NEAR } from '../render/shadow';
import { clothMaterial } from './clothMaterial';
import type { DressView } from './dressView';
import { type HerRig, attr } from './her';
import { shadowDepthMaterial } from './material';

export interface Wear {
  slot: Slot;
  pattern: Pattern;
  /** the item's colours (0xrrggbb) */
  paint: number;
  paint2: number;
}

interface Piece { tp: THREE.SkinnedMesh; fp: THREE.SkinnedMesh | null; shadow: THREE.SkinnedMesh; mat: THREE.ShaderMaterial; fpMat: THREE.ShaderMaterial | null }

export class WardrobeView {
  private readonly pieces = new Map<Pattern, Piece>();
  private key = '';
  /** what is worn now, by slot */
  readonly worn = new Map<Slot, Wear>();
  /** her soles' thickness (m): she stands this much higher */
  sole = 0;

  constructor(readonly rig: HerRig, readonly dress: DressView) {
    const parts = rig.parts;
    const make = (d: GarmentMesh, name: string, mat: THREE.Material) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', attr(d.positions, 3));
      g.setAttribute('normal', attr(d.normals, 3));
      g.setAttribute('skinIndex', attr(d.skinIndex, 4, false));
      g.setAttribute('skinWeight', attr(d.skinWeight, 4));
      g.setAttribute('aCloth', attr(d.cloth, 4));
      g.setIndex(new THREE.BufferAttribute(d.indices as unknown as THREE.TypedArray, 1));
      const m = new THREE.SkinnedMesh(g, mat);
      m.name = name;
      m.bind(rig.skeleton, new THREE.Matrix4());
      m.frustumCulled = false;
      m.visible = false;
      rig.root.add(m);
      return m;
    };
    for (const pattern of (rig.meta.garments as Pattern[] | undefined) ?? []) {
      const d = parts[`garment_${pattern}`] as GarmentMesh | undefined;
      if (!d) continue;
      const mat = clothMaterial(true);
      mat.name = `player:${pattern}`;
      const tp = make(d, `player:${pattern}`, mat);
      const shadow = make(d, `player:${pattern}_shadow`, shadowDepthMaterial());
      shadow.layers.set(LAYER_SHADOW_NEAR);
      const fd = parts[`garment_${pattern}_fp`] as GarmentMesh | undefined;
      let fp: THREE.SkinnedMesh | null = null, fpMat: THREE.ShaderMaterial | null = null;
      if (fd) {
        fpMat = clothMaterial(true);
        fp = make(fd, `player:${pattern}_fp`, fpMat);
      }
      this.pieces.set(pattern, { tp, fp, shadow, mat, fpMat });
    }
  }

  /** Puts on what the game says she wears (cheap to call every frame: only a change does anything). */
  set(wear: Wear[]): void {
    const key = wear.map((w) => `${w.slot}:${w.pattern}:${w.paint}:${w.paint2}`).sort().join('|');
    if (key === this.key) return;
    this.key = key;
    this.worn.clear();
    for (const w of wear) this.worn.set(w.slot, w);
    const cover = new Array(REGIONS.length).fill(0);
    this.sole = 0;
    const off = { top: false, skirt: false, under: false };
    let hatCut = 0;
    for (const p of this.pieces.values()) { p.tp.visible = false; p.shadow.visible = false; if (p.fp) p.fp.visible = false; }
    for (const w of wear) {
      const def = PATTERNS[w.pattern];
      const p = this.pieces.get(w.pattern);
      if (!p) continue;
      p.tp.visible = p.shadow.visible = true;
      const lit = new THREE.Color(w.paint).convertSRGBToLinear();
      const trim = new THREE.Color(w.paint2).convertSRGBToLinear();
      for (const m of [p.mat, p.fpMat]) {
        if (!m) continue;
        (m.uniforms.uLit.value as THREE.Color).copy(lit).multiplyScalar(0.92);
        // the shade: deeper and cooler, chosen as paint (not the lit colour darkened)
        (m.uniforms.uShade.value as THREE.Color).copy(lit).multiplyScalar(0.55).lerp(new THREE.Color(0.2, 0.2, 0.3), 0.25);
        (m.uniforms.uDeep.value as THREE.Color).copy(lit).multiplyScalar(0.32).lerp(new THREE.Color(0.1, 0.1, 0.18), 0.3);
        (m.uniforms.uTrim.value as THREE.Color).copy(trim).multiplyScalar(0.9);
      }
      for (const r of def.covers) cover[REGIONS.indexOf(r)] = 1;
      if (def.dress?.top) off.top = true;
      if (def.dress?.skirt) off.skirt = true;
      if (def.dress?.under) off.under = true;
      if (def.sole) this.sole = Math.max(this.sole, def.sole);
      if (def.hatCut) hatCut = Math.max(hatCut, def.hatCut);
    }
    for (const m of [this.rig.skin, this.rig.arms.l.material as THREE.ShaderMaterial]) m.uniforms.uCover.value = cover;
    // (a hat is not worn over her helmet)
    if (this.rig.helmet) for (const [pattern, p] of this.pieces) if (PATTERNS[pattern as Pattern]?.slot === 'hat') { p.tp.visible = false; if (p.fp) p.fp.visible = false; if (p.shadow) p.shadow.visible = false; }
    this.rig.hairMat.uniforms.uHatCut.value = hatCut;
    // what of the nightdress is left on
    this.dress.show(!off.top, !off.skirt, !off.under);
  }

  /** Each frame: first person's finer sleeves and gloves (shown only when showArms is true, e.g. seated driving). */
  update(firstPerson: boolean, showArms = firstPerson, inCab = 0): void {
    for (const [pattern, p] of this.pieces) {
      const on = [...this.worn.values()].some((w) => w.pattern === pattern);
      if (!on) continue;
      p.mat.uniforms.uInCab.value = inCab;
      if (p.fpMat) p.fpMat.uniforms.uInCab.value = inCab;
      const fine = !!p.fp && firstPerson && showArms;
      if (p.fp) {
        p.fp.visible = fine;
        if (p.fpMat) p.fpMat.uniforms.uHide.value = fine ? 4 : 0;
      }
      // (a hat sits at the eye: not drawn from her own eyes, but its shadow is)
      const slot = PATTERNS[pattern].slot;
      if (slot === 'hat') {
        // (none over her helmet)
        p.tp.visible = !firstPerson && !this.rig.helmet;
        p.shadow.visible = !this.rig.helmet;
        continue;
      }
      if (firstPerson && !showArms) {
        // on-foot first person: hide gloves and coarse jacket sleeves so held items float cleanly without hands/arms
        p.mat.uniforms.uHide.value = slot === 'gloves' ? 1 : slot === 'jacket' ? 2 : 0;
      } else {
        // in seated first person, gloves yield wholly to the finer mesh; jacket body/sleeves are handled by firstPersonBody
        p.mat.uniforms.uHide.value = fine && slot === 'gloves' ? 1 : 0;
      }
    }
  }

  /**
   * After update: in a seat from her own eyes what she wears on her trunk and legs is not drawn (only the upper-arm
   * bridge and finer sleeves/gloves on her arms are); on foot, what of it stands near the eye over the middle of the
   * view is seen through (`fade` 0 … 1, the frame drawn into in px: material.ts seeViewFade).
   */
  firstPersonBody(hidden: boolean, fade: number, w: number, h: number): void {
    for (const [pattern, p] of this.pieces) {
      const slot = PATTERNS[pattern as Pattern]?.slot;
      if (slot === 'hat') continue;
      if (hidden) p.mat.uniforms.uHide.value = slot === 'jacket' ? 3 : 1;
      (p.mat.uniforms.uSeeView.value as THREE.Vector3).set(fade, w, h);
    }
  }
}
