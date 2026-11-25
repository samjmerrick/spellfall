import type { Difficulty } from '../../src/ai';
import { collectibleCards } from '../../src/rules';
import { HEROES, allRelicIds } from '../../src/run';
import { playBotRun } from './run';

// pnpm sim:run [runs=500] [player=easy] [ascension=0]
// Plays with every collectible card, relic and hero available.
const n = Number(process.argv[2] ?? 100);
const player = (process.argv[3] as Difficulty) ?? 'easy';
const ascension = Number(process.argv[4] ?? 0);
const pool = collectibleCards().map((c) => c.id);
const relics = allRelicIds();
const heroes = HEROES;
const stats = new Map(heroes.map((h) => [h.id, { runs: 0, won: 0, nodes: 0, acts: [0, 0, 0, 0] }]));
let matches = 0;
const start = performance.now();
for (let seed = 1; seed <= n; seed++) {
  const hero = heroes[seed % heroes.length]!;
  const rec = playBotRun({ seed, heroId: hero.id, pool, ascension, relics }, player);
  const st = stats.get(hero.id)!;
  st.runs++;
  st.nodes += rec.final.nodesCleared;
  st.acts[rec.final.act]!++;
  if (rec.final.phase.kind === 'over' && rec.final.phase.won) st.won++;
  matches += rec.matches;
}
const ms = performance.now() - start;
console.log(
  `${n} bot runs (player AI: ${player}, Ascension ${ascension}), ${matches} matches, ${(ms / n).toFixed(0)} ms per run`,
);
for (const [id, s] of stats)
  if (s.runs > 0)
    console.log(
      `${id}: won ${s.won}/${s.runs} (${((100 * s.won) / s.runs).toFixed(0)}%), ${(s.nodes / s.runs).toFixed(1)} nodes cleared, ended in act 1/2/3: ${s.acts.slice(1).join('/')}`,
    );
