import { FanZone } from '../zones';
import type { Builder } from '.';

export function fan(this: Builder, x: number, y: number, w: number, h: number, dx: number, dy: number, accel: number, period: number, onFrac: number, phase: number) {
  const z = new FanZone(x, y, w, h, dx, dy, accel, period, onFrac, phase);
  this.sim.zones.push(z);
  return z;
}
