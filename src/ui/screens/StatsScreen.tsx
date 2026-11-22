import { HEROES, statsSummary } from '../../run';
import { deckChoices, useApp } from '../app';
import { ScreenFrame } from './common';

const pct = (won: number, played: number) => (played > 0 ? `${Math.round((won / played) * 100)}%` : '–');

export function StatsScreen() {
  const profile = useApp((s) => s.profile);
  const sum = statsSummary(profile);
  const names = new Map(deckChoices(profile).map((d) => [d.id, d.name]));
  const empty = sum.runsPlayed === 0 && sum.quickPlayPlayed === 0;
  return (
    <ScreenFrame title="Stats">
      {empty && (
        <p className="empty stats__empty">
          Nothing recorded yet. Win or lose, every Quick Play match and every run adds to these numbers.
        </p>
      )}

      <h2 className="label">Runs</h2>
      <dl className="summary stats__totals">
        <dt>Won / played</dt>
        <dd>
          {sum.runsWon} / {sum.runsPlayed}
        </dd>
        <dt>Best Ascension won</dt>
        <dd>{sum.bestAscension > 0 ? sum.bestAscension : 'None'}</dd>
      </dl>
      <ul className="stats__list" aria-label="Runs by hero">
        {HEROES.map((h) => {
          const rec = profile.stats.runs[h.id] ?? { played: 0, won: 0 };
          return (
            <li key={h.id} className="stats__row">
              <span className="stats__name">
                {h.name} <span className="hero-row__title">· {h.title}</span>
              </span>
              <span className="stats__value">
                {rec.won} won / {rec.played} played
              </span>
            </li>
          );
        })}
      </ul>

      <h2 className="label">Quick Play</h2>
      {sum.quickPlay.length === 0 ? (
        <p className="empty">No Quick Play matches yet.</p>
      ) : (
        <>
          <dl className="summary stats__totals">
            <dt>Won / played</dt>
            <dd>
              {sum.quickPlayWon} / {sum.quickPlayPlayed} · {pct(sum.quickPlayWon, sum.quickPlayPlayed)}
            </dd>
          </dl>
          <ul className="stats__list" aria-label="Quick Play by deck">
            {sum.quickPlay.map((q) => (
              <li key={q.deckId} className="stats__row">
                <span className="stats__name">{names.get(q.deckId) ?? 'Deleted deck'}</span>
                <span className="stats__value">
                  {q.won}/{q.played} · {pct(q.won, q.played)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </ScreenFrame>
  );
}
