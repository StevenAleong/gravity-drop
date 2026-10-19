import { glassFloors, glassTiles, GLASS_ROWS } from '../helpers';
import type { Template } from '../types';

export const glassTileFloors: Template = {
  id: 'glasstiles',
  name: 'GLASS TILES',
  h: 14.5,
  build(b, y0, rng) {
    // Each floor is split into 1 to 4 tiles (never the same count twice in a row, so it never turns into
    // the Glass Floors), and each tile breaks on its own, so the first marble into each part of a floor pays.
    glassFloors(b, y0, rng, glassTiles(rng, GLASS_ROWS));
  },
};
