import RAPIER from '@dimforge/rapier2d-compat';
import type { Builder } from '.';

export function bumper(this: Builder, x: number, y: number, r = 0.5) {
  const c = this.world.createCollider(
    RAPIER.ColliderDesc.ball(r).setTranslation(x, y).setRestitution(0.6).setFriction(0),
  );
  const id = this.sim.addVisual(c, { kind: 'circle', r }, 'bumper', false);
  this.sim.tag(c, { kind: 'bumper', visual: id, x, y, r });
}
