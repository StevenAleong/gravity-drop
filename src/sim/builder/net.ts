import type { Builder } from '.';

/** Decorative goal net hanging `depth` below the mouth x1-x2 at height y. Marbles fall straight through it. */
export function net(this: Builder, x1: number, x2: number, y: number, depth: number) {
  this.sim.nets.push({ x1, x2, y, depth });
}
