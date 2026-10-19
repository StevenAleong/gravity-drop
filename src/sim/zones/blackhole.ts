import { DT, GRAVITY } from '../constants';
import type { Marble, Sim } from '../sim';
import { sweep } from './util';

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
