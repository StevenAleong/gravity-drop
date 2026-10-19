import RAPIER, { type Collider } from '@dimforge/rapier2d-compat';
import { HALF_PI, W } from '../constants';
import type { VisualStyle } from '../types';
import type { Builder } from '.';

/** Capsule wall between two points (rounded ends so chained walls never snag). */
export function wall(this: Builder, x1: number, y1: number, x2: number, y2: number, r = 0.15, style: VisualStyle = 'wall'): Collider {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const c = this.world.createCollider(
    RAPIER.ColliderDesc.capsule(len / 2, r)
      .setTranslation((x1 + x2) / 2, (y1 + y2) / 2)
      .setRotation(ang - HALF_PI)
      .setFriction(0.15)
      .setRestitution(0.25),
  );
  this.sim.addVisual(c, { kind: 'capsule', hh: len / 2, r }, style, false);
  this.sim.tag(c, { kind: 'wall' });
  return c;
}

/** Short slanted ledge off a side wall, so marbles can't skip a section by hugging the wall. */
export function ledge(this: Builder, side: 'left' | 'right', y: number, len = 1.6, drop = 0.9) {
  if (side === 'left') this.wall(0, y, len, y + drop);
  else this.wall(W, y, W - len, y + drop);
}
