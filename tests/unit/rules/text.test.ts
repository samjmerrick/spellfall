import { describe, expect, it } from 'vitest';
import { upgradeCard, type CardDef } from '../../../src/rules';
import { CardSchema, type Primitive } from '../../../src/rules/schema';
import { cardText } from '../../../src/rules/text';

const ctx = { tokenName: () => ({ name: 'Levy', power: 1, health: 1 }) };

function spell(actions: Primitive[], targets: CardDef['targets'] = []): CardDef {
  return CardSchema.parse({
    id: 'tide-x',
    name: 'X',
    faction: 'tide',
    type: 'spell',
    cost: 2,
    speed: 'fast',
    targets,
    effects: actions.map((action) => ({ trigger: 'spell', action })),
    text: '',
    rarity: 'common',
  });
}

describe('card text', () => {
  it('describes every primitive', () => {
    const t = (a: Primitive[], targets: CardDef['targets'] = []) => cardText(spell(a, targets), ctx);
    expect(t([{ op: 'gainMaxMana', amount: 1 }])).toBe('Gain an empty mana slot.');
    expect(t([{ op: 'gainMaxMana', amount: 2 }])).toBe('Gain 2 empty mana slots.');
    expect(t([{ op: 'draw', count: 2 }])).toBe('Draw 2 cards.');
    expect(t([{ op: 'summon', cardId: 'bastion-levy', count: 3 }])).toBe('Summon three 1/1 Levies.');
    expect(t([{ op: 'bounce', target: 'target' }], [{ kind: 'anyUnit' }])).toBe(
      "Return a unit to its owner's hand.",
    );
    expect(t([{ op: 'silence', target: 'target' }], [{ kind: 'enemyUnit', maxCost: 3 }])).toBe(
      'Silence an enemy unit costing 3 or less.',
    );
    expect(t([{ op: 'destroy', target: 'target' }], [{ kind: 'enemyUnit', damaged: true }])).toBe(
      'Destroy a damaged enemy unit.',
    );
    expect(t([{ op: 'counter' }], [{ kind: 'stackItem' }])).toBe('Counter a spell.');
    expect(t([{ op: 'heal', target: 'target', amount: 'full' }], [{ kind: 'anyCharacter' }])).toBe(
      'Fully heal anything.',
    );
    expect(t([{ op: 'grantKeyword', target: 'allFriendlyUnits', keyword: 'elusive' }])).toBe(
      'Give all friendly units Elusive.',
    );
    expect(t([{ op: 'buff', target: 'allUnits', power: 0, health: -1, duration: 'permanent' }])).toBe(
      'Give all units -1 Health.',
    );
    expect(
      t([
        { op: 'damage', target: 'randomEnemyUnit', amount: 1 },
        { op: 'damage', target: 'randomFriendlyUnit', amount: 1 },
      ]),
    ).toBe('Deal 1 damage to a random enemy unit and deal 1 damage to a random friendly unit.');
    expect(
      t(
        [
          { op: 'damage', target: 'target', amount: 1 },
          { op: 'damage', target: 'target2', amount: 1 },
          { op: 'damage', target: 'target', amount: 1 },
          { op: 'damage', target: 'target2', amount: 1 },
        ],
        [{ kind: 'enemyUnit' }, { kind: 'enemyUnit' }],
      ),
    ).toBe(
      'Deal 1 damage to an enemy unit, deal 1 damage to another enemy unit, deal 1 damage to the first and deal 1 damage to the second.',
    );
    expect(
      t(
        [
          { op: 'damage', target: 'target', amount: 1 },
          { op: 'heal', target: 'target', amount: 1 },
        ],
        [{ kind: 'anyUnit' }],
      ),
    ).toBe('Deal 1 damage to a unit and heal it by 1.');
  });

  it('describes unit triggers and selectors', () => {
    const unit = CardSchema.parse({
      id: 'grove-x',
      name: 'X',
      faction: 'grove',
      type: 'unit',
      cost: 2,
      power: 1,
      health: 1,
      keywords: ['growth'],
      effects: [
        { trigger: 'startOfTurn', action: { op: 'heal', target: 'self', amount: 1 } },
        { trigger: 'lastBreath', action: { op: 'summon', cardId: 'bastion-levy', count: 1 } },
        {
          trigger: 'ongoing',
          action: { op: 'buff', target: 'allEnemyUnits', power: -1, health: 0, duration: 'permanent' },
        },
        {
          trigger: 'onPlay',
          action: { op: 'buff', target: 'adjacentUnits', power: 1, health: 0, duration: 'turn' },
        },
      ],
      text: '',
      rarity: 'common',
    });
    expect(cardText(unit, ctx)).toBe(
      'Growth. Start of Turn: heal this unit by 1. Last Breath: summon a 1/1 Levy. Ongoing: all enemy units have -1 Power. On Play: give adjacent units +1 Power this turn.',
    );
  });

  it('upgrades bump negative buffs downward and leave non-amount spells 1 cheaper', () => {
    const up = upgradeCard(
      spell([{ op: 'buff', target: 'allEnemyUnits', power: -1, health: 0, duration: 'turn' }]),
    );
    expect(up.effects[0]!.action).toMatchObject({ power: -2, health: 0 });
    const cheaper = upgradeCard(spell([{ op: 'heal', target: 'friendlyHero', amount: 'full' }]));
    expect(cheaper.cost).toBe(1);
  });
});
