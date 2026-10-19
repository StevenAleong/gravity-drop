import { BlackHoleZone, type Track, type Vortex } from '../zones';
import type { Builder } from '.';

/** Black hole at (x, y), or drifting along `track`; swallowed marbles come out at (bx, by). See BlackHoleZone. */
export function blackHole(this: Builder, x: number, y: number, r: number, pull: number, accel: number, swirl: number, bx: number, by: number, track?: Track) {
  this.sim.zones.push(new BlackHoleZone(x, y, r, pull, accel, swirl, bx, by, track));
}

/** Black hole that marbles orbit before falling in; see Vortex. `swirl` only sets the spin direction (its sign). */
export function vortex(this: Builder, x: number, y: number, r: number, pull: number, accel: number, swirl: number, bx: number, by: number, vortex: Vortex) {
  this.sim.zones.push(new BlackHoleZone(x, y, r, pull, accel, swirl, bx, by, undefined, vortex));
}
