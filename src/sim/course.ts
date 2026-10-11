import type { Builder } from './builder';
import { COUNTDOWN, W } from './constants';
import { chance, range, sign, shuffle, type Rng } from './rng';
import type { Sim } from './sim';
import type { Segment } from './types';

interface Template {
  id: string;
  name: string;
  h: number;
  build(b: Builder, y0: number, rng: Rng): void;
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
      pegRows(b, rng, y0 + 1.2, 2, 1.6, 2.0);
      // Three floors of paired doors, each split finer than the last (4, 6, then 8 doors), so lower
      // floors drop marbles in more, smaller batches. An open door's tip hangs ~L below its hinge, so
      // each floor sits far enough under the one above that a swinging door never pinches a resting marble.
      const floors = [
        { dy: 5.5, cells: 2, period: [3.5, 6] },
        { dy: 10.7, cells: 3, period: [3, 5] },
        { dy: 14.5, cells: 4, period: [2.5, 4.5] },
      ];
      for (const { dy, cells, period } of floors) {
        const fy = y0 + dy;
        const cw = W / cells;
        for (let c = 0; c < cells; c++) {
          const x0 = c * cw;
          b.trapdoor(x0, fy, cw / 2, 1, range(rng, period[0], period[1]), range(rng, 1.1, 1.6), rng() * 6);
          b.trapdoor(x0 + cw, fy, cw / 2, -1, range(rng, period[0], period[1]), range(rng, 1.1, 1.6), rng() * 6);
          // A hump on each shared hinge, so nothing can sit on a pivot that never drops.
          if (c > 0) b.peg(x0, fy, 0.2);
        }
      }
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
          b.slider(x, y0 + ry, 0.9, 0.8, range(rng, 2.0, 3.0), rng() * 6.3, 0.18, range(rng, 2, 3));
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
          const wobble = byWall ? undefined : { amp: 0.3, w: range(rng, 0.5, 1.1), phase: rng() * 6.3 };
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
          b.pendulum(x, y - rod, rod, 0.55, range(rng, 0.3, 0.42), range(rng, 1.8, 2.6), rng() * 6.3, range(rng, 6.5, 7.5));
        }
        const [len, drop] = r % 2 ? [2.6, 0.8] : [1.0, 0.6];
        b.ledge('left', y - drop / 2, len, drop);
        b.ledge('right', y - drop / 2, len, drop);
      }
    },
  },
  {
    id: 'portals',
    name: 'PORTAL MAZE',
    h: 14,
    build(b, y0, rng) {
      // Two backward portals "defend" a peg-free row, each sweeping its own half left and right at a
      // steady speed. Get caught and you're sent back to the top of the maze.
      // The pegs use the same even grid as the Peg Garden, with one row left out for the portals.
      const top = y0 + 1.0;
      const lineY = top + 6 * 1.4;
      const speed = range(rng, 2.2, 2.8);
      // Caught marbles reappear above the top row, centred on a gap between its pegs (x = 3.1 + 1.4k).
      const exits = [0, 1].map(() => 3.1 + 1.4 * Math.floor(range(rng, 0, 8)));
      const halves = [[1.0, 7.6], [8.4, 15.0]];
      const firstPhase = rng();
      halves.forEach(([x0, x1], i) =>
        // Out of step with each other, so the gap between them keeps changing.
        b.portal(x0, lineY, 0.6, exits[i], y0 + 0.4, false, { x0, x1, speed, phase: (firstPhase + i * 0.5) % 1 }),
      );
      // An even number of rows, so every pair gets its wall deflectors (as in the Peg Garden).
      pegRows(b, rng, top, 10, 1.4, 1.4, { skip: (_x, y) => Math.abs(y - lineY) < 0.5 });
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
];

/** Height of the funnel inserted after each segment when funnels are on. */
const FUNNEL_H = 5.5;
const THROAT = 1.8;

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
    // Two half-doors close the throat and swing open together: the pile waits, then bursts out.
    id: 'valve',
    name: 'VALVE',
    build(b, ty, rng) {
      const period = range(rng, 2.2, 3.0);
      const open = period * range(rng, 0.5, 0.6);
      const ph = rng() * 6;
      b.trapdoor(8 - THROAT / 2, ty, THROAT / 2, 1, period, open, ph);
      b.trapdoor(8 + THROAT / 2, ty, THROAT / 2, -1, period, open, ph);
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
      pool = shuffle(rng, TEMPLATES.slice());
      if (out.length && pool[0] === out[out.length - 1]) pool.push(pool.shift()!);
    }
    out.push(pool.shift()!);
  }
  return out;
}

/** Race-length presets, in random segments (the finale comes on top). The setup screen allows any count in between. */
export const SEGMENT_COUNTS = { short: 5, medium: 10, epic: 15 } as const;
export const MIN_SEGMENTS = 1;
export const MAX_SEGMENTS = SEGMENT_COUNTS.epic;

// ---- finales ------------------------------------------------------------------

/** The last section of every course: it ends in the finish line and the basin. */
interface Finale {
  id: string;
  name: string;
  /** Height, including the basin. */
  h: number;
  /** Finish line, measured down from the top of the finale. */
  finish: number;
  build(b: Builder, y0: number, rng: Rng): void;
}

/** From the top of `finishFunnel` to the finish line, and to the bottom of its basin. */
const FINISH_DROP = 5.5;
const FINISH_END = 9.5;

/**
 * The shared ending: funnel walls from both side walls at y down to the throat (x 6.6-9.4) 4.6 m lower,
 * then the finish line and a V-shaped basin. Only the middle stretch of each funnel wall is a slingshot;
 * the plain bit by the throat lets marbles settle out instead of ping-ponging forever.
 */
function finishFunnel(b: Builder, y: number, rng: Rng) {
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
}

const PINBALL_FUNNEL = 14;
/** Extra room under Mayhem's top peg rows for its row of pendulums. */
const MAYHEM_TOP = 1.6;
/** Extra room for Mayhem's two glass-tile floors (everything from its three funnels down sits this much lower). */
const MAYHEM_GLASS = 6.2;
const MAYHEM_FUNNEL = 37.6 + MAYHEM_TOP + MAYHEM_GLASS;
/** Width of each of Mayhem's three funnel throats. */
const MAYHEM_THROAT = 2.0;

export const FINALES: Finale[] = [
  {
    // A pinball table: a spaced-out diamond of pop bumpers, slingshots on both side walls, then the
    // slingshot funnel, so the last few metres keep flinging the leaders around.
    id: 'pinball',
    name: 'FINAL PINBALL',
    h: PINBALL_FUNNEL + FINISH_END,
    finish: PINBALL_FUNNEL + FINISH_DROP,
    build(b, y0, rng) {
      // The bumper x's are picked so every x between the side slingshots meets one (|x - bx| < r + MARBLE_R):
      // no straight drops into the throat. Below the diamond sit two evenly spaced rows, 4 then 5, the 5
      // sitting in the gaps of the 4 (the middle one right over the throat); the 4 leave the sides open for
      // the wall bars. Gaps in a row stay at least 1.5 m: with 1 m gaps nearly every marble clipped a bumper
      // and got kicked back up, so a row became a ceiling (and a bottom row down by the funnel trapped
      // marbles: ~1.4 rescues/race).
      const pops: [number, number, number][] = [
        [3.9, 2.5, 0.6], [12.1, 2.5, 0.6],
        [8, 4.2, 0.6],
        [5.5, 7.2, 0.6], [10.5, 7.2, 0.6],
        [4.4, 9.2, 0.45], [6.8, 9.2, 0.45], [9.2, 9.2, 0.45], [11.6, 9.2, 0.45],
        [2.2, 13.0, 0.55], [5.1, 13.0, 0.55], [8.0, 13.0, 0.55], [10.9, 13.0, 0.55], [13.8, 13.0, 0.55],
      ];
      for (const [bx, by, r] of pops) b.bumper(bx, y0 + by, r);
      b.sling(0, y0 + 3.8, 2.5, y0 + 6.8, 8);
      b.sling(W, y0 + 3.8, W - 2.5, y0 + 6.8, 8);
      // Between the two rows: a short bar on each wall feeding a short, quick flipper, so nothing falls
      // straight down a side and wall-huggers get flicked back into the bumpers. The flippers swing at least
      // ~1.1 m clear of every bumper, so nothing gets pinched. (Four slingshots in the middle juggled marbles
      // against the bumper row above: ~1.3 rescues/race, so they were removed.)
      const phase = rng() * 2;
      for (const s of [1, -1]) {
        const X = (x: number) => (s > 0 ? x : W - x);
        b.wall(X(0), y0 + 9.6, X(1.0), y0 + 10.5);
        b.flipper(X(1.15), y0 + 10.6, 1.2, s, range(rng, 0.9, 1.4), phase + (s > 0 ? 0 : 0.5));
      }
      finishFunnel(b, y0 + PINBALL_FUNNEL, rng);
    },
  },
  {
    // Most obstacle types in the game (all but trapdoors, stampers and the lift, which the user took out),
    // stacked into one long finale. Moving parts keep at least a marble's width (~1 m) apart, so nothing
    // gets pinched between two of them.
    id: 'mayhem',
    name: 'FINAL MAYHEM',
    h: MAYHEM_FUNNEL + FINISH_END,
    finish: MAYHEM_FUNNEL + FINISH_DROP,
    build(b, y0, rng) {
      // Pegs (with their wall deflectors), then a row of 4 pendulums with bumper balls (as in the Pendulum
      // Swing; the rods pass through the pegs). Their balls stay ~1 m clear of the pegs and of each other.
      pegRows(b, rng, y0 + 1.0, 2, 1.4, 1.4);
      for (const x of [3.2, 6.4, 9.6, 12.8]) {
        b.pendulum(x, y0 + 3.6, 1.2, 0.55, range(rng, 0.3, 0.42), range(rng, 1.8, 2.6), rng() * 6.3, range(rng, 6.5, 7.5));
      }
      // Everything below sits MAYHEM_TOP lower to make room for them.
      const Y = (y: number) => y0 + MAYHEM_TOP + y;

      // Two rows of slowly rocking trampolines (wall pads tilt away from the wall and rock less).
      for (const [y, xs] of [[5.2, [1.0, 4.6, 8, 11.4, 15.0]], [7.4, [2.8, 6.3, 9.7, 13.2]]] as const) {
        for (const x of xs) {
          const byWall = x < 2 || x > W - 2;
          const dir = x < 2 ? 1 : x > W - 2 ? -1 : sign(rng);
          const wobble = { amp: byWall ? 0.15 : 0.3, w: range(rng, 0.5, 1.1), phase: rng() * 6.3 };
          b.tramp(x, Y(y), 1.5, dir * range(rng, 0.2, 0.36), range(rng, 5.5, 6.5), wobble);
        }
      }

      // Windmills, and bumpers in their gaps.
      const dir = sign(rng);
      [3, 8, 13].forEach((x, i) => b.windmill(x, Y(10.6), 1.4, (i % 2 ? -dir : dir) * range(rng, 1.6, 2.4), 3, rng() * 6));
      b.bumper(5.5, Y(12.8), 0.5);
      b.bumper(10.5, Y(12.8), 0.5);

      // Sliding shelves with a bumper between them (~0.95 m clear of a shelf at full swing).
      b.bumper(3.2, Y(14.8), 0.5);
      b.bumper(8, Y(14.8), 0.5);
      b.bumper(12.7, Y(14.8), 0.5);

      // A see-saw in the middle, and a flipper on each side fed by a short ramp.
      b.seesaw(8, Y(19.4), 2.2, 0.3, range(rng, 2.0, 3.0), rng() * 6);
      b.wall(0, Y(18.2), 2.6, Y(19.4));
      b.wall(W, Y(18.2), W - 2.6, Y(19.4));
      b.flipper(2.8, Y(19.5), 1.7, 1, range(rng, 1.6, 2.6), rng() * 3);
      b.flipper(W - 2.8, Y(19.5), 1.7, -1, range(rng, 1.6, 2.6), rng() * 3);

      // 3 rows of pegs.
      pegRows(b, rng, Y(22), 3, 1.4, 1.4);

      // Two floors of glass tiles with a peg row between them (as in the Glass Tiles section), floors at
      // Y 27.2 and 30.8. Whoever reaches a tile first breaks it and is launched back up into the pegs.
      glassFloors(b, Y(25.0), rng, glassTiles(rng, 2));
      // Everything below the glass sits MAYHEM_GLASS lower.
      const G = (y: number) => Y(MAYHEM_GLASS + y);

      // Three funnels side by side ( \/\/\/ ): the pack splits between three throats.
      const cell = W / 3;
      for (let i = 0; i < 3; i++) {
        const cx = cell * (i + 0.5);
        b.wall(cell * i, G(26.0), cx - MAYHEM_THROAT / 2, G(27.6));
        b.wall(cell * (i + 1), G(26.0), cx + MAYHEM_THROAT / 2, G(27.6));
      }

      // Two portals sway together under the throats, one throat apart: at one end of the sweep they sit
      // under the left and middle throats, at the other under the middle and right ones. Get caught and
      // you're sent back up to just above the see-saw and flippers (below the shelves, so the setback is a
      // short one). Each exit slowly sweeps its own half, mirroring the other, so you never know where
      // you'll come out. A marble coming out anywhere on that line is at least 0.6 m clear of everything.
      const speed = range(rng, 2.2, 3.8);
      const phase = rng();
      const exitSpeed = range(rng, 1.2, 1.8);
      const exitPhase = rng();
      [[cell / 2, cell * 1.5, 1.5, 7.5], [cell * 1.5, cell * 2.5, 8.5, W - 1.5]].forEach(([x0, x1, e0, e1], i) =>
        b.portal(x0, G(29.0), 0.6, e0, Y(17.4), false, { x0, x1, speed, phase }, { x0: e0, x1: e1, speed: exitSpeed, phase: (exitPhase + i * 0.5) % 1 }),
      );

      // Five rows of pegs, then the finish.
      pegRows(b, rng, G(30.8), 5, 1.4, 1.4);

      // Finish line
      finishFunnel(b, y0 + MAYHEM_FUNNEL, rng);
    },
  },
];

// ---- section previews ---------------------------------------------------------

export type SectionKind = 'segment' | 'finale' | 'funnel';

/** Everything the setup screen's section guide can preview, in the order it lists them. */
export const SECTIONS: { kind: SectionKind; id: string; name: string }[] = [
  ...TEMPLATES.map(({ id, name }) => ({ kind: 'segment' as const, id, name })),
  ...FINALES.map(({ id, name }) => ({ kind: 'finale' as const, id, name })),
  ...FUNNEL_GUARDS.map(({ id, name }) => ({ kind: 'funnel' as const, id, name })),
];

/**
 * Builds one section on its own, for the setup screen's preview: no gate, mixer or marbles. Only
 * finales get a finish line (`finishY` stays Infinity otherwise).
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
  } else if (kind === 'finale') {
    const finale = FINALES.find((f) => f.id === id) ?? FINALES[0];
    finale.build(b, 0, rng);
    sim.finishY = finale.finish;
    ({ name, h } = finale);
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

/** Lays out start gate → random segments → finish funnel and basin. */
export function buildCourse(sim: Sim, b: Builder, rng: Rng, count: number, funnels = false, finaleId?: string) {
  const top = -14;
  sim.topY = top;

  // Start gate the marbles settle on during the countdown.
  sim.gateY = 4;
  sim.gate = b.wall(0, sim.gateY, W, sim.gateY, 0.15, 'gate');
  pegRows(b, rng, 5.6, 1, 1, 1.6);

  let y = 7;
  const picked = pickSegments(rng, count);
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

  // The finale: picked from the seed unless the player chose one. The rng is drawn either way, so a
  // seed builds the same course whichever finale it gets.
  const roll = rng();
  const finale = FINALES.find((f) => f.id === finaleId) ?? FINALES[Math.floor(roll * FINALES.length)];
  sim.segments.push({ name: finale.name, y0: y, h: finale.h });
  finale.build(b, y, rng);
  sim.finishY = y + finale.finish;
  y += finale.h;
  sim.bottomY = y;

  b.wall(-0.15, top, -0.15, y, 0.15);
  b.wall(W + 0.15, top, W + 0.15, y, 0.15);

  // Built last so the rng draws above (and so each seed's course layout) are unchanged.
  mixer(sim, b, rng);
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
