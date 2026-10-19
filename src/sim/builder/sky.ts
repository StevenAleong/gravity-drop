import { SkyZone } from '../zones';
import type { Builder } from '.';

/** Slow-fall air (see SkyZone) over the rectangle; the renderer streams speed lines through it. */
export function sky(this: Builder, x: number, y: number, w: number, h: number, terminal: number, ease: number, gust: number, phase: number, drag: number) {
  this.sim.zones.push(new SkyZone(x, y, w, h, terminal, ease, gust, phase, drag));
}
