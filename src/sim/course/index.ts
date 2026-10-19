import type { Builder } from '../builder';
import { W } from '../constants';
import { shuffle, type Rng } from '../rng';
import type { Sim } from '../sim';
import type { Segment } from '../types';
import { FINISHES } from './finishes';
import { funnel, FUNNEL_GUARDS, FUNNEL_H } from './funnels';
import { pegRows } from './helpers';
import { mixer } from './mixer';
import { TEMPLATES } from './segments';
import type { Template } from './types';

// The course generator. Each segment template lives in `segments/`, each finish in `finishes/`, the
// funnel guards in `funnels.ts` and the start box in `mixer.ts`.

export { FINISHES };

/** Race-length presets, in random segments (the finish comes on top). The setup screen allows any count in between. */
export const SEGMENT_COUNTS = { short: 5, medium: 10, epic: 15 } as const;
export const MIN_SEGMENTS = 1;
export const MAX_SEGMENTS = SEGMENT_COUNTS.epic;

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
