import type { Finish } from '../types';
import { freefall } from './freefall';
import { funnel } from './funnel';
import { halfpipe } from './halfpipe';

/** Every finish. The order matters: `buildCourse` picks one by index from a seeded roll. */
export const FINISHES: Finish[] = [funnel, halfpipe, freefall];
