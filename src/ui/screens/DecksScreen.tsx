import { useState } from 'react';
import { decodeDeck, PREBUILT_DECKS } from '../../engine';
import { MAX_SAVED_DECKS } from '../../save';
import { useApp } from '../app';
import { ScreenFrame } from './common';
import { DeckTile } from './DeckTile';

export function DecksScreen() {
  const profile = useApp((s) => s.profile);
  const newDraft = useApp((s) => s.newDraft);
  const editDeck = useApp((s) => s.editDeck);
  const deleteDeck = useApp((s) => s.deleteDeck);
  const setDraft = useApp((s) => s.setDraft);
  const go = useApp((s) => s.go);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const full = profile.decks.length >= MAX_SAVED_DECKS;

  const importCode = () => {
    try {
      const cards = decodeDeck(code);
      setDraft({ id: null, name: 'Imported deck', cover: cards[0] ?? null, cards });
      setCode('');
      setError(null);
      go('builder');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <ScreenFrame title="Decks">
      <h2 className="label">
        Your decks · {profile.decks.length}/{MAX_SAVED_DECKS}
      </h2>
      <div className="list">
        {profile.decks.map((d) => (
          <div key={d.id} className="list__row list__row--split">
            <button
              type="button"
              className="list__main"
              onClick={() => editDeck(d.id)}
              aria-label={`Edit ${d.name}`}
            >
              <DeckTile name={d.name} cover={d.cover} cards={d.cards} />
            </button>
            {confirmDelete === d.id ? (
              <button type="button" className="danger" onClick={() => deleteDeck(d.id)}>
                Delete?
              </button>
            ) : (
              <button
                type="button"
                className="icon-button"
                aria-label={`Delete ${d.name}`}
                onClick={() => setConfirmDelete(d.id)}
              >
                🗑
              </button>
            )}
          </div>
        ))}
        {profile.decks.length === 0 && (
          <p className="empty">No decks yet. Build one, or copy a pre-built deck.</p>
        )}
      </div>
      <button type="button" className="primary wide" disabled={full} onClick={() => newDraft()}>
        New deck
      </button>
      {full && <p className="hint">You have {MAX_SAVED_DECKS} decks. Delete one to make room.</p>}

      <h2 className="label">Pre-built</h2>
      <div className="list">
        {PREBUILT_DECKS.map((d) => (
          <div key={d.id} className="list__row list__row--split">
            <span className="list__main">
              <DeckTile name={d.name} cover={d.cover} cards={d.cards} sub="Pre-built" />
            </span>
            <button
              type="button"
              className="secondary small"
              disabled={full}
              aria-label={`Copy ${d.name}`}
              onClick={() => newDraft({ ...d, prebuilt: true })}
            >
              Copy
            </button>
          </div>
        ))}
      </div>

      <h2 className="label">Import a deck code</h2>
      <div className="import">
        <input
          className="code"
          placeholder="SD1-…"
          aria-label="Deck code to import"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button
          type="button"
          className="secondary small"
          disabled={!code.trim() || full}
          onClick={importCode}
        >
          Import
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </ScreenFrame>
  );
}
