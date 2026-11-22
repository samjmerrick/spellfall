// Run content: heroes, relics and enemies, validated with Zod at load.
import heroesJson from '../content/heroes.json';
import relicsJson from '../content/relics.json';
import enemiesJson from '../content/enemies.json';
import eventsJson from '../content/events.json';
import { z } from 'zod';
import { getCard, type Faction } from '../rules';
import { FACTIONS, MatchModifierSchema } from '../rules/schema';

export const HeroSchema = z.object({
  id: z.string().regex(/^hero-[a-z-]+$/),
  name: z.string().min(1),
  title: z.string().min(1),
  faction: z.enum(FACTIONS),
  passive: z.string().min(1),
  modifiers: z.array(MatchModifierSchema),
  unlock: z.enum(['starter', 'track']),
  starterDeck: z.array(z.string()).length(12),
});

export const RelicSchema = z.object({
  id: z.string().regex(/^relic-[a-z-]+$/),
  name: z.string().min(1),
  text: z.string().min(1),
  modifiers: z.array(MatchModifierSchema).default([]),
  /** Run-level effects (outside matches). */
  run: z
    .object({
      fightGold: z.number().int().min(0).default(0),
      shopDiscount: z.number().int().min(0).max(90).default(0),
      cardChoices: z.number().int().min(0).max(3).default(0),
      /** Gain this many Hearts on pickup; the Heart limit rises by the same. */
      hearts: z.number().int().min(0).max(2).default(0),
    })
    .partial()
    .default({}),
});

export const EnemySchema = z.object({
  id: z.string().regex(/^(enemy|boss)-[a-z-]+$/),
  name: z.string().min(1),
  act: z.number().int().min(1).max(3),
  kind: z.enum(['fight', 'elite', 'boss']),
  difficulty: z.enum(['easy', 'normal', 'hard']),
  deck: z.array(z.string()).min(10),
  modifiers: z.array(MatchModifierSchema).default([]),
  /** The boss rule as shown to the player. */
  rule: z.string().optional(),
  /** Boss overrides for the AI: `seesHand` lets it plan from your real hand. */
  ai: z.object({ seesHand: z.boolean().optional() }).default({}),
});

const RARITY = z.enum(['common', 'uncommon', 'rare', 'legendary']);

/** What an event choice does. Card and relic outcomes are drawn with the run's RNG. */
export const EventOutcomeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('gold'), min: z.number().int().min(0), max: z.number().int().min(0) }),
  z.object({ kind: z.literal('hearts'), amount: z.number().int().positive() }),
  /** A random card from the run's card pool, of at least this rarity when the pool has one. */
  z.object({ kind: z.literal('card'), rarity: RARITY.optional() }),
  z.object({ kind: z.literal('relic') }),
  z.object({ kind: z.literal('upgrade'), count: z.number().int().positive() }),
  z.object({ kind: z.literal('remove'), count: z.number().int().positive() }),
]);

export const EventSchema = z.object({
  id: z.string().regex(/^event-[a-z-]+$/),
  name: z.string().min(1),
  text: z.string().min(1),
  choices: z
    .array(
      z.object({
        label: z.string().min(1),
        result: z.string().min(1),
        /** Paid up front; a Heart cost can never end the run (the choice needs Hearts left over). */
        cost: z
          .object({
            gold: z.number().int().positive().optional(),
            hearts: z.number().int().positive().optional(),
          })
          .default({}),
        outcomes: z.array(EventOutcomeSchema),
      }),
    )
    .min(2)
    .max(3)
    // At least one choice must always be possible, whatever the player's gold and Hearts.
    .refine((cs) => cs.some((c) => !c.cost.gold && !c.cost.hearts), 'needs a free choice'),
});

export type HeroDef = z.infer<typeof HeroSchema>;
export type RelicDef = z.infer<typeof RelicSchema>;
export type EnemyDef = z.infer<typeof EnemySchema>;
export type EventDef = z.infer<typeof EventSchema>;
export type EventOutcome = z.infer<typeof EventOutcomeSchema>;

export const HEROES: readonly HeroDef[] = z.array(HeroSchema).parse(heroesJson);
export const RELICS: readonly RelicDef[] = z.array(RelicSchema).parse(relicsJson);
export const ENEMIES: readonly EnemyDef[] = z.array(EnemySchema).parse(enemiesJson);
export const EVENTS: readonly EventDef[] = z.array(EventSchema).parse(eventsJson);

for (const h of HEROES)
  for (const id of h.starterDeck)
    if (getCard(id).faction !== h.faction) {
      throw new Error(`${h.id}: ${id} is not ${h.faction}`);
    }
for (const e of ENEMIES) for (const id of e.deck) getCard(id);

function byId<T extends { id: string }>(list: readonly T[], kind: string) {
  const map = new Map(list.map((x) => [x.id, x]));
  return (id: string): T => {
    const x = map.get(id);
    if (!x) throw new Error(`Unknown ${kind}: ${id}`);
    return x;
  };
}

export const getHero = byId(HEROES, 'hero');
export const getRelic = byId(RELICS, 'relic');
export const getEnemy = byId(ENEMIES, 'enemy');
export const getEvent = byId(EVENTS, 'event');

export function starterHeroes(): HeroDef[] {
  return HEROES.filter((h) => h.unlock === 'starter');
}

export type { Faction };
