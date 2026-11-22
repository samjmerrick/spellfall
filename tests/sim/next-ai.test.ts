import { describe, expect, it } from 'vitest';
import { applyAction, initMatch, viewFor } from '../../src/rules';
import { act, actEasy, actNormal, simulate } from '../../src/ai/next';
import { score } from '../../src/ai/next/score';
import { aiMatch, factionDeck } from '../../tools/sim/rules-bot';

const E = factionDeck('ember');
const B = factionDeck('bastion');

describe('Spellfall AI', () => {
  it(
    'Normal beats Easy most of the time, from either seat and with either deck',
    { timeout: 120_000 },
    () => {
      let normalWins = 0;
      const n = 200;
      for (let i = 1; i <= n; i++) {
        const seat = i % 2;
        const decks: [string[], string[]] = i % 4 < 2 ? [E, B] : [B, E];
        const r = aiMatch(decks, seat === 0 ? ['normal', 'easy'] : ['easy', 'normal'], i);
        if (r.state.result!.winner === seat) normalWins++;
      }
      expect(normalWins / n).toBeGreaterThan(0.75);
    },
  );

  it('each Normal decision takes under 50 ms', { timeout: 120_000 }, () => {
    const times: number[] = [];
    for (let i = 1; i <= 40; i++) {
      aiMatch(
        [E, B],
        ['normal', 'normal'],
        i,
        (ms) => times.push(ms),
        () => performance.now(),
      );
    }
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length * 0.99)]!).toBeLessThan(50);
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
