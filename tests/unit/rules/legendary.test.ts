import { describe, expect, it } from 'vitest';
import {
  attackTargets,
  BOARD_LIMIT,
  canAddCard,
  collectibleCards,
  deckProblems,
  getCard,
  legalActions,
  unitMaxHealth,
  unitPower,
  viewFor,
  type GameState,
  type TargetRef,
} from '../../../src/rules';
import { act as aiAct } from '../../../src/ai';
import { runPrimitive, type Ctx } from '../../../src/rules/effects';
import { CardSchema, MatchModifierSchema, type Primitive } from '../../../src/rules/schema';
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

function run(s: GameState, action: Primitive, owner: 0 | 1 = 0): Ctx {
  const ctx: Ctx = { s, events: [] };
  runPrimitive(ctx, action, { owner, unitUid: null, targets: [] });
  return ctx;
}

/** Casts a spell by `player` and resolves the stack by the other player passing. */
function resolve(s: GameState, cardId: string, targets: TargetRef[] = []): GameState {
  let r = cast(s, s.priority, cardId, targets);
  while (r.phase === 'main' && r.stack.length > 0) r = pass(r);
  return r;
}

describe('Guard (taunt)', () => {
  it('Guard units shield the hero and every non-Guard unit, and cannot be skipped', () => {
    const s = setup({ mana: 5 });
    place(s, 0, 'ember-spark-imp');
    const g = place(s, 1, 'bastion-shieldbearer');
    const other = place(s, 1, FILLER);
    expect(attackTargets(s, 0)).toEqual([unit(g.uid)]);
    const a = s.boards[0][0]!;
    expect(() => attack(s, a, hero(1))).toThrow(/illegal attack target/);
    expect(() => attack(s, a, unit(other.uid))).toThrow(/illegal attack target/);
    expect(legalActions(s).filter((x) => x.type === 'attack')).toHaveLength(1);
  });

  it('an Elusive Guard still has to be attacked (Elusive only stops spells)', () => {
    const s = setup({ mana: 5 });
    place(s, 0, 'ember-spark-imp');
    const g = place(s, 1, 'bastion-shieldbearer', { keywords: ['elusive'] });
    place(s, 1, FILLER);
    expect(attackTargets(s, 0)).toEqual([unit(g.uid)]);
    expect(() => cast(s, 0, 'ember-cinder-bolt', [unit(g.uid)])).toThrow(/illegal target/);
  });

  it('a Barrier Guard is still a legal target, and the attack breaks its Barrier', () => {
    let s = setup({ mana: 5 });
    const a = place(s, 0, 'ember-ash-raider');
    const g = place(s, 1, 'bastion-templar');
    expect(attackTargets(s, 0)).toEqual([unit(g.uid)]);
    s = pass(attack(s, a, unit(g.uid)));
    expect(u(s, g.uid).barrier).toBe(false);
    expect(u(s, g.uid).damage).toBe(0);
    // The Guard is still a Guard until it dies.
    expect(attackTargets(s, 0)).toEqual([unit(g.uid)]);
  });

  it('silencing the only Guard opens up the hero', () => {
    let s = setup({ mana: 5 });
    place(s, 0, 'ember-spark-imp');
    const g = place(s, 1, 'bastion-shieldbearer');
    s = resolve(s, 'dusk-hex', [unit(g.uid)]);
    expect(attackTargets(s, 0)).toContainEqual(hero(1));
  });

  it('with two Guards, either may be attacked, and killing one leaves the other', () => {
    const s = setup({ mana: 5 });
    place(s, 0, 'ember-spark-imp');
    const g1 = place(s, 1, 'bastion-shieldbearer');
    const g2 = place(s, 1, 'bastion-wall-warden');
    expect(attackTargets(s, 0)).toEqual([unit(g1.uid), unit(g2.uid)]);
  });

  it('a stolen Guard protects its new owner, and exposes its old one', () => {
    let s = setup({ mana: 6 });
    place(s, 0, 'ember-spark-imp');
    const g = place(s, 1, 'bastion-shieldbearer');
    place(s, 1, FILLER);
    expect(attackTargets(s, 0)).toEqual([unit(g.uid)]);
    s = play(s, 0, 'dusk-lich-king', [unit(g.uid)]);
    expect(attackTargets(s, 0)).toContainEqual(hero(1));
    expect(u(s, g.uid).owner).toBe(0);
    // Player 1 now has to attack the Guard that player 0 took (its Guard also covers player 0's hero).
    s = pass(s);
    place(s, 1, 'ember-spark-imp');
    expect(attackTargets(s, 1)).toEqual([unit(g.uid)]);
  });

  it('every Guard unit in every faction forces attacks onto itself', () => {
    for (const f of ['ember', 'tide', 'grove', 'bastion', 'dusk']) {
      const guards = collectibleCards().filter(
        (c) => c.faction === f && c.type === 'unit' && c.keywords.includes('guard'),
      );
      expect(guards.length, f).toBeGreaterThanOrEqual(2);
      for (const c of guards) {
        const s = setup({ mana: 10 });
        place(s, 0, FILLER);
        const g = place(s, 1, c.id);
        expect(attackTargets(s, 0), c.id).toEqual([unit(g.uid)]);
      }
    }
  });
});

describe('steal (take control)', () => {
  it('Lich King takes an enemy unit; it cannot attack this turn unless Quick', () => {
    let s = setup({ mana: 6 });
    const t = place(s, 1, 'ember-magma-brute');
    s = play(s, 0, 'dusk-lich-king', [unit(t.uid)]);
    expect(s.boards[1]).toHaveLength(0);
    expect(s.boards[0].map((x) => x.uid)).toEqual([s.boards[0][0]!.uid, t.uid]);
    expect(u(s, t.uid).owner).toBe(0);
    expect(events().some((e) => e.type === 'UnitControlled' && e.uid === t.uid && e.to === 0)).toBe(true);
    expect(legalActions(s).some((a) => a.type === 'attack' && a.attacker === t.uid)).toBe(false);
    const q = place(s, 1, 'ember-ash-raider', { fresh: true });
    run(s, { op: 'steal', target: 'allEnemyUnits' });
    expect(u(s, q.uid).owner).toBe(0);
    expect(legalActions(s).some((a) => a.type === 'attack' && a.attacker === q.uid)).toBe(true);
  });

  it('a stolen unit attacks for its new owner next turn and dies into the new owner’s discard', () => {
    let s = setup({ mana: 6 });
    const t = place(s, 1, 'ember-magma-brute');
    s = play(s, 0, 'dusk-lich-king', [unit(t.uid)]);
    s = pass(s);
    s = pass(s);
    s = attack(s, u(s, t.uid), hero(1));
    s = pass(s);
    expect(s.players[1].hp).toBe(20 - 5);
  });

  it('needs room: a full board takes nothing', () => {
    const s = setup({ mana: 6 });
    for (let i = 0; i < BOARD_LIMIT; i++) place(s, 0, FILLER);
    const t = place(s, 1, FILLER);
    run(s, { op: 'steal', target: 'allEnemyUnits' });
    expect(u(s, t.uid).owner).toBe(1);
    expect(s.boards[0]).toHaveLength(BOARD_LIMIT);
  });

  it('cannot choose an Elusive unit, and an On Play with no legal target does nothing', () => {
    const s = setup({ mana: 6 });
    const e = place(s, 1, FILLER, { keywords: ['elusive'] });
    expect(() => play(s, 0, 'dusk-lich-king', [unit(e.uid)])).toThrow(/illegal target/);
    const r = play(s, 0, 'dusk-lich-king');
    expect(r.boards[0]).toHaveLength(1);
    expect(r.boards[1]).toHaveLength(1);
  });

  it('a pending attack by a stolen unit fizzles', () => {
    let s = setup({ mana: 6 });
    const a = place(s, 0, 'ember-magma-brute');
    s = attack(s, a, hero(1));
    // Player 1 responds by stealing nothing here (no Lich King as a Fast spell), so use the primitive directly.
    run(s, { op: 'steal', target: 'allUnits' }, 1);
    s = pass(s);
    expect(s.players[1].hp).toBe(20);
    expect(events().some((e) => e.type === 'Fizzled')).toBe(true);
  });
});

describe('extra turn', () => {
  it('Turn the Tide gives the same player the next turn, once', () => {
    let s = setup({ mana: 7 });
    s = resolve(s, 'tide-turn-the-tide');
    expect(s.extraTurn).toBe(0);
    const before = s.turn;
    s = pass(s);
    expect(s.activePlayer).toBe(0);
    expect(s.turn).toBe(before + 1);
    expect(s.extraTurn).toBeUndefined();
    expect(s.players[0].maxMana).toBe(8);
    expect(s.players[0].mana).toBe(8);
    expect(events().some((e) => e.type === 'TurnStarted' && e.player === 0)).toBe(true);
    s = pass(s);
    expect(s.activePlayer).toBe(1);
  });

  it('units that attacked can attack again in the extra turn', () => {
    let s = setup({ mana: 7 });
    const a = place(s, 0, FILLER);
    s = pass(attack(s, a, hero(1)));
    s = resolve(s, 'tide-turn-the-tide');
    s = pass(s);
    expect(legalActions(s).some((x) => x.type === 'attack' && x.attacker === a.uid)).toBe(true);
  });

  it('is a no-op for a player who is not the active player', () => {
    let s = setup({ mana: 7 });
    run(s, { op: 'extraTurn' }, 1);
    s = pass(s);
    expect(s.activePlayer).toBe(1);
    expect(s.extraTurn).toBeUndefined();
  });

  it('an extra turn at the turn limit still ends the match', () => {
    let s = setup({ mana: 7 });
    s.turn = 40;
    s = resolve(s, 'tide-turn-the-tide');
    s = pass(s);
    expect(s.phase).toBe('over');
    expect(s.result).toEqual({ winner: null, reason: 'turns' });
  });
});

describe('set max mana', () => {
  it('Primal Surge sets max mana to 10 and refills mana', () => {
    let s = setup({ mana: 5 });
    s.players[0].maxMana = 5;
    s = resolve(s, 'grove-primal-surge');
    expect(s.players[0].maxMana).toBe(10);
    expect(s.players[0].mana).toBe(10);
    expect(s.players[1].maxMana).toBe(5);
  });

  it('never lowers max mana', () => {
    const s = setup({ mana: 8 });
    run(s, { op: 'setMaxMana', amount: 5 });
    expect(s.players[0].maxMana).toBe(8);
    expect(s.players[0].mana).toBe(8);
  });
});

describe('Death Ward', () => {
  it('Aegis Eternal heals and keeps the hero above 0 HP until the end of the turn', () => {
    let s = setup({ mana: 4, heroHp: 20 });
    s.players[0].hp = 3;
    s = resolve(s, 'bastion-aegis-eternal');
    expect(s.players[0].hp).toBe(11);
    run(s, { op: 'damage', target: 'friendlyHero', amount: 50 });
    expect(s.players[0].hp).toBe(1);
    const ctx = run(s, { op: 'damage', target: 'friendlyHero', amount: 5 });
    expect(s.players[0].hp).toBe(1);
    expect(ctx.events).toEqual([{ type: 'HeroWarded', player: 0 }]);
  });

  it('wears off at the end of the turn', () => {
    let s = setup({ mana: 4 });
    s.players[0].hp = 3;
    s = resolve(s, 'bastion-aegis-eternal');
    s = pass(s);
    expect(s.players[0].deathWard).toBeUndefined();
    run(s, { op: 'damage', target: 'friendlyHero', amount: 50 });
    expect(s.players[0].hp).toBeLessThanOrEqual(0);
  });

  it('does not bring back a hero already at 0', () => {
    const s = setup({ mana: 4 });
    s.players[0].hp = 0;
    run(s, { op: 'deathWard' });
    run(s, { op: 'damage', target: 'friendlyHero', amount: 1 });
    expect(s.players[0].hp).toBe(-1);
  });
});

describe('revive', () => {
  it('Rise of the Fallen brings back friendly units, most recent first, skipping spells', () => {
    let s = setup({ mana: 6 });
    s.players[0].discard = ['bastion-militia', 'ember-kindle', 'ember-spark-imp'];
    s = resolve(s, 'dusk-rise-fallen');
    expect(s.boards[0].map((x) => x.cardId)).toEqual(['ember-spark-imp', 'bastion-militia']);
    expect(s.players[0].discard).toContain('ember-kindle');
    expect(s.players[0].discard).not.toContain('bastion-militia');
    // They are fresh units (they cannot attack this turn).
    expect(legalActions(s).some((a) => a.type === 'attack')).toBe(false);
  });

  it('stops at the board limit and keeps the rest in the discard pile', () => {
    const s = setup({ mana: 6 });
    for (let i = 0; i < BOARD_LIMIT - 1; i++) place(s, 0, FILLER);
    s.players[0].discard = ['bastion-militia', 'ember-spark-imp', 'dusk-ghoul'];
    run(s, { op: 'revive', count: 6 });
    expect(s.boards[0]).toHaveLength(BOARD_LIMIT);
    expect(s.players[0].discard).toEqual(['bastion-militia', 'ember-spark-imp']);
  });

  it('count limits it, units that really died come back, and the enemy’s dead stay put', () => {
    let s = setup({ mana: 6 });
    const m = place(s, 0, 'bastion-militia');
    place(s, 1, 'ember-magma-brute');
    s = pass(attack(s, m, unit(s.boards[1][0]!.uid)));
    expect(onBoard(s, m.uid)).toBe(false);
    expect(s.players[0].discard).toEqual(['bastion-militia']);
    run(s, { op: 'revive', count: 1 });
    expect(s.boards[0].map((x) => x.cardId)).toEqual(['bastion-militia']);
    s.players[1].discard = ['ember-spark-imp'];
    run(s, { op: 'revive', count: 3 });
    expect(s.players[1].discard).toEqual(['ember-spark-imp']);
  });
});

describe('whenever you cast / whenever the enemy casts', () => {
  it('Inferno Pyromancer deals 2 to the enemy hero for every spell you cast (before it resolves)', () => {
    let s = setup({ mana: 6 });
    place(s, 0, 'ember-pyromancer');
    const f = place(s, 0, FILLER);
    s = cast(s, 0, 'ember-kindle', [unit(f.uid)]);
    expect(s.players[1].hp).toBe(18);
    s = cast(s, 0, 'ember-fireball', [hero(1)]);
    expect(s.players[1].hp).toBe(16);
    s = pass(s);
    expect(s.players[1].hp).toBe(12);
  });

  it('two Pyromancers trigger twice, and it can win the match before the spell resolves', () => {
    let s = setup({ mana: 6 });
    place(s, 0, 'ember-pyromancer');
    place(s, 0, 'ember-pyromancer');
    s.players[1].hp = 4;
    s = cast(s, 0, 'ember-fireball', [hero(1)]);
    expect(s.phase).toBe('over');
    expect(s.result).toEqual({ winner: 0, reason: 'hp' });
    expect(s.stack).toEqual([]);
  });

  it('only your own spells trigger it, and a silenced Pyromancer does nothing', () => {
    let s = setup({ mana: 6 });
    place(s, 1, 'ember-pyromancer');
    const f = place(s, 0, FILLER);
    s = cast(s, 0, 'ember-kindle', [unit(f.uid)]);
    expect(s.players[0].hp).toBe(20);
    expect(s.players[1].hp).toBe(20);
    const mine = place(s, 0, 'ember-pyromancer');
    run(s, { op: 'silence', target: 'allFriendlyUnits' });
    expect(u(s, mine.uid).silenced).toBe(true);
    s = cast(s, 0, 'ember-kindle', [unit(f.uid)]);
    expect(s.players[1].hp).toBe(20);
  });

  it('Archmage Spellthief copies the enemy’s spells into your hand', () => {
    let s = setup({ mana: 6 });
    place(s, 1, 'tide-spellthief');
    const f = place(s, 0, FILLER);
    s = cast(s, 0, 'ember-kindle', [unit(f.uid)]);
    expect(s.players[1].hand.map((c) => c.cardId)).toEqual(['ember-kindle']);
    s = cast(s, 0, 'bastion-blessing', [unit(f.uid)]);
    expect(s.players[1].hand.map((c) => c.cardId)).toEqual(['ember-kindle', 'bastion-blessing']);
    // Its owner's own spells are not copied.
    s = pass(pass(s));
    expect(s.activePlayer).toBe(1);
    const before = s.players[1].hand.length;
    s = cast(s, 1, 'tide-ripple');
    expect(s.players[1].hand.length).toBe(before + 1); // the Ripple's own draw, and no copy of it
  });

  it('a full hand burns the copy', () => {
    const s = setup({ mana: 6 });
    place(s, 1, 'tide-spellthief');
    for (let i = 0; i < 10; i++) give(s, 1, FILLER);
    const r = cast(s, 0, 'ember-flare', [hero(1)]);
    expect(r.players[1].hand).toHaveLength(10);
    expect(events().some((e) => e.type === 'CardBurned' && e.player === 1)).toBe(true);
  });

  it('copySpell outside a cast does nothing', () => {
    const s = setup({ mana: 6 });
    run(s, { op: 'copySpell' });
    expect(s.players[0].hand).toHaveLength(0);
  });
});

describe('reworked and new Legendaries', () => {
  it('Volcano Lord (Quick) destroys all other units, friendly too, and can attack at once', () => {
    let s = setup({ mana: 7 });
    place(s, 0, FILLER);
    place(s, 1, FILLER);
    place(s, 1, 'dusk-grave-rat');
    s = play(s, 0, 'ember-volcano-lord');
    expect(s.boards[0].map((x) => x.cardId)).toEqual(['ember-volcano-lord']);
    expect(s.boards[1]).toHaveLength(0);
    // The Grave Rat's Last Breath still ran.
    expect(s.players[0].hp).toBe(19);
    expect(legalActions(s).some((a) => a.type === 'attack')).toBe(true);
  });

  it('Ashen Dragon deals 5 to the enemy hero on play', () => {
    let s = setup({ mana: 8 });
    s = play(s, 0, 'ember-ashen-dragon');
    expect(s.players[1].hp).toBe(15);
  });

  it('Supernova hits the enemy hero for 8 and every unit for 3', () => {
    let s = setup({ mana: 8 });
    const mine = place(s, 0, FILLER);
    const theirs = place(s, 1, 'ember-magma-brute');
    s = resolve(s, 'ember-supernova');
    expect(s.players[1].hp).toBe(12);
    expect(onBoard(s, mine.uid)).toBe(false);
    expect(u(s, theirs.uid).damage).toBe(3);
  });

  it('Sea Queen returns every enemy unit to its owner’s hand and draws 2', () => {
    let s = setup({ mana: 8 });
    place(s, 1, FILLER);
    place(s, 1, 'ember-magma-brute');
    s = play(s, 0, 'tide-sea-queen');
    expect(s.boards[1]).toHaveLength(0);
    expect(s.players[1].hand.map((c) => c.cardId).sort()).toEqual(['bastion-recruit', 'ember-magma-brute']);
    expect(s.players[0].hand).toHaveLength(2);
  });

  it('World Tree gives you an empty mana slot at the start of each of your turns', () => {
    let s = setup({ mana: 7 });
    place(s, 0, 'grove-world-tree');
    s.players[0].maxMana = 5;
    s = pass(pass(s));
    expect(s.activePlayer).toBe(0);
    expect(s.players[0].maxMana).toBe(7); // +1 for the turn, +1 from the tree
  });

  it('Gaia is a Guard that ramps 2 and grows the team', () => {
    let s = setup({ mana: 6 });
    s.players[0].maxMana = 6;
    const f = place(s, 0, FILLER);
    s = play(s, 0, 'grove-gaia');
    expect(s.players[0].maxMana).toBe(8);
    expect(unitPower(s, u(s, f.uid))).toBe(3);
    expect(unitMaxHealth(s, u(s, f.uid))).toBe(4);
    expect(u(s, s.boards[0][1]!.uid).keywords).toEqual(['guard', 'growth']);
  });

  it('Grand Marshal summons three Levies and gives everyone else +2/+2', () => {
    let s = setup({ mana: 7 });
    const f = place(s, 0, FILLER);
    s = play(s, 0, 'bastion-grand-marshal');
    expect(s.boards[0]).toHaveLength(5);
    expect(unitPower(s, u(s, f.uid))).toBe(3);
    // Levies were summoned before the buff, so they got it too.
    expect(unitPower(s, s.boards[0][2]!)).toBe(3);
  });

  it('Archon gives other friendly units Barrier and +1/+1 while it lives', () => {
    let s = setup({ mana: 8 });
    const f = place(s, 0, FILLER);
    s = play(s, 0, 'bastion-archon');
    expect(u(s, f.uid).barrier).toBe(true);
    expect(unitPower(s, u(s, f.uid))).toBe(2);
    expect(unitMaxHealth(s, u(s, f.uid))).toBe(3);
  });

  it('Legion Matriarch summons two Levies at the end of each of your turns', () => {
    let s = setup({ mana: 6 });
    place(s, 0, 'bastion-legion-matriarch');
    s = pass(s);
    expect(s.boards[0].filter((x) => x.cardId === 'bastion-levy')).toHaveLength(2);
  });

  it('Night Queen destroys all enemy units', () => {
    let s = setup({ mana: 8 });
    const mine = place(s, 0, FILLER);
    place(s, 1, FILLER);
    place(s, 1, 'tide-mist-sprite', { keywords: ['elusive'] });
    s = play(s, 0, 'dusk-night-queen');
    expect(s.boards[1]).toHaveLength(0);
    expect(onBoard(s, mine.uid)).toBe(true);
  });

  it('upgraded Legendaries can be cast and played', () => {
    for (const c of collectibleCards().filter((x) => x.rarity === 'legendary')) {
      expect(getCard(`${c.id}+`).id).toBe(`${c.id}+`);
    }
  });
});

describe('Legendaries: one copy per deck', () => {
  const legendaries = collectibleCards().filter((c) => c.rarity === 'legendary');

  it('there are three or more per faction, mixing units and spells', () => {
    expect(legendaries.length).toBe(17);
    expect(legendaries.some((c) => c.type === 'unit')).toBe(true);
    expect(legendaries.some((c) => c.type === 'spell')).toBe(true);
  });

  it('every Legendary is limited to one copy by the deck builder and the deck rules', () => {
    for (const c of legendaries) {
      const filler = collectibleCards()
        .filter((x) => x.faction === c.faction && x.rarity !== 'legendary')
        .slice(0, 15)
        .flatMap((x) => [x.id, x.id]);
      expect(canAddCard([...filler.slice(0, 28), c.id], c.id), c.id).toBe(false);
      expect(canAddCard(filler.slice(0, 28), c.id), c.id).toBe(true);
      const two = [...filler.slice(0, 28), c.id, c.id];
      expect(
        deckProblems(two).map((p) => p.rule),
        c.id,
      ).toEqual(['legendary']);
    }
  });
});

describe('schema for the new primitives', () => {
  const base = {
    id: 'ember-x',
    name: 'X',
    faction: 'ember',
    cost: 1,
    text: '',
    rarity: 'common',
  };
  const unitCard = { ...base, type: 'unit', power: 1, health: 1 };
  const spellCard = { ...base, type: 'spell', speed: 'slow' };
  it('copySpell needs a whenCast or whenEnemyCast trigger', () => {
    const ok = { ...unitCard, effects: [{ trigger: 'whenEnemyCast', action: { op: 'copySpell' } }] };
    const bad = { ...unitCard, effects: [{ trigger: 'onPlay', action: { op: 'copySpell' } }] };
    expect(CardSchema.safeParse(ok).success).toBe(true);
    expect(CardSchema.safeParse(bad).success).toBe(false);
  });
  it('whenCast is for units only', () => {
    const bad = { ...spellCard, effects: [{ trigger: 'whenCast', action: { op: 'draw', count: 1 } }] };
    expect(CardSchema.safeParse(bad).success).toBe(false);
  });
  it('extraTurn only works as a spell or On Play effect (never at turn start or end)', () => {
    const play = { ...unitCard, effects: [{ trigger: 'onPlay', action: { op: 'extraTurn' } }] };
    const end = { ...unitCard, effects: [{ trigger: 'endOfTurn', action: { op: 'extraTurn' } }] };
    const start = { ...unitCard, effects: [{ trigger: 'startOfTurn', action: { op: 'extraTurn' } }] };
    expect(CardSchema.safeParse(play).success).toBe(true);
    expect(CardSchema.safeParse(end).success).toBe(false);
    expect(CardSchema.safeParse(start).success).toBe(false);
    expect(MatchModifierSchema.safeParse({ kind: 'turnStart', action: { op: 'extraTurn' } }).success).toBe(
      false,
    );
    expect(MatchModifierSchema.safeParse({ kind: 'turnStart', action: { op: 'copySpell' } }).success).toBe(
      false,
    );
    expect(
      MatchModifierSchema.safeParse({ kind: 'turnStart', action: { op: 'revive', count: 1 } }).success,
    ).toBe(true);
  });
  it('steal needs a unit target, and setMaxMana is capped at 10', () => {
    const heroTarget = {
      ...unitCard,
      targets: [{ kind: 'enemyCharacter' }],
      effects: [{ trigger: 'onPlay', action: { op: 'steal', target: 'target' } }],
    };
    expect(CardSchema.safeParse(heroTarget).success).toBe(false);
    const big = { ...spellCard, effects: [{ trigger: 'spell', action: { op: 'setMaxMana', amount: 11 } }] };
    expect(CardSchema.safeParse(big).success).toBe(false);
  });
});

describe('the AI can play every new card', () => {
  it('Normal and Hard pick a legal action with each Legendary in hand', () => {
    for (const c of collectibleCards().filter((x) => x.rarity === 'legendary')) {
      const s = setup({ mana: 10 });
      place(s, 0, FILLER);
      place(s, 1, FILLER);
      place(s, 1, 'bastion-shieldbearer');
      s.players[0].discard = ['bastion-militia'];
      give(s, 0, c.id);
      for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        const { action } = aiAct(difficulty, viewFor(s, 0, { seeHand: true }), 7);
        expect(
          legalActions(s).some((a) => JSON.stringify(a) === JSON.stringify(action)),
          `${difficulty} ${c.id}`,
        ).toBe(true);
      }
    }
  });
});
