import RAPIER from '@dimforge/rapier2d-compat';
import { HALF_PI } from '../constants';
import type { Builder } from '.';

/** Pinball slingshot: a kicker wall that fires marbles off its upper face (the side facing up). */
export function sling(this: Builder, x1: number, y1: number, x2: number, y2: number, kick: number) {
  const r = 0.18;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const c = this.world.createCollider(
    RAPIER.ColliderDesc.capsule(len / 2, r)
      .setTranslation((x1 + x2) / 2, (y1 + y2) / 2)
      .setRotation(Math.atan2(y2 - y1, x2 - x1) - HALF_PI)
      .setFriction(0.1)
      .setRestitution(0.3),
  );
  const id = this.sim.addVisual(c, { kind: 'capsule', hh: len / 2, r }, 'sling', false);
  let nx = (y2 - y1) / len;
  let ny = -(x2 - x1) / len;
  if (ny > 0) [nx, ny] = [-nx, -ny];
  this.sim.tag(c, { kind: 'sling', visual: id, nx, ny, kick });
}
