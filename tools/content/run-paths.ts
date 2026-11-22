// Finds the shortest choice list from a fixed run seed to each run screen, for the e2e tests.
// Writes tests/fixtures/run-paths.json (checked by tests/unit/run-paths.test.ts). `pnpm content:paths`
import { writeFileSync } from 'node:fs';
import { starterCollection } from '../../src/rules';
import { relicPool } from '../../src/run/meta';
import { getEvent } from '../../src/run/content';
import { applyChoice, canChoose, nextCols, startRun, type RunChoice, type RunState } from '../../src/run';

const config = {
  seed: 7,
  heroId: 'hero-pyra',
  pool: [...starterCollection()].sort(),
  ascension: 0,
  relics: relicPool(1),
};

type Goal = (r: RunState, choices: RunChoice[]) => boolean;
const goals: Record<string, Goal> = {
  reward: (r) => r.phase.kind === 'reward' && r.phase.relicId === null,
  eliteReward: (r) => r.phase.kind === 'reward' && r.phase.relicId !== null,
  shop: (r) => r.phase.kind === 'shop',
  rest: (r) => r.phase.kind === 'rest',
  treasure: (r) => r.phase.kind === 'treasure',
  event: (r) => r.phase.kind === 'event' && r.phase.chosen === null,
  actCleared: (r) => r.phase.kind === 'actCleared',
  restAfterLoss: (r, c) =>
    r.phase.kind === 'rest' && r.hearts === 2 && c.some((x) => x.t === 'matchEnd' && !x.won),
};

/** Choices the search tries from each phase; `lose` makes the first match a loss. */
function options(r: RunState, lose: boolean): RunChoice[] {
  const p = r.phase;
  switch (p.kind) {
    case 'map':
      return nextCols(r).map((col) => ({ t: 'move', col }));
    case 'match':
      return [{ t: 'matchEnd', won: !lose }];
    case 'reward':
      return [{ t: 'pick', index: null }];
    case 'event': {
      if (p.chosen !== null) return [{ t: 'leave' }];
      const i = getEvent(p.eventId).choices.findIndex(
        (c) => !c.cost.gold && !c.cost.hearts && canChoose(r, c.cost),
      );
      return [{ t: 'event', index: i }];
    }
    case 'actCleared':
      return [{ t: 'nextAct', faction: 0 }];
    case 'over':
      return [];
    default:
      return [{ t: 'leave' }];
  }
}

const paths: Record<string, RunChoice[]> = {};
let frontier: { r: RunState; choices: RunChoice[] }[] = [{ r: startRun(config), choices: [] }];
for (let depth = 0; depth < 60 && Object.keys(paths).length < Object.keys(goals).length; depth++) {
  const next: typeof frontier = [];
  for (const { r, choices } of frontier) {
    const lostYet = choices.some((c) => c.t === 'matchEnd' && !c.won);
    const anyMatchYet = choices.some((c) => c.t === 'matchEnd');
    for (const lose of anyMatchYet ? [false] : [false, true]) {
      for (const c of options(r, lose && !lostYet)) {
        const r2 = applyChoice(r, c);
        const ch = [...choices, c];
        for (const [name, goal] of Object.entries(goals)) if (!paths[name] && goal(r2, ch)) paths[name] = ch;
        next.push({ r: r2, choices: ch });
      }
    }
  }
  // Keep the search small: one state per (act, row, col, phase, lost) is enough for shortest paths.
  const seen = new Set<string>();
  frontier = next.filter(({ r, choices }) => {
    const lost = choices.some((c) => c.t === 'matchEnd' && !c.won);
    const key = `${r.act}:${r.row}:${r.col}:${r.phase.kind}:${lost}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
const missing = Object.keys(goals).filter((g) => !paths[g]);
if (missing.length > 0) throw new Error(`No path to ${missing.join(', ')} for seed ${config.seed}`);
const out = new URL('../../tests/fixtures/run-paths.json', import.meta.url);
writeFileSync(out, JSON.stringify({ config, paths }) + '\n');
for (const [k, v] of Object.entries(paths)) console.log(`${k}: ${v.length} choices`);
