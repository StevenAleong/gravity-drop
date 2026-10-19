import RAPIER from '@dimforge/rapier2d-compat';
import { MARBLE_R } from '../constants';
import { mulberry32 } from '../rng';
import { BlastZone } from '../zones';
import type { Builder } from '.';

/**
 * Exploding pegs (see BlastZone), lit by their own seeded rng. Returns the zone: add its pegs with `mine()`.
 * A blown peg only comes back once no marble overlaps its spot.
 */
export function blasts(this: Builder, radius: [number, number], fuse: number, wave: number, gap: [number, number], kick: number, edge: number, down: number, seed: number) {
  const sim = this.sim;
  const clear = (x: number, y: number, r: number) => !sim.marbles.some((m) => Math.hypot(m.x - x, m.y - y) < r + MARBLE_R + 0.05);
  const z = new BlastZone(radius, fuse, wave, gap, kick, edge, down, mulberry32(seed), clear);
  sim.zones.push(z);
  return z;
}

/** A peg that's one of `zone`'s mines. The zone draws it (not the static layer), so it can vanish. */
export function mine(this: Builder, zone: BlastZone, x: number, y: number, r = 0.15) {
  const c = this.world.createCollider(
    RAPIER.ColliderDesc.ball(r).setTranslation(x, y).setRestitution(0.45).setFriction(0.1),
  );
  this.sim.tag(c, { kind: 'peg' });
  zone.addMine(c, x, y, r);
}
