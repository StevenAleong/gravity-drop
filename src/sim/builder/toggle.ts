import RAPIER from '@dimforge/rapier2d-compat';
import { HALF_PI } from '../constants';
import type { Builder } from '.';

/**
 * Flip-flop diverter: a plate pivoted at its centre (cx, cy), tilted `tilt` radians down to one side
 * so marbles landing on it roll off that way. Each marble that drops off the low end flips it to
 * the other side, so marbles take turns going left and right (decided by arrival order, never by who).
 */
export function toggle(this: Builder, cx: number, cy: number, half: number, tilt: number, startSide: number) {
  let side = startSide;
  let from = side * tilt;
  let flipT = -1;
  const swing = 0.16;
  const body = this.kinematic(cx, cy, from);
  const c = this.world.createCollider(
    RAPIER.ColliderDesc.capsule(half, 0.15).setRotation(HALF_PI).setFriction(0.15).setRestitution(0.2),
    body,
  );
  this.sim.addVisual(c, { kind: 'capsule', hh: half, r: 0.15 }, 'toggle', true);
  this.sim.tag(c, { kind: 'spinner' });
  this.hinge(cx, cy);
  // A marble counts as through when it enters the band below the low tip on the open side. Only
  // entering counts, so a slow marble still in the band can't flip it again when it swings back.
  const tipX = half * Math.cos(tilt);
  const tipY = cy + half * Math.sin(tilt);
  const inBand = new Set<number>();
  this.sim.obstacles.push({
    update: (t) => {
      let u = flipT < 0 ? 1 : Math.min(1, (t - flipT) / swing);
      const e = u * u * (3 - 2 * u);
      body.setNextKinematicRotation(from + (side * tilt - from) * e);
      for (const m of this.sim.marbles) {
        const dx = Math.abs(m.x - cx);
        const inside = dx > tipX - 0.2 && dx < tipX + 1.6 && m.y > tipY + 0.2 && m.y < tipY + 1.4;
        if (!inside) {
          inBand.delete(m.idx);
          continue;
        }
        if (inBand.has(m.idx)) continue;
        inBand.add(m.idx);
        if (u < 1 || (m.x - cx) * side < 0) continue;
        from = side * tilt;
        side = -side;
        flipT = t;
        u = 0;
        this.sim.emit({ type: 'flip', x: cx, y: cy });
      }
    },
  });
}
