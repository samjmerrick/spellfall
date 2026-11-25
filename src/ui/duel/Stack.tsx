import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getCard, type GameState, type StackItem, type TargetRef } from '../../rules';
import { CardArt } from '../CardView';
import { DuelCard } from './Card';
import { HUMAN, useDuel } from './store';
import { refKey, type Input } from './input';

function stackLabel(s: GameState, item: StackItem): string {
  const target = (t: TargetRef): string => {
    if (t.kind === 'hero') return t.player === HUMAN ? 'you' : 'opponent';
    if (t.kind === 'stack') return 'a spell';
    const u = s.boards[0].find((x) => x.uid === t.uid) ?? s.boards[1].find((x) => x.uid === t.uid);
    return u ? getCard(u.cardId).name : 'a unit';
  };
  if (item.kind === 'attack') {
    const a = s.boards[item.owner].find((x) => x.uid === item.attacker);
    return `${a ? getCard(a.cardId).name : 'Attack'} → ${target(item.target)}`;
  }
  const name = getCard(item.cardId).name;
  if (item.targets === null) return `${name}: choosing a target`;
  return item.targets.length ? `${name} → ${item.targets.map(target).join(', ')}` : name;
}

/** A stack item as a round token with its card art (an attack shows the attacker, with a sword badge). */
export function Orb({ cardId, attack }: { cardId: string; attack?: boolean }) {
  const card = getCard(cardId);
  return (
    <>
      <span className={`orb__art faction-${card.faction}`}>
        <CardArt id={card.id} faction={card.faction} />
      </span>
      {attack && (
        <span className="orb__badge" aria-hidden="true">
          ⚔
        </span>
      )}
    </>
  );
}

export function StackStrip({ prompt, input }: { prompt: string | null; input: Input }) {
  const game = useDuel((s) => s.game)!;
  const banner = useDuel((s) => s.banner);
  const pick = useDuel((s) => s.pick);
  const setPick = useDuel((s) => s.setPick);
  const showDetail = useDuel((s) => s.showDetail);
  const resolving = useDuel((s) => s.resolving);
  const yourTurn = game.activePlayer === HUMAN;
  // Always derived from the current state: the stack, else whose turn it is and who has priority.
  const turnText =
    game.phase === 'over'
      ? 'Match over'
      : game.priority === HUMAN
        ? yourTurn
          ? 'Your turn'
          : 'Your response'
        : yourTurn
          ? 'Opponent responds'
          : "Opponent's turn";
  const pending =
    pick?.kind === 'spellTargets' ? game.players[HUMAN].hand.find((c) => c.uid === pick.uid) : undefined;
  const hasItems = game.stack.length > 0 || pending;
  return (
    <div className="stack-strip" aria-label="Stack" aria-live="polite" data-zone="stack">
      <div className="stack-strip__body">
        {hasItems && (
          <ol className="stack-strip__items">
            {game.stack.map((item, i) => {
              const key = `stack:${item.id}`;
              const cardId =
                item.kind === 'attack'
                  ? game.boards[item.owner].find((u) => u.uid === item.attacker)?.cardId
                  : item.cardId;
              return (
                <li
                  key={item.id}
                  className={[
                    'stack-item',
                    `stack-item--${item.owner === HUMAN ? 'player' : 'opponent'}`,
                    i === game.stack.length - 1 && !pending ? 'stack-item--top' : '',
                    input.valid.has(key) ? 'drop--valid' : '',
                    resolving === item.id ? 'stack-item--resolving' : '',
                    item.kind === 'ability' && item.targets === null ? 'stack-item--pending' : '',
                  ].join(' ')}
                  data-drop={key}
                  data-ref={key}
                  data-orb={item.id}
                  aria-label={stackLabel(game, item)}
                  onPointerDown={(e) => cardId && input.startHold(e, cardId)}
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={(e) => {
                    if (input.consumeHold()) return;
                    if (input.tapTarget(key, e.clientX)) return;
                    if (item.kind !== 'attack') showDetail(item.cardId);
                  }}
                >
                  {cardId ? <Orb cardId={cardId} attack={item.kind === 'attack'} /> : '⚔'}
                </li>
              );
            })}
            {pending && (
              <li
                className="stack-item stack-item--player stack-item--pending"
                data-orb="pending"
                data-source="pending"
                aria-label={`${getCard(pending.cardId).name}: choose a target (tap to cancel)`}
                onClick={() => setPick(null)}
              >
                <Orb cardId={pending.cardId} />
              </li>
            )}
          </ol>
        )}
        {!hasItems && <p className="stack-strip__turn">{prompt ?? banner?.text ?? turnText}</p>}
        {hasItems && <p className="stack-strip__prompt">{prompt ?? banner?.text ?? turnText}</p>}
      </div>
    </div>
  );
}

export interface Line {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  owner: 'player' | 'opponent' | 'pending';
}

/**
 * Connectors from each stack item (and a spell waiting for targets) to what it targets, measured from the
 * DOM every frame while there is something to connect, so they follow units as they move.
 */
export function Connectors() {
  const game = useDuel((s) => s.game)!;
  const pick = useDuel((s) => s.pick);
  const [lines, setLines] = useState<Line[]>([]);
  const ref = useRef<SVGSVGElement>(null);
  const links = useMemo(() => {
    const out: { id: string; from: string; to: string; owner: Line['owner'] }[] = [];
    for (const item of game.stack) {
      const owner = item.owner === HUMAN ? 'player' : 'opponent';
      const targets = item.kind === 'attack' ? [item.target] : (item.targets ?? []);
      targets.forEach((t, i) =>
        out.push({ id: `${item.id}-${i}`, from: String(item.id), to: refKey(t), owner }),
      );
    }
    const waiting = game.stack.find((i) => i.kind === 'ability' && i.targets === null);
    if (pick?.kind === 'abilityTargets' && waiting)
      pick.chosen.forEach((t, i) =>
        out.push({ id: `a-${i}`, from: String(waiting.id), to: refKey(t), owner: 'pending' }),
      );
    if (pick?.kind === 'spellTargets')
      pick.chosen.forEach((t, i) =>
        out.push({ id: `p-${i}`, from: 'pending', to: refKey(t), owner: 'pending' }),
      );
    return out;
  }, [game, pick]);

  useLayoutEffect(() => {
    if (links.length === 0) return;
    let frame = 0;
    let last = '';
    const measure = () => {
      const root = ref.current?.getBoundingClientRect();
      if (root) {
        const next: Line[] = [];
        for (const l of links) {
          const a = document.querySelector(`[data-orb="${l.from}"]`)?.getBoundingClientRect();
          const b = document.querySelector(`[data-ref="${l.to}"]`)?.getBoundingClientRect();
          if (!a || !b) continue;
          // From the token's centre to the near edge of the target, so the target's numbers stay readable.
          const y1 = a.top + a.height / 2;
          const below = b.top + b.height / 2 > y1;
          next.push({
            id: l.id,
            owner: l.owner,
            x1: a.left + a.width / 2 - root.left,
            y1: y1 - root.top,
            x2: b.left + b.width / 2 - root.left,
            y2: (below ? b.top - 2 : b.bottom + 10) - root.top,
          });
        }
        const key = JSON.stringify(next);
        if (key !== last) {
          last = key;
          setLines(next);
        }
      }
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [links]);

  return (
    <svg className="connectors" ref={ref} aria-hidden="true">
      {(links.length > 0 ? lines : []).map((l) => {
        // A curve that bows sideways, so lines to targets straight above or below stay visible.
        const mx = (l.x1 + l.x2) / 2 + (l.y2 - l.y1) * 0.25;
        const my = (l.y1 + l.y2) / 2 - Math.abs(l.x2 - l.x1) * 0.15;
        return (
          <g key={l.id} className={`connector connector--${l.owner}`}>
            <path d={`M${l.x1},${l.y1} Q${mx},${my} ${l.x2},${l.y2}`} />
            <circle cx={l.x2} cy={l.y2} r="5" />
          </g>
        );
      })}
    </svg>
  );
}

/** The opponent's card, shown enlarged for a moment as it is played. */
export function PlayReveal() {
  const reveal = useDuel((s) => s.reveal);
  if (!reveal) return null;
  return (
    <div
      key={reveal.id}
      className="play-reveal"
      aria-live="polite"
      aria-label={`Opponent plays ${getCard(reveal.cardId).name}`}
    >
      <DuelCard cardId={reveal.cardId} />
    </div>
  );
}
