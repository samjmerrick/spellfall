import { describe, expect, it } from 'vitest';
import cardsJson from '../../../src/content/next/cards.json';
import {
  CARDS,
  baseId,
  collectibleCards,
  generatedText,
  getCard,
  hasCard,
  isUpgraded,
  legalActions,
  upgradeCard,
  type Action,
  type CardDef,
  type GameState,
} from '../../../src/rules';
import { CardListSchema, CardSchema, MatchModifierSchema } from '../../../src/rules/schema';
import { act, FILLER, give, hero, pass, place, setup } from './helpers';

describe('content', () => {
  it('cards.json passes the schema and every text matches its data', () => {
    const parsed = CardListSchema.parse(cardsJson);
    for (const c of parsed) expect(c.text, c.id).toBe(generatedText(c));
  });

  it('has 30 collectible cards per faction, plus tokens', () => {
    for (const f of ['ember', 'tide', 'grove', 'bastion', 'dusk'])
      expect(
        collectibleCards().filter((c) => c.faction === f),
        f,
      ).toHaveLength(30);
    expect(CARDS.filter((c) => c.token).map((c) => c.id)).toEqual([
      'neutral-spark',
      'bastion-levy',
      'grove-sapling',
      'dusk-shade',
    ]);
  });

  it('follows the per-faction mana curve and spell share (spec: Balance baselines)', () => {
    for (const f of ['ember', 'tide', 'grove', 'bastion', 'dusk']) {
      const pool = collectibleCards().filter((c) => c.faction === f);
      const spells = pool.filter((c) => c.type === 'spell').length;
      expect(spells, f).toBeGreaterThanOrEqual(7);
      expect(spells, f).toBeLessThanOrEqual(13);
      expect(pool.filter((c) => c.cost >= 7).length, f).toBeLessThanOrEqual(4);
    }
  });

  it('upgraded cards exist for every collectible card', () => {
    for (const c of collectibleCards()) {
      const up = getCard(`${c.id}+`);
      expect(isUpgraded(up.id)).toBe(true);
      expect(baseId(up.id)).toBe(c.id);
      expect(up.text).toBe(generatedText(up));
    }
    expect(hasCard('nope')).toBe(false);
    expect(() => getCard('nope')).toThrow(/Unknown/);
  });

  it('upgrades: units +1 Power, spells +1 on amounts, otherwise 1 cheaper, or the card’s overrides', () => {
    expect(getCard('bastion-militia+').power).toBe(3);
    expect(getCard('ember-cinder-bolt+').text).toBe('Deal 3 damage to an enemy unit.');
    expect(getCard('bastion-call-to-arms+').cost).toBe(1);
    const custom = upgradeCard({ ...getCard('bastion-militia'), upgrade: { health: 9 } });
    expect(custom.health).toBe(9);
  });

  it('the schema rejects malformed cards', () => {
    const base = {
      id: 'ember-x',
      name: 'X',
      faction: 'ember',
      cost: 1,
      text: '',
      rarity: 'common',
      unlock: 'starter',
    };
    const bad = [
      { ...base, type: 'unit' },
      { ...base, type: 'unit', power: 1, health: 1, speed: 'fast' },
      { ...base, type: 'spell', speed: 'fast' },
      { ...base, type: 'spell', effects: [{ trigger: 'spell', action: { op: 'draw', count: 1 } }] },
      {
        ...base,
        type: 'spell',
        speed: 'fast',
        power: 1,
        effects: [{ trigger: 'spell', action: { op: 'draw', count: 1 } }],
      },
      {
        ...base,
        type: 'spell',
        speed: 'fast',
        keywords: ['guard'],
        effects: [{ trigger: 'spell', action: { op: 'draw', count: 1 } }],
      },
      {
        ...base,
        type: 'spell',
        speed: 'fast',
        effects: [{ trigger: 'onPlay', action: { op: 'draw', count: 1 } }],
      },
      {
        ...base,
        type: 'spell',
        speed: 'fast',
        effects: [{ trigger: 'spell', action: { op: 'damage', target: 'target', amount: 1 } }],
      },
      {
        ...base,
        type: 'spell',
        speed: 'fast',
        targets: [{ kind: 'enemyUnit' }],
        effects: [{ trigger: 'spell', action: { op: 'damage', target: 'target2', amount: 1 } }],
      },
      {
        ...base,
        type: 'spell',
        speed: 'fast',
        effects: [{ trigger: 'spell', action: { op: 'damage', target: 'self', amount: 1 } }],
      },
      { ...base, type: 'spell', speed: 'fast', effects: [{ trigger: 'spell', action: { op: 'counter' } }] },
      {
        ...base,
        type: 'spell',
        speed: 'fast',
        targets: [{ kind: 'enemyCharacter' }],
        effects: [{ trigger: 'spell', action: { op: 'destroy', target: 'target' } }],
      },
      {
        ...base,
        type: 'unit',
        power: 1,
        health: 1,
        effects: [{ trigger: 'spell', action: { op: 'draw', count: 1 } }],
      },
      { ...base, type: 'unit', power: 1, health: 1, targets: [{ kind: 'enemyUnit' }] },
      {
        ...base,
        type: 'unit',
        power: 1,
        health: 1,
        targets: [{ kind: 'stackItem' }],
        effects: [{ trigger: 'onPlay', action: { op: 'counter' } }],
      },
      {
        ...base,
        type: 'unit',
        power: 1,
        health: 1,
        effects: [{ trigger: 'ongoing', action: { op: 'draw', count: 1 } }],
      },
      {
        ...base,
        type: 'unit',
        power: 1,
        health: 1,
        effects: [
          {
            trigger: 'ongoing',
            action: { op: 'buff', target: 'self', power: 1, health: 0, duration: 'permanent' },
          },
        ],
      },
      { ...base, faction: 'neutral', type: 'unit', power: 1, health: 1 },
    ];
    for (const card of bad) expect(CardSchema.safeParse(card).success, JSON.stringify(card)).toBe(false);
  });

  it('match modifiers are validated', () => {
    expect(
      MatchModifierSchema.safeParse({
        kind: 'turnStart',
        action: { op: 'damage', target: 'self', amount: 1 },
      }).success,
    ).toBe(false);
    expect(MatchModifierSchema.safeParse({ kind: 'turnStart', action: { op: 'counter' } }).success).toBe(
      false,
    );
    expect(
      MatchModifierSchema.safeParse({ kind: 'turnStart', action: { op: 'draw', count: 1 } }).success,
    ).toBe(true);
  });
});

/** A board with targets of every kind, then the card played with each of its legal choices. */
function playEveryWay(card: CardDef): void {
  const fresh = (): GameState => {
    const s = setup({ mana: 10 });
    s.players[0].spellMana = 3;
    place(s, 0, FILLER);
    place(s, 0, 'bastion-militia', { damage: 1 });
    place(s, 1, FILLER);
    place(s, 1, 'ember-magma-brute', { damage: 1 });
    if (card.targets.some((t) => t.kind === 'stackItem')) {
      // Something to counter: an enemy Fast spell on the stack, with priority back to player 0.
      const uid = give(s, 1, 'bastion-rally-cry');
      const s2 = act(pass(s), { type: 'castSpell', player: 1, uid, targets: [] });
      s2.players[0].mana = 10;
      return s2;
    }
    return s;
  };
  const s = fresh();
  const uid = give(s, s.priority, card.id);
  const options = legalActions(s).filter(
    (a): a is Extract<Action, { uid: number }> => 'uid' in a && a.uid === uid,
  );
  expect(options.length, `${card.id} has no legal play`).toBeGreaterThan(0);
  for (const a of options.slice(0, 12)) {
    let r = act(s, a);
    while (r.phase === 'main' && r.stack.length > 0) r = pass(r);
    expect(r.players[0].hp + r.players[1].hp).toBeGreaterThan(0);
  }
}

describe('every card and its upgrade can be played', () => {
  for (const c of collectibleCards()) {
    it(c.id, () => {
      playEveryWay(c);
      playEveryWay(getCard(`${c.id}+`));
    });
  }
  it('the Spark gives 1 mana this turn', () => {
    const s = setup({ mana: 0 });
    const r = act(s, { type: 'castSpell', player: 0, uid: give(s, 0, 'neutral-spark'), targets: [] });
    expect(r.players[0].mana).toBe(1);
    expect(hero(0)).toEqual({ kind: 'hero', player: 0 });
  });
});

describe('art', () => {
  it('every card has its line icon in src/content/art', async () => {
    const { existsSync } = await import('node:fs');
    for (const c of CARDS) {
      if (c.faction === 'neutral') continue;
      expect(existsSync(`src/content/art/${c.id}.svg`), c.id).toBe(true);
    }
  });
});
