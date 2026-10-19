import type { Marble, Sim } from '../sim';
import { sweep, type Patrol } from './util';

/** Teleporter: forward portals are shortcuts, backward ones send the marble up the course. */
export class PortalZone {
  readonly kind = 'portal' as const;
  flash = 0;
  readonly minY: number;
  readonly maxY: number;
  constructor(
    public ax: number,
    public ay: number,
    public r: number,
    public bx: number,
    public by: number,
    public forward: boolean,
    /** Optional sweep of the portal itself. */
    private patrol?: Patrol,
    /** Optional sweep of the exit, so marbles don't always come out in the same spot. */
    private exitPatrol?: Patrol,
  ) {
    this.minY = ay - r;
    this.maxY = ay + r;
  }
  contains(px: number, py: number) {
    const dx = px - this.ax;
    const dy = py - this.ay;
    return dx * dx + dy * dy <= this.r * this.r;
  }
  update(t: number) {
    this.flash *= 0.95;
    if (this.patrol) this.ax = sweep(this.patrol, t);
    if (this.exitPatrol) this.bx = sweep(this.exitPatrol, t);
  }
  affect(m: Marble, sim: Sim) {
    if (sim.coolingDown(m, this, 1.5)) return;
    const fromX = m.x;
    const fromY = m.y;
    sim.teleport(m, this.bx, this.by, 0.35);
    this.flash = 1;
    sim.emit({ type: 'portal', marble: m.idx, forward: this.forward, fromX, fromY, x: this.bx, y: this.by });
  }
}
