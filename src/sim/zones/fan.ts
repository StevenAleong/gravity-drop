import { DT } from '../constants';
import type { Marble } from '../sim';
import { cycle } from './util';

/** Pulsing wind: pushes marbles in a direction while switched on. */
export class FanZone {
  readonly kind = 'fan' as const;
  level = 0;
  /** Sim time after which the fan shuts down for good (the start mixer's jets). */
  until = Infinity;
  /** Optional sprinkler-style sweep of the blow direction: max angle (radians) and angular speed. */
  sweep = { amp: 0, w: 0, phase: 0 };
  private baseAngle = 0;
  readonly minY: number;
  readonly maxY: number;
  constructor(
    public x: number,
    public y: number,
    public w: number,
    public h: number,
    public dx: number,
    public dy: number,
    public accel: number,
    public period: number,
    public onFrac: number,
    public phase: number,
  ) {
    const len = Math.hypot(dx, dy);
    this.dx = dx / len;
    this.dy = dy / len;
    this.baseAngle = Math.atan2(dy, dx);
    this.minY = y;
    this.maxY = y + h;
  }
  contains(px: number, py: number) {
    return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h;
  }
  update(t: number) {
    const target = t < this.until && cycle(t, this.period, this.phase) < this.onFrac ? 1 : 0;
    this.level += (target - this.level) * 0.06;
    if (this.sweep.amp) {
      const a = this.baseAngle + this.sweep.amp * Math.sin(this.sweep.w * t + this.sweep.phase);
      this.dx = Math.cos(a);
      this.dy = Math.sin(a);
    }
  }
  /** Shut down for good and spun down, so there is nothing left to draw. */
  retired(t: number) {
    return t >= this.until && this.level < 0.03;
  }
  affect(m: Marble) {
    if (this.level < 0.03) return;
    const k = this.accel * this.level * m.body.mass() * DT;
    m.body.applyImpulse({ x: this.dx * k, y: this.dy * k }, true);
  }
}
