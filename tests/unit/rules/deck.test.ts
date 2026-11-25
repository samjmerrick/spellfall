import { describe, expect, it } from 'vitest';
import {
  canAddCard,
  collectibleCards,
  decodeDeck,
  deckProblems,
  encodeDeck,
  isDeckLegal,
  getCard,
  PREBUILT_DECKS,
  sortCards,
} from '../../../src/rules';

const rules = (cards: string[]) => deckProblems(cards).map((p) => p.rule);
const n = (id: string, count: number) => Array.from({ length: count }, () => id);
const tenEmber = collectibleCards()
  .filter((c) => c.faction === 'ember' && c.rarity !== 'legendary')
  .slice(0, 15)
  .map((c) => c.id);
const legal = tenEmber.flatMap((id) => n(id, 2));

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
    const two = [...legal.slice(0, 28), ...n('bastion-recruit', 2)];
    expect(rules(two)).toEqual([]);
    // A third faction is covered in deck-factions.test.ts, which adds fake cards.
  });

  it('allows at most 2 copies of a card', () => {
    const three = [...legal.slice(0, 29), tenEmber[0]!];
    expect(three.filter((id) => id === tenEmber[0]).length).toBe(3);
    expect(rules(three)).toEqual(['copies']);
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

  it('canAddCard respects size, copies, Legendary and faction limits', () => {
    expect(canAddCard(legal, tenEmber[0]!)).toBe(false);
    expect(canAddCard(legal.slice(0, 27), tenEmber[14]!)).toBe(true);
    expect(canAddCard(legal.slice(0, 3), tenEmber[0]!)).toBe(false);
    expect(canAddCard([], 'bastion-levy')).toBe(false);
    const legendary = collectibleCards().find((c) => c.rarity === 'legendary')!.id;
    expect(canAddCard([legendary], legendary)).toBe(false);
    expect(canAddCard(['ember-spark-imp', 'bastion-recruit'], 'bastion-militia')).toBe(true);
  });
});

describe('pre-built decks', () => {
  it('are legal', () => {
    expect(PREBUILT_DECKS).toHaveLength(10);
    expect(new Set(PREBUILT_DECKS.map((d) => d.id)).size).toBe(10);
    for (const deck of PREBUILT_DECKS) {
      expect(deckProblems(deck.cards), deck.id).toEqual([]);
      expect(deck.cards).toContain(deck.cover);
    }
  });

  it('every pre-built deck has 12 to 14 spells and at most one copy of each Legendary', () => {
    for (const deck of PREBUILT_DECKS) {
      const spells = deck.cards.filter((id) => getCard(id).type === 'spell').length;
      expect(spells, deck.id).toBeGreaterThanOrEqual(12);
      expect(spells, deck.id).toBeLessThanOrEqual(14);
      expect(
        deckProblems(deck.cards).map((p) => p.rule),
        deck.id,
      ).not.toContain('legendary');
    }
  });
});

describe('deck share codes', () => {
  it('round-trips a deck', () => {
    for (const deck of PREBUILT_DECKS) {
      const code = encodeDeck(deck.cards);
      expect(code).toMatch(/^SD1-[A-Za-z0-9_-]+$/);
      expect(code.length).toBeLessThan(64);
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

describe('deck factions (Spellfall pool)', () => {
  const ember = collectibleCards().filter((c) => c.faction === 'ember' && c.rarity === 'common');
  const tide = collectibleCards().filter((c) => c.faction === 'tide' && c.rarity === 'common');
  const grove = collectibleCards().filter((c) => c.faction === 'grove' && c.rarity === 'common');

  it('allows two factions and refuses a third', () => {
    const two = [...ember.slice(0, 8), ...tide.slice(0, 7)].flatMap((c) => n(c.id, 2));
    expect(isDeckLegal(two)).toBe(true);
    const three = [...two.slice(0, 28), ...n(grove[0]!.id, 2)];
    expect(rules(three)).toContain('factions');
    expect(canAddCard(two.slice(0, 29), grove[0]!.id)).toBe(false);
    expect(canAddCard(two.slice(0, 29), ember[0]!.id)).toBe(false);
    expect(canAddCard(two.slice(0, 28), tide[6]!.id)).toBe(true);
  });

  it('never puts tokens or the Spark in a deck', () => {
    expect(canAddCard([], 'neutral-spark')).toBe(false);
    expect(rules([...legal.slice(0, 29), 'dusk-shade'])).toContain('token');
  });
});
