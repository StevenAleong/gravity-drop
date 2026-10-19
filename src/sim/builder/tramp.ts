import RAPIER from '@dimforge/rapier2d-compat';
import { HALF_PI } from '../constants';
import type { Builder } from '.';

/**
 * Short trampoline pad centred at (x, y), tilted by `angle` (radians, positive = right end lower), that
 * springs marbles off its top face at up to `max` m/s. With `wobble`, it rocks about its centre.
 */
export function tramp(this: Builder, x: number, y: number, len: number, angle: number, max: number, wobble?: { amp: number; w: number; phase: number }) {
  const r = 0.12;
  const rot = angle - HALF_PI;
  const body = wobble ? this.kinematic(x, y, rot) : null;
  const desc = RAPIER.ColliderDesc.capsule(len / 2, r).setFriction(0.1).setRestitution(0.3);
  const c = body ? this.world.createCollider(desc, body) : this.world.createCollider(desc.setTranslation(x, y).setRotation(rot));
  const id = this.sim.addVisual(c, { kind: 'capsule', hh: len / 2, r }, 'tramp', !!body);
  this.sim.tag(c, { kind: 'tramp', visual: id, collider: c, max });
  if (body && wobble) {
    this.hinge(x, y);
    this.sim.obstacles.push({ update: (t) => body.setNextKinematicRotation(rot + wobble.amp * Math.sin(wobble.w * t + wobble.phase)) });
  }
}
