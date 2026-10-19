import { DT } from '../constants';
import { range, type Rng } from '../rng';
import type { Marble, Sim } from '../sim';

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
    /** A new pad avoids the columns of pads spawned less than this many seconds before it. */
    private clear: number,
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
    const y = this.y + this.h - this.rise * age;
    // Stay out of the columns of recent pads (those less than `clear` seconds above), with a 0.3 m margin,
    // so a marble doesn't meet one pad right after another in the same lane. Up to 8 tries; the room is
    // wide enough that it almost never runs out.
    const recent = this.pads.filter((p) => y - p.y < this.rise * this.clear);
    let x = 0;
    for (let i = 0; i < 8; i++) {
      x = this.x + Math.min(Math.max(this.rng() * this.w - w / 2, 0), this.w - w);
      if (!recent.some((p) => x < p.x + p.w + 0.3 && p.x < x + w + 0.3)) break;
    }
    this.pads.push({ x, y, w, flash: 0, boosted: new Set() });
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
