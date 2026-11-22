import { describe, expect, it } from 'vitest';
import {
  canAddCard,
  collectibleCards,
  decodeDeck,
  deckProblems,
  encodeDeck,
  isDeckLegal,
  PREBUILT_DECKS,
  sortCards,
  starterCollection,
} from '../../src/engine';

const rules = (cards: string[], owned?: Set<string>) => deckProblems(cards, owned).map((p) => p.rule);
const n = (id: string, count: number) => Array.from({ length: count }, () => id);
const tenEmber = collectibleCards()
  .filter((c) => c.faction === 'ember' && c.rarity !== 'legendary')
  .slice(0, 10)
  .map((c) => c.id);
const legal = tenEmber.flatMap((id) => n(id, 3));

describe('deck legality', () => {
  it('accepts a 30-card single-faction deck', () => {
    expect(deckProblems(legal)).toEqual([]);
    expect(isDeckLegal(legal)).toBe(true);
  });

  it('needs exactly 30 cards', () => {
    expect(rules(legal.slice(0, 29))).toEqual(['size']);
    expect(rules([...legal, tenEmber[0]!].slice(1).concat(tenEmber[1]!))).toContain('size');
    expect(deckProblems(legal.slice(0, 29))[0]!.message).toMatch(/exactly 30.*29/);
  });

  it('allows up to 2 factions', () => {
    const two = [...legal.slice(0, 27), ...n('bastion-recruit', 3)];
    expect(rules(two)).toEqual([]);
    // A third faction is covered in deck-factions.test.ts, which adds fake cards.
  });

  it('allows at most 3 copies of a card', () => {
    const four = [...legal.slice(0, 26), ...n(tenEmber[0]!, 1), ...n(tenEmber[9]!, 3)];
    const counts = four.filter((id) => id === tenEmber[0]).length;
    expect(counts).toBe(4);
    expect(rules(four)).toEqual(['copies']);
  });

  it('allows only 1 copy of a Legendary card', () => {
    const legendary = collectibleCards().find((c) => c.rarity === 'legendary' && c.faction === 'ember')!.id;
    expect(rules([...legal.slice(0, 29), legendary])).toEqual([]);
    expect(rules([...legal.slice(0, 28), legendary, legendary])).toEqual(['legendary']);
  });

  it('rejects unknown cards and tokens', () => {
    expect(rules([...legal.slice(0, 29), 'nope-card'])).toEqual(['unknown']);
    expect(rules([...legal.slice(0, 29), 'bastion-levy'])).toEqual(['token']);
  });

  it('rejects locked cards when a collection is given', () => {
    const owned = starterCollection();
    const locked = collectibleCards().find(
      (c) => c.faction === 'ember' && !owned.has(c.id) && !tenEmber.includes(c.id),
    )!.id;
    expect(rules([...legal.slice(0, 29), locked], new Set([...legal]))).toContain('locked');
  });

  it('canAddCard respects size, copies, Legendary and faction limits', () => {
    expect(canAddCard(legal, tenEmber[0]!)).toBe(false);
    expect(canAddCard(legal.slice(0, 27), tenEmber[9]!)).toBe(true);
    expect(canAddCard(legal.slice(0, 3), tenEmber[0]!)).toBe(false);
    expect(canAddCard([], 'bastion-levy')).toBe(false);
    const legendary = collectibleCards().find((c) => c.rarity === 'legendary')!.id;
    expect(canAddCard([legendary], legendary)).toBe(false);
    expect(canAddCard(['ember-spark-imp', 'bastion-recruit'], 'bastion-militia')).toBe(true);
  });
});

describe('pre-built decks', () => {
  it('are legal using only the starter collection', () => {
    expect(PREBUILT_DECKS).toHaveLength(10);
    expect(new Set(PREBUILT_DECKS.map((d) => d.id)).size).toBe(10);
    for (const deck of PREBUILT_DECKS) {
      expect(deckProblems(deck.cards, starterCollection()), deck.id).toEqual([]);
      expect(deck.cards).toContain(deck.cover);
    }
  });

  it('the starter collection is 12 commons per faction', () => {
    const owned = [...starterCollection()].map((id) => collectibleCards().find((c) => c.id === id)!);
    for (const f of ['ember', 'tide', 'grove', 'bastion', 'dusk'] as const) {
      const mine = owned.filter((c) => c.faction === f);
      expect(mine).toHaveLength(12);
      expect(mine.every((c) => c.rarity === 'common')).toBe(true);
    }
  });
});

describe('deck share codes', () => {
  it('round-trips a deck', () => {
    for (const deck of PREBUILT_DECKS) {
      const code = encodeDeck(deck.cards);
      expect(code).toMatch(/^SD1-[A-Za-z0-9_-]+$/);
      expect(code.length).toBeLessThan(40);
      expect(decodeDeck(code)).toEqual(sortCards(deck.cards));
    }
  });

  it('rejects bad codes with a readable message', () => {
    expect(() => decodeDeck('hello')).toThrow(/not a Spellfall deck code/);
    expect(() => decodeDeck('SD1-')).toThrow(/damaged/);
    expect(() => decodeDeck('SD1-AA')).toThrow(/damaged/);
    expect(() => decodeDeck('SD1-%%%%')).toThrow(/damaged/);
    expect(() => decodeDeck('SD1-_wE')).toThrow(/does not exist/);
    expect(() => encodeDeck(['nope-card'])).toThrow(/Cannot encode/);
  });
});
