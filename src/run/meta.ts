// Meta progression: Ascension and stats. Pure functions over the
// profile; the UI only calls these and shows the result.
import ascensionJson from '../content/ascension.json';
import { z } from 'zod';
import type { MatchModifier } from '../rules/schema';
import type { Profile } from '../save/profile';
import { HEROES, getHero, type EnemyDef } from './content';

export const MAX_ASCENSION = 10;

export const AscensionRuleSchema = z.object({
  id: z.string().regex(/^ascension-\d+$/),
  level: z.number().int().min(1).max(MAX_ASCENSION),
  text: z.string().min(1),
});
export type AscensionRule = z.infer<typeof AscensionRuleSchema>;

export const ASCENSION_RULES: readonly AscensionRule[] = z.array(AscensionRuleSchema).parse(ascensionJson);

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

/** Everything the stats screen shows: every hero, with zeros until played. */
export function statsSummary(profile: Profile): StatsSummary {
  const runs = HEROES.map((h) => {
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
