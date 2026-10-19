import { W } from '../../constants';
import { range } from '../../rng';
import type { Finish } from '../types';

// Funnel walls from both side walls down to the throat (x 6.6-9.4) 4.6 m lower, then the finish line
// and a V-shaped basin. Only the middle stretch of each funnel wall is a slingshot; the plain bit by the
// throat lets marbles settle out instead of ping-ponging forever.
export const funnel: Finish = {
  id: 'funnel',
  name: 'SLINGSHOT FUNNEL',
  h: 9.5,
  finish: 5.5,
  build(b, y, rng) {
    const fy = (x: number) => y + (x / 6.6) * 4.6;
    for (const s of [1, -1]) {
      const X = (x: number) => (s > 0 ? x : W - x);
      b.wall(X(0), fy(0), X(1.2), fy(1.2));
      b.sling(X(1.2), fy(1.2), X(4.6), fy(4.6), 6);
      // A short flipper at the bottom of each wall, like a pinball table's: marbles rolling down the wall
      // land on it and can get flicked back up. The drain between the two tips stays ~3.5 m wide, so
      // marbles always get through.
      b.wall(X(4.6), fy(4.6), X(5.2), fy(5.2));
      b.flipper(X(5.35), fy(5.35), 1.5, s, range(rng, 1.6, 2.4), rng() * 0.25);
    }
    b.wall(0, y + 8, 8, y + 9.7);
    b.wall(W, y + 8, 8, y + 9.7);
  },
};
