// Bot runs: a simple policy plays a whole roguelike run through the public run API.
import type { Difficulty } from '../../src/ai/next';
import { nextInt, seedRng, type RngState } from '../../src/rules/rng';
import { getEvent } from '../../src/run/content';
import {
  removePrice,
  applyChoice,
  canChoose,
  maxHearts,
  upgradable,
  nextCols,
  runMatch,
  startRun,
  type RunChoice,
  type RunConfig,
  type RunState,
} from '../../src/run';
import { configMatch } from './rules-bot';

export interface RunRecord {
  config: RunConfig;
  choices: RunChoice[];
  final: RunState;
  matches: number;
}

/** The bot's choice for the current phase (matches are handled by the caller). */
export function botChoice(r: RunState, rng: RngState): [RunChoice, RngState] {
  const p = r.phase;
  switch (p.kind) {
    case 'map': {
      const cols = nextCols(r);
      const [i, next] = nextInt(rng, 0, cols.length - 1);
      return [{ t: 'move', col: cols[i]! }, next];
    }
    case 'reward':
      return [{ t: 'pick', index: p.cards.length > 0 ? 0 : null }, rng];
    case 'shop': {
      const i = p.stock.findIndex((s) => !s.sold && s.price <= r.gold);
      if (i >= 0) return [{ t: 'buy', index: i }, rng];
      if (!p.removed && r.gold >= removePrice(r) && r.deck.length > 8)
        return [{ t: 'removeCard', index: 0 }, rng];
      return [{ t: 'leave' }, rng];
    }
    case 'rest': {
      // Ascension 8 and up: a rest can only upgrade.
      if (r.hearts < maxHearts(r) && r.config.ascension < 8) return [{ t: 'rest' }, rng];
      const up = upgradable(r);
      return [up.length > 0 ? { t: 'upgrade', index: up[0]! } : { t: 'leave' }, rng];
    }
    case 'event': {
      if (p.chosen !== null) return [{ t: 'leave' }, rng];
      const options = getEvent(p.eventId)
        .choices.map((c, i) => ({ c, i }))
        .filter(({ c }) => canChoose(r, c.cost));
      const [i, next] = nextInt(rng, 0, options.length - 1);
      return [{ t: 'event', index: options[i]!.i }, next];
    }
    case 'actCleared': {
      if (p.factions.length === 0) return [{ t: 'nextAct', faction: null }, rng];
      const [i, next] = nextInt(rng, 0, p.factions.length - 1);
      return [{ t: 'nextAct', faction: i }, next];
    }
    case 'treasure':
      return [{ t: 'leave' }, rng];
    default:
      throw new Error(`No bot choice for ${p.kind}`);
  }
}

export function playBotRun(config: RunConfig, player: Difficulty = 'easy'): RunRecord {
  let r = startRun(config);
  let rng = seedRng((config.seed ^ 0x2545f491) >>> 0);
  const choices: RunChoice[] = [];
  let matches = 0;
  const apply = (c: RunChoice) => {
    r = applyChoice(r, c);
    choices.push(c);
  };
  for (let guard = 0; r.phase.kind !== 'over'; guard++) {
    if (guard > 500) throw new Error(`Run ${config.seed} did not end`);
    if (r.phase.kind === 'match') {
      const m = runMatch(r);
      const { state } = configMatch(m.config, [player, m.difficulty], m.seed, [{}, m.hooks]);
      matches++;
      apply({ t: 'matchEnd', won: state.result?.winner === 0 });
    } else {
      let c: RunChoice;
      [c, rng] = botChoice(r, rng);
      apply(c);
    }
  }
  return { config, choices, final: r, matches };
}
