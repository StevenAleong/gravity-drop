import type { Collider } from '@dimforge/rapier2d-compat';
import { ALL_GROUPS, DT, NO_GROUPS } from '../constants';
import { range, type Rng } from '../rng';
import type { Marble, Sim } from '../sim';

/** A peg that's a mine of a BlastZone. */
export interface Mine {
  x: number;
  y: number;
  r: number;
  collider: Collider;
  /** Ready (a solid peg), lit (about to blow), or gone (blown away, waiting to come back). */
  state: 'ready' | 'lit' | 'gone';
  /** Zone time it entered its state. */
  since: number;
}

/** One explosion of a BlastZone. Its mine glows for `fuse` s, then blows at age `fuse`. */
export interface Blast {
  mine: Mine;
  x: number;
  y: number;
  r: number;
  age: number;
  /** Marbles its shockwave has already thrown (each blast throws a marble once). */
  hit: Set<number>;
}

/**
 * Exploding pegs. Every so often a random peg that's still there is lit: it glows for `fuse` seconds (a
 * warning you can see), then blows up and is gone. Its shockwave spreads to radius `r` in `wave` seconds and
 * throws every marble it reaches straight away from the peg: a marble above it is blown up, one below is
 * blown down, one beside it sideways. The throw is `kick` m/s at the centre, fading to `edge` × that at the
 * rim, and replaces most of the marble's speed. The peg comes back `down` seconds later, once no marble is
 * in its spot. Which peg goes and when comes from the zone's own seeded rng and never looks at the marbles,
 * so a seed replays the same blasts and nobody is targeted.
 */
export class BlastZone {
  readonly kind = 'blast' as const;
  minY = Infinity;
  maxY = -Infinity;
  mines: Mine[] = [];
  blasts: Blast[] = [];
  /** Blasts that went off this step (the sim emits a `blast` event for each). */
  fired: Blast[] = [];
  /** Seconds since the zone started (the renderer reads it for the mines' animations). */
  time = 0;
  private next: number;
  constructor(
    private radius: [number, number],
    public fuse: number,
    public wave: number,
    private gap: [number, number],
    public kick: number,
    public edge: number,
    /** Seconds a blown peg stays gone. */
    public down: number,
    private rng: Rng,
    /** True if nothing is in the way of a peg coming back at (x, y) with radius r. */
    private clear: (x: number, y: number, r: number) => boolean,
  ) {
    this.next = range(rng, 0, gap[1]);
  }
  addMine(collider: Collider, x: number, y: number, r: number) {
    this.mines.push({ x, y, r, collider, state: 'ready', since: -Infinity });
    this.minY = Math.min(this.minY, y - this.radius[1]);
    this.maxY = Math.max(this.maxY, y + this.radius[1]);
  }
  contains(px: number, py: number) {
    return this.blasts.some((b) => this.live(b) && (px - b.x) ** 2 + (py - b.y) ** 2 <= b.r * b.r);
  }
  /** True while the blast's shockwave is spreading. */
  private live(b: Blast) {
    return b.age >= this.fuse && b.age <= this.fuse + this.wave;
  }
  private set(mine: Mine, state: Mine['state']) {
    mine.state = state;
    mine.since = this.time;
  }
  update(_t: number) {
    this.time += DT;
    this.fired.length = 0;
    for (const b of this.blasts) {
      const was = b.age;
      b.age += DT;
      if (was < this.fuse && b.age >= this.fuse) {
        this.fired.push(b);
        b.mine.collider.setCollisionGroups(NO_GROUPS);
        this.set(b.mine, 'gone');
      }
    }
    // Kept a moment after the shockwave, for the renderer's flash.
    while (this.blasts.length && this.blasts[0].age > this.fuse + 0.5) this.blasts.shift();
    // Blown pegs come back once their time is up and their spot is clear.
    for (const m of this.mines) {
      if (m.state === 'gone' && this.time - m.since >= this.down && this.clear(m.x, m.y, m.r)) {
        m.collider.setCollisionGroups(ALL_GROUPS);
        this.set(m, 'ready');
      }
    }
    while (this.next <= this.time) {
      const ready = this.mines.filter((m) => m.state === 'ready');
      const r = range(this.rng, this.radius[0], this.radius[1]);
      const pick = Math.floor(this.rng() * ready.length);
      if (ready.length) {
        const mine = ready[pick];
        this.set(mine, 'lit');
        this.blasts.push({ mine, x: mine.x, y: mine.y, r, age: this.time - this.next, hit: new Set() });
      }
      this.next += range(this.rng, this.gap[0], this.gap[1]);
    }
  }
  affect(m: Marble, sim: Sim) {
    for (const b of this.blasts) {
      if (!this.live(b) || b.hit.has(m.idx)) continue;
      const dx = m.x - b.x;
      const dy = m.y - b.y;
      const d = Math.hypot(dx, dy);
      // The shockwave's front spreads out from the peg over `wave` s.
      if (d > b.r * Math.min(1, (b.age - this.fuse) / this.wave)) continue;
      b.hit.add(m.idx);
      // Dead centre: straight up.
      const ux = d > 1e-3 ? dx / d : 0;
      const uy = d > 1e-3 ? dy / d : -1;
      const s = this.kick * (1 - (1 - this.edge) * (d / b.r));
      const v = m.body.linvel();
      m.body.setLinvel({ x: v.x * 0.25 + ux * s, y: v.y * 0.25 + uy * s }, true);
      sim.emit({ type: 'blasted', marble: m.idx, x: m.x, y: m.y, dx: ux, dy: uy });
    }
  }
}
