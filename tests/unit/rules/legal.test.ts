import { describe, expect, it } from 'vitest';
import { initMatch, IllegalActionError } from '../../../src/rules';
import { act, attack, cast, FILLER, give, hero, pass, place, setup, unit } from './helpers';

const deck = Array.from({ length: 30 }, () => FILLER);
const throws = (f: () => unknown, msg: RegExp) => expect(f).toThrow(msg);

describe('illegal actions', () => {
  it('are rejected with a reason and change nothing', () => {
    const s = setup({ mana: 10 });
    const spell = give(s, 0, 'bastion-rally-cry');
    const u = give(s, 0, FILLER);
    throws(
      () => act(s, { type: 'playUnit', player: 0, uid: 99999, position: 0, targets: [] }),
      /not in hand/,
    );
    throws(() => act(s, { type: 'playUnit', player: 0, uid: spell, position: 0, targets: [] }), /not a unit/);
    throws(() => act(s, { type: 'playUnit', player: 0, uid: u, position: 5, targets: [] }), /bad position/);
    throws(() => act(s, { type: 'playUnit', player: 0, uid: u, position: 0.5, targets: [] }), /bad position/);
    throws(() => act(s, { type: 'castSpell', player: 0, uid: 99999, targets: [] }), /not in hand/);
    throws(() => act(s, { type: 'castSpell', player: 0, uid: u, targets: [] }), /not a spell/);
    throws(() => act(s, { type: 'castSpell', player: 0, uid: spell, targets: [hero(1)] }), /takes 0 targets/);
    throws(() => act(s, { type: 'mulligan', player: 0, uids: [] }), /not in the mulligan/);
    const enemy = place(s, 1, FILLER);
    throws(() => attack(s, enemy, hero(0)), /priority/);
    throws(
      () => act(s, { type: 'attack', player: 0, attacker: enemy.uid, target: hero(1) }),
      /not on your board/,
    );
    throws(() => cast(s, 0, 'ember-meteor', [unit(enemy.uid), unit(enemy.uid)]), /differ/);
    throws(() => cast(s, 0, 'ember-meteor', []), /needs targets/);
    s.players[0].mana = 0;
    throws(() => cast(s, 0, 'ember-cinder-bolt', [unit(enemy.uid)]), /mana/);
  });

  it('applyAction never mutates its input', () => {
    let s = setup({ mana: 10 });
    const enemy = place(s, 1, FILLER);
    const a = place(s, 0, 'ember-magma-brute');
    const bolt = give(s, 0, 'ember-cinder-bolt');
    for (const step of [
      (x: typeof s) => act(x, { type: 'castSpell', player: 0, uid: bolt, targets: [unit(enemy.uid)] }),
      (x: typeof s) => pass(x),
      (x: typeof s) =>
        attack(
          x,
          x.boards[0].find((b) => b.uid === a.uid)!,
          hero(1),
        ),
      (x: typeof s) => pass(x),
      (x: typeof s) => pass(x),
    ]) {
      const before = JSON.stringify(s);
      const next = step(s);
      expect(JSON.stringify(s)).toBe(before);
      s = next;
    }
  });

  it('nothing but a mulligan is legal before the match starts', () => {
    const s = initMatch({ decks: [deck, deck] }, 1);
    throws(() => act(s, { type: 'pass', player: 0 }), /main phase/);
  });

  it('is an IllegalActionError', () => {
    const s = setup();
    try {
      act(s, { type: 'pass', player: 1 });
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalActionError);
      expect((e as Error).name).toBe('IllegalActionError');
    }
  });

  it('a non-active player with priority cannot end the turn', () => {
    let s = setup({ mana: 5 });
    s = cast(s, 0, 'bastion-rally-cry');
    // Player 1 has priority with a stack: their pass resolves rather than ending the turn.
    s = pass(s);
    expect(s.activePlayer).toBe(0);
    expect(s.priority).toBe(0);
  });
});
