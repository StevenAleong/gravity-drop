import { range } from '../../rng';
import type { Template } from '../types';

export const pendulums: Template = {
  id: 'pendulums',
  name: 'PENDULUM SWING',
  h: 17.5,
  build(b, y0, rng) {
    // Six rows of pendulums with bumper balls for bobs, each on its own speed and phase. Only the balls
    // are solid; marbles pass through the rods. Rows of 4 (x 3.2-12.8) alternate with rows of 3 (x 4.8-11.2),
    // so at rest the balls of two rows cover every x between the walls. The walls never move: rows of 4
    // get short ledges and rows of 3 long ones, so a wall-hugger can't drop straight through. Swinging
    // balls stay ~0.9 m from each other and from the ledges, so nothing gets pinched, and the soft kick
    // (bounce apex under ~2 m) keeps marbles from being juggled back up into the row above, 2.6 m up.
    const rod = 1.5;
    for (let r = 0; r < 6; r++) {
      const y = y0 + 2.8 + r * 2.6;
      for (const x of r % 2 ? [4.8, 8, 11.2] : [3.2, 6.4, 9.6, 12.8]) {
        b.pendulum(x, y - rod, rod, 0.55, range(rng, 0.3, 0.42), range(rng, 1.8, 2.6), rng() * 6.3, range(rng, 3.5, 5.5));
      }
      const [len, drop] = r % 2 ? [2.6, 0.8] : [1.0, 0.6];
      b.ledge('left', y - drop / 2, len, drop);
      b.ledge('right', y - drop / 2, len, drop);
    }
  },
};
