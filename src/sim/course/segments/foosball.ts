import { W } from '../../constants';
import { range } from '../../rng';
import type { Template } from '../types';

/**
 * Foosball: rods top to bottom (players, team), the gap between rods, and the gap between players on a rod by
 * player count (a real table's, scaled to the course: 5 men ~2.75 m apart, 3 men ~4.4 m, 2 men ~5.5 m).
 * Rods leave ~0.9 m clear between one rod's feet and the next rod's heads, and a kick (apex ~1.2 m) never sends
 * a marble into the rod above.
 */
const FOOS_RODS: [number, 'foosBlack' | 'foosYellow'][] = [
  [3, 'foosBlack'], [2, 'foosBlack'], [3, 'foosYellow'], [5, 'foosBlack'],
  [5, 'foosYellow'], [3, 'foosBlack'], [2, 'foosYellow'], [3, 'foosYellow'],
];
const FOOS_PITCH = 3.3;
const FOOS_SPACING: Record<number, number> = { 2: 5.5, 3: 4.4, 5: 2.75 };
/**
 * The goal under the last (goalie) rod: funnel walls start ~0.9 m below the goalies' feet and slope down to a
 * mouth a third of the course wide, with a round post each side and a net (just drawn) hanging below it.
 */
const FOOS_GOAL_TOP = 2.0 + 7 * FOOS_PITCH + 2.4;
const FOOS_GOAL_DROP = 2.2;
const FOOS_MOUTH = W / 3;
const FOOS_NET = 1.6;

// A foosball table's 8 rods, top to bottom as on a real table: black goalie (3), black defence (2), yellow
// attack (3), black midfield (5), yellow midfield (5), black attack (3), yellow defence (2), yellow goalie (3).
// Each rod slides its players as one, and its end players come right up to the walls, so the lane by a wall
// is only open while the rod is away: no ledges, a marble can get lucky and slip down the side. Every rod
// kicks on its own clock, swinging its players' feet up and batting marbles sideways. Below the last rod,
// a funnel squeezes everyone into the goal: a mouth a third of the course wide, into the net.
export const foosball: Template = {
  id: 'foosball',
  name: 'FOOSBALL',
  h: FOOS_GOAL_TOP + FOOS_GOAL_DROP + FOOS_NET + 0.4,
  build(b, y0, rng) {
    FOOS_RODS.forEach(([count, team], r) => {
      b.foosRod(y0 + 2.0 + r * FOOS_PITCH, count, FOOS_SPACING[count], team, range(rng, 1.8, 2.6), range(rng, 0.9, 1.4), rng() * 3, rng);
    });
    const top = y0 + FOOS_GOAL_TOP;
    const mouth = top + FOOS_GOAL_DROP;
    const x1 = (W - FOOS_MOUTH) / 2;
    const x2 = (W + FOOS_MOUTH) / 2;
    b.wall(0, top, x1, mouth);
    b.wall(W, top, x2, mouth);
    b.peg(x1, mouth, 0.22);
    b.peg(x2, mouth, 0.22);
    b.net(x1, x2, mouth, FOOS_NET);
  },
};
