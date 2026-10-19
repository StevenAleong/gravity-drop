import RAPIER from '@dimforge/rapier2d-compat';
import { HALF_PI } from '../constants';
import type { Builder } from '.';

/** Horizontal shelf sliding side to side while gently tilting. */
export function slider(this: Builder, cx: number, y: number, half: number, amp: number, w: number, phase: number, tilt: number, w2: number) {
  const body = this.kinematic(cx + amp * Math.sin(phase), y);
  const c = this.world.createCollider(
    RAPIER.ColliderDesc.capsule(half, 0.15).setRotation(HALF_PI).setFriction(0.6).setRestitution(0.2),
    body,
  );
  this.sim.addVisual(c, { kind: 'capsule', hh: half, r: 0.15 }, 'slider', true);
  this.sim.tag(c, { kind: 'spinner' });
  this.sim.obstacles.push({
    update: (t) => {
      body.setNextKinematicTranslation({ x: cx + amp * Math.sin(w * t + phase), y });
      body.setNextKinematicRotation(tilt * Math.sin(w2 * t + phase * 1.7));
    },
  });
}
