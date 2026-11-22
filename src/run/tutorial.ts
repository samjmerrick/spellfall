// The tutorial match: a scripted Spellfall match with coach steps (src/content/tutorial.json). The player's
// actions are gated by the current step; the opponent follows a fixed list of moves.
import tutorialJson from '../content/tutorial.json';
import { z } from 'zod';
import {
  applyAction,
  findUnit,
  hasCard,
  initMatch,
  legalActions,
  sameTarget,
  type Action,
  type GameState,
  type PlayerId,
  type TargetRef,
} from '../rules';
import { MatchModifierSchema } from '../rules/schema';

const cardId = z.string().refine((id) => hasCard(id), 'unknown card');
const text = z.string().min(1).max(110);
/** `enemyHero`, `hero` (the mover's own), or a unit by card id. */
const target = z.string().min(1);

export const TutorialStepSchema = z.discriminatedUnion('kind', [
  /** Shows the text; the player taps Next. */
  z.object({ kind: z.literal('info'), text }),
  /** Waits for this action (`pass` is End Turn or Resolve); any other action is refused. */
  z.object({
    kind: z.literal('do'),
    text,
    action: z.enum(['playUnit', 'castSpell', 'attack', 'pass']),
    card: cardId.optional(),
    target: target.optional(),
  }),
  /** The opponent acts; the next step shows when the player has priority again. */
  z.object({ kind: z.literal('wait'), text }),
]);

const OpponentMoveSchema = z.union([
  z.object({ turn: z.number().int().min(1), card: cardId, target: target.optional() }),
  z.object({ turn: z.number().int().min(1), attacker: cardId, target }),
]);

export const TutorialSchema = z.object({
  seed: z.number().int().min(0),
  playerHand: z.array(cardId),
  /** Draw order: the first card is drawn first. */
  playerDeck: z.array(cardId),
  opponentHand: z.array(cardId),
  opponentDeck: z.array(cardId),
  /** Applied to the opponent only; `heroHp` lowers their hero so the match ends quickly. */
  opponentModifiers: z.array(MatchModifierSchema),
  opponentMoves: z.array(OpponentMoveSchema),
  steps: z.array(TutorialStepSchema).min(1),
});

export type TutorialStep = z.infer<typeof TutorialStepSchema>;
export type OpponentMove = z.infer<typeof OpponentMoveSchema>;
export type Tutorial = z.infer<typeof TutorialSchema>;

export const TUTORIAL: Tutorial = TutorialSchema.parse(tutorialJson);
export const TUTORIAL_SEED = TUTORIAL.seed;

const HUMAN: PlayerId = 0;
const AI: PlayerId = 1;

/**
 * The tutorial's opening state: the player goes first, both hands and deck orders are the script's, and both
 * mulligans are done (keep), so turn 1 has started.
 */
export function tutorialStart(): GameState {
  const t = TUTORIAL;
  let s = initMatch(
    {
      decks: [
        [...t.playerHand, ...t.playerDeck],
        [...t.opponentHand, ...t.opponentDeck],
      ],
      modifiers: [[], t.opponentModifiers],
      firstPlayer: HUMAN,
    },
    t.seed,
  );
  s = structuredClone(s);
  let uid = 1;
  for (const [p, hand, deck] of [
    [HUMAN, t.playerHand, t.playerDeck],
    [AI, t.opponentHand, t.opponentDeck],
  ] as const) {
    s.players[p].hand = hand.map((cardId) => ({ uid: uid++, cardId }));
    s.players[p].deck = [...deck].reverse(); // the top of the deck is the last element
  }
  s.nextUid = uid;
  s = applyAction(s, { type: 'mulligan', player: HUMAN, uids: [] }).state;
  return applyAction(s, { type: 'mulligan', player: AI, uids: [] }).state;
}

/** Resolves a script target for `mover`: `enemyHero`, `hero`, or a unit by card id (either side). */
function resolveTarget(s: GameState, mover: PlayerId, t: string | undefined): TargetRef | null {
  if (t === undefined) return null;
  if (t === 'enemyHero') return { kind: 'hero', player: mover === HUMAN ? AI : HUMAN };
  if (t === 'hero') return { kind: 'hero', player: mover };
  for (const b of s.boards) for (const u of b) if (u.cardId === t) return { kind: 'unit', uid: u.uid };
  return null;
}

/** Whether `action` is what this step asks for. Positions are free; targets must match. */
export function stepAllows(step: TutorialStep | undefined, s: GameState, action: Action): boolean {
  if (!step || step.kind !== 'do' || action.player !== HUMAN || action.type !== step.action) return false;
  if (action.type === 'pass') return true;
  const want = resolveTarget(s, HUMAN, step.target);
  if (action.type === 'attack') {
    const unit = findUnit(s, action.attacker);
    return unit?.unit.cardId === step.card && !!want && sameTarget(action.target, want);
  }
  const card = s.players[HUMAN].hand.find((c) => c.uid === action.uid)?.cardId;
  if (card !== step.card) return false;
  if (!step.target) return true;
  return !!want && action.targets.length > 0 && sameTarget(action.targets[0]!, want);
}

/**
 * The opponent's next action: its next scripted move for this turn if it is legal now (index `next` in
 * `opponentMoves`), otherwise pass. Returns the action and the new move index.
 */
export function opponentAction(s: GameState, next: number): { action: Action; next: number } {
  const move = TUTORIAL.opponentMoves[next];
  const pass: Action = { type: 'pass', player: AI };
  if (!move || move.turn !== s.turn) return { action: pass, next };
  const legal = legalActions(s);
  let action: Action | undefined;
  if ('attacker' in move) {
    const attacker = s.boards[AI].find((u) => u.cardId === move.attacker);
    const t = resolveTarget(s, AI, move.target);
    action = legal.find(
      (a) => a.type === 'attack' && a.attacker === attacker?.uid && t && sameTarget(a.target, t),
    );
  } else {
    const uid = s.players[AI].hand.find((c) => c.cardId === move.card)?.uid;
    const t = resolveTarget(s, AI, move.target);
    action = legal.find(
      (a) =>
        (a.type === 'castSpell' || a.type === 'playUnit') &&
        a.uid === uid &&
        (t ? a.targets.length > 0 && sameTarget(a.targets[0]!, t) : a.targets.length === 0) &&
        (a.type !== 'playUnit' || a.position === s.boards[AI].length),
    );
  }
  return action ? { action, next: next + 1 } : { action: pass, next };
}

/** For screens: the card a `do` step wants played (to highlight it). */
export function stepCard(step: TutorialStep | undefined): string | null {
  return step?.kind === 'do' && step.card ? step.card : null;
}
