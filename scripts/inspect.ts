/**
 * Debug helper: runs one seeded race headlessly and prints where every marble ended up.
 *   npx tsx scripts/inspect.ts <seed> [length=short|medium|epic|1-15] [names=6] [seconds=120] [funnels=0] [segments]
 *   segments: a custom course, as comma-separated segment ids in order; `length` is then ignored.
 */
import RAPIER from '@dimforge/rapier2d-compat';
import { Sim, type RaceLength } from '../src/sim/sim';

const [seedArg, lengthArg, namesArg, secsArg, funnelsArg, segmentsArg] = process.argv.slice(2);
const seed = Number(seedArg ?? 1);
const n = Number(namesArg ?? 6);
const secs = Number(secsArg ?? 120);
await RAPIER.init();

const names = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? i : ''));
const sim = new Sim({ names, seed, length: !lengthArg ? 'short' : Number.isNaN(Number(lengthArg)) ? (lengthArg as RaceLength) : Number(lengthArg), mode: 'first', funnels: funnelsArg === '1', segments: segmentsArg?.split(',') });
console.log(`seed ${seed}:`, sim.segments.map((s) => `${s.name}@${s.y0.toFixed(0)}`).join(' | '), `finish ${sim.finishY}`);
const counts: Record<string, number> = {};
while (!sim.winner && sim.raceTime < secs) {
  sim.step();
  for (const e of sim.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
  sim.events.length = 0;
}
console.log(sim.winner ? `winner ${sim.winner.name} at ${sim.raceTime.toFixed(1)}s` : `no winner after ${secs}s`);
console.log('events', counts);
for (const m of sim.ranking) {
  const seg = sim.segments[sim.segmentAt(m.y)];
  const v = m.body.linvel();
  console.log(`  ${m.name.padEnd(4)} (${m.x.toFixed(2)}, ${m.y.toFixed(2)}) ${seg?.name ?? '-'} +${(m.y - (seg?.y0 ?? 0)).toFixed(2)}  v=(${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
}
sim.dispose();
