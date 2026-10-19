import { LiftZone } from '../zones';
import type { Builder } from '.';

export function lift(this: Builder, x: number, y: number, w: number, h: number, railX: number, topY: number, releaseVx: number) {
  this.sim.zones.push(new LiftZone(x, y, w, h, railX, topY, releaseVx));
}
