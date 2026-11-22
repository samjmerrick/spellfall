import { useState } from 'react';
import {
  canAddCard,
  copyLimit,
  countCopies,
  deckFactions,
  deckProblems,
  DECK_SIZE,
  encodeDeck,
  getCard,
  sortCards,
} from '../../rules';
import { MAX_DECK_NAME } from '../../save';
import { useApp } from '../app';
import { CardArt } from '../CardView';
import { GLYPHS } from '../factions';
import { CardBrowser } from './CardBrowser';
import { ScreenFrame } from './common';

function ManaCurve({ cards }: { cards: string[] }) {
  const buckets = Array.from({ length: 8 }, () => 0);
  for (const id of cards) buckets[Math.min(8, getCard(id).cost) - 1]! += 1;
  const max = Math.max(1, ...buckets);
  return (
    <span className="curve" role="img" aria-label={`Mana curve: ${buckets.join(', ')}`}>
      {buckets.map((n, i) => (
        <span
          key={i}
          className="curve__bar"
          style={{ height: `${(n / max) * 100}%` }}
          title={`${i + 1}: ${n}`}
        />
      ))}
    </span>
  );
}

export function DeckBuilderScreen() {
  const draft = useApp((s) => s.draft);
  const setDraft = useApp((s) => s.setDraft);
  const saveDraft = useApp((s) => s.saveDraft);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  if (!draft) return null;

  const counts = countCopies(draft.cards);
  const problems = deckProblems(draft.cards);
  const factions = deckFactions(draft.cards);

  const add = (id: string) => {
    if (!canAddCard(draft.cards, id)) {
      const reason =
        draft.cards.length >= DECK_SIZE
          ? `The deck already has ${DECK_SIZE} cards`
          : (counts.get(id) ?? 0) >= copyLimit(id)
            ? `At most ${copyLimit(id)} ${copyLimit(id) === 1 ? 'copy' : 'copies'} of ${getCard(id).name}`
            : 'A deck can use at most 2 factions';
      return setMessage(reason);
    }
    setMessage(null);
    setDraft({ ...draft, cards: sortCards([...draft.cards, id]) });
  };
  const remove = (id: string) => {
    const i = draft.cards.indexOf(id);
    if (i < 0) return;
    const cards = draft.cards.filter((_, j) => j !== i);
    setDraft({ ...draft, cards, cover: cards.includes(draft.cover ?? '') ? draft.cover : null });
  };
  const share = async () => {
    const c = encodeDeck(draft.cards);
    setCode(c);
    try {
      await navigator.clipboard.writeText(c);
    } catch {
      // Clipboard may be unavailable; the code is shown for manual copying.
    }
  };

  return (
    <ScreenFrame title="Deck builder" back="decks">
      <div className="builder">
        <input
          className="builder__name"
          aria-label="Deck name"
          maxLength={MAX_DECK_NAME}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <CardBrowser counts={counts} limitFor={copyLimit} onTap={add} />
      </div>
      <section className={`deck-strip${open ? ' deck-strip--open' : ''}`} aria-label="Deck">
        {message && (
          <p className="deck-strip__message" role="status">
            {message}
          </p>
        )}
        {open && (
          <div className="deck-list" aria-label="Deck list">
            {[...counts].map(([id, n]) => {
              const card = getCard(id);
              const isCover = draft.cover === id || (!draft.cover && draft.cards[0] === id);
              return (
                <div key={id} className="deck-list__row">
                  <span className="deck-list__cost">{card.cost}</span>
                  <button
                    type="button"
                    className="deck-list__name"
                    aria-label={`Remove one ${card.name}`}
                    onClick={() => remove(id)}
                  >
                    {card.name} ×{n}
                  </button>
                  <button
                    type="button"
                    className={`deck-list__cover${isCover ? ' deck-list__cover--on' : ''}`}
                    aria-label={`Use ${card.name} as cover`}
                    aria-pressed={isCover}
                    onClick={() => setDraft({ ...draft, cover: id })}
                  >
                    <CardArt id={id} faction={card.faction} />
                  </button>
                </div>
              );
            })}
            {draft.cards.length === 0 && <p className="empty">Tap cards above to add them.</p>}
            <button
              type="button"
              className="secondary"
              disabled={draft.cards.length === 0}
              onClick={() => void share()}
            >
              Copy deck code
            </button>
            {code && (
              <input
                className="code"
                readOnly
                value={code}
                aria-label="Deck code"
                onFocus={(e) => e.target.select()}
              />
            )}
          </div>
        )}
        <div className="deck-strip__bar">
          <button
            type="button"
            className="deck-strip__summary"
            aria-expanded={open}
            aria-label={`${draft.cards.length} of ${DECK_SIZE} cards. ${open ? 'Hide' : 'Show'} deck list`}
            onClick={() => setOpen(!open)}
          >
            <span
              className={`deck-strip__count${draft.cards.length === DECK_SIZE ? ' deck-strip__count--full' : ''}`}
            >
              {draft.cards.length}/{DECK_SIZE}
            </span>
            <span className="deck-strip__factions">{factions.map((f) => GLYPHS[f]).join(' ') || '—'}</span>
            <ManaCurve cards={draft.cards} />
          </button>
          <button
            type="button"
            className="primary deck-strip__save"
            disabled={problems.length > 0}
            onClick={() => saveDraft()}
          >
            Save
          </button>
        </div>
        {problems.length > 0 && <p className="deck-strip__problem">{problems[0]!.message}</p>}
      </section>
    </ScreenFrame>
  );
}
