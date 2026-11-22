// Which chosen targets are legal: for spells and On Play effects (at cast and again on resolve) and for attacks.
import { findUnit, hasKeyword, unitRemainingHealth, unitMaxHealth } from './board';
import { getCard } from './content';
import type { TargetSpec } from './schema';
import { other, type GameState, type PlayerId, type TargetRef } from './types';

function unitMatches(s: GameState, spec: TargetSpec, chooser: PlayerId, uid: number): boolean {
  const loc = findUnit(s, uid);
  if (!loc) return false;
  const enemy = loc.owner !== chooser;
  // Elusive: enemy spells and effects cannot choose it.
  if (enemy && hasKeyword(loc.unit, 'elusive')) return false;
  if (spec.maxCost !== undefined && getCard(loc.unit.cardId).cost > spec.maxCost) return false;
  if (spec.damaged && unitRemainingHealth(s, loc.unit) >= unitMaxHealth(s, loc.unit)) return false;
  switch (spec.kind) {
    case 'enemyUnit':
    case 'enemyCharacter':
      return enemy;
    case 'friendlyUnit':
    case 'friendlyCharacter':
      return !enemy;
    case 'anyUnit':
    case 'anyCharacter':
      return true;
    case 'stackItem':
      return false;
  }
}

/** Whether `ref` is a legal choice for `spec`, made by `chooser`. `selfStackId` excludes a spell from targeting itself. */
export function targetMatches(
  s: GameState,
  spec: TargetSpec,
  chooser: PlayerId,
  ref: TargetRef,
  selfStackId?: number,
): boolean {
  switch (ref.kind) {
    case 'unit':
      return unitMatches(s, spec, chooser, ref.uid);
    case 'hero': {
      if (spec.maxCost !== undefined || spec.damaged) return false;
      const enemy = ref.player !== chooser;
      if (spec.kind === 'anyCharacter') return true;
      if (spec.kind === 'enemyCharacter') return enemy;
      if (spec.kind === 'friendlyCharacter') return !enemy;
      return false;
    }
    case 'stack':
      return (
        spec.kind === 'stackItem' &&
        ref.id !== selfStackId &&
        s.stack.some((i) => i.id === ref.id && i.kind === 'spell')
      );
  }
}

/** Every legal choice for one target spec. */
export function legalTargets(s: GameState, spec: TargetSpec, chooser: PlayerId): TargetRef[] {
  const out: TargetRef[] = [];
  if (spec.kind === 'stackItem') {
    for (const i of s.stack) if (i.kind === 'spell') out.push({ kind: 'stack', id: i.id });
    return out;
  }
  for (const owner of [chooser, other(chooser)] as const) {
    if (spec.kind.endsWith('Character')) {
      const ref: TargetRef = { kind: 'hero', player: owner };
      if (targetMatches(s, spec, chooser, ref)) out.push(ref);
    }
    for (const u of s.boards[owner]) {
      const ref: TargetRef = { kind: 'unit', uid: u.uid };
      if (targetMatches(s, spec, chooser, ref)) out.push(ref);
    }
  }
  return out;
}

/** Every legal combination of targets for a card (0–2 specs). Two targets must differ. */
export function targetCombos(s: GameState, specs: readonly TargetSpec[], chooser: PlayerId): TargetRef[][] {
  if (specs.length === 0) return [[]];
  const first = legalTargets(s, specs[0]!, chooser);
  if (specs.length === 1) return first.map((t) => [t]);
  const second = legalTargets(s, specs[1]!, chooser);
  const out: TargetRef[][] = [];
  for (const a of first) for (const b of second) if (!sameTarget(a, b)) out.push([a, b]);
  return out;
}

export function sameTarget(a: TargetRef, b: TargetRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'unit') return a.uid === (b as typeof a).uid;
  if (a.kind === 'hero') return a.player === (b as typeof a).player;
  return a.id === (b as typeof a).id;
}

/** Legal attack targets for the active player: Guard units if the defender has any, else every unit and the hero. */
export function attackTargets(s: GameState, attacker: PlayerId): TargetRef[] {
  const defender = other(attacker);
  const board = s.boards[defender];
  const guards = board.filter((u) => hasKeyword(u, 'guard'));
  if (guards.length > 0) return guards.map((u) => ({ kind: 'unit', uid: u.uid }));
  return [{ kind: 'hero', player: defender }, ...board.map((u): TargetRef => ({ kind: 'unit', uid: u.uid }))];
}
