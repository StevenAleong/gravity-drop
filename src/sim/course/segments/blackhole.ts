import type { VortexGrowth, VortexRing } from '../../zones';
import { W } from '../../constants';
import { sign } from '../../rng';
import type { Template } from '../types';

/** Black Hole section: the hole's centre (below the section's top), the bowl's radius around it, the horizon's radius. */
const BH_CY = 8.5;
const BH_BOWL = 7.4;
const BH_R = 1.0;
/**
 * Its two rings (see Vortex). Orbit ring, out to the bowl: almost no normal gravity, so orbits stay round
 * and spiral in slowly instead of diving in on their first pass, and the pull at the floor (~16.6 m/s²)
 * easily beats what's left of gravity, so nothing can rest there. Inner: a strong pull and a low spin, so
 * reaching it means getting sucked in. Each spin stays under its ring's orbit speed √(accel · r) (10.7 m/s
 * in the orbit ring), so orbits decay.
 */
const BH_RINGS: VortexRing[] = [
  { r: BH_BOWL + 0.3, accel: 15, spin: 10.4, ease: 0.04, grav: 0.1 },
  { r: 1.3, accel: 70, spin: 4, ease: 0.05, grav: 0 },
];
/**
 * The inner ring starts small and weak, and grows to this once the hole swallows its first marble (see
 * VortexGrowth): out to 75% of the orbit ring's radius in 5 s. Its pull at that edge is only 55 m/s² (the
 * orbit ring's is ~20 there), as the pull grows as r/d inward: that's still ~310 m/s² by the horizon.
 */
const BH_GROW: VortexGrowth = { r: (BH_BOWL + 0.3) * 0.75, accel: 55, time: 5, idle: 3 };
const BH_BLEND = 0.8;

// One big black hole (a Vortex) whose well fills the whole width. Its lower half is a round bowl
// centred on the hole, so the floor follows the field and nothing can roll out of reach; the top is
// open, so a marble can fall straight in. Marbles get dragged around the hole, roll round the bowl, lift
// off it, collide and spiral into the horizon, then drop out of the bottom and carry on.
export const blackHole: Template = {
  id: 'blackhole',
  name: 'BLACK HOLE',
  h: BH_CY + BH_BOWL + 3.1,
  build(b, y0, rng) {
    const cy = y0 + BH_CY;
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI;
      const a1 = ((i + 1) / n) * Math.PI;
      b.wall(W / 2 + BH_BOWL * Math.cos(a0), cy + BH_BOWL * Math.sin(a0), W / 2 + BH_BOWL * Math.cos(a1), cy + BH_BOWL * Math.sin(a1));
    }
    // The bowl's rims stop short of the walls: close the gaps with ramps from the walls.
    b.wall(0, cy - 1.2, W / 2 - BH_BOWL, cy);
    b.wall(W, cy - 1.2, W / 2 + BH_BOWL, cy);
    b.vortex(W / 2, cy, BH_R, BH_BOWL + 0.3, 0, sign(rng), W / 2, cy + BH_BOWL + 1.6, { rings: BH_RINGS, blend: BH_BLEND, grow: BH_GROW });
  },
};
