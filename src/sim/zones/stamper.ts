import type { Marble, Sim } from '../sim';

/**
 * Piston over a ramp with a sensor: when a marble rolls toward it, the warning light flashes and the
 * head slams down, launching whatever is underneath along the ramp (downhill, or back uphill for a
 * "reject" stamper). Fast marbles beat it, slow ones get caught. It also fires on its own when idle.
 * The head stops just above a resting marble, so it never pinches one against the ramp; the kick does the work.
 */
export class StamperZone {
  readonly kind = 'stamper' as const;
  /** Head offset from the ramp's centre line along the up normal. */
  offset: number;
  state: 'up' | 'warn' | 'slam' | 'hold' | 'rise' = 'up';
  /** Set for the single step on which the head lands. */
  impact = false;
  flash = 0;
  readonly ux: number;
  readonly uy: number;
  readonly nx: number;
  readonly ny: number;
  readonly len: number;
  readonly low: number;
  readonly high: number;
  readonly minY: number;
  readonly maxY: number;
  /** Direction the kick sends marbles, along (ux, uy). */
  readonly kickDir: number;
  private readonly downhill: number;
  private sensed = false;
  private since = 0;
  private readyAt = 0;
  private lastFire: number;
  static readonly WARN = 0.3;
  static readonly SLAM = 0.1;
  static readonly HOLD = 0.3;
  static readonly RISE = 0.8;
  static readonly COOLDOWN = 0.5;
  /** How far uphill of the head the sensor reaches. */
  static readonly SENSE = 1.6;
  constructor(
    public x1: number,
    public y1: number,
    public x2: number,
    public y2: number,
    public headR: number,
    rise: number,
    /** Longest the stamper sits idle before firing anyway. */
    public idle: number,
    phase: number,
    /** True to kick downhill, false to bounce marbles back uphill. */
    public forward: boolean,
    public kick: number,
  ) {
    this.len = Math.hypot(x2 - x1, y2 - y1);
    this.ux = (x2 - x1) / this.len;
    this.uy = (y2 - y1) / this.len;
    this.nx = this.uy;
    this.ny = -this.ux;
    // Ramp radius + marble diameter + a hair of clearance + head radius.
    this.low = 0.15 + 0.64 + 0.08 + headR;
    this.high = this.low + rise;
    this.offset = this.high;
    this.downhill = Math.sign(this.uy) || 1;
    this.kickDir = forward ? this.downhill : -this.downhill;
    this.lastFire = -phase;
    this.minY = Math.min(y1, y2) - this.high - headR - 1;
    this.maxY = Math.max(y1, y2) + 1;
  }
  get warning() {
    return this.state === 'warn';
  }
  /** Head centre for the current offset. */
  get cx() {
    return (this.x1 + this.x2) / 2 + this.nx * this.offset;
  }
  get cy() {
    return (this.y1 + this.y2) / 2 + this.ny * this.offset;
  }
  /** Advances the piston. Returns true on the step the head lands. */
  tick(t: number): boolean {
    const { WARN, SLAM, HOLD, RISE, COOLDOWN } = StamperZone;
    const dt = t - this.since;
    const go = (s: StamperZone['state']) => {
      this.state = s;
      this.since = t;
    };
    this.impact = false;
    let k = 0; // 0 = up, 1 = down
    switch (this.state) {
      case 'up':
        if (t >= this.readyAt && (this.sensed || t - this.lastFire > this.idle)) go('warn');
        break;
      case 'warn':
        if (dt >= WARN) go('slam');
        break;
      case 'slam':
        k = Math.min(1, (dt / SLAM) ** 2);
        if (dt >= SLAM) {
          go('hold');
          this.impact = true;
          this.flash = 1;
          this.lastFire = t;
        }
        break;
      case 'hold':
        k = 1;
        if (dt >= HOLD) go('rise');
        break;
      case 'rise':
        k = Math.max(0, 1 - dt / RISE);
        if (dt >= RISE) {
          go('up');
          this.readyAt = t + COOLDOWN;
        }
        break;
    }
    this.sensed = false;
    this.offset = this.high + (this.low - this.high) * k;
    return this.impact;
  }
  /** Position relative to the ramp: distance along it and height above its centre line. */
  private local(px: number, py: number) {
    const rx = px - this.x1;
    const ry = py - this.y1;
    return { along: rx * this.ux + ry * this.uy, d: rx * this.nx + ry * this.ny };
  }
  private underHead(along: number, d: number) {
    return along >= -0.2 && along <= this.len + 0.2 && d >= 0 && d <= this.low;
  }
  private inSensor(along: number, d: number) {
    if (d < 0 || d > this.low + 0.6) return false;
    const { SENSE } = StamperZone;
    // The sensor covers the uphill approach and the uphill half of the head.
    return this.downhill > 0 ? along >= -SENSE && along <= this.len / 2 : along >= this.len / 2 && along <= this.len + SENSE;
  }
  contains(px: number, py: number) {
    const { along, d } = this.local(px, py);
    return this.impact ? this.underHead(along, d) : this.state === 'up' && this.inSensor(along, d);
  }
  update(_t: number) {
    this.flash *= 0.92;
  }
  affect(m: Marble, sim: Sim) {
    if (!this.impact) {
      this.sensed = true;
      return;
    }
    // Reject stampers can't catch the same marble twice in a row, so they never trap one.
    if (!this.forward && sim.coolingDown(m, this, 4)) return;
    const s = this.kick * this.kickDir;
    m.body.setLinvel({ x: this.ux * s + this.nx * 1.2, y: this.uy * s + this.ny * 1.2 }, true);
    sim.emit({ type: 'stamped', marble: m.idx, forward: this.forward, x: m.x, y: m.y });
  }
}
