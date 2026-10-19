import { pegRows } from '../helpers';
import type { Template } from '../types';

/** Peg Garden: the first row's depth, the rows, the gap between rows, and the first row with wall deflectors. */
const PEG_TOP = 2;
const PEG_ROWS = 12;
const PEG_GAP = 1.9;
const PEG_DEFLECT = 2;

export const pegs: Template = {
  id: 'pegs',
  name: 'PEG GARDEN',
  h: PEG_TOP + (PEG_ROWS - 1) * PEG_GAP + 1.6,
  build(b, y0, rng) {
    // A tall field of plain pegs: no bumpers or boosters, just a long, clicky fall.
    pegRows(b, rng, y0 + PEG_TOP, PEG_ROWS, PEG_GAP, 1.4, { deflectFrom: PEG_DEFLECT });
  },
};
