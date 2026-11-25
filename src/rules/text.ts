// Rules text generated from a card's data. Content tests check that every card's `text` matches,
// so a card always says exactly what its effects do; upgraded cards get their text from here.
import type { CardDef, CardFilter, Condition, Effect, Keyword, Primitive, TargetSpec } from './schema';

export const KEYWORD_NAME: Record<Keyword, string> = {
  guard: 'Guard',
  barrier: 'Barrier',
  overwhelm: 'Overwhelm',
  lifesteal: 'Lifesteal',
  quick: 'Quick',
  elusive: 'Elusive',
  growth: 'Growth',
  regenerate: 'Regenerate',
  ephemeral: 'Ephemeral',
};

const TRIGGER_PREFIX: Record<Effect['trigger'], string> = {
  onPlay: 'On Play: ',
  ongoing: 'Ongoing: ',
  startOfTurn: 'Start of Turn: ',
  endOfTurn: 'End of Turn: ',
  lastBreath: 'Last Breath: ',
  spell: '',
  whenCast: 'Whenever you cast a spell: ',
  whenEnemyCast: 'Whenever the enemy casts a spell: ',
  onAttack: 'Attack: ',
  whenFriendlyPlay: 'Whenever you play another unit: ',
  whenFriendlyDies: 'Whenever another friendly unit dies: ',
  whenDamaged: 'Whenever this survives damage: ',
};

const PER_TEXT = {
  friendlyUnits: 'for each friendly unit',
  enemyUnits: 'for each enemy unit',
  handSize: 'for each card in your hand',
  enemyHandSize: 'for each card in the enemy hand',
  fallen: 'for each friendly unit that died this match',
} as const;

const FACTION_NAME = {
  ember: 'Ember',
  tide: 'Tide',
  grove: 'Grove',
  bastion: 'Bastion',
  dusk: 'Dusk',
} as const;

function describeFilter(f: CardFilter): string {
  const parts: string[] = [];
  if (f.rarity === 'legendary') parts.push('Legendary');
  if (f.keyword) parts.push(KEYWORD_NAME[f.keyword]);
  if (f.faction) parts.push(FACTION_NAME[f.faction]);
  parts.push(f.type ?? 'card');
  if (f.minCost !== undefined && f.maxCost !== undefined)
    parts.push(f.minCost === f.maxCost ? `costing ${f.minCost}` : `costing ${f.minCost} to ${f.maxCost}`);
  else if (f.maxCost !== undefined) parts.push(`costing ${f.maxCost} or less`);
  else if (f.minCost !== undefined) parts.push(`costing ${f.minCost} or more`);
  return parts.join(' ');
}

function describeCondition(c: Condition): string {
  switch (c.kind) {
    case 'hpAtMost':
      return `your hero has ${c.amount} or less HP`;
    case 'enemyHpAtMost':
      return `the enemy hero has ${c.amount} or less HP`;
    case 'friendlyUnitsAtLeast':
      return `you control ${c.amount} or more units`;
    case 'enemyUnitsAtLeast':
      return `the enemy controls ${c.amount} or more units`;
    case 'handAtMost':
      return c.amount === 0 ? 'your hand is empty' : `you have ${c.amount} or fewer cards in hand`;
    case 'selfDamaged':
      return 'this unit is damaged';
  }
}

const COUNT_WORD = ['', 'a', 'two', 'three', 'four'];

export interface TextContext {
  /** Card names and stats by id, for summoned tokens. */
  tokenName(cardId: string): { name: string; power: number; health: number };
}

function plural(name: string): string {
  if (name.endsWith('y')) return `${name.slice(0, -1)}ies`;
  return `${name}s`;
}

function stats(power: number, health: number): string {
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  if (power !== 0 && health !== 0) return `${sign(power)}/${sign(health)}`;
  if (power !== 0) return `${sign(power)} Power`;
  return `${sign(health)} Health`;
}

function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function describeSpec(spec: TargetSpec): string {
  const noun: Record<TargetSpec['kind'], string> = {
    enemyUnit: 'an enemy unit',
    friendlyUnit: 'a friendly unit',
    anyUnit: 'a unit',
    enemyCharacter: 'an enemy',
    friendlyCharacter: 'a friendly character',
    anyCharacter: 'anything',
    stackItem: 'a spell',
  };
  let s = noun[spec.kind];
  if (spec.damaged) s = s.replace(/^an? /, 'a damaged ');
  if (spec.maxCost !== undefined) s += ` costing ${spec.maxCost} or less`;
  return s;
}

/** Describes one card's effects and keywords as rules text. */
export function cardText(card: CardDef, ctx: TextContext): string {
  const named = [false, false];

  const target = (sel: string): string => {
    switch (sel) {
      case 'self':
        return 'this unit';
      case 'target':
      case 'target2': {
        const i = sel === 'target' ? 0 : 1;
        if (named[i]) return card.targets.length > 1 ? (i === 0 ? 'the first' : 'the second') : 'it';
        named[i] = true;
        const d = describeSpec(card.targets[i]!);
        return i === 1 && card.targets[0]?.kind === card.targets[1]?.kind
          ? d.replace(/^an? /, 'another ')
          : d;
      }
      case 'allFriendlyUnits':
        return 'all friendly units';
      case 'otherFriendlyUnits':
        return 'other friendly units';
      case 'allEnemyUnits':
        return 'all enemy units';
      case 'allUnits':
        return 'all units';
      case 'otherUnits':
        return 'all other units';
      case 'adjacentUnits':
        return 'adjacent units';
      case 'randomEnemyUnit':
        return 'a random enemy unit';
      case 'randomFriendlyUnit':
        return 'a random friendly unit';
      case 'friendlyHero':
        return 'your hero';
      case 'enemyHero':
        return 'the enemy hero';
    }
    throw new Error(`No text for selector ${sel}`);
  };

  const clause = (a: Primitive, trigger: Effect['trigger']): string => {
    switch (a.op) {
      case 'damage':
        return `deal ${a.amount} damage to ${target(a.target)}${a.per ? ` ${PER_TEXT[a.per]}` : ''}`;
      case 'heal':
        return a.amount === 'full'
          ? `fully heal ${target(a.target)}`
          : `heal ${target(a.target)} by ${a.amount}${a.per ? ` ${PER_TEXT[a.per]}` : ''}`;
      case 'buff':
        if (trigger === 'ongoing') return `${target(a.target)} have ${stats(a.power, a.health)}`;
        return `give ${target(a.target)} ${stats(a.power, a.health)}${a.per ? ` ${PER_TEXT[a.per]}` : ''}${a.duration === 'turn' ? ' this turn' : ''}`;
      case 'draw':
        return a.count === 1 ? 'draw a card' : `draw ${a.count} cards`;
      case 'summon': {
        const t = ctx.tokenName(a.cardId);
        const name = a.count === 1 ? t.name : plural(t.name);
        return `summon ${COUNT_WORD[a.count] ?? a.count} ${t.power}/${t.health} ${name}`;
      }
      case 'gainMana':
        return `gain ${a.amount} mana`;
      case 'gainMaxMana':
        return a.amount === 1 ? 'gain an empty mana slot' : `gain ${a.amount} empty mana slots`;
      case 'grantKeyword':
        return `give ${target(a.target)} ${KEYWORD_NAME[a.keyword]}`;
      case 'destroy':
        return `destroy ${target(a.target)}`;
      case 'bounce':
        return a.target.startsWith('all') || a.target.startsWith('other') || a.target === 'adjacentUnits'
          ? `return ${target(a.target)} to their owners' hands`
          : `return ${target(a.target)} to its owner's hand`;
      case 'silence':
        return `silence ${target(a.target)}`;
      case 'counter':
        return `counter ${target('target')}`;
      case 'steal':
        return `take control of ${target(a.target)}`;
      case 'setMaxMana':
        return `set your max mana to ${a.amount} and refill your mana`;
      case 'deathWard':
        return 'your hero cannot be reduced below 1 HP this turn';
      case 'extraTurn':
        return 'take an extra turn';
      case 'revive':
        return a.count >= 6
          ? 'revive all friendly units that died this match'
          : `revive up to ${a.count} friendly units that died this match`;
      case 'copySpell':
        return 'add a copy of that spell to your hand';
      case 'conjure': {
        const t = ctx.tokenName(a.cardId);
        return a.count === 1
          ? `add ${/^[AEIOU]/.test(t.name) ? 'an' : 'a'} ${t.name} to your hand`
          : `add ${COUNT_WORD[a.count] ?? a.count} copies of ${t.name} to your hand`;
      }
      case 'conjureRandom':
        return a.count === 1
          ? `add a random ${describeFilter(a.filter)} to your hand`
          : `add ${COUNT_WORD[a.count] ?? a.count} random ${describeFilter(a.filter)}s to your hand`;
      case 'fetch':
        return `draw the first ${describeFilter(a.filter)} from your deck`;
      case 'discover':
        return `Discover a ${describeFilter(a.filter)}`;
      case 'freeze':
        return `Freeze ${target(a.target)}`;
      case 'drainMana':
        return `the enemy has ${a.amount} less mana next turn`;
      case 'copyUnit':
        return `summon a copy of ${target(a.target)}`;
    }
  };

  const sentences = card.keywords.map((k) => `${KEYWORD_NAME[k]}.`);
  let i = 0;
  while (i < card.effects.length) {
    const trigger = card.effects[i]!.trigger;
    const cond = card.effects[i]!.if;
    const same = (e: Effect) => e.trigger === trigger && JSON.stringify(e.if) === JSON.stringify(cond);
    const parts: string[] = [];
    while (i < card.effects.length && same(card.effects[i]!)) {
      parts.push(clause(card.effects[i]!.action, trigger));
      i++;
    }
    let body = joinClauses(parts);
    if (cond) body = `if ${describeCondition(cond)}, ${body.charAt(0).toLowerCase()}${body.slice(1)}`;
    if (trigger === 'spell') body = body.charAt(0).toUpperCase() + body.slice(1);
    sentences.push(`${TRIGGER_PREFIX[trigger]}${body}.`);
  }
  return sentences.join(' ');
}
