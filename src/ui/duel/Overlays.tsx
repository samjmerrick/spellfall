import { useEffect } from 'react';
import { getCard } from '../../rules';
import { useApp } from '../app';
import { useRun } from '../runStore';
import { DuelCard } from './Card';
import { glossaryTerms } from './glossary';
import { HUMAN, useDuel } from './store';

export function MulliganOverlay() {
  const game = useDuel((s) => s.game)!;
  const chosen = useDuel((s) => s.mulligan);
  const toggle = useDuel((s) => s.toggleMulligan);
  const confirm = useDuel((s) => s.confirmMulligan);
  const busy = useDuel((s) => s.busy);
  if (game.phase !== 'mulligan' || game.players[HUMAN].mulliganed) return null;
  const first = game.firstPlayer === HUMAN;
  return (
    <div className="overlay" role="dialog" aria-label="Mulligan">
      <h2>Starting hand</h2>
      <p className="overlay__hint">
        {first ? 'You go first.' : 'You go second and get the Spark.'} Tap cards to replace them.
      </p>
      <div className="mulligan">
        {game.players[HUMAN].hand.map((c) => (
          <button
            key={c.uid}
            type="button"
            className={`mulligan__card${chosen.includes(c.uid) ? ' mulligan__card--out' : ''}`}
            aria-pressed={chosen.includes(c.uid)}
            aria-label={getCard(c.cardId).name}
            onClick={() => toggle(c.uid)}
          >
            <DuelCard cardId={c.cardId} />
          </button>
        ))}
      </div>
      <button type="button" className="primary" disabled={busy} onClick={() => void confirm()}>
        {chosen.length === 0 ? 'Keep hand' : `Replace ${chosen.length}`}
      </button>
    </div>
  );
}

export function ResultOverlay() {
  const game = useDuel((s) => s.game)!;
  const busy = useDuel((s) => s.busy);
  const deck = useDuel((s) => s.deck);
  const difficulty = useDuel((s) => s.difficulty);
  const start = useDuel((s) => s.start);
  const leave = useDuel((s) => s.leave);
  const mode = useDuel((s) => s.mode);
  const finishMatch = useRun((s) => s.finishMatch);
  const go = useApp((s) => s.go);
  if (!game.result || busy) return null;
  const { winner } = game.result;
  const title = winner === null ? 'Draw' : winner === HUMAN ? 'Victory' : 'Defeat';
  return (
    <div
      className={`overlay result result--${winner === null ? 'draw' : winner === HUMAN ? 'win' : 'loss'}`}
      role="dialog"
      aria-label="Match result"
    >
      <h2 className="result__title">{title}</h2>
      <p className="overlay__hint">
        {game.result.reason === 'turns' ? 'Turn 40 ended with both heroes standing.' : `Turn ${game.turn}`}
      </p>
      {mode === 'run' ? (
        <>
          <p className="result__xp">{winner === HUMAN ? 'The way ahead is clear' : 'You lose 1 Heart'}</p>
          <button type="button" className="primary" onClick={() => finishMatch(winner === HUMAN)}>
            Continue
          </button>
        </>
      ) : (
        <>
          {deck && (
            <button type="button" className="primary" onClick={() => void start(deck, difficulty)}>
              Play again
            </button>
          )}
          <button type="button" className="secondary" onClick={leave}>
            Quick Play
          </button>
          <button type="button" className="secondary" onClick={() => go('menu')}>
            Menu
          </button>
        </>
      )}
    </div>
  );
}

/** Rules text for a Spellfall card (match, collection and deck builder). Rendered once, by the App. */
export function DetailOverlay() {
  const cardId = useDuel((s) => s.detail);
  const close = useDuel((s) => s.showDetail);
  if (!cardId) return null;
  const card = getCard(cardId);
  return (
    <div className="overlay overlay--detail" role="dialog" aria-label={card.name} onClick={() => close(null)}>
      <DuelCard cardId={cardId} size="large" />
      <dl className="glossary">
        {glossaryTerms(card.keywords, card.text, card.speed).map(([term, def]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{def}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className="secondary" onClick={() => close(null)}>
        Close
      </button>
    </div>
  );
}

export function ErrorToast() {
  const error = useDuel((s) => s.error);
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => useDuel.setState({ error: null }), 2500);
    return () => clearTimeout(t);
  }, [error]);
  return error ? (
    <div className="toast" role="alert">
      {error}
    </div>
  ) : null;
}
