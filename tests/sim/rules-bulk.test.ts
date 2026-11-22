import { describe, expect, it } from 'vitest';
import { applyAction, initMatch } from '../../src/rules';
import { factionDeck, randomMatch } from '../../tools/sim/rules-bot';

const decks: [string[], string[]] = [factionDeck('ember'), factionDeck('bastion')];

describe('Spellfall rules: bulk random matches', () => {
  it('10,000 random bot matches all end with no errors', { timeout: 300_000 }, () => {
    const results = { 0: 0, 1: 0, draw: 0, turns: 0 };
    let longest = 0;
    for (let seed = 1; seed <= 10_000; seed++) {
      const { state } = randomMatch(seed % 2 ? decks : [decks[1], decks[0]], seed);
      expect(state.phase).toBe('over');
      const r = state.result!;
      if (r.reason === 'turns') results.turns++;
      else if (r.winner === null) results.draw++;
      else results[r.winner]++;
      longest = Math.max(longest, state.turn);
    }
    expect(results[0] + results[1] + results.draw + results.turns).toBe(10_000);
    expect(longest).toBeLessThanOrEqual(40);
  });

  it('the same seed and actions give an identical event log, byte for byte', () => {
    for (const seed of [3, 77, 1234]) {
      const a = randomMatch(decks, seed);
      const b = randomMatch(decks, seed);
      expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
      // Replaying the recorded actions reproduces the log too.
      let s = initMatch({ decks }, seed);
      const events = [];
      for (const act of a.actions) {
        const r = applyAction(s, act);
        s = r.state;
        events.push(...r.events);
      }
      expect(JSON.stringify(events)).toBe(JSON.stringify(a.events));
      expect(JSON.stringify(s)).toBe(JSON.stringify(a.state));
    }
  });
});
