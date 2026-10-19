import RAPIER from '@dimforge/rapier2d-compat';
import { NO_GROUPS } from '../constants';
import type { Builder } from '.';

/**
 * Pendulum hung from (px, py): a bumper ball of radius `r` on a rod of length `len`, swinging `amp` radians
 * either side at `w` rad/s. Only the ball is solid (the rod is just drawn), it kicks marbles away at `kick`
 * m/s, and they also pick up the ball's swing speed.
 */
export function pendulum(this: Builder, px: number, py: number, len: number, r: number, amp: number, w: number, phase: number, kick: number) {
  const body = this.kinematic(px, py, amp * Math.sin(phase));
  // The rod has a collider only so the renderer can follow it; it touches nothing.
  const rod = this.world.createCollider(
    RAPIER.ColliderDesc.capsule(len / 2, 0.06).setTranslation(0, len / 2).setSensor(true).setCollisionGroups(NO_GROUPS),
    body,
  );
  this.sim.addVisual(rod, { kind: 'capsule', hh: len / 2, r: 0.06 }, 'rod', true);
  const c = this.world.createCollider(
    RAPIER.ColliderDesc.ball(r).setTranslation(0, len).setRestitution(0.6).setFriction(0),
    body,
  );
  const id = this.sim.addVisual(c, { kind: 'circle', r }, 'bumper', true);
  const swing = { x: px, y: py, w: 0 };
  this.sim.tag(c, { kind: 'bumper', visual: id, x: px, y: py + len, r, collider: c, kick, swing });
  this.hinge(px, py);
  this.sim.obstacles.push({
    update: (t) => {
      body.setNextKinematicRotation(amp * Math.sin(w * t + phase));
      swing.w = amp * w * Math.cos(w * t + phase);
    },
  });
}
