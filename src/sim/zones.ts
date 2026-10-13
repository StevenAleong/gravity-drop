import { DT, GRAVITY } from './constants';
import { range, type Rng } from './rng';
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

/** Straight track from (x0,y0) to (x1,y1), driven back and forth like a `Patrol`. */
export interface Track {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  speed: number;
  phase: number;
}

/**
 * Black hole: a backward portal (the event horizon, radius `r`) inside a gravity well of radius `pull`.
 * Inside the well marbles are pulled toward the centre (stronger the closer they get) and swirled
 * around it, so they curve, slow down and sometimes slingshot past. Cross the horizon and you're
 * thrown out at the exit. Optionally drifts along a `Track`. With a `Vortex` the well works differently:
 * see there.
 */
export class BlackHoleZone {
  readonly kind = 'blackhole' as const;
  flash = 0;
  /** Live centre. */
  x: number;
  y: number;
  readonly minY: number;
  readonly maxY: number;
  private len = 0;
  /** A vortex's rings as they are now (the innermost one grows; see VortexGrowth). */
  rings: VortexRing[] = [];
  /** How far the innermost ring has grown, 0-1. */
  growth = 0;
  private growing = false;
  private lastInside = -Infinity;
  constructor(
    x: number,
    y: number,
    public r: number,
    public pull: number,
    /** Pull at the horizon (m/s²); it falls off to 0 at the edge of the well. */
    public accel: number,
    /** Sideways swirl as a fraction of the pull; its sign sets the spin direction. */
    public swirl: number,
    public bx: number,
    public by: number,
    private track?: Track,
    public vortex?: Vortex,
  ) {
    this.x = track ? track.x0 : x;
    this.y = track ? track.y0 : y;
    const ys = track ? [track.y0, track.y1] : [y];
    this.minY = Math.min(...ys) - pull;
    this.maxY = Math.max(...ys) + pull;
    if (track) this.len = Math.hypot(track.x1 - track.x0, track.y1 - track.y0);
    if (vortex) this.rings = vortex.rings.map((r) => ({ ...r }));
  }
  contains(px: number, py: number) {
    const dx = px - this.x;
    const dy = py - this.y;
    return dx * dx + dy * dy <= this.pull * this.pull;
  }
  update(t: number) {
    this.flash *= 0.95;
    const g = this.vortex?.grow;
    if (g) {
      // Grow once something has been swallowed; shrink back once the well has been empty for `idle` s.
      if (t - this.lastInside > g.idle) this.growing = false;
      this.growth = Math.min(1, Math.max(0, this.growth + ((this.growing ? 1 : -1) * DT) / g.time));
      const base = this.vortex!.rings[this.rings.length - 1];
      const live = this.rings[this.rings.length - 1];
      live.r = base.r + (g.r - base.r) * this.growth;
      live.accel = base.accel + (g.accel - base.accel) * this.growth;
    }
    const k = this.track;
    if (!k) return;
    const u = sweep({ x0: 0, x1: this.len, speed: k.speed, phase: k.phase }, t) / this.len;
    this.x = k.x0 + (k.x1 - k.x0) * u;
    this.y = k.y0 + (k.y1 - k.y0) * u;
  }
  affect(m: Marble, sim: Sim) {
    const dx = this.x - m.x;
    const dy = this.y - m.y;
    const d = Math.hypot(dx, dy);
    this.lastInside = sim.t;
    if (d < this.r) {
      if (sim.coolingDown(m, this, 1.5)) return;
      this.growing = true;
      const fromX = m.x;
      const fromY = m.y;
      sim.teleport(m, this.bx, this.by, 0.2);
      this.flash = 1;
      sim.emit({ type: 'portal', marble: m.idx, forward: this.by > this.y, hole: true, fromX, fromY, x: this.bx, y: this.by });
      return;
    }
    const ux = dx / d;
    const uy = dy / d;
    const mass = m.body.mass();
    const vx = this.vortex;
    if (vx) {
      // The speed around the centre eases toward the ring's spin, in whichever direction the marble is
      // already going round, so it keeps the line it came in on.
      const { accel, spin, ease, grav } = vortexAt(this.rings, vx.blend, d);
      const k = accel * mass * DT;
      const v = m.body.linvel();
      const vt = v.y * ux - v.x * uy; // speed around the centre, + = the (-uy, ux) direction
      const s = Math.sign(vt) || Math.sign(this.swirl) || 1;
      const tx = -uy * s;
      const ty = ux * s;
      const dv = (spin - vt * s) * ease * mass;
      const lift = GRAVITY * (1 - grav) * mass * DT;
      m.body.applyImpulse({ x: ux * k + tx * dv, y: uy * k + ty * dv - lift }, true);
      return;
    }
    const f = 1 - (d - this.r) / (this.pull - this.r);
    const a = this.accel * f * f;
    const k = a * mass * DT;
    m.body.applyImpulse({ x: (ux - uy * this.swirl) * k, y: (uy + ux * this.swirl) * k }, true);
  }
}

/**
 * A black hole that marbles orbit before falling in, built from rings, outermost first. Each ring has its
 * own pull (m/s², toward the centre) and eases each marble's speed around the centre toward its `spin`
 * (m/s), in whichever direction the marble is already going round, so marbles orbit both ways and meet
 * head-on. Neighbouring rings blend over `blend` m, so crossing from one to the next is never a jolt.
 * Instead of a swirl force that would keep adding speed, the spin is a target, and it must stay under the
 * ring's orbit speed √(accel · r), or marbles could orbit forever.
 */
export interface Vortex {
  rings: VortexRing[];
  blend: number;
  grow?: VortexGrowth;
}

/**
 * The innermost ring starts as given and, once the hole swallows its first marble, grows over `time`
 * seconds to radius `r` with pull `accel`, so the marbles still orbiting get pulled in sooner and sooner.
 * It shrinks back at the same rate once the well has been empty for `idle` seconds. Growth is counted in
 * sim time, so it's the same however many marbles race.
 */
export interface VortexGrowth {
  r: number;
  accel: number;
  time: number;
  idle: number;
}

export interface VortexRing {
  /** Outer radius; the ring runs in to the next ring's radius (or the horizon). */
  r: number;
  /** Pull at the outer radius; it grows as r/d inward, so the orbit speed √(accel · r) is the same across the ring. */
  accel: number;
  spin: number;
  /** Fraction of the gap to `spin` closed per step (0: no spin in this ring). */
  ease: number;
  /**
   * How much normal gravity is left in this ring (1: all of it, 0: none). Gravity squashes every orbit
   * (it adds to the pull above the hole and takes from it below), so orbits dive in on their first pass.
   */
  grav: number;
}

const OUTSIDE: VortexRing = { r: Infinity, accel: 0, spin: 0, ease: 0, grav: 1 };

/** The pull and spin at distance `d`: the ring it's in, blended with the ring outside it near the border. */
export function vortexAt(rings: VortexRing[], blend: number, d: number): Omit<VortexRing, 'r'> {
  let i = 0;
  while (i + 1 < rings.length && d < rings[i + 1].r) i++;
  const a = rings[i];
  const accel = (a.accel * a.r) / d;
  // Within `blend` inside this ring's outer edge, mix in the ring outside it (or, for the outermost ring,
  // plain space: no pull or spin and full gravity, so the field fades in at its edge).
  const out = rings[i - 1] ?? OUTSIDE;
  const t = Math.min(1, (a.r - d) / blend);
  if (t >= 1) return { accel, spin: a.spin, ease: a.ease, grav: a.grav };
  const outAccel = out === OUTSIDE ? 0 : (out.accel * out.r) / d;
  return {
    accel: outAccel + (accel - outAccel) * t,
    spin: out.spin + (a.spin - out.spin) * t,
    ease: out.ease + (a.ease - out.ease) * t,
    grav: out.grav + (a.grav - out.grav) * t,
  };
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

/** One pad of a RiserZone; `y` is its top edge. */
export interface RisingPad {
  x: number;
  y: number;
  /** Width, picked from the zone's `padWs` when it spawns. */
  w: number;
  flash: number;
  /** Marbles this pad has already boosted (each pad boosts a marble once). */
  boosted: Set<number>;
}

/**
 * Downward boost pads that stream up through a rectangle, like the speed lines in a SkyZone: each one
 * appears at a random x along the bottom edge and rises at `rise` m/s until it leaves the top. A marble
 * that a pad passes through is shot downward at `vy`, keeping its sideways speed. Because the pads rush
 * past much faster than marbles fall, how many a marble meets hardly depends on its own speed, so one
 * boost doesn't make the next one more likely. Each pad's width is picked at random from `padWs`. Spawns
 * come from the zone's own seeded rng, so a seed replays the same pads.
 */
export class RiserZone {
  readonly kind = 'riser' as const;
  readonly minY: number;
  readonly maxY: number;
  pads: RisingPad[] = [];
  private time = 0;
  private next: number;
  constructor(
    public x: number,
    public y: number,
    public w: number,
    public h: number,
    public padWs: number[],
    public padH: number,
    public rise: number,
    public vy: number,
    private gap: [number, number],
    private rng: Rng,
  ) {
    this.minY = y;
    this.maxY = y + h;
    // Start full, as if pads had been streaming up for a while already.
    this.next = -h / rise;
    while (this.next <= 0) this.spawn(-this.next);
  }
  private spawn(age: number) {
    // Centres are spread over the full width and the pad is then pushed back inside, so pads sit flush
    // against a wall often enough that marbles riding the wall meet as many as marbles in the middle.
    const w = this.padWs[Math.floor(this.rng() * this.padWs.length)];
    const x = Math.min(Math.max(this.rng() * this.w - w / 2, 0), this.w - w);
    this.pads.push({ x: this.x + x, y: this.y + this.h - this.rise * age, w, flash: 0, boosted: new Set() });
    this.next += range(this.rng, this.gap[0], this.gap[1]);
  }
  contains(px: number, py: number) {
    return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h;
  }
  update(_t: number) {
    this.time += DT;
    for (const p of this.pads) {
      p.y -= this.rise * DT;
      p.flash *= 0.94;
    }
    while (this.pads.length && this.pads[0].y + this.padH < this.y) this.pads.shift();
    while (this.next <= this.time) this.spawn(this.time - this.next);
  }
  affect(m: Marble, sim: Sim) {
    const pad = this.pads.find((p) => m.x >= p.x && m.x <= p.x + p.w && m.y >= p.y && m.y <= p.y + this.padH);
    // Each pad boosts a marble once, but a different pad boosts it again even mid-boost, restarting it
    // from full speed, so running over pads back to back keeps the boost going.
    if (!pad || pad.boosted.has(m.idx)) return;
    pad.boosted.add(m.idx);
    m.body.setLinvel({ x: m.body.linvel().x, y: this.vy }, true);
    pad.flash = 1;
    sim.emit({ type: 'boost', marble: m.idx, x: m.x, y: m.y });
  }
}

export type Zone = FanZone | ConveyorZone | LiftZone | BoosterZone | PortalZone | BlackHoleZone | StamperZone | SkyZone | RiserZone;
