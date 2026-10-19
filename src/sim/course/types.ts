import type { Builder } from '../builder';
import type { Rng } from '../rng';

/** A segment: one stacked section of the course, `h` tall, built from its top at `y0`. */
export interface Template {
  id: string;
  name: string;
  h: number;
  /** Not tested yet: shows in the section guide and the course builder, but random courses never pick it. */
  draft?: boolean;
  build(b: Builder, y0: number, rng: Rng): void;
}

/** The very end of every course, under the last segment: the finish line and the basin. */
export interface Finish {
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
