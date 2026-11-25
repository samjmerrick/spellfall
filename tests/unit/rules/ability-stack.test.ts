// On Play abilities: the unit enters at once, its ability goes on the stack, and targets are chosen there.
import { describe, expect, it } from 'vitest';
import { awaitingAbility, getCard, legalActions } from '../../../src/rules';
import { act, events, FILLER, give, hero, pass, place, setup, u, unit } from './helpers';

const playBare = (s: ReturnType<typeof setup>, cardId: string, targets: ReturnType<typeof unit>[] = []) =>
  act(s, { type: 'playUnit', player: 0, uid: give(s, 0, cardId), position: s.boards[0].length, targets });

describe('On Play on the stack', () => {
  it('the unit enters at once; a targeted ability waits for its owner to choose', () => {
    let s = setup({ mana: 3 });
    const foe = place(s, 1, FILLER);
    s = playBare(s, 'ember-torchbearer');
    expect(s.boards[0]).toHaveLength(1);
    expect(s.players[0].mana).toBe(1);
    expect(s.stack).toHaveLength(1);
    expect(s.stack[0]).toMatchObject({ kind: 'ability', owner: 0, targets: null });
    expect(awaitingAbility(s)).not.toBeNull();
    expect(s.priority).toBe(0);
    // Only the target choices are legal; anything else is refused.
    const legal = legalActions(s);
    expect(legal.every((a) => a.type === 'target')).toBe(true);
    expect(legal).toHaveLength(1);
    expect(() => pass(s)).toThrow(/choose targets/);
    expect(() =>
      act(s, { type: 'playUnit', player: 0, uid: give(s, 0, FILLER), position: 1, targets: [] }),
    ).toThrow(/choose targets/);
    expect(() => act(s, { type: 'target', player: 0, targets: [hero(1)] })).toThrow(/illegal target/);
    expect(() => act(s, { type: 'target', player: 1, targets: [unit(foe.uid)] })).toThrow(
      /does not have priority/,
    );
    s = act(s, { type: 'target', player: 0, targets: [unit(foe.uid)] });
    expect(events()).toContainEqual({
      type: 'AbilityTargeted',
      id: s.stack[0]!.id,
      targets: [unit(foe.uid)],
    });
    // The opponent now gets a chance to respond, then it resolves.
    expect(s.priority).toBe(1);
    expect(u(s, foe.uid).damage).toBe(0);
    s = pass(s);
    expect(u(s, foe.uid).damage).toBe(1);
    expect(s.stack).toEqual([]);
    expect(s.priority).toBe(0);
  });

  it('an ability with no targets to choose goes on the stack and the opponent may respond', () => {
    let s = setup({ mana: 4 });
    s.players[0].deck = [FILLER, FILLER, FILLER];
    s = playBare(s, 'tide-pearl-diver');
    expect(s.stack[0]).toMatchObject({ kind: 'ability', targets: [] });
    expect(s.priority).toBe(1);
    expect(s.players[0].hand).toHaveLength(0);
    s = pass(s);
    expect(s.players[0].hand).toHaveLength(1);
  });

  it('with no legal target the ability still resolves its untargeted parts', () => {
    let s = setup({ mana: 3 });
    s = playBare(s, 'ember-torchbearer');
    expect(s.stack[0]).toMatchObject({ kind: 'ability', targets: [] });
    s = pass(s);
    expect(s.stack).toEqual([]);
  });

  it('targets given up front still work (the AI plays this way)', () => {
    let s = setup({ mana: 3 });
    const foe = place(s, 1, FILLER);
    s = playBare(s, 'ember-torchbearer', [unit(foe.uid)]);
    expect(s.stack[0]).toMatchObject({ kind: 'ability', targets: [unit(foe.uid)] });
    expect(s.priority).toBe(1);
    s = pass(s);
    expect(u(s, foe.uid).damage).toBe(1);
  });

  it('the ability still resolves if its unit dies in response, and fizzles if the unit is silenced or the target leaves', () => {
    let s = setup({ mana: 8 });
    const foe = place(s, 1, FILLER);
    s = playBare(s, 'ember-torchbearer', [unit(foe.uid)]);
    s.boards[0][0]!.doomed = true;
    s.boards[1][0]!.damage = 0;
    s = pass(s);
    expect(u(s, foe.uid).damage).toBe(1);

    s = setup({ mana: 8 });
    const foe2 = place(s, 1, FILLER);
    s = playBare(s, 'ember-torchbearer', [unit(foe2.uid)]);
    s.boards[0][0]!.silenced = true;
    s = pass(s);
    expect(u(s, foe2.uid).damage).toBe(0);
    expect(events()).toContainEqual(expect.objectContaining({ type: 'Fizzled', reason: 'silenced' }));

    s = setup({ mana: 8 });
    const foe3 = place(s, 1, FILLER);
    s = playBare(s, 'ember-torchbearer', [unit(foe3.uid)]);
    s.boards[1].length = 0;
    pass(s);
    expect(events()).toContainEqual(expect.objectContaining({ type: 'Fizzled', reason: 'targets gone' }));
  });

  it('Discover from an On Play opens its choice once the ability resolves', () => {
    let s = setup({ mana: 2 });
    s = playBare(s, 'tide-shoal-crab');
    expect(s.pending).toBeUndefined();
    s = pass(s);
    expect(s.pending?.[0]?.player).toBe(0);
    expect(s.pending![0]!.options.every((id) => getCard(id).type === 'spell')).toBe(true);
  });

  it('Quick units can attack once their ability has resolved', () => {
    let s = setup({ mana: 8 });
    s = playBare(s, 'ember-volcano-lord');
    expect(s.stack).toHaveLength(1);
    s = pass(s);
    expect(s.stack).toEqual([]);
    expect(legalActions(s).some((a) => a.type === 'attack')).toBe(true);
  });
});
