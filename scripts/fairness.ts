/**
 * Headless fairness check: runs many seeded races and prints the win distribution.
 *   npm run fairness -- [races=300] [length=short|medium|epic|1-15] [mode=first] [names=6] [seedOffset=0] [funnels=0] [finish=random]
 */
import RAPIER from '@dimforge/rapier2d-compat';
import { Sim, type RaceLength, type WinMode } from '../src/sim/sim';

const [racesArg, lengthArg, modeArg, namesArg, offsetArg, funnelsArg, finishArg] = process.argv.slice(2);
const offset = Number(offsetArg ?? 0);
const races = Number(racesArg ?? 300);
// A preset name or a segment count.
const length = !lengthArg ? 'short' : Number.isNaN(Number(lengthArg)) ? (lengthArg as RaceLength) : Number(lengthArg);
const mode = (modeArg ?? 'first') as WinMode;
const nNames = Number(namesArg ?? 6);
const funnels = funnelsArg === '1';
const finish = finishArg && finishArg !== 'random' ? finishArg : undefined;
const names = Array.from({ length: nNames }, (_, i) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? i : ''));
const TIME_CAP = 300;

await RAPIER.init();

const wins = new Array(nNames).fill(0);
let timeouts = 0;
let totalTime = 0;
let maxTime = 0;
let totalLeads = 0;
let totalRescues = 0;
const started = performance.now();

for (let i = 0; i < races; i++) {
  const sim = new Sim({ names, seed: offset + i + 1, length, mode, funnels, finish });
  while (!sim.winner && sim.raceTime < TIME_CAP) {
    sim.step();
    sim.events.length = 0;
  }
  if (sim.winner) {
    wins[sim.winner.idx]++;
    totalTime += sim.raceTime;
    maxTime = Math.max(maxTime, sim.raceTime);
    totalLeads += sim.leadChanges;
    totalRescues += sim.rescues;
  } else {
    timeouts++;
    console.warn(`seed ${i + 1}: timed out`);
  }
  sim.dispose();
}

const done = races - timeouts;
const expected = done / nNames;
let chi = 0;
console.log(`\n${races} races · ${length} · ${mode} · funnels ${funnels ? 'on' : 'off'} · finish ${finish ?? 'random'} · ${((performance.now() - started) / 1000).toFixed(1)}s wall\n`);
names.forEach((n, i) => {
  chi += (wins[i] - expected) ** 2 / expected;
  const pct = ((wins[i] / done) * 100).toFixed(1).padStart(5);
  console.log(`  ${n.padEnd(4)} ${String(wins[i]).padStart(5)}  ${pct}%  ${'█'.repeat(Math.round((wins[i] / done) * 60))}`);
});
console.log(`\n  chi² = ${chi.toFixed(2)} (df ${nNames - 1}; ~${(nNames - 1 + 2 * Math.sqrt(2 * (nNames - 1))).toFixed(1)} is the rough 95% bound)`);
console.log(`  avg race ${(totalTime / done).toFixed(1)}s · max ${maxTime.toFixed(1)}s · avg lead changes ${(totalLeads / done).toFixed(1)} · rescues/race ${(totalRescues / done).toFixed(2)} · timeouts ${timeouts}`);
