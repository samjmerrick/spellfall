import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collectibleCards, FACTIONS } from '../../src/rules';
import { balanceRun, playMeasured, summarise } from '../../tools/sim/balance-core';

describe('balance report', () => {
  it('measures every pairing from both seats and summarises it', { timeout: 120_000 }, () => {
    const records = balanceRun(4);
    expect(records).toHaveLength(FACTIONS.length * FACTIONS.length * 4);
    const s = summarise(records);
    for (const f of FACTIONS) expect(s.factions[f]).toBeGreaterThan(0);
    expect(s.firstPlayer).toBeGreaterThan(0.2);
    expect(s.firstPlayer).toBeLessThan(0.8);
    expect(s.medianTurns).toBeGreaterThan(6);
    for (const id of Object.keys(s.cards)) expect(collectibleCards().some((c) => c.id === id)).toBe(true);
  });

  it('is reproducible for a seed', () => {
    expect(playMeasured('ember', 'dusk', 7)).toEqual(playMeasured('ember', 'dusk', 7));
  });

  it('every exception names a real faction or card and gives a reason', () => {
    const ex = JSON.parse(readFileSync('tools/sim/balance-exceptions.json', 'utf8')) as {
      factions: Record<string, string>;
      cards: Record<string, string>;
    };
    for (const [f, why] of Object.entries(ex.factions)) {
      expect(FACTIONS as readonly string[]).toContain(f);
      expect(why.length).toBeGreaterThan(20);
    }
    for (const [id, why] of Object.entries(ex.cards)) {
      expect(
        collectibleCards().some((c) => c.id === id),
        id,
      ).toBe(true);
      expect(why.length).toBeGreaterThan(20);
    }
  });
});
