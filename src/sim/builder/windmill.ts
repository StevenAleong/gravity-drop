import RAPIER from '@dimforge/rapier2d-compat';
import type { Builder } from '.';

/** Rotating cross/bar. `bars` full-length bars through the hub. */
export function windmill(this: Builder, x: number, y: number, arm: number, speed: number, bars: number, phase: number, r = 0.14) {
  const body = this.kinematic(x, y, phase);
  for (let k = 0; k < bars; k++) {
    const c = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(arm, r).setRotation((k * Math.PI) / bars).setFriction(0.3).setRestitution(0.3),
      body,
    );
    this.sim.addVisual(c, { kind: 'capsule', hh: arm, r }, 'spinner', true);
    this.sim.tag(c, { kind: 'spinner' });
  }
  this.hinge(x, y);
  this.sim.obstacles.push({ update: (t) => body.setNextKinematicRotation(phase + speed * t) });
}
