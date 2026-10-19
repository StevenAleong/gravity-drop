import type { Template } from '../types';
import { blackHole } from './blackhole';
import { foosball } from './foosball';
import { glass } from './glass';
import { glassTileFloors } from './glasstiles';
import { grinder } from './grinder';
import { mines } from './mines';
import { pegs } from './pegs';
import { pendulums } from './pendulums';
import { pinball } from './pinball';
import { sliders } from './sliders';
import { switches } from './switches';
import { trampolines } from './trampolines';
import { trapdoors } from './trapdoors';

/**
 * Every segment template. The order matters: `pickSegments` shuffles this list with the race's rng, so
 * reordering it (or adding to it) changes every seed's course. It's also the section guide's order.
 */
export const TEMPLATES: Template[] = [
  pegs,
  trapdoors,
  sliders,
  trampolines,
  pendulums,
  switches,
  grinder,
  glass,
  glassTileFloors,
  pinball,
  foosball,
  blackHole,
  mines,
];
