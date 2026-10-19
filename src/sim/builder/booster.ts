import { BoosterZone } from '../zones';
import type { Builder } from '.';

export function booster(this: Builder, x: number, y: number, w: number, h: number, vx: number, vy: number, cooldown = 0.8) {
  this.sim.zones.push(new BoosterZone(x, y, w, h, vx, vy, cooldown));
}
