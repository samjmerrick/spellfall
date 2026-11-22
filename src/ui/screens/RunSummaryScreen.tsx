import { getHero } from '../../run';
import { useRun } from '../runStore';
import { ScreenFrame } from './common';

export function RunSummaryScreen() {
  const run = useRun((s) => s.summary);
  const close = useRun((s) => s.closeSummary);
  if (!run || run.phase.kind !== 'over') return null;
  const { won, abandoned } = run.phase;
  const title = won ? 'Run won' : abandoned ? 'Run abandoned' : 'Run lost';
  return (
    <ScreenFrame
      title="Run summary"
      back={null}
      footer={
        <button type="button" className="primary wide" onClick={close}>
          Back to menu
        </button>
      }
    >
      <h2 className={`summary__title${won ? ' summary__title--won' : ''}`}>{title}</h2>
      <dl className="summary">
        <dt>Hero</dt>
        <dd>{getHero(run.config.heroId).name}</dd>
        <dt>Ascension</dt>
        <dd>{run.config.ascension > 0 ? run.config.ascension : 'None'}</dd>
        <dt>Nodes cleared</dt>
        <dd>{run.nodesCleared}</dd>
        <dt>Bosses beaten</dt>
        <dd>{run.bossesBeaten}</dd>
        <dt>Final deck</dt>
        <dd>{run.deck.length} cards</dd>
        <dt>Relics</dt>
        <dd>{run.relics.length}</dd>
        <dt>Seed</dt>
        <dd className="summary__seed" data-testid="run-seed">
          {run.config.seed}
        </dd>
      </dl>
    </ScreenFrame>
  );
}
