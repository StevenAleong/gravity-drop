import { ConveyorZone, type BeltOpts } from '../zones';
import type { Builder } from '.';

/** Conveyor laid on top of the ramp (x1,y1)-(x2,y2). */
export function conveyor(this: Builder, x1: number, y1: number, x2: number, y2: number, speed: number, period: number, phase: number, opts: BeltOpts = {}) {
  if (x1 > x2) [x1, y1, x2, y2] = [x2, y2, x1, y1];
  const z = new ConveyorZone(x1, y1, x2, y2, 0.9, speed, period, phase, opts);
  this.sim.zones.push(z);
  if (z.warnFor > 0) {
    // Sound the klaxon as the warning lights come on, but only before the belt turns uphill.
    let was = false;
    this.sim.obstacles.push({
      update: () => {
        if (z.warning && !was && z.next * z.uy < 0) this.sim.emit({ type: 'klaxon', x: (x1 + x2) / 2, y: (y1 + y2) / 2 });
        was = z.warning;
      },
    });
  }
  return z;
}
