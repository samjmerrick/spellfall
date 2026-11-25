// Light balance report: pnpm sim:balance [n=1000] [level=normal] [firstSeed=1]. Bot-vs-bot matches over every faction
// pairing (mirrors included), seats and first player alternating. Prints first-player win rate, each
// faction's win rate, and the cards whose played-by win rate is furthest from 50% (with enough plays).
import type { Difficulty } from '../../src/ai';
import { FACTIONS, getCard, type PlayerId } from '../../src/rules';
import { configMatch, factionDeck } from './rules-bot';

const n = Number(process.argv[2] ?? 1000);
const level = (process.argv[3] ?? 'normal') as Difficulty;
const from = Number(process.argv[4] ?? 1);
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : '-').padStart(5);

let firstWins = 0;
let decided = 0;
let turns = 0;
let burned = 0;
const faction = new Map<string, { w: number; g: number }>();
const card = new Map<string, { w: number; g: number }>();
const bump = (m: Map<string, { w: number; g: number }>, k: string, win: boolean) => {
  const e = m.get(k) ?? { w: 0, g: 0 };
  e.g++;
  if (win) e.w++;
  m.set(k, e);
};
const start = performance.now();
for (let seed = from; seed < from + n; seed++) {
  const fs: [string, string] = [FACTIONS[seed % 5]!, FACTIONS[Math.floor(seed / 5) % 5]!];
  const firstPlayer = (Math.floor(seed / 25) % 2) as PlayerId;
  const { state, events } = configMatch(
    { decks: [factionDeck(fs[0]), factionDeck(fs[1])], firstPlayer },
    [level, level],
    seed,
  );
  const w = state.result!.winner;
  turns += state.turn;
  if (w === null) continue;
  decided++;
  if (w === firstPlayer) firstWins++;
  if (fs[0] !== fs[1]) for (const p of [0, 1] as const) bump(faction, fs[p], w === p);
  for (const p of [0, 1] as const) {
    const played = new Set<string>();
    for (const e of events) {
      if ((e.type === 'UnitPlayed' || e.type === 'SpellCast') && e.player === p) played.add(e.cardId);
      if (e.type === 'CardBurned' && e.player === p) burned++;
    }
    for (const id of played) bump(card, id, w === p);
  }
}
const ms = performance.now() - start;
console.log(
  `${n} ${level} matches: first player won ${pct(firstWins, decided).trim()}% of ${decided} decided, ${(turns / n).toFixed(1)} turns, ${(burned / n).toFixed(2)} burned cards per match, ${(ms / n).toFixed(0)} ms per match`,
);
console.log('Faction win rate (non-mirror):');
for (const f of FACTIONS) {
  const e = faction.get(f) ?? { w: 0, g: 0 };
  console.log(`  ${f.padEnd(8)} ${pct(e.w, e.g)}%  (${e.g})`);
}
const min = Math.max(20, Math.round(n / 50));
const rows = [...card.entries()]
  .filter(([id, e]) => e.g >= min && getCard(id).faction !== 'neutral')
  .map(([id, e]) => ({ id, rate: e.w / e.g, g: e.g }))
  .sort((a, b) => Math.abs(b.rate - 0.5) - Math.abs(a.rate - 0.5));
console.log(`Cards furthest from 50% when played (at least ${min} matches):`);
for (const r of rows.slice(0, 20))
  console.log(`  ${r.id.padEnd(28)} ${(100 * r.rate).toFixed(1).padStart(5)}%  (${r.g})`);
