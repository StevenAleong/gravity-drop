import { DT, GRAVITY } from '../constants';
import type { Marble, Sim } from '../sim';

/**
 * Air drag: cancels gravity and eases every marble toward a slow, steady fall (`terminal` m/s), so a
 * downward booster's extra speed bleeds off over about `1 / (ease * 120)` s instead of lasting. A gentle
 * sideways gust that varies with height and time makes marbles drift across each other's paths. Sideways
 * speed is damped separately and only lightly (`drag` per step), so a marble that comes in at an angle
 * keeps most of its slant instead of straightening into a vertical drop.
 */
export class SkyZone {
  readonly kind = 'sky' as const;
  readonly minY: number;
  readonly maxY: number;
  constructor(
    public x: number,
    public y: number,
    public w: number,
    public h: number,
    public terminal: number,
    public ease: number,
    public gust: number,
    private phase: number,
    public drag: number,
  ) {
    this.minY = y;
    this.maxY = y + h;
  }
  contains(px: number, py: number) {
    return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h;
  }
  update(_t: number) {}
  affect(m: Marble, sim: Sim) {
    const v = m.body.linvel();
    const vy = v.y - GRAVITY * DT;
    const ax = this.gust * Math.sin(0.9 * sim.t + 0.7 * m.y + this.phase);
    m.body.setLinvel({ x: v.x * (1 - this.drag) + ax * DT, y: vy + (this.terminal - vy) * this.ease }, true);
  }
}
