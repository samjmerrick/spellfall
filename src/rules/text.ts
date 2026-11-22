// Rules text generated from a card's data. Content tests check that every card's `text` matches,
// so a card always says exactly what its effects do; upgraded cards get their text from here.
import type { CardDef, Effect, Keyword, Primitive, TargetSpec } from './schema';

export const KEYWORD_NAME: Record<Keyword, string> = {
  guard: 'Guard',
  barrier: 'Barrier',
  overwhelm: 'Overwhelm',
  lifesteal: 'Lifesteal',
  quick: 'Quick',
  elusive: 'Elusive',
  rally: 'Rally',
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
};

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
        return `deal ${a.amount} damage to ${target(a.target)}`;
      case 'heal':
        return a.amount === 'full'
          ? `fully heal ${target(a.target)}`
          : `heal ${target(a.target)} by ${a.amount}`;
      case 'buff':
        if (trigger === 'ongoing') return `${target(a.target)} have ${stats(a.power, a.health)}`;
        return `give ${target(a.target)} ${stats(a.power, a.health)}${a.duration === 'turn' ? ' this turn' : ''}`;
      case 'draw':
        return a.count === 1 ? 'draw a card' : `draw ${a.count} cards`;
      case 'summon': {
        const t = ctx.tokenName(a.cardId);
        const name = a.count === 1 ? t.name : plural(t.name);
        return `summon ${COUNT_WORD[a.count] ?? a.count} ${t.power}/${t.health} ${name}`;
      }
      case 'gainMana':
        return `gain ${a.amount} mana this turn`;
      case 'gainMaxMana':
        return a.amount === 1 ? 'gain an empty mana slot' : `gain ${a.amount} empty mana slots`;
      case 'grantKeyword':
        return `give ${target(a.target)} ${KEYWORD_NAME[a.keyword]}`;
      case 'destroy':
        return `destroy ${target(a.target)}`;
      case 'bounce':
        return `return ${target(a.target)} to its owner's hand`;
      case 'silence':
        return `silence ${target(a.target)}`;
      case 'counter':
        return `counter ${target('target')}`;
    }
  };

  const sentences = card.keywords.map((k) => `${KEYWORD_NAME[k]}.`);
  let i = 0;
  while (i < card.effects.length) {
    const trigger = card.effects[i]!.trigger;
    const parts: string[] = [];
    while (i < card.effects.length && card.effects[i]!.trigger === trigger) {
      parts.push(clause(card.effects[i]!.action, trigger));
      i++;
    }
    let body = joinClauses(parts);
    if (trigger === 'spell') body = body.charAt(0).toUpperCase() + body.slice(1);
    sentences.push(`${TRIGGER_PREFIX[trigger]}${body}.`);
  }
  return sentences.join(' ');
}
