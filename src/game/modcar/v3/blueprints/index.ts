/**
 * The upgrade blueprints module (docs/V3/plan/growth.md §六 2): as it is loaded the blueprints go into the catalogue
 * (folded blue sheets: the roof rack's, J9c; the ladder's and the motorcycle rack's, J9e); installed, it is the system
 * "blueprints" (system.ts): held to a vehicle, the left button held a second fits the upgrade from it.
 */
import { hasItem, registerItems } from '../../../../core/modcar/items';
import type { GameModule } from '../../kernel/modules';
import { Blueprints } from './system';

if (!hasItem('bp_roof_rack')) {
  registerItems([
    {
      id: 'bp_roof_rack',
      cat: 'gear',
      name: { zh: '图纸：车顶行李架', en: 'Blueprint: roof rack' },
      stars: 2,
      mass: 0.05,
      carry: 'small',
      salvage: { organics: 1 },
      // (a folded sheet: the photo's card, blue)
      model: 'nd_photo',
      paint: 0x2f6fb5,
      paint2: 0xe8eef5,
      blurb: '一张车顶行李架的图纸。拿着它对着车按住左键一秒，就照图装上一副行李架，车顶上就能放东西了。',
    },
  ]);
}
if (!hasItem('bp_ladder')) {
  registerItems([
    {
      id: 'bp_ladder',
      cat: 'gear',
      name: { zh: '图纸：梯子', en: 'Blueprint: ladder' },
      stars: 2,
      mass: 0.05,
      carry: 'small',
      salvage: { organics: 1 },
      model: 'nd_photo',
      paint: 0x3a86c2,
      paint2: 0xe8eef5,
      blurb: '一张梯子的图纸。拿着它对着车按住左键一秒，就照图在车身侧面装上一架铝梯子，爬上去能站在车顶上，拿行李架上的东西。',
    },
  ]);
}
if (!hasItem('bp_moto_rack')) {
  registerItems([
    {
      id: 'bp_moto_rack',
      cat: 'gear',
      name: { zh: '图纸：摩托车架', en: 'Blueprint: motorcycle rack' },
      stars: 3,
      mass: 0.05,
      carry: 'small',
      salvage: { organics: 1 },
      model: 'nd_photo',
      paint: 0x274f94,
      paint2: 0xe8eef5,
      blurb: '一张摩托车架的图纸。拿着它对着车按住左键一秒，就在车尾的挂钩座上装一副摩托车架；燕子推到架子旁边，按住左键就横着驮在车后面。装了它就挂不了挂车。',
    },
  ]);
}

export const blueprints = new Blueprints();

export default {
  id: 'blueprints',
  systems: [blueprints],
} satisfies GameModule;
