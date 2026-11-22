import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  canAttack,
  getCard,
  HIDDEN,
  legalActions,
  sameTarget,
  viewFor,
  type Action,
  type GameState,
  type PlayerId,
  type StackItem,
  type TargetRef,
} from '../../rules';
import { useApp } from '../app';
import { useRun } from '../runStore';
import { CardArt } from '../CardView';
import { artUrl } from '../art';
import { FADE_SECONDS, useDurationScale } from '../motion';
import { useReduceMotion } from '../useReduceMotion';
import { DuelCard, UnitFace } from './Card';
import { PATHS } from '../keywordPaths';
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

/** Hold to read: how long, and how far a finger may drift before it counts as a drag. */
const HOLD_MS = 350;
const HOLD_SLOP = 8;

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

/** Where the source can be dropped next. A spell card always goes to the field first (then to the stack). */
function dropKeys(legal: Action[], src: Pick | Source): Set<DropKey> {
  const out = new Set<DropKey>();
  for (const a of actionsFor(legal, src)) {
    if (a.type === 'attack') out.add(refKey(a.target));
    else if (src.kind === 'placeTargets' || src.kind === 'spellTargets') {
      const t = (a as { targets: TargetRef[] }).targets[src.chosen.length];
      if (t) out.add(refKey(t));
    } else if (a.type === 'playUnit') out.add('board');
    else if (a.type === 'castSpell') out.add('cast');
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

/** Whether a screen point is above the hand: a card released there is played (units) or cast (spells). */
function aboveHand(y: number): boolean {
  const hand = document.querySelector('[data-zone="hand"]');
  if (!hand) return false;
  return y < hand.getBoundingClientRect().top + 8;
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
  const motionScale = useDurationScale();
  const [drag, setDrag] = useState<Drag | null>(null);
  /** The card being held to read, and the hold in progress. */
  const [reading, setReading] = useState<string | null>(null);
  const holdRef = useRef<{ timer: number; x0: number; y0: number } | null>(null);
  /** Set when a hold opened the reader, so the click that follows the release is ignored. */
  const heldRef = useRef(false);

  const legal = useMemo(
    () => (game && !busy && game.phase === 'main' && game.priority === HUMAN ? legalActions(game) : []),
    [game, busy],
  );
  const active: Pick | Source | null = drag?.moved ? drag.src : pick;
  const valid = useMemo(() => (active ? dropKeys(legal, active) : new Set<DropKey>()), [legal, active]);

  const cardOf = (uid: number) => {
    const c = game?.players[HUMAN].hand.find((h) => h.uid === uid);
    return c ? getCard(c.cardId) : null;
  };

  /** A spell card put on the field: cast at once if it takes no targets, else it waits on the stack for them. */
  function castOrPend(uid: number) {
    const options = actionsFor(legal, { kind: 'card', uid });
    const now = options.find((o) => o.type === 'castSpell' && o.targets.length === 0);
    if (now) return void perform(now);
    if (options.length === 0) return setPick(null);
    setPick({ kind: 'spellTargets', uid, chosen: [] });
  }

  /** A unit card put on your board at screen x: played there, or waiting for its On Play targets. */
  function place(uid: number, x: number) {
    const position = positionAt(x);
    const here = actionsFor(legal, { kind: 'card', uid }).filter(
      (o) => o.type === 'playUnit' && o.position === position,
    );
    if (here.length === 0) return setPick(null);
    if (here.length === 1 && (here[0] as { targets: TargetRef[] }).targets.length === 0)
      return void perform(here[0]!);
    setPick({ kind: 'placeTargets', uid, position, chosen: [] });
  }

  /** Completes (or advances) a choice by dropping or tapping `src` onto `key` at screen x. */
  function choose(src: Pick | Source, key: DropKey, x: number) {
    if (src.kind === 'unit') {
      const ref = keyRef(key);
      const a = ref && actionsFor(legal, src).find((o) => o.type === 'attack' && sameTarget(o.target, ref));
      if (a) void perform(a);
      else if (!refuseForGuard(key)) setPick(null);
      return;
    }
    if (src.kind === 'card') {
      const card = cardOf(src.uid);
      if (!card) return setPick(null);
      if (card.type === 'unit')
        return key === 'board' || key.startsWith('unit:') ? place(src.uid, x) : setPick(null);
      return castOrPend(src.uid);
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
    function cancelHold() {
      if (holdRef.current) window.clearTimeout(holdRef.current.timer);
      holdRef.current = null;
    }
    function move(e: PointerEvent) {
      const h = holdRef.current;
      if (h && Math.hypot(e.clientX - h.x0, e.clientY - h.y0) > HOLD_SLOP) cancelHold();
      const d = dragRef.current;
      if (!d) return;
      const moved = d.moved || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > HOLD_SLOP;
      updateDrag({ ...d, x: e.clientX, y: e.clientY, moved });
    }
    function up(e: PointerEvent) {
      cancelHold();
      setReading(null); // Releasing closes the reader.
      const d = dragRef.current;
      if (!d) return;
      updateDrag(null);
      if (!d.moved) return; // A tap: handled by onClick.
      if (d.src.kind === 'card') {
        // Cards are played by letting go anywhere above the hand.
        const card = cardOf(d.src.uid);
        if (!card || !aboveHand(e.clientY)) return;
        if (card.type === 'unit') place(d.src.uid, e.clientX);
        else castOrPend(d.src.uid);
        return;
      }
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

  /** Starts a hold on a card, unit or stack item: after HOLD_MS without moving, it opens enlarged for reading. */
  function startHold(e: React.PointerEvent, cardId: string) {
    heldRef.current = false;
    if (holdRef.current) window.clearTimeout(holdRef.current.timer);
    const timer = window.setTimeout(() => {
      holdRef.current = null;
      heldRef.current = true;
      updateDrag(null); // A hold is not a drag: nothing gets played.
      setReading(cardId);
    }, HOLD_MS);
    holdRef.current = { timer, x0: e.clientX, y0: e.clientY };
  }

  /** True (once) if the click being handled is the release of a hold, which must do nothing else. */
  function consumeHold(): boolean {
    if (!heldRef.current) return false;
    heldRef.current = false;
    return true;
  }

  function startDrag(e: React.PointerEvent, src: Source) {
    if (actionsFor(legal, src).length === 0) return;
    updateDrag({ src, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false });
  }

  /** A tap on a source: pick it (or unpick). A targeted spell goes straight to the stack to wait for targets. */
  function tapSource(src: Source) {
    if (pick && pick.kind !== 'unit' && src.kind === 'card' && pick.uid === src.uid) return setPick(null);
    if (pick && pick.kind === src.kind && pick.uid === src.uid) return setPick(null);
    const options = actionsFor(legal, src);
    if (options.length === 0) return setPick(null);
    const card = src.kind === 'card' ? cardOf(src.uid) : null;
    if (card?.type === 'spell' && !options.some((o) => (o as { targets: TargetRef[] }).targets.length === 0))
      return setPick({ kind: 'spellTargets', uid: src.uid, chosen: [] });
    setPick(src);
  }

  /**
   * An attack aimed past an enemy Guard: say why instead of silently dropping it. Returns true if it applied
   * (the attacker stays picked, so the player can choose the Guard next).
   */
  function refuseForGuard(key: DropKey): boolean {
    if (!game || active?.kind !== 'unit') return false;
    const ref = keyRef(key);
    const enemy =
      (ref?.kind === 'hero' && ref.player === AI) ||
      (ref?.kind === 'unit' && game.boards[AI].some((u) => u.uid === ref.uid));
    if (!enemy || !game.boards[AI].some((u) => u.keywords.includes('guard'))) return false;
    useDuel.setState({ error: 'Attack a Guard unit first' });
    setPick(active);
    return true;
  }

  /** A tap on a drop target while something is picked. Returns true if it was used. */
  function tapTarget(key: DropKey, x: number): boolean {
    if (!pick) return false;
    if (!valid.has(key)) return refuseForGuard(key);
    choose(pick, key, x);
    return true;
  }

  if (!game) return null;
  const input: Input = {
    legal,
    valid,
    active,
    startDrag,
    startHold,
    consumeHold,
    held: () => heldRef.current,
    tapSource,
    tapTarget,
  };
  const prompt =
    pick?.kind === 'placeTargets' || pick?.kind === 'spellTargets'
      ? 'Choose a target'
      : pick?.kind === 'unit'
        ? 'Choose what to attack'
        : null;
  const motionStyle = { '--motion': motionScale } as React.CSSProperties;
  const draggingSpell = drag?.moved && drag.src.kind === 'card' && cardOf(drag.src.uid)?.type === 'spell';

  return (
    <main
      className={`duel${drag?.moved ? ' duel--dragging' : ''}`}
      style={motionStyle}
      aria-label="Match"
      onClick={(e) => {
        // A tap on nothing in particular drops the current pick.
        if (!(e.target as HTMLElement).closest('[data-drop],[data-source],button')) setPick(null);
      }}
    >
      <OpponentTop />
      <div
        className={`duel__field${valid.has('cast') || (draggingSpell && aboveHand(drag.y)) ? ' drop--valid' : ''}`}
        data-drop="cast"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-drop]') !== e.currentTarget) return;
          if (!tapTarget('cast', e.clientX)) setPick(null);
        }}
      >
        <BoardSide side={AI} input={input} />
        <StackStrip prompt={prompt} input={input} />
        <BoardSide side={HUMAN} input={input} />
      </div>
      <HeroBar />
      <HandRow input={input} dragging={drag?.moved ? drag.src : null} />
      <Connectors />
      <PlayReveal />
      {drag?.moved && <DragGhost drag={drag} game={game} />}
      {reading && <HoldReader cardId={reading} />}
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
  startHold(e: React.PointerEvent, cardId: string): void;
  consumeHold(): boolean;
  held(): boolean;
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

/**
 * The top of the screen: leave, the opponent's hand as card backs peeking from the top edge (faces only for
 * cards you are allowed to see), and the opponent's mana and deck.
 */
function OpponentTop() {
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

function HeroBar() {
  const game = useDuel((s) => s.game)!;
  const busy = useDuel((s) => s.busy);
  const pass = useDuel((s) => s.pass);
  const p = game.players[HUMAN];
  let label = "Opponent's turn";
  let enabled = false;
  if (game.phase === 'main' && game.priority === HUMAN && !busy) {
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
function BoardSide({ side, input }: { side: PlayerId; input: Input }) {
  return (
    <div className={`duel-side duel-side--${side === HUMAN ? 'player' : 'opponent'}`}>
      <BoardRow side={side} input={input} />
      <HeroSlot side={side} input={input} />
    </div>
  );
}

function BoardRow({ side, input }: { side: PlayerId; input: Input }) {
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

/** A hero at the right end of its board row: portrait art and HP, and the drop zone for attacks and spells. */
function HeroSlot({ side, input }: { side: PlayerId; input: Input }) {
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

/** A stack item as a round token with its card art (an attack shows the attacker, with a sword badge). */
function Orb({ cardId, attack }: { cardId: string; attack?: boolean }) {
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

function StackStrip({ prompt, input }: { prompt: string | null; input: Input }) {
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
                item.kind === 'spell'
                  ? item.cardId
                  : game.boards[item.owner].find((u) => u.uid === item.attacker)?.cardId;
              return (
                <li
                  key={item.id}
                  className={[
                    'stack-item',
                    `stack-item--${item.owner === HUMAN ? 'player' : 'opponent'}`,
                    i === game.stack.length - 1 && !pending ? 'stack-item--top' : '',
                    input.valid.has(key) ? 'drop--valid' : '',
                    resolving === item.id ? 'stack-item--resolving' : '',
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
                    if (item.kind === 'spell') showDetail(item.cardId);
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

interface Line {
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
function Connectors() {
  const game = useDuel((s) => s.game)!;
  const pick = useDuel((s) => s.pick);
  const [lines, setLines] = useState<Line[]>([]);
  const ref = useRef<SVGSVGElement>(null);
  const links = useMemo(() => {
    const out: { id: string; from: string; to: string; owner: Line['owner'] }[] = [];
    for (const item of game.stack) {
      const owner = item.owner === HUMAN ? 'player' : 'opponent';
      const targets = item.kind === 'attack' ? [item.target] : item.targets;
      targets.forEach((t, i) =>
        out.push({ id: `${item.id}-${i}`, from: String(item.id), to: refKey(t), owner }),
      );
    }
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
function PlayReveal() {
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

function HandRow({ input, dragging }: { input: Input; dragging: Source | null }) {
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
function HoldReader({ cardId }: { cardId: string }) {
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
