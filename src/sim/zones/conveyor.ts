import type { Marble } from '../sim';
import { cycle } from './util';

/** Belt options. The defaults are the original gentle, slowly reversing belt. */
export interface BeltOpts {
  /** Fraction of the gap to belt speed closed per step. Keep it small on reversing belts (see CLAUDE.md). */
  blend?: number;
  /** If false the belt always runs forward (an express belt). */
  reverses?: boolean;
  /** How fast `dir` swings to the new direction per step. */
  snap?: number;
  /** Seconds of warning lights before each reversal. */
  warnFor?: number;
}

/** A belt laid along a ramp; it periodically reverses, so it either speeds marbles up or drags them back uphill. */
export class ConveyorZone {
  readonly kind = 'conveyor' as const;
  dir = 1;
  /** True during the last `warnFor` seconds before the belt flips. */
  warning = false;
  /** Direction the belt will run after the next flip. */
  next = -1;
  readonly ux: number;
  readonly uy: number;
  readonly nx: number;
  readonly ny: number;
  readonly len: number;
  readonly minY: number;
  readonly maxY: number;
  readonly blend: number;
  readonly reverses: boolean;
  readonly snap: number;
  readonly warnFor: number;
  constructor(
    public x1: number,
    public y1: number,
    public x2: number,
    public y2: number,
    public thick: number,
    public speed: number,
    public period: number,
    public phase: number,
    opts: BeltOpts = {},
  ) {
    this.len = Math.hypot(x2 - x1, y2 - y1);
    this.ux = (x2 - x1) / this.len;
    this.uy = (y2 - y1) / this.len;
    // Normal pointing "up" (negative y), i.e. the side marbles roll on. Builder guarantees x1 < x2.
    this.nx = this.uy;
    this.ny = -this.ux;
    this.minY = Math.min(y1, y2) - thick - 0.5;
    this.maxY = Math.max(y1, y2) + 0.5;
    this.blend = opts.blend ?? 0.025;
    this.reverses = opts.reverses ?? true;
    this.snap = opts.snap ?? 0.04;
    this.warnFor = opts.warnFor ?? 0;
  }
  contains(px: number, py: number) {
    const rx = px - this.x1;
    const ry = py - this.y1;
    const along = rx * this.ux + ry * this.uy;
    if (along < 0 || along > this.len) return false;
    const d = rx * this.nx + ry * this.ny;
    return d >= 0 && d <= this.thick;
  }
  update(t: number) {
    if (!this.reverses) return;
    const c = cycle(t, this.period, this.phase);
    const target = c < 0.5 ? 1 : -1;
    this.next = -target;
    this.dir += (target - this.dir) * this.snap;
    const toFlip = ((c < 0.5 ? 0.5 : 1) - c) * this.period;
    this.warning = toFlip < this.warnFor;
  }
  /** Belt velocity along (ux, uy). */
  get beltVel() {
    return this.speed * this.dir;
  }
  affect(m: Marble) {
    const v = m.body.linvel();
    const vt = v.x * this.ux + v.y * this.uy;
    const dv = (this.beltVel - vt) * this.blend;
    m.body.setLinvel({ x: v.x + this.ux * dv, y: v.y + this.uy * dv }, true);
  }
}
