import { getCard, type GameState } from '../../rules';
import { DuelCard } from './Card';
import { glossaryTerms } from './glossary';
import { HUMAN, useDuel } from './store';
import { type Source, aboveHand, type Drag, type Input } from './input';
import { Orb } from './Stack';

export function HandRow({ input, dragging }: { input: Input; dragging: Source | null }) {
  const game = useDuel((s) => s.game)!;
  const pick = useDuel((s) => s.pick);
  const showDetail = useDuel((s) => s.showDetail);
  const hand = game.players[HUMAN].hand;
  const gaps = Math.max(1, hand.length - 1);
  return (
    <div className="hand" aria-label="Your hand" data-zone="hand">
      {hand.map((c, i) => {
        const src: Source = { kind: 'card', uid: c.uid };
        const playable = input.legal.some((a) => 'uid' in a && a.uid === c.uid);
        const picked =
          input.active && 'uid' in input.active && input.active.uid === c.uid && input.active.kind !== 'unit';
        // A spell waiting on the stack for its targets has left the hand, for now.
        const onStack = pick?.kind === 'spellTargets' && pick.uid === c.uid;
        const offset = i - (hand.length - 1) / 2;
        return (
          <button
            key={c.uid}
            type="button"
            data-source={playable ? 'card' : undefined}
            className={`hand__slot${playable ? ' hand__slot--playable' : ''}${picked && !onStack ? ' hand__slot--picked' : ''}${dragging?.uid === c.uid || onStack ? ' hand__slot--dragging' : ''}`}
            style={
              {
                '--offset': offset,
                '--abs-offset': Math.abs(offset),
                '--gaps': gaps,
                zIndex: i,
              } as React.CSSProperties
            }
            aria-label={getCard(c.cardId).name}
            onPointerDown={(e) => {
              input.startHold(e, c.cardId);
              if (playable) input.startDrag(e, src);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              // Right-click opens the detail; the long-press context menu of a touch screen does not.
              if (!input.held()) showDetail(c.cardId);
            }}
            onClick={() => {
              if (input.consumeHold()) return;
              if (playable) input.tapSource(src);
              else showDetail(c.cardId);
            }}
          >
            <DuelCard cardId={c.cardId} />
          </button>
        );
      })}
    </div>
  );
}

/** The enlarged card shown while a card, unit or stack item is held. It ignores pointer events, so releasing closes it. */
export function HoldReader({ cardId }: { cardId: string }) {
  const card = getCard(cardId);
  return (
    <div
      className="overlay overlay--detail overlay--hold"
      role="dialog"
      aria-label={`${card.name} (reading)`}
    >
      <DuelCard cardId={cardId} size="large" />
      <dl className="glossary">
        {glossaryTerms(card.keywords, card.text, card.speed).map(([term, def]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{def}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function DragGhost({ drag, game }: { drag: Drag; game: GameState }) {
  if (drag.src.kind === 'unit') {
    return (
      <svg className="drag-arrow" aria-hidden="true">
        <line x1={drag.x0} y1={drag.y0} x2={drag.x} y2={drag.y} />
        <circle cx={drag.x} cy={drag.y} r="8" />
      </svg>
    );
  }
  const card = game.players[HUMAN].hand.find((c) => c.uid === drag.src.uid);
  if (!card) return null;
  // A spell over the field shrinks to the round token it becomes on the stack.
  if (getCard(card.cardId).type === 'spell' && aboveHand(drag.y)) {
    return (
      <div className="drag-ghost drag-ghost--orb" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
        <span className="stack-item stack-item--player stack-item--pending">
          <Orb cardId={card.cardId} />
        </span>
      </div>
    );
  }
  return (
    <div className="drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
      <DuelCard cardId={card.cardId} />
    </div>
  );
}
