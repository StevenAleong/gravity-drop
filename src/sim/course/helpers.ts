import type { Builder } from '../builder';
import { W } from '../constants';
import { chance, range, type Rng } from '../rng';

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
export function pegRows(
  b: Builder,
  rng: Rng,
  yStart: number,
  rows: number,
  gap: number,
  spacing: number,
  opts: { bumperChance?: number; skip?: (x: number, y: number) => boolean; deflectFrom?: number } = {},
) {
  const deflectors: [number, number, number, number][] = [];
  const len = 1.5;
  const drop = 0.6;
  for (let r = opts.deflectFrom ?? 0; r + 1 < rows; r += 2) {
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
export function glassFloors(b: Builder, y0: number, rng: Rng, tiles: number[]) {
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

export const GLASS_ROWS = 4;

/** Tile counts for `rows` glass floors: 1 to 4 tiles each, never the same count twice in a row. */
export function glassTiles(rng: Rng, rows: number): number[] {
  const tiles: number[] = [];
  for (let r = 0; r < rows; r++) {
    const options = [1, 2, 3, 4].filter((n) => n !== tiles[r - 1]);
    tiles.push(options[Math.floor(rng() * options.length)]);
  }
  return tiles;
}
