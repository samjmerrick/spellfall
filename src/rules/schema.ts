import { z } from 'zod';

export const FACTIONS = ['ember', 'tide', 'grove', 'bastion', 'dusk'] as const;
/** Cards outside the five factions (the Spark). Tokens only. */
export const NEUTRAL = 'neutral' as const;

export const KEYWORDS = [
  'guard',
  'barrier',
  'overwhelm',
  'lifesteal',
  'quick',
  'elusive',
  'rally',
  'growth',
  'regenerate',
  'ephemeral',
] as const;

export const SPEEDS = ['burst', 'fast', 'slow'] as const;

/** What a chosen target may be. `stackItem` is a spell on the stack (for counters). */
export const TARGET_KINDS = [
  'enemyUnit',
  'friendlyUnit',
  'anyUnit',
  'enemyCharacter',
  'friendlyCharacter',
  'anyCharacter',
  'stackItem',
] as const;

export const TargetSpecSchema = z.object({
  kind: z.enum(TARGET_KINDS),
  /** Only units costing at most this much. */
  maxCost: z.number().int().min(0).optional(),
  /** Only damaged units. */
  damaged: z.boolean().optional(),
});

/** Selectors that pick units. `target`/`target2` are the card's chosen targets (if they are units). */
export const UNIT_SELECTORS = [
  'self',
  'target',
  'target2',
  'allFriendlyUnits',
  'otherFriendlyUnits',
  'allEnemyUnits',
  'allUnits',
  'otherUnits',
  'adjacentUnits',
  'randomEnemyUnit',
  'randomFriendlyUnit',
] as const;
export const HERO_SELECTORS = ['friendlyHero', 'enemyHero'] as const;

const UnitSelector = z.enum(UNIT_SELECTORS);
/** Damage and heal may hit a chosen character (unit or hero) via `target`/`target2`. */
const AnySelector = z.enum([...UNIT_SELECTORS, ...HERO_SELECTORS]);
const Keyword = z.enum(KEYWORDS);
const posInt = z.number().int().positive();

export const PrimitiveSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('damage'), target: AnySelector, amount: posInt }),
  z.object({ op: z.literal('heal'), target: AnySelector, amount: z.union([posInt, z.literal('full')]) }),
  z.object({
    op: z.literal('buff'),
    target: UnitSelector,
    power: z.number().int(),
    health: z.number().int(),
    duration: z.enum(['permanent', 'turn']),
  }),
  z.object({ op: z.literal('draw'), count: posInt }),
  z.object({ op: z.literal('summon'), cardId: z.string(), count: posInt.default(1) }),
  /** Mana usable this turn only (it may go above max mana). */
  z.object({ op: z.literal('gainMana'), amount: posInt }),
  /** Empty max-mana slots (cap 10): ramp. */
  z.object({ op: z.literal('gainMaxMana'), amount: posInt }),
  z.object({ op: z.literal('grantKeyword'), target: UnitSelector, keyword: Keyword }),
  z.object({ op: z.literal('destroy'), target: UnitSelector }),
  z.object({ op: z.literal('bounce'), target: UnitSelector }),
  z.object({ op: z.literal('silence'), target: UnitSelector }),
  /** Removes the chosen stack item (`target`) from the stack. */
  z.object({ op: z.literal('counter') }),
  /** Takes control of enemy units (needs room on your board; they cannot attack this turn unless Quick). */
  z.object({ op: z.literal('steal'), target: UnitSelector }),
  /** Raises your max mana to this much (cap 10) and refills your mana to it. */
  z.object({ op: z.literal('setMaxMana'), amount: z.number().int().min(1).max(10) }),
  /** Your hero cannot be reduced below 1 HP until the end of the turn. */
  z.object({ op: z.literal('deathWard') }),
  /** The owner takes another turn right after this one. */
  z.object({ op: z.literal('extraTurn') }),
  /** Brings back friendly units from the discard pile (most recent first, while there is room). */
  z.object({ op: z.literal('revive'), count: posInt }),
  /** Adds a copy of the spell that was just cast to your hand (whenCast / whenEnemyCast only). */
  z.object({ op: z.literal('copySpell') }),
]);

export const TRIGGERS = [
  'onPlay',
  'ongoing',
  'startOfTurn',
  'endOfTurn',
  'lastBreath',
  'spell',
  /** Units only: whenever the owner casts a spell (before it resolves). */
  'whenCast',
  /** Units only: whenever the enemy casts a spell (before it resolves). */
  'whenEnemyCast',
] as const;

export const EffectSchema = z.object({
  trigger: z.enum(TRIGGERS),
  action: PrimitiveSchema,
});

const UNIT_ONLY = new Set(['enemyUnit', 'friendlyUnit', 'anyUnit']);

export const CardSchema = z
  .object({
    id: z.string().regex(/^[a-z]+-[a-z0-9-]+$/),
    name: z.string().min(1),
    faction: z.enum([...FACTIONS, NEUTRAL]),
    type: z.enum(['unit', 'spell']),
    cost: z.number().int().min(0).max(10),
    power: z.number().int().min(0).optional(),
    health: z.number().int().min(1).optional(),
    speed: z.enum(SPEEDS).optional(),
    targets: z.array(TargetSpecSchema).max(2).default([]),
    keywords: z.array(Keyword).default([]),
    effects: z.array(EffectSchema).default([]),
    text: z.string(),
    rarity: z.enum(['common', 'uncommon', 'rare', 'legendary']),
    unlock: z.enum(['starter', 'track']),
    token: z.boolean().default(false),
    /** Overrides for the upgraded version (`<id>+`). Omitted: see `upgradeCard`. */
    upgrade: z
      .object({
        cost: z.number().int().min(0).max(10).optional(),
        power: z.number().int().min(0).optional(),
        health: z.number().int().min(1).optional(),
        keywords: z.array(Keyword).optional(),
        effects: z.array(EffectSchema).optional(),
      })
      .optional(),
  })
  .superRefine((card, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message: `${card.id}: ${message}` });
    if (card.faction === NEUTRAL && !card.token) issue('only tokens can be neutral');
    if (card.type === 'unit') {
      if (card.power === undefined || card.health === undefined) issue('units need power and health');
      if (card.speed !== undefined) issue('units have no speed');
      if (card.effects.some((e) => e.trigger === 'spell')) issue('units cannot have spell effects');
      if (card.targets.length > 0 && !card.effects.some((e) => e.trigger === 'onPlay'))
        issue('only On Play effects can use targets');
      if (card.targets.some((t) => t.kind === 'stackItem')) issue('units cannot target the stack');
    } else {
      if (card.power !== undefined || card.health !== undefined) issue('spells have no power or health');
      if (card.speed === undefined) issue('spells need a speed');
      if (card.keywords.length > 0) issue('spells have no keywords');
      if (card.effects.some((e) => e.trigger !== 'spell')) issue('spell effects must use the spell trigger');
      if (card.effects.length === 0) issue('spells need at least one effect');
    }
    const all = [...card.effects, ...(card.upgrade?.effects ?? [])];
    for (const e of all) {
      const a = e.action;
      const sel = 'target' in a ? a.target : null;
      if (sel === 'target' && card.targets.length < 1) issue('the target selector needs a target');
      if (sel === 'target2' && card.targets.length < 2) issue('the target2 selector needs two targets');
      if ((sel === 'self' || sel === 'adjacentUnits') && card.type === 'spell')
        issue(`spells have no ${sel}`);
      if (e.trigger === 'ongoing' && a.op !== 'buff') issue('ongoing effects must be buffs');
      if (
        e.trigger === 'ongoing' &&
        sel !== null &&
        !['otherFriendlyUnits', 'adjacentUnits', 'allEnemyUnits'].includes(sel)
      )
        issue('ongoing buffs apply to other friendly, adjacent or enemy units');
      if (a.op === 'counter' && card.targets[0]?.kind !== 'stackItem')
        issue('counter needs a stackItem target');
      const cast = e.trigger === 'whenCast' || e.trigger === 'whenEnemyCast';
      if (a.op === 'copySpell' && !cast) issue('copySpell needs a whenCast or whenEnemyCast trigger');
      if (a.op === 'extraTurn' && e.trigger !== 'spell' && e.trigger !== 'onPlay')
        issue('extraTurn only works as a spell or On Play effect');
      // Unit-only primitives cannot point at a chosen character that might be a hero.
      if (
        (sel === 'target' || sel === 'target2') &&
        a.op !== 'damage' &&
        a.op !== 'heal' &&
        !UNIT_ONLY.has(card.targets[sel === 'target' ? 0 : 1]?.kind ?? '')
      )
        issue(`${a.op} needs a unit target`);
    }
  });

export const CardListSchema = z.array(CardSchema);

/** Selectors usable without a source unit (match modifiers run at the start of a turn). */
const GLOBAL_SELECTORS: readonly string[] = [
  'allFriendlyUnits',
  'allEnemyUnits',
  'allUnits',
  'randomEnemyUnit',
  'randomFriendlyUnit',
  'friendlyHero',
  'enemyHero',
];

/**
 * A per-player rule for one match: hero passives, relics and boss rules are built from these.
 * `turnStart` primitives run at the start of the owner's turns (all of them, or the listed ones: 1 is the owner's first).
 */
export const MatchModifierSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('heroHp'), amount: z.number().int() }),
    z.object({ kind: z.literal('startSpellMana'), amount: posInt }),
    z.object({ kind: z.literal('startHand'), amount: posInt }),
    z.object({
      kind: z.literal('turnStart'),
      turns: z.array(z.number().int().min(1)).optional(),
      action: PrimitiveSchema,
    }),
  ])
  .superRefine((m, ctx) => {
    if (m.kind !== 'turnStart') return;
    if ('target' in m.action && !GLOBAL_SELECTORS.includes(m.action.target))
      ctx.addIssue({ code: 'custom', message: `turnStart cannot use the ${m.action.target} selector` });
    if (m.action.op === 'counter') ctx.addIssue({ code: 'custom', message: 'turnStart cannot counter' });
    if (m.action.op === 'extraTurn' || m.action.op === 'copySpell')
      ctx.addIssue({ code: 'custom', message: `turnStart cannot use ${m.action.op}` });
  });

export type CardDef = z.infer<typeof CardSchema>;
export type TargetSpec = z.infer<typeof TargetSpecSchema>;
export type TargetKind = (typeof TARGET_KINDS)[number];
export type Primitive = z.infer<typeof PrimitiveSchema>;
export type Effect = z.infer<typeof EffectSchema>;
export type Trigger = (typeof TRIGGERS)[number];
export type Keyword = (typeof KEYWORDS)[number];
export type Faction = (typeof FACTIONS)[number];
export type Speed = (typeof SPEEDS)[number];
export type UnitSelector = (typeof UNIT_SELECTORS)[number];
export type MatchModifier = z.infer<typeof MatchModifierSchema>;

export const DeckDefSchema = z.object({
  id: z.string().regex(/^pre-[a-z-]+$/),
  name: z.string().min(1),
  cover: z.string(),
  cards: z.array(z.string()),
});
export const DeckDefListSchema = z.array(DeckDefSchema);
export type DeckDef = z.infer<typeof DeckDefSchema>;
