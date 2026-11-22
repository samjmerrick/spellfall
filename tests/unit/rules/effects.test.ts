import { describe, expect, it } from 'vitest';
import { BOARD_LIMIT, legalActions, unitMaxHealth, unitPower, type GameState } from '../../../src/rules';
import { runPrimitive, runTrigger, type Ctx, type Source } from '../../../src/rules/effects';
import type { Primitive } from '../../../src/rules/schema';
import {
  attack,
  cast,
  events,
  FILLER,
  give,
  hero,
  onBoard,
  pass,
  place,
  play,
  setup,
  u,
  unit,
} from './helpers';

function run(s: GameState, action: Primitive, src: Partial<Source> = {}): Ctx {
  const ctx: Ctx = { s, events: [] };
  runPrimitive(ctx, action, { owner: 0, unitUid: null, targets: [], ...src });
  return ctx;
}

describe('triggers', () => {
  it('On Play targets are chosen as the unit is played and resolve at once', () => {
    let s = setup({ mana: 2 });
    const d = place(s, 1, FILLER);
    s = play(s, 0, 'ember-torchbearer', [unit(d.uid)]);
    expect(u(s, d.uid).damage).toBe(1);
    expect(s.stack).toEqual([]);
    expect(s.priority).toBe(0);
  });

  it('a unit whose On Play has no legal target can be played without one, but not otherwise', () => {
    let s = setup({ mana: 4 });
    s = play(s, 0, 'ember-torchbearer');
    expect(s.boards[0]).toHaveLength(1);
    place(s, 1, FILLER);
    expect(() => play(s, 0, 'ember-torchbearer')).toThrow(/needs targets/);
  });

  it('On Play targets may be heroes where the card allows', () => {
    let s = setup({ mana: 3 });
    s = play(s, 0, 'ember-skyfire-archer', [hero(1)]);
    expect(s.players[1].hp).toBe(19);
    expect(() => play(s, 0, 'ember-skyfire-archer', [hero(0)])).toThrow();
  });

  it('Last Breath resolves when the unit dies', () => {
    let s = setup({ mana: 5 });
    const t = place(s, 1, 'ember-inferno-titan');
    t.damage = 4;
    s = pass(cast(s, 0, 'ember-cinder-bolt', [unit(t.uid)]));
    expect(onBoard(s, t.uid)).toBe(false);
    expect(s.players[0].hp).toBe(18);
    expect(s.players[1].discard).toContain('ember-inferno-titan');
  });

  it('End of Turn effects resolve for the active player’s units', () => {
    let s = setup();
    const c = place(s, 0, 'bastion-high-cleric');
    const m = place(s, 0, 'bastion-militia', { damage: 2 });
    c.damage = 1;
    s.players[0].hp = 15;
    s = pass(s);
    expect(u(s, m.uid).damage).toBe(0);
    expect(u(s, c.uid).damage).toBe(0);
    expect(s.players[0].hp).toBe(16);
  });

  it('turnStart modifiers run at the start of the owner’s listed turns', () => {
    let s = setup({
      modifiers: [
        [],
        [{ kind: 'turnStart', turns: [1], action: { op: 'damage', target: 'enemyHero', amount: 2 } }],
      ],
    });
    s = pass(s);
    expect(s.players[0].hp).toBe(18);
    s = pass(pass(s));
    expect(s.players[0].hp).toBe(18);
  });

  it('a silenced unit has no triggers', () => {
    const s = setup();
    const t = place(s, 0, 'ember-inferno-titan');
    run(s, { op: 'silence', target: 'target' }, { targets: [unit(t.uid)] });
    const ctx: Ctx = { s, events: [] };
    runTrigger(ctx, t, 'lastBreath');
    expect(s.players[1].hp).toBe(20);
  });
});

describe('ongoing', () => {
  it('adjacent units get the aura; position matters', () => {
    let s = setup({ mana: 10 });
    const left = place(s, 0, FILLER);
    const far = place(s, 0, FILLER);
    s = play(s, 0, 'ember-war-drummer', [], 1);
    expect(s.boards[0].map((x) => x.uid)).toEqual([left.uid, s.boards[0][1]!.uid, far.uid]);
    expect(unitPower(s, u(s, left.uid))).toBe(2);
    expect(unitPower(s, u(s, far.uid))).toBe(2);
    s = play(s, 0, FILLER, [], 0);
    expect(unitPower(s, s.boards[0][0]!)).toBe(1);
  });

  it('losing a Health aura can kill a damaged unit', () => {
    let s = setup({ mana: 5 });
    const bearer = place(s, 1, 'bastion-standard-bearer');
    const m = place(s, 1, FILLER, { damage: 2 });
    expect(unitMaxHealth(s, u(s, m.uid))).toBe(3);
    bearer.damage = 2;
    s = pass(cast(s, 0, 'ember-cinder-bolt', [unit(bearer.uid)]));
    expect(onBoard(s, bearer.uid)).toBe(false);
    expect(onBoard(s, m.uid)).toBe(false);
  });
});

describe('primitives', () => {
  it('summon fills the board up to 6 and no further', () => {
    let s = setup({ mana: 10 });
    for (let i = 0; i < 5; i++) place(s, 0, FILLER);
    s = pass(cast(s, 0, 'bastion-call-to-arms'));
    expect(s.boards[0]).toHaveLength(BOARD_LIMIT);
    expect(() => play(s, 0, FILLER)).toThrow(/full/);
    expect(legalActions(s).some((a) => a.type === 'playUnit')).toBe(false);
  });

  it('summoned units cannot attack the turn they arrive', () => {
    let s = setup({ mana: 3 });
    s = play(s, 0, 'bastion-muster-captain');
    expect(s.boards[0]).toHaveLength(2);
    expect(() => attack(s, s.boards[0][1]!, hero(1))).toThrow(/cannot attack/);
  });

  it('bounce returns a unit to its owner’s hand; tokens vanish; a full hand burns it', () => {
    const s = setup();
    const a = place(s, 1, 'bastion-militia');
    const t = place(s, 1, 'bastion-levy');
    run(s, { op: 'bounce', target: 'allEnemyUnits' });
    expect(s.boards[1]).toEqual([]);
    expect(s.players[1].hand.map((c) => c.cardId)).toEqual(['bastion-militia']);
    expect(a.uid).not.toBe(t.uid);
    for (let i = 0; i < 9; i++) give(s, 1, FILLER);
    place(s, 1, 'bastion-militia');
    const ctx = run(s, { op: 'bounce', target: 'allEnemyUnits' });
    expect(ctx.events.some((e) => e.type === 'CardBurned')).toBe(true);
  });

  it('silence removes keywords, buffs and effects', () => {
    const s = setup();
    const p = place(s, 1, 'bastion-paladin', { keywords: ['guard'] });
    p.basePower += 3;
    run(s, { op: 'silence', target: 'target' }, { targets: [unit(p.uid)] });
    expect(p).toMatchObject({ keywords: [], barrier: false, basePower: 3, silenced: true });
  });

  it('counter removes a spell from the stack', () => {
    let s = setup({ mana: 5 });
    s = cast(s, 0, 'ember-fireball', [hero(1)]);
    const id = s.stack[0]!.id;
    const ctx = run(s, { op: 'counter' }, { owner: 1, targets: [{ kind: 'stack', id }], stackId: 999 });
    expect(s.stack).toEqual([]);
    expect(ctx.events).toContainEqual({ type: 'Countered', id, by: 999 });
    run(s, { op: 'counter' }, { owner: 1, targets: [{ kind: 'stack', id }] });
    run(s, { op: 'counter' }, { owner: 1, targets: [] });
  });

  it('destroy, draw, heal and buff', () => {
    const s = setup();
    const a = place(s, 1, 'bastion-militia', { damage: 2 });
    run(s, { op: 'heal', target: 'allEnemyUnits', amount: 'full' });
    expect(a.damage).toBe(0);
    run(s, { op: 'buff', target: 'allEnemyUnits', power: 1, health: 2, duration: 'permanent' });
    expect(a).toMatchObject({ basePower: 3, baseHealth: 5 });
    run(s, { op: 'destroy', target: 'allEnemyUnits' });
    expect(a.doomed).toBe(true);
    run(s, { op: 'draw', count: 2 });
    expect(s.players[0].hand).toHaveLength(2);
    s.players[0].hp = 18;
    run(s, { op: 'heal', target: 'friendlyHero', amount: 'full' });
    expect(s.players[0].hp).toBe(20);
  });

  it('gainMana is for this turn; gainMaxMana adds an empty slot up to 10', () => {
    const s = setup({ mana: 9 });
    run(s, { op: 'gainMana', amount: 2 });
    expect(s.players[0].mana).toBe(11);
    run(s, { op: 'gainMaxMana', amount: 3 });
    expect(s.players[0].maxMana).toBe(10);
    expect(s.players[0].mana).toBe(11);
    const ctx = run(s, { op: 'gainMaxMana', amount: 1 });
    expect(ctx.events).toEqual([]);
  });

  it('random selectors pick from live units only', () => {
    const s = setup();
    const a = place(s, 1, FILLER);
    run(s, { op: 'damage', target: 'randomEnemyUnit', amount: 1 });
    expect(a.damage).toBe(1);
    const mine = place(s, 0, FILLER);
    run(s, { op: 'buff', target: 'randomFriendlyUnit', power: 1, health: 0, duration: 'turn' });
    expect(mine.turnPower).toBe(1);
    run(s, { op: 'damage', target: 'allUnits', amount: 1 });
    expect(mine.damage).toBe(1);
    expect(events).toBeDefined();
  });

  it('self and adjacent selectors need a source unit', () => {
    const s = setup();
    place(s, 0, FILLER);
    expect(run(s, { op: 'damage', target: 'self', amount: 1 }).events).toEqual([]);
    expect(run(s, { op: 'damage', target: 'adjacentUnits', amount: 1 }).events).toEqual([]);
  });
});

describe('winning', () => {
  it('a hero on 0 HP loses at once, even mid-stack', () => {
    let s = setup({ mana: 10 });
    s.players[1].hp = 4;
    s = cast(s, 0, 'ember-fireball', [hero(1)]);
    s = cast(s, 1, 'bastion-rally-cry');
    s = cast(s, 0, 'ember-cinder-bolt', [unit(place(s, 1, FILLER).uid)]);
    s = pass(s);
    expect(s.result).toEqual({ winner: 0, reason: 'hp' });
    expect(s.phase).toBe('over');
    expect(s.stack).toEqual([]);
  });

  it('both heroes at 0 at the same check is a draw', () => {
    let s = setup({ mana: 10 });
    s.players[0].hp = 2;
    s.players[1].hp = 2;
    // Two damaged Inferno Titans trade; both Last Breaths hit the other hero in the same death check.
    const a = place(s, 0, 'ember-inferno-titan', { damage: 4 });
    const b = place(s, 1, 'ember-inferno-titan', { damage: 4 });
    s = pass(attack(s, a, unit(b.uid)));
    expect(s.result).toEqual({ winner: null, reason: 'hp' });
  });
});
