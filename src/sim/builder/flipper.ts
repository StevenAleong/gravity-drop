import type { Builder } from '.';

/** Pinball flipper hinged at (hx, hy) that periodically flicks marbles back up. */
export function flipper(this: Builder, hx: number, hy: number, len: number, side: number, period: number, phase: number) {
  const rest = side * 0.5;
  const up = -side * 0.45;
  const body = this.kinematic(hx, hy, rest);
  this.arm(body, len, 0.17, side, 'flipper');
  this.hinge(hx, hy);
  let lastCycle = -1;
  this.sim.obstacles.push({
    update: (t) => {
      const tt = t + phase;
      const cyc = Math.floor(tt / period);
      const u = tt - cyc * period;
      if (cyc !== lastCycle) {
        if (lastCycle >= 0) this.sim.emit({ type: 'flip', x: hx, y: hy });
        lastCycle = cyc;
      }
      const f = u < 0.1 ? u / 0.1 : u < 0.25 ? 1 : u < 0.55 ? 1 - (u - 0.25) / 0.3 : 0;
      body.setNextKinematicRotation(rest + (up - rest) * f);
    },
  });
}
