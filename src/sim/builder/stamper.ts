import RAPIER from '@dimforge/rapier2d-compat';
import { HALF_PI } from '../constants';
import { StamperZone } from '../zones';
import type { Builder } from '.';

/** Piston over the ramp stretch (x1,y1)-(x2,y2) (ramp centre line). See StamperZone. */
export function stamper(this: Builder, x1: number, y1: number, x2: number, y2: number, idle: number, phase: number, forward: boolean, kick: number, rise = 1.8) {
  if (x1 > x2) [x1, y1, x2, y2] = [x2, y2, x1, y1];
  const headR = 0.28;
  const z = new StamperZone(x1, y1, x2, y2, headR, rise, idle, phase, forward, kick);
  const body = this.kinematic(z.cx, z.cy, Math.atan2(z.uy, z.ux) - HALF_PI);
  const c = this.world.createCollider(
    RAPIER.ColliderDesc.capsule(z.len / 2, headR).setFriction(0.3).setRestitution(0.2),
    body,
  );
  // No visual: the renderer draws the piston (rod, head, lights) from the zone.
  this.sim.tag(c, { kind: 'spinner' });
  this.sim.zones.push(z);
  this.sim.obstacles.push({
    update: (t) => {
      if (z.tick(t)) this.sim.emit({ type: 'stamp', x: z.cx, y: z.cy });
      body.setNextKinematicTranslation({ x: z.cx, y: z.cy });
    },
  });
}
