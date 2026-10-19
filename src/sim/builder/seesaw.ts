import RAPIER from '@dimforge/rapier2d-compat';
import { HALF_PI } from '../constants';
import type { Builder } from '.';

/** Platform rocking about its centre: which way it tips decides where marbles roll. */
export function seesaw(this: Builder, cx: number, cy: number, half: number, amp: number, w: number, phase: number) {
  const body = this.kinematic(cx, cy, amp * Math.sin(phase));
  const c = this.world.createCollider(
    RAPIER.ColliderDesc.capsule(half, 0.15).setRotation(HALF_PI).setFriction(0.2).setRestitution(0.2),
    body,
  );
  this.sim.addVisual(c, { kind: 'capsule', hh: half, r: 0.15 }, 'seesaw', true);
  this.sim.tag(c, { kind: 'spinner' });
  this.hinge(cx, cy);
  this.sim.obstacles.push({ update: (t) => body.setNextKinematicRotation(amp * Math.sin(w * t + phase)) });
}
