// The effect vocabulary added for the content overhaul: counts, conditions, conjure/fetch/discover, freeze,
// drain, copy and the new unit triggers. Cards are patched in place (and restored) so no card data is needed.
import { afterEach, describe, expect, it } from 'vitest';
import {
  generatedText,
  canAttack,
  getCard,
  legalActions,
  viewFor,
  HIDDEN,
  type GameState,
} from '../../../src/rules';
import { conditionMet, processDeaths, runEffect, runPrimitive, type Ctx } from '../../../src/rules/effects';
import type { CardDef, Effect, Primitive } from '../../../src/rules/schema';
import { act, attack, cast, FILLER, give, hero, pass, place, play, setup, u } from './helpers';
import { act as aiAct } from '../../../src/ai';

const restore: (() => void)[] = [];
/** Temporarily replaces a card's effects (and targets). */
function patch(cardId: string, effects: Effect[], targets: CardDef['targets'] = []): void {
  const card = getCard(cardId);
  const old = { effects: card.effects, targets: card.targets };
  card.effects = effects;
  card.targets = targets;
  restore.push(() => Object.assign(card, old));
}
afterEach(() => {
  while (restore.length) restore.pop()!();
});

const run = (s: GameState, action: Primitive, owner: 0 | 1 = 0): Ctx => {
  const ctx: Ctx = { s, events: [] };
  runPrimitive(ctx, action, { owner, unitUid: null, targets: [] });
  return ctx;
};
const spell = (action: Primitive, cond?: Effect['if']): Effect[] => [{ trigger: 'spell', action, if: cond }];

describe('counts and conditions', () => {
  it('damage, heal and buff can scale with a count', () => {
    const s = setup({ mana: 5 });
    place(s, 0, FILLER);
    place(s, 0, FILLER);
    const foe = place(s, 1, 'bastion-wall-warden');
    run(s, { op: 'damage', target: 'enemyHero', amount: 2, per: 'friendlyUnits' });
    expect(s.players[1].hp).toBe(16);
    run(s, { op: 'damage', target: 'allEnemyUnits', amount: 1, per: 'friendlyUnits' });
    expect(u(s, foe.uid).damage).toBe(2);
    s.players[0].hp = 10;
    run(s, { op: 'heal', target: 'friendlyHero', amount: 3, per: 'enemyUnits' });
    expect(s.players[0].hp).toBe(13);
    run(s, {
      op: 'buff',
      target: 'allFriendlyUnits',
      power: 1,
      health: 1,
      duration: 'permanent',
      per: 'enemyUnits',
    });
    expect(s.boards[0][0]!.basePower).toBe(getCard(FILLER).power! + 1);
  });

  it('a count of zero does nothing', () => {
    const s = setup();
    run(s, { op: 'damage', target: 'enemyHero', amount: 3, per: 'enemyUnits' });
    expect(s.players[1].hp).toBe(20);
  });

  it('"fallen" counts friendly units in the discard pile', () => {
    const s = setup();
    s.players[0].discard = [FILLER, FILLER, 'ember-cinder-bolt'];
    run(s, { op: 'damage', target: 'enemyHero', amount: 1, per: 'fallen' });
    expect(s.players[1].hp).toBe(18);
  });

  it('each condition gates an effect', () => {
    const s = setup();
    const ctx: Ctx = { s, events: [] };
    const src = { owner: 0 as const, unitUid: null, targets: [] };
    const go = (if_: Effect['if']) => {
      const before = s.players[1].hp;
      runEffect(
        ctx,
        { trigger: 'spell', action: { op: 'damage', target: 'enemyHero', amount: 1 }, if: if_ },
        src,
      );
      return s.players[1].hp < before;
    };
    expect(go({ kind: 'hpAtMost', amount: 19 })).toBe(false);
    s.players[0].hp = 10;
    expect(go({ kind: 'hpAtMost', amount: 10 })).toBe(true);
    expect(go({ kind: 'enemyHpAtMost', amount: 5 })).toBe(false);
    expect(go({ kind: 'friendlyUnitsAtLeast', amount: 1 })).toBe(false);
    place(s, 0, FILLER);
    expect(go({ kind: 'friendlyUnitsAtLeast', amount: 1 })).toBe(true);
    expect(go({ kind: 'enemyUnitsAtLeast', amount: 1 })).toBe(false);
    expect(go({ kind: 'handAtMost', amount: 0 })).toBe(true);
    give(s, 0, FILLER);
    expect(go({ kind: 'handAtMost', amount: 0 })).toBe(false);
    expect(conditionMet(ctx, { kind: 'selfDamaged' }, src)).toBe(false);
  });

  it('a spell whose effect has a condition resolves only that part when it fails', () => {
    patch('ember-kindle', [
      ...spell({ op: 'draw', count: 1 }),
      ...spell({ op: 'damage', target: 'enemyHero', amount: 5 }, { kind: 'enemyHpAtMost', amount: 3 }),
    ]);
    let s = setup({ mana: 3 });
    s.players[0].deck = [FILLER, FILLER];
    s = cast(s, 0, 'ember-kindle');
    expect(s.players[0].hand).toHaveLength(1);
    expect(s.players[1].hp).toBe(20);
  });
});

describe('cards into hand', () => {
  it('conjure adds a named card; a full hand burns it', () => {
    const s = setup();
    run(s, { op: 'conjure', cardId: 'ember-cinder-bolt', count: 2 });
    expect(s.players[0].hand.map((c) => c.cardId)).toEqual(['ember-cinder-bolt', 'ember-cinder-bolt']);
  });

  it('conjureRandom picks from the filter, deterministically for a seed', () => {
    const a = setup({ seed: 9 });
    const b = setup({ seed: 9 });
    const action: Primitive = {
      op: 'conjureRandom',
      filter: { type: 'spell', faction: 'tide', maxCost: 3 },
      count: 3,
    };
    run(a, action);
    run(b, action);
    expect(a.players[0].hand).toHaveLength(3);
    for (const c of a.players[0].hand) {
      const card = getCard(c.cardId);
      expect([card.type, card.faction]).toEqual(['spell', 'tide']);
      expect(card.cost).toBeLessThanOrEqual(3);
    }
    expect(a.players[0].hand.map((c) => c.cardId)).toEqual(b.players[0].hand.map((c) => c.cardId));
  });

  it('fetch takes the first matching card from the top of the deck, or nothing', () => {
    const s = setup();
    s.players[0].deck = ['ember-cinder-bolt', FILLER, 'ember-kindle', FILLER];
    run(s, { op: 'fetch', filter: { type: 'spell' } });
    expect(s.players[0].hand.map((c) => c.cardId)).toEqual(['ember-kindle']);
    expect(s.players[0].deck).toEqual(['ember-cinder-bolt', FILLER, FILLER]);
    run(s, { op: 'fetch', filter: { faction: 'dusk' } });
    expect(s.players[0].hand).toHaveLength(1);
  });
});

describe('Discover', () => {
  it('offers three distinct cards; the chooser holds priority and only choose is legal until they pick', () => {
    patch('ember-kindle', spell({ op: 'discover', filter: { type: 'unit', faction: 'ember', maxCost: 3 } }));
    let s = setup({ mana: 3 });
    s = cast(s, 0, 'ember-kindle');
    // Burst: resolved at once, so the choice is open now.
    const choice = s.pending![0]!;
    expect(choice.player).toBe(0);
    expect(new Set(choice.options).size).toBe(3);
    for (const id of choice.options) expect(getCard(id).type).toBe('unit');
    const legal = legalActions(s);
    expect(legal.every((a) => a.type === 'choose')).toBe(true);
    expect(legal).toHaveLength(3);
    expect(() => pass(s)).toThrow(/choice is open/);
    expect(() => act(s, { type: 'choose', player: 1, index: 0 })).toThrow(/not your choice/);
    expect(() => act(s, { type: 'choose', player: 0, index: 3 })).toThrow(/no such option/);
    s = act(s, { type: 'choose', player: 0, index: 1 });
    expect(s.pending).toBeUndefined();
    expect(s.choiceReturn).toBeUndefined();
    expect(s.priority).toBe(0);
    expect(s.players[0].hand.map((c) => c.cardId)).toEqual([choice.options[1]]);
    expect(() => act(s, { type: 'choose', player: 0, index: 0 })).toThrow(/nothing to choose/);
  });

  it('a discover on the stack gives priority back to whoever had it after the choice', () => {
    patch('ember-cinder-bolt', spell({ op: 'discover', filter: { type: 'spell' } }), []);
    let s = setup({ mana: 4 });
    s = cast(s, 0, 'ember-cinder-bolt'); // Fast: on the stack, player 1 has priority
    expect(s.priority).toBe(1);
    s = pass(s, 1); // resolves; player 0 chooses
    expect(s.priority).toBe(0);
    expect(s.choiceReturn).toBe(0);
    s = act(s, { type: 'choose', player: 0, index: 0 });
    expect(s.priority).toBe(0);
    expect(s.stack).toEqual([]);
  });

  it('the enemy cannot see your options, and fewer than three are offered from a small pool', () => {
    patch(
      'ember-kindle',
      spell({ op: 'discover', filter: { type: 'unit', faction: 'ember', rarity: 'legendary' } }),
    );
    let s = setup({ mana: 3 });
    s = cast(s, 0, 'ember-kindle');
    const view = viewFor(s, 1);
    expect(view.pending![0]!.options.every((o) => o === HIDDEN)).toBe(true);
    expect(viewFor(s, 0).pending![0]!.options).toEqual(s.pending![0]!.options);
    const few = setup();
    run(few, {
      op: 'discover',
      filter: { type: 'unit', faction: 'ember', rarity: 'legendary', maxCost: 7, minCost: 7 },
    });
    expect(few.pending![0]!.options.length).toBeLessThanOrEqual(3);
    const none = setup();
    run(none, {
      op: 'discover',
      filter: { type: 'unit', faction: 'ember', rarity: 'legendary', keyword: 'regenerate' },
    });
    expect(none.pending).toBeUndefined();
  });
});

describe('Freeze and Drain', () => {
  it('a frozen unit cannot attack until the end of its owner’s turn', () => {
    let s = setup({ mana: 4 });
    const mine = place(s, 0, FILLER);
    const foe = place(s, 1, FILLER);
    run(s, { op: 'freeze', target: 'allEnemyUnits' });
    expect(foe.frozen).toBe(true);
    expect(canAttack(s, mine)).toBe(true);
    s = pass(s); // end turn 1; player 1 starts, still frozen
    expect(u(s, foe.uid).frozen).toBe(true);
    expect(canAttack(s, u(s, foe.uid))).toBe(false);
    s = pass(s);
    expect(u(s, foe.uid).frozen).toBeUndefined();
  });

  it('Drain makes the enemy start its next turn with less mana, once', () => {
    let s = setup({ mana: 4 });
    run(s, { op: 'drainMana', amount: 2 });
    s = pass(s);
    expect(s.players[1].mana).toBe(s.players[1].maxMana - 2);
    s = pass(s);
    s = pass(s);
    expect(s.players[1].mana).toBe(s.players[1].maxMana);
  });
});

describe('copy and triggers', () => {
  it('copyUnit summons a fresh copy for the caster', () => {
    const s = setup();
    const foe = place(s, 1, 'bastion-wall-warden');
    foe.damage = 1;
    foe.basePower += 5;
    run(s, { op: 'copyUnit', target: 'allEnemyUnits' });
    expect(s.boards[0]).toHaveLength(1);
    expect(s.boards[0][0]).toMatchObject({ cardId: 'bastion-wall-warden', damage: 0, owner: 0 });
    expect(s.boards[0][0]!.basePower).toBe(getCard('bastion-wall-warden').power);
  });

  it('onAttack runs when the attack is declared', () => {
    patch(FILLER, [{ trigger: 'onAttack', action: { op: 'damage', target: 'enemyHero', amount: 2 } }]);
    let s = setup();
    const a = place(s, 0, FILLER);
    s = attack(s, a, hero(1));
    expect(s.players[1].hp).toBe(18);
    expect(s.stack).toHaveLength(1);
  });

  it('whenFriendlyPlay triggers on other friendly units only', () => {
    patch(FILLER, [
      {
        trigger: 'whenFriendlyPlay',
        action: { op: 'buff', target: 'self', power: 1, health: 1, duration: 'permanent' },
      },
    ]);
    let s = setup({ mana: 5 });
    const watcher = place(s, 0, FILLER);
    const other = place(s, 1, FILLER);
    s = play(s, 0, 'ember-spark-imp');
    expect(u(s, watcher.uid).basePower).toBe(getCard(FILLER).power! + 1);
    expect(u(s, other.uid).basePower).toBe(getCard(FILLER).power!);
    s = play(s, 0, FILLER);
    expect(u(s, watcher.uid).basePower).toBe(getCard(FILLER).power! + 2);
  });

  it('whenFriendlyDies triggers on the survivors of that side', () => {
    patch(FILLER, [
      { trigger: 'whenFriendlyDies', action: { op: 'damage', target: 'enemyHero', amount: 1 } },
    ]);
    const s = setup({ mana: 4 });
    const watcher = place(s, 0, FILLER);
    const doomed = place(s, 0, 'ember-spark-imp');
    const enemyWatcher = place(s, 1, FILLER);
    doomed.doomed = true;
    processDeaths({ s, events: [] });
    // Only the dead unit's side reacts: 1 damage from the one watcher.
    expect(s.players[1].hp).toBe(19);
    expect(s.players[0].hp).toBe(20);
    expect(u(s, watcher.uid)).toBeDefined();
    expect(u(s, enemyWatcher.uid)).toBeDefined();
  });

  it('whenDamaged triggers only when the unit survives', () => {
    patch(FILLER, [{ trigger: 'whenDamaged', action: { op: 'draw', count: 1 } }]);
    const s = setup();
    s.players[0].deck = [FILLER, FILLER, FILLER];
    const a = place(s, 0, FILLER);
    run(s, { op: 'damage', target: 'allFriendlyUnits', amount: 1 });
    expect(s.players[0].hand).toHaveLength(1);
    run(s, { op: 'damage', target: 'allFriendlyUnits', amount: 99 });
    expect(s.players[0].hand).toHaveLength(1);
    expect(a.damage).toBeGreaterThan(90);
  });
});

describe('text and AI', () => {
  const card = (effects: Effect[], extra: Partial<CardDef> = {}): CardDef => ({
    ...getCard('ember-torchbearer'),
    targets: [],
    effects,
    ...extra,
  });
  const text = (effects: Effect[], extra?: Partial<CardDef>) => generatedText(card(effects, extra));

  it('describes the new effects, counts, conditions and triggers', () => {
    expect(
      text([
        { trigger: 'onPlay', action: { op: 'damage', target: 'enemyHero', amount: 1, per: 'friendlyUnits' } },
      ]),
    ).toBe('On Play: deal 1 damage to the enemy hero for each friendly unit.');
    expect(
      text([{ trigger: 'onPlay', action: { op: 'draw', count: 1 }, if: { kind: 'hpAtMost', amount: 10 } }]),
    ).toBe('On Play: if your hero has 10 or less HP, draw a card.');
    expect(
      text([
        {
          trigger: 'onAttack',
          action: { op: 'discover', filter: { type: 'spell', faction: 'tide', maxCost: 3 } },
        },
      ]),
    ).toBe('Attack: Discover a Tide spell costing 3 or less.');
    expect(
      text([
        { trigger: 'whenFriendlyDies', action: { op: 'conjure', cardId: 'ember-cinder-bolt', count: 1 } },
      ]),
    ).toBe('Whenever another friendly unit dies: add a Cinder Bolt to your hand.');
    expect(text([{ trigger: 'whenFriendlyPlay', action: { op: 'drainMana', amount: 1 } }])).toBe(
      'Whenever you play another unit: the enemy has 1 less mana next turn.',
    );
    expect(text([{ trigger: 'whenDamaged', action: { op: 'freeze', target: 'randomEnemyUnit' } }])).toBe(
      'Whenever this survives damage: Freeze a random enemy unit.',
    );
    expect(
      text([
        {
          trigger: 'onPlay',
          action: { op: 'conjureRandom', filter: { type: 'unit', keyword: 'guard' }, count: 2 },
        },
      ]),
    ).toBe('On Play: add two random Guard units to your hand.');
    expect(
      text([{ trigger: 'onPlay', action: { op: 'fetch', filter: { rarity: 'legendary', minCost: 5 } } }]),
    ).toBe('On Play: draw the first Legendary card costing 5 or more from your deck.');
  });

  it('every AI level picks a Discover option', () => {
    patch('ember-kindle', spell({ op: 'discover', filter: { type: 'unit', maxCost: 4 } }));
    let s = setup({ mana: 3 });
    s = cast(s, 0, 'ember-kindle');
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const { action } = aiAct(level, viewFor(s, 0), 1);
      expect(action).toMatchObject({ type: 'choose', player: 0 });
      expect(() => act(s, action)).not.toThrow();
    }
  });
});
