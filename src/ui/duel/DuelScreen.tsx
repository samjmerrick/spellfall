import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  canAttack,
  getCard,
  legalActions,
  sameTarget,
  SPELL_MANA_CAP,
  type Action,
  type GameState,
  type PlayerId,
  type StackItem,
  type TargetRef,
} from '../../rules';
import { useApp } from '../app';
import { useRun } from '../runStore';
import { FADE_SECONDS, useDurationScale } from '../motion';
import { useReduceMotion } from '../useReduceMotion';
import { DuelCard, UnitFace } from './Card';
import { glossaryTerms } from './glossary';
import { AI, HUMAN, useDuel, type Fx, type Pick } from './store';

// ---------- Drop keys: every place something can be dropped or tapped as a target ----------

/** `board` (your row), `cast` (anywhere on the field), `unit:<uid>`, `hero:<player>`, `stack:<id>`. */
type DropKey = string;

const refKey = (t: TargetRef): DropKey =>
  t.kind === 'unit' ? `unit:${t.uid}` : t.kind === 'hero' ? `hero:${t.player}` : `stack:${t.id}`;

function keyRef(key: DropKey): TargetRef | null {
  const [kind, v] = key.split(':');
  if (kind === 'unit') return { kind: 'unit', uid: Number(v) };
  if (kind === 'hero') return { kind: 'hero', player: Number(v) as PlayerId };
  if (kind === 'stack') return { kind: 'stack', id: Number(v) };
  return null;
}

type Source = { kind: 'card' | 'unit'; uid: number };

/** The legal actions that can still come from `pick` (or a fresh source), given the targets chosen so far. */
function actionsFor(legal: Action[], src: Pick | Source): Action[] {
  switch (src.kind) {
    case 'card':
      return legal.filter((a) => (a.type === 'playUnit' || a.type === 'castSpell') && a.uid === src.uid);
    case 'unit':
      return legal.filter((a) => a.type === 'attack' && a.attacker === src.uid);
    case 'placeTargets':
      return legal.filter(
        (a) =>
          a.type === 'playUnit' &&
          a.uid === src.uid &&
          a.position === src.position &&
          src.chosen.every((c, i) => a.targets[i] && sameTarget(a.targets[i]!, c)),
      );
    case 'spellTargets':
      return legal.filter(
        (a) =>
          a.type === 'castSpell' &&
          a.uid === src.uid &&
          src.chosen.every((c, i) => a.targets[i] && sameTarget(a.targets[i]!, c)),
      );
  }
}

/** Where the source can be dropped next. */
function dropKeys(legal: Action[], src: Pick | Source): Set<DropKey> {
  const out = new Set<DropKey>();
  for (const a of actionsFor(legal, src)) {
    if (a.type === 'attack') out.add(refKey(a.target));
    else if (src.kind === 'placeTargets') {
      const t = (a as { targets: TargetRef[] }).targets[src.chosen.length];
      if (t) out.add(refKey(t));
    } else if (src.kind === 'spellTargets') {
      const t = (a as { targets: TargetRef[] }).targets[src.chosen.length];
      if (t) out.add(refKey(t));
    } else if (a.type === 'playUnit') out.add('board');
    else if (a.type === 'castSpell') out.add(a.targets.length === 0 ? 'cast' : refKey(a.targets[0]!));
  }
  return out;
}

/** The insertion position in your row for a drop at screen x. */
function positionAt(x: number): number {
  const units = [...document.querySelectorAll<HTMLElement>('[data-row="0"] [data-unit]')];
  return units.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.left + r.width / 2 < x;
  }).length;
}

/** The drop key under a screen point, if any. */
function dropAt(x: number, y: number): DropKey | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
  return el?.dataset.drop ?? null;
}

// ---------- Screen ----------

interface Drag {
  src: Source;
  x0: number;
  y0: number;
  x: number;
  y: number;
  moved: boolean;
}

export function DuelScreen() {
  const game = useDuel((s) => s.game);
  const busy = useDuel((s) => s.busy);
  const pick = useDuel((s) => s.pick);
  const setPick = useDuel((s) => s.setPick);
  const perform = useDuel((s) => s.perform);
  const [drag, setDrag] = useState<Drag | null>(null);

  const legal = useMemo(
    () => (game && !busy && game.phase === 'main' && game.priority === HUMAN ? legalActions(game) : []),
    [game, busy],
  );
  const active: Pick | Source | null = drag?.moved ? drag.src : pick;
  const valid = useMemo(() => (active ? dropKeys(legal, active) : new Set<DropKey>()), [legal, active]);

  /** Completes (or advances) a choice by dropping `src` on `key` at screen x. */
  function choose(src: Pick | Source, key: DropKey, x: number) {
    const options = actionsFor(legal, src);
    if (src.kind === 'unit') {
      const ref = keyRef(key);
      const a = ref && options.find((o) => o.type === 'attack' && sameTarget(o.target, ref));
      if (a) void perform(a);
      else setPick(null);
      return;
    }
    if (src.kind === 'card') {
      const card = getCard(game!.players[HUMAN].hand.find((c) => c.uid === src.uid)!.cardId);
      if (card.type === 'unit') {
        if (key !== 'board' && !key.startsWith('unit:')) return setPick(null);
        const position = positionAt(x);
        const here = options.filter((o) => o.type === 'playUnit' && o.position === position);
        if (here.length === 0) return setPick(null);
        if (here.length === 1 && (here[0] as { targets: TargetRef[] }).targets.length === 0)
          return void perform(here[0]!);
        return setPick({ kind: 'placeTargets', uid: src.uid, position, chosen: [] });
      }
      if (key === 'cast') {
        const a = options.find((o) => o.type === 'castSpell' && o.targets.length === 0);
        return a ? void perform(a) : setPick(null);
      }
      return advance({ kind: 'spellTargets', uid: src.uid, chosen: [] }, key);
    }
    advance(src as Extract<Pick, { chosen: TargetRef[] }>, key);
  }

  /** Adds a chosen target; performs the action once every target is chosen. */
  function advance(src: Extract<Pick, { chosen: TargetRef[] }>, key: DropKey) {
    const ref = keyRef(key);
    if (!ref) return setPick(null);
    const next = { ...src, chosen: [...src.chosen, ref] };
    const options = actionsFor(legal, next);
    if (options.length === 0) return setPick(null);
    const done = options.find((o) => (o as { targets: TargetRef[] }).targets.length === next.chosen.length);
    if (done) return void perform(done);
    setPick(next);
  }

  // Pointer handling: a drag drops on release; a tap picks, and a later tap on a target completes.
  const dragRef = useRef<Drag | null>(null);
  const updateDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };
  useEffect(() => {
    function move(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const moved = d.moved || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 8;
      updateDrag({ ...d, x: e.clientX, y: e.clientY, moved });
    }
    function up(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      updateDrag(null);
      if (!d.moved) return; // A tap: handled by onClick.
      const key = dropAt(e.clientX, e.clientY);
      if (key) choose(d.src, key, e.clientX);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  });

  function startDrag(e: React.PointerEvent, src: Source) {
    if (actionsFor(legal, src).length === 0) return;
    updateDrag({ src, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false });
  }

  /** A tap on a source: pick it (or unpick). */
  function tapSource(src: Source) {
    if (pick && pick.kind === src.kind && pick.uid === src.uid) return setPick(null);
    if (actionsFor(legal, src).length === 0) return setPick(null);
    setPick(src);
  }

  /** A tap on a drop target while something is picked. Returns true if it was used. */
  function tapTarget(key: DropKey, x: number): boolean {
    if (!pick || !valid.has(key)) return false;
    choose(pick, key, x);
    return true;
  }

  if (!game) return null;
  const input = { legal, valid, active, startDrag, tapSource, tapTarget };
  const prompt =
    pick?.kind === 'placeTargets' || pick?.kind === 'spellTargets'
      ? 'Choose a target'
      : pick?.kind === 'unit'
        ? 'Choose what to attack'
        : null;

  return (
    <main
      className={`duel${drag?.moved ? ' duel--dragging' : ''}`}
      aria-label="Match"
      onClick={(e) => {
        // A tap on nothing in particular drops the current pick.
        if (!(e.target as HTMLElement).closest('[data-drop],[data-source],button')) setPick(null);
      }}
    >
      <HeroBar side={AI} input={input} />
      <div
        className={`duel__field${valid.has('cast') ? ' drop--valid' : ''}`}
        data-drop="cast"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-drop]') === e.currentTarget)
            tapTarget('cast', e.clientX);
        }}
      >
        <BoardRow side={AI} input={input} />
        <StackStrip prompt={prompt} />
        <BoardRow side={HUMAN} input={input} />
      </div>
      <HeroBar side={HUMAN} input={input} />
      <HandRow input={input} dragging={drag?.moved ? drag.src : null} />
      {drag?.moved && <DragGhost drag={drag} game={game} />}
      <MulliganOverlay />
      <ResultOverlay />
      <ErrorToast />
    </main>
  );
}

interface Input {
  legal: Action[];
  valid: Set<DropKey>;
  active: Pick | Source | null;
  startDrag(e: React.PointerEvent, src: Source): void;
  tapSource(src: Source): void;
  tapTarget(key: DropKey, x: number): boolean;
}

// ---------- Pieces ----------

function FxLayer({ fx }: { fx: Fx[] }) {
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

function targetedKeys(stack: StackItem[]): Set<DropKey> {
  const out = new Set<DropKey>();
  for (const i of stack) {
    if (i.kind === 'attack') out.add(refKey(i.target));
    else for (const t of i.targets) out.add(refKey(t));
  }
  return out;
}

function HeroBar({ side, input }: { side: PlayerId; input: Input }) {
  const game = useDuel((s) => s.game)!;
  const busy = useDuel((s) => s.busy);
  const pass = useDuel((s) => s.pass);
  const leave = useDuel((s) => s.leave);
  const fx = useDuel((s) => s.fx).filter((f) => 'hero' in f.target && f.target.hero === side);
  const p = game.players[side];
  const mine = side === HUMAN;
  const key = `hero:${side}`;
  const valid = input.valid.has(key);
  const targeted = targetedKeys(game.stack).has(key);
  let label = "Opponent's turn";
  let enabled = false;
  if (game.phase === 'main' && game.priority === HUMAN && !busy) {
    enabled = true;
    label = game.stack.length > 0 ? 'Resolve' : 'End Turn';
  } else if (busy && game.priority === HUMAN) label = '…';
  return (
    <div
      className={`duel-bar duel-bar--${mine ? 'player' : 'opponent'}`}
      data-zone={`${mine ? 'player' : 'opponent'}-bar`}
    >
      {!mine && (
        <button type="button" className="icon-button" aria-label="Leave match" onClick={leave}>
          ✕
        </button>
      )}
      <button
        type="button"
        className={`duel-bar__hero${valid ? ' drop--valid' : ''}${targeted ? ' targeted' : ''}`}
        data-drop={key}
        aria-label={`${mine ? 'Your' : 'Opponent'} hero, ${p.hp} HP`}
        onClick={(e) => input.tapTarget(key, e.clientX)}
      >
        <span className="duel-bar__hp">♥ {p.hp}</span>
        <FxLayer fx={fx} />
      </button>
      <span className="duel-bar__mana" aria-label={`Mana ${p.mana} of ${p.maxMana}`}>
        ◆ {p.mana}/{p.maxMana}
      </span>
      <span className="duel-bar__spell" aria-label={`Spell mana ${p.spellMana}`}>
        {Array.from({ length: SPELL_MANA_CAP }, (_, i) => (
          <span key={i} className={`pip${i < p.spellMana ? ' pip--on' : ''}`} />
        ))}
      </span>
      {!mine && (
        <span className="duel-bar__stat" aria-label="Opponent cards in hand">
          ✋ {p.hand.length}
        </span>
      )}
      <span className="duel-bar__stat" aria-label={`${mine ? 'Your' : 'Opponent'} deck`}>
        ▤ {p.deck.length}
      </span>
      {mine && game.phase !== 'mulligan' && game.phase !== 'over' && (
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

function BoardRow({ side, input }: { side: PlayerId; input: Input }) {
  const game = useDuel((s) => s.game)!;
  const attacking = useDuel((s) => s.attacking);
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
        return (
          <button
            key={u.uid}
            type="button"
            data-unit={u.uid}
            data-drop={input.valid.has(key) || (boardValid && side === HUMAN) ? key : undefined}
            data-source={ready ? 'unit' : undefined}
            className={[
              'unit',
              `faction-${card.faction}`,
              u.keywords.includes('guard') ? 'unit--guard' : '',
              u.barrier ? 'unit--barrier' : '',
              ready ? 'unit--ready' : '',
              picked ? 'unit--picked' : '',
              attacking === u.uid ? `unit--attacking unit--attacking-${side}` : '',
              input.valid.has(key) ? 'drop--valid' : '',
              targeted.has(key) ? 'targeted' : '',
              canAttack(game, u) ? '' : 'unit--spent',
            ].join(' ')}
            aria-label={`${side === HUMAN ? 'Your' : 'Enemy'} ${card.name}`}
            onPointerDown={(e) => ready && input.startDrag(e, src)}
            onContextMenu={(e) => {
              e.preventDefault();
              showDetail(u.cardId);
            }}
            onClick={(e) => {
              if (input.tapTarget(key, e.clientX)) return;
              if (boardValid && input.tapTarget('board', e.clientX)) return;
              if (ready) input.tapSource(src);
              else showDetail(u.cardId);
            }}
          >
            <UnitFace s={game} unit={u} />
            <FxLayer fx={fx.filter((f) => 'unit' in f.target && f.target.unit === u.uid)} />
          </button>
        );
      })}
    </div>
  );
}

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
  return item.targets.length ? `${name} → ${item.targets.map(target).join(', ')}` : name;
}

function StackStrip({ prompt }: { prompt: string | null }) {
  const game = useDuel((s) => s.game)!;
  const banner = useDuel((s) => s.banner);
  const showDetail = useDuel((s) => s.showDetail);
  const yourTurn = game.activePlayer === HUMAN;
  return (
    <div className="stack-strip" aria-label="Stack" aria-live="polite" data-zone="stack">
      {game.stack.length > 0 ? (
        <ol className="stack-strip__items">
          {game.stack.map((item, i) => (
            <li
              key={item.id}
              className={`stack-item stack-item--${item.owner === HUMAN ? 'player' : 'opponent'}${i === game.stack.length - 1 ? ' stack-item--top' : ''}`}
              data-drop={`stack:${item.id}`}
              onClick={() => item.kind === 'spell' && showDetail(item.cardId)}
            >
              <span className="stack-item__kind">{item.kind === 'attack' ? '⚔' : '✦'}</span>
              {stackLabel(game, item)}
            </li>
          ))}
        </ol>
      ) : (
        <p className="stack-strip__turn">
          {prompt ??
            (game.phase === 'over'
              ? 'Match over'
              : (banner?.text ?? (yourTurn ? 'Your turn' : "Opponent's turn")))}
        </p>
      )}
      {game.stack.length > 0 && prompt && <p className="stack-strip__prompt">{prompt}</p>}
    </div>
  );
}

function HandRow({ input, dragging }: { input: Input; dragging: Source | null }) {
  const game = useDuel((s) => s.game)!;
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
        const offset = i - (hand.length - 1) / 2;
        return (
          <button
            key={c.uid}
            type="button"
            data-source={playable ? 'card' : undefined}
            className={`hand__slot${playable ? ' hand__slot--playable' : ''}${picked ? ' hand__slot--picked' : ''}${dragging?.uid === c.uid ? ' hand__slot--dragging' : ''}`}
            style={
              {
                '--offset': offset,
                '--abs-offset': Math.abs(offset),
                '--gaps': gaps,
                zIndex: i,
              } as React.CSSProperties
            }
            aria-label={getCard(c.cardId).name}
            onPointerDown={(e) => playable && input.startDrag(e, src)}
            onContextMenu={(e) => {
              e.preventDefault();
              showDetail(c.cardId);
            }}
            onClick={() => (playable ? input.tapSource(src) : showDetail(c.cardId))}
          >
            <DuelCard cardId={c.cardId} />
          </button>
        );
      })}
    </div>
  );
}

function DragGhost({ drag, game }: { drag: Drag; game: GameState }) {
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
  return (
    <div className="drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
      <DuelCard cardId={card.cardId} />
    </div>
  );
}

function MulliganOverlay() {
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

function ResultOverlay() {
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
    <div className="overlay" role="dialog" aria-label="Match result">
      <h2>{title}</h2>
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

function ErrorToast() {
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
