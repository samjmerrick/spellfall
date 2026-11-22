import { describe, expect, it } from 'vitest';
import { act } from '../../src/ai';
import { applyAction, initMatch, starterCollection, viewFor, type GameState } from '../../src/rules';
import { seedRng } from '../../src/rules/rng';
import {
  HEROES,
  RELICS,
  applyChoice,
  matchAiRng,
  replayRun,
  runMatch,
  startRun,
  starterHeroes,
  type RunChoice,
  type RunConfig,
  type RunState,
} from '../../src/run';
import { loadProfile, memoryStore, saveProfile } from '../../src/save/slots';
import { newProfile } from '../../src/save/profile';
import { botChoice, playBotRun } from '../../tools/sim/run';

const pool = [...starterCollection()];
const relics = RELICS.map((r) => r.id);
const heroes = starterHeroes();

describe('bot runs', () => {
  it('the simulator completes 500 bot runs with no errors, and each replays to the same state', () => {
    let won = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const rec = playBotRun({ seed, heroId: heroes[seed % heroes.length]!.id, pool, ascension: 0, relics });
      expect(rec.final.phase.kind).toBe('over');
      if (rec.final.phase.kind === 'over' && rec.final.phase.won) won++;
      if (seed % 25 === 0) expect(replayRun(rec.config, rec.choices)).toEqual(rec.final);
    }
    expect(won).toBeGreaterThan(0);
  }, 420_000);

  it('Ascension 10 runs complete too, and replay to the same state', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rec = playBotRun({ seed, heroId: HEROES[seed % HEROES.length]!.id, pool, ascension: 10, relics });
      expect(rec.final.phase.kind).toBe('over');
      if (seed % 20 === 0) expect(replayRun(rec.config, rec.choices)).toEqual(rec.final);
    }
  }, 120_000);
});

/** One action as the UI runs it: whoever has priority (or must mulligan) acts. */
function playAction(game: GameState, aiRng: number, r: RunState) {
  const m = runMatch(r);
  const player = game.phase === 'mulligan' ? (game.players[0].mulliganed ? 1 : 0) : game.priority;
  if (player === 0) {
    // The human's decisions are not part of the save, so their bot stream depends only on the state.
    const human = act('easy', viewFor(game, 0), seedRng(m.seed * 31 + game.turn * 97 + game.nextUid));
    return { game: applyAction(game, human.action).state, aiRng };
  }
  const ai = act(m.difficulty, viewFor(game, 1, { seeHand: m.hooks.seesHand }), aiRng);
  return { game: applyAction(game, ai.action).state, aiRng: ai.rng };
}

interface Session {
  r: RunState;
  choices: RunChoice[];
  game: GameState | null;
  aiRng: number;
  botRng: number;
}

/** Advances the run by one step: a run choice, starting a match, or one match action. */
function step(x: Session): Session {
  const { r } = x;
  if (r.phase.kind === 'match') {
    if (!x.game) {
      const m = runMatch(r);
      return { ...x, game: initMatch(m.config, m.seed), aiRng: matchAiRng(m.seed) };
    }
    if (x.game.phase !== 'over') return { ...x, ...playAction(x.game, x.aiRng, r) };
    const c: RunChoice = { t: 'matchEnd', won: x.game.result?.winner === 0 };
    return { ...x, r: applyChoice(r, c), choices: [...x.choices, c], game: null };
  }
  const [c, botRng] = botChoice(r, x.botRng);
  return { ...x, r: applyChoice(r, c), choices: [...x.choices, c], botRng };
}

async function saveAndLoad(config: RunConfig, x: Session): Promise<Session & { botRng: number }> {
  const store = memoryStore();
  const profile = newProfile();
  profile.activeRun = {
    config,
    choices: x.choices,
    match: x.game ? { step: x.choices.length, game: x.game, aiRng: x.aiRng } : null,
  };
  await saveProfile(store, profile);
  const loaded = await loadProfile(store);
  if (loaded.status !== 'ok') throw new Error('save did not load');
  const run = loaded.profile.activeRun!;
  const r = replayRun(run.config, run.choices);
  expect(run.match?.step).toBe(r.step);
  return { r, choices: run.choices, game: run.match!.game, aiRng: run.match!.aiRng, botRng: x.botRng };
}

describe('resume', () => {
  it('a run closed mid-match and resumed reaches an identical state', async () => {
    for (const seed of [3, 17, 256]) {
      const config: RunConfig = {
        seed,
        heroId: heroes[seed % heroes.length]!.id,
        pool,
        ascension: 0,
        relics,
      };
      const fresh = (): Session => ({ r: startRun(config), choices: [], game: null, aiRng: 0, botRng: 99 });

      // Uninterrupted run.
      let a = fresh();
      for (let i = 0; a.r.phase.kind !== 'over'; i++) a = step(a);

      // Same run, closed on turn 3 of its third match and resumed from the save.
      let b = fresh();
      let matchesStarted = 0;
      while (true) {
        const startsMatch = b.r.phase.kind === 'match' && !b.game;
        b = step(b);
        if (startsMatch) matchesStarted++;
        if (matchesStarted === 3 && b.game && b.game.turn === 3) break;
        if (b.r.phase.kind === 'over') throw new Error('run ended before the third match');
      }
      const midMatch = b.game;
      b = await saveAndLoad(config, b);
      expect(b.game).toEqual(midMatch);
      while (b.r.phase.kind !== 'over') b = step(b);

      expect(b.choices).toEqual(a.choices);
      expect(b.r).toEqual(a.r);
    }
  }, 60_000);
});
