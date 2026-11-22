// Quick Play deck rules and deck share codes. Pure; no storage.
import { CARDS, getCard } from './content';
import type { Faction } from './schema';

export const DECK_SIZE = 30;
export const MAX_FACTIONS = 2;
export const MAX_COPIES = 3;
export const MAX_LEGENDARY_COPIES = 1;

export interface DeckProblem {
  rule: 'size' | 'factions' | 'copies' | 'legendary' | 'unknown' | 'token' | 'locked';
  message: string;
}

export function deckFactions(cards: readonly string[]): Faction[] {
  const out: Faction[] = [];
  for (const id of cards) {
    const card = CARDS.find((c) => c.id === id);
    if (card && !out.includes(card.faction)) out.push(card.faction);
  }
  return out;
}

export function countCopies(cards: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

/** Highest number of copies of `id` a deck may hold. */
export function copyLimit(id: string): number {
  return getCard(id).rarity === 'legendary' ? MAX_LEGENDARY_COPIES : MAX_COPIES;
}

/**
 * Every rule the deck breaks, most important first; empty means legal.
 * `owned` limits the deck to cards the player has unlocked (omit to skip that check).
 */
export function deckProblems(cards: readonly string[], owned?: ReadonlySet<string>): DeckProblem[] {
  const problems: DeckProblem[] = [];
  const known = new Map(CARDS.map((c) => [c.id, c]));
  for (const id of new Set(cards)) {
    const card = known.get(id);
    if (!card) problems.push({ rule: 'unknown', message: `Unknown card: ${id}` });
    else if (card.token) problems.push({ rule: 'token', message: `${card.name} cannot be put in a deck` });
    else if (owned && !owned.has(id)) problems.push({ rule: 'locked', message: `${card.name} is locked` });
  }
  if (cards.length !== DECK_SIZE) {
    problems.push({
      rule: 'size',
      message: `A deck needs exactly ${DECK_SIZE} cards (it has ${cards.length})`,
    });
  }
  const factions = deckFactions(cards);
  if (factions.length > MAX_FACTIONS) {
    problems.push({
      rule: 'factions',
      message: `A deck can use at most ${MAX_FACTIONS} factions (it uses ${factions.length})`,
    });
  }
  for (const [id, n] of countCopies(cards)) {
    const card = known.get(id);
    if (!card) continue;
    if (card.rarity === 'legendary' && n > MAX_LEGENDARY_COPIES) {
      problems.push({ rule: 'legendary', message: `Only 1 copy of a Legendary card: ${card.name}` });
    } else if (n > MAX_COPIES) {
      problems.push({ rule: 'copies', message: `At most ${MAX_COPIES} copies of ${card.name}` });
    }
  }
  return problems;
}

export function isDeckLegal(cards: readonly string[], owned?: ReadonlySet<string>): boolean {
  return deckProblems(cards, owned).length === 0;
}

/** Whether one more copy of `id` can be added without breaking a rule (size, factions, copies). */
export function canAddCard(cards: readonly string[], id: string): boolean {
  if (cards.length >= DECK_SIZE) return false;
  const card = getCard(id);
  if (card.token) return false;
  if ((countCopies(cards).get(id) ?? 0) >= copyLimit(id)) return false;
  const factions = deckFactions(cards);
  return factions.includes(card.faction) || factions.length < MAX_FACTIONS;
}

/** Cards in display order: by cost, then name. */
export function sortCards(cards: readonly string[]): string[] {
  return [...cards].sort((a, b) => {
    const ca = getCard(a);
    const cb = getCard(b);
    return ca.cost - cb.cost || ca.name.localeCompare(cb.name) || a.localeCompare(b);
  });
}

// ---------- Share codes ----------
// Format: "SD1-" + base64url of bytes [cardIndex, count, cardIndex, count, ...], where cardIndex is the
// card's position in the collectible card list. Card order in content must therefore only ever be appended to.

const CODE_PREFIX = 'SD1-';

function collectibleIds(): string[] {
  return CARDS.filter((c) => !c.token).map((c) => c.id);
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

export function encodeDeck(cards: readonly string[]): string {
  const ids = collectibleIds();
  const bytes: number[] = [];
  for (const [id, n] of [...countCopies(cards)].sort(([a], [b]) => ids.indexOf(a) - ids.indexOf(b))) {
    const index = ids.indexOf(id);
    if (index < 0 || index > 255 || n > 255) throw new Error(`Cannot encode card ${id}`);
    bytes.push(index, n);
  }
  return CODE_PREFIX + toBase64Url(Uint8Array.from(bytes));
}

/** Decodes a share code; throws an Error with a readable message if it is not valid. */
export function decodeDeck(code: string): string[] {
  const trimmed = code.trim();
  if (!trimmed.startsWith(CODE_PREFIX)) throw new Error('That is not a Spellfall deck code');
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(trimmed.slice(CODE_PREFIX.length));
  } catch {
    throw new Error('The deck code is damaged');
  }
  if (bytes.length === 0 || bytes.length % 2 !== 0) throw new Error('The deck code is damaged');
  const ids = collectibleIds();
  const cards: string[] = [];
  for (let i = 0; i < bytes.length; i += 2) {
    const id = ids[bytes[i]!];
    if (!id) throw new Error('The deck code names a card that does not exist');
    for (let n = 0; n < bytes[i + 1]!; n++) cards.push(id);
  }
  return sortCards(cards);
}
