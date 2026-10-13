import RAPIER, { type Collider, type RigidBody } from '@dimforge/rapier2d-compat';
import { NO_GROUPS, W } from './constants';
import type { Sim } from './sim';
import { mulberry32, range, type Rng } from './rng';
import type { VisualStyle } from './types';
import { BlackHoleZone, BoosterZone, ConveyorZone, FanZone, LiftZone, PortalZone, RiserZone, SkyZone, StamperZone, type BeltOpts, type Patrol, type Track, type Vortex } from './zones';

const HALF_PI = Math.PI / 2;

/**
 * Foosball player, relative to its pivot on the rod (y down, m), shaped like a real table's man: a domed head,
 * a chest block the rod runs through (with flanges each side), one thick leg and a block foot. Each part is
 * [x, y, half-width, half-height, corner radius] (a ball when all three match, a capsule when only the
 * half-width and radius do); the renderer draws the figure itself (`foosman()` in renderer.ts),
 * matching these shapes.
 */
const FOOS_PARTS: [number, number, number, number, number][] = [
  [0, -0.45, 0.3, 0.3, 0.3], // head (a ball)
  [0, 0, 0.38, 0.33, 0.08], // chest and flanges
  [0, 0.55, 0.17, 0.35, 0.17], // leg (a capsule)
  [0, 1.21, 0.22, 0.32, 0.06], // foot
];
/** The gap a player keeps to a wall at full slide, and how far a kick swings it (rad). */
const FOOS_WALL = 0.25;
const FOOS_KICK = 0.9;

/** How far the player reaches either side of its pivot, rotated `a` radians: [left, right]. */
function foosReach(a: number): [number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  let left = 0;
  let right = 0;
  for (const [x, y, hw, hh, r] of FOOS_PARTS) {
    for (const cx of [x - hw + r, x + hw - r]) {
      for (const cy of [y - hh + r, y + hh - r]) {
        const px = cx * c - cy * s;
        left = Math.max(left, r - px);
        right = Math.max(right, px + r);
      }
    }
  }
  return [left, right];
}

/** Half the player's width at rest (its flanges). */
const FOOS_HALF = foosReach(0)[1];

/** Builds course geometry into the sim's physics world and registers visuals/zones for the renderer. */
export class Builder {
  constructor(private sim: Sim) {}

  private get world() {
    return this.sim.world;
  }

  // ---- static geometry ----------------------------------------------------

  /** Capsule wall between two points (rounded ends so chained walls never snag). */
  wall(x1: number, y1: number, x2: number, y2: number, r = 0.15, style: VisualStyle = 'wall'): Collider {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const c = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(len / 2, r)
        .setTranslation((x1 + x2) / 2, (y1 + y2) / 2)
        .setRotation(ang - HALF_PI)
        .setFriction(0.15)
        .setRestitution(0.25),
    );
    this.sim.addVisual(c, { kind: 'capsule', hh: len / 2, r }, style, false);
    this.sim.tag(c, { kind: 'wall' });
    return c;
  }

  /** Short slanted ledge off a side wall, so marbles can't skip a section by hugging the wall. */
  ledge(side: 'left' | 'right', y: number, len = 1.6, drop = 0.9) {
    if (side === 'left') this.wall(0, y, len, y + drop);
    else this.wall(W, y, W - len, y + drop);
  }

  peg(x: number, y: number, r = 0.15) {
    const c = this.world.createCollider(
      RAPIER.ColliderDesc.ball(r).setTranslation(x, y).setRestitution(0.45).setFriction(0.1),
    );
    this.sim.addVisual(c, { kind: 'circle', r }, 'peg', false);
    this.sim.tag(c, { kind: 'peg' });
  }

  bumper(x: number, y: number, r = 0.5) {
    const c = this.world.createCollider(
      RAPIER.ColliderDesc.ball(r).setTranslation(x, y).setRestitution(0.6).setFriction(0),
    );
    const id = this.sim.addVisual(c, { kind: 'circle', r }, 'bumper', false);
    this.sim.tag(c, { kind: 'bumper', visual: id, x, y, r });
  }

  /** Pinball slingshot: a kicker wall that fires marbles off its upper face (the side facing up). */
  sling(x1: number, y1: number, x2: number, y2: number, kick: number) {
    const r = 0.18;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const c = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(len / 2, r)
        .setTranslation((x1 + x2) / 2, (y1 + y2) / 2)
        .setRotation(Math.atan2(y2 - y1, x2 - x1) - HALF_PI)
        .setFriction(0.1)
        .setRestitution(0.3),
    );
    const id = this.sim.addVisual(c, { kind: 'capsule', hh: len / 2, r }, 'sling', false);
    let nx = (y2 - y1) / len;
    let ny = -(x2 - x1) / len;
    if (ny > 0) [nx, ny] = [-nx, -ny];
    this.sim.tag(c, { kind: 'sling', visual: id, nx, ny, kick });
  }

  /**
   * Short trampoline pad centred at (x, y), tilted by `angle` (radians, positive = right end lower), that
   * springs marbles off its top face at up to `max` m/s. With `wobble`, it rocks about its centre.
   */
  tramp(x: number, y: number, len: number, angle: number, max: number, wobble?: { amp: number; w: number; phase: number }) {
    const r = 0.12;
    const rot = angle - HALF_PI;
    const body = wobble ? this.kinematic(x, y, rot) : null;
    const desc = RAPIER.ColliderDesc.capsule(len / 2, r).setFriction(0.1).setRestitution(0.3);
    const c = body ? this.world.createCollider(desc, body) : this.world.createCollider(desc.setTranslation(x, y).setRotation(rot));
    const id = this.sim.addVisual(c, { kind: 'capsule', hh: len / 2, r }, 'tramp', !!body);
    this.sim.tag(c, { kind: 'tramp', visual: id, collider: c, max });
    if (body && wobble) {
      this.hinge(x, y);
      this.sim.obstacles.push({ update: (t) => body.setNextKinematicRotation(rot + wobble.amp * Math.sin(wobble.w * t + wobble.phase)) });
    }
  }

  /**
   * Flat breakaway platform from x1 to x2 at height y. The first marble to land on it is launched
   * upward at `kick` m/s, and the platform breaks for good: everyone after it falls straight through.
   */
  breakaway(x1: number, x2: number, y: number, kick: number) {
    const r = 0.15;
    const c = this.world.createCollider(
      RAPIER.ColliderDesc.capsule((x2 - x1) / 2, r)
        .setTranslation((x1 + x2) / 2, y)
        .setRotation(HALF_PI)
        .setFriction(0.15)
        .setRestitution(0.2),
    );
    const id = this.sim.addVisual(c, { kind: 'capsule', hh: (x2 - x1) / 2, r }, 'breakaway', false);
    this.sim.tag(c, { kind: 'breakaway', visual: id, collider: c, kick, x1, x2, y, broken: false });
  }

  /**
   * Pendulum hung from (px, py): a bumper ball of radius `r` on a rod of length `len`, swinging `amp` radians
   * either side at `w` rad/s. Only the ball is solid (the rod is just drawn), it kicks marbles away at `kick`
   * m/s, and they also pick up the ball's swing speed.
   */
  pendulum(px: number, py: number, len: number, r: number, amp: number, w: number, phase: number, kick: number) {
    const body = this.kinematic(px, py, amp * Math.sin(phase));
    // The rod has a collider only so the renderer can follow it; it touches nothing.
    const rod = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(len / 2, 0.06).setTranslation(0, len / 2).setSensor(true).setCollisionGroups(NO_GROUPS),
      body,
    );
    this.sim.addVisual(rod, { kind: 'capsule', hh: len / 2, r: 0.06 }, 'rod', true);
    const c = this.world.createCollider(
      RAPIER.ColliderDesc.ball(r).setTranslation(0, len).setRestitution(0.6).setFriction(0),
      body,
    );
    const id = this.sim.addVisual(c, { kind: 'circle', r }, 'bumper', true);
    const swing = { x: px, y: py, w: 0 };
    this.sim.tag(c, { kind: 'bumper', visual: id, x: px, y: py + len, r, collider: c, kick, swing });
    this.hinge(px, py);
    this.sim.obstacles.push({
      update: (t) => {
        body.setNextKinematicRotation(amp * Math.sin(w * t + phase));
        swing.w = amp * w * Math.cos(w * t + phase);
      },
    });
  }

  /**
   * Foosball rod across the course at height y: `count` players `spacing` apart that slide together as a unit
   * (the end players come right up to the walls) and kick together every `period` seconds. Each player (see
   * FOOS_PARTS) pivots on the rod; a kick swings the feet up toward the side with more room, clamped so
   * nothing reaches into a wall. The rod itself is just drawn.
   */
  foosRod(y: number, count: number, spacing: number, style: 'foosBlack' | 'foosYellow', speed: number, period: number, phase: number, rng: Rng) {
    const rod = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(W / 2, 0.07).setTranslation(W / 2, y).setRotation(HALF_PI).setSensor(true).setCollisionGroups(NO_GROUPS),
    );
    this.sim.addVisual(rod, { kind: 'capsule', hh: W / 2, r: 0.07 }, 'rod', false);

    const span = (count - 1) * spacing;
    // Pivot gap to each wall with the rod centred, and how far the rod slides either way: at full travel the
    // end player's flanges stop FOOS_WALL short of the wall, too narrow for a marble to slip through.
    const edge = 8 - span / 2;
    const amp = edge - FOOS_HALF - FOOS_WALL;
    const bodies = Array.from({ length: count }, (_, k) => {
      const body = this.kinematic(8 - span / 2 + k * spacing, y);
      for (const [px, py, hw, hh, r] of FOOS_PARTS) {
        const desc =
          hw === r && hh === r
            ? RAPIER.ColliderDesc.ball(r)
            : hw === r
              ? RAPIER.ColliderDesc.capsule(hh - r, r)
              : RAPIER.ColliderDesc.roundCuboid(hw - r, hh - r, r);
        const c = this.world.createCollider(desc.setTranslation(px, py).setFriction(0.2).setRestitution(0.35), body);
        this.sim.tag(c, { kind: 'spinner' });
      }
      // The renderer draws the whole figure from this one marker at the pivot; it touches nothing.
      const mark = this.world.createCollider(RAPIER.ColliderDesc.ball(0.05).setSensor(true).setCollisionGroups(NO_GROUPS), body);
      this.sim.addVisual(mark, { kind: 'foosman' }, style, true);
      return body;
    });

    // The slide wanders: a main sway plus a faster wobble, scaled so the rod never moves faster than ~1.3 × speed.
    const w1 = speed / amp;
    const w2 = w1 * range(rng, 2.0, 2.6);
    const p1 = rng() * 6.3;
    const p2 = rng() * 6.3;
    const offset = (t: number) => amp * (0.75 * Math.sin(w1 * t + p1) + 0.25 * Math.sin(w2 * t + p2));
    let lastCycle = -1;
    let dir = 1;
    this.sim.obstacles.push({
      update: (t) => {
        const o = offset(t);
        const tt = t + phase;
        const cyc = Math.floor(tt / period);
        const u = tt - cyc * period;
        if (cyc !== lastCycle) {
          // Kick toward the wall that's further away (positive rotation swings the feet left).
          dir = o > 0 ? 1 : -1;
          if (lastCycle >= 0) this.sim.emit({ type: 'flip', x: 8 + o, y });
          lastCycle = cyc;
        }
        const f = u < 0.22 ? u / 0.22 : u < 0.36 ? 1 : u < 0.7 ? 1 - (u - 0.36) / 0.34 : 0;
        // The end player on the kicking side keeps its foot ~0.9 m off the wall (the house rule), and its head,
        // which swings the other way, stays clear of the near wall.
        const kickRoom = dir > 0 ? edge + o : edge - o;
        const headRoom = dir > 0 ? edge - o : edge + o;
        let a = FOOS_KICK * f;
        for (; a > 0; a -= 0.05) {
          const [kick, head] = foosReach(a);
          if (kick <= kickRoom - 0.9 && head <= headRoom - 0.1) break;
        }
        a = Math.max(0, a);
        bodies.forEach((body, k) => {
          body.setNextKinematicTranslation({ x: 8 - span / 2 + k * spacing + o, y });
          body.setNextKinematicRotation(dir * a);
        });
      },
    });
  }

  // ---- kinematic obstacles --------------------------------------------------

  private kinematic(x: number, y: number, rot = 0): RigidBody {
    return this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y).setRotation(rot),
    );
  }

  /** Capsule arm from the body origin out to side*len along local X. */
  private arm(body: RigidBody, len: number, r: number, side: number, style: VisualStyle) {
    const c = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(len / 2, r)
        .setTranslation((side * len) / 2, 0)
        .setRotation(HALF_PI)
        .setFriction(0.3)
        .setRestitution(0.3),
      body,
    );
    this.sim.addVisual(c, { kind: 'capsule', hh: len / 2, r }, style, true);
    this.sim.tag(c, { kind: 'spinner' });
  }

  /** Rotating cross/bar. `bars` full-length bars through the hub. */
  windmill(x: number, y: number, arm: number, speed: number, bars: number, phase: number, r = 0.14) {
    const body = this.kinematic(x, y, phase);
    for (let k = 0; k < bars; k++) {
      const c = this.world.createCollider(
        RAPIER.ColliderDesc.capsule(arm, r).setRotation((k * Math.PI) / bars).setFriction(0.3).setRestitution(0.3),
        body,
      );
      this.sim.addVisual(c, { kind: 'capsule', hh: arm, r }, 'spinner', true);
      this.sim.tag(c, { kind: 'spinner' });
    }
    this.hinge(x, y);
    this.sim.obstacles.push({ update: (t) => body.setNextKinematicRotation(phase + speed * t) });
  }

  /** Horizontal shelf sliding side to side while gently tilting. */
  slider(cx: number, y: number, half: number, amp: number, w: number, phase: number, tilt: number, w2: number) {
    const body = this.kinematic(cx + amp * Math.sin(phase), y);
    const c = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(half, 0.15).setRotation(HALF_PI).setFriction(0.6).setRestitution(0.2),
      body,
    );
    this.sim.addVisual(c, { kind: 'capsule', hh: half, r: 0.15 }, 'slider', true);
    this.sim.tag(c, { kind: 'spinner' });
    this.sim.obstacles.push({
      update: (t) => {
        body.setNextKinematicTranslation({ x: cx + amp * Math.sin(w * t + phase), y });
        body.setNextKinematicRotation(tilt * Math.sin(w2 * t + phase * 1.7));
      },
    });
  }

  /**
   * Floor panel hinged at (hx, hy) extending side*len; swings down to dump marbles on a timer. Open, it
   * hangs `swing` radians below level (past π/2, its tip swings back out beyond the hinge).
   */
  trapdoor(hx: number, hy: number, len: number, side: number, period: number, openDur: number, phase: number, swing = 1.35) {
    this.hatch(hx, hy, len, side, (t) => {
      const u = (((t + phase) % period) + period) % period;
      return u < openDur ? Math.min(1, u / 0.2) * Math.min(1, (openDur - u) / 0.3) : 0;
    }, swing);
  }

  /** A trapdoor driven by `level(t)`: 0 closed, 1 fully open (swung down by `swing` rad). */
  hatch(hx: number, hy: number, len: number, side: number, level: (t: number) => number, swing = 1.35) {
    const body = this.kinematic(hx, hy);
    this.arm(body, len, 0.14, side, 'trapdoor');
    let wasOpen = false;
    this.sim.obstacles.push({
      update: (t) => {
        const open = level(t);
        if (open > 0 && !wasOpen) this.sim.emit({ type: 'trapdoor', x: hx + (side * len) / 2, y: hy });
        wasOpen = open > 0;
        body.setNextKinematicRotation(side * swing * open);
      },
    });
  }

  /** Pinball flipper hinged at (hx, hy) that periodically flicks marbles back up. */
  flipper(hx: number, hy: number, len: number, side: number, period: number, phase: number) {
    const rest = side * 0.5;
    const up = -side * 0.45;
    const body = this.kinematic(hx, hy, rest);
    this.arm(body, len, 0.17, side, 'flipper');
    this.hinge(hx, hy);
    let lastCycle = -1;
    this.sim.obstacles.push({
      update: (t) => {
        const tt = t + phase;
        const cyc = Math.floor(tt / period);
        const u = tt - cyc * period;
        if (cyc !== lastCycle) {
          if (lastCycle >= 0) this.sim.emit({ type: 'flip', x: hx, y: hy });
          lastCycle = cyc;
        }
        const f = u < 0.1 ? u / 0.1 : u < 0.25 ? 1 : u < 0.55 ? 1 - (u - 0.25) / 0.3 : 0;
        body.setNextKinematicRotation(rest + (up - rest) * f);
      },
    });
  }

  /** Platform rocking about its centre: which way it tips decides where marbles roll. */
  seesaw(cx: number, cy: number, half: number, amp: number, w: number, phase: number) {
    const body = this.kinematic(cx, cy, amp * Math.sin(phase));
    const c = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(half, 0.15).setRotation(HALF_PI).setFriction(0.2).setRestitution(0.2),
      body,
    );
    this.sim.addVisual(c, { kind: 'capsule', hh: half, r: 0.15 }, 'seesaw', true);
    this.sim.tag(c, { kind: 'spinner' });
    this.hinge(cx, cy);
    this.sim.obstacles.push({ update: (t) => body.setNextKinematicRotation(amp * Math.sin(w * t + phase)) });
  }

  /**
   * Flip-flop diverter: a plate pivoted at its centre (cx, cy), tilted `tilt` radians down to one side
   * so marbles landing on it roll off that way. Each marble that drops off the low end flips it to
   * the other side, so marbles take turns going left and right (decided by arrival order, never by who).
   */
  toggle(cx: number, cy: number, half: number, tilt: number, startSide: number) {
    let side = startSide;
    let from = side * tilt;
    let flipT = -1;
    const swing = 0.16;
    const body = this.kinematic(cx, cy, from);
    const c = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(half, 0.15).setRotation(HALF_PI).setFriction(0.15).setRestitution(0.2),
      body,
    );
    this.sim.addVisual(c, { kind: 'capsule', hh: half, r: 0.15 }, 'toggle', true);
    this.sim.tag(c, { kind: 'spinner' });
    this.hinge(cx, cy);
    // A marble counts as through when it enters the band below the low tip on the open side. Only
    // entering counts, so a slow marble still in the band can't flip it again when it swings back.
    const tipX = half * Math.cos(tilt);
    const tipY = cy + half * Math.sin(tilt);
    const inBand = new Set<number>();
    this.sim.obstacles.push({
      update: (t) => {
        let u = flipT < 0 ? 1 : Math.min(1, (t - flipT) / swing);
        const e = u * u * (3 - 2 * u);
        body.setNextKinematicRotation(from + (side * tilt - from) * e);
        for (const m of this.sim.marbles) {
          const dx = Math.abs(m.x - cx);
          const inside = dx > tipX - 0.2 && dx < tipX + 1.6 && m.y > tipY + 0.2 && m.y < tipY + 1.4;
          if (!inside) {
            inBand.delete(m.idx);
            continue;
          }
          if (inBand.has(m.idx)) continue;
          inBand.add(m.idx);
          if (u < 1 || (m.x - cx) * side < 0) continue;
          from = side * tilt;
          side = -side;
          flipT = t;
          u = 0;
          this.sim.emit({ type: 'flip', x: cx, y: cy });
        }
      },
    });
  }

  /** Decorative goal net hanging `depth` below the mouth x1-x2 at height y. Marbles fall straight through it. */
  net(x1: number, x2: number, y: number, depth: number) {
    this.sim.nets.push({ x1, x2, y, depth });
  }

  /** Decorative hub drawn over a pivot (no collider). */
  private hinge(x: number, y: number) {
    this.sim.hinges.push({ x, y });
  }

  // ---- zones ----------------------------------------------------------------

  fan(x: number, y: number, w: number, h: number, dx: number, dy: number, accel: number, period: number, onFrac: number, phase: number) {
    const z = new FanZone(x, y, w, h, dx, dy, accel, period, onFrac, phase);
    this.sim.zones.push(z);
    return z;
  }

  /** Conveyor laid on top of the ramp (x1,y1)-(x2,y2). */
  conveyor(x1: number, y1: number, x2: number, y2: number, speed: number, period: number, phase: number, opts: BeltOpts = {}) {
    if (x1 > x2) [x1, y1, x2, y2] = [x2, y2, x1, y1];
    const z = new ConveyorZone(x1, y1, x2, y2, 0.9, speed, period, phase, opts);
    this.sim.zones.push(z);
    if (z.warnFor > 0) {
      // Sound the klaxon as the warning lights come on, but only before the belt turns uphill.
      let was = false;
      this.sim.obstacles.push({
        update: () => {
          if (z.warning && !was && z.next * z.uy < 0) this.sim.emit({ type: 'klaxon', x: (x1 + x2) / 2, y: (y1 + y2) / 2 });
          was = z.warning;
        },
      });
    }
    return z;
  }

  /** Piston over the ramp stretch (x1,y1)-(x2,y2) (ramp centre line). See StamperZone. */
  stamper(x1: number, y1: number, x2: number, y2: number, idle: number, phase: number, forward: boolean, kick: number, rise = 1.8) {
    if (x1 > x2) [x1, y1, x2, y2] = [x2, y2, x1, y1];
    const headR = 0.28;
    const z = new StamperZone(x1, y1, x2, y2, headR, rise, idle, phase, forward, kick);
    const body = this.kinematic(z.cx, z.cy, Math.atan2(z.uy, z.ux) - HALF_PI);
    const c = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(z.len / 2, headR).setFriction(0.3).setRestitution(0.2),
      body,
    );
    // No visual: the renderer draws the piston (rod, head, lights) from the zone.
    this.sim.tag(c, { kind: 'spinner' });
    this.sim.zones.push(z);
    this.sim.obstacles.push({
      update: (t) => {
        if (z.tick(t)) this.sim.emit({ type: 'stamp', x: z.cx, y: z.cy });
        body.setNextKinematicTranslation({ x: z.cx, y: z.cy });
      },
    });
  }

  lift(x: number, y: number, w: number, h: number, railX: number, topY: number, releaseVx: number) {
    this.sim.zones.push(new LiftZone(x, y, w, h, railX, topY, releaseVx));
  }

  booster(x: number, y: number, w: number, h: number, vx: number, vy: number, cooldown = 0.8) {
    this.sim.zones.push(new BoosterZone(x, y, w, h, vx, vy, cooldown));
  }

  /** Slow-fall air (see SkyZone) over the rectangle; the renderer streams speed lines through it. */
  sky(x: number, y: number, w: number, h: number, terminal: number, ease: number, gust: number, phase: number, drag: number) {
    this.sim.zones.push(new SkyZone(x, y, w, h, terminal, ease, gust, phase, drag));
  }

  /** Downward boost pads that stream up through the rectangle (see RiserZone), spawned from their own seeded rng. */
  risers(x: number, y: number, w: number, h: number, padWs: number[], padH: number, rise: number, vy: number, gap: [number, number], clear: number, seed: number) {
    this.sim.zones.push(new RiserZone(x, y, w, h, padWs, padH, rise, vy, gap, clear, mulberry32(seed)));
  }

  portal(
    ax: number,
    ay: number,
    r: number,
    bx: number,
    by: number,
    forward: boolean,
    patrol?: Patrol,
    exitPatrol?: Patrol,
  ) {
    this.sim.zones.push(new PortalZone(patrol ? patrol.x0 : ax, ay, r, exitPatrol ? exitPatrol.x0 : bx, by, forward, patrol, exitPatrol));
  }

  /** Black hole at (x, y), or drifting along `track`; swallowed marbles come out at (bx, by). See BlackHoleZone. */
  blackHole(x: number, y: number, r: number, pull: number, accel: number, swirl: number, bx: number, by: number, track?: Track) {
    this.sim.zones.push(new BlackHoleZone(x, y, r, pull, accel, swirl, bx, by, track));
  }

  /** Black hole that marbles orbit before falling in; see Vortex. `swirl` only sets the spin direction (its sign). */
  vortex(x: number, y: number, r: number, pull: number, accel: number, swirl: number, bx: number, by: number, vortex: Vortex) {
    this.sim.zones.push(new BlackHoleZone(x, y, r, pull, accel, swirl, bx, by, undefined, vortex));
  }
}
