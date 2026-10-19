import type { Builder } from '.';

/**
 * Floor panel hinged at (hx, hy) extending side*len; swings down to dump marbles on a timer. Open, it
 * hangs `swing` radians below level (past π/2, its tip swings back out beyond the hinge).
 */
export function trapdoor(this: Builder, hx: number, hy: number, len: number, side: number, period: number, openDur: number, phase: number, swing = 1.35) {
  this.hatch(hx, hy, len, side, (t) => {
    const u = (((t + phase) % period) + period) % period;
    return u < openDur ? Math.min(1, u / 0.2) * Math.min(1, (openDur - u) / 0.3) : 0;
  }, swing);
}

/** A trapdoor driven by `level(t)`: 0 closed, 1 fully open (swung down by `swing` rad). */
export function hatch(this: Builder, hx: number, hy: number, len: number, side: number, level: (t: number) => number, swing = 1.35) {
  const body = this.kinematic(hx, hy);
  this.arm(body, len, 0.14, side, 'trapdoor');
  let wasOpen = false;
  this.sim.obstacles.push({
    update: (t) => {
      const open = level(t);
      if (open > 0 && !wasOpen) this.sim.emit({ type: 'trapdoor', x: hx + (side * len) / 2, y: hy });
      wasOpen = open > 0;
      body.setNextKinematicRotation(side * swing * open);
    },
  });
}
