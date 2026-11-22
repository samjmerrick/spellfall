import { describe, expect, it } from 'vitest';
import { legalTargets, sameTarget, targetCombos, targetMatches } from '../../../src/rules';
import { viewFor, eventsFor, HIDDEN } from '../../../src/rules';
import { cast, FILLER, hero, place, setup, unit } from './helpers';

describe('targets', () => {
  it('kinds pick the right units and heroes', () => {
    const s = setup();
    const mine = place(s, 0, FILLER);
    const theirs = place(s, 1, FILLER);
    expect(legalTargets(s, { kind: 'enemyUnit' }, 0)).toEqual([unit(theirs.uid)]);
    expect(legalTargets(s, { kind: 'friendlyUnit' }, 0)).toEqual([unit(mine.uid)]);
    expect(legalTargets(s, { kind: 'anyUnit' }, 0)).toEqual([unit(mine.uid), unit(theirs.uid)]);
    expect(legalTargets(s, { kind: 'enemyCharacter' }, 0)).toEqual([hero(1), unit(theirs.uid)]);
    expect(legalTargets(s, { kind: 'friendlyCharacter' }, 0)).toEqual([hero(0), unit(mine.uid)]);
    expect(legalTargets(s, { kind: 'anyCharacter' }, 0)).toHaveLength(4);
    expect(legalTargets(s, { kind: 'stackItem' }, 0)).toEqual([]);
  });

  it('filters: cost and damaged; heroes never match a filter', () => {
    const s = setup();
    const cheap = place(s, 1, FILLER);
    const big = place(s, 1, 'ember-magma-brute', { damage: 1 });
    expect(legalTargets(s, { kind: 'enemyUnit', maxCost: 1 }, 0)).toEqual([unit(cheap.uid)]);
    expect(legalTargets(s, { kind: 'enemyCharacter', damaged: true }, 0)).toEqual([unit(big.uid)]);
    expect(targetMatches(s, { kind: 'enemyUnit' }, 0, unit(12345))).toBe(false);
    expect(targetMatches(s, { kind: 'enemyUnit' }, 0, hero(1))).toBe(false);
  });

  it('stack items: only spells, and not the resolving spell itself', () => {
    let s = setup({ mana: 5 });
    s = cast(s, 0, 'bastion-rally-cry');
    const id = s.stack[0]!.id;
    expect(legalTargets(s, { kind: 'stackItem' }, 1)).toEqual([{ kind: 'stack', id }]);
    expect(targetMatches(s, { kind: 'stackItem' }, 1, { kind: 'stack', id }, id)).toBe(false);
    expect(targetMatches(s, { kind: 'enemyUnit' }, 1, { kind: 'stack', id })).toBe(false);
  });

  it('two targets must differ', () => {
    const s = setup();
    const a = place(s, 1, FILLER);
    const combos = targetCombos(s, [{ kind: 'enemyUnit' }, { kind: 'enemyCharacter' }], 0);
    expect(combos).toEqual([[unit(a.uid), hero(1)]]);
    expect(sameTarget({ kind: 'stack', id: 1 }, { kind: 'stack', id: 1 })).toBe(true);
    expect(sameTarget(hero(0), unit(1))).toBe(false);
  });
});

describe('views', () => {
  it('hide the opponent’s hand and deck, the viewer’s deck order and the RNG', () => {
    const s = setup({
      keepHands: true,
      deck: Array.from({ length: 30 }, (_, i) => (i % 3 ? FILLER : 'bastion-militia')),
    });
    const v = viewFor(s, 0);
    expect(v.viewer).toBe(0);
    expect(v.players[1].hand.every((c) => c.cardId === HIDDEN)).toBe(true);
    expect(v.players[1].deck.every((c) => c === HIDDEN)).toBe(true);
    expect(v.players[0].hand).toEqual(s.players[0].hand);
    expect(v.players[0].deck).toEqual([...s.players[0].deck].sort());
    expect(v.rng).not.toBe(s.rng);
    expect(s.players[1].hand.every((c) => c.cardId !== HIDDEN)).toBe(true);
  });

  it('events hide the opponent’s draws', () => {
    const e = eventsFor(
      [
        { type: 'CardDrawn', player: 1, uid: 1, cardId: 'x' },
        { type: 'CardDrawn', player: 0, uid: 2, cardId: 'y' },
      ],
      0,
    );
    expect(e.map((x) => (x as { cardId: string }).cardId)).toEqual([HIDDEN, 'y']);
  });
});
