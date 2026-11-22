// Meta progression: account levels, the unlock track, Ascension and stats. Pure functions over the
// profile; the UI only calls these and shows the result.
import unlocksJson from '../content/unlocks.json';
import ascensionJson from '../content/ascension.json';
import { z } from 'zod';
import { CARDS, starterCollection } from '../rules';
import type { MatchModifier } from '../engine/schema';
import type { Profile } from '../save/profile';
import { HEROES, RELICS, getHero, type EnemyDef, type HeroDef } from './content';

export const MAX_LEVEL = 30;
export const MAX_ASCENSION = 10;

export const UnlockBundleSchema = z.object({
  level: z.number().int().min(2).max(MAX_LEVEL),
  kind: z.enum(['cards', 'hero', 'relics']),
  ids: z.array(z.string()).min(1),
});
export type UnlockBundle = z.infer<typeof UnlockBundleSchema>;

export const AscensionRuleSchema = z.object({
  id: z.string().regex(/^ascension-\d+$/),
  level: z.number().int().min(1).max(MAX_ASCENSION),
  text: z.string().min(1),
});
export type AscensionRule = z.infer<typeof AscensionRuleSchema>;

export const UNLOCKS: readonly UnlockBundle[] = z.array(UnlockBundleSchema).parse(unlocksJson);
export const ASCENSION_RULES: readonly AscensionRule[] = z.array(AscensionRuleSchema).parse(ascensionJson);

// Every id on the track must exist, and be locked in the content (cards and heroes say so themselves).
{
  const cardIds = new Set(CARDS.map((c) => c.id));
  const relicIds = new Set(RELICS.map((r) => r.id));
  for (const b of UNLOCKS)
    for (const id of b.ids) {
      const ok = b.kind === 'relics' ? relicIds.has(id) : cardIds.has(id) || HEROES.some((h) => h.id === id);
      if (!ok) throw new Error(`unlocks.json: unknown id ${id} at level ${b.level}`);
    }
}

const LEVEL_OF = new Map<string, number>(
  UNLOCKS.flatMap((b) => b.ids.map((id): [string, number] => [id, b.level])),
);

/** XP needed to go from `level` to the next one. */
export function xpForNext(level: number): number {
  return 100 + 50 * level;
}

/** Total XP at which `level` is reached: the sum of xpForNext(1..level-1). */
export function xpThreshold(level: number): number {
  return (level - 1) * (100 + 25 * level);
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpThreshold(level + 1)) level++;
  return level;
}

/** Progress within the current level. `needed` is 0 at the level cap. */
export function xpProgress(xp: number): { level: number; into: number; needed: number } {
  const level = levelForXp(xp);
  return {
    level,
    into: xp - xpThreshold(level),
    needed: level >= MAX_LEVEL ? 0 : xpForNext(level),
  };
}

/** Bundles unlocked by reaching `toLevel` from `fromLevel` (exclusive of from, inclusive of to). */
export function bundlesBetween(fromLevel: number, toLevel: number): UnlockBundle[] {
  return UNLOCKS.filter((b) => b.level > fromLevel && b.level <= toLevel);
}

/** All ids (cards, heroes and relics) unlocked at `level`, in track order. */
export function unlockedIds(level: number): string[] {
  return bundlesBetween(1, level).flatMap((b) => b.ids);
}

/** The level that unlocks `id`, or null for anything owned from the start. */
export function unlockLevel(id: string): number | null {
  return LEVEL_OF.get(id) ?? null;
}

type LevelSource = number | Pick<Profile, 'level'>;
const levelOf = (x: LevelSource) => (typeof x === 'number' ? x : x.level);

/** Collectible cards owned at this level: the starter collection plus unlocked cards. */
export function ownedCardIds(x: LevelSource): Set<string> {
  const owned = starterCollection();
  for (const id of unlockedIds(levelOf(x))) if (CARDS.some((c) => c.id === id)) owned.add(id);
  return owned;
}

/** Heroes the player can start a run with at this level. */
export function ownedHeroes(x: LevelSource): HeroDef[] {
  const level = levelOf(x);
  return HEROES.filter((h) => h.unlock === 'starter' || (LEVEL_OF.get(h.id) ?? Infinity) <= level);
}

/** Relics that can appear in a run: every relic not on the track, plus the unlocked ones. */
export function relicPool(x: LevelSource): string[] {
  const level = levelOf(x);
  return RELICS.map((r) => r.id).filter((id) => (LEVEL_OF.get(id) ?? 0) <= level);
}

/** A profile with its level and unlock list recomputed from `xp` (used after XP changes and in migration). */
export function withXp(profile: Profile, xp: number): Profile {
  const level = levelForXp(xp);
  return { ...profile, xp, level, unlocks: unlockedIds(level) };
}

export interface XpGrant {
  profile: Profile;
  from: number;
  to: number;
  /** Bundles unlocked by this grant, in level order (for the level-up overlay). */
  bundles: UnlockBundle[];
}

export function grantXp(profile: Profile, xp: number): XpGrant {
  const from = levelForXp(profile.xp);
  const next = withXp(profile, profile.xp + Math.max(0, Math.floor(xp)));
  return { profile: next, from, to: next.level, bundles: bundlesBetween(from, next.level) };
}

/** Ascension levels 1..level are all in force (rules are cumulative). */
export function ascensionRules(level: number): AscensionRule[] {
  return ASCENSION_RULES.filter((r) => r.level <= level);
}

export function ascensionActive(level: number, rule: number): boolean {
  return level >= rule;
}

/** Match modifiers for the enemy from the run's Ascension level (extra hero HP). */
export function ascensionEnemyModifiers(level: number, enemy: EnemyDef): MatchModifier[] {
  const hp =
    (enemy.kind === 'elite' && level >= 1 ? 2 : 0) +
    (enemy.kind === 'fight' && level >= 4 ? 3 : 0) +
    (enemy.kind === 'boss' && level >= 6 ? 5 : 0);
  return hp > 0 ? [{ kind: 'heroHp', amount: hp }] : [];
}

/**
 * Updates the profile after a run ends: results per hero, best Ascension won and the highest
 * Ascension that can be picked. A full win at the highest open level opens the next one.
 */
export function recordRunResult(profile: Profile, heroId: string, ascension: number, won: boolean): Profile {
  const prev = profile.stats.runs[heroId] ?? { played: 0, won: 0 };
  let { best, unlocked } = profile.ascension;
  if (won) {
    best = Math.max(best, ascension);
    if (ascension >= unlocked) unlocked = Math.min(ascension + 1, MAX_ASCENSION);
  }
  return {
    ...profile,
    stats: {
      ...profile.stats,
      runs: { ...profile.stats.runs, [heroId]: { played: prev.played + 1, won: prev.won + (won ? 1 : 0) } },
    },
    ascension: { best, unlocked },
  };
}

export interface StatsSummary {
  runs: { heroId: string; name: string; played: number; won: number }[];
  runsPlayed: number;
  runsWon: number;
  bestAscension: number;
  quickPlay: { deckId: string; played: number; won: number; winRate: number }[];
  quickPlayPlayed: number;
  quickPlayWon: number;
}

/** Everything the stats screen shows. Heroes not yet owned are left out unless they have results. */
export function statsSummary(profile: Profile): StatsSummary {
  const owned = new Set(ownedHeroes(profile).map((h) => h.id));
  const runs = HEROES.filter((h) => owned.has(h.id) || profile.stats.runs[h.id]).map((h) => {
    const rec = profile.stats.runs[h.id] ?? { played: 0, won: 0 };
    return { heroId: h.id, name: getHero(h.id).name, ...rec };
  });
  const quickPlay = Object.entries(profile.stats.quickPlay).map(([deckId, rec]) => ({
    deckId,
    ...rec,
    winRate: rec.played > 0 ? rec.won / rec.played : 0,
  }));
  const sum = (xs: { played: number; won: number }[], k: 'played' | 'won') =>
    xs.reduce((n, x) => n + x[k], 0);
  return {
    runs,
    runsPlayed: sum(Object.values(profile.stats.runs), 'played'),
    runsWon: sum(Object.values(profile.stats.runs), 'won'),
    bestAscension: profile.ascension.best,
    quickPlay,
    quickPlayPlayed: sum(quickPlay, 'played'),
    quickPlayWon: sum(quickPlay, 'won'),
  };
}
