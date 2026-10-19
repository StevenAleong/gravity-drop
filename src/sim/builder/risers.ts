import { mulberry32 } from '../rng';
import { RiserZone } from '../zones';
import type { Builder } from '.';

/** Downward boost pads that stream up through the rectangle (see RiserZone), spawned from their own seeded rng. */
export function risers(this: Builder, x: number, y: number, w: number, h: number, padWs: number[], padH: number, rise: number, vy: number, gap: [number, number], clear: number, seed: number) {
  this.sim.zones.push(new RiserZone(x, y, w, h, padWs, padH, rise, vy, gap, clear, mulberry32(seed)));
}
