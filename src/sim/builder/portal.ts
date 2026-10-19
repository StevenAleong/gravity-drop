import { PortalZone, type Patrol } from '../zones';
import type { Builder } from '.';

export function portal(
  this: Builder,
  ax: number,
  ay: number,
  r: number,
  bx: number,
  by: number,
  forward: boolean,
  patrol?: Patrol,
  exitPatrol?: Patrol,
) {
  this.sim.zones.push(new PortalZone(patrol ? patrol.x0 : ax, ay, r, exitPatrol ? exitPatrol.x0 : bx, by, forward, patrol, exitPatrol));
}
