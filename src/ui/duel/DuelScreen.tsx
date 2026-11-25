import { useEffect, useMemo, useRef, useState } from 'react';
import { getCard, legalActions, sameTarget, type TargetRef } from '../../rules';
import { useDurationScale } from '../motion';
import { AI, HUMAN, useDuel, type Pick } from './store';
import {
  type DropKey,
  keyRef,
  HOLD_MS,
  HOLD_SLOP,
  type Source,
  actionsFor,
  dropKeys,
  positionAt,
  dropAt,
  aboveHand,
  type Drag,
  type Input,
} from './input';
import { OpponentTop, HeroBar, BoardSide } from './Board';
import { StackStrip, Connectors, PlayReveal } from './Stack';
import { HandRow, HoldReader, DragGhost } from './Hand';
import { DiscoverOverlay, MulliganOverlay, ResultOverlay, ErrorToast } from './Overlays';

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
      <DiscoverOverlay />
      <ResultOverlay />
      <ErrorToast />
    </main>
  );
}
