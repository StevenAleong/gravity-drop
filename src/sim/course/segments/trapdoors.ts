import { W } from '../../constants';
import { mulberry32, range } from '../../rng';
import type { Template } from '../types';

/** Hatches per Trapdoor Floor floor (it was 2, all opening together; 4 was tried too). */
const TRAPDOOR_CELLS = 3;
/** How long each hatch in the relay stays open (s), picked at random each time. */
const TRAPDOOR_OPEN: [number, number] = [1.2, 2.0];

/**
 * A relay of hatches where one is always open: a random cell opens for a random `dur`, and `overlap`
 * seconds before it starts closing a different random cell opens, so there's always a way through
 * somewhere, but never in a predictable place. Returns each cell's open level (0-1) at sim time t; the
 * schedule is drawn lazily from its own seeded rng, so it never runs out and replays match.
 */
function hatchRelay(seed: number, cells: number, dur: [number, number], overlap: number) {
  const rng = mulberry32(seed);
  const runs: { c: number; s: number; e: number }[] = [];
  let next = -rng() * dur[0];
  let last = -1;
  return (c: number, t: number) => {
    while (next < t + 1) {
      // Any cell but the one that's closing.
      let pick = Math.floor(rng() * (last < 0 ? cells : cells - 1));
      if (last >= 0 && pick >= last) pick++;
      const e = next + range(rng, dur[0], dur[1]);
      runs.push({ c: pick, s: next, e });
      last = pick;
      next = e - overlap;
    }
    while (runs.length && runs[0].e < t - 1) runs.shift();
    let level = 0;
    for (const r of runs) {
      if (r.c !== c || t < r.s || t > r.e) continue;
      level = Math.max(level, Math.min(1, (t - r.s) / 0.2) * Math.min(1, (r.e - t) / 0.3));
    }
    return level;
  };
}

export const trapdoors: Template = {
  id: 'trapdoors',
  name: 'TRAPDOOR FLOOR',
  h: 17.5,
  build(b, y0, rng) {
    // Nothing above the top floor (user's request): marbles drop straight onto the hatches.
    // Two floors of TRAPDOOR_CELLS cells, each cell a pair of doors that open together like a hatch. On
    // each floor one hatch is always open (a hatchRelay, user's request): which one, and for how long, is
    // random, so a marble can get lucky and land on one just as it opens. The floor spacing was set for
    // 4 m doors, whose tips hang ~3.9 m down; these are shorter, so a swinging door never pinches a
    // resting marble.
    const cw = W / TRAPDOOR_CELLS;
    [5.5, 11].forEach((dy) => {
      const fy = y0 + dy;
      const relay = hatchRelay(Math.floor(rng() * 2 ** 32), TRAPDOOR_CELLS, TRAPDOOR_OPEN, 0.4);
      for (let c = 0; c < TRAPDOOR_CELLS; c++) {
        const x0 = c * cw;
        const level = (t: number) => relay(c, t);
        b.hatch(x0, fy, cw / 2, 1, level);
        b.hatch(x0 + cw, fy, cw / 2, -1, level);
        // A hump on the shared hinge, so nothing can sit on a pivot that never drops.
        if (c > 0) b.peg(x0, fy, 0.2);
      }
    });
  },
};
