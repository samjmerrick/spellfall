import type { Difficulty } from '../../ai/next';
import { PREBUILT_DECKS } from '../../rules';
import { useApp } from '../app';
import { useDuel } from '../duel/store';
import { ScreenFrame } from './common';
import { DeckTile } from './DeckTile';

const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Hard' },
];

/**
 * Quick Play on Spellfall's rules. Until the deck builder moves to the new cards (V3), only the pre-built
 * decks can be picked.
 */
export function QuickPlayScreen() {
  const profile = useApp((s) => s.profile);
  const qp = useApp((s) => s.quickPlay);
  const setQp = useApp((s) => s.setQuickPlay);
  const start = useDuel((s) => s.start);
  const decks = PREBUILT_DECKS;
  const chosen = decks.find((d) => d.id === qp.deckId) ?? decks[0]!;
  return (
    <ScreenFrame
      title="Quick Play"
      footer={
        <button type="button" className="primary wide" onClick={() => void start(chosen, qp.difficulty)}>
          Start match
        </button>
      }
    >
      <h2 className="label">Your deck</h2>
      <div className="list" role="radiogroup" aria-label="Your deck">
        {decks.map((d) => {
          const rec = profile.stats.quickPlay[d.id];
          return (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={d.id === chosen.id}
              className={`list__row${d.id === chosen.id ? ' list__row--on' : ''}`}
              onClick={() => setQp({ deckId: d.id })}
            >
              <DeckTile
                name={d.name}
                cover={d.cover}
                cards={d.cards}
                sub={rec ? `won ${rec.won} of ${rec.played}` : 'Pre-built'}
              />
            </button>
          );
        })}
      </div>
      <h2 className="label">Opponent</h2>
      <div className="segmented" role="radiogroup" aria-label="AI difficulty">
        {DIFFICULTIES.map((d) => (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={qp.difficulty === d.id}
            className={qp.difficulty === d.id ? 'segmented--on' : ''}
            onClick={() => setQp({ difficulty: d.id })}
          >
            {d.label}
          </button>
        ))}
      </div>
    </ScreenFrame>
  );
}
