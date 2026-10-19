export const cycle = (t: number, period: number, phase: number) => {
  const u = (t + phase) % period;
  return (u < 0 ? u + period : u) / period;
};

/** Back and forth between x0 and x1 at a constant speed (m/s); `phase` (0-1) is where it starts in the cycle. */
export interface Patrol {
  x0: number;
  x1: number;
  speed: number;
  phase: number;
}

/** Triangle wave: steady speed one way, then straight back. */
export function sweep({ x0, x1, speed, phase }: Patrol, t: number) {
  const span = x1 - x0;
  const d = (((speed * t + phase * 2 * span) % (2 * span)) + 2 * span) % (2 * span);
  return x0 + (d < span ? d : 2 * span - d);
}
