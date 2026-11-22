import cardsJson from '../content/next/cards.json';
import { cardText } from './text';
import { CardListSchema, type CardDef } from './schema';

/** Suffix marking an upgraded card id, e.g. `ember-kindle+`. */
export const UPGRADED = '+';

const bump = (n: number) => n + (n > 0 ? 1 : n < 0 ? -1 : 0);

/**
 * A card's upgraded version: the card's `upgrade` overrides if given; otherwise a unit gets +1 Power,
 * and a spell gets +1 on every damage/heal/buff amount, or costs 1 less if it has no amounts.
 */
export function upgradeCard(card: CardDef): CardDef {
  const u = card.upgrade;
  const base: CardDef = { ...card, id: card.id + UPGRADED, name: card.name + UPGRADED, upgrade: undefined };
  if (u) return { ...base, ...u };
  if (card.type === 'unit') return { ...base, power: (card.power ?? 0) + 1 };
  let bumped = false;
  const effects = card.effects.map((e) => {
    const a = e.action;
    if (a.op === 'damage' || (a.op === 'heal' && a.amount !== 'full')) {
      bumped = true;
      return { ...e, action: { ...a, amount: (a.amount as number) + 1 } };
    }
    if (a.op === 'buff') {
      bumped = true;
      return { ...e, action: { ...a, power: bump(a.power), health: bump(a.health) } };
    }
    return e;
  });
  return bumped ? { ...base, effects } : { ...base, cost: Math.max(0, card.cost - 1) };
}

const BASE_CARDS: readonly CardDef[] = CardListSchema.parse(cardsJson);
const baseById = new Map(BASE_CARDS.map((c) => [c.id, c]));

function withText(card: CardDef): CardDef {
  const text = cardText(card, {
    tokenName: (id) => {
      const t = baseById.get(id);
      if (!t) throw new Error(`Unknown token: ${id}`);
      return { name: t.name, power: t.power ?? 0, health: t.health ?? 1 };
    },
  });
  return { ...card, text };
}

/** Base cards (as written in cards.json). Upgraded versions are looked up with `getCard('<id>+')`. */
export const CARDS: readonly CardDef[] = BASE_CARDS;
const UPGRADES: readonly CardDef[] = BASE_CARDS.filter((c) => !c.token).map((c) => withText(upgradeCard(c)));
const cardById = new Map([...CARDS, ...UPGRADES].map((c) => [c.id, c]));

export function getCard(id: string): CardDef {
  const card = cardById.get(id);
  if (!card) throw new Error(`Unknown card: ${id}`);
  return card;
}

export function hasCard(id: string): boolean {
  return cardById.has(id);
}

export function isUpgraded(id: string): boolean {
  return id.endsWith(UPGRADED);
}

/** The base card id of a possibly upgraded id. */
export function baseId(id: string): string {
  return isUpgraded(id) ? id.slice(0, -UPGRADED.length) : id;
}

/** Rules text generated from the card's data (cards.json `text` must match it). */
export function generatedText(card: CardDef): string {
  return withText(card).text;
}

/** Collectible (non-token) cards. */
export function collectibleCards(): CardDef[] {
  return CARDS.filter((c) => !c.token);
}
