import { DT } from './constants';
import type { Marble, Sim } from './sim';

const cycle = (t: number, period: number, phase: number) => {
  const u = (t + phase) % period;
  return (u < 0 ? u + period : u) / period;
};

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

/** Back and forth between x0 and x1 at a constant speed (m/s); `phase` (0-1) is where it starts in the cycle. */
export interface Patrol {
  x0: number;
  x1: number;
  speed: number;
  phase: number;
}

/** Triangle wave: steady speed one way, then straight back. */
function sweep({ x0, x1, speed, phase }: Patrol, t: number) {
  const span = x1 - x0;
  const d = (((speed * t + phase * 2 * span) % (2 * span)) + 2 * span) % (2 * span);
  return x0 + (d < span ? d : 2 * span - d);
}

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

export type Zone = FanZone | ConveyorZone | LiftZone | BoosterZone | PortalZone | StamperZone;
