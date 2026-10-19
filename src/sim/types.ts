import type { Collider } from '@dimforge/rapier2d-compat';

/** Capsules are aligned with the collider's local Y axis (Rapier convention). */
export type Shape =
  | { kind: 'capsule'; hh: number; r: number }
  | { kind: 'circle'; r: number }
  /** A whole foosball player, drawn around its pivot on the rod. */
  | { kind: 'foosman' };

export type VisualStyle =
  | 'wall'
  | 'peg'
  | 'bumper'
  | 'spinner'
  | 'slider'
  | 'trapdoor'
  | 'flipper'
  | 'seesaw'
  | 'gate'
  | 'sling'
  | 'tramp'
  | 'breakaway'
  | 'hinge'
  | 'rod'
  | 'toggle'
  | 'foosBlack'
  | 'foosYellow';

export interface Visual {
  id: number;
  collider: Collider;
  shape: Shape;
  style: VisualStyle;
  dynamic: boolean;
}

export interface Segment {
  name: string;
  y0: number;
  h: number;
  /** Guard type of the funnel at the bottom of this segment, if any. */
  funnel?: string;
}

export interface Obstacle {
  update(t: number): void;
}

export type HitTarget = 'peg' | 'wall' | 'marble' | 'spinner';

export type SimEvent =
  | { type: 'count'; n: number }
  | { type: 'gate' }
  | { type: 'hit'; marble: number; speed: number; x: number; y: number; target: HitTarget }
  | { type: 'bumper'; marble: number; visual: number; x: number; y: number }
  | { type: 'sling'; marble: number; visual: number; x: number; y: number }
  | { type: 'tramp'; marble: number; visual: number; x: number; y: number }
  /** A breakaway platform was touched: it launched the marble and is gone. `x1`-`x2` is its span at height `y`. */
  | { type: 'shatter'; marble: number; visual: number; x: number; y: number; x1: number; x2: number }
  | { type: 'warp'; marble: number; fromX: number; fromY: number; x: number; y: number }
  | { type: 'portal'; marble: number; forward: boolean; hole?: boolean; fromX: number; fromY: number; x: number; y: number }
  | { type: 'lift'; marble: number; x: number; y: number }
  | { type: 'boost'; marble: number; x: number; y: number }
  /** A BlastZone explosion went off at (x, y), reaching out to `r`. */
  | { type: 'blast'; x: number; y: number; r: number }
  /** A blast's shockwave threw a marble in the direction (dx, dy). */
  | { type: 'blasted'; marble: number; x: number; y: number; dx: number; dy: number }
  | { type: 'flip'; x: number; y: number }
  | { type: 'trapdoor'; x: number; y: number }
  | { type: 'stamp'; x: number; y: number }
  | { type: 'stamped'; marble: number; forward: boolean; x: number; y: number }
  | { type: 'klaxon'; x: number; y: number }
  | { type: 'finish'; marble: number; place: number }
  | { type: 'lead'; marble: number; prev: number }
  | { type: 'comeback'; marble: number }
  | { type: 'segment'; marble: number; name: string }
  | { type: 'winner'; marble: number };
