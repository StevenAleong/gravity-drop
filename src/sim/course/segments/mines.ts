import { W } from '../../constants';
import type { Template } from '../types';

/**
 * Minefield: blast radius range (m), how long a lit peg glows before it blows (s), how long its shockwave
 * takes to spread (s), seconds between pegs being lit, the throw (m/s at the centre, and the share left at
 * the rim), and how long a blown peg stays gone (s). An upward throw of 14 m/s peaks ~5.4 m up (g = 18).
 */
const MINE_R: [number, number] = [2.2, 3.0];
const MINE_FUSE = 0.7;
const MINE_WAVE = 0.1;
const MINE_GAP: [number, number] = [0.08, 0.16];
const MINE_KICK = 14;
const MINE_EDGE = 0.45;
const MINE_DOWN = 2;
/** The mine grid: rows, the gap between them, gaps per wall-to-wall row, and the outer pegs' x (against the wall). */
const MINE_ROWS = 11;
const MINE_ROW_GAP = 1.5;
const MINE_COLS = 10;
const MINE_WALL = 0.2;

// A peg field where the pegs are mines (a BlastZone). Every so often a random peg lights up, glows for a
// moment, then blows up: its shockwave throws every marble in reach straight away from it (up, down or
// sideways, depending on which side of it you were), and the peg is gone for MINE_DOWN s, leaving a hole
// in the field. No wall ledges (user's request): an even, staggered grid instead, whose outer pegs sit
// against the walls. Those close the wall lane (too narrow to pass, and a marble landing on one rolls off
// inward), and the rows between leave ~0.83 m clear by the wall, so nothing drops down a wall untouched.
// Each row's pegs cover ±0.47 m (peg + marble radius) around them, and two rows cover every x.
export const mines: Template = {
  id: 'mines',
  name: 'MINEFIELD',
  h: 18,
  build(b, y0, rng) {
    const zone = b.blasts(MINE_R, MINE_FUSE, MINE_WAVE, MINE_GAP, MINE_KICK, MINE_EDGE, MINE_DOWN, Math.floor(rng() * 2 ** 32));
    const step = (W - 2 * MINE_WALL) / MINE_COLS;
    for (let r = 0; r < MINE_ROWS; r++) {
      const y = y0 + 1.4 + r * MINE_ROW_GAP;
      // Even rows run wall to wall (MINE_COLS + 1 pegs); odd rows sit in their gaps.
      for (let x = r % 2 ? MINE_WALL + step / 2 : MINE_WALL; x < W - MINE_WALL + 0.01 - (r % 2) * step / 2; x += step) b.mine(zone, x, y);
    }
  },
};
