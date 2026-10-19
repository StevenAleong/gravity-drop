import { W } from '../../constants';
import { range } from '../../rng';
import type { Template } from '../types';

/** Pinball: depth of the lower table (inlane guides, slingshots and flippers) below the playfield. */
const PINBALL_LOW = 13.5;

// A pinball table: a playfield of big, spaced-out pop bumpers, then the lower table of a real machine.
// Inlane guides funnel everything into a pair of flippers over a narrow drain, two slingshots stand in
// front of the flippers (off the walls, so marbles can roll down the inlane behind them), and an
// outlane beside each wall lets a lucky marble skip the flippers altogether. (It used to be the
// "Final Pinball" finale.)
export const pinball: Template = {
  id: 'pinball',
  name: 'PINBALL',
  h: PINBALL_LOW + 5.5,
  build(b, y0, rng) {
    // Rows of 2, 1, 2, 3, 2 bumpers, all the same size. Gaps in a row stay wide (3.8 m clear here): with
    // 1 m gaps nearly every marble clipped a bumper and got kicked back up, so a row became a ceiling.
    const pops: [number, number][] = [
      [3.9, 2.5], [12.1, 2.5],
      [8, 4.2],
      [5.5, 7.2], [10.5, 7.2],
      [3.0, 9.8], [8, 9.8], [13.0, 9.8],
      [5.5, 12.0], [10.5, 12.0],
    ];
    for (const [bx, by] of pops) b.bumper(bx, y0 + by, 0.6);
    // Plain bars on the walls turn wall-huggers back into the playfield, so few marbles fall straight
    // into an outlane.
    for (const [y, len] of [[4.8, 1.6], [10.6, 1.4]]) {
      b.wall(0, y0 + y, len, y0 + y + 1.0);
      b.wall(W, y0 + y, W - len, y0 + y + 1.0);
    }

    // The lower table, from y0 + PINBALL_LOW. On each side: an inlane guide slopes from 1 m off the wall
    // down to the flipper's hinge (the gap between it and the wall is the outlane, ~0.85 m clear, and
    // nothing below it), a slingshot stands in front of the flipper with its kicking face toward the
    // middle and ~0.85 m of inlane clear behind it, and the flipper sits at the bottom. The drain between
    // the flipper tips is ~2.2 m clear: much narrower than the old funnel's, but still too wide for two
    // marbles to arch across.
    const L = y0 + PINBALL_LOW;
    const phase = rng() * 2;
    for (const s of [1, -1]) {
      const X = (x: number) => (s > 0 ? x : W - x);
      b.wall(X(1.0), L + 0.6, X(5.2), L + 3.55);
      b.sling(X(2.4), L, X(4.8), L + 1.8, 8);
      b.flipper(X(5.35), L + 3.6, 1.5, s, range(rng, 1.0, 1.6), phase + (s > 0 ? 0 : 0.5));
    }
  },
};
