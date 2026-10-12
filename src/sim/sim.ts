import RAPIER, { type Collider, type EventQueue, type RigidBody, type World } from '@dimforge/rapier2d-compat';
import { Builder } from './builder';
import { ALL_GROUPS, COUNTDOWN, DT, GRAVITY, LIFT_SPEED, MARBLE_R, NO_GROUPS, W } from './constants';
import { buildCourse, buildSection, MAX_SEGMENTS, MIN_SEGMENTS, SEGMENT_COUNTS, type SectionKind } from './course';
import { mulberry32, shuffle, type Rng } from './rng';
import type { HitTarget, Obstacle, Segment, Shape, SimEvent, Visual, VisualStyle } from './types';
import type { LiftZone, Zone } from './zones';

export type RaceLength = keyof typeof SEGMENT_COUNTS;
export type WinMode = 'first' | 'last';

/** Random segments for a race length: a preset name, or a count clamped to the allowed range. */
export function segmentCount(length: RaceLength | number): number {
  const n = typeof length === 'number' ? length : SEGMENT_COUNTS[length];
  return Math.min(MAX_SEGMENTS, Math.max(MIN_SEGMENTS, Math.round(n) || SEGMENT_COUNTS.medium));
}

/** Most marbles a section preview has in play at once (a whole-course preview is much taller, so it gets more). */
const PREVIEW_MAX = 24;
const COURSE_PREVIEW_MAX = 48;
/** Seconds a new leader must hold the lead before it's announced (`lead` event) and counted as a lead change. */
const LEAD_HOLD = 1;

export interface SimOptions {
  names: string[];
  seed: number;
  /** A preset name or a number of random segments (the finish comes on top). */
  length: RaceLength | number;
  mode: WinMode;
  /** Squeeze the course through a guarded funnel between every segment. */
  funnels?: boolean;
  /** Finish id (see FINISHES in course.ts); omitted or unknown picks one from the seed. */
  finish?: string;
  /** Build just this one section, for a preview (pass no names): no gate, no countdown. */
  section?: { kind: SectionKind; id: string };
  /** A custom course: segment template ids in order, replacing the random pick (`length` is then ignored). */
  segments?: string[];
  /** Preview the whole course (pass no names): no gate, mixer or countdown, marbles keep dropping in at the top. */
  preview?: boolean;
}

export interface Marble {
  idx: number;
  name: string;
  color: number;
  body: RigidBody;
  collider: Collider;
  x: number;
  y: number;
  angle: number;
  finished: boolean;
  finishTime: number;
  place: number;
  rank: number;
  worstRank: number;
  comebackDone: boolean;
  ghost: { x: number; topY: number; vx: number } | null;
  cooldowns: Map<object, number>;
  still: number;
  segment: number;
  bestY: number;
  bestT: number;
}

type Tag =
  | { kind: 'marble'; m: Marble }
  | {
      kind: 'bumper';
      visual: number;
      x: number;
      y: number;
      r: number;
      // Set on a pendulum's swinging ball: its collider (for where it is now), kick speed and swing.
      collider?: Collider;
      kick?: number;
      swing?: { x: number; y: number; w: number };
    }
  | { kind: 'sling'; visual: number; nx: number; ny: number; kick: number }
  | { kind: 'tramp'; visual: number; collider: Collider; max: number }
  | { kind: 'breakaway'; visual: number; collider: Collider; kick: number; x1: number; x2: number; y: number; broken: boolean }
  | { kind: Exclude<HitTarget, 'marble'> };

export function marbleColor(i: number): number {
  const h = ((i * 137.508) % 360) / 360;
  const s = 0.78;
  const l = 0.6;
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

/**
 * Headless race simulation: physics, course and marbles.
 * Knows nothing about rendering — the renderer and audio read its state and drain `events`.
 */
export class Sim {
  readonly world: World;
  readonly rng: Rng;
  readonly opts: SimOptions;
  /** A section or course preview: nameless marbles keep dropping in, and there's no race. */
  private readonly previewing: boolean;
  private eq: EventQueue;

  t = 0;
  raceTime = 0;
  phase: 'countdown' | 'racing' | 'done' = 'countdown';

  marbles: Marble[] = [];
  ranking: Marble[] = [];
  visuals: Visual[] = [];
  obstacles: Obstacle[] = [];
  zones: Zone[] = [];
  hinges: { x: number; y: number }[] = [];
  /** Decorative goal nets (no colliders): a mouth from x1 to x2 at height y, hanging `depth` below it. */
  nets: { x1: number; x2: number; y: number; depth: number }[] = [];
  segments: Segment[] = [];
  gate: Collider | null = null;
  gateY = 0;
  /** Lid of the start mixer. */
  mixerTop = 0;
  finishY = 0;
  topY = 0;
  bottomY = 0;

  events: SimEvent[] = [];
  winner: Marble | null = null;
  finishedCount = 0;
  leadChanges = 0;
  rescues = 0;

  private tags = new Map<number, Tag>();
  /** Next marble idx; section previews keep adding marbles. */
  private nextIdx = 0;
  /** Sim time of a section preview's next marble drop. */
  private nextDrop = 0;
  private stepCount = 0;
  private lastCount = -1;
  /** Current leader (with hysteresis), first-to-finish mode only. */
  leader: Marble | null = null;
  /** The last leader announced with a `lead` event; a new leader is announced once it has led for LEAD_HOLD s. */
  private announcedLeader: Marble | null = null;
  private leaderSince = 0;
  private leaderSegment = -1;

  constructor(opts: SimOptions) {
    this.opts = opts;
    this.previewing = !!(opts.section || opts.preview);
    this.rng = mulberry32(opts.seed);
    this.world = new RAPIER.World({ x: 0, y: GRAVITY });
    this.world.timestep = DT;
    this.eq = new RAPIER.EventQueue(true);

    if (opts.section) {
      buildSection(this, new Builder(this), this.rng, opts.section.kind, opts.section.id);
      this.phase = 'racing';
    } else {
      const { funnels, finish, segments, preview } = opts;
      buildCourse(this, new Builder(this), this.rng, { count: segmentCount(opts.length), funnels, finish, segments, preview });
      if (preview) this.phase = 'racing';
    }
    this.spawnMarbles();
    this.updateRanking();
  }

  dispose() {
    this.eq.free();
    this.world.free();
  }

  // ---- registration (used by Builder) -------------------------------------

  addVisual(collider: Collider, shape: Shape, style: VisualStyle, dynamic: boolean): number {
    const id = this.visuals.length;
    this.visuals.push({ id, collider, shape, style, dynamic });
    return id;
  }

  tag(collider: Collider, tag: Tag) {
    this.tags.set(collider.handle, tag);
  }

  emit(e: SimEvent) {
    this.events.push(e);
  }

  // ---- setup ----------------------------------------------------------------

  private spawnMarbles() {
    const n = this.opts.names.length;
    const cols = 17;
    const spacing = (W - 1.2) / (cols - 1);
    const slots = shuffle(this.rng, [...Array(n).keys()]);
    this.opts.names.forEach((name, idx) => {
      const slot = slots[idx];
      const row = Math.floor(slot / cols);
      // Odd rows are offset so stacked marbles nest instead of balancing.
      const x = Math.min(W - 0.42, 0.6 + (slot % cols) * spacing + (row % 2) * spacing * 0.5);
      const y = this.gateY - 0.5 - row * 0.72;
      this.createMarble(idx, name, x, y, x + (this.rng() - 0.5) * 0.05);
    });
    this.nextIdx = n;
  }

  /** Adds a marble at (bodyX, y); `x` is its recorded starting x. */
  private createMarble(idx: number, name: string, x: number, y: number, bodyX = x): Marble {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(bodyX, y)
        .setCcdEnabled(true)
        .setLinearDamping(0.05)
        .setAngularDamping(0.2)
        .setCanSleep(false),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(MARBLE_R)
        .setRestitution(0.4)
        .setFriction(0.15)
        .setDensity(1)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    const m: Marble = {
      idx,
      name,
      color: marbleColor(idx),
      body,
      collider,
      x,
      y,
      angle: 0,
      finished: false,
      finishTime: 0,
      place: 0,
      rank: idx,
      worstRank: 0,
      comebackDone: false,
      ghost: null,
      cooldowns: new Map(),
      still: 0,
      segment: -1,
      bestY: y,
      bestT: this.t,
    };
    this.marbles.push(m);
    this.tag(collider, { kind: 'marble', m });
    return m;
  }

  // ---- section previews -------------------------------------------------------

  /**
   * A section preview keeps dropping nameless marbles in at random spots along the top, so you can see the
   * section at work. A marble is taken away once it falls out of the bottom, or, in a finish, a moment after
   * it crosses the line (it sits in the basin until then). Nothing here runs in a race.
   */
  private previewTick() {
    // After the first step, when the world can be queried for open spots.
    if (this.opts.preview && this.stepCount === 0) this.seedCoursePreview();
    if (this.t >= this.nextDrop && this.marbles.length < (this.opts.preview ? COURSE_PREVIEW_MAX : PREVIEW_MAX)) {
      this.nextDrop = this.t + 0.3 + this.rng() * 0.4;
      const x = 0.8 + this.rng() * (W - 1.6);
      const y = this.topY + 0.3;
      if (!this.world.intersectionWithShape({ x, y }, 0, new RAPIER.Ball(MARBLE_R * 1.1))) {
        const m = this.createMarble(this.nextIdx++, '', x, y);
        m.body.setLinvel({ x: (this.rng() - 0.5) * 2, y: 1 }, true);
      }
    }
    for (const m of this.marbles.slice()) {
      const gone = m.finished ? this.t - m.finishTime > 1.5 : m.y > this.bottomY + 1 || this.t - m.bestT > 45;
      if (gone) this.removeMarble(m);
    }
  }

  /**
   * A course preview pans down a long course, far ahead of the first marbles dropped in at the top, so it
   * starts with a couple dropped in at the top of every section too.
   */
  private seedCoursePreview() {
    for (const s of this.segments) {
      for (let k = 0; k < 2; k++) {
        const x = 0.8 + this.rng() * (W - 1.6);
        const y = s.y0 + 0.3;
        if (this.world.intersectionWithShape({ x, y }, 0, new RAPIER.Ball(MARBLE_R * 1.1))) continue;
        this.createMarble(this.nextIdx++, '', x, y).body.setLinvel({ x: (this.rng() - 0.5) * 2, y: 1 }, true);
      }
    }
  }

  private removeMarble(m: Marble) {
    this.tags.delete(m.collider.handle);
    this.world.removeRigidBody(m.body);
    this.marbles.splice(this.marbles.indexOf(m), 1);
    this.ranking = this.ranking.filter((r) => r !== m);
  }

  private release() {
    this.phase = 'racing';
    if (this.gate) this.world.removeCollider(this.gate, true);
    this.gate = null;
    this.emit({ type: 'gate' });
  }

  // ---- stepping -------------------------------------------------------------

  step() {
    const t = this.t;
    if (this.phase === 'countdown') {
      const n = COUNTDOWN - Math.floor(t);
      if (n > 0 && n !== this.lastCount) {
        this.lastCount = n;
        this.emit({ type: 'count', n });
      }
      if (t >= COUNTDOWN) this.release();
    } else {
      this.raceTime += DT;
    }

    for (const o of this.obstacles) o.update(t);
    for (const z of this.zones) z.update(t);
    for (const m of this.marbles) this.preStep(m);

    this.world.step(this.eq);
    this.eq.drainCollisionEvents((h1, h2, started) => {
      if (started) this.onContact(h1, h2);
    });
    this.t += DT;

    let finishedNow = false;
    for (const m of this.marbles) {
      const p = m.body.translation();
      m.x = p.x;
      m.y = p.y;
      m.angle = m.body.rotation();
      if (!m.finished && !m.ghost && this.phase !== 'countdown' && m.y > this.finishY) {
        if (this.previewing) {
          // A preview has no race: just mark the marble so it's taken away in a moment.
          m.finished = true;
          m.finishTime = this.t;
          this.emit({ type: 'finish', marble: m.idx, place: 0 });
          continue;
        }
        this.finish(m);
        finishedNow = true;
      }
    }
    if (this.previewing) this.previewTick();

    if (++this.stepCount % 6 === 0 || finishedNow) this.updateRanking();
  }

  private preStep(m: Marble) {
    if (m.finished) return;
    const body = m.body;

    if (m.ghost) {
      if (m.y <= m.ghost.topY) {
        m.collider.setCollisionGroups(ALL_GROUPS);
        body.setGravityScale(1, true);
        body.setLinvel({ x: m.ghost.vx, y: 0 }, true);
        m.ghost = null;
        // Restart the no-progress clock from here, or the rescue would undo the lift.
        m.bestY = m.y;
        m.bestT = this.t;
      } else {
        body.setTranslation({ x: m.ghost.x, y: m.y }, true);
        body.setLinvel({ x: 0, y: -LIFT_SPEED }, true);
      }
      return;
    }

    for (const z of this.zones) {
      if (m.y < z.minY || m.y > z.maxY) continue;
      if (z.contains(m.x, m.y)) z.affect(m, this);
      if (m.ghost) return;
    }

    if (this.phase !== 'countdown') {
      if (m.y > m.bestY + 0.5) {
        m.bestY = m.y;
        m.bestT = this.t;
      } else if (this.t - m.bestT > 20) {
        // Last-resort rescue for a marble caught in some loop: drop it a little further down.
        m.bestT = this.t;
        this.rescue(m);
        return;
      }
      const v = body.linvel();
      if (v.x * v.x + v.y * v.y < 0.09) {
        m.still += DT;
        if (m.still > 3.5) {
          // Anti-stall: nothing should be stuck forever.
          m.still = 0;
          const mass = body.mass();
          body.applyImpulse({ x: (this.rng() - 0.5) * 4 * mass, y: -3 * mass }, true);
        }
      } else {
        m.still = 0;
      }
    }

    if (m.x < 0 || m.x > W) {
      body.setTranslation({ x: Math.min(W - 0.5, Math.max(0.5, m.x)), y: m.y }, true);
      body.setLinvel({ x: 0, y: 0 }, true);
    }
  }

  private onContact(h1: number, h2: number) {
    const a = this.tags.get(h1);
    const b = this.tags.get(h2);
    if (a?.kind === 'marble') this.marbleHit(a.m, b);
    else if (b?.kind === 'marble') this.marbleHit(b.m, a);
  }

  private marbleHit(m: Marble, other: Tag | undefined) {
    const p = m.body.translation();
    if (other?.kind === 'bumper') {
      // A pendulum's ball moves, so read where it is now.
      const c = other.collider?.translation() ?? other;
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const d = Math.hypot(dx, dy) || 1;
      const kick = other.kick ?? 11;
      let vx = (dx / d) * kick;
      let vy = (dy / d) * kick;
      // A swinging ball also carries the marble along with its swing.
      const s = other.swing;
      if (s) {
        vx += -s.w * (c.y - s.y);
        vy += s.w * (c.x - s.x);
      }
      m.body.setLinvel({ x: vx, y: vy }, true);
      this.emit({ type: 'bumper', marble: m.idx, visual: other.visual, x: c.x + (dx / d) * other.r, y: c.y + (dy / d) * other.r });
      return;
    }
    if (other?.kind === 'sling') {
      // Keep the speed along the kicker's face and fire the marble off it.
      const v = m.body.linvel();
      const along = v.x * -other.ny + v.y * other.nx;
      m.body.setLinvel({ x: -other.ny * along + other.nx * other.kick, y: other.nx * along + other.ny * other.kick }, true);
      this.emit({ type: 'sling', marble: m.idx, visual: other.visual, x: p.x - other.nx * MARBLE_R, y: p.y - other.ny * MARBLE_R });
      return;
    }
    if (other?.kind === 'tramp') {
      // Upward normal of the pad (it may be wobbling, so read its current rotation).
      const rot = other.collider.rotation();
      let nx = Math.cos(rot);
      let ny = Math.sin(rot);
      if (ny > 0) [nx, ny] = [-nx, -ny];
      const c = other.collider.translation();
      // Only the top face bounces; hitting the underside is an ordinary knock.
      if ((p.x - c.x) * nx + (p.y - c.y) * ny > 0) {
        // Keep most of the slide along the tilted face and spring off it, so marbles fly off at an angle.
        // Capped so a bounce never reaches the row above (apex = v²/2g), and damped so a marble doesn't
        // hop sideways from pad to pad along one row.
        const v = m.body.linvel();
        const along = (v.x * -ny + v.y * nx) * 0.75;
        const vn = Math.abs(v.x * nx + v.y * ny);
        const out = Math.min(other.max, Math.max(3.5, vn * 0.45 + 1.5));
        m.body.setLinvel({ x: -ny * along + nx * out, y: nx * along + ny * out }, true);
        this.emit({ type: 'tramp', marble: m.idx, visual: other.visual, x: p.x - nx * MARBLE_R, y: p.y - ny * MARBLE_R });
        return;
      }
    }
    if (other?.kind === 'breakaway' && p.y < other.y) {
      // Landed on top: launch the marble back up with a little random sideways scatter, and the platform
      // is gone for good (it stops colliding; the renderer fades it out). Marbles landing on it in the
      // same step all get launched; after that, nothing touches it again.
      const v = m.body.linvel();
      m.body.setLinvel({ x: v.x * 0.5 + (this.rng() - 0.5) * 3, y: -other.kick }, true);
      if (!other.broken) {
        other.broken = true;
        other.collider.setCollisionGroups(NO_GROUPS);
        this.emit({ type: 'shatter', marble: m.idx, visual: other.visual, x: p.x, y: other.y, x1: other.x1, x2: other.x2 });
      }
      return;
    }
    const v = m.body.linvel();
    const speed = Math.hypot(v.x, v.y);
    if (speed > 1.2) {
      const target = !other || other.kind === 'tramp' || other.kind === 'breakaway' ? 'wall' : other.kind;
      this.emit({ type: 'hit', marble: m.idx, speed, x: p.x, y: p.y, target });
    }
  }

  private finish(m: Marble) {
    m.finished = true;
    m.finishTime = this.raceTime;
    m.place = ++this.finishedCount;
    this.emit({ type: 'finish', marble: m.idx, place: m.place });
    if (this.winner) return;
    const n = this.marbles.length;
    if (this.opts.mode === 'first') {
      this.setWinner(m);
    } else if (this.finishedCount >= n - 1) {
      this.setWinner(this.marbles.find((x) => !x.finished) ?? m);
    }
  }

  private setWinner(m: Marble) {
    this.winner = m;
    this.phase = 'done';
    this.emit({ type: 'winner', marble: m.idx });
  }

  private updateRanking() {
    this.ranking = this.marbles.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.place - b.place;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.y - a.y;
    });
    this.ranking.forEach((m, i) => (m.rank = i));
    if (this.phase !== 'racing' || this.previewing) return;

    if (this.raceTime > 4) for (const m of this.marbles) m.worstRank = Math.max(m.worstRank, m.rank);

    const front = this.ranking.find((m) => !m.finished);
    if (!front) return;

    if (this.opts.mode === 'first' && this.finishedCount === 0) {
      const prev = this.leader;
      // Hysteresis so two marbles side by side don't flicker the lead.
      if (prev !== front && (!prev || prev.ghost || front.y - prev.y > 0.5)) {
        this.leader = front;
        this.leaderSince = this.raceTime;
        if (!prev) this.announcedLeader = front;
      }
      // Only announce (and count) a new leader once it has held the lead for a full second, so a brief
      // overtake that's undone straight away doesn't flash a banner.
      const lead = this.leader;
      if (lead && lead !== this.announcedLeader && this.raceTime - this.leaderSince >= LEAD_HOLD) {
        const was = this.announcedLeader;
        this.announcedLeader = lead;
        if (was && this.leaderSince > 2) {
          this.leadChanges++;
          this.emit({ type: 'lead', marble: lead.idx, prev: was.idx });
          const n = this.marbles.length;
          if (!lead.comebackDone && n >= 4 && lead.worstRank >= Math.max(3, Math.ceil(n * 0.6))) {
            lead.comebackDone = true;
            this.emit({ type: 'comeback', marble: lead.idx });
          }
        }
      }
    }

    const seg = this.segmentAt(front.y);
    if (seg > this.leaderSegment) {
      this.leaderSegment = seg;
      if (seg >= 0) this.emit({ type: 'segment', marble: front.idx, name: this.segments[seg].name });
    }
  }

  segmentAt(y: number): number {
    for (let i = this.segments.length - 1; i >= 0; i--) if (y >= this.segments[i].y0) return i;
    return -1;
  }

  /** 0 at the start gate, 1 at the finish line. */
  progress(m: Marble): number {
    if (m.finished) return 1;
    return Math.min(1, Math.max(0, (m.y - this.gateY) / (this.finishY - this.gateY)));
  }

  // ---- actions (used by zones) -----------------------------

  /** True if `m` used `key` within the last `dur` seconds; otherwise starts the cooldown. */
  coolingDown(m: Marble, key: object, dur: number): boolean {
    const until = m.cooldowns.get(key) ?? 0;
    if (this.t < until) return true;
    m.cooldowns.set(key, this.t + dur);
    return false;
  }

  teleport(m: Marble, x: number, y: number, keepVel: number) {
    const v = m.body.linvel();
    m.body.setTranslation({ x, y }, true);
    m.body.setLinvel({ x: v.x * keepVel, y: v.y * keepVel }, true);
    // Sent back up (a back-portal): restart the no-progress clock from the new spot. Otherwise the
    // rescue would drop the marble back down after 20 s and undo the setback.
    if (y < m.y) {
      m.bestY = y;
      m.bestT = this.t;
    }
    m.x = x;
    m.y = y;
  }

  startLift(m: Marble, lift: LiftZone) {
    if (m.ghost) return;
    m.ghost = { x: lift.railX, topY: lift.topY, vx: lift.releaseVx };
    m.collider.setCollisionGroups(NO_GROUPS);
    m.body.setGravityScale(0, true);
    this.emit({ type: 'lift', marble: m.idx, x: m.x, y: m.y });
  }

  private rescue(m: Marble) {
    this.rescues++;
    const ball = new RAPIER.Ball(MARBLE_R * 1.15);
    for (let dy = 2; dy <= 8; dy += 1.5) {
      for (const x of [m.x, 8, 4, 12, 2, 14]) {
        const y = m.y + dy;
        if (this.world.intersectionWithShape({ x, y }, 0, ball)) continue;
        const fromX = m.x;
        const fromY = m.y;
        this.teleport(m, x, y, 0);
        this.emit({ type: 'warp', marble: m.idx, fromX, fromY, x, y });
        return;
      }
    }
  }
}
