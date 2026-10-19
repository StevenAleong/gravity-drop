import type { Builder } from '../builder';
import { COUNTDOWN, W } from '../constants';
import { range, type Rng } from '../rng';
import type { Sim } from '../sim';

/**
 * The start box: a lid over the gate and air jets in the floor that pulse out of sync during the
 * countdown, so the marbles jumble like a lottery machine instead of sitting still. The jets cut out
 * as the gate drops, and every marble falls from wherever the shuffle left it.
 */
export function mixer(sim: Sim, b: Builder, rng: Rng) {
  sim.mixerTop = sim.gateY - 5;
  b.wall(0, sim.mixerTop, W, sim.mixerTop, 0.15);
  const jets = 4;
  const w = W / jets;
  // The outer jets lean toward the middle and sweep only on the inward side, so they push marbles off
  // the walls instead of pinning them there. Tilt + amp must stay under 45° (0.785 rad) or the
  // renderer stops drawing it as an upward jet.
  const OUTER_TILT = 0.4;
  const OUTER_AMP = 0.3;
  for (let i = 0; i < jets; i++) {
    // Each jet sweeps side to side like a sprinkler, so the pile churns sideways instead of just bouncing.
    const inward = i === 0 ? 1 : i === jets - 1 ? -1 : 0;
    const dx = inward * Math.tan(OUTER_TILT);
    const jet = b.fan(i * w, sim.gateY - 2.4, w, 2.15, dx, -1, range(rng, 46, 56), range(rng, 0.6, 1.0), 0.5, rng() * 2);
    jet.until = COUNTDOWN;
    jet.sweep = { amp: inward ? OUTER_AMP : 0.7, w: range(rng, 2.5, 3.5), phase: rng() * 6.3 };
  }
}
