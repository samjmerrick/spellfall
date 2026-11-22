import { describe, expect, it } from 'vitest';
import { applyAction, legalActions, type Action, type GameState } from '../../src/rules';
import { opponentAction, stepAllows, stepCard, TUTORIAL, tutorialStart } from '../../src/run';

/** Plays the script: the player takes the action each `do` step allows; info and wait steps just advance. */
function playScript(): { state: GameState; steps: number } {
  let s = tutorialStart();
  let step = 0;
  let move = 0;
  for (let guard = 0; guard < 300 && s.phase !== 'over'; guard++) {
    if (s.priority === 1) {
      const r = opponentAction(s, move);
      move = r.next;
      s = applyAction(s, r.action).state;
      continue;
    }
    const st = TUTORIAL.steps[step];
    if (!st) throw new Error(`out of steps on turn ${s.turn}`);
    if (st.kind !== 'do') {
      step++;
      continue;
    }
    const a = legalActions(s).find((x) => stepAllows(st, s, x)) as Action | undefined;
    if (!a) throw new Error(`step ${step} has no legal action on turn ${s.turn}`);
    s = applyAction(s, a).state;
    step++;
  }
  return { state: s, steps: step };
}

describe('the tutorial', () => {
  it('starts on turn 1 with the scripted hands, the player going first', () => {
    const s = tutorialStart();
    expect(s.turn).toBe(1);
    expect(s.activePlayer).toBe(0);
    // The first player skips the turn-1 draw.
    expect(s.players[0].hand.map((c) => c.cardId)).toEqual(TUTORIAL.playerHand);
    expect(s.players[1].hand.map((c) => c.cardId)).toEqual([...TUTORIAL.opponentHand, 'neutral-spark']);
  });

  it('following every step wins the match on the last step', () => {
    const { state, steps } = playScript();
    expect(state.result).toEqual({ winner: 0, reason: 'hp' });
    expect(steps).toBe(TUTORIAL.steps.length);
  });

  it('refuses actions the step does not ask for', () => {
    const s = tutorialStart();
    const playImp = TUTORIAL.steps[1]!;
    const legal = legalActions(s);
    const allowed = legal.filter((a) => stepAllows(playImp, s, a));
    expect(allowed.length).toBeGreaterThan(0);
    expect(allowed.every((a) => a.type === 'playUnit')).toBe(true);
    expect(stepAllows(playImp, s, { type: 'pass', player: 0 })).toBe(false);
    expect(stepAllows(TUTORIAL.steps[0], s, legal[0]!)).toBe(false);
    expect(stepCard(playImp)).toBe('ember-spark-imp');
    expect(stepCard(TUTORIAL.steps[0])).toBeNull();
  });

  it('the opponent passes when its next move is not for this turn', () => {
    const s = tutorialStart();
    expect(opponentAction({ ...s, priority: 1 }, 0)).toEqual({
      action: { type: 'pass', player: 1 },
      next: 0,
    });
    expect(opponentAction(s, TUTORIAL.opponentMoves.length).next).toBe(TUTORIAL.opponentMoves.length);
  });
});
