import { RELICS } from '../run/content';
import { MAX_ASCENSION, levelForXp, unlockedIds } from '../run/meta';
import { CURRENT_SCHEMA, ProfileSchema, type Profile } from './profile';

/**
 * migrations[n] upgrades a save from schema n to n + 1. Add one per schema bump, each with a unit
 * test that loads a stored sample save of the old version (tests/fixtures/save-v<n>.json).
 */
export const migrations: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> = {
  // v2 (M4): run stats per hero and the active run.
  1: (old) => {
    const stats = (old.stats ?? {}) as Record<string, unknown>;
    return { ...old, stats: { ...stats, runs: {} }, activeRun: null };
  },
  // v3 (M5): runs gained acts, elites and events, so a v2 run's choices no longer replay. It is dropped.
  2: (old) => ({ ...old, activeRun: null }),
  // v4 (M6): the level and unlock list follow the unlock track, Ascension gains `unlocked`, and a run
  // records its Ascension level and relic pool. A run in progress keeps replaying identically: Ascension
  // 0 and the full relic list, as relics used to be drawn from all of them.
  3: (old) => {
    const xp = typeof old.xp === 'number' ? old.xp : 0;
    const level = levelForXp(xp);
    const best = Math.min(MAX_ASCENSION, Number((old.ascension as { best?: number } | undefined)?.best ?? 0));
    const runs = Object.values(((old.stats ?? {}) as { runs?: Record<string, { won?: number }> }).runs ?? {});
    const wonARun = runs.some((r) => (r.won ?? 0) > 0);
    const run = old.activeRun as { config: Record<string, unknown> } | null | undefined;
    return {
      ...old,
      level,
      unlocks: unlockedIds(level),
      ascension: { best, unlocked: best > 0 || wonARun ? Math.min(MAX_ASCENSION, best + 1) : 0 },
      activeRun: run
        ? { ...run, config: { ...run.config, ascension: 0, relics: RELICS.map((r) => r.id) } }
        : null,
    };
  },
  // v5 (M7): Sound and Haptics settings (on), `tutorialDone` and `iosTipSeen`. Anyone who already has XP or
  // results has played, so the tutorial counts as done.
  4: (old) => {
    const stats = (old.stats ?? {}) as { quickPlay?: object; runs?: object };
    const hasStats =
      Object.keys(stats.quickPlay ?? {}).length > 0 || Object.keys(stats.runs ?? {}).length > 0;
    const xp = typeof old.xp === 'number' ? old.xp : 0;
    return {
      ...old,
      settings: { ...(old.settings as object), sound: true, haptics: true },
      tutorialDone: xp > 0 || hasStats,
      iosTipSeen: false,
    };
  },
  // v6 (Spellfall V2): the Auto-pass setting, on.
  5: (old) => ({ ...old, settings: { ...(old.settings as object), autoPass: true } }),
  // v7 (Spellfall V5): runs play on Spellfall's rules. A match in progress was a Lanefall match state, so it is
  // dropped and that node's match starts again; the run's choices still replay (the run content and RNG
  // are unchanged).
  6: (old) => {
    const run = old.activeRun as Record<string, unknown> | null | undefined;
    return { ...old, activeRun: run ? { ...run, match: null } : null };
  },
};

/** Runs migrations in order up to the current schema, then validates. Throws if the save is invalid. */
export function migrate(raw: unknown): Profile {
  if (typeof raw !== 'object' || raw === null) throw new Error('Save is not an object');
  let data = raw as Record<string, unknown>;
  let version = data.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error('Save has no valid schemaVersion');
  }
  if (version > CURRENT_SCHEMA) throw new Error(`Save is from a newer version (schema ${version})`);
  while (version < CURRENT_SCHEMA) {
    const step = migrations[version];
    if (!step) throw new Error(`No migration from schema ${version}`);
    data = { ...step(data), schemaVersion: version + 1 };
    version += 1;
  }
  return ProfileSchema.parse(data);
}
