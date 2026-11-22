import { describe, expect, it } from 'vitest';
import { attackTargets, canAttack, legalActions, unitPower } from '../../../src/rules';
import { attack, cast, events, FILLER, hero, onBoard, pass, place, play, setup, u, unit } from './helpers';

describe('attacks', () => {
  it('an attack goes on the stack; on resolve both units deal damage at the same time', () => {
    let s = setup({ mana: 5 });
    const a = place(s, 0, 'bastion-wall-warden'); // 2/5
    const d = place(s, 1, 'ember-ash-raider'); // 3/1
    s = attack(s, a, unit(d.uid));
    expect(s.stack).toHaveLength(1);
    expect(s.priority).toBe(1);
    expect(onBoard(s, d.uid)).toBe(true);
    s = pass(s);
    expect(onBoard(s, d.uid)).toBe(false);
    expect(u(s, a.uid).damage).toBe(3);
    expect(events().find((e) => e.type === 'Combat')).toMatchObject({ dealt: 2, taken: 3, overwhelm: 0 });
  });

  it('attacking the hero deals Power to it and takes nothing back', () => {
    let s = setup();
    const a = place(s, 0, 'ember-magma-brute');
    s = pass(attack(s, a, hero(1)));
    expect(s.players[1].hp).toBe(15);
    expect(u(s, a.uid).damage).toBe(0);
  });

  it('a unit attacks once per turn, and not on the turn it entered unless Quick', () => {
    let s = setup({ mana: 5 });
    const a = place(s, 0, FILLER);
    s = pass(attack(s, a, hero(1)));
    expect(canAttack(s, u(s, a.uid))).toBe(false);
    expect(() => attack(s, u(s, a.uid), hero(1))).toThrow(/cannot attack/);
    s = play(s, 0, 'bastion-militia');
    s = play(s, 0, 'ember-ash-raider');
    const [, militia, raider] = s.boards[0];
    expect(canAttack(s, militia!)).toBe(false);
    expect(canAttack(s, raider!)).toBe(true);
    // Next own turn, the attack is back.
    s = pass(pass(s));
    expect(canAttack(s, u(s, a.uid))).toBe(true);
  });

  it('units with 0 Power cannot attack, and only the active player attacks', () => {
    const s = setup();
    const zero = place(s, 0, FILLER);
    zero.basePower = 0;
    expect(canAttack(s, zero)).toBe(false);
    const theirs = place(s, 1, FILLER);
    expect(canAttack(s, theirs)).toBe(false);
  });

  it('Guard: while the defender has a Guard unit, only Guard units can be attacked', () => {
    let s = setup();
    const a = place(s, 0, 'ember-magma-brute');
    const plain = place(s, 1, FILLER);
    const guard = place(s, 1, 'bastion-shieldbearer');
    expect(attackTargets(s, 0)).toEqual([unit(guard.uid)]);
    expect(() => attack(s, a, unit(plain.uid))).toThrow(/illegal attack target/);
    expect(() => attack(s, a, hero(1))).toThrow(/illegal attack target/);
    s = pass(attack(s, a, unit(guard.uid)));
    expect(attackTargets(s, 0)).toEqual([hero(1), unit(plain.uid)]);
  });

  it('the defender may respond; an attacker removed in response makes the attack fizzle', () => {
    let s = setup({ mana: 5 });
    const a = place(s, 0, 'ember-ash-raider'); // 3/1
    s = attack(s, a, hero(1));
    s = cast(s, 1, 'ember-cinder-bolt', [unit(a.uid)]);
    s = pass(s);
    expect(onBoard(s, a.uid)).toBe(false);
    expect(s.players[1].hp).toBe(20);
    expect(events().find((e) => e.type === 'Fizzled')).toMatchObject({ reason: 'attacker gone' });
  });

  it('an attack on a unit that is gone by resolution fizzles', () => {
    let s = setup({ mana: 5 });
    const a = place(s, 0, 'ember-magma-brute');
    const d = place(s, 1, 'ember-ash-raider');
    s = attack(s, a, unit(d.uid));
    s = cast(s, 1, 'bastion-rally-cry');
    s = cast(s, 0, 'ember-cinder-bolt', [unit(d.uid)]);
    s = pass(s);
    expect(events().find((e) => e.type === 'Fizzled')).toMatchObject({ reason: 'target gone' });
    expect(u(s, a.uid).damage).toBe(0);
  });

  it('a defender can buff in response, and the buff counts in combat', () => {
    let s = setup({ mana: 5 });
    const a = place(s, 0, 'bastion-militia'); // 2/3
    const d = place(s, 1, FILLER); // 1/2
    s = attack(s, a, unit(d.uid));
    s = cast(s, 1, 'ember-kindle', [unit(d.uid)]);
    expect(unitPower(s, u(s, d.uid))).toBe(3);
    s = pass(s, 1);
    expect(onBoard(s, a.uid)).toBe(false);
  });

  it('attacks are listed in legal actions only with an empty stack in your main phase', () => {
    let s = setup();
    place(s, 0, FILLER);
    expect(legalActions(s).filter((a) => a.type === 'attack')).toHaveLength(1);
    s = cast(s, 0, 'bastion-rally-cry');
    expect(legalActions(s).filter((a) => a.type === 'attack')).toHaveLength(0);
  });
});

describe('keywords', () => {
  it('Barrier prevents the next damage, then is removed', () => {
    let s = setup();
    const a = place(s, 0, 'ember-magma-brute');
    const d = place(s, 1, 'bastion-paladin');
    s = pass(attack(s, a, unit(d.uid)));
    expect(u(s, d.uid).damage).toBe(0);
    expect(u(s, d.uid).barrier).toBe(false);
    expect(u(s, d.uid).keywords).not.toContain('barrier');
    expect(events().some((e) => e.type === 'BarrierBroken')).toBe(true);
  });

  it('Overwhelm: damage beyond the target’s remaining Health hits the hero, even through Barrier', () => {
    let s = setup();
    const a = place(s, 0, 'ember-phoenix'); // 6/5 Overwhelm
    const d = place(s, 1, 'bastion-militia'); // 2/3
    s = pass(attack(s, a, unit(d.uid)));
    expect(s.players[1].hp).toBe(17);
    s = setup();
    const a2 = place(s, 0, 'ember-phoenix');
    const d2 = place(s, 1, 'bastion-paladin'); // 3/3 Barrier
    s = pass(attack(s, a2, unit(d2.uid)));
    expect(s.players[1].hp).toBe(17);
    expect(onBoard(s, d2.uid)).toBe(true);
  });

  it('Lifesteal heals its hero by the damage it deals, attacking or defending', () => {
    let s = setup();
    s.players[0].hp = 10;
    s.players[1].hp = 10;
    const a = place(s, 0, 'bastion-militia', { keywords: ['lifesteal'] });
    const d = place(s, 1, 'ember-magma-brute', { keywords: ['lifesteal'] });
    s = pass(attack(s, a, unit(d.uid)));
    expect(s.players[0].hp).toBe(12);
    // Damage dealt counts in full, even beyond the target's Health.
    expect(s.players[1].hp).toBe(15);
    s = setup();
    s.players[0].hp = 10;
    const b = place(s, 0, 'ember-magma-brute', { keywords: ['lifesteal', 'overwhelm'] });
    const small = place(s, 1, FILLER);
    s = pass(attack(s, b, unit(small.uid)));
    expect(s.players[0].hp).toBe(15);
  });

  it('Lifesteal on a hero attack heals by the Power dealt', () => {
    let s = setup();
    s.players[0].hp = 10;
    const a = place(s, 0, 'bastion-militia', { keywords: ['lifesteal'] });
    s = pass(attack(s, a, hero(1)));
    expect(s.players[0].hp).toBe(12);
  });

  it('Elusive: enemy spells and effects cannot target it until it attacks; it can still be attacked', () => {
    let s = setup({ mana: 5 });
    const e = place(s, 1, FILLER, { keywords: ['elusive'] });
    expect(() => cast(s, 0, 'ember-cinder-bolt', [unit(e.uid)])).toThrow(/illegal target/);
    const a = place(s, 0, 'ember-magma-brute');
    expect(attackTargets(s, 0)).toContainEqual(unit(e.uid));
    // Its owner may still target it.
    s = pass(s);
    s = pass(cast(s, 1, 'bastion-blessing', [unit(e.uid)]));
    expect(onBoard(s, a.uid)).toBe(true);
    s = attack(s, u(s, e.uid), hero(0));
    expect(u(s, e.uid).keywords).not.toContain('elusive');
    s = pass(s);
    s = pass(s);
    s = cast(s, 0, 'ember-cinder-bolt', [unit(e.uid)]);
    expect(s.stack).toHaveLength(1);
  });

  it('Quick units can attack the turn they enter', () => {
    let s = setup({ mana: 2 });
    s = play(s, 0, 'ember-ash-raider');
    const r = s.boards[0][0]!;
    s = pass(attack(s, r, hero(1)));
    expect(s.players[1].hp).toBe(17);
  });

  it('Rally: On Play, other friendly units get +1 Power this turn', () => {
    let s = setup({ mana: 3 });
    const a = place(s, 0, FILLER);
    s = play(s, 0, 'bastion-banner-knight');
    expect(unitPower(s, u(s, a.uid))).toBe(2);
    expect(unitPower(s, s.boards[0][1]!)).toBe(2);
    s = pass(s);
    expect(unitPower(s, u(s, a.uid))).toBe(1);
  });

  it('Growth: End of your turn, +1/+1', () => {
    let s = setup();
    const g = place(s, 0, FILLER, { keywords: ['growth'] });
    s = pass(s);
    expect(u(s, g.uid)).toMatchObject({ basePower: 2, baseHealth: 3 });
    s = pass(s);
    expect(u(s, g.uid)).toMatchObject({ basePower: 2, baseHealth: 3 });
  });

  it('Regenerate: start of your turn, heal fully', () => {
    let s = setup();
    const r = place(s, 1, 'bastion-militia', { keywords: ['regenerate'], damage: 2 });
    s = pass(s);
    expect(u(s, r.uid).damage).toBe(0);
  });

  it('Ephemeral: dies at the end of its owner’s turn', () => {
    let s = setup({ mana: 3 });
    s = play(s, 0, 'ember-pyre-zealot');
    const z = s.boards[0][0]!;
    s = pass(attack(s, z, hero(1)));
    expect(s.players[1].hp).toBe(15);
    s = pass(s);
    expect(onBoard(s, z.uid)).toBe(false);
  });
});
