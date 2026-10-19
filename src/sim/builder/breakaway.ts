import RAPIER from '@dimforge/rapier2d-compat';
import { HALF_PI } from '../constants';
import type { Builder } from '.';

/**
 * Flat breakaway platform from x1 to x2 at height y. The first marble to land on it is launched
 * upward at `kick` m/s, and the platform breaks for good: everyone after it falls straight through.
 */
export function breakaway(this: Builder, x1: number, x2: number, y: number, kick: number) {
  const r = 0.15;
  const c = this.world.createCollider(
    RAPIER.ColliderDesc.capsule((x2 - x1) / 2, r)
      .setTranslation((x1 + x2) / 2, y)
      .setRotation(HALF_PI)
      .setFriction(0.15)
      .setRestitution(0.2),
  );
  const id = this.sim.addVisual(c, { kind: 'capsule', hh: (x2 - x1) / 2, r }, 'breakaway', false);
  this.sim.tag(c, { kind: 'breakaway', visual: id, collider: c, kick, x1, x2, y, broken: false });
}
