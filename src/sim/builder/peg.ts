import RAPIER from '@dimforge/rapier2d-compat';
import type { Builder } from '.';

export function peg(this: Builder, x: number, y: number, r = 0.15) {
  const c = this.world.createCollider(
    RAPIER.ColliderDesc.ball(r).setTranslation(x, y).setRestitution(0.45).setFriction(0.1),
  );
  this.sim.addVisual(c, { kind: 'circle', r }, 'peg', false);
  this.sim.tag(c, { kind: 'peg' });
}
