import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { canAttack, getCard, HIDDEN, viewFor, type PlayerId } from '../../rules';
import { artUrl } from '../art';
import { FADE_SECONDS, useDurationScale } from '../motion';
import { useReduceMotion } from '../useReduceMotion';
import { DuelCard, UnitFace } from './Card';
import { PATHS } from '../keywordPaths';
import { AI, HUMAN, useDuel, type Fx } from './store';
import { type Source, type Input, targetedKeys } from './input';

export function FxLayer({ fx }: { fx: Fx[] }) {
  const reduce = useReduceMotion();
  const scale = useDurationScale();
  return (
    <AnimatePresence>
      {fx.map((f) => (
        <motion.span
          key={f.id}
          className={`fx fx--${f.kind === 'shield' ? 'heal' : f.kind}`}
          initial={{ opacity: 0, y: 0 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: -16 }}
          exit={{ opacity: 0 }}
          transition={{ duration: (reduce ? FADE_SECONDS : 0.3) * scale }}
        >
          {f.kind === 'damage' ? `−${f.amount}` : f.kind === 'heal' ? `+${f.amount}` : '◌'}
        </motion.span>
      ))}
    </AnimatePresence>
  );
}

/**
 * The top of the screen: leave, the opponent's hand as card backs peeking from the top edge (faces only for
 * cards you are allowed to see), and the opponent's mana and deck.
 */
export function OpponentTop() {
  const game = useDuel((s) => s.game)!;
  const leave = useDuel((s) => s.leave);
  const p = game.players[AI];
  // Read through your own view, so only what you may know is shown.
  const hand = useMemo(() => viewFor(game, HUMAN).players[AI].hand, [game]);
  const gaps = Math.max(1, hand.length - 1);
  return (
    <div className="opp-top" data-zone="opponent-bar">
      <button type="button" className="icon-button" aria-label="Leave match" onClick={leave}>
        ✕
      </button>
      <div className="opp-hand" aria-label={`Opponent hand, ${hand.length} cards`}>
        {hand.map((c, i) => {
          const offset = i - (hand.length - 1) / 2;
          return (
            <span
              key={c.uid}
              className="opp-hand__card"
              style={
                {
                  '--offset': offset,
                  '--abs-offset': Math.abs(offset),
                  '--gaps': gaps,
                } as React.CSSProperties
              }
            >
              {c.cardId === HIDDEN ? <span className="card-back" /> : <DuelCard cardId={c.cardId} />}
            </span>
          );
        })}
      </div>
      <div className="opp-top__stats">
        <span className="duel-bar__mana" aria-label={`Opponent mana ${p.mana} of ${p.maxMana}`}>
          ◆ {p.mana}/{p.maxMana}
        </span>
        <span className="duel-bar__stat" aria-label="Opponent deck">
          ▤ {p.deck.length}
        </span>
      </div>
    </div>
  );
}

export function HeroBar() {
  const game = useDuel((s) => s.game)!;
  const busy = useDuel((s) => s.busy);
  const pass = useDuel((s) => s.pass);
  const p = game.players[HUMAN];
  let label = "Opponent's turn";
  let enabled = false;
  if (game.phase === 'main' && game.priority === HUMAN && !busy && !game.pending?.length) {
    enabled = true;
    label = game.stack.length > 0 ? 'Resolve' : 'End Turn';
  } else if (busy && game.priority === HUMAN) label = '…';
  return (
    <div className="duel-bar duel-bar--player" data-zone="player-bar">
      <span className="duel-bar__mana" aria-label={`Mana ${p.mana} of ${p.maxMana}`}>
        ◆ {p.mana}/{p.maxMana}
      </span>
      <span className="duel-bar__stat" aria-label="Your deck">
        ▤ {p.deck.length}
      </span>
      {game.phase !== 'mulligan' && game.phase !== 'over' && (
        <button
          type="button"
          className={`end-turn${label === 'Resolve' ? ' end-turn--resolve' : ''}`}
          disabled={!enabled}
          onClick={() => void pass()}
        >
          {label}
        </button>
      )}
    </div>
  );
}

/** One side of the board: the unit row, and the hero's slot at its right (the target for attacks on the hero). */
export function BoardSide({ side, input }: { side: PlayerId; input: Input }) {
  return (
    <div className={`duel-side duel-side--${side === HUMAN ? 'player' : 'opponent'}`}>
      <BoardRow side={side} input={input} />
      <HeroSlot side={side} input={input} />
    </div>
  );
}

export function BoardRow({ side, input }: { side: PlayerId; input: Input }) {
  const game = useDuel((s) => s.game)!;
  const attacking = useDuel((s) => s.attacking);
  const dying = useDuel((s) => s.dying);
  const fx = useDuel((s) => s.fx);
  const showDetail = useDuel((s) => s.showDetail);
  const units = game.boards[side];
  const targeted = targetedKeys(game.stack);
  const boardValid = side === HUMAN && input.valid.has('board');
  return (
    <div
      className={`duel-row duel-row--${side === HUMAN ? 'player' : 'opponent'}${boardValid ? ' drop--valid' : ''}`}
      data-row={side}
      data-zone={`${side === HUMAN ? 'player' : 'opponent'}-board`}
      data-drop={side === HUMAN ? 'board' : undefined}
      aria-label={side === HUMAN ? 'Your board' : 'Opponent board'}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-unit]')) return;
        if (side === HUMAN) input.tapTarget('board', e.clientX);
      }}
    >
      {units.map((u) => {
        const key = `unit:${u.uid}`;
        const src: Source = { kind: 'unit', uid: u.uid };
        const ready = side === HUMAN && input.legal.some((a) => a.type === 'attack' && a.attacker === u.uid);
        const picked = input.active?.kind === 'unit' && input.active.uid === u.uid;
        const card = getCard(u.cardId);
        // Whether it can attack comes from the engine. Only the side whose turn it is has units that sleep.
        const sleeping = u.owner === game.activePlayer && !canAttack(game, u);
        const unitFx = fx.filter((f) => 'unit' in f.target && f.target.unit === u.uid);
        return (
          <button
            key={u.uid}
            type="button"
            data-unit={u.uid}
            data-ref={key}
            data-drop={input.valid.has(key) || (boardValid && side === HUMAN) ? key : undefined}
            data-source={ready ? 'unit' : undefined}
            className={[
              'unit',
              `faction-${card.faction}`,
              card.rarity === 'legendary' ? 'unit--legendary' : '',
              u.keywords.includes('guard') ? 'unit--guard' : '',
              u.barrier ? 'unit--barrier' : '',
              ready ? 'unit--ready' : '',
              picked ? 'unit--picked' : '',
              attacking === u.uid ? `unit--attacking unit--attacking-${side}` : '',
              input.valid.has(key) ? 'drop--valid' : '',
              targeted.has(key) ? 'targeted' : '',
              sleeping ? 'unit--sleeping' : '',
              canAttack(game, u) ? '' : 'unit--spent',
              unitFx.some((f) => f.kind === 'damage') ? 'unit--hit' : '',
              dying.includes(u.uid) ? 'unit--dying' : '',
            ].join(' ')}
            aria-label={`${side === HUMAN ? 'Your' : 'Enemy'} ${card.name}`}
            onPointerDown={(e) => {
              input.startHold(e, u.cardId);
              if (ready) input.startDrag(e, src);
            }}
            onContextMenu={(e) => e.preventDefault()}
            onClick={(e) => {
              if (input.consumeHold()) return;
              if (input.tapTarget(key, e.clientX)) return;
              if (boardValid && input.tapTarget('board', e.clientX)) return;
              if (ready) input.tapSource(src);
              else showDetail(u.cardId);
            }}
          >
            <UnitFace s={game} unit={u} />
            {sleeping && (
              <span className="unit__zz" aria-label="Cannot attack now">
                Zz
              </span>
            )}
            {u.keywords.includes('guard') && (
              <span className="unit__guard" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  {PATHS.guard}
                </svg>
              </span>
            )}
            <FxLayer fx={unitFx} />
          </button>
        );
      })}
    </div>
  );
}

/** A hero at the right end of its board row: portrait art and HP, and the drop zone for attacks and spells. */
export function HeroSlot({ side, input }: { side: PlayerId; input: Input }) {
  const game = useDuel((s) => s.game)!;
  const art = useDuel((s) => s.heroArt[side]);
  const fx = useDuel((s) => s.fx).filter((f) => 'hero' in f.target && f.target.hero === side);
  const key = `hero:${side}`;
  const p = game.players[side];
  const lost = game.result && game.result.winner !== side;
  const url = art ? artUrl(art) : undefined;
  return (
    <button
      type="button"
      className={[
        'hero-slot',
        `hero-slot--${side === HUMAN ? 'player' : 'opponent'}`,
        input.valid.has(key) ? 'drop--valid' : '',
        targetedKeys(game.stack).has(key) ? 'targeted' : '',
        fx.some((f) => f.kind === 'damage') ? 'hero-slot--hit' : '',
        lost ? 'hero-slot--defeated' : '',
      ].join(' ')}
      data-drop={key}
      data-ref={key}
      aria-label={`${side === HUMAN ? 'Your' : 'Opponent'} hero, ${p.hp} HP`}
      onClick={(e) => input.tapTarget(key, e.clientX)}
    >
      <span className="hero-slot__art" aria-hidden="true">
        {url ? <img src={url} alt="" draggable={false} /> : <span className="hero-slot__glyph">♛</span>}
      </span>
      <span className="hero-slot__hp">{p.hp}</span>
      <FxLayer fx={fx} />
    </button>
  );
}
