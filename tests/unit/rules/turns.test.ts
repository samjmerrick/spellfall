import { describe, expect, it } from 'vitest';
import { initMatch, legalActions, IllegalActionError, SPARK_ID, type GameState } from '../../../src/rules';
import { act, cast, events, FILLER, give, onBoard, pass, place, play, setup, unit } from './helpers';

const deck = Array.from({ length: 30 }, () => FILLER);

describe('setup', () => {
  it('the seed picks the first player unless the config does', () => {
    expect(initMatch({ decks: [deck, deck] }, 2).firstPlayer).toBe(0);
    expect(initMatch({ decks: [deck, deck] }, 3).firstPlayer).toBe(1);
    expect(initMatch({ decks: [deck, deck], firstPlayer: 1 }, 2).firstPlayer).toBe(1);
  });

  it('the first player draws 3 and skips the turn-1 draw; the second draws 4, gets the Spark, +3 HP and 1 spell mana', () => {
    let s = initMatch({ decks: [deck, deck], firstPlayer: 0 }, 1);
    expect(s.phase).toBe('mulligan');
    expect(s.players[0].hand).toHaveLength(3);
    expect(s.players[1].hand).toHaveLength(4);
    s = act(s, { type: 'mulligan', player: 1, uids: [] });
    expect(s.phase).toBe('mulligan');
    s = act(s, { type: 'mulligan', player: 0, uids: [] });
    expect(s.phase).toBe('main');
    expect(s.turn).toBe(1);
    expect(s.players[1].hand.map((c) => c.cardId)).toContain(SPARK_ID);
    expect(s.players[1].hand).toHaveLength(5);
    // No turn-1 draw for the first player.
    expect(s.players[0].hand).toHaveLength(3);
    expect(s.players[0].maxMana).toBe(1);
    expect(s.players[0].hp).toBe(20);
    expect(s.players[1].hp).toBe(23);
    expect(s.players[1].maxHp).toBe(23);
    expect(s.players[0].spellMana).toBe(0);
    expect(s.players[1].spellMana).toBe(1);
  });

  it('a mulligan replaces the chosen cards once', () => {
    const mixed = Array.from({ length: 30 }, (_, i) => (i % 2 ? 'bastion-militia' : FILLER));
    let s = initMatch({ decks: [mixed, mixed], firstPlayer: 0 }, 5);
    const before = s.players[0].hand.map((c) => c.uid);
    s = act(s, { type: 'mulligan', player: 0, uids: before.slice(0, 2) });
    const after = s.players[0].hand.map((c) => c.uid);
    expect(after).toHaveLength(3);
    expect(after).toContain(before[2]);
    expect(after).not.toContain(before[0]);
    expect(s.players[0].deck).toHaveLength(27);
    expect(() => act(s, { type: 'mulligan', player: 0, uids: [] })).toThrow(IllegalActionError);
    expect(() => act(s, { type: 'mulligan', player: 1, uids: [99999] })).toThrow(IllegalActionError);
    expect(legalActions(s).every((a) => a.type === 'mulligan' && a.player === 1)).toBe(true);
  });

  it('modifiers change hero HP, starting spell mana and hand size', () => {
    const s = initMatch(
      {
        decks: [deck, deck],
        firstPlayer: 0,
        modifiers: [
          [
            { kind: 'heroHp', amount: 5 },
            { kind: 'startSpellMana', amount: 2 },
            { kind: 'startHand', amount: 1 },
          ],
          [],
        ],
      },
      1,
    );
    expect(s.players[0].hp).toBe(25);
    expect(s.players[0].spellMana).toBe(2);
    expect(s.players[0].hand).toHaveLength(4);
    expect(s.players[1].hp).toBe(23);
  });
});

describe('mana and the turn sequence', () => {
  it('max mana rises by 1 a turn up to 10 and refills', () => {
    let s = setup();
    for (let i = 0; i < 24; i++) s = pass(s);
    expect(s.players[0].maxMana).toBe(10);
    expect(s.players[1].maxMana).toBe(10);
    expect(s.players[s.activePlayer].mana).toBe(10);
  });

  it('unspent mana banks as spell mana, up to 3, at the end of your turn', () => {
    let s = setup({ mana: 5 });
    s = pass(s);
    expect(s.players[0].spellMana).toBe(3);
    expect(s.players[0].mana).toBe(0);
    expect(events().some((e) => e.type === 'SpellManaBanked' && e.spellMana === 3)).toBe(true);
  });

  it('spells spend mana first, then spell mana; units cannot use spell mana', () => {
    const s = setup({ mana: 1 });
    s.players[0].spellMana = 2;
    const s2 = cast(s, 0, 'ember-fireball', [{ kind: 'hero', player: 1 }]);
    expect(s2.players[0].mana).toBe(0);
    expect(s2.players[0].spellMana).toBe(0);
    expect(() => play(s, 0, 'bastion-militia')).toThrow(/mana/);
  });

  it('draws a card each turn; a full hand burns it; an empty deck deals growing fatigue', () => {
    let s = setup();
    for (let i = 0; i < 10; i++) give(s, 1, FILLER);
    s = pass(s);
    expect(s.players[1].hand).toHaveLength(10);
    expect(events().some((e) => e.type === 'CardBurned')).toBe(true);
    s = pass(s);
    s.players[1].deck = [];
    s = pass(s);
    expect(s.players[1].hp).toBe(19);
    s = pass(s);
    s = pass(s);
    expect(s.players[1].hp).toBe(17);
  });

  it('a match that reaches the end of turn 40 is a draw', () => {
    let s = setup();
    while (s.phase !== 'over') s = pass(s);
    expect(s.turn).toBe(40);
    expect(s.result).toEqual({ winner: null, reason: 'turns' });
    expect(() => pass(s)).toThrow(/over/);
    expect(legalActions(s)).toEqual([]);
  });
});

describe('priority and the stack', () => {
  const stackState = (): GameState => setup({ mana: 10 });

  it('casting Fast hands priority over; passing resolves the whole stack, newest first', () => {
    let s = stackState();
    s.players[0].hp = 10;
    s.players[1].hp = 10;
    s = cast(s, 0, 'bastion-mend', [{ kind: 'hero', player: 0 }]);
    expect(s.stack).toHaveLength(1);
    expect(s.priority).toBe(1);
    // Player 1 answers; player 0 answers again; player 1 passes.
    s = cast(s, 1, 'bastion-mend', [{ kind: 'hero', player: 1 }]);
    expect(s.priority).toBe(0);
    s = cast(s, 0, 'bastion-rally-cry');
    expect(s.stack).toHaveLength(3);
    s = pass(s);
    const resolving = events().filter((e) => e.type === 'StackResolving');
    expect(resolving).toHaveLength(3);
    const ids = resolving.map((e) => (e as { id: number }).id);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
    expect(s.stack).toEqual([]);
    expect(s.priority).toBe(0);
    expect(s.players[0].hp).toBe(14);
    expect(s.players[1].hp).toBe(14);
  });

  it('a Burst spell resolves at once and keeps priority, even mid-stack', () => {
    let s = stackState();
    s = cast(s, 0, 'bastion-rally-cry');
    expect(s.priority).toBe(1);
    s = cast(s, 1, 'neutral-spark');
    expect(s.priority).toBe(1);
    expect(s.stack).toHaveLength(1);
    expect(s.players[1].mana).toBe(11);
  });

  it('Slow spells, units and attacks need your main phase with an empty stack', () => {
    let s = stackState();
    s = cast(s, 0, 'bastion-rally-cry');
    expect(() => cast(s, 1, 'bastion-call-to-arms')).toThrow(/slow/);
    s = cast(s, 1, 'bastion-rally-cry');
    // Back with player 0, but the stack is not empty.
    expect(() => play(s, 0, FILLER)).toThrow(/empty stack/);
    expect(() => cast(s, 0, 'bastion-call-to-arms')).toThrow(/slow/);
    expect(legalActions(s).map((a) => a.type)).not.toContain('playUnit');
  });

  it('only the player with priority may act, and only the active player ends the turn', () => {
    let s = stackState();
    expect(() => pass(s, 1)).toThrow(/priority/);
    s = cast(s, 0, 'bastion-rally-cry');
    expect(() => pass(s, 0)).toThrow(/priority/);
    // Passing with an empty stack ends the turn.
    s = pass(s);
    expect(s.activePlayer).toBe(0);
    s = pass(s);
    expect(s.activePlayer).toBe(1);
  });

  it('a target gone by resolution makes the spell fizzle; its mana is not refunded', () => {
    let s = stackState();
    const y = place(s, 1, FILLER);
    s = cast(s, 0, 'ember-fireball', [unit(y.uid)]);
    s = cast(s, 1, 'bastion-rally-cry');
    s = cast(s, 0, 'ember-cinder-bolt', [unit(y.uid)]);
    const mana = s.players[0].mana;
    s = pass(s);
    expect(onBoard(s, y.uid)).toBe(false);
    expect(events().filter((e) => e.type === 'Fizzled')).toHaveLength(1);
    expect(s.players[0].mana).toBe(mana);
  });

  it('a spell with two targets resolves on the one that is left', () => {
    let s = stackState();
    const y = place(s, 1, FILLER);
    s = cast(s, 0, 'ember-meteor', [unit(y.uid), { kind: 'hero', player: 1 }]);
    s = cast(s, 1, 'bastion-rally-cry');
    s = cast(s, 0, 'ember-cinder-bolt', [unit(y.uid)]);
    s = pass(s);
    expect(events().some((e) => e.type === 'Fizzled')).toBe(false);
    expect(s.players[1].hp).toBe(18);
  });
});
