import type { Marble, Sim } from '../sim';

/** Launch pad: sets the marble's velocity outright. */
export class BoosterZone {
  readonly kind = 'booster' as const;
  flash = 0;
  readonly minY: number;
  readonly maxY: number;
  constructor(
    public x: number,
    public y: number,
    public w: number,
    public h: number,
    public vx: number,
    public vy: number,
    public cooldown: number,
  ) {
    this.minY = y;
    this.maxY = y + h;
  }
  contains(px: number, py: number) {
    return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h;
  }
  update(_t: number) {
    this.flash *= 0.94;
  }
  affect(m: Marble, sim: Sim) {
    if (sim.coolingDown(m, this, this.cooldown)) return;
    m.body.setLinvel({ x: this.vx, y: this.vy }, true);
    this.flash = 1;
    sim.emit({ type: 'boost', marble: m.idx, x: m.x, y: m.y });
  }
}
