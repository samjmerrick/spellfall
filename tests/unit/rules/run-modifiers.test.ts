import { describe, expect, it } from 'vitest';
import {
  applyAction,
  initMatch,
  viewFor,
  HIDDEN,
  type GameState,
  type MatchModifier,
} from '../../../src/rules';
import { ENEMIES, HEROES, RELICS } from '../../../src/run';
import { FILLER } from './helpers';

const deck = Array.from({ length: 30 }, () => FILLER);

/** Player 0's match with these modifiers: hands kept, a hurt Militia on each side, then 8 empty turns each. */
function play(mods: MatchModifier[]): GameState[] {
  let s = initMatch({ decks: [deck, deck], heroHp: 20, modifiers: [mods, []], firstPlayer: 0 }, 5);
  s = applyAction(s, { type: 'mulligan', player: 0, uids: [] }).state;
  s = applyAction(s, { type: 'mulligan', player: 1, uids: [] }).state;
  // Hurt heroes (for healing rules) and a hurt unit on each side (for unit-targeting rules).
  s.players[0].hp -= 6;
  s.players[1].hp -= 6;
  for (const p of [0, 1] as const) {
    s.boards[p].push({
      uid: 900 + p,
      cardId: 'bastion-militia',
      owner: p,
      basePower: 2,
      baseHealth: 3,
      turnPower: 0,
      turnHealth: 0,
      damage: 1,
      keywords: [],
      barrier: false,
      silenced: false,
      enteredTurn: 0,
      attacked: false,
      doomed: false,
      playOrder: 900 + p,
    });
  }
  const states = [s];
  while (s.phase === 'main' && s.turn < 16) {
    s = applyAction(s, { type: 'pass', player: s.priority }).state;
    states.push(s);
  }
  return states;
}

const sig = (s: GameState) =>
  JSON.stringify([
    s.players.map((p) => [p.hp, p.maxHp, p.hand.length, p.deck.length, p.mana, p.maxMana]),
    s.boards,
  ]);

describe('run content modifiers change the match as their text says', () => {
  const base = play([]);
  const sources = [
    ...HEROES.map((h) => ({ id: h.id, mods: h.modifiers })),
    ...RELICS.filter((r) => r.modifiers.length > 0).map((r) => ({ id: r.id, mods: r.modifiers })),
    ...ENEMIES.filter((e) => e.modifiers.length > 0).map((e) => ({ id: e.id, mods: e.modifiers })),
  ];
  for (const { id, mods } of sources) {
    it(id, () => {
      const with_ = play(mods);
      // Somewhere in the first 8 turns each, the match differs from one without the modifiers.
      expect(with_.some((s, i) => base[i] && sig(s) !== sig(base[i]!))).toBe(true);
    });
  }

  it('turnStart modifiers fire on the owner’s listed turns only', () => {
    const states = play([
      { kind: 'turnStart', turns: [2], action: { op: 'damage', target: 'enemyHero', amount: 3 } },
    ]);
    const hp = states.map((s) => s.players[1].hp);
    // Player 0's 2nd turn is overall turn 3.
    expect(states.find((s) => s.turn === 2)!.players[1].hp).toBe(14);
    expect(states.find((s) => s.turn === 3)!.players[1].hp).toBe(11);
    expect(Math.min(...hp)).toBe(11);
  });
});

describe('boss AI hooks', () => {
  it('a boss that sees your hand gets your real hand in its view; your deck stays hidden', () => {
    expect(ENEMIES.filter((e) => e.ai.seesHand).length).toBeGreaterThan(0);
    const s = initMatch({ decks: [deck, deck] }, 2);
    const seen = viewFor(s, 1, { seeHand: true });
    expect(seen.players[0].hand).toEqual(s.players[0].hand);
    expect(seen.players[0].deck.every((c) => c === HIDDEN)).toBe(true);
    expect(viewFor(s, 1).players[0].hand.every((c) => c.cardId === HIDDEN)).toBe(true);
  });
});
