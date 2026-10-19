import { glassFloors, GLASS_ROWS } from '../helpers';
import type { Template } from '../types';

export const glass: Template = {
  id: 'glass',
  name: 'GLASS FLOORS',
  h: 14.5,
  build(b, y0, rng) {
    // Every floor is one pane across the whole width: the race's front-runner breaks each one.
    glassFloors(b, y0, rng, Array(GLASS_ROWS).fill(1));
  },
};
