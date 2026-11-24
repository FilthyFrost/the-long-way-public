/**
 * The ND camera module (docs/ND/PLAN.md): as it is loaded the ND kinds go into the catalogue; installed, it is the
 * system "nd-camera" (system.ts): the instant camera's way in the hands (raised, zoomed, the shutter, the print out
 * of its slot), the prints lying about and in the hands drawn with their pictures, a camera lying about loaded with
 * film. Its pictures are kept in the browser's own store (store.ts).
 */
import { registerNdItems } from '../../../../core/v3/nd/items';
import type { GameModule } from '../../kernel/modules';
import { NdCamera } from './system';

registerNdItems();

export const ndCamera = new NdCamera();

export default {
  id: 'nd-camera',
  systems: [ndCamera],
  interact: [ndCamera],
  slices: [ndCamera.slice],
} satisfies GameModule;
