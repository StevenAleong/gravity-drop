import { W } from '../../constants';
import type { Finish } from '../types';

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

// A long, slow free fall. Air drag (a SkyZone) holds every marble to a gentle fall speed while speed
// lines stream past behind them, so it feels fast without being a long drop. Downward boost pads are
// scattered through it: a marble that falls through one shoots ahead, then eases back to the slow
// speed, so a lucky line can pass marbles that were already falling. No funnel: marbles fall straight
// from wherever they came out of the last segment to the finish line.
export const freefall: Finish = {
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
};
