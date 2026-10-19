import type { Marble, Sim } from '../sim';

/** Pit that grabs a marble and hauls it back to the top of its segment. */
export class LiftZone {
  readonly kind = 'lift' as const;
  readonly minY: number;
  readonly maxY: number;
  constructor(
    public x: number,
    public y: number,
    public w: number,
    public h: number,
    public railX: number,
    public topY: number,
    public releaseVx: number,
  ) {
    this.minY = y;
    this.maxY = y + h;
  }
  contains(px: number, py: number) {
    return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h;
  }
  update(_t: number) {}
  affect(m: Marble, sim: Sim) {
    sim.startLift(m, this);
  }
}
