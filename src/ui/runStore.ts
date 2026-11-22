// Roguelike run UI state. The run itself lives in the profile as seed + choices (autosaved on every
// choice); this store keeps the replayed RunState for rendering and hands matches to the match store.
import { create } from 'zustand';
import { collectibleCardIds, type GameState } from '../rules';
import {
  allRelicIds,
  applyChoice,
  recordRunResult,
  replayRun,
  runMatch,
  type RunChoice,
  type RunState,
} from '../run';
import { useApp } from './app';
import { randomSeed, urlSeed } from './settings';
import { useDuel } from './duel/store';

interface RunStore {
  run: RunState | null;
  /** The finished run, for the summary screen. */
  summary: RunState | null;
  error: string | null;

  begin(heroId: string, ascension?: number): void;
  /** Rebuilds the active run from the profile and opens it (or its match). */
  resume(): void;
  choose(choice: RunChoice): void;
  /** Starts the current node's match, or resumes the saved one. */
  playMatch(): void;
  saveMatch(game: GameState, aiRng: number): void;
  finishMatch(won: boolean): void;
  closeSummary(): void;
}

export const useRun = create<RunStore>((set, get) => {
  function finish(run: RunState) {
    const won = run.phase.kind === 'over' && run.phase.won;
    useApp.getState().update((p) => ({
      ...recordRunResult(p, run.config.heroId, run.config.ascension, won),
      activeRun: null,
    }));
    set({ run: null, summary: run });
    useApp.getState().go('runSummary');
  }

  return {
    run: null,
    summary: null,
    error: null,

    begin(heroId, ascension = 0) {
      const profile = useApp.getState().profile;
      const config = {
        seed: urlSeed() ?? randomSeed(),
        heroId,
        pool: collectibleCardIds().sort(),
        // Only levels the profile has opened can be played.
        ascension: Math.min(ascension, profile.ascension.unlocked),
        relics: allRelicIds(),
      };
      useApp.getState().update((p) => ({ ...p, activeRun: { config, choices: [], match: null } }));
      set({ run: replayRun(config, []), error: null });
      useApp.getState().go('run');
    },

    resume() {
      const active = useApp.getState().profile.activeRun;
      if (!active) return;
      try {
        const run = replayRun(active.config, active.choices);
        set({ run, error: null });
        if (run.phase.kind === 'match' && active.match?.step === run.step) get().playMatch();
        else useApp.getState().go('run');
      } catch (err) {
        // A save that no longer replays (e.g. content changed): end it rather than lock the player out.
        console.warn('Run could not be replayed', err);
        useApp.getState().update((p) => ({ ...p, activeRun: null }));
        set({ run: null, error: 'Your saved run could not be loaded, so it was ended.' });
      }
    },

    choose(choice) {
      const { run } = get();
      const active = useApp.getState().profile.activeRun;
      if (!run || !active) return;
      let next: RunState;
      try {
        next = applyChoice(run, choice);
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
        return;
      }
      if (next.phase.kind === 'over') return finish(next);
      useApp.getState().update((p) => ({
        ...p,
        activeRun: { ...active, choices: [...active.choices, choice], match: null },
      }));
      set({ run: next, error: null });
    },

    playMatch() {
      const { run } = get();
      const active = useApp.getState().profile.activeRun;
      if (!run || run.phase.kind !== 'match' || !active) return;
      const saved = active.match?.step === run.step ? active.match : null;
      void useDuel.getState().startRun(runMatch(run), saved);
    },

    saveMatch(game, aiRng) {
      const { run } = get();
      if (!run) return;
      useApp
        .getState()
        .update((p) =>
          p.activeRun ? { ...p, activeRun: { ...p.activeRun, match: { step: run.step, game, aiRng } } } : p,
        );
    },

    finishMatch(won) {
      get().choose({ t: 'matchEnd', won });
      if (get().run) useApp.getState().go('run');
    },

    closeSummary() {
      set({ summary: null });
      useApp.getState().go('menu');
    },
  };
});
