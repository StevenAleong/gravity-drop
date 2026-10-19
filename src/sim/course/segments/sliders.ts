import { range } from '../../rng';
import type { Template } from '../types';

export const sliders: Template = {
  id: 'sliders',
  name: 'SHIFTING SHELVES',
  h: 13,
  build(b, y0, rng) {
    // Lots of small shelves: rows of 3 and 2 alternating, each shelf sliding and tilting on its own.
    // Neighbours in a row can never come closer than ~1.6 m, and a shelf by a wall stays ~0.85 m off it,
    // so nothing gets pinched. The rows of 2 leave the walls open, so they get fixed side shelves sloping
    // inward: no marble can fall straight down a side. Their tips stay ~0.9 m clear of the moving shelves.
    [2.0, 4.4, 6.8, 9.2, 11.6].forEach((ry, r) => {
      for (const x of r % 2 ? [5.35, 10.65] : [2.7, 8, 13.3]) {
        b.slider(x, y0 + ry, 0.9, 0.8, range(rng, 2.0, 3.0), rng() * 6.3, 0.36, range(rng, 2, 3));
      }
      if (r % 2) {
        b.ledge('left', y0 + ry - 0.4, 2.4, 0.8);
        b.ledge('right', y0 + ry - 0.4, 2.4, 0.8);
      }
    });
  },
};
