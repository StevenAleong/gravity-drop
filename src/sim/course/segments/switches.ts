import { W } from '../../constants';
import { range, sign, shuffle } from '../../rng';
import type { Template } from '../types';

/** Switch Maze: speed of the express belts on the top funnel (m/s; rolling alone reaches about 9.5). */
const SPEED_FLOOR = 13;

export const switches: Template = {
  id: 'switches',
  name: 'SWITCH MAZE',
  h: 18,
  build(b, y0, rng) {
    // A tree of flip-flop switches, like a Turing Tumble: a funnel feeds a switch, which feeds two
    // funnels with a switch each, which feed four lanes. Every marble through a switch flips it, so
    // arrival order deals the pack out across the lanes, and each lane is a different ride.
    const Y = (y: number) => y0 + y;
    const half = 1.25;
    const tilt = 0.6;
    // A funnel down to a throat 2.2 m wide (centre cx, bottom y), then the switch under it. The switch's
    // high end sits just under the short throat wall, too close for a marble to slip past on the closed
    // side. On the open side there's ~1.6 m clear under the wall: with longer throat walls and the switch
    // higher, two marbles could arch between the wall and the switch and jam it.
    const stage = (cx: number, x0: number, x1: number, top: number, y: number) => {
      b.wall(x0, Y(top), cx - 1.1, Y(y));
      b.wall(x1, Y(top), cx + 1.1, Y(y));
      b.wall(cx - 1.1, Y(y), cx - 1.1, Y(y + 0.3));
      b.wall(cx + 1.1, Y(y), cx + 1.1, Y(y + 0.3));
      b.toggle(cx, Y(y + 1.5), half, tilt, sign(rng));
    };
    stage(8, 0, W, 0.6, 3.6);
    // Speed floors (express belts, as in the old Factory) on the top funnel's walls, running down to the
    // throat. They stop short of it so the belt never shoves marbles into the switch's pivot.
    const express = { reverses: false, blend: 0.05 };
    b.conveyor(0.3, Y(0.73), 6.3, Y(3.34), SPEED_FLOOR, 1, 0, express);
    b.conveyor(W - 6.3, Y(3.34), W - 0.3, Y(0.73), -SPEED_FLOOR, 1, 0, express);
    stage(4, 0, 8, 6.1, 8.3);
    stage(12, 8, W, 6.1, 8.3);

    // Four lanes, 4 m wide, each with its own ride.
    const top = 11.4;
    const bottom = 17.6;
    b.wall(8, Y(6.1), 8, Y(bottom));
    b.wall(4, Y(10.8), 4, Y(bottom));
    b.wall(12, Y(10.8), 12, Y(bottom));
    const lanes: ((lc: number) => void)[] = [
      // Two glass floors, wall to wall: the first marble onto each is launched back up and the glass
      // shatters. The highest bounce (~2.25 m) stays below the switch's trigger band and short of the
      // floor above.
      (lc) => {
        b.breakaway(lc - 1.85, lc + 1.85, Y(top + 3.0), range(rng, 8, 9));
        b.breakaway(lc - 1.85, lc + 1.85, Y(top + 5.6), range(rng, 8, 9));
      },
      // Pegs, with short wall ledges on the middle rows so nothing slides down a wall untouched.
      // Every gap is either wide enough to pass (≥ 0.75 m clear) or closed, so nothing can wedge.
      (lc) => {
        for (let r = 0; r < 6; r++) {
          const y = Y(top + 0.6 + r * 0.9);
          if (r % 2) {
            b.peg(lc, y);
            b.wall(lc - 2, y - 0.3, lc - 1.4, y + 0.1);
            b.wall(lc + 2, y - 0.3, lc + 1.4, y + 0.1);
          } else {
            b.peg(lc - 0.7, y);
            b.peg(lc + 0.7, y);
          }
        }
      },
      // A windmill, with ledges above it turning wall-huggers onto it. Its tips stay ≥ 1 m from the walls
      // and the ledges (the house rule is 0.9 m), so nothing gets pinched.
      (lc) => {
        b.wall(lc - 2, Y(top + 0.6), lc - 1.1, Y(top + 1.3));
        b.wall(lc + 2, Y(top + 0.6), lc + 1.1, Y(top + 1.3));
        b.windmill(lc, Y(top + 3.2), 0.95, sign(rng) * range(rng, 2.5, 3.5), 3, rng() * 6);
      },
      // Three shelves from alternate walls, 2 m apart so the gap under each tip is wide open.
      (lc) => {
        for (let k = 0; k < 3; k++) {
          const s = k % 2 ? 1 : -1;
          const y = Y(top + 0.4 + k * 2.0);
          b.wall(lc + s * 2, y, lc - s * 0.6, y + 0.8);
        }
      },
    ];
    shuffle(rng, lanes).forEach((lane, i) => lane(2 + i * 4));
  },
};
