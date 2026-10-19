import RAPIER from '@dimforge/rapier2d-compat';
import { HALF_PI, NO_GROUPS, W } from '../constants';
import { range, type Rng } from '../rng';
import type { Builder } from '.';

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

/**
 * Foosball rod across the course at height y: `count` players `spacing` apart that slide together as a unit
 * (the end players come right up to the walls) and kick together every `period` seconds. Each player (see
 * FOOS_PARTS) pivots on the rod; a kick swings the feet up toward the side with more room, clamped so
 * nothing reaches into a wall. The rod itself is just drawn.
 */
export function foosRod(this: Builder, y: number, count: number, spacing: number, style: 'foosBlack' | 'foosYellow', speed: number, period: number, phase: number, rng: Rng) {
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
