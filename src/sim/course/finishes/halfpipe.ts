import { W } from '../../constants';
import type { Finish } from '../types';

/** Half-width of the drain hole at the bottom of the half-pipe (1.4 m clear: two marbles can't arch across it). */
const HALFPIPE_HOLE = 0.85;

// A half-pipe with a drain hole in the middle. A roof (Λ) over the middle sends everyone out to the
// walls, so every marble drops in from the sides and swings down the bowl toward the hole. A fast
// marble jumps the hole and swings up the far side, while a slower one behind drops straight in: speed
// can cost the leader the race. The bowl slopes toward the hole everywhere, so nothing can sit still.
export const halfpipe: Finish = {
  id: 'halfpipe',
  name: 'HALF-PIPE',
  h: 11.2,
  finish: 7.2,
  build(b, y) {
    // The roof starts 1.6 m down, clear of whatever the last segment ends in, and sits above the bowl's rims, so
    // a marble swinging in the bowl (which can't climb above the rim it came in at) never reaches it.
    b.wall(8, y + 1.6, 3.2, y + 3.4);
    b.wall(8, y + 1.6, W - 3.2, y + 3.4);
    // The bowl: a parabola from the hole's lips (y + 6.4) up to the walls (y + 4.0).
    const lipY = y + 6.4;
    const depth = 2.4;
    const n = 8;
    const span = W / 2 - HALFPIPE_HOLE;
    for (const s of [1, -1]) {
      const X = (x: number) => (s > 0 ? x : W - x);
      let px = 0;
      let py = lipY - depth;
      for (let i = 1; i <= n; i++) {
        const u = 1 - i / n; // 1 at the wall, 0 at the lip
        const x = span - u * span;
        const yy = lipY - depth * u * u;
        b.wall(X(px), py, X(x), yy);
        px = x;
        py = yy;
      }
    }
    // Basin under the bowl.
    b.wall(0, y + 9.4, 8, y + 11.1);
    b.wall(W, y + 9.4, 8, y + 11.1);
  },
};
