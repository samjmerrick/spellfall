import { sameTarget, type Action, type PlayerId, type StackItem, type TargetRef } from '../../rules';
import { type Pick } from './store';

/** `board` (your row), `cast` (anywhere on the field), `unit:<uid>`, `hero:<player>`, `stack:<id>`. */
export type DropKey = string;

export const refKey = (t: TargetRef): DropKey =>
  t.kind === 'unit' ? `unit:${t.uid}` : t.kind === 'hero' ? `hero:${t.player}` : `stack:${t.id}`;

export function keyRef(key: DropKey): TargetRef | null {
  const [kind, v] = key.split(':');
  if (kind === 'unit') return { kind: 'unit', uid: Number(v) };
  if (kind === 'hero') return { kind: 'hero', player: Number(v) as PlayerId };
  if (kind === 'stack') return { kind: 'stack', id: Number(v) };
  return null;
}

/** Hold to read: how long, and how far a finger may drift before it counts as a drag. */
export const HOLD_MS = 350;

export const HOLD_SLOP = 8;

export type Source = { kind: 'card' | 'unit'; uid: number };

/** The legal actions that can still come from `pick` (or a fresh source), given the targets chosen so far. */
export function actionsFor(legal: Action[], src: Pick | Source): Action[] {
  switch (src.kind) {
    case 'card':
      return legal.filter((a) => (a.type === 'playUnit' || a.type === 'castSpell') && a.uid === src.uid);
    case 'unit':
      return legal.filter((a) => a.type === 'attack' && a.attacker === src.uid);
    case 'abilityTargets':
      return legal.filter(
        (a) =>
          a.type === 'target' && src.chosen.every((c, i) => a.targets[i] && sameTarget(a.targets[i]!, c)),
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
export function dropKeys(legal: Action[], src: Pick | Source): Set<DropKey> {
  const out = new Set<DropKey>();
  for (const a of actionsFor(legal, src)) {
    if (a.type === 'attack') out.add(refKey(a.target));
    else if (src.kind === 'abilityTargets' || src.kind === 'spellTargets') {
      const t = (a as { targets: TargetRef[] }).targets[src.chosen.length];
      if (t) out.add(refKey(t));
    } else if (a.type === 'playUnit') out.add('board');
    else if (a.type === 'castSpell') out.add('cast');
  }
  return out;
}

/** The insertion position in your row for a drop at screen x. */
export function positionAt(x: number): number {
  const units = [...document.querySelectorAll<HTMLElement>('[data-row="0"] [data-unit]')];
  return units.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.left + r.width / 2 < x;
  }).length;
}

/** The drop key under a screen point, if any. */
export function dropAt(x: number, y: number): DropKey | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
  return el?.dataset.drop ?? null;
}

/** Whether a screen point is above the hand: a card released there is played (units) or cast (spells). */
export function aboveHand(y: number): boolean {
  const hand = document.querySelector('[data-zone="hand"]');
  if (!hand) return false;
  return y < hand.getBoundingClientRect().top + 8;
}

// ---------- Screen ----------

export interface Drag {
  src: Source;
  x0: number;
  y0: number;
  x: number;
  y: number;
  moved: boolean;
}

export interface Input {
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

export function targetedKeys(stack: StackItem[]): Set<DropKey> {
  const out = new Set<DropKey>();
  for (const i of stack) {
    if (i.kind === 'attack') out.add(refKey(i.target));
    else for (const t of i.targets ?? []) out.add(refKey(t));
  }
  return out;
}
