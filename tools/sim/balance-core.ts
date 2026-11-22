// Balance measurements for Spellfall (spec V8): mono-faction decks, every pairing from both seats, Normal vs Normal.
// Pure and deterministic: the same n gives the same numbers.
import {
  FACTIONS,
  applyAction,
  initMatch,
  viewFor,
  getCard,
  type GameEvent,
  type PlayerId,
  type MatchModifier,
} from '../../src/rules';
import { act, type Difficulty } from '../../src/ai';
import { factionDeck } from './rules-bot';

export interface MatchRecord {
  factions: [string, string];
  winner: PlayerId | null;
  first: PlayerId;
  turns: number;
  /** Base card ids each player played at least once. */
  played: [string[], string[]];
}

export function playMeasured(
  fa: string,
  fb: string,
  seed: number,
  heroHp?: number,
  level: Difficulty = 'normal',
  secondMods: MatchModifier[] = [],
): MatchRecord {
  const first = (seed & 1) as PlayerId;
  const modifiers: [MatchModifier[], MatchModifier[]] = first === 0 ? [[], secondMods] : [secondMods, []];
  let s = initMatch({ decks: [factionDeck(fa), factionDeck(fb)], heroHp, modifiers }, seed);
  const rngs: [number, number] = [(seed * 31 + 1) >>> 0, (seed * 37 + 2) >>> 0];
  const played: [Set<string>, Set<string>] = [new Set(), new Set()];
  for (let step = 0; s.phase !== 'over'; step++) {
    if (step > 5000) throw new Error(`match ${seed} did not end`);
    const p: PlayerId = s.phase === 'mulligan' ? (s.players[0].mulliganed ? 1 : 0) : s.priority;
    const { action, rng } = act(level, viewFor(s, p), rngs[p]);
    rngs[p] = rng;
    const r = applyAction(s, action);
    for (const e of r.events as GameEvent[])
      if ((e.type === 'UnitPlayed' || e.type === 'SpellCast') && !getCard(e.cardId).token)
        played[e.player].add(e.cardId);
    s = r.state;
  }
  return {
    factions: [fa, fb],
    winner: s.result!.winner,
    first: s.firstPlayer,
    turns: s.turn,
    played: [[...played[0]], [...played[1]]],
  };
}

/** Every ordered faction pairing (including mirrors), n seeds each. */
export function balanceRun(n: number, heroHp?: number, secondMods: MatchModifier[] = []): MatchRecord[] {
  const out: MatchRecord[] = [];
  let seed = 1;
  for (const a of FACTIONS)
    for (const b of FACTIONS)
      for (let i = 0; i < n; i++) out.push(playMeasured(a, b, seed++, heroHp, 'normal', secondMods));
  return out;
}

export interface Summary {
  matches: number;
  /** Win rate per faction in non-mirror matches (draws count as losses). */
  factions: Record<string, number>;
  firstPlayer: number;
  draws: number;
  medianTurns: number;
  /** Win rate when played, per card, and how many times it was played. */
  cards: Record<string, { rate: number; played: number }>;
}

export function summarise(records: MatchRecord[]): Summary {
  const fw: Record<string, [number, number]> = {};
  const cw: Record<string, [number, number]> = {};
  let first = 0;
  let decided = 0;
  let draws = 0;
  for (const r of records) {
    if (r.winner === null) draws++;
    else {
      decided++;
      if (r.winner === r.first) first++;
    }
    if (r.factions[0] !== r.factions[1])
      for (const p of [0, 1] as const) {
        const f = r.factions[p];
        fw[f] ??= [0, 0];
        fw[f][1]++;
        if (r.winner === p) fw[f][0]++;
      }
    for (const p of [0, 1] as const)
      for (const id of r.played[p]) {
        cw[id] ??= [0, 0];
        cw[id][1]++;
        if (r.winner === p) cw[id][0]++;
      }
  }
  const turns = records.map((r) => r.turns).sort((a, b) => a - b);
  return {
    matches: records.length,
    factions: Object.fromEntries(Object.entries(fw).map(([f, [w, n]]) => [f, w / n])),
    firstPlayer: decided ? first / decided : 0,
    draws: draws / records.length,
    medianTurns: turns[turns.length >> 1] ?? 0,
    cards: Object.fromEntries(Object.entries(cw).map(([id, [w, n]]) => [id, { rate: w / n, played: n }])),
  };
}
