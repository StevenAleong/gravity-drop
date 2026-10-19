import type { Builder } from '../builder';
import { W } from '../constants';
import { range, sign, type Rng } from '../rng';

/** Height of the funnel inserted after each segment when funnels are on. */
export const FUNNEL_H = 5.5;
const THROAT = 1.8;
/** Valve guard: how far its doors swing open (radians below level), and the share of each cycle they stay open. */
const VALVE_SWING = 1.65;
const VALVE_OPEN = [0.62, 0.72];

/**
 * Obstacles that guard a funnel's throat. Every one keeps the throat moving (no static plug),
 * so a pile-up always clears, but each one bunches the pack and reshuffles who gets out first.
 */
export const FUNNEL_GUARDS: { id: string; name: string; build(b: Builder, ty: number, rng: Rng): void }[] = [
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
export function funnel(b: Builder, y: number, guard: (typeof FUNNEL_GUARDS)[number], rng: Rng) {
  const ty = y + 3.3;
  b.wall(0, y + 0.3, 8 - THROAT / 2, ty);
  b.wall(W, y + 0.3, 8 + THROAT / 2, ty);
  guard.build(b, ty, rng);
}
