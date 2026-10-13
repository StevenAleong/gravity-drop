import type { Builder } from './builder';
import type { VortexGrowth, VortexRing } from './zones';
import { COUNTDOWN, W } from './constants';
import { chance, mulberry32, range, sign, shuffle, type Rng } from './rng';
import type { Sim } from './sim';
import type { Segment } from './types';

interface Template {
  id: string;
  name: string;
  h: number;
  /** Not tested yet: shows in the section guide and the course builder, but random courses never pick it. */
  draft?: boolean;
  build(b: Builder, y0: number, rng: Rng): void;
}

/**
 * A relay of hatches where one is always open: a random cell opens for a random `dur`, and `overlap`
 * seconds before it starts closing a different random cell opens, so there's always a way through
 * somewhere, but never in a predictable place. Returns each cell's open level (0-1) at sim time t; the
 * schedule is drawn lazily from its own seeded rng, so it never runs out and replays match.
 */
function hatchRelay(seed: number, cells: number, dur: [number, number], overlap: number) {
  const rng = mulberry32(seed);
  const runs: { c: number; s: number; e: number }[] = [];
  let next = -rng() * dur[0];
  let last = -1;
  return (c: number, t: number) => {
    while (next < t + 1) {
      // Any cell but the one that's closing.
      let pick = Math.floor(rng() * (last < 0 ? cells : cells - 1));
      if (last >= 0 && pick >= last) pick++;
      const e = next + range(rng, dur[0], dur[1]);
      runs.push({ c: pick, s: next, e });
      last = pick;
      next = e - overlap;
    }
    while (runs.length && runs[0].e < t - 1) runs.shift();
    let level = 0;
    for (const r of runs) {
      if (r.c !== c || t < r.s || t > r.e) continue;
      level = Math.max(level, Math.min(1, (t - r.s) / 0.2) * Math.min(1, (r.e - t) / 0.3));
    }
    return level;
  };
}

/** Distance from point (px, py) to the segment (x1,y1)-(x2,y2). */
function segDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Staggered peg rows. `skip` lets callers keep areas clear (portals, exits).
 * With two or more rows, short deflectors on both walls between every other pair of rows push
 * wall-huggers back into the pegs; otherwise a marble on the far left or right could drop straight
 * through untouched. Pegs too close to a deflector are left out so nothing can wedge between them.
 */
function pegRows(
  b: Builder,
  rng: Rng,
  yStart: number,
  rows: number,
  gap: number,
  spacing: number,
  opts: { bumperChance?: number; skip?: (x: number, y: number) => boolean } = {},
) {
  const deflectors: [number, number, number, number][] = [];
  const len = 1.5;
  const drop = 0.6;
  for (let r = 0; r + 1 < rows; r += 2) {
    const y = yStart + (r + 0.5) * gap - drop / 2;
    deflectors.push([0, y, len, y + drop], [W, y, W - len, y + drop]);
  }
  for (const [x1, y1, x2, y2] of deflectors) b.wall(x1, y1, x2, y2);
  // Peg radius + deflector radius + marble diameter + a little slack.
  const nearDeflector = (x: number, y: number) => deflectors.some((d) => segDist(x, y, ...d) < 1.05);

  const placed: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    const y = yStart + r * gap;
    const x0 = r % 2 === 0 ? 1.0 : 1.0 + spacing / 2;
    for (let x = x0; x < W - 0.9; x += spacing) {
      if (opts.skip?.(x, y) || nearDeflector(x, y)) continue;
      if (r > 0 && opts.bumperChance && chance(rng, opts.bumperChance)) b.bumper(x, y, 0.4);
      else b.peg(x, y);
      placed.push([x, y]);
    }
  }
  // A peg just past each deflector tip, so a marble rolling off it can't fall straight down the gap
  // left by the pegs removed above. Only where it keeps a marble-sized gap to every other peg.
  for (const [x1, , x2, y2] of deflectors) {
    const px = x2 + Math.sign(x2 - x1) * 0.75;
    const py = y2 + 0.8;
    if (opts.skip?.(px, py) || placed.some(([x, y]) => Math.hypot(x - px, y - py) < 1.0)) continue;
    b.peg(px, py);
  }
}

/**
 * The equalizer: 4 floors of glass that each break the first time a marble lands on them, launching that
 * marble back up. Whoever gets there first pays for it, and the marbles behind fall straight through
 * the hole. `tiles` gives the number of tiles across for each floor (1 = one full-width pane). Tiles
 * always span the whole width, and the seams are narrower than a marble, so no lane drops past a floor
 * untouched. A sparse peg row between floors scatters marbles sideways (so different tiles break first)
 * and catches the launched ones: the highest bounce (~2 m) reaches it but never the floor above.
 */
function glassFloors(b: Builder, y0: number, rng: Rng, tiles: number[]) {
  const SEAM = 0.25; // gap from a seam to each tile's end-cap centre: 0.2 m clear, under a marble's 0.64
  tiles.forEach((n, r) => {
    const y = y0 + 2.2 + r * 3.6;
    const cell = W / n;
    for (let i = 0; i < n; i++) {
      const x1 = i === 0 ? 0.15 : i * cell + SEAM;
      const x2 = i === n - 1 ? W - 0.15 : (i + 1) * cell - SEAM;
      b.breakaway(x1, x2, y, range(rng, 8, 9));
    }
    if (r < tiles.length - 1) {
      for (let x = r % 2 ? 2.0 : 1.0; x < W - 0.9; x += 2.0) b.peg(x, y + 1.8);
    }
  });
}

const GLASS_ROWS = 4;

/** Tile counts for `rows` glass floors: 1 to 4 tiles each, never the same count twice in a row. */
function glassTiles(rng: Rng, rows: number): number[] {
  const tiles: number[] = [];
  for (let r = 0; r < rows; r++) {
    const options = [1, 2, 3, 4].filter((n) => n !== tiles[r - 1]);
    tiles.push(options[Math.floor(rng() * options.length)]);
  }
  return tiles;
}

/** Switch Maze: speed of the express belts on the top funnel (m/s; rolling alone reaches about 9.5). */
const SPEED_FLOOR = 13;

/** Pinball: depth of the lower table (inlane guides, slingshots and flippers) below the playfield. */
const PINBALL_LOW = 13.5;

/**
 * Foosball: rods top to bottom (players, team), the gap between rods, and the gap between players on a rod by
 * player count (a real table's, scaled to the course: 5 men ~2.75 m apart, 3 men ~4.4 m, 2 men ~5.5 m).
 * Rods leave ~0.9 m clear between one rod's feet and the next rod's heads, and a kick (apex ~1.2 m) never sends
 * a marble into the rod above.
 */
const FOOS_RODS: [number, 'foosBlack' | 'foosYellow'][] = [
  [3, 'foosBlack'], [2, 'foosBlack'], [3, 'foosYellow'], [5, 'foosBlack'],
  [5, 'foosYellow'], [3, 'foosBlack'], [2, 'foosYellow'], [3, 'foosYellow'],
];
const FOOS_PITCH = 3.3;
const FOOS_SPACING: Record<number, number> = { 2: 5.5, 3: 4.4, 5: 2.75 };
/**
 * The goal under the last (goalie) rod: funnel walls start ~0.9 m below the goalies' feet and slope down to a
 * mouth a third of the course wide, with a round post each side and a net (just drawn) hanging below it.
 */
const FOOS_GOAL_TOP = 2.0 + 7 * FOOS_PITCH + 2.4;
const FOOS_GOAL_DROP = 2.2;
const FOOS_MOUTH = W / 3;
const FOOS_NET = 1.6;
/** Hatches per Trapdoor Floor floor (it was 2, all opening together; 4 was tried too). */
const TRAPDOOR_CELLS = 3;
/** How long each hatch in the relay stays open (s), picked at random each time. */
const TRAPDOOR_OPEN: [number, number] = [1.2, 2.0];
/** Black Hole section: the hole's centre (below the section's top), the bowl's radius around it, the horizon's radius. */
const BH_CY = 8.5;
const BH_BOWL = 7.4;
const BH_R = 1.0;
/**
 * Its two rings (see Vortex). Orbit ring, out to the bowl: almost no normal gravity, so orbits stay round
 * and spiral in slowly instead of diving in on their first pass, and the pull at the floor (~16.6 m/s²)
 * easily beats what's left of gravity, so nothing can rest there. Inner: a strong pull and a low spin, so
 * reaching it means getting sucked in. Each spin stays under its ring's orbit speed √(accel · r) (10.7 m/s
 * in the orbit ring), so orbits decay.
 */
const BH_RINGS: VortexRing[] = [
  { r: BH_BOWL + 0.3, accel: 15, spin: 10.4, ease: 0.04, grav: 0.1 },
  { r: 1.3, accel: 70, spin: 4, ease: 0.05, grav: 0 },
];
/**
 * The inner ring starts small and weak, and grows to this once the hole swallows its first marble (see
 * VortexGrowth): out to 75% of the orbit ring's radius in 5 s. Its pull at that edge is only 55 m/s² (the
 * orbit ring's is ~20 there), as the pull grows as r/d inward: that's still ~310 m/s² by the horizon.
 */
const BH_GROW: VortexGrowth = { r: (BH_BOWL + 0.3) * 0.75, accel: 55, time: 5, idle: 3 };
const BH_BLEND = 0.8;

const TEMPLATES: Template[] = [
  {
    id: 'pegs',
    name: 'PEG GARDEN',
    h: 18,
    build(b, y0, rng) {
      // A tall field of plain pegs: no bumpers or boosters, just a long, clicky fall.
      pegRows(b, rng, y0 + 1, 12, 1.4, 1.4);
    },
  },
  {
    id: 'trapdoors',
    name: 'TRAPDOOR FLOOR',
    h: 17.5,
    build(b, y0, rng) {
      // Nothing above the top floor (user's request): marbles drop straight onto the hatches.
      // Two floors of TRAPDOOR_CELLS cells, each cell a pair of doors that open together like a hatch. On
      // each floor one hatch is always open (a hatchRelay, user's request): which one, and for how long, is
      // random, so a marble can get lucky and land on one just as it opens. The floor spacing was set for
      // 4 m doors, whose tips hang ~3.9 m down; these are shorter, so a swinging door never pinches a
      // resting marble.
      const cw = W / TRAPDOOR_CELLS;
      [5.5, 11].forEach((dy) => {
        const fy = y0 + dy;
        const relay = hatchRelay(Math.floor(rng() * 2 ** 32), TRAPDOOR_CELLS, TRAPDOOR_OPEN, 0.4);
        for (let c = 0; c < TRAPDOOR_CELLS; c++) {
          const x0 = c * cw;
          const level = (t: number) => relay(c, t);
          b.hatch(x0, fy, cw / 2, 1, level);
          b.hatch(x0 + cw, fy, cw / 2, -1, level);
          // A hump on the shared hinge, so nothing can sit on a pivot that never drops.
          if (c > 0) b.peg(x0, fy, 0.2);
        }
      });
    },
  },
  {
    id: 'sliders',
    name: 'SHIFTING SHELVES',
    h: 13,
    build(b, y0, rng) {
      // Lots of small shelves: rows of 3 and 2 alternating, each shelf sliding and tilting on its own.
      // Neighbours in a row can never come closer than ~1.6 m, and a shelf by a wall stays ~0.85 m off it,
      // so nothing gets pinched. The rows of 2 leave the walls open, so they get fixed side shelves sloping
      // inward: no marble can fall straight down a side. Their tips stay ~0.9 m clear of the moving shelves.
      [2.0, 4.4, 6.8, 9.2, 11.6].forEach((ry, r) => {
        for (const x of r % 2 ? [5.35, 10.65] : [2.7, 8, 13.3]) {
          b.slider(x, y0 + ry, 0.9, 0.8, range(rng, 2.0, 3.0), rng() * 6.3, 0.36, range(rng, 2, 3));
        }
        if (r % 2) {
          b.ledge('left', y0 + ry - 0.4, 2.4, 0.8);
          b.ledge('right', y0 + ry - 0.4, 2.4, 0.8);
        }
      });
    },
  },
  {
    id: 'trampolines',
    name: 'TRAMPOLINE PARK',
    h: 14.5,
    build(b, y0, rng) {
      // Six rows of short tilted pads that spring marbles off at an angle. Alternate rows sit in each
      // other's gaps, so every x meets a pad within two rows, and the outer pads reach the walls so
      // wall-huggers can't slip past. Rows are 2.2 m apart, above the highest bounce (~1.8 m).
      const rowA = [1.0, 4.6, 8, 11.4, 15.0];
      const rowB = [2.8, 6.3, 9.7, 13.2];
      for (let r = 0; r < 6; r++) {
        const y = y0 + 2 + r * 2.2;
        for (const x of r % 2 ? rowB : rowA) {
          // Every pad in the middle slowly rocks on its own random speed and phase, so the bounce angles keep
          // changing. Pads by a wall stay still, tilted inward, so nothing can rest in the corner.
          const byWall = x < 2 || x > W - 2;
          const dir = x < 2 ? 1 : x > W - 2 ? -1 : sign(rng);
          const wobble = byWall ? undefined : { amp: 0.3, w: range(rng, 1.25, 2.75), phase: rng() * 6.3 };
          b.tramp(x, y, 1.5, dir * range(rng, 0.2, 0.36), range(rng, 5.5, 6.5), wobble);
        }
      }
    },
  },
  {
    id: 'pendulums',
    name: 'PENDULUM SWING',
    h: 17.5,
    build(b, y0, rng) {
      // Six rows of pendulums with bumper balls for bobs, each on its own speed and phase. Only the balls
      // are solid; marbles pass through the rods. Rows of 4 (x 3.2-12.8) alternate with rows of 3 (x 4.8-11.2),
      // so at rest the balls of two rows cover every x between the walls. The walls never move: rows of 4
      // get short ledges and rows of 3 long ones, so a wall-hugger can't drop straight through. Swinging
      // balls stay ~0.9 m from each other and from the ledges, so nothing gets pinched, and the soft kick
      // (bounce apex under ~2 m) keeps marbles from being juggled back up into the row above, 2.6 m up.
      const rod = 1.5;
      for (let r = 0; r < 6; r++) {
        const y = y0 + 2.8 + r * 2.6;
        for (const x of r % 2 ? [4.8, 8, 11.2] : [3.2, 6.4, 9.6, 12.8]) {
          b.pendulum(x, y - rod, rod, 0.55, range(rng, 0.3, 0.42), range(rng, 1.8, 2.6), rng() * 6.3, range(rng, 3.5, 5.5));
        }
        const [len, drop] = r % 2 ? [2.6, 0.8] : [1.0, 0.6];
        b.ledge('left', y - drop / 2, len, drop);
        b.ledge('right', y - drop / 2, len, drop);
      }
    },
  },
  {
    id: 'switches',
    name: 'SWITCH MAZE',
    h: 18,
    build(b, y0, rng) {
      // A tree of flip-flop switches, like a Turing Tumble: a funnel feeds a switch, which feeds two
      // funnels with a switch each, which feed four lanes. Every marble through a switch flips it, so
      // arrival order deals the pack out across the lanes, and each lane is a different ride.
      const Y = (y: number) => y0 + y;
      const half = 1.25;
      const tilt = 0.6;
      // A funnel down to a throat 2.2 m wide (centre cx, bottom y), then the switch under it. The switch's
      // high end sits just under the short throat wall, too close for a marble to slip past on the closed
      // side. On the open side there's ~1.6 m clear under the wall: with longer throat walls and the switch
      // higher, two marbles could arch between the wall and the switch and jam it.
      const stage = (cx: number, x0: number, x1: number, top: number, y: number) => {
        b.wall(x0, Y(top), cx - 1.1, Y(y));
        b.wall(x1, Y(top), cx + 1.1, Y(y));
        b.wall(cx - 1.1, Y(y), cx - 1.1, Y(y + 0.3));
        b.wall(cx + 1.1, Y(y), cx + 1.1, Y(y + 0.3));
        b.toggle(cx, Y(y + 1.5), half, tilt, sign(rng));
      };
      stage(8, 0, W, 0.6, 3.6);
      // Speed floors (express belts, as in the old Factory) on the top funnel's walls, running down to the
      // throat. They stop short of it so the belt never shoves marbles into the switch's pivot.
      const express = { reverses: false, blend: 0.05 };
      b.conveyor(0.3, Y(0.73), 6.3, Y(3.34), SPEED_FLOOR, 1, 0, express);
      b.conveyor(W - 6.3, Y(3.34), W - 0.3, Y(0.73), -SPEED_FLOOR, 1, 0, express);
      stage(4, 0, 8, 6.1, 8.3);
      stage(12, 8, W, 6.1, 8.3);

      // Four lanes, 4 m wide, each with its own ride.
      const top = 11.4;
      const bottom = 17.6;
      b.wall(8, Y(6.1), 8, Y(bottom));
      b.wall(4, Y(10.8), 4, Y(bottom));
      b.wall(12, Y(10.8), 12, Y(bottom));
      const lanes: ((lc: number) => void)[] = [
        // Two glass floors, wall to wall: the first marble onto each is launched back up and the glass
        // shatters. The highest bounce (~2.25 m) stays below the switch's trigger band and short of the
        // floor above.
        (lc) => {
          b.breakaway(lc - 1.85, lc + 1.85, Y(top + 3.0), range(rng, 8, 9));
          b.breakaway(lc - 1.85, lc + 1.85, Y(top + 5.6), range(rng, 8, 9));
        },
        // Pegs, with short wall ledges on the middle rows so nothing slides down a wall untouched.
        // Every gap is either wide enough to pass (≥ 0.75 m clear) or closed, so nothing can wedge.
        (lc) => {
          for (let r = 0; r < 6; r++) {
            const y = Y(top + 0.6 + r * 0.9);
            if (r % 2) {
              b.peg(lc, y);
              b.wall(lc - 2, y - 0.3, lc - 1.4, y + 0.1);
              b.wall(lc + 2, y - 0.3, lc + 1.4, y + 0.1);
            } else {
              b.peg(lc - 0.7, y);
              b.peg(lc + 0.7, y);
            }
          }
        },
        // A windmill, with ledges above it turning wall-huggers onto it. Its tips stay ≥ 1 m from the walls
        // and the ledges (the house rule is 0.9 m), so nothing gets pinched.
        (lc) => {
          b.wall(lc - 2, Y(top + 0.6), lc - 1.1, Y(top + 1.3));
          b.wall(lc + 2, Y(top + 0.6), lc + 1.1, Y(top + 1.3));
          b.windmill(lc, Y(top + 3.2), 0.95, sign(rng) * range(rng, 2.5, 3.5), 3, rng() * 6);
        },
        // Three shelves from alternate walls, 2 m apart so the gap under each tip is wide open.
        (lc) => {
          for (let k = 0; k < 3; k++) {
            const s = k % 2 ? 1 : -1;
            const y = Y(top + 0.4 + k * 2.0);
            b.wall(lc + s * 2, y, lc - s * 0.6, y + 0.8);
          }
        },
      ];
      shuffle(rng, lanes).forEach((lane, i) => lane(2 + i * 4));
    },
  },
  {
    id: 'grinder',
    name: 'WINDMILL GRINDER',
    h: 28.5,
    build(b, y0, rng) {
      // Windmill Alley and The Grinder merged into one long mill. Windmill tips stay at least ~0.9 m from
      // each other and from the walls, so nothing gets pinched between two spinners.
      const mill = (x: number, y: number, arm: number, speed: [number, number], bars: number, dir = sign(rng)) =>
        b.windmill(x, y0 + y, arm, dir * range(rng, speed[0], speed[1]), bars, rng() * 6);

      // A staggered field of small windmills (4, 3, 4), neighbours spinning opposite ways.
      for (const [y, xs] of [[2.5, [2.6, 6.2, 9.8, 13.4]], [5.3, [4.4, 8, 11.6]], [8.1, [2.6, 6.2, 9.8, 13.4]]] as const) {
        const dir = sign(rng);
        xs.forEach((x, i) => mill(x, y, 1.0, [2.0, 3.0], chance(rng, 0.5) ? 2 : 3, i % 2 ? -dir : dir));
      }
      b.ledge('left', y0 + 4.6);
      b.ledge('right', y0 + 4.6);
      b.ledge('left', y0 + 9.6);
      b.ledge('right', y0 + 9.6);

      // One big windmill in the middle, flanked by two medium ones.
      mill(3.0, 12.8, 1.2, [1.6, 2.4], 3);
      mill(8, 12.8, 2.4, [1.2, 2.0], chance(rng, 0.5) ? 2 : 3);
      mill(13.0, 12.8, 1.2, [1.6, 2.4], 3);
      b.ledge('left', y0 + 14.0);
      b.ledge('right', y0 + 14.0);

      // More alternating rows of small windmills (4, 3, 4, then 3 smaller choppers). 
      for (const [y, xs, arm] of [[17.0, [2.6, 6.2, 9.8, 13.4], 1.0], [19.8, [4.4, 8, 11.6], 1.0], [22.6, [2.6, 6.2, 9.8, 13.4], 1.0], [25.4, [4.4, 8, 11.6], 0.9]] as const) {
        const dir = sign(rng);
        xs.forEach((x, i) => mill(x, y, arm, [2.0, 3.0], chance(rng, 0.5) ? 2 : 3, i % 2 ? -dir : dir));
      }
      b.ledge('left', y0 + 19.0);
      b.ledge('right', y0 + 19.0);
      b.ledge('left', y0 + 24.4);
      b.ledge('right', y0 + 24.4);
    },
  },
  {
    id: 'glass',
    name: 'GLASS FLOORS',
    h: 14.5,
    build(b, y0, rng) {
      // Every floor is one pane across the whole width: the race's front-runner breaks each one.
      glassFloors(b, y0, rng, Array(GLASS_ROWS).fill(1));
    },
  },
  {
    id: 'glasstiles',
    name: 'GLASS TILES',
    h: 14.5,
    build(b, y0, rng) {
      // Each floor is split into 1 to 4 tiles (never the same count twice in a row, so it never turns into
      // the Glass Floors), and each tile breaks on its own, so the first marble into each part of a floor pays.
      glassFloors(b, y0, rng, glassTiles(rng, GLASS_ROWS));
    },
  },
  {
    // A pinball table: a playfield of big, spaced-out pop bumpers, then the lower table of a real machine.
    // Inlane guides funnel everything into a pair of flippers over a narrow drain, two slingshots stand in
    // front of the flippers (off the walls, so marbles can roll down the inlane behind them), and an
    // outlane beside each wall lets a lucky marble skip the flippers altogether. (It used to be the
    // "Final Pinball" finale.)
    id: 'pinball',
    name: 'PINBALL',
    h: PINBALL_LOW + 5.5,
    build(b, y0, rng) {
      // Rows of 2, 1, 2, 3, 2 bumpers, all the same size. Gaps in a row stay wide (3.8 m clear here): with
      // 1 m gaps nearly every marble clipped a bumper and got kicked back up, so a row became a ceiling.
      const pops: [number, number][] = [
        [3.9, 2.5], [12.1, 2.5],
        [8, 4.2],
        [5.5, 7.2], [10.5, 7.2],
        [3.0, 9.8], [8, 9.8], [13.0, 9.8],
        [5.5, 12.0], [10.5, 12.0],
      ];
      for (const [bx, by] of pops) b.bumper(bx, y0 + by, 0.6);
      // Plain bars on the walls turn wall-huggers back into the playfield, so few marbles fall straight
      // into an outlane.
      for (const [y, len] of [[4.8, 1.6], [10.6, 1.4]]) {
        b.wall(0, y0 + y, len, y0 + y + 1.0);
        b.wall(W, y0 + y, W - len, y0 + y + 1.0);
      }

      // The lower table, from y0 + PINBALL_LOW. On each side: an inlane guide slopes from 1 m off the wall
      // down to the flipper's hinge (the gap between it and the wall is the outlane, ~0.85 m clear, and
      // nothing below it), a slingshot stands in front of the flipper with its kicking face toward the
      // middle and ~0.85 m of inlane clear behind it, and the flipper sits at the bottom. The drain between
      // the flipper tips is ~2.2 m clear: much narrower than the old funnel's, but still too wide for two
      // marbles to arch across.
      const L = y0 + PINBALL_LOW;
      const phase = rng() * 2;
      for (const s of [1, -1]) {
        const X = (x: number) => (s > 0 ? x : W - x);
        b.wall(X(1.0), L + 0.6, X(5.2), L + 3.55);
        b.sling(X(2.4), L, X(4.8), L + 1.8, 8);
        b.flipper(X(5.35), L + 3.6, 1.5, s, range(rng, 1.0, 1.6), phase + (s > 0 ? 0 : 0.5));
      }
    },
  },
  {
    // A foosball table's 8 rods, top to bottom as on a real table: black goalie (3), black defence (2), yellow
    // attack (3), black midfield (5), yellow midfield (5), black attack (3), yellow defence (2), yellow goalie (3).
    // Each rod slides its players as one, and its end players come right up to the walls, so the lane by a wall
    // is only open while the rod is away: no ledges, a marble can get lucky and slip down the side. Every rod
    // kicks on its own clock, swinging its players' feet up and batting marbles sideways. Below the last rod,
    // a funnel squeezes everyone into the goal: a mouth a third of the course wide, into the net.
    id: 'foosball',
    name: 'FOOSBALL',
    h: FOOS_GOAL_TOP + FOOS_GOAL_DROP + FOOS_NET + 0.4,
    build(b, y0, rng) {
      FOOS_RODS.forEach(([count, team], r) => {
        b.foosRod(y0 + 2.0 + r * FOOS_PITCH, count, FOOS_SPACING[count], team, range(rng, 1.8, 2.6), range(rng, 0.9, 1.4), rng() * 3, rng);
      });
      const top = y0 + FOOS_GOAL_TOP;
      const mouth = top + FOOS_GOAL_DROP;
      const x1 = (W - FOOS_MOUTH) / 2;
      const x2 = (W + FOOS_MOUTH) / 2;
      b.wall(0, top, x1, mouth);
      b.wall(W, top, x2, mouth);
      b.peg(x1, mouth, 0.22);
      b.peg(x2, mouth, 0.22);
      b.net(x1, x2, mouth, FOOS_NET);
    },
  },
  {
    // One big black hole (a Vortex) whose well fills the whole width. Its lower half is a round bowl
    // centred on the hole, so the floor follows the field and nothing can roll out of reach; the top is
    // open, so a marble can fall straight in. Marbles get dragged around the hole, roll round the bowl, lift
    // off it, collide and spiral into the horizon, then drop out of the bottom and carry on.
    id: 'blackhole',
    name: 'BLACK HOLE',
    h: BH_CY + BH_BOWL + 3.1,
    build(b, y0, rng) {
      const cy = y0 + BH_CY;
      const n = 16;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI;
        const a1 = ((i + 1) / n) * Math.PI;
        b.wall(W / 2 + BH_BOWL * Math.cos(a0), cy + BH_BOWL * Math.sin(a0), W / 2 + BH_BOWL * Math.cos(a1), cy + BH_BOWL * Math.sin(a1));
      }
      // The bowl's rims stop short of the walls: close the gaps with ramps from the walls.
      b.wall(0, cy - 1.2, W / 2 - BH_BOWL, cy);
      b.wall(W, cy - 1.2, W / 2 + BH_BOWL, cy);
      b.vortex(W / 2, cy, BH_R, BH_BOWL + 0.3, 0, sign(rng), W / 2, cy + BH_BOWL + 1.6, { rings: BH_RINGS, blend: BH_BLEND, grow: BH_GROW });
    },
  },
];

/** Height of the funnel inserted after each segment when funnels are on. */
const FUNNEL_H = 5.5;
const THROAT = 1.8;
/** Valve guard: how far its doors swing open (radians below level), and the share of each cycle they stay open. */
const VALVE_SWING = 1.65;
const VALVE_OPEN = [0.62, 0.72];

/**
 * Obstacles that guard a funnel's throat. Every one keeps the throat moving (no static plug),
 * so a pile-up always clears, but each one bunches the pack and reshuffles who gets out first.
 */
const FUNNEL_GUARDS: { id: string; name: string; build(b: Builder, ty: number, rng: Rng): void }[] = [
  {
    // Paddle wheel just under the throat flings each marble left or right. It must fit inside FUNNEL_H.
    // (Above the throat, its tips batted marbles back up the funnel slope forever.)
    id: 'paddles',
    name: 'PADDLE WHEEL',
    build(b, ty, rng) {
      b.windmill(8, ty + 1.05, 0.95, sign(rng) * range(rng, 1.8, 2.6), 2, rng() * 6, 0.14);
    },
  },
  {
    // Two half-doors close the throat and swing open together: the pile waits, then bursts out. Open, they
    // swing a little past straight down (VALVE_SWING), so their tips clear the throat's full width: at the
    // trapdoors' usual 1.35 rad they left ~1.1 m between them, and two marbles side by side (1.28 m) jammed
    // there until the doors closed and knocked them back up the funnel.
    id: 'valve',
    name: 'VALVE',
    build(b, ty, rng) {
      const period = range(rng, 2.2, 3.0);
      const open = period * range(rng, VALVE_OPEN[0], VALVE_OPEN[1]);
      const ph = rng() * 6;
      b.trapdoor(8 - THROAT / 2, ty, THROAT / 2, 1, period, open, ph, VALVE_SWING);
      b.trapdoor(8 + THROAT / 2, ty, THROAT / 2, -1, period, open, ph, VALVE_SWING);
    },
  },
  {
    // Pulsing updraft through the throat blows marbles back into the pile.
    id: 'blower',
    name: 'BLOWER',
    build(b, ty, rng) {
      b.fan(8 - THROAT / 2 - 0.3, ty - 0.6, THROAT + 0.6, 2.2, 0, -1, range(rng, 26, 32), range(rng, 2.2, 3.2), 0.45, rng() * 4);
    },
  },
  {
    // A shelf shuttles back and forth under the throat, catching marbles and tipping them off either side.
    id: 'shuttle',
    name: 'SHUTTLE',
    build(b, ty, rng) {
      b.slider(8, ty + 0.75, 0.8, 1.7, range(rng, 1.4, 2.0), rng() * 6, 0.25, range(rng, 1.2, 2.0));
    },
  },
  {
    // A bumper sits right in the mouth and splits the stream.
    id: 'bumper',
    name: 'BUMPER',
    build(b, ty, rng) {
      b.bumper(8 + range(rng, -0.15, 0.15), ty - 1.0, 0.42);
      b.peg(8 - THROAT / 2 - 0.1, ty + 1.0);
      b.peg(8 + THROAT / 2 + 0.1, ty + 1.0);
    },
  },
  {
    // A glass pane seals the throat. The first marble to land on it is launched back up the funnel
    // (apex v²/2g ≈ 1.8 m, inside the 3 m funnel) and the pane breaks, so the leader pays and the pile
    // behind pours through. It breaks on first touch, so it is never a lasting plug.
    id: 'glass',
    name: 'GLASS PLUG',
    build(b, ty, rng) {
      b.breakaway(8 - THROAT / 2, 8 + THROAT / 2, ty, range(rng, 7.5, 8.5));
    },
  },
  {
    // Just the funnel, nothing in the throat: the squeeze alone bunches the pack and jostles the order.
    id: 'plain',
    name: 'PLAIN',
    build() { },
  },
];

/** Two walls that squeeze the whole course into a narrow throat at the centre, guarded by an obstacle. */
function funnel(b: Builder, y: number, guard: (typeof FUNNEL_GUARDS)[number], rng: Rng) {
  const ty = y + 3.3;
  b.wall(0, y + 0.3, 8 - THROAT / 2, ty);
  b.wall(W, y + 0.3, 8 + THROAT / 2, ty);
  guard.build(b, ty, rng);
}

function pickSegments(rng: Rng, count: number): Template[] {
  const out: Template[] = [];
  let pool: Template[] = [];
  while (out.length < count) {
    if (pool.length === 0) {
      pool = shuffle(rng, TEMPLATES.filter((t) => !t.draft));
      if (out.length && pool[0] === out[out.length - 1]) pool.push(pool.shift()!);
    }
    out.push(pool.shift()!);
  }
  return out;
}

/** Race-length presets, in random segments (the finish comes on top). The setup screen allows any count in between. */
export const SEGMENT_COUNTS = { short: 5, medium: 10, epic: 15 } as const;
export const MIN_SEGMENTS = 1;
export const MAX_SEGMENTS = SEGMENT_COUNTS.epic;

// ---- finishes -----------------------------------------------------------------

/** The very end of every course, under the last segment: the finish line and the basin. */
interface Finish {
  id: string;
  name: string;
  /** Height, including the basin. */
  h: number;
  /** Finish line, measured down from the top of the finish. */
  finish: number;
  /** Not tested yet: shows in the section guide, but random courses never pick it. */
  draft?: boolean;
  build(b: Builder, y0: number, rng: Rng): void;
}

/** Half-width of the drain hole at the bottom of the half-pipe (1.4 m clear: two marbles can't arch across it). */
const HALFPIPE_HOLE = 0.85;
/** Free fall: depth of the finish line, the slow fall speed the air holds marbles to, and a boost pad's kick (m/s). */
const FREEFALL_FINISH = 40;
const FREEFALL_SPEED = 2.5;
const FREEFALL_BOOST = 10;
/** Sideways damping per step: a half-life of about 6 s, so marbles keep the angle they came in at. */
const FREEFALL_DRAG = 0.001;
/** Rising boost pads: how fast they stream up (m/s, the slow end of the speed lines) and the seconds between spawns. */
const FREEFALL_RISE = 20;
const FREEFALL_GAP: [number, number] = [0.3, 0.7];
/** A new pad stays out of the columns of pads spawned in the last this many seconds (~24 m above it). */
const FREEFALL_CLEAR = 1.2;
/** Widths of a rising boost pad (m), picked at random per pad: single or double (it was 1.4, then all 2.8). */
const FREEFALL_PAD_WS = [1.4, 2.8];

export const FINISHES: Finish[] = [
  {
    // Funnel walls from both side walls down to the throat (x 6.6-9.4) 4.6 m lower, then the finish line
    // and a V-shaped basin. Only the middle stretch of each funnel wall is a slingshot; the plain bit by the
    // throat lets marbles settle out instead of ping-ponging forever.
    id: 'funnel',
    name: 'SLINGSHOT FUNNEL',
    h: 9.5,
    finish: 5.5,
    build(b, y, rng) {
      const fy = (x: number) => y + (x / 6.6) * 4.6;
      for (const s of [1, -1]) {
        const X = (x: number) => (s > 0 ? x : W - x);
        b.wall(X(0), fy(0), X(1.2), fy(1.2));
        b.sling(X(1.2), fy(1.2), X(4.6), fy(4.6), 6);
        // A short flipper at the bottom of each wall, like a pinball table's: marbles rolling down the wall
        // land on it and can get flicked back up. The drain between the two tips stays ~3.5 m wide, so
        // marbles always get through.
        b.wall(X(4.6), fy(4.6), X(5.2), fy(5.2));
        b.flipper(X(5.35), fy(5.35), 1.5, s, range(rng, 1.6, 2.4), rng() * 0.25);
      }
      b.wall(0, y + 8, 8, y + 9.7);
      b.wall(W, y + 8, 8, y + 9.7);
    },
  },
  {
    // A half-pipe with a drain hole in the middle. A roof (Λ) over the middle sends everyone out to the
    // walls, so every marble drops in from the sides and swings down the bowl toward the hole. A fast
    // marble jumps the hole and swings up the far side, while a slower one behind drops straight in: speed
    // can cost the leader the race. The bowl slopes toward the hole everywhere, so nothing can sit still.
    id: 'halfpipe',
    name: 'HALF-PIPE',
    h: 11.2,
    finish: 7.2,
    build(b, y) {
      // The roof starts 1.6 m down, clear of whatever the last segment ends in, and sits above the bowl's rims, so
      // a marble swinging in the bowl (which can't climb above the rim it came in at) never reaches it.
      b.wall(8, y + 1.6, 3.2, y + 3.4);
      b.wall(8, y + 1.6, W - 3.2, y + 3.4);
      // The bowl: a parabola from the hole's lips (y + 6.4) up to the walls (y + 4.0).
      const lipY = y + 6.4;
      const depth = 2.4;
      const n = 8;
      const span = W / 2 - HALFPIPE_HOLE;
      for (const s of [1, -1]) {
        const X = (x: number) => (s > 0 ? x : W - x);
        let px = 0;
        let py = lipY - depth;
        for (let i = 1; i <= n; i++) {
          const u = 1 - i / n; // 1 at the wall, 0 at the lip
          const x = span - u * span;
          const yy = lipY - depth * u * u;
          b.wall(X(px), py, X(x), yy);
          px = x;
          py = yy;
        }
      }
      // Basin under the bowl.
      b.wall(0, y + 9.4, 8, y + 11.1);
      b.wall(W, y + 9.4, 8, y + 11.1);
    },
  },
  {
    // A long, slow free fall. Air drag (a SkyZone) holds every marble to a gentle fall speed while speed
    // lines stream past behind them, so it feels fast without being a long drop. Downward boost pads are
    // scattered through it: a marble that falls through one shoots ahead, then eases back to the slow
    // speed, so a lucky line can pass marbles that were already falling. No funnel: marbles fall straight
    // from wherever they came out of the last segment to the finish line.
    id: 'freefall',
    name: 'FREE FALL',
    h: FREEFALL_FINISH + 4.0,
    finish: FREEFALL_FINISH,
    build(b, y, rng) {
      b.sky(0, y + 0.2, W, FREEFALL_FINISH - 0.2, FREEFALL_SPEED, 0.012, 1.5, rng() * 6.3, FREEFALL_DRAG);
      // Boost pads stream up from 1 m above the line to 2 m below the top, appearing at random x
      // along the bottom: about 2 boosts per marble.
      b.risers(0, y + 2, W, FREEFALL_FINISH - 3, FREEFALL_PAD_WS, 0.6, FREEFALL_RISE, FREEFALL_BOOST, FREEFALL_GAP, FREEFALL_CLEAR, Math.floor(rng() * 2 ** 32));
      // Basin.
      b.wall(0, y + FREEFALL_FINISH + 2.0, 8, y + FREEFALL_FINISH + 3.7);
      b.wall(W, y + FREEFALL_FINISH + 2.0, 8, y + FREEFALL_FINISH + 3.7);
    },
  },
];

// ---- section previews ---------------------------------------------------------

export type SectionKind = 'segment' | 'finish' | 'funnel';

/** Everything the setup screen's section guide can preview, in the order it lists them. */
export const SECTIONS: { kind: SectionKind; id: string; name: string }[] = [
  ...TEMPLATES.map(({ id, name }) => ({ kind: 'segment' as const, id, name })),
  ...FINISHES.map(({ id, name }) => ({ kind: 'finish' as const, id, name })),
  ...FUNNEL_GUARDS.map(({ id, name }) => ({ kind: 'funnel' as const, id, name })),
];

/**
 * Builds one section on its own, for the setup screen's preview: no gate, mixer or marbles. Only
 * finishes get a finish line (`finishY` stays Infinity otherwise).
 */
export function buildSection(sim: Sim, b: Builder, rng: Rng, kind: SectionKind, id: string) {
  sim.topY = sim.mixerTop = sim.gateY = -0.5;
  sim.finishY = Infinity;
  let name: string;
  let h: number;
  if (kind === 'funnel') {
    const guard = FUNNEL_GUARDS.find((g) => g.id === id) ?? FUNNEL_GUARDS[0];
    funnel(b, 0, guard, rng);
    name = `FUNNEL · ${guard.name}`;
    h = FUNNEL_H;
  } else if (kind === 'finish') {
    const finish = FINISHES.find((f) => f.id === id) ?? FINISHES[0];
    finish.build(b, 0, rng);
    sim.finishY = finish.finish;
    name = `FINISH · ${finish.name}`;
    h = finish.h;
  } else {
    const tpl = TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
    tpl.build(b, 0, rng);
    ({ name, h } = tpl);
  }
  sim.segments.push({ name, y0: 0, h });
  sim.bottomY = h;
  b.wall(-0.15, sim.topY, -0.15, h, 0.15);
  b.wall(W + 0.15, sim.topY, W + 0.15, h, 0.15);
}

export interface CourseOptions {
  /** Random segments to pick (ignored when `segments` is given). */
  count: number;
  funnels?: boolean;
  /** Finish id; omitted or unknown picks one from the seed. */
  finish?: string;
  /** A custom course: segment template ids in order (repeats allowed). Replaces the random pick. */
  segments?: string[];
  /** The setup screen's course preview: no start gate or mixer, marbles drop in at the top of the first segment. */
  preview?: boolean;
}

/** Turns custom segment ids into templates, dropping unknown ids and clamping to MAX_SEGMENTS. */
function customSegments(ids: string[]): Template[] {
  return ids.flatMap((id) => TEMPLATES.filter((t) => t.id === id)).slice(0, MAX_SEGMENTS);
}

/** Lays out start gate → random (or custom) segments → finish (finish line and basin). */
export function buildCourse(sim: Sim, b: Builder, rng: Rng, opts: CourseOptions) {
  const { funnels = false, finish: finishId, preview = false } = opts;
  let y = 7;
  const custom = opts.segments?.length ? customSegments(opts.segments) : [];
  let top = -14;
  if (preview) {
    // No gate or mixer: the course starts at the first segment.
    top = sim.gateY = sim.mixerTop = y - 0.5;
  } else {
    // Start gate the marbles settle on during the countdown.
    sim.gateY = 4;
    sim.gate = b.wall(0, sim.gateY, W, sim.gateY, 0.15, 'gate');
    pegRows(b, rng, 5.6, 1, 1, 1.6);
  }
  sim.topY = top;

  // A custom course draws nothing here, so a random course's rng draws (and each seed's layout) are unchanged.
  const picked = custom.length ? custom : pickSegments(rng, opts.count);
  // Only draw from the rng when funnels are on, so existing seeds still build the same course without them.
  let guards: typeof FUNNEL_GUARDS = [];
  picked.forEach((tpl, i) => {
    const seg: Segment = { name: tpl.name, y0: y, h: tpl.h };
    sim.segments.push(seg);
    tpl.build(b, y, rng);
    y += tpl.h;
    // The finish already funnels, so the last segment drops straight into it.
    if (funnels && i < picked.length - 1) {
      if (guards.length === 0) guards = shuffle(rng, FUNNEL_GUARDS.slice());
      const guard = guards.shift()!;
      funnel(b, y, guard, rng);
      seg.funnel = guard.id;
      seg.h += FUNNEL_H;
      y += FUNNEL_H;
    }
  });

  // The finish, picked from the seed unless the player chose one. The rng value is drawn either way, so a
  // seed builds the same course whichever finish it gets.
  const roll = rng();
  const ready = FINISHES.filter((f) => !f.draft);
  const finish = FINISHES.find((f) => f.id === finishId) ?? ready[Math.floor(roll * ready.length)];
  sim.segments.push({ name: `FINISH · ${finish.name}`, y0: y, h: finish.h });
  finish.build(b, y, rng);
  sim.finishY = y + finish.finish;
  y += finish.h;
  sim.bottomY = y;

  b.wall(-0.15, top, -0.15, y, 0.15);
  b.wall(W + 0.15, top, W + 0.15, y, 0.15);

  // Built last so the rng draws above (and so each seed's course layout) are unchanged.
  if (!preview) mixer(sim, b, rng);
}

/**
 * The start box: a lid over the gate and air jets in the floor that pulse out of sync during the
 * countdown, so the marbles jumble like a lottery machine instead of sitting still. The jets cut out
 * as the gate drops, and every marble falls from wherever the shuffle left it.
 */
function mixer(sim: Sim, b: Builder, rng: Rng) {
  sim.mixerTop = sim.gateY - 5;
  b.wall(0, sim.mixerTop, W, sim.mixerTop, 0.15);
  const jets = 4;
  const w = W / jets;
  // The outer jets lean toward the middle and sweep only on the inward side, so they push marbles off
  // the walls instead of pinning them there. Tilt + amp must stay under 45° (0.785 rad) or the
  // renderer stops drawing it as an upward jet.
  const OUTER_TILT = 0.4;
  const OUTER_AMP = 0.3;
  for (let i = 0; i < jets; i++) {
    // Each jet sweeps side to side like a sprinkler, so the pile churns sideways instead of just bouncing.
    const inward = i === 0 ? 1 : i === jets - 1 ? -1 : 0;
    const dx = inward * Math.tan(OUTER_TILT);
    const jet = b.fan(i * w, sim.gateY - 2.4, w, 2.15, dx, -1, range(rng, 46, 56), range(rng, 0.6, 1.0), 0.5, rng() * 2);
    jet.until = COUNTDOWN;
    jet.sweep = { amp: inward ? OUTER_AMP : 0.7, w: range(rng, 2.5, 3.5), phase: rng() * 6.3 };
  }
}
