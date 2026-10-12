import { segmentCount, type SimOptions } from '../sim/sim';

type EventData = Record<string, string | number | boolean>;

/**
 * Sends a custom event to Umami (the script tag in index.html). It reports only from the live
 * domain (`data-domains`), and does nothing if the script is blocked or hasn't loaded yet.
 * Never pass names here: only counts and settings.
 */
export function track(event: string, data?: EventData) {
  try {
    window.umami?.track(event, data);
  } catch {
    // Analytics must never break the game.
  }
}

/** Where a race was started from. */
export type RaceSource = 'drop' | 'again' | 'remove' | 'replay' | 'history';

/** A race's settings as event properties: no names, just how many. */
export function raceProps(opts: SimOptions, source: RaceSource): EventData {
  const custom = !!opts.segments;
  return {
    source,
    course: custom ? 'custom' : 'random',
    segments: custom ? opts.segments!.length : segmentCount(opts.length),
    ...(custom && { sections: opts.segments!.join(',') }),
    mode: opts.mode,
    finish: opts.finish ?? 'random',
    funnels: !!opts.funnels,
    names: opts.names.length,
  };
}
