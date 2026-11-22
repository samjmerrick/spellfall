// Bot-vs-bot matches on Spellfall's rules: pnpm sim [n=200] [levelA=normal] [levelB=normal] [factionA] [factionB]
// Without factions, every pairing is played in turn. Seats alternate so neither side always goes first.
import type { Difficulty } from '../../src/ai';
import { FACTIONS } from '../../src/rules';
import { aiMatch, factionDeck } from './rules-bot';

const n = Number(process.argv[2] ?? 200);
const a = (process.argv[3] ?? 'normal') as Difficulty;
const b = (process.argv[4] ?? 'normal') as Difficulty;
const fa = process.argv[5];
const fb = process.argv[6];
let winsA = 0;
let draws = 0;
let turns = 0;
let firstWins = 0;
const start = performance.now();
for (let seed = 1; seed <= n; seed++) {
  const da = fa ?? FACTIONS[seed % 5]!;
  const db = fb ?? FACTIONS[Math.floor(seed / 5) % 5]!;
  const seatA = (seed % 2) as 0 | 1;
  const decks: [string[], string[]] =
    seatA === 0 ? [factionDeck(da), factionDeck(db)] : [factionDeck(db), factionDeck(da)];
  const levels: [Difficulty, Difficulty] = seatA === 0 ? [a, b] : [b, a];
  const { state } = aiMatch(decks, levels, seed);
  const w = state.result!.winner;
  if (w === null) draws++;
  else if (w === seatA) winsA++;
  if (w !== null && w === state.firstPlayer) firstWins++;
  turns += state.turn;
}
const ms = performance.now() - start;
console.log(
  `${n} matches, ${a} vs ${b}${fa ? ` (${fa} vs ${fb})` : ''}: ${a} side won ${winsA} (${((100 * winsA) / n).toFixed(1)}%), draws ${draws}, first player won ${((100 * firstWins) / n).toFixed(1)}%, ${(turns / n).toFixed(1)} turns per match, ${(ms / n).toFixed(1)} ms per match`,
);
