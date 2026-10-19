import { chance, range, sign } from '../../rng';
import type { Template } from '../types';

export const grinder: Template = {
  id: 'grinder',
  name: 'WINDMILL GRINDER',
  h: 28.5,
  build(b, y0, rng) {
    // Windmill Alley and The Grinder merged into one long mill. Windmill tips stay at least ~0.9 m from
    // each other and from the walls, so nothing gets pinched between two spinners.
    const mill = (x: number, y: number, arm: number, speed: [number, number], bars: number, dir = sign(rng)) =>
      b.windmill(x, y0 + y, arm, dir * range(rng, speed[0], speed[1]), bars, rng() * 6);

    // A staggered field of small windmills (4, 3, 4), neighbours spinning opposite ways.
    for (const [y, xs] of [[2.5, [2.6, 6.2, 9.8, 13.4]], [5.3, [4.4, 8, 11.6]], [8.1, [2.6, 6.2, 9.8, 13.4]]] as const) {
      const dir = sign(rng);
      xs.forEach((x, i) => mill(x, y, 1.0, [2.0, 3.0], chance(rng, 0.5) ? 2 : 3, i % 2 ? -dir : dir));
    }
    b.ledge('left', y0 + 4.6);
    b.ledge('right', y0 + 4.6);
    b.ledge('left', y0 + 9.6);
    b.ledge('right', y0 + 9.6);

    // One big windmill in the middle, flanked by two medium ones.
    mill(3.0, 12.8, 1.2, [1.6, 2.4], 3);
    mill(8, 12.8, 2.4, [1.2, 2.0], chance(rng, 0.5) ? 2 : 3);
    mill(13.0, 12.8, 1.2, [1.6, 2.4], 3);
    b.ledge('left', y0 + 14.0);
    b.ledge('right', y0 + 14.0);

    // More alternating rows of small windmills (4, 3, 4, then 3 smaller choppers). 
    for (const [y, xs, arm] of [[17.0, [2.6, 6.2, 9.8, 13.4], 1.0], [19.8, [4.4, 8, 11.6], 1.0], [22.6, [2.6, 6.2, 9.8, 13.4], 1.0], [25.4, [4.4, 8, 11.6], 0.9]] as const) {
      const dir = sign(rng);
      xs.forEach((x, i) => mill(x, y, arm, [2.0, 3.0], chance(rng, 0.5) ? 2 : 3, i % 2 ? -dir : dir));
    }
    b.ledge('left', y0 + 19.0);
    b.ledge('right', y0 + 19.0);
    b.ledge('left', y0 + 24.4);
    b.ledge('right', y0 + 24.4);
  },
};
