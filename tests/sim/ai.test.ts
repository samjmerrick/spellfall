import { describe, expect, it } from 'vitest';
import {
  applyAction,
  HIDDEN,
  initMatch,
  legalActions,
  PREBUILT_DECKS,
  viewFor,
  type PlayerView,
} from '../../src/rules';
import { act, actEasy, actNormal, simulate } from '../../src/ai';
import { score } from '../../src/ai/score';
import { actHard, determinise, HARD } from '../../src/ai/hard';
import { sized } from './scale';
import { aiMatch, factionDeck } from '../../tools/sim/rules-bot';

const E = factionDeck('ember');
const B = factionDeck('bastion');

describe('Spellfall AI', () => {
  it(
    'Normal beats Easy most of the time, from either seat and with either deck',
    { timeout: 120_000 },
    () => {
      let normalWins = 0;
      const n = sized(60);
      for (let i = 1; i <= n; i++) {
        const seat = i % 2;
        const decks: [string[], string[]] = i % 4 < 2 ? [E, B] : [B, E];
        const r = aiMatch(decks, seat === 0 ? ['normal', 'easy'] : ['easy', 'normal'], i);
        if (r.state.result!.winner === seat) normalWins++;
      }
      expect(normalWins / n).toBeGreaterThan(0.6);
    },
  );

  it('each Normal decision takes under 150 ms', { timeout: 120_000 }, () => {
    const times: number[] = [];
    for (let i = 1; i <= sized(12); i++) {
      aiMatch(
        [E, B],
        ['normal', 'normal'],
        i,
        (ms) => times.push(ms),
        () => performance.now(),
      );
    }
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length * 0.99)]!).toBeLessThan(150);
  });

  it('is deterministic for a seed', () => {
    const a = aiMatch([E, B], ['normal', 'easy'], 9);
    const b = aiMatch([E, B], ['normal', 'easy'], 9);
    expect(JSON.stringify(b.actions)).toBe(JSON.stringify(a.actions));
  });

  it('mulligans cards costing 5 or more, and plays from its own view only', () => {
    const s = initMatch({ decks: [E, B], firstPlayer: 0 }, 4);
    const view = viewFor(s, 1);
    const m = act('normal', view, 1).action;
    expect(m.type).toBe('mulligan');
    expect(actEasy(view, 1).action.type).toBe('mulligan');
    let g = applyAction(s, { type: 'mulligan', player: 0, uids: [] }).state;
    g = applyAction(g, m).state;
    const a = actNormal(viewFor(g, 0), 1).action;
    expect(a.player).toBe(0);
    expect(simulate(viewFor(g, 0), { type: 'pass', player: 1 })).toBeNull();
    expect(score(g, 0)).toBe(-score(g, 1));
  });
});

describe('Spellfall Hard AI', () => {
  const decks = (i: number): [string[], string[]] => [
    PREBUILT_DECKS[i % 10]!.cards,
    PREBUILT_DECKS[(i * 3 + 1) % 10]!.cards,
  ];

  /** Decision points from Normal-vs-Normal matches, from the side about to act. */
  function samplePoints(count: number): PlayerView[] {
    const out: PlayerView[] = [];
    for (let i = 1; out.length < count; i++) {
      let s = initMatch({ decks: decks(i) }, i);
      for (let step = 0; s.phase !== 'over' && step < 400; step++) {
        const p = s.phase === 'mulligan' ? (s.players[0].mulliganed ? 1 : 0) : s.priority;
        const v = viewFor(s, p);
        if (s.phase === 'main' && step % 7 === 0 && out.length < count) out.push(v);
        s = applyAction(s, act('normal', v, 1).action).state;
      }
    }
    return out;
  }
  const points = samplePoints(30);

  it(`benchmark: the full search stays within ${HARD.budgetMs} ms on every sampled decision`, () => {
    const times: number[] = [];
    for (const v of points) {
      const t = performance.now();
      actHard(v, 1);
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    console.log(
      `Spellfall Hard: median ${times[times.length >> 1]!.toFixed(0)} ms, p90 ${times[Math.floor(times.length * 0.9)]!.toFixed(0)} ms, worst ${times.at(-1)!.toFixed(0)} ms`,
    );
    expect(times.at(-1)!).toBeLessThan(1500);
  });

  it('with a clock, stops near its budget and returns a legal action', () => {
    for (const v of points.slice(0, 20)) {
      const t = performance.now();
      const { action } = actHard(v, 2, () => performance.now());
      expect(performance.now() - t).toBeLessThan(1500);
      expect(legalActions(v).some((a) => JSON.stringify(a) === JSON.stringify(action))).toBe(true);
    }
  });

  it('is deterministic without a clock', () => {
    for (const v of points.slice(0, 8)) expect(actHard(v, 9).action).toEqual(actHard(v, 9).action);
  });

  it('determinising fills hidden cards from the factions the opponent has shown', () => {
    const v = points.find((p) => p.boards[1 - p.viewer]!.length > 0)!;
    const [world] = determinise(v, 3);
    const opp = (1 - v.viewer) as 0 | 1;
    expect(world.players[opp].hand.every((c) => c.cardId !== HIDDEN)).toBe(true);
    expect(world.players[opp].deck.every((c) => c !== HIDDEN)).toBe(true);
  });

  it('is not clearly worse than Normal', { timeout: 300_000 }, () => {
    let wins = 0;
    let losses = 0;
    for (let i = 1; i <= sized(14); i++) {
      const seat = i % 2;
      const r = aiMatch(decks(i), seat === 0 ? ['hard', 'normal'] : ['normal', 'hard'], i);
      if (r.state.result!.winner === seat) wins++;
      else if (r.state.result!.winner !== null) losses++;
    }
    // Forgiving: with so few matches, only fail if Hard is clearly worse.
    expect(wins).toBeGreaterThanOrEqual(losses - 2);
  });
});
