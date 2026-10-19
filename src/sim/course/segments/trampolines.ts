import { W } from '../../constants';
import { range, sign } from '../../rng';
import type { Template } from '../types';

export const trampolines: Template = {
  id: 'trampolines',
  name: 'TRAMPOLINE PARK',
  h: 14.5,
  build(b, y0, rng) {
    // Six rows of short tilted pads that spring marbles off at an angle. Alternate rows sit in each
    // other's gaps, so every x meets a pad within two rows, and the outer pads reach the walls so
    // wall-huggers can't slip past. Rows are 2.2 m apart, above the highest bounce (~1.8 m).
    const rowA = [1.0, 4.6, 8, 11.4, 15.0];
    const rowB = [2.8, 6.3, 9.7, 13.2];
    for (let r = 0; r < 6; r++) {
      const y = y0 + 2 + r * 2.2;
      for (const x of r % 2 ? rowB : rowA) {
        // Every pad in the middle slowly rocks on its own random speed and phase, so the bounce angles keep
        // changing. Pads by a wall stay still, tilted inward, so nothing can rest in the corner.
        const byWall = x < 2 || x > W - 2;
        const dir = x < 2 ? 1 : x > W - 2 ? -1 : sign(rng);
        const wobble = byWall ? undefined : { amp: 0.3, w: range(rng, 1.25, 2.75), phase: rng() * 6.3 };
        b.tramp(x, y, 1.5, dir * range(rng, 0.2, 0.36), range(rng, 5.5, 6.5), wobble);
      }
    }
  },
};
